// Cliente de la API del Worker (mismo dominio que la web).
const BASE = import.meta.env.VITE_API_BASE || '/api';

async function request(path, { method = 'GET', body, key, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (key) init.headers.authorization = `Bearer ${key}`;
  if (body instanceof Blob) {
    init.body = body;
    init.headers['content-type'] = body.type;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  let response;
  try {
    response = await fetch(`${BASE}${path}`, init);
  } catch {
    const error = new Error('Sin conexión con el servidor');
    error.status = 0;
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Algo ha fallado');
    error.status = response.status;
    throw error;
  }
  return data;
}

export const api = {
  createEvent: (name) => request('/events', { method: 'POST', body: { name } }),
  importEvent: (event) => request('/events/import', { method: 'POST', body: event }),

  admin(id, key) {
    const base = `/admin/${encodeURIComponent(id)}`;
    return {
      get: () => request(base, { key }),
      remove: () => request(base, { method: 'DELETE', key }),
      addFamily: (name) => request(`${base}/families`, { method: 'POST', key, body: { name } }),
      removeFamily: (familyId) => request(`${base}/families/${familyId}`, { method: 'DELETE', key }),
      addParticipant: (name, familyId) =>
        request(`${base}/participants`, { method: 'POST', key, body: { name, familyId } }),
      removeParticipant: (participantId) =>
        request(`${base}/participants/${participantId}`, { method: 'DELETE', key }),
      draw: () => request(`${base}/draw`, { method: 'POST', key }),
    };
  },

  participant(token) {
    const base = `/p/${encodeURIComponent(token)}`;
    return {
      get: () => request(base),
      saveWishlist: (wishlist) => request(base, { method: 'PUT', body: { wishlist } }),
      uploadImage: (blob) => request(`${base}/images`, { method: 'POST', body: blob }),
      addLink: (url) => request(`${base}/images`, { method: 'POST', body: { url } }),
      removeImage: (imageId) => request(`${base}/images/${imageId}`, { method: 'DELETE' }),
    };
  },
};
