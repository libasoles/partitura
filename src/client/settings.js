// User options (small, read synchronously): localStorage. Scores do not belong here, they go in storage.js.
const KEY = 'partitura.settings.v1';

function readAll() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch (e) {
    return {};
  }
}

export function getSetting(name, fallback) {
  const all = readAll();
  return name in all ? all[name] : fallback;
}

export function setSetting(name, value) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [name]: value }));
  } catch (e) {
    // Without storage the option applies for this visit only.
  }
}
