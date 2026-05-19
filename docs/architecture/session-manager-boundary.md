# SessionManager Boundary Map

Route: `docs/agent-routes/route136-control-plane-atlas.md`

Owner file:

- `packages/ts-shell/src/session/SessionManager.ts`

Current size:

- about 3.4k lines at Route 136 start

## Boundary Map

| Area | Current owner | Keep in SessionManager? | Extraction direction |
|---|---|---|---|
| directory layout | constructor, path helpers, metadata/transcript/state paths | yes | none |
| state persistence | state read/write/lock/retry helpers | yes | only IO utility if repeated |
| metadata persistence | create/resume/list/session summaries | yes | keep file-backed semantics local |
| transcript append/read | append message/lifecycle/query events | yes | event codecs only |
| current-session state | current session store parse/select/update | partial | already partly in `currentSessionSelection.ts` |
| compact/checkpoint | compact retention and continuity summary calls | partial | keep orchestration in class, projections outside |
| replay | recovery snapshot and replay plan entrypoints | partial | already partly in `sessionReplayBuilder.ts` |
| transcript/event construction | `TranscriptEvent`, query event persistence | partial | future typed event codec |
| continue/replay evidence | continuity snapshots and stopped-session surfaces | partial | continue pure projection helpers |
| approval memory | approval audit and permission request memory | partial | already codec/projection-shaped |
| CLI-facing summaries | reentry/project/session summaries | partial | summary projector candidate |
| terminal durability | terminal classification to durable status | no | extracted to `durableStatusProjection.ts` |

## Capability Lifecycle Coverage

Session / Continue owns these stages:

- transcript
- continue / replay
- compact handoff
- durable status and terminal reason persistence
- approval and mutation continuity facts
- project binding and root trust boundary diagnostics

The class should remain the stateful substrate. It should not become the owner
of capability planning, permission decisions, result truthfulness, provider
auth, or writer semantics.

## Completed Route 136 Extraction

`projectDurableStatus` moved to:

- `packages/ts-shell/src/session/durableStatusProjection.ts`
- `packages/ts-shell/src/session/durableStatusProjection.test.ts`

The extracted rule preserves the prior mapping:

- terminal success or completed session -> `success`
- terminal stopped -> `stopped`
- terminal error or error session -> `error`
- active/interrupted/terminated without terminal classification -> undefined

This is projection-only and does not change session schema or persistence.

## Remaining Pure Helper Candidates

1. recovery snapshot terminal summary projector
2. session reentry summary scorer/projector
3. transcript event codec helpers
4. approval memory fallback summary projector consolidation
5. project binding diagnostics summary projector

## Unsafe Areas

- changing `state.json`, `metadata.json`, or `transcript.jsonl` shape
- changing replay normalization or assistant sentinel behavior
- changing compact retention semantics
- changing approval memory persistence or trust-boundary blocking
- making `/continue` infer success from incomplete terminal evidence
