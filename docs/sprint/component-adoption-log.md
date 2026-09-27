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
    `rollback-recovery`, `pathless-workspace-question`,
    `test-impact-question`, `owner-context-question`, `source-report`,
    `structured-artifact`, `incident-summary-report`, `csv-summary-artifact`,
    and `resume-from-context` to complete while preserving skipped-live and
    unsupported outcomes as non-complete.
- Rollback plan: remove task proof/verdict consumption from task assessment and
  return the completed target cases to partial rather than allowing host output
  or task-lane progress to stand in for evidence/result completion.

## Task Proof Review And Live Readiness Bridge

- Selected mode: structured port for local proof-record and live-readiness
  contracts, with behavior-only alignment for opt-in live task triage.
- Owner domain: `evidence/task`, `result/task`, and
  `runtime/evaluation/task`.
- Reason for use: SP018 needed every deterministic complete task case to carry
  auditable task-relevant proof and needed live task triage facts without
  enabling live providers or treating readiness as execution proof.
- Behavior to port: per-case proof records tying required proof, present proof,
  evidence input, result verdict, redaction status, and live readiness status;
  negative controls for missing proof classes; default-off readiness facts for
  ready, blocked, skipped, unsupported, and unsafe live task states.
- Rejected alternatives:
  - Dependency use: rejected because proof records, redaction expectations,
    live gating, and task verdict semantics are local product contracts.
  - Isolated source adoption: rejected because no narrow source component was
    needed and external naming or field shapes would not fit local owner
    boundaries.
  - Host-output review: rejected because host output remains observation, not
    task success.
  - Live-provider run by default: rejected because live providers must remain
    explicit opt-in with clean homes and no manual secret inspection.
- Expected callers: task assessment, future host task summaries,
  evidence/result projections, artifact workflows, repair loops, continuation
  checks, and future opt-in live triage gates.
- Side-effect boundary: proof records and live readiness are deterministic and
  pure. They do not read or write files, run commands, invoke providers,
  inspect provider configuration, broaden allowlists, enable live defaults, or
  access real provider material.
- Truthfulness boundary: proof record creation, host output, task readiness,
  provider/auth readiness, manual review status, verification attempt, artifact
  presence, repair attempt, and live-readiness facts are not success. Completion
  still requires evidence/task proof and result/task verdict with no missing
  proof.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/model.test.ts evidence/task/proof.test.ts result/task/verdict.test.ts`
  - Current deterministic coverage audits `single-file-edit`,
    `coordinated-edit`, `failed-check-repair`,
    `rollback-recovery`, `pathless-workspace-question`,
    `test-impact-question`, `owner-context-question`, `source-report`,
    `structured-artifact`, `incident-summary-report`, `csv-summary-artifact`,
    and `resume-from-context` as complete through proof records.
  - Negative controls reject missing final verification, missing post-repair
    validation, missing source receipts, invalid structured-artifact
    validation, stale continuation context, host output without task proof, and
    artifact presence without validation.
  - Live readiness remains default-off and no live provider is required for
    normal validation.
- Rollback plan: remove proof-record and live-readiness fields from task
  assessment and keep existing task proof/verdict handoff; affected live task
  claims would return to skipped or blocked rather than becoming unproven
  success.

## Live Task Gate Execution

- Selected mode: structured port for local live gate-plan contracts, with
  behavior-only alignment for existing explicit opt-in provider gates.
- Owner domain: `runtime/evaluation/task`, `provider/request`,
  `runtime/api/host`, `verification`, `artifacts/workflow`,
  `evidence/task`, and `result/task`.
- Reason for use: SP019 needed no-write audited task paths to move from generic
  readiness into executable live gate plans and observed live outcomes or exact
  hard blockers, without enabling provider defaults.
- Behavior to port: safe class, explicit gate identity, provider/auth
  requirements, allowed tool and write policy, request-packet status,
  validation plan, live outcome or hard blocker, evidence/result status,
  redaction status, and next fix.
- Rejected alternatives:
  - Dependency use: rejected because live gating, redaction, task proof, and
    evidence/result semantics are local product contracts.
  - Isolated source adoption: rejected because no source component was copied
    and product code must stay domain-named.
  - Readiness-only update: rejected because SP019 required real opt-in gate
    attempts where safe.
  - Live-provider default enablement: rejected because provider execution must
    stay explicit opt-in with isolated runtime homes.
- Expected callers: task assessment, future host task summaries, provider
  request preparation, verification/artifact owners, evidence/result verdicts,
  and opt-in live task gates.
- Side-effect boundary: product live gate plans are deterministic. Actual live
  execution remains outside default validation and enters only through existing
  explicit opt-in scripts with isolated runtime homes and redacted output. This
  adoption does not add dynamic loading, browser automation, external tool
  servers, command allowlist expansion, arbitrary writers, or execution-boundary
  bypasses.
- Truthfulness boundary: live-ready, provider readiness, auth readiness,
  provider called, model turn attempted, no-mutation check, no-apply check,
  host output, and gate execution are not task success. Complete remains owned
  by evidence/result proof with task-relevant validation; the observed live
  outcomes are provider-network blockers, not live-complete task proof.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/model.test.ts evidence/task/proof.test.ts result/task/verdict.test.ts provider/request/packet.test.ts verification/execution/model.test.ts artifacts/workflow/model.test.ts`
  - `PRIVATE_AGENTS_REAL_PROVIDER_SMOKE=1 PRIVATE_AGENTS_LIVE_ANCHORED_PROVIDER_SMOKE=1 PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-real-anchored-smoke HOME=/tmp/private-agents-real-anchored-smoke-home USERPROFILE=/tmp/private-agents-real-anchored-smoke-home rtk node scripts/verify-real-provider-anchored-smoke.mjs` reached adapter approval and provider call, preserved no-write/no-apply/raw-output exclusion, passed focused module tests, and exited with provider-network status.
  - `PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-real-readonly-smoke HOME=/tmp/private-agents-real-readonly-smoke-home USERPROFILE=/tmp/private-agents-real-readonly-smoke-home rtk npm run verify:real-user-capabilities -- --real-readonly-coding-smoke` reached provider readiness, attempted the read-only model turn, preserved no mutation and redaction, and exited with provider-network status.
