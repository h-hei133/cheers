# Edit Capability Roadmap

Route baseline: post-Route 81
Date: 2026-05-16
Status: long-range edit capability map after Routes 50-73; edit capability is
now a closeout candidate for the bounded selected-workspace surface.
Routes 59-66 have implemented a narrow explicit non-default original-content
authority loop, explicit restore surface, bounded exactly-three mixed write
expansion, bounded destructive multi-delete/multi-move support, and bounded
small-N write support, plus explicit restore UX/CLI surface.
Route 67 added bounded broad `apply_patch` candidate classification and routing
for parser-supported bounded operation shapes that normalize to existing
guarded small-N write lanes.
Route 68 added a bounded broad patch parser/normalizer for a safe git-style
unified-diff subset and feeds normalized bounded candidates into those same
guarded routes.
Route 69 lifted the bounded cap to 32 and expanded the safe normalizer evidence
for larger multi-file and multi-hunk payloads.
Route 70 added safe git-style rename-with-content-edit decomposition into a
pure move plus immediate target update, centralized unsupported broad-shape
reason metadata, and added a broad fixture gauntlet. It still keeps 33+,
arbitrary broad, fuzzy, binary, mode, symlink, submodule, copy, directory,
overwrite, automatic recovery, and atomic rollback blocked.
Route 71 added a realistic edit compatibility gauntlet across parser,
normalizer, bounded candidate classification, mutation routing, no-write
surfaces, non-default recovery-authority capture, and explicit restore drills.
It did not add new write capability.
Route 72 added safe fenced git-style broad diff extraction into the existing
bounded parser/normalizer/route flow, a pure edit capability readiness model,
and a focused edit closeout verifier. It did not add arbitrary broad
`apply_patch`, fuzzy patching, 33+ writes, automatic recovery, atomic rollback,
provider/session/CLI/MCP changes, or default persistence.
Route 73 sealed the current edit phase as a closeout candidate by adding a
machine-checkable closeout manifest, expanding readiness coverage, strengthening
`verify:edit-capability-closeout`, and documenting practical parity/non-parity
against ClaudeCode, opencode, and gemini-cli.
Route 74 starts context engineering by adding a context continuity design note,
typed context layer model, machine-checkable continuity manifest, compact-safe
context projection, and focused tests for edit/recovery/mutation survivability
without reopening edit runtime behavior.
Route 75 adds Compact v2 route continuity: a structured compact handoff packet,
redaction policy, route handoff builder, compact-safe markdown renderer, and
focused continuity tests proving edit closeout, mutation evidence, recovery
references, validation status, constraints, and next action survive compact
without raw content or secrets. Live compact/session runtime integration remains
deferred to Route 76.
Route 76 adds a preview-only `/compact` command surface for Compact v2 route
continuity: command contract, pure command runner, session-facing formatter,
`/compact` registration with `/handoff` alias, JSON output mode, and focused
tests. It does not compact runtime history, persist memory, change
SessionManager schema, call a provider/model, execute restore, add sidebar UI,
add startup cache, or change edit behavior.
Route 77 adds an in-memory latest Compact v2 checkpoint behind `/compact` and
`/handoff`, plus a future-turn adapter that can produce candidate model-facing
context without injecting it. It does not persist, add memory/sidebar/startup,
change SessionManager schema, call a provider/model, inject future-turn
context, execute restore, add automatic recovery, add atomic rollback, or change
edit behavior.
Route 78 wires actual next-normal-turn Compact v2 injection: `/compact` and
`/handoff` mark the latest live checkpoint pending, `ShellSessionRuntime`
injects compact-safe context into the model-facing prompt once, and the
injection state is consumed without persisting the injected block into session
history. It preserves no memory/sidebar/startup, no provider/MCP/package/default
gate changes, no SessionManager schema change, no edit runtime change, no
automatic recovery, no atomic rollback, and no raw content or secret exposure.
Route 79 adds focused Compact v2 quality/merge hardening: latest pending
checkpoint wins, stale
checkpoints are blocked, stable survivor labels can carry forward, continuity
quality checks run before consumption, and over-budget injected context is
deduped/capped while preserving critical safety facts. It keeps memory,
sidebar, startup, provider/MCP, package/default gates, SessionManager schema,
edit runtime, automatic recovery, atomic rollback, and raw content/secret
exposure out of scope.
Route 80 starts the memory phase without storage: it adds a pure project memory
candidate model, extractor, quality checks, and session-facing candidate
preview from Compact v2/context/session evidence. It keeps automatic writes,
cross-session loading, startup cache, sidebar UI, provider/MCP changes,
package/default gate changes, SessionManager schema changes, edit runtime
changes, automatic recovery, atomic rollback, and raw content/secret exposure
out of scope.
Route 81 adds session-scoped memory candidate review/approval UX through
in-memory review state, command contract, command runner, surface renderer, and
`/memory` registration. Approvals and rejections are not persisted and do not
write/delete memory. It keeps vector DB/backend, automatic writes,
cross-session loading, retrieval/wake-up/recall, startup cache, sidebar UI,
provider/MCP changes, package/default gates, SessionManager schema changes,
edit runtime changes, automatic recovery, atomic rollback, and raw
content/secret exposure out of scope.
Route 82 adds explicit local project memory save for approved safe candidates.
Route 83 adds deterministic recall/search and wake-up preview over the supplied
store. Route 84 adds explicit invalidation/delete lifecycle controls before any
memory auto-injection. Route 85 adds explicit `/memory use` staging and one-shot
future-turn memory injection. These routes remain outside edit runtime
capability and do not change provider/MCP behavior, package/default gates,
SessionManager schema, edit behavior, recovery behavior, or rollback stance.
Recommended Route 86 focus: memory injection quality/merge hardening if
explicit injection remains stable; otherwise harden memory store lifecycle.
This is still not broad edit readiness.

Route 123 adds an explicit controlled real-browser-runtime MVP surface with
manifest/availability/session models, DOM and accessibility snapshots,
controlled local/test click/type action-loop policy, selector repair preview,
runtime receipts/surfaces, and a deterministic browser eval foundation. Public
browser automation, package dependencies, default runtime, provider/model/MCP
calls, cookies/auth/session persistence, raw DOM/page content, and
SessionManager schema changes remain blocked.
Route 124 adds an opt-in browser runtime adapter boundary with external-process
and skill-managed manifest paths, protocol validation, controlled selector
repair apply, process-runner scenarios, and an expanded browser eval gauntlet.
Public browser automation remains blocked. Recommended next route: decide a
real Playwright/Stagehand adapter, controlled action planner, disabled-by-default
session/auth design, or browser eval score gates.

This document records the current edit / patch / mutation capability upper
bound and the long-range route sequence needed before broader edit support can
be claimed. It is based on current target code, current target docs, focused
Route 50-66 evidence, and a bounded directional comparison against ClaudeCode,
opencode, and gemini-cli.

It is not a broad edit readiness claim. It keeps implemented capability,
candidate capability, and unsupported/non-claimed capability separate.

## 1. Post-Route 81 Executive Summary

Current write capability remains intentionally narrow. The project supports a
bounded selected-workspace write surface and still blocks broad arbitrary
`apply_patch`, 33+ writes, broad multi-delete, broad multi-move, directory
delete/move, overwrite, rollback, snapshot/revert, stale-read recovery,
automatic partial failure recovery, and default real-provider mutation
readiness.

Route 70 closed the main Route 69 parser/readiness gap by supporting the narrow
safe rename-with-content-edit shape: a 100 percent similarity git-style rename
with exact hunks now normalizes to move plus immediate target update and routes
through the existing guarded mixed route. The route still owns workspace
authority, approval, final preflight, recovery-authority capture, parsed-order
execution, and post-write verification.

Route 71 validated that surface against realistic agent-output shapes
inspired by ClaudeCode, opencode, gemini-cli, and generic model output. The
gauntlet covers marker patches, git-style safe-subset diffs, prose/fenced
marker output, rename-content decomposition, 32-operation bounded payloads,
unsupported broad metadata, malformed input, no-write surfaces, non-default
recovery-authority capture, and explicit restore drills. It found no runtime
writer gap requiring code changes.

