# Route 141: Verification planner cleanup

## Goal

Repair the Route 139/140 verification failure cluster and extract a clear verification planner seam from the agent loop.

Route 140 reduced full `runMvpIntegratedFlow.test.ts` from:

- 101 passed / 50 failed

to:

- 111 passed / 40 failed

The next largest user-path cluster is verification behavior:

- verify command selection
- auto-verify decision
- retry planning
- skipped vs not-requested semantics
- verification result mapping
- stale tests around verification notes/transcripts
- command success incorrectly mixed with mutation/edit verification

Route 141 should fix this cluster as one coherent capability lifecycle slice.

## Expected outcome

By the end of Route 141:

1. Verification planning has a small explicit seam.
2. Verify selection is deterministic and testable.
3. Explicit verify commands remain recognized.
4. Auto-verify runs only when current contract says it should.
5. Retry behavior has stable reason codes.
6. `skipped`, `not-requested`, `unavailable`, `failed`, and `passed` are not conflated.
7. Verification result mapping no longer misclassifies non-mutation command success.
8. Stale verification tests are rebaselined or replaced with current-contract assertions.
9. Full `runMvpIntegratedFlow.test.ts` failure count decreases or remaining verification failures are precisely classified.
10. Closeout/result-contract/build gates still pass.

## Required inputs

Read:

- `docs/architecture/control-plane-baseline.md`
- `docs/architecture/read-inspect-intent-cleanup.md`
- `docs/architecture/agent-loop-baseline-dispatch.md`
- `docs/architecture/policy-result-boundary.md`
- `docs/architecture/run-mvp-ledger.md`
- `docs/architecture/capability-contract.md`
- `docs/architecture/module-backlog.md`

Use Route 140's remaining failure manifest as the starting point.

## Reference scan

Use references only for verification/planning/result semantics.

Primary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/opencode`
- `/home/wang/projects/source-claudecode`

Secondary:

- `/home/wang/projects/mini-swe-agent`
- `/home/wang/projects/gemini-cli`
- `/home/wang/projects/OpenHands`

Budget:

- Inspect AI: max 8 files
- opencode: max 8 files
- ClaudeCode: max 6 files
- mini-swe-agent + gemini-cli + OpenHands: max 8 files total

Focus:

- task/scorer/result states
- verification command selection
- retry and failure reason reporting
- skipped vs unavailable semantics
- tool result mapping
- terminal verification summaries
- test harness verification gates

Do not study browser runtime internals unless a verification test directly touches browser.

## Files

Likely touched:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts`
- `packages/ts-shell/src/orchestration/flowResultProjection.ts`
- `packages/ts-shell/src/orchestration/flowEvidenceProjection.ts`
- `packages/ts-shell/src/orchestration/flowDispatch.ts`
- existing verification-related helper files if present
- result mapper tests if verification mapping is asserted there

Likely new files:

- `packages/ts-shell/src/orchestration/verificationPlanner.ts`
- `packages/ts-shell/src/orchestration/verificationResultProjection.ts`
- `packages/ts-shell/src/orchestration/verificationPlanner.test.ts`
- `docs/architecture/verification-planner-cleanup.md`

Avoid creating a large verification framework.

## Implementation tasks

### 1. Cluster remaining verification failures

From `docs/architecture/control-plane-baseline.md`, extract failures related to:

- verify selection
- explicit verify command
- auto verification
- retry verification
- skipped verification
- not-requested verification
- verification note/transcript drift
- verification result mapping
- verification after edit/patch
- verification after command/no-write tasks

Create `docs/architecture/verification-planner-cleanup.md`.

Record:

- starting full runMvp count: 111 passed / 40 failed
- targeted test names
- classification for each:
  - product drift
  - stale test
  - harness drift
  - obsolete scenario
  - defer
- fix/rebaseline/defer decision

### 2. Define verification contract

Define current intended semantics.

Suggested contract:

- `passed`: verification command ran and succeeded
- `failed`: verification command ran and failed
- `skipped`: verification was selected but could not or should not run for a documented reason
- `not-requested`: no verification was selected or required
- `unavailable`: verification capability or command is unavailable
- `blocked`: verification was blocked by policy/allowlist
- `retry-planned`: previous verification failed and current contract allows retry planning
- `retry-not-planned`: retry is not allowed or not applicable

