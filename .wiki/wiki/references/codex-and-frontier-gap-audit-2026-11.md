# Cheers 深度对比审计：Codex、OMP、Claude Code Mode 与 DeepSeek Harness（2026-11-23）

> **审计基线**：Cheers `f65ba979`、Codex `4210c08def`、`oh-my-pi`（OMP）`e1a9f4b41d`、DeepSeek Harness `2e39e70496`、`deepseek-ai/dsh-superagent-prototype` `8c32a9dc`（MIT 公开伴随原型仓库）、NormProof `ea50541`、Claude Code 官方 `Code Mode` 文档（`https://code.claude.com/docs/en/code-mode.md`，2026-11-23 实测 HTTP 200 读取完整正文）。
>
> **资料来源透明度说明**：
> - 微信链接 `https://mp.weixin.qq.com/s/zoS7GlReWPhfCjENGxXCdg` 触发微信反爬验证（`wappoc_appmsgcaptcha`），未绕过。
> - 英文版 X/Twitter 链接 `https://x.com/DeepSeekHarness/status/2116857257245987236` 经官方 oEmbed（HTTP 200）与单次普通 GET 仅返回 SPA 壳与标题（`Exploring Super-agent Design: Towards a More Autonomous Agent System`，2026-11-01），不包含 X Article 正文，亦未绕过登录或反爬。
> - 通过公开检索确认该文配套开源了 MIT 协议官方原型仓库 `https://github.com/deepseek-ai/dsh-superagent-prototype`（`8c32a9dc`，定位为架在 `deepseek-harness` 之上的 Super-agent 原型包，明确标注相对文章删去了部分未来方向），本审计通过公开 GitHub 原文直读其 `README.md`、`docs/000-philosophy.md`、`docs/001-domain.md`、`docs/003-execution.md`、`docs/007-architecture.md`，并与本机只读底座仓库 `~/projects/deepseek-harness`（`2e39e70496`）一并对照。

---

## 1. `/model` 近万模型膨胀与 `models.json` 无法选中根因审计（对照 Codex）

### 1.1 实测现场（脱敏）

本机 `~/.cheers/` 配置状态如下：
- `~/.cheers/models-cache.json`：**8.03 MB**（`https://models.dev/api.json` 全量缓存），含 **236 个提供商 / 9,135 个模型**（`nano-gpt` 617、`kilo` 468、`llmgateway-providers` 467、`vercel` 419、`edenai` 396、`openrouter` 378 等，其中 224 个完全未配置）。
- `~/.cheers/models.json`：仅配置 **4 个提供商 / 9 个模型**（全部为 `runtime: "openai-compatible"`）：`openai-compatible`（BaiLu，4 个）、`workbuddy`（1 个）、`nofx`（2 个）、`apikey-casa`（2 个）。
- `~/.cheers/auth.json`：4 条 `providerConnections`，由于 `RUNTIME_PROVIDERS`（`packages/ts-shell/src/config/runtimeConfig.ts:48-64`）只允许 10 个固定 ID，4 条连接全部挂在 `provider: "openai-compatible"` 下，仅靠 `id` 与 `baseUrl` 区分；当前活跃连接为 `openai-compatible-apikey-casa`。

### 1.2 根因一：为何 `/model` 出现 9,197 个模型

1. **全量公共目录无过滤写入与合并**：`refreshCatalog()`（`packages/ts-shell/src/core/models/catalogRefresh.ts:88-147,176-232`）将 `models.dev/api.json` 全部写入 `models-cache.json`；`loadCatalogSnapshot()`（`packages/ts-shell/src/core/models/catalogStore.ts:58-70`）通过 `mergeProviders()`（`packages/ts-shell/src/core/models/catalog.ts:639-683`）无条件合并内置 + 缓存 + 用户模型，得到 **252 个提供商 / 9,179 个模型**。
2. **`modelPicker` 默认实例化全部未配置模型且默认停在 `All models`**：
   - `modelPicker.load()`（`packages/ts-shell/src/cli/interactive/picker/model.ts:136-197`）遍历 `catalog` 中的全部 252 个提供商，对 248 个未配置提供商仍逐一生成 `disabled: true, focusable: true, note: 'configure a connection'` 行，共产生 **9,193 条物理行 + 4 条角色行 = 9,197 行**。
   - `CatalogNavigation`（`packages/ts-shell/src/cli/interactive/picker/navigation.ts:41,70-75`）默认 `category = 'all'`，打开即显示 9,197 行，侧栏列出 252 个提供商，键入搜索也默认扫全量 9,197 行。
   - 同样无范围过滤的还有：非交互 `/model`（`packages/ts-shell/src/core/commands/modelCommandRuntime.ts:115-125`、`packages/ts-shell/src/core/models/catalogSurface.ts:29-43`）、`--list-models`（`packages/ts-shell/src/entrypoints/cliListModels.ts:21-65`）与 `/model use ` 补全（`packages/ts-shell/src/cli/interactive/completion/catalog.ts:53-64`、`packages/ts-shell/src/cli/interactive/completion/models.ts:15-20`）。

