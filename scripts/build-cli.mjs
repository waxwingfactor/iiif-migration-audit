import { build } from 'esbuild';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';

await mkdir('dist/cli', { recursive: true });
const parserLicense = await readFile(
  new URL(import.meta.resolve('jsonc-parser/LICENSE.md')),
  'utf8',
);
const dependencyNotice =
  'Bundled dependency: jsonc-parser (Microsoft Corporation), MIT license\n\n' + parserLicense;
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
  banner: { js: '/*!\n' + dependencyNotice.replaceAll('*/', '* /') + '\n*/' },
  sourcemap: false,
  legalComments: 'eof',
});
await chmod('dist/cli/index.js', 0o755);
await writeFile('dist/cli/THIRD_PARTY_NOTICES.txt', dependencyNotice, 'utf8');
