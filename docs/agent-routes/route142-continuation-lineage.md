# Route 142: Continuation lineage cleanup

## Goal

Repair the continuation / rebase / lineage failure cluster while strengthening the underlying session continuation contract.

Route 141 reduced full `runMvpIntegratedFlow.test.ts` to:

- 112 passed / 39 failed

The largest remaining real user-path cluster is now:

- weak follow-up handling
- `/continue` evidence carryover
- cross-file reopen
- "next" / "what next" temporal continuation
- path rebasing after workspace or file context changes
- verification hint carryover
- stale transcript / lineage expectations

Route 142 should not merely rebaseline tests. It should define and implement a clearer continuation lineage seam, then repair the highest-value failures in this cluster.

This route owns:

- continuation intent classification
- lineage/evidence projection
- rebase target resolution
- follow-up target carryover
- verification hint carryover
- transcript-safe continuation summaries
- stale continuation test rebaseline
- full runMvp baseline update

This is a session/continuation contract route, not a broad SessionManager rewrite.

## Expected outcome

By the end of Route 142:

1. Continuation/rebase/lineage behavior has a documented contract.
2. Weak follow-up prompts can reuse prior safe context when the contract allows it.
3. Cross-file reopen and path rebase behavior is deterministic.
4. Verification hints can carry across continuation when safe.
5. `/continue` can rely on summarized evidence, not raw transcript or raw file/browser content.
6. Stale continuation tests are rebaselined or replaced with current-contract assertions.
7. Real product drift in the continuation cluster is fixed.
8. Full `runMvpIntegratedFlow.test.ts` failed count decreases, or remaining continuation failures are precisely classified.
9. No persistence schema migration is introduced.

## Required inputs

Read:

- `docs/architecture/control-plane-baseline.md`
- `docs/architecture/verification-planner-cleanup.md`
- `docs/architecture/read-inspect-intent-cleanup.md`
- `docs/architecture/session-manager-boundary.md`
- `docs/architecture/run-mvp-ledger.md`
- `docs/architecture/capability-contract.md`
- `docs/architecture/module-backlog.md`

Use Route 141's remaining failure classification as the starting point.

## Reference scan

Use references only for continuation/session/replay lineage patterns.

Primary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/OpenHands`
- `/home/wang/projects/gemini-cli`

Secondary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`

Budget:

- ClaudeCode: max 10 files
- opencode: max 10 files
- OpenHands: max 8 files
- gemini-cli: max 8 files
- Inspect AI + mini-swe-agent: max 6 files total

Focus:

- session resume / compact / restore
- transcript event summaries
- message lineage and continuation evidence
- workspace/file target rebasing
- follow-up intent handling
- verification hint continuity
- replay-safe summaries
- stale test/harness patterns

Do not study browser internals unless a continuation failure directly involves browser transaction evidence.

## Files

