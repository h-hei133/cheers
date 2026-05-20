# sessionRuntime Module Extraction

Route: `docs/agent-routes/route156-session-runtime-module-facades.md`

## Boundary

This route is a behavior-preserving owner-module extraction for
`packages/ts-shell/src/core/shell/sessionRuntime.ts`.

Hard boundaries:

- no `QueryEvent` schema changes
- no SessionManager schema, metadata, or transcript JSONL changes
- no `resultMapper` truthfulness changes
- no CLI, provider, browser, edit, runtime, permission, or dependency changes
- no broad session runtime rewrite

`sessionRuntime.ts` remains the shell/runtime composition root for event
ordering, `ShellStateMachine` coordination, `runPrompt` invocation, and
SessionManager API call order. Rendering facts, terminal state accumulation,
persistence payload projection, and future-turn prompt projection move behind
module-owned facades.

## Responsibility Migration Table

| Current code block / responsibility | Current owner file | True owner module | Target facade or file | Migration decision | Reason | Validation required | Risk |
|---|---|---|---|---|---|---|---|
| QueryEvent display branches for MCP, tool, approval, retry, message delta, lifecycle notices | `sessionRuntime.ts` | Result Surface Engineering | `sessionEventSurface.ts` | extract now | Rendering text is a result/display responsibility; runtime should only pass events in stream order. | boundary tests plus existing `sessionRuntime.test.ts` | accidental terminal output wording/order drift |
| Runtime event digest and execution summary lines | `sessionRuntime.ts` | Result Surface Engineering | `sessionEventSurface.ts` | extract now | Digest is display evidence, not session coordination. | boundary tests plus existing compact/verbose rendering tests | summary counts or compact retry notice drift |
| Terminal status, stop reason, terminal reason, classification, coding result, and notes accumulation from `query.completed` | `sessionRuntime.ts` | Result Surface Engineering | `sessionTerminalState.ts` | extract now | Terminal result facts are consumed by rendering and persistence but should be accumulated behind a stable surface. | boundary tests, `sessionRuntime.test.ts`, result-contract | false success/stopped/error classification drift |
| Terminal result block, coding result block, continuation seed summary, next steps, actionable blocker projection | `sessionRuntime.ts` | Result Surface Engineering | `sessionTerminalState.ts` | extract now | These are user-visible result surfaces and blocker projections; runtime should invoke the terminal surface. | boundary tests, `sessionRuntime.test.ts`, result-contract | wording drift or leaked verbose-only evidence |
| Assistant turn persistence payload | `sessionRuntime.ts` | Session / Continue Engineering | `sessionPersistenceProjection.ts` | extract now | Runtime should keep the SessionManager call order but not inline payload construction. | boundary tests plus existing session runtime persistence tests | transcript turn shape drift |
| Completed/error/interrupted save payloads | `sessionRuntime.ts` | Session / Continue Engineering | `sessionPersistenceProjection.ts` | extract now | Save options mirror SessionManager state fields and should be projected by session ownership. | boundary tests plus state persistence tests | durable status metadata drift |
| Future-turn compact injection | `sessionRuntime.ts` | Session / Continue Engineering | `sessionFutureTurnProjection.ts` | extract now | One-shot compact future-turn context is continuation projection, not event-loop coordination. | boundary tests plus existing compact injection tests | injection order or redaction drift |
| Future-turn project memory injection | `sessionRuntime.ts` | Session / Continue Engineering | `sessionFutureTurnProjection.ts` | extract now | Project-memory context projection belongs with continuation/future-turn ownership. | boundary tests plus existing project memory injection test | prompt wrapping/order drift |
| SessionManager write calls (`persistUserPromptBarrier`, `appendQueryEvent`, `addTurn`, `saveCompleted`, `saveError`, `saveInterrupted`) | `sessionRuntime.ts` | Shell Runtime composition | keep calls in `sessionRuntime.ts` using projection payloads | leave in sessionRuntime | The route preserves write order and existing SessionManager API ownership. | existing sessionRuntime persistence tests | moving calls could reorder durable state |
| ResultMapper handoff | `resultMapper.ts` / orchestration result producer | Result Surface Engineering | none | do not move | Route does not change result truthfulness or mapper semantics. | result-contract if terminal surface touched | false result claims |
| Turn boundary rendering | `turnBoundarySurface.ts` | Shell / Result Surface | existing facade | facade existing helpers | Already isolated; no code motion required. | existing `turnBoundarySurface.test.ts` if touched | none if untouched |
| Session state surface rendering | `sessionStateSurface.ts` | Session / Continue Engineering | existing facade | facade existing helpers | Already isolated from runtime prompt execution. | existing `sessionStateSurface.test.ts` if touched | none if untouched |
| Tool/runtime/browser/edit/provider event display details | `sessionRuntime.ts` display branches consume generic `QueryEvent` facts | Owning capability modules plus Result Surface | `sessionEventSurface.ts` generic event renderer | extract now | Runtime should not understand capability internals beyond event vocabulary. | boundary tests plus existing verbose/compact tests | accidentally expanding capability behavior |
| stdout/stderr/error display budgeting | `sessionRuntime.ts` terminal/result helpers | Result Surface Engineering | `sessionTerminalState.ts` | extract now | Existing budgeting is result-surface wording and clipping. | boundary tests plus existing result output tests | leaking raw evidence or changing clipped text |
| Replay-safe evidence display | `sessionRuntime.ts` coding/continuation helpers | Result Surface + Session / Continue | `sessionTerminalState.ts` and `sessionFutureTurnProjection.ts` | extract now | Display/prompt evidence must stay redacted and replay-safe. | redaction assertions in boundary tests | raw DOM/file/secrets exposure |
| CLI-facing fallback lines | `sessionRuntime.ts` terminal helpers | Result Surface / CLI UX | `sessionTerminalState.ts` | extract now | Text is CLI-facing, but no CLI entrypoint behavior changes are needed. | existing sessionRuntime output tests | wording drift |
| Test-only deterministic surfaces | `sessionRuntime.test.ts` | Harness / Eval | `sessionRuntimeBoundary.test.ts` | extract now | Facades need direct characterization without relying only on end-to-end runtime tests. | new boundary test command | under-covered facade ownership |

