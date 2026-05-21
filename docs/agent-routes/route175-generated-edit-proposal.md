# Route 175: Generated edit proposal

## Goal

Add a generated edit proposal manifest and review lifecycle without enabling direct generated mutation.

Routes 167-174 established a safe Edit / Patch expansion stack:

- exact fenced replacement lane
- runtime activation
- outcome taxonomy
- snapshot / explicit recovery
- discovery manifest and confirmation
- confirmed target-set execution
- transaction journal, partial-failure policy, verification aggregation, recovery workflow

Route 175 should now open the next input class:

- generated edit requests
- proposal manifest
- proposed diff / replacement summary
- explicit review and confirmation model
- no-write default behavior
- safe conversion only when the proposal becomes exact old/new mapping
- Result Surface / Session / Continue / verifier coverage

This route should make generated edit requests useful without allowing vague prompt text to become mutation authority.

## Expected outcome

By the end of Route 175:

1. Generated edit prompts no longer collapse into vague unsupported output only; they can produce a no-write proposal manifest.
2. Proposal manifests distinguish missing content, proposed content, exact mapping, broad request, generated request, and mutation readiness.
3. Proposal output is reviewable and redacted.
4. Generated proposals never mutate by default.
5. A proposal can become executable only when it is converted into an exact old/new mapping with explicit target confirmation.
6. Single-target confirmed exact proposals can hand off to the existing fenced replacement lane.
7. Target-set generated proposals remain no-write unless every target has exact confirmed mapping and the route explicitly allows handoff.
8. Result Surface, Session / Continue, and verifier reports understand proposal states.
9. Fuzzy, broad, under-specified, provider-generated, and unconfirmed edits remain stopped/no-write.
10. No provider/model call is introduced by this route.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/future-edit-expansion-contract.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/foundation/foundation-risk-register.md`

Then inspect current Route 167-174 code and tests.

Do not load browser/provider/history docs unless touched code proves they are needed.

## Reference scan

Use references only for proposal, diff review, edit confirmation, and safe user-facing result behavior.

Primary:

- `/home/wang/projects/opencode`
- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/gemini-cli`
- `/home/wang/projects/inspect_ai`

Secondary:

- `/home/wang/projects/mini-swe-agent`

Budget:

- opencode: max 12 files
- ClaudeCode: max 8 files
- gemini-cli: max 8 files
- Inspect AI: max 6 files
- mini-swe-agent: max 4 files

Focus:

- edit proposal / diff preview
- generated content confirmation
- write permission metadata
- exact old/new edit handoff
- proposal result summaries
- verifier/eval reporting for no-write proposal paths

Do not copy broad patch engines, autonomous code generation, fuzzy replacement, or automatic apply behavior.

## Owner modules

Primary owner:

- Edit / Patch

Collaborating owners:

- Workspace / File Context
- Permission / Policy
- Result Surface
- Session / Continue
- Harness / Eval

Likely new files:

- `packages/ts-shell/src/orchestration/generatedEditProposal.ts`
- `packages/ts-shell/src/orchestration/generatedEditPlanner.ts`
- `packages/ts-shell/src/orchestration/generatedEditConfirmation.ts`
- `packages/ts-shell/src/orchestration/generatedEditResult.ts`
- `packages/ts-shell/src/orchestration/generatedEditProposal.test.ts`
- `packages/ts-shell/src/orchestration/generatedEditPlanner.test.ts`
- `packages/ts-shell/src/orchestration/generatedEditConfirmation.test.ts`
- `packages/ts-shell/src/orchestration/generatedEditResult.test.ts`

Likely touched files:

- `futureEditContract.ts`
- `futureEditPlanner.ts`
- `editPatchModule.ts`
- `discoveryEditManifest.ts`
- `discoveryEditPlanner.ts`
- `discoveryEditResult.ts`
- `fencedEditActivation.ts`
- `fencedEditRoute.ts`
- `targetSetEditPlan.ts`
- `targetSetEditRoute.ts`
- `targetSetEditResult.ts`
- `resultSurfaceModule.ts`
- `actionableBlockerModule.ts`
- `capabilityResultClassification.ts`
- `terminalClassificationProjection.ts`
- `sessionContinuityModule.ts`
- `sessionTerminalState.ts`
- `verify-edit-capability-closeout.mjs`

Touch `runMvpIntegratedFlow.ts` only as a thin composition point if generated proposal activation requires it.

## Implementation tasks

### 1. Audit current generated edit behavior

Before changing behavior, determine:

- how generated edit prompts currently route
- which prompts stop as unsupported generated-content edit
- whether exact user-provided new content already becomes bounded edit
- whether discovery/target-set generated prompts are distinguishable
- what verifier markers prove generated edit remains no-write today

Summarize in the final report.

### 2. Define generated proposal manifest

Add `generatedEditProposal.ts`.

Proposal manifest should include:

