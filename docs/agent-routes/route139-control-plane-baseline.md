# Route 139: Control-plane baseline sweep and policy-result repair

## Goal

Sweep current control-plane baselines, classify existing failures, and repair the highest-value policy/tool/result drifts before further modular extraction.

Route 138 repaired one pre-existing agent-loop red baseline:

- successful run-command was incorrectly downgraded by mutation/edit contract handling
- focused streamed-result handoff/tool-approval gate now passes
- a remaining known issue was recorded: dir/list-directory intent still conflicts with the current narrow command allowlist

Route 139 should pause extraction-first work and establish a trustworthy baseline map.

This route owns:

- runMvpIntegratedFlow focused/full baseline sweep
- command intent vs command allowlist drift classification
- policy/tool/result reason-code consistency audit
- stopped/completed/error mapping audit for command, browser, edit, MCP, provider, and session paths
- repair of the highest-confidence behavior drift bugs
- baseline manifest for remaining known reds
- focused tests for repaired paths

This route should be aggressive in finding issues, but disciplined in fixing only well-classified ones.

## Expected outcome

By the end of Route 139:

1. Known control-plane failures are no longer vague.
2. Full or broad focused `runMvpIntegratedFlow.test.ts` status is recorded with exact failing cases.
3. The dir/list-directory intent vs allowlist issue is classified and repaired or explicitly rebaselined.
4. Policy/tool/result mappings use stable reason codes for common stopped paths.
5. Successful commands are not downgraded by edit/mutation contracts.
6. Blocked commands remain actionable stopped results.
7. Browser/edit/provider/MCP/session result semantics do not regress.
8. A baseline manifest documents any remaining pre-existing red tests with owner, reason, and next action.
9. Route 140 can safely continue modular extraction or contract unification.

## Required inputs

Read:

- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/run-mvp-ledger.md`
- `docs/architecture/agent-loop-projection-extraction.md`
- `docs/architecture/agent-loop-baseline-dispatch.md`
- `docs/architecture/policy-result-boundary.md`
- `docs/architecture/module-backlog.md`
- `docs/architecture/capability-contract.md`

Use Route 138's baseline classification as the starting point.

## Reference scan

Use references only for command/tool policy and result mapping patterns.

Primary:

- `/home/wang/projects/opencode`
- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/OpenHands`

Secondary:

- `/home/wang/projects/gemini-cli`
- `/home/wang/projects/mini-swe-agent`
- `/home/wang/projects/inspect_ai`

Budget:

- opencode: max 8 files
- ClaudeCode: max 8 files
- OpenHands: max 6 files
- gemini-cli + mini-swe-agent + Inspect AI: max 8 files total

Focus:

- command/tool allowlist
- permission/policy stopped results
- successful tool result mapping
- directory/list/read command intent
- terminal result projection
- test harness baseline classification
- event/observation failure reporting

Do not study browser internals unless a browser regression appears in the sweep.

## Files

