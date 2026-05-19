# Capability Contract Architecture

Route: `docs/agent-routes/route131-module-atlas.md`

This document defines the lifecycle contract future capabilities should follow. It is responsibility-based, not folder-based.

## Executive Summary

Every major capability should expose the same lifecycle vocabulary:

```text
availability
-> policy
-> planning
-> execution
-> observation
-> evidence
-> result mapping
-> transcript
-> continue / replay
-> eval
-> report
-> cleanup
-> redaction
```

Capabilities may skip stages only by making the skip explicit. A skipped stage is different from a missing stage. For example, a no-write planning route can have planning, evidence, result mapping, transcript, and report, while execution is explicitly skipped.

## Contract Stages

| Stage | Owner | Required Output | Failure Must Say |
|---|---|---|---|
| availability | Capability module | ready / unavailable / degraded plus reason | missing dependency, unsupported provider, unavailable runtime, hidden config |
| policy | Permission / Policy Engineering | allowed / denied / ask / blocked | trust boundary, user denial, allowlist miss, workspace/MCP/browser policy |
| planning | Capability module or Agent Loop | plan, target, confidence, planned files/actions | ambiguity, unsupported shape, low confidence, missing target |
| execution | Tool / Runtime / Capability | execution receipt, exit status, mutation receipt, tool metadata | timeout, cancelled, process failure, route failure, write failure |
| observation | Capability module | observed state after execution | unavailable observation, stale read, browser target missing |
| evidence | Capability module | stable evidence lines/objects safe for transcript | missing proof, unredacted detail, incomplete verification |
| result mapping | Result Surface Engineering | success/stopped/error classification | false success risk, partial failure, blocked verification |
| transcript | Session / Continue Engineering | durable event/message summary | missing next-turn context, unsafe secret |
| continue / replay | Session / Continue Engineering | reentry snapshot, planned next action | unreplayable state, stale project binding |
| eval | Harness / Eval Engineering | scorer outcome and reason | unscored capability, proxy-only gate |
| report | Harness / Result Surface | human-readable summary and machine markers | missing changed/failed/planned files, unclear next action |
| cleanup | Runtime / Harness / Capability | cleanup status and residue policy | leaked process, dirty fixture, audit residue |
| redaction | Capability / Harness / Result | redaction status and safe details | key/token/path leak, raw DOM leak, provider config leak |

## Data Shape Expectations

Each capability should be able to project a stable result object:

```ts
interface CapabilityLifecycleResult {
  capability: string;
  status: "success" | "stopped" | "error" | "skipped";
  availability?: {
    status: "ready" | "unavailable" | "degraded";
    reason?: string;
  };
  policy?: {
    status: "allowed" | "denied" | "ask" | "blocked";
    reason?: string;
  };
  planning?: {
    status: "planned" | "ambiguous" | "unsupported" | "not-needed";
    plannedFiles?: readonly string[];
    plannedActions?: readonly string[];
    confidence?: "high" | "medium" | "low";
    reason?: string;
  };
  execution?: {
    status: "executed" | "skipped" | "failed" | "cancelled" | "timeout";
    receiptId?: string;
    changedFiles?: readonly string[];
    failedFiles?: readonly { path: string; reason: string }[];
    reason?: string;
  };
  observation?: {
    status: "observed" | "unavailable" | "not-needed";
    summary?: string;
  };
  evidence: readonly string[];
  result: {
    terminalReason: "completed" | "stopped_error" | "error";
    terminalClassification: "success" | "stopped" | "error";
    reason?: string;
    nextAction?: string;
  };
  cleanup?: {
    status: "clean" | "residue" | "not-started" | "failed";
    detail?: string;
  };
  redaction?: {
    status: "clean" | "redacted" | "failed";
    detail?: string;
  };
}
```

This is a target shape for architecture alignment, not a current code mandate.

## Redaction Rules

- Do not include API keys, tokens, Authorization headers, cookies, provider env values, private provider config paths, or raw secret-bearing config.
- Real provider home must remain a credential source only for opt-in gates.
- Browser evidence must not leak raw DOM chunks, typed secrets, hidden inputs, cookies, storage, or full screenshots unless an explicit safe artifact policy exists.
- MCP errors should use safe detail strings like `mcpSafeDetail`; raw process/env dumps are not evidence.
- Harness reports should assert redaction markers when they claim real-provider or browser safety.

