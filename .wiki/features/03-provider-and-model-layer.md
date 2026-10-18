---
title: "功能对照 03：Provider 与模型层（我们 vs pi）"
category: article
sources: [pi-source-2026-09-20, repo-audit-2026-09-20]
created: 2026-09-20
updated: 2026-09-23
tags: [features, gap-analysis, pi, provider, models, config, oauth]
summary: "[部分已过时，见文首横幅] 对照 pi 的 provider/模型层：订阅登录、模型目录、per-model 覆盖、兼容性开关、传输与缓存。发现一处硬缺陷：getRuntimeConfig 返回字面量时漏掉全部可选字段，用户配置里的 contextWindow/reserveTokens/thinkingLevel/temperature 等静默失效；另有模型目录不支持 per-model 覆盖、兼容性标志只描述不生效。覆盖清单 7 项 DEFICIENT、4 项 MISSING、1 项 OURS-ONLY。"
confidence: high
---

# 功能对照 03：Provider 与模型层

> **⚠️ 本文是 2026-09-20 的调研快照，其中部分结论已过时。**
> 已过时的结论在**原位**加了 ✅ 标注（保留原文作为当时的证据）；**未标注的行仍按原文有效**。

> 本轮为**功能开发前锋探索**，零代码改动。对照本地参考仓 `pi`（`/home/wang/projects/pi`）。
> 分类口径：`DEFICIENT`＝我们有但更弱／不完整／未接线；`MISSING`＝pi 有我们没有；
> `OURS-ONLY`＝我们有 pi 没有（**仅记录，本轮不提议开发**）。

## 0. 方法与范围

| 侧 | 读到的位置 |
|---|---|
| pi | `docs/{providers.md, models.md, settings.md, custom-provider.md}`、`src/core/{model-config.ts, model-registry.ts, model-resolver.ts, model-runtime.ts, models-store.ts, settings-manager.ts, cache-warmer.ts, cache-stats.ts, http-dispatcher.ts, provider-composer.ts, runtime-credentials.ts, auth-storage.ts, auth-guidance.ts}`、`src/cli/{auth-command.ts, list-models.ts, config-selector.ts}` |
| 我们 | `config/{runtimeConfig.ts, types.ts, settingsLoader.ts, schema.ts}`、`core/models/{catalog.ts, catalogStore.ts, catalogRefresh.ts, catalogSurface.ts}`、`provider/registry/provider.ts`、`provider/request/fetch.ts`、`core/shell/{providerCredentials.ts, providerReadiness.ts}`、`core/auth/{oauth/*, providerAuthContract.ts, providerAuthRuntime.ts}`、`core/commands/{connectCommandRuntime.ts, modelCommandRuntime.ts, connect/preset.ts, thinkingCommandRuntime.ts}` |

**决定性验证（本轮唯一一次实机执行，用于确认一处硬缺陷）**：

```bash
# 写入一个用户 config.json，含 contextWindow: 200000 等字段，然后读回
npx tsx /tmp/probe.mts
# 输出：
#   returned keys: provider,daemonEnabled,maxTurns,disabledTools,hiddenToolPrefixes,
#                  enableMcpTools,activeProviderConnectionId,providerConnections,
#                  providerCredentials,configSources
#   contextWindow: undefined      autoCompactPercent: undefined
#   reserveTokens: undefined      thinkingLevel: undefined
#   temperature: undefined        maxOutputTokens: undefined
#   tuiMode: undefined            promptCacheTtl: undefined
#                  theme: undefined
```

## 1. 覆盖清单

