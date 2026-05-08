# Single-file apply_patch write failure durability

Status: implemented on `main` for explicit selected-workspace write failure
semantics. This route does not enable default `apply_patch`, default unified
diff handling, multi-file edits, add/delete/move, AST, fuzzy patching, rollback,
or release/default gates.

Latest implementation commit:

- `889e7f4 Add apply patch write failure durability`

## Goal

Make the explicit selected-workspace `apply_patch` write entrypoint truthful
when a write is aborted or when the writer has started but success cannot be
verified.

The user-visible contract is:

- abort before the writer means no workspace writer ran and no write effect is
  reported
- after the writer starts, the route must not disappear into a generic abort or
  success-like result
- writer exceptions produce a stopped `unknown` write effect and require
  inspection of the current target
- post-write verification mismatch produces a stopped `unverified` write effect
  and requires inspection of the current target
- verified success is the only path that may expose `changedFiles`,
  `writeIntents`, terminal success, and `write-success`

## Implemented boundary

Implementation is kept in the `patchResult` layer with one minimal
`runMvpIntegratedFlow` pass-through:

- `writeFailureState.ts` defines durable writer-started state:
  `none`, `unknown`, `unverified`, and `verified`
- `workspaceWriteRoute.ts` checks abort before the writer is reachable, ignores
  abort once the writer has started until verification produces a durable
  result, and attaches `writeFailureState` to every route result
- `workspaceWriteResult.ts` maps writer-started stopped states to failed repair
  and bounded-continuation metadata instead of success-like output
- `sessionRuntime.ts` updates the partial-mutation next action to instruct
  re-reading and inspecting writer-started targets before retry

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

## Real-provider gate boundary

Because this route changes writer-reachable route semantics and the
user-visible result surface, any future behavior branch that changes this path
should rerun the selected-workspace real-provider smoke before making a
real-provider safety claim.

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
- cross-process durable stopped-session resume for writer-started
  unknown/unverified states
- atomic multi-step transaction semantics
- Windows EBUSY and broad cross-platform filesystem semantics
- default production `apply_patch` enablement
- multi-file/add/delete/move/AST/fuzzy patch support

## Validation checklist for future behavior changes

- focused route/result/session tests pass for `apply_patch` and
  `partial-mutation`
- default mutation-lane rejection regression passes
- package build passes
- real-provider selected-workspace write smoke passes or is precisely attributed
  to provider-network/config/auth/model rather than route regression
- redaction passes
- repository and audit/history residue are clean before commit
