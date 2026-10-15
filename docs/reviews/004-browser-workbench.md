# Browser workbench review

Independent reviewer: discover_technical_workflows agent, 2026-10-15. Browser source reviewed through 2bd22b1 after rebase onto the merged CLI/report adapters. The reviewer used separate black-box scripts and inspected the implementation; this is agent QA, not practitioner validation.

Author validation: TypeScript and production build, 126 integrated unit/acceptance tests, and 10 production Chromium journeys. Independent validation: 12 browser scenarios covering demo and pasted/file inputs, local-only processing, source inspection, keyboard navigation, policies and approvals, stale-decision recovery, incomplete/malformed input recovery, hostile metadata, mobile layout, exact exports, and asynchronous import ordering.

Resolved independent findings:

- A pending file read could replace a newer demo/input intent. Per-input generations plus an explicit synchronous reset generation now invalidate obsolete reads, including repeated identical demos.
- A pending policy import could overwrite a newer URL-rule or decision edit. Every newer local policy intent invalidates earlier imports, and the regression suite controls read completion deterministically.
- Source excerpts were scrollable without keyboard focus. Source, evidence and table scroll regions are focusable; automated accessibility checks include the open source dialog, with Escape and return-focus behavior verified.

The independent reviewer found no unexpected network requests or page crashes, no automated accessibility violations in the assessed states, and no horizontal overflow at 390 CSS pixels. Exported CSV and HTML agreed byte-for-byte with the current shared adapters applied to the exported JSON. Hostile markup remained inert; accept/revoke flows retained original evidence.

No remaining merge blockers were identified in the declared browser workflow. Production distribution CSP, exact release version, final installed archive, hosted subpath and cross-platform CI are qualified separately in release integration. Chromium was tested; equivalent qualification of other browser engines and actual institutional adoption are not claimed.
