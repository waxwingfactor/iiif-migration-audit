# Acceptance scenarios and release gates

This document defines observable behavior for the first complete release. It is a QA contract, not a promise of universal IIIF conformance or a replacement for testing a collection in its intended viewer. Every scenario must be exercised through the shared audit engine; representative scenarios must also run through the browser and command line interfaces.

## The supported preservation profile

The first release serves engineers comparing independently generated **IIIF Presentation 2.1 and 3.0 static-image Manifests**. Either input may use either supported version. It audits source/candidate facts within the documented profile, rather than converting both inputs with the generator under test.

The supported facts must be listed in the user documentation and represented in coverage output. At minimum, they include manifest and Canvas identities; ordered Canvas membership; Canvas dimensions; image painting bodies and targets; image-service identities; multilingual labels, descriptions/summaries and metadata; rights and required attribution; rendering and machine-readable metadata links; reading direction and supported presentation behaviors; and embedded Range membership/order. A field may only be advertised as supported after its valid forms and failure modes have corresponding fixtures.

The initial supported path is a single v2 sequence or a v3 ordered Canvas list, with supported embedded static-image painting structures. Alternate v2 sequences, audiovisual content, unhandled selectors or choices, unresolved external structural resources, arbitrary extension semantics and unknown versions cannot silently take the ordinary supported path. They must either be implemented with tests or produce an explicit incomplete-coverage finding. An input need not be fully conformant for the tool to explain its problems, but malformed data must not be silently reinterpreted as valid empty data.

The report must distinguish **a complete audit of this declared profile** from checks outside its scope. Comparing an external image URI does not establish equality of image bytes, availability, color fidelity, CORS behavior or viewer behavior. The release must state these limits wherever a successful result could otherwise imply more. Missing image bytes alone are not an extraction failure for a profile that explicitly compares image references; unresolved external structural or annotation content that the audit needs to inspect is incomplete coverage.

## Result rules

1. **Pass** means every requested pair was processed, all checks required by the selected profile were complete, and no unresolved blocking preservation change remains.
2. **Needs review** means the report contains a meaningful detected change that requires a documented human decision. A warning cannot disappear because its source value was not extracted.
3. **Incomplete** means the tool cannot establish the profile's requested comparison because some relevant structure, identity pairing or data is unsupported, ambiguous or missing. No clean badge or successful CI exit is permitted.
4. **Error** means input, configuration, resource limits or execution prevented a usable audit. It is distinct from a finding that data was lost.
5. An accepted intentional change is visible as accepted. Acceptance cannot make incomplete coverage complete, bypass parse/configuration errors, or imply formal specification conformance.

The implementation may use different internal names or numeric exit codes, but these user-visible distinctions must survive the CLI, JSON, HTML and browser interfaces. CLI documentation must define its exact exit-code contract; consumers must not have to parse prose.

## End-to-end scenarios

### A librarian verifies bilingual metadata after a generator upgrade

**Given** a v2.1 book whose `description` contains an untagged string and a separate English value, and a v3 candidate retaining both values in the appropriate language buckets, **when** the librarian imports the pair, **then** the text-retention checks pass despite the structural differences between versions. The report names both input versions and links each extracted fact to its source pointer.

