import { api } from './api.js';
import { clearEvent, loadEvent, saveEvent } from './storage.js';
import { decodeRevealToken, decodeWishlistToken } from './tokens.js';
import {
  MAX_IMAGES,
  copyText,
  fileToImageBlob,
  installImageFallback,
  linkify,
  renderImageGrid,
  shareLink,
} from './media.js';

const FAMILY_COLORS = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400', '#16a085', '#2c3e50', '#c2185b'];
const MY_EVENTS_KEY = 'amigo-invisible-mis-eventos';

let toastTimer = null;
let renderId = 0;

// ---------- Utilidades ----------

function $(selector, root = document) {
  return root.querySelector(selector);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function showToast(message) {
  let toast = $('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

function appUrl(hash) {
  return `${window.location.href.split('#')[0]}#${hash}`;
}

function participantUrl(token) {
  return appUrl(`/p/${token}`);
}

function adminUrl(id, key) {
  return appUrl(`/admin/${id}/${key}`);
}

function loadMyEvents() {
  try {
    return JSON.parse(localStorage.getItem(MY_EVENTS_KEY)) || [];
  } catch {
    return [];
  }
}

function rememberEvent({ id, key, name }) {
  try {
    const list = loadMyEvents().filter((e) => e.id !== id);
    list.unshift({ id, key, name });
    localStorage.setItem(MY_EVENTS_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

function forgetEvent(id) {
  try {
    localStorage.setItem(MY_EVENTS_KEY, JSON.stringify(loadMyEvents().filter((e) => e.id !== id)));
  } catch {
    /* nada */
  }
}

function errorPage(title, message) {
  return `
    <main class="page reveal-page">
      <section class="card reveal-card error">
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
        <a class="btn" href="#">Volver al inicio</a>
      </section>
    </main>
  `;
}

function loadingPage() {
  return `<main class="page reveal-page"><p class="loading">Cargando…</p></main>`;
}

function shareButtons(url, text) {
  return `
    <div class="share-actions">
      <button type="button" class="btn small primary" data-share-link="${encodeURIComponent(url)}" data-share-text="${encodeURIComponent(text)}">Compartir</button>
      <button type="button" class="btn small btn-copy" data-copy-link="${encodeURIComponent(url)}">Copiar</button>
    </div>
  `;
}

function bindShareButtons(title) {
  document.querySelectorAll('[data-copy-link]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await copyText(decodeURIComponent(btn.dataset.copyLink));
      showToast(ok ? 'Enlace copiado' : 'No se pudo copiar');
    });
  });
  document.querySelectorAll('[data-share-link]').forEach((btn) => {
    btn.addEventListener('click', () => {
      shareLink({
        title,
        text: decodeURIComponent(btn.dataset.shareText),
        url: decodeURIComponent(btn.dataset.shareLink),
      });
    });
  });
}

function wishlistBlock(person) {
  const text = person.wishlist ? `<p class="wishlist-text">${linkify(escapeHtml(person.wishlist))}</p>` : '';
  return text + renderImageGrid(person.images);
}

function hasWishlist(person) {
  return Boolean(person.wishlist?.trim() || person.images?.length);
}

// ---------- Rutas ----------

function route() {
  const hash = window.location.hash.slice(1);
  let m;
  if ((m = /^\/admin\/([^/]+)\/([^/]+)$/.exec(hash))) return { view: 'admin', id: m[1], key: m[2] };
  if ((m = /^\/p\/([^/]+)$/.exec(hash))) return { view: 'participant', token: m[1] };
  if (hash.startsWith('/reveal/')) return { view: 'legacy-reveal', token: hash.replace('/reveal/', '') };
  if (hash.startsWith('/lista/')) return { view: 'legacy-wishlist', token: hash.replace('/lista/', '') };
  return { view: 'home' };
}

async function render() {
  const current = route();
  const app = document.getElementById('app');
  const id = ++renderId;
  const isStale = () => id !== renderId;

  if (current.view === 'home') {
    app.innerHTML = renderHome();
    bindHomeEvents();
    return;
  }
  if (current.view === 'legacy-reveal') {
    app.innerHTML = renderLegacyReveal(current.token);
    return;
  }
  if (current.view === 'legacy-wishlist') {
    app.innerHTML = renderLegacyWishlist(current.token);
    return;
  }

  // Al recargar la misma vista no se muestra «Cargando…» (evita parpadeos)
  if (app.querySelector('main')?.dataset.view !== current.view) app.innerHTML = loadingPage();

  try {
    if (current.view === 'admin') {
      const data = await api.admin(current.id, current.key).get();
      if (isStale()) return;
      rememberEvent({ id: current.id, key: current.key, name: data.name });
      app.innerHTML = renderManage(data);
      bindManageEvents(data, current);
    } else if (current.view === 'participant') {
      const data = await api.participant(current.token).get();
      if (isStale()) return;
      app.innerHTML = renderParticipant(data);
      bindParticipantEvents(data, current.token);
    }
  } catch (error) {
    if (isStale()) return;
    if (error.status === 404) {
      app.innerHTML =
        current.view === 'admin'
          ? errorPage('Evento no encontrado', 'Puede que se haya borrado o que el enlace esté incompleto.')
          : errorPage('Enlace no válido', 'Este enlace está roto o el evento se ha borrado. Pide al organizador uno nuevo.');
    } else {
      app.innerHTML = errorPage('Sin conexión', 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
    }
  }
}

// ---------- Inicio ----------

function renderHome() {
  const myEvents = loadMyEvents();
  const legacy = loadEvent();
  const showLegacy = legacy && !legacy.migratedTo && legacy.participants?.length;

  return `
    <main class="page home-page" data-view="home">
      <div class="snow" aria-hidden="true"></div>
      <section class="hero card">
        <p class="eyebrow">Sorteo navideño</p>
        <h1>Amigo invisible familiar</h1>
        <p class="lead">
          Crea las familias, añade a todos y sortea para que nadie regale a alguien
          de su propia casa.
        </p>
        ${
          showLegacy
            ? `
          <div class="organizer-banner">
            <p>Tienes guardado en este navegador el evento <strong>${escapeHtml(legacy.name)}</strong> (versión anterior). Pásalo al servidor para que las listas se actualicen solas.${legacy.assignment ? ' El sorteo se mantiene.' : ''}</p>
            <button type="button" class="btn small primary" id="migrate-btn">Pasar al servidor</button>
          </div>`
            : ''
        }
        ${
          myEvents.length
            ? `
          <h2 class="section-subtitle">Mis eventos</h2>
          <ul class="list">
            ${myEvents
              .map(
                (e) => `<li><a class="event-link" href="#/admin/${escapeHtml(e.id)}/${escapeHtml(e.key)}">${escapeHtml(e.name)}<span aria-hidden="true">→</span></a></li>`,
              )
              .join('')}
          </ul>
          <div class="divider"><span>o</span></div>`
            : ''
        }
        <form id="create-form" class="stack">
          <label class="field">
            <span>Nombre del evento</span>
            <input name="eventName" value="Amigo invisible ${new Date().getFullYear()}" required maxlength="80" />
          </label>
          <button type="submit" class="btn primary">Crear nuevo sorteo</button>
        </form>
      </section>
      <section class="tips card">
        <h2>Cómo funciona</h2>
        <ol>
          <li>Crea las familias (p. ej. «Familia García», «Familia López»).</li>
          <li>Añade a cada persona con su familia.</li>
          <li>Envía a cada uno <strong>su enlace personal</strong>. Solo hace falta enviarlo una vez.</li>
          <li>Con ese enlace cada uno escribe su lista de deseos (con fotos) y la cambia cuando quiera.</li>
          <li>Sortea. El mismo enlace mostrará a cada uno a quién le regala, con su lista siempre al día.</li>
        </ol>
      </section>
    </main>
  `;
}

function bindHomeEvents() {
  $('#create-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = e.target.querySelector('button');
    button.disabled = true;
    try {
      const name = new FormData(e.target).get('eventName').trim() || 'Amigo invisible familiar';
      const { id, adminKey } = await api.createEvent(name);
      rememberEvent({ id, key: adminKey, name });
      window.location.hash = `/admin/${id}/${adminKey}`;
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  });

  $('#migrate-btn')?.addEventListener('click', async (e) => {
    const legacy = loadEvent();
    if (!legacy) return;
    e.target.disabled = true;
    try {
      const { id, adminKey } = await api.importEvent(legacy);
      rememberEvent({ id, key: adminKey, name: legacy.name });
      try {
        saveEvent({ ...legacy, migratedTo: id });
      } catch {
        clearEvent();
      }
      showToast('Evento pasado al servidor. Envía a cada uno su nuevo enlace personal.');
      window.location.hash = `/admin/${id}/${adminKey}`;
    } catch (error) {
      showToast(error.message);
      e.target.disabled = false;
    }
  });
}

// ---------- Organizador ----------

function renderManage(data) {
  const isDrawn = Boolean(data.drawnAt);
  const colorOf = (familyId) => {
    const index = data.families.findIndex((f) => f.id === familyId);
    return FAMILY_COLORS[index % FAMILY_COLORS.length];
  };
  const familyName = (familyId) => data.families.find((f) => f.id === familyId)?.name || '¿?';
  const wishlistCount = data.participants.filter(hasWishlist).length;
  const familyCount = new Set(data.participants.map((p) => p.familyId)).size;
  const canTryDraw = data.participants.length >= 2 && familyCount >= 2;

  const familyRows = data.families
    .map(
      (family, index) => `
      <li class="family-row" style="--family-color: ${FAMILY_COLORS[index % FAMILY_COLORS.length]}">
        <span class="family-dot"></span>
        <span class="family-label">${escapeHtml(family.name)}</span>
        <button type="button" class="icon-btn" data-remove-family="${family.id}" title="Eliminar familia" ${isDrawn || data.participants.some((p) => p.familyId === family.id) ? 'disabled' : ''}>×</button>
      </li>`,
    )
    .join('');

  const participantRows = data.participants
    .map(
      (person) => `
      <li class="participant-row">
        <div class="participant-info">
          <strong>${escapeHtml(person.name)}</strong>
          <span class="chip" style="--chip-color: ${colorOf(person.familyId)}">${escapeHtml(familyName(person.familyId))}</span>
          ${
            hasWishlist(person)
              ? `<div class="wishlist-preview">${wishlistBlock(person)}</div>`
              : '<p class="wishlist-preview muted">Sin lista de deseos</p>'
          }
        </div>
        <button type="button" class="icon-btn" data-remove-participant="${person.id}" title="Eliminar persona" ${isDrawn ? 'disabled' : ''}>×</button>
      </li>`,
    )
    .join('');

  const linkRows = data.participants
    .map((person) => {
      const url = participantUrl(person.token);
      const message = isDrawn
        ? `🎁 ${person.name}, este es tu enlace de «${data.name}»: ahí verás a quién le haces el regalo (¡no se lo enseñes a nadie!) y puedes cambiar tu lista de deseos.`
        : `🎁 ¡Hola ${person.name}! Este es tu enlace para «${data.name}». Escribe tu lista de deseos (puedes añadir fotos) y guárdalo: cuando hagamos el sorteo, ahí verás a quién le regalas.`;
      return `
        <li class="link-row">
          <div>
            <strong>${escapeHtml(person.name)}</strong>
            <span class="status-badge ${hasWishlist(person) ? 'done' : 'pending'}">${hasWishlist(person) ? 'Lista recibida' : 'Sin lista'}</span>
          </div>
          ${shareButtons(url, message)}
        </li>`;
    })
    .join('');

  return `
    <main class="page manage-page" data-view="admin">
      <header class="topbar">
        <div>
          <p class="eyebrow">Organizador</p>
          <h1>${escapeHtml(data.name)}</h1>
        </div>
        <div class="topbar-actions">
          <button type="button" class="btn ghost" id="admin-link-btn">Abrir en otro dispositivo</button>
          <button type="button" class="btn ghost danger-text" id="delete-btn">Borrar evento</button>
        </div>
      </header>

      <div class="grid">
        <section class="card">
          <h2>Familias</h2>
          <p class="muted">Agrupa a quienes no deben sortearse entre sí.</p>
          <ul class="list">${familyRows || '<li class="empty">Aún no hay familias.</li>'}</ul>
          <form id="family-form" class="inline-form">
            <input name="familyName" placeholder="Nombre de la familia" required maxlength="80" ${isDrawn ? 'disabled' : ''} />
            <button type="submit" class="btn" ${isDrawn ? 'disabled' : ''}>Añadir</button>
          </form>
        </section>

        <section class="card">
          <h2>Participantes</h2>
          <p class="muted">${data.participants.length} personas · <strong>${wishlistCount}</strong> con lista de deseos.</p>
          <ul class="list participant-list">${participantRows || '<li class="empty">Aún no hay participantes.</li>'}</ul>
          <form id="participant-form" class="stack compact">
            <label class="field">
              <span>Nombre</span>
              <input name="participantName" placeholder="Nombre completo" required maxlength="80" ${isDrawn ? 'disabled' : ''} />
            </label>
            <label class="field">
              <span>Familia</span>
              <select name="familyId" required ${isDrawn ? 'disabled' : ''}>
                <option value="">Elige familia</option>
                ${data.families.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('')}
              </select>
            </label>
            <button type="submit" class="btn" ${isDrawn || data.families.length === 0 ? 'disabled' : ''}>Añadir persona</button>
          </form>
        </section>

        ${
          data.participants.length
            ? `
        <section class="card span-2">
          <h2>Enlaces personales</h2>
          <p class="muted">
            Envía a cada persona <strong>su</strong> enlace, solo una vez. Con él escribe y cambia su lista de deseos,
            y después del sorteo verá a quién le regala, con la lista siempre actualizada. No hace falta reenviar nada.
          </p>
          <ul class="list link-list">${linkRows}</ul>
        </section>`
            : ''
        }

        <section class="card span-2 draw-card ${isDrawn ? 'drawn' : ''}">
          <div class="draw-header">
            <div>
              <h2>${isDrawn ? 'Sorteo hecho' : '¿Sorteamos?'}</h2>
              <p class="muted">
                ${
                  isDrawn
                    ? `Sorteado el ${formatDate(data.drawnAt)}. Nadie, ni siquiera tú, ve aquí quién regala a quién: cada uno lo ve en su enlace.`
                    : 'Cuando estén todos añadidos, sortea. El servidor hace el sorteo, así que tú tampoco sabrás a quién le toca cada uno.'
                }
              </p>
            </div>
            <div class="draw-actions">
              ${
                isDrawn
                  ? '<button type="button" class="btn secondary" id="draw-btn" data-redraw="1">Volver a sortear</button>'
                  : `<button type="button" class="btn primary" id="draw-btn" ${canTryDraw ? '' : 'disabled'}>Sortear nombres</button>`
              }
            </div>
          </div>
          ${!isDrawn && !canTryDraw ? '<p class="alert">Necesitas al menos 2 personas de 2 familias distintas.</p>' : ''}
        </section>
      </div>
    </main>
  `;
}

function bindManageEvents(data, { id, key }) {
  const admin = api.admin(id, key);
  const run = async (action, success) => {
    try {
      await action();
      if (success) showToast(success);
      await render();
    } catch (error) {
      showToast(error.message);
    }
  };

  $('#family-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get('familyName').trim();
    if (name) run(() => admin.addFamily(name));
  });

  $('#participant-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const name = form.get('participantName').trim();
    const familyId = form.get('familyId');
    if (!name || !familyId) return;
    run(async () => {
      await admin.addParticipant(name, familyId);
      try {
        sessionStorage.setItem('last-family', familyId);
      } catch {
        /* nada */
      }
    });
  });
  // Mantener la última familia elegida para añadir varias personas seguidas
  try {
    const lastFamily = sessionStorage.getItem('last-family');
    const select = $('#participant-form select');
    if (lastFamily && select && data.families.some((f) => f.id === lastFamily)) select.value = lastFamily;
  } catch {
    /* nada */
  }

  document.querySelectorAll('[data-remove-family]').forEach((btn) => {
    btn.addEventListener('click', () => run(() => admin.removeFamily(btn.dataset.removeFamily)));
  });

  document.querySelectorAll('[data-remove-participant]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const person = data.participants.find((p) => p.id === btn.dataset.removeParticipant);
      if (confirm(`¿Eliminar a ${person?.name}? Se borrará también su lista de deseos.`)) {
        run(() => admin.removeParticipant(btn.dataset.removeParticipant));
      }
    });
  });

  $('#draw-btn')?.addEventListener('click', (e) => {
    const redraw = Boolean(e.target.dataset.redraw);
    if (
      redraw &&
      !confirm('¿Volver a sortear? A quien ya haya mirado su enlace le cambiará la persona. Los enlaces siguen siendo los mismos.')
    ) {
      return;
    }
    run(() => admin.draw(), redraw ? '¡Sorteado de nuevo!' : '¡Nombres sorteados!');
  });

  $('#admin-link-btn')?.addEventListener('click', async () => {
    const ok = await copyText(adminUrl(id, key));
    showToast(ok ? 'Enlace de organizador copiado. No lo compartas: permite cambiar el evento.' : 'No se pudo copiar');
  });

  $('#delete-btn')?.addEventListener('click', () => {
    if (!confirm(`¿Borrar «${data.name}» para siempre? Los enlaces de todos dejarán de funcionar.`)) return;
    run(async () => {
      await admin.remove();
      forgetEvent(id);
      window.location.hash = '';
    }, 'Evento borrado');
  });

  bindShareButtons(data.name);
}

