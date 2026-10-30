# The attached workspace root now reaches the file writers

The previous batch proved the grant was a dead end: `/workspace add <path> --write` stored the root, and the very next write to that path was refused with the same suggestion. This batch fixes it.

## What changed

`core/tools/registry.ts`: `write` and `edit` now ask the existing session resolver which root applies, instead of fencing on the primary root alone.

- When the session has no attached roots, the primary root is used and the refusal is still the lexical one — no filesystem access, so a nonexistent primary root keeps its old message.
- With attached roots, `resolveWorkspaceRoot` decides: registered roots only, `access: "write"` required for a write, directory identity revalidated on every use.
- The resolved root is carried into the execution service (`workspaceRoot`) and the edit operation identity, so the receipt's workspace matches the operation scope and the ledger records the write under the same root it was written to. The earlier `Edit operation receipt is invalid.` came from a mismatch between those two, not from the ledger contract.

No new jail, resolver, or grant mechanism was added; the session resolver already owned every rule.

## Validation (main agent, serial)

- `arguments.test.ts` 21 (three new: attached write succeeds and reaches the service with the attached root; a read-only attached root is refused; a replaced directory is refused by identity), `workspace` 9, `fileAccess` 3, `workspace/approval` 25, `subagentWorkspace` — 59 across the affected files.
- Two reversals (`reversal.mjs`): fencing on the primary root again, and resolving with `read` access. Both fail the intended assertion and restore exact source bytes in `finally`.
- Static gates serially: import cycles, config consumers, declarations, Node floor, strict docs drift — all passed, 118 pre-existing docs advisories retained. TS build and freshness passed.
- End-to-end probe (`../phase20-addition-workspace-grant/probe.mjs`): refusal before the grant names the command and creates nothing; `/workspace add --write` stores the root; the same write then succeeds and the file holds the exact content; replacing the directory makes the old grant refuse again.

Build `96a6043df384a05279f4b6944d2ba9c04c6f0892110ea329d30eff83361ba368`, inputs `1615471a421914223b98423c4482ffef2880b0a98e93a47bfd4b5cc7d35198f7`.

## The other file tools

The same batch extended the fix to the rest of the file tools, because they fenced on the primary root too:

- `read` resolves through the session resolver with read access: a read-only grant may be read but not written, an unregistered directory is still refused.
- `glob` and `grep` use the resolved root as the search origin and as the base for reported paths, across both the ripgrep path and the in-process fallback walk.
- `apply_patch` needed no change. It already called `selectWorkspaceRoot` and read `workspaceRoots`. The two-phase probe (`patch-probe.mjs`) confirms it end to end: refused before the grant with "Tool path is outside the registered workspace roots", and after the grant it commits the file at the attached path with the exact content.

## The undo ledger follows the session

A write through an attached root is recorded in the session's own ledger, not the attached root's. `undo-probe.mjs` writes `after` over an existing `before` through an attached root under the default profile, then reads the session's operation list: one operation is visible, and its file entry names the attached root as the target. Without that, the write would succeed and be invisible to `/undo`.

The identity therefore stays on the session's primary root while containment, the execution service, and the write itself use the resolved root. A probe mistake is kept on record: the first version called the tool inside a non-awaited `withProfile` callback, so the write never ran and the operation count read zero.

## Boundaries

Synthetic session, single write, Linux. `bash` writes remain governed by the sandbox, not this fence. Read-only attached roots still allow reads through the same resolver, unchanged. Not covered: real provider tool calls, desktop platforms, concurrent multi-root writes.

```bash
rtk node .omx/artifacts/phase20-addition-workspace-write/reversal.mjs
rtk node .omx/artifacts/phase20-addition-workspace-grant/probe.mjs
```

Focused command from the package directory:

```bash
rtk env NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=1 VITEST_MIN_THREADS=1 ./node_modules/.bin/vitest run src/core/tools/arguments.test.ts src/turn/workspace.test.ts src/turn/fileAccess.test.ts src/turn/workspace/approval.test.ts
```

## All four layers agree

`layers-probe.mjs` asks every layer that can allow or refuse a write about the same attached root, under the default profile:

| Layer | Result |
|---|---|
| `workspaceToolBinding`, write grant | resolves to the attached root |
| `workspaceToolBinding`, read-only grant | refuses with "This additional workspace root is read-only." |
| `workspaceSandboxPolicy` | the root is in `allowWrite`, and a read-only grant appears in `readOnlyRoots` |
| tool fence | the write succeeds |
| undo ledger | one operation is visible to the session |

Before this batch the first three agreed with each other and the fourth did not, which is what made the grant look broken: policy approved a write the writer then refused. They now share one answer.

## Restore works for an attached-root write

`restore-probe.mjs` writes `after` over `before` through an attached root, previews the operation, and restores it: the preview reports `canRestore: true`, the restore reports `restored-verified`, and the file holds `before` again.

A probe mistake is kept on record: the first version passed an empty access object, so `assertOperationFile` could not find the attached root among the grants and the preview reported `snapshot-or-workspace-unavailable`. That is the check doing its job — undo will not restore through a root the session does not currently hold — not a product defect.

`patch-readonly-probe.mjs` covers the other side: a patch targeting a read-only attached root is refused during preparation ("This additional workspace root is read-only.") and no file is created.

## Revoking the grant also revokes restore

`revoked-probe.mjs` writes through an attached root, removes the grant with `/workspace remove`, then tries to restore the old operation: the preview reports `canRestore: false` with `snapshot-or-workspace-unavailable`, the restore is `blocked`, and the file keeps the written bytes.

That is the intended shape. The grant is a live authority the session holds, not a permanent permission captured when the write happened, so undo cannot write back through a root the user has since detached.

## Replacing the directory also stops restore

`identity-probe.mjs` writes through an attached root, replaces the directory with a different one at the same path, then previews the old operation: `canRestore: false`, the restore is `blocked`, and the new directory stays empty. The recorded `dev:ino:birthtimeMs` identity is what makes this work — a path alone would have written the old bytes into an unrelated directory.

## The undo command surface and directory listings

`undo-command-probe.mjs` checks the command surface, not just the store: `undoHistory` returns the attached-root operation with its file entry naming that root, `operationsForTurn` finds it by the turn it belonged to, and an unrelated turn id matches nothing. A probe mistake is kept: the first run passed `taskId` but no `correlationId`, so the turn filter correctly found nothing — the filter reads the recorded correlation, not the call id.

`dirlist-probe.mjs` lists a directory under an attached root with a small page size and follows the continuation hint: the hint names the attached directory as an absolute path with its trailing separator, and the next page reads the same directory.

## Adjacent surfaces reviewed without a defect

These were checked and found correct; no code changed for them.

- **`/undo` restore-turn**: passes `undoAccess(context)`, which carries `workspaceRoots`, and `undoScope` uses `projectRoot` — the same root the ledger is written under.
- **`/restore`**: a separate surface that reads edit snapshots by explicit `--record`/`--authority-id`, refusing to guess. Its write access goes through `selectWorkspaceRoot` with `workspaceRoots`, so an attached root is usable once named.
- **Fork**: inherits `workspaceRoots` from the source session only when the project root is unchanged; a fork into another project drops them, which is correct because the grants belong to the original project.
- **Session switch**: `switchActiveSession` callers set `cwd` to the new `projectRoot`, so the runtime `cwd` used as the tools' primary root cannot go stale. Grants are read from the session, not the process, so switching sessions switches grants.

Recording a negative result matters as much as a fix: it says these paths were inspected rather than assumed.