| 能力 | pi 位置 | 我们位置 | 判定 | 证据 |
|---|---|---|---|---|
| 用户配置文件字段真正生效 | `docs/settings.md:20-60`；`src/core/settings-manager.ts` | `config/runtimeConfig.ts:193-215` | **已收口**（**2026-09-24 更正**） | **原判定列写 DEFICIENT，与行首「已全部收口」自相矛盾**。**用仓库自己的门禁核实**：`npm run check:config-consumers` → `fields=35 read=35 declared_without_reader=0`，即**每个声明字段都有生产读取者**，这正是该行要求的。见 §2.1 |
| 订阅式 OAuth 登录 | `docs/providers.md:15-63`（7 家：Codex／Claude Pro／Copilot／xAI／Meta／OpenRouter／Radius） | `provider/request/authorization.ts`；`core/auth/oauth/providers.ts:23,59`（2 家）；`core/auth/providerAuthRuntime.ts`（`persistRenewedAccountAuth`） | **部分收口**（**2026-09-24 更正**，Phase 7 T1；**2026-09-25 Phase 10 T6 结构性收敛**；**2026-09-25 复核后补齐（见 §15.5bis～15.5quinquies）**） | **原判定是「补功能」，实际是「接线」**：登录/解析/预检**四段全在且有测试**（`providerCredentials.test.ts:121`、`providerReadiness.test.ts:222`、`connectCommandRuntime.test.ts:363`），但**请求路径只读 `apiKey`**，而 account-auth 凭据**没有该字段** → 发**空 `Bearer `**。已修：认证按 `authMode` 分支、账号 id 走 `chatgpt-account-id`、过期前刷新并**回写**（复用既有 `refreshOAuthTokens`，不自建）。**余量**：支持 2 家（`pi` 7 家）；**端到端真实端点验证未做**（需真实订阅账号）。见 §2.1（已同步更正） **2026-09-25 Phase 10 T6**：逐家硬编码从 **7 个文件 54 个分支点**收敛为**一张 provider 声明表**（`core/providers/facts.ts`），降到 **30 个**——环境变量名、显示标签、是否需用户自填端点、账号凭据槽位、默认模型与允许模型集，各一处声明。施工中发现并修掉一个**真实缺陷**：原标签函数对未列举的 provider 兜底返回 `"OpenAI"`，于是 Anthropic 的失败提示会把它说成 OpenAI——指错服务，也指错该去查的账号与密钥。**余量不变**：家数仍是 2，真实端点验证仍缺（无订阅账号）。收敛的是结构，不是家数。 |
| 模型目录（内置快照 + 用户叠加 + 刷新） | `src/core/{model-registry.ts, models-store.ts, remote-catalog-provider.ts}` | `core/models/{catalog.ts, catalogStore.ts, catalogRefresh.ts}` | ✅ **已收口**（**2026-09-23 更正**） | 三层叠加已实现：`catalogStore.ts:47` `loadCatalog` = builtin → cache → user；`catalogRefresh.ts:7` 注释「**Explicit, never automatic**」（刷新是显式动作，不联网启动）。见 §2.3（已同步更正） |
| per-model 覆盖（`modelOverrides`） ✅ **判定更正 2026-09-23**：`dedupeModels` 本就是 last-write-wins，**一直生效**；真正的限制只是 `CatalogModel` 字段太少，`cost`（4 个费率，可选）已补 | `docs/models.md:354-420` | `core/models/catalog.ts` | ~~MISSING~~ **判定有误** | 见 `phase-4-execution.md` §4.2 |
| 兼容性开关真正改变请求形状 | `docs/models.md:420-520`（`compat.supportsDeveloperRole` 等） | `core/models/requestShape.ts`（Phase 5 新增） | ✅ **已收口**（**2026-09-23 更正**） | Phase 5 实现四项**改变线上字节**的决定（`requestShape.ts:106-110`）：system 角色名、输出上限字段名、是否发 `reasoning_effort`、是否需合成 assistant 桥接；复核轮补齐**内置目录的 `compat`**。其余 7 个标志**刻意保持描述性**。见 §2.4（已同步更正） |
| 自定义 provider（声明式 API 适配） | `docs/custom-provider.md`（786 行）；`src/core/provider-composer.ts` | `core/models/catalogStore.ts`（用户文件加 provider）+ `CatalogModel.compat` | **部分收口**（**2026-09-25 Phase 10 T5**：协议已是自注册模块，仍未新增协议）| 用户可用 `models.json` 加 provider 与模型，`compat` 表达请求形状差异，`CatalogProvider.endpoint` 声明端点种类。**2026-09-25 Phase 10 T5**：协议判定从 5 个文件的 `if` 收敛为**自注册注册表**（`provider/endpoints/index.ts` + `kinds.ts`）；每种协议是一个**自己声明**的模块。**⚠ 复核更正**：T5 提交时宣称「加第三种**不改编任何调用方**」，**当时是假的**——主回合 payload 仍在 `step.ts` 按协议名分支，桩协议测试**只覆盖了简单请求路径**，而 catalog 的 `endpoint` 还是闭联盟（第三种协议**无法被命名**）。**复核轮已补足**（`EndpointShape.turnBody` + 三处类型放宽），现在**确实成立**，并由**测试文件里声明的协议走真实 step 函数**证伪过（反向验证：恢复旧分支 → 用例失败）。见 `phase-10-decisions.md` §15.2。**余量**：协议种类仍是 2（默认兼容形 + Anthropic Messages），其余（Responses／Bedrock／Vertex）仍无——但**表达方式已通用**。|
| Prompt cache 保活（warming） | `src/core/cache-warmer.ts`；`docs/settings.md:66-100` | 无 | **已收口**（**2026-09-25 施工**）| 判定改为算术而非启发式：`expectedSavings = 继续概率 × 未命中代价 − 刷新代价`，阈值 $0.05（`core/models/cacheEconomics.ts`）。运行侧 `turn/cacheWarm.ts` 按窗口 90% 排程、越过窗口即放弃、按阶段计时（运行中 60 分钟 / 等待中 30 分钟上限）。**照 `pi` 的公式，不照抄代码**。**关键前置已补**：刷新前先补上 `catalogRefresh` 丢弃的 `cost`（实测索引 1306 个模型中 1244 个有价格），否则经济学恒不可用、永远不刷新；`CatalogModel.promptCache` 声明窗口（Anthropic 300/3600，OpenAI 600/86400）。**开关**：`cacheWarming: off/streaming/idle`，默认 `streaming`（运行中刷新，等待中不刷新——那是拿用户的钱打赌）。**刷新重放发出去的请求**（`provider/request/sentRequest.ts`）而非从会话历史重建：重建出的前缀缺系统指令与微压缩，到 provider 是**未命中按全价计费**，与保活目的相反；判据是「前缀按字节相同」。只降输出上限到 1。**跨运行**：新一轮开始前 `stop()` 上一轮，否则上一轮的空闲计时器会刷新同一前缀、同一笔钱花两遍。**未经询问的请求**：受 `offline` 开关约束（更新检查与保活都走 `allowsSelfInitiatedRequests`）。见 §3.2 |
| Cache 命中/未命中统计 | `src/core/cache-stats.ts`（`CacheMiss{missedTokens,missedCost,idleMs,modelChanged}`） | 部分：`observability/usageTelemetry.ts:34-35` | **部分收口**（**2026-09-23 更正**） | 我方**记录 provider 报的缓存绝对值**（`cacheReadTokens`/`cacheWriteTokens`），`/cost` 展示。**余量登记在 `06-observability-config-and-lifecycle.md`**（该缺口是报告面而非 provider 面，避免两处描述同一事实）。**2026-09-25 更新**：B2 已补上该余量的两个前置——`promptCache` TTL 声明与 `cost` 费率投影——只差请求时间戳。见 §3.3 |
| 传输选择（SSE／WebSocket） | `docs/settings.md`（`transport`） | 无 | **维持不做**（**2026-09-25 复核维持**）| WebSocket 特化于某一家网关的 Responses 形态，我方无该接入，做了零消费者。**2026-09-25 复核维持**：新增的第二个端点走同一套 SSE 读取，没有产生传输层的第二个需求。见 §3.4 |
| HTTP 空闲超时可配 | `src/core/http-dispatcher.ts`（默认 300000，五档可选，`disabled` 可关） | ✅ **已收口**（**2026-09-24**，Phase 6 T1）：`provider/request/fetch.ts` 接进活轨 + 3 个配置字段 | ~~DEFICIENT~~ **已收口** | **修复前**：`createProviderFetchFromEnv` 的唯一调用者是启动预检（`core/shell/providerReadiness.ts:149`），活轨 `turn/step.ts:134` 用**裸 `fetch`**——挂起的连接让回合无限等待，**且重试救不了**（只在收到响应后分类）。**修复**：`createProviderStep` 与压缩路径都传 `fetchImpl`；三个字段默认 30s/120s/120s。**实机对照**：全局 `fetch` 4s 仍在等待，provider fetch 2.5s 抛出。见 `phase-6-execution.md` §1 |
| Per-model thinking 级别映射 | `docs/models.md:274-317`（`thinkingLevelMap`） | `core/models/requestShape.ts` `levelNameFor`（Phase 5 新增） | ✅ **已收口**（**2026-09-23 更正**） | `CatalogModel.thinkingLevelMap` + `levelNameFor` 实现**下探再上探**的档位翻译：模型只支持 `high` 时，请求 `low` 仍得到 `high` 而非什么都不发。见 §2.7（已同步更正） |
| Provider 兼容性/就绪度矩阵 | **pi 无**（直接执行，不做矩阵） | `provider/registry/provider.ts:56-110`、`core/shell/providerReadiness.ts` | **OURS-ONLY** | 见 §4 |

