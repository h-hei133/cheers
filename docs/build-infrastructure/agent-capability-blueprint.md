# Agent Capability Blueprint

This blueprint captures capability patterns from a mature local agent runtime and
its public documentation, then maps them onto the current repository. It is a
working product-architecture guide, not a progress log.

## Capability Map

- **Lifecycle and harness**: a phaseful runtime separates prompt acceptance,
  per-turn snapshots, model request preparation, assistant streaming, tool
  execution, save points, queue draining, retry/abort handling, and settled
  state. Runtime configuration may change between turns, while each in-flight
  turn uses a stable snapshot.
- **Session and continuation**: durable sessions are append-only trees with an
  active path. Resume rebuilds from stored entries plus current runtime
  dependencies. Branch summaries, compaction summaries, labels, and custom
  entries are facts that support future context but do not prove task success.
- **Tool loop**: tool calls are lifecycle facts with policy interception,
  start/end events, structured result messages, sequential or parallel
  execution policy, and safe result summaries. Tool result existence is not task
  success.
- **Model/provider boundary**: provider readiness, model metadata, auth
  readiness, streaming support, retry/fallback eligibility, and request payload
  preparation are boundary facts. Provider defaults remain off until explicit
  opt-in. A provider call or provider response is not task success.
- **Event stream and product surface**: runtime behavior is projected as
  structured events for hosts. Terminal, JSON, and higher-level surfaces render
  the same facts with different formatting. Event emission and rendering do not
  own terminal truth.
- **Context reduction**: compaction and branch summaries are first-class
  continuation aids. They mark what was retained, excluded, stale, unsafe, or
  missing. Compaction readiness does not imply provider execution or successful
  task completion.
- **Reusable capability boundary**: commands, tools, resources, provider
  metadata, and hooks are explicit registration surfaces. Dynamic loading is a
  separate governed capability; the transferable pattern is typed ownership,
  provenance, enablement state, and host-safe facts.
- **Failure reporting**: busy, aborted, blocked, missing-auth, provider,
  policy, tool, compaction, hook, verification, and repair failures remain
  distinct. Retry and follow-up readiness are control signals, not success.
- **Packaging and distribution**: package/resource inventory should distinguish
  installed, enabled, disabled, conflicting, and unsupported capabilities. The
  current repository should keep this as governance metadata until dynamic
  loading is explicitly scoped.

## Lifecycle Model

1. User input enters a host surface and is accepted, queued, rejected, or
   deferred.
2. Session state and reusable capabilities are snapshotted for the next turn.
3. Context facts are rebuilt from the active session path, safe summaries,
   queued input, resource inventory, and compaction/branch summaries.
4. A provider request boundary is prepared with safe request messages,
   provider/model metadata, readiness, redaction, and explicit opt-in state.
5. If explicitly allowed, the model boundary may stream an assistant response.
6. Tool calls are extracted, policy-checked, dispatched through the execution
   boundary, and summarized as tool result messages.
7. Runtime creates save points and next-turn facts.
8. Verification and repair may run, but only evidence/result verdicts can prove
   terminal success.
9. Runtime selects the next action: wait, continue, request authority, repair,
   verify, or stop.
10. Presentation renders the observed facts and missing proof.

## Current Target Comparison

The target repository already has many rightful owners:

- `runtime/loop` composes turns, save points, next-turn request preparation,
  invocation gates, verification, repair, finalization, and closeout.
- `runtime/events` projects observation-only event facts and JSON stream entries.
- `session/continuation` evaluates resume readiness, stale facts, unsafe facts,
  branch gaps, and compaction gaps.
- `session/replay` carries safe loop facts forward without terminal success.
- `turn` owns next-turn bundles, safe tool result messages, delivery policy,
  steering, and follow-up queues.
- `tools` owns tool batch dispatch, result details, outcome bundles, and
  next-action recommendations.
- `provider/request` owns request boundaries, provider metadata, opt-in facts,
  and safe request messages.
- `context` owns rebuild projections and safe context handoff inputs.
- `evidence` and `result` own proof and terminal verdict projection.
- `verification` and `repair` own their own observations and handoffs.
- `presentation` renders facts into product and terminal surfaces.
- `runtime/resources` owns package/resource inventory projection.

The main gap is not a missing monolithic loop. The gap is that continuation,
context rebuild, next-turn request preparation, provider metadata, replay-safe
carry-forward, runtime events, and product surface status are not yet connected
as one coherent capability path.

## Priority Gaps

### Priority 1

- Carry continuation readiness into next-turn request preparation, so blocked,
  stale, unsafe, or partial continuation state becomes visible at the provider
  boundary before any provider call.
- Preserve request-preparation status in replay-safe session carry-forward.
- Surface request and continuation blockers through runtime events and product
  status without treating readiness as success.

### Priority 2

- Strengthen context reduction handoff by projecting compaction and branch
  summary availability into request preparation and session replay.
- Add resource/package enablement state to request preparation without dynamic
  loading.
- Make runtime loop trajectory include provider request preparation ids and
  blocked request reasons, not only provider registry metadata.

### Priority 3

- Introduce a typed internal capability registration seam for owner-provided
  commands/tools/resources.
- Add richer host-level JSON status for queued follow-up, retry, and abort facts.
- Add storage-backed branch and compaction behavior only after the current
  projection-only gaps are closed.

## Recommended Batches

1. **Continuation-aware request handoff**: connect session continuation,
   context rebuild, next-turn bundle, provider request preparation, replay-safe
   carry-forward, runtime events, and presentation. This batch is selected for
   this pass because it improves a real runtime path without adding provider
   calls or writer behavior.
2. **Context reduction readiness**: make compacted and branch-summary facts more
   structured across context, session replay, runtime events, and presentation.
3. **Capability inventory governance**: strengthen resource/package projections,
   conflicts, and enabled/disabled status without dynamic loading.
4. **Host status envelope**: normalize terminal, JSON, and session API status
   around the same runtime facts.
5. **Verification/repair continuation**: carry post-repair verification needs
   through next-turn planning and session replay.

## Selected Batch

Implement the continuation-aware request handoff across these owner domains:

- `session`: expose a safe request handoff fact from continuation readiness.
- `provider/request`: accept continuation readiness as input and derive request
  readiness, blockers, safe messages, and not-proven claims from it.
- `runtime/loop` and `runtime/events`: attach request preparation ids and
  continuation status to the loop trajectory and event stream.
- `session/replay`: carry request preparation status and blocked reasons forward
  as safe replay facts.
- `presentation`: render request preparation and continuation blockers as
  status facts only.

Terminal truth remains in evidence/result. The selected batch may mark a future
turn as prepared, blocked, or ready for explicit invocation; it must never mark
provider success, verification success, repair success, task success, or
terminal success.
