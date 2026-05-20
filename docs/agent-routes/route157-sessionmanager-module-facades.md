# Route 157: Session / Continue - SessionManager module facade extraction

## Module

- Primary module: Session / Continue Engineering
- Secondary modules:
  - Result Surface Engineering
  - Permission / Policy Engineering
  - CLI / UX Engineering
  - Agent Loop Engineering
  - Harness / Eval Engineering
- Capability: `SessionManager.ts` owner-module facade extraction
- Cross-module inputs:
  - Route 145 session substrate seams
  - Route 156 sessionRuntime facades
  - session event codec / summary / continuation / compact / metadata projections
  - current-session selection logic
  - approval memory codec/projection
  - compact / replay / recovery builders
  - result and terminal evidence facts
- Cross-module outputs:
  - SessionManager responsibility migration table
  - module-owned facades for persistence layout, session registry, continuity/recovery, compact/replay, and approval-memory surfaces where safe
  - updated `control-plane-atlas.md`
  - focused SessionManager boundary tests
  - preserved session schema and transcript behavior
- Product behavior boundary:
  - behavior-preserving extraction only
  - no `metadata.json`, `state.json`, or `transcript.jsonl` format changes
  - no session selection behavior change
  - no compact/replay behavior change
  - no approval memory semantics change
- Stop conditions:
  - extraction requires schema migration
  - extraction requires transcript JSONL format change
  - extraction changes lock/write order
  - extraction changes current-session selection
  - extraction changes compact/replay semantics
  - extraction becomes broad SessionManager rewrite instead of facade migration
- Capability lifecycle stage(s):
  - availability: session root/layout facts
  - policy: approval-memory facts only; no approval decision change
  - planning: no Agent Loop planning changes
  - execution: SessionManager API call behavior preserved
  - observation: session summaries and reentry facts
  - evidence: transcript-safe continuity/recovery evidence
  - result mapping: no result truthfulness changes
  - transcript: preserve transcript event shape and ordering
  - continue / replay: preserve replay, compact, reentry, and current-session behavior
  - eval: focused SessionManager boundary tests plus adjacent session/runtime gates
  - report: update migration doc and atlas
  - cleanup: preserve existing atomic write / residue behavior
  - redaction: no raw DOM/file dumps/secrets/provider config in summaries

## Goal

Run the owner-module extraction pass for `SessionManager.ts`.

`SessionManager.ts` should remain the stateful Session / Continue substrate, but it should not permanently own every sub-responsibility inside the module. After Routes 145 and 156, projection and runtime surfaces exist; Route 157 should now separate SessionManager's remaining mixed responsibilities into module-owned facades while preserving persistence behavior.

This route should answer:

- what must remain in `SessionManager.ts` as the stateful substrate?
- what belongs to session store/layout?
- what belongs to current-session registry?
- what belongs to compact/replay/continuity?
- what belongs to approval-memory persistence?
- what belongs to CLI-facing reentry summaries?

This route is successful when:

- [ ] `docs/architecture/sessionmanager-module-extraction.md` records a responsibility migration table before code motion
- [ ] at least three coherent responsibility families are moved or consolidated behind module-owned facades
- [ ] `SessionManager.ts` keeps filesystem state transitions and API orchestration, but loses non-substrate projection/codec/reentry detail
- [ ] facades expose stable module entrypoints instead of helper fragments
- [ ] `metadata.json`, `state.json`, `transcript.jsonl`, compact behavior, replay behavior, approval memory, and current-session behavior remain unchanged
- [ ] tests are checked for stale ownership assumptions and updated only when behavior is unchanged
- [ ] `control-plane-atlas.md` is updated with the new SessionManager ownership and next central file recommendation
- [ ] package sweep is not required unless escalation conditions are hit

This route is not successful if:

