import { isSafeImageSrc } from './tokens.js';

export const MAX_IMAGES = 4;
const MAX_SIDE = 320;
const QUALITY = 0.6;

function escapeAttr(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Reduce la foto a una miniatura ligera para que quepa en el enlace.
export async function fileToThumbnail(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', QUALITY);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function renderImageGrid(images = [], { removable = false } = {}) {
  const safe = images.filter(isSafeImageSrc);
  if (!safe.length) return '';
  return `
    <div class="wish-images">
      ${safe
        .map((src, index) => {
          const isRemote = src.startsWith('http');
          const img = `<img class="wish-img" src="${escapeAttr(src)}" alt="Foto de la lista de deseos" loading="lazy" referrerpolicy="no-referrer" data-src="${escapeAttr(src)}" />`;
          return `
            <figure class="wish-image">
              ${isRemote ? `<a href="${escapeAttr(src)}" target="_blank" rel="noopener noreferrer">${img}</a>` : img}
              ${removable ? `<button type="button" class="wish-image-remove" data-remove-image="${index}" aria-label="Quitar foto">×</button>` : ''}
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
