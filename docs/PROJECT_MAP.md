# Project Map

Route: `docs/agent-routes/route201-project-map-freeze.md`

This is a read-only pre-refactor map of the current target repository. It records current behavior, boundaries, and evidence labels only. It does not define a roadmap.

## Project Purpose Today

The project is a private coding-agent control plane centered on `packages/ts-shell`. TypeScript owns CLI, session, orchestration, permission, provider readiness, read/context planning, edit/apply, verification, repair, result mapping, and harness surfaces. Rust remains the lower execution-plane direction, while current route evidence is mostly TypeScript-focused.

The current implementation is not a general autonomous coding agent. It is a bounded agent runtime with:

- deterministic read/context and plan-quality surfaces for explicit targets
- explicit no-write provider proposal and anchored smoke surfaces
- guarded selected-workspace edit/apply lanes
- result/session surfaces intended to avoid false success
- many deterministic and focused verification gates

The main system-level limitation is that the live end-to-end provider task loop is not closed: Route 199 has live provider-called exact-ready no-write evidence, while Route 200 remains stopped before provider call, apply, and verification.

## Main Capability Chains

### Read -> Context -> Plan

`runMvpIntegratedFlow.ts` builds prompt-level workflow intent and dispatches read/context planning. `readInspectModule.ts` re-exports read intent, target recovery, context packet, context graph, code graph, Agent Plan, Plan Quality, and harness trace helpers. `contextPacket.ts`, `contextDiscovery.ts`, `contextBudget.ts`, `contextGraph*.ts`, `codeGraph*.ts`, `taskLifecycle*.ts`, `analysis*.ts`, `agentPlan*.ts`, and `planQuality*.ts` provide deterministic, budgeted, redacted, no-write planning evidence.

Current evidence is mostly `focused-unit-tests` and deterministic gate evidence from `scripts/verify-context-planning.mjs`. It is useful and replay-safe, but not semantic/LSP-backed and not proven as broad repository understanding.

### Plan -> Provider Proposal -> Anchoring

Provider proposal readiness is gated by `realProviderProposalGate.ts`, `providerPromptAudit.ts`, `providerOutputValidator.ts`, `providerAnchorQuality.ts`, `providerProposalAnchors.ts`, `providerAnchorMatcher.ts`, `providerAnchorConflict.ts`, `providerAnchoredProposal.ts`, `providerAnchoringResult.ts`, and `realProviderProposalDryRun.ts`. These surfaces require lifecycle, analysis, plan quality, context packet, context graph, code graph, redaction, and explicit opt-in before provider dry-run. Provider output never grants mutation authority.

Route 199 has user-observed live `openai-compatible` provider-called evidence with exact-ready no-write output. Route 200 does not have live provider-called task-loop evidence.

### Proposal / Review -> Apply

Review and apply use `editProposalReview.ts`, `editProposalSelection.ts`, `editProposalApply.ts`, `proposalHunkSet*.ts`, `exactHunk*.ts`, `fencedEdit*.ts`, `targetSetEdit*.ts`, and `patchResult/workspaceWriteRoute.ts`. The strongest current edit path is explicit, selected-workspace, exact update. Candidate paths include single-file create and exactly-two-file update in bounded verifier cases. Multi-hunk exact proposal application exists through hunk-set route. Broad/fuzzy/AST/arbitrary mutation remains unsupported.

### Apply -> Verification -> Repair

Verification planning and execution are split between in-loop low-risk verification in `runMvpIntegratedFlow.ts`, `verificationModule.ts`, `verificationCommandPlan.ts`, `verificationCommandRunner.ts`, `verificationCommandResult.ts`, `verificationFailureClassifier.ts`, and repair surfaces in `verificationRepair*.ts` plus `editRepair*.ts`. Verification command execution uses the existing tool runtime and does not mutate or call providers. Repair proposals are review-required and no-write until explicitly handed off to existing exact hunk-set apply.

### Result -> Session -> Continue

`resultMapper.ts` derives terminal truthfulness from coding results. `sessionRuntime.ts` streams query events, renders terminal state, and saves completed/error state. `SessionManager.ts` persists metadata, transcript, state, current-session selection, compact continuity, and recovery snapshots. `stoppedSessionContinuity.ts`, `compactContinuitySummary.ts`, `sessionStateSurface.ts`, and `continueShellActionRuntime.ts` preserve stopped reasons, changed/failed/planned files, write continuity, verification blockers, and `/continue` guidance.

## Main Modules