- [ ] it changes schemas or transcript format
- [ ] it changes current-session behavior
- [ ] it changes compact/replay behavior
- [ ] it changes approval memory behavior
- [ ] it only creates loose helpers without stable facades
- [ ] it performs broad file I/O rewrite
- [ ] it uses tests as the source of product behavior

## References

Target project evidence:

- `docs/architecture/session-runtime-module-extraction.md`
- `docs/architecture/session-substrate-seams.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/module-backlog.md`
- `docs/architecture/continuation-lineage-cleanup.md`
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/runtime-receipt-contract.md`
- `docs/agent-routes/module-route-template.md`

Reference projects to inspect:

- ClaudeCode:
  - session persistence / compact / resume surface
  - query/session history ownership
- opencode:
  - session storage and event processing boundary
  - permission/session persistence split
- OpenHands:
  - event store and conversation persistence boundary
- gemini-cli:
  - resume / current-session / command-state surface
- Inspect AI:
  - typed event log and report separation

Reference budget:

- ClaudeCode: max 10 files
- opencode: max 10 files
- OpenHands: max 8 files
- gemini-cli: max 6 files
- Inspect AI: max 4 files
- Stop reference reading once session store, registry, compact/replay, and event persistence boundaries are clear.

Do not inspect browser/edit/provider internals unless a SessionManager persistence field directly references their evidence summaries.

## Current Project Surfaces

Primary file:

- `packages/ts-shell/src/session/SessionManager.ts`

Likely related surfaces:

- `packages/ts-shell/src/session/sessionEventCodec.ts`
- `packages/ts-shell/src/session/sessionSummaryProjection.ts`
- `packages/ts-shell/src/session/sessionContinuationProjection.ts`
- `packages/ts-shell/src/session/sessionCompactProjection.ts`
- `packages/ts-shell/src/session/sessionMetadataProjection.ts`
- `packages/ts-shell/src/session/sessionReplayBuilder.ts`
- `packages/ts-shell/src/session/sessionResumeContextBuilder.ts`
- `packages/ts-shell/src/session/compactContinuitySummary.ts`
- `packages/ts-shell/src/session/compactRetentionPlanner.ts`
- `packages/ts-shell/src/session/currentSessionSelection.ts`
- `packages/ts-shell/src/session/durableStatusProjection.ts`
- `packages/ts-shell/src/session/approval*`
- `packages/ts-shell/src/core/shell/sessionPersistenceProjection.ts`
- `packages/ts-shell/src/core/shell/sessionFutureTurnProjection.ts`
- `packages/ts-shell/src/core/shell/sessionRuntime.ts`

Likely new or consolidated facade files:

- `packages/ts-shell/src/session/sessionStore.ts`
- `packages/ts-shell/src/session/sessionRegistry.ts`
- `packages/ts-shell/src/session/sessionContinuityModule.ts`
- `packages/ts-shell/src/session/sessionCompactModule.ts`
- `packages/ts-shell/src/session/sessionApprovalMemoryModule.ts`
- `packages/ts-shell/src/session/sessionManagerBoundary.test.ts`
- `docs/architecture/sessionmanager-module-extraction.md`

Choose names based on actual ownership. Prefer cohesive facades over many small helper files.

## Allowed Changes

- Create module-owned facades for session storage/layout, current-session registry, compact/replay/continuity, and approval-memory persistence surfaces.
- Move or consolidate pure payload/projection/codec calls behind those facades.
- Replace direct inline construction in `SessionManager.ts` with facade calls where behavior is identical.
- Update tests to target facade boundaries where appropriate.
- Update stale test names/comments that imply old ownership.
- Update `control-plane-atlas.md` and `module-backlog.md`.

## Explicit Non-Goals

Do not:

- change session schemas
- change transcript JSONL format
- change transcript event ordering
- change metadata/state file layout
- change atomic write / locking behavior
- change current-session selection behavior
- change compact retention policy
- change replay/resume semantics
- change approval memory semantics
- change CLI behavior
- change provider/browser/edit/runtime behavior
- add dependencies
- rewrite SessionManager broadly

## Boundaries

Hard boundaries:

- No provider/model live calls.
- No real-provider config reads or secrets.
- No browser capability expansion.
- No edit/patch capability expansion.
- No runtime execution expansion.
- No permission weakening.
- No result truthfulness changes.
- No session schema or transcript format changes.
- No CLI behavior changes.
- No dependency changes.
- No broad SessionManager rewrite.
- No hidden skips.
- No commit or push.

Validation tier:

- Tier 3 by default: cross-module Session / Continue facade extraction.
- Required:
  - focused SessionManager boundary tests
  - adjacent session tests for touched surfaces
  - `sessionRuntime` boundary tests if persistence payload surfaces are touched
  - full `runMvpIntegratedFlow.test.ts` if session/runtime integration path is touched
  - build
  - diff/status
- Package sweep is optional, not default.
- Escalate to package sweep only if:
  - schema/transcript format changes
  - current-session behavior changes
  - compact/replay behavior changes
  - approval memory behavior changes
  - broad test expectations are rebaselined
  - focused/runMvp gates reveal unexplained failures

## Capability Contract

| Stage | Current State | Route Change | Evidence Required |
|---|---|---|---|
| availability | session root/layout logic is inside SessionManager | facade-owned layout/store facts where safe | boundary tests |
| policy | approval memory persists through session helpers | approval memory facade, no semantics change | approval-memory tests |
| planning | no agent planning ownership | no change | none |
| execution | SessionManager API methods perform writes | keep write order, facade payload construction | SessionManager tests |
| observation | reentry/summary facts partly projected | facade-owned summaries where still inline | summary tests |
| evidence | continuation/recovery evidence exists | continuity facade ownership where safe | continuation/session tests |
| result mapping | durable status projections exist | no truthfulness change | result-contract only if touched |
| transcript | JSONL event format preserved | event/store facade, no format change | transcript tests |
| continue / replay | replay/compact/continuity helpers exist | module facade around remaining coordination | replay/compact tests |
| eval | session tests exist | preserve focused suite | validation output |
| report | no SessionManager extraction ledger yet | add migration doc | docs |
| cleanup | atomic writes / residue behavior exist | preserve | tests/no behavior drift |
| redaction | replay-safe filters exist | preserve | redaction assertions |

## Implementation Tasks

### 1. Create SessionManager responsibility migration document

Create `docs/architecture/sessionmanager-module-extraction.md`.

Before code changes, document a migration table.

Required columns:

- current code block / responsibility
- current owner file
- true owner module
- target facade or file
- migration decision:
  - extract now
  - facade existing helpers
  - leave in SessionManager
  - defer
  - do not move
- reason
- validation required
- risk

### 2. Categorize SessionManager responsibilities

Classify at least these families:

- session root/path/layout helpers
- metadata read/write
- state read/write
- transcript append/read
- transcript event construction
- add turn / save completed / save error / save interrupted
- current-session state
- session listing / reentry summaries
- compact retention and checkpoint input
- replay/resume context construction
- mutation continuity state
- approval memory persistence
- repair trust boundary / recovery summaries
- durable status projection
- test-only deterministic fixtures

Mark what belongs in SessionManager:

- filesystem state transition ordering
- lock/atomic write orchestration
- public SessionManager API methods
- calling module facades
- preserving schema and write order

Everything else should move behind a module facade or be explicitly deferred.

### 3. Extract session store facade

Candidate file:

- `sessionStore.ts`

Owner module:

- Session / Continue Engineering

Responsibilities:

- path/layout facts
- metadata/state/transcript file read/write payload normalization
- JSON parse/stringify wrappers where already behavior-preserving
- transcript append/read raw storage boundary

Do not change schema, atomic write, locking, ordering, or file locations.

If moving raw I/O is too risky, keep raw writes in SessionManager and extract only path/layout/payload normalization behind the facade.

### 4. Extract current-session registry facade

Candidate file:

- `sessionRegistry.ts`

Owner module:

- Session / Continue Engineering

Responsibilities:

- current-session record projection
- current-session missing/stale reason projection
- session list display/reentry facts
- delegation to existing `currentSessionSelection.ts`

Do not change current-session selection behavior.

### 5. Extract continuity / recovery facade

Candidate file:

- `sessionContinuityModule.ts`

Owner module:

- Session / Continue Engineering

Responsibilities:

- replay/resume context handoff
- mutation continuity facts
- recovery trust-boundary summary
- continuation evidence selection
- durable terminal evidence predicate consumption

Do not change replay or continuation behavior.

### 6. Extract compact facade

Candidate file:

- `sessionCompactModule.ts`

Owner module:

- Session / Continue Engineering

Responsibilities:

- compact retention input projection
- checkpoint summary facts
- compact continuity handoff
- delegation to existing compact retention planner

Do not change compact trigger, retention policy, or transcript truncation behavior.

### 7. Extract approval memory facade

Candidate file:

- `sessionApprovalMemoryModule.ts`

Owner modules:

- Session / Continue Engineering
- Permission / Policy Engineering

Responsibilities:

- approval memory persistence payloads
- approval memory replay/reentry summaries
- approval memory redaction/safety projection

Do not change approval semantics or trust policy.

### 8. Replace SessionManager inline construction

Update `SessionManager.ts`:

- keep method-level ordering and public API
- call facades for selected storage/registry/continuity/compact/approval responsibilities
- avoid direct internal projection fragments when a facade exists
- preserve all schemas and output formats

### 9. Update tests and stale ownership assumptions

Add `sessionManagerBoundary.test.ts`.

Required coverage:

- schema-compatible metadata projection
- schema-compatible state projection
- transcript event shape preserved
- current-session registry projection preserves existing selection facts
- compact facade preserves retention input
- continuity facade preserves replay-safe evidence selection
- approval memory facade preserves existing persistence facts
- SessionManager still calls public APIs in stable order where asserted
- no raw DOM/file dumps/secrets/provider config in projected summaries

Run existing SessionManager/session projection/replay/compact/current-session/approval tests.

Update tests to import module facades where they represent public module boundaries. Keep low-level helper tests only for complex pure logic.

### 10. Update docs

Update:

- `docs/architecture/sessionmanager-module-extraction.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/module-backlog.md`

At the end, classify `SessionManager.ts` as one of:

- still requires another extraction route
- acceptable stateful Session / Continue substrate
- should hand off to next central file

Recommend the next central file from the atlas:

- `resultMapper.ts`
- `cli.tsx`
- any remaining `SessionManager.ts` follow-up only if unavoidable

Do not assume the next file in advance.

## Validation

Focused validation:

- `rtk npm run test -w packages/ts-shell -- src/session/sessionManagerBoundary.test.ts`
- adjacent tests for touched SessionManager/session projection/replay/compact/current-session/approval files

Broader validation:

- `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntimeBoundary.test.ts src/core/shell/sessionRuntime.test.ts` if persistence payload surfaces are touched
- `rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts` if session/runtime integration behavior is touched
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
| SessionManager migration doc | `sessionmanager-module-extraction.md` | |
| at least three facades | facade files | |
| SessionManager inline responsibilities reduced | `SessionManager.ts` diff | |
| boundary tests | validation output | |
| schema/transcript preserved | tests + final audit | |
| atlas updated | `control-plane-atlas.md` | |
| final classification | atlas + migration doc | |
| next central file recommended | atlas/backlog note | |
| no behavior expansion | final audit | |

## Final Report Format

1. Branch and base commit
2. Files changed
3. What changed
4. SessionManager responsibility migration summary
5. Module facades created or consolidated
6. What remains in SessionManager
7. SessionManager final classification
8. Next central file recommended by atlas
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
