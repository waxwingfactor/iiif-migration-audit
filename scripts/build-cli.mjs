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
  sourcemap: false,
  legalComments: 'eof',
});
await chmod('dist/cli/index.js', 0o755);
