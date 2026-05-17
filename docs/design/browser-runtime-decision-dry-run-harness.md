# Browser Runtime Decision And Dry-Run Harness

Route 94 moves the Route 93 browser boundary from status/action preview into a
non-executing dry-run plan. It still does not run a browser.

## Reference Scan Summary

Reference budget used:

- Stagehand: 4 files
  - `packages/core/lib/v3/handlers/actHandler.ts`
  - `packages/core/lib/v3/handlers/observeHandler.ts`
  - `packages/core/lib/v3/handlers/extractHandler.ts`
  - `packages/core/lib/v3/cache/ActCache.ts`
- Playwright MCP: 4 files
  - `README.md`
  - `src/README.md`
  - `tests/capabilities.spec.ts`
  - `tests/core.spec.ts`
- OpenHands: 4 files
  - `frontend/src/components/features/browser/browser.tsx`
  - `frontend/src/components/features/browser/browser-snapshot.tsx`
  - `frontend/src/components/features/chat/event-content-helpers/get-action-content.ts`
  - `frontend/src/components/features/chat/event-message-components/mcp-event-message.tsx`
- Browser-use: not present at `/home/wang/projects/browser-use`.

Findings:

- Stagehand cleanly separates observation, action, and extraction paths and
  includes action-cache/replay concepts. That is useful for future planning,
  but the implementation path pulls in page snapshots, LLM inference, cache
  state, and deterministic action replay. Route 94 should borrow the
  separation, not the runtime.
- Playwright MCP exposes deterministic browser tools over structured
  accessibility snapshots. Its README explicitly frames CLI+Skills as more
  token-efficient for coding agents, while MCP is better when persistent state
  and rich introspection justify the context and lifecycle cost.
- OpenHands has a browser panel and browser action/status event surfaces. It is
  useful as evidence/status UX reference, but it assumes a runtime screenshot
  or browser event source that Route 94 must not add.

## Route 93 Baseline

The current browser capability is preview-only:

- `/browser` and `/browser status` render capability status.
- `/browser preview ...` renders readiness, risk, future evidence, and
  `Executed: no`.
- Browser status can appear in the sidebar Tools section.
- Browser command results can appear as sanitized sidebar activity.
- No browser process, MCP server, website navigation, screenshot, OCR,
  provider/model call, browser session persistence, or raw browser content is
  present.

## Runtime Decision Matrix

| Candidate | Strengths | Risks | Route 94 decision |
| --- | --- | --- | --- |
| Playwright CLI/Skills | Token-efficient command surface, deterministic actions, easy to sandbox as explicit commands, focused evidence logs. | Needs a later isolated runner and command allowlist. | Preferred first future runtime. |
| Playwright MCP | Rich tool list, accessibility snapshots, useful persistent browser context. | MCP lifecycle, schema/tool context cost, persistent-state risk. | Defer until CLI/Skills cannot cover the needed UX. |
| Stagehand-like abstraction | Strong observe/act/extract split, action cache and self-healing concepts. | LLM/model boundary, cache persistence, page snapshot complexity. | Use as design inspiration only; not first runtime. |
| Custom Playwright wrapper | Maximum control over sandbox/evidence contracts. | Easy to invent policy before proving product need. | Defer until CLI/Skills prototype exposes gaps. |

Preferred first runtime direction: **Playwright CLI/Skills non-default
execution prototype**.

Reasoning:

- It keeps browser execution outside model context unless explicitly invoked.
- It can be wrapped by existing command permission/dry-run discipline.
- It avoids MCP server launch/discovery and persistent browser state as a
  default.
- It gives deterministic command/evidence surfaces before any higher-level
  Stagehand-like planning is added.

## Dry-Run Harness Model

Route 94 adds these pure TypeScript models:

- `browserRuntimeDecision.ts`: chooses the future backend candidate without
  launching anything.
- `browserSandboxPolicy.ts`: classifies requirements such as network,
  external-site, authentication, payment, file transfer, screenshot, and
  persistent-session.
