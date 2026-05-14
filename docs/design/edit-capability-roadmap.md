# Edit Capability Roadmap

Route: 49
Date: 2026-05-14
Status: consolidation only after Route 48 exactly-two mixed write support; no
product-code, test, script, package, gate, provider, CLI, session, MCP, or
readiness change

This document records the current edit / patch / mutation capability upper
bound and the route sequence needed before broader edit support can be claimed.
It is based on current target code, current target gates/docs, and the Route
40-48 capability evidence.

It is not a broad edit readiness claim.

## 1. Executive Summary

Current edit capability is intentionally narrow but no longer limited to
single-file and exactly-two update writes:

- MVP: selected-workspace, existing-file, single-file `Update File` through the
  explicit apply_patch runtime route.
- Candidate: selected-workspace, single-file `Add File` create through an
  explicit create route.
- Candidate: selected-workspace, exactly-two existing-file `Update File`
  through an explicit two-file write route.
- Candidate: selected-workspace, exactly-three existing-file `Update File`
  through an explicit three-file guarded write route.
- Candidate: selected-workspace, guarded single-file move/rename through an
  explicit delete/move lane.
- Candidate: selected-workspace, guarded single-file delete through an explicit
  delete/move lane.
- Candidate: selected-workspace, exactly-two mixed write lanes through an
  explicit mixed route: update + add, update + move, add + move,
  update + delete, add + delete, and move + delete.
- Unsupported/stopped: 3+ mixed writes, 4+ writes, broad arbitrary apply_patch
  writes, multi-delete, multi-move, directory delete/move, overwrite,
  outside-workspace operations, rollback, snapshot/revert, stale-read recovery,
  partial failure recovery, fuzzy patch recovery, broad release readiness,
  default real-provider readiness, and arbitrary mutation.

The next implementation should not jump to broad apply_patch writes. The
single recommended next route is **Route 50: broad apply_patch / 3+ mixed write
readiness design, docs-first**. That route should decide whether rollback /
snapshot must exist before broader writes, or whether the project should keep
sequential no-rollback semantics for the next bounded expansion.

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
  - Application: `patchApplication/multiFileUpdateApply.ts`.
  - Result projection: `patchResult/multiFileWriteResult.ts`.
  - Boundary: exactly two distinct update targets, explicit approval naming
    both files, all preflight/final stale-read before writer, sequential writes,
    per-file post-write verification, no rollback.

- Selected-workspace exactly-three existing-file `Update File`
  - Runtime owner: `mutationRoutingProjection.ts` dispatches
    `patchIsExactlyThreeUpdateFiles()` to `runMultiFileWriteRoute()`.
  - Write route: `patchResult/multiFileWriteRoute.ts`.
  - Application: three-file guarded update support in the multi-file update
    application path.
  - Result projection: `patchResult/multiFileWriteResult.ts`.
  - Gate: `scripts/verify-three-file-guarded-write.mjs`.
  - Boundary: exactly three distinct existing-file update targets, explicit
    approval naming all files, all preflight/final stale-read before writer,
    sequential writes, per-file post-write verification, no rollback.

- Selected-workspace guarded single-file move/rename
  - Runtime owner: `mutationRoutingProjection.ts` dispatches the single-file
    move shape before generic unsupported classification.
  - Write route: `patchResult/workspaceMoveRoute.ts`.
  - Application: `patchApplication/singleFileMoveApply.ts`.
  - Result projection: `patchResult/workspaceMoveResult.ts`.
  - Gate: `scripts/verify-single-file-move-evidence.mjs`.
  - Boundary: one move operation, selected workspace containment for source and
    target, existing regular-file source, exclusive target, explicit approval,
    post-write verification, no rollback.

- Selected-workspace guarded single-file delete
  - Runtime owner: `mutationRoutingProjection.ts` dispatches the single-file
    delete shape before generic unsupported classification.
  - Write route: `patchResult/workspaceDeleteRoute.ts`.
  - Application: `patchApplication/singleFileDeleteApply.ts`.
  - Result projection: `patchResult/workspaceDeleteResult.ts`.
  - Gate: `scripts/verify-single-file-delete-evidence.mjs`.
  - Boundary: one delete operation, selected workspace containment, existing
    regular-file target, explicit approval, post-delete verification, no
    rollback.

