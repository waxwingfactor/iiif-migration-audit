# Release criteria

Release only after the whole still-image migration workflow works from a clean environment.

- Research and alternatives published; niche, scenarios, positioning and limitations explicit.
- Independent v2/v3 extraction retains every supported field's meaning and source pointers; resource/version/unknown-shape coverage cannot pass silently.
- Golden equivalent pair and realistic seeded losses pass independent tests, including mixed-language description, duplicated metadata values, page order, identity, rights, ranges, image layering and links.
- Explicit role-scoped URI mappings are validated, collisions rejected and mapped changes visible.
- Intentional-change decisions preserve exact fingerprints and reasons; stale and invalid policies are actionable.
- Single and corpus CLI account for every pair; invalid inputs, unsupported content and failed pairs return documented nonzero statuses; JSON/HTML/CSV exports agree.
- Browser file/paste/demo/error/filter/detail/review/export/resume workflows pass desktop and narrow-screen testing, keyboard and automated accessibility checks; screenshots independently reviewed.
- Untrusted IIIF text cannot execute in UI or HTML exports; CSV values resist formula injection; bounded input handling and safe output paths tested.
- Public CI checks pass for the merged release candidate; independent code and black-box reviews completed and findings resolved or explicitly classified non-blocking.
- CLI tarball installs and runs from a clean directory; static app builds and is accessible; examples, troubleshooting, policy schema and CI instructions usable.
- License/fixture/font notices included, dependency audit reviewed, no secrets/private metadata, changelog and release assets published.

Scope is explicit, not an excuse for false assurance: if a real input falls outside the supported profile, the product must identify it and explain the next action. Actual practitioner adoption and full image/viewer/runtime verification are not claimed by automated release QA.
