# Comparison API and supported semantics

The comparison core is deterministic apart from an injectable report timestamp. It performs no I/O, network requests or source mutation.

```ts
import { audit, emptyPolicy, applyDecisions, parsePolicy } from './src/core/index';
const report = await audit(
  { name: 'before.json', text: oldJson },
  { name: 'after.json', text: newJson },
  { policy: emptyPolicy() },
);
const reviewed = applyDecisions(report, [
  { findingId: report.findings[0]!.id, reason: 'Approved by the collections librarian' },
]);
```

Only accept a finding after inspecting its exact evidence. `applyDecisions` returns a new report, retains all accepted findings and reasons, and cannot waive incomplete coverage. Policies serialize as JSON with `schemaVersion: "1.0"`, `uriRules`, and `acceptedChanges`. `parsePolicy` rejects unknown keys, invalid decisions, duplicate approvals and conflicting rule prefixes.

URI rules specify `scope`, `fromPrefix` and `toPrefix`. Scopes are `manifest`, `canvas`, `range`, `image`, `image-service`, and `link`. HTTP(S) host/path prefixes have no query, fragment or credentials; matching requires a path/fragment/query/end boundary, so `/canvases` never matches `/canvases-extra`. Longest prefix wins within the same role; rule order does not affect fingerprints. Separate source identities cannot collapse into one under a rule. Mapped Canvas/Range/Manifest identity changes still require review because external references may break.

## Assessed facts

Manifest/Canvas/Range labels and language values; descriptions/summaries; repeated ordered metadata rows; rights and required attribution; link descriptors; provider/logo references; image body/service identity, declared Image API version, format and dimensions; ordered painting layers and targets; Canvas order and identity; local embedded Range membership and hierarchy; direction, start, behavior and navigation date. Literal HTML is retained as text. Language tags are case-insensitive; text, multiplicity, and meaningful array order remain significant. No HTML whitespace/markup normalization guesses equivalence.

Presentation 2 wrapper syntax maps to the corresponding named facts. A legacy sequence label has no automatic Presentation 3 equivalent and appears as a review finding if removed. An untagged value becoming language-tagged is a real assertion change, not silently declared equal. Image API 2-to-3 changes are separate from Presentation API migration. Descriptor additions are visible; added navigation or rights fields require review because they can change defaults or assertions.

Unsupported versions, custom contexts/extensions, cross-version fields in the wrong resource, multiple old sequences, unresolved structural resources, non-painting annotation payloads, complex bodies/selectors, time-based content, ambiguous identity and deep/cyclic range graphs are explicit incomplete coverage. External image/OCR/PDF payload bytes, HTTP/CORS/authentication and viewer behavior are outside this offline comparison. Use the official validator and viewer/network checks alongside this tool.

## Evidence and verdict

Findings carry original source pointers, before/after normalized values, code, category and severity. A SHA-256 ID binds exact original snapshot bytes, tool/profile/fingerprint versions, URI rules and finding evidence. Reformatting or changing a snapshot, comparison policy or tool semantics invalidates an earlier approval. Stale approvals remain visible and block a pass until removed/reviewed. Summary error/warning/info counts exclude accepted findings; accepted findings have their own count.

Verdict precedence: `incomplete` coverage, then `fail` for unaccepted errors, then `review` for warnings, otherwise `pass`. A report may be incomplete and contain errors; always inspect both. `AuditError` has stable `code`, `message`, and optional source `pointer` for invalid input/configuration.

## Resource bounds

20 MiB UTF-8 per input; nesting64;300,000 parsed value nodes;20,000 canvases; bounded complex value matching; maximum assessed flat Range-reference depth64. Duplicate object keys, reserved prototype-related keys, nonfinite/unsafe integers and decimal tokens losing precision are rejected before evidence is discarded. Resource-limit errors ask the user to reduce/review the document, never return a false pass. Browser comparison is isolated in a cancellable Worker.

Independent golden/mutation tests and raw official fixtures are in `tests/`; original fixture SHA-256 and license records are in `tests/fixtures/official/SOURCES.json` and accompanying notices. The comparator is not tested solely against output from a converter.
