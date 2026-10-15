# Contributing

Use Node.js 22.12 or newer. Install with `npm ci`, then run `npm run check`, `npm test`, and `npm run format:check` before submitting a pull request.

Keep changes focused. Add independent golden or mutation tests when preservation behavior changes. A converter output must never be the only oracle for the comparator. New supported constructs require coverage of malformed and lossy variants. Unsupported content must produce an incomplete audit rather than a clean pass.

Document compatibility changes, new finding codes, report schema changes, and altered policy semantics. Never submit institutional credentials, private metadata, or personal data. Use synthetic or clearly licensed public fixtures.

The project uses scoped pull requests and CI. Independent agent reviews are recorded as agent reviews, including their limitations. Actual practitioner feedback remains a separate validation step.