- `browserDryRunPlan.ts`: records the non-executing plan, expected evidence,
  confirmations, blocked risks, and `executed: false`.
- `browserDryRunHarness.ts`: composes action readiness, runtime decision,
  sandbox policy, and dry-run plan.
- `browserDryRunSurface.ts`: renders concise user-facing dry-run output.

The harness must prove:

- the action contract is parseable and sanitized
- unsupported or ambiguous actions remain blocked
- the selected runtime is only a recommendation
- sandbox requirements and confirmations are explicit
- future evidence is named without embedding raw page content
- output always says `Executed: no`
- no browser, MCP, network, provider/model, or persistence side effect occurs

## Browser Sandbox Policy

Dry-run is allowed for safe previewable actions because it only renders a plan.
Real execution remains unavailable.

Policy:

- `navigate`: dry-run can plan it, but external network and third-party data
  are `future-sandbox-required`.
- `extract`: dry-run can plan it with future accessibility snapshot and
  structured result summaries.
- `click` and `type`: dry-run can plan them, but they are state-changing and
  require future confirmation before execution.
- `auth`, `payment`, and `destructive`: blocked.
- `upload` and `download`: blocked until a dedicated file-transfer sandbox
  route owns them.
- `screenshot`: future-sandbox-required; Route 94 may mention a screenshot
  reference only as future evidence.
- browser session persistence: blocked.

Required future sandbox constraints:

- isolated browser profile and temporary home
- explicit network policy and target allowlist
- no credential entry by default
- no persistent session unless a route explicitly owns it
- bounded artifact directory with redaction checks
- explicit user confirmation for state-changing actions
- evidence contracts that summarize content instead of exposing raw page blobs

## Future Evidence Model

Real execution should eventually produce:

- navigation target
- accessibility snapshot summary
- selected element evidence
- extraction schema/result summary
- action trace
- screenshot reference only if a future screenshot policy enables it
- command/runtime logs

Evidence must remain compact and redacted. It must not include raw browser
content, secrets, provider credentials, hidden reasoning, or raw content blobs.

## Unsupported Action Policy

Actions remaining blocked even in dry-run:

- authentication and credential entry
- payment
- destructive action
- file upload
- file download
- browser session persistence
- ambiguous targets

Screenshot remains future-sandbox-required rather than executable. It can be
named as a future evidence reference, but Route 94 must not capture or render a
screenshot.

## Sidebar Integration Model

`/browser dry-run ...` emits through the existing local command event adapter.
The adapter renders only allowlisted, sanitized result lines such as outcome,
requested action, runtime recommendation, sandbox decision, blocked risks, and
`Executed: no`.

No sidebar schema, live store persistence, dynamic discovery, provider/model
call, or raw command-output rendering is added.

## No-Execution Boundary

Route 94 does not:

- launch Playwright
- launch or discover MCP servers
- navigate websites
- call network
- create or persist a browser session
- capture screenshots, OCR, or browser snapshots
- call providers or models
- change package scripts, default gates, SessionManager schema, edit runtime,
  recovery, rollback, memory persistence, or startup/model injection
- render raw browser content, secrets, provider credentials, hidden reasoning,
  or raw content blobs

## Route 95 Scenario Harness Note

Route 95 adds an Agent Scenario Harness foundation and includes a browser
dry-run visibility scenario. That scenario runs `/browser dry-run ...`, renders
`/sidebar`, asserts `Executed: no`, and confirms no browser execution claim is
reported.

The next browser execution route should still own:

- explicit opt-in browser execution command shape
- isolated browser sandbox contract
- network/target allowlist
- user confirmation boundary for state-changing actions
- evidence artifact format
- no default browser execution and no startup auto-load

Alternatives:

- Playwright MCP adapter prototype if persistent browser context becomes more
  important than token efficiency.
- Browser sandbox executor contract if execution policy needs another
  contract-only route before any runtime.
- Stagehand-like action cache design if observe/cache/replay semantics should
  be modeled before execution.
