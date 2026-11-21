import { canDraw, findAssignment } from '../src/algorithm.js';

const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const MAX_WISHLIST = 4000;
const MAX_NAME = 80;
const IMAGE_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

function randomToken(bytes = 18) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buf)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cleanText(value, max, field) {
  const text = String(value ?? '').trim();
  if (!text) throw new HttpError(400, `Falta ${field}`);
  if (text.length > max) throw new HttpError(400, `${field} es demasiado largo`);
  return text;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'JSON no válido');
  }
}

// ---------- Organizador ----------

async function requireAdmin(env, eventId, request) {
  const key = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const event = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
  if (!event || !key || (await sha256(key)) !== event.admin_key_hash) {
    throw new HttpError(404, 'Evento no encontrado o clave incorrecta');
  }
  return event;
}

async function adminView(env, event) {
  const [families, participants, images] = await Promise.all([
    env.DB.prepare('SELECT id, name FROM families WHERE event_id = ? ORDER BY created_at, rowid').bind(event.id).all(),
    env.DB.prepare(
      'SELECT id, family_id, name, token, wishlist, wishlist_updated_at FROM participants WHERE event_id = ? ORDER BY created_at, rowid',
    )
      .bind(event.id)
      .all(),
    env.DB.prepare(
      `SELECT i.id, i.participant_id, i.url FROM images i JOIN participants p ON p.id = i.participant_id
       WHERE p.event_id = ? ORDER BY i.created_at, i.rowid`,
    )
      .bind(event.id)
      .all(),
  ]);
  return {
    id: event.id,
    name: event.name,
    drawnAt: event.drawn_at,
    families: families.results,
    // Nunca se envían las asignaciones al organizador
    participants: participants.results.map((p) => ({
      id: p.id,
      familyId: p.family_id,
      name: p.name,
      token: p.token,
      wishlist: p.wishlist,
      wishlistUpdatedAt: p.wishlist_updated_at,
      images: images.results.filter((i) => i.participant_id === p.id).map(imageOut),
    })),
  };
}

function imageOut(row) {
  return { id: row.id, src: row.url || `/api/img/${row.id}` };
}

