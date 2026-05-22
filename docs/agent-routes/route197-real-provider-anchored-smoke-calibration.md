# Route 197: Real-provider anchored smoke calibration

## Goal

Run and harden the opt-in real-provider anchored proposal smoke path created by Route 196.

Route 196 added:

- anchored-provider smoke gate
- deterministic fake proposal-quality corpus
- proposal quality report
- smoke runner
- no-write smoke result
- Harness / Session / Continue coverage
- default-safe skip behavior

But Route 196 did not run a live provider call. Route 197 should make the real-provider smoke path operational under explicit opt-in and calibrate live provider proposal quality.

This route owns:

- opt-in live anchored provider smoke command/gate
- safe provider readiness detection through existing provider boundary
- controlled local fixture prompt
- live provider proposal output validation
- anchoring calibration
- no-write quality report
- scorecard / failure taxonomy calibration
- safe skip behavior when provider is unavailable
- verifier coverage proving default no-provider behavior still holds

This route must not enable provider-generated mutation.

## Expected outcome

By the end of Route 197:

1. There is a clear opt-in command or verifier mode for live anchored provider smoke.
2. Default validation still never calls the provider.
3. If provider readiness is unavailable, the live smoke skips safely with structured reason.
4. If provider readiness is available and explicitly opted in, the smoke can call the provider once against a controlled local fixture.
5. Live provider output is passed through prompt audit, output validator, anchor extraction, anchor matching, conflict detection, anchor quality, and quality report.
6. Live provider result remains no-write and mutationAuthority:not-granted.
7. Harness scorecard records provider-called status, skip reason, anchor quality, output validity, prompt audit status, and no-write status.
8. Session / Continue can summarize live smoke safely.
9. No private provider config is read manually.
10. No apply, no write, no command execution expansion, and no CLI redesign is introduced.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/foundation/foundation-risk-register.md`
- `docs/architecture/cross-capability-result-flow.md`

Read only if touched:

- provider readiness / provider boundary docs
- verifier module docs
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/session-substrate-seams.md`

Do not read browser docs, GitNexus, pi, or old route docs unless code directly requires them.

## Reference scan

Use references only for opt-in live provider smoke, safe skip, provider output validation, and no-write eval report shape.

Primary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/gemini-cli`

Secondary only if useful:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/pi`

Budget:

- ClaudeCode: max 8 files
- opencode: max 8 files
- gemini-cli: max 8 files
- Inspect AI / pi: max 6 files total

Focus:

- live provider opt-in gates
- dry-run proposal-only evaluation
- model output validation
- safe skip behavior
- redaction and prompt budget checks
- report / scorecard shape

Do not copy:

- default provider calls
- hidden provider config loading
- automatic apply loops
- provider-generated mutation
- broad patch engines
- new dependencies
- new CLI/TUI systems

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

- `packages/ts-shell/src/orchestration/liveProviderSmokeFixture.ts`
- `packages/ts-shell/src/orchestration/liveProviderSmokeCalibration.ts`
- `packages/ts-shell/src/orchestration/liveProviderSmokeResult.ts`
- `packages/ts-shell/src/orchestration/liveProviderSmokeCalibration.test.ts`
- `packages/ts-shell/src/orchestration/liveProviderSmokeResult.test.ts`
- `scripts/verify-real-provider-anchored-smoke.mjs`

Likely touched files:

- `anchoredProviderSmoke.ts`
- `anchoredProviderSmokeGate.ts`
- `providerSmokeResult.ts`
- `proposalQualityReport.ts`
- `anchoredProposalRuntime.ts`
- `realProviderProposalGate.ts`
- `realProviderProposalDryRun.ts`
- `providerPromptAudit.ts`
- `providerOutputValidator.ts`
- `providerAnchorQuality.ts`
- `providerProposalAnchors.ts`
- `providerAnchorMatcher.ts`
- `providerAnchoredProposal.ts`
- `providerAnchoringResult.ts`
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
- `scripts/verify-anchored-provider-smoke.mjs`
- `scripts/verify-context-planning.mjs`
- `scripts/verify-edit-capability-closeout.mjs`

Touch `runMvpIntegratedFlow.ts` only if absolutely required. Prefer verifier/script entrypoints for live smoke.

## Implementation tasks

### 1. Audit current live provider smoke readiness

Before changing behavior, determine:

- whether Route 196 smoke facade can already call a real provider
- what explicit opt-in flag or environment is required
- how provider readiness is detected
- what safe skip behavior exists
- whether private provider config is ever read manually
- whether output validation / anchoring / scorecard already handle real output
- what default verifier proves about no-provider behavior

Summarize this audit in the final report.

### 2. Live provider smoke fixture

Add `liveProviderSmokeFixture.ts`.

Fixture should be small, controlled, and local:

- one source file
- one obvious exact edit request
- one expected anchored proposal shape
- no secrets
- no network dependency
- no filesystem mutation outside temp fixture
- no apply

Fixture should be suitable for both fake and live provider smoke.

### 3. Live provider smoke calibration

Add `liveProviderSmokeCalibration.ts`.

Calibration should:

