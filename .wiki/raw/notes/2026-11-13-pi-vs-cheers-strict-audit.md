---
title: "Pi vs. Cheers Strict Architectural & Implementation Audit (2026-11-13)"
source: "Comparative source-code inspection of /home/wang/projects/pi and /home/wang/projects/cheers"
type: notes
ingested: 2026-11-13
tags: [references, pi, gap-analysis, prompt-caching, tools, compaction, codemode, architecture]
summary: "Strict evidence-backed comparative audit between Pi (up to 2026-11-13) and Cheers across prompt caching, tool pipeline, compaction, extensions, codemode, and package modularity."
---

# Pi vs. Cheers Strict Architectural & Implementation Audit (2026-11-13)

## 1. Scope & Evidence Baseline

- **Target Repository (`cheers`)**: `/home/wang/projects/cheers/packages/ts-shell/src` (commit `fa5624c6` + working tree `grepRipgrep.ts` fix).
- **Reference Repository (`pi`)**: `/home/wang/projects/pi` (`packages/agent`, `packages/ai`, `packages/coding-agent`, `packages/codemode`, `packages/mcp`, `packages/tui`, `packages/durable`, `packages/chord`).

---

## 2. Prompt Caching & Context Economics (Critical Deficiencies in `cheers`)

### 2.1 Self-Inflicted Prefix Mutation via `microcompactMessages`
- **`cheers` Evidence**:
  - `packages/ts-shell/src/turn/messages.ts:6-10` (`outgoingProjection`) invokes `microcompactMessages(converted, { keepRecentTurns: 3, maxOutputChars: 1000, pruneToolText })` on every outgoing request.
  - `packages/ts-shell/src/core/query/microCompact.ts:28-31,86-95` defines `DEFAULT_KEEP_RECENT_TURNS = 3`, `DEFAULT_MAX_OUTPUT_CHARS = 1000`, `DEFAULT_HEAD_CHARS = 500`, `DEFAULT_TAIL_CHARS = 500`. As `messages.length` grows on each turn, `boundaryIndex` advances forward, mutating older `role: "tool"` messages in-place from their full text (`<= 10,000` chars) into `head (500) + [... Omitted ...] + tail (500)`.
  - Meanwhile, `packages/ts-shell/src/session/compaction.ts:60` also implements token-budgeted compaction (`KEEP_RECENT_TOKENS = 20_000`).
- **`pi` Evidence**:
  - `packages/coding-agent/src/core/compaction/compaction.ts:120-130` (`DEFAULT_COMPACTION_SETTINGS = { enabled: true, reserveTokens: 16384, keepRecentTokens: 20000 }`) never rewrites historical tool outputs on every turn.
  - Non-destructive edits are append-only (`ContextEditEntry` in `packages/coding-agent/src/core/session-manager.ts:175-178,520-554,1378-1409`), keeping message prefixes byte-identical across turns so provider KV caches remain valid.

### 2.2 Missing Wire-Level Cache Breakpoints & Keys
- **Anthropic History Breakpoints**:
  - `pi` (`packages/ai/src/api/anthropic-messages.ts:1493-1511,1795-1820,1936`): attaches `cache_control` to `system`, the last entry of `tools`, **and** the last `user`/`system` message in `messages`, plus supports `cacheRetention: "long"` (`ttl: "1h"`, lines 95-106).
  - `cheers` (`packages/ts-shell/src/provider/endpoints/anthropicMessages.ts:145-151,343-349`): only marks `body.system` and the last entry of `body.tools`. Conversation `messages` are never marked with `cache_control`, so growing multi-turn histories are re-prefilled and re-billed on every turn.
- **OpenAI / Responses / Codex Cache Keys & Retention**:
  - `pi` (`packages/ai/src/api/openai-completions.ts:819-823,1081-1126`, `openai-responses.ts:140,369-371`, `openai-codex-responses.ts:582`): sends `prompt_cache_key: clampOpenAIPromptCacheKey(options?.sessionId)`, `prompt_cache_retention: "24h"`, and `prompt_cache_options: { ttl: "30m" }`.
  - `cheers` (`packages/ts-shell/src/provider/endpoints/openaiCompatible.ts:35-96`, `provider/endpoints/responses/body.ts`): sends none of `prompt_cache_key`, `prompt_cache_retention`, or `prompt_cache_options`.
- **Mid-Conversation Tool & Effort Cache Preservation**:
  - `pi` (`packages/ai/src/api/anthropic-messages.ts:1461-1474,1525-1555`, `packages/agent/src/agent-loop.ts:342-384`): keeps top-level `params.tools` and `params.output_config` fixed after turn 1, injecting `tool_addition`/`tool_removal` blocks (`declareToolChanges`) and `insertThinkingLevelMessages()` with `block_binding: { prefix_mismatch_behavior: "drop_block" }` inside the message stream.
  - `cheers`: mutates top-level `body.tools` when `tool_load` runs and mutates top-level `body.thinking` when effort changes, invalidating the entire prompt cache from byte 0.
