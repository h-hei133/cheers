# Edit Capability Roadmap

Route baseline: post-Route 64
Date: 2026-05-15
Status: long-range edit capability map after Routes 50-64.
Routes 59-64 have implemented a narrow explicit non-default original-content
authority loop, explicit restore surface, bounded exactly-three mixed write
expansion, bounded destructive multi-delete/multi-move support, and bounded
exactly-four write support.
This is still not broad edit readiness.

This document records the current edit / patch / mutation capability upper
bound and the long-range route sequence needed before broader edit support can
be claimed. It is based on current target code, current target docs, focused
Route 50-60 evidence, and a bounded directional comparison against ClaudeCode,
opencode, and gemini-cli.

It is not a broad edit readiness claim. It keeps implemented capability,
candidate capability, and unsupported/non-claimed capability separate.

## 1. Post-Route 64 Executive Summary

Current write capability remains intentionally narrow. The project supports a
bounded selected-workspace write surface and still blocks broad arbitrary
`apply_patch`, 5+ writes, broad multi-delete, broad multi-move, directory
delete/move, overwrite, rollback, snapshot/revert, stale-read recovery, partial
failure recovery, and default real-provider mutation readiness.

Routes 52-56 changed the roadmap direction:

- Route 50 decided not to jump directly to broad `apply_patch` or 3+ mixed
  writes.
- Route 52 introduced `routeScopedEditJournal` as prototype route-scoped
  journal metadata.
- Route 53 added `journalResultProjection`.
- Route 54 attached journal metadata to mixed and multi-file partial failure
  paths.
- Route 55 evolved `journalFailureConsumer` into a shared projection entrypoint
  and attached journal metadata to representative write/create/move/delete
  single-file failure consumers.
- Route 56 added `journalMetadataBoundary` and
  `docs/design/journal-boundary-readiness.md`, centralizing metadata-only facts.

The journal now improves observability across mixed, multi-file, and
representative single-file failure paths, but it remains metadata-only,
non-durable, and non-authoritative. It does not provide rollback authority,
recovery authority, snapshot authority, persistence, writer authority,
permission authority, or atomicity.

Route 57 added that recovery-readiness projection batch without adding recovery
execution: failure-state classification, plan-only recovery projection,
metadata-only blocker facts, and representative journal-enabled consumer
wiring.

Route 58 selected original-content authority as the smallest viable durable
authority direction and added seam/readiness diagnostics without storage or
execution.

Route 59 implemented that direction as a minimum explicit non-default loop:
metadata-only manifests plus hash-named content blobs, guarded per-file restore
primitive, and pre-write capture for single update, single delete, exactly-two
update, and single create. Route 60 extended that loop to single move,
exactly-three update, and exactly-two mixed lanes where clean, plus explicit
partial-failure restore drills with current-content guards. This is still not
automatic recovery, default persistence, snapshot/rollback, broad writes, or
product restore UX. Broad writes remain delayed.

Route 61 added a core explicit restore surface: authority index, restore
preview, explicit restore execution bridge, and recovery summary projection.
It did not add CLI/session restore commands or automatic recovery.

Route 62 implemented bounded exactly-three mixed writes where the readiness
audit passed. It keeps parsed-order sequential execution, explicit approval,
workspace authority, final stale-read, per-operation verification, non-default
recovery-authority capture, route-scoped journal metadata, plan-only recovery
diagnostics, no automatic recovery, and no atomic rollback. Route 64 later
opened exactly-four mixed operations; 5+ mixed operations and broad arbitrary
`apply_patch` remain blocked.

Route 63 implemented bounded same-family destructive batches for
selected-workspace exactly-two/exactly-three delete-only and move-only shapes.
It reuses the guarded bounded route/result surface: explicit approval,
workspace authority for every destructive source/target, directory and
overwrite rejection, final preflight before the first writer, parsed-order
sequential execution, per-operation verification, non-default recovery-authority
capture, partial-failure restore drills, no automatic recovery, and no atomic
rollback. Route 64 later opened exactly-four bounded writes; 5+ writes, broad arbitrary `apply_patch`, directory delete/move,
multi-delete/multi-move beyond this bounded surface, and provider/session/CLI/MCP
behavior remain blocked.

Route 64 implemented selected-workspace exactly-four update, mixed,
delete-only, and move-only batches where the readiness audit passed. It keeps
explicit approval over all affected paths, selected-workspace authority, final
stale-read/preflight before writer start, parsed-order sequential execution,
per-file/per-operation verification, non-default recovery-authority capture,
explicit partial-failure restore drills, no automatic recovery, and no atomic
rollback. 5+ writes, broad arbitrary `apply_patch`, directory delete/move,
overwrite, path reuse, provider/session/CLI/MCP changes, package scripts, and
default gates remain blocked.

## 2. Current Edit Capability Inventory

### Implemented / Candidate Write Surfaces

- Selected-workspace single-file existing `Update File`
  - Runtime owner: `packages/ts-shell/src/orchestration/mutationRoutingProjection.ts`.
  - Write route: `packages/ts-shell/src/orchestration/patchResult/workspaceWriteRoute.ts`.
  - Application: `packages/ts-shell/src/orchestration/patchApplication/singleFileUpdateApply.ts`.
  - Result projection: `packages/ts-shell/src/orchestration/patchResult/workspaceWriteResult.ts`.
  - Boundary: explicit runtime opt-in, explicit workspace-write opt-in,
    approved-for-write decision, workspace authority, final stale-read, writer,
    post-write verification, no rollback.

- Selected-workspace single-file `Add File` create
  - Runtime owner: `mutationRoutingProjection.ts` dispatches
    `patchIsSingleAddFile()` before the generic update route.
  - Write route: `patchResult/workspaceCreateRoute.ts`.
  - Application: `patchApplication/singleFileCreateApply.ts`.
  - Result projection: `patchResult/workspaceCreateResult.ts`.
  - Boundary: one `Add File`, parent directory pre-exists, exclusive create,
    explicit approval, post-write readback verification, no rollback.

