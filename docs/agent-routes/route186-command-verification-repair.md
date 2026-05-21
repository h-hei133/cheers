# Route 186: Command verification repair

## Goal

Connect safe verification command execution to the Route 185 review-gated repair loop.

Route 185 added:

- safe verification repair context
- repair-loop planner
- fake-provider repair proposal
- review-required no-write repair proposal
- exact hunk-set handoff after explicit confirmation
- Result Surface / Session / Continue coverage

But Route 185 still consumes verification failure facts that already exist. Route 186 should make those facts come from a controlled command-driven verification path:

- select a safe verification command from plan/proposal/context facts
- run it only through existing command/runtime/permission boundaries
- capture runtime receipt
- classify verification result
- feed failed verification into repair-loop context
- produce repair proposal through the existing review-gated path
- preserve terminal / continue / verifier evidence

This route improves the agent's ability to learn from tests and verification without expanding write authority.

## Expected outcome

By the end of Route 186:

1. Agent Plan / proposal / edit result can carry a verification command candidate.
2. Verification command selection is explicit, allowlisted, and explainable.
3. Command execution uses existing runtime/tool execution boundaries.
4. Runtime receipt evidence is attached to verification result.
5. Verification success / failure / skipped / blocked / timeout are classified consistently.
6. Verification failure can automatically create a repair-loop context, but not automatically apply a repair.
7. Fake-provider repair proposal can be generated from command failure in deterministic tests.
8. Result Surface distinguishes verification command success, failed, blocked, skipped, timeout, and repair-proposal-created states.
9. Session / Continue can explain the command, receipt, failure, and available repair proposal.
10. No arbitrary shell execution, broad allowlist expansion, provider-default call, or automatic repair mutation is introduced.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/foundation/foundation-risk-register.md`
- `docs/architecture/runtime-receipt-contract.md`
- `docs/architecture/tool-runtime-execution-flow.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/architecture/tool-policy-result-contract.md`

Read only if touched:

- `docs/architecture/workspace-file-context-contract.md`
- provider readiness / provider boundary docs
- verifier module extraction docs
- session substrate seams

Do not read browser docs or old route docs unless code directly points there.

## Reference scan

Use references only for verification command execution, runtime receipt, trajectory, test failure classification, and repair loop shape.

Primary:

- `/home/wang/projects/opencode`
- `/home/wang/projects/gemini-cli`
- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/OpenHands`

