# Route 152: Agent Loop - turn kernel extraction

## Module

- Primary module: Agent Loop Engineering
- Secondary modules: Tool Engineering, Runtime Engineering, Workspace / File Context Engineering, Result Surface Engineering, Session / Continue Engineering, Edit / Patch Engineering, Browser Engineering, Provider / Model Engineering
- Capability: agent turn kernel and capability dispatch receipt consumption
- Cross-module inputs:
  - Tool / Policy / Result receipt vocabulary
  - Runtime Receipt projection
  - Workspace / File Context target and authority projections
  - Session continuation / replay-safe summaries
  - Edit expectation and future edit contracts
  - Browser transaction / observation summaries
  - Provider readiness and diagnostic outcome projection
- Cross-module outputs:
  - turn intent summary
  - capability dispatch plan
  - capability receipt aggregation
  - generic result handoff
  - transcript-safe turn summary
  - focused turn-kernel tests
- Product behavior boundary:
  - extract orchestration seams from `runMvpIntegratedFlow.ts`
  - preserve current behavior and result truthfulness
  - do not add new capability behavior
- Stop conditions:
  - needing to change provider/model behavior
  - needing to expand browser/edit/runtime behavior
  - needing schema/CLI/dependency changes
  - needing broad `runMvpIntegratedFlow.ts` rewrite
- Capability lifecycle stage(s):
  - availability: consume module availability facts
  - policy: consume policy outcomes, do not decide policy
  - planning: classify turn and select module-owned capability path
  - execution: no new execution; call existing paths
  - observation: aggregate module observations
  - evidence: aggregate safe evidence ids and summaries
  - result mapping: hand off to existing result projections
  - transcript: produce replay-safe turn summary
  - continue / replay: preserve Route 142/145 continuation contracts
  - eval: focused turn-kernel and runMvp tests
  - report: architecture closeout doc
  - cleanup: no new cleanup behavior
  - redaction: no raw DOM/file dumps/secrets in turn summaries

## Goal

Extract the next Agent Loop seam: a small turn kernel that composes module-owned contracts instead of embedding more capability-specific decisions inside `runMvpIntegratedFlow.ts`.

Routes 145, 146, 150, and 151 prepared the needed module inputs:

- Session / Continue substrate projections
- Tool / Policy / Result receipt vocabulary
- Runtime Receipt projection
- Workspace / File Context target/authority/stale-read projections

Route 152 should use those seams to reduce `runMvpIntegratedFlow.ts` responsibility density without changing product behavior.

This route is successful when:

- [ ] a turn-kernel helper owns turn intent / capability dispatch summary projection
- [ ] capability receipt aggregation is centralized for high-value paths
- [ ] `runMvpIntegratedFlow.ts` delegates more projection/dispatch shaping to helpers
- [ ] provider/browser/edit/tool/session behavior remains unchanged
- [ ] full `runMvpIntegratedFlow.test.ts` remains green
- [ ] package sweep is not required unless escalation conditions are hit
- [ ] owning module, lifecycle stage, inputs/outputs, boundary, validation gate, and stop conditions are explicit

This route is not successful if:

- [ ] it rewrites the main loop
- [ ] it changes capability behavior
- [ ] it adds new edit/browser/provider/runtime execution
- [ ] it moves policy decisions into the turn kernel
- [ ] it bypasses module-owned contracts
- [ ] it hides validation failures behind skips

## References

Target project evidence:

- `docs/architecture/module-roadmap-reset.md`
- `docs/architecture/module-backlog.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/runtime-receipt-contract.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/session-substrate-seams.md`
- `docs/architecture/continuation-lineage-cleanup.md`
- `docs/architecture/runmvp-package-closeout.md`

Reference projects to inspect:

- ClaudeCode: query loop, tool result handoff, compact/session continuation
- opencode: session processor, tool context, permission/result separation
- OpenHands: action/observation event loop and event store
- gemini-cli: CLI/core handoff and tool-call lifecycle
- mini-swe-agent: small agent loop and trajectory shape
- Inspect AI: solver/task/log/report separation

Reference budget:

- ClaudeCode: max 8 files
- opencode: max 10 files
- OpenHands: max 8 files
- gemini-cli: max 6 files
- mini-swe-agent + Inspect AI: max 8 files total
- Stop condition for reference reading: stop once turn loop, dispatch receipt, and observation/result handoff shape are clear

