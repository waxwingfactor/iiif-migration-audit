# Preservation engine review

Independent reviewer: discover_field_science agent, 2026-10-15. The reviewer designed initial golden/mutation tests from specifications and public fixtures without reading the implementation, then performed an adversarial code review and added reproduced regression cases. Agent review is not practitioner/customer validation.

Final local result: 76/76 tests pass across two suites; 62 independently authored acceptance cases. A later integration check added BOM-preserving hash parity and explicit report/coverage budgets. Tests cover literal source SHA-256, public fixture hashes, retained language/value multiplicity, page and painting order, rights/links/metadata, identity and scoped URI mappings, stale decisions, unsupported versions/structures, malformed JSON, resource limits and numerical evidence integrity.

Resolved blocking findings:

- Image API major-version changes were hidden by declaration normalization; version is now retained and ambiguous hints are incomplete.
- Provider logo rewriting inherited ordinary-link scope; rewriting and collision traversal now use explicit nested roles.
- Overflow and unsafe numeric rounding could erase differences; raw number tokens are checked before JSON.parse discards evidence.
- Newly added navigation fields could change defaults while appearing informational; navigation/rights additions require review.
- Allowed-key unions hid wrong-version role fields and local contexts; these now produce incomplete coverage.
- Exact source-pointer role fixes, non-injective mappings, range graph depth/cycles, duplicate JSON keys and snapshot-bound approvals are tested.

The reviewer inspected final parser, policy, extractor and comparator (including shared nested URI scoping and collision traversal) and reported no remaining merge blockers within the documented profile. Runtime image equivalence, external bytes, and unsupported structures remain excluded/incomplete as documented; no universal migration-safety claim is made.
