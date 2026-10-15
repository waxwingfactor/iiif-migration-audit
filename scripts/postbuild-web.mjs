import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Apply this only to production output: development needs Vite's HMR connection.
const directory = join(process.cwd(), 'dist', 'web');
const index = join(directory, 'index.html');
const policy = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "worker-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'none'",
].join('; ');
writeFileSync(
  index,
  readFileSync(index, 'utf8').replace(
    '<head>',
    `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}">`,
  ),
);
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  copyFileSync(name, join(directory, name));
}
writeFileSync(
  join(directory, 'OFFLINE.md'),
  `# Run the downloaded browser workbench locally

Extract all files together. From this directory, start a local static HTTP server:

\`\`\`sh
python3 -m http.server 8080 --bind 127.0.0.1
\`\`\`

Open http://127.0.0.1:8080 in a modern browser. Keep the server running while reviewing. The app requires an HTTP origin for its worker; opening index.html directly as a file will not work. Python 3 is one option; an existing static server is also suitable.

All comparison processing happens in a local worker. The app does not upload manifests or retrieve linked resources. Production policy blocks outbound fetches. Close the tab and stop the server when finished. Export reports and your review policy before leaving; there is no automatic storage.

The separately downloadable CLI archive uses Node.js 22.12 or newer and can compare whole corpora without a browser. Instructions and supported scope: https://github.com/waxwingfactor/iiif-migration-audit
`,
);
console.log('Production privacy policy, offline instructions and license notices included.');
