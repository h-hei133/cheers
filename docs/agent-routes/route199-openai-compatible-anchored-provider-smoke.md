# Route 199: OpenAI-compatible anchored provider smoke

## Goal

Wire the explicit opt-in live anchored proposal smoke to the existing real-provider readiness boundary for `openai-compatible` providers.

Routes 197-198 established:

- explicit opt-in live anchored smoke script
- default safe skip
- opt-in preservation
- provider readiness env preservation
- fixture evidence normalization
- fake-ready provider boundary reachability
- no-write report / scorecard / session evidence

Manual smoke result now shows:

- `verify-real-provider-readiness-smoke.mjs` recognizes `provider=openai-compatible`
- `verify-real-provider-anchored-smoke.mjs` preserves opt-in and provider readiness env
- but anchored smoke still safe-skips with `provider-not-ready`
- no live provider API is called by anchored smoke

Route 199 should close that adapter gap:

- reuse existing real-provider readiness / provider boundary
- support `openai-compatible` as an approved live anchored smoke provider
- call provider only under explicit opt-in
- run one controlled local no-write anchored proposal smoke
- pass output through prompt audit, output validator, anchoring, quality report, harness scorecard, and Session / Continue evidence
- preserve default no-provider behavior

This route must not add mutation, apply, broad provider calls, or manual private config reads.

## Expected outcome

By the end of Route 199:

1. Default anchored smoke still does not call provider.
2. Explicit opt-in without provider config still safe-skips.
3. Explicit opt-in with provider readiness `openai-compatible` can construct an approved live provider adapter through existing provider boundary.
4. Anchored smoke can perform one live no-write provider call against the controlled fixture.
5. Live provider output is validated, anchored when possible, and reported.
6. Provider-called marker becomes true only in explicit opt-in live mode.
7. No private provider config is read manually by the verifier.
8. No provider output is applied.
9. No mutation authority is granted.
10. The live smoke report distinguishes:
    - provider unavailable
    - provider unsupported
    - provider called but output invalid
    - provider called with partial anchors
    - provider called with exact anchors
    - no-write confirmed
11. Harness scorecard records provider type, provider-called status, output validation, anchor quality, no-write, and failure class.
12. The script can be used as the first real LLM proposal-quality calibration gate.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/foundation/foundation-risk-register.md`

Read only if touched:

- provider readiness / provider boundary docs
- verifier module docs
- `docs/architecture/cross-capability-result-flow.md`
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/session-substrate-seams.md`

Do not read browser docs, GitNexus, pi, or old route docs unless code directly requires them.

## Reference scan

Use references only for OpenAI-compatible provider boundary, model adapter shape, opt-in smoke, and no-write provider evaluation.

