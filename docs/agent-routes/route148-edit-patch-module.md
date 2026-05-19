# Route 148: Edit / Patch module development

## Goal

Switch from feature-first development to module-first development for Edit / Patch.

The project now has a green baseline and several extracted control-plane seams:

- package-level tests are green
- Session / Continue substrate seams exist
- Tool / Policy / Result contract exists
- Future edit expansion contracts exist

Route 148 should establish the Edit / Patch module as a coherent development unit, then implement one safe internal slice that prepares future edit expansion without enabling broad writes by default.

This route owns:

- Edit / Patch module responsibility map
- current bounded edit/write lane inventory
- future expansion mode alignment
- module-owned mutation manifest
- preview/evidence substrate
- stale-read and workspace-authority precondition projection
- verification handoff contract
- rollback/snapshot requirement projection
- result/transcript/continue projection boundary
- focused implementation slice inside the module

This is module-first development, not a single-feature route.

## Expected outcome

By the end of Route 148:

1. Edit / Patch has a clear module contract.
2. Existing bounded edit/write behavior remains unchanged.
3. Future edit expansion modes are mapped into the module, not scattered through runMvp.
4. The module owns a mutation manifest / preview substrate.
5. Workspace authority, stale-read, verification, and rollback/snapshot requirements are represented as module preconditions.
6. Agent loop integration remains thin and delegates to module-owned helpers.
7. Package-level tests remain green.
8. Route 149 can continue inside the Edit / Patch module or move to another module with a clear handoff.

## Required inputs

Read:

- `docs/architecture/future-edit-expansion-contract.md`
- `docs/architecture/edit-expectation-contract.md`
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/policy-result-boundary.md`
- `docs/architecture/module-backlog.md`
- existing edit / patch / mutation design docs
- existing patchResult / mutation routing / bounded write files

Use module boundaries first. Do not treat this as a single-feature implementation route.

## Reference scan

Use references only for edit/patch module organization.

Primary:

- `/home/wang/projects/opencode`
- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/gemini-cli`

Secondary:

- `/home/wang/projects/mini-swe-agent`
- `/home/wang/projects/OpenHands`
- `/home/wang/projects/inspect_ai`

Budget:

- opencode: max 14 files
- ClaudeCode: max 10 files
- gemini-cli: max 8 files
- mini-swe-agent + OpenHands + Inspect AI: max 10 files total

Focus:

- edit tool module boundaries
- patch planning vs execution separation
- workspace authority
- stale-read checks
- target manifests
- preview/diff evidence
- rollback/snapshot preconditions
- verification handoff
- result/report surfaces

Do not study browser/provider internals.

## Files

Likely new files:

- `docs/architecture/edit-patch-module.md`
- `packages/ts-shell/src/orchestration/editPatchModule.ts`
- `packages/ts-shell/src/orchestration/editPatchManifest.ts`
- `packages/ts-shell/src/orchestration/editPatchPreview.ts`
- `packages/ts-shell/src/orchestration/editPatchPreconditions.ts`
- `packages/ts-shell/src/orchestration/editPatchResult.ts`
- `packages/ts-shell/src/orchestration/editPatchModule.test.ts`

Likely touched files:

- `futureEditContract.ts`
- `futureEditPlanner.ts`
- `editExpectationContract.ts`
- existing mutation routing / patchResult helpers
- `flowResultProjection.ts` only if result projection is duplicated
- `runMvpIntegratedFlow.ts` only for thin delegation
- `docs/architecture/module-backlog.md`

Avoid moving existing patch writer code unless the move is mechanical and fully covered.

## Implementation tasks

### 1. Create Edit / Patch module doc

Create `docs/architecture/edit-patch-module.md`.

Include:

- current supported lanes
- current unsupported modes
- module responsibilities
- cross-module inputs
- cross-module outputs
- module-owned preconditions
- module-owned evidence/preview
- module-owned result projection
- future implementation sequence

