# Maintaining and reproducing a release

Changes use focused pull requests, an independent review recorded honestly as agent or human review, and the required Quality check. Main prohibits force pushes and deletion, requires an up-to-date branch and resolved conversations, and enforces its rules for administrators. Compatibility checks additionally exercise Node 22 on macOS and Node 24 on Linux. There are no publishing credentials in pull-request jobs.

A release candidate must satisfy [the release criteria](release-criteria.md). Check the packed output, not just source tests:

```sh
npm ci
npm run check
npm test
npm run format:check
npm run build
npm run test:package
npx playwright install chromium
IIIF_TEST_PREVIEW=1 npm run test:browser
npm audit
```

The package smoke test packs the actual CLI, installs it in a fresh directory with npm offline mode and no lifecycle scripts, then runs help, version, equivalent/loss comparisons, scriptless HTML and a batch. It uses no registry runtime dependencies. Browser tests must target the production build for CSP and asset-path qualification.

Keep `package.json`, `package-lock.json`, `TOOL_VERSION` in `src/core/index.ts`, installation examples and the changelog aligned. Tool/profile/fingerprint changes can invalidate approvals by design. Describe that behavior in release notes instead of silently carrying decisions forward.

Build from the exact merged release commit. Publish the npm tarball, static `dist/web` archive, synthetic example corpus, sample reports and SHA-256 checksums as GitHub Release assets. Include licenses in each distribution. The static bundle contains `OFFLINE.md`: serve it over a localhost HTTP origin rather than opening `index.html` directly. The npm tarball is not published to the npm registry; its GitHub Release archive is the supported install source.

Pages deployment is a trusted-main workflow with narrowly scoped deployment permissions. PR validation does not deploy. After release, verify the public subpath loads its assets and worker, the example audit and downloads work, and the published tarball matches its checksum. The deployment can be inspected through the repository's Actions and Pages environment.

No automated workflow creates a release or approves a policy change. Before future releases, repeat adversarial tests for changed preservation semantics, review the exact dependency lock/advisories, and keep research/claims honest. Practitioner feedback belongs in issues or documented interviews, not invented adoption metrics.