Route 72 then closed the only concrete Route 71 parser gap by extracting one
clearly fenced git-style broad diff and handing it to the existing bounded
normalizer. The new extractor blocks multiple fenced blocks, incomplete
fences, non-patch fences, nested/ambiguous fences, prose with multiple patch
candidates, and any fenced content that the existing bounded normalizer rejects.
The route also added `editCapabilityReadiness.ts` and
`verify-edit-capability-closeout.mjs` as closeout evidence. This is a targeted
model-output compatibility improvement, not new writer authority.

Route 73 turned that evidence into a closeout seal: `editCapabilityReadiness.ts`
now covers the full supported/non-default/blocked envelope, and
`editCapabilityCloseoutManifest.ts` exposes a machine-checkable
closeout-candidate manifest with no automatic recovery, no atomic rollback, no
default persistence, and arbitrary broad `apply_patch` blocked by design.
`verify:edit-capability-closeout` now covers parser, fenced extraction,
normalizer, unsupported taxonomy, bounded candidate classification, cap policy,
compatibility gauntlet, readiness, manifest, and restore core surfaces. The
result contract remains a required final validation gate run separately.

Routes 57-73 are therefore complete for this edit capability phase. Route 74
uses that sealed state as context-engineering input, Route 75 makes it survive
compact as structured handoff state, and Route 76 exposes that handoff through a
preview-only `/compact` command. Route 77 keeps that command simple while
creating a live in-memory checkpoint and a candidate-only future-turn adapter.
Route 78 consumes that checkpoint once on the next normal model turn, and
Route 79 hardens repeated compact quality/merge around that injection path.
The sealed state is closeout-candidate, not broad edit readiness and not
reference-repo feature parity.

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
diagnostics, no automatic recovery, and no atomic rollback. Routes 64-65 later
opened exactly-four and then bounded mixed operations; Route 69 lifted the cap
to 32. 33+ mixed operations and broad arbitrary `apply_patch` remain blocked.

Route 63 implemented bounded same-family destructive batches for
selected-workspace exactly-two/exactly-three delete-only and move-only shapes.
It reuses the guarded bounded route/result surface: explicit approval,
workspace authority for every destructive source/target, directory and
overwrite rejection, final preflight before the first writer, parsed-order
sequential execution, per-operation verification, non-default recovery-authority
capture, partial-failure restore drills, no automatic recovery, and no atomic
rollback. Routes 64-65 later opened exactly-four and then bounded writes;
Route 69 lifted the cap to 32. 33+ writes, broad arbitrary `apply_patch`, directory delete/move,
multi-delete/multi-move beyond this bounded surface, and provider/session/CLI/MCP
behavior remain blocked.

Route 64 implemented selected-workspace exactly-four update, mixed,
delete-only, and move-only batches where the readiness audit passed. It keeps
explicit approval over all affected paths, selected-workspace authority, final
stale-read/preflight before writer start, parsed-order sequential execution,
per-file/per-operation verification, non-default recovery-authority capture,
explicit partial-failure restore drills, no automatic recovery, and no atomic
rollback. Route 65 later opened bounded writes; Route 69 lifted the cap to 32.
33+ writes, broad arbitrary `apply_patch`, directory delete/move,
overwrite, path reuse, provider/session/CLI/MCP changes, package scripts, and
default gates remain blocked.

Route 65 replaced exact count-by-count expansion with a bounded small-N policy.
Selected-workspace update-only, mixed, delete-only, and move-only batches now
support 2-8 guarded operations through the existing explicit approval,
workspace authority, final preflight, sequential writer, per-file verification,
non-default recovery-authority capture, journal/recovery-plan diagnostics, and
explicit restore drill boundaries. Route 69 later lifted the cap to 32; 33+
writes and broad arbitrary `apply_patch` remain blocked. This is still not automatic recovery, atomic rollback, default
persistence, provider/session/CLI/MCP behavior, package-script, or default-gate
readiness.

Route 66 added a user-operable explicit restore surface: command contract,
command runner, `/restore` local command path, and session/user recovery
summary lines when failed results contain captured authority. Preview remains
the safe default. Execute requires explicit intent. Restore output is separate
from normal edit route results, and route result `recoveryExecuted` remains
false. There is still no automatic recovery, atomic rollback, default
persistence, provider/MCP change, package script change, broad `apply_patch`,
or 33+ write support.

Route 67 added the first bounded broad `apply_patch` candidate path. It
classifies parser-supported bounded operation payloads into existing guarded
single-file, update-only, mixed, delete-only, and move-only routes. The
classifier is projection-only: it does not read, write, approve, persist, or
recover. Existing route code still owns workspace authority, approval,
preflight, recovery-authority capture, writer execution, and result
projection. At the Route 67 boundary, 9+ operations, unified diff/arbitrary
broad patches, directory
delete/move, path conflicts, move-with-content-edit destructive shapes,
overwrite, fuzzy patch, automatic recovery, atomic rollback, and broad
`apply_patch` readiness remain unsupported.

Route 68 removed the next parser/shape blocker for a safe subset. It added
`patchParsing/boundedBroadPatchNormalizer.ts`, which parses git-style
update/add/delete/pure-rename sections and serializes them into existing
marker-style operations before routing. The normalizer is still pure:
no file read, no write, no approval, no persistence, no restore execution, no
fuzzy apply, and no broad arbitrary patch engine. Safe normalized payloads
reuse existing guarded routes and recovery-authority capture. At the Route 68
boundary, 9+ payloads,
binary patches, mode changes, rename-with-content-edit, malformed/unsupported
hunks, directory/path conflicts, overwrite, fuzzy patch, automatic recovery,
atomic rollback, and broad arbitrary `apply_patch` readiness remain
unsupported.

Route 69 lifted the central bounded policy cap from 8 to 32. Parser-supported
and normalized git-style safe-subset payloads now route 1-32 operations through
the same guarded single-file, update-only, mixed, delete-only, and move-only
lanes. The normalizer preserves multi-hunk updates when they can be represented
as exact marker hunks, and it blocks metadata-only or unsafe broad shapes with
more precise reasons, including symlink, submodule, copy metadata, and
rename-with-content-edit. Counts 33+, arbitrary broad patches, fuzzy patches,
binary/mode/symlink/submodule/copy shapes, directory operations, overwrite,
automatic recovery, atomic rollback, provider/session/CLI/MCP behavior, package
scripts, and default gates remain unsupported.

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

- Selected-workspace bounded small-N existing-file `Update File`
  - Runtime owner: `mutationRoutingProjection.ts` dispatches bounded 2-32
    update-only shapes to `runMultiFileWriteRoute()`.
  - Write route/application: `patchResult/multiFileWriteRoute.ts` and
    `patchApplication/multiFileUpdateApply.ts`.
  - Result projection: `patchResult/multiFileWriteResult.ts` and
    `patchResult/perFilePatchPlan.ts`.
  - Design evidence: `docs/design/bounded-small-n-write-policy.md`.
  - Boundary: 2-32 distinct existing-file update targets, explicit approval
    naming all files, all final stale-reads before writer start, sequential
    writes, per-file verification, optional non-default recovery-authority
    capture, explicit restore drills, no automatic recovery, and no rollback.

- Bounded broad `apply_patch` candidates
  - Runtime owner: `mutationRoutingProjection.ts` classifies safe
    parser-supported and Route 68/69 normalized git-style payloads through
    `boundedApplyPatchCandidate.ts`.
  - Parser/normalizer owner:
    `patchParsing/boundedBroadPatchNormalizer.ts` converts the safe git-style
    subset into existing marker-style operations.
  - Route owners: existing single-file routes for count 1,
    `multiFileWriteRoute.ts` for 2-32 update-only, and
    `mixedFileWriteRoute.ts` for 2-32 mixed/delete-only/move-only.
  - Design evidence: `docs/design/bounded-broad-apply-patch-candidate.md` and
    `docs/design/bounded-broad-patch-parser-normalizer.md`, plus
    `docs/design/expanded-bounded-broad-patch-safe-subset.md`.
  - Boundary: parse/normalize only into existing guarded routes; no broad
    arbitrary parser, no 33+ writes, no directory delete/move, no overwrite, no
    rename-with-content-edit, no fuzzy patch, no automatic recovery, and no
    atomic rollback.

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

