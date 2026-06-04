# Task Capability Gap Plan

This plan compares the current project with the task capability map and turns
the next phase toward trusted task completion. It is aggressive by grouping
capabilities that must ship together for real user-visible work.

## Current Assessment

| Area | Current status | Evidence or gap |
|---|---|---|
| Trusted runtime capability | Proven across many owner-tested lanes. | `runtime/loop`, `runtime/events`, `runtime/execution`, `provider`, `tools`, `edit`, `verification`, `repair`, `evidence`, `result`, `session`, and host tests. |
| Context discovery and acquisition | Partially proven for bounded local repo scans, ranked candidates, staged reads, graph/test-impact facts, continuation memory, safe context packet construction, verification candidate selection, and omission accounting. | `context/discovery/*.test.ts`, `context/acquisition/*.test.ts`, `context/memory/*.test.ts`, `context/selection/model.test.ts`, and task assessment integration. This is not proof of complete workspace understanding. |
| Planning quality | Partially proven for analysis brief, executable plan facts, edit target selection, verification intent, plan-quality gates, and no-write mutation handoff. | `planning/runtime/engine.test.ts`, `planning/quality/*.test.ts`, `planning/handoff/*.test.ts`. Planning does not grant mutation, apply, verification, or success. |
| Tool strategy | Partially proven for policy interception, allowlist blocking, read-only parallel scheduling, result ordering, result-message splitting, and non-success outcome facts. | `tools/dispatch`, `tools/policy`, `tools/scheduling`, `tools/result`, `tools/toolBatchDispatch.test.ts`. |
| Controlled mutation | Proven for bounded synthetic lanes, including single-target recovery and bounded multi-target mutation. | `edit/recovery`, `edit/multifile`, mutation runtime tests. Broad arbitrary writers and uncontrolled parallel mutation remain unsupported. |
| Verification and repair | Partially proven for verification intent/result boundaries, command intent, command stage, repair handoff, repair flow planning, and evidence/result verdicts. | `verification/*`, `repair/*`, `evidence/*`, `result/*`. Broader task-relevant verification selection across arbitrary real tasks is weak. |
| Provider prompting and live execution | Synthetic/injected provider lanes, default-off live gating, repeatable opt-in live task run reporting, reviewed isolated-apply live write metadata, safe quality records, reviewed real-workspace readiness facts, and one disposable selected-workspace apply are proven. Live behavior is still bounded to explicit gates and isolated workspaces. | `provider/request`, `provider/response`, `runtime/loop/providerStreamAdapter.test.ts`, host evaluation, `runtime/evaluation/task/liveRun.test.ts`, and `verify:live-task-execution`. No default live provider, no broad auth refresh, no raw provider output inspection, and no broad real-workspace write authority. |
| Session continuation | Partially proven for branch/compaction facts, replay, resume context, compact summaries, lifecycle, and host/session status. | `session/store`, `session/replay`, `session/recovery`, `session/continuation`. Broad interactive branch UX and long real task continuation remain weak. |
| Host automation | Proven for in-process host command contract and package-facing JSON response. | `runtime/api/host`, `cli/host`, `runtime/distribution`, `verify:host-surface`. Broad SDK/RPC server behavior remains unproven. |
| Product workflow | Partially proven for CLI status envelope, host JSON, interactive loop lifecycle, cancellation, session selection, and presentation facts. | `cli`, `session/presentation`, `presentation`. User collaboration and artifact workflow surfaces are missing or narrow. |
| Real task evaluation | Partially proven as deterministic task assessment plumbing and explicit live task execution through a shared task-loop runtime. The loop owns ordered execution from goal/state through context, planning, request shaping, provider turn, action, observation, verification, repair, proof, and verdict while delegating each step to existing owner domains. | `runtime/evaluation/task/loop.ts`, `runtime/evaluation/task/model.test.ts`, `runtime/evaluation/task/liveRun.test.ts`, `runtime/evaluation/task/quality.ts`, and `evidence/task/proof.test.ts` cover coding edit, debug repair, pathless workspace understanding, docs/report, data/artifact, continuation, unsupported, skipped-live, and opt-in live execution metadata cases with audited deterministic outcomes: 18 complete, 1 skipped, and 1 unsupported. Complete deterministic cases include 4 pathless workspace/context cases, 3 debug/repair cases, 7 artifact/report/data cases, and 2 continuation/resume cases. Focused tests prove deterministic and live entries share loop-owned goal/state/context/plan/request/provider-turn/action/observation/verification/repair/proof/verdict progression with owner-call evidence, including write planning dry-run without complete proof. The live run defines 13 exact entries and now projects gate receipts, quality records, provider coverage facts, and hard-gate counts inside `runtime/evaluation/task` instead of script-owned per-entry task results. A measured explicit opt-in live gauntlet executed all 13 entries, completed 11 with task proof, completed 3 write tasks with reviewed disposable apply plus post-apply task proof and zero manual correction, produced 7 write/artifact quality records, 5 dry-run quality records, 3 reviewed real-workspace readiness records, 1 disposable selected-workspace apply, 1 completed debug/repair task, 1 rollback useful partial with repair-verification status, 1 multi-file target-quality record, 1 artifact quality pass, primary success with configured fallback skipped, forced primary provider-network fallback attempted and passed, and redaction pass. Provider calls, fallback, gate passes, patch intent, dry-run diff, review authority, isolated apply, selected-workspace apply metadata, verification attempt, task-loop stages, and live output metadata remain non-success without evidence/result task proof. This is still not broad real-workspace live completion. |
| Artifact workflows | Partially proven as deterministic receipt, correction, validation facts, and no-write live dry-run readiness for report/data cases. | `artifacts/workflow/model.test.ts` and task assessment integration cover report/structured-data intent, source receipts, format expectation, unsafe/missing/invalid/not-proven states, validation failure, correction, rerun verification, artifact dry-run live execution projection, and seven complete artifact/report/data cases. Durable artifact writing, rendered checks, manual review/write gates, and broad export workflows remain missing. |

