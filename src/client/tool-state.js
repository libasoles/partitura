// Which optional tools a host offers and which of them are on. Ajustes (`settings`) is only the UI that lets the user
// change that; it is not what makes a tool available.
//
//   available(name): the host offers the tool. `tools[name] === false` hides it; `true` offers it. Unlisted tools are
//     offered when the host has Ajustes (the user can switch them) and, without it, only the ones every host always had.
//   on(name, fallback): resolved in order: what the user set on the score, the host's `tools[name]`, the tool's own default.
const ALWAYS_OFFERED = new Set(['repeats', 'dynamics', 'lyrics']);

export function createToolState({ settings = false, tools = {}, scoreTools = () => undefined } = {}) {
  const available = (name) => {
    if (tools[name] === false) return false;
    return Boolean(settings) || tools[name] === true || ALWAYS_OFFERED.has(name);
  };
  const on = (name, fallback = true) => {
    if (!available(name)) return false;
    const own = scoreTools();
    if (own && name in own) return Boolean(own[name]);
    if (typeof tools[name] === 'boolean') return tools[name];
    return fallback;
  };
  return { available, on };
}