## 2. DEFICIENT 详述

### 2.1 ~~`getRuntimeConfig` 丢弃全部可选字段 —— 用户配置静默失效~~ ✅ 已修复

> **现状**：Phase 3 的 T3 + T4 已修。`getRuntimeConfig` 现返回 20+ 字段且逐字段接线（`contextWindow`/`reserveTokens`/`temperature`/`topP`/`maxOutputTokens`/`modelTokenBudgets`/`theme`/`agentMode` 等）；死字段回归由 `scripts/check-config-consumers.mjs` 拦住。`thinkingLevel` 未进配置，改由 `/thinking` 存项目状态。

**现象**：`RuntimeConfig` 接口声明了 20+ 字段，`RuntimeConfigFile` 也接受同样字段，但 `getRuntimeConfig` 的 `return` 是**手写字面量**，只列了 10 个字段。其余字段在类型上可选，因此**编译器不报错**，运行时一律 `undefined`。

**证据（我们）**：

- `config/runtimeConfig.ts:60-88` 声明 `RuntimeConfig`，含 `temperature`、`topP`、`maxOutputTokens`、`thinkingLevel`、`thinkingBudgets`、`contextWindow`、`autoCompactPercent`、`reserveTokens`、`agentMode`、`permissionMode`、`subagentIsolation`、`promptCacheTtl`、`subagentPromptCacheTtl`、`theme`、`tuiMode`（`:73-86`）。
- `config/runtimeConfig.ts:90-116` `RuntimeConfigFile` 接受同一批字段。
- `config/runtimeConfig.ts:196-213` 的 `return` **只含** `provider`、`daemonEnabled`、`maxTurns`、`disabledTools`、`hiddenToolPrefixes`、`enableMcpTools`、`activeProviderConnectionId`、`providerConnections`、`providerCredentials`、`configSources`。
- `config/runtimeConfig.ts:119-149` `DEFAULT_CONFIG` 为上述字段**全部定义了默认值**（`contextWindow: 64_000`、`autoCompactPercent: 80`、`reserveTokens: 8_000`、`thinkingLevel: "medium"`、`temperature: 0.7`、`theme: "dark"`、`tuiMode: "regular"` …）——但 `DEFAULT_CONFIG` 只被用于那 10 个字段（`:187,193,196,199,201,202`），**其余默认值从未被读取**。

**实机验证**：写入 `{"contextWindow":200000,"autoCompactPercent":55,"reserveTokens":30000,"thinkingLevel":"high","temperature":0.2,"maxOutputTokens":8192,"tuiMode":"fullscreen","promptCacheTtl":"1h","theme":"light"}`，读回全部 `undefined`。

**下游后果（逐个确认）**：

