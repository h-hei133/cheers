# Pi Pattern Rejection And Delay Log

This log records Pi patterns that should not be copied now. It is intentionally
conservative because this project has stricter evidence, provider, write, and
execution boundaries than Pi.

## Reject Now

| Pattern | Why not now | Revisit signal | Risk of copying Pi blindly |
|---|---|---|---|
| Direct Pi package/file structure | Local owner domains already exist and route-era/product reset rules forbid structure churn for its own sake. | A future route proves a missing owner domain that cannot be represented locally. | Recreates product/orchestration/helper dumping grounds and breaks local naming constraints. |
| Dynamic plugin execution | BI005 only allows metadata-only extension manifests. Executing extension code would add side effects, trust, and provider/tool mutation risk. | A completed lifecycle/hook contract, package governance model, sandbox story, and explicit opt-in UX. | Turns metadata availability into executable authority and bypasses evidence truthfulness. |
| Provider default enablement | Real provider access must remain explicit opt-in, redacted, and isolated. | None for default enablement; only explicit opt-in provider routes are acceptable. | Converts provider metadata or registry presence into provider-called or success-like state. |
| Package installation/loading in build-infrastructure routes | BI006 is documentation-only and BI005 forbids package loading. Install/load behavior has network and filesystem side effects. | A governance route defines provenance, trust, offline mode, version pinning, and no-write/default-off policy. | Adds hidden side effects and supply-chain behavior before owner boundaries exist. |
| Session schema migration as first branch route | Current projection can model gaps without changing persistence. Replay, recovery, compact, and continuation are high-risk. | A projection route proves exact migration requirements and compatibility strategy. | Breaks existing session durability while chasing Pi's tree shape. |
| TUI package adoption | The current product has CLI/session surfaces, not a Pi-style TUI architecture goal. | A route specifically scopes a UI host after runtime event/API boundaries are stable. | Large UI churn where renderer code starts owning runtime truth. |
| Pi ExecutionEnv copied as a second side-effect path | Local `ExecutionService` is the sanctioned execution boundary. | Only if adapted as an internal ExecutionService facade without bypass. | Introduces direct shell/fs authority outside the existing receipt and approval model. |
| Tool hooks that rewrite success | Result Surface owns terminal truthfulness. Hook presence or patched details cannot create success. | A policy/result route proves hook patches are evidence-only and verdict-gated. | Tool hooks become a shortcut around evidence/verdict contracts. |

## Delay

| Pattern | Why delay | Revisit signal | Risk if rushed |
|---|---|---|---|
| Resource loading beyond static descriptors | BI005 intentionally stopped at explicit in-memory metadata. | Extension lifecycle and package governance routes are complete. | Dynamic discovery becomes default startup behavior. |
| Extension state persistence | No local executable extension owner or branch-aware session state exists yet. | Extension lifecycle contract plus session branch projection are both proven. | Extension state leaks across branches or resumes stale state. |
| Branch-aware extension rebuild | Depends on both session branch semantics and extension lifecycle. | BI008-style branch/context rebuild lands and extension state has a schema-neutral projection. | Hooks observe wrong active leaf or rebuild from raw transcript. |
| Provider request hooks | Request hooks touch auth, headers, payloads, and model compatibility. | Provider/model registry route proves fake-provider, redacted, explicit opt-in request metadata. | Secrets leak or provider.env becomes a runtime dependency. |
| Per-request auth refresh | Similar risk to provider hooks and private config. | Provider readiness and model registry have request-scoped fake-provider coverage. | Manual/private provider config coupling or default enablement. |
| Parallel tool execution | Local write and mutation routes require strict authority and stale-read checks. | A read-only experiment proves deterministic ordering and no write tools. | Parallel writes conflict and evidence order becomes ambiguous. |
| Per-file mutation queue | Useful only when concurrent write paths are introduced. | Parallel execution route scopes mutation concurrency explicitly. | Adds unnecessary coordination logic before the concurrency problem exists. |
| SDK/RPC host promises | Runtime event projection exists, but external API compatibility is not yet a product contract. | JSON event stream contract is stable and CLI compatibility tests pass. | CLI output or transcript semantics drift under SDK pressure. |
| UI/message renderer registry | Rendering should not own business facts. | Host-neutral event stream and tool result projection are stable. | Renderers mutate or reinterpret runtime truth. |
| Steering/follow-up/next-turn modes | Local prompt barriers and future-turn injection exist, but branch/context behavior is not complete. | Session branch/context rebuild route lands. | Queued input bypasses session/context constraints. |

## Patterns Worth Adopting With Adaptation

- Extension lifecycle as a default-disabled contract, not a plugin runtime.
- Hook categories as report-safe observations before execution capability.
- Branch and compaction summaries as evidence-only session projections.
- Provider/model compatibility flags as fake-provider-safe metadata before auth
  or request hooks.
- SDK/RPC/JSON event streams as host-neutral projections before external API
  support.
- Package governance as policy documentation before package install/load.
- UI renderer boundaries as display adapters, not truth owners.

## Blind Copy Risks

Pi is useful as a clean reference, but direct copying would conflict with this
project's constraints in predictable ways:

- Pi has dynamic resources and extension execution; this project requires
  default-off, explicit opt-in, and no dynamic plugin execution.
- Pi provider and model systems are richer; this project must preserve private
  provider boundaries and avoid real-provider default paths.
- Pi session tree is central; this project must preserve existing replay,
  recovery, compact, and continuation behavior before schema migration.
- Pi has SDK/RPC/TUI surfaces; this project must stabilize runtime event facts
  before promising host APIs or UI renderers.
- Pi uses an ExecutionEnv abstraction; this project must keep side effects
  inside ExecutionService or a sanctioned owner.
