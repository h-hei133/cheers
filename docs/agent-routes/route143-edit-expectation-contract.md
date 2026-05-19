# Route 143: Edit expectation contract cleanup

## Goal

Clean up the remaining write/edit expectation cluster without expanding edit capability.

Route 142 reduced full `runMvpIntegratedFlow.test.ts` to:

- 127 passed / 24 failed

The largest remaining cluster is now:

- write / concrete-content contract: 7
- edit / refactor / batch / discovery expansion: 10

These failures are not one bug. They mix:

- stale tests expecting synthetic file content
- old expectations that the agent can infer write targets/content from vague prompts
- future backlog capabilities such as refactor, batch edit, discovery edit, fenced replacement
- current bounded edit contract behavior that should stop actionably when target/content is missing

Route 143 should define the current write/edit contract, rebaseline stale tests, fix product drift where bounded behavior is wrong, and explicitly move future edit expectations into backlog docs.

This route owns:

- current write/edit support boundary
- concrete-content requirement
- target resolution requirement
- no-write vs mutation distinction
- actionable stopped result for unsupported edit/refactor/batch/discovery
- stale runMvp edit/write test rebaseline
- remaining failure manifest update

This is not a broad edit capability expansion route.

## Expected outcome

By the end of Route 143:

1. Current write/edit contract is documented and testable.
2. Vague write prompts do not synthesize arbitrary file content.
3. Missing target/content maps to actionable stopped result, not vague error.
4. Read/inspect/no-write paths remain separate from mutation paths.
5. Unsupported refactor/batch/discovery/fenced replacement expectations are moved to backlog or explicit stopped tests.
6. Product drift in bounded edit/write paths is fixed where current contract is clear.
7. Full `runMvpIntegratedFlow.test.ts` failed count decreases, or remaining edit failures are precisely reclassified.
8. No new edit capability is introduced without explicit contract and tests.

## Required inputs

Read:

- `docs/architecture/control-plane-baseline.md`
- `docs/architecture/continuation-lineage-cleanup.md`
- `docs/architecture/verification-planner-cleanup.md`
- `docs/architecture/read-inspect-intent-cleanup.md`
- `docs/architecture/policy-result-boundary.md`
- `docs/architecture/run-mvp-ledger.md`
- `docs/architecture/capability-contract.md`
- `docs/architecture/module-backlog.md`
- existing edit/patch design docs that define bounded edit behavior

Use Route 142's remaining failure breakdown as the starting point.

## Reference scan

Use references only for edit contract boundaries and safe mutation expectations.

Primary:

- `/home/wang/projects/opencode`
- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/gemini-cli`

Secondary:

- `/home/wang/projects/mini-swe-agent`
- `/home/wang/projects/OpenHands`

Budget:

- opencode: max 10 files
- ClaudeCode: max 8 files
- gemini-cli: max 6 files
- mini-swe-agent + OpenHands: max 8 files total

Focus:

- edit tool schema
- write-file concrete content requirement
- patch target resolution
- unsupported refactor behavior
- batch/multi-file edit boundaries
- no-write vs mutation result semantics
- user-facing stopped results

Do not study browser/provider internals.

## Files

Likely touched:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts`
- edit/patch contract/projection files
- `packages/ts-shell/src/orchestration/flowResultProjection.ts`
- `packages/ts-shell/src/orchestration/flowEvidenceProjection.ts`
- result mapper tests if edit result mapping is asserted there

Likely new files:

- `packages/ts-shell/src/orchestration/editExpectationContract.ts`
- `packages/ts-shell/src/orchestration/editExpectationContract.test.ts`
- `docs/architecture/edit-expectation-contract.md`

Avoid broad edit engine changes.

## Implementation tasks

### 1. Cluster edit/write failures

From `docs/architecture/control-plane-baseline.md`, extract failures related to:

- write file
- concrete content missing
- target missing
- vague edit request
- refactor
- batch edit
- discovery edit
- fenced replacement
- current-directory write
- auto-generated Python/file content
- mutation expected but unsupported

Create `docs/architecture/edit-expectation-contract.md`.

Record:

- starting full runMvp count: 127 passed / 24 failed
- targeted failure names
- classification for each:
  - product drift
  - stale expectation
  - future capability backlog
  - obsolete scenario
  - defer
- fix/rebaseline/defer decision

### 2. Define current edit/write contract

Document and enforce the current intended contract.

Suggested current contract:

