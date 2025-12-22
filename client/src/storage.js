// Simple per-user localStorage helpers
export function userKey(userSub, suffix) {
  return `arbapp:${userSub || 'anon'}:${suffix}`;
}

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
