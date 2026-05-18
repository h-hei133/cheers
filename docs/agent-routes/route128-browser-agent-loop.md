# Route 128: Browser agent loop

## Goal

Connect the real Direct Playwright browser runtime into the agent loop.

Route 127 proved the browser runtime is real:

- `playwright-core` exists
- Chromium binary is installed
- runtime status is `ready`
- executable source is `playwright-cache`
- real local fixture tests pass
- browser eval/report/failure taxonomy/status are stable

Route 128 should stop treating browser as only a command/harness capability and make it an agent-usable tool.

This route owns:

- browser tool registration
- browser tool availability from runtime status
- policy/permission gate before browser calls
- agent-visible tool schema for observe/extract/click/type
- browser observation returning into the query loop
- result mapper support for browser success/stopped/failed
- transcript/session summary for browser actions
- `/continue` understanding previous browser evidence
- controlled autonomous browser use on local/approved tasks
- agent-loop eval proving prompt -> browser tool -> observation -> final result

This is an agent-loop integration route, not a public browsing route.

## Expected outcome

By the end of Route 128:

1. The agent can see browser tools when runtime status allows them.
2. The agent can safely call browser observe/extract/click/type on controlled local targets.
3. Browser policy blocks happen before runtime calls.
4. Browser observations enter the reasoning/query loop as summarized observations.
5. Terminal results explain what the browser did, what failed, and what to do next.
6. Session transcript records browser action summaries without raw DOM/secrets.
7. `/continue` can reference prior browser action evidence.
8. Controlled tasks can trigger browser use without requiring a `/browser` command.
9. Real-browser agent-loop tests run when runtime is ready.
10. Runtime unavailable/disabled paths are explicit and do not fake execution.

## Reference scan

Use references only for agent-loop/tool integration decisions.

Primary:

- `/home/wang/projects/OpenHands`
- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/playwright-mcp`

Secondary:

- `/home/wang/projects/stagehand`
- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`
- `/home/wang/projects/gemini-cli`

Budget:

- OpenHands: max 10 files
- ClaudeCode + opencode: max 12 files total
- Playwright MCP: max 8 files
- Stagehand: max 6 files
- Inspect AI + mini-swe-agent + gemini-cli: max 8 files total

Focus:

- tool registry / tool schemas
- tool availability and disabled tools
- action -> observation event shape
- browser observation entering agent reasoning
- transcript / trajectory summaries
- result mapping for tool failures
- eval cases for tool-using agents
- continuation/replay evidence

Do not re-study Playwright runtime internals unless an adapter bug blocks the route.

## Files

Prefer short names and existing integration points.

Likely new or changed files:

- `packages/ts-shell/src/core/context/browserTool.ts`
- `packages/ts-shell/src/core/context/browserToolPolicy.ts`
- `packages/ts-shell/src/core/context/browserObs.ts`
- `packages/ts-shell/src/core/context/browserAgent.ts`
- `packages/ts-shell/src/core/context/browserLoopReport.ts`
- `packages/ts-shell/src/core/harness/browserAgentFixtures.ts`
- `packages/ts-shell/src/core/harness/browserAgentLoop.test.ts`
- `packages/ts-shell/src/core/harness/browserContinue.test.ts`
- `docs/design/browser-agent-loop.md`

Likely existing files to inspect and touch as needed:

- agent/tool registry files
- query loop files
- result mapper files
- session transcript/runtime files
- `/continue` replay/evidence files
- browser runtime files from Routes 126-127

Avoid long route-specific filenames.

## Implementation tasks

### 1. Short design doc

Create `docs/design/browser-agent-loop.md`.

Include:

- Route 127 runtime readiness carried forward
- browser tool contract
- availability model
- policy gate model
- observation shape
- result mapping
- transcript and continue behavior
- controlled autonomous-use boundary
- validation result
- Route 129 recommendation

Keep it short and implementation-facing.

### 2. Find the existing agent tool path

Audit the current code path for:

- tool registry
- tool schema declaration
- tool availability checks
- tool execution dispatch
- observation events
- result mapping
- transcript/session summaries
- `/continue` replay/evidence

Use existing patterns. Do not invent a second tool system.

### 3. Register browser tools

Add browser tools to the existing registry.

Minimum operations:

- `browser.observe`
- `browser.extract`
- `browser.click`
- `browser.type`

Each tool schema should expose only controlled parameters:

- target/page fixture or approved local URL marker
- selector/role/text target where applicable
- extraction kind
- input value classification, not raw secret material
- timeout/budget

Tool metadata should include:

- requires browser runtime
- requires browser policy approval
- local/controlled-only by default
- no public web by default
- no auth/session persistence

### 4. Availability gate

Browser tool availability must come from runtime status.

Cases:

- `ready` -> available for controlled/local tasks
- `binary-missing` -> unavailable with setup hint
- `package-missing` -> unavailable with dependency hint
- `disabled` -> unavailable with disabled reason
- `failed` -> unavailable with failure reason