- Selected-workspace bounded small-N mixed/delete-only/move-only lanes
  - Runtime owner: `mutationRoutingProjection.ts` dispatches bounded 2-32
    guarded operation shapes to `runMixedFileWriteRoute()`.
  - Write route/result: `patchResult/mixedFileWriteRoute.ts`,
    `patchResult/mixedFileWriteResult.ts`, and `patchResult/perFilePatchPlan.ts`.
  - Design evidence: `docs/design/bounded-small-n-write-policy.md`.
  - Boundary: 2-32 update/create/delete/move operations or same-family
    delete-only/move-only batches, selected-workspace source/target authority,
    directory/overwrite/path-reuse/swap/cycle rejection, final preflight before
    writer start, parsed-order writes, per-operation verification, optional
    non-default recovery-authority capture, explicit restore drills, no
    automatic recovery, and no rollback.

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
  - Status: implemented for mixed-operation classification and bounded 2-32
    mixed support while preserving 33+ mixed and broad `apply_patch` no-write
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
    provider/session/CLI/MCP behavior, no broad writes, no 33+ mixed writes.

- Mixed/multi/single-file failure journal coverage
  - Mixed and multi-file partial failure paths carry journal metadata.
  - Representative single-file write/create/move/delete failure consumers carry
    journal metadata.
  - Coverage is observability, not recovery authority.

### Explicitly Unsupported

- 33+ mixed writes.
- 33+ update writes.
- Broad arbitrary `apply_patch` writes.
- Broad arbitrary git/unified diff writes outside the Route 68/69 safe subset.
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
- 33+ mixed operation write support
- 33+ write support
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
   status: implemented for apply_patch markers/add/update/delete/move parse
   and Route 68 safe git-style broad patch normalization; malformed output
   explicitly stopped.
