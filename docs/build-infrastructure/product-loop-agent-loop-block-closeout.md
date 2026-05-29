# Product Loop Agent Loop Block Closeout

Status: PL009 closes the Agent Loop product integration block.

## Completed Scope

- PL002 connected the real CLI product path to loop observation through the coordinator, shell session surface, and product surface.
- PL004 added report-safe model response boundary, assistant accumulation, and tool-call extraction observations.
- PL005 added tool batch dispatch planning, execution receipt references, tool result details, and tool result messages.
- PL006 added save point, next-turn bundle, steering queue, follow-up queue, and delivery policy contracts without executing a new model turn by default.
- PL007 added verification and repair handoff observations while preserving that selection, proposal, apply, and post-repair not-run states are not success.
- PL008 added session context rebuild input/projection, continuation readiness, and replay-safe loop state summaries without claiming continuation success.
- PL009 consolidates these phases behind `runtime/loop` product loop adapter, phase status map, and future feature integration contract.

## Product Loop Adapter

The adapter lives in `packages/ts-shell/src/runtime/loop/productLoopAdapter.ts`.
It is a composition boundary. It references safe ids from owner domains and does
not own provider, tool, context, session, verification, repair, evidence, or
result truth.

Current consumers are host/renderer/observer surfaces only:

- `core/shell` stores and passes the adapter with terminal state.
- `presentation` renders adapter phase status and feature contract availability.
- `runtime/events` and JSON event stream observe adapter facts as observation-only.

## Phase Status

`packages/ts-shell/src/runtime/loop/phaseStatus.ts` classifies the PL002-PL008
phase set as `product_integrated`, `observation_only`, `contract_only`,
`projection_only`, `unsupported`, `not_proven`, or `deferred`.

The status map deliberately keeps unsupported branch/compaction storage and
future capability blocks visible instead of treating them as delivered runtime
features.

## Future Feature Contract

`packages/ts-shell/src/runtime/loop/featureContract.ts` requires future
capability blocks to declare:

- owner domain
- loop phase
- input facts
- output handoff facts
- runtime events
- evidence facts
- product surface section
- result truthfulness boundary
- not-proven claims
- forbidden shortcuts
- validation gates

This contract is code, not prose-only guidance. A valid declaration is still not
feature success.

## Remaining Not-Proven Claims

- Adapter observed is not terminal success.
- Phase `product_integrated` is not terminal success.
- Feature contract valid is not feature success.
- Product surface rendered is not terminal success.
- Runtime event or JSON stream observed is not terminal success.
- Replay-safe state summarized is not replay execution or terminal success.
- Continuation readiness is not continuation success and does not execute a next turn.
- Provider/model boundary observed is not provider success.
- Tool-call extraction, dispatch planning, receipts, and result details are not tool or task success.
- Verification selected, dispatched, or observed is not task success unless result/evidence truth proves it.
- Repair required, proposed, or applied is not repair success without relevant post-repair verification.
- Storage-backed branching and compaction remain unsupported in this block.

## Why The Block Stops Here

The Agent Loop block now has a stable spine for observation, contract handoff,
safe rendering, and result truthfulness boundaries. Expanding it further would
turn `runtime/loop` into an all-owning framework for context, planning, tools,
session storage, provider execution, verification, repair, browser, MCP, SDK,
RPC, plugins, or package loading. Those capabilities need their own owner
domains and must connect through the future feature integration contract.

## Next Capability Block

Recommended next block: Context and Planning Quality Block.

The first route should audit and plan how context discovery, repository
understanding, planning quality, target selection, and memory reuse connect to
the product loop adapter without creating a separate loop or treating planning
quality as terminal success.
