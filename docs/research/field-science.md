# Field science opportunity assessment

Researched 2026-10-15. Recommendation: **conditional lead, not a proven monopoly**. Of the investigated options, an offline AudioMoth deployment handoff auditor has the clearest unbundled workflow. Do not build a general bioacoustics platform or Darwin Core validator: those are crowded.

## Candidate 1: AudioMoth deployment handoff auditor

### Beachhead and exact job

Research assistants / data managers in small terrestrial ecology labs or conservation nonprofits managing 20–200 AudioMoth recorders, rotating numbered SD cards and handing files from field crews to analysts. They use scheduled, untriggered WAV recordings, local/external drives, and spreadsheets; they cannot upload terabytes merely to learn whether collection succeeded.

The job: before a deployment is declared complete and its cards reused, establish which recorder/site/date combinations really recorded, whether every expected recording exists and is structurally readable, and whether the files reached the archive intact. Then give the analyst an explicit usable-recording-effort table and a portable evidence report. This is operational QA, not species recognition.

### Primary evidence

1. **Kitzes Lab practical AudioMoth guide**, originally 2019, revised November 2024, accessed 2026-10-15: https://github.com/rhine3/audiomoth-guide/blob/master/guide.md . Describes practice derived from deploying thousands of devices. Deployment metadata is kept in spreadsheets; hundreds of cards make manual copying slow; rsync / Raspberry Pi Swallows transfer files; users must inspect expected folder counts, sizes, and numbers of recordings. Device/deployment identity can be recovered from WAV headers when cards are mixed up. CONFIG.txt retains only the newest configuration after a schedule change. These are direct observations of a real lab workflow, not inferred demand from an empty search result.
2. **Natural State public operating procedure**, current page accessed 2026-10-15: https://docs.naturalstate.tech/public/public/standard-operating-procedures/SOP_ABP_AM . Uses QR-coded AudioMoths/cards, a Survey123 device register, fixed UTC schedule, deployment/retrieval forms, laptop configuration, and special missing-device QR codes. Shows narrow multi-device workflow and nontrivial identity bookkeeping.
3. **NOAA/BOEM research report BOEM 2025-020**: https://espis.boem.gov/Final%20Reports/BOEM_2025-020.pdf . Its drifter acoustic preprocessing uses custom QC functions to check timestamp formats and unexpected recording gaps. This supports the general operational gap problem but involves marine drifters, not the proposed beachhead.
4. **Metamoth 1.2.2**, released 2024-06-25: https://pypi.org/project/metamoth/ . Author says AudioMoth comment metadata is difficult to parse and changes with firmware; it exposes one metadata-parsing function. It is a possible dependency or comparison corpus, not a finished audit workflow.

### Market alternative

Numbered-card spreadsheets + Finder/Explorer/rsync copying + manual counts/size checks + exiftool or ad hoc R/Python scripts. Loss is not only transfer corruption: a perfect copy can faithfully preserve an incomplete or wrong-device deployment. Missing data must not be confused with biological absence.

### Strongest product alternatives and disqualification checks

| Product                                                                                                                        | Confirmed capability                                                                                                               | Proposed workflow gap / caution                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| picopy / Swallow, https://github.com/sammlapp/picopy                                                                           | Raspberry Pi hardware copier; transfer progress/error LEDs; copy-checking state; handles insufficient space / inaccessible files   | README does not describe expected recording schedule reconciliation, WAV metadata/device/site reconciliation, or analyst effort export. Do not claim it lacks copy verification; it explicitly has a checking-copy phase.               |
| audiomoth.tools, https://github.com/samherniman/audiomoth.tools                                                                | README exposes header extraction and filename cleanup                                                                              | No integrated deployment audit or handoff described; users still write analysis code.                                                                                                                                                   |
| Metamoth, https://pypi.org/project/metamoth/                                                                                   | Header parsing into typed metadata                                                                                                 | Component/library rather than end-user deployment QA. Firmware coverage requires care.                                                                                                                                                  |
| AMMonitor 2, official paper 2025, https://doi.org/10.1111/2041-210X.14487 ; repository https://code.usgs.gov/vtcfwru/ammonitor | Broad USGS open-source R/SQLite framework for equipment, locations, deployment, media metadata, analysis, and ScienceBase releases | Serious overlap. Paper describes intended users with coding experience. Repo page failed to load in browser, so exact absence of schedule-aware integrity auditing is **unverified**; inspect source/docs before selecting this market. |
| PACE, https://github.com/CI-CMG/pace                                                                                           | GUI + CLI NCEI acoustic archive packaging from spreadsheets/database metadata                                                      | Focus is producing NCEI submission packages, not AudioMoth field handoff. Must inspect docs for unexpected-file validation before declaring gap.                                                                                        |
| AudioMoth Play, https://benlo.com/audiomoth/                                                                                   | Browse local folders, inspect audio, spectrograms and metadata; explore filters/triggers and export media                          | Audio inspection is already solved. Proposed value is cross-file deployment assertions, not another spectrogram viewer.                                                                                                                 |
| ToolQuill BWF/RF64 batch auditor, https://toolquill.net/audio/bwf-rf64-qc-auditor                                              | Local browser RIFF/RF64 structure and metadata checks plus cross-file consistency                                                  | Generic WAV structure QA is solved; new product must add device configuration semantics, deployment identity and expected effort.                                                                                                       |

