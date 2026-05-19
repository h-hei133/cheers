# Route 140: Read / inspect intent cleanup

## Goal

Repair the highest-value Route 139 baseline cluster: command intent, read/inspect/repo-explain behavior, and stale tests around no-write inspection paths.

Route 139 established the current control-plane baseline:

- full `runMvpIntegratedFlow.test.ts` is 101 passed / 50 failed
- failures are now classified in `docs/architecture/control-plane-baseline.md`
- not all failures are stale tests
- the safest next slice is command intent + read/inspect/repo-explain cleanup

Route 140 should reduce that red baseline by fixing one coherent capability family.

This route owns:

- read/list/inspect/repo-explain intent classification
- command intent vs command allowlist behavior
- no-write inspection result mapping
- stale read/inspect test rebaseline
- product drift fixes where current behavior is wrong
- obsolete scenario replacement where old behavior is no longer valid
- updated baseline manifest with remaining failed count

This is not a broad runMvp rewrite.

## Expected outcome

By the end of Route 140:

1. Read/inspect/repo-explain prompts no longer fall into misleading fallback commands.
2. Directory/listing intent has a clear contract: supported safe read path or actionable stopped result.
3. Repo-explain / inspect intent has a clear no-write result surface.
4. No-write inspection is not confused with edit/mutation failure.
5. Stale tests in this cluster are updated or replaced with stronger current-contract assertions.
6. Product behavior drift in this cluster is fixed.
7. Full `runMvpIntegratedFlow.test.ts` failed count is lower or remaining failures are reclassified precisely.
8. Closeout/result-contract/build gates still pass.

## Required inputs

Read:

- `docs/architecture/control-plane-baseline.md`
- `docs/architecture/agent-loop-baseline-dispatch.md`
- `docs/architecture/policy-result-boundary.md`
- `docs/architecture/run-mvp-ledger.md`
- `docs/architecture/capability-contract.md`
- `docs/architecture/module-backlog.md`

Use Route 139's failure manifest as the source of truth for the starting failure set.

## Reference scan

Use references only for read/inspect/tool intent and no-write result patterns.

Primary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/gemini-cli`

Secondary:

- `/home/wang/projects/OpenHands`
- `/home/wang/projects/mini-swe-agent`

Budget:

- ClaudeCode: max 8 files
- opencode: max 8 files
- gemini-cli: max 8 files
- OpenHands + mini-swe-agent: max 6 files total

Focus:

- file read / directory list tools
- repo inspect / explain intent
- tool availability and command allowlist
- no-write result summaries
- terminal output for read-only tasks
- tests for read-only agent tasks

Do not study browser internals or provider internals unless a failure requires it.

## Files

Likely touched:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts`
- `packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts`
- `packages/ts-shell/src/orchestration/flowCommandIntent.ts` if it exists or is useful
- `packages/ts-shell/src/orchestration/flowDispatch.ts`
- `packages/ts-shell/src/orchestration/flowResultProjection.ts`
- result mapper / session runtime tests if no-write result surface is asserted there

Likely new files:

- `packages/ts-shell/src/orchestration/readInspectIntent.ts`
- `packages/ts-shell/src/orchestration/readInspectIntent.test.ts`
- `docs/architecture/read-inspect-intent-cleanup.md`

Avoid broad new framework files.

## Implementation tasks

### 1. Cluster the failures

From `docs/architecture/control-plane-baseline.md`, extract the subset of failures related to:

- read file
- inspect file
- list directory
- repo explain
- no-write plan
- command fallback
- wrong stopped/completed result for inspection
- stale note/transcript assertion directly caused by read/inspect behavior

Create `docs/architecture/read-inspect-intent-cleanup.md`.

Record:

- starting failed count
- targeted failure names
- classification for each
- fix/rebaseline/defer decision

### 2. Define read/inspect contract

Define the current intended contract.

Suggested contract:

- explicit directory listing should not fallback to unrelated commands like `node --version`
- if safe listing is supported, route through the safe read/list capability
- if not supported, return stopped/actionable with clear reason and do-next
- read/inspect/repo-explain is no-write
- no-write success should complete with inspection summary
- no-write inability should be stopped/actionable, not edit mutation failure
- ambiguous inspect target should ask for or report target clarification

Do not expand shell command access broadly.

### 3. Implement intent cleanup

Add or update a small intent helper.

It should classify:

- read file intent
- list directory intent
- inspect workspace intent
- repo-explain intent
- edit/mutation intent
- verify command intent
- unknown command intent

Rules:

- explicit verify command remains supported where already supported
- explicit unsafe shell command remains blocked
- read/inspect must not become write/edit
- directory list must not silently map to unrelated fallback
- no provider/model calls

### 4. Repair product drift

Fix high-confidence behavior drift in this cluster.

Good candidates:

- no-write read/inspect result incorrectly mapped to stopped_error
- repo-explain not producing a stable inspection summary
- directory list falling into unrelated fallback command
- read-only intent being parsed as edit
- command failure being misclassified as mutation failure

Do not fix unrelated continuation/provider/browser failures in this route.

### 5. Rebaseline stale tests

For targeted failures that are stale tests:

- update expected result category
- update expected terminal text
- update expected transcript role/marker
- replace obsolete scenario with current-contract scenario

Do not weaken tests; make assertions more precise.

### 6. Add focused tests

Add focused tests covering:

- read file intent is no-write
- list directory intent does not fallback to unrelated command
- supported list/read path completes or unsupported path stops actionably
- repo-explain intent produces inspection result or actionable stopped result
- read/inspect is not treated as edit mutation failure
- explicit verify command remains recognized
- unsafe shell remains blocked
- result mapper preserves completed/stopped distinction
- transcript/output contains inspection summary but no raw overlong dump

### 7. Full runMvp baseline update

Run the full `runMvpIntegratedFlow.test.ts` if feasible.

Update `docs/architecture/control-plane-baseline.md` with:

- previous count: 101 passed / 50 failed
- new count
- repaired tests
- rebaselined tests
- remaining failures
- next recommended cluster

If full run remains too expensive or noisy, run the targeted subset and document why full run was not used.

### 8. Backlog update

Update `docs/architecture/module-backlog.md`.

Route 141 recommendation should be based on remaining largest failure cluster, likely one of:

- verification planner cleanup
- continuation/rebase/lineage cleanup
- provider mock harness cleanup
- transcript/note stale assertion cleanup

## Boundaries

Hard boundaries:

- no provider/model live calls
- no browser feature work
- no edit/patch feature expansion
- no broad shell capability expansion
- no broad command allowlist expansion
- no permission semantics broadening
- no SessionManager schema changes
- no CLI redesign
- no package dependency changes
- no broad runMvp rewrite
- no commit or push

## Validation

Run:

- focused read/inspect intent tests
- focused runMvp tests for targeted failure cluster
- result mapper/session runtime tests if touched
- Route 137 projection tests
- Route 138 dispatch tests
- command/policy tests from Route 139
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
2. Targeted failure cluster
3. Starting vs ending runMvp baseline count
4. Product drift fixes
5. Stale test rebaseline decisions
6. Read/inspect/list/repo-explain contract
7. Validation
8. Remaining failures by cluster
9. Route 141 recommendation
10. Proposed commit message

Do not commit or push.
