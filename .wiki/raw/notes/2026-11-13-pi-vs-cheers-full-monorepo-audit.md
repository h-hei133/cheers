---
title: "Pi vs. Cheers Full-Repository Strict Comparative Audit (2026-11-13)"
date: 2026-11-13
tags: [pi, cheers, gap-analysis, monorepo, tui, durable, chord, providers, extensions, rpc, sdk]
source: "Direct full-repo comparative inspection of /home/wang/projects/pi (47e9d74f9) and /home/wang/projects/cheers (380dcc58)"
---

# Pi vs. Cheers Full-Repository Strict Comparative Audit (2026-11-13)

- **Audited commits**: `/home/wang/projects/pi` at `47e9d74f9`; `/home/wang/projects/cheers` at `380dcc58`.
- **Scope**: Full-monorepo comparison across all 12 `pi` packages (`ai`, `agent`, `tui`, `coding-agent`, `codemode`, `durable`, `chord`, `env`, `mcp`, `schema`, `telemetry`, `evals`) + `apps/` (`p2`, `p2-mac`) against all 37+ top-level directories inside `cheers/packages/ts-shell/src` and root tooling.

## 1. Quantitative Scale & Domain Footprint

| Subsystem / Metric | `pi` (`47e9d74f9`) | `cheers` (`380dcc58`) |
| --- | --- | --- |
| Workspace packaging | 12 focused packages + `apps/p2`, `apps/p2-mac`, `apps/p3` | 1 monolithic package (`packages/ts-shell`) with 37+ `src/` domains |
| Core agent / coding host | `packages/agent` (17 files), `packages/coding-agent` (742 files) | `core/` (803 files, 277 tests), `cli/` (497 files, 197 tests), `session/` (281 files, 113 tests) |
| TUI & Presentation | `packages/tui` (105 files + 3 native `.node` addons), `modes/interactive` (71 files) | `presentation/` (206 files, 80 tests), `cli/interactive/` (~209 files) |
| Web / Desktop / Voice apps | `apps/p2` (841 files + `ghostty-vt.wasm` + `voice-server`), `apps/p2-mac` (22 files) | None (`src/desktop/` 9 files is an X11 automation tool; `src/media/` 12 files, 0 tests) |
| Durable & Sync substrate | `packages/durable` (285 files), `packages/chord` (842 files) | `session/recovery/`, `collaboration/` (26 files, 4 tests), `planning/` (43 files, 7 tests) |
| Non-coding verticals in core pkg | Delegated to extensions/MCP/examples | `browser/` (257 files, 73 tests), `workflow/` (72), `research/` (53), `advisor/` (15), `eval/` (11, 0 tests) |
| Build / Lint / Test stack | `typescript` 7.0.2 (devDep), Biome 2.3.5 + custom Grit rule, `esbuild` bundle, Vitest 4.1.12, `flake.nix` | `typescript` ^5.2.0 (`dependencies`), **no linter/formatter**, plain `tsc`, Vitest 0.34.0, 100+ scripts |

## 2. Unwired & Half-Stubbed Features from Commit `380dcc58`

Direct source inspection at HEAD `380dcc58` shows five newly added capabilities are wired only in unit tests or contain broken production paths:

1. **Broken `abort` command in RPC (`packages/ts-shell/src/cli/rpc/rpcServer.ts:13,45,97,132-221`)**:
   - `abort` is declared in `RpcCommand`, `RPC_COMMAND_TYPES`, `tryParseRpcCommand`, `RpcHost`, and wired in `cli/runtime/inputStream.ts:223-226`.
   - `handleRpcCommand` (`rpcServer.ts:132-221`) lacks `case "abort":`; sending `{"type":"abort"}` falls through to `default:` and returns `"Unsupported RPC command."`.
2. **Unwired `prepareRequest` (`packages/ts-shell/src/core/agent/agent.ts:8-28,171-189`)**:
   - `AgentLoopConfig.prepareRequest` (`core/agent/loop.ts:148-156`) is tested in `loop.test.ts:549-562`, but `AgentCoreOptions` and `AgentCore.createLoopConfig()` do not accept or forward `prepareRequest` (zero production callers).
3. **Unwired `VirtualModelRegistry` & Anthropic/OpenAI cache flags in `turn/step.ts` (`packages/ts-shell/src/turn/step.ts:429-462`)**:
   - `VirtualModelRegistry` (`core/models/virtualModels.ts:4-81`) has 0 non-test callers.
   - `turn/step.ts:429-462` never forwards `cacheRetention`, `initialTools`, `supportsMidConvoToolChanges`, or `supportsMidConvoEffort` to `endpointTurnBody`.
   - `anthropicMessages.ts:159-160` never emits `anthropic-beta` headers (`0` matches in `ts-shell/src`), hardcodes `body.output_config = { effort: "low" }`, and omits `historicalEfforts` when calling `insertThinkingLevelMessages`.
