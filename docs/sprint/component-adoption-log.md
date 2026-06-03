# Component Adoption Log

This log records controlled component or behavior adoption decisions for sprint
capability work. Product behavior still has to be proven by current code and
focused validation.

## Task Bench And Host Automation Workflow

- Selected mode: structured port.
- Owner domain: future implementation should stay under `runtime/evaluation`,
  `runtime/api/host`, `evidence`, `result`, `verification`, `provider`, and
  artifact owners when created.
- Reason for use: the project needs evaluation cases that measure real task
  completion, not only trusted runtime fact projection.
- Behavior to port: structured task scenarios, host-driven execution, event and
  status inspection without terminal scraping, task-specific rubrics, redaction
  checks, and explicit complete/partial/blocked/failed/skipped/not-proven
  classifications.
- Rejected alternatives:
  - Dependency use: rejected because task success, redaction, provider gating,
    and evidence/result verdicts are local product semantics.
  - Isolated source adoption: rejected because no source copy is needed for the
    planning shape and external naming should not enter product code.
  - Live-provider-first bench: rejected because live behavior must remain
    explicit opt-in and default-off.
- Expected callers: host runtime, task evaluation, provider triage, artifact
  workflow checks, session replay/status, product surface, and future automation
  adapters.
- Side-effect boundary: task-bench execution must use existing host/runtime
  owners and sanctioned execution boundaries. It must not add live-provider
  defaults, browser automation, external tool servers, command allowlist
  expansion, dynamic loading, arbitrary writers, or terminal scraping.