-> mutation routing
   status: implemented narrow dispatch in mutationRoutingProjection.ts;
   normalized broad patch text is routed only through existing guarded paths.
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
   bounded mixed write lanes up to cap 32; broad, 33+ mixed, 33+ update,
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
| Exactly-four bounded write lanes | Implemented candidate; superseded by bounded small-N cap 32 | `mutationRoutingProjection.ts`, `multiFileWriteRoute.ts`, `multiFileUpdateApply.ts`, `mixedFileWriteRoute.ts`, `perFilePatchPlan.ts`, `mixedOperationReadiness.ts`, `multiFileWriteRoute.test.ts`, `mixedFileWriteRoute.test.ts`, `perFilePatchPlan.test.ts`, `mutationRoutingProjection.test.ts`, `docs/design/bounded-exactly-four-write-surface.md` | C/D/E | Historical exact-four slice; current cap is 32; no 33+ writes, broad `apply_patch`, automatic recovery, or rollback | Preserve as regression evidence |
| Bounded multi-delete / multi-move lanes | Implemented candidate under bounded small-N cap 32 | `mixedFileWriteRoute.ts`, `mixedFileWriteResult.ts`, `perFilePatchPlan.ts`, `mixedFileWriteRoute.test.ts`, `perFilePatchPlan.test.ts`, `mutationRoutingProjection.test.ts`, `docs/design/bounded-destructive-multi-delete-move.md`, `docs/design/bounded-exactly-four-write-surface.md` | C/D/E | 2-32 delete-only or move-only operations only; no 33+ writes, directory delete/move, overwrite, swaps/cycles, automatic recovery, or rollback | Unsupported-shape UX hardening or rename-with-content readiness only if justified |
| Bounded small-N write policy | Implemented candidate | `boundedWritePolicy.ts`, `multiFileWriteRoute.ts`, `multiFileUpdateApply.ts`, `mixedFileWriteRoute.ts`, `perFilePatchPlan.ts`, `mixedOperationReadiness.ts`, focused route/planning/readiness tests, `docs/design/bounded-small-n-write-policy.md` | C/D/E | Cap 32 only; no 33+ writes, broad `apply_patch`, automatic recovery, or rollback | Preserve cap; do not jump to arbitrary-N without separate readiness proof |
| Bounded broad `apply_patch` candidates | Implemented candidate | `boundedApplyPatchCandidate.ts`, `mutationRoutingProjection.ts`, `boundedApplyPatchCandidate.test.ts`, `mutationRoutingProjection.test.ts`, `docs/design/bounded-broad-apply-patch-candidate.md`, `docs/design/expanded-bounded-broad-patch-safe-subset.md`, `docs/design/rename-content-and-broad-shape-gauntlet.md` | C/D/E | Parser-supported or Route 68-70 normalized 1-32 operations only; no arbitrary broad patch, 33+ writes, directory operations, overwrite, fuzzy patch, automatic recovery, or rollback | Unsupported-shape UX hardening only if needed |
| Bounded broad patch parser/normalizer | Implemented expanded safe subset | `patchParsing/boundedBroadPatchNormalizer.ts`, `boundedBroadPatchNormalizer.test.ts`, `parser.ts`, `parser.test.ts`, `boundedApplyPatchCandidate.ts`, `mutationRoutingProjection.ts`, `docs/design/bounded-broad-patch-parser-normalizer.md`, `docs/design/expanded-bounded-broad-patch-safe-subset.md`, `docs/design/rename-content-and-broad-shape-gauntlet.md` | C/D/E | Git-style update/add/delete/pure-rename, safe rename-with-content decomposition, and exact multi-hunk update subset only; binary, mode, symlink, submodule, copy, malformed, fuzzy, 33+, directory/path conflicts, overwrite, and arbitrary broad shapes remain blocked | Unsupported-shape UX hardening if needed |
| Rename-with-content-edit decomposition | Implemented bounded candidate | `boundedBroadPatchNormalizer.ts`, `mixedFileWriteRoute.ts`, `perFilePatchPlan.ts`, `boundedApplyPatchCandidate.test.ts`, `mixedFileWriteRoute.test.ts`, `mutationRoutingProjection.test.ts`, `docs/design/rename-content-and-broad-shape-gauntlet.md` | C/D/E | Only 100 percent similarity git-style rename plus exact hunks; operation count is move plus update; no lower-similarity rename, move-with-hunks, overwrite, fuzzy patch, automatic recovery, or rollback | Preserve narrow dependency; do not generalize without separate route |
| Broad unsupported-shape taxonomy and gauntlet | Implemented projection/test hardening | `patchParsing/broadPatchUnsupportedReason.ts`, `broadPatchUnsupportedReason.test.ts`, `boundedBroadPatchNormalizer.test.ts`, `boundedApplyPatchCandidate.test.ts`, `docs/design/rename-content-and-broad-shape-gauntlet.md` | C/D/E | Reason metadata is no-write evidence only; user-facing result shape remains bounded by existing contracts | Optional UX projection polish only if needed |
| Realistic edit compatibility gauntlet | Implemented Route 71/72 compatibility evidence | `patchResult/editCompatibilityGauntlet.test.ts`, `docs/design/realistic-edit-compatibility-gauntlet.md`, `boundedApplyPatchCandidate.ts`, `boundedBroadPatchNormalizer.ts`, `fencedPatchExtractor.ts`, `mutationRoutingProjection.ts`, recovery store/restore primitives | C/D/E | Gauntlet adds evidence and fenced extraction coverage, not new writer authority; arbitrary broad, fuzzy, binary/mode/symlink/submodule, 33+, automatic recovery, and rollback remain blocked | Route 73 closeout map/seal if validation remains green |
| Fenced bounded broad diff extraction | Implemented targeted parser compatibility | `patchParsing/fencedPatchExtractor.ts`, `fencedPatchExtractor.test.ts`, `boundedBroadPatchNormalizer.ts`, `boundedApplyPatchCandidate.test.ts`, `editCompatibilityGauntlet.test.ts`, `docs/design/edit-closeout-readiness-and-fenced-broad-diff.md` | C/D/E | Supports one clear fenced git-style diff only; multiple/incomplete/non-patch/nested/prose-multiple candidates remain blocked; no arbitrary prose parser | Preserve as compatibility shim; do not widen without route |
| Edit capability readiness model | Implemented pure closeout classification | `patchResult/editCapabilityReadiness.ts`, `editCapabilityReadiness.test.ts`, `docs/design/edit-closeout-readiness-and-fenced-broad-diff.md`, `docs/design/edit-capability-closeout-seal.md` | D/E | Classification only; no routing, writer, provider, session, persistence, recovery, or rollback behavior | Preserve as closeout source of truth |
| Edit capability closeout manifest | Implemented machine-checkable closeout artifact | `patchResult/editCapabilityCloseoutManifest.ts`, `editCapabilityCloseoutManifest.test.ts`, `editCapabilityReadiness.ts`, `docs/design/edit-capability-closeout-seal.md` | D/E | Manifest is evidence and boundary data only; no runtime routing or writer behavior | Keep aligned with readiness and verifier |
| Edit capability closeout verifier | Implemented focused local verifier | `scripts/verify-edit-capability-closeout.mjs`, `package.json`, parser/fenced/normalizer/taxonomy/candidate/cap/gauntlet/readiness/manifest/restore tests | D/E | Not a default release gate; does not run provider/CLI/MCP/real-provider gates; result-contract runs separately in final validation | Run when edit closeout evidence is touched |
| 8-operation recovery-authority drills | Implemented explicit drill evidence | `multiFileWriteRoute.test.ts`, `mixedFileWriteRoute.test.ts` | C/D | Explicit primitive only; no automatic recovery, session restore command, or atomic rollback | User/session explicit restore UX if product priority |
| Per-file patch plan/result contract | Implemented route/result infrastructure | `perFilePatchPlan.ts`, route/result projections, `verify:result-contract`, unsupported E2E and continuity checks | B/C/D | Still bounded to known supported/unsupported shapes; not broad write readiness | Preserve as recovery-plan consumer |
| Route-scoped edit journal prototype | Implemented metadata-only projection | `routeScopedEditJournal.ts`, `routeScopedEditJournal.test.ts` | C/D | Non-durable; not recovery or writer authority | Feed original-content ledger prototype if safe |
| Journal result projection | Implemented failure-surface projection with recovery plan diagnostics | `journalResultProjection.ts`, `journalResultProjection.test.ts` | C/D | No recovery execution; no durable storage | Feed original-content ledger prototype if safe |
| Mixed/multi failure journal metadata | Implemented observability coverage | `mixedFileWriteResult.ts`, `multiFileWriteResult.ts`, related focused tests | C/D | Partial failure remains unrecovered; no rollback | Keep as evidence source for original-content ledger decision |
| Single-file failure journal metadata | Implemented representative coverage | `workspaceWriteResult.ts`, `workspaceCreateResult.ts`, `workspaceMoveResult.ts`, `workspaceDeleteResult.ts`, focused tests | C/D | Coverage is failure metadata only; success paths are not a recovery ledger | Keep as representative wiring |
| Journal failure consumer entrypoint | Implemented shared projection entrypoint | `journalFailureConsumer.ts` | C/D | Builds journal facts but recovery classification is projected downstream | Preserve existing changed/failed/planned semantics |
| Journal metadata boundary helper | Implemented centralized boundary and blocker facts | `journalMetadataBoundary.ts`, `journalMetadataBoundary.test.ts` | C/D | No durability, storage, restore, or executor | Preserve in all future recovery work |
| External comparison against ClaudeCode/opencode/gemini-cli | Completed directional and closeout parity evidence | This roadmap, `journal-boundary-readiness.md`, `docs/design/edit-capability-closeout-seal.md` | E/F | Comparison is feature-level only; full parity is not claimed | Use to block unsupported recovery and broad edit claims |
| Recovery failure-state classification | Implemented projection-only diagnostics | `journalFailureStateProjection.ts`, `journalFailureStateProjection.test.ts` | D | Classification depends on existing journal facts; unknown state remains explicit when facts are insufficient | Feed original-content ledger prototype if safe |
| Recovery plan projection | Implemented plan-only diagnostics with absent-authority and captured non-default authority modes | `journalRecoveryPlanProjection.ts`, `journalRecoveryPlanProjection.test.ts`, `journalResultProjection.ts`, focused consumer tests | C/D | No automatic recovery executor, rollback, snapshot, or default persistence | Preserve while expanding non-default coverage |
| Durable authority descriptor | Implemented active absent-authority descriptor plus captured original-content ledger descriptor | `journalDurableAuthority.ts`, `journalDurableAuthority.test.ts` | D | Captured authority is non-default only; no git or snapshot authority | Preserve no-default boundary |
| Original-content authority seam | Implemented requirement/record/restore-eligibility model with captured-record diagnostics | `journalOriginalContentAuthority.ts`, `journalOriginalContentAuthority.test.ts` | D | Restore requires explicit primitive call; no automatic executor | Expand coverage or UX after Route 59 |
| Recovery readiness projection | Implemented nested `recoveryPlan.recoveryReadiness` diagnostics | `journalRecoveryReadinessProjection.ts`, `journalRecoveryReadinessProjection.test.ts`, representative consumer tests | C/D | Can reflect explicit restore eligibility, but cannot execute recovery | Batch 61 explicit restore surface design |
| Recovery authority store | Implemented explicit non-default prototype | `patchRecovery/recoveryAuthorityStore.ts`, `recoveryAuthorityStore.test.ts` | C/D | No default storage; no session lifecycle; stores original content only under explicit temp/root option | Expand coverage or UX only after boundary review |
| Explicit restore primitive | Implemented guarded per-file primitive | `patchRecovery/restorePrimitive.ts`, `restorePrimitive.test.ts` | C/D | No automatic recovery; no transaction rollback; no CLI/session surface | Product restore UX design or remaining narrow coverage |
| Non-default writer preflight capture | Implemented for single update/delete/create/move and bounded 2-32 update/mixed/delete/move lanes where clean | `workspaceWriteRoute.ts`, `workspaceDeleteRoute.ts`, `workspaceCreateRoute.ts`, `workspaceMoveRoute.ts`, `multiFileWriteRoute.ts`, `mixedFileWriteRoute.ts`, focused route tests | C/D | Narrow surface only; arbitrary broad `apply_patch`, 33+ writes, and broad multi-delete/multi-move remain out of scope | CLI restore polish or unsupported-shape hardening |
| Current-content guard | Implemented in explicit restore primitive | `restorePrimitive.ts`, `restorePrimitive.test.ts` | C/D | Guard is available only when restore is explicitly invoked | Future restore UX/executor design |
| Partial-failure restore drills | Implemented for exactly-four update, exactly-four mixed, exactly-four delete-only, exactly-four move-only, earlier mixed/update lanes, and bounded destructive partial failures | `multiFileWriteRoute.test.ts`, `mixedFileWriteRoute.test.ts`, `restorePrimitive.test.ts` | C/D | Restore remains explicit and non-atomic; no automatic recovery or rollback claim | User/session restore UX or small-N policy decision |
| Recovery authority index | Implemented explicit non-default inspection surface | `patchRecovery/recoveryAuthorityIndex.ts`, `recoveryAuthorityIndex.test.ts` | C/D | Metadata only; no raw content, workspace reads, default ledger, or session surface | Feed future CLI/session restore UX if needed |
| Restore preview | Implemented explicit eligibility preview | `patchRecovery/restorePreview.ts`, `restorePreview.test.ts` | C/D | Requires explicit ledger/workspace/record selection; no writes or automatic recovery | Preserve as bridge precondition |
| Explicit restore execution bridge | Implemented guarded explicit bridge | `patchRecovery/restoreExecutionBridge.ts`, `restoreExecutionBridge.test.ts` | C/D | Non-atomic per-file/set restore only; no default route invocation, CLI command, or rollback | Optional user/session restore UX route |
| Recovery summary projection | Implemented core projection helper and user/session summary wiring | `patchRecovery/recoverySurfaceProjection.ts`, `recoverySurfaceProjection.test.ts`, `core/shell/restoreSurfaceSummary.ts`, `restoreSurfaceSummary.test.ts`, selected route result projections | C/D | Summary depends on captured non-default authority; no raw content or ledger root is printed automatically | CLI polish only if needed |
| Restore command contract | Implemented explicit preview/execute contract | `patchRecovery/restoreCommandContract.ts`, `restoreCommandContract.test.ts` | C/D | Requires explicit ledger/workspace/authority and selection; no default storage root | Preserve before any broader restore UX |
| Restore command runner | Implemented bridge from command contract to preview/execute bridge | `patchRecovery/restoreCommandRunner.ts`, `restoreCommandRunner.test.ts` | C/D | Does not invoke provider/model or persist session state; non-atomic explicit restore only | Preserve current-content guard |
| CLI restore preview/execute path | Implemented local `/restore` command | `core/commands/restoreCommandRuntime.ts`, command registry, slash command help, focused command tests | C/D | Minimal slash command UX; no interactive picker or default ledger discovery | Route 67 CLI restore polish only if needed |
| Durable journal storage | Partially implemented as explicit non-default authority ledger; not default/session durable | `recoveryAuthorityStore.ts`, cleanup/purge tests | C/D | No default persistence, no SessionManager storage, no provider/session surface | Keep non-default until lifecycle is designed |
| Recovery executor | Future; not implemented | No automatic executor | N/A | Requires product surface, workspace authority at call time, no-hidden-user-edit rule | After capture coverage/UX decision |
| Rollback/snapshot | Future; not implemented | No target snapshot/restore layer | N/A | Needs checkpoint/file-history/storage design and user/session semantics | Batch 59+ |
| 33+ update requests | Explicitly unsupported | `multiFileWriteRoute.ts`, `perFilePatchPlan.ts`, focused unsupported evidence | B/C | No write support above cap 32 | Arbitrary-N readiness audit only if justified |
| 33+ mixed/destructive operations | Explicitly unsupported | `perFilePatchPlan.ts`, `mixedFileWriteRoute.ts`, focused 33+ blocked tests, mixed-operation evidence | B/C | No writer support above cap 32; no broader arbitrary-N recovery/approval stance | Arbitrary-N readiness audit only if justified |
| Multi-delete / multi-move beyond bounded Route 69 lanes | Explicitly unsupported as broad destructive features | `perFilePatchPlan.ts`, unsupported E2E, single-file move/delete evidence, bounded mixed/destructive tests | B/C | No 33+ or broad multi-destructive writer; directory delete/move, overwrite, swaps/cycles remain blocked | Arbitrary-N readiness audit only if justified |
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

