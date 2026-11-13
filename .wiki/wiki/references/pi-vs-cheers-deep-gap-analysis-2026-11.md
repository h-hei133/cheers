---
title: "Pi vs. Cheers 深度架构与实现差距审计（2026-11-13）"
category: reference
sources: [raw/notes/2026-11-13-pi-vs-cheers-strict-audit.md]
created: 2026-11-13
updated: 2026-11-13
tags: [references, pi, gap-analysis, prompt-caching, tools, compaction, codemode, durable, chord]
summary: "对照 Pi 最新演进（截至 2026-11-13）对 Cheers 进行的严格源码审计：揭示 Cheers 在 Prompt Cache 命中率、工具截断、微压缩冲突、CodeMode、扩展运行时与模块化架构上的 8 大核心差距及优先级改造路线。"
confidence: high
---

# Pi vs. Cheers 深度架构与实现差距审计（2026-11-13）

本文基于 `/home/wang/projects/pi`（含截至 2026-11-13 的最新 `ai`、`agent`、`coding-agent`、`codemode`、`durable`、`chord` 演进）与 `/home/wang/projects/cheers/packages/ts-shell/src` 的直接源码比对，不保留地列出 `cheers` 当前存在的**硬伤、性能/Token 损耗点与代际差距**。

---

## 一、核心指标与量化对比总表

| 维度 | `pi` (`/home/wang/projects/pi`) | `cheers` (`packages/ts-shell/src`) | 差距定性 |
| :--- | :--- | :--- | :--- |
| **每轮旧工具输出处理** | 保持历史消息字节完全不变；仅在超窗口时做 Token 预算压缩 (`compaction.ts:126`) | 每轮 `outgoingProjection` 调 `microcompactMessages(keepRecentTurns: 3, maxOutputChars: 1000)` (`turn/messages.ts:8`) | **致命缺陷**：第 4 轮起每轮改写历史前缀，直接打碎 Prompt Cache |
| **Anthropic 历史消息缓存** | 标记 `system`、末个 `tool` **以及末条 `user`/`system` 消息** (`anthropic-messages.ts:1795`)，支持 `1h` 长效 TTL | 仅标记 `body.system` 和末个 `body.tools` (`anthropicMessages.ts:145-151`)，**对话历史零标记** | **严重损耗**：多轮对话历史每轮全量重算重计费 |
| **OpenAI / Responses 缓存** | 发送 `prompt_cache_key`、`prompt_cache_retention: "24h"`、`prompt_cache_options: { ttl: "30m" }` | `openaiCompatible.ts` 与 `responses/body.ts` **完全未发**上述缓存字段 | **严重缺失**：放弃了兼容端点的会话级前缀亲和与长驻缓存 |
| **中途加载工具/切思考档位** | `declareToolChanges` 发送 `tool_addition`/`tool_removal` 消息块；`insertThinkingLevelMessages` 发送内联档位标记 | 直接修改顶层 `body.tools` 或 `body.thinking` (`anthropicMessages.ts:148,182`) | **架构代差**：`cheers` 一旦动态加载工具或调 effort，整段历史缓存全部失效 |
| **缓存未命中与浪费核算** | `core/cache-stats.ts` 逐轮计算 `missedTokens` 与美元浪费 `missedCost` 并在 TUI 告警 | 仅有 `cacheWarm.ts`，**无逐轮缓存未命中检测与浪费账本** | **可观测盲区**：缓存被破坏后用户与开发者完全无感知 |
| **默认挂载工具数** | **4 个** (`read`, `bash`, `edit`, `write` in `system-prompt.ts:64`) | **13 个** (`PINNED_TOOL_NAMES` in `discovery/state.ts:13`) | **冷启动臃肿**：每轮多背负 9 个工具 JSON Schema |
| **全局工具输出上限** | 统一 **2000 行 / 50 KiB** (`truncate.ts:11-12`) | `read.ts:20` 宣称 50 KiB，但 `core/agent/tools.ts:91,274` 硬设 `TOOL_OUTPUT_LIMIT = 10_000` 字符 | **自相矛盾**：所有超 1 万字符输出被腰斩，迫使模型多发 4~5 倍 `read` 请求 |
| **`edit` 工具 Schema** | 单一扁平 `{ path, edits: [{ oldText, newText }] }` + `prepareEditArguments` 自动容错修复 (`edit.ts:98`) | 三选一 `oneOf`（`content` / `edits` / `oldText+newText`）+ $O(M \times N)$ DP 矩阵 + 4 次 `JSON.stringify` 校验 | **高摩擦**：`oneOf` 易触发严格 Schema 报错，且引导模型走全量覆盖 |
| **编程式工具组合 (`codemode`)** | `@earendil-works/pi-codemode` QuickJS 沙箱 + `NestedToolCallRunner` (`nested-tool-calls.ts`) | **完全缺失** | **代际差距**：`pi` 可用一段 JS 批量/链式调工具并过滤结果，零中间上下文污染 |
| **工具检索 (`tool_search`)** | Okapi BM25 (`Bm25Ranker`) + Unicode 分词/词干提取 + 递归 `$ref` Schema 索引，**单步检索即激活** | 4 分支 `includes()` 朴素匹配 (`discovery/state.ts:114`)，不索引参数 Schema，需 **`search`+`load` 两轮往返** | **检索弱且费轮次** |
| **扩展系统 (`extensions`)** | `jiti` + `VIRTUAL_MODULES` 进程内加载 TS 扩展，可注册 Provider/虚拟模型/工具/命令/UI 渲染器与 20+ 钩子 | 仅支持在 Linux `bubblewrap` 下跑 `/bin/sh` 外部脚本 (`extensions/runtime/execute.ts:29`) | **严重受限**：非 Linux 直接抛错，无法扩展核心运行时 |
| **仓库与包模块化** | 12+ 独立 workspace 包（含新一代 `pi-durable` 事务运行时与 `chord` 跨进程响应式对象框架） | 单一巨石包 `packages/ts-shell`（含 175+ 文件的 `browser/` 及 `planning/`、`collaboration/` 等） | **架构失衡**：核心底座被重型外围实验模块淹没 |