- Rollback plan: remove live gate-plan fields from task assessment and return
  target cases to default-off readiness while keeping deterministic proof and
  verdict handoff intact; live execution would remain available only through
  existing standalone gates.

## Task Core Case Expansion And Repair Validation

- Selected mode: structured port for local case/proof contracts and
  behavior-only alignment for mature save-point and post-action validation
  behavior.
- Owner domain: `runtime/evaluation/task`, `repair/loop`, `verification`,
  `artifacts/workflow`, `context/selection`, `evidence/task`, and
  `result/task`.
- Reason for use: SP020 required concrete task-driving behavior and measured
  deterministic outcome gains, including rollback recovery completion, at least
  four more realistic short-prompt cases, at least ten complete cases total,
  two debug/repair completions, three artifact/report/data completions, three
  pathless workspace/context completions, and one continuation completion.
- Behavior to port: per-case task facts that separate context, plan, request,
  tool strategy, repair, artifact correction, verification execution, proof,
  and verdict; explicit post-repair validation evidence before rollback
  recovery completion; source receipt and validation evidence for artifact
  cases; target-resolution proof for pathless workspace cases.
- Rejected alternatives:
  - Dependency use: rejected because task proof, redaction, live gating, and
    verdict semantics are local product contracts.
  - Isolated source adoption: rejected because no narrow self-contained source
    component was needed and product names must stay domain-based.
  - Outcome relabeling: rejected because complete cases must be backed by
    evidence/result proof, not host output, provider facts, or selected-but-not
    run checks.
  - Broad workflow rewrite: rejected because the current owner domains already
    carry the relevant deterministic task facts.
- Expected callers: task assessment, host evaluation summaries, future task
  bench scripts, repair and artifact owners, evidence/result projections,
  session/status surfaces, and future opt-in live task gates.
- Side-effect boundary: this adoption is deterministic and pure. It does not
  read or write files, run commands, invoke providers, broaden command
  allowlists, enable live providers, inspect private provider configuration, or
  add arbitrary writers. Future side effects must enter through
  `ExecutionService` or a sanctioned owner.
- Truthfulness boundary: task case creation, context selection, plan readiness,
  request packet readiness, tool strategy, repair validation evidence, artifact
  correction, verification execution, live readiness, host output, and smoke
  pass are not terminal task success. Complete remains owned by evidence/task
  proof and result/task verdict with no missing proof.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/model.test.ts context/selection/model.test.ts planning/execution/model.test.ts provider/request/packet.test.ts tools/policy/strategy.test.ts verification/execution/model.test.ts verification/selection/model.test.ts artifacts/workflow/model.test.ts repair/loop/model.test.ts evidence/task/proof.test.ts result/task/verdict.test.ts`
  - Measured deterministic task assessment now reports 12 complete, 1 skipped,
    and 1 unsupported. Complete cases include two debug/repair cases, four
    artifact/report/data cases, three pathless workspace/context cases, and one
    continuation case.
  - Negative controls remain covered for missing final verification, missing
    post-repair validation, missing source receipts, invalid artifact
    validation, stale continuation context, host output without task proof, and
    artifact presence without validation.
- Rollback plan: remove the new task case definitions and validation-evidence
  consumption, returning rollback recovery to partial and the added cases to
  absent from the assessment rather than allowing unproven success.

## Live Task Execution Projection

- Selected mode: structured port for local live execution observations, with
  behavior-only alignment for the existing explicit read-only, anchored, and
  provider-readiness gates.
- Owner domain: `runtime/evaluation/task`, `provider/request`,
  `verification`, `artifacts/workflow`, `evidence/task`, and `result/task`.
- Reason for use: SP021 needed audited no-write and low-risk task paths to move
  beyond readiness into repeatable opt-in live case outcomes while preserving
  default-off provider behavior and evidence/result terminal truth.
- Behavior to port: explicit gate observation metadata, changedFiles empty
  visibility, no-mutation and no-apply checks, redaction status, provider
  outcome and fallback metadata, verification/artifact validation status, proof
  items, complete/useful-partial/blocked/unsafe classification, and exact
  blockers for non-executed cases.
- Rejected alternatives:
  - Dependency use: rejected because live gate semantics, redaction, and task
    proof are local product contracts.
  - Isolated source adoption: rejected because no narrow source component was
    needed and product names must stay domain-based.
  - Readiness-only update: rejected because SP021 required executed live task
    cases where safe.
  - Live-provider default enablement: rejected because provider execution must
    remain explicit opt-in with isolated runtime homes.
  - Artifact write execution: rejected until a sanctioned write/manual-review
    gate exists; report and data cases use no-write artifact dry-run.
- Expected callers: task assessment, future host task summaries, explicit live
  gate scripts, provider request preparation, verification/artifact owners,
  evidence/result verdicts, and product automation surfaces.
- Side-effect boundary: live execution projection is deterministic and consumes
  safe metadata only. Actual provider calls remain in existing explicit opt-in
  scripts and approved adapters; artifact dry-run records validation without
  writing. This adoption does not add dynamic loading, browser automation,
  external tool servers, command allowlist expansion, arbitrary writers, or
  execution-boundary bypasses.
- Truthfulness boundary: live-ready, provider called, fallback attempted,
  smoke pass, no-mutation, no-apply, verification attempt, artifact validation,
  host output, and live execution metadata are not terminal success. Complete
  or useful partial live outcomes require task proof handoff, and every surface
  keeps `terminalSuccessClaim: false`.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/model.test.ts`
  - `rtk npm run build:ts`
  - Focused tests prove at least four live-ready target cases, at least three
    safe executed observations, at least two complete or useful partial
    outcomes with task proof, one artifact/data execution, one
    pathless/context execution, exact provider-network blockers, changedFiles
    empty visibility, no mutation, no apply, redaction, and no success from
    provider calls or gate passes.
  - Manual live smoke evidence: read-only smoke passed; anchored provider smoke
    passed with the primary provider; fallback was configured but skipped
    because the primary passed; no raw provider output leaked; no write/no
    apply was preserved.
