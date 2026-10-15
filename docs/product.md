# Product definition

## Beachhead

A digital-library engineer at a small or medium academic or cultural-heritage institution, responsible for replacing an IIIF manifest generator or migrating digitized books and still images from Presentation 2.1 to 3.0. A collections librarian reviews descriptive and rights changes; the engineer owns the release decision. Both have old and candidate JSON exports. This is an episodic migration and recurring generator-regression job, not general collection management.

## Compelling reason to use it

A replacement manifest can conform to its specification while omitting a language, changing page order, losing attribution, or replacing an identifier used by an external annotation. Spot checks and raw JSON diffs require institution-specific scripts and sustained human attention. The product reduces that work to traceable preservation findings and explicit review decisions. Public evidence supports this workflow gap; no practitioner interviews, adoption claims, or market-size estimates have been fabricated.

## Alternatives

- **Market alternative:** bespoke scripts, spreadsheets, manual viewer spot checks, and raw JSON diffs combined with conformance validation.
- **Product alternative:** IIIF Commons parser/conversion tooling plus a general JSON diff or snapshot test. These are capable free tools, not straw-man competitors. Official validators, Tripoli, and Publication Preflight solve adjacent conformance/publication checks.
- **Difference:** independently extract source and candidate semantics with provenance, match identities conservatively, expose incomplete coverage, apply role-scoped URL rules, retain evidence-bound review decisions, and produce consistent browser/CLI/corpus reports.

## Two-sentence positioning statement

For digital-library engineers replacing IIIF manifest generators who are dissatisfied with manual viewer spot checks and noisy JSON diffs, IIIF Migration Audit is a migration review workbench that reveals lost pages, metadata, rights, and annotation identities before a collection release. Unlike IIIF conversion and conformance libraries, it compares independently generated source and candidate manifests through traceable preservation checks, explicit URI mappings, recorded review decisions, and reproducible CI reports.

## Scenarios (constructed from documented workflows, not customer interviews)

1. **Bilingual book:** before release, the librarian imports old and replacement manifests. Both display the title, but an untagged description was dropped while English survived. The audit identifies the lost text with its original pointer; the engineer repairs the generator and reruns the same check.
2. **Image host replacement:** an engineer explicitly maps the old image-server prefix to the new one. Expected image URI changes remain visible in the report, while accidental Canvas-ID changes remain blockers because those IDs anchor researchers' annotations.
3. **Page ordering regression:** a generator sorts page labels lexically. The auditor matches stable IDs and reports changed page order and table-of-contents membership. Duplicate labels never cause pages to be merged or guessed.
4. **Collection release:** a batch pairs file lists the complete expected corpus. Every pair is accounted for; missing files, malformed documents, unsupported structures, stale approvals, and unpaired files prevent a misleading all-clear.

## Whole product for this beachhead

Local browser file/paste comparison; an instructive demo; source-linked findings with search and filters; page pairing and ordering review; explicit URL mapping policy; reasoned intentional-change approvals and portable policy export; private local processing; standalone escaped HTML/JSON/CSV reports; a Node CLI for individual comparisons and corpus batches; deterministic finding identities and meaningful CI exits; examples, clean-install instructions, troubleshooting and a public release.

The supported profile is still-image Presentation 2.1/3.0 manifests with embedded canvases and painting annotations. All source properties must either be semantically compared, recorded as known structural syntax, or reported as an incomplete coverage notice. Unsupported Presentation 4, time-based media, unresolved linked content, extra old sequences, unknown extension semantics, ambiguous identities and unhandled complex bodies cannot yield a pass. Remote pixels, OCR payloads, network availability, authentication and viewer behavior require other checks.

## Discovery decision

Three rounds: parallel specialist discovery and rejection of solved ideas; independent direct-competitor searches; feature-level checks against current native tools/SDKs and an adversarial whole-product critique. Reports live in `docs/research/`. No directly equivalent inspected product surfaced as of 2026-10-15. This is a bounded public-research conclusion, not universal uniqueness or proof of demand.

Relevant framework: [Moore on the beachhead and whole product](https://geoffreyamoore.com/positioning/) and [Crossing the Chasm overview](https://geoffreyamoore.com/book/crossing-the-chasm/). Only audience characterization, compelling reason, alternatives, scenarios, and whole-product scope are applied; no distribution or financial strategy is prescribed.
