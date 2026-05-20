# Route 154: Agent Loop - runMvp module facade extraction

## Module

- Primary module: Agent Loop Engineering
- Secondary modules:
  - Edit / Patch Engineering
  - Workspace / File Context Engineering
  - Tool Engineering
  - Runtime Engineering
  - Session / Continue Engineering
  - Result Surface Engineering
  - Provider / Model Engineering
  - Browser Engineering
- Capability: module-owned facade extraction from `runMvpIntegratedFlow.ts`
- Cross-module inputs:
  - Route 152 turn kernel
  - Route 151 workspace/file context contract
  - Route 150 runtime receipt contract
  - Route 146 tool/policy/result contract
  - Route 145 session substrate seams
  - current edit/browser/provider/read/verification/continuation helpers
- Cross-module outputs:
  - `runMvpIntegratedFlow.ts` responsibility migration table
  - module-owned facades for extracted responsibility families
  - updated `control-plane-atlas.md`
  - focused facade tests
  - preserved runMvp behavior
- Product behavior boundary:
  - behavior-preserving extraction only
  - no new capability behavior
  - no new execution paths
  - no policy, workspace, provider, browser, edit, session, CLI, or result semantics changes
- Stop conditions:
  - extraction requires behavior change
  - extraction requires new write/browser/provider/runtime capability
  - extraction requires schema, CLI, dependency, or permission change
  - extraction becomes a broad runMvp rewrite instead of module-owned facade migration
- Capability lifecycle stage(s):
  - availability: consume module availability facts
  - policy: consume module policy facts
  - planning: keep Agent Loop composition; move module-specific planning behind module facades
  - execution: no new execution
  - observation: consume module observations
  - evidence: consume module evidence summaries
  - result mapping: delegate module-specific result shaping to module facades/result surface
  - transcript: consume replay-safe summaries
  - continue / replay: preserve continuation lineage contract
  - eval: run focused facade tests and runMvp
  - report: update extraction ledger and atlas
  - cleanup: no new cleanup behavior
  - redaction: preserve existing redaction

## Goal

Start the owner-module extraction pass for `runMvpIntegratedFlow.ts`.

This route should not ask "can this code be moved to a helper?".
It should ask "does this responsibility belong to Agent Loop, or should it be owned by another module facade?"

`runMvpIntegratedFlow.ts` should remain the Agent Loop composition root. It may orchestrate module facades, but it should not keep accumulating edit, workspace, provider, browser, tool, session, runtime, or result-surface details.

This route is successful when:

- [ ] `docs/architecture/runmvp-module-extraction.md` records a responsibility migration table for `runMvpIntegratedFlow.ts`
- [ ] at least three related responsibility families are migrated or consolidated behind module-owned facades
- [ ] each extracted surface belongs to a named module, not a pile of loose helpers
- [ ] facades expose stable module entrypoints and hide internal helper fragments
- [ ] `runMvpIntegratedFlow.ts` keeps behavior but loses module-specific detail
- [ ] `control-plane-atlas.md` is updated with the new ownership
- [ ] relevant tests are checked for stale assumptions and updated only when behavior is unchanged
- [ ] full `runMvpIntegratedFlow.test.ts` remains green
- [ ] package sweep is not required unless escalation conditions are hit

This route is not successful if:

- [ ] it only creates new helper fragments without module facades
- [ ] it performs a broad main-loop rewrite
- [ ] it changes product behavior
- [ ] it moves code without documenting ownership and migration rationale
- [ ] it leaves the atlas out of date
- [ ] it expands edit/browser/provider/runtime/CLI behavior

## References

Target project evidence:

- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/module-roadmap-reset.md`
- `docs/architecture/module-backlog.md`
- `docs/architecture/agent-loop-turn-kernel.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/runtime-receipt-contract.md`
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/session-substrate-seams.md`
- `docs/architecture/future-edit-expansion-contract.md`
- `docs/agent-routes/module-route-template.md`

Reference projects to inspect:

- opencode:
  - session processor
  - tool execution context
  - permission boundary
- ClaudeCode:
  - query loop
  - tool/session result handoff
- OpenHands:
  - action/observation event loop
  - event store boundary
- gemini-cli:
  - CLI/core handoff
  - tool-call lifecycle
- mini-swe-agent:
  - simple turn loop and trajectory shape

Reference budget:

- opencode: max 10 files
- ClaudeCode: max 8 files
- OpenHands: max 8 files
- gemini-cli: max 6 files
- mini-swe-agent: max 4 files
- Stop reference reading once module facade ownership and loop composition patterns are clear.

Do not inspect browser/edit/provider internals unless the extraction target directly touches that module facade.

## Current Project Surfaces

