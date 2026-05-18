# Route 130: Browser transaction eval gate

## Goal

Close out controlled browser transactions as a trustworthy agent capability.

Route 129 added same-page browser transactions:

- observe -> extract
- observe -> click -> extract
- observe -> type -> extract
- deterministic planner
- one-step repair
- transaction evidence
- transcript and /continue support

Route 130 should make this capability auditable and regression-safe.

This route owns:

- transaction trace schema
- compact transaction report surface
- deterministic golden eval cases
- planner/repair scoring
- failure taxonomy closeout
- replay/continue from transaction trace
- browser transaction regression gate
- terminal result improvements for transaction outcomes

This is a closeout/gating route, not a new autonomy route.

## Expected outcome

By the end of Route 130:

1. Every browser transaction can produce a compact trace.
2. The trace can explain plan, steps, repair, result, cleanup, and redaction.
3. Controlled transaction evals produce stable pass/fail/skip results.
4. Planner and repair decisions are scored deterministically.
5. Terminal results show useful browser transaction summaries.
6. /continue can reason from trace summaries without raw DOM.
7. Regression tests catch planner/repair/evidence/report drift.
8. Browser transaction capability is ready for a closeout verification command or route-gate script.
9. No public browsing or broader autonomy is introduced.

## Reference scan

Use references only for trace, eval, scoring, and reporting patterns.

Primary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`
- `/home/wang/projects/stagehand`
- `/home/wang/projects/OpenHands`

Secondary:

- `/home/wang/projects/playwright-mcp`
- `/home/wang/projects/opencode`
- `/home/wang/projects/source-claudecode`

Budget:

- Inspect AI + mini-swe-agent: max 10 files total
- Stagehand: max 8 files
- OpenHands: max 8 files
- Playwright MCP: max 6 files
- opencode + ClaudeCode: max 6 files total

Focus:

- eval result shape
- trajectory / trace reports
- pass/fail/skip semantics
- planner scoring
- repair evidence
- replayable failure summaries
- terminal/user-facing result summaries

Do not re-study Playwright runtime internals unless a trace/eval bug requires it.

## Files

Keep names short.

Likely new or changed files:

- `packages/ts-shell/src/core/context/browserTrace.ts`
- `packages/ts-shell/src/core/context/browserTxnReport.ts`
- `packages/ts-shell/src/core/context/browserScore.ts`
- `packages/ts-shell/src/core/harness/browserTxnEval.ts`
- `packages/ts-shell/src/core/harness/browserTxnGolden.ts`
- `packages/ts-shell/src/core/harness/browserTxnGate.test.ts`
- `packages/ts-shell/src/core/harness/browserTrace.test.ts`
- `packages/ts-shell/src/core/harness/browserScore.test.ts`
- `docs/design/browser-eval-gate.md`

Likely existing integrations:

- `browserTxn.ts`
- `browserPlan.ts`
- `browserRepair.ts`
- `browserTxnEvidence.ts`
- `browserAgent.ts`
- result mapper
- transcript / continue files
- browser command/status/report surfaces
- existing closeout verification scripts if clean

Avoid long route-specific filenames.

## Implementation tasks

### 1. Short design doc

Create `docs/design/browser-eval-gate.md`.

Include:

- Route 129 carried-forward state
- transaction trace shape
- eval/golden strategy
- planner and repair scoring
- report surface
- continue/replay behavior
- route-gate status
- Route 131 recommendation

Keep it short.

### 2. Transaction trace

Add `browserTrace.ts`.

Trace should capture:

- trace id
- transaction id
- controlled target
- plan summary
- step list
- observation summaries
- action summaries
- repair attempt, if any
- final result
- reason code
- cleanup status
- redaction status
- timing/budget summary

Trace must not capture:

- raw DOM
- cookies/session/storage
- hidden values
- typed secret values
- screenshots/OCR
- page dumps

### 3. Transaction report

Add `browserTxnReport.ts`.

Report should render:

- operation sequence
- target summary
- planner decision
- repair status
- final browser-visible result
- failure reason and do-next
- cleanup status
- redaction status
- evidence/trace id

Use this report in terminal/result surfaces where browser transactions currently look too generic.

### 4. Planner and repair scoring

Add `browserScore.ts`.

Score:

- planner confidence correctness
- action target match
- repair necessity
- repair success/failure
- no unsafe action attempted
- final extraction correctness
- cleanup completed
- redaction passed

Use simple deterministic scoring:

- `pass`
- `fail`
- `skip`
- `warn`

Do not add model-based judgment.

### 5. Golden eval cases

Add `browserTxnGolden.ts`.

Golden cases should include:

- observe -> extract rendered text
- observe -> click -> extract changed status
- observe -> type -> extract changed status
- target missing -> repair succeeds
- target missing -> repair fails
- low confidence -> stopped before action
- policy blocked -> stopped before adapter
- timeout -> cleanup confirmed
- secret/hidden/raw DOM redaction
- runtime unavailable -> skipped/unavailable

### 6. Eval runner

Add `browserTxnEval.ts`.

Eval output should include:

- case id
- mode: real / injected / skipped
- outcome: pass / fail / skip / warn
- score details
- trace id
- reason code
- cleanup status
- redaction status
- compact report

Run real browser cases when runtime is ready. Use injected mode only for deterministic edge cases or unavailable paths.

### 7. Replay and /continue from trace

Strengthen continuation behavior so `/continue` can use transaction trace summaries.

Required behavior:

- summarize successful transaction
- explain repaired transaction
- explain failed repair
- explain policy block
- explain timeout and cleanup
- avoid raw DOM/secrets

Trace summaries should be enough; `/continue` should not need page state.

### 8. Result mapper / terminal surface

Improve result mapping for browser transactions.

Terminal output should distinguish:

- transaction success
- planner stopped
- policy blocked
- runtime unavailable
- target missing
- repair succeeded
- repair failed
- timeout
- cleanup failed
- redaction failed

Keep output concise.

### 9. Gate test

Add `browserTxnGate.test.ts`.

Gate should fail on:

- missing trace id
- missing cleanup evidence
- raw DOM leak
- typed value leak
- missing reason code on failure
- action without policy decision
- repair without evidence
- transaction success without final extraction summary
- eval case without pass/fail/skip outcome

### 10. Roadmap note

Update `docs/design/edit-capability-roadmap.md` with a short Route 130 note.

Mention:

- trace/report closeout
- eval/golden gate status
- planner/repair scoring
- real browser eval status
- Route 131 recommendation

## Boundaries

Hard boundaries:

- no provider/model calls
- no public web automation
- no login/auth/cookie/session persistence
- no downloads/uploads/payment/destructive actions
- no raw DOM/secrets in output/transcript/cache/report/trace
- no screenshots/OCR by default
- no MCP live backend
- no cross-session browser page persistence
- no broader autonomous planner

## Validation

Run:

- focused trace/report tests
- focused planner/repair scoring tests
- focused transaction eval/golden tests
- focused gate tests
- existing browser transaction tests
- existing browser agent-loop tests
- existing real local browser tests
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`
- `rtk git status --short --branch`

If clean and cheap, add or update a focused browser transaction gate command. Do not add broad unrelated scripts.

## Final report

Include:

1. What changed
2. Trace schema behavior
3. Report surface behavior
4. Golden eval coverage
5. Planner/repair scoring
6. Replay and /continue behavior
7. Gate behavior
8. Real browser validation
9. Validation
10. Remaining risks
11. Route 131 recommendation
12. Proposed commit message

Do not commit or push.
