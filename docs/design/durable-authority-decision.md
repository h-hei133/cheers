# Durable Authority Decision

Route baseline: Route 59
Date: 2026-05-15
Status: explicit non-default original-content authority store and restore
primitive implemented; no default persistence, automatic recovery, rollback, or
snapshot execution.

This document records the Batch 58 durable-authority decision. It guides the
next recovery routes, but it is not a recovery, rollback, snapshot, or broad
write readiness claim.

## Post-Route 57 Baseline

Route 57 added plan-only recovery diagnostics under
`perFilePatchPlan.routeScopedEditJournal.recoveryPlan`. The current system can
classify failed-before-apply, applied-but-unverified, and
applied-and-verified-before-later-failure states from route-scoped journal
facts. It still has no durable journal storage, no original-content authority,
no recovery executor, no rollback executor, no snapshot/revert, no stale-read
recovery, no partial failure recovery, and no broad `apply_patch` readiness.

Route 58 keeps that boundary. It models durable authority and original-content
requirements without reading files, writing files, storing content, calling git,
creating snapshots, invoking recovery, invoking rollback, or changing writer
behavior.

## Bounded Reference Comparison

Bounded scan count:

- ClaudeCode: 4 files inspected.
- opencode: 3 files inspected.
- gemini-cli: 4 files inspected.
- Total external files inspected: 11.

Files inspected:

- `/home/wang/projects/source-claudecode/utils/fileHistory.ts`
- `/home/wang/projects/source-claudecode/commands/rewind/index.ts`
- `/home/wang/projects/source-claudecode/commands/rewind/rewind.ts`
- `/home/wang/projects/source-claudecode/QueryEngine.ts`
- `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`
- `/home/wang/projects/opencode/packages/opencode/src/session/revert.ts`
- `/home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/utils/checkpointUtils.ts`
- `/home/wang/projects/gemini-cli/packages/cli/src/ui/commands/restoreCommand.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/services/gitService.ts`
- `/home/wang/projects/gemini-cli/packages/cli/src/ui/utils/rewindFileOps.ts`

Reference patterns:

- ClaudeCode backs rewind with file-history snapshots and per-file backups. It
  records file-history state around user-message boundaries and tracks edit
  backups before actual writes.
- opencode separates broad `apply_patch` diff/result metadata from
  `SessionRevert`. Revert uses `Snapshot.track()`, `Snapshot.restore()`, and
  `Snapshot.revert()` rather than trusting patch-result metadata alone.
- gemini-cli writes checkpoint metadata tied to shadow-git commit hashes before
  restore can run. Its rewind file operation inspects current content before
  direct restore and falls back to patch-style conflict handling only with
  recorded original/new content facts.

Implication: durable restore claims require captured authority outside result
metadata. The smallest local direction is an original-content authority ledger
seam, because it can be added behind a non-default storage policy later without
bringing in shadow git, repository semantics, or session-wide snapshot
lifecycle in this route.

## Durable Authority Requirements

Before this project can attempt recovery or rollback, it needs:

- durable original-content or snapshot authority captured before writes.
- current-content inspection before restore.
- workspace authority for any restore target.
- storage lifecycle, cleanup, schema, residue, and redaction policy.
- user/session-visible distinction between recovery impossible, recovery not
  attempted, and recovery attempted.
- a recovery executor boundary separate from result projection.
- rollback/atomicity authority before any rollback claim.

## Authority Options Considered

### 1. Metadata-Only Blocker

Current state. Useful for diagnostics and honest terminal/session surfaces.
Insufficient for recovery because it does not contain restorable content,
current-content inspection, persistence, or an executor.

### 2. Original-Content Ledger

Captures original content authority before writes. It can support targeted
restore later if current-content checks pass. This is the smallest plausible
local next step because it can be scoped per file and per route. It carries
residue, redaction, cleanup, schema, and storage-policy risks, so Route 58 only
adds the seam and requirement model.

### 3. Hash-Only Original-Content Ledger

Captures before/after hashes or expected hashes. Useful for safety checks and
detecting drift. Not enough to restore without actual content authority.

### 4. Snapshot/Checkpoint Authority

Captures a file or workspace snapshot before writes. Stronger restore
semantics, but much larger lifecycle and storage scope. It must define cleanup,
residue, session interaction, workspace authority, and trust boundaries.

### 5. Git/Shadow-Git Authority

Close to opencode and gemini-cli patterns. Powerful, but heavy for this
project because it must handle git and non-git workspaces, cleanup, hidden
repos, global config isolation, and failure attribution.

### 6. File-History Authority

Close to ClaudeCode. Useful per-file model, but it needs ownership over
session lifecycle, tracked-file state, backup storage, and rewind UX.

## Recommended Direction

Route 59 update: Batch 59 implemented the original-content ledger as an
explicit non-default storage prototype.

The prototype lives under `patchRecovery/recoveryAuthorityStore.ts` and
`patchRecovery/restorePrimitive.ts`. Narrow write routes can opt in by passing
an explicit `recoveryAuthority` option with `mode: "non-default"`, `ledgerRoot`,
and `authorityId`. Current default runtime paths do not pass that option and
therefore do not create recovery authority records.

Broad writes remain delayed because larger write surfaces would increase
partial-failure and destructive-write risk while the recovery authority loop is
still narrow and lacks a product/session surface.

## Route 58 Prototype Surface

Implemented seam/readiness files:

- `journalDurableAuthority.ts`: describes current durable authority as
  `authorityKind: "none"`, `availability: "absent"`,
  `persistence: "none"`, and all recovery/rollback/restore booleans false.
- `journalOriginalContentAuthority.ts`: models capture requirements, record
  shape, missing-authority diagnostics, and restore eligibility without storing
  content.
- `journalRecoveryReadinessProjection.ts`: combines recovery-plan facts,
  durable authority absence, original-content requirements, restore
  eligibility, blockers, and evidence.
- `journalRecoveryPlanProjection.ts`: exposes durable/readiness diagnostics
  inside the existing `recoveryPlan` shape.

## Still Forbidden

Route 59 still does not add:

- default durable persistence.
- automatic original content storage.
- automatic recovery.
- recovery executor.
- rollback executor.
- snapshot/checkpoint/git integration.
- provider/session/CLI/MCP behavior changes.
- broad write surfaces.

Route 59 adds only:

- explicit non-default original-content ledger storage under caller-provided
  `ledgerRoot`.
- explicit guarded per-file restore primitive for tests/future routes.
- non-default pre-write capture for single update, single delete,
  exactly-two update, and single create.
- recoveryPlan diagnostics that can show captured non-default authority without
  claiming automatic recovery or rollback.

It still does not add:

- default file reads or current-content reads outside explicit capture/restore
  paths.
- automatic file writes for recovery.
- git calls.
- snapshot/checkpoint restore UX or automatic restore.
- writer behavior changes.
- new write surfaces.

## Next-Route Decision Criteria

Choose the next route only if it can answer:

- where non-default original content is stored.
- how records are scoped to route/session/workspace.
- how cleanup and audit residue are handled.
- how secrets or sensitive file content are redacted or avoided.
- how workspace authority is checked before any future restore.
- how current-content inspection prevents hidden user-edit overwrite.
- how result projection remains separate from recovery execution.

If those answers are not ready, defer product recovery and either expand
non-default capture coverage across remaining narrow routes or run a 3+ mixed
write readiness audit under explicit no-automatic-recovery semantics.