**When** the candidate loses only the untagged value, **then** the report identifies that exact loss, its language bucket, affected object and original pointer. It must not show an empty change list merely because an intermediate upgrader also loses that value. This reproduces the class of loss documented in [IIIF Commons parser issue 39](https://github.com/IIIF-Commons/parser/issues/39); the fixture tests this tool's independence and does not assert that a current external library still has the bug.

### An engineer replaces the image host while preserving annotation anchors

**Given** a migration that intentionally changes image-service hosts, **when** the engineer adds an image-service URI rewrite rule, **then** matching image-service references can be classified as expected under that rule, and the report records the rule used.

**When** the same host change occurs in a Canvas ID, **then** it is still reported as an identity change unless a separate Canvas-identity policy explicitly permits it. An image-host rule must not approve annotation-anchor changes. A changed target fragment, query, path case or trailing slash remains observable unless the policy explicitly covers that role and transformation.

### A collection release reorders pages without violating the schema

**Given** eleven source pages in their intended order, **when** a candidate sorts labels lexically into `1, 10, 11, 2, ...`, **then** the audit identifies the order change using paired Canvas identities and shows enough before/after context to locate it. All pages still being present cannot turn this into a pass. A related Range whose sequence changes is independently reported.

**When** a page is deleted from the middle, **then** subsequent pages are not falsely paired by position and reported as wholesale content changes. The absent page is a removal; matching surviving IDs retain their identity.

### An engineer audits changed IDs without guessing correspondence

**Given** old and candidate manifests with changed Canvas IDs, **when** an explicit, role-scoped, one-to-one mapping establishes correspondence, **then** the audit can compare their content while retaining and reporting original identities and the mapping provenance.

**When** multiple source objects map to one candidate, duplicate IDs occur, or two equally plausible matches exist, **then** pairing is incomplete and the report explains the collision. Matching labels, basename strings or array positions is insufficient to establish identity. Any optional heuristic must remain visibly provisional and cannot by itself produce a release pass.

### A reviewer accepts an intentional rights or attribution change

**Given** an explicit changed rights statement or attribution, **when** the reviewer accepts the finding with an explanation, **then** the accepted status and explanation appear in saved review data and exported reports. Original and candidate values remain available.

**When** either input changes, the policy changes, the finding changes or the supported audit/profile version changes incompatibly, **then** the prior decision must be invalidated or explicitly reported stale and require revalidation. A saved decision must bind to the exact content and policy it approved; a file name or ordinal finding number is insufficient. Accepting one finding must not accept a later unrelated finding with the same display title.

### A batch operator obtains a trustworthy release result

**Given** a batch with explicit source/candidate pairs, **when** all pairs are complete and have no unresolved blockers, **then** the aggregate result passes and every requested pair appears exactly once in the report.

**When** one pair has malformed JSON, a missing file, unsupported structure, ambiguous mapping, unmatched requested input or unresolved loss, **then** the batch exits unsuccessfully, preserves the results for other pairs, and identifies the failing pair. No successful subset may be presented as the entire batch. Duplicate batch keys and duplicate source/candidate pair assignments must be rejected or explicitly diagnosed before a green result.

### A first-time user completes the workflow without developer help

**Given** the published release and documented runtime requirements, **when** a user follows the quick start from a clean supported environment, **then** they can load an included example, run a comparison, understand a loss, apply or review a policy, export a report, save their review and reopen it. The CLI and browser reports agree on the same finding identities and overall result.

The browser's sample path must not require an account, paid API, network-hosted font, secret, external collection fetch or generated AI explanation. A user must be able to locate file import, supported formats, help and export using keyboard navigation and readable focus states. Empty, working, failed and completed states must explain what happened and the next available action.

### A hostile manifest is safe to inspect and share as a report

**Given** text values containing `<script>`, closing HTML tags, event attributes, template delimiters, Markdown link tricks, `javascript:` URIs, bidirectional controls and spreadsheet-formula prefixes, **when** the user audits and exports them, **then** source values remain inspectable as inert data. No content executes, auto-navigates, fetches a remote resource, modifies application state or becomes a spreadsheet formula through the report path.

Opening an exported HTML report must not require loading third-party scripts or run input-provided markup. Clickable resource links must use an allowlisted protocol and safe target behavior; dangerous schemes must appear as text. Downloaded JSON remains valid JSON, including control characters and hostile object keys. CSV output must neutralize formula interpretation without silently altering what the evidence says; document the export transformation. Sensitive local paths must not be included in publicly shareable reports by accident.

## Golden fixture and mutation matrix

Golden fixtures are minimal independently authored inputs with explicit expected facts/findings. Mutations change one property at a time so that a test establishes the reason for its result. Generated converter output alone is insufficient as an oracle. At least one realistic multi-page sample must exercise the whole import-to-report flow with its license/attribution recorded.

| ID  | Baseline or mutation                                                       | Required outcome                                                                                                         |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| G01 | Equivalent minimal P2.1 → P3 static-image manifest                         | Complete profile; no invented loss from renamed keys or added AnnotationPage wrappers.                                   |
| G02 | Identical supported P2.1 → P2.1 and P3 → P3                                | Stable pass, reproducible findings/report facts, no mutation of either input.                                            |
| G03 | Valid textual singleton, array and v2 language-value forms                 | All supported values extracted; no truthiness filtering of valid empty optional values.                                  |
| M01 | Mixed-language description loses the untagged value                        | Exact text/language loss, with source pointer; regression for issue 39 class.                                            |
| M02 | One language bucket lost; same text remains in another                     | Loss remains visible; no language-insensitive deduplication.                                                             |
| M03 | Repeated metadata label with different values loses one entry              | Missing entry detected; metadata is not collapsed into a label-keyed object.                                             |
| M04 | Two identical metadata entries become one                                  | Multiplicity change detected; set conversion must not erase the difference.                                              |
| M05 | Metadata entries reorder without losing values                             | No false deletion caused by ordinal pairing; any order finding is separate and documented.                               |
| M06 | Credit text moves to the equivalent required-statement value               | Equivalent content recognized; generated display label differences handled explicitly.                                   |
| M07 | Rights or attribution removed/changed                                      | Visible loss/change; no automatic legal interpretation or invented replacement.                                          |
| M08 | `seeAlso` changes between supported singleton/link-object forms            | Equivalent link retained; missing identifier/malformed link diagnosed, not silently skipped.                             |
| M09 | One Canvas removed, inserted, reordered or duplicated                      | Separate membership/order/duplicate outcomes; no positional cascade of false pairs.                                      |
| M10 | Canvas dimensions change or become zero/string/null                        | Geometry change or invalid input/coverage finding, as appropriate; invalid geometry never looks absent and clean.        |
| M11 | Painting body, image format, image-service ID or target changes            | Role-specific finding with object context; non-image content must not masquerade as an Image.                            |
| M12 | Source has multiple paintings or a Choice/SpecificResource                 | Every supported form is checked; unsupported form marks coverage incomplete rather than selecting the first.             |
| M13 | Embedded Range loses a Canvas, child Range, label or order                 | Exact structural loss/change shown; unresolved/cyclic Range references cannot hang.                                      |
| M14 | Start Canvas, reading direction or supported behavior changes              | Documented semantic change finding; absence and explicit values are not conflated without an approved rule.              |
| M15 | Unknown extension contains additional text or structure                    | Visible incomplete-coverage diagnostic retaining the extension path; not a silent pass.                                  |
| M16 | Unsupported version/context or audiovisual content                         | Clear unsupported-profile result; no fallback to an empty static-image comparison.                                       |
| M17 | External annotation/structural page is unresolved                          | Explicit coverage boundary; no statement that its uninspected contents are preserved.                                    |
| P01 | Image-service rewrite rule only                                            | Expected matching within that role; other URI roles unchanged.                                                           |
| P02 | Prefix near miss, reversed rule, overlapping rules, collision or map cycle | Deterministic diagnosis; no broad string replacement or rule-order-dependent silent acceptance.                          |
| P03 | URI fragment/query/trailing slash/case changes                             | Exact differences remain unless covered by an explicit documented rule.                                                  |
| P04 | ID map is many-to-one; duplicate IDs in either input                       | Ambiguous pairing blocks pass; report original identifiers and collision.                                                |
| P05 | Saved acceptance replayed unchanged                                        | Same finding receives same decision; export retains its explanation and binding.                                         |
| P06 | Candidate/source/policy/finding/profile changes after acceptance           | Stale decision cannot approve the changed evidence.                                                                      |
| P07 | Saved policy/review file malformed or references absent finding            | Clear configuration error or stale/unmatched diagnostic; no silent blanket approval.                                     |
| S01 | HTML/script/URL payload in every displayed source field and filename       | Inert display in app and HTML report; dangerous URL schemes never clickable.                                             |
| S02 | `__proto__`, `constructor`, duplicate/confusable keys and deep structures  | No prototype pollution, crash, silent overwrite of evidence or infinite traversal; unsupported/malformed data diagnosed. |
| S03 | Formula-leading exported CSV cell                                          | Spreadsheet opens inert evidence; transformation disclosed.                                                              |
| S04 | Over-limit bytes, nesting, arrays, text length or total facts              | Early bounded failure with useful explanation; UI remains usable, no partial pass.                                       |
| S05 | Batch file path traversal or unexpected URI in local mode                  | No arbitrary file read, write or network access beyond documented user-selected inputs.                                  |
| B01 | One incomplete/error pair among otherwise clean batch                      | Non-success aggregate; other results retained; requested-pair count matches.                                             |
| B02 | JSON/HTML/CSV exports compared with UI/CLI                                 | Same counts, statuses, identities, policy and coverage; exports are complete and valid.                                  |
| U01 | Keyboard-only import → filter → inspect → export                           | Visible focus, named controls, logical focus order, no trapped dialogs or inaccessible required action.                  |
| U02 | Malformed input corrected and rerun                                        | Prior results cannot persist as if they describe the new inputs; state labels identify current evidence.                 |

## Release-blocking requirements

### Correctness and evidence

- Every advertised preservation check has equivalent-version, cross-version, loss and malformed/unsupported fixtures.
- Findings retain both original values, original IDs, version and precise source/candidate pointers where available. A mapping is evidence, not a replacement for provenance.
- Text multiplicity and language identity survive extraction. Unicode must not be normalized in a way that hides loss without an explicit documented comparison policy.
- All inputs are treated as immutable. Comparing a source to a candidate cannot alter a later comparison of the same source.
- Unknown, ambiguous, skipped and over-limit checks are counted and surfaced. A supported subset's success cannot override incomplete coverage.
- Findings and decision keys are deterministic for the same inputs and policy; timestamps and display ordering do not change identities. Compare incompatible report versions explicitly.
- Results state their scope and limits. No report calls image pixels, remote availability or viewer behavior verified unless those checks actually ran and their outcomes are separately recorded.

### Interfaces and durability

- CLI and browser use the same audit logic and return equivalent results on golden fixtures. Empty/invalid/cancelled operations do not reuse stale successful output.
- The CLI can run without an interactive browser, read local files, export machine-readable and human-readable results, and provide a documented failure exit for CI.
- Batch configuration/policy/review formats are versioned and validated. Saved decisions can be reopened and stale decisions are recognizable.
- Report files are shareable, readable offline and safe under hostile values. Export filenames cannot overwrite source inputs accidentally; CLI overwrite behavior is explicit.
- A fresh installation and documented example succeed on every advertised platform/runtime. Required packages, lockfile, license notices and distribution artifacts are present.

### Product quality and independent review

- CI runs meaningful engine, CLI, export and browser workflow tests, plus type checking and build checks. A release tag cannot bypass a failing required job.
- At least one independent agent reviews algorithm correctness and edge cases; another assessment exercises the product as a first-time user and judges visual hierarchy, legibility, accessibility and report usefulness. Findings must be resolved or recorded as release-limiting defects; an agent's general approval is not a substitute for test evidence.
- A reviewer checks actual rendered desktop and narrow-screen layouts, long multilingual labels, a large finding list, empty state, incomplete coverage and error state. No clipped controls, unreadable tables, arbitrary gradient styling or decorative status colors without text.
- README/help includes the exact beachhead, supported preservation profile, meaningful complete example, CI command, policy example, review/export instructions and known limits. A clean result is described in terms of the declared audit, not as a guarantee that a migration is universally safe.
- Final release notes list the exercised scenarios, supported runtimes, known exclusions and unresolved limitations. An installation or workflow blocker cannot be relabeled as a future feature while claiming a complete usable release.