- 33+ mixed writes.
- 33+ update writes.
- Multi-delete and multi-move beyond the bounded small-N cap.
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
recovery, and no atomic rollback. Routes 64-65 later opened exactly-four and
bounded mixed lanes, and Route 69 lifted the cap to 32; 33+ mixed and broad
`apply_patch` remain blocked.

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
rollback. Routes 64-65 later opened exactly-four and bounded destructive
batches, and Route 69 lifted the cap to 32; 33+ writes and broad `apply_patch`
remain unsupported.

The next direction should still not jump directly to broad `apply_patch`.

Implemented Route 64 batch:

**Batch 64: Bounded exactly-four write implementation**

Route 64 enabled selected-workspace exactly-four update, mixed, delete-only,
and move-only support under the existing guarded route boundaries: explicit
approval, workspace authority, final stale-read/preflight before writer start,
parsed-order execution, per-file/per-operation verification, optional
non-default recovery-authority capture, explicit partial-failure restore
drills, no automatic recovery, and no atomic rollback. Route 65 later replaced
count-by-count expansion with bounded support, and Route 69 lifted that bounded
cap to 32; 33+ writes and broad `apply_patch` remain unsupported.

Implemented Route 65 batch:

**Batch 65: Bounded small-N write policy implementation**

Route 65 enabled selected-workspace update-only, mixed, delete-only, and
move-only batches with a cap of 8. It centralized the count policy, preserved
approval/workspace/preflight/verification/result semantics, added
representative 8-operation recovery-authority and restore drills, and kept 9+
writes and broad `apply_patch` blocked at that route boundary. Route 69 later lifted the cap to 32
after focused route/planning evidence. Do not continue count-by-count expansion
by default.

Implemented Route 66 batch:

**Batch 66: Explicit restore UX and CLI/session surface**

Route 66 made the existing non-default recovery authority loop user-operable
without adding automatic recovery or rollback. It added a restore command
contract, command runner, local `/restore` preview/execute command, and
session/user recovery summary lines for captured-authority failures. Preview
is the default. Execute requires explicit intent. Provider/MCP behavior,
package scripts, default gates, 33+ writes, broad `apply_patch`, default
persistence, automatic recovery, and atomic rollback remain unchanged.

Implemented Route 68 batch:

**Batch 68: Bounded broad patch parser/normalizer**

Route 68 added a pure git-style broad patch parser/normalizer for update,
add, delete, and pure-rename sections that can be represented as existing
marker-style operations. It routes safe normalized bounded candidates through the
existing guarded single-file, multi-file, mixed, delete, and move routes. It
also preserves non-default recovery-authority capture and explicit restore
drill evidence for representative normalized candidates. It does not add fuzzy
patching, arbitrary broad patch application, 33+ writes, automatic recovery,
atomic rollback, provider/session/MCP changes, package scripts, default gates,
or default persistence.

Implemented Route 69 batch:

**Batch 69: Expanded bounded broad patch safe subset**

Route 69 lifted the bounded cap to 32, kept 33+ operations blocked, preserved
existing guarded route ownership, and expanded normalizer evidence for larger
multi-file and exact multi-hunk git-style updates. It kept
rename-with-content-edit blocked because the current move route is
content-preserving and a move-plus-update decomposition needs a separate
execution/recovery decision. Binary, mode, symlink, submodule, copy, fuzzy,
directory, overwrite, automatic recovery, atomic rollback, provider/session/MCP,
package script, and default-gate changes remain unsupported.

Recommended next direction: unsupported broad-shape UX hardening if users need
clearer blocked-shape explanations. Rename-with-content-edit may be a separate
route only if it becomes the main remaining parser blocker. Arbitrary-N and
broad arbitrary `apply_patch` remain delayed.

Implemented Route 70 batch:

**Batch 70: Rename-with-content decomposition and broad-shape gauntlet**

Route 70 implemented the narrow safe git-style rename-with-content-edit
decomposition, centralized unsupported broad-shape reasons, and proved the
supported/blocked broad fixture set. It preserved cap 32, guarded route
ownership, no automatic recovery, no atomic rollback, and no arbitrary broad
`apply_patch`.

Implemented Route 71 batch:

**Batch 71: Realistic edit compatibility gauntlet**

Route 71 added a reusable realistic fixture harness across parser,
normalizer, candidate classification, mutation routing, no-write surfaces,
recovery-authority capture, and explicit restore drills. It covers 15
supported categories and 18 blocked categories, with executable route
representatives and restore drills. It did not require runtime writer changes
and did not open fenced git-style broad diff extraction.

Implemented Route 72 batch:

**Batch 72: Edit closeout readiness and fenced broad diff extraction**

Route 72 implemented a pure fenced patch extractor for one clear fenced
git-style broad diff and wired it into the existing bounded normalizer and
candidate route flow. It extended the compatibility gauntlet with fenced
supported and blocked fixtures, added a pure readiness classification helper,
and added a focused closeout verifier. It preserved cap 32, no-write/dry-run
non-authorization, arbitrary broad/fuzzy/binary/mode/symlink/submodule
blocking, no automatic recovery, and no atomic rollback.

Recommended next direction: Route 73 should be an edit capability closeout map
and seal if Route 72 validation remains green. Do not move to arbitrary broad
`apply_patch`; that remains delayed until larger write surfaces and durable
recovery/rollback stance are explicitly re-audited.

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
  - Route 66 later added CLI/session visible command surface.

- Batch 62: Exactly-three mixed readiness and bounded implementation
  - Status: implemented as selected-workspace exactly-three mixed write support
    with non-default recovery-authority capture and partial-failure restore
    drills.
  - Routes 64-65 later opened exactly-four and bounded mixed; Route 69 lifted
    the cap to 32. 33+ mixed and
    broad `apply_patch` remain unsupported.

- Batch 63: Bounded destructive multi-delete/multi-move implementation
  - Status: implemented as selected-workspace exactly-two/exactly-three
    delete-only and move-only support with non-default recovery-authority
    capture and destructive partial-failure restore evidence.
  - Routes 64-65 later opened exactly-four and bounded destructive batches;
    Route 69 lifted the cap to 32. 33+ writes, broad
    `apply_patch`, directory delete/move, overwrite,
    automatic recovery, and rollback remain unsupported.

