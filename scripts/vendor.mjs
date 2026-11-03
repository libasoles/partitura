import { fileURLToPath } from 'node:url';
import { buildEditorVendor } from './lib/editor-vendor.mjs';

await buildEditorVendor(fileURLToPath(new URL('../public/vendor/', import.meta.url)));