- Selected-workspace exactly-two existing-file `Update File`
  - Runtime owner: `mutationRoutingProjection.ts` dispatches
    `patchIsExactlyTwoUpdateFiles()` to `runMultiFileWriteRoute()`.
  - Write route: `patchResult/multiFileWriteRoute.ts`.
  - Application: `patchApplication/multiFileUpdateApply.ts`.
  - Result projection: `patchResult/multiFileWriteResult.ts`.
  - Boundary: exactly two distinct update targets, explicit approval naming
    both files, all preflight/final stale-read before writer, sequential
    writes, per-file post-write verification, no rollback.

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

- Selected-workspace exactly-four existing-file `Update File`
  - Runtime owner: `mutationRoutingProjection.ts` dispatches
    exactly-two/three/four update shapes to `runMultiFileWriteRoute()`.
  - Write route: `patchResult/multiFileWriteRoute.ts`.
  - Application: four-file guarded update support in
    `patchApplication/multiFileUpdateApply.ts`.
  - Result projection: `patchResult/multiFileWriteResult.ts`.
  - Design evidence: `docs/design/bounded-exactly-four-write-surface.md`.
  - Boundary: exactly four distinct existing-file update targets, explicit
    approval naming all files, all preflight/final stale-read before writer,
    sequential writes, per-file post-write verification, optional non-default
    recovery-authority capture, no automatic recovery, and no rollback.

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
    bounded mixed shapes to `runMixedFileWriteRoute()`.
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

- Selected-workspace exactly-three mixed write lanes
  - Runtime owner: `mutationRoutingProjection.ts` dispatches exactly-three
    bounded mixed shapes to `runMixedFileWriteRoute()`.
  - Write route: `patchResult/mixedFileWriteRoute.ts`.
  - Result projection: `patchResult/mixedFileWriteResult.ts` and
    `patchResult/perFilePatchPlan.ts`.
  - Design evidence: `docs/design/exactly-three-mixed-write-implementation.md`.
  - Supported lanes: exactly three parsed operations drawn from update,
    create, move, and delete, including update + add + delete, update + add +
    move, update + delete + move, add + delete + move, and repeated-kind mixed
    triples over distinct source/target paths.
  - Boundary: exactly three mixed operations only, explicit runtime opt-in,
    explicit workspace-write opt-in, approved user decision naming all affected
    paths, all preflight/final preflight before writer, parsed-order
    sequential writes, per-file post-write verification, optional non-default
    recovery-authority capture before writer, no automatic recovery, and no
    rollback or atomicity claim.

- Selected-workspace bounded destructive delete-only / move-only lanes
  - Runtime owner: `mutationRoutingProjection.ts` dispatches exactly-two and
    exactly-three destructive same-family shapes through the guarded bounded
    route after single-operation routes are considered.
  - Write route: `patchResult/mixedFileWriteRoute.ts`.
  - Result projection: `patchResult/mixedFileWriteResult.ts` and
    `patchResult/perFilePatchPlan.ts`.
  - Design evidence:
    `docs/design/bounded-destructive-multi-delete-move.md`.
  - Supported lanes: exactly-two/exactly-three/exactly-four delete-only and
    exactly-two/exactly-three/exactly-four move-only operations.
  - Boundary: selected-workspace explicit route only, approval required,
    regular-file delete/move only, no directories, no overwrite, no reused
    source/target paths, no swaps/cycles, final preflight before writer,
    parsed-order sequential execution, per-operation verification, optional
    non-default recovery-authority capture, no automatic recovery, and no
    rollback or atomicity claim.

- Selected-workspace exactly-four mixed write lanes
  - Runtime owner: `mutationRoutingProjection.ts` dispatches exactly-four
    bounded mixed shapes to `runMixedFileWriteRoute()`.
  - Write route: `patchResult/mixedFileWriteRoute.ts`.
  - Result projection: `patchResult/mixedFileWriteResult.ts` and
    `patchResult/perFilePatchPlan.ts`.
  - Design evidence: `docs/design/bounded-exactly-four-write-surface.md`.
  - Supported lanes: exactly four parsed operations drawn from update, create,
    delete, and move, including representative mixed quads and repeated-kind
    mixed quads over distinct source/target paths.
  - Boundary: exactly four mixed operations only, explicit approval naming all
    affected paths, all source/target guards, final preflight before writer,
    parsed-order sequential writes, per-operation verification, optional
    non-default recovery-authority capture, no automatic recovery, and no
    rollback or atomicity claim.

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
  - Status: implemented for mixed-operation classification and exactly-two
    exactly-three, and exactly-four mixed support while preserving 5+ mixed and broad `apply_patch` no-write
    boundaries.

### Route-Scoped Journal Metadata Infrastructure

- Route-scoped edit journal metadata
  - Owner: `patchResult/routeScopedEditJournal.ts`.
  - Status: implemented as route-scoped result metadata for planned, changed,
    failed, verified, recovered, unrecovered, and recovery-candidate file facts.
  - Boundary: no durability, no writer authority, no permission authority, no
    rollback, no recovery execution.

- Journal result projection
  - Owner: `patchResult/journalResultProjection.ts`.
  - Status: implemented failure-surface projection for journal facts.
  - Boundary: projects failure diagnostics only; `recoveryExecuted` remains
    `false`.

- Journal failure consumer entrypoint
  - Owner: `patchResult/journalFailureConsumer.ts`.
  - Status: shared entrypoint for building failure-result journals from
    per-file plans and projecting them back through existing result contracts.
  - Boundary: preserves existing `changedFiles`, `plannedFiles`, `failedFiles`,
    writer invocation flags, delete/move invocation flags, post-write
    verification, and terminal success/stopped/error semantics.