- **Cache Miss & Waste Accounting**:
  - `pi` (`packages/coding-agent/src/core/cache-stats.ts:1-174`): implements `detectCacheMiss()`, `computeCacheWaste()`, and `collectCacheMisses()` (`CACHE_TTL_MS = 5 * 60 * 1000`, `NOISE_FLOOR_TOKENS = 1024`), tracking missed tokens and wasted USD across turns. `cheers` has `turn/cacheWarm.ts` and `core/models/cacheEconomics.ts`, but no cache-miss detector or waste ledger.

---

## 3. Core Tools, Output Truncation & Schema Ergonomics

### 3.1 Contradictory 10,000-Char Global Output Guillotine
- **`cheers` Evidence**:
  - `packages/ts-shell/src/core/tools/read.ts:20,131-135`: advertises `"returns at most 50KiB"`, with default `limit: 500` lines and max `1000` lines.
  - `packages/ts-shell/src/core/tools/truncation.ts`: defines `DEFAULT_MAX_LINES = 2000`, `DEFAULT_MAX_BYTES = 50 * 1024`.
  - **Contradiction**: `packages/ts-shell/src/core/agent/tools.ts:91,274` sets `export const TOOL_OUTPUT_LIMIT = 10_000` and runs `boundText(..., TOOL_OUTPUT_LIMIT)` on every tool result in `executeToolBatch()`. Any `read`, `grep`, or `bash` output over 10,000 characters (~200–250 lines of code) is silently chopped at 10,000 chars.
- **`pi` Evidence**:
  - `packages/coding-agent/src/core/tools/truncate.ts:11-13` and `read.ts`: uniformly enforces `DEFAULT_MAX_LINES = 2000` and `DEFAULT_MAX_BYTES = 50 * 1024` (50 KiB) using a streaming line reader (`selectLinesFromStream`), and `output-accumulator.ts` streams `bash` output with a rolling buffer that spills full output to disk while keeping 50 KiB / 2000 lines in context.

### 3.2 `edit` Schema Complexity vs. Argument Normalization
- **`cheers` Evidence**:
  - `packages/ts-shell/src/edit/tool.ts:15-33`: exposes a complex `oneOf` JSON Schema combining 3 mutually exclusive modes (`content` full replacement, `edits` array, `oldText`+`newText`+`replaceAll`).
  - `packages/ts-shell/src/core/tools/editEngine.ts:90-112`: computes an $O(M \times N)$ 2D dynamic-programming matrix (`levenshteinRatio`) without length-delta pruning.
  - `packages/ts-shell/src/tools/preparation.ts:17-74`: serializes `JSON.stringify(args)` four times per `edit` call (`prepareToolCall`, `preparedWriteCandidate`, `authorizeToolCall`, `consumeToolCall`).
  - `packages/ts-shell/src/core/hooks/translation.ts:54-56`: rejects `apply_patch` (`unsupported('patch_targets')`) even though `edit/patch/plan.ts` already computes full per-file `before.content` and `file.content`.
- **`pi` Evidence**:
  - `packages/coding-agent/src/core/tools/edit.ts:18-38,98-129`: exposes a single flat schema `{ path, edits: [{ oldText, newText }] }` with `constrainedSampling: { type: "json_schema", strict: "prefer" }`. Model quirks (stringified JSON `edits`, single object instead of array, legacy top-level `oldText`/`newText`) are silently repaired in `prepareEditArguments()`.
  - `packages/coding-agent/src/core/tools/file-mutation-queue.ts` (60 lines): serializes per-file mutations via a lightweight `realpath`-keyed promise queue.

---

## 4. Tool Discovery, CodeMode & Nested Tool Execution

### 4.1 Programmatic Tool Composition (`codemode` & `NestedToolCallRunner`)
- **`pi` Evidence**:
  - `packages/codemode/src/*` and `packages/coding-agent/src/extensions/codemode/tool.ts:1-143`: provides a QuickJS/WASM sandboxed JavaScript execution tool (`codemode`). The model writes JS scripts using `await tools.<name>(args)`, `Promise.allSettled`, `store(key, value)` / `load(key)`, `searchTools()`, `describeTool()`, and `models.*` (classifiers and image generation) without exposing dozens of MCP/deferred tool JSON schemas in the prompt. Only the final filtered script output enters the model's context.
  - `packages/coding-agent/src/core/nested-tool-calls.ts:1-144` (`NestedCallRecorder`, `NESTED_CALL_LIMITS = { maxCalls: 256, maxArgumentBytesPerCall: 8192, maxArgumentBytesTotal: 32768 }`): routes nested calls through the agent's full `runToolCall` pipeline (including `beforeToolCall`/`afterToolCall` hooks and permissions), emits `tool_execution_*` events with `parentToolCallId`, and aggregates nested `Usage` onto the parent tool result.
- **`cheers` Evidence**:
  - Has **no** `codemode` package or tool, and **no** `NestedToolCallRunner`. Every tool invocation requires a full LLM round-trip, and intermediate tool outputs always land directly in the conversation history.

