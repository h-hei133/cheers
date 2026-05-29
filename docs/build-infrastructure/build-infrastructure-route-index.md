# Build Infrastructure Route Index

Status: updated by BI017 closeout.
Date: 2026-05-29.

This index records the BI001 to BI017 build-infrastructure sequence. BI017 closes
the initial infrastructure phase and recommends moving next to real product
feature work.

## Completed Sequence

| Route | Status | Type | Owner domains | Primary current files or docs |
|---|---|---|---|---|
| BI001: Pi-inspired architecture planning | Complete | Docs/planning | docs, architecture planning | `bi001-planning-summary.md`, `pi-pattern-adoption-matrix.md`, `local-architecture-gap-analysis.md`, `build-infrastructure-roadmap.md` |
| BI002: Runtime turn snapshot and save point | Complete | Product infrastructure | `turn`, `runtime`, `evidence`, `session`, `result` | `turn/turnSnapshot.ts`, `runtime/runtimePhase.ts`, `evidence/runtimeSavePoint.ts` |
| BI003: Execution receipt and tool details | Complete | Product infrastructure | `runtime/execution`, `tools`, `evidence`, `result`, `session` | `runtime/execution/executionReceipt.ts`, `tools/resultSplit.ts` |
| BI004: Session tree projection and event stream | Complete | Projection infrastructure | `session`, `runtime/events`, `runtime`, `result`, `core/shell` | `session/sessionTreeProjection.ts`, `runtime/events/runtimeEventProjection.ts` |
| BI005: Static resource contract experiment | Complete | Metadata infrastructure | `runtime/resources`, `provider`, `runtime/events`, `core/shell` | `runtime/resources/staticResourceDescriptor.ts`, `runtime/resources/staticResourceProjection.ts` |
| BI006: Pi deep audit and next directions | Complete | Docs/audit | docs, architecture planning | `bi006-deep-audit-summary.md`, `pi-deep-audit-uncovered-patterns.md`, `pi-next-direction-map.md` |
| BI007: Extension lifecycle and hook boundary | Complete | Contract infrastructure | `runtime/extensions`, `runtime/resources`, `policy`, `tools`, `provider` | `runtime/extensions/lifecycle.ts` |
| BI008: Session branch, compaction, context rebuild | Complete | Projection infrastructure | `session`, `context`, `evidence`, `result` | `session/sessionTreeProjection.ts`, `context/sessionContextRebuildProjection.ts` |
| BI009: Runtime API and JSON event stream | Complete | Host-boundary infrastructure | `runtime/events`, `runtime`, `session`, `result`, `core/shell` | `runtime/events/jsonEventStream.ts`, runtime event projections |
| BI010: Agent loop reference implementation | Complete | Loop contract infrastructure | `runtime/loop`, `runtime`, `turn`, `tools`, `session`, `context`, `evidence`, `result` | `runtime/loop/agentLoopContract.ts` |
| BI011: Provider model registry and compatibility | Complete | Metadata infrastructure | `provider`, `runtime/resources`, `core/shell`, `result`, `evidence` | `provider/providerRegistry.ts`, `core/shell/providerReadiness.ts` |
| BI012: Product naming and origin cleanup | Complete | Cleanup/audit | product owner domains touched by cleanup | `product-naming-origin-audit.md` |
| BI013: Tool hook permission interception | Complete | Policy infrastructure | `tools`, `policy`, `runtime/execution`, `evidence`, `result` | `tools/interception.ts` |
| BI014: Package resource governance | Complete | Metadata governance | `runtime/resources`, `policy`, `provider` | `runtime/resources/packageInventory.ts` |
| BI015: Product surface message rendering boundary | Complete | Presentation infrastructure | `presentation`, `runtime/events`, `session`, `provider`, `tools`, `runtime/resources`, `evidence`, `result`, `core/shell` | `presentation/productSurface.ts`, `presentation/terminalMessageRenderer.ts`, `core/shell/cliSessionProductSurface.ts` |
| BI016: Agent loop integration spine | Complete | Loop integration infrastructure | `runtime/loop`, `runtime/events`, `presentation`, referenced owner projections | `runtime/loop/infrastructureMap.ts`, `runtime/loop/trajectoryProjection.ts` |
| BI017: Build infrastructure closeout and roadmap | Complete | Docs/closeout | docs | `build-infrastructure-closeout-summary.md`, `agent-loop-infrastructure-connection-map.md`, `build-infrastructure-owner-domain-map.md`, `build-infrastructure-deferred-patterns.md`, `build-infrastructure-next-product-roadmap.md` |

## Current Infrastructure Layers

1. Planning and architecture guardrails.
2. Turn snapshots, runtime phases, and evidence-only save points.
3. Execution receipts and tool result details.
4. Session active-path projection and host-neutral runtime events.
5. Static resource/provider/package metadata.
6. Extension lifecycle and hook policy contracts.
7. Branch/compaction/context projections.
8. JSON event stream and host-neutral event boundary.
9. Agent loop contract and BI016 loop integration spine.
10. Provider/model registry metadata.
11. Tool interception policy.
12. Product surface rendering boundary.

## Compatibility And History Notes

- `runMvpIntegratedFlow` remains a legacy compatibility surface and should stay
  delegate-only.
- Historical route verifier scripts and route-history package commands are
  compatibility/history surfaces.
- Route-numbered or process-word names should not be added to new product code.
- Product code should remain owner-domain-first.

## Deliberately Deferred

- real provider streaming
- real product tool batch execution
- full product loop replacement
- SDK/RPC server
- TUI and renderer plugins
- dynamic extension execution
- package installation/loading/dynamic discovery
- session storage migration
- storage-backed branching and compaction
- provider request hooks and auth refresh
- parallel tool execution
- per-file mutation queue

## Recommended Next Route

Next route should be a real product feature route:

`Real CLI Coding Loop Integration`

It should consume the agent loop spine, provider registry, tool interception,
execution receipts, session projection, product surface, and evidence/result
truthfulness. It should not add another broad infrastructure layer unless a
specific product blocker proves one is missing.