Secondary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`

Budget:

- opencode: max 12 files
- gemini-cli: max 10 files
- ClaudeCode: max 8 files
- OpenHands: max 8 files
- Inspect AI: max 8 files
- mini-swe-agent: max 6 files

Focus:

- test / command execution boundaries
- command approval / allowlist metadata
- runtime receipt / trajectory shape
- verification result classification
- failed-command repair context
- scorer/report fields
- terminal and continuation wording

Do not copy arbitrary shell policies, hidden autonomous retry loops, direct mutation, provider credential handling, or broad command allowlist behavior.

## Owner modules

Primary owners:

- Harness / Eval
- Runtime
- Edit / Patch repair loop
- Result Surface

Collaborating owners:

- Agent Loop Planning
- Provider / Model
- Session / Continue
- Permission / Policy
- Workspace / File Context

Likely new files:

- `packages/ts-shell/src/orchestration/verificationCommandPlan.ts`
- `packages/ts-shell/src/orchestration/verificationCommandRunner.ts`
- `packages/ts-shell/src/orchestration/verificationCommandResult.ts`
- `packages/ts-shell/src/orchestration/verificationFailureClassifier.ts`
- `packages/ts-shell/src/orchestration/verificationRepairBridge.ts`
- `packages/ts-shell/src/orchestration/verificationCommandPlan.test.ts`
- `packages/ts-shell/src/orchestration/verificationCommandRunner.test.ts`
- `packages/ts-shell/src/orchestration/verificationCommandResult.test.ts`
- `packages/ts-shell/src/orchestration/verificationFailureClassifier.test.ts`
- `packages/ts-shell/src/orchestration/verificationRepairBridge.test.ts`

Likely touched files:

- `verificationPlanner.ts`
- `verificationResultProjection.ts`
- `runtimeReceiptProjection.ts`
- `toolRuntimeModule.ts`
- `agentPlan.ts`
- `agentPlanProjection.ts`
- `providerEditProposal.ts`
- `contextAwareProviderProposal.ts`
- `editRepairContext.ts`
- `verificationRepairContext.ts`
- `verificationRepairPlanner.ts`
- `verificationRepairLoop.ts`
- `verificationRepairResult.ts`
- `resultSurfaceModule.ts`
- `sessionResultParity.ts`
- `continuationEvidenceParity.ts`
- `stoppedSessionContinuity.ts`
- `sessionResumeContextBuilder.ts`
- `verify-context-planning.mjs`
- `verify-edit-capability-closeout.mjs`

Touch `runMvpIntegratedFlow.ts` only as a thin composition point if absolutely required.

## Implementation tasks

### 1. Audit current verification command path

Before changing behavior, determine:

- where verification command candidates are currently stored
- how verification command execution currently runs, if at all
- where runtime receipts are projected
- what command allowlist / permission checks exist
- how verification failure is classified today
- how edit repair context currently consumes failure facts
- what verifier gates prove command evidence today

Summarize in the final report.

### 2. Verification command plan

Add `verificationCommandPlan.ts`.

Plan should include:

- verification plan id
- source agent plan id
- source proposal id if available
- source edit transaction id if available
- command safe label
- command kind
- cwd safe label
- allowlist status
- permission requirement
- expected evidence
- timeout budget
- stdout/stderr budget
- redaction status
- execution readiness

Plan states:

- `ready`
- `missing-command`
- `not-allowlisted`
- `permission-required`
- `blocked-by-policy`
- `context-missing`
- `unsupported`

A verification command plan does not grant shell authority by itself.

### 3. Command execution bridge

Add `verificationCommandRunner.ts`.

Execution must:

- use existing runtime/tool execution path where available
- preserve current permission / allowlist behavior
- capture runtime receipt
- classify timeout, stopped, blocked, success, failure
- budget stdout/stderr
- avoid raw secrets
- avoid arbitrary shell construction

Do not implement a new shell runner unless existing runtime path cannot be reused. If a helper is needed, keep it a thin adapter over existing runtime execution.

### 4. Verification command result

Add `verificationCommandResult.ts`.

Result should include:

- verification id
- command plan id
- runtime receipt id / markers
- outcome: success / failed / blocked / skipped / timeout / error
- exit code if safe
- duration / timeout status
- stdout/stderr budget status
- failure summary
- redaction status
- repair eligibility

No raw unbounded output.

### 5. Failure classifier

Add `verificationFailureClassifier.ts`.

Classify safe failure types:

- test failed
- typecheck failed
- lint failed
- command not allowlisted
- command timed out
- command blocked by policy
- command unavailable
- no verification command
- invalid runtime receipt
- unknown

Classifier output should be usable by repair context and terminal result.

### 6. Repair bridge

Add `verificationRepairBridge.ts`.

Given a failed verification command result:

- create Route 185 repair-loop context
- attach runtime receipt markers
- attach context packet / agent plan / proposal ids when available
- attach failed command safe label
- attach failure classifier output
- decide if repair proposal is eligible
- invoke existing fake-provider repair proposal path in deterministic tests
- never auto-apply repair

### 7. Result Surface integration

Terminal outcomes should distinguish:

- verification command succeeded
- verification command failed
- verification command blocked
- verification command skipped
- verification command timeout
- repair context created
- repair proposal created
- repair review required
- repair not eligible

Output should show:

- command safe label
- outcome
- receipt marker
- failure class
- whether repair proposal exists
- whether any mutation occurred

No raw stdout/stderr dumps unless already budgeted and safe.

### 8. Session / Continue integration

Session / Continue should preserve:

- verification plan id
- command safe label
- runtime receipt markers
- verification outcome
- failure class
- repair context id
- repair proposal id
- review / confirmation requirement
- do-next text

`/continue` should be able to explain:

- what verification command ran
- why it failed / blocked / skipped
- what receipt exists
- whether repair is available
- what explicit confirmation is needed

### 9. Verifier coverage

Strengthen focused verifier coverage.

Required coverage:

- allowlisted fake verification command success
- allowlisted fake verification command failure
- command not allowlisted stopped / no runtime execution
- command timeout classification
- runtime receipt marker attached
- failed verification creates repair context
- fake-provider repair proposal created no-write
- no automatic repair apply after command failure
- stdout/stderr budget and redaction enforced
- Session / Continue summary includes command and repair facts
- result-contract compatibility

Do not run real-provider gates by default.

### 10. Coupling guard

Do not implement command verification / repair bridge inline in `runMvpIntegratedFlow.ts`.

Desired flow:

- Agent Plan / proposal provides verification command candidate
- verification command facade plans and runs command
- result classifier produces verification evidence
- repair bridge invokes Route 185 repair loop
- Result Surface / Session parity handle output

No broad agent-loop rewrite.

### 11. Docs update

Update long-lived docs only where status changes:

- implementation manifest / recipes if new facades/flows are added
- foundation risk register if verification/repair loop risk changes
- module backlog if route status is tracked
- runtime receipt / tool-runtime flow docs only if contract changes

No large architecture doc.

## Boundaries

Hard boundaries:

- no arbitrary shell execution
- no broad command allowlist expansion
- no provider/model call during command execution
- no default real-provider call
- no automatic repair mutation
- no mutation from repair proposal alone
- no new writer
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

- verification command plan tests
- verification command runner tests
- verification command result tests
- failure classifier tests
- repair bridge tests
- runtime receipt projection tests if touched
- verification planner/result regression tests
- repair loop regression tests
- context-aware provider regression tests if touched
- Result Surface tests if touched
- Session / Continue tests if touched
- verifier closeout tests if touched
- context planning verifier if touched
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- JSON parse guard if manifest changes
- package guard if package files are touched unexpectedly
- `rtk git diff --check`
- `rtk git status --short --branch`

Do not run real-provider gates unless this route explicitly adds an opt-in dry-run path.

## Final report

Include:

1. What changed
2. Current verification command path audit
3. Verification command plan behavior
4. Command execution bridge behavior
5. Runtime receipt behavior
6. Failure classifier behavior
7. Repair bridge behavior
8. Result Surface behavior
9. Session / Continue behavior
10. Verifier coverage
11. Coupling guard
12. Validation
13. Remaining risks
14. Next route recommendation
