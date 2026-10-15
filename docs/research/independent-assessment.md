# Independent IIIF migration-auditor assessment

Research date: 2026-10-15. Verdict: **credible narrow gap; technically shippable with a declared support profile; stronger differentiation than the field-science candidates.** No directly competing corpus-level before/after migration auditor surfaced. This is evidence of an underserved workflow, not proof that no institution has internal scripts.

## Competitor veto check

- Official Presentation Validator: https://github.com/IIIF/presentation-validator . It has schemas, fixtures and tests, and is for conformance of a supplied document. It does not advertise paired source/target preservation review. Do not market this project as inventing manifest validation.
- IIIF Commons Parser: https://github.com/IIIF-Commons/parser . Current README now advertises recursive CLI validation with JSON output/source code frames, converters, normalizers, traversers, v2/v3/v4 support and compatibility diagnostics for unsupported v4-to-v3 constructs. This is a significant established library/tool, not an abandoned gap. It does not advertise comparison of independently generated before/after corpora with migration policies and review reports. Using its upgrader to normalize the baseline would undermine independence from converter defects.
- IIIF Commons helpers: https://github.com/IIIF-Commons/iiif-helpers . Already offers range traversal, visible-canvas/page ordering, image-service interpretation and transcriptions. These functions may help cross-check behavior; they do not constitute migration acceptance.
- Mirador https://projectmirador.org/ supports side-by-side image comparison and v2/v3 Image/Presentation. Visual sample inspection is already solved. Corpus metadata/link/order/identity comparison is the proposed differentiator.
- IIIF text comparison https://tech.ldas.jp/en/posts/7d26676b34f614/ (2026-02-13) compares manuscript images and their transcription text, aimed at textual scholarship and OCR review rather than migration preservation. It is not a direct substitute.
- Generic JSON-LD diff tools exist, e.g. https://www.magstags.com/schema-comparison-tool/ . A version-aware domain model with corpus matching and explicit coverage is necessary to exceed their value.

Searches included IIIF diff, manifest comparator, semantic compare, migration auditor, migration validation, regression manifest, and v2/v3 comparison. The broad awesome-IIIF tools catalog https://github.com/IIIF/awesome-iiif lists converters, generators, editors, explorers and validators but no dedicated migration comparator in the inspected category.

## Primary technical grounding

The official Presentation 3 changelog, https://iiif.io/api/presentation/3.0/change-log/ , explains that the migration changes meaning as well as property spelling: sequence removal, range extent/embedding, language maps, attribution→requiredStatement, license→rights, description→summary, related→homepage, and external annotation structures. Therefore a generic tree diff is noisy and an automatic rename pass is insufficient. Some mappings require human intention, so policies are a core feature.

The official dual-publication cookbook recipe https://iiif.io/api/cookbook/recipe/0057-publishing-v2-and-v3/ gives a minimal v2/v3 pair using content negotiation and specifically warns that changing Canvas URLs can break third-party annotations. Its sample HTTP exchanges are dated 2025-03-07. This is a concrete preservation reason to compare identity separately from display content. It also shows that fetching two URLs alone is insufficient: the same URL can serve different representations by Accept header.

The official cookbook https://iiif.io/api/cookbook/index.html includes books, multilingual values, metadata, rights, viewing direction, missing pages, thumbnails, alternate renderings, structured metadata, and other image-based recipes. This is enough documented semantics to define a valuable static-image acceptance profile.

## Whole product required to avoid a pretty JSON diff

1. **Independent source-specific extraction.** Parse original v2 and v3 into small explicit semantic records with source JSON pointers. Do not convert baseline through the converter being audited. Keep unsupported/extension evidence and extraction diagnostics; never silently discard it.
2. **Corpus inventory and pairing.** Old/new directories plus explicit pair-map CSV/JSON; account for every input. Report missing, extra, duplicate/ambiguous, malformed and unrecognized files. IDs can change, so exact filename/ID pairing must be configurable and recorded. Do not pair canvases by index and then claim order was preserved.
3. **Meaningful preservation checks.** Manifest titles/descriptions in all languages; ordered metadata including repeated labels; rights and required statements; canvas count/order/labels/dimensions/identity; painting image identity/service endpoints/placements; table-of-contents hierarchy and targets; start position; viewing direction/paging behavior; thumbnails; download/homepage/seeAlso links; references to OCR/annotation pages. Link preservation can be checked offline without asserting link availability.
4. **Explicit URL rewrites.** Anchored prefix or exact rules scoped by field role; display original and rewritten values. A moved host is expected for a download but potentially destructive for third-party Canvas annotations. One global string replacement would hide real changes.
5. **Intentional-change policy.** Stable finding IDs, precise scopes, reason, before/after evidence, and a visible record of accepted changes. Retain waived findings; don't remove them from counts. Stale/unmatched policy entries should warn. New unexpected regressions must still fail CI.
6. **Reviewer product.** Findings lead with impact: “1 page missing”, “French title removed”, “attribution changed”, “Canvas identifier changed”. Every result has both source pointers/values, explanation, policy disposition, and support/uncertainty status. Filters, search, canvas navigation, totals and sample corpus make the report useful to librarians as well as developers.
7. **Reproducibility.** Local CLI + portable sanitized HTML and machine JSON report; stable ordering and hashes of inputs/config; documented exit codes; examples and GitHub Actions recipe; no accounts or hosted backend necessary. Source text is untrusted HTML and must never execute in reports. Bundle assets so reports remain viewable offline.
8. **Honest verdict.** Conformance, preservation and runtime/viewer compatibility are separate. “No unexpected changes in supported checks” is defensible. “Migration safe” is not, especially if external ranges/annotations, Choices, selectors, AV or extensions are unexamined.

