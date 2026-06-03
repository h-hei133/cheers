# Task Capability Gap Plan

This plan compares the current project with the task capability map and turns
the next phase toward trusted task completion. It is aggressive by grouping
capabilities that must ship together for real user-visible work.

## Current Assessment

| Area | Current status | Evidence or gap |
|---|---|---|
| Trusted runtime capability | Proven across many owner-tested lanes. | `runtime/loop`, `runtime/events`, `runtime/execution`, `provider`, `tools`, `edit`, `verification`, `repair`, `evidence`, `result`, `session`, and host tests. |
| Context discovery and acquisition | Partially proven for bounded local repo scans, ranked candidates, staged reads, graph/test-impact facts, continuation memory, and omission accounting. | `context/discovery/*.test.ts`, `context/acquisition/*.test.ts`, `context/memory/*.test.ts`. This is not proof of complete workspace understanding. |
| Planning quality | Partially proven for analysis brief, executable plan facts, edit target selection, verification intent, plan-quality gates, and no-write mutation handoff. | `planning/runtime/engine.test.ts`, `planning/quality/*.test.ts`, `planning/handoff/*.test.ts`. Planning does not grant mutation, apply, verification, or success. |
| Tool strategy | Partially proven for policy interception, allowlist blocking, read-only parallel scheduling, result ordering, result-message splitting, and non-success outcome facts. | `tools/dispatch`, `tools/policy`, `tools/scheduling`, `tools/result`, `tools/toolBatchDispatch.test.ts`. |
| Controlled mutation | Proven for bounded synthetic lanes, including single-target recovery and bounded multi-target mutation. | `edit/recovery`, `edit/multifile`, mutation runtime tests. Broad arbitrary writers and uncontrolled parallel mutation remain unsupported. |
| Verification and repair | Partially proven for verification intent/result boundaries, command intent, command stage, repair handoff, repair flow planning, and evidence/result verdicts. | `verification/*`, `repair/*`, `evidence/*`, `result/*`. Broader task-relevant verification selection across arbitrary real tasks is weak. |
| Provider prompting and live execution | Synthetic/injected provider lanes and default-off live gating are proven; live task behavior is weak. | `provider/request`, `provider/response`, `runtime/loop/providerStreamAdapter.test.ts`, host evaluation. No default live provider, no broad auth refresh, no live task completion proof. |
| Session continuation | Partially proven for branch/compaction facts, replay, resume context, compact summaries, lifecycle, and host/session status. | `session/store`, `session/replay`, `session/recovery`, `session/continuation`. Broad interactive branch UX and long real task continuation remain weak. |
| Host automation | Proven for in-process host command contract and package-facing JSON response. | `runtime/api/host`, `cli/host`, `runtime/distribution`, `verify:host-surface`. Broad SDK/RPC server behavior remains unproven. |
| Product workflow | Partially proven for CLI status envelope, host JSON, interactive loop lifecycle, cancellation, session selection, and presentation facts. | `cli`, `session/presentation`, `presentation`. User collaboration and artifact workflow surfaces are missing or narrow. |
| Real task evaluation | Partially proven as deterministic task assessment plumbing. | `runtime/evaluation/task/model.test.ts` covers coding edit, debug repair, pathless workspace understanding, docs/report, data/artifact, continuation, unsupported, and skipped-live cases with outcomes: 2 complete, 1 partial, 2 failed, 1 blocked, 1 skipped, 1 unsupported, 2 not-proven. This is not broad live task completion. |
| Artifact workflows | Missing as first-class task owners. | No current sprint evidence for document/report/data/slides artifact planning, durable artifact receipts, or artifact-specific verification. |

## Measured Task Assessment Result

The deterministic task assessment currently produces these task outcomes:

- Complete: `single-file-edit`, `coordinated-edit`.
- Partial: `rollback-recovery`.
- Failed: `failed-check-repair`, `structured-artifact`.
- Blocked: `pathless-workspace-question`.
- Skipped: `live-provider-triage`.
- Unsupported: `unsupported-artifact-export`.
- Not proven: `source-report`, `resume-from-context`.

Top blockers from actual non-complete results:

1. `verification not selected`: blocks `rollback-recovery`, `source-report`,
   and `resume-from-context`.
2. `artifact invalid`: blocks `source-report` and `structured-artifact`.
3. `repair failed`: blocks `failed-check-repair` and `rollback-recovery`.

Live triage status: skipped by default. No live provider was run. The skipped
case records default-off live behavior as a blocker instead of treating live
availability as proven.

## Stale Priority Cleanup