Likely touched:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts`
- `packages/ts-shell/src/orchestration/flowDispatch.ts`
- `packages/ts-shell/src/orchestration/flowResultProjection.ts`
- policy / allowlist files if the dir/list issue belongs there
- result mapper files if mapping drift is found

Likely new files:

- `docs/architecture/control-plane-baseline.md`
- `packages/ts-shell/src/orchestration/flowBaseline.test.ts`
- optional: `packages/ts-shell/src/orchestration/flowCommandIntent.ts`
- optional: `packages/ts-shell/src/orchestration/flowCommandIntent.test.ts`

Avoid creating a new framework.

## Implementation tasks

### 1. Baseline sweep

Run and record:

- focused Route 138 repaired gate
- broader `runMvpIntegratedFlow.test.ts` if feasible
- focused command/tool approval tests
- focused result mapper tests
- focused policy/allowlist tests
- closeout/result-contract gates

Create `docs/architecture/control-plane-baseline.md`.

For every failure, record:

- test name
- failure summary
- owner area
- classification:
  - product behavior drift
  - stale test expectation
  - harness/setup drift
  - obsolete scenario
  - unrelated flaky/environment issue
- fix now / defer / rebaseline decision

Do not hide failures.

### 2. Classify dir/list-directory issue

Investigate the known issue:

- "maps dir/list-directory intent..." versus narrow command allowlist

Answer:

- is list-directory supposed to be a supported read/inspect capability?
- should it map to a safe command?
- should it be blocked with a clear actionable stopped result?
- is the test stale?
- is the allowlist too narrow?
- is intent classification wrong?

Repair only if the expected behavior is clear.

### 3. Command intent contract

If needed, add `flowCommandIntent.ts`.

Keep it small.

It may own:

- read/list/inspect command intent classification
- command allowlist reason projection
- safe command summary
- blocked command do-next
- no-mutation command success projection

Rules:

- no new shell capability unless already intended
- no broad command allowlist expansion
- no unsafe path traversal behavior
- no provider/model calls

### 4. Policy/result reason-code audit

Audit common stopped/completed paths:

- command allowed success
- command blocked by allowlist
- command execution failure
- edit no-mutation / unsupported mutation
- browser unavailable
- browser policy blocked
- MCP unavailable / protocol error
- provider not configured / opt-in required
- session/continue missing evidence

Normalize only projection/reason-code drift where safe.

Do not invent a large taxonomy.

### 5. Repair highest-confidence drift bugs

Fix only well-classified bugs.

Good candidates:

- successful non-mutating command incorrectly treated as mutation failure
- safe list/inspect intent mapped to wrong result category
- blocked command missing actionable do-next
- unavailable capability mapped as vague error
- stale expectation after intentional behavior change

Bad candidates:

- broad shell allowlist expansion
- new browser/edit/provider feature behavior
- session schema change
- CLI redesign
- broad result contract rewrite

### 6. Tests

Add focused tests.

Required coverage:

- successful command remains completed
- blocked command remains stopped/actionable
- list-directory intent maps to expected current contract
- command failure is not confused with edit no-mutation failure
- no-mutation edit failure remains stopped where expected
- browser policy stopped path unaffected
- provider opt-in stopped path unaffected if touched
- result mapper reason code stable for repaired paths

If broad `runMvpIntegratedFlow.test.ts` still has red cases, ensure each is listed in the baseline manifest.

### 7. Baseline manifest

In `docs/architecture/control-plane-baseline.md`, include a final table:

- green gates
- repaired issues
- deferred red baselines
- each deferred baseline owner
- next route recommendation

This document should be concrete, not abstract prose.

### 8. Backlog update

Update `docs/architecture/module-backlog.md`.

Route 140 should depend on the sweep result.

Possible Route 140 options:

- Tool-policy-result contract unification
- Session codec and continuation seam extraction
- Agent-loop dispatch seam extraction v2
- Command intent and read/inspect capability cleanup

Choose the recommendation based on what Route 139 finds.

## Boundaries

Hard boundaries:

- no provider/model live calls
- no browser feature expansion
- no edit/patch feature expansion
- no broad shell capability expansion
- no broad command allowlist expansion
- no permission behavior changes unless fixing a proven bug
- no SessionManager schema changes
- no CLI UX redesign
- no package dependency changes
- no broad runMvp rewrite
- no commit or push

## Validation

Run:

- repaired focused runMvp gate
- broader runMvp baseline sweep if feasible
- focused command/policy/result tests
- Route 137 projection tests
- Route 138 dispatch tests
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`
- `rtk git status --short --branch`

If broad runMvp remains red, final report must list exact failing tests and classification.

Do not run broad unrelated package suites unless failures point there.

## Final report

Include:

1. What changed
2. Baseline sweep result
3. Repaired issues
4. Deferred issues with classification
5. dir/list-directory decision
6. Policy/result reason-code changes
7. Behavior preservation evidence
8. Validation
9. Remaining risks
10. Route 140 recommendation
11. Proposed commit message

Do not commit or push.