- Rollback plan: remove `liveExecutions` and artifact dry-run readiness from
  task assessment, returning affected cases to readiness-only or
  manual-review-required states while keeping deterministic task proof and
  verdict handoff intact.

## Autonomous Development Task Path Expansion

- Selected mode: structured port for local task-path contracts and
  behavior-only alignment for mature session/context/tool/verification
  behavior.
- Owner domain: `context/selection`, `provider/request`,
  `runtime/evaluation/task`, `repair/loop`, `artifacts/workflow`,
  `verification`, `evidence/task`, and `result/task`.
- Reason for use: SP022 required the project to become visibly better at
  short-prompt autonomous work, not merely add labels or proof records. The
  mature implementation patterns inspected were per-turn state snapshots,
  cwd-bound session runtime setup, read-only tool set assembly, context/resource
  separation, failure taxonomy, and post-action validation. The local product
  needed those behaviors translated into current owner domains without copying
  names, source, dynamic loading, SDK/RPC, or provider defaults.
- Behavior to port: safe context packet construction with package paths,
  related paths, verification candidates, omitted-path accounting, and
  report-safe summaries; request packet handoff of context summary,
  verification candidates, and omitted context count; six additional
  short-prompt task cases that exercise pathless workspace discovery, script
  impact selection, debug repair, report validation, structured-data
  validation, owner-risk reporting, and continuation freshness; deterministic
  mix gates for complete counts and live no-write observations.
- Rejected alternatives:
  - Dependency use: rejected because task proof, redaction, provider gating,
    verification, repair, and artifact validation are local product semantics.
  - Isolated source adoption: rejected because no narrow source component was
    required and copied field names or product structure would violate local
    naming and ownership constraints.
  - Case-only expansion: rejected because SP022 requires concrete
    task-driving behavior; context and request owners now carry stronger facts
    consumed by the task lane.
  - Broad workflow rewrite: rejected because the existing owner domains already
    carry the relevant safe path and broad rewrite would risk shims, defaults,
    or arbitrary writers.
- Expected callers: task assessment, host evaluation summaries, future task
  bench scripts, context/planning consumers, provider request preparation,
  verification and repair owners, artifact workflows, evidence/result
  projections, session/status surfaces, and future explicit live gates.
- Side-effect boundary: this adoption is deterministic and pure. It does not
  read or write files, run commands, invoke providers, broaden command
  allowlists, enable live providers, inspect private provider configuration, add
  browser automation, add external tool servers, or add arbitrary writers.
  Future side effects must enter through `ExecutionService` or a sanctioned
  owner.