The previous sprint plan centered infrastructure completion: host contracts,
provider/model boundaries, branch/compaction facts, parallel tools, bounded
mutation, and package readiness. Those remain important, but they are no longer
the main bottleneck. The next bottleneck is task delivery.

Stale or narrow priorities to stop treating as next-phase wins:

- adding one more status field, event projection, surface section, or helper;
- adding broader host/server surfaces before the task engine can complete work;
- expanding live provider access before failure triage and task rubrics exist;
- extending mutation breadth without context, planning, verification, and debug
  loops working together;
- treating deterministic runtime evaluation as real task ability.
- treating deterministic task assessment plumbing as live task completion.

## Aggressive Implementation Batches

### Batch A: Real Task Bench And Live-Provider Capability Triage

- Goal: expand the deterministic task assessment into a real task bench that
  measures useful completion across coding, debugging, docs, data/report, and
  artifact tasks, then add explicit live provider triage lanes without enabling
  live providers by default.
- Task value: stops optimizing for safe reporting alone and identifies where
  real work fails.
- Owner domains: `runtime/evaluation`, `runtime/api/host`, `evidence`,
  `result`, `provider/request`, `provider/response`, `verification`,
  `session/replay`, `presentation`.
- Implementation scope: scenario schema, task rubrics, workspace fixtures,
  artifact expectations, verification requirements, failure taxonomy, host JSON
  summaries, redaction checks, and optional live-provider gate classification.
- Mature behavior to extract or port: programmatic testing, JSON event
  consumption, session persistence, provider/model readiness, and automated
  workflow usage.
- Adoption mode: structured port for bench shape and host automation behavior;
  behavior-only alignment for live failure triage.
- Tests and real-task checks: deterministic task fixtures first; live-provider
  checks only through explicit opt-in gates with clean homes and no secret
  printing; each case must define task-relevant success evidence.
- Completion gates: keep the current deterministic task cases green, add real
  fixture execution where the workspace actually changes or artifacts are
  produced, and keep host output separating complete, partial, blocked, failed,
  skipped, unsupported, and not-proven with redaction passing.
- Forbidden shortcuts: fake task success, provider-called success, readback-only
  success, broad live defaults, mass rebaseline, broad skips.
- Expected failure signals: insufficient context, ambiguous goal, verification
  not selected, provider output insufficient, artifact invalid, repair loop
  exhausted, live auth/network/provider failure.
- Improves: task completion, live execution, trusted runtime, product workflow.

### Batch B: Workspace Intelligence And Context Strategy

- Goal: make workspace discovery, target ranking, context packets, continuation
  memory, test-impact hints, and omission accounting strong enough to drive
  real tasks.
- Task value: the agent can find the right files and tests without the user
  spelling out paths.
- Owner domains: `context/discovery`, `context/acquisition`, `context/memory`,
  `planning/quality`, `session/continuation`, `verification/intent`.
- Implementation scope: repo graph facts, package/script map, target ranking
  confidence, ambiguity state, staged read strategy, context budget policy,
  continuation freshness, stale memory rejection, and verification candidate
  selection.
- Mature behavior to extract or port: session context reconstruction, resource
  context loading, branch/compaction-aware continuation, and per-turn state
  freezing.
- Adoption mode: behavior-only alignment for context strategy; structured port
  for report-safe context packet and memory invalidation contracts.
- Tests and real-task checks: fixtures with vague prompts, pathless tasks,
  multi-file targets, docs-only tasks, stale memory, unsafe paths, omitted
  context, and likely-test selection.
- Completion gates: planning can state why selected context is sufficient or
  insufficient; missing facts trigger more reads or user questions; context
  never grants mutation authority or success.
- Forbidden shortcuts: broad repo scan as proof, route-doc-first bias for code
  tasks, accepting stale memory, raw content leakage, context-found success.
- Expected failure signals: no candidate, ambiguous candidates, stale snapshot,
  budget-limited graph, unsafe path, missing related tests.
- Improves: task completion and trusted runtime.

### Batch C: Planning, Tool Policy, And User Collaboration

- Goal: combine goal understanding, ambiguity handling, plan revision, tool
  choice, and user collaboration into one task policy layer.
- Task value: the agent can ask useful questions, proceed under bounded
  assumptions, or block before wasting tool calls.
- Owner domains: `planning`, `tools/policy`, `turn`, `session/continuation`,
  `presentation`, `runtime/events`.
- Implementation scope: task-goal facts, ambiguity classes, collaboration
  decisions, plan revision triggers, tool-use policy, assumption tracking,
  user-question state, and next-action rendering.
