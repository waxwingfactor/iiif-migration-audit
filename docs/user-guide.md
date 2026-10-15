# Browser workbench guide

The browser workbench compares two independently generated manifests on your own device. It is intended for a digital-library engineer and a collections reviewer checking a generator or repository release. It runs without an account, paid API, uploaded documents or automatic collection requests.

## Open the workbench

Use the published static workbench, or run `npm ci` followed by `npm run dev` from a checkout and open the local URL printed in the terminal. A production static build is created by `npm run build`; serve the resulting `dist/web` directory over HTTP(S). A web server is required for the JavaScript module worker; opening `index.html` directly from the filesystem will not run a comparison.

Choose **Explore an example** to audit a fictional four-page field notebook. The candidate changes page order and omits descriptive and attribution text. The examples are authored for this project and use `.example.org` identities; the app never fetches them.

## Load the evidence

1. Add the current export to **Baseline** and the replacement to **Candidate**. Choose or drop one UTF-8 JSON file into each panel. Each file may be up to 20 MiB.
2. Alternatively, select **Paste** and paste the complete manifest JSON. File and paste modes share the same input; switching modes does not clear it.
3. Select **Compare manifests**. Work runs in a browser worker, with a cancel control. Changing either input clears the old result, so it cannot be mistaken for an audit of newly edited evidence.

The first release supports the declared still-image Presentation 2.1 / 3.0 profile with embedded Canvases and supported painting structures. It compares facts from the original exports, rather than using a converter's output as proof that the converter preserved its inputs. Malformed JSON, duplicate object keys, resource limits and unsupported structures are diagnosed explicitly.

## Read the result

- **Preservation changes need attention:** one or more unaccepted errors need investigation.
- **Changes need review:** one or more unaccepted warnings need investigation.
- **Assessment is incomplete:** relevant content could not be fully inspected. Complete the missing evidence or use a tool appropriate to that structure; accepting an ordinary difference cannot remove the limitation.
- **No unresolved changes in assessed content:** the declared profile completed without unresolved errors or warnings. This is a scoped comparison result, not certification that the migration is universally safe.

The **Findings** tab gives a searchable register and evidence view. Filter by category and accepted/unresolved status. Selecting a finding shows original before/after values, a logical comparison path and separate JSON pointers into the two original documents. **Inspect source** opens a read-only excerpt. Markup and links remain inert text; this view does not render metadata HTML or fetch images.

The **Page sequence** tab shows unambiguous Canvas pairs. Numbers in the candidate strip refer to their original baseline positions, making reordered pages visible. Pairing uses exact identities or explicit Canvas rules. The table includes only established pairs; consult Findings for additions and removals. Labels and positions are never used to guess identity.

The **Coverage & scope** tab lists unsupported or uninspected structures, input hashes and engine/profile versions. Review this tab even when no differences are found. External image URIs can be compared without proving image-byte equality or remote availability. Use complementary checks for specification conformance, pixels and color, remote OCR/annotations, CORS, authentication and viewer behavior.

## Map deliberate URL changes

Open **Comparison policy** and add a rule for a known host or path migration. Select its resource role, then enter the baseline and candidate HTTP(S) prefixes. Prefixes match at complete boundaries; they cannot partially match an unrelated hostname or path segment. Credential-bearing, query-bearing and fragment-bearing prefixes are rejected.

For example, an **Image service** rule can map `https://old.example/images/` to `https://new.example/images/`. It does not approve a changed **Canvas** identity, which may be used by researchers' annotations. Conflicting or colliding identity mappings prevent a clean result. Mapped changes remain traceable in the evidence. Run the comparison again after editing rules.

**Import policy** reads the versioned JSON policy used by the CLI and browser. **Export policy** saves the current rules and review decisions. No policy is stored automatically.

Use **Inspect or remove decisions** to read imported reasons and remove stale approvals, then compare again. Removing a decision never edits the original manifests.

## Record and resume a review

For an intentional error or warning, enter a clear explanation under **Is this change intentional?** and select **Accept with reason**. Acceptance leaves the evidence visible. **Reopen this finding** removes the decision.

Decisions are bound to the exact source and candidate file hashes, effective URI rules, profile/fingerprint version and finding evidence. Even reformatting the original JSON changes the exact input hash and can invalidate a saved decision. Stale or unmatched decisions are visible; they do not silently approve new evidence. Coverage limitations cannot be waived into a pass.

Export the review policy before closing the tab. To resume, reload the same manifests, import that policy and compare again. Source documents and decisions are not automatically saved to browser storage.

## Export a handoff

Open **Export report** after comparison:

- **HTML reading copy:** a self-contained offline report for colleagues.
- **JSON evidence:** structured findings, original evidence, policy, hashes and coverage.
- **CSV findings:** a spreadsheet-friendly register. Potential formula-leading values are neutralized for spreadsheet safety; the JSON report retains the original data.
- **Review policy:** the portable URI rules and evidence-bound decisions needed to resume the review.

Reports contain the metadata and before/after evidence you chose to inspect. Review them before sharing unpublished material. File basenames are sufficient for the browser workflow; no absolute local paths are needed. Use the CLI for batch collection reports and automated release checks.

## Troubleshooting

**The file cannot be read:** export UTF-8 JSON and check the 20 MiB limit. A binary or malformed encoding is not treated as empty content.

**A policy is rejected:** check the selected role and complete HTTP(S) prefixes. Remove empty draft rules or finish them before comparing. Imported policy decisions require valid evidence fingerprints and a nonempty reason.

**The result is incomplete:** inspect the exact coverage path. Additional old sequences, complex bodies, audiovisual data, unknown extensions and unresolved linked structural content require additional support or evidence. The workbench will not guess what was lost.

**A review decision became stale:** restore the exact reviewed inputs/rules, or investigate and record a new decision against the changed evidence.

**The worker cannot start:** serve the production build over HTTP(S), use a current browser with module workers and Web Crypto, and check that your server serves the JavaScript assets correctly. The CLI provides the same comparison core without a browser.
