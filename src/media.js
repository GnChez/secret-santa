export const MAX_IMAGES = 6;

function escapeAttr(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function isSafeImageSrc(src) {
  return (
    typeof src === 'string' &&
    (/^https?:\/\/\S+$/i.test(src) ||
      /^\/api\/img\/[A-Za-z0-9-]+$/.test(src) ||
      /^data:image\/(?:jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/.test(src))
  );
}

function loadImage(file) {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  }).finally(() => URL.revokeObjectURL(url));
}

// Reduce la foto antes de subirla (las del móvil pesan varios MB).
export async function fileToImageBlob(file, maxSide = 1280, quality = 0.82) {
  const img = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const toBlob = (type) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await toBlob('image/webp');
  if (webp && webp.type === 'image/webp') return webp;
  return toBlob('image/jpeg');
}

// Acepta imágenes como texto (src) o como objetos { id, src }.
export function renderImageGrid(images = [], { removable = false } = {}) {
  const safe = images
    .map((item) => (typeof item === 'string' ? { id: item, src: item } : item))
    .filter((item) => isSafeImageSrc(item?.src));
  if (!safe.length) return '';
  return `
    <div class="wish-images">
      ${safe
        .map(({ id, src }) => {
          const canOpen = !src.startsWith('data:');
          const img = `<img class="wish-img" src="${escapeAttr(src)}" alt="Foto de la lista de deseos" loading="lazy" referrerpolicy="no-referrer" data-src="${escapeAttr(src)}" />`;
          return `
            <figure class="wish-image">
              ${canOpen ? `<a href="${escapeAttr(src)}" target="_blank" rel="noopener noreferrer">${img}</a>` : img}
              ${removable ? `<button type="button" class="wish-image-remove" data-remove-image="${escapeAttr(id)}" aria-label="Quitar">×</button>` : ''}
            </figure>
          `;
        })
        .join('')}
    </div>
  `;
}

// Si un enlace no es una imagen (p. ej. la página de un producto), se muestra como enlace.
export function installImageFallback() {
  document.addEventListener(
    'error',
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.classList.contains('wish-img')) return;
      const src = img.dataset.src || '';
      const figure = img.closest('.wish-image');
      if (!figure || !src.startsWith('http')) return;
      let host = src;
      try {
        host = new URL(src).hostname.replace(/^www\./, '');
      } catch {
        /* nada */
      }
      const link = document.createElement('a');
      link.className = 'wish-link-card';
      link.href = src;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `🔗 ${host}`;
      const anchor = img.closest('a') || img;
      anchor.replaceWith(link);
      figure.classList.add('is-link');
    },
    true,
  );
}

export function linkify(escapedText) {
  return escapedText.replace(
    /https?:\/\/[^\s<]+[^\s<.,;:!?)»"]/g,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`,
  );
}

// Abre el menú de compartir del móvil; si no existe, abre WhatsApp directamente.
export async function shareLink({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank', 'noopener');
  return 'whatsapp';
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
