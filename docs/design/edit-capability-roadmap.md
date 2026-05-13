# Edit Capability Roadmap

Route: 34
Date: 2026-05-13
Status: roadmap only; no product-code, test, script, package, gate, provider, CLI, session, MCP, or readiness change

This document records the current edit / patch / mutation capability upper
bound and the route sequence needed before broader edit support can be claimed.
It is based on current target code, current target gates/docs, and a narrow
read-only comparison against Claude Code, opencode, and Gemini CLI.

It is not a broad edit readiness claim.

## 1. Executive Summary

Current edit capability is intentionally narrow:

- MVP: selected-workspace, existing-file, single-file `Update File` through the
  explicit apply_patch runtime route.
- Candidate: selected-workspace, single-file `Add File` create through an
  explicit create route.
- Candidate: selected-workspace, exactly-two existing-file `Update File`
  through an explicit two-file write route.
- Planning/no-write: exactly-three existing-file `Update File` with
  `plannedFiles` continuity, `changedFiles=[]`, `writeIntents=[]`, and no
  writer reachability.
- Unsupported/stopped: 4+ updates, delete, move, mixed supported/unsupported
  patches, broad apply_patch, malformed model output, rollback, atomic
  multi-file recovery, fuzzy patch, and arbitrary mutation.

The next implementation should not jump to broad apply_patch writes. The
single recommended next route is **Route 35: edit route/result contract
hardening and per-file patch-plan representation, dry-run/no-write only**.
That route should make parse/verify/plan/result metadata uniform across update,
add, delete, move, mixed, malformed, and 3+ shapes without adding a new writer
or changing default gates.

## 2. Current Edit Capability Inventory

### Implemented

- Selected-workspace single-file existing `Update File`
  - Runtime owner: `packages/ts-shell/src/orchestration/mutationRoutingProjection.ts`.
  - Write route: `packages/ts-shell/src/orchestration/patchResult/workspaceWriteRoute.ts`.
  - Application: `packages/ts-shell/src/orchestration/patchApplication/singleFileUpdateApply.ts`.
  - Result projection: `packages/ts-shell/src/orchestration/patchResult/workspaceWriteResult.ts`.
  - Boundary: explicit runtime opt-in, explicit workspace-write opt-in,
    approved-for-write decision, workspace authority, final stale-read, writer,
    post-write verification.

- Selected-workspace single-file `Add File` create
  - Runtime owner: `mutationRoutingProjection.ts` dispatches
    `patchIsSingleAddFile()` before the generic update route.
  - Write route: `patchResult/workspaceCreateRoute.ts`.
  - Application: `patchApplication/singleFileCreateApply.ts`.
  - Result projection: `patchResult/workspaceCreateResult.ts`.
  - Boundary: one `Add File`, parent directory pre-exists, exclusive create,
    explicit approval, post-write readback verification.

- Selected-workspace exactly-two existing-file `Update File`
  - Runtime owner: `mutationRoutingProjection.ts` dispatches
    `patchIsExactlyTwoUpdateFiles()` to `runMultiFileWriteRoute()`.
  - Write route: `patchResult/multiFileWriteRoute.ts`.
  - Application: `patchApplication/twoFileUpdateApply.ts`.
  - Result projection: `patchResult/multiFileWriteResult.ts`.
  - Boundary: exactly two distinct update targets, explicit approval naming
    both files, all preflight/final stale-read before writer, sequential writes,
    per-file post-write verification, no rollback.

### Planned / No-Write

- Exactly-three existing-file `Update File`
  - Runtime route: `mutationRoutingProjection.ts` checks
    `patchIsExactlyThreeUpdateFiles()` before requesting workspace authority.
  - Planner: `patchResult/multiFileUpdatePlanning.ts`.
  - Result projection: `patchResult/multiFilePlanningResult.ts`.
  - Gate: `scripts/verify-three-file-planning-no-write.mjs`.
  - Continuity: `scripts/verify-planned-files-continuity.mjs`.
  - Status: stopped/no-write only. It may report `plannedFiles`; it must not
    report changed files or write intents.