## Public fixtures: enough to test usefulness, insufficient by themselves to prove whole-world fidelity

Available primary sources: v2 examples https://iiif.io/api/presentation/2.1/example/ (linked by core IIIF community in https://groups.google.com/g/iiif-discuss/c/2QPpZdF79OA , 2017-08-04); v3 cookbook; official validator fixtures/tests; parser fixtures/tests. The repository https://github.com/IIIF/fixtures is mainly an index webapp for resources stored elsewhere, so do not assume cloning it provides a complete corpus.

The minimal paired official recipe is a clean smoke test, not a serious test corpus. A good release needs checked-in curated v2/v3 pairs whose expected semantic snapshots are **hand-authored independently** and traced to spec references. Include multiple realistic books/maps with multilingual metadata, rights, repeated metadata keys, multi-image canvases, OCR/annotation references, and nested ranges. If public institutional snapshots are used, pin source URLs, retrieval dates, hashes and redistribution terms; do not rely on mutable live endpoints in CI.

Use mutations to demonstrate value: delete canvas, reorder page, swap image, remove one language, drop attribution/rights/download/OCR reference, mutate dimensions, change Canvas IDs, omit range membership and break start targets. Negative controls must show that sanctioned host moves and v2/v3 shape changes do not flood users with false alarms. Run these assertions through CLI and report, not just pure helper functions. A realistic corpus of hundreds/thousands of manifests should check pairing accounting and performance.

Critical hard cases that must be supported or explicitly produce an incomplete/unsupported result:

- V2 multiple sequences; don't quietly inspect the first sequence only.
- Duplicate Canvas IDs or duplicate pairing keys; sets erase important errors.
- Arrays whose order is meaningful versus set-like fields; never sort globally.
- V2 language-tagged objects/scalars versus v3 language maps, including none and multiple strings.
- Nested/external/cyclic range graphs and Canvas fragments; cycle bounds and source references matter.
- Multiple painting annotations, Choice bodies and SpecificResource selectors. A static-image product can initially refuse unsupported constructs, but it must count them and prevent a clean pass.
- Image API 2/3 service declaration differences versus actual identity changes; don't equate URLs merely because their filenames match.
- HTML textual values; compare/present safely while preserving meaningful content.
- Extension properties and custom contexts: raw residual-change warning is safer than pretending the fields do not exist. No arbitrary remote JSON-LD execution needed.
- Ignored/waived changes, unknown input versions, invalid JSON, truncated reads, missing counterpart files, and unsafe output paths.

## Critical doubts

**Demand:** research establishes real preservation risk and abundant migration building blocks, but not frequency or severity of the purchasing/use decision in the proposed beachhead. Existing teams may already write snapshots around their generator. Best positioning is an open-source acceptance workflow for teams that currently sample manually or compare raw JSON, not a claim that IIIF migration is unsolved.

**Meaning:** some spec changes intentionally alter semantics. The application cannot decide whether shortening a description or restructuring ranges is acceptable. It must make these changes explicit and reviewable. A false equivalence is worse than a visible false positive.

**Scope:** static imagery can still involve complex painting and range models. A complete supported profile is feasible; universal IIIF preservation is not a reasonable immediate guarantee. Publish a check-by-check matrix and fail incomplete rather than hiding complexity.

**Independence:** a new independently written extractor introduces bugs of its own. Differential cross-checks against Commons traversers are helpful, but hand-reviewed golden semantic records and mutation tests must remain the oracle.

**Runtime:** offline JSON inspection cannot verify that image servers return the intended pixels, that auth/CORS works, or that particular viewers render correctly. Such checks would require opt-in network/browser tests and should not be implied by the report.

**Verdict:** proceed if the product's finish line includes all eight whole-product elements and the supported-profile gate above. A polished two-input page that parses labels/canvas counts and shows a green “equivalent” badge would fail this commission.