4. **No-op `ExtensionAPI` stubs in production worker (`packages/ts-shell/src/extensions/runtime/inProcessLoader.ts:198-204`, `execute.ts:36`)**:
   - `loadInProcessExtension` is only called in `inProcessLoader.test.ts:48`. Production `execute.ts:36` invokes `executeInProcessScript`, whose `EXTENSION_WORKER_SOURCE` binds `registerTool: () => {}`, `registerCommand: () => {}`, and `on: () => {}` as no-op stubs.
5. **Active `TOOL_OUTPUT_LIMIT` & `edit` schema friction (`core/agent/tools.ts:91,274`, `edit/tool.ts:14-45`, `tools/preparation.ts:20,26,67,75,86,98`)**:
   - `executeToolBatch` still enforces `boundText(..., TOOL_OUTPUT_LIMIT)` (char-based `slice(0, 51200)`); `edit/tool.ts` still retains `oneOf` + `not: { anyOf: [...] }`; `tools/preparation.ts` still executes 4–5 `JSON.stringify` passes per edit/patch lifecycle.


## 3. TUI, Terminal Protocols, Unicode & Multi-App Surfaces

- **Frame write chunking**: `pi/packages/tui/src/tui-main-screen.ts:21-72` (`BoundedTerminalWriter`) splits frames into 1 MiB UTF-16-safe chunks (`MAX_RENDER_WRITE_CHARS = 1048576`). `cheers/packages/ts-shell/src/presentation/tui/render/engine.ts:435-443` builds and writes a single monolithic string buffer per paint.
- **Terminal OSC & geometry protocols**: `pi/packages/tui/src/terminal.ts:15-17,179-183,299-302,618-631` + `program-status.ts` + `tui.ts:181-184,1043` support OSC `9;4` progress bars, OSC `7501` program status, OSC `10`/`11`/`4` palette queries, `\x1b[16t` cell pixel size, and OSC `133` prompt zones. `cheers/presentation/tui/input/appearance.ts:2-3` only queries DEC `2031` + OSC `11`.
- **Capability & image sizing**: `pi/packages/tui/src/terminal-image.ts:46-135,323-325,602-732` probes tmux `#{client_termfeatures}` for OSC 8 hyperlinks, detects `herdr`/`rex`/`orca`/`zed`/`jediterm`, parses PNG/JPEG/GIF/WebP headers for cell row layout, and caps offscreen Kitty images by count (16), bytes (32 MiB), and decoded pixels (64 MiB, `tui-alt-screen.ts:78-80`). `cheers/presentation/tui/terminalCapabilities.ts:23,32-58` and `image.ts:39-83` are static env checks without image header parsing or decoded-pixel accounting (`render/engine.ts:57-58,456-475`).
- **Wide-char / emoji width**: `pi/packages/tui/src/utils.ts:36-49` uses `get-east-asian-width`, `\p{RGI_Emoji}`, and `terminalSpacingMarkRegex`. `cheers/presentation/tui/text/width.ts:15-99` hand-rolls `WIDE_RANGES` missing regional indicators (`0x1F1E6..0x1F1FF`) and ZWJ emoji without `U+FE0F`.
- **Native N-API helpers & overlays**: `pi/packages/tui/src/native-platform.ts:27-60` ships darwin/linux/win32 `.node` addons for modifier state (`isModifierPressed`, fixing Apple Terminal Shift+Enter) and clipboard; `tui.ts:267-340` supports multi-layer composable overlays (`nonCapturing`, responsive visibility). `cheers` uses shell-outs (`clipboardImage.ts:66-120`) and single active picker (`cli/interactive/overlay.ts:25-120`).
- **Web / Desktop / Ghostty-VT**: `pi/apps/p2` (React web workbench, `ghostty-vt.wasm`, voice STT/TTS + barge-in) and `pi/apps/p2-mac` (19 Swift files, AppKit + `WKWebView`) have no counterpart in `cheers` (`desktop/tool.ts` is an X11 automation tool).

## 4. Session Tree, Durable Execution (`pi-durable`), Sync (`chord`) & Agent Loop

