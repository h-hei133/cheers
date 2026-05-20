# Route 156: Result Surface - sessionRuntime module facade extraction

## Module

- Primary module: Result Surface Engineering
- Secondary modules:
  - Session / Continue Engineering
  - Agent Loop Engineering
  - Tool Engineering
  - Runtime Engineering
  - CLI / UX Engineering
  - Provider / Model Engineering
  - Browser Engineering
  - Edit / Patch Engineering
- Capability: `sessionRuntime.ts` module-owned facade extraction
- Cross-module inputs:
  - QueryEvent stream from Agent Loop
  - coding/terminal result from Result Surface
  - SessionManager persistence substrate
  - Session / Continue projections from Route 145
  - Tool / Policy / Result receipts from Route 146
  - Runtime receipts from Route 150
  - Agent Loop module facades from Routes 154-155
- Cross-module outputs:
  - sessionRuntime responsibility migration table
  - module facades for rendering / terminal accumulation / persistence payload construction
  - updated control-plane atlas
  - focused sessionRuntime facade tests
  - preserved CLI/session/result behavior
- Product behavior boundary:
  - behavior-preserving extraction only
  - no CLI output semantic changes
  - no session schema or transcript format changes
  - no result truthfulness changes
  - no capability behavior changes
- Stop conditions:
  - extraction requires changing resultMapper semantics
  - extraction requires changing SessionManager schema/persistence format
  - extraction requires CLI UX changes
  - extraction requires provider/browser/edit/runtime behavior changes
  - extraction becomes broad sessionRuntime rewrite instead of module-owned facade migration
- Capability lifecycle stage(s):
  - availability: consume runtime/session availability facts only
  - policy: consume existing policy/result facts only
  - planning: no planning changes
  - execution: no new execution
  - observation: render QueryEvent observations through facade
  - evidence: preserve evidence notes and transcript-safe summaries
  - result mapping: preserve resultMapper truthfulness
  - transcript: preserve SessionManager transcript payload semantics
  - continue / replay: preserve continuation/future-turn behavior
  - eval: focused facade tests plus sessionRuntime/runMvp where needed
  - report: update migration doc and atlas
  - cleanup: no new cleanup behavior
  - redaction: no raw DOM/file dumps/secrets/provider config in display or persistence payloads

## Goal

Run the owner-module extraction pass for `sessionRuntime.ts`.

`sessionRuntime.ts` is one of the remaining control-plane concentration files. It connects Agent Loop query events, terminal display, result accumulation, future-turn injection, and SessionManager persistence. It should remain the shell/runtime composition surface, but it should not own module-specific rendering, persistence payload projection, terminal status projection, or continuation evidence formatting details.

This route should migrate related responsibilities behind module-owned facades, not create loose helper fragments.

This route is successful when:

- [ ] `docs/architecture/session-runtime-module-extraction.md` records a responsibility migration table before code motion
- [ ] at least three coherent responsibility families are migrated or consolidated behind module-owned facades
- [ ] `sessionRuntime.ts` calls stable facades rather than internal projection fragments
- [ ] SessionManager schema, transcript JSONL shape, CLI behavior, and result truthfulness remain unchanged
- [ ] affected sessionRuntime tests are checked for stale ownership/output assumptions
- [ ] `control-plane-atlas.md` is updated with sessionRuntime ownership and next central file recommendation
- [ ] focused tests and required gates pass
- [ ] package sweep is not required unless escalation conditions are hit

This route is not successful if:

- [ ] it merely creates small helper files without module ownership
- [ ] it changes terminal output semantics
- [ ] it changes result classification
- [ ] it changes transcript/session persistence format
- [ ] it broadens provider/browser/edit/runtime behavior
- [ ] it skips updating the migration doc and atlas

## References

Target project evidence:

- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/runmvp-module-extraction.md`
- `docs/architecture/session-substrate-seams.md`
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/runtime-receipt-contract.md`
- `docs/architecture/agent-loop-turn-kernel.md`
- `docs/architecture/module-backlog.md`
- `docs/agent-routes/module-route-template.md`

Reference projects to inspect:

- OpenHands:
  - event store and action/observation event rendering
- opencode:
  - session processor and event/result handoff
- ClaudeCode:
  - query loop output, result messages, compact/session surface
- gemini-cli:
  - CLI/core runtime output and tool-call display surface
- Inspect AI:
  - event/log/report separation

Reference budget:

- OpenHands: max 8 files
- opencode: max 8 files
- ClaudeCode: max 8 files
- gemini-cli: max 6 files
- Inspect AI: max 4 files
- Stop reference reading once event rendering, terminal accumulation, and persistence payload boundaries are clear.