## Measured Task Assessment Result

The deterministic task assessment currently produces these audited task
outcomes after the context/plan/request/tool/repair/artifact/verification/proof
task lane:

- Complete by task-relevant verification proof: `single-file-edit`,
  `coordinated-edit`.
- Complete by task proof verdict after audited owner facts:
  `failed-check-repair`,
  `rollback-recovery`,
  `retry-diagnosis-repair`,
  `pathless-workspace-question`, `test-impact-question`,
  `owner-context-question`, `package-script-impact-question`,
  `source-report`, `structured-artifact`,
  `incident-summary-report`, `csv-summary-artifact`,
  `release-note-report`, `metrics-summary-artifact`,
  `owner-risk-summary`,
  `resume-from-context`, `resume-after-compaction`.
- Skipped: `live-provider-triage`.
- Unsupported: `unsupported-artifact-export`.
- Failed: none.
- Blocked: none.
- Not proven: none.

Top blockers before the verification/artifact/repair loop:

1. `verification not selected`: blocked `source-report` and
   `resume-from-context`.
2. `artifact invalid`: blocked `source-report` and `structured-artifact`.
3. `repair failed`: blocked `failed-check-repair` and `rollback-recovery`.

Top blockers after the deterministic task proof lane:

1. `environment issue`: blocks the default-skipped live triage case.
2. `provider failure`: blocks the default-skipped live triage case.
3. `unsupported capability`: blocks the unsupported export case.

Changed case evidence:

- `failed-check-repair`: before `failed`; after `complete` through ready
  context, ready execution plan, repair tool strategy, repair action, passed
  rerun verification, preserved original failure, and evidence/result task
  verdict.
- `rollback-recovery`: before `failed`; after `complete` through bounded repair,
  original failure preservation, explicit post-repair rollback validation
  evidence, passed verification execution, and evidence/result task verdict.