### 1.3 根因二：为何 `~/.cheers/models.json` 里已配好的模型无法选中或被串线（4 处缺陷叠加）

| 缺陷编号 | 位置 | 具体表现与成因 |
|---|---|---|
| **MOD-1** | `packages/ts-shell/src/core/commands/model/selection.ts:94-155` | `/model use workbuddy/global:deepseek-v4.1-flash` 或 `/model use nofx/gpt-6.1-terra` 找到 `namedProvider` 后**从不切换对应的 `providerConnection`**，而是用当前活跃连接（`openai-compatible-apikey-casa`）校验，在 `selection.ts:153-155` 直接硬阻断：`Model switch blocked: the workbuddy alias does not match the configured endpoint.`。更危险的是 `/model use openai-compatible/bailu-2.8` 因 `id === runtime` 绕过拦截，**静默把 `bailu-2.8` 写到 `apikey-casa` 连接上**。 |
| **MOD-2** | `packages/ts-shell/src/core/models/availability.ts:112-121`、`packages/ts-shell/src/core/commands/modelCommandRuntime.ts:453-457` | `matchesCatalog()` 第 114 行无条件写死 `if (provider.id === provider.runtime) return true;`，忽略了 BaiLu（`"openai-compatible"`）声明的 `baseUrl`，导致 `bailu-*` 4 个模型被错误交叉绑定到全部 4 个连接上（多出 12 条错绑行）；同时 `/model list openai-compatible` 因把活跃连接的 `baseUrl`（`apikey.casa`）传入 `catalogProvider()`，反而**完全隐藏了 `bailu-*`**。 |
| **MOD-3** | `packages/ts-shell/src/cli/interactive/picker/model.ts:131-132,175-197` | `modelPicker` 拿**上一个模型的 `thinkingEffort`** 校验所有候选模型。由于 `workbuddy`/`nofx`/`apikey-casa` 在 `models.json` 声明 `medium: null / minimal: null / xhigh: null`，只要当前会话 effort 落在这些档位，`effortCapability()`（`packages/ts-shell/src/core/models/capability.ts:5-21`）返回 `'unsupported'`，导致 `modelPicker` 把这 3 个提供商下的**全部模型直接标为 `disabled: true`**，按 `Enter` 只能看详情无法切换。 |
| **MOD-4** | `packages/ts-shell/src/cli/bootstrap/cliBootstrapContext.ts:192`、`packages/ts-shell/src/cli/bootstrap/model.ts:19-44`、`packages/ts-shell/src/core/commands/model/target.ts:52-64` | 使用 `--model` 启动 Cheers 后，`options.model` 对物理模型不会被清除，导致交互中 `exactTargetMatches()` 对所有其他模型均判为 `disabled: true (request target mismatch)`。 |

### 1.4 Codex 对照（`4210c08def`）

- **按已配置 Provider 隔离的 `ModelsManager`**（`codex-rs/model-provider/src/provider.rs:270-328,444-512`）：绝不注入跨厂商全局公共目录；内置 `models.json` 仅 10 个模型，且靠 `visibility: "list" | "hide"` + `filter_by_auth`（`codex-rs/models-manager/src/manager.rs:126-138`、`codex-rs/protocol/src/openai_models.rs:873,913-932`）只展示精选可用模型，隐藏模型仍可经 `-m` 或 `config.toml` 指定。
- **两段式选择（先模型、后适配 effort）**（`codex-rs/tui/src/chatwidget/model_popups.rs:15-39,421-588`）：绝不因上一个模型的 effort 不兼容而把候选模型置灰锁死；选中模型后再打开按该模型 `supported_reasoning_efforts` 裁剪的 effort 子菜单。
- **异步就地刷新**（`5fc7840cf6`，`codex-rs/tui/src/chatwidget/model_popup_state.rs:22-67`）：打开选择器先秒开缓存列表，后台 `FetchModels` 完成后凭 `request_id` 校验就地更新并保留高亮光标。

---

## 2. Prompt Caching 与上下文前缀稳定性深度审计（对照 Codex）

### 2.1 核心架构对比矩阵

