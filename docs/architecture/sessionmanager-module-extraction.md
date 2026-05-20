# SessionManager Module Extraction

Route: `docs/agent-routes/route157-sessionmanager-module-facades.md`

## Boundary

This route is a behavior-preserving owner-module extraction for
`packages/ts-shell/src/session/SessionManager.ts`.

Hard boundaries:

- no `metadata.json`, `state.json`, or `transcript.jsonl` schema changes
- no transcript event ordering changes
- no current-session selection behavior changes
- no compact retention, replay, recovery, or approval-memory semantic changes
- no CLI, provider, browser, edit, runtime, result truthfulness, dependency, or
  real-provider changes
- no broad file I/O rewrite

`SessionManager.ts` remains the stateful Session / Continue substrate. It keeps
the public API, state-transition ordering, lock/atomic-write orchestration, and
schema ownership. Projection, layout, registry, compact, approval-memory, and
continuity evidence details move behind module-owned facades where the behavior
is already covered.

## Responsibility Migration Table

| Current code block / responsibility | Current owner file | True owner module | Target facade or file | Migration decision | Reason | Validation required | Risk |
|---|---|---|---|---|---|---|---|
| session root, current-session store path, session file path helpers | `SessionManager.ts` | Session / Continue Engineering | `sessionStore.ts` | extract now | Path/layout facts are storage substrate facts; write order can stay in SessionManager. | boundary tests, `SessionManager.test.ts` | file location drift |
| session id generation and id validation | `SessionManager.ts` | Session / Continue Engineering | `sessionStore.ts` | extract now | ID rules are store-level invariants, not high-level API orchestration. | boundary tests, existing create tests | accepting/rejecting different ids |
| metadata/state/transcript raw writes and state locks | `SessionManager.ts` | Session / Continue Engineering | keep in `SessionManager.ts` | leave in SessionManager | The route must preserve atomic write and lock ordering. | `SessionManager.test.ts`, build | write-order or lock drift if moved |
| transcript event construction/encoding | `sessionEventCodec.ts` via `SessionManager.ts` | Session / Continue Engineering | existing codec | facade existing helpers | Already isolated; SessionManager should keep call order only. | transcript/session tests | JSONL shape drift if changed |
| current-session JSON read/write/remove and stale/missing selection cleanup | `SessionManager.ts` + `currentSessionSelection.ts` | Session / Continue Engineering | `sessionRegistry.ts` | extract now | Registry persistence and projection can be module-owned while SessionManager keeps load/existence callbacks. | boundary tests, current-session tests | changed selection or stale cleanup behavior |
| session listing/reentry scoring | `SessionManager.ts` + `sessionSummaryProjection.ts` | Session / Continue Engineering / CLI UX | existing projection plus deferred registry summary facade | defer | Listing mixes warning state and recovery scoring; not needed for a safe first pass. | `SessionManager.test.ts` if touched | warning/output drift |
| replay normalization, repair, runtime seed construction | `SessionManager.ts` + `sessionReplayBuilder.ts` | Session / Continue Engineering | existing replay builder | facade existing helpers | Replay semantics already live in a module; SessionManager keeps API orchestration. | replay/session tests | replay boundary drift |
| continuity event selection and read/staged-repair evidence extraction | `SessionManager.ts` | Session / Continue Engineering | `sessionContinuityModule.ts` | extract now | These are pure evidence-selection facts feeding continuity snapshots. | boundary tests, continuity/sessionRuntime tests | lost replay-safe evidence |
| recovery trust boundary decisions | `SessionManager.ts` + `sessionSummaryProjection.ts` | Session / Continue Engineering | existing projection; partial continuity facade | defer | Recovery decision depends on current state and should not move until separately characterized. | recovery/session tests | recoverability drift |
| compact retention input and continuity memory preservation | `SessionManager.ts` + compact helpers | Session / Continue Engineering | `sessionCompactModule.ts` | extract now | Projection can be owned by compact module while state write ordering remains in SessionManager. | boundary tests, compact tests | compact trigger or retained memory drift |
| approval audit working-memory persistence payload | `SessionManager.ts` + approval helpers | Session / Continue / Permission Engineering | `sessionApprovalMemoryModule.ts` | extract now | Approval-memory payload construction belongs to approval/session module, not SessionManager API orchestration. | boundary tests, approval memory tests | approval semantics/history drift |
| add turn / save completed / save error / save interrupted public methods | `SessionManager.ts` | Session / Continue Engineering | keep in `SessionManager.ts` calling facades/codecs | leave in SessionManager | Public API methods own filesystem state transition order. | `SessionManager.test.ts`, sessionRuntime tests | state transition drift |
| durable status projection | `durableStatusProjection.ts` | Result Surface / Session | existing projection | facade existing helpers | Already extracted. | durable status tests | result truthfulness drift if changed |
| metadata projection | `sessionMetadataProjection.ts` | Session / Continue Engineering | existing projection | facade existing helpers | Already extracted. | session projection tests | schema drift if changed |
| test-only deterministic fixtures | session tests/fixtures | Harness / Eval Engineering | `sessionManagerBoundary.test.ts` | extract now | Facades need characterization independent from public API integration tests. | new boundary test | under-covered facade ownership |

## Facade Ownership

- `sessionStore.ts`: Session / Continue owner for session root/layout facts,
  current-session store path, path projection, id generation, and id validation.
- `sessionRegistry.ts`: Session / Continue owner for current-session store
  read/write/remove and selection projection around existing
  `currentSessionSelection.ts`.
- `sessionApprovalMemoryModule.ts`: Session / Continue plus Permission / Policy
  owner for approval audit working-memory persistence payloads.
- `sessionCompactModule.ts`: Session / Continue owner for compact retention
  projection and compact continuity handoff inputs.
- `sessionContinuityModule.ts`: Session / Continue owner for pure continuity
  evidence selection and last-event discovery.

## What Remains in SessionManager

`SessionManager.ts` remains responsible for:

- public `SessionManager` API methods
- load/save state transition order
- transcript append order
- state locks and atomic writes
- schema ownership for metadata, state, and transcript files
- warning state for unreadable session directories
- invoking module facades with current state and writing the returned payloads

## Final Classification

After Route 157, `SessionManager.ts` is acceptable as a stateful Session /
Continue substrate if focused facade tests and Tier 3 gates pass. It should not
regain current-session registry persistence, store/path layout helpers,
approval-memory payload construction, compact retention projection, or pure
continuity evidence extraction.

The next central file recommendation moves to `cli.tsx`, because it remains the
largest control-plane entrypoint for command/display/session/provider/approval
wiring after `runMvpIntegratedFlow.ts`, `sessionRuntime.ts`, and
`SessionManager.ts` have acceptable composition/substrate classifications.