- Truthfulness boundary: scenario accepted, provider called, tool executed,
  artifact created, event emitted, JSON emitted, and CLI exit zero are not task
  success. Evidence/result verdicts with task-relevant verification remain the
  only complete-proof owners.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/model.test.ts`
  - Deterministic task assessment currently covers complete, partial, failed,
    blocked, skipped, unsupported, and not-proven outcomes across coding edit,
    debug repair, pathless workspace understanding, docs/report, data/artifact,
    continuation, and skipped-live task cases.
  - Live-provider triage remains skipped by default and no live provider is
    required for normal validation.
- Rollback plan: disable new task-bench scenarios while keeping existing host
  runtime and deterministic evaluation lanes intact.

## Deterministic Task Outcome Lane

- Selected mode: structured port for local contracts and behavior-only
  alignment for mature task-driving flow.
- Owner domain: `context/selection`, `planning/execution`,
  `provider/request`, `tools/policy`, `verification/execution`,
  `artifacts/workflow`, `repair/loop`, and `runtime/evaluation/task`.
- Reason for use: SP016 needed existing failed, blocked, and not-proven task
  cases to improve through task behavior, not diagnostic relabeling. The local
  lane now carries context selection, execution plan, task request packet, tool
  strategy, repair action, artifact correction, verification execution, outcome
  classification, and top blocker updates.
- Behavior to port: task-facing context narrowing, plan readiness, prompt packet
  shaping, tool action selection, bounded repair action, artifact correction,
  rerun verification, continuation refresh, and blocker reclassification after
  attempted behavior.
- Rejected alternatives:
  - Dependency use: rejected because task truth, redaction, provider gating,
    and completion proof are local product semantics.
  - Isolated source adoption: rejected because no narrow source component was
    needed and product code must avoid outside-project and process vocabulary.
  - Central orchestration helper: rejected because behavior belongs in concrete
    owner domains, not a generic task utility.
  - Label-only improvement: rejected because SP016 required measured case
    outcome improvement caused by behavior.
- Expected callers: task assessment, host evaluation summaries, future planning
  and provider request consumers, verification/repair owners, artifact
  workflows, evidence/result proof projection, and product automation surfaces.
- Side-effect boundary: the lane is deterministic and pure. It does not read or
  write files, run commands, invoke providers, change provider defaults, expand
  allowlists, or access real provider configuration. Future side effects must
  enter through `ExecutionService` or a sanctioned owner.
- Truthfulness boundary: context ready, plan ready, request packet ready, tool
  strategy chosen, repair attempted, artifact corrected, verification executed,
  host evaluation observed, or blocker removed is not success. The six improved
  cases remain `partial` until evidence/result owns task-relevant complete
  proof.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/model.test.ts context/selection/model.test.ts planning/execution/model.test.ts provider/request/packet.test.ts tools/policy/strategy.test.ts verification/execution/model.test.ts verification/selection/model.test.ts artifacts/workflow/model.test.ts repair/loop/model.test.ts`
  - `rtk npm run build:ts`
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/model.test.ts runtime/api/host/runtime.test.ts runtime/api/host/io.test.ts result/host/verdict.test.ts evidence/host/proof.test.ts result/projection/repair/verdict.test.ts evidence/projection/repair/verdict.test.ts result/terminal/truth.test.ts`
  - `rtk npm run verify:host-surface`
  - `rtk npm run verify:route221-anti-false-success-gate`
  - `rtk npm run verify:result-contract`
- Rollback plan: remove the task assessment consumption of the new owner facts
  and return the affected non-complete cases to failed, blocked, or not-proven
  outcomes rather than promoting unproven success.

## Task Proof And Verdict Handoff

- Selected mode: structured port for local task proof/result contracts and
  behavior-only alignment for mature task path completion handoff.
- Owner domain: `evidence/task`, `result/task`, and
  `runtime/evaluation/task`.
- Reason for use: SP017 needed existing partial task cases to become complete
  through task-relevant proof, not host-output relabeling. The local handoff now
  checks proof items for context readiness, plan/request/tool readiness,
  verification, repair post-validation, artifact source receipts and validation,
  workspace target resolution, continuation freshness, and result input before
  a task verdict can report complete.
- Behavior to port: mature task paths separate work progress from completion,
  preserve original failures, keep continuation summaries as context aids, and
  expose structured machine-readable proof state rather than terminal text.
- Rejected alternatives:
  - Dependency use: rejected because proof requirements, redaction, and verdict
    ownership are local product semantics.
  - Isolated source adoption: rejected because no narrow source component was
    needed and copied names or public field shapes would not fit local owner
    boundaries.
  - Host verdict override: rejected because host evaluation output is not task
    success.
  - Complete-by-verification-attempt: rejected because selected or attempted
    verification is not proof.
- Expected callers: task assessment, future host task summaries,
  evidence/result projections, artifact workflows, repair loops, continuation
  checks, and product automation surfaces.
- Side-effect boundary: the proof handoff is deterministic and pure. It does
  not read or write files, run commands, invoke providers, broaden tool
  allowlists, enable live providers, or access real provider configuration.
- Truthfulness boundary: context selected, plan ready, request shaped, tool
  strategy chosen, repair attempted, artifact corrected, verification attempted,
  host output observed, or status rendered is not success. `result/task` reports
  complete only when `evidence/task` has no missing proof items; all verdict
  surfaces keep `terminalSuccessClaim: false`.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/model.test.ts evidence/task/proof.test.ts result/task/verdict.test.ts`
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/model.test.ts context/selection/model.test.ts planning/execution/model.test.ts provider/request/packet.test.ts tools/policy/strategy.test.ts verification/execution/model.test.ts verification/selection/model.test.ts artifacts/workflow/model.test.ts repair/loop/model.test.ts evidence/task/proof.test.ts result/task/verdict.test.ts`
  - Current deterministic coverage converts `failed-check-repair`,
    `pathless-workspace-question`, `source-report`, `structured-artifact`, and
    `resume-from-context` to complete while keeping `rollback-recovery` partial
    with exact post-repair verification blockers.
- Rollback plan: remove task proof/verdict consumption from task assessment and
  return the completed target cases to partial rather than allowing host output
  or task-lane progress to stand in for evidence/result completion.

## Task Collaboration And Planning Policy

- Selected mode: behavior-only alignment.
- Owner domain: future implementation should stay under `planning`,
  `tools/policy`, `turn`, `session/continuation`, `presentation`, and
  `runtime/events`.
- Reason for use: reliable task completion needs goal facts, ambiguity handling,
  user-question states, assumption tracking, plan revision, and tool policy to
  operate together.
- Behavior to align: mature interactive agents separate accepted input,
  steering/follow-up queues, active tools, command context, progress events, and
  session state from the low-level model loop.
- Rejected alternatives:
  - Dependency use: rejected because collaboration policy and authority states
    are local product semantics.
  - Isolated source adoption: rejected because queue and interaction behavior
    should be domain-modeled locally and source copying would risk importing
    unsuitable names and UX assumptions.
  - Terminal-prose policy: rejected because terminal rendering cannot own
    task-state or success semantics.
- Expected callers: planning runtime, CLI, host status, session continuation,
  tool policy, provider request preparation, and product presentation.
- Side-effect boundary: collaboration decisions must not imply write authority,
  provider invocation, tool execution, or verification execution. Side effects
  still require the sanctioned owners and `ExecutionService`.
- Truthfulness boundary: a plan, assumption, question, user reply, tool choice,
  or handoff is not task success. Missing or risky ambiguity must stay blocked
  or pending until resolved.
- Validation evidence: future routes should test ambiguous targets, unclear
  success criteria, denied authority, changed instructions, risky assumptions,
  and plan revision after failure.
- Rollback plan: remove collaboration policy consumers and fall back to existing
  planning facts and status blockers without changing runtime truth owners.

## Artifact Workflow Receipts

- Selected mode: structured port.
- Owner domain: `packages/ts-shell/src/artifacts/workflow/`.
- Reason for use: non-code task completion needs durable deliverables with
  source receipts, format checks, and task-specific validation.
- Behavior to port: artifact intent, source receipt policy, output path facts,
  format/render or parse validation, session/host summaries, and evidence/result
  verdict inputs for documents, reports, data outputs, slides, and exports.
- Rejected alternatives:
  - Dependency use: rejected because source policy, redaction, artifact paths,
    and success verdicts are local product semantics.
  - Isolated source adoption: rejected until a self-contained artifact component
    and license/notice path are identified.
  - Reusing edit/mutation as the artifact owner: rejected because artifact
    tasks need source and format semantics beyond code edits.
- Expected callers: planning, context acquisition, verification, session store,
  host runtime, product presentation, and future artifact-specific commands.
- Side-effect boundary: artifact writes must use sanctioned execution or an
  explicitly scoped artifact owner. This adoption does not add arbitrary
  writers, browser automation, external tool servers, or dynamic package
  loading.
- Truthfulness boundary: artifact path created, file exists, export emitted, or
  source read is not completion. Task-relevant artifact validation must feed
  evidence/result before success.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- artifacts/workflow/model.test.ts`
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/model.test.ts`
  - Current deterministic coverage includes report artifact intent, structured
    data artifact intent, source receipts, format expectations, invalid
    artifact state, validation failed state, correction to validation-passed,
    unsafe path blocker, missing source blocker, and not-proven artifact state.
- Rollback plan: keep artifact requests blocked/not-proven and preserve existing
  code-focused mutation/verification lanes.

## Task Verification Selection

- Selected mode: structured port.
- Owner domain: `packages/ts-shell/src/verification/selection/`.
- Reason for use: task assessment needed a first-class selector that records
  why a check was selected, what it proves, what it does not prove, blockers,
  fallback verification, and evidence/result eligibility.
- Behavior to port: task-kind-specific selection for code edit, debug repair,
  report/artifact validation, structured output validation, continuation
  freshness, blocked and unsupported states.
- Rejected alternatives:
  - Dependency use: rejected because proof eligibility and false-success
    boundaries are local product semantics.
  - Isolated source adoption: rejected because no source copy is needed and
    product vocabulary must stay domain-based.
  - Keeping selection inside task evaluation: rejected because verification
    selection is a verification-domain responsibility.
- Expected callers: task assessment, verification result boundaries, future
  planning/context handoff, evidence/result verdict inputs, and host
  evaluation summaries.
- Side-effect boundary: selection records facts only. It does not run commands,
  invoke providers, read files, apply edits, or write artifacts.
- Truthfulness boundary: selection, selected checks, selected-but-not-run
  states, failed checks, and insufficient checks are not success. Only passed
  task-relevant verification can become evidence/result input.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- verification/selection/model.test.ts`
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/model.test.ts`
- Rollback plan: remove selector consumption from task assessment and keep
  task cases not-proven or failed rather than upgrading success.

## Task Repair Decision Loop

- Selected mode: structured port.
- Owner domain: `packages/ts-shell/src/repair/loop/`.
- Reason for use: task assessment needed explicit diagnosis, repair
  eligibility, repair action, failed repair, succeeded-but-unverified,
  post-validation failed, retry/user-blocked, and
  original-failure-preserved facts.
- Behavior to port: failed verification diagnosis, bounded repair eligibility,
  repair action execution facts, repair failed state, post-validation states,
  retry blocker facts, and original failure preservation.
- Rejected alternatives:
  - Dependency use: rejected because local repair truth must align with
    evidence/result verdict semantics.
  - Isolated source adoption: rejected because no external repair loop source
    was required.
  - Repair proposal as success: rejected because repair apply or proposal is
    not success without post-repair validation.
- Expected callers: task assessment, verification result boundary, edit repair
  lanes, evidence/result verdicts, and future host task summaries.
- Side-effect boundary: repair decision is a pure model. It does not apply
  repairs, run commands, or mutate workspace state.
- Truthfulness boundary: diagnosed, eligible, proposed, attempted, failed,
  post-validation passed/partial, and succeeded-unverified repair facts are not
  success. Post-repair validation and evidence/result verdict remain required.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- repair/loop/model.test.ts`
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/model.test.ts`
- Rollback plan: remove repair decision consumption from task assessment and
  keep failed repair cases failed/not-proven with preserved original blockers.

## Provider Prompt And Response Contract

- Selected mode: structured port.
- Owner domain: `provider/request`, `provider/response`, `planning`,
  `context/acquisition`, `tools`, `verification`, `evidence`, and `result`.
- Reason for use: provider output must be shaped toward task completion and
  classified when insufficient, without making provider completion success.
- Behavior to port: task-shaped request packets, response contracts, structured
  proposal parsing, insufficient-output classification, fallback facts, and
  report-safe redaction.
- Rejected alternatives:
  - Dependency use: rejected because request shaping, provider gating, redaction,
    and truth boundaries are local product semantics.
  - Isolated source adoption: rejected because provider prompt behavior is not a
    self-contained source component and must avoid external naming.
  - Broad provider hooks: rejected until secret/auth boundaries and concrete
    consumers are explicitly scoped.
- Expected callers: provider request boundary, provider response adapter,
  planning runtime, tool handoff, verification intent, task bench, and host
  evaluation.
- Side-effect boundary: real providers remain default-off and explicit opt-in.
  No manual provider secret reads, no default live execution, no broad auth
  refresh, and no raw provider output in replay/status.
- Truthfulness boundary: provider request prepared, provider stream projected,
  fallback completed, response parsed, or proposal generated is not task
  success. Only evidence/result can prove completion after task-relevant
  checks.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- provider/request/packet.test.ts`
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/model.test.ts`
  - Future routes should still test malformed response, insufficient output,
    fallback, provider failure, redaction, and opt-in live triage.
- Rollback plan: keep existing provider boundary and response adapter behavior;
  block task-shaped provider requests as unsupported if the contract regresses.

## Read-Only Tool Scheduling Result Collection

- Selected mode: behavior-only alignment.
- Owner domain: `packages/ts-shell/src/tools/` with policy facts under
  `tools/policy/` and scheduling facts under `tools/scheduling/`.
- Reason for use: read-only parallel tool execution needs a mature async
  result-collection behavior that waits for all independent work and preserves
  caller-facing order even when completion order differs.
- Behavior aligned: the runtime uses `Promise.allSettled`-style collection for
  eligible read-only parallel groups, then projects result details and tool
  result messages in the original tool-call order.
- Public reference:
  `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled`
  documents `Promise.allSettled` as returning settlement objects in input order
  regardless of completion order.
- Rejected alternatives:
  - Dependency use: rejected because scheduling policy, tool effects, redaction,
    replay, and truth boundaries are local product semantics.
  - Isolated source adoption: rejected because no source copy is needed and
    external naming/provenance should not enter product code.
  - Direct broad scheduler port: rejected because mutation concurrency,
    external tool servers, dynamic loading, and browser automation are out of
    scope.
- Expected callers: tool batch dispatch, runtime loop, host evaluation, runtime
  events, replay, product surface, and CLI/session status.
- Side-effect boundary: tool execution still enters only through the sanctioned
  tool dispatch seam and the existing execution service boundary below tool
  owners. This adoption does not add command allowlist entries, arbitrary
  writers, external tool servers, live provider behavior, or browser automation.
- Truthfulness boundary: scheduling, policy allow, dispatch, group completion,
  tool result messages, next-turn preparation, events, replay, product surface,
  CLI/session status, and host evaluation remain `terminalSuccessClaim: false`.
  Evidence/result remains the only complete-proof owner.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- toolBatchDispatch.test.ts`
  - `rtk npm run test -w packages/ts-shell -- providerBoundary.test.ts`
  - `rtk npm run test -w packages/ts-shell -- runtime/api/host/runtime.test.ts`
  - `rtk npm run test -w packages/ts-shell -- runtime/events/projection.test.ts session/replay/state.test.ts presentation/surface/model.test.ts session/presentation/envelope.test.ts core/shell/cliSessionProductSurface.test.ts`
  - `rtk npm run test -w packages/ts-shell -- runtime/loop/truthMatrix.test.ts runtime/loop/finalization.test.ts runtime/loop/completionPacket.test.ts runtime/events/stream.test.ts evidence/projection/repair/verdict.test.ts result/projection/repair/verdict.test.ts`