- proposal id
- requested mode: `generated-edit`
- target scope: explicit target / candidate set / unknown
- target labels
- requested operation kind
- proposed content status
- exact mapping status
- confirmation status
- mutation readiness
- verification requirement
- snapshot requirement
- redaction status
- mutation authority: `not-granted` by default

Proposal content rules:

- may include safe summaries
- may include hashes / size / line ranges
- may include compact preview only if existing project result surfaces already allow it
- must not dump raw full file contents
- must not persist secrets
- must not treat model/user vague instruction as concrete content

### 3. Generated planner

Add `generatedEditPlanner.ts`.

Classify generated edit prompts into:

- `missing-generated-content`
- `proposal-created-no-write`
- `exact-single-target-proposal`
- `exact-target-set-proposal`
- `broad-generated-request`
- `fuzzy-generated-request`
- `generated-discovery-request`
- `unsupported-provider-generated-request`
- `confirmation-required`
- `ready-for-exact-handoff`

Planner behavior:

- no write by default
- no provider/model call
- no file discovery mutation
- exact handoff only when target and old/new mapping are concrete
- broad/fuzzy/generated requests stop with do-next text
- missing content stops with do-next text

### 4. Confirmation model

Add `generatedEditConfirmation.ts`.

Confirmation states:

- `not-confirmed`
- `review-required`
- `confirmed-proposal-no-mutation`
- `confirmed-exact-single-target`
- `confirmed-exact-target-set`
- `invalid-confirmation`
- `unsupported-confirmation`

For this route:

- confirmed exact single-target may hand off to existing fenced replacement lane
- confirmed exact target-set may hand off only if every target already satisfies Route 172 target-set exact mapping requirements
- broad/fuzzy/generated confirmation does not grant mutation

Prompt wording alone must not imply confirmation.

### 5. Handoff rules

Allowed handoff:

- explicit target
- exact old/new mapping
- exactly one match per target
- explicit confirmation
- workspace authority through existing write route
- final stale-read
- snapshot/recovery
- verification
- Result Surface truthfulness

Disallowed handoff:

- vague generated content
- provider/model generated content not concretized into exact mapping
- fuzzy replacement
- broad refactor
- discovery without confirmed target
- target-set without all per-target exact mappings
- missing old block or missing new content

Do not create a new writer. Reuse fenced/target-set edit routes.

### 6. Result Surface integration

Generated proposal results should distinguish:

- proposal created, no mutation
- missing generated content, stopped/no-write
- review required, stopped/no-write
- exact single-target handoff success
- exact target-set handoff success
- handoff stopped
- unsupported broad/fuzzy/generated request
- hard internal failure

Terminal output should clearly say:

- no write occurred for proposal/review states
- what confirmation or exact mapping is needed
- what handoff occurred if any
- verification and snapshot status for executed handoff

### 7. Session / Continue integration

Session / Continue should preserve:

- proposal id
- target summary
- proposal status
- review / confirmation requirement
- exact mapping readiness
- handoff result if executed
- do-next text

Do not preserve:

- raw full file contents
- raw full proposed diff if unsafe
- secrets
- provider config paths

`/continue` should be able to explain:

- proposal created but not applied
- what is missing for exact apply
- what confirmation is needed
- what happened after exact handoff

### 8. Verifier coverage

Strengthen edit closeout verifier.

Required coverage:

- generated proposal created no-write
- missing generated content stopped/no-write
- broad generated request stopped/no-write
- fuzzy generated request stopped/no-write
- generated discovery request produces no-write proposal/manifest
- confirmed exact single-target proposal handoff succeeds
- confirmed exact target-set proposal handoff succeeds if implemented
- unconfirmed proposal does not mutate
- proposal/session/report excludes raw content
- result-contract compatibility

### 9. Docs update

Update long-lived docs only where status changes:

- `future-edit-expansion-contract.md`: generated proposal status and handoff constraints
- implementation manifest / recipes if new facades or validation gates are added
- foundation risk register if generated edit risk changes
- module backlog if route status is tracked

No large new architecture doc.

## Boundaries

Hard boundaries:

- no provider/model calls
- no autonomous code generation
- no direct generated mutation
- no broad/fuzzy replacement execution
- no mutation from proposal alone
- no unconfirmed mutation
- no file discovery mutation
- no generated target-set mutation unless every target reduces to exact confirmed mapping
- no automatic rollback
- no workspace authority weakening
- no stale-read bypass
- no Result Surface bypass
- no transcript schema change
- no CLI redesign
- no package dependency changes
- no broad `runMvpIntegratedFlow.ts` refactor

## Validation

Run focused validation based on touched files:

- generated proposal tests
- generated planner tests
- generated confirmation tests
- generated result tests
- fenced edit regression tests
- target-set edit regression tests if handoff touches them
- snapshot/recovery regression tests if handoff touches them
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
2. Current generated edit behavior audit
3. Generated proposal manifest behavior
4. Planner and confirmation behavior
5. Handoff behavior
6. Result Surface behavior
7. Session / Continue behavior
8. Verifier coverage
9. Validation
10. Remaining risks
11. Next route recommendation