| 字段 | 下游 | 后果 |
|---|---|---|
| `contextWindow` | `cli/runtime/cliSessionRuntimeFactory.ts:84` `policy: { contextWindow: input.runtimeContext.runtimeConfig.contextWindow ?? 64_000 }` | 用户设 200k，自动压缩仍按 **64k** 触发 → 过早压缩 |
| `contextWindow` | `cli/interactive/sessionFacts.ts:68` `contextWindow: ... ?? 64_000` | 状态栏上下文百分比**分母错**，显示偏高 |
| `contextWindow` | `core/commands/contextCommandRuntime.ts:81` `configuredWindow()` 读 env `AUTO_COMPACT_WINDOW`，否则 64_000 | 同一数字在三处各写一遍 |
| `contextWindow` | `context/compact/governance/contextAnalysis.ts:44` `?? 64_000` | 第四处硬编码 |
| `autoCompactPercent` | **零消费者** | 声明了、默认 80、无人读 |
| `reserveTokens` | `session/compaction.ts:84` 用 `DEFAULT_RESERVE_TOKENS`（`session/context.ts:5` = 8_000） | 与 config 的 8_000 恰好相等，掩盖了未接线 |
| `thinkingLevel` | `core/commands/thinkingCommandRuntime.ts` 只用 `ThinkingEffort`（`low`/`medium`/`high`），由项目状态文件驱动 | config 的 7 级 `thinkingLevel` 完全被绕过 |
| `thinkingBudgets` | **零消费者** | — |
| `temperature` / `topP` | `turn/step.ts:113` 用 `samplingTemperature(workspaceRoot, request.temperature ?? 0.7)` | 走的是 `fastCommandRuntime` 的项目状态，非 config |
| `maxOutputTokens` | `turn/step.ts:116` `request.maxOutputTokens` | 请求里该字段恒 `undefined` |
| `theme` / `tuiMode` | **零消费者** | 与 `04-*` 报告的 `setTheme` 零调用者一致 |
| `promptCacheTtl` / `subagentPromptCacheTtl` | **零消费者** | — |
| `agentMode` | `cli/interactive/sessionFacts.ts:59` 有 `?? "build"` 兜底 | 兜底掩盖 |
| `permissionMode` | **零消费者** | 权限实际由 `cli/approval/permissionScope.ts` 的 `ask`/`accept-edits`/`allow-all` 三档驱动 |

**影响**：这是一个**系统性配置失效**——用户在 `~/.cheers/config.json` 或 `.cheers.json` 里写的绝大多数设置都不生效，且没有任何提示。最直接的可见后果是**自动压缩在 64k 而非模型真实窗口触发**。

**注意**：`config/runtimeConfig.test.ts` 有 9 个测试且全部通过——因为 `:37-51` 的断言写的是 `expect(config).toEqual({ ... 那 10 个字段 })`（`:38` 起），**测试固化了缺陷本身**。

**最小改动建议**：把 `return` 改为 `{ ...DEFAULT_CONFIG, ...merged, configSources: sources }` 的展开式，然后逐个确认 15 个字段的下游接线。测试需相应改为断言「字段能往返」而非「字段恰好是这 10 个」。

### 2.2 订阅式 OAuth 仅 2 家（置信度：高）

**证据（我们）**：`core/auth/oauth/providers.ts:23` `id: "openai"`（ChatGPT 账号）、`:59` `id: "google"`。全文件仅这两个 `OAuthProviderConfig`。`core/commands/connect/preset.ts:10-42` 的连接预设共 6 条：`openai`、`anthropic`、`siliconflow`、`google`、`antigravity`、`claudecode`——**全部是 API key 或兼容代理，无订阅登录**。

**证据（pi）**：`docs/providers.md:15-63` 列出 7 家订阅：ChatGPT Plus/Pro (Codex)、Claude Pro/Max、GitHub Copilot、xAI (Grok/X)、Meta (Muse)、OpenRouter（OAuth 铸 key）、Radius。凭据存 `~/.pi/agent/auth.json` 并自动刷新。

**影响**：无法用 Claude Pro/Max 或 GitHub Copilot 订阅额度驱动我们——而这两者是当前最主流的「已付费额度」。

**最小改动建议**：`core/auth/oauth/providers.ts` 的设计已是「声明式条目 + 共享 flow」（文件头注释明确说「adding a provider is a dozen lines」），加 Claude Pro/Max 与 GitHub Copilot 两条配置即可，无需改 flow。

### 2.3 模型目录：能叠加，不能覆盖（置信度：高）—— ✅ **2026-09-23 已收口**

> **收口说明**：三层叠加已实现（`catalogStore.ts:47` `loadCatalog` = builtin → cache → user），
> 刷新是显式动作（`catalogRefresh.ts:7`「Explicit, never automatic」）。
> `CatalogModel` 的字段也已由 Phase 5 从 3 扩到 7（`reasoning`/`thinkingLevelMap`/`maxTokens`/`compat`）。
> **下方原文保留为当时的证据。**

**证据（我们）** `core/models/catalogStore.ts:44-50` `loadCatalog()` 三层叠加（内置快照 → 刷新缓存 → 用户文件），`core/models/catalog.ts:284-314` `mergeProviders` 的合并规则是：

- 新增 provider：整条 push（`:293-302`）。
- 已存在 provider：`{ ...existing, ...patch }`，且 `models` 是**并集**（`:311` `dedupeModels([...existing.models, ...patch.models])`）。

