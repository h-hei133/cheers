# Route 160: Result Surface - resultMapper module facade extraction

## Module

- Primary module: Result Surface Engineering
- Secondary modules:
  - Tool Engineering
  - Runtime Engineering
  - Edit / Patch Engineering
  - Browser Engineering
  - Provider / Model Engineering
  - Session / Continue Engineering
  - Harness / Eval Engineering
- Capability: `resultMapper.ts` truthfulness facade extraction
- Cross-module inputs:
  - Route 146 Tool / Policy / Result contract
  - Route 150 Runtime Receipt contract
  - Route 152 turn receipt aggregation
  - Route 155 resultSurfaceModule facade
  - sessionRuntime terminal state facade
  - capability-specific evidence and stopped result facts
  - result-contract verifier
- Cross-module outputs:
  - resultMapper responsibility migration table
  - Result Surface facades for terminal classification, actionable blockers, capability result normalization, and reason/do-next projection
  - preserved result truthfulness semantics
  - updated `control-plane-atlas.md`
  - focused Result Surface boundary tests
- Product behavior boundary:
  - behavior-preserving extraction only
  - no completed/stopped/error semantic change
  - no terminal classification weakening
  - no false success
  - no capability behavior changes
- Stop conditions:
  - extraction requires changing result-contract expectations
  - extraction requires changing completed/stopped/error semantics
  - extraction requires changing sessionRuntime terminal behavior
  - extraction requires changing capability execution behavior
  - extraction becomes broad result rewrite instead of facade migration
- Capability lifecycle stage(s):
  - availability: consume availability/unavailable facts from module receipts
  - policy: consume blocked/denied policy facts
  - planning: no planning changes
  - execution: no execution changes
  - observation: consume safe observation summaries
  - evidence: consume evidence markers and receipts
  - result mapping: primary route target
  - transcript: preserve transcript-safe summaries
  - continue / replay: preserve continuation result truthfulness
  - eval: result-contract plus focused result surface tests
  - report: update migration doc and atlas
  - cleanup: preserve cleanup status mapping
  - redaction: preserve redacted output and no raw dumps/secrets

## Goal

Run the owner-module extraction pass for `resultMapper.ts`.

After Routes 154-159, the major control-plane composition files have acceptable module ownership. `resultMapper.ts` remains the core Result Surface truthfulness owner. It should keep final result truthfulness composition, but it should not permanently own every capability-specific mapping rule inline.

This route should extract coherent Result Surface facades while preserving every externally asserted result semantic.

This route is successful when:

- [ ] `docs/architecture/resultmapper-module-extraction.md` records a responsibility migration table before code motion
- [ ] at least three coherent mapping families are moved or consolidated behind Result Surface-owned facades
- [ ] `resultMapper.ts` remains the final truthfulness composition root
- [ ] completed/stopped/error and terminalClassification behavior remain stable
- [ ] actionable blocker behavior remains stable
- [ ] result-contract verifier remains green
- [ ] `control-plane-atlas.md` is updated with Result Surface ownership and next central file recommendation
- [ ] package sweep is not required unless escalation conditions are hit

This route is not successful if:

- [ ] it changes result truthfulness
- [ ] it hides capability failures behind completed
- [ ] it downgrades actionable stopped paths to vague errors
- [ ] it moves capability execution behavior into Result Surface
- [ ] it creates loose helper fragments instead of Result Surface facades
- [ ] it skips the migration doc or atlas update

## References

Target project evidence:

- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/runtime-receipt-contract.md`
- `docs/architecture/agent-loop-turn-kernel.md`
- `docs/architecture/session-runtime-module-extraction.md`
- `docs/architecture/runmvp-module-extraction.md`
- `docs/architecture/module-backlog.md`
- `scripts/verify-result-contract.mjs`
- `packages/ts-shell/src/core/query/resultMapper.ts`
- existing resultMapper tests

Reference projects to inspect:

- OpenHands:
  - action/observation/result event truthfulness
- Inspect AI:
  - score/result/report classification
- opencode:
  - tool result and permission-denied result surfaces
- ClaudeCode:
  - tool result / error / stopped user surface
- gemini-cli:
  - tool-call result mapping and terminal display facts

Reference budget:

- OpenHands: max 8 files
- Inspect AI: max 6 files
- opencode: max 8 files
- ClaudeCode: max 6 files
- gemini-cli: max 6 files
- Stop reference reading once result truthfulness, stopped/error classification, and actionable result surface patterns are clear.

Do not inspect browser/edit/provider internals beyond their result/evidence boundary files.

## Current Project Surfaces

Primary file:

- `packages/ts-shell/src/core/query/resultMapper.ts`

Likely related surfaces:

- `packages/ts-shell/src/core/query/resultMapper.test.ts`
- `packages/ts-shell/src/core/tools/toolPolicyResult.ts`
- `packages/ts-shell/src/core/tools/toolResultProjection.ts`
- `packages/ts-shell/src/core/runtime/runtimeReceipt.ts`
- `packages/ts-shell/src/core/runtime/runtimeReceiptProjection.ts`
- `packages/ts-shell/src/orchestration/resultSurfaceModule.ts`
- `packages/ts-shell/src/orchestration/flowResultProjection.ts`
- `packages/ts-shell/src/orchestration/flowEvidenceProjection.ts`
- `packages/ts-shell/src/core/shell/sessionTerminalState.ts`
- `packages/ts-shell/src/core/shell/sessionEventSurface.ts`
- capability-specific result/evidence projectors

Likely new or consolidated facade files:

- `packages/ts-shell/src/core/query/resultTruthfulnessModule.ts`
- `packages/ts-shell/src/core/query/actionableBlockerModule.ts`
- `packages/ts-shell/src/core/query/capabilityResultClassification.ts`
- `packages/ts-shell/src/core/query/terminalClassificationProjection.ts`
- `packages/ts-shell/src/core/query/resultMapperBoundary.test.ts`
- `docs/architecture/resultmapper-module-extraction.md`

Choose names based on actual ownership. Prefer cohesive facades over many tiny helpers.

## Allowed Changes

- Create Result Surface-owned facades around existing mapping families.
- Replace inline capability-specific mapping blocks in `resultMapper.ts` with facade calls where behavior is identical.
- Consolidate duplicated reason/do-next and terminal classification projection.
- Update tests to target facade boundaries where appropriate.
- Update stale test names/comments that imply old ownership.
- Update `control-plane-atlas.md` and `module-backlog.md`.

## Explicit Non-Goals

Do not:

- change result contract semantics
- change completed/stopped/error mapping
- change terminalClassification semantics
- change actionable blocker categories
- change capability execution behavior
- change provider/browser/edit/runtime/session behavior
- change CLI output semantics
- change SessionManager schema or transcript format
- add dependencies
- rewrite resultMapper broadly

## Boundaries

Hard boundaries:

- No provider/model live calls.
- No browser capability expansion.
- No edit/patch capability expansion.
- No runtime execution expansion.
- No permission weakening.
- No workspace authority or stale-read changes.
- No result truthfulness weakening.
- No session schema or transcript format changes.
- No CLI behavior changes.
- No dependency changes.
- No broad resultMapper rewrite.
- No hidden skips.
- No commit or push.

Validation tier:

- Tier 3 by default: central Result Surface truthfulness facade extraction.
- Required:
  - focused resultMapper boundary tests
  - existing resultMapper tests
  - `verify:result-contract`
  - sessionRuntime boundary tests if terminal state integration is touched
  - runMvp tests if orchestration result handoff is touched
  - build
  - diff/status
- Package sweep is optional, not default.
- Escalate to package sweep only if:
  - result-contract expectations are rebaselined
  - broad terminal output expectations change
  - capability result semantics change
  - CLI/session behavior changes
  - focused/result-contract gates reveal unexplained failures

## Capability Contract

| Stage | Current State | Route Change | Evidence Required |
|---|---|---|---|
| availability | capability unavailable facts mapped inline | facade-owned unavailable classification | result tests |
| policy | blocked/approval-denied facts mapped inline | actionable blocker facade | result-contract |
| planning | no planning ownership | no change | none |
| execution | no execution ownership | no change | none |
| observation | observations consumed as result facts | safe observation classification only | redaction tests |
| evidence | evidence markers drive stopped/error mapping | evidence classification facade | resultMapper tests |
| result mapping | inline truthfulness logic | keep root composition, move families behind facades | result-contract |
| transcript | terminal state consumes mapped result | no transcript format change | sessionRuntime tests if touched |
| continue / replay | continuation sees mapped result | preserve | runMvp if touched |
| eval | result-contract exists | preserve and extend focused tests | validation output |
| report | no migration doc yet | add resultmapper extraction doc | docs |
| cleanup | cleanup facts map capability-specifically | cleanup classification facade if touched | cleanup tests |
| redaction | no raw secrets in result summary | preserve via tests | redaction assertions |

## Implementation Tasks

### 1. Create resultMapper responsibility migration document

Create `docs/architecture/resultmapper-module-extraction.md`.

Before code changes, document a migration table.

Required columns:

- current code block / responsibility
- current owner file
- true owner module
- target facade or file
- migration decision:
  - extract now
  - facade existing helpers
  - leave in resultMapper
  - defer
  - do not move
- reason
- validation required
- risk

### 2. Categorize resultMapper responsibilities

Classify at least these families:

- final completed/stopped/error truthfulness composition
- terminalClassification projection
- actionable blocker mapping
- approval denied / policy blocked mapping
- command/tool result mapping
- MCP unavailable/protocol/tool-error mapping
- browser unavailable/policy/timeout/cleanup mapping
- edit/patch verification/stale-read/no-mutation mapping
- provider not-configured/opt-in/diagnostic mapping
- continuation/replay result mapping
- unknown/fallback error mapping
- evidence marker parsing
- user-facing reason/do-next projection
- test-only contract fixtures

Mark what belongs in `resultMapper.ts`:

- final truthfulness composition
- top-level result contract shape
- preserving externally asserted mapping order
- calling Result Surface facades

Everything else should move behind a facade or be explicitly deferred.

### 3. Extract actionable blocker facade

Candidate file:

- `actionableBlockerModule.ts`

Owner module:

- Result Surface Engineering

Responsibilities:

- map known actionable blocker markers to stable blocker kind
- reason/do-next projection
- stopped vs failed recommendation
- approval/policy/workspace/verification blocker categories

Do not change blocker categories unless result-contract explicitly updates them.

### 4. Extract terminal classification facade

Candidate file:

- `terminalClassificationProjection.ts`

Owner module:

- Result Surface Engineering

Responsibilities:

- completed/stopped/error/interrupted terminal classification
- mapping between internal result status and terminal display class
- preserve existing external labels

Do not change labels or truthfulness.

### 5. Extract capability result classification facade

Candidate file:

- `capabilityResultClassification.ts`

Owner module:

- Result Surface Engineering

Responsibilities:

- command/tool/MCP/browser/edit/provider unavailable/blocked/failed classifications
- cleanup/timeout/invalid-result classification
- consume Tool / Policy / Result and Runtime Receipt vocabulary where useful
- return stable normalized classification to resultMapper

Do not move capability execution logic here.

### 6. Preserve resultMapper as root composer

Update `resultMapper.ts`:

- keep final mapping order and top-level shape
- call facades for selected mapping families
- avoid direct capability-specific details where facade exists
- preserve all external fields and values

### 7. Update tests and stale assumptions

Add `resultMapperBoundary.test.ts`.

Required coverage:

- actionable approval/policy blocker maps to stopped as before
- command success stays completed
- command blocked stays actionable stopped
- MCP unavailable/protocol error maps as before
- browser unavailable/policy/timeout maps as before
- edit stale-read/verification/no-mutation maps as before
- provider not-configured/opt-in maps as before
- unknown failure remains failed/error according to current contract
- terminalClassification labels remain stable
- reason/do-next survives facade classification
- no raw DOM/file dumps/secrets in projected result summaries

Run existing resultMapper tests and result-contract verifier.

### 8. Update docs

Update:

- `docs/architecture/resultmapper-module-extraction.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/module-backlog.md`

At the end, classify `resultMapper.ts` as one of:

- acceptable Result Surface truthfulness root
- still requires another extraction route
- should hand off to next central file

Recommend the next central file from the atlas or state that the original central-file pass is complete.

## Validation

Focused validation:

- `rtk npm run test -w packages/ts-shell -- src/core/query/resultMapperBoundary.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/query/resultMapper.test.ts`

Broader validation:

- `rtk npm run verify:result-contract`
- `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntimeBoundary.test.ts` if terminal state integration is touched
- `rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts` if orchestration result handoff is touched
- `rtk npm run build -w packages/ts-shell`

Repository hygiene:

- `rtk git diff --check`
- `rtk git status --short --branch`
- `rtk git diff --name-only -- package.json package-lock.json packages/ts-shell/package.json`

Package sweep:

- Not required by default.
- Escalate only if Tier 3 escalation conditions are hit.

## Completion Audit

Before final response, map every deliverable to evidence:

| Requirement | Evidence | Status |
|---|---|---|
| resultMapper migration doc | `resultmapper-module-extraction.md` | |
| actionable blocker facade | facade file | |
| terminal classification facade | facade file | |
| capability result classification facade | facade file | |
| resultMapper direct responsibilities reduced | `resultMapper.ts` diff | |
| boundary tests | validation output | |
| result-contract green | validation output | |
| atlas updated | `control-plane-atlas.md` | |
| final classification | atlas + migration doc | |
| next central file recommendation | atlas/backlog note | |
| no truthfulness drift | final audit | |

## Final Report Format

1. Branch and base commit
2. Files changed
3. What changed
4. resultMapper responsibility migration summary
5. Result Surface facades created or consolidated
6. What remains in resultMapper
7. resultMapper final classification
8. Next central file recommendation or central-file pass completion
9. Validation tier used and why package sweep was or was not run
10. Validation commands and results
11. Real-provider gate status
12. External MCP status
13. Audit/history residue handling
14. Source/package change confirmation
15. Remaining risks
16. Best next action
17. Proposed commit message

Do not commit or push.
