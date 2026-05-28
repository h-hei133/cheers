# Execution Boundary Contract

The TypeScript execution boundary lives at:

```text
packages/ts-shell/src/runtime/execution/executionService.ts
```

It is intentionally small and runtime-neutral. It exposes:

- `runCommand(request)` for command execution with `cwd`, `workspaceRoot`, timeout, and optional abort signal.
- `readTextFile(absolutePath)` for text reads used by tool adapters.
- `writeTextFile(absolutePath, content)` for text writes used by tool adapters.
- `listFilesRecursive(absoluteRoot)` for recursive file listing used by glob-style tools.

Command results preserve:

- execution path: `ts-local` or `rust-daemon`
- status: `completed`, `failed`, `timeout`, or `cancelled`
- exit code, stdout, stderr, and failure kind
- Rust daemon metadata when present
- recovery reason when the daemon path could not start or respond

Current caller:

- `packages/ts-shell/src/core/tools/registry.ts` routes read/write/edit/glob/bash/git-status/git-diff through the execution service.

The service wraps existing behavior rather than changing policy:

- TS-local command execution still uses `packages/ts-shell/src/daemon/client.ts`.
- Rust daemon execution remains opt-in through existing runtime configuration.
- Workspace authority and patch routes remain the write-safety owners for apply_patch and workspace mutation flows.

This is not a ceremony-only interface: the core tool registry now uses it for real command and file side effects.
