# Project Gap And Priority Plan

This plan is aggressive on capability acquisition and conservative on secrets,
execution, provider behavior, mutation, and truthfulness. A batch is complete
only when the runtime path is proven by owner tests or focused integration
evidence. Adding a field, adding a surface section, or writing docs alone is not
completion.

## Major Gaps

- The loop substrate is broad but not yet the complete product-loop owner.
- CLI/session UX is narrower than the runtime fact model.
- JSON event projection exists, but no stable SDK/RPC host contract exists.
- Session branch and compaction support are projection-only or unsupported in the
  current runtime path.
- Provider/model compatibility is metadata-first and default-off; live execution
  remains explicit opt-in.
- Extension/package support is governance-only; dynamic execution is absent by
  design.
- Tool execution has policy/receipt/outcome boundaries, but broad parallel
  mutation, conflict queues, and snapshot/revert-backed editing are not proven.
- Verification/repair can prove repair-to-success, but broader task-relevant
  verification planning and recovery loops still need product-path integration.

## Immediate Sprint Batches

### Batch 1: Product Loop Truth Consolidation

- Goal: make the current loop trajectory, completion packet, replay-safe facts,
  and product surface line up as one audited product-path story.
- User-facing value: status output becomes less ambiguous; stopped, blocked,
  waiting, repaired, and complete states remain distinct.
- Owner domains: `runtime/loop`, `runtime/events`, `session/replay`,
  `presentation`, `evidence`, `result`.
- Expected areas: `runtime/loop/trajectory.ts`, `runtime/loop/completionPacket.ts`,
  `runtime/events/projection.ts`, `session/replay/state.ts`,
  `presentation/surface/model.ts`, owner tests.
- Required tests: focused owner tests plus evidence/result anti-false-success
  tests when terminal wording changes.
- Forbidden shortcuts: presentation-only success, loop-owned terminal success,
  event-emission-as-success, replay-as-success, weakening missing-proof checks.
- Completion condition: a product-path fixture proves result-owned success only
  when evidence/result proof is complete, and proves all partial/not-proven
  variants remain non-success.

### Batch 2: CLI Status Envelope

- Goal: align interactive/terminal output with product surface and JSON event
  facts without turning terminal text into the runtime API.
- User-facing value: users can see next action, blockers, request readiness,
  replay carry-forward, tool outcome, and verification state in one coherent
  surface.
- Owner domains: `cli`, `core/shell`, `session/presentation`, `presentation`,
  `runtime/events`.
- Expected areas: CLI/session surface bridges and product surface input plumbing.
- Required tests: CLI/session rendering tests with stopped, blocked, not-proven,
  and verified repair cases.
- Forbidden shortcuts: terminal-specific reinterpretation of success, direct
  reads of raw transcripts/secrets/provider output, broad CLI rewrite.
- Completion condition: terminal and product surface render the same owner facts
  for the same fixture with no success upgrades.

### Batch 3: Branch/Compaction Context Readiness

- Goal: make branch and compaction facts more structured across session,
  context rebuild, continuation readiness, request preparation, replay, events,
  and surface.
- User-facing value: resume/continue can say what context was retained, missing,
  stale, unsafe, or unsupported before a next model request.
- Owner domains: `session`, `session/continuation`, `session/replay`, `context`,
  `provider/request`, `runtime/events`, `presentation`.
- Expected areas: `session/sessionTreeProjection.ts`,
  `context/sessionContextRebuildProjection.ts`,
  `session/continuation/readiness.ts`, `provider/request/boundary.ts`.
- Required tests: projection tests for observed/missing/stale/unsafe summaries
  and request-blocking propagation.
- Forbidden shortcuts: storage migration as the first step, treating summaries as
  evidence, raw transcript carry-forward.
- Completion condition: continuation and request preparation block or proceed
  strictly from safe branch/compaction facts, with missing proof preserved.