- Multi-file dry-run classification for two-file update in no-write paths
  - Owner: `patchResult/singleFileApplyPatchDryRun.ts` delegates to
    `classifyMultiFileUpdatePlanningNoWrite()`.
  - Status: classification/planning only outside the explicit exactly-two write
    route.

### Explicitly Unsupported

- 3+ file writes.
- 4+ update planning as a write candidate.
- Delete writes.
- Move/rename writes.
- Mixed add/update/delete/move patches.
- Broad arbitrary apply_patch execution.
- Rollback, snapshot restore, or atomic multi-file recovery.
- Fuzzy patch recovery.
- Stale-read recovery beyond blocking and asking the user/model to re-read.
- Partial failure automatic repair or rollback.
- Inferring write authorization from prompt text, dry-run, preview, or
  permission-pending state.

## 3. Current Explicit Non-Claims

The project currently does not claim:

- broad/general edit readiness
- broad/general release readiness
- broad apply_patch support
- arbitrary project mutation readiness
- delete/move support
- 3-file or 3+ file write support
- rollback/snapshot/revert support
- atomic multi-file recovery
- fuzzy patch support
- partial failure recovery
- external/user-configured MCP edit readiness
- real-provider default gate readiness
- Claude Code, opencode, or Gemini CLI parity

## 4. Current Edit Pipeline Map

```text
User / CLI / provider output
-> model output parsing
   status: implemented for apply_patch markers/add/update/delete/move parse;
   malformed output explicitly stopped.
-> mutation routing
   status: implemented narrow dispatch in mutationRoutingProjection.ts.
-> capability boundary check
   status: implemented for single update, single add, exactly-two update,
   exactly-three planning/no-write, and unsupported shapes.
-> workspace boundary check
   status: implemented through workspaceAuthority.ts and path checks before
   selected-workspace writes.
-> permission / approval if applicable
   status: implemented for explicit write routes; no-write routes keep approval
   projection from authorizing writes.
-> patch application / selected workspace writer
   status: implemented only for single update, single add, and exactly-two
   update; exactly-three is planned/no-write; delete/move/broad apply_patch are
   explicitly unsupported.
-> post-write verification
   status: implemented for selected write routes; blocked/failed routes do not
   claim success.
-> result projection
   status: implemented through workspaceWriteResult.ts,
   workspaceCreateResult.ts, multiFileWriteResult.ts, multiFilePlanningResult.ts,
   and mutationVerificationProjection.ts.
-> session continuity
   status: implemented for changed/failed/planned surfaces covered by current
   synthetic gates; real-provider continuity is not broadly claimed.
-> CLI/user surface
   status: implemented for focused CLI evidence and terminal/session summaries;
   broad edit-failure UX is still incomplete.
```

## 5. Evidence Table