| 维度 | Codex (`4210c08def`) | Cheers (`f65ba979`) | 差距定性 |
|---|---|---|---|
| **Cache Key 与粘性路由** | HTTP / WS / Compaction 全链路无条件发 `prompt_cache_key`（`codex-api/src/common.rs:61,293,318,348`、`core/src/client.rs:540-552`）；统一附带 `session-id`、`thread-id`、`x-client-request-id`、`x-codex-routing-hint` 及每轮捕获重放的 `x-codex-turn-state`（`client.rs:328,1245-1268`） | `promptCacheFields`（`packages/ts-shell/src/provider/cache/protocol.ts:14-27`）仅对 `https://api.openai.com/v1` 发送 `prompt_cache_key`；**ChatGPT 账户（`openai-account-responses`）、Azure 与代理全部不发 `prompt_cache_key`**，且 `accountBody` 主动删除 `prompt_cache_retention`（`packages/ts-shell/src/provider/endpoints/responses/account.ts:10-16`）；无 `x-codex-turn-state` / `thread-id` | **严重缺失** |
| **每轮动态上下文注入** | 首次将初始环境上下文写入 `history[0..]` 后永不改动（`session/mod.rs:3748-3979,4114-4130`）；每轮/每步通过 `WorldState` diff 只向历史**尾部**追加增量片段（`session/mod.rs:4103-4177`、`session/turn.rs:368-370`） | **`openingMessage`（`packages/ts-shell/src/turn/opening.ts:18-26`）在发请求时把 `[Environment Context: ...]` 拼到用户首条消息前，但 `turn/session.ts:289` 刻意不持久化 `opening`**；第 2 轮起 `historyMessages[0]` 变回无包装的原始 prompt，而第 2 轮的新 prompt 末尾才带包装——**每轮用户对话都直接改写 `messages[0]`，100% 击穿跨轮对话缓存** | **P0 致命缺陷** |
| **动态工具发现与 Schema 稳定** | 顶层 `tools` 全程不可变；`tool_search`（`tool_search.rs:224-226`、`tests/suite/search_tool.rs:768-829`）仅在对话历史的 tool output 中返回 `LoadableToolSpec`，绝不改写顶层 `tools`；Schema 用 `BTreeMap` 保证键序确定 | 默认 `toolDiscovery: 'dynamic'`（`packages/ts-shell/src/config/runtimeConfig.ts:447`）。`tool_load` 会把新工具插入到 `meta` 之前（`packages/ts-shell/src/core/tools/discovery/state.ts:105-113`），**直接改写顶层 `body.tools`**；Anthropic 侧虽写了内联 `tool_addition` 保缓存代码（`packages/ts-shell/src/provider/endpoints/anthropicCachePreservation.ts:10-46`），但因 `BUILTIN_PROVIDERS` 中 **0 个模型**声明 `supportsMidConvoToolChanges: true` 沦为死代码；且 `cliRuntimeInvocation.ts:350` 每轮重置已加载工具 | **P0 致命缺陷** |
| **WebSocket 增量链与启动预热** | `ModelClientSession` 持久化 WS，用 `get_incremental_items` + `previous_response_id` 仅发送增量尾部（`client.rs:1336-1374,1828-1875`）；会话启动即发 `generate: false` 预热 `instructions` + `tools`（`session_startup_prewarm.rs:186-259`） | `codexWs.ts` 默认关闭（需 `CHEERS_CODEX_TRANSPORT=websocket\|auto`），开启后仍每步重发全量 `input`（`codexWs.ts:181`、`store: false`），无 `previous_response_id` 增量切片、无启动预热 | **显著代差** |
| **收尾步（`maxSteps`）工具处理** | 绝不在尾部删除顶层 `tools` | `turn/request.ts:149` + `turn/context/prepare.ts:168` 在 `stepCount >= maxSteps` 时把 `wireTools` 清空为 `[]`，在**上下文最长的一步**主动拆掉全部 `tools` 前缀，而不是保留相同 `tools` + 传 `tool_choice: "none"` | **P0 高耗废** |
| **历史微压缩 / 截断** | 工具输出在入库时一次性截断（`context_manager/history.rs:201-212`），已入历史的消息永不原地改写 | `turn/messages.ts:38-42` 每步调用 `microcompactMessages`（`packages/ts-shell/src/core/query/microCompact.ts:68-161`），随 3 轮滑动窗口推进不断**原地改写**旧工具消息（移除旧图或裁剪文本），持续破坏历史前缀 | **P1 破坏缓存** |
| **压缩（Compaction）缓存复用** | 远程 `/responses/compact` 与 Compaction v2（`compact_remote_v2_attempt.rs:77-112`）复用完全相同的 `instructions`、`tools`、`input` 与 `prompt_cache_key`，直接在尾部追加触发项命中主会话 KV 缓存 | `core/query/compaction/summarize.ts:158-199` 用 `SimpleRequest`（`tools: []`、换掉主 `systemPrompt`）且把 `<previous-summary>` **前置**到 `history` 之前，压缩请求自身完全吃不到主会话缓存，也未接 `/responses/compact` | **P1 浪费缓存** |
| **Cache Warming 与 Miss 告警** | 启动 `generate: false` 预热 + `/status` 实时展示 `(X cached)`（`tui/src/status/thread_usage.rs:143-147`） | 默认开启 `cacheWarming: "streaming"`，但因 `BUILTIN_PROVIDERS` 中 **0 个内置模型声明 `cost`**，`cacheEconomics.ts:122` 与 `turnCacheMissNotice`（`observability/cacheWaste.ts:199`）**开箱完全静默失效**；且 `responses/index.ts:16` 写着非法 `max_output_tokens: 1`（API 最小值为 16），`account.ts`/`azureResponses.ts` 缺 `refreshBody`，Anthropic 思考回合全被跳过；TUI 状态栏无缓存命中率项 | **P1 空转与暗坑** |
| **多厂商覆盖（Bedrock / System）** | 专注 OpenAI Responses 生态 | Anthropic 已做 3 断点（`system`、`tools`、末条 `user`），但 Bedrock Converse（`bedrockConverse.ts:67-123`）**零 `cachePoint`**；`turn/prompt.ts:67-122` 在 `systemPrompt` 字节 0 拼入动态 `toolNames` | **P1–P2 缺口** |

