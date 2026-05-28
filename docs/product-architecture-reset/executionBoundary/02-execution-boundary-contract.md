# Execution Boundary Contract

The TypeScript execution boundary lives at:

```text
packages/ts-shell/src/runtime/execution/executionService.ts
```

It is intentionally small and runtime-neutral. It exposes:

- `runCommand(request)` for command execution with `operationKind`, explicit authority metadata, `cwd`, `workspaceRoot`, timeout, optional abort signal, caller/reason, and report-safe command projection.
- `readTextFile(request)` for text reads used by tool adapters, with explicit read-only authority metadata and workspace root.
- `writeTextFile(request)` for text writes used by tool adapters, with explicit approved-for-write authority metadata and workspace root.
- `listFilesRecursive(request)` for recursive file listing used by glob-style tools, with explicit read-only authority metadata and workspace root.

Command results preserve:

- execution path: `ts-local` or `rust-daemon`
- status: `completed`, `failed`, `timeout`, or `cancelled`
- exit code, stdout, stderr, and failure kind
- structured execution events for started, exited, failed, timed out, or cancelled outcomes
- Rust daemon metadata when present
- recovery reason when the daemon path could not start or respond

Current caller:

- `packages/ts-shell/src/core/tools/registry.ts` routes read/write/edit/glob/bash/git-status/git-diff through the execution service.

The service wraps existing behavior rather than changing policy:

- TS-local command execution still uses `packages/ts-shell/src/daemon/client.ts`.
- Rust daemon execution remains opt-in through existing runtime configuration.
- Workspace authority and patch routes remain the write-safety owners for apply_patch and workspace mutation flows.
- Authority metadata is descriptive for the current approved call path. It does not introduce fake permission tokens or new production write defaults.

This is not a ceremony-only interface: the core tool registry now uses it for real command and file side effects.