- Truthfulness boundary: context packet construction, request shaping, case
  creation, tool strategy, repair action, artifact correction, verification
  execution, live observation, host output, smoke pass, and deterministic count
  are not terminal task success. Complete remains owned by evidence/task proof
  and result/task verdict with no missing proof; all affected surfaces keep
  `terminalSuccessClaim: false`.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- context/selection/model.test.ts provider/request/packet.test.ts runtime/evaluation/task/model.test.ts`
  - Focused task tests now report 18 deterministic complete cases, 1 skipped,
    and 1 unsupported. Complete cases include 4 pathless workspace/context
    cases, 3 debug/repair cases, 7 artifact/report/data cases, and 2
    continuation/resume cases.
  - The task mix gate preserves two no-write live execution observations as
    complete/useful partial with task proof and keeps provider calls and gate
    passes non-success.
- Rollback plan: remove the six new task case definitions and the richer
  context/request packet fields, returning task assessment to the previous 12
  complete deterministic cases while preserving SP021 live execution projection
  and existing proof/verdict handoff.

## Live Task Run Reporting

- Selected mode: structured port for local live run contracts and behavior-only
  alignment for existing explicit read-only, anchored provider, and reviewed
  isolated apply gates.
- Owner domain: `runtime/evaluation/task`, `runtime/api/host`,
  `provider/request`, `artifacts/workflow`, `evidence/task`, `result/task`, and
  repeatable verification scripts.
- Reason for use: SP023 required repeatable opt-in live task entries with exact
  requirements and measured outcomes, and SP024 required the same report owner
  to move write-capable entries through patch intent, dry-run diff, explicit
  review authority, isolated apply metadata, post-apply verification, and
  task-proof accounting without granting real-workspace write authority. The
  local product needed a task-owned report that consumes explicit gate
  observations, classifies executed/non-executed entries, and preserves terminal
  truth in evidence/result.
- Behavior to port: machine-readable live task entry definitions, default-off
  exact blockers, explicit gate observation consumption, safe no-write and
  manual-review classifications, hard gate summary counts, redaction checks,
  fallback metadata, changedFiles empty visibility, no-apply/no-mutation facts,
  patch intent metadata, safe plan state, dry-run diff state, explicit review
  authority state, isolated fixture apply state, real-workspace mutation
  prevention, post-apply verification state, rollback status, exact blockers,
  and repeatable script output that excludes raw provider output and patch
  bodies.
- Rejected alternatives:
  - Dependency use: rejected because live gate semantics, task proof,
    redaction, and result truth are local product contracts.
  - Isolated source adoption: rejected because no narrow source component was
    needed and copied names or public field shapes would violate local product
    naming boundaries.
  - Deterministic-only expansion: rejected because SP023 requires opt-in live
    execution through existing explicit gates.
  - Default live provider behavior: rejected because live providers must remain
    explicit opt-in with isolated homes and no manual private config inspection.
  - Unreviewed write execution: rejected because patch intent and dry-run diff
    are not authority; isolated apply metadata is accepted only behind explicit
    reviewed-apply opt-in and real-workspace mutation remains forbidden.
- Expected callers: task assessment, host evaluation summaries, explicit live
  verification scripts, provider request preparation, artifact validation,
  evidence/result proof projection, session/status surfaces, and future
  artifact/manual-review gates.
- Side-effect boundary: the live run model is deterministic and pure. Actual
  provider calls happen only in the repeatable script through existing explicit
  read-only and anchored provider gates. Reviewed apply observations stay
  isolated-fixture metadata and require a separate explicit opt-in; they do not
  authorize real-workspace writes. The script does not print raw provider
  output, provider configuration, headers, tokens, private provider material, or
  patch bodies. This adoption does not add dynamic loading, browser automation,
  external tool servers, command allowlist expansion, arbitrary writers,
  default live providers, or execution-boundary bypasses.
- Truthfulness boundary: live entry creation, provider readiness, provider call,
  gate pass, fallback metadata, host output, changedFiles empty, no mutation,
  no apply, patch intent, dry-run diff, review authority, isolated apply,
  artifact dry-run status, verification attempt, and live run status are not
  terminal task success. Complete or useful partial live outcomes require task
  proof handoff, and all affected surfaces keep `terminalSuccessClaim: false`.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/liveRun.test.ts`
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/liveRun.test.ts runtime/evaluation/task/model.test.ts`
  - `PRIVATE_AGENTS_LIVE_TASK_EXECUTION=1 PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-live-task-execution HOME=/tmp/private-agents-live-task-execution-home USERPROFILE=/tmp/private-agents-live-task-execution-home rtk npm run verify:live-task-execution`
  - Focused tests report 13 live entries, 12 executed observations in the
    reviewed fixture case, 11 complete or useful partial outcomes, 5
    write-capable patch-intent/dry-run observations, 4 reviewed isolated
    applies, 3 post-apply verification/task-proof outcomes, rollback useful
    partial, default-off blockers, redaction pass, and no terminal success from
    provider calls, patch intent, dry-run diff, review authority, or apply
    alone.
- Rollback plan: remove `liveRun.ts`, its focused tests, and
  `verify:live-task-execution`, returning live task assessment to SP021/SP022
  projection-only behavior while keeping deterministic task proof/verdict
  handoff intact.

## Shared Task Loop Runtime

> **⚠️ 本节描述的 `runtime/evaluation/task` 已删除（2026-09-19，C2）。**
> 本节正文仍以现在时描述该 owner，作为**采纳决策的历史记录**保留；
> 引用本节路径前请先读文末 L1191 附近的移除说明。删除理由：
> 该面需要 `dispatch => HostCommandResponse`，而其唯一生产者
> `createHostRuntime` 已随 CB-005 删除，故**无法被调用**。


- Selected mode: structured port for the local task-loop contract and
  behavior-only alignment for mature lifecycle, save-point, and queued input
  flow.
- Owner domain: `runtime/evaluation/task`, delegating step behavior to existing
  `context`, `planning`, `provider/request`, `provider/response`,
  `tools/policy`, `edit`, `verification`, `repair`, `artifacts/workflow`,
  `evidence/task`, and `result/task` owners.
- Reason for use: SP026 required the unified progression owner to become the
  product task-loop runtime, not another wrapper, case expansion, metadata
  projection, or script adapter. Targeted inspection of the mature local loop
  showed one shared low-level loop for prompt intake, context/request shaping,
  provider response, tool/action observations, next-turn preparation,
  queued steering/follow-up, and explicit stop conditions. Harness docs showed
  turn snapshots, save points, pending writes, and owner-separated session
  persistence. The local product needed the same single ordered runtime while
  preserving local evidence/result truth and sanctioned side-effect owners.
- Behavior ported: deterministic task cases and live run entries now call
  `runtime/evaluation/task/loop.ts`, which executes a report-safe ordered
  stage chain from goal/state through context, plan, request, provider turn,
  action, observation, verification, repair, proof, and verdict. The loop
  records owner-call evidence and terminal-success false claims. Deterministic
  and explicit live/live-ready paths differ only by model-output source and
  safe live observations; `progression.ts` delegates to loop output instead of
  owning another projection path.
- Rejected alternatives:
  - Dependency use: rejected because task proof, redaction, provider gating,
    write authority, and result truth are local product semantics.
  - Isolated source adoption: rejected because no narrow source component was
    safe to copy without importing unsuitable outside names, event shapes,
    dynamic hooks, provider defaults, SDK/RPC behavior, or session mutation
    semantics.
  - Behavior-only alignment alone: rejected because SP026 required current
    deterministic and explicit live paths to call the same local runtime.
  - Script-owned integration: rejected because verification scripts must remain
    thin callers and cannot own task behavior, progression, or terminal truth.
  - Label-only integration: rejected because stage fields without owner-call
    runtime evidence would preserve the SP025 projection-only state.
- Expected callers: task assessment, live task report, host evaluation
  summaries, explicit live verification scripts, evidence/result projections,
  future artifact/manual-review gates, and product status surfaces.
- Side-effect boundary: the task loop is deterministic and calls existing owner
  functions. Provider calls remain in existing explicit opt-in gates; file and
  command effects remain under sanctioned owners and `ExecutionService`. This
  adoption does not add provider defaults, browser automation, external tool
  servers, dynamic loading, command allowlist expansion, arbitrary writers,
  real-workspace write authority, SDK/RPC behavior, or private provider
  material access.
- Truthfulness boundary: task-loop execution, owner-call evidence, progression
  readiness, provider turn, action, observation, verification attempt, repair,
  dry-run diff, reviewed isolated apply, artifact validation, host output, and
  live report status are not task success. Complete remains owned by
  `evidence/task` and `result/task`; missing proof stays partial, blocked, or
  not-proven.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/model.test.ts runtime/evaluation/task/liveRun.test.ts`
  - `rtk npm run build:ts`
  - Focused tests prove at least six deterministic cases and at least six
    explicit live entries carry loop-owned prompt-to-verdict progression with
    owner-call evidence, write planning reaches dry-run/manual-review without
    complete proof, reviewed isolated apply entries require post-apply proof,
    and terminal success remains false outside evidence/result.