## Evidence Rules

Evidence must be stable, minimal, and safe:

- Prefer reason codes over prose-only failure.
- Include enough context for next-turn recovery: target, blocker, planned files/actions, changed files, failed files, verification status.
- Distinguish planned files from changed files.
- Distinguish skipped/no-write from failed write.
- Distinguish provider/network/config failures from product-route failures.
- Distinguish local deterministic MCP from external/user-configured MCP.

## Result Mapping Rules

Result mapping owns user-visible truthfulness:

- No partial/unverified mutation should become a plain success.
- Unsupported shape should become stopped/error with next action, not a fake completion.
- Approval denied should be stopped and recoverable where possible.
- MCP unavailable, tool-is-error, protocol failure, and process failure should stay distinguishable.
- Browser policy blocked and browser unavailable should not look like agent refusal.
- Verification blocked is different from verification failed.

Current evidence:

- `packages/ts-shell/src/core/query/resultMapper.ts` derives truthful terminal state from coding results.
- `packages/ts-shell/src/core/shell/sessionRuntime.ts` carries terminal status, stop reason, coding result, and continuation reason.
- `packages/ts-shell/src/core/shell/sessionStateSurface.ts` renders durable status and recoverability.

## Transcript / Continue Rules

Transcript and continuation should preserve:

- user prompt barrier
- terminal classification and reason
- changed files
- failed files
- planned files
- approval memory
- tool lifecycle facts
- verification lineage
- project binding
- compact handoff summaries

They must not invent success. A planned/no-write route must remain planned/no-write after compact and `/continue`.

Current evidence:

- `packages/ts-shell/src/session/SessionManager.ts` owns directory-backed metadata, transcript, and state.
- `packages/ts-shell/src/session/stoppedSessionContinuity.ts` projects stopped-session continuity.
- `packages/ts-shell/src/session/compactContinuitySummary.ts` isolates compact summary construction.
- `packages/ts-shell/src/session/mutationContinuityState.ts` and related tests preserve mutation continuity.

## Eval / Report Rules

Harness and eval should not be the source of product behavior. They should:

- invoke real or deterministic product paths where possible
- emit machine-readable markers
- classify failure source
- verify output contracts, not just exit code
- preserve dirty repo and residue guards
- keep real-provider execution opt-in
- keep local deterministic fixtures labeled as local deterministic

Current evidence:

- `scripts/verify-release-deterministic.mjs` asserts deterministic markers including real-provider skip and broad release false.
- `scripts/verify-real-user-capabilities.mjs` is a broad verifier and currently a maintainability risk.
- `packages/ts-shell/src/core/harness/browserTxnEval.ts` validates browser transaction traces, cleanup, redaction, and score outcomes.

## Cleanup Rules

- Runtime capabilities should emit cleanup status.
- Verification scripts should remove or report created audit/history/temp residue.
- Browser runtime should close page/context/browser and report cleanup status.
- Mutation routes should preserve no-partial-apply semantics where claimed.
- Real-provider gates should use isolated HOME/USERPROFILE/test roots.

## Capability Examples

### Browser

| Stage | Current Surfaces | Desired Contract |
|---|---|---|
| availability | `pwRuntime.ts`, browser runtime status | ready/unavailable with executable/runtime reason |
| policy | `browserToolPolicy.ts`, `browserExecutionPolicy.ts`, network/origin policy files | local/public/external policy decision |
| planning | `browserAgent.ts`, `browserPlan.ts` | transaction/actions with confidence |
| execution | `browserTxn.ts`, `browserActionLoopExecutor.ts`, adapter/runtime files | receipt with action summaries |
| observation | accessibility snapshots, DOM snapshots, observation evidence | structured safe observation |
| evidence | `browserTxnEvidence.ts`, `browserTrace.ts`, evidence redactors | trace id, cleanup, redaction status |
| result mapping | `runMvpIntegratedFlow.ts` currently wires browser result into orchestration | projection should be browser-owned then generic |
| transcript/continue | browser continuation evidence in continuity state | next-turn browser evidence without raw DOM leak |
| eval/report | `browserTxnEval.ts`, browser benchmark runner/report | scored deterministic reports |

