# Pi Next Direction Map

BI006 recommends future build-infrastructure work by owner domain. The order is
chosen to preserve the architecture cleaned up through BI001 to BI005: owner
domain first, no compatibility shim growth, no route-era product naming, no
dynamic plugin execution, no provider default enablement, no broad runtime
rewrite, and no ExecutionService bypass.

## Priority Map

| Priority | Direction | Owner domains | Kind | Expected benefit | Implementation risk | Architecture cleanliness risk | Validation approach |
|---|---|---|---|---|---|---|---|
| 1 | Extension lifecycle and hook boundary | `runtime/resources`, future extension owner, `core/tools` only for hook observation, `provider` only for metadata, CLI only for display | Implementation | Creates a sanctioned owner for extension metadata, lifecycle phases, hook registration, and default-disabled hook observation. | High if executable plugins or arbitrary imports are introduced. | High if it becomes a generic plugin runtime, helper bucket, or provider bypass. | Focused contract tests proving lifecycle is non-executable/default-off, hook events are report-safe, provider/tool success is not inferred, and CLI only displays metadata. |
| 2 | Session branch, compaction, and context rebuild | `session`, `context`, `evidence`, `result`, minimal `core/shell` display | Implementation | Moves from linear-path projection to branch-aware projection and safe compaction summary boundaries without migrating storage first. | High around replay, recovery, compact continuity, and terminal truthfulness. | Medium if branch summaries are treated as evidence or success. | Session projection tests, compact continuity tests, replay/recovery focused tests, redaction tests, and no schema migration assertion. |
| 3 | Programmatic runtime API and JSON event stream | `runtime/events`, `runtime`, `session`, `result`, CLI host boundary | Implementation | Defines host-neutral runtime output so CLI is one host, not the runtime API. | Medium because transcript and terminal compatibility can drift. | Medium if SDK/RPC semantics are promised before event contract is stable. | Event schema/projection tests, CLI surface compatibility tests, transcript persistence tests, and result truthfulness tests. |
| 4 | Provider/model registry and compatibility flags | `provider`, model adapter owner, `runtime/resources`, `core/shell` readiness display | Implementation | Contains provider-specific compatibility flags, endpoint classes, and request auth status without spreading conditionals. | High around secrets, private config, and accidental default enablement. | High if custom provider execution or auth loading escapes explicit opt-in. | Provider registry unit tests with fake metadata only, redaction tests, default-disabled tests, readiness tests, no real provider config reads. |
| 5 | Tool hook permission interception | `core/tools`, policy owner, `runtime/execution`, `evidence`, `result` | Implementation | Adds a constrained interception point for tool allow/deny/observe decisions without changing execution semantics. | High if hooks can rewrite success, tool content, or details. | High if permission states collapse into success-like states. | Tool policy tests, ExecutionService receipt tests, result truthfulness tests, denied/pending/approved state tests. |
| 6 | Package/resource governance | `runtime/resources`, package/resource governance doc owner, policy, provider metadata only | Planning then implementation | Defines provenance, trust, version, and opt-in rules before loading packages or resources. | Medium if kept metadata-only; high if install/load is implemented too early. | High if package install side effects or network lookup are added. | Docs/spec tests first; later static manifest validation and no-side-effect tests. |
| 7 | UI rendering and message renderer boundary | CLI/UX renderer owner, `runtime/events`, `core/tools` render projection | Planning then implementation | Separates runtime facts from terminal/TUI/export rendering. | Medium because visible output can drift. | Medium if renderers start owning business facts. | Renderer projection tests, snapshot/golden tests only for stable surfaces, runtime truthfulness tests. |
| 8 | Steering, follow-up, and next-turn delivery modes | `session`, `runtime`, `context`, CLI interaction owner | Implementation after session branch route | Makes mid-run, follow-up, and next-turn input semantics explicit. | Medium around prompt barriers and interrupted runs. | Medium if queued text bypasses session/context truth boundaries. | Prompt barrier tests, session future-turn tests, interrupted/resume tests. |
| 9 | Provider request hooks and auth refresh | `provider`, model adapter owner, policy | Delayed implementation | Enables request-scoped auth refresh and request shaping without persistent default enablement. | High due to secrets and provider auth. | High if hooks expose provider.env or raw headers. | Fake-provider tests only, redaction tests, explicit opt-in tests, no private config read assertions. |
| 10 | Parallel read-only tool experiment | `core/tools`, `runtime`, policy, result/evidence | Experiment | Tests whether read-only tool parallelism can be safe without mutation concurrency. | Medium for event ordering; high for mutation if scope expands. | High if write tools are included. | Read-only fixture tests, deterministic event order tests, no-write assertions. |

## Immediate Next Route

Recommended BI007:

`Extension Lifecycle And Hook Boundary`

Owner domains:

- `runtime/resources` for extension-like descriptors and lifecycle projection.
- A dedicated extension owner if product code is needed; do not place behavior
  under `utils`, `common`, orchestration, or compatibility surfaces.
- `core/tools` only for observation of tool-hook contracts, not execution
  behavior changes.
- `provider` only for default-disabled metadata and not auth loading.
- `core/shell` only for safe display.

Scope:

- Define extension lifecycle states such as discovered metadata, validated,
  disabled, opt-in required, hook registered, hook unsupported, and rejected.
- Define a report-safe hook boundary for lifecycle, tool, provider, session, and
  UI categories without executing extension code.
- Keep dynamic discovery, package loading, plugin execution, provider
  registration, and provider calls disabled.
- Project hook availability as observation only, never as success.

Risks:

- Extensions can become a new product dumping ground.
- Hook APIs can mutate success or tool results before result truthfulness.
- Provider hooks can accidentally create a default-enabled provider path.
- Package/resource loading can smuggle side effects.

Validation:

- Focused descriptor/lifecycle tests.
- Redaction tests for hook payloads.
- Tests proving default-off and non-executable behavior.
- Tests proving hook presence does not imply provider/tool/terminal success.
- `git diff --check` and `git status --short --branch`.

## Recommended Route After BI007

Recommended BI008:

`Session Branch Compaction And Context Rebuild`

Owner domains:

- `session`
- `context`
- `evidence`
- `result`
- minimal `core/shell` display if needed

Scope:

- Extend the current schema-neutral session projection before any storage
  migration.
- Represent branch/leaf/ancestor facts as projection, not persistence rewrite.
- Add compaction and branch-summary boundaries as not-verdict evidence.
- Rebuild context from active path facts without raw transcript leakage.

Validation:

- Session projection tests.
- Compact continuity tests.
- Replay/recovery focused tests.
- Redaction tests.
- Explicit no-session-schema-migration check in review.

## Grouping Strategy

Can be combined:

- Provider/model registry and static provider metadata if the route remains
  fake-provider-only and default-disabled.
- SDK/RPC/JSON event stream with runtime host separation if the first route is
  contract/projection only.
- UI renderer boundary with tool render projection if no new TUI host is added.

Must stay separate:

- Extension lifecycle and executable extension loading.
- Session branch projection and session schema migration.
- Provider/model registry and provider request hooks/auth refresh.
- Tool permission interception and parallel tool execution.
- Package/resource governance and package installation/loading.
- UI renderer boundary and TUI package adoption.

## Stop Conditions For Future Routes

Stop and re-scope if a proposed route requires:

- product files named after route numbers, capstones, sprints, MVPs, or
  closeouts
- business logic in compatibility shims
- dynamic plugin execution
- provider default enablement
- manual private provider config access
- package installation or network lookup
- session schema migration before projection proof
- side effects outside ExecutionService or a sanctioned owner
