# Route 198: Live provider smoke hardening

## Goal

Harden Route 197 live-provider anchored smoke so the explicit opt-in path is actually reachable, evidence contracts are aligned, and default validation remains provider-safe.

Route 197 added:

- live provider smoke fixture
- live provider smoke calibration
- live provider smoke result
- verify-real-provider-anchored-smoke script
- fake/live report parity
- live smoke failure taxonomy

Review found three issues:

1. Explicit opt-in was not honored by the verifier path.
2. Fixture evidence was ignored unless duplicated at top-level calibration input.
3. Generated permission audit residue remained in the patch.

Route 198 should fix those defects and harden the entire smoke contract:

- default mode never calls provider
- explicit opt-in is honored
- unavailable provider safely skips
- fake-ready provider boundary reaches provider-called=true
- fixture evidence normalization is the single gate input
- output validation / anchoring / report path runs after provider boundary
- no-write / no-apply proof is explicit
- audit residue is clean

This route is stabilization plus contract hardening, not a new capability expansion.

## Expected outcome

By the end of Route 198:

1. `PRIVATE_AGENTS_LIVE_ANCHORED_PROVIDER_SMOKE=1` is respected by the verifier.
2. The live-smoke verifier does not scrub opt-in / provider-readiness environment for the live path.
3. Default verifier mode still does not call provider.
4. Opt-in without provider readiness returns structured safe skip.
5. Opt-in with a fake-ready provider boundary reaches provider-called=true in tests.
6. Calibration gates consume lifecycle / analysis / plan / context evidence from fixture promptContext when top-level ids are absent.
7. Provider output still flows through prompt audit, output validation, anchoring, quality report, harness scorecard, and session-safe result.
8. No mutation, no apply, no writer, and no provider call during apply occurs.
9. Raw provider output and raw file content remain excluded from result/session/report.
10. Generated `.sisyphus/audit/permissions.jsonl` residue is removed before final status.
11. Verifier markers make live-path reachability and safe-skip behavior unambiguous.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/foundation/foundation-risk-register.md`

Read only if touched:

- provider boundary docs
- verifier module docs
- `docs/architecture/cross-capability-result-flow.md`
- `docs/architecture/session-substrate-seams.md`

Do not read browser docs, GitNexus, pi, or old route docs unless code directly requires them.

## Reference scan

Use references only if needed for opt-in provider smoke / safe skip / verifier environment handling.

Primary, optional:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/gemini-cli`

Budget:

- max 6 files total across references

Focus:

- opt-in model/provider gates
- safe skip behavior
- no-write smoke reporting
- test environment handling

Do not copy:

- default provider calls
- hidden provider config loading
- automatic apply
- external dependencies
- new CLI/TUI systems

## Owner modules

Primary owners:

- Provider / Model
- Harness / Eval
- Result Surface

Collaborating owners:

- Edit / Patch proposal layer
- Session / Continue
- Permission / Policy

Likely touched files:

- `scripts/verify-real-provider-anchored-smoke.mjs`
- `packages/ts-shell/src/orchestration/liveProviderSmokeCalibration.ts`
- `packages/ts-shell/src/orchestration/liveProviderSmokeFixture.ts`
- `packages/ts-shell/src/orchestration/liveProviderSmokeResult.ts`
- `packages/ts-shell/src/orchestration/anchoredProviderSmoke.ts`
- `packages/ts-shell/src/orchestration/anchoredProviderSmokeGate.ts`
- `packages/ts-shell/src/orchestration/proposalQualityReport.ts`
- `packages/ts-shell/src/orchestration/providerSmokeResult.ts`
- `packages/ts-shell/src/orchestration/harnessTrace.ts`
- `packages/ts-shell/src/orchestration/harnessScorecard.ts`
- `packages/ts-shell/src/orchestration/harnessFailureTaxonomy.ts`
- `packages/ts-shell/src/session/sessionResultParity.ts`
- `packages/ts-shell/src/session/continuationEvidenceParity.ts`

Likely new files only if useful:

- `packages/ts-shell/src/orchestration/liveProviderSmokeEvidence.ts`
- `packages/ts-shell/src/orchestration/liveProviderSmokeEvidence.test.ts`

Do not touch `runMvpIntegratedFlow.ts` unless an existing test proves it is unavoidable.

## Implementation tasks

### 1. Audit Route 197 live smoke defects

Before changing behavior, inspect and summarize:

- why opt-in is ignored in `verify-real-provider-anchored-smoke.mjs`
- where env scrubbing clears opt-in / provider readiness
- where calibration expects top-level lifecycle/analysis/plan/context ids
- where fixture promptContext already carries those ids
- how default safe skip is currently tested
- whether provider-called=true can be reached through any fake-ready provider boundary test
- whether audit residue is dirty

### 2. Fix opt-in environment handling

Update `scripts/verify-real-provider-anchored-smoke.mjs`.

Rules:

