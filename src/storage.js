const STORAGE_KEY = 'family-secret-santa-event';

export function loadEvent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveEvent(event) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(event));
}

export function clearEvent() {
  localStorage.removeItem(STORAGE_KEY);
}

export function createEmptyEvent(name = 'Amigo invisible familiar') {
  return {
    id: crypto.randomUUID(),
    name,
    families: [],
    participants: [],
    assignment: null,
    drawnAt: null,
    createdAt: new Date().toISOString(),
  };
}

export function createId() {
  return crypto.randomUUID();
}