**证据（pi）**：`docs/models.md:354-420` `modelOverrides` 可**按 model id 覆盖已发布模型的字段**（`contextWindow`、`maxTokens`、`name`、`cost`、`promptCache`、`samplingParams`、`headers`、`compat`、`thinkingLevelMap`），无需重述整个 provider 的模型表。

**影响**：我们无法「只把 `claude-sonnet-4-5` 的 contextWindow 从 200k 改成 1M」——用户文件里的同名 model 会被 `dedupeModels` 视为重复而丢弃或并列，无法表达覆盖语义。这也使 §2.1 的 `contextWindow` 问题更难绕过。

**最小改动建议**：给 `CatalogProvider` 增加 `modelOverrides?: Record<string, Partial<CatalogModel>>`，在 `mergeProviders` 里按 id 应用。

### 2.4 兼容性标志是描述性的，不改变请求形状（置信度：高）—— ✅ **2026-09-23 已收口（部分）**

> **收口说明**：新增 `core/models/requestShape.ts`，`CatalogModel` 加 `compat` 字段，
> 让**四个有失败证据的标志**真正改变请求：system 角色名、输出上限字段名、
> 是否发 `reasoning_effort`、是否需要合成 assistant 桥接 tool 结果。
> 其余 7 个标志**保持描述性**——每个都需要「哪类端点会因此失败」的证据，
> 为没有证据的能力发明开关正是这一项记录的问题本身。
> 实现见 `phase-5-execution.md` §5。**下方原文保留为当时的证据。**
>
> ⚠️ **复核轮修正**：接线完成，但**所有内置模型都没有声明 `compat`**，
> 所以对**开箱即用的模型完全无效**——用户最可能用的那些模型恰好一个都没配。
> 已按证据补齐：OpenAI 推理模型（`developer` + `max_completion_tokens`）、
> DeepSeek（不发 `reasoning_effort`）。
> **其中 OpenAI 一项是真实故障**：`DEFAULT_CONFIG.maxOutputTokens: 4096`
> 且**总是发送**，而 gpt-5/o 系列**拒绝 `max_tokens`**，
> 所以修复前**每一个这类请求都会被拒**。
> 另：`maxTokens` 当时也是**零读取者的字段**，已接线为 `maxOutputCeiling` 回退；
> `input` 因**无任何消费者**而删除（裁决 §3.2 撤销记录）。
> 详见 `phase-5-execution.md` §11.2 第 7 项。

**现象**：我们有一张很完整的 provider 兼容性矩阵，但没有任何一处根据它调整请求。

**证据（我们）**：

- `provider/registry/provider.ts:28-41` `ProviderCompatibilityFlags` 含 `developerRole`、`systemRole`、`toolCalls`、`parallelToolCalls`、`structuredJsonOutput`、`streaming`、`reasoningEffort`、`strictMessageRoles`、`openAICompatibleShape`、`customHeaders`、`providerSpecificQuirks`。
- `grep -rn "projectProviderRegistry" packages/ts-shell/src --include='*.ts' | grep -v test` → **仅 `provider/registry/provider.ts:292` 的定义处**。`projectProviderRegistry` 与 `ModelDescriptor` 的消费者**全部是测试**（`provider/request/{invocation,boundary,attempt}.test.ts`、`runtime/events/projection.test.ts`）。
- 实际请求构造在 `turn/step.ts:103-117`：`{ role: "system", ... }` 恒定，`reasoning_effort` 是否发送取决于 `effortAccepted`（`:98`）——即「先发，被拒再撤」，靠 `:143` 的 `/reasoning_effort/i.test(detail)` 正则嗅探。

**证据（pi）**：`docs/models.md:420-520` `compat.supportsDeveloperRole: false` 会让 pi 把 system prompt 作为 `system` 消息而非 `developer` 消息发送；`supportsReasoningEffort: false` 直接不发该字段。**声明即生效**。

**影响**：兼容性矩阵是一份**说明书而非控制器**。每接一个不兼容的 OpenAI-compatible 服务，用户都要靠一次失败的请求来发现，且代价是一次重试。

**最小改动建议**：`turn/step.ts` 的 payload 构造改为读取 `ProviderCompatibilityFlags`（经 `projectProviderRegistry`），而非恒定形状 + 正则回退。这同时会让矩阵从死代码变成活代码。

### 2.5 自定义 provider：能加，不能改行为（置信度：高）—— **2026-09-23 部分收口**

> **收口说明**：用户可用 `models.json` 加 provider 与模型，且 Phase 5 后**能表达请求形状差异**
> （`CatalogModel.compat` → `requestShape.ts`）。
> **余量**：不能自定义**协议实现**（pi 支持 `openai-responses`/`anthropic-messages` 等多协议）。
> **下方原文保留为当时的证据。**

**证据（我们）**：`core/models/catalogStore.ts:74-90` `ensureUserCatalog()` 生成示例，字段限于 `label`/`runtime`/`auth`/`baseUrl`/`envVar`/`models[].id|contextWindow`。`CatalogModel`（`core/models/catalog.ts:20-23`）只有 `id` 与 `contextWindow`。

**证据（pi）**：`docs/custom-provider.md`（786 行）定义完整的自定义 API 实现面；`docs/models.md:122-133` `Supported APIs` 列出 `openai-completions`／`openai-responses`／`azure-openai-responses`／`anthropic-messages`／`google-generative-ai` 等；`models.md:179-198` 支持自定义 headers。

