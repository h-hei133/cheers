# Structure Reorganization Target Layout

## Recommendation

Use a conservative in-place target layout inside `packages/ts-shell/src`.
Preserve current packages and build configuration. Do not introduce a new
workspace package, package-local `modules` build system, or clean-room project
unless a later route proves current structure blocks product development.

## Evaluated Layouts

### Layout A: Domain Modules Under Current `src`

Keep `packages/ts-shell/src` as the TypeScript product root, but make each
domain folder carry more local context:

```text
packages/ts-shell/src/
  runtime/
    execution/
    events/
    loop/
    resources/
    extensions/
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
  turn/
  cli/
  entrypoints/
  compatibility/
```

Recommended. It preserves TypeScript build simplicity, Vitest discovery, local
import behavior, and current package scripts. It improves context efficiency by
moving implementation details into owner folders without forcing a package split.

### Layout B: `packages/ts-shell/modules/*`

Create module shells such as:

```text
packages/ts-shell/modules/session/src
packages/ts-shell/modules/session/test
packages/ts-shell/modules/session/scripts
```

Rejected for now. It may look clean, but it would require new test discovery,
import, and build conventions while still living inside one package. It creates
migration churn before proving a structural benefit over current owner folders.

### Layout C: Separate Workspace Packages

Split domains into packages such as runtime, session, provider, and presentation.

Rejected for now. This increases package scripts, build boundaries, dependency
management, publish-style exports, and rollback cost. It is too much structure
for a repository whose primary pain is discoverability and historical naming.

## Proposed Target Layout

The target keeps repeated short file names under meaningful folders:

```text
packages/ts-shell/src/
  runtime/
    index.ts
    workflow.ts
    execution/
      index.ts
      service.ts
      receipt.ts
      authority.ts
      events.ts
      service.test.ts
    events/
      index.ts
      stream.ts
      projection.ts
      projection.test.ts
    loop/
      index.ts
      contract.ts
      trajectory.ts
      infrastructure.ts
      contract.test.ts
    resources/
      index.ts
      descriptor.ts
      projection.ts
      trust.ts
    extensions/
      index.ts
      lifecycle.ts
      hooks.ts
  context/
    index.ts
    read/
      intent.ts
      stage.ts
      delivery.ts
      window.ts
    repo/
      explain.ts
      targets.ts
    rebuild/
      input.ts
      projection.ts
  planning/
    index.ts
    workflow/
      plan.ts
      targets.ts
      signals.ts
    prompt/
      target.ts
  provider/
    index.ts
    registry.ts
    model-boundary.ts
    draft.ts
  tools/
    index.ts
    registry.ts
    dispatcher.ts
    batch.ts
    result.ts
    interception.ts
  session/
    index.ts
    SessionManager.ts
    store/
    transcript/
    recovery/
    replay/
    continuation/
    approval/
    presentation/
    schema/
  evidence/
    index.ts
    ledger.ts
    save-point.ts
    freshness.ts
    verdict.ts
    projection/
    compatibility/
  result/
    index.ts
    workflow.ts
    session.ts
    terminal/
  presentation/
    index.ts
    surface/
      model.ts
      sections.ts
      renderer.ts
    terminal/
      renderer.ts
  policy/
    index.ts
    command.ts
    resource.ts
  edit/
    index.ts
    runtime.ts
    planning/
    result/
    multifile/
    compatibility/
  verification/
    index.ts
    command/
    loop/
    stage.ts
  repair/
    index.ts
    single-file/
    cross-file/
    degraded-reopen/
  turn/
    index.ts
    snapshot.ts
    bundle.ts
    delivery.ts
    steering.ts
  cli/
    bootstrap/
    runtime/
    interactive/
    output/
    provider/
    approval/
  entrypoints/
    cli.tsx
  compatibility/
    integrated-flow.ts
```

Names above are target examples, not permission to move files in this route.

## Module Boundaries