The agent must not pretend browser execution happened when unavailable.

### 5. Policy gate before runtime call

Add `browserToolPolicy.ts` or equivalent.

Policy must run before `pwAdapter`.

Allow:

- controlled local fixtures
- explicit approved local/test targets
- safe observe/extract
- safe click/type in controlled fixtures

Block:

- public web by default
- login/auth/cookie/session persistence
- download/upload/payment/destructive flows
- unknown external targets
- raw secret typing

Blocked browser calls should map to actionable stopped results, not vague errors.

### 6. Browser observation model

Add `browserObs.ts` or equivalent.

Browser observations returned to the agent should include:

- operation
- controlled target summary
- visible text summary
- action result summary
- reason code
- cleanup status
- redaction status
- evidence id
- next possible actions when safe

Do not include:

- raw DOM
- cookies/session/storage
- hidden values
- typed secret values
- screenshots by default
- page dumps

### 7. Query-loop integration

Wire browser tool execution into the query loop.

Required behavior:

- prompt can lead to browser tool selection for controlled/local tasks
- browser tool call executes through availability + policy + runtime
- observation returns into the same reasoning path as other tools
- agent can perform observe -> click/type/extract -> final result
- failure observations can lead to stopped/final result with do-next

This route should prove the browser is part of the agent loop, not just a command.

### 8. Controlled autonomous use

Add controlled auto-selection tests.

Examples:

- "Open the local fixture and tell me the rendered text"
- "Use the local browser fixture, click the status button, and report the new state"
- "Type this safe note into the local fixture and confirm the state changed"

The agent should choose browser tools without requiring the user to type `/browser`.

Keep this limited to local/controlled tasks.

### 9. Result mapper integration

Result mapping should distinguish:

- browser success
- browser policy blocked
- browser unavailable
- browser timeout
- browser target missing
- browser adapter failure
- browser cleanup failure

Use Route 127 reason codes where possible.

Terminal output should say:

- what browser operation was attempted
- what happened
- whether cleanup succeeded
- what the user or agent can do next

### 10. Transcript and `/continue`

Browser action summary should enter session transcript.

Transcript summary should preserve:

- operation
- controlled target
- summarized observation
- reason code
- evidence id
- cleanup status

Transcript summary must not preserve raw DOM/secrets.

`/continue` should be able to:

- reference prior browser observation summary
- explain prior browser failure/status
- continue from browser stopped result when actionable
- avoid needing raw DOM to proceed

### 11. Agent-loop eval

Add `browserAgentLoop.test.ts`.

Required scenarios:

1. browser unavailable -> agent reports unavailable and does not fake execution
2. ready runtime -> agent observes controlled local fixture
3. ready runtime -> agent observes then clicks controlled fixture
4. ready runtime -> agent observes then types safe value
5. policy blocked -> stopped with reason/do-next
6. target missing -> recoverable browser observation
7. timeout -> stopped/failed with cleanup evidence
8. browser observation enters final answer
9. raw DOM/secrets absent from transcript/output
10. runtime status participates in tool availability

Use real browser path when runtime is ready. Use injected fallback only for unavailable/edge cases that need deterministic coverage.

### 12. Continue/replay tests

Add `browserContinue.test.ts`.

Required scenarios:

1. `/continue` can summarize prior browser observe
2. `/continue` can explain prior browser click/type result
3. `/continue` can continue after browser policy blocked
4. `/continue` can continue after browser unavailable
5. replay/transcript does not contain raw DOM/secrets

### 13. Roadmap note

Update `docs/design/edit-capability-roadmap.md` with a short Route 128 note.

Mention:

- browser tool agent-loop integration result
- controlled autonomous-use status
- real browser agent-loop validation status
- continue/transcript status
- Route 129 recommendation

## Boundaries

Hard boundaries:

- no provider/model calls unless the existing tests already use a fake/model stub
- no public web automation
- no login/auth/cookie/session persistence
- no downloads/uploads/payment/destructive browser actions
- no raw DOM/secrets in output/transcript/cache/report
- no screenshots/OCR by default
- no MCP live backend
- no Stagehand planner yet

Do not add broad browser autonomy. This route connects the tool pipeline.

## Validation

Run:

- focused browser tool registry tests
- focused query-loop/tool execution tests
- focused browser agent-loop tests
- focused continue/replay tests
- focused result mapper/session transcript tests if touched
- existing real browser local fixture tests
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`
- `rtk git status --short --branch`

Do not run broad unrelated tests.

## Final report

Include:

1. What changed
2. Tool registry / availability integration
3. Policy gate behavior
4. Agent-loop browser scenarios covered
5. Real browser validation result
6. Result mapper behavior
7. Transcript and `/continue` behavior
8. Redaction guarantees
9. Validation
10. Remaining risks
11. Route 129 recommendation
12. Proposed commit message

Do not commit or push.
