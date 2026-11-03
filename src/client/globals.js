// The editor was written against classic-script globals; this keeps its code unchanged while the libraries it
// uses are bundled as modules.
import ScoreModel from './score-model.js';
import ScoreFingering from './score-fingering.js';
import ScoreIO from './score-io.js';

window.ScoreModel = ScoreModel;
window.ScoreFingering = ScoreFingering;
window.ScoreIO = ScoreIO;

// React and Radix back the toast and the confirm dialog. They are fetched on first use, not with the editor.
function lazy(name, load, methods) {
  window[name] = Object.fromEntries(methods.map((method) => [
    method,
    (...args) => load().then(() => window[name][method](...args)),
  ]));
}
lazy('SiteToast', () => import('./toast.js'), ['show', 'clear']);
lazy('ScoreConfirm', () => import('./score-confirm.js'), ['ask']);