**影响**：用户能指向一个兼容端点，但**无法表达该端点的差异**（不支持 developer role、不支持 reasoning_effort、参数名不同、需要特殊 header）。这与 §2.4 是同一根因的两面。

**最小改动建议**：`CatalogModel` 增加 `compat?: Partial<ProviderCompatibilityFlags>` 与 `samplingParams?: Record<string, unknown>`；与 §2.3/§2.4 一起落地。

### 2.6 ~~HTTP 超时只能靠环境变量~~ ✅ **2026-09-24 已收口（Phase 6 T1）**

> **2026-10-18 可执行文件返工**：传输明确加载已安装的 dispatcher 实现，避免运行时兼容层忽略代理与超时。Node 保留既有 Fetch；可执行文件复用同一 dispatcher 的 request 接口，通过 `provider/request/client.ts`、`body.ts` 接入原生 Response。代理关闭/no-proxy 不借用环境代理，明确代理不被无关环境 NO_PROXY 覆盖。`connection.ts` 同时约束代理 TLS、CONNECT 响应和目标 TLS；IP 代理不发送 IP SNI，证书仍验证实际 hostname/IP。
>
> 适配层限定于已序列化的 provider 请求，发送前物化一次请求体；响应保持有界流式读取、取消和异常传播，包括未读取就丢弃以及满队列后取消。重定向有次数上限、逐目标重选传输并移除跨源凭据；没有失败后换传输重放。gzip/zlib-deflate/Brotli 在错误响应中也解码；损坏压缩、缺失 gzip trailer 和错标为 zlib-deflate 的 raw-deflate 均拒绝，不承诺通用 Fetch 的历史宽容行为。

> **收口说明**：把 `provider/request/fetch.ts` 的实现**接进了活轨**——
> `createProviderStep` 传 `fetchImpl`（`cliRuntimeInvocation.ts:439`），
> 压缩路径同样传（`cliSessionRuntimeFactory.ts:125,137`）；
> 新增三个可配字段 `providerConnectTimeoutMs`/`providerHeadersTimeoutMs`/`providerBodyTimeoutMs`
> （默认 30s/120s/120s，环境变量 `CHEERS_PROVIDER_*_TIMEOUT_MS` **仍优先**）。
> **实机验证**：对一个「答就绪但不应答」的 provider，请求在超时后**结束**而非无限等待；
> 对照测试显示全局 `fetch` 4 秒仍在等待，provider fetch 在 2.5 秒抛出。
> 见 `phase-6-execution.md` §1。**下方原文保留为当时的证据。**

> **更正说明**：原文说「只能靠环境变量」，实际是**更糟的一种情况**——
> 那份可配实现（`provider/request/fetch.ts:32-34`，30s/120s/120s，`:78-89` 读 env）
> **只被启动预检使用**（唯一调用者 `core/shell/providerReadiness.ts:149`），
> 而**活轨 `turn/step.ts:134` 用裸 `fetch`，完全没有超时**。
> 仓库里的真实形态是四种状态：**1 份可配（未接线）+ 2 处硬编码（`taskTool` 30s / `btw` 15s）+ 2 处完全没有（`step.ts` / `summarize.ts`）**。
> **这是 Phase 6 的 T1**，裁决见 `phase-6-decisions.md` §1。
> **下方原文保留为当时的证据。**

> **2026-09-23 补充**：请求失败的重试与退避已实现（两层：provider 层默认 0 次、
> turn 层默认 3 次，`Retry-After` 优先于本地退避）。**一个原本必然终止回合的瞬态失败现在可以恢复。**
> **但重试不覆盖本项**：重试只在**收到响应之后**分类（`turn/step.ts:220-235`），
> 而挂起的连接永远不产生响应，所以**重试救不了一个没有超时的连接**——
> 这正是 T1 必须单独做的理由。见 `phase-5-execution.md` §2。

**证据（我们）**：`provider/request/fetch.ts:7-9` 读 `CHEERS_PROVIDER_CONNECT_TIMEOUT_MS` / `..._HEADERS_TIMEOUT_MS` / `..._BODY_TIMEOUT_MS`；`:32-34` 默认 `30_000` / `120_000` / `120_000`。无配置文件入口。

**证据（pi）**：`src/core/http-dispatcher.ts:6` `DEFAULT_HTTP_IDLE_TIMEOUT_MS = 300_000`，`:8-14` `HTTP_IDLE_TIMEOUT_CHOICES` 提供 30s/1m/2m/5m/disabled 五档，并有 `parseHttpIdleTimeoutMs` 解析 `"disabled"` 与数字；`docs/settings.md` 暴露为 `httpIdleTimeoutMs`（设 0 关闭）。

**影响（2026-09-23 更正）**：原文说「慢速推理模型在 120s 无 body 时被我们掐断」——
**这条影响描述是错的**。因为那份实现**没接在活轨上**，真实后果是**相反的**：
慢速或挂起的请求**不会被掐断，而是无限等待**。
「被掐断」是可恢复的（重试或调参），「无限等待」不是。
用户改环境变量也**无效**——`CHEERS_PROVIDER_*_TIMEOUT_MS` 只影响启动预检。

**余量**：`runtimeConfig` 里没有对应字段（Phase 6 T1 补）。

**最小改动建议**：加入 config 字段并在 `resolveProviderTransportConfig` 读取；pi 的「五档 + disabled」是可直接借鉴的 UX 形状。