---

## 二、八大核心差距与源码证据深挖

### 差距 1：Prompt Cache 自毁机制（`microCompact` 每轮篡改历史前缀 + 缺少会话消息断点）

这是 `cheers` 目前在真实长任务上**最烧钱、也最拖慢首字延迟（TTFT）**的根源性 bug：

1. **`outgoingProjection` 每轮滑动截断旧工具输出**：
   - 在 `packages/ts-shell/src/turn/messages.ts:6-10` 中，每次发请求前都会调用：
     `microcompactMessages(converted, { keepRecentTurns: 3, maxOutputChars: 1000, pruneToolText })`。
   - 在 `packages/ts-shell/src/core/query/microCompact.ts:86-95` 中，`boundaryIndex` 是从消息末尾倒数 `keepRecentTurns * 2`（即最近 3 轮）动态计算的。
   - **后果**：第 1 轮读入的文件在第 1、2、3 轮是完整原文；到了第 4 轮，`boundaryIndex` 向后滑动，第 1 轮的 `tool` 消息被就地改写成了 `head(500) + [... Omitted ...] + tail(500)`；到了第 5 轮，第 2 轮的 `tool` 消息又被改写。**从第 4 轮开始的每一轮请求，历史消息前缀的字节都在变化**，大模型服务端的 Prefix KV Cache 从被截断的那一轮开始全部失效，同时模型因看不见中间代码被迫反复重读同一文件。
   - 反观 `pi`：彻底不搞按轮次滑动的 `microcompact`，历史消息一旦落盘永远逐字节不变（哪怕用户用 `ContextEditEntry` 编辑上下文也是 append-only 记录，见 `session-manager.ts:520-554`），仅在接近上下文窗口上限时才触发一次 `compaction.ts` 摘要。
