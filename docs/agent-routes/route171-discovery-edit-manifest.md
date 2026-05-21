# Route 171: Discovery edit manifest

## Goal

Add a bounded discovery edit manifest and confirmation handoff path without enabling broad or multi-file mutation.

Routes 167-170 established the safe single-file edit lane:

- exact fenced replacement owner lane
- runtime activation through prompt / CLI / agent loop
- outcome taxonomy and closeout gate
- single-file snapshot / rollback readiness substrate

Route 171 should now introduce the next edit expansion layer:

- discovery candidate manifest
- explicit confirmation model
- per-candidate edit plan projection
- no-write candidate summaries
- confirmed single-target handoff into the existing exact fenced replacement lane
- stopped states for unconfirmed, ambiguous, broad, or multi-target mutation requests
- verifier coverage proving candidate discovery does not grant write authority

This route is aggressive in planning and handoff scope, but conservative in mutation scope.

## Expected outcome

By the end of Route 171:

1. Discovery edit prompts can produce a bounded candidate manifest.
2. Candidate manifests are no-write and carry `mutationAuthority: not-granted`.
3. The manifest includes candidate paths, match evidence summaries, confidence, required confirmation, and planned operation kind.
4. The agent / CLI can explain what targets were found and what confirmation is required.
5. A confirmed single-target discovery edit can hand off to the existing exact fenced replacement lane.
6. Multi-target or unconfirmed discovery edits remain stopped before mutation.
7. Result Surface, Session / Continue, and verifier reports understand discovery manifest states.
8. No broad fuzzy replacement, generated edit, or multi-file mutation is enabled.

## Required docs

Read only route-relevant docs first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/future-edit-expansion-contract.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/foundation/foundation-risk-register.md`

Then inspect current code and tests.

Do not load browser/provider/history docs unless a touched file proves they are needed.

## Reference scan

Use references only for discovery, candidate manifests, confirmation, and edit handoff patterns.

Primary:

- `/home/wang/projects/opencode`
- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/gemini-cli`