- **Session tree vs 22-subdir multi-file store**: `pi/packages/coding-agent/src/core/session-manager.ts:47-52,140-195,287-348,1378-1713` stores sessions in one append-only tree JSONL with `id`/`parentId`, schema migrations `v1 -> v3`, `ContextEditEntry` non-destructive edits, `LabelEntry` bookmarks, and `commonAncestorId` branch summarization (`branch-summarization.ts:96-131`). `cheers/session/` spreads `metadata.json`, `transcript.jsonl`, `state.json`, and lockfiles across 22 subdirectories (`SessionManager.ts`, `sessionFileStore.ts:12-56,121-153`), risking partial state (`SessionForkError`, `SessionNavigationWarning`) and lacking `ContextEditEntry` / `LabelEntry`.
- **Transactional durability (`pi-durable`)**: `pi/packages/durable/` implements multi-backend atomic `Storage` (SQLite, IndexedDB, JSONL with torn-line recovery, Memory, Chord store) verified by a 2,142-LOC `storage-conformance.ts` suite, plus suspendable `TaskRecord` (`pending`/`running`/`waiting`/`sleeping`/`completing`) and `TaskGraphView` (`harness/task-graph.ts:87-120`). `cheers/session/recovery/` relies on heuristic flag checks (`work.ts:5-12`); `core/subagents/team/fanOut.ts:61-106` uses in-memory `Promise.all` without crash-restart task state.
- **Cross-process reactive state (`chord`)**: `pi/packages/chord` provides delta-op (`Op`) `Replica` sync and bounded streaming outbox (`uploadSession`, 8 MiB batch / 4 MiB apply, epoch fencing). `cheers/collaboration/service/rooms.ts` uses coarse HTTP room polling (max 64 rooms, 5s leases, 256-event window + `snapshot.cutover`).
- **Streaming & loop boundary**: `pi/packages/agent/src/agent-loop.ts:183-198,218-265,390-444` cleanly separates `AgentMessage[]` from `Message[]` (`transformContext` + `convertToLlm`), emits incremental partial `AssistantMessage` updates, and supports `prepareNextTurn`, `prepareRequest` (`model` + `thinkingLevel`), and `finishTurn` (`continue | end`). `cheers/core/agent/loop.ts:327-349` awaits complete `AssistantStep`s and hardcodes `keepRecentTurns: 3, maxOutputChars: 1000` (`turn/messages.ts:8-9`).

## 5. Providers, OAuth, Catalog/Schema, Remote Env & Telemetry

- **Endpoint & OAuth breadth**: `pi/packages/ai/src/types.ts:62-84` & `auth/oauth/` cover 10 chat APIs + `openrouter-images` + 4 classifiers and 8 OAuth providers (including Anthropic, ChatGPT/Codex with WebSocket + zstd, Kimi, Meta, OpenRouter, Radius, GitHub Copilot). `cheers` covers 9 chat endpoints (missing `azure-openai-responses`, `mistral-conversations`, image/classifier endpoints), 3 OAuth providers (explicitly rejects Anthropic OAuth at `providerAuthRuntime.ts:90`), and lacks `x-should-retry` header handling (`core/agent/retry.ts`) and incremental streaming JSON `JsonChange` deltas (`pi/packages/ai/src/utils/streaming-json.ts:107-300` vs batch `jsonRepair.ts`).
- **Schema & catalog capabilities**: `pi/packages/schema` provides a zero-eval Draft 2020-12 / Draft 7 compiler + coercing validator; `model-schema.ts:51-96` defines tiered `inputTokensAbove` cost rates and `ModelInputLimits` (image resize dimensions/bytes/counts). `cheers/core/models/catalog.ts:24-113,184-190` uses flat pricing and TS interfaces without runtime schema validation or resize profiles.
- **Remote execution (`pi/packages/env` vs `cheers/runtime/execution/ssh/`)**: `pi` ships a persistent cross-platform Rust daemon (`pi-env serve`, 16 MiB multiplexed binary frames, full FS RPC `lstat`/`pread`/`scanLines`/`listFiles`/`watch` + `pty` + `exec`). `cheers/runtime/execution/ssh/client.ts:23-95` spawns a fresh `ssh` process per RPC (`CHEERS_SSH_1` 256 KiB text frames), supports job execution only (no remote FS/PTY), and hard-requires remote Linux `systemd-user` + `cgroup v2`.
- **Telemetry**: `pi/packages/telemetry` + `ai/src/telemetry.ts` offer OTel-style spans, events, links, `TelemetryStore` (`findTraces`, `getTrace`), cross-process `inject`/`extract` propagation, typed `defineTelemetrySchema`, and histograms. `cheers/observability/metrics.ts:1-147` buffers process-wide (not session-scoped) count/ms totals without histograms or carrier propagation.

