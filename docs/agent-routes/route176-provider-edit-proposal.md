# Route 176: Provider edit proposal

## Goal

Add provider-backed edit proposal generation without enabling direct provider mutation.

Routes 167-175 established the Edit / Patch safety stack:

- exact fenced replacement
- runtime activation
- stable outcome taxonomy
- snapshot / explicit recovery
- discovery manifest and confirmation
- confirmed target-set execution
- transaction journal and recovery workflow
- generated edit proposal lifecycle with no-write default

Route 176 should now introduce the missing intelligent planning layer:

- safe file-context packet for edit proposal generation
- provider/model proposal call only when explicitly allowed
- structured patch proposal manifest
- review / confirmation surface
- exact mapping readiness classification
- no-write default behavior
- handoff readiness into existing fenced or target-set exact lanes
- Result Surface / Session / Continue / verifier coverage

This route should make model-assisted editing useful while preserving the existing safety substrate.

## Expected outcome

By the end of Route 176:

1. A generated edit request can produce a provider-backed patch proposal when provider use is explicitly available.
2. Provider proposal generation consumes only budgeted, redacted, explicit file context.
3. The provider result is normalized into a structured proposal manifest.
4. Proposal manifests distinguish review-only proposal, exact single-target readiness, exact target-set readiness, and unsupported broad/fuzzy outputs.
5. Provider proposals do not mutate files.
6. A confirmed exact proposal can be marked handoff-ready for existing safe lanes, but mutation remains a separate explicit step unless current confirmation flow already safely supports it.
7. Provider unavailable / not configured / opt-in missing states stop actionably.
8. Result Surface, Session / Continue, and verifier reports understand provider proposal states.
9. Real-provider calls remain opt-in and isolated; deterministic tests use fake/stub provider paths.
10. No raw secrets, provider credentials, full file dumps, or hidden config paths are emitted.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/future-edit-expansion-contract.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/architecture/tool-policy-result-contract.md`
- `docs/foundation/foundation-risk-register.md`

Provider-specific docs only if touched:

- provider readiness / auth contract docs
- provider module extraction or readiness parity docs

Do not load browser/history docs unless touched code proves they are needed.

## Reference scan

Use references only for model-assisted edit proposal, diff proposal, provider boundary, review, and result shape.

Primary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/gemini-cli`

