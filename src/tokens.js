// Formato de enlace v2: "z" + base64url(JSON) + (".", base64url(foto))*
// - Sin encodeURIComponent → los enlaces son bastante más cortos (sobre todo con tildes).
// - Las fotos subidas van como segmentos aparte para no codificarlas dos veces.
// Los enlaces antiguos (btoa(encodeURIComponent(json))) se siguen leyendo.

const V2_PREFIX = 'z';

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return base64ToUrl(btoa(binary));
}

function base64UrlToBytes(value) {
  const binary = atob(urlToBase64(value));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64ToUrl(b64) {
  return b64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function urlToBase64(value) {
  const b64 = value.replaceAll('-', '+').replaceAll('_', '/');
  return b64 + '='.repeat((4 - (b64.length % 4)) % 4);
}

const DATA_URL_RE = /^data:(image\/(?:jpeg|webp|png));base64,([A-Za-z0-9+/=]+)$/;

function encodePayload(payload, images = []) {
  const segments = [];
  const imageRefs = [];
  for (const src of images) {
    const match = DATA_URL_RE.exec(src);
    if (match) {
      imageRefs.push([segments.length, match[1].replace('image/', '')]);
      segments.push(base64ToUrl(match[2]));
    } else if (/^https?:\/\//i.test(src)) {
      imageRefs.push(src);
    }
  }
  const body = imageRefs.length ? { ...payload, p: imageRefs } : payload;
  const json = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(body)));
  return [V2_PREFIX + json, ...segments].join('.');
}

function decodePayload(token) {
  try {
    if (token.startsWith(V2_PREFIX)) {
      const [json, ...segments] = token.slice(V2_PREFIX.length).split('.');
      const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(json)));
      payload.images = (Array.isArray(payload.p) ? payload.p : [])
        .map((ref) => {
          if (typeof ref === 'string') return ref;
          if (Array.isArray(ref) && segments[ref[0]] && /^(jpeg|webp|png)$/.test(ref[1])) {
            return `data:image/${ref[1]};base64,${urlToBase64(segments[ref[0]])}`;
          }
          return null;
        })
        .filter((src) => src && isSafeImageSrc(src));
      return payload;
    }
    const legacy = JSON.parse(decodeURIComponent(atob(token)));
    legacy.images = [];
    return legacy;
  } catch {
    return null;
  }
}

export function isSafeImageSrc(src) {
  return typeof src === 'string' && (/^https?:\/\/\S+$/i.test(src) || DATA_URL_RE.test(src));
}

export function encodeRevealToken({ eventName, giverName, receiverName, wishlist, images }) {
  return encodePayload(
    {
      e: eventName,
      g: giverName,
      r: receiverName,
      w: wishlist || '',
    },
    images,
  );
}

export function decodeRevealToken(token) {
  const payload = decodePayload(token);
  if (!payload?.g || !payload?.r) return null;
  return {
    eventName: payload.e,
    giverName: payload.g,
    receiverName: payload.r,
    wishlist: payload.w || '',
    images: payload.images,
  };
}

export function encodeWishlistToken({ eventName, participantId, participantName, wishlist, images }) {
  return encodePayload(
    {
      e: eventName,
      i: participantId,
      n: participantName,
      w: wishlist || '',
    },
    images,
  );
}

export function decodeWishlistToken(token) {
  const payload = decodePayload(token);
  if (!payload?.i || !payload?.n) return null;
  return {
    eventName: payload.e,
    participantId: payload.i,
    participantName: payload.n,
    wishlist: payload.w || '',
    images: payload.images,
  };
}

export function buildUrl(path, token) {
  const base = window.location.href.split('#')[0];
  return `${base}#${path}/${token}`;
}

export function buildRevealUrl(token) {
  return buildUrl('/reveal', token);
}

export function buildWishlistUrl(token) {
  return buildUrl('/lista', token);
}

export function extractTokenFromUrl(url) {
  // Acepta también el mensaje completo de WhatsApp (texto + enlace)
  const match = /#\/(lista|reveal)\/([A-Za-z0-9_\-.=+/]+)/.exec(url);
  if (!match) return null;
  return { type: match[1] === 'lista' ? 'wishlist' : 'reveal', token: match[2] };
}