2. **Anthropic / OpenAI 协议层缓存标记残缺**：
   - `packages/ts-shell/src/provider/endpoints/anthropicMessages.ts:145-151` 只给 `body.system` 和 `body.tools` 最后一个元素加了 `cache_control: { type: "ephemeral" }`，**完全没有给 `body.messages` 里的最新用户/系统消息加 `cache_control`**（对比 `pi/packages/ai/src/api/anthropic-messages.ts:1795-1820`）。这意味着在 Anthropic 端点上，哪怕前缀不变，不断增长的对话历史也完全没有进入缓存！
   - `packages/ts-shell/src/provider/endpoints/openaiCompatible.ts` 与 `responses/body.ts` 完全没有发送 `prompt_cache_key`、`prompt_cache_retention: "24h"` 或 `prompt_cache_options: { ttl: "30m" }`（对比 `pi/packages/ai/src/api/openai-completions.ts:819-823` 与 `openai-responses.ts:140,369-371`）。

### 差距 2：`TOOL_OUTPUT_LIMIT = 10_000` 腰斩陷阱与 `read` 分页碎化

- **源码冲突证据**：
  - `packages/ts-shell/src/core/tools/read.ts:20` 的工具描述明确告诉模型：`"returns at most 50KiB"`，且 `packages/ts-shell/src/core/tools/truncation.ts` 定义了 `DEFAULT_MAX_BYTES = 50 * 1024`。
  - 然而在 `packages/ts-shell/src/core/agent/tools.ts:91,274` 中，`executeToolBatch()` 在所有工具返回后又套了一道硬闸门：
    `export const TOOL_OUTPUT_LIMIT = 10_000;`
    `const text = boundText(messageToText(message.content), TOOL_OUTPUT_LIMIT, message.metadata?.outputNotice);`
- **后果**：加上 `read.ts:135` 默认只读 `500` 行（带行号与锚点前缀后约 200~250 行就满 10,000 字符），模型读一个 800 行的普通源码文件在 `pi`（`DEFAULT_MAX_LINES = 2000`, `DEFAULT_MAX_BYTES = 50 * 1024`，见 `pi/packages/coding-agent/src/core/tools/truncate.ts:11-12`）只需 **1 次工具调用**，而在 `cheers` 中会被静默截断在 10,000 字符，需要 **3~4 次连续分页调用**，直接把轮次和延迟放大数倍。

### 差距 3：`edit` Schema 过度复杂、准备期四重序列化与 `apply_patch` 门控断路

1. **Schema 复杂度对比**：
   - `pi`（`packages/coding-agent/src/core/tools/edit.ts:18-38,98-129`）只向模型暴露唯一一种最干净的结构：`{ path, edits: [{ oldText, newText }] }`，开启 `constrainedSampling: { type: "json_schema", strict: "prefer" }`；如果模型（如 Opus 或 GLM）犯错传了 JSON 字符串、单个对象或顶层 `oldText`/`newText`，在 `prepareEditArguments()` 内部静默归一化修好，绝不报错打回让模型重发。
   - `cheers`（`packages/ts-shell/src/edit/tool.ts:15-33`）把 `content`（全文覆盖）、`edits`（数组）、`oldText+newText+replaceAll`（单次替换）塞进一个带 `oneOf` 互斥约束的复杂 Schema，既占 Token，又容易在开启 strict schema 的网关上报错，还变相诱导模型直接往 `edit.content` 里吐整文件代码。
2. **准备期与匹配算法开销**：
   - `packages/ts-shell/src/tools/preparation.ts:20,24,52,60,72` 在单次 `edit` 生命周期的 `prepare`、`bind`、`authorize`、`consume` 四个节点对参数对象做了 **4 次全量 `JSON.stringify` 字符串比对**。
   - `packages/ts-shell/src/core/tools/editEngine.ts:90-112` 在宽松匹配回退时直接跑无剪枝的 $O(M \times N)$ 二维数组 Levenshtein DP。