async function createEvent(env, body) {
  const name = cleanText(body.name, MAX_NAME, 'el nombre');
  const id = newId();
  const adminKey = randomToken(24);
  await env.DB.prepare('INSERT INTO events (id, name, admin_key_hash, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, name, await sha256(adminKey), now())
    .run();
  return { id, adminKey };
}

// Pasa al servidor un evento guardado en el navegador (versión antigua), sorteo incluido.
async function importEvent(env, body) {
  const name = cleanText(body.name, MAX_NAME, 'el nombre');
  const families = Array.isArray(body.families) ? body.families : [];
  const participants = Array.isArray(body.participants) ? body.participants : [];
  const id = newId();
  const adminKey = randomToken(24);
  const ts = now();
  const famIds = new Map();
  const partIds = new Map();
  const stmts = [
    env.DB.prepare('INSERT INTO events (id, name, admin_key_hash, created_at, drawn_at) VALUES (?, ?, ?, ?, ?)').bind(
      id,
      name,
      await sha256(adminKey),
      ts,
      body.assignment && body.drawnAt ? String(body.drawnAt) : null,
    ),
  ];
  for (const f of families) {
    const fid = newId();
    famIds.set(f.id, fid);
    stmts.push(
      env.DB.prepare('INSERT INTO families (id, event_id, name, created_at) VALUES (?, ?, ?, ?)').bind(
        fid,
        id,
        cleanText(f.name, MAX_NAME, 'la familia'),
        ts,
      ),
    );
  }
  for (const p of participants) {
    const pid = newId();
    const familyId = famIds.get(p.familyId);
    if (!familyId) throw new HttpError(400, 'Participante sin familia');
    partIds.set(p.id, pid);
    const wishlist = String(p.wishlist || '').slice(0, MAX_WISHLIST);
    stmts.push(
      env.DB.prepare(
        'INSERT INTO participants (id, event_id, family_id, name, token, wishlist, wishlist_updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(pid, id, familyId, cleanText(p.name, MAX_NAME, 'el nombre'), randomToken(), wishlist, wishlist ? ts : null, ts),
    );
    for (const src of (p.images || []).slice(0, MAX_IMAGES)) {
      const img = decodeImportedImage(src);
      if (!img) continue;
      stmts.push(
        env.DB.prepare('INSERT INTO images (id, participant_id, url, mime, data, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
          newId(),
          pid,
          img.url,
          img.mime,
          img.data,
          ts,
        ),
      );
    }
  }
  if (body.assignment && typeof body.assignment === 'object') {
    for (const [giver, receiver] of Object.entries(body.assignment)) {
      if (!partIds.has(giver) || !partIds.has(receiver)) throw new HttpError(400, 'Sorteo no válido');
      stmts.push(
        env.DB.prepare('INSERT INTO assignments (event_id, giver_id, receiver_id) VALUES (?, ?, ?)').bind(
          id,
          partIds.get(giver),
          partIds.get(receiver),
        ),
      );
    }
  }
  await env.DB.batch(stmts);
  return { id, adminKey };
}

function decodeImportedImage(src) {
  if (typeof src !== 'string') return null;
  if (/^https?:\/\/\S+$/i.test(src) && src.length < 2000) return { url: src, mime: null, data: null };
  const m = /^data:(image\/(?:jpeg|webp|png));base64,([A-Za-z0-9+/=]+)$/.exec(src);
  if (!m) return null;
  const bin = atob(m[2]);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) data[i] = bin.charCodeAt(i);
  if (data.length > MAX_IMAGE_BYTES) return null;
  return { url: null, mime: m[1], data };
}

async function handleAdmin(env, request, eventId, rest) {
  const event = await requireAdmin(env, eventId, request);
  const method = request.method;
  const drawn = Boolean(event.drawn_at);

  if (rest.length === 0) {
    if (method === 'GET') return json(await adminView(env, event));
    if (method === 'PATCH') {
      const body = await readJson(request);
      await env.DB.prepare('UPDATE events SET name = ? WHERE id = ?')
        .bind(cleanText(body.name, MAX_NAME, 'el nombre'), event.id)
        .run();
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(event.id).run();
      return json({ ok: true });
    }
  }

  if (rest[0] === 'families') {
    if (drawn) throw new HttpError(409, 'El sorteo ya está hecho');
    if (method === 'POST' && rest.length === 1) {
      const body = await readJson(request);
      const id = newId();
      await env.DB.prepare('INSERT INTO families (id, event_id, name, created_at) VALUES (?, ?, ?, ?)')
        .bind(id, event.id, cleanText(body.name, MAX_NAME, 'el nombre'), now())
        .run();
      return json({ id }, 201);
    }
    if (method === 'DELETE' && rest.length === 2) {
      const used = await env.DB.prepare('SELECT 1 FROM participants WHERE family_id = ? LIMIT 1').bind(rest[1]).first();
      if (used) throw new HttpError(409, 'La familia tiene personas');
      await env.DB.prepare('DELETE FROM families WHERE id = ? AND event_id = ?').bind(rest[1], event.id).run();
      return json({ ok: true });
    }
  }

  if (rest[0] === 'participants') {
    if (drawn) throw new HttpError(409, 'El sorteo ya está hecho');
    if (method === 'POST' && rest.length === 1) {
      const body = await readJson(request);
      const family = await env.DB.prepare('SELECT id FROM families WHERE id = ? AND event_id = ?')
        .bind(String(body.familyId || ''), event.id)
        .first();
      if (!family) throw new HttpError(400, 'Familia no válida');
      const id = newId();
      await env.DB.prepare(
        'INSERT INTO participants (id, event_id, family_id, name, token, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
        .bind(id, event.id, family.id, cleanText(body.name, MAX_NAME, 'el nombre'), randomToken(), now())
        .run();
      return json({ id }, 201);
    }
    if (method === 'DELETE' && rest.length === 2) {
      await env.DB.prepare('DELETE FROM participants WHERE id = ? AND event_id = ?').bind(rest[1], event.id).run();
      return json({ ok: true });
    }
  }

  if (rest[0] === 'draw' && method === 'POST') {
    const { results } = await env.DB.prepare('SELECT id, family_id AS familyId FROM participants WHERE event_id = ?')
      .bind(event.id)
      .all();
    const check = canDraw(results);
    if (!check.ok) throw new HttpError(400, check.reason);
    const assignment = findAssignment(results);
    if (!assignment) throw new HttpError(400, 'No se encontró un sorteo válido.');
    const drawnAt = now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM assignments WHERE event_id = ?').bind(event.id),
      ...Object.entries(assignment).map(([giver, receiver]) =>
        env.DB.prepare('INSERT INTO assignments (event_id, giver_id, receiver_id) VALUES (?, ?, ?)').bind(
          event.id,
          giver,
          receiver,
        ),
      ),
      env.DB.prepare('UPDATE events SET drawn_at = ? WHERE id = ?').bind(drawnAt, event.id),
    ]);
    return json({ drawnAt });
  }

  throw new HttpError(404, 'Ruta no encontrada');
}

// ---------- Participante ----------

async function requireParticipant(env, token) {
  const me = await env.DB.prepare(
    `SELECT p.*, e.name AS event_name, e.drawn_at FROM participants p JOIN events e ON e.id = p.event_id WHERE p.token = ?`,
  )
    .bind(token)
    .first();
  if (!me) throw new HttpError(404, 'Enlace no válido');
  return me;
}