- `retry-diagnosis-repair`: before `failed`; after `complete` through failure
  diagnosis, bounded repair, original failure preservation, explicit
  post-repair validation evidence, passed verification execution, and
  evidence/result task verdict.
- `pathless-workspace-question`: before `blocked`; after `complete` through
  context selection, task request shaping, search/verify tool strategy, target
  resolution proof, and evidence/result task verdict.
- `test-impact-question`: before `blocked`; after `complete` through pathless
  target and focused-check resolution, selected nearby context, no-write policy,
  and evidence/result task verdict.
- `owner-context-question`: before `blocked`; after `complete` through
  pathless owner-domain context resolution, report-safe receipt boundary proof,
  no-write policy, and evidence/result task verdict.
- `package-script-impact-question`: before `blocked`; after `complete` through
  package script discovery, focused verification candidate selection, pathless
  host owner context, no-write policy, and evidence/result task verdict.
- `source-report`: before `failed`; after `complete` through source receipts,
  artifact correction, passed rerun verification, and evidence/result task
  verdict.
- `structured-artifact`: before `failed`; after `complete` through source
  receipts, artifact correction, passed rerun verification, and evidence/result
  task verdict.
- `incident-summary-report`: before `failed`; after `complete` through source
  receipts, report artifact correction, passed validation, and evidence/result
  task verdict.
- `csv-summary-artifact`: before `failed`; after `complete` through structured
  source receipts, artifact correction, passed validation, and evidence/result
  task verdict.
- `release-note-report`: before `failed`; after `complete` through source
  receipts, report correction, passed validation, and evidence/result task
  verdict.
- `metrics-summary-artifact`: before `failed`; after `complete` through
  structured source receipts, artifact correction, passed validation, and
  evidence/result task verdict.
- `owner-risk-summary`: before `failed`; after `complete` through source
  receipts, report correction, passed validation, and evidence/result task
  verdict.
- `resume-from-context`: before `not-proven`; after `complete` through
  refreshed continuation context, freshness proof, and evidence/result task
  verdict.
- `resume-after-compaction`: before `not-proven`; after `complete` through
  retained context rebuild, freshness proof, setup continuation evidence, and
  evidence/result task verdict.

Proof controls: missing final verification, missing post-repair validation,
missing source receipts, invalid structured-artifact validation, stale
continuation context, host output without task proof, and artifact presence
without validation all downgrade away from complete and preserve missing proof
items.

Measured counts: 18 complete, 1 skipped, and 1 unsupported. Complete cases now
include 4 pathless workspace/context cases, 3 debug/repair cases, 7
artifact/report/data cases, and 2 continuation/resume cases.

Live status: default-off. Thirteen target cases now have exact live gate
requirements: `pathless-workspace-question`, `test-impact-question`, and
`owner-context-question`, and `package-script-impact-question` use the
read-only provider path, `resume-from-context` and `resume-after-compaction`
use the anchored provider path, `live-provider-triage` uses provider readiness
preflight, and `source-report`, `structured-artifact`,
`incident-summary-report`, `csv-summary-artifact`, `release-note-report`,
`metrics-summary-artifact`, and `owner-risk-summary` use artifact dry-run with
no write and manual review before any write. Task
assessment now carries `liveExecutions`, a structured projection from explicit
gate observations into complete, useful partial, failed, blocked, skipped,
unsupported, unsafe, provider-readiness-missing, auth-readiness-missing,
verification-unavailable, artifact-validation-unavailable,
provider-output-insufficient, and redaction-blocked states. Focused tests prove
at least four live-ready cases, at least three safe executed observations, at
least two complete or useful partial executions with task proof, one artifact
or data execution, one pathless/context execution, exact provider-network
blockers, changedFiles empty visibility, no mutation, no apply, and no terminal
success from provider calls or gate passes. SP022 focused tests preserve two
no-write live execution observations as complete/useful partial with task
proof. Manual live smoke evidence now shows read-only smoke passed, anchored
provider smoke passed with the primary provider, fallback was configured but
skipped because primary succeeded, no raw provider output leaked, and no
write/no apply was preserved.
Write-capable code/debug cases stay unsafe or dry-run-only.