- Selected-workspace exactly-two mixed write lanes
  - Runtime owner: `mutationRoutingProjection.ts` dispatches
    `patchIsExactlyTwoMixedWriteFiles()` to `runMixedFileWriteRoute()`.
  - Write route: `patchResult/mixedFileWriteRoute.ts`.
  - Result projection: `patchResult/mixedFileWriteResult.ts` and
    `patchResult/perFilePatchPlan.ts`.
  - Gate: `scripts/verify-mixed-operation-evidence.mjs`.
  - Supported lanes: update + add, update + move, add + move, update + delete,
    add + delete, and move + delete.
  - Boundary: exactly two mixed operations from the guarded
    update/create/move/delete lanes, explicit runtime opt-in, explicit
    workspace-write opt-in, approved user decision, all preflight/final
    preflight before writer, parsed-order sequential writes, per-file
    post-write verification, no rollback or atomicity claim.

### No-Write Classification / Contract Infrastructure

- Multi-file dry-run classification for two-file update in no-write paths
  - Owner: `patchResult/singleFileApplyPatchDryRun.ts` delegates to
    `classifyMultiFileUpdatePlanningNoWrite()`.
  - Status: classification/planning only outside the explicit exactly-two write
    route.

- Per-file patch plan/result contract
  - Owner: `patchResult/perFilePatchPlan.ts` and route/result projections.
  - Status: implemented for supported and unsupported route/result paths where
    safe, preserving route-specific `changedFiles`, `plannedFiles`,
    `failedFiles`, invocation flags, post-write verification, and terminal
    semantics.

- Mixed-operation readiness and no-write projection
  - Owner: `patchResult/mixedOperationReadiness.ts`,
    `patchResult/perFilePatchPlan.ts`, and unsupported route/result
    projections.
  - Status: implemented for mixed-operation classification and Route 48
    exactly-two mixed support while preserving 3+ mixed and broad apply_patch
    no-write boundaries.

### Explicitly Unsupported

- 3+ mixed writes.
- 4+ writes.
- Broad arbitrary apply_patch writes.
- Multi-delete or multi-move beyond the exactly-two mixed lanes listed above.
- Directory delete or directory move.
- Overwrite and outside-workspace operations.
- Broad unified diff writer.
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
- 3+ mixed operation write support
- 4+ write support
- multi-delete or multi-move support beyond the exactly-two mixed lanes
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
   exactly-three update, single move, single delete, exactly-two mixed write
   lanes, per-file plan projection, and unsupported shapes.
-> workspace boundary check
   status: implemented through workspaceAuthority.ts and path checks before
   selected-workspace writes.
-> permission / approval if applicable
   status: implemented for explicit write routes; no-write routes keep approval
   projection from authorizing writes.
-> patch application / selected workspace writer
   status: implemented only for single update, single add, exactly-two update,
   exactly-three update, guarded single move, guarded single delete, and
   exactly-two mixed write lanes; broad, 3+ mixed, 4+, multi-delete, and
   multi-move apply_patch shapes are
   explicitly unsupported.
-> post-write verification
   status: implemented for selected write routes; blocked/failed routes do not
   claim success.
