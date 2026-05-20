# CLI Module Extraction

Route: `docs/agent-routes/route158-cli-module-facades.md`

## Boundary

This route is a behavior-preserving owner-module extraction for
`packages/ts-shell/src/entrypoints/cli.tsx`.

Hard boundaries:

- no CLI flag, mode, or output semantic changes
- no provider live calls or real-provider config reads
- no approval trust-policy, prompt, cache, or audit semantic changes
- no session schema, selection, recovery, or transcript changes
- no runtime, browser, edit, or result-truthfulness behavior changes
- no package script or dependency changes
- no broad entrypoint rewrite

`cli.tsx` remains the process entrypoint and compatibility composition root. It
keeps process setup, top-level mode selection, readline lifecycle ordering, and
the final `main()` error boundary. Module-specific session, approval,
workspace, runtime, and command-surface details move behind CLI-owned facades
where behavior is already covered or characterized.

## Responsibility Migration Table

| Current code block / responsibility | Current owner file | True owner module | Target facade or file | Migration decision | Reason | Validation required | Risk |
|---|---|---|---|---|---|---|---|
| process argv parse, version/doctor early exits, runtime root bootstrap ordering | `cli.tsx` plus existing helpers | CLI / UX Engineering | keep in `cli.tsx`, existing `cliArgs.ts`, startup helpers | leave in entrypoint | This is the entrypoint compatibility boundary and must preserve order. | CLI args/baseline, build | startup ordering drift if moved |
| provider credential snapshot and startup display projection | `cli.tsx`, `cliStartupPlan.ts`, `cliProviderProjection.ts` | Provider / Model + CLI / UX | existing projection helpers; no new live gate | facade existing helpers | Route preserves provider snapshot/readiness semantics and redaction. | CLI core/baseline if touched | leaked credential/config detail |
| approval-mode object detection, conflict analysis, approval prompt handler, audit persistence adapter, apply-patch decision projection | `cli.tsx` | Permission / Policy Engineering + CLI / UX | `cliApprovalModule.ts` | extract now | Approval surface is coherent policy-facing CLI behavior; entrypoint should wire it, not own decision internals. | boundary tests, approval bridge tests, CLI adjacent tests | changed deny/allow/cache/audit behavior |
| non-TTY stream, replay, print/batch prompt handoff, prompt turn execution | `cli.tsx` | Agent Loop Engineering + CLI / UX | `cliRuntimeModule.ts` | extract now | Runtime turn handoff is a coherent execution facade; entrypoint should select mode and invoke it. | boundary tests, runtime invocation tests, runMvp gate | changed turn boundary/runtime payload |
| interactive slash-command dispatch for sessions, workspace, MCP, help, view, agent mode, permissions | `cli.tsx` | CLI / UX plus owning modules | keep high-level dispatch in `cli.tsx`; extract session/workspace/permission facades | partial extract now | Full dispatch rewrite is risky; coherent command families can move without changing slash semantics. | boundary tests, slash/CLI tests | prompt/readline ordering drift |
| session list/current/switch/panel display and runtime-context switch projection | `cli.tsx`, session surface helpers | Session / Continue Engineering + CLI / UX | `cliSessionModule.ts` | extract now | Session command surface and root-binding diagnostics are a module-owned CLI facade. | boundary tests, session CLI/core tests | session selection/root-binding drift |
| workspace status/recent/attach/path resolution and workspace-info prompt classifier | `cli.tsx`, workspace surface helpers | Workspace / File Context Engineering + CLI / UX | `cliWorkspaceModule.ts` | extract now | Workspace command surface and root binding belong behind a workspace facade. | boundary tests, workspace surface tests, CLI baseline | attach/root-mode drift |
| permissions list/explain/revoke/reset display surface | `cli.tsx`, approval trust policy | Permission / Policy Engineering + CLI / UX | `cliPermissionModule.ts` | extract now | Permission slash surface is approval-adjacent but distinct from approval prompting. | boundary tests, approval bridge adjacent tests | trust-grant display or reset drift |
| MCP control-plane command surface | `cli.tsx`, `mcpControlCliSurface.ts` | MCP / Tool Boundary Engineering | existing MCP surface; defer execution facade | defer | MCP gateway lifetime is tied to current runtime cwd; not required for this safe pass. | MCP control tests if touched | connection lifecycle drift |
| readline signal, prompt chrome, double-Esc cancellation | `cli.tsx` plus shell signal helpers | CLI / UX Engineering | keep in `cli.tsx` | leave in entrypoint | This is interactive process lifecycle ordering. | CLI baseline if touched | terminal lifecycle drift |
| result rendering and session runtime event persistence | `ShellSessionRuntime`, result/session facades | Result Surface + Session / Continue | existing facades | do not move | Route 156 owns this boundary; Route 158 must not change result truthfulness. | result-contract only if touched | false terminal result drift |
| test-only characterization of extracted facades | CLI tests | Harness / Eval Engineering | `cliModuleBoundary.test.ts` | extract now | Facades need direct behavioral coverage independent of full process execution. | new boundary test plus adjacent tests | under-covered ownership |

## Facade Ownership

- `cliApprovalModule.ts`: Permission / Policy plus CLI owner for approval-mode
  cue projection, prompt handler creation, non-interactive approval resolution,
  approval audit persistence adapter inputs, and apply-patch approval decision
  projection.
- `cliRuntimeModule.ts`: Agent Loop plus CLI owner for non-interactive
  prompt/replay/stdin handoff, runtime invocation event streaming, and prompt
  turn execution payload construction.
- `cliSessionModule.ts`: Session / Continue plus CLI owner for session command
  surfaces, session switch reference resolution, root-binding diagnostics, and
  runtime-context rebinding projection.
- `cliWorkspaceModule.ts`: Workspace / File Context plus CLI owner for
  workspace-info classification, attach/status command surfaces, root mode
  resolution, and runtime project-root projection.
- `cliPermissionModule.ts`: Permission / Policy plus CLI owner for
  `/permissions` display and trust grant mutation surface.

## What Remains in cli.tsx

`cli.tsx` remains responsible for:

- process startup and `main()` ordering
- argv parse and early version/doctor exits
- bootstrap call ordering and compatibility error boundary
- top-level mode selection and calling the relevant mode facade
- readline lifecycle, signal hooks, prompt chrome, and cancellation key handling
- high-level interactive slash-action dispatch ordering
- compatibility glue for existing runtime/session/provider surfaces

## Final Classification

After Route 158, `cli.tsx` is acceptable as a CLI entrypoint composition root if
focused facade tests and Tier 3 gates pass. It should not regain direct
approval prompt internals, non-interactive runtime turn execution internals,
session switch/root-binding helpers, workspace attach/path helpers, or
permission-list/explain surface details.

The next central file recommendation moves to `scripts/verify-real-user-capabilities.mjs`,
because it remains a large validation/readiness control surface after the core
runtime/session/CLI composition roots have been reduced to acceptable
facade-based owners.