Likely touched:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts`
- `packages/ts-shell/src/session/SessionManager.ts`
- continuation / transcript / evidence helper files
- Route 137/138/141 projection files if continuation evidence routes through them

Likely new files:

- `packages/ts-shell/src/orchestration/continuationIntent.ts`
- `packages/ts-shell/src/orchestration/continuationLineage.ts`
- `packages/ts-shell/src/orchestration/continuationRebase.ts`
- `packages/ts-shell/src/orchestration/continuationProjection.ts`
- `packages/ts-shell/src/orchestration/continuationLineage.test.ts`
- `docs/architecture/continuation-lineage-cleanup.md`

Keep names short. Avoid a new session framework.

## Implementation tasks

### 1. Cluster continuation failures

From `docs/architecture/control-plane-baseline.md`, extract failures related to:

- `/continue`
- weak follow-up
- next / what next
- rebase
- lineage
- reopen previous files
- prior target carryover
- prior verification hint carryover
- stale transcript role or evidence assertions

Create `docs/architecture/continuation-lineage-cleanup.md`.

Record:

- starting full runMvp count: 112 passed / 39 failed
- targeted failure names
- classification for each:
  - product drift
  - stale expectation
  - harness drift
  - obsolete scenario
  - defer
- fix/rebaseline/defer decision

### 2. Define continuation contract

Document and implement the intended contract.

Suggested contract:

- continuation can reuse summarized prior evidence
- continuation cannot depend on raw DOM, raw file dumps, hidden state, or private scratch
- weak follow-up may carry prior target only when:
  - target is unambiguous
  - target is still inside workspace
  - prior evidence is replay-safe
  - no destructive action is inferred
- rebase may update path references only through deterministic workspace/file-context facts
- verification hints may carry only when tied to the same target/task lineage
- obsolete or ambiguous lineage should stop actionably, not hallucinate context

### 3. Extract continuation intent helper

Add `continuationIntent.ts`.

It should classify:

- explicit `/continue`
- weak follow-up
- next-step request
- reopen previous target
- rebase request
- retry after failure
- unrelated new task

Do not call providers or run tools inside this helper.

### 4. Extract lineage projection

Add `continuationLineage.ts`.

It should build replay-safe lineage facts:

- previous task summary
- previous target files
- previous capability area
- previous result status
- previous evidence ids
- prior verification status/hints
- safe next-action hints
- ambiguity reason when carryover is not allowed

No raw file content, raw DOM, secrets, or hidden transcript dumps.

### 5. Extract rebase resolver

Add `continuationRebase.ts`.

It should resolve:

- prior relative path against current workspace
- renamed/moved target if existing code has deterministic facts
- missing prior target
- ambiguous multi-target context
- cross-file reopen requests

If safe rebase is impossible, return stopped/actionable.

No broad filesystem search unless already supported by current code.

### 6. Extract continuation projection

Add `continuationProjection.ts`.

It should project:

- continuation success summary
- continuation stopped/actionable result
- lineage missing
- rebase failed
- verification hint carried
- verification hint not carried
- replay-safe transcript summary

Use existing result contract semantics.

### 7. Repair product drift

Fix high-confidence continuation bugs.

Good candidates:

- weak follow-up loses obvious prior target
- `/continue` ignores replay-safe evidence id
- rebase maps to wrong path
- verification hint is dropped across same-task continuation
- ambiguous lineage produces vague error instead of actionable stopped
- stale target reopen fails despite deterministic prior evidence

Bad candidates:

- new broad memory system
- new provider reasoning
- schema migration
- cross-session hidden state
- broad filesystem search
- edit capability expansion

### 8. Rebaseline stale tests

For targeted stale tests:

- update transcript role expectations
- update stopped vs error expectations
- update evidence marker expectations
- replace obsolete scenario with current continuation contract

Do not weaken tests; make them assert the new contract.

### 9. Add focused tests

Add `continuationLineage.test.ts`.

Required coverage:

- explicit `/continue` uses replay-safe evidence
- weak follow-up carries unambiguous prior target
- weak follow-up stops on ambiguous prior target
- next-step request uses prior safe next-action hint
- previous verification hint carries for same lineage
- verification hint does not carry for unrelated task
- rebase succeeds for deterministic workspace path
- rebase stops actionably for missing target
- cross-file reopen resolves only when unambiguous
- projection does not include raw file content / raw DOM / secrets

### 10. Update runMvp tests

Update targeted `runMvpIntegratedFlow.test.ts` cases.

Required focused gates:

- `/continue` evidence carryover
- weak follow-up target carryover
- next / what next summary
- path rebase stopped or completed under current contract
- verification hint carryover
- transcript-safe continuation summary

### 11. Full baseline update

Run full `runMvpIntegratedFlow.test.ts` if feasible.

Update `docs/architecture/control-plane-baseline.md`:

- previous count: 112 passed / 39 failed
- new count
- repaired tests
- rebaselined tests
- remaining failures by cluster
- next recommended cluster

### 12. Backlog update

Update `docs/architecture/module-backlog.md`.

Route 143 recommendation should be based on remaining largest cluster.

Likely options:

- edit/write old expectation cleanup
- provider mock harness cleanup
- transcript/role stale assertion cleanup
- session codec extraction
- result surface stale expectation cleanup

## Boundaries

Hard boundaries:

- no provider/model live calls
- no browser feature work
- no edit/patch feature expansion
- no broad filesystem search
- no broad memory system
- no SessionManager schema migration
- no CLI redesign
- no package dependency changes
- no broad runMvp rewrite
- no raw DOM/file dumps/secrets in continuation summaries
- no commit or push

## Validation

Run:

- focused continuation lineage tests
- focused runMvp continuation cluster tests
- Route 141 verification tests
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
2. Targeted continuation failure cluster
3. Starting vs ending runMvp baseline count
4. Continuation contract
5. Lineage/rebase behavior
6. Product drift fixes
7. Stale test rebaseline decisions
8. Validation
9. Remaining failures by cluster
10. Route 143 recommendation
11. Proposed commit message

Do not commit or push.
