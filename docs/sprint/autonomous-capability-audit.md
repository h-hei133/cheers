# SP054 Autonomous Capability Audit

## Executive Verdict

The project is no longer a proof-only harness. Current TypeScript product code has a real runtime action policy, execution-boundary guards, typed tool observations, task-relevant verification receipts, repair truth gates, artifact claim checks, replay-derived continuation facts, and evidence/result-owned terminal verdicts.

It is still not close to top-tier autonomous development behavior. The stronger local project has a deeper generic agent loop and harness: configurable sequential/parallel tool batches, pre/post tool-call hooks, streaming tool updates, save points, pending write flushing, durable session trees, branch summaries, and compaction with file-operation carry-forward. This project is stronger at anti-false-success proof boundaries, but weaker at ordinary execution harness depth, long-task orchestration, recovery after unfinished tool calls, and repair/debug iteration as a live behavioral loop.

Overall classification: partially comparable to a mature local agent project for guarded autonomous development, behind for mature execution-loop and long-task harness capability, and not proven for broad real-workspace autonomous development without curated tasks.

## Current Ability Map

| Area | Current ability | Evidence |
|---|---|---|
| Adaptive runtime action | `runQueryLoop` consumes `decideQueryRuntimeAction` before every turn and stops on `stop-not-proven`; `executeTurn` passes runtime action into `runAgent` and constrains mismatched output. | `packages/ts-shell/src/core/query/runtime/loop.ts`, `packages/ts-shell/src/core/query/runtime/policy.ts`, `packages/ts-shell/src/core/query/runtime/actionAuthority.ts` |
| Tool strategy | Policy can choose read/search/edit/verify/repair/artifact/continue/stop from proof gap, failures, pending action, changed files, artifact contract, and budget. | `packages/ts-shell/src/tools/policy/strategy.ts` |
| Execution seam | `executeTurn` blocks unsafe runtime action and emits failed observations, but the runner seam is still a single action handoff rather than a rich turn harness. | `packages/ts-shell/src/core/query/runtime/loop.ts`, `packages/ts-shell/src/core/query/runtime/actionAuthority.ts` |
| Tool runtime | `ToolDispatcher` and `ToolRuntime` have allowlist, approval, MCP classification, receipts, and runtime errors. | `packages/ts-shell/src/tools/dispatch/dispatcher.ts`, `packages/ts-shell/src/core/tools/runtime.ts` |
| Tool feedback | Runtime observation records tool failures, command coverage, completed actions, repair attempts, context paths, and artifact evidence. | `packages/ts-shell/src/core/query/runtime/observation.ts` |
| Verification | Task-relevant verification plans candidate commands, coverage, approval state, runtime dispatch, not-proven claims, and product verification receipts. | `packages/ts-shell/src/verification/taskRelevantVerificationRoute.ts`, `packages/ts-shell/src/verification/command/runner.ts` |
| Repair | Repair projections preserve original failure, require failure-output-informed retry, authority, apply success, and post-repair verification. | `packages/ts-shell/src/repair/iteration/projection.ts`, `packages/ts-shell/src/repair/handoff/readiness.ts` |
| Artifact validation | Artifact receipts check source receipts, validation state, claim-evidence binding to source paths and verification receipts, and never own terminal success. | `packages/ts-shell/src/artifacts/workflow/model.ts` |
| Continuation and replay | Replay reconstructs runtime seed with recovery boundary, truth boundary, paired turns, pending lifecycle, and derived observations when policy allows. | `packages/ts-shell/src/session/replay/builder.ts` |
| Compaction carry-forward | Compact future-turn injection has quality, merge, budget, and unsafe-content checks; retention planning carries compact continuity summaries. | `packages/ts-shell/src/core/context/compact/injection/compactFutureTurnInjection.ts`, `packages/ts-shell/src/session/continuation/retentionPlanner.ts` |
| Evidence and result truth | Task proof and task verdict keep completion in evidence/result ownership and preserve missing proof as terminal blockers. | `packages/ts-shell/src/evidence/task/proof.ts`, `packages/ts-shell/src/result/task/verdict.ts` |
| Evaluation and live acceptance | Runtime evaluation and live catalog paths are acceptance consumers, not product behavior owners. | `packages/ts-shell/src/runtime/evaluation/task/model.ts`, `packages/ts-shell/src/runtime/evaluation/task/loop.ts`, `packages/ts-shell/src/runtime/evaluation/task/liveRun.ts`, `docs/sprint/development-capability-catalog.json` |

