# Rust Readiness Triggers

Rust should not receive product runtime behavior merely to satisfy old wording.

Move or expand execution responsibilities into Rust only when a task needs one or more of:

- OS/process guarantees beyond Node child-process behavior
- reliable process tree cleanup
- cancellation or timeout behavior that must survive TypeScript runtime limitations
- sandbox or isolation enforcement
- PTY/process lifecycle reliability
- single-binary distribution
- security-sensitive execution audit

Current Rust reality:

- `packages/rust-core/src/executor.rs` defines command execution request/result types, sandbox evaluation, timeout, and cancellation behavior.
- `packages/rust-core/src/bin/daemon.rs` exposes one-shot and stdio daemon execution.
- TypeScript reaches Rust through `packages/ts-shell/src/daemon/client.ts` only when the daemon path is enabled.

Until a runtime path proves otherwise, Rust is a native executor candidate and opt-in execution path, not the default execution plane.