Do not inspect browser/edit/provider internals unless a sessionRuntime event branch directly requires the module facade boundary.

## Current Project Surfaces

Primary file:

- `packages/ts-shell/src/core/shell/sessionRuntime.ts`

Likely related surfaces:

- `packages/ts-shell/src/core/shell/sessionStateSurface.ts`
- `packages/ts-shell/src/core/shell/turnBoundarySurface.ts`
- `packages/ts-shell/src/core/query/resultMapper.ts`
- `packages/ts-shell/src/session/SessionManager.ts`
- `packages/ts-shell/src/session/sessionEventCodec.ts`
- `packages/ts-shell/src/session/sessionSummaryProjection.ts`
- `packages/ts-shell/src/session/sessionContinuationProjection.ts`
- `packages/ts-shell/src/session/sessionMetadataProjection.ts`
- `packages/ts-shell/src/core/tools/toolResultProjection.ts`
- `packages/ts-shell/src/core/runtime/runtimeReceiptProjection.ts`
- `packages/ts-shell/src/orchestration/resultSurfaceModule.ts`
- `packages/ts-shell/src/orchestration/turnReceiptAggregation.ts`
- existing sessionRuntime tests

Likely new or consolidated facade files:

- `packages/ts-shell/src/core/shell/sessionEventSurface.ts`
- `packages/ts-shell/src/core/shell/sessionTerminalState.ts`
- `packages/ts-shell/src/core/shell/sessionPersistenceProjection.ts`
- `packages/ts-shell/src/core/shell/sessionFutureTurnProjection.ts`
- `packages/ts-shell/src/core/shell/sessionRuntimeBoundary.test.ts`
- `docs/architecture/session-runtime-module-extraction.md`

Choose names based on actual ownership. Prefer cohesive facades over many one-function helpers.

## Allowed Changes

- Create module-owned facades for sessionRuntime rendering, terminal accumulation, persistence projection, and future-turn projection.
- Replace direct inline construction in `sessionRuntime.ts` with facade calls where behavior is identical.
- Consolidate existing display/projection helpers under stable facade entrypoints.
- Update tests to target facade boundaries where appropriate.
- Update stale test names/comments that imply old ownership.
- Update `control-plane-atlas.md` and `module-backlog.md`.

## Explicit Non-Goals

Do not:

- change QueryEvent schema
- change transcript JSONL shape
- change SessionManager state/metadata schema
- change resultMapper truthfulness
- change CLI UX or output semantics
- change approval/session/provider/browser/edit/runtime behavior
- change future-turn behavior
- add dependencies
- perform broad `sessionRuntime.ts` rewrite
- create helper-only final architecture

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
- No broad sessionRuntime rewrite.
- No hidden skips.
- No commit or push.

Validation tier:

- Tier 3 by default: cross-module Result Surface / Session facade extraction.
- Required:
  - focused sessionRuntime boundary tests
  - adjacent tests for sessionStateSurface / turnBoundarySurface / resultMapper / SessionManager if touched
  - full `runMvpIntegratedFlow.test.ts` if result/session output handoff is touched
  - `verify:result-contract` if result projection or terminal classification is touched
  - build
  - diff/status
- Package sweep is optional, not default.
- Escalate to package sweep only if:
  - terminal output expectations are broadly rebaselined
  - session schema/transcript format is touched
  - CLI behavior changes
  - resultMapper semantics change
  - focused/runMvp gates reveal unexplained failures

## Capability Contract

| Stage | Current State | Route Change | Evidence Required |
|---|---|---|---|
| availability | sessionRuntime consumes runtime/session facts inline | facade-owned display facts where selected | facade tests |
| policy | blocked/approval/policy facts render through event flow | no policy decision change | result-contract if touched |
| planning | no planning ownership | no change | none |
| execution | no execution ownership | no change | none |
| observation | QueryEvent rendering inline | module-owned event surface facade | sessionRuntime tests |
| evidence | evidence notes accumulated inline | facade-owned evidence display/persistence projection | redaction tests |
| result mapping | terminal status accumulated inline | facade-owned terminal state projection, preserving resultMapper | result-contract |
| transcript | persistence payload assembled near runtime | Session-owned persistence projection | SessionManager/session tests if touched |
| continue / replay | future-turn injection inline | future-turn projection facade | continuation/session tests |
| eval | sessionRuntime tests exist | focused boundary tests | validation output |
| report | no extraction ledger yet | add migration doc | docs |
| cleanup | no change | no change | none |
| redaction | redaction distributed | preserve via facade tests | redaction assertions |

## Implementation Tasks

### 1. Create sessionRuntime responsibility migration document

Create `docs/architecture/session-runtime-module-extraction.md`.

