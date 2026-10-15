# User guide

IIIF Migration Audit helps digital-library engineers and collections reviewers check a replacement manifest generator before publishing a collection. Give it the old and proposed JSON exports of the same digitized book or still-image object. It compares their supported preservation facts independently, including text, rights statements, page identities and order, image references, and navigation.

Use the [browser workbench](https://waxwingfactor.github.io/iiif-migration-audit/) for a review of one pair, and the CLI for a saved collection and a repeatable CI gate. No account or paid service is required. The workbench processes selected files on your device; comparison does not upload them or fetch resources mentioned in them. Loading the hosted application itself requires a network connection.

## Start with one real object

Choose a book with multiple pages, more than one language, and some descriptive or attribution metadata. Save its current manifest as `before.json` and the replacement generator's export as `after.json`. Keep these original UTF-8 files unchanged: formatting and line endings are part of the evidence identity.

The supported profile covers Presentation 2.1 and 3.0 still-image manifests with embedded Canvases and painting annotations. Both files can use the same Presentation version; migration between versions is not required. An IIIF Collection listing manifests is not a replacement for an individual Manifest.

1. Open the [workbench](https://waxwingfactor.github.io/iiif-migration-audit/). To learn the interface first, choose **Explore an example**. The fictional notebook intentionally loses description text and attribution and changes page order; it should raise findings.
2. Choose your **Baseline** file and **Candidate** file, or switch either input to **Paste** and supply the complete JSON. Confirm the displayed filenames and sides. Use files when resuming a review, so copying and pasting cannot change the saved evidence.
3. Choose **Compare manifests**. Comparison runs in a local worker. **Cancel comparison** stops that run; fix or replace an input and compare again when ready.
4. Read the verdict, then inspect all three result tabs: **Findings**, **Page sequence**, and **Coverage**. A zero-length finding list does not by itself establish complete coverage.
5. For an unexpected loss, repair the replacement generator, export a fresh candidate, and rerun. For an intentional change, inspect the evidence and record a reason as described below.
6. Use **Export report** to save a reading copy and structured evidence. Open **Comparison policy** and choose **Export policy** to preserve decisions and URL rules for another session.

The example replaces the current inputs and policy. Export work you want to keep before trying it. Tab state is temporary: reloading or closing the page does not save a review automatically.

## Read the evidence

**Findings** lists changes by category. Select a finding to see its baseline and candidate values and original JSON pointers. **Inspect source** opens a read-only excerpt at that location; close it with its close button or Escape. A logical finding path describes the compared fact, while the source pointer identifies its original version-specific representation.

Search examines finding messages, paths, codes, and evidence. Category and decision filters only change the view; they do not change the verdict or exported report. Use **Clear filters** if expected findings appear to be missing. Long lists are paginated. Very long on-screen evidence and source excerpts have a 30,000-character preview limit; JSON export retains the complete evidence.

**Page sequence** shows matched Canvas IDs and positions. Numbers in the sequence strip refer to baseline positions, so a changed order remains visible even when labels repeat. The strip previews up to 200 paired pages; the paginated table and exports include every pair. Removed, added, or ambiguous pages also appear in findings and coverage. Matching uses exact IDs or explicit Canvas rules, never a guess based on a repeated label or position.

**Coverage** explains structures that could not be fully assessed and shows the input hashes and comparison profile. Follow a notice's **Inspect** action to locate the relevant source. Unknown extensions, unsupported versions, unresolved structural resources, complex selectors or bodies, time-based content, and ambiguous identities can keep an assessment incomplete even when other fields match.

## Understand the result

| Result                                             | Meaning                                                                                                                   | Next step                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pass` — No unresolved changes in assessed content | Supported checks are complete and have no unaccepted errors or warnings. Information and accepted changes remain visible. | Keep the evidence and run your other release checks.                                                  |
| `review` — Changes need review                     | Complete assessment with unaccepted warning-level changes.                                                                | Inspect each change; repair it or accept it with a reason.                                            |
| `fail` — Preservation changes need attention       | Complete assessment with unaccepted preservation errors.                                                                  | Investigate the loss or changed identity before publication.                                          |
| `incomplete` — Assessment is incomplete            | Unsupported or uninspected content, ambiguous pairing, or stale decisions prevent a complete result.                      | Address the coverage or stale-policy notice and rerun; arrange another check for unsupported content. |
| Input or execution error                           | The operation could not produce a complete audit for an input.                                                            | Read the error code, correct the input/configuration or resource problem, and rerun.                  |

Incomplete coverage takes precedence over preservation errors in the verdict; inspect both counts and findings. In a corpus, any pair execution error makes the aggregate result `error`; coverage issues still prevent a pass when other pairs succeed. “Processed” counts attempted pairs, including failures.

This audit compares declared facts and references. It does not establish image-pixel equality, linked OCR or annotation contents, HTTP availability, authentication, CORS, viewer behavior, IIIF conformance, or the legal correctness of a rights statement. Validate conformance and exercise your intended viewers and delivery endpoints alongside it. A rights finding identifies a changed assertion for review; it grants no permission to use an object.

## Record intentional changes and resume

For an error or warning that the responsible reviewer has verified as intentional, enter a specific reason and choose **Accept with reason**. For example: “Attribution corrected to match the catalog record approved for this release.” The original values, decision, and reason remain in the report. **Reopen this finding** removes its acceptance. Informational findings remain recorded without requiring acceptance; coverage limitations cannot be accepted into a pass.

Before leaving the browser, export the policy and reports, and retain both original input files. A practical review folder contains `before.json`, `after.json`, `review-policy.json`, and the JSON/HTML report. Rename downloads as needed; the workbench's default policy filename is `iiif-audit-policy.json`.

To resume, load those exact baseline and candidate files, open **Comparison policy**, choose **Import policy**, and compare again. Reports are evidence/reading copies, not session files to import. Decisions live in the policy. The policy contains no copy of the input manifests, so it cannot restore a missing snapshot.

An acceptance uses a fingerprint bound to the original input hashes, compared evidence, active URI rules, and comparison semantics. Even adding a newline to an input invalidates its earlier decisions. Renaming a file is not evidence that its contents are unchanged. A reason records a review decision; it is not an authenticated reviewer signature.

When an earlier decision becomes stale, inspect the new comparison before approving anything again. Under **Comparison policy → Inspect or remove decisions**, remove the affected saved decision and rerun. Then review the current finding and record a fresh reason if warranted. Do not delete unassessed source properties or broaden URL rules simply to obtain a pass. Version-control policy changes and review them with the corresponding migration changes.

## Authorize a specific URL migration

When an image server moves, add a rule under **Comparison policy → + Add URL rule**. Choose the resource role and enter the old and new HTTP(S) prefixes. Complete or remove unfinished rules before comparing or exporting.

For example, this policy permits the image-service prefix replacement while retaining unrelated checks:

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

Rules rewrite the baseline comparison identity toward its candidate identity; they do not edit either file. Available roles are `manifest`, `canvas`, `range`, `image` (image body), `image-service`, and `link`. An image-service rule does not cover an image body's URL or a Canvas ID. Use a separate rule only when that separate change is intended. Mapped Manifest, Canvas, and Range identity changes still require review because external references may break.

Prefixes must be canonical HTTP(S) host/path prefixes without credentials, query strings, or fragments. Matches respect boundaries: `/canvases` does not authorize `/canvases-extra`. Suffixes are preserved, and the longest matching prefix wins within a role. Rules must not collapse distinct identities into one. Keep the active policy in the exported evidence so another reviewer can see which transformations were authorized.

## Install the CLI from the release

Use Node.js **22.12 or newer**. Download `iiif-migration-audit-1.0.0.tgz` from [GitHub release v1.0.0](https://github.com/waxwingfactor/iiif-migration-audit/releases/tag/v1.0.0), then run these commands in its download directory:

```sh
npm install --global ./iiif-migration-audit-1.0.0.tgz
iiif-audit --version
iiif-audit --help
```

The expected version is `1.0.0`. This installs the downloaded GitHub release archive; it does not require an npm registry publication of this project. For source-checkout development and full command options, see [CLI reference](cli.md).

Compare saved files and export a portable report:

```sh
iiif-audit compare before.json after.json --format html --output review.html
iiif-audit compare before.json after.json --policy review-policy.json --output reviewed.json
```

The default format is JSON; extensions do not select a format. Without `--output`, stdout contains only the report and stderr carries a concise result. Use `--format csv` for a spreadsheet register. Existing outputs are protected; `--force` can replace a previous report but cannot overwrite selected inputs, their aliases, the policy, or the pairs file. Choose a new output name if you want to retain an earlier run.

## Audit a corpus and keep the review reproducible

Save all expected baseline and candidate snapshots beneath a common root. Keep reports and policy files outside the two inventory directories:

```text
snapshots/
  baseline/notebook-001.json
  baseline/notebook-002.json
  candidate/notebook-001.json
  candidate/notebook-002.json
  pairs.json
  review-policy.json
  reports/
```

Create `snapshots/pairs.json` explicitly:

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

Use an empty policy initially, with the same schema as the URL-rule example but both arrays empty. From the directory containing `snapshots`, run:

```sh
iiif-audit batch snapshots/pairs.json --baseline-dir snapshots/baseline --candidate-dir snapshots/candidate --policy snapshots/review-policy.json --output snapshots/reports/audit.json
```

Every requested pair appears in the result, with a nested report or explicit error. Inventory scans recursively check `.json` files, including candidate-only additions. Inspect global `issues` as well as individual pairs. Without the inventory options, only files listed in `pairs.json` belong to the declared corpus; omitted files are not discovered automatically.

Pair paths resolve relative to the pairs file. They must stay inside that root after symlink resolution. Keys must be unique, and a file cannot be assigned twice on the same side. Command-line paths, including inventory and policy paths, resolve from the current working directory. Inventory scans reject symlinks, and output must stay outside inventories.

Review corpus findings in JSON, or rerun with `--format html` or `--format csv` and a different output filename. To inspect one pair interactively, load its exact two files in the browser and import a policy containing the shared URI rules and only that pair's current decisions. A whole-corpus policy used for a single pair will correctly flag decisions belonging to other pairs as unmatched; do not delete them from the master policy merely to review one object.

Maintain the corpus policy's `acceptedChanges` by copying a reviewed finding's `id` from `pairs[].report.findings[]` into a decision's `findingId`, with a nonempty `reason`. In a single-pair report, the source field is `findings[].id`. A decision has this shape; replace the placeholder with the exact current 64-character ID:

```json
{
  "findingId": "<copy the reviewed finding's id here>",
  "reason": "Attribution corrected against the approved catalog record."
}
```

If using separate browser-exported policies, combine their decision records into the master policy only after confirming identical URI rules; duplicate fingerprints must appear only once. The CLI validates the combined policy. It matches decisions across the entire current batch and reports a decision matching no current finding once at corpus level.

Commit or otherwise retain the exact snapshots, pair list, reviewed policy, release version, and reports. Keep snapshot files out of automatic formatting and line-ending normalization when preserving their hashes. Resume by rerunning the same command with those files and a fresh output name. If a candidate changes, review the newly stale decisions before updating the master policy. When partitioning a large corpus, partition its approvals too: decisions for objects outside a smaller batch are stale in that batch.

For CI, use the comparison command's exit status directly. Do not append an unconditional success command or ignore a nonzero result. Upload reports as artifacts deliberately; they may contain unpublished metadata and review reasons.

| CLI exit | Meaning                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------- |
| `0`      | Complete comparison with no unaccepted errors/warnings, or successful help/version/snapshot command. |
| `1`      | Complete comparison needs review.                                                                    |
| `2`      | Complete comparison has preservation errors.                                                         |
| `3`      | Assessment is incomplete, including stale decisions or corpus coverage issues.                       |
| `4`      | Input, configuration, I/O, resource, or execution error.                                             |

A nonzero comparison exit can accompany a successfully saved report. In a batch, results from successful pairs do not cancel errors from failed pairs. If output itself fails, the command returns an error; an older report at that path is not evidence of a successful new run.

## Capture a remote manifest deliberately

Browser and CLI comparisons read saved JSON only. The CLI's separate `snapshot` command can retrieve an explicitly chosen public or local staging URL:

```sh
iiif-audit snapshot https://collections.example.org/iiif/book/manifest --presentation 2 --output before.json
iiif-audit snapshot https://staging.example.org/iiif/book/manifest --presentation 3 --output after.json
```

It preserves UTF-8 response text without reformatting, sends the requested IIIF Accept profile, and checks that the response is a JSON object. A server may ignore negotiation; comparison identifies the actual version. Snapshot sends no cookies or authentication credentials and follows no manifest links. Use your institution's approved authenticated download process for restricted material, then compare the saved exports.

Only HTTP(S) URLs without embedded credentials or fragments are accepted. Retrieval has a 15-second total limit, up to five redirects, and a 20 MiB decompressed response limit. HTTPS-to-HTTP redirects are rejected. Do not put secrets in URLs or commit restricted snapshots to a public repository.

## Limits and troubleshooting

| Limit                 | Bound                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Each manifest         | 20 MiB UTF-8; nesting 64; 300,000 parsed value nodes; 20,000 Canvases.                                                         |
| Each comparison       | 25,000 findings; 64 MiB of finding evidence; 10,000 coverage notices per source; bounded complex matching and Range traversal. |
| CLI pairs/policy file | 4 MiB each; up to 10,000 pairs.                                                                                                |
| Each policy           | Up to 1,000 URI rules and 10,000 decisions.                                                                                    |
| CLI batch             | 256 MiB of input bytes; 128 MiB of serialized nested reports, checked again after applying decisions.                          |
| Each inventory scan   | 100,000 entries.                                                                                                               |

Limits produce explicit errors instead of a truncated pass. Split a corpus into smaller explicit batches when necessary. Do not truncate an individual manifest to make an incomplete preservation claim look complete; use another check for an object outside the supported profile. See [supported semantics and bounds](core-api.md) for detail.

| Symptom                                                       | Recovery                                                                                                                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Compare button is disabled                                    | Supply both complete inputs. A filename alone or an empty paste is insufficient.                                                                                                                             |
| File import fails or shows a size/encoding error              | Export valid UTF-8 JSON within the file limit and select it again. Check displayed filenames: a failed replacement may leave the previously selected input in place.                                         |
| Invalid JSON, duplicate keys, or numeric-precision error      | Repair the generator/export. Comments and trailing commas are not JSON. Do not silently round a number or discard duplicate values to suppress the error.                                                    |
| Policy error                                                  | Complete or remove unfinished URL rules; use schema version `1.0`, valid roles, unique decisions, and nonblank reasons of 1–2,000 characters. Import the corrected policy and rerun.                         |
| No visible findings, but the result is incomplete             | Read Coverage and clear finding filters. Unsupported content and stale decisions can prevent a pass independently of compared differences.                                                                   |
| Many pages appear removed and added                           | Check Canvas ID continuity and intended identity changes. Use a narrowly scoped Canvas rule only if justified; identical labels do not authorize pairing.                                                    |
| Old acceptances no longer apply                               | Restore the exact saved evidence if it was changed accidentally, or remove stale decisions and review the new evidence. Changes to rules or comparison semantics can also invalidate approvals.              |
| Browser worker fails or comparison is slow                    | Cancel, verify inputs, and try the CLI. If browser policy or worker restrictions prevent startup, use a current browser or the CLI. Export policy before reloading when possible.                            |
| Download does not appear                                      | Check browser download permissions and the Downloads folder. Retry export and retain JSON evidence; an export error does not mean a saved report exists.                                                     |
| `OUTPUT_EXISTS`, `OUTPUT_IS_INPUT`, or `OUTPUT_IN_INVENTORY`  | Choose a fresh path outside source inventories. Use `--force` only for a previous report. Input protection also applies to symlink/hardlink aliases and failed pairs.                                        |
| `UNPAIRED_INPUT`, missing-file, or inventory error            | Check the pair list, root-relative paths, candidate-only additions, and inventory contents. Remove directory symlinks or choose an inventory of ordinary snapshot files. Rerun the whole intended partition. |
| Snapshot returns login HTML, times out, or rejects a redirect | Save a JSON export through your approved download workflow, or correct the endpoint/redirect. Snapshot does not perform an interactive login.                                                                |
| CLI is unavailable after install                              | Confirm Node 22.12+, the installed release version, and that npm's global executable directory is on PATH. For permission errors, use your organization's supported user-level Node installation.            |

HTML reports are self-contained and scriptless, with source markup displayed as inert text and no remote resource loads. CSV preserves structured JSON evidence in cells and prefixes formula-leading display values with an apostrophe for spreadsheet safety. Use the JSON report when exact structured values matter. Keep reports and acceptance reasons as carefully as the underlying collection metadata.

For a reproducible problem report, include the tool version, error code, expected behavior, and the smallest shareable fixture. Remove private information before posting to the [issue tracker](https://github.com/waxwingfactor/iiif-migration-audit/issues). Research scope and product positioning are documented in [Product definition](product.md); technical CLI details are in the [CLI reference](cli.md).
