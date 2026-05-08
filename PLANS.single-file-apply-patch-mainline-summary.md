# Single-file apply_patch mainline summary

Status: summarized after the explicit workspace write entrypoint and symlink
workspace-boundary fix landed on `main`, then updated for the explicit
selected-workspace write failure durability stage.

This document summarizes only the single-file `apply_patch` mainline. It does
not reopen the default production route and does not claim support for
multi-file, add, delete, move, AST, fuzzy patching, rollback, or release/default
gates.

## Current boundary

- Default production `apply_patch` and unified diff payloads are still rejected
  by the existing mutation lane.
- The supported shape for this mainline is exactly one `*** Update File`
  operation.
- The no-write runtime entrypoint requires explicit `--apply-patch-runtime-route`.
- The selected-workspace writer requires explicit `--apply-patch-workspace-write`
  and explicit approved-for-write input through `--non-interactive-approval
  allow-once|allow-always`.
- Isolated workspace write gates and selected-workspace write gates are not
  default write enablement.
- Real-provider gates remain explicit opt-in only and must run with isolated
  HOME, USERPROFILE, PRIVATE_AGENTS_TEST_ROOT, redaction checks, and repository
  cleanliness checks.

## Completed and sealed routes

### Contract and safe-surface chain

Sealed:

- dry-run production-like preview contract
- stale-read revalidation contract
- digest-only base evidence chain
- permission metadata binding contract
- terminal-safe result surface contract
- runtime bridge contract
- resultMapper consumer and safe seam contracts
- sessionRuntime display and safe seam contracts
- production write gate precondition contracts

Evidence:

- `patchResult` contract helpers preserve `willWrite=false`,
  `changedFiles=[]`, `writeIntents=[]`, `noWriterInvoked=true`, and no applied
  patch record for preview, pending, denied, and blocked states.
- `patchMutationLane.ts` still rejects apply_patch-shaped and unified diff
  payloads in the default replace lane.

Boundary:

- These contracts do not call a writer.
- These contracts do not modify production `resultMapper.ts` or
  `sessionRuntime.ts` directly.

### Synthetic and real-provider no-write gates

Sealed:

- synthetic opt-in dry-run integration
- synthetic permission UX integration
- synthetic runtime no-write integration
- real-provider non-mutating dry-run smoke
- real-provider permission UX no-write smoke
- real-provider runtime no-write smoke

Evidence:

- no-write gates keep terminal classification stopped/non-success-like
- `changedFiles=[]`, `writeIntents=[]`, no writer invocation, no applied patch
  record, and no write success claim are required
- real-provider runs are explicit opt-in, redacted, isolated, and repo-clean

Boundary:

- Provider preview and permission UX evidence does not authorize a write.
- `allow-once` or `allow-always` in the no-write runtime route records requested
  approval only; it does not write.

### Isolated write and guarded production route gates

Sealed:

- synthetic isolated fixture write lane
- real-provider isolated fixture write gate
- guarded production-write candidate smoke
- guarded production route seam
- resultMapper/session display runtime projection for the guarded isolated route

Evidence:

- writes are limited to temporary isolated fixtures or isolated workspaces
- `productionWriterTarget=isolated-workspace`
- `realRepositoryWrite=false`
- success is projected only after verified isolated write
- blocked routes keep `changedFiles=[]`, `writeIntents=[]`, no success claim,
  and no applied patch record

Boundary:

- These gates do not enable default production write.
- These gates do not prove selected real user workspace write readiness by
  themselves.

## Implemented routes with follow-up attention

### Explicit CLI / runMvp no-write runtime entrypoint

Implemented:

- CLI flag `--apply-patch-runtime-route`
- `runMvpIntegratedFlow` short-circuit into `buildNoWriteRuntimeRoute`
- safe mapping through `runtimeRouteResult`

Evidence:

- no explicit flag means the normal CLI / runMvp path remains unchanged
- no-write route output stays stopped and reports no changed files or write
  intents
- default apply_patch / unified diff rejection regression is preserved

Follow-up attention:

- This route is useful as a preview/permission surface, not as write readiness.
- It should remain no-write unless a separate review changes the selected
  workspace policy.

### Explicit selected-workspace write entrypoint

Implemented:

- CLI flag `--apply-patch-workspace-write`
- minimal `runMvpIntegratedFlow` wiring to `runWorkspaceWriteRoute`
- `workspaceWriteRoute` composes dry-run, permission UX, write decision,
  guarded gate, final stale-read, writer call, and post-write verification
- `workspaceAuthority` enforces lexical workspace boundary, symlink rejection,
  realpath workspace boundary, descriptor-verified reads, and
  descriptor-verified writes

Evidence:

- no `--apply-patch-workspace-write` means the writer is unreachable
- `--apply-patch-runtime-route` without workspace-write remains no-write
- denied, blocked, stale, no-op, unsupported, and workspace-boundary routes do
  not report changed files or success