Clarify how these map to:

- terminal output
- result contract
- transcript/continue evidence
- closeout verifier expectations

### 3. Extract verification planner seam

Add `verificationPlanner.ts`.

It should decide:

- whether verification is requested
- whether auto-verify applies
- which command is selected
- whether command is allowlisted
- whether retry is planned
- why verification is skipped/not-requested/unavailable/blocked

Inputs should be explicit and testable.

Do not run commands inside the planner.

### 4. Extract verification result projection

Add `verificationResultProjection.ts`.

It should project:

- verification passed
- verification failed
- verification skipped
- verification not-requested
- verification unavailable
- verification blocked
- retry planned/not planned
- command output summary
- transcript-safe verification evidence

Rules:

- no raw long stdout dumps
- preserve existing externally asserted markers where required
- no mutation/edit failure conflation for non-mutation commands

### 5. Repair product drift

Fix high-confidence verification bugs.

Good candidates:

- explicit verify command not recognized
- auto-verify running when no mutation happened
- no-write command success marked failed due to missing mutation verification
- skipped and not-requested conflated
- retry note emitted when retry is not applicable
- verification failure mapped to vague error without reason/do-next

Bad candidates:

- broad command allowlist expansion
- new provider/browser/edit capability
- session schema change
- CLI redesign
- unrelated continuation/rebase failures

### 6. Rebaseline stale verification tests

For stale tests in this cluster:

- update expected verification status
- update expected note text
- update expected transcript marker
- replace obsolete scenario with current-contract scenario

Do not weaken tests; make assertions more precise.

### 7. Add focused tests

Add `verificationPlanner.test.ts`.

Required coverage:

- explicit verify selected
- auto-verify selected after mutation when expected
- auto-verify not requested for no-write read/inspect
- command success maps to passed
- command failure maps to failed
- unsupported verify maps to unavailable or blocked
- skipped vs not-requested distinction
- retry planned vs retry not planned
- transcript-safe evidence projection
- non-mutation command success is not edit verification failure

### 8. Update runMvp tests

Update targeted `runMvpIntegratedFlow.test.ts` cases.

Required focused gates:

- explicit node --version verify still works
- no-write read/inspect does not trigger mutation verification
- edit/patch verification behavior remains stable
- skipped/not-requested output is current-contract
- retry behavior is stable
- failed verification result is actionable

### 9. Full baseline update

Run full `runMvpIntegratedFlow.test.ts` if feasible.

Update `docs/architecture/control-plane-baseline.md`:

- previous count: 111 passed / 40 failed
- new count
- repaired tests
- rebaselined tests
- remaining failures by cluster
- next recommended cluster

### 10. Backlog update

Update `docs/architecture/module-backlog.md`.

Route 142 recommendation should be based on remaining largest cluster.

Likely options:

- continuation / rebase / lineage cleanup
- provider mock harness cleanup
- transcript / note stale assertion cleanup
- session codec and continuation seam extraction

## Boundaries

Hard boundaries:

- no provider/model live calls
- no browser feature work
- no edit/patch feature expansion
- no broad shell/allowlist expansion
- no permission semantics broadening
- no SessionManager schema changes
- no CLI redesign
- no package dependency changes
- no broad runMvp rewrite
- no commit or push

## Validation

Run:

- focused verification planner tests
- focused verification projection tests
- focused runMvp verification cluster tests
- Route 140 read/inspect tests
- Route 139 command/policy/result tests
- Route 138 dispatch tests
- Route 137 projection tests
- full `runMvpIntegratedFlow.test.ts` if feasible, record result
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`
- `rtk git status --short --branch`

Do not run broad unrelated suites.

## Final report

Include:

1. What changed
2. Targeted verification failure cluster
3. Starting vs ending runMvp baseline count
4. Verification contract
5. Product drift fixes
6. Stale test rebaseline decisions
7. Skipped vs not-requested behavior
8. Retry behavior
9. Validation
10. Remaining failures by cluster
11. Route 142 recommendation
12. Proposed commit message

Do not commit or push.
