# The attached workspace root does not reach the file writers

The documented answer to "why is a write outside the workspace refused" is that the user can run `/workspace add <path> --write` and retry. This probe checks that claim end to end against the built product.

## What happens

1. A write to an absolute path outside the primary root is refused. The message names the grant command and the `--write` flag, and no file is created. Correct.
2. `/workspace add <outside> --write` succeeds: the root is saved with `access: "write"` and a `dev:ino:birthtimeMs` identity. Correct.
3. The same write is **still refused**, and the message again says to run `/workspace add <path> --write` — a command the user just ran.

So the advertised way through is not a way through for `write`/`edit`.

## Why

`core/tools/registry.ts` checks every write and edit with `verifyPathContainment(target, context.workspaceRoot)`: the primary root only. `context.workspaceRoots` is never read there. The session-level resolver `resolveWorkspaceRoot` in `core/workspace/roots.ts` already implements the full rule — registered roots only, `access: "write"` where write is asked for, directory identity revalidated on each use — but the file tools do not call it. The grant therefore only affects the sandbox write allowance and the paths that already use `selectWorkspaceRoot`, not these two writers.

## What was tried and reverted

Routing `write`/`edit` through `resolveWorkspaceRoot` made the containment check pass, but the write then failed with `Edit operation receipt is invalid.` The edit-recovery store derives its ledger location from the operation scope's workspace (`storageRoot(scope) = profile.root ?? scope.workspace.path`), and `assertProfileStorage` requires that location to sit inside the profile. Binding the operation identity to the attached root moves the ledger, so the receipt written by the commit cannot be read back under the same scope. Making the grant work therefore needs the snapshot ledger to stay bound to the session/profile while the write target is a different root — a contract change in the edit-recovery store, not a one-line jail change.

That change was reverted. The product is unchanged in this batch.

A second attempt bound the operation identity to the attached root as well, so the receipt's workspace matched the operation scope. Containment and the receipt decode then passed, but the write still ended with the same message. Tracing the ledger showed the store locating itself under `projects/<digest>/edit-snapshots` while the receipt had already been accepted, so the failure sits after allocation, in the persistence/readback path rather than in the fence. A probe-side mistake was also found and fixed on the way: the tool must run with the profile active, because the ledger derives its storage root from the current profile. The remaining failure was not diagnosed further; making the grant work needs a deliberate redesign of how a write whose target root differs from the session's primary root is recorded, not an incremental patch.

## What this means

The earlier decision in the feature log (that the existing grant mechanism is complete and only its discoverability was missing) is **wrong for the file writers**. The grant is complete as a stored root with identity and access mode; what is missing is that the writers consult it, and that the edit ledger can record a write whose target root is not the primary one.

This is a real, reproducible defect matching the user's report that writes outside the working directory are refused even though other projects allow them. It is not a prompt or policy-text problem.

Build `5bf1f1e9aa7b6bcbbce651406619195849c98f9a9be8add557fa4467dcb4a473`, inputs `4a1f8e04d9c1e9765729f40c7e6ae6fda84779dd82cef93a457dd7d326ca8806`.

```bash
rtk node .omx/artifacts/phase20-addition-workspace-grant/probe.mjs
```
