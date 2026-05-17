# Browser Capability Boundary Preview

Route 93 starts the browser/tooling phase with a preview-only boundary. It
models browser capability, classifies action readiness, and renders safe
previews without starting a browser, MCP server, provider, or model.

## Reference Scan

Budget used: 11 external files.

Stagehand:

- `packages/core/lib/v3/agent/tools/act.ts`
- `packages/core/lib/v3/agent/tools/extract.ts`
- `packages/core/lib/v3/agent/tools/ariaTree.ts`
- `packages/core/lib/v3/agent/tools/README.md`

Playwright MCP:

- `tests/capabilities.spec.ts`

OpenHands:

- `frontend/src/components/features/controls/agent-status.tsx`
- `frontend/src/components/features/chat/event-message-components/mcp-event-message.tsx`
- `frontend/src/components/features/chat/event-content-helpers/get-action-content.ts`

Coding-agent baselines:

- opencode `packages/opencode/src/cli/cmd/tui/routes/session/permission.tsx`
- gemini-cli `packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx`
- ClaudeCode `utils/statusNoticeDefinitions.tsx`

Relevant lessons:

- Stagehand separates browser actions such as act/extract/aria tree into
  explicit tool contracts. Action execution can produce deterministic action
  details later, but this route should keep only the contract/preview split.
- Playwright MCP exposes browser capability as an explicit tool list. This is
  useful for future status and adapter design, but Route 93 must not launch or
  discover an MCP server.
- OpenHands shows browser/MCP actions as user-visible tool/status events with
  risk and confirmation context. The local preview should surface action,
  risk, readiness, and blocked reasons without raw browser content.
- opencode and gemini-cli keep permission/status UI explicit and bounded.
  Future execution should require a separate confirmation route.
- ClaudeCode status notices show concise, actionable warnings. Browser status
  should be similarly short and user-facing.

## First Action Taxonomy

Previewable only:

- `navigate`
- `click`
- `type`
- `extract`
- `observe`
- `wait`

Blocked or future-runtime only:

- `screenshot`
- `download`
- `upload`
- `auth`
- `payment`
- `destructive`

Read-only actions are `status`, `extract`, and `observe`. `navigate`, `click`,
`type`, and `wait` are state-changing and can only be previewed. Auth/payment
are sensitive, destructive actions are destructive, and screenshot/download/
upload stay unsupported until a real browser sandbox/runtime route.

## Readiness Model

Readiness is deterministic and never means executable in this route.

Statuses include:

- `supported-preview`
- `blocked-sensitive`
- `blocked-destructive`
- `blocked-auth`
- `blocked-payment`
- `blocked-no-backend`
- `blocked-dynamic-discovery`
- `blocked-unsupported-action`
- `blocked-ambiguous-target`
- `future-runtime-required`

Every preview renders `Executed: no`, browser process not launched,
provider/model call none, and persistence none.

## Backend Tradeoff

Backend candidates are recorded as future choices:

- Playwright CLI/Skills: likely best deterministic local execution path.
- Playwright MCP: useful explicit tool capability boundary, but adds server
  lifecycle and token/status tradeoffs.
- Stagehand-like split: useful for future action cache or deterministic-vs-AI
  split, but any AI planning/model call is outside this route.

Route 93 chooses no active backend. It records candidates only.

## Command Surface

`/browser` and `/browser status` render browser capability status.

Preview forms:

- `/browser preview navigate <url>`
- `/browser preview extract <goal>`
- `/browser preview click <target>`
- `/browser preview type <target> <text>`

The parser is intentionally simple. More natural syntax belongs in a future UX
route after the boundary is stable.

## Sidebar Integration

The sidebar Tools section gets an explicit browser tooling placeholder:

- Browser capability: preview-only/future
- no browser/MCP launch
- no dynamic discovery
- no provider/model call

`/browser` results emit sanitized sidebar activity through the existing command
event adapter. The event summary uses allowlisted result lines and excludes raw
command output.

## Safety Boundary

Route 93 does not:

- execute browser actions
- launch Playwright
- launch or discover MCP servers
- navigate to websites
- take screenshots, OCR, or browser snapshots
- persist browser sessions
- automate auth, payment, or destructive flows
- call providers or models
- change SessionManager schema
- change edit runtime, recovery, rollback, memory persistence, or startup
  injection
- render raw browser content, secrets, provider credentials, or hidden
  reasoning

## Route 93 Artifacts

Code:

- `browserCapabilityModel.ts`
- `browserActionContract.ts`
- `browserActionReadiness.ts`
- `browserActionPreview.ts`
- `browserCapabilitySurface.ts`
- `browserCommandContract.ts`
- `browserCommandRunner.ts`
- `/browser` integration in `browserCommandRuntime.ts` and `registry.ts`
- sidebar browser placeholder integration in `sidebarCommandRuntime.ts`

Tests:

- browser status output
- navigate/extract/click/type preview behavior
- auth/payment/destructive blocking
- screenshot/download/upload future-runtime blocking
- ambiguous target blocking
- redaction of raw content, secrets, and hidden reasoning
- sidebar browser placeholder and `/browser` sidebar activity

## Deferred

Deferred to a future route:

- Playwright CLI/Skills execution
- Playwright MCP adapter and server lifecycle
- Stagehand-like action cache/replay design
- screenshots/OCR/snapshot handling
- auth/payment/destructive browser automation policy
- browser session persistence

## Route 94 Dry-Run Note

Route 94 adds a non-executing browser dry-run harness and runtime decision
model. `/browser dry-run ...` can render a future execution plan, preferred
runtime candidate, sandbox requirements, expected evidence, blocked risks, and
`Executed: no`. It still does not launch Playwright, launch/discover MCP,
navigate websites, call network, call providers/models, persist browser
sessions, capture screenshots/OCR/snapshots, or expose raw browser content.

## Next Route Criteria

Choose Playwright CLI/Skills integration prototype if deterministic local CLI
execution is preferred.

Choose Playwright MCP capability adapter if MCP lifecycle/status becomes the
main browser boundary.

Choose Stagehand-like action cache design if preview/cache/replay should be
modeled before runtime execution.

## Route 96 Execution Seam Note

Route 96 adds `/browser execute navigate|observe|extract` as a non-default
execution branch. The default command path still has no executor and therefore
blocks execution. Preview and dry-run surfaces stay unchanged, and real
Playwright/MCP/browser runtime work remains deferred to a later sandbox route.