| Capability | Status | Evidence | Evidence strength | Gaps | Next route if any |
| --- | --- | --- | --- | --- | --- |
| Single existing-file `Update File` write | Implemented MVP/candidate surface | `mutationRoutingProjection.ts`, `workspaceWriteRoute.ts`, `singleFileUpdateApply.ts`, `workspaceWriteResult.ts`, `verify:real-user-capabilities -- --tier=mvp`, opt-in real single-file case in `verify-real-user-capabilities.mjs` | A for opt-in real smoke, B/C for deterministic gates | Not broad apply_patch; one selected file only | None before Route 35 contract hardening |
| Single `Add File` create | Implemented candidate | `workspaceCreateRoute.ts`, `singleFileCreateApply.ts`, `workspaceCreateResult.ts`, `synthetic-selected-workspace-single-file-create`, opt-in real create case | A for opt-in real smoke, B/C for synthetic | No parent directory creation; no update/delete/move mixing | Later create hardening only after Route 35 |
| Exactly-two existing-file update write | Implemented candidate | `multiFileWriteRoute.ts`, `twoFileUpdateApply.ts`, `multiFileWriteResult.ts`, `synthetic-selected-workspace-two-file-update`, `verify:real-user-capabilities:two-file-cli-evidence`, opt-in real two-file case | A for opt-in real smoke, A/B for CLI/synthetic | Sequential write; partial failure may leave verified prefix; no rollback | Later partial-failure surface route after Route 35 |
| Exactly-three update planning/no-write | Implemented stopped/no-write | `multiFileUpdatePlanning.ts`, `multiFilePlanningResult.ts`, `verify-three-file-planning-no-write.mjs`, `verify-planned-files-continuity.mjs` | B/C | No write support; no authority/writer request; planned files only | Later 3-file write route only after plan/result hardening |
| 4+ update requests | Explicitly unsupported | `multiFileUpdatePlanning.ts` returns `too-many-update-files`; `verify-three-file-planning-no-write.mjs` covers four-file scenario | B/C | No per-file generalized plan/result surface | Route 35 |
| Delete/move requests | Explicitly unsupported | Parser can parse delete/move; verification supports shapes internally, but routes reject them through supported-operation checks and Route 08/three-file gates | B/C/F | No no-write per-file delete/move plan contract yet | Route 35 |
| Mixed supported/unsupported patch | Explicitly unsupported | `multiFileUpdatePlanning.ts` returns `mixed-operations-not-enabled`; Route 08 unsupported E2E scenarios include mixed shapes | B/C | Need uniform per-file result metadata | Route 35 |
| Malformed model output | Explicitly stopped/error | `patchParsing/parser.ts`; `singleFileApplyPatchDryRun.ts` parse-failure blocked surface; `verify-three-file-planning-no-write.mjs` malformed scenario | B/C/D | Real-provider malformed-output dogfood remains opt-in/non-default | Later unsupported-output dogfood |
| Workspace boundary | Implemented for selected writes | `workspaceAuthority.ts`, `verifyParsedPatch()`, route-level `pathStaysInsideWorkspace()` checks | C/D/F | More generalized descriptor authority needed before broad operations | Route 35 should not widen writes |
| Final stale-read | Implemented as blocker, not recovery | `workspaceWriteRoute.ts`, `multiFileWriteRoute.ts`, `mutationExecution.ts`, `singleFileApplyPatchFinalStaleRead.ts` | C/D | No automatic stale-read recovery; no full read-state ledger like Claude Code | Later stale-read route |
| Post-write verification | Implemented for selected writes | `workspaceWriteRoute.ts`, `workspaceCreateRoute.ts`, `multiFileWriteRoute.ts`, `singleFileCreateApply.ts`, `twoFileUpdateApply.ts` | C/D | No rollback after post-write failure | Later partial-failure route |
| Partial failure surface | Implemented stopped surface for two-file route | `twoFileUpdateApply.ts`, `multiFileWriteRoute.ts`, `multiFileWriteResult.ts`, candidate partial-failure cases | B/C | No automatic repair or rollback; user inspection required | Later partial-failure route |
| changedFiles / failedFiles / plannedFiles | Implemented but route-specific | Route result modules plus `sessionStateSurface.ts` and `sessionRuntime.ts`; planned-files continuity verifier | B/C | Not yet a single per-file patch-plan model across all shapes | Route 35 |
| Rollback / atomicity | Explicitly unsupported | `multiFileWriteRoute.ts` says sequential write/no rollback; Route 11 verifier requires rollback/atomicity claim false | B/C | No snapshot layer in target project | Deferred until mature plan/result model |

Evidence strength scale: A = real-provider / real CLI / real runtime gate,
B = synthetic E2E / golden main path, C = focused integration test, D = unit /
contract test, E = documentation only, F = static code inference.

## 6. Reference Comparison: Claude Code

Search terms used:

- `FileEditTool`, `old_string`, `new_string`, `read first`, `stale`,
  `permission`, `tool_result`, `is_error`, `diff`, `rejected`.

Files/fragments read:

- `/home/wang/projects/source-claudecode/tools/FileEditTool/FileEditTool.ts`
- `/home/wang/projects/source-claudecode/tools/FileEditTool/utils.ts`
- `/home/wang/projects/source-claudecode/tools/FileEditTool/types.ts`
- `/home/wang/projects/source-claudecode/tools/FileEditTool/UI.tsx`
- `/home/wang/projects/source-claudecode/services/tools/toolExecution.ts`

Useful ideas:

- Read-before-write is a first-class edit precondition. File edits fail if the
  target was not read or was only partially read.
- Stale edits are rejected when file modification time/content shows the file
  changed after read.
- The tool separates validation errors, permission denials, tool execution
  errors, and successful tool results into message surfaces that re-enter the
  query/session loop.
- Rejected edit UI can still render a diff/preview, which is useful for
  user-visible failure surfaces.
- Exact replacement failures are explicit: not found, ambiguous multiple
  matches, notebook-specific routing, file too large, and settings-file
  validation all stop before write.

Ideas rejected/deferred:

- This project should not copy Claude Code's mature FileEditTool layout, file
  history system, LSP/VSCode notification path, hook ecosystem, or full
  interactive UI.
- This project should not adopt read-state/session-wide edit ledgers as part
  of Route 35 unless the route proves it can stay projection/contract-only.

Concrete implication:

- The target needs a clearer route/result contract that preserves failed edit
  details in session surfaces before adding broader writers. The first next
  route should harden per-file plan/result metadata and non-claims, not broaden
  execution.

## 7. Reference Comparison: opencode

Search terms used:

- `apply_patch`, `patch parse`, `patch verify`, `permission`, `snapshot`,
  `revert`, `metadata`, `files`, `changed`, `failed`, `tool-error`.

Files/fragments read:

- `/home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts`
- `/home/wang/projects/opencode/packages/opencode/src/tool/edit.ts`
- `/home/wang/projects/opencode/packages/opencode/src/patch/index.ts`
- `/home/wang/projects/opencode/packages/opencode/src/permission/index.ts`
- `/home/wang/projects/opencode/packages/opencode/src/session/processor.ts`
- `/home/wang/projects/opencode/packages/opencode/src/session/projectors.ts`
- `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`

Useful ideas:

- `apply_patch` is layered as parse -> per-file change model -> permission
  request with diff metadata -> apply -> file watcher/LSP -> output summary.
- Per-file metadata includes file path, relative path, operation type, diff,
  additions, deletions, and move destination where relevant.
- Permission request/reply is explicit, durable, and separate from tool
  execution.
- Snapshot/revert is a separate product layer around session processing, not an
  incidental helper inside the patch tool.

Ideas rejected/deferred:

- Broad add/update/delete/move apply_patch writes are too large for this
  project's next route.
- Snapshot/revert/rollback should not be imported as a convenience patch
  feature. It needs a separate route after the patch result representation and
  partial-failure semantics mature.
- opencode's server/TUI/session architecture should not be mirrored.

Concrete implication:

- The target should adopt the concept of a durable per-file patch-plan/result
  representation, but keep Route 35 no-write and avoid snapshot/revert or broad
  writer support.

## 8. Reference Comparison: Gemini CLI

Search terms used:

- `edit`, `write-file`, `read-file`, `ToolResult`, `confirmation`,
  `checkpoint`, `sandbox`, `trustedFolders`, `validatePathAccess`, `restore`.

Files/fragments read:

- `/home/wang/projects/gemini-cli/packages/core/src/tools/edit.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/tools/write-file.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/tools/read-file.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/tools/tools.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/utils/checkpointUtils.ts`
- `/home/wang/projects/gemini-cli/packages/cli/src/config/trustedFolders.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/services/gitService.ts`

