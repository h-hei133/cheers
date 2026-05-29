# Build Infrastructure Route Index

This index summarizes completed BI001 to BI005 work and the recommended route
grouping after the BI006 Pi deep audit.

## Completed Routes

| Route | Status | Owner domains | Covered patterns | Primary current files |
|---|---|---|---|---|
| BI001: Pi-inspired architecture planning | Completed as docs/planning | Documentation, architecture planning | Initial Pi pattern matrix, local gap analysis, roadmap, rejection guardrails | `docs/build-infrastructure/pi-pattern-adoption-matrix.md`, `docs/build-infrastructure/build-infrastructure-roadmap.md` |
| BI002: Runtime turn snapshot and save point | Completed as product infrastructure | `runtime`, `turn`, `evidence`, `session`, `result` | Frozen turn snapshot, phase vocabulary, evidence-only save point | `packages/ts-shell/src/turn/turnSnapshot.ts`, `packages/ts-shell/src/runtime/runtimePhase.ts`, `packages/ts-shell/src/evidence/runtimeSavePoint.ts` |
| BI003: Execution receipt and tool details | Completed as product infrastructure | `runtime/execution`, `core/tools`, `evidence`, `result`, `session` | Execution error taxonomy, execution receipt, tool content/details split | `packages/ts-shell/src/runtime/execution/executionService.ts`, `packages/ts-shell/src/runtime/execution/executionReceipt.ts`, `packages/ts-shell/src/core/tools/registry.ts` |
| BI004: Session tree projection and event stream | Completed as product projection infrastructure | `session`, `runtime/events`, `runtime`, `result`, `core/shell` | Schema-neutral linear session tree projection, host-neutral runtime event projection | `packages/ts-shell/src/session/sessionTreeProjection.ts`, `packages/ts-shell/src/runtime/events/runtimeEventProjection.ts`, `packages/ts-shell/src/core/shell/cliSessionProductSurface.ts` |
| BI005: Static resource contract experiment | Completed as product projection infrastructure | `runtime/resources`, `runtime/events`, `core/shell` | Static resource descriptors, safe provider metadata, metadata-only extension manifests, explicit static projection | `packages/ts-shell/src/runtime/resources/staticResourceDescriptor.ts`, `packages/ts-shell/src/runtime/resources/staticResourceProjection.ts` |

## Proposed Next Routes

| Proposed route | Group | Owner domains | Route type | Risk notes | Validation approach |
|---|---|---|---|---|---|
| BI007: Extension Lifecycle And Hook Boundary | Extension/resource governance | `runtime/resources`, future extension owner, policy, `core/tools` observation, `provider` metadata, CLI display | Implementation | Highest risk: dynamic plugin execution, hook mutation, provider default enablement. Must stay non-executable/default-off. | Descriptor/lifecycle tests, redaction tests, no-success-from-hook tests, default-off tests, diff/status. |
| BI008: Session Branch Compaction And Context Rebuild | Session/context integrity | `session`, `context`, `evidence`, `result`, minimal CLI display | Implementation | Replay/recovery/compact drift, branch summaries mistaken as verdicts, schema migration pressure. | Session projection, compact continuity, replay/recovery, redaction, no-schema-migration review. |
| BI009: Programmatic Runtime API And JSON Event Stream | Host boundary | `runtime/events`, `runtime`, `session`, `result`, CLI host | Implementation | External API promises and CLI transcript/output drift. | Event contract tests, CLI compatibility tests, transcript persistence tests, result truthfulness tests. |
| BI010: Provider Model Registry And Compatibility Flags | Provider/model metadata | `provider`, model adapter owner, `runtime/resources`, CLI readiness | Implementation | Secrets, private config, custom providers, default enablement. | Fake-provider metadata tests, redaction tests, default-off tests, no private config reads. |
| BI011: Tool Hook Permission Interception | Tool/policy | `core/tools`, policy, `runtime/execution`, `evidence`, `result` | Implementation | Hooks can rewrite success or collapse permission states. | Tool policy tests, ExecutionService receipt tests, denied/pending/approved tests, result truthfulness tests. |
| BI012: Package Resource Governance | Resource/package policy | `runtime/resources`, policy, documentation | Planning first, implementation later | Package install/load side effects and supply-chain trust. | Governance doc/spec review, static manifest tests, no network/install assertions. |
| BI013: UI Rendering And Message Renderer Boundary | Host/UI rendering | CLI/UX renderer owner, `runtime/events`, tool projection | Planning then implementation | Renderer code can start owning runtime truth or force UI churn. | Renderer adapter tests, CLI output compatibility tests, no runtime truth change tests. |
| BI014: Steering Follow-Up And Next-Turn Delivery Modes | Runtime/session interaction | `runtime`, `session`, `context`, CLI interaction | Implementation after BI008 | Queued messages can bypass branch/context constraints. | Prompt barrier tests, session future-turn tests, interrupted/resume tests. |
| BI015: Provider Request Hooks And Auth Refresh | Provider/policy | `provider`, model adapter owner, policy | Delayed implementation | Secret/auth/header exposure. | Fake-provider request tests, redaction tests, explicit opt-in tests. |
| BI016: Parallel Read-Only Tool Execution Experiment | Tool/runtime experiment | `core/tools`, `runtime`, policy, result/evidence | Experiment | Event ordering and accidental mutation concurrency. | Read-only fixture tests, deterministic event ordering, no-write assertions. |

## Route Grouping Strategy

Use these groups:

1. Extension/resource governance:
   BI007 and BI012 are related, but keep them separate. Extension lifecycle is
   about hook states and opt-in boundaries. Package governance is about
   provenance and distribution.

2. Session/context integrity:
   BI008 and BI014 are related. Do branch/compaction/context rebuild before
   steering/follow-up delivery modes.

3. Host boundary:
   BI009 and BI013 are related. Do event/API contracts before UI renderer
   registries.

4. Provider/model policy:
   BI010 and BI015 are related. Do registry/compatibility metadata before
   request hooks or auth refresh.

5. Tool/policy execution:
   BI011 and BI016 are related. Do permission interception before any parallel
   execution experiment.

Can be combined only when:

- routes share owner domains,
- validation is identical,
- no safety risk expands from metadata/projection into side effects, and
- no route needs session migration, provider auth, package install, or dynamic
  plugin execution.

Must stay separate when:

- one route is documentation/planning and the other changes product code,
- one route touches provider auth or private config boundaries,
- one route touches session persistence/replay,
- one route changes execution/mutation concurrency,
- one route adds UI/API host promises.

## Recommended Immediate Next Route

BI007: `Extension Lifecycle And Hook Boundary`

Rationale:

- BI005 already created metadata-only extension manifests.
- Pi's largest still-uncovered architecture value is extension lifecycle and
  hook containment.
- A lifecycle/hook route can stay non-executable and default-off while creating
  the owner boundary future routes need.

Hard scope:

- No plugin execution.
- No package loading.
- No provider registration or provider call.
- No dynamic discovery.
- No session schema migration.
- No compatibility shim growth.
- No route-numbered product files.

## Recommended Route After That

BI008: `Session Branch Compaction And Context Rebuild`

Rationale:

- Extension state and next-turn delivery both need branch-aware session facts.
- Current session tree projection is intentionally linear-path only.
- Pi's branch summary and compaction model is valuable, but should be adapted as
  projection before persistence migration.

Hard scope:

- Schema-neutral projection first.
- Branch summaries are evidence-only and not terminal success.
- Preserve replay, recovery, compact, and continuation semantics.