3. **`apply_patch` 与 `write-gate` 断联**：
   - `packages/ts-shell/src/core/hooks/translation.ts:54-55` 对 `apply_patch` 直接返回 `unsupported('patch_targets')`，而实际上 `packages/ts-shell/src/edit/patch/plan.ts:28` 已经算出了每个目标文件的完整 `before` 与新 `content`。

### 差距 4：缺少 `codemode`（沙箱编程式工具编排）与 `NestedToolCallRunner`

- **`pi` 的代际能力**：
  - `pi` 拥有独立的 `@earendil-works/pi-codemode` 包（QuickJS WASM/VM 沙箱）与 `packages/coding-agent/src/extensions/codemode/tool.ts` + `core/nested-tool-calls.ts`。
  - 当面对多步探测、批量文件查询或数十个 MCP 工具时，模型只需调用一次 `codemode` 传入一段 async JS 代码（如用 `Promise.allSettled` 调 10 次搜索/读取并在 JS 里过滤出关键 5 行返回）。所有嵌套调用通过 `NestedToolCallRunner` 走完整的权限与 Hook 管线，但**中间几十 KB 的原始工具输出完全不进大模型上下文**，且一次模型请求就能完成原本需要 5~8 轮的串行交互。
- **`cheers` 现状**：完全没有 `codemode` 和 `NestedToolCallRunner`，所有工具组合必须靠大模型一轮一轮肉身往返，所有中间废料全部塞进 `messages` 历史。

### 差距 5：工具发现（Tool Discovery）算法简陋且破坏缓存

- **`pi`（`extensions/tool-search/tool.ts:43-226` + `agent-loop.ts:342-384`）**：
  - 默认只暴露 4 个核心工具（`read`, `bash`, `edit`, `write`），其余工具走 `codemode` 或 `deferred`；
  - 检索采用 **Okapi BM25 (`Bm25Ranker`)**，支持 `Intl.Segmenter` 分词、英文词干提取（`issues -> issue`）、递归解析 JSON Schema `$ref` 索引所有参数名与描述；
  - **单步加载 + 缓存保活**：调用一次 `tool_search` 同时完成匹配与激活，且通过 `declareToolChanges` 向消息流插入 `toolsAdded` 增量块，不改顶层 `body.tools`，保持 Prompt Cache 不断裂。
- **`cheers`（`core/tools/discovery/state.ts:13,54-56,105-135`）**：
  - 默认固定暴露 **13 个工具**（`PINNED_TOOL_NAMES`），且 `turn/prompt.ts:98-102` 不管工具是否启用都硬编码全套工具规则说明；
  - 搜索仅靠 4 个三元运算符做 `includes()` 子串匹配（不看参数 Schema、无分词无词干，搜多词短语若非连续子串直接 0 分漏召回）；
  - 必须先调 `tool_search` 再多花一轮调 `tool_load`（两步往返），且每次 `snapshot()` 和每次工具执行 `verify()` 都要对整个 catalog 跑一遍 `JSON.stringify` + `sha256`（`generation()`）；一旦 `tool_load` 成功，直接改写顶层 `body.tools` 击穿缓存。

### 差距 6：Agent Loop 钩子粒度、虚拟模型路由与输出守卫（Output Guard）

- **`pi`（`packages/agent/src/agent-loop.ts:194-325`, `core/virtual-models.ts`, `core/output-guard.ts`）**：
  - 将单轮生命周期精细拆为 `prepareNextTurn`（重操作如压缩）→ `prepareRequest`（按步动态模型/思考档位路由，支撑 `VIRTUAL_MODEL_API = "pi-virtual"`，根据 `user | continuation | retry` 动态切大小模型）→ `finishTurn`（显式决定 `end` 或 `continue`）；
  - 提供 `core/output-guard.ts`（`takeOverStdout()`），在 RPC 和 Print 模式下接管 `process.stdout.write`，把任何第三方库或工具意外打印的日志重定向到 `stderr`，并对真实协议帧做 `EAGAIN`/`ENOBUFS` 退避队列。