- Rollback plan: remove `loop.ts` and return deterministic assessment/live run
  construction to the previous SP025 projection-only path, while keeping
  evidence/result verdicts and non-success live/write safety claims intact.

## Mainline Live Task Receipt Execution

- Selected mode: structured port for local gate-receipt-to-task-entry
  execution, with behavior-only alignment for explicit live provider gate
  invocation.
- Owner domain: `runtime/evaluation/task`, delegating stage facts to
  `context/selection`, `planning/execution`, `provider/request`,
  `provider/response`, `tools/policy`, `edit`, `verification/execution`,
  `artifacts/workflow`, `repair/loop`, `evidence/task`, and `result/task`.
- Reason for use: SP027 required real opt-in live tasks to execute through
  `runTaskLoop`, not through script-owned per-entry observation construction.
  The local runtime already had a shared loop owner from SP026; the missing
  behavior was moving live gate receipt interpretation and reviewed isolated
  task-entry projection into the runtime owner while keeping scripts thin.
- Behavior ported: explicit live scripts now collect only safe read-only and
  anchored gate receipts. `runtime/evaluation/task/liveRun.ts` maps those
  receipts to read-only, pathless/context, artifact/report, continuation,
  write-planning, reviewed isolated edit, and debug/repair entries, then
  projects every entry through `runTaskLoop` with proof/verdict ownership.
  The measured live run executed 13 entries, reached 12 complete or useful
  partial outcomes, recorded 4 reviewed isolated applies, 3 post-apply
  verification/task-proof outcomes, a useful rollback/debug partial,
  artifact/report, continuation, pathless/context, read-only coverage, safe
  fallback metadata, and redaction pass.
- Rejected alternatives:
  - Dependency use: rejected because live task truth, redaction, write
    authority, and evidence/result proof are local product semantics.
  - Isolated source adoption: rejected because no narrow legal source
    component was needed; copying mature loop/session/provider code would risk
    unsuitable names, dynamic behavior, provider defaults, and side-effect
    semantics.
  - Script-owned entry generation: rejected because scripts may prepare input,
    set explicit gates, call the runtime, and print safe results only.
  - Behavior-only alignment alone: rejected because SP027 required current
    live task entries to call the local product task loop.
  - Terminal-output contract: rejected because terminal text must not become
    the machine API or success owner.
- Expected callers: `verify:live-task-execution`, task assessment, host
  evaluation summaries, future live recovery gates, artifact/manual-review
  gates, and evidence/result projections.
- Side-effect boundary: provider calls remain in existing explicit opt-in gates
  with isolated runtime homes and redacted output. The runtime owner consumes
  safe receipts only. Reviewed apply remains isolated and metadata-only for
  real workspace safety. This adoption does not add provider defaults, browser
  automation, external tool servers, dynamic loading, broad command expansion,
  arbitrary writers, broad SDK/RPC behavior, or private provider material
  access.