- Journal metadata boundary helper
  - Owner: `patchResult/journalMetadataBoundary.ts`.
  - Status: implemented centralized metadata-only facts:
    `writeCapability: "metadata-only"`, `rollbackAtomicityClaim: false`,
    `recoveryExecuted: false`, blocker facts, and evidence strings for no
    runtime writer and no recovery execution.
  - Boundary: helper centralizes claims; it does not create storage, restore,
    rollback, or write authority.

- Recovery-readiness projection
  - Owners: `patchResult/journalFailureStateProjection.ts` and
    `patchResult/journalRecoveryPlanProjection.ts`.
  - Status: implemented plan-only classification and recovery diagnostics
    attached to existing journal-enabled failure surfaces through
    `journalResultProjection.ts`.
  - Boundary: no file reads, no writes, no durable storage, no recovery
    executor, no rollback executor, no snapshot/revert, no original-content
    inference, and no changed/failed/planned field semantic change.

- Durable authority seam/readiness diagnostics
  - Owners: `patchResult/journalDurableAuthority.ts`,
    `patchResult/journalOriginalContentAuthority.ts`, and
    `patchResult/journalRecoveryReadinessProjection.ts`.
  - Status: implemented as pure descriptors and projections under the existing
    `recoveryPlan` surface.
  - Boundary: active authority remains `none` / `absent` / `persistence: none`;
    no file IO, git calls, snapshot, durable persistence, recovery execution,
    rollback execution, or writer behavior changes.

- Minimum recovery authority loop
  - Owners: `patchRecovery/recoveryAuthorityStore.ts`,
    `patchRecovery/restorePrimitive.ts`, and optional route wiring in
    `workspaceWriteRoute.ts`, `workspaceDeleteRoute.ts`,
    `multiFileWriteRoute.ts`, and `workspaceCreateRoute.ts`.
  - Status: implemented explicit non-default original-content authority
    capture and guarded per-file restore primitive.
  - Boundary: no default persistence, no automatic capture, no automatic
    recovery, no rollback/atomicity claim, no snapshot/git integration, no
    provider/session/CLI/MCP behavior, no broad writes, no 5+ mixed writes.

- Mixed/multi/single-file failure journal coverage
  - Mixed and multi-file partial failure paths carry journal metadata.
  - Representative single-file write/create/move/delete failure consumers carry
    journal metadata.
  - Coverage is observability, not recovery authority.

### Explicitly Unsupported

- 5+ mixed writes.
- 5+ update writes.
- Broad arbitrary `apply_patch` writes.
- Broad multi-delete or multi-move beyond the bounded mixed lanes listed above.
- Directory delete or directory move.
- Overwrite and outside-workspace operations.
- Broad unified diff writer.
- Durable journal storage.
- Recovery executor.
- Rollback executor.
- Snapshot/revert.
- Atomicity claim or recovery authority.
- Fuzzy patch recovery.
- Stale-read recovery beyond blocking and asking the user/model to re-read.
- Partial failure automatic repair or rollback.
- Inferring write authorization from prompt text, dry-run, preview, or
  permission-pending state.

## 3. Current Explicit Non-Claims

The project currently does not claim:

- broad/general edit readiness
- broad/general release readiness
- broad `apply_patch` support
- arbitrary project mutation readiness
- 5+ mixed operation write support
- 5+ write support
- broad multi-delete or multi-move support beyond the bounded mixed lanes
- durable journal storage
- recovery executor
- rollback executor
- snapshot/revert support
- rollback/atomicity readiness
- recovery authority
- fuzzy patch support
- stale-read recovery
- partial failure recovery
- external/user-configured MCP edit readiness
- real-provider default gate readiness
- ClaudeCode, opencode, or gemini-cli parity

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
   lanes, exactly-three mixed write lanes, exactly-four bounded write lanes,
   per-file plan projection, and unsupported shapes.
-> workspace boundary check
   status: implemented through workspaceAuthority.ts and path checks before
   selected-workspace writes.
-> permission / approval if applicable
   status: implemented for explicit write routes; no-write routes keep approval
   projection from authorizing writes.
-> patch application / selected workspace writer
   status: implemented only for single update, single add, exactly-two update,
   exactly-three update, guarded single move, guarded single delete, and
   exactly-two/exactly-three/exactly-four mixed write lanes; broad, 5+ mixed, 5+ update,
   broad multi-delete, and broad multi-move apply_patch shapes are explicitly
   unsupported.
-> post-write verification
   status: implemented for selected write routes; blocked/failed routes do not
   claim success.
-> result projection
   status: implemented through workspaceWriteResult.ts,
   workspaceCreateResult.ts, multiFileWriteResult.ts, workspaceMoveResult.ts,
   workspaceDeleteResult.ts, mixedFileWriteResult.ts,
   multiFilePlanningResult.ts, mutationVerificationProjection.ts,
   perFilePatchPlan.ts, journalResultProjection.ts, and
   journalFailureConsumer.ts.
-> route-scoped journal metadata construction
   status: implemented metadata-only construction for covered failure paths.
-> journal result projection
   status: implemented failure-surface projection; not durability or recovery.
-> metadata-only boundary projection
   status: implemented through journalMetadataBoundary.ts.
-> recovery-readiness projection
   status: implemented through journalFailureStateProjection.ts and
   journalRecoveryPlanProjection.ts; plan-only, metadata-only, non-executing.
-> durable authority seam/readiness projection
   status: implemented through journalDurableAuthority.ts,
   journalOriginalContentAuthority.ts, and
   journalRecoveryReadinessProjection.ts; active authority is absent and
   non-persistent.
-> future durable storage / recovery executor
   status: not implemented; requires separate authority and lifecycle design.
-> session continuity
   status: implemented for changed/failed/planned surfaces covered by current
   synthetic gates; real-provider continuity is not broadly claimed.
-> CLI/user surface
   status: implemented for focused CLI evidence and terminal/session summaries;
   broad edit-failure UX and recovery UX are still incomplete.
