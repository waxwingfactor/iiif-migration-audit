# Interface design brief

Audience: library engineers and collections librarians investigating a release, often with long text and repeated page labels. The primary job is reviewing preservation evidence, not admiring an analytics dashboard.

## Tokens

- Paper surface `#F7F9FC`, ink `#172B45`, muted ink `#50627A`, ruled line `#D6DFEB`, institutional blue `#2359A6`, critical red `#AC3144`. Success uses dark teal `#176C60`; warnings dark amber `#81540D`, always paired with words/icons.
- Type: locally bundled Atkinson Hyperlegible Next for interface text if available under its OFL license; otherwise a readable system sans stack. Use strong sentence-case headings, comfortable 16px body text and 1.5 line height; tabular numerals for indexes. Monospace only for actual JSON paths and machine identifiers. No remote fonts.
- Layout: a quiet library-worktable metaphor with a clear paired baseline/candidate area, followed by a navigable finding register and an evidence detail pane. Distinct hierarchy through spacing and typography. Reserve bright color for risk and primary actions.

## Layout concept

```text
IIIF Migration Audit                          Guide / Source
Compare a collection release
Plain explanation and local-processing note
[Baseline file / paste]       [Candidate file / paste]
[Compare manifests]  [Explore an example]     [Policy]

Result sentence with complete/incomplete context
Findings / Page order / Coverage              Export report
[search + filters]   | selected finding: meaning, before/after,
finding register     | source pointers, reasoned acceptance
```

Small screens use a single column, with the finding detail following selection and clear focus management. Do not force a tiny side-by-side JSON view. Long values wrap; source pointers scroll within their block. Human-readable names precede identifiers.

## Critique against generic defaults

No decorative KPI-card row, gradient hero, mock activity feed, promotional trust badges, neon-on-black theme, all-caps eyebrows, or generated collection artwork. The memorable element is the paired evidence view and readable page-order strip. No image downloads are required to understand a preservation finding. All controls must work with keyboard; reduced motion respected; error states explain the fix. Never make an incomplete result look reassuringly green.

Design guidance adapted from [Anthropic frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md), accessed 2026-10-15. The user's commission authorizes the product choice; no reconfirmation of subject is required.
