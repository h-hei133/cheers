# Route 155: Agent Loop - runMvp execution/result facade extraction

## Module

- Primary module: Agent Loop Engineering
- Secondary modules:
  - Tool Engineering
  - Runtime Engineering
  - Result Surface Engineering
  - Provider / Model Engineering
  - Browser Engineering
  - Edit / Patch Engineering
  - Session / Continue Engineering
  - Workspace / File Context Engineering
- Capability: execution/result facade extraction from `runMvpIntegratedFlow.ts`
- Cross-module inputs:
  - Route 154 runMvp module extraction ledger
  - Route 154 facades for read/inspect, verification, continuation
  - Route 152 turn kernel
  - Route 150 runtime receipts
  - Route 146 tool/policy/result contract
  - Route 151 workspace/file context contract
  - existing provider/browser/edit/tool result helpers
- Cross-module outputs:
  - updated runMvp responsibility migration table
  - module-owned execution/result facades for selected heavy clusters
  - reduced direct runMvp ownership of execution/result construction
  - updated control-plane atlas
  - focused facade and runMvp preservation tests
- Product behavior boundary:
  - behavior-preserving extraction only
  - no new execution path
  - no changed result truthfulness
  - no changed provider/browser/edit/tool/session behavior
- Stop conditions:
  - extraction requires behavior change
  - extraction requires provider live/config behavior
  - extraction requires browser/edit/runtime capability expansion
  - extraction requires resultMapper semantic change
  - extraction requires broad runMvp rewrite
- Capability lifecycle stage(s):
  - availability: consume module-owned availability facts
  - policy: consume module-owned policy facts
  - planning: keep turn ordering in Agent Loop
  - execution: move selected execution handoff construction behind module facades; do not change execution
  - observation: consume module observations through facades
  - evidence: consume module evidence summaries through facades
  - result mapping: move selected result handoff construction behind Result Surface or module facades
  - transcript: preserve replay-safe summaries
  - continue / replay: preserve Route 142/145 semantics
  - eval: focused facade tests and full runMvp
  - report: update runMvp extraction ledger and atlas
  - cleanup: preserve module-owned cleanup
  - redaction: preserve redaction

## Goal

Continue the owner-module extraction pass for `runMvpIntegratedFlow.ts`, focusing on heavier execution/result composition that Route 154 deferred.

Route 154 facaded read/inspect/workspace, verification, and continuation. It intentionally deferred heavier areas:

- edit execution facade adoption
- browser module facade
- provider diagnostic/execution facade
- runtime receipt consumer adoption
- generic result surface handoff
- command/tool dispatch lifecycle facade
- fallback/stopped result construction

Route 155 should migrate at least three coherent heavy responsibility clusters behind module-owned facades, while keeping `runMvpIntegratedFlow.ts` as Agent Loop composition root.

This route is successful when:

- [ ] `docs/architecture/runmvp-module-extraction.md` is updated before and after extraction
- [ ] at least three heavy deferred clusters are moved or consolidated behind module-owned facades
- [ ] each facade belongs to a true owner module and hides internal helper fragments
- [ ] `runMvpIntegratedFlow.ts` no longer constructs selected execution/result details directly
- [ ] `control-plane-atlas.md` is updated with what remains and whether runMvp is acceptable as composition root
- [ ] full `runMvpIntegratedFlow.test.ts` remains green
- [ ] package sweep is not required unless escalation conditions are hit

This route is not successful if:

- [ ] it only wraps existing helper calls without moving a deferred heavy responsibility
- [ ] it changes product behavior
- [ ] it broadens edit/browser/provider/runtime behavior
- [ ] it weakens result truthfulness
- [ ] it creates helper-only architecture instead of module facades
- [ ] it does not update the extraction ledger and atlas

## References

Target project evidence:

- `docs/architecture/runmvp-module-extraction.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/agent-loop-turn-kernel.md`
- `docs/architecture/runtime-receipt-contract.md`
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/future-edit-expansion-contract.md`
- `docs/architecture/session-substrate-seams.md`
- `docs/architecture/runmvp-package-closeout.md`

Reference projects to inspect:

- opencode:
  - tool execution context
  - permission/result separation
  - session processor handoff
- ClaudeCode:
  - query loop
  - tool result handoff
  - provider/tool diagnostic output
- OpenHands:
  - action/observation event loop
  - event store/result handoff
- gemini-cli:
  - tool-call lifecycle
  - CLI/core runtime result handoff
- mini-swe-agent:
  - compact command execution trajectory

Reference budget:

- opencode: max 10 files
- ClaudeCode: max 8 files
- OpenHands: max 8 files
- gemini-cli: max 6 files
- mini-swe-agent: max 4 files
- Stop reference reading once execution/result facade boundaries are clear.

Do not inspect broad browser/edit/provider internals unless the selected cluster requires the module facade boundary.

## Current Project Surfaces

Primary file:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`