- Rollback plan: disable `parallel` scheduling back to metadata-only or
  sequential dispatch in `tools/toolBatchDispatch.ts` while preserving the
  report-safe scheduling facts for diagnosis.

## Multi-Target Mutation Settlement Ordering

- Selected mode: behavior-only alignment.
- Owner domain: `packages/ts-shell/src/edit/multifile/` with proof and verdict
  facts under `evidence/projection/mutation/` and
  `result/projection/mutation/`.
- Reason for use: controlled multi-target mutation needs deterministic ordered
  settlement that preserves every target outcome, including partial failure and
  rollback facts, while keeping caller-facing evidence stable.
- Behavior aligned: the runtime records an ordered target queue, executes
  mutation targets sequentially, preserves applied and failed target facts,
  records rollback observations after partial failure, and projects the
  evidence/result verdict from the settled facts instead of treating apply or
  rollback as success.
- Rejected alternatives:
  - Dependency use: rejected because mutation authority, stale-read, restore
    planning, verification, redaction, and truth boundaries are local product
    semantics.
  - Isolated source adoption: rejected because no external source copy is needed
    and product code must stay domain-named.
  - Broad parallel mutation: rejected because SP011 does not prove concurrent
    mutation safety for conflict, authority, snapshot, ordering, and rollback.