## Current Project Surfaces

Likely involved:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- `packages/ts-shell/src/orchestration/flowDispatch.ts`
- `packages/ts-shell/src/orchestration/flowResultProjection.ts`
- `packages/ts-shell/src/orchestration/flowEvidenceProjection.ts`
- `packages/ts-shell/src/orchestration/verificationPlanner.ts`
- `packages/ts-shell/src/orchestration/continuationIntent.ts`
- `packages/ts-shell/src/orchestration/continuationLineage.ts`
- `packages/ts-shell/src/orchestration/readInspectIntent.ts`
- `packages/ts-shell/src/orchestration/editExpectationContract.ts`
- `packages/ts-shell/src/orchestration/futureEditContract.ts`
- `packages/ts-shell/src/orchestration/workspaceFileContract.ts`
- `packages/ts-shell/src/core/tools/toolPolicyResult.ts`
- `packages/ts-shell/src/core/runtime/runtimeReceipt.ts`
- session projection helpers if turn summary consumes replay-safe evidence

Likely new files:

- `packages/ts-shell/src/orchestration/turnKernel.ts`
- `packages/ts-shell/src/orchestration/turnCapabilityPlan.ts`
- `packages/ts-shell/src/orchestration/turnReceiptAggregation.ts`
- `packages/ts-shell/src/orchestration/turnKernel.test.ts`
- `docs/architecture/agent-loop-turn-kernel.md`

Avoid broad folder moves.

## Allowed Changes

- Add pure or near-pure turn-kernel helpers.
- Move high-value intent/dispatch/receipt aggregation projection out of `runMvpIntegratedFlow.ts`.
- Replace inline call-site shaping with helper calls where behavior is identical.
- Add focused tests for helpers.
- Update architecture docs and module backlog.
- Update stale helper tests only if output remains behaviorally identical.

## Explicit Non-Goals

Do not:

- change provider/model behavior
- change browser behavior
- change edit/write behavior
- change runtime execution behavior
- change workspace authority or stale-read behavior
- change permission/approval decisions
- change SessionManager schema or transcript format
- change CLI behavior
- add dependencies
- rewrite `runMvpIntegratedFlow.ts`
- introduce a new planner framework

## Boundaries

Hard boundaries:

- No provider/model live calls.
- No browser feature expansion.
- No edit/patch feature expansion.
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

- Tier 3 by default: cross-module contract/dispatch seam.
- Required:
  - focused turn-kernel tests
  - adjacent tests for touched module helpers
  - full `runMvpIntegratedFlow.test.ts`
  - edit closeout if edit path touched
  - result-contract
  - build
  - diff/status
- Package sweep is optional, not default.
- Escalate to package sweep only if execution semantics, permission behavior, package scripts, CLI behavior, schema, or broad test expectations change, or if focused/runMvp gates reveal unexplained failures.

## Capability Contract

| Stage | Current State | Route Change | Evidence Required |
|---|---|---|---|
| availability | module-specific availability facts exist | consume availability facts in turn summary | helper tests |
| policy | module policies own decisions | turn kernel records policy outcome only | policy preservation tests |
| planning | planning is still dispersed in runMvp | extract capability plan summary | turn-kernel tests |
| execution | existing paths execute | no execution change | runMvp green |
| observation | observations are capability-specific | aggregate safe observation summary | redaction tests |
| evidence | evidence ids/summaries vary | aggregate safe receipt/evidence summary | helper tests |
| result mapping | result projections exist | centralize handoff shape to result projection | result-contract |
| transcript | Session owns replay-safe summaries | turn summary stays replay-safe | continuation/session tests if touched |
| continue / replay | continuation helpers exist | preserve lineage and rebase behavior | continuation preservation tests |
| eval | runMvp is green | preserve runMvp green | runMvp |
| report | docs scattered | add turn-kernel doc | docs |
| cleanup | capability-owned cleanup | no change | no cleanup behavior diff |
| redaction | module-specific redaction | no raw dumps/secrets in aggregated summary | tests |

## Implementation Tasks

### 1. Audit current turn responsibilities