-> result projection
   status: implemented through workspaceWriteResult.ts,
   workspaceCreateResult.ts, multiFileWriteResult.ts, workspaceMoveResult.ts,
   workspaceDeleteResult.ts, mixedFileWriteResult.ts,
   multiFilePlanningResult.ts, mutationVerificationProjection.ts, and
   perFilePatchPlan.ts.
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
| Single existing-file `Update File` write | Implemented MVP/candidate surface | `mutationRoutingProjection.ts`, `workspaceWriteRoute.ts`, `singleFileUpdateApply.ts`, `workspaceWriteResult.ts`, `verify:real-user-capabilities -- --tier=mvp`, opt-in real single-file case in `verify-real-user-capabilities.mjs` | A for opt-in real smoke, B/C for deterministic gates | Not broad apply_patch; one selected file only | None for Route 49 |
| Single `Add File` create | Implemented candidate | `workspaceCreateRoute.ts`, `singleFileCreateApply.ts`, `workspaceCreateResult.ts`, `synthetic-selected-workspace-single-file-create`, opt-in real create case | A for opt-in real smoke, B/C for synthetic | No parent directory creation; no broad mixed expansion beyond Route 48 lanes | None for Route 49 |
| Exactly-two existing-file update write | Implemented candidate | `multiFileWriteRoute.ts`, `multiFileUpdateApply.ts`, `multiFileWriteResult.ts`, `synthetic-selected-workspace-two-file-update`, `verify:real-user-capabilities:two-file-cli-evidence`, opt-in real two-file case | A for opt-in real smoke, A/B for CLI/synthetic | Sequential write; partial failure may leave verified prefix; no rollback | Route 50 only if broader write design needs this risk |
| Exactly-three existing-file update write | Implemented candidate | `multiFileWriteRoute.ts`, `multiFileUpdateApply.ts`, `multiFileWriteResult.ts`, `verify:real-user-capabilities:three-file-guarded-write` | B/C | Sequential write; partial failure may leave verified prefix; no rollback; non-default only | Route 50 only if broader write design needs this risk |
| Single-file move/rename | Implemented candidate | `workspaceMoveRoute.ts`, `singleFileMoveApply.ts`, `workspaceMoveResult.ts`, `verify:real-user-capabilities:single-file-move-evidence` | B/C | One regular-file source and exclusive target only; no multi-move, directory move, overwrite, or rollback | Route 50 only if broader write design needs this risk |
| Single-file delete | Implemented candidate | `workspaceDeleteRoute.ts`, `singleFileDeleteApply.ts`, `workspaceDeleteResult.ts`, `verify:real-user-capabilities:single-file-delete-evidence` | B/C | One existing regular-file target only; no multi-delete, directory delete, or rollback | Route 50 only if broader write design needs this risk |
| Exactly-two mixed write lanes | Implemented candidate | `mixedFileWriteRoute.ts`, `mixedFileWriteResult.ts`, `perFilePatchPlan.ts`, `mixedFileWriteRoute.test.ts`, `perFilePatchPlan.test.ts`, `verify:real-user-capabilities:mixed-operation-evidence` | B/C | Sequential parsed-order writes; partial failure may leave verified changed files and failed files; no rollback/atomicity; no 3+ mixed or broad apply_patch | Route 50 docs-first readiness design |
| Per-file patch plan/result contract | Implemented route/result infrastructure | `perFilePatchPlan.ts`, route/result projections, `verify:result-contract`, Route 08 unsupported E2E, Route 11/12 continuity checks, Route 40-48 evidence scripts | B/C/D | Still bounded to known supported/unsupported shapes; not broad write readiness | Route 50 docs-first readiness design |
| 4+ update requests | Explicitly unsupported | `multiFileUpdatePlanning.ts` returns `too-many-update-files`; guarded-write and unsupported-patch evidence cover unsupported 4+ shapes | B/C | No write support | Route 50 docs-first readiness design |
| 3+ mixed operations | Explicitly unsupported | `perFilePatchPlan.ts`, Route 08 unsupported E2E, `verify:real-user-capabilities:mixed-operation-evidence` keeps 3+ mixed no-write | B/C | No writer support; no rollback/atomicity decision for larger mixed sets | Route 50 docs-first readiness design |
| Multi-delete / multi-move beyond exactly-two mixed lanes | Explicitly unsupported | `perFilePatchPlan.ts`, Route 08 unsupported E2E, single-file move/delete evidence, mixed-operation evidence keeps invalid destructive shapes no-write | B/C | No broad multi-destructive writer; directory delete/move and overwrite remain blocked | Route 50 docs-first readiness design |
| Malformed model output | Explicitly stopped/error | `patchParsing/parser.ts`; `singleFileApplyPatchDryRun.ts` parse-failure blocked surface; `verify:real-user-capabilities:unsupported-patch-e2e` malformed scenario | B/C/D | Real-provider malformed-output dogfood remains opt-in/non-default | None for Route 49 |
| Workspace boundary | Implemented for selected writes | `workspaceAuthority.ts`, `verifyParsedPatch()`, route-level `pathStaysInsideWorkspace()` checks | C/D/F | More generalized descriptor authority needed before broad operations | Route 50 should not widen writes |
| Final stale-read | Implemented as blocker, not recovery | `workspaceWriteRoute.ts`, `multiFileWriteRoute.ts`, `mutationExecution.ts`, `singleFileApplyPatchFinalStaleRead.ts` | C/D | No automatic stale-read recovery; no full read-state ledger like Claude Code | Route 50 only if broader write design needs this risk |
| Post-write verification | Implemented for selected writes | `workspaceWriteRoute.ts`, `workspaceCreateRoute.ts`, `multiFileWriteRoute.ts`, `workspaceMoveRoute.ts`, `workspaceDeleteRoute.ts`, route application modules | C/D | No rollback after post-write failure | Route 50 only if broader write design needs this risk |
| Partial failure surface | Implemented stopped surface for multi-file routes | `multiFileUpdateApply.ts`, `multiFileWriteRoute.ts`, `multiFileWriteResult.ts`, candidate partial-failure cases | B/C | No automatic repair or rollback; user inspection required | Route 50 only if broader write design needs this risk |
| changedFiles / failedFiles / plannedFiles | Implemented with per-file plan support | Route result modules plus `perFilePatchPlan.ts`, `sessionStateSurface.ts`, and `sessionRuntime.ts`; planned-files continuity, mixed-operation, and result-contract verifiers | B/C | 3+ mixed and broad apply_patch still need readiness design before any writer claim | Route 50 |
| Rollback / atomicity | Explicitly unsupported | `multiFileWriteRoute.ts` says sequential write/no rollback; Route 11 verifier requires rollback/atomicity claim false | B/C | No snapshot layer in target project | Route 50 should decide prerequisite status |

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
  of the next edit route unless that route proves it can stay
  projection/contract-only.

