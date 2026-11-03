// npm prepares these small Node entry points when installing the Git dependency.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: { model: 'src/client/score-model.js', fingering: 'src/client/score-fingering.js', io: 'src/client/score-io.js' },
  outdir: 'lib', outExtension: { '.js': '.cjs' },
  bundle: true, platform: 'node', format: 'cjs',
});