Explicitly distinguish:

- current bounded edit/write
- future broad refactor
- future multi-file discovery edit
- future fenced replacement
- future snapshot/rollback

### 2. Define module facade

Add `editPatchModule.ts`.

This should be a narrow facade over existing helpers.

It may expose:

- classifyEditRequest
- buildMutationManifest
- buildPreview
- evaluatePreconditions
- projectEditResult
- describeUnsupportedFutureEdit

The facade should delegate to existing bounded edit/future edit helpers. It should not implement broad new write execution.

### 3. Define mutation manifest

Add `editPatchManifest.ts`.

The manifest should represent:

- requested edit mode
- explicit targets
- candidate targets
- per-file operation kind
- content / transform summary
- stale-read requirement
- workspace authority requirement
- verification requirement
- rollback/snapshot requirement
- confirmation requirement
- redaction marker

Manifest is not write authorization.

### 4. Define preview/evidence substrate

Add `editPatchPreview.ts`.

Preview should include:

- target summary
- operation summary
- per-file planned change summary
- missing information
- ambiguity facts
- authority facts
- stale-read facts
- verification plan
- rollback/snapshot requirement
- evidence id

No raw oversized file dumps or secrets.

### 5. Define precondition projector

Add `editPatchPreconditions.ts`.

Evaluate:

- explicit target present
- concrete content or transform present
- candidate target confirmation
- workspace authority facts present
- stale-read facts present
- verification plan present or not required
- rollback/snapshot requirement satisfied or missing
- user confirmation satisfied or required

Current bounded edit/write should pass existing preconditions unchanged. Future broad modes should remain blocked until their preconditions are implemented.

### 6. Define result projector

Add `editPatchResult.ts`.

Project module results using Route 146 vocabulary:

- current bounded edit/write delegated
- preview-only plan
- missing target
- missing content
- ambiguous candidates
- confirmation required
- stale-read missing
- workspace authority blocked
- rollback/snapshot missing
- unsupported future mode
- execution not enabled

Transcript and `/continue` summaries must be replay-safe.

### 7. Wire thinly into existing helpers

Update:

- `futureEditContract.ts`
- `futureEditPlanner.ts`
- `editExpectationContract.ts`

to use the module-owned manifest/precondition/result helpers where appropriate.

Only touch `runMvpIntegratedFlow.ts` if there is duplicated edit classification/projection that can become a thin call into the module.

Do not move execution control flow broadly.

### 8. Tests

Add focused tests for the module facade and helpers.

Required coverage:

- current bounded write still supported
- current bounded edit still supported
- missing target stopped/actionable
- missing content stopped/actionable
- future broad refactor creates preview-only module result
- future multi-file discovery requires confirmation
- future fenced replacement requires exact mapping / target
- manifest is not authorization
- stale-read/workspace authority are represented as preconditions
- rollback/snapshot blocks broad future execution
- result projection uses stopped/actionable vocabulary
- transcript/continue summary is redacted and replay-safe

### 9. Validation

Run:

- focused edit module tests
- future edit contract/planner tests
- edit expectation tests
- touched mutation/patch tests
- runMvpIntegratedFlow.test.ts
- package sweep if feasible
- verify:edit-capability-closeout
- verify:result-contract
- build
- diff check
- status

## Boundaries

Hard boundaries:

- no provider/model live calls
- no browser work
- no broad edit/refactor/batch/discovery execution
- no multi-file write execution
- no fuzzy replacement execution
- no generated content from vague prompts
- no workspace authority weakening
- no stale-read bypass
- no approval bypass
- no rollback/snapshot implementation beyond requirement modeling
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
2. Edit / Patch module boundary
3. Module facade behavior
4. Manifest / preview / precondition behavior
5. Current bounded edit/write preservation
6. Future modes represented but not executed
7. Validation and package baseline result
8. Remaining risks
9. Route 149 recommendation
10. Proposed commit message

Do not commit or push.
