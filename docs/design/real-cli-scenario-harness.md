# Real CLI Scenario Harness

Route 98 adds a process-spawn evidence layer for selected command-only CLI
scenarios. It builds on Route 95's in-process Agent Scenario Harness, Route
96's non-default browser execution seam, and Route 97's browser sandbox
preflight gates.

The harness proves that safe slash commands behave the same when reached
through the actual CLI child process. It does not make the CLI lifecycle,
provider path, browser runtime, MCP path, or session persistence more capable.

## Reference Scan Summary

Inspect AI patterns to borrow:

- Keep an explicit transcript/event boundary instead of treating raw output as
  the only artifact.
- Separate result scoring from execution. Route 98 mirrors that with process
  evidence plus assertion results.
- Preserve condensed, redacted reports. Raw command blobs and model/provider
  payloads do not belong in default reports.
- Treat sandbox and process failures as first-class result states rather than
  unstructured exceptions.

mini-swe-agent patterns to borrow:

- Model the CLI trajectory as a sequence of steps with command input, output,
  status, and saved result evidence.
- Keep CLI wiring thin: the runner invokes the existing executable path and
  records evidence; it does not reimplement agent behavior.
- Prefer deterministic local fixtures and explicit output files/reports over
  hidden global state.
- Make timeout and failure handling visible in the trajectory.

OpenHands patterns to borrow:

- Preserve action/observation pairing. Route 98 maps command steps to process
  observations so later browser routes can connect user command, process
  result, and safety evidence.
- Separate user-visible summaries from raw event payloads.
- Keep hidden reasoning and raw model/tool content out of rendered reports.

coding-agent baseline patterns to reuse:

- Existing CLI tests already spawn the TSX CLI through Node with isolated
  `HOME`/`USERPROFILE`.
- Slash command handling in `--print` mode can execute local command surfaces
  without provider/model calls.
- Existing browser and sidebar surfaces already render `Executed: no`,
  sandbox/preflight, and redaction evidence that the CLI harness can assert.

## Route 95 Baseline

The in-process harness executes local command runners directly with deterministic
fixtures, in-memory stores, and safety assertions. It is useful for local command
semantics, future-turn planners, sidebar events, and fake/test browser executor
coverage.

Route 98 does not replace that harness. It adds process-level evidence for the
real CLI path:

- command args and prompt summary
- stdout, stderr, combined line counts
- exit code and signal
- timeout status and duration
- assertion and safety-check results
- concise redacted report

## Safe Command Boundary

The initial CLI scenarios are command-only and provider-free:

- `/browser dry-run navigate https://example.com`
- `/browser execute navigate https://example.com`, expected to block
- `/sidebar panel`
- `/warmup status`

These commands are safe because they are local slash command surfaces in
`--print` mode. They must not require provider/model calls, real browser launch,
MCP launch/discovery, network access, SessionManager schema changes, edit
runtime changes, startup auto-load, or memory persistence changes.

The process wrapper strips secret-looking provider environment variables by
default and injects an isolated test home. Reports keep only a prompt summary,
process metadata, output line counts, assertion totals, blockers, next action,
and redaction labels.

## Process Evidence Model

The model lives in:

- `packages/ts-shell/src/core/harness/agentCliScenarioModel.ts`
- `packages/ts-shell/src/core/harness/agentCliProcess.ts`
- `packages/ts-shell/src/core/harness/agentCliScenarioRunner.ts`
- `packages/ts-shell/src/core/harness/agentCliScenarioAssertions.ts`
- `packages/ts-shell/src/core/harness/agentCliScenarioReport.ts`

The process wrapper spawns the project CLI through Node/TSX, captures stdout
and stderr separately, enforces timeout, records exit code/signal, and returns
structured evidence. The runner executes steps sequentially, stops on failed
critical steps, runs explicit assertions plus shared safety checks, and returns
a scenario result.

The report renderer is intentionally compact and deterministic. It summarizes
steps without embedding full stdout/stderr.

## Failure Reporting

Process-level failures are reported with:

- failed exit assertion
- timeout warning and blocked step status
- stdout/stderr line counts
- assertion failure messages
- safety-check blockers
- next action if the CLI output provides one

The harness should classify unrelated CLI setup failures as blockers for the
scenario, not as browser/provider success or product readiness.

## Route 98 Scenarios

Initial coverage:

- browser dry-run through the real CLI child process
- browser execute blocked through the real CLI child process
- sidebar panel through the real CLI child process
- warmup status through the real CLI child process

Each scenario asserts no raw content/secrets, no provider/model/browser/network
execution evidence, and command-specific output.

## Route 99 Decision Criteria