- write requires explicit target path and concrete content
- edit requires explicit target and concrete replacement/patch intent
- ambiguous target stops actionably
- missing content stops actionably
- vague "create a script" without content is not silently synthesized
- broad refactor is unsupported unless an existing bounded route already supports it
- batch edit / multi-file discovery edit is unsupported unless explicitly routed
- no-write read/inspect must not become edit
- successful bounded mutation may trigger verification according to Route 141 semantics
- unsupported mutation maps to stopped/actionable, not generic error

### 3. Add edit expectation helper

Add `editExpectationContract.ts`.

It should classify:

- concrete write
- missing content write
- missing target write
- bounded edit
- unsupported broad refactor
- unsupported batch edit
- unsupported discovery edit
- fenced replacement unsupported/supported according to current code
- no-write inspect/read
- ambiguous mutation

It should return:

- capability kind
- contract status
- reason code
- do-next
- whether mutation may proceed
- whether verification may be considered

No provider/model calls.

### 4. Repair product drift

Fix clear current-contract bugs.

Good candidates:

- missing content maps to vague error instead of actionable stopped
- vague write accidentally proceeds or gets wrong classification
- no-write inspect classified as edit
- unsupported refactor maps to generic failure instead of unsupported mutation stopped
- bounded edit success loses verification eligibility
- ambiguous target loses do-next

Bad candidates:

- implementing broad refactor
- implementing multi-file discovery edit
- generating file content from prompt
- broad patch engine expansion
- changing permission semantics
- changing SessionManager schema

### 5. Rebaseline stale tests

For targeted stale tests:

- update expected result from completed/error to stopped where current contract says stop
- update expected reason/do-next
- replace old "agent writes invented content" tests with explicit-content write tests or unsupported-content tests
- move future capability expectations into backlog note

Do not weaken assertions; make the current contract stronger.

### 6. Add focused tests

Add `editExpectationContract.test.ts`.

Required coverage:

- concrete write with target/content may proceed
- missing content stops actionably
- missing target stops actionably
- vague create-script prompt does not synthesize content
- no-write inspect stays no-write
- unsupported refactor stops actionably
- unsupported batch edit stops actionably
- unsupported discovery edit stops actionably
- bounded edit remains eligible for verification
- stopped unsupported mutation has stable reason/do-next

### 7. Update runMvp tests

Update targeted `runMvpIntegratedFlow.test.ts` cases.

Required focused gates:

- explicit concrete write path current behavior
- missing content write stopped/actionable
- ambiguous target stopped/actionable
- unsupported refactor stopped/actionable
- unsupported batch/discovery stopped/actionable
- no-write read/inspect remains completed/stopped according to read contract
- bounded mutation verification still follows Route 141 semantics

### 8. Full baseline update

Run full `runMvpIntegratedFlow.test.ts` if feasible.

Update `docs/architecture/control-plane-baseline.md`:

- previous count: 127 passed / 24 failed
- new count
- repaired tests
- rebaselined tests
- future capability tests moved out or rewritten
- remaining failures by cluster
- next recommended cluster

### 9. Backlog update

Update `docs/architecture/module-backlog.md`.

Move future edit capabilities into explicit route candidates, for example:

- Broad refactor planning route
- Multi-file discovery edit route
- Fenced replacement support route
- Git-aware change attribution route

Do not leave future capabilities as failing baseline tests.

## Boundaries

Hard boundaries:

- no provider/model live calls
- no browser work
- no broad edit/refactor/batch/discovery expansion
- no generated file content from vague prompts
- no broad shell/allowlist expansion
- no permission semantics broadening
- no SessionManager schema changes
- no CLI redesign
- no package dependency changes
- no broad runMvp rewrite
- no commit or push

## Validation

Run:

- focused edit expectation tests
- focused runMvp edit/write cluster tests
- Route 142 continuation tests
- Route 141 verification tests
- Route 140 read/inspect tests
- Route 139 command/policy/result tests
- Route 138 dispatch tests
- Route 137 projection tests
- full `runMvpIntegratedFlow.test.ts` if feasible
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`
- `rtk git status --short --branch`

Do not run broad unrelated suites.

## Final report

Include:

1. What changed
2. Targeted edit/write failure cluster
3. Starting vs ending runMvp baseline count
4. Current edit/write contract
5. Product drift fixes
6. Stale test rebaseline decisions
7. Future capabilities moved to backlog
8. Validation
9. Remaining failures by cluster
10. Route 144 recommendation
11. Proposed commit message

Do not commit or push.
