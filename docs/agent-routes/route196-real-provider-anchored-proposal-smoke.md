# Route 196: Real-provider anchored proposal smoke

## Goal

Add an explicit opt-in real-provider anchored proposal smoke path and a deterministic proposal-quality corpus, without mutation.

Routes 193-195 established:

- real-provider proposal dry-run gate
- prompt audit
- provider output validator
- anchor quality classifier
- provider/generated proposal anchoring
- anchored proposal runtime activation
- fake-provider anchored proposal eval
- review/apply readiness evidence
- scorecard / failure taxonomy
- no-write default behavior

Route 195 intentionally did not add a real-provider smoke surface because no anchored-proposal-specific safe-skip command surface existed.

Route 196 should add that missing evaluation layer:

- explicit opt-in real-provider anchored proposal smoke
- safe skip when provider is unavailable or not configured
- no private config manual reads
- no default real-provider call
- no mutation / no apply
- deterministic fake-provider proposal-quality corpus
- shared fake/real proposal quality report
- prompt audit / output validation / anchoring / scorecard integration
- verifier coverage proving default-safe behavior

This route should let the project measure real LLM proposal quality under the existing read -> analyze -> plan -> proposal -> anchor gates.

## Expected outcome

By the end of Route 196:

1. There is an anchored-proposal-specific opt-in real-provider smoke entrypoint.
2. The smoke path safely skips when provider readiness or opt-in is missing.
3. The smoke path never mutates files and never applies proposals.
4. The smoke path never reads private provider config manually.
5. The smoke path uses the existing lifecycle, analysis quality, plan quality, prompt audit, output validator, anchoring, and scorecard gates.
6. Deterministic fake-provider corpus cases measure exact, partial, fuzzy, broad, malformed, unsafe, stale, and ambiguous proposal outputs.
7. Fake and real dry-run results share a common proposal quality report shape.
8. Harness scorecard records provider-called status, skip reason, prompt audit, output validation, anchor quality, no-write status, and failure taxonomy.
9. Session / Continue can summarize real-provider smoke results safely.
10. Default validation remains deterministic and does not require real provider credentials.

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
- verifier module docs
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/session-substrate-seams.md`
- future edit contract if proposal/apply status changes materially

Do not read browser docs, GitNexus, or old route docs unless code directly requires them.
Read pi or Inspect AI only if proposal-quality report / scorecard shape needs reference.

## Reference scan

Use references only for provider dry-run gating, eval/report shape, proposal quality scoring, and no-write smoke behavior.

Primary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/gemini-cli`

Secondary, only if needed:

