# Build Infrastructure Deferred Patterns

Status: BI017 closeout.
Date: 2026-05-29.

## Deferred Pattern Matrix

| Pattern | Why deferred | Current supporting infrastructure | Blocker | Safest future route | Validation required |
|---|---|---|---|---|---|
| Real provider streaming | High secret, auth, redaction, and partial-output risk | Provider registry metadata, loop model boundary, runtime events, product surface | Explicit opt-in streaming adapter and redaction policy are not implemented | Real CLI Coding Loop Integration, then controlled provider streaming route | fake-provider stream tests, redaction tests, no private config reads, explicit opt-in gate, result truth tests |
| Real tool batch execution through product loop | Could bypass authority and current product loop semantics | tool interception, execution receipts, tool result split, loop trajectory | Current loop spine is observation-only | Real CLI Coding Loop Integration | before-tool allow/deny tests, execution receipt tests, relevant verification, no success from selected-not-run |
| Product loop replacement | Would require broad runtime rewrite | agent loop contract, trajectory projection, product surface summary | Current `workflowExecutionCoordinator` and shell runtime remain authoritative | Not first product route; integrate incrementally | coordinator boundary tests, session runtime tests, result-contract gate, focused product path tests |
| SDK package | Would create external API promises before local loop is stable | JSON event stream and host-neutral events | No stable product loop API contract | Later SDK/API route after CLI loop stability | API contract tests, backward compatibility tests, redaction and truthfulness tests |
| RPC server | Network/process surface and lifecycle risk | JSON event stream projection only | No server lifecycle, auth, cancellation, or isolation boundary | Later RPC route after SDK boundary | server lifecycle tests, cancellation tests, auth/redaction tests, no default network exposure |
| TUI | UI can hide truth or become fact owner | product surface view model and terminal renderer | Product loop and renderer plugin boundaries are not mature | Later UX route after product loop evidence is stable | renderer tests, terminal truth tests, accessibility/output stability checks |
| Renderer plugins | Dynamic rendering can become plugin execution | presentation boundary and static renderer | No plugin trust, load, or capability model | Later extension-renderer route | static plugin manifest tests, no dynamic execution, renderer truth tests |
| Dynamic extension execution | Highest hook/plugin risk | extension lifecycle and hook policy contracts | No execution sandbox, trust model, or opt-in loader | Dedicated extension execution route after local loop stable | default-off tests, forbidden effect tests, sandbox/permission tests, no success rewrite |
| Package installation or dynamic loading | Supply-chain and side-effect risk | package manifest/inventory projection | No install/load authority, provenance verification, or lock/integrity enforcement | Package loading route after governance and extension execution design | no-network default tests, integrity tests, provenance tests, explicit install authority |
| Session storage migration | Durable data risk | session tree projection, active path, context rebuild projection | Migration and compatibility are not needed for projections | Dedicated session migration route only when product feature requires it | migration fixtures, rollback tests, replay/recovery tests |
| Storage-backed branching | Could break resume/replay semantics | branch-capable projection and active path | Current storage remains linear | Branch-aware session route | branch persistence tests, active path tests, resume/replay tests |
| Storage-backed compaction | Could hide evidence or lose context | compaction projection and context rebuild policy | No durable compaction model in current route | Compaction product route after branch storage | compaction evidence tests, raw transcript exclusion tests, replay tests |
| Branch-aware extension state | Requires branch storage and extension lifecycle integration | session projections, extension hook contracts | Both branch storage and executable extension state are deferred | After branch storage and extension execution routes | branch state isolation tests, hook policy tests, no cross-branch leakage |
| Dynamic resource discovery | Can silently load untrusted files/packages | static resource projection and package governance | No discovery provenance or opt-in loader | Resource discovery route after package loading policy | discovery default-off tests, provenance tests, no dynamic execution |
| Provider request hooks and auth refresh | Secret/header exposure and provider behavior risk | provider registry metadata and compatibility flags | Auth refresh and request hooks are not productized | Provider request hook route after CLI loop integration | fake-provider auth tests, redaction tests, no provider.env read, explicit opt-in |
| Parallel tool execution | Concurrency can break ordering, writes, and evidence | tool batch metadata, execution receipts, runtime events | No concurrency authority or per-file queue | Read-only parallel tool route first | deterministic event ordering, no-write assertions, cancellation tests |
| Per-file mutation queue | Needed only when concurrent mutation exists | edit/write authority and execution receipt surfaces | Parallel writes are not enabled in BI sequence | Mutation queue route after parallel/read-only route | conflict tests, stale-read tests, authority tests, relevant verification |
| Real product integration priorities | Infrastructure should now be consumed by user-visible features | loop spine, provider registry, tool policy, receipts, session/context projections, product surface, result truth | Current routes are infrastructure-heavy | Real CLI Coding Loop Integration | product path tests, result-contract gate, focused session/runtime/presentation tests |

## Closeout Rule

Future work should not add more generic infrastructure unless a product route
proves the missing owner/domain boundary. The next route should integrate the
existing spine into real CLI coding behavior under strict evidence and opt-in
constraints.
