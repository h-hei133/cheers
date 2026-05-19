# Module Backlog

Route: `docs/agent-routes/route131-module-atlas.md`

Route 136 replaced the earlier conservative ledger queue with fewer,
implementation-ready control-plane routes. Use
`docs/architecture/control-plane-atlas.md` as the current atlas and
`docs/agent-routes/module-route-template.md` before starting any route.

This backlog is not a commitment to implement all routes immediately. Each
route must preserve AGENTS.md boundaries: no provider/auth expansion, no
browser/edit broadening, no schema changes, no broad entrypoint or main-loop
rewrite, and focused validation tied to touched files.

## Completed Consolidation Routes

### Route 135: Real-User Capability Verifier Decomposition

- Module: Harness Engineering
- Result: `scripts/verify-real-user-capabilities.mjs` is now a compatibility
  entrypoint delegating to focused modules under `scripts/verify/`.
- Closeout doc: `docs/design/verifier-decomposition.md`.
- Boundary preserved: flags, markers, report fields, exit codes, redaction,
  dry-run, dirty repo guard, and real-provider opt-in behavior.

### Route 136: Control-Plane Module Atlas

- Modules: Agent Loop, CLI / UX, Session / Continue, Permission / Policy,
  Result Surface, Provider / Model, Tool, Runtime, Harness / Eval.
- Result docs:
  - `docs/architecture/control-plane-atlas.md`
  - `docs/architecture/run-mvp-ledger.md`
  - `docs/architecture/session-manager-boundary.md`
  - `docs/architecture/cli-boundary.md`
  - `docs/architecture/policy-result-boundary.md`
- Source result: one no-behavior-change session projection extraction,
  `packages/ts-shell/src/session/durableStatusProjection.ts`.

## High-Priority Implementation Routes

### Route 137: Agent Loop Projection Extraction

- Modules: Agent Loop Engineering, Result Surface Engineering.
- Result: extracted browser result/transcript projection and flow evidence
  projection helpers from `runMvpIntegratedFlow.ts`.
- Closeout doc:
  `docs/architecture/agent-loop-projection-extraction.md`.
- New owners:
  - `packages/ts-shell/src/orchestration/flowResultProjection.ts`
  - `packages/ts-shell/src/orchestration/flowEvidenceProjection.ts`
- Preserved: browser/edit/provider/permission behavior, CLI UX,
  `SessionManager` schema, dependency set, and runMvp control flow.
- Validation:
  - `rtk npm run test -w packages/ts-shell -- src/orchestration/flowProjection.test.ts src/core/harness/browserAgentLoop.test.ts`
  - baseline note: `runMvpIntegratedFlow.test.ts -t "covers prompt -> handoff -> tool approval -> streamed result"` is pre-existing red with Route 137 changes stashed
  - `rtk npm run verify:result-contract`
  - `rtk npm run verify:edit-capability-closeout`
  - `rtk npm run build -w packages/ts-shell`
- Remaining candidates move to Route 138/139:
  - provider diagnostic handoff planner
  - mutation target selection projector
  - read-window continuation projector
  - generic capability result summary projector

### Route 138: Agent Loop Baseline Repair and Dispatch Seam

- Modules: Agent Loop Engineering, Tool Engineering, Result Surface
  Engineering.
- Result: repaired the pre-existing streamed-result handoff/tool-approval
  baseline and extracted a dispatch/reentry seam from `runMvpIntegratedFlow.ts`.
- Closeout doc:
  `docs/architecture/agent-loop-baseline-dispatch.md`.
- New owner:
  - `packages/ts-shell/src/orchestration/flowDispatch.ts`
- Classification: product behavior drift in command-result projection; a
  successful `run-command` was incorrectly routed through mutation-only result
  satisfaction and downgraded to `No file mutation was applied.`
- Preserved: provider/model behavior, browser behavior, edit/write behavior,
  permission decisions, CLI UX, `SessionManager` schema, dependency set, and
  runMvp execution order.
- Validation:
  - `rtk npm run test -w packages/ts-shell -- src/orchestration/flowDispatch.test.ts`
  - `rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts -t "covers prompt -> handoff -> tool approval -> streamed result|carries verify-only action result seed target and command across weak follow-up target carryover|denies escalation and terminates with explicit stopped_error terminal|keeps synthetic escalation fallback injection-only|keeps stream fallback injection-only"`