- Expected callers: runtime loop, runtime events, host evaluation, replay,
  product surface, CLI/session status, and host evidence/result projection.
- Side-effect boundary: file reads and writes enter only through sanctioned
  `ExecutionService` file methods. This adoption does not add live provider
  behavior, command allowlist entries, browser automation, external tool
  servers, dynamic loading, arbitrary writers, or uncontrolled parallel
  mutation.
- Truthfulness boundary: plan creation, classification, conflict pass,
  authority, stale-read, snapshot, queue readiness, target apply, rollback,
  verification observations, repair eligibility, events, host evaluation,
  replay, product surface, and CLI/session status remain
  `terminalSuccessClaim: false`. Evidence/result remains the only complete
  proof owner.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- edit/multifile/model.test.ts runtime/loop/mutationRuntime.test.ts runtime/api/host/runtime.test.ts`
  - `rtk npm run test -w packages/ts-shell -- edit/multifile/model.test.ts runtime/loop/mutationRuntime.test.ts runtime/events/projection.test.ts session/replay/state.test.ts presentation/surface/model.test.ts session/presentation/envelope.test.ts core/shell/cliSessionProductSurface.test.ts`
  - `rtk npm run build -w packages/ts-shell`
- Rollback plan: remove the optional `mutationRuntimeBoundary` connection and
  keep the existing single-target mutation recovery lane while preserving
  report-safe blocked/not-proven facts for multi-target attempts.

## Bounded Mutation Group Settlement

- Selected mode: behavior-only alignment.
- Owner domain: `packages/ts-shell/src/edit/multifile/` with proof facts under
  `evidence/projection/mutation/`, result verdicts under
  `result/projection/mutation/`, and consumer projections under runtime,
  replay, and presentation owners.
- Reason for use: bounded multi-target mutation needs async group collection
  for independent targets while preserving deterministic target-order
  settlement, explicit blockers, rollback facts, and evidence/result-owned
  terminal truth.
- Behavior aligned: eligible independent targets enter capped groups, group
  attempts settle after all member attempts finish, settlement facts are emitted
  in original target order, later groups skip after a prior group failure, and
  rollback observations preserve the original failure instead of becoming task
  success.
- Rejected alternatives:
  - Dependency use: rejected because mutation authority, stale-read,
    snapshot/restore, rollback, redaction, and proof semantics are local product
    responsibilities.
  - Isolated source adoption: rejected because no source copy is needed and
    product code must stay domain-named.
  - Uncontrolled broad parallel mutation: rejected because only independently
    eligible targets with authority, stale-read, snapshot, rollback, conflict,
    and bounded-group proof may run together.
- Expected callers: runtime loop, runtime events, host evaluation, replay,
  product surface, CLI/session status, evidence proof, and result verdict.
- Side-effect boundary: file reads and writes still enter only through
  sanctioned `ExecutionService` file methods. This adoption does not add live
  provider behavior, command allowlist entries, browser automation, external
  tool servers, dynamic loading, arbitrary writers, or execution-boundary
  bypasses.
- Truthfulness boundary: mutation graph, parallel eligibility, group creation,
  target apply, group apply, settlement, rollback, verification observations,
  repair eligibility, events, host evaluation, replay, product surface, and
  CLI/session status remain `terminalSuccessClaim: false`. Evidence/result
  remains the only complete proof owner.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- edit/multifile/model.test.ts runtime/loop/mutationRuntime.test.ts runtime/api/host/runtime.test.ts runtime/events/projection.test.ts session/replay/state.test.ts presentation/surface/model.test.ts session/presentation/envelope.test.ts core/shell/cliSessionProductSurface.test.ts`
  - `rtk npm run build -w packages/ts-shell`
  - `rtk npm run verify:route221-anti-false-success-gate`
  - `rtk npm run verify:result-contract`