- Mature behavior to extract or port: steering/follow-up queues, command context,
  UI prompt decisions, active tool selection, and event-driven progress.
- Adoption mode: structured port for collaboration decision facts; behavior-only
  alignment for queue/steering semantics.
- Tests and real-task checks: ambiguous edit target, unclear success criteria,
  forbidden writes, optional assumptions, user-denied authority, changed user
  instruction mid-task, and plan revision after failure.
- Completion gates: every run has goal facts, plan facts, collaboration state,
  tool policy facts, and next action; asking a question is blocked/pending, not
  success.
- Forbidden shortcuts: inferring write authorization, hiding assumptions,
  continuing through contradictory instructions, terminal prose as policy.
- Expected failure signals: user input required, assumption too risky, authority
  missing, plan quality too low, tool unavailable.
- Improves: task completion and product workflow.

### Batch D: Live Debug And Repair Loop

- Goal: connect failure diagnosis, verification selection, context expansion,
  repair planning,
  controlled mutation, and task-relevant verification into a loop that can fix
  real failures.
- Task value: the agent can recover from test/build/tool/provider failures
  instead of stopping at a truthful but unhelpful report.
- Owner domains: `verification`, `repair`, `edit`, `context/acquisition`,
  `planning`, `runtime/loop`, `evidence`, `result`, `presentation`.
- Implementation scope: failure-class taxonomy, diagnostic reads, repair
  candidate ranking, bounded retry policy, original failure preservation,
  post-repair verification, exhausted-loop blockers, and user-facing progress.
- Mature behavior to extract or port: retry/abort distinctions, tool failure
  events, session save points, context overflow/compaction failure handling,
  and file conflict prevention.
- Adoption mode: behavior-only alignment for retry policy; structured port for
  repair loop state and failure evidence contracts.
- Tests and real-task checks: failing unit test, build error, missing script,
  partial apply failure, rollback, repair proposal-only, post-repair failed,
  repeated non-retriable failure, and completed repair proof.
- Completion gates: no repair path reaches success without final relevant
  verification; original failure remains visible; retry limits and blockers are
  explicit.
- Forbidden shortcuts: weakening assertions, broad skip, mass rebaseline,
  apply-only success, selected-not-run success, suppressing original failure.
- Expected failure signals: diagnostic gap, repair unavailable, verification
  unavailable, repeated failure, rollback failed, user authority needed.
- Improves: task completion, trusted runtime, live execution.

### Batch E: Artifact Workflow Capability

- Goal: add first-class workflow owners for documents, reports, data outputs,
  slides, exports, and other non-code deliverables, with artifact validation as
  a first route because measured task cases currently fail or stay not-proven
  there.
- Task value: the product becomes useful beyond code mutation.
- Owner domains: future `artifacts` owner, `runtime/execution`,
  `context/acquisition`, `planning`, `verification`, `session/store`,
  `presentation`, `runtime/api/host`.
- Implementation scope: artifact intent, source receipt policy, outline/plan,
  durable output path, format validation, rendered or parsed inspection,
  citation/source policy, and host/session artifact summaries.
- Mature behavior to extract or port: session export, custom entries, message
  rendering, resource loading, and programmatic host usage.
- Adoption mode: structured port for artifact receipts and export-like
  workflow; behavior-only alignment for rendering and source policy.
- Tests and real-task checks: markdown report, JSON/CSV analysis output, slide
  outline, export artifact, source omission, invalid format, and rendered or
  parsed validation.
- Completion gates: artifact exists at a durable sanctioned path, source
  receipts are safe, validation passes, and evidence/result marks proof only
  when the artifact meets the task rubric.
- Forbidden shortcuts: raw source leakage, generated-file-exists success,
  unverified export success, hidden arbitrary writers, browser automation added
  without explicit scope.
- Expected failure signals: source unavailable, format invalid, validation not
  run, artifact path unsafe, citation/source gap.
- Improves: task completion and product workflow.

### Batch F: Provider Prompting And Response Shaping

- Goal: make provider requests carry goal, context, plan, tool policy,
  verification expectations, artifact contract, and anti-false-success
  constraints.
- Task value: provider output becomes more actionable and easier to verify.
- Owner domains: `provider/request`, `provider/response`, `planning`,
  `context/acquisition`, `tools`, `verification`, `evidence`, `result`.
- Implementation scope: prompt packet model, response contract, structured
  proposal parsing, insufficiency classification, provider failure recovery,
  fallback decision facts, and redaction.