## Comparison Table

| Capability area | Classification | Current project evidence | Stronger local project evidence | Gap | Severity | Next action |
|---|---|---|---|---|---|---|
| Runtime action policy | partially comparable | `decideQueryRuntimeAction` feeds `runQueryLoop`; policy uses proof gap, context, failures, changed files, artifact contract, pending action, and budget. | `/home/wang/projects/pi/packages/agent/src/agent-loop.ts` advances through provider response, tool execution, tool-result messages, follow-up queues, continuation, and stop hooks. | Current policy is explicit and truth-aware, but action execution is still a narrow wrapper around one `runAgent` call. | High | Deepen the execution seam so selected actions drive concrete tool batches, feedback, and next-turn state. |
| Execution harness | behind | `executeTurn` calls `deps.runAgent` once per runtime action and then constrains output. | `/home/wang/projects/pi/packages/agent/src/harness/agent-harness.ts` owns phase, turn snapshots, hooks, pending writes, save points, and settlement. | Missing mature save-point-driven harness around normal runtime turns. | Critical | Build product runtime execution harness behavior around action dispatch, save points, tool-result ingestion, and controlled continuation. |
| Tool-call batching and ordering | behind | `ToolDispatcher.dispatch` gates a single tool through interception and runtime. | `/home/wang/projects/pi/packages/agent/src/agent-loop.ts` executes tool batches sequentially or in parallel, emits completion-order tool events, then persists tool-result messages in assistant source order. | No comparable normal-runtime batch semantics or ordered source/result reconciliation. | High | Add batch-level dispatch/result handling where runtime action requires multiple reads/verifications. |
| Tool feedback detail | partially comparable | Observations record failed actions, command coverage, repair attempts, and pending action. | `pi` streams `tool_execution_update`, emits start/end events, and carries tool result `details`; coding-agent tools store structured details such as diffs, truncation, full output path, and grep limits. | Current feedback is useful for proof, less rich for live debugging and progressive execution. | High | Preserve structured stdout/stderr/truncation/diff/failure details into runtime observations without exposing unsafe raw content. |
| Verification execution | partially comparable | Task-relevant verification dispatches approved bash through existing tool runtime and rejects uncovered changed files. | `pi` offers generic tool execution and bash result details, but does not own this project's task-proof truth. | Current verification is stronger for false-success prevention but weaker at adaptive check selection and rerun orchestration. | High | Make verification a normal action executor with targeted reruns after each changed file or repair attempt. |
| Repair/debug depth | behind | Policy avoids repeated repair and can switch to search/read when repair was attempted or context is missing; repair proof requires post-validation. | `pi` has generic loop and tool feedback foundations for iterative debugging but leaves domain repair policy to app code. | Current repair is bounded and proof-safe, but shallow as a debugging loop; it lacks multi-hypothesis diagnosis and tool-driven investigation depth. | Critical | Build repair iteration that consumes failure output, gathers missing context, changes strategy, applies bounded fixes, and reruns targeted checks. |
| Artifact handling | roughly comparable | Artifact owner validates path, source receipts, validation evidence, and claim-evidence consistency. | `pi` session/tool result format carries custom messages, tool details, export rendering, and extension-owned metadata. | Current artifact truth is strong, but production artifact generation/inspection UX is thinner. | Medium | Keep truth gates; add richer artifact-specific execution and validation actions only where product tasks need them. |
| Continuation and replay | partially comparable | Replay derives observations and recovery/truth boundaries; compact future-turn injection is quality checked. | `pi` session tree, branch summaries, compaction entries, first-kept boundaries, file operation details, queues, and save points form a mature session substrate. | Current continuation preserves safety but is less capable for long multi-turn work and branch-aware task carry-forward. | Critical | Create a long-task continuation substrate that carries pending action, proof gap, changed files, failure state, and verification plan through compaction/replay. |
| Durable session state | behind | Session/replay/recovery modules track lifecycle, pending lifecycle, and continuation facts. | `pi` treats session as durable append-only state tree with branch-scoped entries, leaf changes, compactions, labels, and custom entries. | Current state is fragmented across session/replay/compact/runtime projections and less unified as a durable task log. | High | Make a task-state ledger owned by session/continuation or runtime state, not a report or evaluation artifact. |
| Context selection | partially comparable | `selectContext`, read target planning, and runtime policy feed selected paths and owner paths into action decisions. | `pi` exposes `transformContext`, resource snapshots, session compaction, and structured summaries at harness save points. | Current context is more task-proof-oriented than harness-integrated; missing-context recovery exists but is not a full context builder loop. | High | Connect missing context, search/read outcomes, and selected owner paths into an explicit discovery loop before edit/repair. |
| Planning and action graph | partially comparable | Planning runtime and workflow action graph produce dependent targets and verification targets consumed by runtime. | `pi` is mostly a generic harness; application-level planning is expected outside core. | Current planning is useful but still often diagnostic-driven and less coupled to live execution progress. | Medium | Convert planning facts into executable action batches and update the plan after tool feedback. |
| Terminal truth and anti-false-success | ahead | `evidence/task` and `result/task` own proof/verdict; runtime observations and artifacts cannot claim terminal success. | `pi-docs-playbook` says pi session JSONL is agent trace, not application audit truth. | Current project is stricter about product-task proof than the generic harness. | Medium | Preserve this advantage while deepening execution; do not move success into harness events or receipts. |
| Live provider acceptance | not proven | Sprint records show default-off live gates and manual acceptance fields, but live catalog is an acceptance path. | Pi provider/harness docs show provider routing and live operation support, not this project's task acceptance. | Manual live passes prove availability and acceptance scenarios, not broad autonomous product behavior. | High | Keep live provider as final acceptance only; force unseen local tasks and non-live deterministic behavior gates first. |
| Real unseen development ability | behind | SP051-SP053 introduced controlled unseen diagnostics and mission packs, with stronger normal-runtime proofs. | Pi's public sessions/harness target real coding-agent use with generic loop/session/tooling mechanics. | Current unseen work is still curated and bounded; broad autonomous development remains unproven. | Critical | Run real unseen development tasks in disposable workspaces with required edits, verification, repair, artifacts, and result proof. |