Primary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/gemini-cli`

Budget:

- ClaudeCode: max 8 files
- opencode: max 8 files
- gemini-cli: max 8 files

Focus:

- OpenAI-compatible provider configuration
- provider adapter construction
- no-write model call smoke
- provider readiness / auth / unsupported classification
- output validation and dry-run reports

Do not copy:

- default live provider calls
- hidden provider config loading
- direct mutation
- provider call during apply
- new dependency setup
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

- `packages/ts-shell/src/orchestration/liveProviderAdapterApproval.ts`
- `packages/ts-shell/src/orchestration/openAICompatibleAnchoredSmokeAdapter.ts`
- `packages/ts-shell/src/orchestration/liveProviderAdapterApproval.test.ts`
- `packages/ts-shell/src/orchestration/openAICompatibleAnchoredSmokeAdapter.test.ts`

Likely touched files:

- `scripts/verify-real-provider-anchored-smoke.mjs`
- `scripts/verify-real-provider-readiness-smoke.mjs` only if marker reuse is needed
- `providerModule.ts`
- `providerReadiness.ts`
- `providerOutcomeProjection.ts`
- `liveProviderSmokeCalibration.ts`
- `liveProviderSmokeResult.ts`
- `liveProviderSmokeEvidence.ts`
- `liveProviderSmokeFixture.ts`
- `anchoredProviderSmoke.ts`
- `anchoredProviderSmokeGate.ts`
- `realProviderProposalGate.ts`
- `realProviderProposalDryRun.ts`
- `providerPromptAudit.ts`
- `providerOutputValidator.ts`
- `providerAnchorQuality.ts`
- `providerProposalAnchors.ts`
- `providerAnchorMatcher.ts`
- `providerAnchoredProposal.ts`
- `proposalQualityReport.ts`
- `providerSmokeResult.ts`
- `harnessTrace.ts`
- `harnessScorecard.ts`
- `harnessFailureTaxonomy.ts`
- `sessionResultParity.ts`
- `continuationEvidenceParity.ts`

Do not touch `runMvpIntegratedFlow.ts` unless an existing test proves it is unavoidable. Prefer verifier/script entrypoints.

## Implementation tasks

### 1. Audit current provider readiness and anchored smoke adapter gap

Before changing behavior, determine:

- how `verify-real-provider-readiness-smoke.mjs` detects `provider=openai-compatible`
- what provider readiness facts are emitted
- why `verify-real-provider-anchored-smoke.mjs` still returns `provider-not-ready`
- whether the anchored smoke script can reuse readiness facts directly
- whether existing provider modules expose an adapter boundary suitable for one no-write model call
- how provider unsupported/auth/network/missing-config are classified today
- what tests prove fake-ready provider boundary reachability
- what default validations prove no-provider behavior

Summarize this audit in the final report.

### 2. Live provider adapter approval

Add `liveProviderAdapterApproval.ts`.

Approval input:

- explicit live anchored smoke opt-in
- real provider smoke opt-in
- provider readiness result
- provider kind
- provider safe label
- provider config source
- private config manual read status
- smoke fixture safety status
- redaction status

Approval decisions:

- `approved-openai-compatible`
- `skip-no-opt-in`
- `skip-real-provider-smoke-not-enabled`
- `skip-provider-not-configured`
- `skip-provider-unsupported`
- `skip-provider-not-ready`
- `skip-provider-auth`
- `skip-provider-network`
- `stop-private-config-manual-read-risk`
- `stop-redaction-risk`
- `unsupported`

Rules:

- only explicit opt-in can approve live provider call
- default path cannot approve
- `openai-compatible` can be approved if existing readiness gate says ready
- approval never grants mutation authority

### 3. OpenAI-compatible anchored smoke adapter

Add `openAICompatibleAnchoredSmokeAdapter.ts`.

Adapter behavior:

- use existing provider module/boundary only
- do not manually read `/home/wang/.private-agents-real`
- build provider request from controlled live smoke fixture
- call provider once
- return text output or structured provider output
- preserve provider safe label
- classify provider errors:
  - auth
  - missing key
  - unsupported
  - network
  - timeout
  - malformed response
  - unknown
- no write / no apply

If existing provider module already supplies this adapter, wrap it thinly rather than duplicating provider logic.

### 4. Wire verifier to live adapter approval

Update `scripts/verify-real-provider-anchored-smoke.mjs`.

Behavior:

- default mode: no provider call, skip no opt-in
- explicit anchored opt-in + real provider smoke opt-in + provider readiness ready:
  - approve adapter
  - call provider once through anchored smoke calibration
- explicit opt-in but readiness missing:
  - structured skip
- explicit opt-in with openai-compatible readiness:
  - no longer blindly skip provider-not-ready
- print markers:
  - `provider-kind=openai-compatible`
  - `adapter-approved=true|false`
  - `provider-called=true|false`
  - `provider-error-class=<class|none>`
  - `output-validation=<status>`
  - `anchor-quality=<level>`
  - `no-write=true`

Do not put live provider logic in generic default verifier path.

### 5. Live call calibration path

Update `liveProviderSmokeCalibration.ts`.

When approved adapter exists:

- run prompt audit
- call approved adapter once
- pass output to provider output validator
- run anchoring
- produce proposal quality report
- produce live smoke result
- produce harness scorecard
- preserve no-write result

If provider call fails:

- report provider-called=true
- classify error
- no-write
- no raw output dump

### 6. Report / scorecard updates

Update quality report and scorecard to record:

- provider kind
- adapter approval status
- provider-called
- provider error class
- output validation
- anchor quality
- no-write status
- exact/partial/failed anchoring state
- live smoke route marker

Failure taxonomy should include or refine:

- live-smoke-adapter-not-approved
- live-smoke-openai-compatible-provider-error
- live-smoke-provider-auth
- live-smoke-provider-network
- live-smoke-provider-output-invalid
- live-smoke-provider-anchor-failed

### 7. Session / Continue updates

Session / Continue should preserve:

- provider kind
- adapter approval status
- provider-called boolean
- provider error class
- output validation summary
- anchor quality
- no-write status
- do-next text

No raw provider output.

### 8. Tests

Required deterministic tests:

- default mode cannot approve adapter
- no opt-in cannot approve adapter
- opt-in + unsupported provider skips
- opt-in + not-configured provider skips
- opt-in + `openai-compatible` ready provider approves adapter
- approved fake openai-compatible adapter is called once
- adapter error is classified and no-write
- adapter output goes through validation / anchoring / report
- raw provider output excluded from result/session/report
- no mutation authority is granted

Optional live test:

- `PRIVATE_AGENTS_REAL_PROVIDER_SMOKE=1 PRIVATE_AGENTS_LIVE_ANCHORED_PROVIDER_SMOKE=1 PRIVATE_AGENTS_REAL_HOME=...`
- if provider config is valid, provider-called should become true
- if provider fails, classify error and exit according to existing smoke taxonomy
- do not require live provider success for default validation

### 9. Verifier coverage

Update `scripts/verify-real-provider-anchored-smoke.mjs` coverage.

Default validation must prove:

- provider-called=false
- adapter-approved=false
- no-write=true
- no private config manual read
- deterministic fake tests pass

Opt-in unavailable validation should prove:

- opt-in preserved
- readiness source preserved
- structured skip

Opt-in ready fake-boundary test should prove:

- adapter-approved=true
- provider-called=true
- validation/anchoring/report executed
- no-write=true

### 10. Audit residue hygiene

After validation:

- inspect `packages/ts-shell/.sisyphus/audit/permissions.jsonl`
- remove only validation-generated `/tmp/...` appended residue
- final diff for audit file should be clean

### 11. Docs update

Update long-lived docs only where status changes:

- implementation manifest / recipes if new facades/flows are added
- foundation risk register if openai-compatible live smoke risk changes
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
- no CLI redesign
- no package dependency changes
- no broad `runMvpIntegratedFlow.ts` refactor

## Validation

Run focused validation based on touched files:

- adapter approval tests
- openai-compatible smoke adapter tests
- live smoke calibration tests
- live smoke result tests
- verifier default skip
- verifier opt-in unavailable skip
- fake-ready adapter-approved/provider-called test
- prompt audit / output validator / anchoring regression tests if touched
- Session / Continue tests if touched
- Harness scorecard/failure taxonomy tests if touched
- `rtk node --check scripts/verify-real-provider-anchored-smoke.mjs`
- `rtk node scripts/verify-real-provider-anchored-smoke.mjs`
- `PRIVATE_AGENTS_LIVE_ANCHORED_PROVIDER_SMOKE=1 rtk node scripts/verify-real-provider-anchored-smoke.mjs`
- `PRIVATE_AGENTS_LIVE_ANCHORED_PROVIDER_SMOKE=1 PRIVATE_AGENTS_REAL_HOME=/tmp/private-agents-fake-ready rtk node scripts/verify-real-provider-anchored-smoke.mjs`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- JSON parse guard if manifest changes
- package guard if package files are touched unexpectedly
- `rtk git diff --check`
- `rtk git status --short --branch`

If local real provider config is available and project policy allows it, also run:

`PRIVATE_AGENTS_REAL_PROVIDER_SMOKE=1 PRIVATE_AGENTS_LIVE_ANCHORED_PROVIDER_SMOKE=1 PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-real-provider-smoke rtk node scripts/verify-real-provider-anchored-smoke.mjs`

Report whether provider-called became true. If it skips, report exact skip reason. If it calls provider, report output validation, anchor quality, and no-write status.

Do not fail default validation because real provider is unavailable.

## Final report

Include:

1. What changed
2. Current readiness/adapter gap audit
3. Adapter approval behavior
4. OpenAI-compatible adapter behavior
5. Verifier live opt-in behavior
6. Live call calibration behavior
7. Report / scorecard behavior
8. Session / Continue behavior
9. Test coverage
10. Whether a real provider was actually called
11. If skipped, exact skip reason
12. If called, provider kind, output validation, anchor quality, no-write status
13. Audit residue cleanup
14. Validation
15. Remaining risks
16. Next route recommendation
