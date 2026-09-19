# Architecture Boundaries

Preserve responsibility boundaries even when a shortcut would make a demo path appear usable.

## TypeScript Product Runtime And Control Plane

TypeScript is the primary product runtime and control plane. It owns:

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
- most current execution adapters

Keep product runtime and control-plane semantics in TypeScript.

## Execution Boundary

Execution is an explicit boundary/interface. In the current codebase it is implemented mostly in TypeScript, with a Rust daemon path available only where the active code path opts into it.

The TypeScript execution boundary should own runtime-neutral request/result/event shapes for:

- command execution
- cancellation
- file reads and writes
- apply patch or workspace mutation handoff
- sandbox or preflight decisions
- permission and capability requirements

New direct external side effects must go through the current owner module or a documented execution/file/workspace boundary. Do not scatter `child_process`, writable `fs`, shell/PTY, browser process, MCP process, or runtime network side effects into unrelated product modules.

## Rust Native Executor Candidate

Rust is a future native executor candidate for responsibilities that need:

- daemon behavior
- OS/process guarantees
- timeout, cancellation, and process tree cleanup reliability
- sandbox preflight
- low-level execution isolation
- PTY/process lifecycle reliability
- single-binary distribution
- security-sensitive execution audit

Do not claim Rust owns the current execution plane unless the concrete code path proves it. Do not move shell, session, replay, recovery, permission, result semantics, or product orchestration into Rust for convenience.

## Contracts Boundary

`contracts` carries serialized schemas, execution events, lifecycle states, permission/request/response semantics, and versioning rules across runtimes when there is a real cross-runtime consumer.

Contract changes must keep producer and consumer semantics aligned.

`contracts` must not contain business orchestration, model/provider calls, shell helpers, file-system helpers, UI helpers, test mock convenience, or runtime side-effect code.

## Python Eval Layer

`packages/python-eval/` is offline evaluation only. It may read traces, datasets, and evaluation artifacts, but it must not own production orchestration, permissions, replay, recovery, persistence, agent loop, runtime side effects, or production tool lifecycle.

## Domain Ownership

- Final-domain modules should own their actual responsibilities.
- Product runtime must not import docs, scripts, dev-history, or route reports.
- No new capability logic belongs in a legacy or compatibility path unless the compatibility reason is explicit and documented.
- Compatibility wrappers should delegate only.
- Do not hide permission, write authorization, or runtime lifecycle semantics behind convenience plumbing.

## Common Areas

- `packages/ts-shell/src/entrypoints/`: executable entrypoints and compatibility re-exports only; reusable CLI contracts belong under `packages/ts-shell/src/cli/`.
- Current owners for new edit/result logic include `packages/ts-shell/src/edit/`, `packages/ts-shell/src/edit/result/`, `packages/ts-shell/src/edit/multifile/`, `packages/ts-shell/src/verification/`, `packages/ts-shell/src/repair/`, `packages/ts-shell/src/evidence/`, `packages/ts-shell/src/result/`, and `packages/ts-shell/src/policy/`.
- `packages/ts-shell/src/core/query/`: generic query and result mapping; project feature-specific state into generic result shapes before handing it to query-level mappers.
- `packages/ts-shell/src/core/security/`: path containment, project trust, and the report-safe text redactors shared across domains - `redaction.ts` (provider paths, bearer tokens, credential assignments) and `reportText.ts` (report-unsafe markers and length caps), the latter shared by `browser/` and `presentation/`.
- `packages/ts-shell/src/core/shell/`: shell/session display surface; keep feature-specific policy and writer semantics outside this layer when possible.
- `packages/ts-shell/src/session/`: session lifecycle, durable session state, and resume/recovery boundaries.
- `scripts/`: repository-level validation scripts, readiness checks, and real-provider smoke entrypoints.