- **`cheers`（`core/agent/loop.ts`, `turn/step.ts`）**：
  - 重试逻辑分裂在 `loop.ts:retryStep` 和 `turn/step.ts` 两层（靠 `retriesExhausted` 标志协调）；
  - 无 `prepareRequest` 钩子与虚拟模型路由（`virtual-models`），也无 `image`/`classifier` 多类型模型目录与远程 ETag 增量更新目录（`remote-catalog-provider.ts`）；
  - 无 `output-guard.ts` 保护，也没有双向 JSONL RPC 模式（`modes/rpc/rpc-mode.ts`）和独立 HTML 会话导出（`core/export-html/`）。

### 差距 7：扩展运行时（In-Process TS 扩展 vs. Linux-Only Shell 脚本）

- **`pi`（`core/extensions/loader.ts`, `runner.ts`, `virtual-modules.ts`）**：
  - 通过 `jiti` + `VIRTUAL_MODULES` 在进程内直接加载 TypeScript 扩展（源码、npm 全局安装和单文件编译二进制下均可用），扩展拥有完整的 `ExtensionAPI`：可注册工具、命令、快捷键、Provider、虚拟模型、MCP Server、TUI/HTML 自定义渲染器，并拦截 20+ 个类型化生命周期事件（包括 `before_provider_request`、`cache_warming_decision` 等）。
- **`cheers`（`extensions/runtime/execute.ts:29-32`）**：
  - 所谓扩展系统只是在 `bubblewrap` 里跑 `/bin/sh` 脚本；第 29 行硬编码 `if (process.platform !== 'linux') throw new Error('Isolated extension script execution currently requires Linux bubblewrap.')`，在 macOS/Windows 上直接不可用，且一旦配了任何文件 deny 规则就直接拒绝运行。

### 差距 8：仓库架构解耦 vs. 单包巨石膨胀（`pi-durable` / `chord` vs. `ts-shell`）

- **`pi` 的演进方向**：
  - 严格拆分为职责单一的 workspace 包：`pi-ai`（多端协议与缓存）、`pi-agent-core`（极简循环）、`pi-tui`（差分终端渲染，含 1 MiB `BoundedTerminalWriter` 分块写与 Kitty 解码内存配额）、`pi-codemode`、`pi-mcp`、`pi-coding-agent`；
  - 更进一步，近期 `pi` 已经孵化出 **`@earendil-works/pi-durable`**（全事务性会话/任务图/文档运行时，支持 SQLite/IndexedDB/JSONL 与完备的 `storage-conformance.ts` 测试集）和 **`@earendil-works/chord`**（跨进程响应式对象、RPC Link、Delta Tracker 与 TUI/Web/React 多端状态同步底座，支撑 `apps/p2` 与 `apps/p2-mac`）。
- **`cheers` 的结构困境**：
  - 所有代码全部堆在唯一的 `packages/ts-shell/src` 下：不仅核心 `session/`、`turn/`、`context/` 碎片化严重，还捆绑了 **175+ 个文件的 `browser/`**、**38 个文件的 `planning/`**、**28 个文件的 `collaboration/`**、**15 个文件的 `advisor/`**、**12 个文件的 `media/`**、**9 个文件的 `desktop/`**；
  - 根 `package.json` 堆砌了 **65+ 条临时校验脚本**，大量工程精力被消耗在维护外围半成品模块的静态门禁与证据回执上，反而让最核心的 **Prompt Cache、Read/Edit 工具链、上下文保鲜** 处于明显劣势。

---

## 三、Cheers 对标 Pi 的优先级改造路线图

### P0（立竿见影降本提速，改动小、收益极大）
1. **废除每轮滑动改写历史的 `microcompactMessages`**：
   - 在 `packages/ts-shell/src/turn/messages.ts:8` 默认关闭逐轮滑动截断（或改为仅在写入时固定截断超长输出、绝不在后续轮次追溯改写已发送过的 `tool` 消息），彻底恢复多轮对话的前缀不可变性。