- Batch 64: Bounded exactly-four write implementation
  - Status: implemented as selected-workspace exactly-four update, mixed,
    delete-only, and move-only support with non-default recovery-authority
    capture and exactly-four partial-failure restore drills.
  - Route 65 later opened bounded writes; Route 69 lifted the cap to 32.
    33+ writes, broad `apply_patch`,
    directory delete/move, overwrite,
    automatic recovery, and rollback remain unsupported.

- Batch 65: Bounded small-N write policy implementation
  - Status: implemented with cap 8, later lifted by Route 69 to cap 32, for
    update-only, mixed, delete-only, and move-only batches.
  - 33+ writes, broad `apply_patch`, automatic recovery, and rollback remain
    unsupported.

- Batch 66: Explicit restore UX and CLI/session surface
  - Status: implemented as restore command contract, command runner, local
    `/restore` preview/execute command, and session/user recovery summary.
  - Preview is default; execute requires explicit intent; no automatic
    recovery, rollback, provider/MCP change, default persistence, 33+ writes,
    or broad `apply_patch`.

- Batch 67: Bounded broad `apply_patch` candidate implementation
  - Status: implemented as classifier/routing support for parser-supported
    bounded operation payloads that normalize to existing guarded single-file,
    update-only, mixed, delete-only, and move-only lanes.
  - 33+ operations, arbitrary unified diff/broad patch shapes, directory
    operations, overwrite, fuzzy patch, automatic recovery, atomic rollback,
    and broad readiness remain unsupported.

- Batch 68: Bounded broad patch parser/normalizer implementation
  - Status: implemented as a pure parser/normalizer for safe git-style
    update/add/delete/pure-rename sections, normalized into existing guarded
    bounded operation routes.
  - Route 69 later expanded the cap and multi-hunk evidence.
  - 33+ writes, arbitrary broad patches, binary/mode/fuzzy patches,
    rename-with-content-edit, directory/path conflicts, overwrite, automatic
    recovery, and rollback remain unsupported.

- Batch 69: Expanded bounded broad patch safe subset
  - Status: implemented with cap 32, larger safe normalized payloads, exact
    multi-hunk update preservation, and explicit blockers for metadata-only or
    unsafe broad shapes.
  - 33+ writes, arbitrary broad patches, rename-with-content-edit, fuzzy patch,
    automatic recovery, and rollback remain unsupported.

- Batch 70: Rename-with-content decomposition and broad-shape gauntlet
  - Status: implemented safe 100 percent similarity git-style
    rename-with-content-edit as move plus immediate target update, centralized
    unsupported broad-shape reason metadata, and added supported/blocked broad
    fixture gauntlet evidence.
  - 33+ writes, arbitrary broad patches, fuzzy patch, binary/mode/symlink/
    submodule/copy, directory operations, overwrite, automatic recovery, and
    rollback remain unsupported.

- Batch 71: Realistic edit compatibility gauntlet
  - Status: implemented as a focused fixture harness plus design record across
    parser, normalizer, candidate classification, routing, no-write surfaces,
    non-default recovery-authority capture, and explicit restore drills.
  - It found no runtime writer gap. Route 72 later implemented the targeted
    fenced git-style broad diff extraction gap without opening a broader
    parser.

- Batch 72: Edit closeout readiness and fenced broad diff extraction
  - Status: implemented as targeted fenced git-style broad diff extraction,
    Route 72 gauntlet expansion, pure edit capability readiness model, and
    focused closeout verifier.
  - Multiple fenced blocks, incomplete fences, non-patch fences, prose with
    multiple patch candidates, 33+ writes, arbitrary broad patches, fuzzy
    patch, binary/mode/symlink/submodule/copy, automatic recovery, and rollback
    remain unsupported.

- Batch 73: Edit capability closeout map and seal
  - Status: implemented as closeout-candidate seal with design document,
    manifest, readiness alignment, strengthened closeout verifier, and
    parity/non-parity evidence.
  - Current bounded edit capability can be treated as sealed for planning.
    Restore product polish remains optional; broad arbitrary `apply_patch`
    remains outside closeout.

- Batch 74: Context engineering baseline and continuity map
  - Status: implemented as a context-engineering baseline with
    `docs/design/context-engineering-continuity-baseline.md`,
    `core/context/contextLayerModel.ts`,
    `core/context/contextContinuityManifest.ts`, and
    `core/context/contextStateProjection.ts`.
  - Route 73 edit closeout, mutation evidence, recovery/restore references,
    memory candidates, sidebar facts, and startup warm candidates now have a
    compact-safe projection surface.
  - No memory system, sidebar UI, startup cache, provider/MCP behavior,
    SessionManager schema, compact rewrite, edit runtime behavior, automatic
    recovery, or atomic rollback was added.

- Batch 75: Compact v2 route continuity
  - Status: implemented as a structured compact continuity packet,
    deterministic redaction policy, route handoff builder, compact-safe
    markdown renderer, and focused survivability tests.
  - Edit closeout, mutation evidence, recovery references, validation status,
    constraints, forbidden scope, stop conditions, and next action now survive
    compact as structured facts without raw content or secrets.
  - Live compact/session runtime integration remains deferred; no memory system,
    sidebar UI, startup cache, SessionManager schema change, provider/MCP
    change, edit runtime change, automatic recovery, or atomic rollback was
    added.

- Batch 76: Compact v2 session integration
  - Status: implemented as `/compact` and `/handoff`, compact command contract,
    pure command runner, session-facing formatter, JSON packet mode, and
    focused command/surface tests.
  - The command remains preview-only and does not compact runtime history,
    persist memory, call a provider/model, execute restore, or change edit
    behavior.

- Batch 77: Compact live checkpoint and future-turn adapter
  - Status: implemented as an in-memory latest checkpoint model, checkpoint
    surface, future-turn candidate adapter, and `/compact` checkpoint update
    path.
  - Route 78 now consumes the adapter output once from the next normal runtime
    prompt when the checkpoint is pending.
  - Do not change SessionManager persistence schema, package scripts, default
    gates, provider/MCP behavior, edit runtime behavior, memory storage,
    sidebar UI, startup cache, automatic recovery, or atomic rollback.

- Batch 79: Compact v2 quality/merge hardening
  - Status: implemented as repeated-compact merge policy, stale checkpoint
    blocking, continuity quality checks, and injected-context budget/dedupe.
  - Preserves no persistence, no provider/MCP behavior changes, no
    SessionManager schema changes, no memory storage, no automatic recovery,
    and no atomic rollback.

- Batch 80: Project memory candidate extraction
  - Status: implemented as pure candidate model, extractor, quality checks, and
    session-facing preview summary.
  - Candidate extraction is non-persistent. It does not write memory, load
    cross-session memory, add startup cache, add sidebar UI, change
    SessionManager schema, change provider/MCP/package/default gates, change
    edit runtime, add automatic recovery, or add atomic rollback.

- Batch 81: Memory candidate review / approval UX
  - Status: implemented as in-memory review state, `/memory` command contract,
    command runner, review surface, and slash command registration.
  - Approve/reject decisions are session-scoped only. They do not write
    persistent memory, delete persistent memory, load cross-session memory, add
    retrieval/wake-up/recall, add startup cache, add sidebar UI, change
    SessionManager schema, change provider/MCP/package/default gates, change
    edit runtime, add automatic recovery, or add atomic rollback.
  - Recommended next phase: Route 82 project memory store prototype only after
    review/approval UX remains stable; otherwise polish `/memory`.

- Batch 82-84: Explicit project memory store, retrieval, and lifecycle
  - Status: implemented as non-default local JSONL save, deterministic
    recall/search/wake-up preview, and explicit invalidate/delete commands.
  - These routes do not add automatic memory injection, cross-session
    auto-loading, startup cache, sidebar UI, provider/model calls,
    provider/MCP/package/default gate changes, SessionManager schema changes,
    edit runtime changes, automatic recovery, or atomic rollback.
  - Recommended next phase: Route 85 opt-in future-turn memory injection only
    after lifecycle filtering remains stable; otherwise memory store lifecycle
    hardening.