### 2.7 thinking 级别：我们有 3 档，pi 有 7 档且按模型映射（置信度：高）—— ✅ **2026-09-23 部分收口**

> **收口说明**：`CatalogModel` 新增 `thinkingLevelMap`，档位名按模型翻译；
> 模型没有该档时**向下**回退（低档回答更快，高档可能长时间不出声）。
> **档位数仍为 3**（`low`/`medium`/`high`）——扩到 7 档是产品决策，
> 而映射是正确性修复，两者分开处理。**下方原文保留为当时的证据。**

**证据（我们）**：

- `config/types.ts:5` `ThinkingBudgetTier = "minimal" | "low" | "medium" | "high"`；`:12` `ModelSettings.thinkingBudget?: ThinkingBudgetTier`；`:62` 默认 `"medium"`。
- `core/commands/thinkingCommandRuntime.ts:21` `TIERS = ["low", "medium", "high"]`——**实际只有 3 档**，且只写 `reasoning_effort`（文件头注释明确：「It is a request, not a guarantee… What is not claimed is a token budget — the field takes a level」）。
- `config/runtimeConfig.ts:133-138` 定义了 `thinkingBudgets`（minimal 1024 / low 4096 / medium 10240 / high 32768），但**零消费者**（§2.1）。

**证据（pi）**：`docs/settings.md:20-40` `defaultThinkingLevel` 支持 `off`/`minimal`/`low`/`medium`/`high`/`xhigh`/`max` **7 档**；`docs/models.md:274-317` `thinkingLevelMap` 做 per-model 映射；`thinkingBudgets` 是真正生效的 token 预算（`docs/settings.md` 的 thinkingBudgets 一节：Anthropic/Google/Bedrock 原生使用，OpenAI-compatible 在设了 `compat.thinkingTokenBudgetField` 时使用）。

**影响**：`off` 与 `xhigh`/`max` 无法表达；「off」只能靠 `/thinking off` 写 `null`，语义与「不指定」不可区分。token 预算能力已声明但未接线。

**最小改动建议**：`TIERS` 扩到 7 档并让 `thinkingBudgets` 生效（或在确定不做预算时删掉该死字段——按 `01-*` 报告的标准，未读的旋钮是「一个界面不守的承诺」）。

## 3. MISSING 详述

### 3.1 per-model 覆盖（`modelOverrides`）（置信度：高）

**pi 如何实现**：`docs/models.md:354-420` 每个 provider 可有 `modelOverrides: { "<model-id>": { name, reasoning, thinkingLevelMap, input, cost, promptCache, contextWindow, maxTokens, samplingParams, headers, compat } }`，只覆盖列出的字段，`samplingParams` 按 key 合并、`promptCache` 按 tier 合并。文中给了具体用例：OpenAI GPT-5.6 系列默认 272000 context（短上下文定价档），要进 1.05M 档就显式覆盖。

**我们缺失的证明**：`core/models/catalog.ts:20-40` 的 `CatalogModel` 只有 `id` 与 `contextWindow`；`mergeProviders`（`:284-314`）对同 id 模型做并集去重，无覆盖语义。检索 `modelOverrides` 全仓 0 命中。

**影响**：无法微调单个已发布模型（成本、窗口、参数），只能整条重述或放弃。

**最小落地路径**：见 §2.3 的建议——`modelOverrides` 与 `mergeProviders` 是同一处改动。

### 3.2 Prompt cache 保活（cache warming）（置信度：高）

**pi 如何实现**：`src/core/cache-warmer.ts` 在缓存即将过期前重发「最后一次请求 + 1 token 输出上限」以续命；`:14` `MAX_WARMING_AGE_MS = 60min`（流式）、`:16` `MAX_IDLE_WARMING_AGE_MS = 30min`（空闲）、`:18` `CACHE_WARMING_MINIMUM_EXPECTED_SAVINGS = 0.05`（期望省不到 5 美分就不发）、`:23` `IDLE_CONTINUATION_PROBABILITY = 0.15`（实测得出的空闲续接概率）、`:26-29` `getCacheWarmingDelayMs` 在 TTL 的 90% 处触发并留 10s 余量；`getPromptCacheTtlMs`（`:36-46`）按模型 `promptCache[retention]` 取寿命。三档模式 `off`/`streaming`/`idle`（`docs/settings.md:66-100`），且扩展可经 `cache_warming_decision` 事件覆盖每个决策。

**我们缺失的证明**：

```bash
grep -rni "cacheWarming\|cache_warm" packages/ts-shell/src --include='*.ts'   # → 0 命中
```

`config/runtimeConfig.ts:83-84` 声明了 `promptCacheTtl?: "5m" | "1h"` 与 `subagentPromptCacheTtl`，但既未生效（§2.1）也无任何保活逻辑。

**影响**：长任务里每次停顿超过缓存 TTL 后，下一轮请求全量重算输入——按 pi 的量化口径这是可直接折算成钱的浪费。

**最小落地路径**：先让 `promptCacheTtl` 生效并接上 `cache_control` 标记；保活调度器可后置。**注意**：pi 的实现依赖模型目录里有 `promptCache` 寿命，我们的 `CatalogModel` 没有该字段（§2.3/§3.1），需一并补。

### 3.3 Cache 命中/未命中统计（置信度：高）—— **2026-09-23 部分收口**