- Mature behavior to extract or port: model registry metadata, per-request
  options, tool-call normalization, streaming events, and response shaping.
- Adoption mode: structured port for prompt/response contracts; behavior-only
  alignment for provider-specific recovery.
- Tests and real-task checks: missing context prompt blocks, tool-call response,
  text-only insufficient response, malformed response, fallback, provider
  failure, redacted unsafe output, and live opt-in triage cases.
- Completion gates: provider request is task-shaped; malformed or insufficient
  output drives recovery or user action; provider output never becomes success
  without verification.
- Forbidden shortcuts: broad provider hooks, manual secret reads, default live
  enablement, raw provider output in replay/status, provider-completed success.
- Expected failure signals: missing context, output invalid, output
  insufficient, safety block, auth/network/provider class, fallback blocked.
- Improves: task completion, live execution, trusted runtime.

### Batch G: Product Workflow And Automation Hardening

- Goal: make CLI, host, sessions, status, continuation, cancellation, and
  automation usable for long real tasks.
- Task value: users and hosts can drive work, inspect blockers, resume safely,
  and consume outputs programmatically.
- Owner domains: `cli`, `runtime/api/host`, `session/store`,
  `session/replay`, `session/recovery`, `session/presentation`,
  `presentation`, `runtime/events`.
- Implementation scope: workflow status, user-question state, task state,
  artifact summaries, session continuation, cancellation/stop semantics,
  compact/resume controls, host commands, and package surface checks.
- Mature behavior to extract or port: JSON event stream, SDK/RPC concepts,
  session tree navigation, compaction, queue updates, and export/status
  surfaces.
- Adoption mode: structured port for host/session command behavior; behavior-only
  alignment for interactive ergonomics.
- Tests and real-task checks: start/continue/status/stop/cancel, long task
  resume, compacted context, branch navigation, host task bench, and CLI status
  rendering.
- Completion gates: terminal text is not the API; host JSON stays versioned;
  continuation facts are fresh; status names blockers and next actions.
- Forbidden shortcuts: broad SDK/RPC server before scoped consumer, terminal
  scraping, success from session state, dynamic loading, external tool servers.
- Expected failure signals: stale continuation, session mismatch, cancelled,
  stopped, missing artifact, host unsupported command, redaction failure.
- Improves: product workflow and task completion.

### Batch H: Product-Layer Versus Engine-Boundary Decision

- Goal: decide which task-completion behavior belongs in product workflow owners
  and which belongs in a reusable engine boundary.
- Task value: prevents another central orchestration bucket while still making
  task behavior reusable across CLI, host, and future workflows.
- Owner domains: `runtime/loop`, `planning`, `context`, `tools`,
  `verification`, `repair`, `artifacts`, `session`, `runtime/api`.
- Implementation scope: owner map, boundary contracts, dependency direction,
  compatibility-shim rules, event/status ownership, and test strategy.
- Mature behavior to extract or port: low-level loop versus harness/session
  separation and mode-specific I/O layers.
- Adoption mode: behavior-only alignment.
- Tests and real-task checks: architectural checks, owner-focused tests, host
  and CLI consumers using the same owner facts, no new business logic in shims.
- Completion gates: behavior is placed in real owner domains; compatibility
  surfaces delegate only; no process or reference names enter product code.
- Forbidden shortcuts: central `product`, `orchestration`, `common`, `helper`,
  or route-named files; growing `runMvpIntegratedFlow`; broad contracts without
  cross-runtime consumer.
- Expected failure signals: shim grows logic, owner facts duplicated, runtime
  fields use process/provenance names, CLI owns truth.
- Improves: product workflow, trusted runtime, task completion.

## Adoption Recommendations

- Use behavior-only alignment for mature session, retry, queue, extension, and
  UI ergonomics unless a self-contained component can be adopted with license
  and notice requirements satisfied.
- Use structured ports for task bench schema, collaboration decision facts,
  prompt/response contracts, artifact receipts, host command shapes, and repair
  loop state because these must be tested and owned locally.
- Avoid dependency use for semantics that control truth, evidence, mutation,
  redaction, or provider behavior.
- Avoid isolated source adoption unless the component is narrow, self-contained,
  license-compatible, and can be renamed into a real owner domain without
  external-project or process vocabulary in product code.

## Intentionally Deferred

- Default live provider behavior.
- Manual provider secret reads.
- Browser automation.
- External tool server behavior.
- Dynamic package or extension loading.
- Command allowlist expansion.
- Arbitrary writer behavior.
- Broad SDK/RPC server behavior.
- Uncontrolled broad parallel mutation.