Concrete implication:

- The target should keep failed edit details visible in session surfaces before
  adding broader writers. Route 48 broadened execution only to exactly-two
  mixed lanes; the next route should decide broad apply_patch / 3+ mixed
  readiness before adding another writer.

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

- The target has adopted a per-file patch-plan/result representation for the
  current route set. Route 48 uses it for exactly-two mixed writes; the next
  route should avoid snapshot/revert or broad writer support until those
  semantics are designed explicitly.

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
  not appropriate as the next edit route.
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
  - Per-file patch-plan/result representation now exists for current supported
    and unsupported route/result paths, but it is not a broad writer contract.
  - Missing broad unsupported-output dogfood outside deterministic real-model-
    like fixtures.
  - Missing a design decision for ordering, destructive confirmation,
    rollback/snapshot, and partial failure when arbitrary patch families are
    combined.

- Before 4+ writes:
  - Missing explicit decision whether sequential/no-rollback remains acceptable
    beyond three files.
  - Missing write route contracts for all-final-stale-read, per-file
    verification, partial failure, and no rollback claim at 4+ files.
  - Missing evidence that session/result surfaces remain understandable for
    larger changed/failed file sets.

- Before 3+ mixed operation writes:
  - Exactly-two mixed lanes have guarded support, but larger mixed sets remain
    unsupported.
  - Missing proof that changedFiles, plannedFiles, failedFiles, write intents,
    invocation flags, and post-write verification remain understandable beyond
    two mixed operations.
  - Missing decision on whether broader mixed destructive operations require a
    stronger approval, rollback prerequisite, or snapshot layer before any
    writer is reachable.

- Before multi-delete / multi-move:
  - Missing operation-specific evidence for more than one destructive target.
  - Missing user-visible warnings and verification semantics for destructive
    multi-target operations.
  - Missing protected-file and partial-failure handling for destructive writes.

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
- Partial write risk: the exactly-two and exactly-three update routes are
  sequential, and Route 48 mixed writes are also sequential in parsed order.
  No rollback or atomicity is claimed; partial failure may leave verified
  `changedFiles` plus `failedFiles`, and the result surface must report both
  accurately with user inspection required.
- Workspace risk: single-file delete/move authority now exists, but
  multi-destructive and mixed destructive operations would broaden authority
  again and require a separate plan.
- Architecture risk: adding recovery or rollback inside
  `runMvpIntegratedFlow.ts`, `SessionManager.ts`, or `cli.tsx` would reverse the
  recent extraction direction.
