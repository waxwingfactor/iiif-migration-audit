# IIIF Migration Audit

**Catch lost collection meaning before a manifest migration goes live.**

IIIF Migration Audit compares saved IIIF Presentation 2.1 and 3.0 manifests for digitized books and still images. It finds lost languages, metadata, rights, pages, ordering and identities, with evidence pointing back to both original files. Review one object in the browser or audit a paired corpus in CI.

[Open the browser workbench](https://waxwingfactor.github.io/iiif-migration-audit/) · [Download a release](https://github.com/waxwingfactor/iiif-migration-audit/releases/latest) · [User guide](docs/user-guide.md) · [CLI reference](docs/cli.md)

## Try a real workflow

Open the workbench and choose **Explore example** to see a fictional migration with deliberately lost information. Then load your own baseline and candidate JSON files, inspect findings and source pointers, and export a review report. Add explicit URI mappings for planned host changes; accept an intentional change only with a reason. Export your policy to resume or reproduce that exact review in the CLI.

Comparison runs locally in your browser. There are no accounts, uploads, analytics, remote fonts, linked-resource downloads or automatic saved sessions. The hosting provider receives ordinary application-page requests; use the downloadable static workbench or CLI if even those requests are inappropriate. Reports and policies can contain unpublished metadata, so share them deliberately.

## Use the CLI

Requires Node.js 22.12 or newer. Download `iiif-migration-audit-1.0.0.tgz` from [v1.0.0](https://github.com/waxwingfactor/iiif-migration-audit/releases/tag/v1.0.0), then install the local archive. Installation needs no registry runtime dependencies.

```sh
npm install --global ./iiif-migration-audit-1.0.0.tgz
iiif-audit compare before.json after.json --format html --output review.html
iiif-audit compare before.json after.json --policy review-policy.json
iiif-audit batch snapshots/pairs.json --format json --output corpus-audit.json
```

Exit codes distinguish pass (`0`), review (`1`), preservation failure (`2`), incomplete assessment (`3`), and input/execution error (`4`). Nonzero results can be expected audit outcomes. Existing output files and selected inputs are protected. See the [CLI reference](docs/cli.md) for explicit corpus inventories, snapshots, policy format, resource limits and CI recipes.

The release includes clean and damaged examples, portable JSON/CSV/HTML reports, a static browser archive, dependency notices and checksums. The browser archive includes local-server instructions; opening its HTML directly as a file does not support its worker.

## Why this exists

For digital-library engineers replacing IIIF manifest generators who are dissatisfied with manual viewer spot checks and noisy JSON diffs, IIIF Migration Audit is a migration review workbench that reveals lost pages, metadata, rights, and annotation identities before a collection release. Unlike IIIF conversion and conformance libraries, it compares independently generated source and candidate manifests through traceable preservation checks, explicit URI mappings, recorded review decisions, and reproducible CI reports.

The beachhead, constructed usage scenarios, market and product alternatives, and three independent research rounds are published in the [product definition](docs/product.md) and [research assessment](docs/research/independent-assessment.md). Public research found an underserved workflow; practitioner validation and adoption remain unproven.

## What a pass means

A pass means no unresolved blocking differences were found **within the declared still-image profile**. It is not certification of IIIF conformance, image pixels, OCR payloads, legal rights, link availability, authentication or viewer behavior. Use a conformance validator and intended-viewer checks alongside it.

Unsupported constructs, unresolved external annotation/range content, unknown extensions, ambiguous identities, extra v2 sequences and unsupported versions produce incomplete coverage, rather than a clean result. Coverage cannot be waived with an approval. Decisions bind to exact input text hashes, comparison semantics and URI policy; even reformatting a source invalidates its approvals. See [supported semantics](docs/core-api.md), [architecture](docs/architecture.md) and [threat model](docs/threat-model.md).

## Develop and contribute

```sh
npm ci
npm run check
npm test
npm run build
npm run test:package
npx playwright install chromium
IIIF_TEST_PREVIEW=1 npm run test:browser
npm run dev
```

CI checks formatting, types, independent acceptance tests, production Chromium journeys, accessibility, an offline package install, and Node.js compatibility on Linux and macOS. Browser tests use Chromium; other browsers have not received equivalent release qualification. Changes go through scoped pull requests and independent review. See [contributing](CONTRIBUTING.md), [security](SECURITY.md), [release criteria](docs/release-criteria.md), and the review records under `docs/reviews/`.

MIT license. External fixtures retain their documented licenses and attribution. Bundled dependency licenses are included in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The project is an independent tool and is not an official IIIF Consortium product.