- Agent Loop: `runMvpIntegratedFlow.ts`, `MultiAgentOrchestrator.ts`, `workflowTaskPlanner.ts`, `runtimeHandoffProjection.ts`
- CLI / UX: `cli.tsx`, `cliRuntimeModule.ts`, `cliSessionModule.ts`, `cliWorkspaceModule.ts`, `cliApprovalModule.ts`, `slashCommandRegistry.ts`
- Workspace / File Context: `workspaceFileContract.ts`, `workspaceTargetProjection.ts`, `readInspectModule.ts`, `contextPacket.ts`, `contextDiscovery.ts`, `contextBudget.ts`, `contextGraph*.ts`, `codeGraph*.ts`
- Analysis / Plan Quality: `taskIntent.ts`, `taskLifecycle*.ts`, `analysisBrief*.ts`, `agentPlan*.ts`, `planQuality*.ts`
- Provider / Model: `providerReadiness.ts`, `providerModule.ts`, `realProviderProposalGate.ts`, `realProviderProposalDryRun.ts`, `liveProviderSmokeResult.ts`, provider anchor modules
- Edit / Patch: `editPatchModule.ts`, `fencedEditRoute.ts`, `targetSetEditRoute.ts`, `proposalHunkSetRoute.ts`, `editProposalApply.ts`, `patchResult/workspaceWriteRoute.ts`, `patchResult/workspaceAuthority.ts`
- Verification / Repair: `verificationModule.ts`, `verificationCommand*.ts`, `verificationRepair*.ts`, `editRepair*.ts`
- Result Surface: `resultMapper.ts`, `resultSurfaceModule.ts`, `sessionTerminalState.ts`, `sessionStateSurface.ts`
- Session / Continue: `SessionManager.ts`, `stoppedSessionContinuity.ts`, `compactContinuitySummary.ts`, `continueShellActionRuntime.ts`
- Harness / Eval: `scripts/verify-context-planning.mjs`, `scripts/verify-result-contract.mjs`, `scripts/verify-release-deterministic.mjs`, `scripts/verify-real-provider-anchored-smoke.mjs`, `scripts/verify-real-provider-task-loop-mvp.mjs`, `scripts/verify/index.mjs`
- Browser: `browserModule.ts`, browser runtime/policy/transaction modules under `core/context`
- MCP: `core/mcp/*`, especially `errorTaxonomy.ts` and `gateway.ts`

## Current Evidence State

- Live provider-called: Route 199 user-observed `openai-compatible` anchored provider smoke succeeded with `provider-called=true`, `adapter-approved=true`, `output-validation=valid-exact-single-target`, `anchor-quality=exact-ready`, `no-write=true`, `mutation-authority=not-granted`, raw provider output excluded.
- Live provider no-write / stopped: Route 200 user-observed live task-loop run still reported `provider-called=false`, `anchor-quality=none`, `apply=not-run`, `verification=not-run`, `mutation-scope=none`, `status=task-loop-stopped`.
- Fake/default-safe: deterministic fake provider and default safe-skip gates cover many provider, proposal, edit, MCP, result, and session states.
- Scaffold-only/not-proven: broad release, arbitrary project mutation, external/user-configured MCP readiness, browser live public-web readiness, semantic code understanding, broad/fuzzy apply, rollback automation, and live provider task-loop apply/verification.

## Route 199 vs Route 200

Route 199 proves the approved live provider boundary can call an `openai-compatible` provider and receive a valid exact single-target proposal without granting write authority. Its output is no-write and raw provider output is excluded.

Route 200 does not prove a live task-loop success. Its current observed state is stopped before provider call, before anchoring quality, before apply, and before verification. It must be recorded as `provider-called=false`, `apply=not-run`, `verification=not-run`, `mutation-scope=none`, `status=task-loop-stopped`.

## Major Defects

- `runMvpIntegratedFlow.ts` is still the central composition root and contains intent parsing, routing, provider activation, edit execution, verification, recovery, and result construction.
- `SessionManager.ts` remains a large persistence and continuity composition root.
- `cli.tsx` still carries substantial entrypoint, slash, approval, session, MCP, and interactive loop wiring.
- Evidence can be confused across live, fake, default-safe, scaffold-only, and focused-test categories unless mapped explicitly.
- Real provider anchored smoke and real provider task-loop smoke have different closure levels; treating both as live success would be false.
- Read/context and plan-quality surfaces are deterministic and useful, but they are not broad semantic code understanding.
- Some direct mutation behavior still exists inside `runMvpIntegratedFlow.ts` alongside newer bounded edit routes.
