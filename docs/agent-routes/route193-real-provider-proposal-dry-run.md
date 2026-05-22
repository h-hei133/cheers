# Route 193: Real-provider proposal dry-run

## Goal

Add an opt-in real-provider proposal dry-run gate for context-aware task lifecycle edit proposals, without mutation.

Routes 181-192 established:

- targeted context packets
- bounded context graph and code graph trace
- Agent Plan and Plan Quality
- harness trace / scorecard / failure taxonomy
- task lifecycle loop
- task-driven context acquisition
- evidence-grounded analysis calibration
- context-aware provider proposal facades
- proposal review / confirmation / exact hunk-set apply
- verification command repair loop

The remaining gap is that provider proposal behavior is mostly fake/stub tested. Route 193 should introduce a controlled, opt-in, no-write real-provider dry-run gate that validates whether real LLM output can produce reviewable, anchored, redacted proposals under the existing lifecycle gates.

This route owns:

- real-provider proposal dry-run gate
- lifecycle/context/analysis/plan-quality preconditions
- provider prompt budget and redaction audit
- provider output validation
- proposal anchor quality classification
- no-write result surface
- session/continue evidence
- harness scorecard integration
- deterministic fake-provider tests plus opt-in dry-run path

This route must not introduce provider-generated mutation.

## Expected outcome

By the end of Route 193:

1. Real provider proposal generation is reachable only through explicit opt-in dry-run.
2. Dry-run requires lifecycle id, analysis brief, plan quality, context/code graph evidence, and redaction status.
3. Missing or low-quality context stops before provider call.
4. Provider prompt/context is budgeted, redacted, and auditable.
5. Provider output is normalized into existing proposal manifest shape.
6. Provider output validator classifies exact anchors, partial anchors, fuzzy/unanchored output, broad output, unsafe output, and malformed output.
7. All real-provider dry-run results remain no-write and mutationAuthority:not-granted.
8. Session / Continue can explain provider dry-run status and proposal readiness.
9. Harness scorecard records prompt readiness, output validity, anchor quality, redaction, and failure class.
10. Default tests remain deterministic and do not require real provider credentials.
11. No private provider config is read manually.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/foundation/foundation-risk-register.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/architecture/workspace-file-context-contract.md`

Read only if touched:

- provider readiness / provider boundary docs
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/runtime-receipt-contract.md`
- `docs/architecture/session-substrate-seams.md`
- verifier module docs

Do not read browser docs, GitNexus, or old route docs unless code directly requires them.
Read pi only if harness scorecard/report shape needs more reference.

## Reference scan

Use references only for provider prompt boundary, proposal dry-run, output validation, no-write review, and scoring/report shape.

Primary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/gemini-cli`

Secondary:

- `/home/wang/projects/pi`
- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`

Budget:

- ClaudeCode: max 10 files
- opencode: max 10 files
- gemini-cli: max 10 files
- pi + Inspect AI + mini-swe-agent: max 8 files total

Focus:

- provider/model call boundary
- prompt context budgeting
- tool/result separation
- no-write proposal review
- malformed provider output handling
- scoring/report fields
- opt-in real-provider test gating

Do not copy:

- default real-provider behavior
- hidden provider config loading
- automatic edit apply
- autonomous repair loops
- broad patch engines
- new CLI/TUI systems
- external dependencies

## Owner modules

Primary owners:

- Provider / Model
- Edit / Patch proposal layer
- Agent Loop Planning
- Harness / Eval
- Result Surface

Collaborating owners:

- Workspace / File Context
- Session / Continue
- Permission / Policy

Likely new files:

- `packages/ts-shell/src/orchestration/realProviderProposalGate.ts`
- `packages/ts-shell/src/orchestration/realProviderProposalDryRun.ts`
- `packages/ts-shell/src/orchestration/providerPromptAudit.ts`
- `packages/ts-shell/src/orchestration/providerOutputValidator.ts`
- `packages/ts-shell/src/orchestration/providerAnchorQuality.ts`
- `packages/ts-shell/src/orchestration/providerDryRunResult.ts`
- `packages/ts-shell/src/orchestration/realProviderProposalGate.test.ts`
- `packages/ts-shell/src/orchestration/providerPromptAudit.test.ts`
- `packages/ts-shell/src/orchestration/providerOutputValidator.test.ts`
- `packages/ts-shell/src/orchestration/providerAnchorQuality.test.ts`
- `packages/ts-shell/src/orchestration/providerDryRunResult.test.ts`

Likely touched files:

- `providerModule.ts`
- `providerReadiness.ts`
- `providerOutcomeProjection.ts`
- `providerEditContext.ts`
- `providerEditPlanner.ts`
- `providerEditProposal.ts`
- `providerEditResult.ts`
- `contextAwareProviderEdit.ts`
- `contextAwareProviderPrompt.ts`
- `contextAwareProviderProposal.ts`
- `contextAwareProviderResult.ts`
- `taskLifecycle.ts`
- `analysisBrief.ts`
- `analysisBriefCalibration.ts`
- `analysisQualityGate.ts`
- `taskExecutionPlan.ts`
- `planQuality.ts`
- `planQualityGate.ts`
- `harnessTrace.ts`
- `harnessScorecard.ts`
- `harnessFailureTaxonomy.ts`
- `sessionResultParity.ts`
- `continuationEvidenceParity.ts`
- `stoppedSessionContinuity.ts`
- `sessionResumeContextBuilder.ts`
- `scripts/verify-context-planning.mjs`
- `scripts/verify-edit-capability-closeout.mjs` only if proposal/anchor verifier coverage is added

Touch `runMvpIntegratedFlow.ts` only as a thin composition point if absolutely required.

## Implementation tasks

### 1. Audit current provider proposal path

Before changing behavior, determine:

- how fake provider proposal currently works
- whether any real-provider proposal gate exists
- how provider readiness / opt-in / not-configured states are represented
- how provider prompt/context is budgeted and redacted
- how provider output is validated today
- how proposal exact-readiness is classified
- how Session / Continue summarizes provider proposal state
- what verifier proves about no-write provider proposals

Summarize this audit in the final report.

### 2. Real-provider proposal gate

Add `realProviderProposalGate.ts`.

Gate inputs:

- lifecycle id
- analysis brief id
- analysis quality id
- plan quality id
- context packet id
- context graph / code graph trace id
- task execution plan id
- provider readiness
- explicit dry-run opt-in flag
- redaction status

Gate decisions:

- `allow-dry-run`
- `stop-no-opt-in`
- `stop-provider-not-configured`
- `stop-provider-unsupported`
- `stop-missing-lifecycle`
- `stop-missing-analysis`
- `stop-low-analysis-quality`
- `stop-low-plan-quality`
- `stop-missing-context`
- `stop-context-over-budget`
- `stop-redaction-risk`
- `stop-unsupported`

Gate must never grant mutation authority.

### 3. Provider prompt audit

Add `providerPromptAudit.ts`.

Audit should classify:

- context budget status
- target/context coverage
- analysis evidence coverage
- hidden-content exclusion
- secret redaction
- provider config exclusion
- prompt size class
- omitted context reasons
- verification expectation presence
- safety constraints presence

Audit must confirm prompt does not include:

- provider credentials
- private config paths
- hidden reasoning
- raw unbounded files
- unbudgeted stdout/stderr
- secrets
- browser/page content
- unrelated workspace dumps

### 4. Dry-run executor facade

Add `realProviderProposalDryRun.ts`.

Behavior:

- uses existing provider module / provider call boundary if opt-in gate allows
- supports deterministic fake provider path for tests
- never writes files
- never calls provider during apply
- never applies output
- normalizes output into proposal manifest or invalid-output result
- records dry-run evidence id

If real provider is unavailable, return stopped/actionable state.

Do not read `/home/wang/.private-agents-real` manually.

### 5. Provider output validator

Add `providerOutputValidator.ts`.

Classify provider output:

- `valid-exact-single-target`
- `valid-exact-hunk-set`
- `partial-anchor`
- `unanchored-generated`
- `fuzzy-output`
- `broad-refactor-output`
- `malformed-output`
- `unsafe-output`
- `empty-output`
- `over-budget-output`

Validation should check:

- target binding
- exact old/new anchors
- hunk count
- target count
- raw content risk
- unsafe commands or destructive suggestions
- unsupported output shape

Invalid output remains no-write and review-only/stopped.

### 6. Anchor quality

Add `providerAnchorQuality.ts`.

Anchor quality dimensions:

- target specificity
- old-text exactness
- new-text boundedness
- match uniqueness
- hunk conflict risk
- multi-file scope
- verification expectation
- review readiness

Levels:

- `exact-ready`
- `review-only`
- `needs-anchoring`
- `low-confidence`
- `unsupported`
- `unsafe`

Anchor quality feeds Plan Quality / Harness Scorecard but does not grant mutation authority.

### 7. Dry-run result surface

Add `providerDryRunResult.ts`.

Terminal outcomes:

- dry-run allowed, proposal created
- dry-run stopped no opt-in
- provider not configured / unsupported
- missing lifecycle / analysis / context
- prompt audit failed
- provider invalid output
- proposal review-required
- exact-ready proposal no-write
- unsafe output blocked
- anchor quality low

