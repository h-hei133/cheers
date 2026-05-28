# Current Language Reality

The product runtime is TypeScript-first.

TypeScript currently owns the CLI, session lifecycle, orchestration, query routing, permission UX, recovery, replay, runtime durability, result mapping, terminal/session surface, provider-facing adapters, tool runtime, MCP integration, browser runtime control surfaces, and most local execution/file adapters.

Execution is a boundary, not a language claim. The current boundary is represented in TypeScript by `packages/ts-shell/src/runtime/execution/executionService.ts`, with command execution delegated to existing TypeScript local execution or the Rust daemon path depending on runtime configuration.

Rust currently exists as `packages/rust-core/`. It contains command execution request/result structures, sandbox preflight behavior, timeout/cancellation behavior, and a stdio daemon. That makes Rust a real candidate executor path, but not the universal current execution plane.

`contracts/` currently contains cross-runtime schema and type surfaces: runtime protocol JSON schema, TypeScript types, Rust type module, Python types, fixtures, and contract tests. It is a semantic protocol boundary, not an owner for product orchestration or IO helpers.

`packages/python-eval/` is offline evaluation only. It has its own Python packaging and tests and is not imported by production TypeScript runtime code.
