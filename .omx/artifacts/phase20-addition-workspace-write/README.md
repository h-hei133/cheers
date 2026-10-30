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

## Boundaries

Synthetic session, single write, Linux. `apply_patch` was not changed — it has its own multi-root plan path. `bash` writes remain governed by the sandbox, not this fence. Read-only attached roots still allow reads through the same resolver, unchanged. Not covered: real provider tool calls, desktop platforms, concurrent multi-root writes.

```bash
rtk node .omx/artifacts/phase20-addition-workspace-write/reversal.mjs
rtk node .omx/artifacts/phase20-addition-workspace-grant/probe.mjs
```

Focused command from the package directory:

```bash
rtk env NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=1 VITEST_MIN_THREADS=1 ./node_modules/.bin/vitest run src/core/tools/arguments.test.ts src/turn/workspace.test.ts src/turn/fileAccess.test.ts src/turn/workspace/approval.test.ts
```