### 2.2 Cheers 十大 Prompt Caching 缺陷优先级汇总

1. **[P0]** `turn/opening.ts:18-26` + `turn/session.ts:289`：非持久化 `openingMessage` 导致每轮对话改写 `messages[0]`，全提供商跨轮对话缓存失效。
2. **[P0]** `core/tools/discovery/state.ts:105-113` + `core/models/catalog.ts:251-554` + `cliRuntimeInvocation.ts:350`：默认动态工具加载中场改写 `body.tools` 且跨轮重置，Anthropic 内联保缓存开关未在内置目录启用。
3. **[P0]** `provider/cache/protocol.ts:14-27` + `responses/account.ts:10-16` + `responses/codexWs.ts:181`：`openai-account-responses` / Azure / 代理缺 `prompt_cache_key`、缺 `x-codex-turn-state`、WS 缺增量 `previous_response_id` 与启动预热。
4. **[P0]** `turn/context/prepare.ts:168`：收尾步（`allowTools: false`）清空 `wireTools = []` 而非保留 `tools` + `tool_choice: "none"`。
5. **[P1]** `core/models/catalog.ts` + `responses/index.ts:16` + `turn/cacheWarm.ts:175-188`：内置模型零 `cost` 导致 `cacheWarming` 与 `turnCacheMissNotice` 开箱失效，且 `max_output_tokens: 1` 低于接口下限。
6. **[P1]** `core/query/microCompact.ts:68-161`：滑动窗口每步原地改写旧工具消息，持续击穿前缀。
7. **[P1]** `core/query/compaction/summarize.ts:158-199`：摘要请求剥离 `systemPrompt`/`tools` 且前置 `<previous-summary>`，未复用主会话前缀，亦无 `/responses/compact`。
8. **[P1]** `provider/endpoints/bedrockConverse.ts:67-123`：缺 Bedrock `cachePoint` 检查点。
9. **[P2]** `turn/prompt.ts:67-122`：`systemPrompt` 头部混入动态 `toolNames` 与条件工具规则。
10. **[P2]** `presentation/tui/chrome/items.ts:16-95`：状态栏缺少实时缓存命中率指示器。

---

## 3. Cheers `codemode` 对照 Claude Code `Code Mode` 深度审计

已完整对照 `https://code.claude.com/docs/en/code-mode.md`（361 行）与 `packages/ts-shell/src/core/tools/codemode/` 全套源码。

### 3.1 Cheers 已有优势（强于/互补于 Claude Code）
- **更强的宿主侧 JS 隔离**：`Worker`（`env: {}`, `execArgv: []`, 64MB 堆上限, 最多 4 并发）+ 锁定 `node:vm`（禁 `eval`/`wasm`、冻结原型、5s 同步 CPU 超时、20ms 停顿检测）。
- **正常运行时不绕过 NormProof**：通过 `adaptTools` / `runTurn` 执行时，`turn/tools.ts:162-177` 注入 `createGatedNestedToolExecutor`（`turn/nestedTools.ts:24-110`），每次 `await tools.<name>()` 都会以**真实工具名**（`write`/`edit`/`apply_patch`/`bash`/`mcp__*`）走完 `planModeBlock` → `askPermission` → `HookDispatcher`（触发 NormProof `write-gate`）→ `PostToolUse`。
- **内置可复现与分支持久状态**：提供 BM25 `searchTools()`、TS 声明级 `describeTool()`、分支级持久 `store()`/`load()` 与加密 `record`/`replay_id`。

### 3.2 暴露出的关键差距与 P0/P1 安全缺陷