- accept explicit opt-in
- check provider readiness through existing provider boundary
- build lifecycle/context/analysis/plan-quality facts
- run prompt audit
- call provider only when gate allows
- validate output
- attempt anchoring
- produce proposal quality report
- produce harness scorecard
- never write files
- never apply output

If provider is unavailable, return skip result.

### 4. Live provider smoke result

Add `liveProviderSmokeResult.ts`.

Result states:

- `skipped-no-opt-in`
- `skipped-provider-not-configured`
- `skipped-provider-unsupported`
- `skipped-provider-not-ready`
- `prompt-audit-failed`
- `provider-called-output-valid`
- `provider-called-output-invalid`
- `provider-called-anchor-exact`
- `provider-called-anchor-partial`
- `provider-called-anchor-failed`
- `provider-called-unsafe-output`
- `no-write-confirmed`

Result should include:

- provider-called boolean
- provider safe label
- skip reason
- prompt audit id
- output validation id
- anchored proposal id if any
- anchor quality
- quality report id
- scorecard id
- no-write status
- redaction status

No raw provider output dumps.

### 5. Verify script

Add `scripts/verify-real-provider-anchored-smoke.mjs`.

Behavior:

- default mode: does not call provider, reports skipped-no-opt-in
- explicit opt-in mode: attempts live smoke through provider boundary
- if provider unavailable: exits success with safe skip marker
- if provider available: runs one controlled no-write smoke
- never mutates files
- never reads private provider config manually
- prints structured markers for:
  - provider-called
  - skip reason
  - prompt audit
  - output validation
  - anchor quality
  - no-write status

Do not wire this into default package scripts unless project conventions already have opt-in real-provider gates.

### 6. Fake/live report parity

Ensure fake corpus and live smoke share report shape:

- mode
- provider-called
- output validation
- anchoring result
- anchor quality
- failure class
- no-write status
- scorecard status

This lets harness compare fake and live behavior without special cases.

### 7. Session / Continue integration

Session / Continue should preserve:

- live smoke run id
- mode
- provider-called
- skip reason
- provider safe label
- prompt audit summary
- output validation summary
- anchor quality
- no-write status
- do-next text

`/continue` should explain whether the provider was actually called.

### 8. Harness / failure taxonomy integration

Harness scorecard should distinguish:

- default skip
- opt-in skip
- provider unavailable
- provider called exact anchor
- provider called partial anchor
- provider called malformed output
- provider called unsafe output
- no-write confirmed

Failure taxonomy should add or refine:

- live-smoke-no-opt-in
- live-smoke-provider-unavailable
- live-smoke-output-invalid
- live-smoke-anchor-failed
- live-smoke-unsafe-output
- live-smoke-no-write-violation

### 9. Verifier coverage

Required deterministic coverage:

- default live-smoke verifier does not call provider
- no opt-in returns skipped-no-opt-in
- provider unavailable returns safe skip
- fake live fixture path produces report shape
- live result surface never grants mutation authority
- raw provider output excluded from report/session
- provider-called flag is false in default tests
- no-write status is always present
- result-contract compatibility

Optional live coverage:

- Run `scripts/verify-real-provider-anchored-smoke.mjs` with explicit opt-in only if environment is configured by existing project mechanism.
- If it skips, record skip reason.
- If it calls provider, record provider-called true and no-write report.
- Do not fail the route merely because provider is unavailable.

### 10. Coupling guard

Do not put live smoke logic in `runMvpIntegratedFlow.ts`.

Preferred flow:

- explicit verifier/smoke script
- smoke gate
- provider boundary
- dry-run/validation/anchoring facades
- report/result/scorecard

No broad agent-loop rewrite.

### 11. Docs update

Update long-lived docs only where status changes:

- implementation manifest / recipes if new facades/flows are added
- foundation risk register if live provider smoke risk changes
- module backlog if route status is tracked
- provider boundary docs only if actual provider contract changes

No large architecture doc.

## Boundaries

Hard boundaries:

- no provider call by default
- no provider call without explicit opt-in
- no manual private provider config reads
- no mutation from provider output
- no apply in smoke path
- no provider call during apply
- no unconfirmed apply
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

- live provider smoke fixture tests
- calibration tests
- live smoke result tests
- smoke gate regression tests
- fake corpus regression tests
- quality report regression tests
- prompt audit regression tests
- output validator regression tests
- anchoring regression tests
- Session / Continue tests if touched
- Harness scorecard/failure taxonomy tests if touched
- `rtk node --check scripts/verify-real-provider-anchored-smoke.mjs`
- `rtk node scripts/verify-real-provider-anchored-smoke.mjs`
- context-planning verifier if touched
- edit closeout verifier if touched
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- JSON parse guard if manifest changes
- package guard if package files are touched unexpectedly
- `rtk git diff --check`
- `rtk git status --short --branch`

Do not require live provider success for default validation.

## Final report

Include:

1. What changed
2. Current live provider smoke readiness audit
3. Live fixture behavior
4. Calibration behavior
5. Result behavior
6. Verify script behavior
7. Fake/live report parity
8. Session / Continue behavior
9. Harness / failure taxonomy behavior
10. Verifier coverage
11. Whether live provider was actually called
12. If skipped, exact skip reason
13. Coupling guard
14. Validation
15. Remaining risks
16. Next route recommendation
