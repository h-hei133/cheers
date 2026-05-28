# Architecture Boundaries

Preserve responsibility boundaries even when a shortcut would make a demo path appear usable.

## TypeScript Control Plane

TypeScript owns:

- shell and interactive CLI
- session lifecycle and continuity
- orchestration and query loop semantics
- slash routing and shell actions
- recovery and permission UX
- replay and runtime durability
- MCP capability routing
- result mapping
- terminal/session surface
- high-level capability routing

Keep control-plane semantics in TypeScript.

## Rust Execution Plane

Rust owns execution-plane responsibility:

- daemon behavior
- command execution
- timeout and cancellation
- sandbox preflight
- low-level execution isolation

Do not move shell, session, replay, recovery, permission, or result semantics into Rust for convenience.

## Contracts Boundary

`contracts` carries shared protocol, lifecycle, boundary, and semantic constraints across TypeScript and Rust.

Contract changes must keep producer and consumer semantics aligned.

## Python Eval Layer

`packages/python-eval/` is an evaluation layer. Do not move orchestration, replay, recovery, permission, runtime durability, or runtime ownership into Python eval for local convenience.

## Domain Ownership

- Final-domain modules should own their actual responsibilities.
- Product runtime must not import docs, scripts, dev-history, or route reports.
- No new capability logic belongs in legacy orchestration paths unless the compatibility reason is explicit and documented.
- Compatibility wrappers should delegate only.
- Do not hide permission, write authorization, or runtime lifecycle semantics behind convenience plumbing.

## Common Areas

- `packages/ts-shell/src/orchestration/patchResult/`: patch/apply_patch route contracts, gates, result projections, write policies, authority checks, and small orchestration helpers.
- `packages/ts-shell/src/orchestration/patchApplication/`: low-level patch application or writer implementation details.
- `packages/ts-shell/src/core/query/`: generic query and result mapping; project feature-specific state into generic result shapes before handing it to query-level mappers.
- `packages/ts-shell/src/core/shell/`: shell/session display surface; keep feature-specific policy and writer semantics outside this layer when possible.
- `packages/ts-shell/src/entrypoints/`: CLI parsing and minimal entrypoint wiring.
- `packages/ts-shell/src/session/`: session lifecycle, durable session state, and resume/recovery boundaries.
- `scripts/`: repository-level validation scripts, readiness checks, and real-provider smoke entrypoints.
