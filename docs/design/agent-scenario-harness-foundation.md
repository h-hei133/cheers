# Agent Scenario Harness Foundation

Route 95 adds a deterministic local scenario harness for cross-capability
regression evidence. It is a test and design foundation, not a production
runtime path.

## Reference Scan

Files inspected within the Route 95 budget:

- Inspect AI:
  - `/home/wang/projects/inspect_ai/src/inspect_ai/_eval/task/task.py`
  - `/home/wang/projects/inspect_ai/src/inspect_ai/_eval/task/run.py`
  - `/home/wang/projects/inspect_ai/src/inspect_ai/log/_log.py`
  - `/home/wang/projects/inspect_ai/src/inspect_ai/scorer/_scorer.py`
  - `/home/wang/projects/inspect_ai/src/inspect_ai/dataset/_dataset.py`
  - `/home/wang/projects/inspect_ai/src/inspect_ai/solver/_task_state.py`
- mini-swe-agent:
  - `/home/wang/projects/mini-swe-agent/src/minisweagent/agents/default.py`
  - `/home/wang/projects/mini-swe-agent/src/minisweagent/environments/local.py`
  - `/home/wang/projects/mini-swe-agent/tests/conftest.py`
  - `/home/wang/projects/mini-swe-agent/tests/run/test_local.py`
  - `/home/wang/projects/mini-swe-agent/src/minisweagent/run/utilities/inspector.py`
- OpenHands:
  - `/home/wang/projects/OpenHands/openhands/app_server/event/event_service.py`
  - `/home/wang/projects/OpenHands/openhands/app_server/event/event_service_base.py`
  - `/home/wang/projects/OpenHands/openhands/app_server/event/filesystem_event_service.py`
  - `/home/wang/projects/OpenHands/frontend/src/types/v1/core/openhands-event.ts`
  - `/home/wang/projects/OpenHands/frontend/src/utils/handle-event-for-ui.ts`
  - `/home/wang/projects/OpenHands/frontend/src/components/features/chat/event-message.tsx`

Inspect AI contributes the separation between task/sample definition, runner
state, logs, and scorer-style assertions. The local harness mirrors that by
keeping `AgentScenario`, step results, assertions, safety checks, and reports
as separate concepts.

mini-swe-agent contributes the compact trajectory idea: a run is a sequence of
messages/actions/observations that can be saved, inspected, and replayed in
tests with deterministic model outputs. Route 95 uses that shape without model
calls by making slash commands and simulated user turns the trajectory steps.

OpenHands contributes the event evidence model: session events should be
append-only, searchable, summarized for UI, and replaced or deduped only at the
presentation layer. Route 95 keeps sidebar evidence in the existing in-memory
event store and reports sanitized summaries only.

## Current Validation Landscape

Existing validation is strong but capability-specific:

- compact future-turn injection tests
- project memory review/store/recall/use/lifecycle tests
- startup warm cache command tests
- sidebar state/event/panel/watch tests
- browser preview and dry-run tests
- result-contract and edit-capability closeout verifiers

The gap is a reusable scenario layer that can prove multi-step behavior across
those systems without spawning the production CLI or calling providers.

## Scenario Model

`AgentScenario` is the task definition. It names a scenario, metadata, ordered
steps, and expected final assertions.

`AgentScenarioStep` is one unit in the trajectory:

- `command`: invokes an existing local slash command runtime through
  `routeSlashCommand`.
- `simulated-user-turn`: exercises future-turn compact and memory injection
  planners without provider/model calls.
- `assertion`: evaluates a focused output or state assertion.
- `fixture`: seeds deterministic test-only context.
- `checkpoint`: records a scenario milestone and next action.

`AgentScenarioResult` is the log. It carries step outputs, assertions, safety
checks, sidebar events, evidence, blockers, next action, and redactions.

## Assertions And Reports

Assertions are scorer-like checks over outputs, sidebar events, and scenario
evidence. Route 95 includes output contains/does-not-contain/section/budget
checks, sidebar event checks, compact and memory one-shot checks, memory
lifecycle exclusion, browser `Executed: no`, next-action, and validation-status
checks.

Reports are deterministic summaries. They include scenario id/name, status,
steps run, output summaries, assertion totals, safety check totals, sidebar
event count, compact/memory/warmup/browser evidence presence, blockers, next
action, and redactions. Reports do not include raw command blobs beyond short
sanitized previews.

## Safety Model

The harness rejects reports or step outputs that expose raw-content markers,
secret-looking tokens, provider credential-looking strings, hidden reasoning
markers, unexpected automatic recovery claims, atomic rollback claims, browser
execution claims, memory auto-injection claims, or startup auto-load claims.

The runner itself does not:

- call providers or models
- execute a real browser
- launch Playwright or MCP
- access network
- spawn the production CLI
- change SessionManager schema
- persist harness state
- change package scripts or default gates
- execute edits outside existing test fixtures

## Fixture Strategy

Fixtures create explicit temp roots, deterministic clocks, deterministic ids,
in-memory compact/sidebar/review/injection stores, a test-only project memory
store, and a test-only startup warm cache store. Disk writes are limited to the
explicit temporary workspace roots required by existing local store APIs.

## Route 95 Artifacts

Code:

