# Threat model

Status: initial design review, 2026-10-15. This document describes required controls and release checks; it does not assert that every control is implemented. Update the control status after implementation review.

## Assets, actors and boundaries

The product is an offline comparison tool for digital-library engineers. Its important assets are the accuracy of a migration decision, the integrity of reviewed approvals, the operator's local files, and confidentiality of unpublished metadata. Its output is evidence about explicitly assessed manifest properties, not a certificate that content, remote services, authorization or viewer behaviour is correct.

Treat every manifest, property, identifier, label, URL, filename and imported report as untrusted. A malicious provider or contributor can deliberately craft files that are later processed by a librarian or CI. Trusted operator input is limited to selecting files, choosing output destinations and intentionally creating policy/approval files. A pull request author may propose policy changes, but does not thereby receive authority to approve their own changes. Security of the host browser/Node runtime and a compromised local OS are outside the application's boundary.

The browser reads selected files into memory. The CLI reads explicitly selected local inputs and writes explicitly selected report files. Parsed source objects enter a bounded normalizer; normalized objects enter the comparison engine; structured findings enter report rendering; optional approval records can change a finding's review status. No stage may turn manifest text into executable code, a filesystem path, a background network request or an approval instruction.

## Security objectives

1. Hostile input cannot execute script or commands, access arbitrary local files, or cause automatic network access.
2. Oversized/deep/complex input fails explicitly and predictably within documented budgets.
3. An incomplete assessment, unsupported feature, failed input or ambiguous match cannot become a silent green result.
4. A review approval applies only to the exact reviewed finding, inputs and effective comparison policy. Stale or unknown approval records never suppress findings silently.
5. Published packages, reports and CI instructions are reproducible enough to inspect, use pinned dependencies, and avoid leaking credentials or sensitive metadata by default.

## Threats and required controls

### P1: Stored XSS through labels and report data

IIIF permits values containing HTML. A label such as `<img src=x onerror=...>` must appear as text in the app and report; its markup must never be executed. Use framework text interpolation or DOM `textContent`. Do not use `innerHTML`, `dangerouslySetInnerHTML`, template concatenation of unescaped values, or a generic Markdown renderer for manifest content. This applies to error messages, finding paths, filenames, policy descriptions and approval notes as well as labels.

If a standalone HTML report embeds JSON in a script block, JSON serialization alone is insufficient: `</script>` terminates the block. Escape at least `<` as `\u003c` in the serialized payload, with `>`, `&`, U+2028 and U+2029 escaped as defense in depth. Encode attribute values separately when generating HTML. A report must not load fonts, scripts, analytics, image previews, styles or other resources from remote origins. Prefer a restrictive Content Security Policy; any required inline script should use a hash or nonce instead of broad executable inline content.

Links are optional evidence conveniences. Only render approved `https:` or `http:` links, require an explicit user click, and use `rel="noopener noreferrer"` for new tabs. Render all other schemes as plain text. Never load manifest image URLs automatically; even an image request can disclose that private metadata was opened.

Release checks: script-closing payload, HTML attributes, JavaScript/data/file URLs, encoded special characters and malicious filenames in both the browser and a saved report. Assert no execution or unexpected network request.

### P1: False assurance from unsupported or discarded content

A lossy normalizer can hide the same property on both sides, making two semantically different manifests appear equal. Maintain explicit assessed coverage and source locations. Report unsupported versions, unsupported constructs and normalization errors as visible incomplete-assessment findings. Required input failures and ambiguities must fail the CI gate regardless of user thresholds for ordinary changes. Zero differences must be distinguished from an input containing no assessed content.

Do not silently take only the first v2 sequence, first painting body, first language, first duplicate metadata label or first range reference. Handle the construct correctly or report an explicit coverage limitation. A preserved link proves the link survived; it does not prove linked OCR/annotations/search results, pixels, CORS, availability or authorization survived. The product must not imply that remote resources have been verified when no network checks occurred.