// ---------- Participante ----------

function renderParticipant(data) {
  const { me, receiver } = data;
  const full = me.images.length >= MAX_IMAGES;
  return `
    <main class="page reveal-page" data-view="participant">
      <div class="snow" aria-hidden="true"></div>
      <section class="card reveal-card wishlist-form-card">
        <p class="eyebrow">${escapeHtml(data.eventName)}</p>
        <h1>Hola, ${escapeHtml(me.name)}</h1>

        ${
          receiver
            ? `
          <div class="reveal-section">
            <p class="lead">El sorteo ya está hecho.</p>
            <button type="button" class="btn primary" id="reveal-btn">🎁 Ver a quién le regalo</button>
            <div id="reveal-content" class="hidden">
              <p class="lead">Eres el amigo invisible de</p>
              <p class="reveal-name">${escapeHtml(receiver.name)}</p>
              <div class="wishlist-box">
                <h2>Su lista de deseos</h2>
                ${
                  hasWishlist(receiver)
                    ? `${wishlistBlock(receiver)}
                       ${receiver.wishlistUpdatedAt ? `<p class="muted small-note">Actualizada el ${formatDate(receiver.wishlistUpdatedAt)}</p>` : ''}`
                    : '<p class="muted">Aún no ha escrito su lista. Vuelve a abrir este enlace más adelante: se actualiza sola.</p>'
                }
              </div>
              <p class="muted small-note">Guarda el secreto hasta el día del regalo.</p>
            </div>
          </div>`
            : '<p class="lead">Escribe tu lista de deseos para que quien te toque sepa qué regalarte. Guarda este enlace: cuando se haga el sorteo, aquí verás a quién le regalas.</p>'
        }

        <h2 class="section-subtitle">Mi lista de deseos</h2>
        <form id="wishlist-form" class="stack">
          <textarea name="wishlist" rows="5" maxlength="4000" aria-label="Mi lista de deseos" placeholder="Tallas, hobbies, libros, cosas que te gustan o que ya tienes… Puedes pegar enlaces de tiendas.">${escapeHtml(me.wishlist)}</textarea>
          <button type="submit" class="btn primary" id="save-wishlist" disabled>Guardado ✓</button>
        </form>

        <div class="field image-field">
          <span>Fotos o enlaces (máx. ${MAX_IMAGES}). Se guardan al momento.</span>
          <div id="image-editor">${renderImageGrid(me.images, { removable: true })}</div>
          <div class="image-actions">
            <label class="btn small secondary file-btn ${full ? 'disabled' : ''}">
              📷 Añadir foto
              <input type="file" id="add-photo" accept="image/*" multiple hidden ${full ? 'disabled' : ''} />
            </label>
            <div class="inline-form image-url-form">
              <input id="image-url" type="url" inputmode="url" placeholder="Enlace de imagen o producto" autocapitalize="off" autocorrect="off" spellcheck="false" ${full ? 'disabled' : ''} />
              <button type="button" class="btn small" id="add-image-url" ${full ? 'disabled' : ''}>Añadir</button>
            </div>
          </div>
        </div>
        <p class="muted small-note">Quien te tenga que regalar verá los cambios al momento. No hace falta enviar nada a nadie.</p>
      </section>
    </main>
  `;
}