### Edit / Patch

| Stage | Current Surfaces | Desired Contract |
|---|---|---|
| availability | bounded patch candidate classifiers | supported shape or unsupported reason |
| policy | workspace authority, guarded write gate, permission UX contracts | explicit opt-in and workspace authority |
| planning | no-write runtime routes, multi-file planning result | planned files separated from changed files |
| execution | `singleFileUpdateApply.ts`, create/delete/move/multi-file apply files | execution receipt by supported bounded lane |
| observation | read verified file, post-write verification | stale/unverified/partial classification |
| evidence | patch result projections and failure states | changed/failed/planned files plus reason |
| result mapping | result mapper and runtime outcome projections | no false success |
| transcript/continue | mutation continuity and compact continuity | stopped follow-up context |
| eval/report | real-user capability verifier, route evidence commands | split script modules and stable markers |

### Shell

| Stage | Current Surfaces | Desired Contract |
|---|---|---|
| availability | daemon availability, local execution fallback | rust/local runtime status |
| policy | sandbox enforcer, command allowlist, process permission | allow/deny/ask/preflight |
| planning | command intent projections and low-risk verification planning | command target and risk |
| execution | tool registry local command / rust daemon path | stdout/stderr/exit/status |
| observation | command output | bounded output summary |
| evidence | tool lifecycle projection | execution path and failure kind |
| result mapping | shell result assembly/runtime outcome | terminal classification |

### File Context

| Stage | Current Surfaces | Desired Contract |
|---|---|---|
| availability | file read tool, workspace root binding | readable target and root |
| policy | path permission/workspace authority | workspace-safe read/write scope |
| planning | target resolution, file constraints | target path and ambiguity |
| execution | read/list/search tool registry | observation-only receipt |
| evidence | file constraint assertions | exact source evidence |
| continue | session replay/context builders | reusable context without stale overclaim |

### Memory / Continuation

| Stage | Current Surfaces | Desired Contract |
|---|---|---|
| availability | project memory stores, compact checkpoint stores | memory store status |
| policy | permission memory codecs, project binding | safe retention boundary |
| planning | compact retention planner, future-turn injection planners | what is retained/injected |
| execution | SessionManager state/transcript writes | durable write receipt |
| observation | reentry summaries and snapshots | replay readiness |
| evidence | continuity summary lines | source of resumed facts |
| result mapping | session state surface | recoverability truthfulness |

### Provider / Model

| Stage | Current Surfaces | Desired Contract |
|---|---|---|
| availability | provider readiness and credential resolution | config/auth/network/model taxonomy |
| policy | real-provider opt-in, provider home boundary | default skip vs explicit opt-in |
| planning | model/provider selection | provider identity and model target |
| execution | model adapter/provider call | provider outcome with classification |
| observation | provider response/tool calls | safe response metadata |
| evidence | provider outcome projection and readiness scripts | no secret-bearing logs |
| result mapping | terminal provider failure surface | config/network/model-output separation |

## Current Alignment Summary

| Capability | Alignment | Main Gap |
|---|---|---|
| Browser | Medium-high for deterministic local flows | Browser logic is spread across context, harness, orchestration, scripts. |
| Edit / patch | High for bounded safety, medium for broader capability | No rollback/atomicity; verifier script too large. |
| Shell | Medium | Tool execution, permission, runtime, and result projection still cross layers. |
| File context | Medium | Target resolution and workspace authority exist, but file context is not unified as a module. |
| Memory / continuation | Medium-high | SessionManager remains oversized; long real-provider continuity is less proven. |
| Provider / model | Medium | Readiness taxonomy exists, but provider/model lifecycle is not a full module contract. |
| MCP | Medium for local deterministic; low for external | External/user-configured MCP is not claimed ready. |

## Future Contract Rule

No new capability should be accepted as "ready" unless its route states:

- which lifecycle stages are implemented
- which stages are intentionally skipped
- which module owns each stage
- what evidence proves it
- what cannot be claimed yet
