# Command line and portable reports

The CLI compares saved IIIF Presentation 2.1/3.0 still-image manifests using the same engine as the browser. Comparison runs locally, without accounts or network requests. A separate `snapshot` command retrieves one explicitly selected URL.

## Install and try it

Use Node.js 22.12 or newer. Download the CLI `.tgz` from this repository's GitHub Releases, then install the downloaded archive:

```sh
npm install --global ./iiif-migration-audit-0.1.0.tgz
iiif-audit --version
iiif-audit --help
```

For a source checkout:

```sh
npm ci
npm run cli -- compare examples/baseline/book.json examples/candidate/book.json
npm run build:cli
node dist/cli/index.js --help
```

The included equivalent v2/v3 notebook pair should pass. The damaged candidate deliberately loses a French summary and a page:

```sh
iiif-audit compare examples/baseline/book.json examples/candidate/book-loss.json \
  --format html --output notebook-review.html
```

This command saves a complete offline report and returns a failure status because losses were found. A nonzero comparison exit can be an expected test result; it does not necessarily mean the command malfunctioned.

## Compare one pair

```sh
iiif-audit compare BEFORE.json AFTER.json
iiif-audit compare BEFORE.json AFTER.json --format json --output audit.json
iiif-audit compare BEFORE.json AFTER.json --format html --output audit.html
iiif-audit compare BEFORE.json AFTER.json --format csv --output audit.csv
iiif-audit compare BEFORE.json AFTER.json --policy review-policy.json
```

Without `--output`, stdout contains only the requested report. A concise result goes to stderr, so redirection produces valid JSON/HTML/CSV. File extensions do not select the format; use `--format` explicitly. Existing output files are protected; `--force` replaces a previous report. The CLI refuses to overwrite selected manifests, the policy, the pairs file, or links to those inputs, including when `--force` is supplied. Reports created as files use private file permissions where the operating system supports them.

Relative command-line paths resolve from the current working directory. Names beginning with `--` can be given after the `--` delimiter. Only local file paths are accepted by comparison; manifest IDs and linked URLs are treated as data.

## Review expected changes

The browser can export a versioned policy containing URI rules and reasoned decisions. Use that file with `--policy` to reproduce the review in CI. A minimal policy is:

```json
{
  "schemaVersion": "1.0",
  "uriRules": [],
  "acceptedChanges": []
}
```

A role-specific host rule looks like this:

```json
{
  "schemaVersion": "1.0",
  "uriRules": [
    {
      "scope": "image-service",
      "fromPrefix": "https://images.old.example.org/iiif/",
      "toPrefix": "https://images.new.example.org/iiif/"
    }
  ],
  "acceptedChanges": []
}
```

Rules apply to a specified role, use canonical HTTP(S) host/path prefixes, preserve suffixes and respect path boundaries. An image-service rule does not authorize a Canvas identifier change. Collisions and ambiguous matches block a pass.

Each `acceptedChanges` record contains `findingId` copied exactly from the report and a nonempty `reason` describing the intentional change. Original evidence and the reason remain visible. Do not replace fingerprints with display titles or ordinal finding numbers. Decisions bind to exact source/candidate snapshot hashes, evidence, active URI policy and comparison semantics. Even reformatting a snapshot intentionally invalidates its decisions. Stale/unmatched decisions are reported and block a pass. Unsupported coverage cannot be accepted into completeness. Changes to a policy or approval file should receive the same repository review as source changes.

## Compare a corpus

Create an explicit pairs file at the common root of the saved snapshots:

```json
{
  "schemaVersion": "1.0",
  "pairs": [
    {
      "key": "notebook-001",
      "baseline": "baseline/notebook-001.json",
      "candidate": "candidate/notebook-001.json"
    },
    {
      "key": "notebook-002",
      "baseline": "baseline/notebook-002.json",
      "candidate": "candidate/notebook-002.json"
    }
  ]
}
```

```sh
iiif-audit batch snapshots/pairs.json --format html --output corpus-review.html
iiif-audit batch snapshots/pairs.json --policy corpus-policy.json \
  --baseline-dir snapshots/baseline --candidate-dir snapshots/candidate \
  --output corpus-audit.json
```

Pair paths resolve relative to the pairs file. They must remain within that directory after symlink resolution. Absolute paths, URI values, backslash paths and traversal outside the root are rejected. Keys must be unique, and a baseline/candidate file cannot be assigned more than once on the same side. A pair's input or execution error is retained alongside results from other pairs. The processed count includes failed attempts; it does not mean every pair produced an audit.