Useful ideas:

- CLI/core separation keeps tool invocation, confirmation, execution, and
  result display in core shapes rather than in the CLI entrypoint.
- Edit and write tools validate workspace access before execution and return
  structured error objects on failure.
- Confirmation details carry diff, original content, proposed content, and
  optional IDE-modified content.
- Checkpointing is a separate opt-in recovery layer using git snapshots and a
  restore command.
- Trusted-folder and sandbox concepts are separate policy/environment layers,
  not part of edit parsing itself.

Ideas rejected/deferred:

- Fuzzy/regex/LLM edit correction is too broad for the target's next route.
- Full-file write, checkpoint restore, and sandbox/trust policy expansion are
  not appropriate as Route 35.
- Gemini's confirmation UI and policy update machinery should not be copied
  into the current CLI/session files.

Concrete implication:

- Keep CLI wiring minimal. Improve the core route/result contract first, then
  later add user-visible failure surfaces and recovery options only after the
  core metadata is stable.

## 9. Lessons To Adopt

- Treat parse, verification, permission, write, post-write verification, result
  projection, and session continuity as separate stages.
- Represent every file operation as metadata before any writer is reachable.
- Keep planned, changed, failed, unchanged, and unverified files distinct.
- Preserve failed edit outputs in the session/query loop.
- Require explicit write authorization; never infer it from prompt text,
  preview, dry-run, or permission-pending state.
- Keep stale-read and post-write verification failures stopped and actionable.
- Use per-file operation metadata before adding delete/move/3+ write support.

## 10. Lessons Not To Adopt Yet

- Broad apply_patch writes.
- Snapshot/revert/rollback.
- Fuzzy patch or LLM edit correction.
- Full-file overwrite as a general route.
- Parent-directory creation as part of Add File.
- CLI/TUI confirmation overhaul.
- New provider behavior or default real-provider gates.
- New session persistence schema for rollback/checkpoints.

## 11. Capability Gap Analysis

- Before broad apply_patch:
  - Missing a single per-file patch-plan/result representation that covers
    update/add/delete/move/mixed/malformed shapes.
  - Missing no-write plan output for delete/move with operation-specific
    failure metadata.
  - Missing broad unsupported-output dogfood outside deterministic real-model-
    like fixtures.
  - Missing a user-visible result contract that can explain mixed partial
    planning without sounding like success.

- Before 3-file writes:
  - Missing proof that three-file planning metadata is stable enough across
    result/session/CLI surfaces.
  - Missing write route contracts for all-final-stale-read, per-file
    verification, partial failure, and no rollback claim at 3 files.
  - Missing explicit decision whether sequential/no-rollback remains acceptable
    or a rollback route must precede 3-file writes.

- Before delete/move:
  - Missing operation-specific workspace authority for unlink/rename.
  - Missing no-write delete/move plan and result surfaces.
  - Missing user-visible warnings for destructive operations.
  - Missing protected-file and post-operation verification semantics.

- Before rollback/atomicity:
  - Missing snapshot or journal design.
  - Missing persisted transaction identifiers and recovery lifecycle.
  - Missing cross-runtime contract decision for whether rollback belongs in TS
    control plane or Rust execution plane.

- Before stale-read recovery:
  - Missing durable read-state ledger or route-level read-before-write contract.
  - Missing retry semantics that do not hide user/external edits.
  - Missing CLI/session language for "re-read required" vs "safe retry".

- Before partial failure recovery:
  - Missing per-file attempted/applied/verified/failed state model.
  - Missing recovery route that can inspect current content without assuming
    rollback.
  - Missing validation that changedFiles contain only verified writes.

## 12. Risk Analysis

- Overclaim risk: broad apply_patch can look parseable because the parser knows
  add/update/delete/move, but runtime writers are intentionally narrower.
- Authorization risk: permission-pending, dry-run, or natural language approval
  must not become write authorization.