| 优先级 | 问题 | 源码位置 | 对照 Claude Code `Code Mode` |
|---|---|---|---|
| **P0** | **无门控直接回退漏洞**：通过公开导出直接执行 `createCoreToolRegistry().get('codemode')`（未传 `executeNestedTool`）时，仅拦截 `apply_patch`，却直接执行 `write`/`edit`/`bash`/`mcp`，**绕过 NormProof `write-gate` 与权限系统** | `packages/ts-shell/src/core/tools/codemode/nestedCalls.ts:160-189` | 必须 fail-closed（像 `apply_patch` 与 `models.generateImages` 一样强制要求宿主门控执行器） |
| **P0** | **内部权限拒绝对脚本无效**：在内部工具审批框选 `No`（无备注）或按 `Esc`，仅让内部 JS Promise reject；脚本写 `try { await tools.bash(...) } catch {}` 或 `Promise.allSettled` 就能**继续执行后续工具调用**，且外层回合仍可能报 `completed` | `packages/ts-shell/src/cli/interactive/overlay.ts:654-663,747-753`、`packages/ts-shell/src/turn/nestedTools.ts:81-83,152-155`、`packages/ts-shell/src/turn/projection.ts:244-277` | Claude Code 明确区分：**无备注 `No` / `Esc` 立即终止整段脚本**（已完成改动保留）；仅**带备注的 `No`** 拒绝单次调用并让脚本继续适应 |
| **P0** | **外层审批盲批且允许通配 `Allow always`**：`codemode` 审批弹窗不展示任何代码预览，却保留 `Allow always`，一次同意即写入永久通配授权 `"codemode:execute:exact:codemode"`；同时在 `plan` 模式下连只读探索脚本也被一刀切禁止 | `packages/ts-shell/src/core/query/toolPolicy.ts:49-53,180-183`、`packages/ts-shell/src/core/shell/approval/store.ts:58-59`、`packages/ts-shell/src/cli/interactive/picker/approval.ts:124` | 需禁用通配 `Allow always` 或提供代码预览，且允许在受控规则下由内部工具逐个鉴权 |
| **P1** | **TUI 完全看不到内部工具 diff 与折叠代码**：`turn/nestedTools.ts` 不发内部 `tool.started`/`tool.result` 事件，`approval.requested` 因无卡片被 `toolCards.ts:54-56` 丢弃；`metadata.nestedCalls` 虽入库却**从未渲染**，超过 400 字符的 `code` 被 `firstString()` 吞掉，按 `Ctrl+O` 也看不到完整代码和内部编辑 diff | `packages/ts-shell/src/cli/interactive/toolCards.ts:37-56,198-227`、`packages/ts-shell/src/presentation/tui/transcript/blocks.ts`、`packages/ts-shell/src/cli/interactive/history.ts` | 对话流直接展示内部工具 diff（隐藏冗长 JS），按 `Ctrl+O` 在记录视图展开折叠的 **Code** 行 |
| **P1** | **脚本超时不暂停等待审批**：默认 30s（上限 120s）计时器在等待用户审批弹窗期间继续走表，用户多看 30 秒 diff 就会直接杀掉脚本 | `packages/ts-shell/src/core/tools/codemode/options.ts:1-2`、`packages/ts-shell/src/core/tools/codemode/execution.ts:100` | 前台 10 分钟上限，且**严格扣除等待用户审批的时间** |
| **P1** | **缺少 `PostToolUse` 脱敏覆写（`updatedToolOutput`）与 `toolsUsed` 载荷**：`HookDispatcher` 不支持在 `PostToolUse`（含报错时）脱敏 `codemode` 返回值，扩展 `tool_result` 也因 `canReplace()` 拒绝非只读/含元数据/报错结果而无法脱敏密钥 | `packages/ts-shell/src/core/hooks/hookDispatcher.ts:426-457`、`packages/ts-shell/src/turn/result.ts:25-33` | `PostToolUse` 匹配 `REPL` 可读取 `{ code, result, stdout, stderr, toolsUsed }` 并经 `updatedToolOutput` 脱敏（含 block/error 路径） |
| **P2** | 缺少便捷 `` $`cmd` `` shell 模板包装（`.text()`/`.nothrow()`）与长脚本后台化（升格 `/jobs`） | `packages/ts-shell/src/core/tools/codemode/prelude.ts` | Claude Code 提供 `$` 模板与自动模式下最长 2 小时后台化（`/tasks` 管控） |

---

## 4. Codex 整体体验对照与 DeepSeek Harness Super-Agent 研究

### 4.1 除 `/model` 与缓存外，Codex 明显领先 Cheers 的 6 项体验

1. **默认关闭的 OS 沙箱与缺失网络策略代理**：Cheers `osSandbox.ts:16-252` 默认关闭、缺 Windows 隔离、无 HTTP/SOCKS5 MITM 网络策略代理；Codex 默认沙箱优先 + 透明升级重试 + `codex-network-proxy`（域名/私网 IP/HTTP 方法/凭据头控制）。
2. **斜杠命令过载与缺乏上下文剪枝**：Cheers 平铺展示 ~74+ 个顶层命令及次级调用（`packages/ts-shell/src/core/commands/registry.ts`、`slashSuggestions.ts`），仅隐藏 `/mcp`；Codex 按使用频率排序并按 OS/特性/运行态/子会话裁剪 59 个命令（`slash_command.rs`、`command_popup.rs`）。
3. **输入框打断 / 排队 / 撤回操控摩擦力**：Codex 原生支持 `Enter`=中途引导（steer）、`Tab`=显式排队（queue）、`Esc`=打断并发送、`Alt+Up`=把队尾消息弹回输入框编辑；Cheers 缺少 `Tab` 排队与 `Alt+Up` 弹回，需输入 `/queue edit|move|cancel`。
4. **Shell PTY 连续交互与 Patch 语法**：Codex 用 `exec_command` + `write_stdin` 统一前台/后台/交互 PTY，用自由文本 CFG 语法做 `apply_patch`；Cheers 将 `bash` 拆成 `runInBackground` + `taskOutput/taskWait/taskStop` 且模型无法向运行中 PTY 写 stdin。
5. **回合谱系失效保护与自主后台记忆整合**：Codex（`4210c08def`）在异步注入或目标变更时原子标记 `root_turn_id` 歧义，并有两阶段后台记忆整合子代理；Cheers 缺异步注入谱系失效机制，记忆抽取依赖人工/压缩点触发。
6. **首次启动向导与工具默认体验**：Cheers 无首次启动 `/connect` 交互向导、`/theme` 不直达预览面板、`lsp` 缺少本地语言服务器自动探测、并排 Diff 长行截断（`packages/ts-shell/src/presentation/tui/transcript/diff.ts:345-346`），且默认仅固定 6 个核心工具（`apply_patch`/`task`/`ask`/`todo` 均需额外搜索加载）。