Release checks: unsupported v4 and collection inputs; extra v2 sequence; `Choice`, `SpecificResource` and selectors; duplicate IDs and language values; external references; malformed required fields; empty/missing content. Mutations must produce a precise difference or an explicit unsupported/incomplete finding, never silence.

### P1: Approval replay and stale approval suppression

An approval must bind to an exact finding and the evidence used to produce it. Use a versioned fingerprint computed from canonical serialization of: finding code/category and location; complete normalized before/after evidence; source and candidate content hashes; pair identity; effective comparison policy digest; and normalizer/comparator fingerprint version. Exclude the approval list itself from the comparison-policy digest to avoid circular hashing. Use an established cryptographic hash such as SHA-256. Do not concatenate unframed strings.

At minimum, invalid approval schema, mismatched fingerprints, approvals for missing findings, duplicate conflicting records, and changed policy/input/engine versions must be reported. Approved findings remain visible with reason/status rather than disappearing. Expiry/reviewer metadata, if supported, must be validated. Do not claim cryptographic identity verification merely because an approval contains a reviewer's name.

The CLI must not automatically approve findings or treat notes embedded in manifests as instructions. Version-controlled approvals require normal repository review; an author who can change both source and approval policy can deliberately permit a regression. Documentation should recommend required review of policy/approval files when used as a protected CI gate.

Release checks: modify candidate value, source value, policy or engine/fingerprint version after approval; reuse approval for another pair; alter a finding's location/evidence; malformed/duplicate/stale approval. None should silently suppress the new result.

### P1: Identity confusion through pairing or URL rewrites

URL rewriting is an operator policy, not a heuristic inferred from manifest content. Rules must have clear anchored prefix or exact-map semantics, preserve suffixes and detect collisions. No arbitrary user-supplied regular expression evaluation is needed. Multiple source resources mapping to one canonical identity, duplicate IDs and ambiguous pairings must be blockers. Never fall back from identity matching to array position without a conspicuous explicit policy and associated diagnostics.

Apply approved rewrite scope deliberately: replacing resource IDs indiscriminately in human text or unrelated external service URLs can hide changes. Report which rules were used. Preserve original identities alongside canonical ones in evidence. Unpaired inputs must be visible and included in totals and gate decisions.

Release checks: overlapping prefixes, near-prefix hostnames, trailing slash boundaries, query/fragment identifiers, percent encodings, duplicate/colliding canonical IDs, swapped equal-count canvases and unexpected candidate-only files.

### P1: Resource exhaustion and pathological JSON

Enforce documented limits before and during parsing/normalization: bytes per file and total batch, files per run, object nesting, total visited objects/array entries, string length, canvases/annotations/ranges, findings and rendered rows. CLI file size checks must happen before reading the full file. Browser `File.size` checks must happen before reading contents. Depth/complexity limits need a safe traversal, not unbounded recursive walking of arbitrary input. Valid JSON can still contain millions of tiny values.

Use cancellation or worker isolation where expensive browser work would otherwise freeze the interface. A limit hit must terminate that input with an explicit incomplete/error finding; partial results must never be presented as a complete pass. Finding truncation should disclose total/remaining counts and fail conservatively. Stream or process corpus pairs sequentially/bounded-concurrently rather than loading all manifests and reports simultaneously.

Release checks: oversized file, deeply nested JSON, large arrays, long strings, large flat object, cyclic references supplied through direct library calls, huge batch and many repeated differences. Record bounded completion and responsive cancellation where supported.

### P1: Filesystem traversal or unintended overwrite in the CLI

Manifest identifiers and linked URLs never determine files to read or output locations. Batch file references must resolve under the operator-selected input root; reject absolute paths, traversal outside the root and symlink escapes unless a separate explicit operator option deliberately permits them. `path.resolve` string checks alone do not detect symlinks: resolve real paths and verify containment with platform-aware path operations. Do not follow directory symlinks while recursively scanning inputs.

