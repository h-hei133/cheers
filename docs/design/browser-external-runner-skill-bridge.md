# Browser External Runner Skill Bridge

Route 103 builds on the Route 102 dependency decision: browser execution stays
external-runner-only, Playwright is not a package dependency, and default
browser execution remains disabled.

## Reference Scan

Bounded scan:

- Playwright MCP: tool calls return structured result sections plus snapshot
  evidence, but dynamic MCP discovery and server lifecycle are too broad for
  this route.
- Stagehand: `act`, `observe`, and `extract` separate action intent from
  evidence; repeatable/cached action ideas are useful later, but AI-mediated
  execution is out of scope.
- OpenHands: sandbox status and runtime health should be explicit and
  user-visible instead of inferred from a launched process.
- Inspect AI: tool events separate tool call content, errors, transcripts, and
  logs; unavailable and timeout states should be represented as tool errors,
  not raw logs.
- mini-swe-agent: command trajectories and timeout tests show the need to
  preserve partial process evidence while redacting raw stdout/stderr.

Implication: Route 103 should accept only a manifest-scoped local/test runner
with a small request/response protocol, hard timeout, output budget, and
sanitized evidence.

## Protocol

The external runner protocol is JSON over stdin/stdout:

- request: id, action, mode, fixture id, safe local URL, optional extraction
  goal, sandbox/allowlist/confirmation summaries, output budget, raw content
  excluded
- response: status, executed flag, mode, safe title/URL, safe observation or
  extraction summary, action trace summary, warnings, redactions, error
  summary, raw content excluded, provider/model calls none, session
  persistence none

Supported runner actions:

- `observe`
- `extract`
- `navigate-local`

Supported runner statuses:

- `executed`
- `blocked`
- `unavailable`
- `failed`
- `timed-out`
- `invalid-response`

Responses are rejected when they contain raw HTML, raw runner payload markers,
secrets, hidden reasoning markers, screenshot/OCR data, provider/model calls,
or session persistence.

## Manifest

`browserExternalRunnerManifest.ts` defines a route-scoped manifest:

- `manifestVersion`
- source: `cli-harness`, `explicit-local-config`, `skill-managed`, `test-only`
- runner mode: `test-local`, `external-local`, `skill-managed`
- explicit runner id
- explicit local command for local/test modes, or explicit runner ref for
  skill-managed mode
- one sanitized local fixture
- allowed actions
- local-fixture sandbox authority
- network allowlist `none`
- confirmed local sandbox state
- timeout and output budget
- evidence policy `safe-summary-only`
- redactions and warnings

The manifest rejects global/default runner paths, external-network content,
unsafe actions, missing timeout/budget, raw secrets, raw HTML fixtures, and
raw evidence policies.

## Skill-Managed Policy

Skill-managed mode is a policy/protocol boundary only in Route 103. It does
not discover skills, launch MCP, or execute through a skill automatically.

It can pass only when explicit metadata supplies:

- skill id
- browser external runner capability
- local-fixture-only scope
- allowed actions
- safe-summary evidence contract
- local-fixture/no-network sandbox contract

Without that metadata, skill-managed mode returns `future-skill-required` or
a blocked decision.

## Process Model

`browserExternalRunnerProcess.ts` spawns only the manifest-provided local/test
command. It passes the request through stdin, captures stdout/stderr, enforces
timeout and output budgets, parses stdout as JSON, and returns structured
`invalid-response` or `timed-out` results when the runner misbehaves.

Raw stdout/stderr are never surfaced. Reports get only sanitized summaries and
`raw-runner-output` redaction evidence.

## Execution Model

`BrowserExternalRunnerExecutor` implements the existing `BrowserExecutor`
interface. It:

- consumes a validated manifest and local fixture
- reuses local-fixture execution authority
- builds the runner request from the current `/browser execute` request
- invokes the process adapter only for allowed local/test modes
- rejects unsafe/malformed responses
- maps safe responses to `BrowserExecutorResult`
- labels mode/source/status in evidence
- preserves `Executed: yes/no` accuracy

No browser process is reported as launched. The only process is the explicit
test/local runner wrapper.

## Reporting

`/browser execute` now renders an `External browser runner` section for the
external-runner executor. It includes:

- mode
- runner source
- request action
- execution status
- safe evidence summary
- timeout/output-budget boundary
- redactions/warnings
- `Executed: yes/no`
- next action

The CLI scenario report summarizes external-runner mode without embedding raw
stdout/stderr. Sidebar events continue through the existing `/browser` command
event adapter and sanitize raw command output.

## Real CLI Scenarios

Route 103 adds real CLI scenario coverage for:

- default no manifest remains blocked
- explicit test-local external runner observe success
- explicit test-local external runner extract success
- external URL navigation blocked even with a runner
- malformed runner response blocked
- timeout runner blocked
- unsafe runner output rejected without raw/secret leakage

The harness creates temp runner scripts and manifests, passes only the manifest
path through env, and cleans temp files after each scenario.

## Boundaries

Route 103 still adds no:

- Playwright dependency
- browser binary install
- default browser execution
- external-network browsing
- MCP server launch or dynamic discovery
- provider/model calls
- persistent browser session
- SessionManager schema change
- package script/default gate changes
- edit runtime changes
- startup/model auto-injection
- raw runner output, page content, secrets, or hidden reasoning in output

## Route 104 Recommendation

Recommended next route: browser external runner evidence/report hardening.

Alternative Route 104 options:

- skill-managed runner metadata prototype if skill-owned runner wiring should
  become real
- browser action cache/replay design if Stagehand-like repeatability should
  come next
- external-network browser execution design only after local external runner
  evidence remains stable

## Route 104 Evidence Receipt Note

Route 104 keeps the Route 103 external runner bridge explicit and local/test
scoped, then normalizes its output into browser execution receipts, evidence
bundles, safety classification, and replay-readiness metadata. Receipts are
evidence records only: they do not execute replay, persist action cache data,
launch Playwright/MCP, call providers/models, or expose raw runner/page content.