### 4.2 DeepSeek Harness（`2e39e70496`）与 Super-Agent 原型（`dsh-superagent-prototype` `8c32a9dc`）值得吸收 vs 应拒绝的设计

两者层次明确区分：`~/projects/deepseek-harness` 是底层 Cordis Agent 运行时，`deepseek-ai/dsh-superagent-prototype` 是文章《Exploring Super-agent Design》对应的上层 Super-agent 调度原型（`Source -> Trigger -> Thread -> Eval -> Ticket -> Assignment -> Executor -> Outbox`）。

- **高性价比吸收（5 项轻量高回报设计）**：
  1. **防死循环与防卡死双守卫（`deepseek-harness`）**：参考 `packages/guard/repeat-tool-reminder/src/index.ts:180-231`（对工具参数做深度键排序规范化，**连同被拒调用一并计数**，在连续重复 `[3, 5, 8]` 次时注入渐进提醒，遇到真实用户输入重置）+ `packages/util/timeout/src/index.ts:124-173` 可重装流式 `idleWatchdog`（仅在等待 SSE chunk 时计时，每收到 chunk 重置，避免假死又不误杀健康长任务）。
  2. **注意力成本最小化原则（`dsh-superagent-prototype` `docs/000-philosophy.md`）**：核心信条为 *“Take as little human attention as possible, and give as much value as possible”*——**健康状态不占屏幕空间**（面板只展示真正需要人介入的项，对应 `waitsForPerson` 谓词）、**少概念少开关**（能用提示词表达的行为绝不做成配置项）、按影响而非按工作量停手、一次只问一个具体问题。这与 Cheers 的 MUI 原则直接呼应，也是裁剪 Cheers 74+ 斜杠命令与精简 `/jobs`/`/director` 面板的直接依据。
  3. **5 秒命令自动转后台 + 预留人类优先并发槽（`docs/003-execution.md`）**：Worker 预设将前台耗时超过 **5 秒** 的 shell 命令自动转入后台作业（标准子代理为 60 秒），确保每一步都能即时响应新消息不卡死；并发池除 Worker 槽位外额外**预留 +1 个人类优先槽位**，保证排队中的后台任务永远不会饿死用户的实时对话或状态查询；收尾后后台 shell 设 30 分钟硬上限。对 Cheers 的 `/jobs`、`codemode` 后台化与 `/director` 调度极具借鉴价值。
  4. **零 LLM 事件差值过滤与角色收窄事务引擎（`deepseek-harness` + `docs/001-domain.md`、`docs/007-architecture.md`）**：在监听/调度前加纯代码差值过滤与突发合并；若后续重构 `/director` 与 `/jobs`，可参考其单事务同步 `Engine` + 提交后执行的 `Outbox`、按调用方收窄的 `Pick` 视图接口，以及 `waitsForPerson` / `followupOwners` / `handback` 显式接力边界（Worker 处理职责内追问，越界则显式交还 Router）。
  5. **`PtcInspectableValue` 双视角返回（`deepseek-harness`）**：参考 `docs/subsystems/ptc-runtime.md:184-203`，让 `codemode` 链式变量传递保留无损 JSON，直接输出给模型审阅时只展示精简摘要，降低上下文膨胀。
- **对比优势与坚决不引入（避免过度工程化）**：
  - **隔离边界上 Cheers 更强**：`dsh-superagent-prototype` 的 `docs/003-execution.md` 坦诚说明其 Worker 直接以当前 OS 用户无沙箱运行，命令名包装器（command-name shims）只是默认习惯而非安全边界；Cheers 现有的 `bwrap`/`sandbox-exec` OS 沙箱 + NormProof 确定性写前/停机门控在这方面基础扎实得多，应持续巩固而非弱化。
  - **不引入**：不重写为 Cordis 全插件微内核；在修好 `/model`、缓存、沙箱与日常交互前，不建设常驻 GitHub/Feishu 团队级 Super-agent 守护进程与 Web 管理面板；不用原生 V8 绑定重写 `codemode`（违背 `AGENTS.md` TypeScript 控制面原则）。

---

## 5. 配置文件格式审计与选型（Cheers vs OMP vs Codex）

用户痛点非常真实：**纯 JSON 嵌套括号（`{}` / `[]`）与引号手工维护极易失配**，尤其在频繁手工编辑的多中继 `models.json`、`sandbox.json`、`hooks.json` 与 `config.json` 中体验很差。下面结合 `oh-my-pi`（`e1a9f4b41d`）与 `codex`（`4210c08def`）的源码实现做三方对照并给出明确选型。

### 5.1 三方配置体系对比矩阵

