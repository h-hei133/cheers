# Recovery Plan Projection

Route baseline: Route 57
Date: 2026-05-14
Status: implemented projection-only recovery-readiness diagnostics.

This note records the Route 57 recovery-readiness batch. It is operational
evidence, not a recovery design claim.

## Current Baseline

Post-Route 56 write capability remains narrow: selected-workspace single-file
update/create/move/delete, exactly-two update, exactly-three update, and
exactly-two mixed write lanes. Broad arbitrary `apply_patch`, 3+ mixed writes,
4+ writes, multi-delete, multi-move, durable journal storage, recovery
execution, rollback, snapshot/revert, stale-read recovery, and partial failure
recovery remain unsupported.

Route 57 adds diagnostics only. It does not recover, rollback, snapshot,
persist, infer original file contents, change writer order, or change
`changedFiles`, `failedFiles`, or `plannedFiles` semantics.

## External Reference Check

Bounded scan count:

- ClaudeCode: 3 files inspected.
- opencode: 3 files inspected.
- gemini-cli: 3 files inspected.
- Total external files inspected: 9.

Files inspected:

- `/home/wang/projects/source-claudecode/utils/fileHistory.ts`
- `/home/wang/projects/source-claudecode/QueryEngine.ts`
- `/home/wang/projects/source-claudecode/commands/rewind/index.ts`
- `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`
- `/home/wang/projects/opencode/packages/opencode/src/session/revert.ts`
- `/home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/utils/checkpointUtils.ts`
- `/home/wang/projects/gemini-cli/packages/cli/src/ui/commands/restoreCommand.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/tools/edit.ts`

Directional implications:

- ClaudeCode records file-history backups/snapshots before file restore is
  user-visible; rewind is a command surface over that checkpoint authority, not
  a diff/result metadata claim.
- opencode separates broad `apply_patch` per-file result metadata from
  `SessionRevert`, which depends on the `Snapshot` service for restore/revert
  authority.
- gemini-cli creates checkpoint files tied to shadow-git commit hashes before
  `/restore` can execute; edit-tool fuzzy correction and diffs are separate
  from restore authority.

The useful local pattern is separation of diagnostics from execution:
projection may say what would need recovery, but only durable checkpoint,
snapshot, file-history, or original-content authority can justify actual
recovery/rollback claims.

## Local Terminology

- plan-only recovery projection: a result diagnostic that names candidates,
  unrecovered files, application-state classification, blockers, and evidence
  while `recoveryExecuted` remains `false`.
- recovery candidate: a file identified by journal facts as relevant to a
  possible future recovery decision.
- unrecovered file: a file recorded by journal facts as still unrecovered; this
  does not imply a recovery attempt occurred.
- failed-before-apply: a file-level failure classified from existing facts as
  stopping before an apply was recorded.
- applied-but-unverified: a writer/post-write path where existing facts indicate
  application may have happened but verification did not pass.
- applied-and-verified-before-later-failure: a verified changed prefix file
  before a later operation failed.
- missing durable snapshot: blocker fact that no checkpoint/snapshot/file
  history exists for restore authority.
- missing original content authority: blocker fact that original content is not
  durably available to this projection.
- missing recovery executor: blocker fact that no code path performs recovery.
- missing atomicity authority: blocker fact that no rollback/atomic commit
  authority exists.
- metadata-only journal: blocker fact that route-scoped journal facts are
  result metadata only.

## Code Touchpoints

- `packages/ts-shell/src/orchestration/patchResult/journalFailureStateProjection.ts`
  classifies journal facts into failed-before-apply,
  applied-but-unverified, applied-and-verified-before-later-failure, and
  unknown application state.
- `packages/ts-shell/src/orchestration/patchResult/journalRecoveryPlanProjection.ts`
  builds the plan-only recovery projection from journal facts, boundary facts,
  blocker facts, and failure-state classification.
- `packages/ts-shell/src/orchestration/patchResult/journalMetadataBoundary.ts`
  owns shared blocker facts and preserves metadata-only / no-recovery /
  no-rollback claims.
- `packages/ts-shell/src/orchestration/patchResult/journalResultProjection.ts`
  attaches the plan to existing `routeScopedEditJournal` failure surfaces.

## Public Result Shape

The recovery plan is exposed as:

```text
perFilePatchPlan.routeScopedEditJournal.recoveryPlan
```

This keeps the plan inside the journal-enabled diagnostic surface instead of
adding a top-level `CodingResultSummary` field. Existing result fields are
preserved: `changedFiles`, `failedFiles`, `plannedFiles`, writer flags,
`postWriteVerification`, success/stopped/error semantics, and no-write support
classification are unchanged.

The plan shape is intentionally non-executing:

- `mode: "plan-only"`
- `authority: "metadata-only"`
- `recoveryExecuted: false`
- `rollbackAtomicityClaim: false`
- `blockers` includes `metadata-only-journal`, `no-durable-snapshot`,
  `no-original-content`, `no-recovery-executor`,
  `no-atomicity-authority`, and `no-persistence-authority`

## Test Strategy

Focused tests cover:

- failure-state classification helper.
- recovery-plan helper.
- journal boundary blocker facts.
- journal result projection attachment.
- mixed partial failure.
- multi-file writer failure and post-write verification failure.
- single-file stale-read and post-write verification failure.
- structural move post-write verification failure.

The tests assert no recovery execution, no rollback claim, metadata-only
authority, blocker facts, candidate/unrecovered file facts, failure-state
classification, and preservation of existing changed/failed/planned fields,
writer flags, post-write verification, and stopped/success semantics.

## Known Gaps

- No durable journal storage.
- No snapshot/checkpoint/file-history backend.
- No original-content authority.
- No recovery executor.
- No rollback executor.
- No stale-read recovery.
- No partial failure recovery.
- No broad `apply_patch`, 3+ mixed, 4+ write, multi-delete, or multi-move
  readiness.

## Next Decision

Recommended next route: Batch 58 durable authority design/prototype decision.

Route 57 confirms that recovery diagnostics are useful but blocked by absent
durable authority. The next decision should choose whether the project wants a
durable snapshot/checkpoint/file-history/original-content authority prototype,
or whether larger mixed-write readiness should remain blocked until that
authority stance is settled.