Create `docs/architecture/agent-loop-turn-kernel.md`.

Map current `runMvpIntegratedFlow.ts` responsibility blocks:

- intent classification
- read/inspect routing
- verification planning
- continuation activation
- edit expectation handling
- browser transaction handoff
- tool dispatch handoff
- provider diagnostic handoff
- workspace target projection
- runtime/tool receipt consumption
- result/evidence/transcript projection

Mark each as:

- keep in main loop
- extract now
- extract later
- module-owned, do not duplicate

### 2. Add turn capability plan helper

Add `turnCapabilityPlan.ts`.

It should produce a compact, typed summary of the selected capability path.

Candidate fields:

- turn kind
- capability area
- intent confidence
- target summary
- availability summary
- policy summary
- selected module owner
- stopped-before-execution reason if any
- verification expectation
- continuation lineage summary
- no-write / mutation classification

This helper must not execute tools or mutate state.

### 3. Add turn receipt aggregation helper

Add `turnReceiptAggregation.ts`.

It should aggregate module receipts and safe evidence summaries from:

- tool/policy/result receipts
- runtime receipts
- workspace target projections
- verification projections
- continuation lineage evidence
- browser/edit/read summaries where already available

It should produce:

- result handoff summary
- transcript-safe turn summary
- evidence id list
- redaction status
- do-next summary when stopped

It must not include raw DOM, raw file dumps, secrets, long stdout/stderr dumps, provider config paths, or private-key-like strings.

### 4. Add turn kernel helper

Add `turnKernel.ts`.

It should compose:

- turn capability plan
- receipt aggregation
- result handoff projection

Keep it small.

It should not replace the main loop. It should be a helper consumed by selected points in `runMvpIntegratedFlow.ts`.

### 5. Integrate high-value call sites

Integrate only safe places:

- command/tool dispatch result handoff
- read/inspect no-write handoff
- edit expectation stopped handoff
- verification stopped/skipped handoff
- continuation activation summary
- browser transaction summary if existing projection already makes it safe

Do not attempt to move every branch.

### 6. Preserve behavior

For every integration:

- terminal output remains stable
- resultMapper classification remains stable
- transcript evidence remains stable
- `/continue` behavior remains stable
- no new capability path becomes executable
- no false success introduced

### 7. Tests

Add `turnKernel.test.ts`.

Required coverage:

- no-write read/inspect turn summary
- command success turn summary
- command blocked turn summary
- edit missing-content stopped summary
- verification skipped/not-requested summary
- continuation lineage summary
- browser transaction summary redaction if integrated
- receipt aggregation excludes raw DOM/file dumps/secrets
- stopped do-next survives aggregation
- completed vs stopped vs failed classification is not changed

Update adjacent tests only where helper ownership changes without behavior drift.

### 8. Documentation and backlog update

Update:

- `docs/architecture/agent-loop-turn-kernel.md`
- `docs/architecture/module-backlog.md`

Route 153 recommendation should be based on remaining module risk.

Likely options:

- CLI / core split preparation
- Harness / gate taxonomy
- Capability lifecycle adoption report
- Edit / Patch thin integration
- Browser controlled planner v2 only if product priority returns to browser

## Validation

Focused validation:

- `rtk npm run test -w packages/ts-shell -- src/orchestration/turnKernel.test.ts`
- adjacent tests for touched flow/continuation/read/edit/tool/browser helpers

Broader validation:

- `rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts`
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
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
| turn-kernel doc | `agent-loop-turn-kernel.md` | |
| turn capability plan helper | `turnCapabilityPlan.ts` | |
| receipt aggregation helper | `turnReceiptAggregation.ts` | |
| turn kernel helper | `turnKernel.ts` | |
| focused tests | `turnKernel.test.ts` | |
| high-value integrations | touched call sites | |
| runMvp green | validation output | |
| no capability expansion | final audit | |

## Final Report Format

1. Branch and base commit
2. Files changed
3. What changed
4. Agent Loop boundary advanced
5. Validation tier used and why package sweep was or was not run
6. Validation commands and results
7. Real-provider gate status
8. External MCP status
9. Audit/history residue handling
10. Source/package change confirmation
11. Remaining risks
12. Best next action
13. Proposed commit message

Do not commit or push.