function bindParticipantEvents(data, token) {
  const me = api.participant(token);
  const textarea = $('#wishlist-form textarea');
  const saveBtn = $('#save-wishlist');
  let savedText = data.me.wishlist;

  $('#reveal-btn')?.addEventListener('click', (e) => {
    e.target.classList.add('hidden');
    $('#reveal-content')?.classList.remove('hidden');
  });

  const markDirty = () => {
    const dirty = textarea.value.trim() !== savedText;
    saveBtn.disabled = !dirty;
    saveBtn.textContent = dirty ? 'Guardar lista' : 'Guardado ✓';
  };
  textarea.addEventListener('input', markDirty);

  // Avisar si se cierra la página sin guardar
  window.onbeforeunload = () => (textarea.isConnected && textarea.value.trim() !== savedText ? true : undefined);

  $('#wishlist-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando…';
    try {
      await me.saveWishlist(textarea.value);
      savedText = textarea.value.trim();
      showToast('Lista guardada');
    } catch (error) {
      showToast(error.message);
    }
    markDirty();
  });

  const busy = (on) => $('#image-editor')?.classList.toggle('busy', on);

  // Recarga la página sin perder lo que se esté escribiendo ni el sorteo abierto
  const refresh = async () => {
    const pending = textarea.value;
    const revealed = !$('#reveal-content')?.classList.contains('hidden');
    await render();
    const next = $('#wishlist-form textarea');
    if (next && pending !== next.value) {
      next.value = pending;
      next.dispatchEvent(new Event('input'));
    }
    if (revealed) $('#reveal-btn')?.click();
  };

  $('#add-photo')?.addEventListener('change', async (e) => {
    const files = [...(e.target.files || [])].slice(0, MAX_IMAGES - data.me.images.length);
    e.target.value = '';
    if (!files.length) return;
    busy(true);
    showToast(files.length > 1 ? `Subiendo ${files.length} fotos…` : 'Subiendo foto…');
    let uploaded = 0;
    for (const file of files) {
      try {
        await me.uploadImage(await fileToImageBlob(file));
        uploaded += 1;
      } catch (error) {
        showToast(error.message || 'No se pudo subir la foto');
      }
    }
    await refresh();
    if (uploaded) showToast(uploaded > 1 ? 'Fotos guardadas' : 'Foto guardada');
  });

  const addUrl = async () => {
    const input = $('#image-url');
    const value = input?.value.trim();
    if (!value) return;
    if (!/^https?:\/\/\S+$/i.test(value)) {
      showToast('Pega un enlace que empiece por https://');
      return;
    }
    try {
      busy(true);
      await me.addLink(value);
      await refresh();
      showToast('Enlace añadido');
    } catch (error) {
      busy(false);
      showToast(error.message);
    }
  };
  $('#add-image-url')?.addEventListener('click', addUrl);
  $('#image-url')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addUrl();
    }
  });

  $('#image-editor')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-remove-image]');
    if (!btn) return;
    e.preventDefault();
    try {
      busy(true);
      await me.removeImage(btn.dataset.removeImage);
      await refresh();
    } catch (error) {
      busy(false);
      showToast(error.message);
    }
  });
}

