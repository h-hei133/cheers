# File Placement And Naming

Code must live in the owning module or domain. Directory names should carry domain context so file names can stay short and responsibility-based.

## Placement

- Put behavior in the module that owns the runtime responsibility.
- Do not pile unrelated behavior into one folder.
- Do not pile unrelated behavior into one file.
- Large files are acceptable only when their responsibilities are cohesive and rightful.
- Prefer adding a focused module over growing central orchestration files.
- Keep invariants close to the code that owns them.
- Move related tests with new modules when practical.

Keep compatibility and executable shims thin:

```text
packages/ts-shell/src/entrypoints/cli.tsx
packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
```

`packages/ts-shell/src/session/SessionManager.ts` is a rightful domain manager, not a hollow facade. It may retain real session lifecycle coordination, public API compatibility, dependency assembly, transaction ordering, and cross-session coordination.

Move only concrete subdomain implementation details into focused session modules such as:

```text
packages/ts-shell/src/session/store/
packages/ts-shell/src/session/transcript/
packages/ts-shell/src/session/recovery/
packages/ts-shell/src/session/replay/
packages/ts-shell/src/session/continuation/
packages/ts-shell/src/session/approval/
packages/ts-shell/src/session/presentation/
packages/ts-shell/src/session/schema/
```

Do not place policy logic, writer boundary logic, permission semantics, provider-gate semantics, or result/session mapping logic directly in compatibility shims when a focused module can own it.

## Naming

- File names should be short, responsibility-based, and domain-backed.
- Directory names should carry context so file names do not become long.
- Avoid vague buckets such as `helper`, `helpers`, `utils`, `misc`, `common`, `support`, or `legacy`.
- Avoid route-style product names.
- Product code must not expose development process terms such as route numbers, capstone, closeout, cut-through, sprint, or MVP unless it is explicitly a compatibility/history surface.
- Do not encode an entire roadmap title into a file, function, or type name.

Good examples:

```text
workspaceBoundary.ts
workspaceAuthority.ts
writeFailureState.ts
writeRecovery.ts
runtimeWriteRoute.ts
routeWiringGate.ts
productionRoute.ts
permissionUxRoute.ts
```

## Suffixes

- `*Gate.ts` for precondition checks and entry decisions.
- `*Route.ts` for composed execution paths.
- `*Result.ts` or `*Projection.ts` for terminal/result/session mapping.
- `*State.ts` for state models.
- `*Smoke.ts` for real-provider or end-to-end smoke wrappers.
- `*Authority.ts` or `*Policy.ts` for boundary and safety checks.
- `*Surface.ts` for user-visible or terminal-facing projections.
- `*Bridge.ts` for adapter layers between internal contracts and runtime-facing shapes.

Tests should normally match the module name:

```text
workspaceWriteRoute.ts
workspaceWriteRoute.test.ts
```

## New File Checklist

Before adding a file, identify:

- owner domain
- local responsibility
- expected callers
- focused tests or validation
- why an existing file is not the right home

## Compatibility Shims

- Compatibility shims must remain thin.
- They should delegate, re-export, or adapt names only.
- They must not gain business logic.
- Distinguish compatibility shims from rightful domain managers. Domain managers may coordinate real ownership responsibilities when that coordination is part of their public contract.
