# Policy and Result Boundary Map

Route: `docs/agent-routes/route136-control-plane-atlas.md`

## Policy Inventory

| Policy surface | Current owner | Current states / facts | Boundary note |
|---|---|---|---|
| interactive approval | `approvalPromptBridge.ts`, `approvalTrustPolicy.ts`, `approvalFlow.ts` | deny, allow-once, allow-always, cached/persistent grants | CLI renders; policy should decide |
| non-interactive approval | `cli.tsx`, `approvalPromptBridge.ts` | default deny, explicit allow-once/allow-always, conflict block | do not infer from prompt text alone |
| approval memory | `SessionManager.ts`, `approvalAuditProjection.ts`, `approvalMemoryCodec.ts` | last decision/source/persistence/scope/history | persistence is session-owned |
| workspace authority | `patchResult/workspaceAuthority.ts`, `boundedWritePolicy.ts` | workspace root, stale read, guarded write opt-in | write authority remains edit-owned |
| provider opt-in | provider credential/readiness/runtime invocation modules | synthetic default, real opt-in, readiness classification | no live call by default |
| browser policy | `core/context/browser*Policy.ts` | local fixture, public network, selector repair, external runner, evidence/redaction | no browser expansion in atlas route |
| command allowlist | `capabilityBoundaryProjection.ts`, sandbox enforcer | allowlisted run command vs blocked command | command policy should project reasons |
| MCP policy | `core/mcp/*`, tool lifecycle projection | local/external readiness, protocol/process/tool-is-error | local deterministic claim is separate from external readiness |

## Result Surface Inventory

| Result surface | Current owner | Responsibility |
|---|---|---|
| terminal truthfulness | `core/query/resultMapper.ts` | maps terminal plus coding result to success/stopped/error |
| query runtime display/persistence | `core/shell/sessionRuntime.ts` | renders query events and persists terminal/coding result fields |
| session status surface | `core/shell/sessionStateSurface.ts` | renders durable session/recovery status |
| turn boundaries | `core/shell/turnBoundarySurface.ts` | interactive turn start/end/fallback lines |
| tool lifecycle | `core/tools/toolLifecycleProjection.ts` | projects tool/MCP/approval/environment failure classes |
| edit/browser evidence | capability-specific projectors | creates capability evidence lines and report summaries |
| durable session status | `session/durableStatusProjection.ts` | maps terminal classification/session status to durable status |

## Duplicated or Divergent Semantics

1. Policy decisions are represented in several vocabularies: approval decision,
   workspace authority, browser policy, command allowlist, MCP failure class,
   provider opt-in.
2. Result truthfulness is centralized in `resultMapper.ts`, but capability
   branches still construct coding summaries independently.
3. Session durability previously embedded terminal classification projection
   inside `SessionManager.ts`; Route 136 extracted that pure projection.
4. CLI fallback rendering can say blocked/error/interrupted independently of
   terminal truthfulness; it must stay a display fallback, not a result source.

## Capability Lifecycle Gaps

| Stage | Gap |
|---|---|
| policy | no single normalized policy outcome contract |
| evidence | capability evidence lines are safe but not uniformly shaped |
| result mapping | coding summaries are not projected from one capability-result object |
| transcript | event vocabulary still mixes structured events and notes |
| eval/report | verifier report markers vary across gates |

## Safe Extraction Candidates

- policy reason normalizer that maps existing reason strings without changing
  decisions
- capability result summary projector consumed by result/session surfaces
- durable status projector, completed in Route 136
- MCP safe detail projector
- approval audit display projector

## Unsafe Areas

- changing approval, workspace, provider, browser, MCP, or command decisions
- changing `resultMapper.ts` classification without focused result-contract
  evidence
- treating dry-run, planning, permission-pending, denied, blocked, or skipped as
  write success
- making CLI display fallback authoritative over runtime result state