### Triple-check outcome

1. Direct practical workflow evidence: strong (lab guide + operational SOP).
2. Native recorder tooling and exact libraries: single-file metadata inspection and parsing exist; they should be reused, not reinvented as the product.
3. Adjacent whole products: plentiful and substantial; no directly matching standalone offline AudioMoth handoff auditor surfaced, but AMMonitor's full source/functions remain a required veto check.

**Confidence:** pain high; technically feasible high; narrow workflow differentiation moderate; unmet demand for a standalone UI moderate/low without practitioner interview. It would be irresponsible to state that nobody solves this today.

### Proposed two-sentence positioning

For field coordinators in small conservation teams who are dissatisfied with spreadsheets and manual recording counts, [name] is an offline AudioMoth handoff auditor that shows exactly which scheduled survey effort survived collection and copying. Unlike general audio-analysis platforms or SD-card copiers, it combines recorder metadata, deployment schedules, file integrity, and verified archive manifests into a clear evidence package without uploading recordings.

### Scenario and whole product

A technician returns with 40 cards. Two labels are swapped, one recorder stopped early, one card contains two schedule versions, and one copy was interrupted. User chooses cards/folders and imports the deployment CSV; the app groups by embedded device ID, exposes identity conflicts, separates unknown schedules from known missing effort, verifies staged copies, and exports a reviewed handoff containing manifests, findings and site/day/minute effort for analysis. The app must not offer a false all-clear when schedule history is absent.

Feasible local implementation: read-only scanner with bounded RIFF parser; streaming SHA-256 copier to a chosen destination with resumable journal; SQLite project + file manifests; schedule engine with explicit UTC/fixed-offset handling, recording/sleep cycles, start/end deployment bounds; sparse interval coverage; polished local web UI; JSON/CSV/self-contained HTML exports; packaged macOS/Linux app or Python distribution. Need representative public AudioMoth fixtures, synthesized malformed WAVs, one real corpus, large-directory performance tests, interruption tests, and hostile filename/HTML tests. Avoid triggered-recording completeness until semantics are explicit; triggered silence is not a missing recording.

## Candidate 2: Darwin Core biodiversity submission preparation — rejected

The pain is real but efficiently served by several existing tools. DarwinKit (https://github.com/HakaiInstitute/DarwinKit) validates and transforms CSVs, maps fields, enforces controlled vocabularies and inter-table foreign keys with GBIF/OBIS repository variants. TaiBIF Open Data Toolkit (https://github.com/TaiBIF/taibif-open-data-toolkit) is a packaged desktop GUI for templates, editing, validation, cleaning and Darwin Core Archive preparation, with English and Spanish as well as Mandarin UI. A new generic cleaner/validator would not satisfy the user's uniqueness constraint. Dates: repositories inspected 2026-10-15; release dates not independently established.

## Candidate 3: Camera-trap clock drift correction — rejected

Timelapse already supplies explicit slow/fast clock correction, first/last timestamp linear adjustment, ambiguous day/month correction, and metadata timestamp import. Primary manual: https://saul.cpsc.ucalgary.ca/timelapse/uploads/Installs/Timelapse2/Timelapse2Manual.pdf . The R ct package also supplies first/last true-time drift correction (https://stangandaho.r-universe.dev/ct/doc/manual.html). No evidence that this isolated job needs a fresh product.

## Category-level warning

The 2026 living systematic review of PAM software inventories 221 available tools, with many overlapping features, and recommends collaboration/integration rather than further proliferation: https://pmc.ncbi.nlm.nih.gov/articles/PMC13096786/ and https://doi.org/10.12688/f1000research.173495.1 . This is a reason to keep the handoff audit narrow and interoperable, or select another research agent's stronger candidate. It is not evidence that all data-management work is already well solved.