## Facade Ownership

- `sessionEventSurface.ts`: Result Surface Engineering owner for QueryEvent
  rendering, compact retry notices, and execution summary evidence.
- `sessionTerminalState.ts`: Result Surface Engineering owner for terminal fact
  accumulation and user-visible terminal/coding/continuation result rendering.
- `sessionPersistenceProjection.ts`: Session / Continue Engineering owner for
  SessionManager payload projection while leaving write calls ordered by
  `sessionRuntime.ts`.
- `sessionFutureTurnProjection.ts`: Session / Continue Engineering owner for
  compact and project-memory future-turn prompt projection.

## What Remains in sessionRuntime

`sessionRuntime.ts` remains responsible for:

- creating and clearing the current `AbortController`
- `ShellStateMachine` lifecycle transitions
- continuity snapshot selection before the prompt barrier
- future-turn facade invocation before the prompt barrier
- user prompt barrier persistence order
- recovery re-entry marking
- consuming `QueryEvent` objects in order
- appending each query event to SessionManager before rendering/projection
- invoking facade rendering and terminal accumulation in stream order
- SessionManager write-call order for assistant turns and terminal state

## Final Classification

After Route 156, `sessionRuntime.ts` is acceptable as a shell/runtime
composition root if the focused facade tests and Tier 3 gates pass. It should
not regain direct rendering helpers, terminal result projection helpers,
persistence payload construction, or future-turn injection internals.

The next central file recommendation moves to `SessionManager.ts`, because it
still owns persistence substrate, schema updates, codec/projection/reentry
coordination, and compact/replay surfaces. Future work should keep that route
schema-neutral unless a separate plan explicitly opens persistence format
changes.