### 4.2 Tool Discovery Ranking & Round-Trips
- **`pi` Evidence**:
  - `packages/coding-agent/src/extensions/tool-search/tool.ts:43-226`: implements `Bm25Ranker` (Okapi BM25 with `k1 = 1.2`, `b = 0.75`, `NAME_WEIGHT = 3`, `NAMESPACE_WEIGHT = 0.5`), Unicode `Intl.Segmenter` tokenization + English plural stemming (`tokenize()`), and recursive `$ref`-resolving `schemaText()` indexing over property names and descriptions.
  - Searching via `tool_search` ranks and loads matching tools in **one step**, and uses `declareToolChanges` (`agent-loop.ts:342-384`) so prompt caches remain valid.
- **`cheers` Evidence**:
  - `packages/ts-shell/src/core/tools/discovery/state.ts:13,105-122`: pins 13 tools (`PINNED_TOOL_NAMES`) by default (`pi` pins only 4: `read`, `bash`, `edit`, `write` in `system-prompt.ts:64`), scores unpinned tools with a 4-branch `includes()` substring check (`score = name === text ? 0 : name.startsWith(text) ? 1 : name.includes(text) ? 2 : description.includes(text) ? 3 : 4`), does not index parameter schemas, requires **two LLM turns** (`tool_search` then `tool_load`), and recomputes a full SHA-256 over the entire catalog (`generation()`, lines 54-56) on every `snapshot()` and tool `verify()`.

---

## 5. Extension Runtime, Provider Routing & Ecosystem Surfaces

### 5.1 In-Process TypeScript Extensions vs. Linux-Only Shell Scripts
- **`pi` Evidence**:
  - `packages/coding-agent/src/core/extensions/loader.ts:41-130`, `runner.ts`, `virtual-modules.ts`, `types.ts`: loads TypeScript extensions in-process via `jiti` and `VIRTUAL_MODULES` (works in source, npm, and compiled single-file binaries). Extensions can register tools, slash commands, keybindings, providers, virtual models, MCP servers, TUI/HTML renderers, and subscribe to 20+ typed lifecycle events.
- **`cheers` Evidence**:
  - `packages/ts-shell/src/extensions/runtime/execute.ts:29-32`: `ExtensionService` only runs external `/bin/sh` scripts inside Linux `bubblewrap` (`if (process.platform !== 'linux') throw new Error('Isolated extension script execution currently requires Linux bubblewrap.')`), and refuses to run at all if any file deny rules are configured.

### 5.2 Virtual Models, Multi-Modal Catalogs & Remote ETag Overlays
- **`pi` Evidence**:
  - `packages/coding-agent/src/core/virtual-models.ts`: `VIRTUAL_MODEL_API = "pi-virtual"` lets extensions define router models (`route(request)` based on `user | continuation | retry | direct`) hooked into `agent-loop.ts:228-248` (`prepareRequest`).
  - `packages/coding-agent/src/core/provider-composer.ts` & `remote-catalog-provider.ts`: supports `"chat"`, `"image"`, and `"classifier"` model types and fetches live `pi.dev` catalog shards every 4 hours with ETag (`if-none-match`) caching.
- **`cheers` Evidence**:
  - Supports only static chat models; lacks `prepareRequest` per-step model routing, `image`/`classifier` model registries, and ETag-revalidated remote catalog overlays.

### 5.3 Next-Gen Durable & Distributed Object Runtime (`pi-durable` & `chord`)
- **`pi` Evidence**:
  - `packages/durable/src/*`: complete transactional conversation/task/document runtime (`Harness`, `Scheduler`, `TaskGraph`, `LiveDoc`, `InboxDoc`, `ToolTask`, `CompactionTask`, `GenerationTask`) with pluggable storage backends (`sqlite`, `indexeddb`, `jsonl`, `memory`) and conformance suites (`storage-conformance.ts`).
  - `packages/chord/src/*`: cross-process reactive object runtime (`createHost`, `defineFacet`, `remote`, `ipcLink`, `webSocketLink`, `store`, `delta/tracker.ts`, `react/`, `tui/`, `web/`) powering multi-surface apps (`apps/p2`, `apps/p2-mac`).
  - `packages/coding-agent/src/modes/rpc/rpc-mode.ts` & `core/export-html/index.ts` & `core/output-guard.ts`: full bidirectional JSONL RPC server/client with stdout takeover guard (`takeOverStdout()`) and standalone HTML session export.
- **`cheers` Evidence**:
  - Single monolithic package (`packages/ts-shell`) containing 175+ files in `src/browser/`, 38 in `src/planning/`, 28 in `src/collaboration/`, 15 in `src/advisor/`, 12 in `src/media/`, and 9 in `src/desktop/`, with 65+ ad-hoc verification scripts in `package.json:24-110`. Lacks bidirectional RPC mode, stdout protocol guard, and HTML session export.
