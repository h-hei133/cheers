# Skill-Managed Browser Runner Metadata

Route 105 makes the future skill-managed browser runner concrete as metadata
only. It does not execute skills, discover MCP tools, launch browsers, add
Playwright, call providers/models, or persist browser state.

## Reference Scan Summary

Bounded scan inputs:

- Playwright MCP: `tests/capabilities.spec.ts`, `config.d.ts`, `README.md`
- Stagehand: `claude.md`, `packages/core/lib/v3/types/public/methods.ts`,
  `packages/core/lib/v3/api.ts`
- Inspect AI: `src/inspect_ai/tool/_tool.py`,
  `src/inspect_ai/tool/_tool_info.py`,
  `src/inspect_ai/tool/_tools/_web_browser/_web_browser.py`
- mini-swe-agent: `src/minisweagent/config/default.yaml`,
  `src/minisweagent/models/utils/actions_toolcall.py`
- OpenHands:
  `frontend/src/components/features/conversation/conversation-tabs/conversation-tabs.tsx`

Findings:

- Playwright MCP exposes a broad tool list with read-only metadata and
  explicit opt-in capabilities such as pdf, vision, and devtools. It also has
  risky tool classes such as file upload, screenshot, and unsafe code
  execution. Route 105 therefore requires an explicit allowlist and rejects
  dynamic discovery claims.
- Stagehand splits `observe`, `act`, and `extract`, and returns cache metadata
  such as HIT/MISS for repeatable actions. Route 105 borrows the capability
  split and replay/cache metadata shape only; it does not add action cache
  persistence or AI-mediated action execution.
- Inspect AI tools separate tool definitions, JSON-schema-like tool info,
  sandbox tooling, approval errors, and transcript/viewer rendering. Route 105
  mirrors that separation with metadata, readiness, evidence, and surface
  modules.
- mini-swe-agent keeps tool configuration intentionally small: one command
  tool, strict parsing, and observation metadata. Route 105 follows that model
  by requiring deterministic metadata and bounded output budgets.
- OpenHands exposes browser/tool availability as UI/session status, not as
  proof that execution is safe. Route 105 treats skill-managed availability as
  status and next-action guidance only.

## Route 103/104 Baseline

Route 103 added explicit external-runner manifests, local-fixture-only scope,
process adapter evidence, and skill-managed policy as a boundary. Route 104
added browser execution receipts, evidence bundles, safety classification, and
replay readiness. Route 105 extends those surfaces with skill runner metadata
while keeping execution disabled.

## Metadata Model

The skill runner metadata contract is:

- `metadataVersion`: `browser-skill-runner-metadata/v1`
- runner id/version
- source: explicit manifest, skill-managed, test-only, or disabled
- skill id/name
- runner capability id: `browser-external-runner`
- supported and blocked action projections
- evidence contract: `safe-summary-only`
- sandbox contract: `local-fixture-no-network`
- allowlist contract: `none`
- confirmation contract: `explicit-local-fixture`
- replay contract: `receipt-reference-only`
- dynamic discovery: `disabled`
- MCP launch: `none`
- execution: `metadata-only`
- redactions/warnings

Supported Route 105 action kinds are `observe`, `extract`, `navigate-local`,
`future-click`, and `future-type`. Auth, payment, destructive actions,
upload/download, screenshot, and arbitrary JavaScript are rejected.

## Skill-Managed Versus Raw External Runner

Raw external runner mode is a process bridge: a validated manifest can point to
an explicit local/test runner process. Skill-managed mode is only a capability
contract in Route 105. It may explain what a future skill-owned runner can do,
but it does not create an executor and does not authorize process or browser
execution.

Valid metadata changes `/browser status`, `/browser execute` explanations,
receipts, replay readiness, sidebar summaries, and scenario reports. It does
not change the default execution decision.

## Capability and Evidence Contract

Before execution can be designed, a future route must prove:

- safe action allowlist and blocked action list
- local-fixture-only sandbox
- no external network allowlist
- explicit confirmation boundary
- safe-summary evidence only
- timeout and output budgets
- no raw page content, secrets, hidden reasoning, raw metadata, or raw runner
  output in user-visible surfaces
- receipt linkage for any eventual execution

## Readiness Policy

Readiness states are:

- `metadata-ready`
- `metadata-incomplete`
- `blocked-unsafe-capability`
- `blocked-missing-evidence-contract`
- `blocked-missing-sandbox-contract`
- `blocked-dynamic-discovery`
- `future-execution-required`
- `unavailable`

`metadata-ready` means the route-scoped contract is coherent. It does not mean
the action is executable. `/browser execute` with valid skill metadata reports
`future-execution-required` and `Executed: no`.

## Receipt and Replay Integration

Receipts may reference the skill runner id and metadata readiness when present.
Replay readiness can report `replay-needs-skill-runner`. Metadata readiness
does not imply replay readiness; replay execution remains `not-started` and
persistence remains `none`.

## Sidebar, Status, and Report Model

The skill-managed surface renders:

- skill id/name
- metadata status
- supported and blocked actions
- evidence, sandbox, and replay contracts
- `Execution: not enabled`
- next action

Sidebar events summarize sanitized skill metadata status lines. CLI scenario
reports include a compact `skill=` field alongside receipt/replay/dependency
summaries.

## Boundary

Route 105 adds no:

- dynamic skill discovery
- skill execution
- MCP server launch
- Playwright dependency
- default browser execution
- external network
- provider/model calls
- persistent browser session
- auth/payment/destructive/upload/download/screenshot/OCR actions
- arbitrary JavaScript execution
- package script/default gate changes
- SessionManager schema changes
- raw metadata, page content, secrets, hidden reasoning, or raw content blobs
  in output

## Route 106 Recommendation

Recommended Route 106: skill-managed browser runner execution bridge, if Route
105 metadata/readiness remains stable. That route should own explicit skill
execution authority, runner lifecycle, permission prompts, process boundary,
and execution receipts.

Alternative Route 106: browser action cache/replay design, if replay metadata
should be formalized before skill execution.