## Strongest Areas

1. Terminal truth boundaries are strong: evidence/result owners prevent provider-called, tool-called, apply-attempted, repair-proposed, artifact-exists, or replay-restored facts from becoming success.
2. Runtime action policy is real and consumed by normal `QueryEngine` loop behavior.
3. Verification proof now accounts for changed-file coverage and post-repair validation instead of accepting generic green output.
4. Artifact claim validation rejects marker-only and metadata-only completion.
5. Execution-boundary guards can block unsafe edits, generic verification, invalid repair, and metadata-only artifact completion.

## Weakest Areas

1. Execution harness depth is behind: runtime action is not yet a mature tool-batch execution loop with save points and progressive tool-result ingestion.
2. Long-task state is conservative but not deeply autonomous: replay/compaction preserve safety, but not a full durable task plan and proof-gap ledger.
3. Repair is truth-safe but shallow: it avoids false success better than it diagnoses, investigates, and changes strategy.
4. Tool feedback is more proof-oriented than debugging-oriented; structured execution details are not yet a first-class normal-runtime control input.
5. Unseen real development remains under-proven outside curated sprint missions and manual live acceptance.

## Top 10 Capability Gaps

1. Mature execution harness around `QueryEngine`/`AgentRunner`: critical.
2. Batch tool action dispatch with ordered result ingestion: high.
3. Structured tool feedback preserved into runtime observations: high.
4. Long-task durable task ledger through replay and compaction: critical.
5. Multi-step repair/debug loop that gathers new context and changes strategy: critical.
6. Verification action executor that reruns targeted checks after every mutation or repair: high.
7. Discovery loop that blocks edit/repair until owner/context evidence is sufficient: high.
8. Real unseen disposable-workspace development gauntlet: critical.
9. Plan-to-action synchronization after tool feedback and failures: medium.
10. Unified architecture boundary between runtime state, session continuation, and evaluation acceptance: medium.

## Top 5 Architecture Debts

1. `QueryEngine`/`executeTurn` is still the thin seam around `runAgent`; it lacks a mature harness-level action executor.
2. Runtime observations, session replay, compact injection, and task proof share facts but do not form one durable task-state owner.
3. Tool result details are split between tool runtime receipts and runtime observations; feedback is not yet rich enough for debugging loops.
4. Verification execution exists as a route-like product owner but is not fully integrated as the default normal-runtime verification action executor.
5. Compatibility and acceptance surfaces remain tempting places to prove behavior; future work must keep them as consumers only.

