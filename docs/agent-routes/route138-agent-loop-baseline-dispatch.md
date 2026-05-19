# Route 138: Agent loop baseline repair and dispatch seam

## Goal

Restore the core agent-loop test baseline, then extract the first safe dispatch/reentry seam from `runMvpIntegratedFlow.ts`.

Route 137 extracted projection helpers and discovered a pre-existing red baseline:

- `runMvpIntegratedFlow.test.ts -t "covers prompt -> handoff -> tool approval -> streamed result"`
- still fails after stashing Route 137 changes
- therefore not caused by Route 137
- but it weakens future `runMvpIntegratedFlow.ts` refactor safety

Route 138 should treat that red test as a control-plane gate issue, fix or explicitly rebaseline it, and then continue modularization with a behavior-preserving dispatch seam extraction.

This route owns:

- reproduce and classify the pre-existing failing runMvp test
- fix stale test expectation or product behavior bug
- restore focused runMvp baseline confidence
- extract one safe agent-loop dispatch/reentry seam
- add characterization tests around the extracted seam
- update architecture/backlog notes

This is not a broad runMvp rewrite.

## Expected outcome

By the end of Route 138:

1. The failing streamed-result handoff/tool-approval test is no longer an unexplained red baseline.
2. The fix is classified as one of:
   - stale test expectation
   - product behavior drift
   - harness/setup drift
   - obsolete scenario
3. The relevant focused runMvp test passes or is replaced by an equivalent stronger gate.
4. One dispatch/reentry seam is extracted from `runMvpIntegratedFlow.ts` if safe.
5. Existing browser/edit/provider/session behavior remains unchanged.
6. Result contract and closeout gates still pass.
7. Route 139 can proceed with either deeper agent-loop extraction or SessionManager codec extraction.

## Required inputs

Read:

- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/run-mvp-ledger.md`
- `docs/architecture/agent-loop-projection-extraction.md`
- `docs/architecture/policy-result-boundary.md`
- `docs/architecture/session-manager-boundary.md`
- `docs/architecture/module-backlog.md`
- `docs/architecture/capability-contract.md`

Use Route 137 notes about the pre-existing red baseline as starting evidence.

## Reference scan

Use references only for agent-loop dispatch, tool approval, streamed result, and reentry patterns.

Primary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/OpenHands`

Secondary:

- `/home/wang/projects/mini-swe-agent`
- `/home/wang/projects/gemini-cli`
- `/home/wang/projects/inspect_ai`

Budget:

- ClaudeCode: max 8 files
- opencode: max 8 files
- OpenHands: max 6 files
- mini-swe-agent + gemini-cli + Inspect AI: max 8 files total

Focus:

- prompt -> tool approval -> tool result loop
- streamed result shaping
- tool dispatch context
- reentry / continue handoff
- event or transcript summaries
- test harness patterns for agent loop

Do not re-study browser runtime internals unless the failing test requires it.

## Files

Likely touched:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts`
- `packages/ts-shell/src/orchestration/flowResultProjection.ts`
- `packages/ts-shell/src/orchestration/flowEvidenceProjection.ts`

Likely new files:

- `packages/ts-shell/src/orchestration/flowDispatch.ts`
- `packages/ts-shell/src/orchestration/flowDispatch.test.ts`
- `docs/architecture/agent-loop-baseline-dispatch.md`

Optional, only if clearly needed:

- `packages/ts-shell/src/orchestration/flowApprovalReentry.ts`
- `packages/ts-shell/src/orchestration/flowApprovalReentry.test.ts`

Keep names short. Avoid creating a mini-framework.

## Implementation tasks

### 1. Reproduce and classify the red baseline

Run the failing focused test before changing behavior:

- `runMvpIntegratedFlow.test.ts -t "covers prompt -> handoff -> tool approval -> streamed result"`

Record:

- exact failure
- expected vs actual
- whether failure is stale test expectation, product drift, harness drift, or obsolete scenario
- why Route 137 is not the cause

Add this to `docs/architecture/agent-loop-baseline-dispatch.md`.

### 2. Repair or rebaseline the test

Fix the red baseline in the smallest correct way.

Allowed fixes:

- update stale expectation if current behavior is correct and validated elsewhere
- fix product drift if expected behavior is still required
- fix harness setup if the test no longer initializes required state
- replace obsolete test with equivalent stronger focused coverage

Not allowed:

- deleting the scenario without replacement
- weakening assertions just to pass
- hiding failures behind broad skip
- changing provider/browser/edit/session behavior accidentally

### 3. Identify dispatch/reentry seam

After baseline repair, identify one safe seam in `runMvpIntegratedFlow.ts`.

Preferred candidates:

- tool approval handoff decision
- tool dispatch input projection
- streamed result reentry summary
- post-tool observation normalization
- approval denied / stopped reentry projection
- continuation-ready dispatch summary

Choose one seam that:

- is mostly pure or near-pure
- has clear inputs/outputs
- can be tested independently
- does not reorder the agent loop

### 4. Extract dispatch helper

Add `flowDispatch.ts` or equivalent.

Possible helper responsibilities:

- build tool dispatch context
- classify dispatch reentry state
- normalize approval handoff state
- project streamed-result continuation state
- produce dispatch summary for transcript/result mapping

Rules:

- no behavior change
- no provider/model calls
- no permission semantics change
- no browser/edit feature change
- no session schema change
- no CLI behavior change

### 5. Add focused tests

Add `flowDispatch.test.ts`.

Cover:

- approved tool dispatch
- approval pending / denied
- streamed result reentry
- stopped dispatch result
- continuation-safe summary
- redaction of raw tool/browser/page content
- stable reason code / do-next where applicable

Keep tests deterministic and fake-provider based.

### 6. Re-run runMvp focused gate

Run:

- the repaired focused runMvp test
- any adjacent focused runMvp tests that cover handoff/tool approval/streamed result
- new dispatch tests

If the full `runMvpIntegratedFlow.test.ts` still has unrelated red tests, document them separately with exact names and do not broaden this route unless they block the touched seam.

### 7. Architecture and backlog update

Create `docs/architecture/agent-loop-baseline-dispatch.md`.

Include:

- red baseline classification
- repair decision
- extracted seam
- before/after responsibility
- remaining runMvp risks
- Route 139 recommendation

Update `docs/architecture/module-backlog.md` with Route 138 closeout and next route.

## Boundaries

Hard boundaries:

- no broad `runMvpIntegratedFlow.ts` rewrite
- no product behavior changes unless the failing test proves a real bug
- no provider/model live calls
- no browser feature expansion
- no edit/patch feature expansion
- no permission behavior changes
- no SessionManager schema changes
- no CLI UX changes
- no package dependency changes
- no commit or push

## Validation

Run:

- failing focused runMvp test after repair
- adjacent handoff/tool approval/streamed-result tests
- focused dispatch tests
- Route 137 projection tests
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`
- `rtk git status --short --branch`

Do not run broad unrelated suites.

## Final report

Include:

1. What changed
2. Red baseline classification
3. Test repair or rebaseline decision
4. Extracted dispatch/reentry seam
5. Behavior preservation evidence
6. Validation
7. Remaining risks
8. Route 139 recommendation
9. Proposed commit message

Do not commit or push.