- Batch 85: Explicit project memory future-turn injection
  - Status: implemented as in-memory session-scoped injection state,
    future-turn adapter, injected context formatter, injection planner,
    `/memory use` command contract/runner/surface, and a narrow
    `ShellSessionRuntime` next-normal-turn hook.
  - `/memory wake` and `/memory recall <query>` remain preview-only. Only
    `/memory use` or `/memory use <query>` stages one next-turn injection.
  - This route does not add automatic memory injection, startup auto-load,
    cross-session auto-loading, startup cache, sidebar UI, provider/model
    calls, vector DB, ChromaDB, embeddings, provider/MCP/package/default gate
    changes, SessionManager schema changes, edit runtime changes, automatic
    recovery, or atomic rollback.
  - Recommended next phase: Route 86 memory injection quality/merge hardening.

- Future broad arbitrary `apply_patch` readiness map
  - Consider only if larger write surfaces and recovery/rollback stance are
    settled.
  - Broad arbitrary `apply_patch` remains delayed because it combines parsing,
    ordering, destructive semantics, permission, workspace authority,
    verification, partial failure, recovery, and user-facing claims into a much
    wider blast radius than current bounded candidates.

## 10. Validation Strategy

Use the fastest validation that matches the touched layer.

For docs-only roadmap updates:

- `rtk git status --short --branch`
- `rtk git diff --check`

For development batches:

- run minimal focused validation between tasks
- run focused tests for touched patch/result/session modules
- run `rtk npm run verify:edit-capability-closeout` when parser/candidate/
  gauntlet/readiness closeout evidence changes
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
- 33+ mixed operation writes
- 33+ writes
- broad multi-delete or multi-move writes beyond the bounded small-N cap
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
- Route 65 bounded small-N write policy was implemented with cap 8; Route 69
  lifted the current cap to 32 for update-only, mixed, delete-only, and
  move-only batches.
- Route 66 explicit restore UX is implemented through a restore command
  contract, command runner, local `/restore` command, and session/user recovery
  summary. Preview is default and execute requires explicit intent.
- Route 67 bounded broad `apply_patch` candidate support is implemented for
  parser-supported bounded operation payloads that normalize to existing guarded
  route families.
- Route 68 bounded broad patch parser/normalizer support is implemented for a
  safe git-style update/add/delete/pure-rename subset that normalizes into
  existing guarded route families.
- Route 69 expanded that bounded surface to cap 32 and added larger
  safe-subset, multi-hunk, and metadata-blocker evidence.
- Route 70 safe rename-with-content-edit decomposition is implemented for 100
  percent similarity git-style rename sections with exact hunks.
- Route 71 realistic edit compatibility gauntlet is implemented as evidence
  across parser, bounded candidate classification, routing, no-write surfaces,
  non-default recovery-authority capture, and explicit restore drills.
- Route 82 context-memory work adds a non-default explicit local project memory
  store prototype for session-approved safe candidates. It is outside the edit
  runtime and does not change edit capability, rollback, recovery execution, or
  default mutation readiness.
- Route 83 context-memory work adds deterministic recall/search and wake-up
  preview over the explicit local store. It remains outside edit runtime and
  does not change edit capability, rollback, recovery execution, or default
  mutation readiness.
- Route 84 context-memory work adds explicit invalidation/delete lifecycle UX
  for the same local store. It remains outside edit runtime and does not change
  edit capability, rollback, recovery execution, or default mutation readiness.
- Route 85 context-memory work adds explicit one-shot future-turn injection via
  `/memory use`. It remains outside edit runtime and does not change edit
  capability, rollback, recovery execution, or default mutation readiness.
- Route 86 context-memory work adds quality/merge hardening for that explicit
  injection path: stale lifecycle filtering, record-id dedupe, conservative
  conflict detection, injected-context budget, and quality checks. It remains
  outside edit runtime and does not change edit capability, rollback, recovery
  execution, or default mutation readiness.
- Route 87 context-memory work adds an explicit project-scoped startup warm
  context cache prototype for safe edit/compact/memory/validation/route
  summaries. It remains outside edit runtime, does not auto-load into model
  context or future turns, and does not change edit capability, rollback,
  recovery execution, or default mutation readiness.
- Route 88 context/surface work adds a read-only sidebar state model,
  projection, compact renderer, and `/sidebar` preview for supplied
  edit/compact/memory/warmup/validation/tool facts. It remains outside edit
  runtime, adds no actual sidebar UI, does not discover MCP/skills dynamically,
  and does not change edit capability, rollback, recovery execution, or default
  mutation readiness.
- Route 89 context/surface work adds a read-only sidebar event model,
  explicit-input event bridge, recent activity projection, and sidebar quality
  checks. It remains outside edit runtime, adds no actual sidebar UI, does not
  capture live runtime events by default, does not discover MCP/skills
  dynamically, and does not change edit capability, rollback, recovery
  execution, or default mutation readiness.
- Route 90 context/surface work adds session-scoped in-memory live sidebar
  event capture for `/compact`, `/memory`, and `/warmup` local command results
  and makes `/sidebar` read bounded live activity. It remains outside edit
  runtime, adds no actual sidebar UI, persistence, dynamic discovery,
  provider/model calls, SessionManager schema change, automatic recovery, or
  default mutation readiness.
- Route 91 context/surface work adds an explicit terminal sidebar panel
  prototype with a panel model, layout builder, renderer, command contract, and
  `/sidebar panel|compact|detail` modes while preserving the existing
  `/sidebar` preview. It remains outside edit runtime, adds no always-on UI,
  persistence, dynamic discovery, provider/model calls, SessionManager schema
  change, automatic recovery, or default mutation readiness.
- Route 92 context/surface work adds `/sidebar watch` as a bounded live-frame
  experiment over the existing sanitized sidebar snapshot and session-scoped
  in-memory live event store. It remains outside edit runtime, adds no
  always-on UI, terminal repaint loop, persistence, dynamic discovery,
  provider/model calls, SessionManager schema change, automatic recovery, or
  default mutation readiness.
- Route 93 browser/tooling work adds a preview-only browser capability model,
  action contract, readiness classifier, preview renderer, `/browser` command,
  and sidebar browser tooling placeholder. It remains outside edit runtime,
  adds no browser execution, Playwright launch, MCP launch/discovery, website
  navigation, provider/model calls, browser session persistence,
  SessionManager schema change, automatic recovery, or default mutation
  readiness.
- Route 94 browser/tooling work adds a browser runtime decision model,
  sandbox policy, non-executing dry-run plan/harness/surface, and `/browser
  dry-run ...` command mode. It remains outside edit runtime, adds no browser
  execution, Playwright launch, MCP launch/discovery, website navigation,
  network access, provider/model calls, browser session persistence,
  SessionManager schema change, automatic recovery, or default mutation
  readiness.
- Route 95 harness work adds a deterministic Agent Scenario Harness foundation
  for local compact, memory, sidebar, browser dry-run, and warmup scenarios. It
  remains outside edit runtime, adds no provider/model calls, browser
  execution, CLI lifecycle rewrite, SessionManager schema change, harness
  persistence, automatic recovery, rollback, or default mutation readiness.
- Route 96 browser/tooling work adds a non-default browser execution contract,
  policy, executor interface, fake/test executor, Playwright CLI plan-only
  adapter seam, `/browser execute ...` runner, sidebar activity, and scenario
  harness coverage. It remains outside edit runtime, adds no default browser
  execution, real Playwright launch, MCP launch/discovery, provider/model
  calls, browser session persistence, SessionManager schema change, automatic
  recovery, rollback, or default mutation readiness.
- Route 97 browser/tooling work adds browser sandbox authority, network
  allowlist, confirmation records, runtime preflight, evidence policy, sandbox
  surface, and scenario harness coverage ahead of executor invocation. It
  remains outside edit runtime, adds no real browser launch, network access,
  MCP launch/discovery, provider/model calls, browser session persistence,
  SessionManager schema change, automatic recovery, rollback, or default
  mutation readiness.
- Route 98 harness work adds a real CLI scenario harness for command-only
  process-spawn evidence over browser dry-run, blocked browser execute,
  sidebar panel, and warmup status. It remains outside edit runtime, adds no
  provider/model calls, real browser launch, network access, MCP
  launch/discovery, CLI lifecycle rewrite, SessionManager schema change,
  automatic recovery, rollback, or default mutation readiness.