- Remaining candidates move to Route 139:
  - policy reason normalizer
  - tool lifecycle to shared capability-result summary projector
  - provider diagnostic handoff planner, projection-only
  - SessionManager recovery/reentry projector or codec

### Route 139: Control-Plane Baseline Sweep and Policy-Result Repair

- Modules: Agent Loop Engineering, Tool Engineering, Permission / Policy
  Engineering, Result Surface Engineering.
- Result: swept focused and broad control-plane baselines before more
  extraction, repaired high-confidence command/verify behavior drift, and
  documented the remaining full `runMvpIntegratedFlow.test.ts` reds.
- Closeout doc:
  `docs/architecture/control-plane-baseline.md`.
- Repairs:
  - `dir` / `ls` command intent is blocked with actionable
    `command-not-allowlisted` instead of silently executing `node --version`.
  - explicit `node --version` verify command is selected without expanding the
    command allowlist.
  - English replacement parsing trims trailing `then run ...` command clauses.
- Baseline result:
  - focused command/policy/result/projection/dispatch tests pass
  - focused browser policy/runtime preservation tests pass
  - focused Route 139 runMvp gate passes
  - full `runMvpIntegratedFlow.test.ts` remains red with `101 passed / 50
    failed`, each listed in the closeout doc with owner, classification, and
    next action
- Preserved: provider live calls, browser/edit expansion, broad shell/allowlist
  expansion, CLI UX, dependency set, `SessionManager` schema, and broad
  runMvp rewrite.
- Route 140 should start with command intent and read/inspect capability
  cleanup, not generic extraction, because unsupported command/read/list
  classification is still masking several broad runMvp baselines.

### Route 140: Command Intent and Read / Inspect Capability Cleanup

- Modules: Agent Loop Engineering, Tool Engineering, Permission / Policy
  Engineering, Result Surface Engineering.
- Result: defined and implemented the current read/list/inspect/repo-explain
  no-write contract before further extraction or broad runMvp rebaseline.
- Closeout doc:
  `docs/architecture/read-inspect-intent-cleanup.md`.
- New owners:
  - `packages/ts-shell/src/orchestration/readInspectIntent.ts`
  - `packages/ts-shell/src/orchestration/readContinuationTarget.ts`
  - `packages/ts-shell/src/orchestration/repoExplainEvidence.ts`
- Repairs and rebaseline:
  - list-files prompts route to `inspect-files` / `glob(.ts)`, not chat or
    unrelated bash fallback
  - pathless targeted read stops actionably with explicit in-workspace path
    guidance
  - read continuation consumes restored targets and relocates only a unique
    high-confidence moved target
  - ambiguous/missing read relocation is actionable `stopped_error`
  - path-only file prompts default to grounded read
  - repo-explain collects no-write `glob` / read evidence and projects
    `grounded-explanation` or `needs-verification`
- Baseline result:
  - focused read/inspect route passes with `14 passed / 141 skipped`
  - full `runMvpIntegratedFlow.test.ts` moved from `101 passed / 50 failed` to
    `111 passed / 40 failed`
- Validation:
  - focused read/inspect intent and runMvp tests pass
  - full runMvp remains red with the documented remaining 40 failures
  - closeout/result-contract/build validation should remain focused on the
    touched no-write route
- Preserved: broad shell allowlist expansion, edit/browser/provider behavior,
  CLI UX, dependencies, session schema, and broad runMvp rewrite.

### Route 141: Verification Planner Cleanup

- Modules: Agent Loop Engineering, Result Surface Engineering, Tool
  Engineering.
- Status: closed by `docs/architecture/verification-planner-cleanup.md`.
- Result:
  - `verificationPlanner.ts` owns verify selection, skipped/not-requested,
    unsupported-command availability, and retry decisions
  - `verificationResultProjection.ts` owns command verification summaries and
    transcript-safe retry/evidence projection
  - auto verification selects existing allowlisted `node --version` for
    test-only/source edits without broadening the allowlist
  - failed command verification retries once and records attempts-exhausted
  - skipped verification is recoverable stopped, not false completed success
- Baseline result:
  - focused verification route passes with `19 passed / 142 skipped`
  - full `runMvpIntegratedFlow.test.ts` moved from `111 passed / 40 failed` to
    `112 passed / 39 failed`
- Preserved: provider, browser, edit expansion, shell allowlist expansion, CLI,
  dependencies, session schema, and broad runMvp rewrite.

### Route 142: Continuation / Rebase / Lineage Cleanup

- Modules: Session / Continue Engineering, Agent Loop Engineering, Result
  Surface Engineering.