The optional inventory directories recursively identify unpaired `.json` files, including candidate-only files. Every paired file must also be inside its side's declared inventory. Inventory scans do not follow symlinks; finding one is an actionable error. Choose inventory directories containing only source/candidate snapshots, and place report output outside them. Without inventories, the pairs file defines the corpus: files omitted from it are not discovered automatically.

Shared policy decisions are matched across the whole batch. A decision for one pair is not falsely marked stale on another. Decisions matching no current finding are reported once at corpus level. A corpus issue, unsupported pair, input error or unresolved blocking change prevents an aggregate pass. The JSON output contains `pairs` with complete nested reports or an explicit `error`, plus global `issues` and counts. HTML contains every pair's review evidence. CSV contains corpus/pair summaries, source hashes, finding rows and coverage rows, with a `pair_key` column.

The examples contain `pairs-clean.json` and `pairs-loss.json`. Running inventory against their entire candidate directory intentionally finds the alternate unpaired candidate; the examples demonstrate two alternative releases rather than one complete inventory.

## Save a remote snapshot explicitly

```sh
iiif-audit snapshot https://collections.example.org/iiif/book/manifest \
  --presentation 2 --output baseline/book.json
iiif-audit snapshot https://staging.example.org/iiif/book/manifest \
  --presentation 3 --output candidate/book.json
iiif-audit compare baseline/book.json candidate/book.json
```

`--presentation` defaults to `3` and selects the IIIF `Accept` profile header. Servers may ignore that request or return another version; comparison identifies the actual resource version. Snapshot preserves the exact UTF-8 JSON response text, without reformatting it. It checks for a JSON object, not formal IIIF conformance. It sends no cookies or authentication credentials and does not retrieve any linked image, annotation, OCR, search or JSON-LD context.

Only absolute HTTP(S) URLs without embedded credentials or fragments are accepted. Requests have a 15-second total time limit, at most five redirects and a 20 MiB decompressed response limit. Redirect targets receive the same URL checks, and HTTPS-to-HTTP downgrades are refused. The command deliberately contacts the URL you provide, including a local staging server if explicitly selected; it is a CLI, not a public URL-fetching service. Use your institution's approved authenticated download workflow for restricted manifests, then compare the saved files locally.

## Exit codes and CI

| Exit | Meaning                                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Complete supported comparison with no unaccepted error/warning; or a successful help/version/snapshot command.              |
| `1`  | Complete comparison contains unaccepted warning-level changes needing review.                                               |
| `2`  | Complete comparison contains unaccepted preservation errors.                                                                |
| `3`  | Assessment is incomplete, including unsupported content, stale decisions or corpus coverage issues.                         |
| `4`  | Input, configuration, I/O, resource limit or execution error. A batch still records results from other pairs when possible. |

An incomplete report may also contain preservation errors; its summary retains them. Approval cannot waive unsupported coverage. Schema validation and preservation comparison solve different problems: add the official IIIF conformance validator and intended-viewer checks to your release process where appropriate.

Example command for a CI step after installing the release archive or building the checkout:

```sh
node dist/cli/index.js batch snapshots/pairs.json \
  --policy snapshots/review-policy.json \
  --baseline-dir snapshots/baseline --candidate-dir snapshots/candidate \
  --output artifacts/iiif-audit.json
```

The command's nonzero result fails the step. If you upload reports as CI artifacts, do so deliberately: reports can contain unpublished metadata and acceptance reasons. Public-repository artifacts may be visible beyond your institution. Do not expose credentials in snapshot URLs or commit restricted metadata as fixtures.

## Limits and report safety

Local manifests are limited to 20 MiB each; the engine additionally bounds nesting, visited nodes and canvases. Batch runs accept up to 10,000 pairs and 256 MiB of source/candidate bytes, retain at most 128 MiB of serialized nested audit reports, and accept a 4 MiB pairs/policy file and 100,000 inventory entries. Report-size checks also run after applying review decisions. Pairs that exceed the budget receive explicit errors; their evidence is not silently truncated. Split larger corpora into multiple explicit batches. Limits fail explicitly; a partial successful subset cannot become a pass.

HTML reports are self-contained, scriptless, use system fonts and include a restrictive Content Security Policy. Source HTML is escaped, URLs are displayed as text, directional controls are rendered as visible Unicode escapes, and opening a report triggers no remote resource loads. JSON retains the complete structured report. CSV wraps and quotes every cell; cells with formula-leading characters are prefixed with an apostrophe so spreadsheet applications treat them as text. This display transformation is limited to CSV; original evidence remains in JSON. Check original JSON when the exact bytes of a displayed value matter.

The audit checks declared static-image preservation facts and link references. It does not establish image-byte equality, linked OCR contents, HTTP availability, CORS, authentication, legal correctness or viewer rendering. Incomplete coverage is a request for another check, not a successful migration certificate.
