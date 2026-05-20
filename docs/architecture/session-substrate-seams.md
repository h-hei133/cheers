# Session Substrate Seams

Route: `docs/agent-routes/route145-session-substrate-seams.md`

## Scope

Route 145 extracts stable Session / Continue substrate seams from
`packages/ts-shell/src/session/SessionManager.ts` after the Route 144 green
package baseline.

This route is behavior-preserving substrate cleanup:

- no `metadata.json`, `state.json`, or `transcript.jsonl` schema migration
- no transcript ordering or event field removal
- no compact retention trigger or retention policy change
- no current-session selection behavior change
- no CLI UX, provider, browser, edit, dependency, or broad runMvp rewrite

## Reference Scan

Bounded reference scan was shape-only; no implementation code was copied.

- Claude Code compact code keeps compaction as a summary/projection boundary
  around existing messages and strips unsafe media during compaction.
- opencode v2 session events name event schemas separately from session
  processing, and compaction owns summary construction separately from session
  storage.
- Gemini CLI exposes resume through a command/dialog boundary rather than
  embedding broad session browsing behavior in the core loop.
- Inspect AI models transcript events as a typed union, reinforcing a named
  event vocabulary.
- OpenHands event store references were used only to confirm that event storage
  should remain a persistence boundary, not a route for provider or browser
  behavior.

## Before Map

| Area | Route 145 decision | Notes |
|---|---|---|
| directory/path helpers | keep in `SessionManager` | path ownership stays with the stateful substrate |
| state persistence | keep in `SessionManager` | lock/retry/atomic write behavior unchanged |
| metadata persistence | keep write in `SessionManager`; extract metadata projection | file layout unchanged |
| transcript append/read | keep file I/O in `SessionManager`; extract event codec | JSONL format unchanged |
| transcript/event construction | extract now | message/lifecycle/query constructors live in `sessionEventCodec.ts` |
| current-session state | keep selection behavior; extract record projection | `currentSessionSelection.ts` remains decision owner |
| compact/checkpoint summaries | extract retention input projection | `compactRetentionPlanner.ts` remains retention owner |
| replay/recovery snapshots | keep orchestration in `SessionManager` | replay builder remains existing owner |
| continue/replay evidence | extract evidence selection and recovery predicates | replay-safe redaction is centralized |
| approval memory | keep existing codec/projection files | no route-owned change |
| CLI-facing summaries | extract reentry summary/scoring projection | display wording unchanged |
| durable status | keep existing `durableStatusProjection.ts` | no change |

## Extracted Owners

- `packages/ts-shell/src/session/sessionEventCodec.ts`
  - transcript event constructors
  - encode/decode helpers
  - message-event to `SessionMessage` projection
- `packages/ts-shell/src/session/sessionSummaryProjection.ts`
  - reentry summary projection
  - reentry scoring
  - recovery trust-boundary block projection
- `packages/ts-shell/src/session/sessionContinuationProjection.ts`
  - replay-safe continuation evidence selection
  - continuation evidence predicates
  - deterministic terminal evidence predicate
- `packages/ts-shell/src/session/sessionCompactProjection.ts`
  - compact retention plan input projection
- `packages/ts-shell/src/session/sessionMetadataProjection.ts`
  - session metadata projection
  - current-session record projection
- `packages/ts-shell/src/session/sessionProjection.test.ts`
  - focused characterization for the extracted seams

## Behavior Preservation

Event format:

- `message`, `lifecycle`, and `query-event` JSON shapes are unchanged.
- Unknown/legacy transcript lines remain parse-compatible because the codec
  preserves the previous `JSON.parse(...) as TranscriptEvent` behavior.

Summary and recovery:

- Reentry summary fields are projected from the same session, recovery, and
  continuity inputs.
- Reentry scoring preserves the previous fully/partially resumable weighting,
  preferred-project boost, pending-prompt boost, success penalty, and updatedAt
  recency score.
- Recovery trust-boundary hints keep the existing text shape.

Continuation and replay safety:

- Continuation evidence selection keeps the existing first-eight plus critical
  marker behavior, while centralizing the replay-safety filter for raw DOM,
  raw file dumps, tokens, cookies, authorization, provider config path, and
  private-key-like strings.
- The recovery predicates for continuation evidence and deterministic terminal
  evidence moved without changing their boolean conditions.

Compact/current-session:

- Compact retention still runs through `applyCompactRetentionPlan`; Route 145
  only projects its input object.
- Current-session selection still runs through `currentSessionSelection.ts`;
  Route 145 only projects the stored `{ sessionId, updatedAt }` record.

## Validation Evidence

- `rtk npm run test -w packages/ts-shell -- src/session/sessionProjection.test.ts`
  - `8 passed`
- `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts`
  - `59 passed`
- `rtk npm run test -w packages/ts-shell -- src/session/sessionProjection.test.ts src/session/SessionManager.test.ts src/session/sessionReplayBuilder.test.ts src/session/compactRetentionPlanner.test.ts src/session/currentSessionSelection.test.ts src/session/durableStatusProjection.test.ts src/session/stoppedSessionContinuity.test.ts src/session/compactContinuitySummary.test.ts`
  - `89 passed`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts`
  - `151 passed`
- `rtk npm run test -w packages/ts-shell`
  - `343 passed`, `2059 passed / 1 skipped`
- `rtk npm run verify:edit-capability-closeout`
  - pass, `58 passed`
- `rtk npm run verify:result-contract`
  - pass
- `rtk npm run build -w packages/ts-shell`
  - pass
- `rtk git diff --check`
  - pass
- `rtk git status --short --branch`
  - only Route 145 code/doc changes after audit residue cleanup

Audit residue handling:

- `verify:result-contract` and the package sweep generated `.sisyphus/audit`
  changes and one transient `undefined/.rustup/settings.toml` path.
- Route 145 restored the tracked audit files and removed the transient
  untracked audit/runtime residue before closeout.

## Remaining Risks

- `buildContinuitySnapshot()` still has a large mixed projection body. Route
  145 only moved stable helper seams; deeper continuity decomposition should
  wait for a dedicated route with focused continuation tests.
- `SessionManager.ts` remains the stateful substrate for persistence and file
  locks. That is intentional; moving I/O would risk schema or locking drift.
- `sessionRuntime.ts` still mixes display accumulation and persistence calls.
  That is outside Route 145.

## Route 146 Recommendation

Route 146 should target Tool / Policy / Result contract unification, not
another SessionManager slice by default.

Best next candidates:

1. Normalize existing policy reason projections across approval, command,
   MCP, browser, and workspace surfaces without changing decisions.
2. Define a shared tool/runtime receipt vocabulary consumed by result/session
   surfaces.
3. Keep provider readiness parity and CLI/core split as follow-up routes unless
   a concrete product blocker makes them higher priority.

Stop conditions for Route 146: provider live calls, browser/edit expansion,
workspace write-policy changes, result truthfulness changes without
`verify:result-contract`, or broad runMvp/CLI rewrites.

## Post-Route-149 Forward Pointer

Route 149 keeps Session / Continue work module-first and schema-neutral. Future
session routes should preserve `metadata.json`, `state.json`, and
`transcript.jsonl` behavior, and should expose transcript, reentry, compact,
and continuation changes through Session-owned codecs or projections before any
Agent Loop or CLI wiring.

Session evidence remains a consumer of module-owned receipts; it should not be
used to smuggle new edit, browser, provider, or runtime behavior into replay.