- Provider risk: real-provider behavior must remain opt-in and redacted.

## 13. Proposed Route Sequence

Do not continue by default into broad apply_patch writes. The next route should
evaluate broader write readiness before any new writer is proposed.

### Route 50: Broad Apply Patch / 3+ Mixed Write Readiness Design, Docs-First

- Objective: decide whether broad apply_patch / 3+ mixed support requires
  rollback/snapshot first, or whether the project will deliberately continue
  with sequential no-rollback semantics under a narrower route.
- Allowed files: docs/status/design artifacts only unless the route explicitly
  opens focused tests or projection work.
- Forbidden files: provider/auth core, default gates, broad apply_patch writer,
  3+ mixed writer, rollback/snapshot implementation, session lifecycle, CLI
  lifecycle, MCP behavior, and product readiness claims.
- Behavior boundaries: no broad apply_patch writer and no 3+ mixed writer.
  Unsupported shapes must remain stopped/no-write unless a later route proves
  execution, authorization, ordering, verification, partial failure, and
  recovery boundaries.
- Validation commands: diff checks plus any focused no-write contract checks
  explicitly required by the route.
- Success criteria: a concrete go/no-go decision for broader writes, explicit
  rollback/atomicity stance, and no broad readiness claim.
- Stop conditions: needing rollback, persistence schema migration, provider
  behavior, CLI/session lifecycle changes, or broad apply_patch execution.
- Readiness claim impact: no new write readiness unless a separate
  implementation route is opened after the design.

## 14. First Recommended Implementation Route

Exactly one next implementation route is recommended:

**Route 50: Broad Apply Patch / 3+ Mixed Write Readiness Design, Docs-First.**

Why this is first:

- Routes 40-48 expanded the write surface from single-file update through
  exactly-three update, single-file create/move/delete, and exactly-two mixed
  writes.
- The next jump, 3+ mixed or broad apply_patch, raises ordering, rollback,
  destructive confirmation, and partial failure risks beyond the current
  evidence.
- A docs-first route can decide whether to build rollback/snapshot first or to
  continue with explicitly sequential/no-rollback semantics.

Non-goals for Route 50:

- no broad apply_patch writer
- no 3+ mixed writer
- no 4+ writes
- no multi-delete or multi-move writes
- no rollback/snapshot/revert implementation
- no stale-read recovery
- no partial failure recovery
- no provider/session/CLI/MCP behavior change
- no default gate change
- no real-provider execution by default

## 15. Validation Strategy

For this docs-only Route 49 consolidation:

- `rtk git status --short --branch`
- `rtk git diff --check`
- `rtk npm run verify:real-user-capabilities:mixed-operation-evidence`
- `rtk npm run verify:real-user-capabilities:three-file-guarded-write`
- `rtk npm run verify:real-user-capabilities:single-file-move-evidence`
- `rtk npm run verify:real-user-capabilities:single-file-delete-evidence`
- `rtk npm run verify:real-user-capabilities:unsupported-patch-e2e`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk npm run verify:release:deterministic`

For Route 50 if opened later:

- docs-first readiness review before implementation
- focused no-write/result-contract tests only if the route changes projection
  wording or fixtures
- no full real-provider execution unless the route explicitly opens an opt-in
  real-provider gate

## 16. Stop Conditions

Stop and split into a separate route if the next step requires:

- new writer reachability
- 3+ mixed operation writes
- 4+ writes
- multi-delete or multi-move writes
- broad apply_patch writes
- rollback/snapshot/revert implementation
- stale-read recovery
- partial failure recovery
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

- The project has a current edit capability upper-bound roadmap after Routes
  40-48.
- The current implemented edit surface includes selected-workspace single-file
  update/create, exactly-two update, exactly-three update, guarded single-file
  move, guarded single-file delete, and exactly-two mixed write lanes.
- Route 50 is the single recommended next implementation route.

Forbidden after this document:

- broad apply_patch readiness
- arbitrary mutation readiness
- 3+ mixed operation write readiness
- 4+ write readiness
- multi-delete or multi-move readiness
- rollback/atomicity readiness
- fuzzy edit readiness
- full Claude Code/opencode/Gemini CLI parity
- default real-provider mutation readiness