| 维度 | Codex (`4210c08def`) | OMP (`e1a9f4b41d`) | Cheers 现状 (`f65ba979`) |
|---|---|---|---|
| **人类编辑主格式** | **TOML**：`config.toml`、`<profile>.config.toml`、`requirements.toml`、`environments.toml`、`agents/*.toml` | **YAML**（2026-01 从 JSON → SQLite 后**反转回 YAML**）：`config.yml`、`models.yml`、`keybindings.yml`、`WATCHDOG.yml`、`secrets.yml` | **混杂 JSON / JSONC**：`config.json` / `mcp.json` 已接 `jsonc-parser`（支持注释与尾逗号）；但 `models.json`、`hooks.json`、`sandbox.json`、`keybindings.json`、`themes/*.json`、`.agents/workflows/*.json` 仍是**裸 `JSON.parse`** |
| **生态互操作文件** | `hooks.json` 保留 JSON 兼容（同步支持 `config.toml` `[hooks]`）；插件 `.mcp.json` 保留 JSON | `mcp.json`、`ssh.json`、`themes/*.json` **刻意保留 JSON**（方便直接复制 Claude Code/Cursor/MCP 片段及 `$schema` 补全） | `mcp.json`（JSONC）、`.agents/hooks.json`（严格 JSON，承载 NormProof 门控） |
| **机器状态 / 凭据 / 缓存** | **JSON / JSONL / SQLite**：`auth.json` (`0o600`)、`models_cache.json`、`rollout-*.jsonl`、`state_5.sqlite` | **SQLite (WAL) + JSONL**：`agent.db`（凭据/租约/MRU）、`models.db`、`history.db`、`sessions/*.jsonl`；刻意把 `last-changelog-version` 挪出 `config.yml` 避免污染用户配置 | **JSON / JSONL**：`auth.json` (`0o600`)、`models-cache.json`、`current-session.json`、`sessions/*/transcript.jsonl`、`trust.json`、`hook-trust.json`、`approval-policy.json` |
| **解析与写回引擎** | Rust `toml` + **`toml_edit::DocumentMut`**（保留注释、缩进与装饰，原子写 + 保软链） | **Bun 内置** `Bun.YAML` / `Bun.JSONC` / `bun:sqlite` + 原生 Rust 插件 `FileLock`；**注意：写回 `config.yml` 直接 `YAML.stringify`，会清空用户手写注释！** | `jsonc-parser` `3.3.1`（`config/patch.ts` 局部补丁**可保留注释** + 文件锁 + 3-way 合并 + 原子写）；仓库内**零 YAML / 零 TOML 依赖** |
| **错误诊断与防护** | 1-based `path:line:col` + `^^^^` 下划线高亮；未信任仓库禁用项目配置 + `PROJECT_LOCAL_CONFIG_DENYLIST` 剥离敏感键 | 启动损坏隔离为 `.broken-*` 并报错、热重载保持上次有效值；`grantAuthority()` 防止仓库配置放宽权限 | `config.json` 有行/列错误；但 **`sandbox.json`（`sandbox/osSandbox.ts:94-110`）静默吞掉解析异常**；`models.json`（`core/models/catalogStore.ts:78-96`）、`approval-policy.json`、`crashes.json` 仍用非原子 `fs.writeFileSync` |

### 5.2 关键取舍：为什么对 Cheers 而言「YAML 1.2 + CST 保注释」优于 TOML 与裸 `Bun.YAML`

1. **为什么不直接停留在 JSONC**：JSONC 虽然已解决注释与尾逗号，但**完全没有解决用户最痛的 `{}` / `[]` 嵌套括号与引号匹配问题**。
2. **为什么 Cheers 不选 Codex 的 TOML**：
   - **数据结构不匹配**：Codex 的 `config.toml` 里 `[model_providers.*]` 只有几行扁平字段，复杂模型目录仍放在 `models_cache.json`；而 Cheers 的 `models` 配置是**多层嵌套数组对象**（`providers -> workbuddy -> models[] -> { id, cost.tiers[], compat, thinkingLevelMap }`），写成 TOML 会退化成晦涩的 `[[providers.workbuddy.models]]` + `[providers.workbuddy.models.thinkingLevelMap]` 头链，极易写错归属；
   - **JS/TS 生态缺 Rust `toml_edit` 同级库**：Cheers 必须同时兼容 **Node `>=20.3.0`（`dist/cli.js` / `vitest`）+ `esbuild` + `bun build --compile` 单文件可执行**，禁止依赖 `Bun.TOML` 或 `.node`/`.wasm` 运行时文件。纯 JS TOML 库（如 `smol-toml`）只有 parse/stringify，写回 `config` 会**倒退丢失注释**（反而比 Cheers 现有的 `config/patch.ts` 退步）。
3. **为什么不照搬 OMP 的 `Bun.YAML` 与 `agent.db`（SQLite + 原生锁）**：
   - `Bun.YAML` / `bun:sqlite` 绑定死 Bun 运行时，直接破坏 Cheers 的 Node `>=20.3.0` 基线（`npm run check:node-floor`）与 `vitest` 测试；
   - OMP 用 `Bun.YAML.stringify` 写回会**清掉用户注释**且踩中尾随空格坑，还被迫为 `WATCHDOG.yml` 手写序列化器；
   - 引入 SQLite + 原生 Rust `FileLock`（OMP 为规避 Linux POSIX `fcntl` 锁坑不得不写原生插件）违背 Cheers `AGENTS.md` 纯 TypeScript 控制面约束。