## Medium-Term Runtime Capability Batches

### Batch 4: Provider/Model Compatibility Registry

- Goal: expand provider/model metadata, auth readiness, compatibility flags,
  fallback eligibility, and request blockers without enabling real providers by
  default.
- User-facing value: provider readiness failures become precise before calls.
- Owner domains: `provider/registry`, `provider/request`, `provider/response`,
  `runtime/events`, `presentation`.
- Expected areas: provider registry projections, request boundary, invocation
  gate, response/reentry events.
- Required tests: synthetic/default-off provider tests, missing-auth tests,
  redaction tests, no-provider-call assertions.
- Forbidden shortcuts: reading private provider homes, default real-provider
  enablement, treating readiness/fallback eligibility as execution.
- Completion condition: request preparation can explain compatibility/auth
  blockers and explicit opt-in requirements with no live call.

### Batch 5: Programmatic Runtime Event Contract

- Goal: stabilize a machine-readable event envelope for host consumption before
  SDK/RPC behavior.
- User-facing value: future non-interactive integrations can consume structured
  state rather than scraping terminal text.
- Owner domains: `runtime/events`, `runtime/loop`, `contracts` only if a real
  cross-runtime consumer exists, `presentation`.
- Expected areas: event stream entries, schema/version metadata, redaction,
  correlation ids.
- Required tests: JSON event stream snapshots for representative lifecycle,
  blocked, repair, request, and replay cases.
- Forbidden shortcuts: broad RPC server, external tool server, dynamic plugin
  loading, terminal-output parsing.
- Completion condition: a stable JSON envelope is tested as a host contract and
  remains observation-only.

### Batch 6: Tool Policy And Read-Only Parallelism

- Goal: strengthen tool policy interception, dispatch ordering, receipts,
  outcome next action, and read-only parallel execution before mutation
  concurrency.
- User-facing value: safe independent reads can speed up work while blocked or
  authority-needed tool outcomes stay clear.
- Owner domains: `tools`, `tools/policy`, `runtime/execution`, `turn`,
  `runtime/events`.
- Expected areas: tool policy decisions, dispatch planning, execution receipts,
  tool result messages, outcome bundle.
- Required tests: sequential vs read-only parallel ordering, blocked authority,
  redaction, failed tool, and next-turn result-message cases.
- Forbidden shortcuts: parallel writes, command allowlist expansion, bypassing
  `ExecutionService`, tool-success-as-task-success.
- Completion condition: read-only parallel tool paths produce ordered,
  report-safe result messages and preserve non-success outcomes.

### Batch 7: Verification And Repair Recovery Loop

- Goal: carry verification failures, repair eligibility, authority, apply
  observations, and post-repair verification through the loop until result-owned
  verdicts settle.
- User-facing value: repair attempts become auditable and less likely to hide
  incomplete verification.
- Owner domains: `verification`, `repair`, `evidence`, `result`,
  `runtime/loop`, `runtime/events`, `presentation`.
- Expected areas: repair handoff boundaries, proof input, result projection,
  finalization, completion packet.
- Required tests: original failure preserved, proposal-only not success,
  apply-only not success, post-repair failed/not-run not success, complete proof
  success.
- Forbidden shortcuts: repair proposal as success, apply as success, skipped
  verification as success, broad rebaseline.
- Completion condition: the product path reaches complete only through
  evidence/result proof with task-relevant post-repair verification.

## Large Future Capability Areas

### Batch 8: Capability Inventory Governance

- Goal: move from static resource/package projections to a robust governance
  model for installed/enabled/disabled/conflicting/unsupported resources.
- User-facing value: users can see which capabilities are available, disabled,
  blocked, conflicting, or unsupported before relying on them.
- Owner domains: `runtime/resources`, `policy`, future static registration
  owners.
- Expected areas: package/resource inventory projections, resource trust policy,
  event and surface projections for inventory status.
