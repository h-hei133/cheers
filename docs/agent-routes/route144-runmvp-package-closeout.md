# Route 144: runMvp final closeout and package sweep

## Goal

First close the remaining `runMvpIntegratedFlow.test.ts` failures, then use the now-trustworthy runMvp baseline to sweep the broader `packages/ts-shell` package tests.

Route 143 reduced the core agent-loop integration baseline to:

- `runMvpIntegratedFlow.test.ts`: 144 passed / 7 failed

A broader package run also showed:

- `packages/ts-shell`: 2017 passed / 30 failed / 1 skipped

Route 144 should not treat those as the same thing.

Priority order:

1. Make full `runMvpIntegratedFlow.test.ts` green, or document any truly deferred case with exact reason.
2. Then run package-level tests.
3. Fix high-confidence package-level product or harness drift.
4. Rebaseline stale expectations only when current behavior is correct.
5. Leave any remaining package failures precisely classified.

This is a baseline closeout route, not a feature expansion route.

## Expected outcome

By the end of Route 144:

1. The remaining 7 `runMvpIntegratedFlow.test.ts` failures are all handled.
2. Full `runMvpIntegratedFlow.test.ts` is green unless a case is explicitly deferred with owner and reason.
3. Package-level test status is recorded after runMvp closeout.
4. High-confidence package-level failures are fixed.
5. Stale package-level assertions are rebaselined only when justified.
6. Remaining package failures, if any, have exact file/test/classification/next action.
7. No safety or product boundary is weakened.

## Required inputs

Read:

- `docs/architecture/control-plane-baseline.md`
- `docs/architecture/edit-expectation-contract.md`
- `docs/architecture/continuation-lineage-cleanup.md`
- `docs/architecture/verification-planner-cleanup.md`
- `docs/architecture/read-inspect-intent-cleanup.md`
- `docs/architecture/agent-loop-baseline-dispatch.md`
- `docs/architecture/policy-result-boundary.md`
- `docs/architecture/module-backlog.md`

Use Route 143's final state as the starting point:

- full runMvp: 144 passed / 7 failed
- package baseline: 2017 passed / 30 failed / 1 skipped

## Reference scan

Use references only for test baseline, harness, permission, session, CLI, trace, and result-surface patterns.

Primary:

- `/home/wang/projects/opencode`
- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/OpenHands`
- `/home/wang/projects/gemini-cli`

Secondary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`
- `/home/wang/projects/playwright-mcp`

Budget:

- opencode: max 8 files
- ClaudeCode: max 8 files
- OpenHands: max 6 files
- gemini-cli: max 6 files
- Inspect AI + mini-swe-agent + Playwright MCP: max 8 files total

Focus:

- agent-loop baseline tests
- approval / transcript / resume behavior
- sandbox command permission escalation
- recovery runtime context
- provider mock trace harness
- CLI/result surface expectations
- deterministic browser CLI/report testing
- stale assertion rebaseline discipline

Do not study unrelated feature internals.

## Files