Existing module facades:

- `packages/ts-shell/src/orchestration/readInspectModule.ts`
- `packages/ts-shell/src/orchestration/verificationModule.ts`
- `packages/ts-shell/src/orchestration/continuationModule.ts`
- `packages/ts-shell/src/orchestration/editPatchModule.ts` if present

Likely existing seams:

- `packages/ts-shell/src/orchestration/flowDispatch.ts`
- `packages/ts-shell/src/orchestration/turnKernel.ts`
- `packages/ts-shell/src/orchestration/turnReceiptAggregation.ts`
- `packages/ts-shell/src/orchestration/flowResultProjection.ts`
- `packages/ts-shell/src/orchestration/flowEvidenceProjection.ts`
- `packages/ts-shell/src/core/runtime/runtimeReceipt.ts`
- `packages/ts-shell/src/core/runtime/runtimeReceiptProjection.ts`
- `packages/ts-shell/src/core/tools/toolPolicyResult.ts`
- `packages/ts-shell/src/core/tools/toolResultProjection.ts`
- `packages/ts-shell/src/orchestration/providerOutcomeProjection.ts`
- browser agent / transaction / result files
- edit mutation execution / result files
- runtime outcome projection files

Likely new or consolidated facades:

- `packages/ts-shell/src/orchestration/toolRuntimeModule.ts`
- `packages/ts-shell/src/orchestration/resultSurfaceModule.ts`
- `packages/ts-shell/src/orchestration/providerModule.ts`
- `packages/ts-shell/src/orchestration/browserModule.ts`
- `packages/ts-shell/src/orchestration/editExecutionModule.ts`
- `packages/ts-shell/src/orchestration/agentLoopExecutionBoundary.test.ts`

Choose at least three coherent clusters. Do not create all files if ownership is not clear.

## Allowed Changes

- Create module facades around existing execution/result clusters.
- Replace direct runMvp construction with facade calls.
- Move related projection/classification calls together under module-owned facades.
- Update tests to assert facade boundaries.
- Update `runmvp-module-extraction.md` and `control-plane-atlas.md`.
- Update `module-backlog.md`.

## Explicit Non-Goals

Do not:

- change execution order
- change command/tool behavior
- change provider/model behavior
- change browser behavior
- change edit/write behavior
- change permission/approval decisions
- change workspace authority or stale-read behavior
- change resultMapper truthfulness
- change SessionManager schema or transcript format
- change CLI behavior
- add dependencies
- perform broad main-loop rewrite

## Boundaries

Hard boundaries:

- No provider/model live calls.
- No real-provider config reads or secrets.
- No browser capability expansion.
- No edit/patch capability expansion.
- No runtime execution expansion.
- No broad shell/allowlist expansion.
- No permission weakening.
- No workspace authority weakening.
- No stale-read bypass.
- No result truthfulness weakening.
- No schema/CLI/dependency changes.
- No broad runMvp rewrite.
- No hidden skips.
- No commit or push.

Validation tier:

- Tier 3 by default: cross-module execution/result facade extraction.
- Required:
  - focused execution-boundary facade tests
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
  - CLI/schema/dependency/package scripts change
  - package-level timeout-sensitive harnesses are touched
  - broad output expectations are rebaselined
  - focused/runMvp gates reveal unexplained failures

## Capability Contract

| Stage | Current State | Route Change | Evidence Required |
|---|---|---|---|
| availability | direct module facts still appear in runMvp | facade-owned availability summaries where selected | facade tests |
| policy | policy facts consumed in selected branches | facade-owned policy snapshots, no decisions changed | policy preservation tests |
| planning | turn ordering remains in runMvp | no planning change except module handoff shape | runMvp |
| execution | selected execution handoff construction is inline | module facade owns execution handoff object/projection | facade tests |
| observation | observations are capability-local | facade returns safe observation summary | redaction tests |
| evidence | evidence projection partly inline | facade-owned evidence handoff | result-contract |
| result mapping | fallback/stopped result construction partly inline | selected result handoff goes through Result Surface/module facade | result-contract |
| transcript | safe summaries exist | preserve transcript handoff | continuation/session tests if touched |
| continue / replay | continuation facade exists | preserve | runMvp |
| eval | runMvp green | preserve | runMvp |
| report | migration doc exists | update ledger and atlas | docs |
| cleanup | module-owned cleanup facts exist | preserve | cleanup-adjacent tests if touched |
| redaction | module-specific redaction exists | preserve via facade tests | redaction assertions |