- Persistence risk: result/session surfaces must not label planned files as
  changed files.
- Partial write risk: the exactly-two route is sequential and has no rollback;
  partial failure must remain stopped with user inspection required.
- Workspace risk: delete/move broaden authority beyond current regular-file
  update/create boundaries.
- Architecture risk: adding recovery or rollback inside
  `runMvpIntegratedFlow.ts`, `SessionManager.ts`, or `cli.tsx` would reverse the
  recent extraction direction.
- Provider risk: real-provider behavior must remain opt-in and redacted.

## 13. Proposed Route Sequence

### Route 35: Edit Route/Result Contract Hardening And Per-File Patch Plan, No-Write

- Objective: introduce or harden a route-local per-file patch plan/result
  contract for update/add/delete/move/mixed/malformed shapes without adding
  writer reachability.
- Allowed files: focused modules under
  `packages/ts-shell/src/orchestration/patchResult/`,
  `packages/ts-shell/src/orchestration/patchParsing/`,
  `packages/ts-shell/src/orchestration/patchVerification/`, focused tests, and
  docs for the route.
- Forbidden files: provider/auth core, `package.json`, default gates, scripts
  unless the route explicitly adds a non-default verifier, CLI/session/runtime
  lifecycle files except minimal wiring if proven necessary.
- Behavior boundaries: no new writes; no default gate change; no new readiness
  claim; changedFiles stays empty for no-write routes.
- Validation commands: focused module tests, `rtk npm run verify:result-contract`
  if result surface changes, `rtk git diff --check`.
- Success criteria: all parsed shapes produce explicit per-file plan/result
  metadata or explicit parse failure, and unsupported shapes remain stopped.
- Stop conditions: writer needed, persistence schema needed, provider behavior
  needed, or CLI/session lifecycle expansion needed.
- Readiness claim impact: none.

### Route 36: Model-Output Patch Fixture Expansion

- Objective: expand deterministic real-model-like unsupported outputs for
  malformed, mixed, delete, move, 4+ update, and ambiguous contexts.
- Allowed files: non-default verifier fixtures and focused tests.
- Forbidden files: runtime writers, default gates, provider config.
- Behavior boundaries: no new capability; no writes.
- Validation commands: focused unsupported-output verifier and
  `rtk git diff --check`.
- Success criteria: unsupported/malformed outputs stop with stable categories.
- Stop conditions: real provider execution required by default.
- Readiness claim impact: no broad real-provider claim.

### Route 37: Stale-Read / Read-Before-Write Contract

- Objective: make read-before-write and stale-read requirements explicit across
  current write routes and session guidance.
- Allowed files: patchResult contracts, focused tests, result/session surface if
  required.
- Forbidden files: recovery writer, rollback, provider core.
- Behavior boundaries: block/re-read only; no automatic stale recovery.
- Validation commands: stale-read route tests and result-contract verifier.
- Success criteria: stale edits never write and always surface re-read guidance.
- Stop conditions: durable read ledger or session schema migration needed.
- Readiness claim impact: stronger blocker claim only.

### Route 38: Partial-Failure Result Surface Hardening

- Objective: improve exactly-two partial failure metadata and user guidance
  without automatic repair.
- Allowed files: `multiFileWriteRoute.ts`, `multiFileWriteResult.ts`,
  `mutationVerificationProjection.ts`, focused tests.
- Forbidden files: rollback, snapshot, broad multi-file support.
- Behavior boundaries: changedFiles only verified prefix; failedFiles explicit;
  no success claim.
- Validation commands: candidate partial-failure tests and result-contract
  verifier.
- Success criteria: partial writes are unmistakably stopped and require current
  inspection.
- Stop conditions: recovery or rollback required.
- Readiness claim impact: partial-failure transparency only.

### Route 39: Exactly-Three Write Evaluation

- Objective: decide whether three-file writes can remain sequential/no-rollback
  or must wait for rollback/snapshot.