- Rollback plan: disable the explicit bounded parallel input and fall back to
  one-target sequential groups while preserving graph, eligibility, settlement,
  blocked, and not-proven facts for diagnosis.

## Host JSON Framing And Package Readiness

- Selected mode: structured port.
- Owner domain: `packages/ts-shell/src/runtime/api/host/` for host JSON and
  exit classification, `packages/ts-shell/src/cli/host/` for CLI delegation,
  `packages/ts-shell/src/runtime/distribution/` for package readiness, and
  `scripts/` for repository smoke.
- Reason for use: the existing in-process host contract and deterministic
  evaluation runtime needed a package-facing non-interactive surface with
  stable JSON framing, event envelopes, exit classification, package readiness,
  default-off provider checks, redaction, and truth boundaries.
- Behavior ported: command JSON parsing delegates to host validation, host
  runtime dispatch remains the execution owner, runtime events are projected
  into host event envelopes with ordering/category/severity, exit classification
  is derived from host blockers/status/evidence/result truth, and package
  readiness checks built importability, CLI artifact availability, host command
  availability, JSON shape, default-off provider blocking, evaluation, and
  redaction without live providers.
- Rejected alternatives:
  - Dependency use: rejected because the framing, blocker taxonomy, redaction,
    replay, and evidence/result truth boundaries are local product semantics.
  - Isolated source adoption: rejected because no source copy is needed and no
    license/notice obligations should enter product code for this surface.
  - Broad SDK/RPC server: rejected because SP013 proves a package/CLI host API
    surface, not server behavior, dynamic loading, external tool servers, or
    default live-provider execution.
