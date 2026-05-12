# Architecture Maintainability Extraction Plan

## 1. Executive summary

Route 15 is a planning-only architecture maintainability route. It audits the three current large-file risk centers and defines route-sized extraction work that can be implemented later without changing product behavior, capabilities, default gates, provider behavior, MCP behavior, or real-provider opt-in boundaries.

The three files are:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts` at about 12,703 lines.
- `packages/ts-shell/src/session/SessionManager.ts` at about 5,857 lines.
- `scripts/verify-real-user-capabilities.mjs` at about 12,352 lines.

The recommended first implementation route is: extract the real-user capability verifier's candidate mutation scenario registry and selection/report planning into focused script modules. This gives the highest maintainability return with the lowest runtime risk because it is outside product runtime, has strong deterministic gates, and directly continues the already-started verifier decomposition without adding mutation capability.

## 2. Why architecture maintainability is now the priority

The project has accumulated deterministic evidence for the current candidate write boundaries, session continuity, MCP local execution, result contracts, and release-core behavior. Recent closeout docs and package scripts show that release-readiness is now mostly gated by focused checks instead of only ad hoc manual smoke runs.

The remaining risk is architectural concentration. Important responsibilities still live in a few very large files:

- Runtime orchestration, provider handling, tool execution, mutation routing, result projection, and session handoff still meet inside `runMvpIntegratedFlow.ts`.
- Session persistence, replay, compacting, current-session binding, stopped continuity, permission/mutation continuity, and recovery trust boundaries still meet inside `SessionManager.ts`.
- CLI parsing, real-provider opt-in, provider config redaction, scenario registry, scenario execution, taxonomy classification, report writing, and route-specific verifiers still meet inside `verify-real-user-capabilities.mjs`.

These files are now risky because future routes must edit them even when the route only owns one responsibility. That increases regression probability, makes review slower, and makes it easier to accidentally blend planning-only, synthetic, and real-provider claims.

## 3. Current evidence baseline

Evidence read in the target repository:

- `PROJECT_STATE.md` records that deterministic release metadata, long-session durability, local MCP execution, candidate mutation suite tiering, and bounded real-provider opt-in gates are already established.
- `RUNBOOK.md` describes current deterministic and real-provider command classes, including `verify:release:deterministic`, `verify:release:core`, `verify:mcp:local-execution`, `verify:session-durability:long`, and candidate mutation gates.
- `docs/audits/routes-01-12-closeout.md` records route closeout boundaries and explicitly keeps broad real-provider, external MCP, broad apply_patch, rollback, delete/move, and 3+ file write claims out of scope.
- `docs/design/three-file-planning-no-write-evaluation.md` defines the bounded 3-file planning/no-write surface and preserves no-write, no MCP, no provider, and no release-claim expansion.
- `package.json` exposes the deterministic verification commands required by this route.
- `scripts/verify-release-core.mjs` and `scripts/verify-release-deterministic.mjs` show the current release gate layering. The deterministic gate asserts `realProviderTouched=false`, `candidateMutationRealExecuted=false`, `externalMcpServerUsed=false`, and `realProviderOptInEnvCleared=true`.

Baseline line counts observed during Route 15 preflight:

| File | Approx. lines | Maintainability risk |
| --- | ---: | --- |
| `runMvpIntegratedFlow.ts` | 12,703 | Runtime orchestration and policy/projection are too coupled. |
| `SessionManager.ts` | 5,857 | Session substrate and continuity policy are too coupled. |
| `verify-real-user-capabilities.mjs` | 12,352 | Validation command dispatch, scenario data, real-provider guard, and reporting are too coupled. |

## 4. Reference comparison summary

Search terms used for Claude Code:

`query loop`, `orchestration`, `session compact`, `resume`, `transcript`, `tool result`, `failed tool result`, `file edit`, `read first`, `stale edit`, `permission`, `result projection`, `verification`, `scenario`, `reporter`.

Claude Code snippets inspected:

- `/home/wang/projects/source-claudecode/query.ts`: query loop state is explicit, dependencies are injectable, compact/microcompact/autocompact are called as separate services, and tool execution is represented as stream events rather than hidden success.
- `/home/wang/projects/source-claudecode/hooks/toolPermission/PermissionContext.ts`: permission handling has a generic queue interface, resolves races with a `ResolveOnce` guard, separates hook/user/classifier decisions, and centralizes permission decision logging.
- `/home/wang/projects/source-claudecode/entrypoints/sdk/coreSchemas.ts`: hook and session events carry structured schema fields such as session start source, stop failure, transcript path avoidance, and compact hooks.

Useful Claude Code lessons:

- Keep the query loop as the coordinator of services, not the owner of every policy.
- Make compact/resume boundaries explicit events or structured inputs instead of implicit transcript scraping.
- Keep permission decision source, decision result, and logging distinct.
- Prefer injected dependencies for query-loop subservices so tests can validate state transitions without driving a full provider path.

Rejected Claude Code ideas:

- Do not copy Claude Code's full query loop or transcript model. This project has a narrower TypeScript/Rust/contracts split and different runtime goals.
- Do not adopt its full hook, agent, or permission subsystem. Route 15 is maintainability planning only and cannot change product behavior.
- Do not introduce large feature-flagged compact systems or background memory services as part of extraction.

Search terms used for opencode:

`tool execution`, `permission`, `permission denied`, `apply_patch`, `patch parse`, `patch apply`, `multiedit`, `snapshot`, `revert`, `session output`, `tool result`, `error metadata`, `scenario`, `test fixture`, `verification`.

opencode snippets inspected:

- `/home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts`: parse, validate, permission metadata, and application are distinct phases inside the tool, with permission metadata built before write.
- `/home/wang/projects/opencode/packages/opencode/src/session/processor.ts`: tool call/result/error, step start/finish, snapshot patch emission, and compaction need are emitted as separate session parts/events.
- `/home/wang/projects/opencode/packages/opencode/script/httpapi-exercise.ts`: scenario selection, seeded fixture context, execution, comparison, result printing, and cleanup are separate functions.

Useful opencode lessons:

- Separate scenario registry, fixture context, execution, result classification, and printing in verifier-like scripts.
- Keep tool permission and tool result metadata distinct from mutation application.
- Snapshot/revert can be useful in a broader product, but it is not this route's scope.

Rejected opencode ideas:

- Do not copy opencode's broad apply_patch implementation. This project intentionally has narrower write lanes and no broad apply_patch support.
- Do not add rollback, snapshot, delete, move, or arbitrary multi-edit behavior.
- Do not claim external/user-configured MCP or broad tool ecosystem readiness.
- Do not copy architecture wholesale; only the separation principles inform the route sequence.

No reference implementation code was copied into this repository.

## 5. The three large files and their current responsibilities

### `runMvpIntegratedFlow.ts`

Current responsibilities:

- Entrypoint orchestration for a prompt turn.
- Runtime seed and continuity-state interpretation.
- Provider mode resolution and real-provider adapter construction.
- Synthetic provider response construction.
- MCP snapshot and tool availability wiring.
- Tool execution and command intent detection.
- Permission and escalation decision handling.
- Apply-patch runtime route invocation.
- Mutation planning and execution handoff.
- Mutation result projection into `OrchestrationResult`.
- Failure, stopped, and success terminal classification.
- `doNext`, evidence, verification, and actionable blocker shaping.
- Session handoff fields for compact/continuity and `/continue`.
- Shell/runtime result expectations.

Why this is risky:

- A route that only changes result projection, provider call handling, or mutation handoff still edits a file that also owns query flow and tool behavior.
- Failure states can drift between runtime result, session continuity, and shell surface if projection logic remains embedded in the main loop.
- Provider-facing and mutation-facing logic share locality, which increases the chance of accidental real-provider or default-gate claim drift.

### `SessionManager.ts`

Current responsibilities:

- Session directory layout and path construction.
- Session creation, loading, resuming, and current-session selection.
- Project root binding and project-scoped current-session store.
- Transcript append/read and transcript repair.
- State snapshot persistence and state locking.
- Recovery trust boundary and resume eligibility.
- Replay plan preparation.
- Compact threshold/retention behavior and compact summary persistence.
- Stopped-session continuity snapshots and prompt continuity formatting.
- Mutation compact continuity fields.
- Approval audit, permission request, tool provenance, and request-scope memory.
- Terminal persistence for success/stopped/error.
- Project context summaries and next-turn context.

Why this is risky:

- The class is both storage gateway and continuity policy owner.
- Adding or fixing one continuity field requires navigating session persistence, current-session selection, and recovery trust logic.
- Compact/replay behavior is harder to test independently because policy and filesystem are interleaved.

### `verify-real-user-capabilities.mjs`

Current responsibilities:

- CLI flag parsing and selection.
- Real-provider opt-in preparation and cleanup.
- Provider env loading and provider config resolution.
- Provider diagnostics and redaction patterns.
- Scenario registry for MVP, candidate, release, backlog, and real-provider cases.
- Candidate mutation suite selection/skipping.
- Synthetic fixture setup and permission setup.
- CLI turn execution and session transcript inspection.
- Scenario assertion and failure categorization.
- Candidate mutation taxonomy classification.
- Report writing and report metadata.
- Dry-run, list, and help output.
- Real readonly, real coding-flow, real apply_patch, guarded write, and candidate mutation smokes.
- Route-specific verifiers such as two-file CLI evidence and unsupported patch E2E.

Why this is risky:

- The main script is both command dispatcher and owner of several independent verifier domains.
- Real-provider opt-in config sits near synthetic scenario registry and report printing; this increases accidental disclosure and gate-drift risk.
- The candidate mutation route has already gained helper modules, but scenario selection, report writing, runner, and real-provider guard are still in the large file.

## 6. Existing extractions and what they solved

| Module | Covered responsibility | Status | Follow-up |
| --- | --- | --- | --- |
| `packages/ts-shell/src/orchestration/mutationRoutingProjection.ts` | Projects parsed apply_patch requests into no-write, create, workspace write, multi-file write, and planning route results. | Partial but useful. | Keep expanding only through route-sized mutation route seams, not ad hoc helpers. |
| `packages/ts-shell/src/orchestration/mutationExecution.ts` | Executes file mutation branches and summarizes partial failures. | Partial but useful. | Keep as mutation execution owner; avoid moving result/session projection into it. |
| `packages/ts-shell/src/orchestration/patchMutationLane.ts` | Legacy/single-file replace patch lane and failure formatting. | Complete enough for current legacy lane. | Do not broaden for apply_patch. |
| `packages/ts-shell/src/orchestration/patchResult/*` | Patch result contracts, workspace authority, guarded gates, dry-run, production route seams, terminal/session/result mapper seams. | Useful but fragmented. | Future routes should consolidate ownership boundaries, not add one-off seam files. |
| `packages/ts-shell/src/orchestration/patchApplication/*` | Low-level single-file create/update and two-file update application, no-partial contracts. | Useful and appropriately low-level. | Keep writer behavior here; do not move terminal/session policy into it. |
| `packages/ts-shell/src/session/compactContinuitySummary.ts` | Compact continuity summary builder. | Complete enough for the extracted summary builder. | Add a retention planner only if it owns the full compact-retention decision. |
| `packages/ts-shell/src/session/stoppedSessionContinuity.ts` | Stopped-session continuity derivation. | Useful. | Future stopped resume context should wrap this instead of duplicating fields in `SessionManager`. |
| `packages/ts-shell/src/session/replayPlanBuilder.ts` | Replay plan from snapshot. | Useful. | Expand toward a `sessionReplayBuilder` route if it can own all replay preparation. |
| `packages/ts-shell/src/session/currentSessionSelection.ts` | Current-session selection resolution. | Complete enough for selection policy. | Do not mix with project binding persistence unless route owns that seam. |
| `packages/ts-shell/src/core/mcp/errorTaxonomy.ts` | MCP error taxonomy. | Complete enough for local deterministic MCP gates. | Do not expand into external MCP readiness. |
| `scripts/real-user-capabilities/candidateMutationClassification.mjs` | Route 01/02 failure taxonomy and candidate mutation classification fixtures. | Useful and current. | Do not re-inline; future verifier routes should import this. |
| `scripts/real-user-capabilities/candidateMutationPatchShape.mjs` | Real candidate patch-shape classifiers for update/create/two-file update. | Useful and current. | Keep pure and side-effect free. |
| `scripts/verify-planned-files-continuity.mjs` | Planned-files continuity evidence. | Complete for current no-write planning claim. | Do not use to imply 3-file writes. |

## 7. Remaining responsibility clusters

Remaining clusters for `runMvpIntegratedFlow.ts`:

- Provider call outcome and synthetic/real model response shaping.
- Tool execution outcome and MCP/tool provenance projection.
- Mutation session handoff and continuity field construction.
- Terminal result assembly and shell/session result projection.
- Stopped/failure result projection and actionable `doNext` construction.
- Query-loop wiring that should remain after policy extraction.

Remaining clusters for `SessionManager.ts`:

- Session persistence gateway and filesystem path layout.
- Project binding/current-session store.
- Replay preparation and transcript repair.
- Compact retention planning and compact state persistence.
- Stopped resume context and next-turn prompt continuity.
- Mutation continuity state and approval/tool provenance memory.
- Recovery trust boundary.

Remaining clusters for `verify-real-user-capabilities.mjs`:

- Scenario registry and selection.
- Candidate mutation runner and per-case assertions.
- Report writer and output markers.
- Real-provider opt-in/env contract.
- Provider diagnostics and redaction.
- Route-specific verifier registry and command dispatch.
- Dry-run/list/help surface.

## 8. Target architecture principles

- `runMvpIntegratedFlow.ts` should be orchestration wiring. It may call provider, tool, mutation, projection, and session-handoff modules, but it should not own their policy details.
- `SessionManager.ts` should be the lifecycle coordinator and storage facade. Compact/replay/continuity policy should live in focused modules with explicit inputs and outputs.
- `verify-real-user-capabilities.mjs` should be CLI orchestration and high-level command dispatch. Scenario data, runners, guards, report writing, and taxonomy should live under `scripts/real-user-capabilities/`.
- Extraction routes must preserve behavior through existing gates before and after each change.
- Each extraction must move a complete responsibility or policy seam, not just reduce line count.
- No extraction may add mutation capability, broaden apply_patch, change default gates, touch provider/MCP core behavior, or read real-provider configuration outside explicit opt-in gates.

## 9. Proposed module decomposition for `runMvpIntegratedFlow.ts`

### `providerCallOutcomeProjection.ts`

- Responsibility: Convert provider call attempts, synthetic responses, real-provider adapter errors, fallback model behavior, and provider readiness failures into typed provider-call outcomes.
- Inputs: provider mode, provider config summary, model request, raw model response/error, abort state.
- Outputs: provider call outcome, provider status detail, safe diagnostics, evidence strings.
- Side effects: none.
- Forbidden responsibilities: network calls, provider config loading, mutation routing, session writes, shell rendering.
- Existing tests to reuse: `runMvpIntegratedFlow.test.ts`, `verify:result-contract`, provider readiness focused checks.
- New tests needed: synthetic success, provider config failure, provider network/auth-like failure, abort/fallback projection.
- Validation commands: `rtk npm run verify:result-contract`, `rtk npm run build -w packages/ts-shell`, `rtk npm run verify:release:deterministic`.
- Risk: medium, because provider result semantics are user-visible.
- Recommended route: Route 15.2 after verifier decomposition.

### `toolExecutionOutcomeProjection.ts`

- Responsibility: Project tool execution, MCP unavailable, MCP execution failure, approval denied, and generic tool failure into result/session-safe metadata.
- Inputs: tool lifecycle events, tool execution provenance, MCP error taxonomy result, approval decision summary.
- Outputs: typed tool outcome, terminal classification hints, continuity evidence.
- Side effects: none.
- Forbidden responsibilities: invoking tools, MCP client management, permission prompting, session persistence.
- Existing tests to reuse: `toolLifecycleProjection.ts` tests, `toolExecutionProvenance.ts` tests, `verify:mcp:local-execution`, `verify:mcp:error-taxonomy`.
- New tests needed: no false success for MCP `isError`, stdio throw, approval denied, unavailable tool, and generic tool execution failure.
- Validation commands: `rtk npm run verify:mcp:local-execution`, `rtk npm run verify:mcp:error-taxonomy`, `rtk npm run verify:result-contract`.
- Risk: medium-high, because failure truthfulness is core user surface.
- Recommended route: Route 15.4.

### `mutationSessionHandoff.ts`

- Responsibility: Build the mutation-related session handoff fields consumed by compact/continue from mutation results and verification state.
- Inputs: `OrchestrationResult` mutation fields, changed/failed/verified files, verification status, writer-started/write-effect metadata, approval provenance.
- Outputs: continuity handoff object and evidence.
- Side effects: none.
- Forbidden responsibilities: applying patches, selecting mutation route, writing session state directly, formatting shell output.
- Existing tests to reuse: `mutationRoutingProjection.test.ts`, `mutationCompactContinuity.test.ts`, `stoppedSessionContinuity.test.ts`, `verify:session-durability:long`.
- New tests needed: success, partial mutation failure, post-write verification failure, approval denied, no-write planning.
- Validation commands: `rtk npm run verify:session-durability:long`, `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`.
- Risk: high, because it touches `/continue` safety.
- Recommended route: Route 15.5.

### `shellResultAssembly.ts`

- Responsibility: Assemble final shell-facing `OrchestrationResult` from provider/tool/mutation projections and terminal state.
- Inputs: provider outcome, tool outcome, mutation projection, verification result, session id, prompt id.
- Outputs: final `OrchestrationResult` with status, final output, stop reason, terminal classification, evidence, `doNext`.
- Side effects: none.
- Forbidden responsibilities: provider calls, tool invocation, session writes, mutation writes.
- Existing tests to reuse: `resultMapper.ts` focused tests, `sessionRuntime.ts`, `sessionStateSurface.ts`, `verify:result-contract`.
- New tests needed: stopped vs error vs success mapping matrix and evidence preservation.
- Validation commands: `rtk npm run verify:result-contract`, `rtk npm run build -w packages/ts-shell`.
- Risk: high.
- Recommended route: Route 15.6.

### `stoppedOrFailureResultProjection.ts`

- Responsibility: Own stopped/error classification and actionable blocker mapping for runtime failures.
- Inputs: failure reason, verification failure, failed files, task reasons, evidence.
- Outputs: terminal classification, actionable blocker kind, safe next action.
- Side effects: none.
- Forbidden responsibilities: tool execution, patch application, session persistence.
- Existing tests to reuse: stopped continuity tests, result contract tests.
- New tests needed: stale-read, partial-mutation-failed, verification-blocked, tool/MCP unavailable, provider failure, unknown.
- Validation commands: `rtk npm run verify:result-contract`, `rtk npm run verify:session-durability:long`.
- Risk: medium-high.
- Recommended route: Route 15.6 or 15.7.

## 10. Proposed module decomposition for `SessionManager.ts`

### `sessionPersistenceGateway.ts`

- Responsibility: Filesystem paths, JSON read/write, transcript append/read, state lock, metadata/state serialization.
- Inputs: home directory, session id, metadata/state/transcript events.
- Outputs: read/write results and parse errors.
- Side effects: filesystem reads/writes under the session home.
- Forbidden responsibilities: deciding recoverability, compact policy, project binding policy, continuity formatting.
- Existing tests to reuse: `SessionManager.test.ts`, `longSessionDurability.test.ts`.
- New tests needed: corrupt state, missing metadata, state lock behavior, transcript append failures.
- Validation commands: `rtk npm run verify:session-durability:long`, `rtk npm run build -w packages/ts-shell`.
- Risk: high, because storage behavior is foundational.
- Recommended route: Route 15.7 only after projection extractions reduce concurrent risk.

### `sessionProjectBinding.ts`

- Responsibility: Normalize project roots, read/write current-session store, resolve selected/missing/mismatched current session.
- Inputs: project root, session id, current-session store JSON, session metadata resolver.
- Outputs: current-session selection resolution and store update.
- Side effects: current-session store read/write.
- Forbidden responsibilities: session creation, replay, compact, terminal persistence.
- Existing tests to reuse: `currentSessionSelection.ts` tests and `SessionManager.test.ts`.
- New tests needed: project mismatch, missing session, corrupt store, direct vs git-root mode.
- Validation commands: `rtk npm run verify:session-durability:long`, `rtk npm run build -w packages/ts-shell`.
- Risk: medium.
- Recommended route: Route 15.8.

### `sessionReplayBuilder.ts`

- Responsibility: Build replay preparation from transcript/state snapshots and decide what messages are replayed.
- Inputs: session metadata, transcript events, state snapshot, replay options.
- Outputs: replay plan, repair diagnostics, required seed messages.
- Side effects: none.
- Forbidden responsibilities: reading files, writing session state, compact retention, current-session selection.
- Existing tests to reuse: `replayPlanBuilder.ts`, `SessionManager.test.ts`, long-session durability process.
- New tests needed: transcript repair, missing assistant result, compacted state replay, stopped replay.
- Validation commands: `rtk npm run verify:session-durability:long`, `rtk npm run verify:result-contract`.
- Risk: high.
- Recommended route: Route 15.9.

### `compactRetentionPlanner.ts`

- Responsibility: Decide when to compact and what continuity facts must survive compaction.
- Inputs: turns, state snapshot, threshold config, prior compact metadata, mutation continuity snapshot.
- Outputs: compact decision, retained memory keys, summary inputs, evidence.
- Side effects: none.
- Forbidden responsibilities: writing compacted state, formatting prompt continuity, session filesystem.
- Existing tests to reuse: `compactContinuitySummary.test.ts`, `mutationCompactContinuity.test.ts`, `longSessionDurability.test.ts`.
- New tests needed: mutation success retention, partial failure retention, unrelated post-compact turn retention, threshold boundary.
- Validation commands: `rtk npm run verify:session-durability:long`, `rtk npm run verify:real-user-capabilities:planned-files-continuity`.
- Risk: high.
- Recommended route: Route 15.9 or later.

### `stoppedSessionResumeContext.ts`

- Responsibility: Convert stopped/error terminal state and continuity snapshot into `/continue` prompt context.
- Inputs: stopped continuity snapshot, actionable failure continuity, approval/tool provenance memory, project root.
- Outputs: resume context object and formatted prompt context.
- Side effects: none.
- Forbidden responsibilities: loading sessions, writing state, choosing current session.
- Existing tests to reuse: `stoppedSessionContinuity.test.ts`, `continuityFormatter.ts`, `longSessionDurability.test.ts`.
- New tests needed: writer-started unknown, approval denied, stale read, MCP unavailable, partial mutation failure.
- Validation commands: `rtk npm run verify:session-durability:long`, `rtk npm run verify:mcp:local-execution`.
- Risk: medium-high.
- Recommended route: Route 15.10.

### `mutationContinuityState.ts`

- Responsibility: Normalize mutation continuity fields from orchestration/session state into a stable state model.
- Inputs: `OrchestrationResult`, terminal persistence, existing working memory.
- Outputs: mutation continuity state with changed/failed/verified files, verification status, approval/tool provenance.
- Side effects: none.
- Forbidden responsibilities: compact formatting, patch application, session file writes.
- Existing tests to reuse: `mutationCompactContinuity.test.ts`, `longSessionDurability.test.ts`.
- New tests needed: two-file success, partial failure, no-write planning, create/update distinctions.
- Validation commands: `rtk npm run verify:session-durability:long`, `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`.
- Risk: high.
- Recommended route: pair with `mutationSessionHandoff.ts` or execute after it.

## 11. Proposed module decomposition for `verify-real-user-capabilities.mjs`

### `candidateMutationScenarioRegistry.mjs`

- Responsibility: Own candidate mutation scenario definitions, suite ids, real-case ids, selection/skipping, case metadata, and tier/suite planning report.
- Inputs: scenario definitions and selection options.
- Outputs: selected cases, skipped cases, plan metadata, case metadata.
- Side effects: none.
- Forbidden responsibilities: executing scenarios, reading provider env, writing reports, printing output.
- Existing tests to reuse: candidate mutation suite synthetic gate, dry-run suite plan, deterministic release gate.
- New tests needed: include-real false skips exactly three real cases, include-real true selects real cases, invalid suite/case behavior remains unchanged.
- Validation commands: `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`, `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run`, `rtk npm run verify:release:deterministic`.
- Risk: low-medium.
- Recommended route: first implementation route.

### `candidateMutationVerifierRunner.mjs`

- Responsibility: Execute selected candidate mutation scenarios and delegate real selected-workspace cases to their exact runner.
- Inputs: selected scenarios, suite options, run dependencies.
- Outputs: scenario results and suite real-case placeholders.
- Side effects: fixture setup, CLI subprocess execution, isolated test output.
- Forbidden responsibilities: scenario registry, provider env loading, report formatting, taxonomy rules.
- Existing tests to reuse: candidate mutation synthetic suite, Route 03/08 evidence gates, planned-files continuity gates.
- New tests needed: runner delegates real cases only when selected, preserves skipped real-case output, preserves result metadata.
- Validation commands: all candidate mutation gates and `rtk npm run verify:release:deterministic`.
- Risk: medium-high because it touches verifier execution flow.
- Recommended route: second verifier route after registry extraction.

### `candidateMutationReportWriter.mjs`

- Responsibility: Build and write JSON report payloads and stable suite output markers.
- Inputs: run metadata, selected/skipped cases, results, report path, failure metadata.
- Outputs: report object and printed marker lines.
- Side effects: writes report JSON and prints stable non-secret markers.
- Forbidden responsibilities: scenario execution, classification policy, provider env reads.
- Existing tests to reuse: candidate mutation suite, deterministic release output assertions.
- New tests needed: report shape for pass/fail/preflight failure, `realProviderTouched` false/true derivation, no secret/path leakage.
- Validation commands: `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`, `rtk npm run verify:release:deterministic`, `rtk git diff --check`.
- Risk: medium.
- Recommended route: third verifier route.

### `realProviderOptInGuard.mjs`

- Responsibility: Own explicit real-provider opt-in env contract for candidate mutation suite, approved provider env loading, config resolution, and safe cleanup.
- Inputs: process env, CLI selection state, default provider env path constant, test root.
- Outputs: real env contract, diagnostics, preflight status.
- Side effects: reads approved provider env only under explicit opt-in, writes isolated generated config home, mutates process env only for the explicit gate, cleanup under test root.
- Forbidden responsibilities: scenario execution, report writing, taxonomy classification, generic provider core behavior.
- Existing tests to reuse: provider readiness real classification self-test, candidate mutation include-real dry-run, deterministic release gate.
- New tests needed: no env load on dry-run/list/synthetic suite, generated home cleanup, unsupported provider/config failure classification.
- Validation commands: `rtk npm run verify:provider-readiness:real -- --classification-self-test`, `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run`, `rtk npm run verify:release:deterministic`.
- Risk: high because of real-provider secrecy boundaries.
- Recommended route: after report writer and runner have reduced main-script coupling.

### `realCapabilityRedaction.mjs`

- Responsibility: Centralize secret/config path redaction and non-disclosure assertions for verifier output.
- Inputs: raw output, allowed path prefixes, provider id.
- Outputs: redacted output, redaction assertion result.
- Side effects: none.
- Forbidden responsibilities: provider env loading, subprocess execution, report writing.
- Existing tests to reuse: real-provider readiness/classification self-tests and coding redaction helpers.
- New tests needed: provider config path, bearer token, key-value secret, OpenAI-style key, private real-home path, query-param secrets.
- Validation commands: provider readiness classification self-test and deterministic release gate.
- Risk: medium-high.
- Recommended route: after opt-in guard or paired with it only if route remains bounded.

### `routeVerifierRegistry.mjs`

- Responsibility: Map route-specific CLI flags to verifier handlers and keep main `main()` dispatch declarative.
- Inputs: parsed CLI flags and handler dependencies.
- Outputs: selected handler or none.
- Side effects: none in registry; handlers keep their existing side effects.
- Forbidden responsibilities: implementing verifier handlers, parsing provider env, writing report.
- Existing tests to reuse: all route-specific verifier commands.
- New tests needed: exactly one matching handler for each special flag and preserved priority order.
- Validation commands: full Route 15 required verifier list except real full execution.
- Risk: medium.
- Recommended route: later, after candidate mutation split stabilizes.

## 12. Cross-cutting invariants

- Real-provider execution remains explicit opt-in only.
- No script may print secrets, provider config, auth JSON, tokens, bearer headers, or files under `/home/wang/.private-agents-real`.
- Synthetic and dry-run gates must continue to print `realProviderTouched=false` and must not load real-provider config.
- MCP evidence remains local deterministic only unless a separate route explicitly changes that claim.
- Mutation boundaries remain: no broad apply_patch, no 3+ file write, no delete/move, no rollback/atomicity, no hidden write authorization from prompt text.
- Session continuity must not convert stopped/error states into success-like terminal states.
- Extraction must not use line count as the only success metric; moved responsibility must be testable.

## 13. What must not change

- No product runtime behavior changes in Route 15.
- No provider/auth core changes.
- No MCP core changes.
- No package script or default gate changes.
- No mutation capability expansion.
- No default real-provider gate.
- No external MCP readiness claim.
- No live TTY proof inflation.
- No broad rewrite of `runMvpIntegratedFlow.ts`, `SessionManager.ts`, or `verify-real-user-capabilities.mjs`.
- No moving code without focused tests.
- No copy/paste migration from reference repositories.

## 14. Route sequence: meaningful future implementation routes

### Route 15.1: candidate mutation scenario registry extraction

- Why now: verifier decomposition is lowest runtime risk and already has adjacent helper modules.
- Allowed files: `scripts/verify-real-user-capabilities.mjs`, `scripts/real-user-capabilities/candidateMutationScenarioRegistry.mjs`, focused tests only if local script-test style exists.
- Forbidden files: product runtime, provider core, MCP core, package scripts, default gates.
- Implementation entry point: move candidate mutation suite ids, case ids, scenario selection, skipped-case calculation, case metadata, and tier/suite plan building.
- Success criteria: main script imports registry helpers; candidate suite output and report metadata are unchanged; dry-run real cases remain skipped unless `--include-real`.
- Failure criteria: changed real-provider default behavior, changed suite markers, selected real cases in synthetic mode, or changed taxonomy.
- Validation commands: candidate mutation synthetic, include-real dry-run, taxonomy self-test, deterministic release, build if JS import syntax changes require it.
- Evidence strength: high for verifier behavior; low for product runtime because product runtime is intentionally untouched.
- Risk reduction: removes scenario registry and selection policy from the 12k-line verifier.

### Route 15.2: candidate mutation runner and report writer split

- Why now: once selection is extracted, execution and reporting can be separated without changing scenario definitions.
- Allowed files: main verifier script, `candidateMutationVerifierRunner.mjs`, `candidateMutationReportWriter.mjs`.
- Forbidden files: product runtime, provider core, MCP core, package scripts.
- Implementation entry point: extract selected-scenario execution loop, skipped real case emission, report object construction, and `writeReport` wrapper for candidate suite.
- Success criteria: identical report shape and output markers for candidate suite; deterministic release still asserts dry-run invariants.
- Failure criteria: secret/path leakage, missing report, changed `realProviderTouched` semantics, or changed status classification.
- Validation commands: candidate mutation synthetic, include-real dry-run, two-file CLI evidence, unsupported patch E2E, deterministic release.
- Evidence strength: high for script behavior.
- Risk reduction: isolates report/runner semantics from CLI dispatch and real-provider guard.

### Route 15.3: provider call outcome projection

- Why now: after script risk is reduced, runtime result truthfulness is the next high-value seam.
- Allowed files: `runMvpIntegratedFlow.ts`, `providerCallOutcomeProjection.ts`, focused tests.
- Forbidden files: provider core, auth config, MCP core, mutation capability files unless only imports are needed.
- Implementation entry point: extract pure provider outcome classification and diagnostics projection; leave actual provider calls in the main flow.
- Success criteria: no behavior change in provider success/failure paths; result contract remains green.
- Failure criteria: provider-network/config failures become success-like, real-provider default path changes, or diagnostics expose secrets.
- Validation commands: `verify:result-contract`, provider readiness classification self-test, build, deterministic release.
- Evidence strength: medium-high.
- Risk reduction: keeps provider failure semantics out of the main orchestration loop.

### Route 15.4: tool execution outcome projection

- Why now: MCP/tool failure truthfulness is already gate-backed and should stop depending on central orchestration edits.
- Allowed files: `runMvpIntegratedFlow.ts`, `toolExecutionOutcomeProjection.ts`, focused tool/MCP tests.
- Forbidden files: MCP core behavior, external MCP config, provider core, mutation capability limits.
- Implementation entry point: extract mapping from tool lifecycle/provenance/MCP taxonomy to runtime result and continuity evidence.
- Success criteria: MCP `isError`, stdio throw, approval denied, tool unavailable, and generic tool failures remain non-success.
- Failure criteria: external MCP readiness claim, changed MCP execution behavior, or missing continuity evidence.
- Validation commands: `verify:mcp:local-execution`, `verify:mcp:error-taxonomy`, `verify:result-contract`, build.
- Evidence strength: high for local MCP/tool surfaces.
- Risk reduction: narrows the main flow's ownership of tool failure truthfulness.

### Route 15.5: mutation session handoff and continuity state

- Why now: mutation write evidence and `/continue` safety are high-risk and currently span orchestration and session.
- Allowed files: `runMvpIntegratedFlow.ts`, `mutationSessionHandoff.ts`, `mutationContinuityState.ts`, focused session/orchestration tests.
- Forbidden files: patch application behavior, default gates, provider/MCP core.
- Implementation entry point: extract construction of mutation handoff and normalized mutation continuity state from existing result fields.
- Success criteria: two-file success, partial failure, planned-files no-write, and long-session durability preserve continuity.
- Failure criteria: stopped partial failures become success-like, planned no-write becomes write claim, or compact loses mutation facts.
- Validation commands: candidate mutation synthetic, planned-files continuity, long-session durability, result contract, build.
- Evidence strength: high but route risk is high.
- Risk reduction: makes future mutation/session changes avoid editing the entire main loop and session manager together.

### Route 15.6: shell result assembly and stopped/failure projection

- Why now: terminal truthfulness depends on consistent result/status/`doNext` assembly.
- Allowed files: `runMvpIntegratedFlow.ts`, `shellResultAssembly.ts`, `stoppedOrFailureResultProjection.ts`, result tests.
- Forbidden files: provider core, MCP core, patch writer behavior, session storage behavior.
- Implementation entry point: extract pure final `OrchestrationResult` assembly and stopped/error classification matrix.
- Success criteria: result contract, session runtime surface, and stopped continuity remain unchanged.
- Failure criteria: stopped/error status drift, evidence loss, or success-like failure rendering.
- Validation commands: `verify:result-contract`, `verify:session-durability:long`, candidate mutation synthetic, build.
- Evidence strength: high for user-visible result semantics.
- Risk reduction: localizes terminal semantics and prevents every runtime path from editing the main loop.

### Route 15.7: session persistence gateway

- Why now: after projection seams reduce churn, the session class can be split around storage safely.
- Allowed files: `SessionManager.ts`, `sessionPersistenceGateway.ts`, session tests.
- Forbidden files: runtime orchestration, provider/MCP behavior, mutation capability.
- Implementation entry point: extract session path construction, JSON reads/writes, transcript append/read, state lock, and serialization helpers.
- Success criteria: session durability and existing session tests pass without changed on-disk layout.
- Failure criteria: changed session file layout, lost transcripts, corrupt state silently treated as valid, or current-session mismatch.
- Validation commands: `verify:session-durability:long`, result contract, build.
- Evidence strength: high for session substrate.
- Risk reduction: turns `SessionManager` into a coordinator over storage instead of direct filesystem owner.

### Route 15.8: project binding and replay builder

- Why now: current-session selection and replay are separate policies but live beside storage code.
- Allowed files: `SessionManager.ts`, `sessionProjectBinding.ts`, `sessionReplayBuilder.ts`, existing tests.
- Forbidden files: CLI entrypoint, runtime orchestration, provider/MCP core.
- Implementation entry point: extract project binding store policy and replay preparation while preserving existing `currentSessionSelection.ts` and `replayPlanBuilder.ts`.
- Success criteria: `/continue`, explicit resume, corrupt/missing session, and project mismatch behavior remain unchanged.
- Failure criteria: wrong project resumes, replay drops required messages, or missing session becomes success.
- Validation commands: `verify:session-durability:long`, `verify:result-contract`, build.
- Evidence strength: medium-high.
- Risk reduction: decouples current-session policy and replay from storage mechanics.

### Route 15.9: compact retention planner and stopped resume context

- Why now: compact and stopped resume behavior are now important release-core surfaces and should be isolated.
- Allowed files: `SessionManager.ts`, `compactRetentionPlanner.ts`, `stoppedSessionResumeContext.ts`, session tests.
- Forbidden files: runtime provider/MCP behavior, patch writer behavior, default gates.
- Implementation entry point: extract compact retention decisions and stopped/error prompt continuity construction.
- Success criteria: compact summary, mutation compact continuity, long-session durability, MCP follow-up continuity, and planned-files continuity remain green.
- Failure criteria: compact drops mutation/provenance facts, stopped state becomes success-like, or resume prompt loses next action.
- Validation commands: long-session durability, planned-files continuity, MCP local execution, result contract, build.
- Evidence strength: high.
- Risk reduction: makes compact/resume policy testable without editing the whole session manager.

### Route 15.10: route verifier registry and real-provider opt-in guard

- Why now: after candidate mutation script behavior is modular, the remaining verifier risk is command dispatch and real-provider guard locality.
- Allowed files: main verifier script, `routeVerifierRegistry.mjs`, `realProviderOptInGuard.mjs`, `realCapabilityRedaction.mjs`.
- Forbidden files: package scripts, provider core, product runtime, default gates.
- Implementation entry point: extract special flag dispatch and real-provider env contract; keep full real execution opt-in only.
- Success criteria: dry-run/list/synthetic modes do not touch real provider; classification self-test remains green; no secret paths printed.
- Failure criteria: default real execution, printed provider config, dirty-repo guard drift, or changed real-provider suite semantics.
- Validation commands: provider-readiness classification self-test, include-real dry-run, deterministic release, candidate mutation synthetic.
- Evidence strength: high for opt-in guard behavior without full real run.
- Risk reduction: isolates the most safety-sensitive verifier behavior.

## 15. Recommended first implementation route

Route name: `Extract candidate mutation scenario registry`.

Allowed files:

- `scripts/verify-real-user-capabilities.mjs`
- `scripts/real-user-capabilities/candidateMutationScenarioRegistry.mjs`
- A focused test file only if the repository already has an adjacent script-test pattern; otherwise validate through existing gates.

Forbidden files:

- `packages/ts-shell/**`
- provider/auth core
- MCP core
- `package.json`
- default release gates
- mutation capability files

Implementation seam:

- Move candidate mutation suite constants, real-case ids, synthetic-case ids, `allCapabilityCases`, `caseMatchesTier`, `findCapabilityCaseById`, `caseMetadata`, selected/skipped suite helpers, tier/suite plan report construction, and future gate candidate metadata if it is only registry metadata.
- Keep scenario execution functions, provider env contract, report writing, and route-specific verifiers in the main script for this first step.

Expected modules:

- `scripts/real-user-capabilities/candidateMutationScenarioRegistry.mjs`

Tests and validation:

- `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`
- `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run`
- `rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test`
- `rtk npm run verify:release:deterministic`
- `rtk git diff --check`

Success criteria:

- Candidate synthetic suite still passes.
- Dry-run include-real lists/selects but does not execute real-provider cases and prints `realProviderTouched=false`.
- The three real selected-workspace case ids remain exactly:
  - `real-selected-workspace-single-file-update`
  - `real-selected-workspace-single-file-create`
  - `real-selected-workspace-two-file-update`
- No report shape drift, no taxonomy drift, no default gate drift.

Stop conditions:

- The extraction requires changing provider env loading, report writing, or scenario execution.
- The synthetic candidate suite changes output semantics.
- The dry-run touches real provider or requires reading real-provider config.
- The module would become a generic registry for unrelated route verifiers.

Why this is best first:

- It is the narrowest meaningful responsibility-sized extraction.
- It attacks one of the three giant files without touching product runtime.
- It uses the already-created `scripts/real-user-capabilities/` domain directory.
- It has strong existing deterministic validation and a dry-run real-suite guard.

## 16. Validation matrix

| Command | Why it matters | Expected route use |
| --- | --- | --- |
| `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation` | Candidate synthetic mutation suite and no real-provider touch. | Verifier registry/runner/report routes and mutation handoff routes. |
| `rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test` | Failure taxonomy stays stable. | Verifier classification/report routes. |
| `rtk npm run verify:real-user-capabilities:two-file-cli-evidence` | Two-file CLI evidence remains bounded. | Mutation runner/handoff routes. |
| `rtk npm run verify:real-user-capabilities:unsupported-patch-e2e` | Unsupported patch remains rejected and classified. | Mutation/result projection routes. |
| `rtk npm run verify:real-user-capabilities:three-file-planning-no-write` | 3-file planning remains no-write only. | Mutation/session continuity routes. |
| `rtk npm run verify:real-user-capabilities:planned-files-continuity` | Planned files survive stopped/no-write continuity. | Session compact/resume routes. |
| `rtk npm run verify:session-durability:long` | Compact/reload/continue durability stays intact. | Session and mutation continuity routes. |
| `rtk npm run verify:mcp:local-execution` | Local deterministic MCP execution/failure surface stays intact. | Tool projection and stopped resume context routes. |
| `rtk npm run verify:mcp:error-taxonomy` | MCP error taxonomy stays explicit. | Tool projection routes. |
| `rtk npm run verify:result-contract` | User-visible result semantics remain true. | Runtime result projection and session routes. |
| `rtk npm run build -w packages/ts-shell` | TypeScript extraction compiles. | Runtime/session routes. |
| `rtk npm run verify:release:deterministic` | No default real-provider/MCP/gate drift. | Any route that changes shared scripts or runtime surface. |
| `rtk git diff --check` | Docs/code whitespace sanity. | Every route. |

## 17. Risk matrix

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Scenario registry extraction changes candidate suite selection. | Medium | High | Add focused helper tests or validate dry-run and synthetic suite before/after. |
| Report writer split leaks provider config or path. | Low-medium | High | Keep redaction assertions and deterministic release output contracts. |
| Provider projection extraction reclassifies config/network as product failure. | Medium | High | Validate provider readiness classification self-test and result contract. |
| Tool projection extraction turns MCP failures into success-like states. | Medium | High | Run MCP local execution, MCP taxonomy, result contract. |
| Mutation handoff extraction loses partial-failure continuity. | Medium | High | Run candidate mutation, long-session durability, planned-files continuity. |
| Session persistence gateway changes on-disk layout. | Medium | High | Treat layout as contract; add explicit path/layout tests. |
| Compact retention planner drops mutation or approval provenance. | Medium | High | Long-session durability plus mutation compact continuity tests. |
| Over-extraction creates thin modules with unclear ownership. | Medium | Medium | Require every route to move a complete responsibility and include focused tests. |

## 18. Definition of architecture maintainability 4/5

Architecture maintainability reaches 4/5 when:

- `runMvpIntegratedFlow.ts` reads as orchestration wiring. Provider outcome projection, tool outcome projection, mutation handoff, and final result assembly are imported modules with focused tests.
- `SessionManager.ts` reads as session lifecycle coordination. Persistence, project binding, replay, compact retention, stopped resume context, and mutation continuity state have named modules and focused tests.
- `verify-real-user-capabilities.mjs` reads as CLI orchestration and command dispatch. Candidate mutation registry, runner, report writer, real-provider opt-in guard, redaction, and route verifier registry are separate script modules.
- Default deterministic gates still prove real provider is not touched, candidate real execution is not run by default, external MCP is not used, and real-provider opt-in env is cleared.
- Future bounded routes can change one responsibility without editing all three giant files.
- The project still refuses broad rewrite, capability expansion, and unearned readiness claims.

This does not require tiny files. It requires clear ownership, testable seams, and fewer unrelated responsibilities per edit.

## 19. Stop conditions for the overall extraction program

Stop the extraction program and write a new route plan if a future route requires:

- Adding or changing mutation capabilities.
- Broad apply_patch support.
- Delete, move, 3+ file write, rollback, atomicity, or fuzzy patch.
- Provider/auth core changes.
- MCP core or external MCP readiness changes.
- Default gate membership changes.
- Session file layout migration.
- A broad rewrite of any giant file.
- Copying architecture or implementation from a reference repository.
- Reading or printing files under `/home/wang/.private-agents-real`.

## 20. Appendix: commands run and results

Preflight commands already run while drafting this plan:

- `rtk git status --short --branch`: passed, tree clean on `main...origin/main`.
- `rtk git diff --stat`: passed, no diff before plan creation.
- `rtk git log --oneline -40`: passed; recent commits include `bb97f04 Extract candidate mutation verifier helpers`, `85de985 Document Routes 01-12 closeout audit`, `d4bb000 Preserve planned-file continuity for stopped three-file planning`, and `d45af13 Add three-file planning no-write evidence`.
- `rtk wc -l packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts packages/ts-shell/src/session/SessionManager.ts scripts/verify-real-user-capabilities.mjs`: passed; line counts recorded above.
- Target repository `rtk rg` and focused symbol/snippet reads: passed.
- Reference repository narrow `rtk rg` and snippet reads: passed; no reference code copied.

Required validation commands run after the plan was written:

- `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`: passed; synthetic candidate suite passed and `realProviderTouched=false`.
- `rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test`: passed; all Route02Class fixtures covered.
- `rtk npm run verify:real-user-capabilities:two-file-cli-evidence`: passed; two-file workspace write evidence and unsupported/post-write failure surfaces preserved.
- `rtk npm run verify:real-user-capabilities:unsupported-patch-e2e`: passed; unsupported real-model-like mutation outputs stopped before success with no unsupported writes.
- `rtk npm run verify:real-user-capabilities:three-file-planning-no-write`: passed; 3-file planning stayed no-write and unsupported shapes stayed blocked.
- `rtk npm run verify:real-user-capabilities:planned-files-continuity`: passed; planned files and stopped/no-write continuity preserved.
- `rtk npm run verify:session-durability:long`: passed; 2 tests passed.
- `rtk npm run verify:mcp:local-execution`: passed; `realProviderTouched=false`, `externalMcpServerUsed=false`, `userMcpConfigUsed=false`.
- `rtk npm run verify:mcp:error-taxonomy`: passed; local deterministic taxonomy scenarios preserved.
- `rtk npm run verify:result-contract`: passed; hard result contract gate passed.
- `rtk npm run build -w packages/ts-shell`: passed.
- `rtk npm run verify:release:deterministic`: passed; `realProviderTouched=false`, `candidateMutationRealExecuted=false`, `externalMcpServerUsed=false`, `realProviderOptInEnvCleared=true`.
- `rtk git diff --check`: passed.
- `rtk git status --short --branch`: final status should show only this plan file after residue cleanup.

Residue cleanup performed:

- Restored generated audit appends in `.sisyphus/audit/permissions.jsonl`.
- Restored generated audit appends in `packages/ts-shell/.sisyphus/audit/permissions.jsonl`.
- Removed generated `undefined/`.
- Removed generated `/tmp/private-agents-test/test-results/real-user-capabilities-report.json`.
