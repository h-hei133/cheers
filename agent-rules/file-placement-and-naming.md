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
packages/ts-shell/src/runtime/execution/fileWalk.ts
packages/ts-shell/src/runtime/execution/receipt.ts
packages/ts-shell/src/presentation/terminal/streaming.ts
packages/ts-shell/src/context/compact/command/compactCommandRunner.ts
packages/ts-shell/src/provider/registry/provider.ts
packages/ts-shell/src/session/recovery/sessionRecoveryRuntime.ts
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
test-utils/       test-only support; never imported by production code
```

### `core/` admission

`core/` holds runtime substrate: shell and session surface, the agent loop kernel,
tool registry and execution primitives, approval and policy evaluation, hooks,
path and security jails, and configuration-neutral contracts. A feature domain may
depend on `core/`; `core/` must not depend on a feature domain.

A module belongs in `core/` only when all three hold:

1. **Direction.** Its imports resolve only within `core/` or to sanctioned
   leaf/cross-cutting domains (`config/`, `observability/`, `artifacts/`,
   `model-adapters/`). A module that imports a feature domain belongs in that
   domain, not in `core/`.
2. **Audience.** At least two feature domains consume it, or a declared
   entrypoint reaches it. A module with a single consumer belongs with that
   consumer.
3. **Survival.** It is not a compatibility shim, not a scenario fixture, and not
   an implementation of a capability the product states it does not provide.

Adding `core/<subdomain>/` also requires a one-line responsibility entry in
[architecture boundaries](architecture-boundaries.md) Common Areas, in the same
form `core/query/` and `core/shell/` already use.

When a domain becomes broad, add meaningful subdomains instead of lengthening file names:

```text
runtime/execution/
runtime/resources/
runtime/extensions/
provider/registry/
provider/request/
tools/policy/
session/replay/
session/continuation/
presentation/sidebar/
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
runtime/execution/receipt.ts
runtime/execution/fileWalk.ts
runtime/execution/fileLock.ts
runtime/resources/descriptor.ts
presentation/terminal/streaming.ts
provider/registry/provider.ts
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

### Facade Or Monolith

A module may keep more than the responsibility ceiling of function-like names only
when it is a **thin facade**: an aggregation surface whose names delegate rather
than own behaviour. Claiming that standing requires measurement, not assertion.

A module is a thin facade only when all four hold:

1. **Delegation ratio >= 0.90.** At least 90% of its declarations are a single
   call, optionally returning or reading one property of that result.
2. **No branching.** No declaration contains `if`, `for`, `while`, `switch`,
   `try`, a ternary, or `catch`.
3. **No own state.** No `this.<field> =` assignment outside the constructor.
4. **Bounded bodies.** Fewer than 15 physical lines per declared name.

Otherwise the module is a real monolith and the ceiling applies: split it.

Run `npm run analyze:module-facades` to compute all three clauses and classify
every over-ceiling module. The delegation threshold is not arbitrary: on the
current tree the classification has a clean gap - facade-shaped modules sit at a
delegation ratio at or above 0.90 with zero branching, and every real monolith
sits at 0.35 or below - so any cutoff inside that gap classifies identically.

The tool has one known measurement gap, recorded rather than papered over: a
declaration whose return type is an object type is parsed as starting mid-annotation,
so it can be reported branch-free when it is not. One declaration in the tree is
affected today. The error direction is always "too generous" - a module may be
excused as a facade when it owns a little behaviour - so treat a `thin-facade`
verdict as a prompt to look, not as proof. Three fixes were attempted and reverted
because each regressed more verdicts than it corrected; the limitation is documented
in the script.

A fourth clause, lines per declared name, was considered and is deliberately not
part of the verdict. Length is reported for context but does not decide, because
it does not separate the two shapes: over-ceiling modules range from 8.8 to 144.7
lines per name with no gap in between, and most of the tree's long modules are
long because of literal tables and doc comments rather than logic. A module is a
monolith because of what its declarations do, not how tall the file is.

Splitting is still a design act, not a mechanical one. A module whose functions
form a safety-ordered write path, or whose state shape is an encoded contract
consumed elsewhere, must be split along its existing seams and never by name
count alone.

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
runtime/execution/fileWalk.ts
runtime/execution/fileWalk.test.ts

presentation/terminal/streaming.ts
presentation/terminal/streaming.test.ts
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
