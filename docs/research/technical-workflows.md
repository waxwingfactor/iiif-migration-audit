# Specialist workflow discovery — adversarial pass

Research date: 2026-10-15. No candidate in this pass deserves an unqualified neglected-market claim. Root should prefer a stronger separately researched finalist.

## Rejected: QGIS portable project handoff

Beachhead: independent GIS consultants delivering editable QGIS projects to occasional GIS users. Pain is real: [2021 question with 18k views](https://gis.stackexchange.com/questions/384361/how-to-share-a-qgis-project), and [missing layers after sending project](https://gis.stackexchange.com/questions/391225/why-are-my-layers-after-sharing-and-re-downloading-a-qgis-map-almost-all-unavail). Market workaround: zip source files preserving relative directory structure; native Package Layers fails to rewrite project references.

Disqualifying existing product: [Geopacker](https://github.com/rick2x/geopacker) explicitly bundles project/vector/raster data, rewrites relative paths, supports QGIS 4 and a headless Processing Provider. It is open source, GPL, and has 28 stars in the indexed repository. Building another is unnecessary. Official [QGIS project docs](https://doc.qgis.org/3.44/en/docs/user_manual/introduction/project_files.html) also explain broken-source repair. Feasibility high, uniqueness low.

## Rejected: AAF production-audio handoff preflight

Beachhead: freelance assistant editors handing AAF timelines to sound post. Strong primary pain: [Adobe Jan 24 2023 AAF issues](https://community.adobe.com/feature-requests-730/aaf-issues-1329265) reports missing handles despite export settings and shifted tracks; [Adobe Dec 24 2024](https://community.adobe.com/questions-729/issues-finding-media-after-importing-an-aaf-with-embedded-media-to-premiere-pro-1415620) reports embedded-media link failures requiring overcutting. Market workaround: test-import into destination NLE/DAW and manually diagnose metadata.

Disqualifying whole/near products: [Forte free AAF Checker](https://staging.website.forteutilities.com/aaf-checker) claims whole-file validation, media readability/linkage, timecode, session start, sample rate/frame rate; [Park Street Post](https://parkstreetpost.com/software/) ships open-source AAF Browser, CLI aafinfo with self-contained HTML/JSON, plus FinalPass delivery QC. [LibAAF](https://github.com/agfline/LibAAF) inspects tracks, essences, clips, metadata, external media paths. [AAFInspector](https://github.com/lawson-tanner/AAFInspector) offers GUI object browsing. A new preflight product needs a much narrower verified gap; do not pick generic AAF inspector. Technical risk: exporter-specific AAF object hierarchies and downstream app behaviour cannot be certified solely through static analysis.

## Provisional, not sufficiently neglected: environmental logger timestamp rehabilitation

Beachhead: small university/volunteer stream-monitoring teams combining CSV exports from multiple offline logger brands without enterprise hydrological data management. Market workaround: vendor-specific export settings followed by spreadsheet/R/Python shifts. Proposed whole product: generic CSV import, explicit fixed-offset versus IANA-zone interpretation, raw-data hashes, measured start/end clock anchors, piecewise drift recipe, flagged ambiguous/duplicate/gap rows, visual before/after, CSV+recipe+audit bundle. Never infer that an unexplained one-hour step is necessarily DST.

Primary technical pain evidence:

- [Tinytag official support](https://www.geminidataloggers.com/support/tinytag-explorer-software/dates-and-times): USB loggers are not zone-aware; Explorer historical timestamps can change according to current PC DST; ~20 ppm drift at 25C and worse at temperature extremes. Date not shown.
- [Campbell official blog](https://www.campbellsci.com/blog/daylight-saving-time-and-datalogger), indexed ~2015: automatic clock changes create apparently skipped records and fall-back duplicate timestamps.
- [Onset U30 official manual](https://www.onsetcomp.com/sites/default/files/resources-documents/11866-M%20U30-NRC%20Manual.pdf): clock drift and incorrect host clock/zone are documented errors.
- [Ontario field protocol](https://www.ontario.ca/page/laboratory-and-field-techniques-data-loggers): incorrect dates/times are explicit data failure cause.
- [2024 primary research](https://www.sciencedirect.com/science/article/pii/S1364815224000677): network with 250+ instruments calls manual ingestion time-consuming/error-prone/hard to trace; their open SensorDB accepts measured drift and interpolates corrected times while retaining upload provenance.

Strong competing products: AQUARIUS has offered clock-drift correction since at least 2010 ([vendor release](https://www.newswire.com/news/latest-hydrologic-software-release-provides-new-innovations-for-the-123135)); SensorDB offers traceable uploads/drift but requires database/deployment; [OperandoMerge](https://github.com/hdkim99/OperandoMerge) is open source with CLI, Tk GUI, CSV/XLSX, absolute/elapsed/reference-event alignment, QC and provenance, although aimed experimental instruments. [SaQC](https://git.ufz.de/rdm-software/saqc) and timeseries-qc handle much QA. A friendly offline timestamp-only workflow may be underserved, but there is too much overlap to select confidently without practitioner interviews. Feasibility medium-high; risks are incorrect temporal assumptions, CSV variety, and inadequate evidence for drift correction.

## Additional rejected checks

KiCad visual diff/release review has KiHub, KiRi, kdiff, kicad-studio-kit and EDA toolkits. URDF dependency/physics portability has URDF Studio (browser, xacro, package resolution, mesh/inertia/cycle checks), urdf-validator, ARMOR archive export, and urdfpy save-with-meshes. Calendar migration semantic diff has several offline ICS comparison tools including FileDiffs and FindUtils, so generic ICS comparison is crowded.
