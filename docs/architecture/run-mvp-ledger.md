# runMvpIntegratedFlow Responsibility Ledger

Route: `docs/agent-routes/route136-control-plane-atlas.md`

Owner file:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`

Current size:

- about 9.9k lines at Route 136 start

## Ledger

| Responsibility | Current code owner | Notes | Projection-only candidate |
|---|---|---|---|
| apply_patch runtime short-circuit | `runApplyPatchRuntimeRouteIfRequested` | delegates to `projectApplyPatchRuntimeMutationRoute` and workspace authority | keep as minimal wiring |
| runner composition | `createIntegratedRunner` | builds planner/coder/reviewer behavior and handoff notes | future turn-kernel wrapper |
| prompt classification | `buildWorkflowTaskPlan`, `extractWorkflowTaskIntentSignals`, many predicate helpers | largest mixed region; combines prompt cues, continuity, target resolution, browser plan, edit/read/verify modes | split into intent signal projector and lifecycle-specific planners |
| tool planning | `executeWorkflowTaskPlan`, `dispatchToolWithLifecycle` | tool dispatch and lifecycle projection feed coding result construction | generic tool-result-to-coding-summary projector |
| capability dispatch | `executeWorkflowTaskPlan` | routes browser, read, inspect, explain, edit, verify, command paths | capability route table after ledgers |
| browser transaction integration | `executeBrowserWorkflowTaskPlan` | pulls browser plan, runtime status, txn evidence, trace lines into coding result | browser-owned result projector |
| edit/patch flow | mutation helpers, patch lane, target selection, failure repair context | bounded lanes are explicit, but planning/execution/result text remain interleaved | mutation planning/result summary projector |
| provider/model readiness | `streamRoleDraft`, `createRealProviderAdapter`, `resolveRequestModel`, `projectProviderOutcome` | real provider execution remains opt-in; diagnostic handoff influences planning | provider diagnostic handoff projector only |
| permission/policy gating | approval authority projection, sandbox dispatcher, workspace authority | policy facts are delegated but interpreted in loop notes/results | policy reason normalizer |
| result construction | `WorkflowExecutionResult`, coding summaries in capability branches | user-facing output, verification summary, changed/failed/planned files built close to execution | capability result summary projector |
| transcript/evidence handoff | `QueryEvent` appends, continuity merge, action result seed decision trace | evidence appears as notes, coding result fields, and continuity state | transcript evidence projector |
| verification/fallback paths | low-risk verification planning, verification command inference, fallback repair helpers | useful but high coupling with prompt classifiers | verification continuation projector |

## Capability Lifecycle Coverage

| Stage | Current coverage | Gap |
|---|---|---|
| availability | browser runtime status, MCP snapshot, provider mode, target resolution | not one shared availability object |
| policy | sandbox, approval, workspace authority, browser policy helpers | no shared policy outcome vocabulary |
| planning | strong but large `buildWorkflowTaskPlan` surface | too much prompt/continuity/capability coupling |
| execution | tool dispatcher, browser transaction, mutation lanes, provider stream | receipts are capability-specific |
| observation | post-write reads, browser observation metadata, command output | not normalized across capabilities |
| evidence | notes, coding result reasons, browser/patch evidence lines | evidence ownership is mixed with user-facing output |
| result mapping | coding summaries plus `resultMapper.ts` downstream | branch-local summaries can drift without a common projector |
| transcript | `QueryEvent` stream consumed by session runtime | event vocabulary is still broad/string-heavy |
| continue/replay | continuity state and runtime handoff projections | continuation logic remains embedded in planning |
| eval/report | verifier scripts and harnesses | route-specific report shapes |
| cleanup/redaction | browser and verifier surfaces | not a shared receipt vocabulary |

## Concentration Points

1. `buildWorkflowTaskPlan` is the main pressure point. It mixes prompt signal
   extraction, target resolution, continuity interpretation, browser planning,
   edit/read/verify planning, and diagnostic handoff.
2. `executeWorkflowTaskPlan` is the second pressure point. It dispatches
   capabilities while building user-facing output and coding result state.
3. Provider diagnostic handoff and action-result seed logic are already
   projection-shaped but still participate directly in planning.
4. Mutation target selection and read-window continuation helpers are pure
   enough to extract later, but broad movement would risk hidden behavior drift.

## Route 137 Candidates

Route 137 should not start by shrinking the file mechanically. It should extract
one projection family with tests:

1. agent-loop intent signal projector
2. provider diagnostic handoff planner
3. mutation target selection projector
4. read-window continuation projector
5. capability result summary projector

Stop if an extraction requires provider auth, browser runtime behavior,
workspace write authority, CLI behavior, or session schema changes.
