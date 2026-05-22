# Route 195: Anchored proposal runtime eval

## Goal

Activate anchored provider/generated proposals through the task lifecycle runtime path and add an eval gate for proposal quality.

Routes 190-194 established:

- task lifecycle loop
- task-driven context acquisition
- evidence-grounded analysis calibration
- plan quality gate
- real-provider proposal dry-run gate
- provider prompt audit
- provider output validator
- anchor quality classifier
- provider proposal anchoring
- review/apply bridge
- exact hunk-set apply

Route 195 should now prove the full read -> analyze -> plan -> proposal -> anchor -> review/apply readiness path is reachable from real prompts and measurable by focused eval gates.

This route owns:

- anchored proposal runtime activation
- lifecycle-to-provider-dry-run handoff
- fake-provider anchored proposal eval
- optional opt-in real-provider dry-run smoke that safely skips when unavailable
- proposal quality scorecard
- anchored proposal review surface parity
- exact handoff readiness evidence
- no-write default behavior
- Result Surface / Session / Continue / verifier coverage

This route should make anchored proposals operational, not just available as isolated modules.

## Expected outcome

By the end of Route 195:

1. A normal non-trivial edit proposal prompt can create a lifecycle, context evidence, analysis brief, execution plan, and provider proposal readiness.
2. The runtime path can invoke fake-provider dry-run deterministically for tests.
3. Provider output can be validated, anchored, and converted into a review-ready anchored proposal.
4. Exact anchored hunks can be marked handoff-ready for existing proposal review/apply flow.
5. Non-exact / fuzzy / broad / ambiguous / stale / conflicting outputs remain no-write with actionable reasons.
6. Terminal output can explain proposal dry-run, anchoring, quality, review requirement, and next action.
7. Session / Continue can resume from anchored proposal review-required state.
8. Harness scorecard can report context quality, analysis quality, prompt audit, output validation, anchor quality, proposal readiness, and failure taxonomy.
9. Optional real-provider dry-run smoke exists only if existing provider infrastructure supports it and skips safely when unavailable.
10. No provider-generated mutation, automatic apply, fuzzy apply, broad edit, new writer, or default real-provider call is introduced.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/foundation/foundation-risk-register.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/architecture/workspace-file-context-contract.md`

Read only if touched:

- provider boundary docs
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/session-substrate-seams.md`
- verifier module docs
- future edit contract if proposal/apply status changes materially

Do not read browser docs, GitNexus, pi, or old route docs unless code directly requires them.

## Reference scan

Use references only for runtime proposal activation, no-write review flow, eval gate, and proposal quality reporting.

Primary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/gemini-cli`

Secondary, only if needed:

- `/home/wang/projects/pi`
- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`

Do not read GitNexus by default. Route 189 already absorbed graph/query patterns.

Budget:

- ClaudeCode: max 8 files
- opencode: max 8 files
- gemini-cli: max 8 files
- optional pi / Inspect AI / mini-swe-agent: max 6 files total

Focus:

- prompt-to-proposal runtime activation
- proposal review/no-write surface
- eval/report shape
- provider dry-run gating
- output validation and quality scoring
- replay-safe proposal evidence

Do not copy:

- autonomous apply loops
- direct provider-generated mutation
- broad patch engines
- hidden chain-of-thought persistence
- new CLI/TUI systems
- default real-provider behavior
- external dependencies

## Owner modules

Primary owners:

- Agent Loop
- Provider / Model
- Edit / Patch proposal layer
- Harness / Eval
- Result Surface

Collaborating owners:

- Workspace / File Context
- Agent Loop Planning
- Session / Continue
- Permission / Policy

Likely new files:

- `packages/ts-shell/src/orchestration/anchoredProposalActivation.ts`
- `packages/ts-shell/src/orchestration/anchoredProposalRuntime.ts`
- `packages/ts-shell/src/orchestration/anchoredProposalEval.ts`
- `packages/ts-shell/src/orchestration/anchoredProposalScorecard.ts`
- `packages/ts-shell/src/orchestration/anchoredProposalActivation.test.ts`
- `packages/ts-shell/src/orchestration/anchoredProposalRuntime.test.ts`
- `packages/ts-shell/src/orchestration/anchoredProposalEval.test.ts`
- `packages/ts-shell/src/orchestration/anchoredProposalScorecard.test.ts`

Likely touched files:

- `taskLifecycleActivation.ts`
- `taskLifecycleRouter.ts`
- `taskLifecycleHandoff.ts`
- `taskExecutionPlan.ts`
- `analysisQualityGate.ts`
- `planQualityGate.ts`
- `contextAwareProviderEdit.ts`
- `contextAwareProviderPrompt.ts`
- `realProviderProposalGate.ts`
- `realProviderProposalDryRun.ts`
- `providerPromptAudit.ts`
- `providerOutputValidator.ts`
- `providerAnchorQuality.ts`
- `providerProposalAnchors.ts`
- `providerAnchorMatcher.ts`
- `providerAnchorConflict.ts`
- `providerAnchoredProposal.ts`
- `providerAnchoringResult.ts`
- `providerDryRunResult.ts`
- `editProposalReview.ts`
- `editProposalSelection.ts`
- `editProposalApply.ts`
- `proposalHunkSetPlan.ts`
- `proposalHunkSetRoute.ts`
- `harnessTrace.ts`
- `harnessScorecard.ts`
- `harnessFailureTaxonomy.ts`
- `sessionResultParity.ts`
- `continuationEvidenceParity.ts`
- `stoppedSessionContinuity.ts`
- `sessionResumeContextBuilder.ts`
- `scripts/verify-context-planning.mjs`
- `scripts/verify-edit-capability-closeout.mjs`

Touch `runMvpIntegratedFlow.ts` only as a thin composition point if absolutely required.

## Implementation tasks

### 1. Audit current anchored proposal reachability

Before changing behavior, determine:

- whether real prompt paths can currently create anchored provider proposals
- whether fake-provider anchored proposal path is reachable outside isolated unit tests
- whether lifecycle / analysis / plan quality gates are enforced before proposal dry-run
- whether anchored proposals reach review-required terminal output
- whether handoff-ready exact anchors are preserved for review/apply
- whether Session / Continue can resume anchored proposal state
- what verifier currently proves about provider proposal dry-run, anchoring, and no-write behavior

Summarize this audit in the final report.

### 2. Anchored proposal activation

Add `anchoredProposalActivation.ts`.

Activation inputs:

- task lifecycle id
- task intent
- context / code graph ids
- analysis brief id
- analysis quality id
- execution plan id
- plan quality id
- explicit dry-run mode: fake / real-opt-in / none
- provider readiness
- redaction status

Activation decisions:

- `activate-fake-dry-run`
- `activate-real-dry-run-if-opted-in`
- `stop-missing-lifecycle`
- `stop-missing-analysis`
- `stop-low-analysis-quality`
- `stop-low-plan-quality`
- `stop-no-dry-run-mode`
- `stop-provider-not-configured`
- `stop-redaction-risk`
- `stop-unsupported`

Activation must not grant mutation authority.

### 3. Runtime anchored proposal facade

Add `anchoredProposalRuntime.ts`.

Runtime flow:

- lifecycle / context / analysis / plan quality checks
- provider dry-run gate
- provider prompt audit
- fake-provider or optional real-provider dry-run
- output validation
- anchor extraction
- anchor matching
- conflict detection
- anchored proposal manifest
- review-required result
- scorecard / trace facts

Default path must use fake provider in deterministic tests.

Real-provider dry-run must require existing opt-in controls and skip safely when unavailable.

### 4. Proposal quality eval

Add `anchoredProposalEval.ts`.

Eval should score:

- lifecycle readiness
- context sufficiency
- analysis quality
- plan quality
- prompt audit status
- provider output validity
- anchor extraction result
- anchor match quality
- conflict status
- review readiness
- handoff readiness
- no-write compliance

Use deterministic pass/warn/fail/skip.

No model-based scoring.

### 5. Anchored proposal scorecard

Add `anchoredProposalScorecard.ts`.

Scorecard should report:

- proposal id
- anchored proposal id
- dry-run id
- prompt audit id
- output validation id
- anchor quality id
- exact / partial / unsupported counts
- failure class
- next action
- no-write status

Integrate with existing harness scorecard where clean.

### 6. Runtime prompt integration

Update real prompt path only through thin composition.

Allowed behavior:

- for explicit proposal/dry-run prompts, activate anchored proposal runtime
- for non-trivial edit proposal prompts, lifecycle can stop with "proposal dry-run available / requires opt-in or fake eval"
- for tests, fake-provider path can run deterministically
- terminal shows review-required/no-write anchored proposal when activated

Disallowed behavior:

- default real-provider call
- automatic apply
- provider call during apply
- new writer
- broad runMvp branching

### 7. Review/apply readiness integration

Existing review/apply bridge should consume anchored proposal evidence.

Allowed:

- exact anchored proposal -> review-required / handoff-ready
- confirmed exact anchored proposal -> existing hunk-set apply path
- partial/fuzzy/broad/ambiguous/stale/conflict -> no-write

No new writer and no direct apply from dry-run.

### 8. Result Surface integration

Terminal outcomes:

- anchored proposal runtime activated
- fake dry-run proposal created
- real dry-run skipped/not configured/not opted in
- prompt audit failed
- provider output invalid
- anchor extraction failed
- exact anchors review-ready
- partial anchors review-only
- ambiguous/stale/conflicting anchors stopped
- handoff-ready proposal no-write
- confirmed apply only if existing explicit apply path is invoked

Output should show:

- task/lifecycle id
- provider safe label or fake provider label
- prompt audit summary
- output validation summary
- anchor quality
- scorecard summary
- review requirement
- no-write status

No raw provider output or raw file dumps.

### 9. Session / Continue integration

Session / Continue should preserve:

- activation id
- dry-run id
- anchored proposal id
- anchor quality
- output validation
- prompt audit summary
- scorecard summary
- review requirement
- handoff readiness
- do-next text
- no-write status

`/continue` should explain:

- whether dry-run was fake or real-opt-in
- whether provider was called
- whether output was anchored
- why anchoring failed or succeeded
- what review/confirmation is needed
- whether any mutation occurred

### 10. Verifier coverage

Strengthen focused verifier coverage.

Required deterministic coverage:

- lifecycle prompt activates fake anchored proposal runtime
- missing analysis blocks activation
- low plan quality blocks activation
- no dry-run mode stops no-write
- fake provider exact output becomes review-ready anchored proposal
- fake provider partial output remains review-only
- fake provider fuzzy/broad/malformed output remains stopped/no-write
- exact anchored proposal carries handoff-ready evidence but no mutation authority
- confirmed exact anchored proposal can reach existing review/apply handoff in focused tests
- scorecard records prompt audit / validation / anchoring facts
- Session / Continue preserves anchored proposal state
- runMvp coupling guard passes
- raw provider output/full file content excluded
- result-contract compatibility

Optional opt-in real-provider smoke:

- If an existing opt-in real-provider dry-run mechanism exists, include a command/test that skips when unavailable.
- It must not run by default.
- It must not read private config manually.
- It must never mutate files.

### 11. Coupling guard

Do not implement anchored proposal runtime inline in `runMvpIntegratedFlow.ts`.

Desired flow:

- task lifecycle activation
- anchored proposal activation facade
- provider dry-run facade
- anchoring facades
- review/apply bridge
- Result Surface / Session parity
- Harness scorecard

No broad agent-loop rewrite.

### 12. Docs update

Update long-lived docs only where status changes:

- implementation manifest / recipes if new facades/flows are added
- foundation risk register if anchored proposal runtime risk changes
- module backlog if route status is tracked
- future edit contract only if proposal/apply status changes materially

No large architecture doc.

## Boundaries

Hard boundaries:

- no mutation from provider output alone
- no unconfirmed apply
- no direct fuzzy apply
- no broad/generated direct mutation
- no provider call by default
- no provider call during apply
- no manual private provider config reads
- no new writer
- no command execution behavior change
- no command allowlist expansion
- no browser work
- no LSP / embeddings / full-repo index
- no persistent Graph DB / MCP backend
- no hidden chain-of-thought persistence
- no workspace authority weakening
- no Result Surface bypass
- no transcript schema change
- no CLI redesign unless an existing-pattern opt-in dry-run surface is unavoidable
- no package dependency changes
- no broad `runMvpIntegratedFlow.ts` refactor

## Validation

Run focused validation based on touched files:

- anchored proposal activation tests
- runtime tests
- eval tests
- scorecard tests
- provider gate / dry-run regression tests
- prompt audit regression tests
- output validator regression tests
- anchor extraction/matcher/conflict regression tests
- anchored proposal regression tests
- proposal review/apply regression tests
- hunk-set/exact hunk regression tests if touched
- Plan Quality regression tests if touched
- Session / Continue tests if touched
- Harness scorecard/failure taxonomy tests if touched
- context-planning verifier
- edit closeout verifier if touched
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
2. Current anchored proposal reachability audit
3. Activation behavior
4. Runtime flow behavior
5. Eval / scorecard behavior
6. Review/apply readiness behavior
7. Result Surface behavior
8. Session / Continue behavior
9. Verifier coverage
10. Optional opt-in real-provider smoke status if added
11. Coupling guard
12. Validation
13. Remaining risks
14. Next route recommendation