## Claims Still Not Proven

- Broad autonomous development on arbitrary real codebases.
- Repair loops that solve unknown failures by diagnosis rather than fixed policy branches.
- Long-running task carry-forward across compaction, replay, session switching, and resumed verification.
- Multi-tool action batches with deterministic ordering and per-tool feedback consumption.
- Artifact production and validation across non-document artifacts beyond current receipt/claim models.
- Live provider acceptance as product-runtime capability rather than provider availability plus curated task completion.

## Evidence List

Current project code inspected with Serena and targeted reads:

- `packages/ts-shell/src/core/query/runtime/loop.ts`
- `packages/ts-shell/src/core/query/runtime/policy.ts`
- `packages/ts-shell/src/core/query/runtime/actionAuthority.ts`
- `packages/ts-shell/src/core/query/runtime/observation.ts`
- `packages/ts-shell/src/core/query/runtime/proof.ts`
- `packages/ts-shell/src/tools/policy/strategy.ts`
- `packages/ts-shell/src/tools/dispatch/dispatcher.ts`
- `packages/ts-shell/src/core/tools/runtime.ts`
- `packages/ts-shell/src/planning/action/graph.ts`
- `packages/ts-shell/src/planning/runtime/engine.ts`
- `packages/ts-shell/src/planning/runtime/proposal.ts`
- `packages/ts-shell/src/context/contextPlanningIntent.ts`
- `packages/ts-shell/src/context/readTargetPlanning.ts`
- `packages/ts-shell/src/context/rebuildInput.ts`
- `packages/ts-shell/src/verification/taskRelevantVerificationRoute.ts`
- `packages/ts-shell/src/verification/command/runner.ts`
- `packages/ts-shell/src/repair/iteration/projection.ts`
- `packages/ts-shell/src/repair/handoff/readiness.ts`
- `packages/ts-shell/src/artifacts/workflow/model.ts`
- `packages/ts-shell/src/session/replay/builder.ts`
- `packages/ts-shell/src/session/continuation/retentionPlanner.ts`
- `packages/ts-shell/src/core/context/compact/injection/compactFutureTurnInjection.ts`
- `packages/ts-shell/src/evidence/task/proof.ts`
- `packages/ts-shell/src/result/task/verdict.ts`
- `packages/ts-shell/src/runtime/evaluation/task/model.ts`
- `packages/ts-shell/src/runtime/evaluation/task/loop.ts`
- `packages/ts-shell/src/runtime/evaluation/task/liveRun.ts`
- `packages/ts-shell/src/runtime/evaluation/task/catalog.ts`

Current sprint records inspected:

- `docs/sprint/route/sp046-mainline-consolidation-debt-collapse.md`
- `docs/sprint/hard-mission-gauntlet.md`
- `docs/sprint/real-development-mission-pack.md`
- `docs/sprint/final-development-acceptance-record.md`
- `docs/sprint/final-real-task-trial.md`
- `docs/sprint/final-gap-closure-record.md`
- `docs/sprint/final-architecture-audit-record.md`
- `docs/sprint/parity-development-trial.md`
- `docs/sprint/execution-loop-trial.md`
- `docs/sprint/controlled-unseen-development-gauntlet.md`

Stronger local project docs and source inspected:

- `/home/wang/projects/pi-docs-playbook/README.md`
- `/home/wang/projects/pi-docs-playbook/AGENTS.md`
- `/home/wang/projects/pi-docs-playbook/usage/task-reading-matrix.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/agent/README.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/agent/docs/agent-harness.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/agent/docs/durable-harness.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/session-format.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/compaction.md`
- `/home/wang/projects/pi/packages/agent/src/agent-loop.ts`
- `/home/wang/projects/pi/packages/agent/src/harness/agent-harness.ts`
- `/home/wang/projects/pi/packages/coding-agent/src/core/compaction/compaction.ts`

## Conclusion

The project has a credible truthfulness and guarded-action substrate, and it is ahead of a generic harness on explicit proof/verdict discipline. It is not close to top-tier autonomous development because its normal runtime still lacks mature execution harness depth, rich tool feedback loops, durable long-task orchestration, and repair/debug behavior that can solve unknown failures through investigation. The next work should deepen product runtime behavior, not add another report, catalog gate, live acceptance matrix, or proof fallback.