| Domain | Proposed module location | Public exports | Internal-only files | Allowed dependencies | Forbidden dependencies |
| --- | --- | --- | --- | --- | --- |
| Runtime | `runtime` | phase, boundaries, workflow coordination APIs | workflow implementation details | execution, events, loop, result, evidence, session projections | docs, scripts, route reports, provider auth internals unless explicitly scoped |
| Runtime loop | `runtime/loop` | Agent Loop contract, trajectory projection | private projection helpers | turn, tools, evidence, result, context summaries | direct provider calls, session storage writes |
| Execution | `runtime/execution` | execution service, authority, receipt/event projection | process/file adapters | policy, evidence, result | UI rendering, docs/scripts, provider config reads |
| Events | `runtime/events` | event types, JSON stream, projections | event formatting helpers | runtime phases, session/result projections | provider auth, CLI terminal state as fact owner |
| Turn | `turn` | snapshots, bundles, delivery/steering queues | helper normalization | tools, evidence, result | provider network calls, edit backend |
| Context | `context` | read/rebuild planning stages and projections | read-window internals | session projections, planning signals, evidence | direct edit writes, provider calls |
| Planning | `planning` | workflow task plan, intent signals, target projections | scoring helpers | context, verification intent, repair signals | execution side effects, terminal rendering |
| Provider | `provider` | registry, model response boundary, draft stage | provider-shape helpers | result, evidence, runtime resources | default live-provider enablement, auth core rewrites |
| Tools | `tools` | registry, dispatcher, batch/result contracts, interception | adapter glue | runtime execution, policy, result | hidden command execution outside ExecutionService |
| Session | `session` | `SessionManager`, projections, store/transcript/recovery APIs | codecs and local builders | evidence, result, context, turn, approval policy | provider calls, CLI output as state authority |
| Evidence | `evidence` | ledger, save point, freshness, verdict | compatibility transforms | runtime, turn, result | success rewriting, provider secrets |
| Result | `result` | workflow/session/terminal truth adapters | formatting helpers | evidence, runtime events, session facts | unverified success claims |
| Presentation | `presentation` | product surface view model and renderers | section builders | result, evidence, runtime events, provider/resource/session projections | creating or changing runtime facts |
| Policy | `policy` | command/resource policy contracts | local classifiers | execution metadata, resources, tools | side effects or provider auth changes |
| Resources | `runtime/resources` | descriptors, projection, trust metadata | static inventory helpers | provider registry, policy, events | dynamic package loading unless explicitly scoped |
| Extensions | `runtime/extensions` | lifecycle and hook contracts | hook projection helpers | policy, tools, resources | executable plugin behavior unless scoped |
| Verification | `verification` | command and loop verification stages | command-plan helpers | execution, result, evidence, repair | hidden repair writes |
| Repair | `repair` | repair planning and handoff stages | reopen/cross-file helpers | verification, edit planning, evidence | direct unapproved writes |
| Edit | `edit` | mutation runtime, planning, result, multifile APIs | backend-specific planners | runtime execution, verification, repair, result | defaulting new logic into legacy `orchestration/patchResult` |

## Naming Policy

Use short file names when the folder already supplies the domain context:

- Prefer `contract.ts`, `projection.ts`, `events.ts`, `adapter.ts`,
  `registry.ts`, `policy.ts`, `receipt.ts`, `state.ts`, `summary.ts`,
  `renderer.ts`, `plan.ts`, `graph.ts`, and `memory.ts` inside meaningful
  folders.
- Reuse the same short file name in different domains when the parent folder
  disambiguates it.
- Let folder names carry product context. Do not encode route history, sprint
  labels, capstone labels, MVP labels, external-origin names, or implementation
  provenance in product filenames.
- Use longer names only when the local folder contains multiple adjacent roles
  that would otherwise be ambiguous, or when compatibility requires preserving
  a public filename temporarily.
- Test names should identify behavior and owner, not route history. Long
  scenario names are acceptable when they prevent ambiguity in safety-critical
  behavior, but they should live under a focused scenario or fixtures folder.

## Before And After Examples

These examples describe target direction only:

| Current path | Target-style path | Reason |
| --- | --- | --- |
| `runtime/execution/executionService.ts` | `runtime/execution/service.ts` | Folder already says execution. |
| `runtime/events/runtimeEventProjection.ts` | `runtime/events/projection.ts` | Folder already says runtime events. |
| `runtime/loop/agentLoopContract.ts` | `runtime/loop/contract.ts` | Folder already says loop. |
| `presentation/productSurface.ts` | `presentation/surface/model.ts` and `presentation/surface/sections.ts` | Split large view-model projection without changing fact ownership. |
| `orchestration/runMvpIntegratedFlow.ts` | `compatibility/integrated-flow.ts` with old path re-export | Treat as compatibility surface, not owner module. |
| `orchestration/patchResult/workspaceWriteRoute.ts` | `edit/result/workspace-write.ts` or `edit/multifile/write.ts` | Edit/result owner should hold write-result logic. |
| `entrypoints/cliRuntimeModule.ts` | `cli/runtime/module.ts` with entrypoint bridge | Entrypoints stay executable or compatibility-only. |

## Compatibility Strategy

- Freeze existing public import paths before moving implementation.
- Move implementation to the owner domain first.
- Leave the old path as a thin compatibility export or delegate only when
  external or broad internal imports still depend on it.
- Do not add new behavior to compatibility paths.
- Remove compatibility exports only after import consumers have migrated and a
  focused route proves the path is no longer needed.
- Keep `entrypoints/cli.tsx` executable and thin.
- Keep `orchestration/runMvpIntegratedFlow.ts` as a compatibility shim until
  its callers can target runtime/loop or workflow owners directly.
- Keep `SessionManager.ts` as a rightful domain manager. Move only concrete
  subdomain implementation details to `session/store`, `session/transcript`,
  `session/recovery`, `session/replay`, `session/continuation`,
  `session/approval`, `session/presentation`, or `session/schema`.

## Import Strategy

- Preserve `.js` suffixes for local TypeScript imports that compile to
  JavaScript.
- Avoid path aliases or package export changes during early migrations.
- Update imports in small owner-domain batches, not in repository-wide churn.
- Prefer local `index.ts` exports only for public domain surfaces. Avoid broad
  barrel files that hide dependency direction.
- Track old-path imports during each migration route and keep compatibility
  exports until the count reaches zero.
- Never use a reference repository layout to override a current owner module
  when the target repository already has a post-reset owner.

## Roadmap Priority

This audit does not require changing
`docs/build-infrastructure/build-infrastructure-next-product-roadmap.md`.
The recommendation is a future migration route sequence, not an immediate
priority change to product work.