- Expected callers: package consumers, repository smoke scripts, future narrow
  host adapters, runtime evaluation, session replay/status, and evidence/result
  truth tests.
- Side-effect boundary: host execution remains inside `createHostRuntime` and
  existing provider/tool/edit/session owners. The smoke script imports the built
  package and does not spawn live providers, load dynamic packages, launch
  browser automation, expand command allowlists, or bypass `ExecutionService`.
- Truthfulness boundary: command accepted, JSON emitted, CLI exit zero, event
  envelope, status snapshot, final response, package smoke, distribution
  readiness, provider facts, tool facts, mutation facts, evaluation cases,
  replay facts, and terminal rendering remain `terminalSuccessClaim: false`.
  Evidence/result remains the only complete-proof owner, and missing proof stays
  not-proven.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- result/host/verdict.test.ts runtime/api/host/runtime.test.ts runtime/api/host/io.test.ts cli/host/runner.test.ts runtime/distribution/model.test.ts smoke.test.ts entrypoints/cliArgs.test.ts`
  - `rtk npm run test -w packages/ts-shell -- runtime/events/projection.test.ts runtime/events/stream.test.ts session/replay/state.test.ts session/presentation/envelope.test.ts core/shell/cliSessionProductSurface.test.ts provider/response/synthetic.test.ts runtime/loop/providerBoundary.test.ts tools/toolBatchDispatch.test.ts edit/multifile/model.test.ts runtime/loop/mutationRuntime.test.ts evidence/projection/repair/verdict.test.ts result/projection/repair/verdict.test.ts`
  - `rtk npm run build -w packages/ts-shell`
  - `rtk npm run verify:host-surface`
  - `rtk npm run verify:route221-anti-false-success-gate`
  - `rtk npm run verify:result-contract`
- Rollback plan: remove the `--host-command` CLI option and package readiness
  script while keeping the in-process host runtime and deterministic evaluation
  contract intact; package consumers would fall back to direct owner tests until
  a corrected host surface is restored.
