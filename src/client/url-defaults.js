// URL options belong to Partitura's host; shared-editor consumers keep their own defaults.
const GROUPS = ['repeats', 'dynamics', 'voices', 'playback', 'intervals'];

export function readUrlDefaults(search) {
  const params = new URLSearchParams(search);
  const defaults = {};
  if (params.has('tools')) {
    const names = new Set(params.get('tools').split(',').map((name) => name.trim().toLowerCase()));
    if (names.has('play')) names.add('playback');
    defaults.tools = Object.fromEntries(GROUPS.map((name) => [name, names.has(name)]));
  }
  if (params.has('sound')) defaults.sound = params.get('sound');
  return defaults;
}

export function applyUrlDefaults(score, defaults, model) {
  if (defaults.tools) score.tools = { ...defaults.tools };
  if (defaults.sound) model.setSound(score, defaults.sound);
  return score;
}
