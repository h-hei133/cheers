# Route 129: Browser transaction loop

## Goal

Add same-page browser transactions and controlled planning/repair on top of the Route 128 browser agent-loop integration.

Route 128 connected Direct Playwright browser tools to the agent loop:

- browser.observe / extract / click / type are registered tools
- runtime status drives availability
- policy gate runs before adapter calls
- browser observations enter query loop
- transcript and /continue understand browser evidence
- controlled autonomous browser use works

Remaining gap:

- click/type flows do not yet preserve the same page inside one transaction
- controlled autonomous path is observe -> click, observe -> type, observe -> extract, not observe -> action -> extract on the same live page

Route 129 should close that gap.

This route owns:

- single-transaction browser session lifecycle
- same-page observe -> click/type -> extract
- controlled mini-planner for local/approved browser tasks
- one-step selector/target repair
- transaction evidence and transcript summary
- agent-loop eval proving multi-step browser use
- failure recovery for target missing, action timeout, stale page, cleanup failure

This is not public browsing and not long-lived browser memory.

## Expected outcome

By the end of Route 129:

1. The agent can run a same-page browser transaction on controlled/local targets.
2. A transaction can perform observe -> click -> extract on the same page.
3. A transaction can perform observe -> type -> extract on the same page.
4. The agent can choose a safe next browser action from an observation for controlled tasks.
5. Missing target can trigger one bounded repair attempt.
6. Transaction results produce concise evidence and terminal summaries.
7. Transcript and /continue preserve transaction summary without raw DOM/secrets.
8. Failures map to actionable stopped/failed results with cleanup evidence.
9. Real browser transaction tests pass when runtime is ready.
10. No browser state persists across sessions or unrelated turns.

## Reference scan

Use references only for transaction/planning/repair patterns.

Primary:

- `/home/wang/projects/stagehand`
- `/home/wang/projects/playwright-mcp`
- `/home/wang/projects/OpenHands`

