# Route 147: Future edit expansion contract

## Goal

Define and gate future edit expansion contracts without enabling broad edit behavior by default.

Route 143 cleaned up current write/edit expectations:

- write requires explicit target and concrete content
- vague synthetic write is stopped/actionable
- broad refactor, batch edit, discovery edit, and broader fenced replacement were moved to future capability routes

Route 146 unified Tool / Policy / Result contracts across capabilities.

Route 147 should now design the next edit expansion layer in a way that future implementation can safely follow.

This route owns:

- broad refactor planning contract
- multi-file discovery edit contract
- fenced replacement contract
- explicit target/constraint manifest
- user-confirmed target selection model
- workspace authority and stale-read preconditions
- tool/policy/result mapping for future edit expansion
- eval/gate plan for future implementation
- optional no-op planner skeleton that never mutates files

This is a contract and planning route. It must not enable broad edit execution.

## Expected outcome

By the end of Route 147:

1. Future edit expansion has clear contracts before implementation.
2. Broad refactor, multi-file discovery edit, and fenced replacement are separated into distinct capability modes.
3. Each mode has explicit availability, policy, planning, execution preconditions, evidence, result, transcript, cleanup, and redaction requirements.
4. Unsupported future edit requests produce stable stopped/actionable results under the Route 146 tool/policy/result contract.
5. A no-op planner skeleton may classify and explain future edit requests, but it must not write files.
6. Current bounded edit/write behavior remains unchanged.
7. Package-level tests remain green.

## Required inputs

Read:

- `docs/architecture/module-backlog.md`
- `docs/architecture/edit-expectation-contract.md`
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/policy-result-boundary.md`
- `docs/architecture/control-plane-atlas.md`
- existing edit/patch design docs
- existing patchResult / mutation routing docs or helpers

Use Route 143 and Route 146 as the current behavior boundary.

## Reference scan

Use references only for edit/refactor planning and safe workspace mutation boundaries.

Primary:

- `/home/wang/projects/opencode`
- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/gemini-cli`

Secondary:

- `/home/wang/projects/mini-swe-agent`
- `/home/wang/projects/OpenHands`
- `/home/wang/projects/inspect_ai`

Budget:

- opencode: max 12 files
- ClaudeCode: max 8 files
- gemini-cli: max 8 files
- mini-swe-agent + OpenHands + Inspect AI: max 8 files total

Focus:

- edit tool schema
- target selection / target confirmation
- patch planning vs patch execution separation
- workspace authority
- stale-read and post-write verification
- snapshot/revert or rollback concepts
- user-facing unsupported edit results
- eval/gate patterns for future write capabilities

Do not study browser/provider internals.

## Files

Likely new files:

- `docs/architecture/future-edit-expansion-contract.md`
- `packages/ts-shell/src/orchestration/futureEditContract.ts`
- `packages/ts-shell/src/orchestration/futureEditContract.test.ts`
- `packages/ts-shell/src/orchestration/futureEditPlanner.ts`
- `packages/ts-shell/src/orchestration/futureEditPlanner.test.ts`

Likely touched files:

- `docs/architecture/module-backlog.md`
- `packages/ts-shell/src/orchestration/editExpectationContract.ts`
- `packages/ts-shell/src/orchestration/flowResultProjection.ts`
- `packages/ts-shell/src/core/tools/toolPolicyResult.ts` only if needed for stopped projection reuse
- focused runMvp tests only if stale future-edit expectations still exist

Avoid changing mutation execution, patch writer, workspace write authority, or broad agent loop control flow.

## Implementation tasks

### 1. Current boundary audit

Create `docs/architecture/future-edit-expansion-contract.md`.

Record current supported edit/write behavior:

- explicit target
- concrete content
- bounded single-file edit
- existing verification semantics
- unsupported broad refactor/batch/discovery/fenced cases
- current stopped/actionable result contract

Then define what remains future-only.

### 2. Define future edit modes

Define these modes separately:

#### Broad refactor planning

Requires:

- explicit user request
- affected scope manifest
- target constraint summary
- no mutation until user confirmation
- stale-read check
- post-write verification plan
- rollback/snapshot story before execution route

#### Multi-file discovery edit

Requires:

- discovery phase
- candidate file list
- user-confirmed target set
- per-file plan
- bounded max-file guard
- no implicit broad workspace write

#### Fenced replacement

Requires:

- explicit target file
- exact old/new or fenced block mapping
- stale-read guard
- ambiguity handling
- no fuzzy broad replacement unless a later route approves it

### 3. Add future edit contract helper

Add `futureEditContract.ts`.

It should classify:

- current bounded write/edit
- future broad refactor request
- future multi-file discovery edit request
- future fenced replacement request
- unsupported vague edit
- unsupported prompt-generated content request
- unsafe or ambiguous mutation request

It should return:

- mode
- current support status
- required preconditions
- reason code
- do-next
- whether mutation is allowed now
- whether user confirmation is required
- which future route should own implementation

No provider/model calls.

No file writes.

### 4. Add no-op future edit planner

Add `futureEditPlanner.ts`.

Planner may produce a non-executing plan object:

- mode
- requested scope
- target hints
- missing information
- confirmation requirement
- verification requirement
- rollback/snapshot requirement
- stopped/actionable projection

It must never call the writer or patch engine.

It must never infer write authorization from prompt text alone.

### 5. Integrate only stopped/planning surfaces

If safe, connect future edit classification to existing unsupported edit paths so user-facing stopped results are clearer.

Allowed:

- improve reason/do-next for unsupported broad refactor
- improve reason/do-next for unsupported discovery edit
- improve reason/do-next for unsupported fenced replacement
- reuse Route 146 tool/policy/result projection

Not allowed:

- executing broad refactor
- executing multi-file discovery edit
- executing fuzzy/fenced replacement beyond current bounded support
- changing workspace authority
- broad command/file discovery expansion

### 6. Tests

Add focused tests.

Required coverage:

- broad refactor request classifies as future planning, no mutation allowed
- multi-file discovery edit request requires candidate confirmation
- fenced replacement request requires explicit target and exact mapping
- vague create/refactor request stops actionably
- prompt-generated content request remains unsupported unless concrete content exists
- bounded concrete write remains current supported behavior
- bounded edit remains current supported behavior
- future edit stopped result includes reason/do-next
- future edit planner never writes files
- tool/policy/result projection is replay-safe and redacted

### 7. Documentation and backlog update

Update `docs/architecture/module-backlog.md`.

Break future implementation into concrete follow-up routes, for example:

- Route 148A: Fenced replacement bounded implementation
- Route 148B: Multi-file discovery edit candidate selection
- Route 148C: Broad refactor planning with user-confirmed manifest
- Route 148D: Snapshot/rollback precondition route

Do not claim these are implemented.

### 8. Validation

Run:

- focused future edit contract/planner tests
- existing edit expectation tests
- existing mutation/patch focused tests touched by contract
- runMvpIntegratedFlow.test.ts
- full packages/ts-shell test sweep if feasible
- verify:edit-capability-closeout
- verify:result-contract
- build
- diff check
- git status

## Boundaries

Hard boundaries:

- no provider/model live calls
- no browser work
- no broad edit/refactor/batch/discovery execution
- no broad fenced/fuzzy replacement execution
- no generated file content from vague prompts
- no workspace authority weakening
- no stale-read bypass
- no rollback/snapshot implementation unless docs-only precondition mapping
- no broad shell/allowlist expansion
- no SessionManager schema changes
- no CLI redesign
- no package dependency changes
- no broad runMvp rewrite
- no hidden skips
- no commit or push

## Final report

Include:

1. What changed
2. Current edit contract preserved
3. Future edit modes defined
4. Planner skeleton behavior
5. Stopped/actionable result behavior
6. Tests and package baseline result
7. Follow-up route recommendations
8. Remaining risks
9. Proposed commit message

Do not commit or push.