### 5.3 Cheers 最终推荐选型：**融合方案（OMP 的 YAML 表面 + Codex 的边界/诊断 + `eemeli/yaml` CST 保注释）**

采用纯 JS 零原生依赖的 **`yaml`（`eemeli/yaml` v2，默认 YAML 1.2 Core Schema）**：完全兼容 Node `>=20.3.0`、`esbuild` 与 `bun build --compile`；默认 YAML 1.2 消除 `yes`/`no`/`on`/`off` 误转布尔的经典坑；且自带 **`parseDocument()` CST 文档级修改（`doc.setIn` / `doc.deleteIn`）**，程序化写回 `config.yaml` 时可**像 Codex `toml_edit` 一样完整保留用户注释、空行与键序**，同时提供精准 `linePos` 行列诊断。

| 文件分类 | 覆盖文件 | 目标格式与兼容策略 |
|---|---|---|
| **人类编辑配置（主力迁 YAML）** | `config.yaml`（`~/.cheers/` 与 `.cheers/`）、`models.yaml`、`sandbox.yaml`、`keybindings.yaml`、`.agents/workflows/*.yaml` | **规范格式改为 `.yaml`**（读取优先级 `.yaml` > `.yml` > 旧 `.json`/`.jsonc` 无损回退）；`config.yaml` 写回走 `yaml` CST `parseDocument()` 保注释 + 软链解析 + 原子写；提供**显式可选**命令 `cheers config migrate` 转换旧 `.json`（保留 `.json.bak`，绝不静默删旧文件）；对 YAML 常见误区（如 `path: ~` 被解析为 `null`、空值键 `key:`）给出清晰告警 |
| **生态互操作配置（保持 JSONC）** | `mcp.json`、`.agents/hooks.json` / `~/.cheers/hooks.json`、`themes/*.json` | **保持 `.json` 规范路径**以保留与 Claude Code / Cursor / MCP 文档及 NormProof `.agents/hooks.json` 的直接互通；将 `hooks.json` 与 `themes/*.json` 从裸 `JSON.parse` 升级为现有 `jsonc-parser`（立即可写注释与尾逗号，后续可按需允许读取 `hooks.yaml`） |
| **机器状态 / 凭据 / 缓存（坚守 JSON / JSONL）** | `auth.json` (`0o600`)、`models-cache.json`、`current-session.json`、`sessions/*/transcript.jsonl`、`trust.json`、`hook-trust.json`、`approval-policy.json`、`crashes.json`、`mcp-auth/*.json`、`refresh-leases.json` | **绝不迁 YAML，亦不迁 SQLite**；顺手把 `catalogStore.ts`、`approvalTrustPolicy.ts`、`crashLog.ts` 3 处非原子 `fs.writeFileSync` 统一换用现有 `writeTextFileAtomic` |

> **安全与诊断补齐（同步吸收 Codex + OMP）**：修掉 `sandbox/osSandbox.ts:94-110` 静默吞错改为结构化行列报错；为项目级 `.cheers/config.yaml` 补齐类 Codex `PROJECT_LOCAL_CONFIG_DENYLIST` / OMP `grantAuthority()` 校验，禁止仓库级配置覆盖提供商端点或放宽权限；静态门禁 `check:config-consumers` / `check:declarations` 均只解析 TS 接口，与磁盘文件格式完全解耦，零门禁冲突。

---

## 6. Cheers 存量运维健康与差异化定位补充

- **已定位的 2 处真实小缺陷与债务**：
  1. `SessionManager.renameSession`（`packages/ts-shell/src/session/SessionManager.ts:202-209`）未走事务提交且无锁读改写，RPC `set_session_name`（`packages/ts-shell/src/cli/rpc/host/session.ts:49-53`）不检 `busy()`；
  2. `packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts:349` 与 `packages/ts-shell/src/cli/provider/media.ts:35-85` 将 `generate_image` 与 `classify` 做成互斥且硬锁当前会话单一提供商；
  3. `/home/wang/projects/cheers/.tmp/` 积压 **1.9 GB**（43 个过期验证目录）；根目录缺 `README.md`、`LICENSE` 与 `.github/workflows/release.yml`；`interactiveMode.ts`（1,739 行）与 `overlay.ts`（987 行）仍是核心 TUI 维护瓶颈。
- **核心护城河确认**：Cheers 相对 Codex / Claude Code 的独特优势在于 **NormProof 确定性架构守卫（写前门控 + 停机冷裁决 + 受管 `AGENTS.md`）+ 多中继模型路由 + 0.2s 单文件二进制**。当前 NormProof（已升级至 `ea50541` MIT 版）仍只锁死在 Cheers 自仓，后续将其原生开放给任意外部工作区（`/arch` 或 `/init` 联动）是最高辨识度的差异化抓手。

> 对应分批执行排期见 [cheers-next-phase-roadmap-2026-11.md](cheers-next-phase-roadmap-2026-11.md)。