- Allowed files: docs/design and optional no-write tests.
- Forbidden files: writer implementation.
- Behavior boundaries: evaluation only unless a separate implementation route
  is opened.
- Validation commands: docs validation and existing three-file no-write gate if
  run.
- Success criteria: explicit go/no-go criteria for 3-file writes.
- Stop conditions: implementation pressure.
- Readiness claim impact: none.

### Route 40: Delete/Move Plan Classification

- Objective: classify delete/move in dry-run per-file plan/result metadata.
- Allowed files: patchResult planning modules and focused tests.
- Forbidden files: unlink/rename writers, rollback, default gates.
- Behavior boundaries: no writes; destructive operations stay unsupported.
- Validation commands: focused dry-run classification tests.
- Success criteria: delete/move produce explicit no-write metadata and warnings.
- Stop conditions: operation authority or destructive writer needed.
- Readiness claim impact: no delete/move write claim.

### Route 41: Snapshot/Rollback Design Only

- Objective: design rollback/snapshot boundaries after plan/result metadata is
  stable.
- Allowed files: docs/design and maybe contracts discussion only.
- Forbidden files: runtime rollback implementation.
- Behavior boundaries: no product behavior change.
- Validation commands: docs validation.
- Success criteria: ownership decision across TS/Rust/contracts and stop rules.
- Stop conditions: needing persistence implementation.
- Readiness claim impact: none.

## 14. First Recommended Implementation Route

Exactly one next implementation route is recommended:

**Route 35: Edit Route/Result Contract Hardening And Per-File Patch Plan,
No-Write.**

Why this is first:

- Current code already has multiple route-specific result shapes for single
  update, single create, exactly-two write, exactly-three planning, and generic
  dry-run unsupported shapes.
- Reference repos show that broad edit systems depend on a stable per-file
  plan/result model before wider writes, rollback, or UI recovery.
- This route can reduce ambiguity without touching execution, persistence,
  lifecycle, authorization, provider behavior, or default gates.
- It creates the evidence needed to decide later whether 3-file writes,
  delete/move planning, stale-read handling, or partial-failure hardening should
  come next.

Non-goals for Route 35:

- no writer changes
- no 3-file writes
- no delete/move writes
- no rollback
- no snapshot
- no fuzzy patch
- no default gate change
- no real-provider execution by default

## 15. Validation Strategy

For this docs-only Route 34 update:

- `rtk git diff --check`
- `rtk git status --short --branch`

For Route 35 if implemented later:

- focused tests for the new patch-plan/result contract
- `rtk npm run verify:result-contract` if terminal/result semantics change
- `rtk npm run verify:real-user-capabilities:unsupported-patch-e2e` if
  unsupported-output surfaces change
- `rtk npm run verify:real-user-capabilities:three-file-planning-no-write` if
  three-file planning surfaces change
- `rtk git diff --check`
- no full real-provider execution unless the route explicitly opens an opt-in
  real-provider gate

## 16. Stop Conditions

Stop and split into a separate route if the next step requires:

- new writer reachability
- delete/move execution
- 3-file writes
- broad apply_patch writes
- rollback/snapshot/revert implementation
- persistence schema changes
- session lifecycle changes
- CLI lifecycle changes
- provider/auth changes
- default gate changes
- real-provider config inspection or default real-provider execution
- moving control-plane semantics into Rust

## 17. Readiness Claim Boundaries

This roadmap changes no readiness claim.

Allowed after this document:

- The project has a documented edit capability upper-bound roadmap.
- The current implemented edit surface is narrow and evidence-tiered.
- Route 35 is the single recommended next implementation route.

Forbidden after this document:

- broad apply_patch readiness
- arbitrary mutation readiness
- delete/move readiness
- 3-file write readiness
- rollback/atomicity readiness
- fuzzy edit readiness
- full Claude Code/opencode/Gemini CLI parity
- default real-provider mutation readiness