Output paths are operator-chosen. Refuse to overwrite source/candidate/policy/approval files. Avoid input/output directory overlap that causes generated JSON reports to become future inputs. Handle duplicate output filenames, case collisions and I/O failures explicitly. Never build shell commands from file paths or manifest text. Prefer APIs and argument arrays over command execution; core operation should require no subprocess.

Release checks: `../` entries, absolute paths, symlinks escaping root, encoded separators treated literally, Windows-style paths, spaces/metacharacters, same input/output path, preexisting output and filename collisions.

### P2: Prototype pollution and unexpected JavaScript values

`JSON.parse` does not by itself make keys safe for merging. Treat `__proto__`, `constructor` and `prototype` as data; never assign arbitrary keys to prototype-bearing dictionaries or merge input into configuration objects. Use `Map`, null-prototype dictionaries, own-property checks and explicit schema projection. Avoid `Object.assign` from untrusted objects into normal targets, recursive generic merge utilities and dynamic property access that calls inherited methods.

The public library boundary should accept unknown JSON-shaped values and validate them; do not assume TypeScript types validate runtime data. Do not trust user-defined `toString`/`toJSON` methods on arbitrary caller objects. Do not mutate the supplied object.

Release checks: hostile reserved keys at root and nested metadata positions; assertions that `Object.prototype` is unchanged; inherited properties excluded; invalid numbers/objects from direct library calls rejected explicitly.

### P2: Sensitive evidence disclosed by exports

Reports intentionally contain metadata and before/after values, which may be unpublished or sensitive. Keep processing local and give an explicit export action. Avoid recording full absolute local paths when a selected basename or pair key suffices. CI examples should upload reports only with deliberate artifact settings and explain that public-repository artifacts may disclose report contents. No telemetry, analytics, automatic crash uploads or background update calls belong in the core workflow.

Release checks: monitor browser and CLI network activity; inspect reports/errors for credential-like URLs and unnecessary local path exposure. URL secrets supplied as manifest data should remain data, not be fetched.

### P2: Dependency and GitHub Actions supply chain

Use a lockfile and `npm ci` in CI; keep runtime dependencies minimal. Review new packages and lifecycle scripts. Pin third-party GitHub Actions to full commit SHAs with readable version comments. Grant workflows only needed permissions, defaulting to `contents: read`. Run untrusted pull-request checks without secrets; do not use `pull_request_target` to execute contributor code. Publishing permissions/tokens belong only in reviewed release jobs triggered from trusted branches/tags.

Audit bundled output for accidental credentials, private fixtures and source paths. Build and test the packed distributable before release. Keep dependency-update changes scoped and require the same review/tests. Document vulnerability reporting and supported versions without promising response times the project cannot sustain.

Release checks: reproducible clean installation from lockfile, packed CLI smoke test, package-content inspection, action SHA/permission review, no secrets in test jobs, and dependency advisory review before release.

## Decisions that should remain explicit

- The first release performs no background or implicit network access. Network verification, if later added, is a separately invoked feature with host allowlists/SSRF, redirect, timeout, response-size and request-count controls.
- Findings have separate difference severity and assessment-completeness state. An approved expected change does not complete an unsupported assessment.
- “No unapproved assessed changes” is an appropriate outcome label. “Migration safe,” “fully preserved,” or “valid IIIF” require evidence beyond this product's stated scope.
- Browsers and HTML reports display manifest HTML as text. Fidelity to rich metadata rendering is secondary to non-execution in an auditing tool.

## Independent review status

Two independent agent reviews of the foundation found no remaining architecture/type blockers after input-bound fingerprints and role-scoped URI rules were specified. These are design reviews, not evidence of an implemented control. Implementation and release review must verify each applicable control rather than treating this document as evidence that the system is secure.
