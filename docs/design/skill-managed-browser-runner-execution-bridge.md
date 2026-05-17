# Skill-Managed Browser Runner Execution Bridge

Route 106 turns Route 105 skill-managed browser runner metadata into an
explicit local/test execution bridge. It does not add dynamic discovery, MCP
launch, provider/model calls, Playwright, external network browsing, package
changes, or default browser execution.

## Reference Scan Summary

Bounded scan inputs:

- Playwright MCP: `tests/click.spec.ts`
- Stagehand: `packages/core/lib/v3/types/public/methods.ts`,
  `packages/core/lib/v3/api.ts`
- OpenHands: `frontend/src/utils/cache-utils.ts`
- Inspect AI: `src/inspect_ai/tool/_tool_call.py`,
  `src/inspect_ai/tool/_tool_transcript.py`
- mini-swe-agent: `src/minisweagent/models/utils/actions_toolcall.py`

Findings:

- Playwright MCP invokes named tools with structured arguments and returns
  action code plus a bounded browser observation. Route 106 keeps the same
  request/response discipline but uses local fixture summaries only.
- Stagehand separates `observe`, `extract`, `act`, action metadata, and cache
  status. Route 106 enables only observe/extract/local navigate; action cache
  remains metadata in receipts, not storage or replay execution.
- OpenHands treats tool actions as events that update UI/report state. Route
  106 mirrors that by projecting skill execution into existing browser
  execution, sidebar, and report surfaces.
- Inspect AI separates tool call arguments, transcript rendering, and tool
  errors. Route 106 follows that separation with protocol, binding, executor,
  receipt, and surface modules.
- mini-swe-agent keeps tool runner binding minimal and explicit. Route 106
  requires an explicit runner command in a manifest and rejects unknown tools,
  dynamic discovery, unsafe actions, and raw output.

## Minimum Safe Bridge

The minimum safe bridge is:

1. explicit skill runner metadata
2. explicit skill runner binding
3. local-fixture-only target
4. observe, extract, or navigate-local action only
5. no external network allowlist
6. bounded timeout and output budget
7. safe-summary-only response validation
8. receipt/replay evidence linking metadata id and binding mode

Valid metadata alone is not execution authority. Without binding, `/browser
execute` remains `future-execution-required` and `Executed: no`.

## Binding Versus Raw External Runner

Raw external runner manifests bind directly to an external/test process. Skill
runner binding is narrower: it must reference matching skill metadata, declare
the safe action subset, and carry skill-specific contracts:

- binding version `browser-skill-runner-binding/v1`
- mode `test-local-process` or `external-local-process`
- matching skill runner id/version
- explicit runner command
- local-fixture-only scope
- safe-summary evidence
- receipt-reference replay contract
- network allowlist `none`
- dynamic discovery `disabled`

The bridge constructs a `skill-runner` executor only when both metadata and
binding validate.

## Execution Protocol

`BrowserSkillExecutionRequest` includes request id, skill id, metadata id and
version, action, fixture id, safe URL, extraction goal, sandbox/allowlist/
confirmation decisions, evidence/replay contract ids, output budget, and
`rawContent: excluded`.

`BrowserSkillExecutionResponse` includes status, executed flag, mode, safe
title/URL, safe observation or extraction summary, action trace, receipt/replay
hints, warnings, redactions, optional safe error, and explicit
`providerCall/modelCall/browserSessionPersistence` none markers.

Malformed JSON, timeout, unsafe output, raw HTML, raw page content,
secret-looking strings, hidden reasoning, screenshots/OCR, and arbitrary
stdout/stderr payloads are blocked and summarized.

## Receipts and Replay

Skill-managed execution sets receipt source to `skill-managed`, records the
skill runner id/status, and leaves raw content excluded. Replay readiness can
be `replay-ready` only when execution succeeded, evidence is safe, the target
is local/test scoped, and sandbox/allowlist/confirmation decisions are
complete. Missing binding remains `replay-needs-skill-runner`; unsafe output is
blocked or unsafe and never replayed automatically.

## CLI and Harness Proof

Real CLI scenarios prove:

- no manifest remains blocked
- valid metadata without binding remains future-execution-required
- explicit skill-managed test-local observe/extract succeeds
- external URL navigation remains blocked
- unsafe capability manifests are invalid
- malformed, timeout, and unsafe runner responses are blocked
- reports summarize skill id, binding mode, receipt status, replay readiness,
  and dependency state without raw runner output

The harness writes only temp runner scripts/manifests and passes the manifest
path through env.

## Boundaries

Route 106 adds no dynamic skill discovery, MCP launch, Playwright dependency,
provider/model call, external network, persistent browser session, auth,
payment, destructive action, upload/download, screenshot/OCR, package/default
gate change, SessionManager schema change, edit runtime change, memory
persistence change, startup/model auto-injection, or raw skill/page output.

## Route 107 Recommendation

Recommended Route 107: browser action cache/replay design if repeatable local
skill execution needs stronger replay semantics.

Alternative Route 107: skill-managed browser runner UX/report polish if the
new execution surface is too verbose, or external-network browser execution
design only after local/test skill execution remains stable.
