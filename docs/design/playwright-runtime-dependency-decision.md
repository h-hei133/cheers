# Playwright Runtime Dependency Decision

Route 102 decides the Playwright runtime dependency boundary after Route 101.

Decision: do not declare Playwright as a package dependency in this route.
Prefer `external-runner-only` now and `skill-managed` as the future product
path.

## Reference Scan Summary

Files inspected within the Route 102 budget:

- Playwright MCP: `package.json`, `README.md`, `tests/fixtures.ts`
- Stagehand: `packages/core/package.json`, `packages/cli/package.json`,
  `packages/cli/src/local-strategy.ts`
- OpenHands: `pyproject.toml`, `config.template.toml`
- Inspect AI: `pyproject.toml`, targeted sandbox availability references
- mini-swe-agent: `pyproject.toml`, `docs/usage/output_files.md`,
  `src/minisweagent/agents/default.py`

Patterns applied locally:

- Playwright MCP declares Playwright directly because it is a browser server.
- Stagehand keeps core browser engines as optional peers/dev dependencies and
  exposes a separate CLI package for agent-facing use.
- OpenHands treats browser/runtime setup as environment/sandbox capability with
  explicit config.
- Inspect AI and mini-swe-agent separate execution availability, reports, and
  trajectories from raw tool output.

Implication: this project should not grow a browser runtime dependency until
browser binary install, sandbox, and default execution policy are explicitly
owned. External/skill-managed runner policy is safer for the current CLI.

## Current Package And Runtime Audit

Current state:

- root `package.json` has no Playwright dependency.
- `packages/ts-shell/package.json` has runtime dependency `undici` only.
- `package-lock.json` mentions `playwright` only as Vitest's optional peer.
- no Playwright browser binary install policy exists.
- Route 101 Playwright local execution remains unavailable without explicit
  checker/runner injection.
- package scripts and default gates remain unchanged.

Package changes would be required for direct Playwright imports or browser
binary installation. That is not justified in Route 102 because default browser
execution remains blocked and external runner injection already provides a
bounded seam.

## Options Considered

No dependency / external runner only:

- recommended now
- no package mutation or browser binary install
- deterministic unavailable output when no runner is configured
- compatible with CLI harness and future skill-managed runner

Dev dependency:

- deferred
- useful for future deterministic tests, but still needs browser binary install
  policy and CI footprint approval

Package dependency:

- deferred
- too much install/runtime footprint for a non-default browser capability

Optional peer / external tool:

- deferred
- promising later, but needs discovery, user guidance, and failure reporting

Skill/CLI-managed runner:

- recommended future product path
- keeps browser runtime outside the core package, but still needs a dedicated
  explicit bridge route

## Implemented Policy

Route 102 adds:

- `browserRuntimeDependencyPolicy.ts`
- `browserExternalRunnerPolicy.ts`
- `browserRuntimeAvailabilitySurface.ts`

The dependency policy recommends `external-runner-only`, records deferred
dependency alternatives, and states:

- package mutation: none
- browser binary install: none
- default browser execution: disabled
- provider/model/network: none

The external runner policy allows only explicit local/test sources:

- CLI harness manifest
- explicit local config
- future skill-managed runner as `future-skill-required`

Allowed runner config must be local-fixture-only, local-fixture sandboxed,
default-deny allowlist, and safe-summary-only evidence. It does not spawn a
process or read raw runner config.

## User-Facing Availability Model

`/browser status` now includes a `Browser runtime dependency` section with:

- decision
- availability
- external runner policy
- current mode
- browser execution default
- package mutation
- browser binary install
- next action
- risks/blockers

`/browser execute ...` appends the same dependency surface, so a
`playwright-local` unavailable result explains both missing runtime and the
package decision. The CLI bridge summary also reports dependency decision and
external runner policy.

Sidebar browser tool summaries include the dependency decision, but no sidebar
persistence, schema, dynamic discovery, provider/model call, MCP launch, or raw
event payload is added.

CLI scenario reports summarize dependency state as a compact field, not as raw
stdout/stderr.

## Package-Change Decision

Package files are not touched.

Reason:

- no default browser execution is enabled
- no browser binary policy exists
- direct dependency would expand install footprint
- external runner policy is enough to make unavailable/tool-runner reporting
  explicit and deterministic

## Blocked Until Later Routes

Still blocked:

- default browser execution
- Playwright package dependency
- browser binary install
- external network
- arbitrary URL execution
- MCP server launch or dynamic discovery
- provider/model calls
- persistent browser session
- auth, payment, destructive, upload, download, screenshot/OCR
- raw page content, raw runner config, secrets, or hidden reasoning in output

## Route 103 Recommendation

Recommended next route: browser external runner / skill-managed execution
bridge.

Route 103 should define how a skill-managed or explicitly configured external
runner is discovered, invoked, bounded, and reported without package mutation
or default execution.

Alternative next routes:

- browser execution evidence/report hardening if status surfaces need polish
- Playwright dependency integration only if package/runtime footprint becomes
  acceptable
- browser action cache/replay design if local repeatability should come first

## Route 103 External Runner Bridge Note

Route 103 implements the external-runner bridge without changing the package
decision. A validated manifest can point `/browser execute` at an explicit
test/local runner process for local-fixture observe/extract evidence, while
default execution, Playwright dependency, browser binary install, external
network, MCP launch, provider/model calls, and raw runner output remain
blocked.

## Route 104 Evidence Receipt Note

Route 104 does not change the dependency decision. Browser execution evidence is
now summarized through receipts and replay-readiness metadata, but no Playwright
package, browser binary install, MCP launch, external network, provider/model
call, or raw evidence surface is added.

## Route 105 Skill Runner Metadata Note

Route 105 does not change the external-runner-only dependency decision. It adds
skill-managed metadata/readiness surfaces only; no Playwright package, browser
binary install, MCP launch/discovery, external network, provider/model call, or
default browser execution is added.

## Route 106 Skill Execution Bridge Note

Route 106 keeps the external-runner-only dependency decision. Skill-managed
execution runs only through an explicit local/test runner binding supplied by a
manifest; it does not add a Playwright package, browser binary install, MCP
server launch, dynamic discovery, external network, provider/model call,
default browser execution, or package/default-gate change.