Secondary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`

Budget:

- ClaudeCode: max 10 files
- opencode: max 12 files
- gemini-cli: max 10 files
- Inspect AI: max 6 files
- mini-swe-agent: max 4 files

Focus:

- provider/model edit proposal boundaries
- file context packet construction
- diff / patch proposal schema
- permission and confirmation metadata
- provider unavailable / opt-in result handling
- no-write review surfaces
- deterministic fake-provider tests

Do not copy autonomous apply loops, hidden credential loading, broad repair agents, or automatic mutation behavior.

## Owner modules

Primary owners:

- Edit / Patch
- Provider / Model

Collaborating owners:

- Workspace / File Context
- Permission / Policy
- Result Surface
- Session / Continue
- Harness / Eval

Likely new files:

- `packages/ts-shell/src/orchestration/providerEditContext.ts`
- `packages/ts-shell/src/orchestration/providerEditProposal.ts`
- `packages/ts-shell/src/orchestration/providerEditPlanner.ts`
- `packages/ts-shell/src/orchestration/providerEditResult.ts`
- `packages/ts-shell/src/orchestration/providerEditConfirmation.ts`
- `packages/ts-shell/src/orchestration/providerEditContext.test.ts`
- `packages/ts-shell/src/orchestration/providerEditProposal.test.ts`
- `packages/ts-shell/src/orchestration/providerEditPlanner.test.ts`
- `packages/ts-shell/src/orchestration/providerEditResult.test.ts`

Likely touched files:

- `generatedEditProposal.ts`
- `generatedEditPlanner.ts`
- `generatedEditConfirmation.ts`
- `generatedEditResult.ts`
- `editPatchModule.ts`
- `providerModule.ts`
- `providerOutcomeProjection.ts`
- `providerReadiness.ts`
- `workspaceFileContract.ts`
- `workspaceTargetProjection.ts`
- `resultSurfaceModule.ts`
- `actionableBlockerModule.ts`
- `capabilityResultClassification.ts`
- `terminalClassificationProjection.ts`
- `sessionContinuityModule.ts`
- `sessionTerminalState.ts`
- `verify-edit-capability-closeout.mjs`
- verifier provider readiness scripts only if required

Touch `runMvpIntegratedFlow.ts` only as a thin composition point.

## Implementation tasks

### 1. Audit current provider/edit boundary

Before changing behavior, determine:

- whether provider/model calls can currently participate in edit planning
- how generated edit currently stops without provider calls
- how provider not-configured / opt-in / unsupported states project today
- whether any fake/stub provider test path already exists
- how provider diagnostics are redacted and surfaced
- which verifier gates are safe to run without real provider credentials

Summarize in the final report.

### 2. Safe edit context packet

Add `providerEditContext.ts`.

The context packet should include:

- request id
- requested edit mode
- explicit target or confirmed target set
- safe target labels
- budgeted file excerpts or read summaries only when allowed
- existing exact mapping facts if present
- user constraints and non-goals
- verification expectation
- snapshot / recovery availability
- redaction status
- omitted content reasons

It must not include:

- provider credentials
- raw provider config paths
- entire unbounded file dumps
- secrets
- raw hidden context
- browser/page content
- unrelated workspace files

### 3. Provider proposal call boundary

Add `providerEditPlanner.ts`.

Planner should classify:

- `provider-proposal-ready`
- `provider-not-configured`
- `provider-opt-in-required`
- `provider-unsupported`
- `provider-context-missing`
- `provider-context-over-budget`
- `provider-request-blocked`
- `provider-proposal-created`
- `provider-proposal-invalid`
- `provider-proposal-review-required`

Rules:

- no provider call unless provider is explicitly available under existing opt-in rules
- deterministic tests must use fake/stub provider proposal
- real-provider gate remains opt-in and isolated
- provider call output is proposal only, not mutation authority

### 4. Structured proposal manifest

Add `providerEditProposal.ts`.

Proposal manifest should include:

- proposal id
- provider kind safe label
- target scope
- proposed operation kind
- per-target proposed hunks or summaries
- exact old/new readiness
- confidence / risk summary
- verification plan
- review required
- confirmation status
- mutation authority: `not-granted`
- handoff readiness
- redaction status

Proposal content should be reviewable but safe:

- compact diffs or summaries may be shown if existing surfaces allow it
- no full raw file dumps
- no secrets
- no credential/config paths
- no hidden provider diagnostics

### 5. Proposal normalization and validation

Normalize provider output.

Validation should reject or stop:

- missing target
- missing old/new mapping
- ambiguous target
- generated patch with no exact mapping
- broad refactor beyond scope
- fuzzy replacement request
- multi-file proposal over max guard
- unsafe content
- output that cannot be tied to explicit target facts

Invalid proposal results should stop actionably, not mutate.

### 6. Confirmation model

Add `providerEditConfirmation.ts`.

Confirmation states:

- `review-required`
- `confirmed-proposal-no-mutation`
- `confirmed-exact-single-target`
- `confirmed-exact-target-set`
- `invalid-confirmation`
- `provider-output-not-executable`

For this route:

- default is review-only no-write
- exact confirmed single-target may be handoff-ready for fenced route
- exact confirmed target-set may be handoff-ready for target-set route
- mutation should occur only if existing explicit confirmation path already requires all write preconditions
- otherwise leave as handoff-ready no-write

Prompt wording alone must not imply confirmation.

### 7. Result Surface integration

Add `providerEditResult.ts`.

Terminal outcomes should distinguish:

- provider proposal created, no mutation
- provider unavailable / not configured / opt-in required
- context missing / over budget
- provider output invalid
- review required
- exact proposal handoff-ready
- exact handoff executed if safely routed
- unsupported broad/fuzzy/generated proposal

No proposal-only state may appear as write success.

### 8. Session / Continue integration

Session / Continue should preserve:

- proposal id
- provider safe label
- target summary
- proposal status
- review requirement
- exact readiness
- handoff readiness
- do-next text

Do not persist:

- raw full file content
- provider credentials
- provider config paths
- secrets
- hidden reasoning
- unredacted provider diagnostics

`/continue` should be able to explain:

- proposal was created but not applied
- provider was unavailable
- what review/confirmation is needed
- whether the proposal can become exact handoff
- what validation failed

### 9. Verifier coverage

Strengthen edit closeout verifier or add focused provider-proposal verifier cases.

Required deterministic coverage:

- fake provider proposal created no-write
- provider not configured stopped
- provider opt-in required stopped if current readiness supports it
- context over budget stopped
- provider invalid proposal stopped
- exact single-target proposal handoff-ready
- exact target-set proposal handoff-ready
- proposal does not mutate without explicit execution path
- proposal/session/report excludes raw content and provider secrets
- result-contract compatibility

Real-provider gate:

- do not run by default
- if an opt-in dry-run gate exists, verify it stays dry-run and redacted
- never read private provider config manually

### 10. Docs update

Update long-lived docs only where status changes:

- `future-edit-expansion-contract.md`: provider-backed proposal status and no-write boundary
- implementation manifest / recipes if new facades or validation gates are added
- foundation risk register if provider edit risk changes
- module backlog if route status is tracked

No large new architecture doc.

## Boundaries

Hard boundaries:

- no default real-provider calls
- no manual reading of private provider config
- no direct provider-generated mutation
- no mutation from proposal alone
- no autonomous code generation apply loop
- no broad/fuzzy replacement execution
- no unconfirmed mutation
- no workspace authority weakening
- no stale-read bypass
- no Result Surface bypass
- no transcript schema change
- no CLI redesign
- no package dependency changes
- no browser work
- no broad `runMvpIntegratedFlow.ts` refactor

## Validation

Run focused validation based on touched files:

- provider edit context tests
- provider edit proposal tests
- provider edit planner tests
- provider edit result tests
- generated edit regression tests
- fenced/target-set handoff regression tests if touched
- provider readiness/facade tests if touched
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

Do not run real-provider gates unless the route explicitly opens an opt-in dry-run command.

## Final report

Include:

1. What changed
2. Current provider/edit boundary audit
3. Safe edit context packet behavior
4. Provider proposal planner behavior
5. Proposal manifest behavior
6. Confirmation and handoff behavior
7. Result Surface behavior
8. Session / Continue behavior
9. Verifier coverage
10. Validation
11. Remaining risks
12. Next route recommendation
