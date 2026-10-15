# CLI and report review

Independent reviewer: discover_field_science agent, 2026-10-15. Review covered the CLI/report implementation at 530a945, operator-level black-box tests, package bundling, and actual Chromium inspection of exported HTML. Agent review is not customer validation.

The reviewer added 18 independent acceptance cases. All 126 unit and acceptance tests passed, along with TypeScript checks and the CLI build. An installed bundled CLI was exercised outside the source tree. Standalone hostile-content HTML produced no dialogs or remote requests, had no automated accessibility violations, and remained readable at desktop and mobile widths.

Resolved findings:

- A batch output with `--force` could overwrite a surviving input when its partner was missing, or when its pair was rejected as a duplicate. All declared inputs and their filesystem identities are now protected before per-pair processing; symlink and hardlink regression cases are included.
- A positional filename named `--help` after `--` was incorrectly interpreted as a help request. Argument parsing now honors the delimiter.
- CSV omitted complete provenance, policy, profile, and canvas-pairing records. Exports now preserve these records alongside findings and coverage.

Additional independent checks cover explicit corpus accounting, stale approvals across batches, fatal UTF-8 handling, byte-preserving snapshots, gzip size limits, redirect and timeout behavior, atomic output safety, and spreadsheet formula neutralization.

The reviewer cleared the declared CLI/report scope. Final release metadata, installable package contents, hosted browser distribution, and cross-platform CI are assessed separately during release integration.
