import { canDraw, findAssignment } from './algorithm.js';
import {
  clearEvent,
  createEmptyEvent,
  createId,
  loadEvent,
  saveEvent,
} from './storage.js';
import {
  buildRevealUrl,
  buildWishlistUrl,
  decodeRevealToken,
  decodeWishlistToken,
  encodeRevealToken,
  encodeWishlistToken,
  extractTokenFromUrl,
} from './tokens.js';
import {
  MAX_IMAGES,
  copyText,
  fileToThumbnail,
  installImageFallback,
  linkify,
  renderImageGrid,
  shareLink,
} from './media.js';

const FAMILY_COLORS = [
  '#c0392b',
  '#2980b9',
  '#27ae60',
  '#8e44ad',
  '#d35400',
  '#16a085',
  '#2c3e50',
  '#c2185b',
];

let event = loadEvent();
let toastTimer = null;

function $(selector, root = document) {
  return root.querySelector(selector);
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
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

function openImportSheet() {
  const sheet = $('#import-sheet');
  const input = $('#import-url-input');
  if (!sheet || !input) return;
  sheet.classList.remove('hidden');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('sheet-open');
  input.value = '';
  requestAnimationFrame(() => input.focus());
}

function closeImportSheet() {
  const sheet = $('#import-sheet');
  if (!sheet) return;
  sheet.classList.add('hidden');
  sheet.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('sheet-open');
}

function familyColor(familyId) {
  const index = event.families.findIndex((f) => f.id === familyId);
  return FAMILY_COLORS[index % FAMILY_COLORS.length];
}

function familyName(familyId) {
  return event.families.find((f) => f.id === familyId)?.name || 'Desconocida';
}

function hasWishlist(person) {
  return Boolean(person.wishlist?.trim() || person.images?.length);
}

function shareButtons(url, text) {
  return `
    <div class="share-actions">
      <button type="button" class="btn small primary" data-share-link="${encodeURIComponent(url)}" data-share-text="${encodeURIComponent(text)}">Compartir</button>
      <button type="button" class="btn small btn-copy" data-copy-link="${encodeURIComponent(url)}">Copiar</button>
    </div>
  `;
}

function persist() {
  saveEvent(event);
  render();
}

function route() {
  const hash = window.location.hash.slice(1);
  if (hash.startsWith('/reveal/')) {
    return { view: 'reveal', token: hash.replace('/reveal/', '') };
  }
  if (hash.startsWith('/lista/')) {
    return { view: 'wishlist', token: hash.replace('/lista/', '') };
  }
  if (event) return { view: 'manage' };
  return { view: 'home' };
}

function renderHome() {
  return `
    <main class="page home-page">
      <div class="snow" aria-hidden="true"></div>
      <section class="hero card">
        <p class="eyebrow">Sorteo navideño</p>
        <h1>Amigo invisible familiar</h1>
        <p class="lead">
          Crea las familias, añade a todos y sortea para que nadie regale a alguien
          de su propia casa.
        </p>
        <form id="create-form" class="stack">
          <label class="field">
            <span>Nombre del evento</span>
            <input name="eventName" value="Amigo invisible ${new Date().getFullYear()}" required />
          </label>
          <button type="submit" class="btn primary">Crear nuevo sorteo</button>
        </form>
        <div class="divider"><span>o</span></div>
        <label class="btn secondary file-btn">
          Importar evento guardado
          <input type="file" id="import-file" accept="application/json" hidden />
        </label>
      </section>
      <section class="tips card">
        <h2>Cómo funciona</h2>
        <ol>
          <li>Crea las familias (p. ej. «Familia García», «Familia López»).</li>
          <li>Añade a cada persona con su familia.</li>
          <li>Envía a cada uno su enlace para que escriba su lista de deseos (se puede actualizar después).</li>
          <li>Cuando todos hayan respondido, sortea los nombres.</li>
          <li>Comparte el enlace privado de cada uno para que vea a quién le toca.</li>
        </ol>
      </section>
    </main>
  `;
}

function renderManage() {
  const drawCheck = canDraw(event.participants);
  const isDrawn = Boolean(event.assignment);
  const wishlistCount = event.participants.filter(hasWishlist).length;

  const familyRows = event.families
    .map(
      (family, index) => `
      <li class="family-row" style="--family-color: ${FAMILY_COLORS[index % FAMILY_COLORS.length]}">
        <span class="family-dot"></span>
        <span class="family-label">${escapeHtml(family.name)}</span>
        <button type="button" class="icon-btn" data-remove-family="${family.id}" title="Eliminar familia" ${event.participants.some((p) => p.familyId === family.id) ? 'disabled' : ''}>×</button>
      </li>
    `,
    )
    .join('');

  const participantRows = event.participants
    .map(
      (person) => `
      <li class="participant-row">
        <div class="participant-info">
          <strong>${escapeHtml(person.name)}</strong>
          <span class="chip" style="--chip-color: ${familyColor(person.familyId)}">${escapeHtml(familyName(person.familyId))}</span>
          ${
            hasWishlist(person)
              ? `${person.wishlist ? `<p class="wishlist-preview">${linkify(escapeHtml(person.wishlist))}</p>` : ''}${renderImageGrid(person.images)}`
              : `<p class="wishlist-preview muted">Sin lista de deseos</p>`
          }
        </div>
        <button type="button" class="icon-btn" data-remove-participant="${person.id}" title="Eliminar persona" ${isDrawn ? 'disabled' : ''}>×</button>
      </li>
    `,
    )
    .join('');

  const wishlistLinkRows =
    event.participants.length > 0
      ? event.participants
          .map((person) => {
            const token = encodeWishlistToken({
              eventName: event.name,
              participantId: person.id,
              participantName: person.name,
              wishlist: person.wishlist || '',
              images: person.images,
            });
            const url = buildWishlistUrl(token);
            const hasList = hasWishlist(person);
            const message = hasList
              ? `🎁 ${person.name}, aquí puedes revisar o cambiar tu lista de deseos para «${event.name}»:`
              : `🎁 ¡Hola ${person.name}! Escribe aquí tu lista de deseos para «${event.name}» (puedes añadir fotos):`;
            return `
          <li class="link-row">
            <div>
              <strong>${escapeHtml(person.name)}</strong>
              <span class="status-badge ${hasList ? 'done' : 'pending'}">${hasList ? 'Lista recibida' : 'Pendiente'}</span>
            </div>
            ${shareButtons(url, message)}
          </li>
        `;
          })
          .join('')
      : '';

  const revealLinkRows = isDrawn
    ? event.participants
        .map((giver) => {
          const receiverId = event.assignment[giver.id];
          const receiver = event.participants.find((p) => p.id === receiverId);
          const token = encodeRevealToken({
            eventName: event.name,
            giverName: giver.name,
            receiverName: receiver.name,
            wishlist: receiver.wishlist,
            images: receiver.images,
          });
          const url = buildRevealUrl(token);
          const message = `🤫 ${giver.name}, abre este enlace para descubrir a quién le haces el regalo en «${event.name}». ¡No se lo enseñes a nadie!`;
          return `
          <li class="link-row">
            <div>
              <strong>${escapeHtml(giver.name)}</strong>
            </div>
            ${shareButtons(url, message)}
          </li>
        `;
        })
        .join('')
    : '';

  return `
    <main class="page manage-page">
      <header class="topbar">
        <div>
          <p class="eyebrow">Organizador</p>
          <h1>${escapeHtml(event.name)}</h1>
        </div>
        <div class="topbar-actions">
          <button type="button" class="btn ghost" id="export-btn">Exportar</button>
          <button type="button" class="btn ghost danger-text" id="reset-btn">Empezar de cero</button>
        </div>
      </header>

      <div class="grid">
        <section class="card">
          <h2>Familias</h2>
          <p class="muted">Agrupa a quienes no deben sortearse entre sí.</p>
          <ul class="list">${familyRows || '<li class="empty">Aún no hay familias.</li>'}</ul>
          <form id="family-form" class="inline-form">
            <input name="familyName" placeholder="Nombre de la familia" required ${isDrawn ? 'disabled' : ''} />
            <button type="submit" class="btn" ${isDrawn ? 'disabled' : ''}>Añadir</button>
          </form>
        </section>

        <section class="card">
          <h2>Participantes</h2>
          <p class="muted">${event.participants.length} personas añadidas.</p>
          <ul class="list participant-list">${participantRows || '<li class="empty">Aún no hay participantes.</li>'}</ul>
          <form id="participant-form" class="stack compact">
            <label class="field">
              <span>Nombre</span>
              <input name="participantName" placeholder="Nombre completo" required ${isDrawn ? 'disabled' : ''} />
            </label>
            <label class="field">
              <span>Familia</span>
              <select name="familyId" required ${isDrawn ? 'disabled' : ''}>
                <option value="">Elige familia</option>
                ${event.families.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('')}
              </select>
            </label>
            <button type="submit" class="btn" ${isDrawn || event.families.length === 0 ? 'disabled' : ''}>Añadir persona</button>
          </form>
        </section>

        ${
          event.participants.length > 0
            ? `
        <section class="card span-2">
          <h2>Listas de deseos</h2>
          <p class="muted">
            ${
              isDrawn
                ? `Se pueden actualizar <strong>después del sorteo</strong>. Si alguien cambia la suya, importa el enlace nuevo y vuelve a copiar y reenviar <strong>todos</strong> los enlaces de revelación (así cada regalador recibe la lista actualizada sin que veas el sorteo).`
                : `Pulsa «Compartir» para enviar a cada persona su enlace (por WhatsApp o lo que uséis). Escriben su lista, pueden añadir fotos, y te devuelven el enlace. Si lo abres en este mismo dispositivo se importa con un toque; si no, usa «Importar lista».`
            }
            <strong>${wishlistCount}/${event.participants.length}</strong> listas recibidas.
          </p>
          <ul class="list link-list">${wishlistLinkRows}</ul>
          <div class="import-row">
            <button type="button" class="btn secondary" id="import-wishlist-btn">Importar lista desde enlace</button>
          </div>
        </section>
        `
            : ''
        }

        <section class="card span-2 draw-card ${isDrawn ? 'drawn' : ''}">
          <div class="draw-header">
            <div>
              <h2>${isDrawn ? 'Sorteo hecho' : 'Paso 3 · ¿Sorteamos?'}</h2>
              <p class="muted">
                ${
                  isDrawn
                    ? `Sorteado el ${new Date(event.drawnAt).toLocaleString('es-ES')}`
                    : 'Cuando todos estén añadidos (y las listas, si quieres), sortea. Puedes repetir el sorteo hasta que compartas los enlaces.'
                }
              </p>
            </div>
            <div class="draw-actions">
              ${
                isDrawn
                  ? `<button type="button" class="btn secondary" id="redraw-btn">Volver a sortear</button>`
                  : `<button type="button" class="btn primary" id="draw-btn" ${drawCheck.ok ? '' : 'disabled'}>Sortear nombres</button>`
              }
            </div>
          </div>
          ${!drawCheck.ok ? `<p class="alert">${escapeHtml(drawCheck.reason)}</p>` : ''}
          ${
            isDrawn
              ? `
            <h3 class="section-subtitle">Enlaces de revelación</h3>
            <ul class="list link-list">${revealLinkRows}</ul>
            <p class="muted small-note">Aquí no se muestra a quién le toca cada uno. Copia el enlace de cada persona y envíalo solo a ella. Para ver tu propio resultado, usa tu enlace como cualquier otro participante. Si alguien actualiza su lista de deseos, importa el cambio y reenvía todos los enlaces de revelación.</p>
          `
              : ''
          }
        </section>
      </div>

      <div class="sheet-overlay hidden" id="import-sheet" aria-hidden="true">
        <div class="sheet" role="dialog" aria-labelledby="import-sheet-title">
          <div class="sheet-handle" aria-hidden="true"></div>
          <h3 id="import-sheet-title">Importar lista de deseos</h3>
          <p class="muted">Pega el enlace (o el mensaje entero) que te ha enviado la persona.</p>
          <textarea
            id="import-url-input"
            rows="4"
            placeholder="https://…"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
          ></textarea>
          <button type="button" class="btn small secondary paste-btn" id="import-paste">📋 Pegar del portapapeles</button>
          <div class="sheet-actions">
            <button type="button" class="btn ghost" id="import-cancel">Cancelar</button>
            <button type="button" class="btn primary" id="import-submit">Importar</button>
          </div>
        </div>
      </div>
    </main>
  `;
}

function renderWishlist(token) {
  const data = decodeWishlistToken(token);
  if (!data) {
    return `
      <main class="page reveal-page">
        <section class="card reveal-card error">
          <h1>Enlace no válido</h1>
          <p>Este enlace está roto o caducado. Pide al organizador que te envíe uno nuevo.</p>
          <a class="btn" href="#">Volver al inicio</a>
        </section>
      </main>
    `;
  }

  const saved = Boolean(data.wishlist?.trim() || data.images.length);
  const organizerPerson = event?.participants.find((p) => p.id === data.participantId);
  const organizerBanner =
    organizerPerson && saved
      ? `
        <div class="organizer-banner">
          <p>Eres el organizador de <strong>${escapeHtml(event.name)}</strong> en este dispositivo.</p>
          <button type="button" class="btn small primary" id="organizer-import">Importar esta lista a mi evento</button>
        </div>
      `
      : '';

  return `
    <main class="page reveal-page">
      <div class="snow" aria-hidden="true"></div>
      <section class="card reveal-card wishlist-form-card">
        <p class="eyebrow">${escapeHtml(data.eventName)}</p>
        <h1>Hola, ${escapeHtml(data.participantName)}</h1>
        <p class="lead">Escribe o actualiza tu lista de deseos para que quien te toque sepa qué regalarte.</p>
        ${organizerBanner}
        <form id="wishlist-form" class="stack">
          <label class="field">
            <span>Mi lista de deseos</span>
            <textarea name="wishlist" rows="5" placeholder="Tallas, hobbies, libros, cosas que te gustan o que ya tienes… Puedes pegar enlaces de tiendas.">${escapeHtml(data.wishlist || '')}</textarea>
          </label>
          <div class="field">
            <span>Fotos o enlaces (opcional, máx. ${MAX_IMAGES})</span>
            <div id="image-editor">${renderImageGrid(data.images, { removable: true })}</div>
            <div class="image-actions">
              <label class="btn small secondary file-btn" id="add-photo-label">
                📷 Añadir foto
                <input type="file" id="add-photo" accept="image/*" multiple hidden />
              </label>
              <div class="inline-form image-url-form">
                <input id="image-url" type="url" inputmode="url" placeholder="Enlace de imagen o producto" autocapitalize="off" autocorrect="off" spellcheck="false" />
                <button type="button" class="btn small" id="add-image-url">Añadir</button>
              </div>
            </div>
            <p class="muted small-note">Las fotos se reducen para que quepan en el enlace.</p>
          </div>
          <button type="submit" class="btn primary">${saved ? 'Actualizar lista' : 'Guardar lista'}</button>
        </form>
        <div id="wishlist-result" class="${saved ? '' : 'hidden'}">
          <div class="wishlist-box success-box">
            <h2>¡Listo!</h2>
            <p>Envía este enlace al organizador. No hace falta escribir la lista otra vez.</p>
          </div>
          <div class="share-actions wide">
            <button type="button" class="btn primary" id="share-updated-link">Enviar al organizador</button>
            <button type="button" class="btn" id="copy-updated-link">Copiar enlace</button>
          </div>
          <input id="updated-link" type="hidden" value="${escapeHtml(buildWishlistUrl(token))}" />
        </div>
      </section>
    </main>
  `;
}

function renderReveal(token) {
  const data = decodeRevealToken(token);
  if (!data) {
    return `
      <main class="page reveal-page">
        <section class="card reveal-card error">
          <h1>Enlace no válido</h1>
          <p>Este enlace está roto o caducado. Pide al organizador que te envíe uno nuevo.</p>
          <a class="btn" href="#">Volver al inicio</a>
        </section>
      </main>
    `;
  }

  return `
    <main class="page reveal-page">
      <div class="snow" aria-hidden="true"></div>
      <section class="card reveal-card">
        <p class="eyebrow">${escapeHtml(data.eventName)}</p>
        <h1>¡Ho ho ho, ${escapeHtml(data.giverName)}!</h1>
        <p class="lead">Eres el amigo invisible de</p>
        <p class="reveal-name">${escapeHtml(data.receiverName)}</p>
        ${
          data.wishlist || data.images.length
            ? `
          <div class="wishlist-box">
            <h2>Su lista de deseos</h2>
            ${data.wishlist ? `<p class="wishlist-text">${linkify(escapeHtml(data.wishlist))}</p>` : ''}
            ${renderImageGrid(data.images)}
          </div>
        `
            : '<p class="muted">Aún no ha compartido lista de deseos — toca investigar un poco.</p>'
        }
        <p class="muted small-note">Guarda el secreto hasta el día del regalo.</p>
      </section>
    </main>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function importWishlistFromUrl(url) {
  const parsed = extractTokenFromUrl(url.trim());
  if (!parsed || parsed.type !== 'wishlist') {
    showToast('Ese enlace no es de lista de deseos');
    return false;
  }

  const data = decodeWishlistToken(parsed.token);
  if (!data) {
    showToast('No se pudo leer el enlace');
    return false;
  }

  return applyImportedWishlist(data);
}

function applyImportedWishlist(data) {
  const person = event?.participants.find((p) => p.id === data.participantId);
  if (!person) {
    showToast(`No encontramos a ${data.participantName} en este evento`);
    return false;
  }

  if (!data.wishlist?.trim() && !data.images.length) {
    showToast('Ese enlace aún no tiene lista escrita');
    return false;
  }

  person.wishlist = data.wishlist.trim();
  person.images = data.images;
  saveEvent(event);
  if (event.assignment) {
    showToast(`Lista de ${person.name} actualizada — reenvía los enlaces de revelación`);
  } else {
    showToast(`Lista de ${person.name} importada`);
  }
  render();
  return true;
}

function render() {
  const current = route();
  const app = document.getElementById('app');

  if (current.view === 'home') {
    app.innerHTML = renderHome();
    bindHomeEvents();
    return;
  }

  if (current.view === 'reveal') {
    app.innerHTML = renderReveal(current.token);
    return;
  }

  if (current.view === 'wishlist') {
    app.innerHTML = renderWishlist(current.token);
    bindWishlistEvents(current.token);
    return;
  }

  if (!event) {
    window.location.hash = '';
    render();
    return;
  }

  app.innerHTML = renderManage();
  bindManageEvents();
}

function bindHomeEvents() {
  $('#create-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get('eventName').trim();
    event = createEmptyEvent(name || 'Amigo invisible familiar');
    saveEvent(event);
    window.location.hash = '';
    render();
  });

  $('#import-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!imported.participants || !imported.families) throw new Error('Invalid file');
      event = imported;
      saveEvent(event);
      showToast('Evento importado');
      window.location.hash = '';
      render();
    } catch {
      showToast('No se pudo importar ese archivo');
    }
    e.target.value = '';
  });
}

function bindWishlistEvents(initialToken) {
  let currentToken = initialToken;
  const initial = decodeWishlistToken(initialToken);
  if (!initial) return;
  let images = [...initial.images];

  const refreshImages = () => {
    const editor = $('#image-editor');
    if (editor) editor.innerHTML = renderImageGrid(images, { removable: true });
    const full = images.length >= MAX_IMAGES;
    $('#add-photo-label')?.classList.toggle('disabled', full);
    const photoInput = $('#add-photo');
    if (photoInput) photoInput.disabled = full;
    const addUrl = $('#add-image-url');
    if (addUrl) addUrl.disabled = full;
  };
  refreshImages();

  $('#image-editor')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-image]');
    if (!btn) return;
    images.splice(Number(btn.dataset.removeImage), 1);
    refreshImages();
  });

  $('#add-photo')?.addEventListener('change', async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    for (const file of files) {
      if (images.length >= MAX_IMAGES) {
        showToast(`Máximo ${MAX_IMAGES} fotos`);
        break;
      }
      try {
        images.push(await fileToThumbnail(file));
      } catch {
        showToast('No se pudo leer esa foto');
      }
    }
    refreshImages();
  });

  const addUrl = () => {
    const input = $('#image-url');
    const value = input?.value.trim();
    if (!value) return;
    if (!/^https?:\/\/\S+$/i.test(value)) {
      showToast('Pega un enlace que empiece por https://');
      return;
    }
    if (images.length >= MAX_IMAGES) {
      showToast(`Máximo ${MAX_IMAGES} fotos o enlaces`);
      return;
    }
    images.push(value);
    input.value = '';
    refreshImages();
  };
  $('#add-image-url')?.addEventListener('click', addUrl);
  $('#image-url')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addUrl();
    }
  });

  $('#wishlist-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const wishlist = new FormData(e.target).get('wishlist').trim();
    if (!wishlist && !images.length) {
      showToast('Escribe algo o añade una foto');
      return;
    }

    currentToken = encodeWishlistToken({
      eventName: initial.eventName,
      participantId: initial.participantId,
      participantName: initial.participantName,
      wishlist,
      images,
    });

    const newUrl = buildWishlistUrl(currentToken);
    window.history.replaceState(null, '', newUrl);

    const result = $('#wishlist-result');
    const linkInput = $('#updated-link');
    result?.classList.remove('hidden');
    if (linkInput) linkInput.value = newUrl;
    result?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    showToast('Lista guardada — envíasela al organizador');
  });

  $('#share-updated-link')?.addEventListener('click', async () => {
    const link = $('#updated-link')?.value;
    if (!link) return;
    await shareLink({
      title: initial.eventName,
      text: `🎁 Mi lista de deseos para «${initial.eventName}» (${initial.participantName}):`,
      url: link,
    });
  });

  $('#copy-updated-link')?.addEventListener('click', async () => {
    const link = $('#updated-link')?.value;
    if (!link) return;
    showToast((await copyText(link)) ? 'Enlace copiado' : 'No se pudo copiar');
  });

  $('#organizer-import')?.addEventListener('click', () => {
    const data = decodeWishlistToken(currentToken);
    if (data && applyImportedWishlist(data)) {
      window.location.hash = '';
    }
  });
}

function bindManageEvents() {
  $('#family-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (event.assignment) return;
    const name = new FormData(e.target).get('familyName').trim();
    if (!name) return;
    event.families.push({ id: createId(), name });
    e.target.reset();
    persist();
  });

  $('#participant-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (event.assignment) return;
    const data = new FormData(e.target);
    const name = data.get('participantName').trim();
    const familyId = data.get('familyId');
    if (!name || !familyId) return;
    event.participants.push({ id: createId(), name, familyId, wishlist: '' });
    e.target.reset();
    persist();
  });

  document.querySelectorAll('[data-remove-family]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (event.assignment) return;
      const id = btn.dataset.removeFamily;
      event.families = event.families.filter((f) => f.id !== id);
      persist();
    });
  });

  document.querySelectorAll('[data-remove-participant]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (event.assignment) return;
      const id = btn.dataset.removeParticipant;
      event.participants = event.participants.filter((p) => p.id !== id);
      persist();
    });
  });

  $('#import-wishlist-btn')?.addEventListener('click', openImportSheet);

  $('#import-cancel')?.addEventListener('click', closeImportSheet);

  $('#import-paste')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        showToast('El portapapeles está vacío');
        return;
      }
      if (importWishlistFromUrl(text)) closeImportSheet();
    } catch {
      showToast('No se pudo leer el portapapeles — pégalo a mano');
    }
  });

  $('#import-sheet')?.addEventListener('click', (e) => {
    if (e.target.id === 'import-sheet') closeImportSheet();
  });

  $('#import-submit')?.addEventListener('click', () => {
    const url = $('#import-url-input')?.value.trim();
    if (!url) {
      showToast('Pega un enlace primero');
      return;
    }
    if (importWishlistFromUrl(url)) closeImportSheet();
  });

  $('#import-url-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('#import-submit')?.click();
    }
  });

  $('#draw-btn')?.addEventListener('click', () => {
    const check = canDraw(event.participants);
    if (!check.ok) {
      showToast(check.reason);
      return;
    }
    const assignment = findAssignment(event.participants);
    if (!assignment) {
      showToast('No se encontró un sorteo válido. Prueba a ajustar las familias.');
      return;
    }
    event.assignment = assignment;
    event.drawnAt = new Date().toISOString();
    persist();
    showToast('¡Nombres sorteados!');
  });

  $('#redraw-btn')?.addEventListener('click', () => {
    if (!confirm('¿Volver a sortear? Los enlaces actuales dejarán de coincidir hasta que envíes unos nuevos.')) return;
    const assignment = findAssignment(event.participants);
    if (!assignment) {
      showToast('No se encontró un sorteo válido.');
      return;
    }
    event.assignment = assignment;
    event.drawnAt = new Date().toISOString();
    persist();
    showToast('¡Sorteado de nuevo!');
  });

  $('#export-btn')?.addEventListener('click', () => {
    if (event.assignment && !confirm('El archivo exportado incluye el sorteo completo. Si tú también participas, no lo abras — solo guárdalo como copia de seguridad.')) {
      return;
    }
    const blob = new Blob([JSON.stringify(event, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${event.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('Evento exportado');
  });

  $('#reset-btn')?.addEventListener('click', () => {
    if (!confirm('¿Borrar este evento y empezar de cero?')) return;
    clearEvent();
    event = null;
    window.location.hash = '';
    render();
  });

  document.querySelectorAll('[data-copy-link]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = decodeURIComponent(btn.dataset.copyLink);
      showToast((await copyText(url)) ? 'Enlace copiado' : 'No se pudo copiar');
    });
  });

  document.querySelectorAll('[data-share-link]').forEach((btn) => {
    btn.addEventListener('click', () => {
      shareLink({
        title: event.name,
        text: decodeURIComponent(btn.dataset.shareText),
        url: decodeURIComponent(btn.dataset.shareLink),
      });
    });
  });
}

installImageFallback();
window.addEventListener('hashchange', render);
render();