2. **补齐 Anthropic 与 OpenAI/Responses 协议层缓存标记**：
   - 在 `anthropicMessages.ts` 中为最后一条 `user`/`system` 消息补上 `cache_control`（并支持 `1h` 长效 TTL）；
   - 在 `openaiCompatible.ts` 与 `responses/body.ts` 中注入基于 `sessionId` 的 `prompt_cache_key` 与 `prompt_cache_retention`；
   - 移植 `pi` 的 `core/cache-stats.ts`，在每次请求后核算 `missedTokens` 与 `missedCost`。
3. **解除 `TOOL_OUTPUT_LIMIT = 10_000` 隐形腰斩**：
   - 将 `packages/ts-shell/src/core/agent/tools.ts:91` 的 `TOOL_OUTPUT_LIMIT` 提升至与 `truncation.ts` / `read.ts` 一致的 **50 KiB（51,200 字节）**，并将 `read.ts` 默认行数从 `500` 提至 `2000`，立刻减少 70%+ 的重复分页 `read` 调用。
4. **简化 `edit` Schema 并打通 `apply_patch` 写前门控**：
   - 对齐 `pi/packages/coding-agent/src/core/tools/edit.ts`，将 `edit` Schema 收敛为单一 `{ path, edits: [{ oldText, newText }] }` + `prepareEditArguments()` 静默容错归一化，去掉 4 次重复 `JSON.stringify`；
   - 为 `editEngine.ts` 的 `levenshteinRatio` 增加长度差剪枝；
   - 在 `core/hooks/translation.ts` 中消费 `edit/patch/plan.ts` 已算好的单文件候选内容，让 `apply_patch` 也能通过 `write-gate`。

### P1（核心能力对齐，消除轮次浪费）
5. **重构工具发现（Tool Discovery）与默认挂载集**：
   - 将默认固定工具从 13 个精简到核心编程集（`read`, `edit`, `write`, `bash`, `grep`, `glob`），动态生成的 `SystemPrompt` 仅包含当前已激活工具的规则（对齐 `pi` 的 `buildRules`）；
   - 将 `discovery/state.ts` 的 4 分支 `includes()` 替换为 `pi` 的 `Bm25Ranker`（含参数 Schema 索引与词干提取），并将 `tool_search` + `tool_load` 合并为单步检索激活 + 消息内增量工具声明（不改顶层 `body.tools`）。
6. **引入 `output-guard.ts` 与标准双向 JSONL RPC 模式**：
   - 保护非交互/协议模式下的 `stdout` 纯净性，提供可被外部 IDE/评测器直接驱动的轻量 RPC 接口。

### P2（架构演进与去臃肿）
7. **引入沙箱 `codemode` 与 `NestedToolCallRunner`**：
   - 允许模型通过单次脚本调用编排多个只读/搜索/MCP 工具并过滤输出，把多步探测压缩为 1 个 Turn。
8. **拆分 `packages/ts-shell` 巨石包 & 升级进程内 TS 扩展加载**：
   - 将 `browser`、`desktop`、`media`、`collaboration` 等重型外围模块从核心 `ts-shell` 剥离为可选独立包或插件；
   - 借鉴 `pi` 的 `jiti` + `VIRTUAL_MODULES` 机制支持跨平台进程内 TypeScript 扩展，摆脱 `bubblewrap` + `/bin/sh` 的 Linux 限制。

---

## See Also

- [[local-reference-repositories|Local Reference Repositories]] ([Local Reference Repositories](local-reference-repositories.md))
- [[top-tier-coding-agent-gap-analysis|Top-Tier Coding Agent Architecture Gap Analysis & Evolution Blueprint]] ([Gap Analysis](../concepts/top-tier-coding-agent-gap-analysis.md))
- [[turn-lifecycle-alignment|Turn 生命周期架构对齐与演进方案]] ([Turn Lifecycle Alignment](../../articles/turn-lifecycle-alignment.md))

## Sources

- [Pi vs. Cheers Strict Architectural & Implementation Audit (2026-11-13)](../../raw/notes/2026-11-13-pi-vs-cheers-strict-audit.md) — Direct comparative inspection of `/home/wang/projects/pi` and `/home/wang/projects/cheers`
