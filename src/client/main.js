import './globals.js';
import { initStorage } from './storage.js';

// The editor reads the saved scores synchronously when it starts, so IndexedDB is loaded first.
initStorage().then(() => import('./score-editor.js'));