// ---------- Enlaces de la versión anterior ----------

function renderLegacyReveal(token) {
  const data = decodeRevealToken(token);
  if (!data) return errorPage('Enlace no válido', 'Este enlace está roto. Pide al organizador uno nuevo.');
  return `
    <main class="page reveal-page">
      <div class="snow" aria-hidden="true"></div>
      <section class="card reveal-card">
        <p class="eyebrow">${escapeHtml(data.eventName)}</p>
        <h1>¡Ho ho ho, ${escapeHtml(data.giverName)}!</h1>
        <p class="lead">Eres el amigo invisible de</p>
        <p class="reveal-name">${escapeHtml(data.receiverName)}</p>
        ${
          hasWishlist(data)
            ? `<div class="wishlist-box"><h2>Su lista de deseos</h2>${wishlistBlock(data)}</div>`
            : '<p class="muted">Aún no ha compartido lista de deseos — toca investigar un poco.</p>'
        }
        <p class="muted small-note">Este enlace es de la versión anterior y la lista puede no estar al día. Pide al organizador tu nuevo enlace personal.</p>
      </section>
    </main>
  `;
}

function renderLegacyWishlist(token) {
  const data = decodeWishlistToken(token);
  if (!data) return errorPage('Enlace no válido', 'Este enlace está roto. Pide al organizador uno nuevo.');
  return `
    <main class="page reveal-page">
      <section class="card reveal-card wishlist-form-card">
        <p class="eyebrow">${escapeHtml(data.eventName)}</p>
        <h1>Hola, ${escapeHtml(data.participantName)}</h1>
        <p class="lead">Este enlace es de la versión anterior. Pide al organizador tu <strong>nuevo enlace personal</strong>: con él tu lista se guarda sola.</p>
        ${hasWishlist(data) ? `<div class="wishlist-box"><h2>Lo que habías escrito</h2>${wishlistBlock(data)}</div>` : ''}
      </section>
    </main>
  `;
}

installImageFallback();
window.addEventListener('hashchange', () => {
  window.onbeforeunload = null;
  render();
});
render();