- Status: closed by `docs/architecture/continuation-lineage-cleanup.md`.
- Result:
  - extracted continuation intent, lineage, rebase, and projection helpers
  - fixed weak/no-cue same-file slot activation vs clarify
  - fixed cross-file reopen candidate uniqueness vs ambiguity
  - repaired temporal successor cues (`next`, `what next`) over bounded
    evidence
  - repaired migration-like root rebasing for blocker->fix continuation
  - preserved verify command hint persistence after blocker repair
- Baseline result:
  - focused continuation route passes with `18 passed / 133 skipped`
  - full `runMvpIntegratedFlow.test.ts` moved from `112 passed / 39 failed`
    to `127 passed / 24 failed`
- Validation:
  - focused continuation/rebase/lineage runMvp tests
  - continuation planning/handoff projection tests
  - Route 140 read/inspect preservation tests
  - Route 141 verification planner preservation tests
  - `rtk npm run verify:result-contract`
  - `rtk npm run build -w packages/ts-shell`
- Stop conditions: provider/model calls, browser/edit capability expansion,
  session schema changes, CLI redesign, broad runMvp rewrite, or adding a new
  persistence layer.

### Route 143: Write / Edit Expectation Cleanup

- Modules: Agent Loop Engineering, Edit / Patch Engineering, Result Surface
  Engineering.
- Status: closed by `docs/architecture/edit-expectation-contract.md`.
- Result:
  - added `editExpectationContract.ts` as the current write/edit expectation
    helper
  - documented explicit target and concrete-content requirements
  - fixed `Write <path>` routing from chat success to actionable write stopped
  - fixed Chinese `内容是 ...` inline content parsing
  - stopped discovery edit before command fallback
  - rebaselined fenced/repair mutation paths under skipped verification
  - moved broad refactor, batch edit, and discovery edit success expectations to
    future capability routes
- Baseline result:
  - focused edit/write route passes with `18 passed / 140 skipped`
  - full `runMvpIntegratedFlow.test.ts` moved from `127 passed / 24 failed`
    to `144 passed / 7 failed`
- Validation:
  - focused edit expectation and write/edit runMvp tests
  - `rtk npm run verify:edit-capability-closeout`
  - `rtk npm run verify:result-contract`
  - `rtk npm run build -w packages/ts-shell`
- Stop conditions: edit engine expansion, multi-file/add/delete/move support,
  rollback/snapshot implementation, schema changes, or CLI/dependency changes.

### Route 144: Approval / Transcript / Resume Harness Cleanup

- Modules: Session / Continue Engineering, Agent Loop Engineering, Result
  Surface Engineering.
- Goal: rebaseline or repair the remaining approval callback, transcript role,
  and legacy resume harness expectations without schema changes or CLI redesign.
- Best first candidates:
  - explicit escalation callback prompt expectation
  - default transcript role expectation under current planner/coder contract
  - legacy resume role normalization stopped-cycle expectation
- Validation:
  - focused approval/transcript/resume runMvp tests
  - Route 142 continuation tests
  - Route 143 edit expectation tests
  - `rtk npm run verify:result-contract`
  - `rtk npm run build -w packages/ts-shell`
- Stop conditions: SessionManager schema migration, CLI redesign, provider live
  calls, or changing approval permission semantics.

### Route 145: Provider Mock Harness Cleanup

- Modules: Provider / Model Engineering, Harness Engineering, Result Surface
  Engineering.
- Goal: rebaseline deterministic provider mock transcript expectations without
  provider live calls or provider/auth changes.
- Best first candidates:
  - planner/coder/reviewer expected-role mismatch in deterministic real-mode
    mocks
  - openai-compatible deterministic mock retry transcript count
- Validation:
  - focused provider mock runMvp tests
  - provider readiness classification self-tests if touched
  - `rtk npm run verify:result-contract`
  - `rtk npm run build -w packages/ts-shell`
- Stop conditions: real provider execution, provider config reads, auth changes,
  or model/provider default changes.

### Route 146: Git-Aware Change Attribution

- Modules: Workspace / File Context Engineering, Result Surface Engineering.
- Goal: isolate git-aware changed/pre-existing/attempted file attribution from
  the broad runMvp suite.
- Validation: focused git attribution tests plus result-contract/build.
- Stop conditions: broad git workflow, commit/push behavior, or filesystem
  discovery expansion.

### Route 147: Future Edit Expansion Contract Map

