# Single-file apply_patch write failure durability

Status: implemented on `main` for explicit selected-workspace write failure
semantics, then extended with writer-started stopped-session continuity for
next turn and `/continue`. This route does not enable default `apply_patch`,
default unified diff handling, multi-file edits, add/delete/move, AST, fuzzy
patching, rollback, or release/default gates.

Latest implementation commits:

- `889e7f4 Add apply patch write failure durability`
- `e8602e5 Add writer-started stopped session continuity`
- `271742a Narrow writer continuity evidence`

## Goal

Make the explicit selected-workspace `apply_patch` write entrypoint truthful
when a write is aborted or when the writer has started but success cannot be
verified.

The user-visible contract is:

- abort before the writer means no workspace writer ran and no write effect is
  reported in continuity seed/display
- after the writer starts, the route must not disappear into a generic abort or
  success-like result
- writer exceptions produce a stopped `unknown` write effect and require
  inspection of the current target
- post-write verification mismatch produces a stopped `unverified` write effect
  and requires inspection of the current target
- verified success is the only path that may expose `changedFiles`,
  `writeIntents`, terminal success, and `write-success`
- next turn and `/continue` must preserve target, writer-started status,
  write effect, user-inspection requirement, and re-read next action for
  `unknown` and `unverified` stopped states

## Implemented boundary

Implementation is kept in the `patchResult` layer with one minimal
`runMvpIntegratedFlow` pass-through:

- `writeFailureState.ts` defines durable writer-started state:
  `none`, `unknown`, `unverified`, and `verified`
- `workspaceWriteRoute.ts` checks abort before the writer is reachable, ignores
  abort once the writer has started until verification produces a durable
  result, and attaches `writeFailureState` to every route result
- `workspaceWriteResult.ts` maps writer-started stopped states to failed repair
  and bounded-continuation metadata instead of success-like output; no-writer
  blocked routes do not seed writer-started/write-effect continuity fields
- `SessionManager.ts` persists and rebuilds writer-started stopped continuity
  diagnostics only when the writer actually started
- `continuityFormatter.ts` and `sessionRuntime.ts` render writer-started,
  write-effect, target, user-inspection, and re-read next-action details
  without success handoff
- `lightweightChat.ts` / `runMvpIntegratedFlow.ts` preserve the continuity
  decision trace for writer/effect seed data without changing provider-facing
  behavior

The selected-workspace writer authority stays unchanged from the descriptor
verified stage. This work does not add rollback or a broader transaction model.

## Safety invariants

- Default mutation-lane `apply_patch` and unified diff rejection remains
  required.
- `--apply-patch-runtime-route` remains no-write unless
  `--apply-patch-workspace-write` is also explicitly present.
- `--apply-patch-workspace-write` still requires explicit approved-for-write
  input.
- Single-file `*** Update File` remains the only supported patch shape.
- Final stale-read remains immediately before the writer.
- The writer is reachable only after dry-run, permission UX, write decision,
  guarded gate, workspace authority, final stale-read, and no-op checks pass.
- Blocked before-writer routes keep `changedFiles=[]`, `writeIntents=[]`, no
  writer invocation, and no success claim.
- Writer-started stopped routes keep `changedFiles=[]`, `writeIntents=[]`, no
  applied patch record, no terminal success, and require current-file
  inspection.
- Post-write verification failure is not write success.
- No-writer blocked routes do not show `writeEffect=none` in next-turn or
  `/continue` continuity.
- `/continue` has end-to-end fixture coverage for both `writeEffect=unknown`
  and `writeEffect=unverified`.

## Real-provider gate boundary

Because the original write-failure durability route changed writer-reachable
route semantics and the user-visible result surface, future behavior branches
that change this path should rerun the selected-workspace real-provider smoke
before making a real-provider safety claim.

The final stopped-session continuity narrowing did not require a real-provider
rerun because it changed session/result continuity tests only and did not modify
provider-facing route logic, provider/auth core, or smoke scripts.

Documentation-only updates do not require a real-provider rerun.

Required policy:

- set `PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real` explicitly
- use isolated `HOME`, `USERPROFILE`, and `PRIVATE_AGENTS_TEST_ROOT`
- do not manually read, print, copy, clean, or modify real provider config
- require redaction pass
- require repository clean before and after
- clean audit/history residue before committing

The smoke remains isolated selected-workspace evidence only. It must not be
described as default production write readiness.

## Deferred

- rollback or automatic repair after writer-started failure
- broader compact/auto-recovery behavior beyond next turn and `/continue`
  evidence
- atomic multi-step transaction semantics
- Windows EBUSY and broad cross-platform filesystem semantics
- default production `apply_patch` enablement
- multi-file/add/delete/move/AST/fuzzy patch support

## Validation checklist for future behavior changes

- focused route/result/session tests pass for `apply_patch` and
  `partial-mutation`
- `/continue` fixtures cover both `writeEffect=unknown` and
  `writeEffect=unverified` without changed-file or success-handoff leakage
- default mutation-lane rejection regression passes
- package build passes
- real-provider selected-workspace write smoke passes or is precisely attributed
  to provider-network/config/auth/model rather than route regression
- redaction passes
- repository and audit/history residue are clean before commit
