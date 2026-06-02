# Mature Agent Capability Map

This map extracts capability patterns from the mature local Pi implementation
and Pi public docs named by the existing blueprint. It is a product-planning map,
not permission to copy code, names, UI, dynamic loading, provider behavior, or
write semantics.

Primary evidence:

- Local implementation: `/home/wang/projects/pi`.
- Prior targeted inspection: `docs/build-infrastructure/pi-reference-inspection-notes.md`,
  `docs/build-infrastructure/pi-deep-audit-uncovered-patterns.md`.
- Public docs: `https://pi.dev/docs/latest`, especially sessions, session
  format, compaction, extensions, JSON mode, RPC, SDK, packages, providers,
  models, and settings.

## Capability Areas

| Area | Mature capability pattern | Target translation |
|---|---|---|
| Product lifecycle | A host accepts input, snapshots turn state, prepares context/model/tool state, streams assistant output, executes tool calls, writes session entries, refreshes state at save points, drains queued input, retries/aborts/fails distinctly, and settles. | Keep one governed loop substrate, but let owner domains own request, tool, execution, evidence, result, session, and presentation facts. |
| Interactive CLI behavior | Interactive mode exposes prompt entry, streaming output, model/account/status controls, queue behavior, session operations, command invocation, and user-facing tool rendering. | Improve CLI ergonomics through product surface and session owners; do not make terminal text the runtime API. |
| Machine-readable mode | JSON/RPC/SDK surfaces expose structured events and commands separately from terminal rendering. | Stabilize JSON event envelope and host contract after event projection is complete; avoid broad SDK/RPC behavior until runtime facts are stable. |
| Session creation and resume | Sessions are durable append-only records with metadata and replay/rebuild from persisted entries plus current runtime dependencies. | Continue strengthening `session`, `session/replay`, and `context` with report-safe facts; do not treat replay as success. |
| Branching and continuation | Session records can form a tree with parent ids, active leaves, branch summaries, labels, and branch navigation. | Build storage-backed branch support only after projection and continuation readiness remain green. |
| Compaction/context reduction | Compaction prepares retained/excluded context, writes summary entries, handles overflow/manual compaction, and supports branch summaries. | Add branch-aware and compaction-aware summary contracts with explicit stale/unsafe/missing facts. |
| Turn loop | A low-level loop streams assistant messages, extracts tool calls, dispatches sequential/parallel tools, creates tool result messages, checks stop conditions, and prepares next turn. | Preserve tool policy/result/evidence ownership; do not collapse loop decisions into terminal truth. |
| Provider/model boundary | Registry resolves provider/model metadata, auth readiness, request options, compatibility flags, and provider-specific streaming behavior. | Expand metadata and compatibility flags default-off; live calls require explicit opt-in and redaction. |
| Provider request preparation | Before-provider hooks can adjust request options/payloads and observe responses in the mature implementation. | Use a constrained provider request boundary; do not expose general request hooks until secret/auth policy is explicit. |
| Tools | Tools have schema, model-facing content, structured details, execution mode, start/update/end events, before/after hooks, and result messages. | Continue with `tools`, `turn`, and `runtime/execution`; allow read-only concurrency first, mutation only with authority and evidence. |
| Commands/reusable capabilities | Commands, tools, prompts, themes, shortcuts, providers, and UI customizations can register through extension/resource APIs. | Start with typed static internal registration and governance metadata; dynamic executable loading remains an anti-goal for now. |
| Events | Runtime emits structured lifecycle, message, tool, queue, save point, compaction, retry, and provider events. | Continue projecting host-neutral runtime events; terminal/session/presentation consume but do not own facts. |
| Presentation | TUI, print/JSON/RPC, and export renderers are separate surfaces over shared runtime facts. | Keep product surface model as fact renderer; avoid renderer-specific success logic. |
| Extension/package shape | Packages and extensions provide resources, commands, tools, UI, providers, settings, and hooks with manifests and lifecycle. | Model provenance, enablement, conflicts, trust, pinned state, and supported state before any loading/execution. |
| Configuration/setup | Settings and resource loaders resolve user/project config, model selection, provider auth state, prompts, themes, and context files. | Add configuration inventory and setup diagnostics as facts, not hidden behavior changes. |
| Permission/execution boundary | Execution environment separates file system and shell operations from loop logic; tool permissions and hook decisions can block work. | Keep `ExecutionService` as the side-effect boundary; no scattered child process, writable fs, provider, browser, or MCP side effects. |
| Verification/repair/failure/recovery | Mature lifecycle distinguishes errors, aborts, retries, context overflow, compaction failure, provider failure, tool failure, and session failure. | Keep failure taxonomy distinct and require evidence/result verdicts before success. |
| Truthfulness | Lifecycle facts, provider responses, tool results, summaries, renderers, and replay are facts or claims, not success. | Preserve explicit `notProvenClaims` and `terminalSuccessClaim: false` outside evidence/result verdicts. |
| Packaging/distribution | Multi-package release shape, CLI binary, local release smoke, pinned dependencies, and provider/model docs. | Improve release/package readiness only after runtime capabilities are truthfully proven; avoid default real-provider behavior. |
| Testing/validation | Unit tests cover package owners, focused integration tests cover runtime behavior, release smoke validates packaging, faux providers avoid paid/live dependencies. | Use owner-focused tests and route-specific gates; live-provider validation remains explicit opt-in only. |

## Intentional Non-Copy Areas

- Dynamic plugin/package loading or executable extension hooks.
- Provider default enablement, automatic auth discovery, or secret-path access.
- Broad SDK/RPC/server behavior before JSON event contracts are stable.
- Browser automation or external tool server behavior.
- Wide patch/mutation capability without snapshot/revert, stale-read, authority,
  and task-relevant verification.
- Parallel mutation execution before conflict prevention and receipt ordering are
  proven.
- TUI adoption as a goal; the target remains a TypeScript shell/control-plane
  product with fact-based presentation.
- Reference implementation names, public field names, route-era wording, or
  outside-project vocabulary in product code.
