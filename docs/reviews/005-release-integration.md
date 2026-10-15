# Release integration qualification

Independent reviewers: discover_field_science (packaging and actual distribution) and discover_accessibility_archives (release code/configuration), 2026-10-15. Agent QA is not practitioner adoption, a human security audit, or a guarantee of universal preservation.

Qualified source: release integration after the independently reviewed core, CLI and browser PRs, version 1.0.0. Local checks passed: 127 unit/acceptance tests, TypeScript, formatting, CLI and static production builds, a fresh offline npm package installation, and all 10 production browser journeys with Playwright Chromium 156. The release CI additionally requires its Linux/macOS and Node 22/24 runs before publication.

Independent packaging review installed the actual tarball globally under a fresh prefix and empty npm cache with offline mode and lifecycle scripts disabled, then invoked npm's generated `iiif-audit` executable. Version, bundled examples, provenance and equivalent comparison passed. The reviewer caught missing relative documentation targets; the package now ships the complete documentation, and the smoke test checks every packaged Markdown link. All pinned Actions commits, actual main protection and enabled private vulnerability reporting were verified against GitHub. The exact dependency advisory query returned no reported advisories on 2026-10-15.

Independent production distribution qualification:

- ZIP extraction preserved SHA-256 for every static output file. The extracted application worked at both `/` and a nested project-style subpath.
- The production CSP allowed local modules, styles and the comparison worker; an explicit external fetch probe was blocked before a remote request. Normal review produced no remote requests, HTTP errors or dialogs.
- Demo comparison, JSON/CSV/HTML/policy downloads and exact-file policy resume worked. The compiled CLI and browser agreed on finding IDs, summaries and both input hashes using the same original files and exported policy, including a retained acceptance.
- Standalone HTML produced no HTTP requests. Automated accessibility reported zero assessed violations, mobile width 390 had no overflow, and independent desktop/mobile screenshot inspection found readable layouts.
- Release code review found no remaining version, documentation, packaging, Pages path, CSP, worker/download or CI blockers. Compiled output scanning found no private host paths or credential markers.

Additional local scope/responsiveness checks: self-comparison of 13 of 15 preserved official fixtures completed cleanly; the two unsupported fixtures remained incomplete. A synthetic 1,000-Canvas supported manifest pair matched all pages in approximately 140 ms on Node 22.19/macOS (493,769 bytes per input, process maximum RSS about 150 MiB). This single measurement is not a benchmark guarantee or memory bound.

The final publication procedure still verifies required GitHub checks on the exact PR head, merges it, deploys trusted main, publishes checksummed release assets from the exact merged commit, and exercises the public URL and downloaded archive. Results of those external publication operations belong in the GitHub Release evidence; this source review does not pre-assert a deployment result.

Residual scope remains explicit: Chromium qualification, local supported still-image semantics, no remote pixel/OCR/authentication/CORS/viewer or legal correctness claim, and no fabricated customer interviews or adoption. No paid service is required.