Secondary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`
- `/home/wang/projects/opencode`
- `/home/wang/projects/source-claudecode`

Budget:

- Stagehand: max 12 files
- Playwright MCP: max 8 files
- OpenHands: max 8 files
- Inspect AI + mini-swe-agent: max 8 files total
- opencode + ClaudeCode: max 8 files total

Focus:

- Stagehand: observe/act/extract layering, action candidate confidence, repair boundary
- Playwright MCP: action tool sequencing and snapshot/action result contracts
- OpenHands: browser action observation and agent event loop integration
- Inspect AI: multi-step tool eval and scorer/report shape
- mini-swe-agent: concise trajectory and replayable failure reporting
- opencode/ClaudeCode: tool observation and continuation transcript patterns

Do not re-study low-level Playwright setup unless a real transaction bug requires it.

## Files

Keep names short.

Likely new or changed files:

- `packages/ts-shell/src/core/context/browserTxn.ts`
- `packages/ts-shell/src/core/context/browserPlan.ts`
- `packages/ts-shell/src/core/context/browserRepair.ts`
- `packages/ts-shell/src/core/context/browserTxnEvidence.ts`
- `packages/ts-shell/src/core/harness/browserTxnFixtures.ts`
- `packages/ts-shell/src/core/harness/browserTxn.test.ts`
- `packages/ts-shell/src/core/harness/browserTxnAgent.test.ts`
- `packages/ts-shell/src/core/harness/browserTxnContinue.test.ts`
- `docs/design/browser-transaction.md`

Likely existing integrations:

- `browserTool.ts`
- `browserObs.ts`
- `browserAgent.ts`
- `browserToolPolicy.ts`
- `pwAdapter.ts`
- `pwEvidence.ts`
- `pwReport.ts`
- query loop / result mapper / transcript / continue files touched in Route 128

Avoid route-specific long filenames.

## Implementation tasks

### 1. Short design doc

Create `docs/design/browser-transaction.md`.

Include:

- Route 128 carried-forward state
- same-page transaction lifecycle
- planner boundary
- repair boundary
- evidence shape
- transcript and /continue behavior
- validation result
- Route 130 recommendation

Keep it short.

### 2. Transaction lifecycle

Add `browserTxn.ts`.

A browser transaction is:

- single controlled target
- single runtime availability decision
- single policy decision
- one temporary browser/page lifecycle
- multiple operations on the same page
- mandatory cleanup
- no cross-session persistence

Supported transaction steps:

- observe
- extract
- click
- type
- re-observe
- post-action extract

Supported transaction plans:

- observe -> extract
- observe -> click -> extract
- observe -> type -> extract
- observe -> click -> re-observe -> extract
- observe -> type -> re-observe -> extract

Do not keep the page alive beyond the transaction.

### 3. Controlled planner

Add `browserPlan.ts`.

The planner should be deterministic and rule-based for now.

It should infer safe plans for controlled/local prompts such as:

- tell me the rendered text
- click the status button and report the new state
- type this safe note and confirm it changed
- extract the visible status after clicking
- inspect the local fixture then summarize

Planner output should include:

- operation sequence
- target summary
- required policy level
- reason
- confidence: high / medium / low
- whether repair is allowed

Low confidence should not execute risky actions.

No model/provider calls.

### 4. One-step repair

Add `browserRepair.ts`.

Repair is allowed only inside controlled/local transactions.

Repair examples:

- selector not found -> try role/name candidate from observation
- text target mismatch -> try normalized text
- button target missing -> try known fixture role/button summary
- stale observation -> re-observe once

Repair limits:

- max one repair attempt per action
- no public web
- no arbitrary JavaScript from user/model
- no blind clicking
- no destructive actions
- repair evidence must be recorded

### 5. Transaction evidence

Add `browserTxnEvidence.ts`.

Evidence should include:

- transaction id
- controlled target
- step summaries
- planner decision
- repair attempt if any
- final observation summary
- reason codes
- cleanup status
- redaction status
- duration budget

Do not include:

- raw DOM
- cookies/session/storage
- hidden input values
- typed secret values
- screenshots/OCR by default
- page dumps

### 6. Agent-loop integration

Wire transaction execution into the Route 128 browser agent path.

Required behavior:

- controlled prompt can produce a transaction plan
- transaction runs through availability and policy gates
- observation/action/extract stay on the same page during the transaction
- final transaction result returns into query loop
- terminal result summarizes the transaction
- stopped/failed result includes reason and do-next

Do not replace simple browser tools. Transactions are the multi-step path.

### 7. Result mapping

Map transaction outcomes:

- transaction success
- transaction unavailable
- transaction policy blocked
- planner low confidence
- target missing
- repair attempted and succeeded
- repair attempted and failed
- action timeout
- extract failed
- cleanup failed
- adapter invalid result

Use existing browser reason codes where possible.

### 8. Transcript and /continue

Transcript should store transaction summaries.

Preserve:

- transaction id
- target
- plan summary
- step summaries
- final summary
- reason code
- repair status
- cleanup status
- evidence id

Do not preserve raw page content beyond budgeted summaries.

`/continue` should be able to:

- summarize prior transaction
- explain repair attempt
- explain failure and do-next
- continue after stopped transaction
- avoid needing raw DOM

### 9. Fixtures

Add `browserTxnFixtures.ts`.

Fixtures should include:

- rendered text fixture
- click changes status fixture
- type changes status fixture
- extract after action fixture
- selector repair fixture
- stale/reobserve fixture
- target missing fixture
- timeout fixture
- secret/redaction fixture

Use local/controlled pages only.

### 10. Tests

Add `browserTxn.test.ts`.

Required runtime-level scenarios:

1. observe -> extract same page
2. observe -> click -> extract same page
3. observe -> type -> extract same page
4. click target missing -> one repair succeeds
5. click target missing -> repair fails cleanly
6. stale observation -> re-observe once
7. timeout -> cleanup evidence
8. typed secret/raw DOM/hidden value not emitted
9. transaction cleanup after success
10. transaction cleanup after failure

Add `browserTxnAgent.test.ts`.

Required agent-loop scenarios:

1. prompt triggers observe -> extract transaction
2. prompt triggers observe -> click -> extract transaction
3. prompt triggers observe -> type -> extract transaction
4. low confidence plan stops before action
5. policy blocked stops before adapter call
6. repair success is summarized in final result
7. repair failure is actionable
8. transaction observation drives final answer
9. terminal output explains what happened
10. runtime unavailable does not fake execution

Add `browserTxnContinue.test.ts`.

Required continuation scenarios:

1. /continue summarizes successful transaction
2. /continue summarizes repaired transaction
3. /continue explains failed repair
4. /continue explains timeout with cleanup
5. /continue contains no raw DOM/secrets

Use real browser path when runtime is ready. Use injected fallback only for unavailable/edge failure cases.

### 11. Roadmap note

Update `docs/design/edit-capability-roadmap.md` with a short Route 129 note.

Mention:

- same-page transaction result
- controlled planner status
- repair status
- real browser transaction validation status
- Route 130 recommendation

## Boundaries

Hard boundaries:

- no provider/model calls
- no public web automation
- no login/auth/cookie/session persistence
- no downloads/uploads/payment/destructive actions
- no raw DOM/secrets in output/transcript/cache/report
- no screenshots/OCR by default
- no MCP live backend
- no cross-session browser page persistence
- no broad Stagehand-style autonomous planner yet

Route 129 may add a small deterministic planner and one-step repair only for controlled/local transactions.

## Validation

Run:

- focused transaction runtime tests
- focused transaction agent-loop tests
- focused continue/replay tests
- focused browser tool/policy tests if touched
- existing real local browser tests
- existing Route 128 browser agent-loop tests
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`
- `rtk git status --short --branch`

Do not run broad unrelated tests.

## Final report

Include:

1. What changed
2. Transaction lifecycle behavior
3. Controlled planner behavior
4. Repair behavior
5. Real browser transaction validation
6. Agent-loop transaction scenarios
7. Transcript and /continue behavior
8. Redaction guarantees
9. Validation
10. Remaining risks
11. Route 130 recommendation
12. Proposed commit message

Do not commit or push.