- `packages/ts-shell/src/core/harness/agentScenarioModel.ts`
- `packages/ts-shell/src/core/harness/agentScenarioFixtures.ts`
- `packages/ts-shell/src/core/harness/agentScenarioRunner.ts`
- `packages/ts-shell/src/core/harness/agentScenarioAssertions.ts`
- `packages/ts-shell/src/core/harness/agentScenarioSafety.ts`
- `packages/ts-shell/src/core/harness/agentScenarioReport.ts`
- `packages/ts-shell/src/core/harness/agentScenarioExamples.test.ts`

Initial scenarios cover:

- compact + memory + sidebar continuity
- memory lifecycle safety
- browser dry-run visibility
- warmup cache preview

## Deferred

Deferred to later routes:

- real CLI scenario harness with process spawn evidence
- browser runtime harness and real Playwright evidence
- sandbox execution harness
- long-session benchmark harness
- output quality harness with richer scoring
- persistence or cross-session scenario history

## Route 96 Browser Execution Note

Route 96 extends the harness with browser execution scenarios while keeping
real browser execution out of the default safety model. The default scenario
asserts `/browser execute ...` is blocked without an executor. A separate
fake/test scenario injects `FakeBrowserExecutor`, marks
`browser-fake-execution` in metadata, and verifies sanitized `Executed: yes`
evidence without launching Playwright, MCP, providers, models, or network.

## Route 97 Browser Sandbox Note

Route 97 adds sandbox-specific browser scenarios for missing authority,
missing allowlist, fake/test preflight success, and dry-run sandbox
requirements. Fake/test execution remains explicitly marked in metadata so the
harness can reject accidental real browser execution claims.

## Route 98 Real CLI Scenario Note

Route 98 adds a separate process-spawn CLI scenario harness for command-only
real CLI evidence. It complements this in-process harness by asserting stdout,
stderr, exit, timeout, report, and safety evidence from the actual CLI child
process. The two harnesses remain separate so the CLI runner does not become a
second runtime implementation.

## Route 99 Local Fixture Execution Note

Route 99 extends in-process scenarios to allow explicitly marked
`browser-local-fixture-execution` evidence. This keeps local fixture execution
separate from fake/test execution while preserving the default safety check
that rejects unexpected `Executed: yes` browser claims.

## Route 100 Real CLI Local Fixture Note

Route 100 keeps the in-process harness unchanged and extends only the separate
real CLI scenario harness with explicit local-fixture manifest injection. The
shared CLI safety check now accepts `Executed: yes` only when the output also
proves `Mode: local-fixture`, `Browser process: local fixture only`, no MCP
launch, and no provider/model call.

## Route 101 Playwright Local Note

Route 101 extends the shared CLI safety check to recognize explicit
`playwright-local` local-only execution evidence when it is paired with
`Browser process: playwright local only`, no MCP launch, and no provider/model
call. The real CLI route currently exercises the unavailable path; injected
runner success remains covered by focused context tests.

## Route 102 Dependency Policy Note

Route 102 adds dependency-policy assertions to browser CLI scenarios:
`/browser status` must show `external-runner-only`, unavailable
`playwright-local` output must explain the dependency decision, local-fixture
execution remains unaffected, and report summaries include dependency state.
This changes harness evidence only, not execution authority.

## Route 103 External Runner Harness Note

Route 103 extends the shared CLI safety check to recognize explicit external
runner execution only when output proves `Mode: test-local` or
`external-local`, `External browser runner`, `Browser process: not launched`,
no MCP launch, and no provider/model call. The in-process harness remains
unchanged; the real CLI harness owns temp runner process scenarios.

## Route 104 Evidence Receipt Note

Route 104 adds receipt-specific harness assertions for browser execution
output. They check receipt existence, status, executed state, replay readiness,
safe output, decision context, local/test scope, and next action without
changing the scenario runner into a browser runtime or persistence layer.

## Route 105 Skill Runner Metadata Note

Route 105 keeps the scenario harness as evidence collection only. Browser skill
runner scenarios assert metadata status, future-execution-required blocking,
unsafe capability rejection, receipt/replay linkage, and report summaries
without adding skill execution, dynamic discovery, browser runtime, MCP launch,
or persistence behavior to the harness.

## Route 106 Skill Execution Bridge Note

Route 106 lets the harness recognize explicit skill-managed local/test
execution only when command output proves `Mode: skill-managed`,
`Skill-managed browser execution`, `Browser process: skill-managed local/test
runner only`, no MCP launch, and no provider/model call. The harness remains an
evidence/assertion layer; temp runner processes belong to scenario fixtures and
do not add dynamic discovery, browser runtime ownership, persistence, or raw
runner output reporting.

## Route 107 Explicit Replay Note

Route 107 adds replay scenarios as evidence-only harness coverage. The harness
can run execute-then-replay in process with an explicit in-memory cache and
current runner context, and it can report replay status safely. It does not add
browser runtime ownership, cross-process cache persistence, automatic replay,
dynamic discovery, MCP launch, provider/model calls, or raw runner output.

## Route 108 Persistent Cache Note

Route 108 extends browser replay scenarios with explicit persistent cache
fixtures. The scenarios prove execute-write, fresh-store replay, invalidated
or deleted cache blocking, no-cache status behavior, and unsafe/corrupted
record rejection without adding default persistence.