Before code changes, document a responsibility migration table.

Required columns:

- current code block / responsibility
- current owner file
- true owner module
- target facade or file
- migration decision:
  - extract now
  - facade existing helpers
  - leave in sessionRuntime
  - defer
  - do not move
- reason
- validation required
- risk

### 2. Categorize sessionRuntime responsibilities

Classify at least these families:

- QueryEvent rendering
- terminal status accumulation
- coding result accumulation
- future-turn injection
- persistence payload construction
- SessionManager write calls
- resultMapper handoff
- turn boundary rendering
- session state surface rendering
- tool/runtime/browser/edit/provider event display
- stdout/stderr/error display budgeting
- replay-safe evidence display
- CLI-facing fallback lines
- test-only deterministic surfaces

Mark what belongs in sessionRuntime:

- event consumption order
- invoking render/persistence facades
- coordinating ShellSessionRuntime turn output
- calling SessionManager persistence APIs

Everything else should move behind a module facade or be explicitly deferred.

### 3. Extract event rendering facade

Candidate file:

- `sessionEventSurface.ts`

Owner module:

- Result Surface Engineering

Responsibilities:

- map QueryEvent kinds to display/render facts
- preserve current displayed text
- classify render-only notes vs terminal-affecting events
- route tool/runtime/browser/provider/edit display summaries without understanding their internals

Do not change output text unless existing tests prove current wording is wrong.

### 4. Extract terminal state facade

Candidate file:

- `sessionTerminalState.ts`

Owner module:

- Result Surface Engineering

Responsibilities:

- accumulate terminal status facts
- preserve completed/stopped/error/interrupted behavior
- keep resultMapper as truthfulness owner
- provide stable terminal-state update functions

Do not change terminal classification.

### 5. Extract persistence projection facade

Candidate file:

- `sessionPersistenceProjection.ts`

Owner module:

- Session / Continue Engineering

Responsibilities:

- build SessionManager append/update payloads
- project query event persistence facts
- preserve transcript event shape
- preserve state/metadata updates
- produce replay-safe evidence summaries

Do not change SessionManager schema or file formats.

### 6. Extract future-turn projection facade

Candidate file:

- `sessionFutureTurnProjection.ts`

Owner module:

- Session / Continue Engineering

Responsibilities:

- project future-turn injection facts
- preserve pending prompt / injected future turn behavior
- preserve continuation/replay safety

Do not change future-turn semantics.

### 7. Replace sessionRuntime inline construction

Update `sessionRuntime.ts`:

- keep event loop and ordering
- call facades for selected event/render/terminal/persistence/future-turn responsibilities
- avoid direct access to module internals where facade exists
- preserve behavior exactly

### 8. Update tests and stale assumptions

Add `sessionRuntimeBoundary.test.ts`.

Required coverage:

- QueryEvent render facts preserve current text
- terminal state projection preserves completed/stopped/error/interrupted
- persistence projection preserves transcript/query event payload shape
- future-turn projection preserves injected turn facts
- replay-safe evidence excludes raw DOM/file dumps/secrets/provider config paths
- resultMapper remains source of truth
- sessionRuntime still coordinates event order

Run existing sessionRuntime/sessionState/turnBoundary/resultMapper tests if touched.

### 9. Update docs

Update:

- `docs/architecture/session-runtime-module-extraction.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/module-backlog.md`

At the end, classify `sessionRuntime.ts` as one of:

- still requires another extraction route
- acceptable shell/runtime composition root
- should hand off to next central file

Recommend the next central file from the atlas:

- `resultMapper.ts`
- `SessionManager.ts`
- `cli.tsx`

Do not assume the next file in advance.

## Validation

Focused validation:

- `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntimeBoundary.test.ts`
- adjacent tests for touched sessionRuntime/sessionState/turnBoundary/resultMapper/session files

Broader validation:

- `rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts` if result/session output handoff is touched
- `rtk npm run verify:result-contract` if result/terminal classification is touched
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
| sessionRuntime migration doc | `session-runtime-module-extraction.md` | |
| event surface facade | facade file | |
| terminal state facade | facade file | |
| persistence projection facade | facade file | |
| future-turn projection facade | facade file | |
| boundary tests | validation output | |
| sessionRuntime direct construction reduced | `sessionRuntime.ts` diff | |
| atlas updated | `control-plane-atlas.md` | |
| final classification | atlas + migration doc | |
| no behavior expansion | final audit | |

## Final Report Format

1. Branch and base commit
2. Files changed
3. What changed
4. sessionRuntime responsibility migration summary
5. Module facades created or consolidated
6. What remains in sessionRuntime
7. sessionRuntime final classification
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