Output should show:

- provider safe label
- lifecycle id
- analysis brief id
- plan quality id
- prompt audit summary
- output validation summary
- anchor quality
- review/next action
- no-write status

No raw provider output dumps unless already safely summarized.

### 8. Proposal manifest integration

Update provider/context-aware proposal manifest to include:

- dry-run id
- prompt audit id
- output validation id
- anchor quality id
- lifecycle id
- analysis brief id
- plan quality id
- mutationAuthority:not-granted

Exact-ready output may become handoff-ready, but actual apply still requires existing review/confirmation/hunk-set path.

### 9. Session / Continue integration

Session / Continue should preserve:

- dry-run id
- provider safe label
- gate decision
- prompt audit summary
- output validation summary
- anchor quality
- proposal id
- review requirement
- missing facts
- do-next text
- no-write status

`/continue` should explain:

- whether provider was called
- why provider was blocked
- what prompt/context was used at summary level
- whether output was exact-ready or review-only
- what confirmation or anchoring is needed next

### 10. Harness / scorecard integration

Harness trace / scorecard should record:

- dry-run gate decision
- prompt audit status
- provider output validation
- anchor quality
- proposal readiness
- failure taxonomy
- redaction status
- no-write status

Failure taxonomy should include:

- provider dry-run not opted in
- provider prompt audit failed
- provider output malformed
- provider output unanchored
- provider output unsafe
- provider output over budget
- anchor quality low

### 11. Verifier coverage

Strengthen focused verifier coverage.

Required deterministic coverage:

- no opt-in stops before provider call
- provider not configured stopped
- missing lifecycle stops
- missing analysis stops
- low plan quality stops
- prompt audit redacts credentials/secrets/raw file dumps
- fake provider exact proposal produces dry-run proposal no-write
- fake provider unanchored output is review-only/no-write
- fake provider malformed output is stopped/no-write
- unsafe provider output is blocked
- anchor quality appears in proposal/session/scorecard
- dry-run result never grants mutation authority
- result-contract compatibility

Optional opt-in dry-run:

- If existing real-provider opt-in smoke infrastructure exists, add a dry-run-only command that skips safely when not configured.
- It must never be part of default validation.
- It must not read private config manually.
- It must not mutate files.

### 12. Coupling guard

Do not implement provider dry-run logic inline in `runMvpIntegratedFlow.ts`.

Desired flow:

- lifecycle / analysis / plan quality facts
- real-provider proposal gate
- prompt audit
- provider module boundary
- output validator
- proposal manifest
- Result Surface / Session parity
- harness scorecard

No broad agent-loop rewrite.

### 13. Docs update

Update long-lived docs only where status changes:

- implementation manifest / recipes if new facades/flows are added
- foundation risk register if real-provider proposal risk changes
- module backlog if route status is tracked
- provider boundary docs only if actual provider contract changes

No large architecture doc.

## Boundaries

Hard boundaries:

- no mutation behavior change
- no edit capability expansion
- no provider call by default
- no provider call without explicit dry-run opt-in
- no provider call during apply
- no manual private provider config reads
- no automatic proposal apply
- no command execution behavior change
- no command allowlist expansion
- no browser work
- no LSP / embeddings / full-repo index
- no persistent Graph DB / MCP backend
- no hidden chain-of-thought persistence
- no session publishing / external dataset
- no workspace authority weakening
- no Result Surface bypass
- no transcript schema change
- no CLI redesign unless adding an already-patterned opt-in dry-run flag is unavoidable
- no package dependency changes
- no broad `runMvpIntegratedFlow.ts` refactor

## Validation

Run focused validation based on touched files:

- real-provider gate tests
- prompt audit tests
- output validator tests
- anchor quality tests
- dry-run result tests
- provider proposal regression tests
- context-aware provider regression tests
- lifecycle / analysis / plan quality regression tests
- Session / Continue tests if touched
- Harness scorecard/failure taxonomy tests if touched
- context-planning verifier
- edit closeout verifier only if proposal/edit verifier files are touched
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- JSON parse guard if manifest changes
- package guard if package files are touched unexpectedly
- `rtk git diff --check`
- `rtk git status --short --branch`

Do not run real-provider gates by default.

## Final report

Include:

1. What changed
2. Current provider proposal audit
3. Real-provider gate behavior
4. Prompt audit behavior
5. Dry-run executor behavior
6. Output validator behavior
7. Anchor quality behavior
8. Proposal manifest integration
9. Session / Continue behavior
10. Harness / scorecard integration
11. Verifier coverage
12. Optional opt-in dry-run status if added
13. Coupling guard
14. Validation
15. Remaining risks
16. Next route recommendation