- default mode: provider-called=false, skip-no-opt-in, exits 0
- explicit opt-in mode: preserve `PRIVATE_AGENTS_LIVE_ANCHORED_PROVIDER_SMOKE=1`
- do not scrub provider readiness env for the live smoke branch
- never read private provider config manually
- provider unavailable: structured skip, exits 0
- provider ready: call only through existing provider boundary / calibration facade
- print explicit markers:
  - `live-smoke-opt-in=true|false`
  - `provider-called=true|false`
  - `skip-reason=<reason>`
  - `no-write=true`
  - `private-config-manual-read=false`

### 3. Normalize fixture evidence

Add or update a helper, preferably `liveProviderSmokeEvidence.ts`.

It should normalize evidence from:

- top-level calibration input
- `fixture.promptContext`
- fixture lifecycle/context/analysis/plan facts
- explicit missing-state

Normalized fields:

- lifecycle id
- analysis brief id
- analysis quality id
- plan quality id
- context packet id
- context graph / code graph id if present
- task execution plan id if present
- redaction status
- no-write / mutationAuthority status

Calibration gate should consume only normalized evidence.

### 4. Fix calibration gate input

Update `liveProviderSmokeCalibration.ts`.

Rules:

- top-level ids win
- fixture promptContext ids are fallback
- if fixture has required ids, do not falsely stop missing lifecycle / analysis / plan quality
- missing evidence states remain structured
- provider call only occurs after opt-in + readiness + normalized evidence + prompt audit
- no mutation / no apply remains explicit

### 5. Add provider boundary reachability test

Add focused tests proving:

- default mode never calls provider
- opt-in + provider unavailable skips
- opt-in + fake-ready provider boundary calls provider exactly once
- provider-called=true reaches validation / anchoring / report path
- provider-called=true still no-write
- provider output is not dumped raw

This can use a fake provider adapter/boundary. It does not require a real API.

### 6. Strengthen verifier coverage

Update `verify-real-provider-anchored-smoke.mjs` tests / markers to prove:

- default no-provider behavior
- explicit opt-in preserved
- unavailable skip
- fake-ready provider seam reachable in focused tests
- fixture evidence normalization
- no-write proof
- raw output exclusion
- result-contract compatibility

Default verifier must remain deterministic and not require credentials.

### 7. Harness / scorecard hardening

Update scorecard only as needed to distinguish:

- default skip
- opt-in skip
- provider unavailable
- provider boundary called
- provider output validated
- provider output anchored
- no-write confirmed
- live path unreachable regression

Failure taxonomy should include a clear class for:

- live-smoke-opt-in-not-honored
- live-smoke-fixture-evidence-missing
- live-smoke-provider-boundary-unreachable

Only add classes if needed by tests/reporting.

### 8. Session / Continue hardening

Session / Continue should preserve:

- live smoke run id
- opt-in status
- provider-called boolean
- skip reason
- normalized evidence ids
- output validation summary
- anchor quality summary
- no-write status
- do-next text

No raw provider output or file content.

### 9. Clean audit residue

Remove generated permission audit residue:

- inspect `packages/ts-shell/.sisyphus/audit/permissions.jsonl`
- remove only validation-generated `/tmp/...` appended lines
- confirm final diff for that file is clean unless source-controlled expected changes exist

Do not commit generated audit noise.

### 10. Docs update

Update long-lived docs only where status changes:

- implementation manifest / recipes if verifier/smoke semantics change
- foundation risk register if live smoke risk changes
- module backlog if route status is tracked

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

- live smoke evidence normalization tests
- live smoke calibration tests
- live smoke result tests
- smoke gate regression tests
- provider boundary reachability tests
- smoke verifier default skip
- smoke verifier opt-in unavailable skip if safe
- prompt audit / output validator / anchoring regression tests if touched
- Session / Continue tests if touched
- Harness scorecard / failure taxonomy tests if touched
- `rtk node --check scripts/verify-real-provider-anchored-smoke.mjs`
- `rtk node scripts/verify-real-provider-anchored-smoke.mjs`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- JSON parse guard if manifest changes
- package guard if package files are touched unexpectedly
- `rtk git diff --check`
- `rtk git status --short --branch`

Run `PRIVATE_AGENTS_LIVE_ANCHORED_PROVIDER_SMOKE=1 rtk node scripts/verify-real-provider-anchored-smoke.mjs` only if existing project rules allow it and provider config is available. If unavailable, record structured skip.

Do not require live provider success for default validation.

## Final report

Include:

1. What changed
2. Route 197 defect audit
3. Opt-in handling fix
4. Fixture evidence normalization behavior
5. Calibration gate behavior
6. Provider boundary reachability tests
7. Verifier marker behavior
8. Harness / scorecard behavior
9. Session / Continue behavior
10. Audit residue cleanup
11. Validation
12. Whether a real provider was actually called
13. If skipped, exact skip reason
14. Remaining risks
15. Next route recommendation
