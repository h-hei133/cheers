# Playwright CLI Non-Default Browser Execution

Route 96 adds the first browser execution seam after the preview-only browser
boundary, non-executing dry-run harness, and Agent Scenario Harness foundation.
The seam is deliberately non-default: browser execution happens only when a
caller injects an explicit executor. Without that executor, `/browser execute`
returns a blocked result with `Executed: no`.

## Reference Scan

Budget used: 12 files. Optional `playwright-cli` and `browser-use` repositories
were not present.

Stagehand:

- `packages/docs/v2/references/act.mdx`
- `packages/docs/v2/references/observe.mdx`
- `packages/docs/v2/references/extract.mdx`

Stagehand separates natural-language action execution, observation, and
structured extraction. It also allows observed actions to be executed later,
which supports a future action-cache/replay boundary. Local implication:
Route 96 should keep execute, observe, and extract as separate action concepts
and should not call a model from the execution surface.

Playwright MCP:

- `src/README.md`
- `tests/click.spec.ts`

Playwright MCP exposes named browser tools and returns command code plus a
structured snapshot. Local implication: the first local seam should describe
expected evidence such as accessibility snapshot summaries without launching an
MCP server or loading broad schemas by default.

OpenHands:

- `frontend/src/types/v1/core/openhands-event.ts`
- `frontend/src/types/v1/core/events/action-event.ts`
- `frontend/src/types/v1/core/events/observation-event.ts`

OpenHands separates action events, observations, tool names, tool-call ids,
errors, and UI summaries. It also carries hidden/reasoning fields that must not
be surfaced directly. Local implication: browser execution output should use a
sanitized result/event projection rather than raw tool payloads.

mini-swe-agent:

- `src/minisweagent/agents/default.py`

mini-swe-agent keeps a compact execute-actions loop and serializes trajectory
evidence separately from runtime execution. Local implication: the scenario
harness should record deterministic evidence while keeping the executor
interface narrow.

Inspect AI:

- `src/inspect_ai/_eval/task/run.py`
- `src/inspect_ai/scorer/_scorer.py`

Inspect AI separates task run orchestration, sandbox concerns, logs, and
scorer-style assertions. Local implication: Route 96 scenario tests should
assert the result contract and safety boundaries directly rather than relying
only on command success.

## Route 94 Baseline

Route 94 can produce non-executing browser dry-run plans with runtime
recommendations, sandbox requirements, expected evidence, blocked risks, and
`Executed: no`. It never launches Playwright, MCP, a browser process, network,
providers, or models.

Route 96 keeps preview and dry-run unchanged and adds only a separate
`/browser execute ...` branch.

## Smallest Safe Seam

The smallest safe seam is:

- a pure execution request contract
- a deterministic policy decision
- an injected executor interface
- a no-op/default blocked executor
- a fake/test executor for harness coverage
- a result and terminal/sidebar surface that always says whether execution
  happened

The default runtime has no executor. That means the command can parse and
explain execution intent, but cannot launch a browser.

## Executor Injection Model

Executor injection is explicit command context, not process-global state. The
normal command registry does not create a browser executor. Scenario fixtures
may inject `FakeBrowserExecutor` for deterministic tests.

Executor modes:

- `disabled`: default, always blocked
- `fake-test`: deterministic harness-only execution evidence
- `explicit-local`: future non-default local runtime
- `future-runtime`: placeholder for later sandboxed runtimes

The Playwright CLI adapter is plan-only in this route. It builds a
Playwright-CLI/Skills-style command description, dependency list, sandbox
requirements, and expected evidence without spawning a process.

## First Action Subset

Supported command forms:

- `/browser execute navigate <url>`
- `/browser execute observe`
- `/browser execute extract <goal>`

Policy:

- `observe` and `extract` are read-only but still require an injected executor.
- `navigate` requires an injected executor and explicit network/runtime
  confirmation.
- `click` and `type` remain confirmation-required and non-executing.
- auth, payment, destructive action, upload, download, screenshot/OCR,
  arbitrary JavaScript, hidden browser state, and persistent sessions remain
  blocked.

## Evidence Model

Execution evidence must be compact and redacted:

- request id
- action kind
- executor/runtime kind
- timestamp or deterministic status evidence
- policy decision
- expected evidence categories such as navigation target, accessibility
  snapshot summary, extraction schema/result summary
- raw content excluded

Evidence must not include secrets, provider credentials, hidden reasoning, raw
browser content, screenshots, OCR text, downloaded files, uploaded file data,
or browser session state.

## Sidebar Integration

`/browser execute ...` emits through the existing command result sidebar
adapter. The event title is `Browser execution`; blocked results become
blocked sidebar events, fake/test success becomes a user-visible success
summary. The event summary is built from allowlisted sanitized result lines.

No sidebar schema, persistent event store, dynamic MCP/skills discovery, raw
event payload rendering, provider/model call, or startup auto-load is added.

## Scenario Harness Integration

Route 96 adds browser scenario examples for:

- default execution blocked by missing executor
- fake/test executor success for `observe`
- dry-run remaining non-executing without an executor

The harness can allow fake/test execution claims only when scenario metadata
explicitly marks `browser-fake-execution`. Real browser execution remains
unexpected in the harness.

## No-Default-Execution Boundary

Route 96 does not:

- launch Playwright
- launch or discover MCP servers
- navigate websites by default
- access network from the default command path
- persist browser sessions
- call providers or models
- change package scripts or default gates
- change SessionManager schema
- change edit runtime, recovery, rollback, memory persistence, or startup
  injection
- expose raw content, secrets, provider credentials, hidden reasoning, or raw
  browser blobs

## Deferred To Browser Sandbox Hardening

Future routes must own:

- network/target allowlist
- ephemeral browser context and cleanup
- user confirmation for state-changing actions
- real Playwright CLI or MCP process lifecycle
- screenshot/OCR policy
- browser session persistence policy, if ever needed
- auth/payment/destructive-flow policy, if ever allowed
- richer action/observation event taxonomy

## Next Route Criteria

Choose browser sandbox hardening and network allowlist if the next goal is real
local execution.

Choose real CLI scenario harness if process-spawn evidence should be proven
before browser runtime work.

Choose Playwright CLI real execution opt-in only after sandbox, allowlist, and
confirmation policy are explicit enough to prevent default browser execution.