Choose Playwright CLI real execution opt-in only if Route 98 continues to prove
the blocked/dry-run CLI paths deterministically and Route 97 preflight gates
remain stable.

Choose CLI scenario harness polish if future safe command surfaces need richer
trajectory reports, fixtures, or assertion reuse before browser execution.

Choose browser sandbox lifecycle hardening if process evidence exposes cleanup,
allowlist, confirmation, or status gaps.

## Route 99 Local Fixture Note

Route 99 keeps real CLI coverage to the default blocked `/browser execute
observe` path. Local-fixture execution is covered in-process because injecting
a non-default browser executor through the CLI requires a dedicated bridge and
lifecycle policy. That bridge is the recommended Route 100 path if CLI-level
local execution evidence becomes the next blocker.

## Route 100 Local Fixture CLI Bridge Note

Route 100 adds explicit test-local manifest env support for browser CLI
scenarios. The harness can write a temp local-fixture manifest, pass only its
path to the child process, and assert observe/extract success plus external
URL blocking through the real CLI. Reports remain summarized and sanitized; no
raw manifest content, provider/model call, browser launch, MCP launch, network
access, or SessionManager schema change is added.

## Route 101 Playwright Local Note

Route 101 reuses the real CLI scenario harness to pass a manifest whose
executor mode is `playwright-local`. The harness asserts default blocked,
unavailable runtime, external URL blocked, and compact report evidence. It
does not assume cross-process sidebar persistence and does not embed raw
stdout/stderr or raw manifest content in the report.

## Route 102 Dependency Policy Note

Route 102 adds real CLI coverage for `/browser status` dependency policy
output and extends browser execution reports with a compact dependency field.
The harness still records summarized process evidence only; it does not install
Playwright, launch a browser, launch MCP, call providers/models, or persist
cross-process sidebar state.

## Route 103 External Runner Scenario Note

Route 103 extends the real CLI scenario harness with temp external runner
scripts and manifests. Scenarios cover default blocked, observe/extract
success, external URL blocked, malformed response, timeout, and unsafe output.
Reports remain summarized: they include runner mode/source/status but not raw
stdout/stderr, raw manifest content, raw page content, or secrets.

## Route 104 Evidence Receipt Note

Route 104 extends real CLI browser scenarios with receipt assertions for
success, external URL blocking, malformed response, timeout, and unsafe output.
Reports now summarize receipt status and replay readiness, still without raw
stdout/stderr, raw manifest content, raw page content, secrets, persistence, or
cross-process sidebar assumptions.

## Route 105 Skill Runner Metadata Note

Route 105 real CLI scenarios pass explicit skill metadata through the existing
external runner manifest env path. They cover no metadata, valid metadata,
future-execution-required execute output, unsafe metadata rejection, and compact
report summaries without raw manifest content, skill execution, MCP launch,
network access, provider/model calls, or cross-process sidebar persistence.

## Route 106 Skill Execution Bridge Note

Route 106 extends real CLI browser scenarios with temp skill runner bindings and
scripts. Scenarios cover default blocked, valid metadata without binding,
skill-managed observe/extract success, external URL blocking, unsafe
capability rejection, malformed response, timeout, and unsafe output. Reports
summarize skill id, binding mode, receipt status, and replay readiness without
raw runner stdout/stderr, raw manifest content, raw page content, secrets,
network access, MCP launch, provider/model calls, or cross-process sidebar
persistence.

## Route 107 Explicit Replay Note

Route 107 uses in-process harness scenarios for execute-then-replay because the
action cache is intentionally in-memory and non-persistent. CLI command
coverage can assert `/browser replay status` and argument behavior, but
cross-process replay continuity is deferred unless a future route explicitly
adds safe persistence. Reports summarize replay source/new receipt state
without raw runner stdout/stderr, raw manifest content, raw page content, or
secrets.

## Route 108 Persistent Cache Note

Route 108 adds explicit CLI harness cache roots/manifests so one CLI command
can write a sanitized replay-ready receipt and a later command can replay it
with current runner gates. The cache remains local/test scoped, discardable,
and disabled unless explicitly configured.

## Route 109 Persistent Cache Hardening Note

Route 109 extends CLI harness scenarios to cover corrupt/unsafe cache records,
duplicate compaction, tombstone preservation, busy/stale locks, repair, and
cross-process replay after compaction. Scenario reports summarize integrity and
compaction counts without raw cache content.

## Route 110 Multiprocess Stress Note

Route 110 adds a real CLI multi-process stress harness for the explicit browser
cache. It launches bounded child processes for concurrent execute writes,
status/replay during lock contention, compact under busy lock, stale lock
repair, and post-stress integrity checks.