- Modules: Edit / Patch Engineering, Capability Contract Architecture, Harness
  Engineering.
- Goal: define, but not implement by default, explicit contracts for broad
  refactor planning, multi-file discovery edit, and broader fenced replacement
  support.
- Best first candidates:
  - broad refactor planning route with explicit target/constraint manifest
  - multi-file discovery edit route with user-confirmed target selection
  - fenced replacement support route that distinguishes bounded single-file
    replacement from broad patch candidates
- Validation: contract/helper tests first; runtime implementation only in a
  separate route with focused write-boundary tests.
- Stop conditions: implementing broad edit behavior in a planning-only route,
  weakening workspace boundaries, skipping stale-read checks, or inferring write
  authorization from prompt text.

### Route 148: Capability Lifecycle Adoption Across Edit / Browser / Shell

- Modules: Capability Contract Architecture, Browser Engineering, Edit / Patch
  Engineering, Runtime Engineering, Harness / Eval Engineering.
- Goal: apply `docs/architecture/capability-contract.md` to mature
  capabilities through projection/report alignment only.
- Best first candidates:
  - browser transaction result projection alignment
  - bounded edit/patch result projection alignment
  - shell/tool runtime receipt vocabulary
  - gate/report marker taxonomy for deterministic verifiers
- Validation:
  - `rtk npm run verify:browser-txn-gate` if browser report/result surfaces are
    touched
  - `rtk npm run verify:edit-capability-closeout` if edit/patch surfaces are
    touched
  - `rtk npm run verify:result-contract`
  - focused helper tests
  - `rtk npm run build -w packages/ts-shell`
- Stop conditions: public browser expansion, edit engine expansion,
  rollback/snapshot implementation, schema changes, or default release gate
  changes.

## Medium-Priority Follow-Up Routes

### Route 149: Runtime Receipt Contract

- Modules: Runtime Engineering, Tool Engineering.
- Goal: define a shared receipt vocabulary for local shell, daemon, browser,
  timeout/cancel, cleanup, and redaction without moving control-plane semantics
  into Rust.
- Validation: docs/diff/status first; focused runtime tests if code changes.

### Route 150: Harness and Gate Taxonomy

- Modules: Harness Engineering, Eval / Benchmark Engineering.
- Goal: categorize verifier scripts as product path, deterministic gate,
  opt-in real, dry-run, self-test, docs-only, or report-only, then normalize
  report markers where safe.
- Validation: `rtk git diff --check`; touched verifier self-tests only.

### Route 151: Workspace / File Context Contract

- Modules: Workspace / File Context Engineering, Edit / Patch Engineering.
- Goal: consolidate workspace root, target resolution, file constraints,
  read/write authority, stale-read, and post-write verification vocabulary.
- Validation: workspace/patch focused tests if code changes; docs/diff/status
  otherwise.

### Route 152: Provider Readiness Parity Map

- Modules: Provider / Model Engineering, Harness Engineering.
- Goal: map provider readiness runtime classification to readiness scripts and
  real-provider default-skip behavior.
- Validation:
  - `rtk npm run verify:provider-readiness:real -- --classification-self-test`
  - real-provider live gate only when an explicit task opens that boundary.
- Stop conditions: manually reading provider config, printing secrets, or
  changing default provider gates.

## Backlog Ordering

Recommended order:

1. Route 137: Agent Loop Projection Extraction.
2. Route 138: Session Codec / Continue Seam or Agent Dispatch Seam Extraction.
3. Route 139: Control-Plane Baseline Sweep and Policy-Result Repair.
4. Route 140: Command Intent and Read / Inspect Capability Cleanup.
5. Route 141: Verification Planner Cleanup.
6. Route 142: Continuation / Rebase / Lineage Cleanup.
7. Route 143: Write / Edit Expectation Cleanup.
8. Route 144: Approval / Transcript / Resume Harness Cleanup.
9. Route 145: Provider Mock Harness Cleanup.
10. Route 146: Git-Aware Change Attribution.
11. Route 147: Future Edit Expansion Contract Map.
12. Route 148: Capability Lifecycle Adoption Across Edit / Browser / Shell.
13. Route 149: Runtime Receipt Contract.
14. Route 150: Harness and Gate Taxonomy.
15. Route 151: Workspace / File Context Contract.
16. Route 152: Provider Readiness Parity Map.

Do not use this backlog to justify broad source refactors. A route is valid
only when it reduces a user-facing runtime blocker or a named cross-layer
concentration point with focused evidence.