async function participantImages(env, participantId) {
  const { results } = await env.DB.prepare(
    'SELECT id, url FROM images WHERE participant_id = ? ORDER BY created_at, rowid',
  )
    .bind(participantId)
    .all();
  return results.map(imageOut);
}

async function participantView(env, me) {
  let receiver = null;
  if (me.drawn_at) {
    const row = await env.DB.prepare(
      `SELECT p.id, p.name, p.wishlist, p.wishlist_updated_at FROM assignments a
       JOIN participants p ON p.id = a.receiver_id WHERE a.giver_id = ?`,
    )
      .bind(me.id)
      .first();
    if (row) {
      receiver = {
        name: row.name,
        wishlist: row.wishlist,
        wishlistUpdatedAt: row.wishlist_updated_at,
        images: await participantImages(env, row.id),
      };
    }
  }
  return {
    eventName: me.event_name,
    drawnAt: me.drawn_at,
    me: {
      name: me.name,
      wishlist: me.wishlist,
      wishlistUpdatedAt: me.wishlist_updated_at,
      images: await participantImages(env, me.id),
    },
    receiver,
  };
}

async function touchWishlist(env, id) {
  await env.DB.prepare('UPDATE participants SET wishlist_updated_at = ? WHERE id = ?').bind(now(), id).run();
}

async function handleParticipant(env, request, token, rest) {
  const me = await requireParticipant(env, token);
  const method = request.method;

  if (rest.length === 0) {
    if (method === 'GET') return json(await participantView(env, me));
    if (method === 'PUT') {
      const body = await readJson(request);
      const wishlist = String(body.wishlist ?? '').trim();
      if (wishlist.length > MAX_WISHLIST) throw new HttpError(400, 'La lista es demasiado larga');
      await env.DB.prepare('UPDATE participants SET wishlist = ?, wishlist_updated_at = ? WHERE id = ?')
        .bind(wishlist, now(), me.id)
        .run();
      return json({ ok: true });
    }
  }

  if (rest[0] === 'images') {
    if (method === 'POST' && rest.length === 1) {
      const { count } = await env.DB.prepare('SELECT COUNT(*) AS count FROM images WHERE participant_id = ?')
        .bind(me.id)
        .first();
      if (count >= MAX_IMAGES) throw new HttpError(400, `Máximo ${MAX_IMAGES} fotos o enlaces`);
      const type = (request.headers.get('content-type') || '').split(';')[0].trim();
      const id = newId();
      if (type === 'application/json') {
        const { url } = await readJson(request);
        if (typeof url !== 'string' || !/^https?:\/\/\S+$/i.test(url) || url.length > 2000) {
          throw new HttpError(400, 'Enlace no válido');
        }
        await env.DB.prepare('INSERT INTO images (id, participant_id, url, created_at) VALUES (?, ?, ?, ?)')
          .bind(id, me.id, url, now())
          .run();
      } else if (IMAGE_TYPES.has(type)) {
        const data = new Uint8Array(await request.arrayBuffer());
        if (!data.length || data.length > MAX_IMAGE_BYTES) throw new HttpError(400, 'La foto es demasiado grande');
        await env.DB.prepare('INSERT INTO images (id, participant_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(id, me.id, type, data, now())
          .run();
      } else {
        throw new HttpError(415, 'Formato no admitido');
      }
      await touchWishlist(env, me.id);
      return json({ id, src: type === 'application/json' ? undefined : `/api/img/${id}` }, 201);
    }
    if (method === 'DELETE' && rest.length === 2) {
      await env.DB.prepare('DELETE FROM images WHERE id = ? AND participant_id = ?').bind(rest[1], me.id).run();
      await touchWishlist(env, me.id);
      return json({ ok: true });
    }
  }

  throw new HttpError(404, 'Ruta no encontrada');
}

async function serveImage(env, id) {
  const row = await env.DB.prepare('SELECT mime, data FROM images WHERE id = ? AND data IS NOT NULL').bind(id).first();
  if (!row) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: {
      'content-type': row.mime,
      // Los ids no cambian nunca: se puede cachear para siempre
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
    }
    const parts = url.pathname.split('/').filter(Boolean).slice(1).map(decodeURIComponent);
    try {
      if (parts[0] === 'events' && parts.length === 1 && request.method === 'POST') {
        return json(await createEvent(env, await readJson(request)), 201);
      }
      if (parts[0] === 'events' && parts[1] === 'import' && request.method === 'POST') {
        return json(await importEvent(env, await readJson(request)), 201);
      }
      if (parts[0] === 'admin' && parts[1]) return await handleAdmin(env, request, parts[1], parts.slice(2));
      if (parts[0] === 'p' && parts[1]) return await handleParticipant(env, request, parts[1], parts.slice(2));
      if (parts[0] === 'img' && parts[1] && request.method === 'GET') return await serveImage(env, parts[1]);
      throw new HttpError(404, 'Ruta no encontrada');
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: 'Error del servidor' }, 500);
    }
  },
};