- Truth boundary: gate receipt, provider called, fallback attempted, patch
  intent, dry-run diff, review authority, isolated apply, post-apply
  verification attempt, artifact validation, task-loop progression, smoke pass,
  and live report status are not terminal task success. Complete remains owned
  by `evidence/task` and `result/task`; missing proof stays partial, blocked,
  skipped, or not-proven.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/liveRun.test.ts runtime/evaluation/task/model.test.ts`
  - `rtk npm run build:ts`
  - `rtk npm run verify:live-task-execution`
  - `PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real PRIVATE_AGENTS_LIVE_TASK_EXECUTION=1 PRIVATE_AGENTS_LIVE_WRITE_REVIEWED_APPLY=1 rtk npm run verify:live-task-execution`
- Rollback plan: remove gate receipt projection from `liveRun.ts` and return
  scripts to safe no-execution blockers rather than allowing scripts to own
  task entry success or write metadata.

## Live Quality And Workspace Readiness

- Selected mode: structured port for local write/artifact quality contracts,
  with behavior-only alignment for mature patch-safety, review/apply,
  post-action verification, and safe reporting patterns.
- Owner domain: `runtime/evaluation/task`, delegating action facts to `edit`,
  `verification/execution`, `repair/loop`, `artifacts/workflow`,
  `evidence/task`, and `result/task`; scripts remain thin gate callers.
- Reason for use: SP028 required live write/artifact entries to prove useful
  quality and reviewed real-workspace readiness, not just execution counts,
  patch intent, dry-run metadata, or blocker reports. Targeted inspection of
  local edit/write status, artifact workflow, evidence/result task proof, and
  the mature capability map showed the useful behavior pattern: bind target
  facts, classify diff/apply safety, require explicit review and isolation,
  preserve post-action verification, record exact blockers, and keep raw
  provider/edit/command material out of report-safe surfaces.
- Behavior ported: `runtime/evaluation/task/quality.ts` records safe quality
  facts for live write and artifact entries: task id, action kind, target file
  count, target match, hunk or section count, expected verification,
  verification relevance, manual correction status, apply scope, isolated apply
  status, real-workspace apply status, post-action verification, final
  readiness, exact requirements, blocker, and terminal-success false. The live
  report hard gate now requires at least five write/artifact quality records,
  three dry-run quality records, three reviewed isolated post-action
  verification records, two reviewed real-workspace readiness records, one
  disposable selected-workspace apply when the explicit gate is available, one
  repair-verification blocker, multi-file target metadata, artifact quality
  pass, exact blockers for manual corrections, and redaction.
- Rejected alternatives:
  - Dependency use: rejected because quality, write authority, redaction, and
    task proof are local product contracts.
  - Isolated source adoption: rejected because no narrow licensed component was
    needed; copying mature or reference code would risk unsuitable names,
    field shapes, dynamic behavior, provider defaults, and write semantics.
  - Behavior-only alignment alone: rejected because SP028 requires current live
    entries to emit concrete product-owned quality records and hard gates.
  - Script-owned quality records: rejected because scripts may invoke existing
    gates and pass safe receipts only; task behavior belongs to the runtime
    task owner.
  - Dry-run-only readiness: rejected because SP028 requires reviewed isolated
    apply plus post-action verification and one disposable selected-workspace
    apply when safe.
- Expected callers: `verify:live-task-execution`, task assessment, host
  evaluation summaries, future artifact/manual-review gates, future selected
  workspace apply gates, evidence/result projections, and product status
  surfaces.
- Side-effect boundary: quality record construction is deterministic and
  consumes safe receipts only. Provider calls remain in existing explicit
  opt-in gates. The selected-workspace apply gate runs only with
  `PRIVATE_AGENTS_LIVE_REAL_WORKSPACE_APPLY=1` in a disposable clean git
  worktree and reports safe metadata; it does not mutate the main workspace.
  This adoption does not add provider defaults, browser automation, external
  tool servers, dynamic loading, command allowlist expansion, arbitrary
  writers, broad SDK/RPC behavior, or private provider material access.
- Truthfulness boundary: quality records, target counts, dry-run diff status,
  review authority, isolated apply, selected-workspace apply metadata,
  post-action verification, artifact quality pass, host output, and hard-gate
  pass are not terminal task success. Complete remains owned by
  `evidence/task` and `result/task`; missing proof stays partial, blocked, or
  not-proven.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/liveRun.test.ts runtime/evaluation/task/model.test.ts evidence/task/proof.test.ts result/task/verdict.test.ts artifacts/workflow/model.test.ts edit/patch/plan/hunkSet.test.ts edit/patch/result/hunk.test.ts`
  - `rtk npm run build:ts`
  - `rtk npm run verify:live-task-execution`
  - `PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real PRIVATE_AGENTS_LIVE_TASK_EXECUTION=1 PRIVATE_AGENTS_LIVE_WRITE_REVIEWED_APPLY=1 PRIVATE_AGENTS_LIVE_REAL_WORKSPACE_APPLY=1 rtk npm run verify:live-task-execution`
  - Live validation reported 13 executed entries, 12 complete or useful
    partial, 7 quality records, 5 dry-run quality records, 3 reviewed isolated
    post-action verification records, 3 reviewed real-workspace readiness
    records, 1 disposable selected-workspace apply, 2 manual corrections, 1
    repair-verification blocker, multi-file quality metadata, artifact quality
    pass, read-only and anchored provider smokes passing with fallback
    configured/skipped after primary success, and redaction pass.
- Rollback plan: remove `quality.ts`, quality record projection, and the
  selected-workspace apply receipt path from `liveRun.ts` and
  `verify:live-task-execution`, returning live reports to reviewed isolated
  metadata only while preserving default-off gates, redaction, and
  evidence/result truth.

## Live Development Gauntlet Gate Contract

- Selected mode: structured port for local hard-gate summary contracts, with
  behavior-only alignment for mature task-loop completion discipline.
- Owner domain: `runtime/evaluation/task`, delegating task proof to
  `evidence/task` and verdict to `result/task`; scripts remain thin live gate
  callers.
- Reason for use: SP029 required the live report to prove real live development
  task outcomes, not only SP028 readiness, quality records, dry-run facts, or
  useful partial counts. The runtime summary now encodes the hard gates for
  completed task proof, reviewed disposable write apply plus post-apply proof,
  correction-free completed write tasks, completed debug/repair, and correction
  disposition.
- Behavior ported: `runTaskLiveReport` now reports and enforces
  `completedWithTaskProofCount`, `completedWriteTaskProofCount`,
  `reviewedDisposablePostApplyProofCount`,
  `correctionFreeCompletedWriteCount`, `correctionDispositionCount`, and
  `debugOrRepairComplete`. `verify:live-task-execution` prints those safe
  fields and exits nonzero when the runtime-owned hard gate is not passed under
  explicit live opt-in.
- Rejected alternatives:
  - Script-only threshold checks: rejected because scripts may set gates, call
    runtime, and print safe results only.
  - Useful-partial completion: rejected because SP029 requires at least five
    completed task-proof entries and at least three correction-free completed
    write tasks.
  - Manual correction tolerance without disposition: rejected because remaining
    correction must be carried as automated blocker or failing state.
  - Provider-output success: rejected because provider output and gate pass are
    non-terminal facts.
- Expected callers: `verify:live-task-execution`, task assessment, host
  evaluation summaries, future live development gates, and docs/status
  summaries.
