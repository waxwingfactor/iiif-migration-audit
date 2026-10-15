# Architecture and decisions

## 1. Deterministic comparison core

`src/core` has no filesystem, network, DOM, framework, or converter dependency. Public entry point: `audit(baseline: AuditInput, candidate: AuditInput, options?: AuditOptions): Promise<AuditReport>`. Inputs contain names and original JSON text. The implementation validates JSON, resource budgets, supported version and shape, independently extracts version-specific facts with source JSON pointers, matches identities, compares facts, applies explicit policies, and computes verdicts. Inputs remain immutable.

Use Web Crypto SHA-256 (available in Node 22 and modern secure-context browsers) for source hashes and stable finding IDs. IDs bind exact before/after values, logical path, finding code, both original input SHA-256 hashes, manifest identities, active URI policy (excluding approvals), and the profile/fingerprint semantics versions. Reformatting a snapshot intentionally invalidates its approvals: exact saved evidence is the review boundary. Reordering object keys must not create different semantic findings. Approvals require a nonempty reason and an exact fingerprint match; unmatched approvals produce stale-policy notices and block a pass. Coverage issues are never waivable into a pass.

No shared upgrader is used as the oracle: the converter being evaluated may itself lose values. Use a strict JSON parser that catches duplicate keys and bounds size, nesting, node count and canvas count. Malformed inputs are errors, never an empty successful manifest. Browser comparison runs in a Worker to keep large inputs from blocking interaction.

## 2. Preservation model

Capture namespaced/language-aware text without stripping HTML or silently deduplicating repeated metadata. Preserve order where meaningful: canvases, metadata rows, painting layers, range items and language values. Map v2 `description` to v3 `summary` for comparison, while documenting that institutional migrations can legitimately move text to metadata and will require review. Compare rights and required attribution independently. Link/reference normalization preserves referenced identity, role, and relevant descriptors.

Match canvases by exact ID or an explicit role-scoped URI prefix rule, never position or repeated labels. Prefixes must use clear path boundaries; conflicting rules and non-injective mappings are errors. Manifest, Canvas, Range, image-resource, image-service and ordinary-link scopes are separate. Mapping image services cannot silently authorize Canvas identity changes. Mapped identity changes stay visible and describe external annotation implications. Missing/added canvases and changed order are distinct findings.

Normalized facts retain source pointers. Unknown properties and unsupported shapes are coverage notices that lead to `incomplete`, even if identical on both sides. Known structural wrapper keys are not user-content facts, but their contents must be traversed. Linked annotation-page payloads/ranges and arbitrary JSON-LD contexts are not silently fetched or assumed equivalent; report what was not inspected.

## 3. Verdicts and report contract

`src/core/types.ts` is the shared serializable contract. Findings have stable code/category/severity, before/after evidence, logical path, both source pointers, and optional reasoned acceptance. Reports include source SHA-256, versions, matched canvas pairs, explicit coverage, summary, active policy and tool version.

Verdict precedence: unhandled coverage → `incomplete`; otherwise unaccepted error → `fail`; unaccepted warning → `review`; otherwise → `pass`. An incomplete report can also contain errors; the summary preserves both. Summary error/warning/info counts include only unaccepted findings; accepted findings have a separate count and remain visible. URI rules are validated and sorted by scope/fromPrefix/toPrefix for policy fingerprinting, independent of input order; application uses longest matching prefix in the same scope. Informational additions remain visible. A pass means only that the supported preservation checks found no unaccepted errors/warnings with complete supported coverage; it does not establish conformance or runtime behavior.

## 4. Interfaces and storage

- `src/web`: React/TypeScript with Vite static build, browser Worker around the same core, local file/paste inputs, reviewer workflow and downloads. No user accounts, telemetry, backend proxy, remote fonts, or default manifest/image fetching. Do not persist unpublished source documents automatically. Downloaded review policies let users resume intentionally.
- `src/cli`: Node adapter for bounded file reads and explicit URL snapshot fetches, core invocation, output files, and batch accounting. Local comparison never needs network. URL fetches are explicit, bounded, timed, reject credential-bearing/unsafe protocols and do not recursively fetch links. No HTTP server/proxy that could create a server-side request-forgery surface.
- `src/report`: shared escaped self-contained HTML, JSON and CSV serializers. No user text becomes executable HTML, CSS, a filename, or a spreadsheet formula. Report filenames are derived from safe generated identifiers, not arbitrary manifest IDs.
- `tests`: independent golden fixtures, mutation cases, core adversarial tests, CLI integration/packaging tests, browser journey and accessibility tests. Public fixture attribution is recorded beside fixtures.

Batch mode takes an explicit pairs JSON file with unique keys and relative baseline/candidate paths, resolved relative to the pairs file. Optional inventory directories allow the CLI to detect unpaired JSON files. Missing/duplicate/ambiguous pair keys and file errors are accounted for in the batch result; one failure cannot be dropped from overall status. Policy applies to each comparison; shared unused approvals are evaluated at corpus level, not spuriously per pair.

## 5. Delivery and governance

Public GitHub repository, focused branches and pull requests. CI typechecks, meaningful unit/integration tests, formatting, browser tests, production build and package smoke tests as components land. Independent agent reviews are recorded in `docs/reviews` and PR discussions, with issues fixed before merge. Do not represent agent reviews as human validation.

Release distributes source, a self-contained CLI npm tarball installable from the release URL, standalone example reports and a static browser build. Public browser distribution uses static hosting; no paid runtime required. Reproduce the packaged CLI from a clean directory before tagging. Protect main with required CI once checks exist; user explicitly authorizes merges after review and passing checks.

## Alternatives considered

Python-only CLI lacks a no-install librarian review experience. A hosted service adds data-exposure, account and operating-cost barriers for an episodic job. A converter followed by JSON diff lacks independent preservation assurance. An unrestricted graph crawler adds network/authorization/coverage ambiguities. Conservative local comparison plus explicit snapshots is the chosen boundary.