## Implementation Tasks

### 1. Re-open runMvp migration ledger

Before code changes, update `docs/architecture/runmvp-module-extraction.md`.

Add a Route 155 section:

- what Route 154 completed
- what heavy responsibilities remain
- which clusters Route 155 will target
- why each belongs to its owner module
- target facade
- validation required
- stop condition

### 2. Select at least three heavy clusters

Prioritize from these deferred clusters:

#### A. Tool / Runtime dispatch result handoff

Owner modules:

- Tool Engineering
- Runtime Engineering
- Result Surface Engineering

Facade candidate:

- `toolRuntimeModule.ts`

Responsibilities:

- command/tool dispatch result handoff
- runtime receipt projection consumption
- command success/failure/stopped summary
- tool lifecycle projection boundary
- transcript-safe command/runtime summary

#### B. Provider diagnostic handoff

Owner module:

- Provider / Model Engineering

Facade candidate:

- `providerModule.ts`

Responsibilities:

- provider diagnostic handoff projection
- provider outcome summary
- provider not-configured/opt-in status projection
- no real-provider config read
- no provider execution behavior change

#### C. Browser transaction/result handoff

Owner module:

- Browser Engineering

Facade candidate:

- `browserModule.ts`

Responsibilities:

- browser plan/transaction result summary
- browser stopped/unavailable/policy result projection
- browser evidence redaction summary
- no public web or browser behavior expansion

#### D. Edit execution/result handoff

Owner module:

- Edit / Patch Engineering

Facade candidate:

- `editExecutionModule.ts` or consolidation into `editPatchModule.ts`

Responsibilities:

- bounded mutation execution handoff object
- edit/patch result summary
- unsupported future edit stopped result
- verification eligibility summary
- no writer behavior change

#### E. Generic result surface fallback

Owner module:

- Result Surface Engineering

Facade candidate:

- `resultSurfaceModule.ts`

Responsibilities:

- fallback stopped result construction
- capability result to coding summary projection
- terminal-safe reason/do-next projection
- resultMapper-compatible summary

Pick at least three. Prefer clusters with strong existing tests.

### 3. Build or consolidate module facades

For selected clusters:

- expose one stable module entrypoint per module
- hide internal helper fragments
- keep existing helpers behind the facade
- avoid leaf-helper proliferation
- write facade tests at the module boundary

### 4. Replace runMvp direct calls

Update `runMvpIntegratedFlow.ts`:

- replace direct internal helper calls with module facade calls
- reduce inline result/evidence/summary construction
- preserve branch order and return semantics
- do not move actual execution unless only moving handoff object construction

### 5. Update tests and ownership assumptions

For touched modules:

- add or update facade boundary tests
- update tests importing internal helpers if the helper is now facade-internal
- preserve low-level tests for complex pure functions
- inspect comments/names for stale ownership claims
- do not weaken assertions

### 6. Update documentation

Update:

- `docs/architecture/runmvp-module-extraction.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/module-backlog.md`

At the end of this route, classify `runMvpIntegratedFlow.ts` state as one of:

- still requires Route 156 runMvp extraction
- acceptable Agent Loop composition root
- should hand off to next central file

If still not acceptable, list exact remaining non-Agent-Loop responsibilities.

## Validation

Focused validation:

- facade tests added/updated in this route
- adjacent tests for selected clusters

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
| Route 155 ledger update | `runmvp-module-extraction.md` | |
| at least three heavy clusters selected | ledger table | |
| module facades built/consolidated | facade files | |
| runMvp direct calls reduced | `runMvpIntegratedFlow.ts` diff | |
| facade tests | validation output | |
| atlas updated | `control-plane-atlas.md` | |
| runMvp status classified | atlas + ledger | |
| runMvp green | validation output | |
| no behavior expansion | final audit | |

## Final Report Format

1. Branch and base commit
2. Files changed
3. What changed
4. Heavy clusters extracted
5. Module facades created or consolidated
6. runMvp responsibility reduction
7. runMvp final classification
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
