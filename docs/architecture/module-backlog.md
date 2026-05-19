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

### Route 144: runMvp Final Closeout and Package Sweep

- Modules: Session / Continue Engineering, Agent Loop Engineering, Result
  Surface Engineering, Harness Engineering.
- Status: closed by `docs/architecture/runmvp-package-closeout.md`.
- Result:
  - full `runMvpIntegratedFlow.test.ts` moved from `144 passed / 7 failed` to
    `151 passed`
  - package sweep moved from `2017 passed / 30 failed / 1 skipped` to
    `2051 passed / 1 skipped`
  - repaired explicit approval callback routing when generic `continue` wording
    appeared without verify lineage
  - added git-aware mutation change-set attribution
  - repaired sandbox bare-command escalation for process spawn checks
  - repaired legacy recovery `targetPathBase` fallback
  - rebaselined stale transcript, resume, provider-mock, slash, CLI, trace, and
    browser harness expectations to current contracts
  - stabilized browser cache busy-lock and sandbox audit harness assertions under
    package-level parallel load
- Preserved: provider live-call boundary, browser/edit capability boundaries,
  command allowlist, permission semantics, session schema, CLI/dependencies, and
  broad runMvp structure.

### Route 145: Session Substrate Seam Extraction

- Modules: Session / Continue Engineering, Result Surface Engineering,
  Capability Contract Architecture.
- Status: closed by `docs/architecture/session-substrate-seams.md`.
- Result:
  - extracted transcript event codec helpers into `sessionEventCodec.ts`
  - extracted reentry summary/scoring and recovery block projection into
    `sessionSummaryProjection.ts`
  - extracted replay-safe continuation evidence selection and recovery
    predicates into `sessionContinuationProjection.ts`
  - extracted compact retention input projection into
    `sessionCompactProjection.ts`
  - extracted session/current-session metadata projection into
    `sessionMetadataProjection.ts`
  - added `sessionProjection.test.ts` as focused helper characterization
- Preserved: session file schemas, transcript JSONL shape/order, compact
  retention behavior, current-session selection behavior, CLI UX,
  provider/browser/edit boundaries, dependencies, and broad SessionManager or
  runMvp rewrites.
- Validation:
  - focused helper/session-adjacent tests pass
  - full `runMvpIntegratedFlow.test.ts` passes
  - full `packages/ts-shell` package sweep passes
  - `verify:edit-capability-closeout`, `verify:result-contract`, build, and
    `git diff --check` pass

### Route 146: Tool / Policy / Result Contract Unification

- Modules: Tool Engineering, Permission / Policy Engineering, Result Surface
  Engineering, Capability Contract Architecture.
- Status: closed by `docs/architecture/tool-policy-result-contract.md`.
- Result:
  - added `toolPolicyResult.ts` as the shared lifecycle receipt vocabulary
    for availability, policy, execution, result, reason code, do-next, and
    safe capability labels
  - added `toolResultProjection.ts` as the transcript-safe tool summary and
    redaction projector
  - integrated the seam into command allowlist/unavailable results, approval
    denial, MCP unavailable/protocol/tool-error results, browser
    blocked/unavailable results, edit expectation stopped contracts, provider
    readiness not-configured failures, tool lifecycle projection, and
    successful run-command dispatch projection
  - preserved terminal truthfulness, command allowlist, MCP taxonomy,
    browser/edit/provider boundaries, session schemas, CLI/dependencies, and
    broad runMvp/tool-registry structure
- Validation:
  - focused tool policy/result, lifecycle, dispatch, dispatcher, result mapper,
    edit expectation, MCP, and browser-adjacent tests pass
  - full runMvp, package sweep, closeout/result-contract/build/diff/status
    validation are the Route 146 final gates

### Route 147: Future Edit Expansion Contract Map

- Modules: Edit / Patch Engineering, Capability Contract Architecture, Harness
  Engineering.
- Status: closed by `docs/architecture/future-edit-expansion-contract.md`.
- Result:
  - added `futureEditContract.ts` as a pure future-edit classifier and Route
    146 stopped-result projector
  - added `futureEditPlanner.ts` as a no-op planning projector for mode, scope,
    target hints, missing preconditions, confirmation, verification, and
    rollback requirements
  - separated broad refactor planning, multi-file discovery edit, and broader
    fenced replacement into distinct future-only modes
  - preserved current bounded write/edit support and kept broad mutation,
    discovery, fuzzy replacement, vague generated content, workspace authority,
    stale-read, provider, browser, CLI, schema, dependency, and broad runMvp
    behavior unchanged
- Follow-up routes:
  - Route 148A: fenced replacement bounded implementation with explicit target
    and exact old/new or fenced block mapping only
  - Route 148B: multi-file discovery edit candidate selection with
    user-confirmed target set and max-file guard
  - Route 148C: broad refactor planning with target/constraint manifest and no
    mutation until user confirmation
  - Route 148D: snapshot/rollback precondition route before any broad edit
    execution
- Validation: focused future-edit/edit tests, runMvp, package sweep,
  closeout/result-contract/build/diff/status validation are the Route 147 final
  gates.

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
9. Route 145: Session Substrate Seam Extraction.
10. Route 146: Tool / Policy / Result Contract Unification.
11. Route 147: Future Edit Expansion Contract Map.
12. Route 148: Capability Lifecycle Adoption Across Edit / Browser / Shell.
13. Route 149: Runtime Receipt Contract.
14. Route 150: Harness and Gate Taxonomy.
15. Route 151: Workspace / File Context Contract.
16. Route 152: Provider Readiness Parity Map.

Do not use this backlog to justify broad source refactors. A route is valid
only when it reduces a user-facing runtime blocker or a named cross-layer
concentration point with focused evidence.
