# Route 151: Workspace / File Context - contract consolidation

## Module

- Primary module: Workspace / File Context Engineering
- Secondary modules: Edit / Patch Engineering, Agent Loop Engineering, Result Surface Engineering, Session / Continue Engineering, Runtime Engineering
- Capability: workspace/file context contract
- Cross-module inputs:
  - read / inspect target facts
  - edit/write target facts
  - workspace root and project root facts
  - stale-read evidence
  - post-write verification facts
  - runtime receipt summaries
  - tool/policy/result stopped vocabulary
- Cross-module outputs:
  - workspace target contract
  - read authority projection
  - write authority projection
  - stale-read projection
  - post-write verification precondition projection
  - transcript-safe file context summary
- Product behavior boundary:
  - consolidate current vocabulary and projection helpers
  - do not broaden read/search/write capability
  - do not add broad file discovery or mutation
- Stop conditions:
  - broad filesystem search becomes necessary
  - workspace write authority changes become necessary
  - stale-read bypass becomes necessary
  - edit execution expansion becomes necessary
  - schema/CLI/dependency changes become necessary
- Capability lifecycle stage(s):
  - availability: workspace/root/target facts
  - policy: read/write authority facts only; no new authority decision
  - planning: target contract projection
  - execution: no new execution
  - observation: file context summary
  - evidence: target/stale-read/workspace evidence
  - result mapping: actionable stopped results for missing/ambiguous/unsafe targets
  - transcript: replay-safe file context summary
  - continue / replay: target carryover compatibility
  - eval: focused helper and route preservation tests
  - report: contract doc and validation summary
  - cleanup: not applicable
  - redaction: no raw file dumps or secrets in summaries

## Goal

Consolidate Workspace / File Context boundaries so read, inspect, edit, continuation, and future discovery edit routes share one target/root/authority vocabulary.

Route 150 added Runtime Receipt projection. The next missing input boundary is workspace/file context: current read/inspect, bounded edit, future edit contracts, stale-read checks, and continuation rebase all carry related target facts, but they are still spread across capability-specific helpers.

This route should build a shared contract and extract small projection helpers without changing runtime behavior.

This route is successful when:

- [ ] workspace root, target, read authority, write authority, stale-read, and verification precondition terms are documented
- [ ] current read/inspect and edit/write target semantics can be mapped into one contract
- [ ] future discovery edit can consume the contract without gaining mutation authority
- [ ] actionable stopped results for missing/ambiguous/unsafe targets are preserved
- [ ] helpers are focused, pure, and tested
- [ ] runMvp and relevant verifier gates remain green
- [ ] validation uses focused gates by default; package sweep is not required unless source changes cross execution/permission boundaries

This route is not successful if:

- [ ] it broadens file discovery
- [ ] it broadens write authorization
- [ ] it changes stale-read behavior
- [ ] it changes current read/inspect behavior
- [ ] it expands edit execution
- [ ] it adds filesystem search as a hidden planning step
- [ ] it pushes workspace policy into Agent Loop directly

## References

Target project evidence:

- `docs/architecture/module-roadmap-reset.md`
- `docs/architecture/module-backlog.md`
- `docs/agent-routes/module-route-template.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/future-edit-expansion-contract.md`
- `docs/architecture/edit-expectation-contract.md`
- `docs/architecture/read-inspect-intent-cleanup.md`
- `docs/architecture/continuation-lineage-cleanup.md`
- `docs/architecture/runtime-receipt-contract.md`
- existing workspace authority / patchResult files

Reference projects to inspect:

- opencode: workspace, snapshot/revert, patch target authority
- ClaudeCode: file read/edit target schema and stale-file protection
- gemini-cli: file tools, root handling, confirmation details
- mini-swe-agent: repository/file environment boundary
- OpenHands: workspace/file action observation boundary
- Inspect AI: file/state reporting if relevant

Reference budget:

- opencode: max 10 files
- ClaudeCode: max 8 files
- gemini-cli: max 8 files
- mini-swe-agent + OpenHands + Inspect AI: max 8 files total
- Stop condition for reference reading: stop once root/target/stale-read/write-authority boundary is clear

## Current Project Surfaces

Likely involved:

- `packages/ts-shell/src/orchestration/readInspectIntent.ts`
- `packages/ts-shell/src/orchestration/readContinuationTarget.ts`
- `packages/ts-shell/src/orchestration/repoExplainEvidence.ts`
- `packages/ts-shell/src/orchestration/editExpectationContract.ts`
- `packages/ts-shell/src/orchestration/futureEditContract.ts`
- `packages/ts-shell/src/orchestration/futureEditPlanner.ts`
- `packages/ts-shell/src/orchestration/continuationRebase.ts`
- `packages/ts-shell/src/orchestration/patchResult/workspaceAuthority.ts`
- `packages/ts-shell/src/orchestration/patchResult/boundedWritePolicy.ts`
- `packages/ts-shell/src/orchestration/mutationRoutingProjection.ts`
- result projection helpers if target stopped surfaces are duplicated

Likely new files:

- `packages/ts-shell/src/orchestration/workspaceFileContract.ts`
- `packages/ts-shell/src/orchestration/workspaceTargetProjection.ts`
- `packages/ts-shell/src/orchestration/workspaceFileContract.test.ts`
- `docs/architecture/workspace-file-context-contract.md`

Avoid broad folder restructuring.

## Allowed Changes

- Add contract/projection helpers for workspace root, target, authority, stale-read, and verification preconditions.
- Update read/inspect/edit/future-edit helpers to consume the contract where behavior is identical.
- Improve stopped reason/do-next wording only when current behavior is preserved and tests cover it.
- Add focused helper and preservation tests.
- Update module backlog with Route 151 closeout and next-route recommendation.

