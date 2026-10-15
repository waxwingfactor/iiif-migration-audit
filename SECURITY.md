# Security

This tool reads untrusted manifest content. Its comparison core must perform no network requests, execute no content, and never mutate inputs. The browser processes files locally. HTML in IIIF values is displayed as text, never inserted as trusted markup. Reports may contain unpublished metadata: share them deliberately.

Do not include secrets or private institutional documents in public issues. Report suspected vulnerabilities using [GitHub's private vulnerability report form](https://github.com/waxwingfactor/iiif-migration-audit/security/advisories/new). Private vulnerability reporting is enabled for this repository. If that route is unavailable, open an issue containing only a general request for a private contact route. No response-time guarantee is currently offered.

Input/resource limits, supported constructs, network boundaries, and residual risks are documented in `docs/threat-model.md` and the user guide. A clean comparison is not proof of IIIF conformance, image integrity, successful authentication, link availability, or correct viewer rendering.

The current release line is 1.0.x. No older release line is maintained. Security fixes require an updated release; downloaded static bundles and CLI archives do not update themselves.
