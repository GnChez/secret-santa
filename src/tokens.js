function encodePayload(payload) {
  return btoa(encodeURIComponent(JSON.stringify(payload)));
}

function decodePayload(token) {
  try {
    return JSON.parse(decodeURIComponent(atob(token)));
  } catch {
    return null;
  }
}

export function encodeRevealToken({ eventName, giverName, receiverName, wishlist }) {
  return encodePayload({
    e: eventName,
    g: giverName,
    r: receiverName,
    w: wishlist || '',
  });
}

export function decodeRevealToken(token) {
  const payload = decodePayload(token);
  if (!payload?.g || !payload?.r) return null;
  return {
    eventName: payload.e,
    giverName: payload.g,
    receiverName: payload.r,
    wishlist: payload.w || '',
  };
}

export function encodeWishlistToken({ eventName, participantId, participantName, wishlist }) {
  return encodePayload({
    e: eventName,
    i: participantId,
    n: participantName,
    w: wishlist || '',
  });
}

export function decodeWishlistToken(token) {
  const payload = decodePayload(token);
  if (!payload?.i || !payload?.n) return null;
  return {
    eventName: payload.e,
    participantId: payload.i,
    participantName: payload.n,
    wishlist: payload.w || '',
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
  const hash = url.includes('#') ? url.split('#')[1] : '';
  if (hash.startsWith('/lista/')) return { type: 'wishlist', token: hash.replace('/lista/', '') };
  if (hash.startsWith('/reveal/')) return { type: 'reveal', token: hash.replace('/reveal/', '') };
  return null;
}