Likely touched for runMvp closeout:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts`
- projection / dispatch / continuation / verification / edit expectation helpers if needed

Likely touched for package sweep:

- `packages/ts-shell/src/sandbox/sandboxPolicy.ts`
- `packages/ts-shell/src/sandbox/sandboxPolicy.test.ts`
- `packages/ts-shell/src/core/shell/runtimeContext.ts`
- affected recovery tests
- affected provider / trace tests
- affected browser CLI / scenario tests
- affected slashRouter / cli-baseline tests

Likely docs:

- `docs/architecture/runmvp-package-closeout.md`
- `docs/architecture/control-plane-baseline.md`
- `docs/architecture/module-backlog.md`

Avoid broad rewrites.

## Implementation tasks

### 1. Reproduce the 7 runMvp failures

Run full `runMvpIntegratedFlow.test.ts`.

Create `docs/architecture/runmvp-package-closeout.md`.

For each of the remaining 7 failures, record:

- test name
- failure summary
- owner area
- classification:
  - product drift
  - stale expectation
  - harness drift
  - future capability backlog
  - obsolete scenario
- fix / rebaseline / defer decision

Do not start package-level fixes before this is done.

### 2. Close all runMvp failures

Handle each of the 7 failures.

Allowed actions:

- fix product behavior drift
- update stale expectations to current contract
- replace obsolete scenarios with stronger current-contract tests
- move future capability expectations to backlog
- add focused helper tests where behavior is non-trivial

Not allowed:

- deleting tests without replacement
- hiding failures behind broad skip
- weakening safety assertions
- expanding provider/browser/edit/shell capability just to pass old tests

### 3. Run full runMvp gate

After fixes, run full `runMvpIntegratedFlow.test.ts`.

Expected target:

- full green

If not full green, final report must explain exact deferred case and why it is not safe to fix in Route 144.

### 4. Package-level sweep

After runMvp is green or explicitly closed, run package-level tests for `packages/ts-shell`.

Record:

- total passed / failed / skipped
- failing files
- failing tests
- classification per failure
- whether each is fix-now, rebaseline, or defer

### 5. Fix high-confidence package failures

Prioritize known package-level issues:

#### Sandbox bare-command escalation

Known suspected issue:

- bare command such as `node` may be normalized as `path.resolve("node")`
- this can classify it as workspace-local process spawn
- escalation handler may not fire correctly

Expected contract:

- bare executable names are command names, not workspace paths
- path-like executables remain normalized safely
- workspace-local executable handling remains protected
- no broad shell allowlist expansion

Add focused tests.

#### Recovery `targetPathBase` undefined crash

Known suspected issue:

- recovery tests may hit `path.resolve(undefined)` in `runtimeContext.ts`

Expected contract:

- undefined target path base must not crash
- fallback is deterministic and safe
- no SessionManager schema migration
- no invented unsafe target paths

Add focused tests.

#### Provider trace / mock harness drift

Known suspected issue:

- trace tests may expect provider-openai logs
- current prompt may route through tool/command path instead

Classify as:

- product drift
- harness drift
- stale expectation

No real provider calls.

#### Browser CLI / scenario drift

Known suspected issues:

- timeout
- report wording drift
- runtime status surface drift

Fix only deterministic product or test drift.

Do not expand browser capability.

#### SlashRouter / cli-baseline surface drift

Rebaseline stale output/status expectations only when current behavior is correct.

Do not redesign CLI.

### 6. Update baseline docs

Update `docs/architecture/control-plane-baseline.md`.

Include:

- previous runMvp count: 144 passed / 7 failed
- new runMvp count
- previous package count: 2017 passed / 30 failed / 1 skipped
- new package count
- repaired issues
- rebaselined stale expectations
- deferred failures and owners

Update `docs/architecture/module-backlog.md`.

Route 145 should be based on remaining failures.

## Boundaries

Hard boundaries:

- no provider/model live calls
- no browser feature expansion
- no edit/patch feature expansion
- no broad shell/allowlist expansion
- no permission weakening
- no SessionManager schema migration
- no CLI redesign
- no package dependency changes
- no broad runMvp rewrite
- no hiding failures behind skips
- no commit or push

## Validation

Run in order:

1. full `runMvpIntegratedFlow.test.ts`
2. focused tests for each runMvp repair
3. package-level `packages/ts-shell` test sweep
4. focused sandbox policy tests if touched
5. focused recovery/runtimeContext tests if touched
6. affected provider/trace tests if touched
7. affected browser CLI/scenario tests if touched
8. affected slashRouter/cli-baseline tests if touched
9. `rtk npm run verify:edit-capability-closeout`
10. `rtk npm run verify:result-contract`
11. `rtk npm run build -w packages/ts-shell`
12. `rtk git diff --check`
13. `rtk git status --short --branch`

If package-level sweep remains red, final report must list exact remaining failures and classification.

## Final report

Include:

1. What changed
2. Starting vs ending runMvp count
3. How each of the 7 runMvp failures was handled
4. Starting vs ending package count
5. Package-level issues fixed
6. Package-level issues deferred
7. Product drift fixes
8. Stale expectation rebaseline decisions
9. Validation
10. Remaining risks
11. Route 145 recommendation
12. Proposed commit message

Do not commit or push.