- symlink targets inside the workspace that resolve outside the workspace are
  blocked before dry-run read and before writer invocation
- symlink swaps at the writer boundary are blocked before content is written
- selected-workspace write success is reported only after post-write content
  verification
- abort before the selected-workspace writer is reachable stops with
  `writeEffect=none`, empty `changedFiles`, empty `writeIntents`, and no success
  claim
- writer-started failures are now durable stopped states:
  `writeEffect=unknown` when the writer failed before final verification, and
  `writeEffect=unverified` when post-write verification did not match approved
  content
- writer-started stopped states require user inspection and re-reading the
  current target before retry; they do not report write success

Follow-up attention:

- This is explicit selected-workspace write enablement, not default
  `apply_patch` enablement.
- A broader cross-platform TOCTOU review remains possible; the current
  selected-workspace authority now uses descriptor verification for the opened
  target, but this is still not a full edit-system transaction or rollback
  model.
- Workspace write failures now carry more precise stopped attribution for
  workspace-boundary, write-application, and post-write verification blockers.
- Durable stopped-session replay/resume across process restarts and broader
  user workspace safety policy still need a separate review before any default
  route is considered.

## Deferred or not started

- default production `apply_patch` enablement
- default CLI / runMvp writer route without explicit workspace-write opt-in
- multi-file `apply_patch`
- add, delete, move, rename, chmod, or file creation support
- AST patching, fuzzy patching, rollback, or full edit-system replacement
- release/default gate inclusion for the apply_patch writer
- durable stopped-session auto-recovery for partially approved write flows
- full atomic writer / rollback hardening
- broad Windows filesystem edge-case hardening, including EBUSY handling

## Cleared blockers

- Preview changed files leaking as terminal `changedFiles`.
- Permission pending or denied being displayable as write success.
- Requested approval being treated as write authorization in no-write routes.
- Final stale-read missing from isolated and selected-workspace write paths.
- Guarded isolated route success appearing before verified write.
- ResultMapper/session display consuming unsafe raw metadata for the guarded
  isolated route projection.
- Real-provider dry-run, permission UX, runtime no-write, isolated write,
  guarded route, and selected-workspace write gate evidence missing.
- Symlink target escape from selected workspace writer.
- Symlink swap at the selected workspace writer boundary.
- Coarse workspace write failure attribution for workspace-boundary,
  write-application, and post-write verification blockers.
- Abort-before-writer ambiguity for selected-workspace writes.
- Success-like surface leakage for writer-started failures whose final state is
  unknown or unverified.

## Remaining blockers and risks

- Default production write remains blocked by policy and by lack of a separate
  default-route review.
- Selected-workspace write is explicit opt-in only; it should not be treated as
  release/default readiness.
- Broader cross-platform TOCTOU / atomic-write hardening is still a follow-up
  risk, not a default-route blocker by itself.
- Durable state now distinguishes no-write aborts from writer-started
  unknown/unverified failures inside the route result. Cross-process
  stopped-session resume semantics and automatic recovery still need a separate
  review.
- Real-provider gates prove specific isolated or explicitly selected routes only;
  they do not prove multi-file, default write, long-task continuity, or full
  production mutation maturity.
- Some older plan summaries may still use pre-merge phrasing such as "being
  validated"; current code on `main` shows the explicit workspace write
  entrypoint and writer-started failure durability have landed.

## Real-provider gate state

Passed explicit opt-in gates:

- non-mutating dry-run smoke
- permission UX no-write smoke
- runtime no-write smoke
- isolated fixture write smoke
- guarded production-write candidate smoke against isolated workspace
- guarded production route smoke against isolated workspace
- selected-workspace write smoke against isolated test workspace

Future behavior branches that change writer-reachable route semantics should
rerun the selected-workspace write smoke before claiming the route remains
real-provider safe, because the writer reachable path and result surface are
provider-facing.

Required policy for any rerun:

- explicit `PRIVATE_AGENTS_REAL_HOME`
- isolated HOME and USERPROFILE
- isolated `PRIVATE_AGENTS_TEST_ROOT`
- no manual read, print, copy, clean, or modification of real provider config
- redaction check
- repository clean before and after
- audit/history residue cleanup before commit

No real-provider gate is required for documentation-only updates. A code branch
that changes writer-reachable route semantics should rerun the selected
workspace write smoke before being sealed.

## Recommended next stage

1. Return focus to the default user main path unless a concrete apply_patch
   regression appears. The apply_patch mainline now has explicit no-write and
   explicit selected-workspace write entrypoints.
2. If continuing apply_patch work, review cross-process stopped-session
   persistence and user retry UX for writer-started unknown/unverified states
   before considering default route changes.
3. Keep rollback, atomic multi-step transactions, multi-file support, AST, and
   fuzzy patching deferred unless a separate main-path blocker justifies them.
