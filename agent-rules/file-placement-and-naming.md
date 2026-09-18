# File Placement And Naming

Code must live in the module or domain that owns the runtime responsibility. The repository should use domain folders to carry context, so files can stay short, local, and responsibility-based.

These are durable project-level rules. They define how future code should be placed and named. They are not a one-time migration plan.

## Placement Principles

- Put behavior in the module that owns the product responsibility.
- Prefer owner-domain folders over flat catch-all folders.
- Prefer subdomain folders when a domain has multiple concepts with different owners.
- Keep invariants close to the code that owns them.
- Keep tests near the owner domain when practical.
- Avoid growing central orchestration, entrypoints, or compatibility files when a focused domain module can own the behavior.
- Large files are acceptable only when their responsibilities are cohesive and rightful.
- A domain manager may coordinate responsibilities that belong to its public contract, but it should not absorb unrelated implementation details.

A healthy product path should read as domain ownership first, local role second:

```text
packages/ts-shell/src/runtime/loop/contract.ts
packages/ts-shell/src/runtime/events/projection.ts
packages/ts-shell/src/presentation/terminal/renderer.ts
packages/ts-shell/src/planning/handoff/edit.ts
packages/ts-shell/src/provider/registry/model.ts
packages/ts-shell/src/session/continuation/readiness.ts
```

## Owner Domains

Use existing owner domains where possible. All top-level domains under
`packages/ts-shell/src/` are owners:

```text
core/
runtime/
turn/
context/
planning/
provider/
tools/
session/
evidence/
result/
presentation/
policy/
edit/
verification/
repair/
```

These are owners too, but they are cross-cutting or boundary-shaped rather than
feature domains, so prefer putting new behavior in a feature domain when one
fits:

```text
browser/          integrated browser/Playwright execution surface
cli/              interactive CLI surface and its reusable contracts
daemon/           Rust daemon client, protocol, and parity boundary
entrypoints/      executables and compatibility re-exports only
memory/           project and context memory
sandbox/          sandbox preflight and authority
config/           configuration loading and validation
observability/    structured logging and tracing
artifacts/        produced-artifact inventory and access
eval/             offline evaluation surfaces
workflow/         repository-level workflow helpers
model-adapters/   model provider adapter boundary
renderer/         streaming renderer used by the CLI surfaces
test-utils/       test-only support; never imported by production code
```

When a domain becomes broad, add meaningful subdomains instead of lengthening file names:

```text
runtime/loop/
runtime/events/
runtime/execution/
runtime/resources/
planning/context/
planning/handoff/
provider/registry/
provider/request/
tools/policy/
tools/result/
session/replay/
session/continuation/
presentation/surface/
presentation/terminal/
```

Do not create folders named only for convenience, such as `helper`, `helpers`, `utils`, `misc`, `common`, or `support`. If a file does not have a clear owner, stop and identify the owner before adding it.

## File Naming Principles

- Prefer short local names inside meaningful folders.
- Let folders carry domain context; let files name the local role.
- Reusing the same file name in different domains is allowed when the folder gives the meaning.
- Avoid long compound file names that encode the full feature path.
- Avoid roadmap-title, phase-title, implementation-process, or route-style product names.
- Avoid external-project names in product code, filenames, exported types, runtime fields, or user-visible output.
- Longer file names are acceptable only when they are stable public concepts and a shorter folder-based name would be less clear.

Preferred local role names include:

```text
index.ts
model.ts
types.ts
contract.ts
runtime.ts
state.ts
events.ts
stream.ts
projection.ts
adapter.ts
policy.ts
boundary.ts
receipt.ts
summary.ts
renderer.ts
registry.ts
plan.ts
graph.ts
memory.ts
readiness.ts
```

Prefer this:

```text
runtime/events/projection.ts
runtime/events/stream.ts
runtime/loop/trajectory.ts
runtime/resources/descriptor.ts
presentation/surface/model.ts
presentation/terminal/renderer.ts
```

Over this:

```text
runtimeEventProjection.ts
jsonEventStream.ts
trajectoryProjection.ts
staticResourceDescriptor.ts
productSurface.ts
terminalMessageRenderer.ts
```

## Compatibility Shims

Compatibility shims exist to protect old import paths or public entrypoints. They are not owners of new behavior.

Compatibility shims must:

- remain thin
- delegate, re-export, or adapt names only
- not grow business logic
- not own product decisions
- not become the primary import path for new code

Examples of compatibility or executable surfaces that must stay thin unless explicitly scoped otherwise:

```text
packages/ts-shell/src/entrypoints/cli.tsx
packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts
```

A compatibility shim is different from a rightful domain manager. For example, `SessionManager` may retain real session lifecycle coordination, public API compatibility, dependency assembly, transaction ordering, and cross-session coordination when those duties are part of its public contract.

## Session Domain Guidance

Session code should keep public lifecycle coordination separate from focused implementation details.

Focused session subdomains may include:

```text
session/store/
session/transcript/
session/recovery/
session/replay/
session/continuation/
session/approval/
session/presentation/
session/schema/
```

Do not put store layout, transcript serialization, replay construction, recovery ranking, approval memory, presentation formatting, or schema defaults directly into a session compatibility surface when a focused session module can own it.

## Side-Effect Placement

Side effects must stay in sanctioned owners.

- Generic command and file tool side effects should pass through `ExecutionService` or a sanctioned execution owner.
- Provider network behavior belongs in provider request/fetch owners.
- Edit and write behavior belongs in edit/write owners.
- Session persistence belongs in session store/transcript owners.
- Result and evidence truthfulness belongs in result/evidence owners.
- Presentation renders facts; it does not own facts.

Do not add direct shell, filesystem write, provider, browser, MCP, or package-loading behavior to arbitrary product modules.

## Product Vocabulary

Product code must avoid development-process vocabulary unless the file is explicitly historical or compatibility-only.

Avoid product names that include:

```text
route
capstone
closeout
cut-through
sprint
MVP
reference
inspired
```

Historical docs may describe past work. Product code should use current domain language.

## Tests

Tests should follow the owner domain. A test may either live beside the module or in the existing package test layout, but it should make ownership clear.

When a module is split into subdomains, tests should target the new owner path rather than relying on old compatibility paths for new coverage.

Examples:

```text
runtime/events/projection.ts
runtime/events/projection.test.ts

presentation/terminal/renderer.ts
presentation/terminal/renderer.test.ts
```

## New File Checklist

Before adding a file, identify:

- owner domain
- subdomain if the owner is broad
- local responsibility
- expected callers
- focused tests or validation
- why an existing file is not the right home
- whether the file name can be shortened by adding a clearer folder
- whether the file is a real owner or only a compatibility surface

Do not add a new file until the owner and local role are clear.