- Route 99 browser/tooling work adds a non-default local-fixture browser
  execution path for injected read-only observe/extract scenarios, with local
  execution authority, fixture model, evidence redaction, lifecycle surface,
  sidebar/scenario coverage, and CLI blocked-path coverage. It remains outside
  edit runtime, adds no default browser execution, external-network browsing,
  MCP launch/discovery, provider/model calls, persistent browser session, CLI
  lifecycle rewrite, SessionManager schema change, automatic recovery,
  rollback, or default mutation readiness.
- Route 100 browser/tooling work adds an explicit test-local manifest bridge
  so the real CLI scenario harness can inject the local-fixture executor for
  observe/extract success and external URL blocking evidence. It remains
  outside edit runtime, adds no default browser execution, real Playwright
  launch, MCP launch/discovery, network access, provider/model calls,
  persistent browser session, CLI lifecycle rewrite, SessionManager schema
  change, automatic recovery, rollback, or default mutation readiness.
- Route 101 browser/tooling work adds `playwright-local` manifest support,
  Playwright availability/lifecycle/evidence models, a local-fixture-only
  Playwright executor, and real CLI unavailable/external-blocked/report
  scenarios. It remains outside edit runtime, adds no package dependency,
  default browser execution, external network, MCP launch/discovery,
  provider/model calls, persistent browser session, CLI lifecycle rewrite,
  SessionManager schema change, automatic recovery, rollback, or default
  mutation readiness.
- Route 102 browser/tooling work chooses `external-runner-only` as the
  Playwright runtime dependency policy, adds external runner policy and
  runtime availability status surfaces, and reports the decision through
  `/browser status`, `/browser execute`, CLI bridge summaries, sidebar
  summaries, and scenario reports. It remains outside edit runtime, adds no
  package dependency, browser binary install, default browser execution,
  external network, MCP launch/discovery, provider/model calls, persistent
  browser session, CLI lifecycle rewrite, SessionManager schema change,
  automatic recovery, rollback, or default mutation readiness.
- Route 103 browser/tooling work adds an explicit manifest-scoped external
  runner protocol, manifest validator, skill-managed policy boundary, process
  adapter, executor, surface, CLI bridge integration, sidebar/report
  summaries, and real CLI scenarios for success, malformed response, timeout,
  unsafe output, and external URL blocking. It remains outside edit runtime,
  adds no package dependency, default browser execution, external network, MCP
  launch/discovery, provider/model calls, persistent browser session, CLI
  lifecycle rewrite, SessionManager schema change, automatic recovery,
  rollback, or default mutation readiness.
- Route 104 browser/tooling work adds stable browser execution receipts,
  evidence bundles, safety classification, replay-readiness metadata, receipt
  surfaces, sidebar/report summaries, harness receipt assertions, and real CLI
  scenarios for success, external URL blocking, malformed response, timeout,
  and unsafe output. It remains evidence-only and outside edit runtime, with no
  replay execution, action cache persistence, package dependency, default
  browser execution, external network, MCP launch/discovery, provider/model
  calls, persistent browser session, CLI lifecycle rewrite, SessionManager
  schema change, automatic recovery, rollback, or default mutation readiness.
- Route 105 browser/tooling work adds explicit skill-managed runner metadata,
  capability, manifest, readiness, status/execute surfaces, receipt/replay
  integration, sidebar/report summaries, and real CLI scenarios for missing,
  valid, future-execution-required, and unsafe metadata. It remains
  metadata-only and outside edit runtime, with no skill execution, dynamic
  discovery, MCP launch, Playwright dependency, package/default gate change,
  external network, provider/model call, persistent browser session, CLI
  lifecycle rewrite, SessionManager schema change, automatic recovery,
  rollback, or default mutation readiness.
- Route 106 browser/tooling work adds explicit skill-managed local/test runner
  execution behind matching metadata and binding, with safe protocol,
  execution bridge, executor, receipt/replay integration, sidebar/report
  summaries, and real CLI scenarios. It remains outside edit runtime, with no
  dynamic discovery, MCP launch, Playwright dependency, package/default gate
  change, external network, provider/model call, persistent browser session,
  CLI lifecycle rewrite, SessionManager schema change, automatic recovery,
  rollback, or default mutation readiness.
- Route 107 browser/tooling work adds receipt-backed in-memory browser action
  cache entries and explicit local/test replay behind current runner, sandbox,
  allowlist, and confirmation revalidation. It remains outside edit runtime,
  with no automatic replay, cache persistence, external network, dynamic
  discovery, MCP launch, Playwright dependency, package/default gate change,
  provider/model call, persistent browser session, CLI lifecycle rewrite,
  SessionManager schema change, automatic recovery, rollback, or default
  mutation readiness.

Forbidden after this document:

- broad `apply_patch` readiness
- arbitrary unified diff / broad patch write readiness
- arbitrary mutation readiness
- 33+ mixed operation write readiness
- 33+ write readiness
- broad multi-delete or multi-move readiness beyond the bounded small-N cap
- durable journal readiness
- recovery executor readiness
- rollback/atomicity readiness
- snapshot/revert readiness
- fuzzy edit readiness
- full ClaudeCode/opencode/gemini-cli parity
- default real-provider mutation readiness

Route 108 adds explicit sanitized persistent browser receipt/action cache
support for cross-process local/test replay. Route 109 hardens that explicit
cache with lock/lease handling, atomic writes, recovery, integrity scanning,
repair, retention, compaction, and safe status/report summaries. Route 110
adds bounded real CLI multi-process stress evidence for concurrent execute
writes, status/replay during lock contention, busy compact, stale lock repair,
corrupt/unsafe repair, and post-stress integrity. Route 111 adds preview-only
browser replay repair readiness and self-healing preview for blocked replay
failures; it adds no auto-repair, no auto-replay, and no external network.
Route 112 adds proposal-only browser action self-healing metadata for blocked
replay failures, including proposal kind, confidence, patch reference, report,
sidebar, and scenario coverage. It adds no repair apply, no automatic replay,
and no browser execution change. Route 113 adds explicit metadata-safe
self-healing apply for sanitized cache repair and command-context confirmation,
plus blocked-safe plans for manifest/runner/unsafe/external cases. It adds no
automatic repair/replay and no browser execution changes. Route 114 adds an
explicit local/test manifest patch writer for metadata-safe self-healing
repairs covering runner binding, skill metadata, local-fixture allowlist, and
fixture summary refresh. It adds no automatic repair/replay and no browser
execution changes. Route 115 adds real CLI cross-process harness evidence for
explicit self-healing manifest repair while preserving no automatic
repair/replay and no browser execution changes. Route 116 adds an
external-network execution opt-in bridge, disabled by default, with no external
network execution, browser launch, MCP launch, or provider/model call.
Route 117 adds an external-network runner handoff protocol and simulated
execution harness only; real external network execution still does not happen.
Route 118 adds a controlled-network external runner harness for explicit
loopback test servers only; public external network remains blocked.
Route 119 adds a browser network egress guard and report-safe audit layer for
controlled-network execution, including redirect escape, credential URL, public
origin, private non-harness origin, sensitive action, and output budget blocks.
Route 120 adds explicit public read-only web execution opt-in, limited to
HTTPS `GET`/`HEAD` with manifest, allowlist, confirmation, egress guard, and
safe evidence only; no browser, JavaScript, auth, cookies, or write actions.
Route 121 adds an opt-in public read-only smoke harness and UX/report polish;
default validation still does not access public internet. Recommended Route
122: public read-only smoke operator docs/manual run recipe, or read-only
extraction quality/ranking.
Route 122 adds content-type aware public read-only extraction quality, ranking,
and report/sidebar summaries as post-processing only; it adds no crawling,
browser launch, JavaScript, auth/cookies, provider/model calls, or write
authority. Recommended Route 123: source citation and quote budget discipline,
or extraction CLI UX polish. Do not treat
Route 82, Route 83, Route 84, Route 85, Route 86, Route 87, Route 88, Route 89,
Route 90, Route 91, Route 92, Route 93, Route 94, Route 95, Route 96, Route 97,
Route 98, Route 99, Route 100, Route 101, Route 102, Route 103, Route 104,
Route 105, Route 106, Route 107, Route 108, Route 109, Route 110, Route 111,
Route 112, Route 113, Route 114, Route 115, Route 116, Route 117, Route 118,
Route 119, Route 120, Route 121, or Route 122 as edit-capability
expansions.