## Explicit Non-Goals

Do not:

- implement multi-file discovery edit
- implement broad refactor
- implement broad file search
- change workspace write authority
- bypass stale-read checks
- infer write permission from prompt text
- change read/inspect runtime behavior
- change edit execution behavior
- change SessionManager schema or transcript format
- change CLI behavior
- add dependencies

## Boundaries

Hard boundaries:

- No provider/model live calls.
- No browser work.
- No broad edit/refactor/discovery execution.
- No broad shell/allowlist expansion.
- No workspace authority weakening.
- No stale-read bypass.
- No schema/CLI/dependency changes.
- No broad runMvp rewrite.
- No hidden skips.
- No commit or push.

Validation tier:

- Tier 2 by default: module behavior/projection route.
- Required: focused helper tests, adjacent read/edit/future-edit/continuation tests, build, diff/status, edit closeout, result-contract.
- Run full `runMvpIntegratedFlow.test.ts` because Agent Loop target routing is likely touched.
- Package sweep is optional, not default.
- Escalate to package sweep only if command/runtime/permission behavior changes, package scripts change, broad test expectations change, or focused/runMvp gates reveal unexplained failures.

## Capability Contract

| Stage | Current State | Route Change | Evidence Required |
|---|---|---|---|
| availability | workspace/root facts are spread across helpers | define shared workspace fact shape | helper tests |
| policy | read/write authority is capability-specific | project authority facts without changing decisions | authority preservation tests |
| planning | read/edit/future-edit target planning differs | shared target projection | focused planning tests |
| execution | existing read/write lanes execute | no execution change | no writer behavior diff |
| observation | read/inspect evidence is route-specific | shared safe file context summary | redaction tests |
| evidence | stale-read/target facts vary | shared evidence projection | helper tests |
| result mapping | missing/ambiguous targets use local wording | stable stopped reason/do-next projection | result-contract + tests |
| transcript | continuation carries target facts | replay-safe target summary | continuation preservation tests |
| continue / replay | rebase has separate target facts | compatibility with continuationRebase | focused continuation tests |
| eval | existing gates are green | preserve focused gates | validation output |
| report | docs vary | add contract doc | docs |
| cleanup | not applicable | no change | none |
| redaction | no raw dumps expected | enforce summary-only projection | redaction tests |

## Implementation Tasks

### 1. Contract audit

Create `docs/architecture/workspace-file-context-contract.md`.

Map current vocabulary for:

- workspace root
- project root
- target path
- target hint
- concrete target
- candidate target
- ambiguous target
- missing target
- read authority
- write authority
- stale-read evidence
- post-write verification precondition
- continuation rebase target
- future discovery candidate set

Record current owners and unsafe areas.

### 2. Add workspace file contract helper

Add `workspaceFileContract.ts`.

It should define pure types/functions for:

- workspace fact summary
- target fact summary
- read authority fact
- write authority fact
- stale-read fact
- verification precondition fact
- unsupported/ambiguous target fact
- safe target label

It must not read files or search the filesystem by default.

### 3. Add target projection helper

Add `workspaceTargetProjection.ts`.

It should project:

- missing target stopped summary
- ambiguous target stopped summary
- out-of-workspace target stopped summary
- stale-read blocked summary
- read-only target summary
- write-authority target summary
- continuation-safe target summary
- future-discovery candidate summary

Use Route 146/150 result and receipt vocabulary where useful.

### 4. Integrate high-value callers

Integrate only where behavior can be preserved:

- read/inspect missing target
- read continuation target relocation
- repo-explain file context summary
- edit missing target/content target labeling
- future edit planner target/manifest projection
- continuation rebase target summary
- workspace authority projection surface if a pure mapping already exists

Do not touch writer execution unless only replacing duplicated projection text.

### 5. Preserve result behavior

For each touched path, verify:

- missing target remains actionable stopped
- ambiguous target remains actionable stopped
- read/inspect remains no-write
- bounded edit behavior remains unchanged
- future edit remains planning-only
- stale-read behavior remains unchanged
- resultMapper classification remains unchanged
- transcript summaries remain redacted

### 6. Tests

Add focused tests covering:

- in-workspace explicit target
- missing target
- ambiguous target
- out-of-workspace target
- read-only target summary
- write-authority fact projection
- stale-read fact projection
- continuation-safe target summary
- future discovery candidate summary without mutation authority
- no raw file content/secrets in summaries

Update existing tests only when replacing duplicated wording with the same current contract.

### 7. Documentation and backlog update

Update `docs/architecture/module-backlog.md`.

Recommend next route from Phase A, likely one of:

- Agent Loop dispatch extraction v2
- CLI / core split preparation
- Capability lifecycle adoption report
- Harness / gate taxonomy if validation cost becomes priority again

## Validation

Focused validation:

- `rtk npm run test -w packages/ts-shell -- src/orchestration/workspaceFileContract.test.ts`
- adjacent tests for touched read/inspect, edit expectation, future edit, continuation rebase files

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

- Not required by default for this route.
- Escalate only if validation tier conditions are met.

## Completion Audit

Before final response, map every deliverable to evidence:

| Requirement | Evidence | Status |
|---|---|---|
| workspace/file contract doc | `workspace-file-context-contract.md` | |
| contract helper | `workspaceFileContract.ts` | |
| target projection helper | `workspaceTargetProjection.ts` | |
| focused tests | `workspaceFileContract.test.ts` | |
| high-value integrations | touched callers | |
| no capability expansion | diff and final audit | |
| validation tier followed | final report | |

## Final Report Format

1. Branch and base commit
2. Files changed
3. What changed
4. Workspace/file boundary advanced
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