Secondary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`

Budget:

- opencode: max 10 files
- ClaudeCode: max 8 files
- gemini-cli: max 8 files
- Inspect AI: max 4 files
- mini-swe-agent: max 4 files

Focus:

- file edit target discovery vs write authorization
- confirmation metadata
- candidate list reporting
- exact edit handoff
- no-write / stopped result wording
- verifier markers for skipped/stopped planning cases

Do not copy broad fuzzy patch engines, generated edit behavior, or automatic multi-file refactor behavior.

## Owner modules

Primary owner:

- Edit / Patch

Required collaborating owners:

- Workspace / File Context
- Permission / Policy
- Result Surface
- Session / Continue
- Harness / Eval

Likely new files:

- `packages/ts-shell/src/orchestration/discoveryEditManifest.ts`
- `packages/ts-shell/src/orchestration/discoveryEditPlanner.ts`
- `packages/ts-shell/src/orchestration/discoveryEditConfirmation.ts`
- `packages/ts-shell/src/orchestration/discoveryEditResult.ts`
- `packages/ts-shell/src/orchestration/discoveryEditManifest.test.ts`
- `packages/ts-shell/src/orchestration/discoveryEditPlanner.test.ts`
- `packages/ts-shell/src/orchestration/discoveryEditConfirmation.test.ts`
- `packages/ts-shell/src/orchestration/discoveryEditResult.test.ts`

Likely touched files:

- `editPatchModule.ts`
- `futureEditPlanner.ts`
- `futureEditContract.ts`
- `workspaceFileContract.ts`
- `workspaceTargetProjection.ts`
- `resultSurfaceModule.ts`
- `actionableBlockerModule.ts`
- `capabilityResultClassification.ts`
- `terminalClassificationProjection.ts`
- `sessionContinuityModule.ts`
- `sessionTerminalState.ts`
- `verify-edit-capability-closeout.mjs`
- `scripts/verify/*` only if verifier module boundaries require it

Touch `runMvpIntegratedFlow.ts` only as a composition point. Do not embed discovery logic there.

## Implementation tasks

### 1. Audit current discovery-edit behavior

Before changing behavior, determine:

- how discovery-like edit prompts are currently classified
- whether they stop as future-only edit
- whether any candidate summaries already exist
- whether continuation can carry candidate facts
- whether verifier already checks discovery edit no-write behavior

Summarize this audit in the final report.

### 2. Define discovery manifest

Add `discoveryEditManifest.ts`.

Manifest should include:

- manifest id
- requested mode: `discovery-edit`
- requested operation kind
- workspace root safe label
- bounded candidate list
- candidate path labels
- evidence summary per candidate
- match confidence
- ambiguity status
- max candidate guard status
- required confirmation status
- planned per-candidate operation kind
- mutation authority: always `not-granted`
- snapshot requirement: required before any future write
- verification requirement
- redaction status

Manifest must not include raw file dumps or secret material.

### 3. Candidate discovery planning

Add `discoveryEditPlanner.ts`.

Supported planning inputs:

- explicit filename hint plus exact old/new fenced mapping
- explicit symbol/text hint plus bounded candidate search if an existing safe search/read path exists
- user asks to find the target before editing
- user asks to update one discovered location but does not yet confirm the exact target

Planner behavior:

- produce no-write manifest
- cap candidate count
- stop when candidate set is empty
- stop when candidate set is over max
- stop when mapping is missing
- stop when generated/broad/fuzzy edit is requested
- stop when multiple candidates require confirmation

Do not grant write authority.

### 4. Confirmation model

Add `discoveryEditConfirmation.ts`.

Define confirmation states:

- `not-required-explicit-target`
- `required-target-selection`
- `confirmed-single-target`
- `confirmed-target-set-no-mutation`
- `ambiguous-confirmation`
- `invalid-confirmation`

For this route, only `confirmed-single-target` may hand off to mutation, and only if the operation reduces to the existing exact fenced replacement lane.

Do not enable multi-file writes.

Confirmation can come from:

- explicit current prompt target selection
- replay-safe continuation evidence
- a future CLI/session confirmation surface if already present

Do not infer confirmation from vague wording.

### 5. Confirmed single-target handoff

When confirmation selects exactly one candidate and the edit is exact fenced replacement:

- convert candidate to explicit target
- re-check workspace authority through existing write path
- run final stale-read
- capture snapshot via Route 170 substrate
- execute existing fenced replacement route
- preserve verification, Result Surface, Session / Continue behavior

Do not bypass Route 167-170 lane.

### 6. Stopped result states

Add or strengthen stopped states for:

- no candidates found
- too many candidates
- ambiguous candidates
- missing mapping
- confirmation required
- invalid confirmation
- multi-target mutation not supported
- fuzzy discovery replacement not supported
- generated discovery edit not supported
- broad refactor not supported

Each stopped state needs:

- safe reason
- do-next text
- mutation:not-run
- candidate manifest evidence if safe
- continuation-safe summary

### 7. Result Surface integration

Result Surface should distinguish:

- discovery manifest produced, no mutation
- confirmation required, no mutation
- confirmed single-target handoff success
- confirmed single-target handoff stopped
- unsupported discovery edit stopped
- hard failure only for unexpected planner/execution errors

No manifest-only result may appear as write success.

### 8. Session / Continue integration

Session / Continue should preserve:

- manifest id
- candidate summary
- confirmation requirement
- selected candidate if confirmed
- handoff result if executed
- do-next text

It must not preserve raw file contents, old/new block content, or secret material.

`/continue` should be able to explain:

- what candidates were found
- why mutation did not run
- what confirmation is needed
- what happened after confirmed single-target handoff

### 9. Verifier coverage

Strengthen edit closeout verifier.

Required coverage:

- discovery manifest produced with mutationAuthority:not-granted
- no candidates stopped
- multiple candidates confirmation required
- too many candidates stopped
- missing mapping stopped
- unsupported fuzzy discovery stopped
- generated discovery edit stopped
- confirmed single-target handoff reaches exact fenced replacement
- multi-target confirmation remains no-write
- candidate summary excludes raw content
- result-contract compatibility

### 10. Docs update

Update long-lived docs only where status changes:

- `future-edit-expansion-contract.md`: discovery manifest status and confirmed single-target handoff status
- implementation manifest / recipes if new facades or validation gates are added
- foundation risk register if a risk changes
- module backlog if route status is tracked

Do not create a large new architecture doc.

## Boundaries

Hard boundaries:

- no multi-file mutation
- no broad/fuzzy replacement execution
- no generated-content edit
- no automatic target confirmation
- no mutation from candidate manifest alone
- no rollback expansion beyond Route 170 single-file explicit seam
- no provider/model calls
- no browser work
- no workspace authority weakening
- no stale-read bypass
- no Result Surface bypass
- no transcript schema change
- no CLI redesign
- no package dependency changes
- no broad `runMvpIntegratedFlow.ts` refactor

## Validation

Run focused validation based on touched files:

- discovery manifest tests
- discovery planner tests
- confirmation tests
- confirmed handoff tests
- fenced edit route/result/outcome regression tests
- snapshot/recovery regression tests if touched
- Result Surface tests if touched
- Session / Continue tests if touched
- verifier closeout tests
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- JSON parse guard if manifest changes
- package guard if package files are touched unexpectedly
- `rtk git diff --check`
- `rtk git status --short --branch`

## Final report

Include:

1. What changed
2. Current discovery-edit behavior audit
3. Discovery manifest behavior
4. Confirmation model
5. Confirmed single-target handoff behavior
6. Stopped states
7. Result Surface behavior
8. Session / Continue behavior
9. Verifier coverage
10. Validation
11. Remaining risks
12. Next route recommendation
