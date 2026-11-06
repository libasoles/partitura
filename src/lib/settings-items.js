/* settings-items.js — The Settings controls of the editor, redrawn as static HTML so each tutorial step can show the
   very item it talks about (same labels, icons and swatches as the popup). Styles: .ts-* in src/styles/tutorials.css. */

import { tutorialIcon } from './tutorial-icons.js';

const swatches = (list = [1, 2, 3, 4]) => list.map((n) => `<span class="tutorial-voice" data-number="${n}" aria-hidden="true">${n}</span>`).join('');
const check = (label, { on = false, extra = '' } = {}) =>
  `<label class="ts-check"><input type="checkbox" disabled${on ? ' checked' : ''}> <span>${label}</span></label>${extra ? `<span class="ts-icons">${extra}</span>` : ''}`;
const radio = (icon, label, on) =>
  `<label class="ts-radio${on ? ' is-on' : ''}"><input type="radio" disabled${on ? ' checked' : ''}> ${tutorialIcon(icon)}<span>${label}</span></label>`;

/** One piece of the settings popup, by name. `s` is the language's strings. */
export function settingsItem(name, s) {
  const u = s.scoreUiStrings;
  const body = {
    open: `<span class="ts-cog" aria-hidden="true">${tutorialIcon('settings')}</span><span class="ts-heading">${u.settings}</span>`,
    instrument: `<p class="ts-title">${u.settingsInstrument}</p><div class="ts-row">${radio('piano', u.instrumentPiano, true)}${radio('guitar', u.instrumentGuitar, false)}</div>`,
    tempo: `<p class="ts-title">${u.settingsTempo}</p><div class="ts-slider"><input type="range" min="20" max="300" value="120" disabled aria-label="${u.tempoUnit}"><output>♩ = 120</output></div>${check(u.tempoNone)}`,
    tools: `<p class="ts-title">${u.settingsTools}</p>${check(u.toolsRepeats, { on: true })}${check(u.toolsDynamics, { on: true })}${check(u.toolsVoices, { on: true, extra: swatches() })}`,
    voices: `${check(u.toolsVoices, { on: true, extra: swatches() })}`,
    playback: `${check(u.toolsPlayback, { on: true, extra: tutorialIcon('play') + tutorialIcon('pause') })}`,
    library: `${check(u.libraryPatterns, { on: true })}<p class="ts-hint">${u.libraryHint}</p>`,
  }[name];
  return `<div class="tutorial-setting" role="img" aria-label="${u.settings.replace(/"/g, '&quot;')}">${body}</div>`;
}