```

## 5. Evidence Table

| Capability | Status | Evidence | Evidence strength | Gaps | Next route if any |
| --- | --- | --- | --- | --- | --- |
| Single existing-file `Update File` write | Implemented MVP/candidate surface | `mutationRoutingProjection.ts`, `workspaceWriteRoute.ts`, `singleFileUpdateApply.ts`, `workspaceWriteResult.ts`, opt-in real single-file case | A/B/C | Not broad `apply_patch`; one selected file only | None for Route 57 |
| Single `Add File` create | Implemented candidate | `workspaceCreateRoute.ts`, `singleFileCreateApply.ts`, `workspaceCreateResult.ts`, synthetic and opt-in real create evidence | A/B/C | No parent directory creation; no broad mixed expansion | None for Route 57 |
| Exactly-two existing-file update write | Implemented candidate | `multiFileWriteRoute.ts`, `multiFileUpdateApply.ts`, `multiFileWriteResult.ts`, synthetic and opt-in real two-file evidence | A/B/C | Sequential write; partial failure may leave verified prefix; no rollback | No expansion until recovery stance is explicit |
| Exactly-three existing-file update write | Implemented candidate | `multiFileWriteRoute.ts`, `multiFileUpdateApply.ts`, `multiFileWriteResult.ts`, `verify-three-file-guarded-write.mjs` | B/C | Sequential write; partial failure may leave verified prefix; no rollback; non-default only | No expansion until recovery stance is explicit |
| Single-file move/rename | Implemented candidate | `workspaceMoveRoute.ts`, `singleFileMoveApply.ts`, `workspaceMoveResult.ts`, `verify-single-file-move-evidence.mjs` | B/C | One regular-file source and exclusive target only; no multi-move, directory move, overwrite, or rollback | No expansion until destructive authority is explicit |
| Single-file delete | Implemented candidate | `workspaceDeleteRoute.ts`, `singleFileDeleteApply.ts`, `workspaceDeleteResult.ts`, `verify-single-file-delete-evidence.mjs` | B/C | One existing regular-file target only; no multi-delete, directory delete, or rollback | No expansion until destructive authority is explicit |
| Exactly-two mixed write lanes | Implemented candidate | `mixedFileWriteRoute.ts`, `mixedFileWriteResult.ts`, `perFilePatchPlan.ts`, `mixedFileWriteRoute.test.ts`, `perFilePatchPlan.test.ts`, mixed-operation evidence | B/C | Sequential parsed-order writes; no rollback/atomicity; no broad `apply_patch` | Revisit only after bounded mixed/destructive authority stance is explicit |
| Exactly-three mixed write lanes | Implemented candidate | `mutationRoutingProjection.ts`, `mixedFileWriteRoute.ts`, `mixedFileWriteResult.ts`, `perFilePatchPlan.ts`, `mixedOperationReadiness.ts`, `mixedFileWriteRoute.test.ts`, `mixedFileWriteResult.test.ts`, `mutationRoutingProjection.test.ts`, `docs/design/exactly-three-mixed-write-implementation.md` | C/D/E | Sequential parsed-order writes; no rollback/atomicity; no broad `apply_patch`; restore remains explicit | User/session restore UX or small-N policy decision |
| Exactly-four bounded write lanes | Implemented candidate | `mutationRoutingProjection.ts`, `multiFileWriteRoute.ts`, `multiFileUpdateApply.ts`, `mixedFileWriteRoute.ts`, `perFilePatchPlan.ts`, `mixedOperationReadiness.ts`, `multiFileWriteRoute.test.ts`, `mixedFileWriteRoute.test.ts`, `perFilePatchPlan.test.ts`, `mutationRoutingProjection.test.ts`, `docs/design/bounded-exactly-four-write-surface.md` | C/D/E | Exactly four only; no 5+ writes, broad `apply_patch`, automatic recovery, or rollback | 5-operation/small-N policy decision or user/session restore UX |
| Bounded multi-delete / multi-move lanes | Implemented candidate | `mixedFileWriteRoute.ts`, `mixedFileWriteResult.ts`, `perFilePatchPlan.ts`, `mixedFileWriteRoute.test.ts`, `perFilePatchPlan.test.ts`, `mutationRoutingProjection.test.ts`, `docs/design/bounded-destructive-multi-delete-move.md`, `docs/design/bounded-exactly-four-write-surface.md` | C/D/E | Exactly two/three/four delete-only or move-only only; no 5+ writes, directory delete/move, overwrite, swaps/cycles, automatic recovery, or rollback | 5-operation/small-N policy decision or user/session restore UX |
| Per-file patch plan/result contract | Implemented route/result infrastructure | `perFilePatchPlan.ts`, route/result projections, `verify:result-contract`, unsupported E2E and continuity checks | B/C/D | Still bounded to known supported/unsupported shapes; not broad write readiness | Preserve as recovery-plan consumer |
| Route-scoped edit journal prototype | Implemented metadata-only projection | `routeScopedEditJournal.ts`, `routeScopedEditJournal.test.ts` | C/D | Non-durable; not recovery or writer authority | Feed original-content ledger prototype if safe |
| Journal result projection | Implemented failure-surface projection with recovery plan diagnostics | `journalResultProjection.ts`, `journalResultProjection.test.ts` | C/D | No recovery execution; no durable storage | Feed original-content ledger prototype if safe |
| Mixed/multi failure journal metadata | Implemented observability coverage | `mixedFileWriteResult.ts`, `multiFileWriteResult.ts`, related focused tests | C/D | Partial failure remains unrecovered; no rollback | Keep as evidence source for original-content ledger decision |
| Single-file failure journal metadata | Implemented representative coverage | `workspaceWriteResult.ts`, `workspaceCreateResult.ts`, `workspaceMoveResult.ts`, `workspaceDeleteResult.ts`, focused tests | C/D | Coverage is failure metadata only; success paths are not a recovery ledger | Keep as representative wiring |
| Journal failure consumer entrypoint | Implemented shared projection entrypoint | `journalFailureConsumer.ts` | C/D | Builds journal facts but recovery classification is projected downstream | Preserve existing changed/failed/planned semantics |
| Journal metadata boundary helper | Implemented centralized boundary and blocker facts | `journalMetadataBoundary.ts`, `journalMetadataBoundary.test.ts` | C/D | No durability, storage, restore, or executor | Preserve in all future recovery work |
| External comparison against ClaudeCode/opencode/gemini-cli | Completed directional evidence | This roadmap and `journal-boundary-readiness.md` | E/F | Comparison is directional, not parity | Use to block unsupported recovery claims |
| Recovery failure-state classification | Implemented projection-only diagnostics | `journalFailureStateProjection.ts`, `journalFailureStateProjection.test.ts` | D | Classification depends on existing journal facts; unknown state remains explicit when facts are insufficient | Feed original-content ledger prototype if safe |
| Recovery plan projection | Implemented plan-only diagnostics with absent-authority and captured non-default authority modes | `journalRecoveryPlanProjection.ts`, `journalRecoveryPlanProjection.test.ts`, `journalResultProjection.ts`, focused consumer tests | C/D | No automatic recovery executor, rollback, snapshot, or default persistence | Preserve while expanding non-default coverage |
| Durable authority descriptor | Implemented active absent-authority descriptor plus captured original-content ledger descriptor | `journalDurableAuthority.ts`, `journalDurableAuthority.test.ts` | D | Captured authority is non-default only; no git or snapshot authority | Preserve no-default boundary |
| Original-content authority seam | Implemented requirement/record/restore-eligibility model with captured-record diagnostics | `journalOriginalContentAuthority.ts`, `journalOriginalContentAuthority.test.ts` | D | Restore requires explicit primitive call; no automatic executor | Expand coverage or UX after Route 59 |
| Recovery readiness projection | Implemented nested `recoveryPlan.recoveryReadiness` diagnostics | `journalRecoveryReadinessProjection.ts`, `journalRecoveryReadinessProjection.test.ts`, representative consumer tests | C/D | Can reflect explicit restore eligibility, but cannot execute recovery | Batch 61 explicit restore surface design |
| Recovery authority store | Implemented explicit non-default prototype | `patchRecovery/recoveryAuthorityStore.ts`, `recoveryAuthorityStore.test.ts` | C/D | No default storage; no session lifecycle; stores original content only under explicit temp/root option | Expand coverage or UX only after boundary review |
| Explicit restore primitive | Implemented guarded per-file primitive | `patchRecovery/restorePrimitive.ts`, `restorePrimitive.test.ts` | C/D | No automatic recovery; no transaction rollback; no CLI/session surface | Product restore UX design or remaining narrow coverage |
| Non-default writer preflight capture | Implemented for single update/delete/create, exactly-two/three/four update, single move, exactly-two/three/four mixed, and bounded multi-delete/multi-move lanes where clean | `workspaceWriteRoute.ts`, `workspaceDeleteRoute.ts`, `workspaceCreateRoute.ts`, `workspaceMoveRoute.ts`, `multiFileWriteRoute.ts`, `mixedFileWriteRoute.ts`, focused route tests | C/D | Narrow surface only; broad `apply_patch`, 5+ writes, and broad multi-delete/multi-move remain out of scope | 5-operation/small-N policy decision or user/session restore UX |
| Current-content guard | Implemented in explicit restore primitive | `restorePrimitive.ts`, `restorePrimitive.test.ts` | C/D | Guard is available only when restore is explicitly invoked | Future restore UX/executor design |
| Partial-failure restore drills | Implemented for exactly-four update, exactly-four mixed, exactly-four delete-only, exactly-four move-only, earlier mixed/update lanes, and bounded destructive partial failures | `multiFileWriteRoute.test.ts`, `mixedFileWriteRoute.test.ts`, `restorePrimitive.test.ts` | C/D | Restore remains explicit and non-atomic; no automatic recovery or rollback claim | User/session restore UX or small-N policy decision |
| Recovery authority index | Implemented explicit non-default inspection surface | `patchRecovery/recoveryAuthorityIndex.ts`, `recoveryAuthorityIndex.test.ts` | C/D | Metadata only; no raw content, workspace reads, default ledger, or session surface | Feed future CLI/session restore UX if needed |
| Restore preview | Implemented explicit eligibility preview | `patchRecovery/restorePreview.ts`, `restorePreview.test.ts` | C/D | Requires explicit ledger/workspace/record selection; no writes or automatic recovery | Preserve as bridge precondition |
| Explicit restore execution bridge | Implemented guarded explicit bridge | `patchRecovery/restoreExecutionBridge.ts`, `restoreExecutionBridge.test.ts` | C/D | Non-atomic per-file/set restore only; no default route invocation, CLI command, or rollback | Optional user/session restore UX route |
| Recovery summary projection | Implemented core projection helper | `patchRecovery/recoverySurfaceProjection.ts`, `recoverySurfaceProjection.test.ts` | D | Not wired into session/CLI lifecycle in Route 61 | Future user/session restore UX route if prioritized |
| Durable journal storage | Partially implemented as explicit non-default authority ledger; not default/session durable | `recoveryAuthorityStore.ts`, cleanup/purge tests | C/D | No default persistence, no SessionManager storage, no provider/session surface | Keep non-default until lifecycle is designed |
| Recovery executor | Future; not implemented | No automatic executor | N/A | Requires product surface, workspace authority at call time, no-hidden-user-edit rule | After capture coverage/UX decision |
| Rollback/snapshot | Future; not implemented | No target snapshot/restore layer | N/A | Needs checkpoint/file-history/storage design and user/session semantics | Batch 59+ |
| 5+ update requests | Explicitly unsupported | `multiFileWriteRoute.ts`, `perFilePatchPlan.ts`, focused unsupported evidence | B/C | No write support | Small-N policy decision only if justified |
| 5+ mixed operations | Explicitly unsupported | `perFilePatchPlan.ts`, `mixedFileWriteRoute.ts`, focused 5+ blocked tests, mixed-operation evidence | B/C | No writer support; no broader arbitrary-N recovery/approval stance | Small-N policy decision only if justified |
| Multi-delete / multi-move beyond bounded Route 64 lanes | Explicitly unsupported as broad destructive features | `perFilePatchPlan.ts`, unsupported E2E, single-file move/delete evidence, bounded mixed/destructive tests | B/C | No 5+ or broad multi-destructive writer; directory delete/move, overwrite, swaps/cycles remain blocked | Small-N policy decision only if justified |
| Final stale-read | Implemented as blocker, not recovery | `workspaceWriteRoute.ts`, `multiFileWriteRoute.ts`, `mutationExecution.ts`, `singleFileApplyPatchFinalStaleRead.ts`, recovery-readiness tests | C/D | No automatic stale-read recovery; no read-state ledger | Original-content ledger prototype before recovery |
| Post-write verification | Implemented for selected writes and classified in recovery plan diagnostics | selected write routes, application modules, `journalFailureStateProjection.ts`, durable authority seam tests | C/D | No rollback after post-write failure | Original-content ledger prototype before recovery |
| Partial failure surface | Implemented stopped surface for multi-file routes with recovery plan diagnostics | `multiFileUpdateApply.ts`, `multiFileWriteRoute.ts`, `multiFileWriteResult.ts`, candidate partial-failure cases, recovery-readiness tests | B/C/D | No automatic repair or rollback; user inspection required | Original-content ledger or explicit no-recovery audit |
| Rollback / atomicity | Explicitly unsupported | Route result modules and journal boundary facts require false claims | B/C/D | No snapshot layer in target project | Future only after durable authority exists |

Evidence strength scale: A = real-provider / real CLI / real runtime gate,
B = synthetic E2E / golden main path, C = focused integration test, D = unit /
contract test, E = documentation only, F = static code inference.

## 6. Post-Route 60 Reference Comparison

Bounded scan count:

- ClaudeCode: 4 files inspected.
- opencode: 5 files inspected.
- gemini-cli: 6 files inspected.
- Total external files inspected: 15.

Files inspected:

- `/home/wang/projects/source-claudecode/tools/FileEditTool/FileEditTool.ts`
- `/home/wang/projects/source-claudecode/tools/FileWriteTool/FileWriteTool.ts`
- `/home/wang/projects/source-claudecode/utils/fileHistory.ts`
- `/home/wang/projects/source-claudecode/cli/print.ts`
- `/home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts`
- `/home/wang/projects/opencode/packages/opencode/src/tool/edit.ts`
- `/home/wang/projects/opencode/packages/opencode/src/tool/write.ts`
- `/home/wang/projects/opencode/packages/opencode/src/session/revert.ts`
- `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/tools/edit.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/tools/write-file.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/services/gitService.ts`
- `/home/wang/projects/gemini-cli/packages/cli/src/ui/commands/restoreCommand.ts`
- `/home/wang/projects/gemini-cli/packages/cli/src/ui/commands/rewindCommand.tsx`
- `/home/wang/projects/gemini-cli/packages/cli/src/ui/utils/rewindFileOps.ts`

### Durable Authority Before Rollback / Restore / Recovery Claims

ClaudeCode claims file rewind only when file checkpointing is enabled and a
matching file-history snapshot exists. Its edit/write tools separately enforce
read-before-write and stale-read checks before writing.

opencode separates patch/edit/write result metadata from session revert.
Revert depends on a snapshot service that tracks a shadow git state and can
restore or revert files from snapshot authority.

gemini-cli uses edit/write tools to produce confirmation diffs and tool result
metadata. Project restore depends on a shadow git repository and checkpoint
JSON, while rewind file revert uses recorded tool-result display data plus
current-content inspection.

The shared pattern is direct: rollback, restore, recovery, and checkpoint
claims only make sense when durable checkpoint, snapshot, file history, or
recorded original-content authority exists.

### Result Metadata vs Recovery Execution

All three references use diff/result metadata for display, permission, or
diagnostics. They do not treat that metadata alone as durable recovery
authority. Recovery execution is a separate action tied to file-history,
snapshot, checkpoint, or recorded original-content data.

This project should copy the conceptual separation, not the implementation
shape. `routeScopedEditJournal` can describe planned, changed, failed,
recovery-candidate, and unrecovered files, but it must not claim recovery was
attempted or possible without a separate durable authority.

### Failed-Before-Apply vs Applied-But-Unverified

ClaudeCode and gemini-cli distinguish validation/read/stale failures from
post-execution tool results. opencode builds per-file changes before applying
them and exposes separate snapshot-backed revert behavior. The project should
make this distinction explicit in future projections:

- failed-before-apply: parse, capability, workspace, permission, preflight, or
  stale-read blockers before a writer applies content.
- applied-but-unverified: writer started or content may have changed, but
  post-write verification failed or a later file failed after earlier verified
  writes.

This classification is useful for user/session-visible facts, but it is still
not recovery execution.

### Broad Edit Gating

ClaudeCode and gemini-cli have mature edit/write tools with confirmation,
workspace/path policy, stale/read checks, and diff display. opencode supports a
broader `apply_patch` tool, but it still separates parse, per-file metadata,
permission, apply, result, and snapshot/revert. None of those paths justify
claiming broad edit readiness in this project while durable recovery authority
is absent and current write support remains deliberately bounded.

### What To Copy Conceptually

- Keep parse, capability, workspace, permission, write, verification, result
  projection, journal metadata, and recovery authority as separate layers.
- Use per-file metadata for user-visible diagnostics and permission surfaces.
- Require durable checkpoint/snapshot/file-history/original-content authority
  before emitting recovery or rollback capability claims.
- Keep broad edit support gated by explicit destructive-write semantics and
  partial-failure handling.

### What To Defer

- Full ClaudeCode file-history/session integration.
- opencode snapshot/revert service.
- gemini-cli shadow-git checkpointing and restore UX.
- Fuzzy corrective edit application.
- Broad arbitrary `apply_patch` write support.
- Any parity claim with the reference repositories.

## 7. Long-Range Capability Gap Map

### Layer A: Observability and Projection

- Recovery plan projection without execution.
- Failed-before-apply vs applied-but-unverified classification.
- Recovery blocker facts such as `metadata-only-journal`,
  `no-durable-snapshot`, `no-original-content`, and `no-recovery-executor`.
- User/session-visible failure facts that explain recovery impossible vs
  recovery not attempted.
- Tests proving `recoveryExecuted=false`, `rollbackAtomicityClaim=false`, and
  no writer behavior change.

### Layer B: Durable Authority Design

- Decide between snapshot, checkpoint, file-history, original-content ledger,
  or another storage seam.
- Decide where authority should live: TypeScript control plane, Rust execution
  plane, contracts, or a narrow storage helper.
- Define storage lifecycle, schema/versioning, cleanup, and audit/history
  residue rules.
- Define trust boundaries for restoring content that may have changed after
  the failed write.
- Align durable authority with workspace authority rather than bypassing it.

### Layer C: Recovery Execution Design

- Define recovery executor preconditions.
- Require original content authority or snapshot authority before restoration.
- Inspect current content before any recovery action.
- Preserve a no-hidden-user-edit rule.
- Define partial failure recovery boundaries and what remains manual.
- Keep recovery execution out of result metadata projection modules unless a
  dedicated executor boundary exists.

### Layer D: Larger Write Surfaces

- 5+ mixed writes.
- 5+ update writes.
- Multi-delete and multi-move beyond the bounded exactly-four surface.
- Broad arbitrary `apply_patch`.
- Destructive approval semantics for larger mixed or destructive sets.
- Explicit choice between sequential/no-rollback execution and
  durable-protected execution.

### Layer E: Product/User Surfaces

- CLI/session failure summary.
- Clear "re-read required" language for stale-read blockers.
- Clear "recovery impossible" vs "recovery not attempted" language.
- Optional future restore UX only after durable authority exists.
- No hidden broad readiness claim in terminal or session summaries.

## 8. Recommended Next Development Batch

The old recommendation that "Route 50 is the single recommended next
implementation route" is historical and obsolete.

Implemented Route 61 batch:

**Batch 61: Explicit restore surface and execution bridge**

Route 61 added a core explicit restore surface without changing default runtime
behavior:

- recovery authority index
- restore preview with current-content guard
- explicit restore execution bridge
- recovery summary projection

CLI/session command wiring was intentionally deferred because it would touch
command parsing, lifecycle, and user-facing persistence semantics.

Implemented Route 62 batch:

**Batch 62: Exactly-three mixed write readiness and bounded implementation**

Route 62 audited the existing exactly-two mixed route and then enabled
selected-workspace exactly-three mixed writes where the same boundaries held:
explicit approval, workspace authority, final stale-read, parsed-order
sequential execution, per-operation verification, optional non-default
recovery-authority capture, journal/recovery-plan diagnostics, no automatic
recovery, and no atomic rollback. Route 64 later opened exactly-four mixed;
5+ mixed and broad `apply_patch` remain blocked.

The next direction should not jump to broad `apply_patch`. Choose either a
destructive multi-delete/multi-move readiness route if destructive semantics
are the next blocker, or user/session explicit restore UX if operator-visible
restore controls become the higher product priority.

Implemented Route 63 batch:

**Batch 63: Bounded destructive multi-delete/multi-move implementation**

Route 63 enabled selected-workspace exactly-two/exactly-three delete-only and
move-only batches under the same explicit route boundary: approval, workspace
authority, directory/overwrite/path-reuse rejection, final preflight before the
first writer, parsed-order execution, per-operation verification, optional
non-default recovery-authority capture, no automatic recovery, and no atomic
rollback. Route 64 later opened exactly-four destructive batches; 5+ writes
and broad `apply_patch` remain unsupported.

The next direction should still not jump directly to broad `apply_patch`.

Implemented Route 64 batch:

**Batch 64: Bounded exactly-four write implementation**

Route 64 enabled selected-workspace exactly-four update, mixed, delete-only,
and move-only support under the existing guarded route boundaries: explicit
approval, workspace authority, final stale-read/preflight before writer start,
parsed-order execution, per-file/per-operation verification, optional
non-default recovery-authority capture, explicit partial-failure restore
drills, no automatic recovery, and no atomic rollback. 5+ writes and broad
`apply_patch` remain unsupported.

The next direction should still not jump directly to broad `apply_patch`.
Choose a 5-operation/small-N bounded write policy decision only if Route 64
evidence remains stable; choose user/session explicit restore UX if
operator-visible restore controls are now the stronger product blocker.

## 9. Recommended Future Sequence

- Batch 57: Recovery readiness projection batch
  - Plan-only recovery projection, failure-state classification, recovery
    blockers, representative consumer wiring, no execution.
  - Status: implemented.

- Batch 58: Durable authority design/prototype decision
  - Decide between git/checkpoint/snapshot/file-history/storage seam options.
  - Status: implemented as seam/readiness model only; selected
    original-content authority as the smallest next direction.

- Batch 59: Original-content ledger non-default storage prototype
  - Add durable original-content authority only behind a non-default seam.
  - Require storage ownership, cleanup, schema, residue, redaction, workspace
    authority, current-content inspection, and tests proving no recovery
    execution.
  - Status: implemented as explicit non-default store, capture wiring, and
    guarded per-file restore primitive.

- Batch 60: Remaining narrow capture coverage and restore drills
  - Status: implemented as single move, exactly-three update, exactly-two
    mixed capture coverage, and explicit partial-failure restore drills.
  - Keep automatic recovery and default persistence absent.

- Batch 61: Explicit restore surface and execution bridge
  - Status: implemented as core recovery authority index, restore preview,
    explicit execution bridge, and recovery summary projection.
  - CLI/session visible command surface remains deferred.

- Batch 62: Exactly-three mixed readiness and bounded implementation
  - Status: implemented as selected-workspace exactly-three mixed write support
    with non-default recovery-authority capture and partial-failure restore
    drills.
  - Route 64 later opened exactly-four mixed; 5+ mixed and broad
    `apply_patch` remain unsupported.

- Batch 63: Bounded destructive multi-delete/multi-move implementation
  - Status: implemented as selected-workspace exactly-two/exactly-three
    delete-only and move-only support with non-default recovery-authority
    capture and destructive partial-failure restore evidence.
  - Route 64 later opened exactly-four destructive batches; 5+ writes, broad
    `apply_patch`, directory delete/move, overwrite,
    automatic recovery, and rollback remain unsupported.

- Batch 64: Bounded exactly-four write implementation
  - Status: implemented as selected-workspace exactly-four update, mixed,
    delete-only, and move-only support with non-default recovery-authority
    capture and exactly-four partial-failure restore drills.
  - 5+ writes, broad `apply_patch`, directory delete/move, overwrite,
    automatic recovery, and rollback remain unsupported.

- Batch 65: 5-operation / small-N bounded write policy decision
  - Decide whether another bounded count tier is still useful or whether the
    next useful product work is explicit restore UX.
  - Keep arbitrary-N and broad `apply_patch` blocked unless approval, ordering,
    partial failure, recovery authority, and user-facing semantics are coherent.

- Batch 66+: Broad `apply_patch` readiness
  - Consider only if larger mixed/write surfaces and recovery/rollback stance
    are settled.
  - Broad arbitrary `apply_patch` remains delayed because it combines parsing,
    ordering, destructive semantics, permission, workspace authority,
    verification, partial failure, recovery, and user-facing claims into a much
    wider blast radius than current bounded writes.

## 10. Validation Strategy

Use the fastest validation that matches the touched layer.

For docs-only roadmap updates:

- `rtk git status --short --branch`
- `rtk git diff --check`

For development batches:

- run minimal focused validation between tasks
- run focused tests for touched patch/result/session modules
- run `rtk npm run verify:result-contract` when result contracts or consumer
  projections change
- run `rtk npm run build -w packages/ts-shell` when code changes
- clean audit/history residue before final status

Do not run broad/default/provider/CLI/MCP gates unless those layers are touched
or the route explicitly opens them. Optional real-user gates should run only
when touched behavior justifies opt-in real-provider validation, and they must
preserve the real-provider boundary.

## 11. Stop Conditions

Stop and split into a separate route if the next step requires:

- new writer reachability
- 5+ mixed operation writes
- 5+ writes
- broad multi-delete or multi-move writes beyond the bounded exactly-four surface
- broad `apply_patch` writes
- durable journal storage
- rollback/snapshot/revert implementation
- recovery executor
- stale-read recovery
- partial failure recovery
- persistence schema changes
- session lifecycle changes
- CLI lifecycle changes
- provider/auth changes
- default gate changes
- real-provider config inspection or default real-provider execution
- moving control-plane semantics into Rust

## 12. Readiness Claim Boundaries

This roadmap changes no runtime readiness claim.

Allowed after this document:

- The project has a post-Route 56 edit capability roadmap.
- The current implemented edit surface includes selected-workspace single-file
  update/create, exactly-two update, exactly-three update, guarded single-file
  move, guarded single-file delete, exactly-two mixed write lanes, and
  exactly-three mixed write lanes.
- Route-scoped edit journal metadata is attached to mixed, multi-file, and
  representative single-file failure surfaces.
- Journal boundary facts are centralized and remain metadata-only.
- Route 57 recovery-readiness diagnostics are implemented as plan-only,
  metadata-only projection: no recovery execution, no rollback claim, no
  durable storage, and no original-content storage authority.
- Route 58 durable authority seam/readiness diagnostics are implemented:
  current authority remains `none` / `absent` / `persistence: none`, and
  original-content requirements are modeled without storing content.
- Route 59 explicit non-default recovery authority loop is implemented:
  original-content authority records can be captured under caller-provided
  ledger roots and explicit per-file restore can be invoked with current-content
  guards.
- Route 60 explicit non-default capture coverage and restore drills are
  implemented for single move, exactly-three update, and exactly-two mixed
  lanes.
- Route 61 core explicit restore surface is implemented: authority index,
  restore preview, explicit execution bridge, and recovery summary projection.
- Route 62 exactly-three mixed write support is implemented for the
  selected-workspace explicit write route, with non-default recovery-authority
  capture and representative partial-failure restore drills.
- Route 63 bounded destructive multi-delete/multi-move support is implemented
  for selected-workspace exactly-two/exactly-three delete-only and move-only
  batches.
- Route 64 bounded exactly-four write support is implemented for
  selected-workspace update, mixed, delete-only, and move-only batches, with
  non-default recovery-authority capture and explicit partial-failure restore
  drills.
- Batch 65 should be either a 5-operation/small-N bounded write policy decision
  or user/session explicit restore UX, depending on which blocker is more urgent.

Forbidden after this document:

- broad `apply_patch` readiness
- arbitrary mutation readiness
- 5+ mixed operation write readiness
- 5+ write readiness
- broad multi-delete or multi-move readiness beyond the bounded exactly-four surface
- durable journal readiness
- recovery executor readiness
- rollback/atomicity readiness
- snapshot/revert readiness
- fuzzy edit readiness
- full ClaudeCode/opencode/gemini-cli parity
- default real-provider mutation readiness