- Required tests: manifest validation, conflict detection, trust policy,
  redaction, unsupported executable packages.
- Forbidden shortcuts: package install/load, dynamic discovery, script
  execution, plugin execution, provider default enablement.
- Conservative boundary: no package install/load or executable plugin behavior.
- Completion condition: inventory facts distinguish enabled, disabled, blocked,
  conflicting, unsupported, and rejected resources without executing any package
  or plugin behavior.

### Batch 9: Extension Contract Without Execution

- Goal: define non-executable lifecycle and hook contracts that can observe,
  annotate, block, redact, or suggest next actions without mutating truth.
- User-facing value: future extension points can be planned and audited without
  letting third-party behavior execute or rewrite success.
- Owner domains: `runtime/extensions`, `policy`, `runtime/events`, `tools`,
  `provider/request`.
- Expected areas: extension lifecycle descriptors, hook policy outcomes,
  forbidden effect taxonomy, event projection, surface status.
- Required tests: forbidden effects rejected, allowed effects remain
  evidence-only, default unsupported/executable false.
- Forbidden shortcuts: dynamic loading, executable plugin code, provider/tool
  default execution, authority bypass, terminal-success rewrite.
- Conservative boundary: no dynamic loading, plugin code execution, provider
  default execution, shell/file mutation, or hidden transcript mutation.
- Completion condition: static internal hook descriptors can be validated and
  projected, and every forbidden effect is rejected with `terminalSuccessClaim:
  false`.

### Batch 10: Storage-Backed Branching And Compaction

- Goal: implement durable branch navigation and compaction entries after the
  projection path is proven.
- User-facing value: resume and continue can safely target alternate leaves and
  reduced context without losing stale/unsafe/missing fact visibility.
- Owner domains: `session/store`, `session/replay`, `session/continuation`,
  `context`.
- Expected areas: session store schema, active leaf state, branch summary
  records, compaction records, replay/context rebuild projections.
- Required tests: session tree persistence, active leaf switching, branch
  summaries, compaction summaries, stale/unsafe facts, resume replay.
- Forbidden shortcuts: summary-as-evidence, raw transcript carry-forward,
  unplanned schema migration, success claims from compacted context.
- Conservative boundary: migration and backward compatibility must be explicit;
  summaries are context aids, not evidence.
- Completion condition: persisted branch and compaction records rebuild a safe
  continuation context, preserve unsupported/stale/unsafe facts, and do not
  create terminal success.

### Batch 11: Host API And Distribution

- Goal: expose stable non-interactive host behavior and package/distribution
  readiness after event contracts and truth boundaries are stable.
- User-facing value: scripts and future hosts can consume structured status and
  run release/package checks without scraping CLI prose.
- Owner domains: `cli`, future host API owner, `runtime/events`,
  `presentation`, release scripts.
- Expected areas: non-interactive CLI envelope, JSON event stream contract,
  package smoke scripts, release readiness checks.
- Required tests: JSON/non-interactive contract, CLI smoke, packaging smoke,
  no-live-provider default.
- Forbidden shortcuts: broad SDK/RPC server, external tool server behavior,
  dynamic package loading, live-provider default gates.
- Conservative boundary: no broad SDK/RPC server or external tool server before
  host contract and permission model are proven.
- Completion condition: non-interactive host output and package smoke checks are
  stable, tested, default-off for real providers, and independent of terminal
  wording.

## Validation Expectations

- Documentation-only updates: consistency review, link/path sanity, `rtk git diff
  --check`, and `rtk git diff --cached --check` if staged.
- Product-code changes: owner-focused tests first, then build only when imports,
  contracts, runtime-facing types, or broad behavior changed.
- False-success-sensitive changes: always include evidence/result verdict tests,
  completion-packet tests, and representative presentation/event tests.
- Provider changes: default-off synthetic tests first; real-provider gates only
  under explicit opt-in and without reading or printing private provider config.