Primary file:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`

Likely involved existing facades/seams:

- `packages/ts-shell/src/orchestration/turnKernel.ts`
- `packages/ts-shell/src/orchestration/turnCapabilityPlan.ts`
- `packages/ts-shell/src/orchestration/turnReceiptAggregation.ts`
- `packages/ts-shell/src/orchestration/flowDispatch.ts`
- `packages/ts-shell/src/orchestration/flowResultProjection.ts`
- `packages/ts-shell/src/orchestration/flowEvidenceProjection.ts`
- `packages/ts-shell/src/orchestration/workspaceFileContract.ts`
- `packages/ts-shell/src/orchestration/workspaceTargetProjection.ts`
- `packages/ts-shell/src/orchestration/editExpectationContract.ts`
- `packages/ts-shell/src/orchestration/futureEditContract.ts`
- `packages/ts-shell/src/orchestration/futureEditPlanner.ts`
- `packages/ts-shell/src/orchestration/verificationPlanner.ts`
- `packages/ts-shell/src/orchestration/verificationResultProjection.ts`
- `packages/ts-shell/src/orchestration/continuationIntent.ts`
- `packages/ts-shell/src/orchestration/continuationLineage.ts`
- `packages/ts-shell/src/orchestration/continuationRebase.ts`
- `packages/ts-shell/src/orchestration/continuationProjection.ts`
- browser agent/transaction facade files
- provider outcome projection files
- tool/runtime receipt files

Likely new facade files, only if ownership is clear:

- `packages/ts-shell/src/orchestration/readInspectModule.ts`
- `packages/ts-shell/src/orchestration/verificationModule.ts`
- `packages/ts-shell/src/orchestration/continuationModule.ts`
- `packages/ts-shell/src/orchestration/workspaceContextModule.ts`
- `packages/ts-shell/src/orchestration/editPatchModule.ts` if not already present or needs consolidation
- `packages/ts-shell/src/orchestration/agentLoopModuleBoundary.test.ts`
- `docs/architecture/runmvp-module-extraction.md`

Prefer consolidating existing helper clusters behind module facades over adding new leaf helpers.

## Allowed Changes

- Create or consolidate module facades around existing helper clusters.
- Replace direct runMvp calls to helper fragments with module facade calls.
- Move related projection/classification calls together when ownership is clear.
- Update tests to import module facades rather than internal helper fragments where appropriate.
- Update stale test expectations only when behavior is unchanged and current surface is already validated.
- Update `control-plane-atlas.md` and `runmvp-module-extraction.md`.

## Explicit Non-Goals

Do not:

- change runtime behavior
- change provider/model behavior
- change browser behavior
- change edit/write behavior
- change workspace authority or stale-read behavior
- change permission/approval decisions
- change resultMapper truthfulness
- change SessionManager schema or transcript format
- change CLI behavior
- add dependencies
- perform broad code motion without module ownership
- create helper-only architecture as the final state

## Boundaries

Hard boundaries:

- No provider/model live calls.
- No browser capability expansion.
- No edit/patch capability expansion.
- No runtime execution expansion.
- No broad shell/allowlist expansion.
- No permission weakening.
- No workspace authority weakening.
- No stale-read bypass.
- No schema/CLI/dependency changes.
- No broad runMvp rewrite.
- No hidden skips.
- No commit or push.

Validation tier:

- Tier 3 by default: cross-module facade extraction.
- Required:
  - focused facade tests
  - adjacent tests for touched modules
  - full `runMvpIntegratedFlow.test.ts`
  - `verify:edit-capability-closeout` if edit/workspace mutation paths are touched
  - `verify:result-contract` if result/evidence surfaces are touched
  - build
  - diff/status
- Package sweep is optional, not default.
- Escalate to package sweep only if:
  - execution semantics change
  - permission behavior changes
  - CLI/schema/dependency changes
  - package scripts change
  - broad test expectations change
  - focused/runMvp gates show unexplained failures

## Capability Contract

| Stage | Current State | Route Change | Evidence Required |
|---|---|---|---|
| availability | module facts consumed directly in runMvp | facade-owned availability projection where targeted | facade tests |
| policy | module policy facts consumed directly | facade-owned policy summary where targeted | policy preservation tests |
| planning | mixed helper calls in main loop | module-owned planning/classification facade for selected families | runMvp + facade tests |
| execution | existing paths execute | no execution change | runMvp green |
| observation | module observations vary | facade returns safe observation summary where targeted | redaction tests |
| evidence | evidence helpers called directly | facade-owned evidence surface | result-contract |
| result mapping | result shaping partly inline | facade returns result handoff or receipt | result-contract |
| transcript | transcript-safe summaries exist | facade exposes stable replay-safe summary | continuation tests if touched |
| continue / replay | continuation helpers exist | facade boundary for continuation cluster if targeted | continuation tests |
| eval | runMvp green | preserve green | runMvp |
| report | docs scattered | update extraction ledger and atlas | docs |
| cleanup | module-owned cleanup | no change | no cleanup behavior diff |
| redaction | module-specific redaction | preserve via facade tests | redaction assertions |

## Implementation Tasks

### 1. Create runMvp responsibility migration document

Create `docs/architecture/runmvp-module-extraction.md`.

Before moving code, document a responsibility migration table.

Required columns:

- current code block / responsibility
- current owner file
- true owner module
- target facade or file
- migration decision:
  - extract now
  - facade existing helpers
  - leave in Agent Loop
  - defer
  - do not move
- reason
- validation required
- risk

This document should be updated after extraction.

### 2. Categorize runMvp responsibilities

Classify at least these families:

- turn composition and ordering
- intent classification
- read/inspect routing
- workspace target handling
- edit/write expectation handling
- future edit planning
- verification planning/result projection
- continuation/lineage/rebase
- command/tool dispatch
- runtime receipt consumption
- browser transaction handoff
- provider diagnostic handoff
- result/evidence/transcript projection
- fallback/stopped result construction
- test-only deterministic paths

Mark what actually belongs to Agent Loop:

- turn ordering
- capability selection composition
- calling module facades
- aggregating module receipts
- final handoff to result surface

Everything else should either move behind a module facade or be explicitly deferred.

### 3. Build module facades for related clusters

Extract at least three related clusters in this route.

Preferred clusters:

#### Read / Inspect / Workspace facade

Facade should own:

- read intent classification
- read continuation target projection
- repo explain evidence projection
- workspace target projection
- no-write target stopped surface

Candidate facade:

- `readInspectModule.ts` or `workspaceContextModule.ts`

#### Verification facade

Facade should own:

- verify selection
- skipped/not-requested/retry logic
- verification result projection
- verification evidence summary

Candidate facade:

- `verificationModule.ts`

#### Continuation facade

Facade should own:

- continuation intent
- lineage
- rebase
- continuation projection
- replay-safe activation summary

Candidate facade:

- `continuationModule.ts`

#### Edit / Patch facade

Facade should own:

- edit expectation contract
- future edit contract/planner
- current/future edit stopped result projection
- workspace target input projection where edit-owned

Candidate facade:

- `editPatchModule.ts`

Do not extract all clusters if doing so risks behavior drift. Pick at least three coherent clusters.

### 4. Replace runMvp direct helper calls with facades

In `runMvpIntegratedFlow.ts`, replace direct calls to internal helper fragments with module facade calls.

Rules:

- no execution order change
- no changed return semantics
- no new branching behavior
- no broader capability support
- no hidden fallback changes

### 5. Ensure facades hide internal fragments

Tests and call sites should prefer facade entrypoints.

Internal helper files may remain, but `runMvpIntegratedFlow.ts` should not depend on them directly when a module facade now owns the cluster.

Helper files are acceptable as implementation details behind the facade.

### 6. Update tests and stale assumptions

For every touched cluster:

- run focused tests
- inspect whether tests import internal helpers that should now be considered facade-internal
- update tests to target facade boundaries where appropriate
- keep lower-level tests only for complex pure logic
- update stale test names/comments that mention old ownership

Do not weaken assertions.

### 7. Update atlas

Update `docs/architecture/control-plane-atlas.md`.

Record:

- runMvp responsibility reduction
- new module facades
- what remains in Agent Loop
- what is deferred
- next file recommended from the five central files

The next file recommendation should be chosen from the atlas concentration list:

- `SessionManager.ts`
- `cli.tsx`
- `sessionRuntime.ts`
- `resultMapper.ts`

Do not assume the next file is always SessionManager or CLI.

### 8. Backlog update

Update `docs/architecture/module-backlog.md`.

Route 155 should follow the next central file recommendation from updated atlas.

## Validation

Focused validation:

- facade tests added/updated in this route
- adjacent tests for read/inspect, verification, continuation, edit, workspace, and result helpers touched

Broader validation:

- `rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts`
- `rtk npm run verify:edit-capability-closeout` if edit/workspace mutation paths are touched
- `rtk npm run verify:result-contract` if result/evidence projection paths are touched
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
| runMvp migration document | `runmvp-module-extraction.md` | |
| at least three module facades | facade files | |
| runMvp direct calls reduced | `runMvpIntegratedFlow.ts` diff | |
| facade tests | test output | |
| atlas updated | `control-plane-atlas.md` | |
| next central file recommended | atlas/backlog note | |
| runMvp green | validation output | |
| no behavior expansion | final audit | |

## Final Report Format

1. Branch and base commit
2. Files changed
3. What changed
4. runMvp responsibility migration summary
5. Module facades created or consolidated
6. What remains in Agent Loop
7. Next central file recommended by atlas
8. Validation tier used and why package sweep was or was not run
9. Validation commands and results
10. Real-provider gate status
11. External MCP status
12. Audit/history residue handling
13. Source/package change confirmation
14. Remaining risks
15. Best next action
16. Proposed commit message

Do not commit or push.
