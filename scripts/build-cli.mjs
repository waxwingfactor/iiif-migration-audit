import { build } from 'esbuild';
import { chmod, mkdir } from 'node:fs/promises';

await mkdir('dist/cli', { recursive: true });
await build({
  entryPoints: ['src/cli/index.ts'],
  outfile: 'dist/cli/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // jsonc-parser's UMD entry dynamically requires relative modules; use its ESM
  // distribution so the release really is one dependency-free Node bundle.
  mainFields: ['module', 'main'],
  sourcemap: false,
  legalComments: 'eof',
});
await chmod('dist/cli/index.js', 0o755);