- Side-effect boundary: the summary contract is deterministic and consumes only
  safe receipts and task-loop results. Provider calls and disposable selected
  workspace apply remain behind existing explicit opt-in gates and do not read
  or print private provider material.
- Truthfulness boundary: hard-gate pass is a live-gauntlet validation result,
  not terminal task success. Individual task success still requires
  evidence/task proof and result/task verdict; provider call, fallback metadata,
  dry-run diff, review authority, apply metadata, and output rendering remain
  non-success facts.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/liveRun.test.ts`
  - `PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real PRIVATE_AGENTS_LIVE_TASK_EXECUTION=1 PRIVATE_AGENTS_LIVE_WRITE_REVIEWED_APPLY=1 PRIVATE_AGENTS_LIVE_REAL_WORKSPACE_APPLY=1 rtk npm run verify:live-task-execution`
  - Live validation reported 13 executed entries, 11 completed with task proof,
    3 completed write tasks with reviewed disposable apply plus post-apply task
    proof and zero manual correction, 2 remaining manual corrections with safe
    disposition, completed debug/repair, artifact/report, continuation/context,
    selected-workspace apply, read-only and anchored provider smokes passing
    with fallback configured/skipped after primary success, and redaction pass.
- Rollback plan: remove the SP029 summary fields and stricter blockers from
  `liveRun.ts` and script output, returning the live report to SP028 quality
  readiness gates without weakening evidence/result task proof.

## Live Failure Driven Provider Coverage

- Selected mode: structured port for local provider coverage contracts, with
  behavior-only alignment for forced network failure injection through the
  existing approved anchored smoke gate.
- Owner domain: `runtime/evaluation/task`, `provider/request`,
  `provider/response`, and thin live smoke scripts.
- Reason for use: SP030 required live failures to drive code changes rather
  than blocker reporting. The initial explicit live run exposed provider-turn
  network/inconclusive coverage and a verifier classifier bug that read the
  safe taxonomy header as a config result. The runtime summary now requires
  primary provider success, configured fallback skipped on primary success,
  forced primary provider-network fallback attempted, and forced fallback
  passed before the hard gate can pass.
- Behavior ported: `runTaskLiveReport` consumes safe gate receipts and reports
  `primaryProviderSuccess`, `primarySuccessFallbackSkipped`,
  `forcedPrimaryFailureFallbackAttempted`,
  `forcedPrimaryFailureFallbackPassed`, and
  `providerFallbackCoveragePassed`. `verify:live-task-execution` runs the
  existing anchored provider smoke twice under explicit opt-in: once for normal
  primary coverage and once with a forced primary network failure marker that
  lets the configured fallback execute. The anchored smoke runner injects only
  a safe primary network classification for that forced path; fallback still
  uses the configured approved provider environment.
- Rejected alternatives:
  - Script-only pass criteria: rejected because SP030 hard gates belong in the
    runtime live report summary, not terminal parsing.
  - Default provider fallback: rejected because live provider behavior must
    remain explicit opt-in and default-off.
  - Manual provider config inspection: rejected because provider material may
    only be consumed by approved gates.
  - Treating fallback as task success: rejected because fallback is provider
    coverage metadata; evidence/task proof and result/task verdict remain the
    success owners.
- Expected callers: `verify:live-task-execution`, future live recovery gates,
  task assessment summaries, provider request/response tests, and sprint
  capability docs.
- Side-effect boundary: provider calls remain behind existing explicit opt-in
  smoke gates with isolated runtime homes. Forced primary failure does not read
  private config, print provider material, enable provider defaults, mutate the
  main workspace, or add command allowlist breadth. The selected-workspace
  apply gate remains disposable and isolated.
- Truthfulness boundary: primary success, forced primary failure, fallback
  attempted, fallback passed, provider output, smoke pass, and hard-gate pass
  are not terminal task success. Completed live task entries still require
  task proof, post-action verification where applicable, and evidence/result
  verdict with `terminalSuccessClaim: false`.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/liveRun.test.ts provider/request/attempt.test.ts provider/request/fallback.test.ts`
  - `rtk npm run build:ts`
  - `rtk npm run verify:live-task-execution`
  - `PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real PRIVATE_AGENTS_LIVE_TASK_EXECUTION=1 PRIVATE_AGENTS_LIVE_WRITE_REVIEWED_APPLY=1 PRIVATE_AGENTS_LIVE_REAL_WORKSPACE_APPLY=1 rtk npm run verify:live-task-execution`
  - The measured explicit run reported 13 executed entries, 11 completed with
    task proof, 3 completed write tasks with reviewed disposable apply plus
    post-apply proof and zero manual correction, primary provider success,
    configured fallback skipped on primary success, forced primary
    provider-network fallback attempted/passed, selected-workspace apply,
    redaction pass, and `hardGateStatus=passed`.
- Rollback plan: remove the provider coverage fields from `liveRun.ts`, remove
  the forced-primary-failure smoke flag from the anchored smoke runner, and
  return `verify:live-task-execution` to a single anchored provider gate while
  keeping default-off behavior and redaction boundaries intact.

## Live Development Recovery Gauntlet

- Selected mode: structured port for local live recovery gate contracts, with
  behavior-only alignment for the short-prompt recovery task mix. No isolated
  source adoption was used in SP031 because the current mature local task-loop
  owners already carried the needed mechanisms and the measured rerun exposed no
  new failing stage to transplant.
- Owner domain: `runtime/evaluation/task` for live entry projection, task-loop
  progression, quality records, provider coverage summary, and hard gates;
  existing `context`, `planning`, `provider`, `tools/policy`, `edit`,
  `verification`, `repair`, `artifacts`, `evidence`, and `result` owners for
  stage facts; scripts remain thin explicit-gate callers.
