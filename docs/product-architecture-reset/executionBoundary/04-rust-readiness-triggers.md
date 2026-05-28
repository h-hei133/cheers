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

Current TypeScript boundary readiness:

- `ExecutionService` request types now carry explicit authority metadata and caller/reason fields.
- `CommandExecutionResult` includes structured execution events for started, exited, failed, timed out, and cancelled outcomes.
- Contracts schema elevation should wait for a real cross-runtime consumer that needs the authority/event shape serialized outside the TypeScript runtime boundary. The trigger is a Rust daemon protocol or contract fixture that consumes the same authority/event fields directly.

Until a runtime path proves otherwise, Rust is a native executor candidate and opt-in execution path, not the default execution plane.
