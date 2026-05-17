# Real Playwright Local-Only Execution

Route 101 attempts the first Playwright-backed local-only browser execution
surface after the Route 100 CLI manifest bridge. The result is still explicit,
test-local, and non-default.

## Reference Scan Summary

Files inspected within the Route 101 budget:

- Playwright MCP: `README.md`, `tests/fixtures.ts`, `cli.js`, `index.js`,
  `tests/library.spec.ts`
- Stagehand: `packages/core/README.md`,
  `packages/core/examples/actionable-observe-example.ts`,
  `packages/core/examples/targeted-extract.ts`,
  `packages/core/tests/unit/page-snapshot.test.ts`,
  `packages/core/tests/unit/safety-confirmation.test.ts`,
  `packages/cli/src/local-strategy.ts`
- OpenHands: `tests/unit/utils/test_redact.py` plus targeted browser/event
  search
- Inspect AI: `tests/solver/test_transcript.py`,
  `src/inspect_ai/util/_sandbox/self_check.py`,
  `src/inspect_ai/util/_sandbox/events.py`
- mini-swe-agent: `docs/usage/output_files.md`,
  `src/minisweagent/agents/default.py`,
  `src/minisweagent/config/mini.yaml`,
  `tests/run/test_save.py`

Patterns applied locally:

- Prefer accessibility/summary evidence over screenshot/OCR evidence.
- Keep browser lifecycle explicit: prepare, execute, close, and report cleanup.
- Treat local browser strategy as a separate mode from external browsing.
- Separate transcript/report summaries from raw stdout, stderr, or content.
- Redact secrets and raw config-like data before logs or reports.
- Represent unavailable runtime as deterministic evidence, not a flaky failure.

No implementation code was copied from reference repositories.

## Route 100 Baseline

Route 100 added `PRIVATE_AGENTS_BROWSER_LOCAL_FIXTURE_MANIFEST`, a temp JSON
manifest written by the real CLI scenario harness. The child CLI reads only the
manifest path, validates one safe local fixture, and constructs a non-default
local-fixture executor. No manifest means disabled; invalid manifest means a
safe blocked result.

Route 101 keeps that baseline and extends the manifest `executorMode` from
`local-fixture` to include `playwright-local`.

## Runtime Availability Audit

Current dependency state:

- root `package.json` and `packages/ts-shell/package.json` do not declare
  Playwright as a dependency.
- `package-lock.json` mentions `playwright` only as Vitest's optional peer.
- existing tests exercise browser planning, fake/test execution, local fixture
  execution, and CLI manifest injection; they do not launch Playwright.
- adding Playwright, Playwright MCP, Stagehand, or package scripts would violate
  this route.

Decision:

- default CLI runtime availability is deterministic `unavailable`.
- no process is spawned for availability detection unless a test or future route
  injects an explicit checker.
- real execution is represented through an injected local runner. Without that
  runner, `playwright-local` reports `Executed: no`.
- this route proves the merge point and unavailable path; it does not make
  Playwright a package dependency.

## Local-Only Execution Model

`BrowserPlaywrightLocalExecutor` implements the existing `BrowserExecutor`
interface with `kind: "playwright-local"`.

It requires:

- a valid CLI local fixture manifest with `executorMode: "playwright-local"`
- local-fixture authority for the fixture id
- local-fixture sandbox authority
- default-deny network allowlist
- read-only action: observe, extract, or `navigate local-fixture://...`
- Playwright availability plus an injected local runner before execution

It blocks:

- no manifest/default execution
- external URLs and arbitrary URL execution
- click/type, auth, payment, destructive, upload, download, screenshot/OCR
- arbitrary JavaScript
- raw content evidence
- persistent sessions

## Evidence Model

`browserPlaywrightLocalEvidence.ts` records bounded fields only:

- execution id
- runtime kind and availability
- execution mode
- fixture id
- safe URL and safe title
- safe observation/extraction summaries
- action trace summary
- bounded stdout/stderr summaries
- cleanup status
- redactions and warnings
- `Executed: yes/no`

Evidence excludes raw HTML, screenshot/OCR data, external page content, secrets,
provider credentials, hidden reasoning, raw stdout/stderr, and raw manifest
content.

## Lifecycle Model

`browserPlaywrightLifecycle.ts` models:

- prepare local fixture
- resolve explicit runtime availability
- run injected local runner only when available
- collect sanitized evidence
- close/cleanup on success
- fail safely with redacted details
- report unavailable without launching anything

The lifecycle has no persistent browser session. Cleanup status is always
represented as `closed`, `not-started`, or `failed-safe`.

## Real CLI Scenario Plan

`browserPlaywrightLocalScenarioExamples.test.ts` proves:

- no manifest keeps `/browser execute ...` blocked with `Executed: no`
- explicit `playwright-local` manifest reports unavailable safely when no
  runtime checker/runner is injected
- external URL navigation still blocks with a valid manifest
- report summaries include browser evidence, manifest status, mode, and
  `Executed: yes/no`

If a future route adds a declared Playwright dependency or an approved runtime
checker/runner, the same executor surface can produce `Executed: yes` for
local-fixture observe/extract without changing the default CLI boundary.

## No-External-Network Boundary

The allowlist remains default-deny. `local-fixture://` navigation is allowed
only for `local-fixture` and `playwright-local` modes. HTTP/HTTPS targets remain
blocked unless a later route owns explicit external-network policy.

Route 101 does not add MCP launch, dynamic discovery, provider/model calls,
package changes, startup cache, memory persistence, SessionManager schema
changes, edit runtime changes, recovery behavior, rollback, or raw content
exposure.

## Route 102 Recommendation

Best next route: Playwright runtime dependency decision.

Reason: the Route 101 bridge and unavailable path are stable, but true
Playwright execution cannot become default or reliable until the project
explicitly decides whether to declare a Playwright runtime dependency or keep
it permanently injected by route-local harnesses.

Alternative next routes:

- browser execution evidence/report hardening if command/report surfaces need
  richer diagnostics first
- browser action cache/replay design if local evidence should become
  repeatable before external browsing
- external-network browser execution design only after local Playwright
  execution is truly available

## Route 102 Dependency Decision Note

Route 102 chooses `external-runner-only` for the current Playwright runtime
dependency policy and leaves package files untouched. `playwright-local`
continues to report deterministic unavailable unless an explicit local/test
runner is injected. `/browser status`, `/browser execute`, CLI bridge output,
sidebar summaries, and scenario reports now surface the dependency decision
and external runner policy.

## Route 103 External Runner Bridge Note

Route 103 keeps `playwright-local` unchanged and adds a separate external
runner executor path. The new path can execute only through an explicit
external-runner manifest and local/test process adapter; it still reports no
browser process launch, no Playwright dependency, no MCP launch, no external
network, and no raw page or runner content.