- Reason for use: SP031 required a live development failure-recovery gauntlet,
  not readiness or blocker reporting. The current explicit live command reran
  the same product task loop after the SP030 provider-turn/classifier fixes and
  proved the hard gates without manual correction of completed write tasks.
- Behavior ported: no new code was ported in SP031. Existing task-loop
  behavior was validated across single-file edit, coordinated edit,
  failed-check repair, rollback recovery, package-script impact, owner/context,
  report/artifact, and resume/continuation entries. The measured run preserved
  reviewed disposable apply, post-apply verification, changed-file accounting,
  repair evidence, artifact validation, freshness proof, provider fallback
  coverage, redaction, and evidence/result verdict boundaries.
- Rejected alternatives:
  - Dependency use: rejected because live recovery, mutation authority,
    redaction, provider fallback, proof, and verdict semantics are local product
    contracts.
  - Isolated source adoption: rejected for this route because no missing local
    mechanism remained after current-state inspection and live rerun.
  - Script-owned gauntlet success: rejected because scripts may set gates,
    prepare isolated inputs, call runtime, and print safe metadata only.
  - Treating fallback or provider output as success: rejected because provider
    metadata is not task proof.
- Expected callers: `verify:live-task-execution`, future live development
  recovery gates, task assessment summaries, host evaluation summaries, and
  sprint capability status docs.
- Side-effect boundary: real provider calls remain default-off and use only
  existing explicit opt-in gates. Disposable selected-workspace apply remains
  isolated; the main workspace is not mutated. The route did not add provider
  defaults, browser automation, external tool servers, dynamic loading, command
  allowlist breadth, arbitrary writers, or broad server behavior.
- Truthfulness boundary: live run pass, provider call, fallback attempt, dry-run
  diff, review authority, apply metadata, selected-workspace apply, host output,
  and rendered status are not terminal task success. Completed entries require
  task proof and result/task verdict, and all live report surfaces keep
  `terminalSuccessClaim: false`.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- runtime/evaluation/task/liveRun.test.ts runtime/evaluation/task/model.test.ts provider/request/fallback.test.ts provider/request/attempt.test.ts provider/request/boundary.test.ts provider/request/packet.test.ts provider/response/adapter.test.ts provider/response/boundary.test.ts provider/response/stream.test.ts provider/response/synthetic.test.ts tools/policy/strategy.test.ts verification/execution/model.test.ts verification/selection/model.test.ts repair/loop/model.test.ts artifacts/workflow/model.test.ts evidence/task/proof.test.ts result/task/verdict.test.ts runtime/api/host/runtime.test.ts runtime/api/host/io.test.ts`
  - `rtk npm run verify:live-task-execution`
  - `PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real PRIVATE_AGENTS_LIVE_TASK_EXECUTION=1 PRIVATE_AGENTS_LIVE_WRITE_REVIEWED_APPLY=1 PRIVATE_AGENTS_LIVE_REAL_WORKSPACE_APPLY=1 rtk npm run verify:live-task-execution`
  - The measured explicit SP031 run reported `hardGateStatus=passed`,
    `executedCount=13`, `completedWithTaskProofCount=11`,
    `completedWriteTaskProofCount=3`,
    `reviewedDisposablePostApplyProofCount=3`,
    `correctionFreeCompletedWriteCount=3`, `debugOrRepairComplete=true`,
    `multiFileCompleteOrExactPartial=true`, `artifactOrReportComplete=true`,
    `continuationOrContextComplete=true`,
    `providerFallbackCoveragePassed=true`, `reportRedaction=pass`, read-only
    `changedFiles=[]`, and disposable selected-workspace apply with repository
    clean.
- Rollback plan: remove the SP031 documentation updates and continue to rely on
  the SP030 provider coverage gates until a future failing live recovery stage
  requires a new owner-domain mechanism.

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
- Owner domain: `edit/multifile/`（**历史记录，目录已于 2026-09-27 随不可达
  代码清理删除**；见 `.wiki/refactor/dead-code-tiers-2026-09-27.md`）with proof and verdict
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
- Owner domain: `edit/multifile/`（**历史记录，目录已于 2026-09-27 随不可达
  代码清理删除**）with proof facts under
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

> **2026-09-19 移除（CB-005 死代码清理）**：本节的 `cli/host/`、
> `runtime/distribution/`、`runtime/api/host/{runtime,io}.ts` 及其测试
> **已删除**，`verify:host-surface` 门禁与 `--host-command` CLI 开关一并移除。
> 理由：该 host 执行面驱动的 provider 是硬编码合成
> （`providerMode: "synthetic"`，类型上无 `real` 成员），生产零值导入；
> 活路径（`turn/`）已由 `turn/synthetic.ts` 提供同等能力。
> **补充（2026-09-19，C2）**：`runtime/api/host/contract.ts` 与整个
> `runtime/evaluation`（15 文件 / 5,881 行）**随后一并删除**。
> 理由：`contract.ts` 的唯一消费者是 `runtime/evaluation` 的公共 API，
> 而该 evaluation 面需要 `dispatch => HostCommandResponse`，
> 其唯一生产者 `createHostRuntime` 已随 CB-005 删除——即它**无法被调用**，
> 且从未接入任何 gate/脚本/测试。保留原文以存档。

- Selected mode: structured port.
- Owner domain（**历史记录，目录已删**）: `runtime/api/host/` for host JSON and
  exit classification, packages/ts-shell/src/cli/host/ for CLI delegation,
  packages/ts-shell/src/runtime/distribution/ for package readiness, and
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
  **2026-09-19 实际执行**：该 rollback 已按 CB-005 裁决落地
  （`--host-command`、`verify:host-surface`、`cli/host/`、`runtime/distribution/`、
  `runtime/api/host/{runtime,io}.ts` 均已移除）。
