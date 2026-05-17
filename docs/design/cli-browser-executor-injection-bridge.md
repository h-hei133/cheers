# CLI Browser Executor Injection Bridge

Route 100 bridges the Route 99 local-fixture browser executor into the real CLI
scenario harness. The bridge is deliberately test-local: it lets a child
process receive an explicit manifest pointer, validates the manifest, maps it
onto existing `/browser execute` context fields, and leaves default CLI browser
execution blocked.

## Reference Scan

mini-swe-agent uses pytest fixtures and environment variables to select test
executables and trajectory fixtures. The useful pattern is explicit fixture
setup plus normalized evidence, not implicit runtime discovery.

Inspect AI keeps active sample state and sandbox connections in explicit run
objects with transcript/log separation. The useful pattern is that tool and
sandbox evidence is attached to a run boundary rather than hidden in globals.

OpenHands reinforces the same boundary at a product level: tool/runtime
configuration is explicit and sensitive environment values are not a report
payload. Route 100 follows this by passing only a temp manifest path through
the child process environment.

Stagehand separates local fixture/browser targets, tool surface, assertions,
and reports in its eval architecture. The useful pattern is a fixture-backed
local browser lane before broader remote/browserbase lanes.

Playwright MCP tests start the MCP transport explicitly with test env and
profile directories, assert a concrete tool list, and represent browser action
evidence as structured responses. Route 100 does not launch MCP or Playwright,
but it keeps the same explicit transport/config boundary for future work.

## Route 99 Blocker

Route 99 proved local-fixture execution in-process but could not pass the
executor through the real CLI child-process harness. The real CLI path only
had the default disabled executor context, so `/browser execute ...` correctly
blocked.

## Injection Decision

The safest bridge is an explicit temporary manifest plus env pointer:

- env var: `PRIVATE_AGENTS_BROWSER_LOCAL_FIXTURE_MANIFEST`
- value: path to a harness-created temp JSON manifest
- default: absent, which returns a disabled/noop injection state
- invalid or missing file: blocked with a safe manifest status and no raw
  manifest content

Inline JSON was rejected because it is easier to leak raw content in process
metadata and assertion failures. Global config and startup cache were rejected
because they would blur the test-local boundary.

## Fixture Manifest

`browserLocalFixtureManifest.ts` defines a versioned manifest with one bounded
local fixture, local-fixture-only origins, local-fixture sandbox capabilities,
and optional redaction/warning labels. Validation rejects:

- unsupported versions or executor modes
- external origins or non-`local-fixture://` fixture URLs
- raw HTML, secret-looking data, provider credential labels, or hidden
  reasoning terms
- unsafe capabilities such as auth, payment, destructive, upload, download, or
  screenshot/OCR

The manifest serializes deterministically for tests and stores only safe
summaries.

## CLI Child Process Strategy

`browserCliScenarioFixtures.ts` creates the temp manifest and returns the
single env var needed by `agentCliProcess.ts`. The existing CLI process wrapper
continues to isolate `HOME`/`USERPROFILE`, disable provider mode, clear
`PRIVATE_AGENTS_REAL_HOME`, and set `NO_PROXY=*`.

The child process reads the env pointer through
`browserCliExecutorInjection.ts`. No provider, model, MCP, Playwright, network,
startup cache, or SessionManager state is involved.

## Runtime Mapping

`browserCliExecutionBridge.ts` maps a valid manifest to existing context
fields:

- `BrowserPlaywrightCliLocalFixtureExecutor`
- local-fixture sandbox authority
- default-deny network allowlist with no external origins
- represented sandbox confirmation records
- read-only summary for command output and reports

When no manifest or an invalid manifest exists, the bridge returns only a
disabled summary. The normal `/browser execute` path then blocks through the
existing policy/preflight/result surface.

## Evidence Model

Command output now includes a `Browser executor injection` section:

- execution mode
- executor source
- manifest status
- safe reason
- evidence summary
- redactions
- next action

The CLI scenario report still summarizes process metadata and assertion
totals; it does not embed full stdout/stderr or raw manifest content.

## Sidebar Model

The bridge uses the existing `/browser` command result path. In-process sidebar
events can summarize local-fixture execution as before. Real CLI scenario
tests use separate child processes, so cross-process in-memory sidebar event
persistence is not forced; the command output evidence is the Route 100
assertion surface.

## Safety Boundary

Route 100 adds no default browser execution, no real Playwright process, no MCP
server, no dynamic discovery, no network access, no provider/model call, no
browser session persistence, no SessionManager schema change, no startup
auto-load, and no raw content/secrets/hidden reasoning in manifest or reports.

## Route 101 Recommendation

If the fixture bridge remains stable, Route 101 should choose one of:

- real Playwright CLI local-only execution experiment, still no external
  network by default
- browser execution evidence/report hardening if reports need better
  diagnostics before real runtime work
- external-network browser execution design only after local execution
  evidence and redaction stay stable

## Route 101 Playwright Local Note

Route 101 extends the manifest executor mode to `playwright-local`. The CLI
bridge can construct a Playwright local executor only from a valid explicit
manifest, but the default child process still has no injected runtime checker
or runner, so it reports deterministic unavailable evidence with `Executed:
no`. The local-fixture mode remains unchanged, and unsupported executor modes
block safely.

## Route 102 Dependency Policy Note

Route 102 evaluates every valid manifest through an external runner policy.
Only local/test manifest sources with local-fixture scope, local-fixture
sandbox authority, no external allowlist, and safe-summary evidence are
allowed. The bridge summary now includes dependency decision and external
runner policy, while still exposing no raw manifest content or default runner
path.

## Route 103 External Runner Manifest Note

Route 103 adds a second explicit env pointer for external runner manifests:
`PRIVATE_AGENTS_BROWSER_EXTERNAL_RUNNER_MANIFEST`. When present, the CLI bridge
validates the manifest, creates an external runner executor, and keeps the
same local-fixture sandbox and no-network allowlist. Missing or invalid
manifests remain disabled/blocked, and local-fixture plus `playwright-local`
manifest paths continue to work.

## Route 104 Evidence Receipt Note

Route 104 keeps CLI injection manifest-scoped and explicit while adding receipt
summaries to `/browser execute` output and scenario reports. The bridge still
does not persist runner/cache state, launch Playwright/MCP, use external
network, call providers/models, or expose raw manifest, runner, or page content.