Repeatable live run status: `verify:live-task-execution` reports thirteen
target entries with exact requirements: single-file edit, coordinated edit,
failed-check repair, rollback recovery, package script impact, pathless
workspace, owner context, test impact, incident report, metrics artifact,
resume from context, readonly coding, and write-capable dry-run planning. The
default path is a safe no-provider non-executed report with exact opt-in
blockers. The script now only invokes existing explicit read-only and anchored
provider gates, optionally runs the existing selected-workspace apply gate in a
disposable worktree, passes safe receipts to `runtime/evaluation/task`, and
prints safe metadata; the product live-run owner projects task entries and
calls `runTaskLoop`. A measured SP030 explicit opt-in gauntlet executed all 13
entries, completed 11 with task proof, completed 3 write tasks with reviewed
disposable apply plus post-apply task proof and zero manual correction, recorded
2 remaining manual corrections with blocker or failing disposition, produced 7
quality records, 5 dry-run quality records, 3 reviewed real-workspace readiness
records, 1 disposable selected-workspace apply, 1 completed debug/repair task,
1 rollback useful partial with repair-verification status, 1 multi-file quality
record, 1 artifact quality pass, primary provider success with configured
fallback skipped, forced primary provider-network fallback attempted and
passed, and continuation/context coverage. Redaction passed and
main-workspace mutation stayed false. This is live task-run evidence and
disposable selected-workspace apply proof, not broad real-workspace write
authority, raw provider output inspection, or provider-output-only success.

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
- treating deterministic task assessment plumbing, expanded case counts, or
  live gate execution metadata as broad live task completion.

## Aggressive Implementation Batches

### Batch A: Durable Artifact And Manual-Review Output Execution

- Goal: move report/data live entries from no-write/manual-review dry-run facts
  toward sanctioned artifact output paths with rendered or schema validation,
  while keeping write authority explicit and reviewable.
- Task value: converts useful live report/data proposals into deliverables
  without losing source receipts, validation, or truth boundaries.
- Owner domains: `runtime/evaluation`, `runtime/api/host`, `evidence`,
  `result`, `provider/request`, `provider/response`, `verification`,
  `artifacts/workflow`, `session/replay`, `presentation`.
- Implementation scope: artifact output contracts, manual-review decisions,
  source policy, rendered/schema validation, host JSON summaries, redaction
  checks, and evidence/result verdict input.
- Mature behavior to extract or port: programmatic testing, JSON event
  consumption, session persistence, provider/model readiness, and automated
  workflow usage.
- Adoption mode: structured port for bench shape and host automation behavior;
  behavior-only alignment for live failure triage.
- Tests and real-task checks: deterministic task fixtures first; live-provider
  checks only through explicit opt-in gates with clean homes and no secret
  printing; each case must define task-relevant success evidence.
- Completion gates: keep the current 18 complete deterministic task cases and
  the eight-entry live run green, preserve fake-complete controls, keep live
  gates explicit opt-in, add sanctioned artifact output only where manual
  review/write authority exists, and keep host output separating complete,
  useful partial, blocked, failed, skipped, unsupported, unsafe, manual review,
  and not-proven with redaction passing.
- Forbidden shortcuts: fake task success, provider-called success, readback-only
  success, broad live defaults, mass rebaseline, broad skips.
- Expected failure signals: insufficient context, ambiguous goal, verification
  selected but not run, insufficient verification, provider output insufficient,
  artifact invalid, repair loop exhausted, live auth/network/provider failure.
  Current live weakness is provider output sufficiency and sanctioned
  write/artifact validation, not provider default access.
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