> **收口说明**：我方**记录 provider 报的缓存绝对值**（`usageTelemetry.ts:34-35`
> `cacheReadTokens`/`cacheWriteTokens`），`/cost` 已展示（含费率）。
> **余量**：**无命中率、无浪费分析**——pi 算的是「本可命中却未命中」的 token 与多花的钱，
> 并把空闲间隔作为归因（`cache-stats.ts:9` `CACHE_TTL_MS = 5 分钟`、`:11` `NOISE_FLOOR_TOKENS = 1024`）。
> **下方原文保留为当时的证据。**

**pi 如何实现**：`src/core/cache-stats.ts` 定义 `CacheMiss { missedTokens, missedCost, idleMs, modelChanged }` 与 `CacheWasteTotals { missedTokens, missedCost, missCount }`；`:12` `CACHE_TTL_MS = 5min`，`:15` `NOISE_FLOOR_TOKENS = 1024`（低于此视为断点粒度噪声，不计数）；`docs/settings.md` 的 `showCacheMissNotices` 把每次显著 miss 显示在对话流里。

**我们缺失的证明**：

```bash
grep -rni "cacheRead\|cacheWrite\|cachedTokens\|cache_miss" packages/ts-shell/src --include='*.ts'   # → 0 命中
```

`observability/usageTelemetry.ts:1-19` 的 `SessionUsageTelemetry` 只有 `promptTokens` / `completionTokens` / `totalTokens` / `lastPromptTokens` / `turnsCount` / `toolCallsCount` / `model` / `lastUpdated`——**没有 cache 维度**，且 `USAGE_RATES`（`:19`）是写死的两个数（prompt 0.14 / completion 0.28 每百万 token），与实际模型价格无关（`estimateUsageCost` 在 `:22-27`）。

**影响**：用户看不到缓存浪费，成本估算也不准。

**最小落地路径**：usage 记录增加 `cacheReadTokens`/`cacheWriteTokens`（provider 的 usage 里已有该字段，只是没记），并把 `USAGE_RATES` 换成模型目录里的 `cost`。

### 3.4 传输选择（SSE／WebSocket）（置信度：高）

**pi 如何实现**：`docs/settings.md` 的 `transport` 设置支持 `"sse"`、`"websocket"`、`"websocket-cached"`、`"auto"`；`websocketConnectTimeoutMs` 单独配置握手超时。

**我们缺失的证明**：

```bash
grep -rn "websocket" packages/ts-shell/src --include='*.ts' | grep -v test   # → 0 命中
```

`turn/step.ts:111-112` 恒定 `stream: true` + `stream_options: { include_usage: true }`，只有 SSE。

**影响**：无法利用 WebSocket 传输（部分 provider 在其上支持服务端缓存复用）。

**最小落地路径**：优先级低于 §3.2/§3.3；仅在确有 provider 收益时再做。

## 4. OURS-ONLY（仅记录，本轮不提议开发）

| 能力 | 我们位置 | pi 是否真的没有（检索命令+结果） |
|---|---|---|
| Provider 兼容性/就绪度矩阵与失败分类 | `provider/registry/provider.ts:28-110`（`ProviderCompatibilityFlags`、`ProviderReadinessMatrixEntry`、`ProviderFailureClass`、`ProviderFallbackPolicyMetadata`）、`core/shell/providerReadiness.ts` | pi 直接执行不做矩阵：`grep -rn "readinessMatrix\|ProviderFailureClass" /home/wang/projects/pi/packages/coding-agent/src` → 0 命中；pi 的对应物是 `compat` 声明（`docs/models.md:420-520`）与 `auth-guidance.ts`，语义不同 |
| 凭据遮蔽（`maskApiKey`）与 transport 诊断 | `core/shell/providerCredentials.ts:244-251`、`provider/request/fetch.ts:57-59` | pi 无对应命名；`grep -rn "maskApiKey\|transportDiagnostic" /home/wang/projects/pi/packages/coding-agent/src` → 0 命中 |

> **诚实限定**：`provider/registry/provider.ts` 的矩阵目前**只被测试消费**（§2.4），
> 因此 OURS-ONLY 第 1 项是「已写好但未接线」，不是已交付能力。
> 它的价值在于它已经**描述了**正确行为——把它接到请求构造上，比从零设计兼容层便宜得多。

## 5. 未能验证的项

1. **pi 的订阅登录实机流程**：pi 的 `node_modules` 不存在，未实跑 `/login`；7 家订阅的可用性来自其文档声明，未逐家验证。
2. **`thinkingBudgets` 在 pi 侧的实际生效路径**：`docs/settings.md` 声明 Anthropic/Google/Bedrock 原生使用，但未验证 `compat.thinkingTokenBudgetField` 的具体落点。
3. **cache warming 的收益量级**：pi 的 `IDLE_CONTINUATION_PROBABILITY = 0.15` 自称「measured from our own usage」，我们无法复核其测量方法，故只引用其机制不引用其收益数字。
4. **`config/runtimeConfig.test.ts` 的 `:38` 断言**是否**有意**固化为「恰好这 10 个字段」——未追溯提交历史确认作者意图，只确认其当前效果是掩盖缺陷。
5. **环境变量路径是否被实际使用**：`CHEERS_PROVIDER_*_TIMEOUT_MS` 与 `AUTO_COMPACT_WINDOW` 是否有用户实际依赖，未调查。