- `/home/wang/projects/pi`
- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`

Budget:

- ClaudeCode: max 8 files
- opencode: max 8 files
- gemini-cli: max 8 files
- optional pi / Inspect AI / mini-swe-agent: max 6 files total

Focus:

- opt-in model/provider test gates
- dry-run / no-write proposal surfaces
- output validation
- eval report shape
- prompt/context budget audit
- failure taxonomy / scorecard

Do not copy:

- default real-provider execution
- hidden provider config loading
- provider-generated mutation
- autonomous apply loops
- broad patch engines
- new CLI/TUI systems
- external dependencies

## Owner modules

Primary owners:

- Provider / Model
- Harness / Eval
- Edit / Patch proposal layer
- Result Surface

Collaborating owners:

- Agent Loop Planning
- Workspace / File Context
- Session / Continue
- Permission / Policy

Likely new files:

- `packages/ts-shell/src/orchestration/anchoredProviderSmoke.ts`
- `packages/ts-shell/src/orchestration/anchoredProviderSmokeGate.ts`
- `packages/ts-shell/src/orchestration/proposalQualityCorpus.ts`
- `packages/ts-shell/src/orchestration/proposalQualityReport.ts`
- `packages/ts-shell/src/orchestration/providerSmokeResult.ts`
- `packages/ts-shell/src/orchestration/anchoredProviderSmoke.test.ts`
- `packages/ts-shell/src/orchestration/anchoredProviderSmokeGate.test.ts`
- `packages/ts-shell/src/orchestration/proposalQualityCorpus.test.ts`
- `packages/ts-shell/src/orchestration/proposalQualityReport.test.ts`
- `packages/ts-shell/src/orchestration/providerSmokeResult.test.ts`

Likely touched files:

- `anchoredProposalActivation.ts`
- `anchoredProposalRuntime.ts`
- `anchoredProposalEval.ts`
- `anchoredProposalScorecard.ts`
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
- `providerModule.ts`
- `providerReadiness.ts`
- `providerOutcomeProjection.ts`
- `harnessTrace.ts`
- `harnessScorecard.ts`
- `harnessFailureTaxonomy.ts`
- `sessionResultParity.ts`
- `continuationEvidenceParity.ts`
- `stoppedSessionContinuity.ts`
- `sessionResumeContextBuilder.ts`
- `scripts/verify-context-planning.mjs`
- `scripts/verify-edit-capability-closeout.mjs`

Touch `runMvpIntegratedFlow.ts` only if needed for a thin explicit smoke surface. Prefer verifier/script entrypoints over default runtime path.

## Implementation tasks

### 1. Audit current provider smoke gap

Before changing behavior, determine:

- whether any real-provider dry-run or smoke entrypoint exists
- whether it is anchored-proposal-specific
- how provider readiness / opt-in / not-configured states are represented
- how default validations avoid provider calls today
- how fake-provider anchored runtime eval works
- how prompt audit / output validation / anchoring / scorecard are currently wired
- what verifier currently proves about default no-provider behavior

Summarize this audit in the final report.

### 2. Anchored provider smoke gate

Add `anchoredProviderSmokeGate.ts`.

Gate inputs:

- explicit smoke opt-in flag
- provider readiness
- lifecycle id
- analysis brief id
- analysis quality id
- plan quality id
- prompt audit status
- dry-run mode
- redaction status

Gate decisions:

- `allow-real-provider-smoke`
- `allow-fake-provider-corpus`
- `skip-no-opt-in`
- `skip-provider-not-configured`
- `skip-provider-unsupported`
- `skip-provider-not-ready`
- `stop-missing-lifecycle`
- `stop-missing-analysis`
- `stop-low-analysis-quality`
- `stop-low-plan-quality`
- `stop-prompt-audit-failed`
- `stop-redaction-risk`
- `stop-unsupported`

Gate must never grant mutation authority.

### 3. Proposal quality corpus

Add `proposalQualityCorpus.ts`.

Corpus should define deterministic fake-provider cases:

- exact single-target output
- exact multi-hunk output
- partial-anchor output
- unanchored generated output
- fuzzy output
- broad refactor output
- malformed output
- unsafe output
- stale context output
- ambiguous target output
- conflicting hunk output

Each case should include:

- corpus case id
- task intent label
- expected output validation
- expected anchor quality
- expected review/apply readiness
- expected no-write status
- expected failure taxonomy if any

No raw secrets or large file dumps.

### 4. Proposal quality report

Add `proposalQualityReport.ts`.

Report should summarize:

- run id
- mode: fake corpus / real provider smoke
- provider safe label
- case id if applicable
- prompt audit status
- output validation status
- anchor extraction status
- match/conflict status
- anchor quality
- proposal readiness
- handoff readiness
- no-write status
- failure class
- scorecard status

Use deterministic pass/warn/fail/skip.

### 5. Anchored provider smoke runner

Add `anchoredProviderSmoke.ts`.

Behavior:

- fake corpus mode runs deterministic corpus through existing dry-run / validation / anchoring flow
- real-provider smoke mode runs only when explicit opt-in and provider readiness allow it
- real-provider smoke uses existing provider boundary
- real-provider smoke skips safely when unavailable
- no file writes
- no apply
- no provider call during apply
- no private config manual reads
- no raw provider output dumps

### 6. Smoke result surface

Add `providerSmokeResult.ts`.

Terminal outcomes:

- fake corpus passed / warned / failed
- real-provider smoke skipped no opt-in
- real-provider smoke skipped provider unavailable
- real-provider smoke proposal created no-write
- real-provider smoke output invalid
- prompt audit failed
- anchoring failed / partial / exact-ready
- unsafe output blocked
- no-write compliance confirmed

Output should show:

- mode
- provider safe label
- skip reason if any
- prompt audit summary
- output validation summary
- anchor quality
- proposal readiness
- scorecard status
- no-write status

No raw provider output or raw file dumps.

### 7. Harness / scorecard integration

Harness scorecard should record:

- smoke mode
- provider-called status
- skip reason
- corpus case id
- prompt audit status
- output validation status
- anchoring status
- anchor quality
- no-write compliance
- failure taxonomy
- next action

Failure taxonomy should include:

- smoke no opt-in
- smoke provider unavailable
- smoke prompt audit failed
- smoke output invalid
- smoke anchoring failed
- smoke unsafe output
- smoke exact-ready no-write
- smoke corpus regression

### 8. Session / Continue integration

Session / Continue should preserve:

- smoke run id
- mode
- provider safe label
- skip reason
- proposal id if created
- anchored proposal id if created
- quality report id
- scorecard id
- anchor quality
- no-write status
- do-next text

`/continue` should explain:

- whether this was fake corpus or real provider smoke
- whether provider was called
- why it skipped or stopped
- whether proposal was anchored
- what review/confirmation would be needed next
- whether any mutation occurred

### 9. Verifier coverage

Strengthen verifier coverage.

Required deterministic coverage:

- default validation does not call provider
- no opt-in real-provider smoke skips no provider call
- provider not configured skips safely
- fake corpus exact case produces exact-ready no-write
- fake corpus partial case produces review-only no-write
- fake corpus fuzzy/broad/malformed/unsafe cases remain stopped/no-write
- quality report records validation / anchoring / no-write status
- scorecard records provider-called false for skipped/default cases
- Session / Continue preserves smoke summary
- mutationAuthority remains not-granted
- raw provider output/full file content excluded
- result-contract compatibility

Optional real-provider smoke:

- Add an opt-in command or verifier flag only if it can safely skip when unavailable.
- It must not run in default validation.
- It must not read private provider config manually.
- It must never mutate files.

### 10. Coupling guard

Do not implement smoke logic inline in `runMvpIntegratedFlow.ts`.

Preferred flow:

- smoke verifier / explicit smoke facade
- smoke gate
- existing provider dry-run boundary
- existing prompt audit / output validator / anchoring
- quality report
- Result Surface / Session parity
- Harness scorecard

No broad agent-loop rewrite.

### 11. Docs update

Update long-lived docs only where status changes:

- implementation manifest / recipes if new facades/flows are added
- foundation risk register if provider smoke risk changes
- module backlog if route status is tracked
- provider boundary docs only if actual provider contract changes

No large architecture doc.

## Boundaries

Hard boundaries:

- no provider call by default
- no provider call without explicit smoke opt-in
- no manual private provider config reads
- no mutation from provider output
- no apply in smoke path
- no unconfirmed apply
- no provider call during apply
- no direct fuzzy apply
- no broad/generated direct mutation
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
- no CLI redesign unless an existing-pattern opt-in smoke flag is unavoidable
- no package dependency changes
- no broad `runMvpIntegratedFlow.ts` refactor

## Validation

Run focused validation based on touched files:

- smoke gate tests
- fake corpus tests
- quality report tests
- smoke runner tests
- smoke result tests
- provider dry-run regression tests
- prompt audit regression tests
- output validator regression tests
- anchor quality / anchoring regression tests
- anchored proposal runtime regression tests
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

Do not run real-provider smoke by default.

## Final report

Include:

1. What changed
2. Current provider smoke gap audit
3. Smoke gate behavior
4. Fake proposal corpus behavior
5. Quality report behavior
6. Smoke runner behavior
7. Smoke result behavior
8. Harness / scorecard integration
9. Session / Continue behavior
10. Verifier coverage
11. Optional opt-in real-provider smoke status
12. Coupling guard
13. Validation
14. Remaining risks
15. Next route recommendation