## 6. SDK, Ecosystem (`ExtensionAPI`, `codemode`, `mcp`, `rpc`, `export_html`) & Bloat

- **No session-level SDK**: `pi/packages/coding-agent/src/core/sdk.ts:48-137` exposes `createAgentSession()` + `DefaultResourceLoader` (`extensionFactories`). `cheers/packages/ts-shell/src/index.ts:1-60` exports only verification/planning helpers.
- **Extension API & package manager**: `pi` exposes 40+ lifecycle events, `ui.*` dialogs/widgets/custom renderers, `registerProvider`, `registerVirtualModel`, `registerMcpServer`, `registerShortcut`, `registerFlag`, and `pi install` (`package-manager.ts`). `cheers` lacks a package manager and its production worker binds `registerTool`/`registerCommand`/`on` as empty no-ops.
- **Codemode remaining gaps**: `cheers` `codemode/tool.ts` uses in-memory `sessionStores` (max 64) rather than branch-scoped transcript persistence, and `describeTool` returns raw JSON Schema instead of TS declarations (`packages/codemode/src/declarations.ts:43-147`), lacking `describeNamespace`, `image()`, `models.*`, and deterministic WASI replay.
- **MCP**: `cheers/core/mcp/gateway.ts` uses bearer auth via `@modelcontextprotocol/sdk` and lacks `pi-mcp`'s full OAuth 2.0 loopback/PKCE flow (`packages/mcp/src/oauth/`) and `reachesTools` lazy startup wait.
- **RPC & HTML export gaps**: `cheers/cli/rpc/rpcServer.ts` implements 7 working commands (+ broken `abort`) vs `pi`'s 30 commands + bidirectional `extension_ui_request`/`extension_ui_response` protocol (`modes/rpc/rpc-types.ts:17-66,238-286`). `cheers/session/export/` lacks `highlight.min.js`, full `marked` GFM/CJK markdown, token/cost stats (`computeStats()`), collapsible thinking blocks, tool diffs, and inline image lightbox (`pi/core/export-html/`).
- **CLI flags & config over-engineering**: `cheers/entrypoints/cliArgs.ts` omits `--model`, `--models`, `--thinking`, `--continue`, `--resume`, `--fork`, `-e`, `--no-tools`, `--export`, `--list-models`, etc., and relies on a multi-pass `rawArgs` scanner; `cheers/config/` spans 40+ files (~50+ fields × 8 policy dimensions + provenance trees) vs `pi`'s 4-file TypeBox `SettingsManager`.
- **Horizontal sprawl**: `packages/ts-shell/src/` bundles 37+ domains (`browser/` 257 files, `core/commands/` 180+ files, `workflow/` 72, `research/` 53, `planning/` 43, `collaboration/` 26, `advisor/` 15, `eval/` 11) and 100+ scripts into a single unbundled `tsc` package with `typescript` in runtime `dependencies` and zero linter/formatter.

## 7. Verified Strengths Where Cheers Matches or Exceeds Pi

- **OS Command Sandbox & Static Security (`sandbox/osSandbox.ts`, `security/service.ts`)**: `bwrap`/`sandbox-exec` fail-closed isolation with monotonic `tighten(user, project)` rules and built-in SARIF scan/remediation (`pi` has no OS command sandbox).
- **Multi-Account Auth Pooling (`core/auth/account/pool.ts`, `lease.ts`)**: Session-affinity credential pooling (`AFFINITY_LIMIT = 1024`) and file-backed refresh leases (`pi` holds one credential per provider).
- **TUI Vim Modal Editor, Terminal Recording, Stashed Draft Protection & Theme Watcher (`presentation/tui/editor/modal/`, `media/record/`, `pastes.ts`, `themes/watch.ts`)**: Full Vim modes/motions/registers, secret-redacted terminal stream capture/playback, stashed-draft paste eviction protection, and schema-validated live theme hot-reload.
- **Compaction Budget Guards & Loopback Trace Dashboard (`session/compaction/budget.ts`, `observability/traceDashboard.ts`, `cacheWaste.ts`)**: `WeakMap` token caching, `openCallsBefore` safety, `FINAL_STEP_MESSAGE` closing reservation, in-process compaction dedup, per-turn cache-miss cost notice, and local loopback trace viewer.
- **Trust-Gated Config & Skill Diagnostics (`config/`, `core/skills/skillLoader.ts`)**: Strict secret partitioning (`auth.json` vs `config.json`), untrusted-project gating, and explicit `unhonouredFields` diagnostics on skill frontmatter.