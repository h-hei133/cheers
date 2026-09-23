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
| 用户配置文件字段真正生效 ✅ **已全部收口 2026-09-23**（含 `tuiMode`：默认 `fullscreen`，`regular` 标为实验性） | `docs/settings.md:20-60`；`src/core/settings-manager.ts` | `config/runtimeConfig.ts:193-215` | **DEFICIENT** | 见 §2.1（**最高优先级**） |
| 订阅式 OAuth 登录 | `docs/providers.md:15-63`（7 家：Codex／Claude Pro／Copilot／xAI／Meta／OpenRouter／Radius） | `core/auth/oauth/providers.ts:23,59`（2 家） | **DEFICIENT** | 见 §2.2 |
| 模型目录（内置快照 + 用户叠加 + 刷新） | `src/core/{model-registry.ts, models-store.ts, remote-catalog-provider.ts}` | `core/models/{catalog.ts, catalogStore.ts, catalogRefresh.ts}` | **DEFICIENT** | 见 §2.3 |
| per-model 覆盖（`modelOverrides`） ✅ **判定更正 2026-09-23**：`dedupeModels` 本就是 last-write-wins，**一直生效**；真正的限制只是 `CatalogModel` 字段太少，`cost`（4 个费率，可选）已补 | `docs/models.md:354-420` | `core/models/catalog.ts` | ~~MISSING~~ **判定有误** | 见 `phase-4-execution.md` §4.2 |
| 兼容性开关真正改变请求形状 | `docs/models.md:420-520`（`compat.supportsDeveloperRole` 等） | `provider/registry/provider.ts:28-41` | **DEFICIENT** | 见 §2.4 |
| 自定义 provider（声明式 API 适配） | `docs/custom-provider.md`（786 行）；`src/core/provider-composer.ts` | `core/models/catalogStore.ts:74-90`（用户文件加 provider） | **DEFICIENT** | 见 §2.5 |
| Prompt cache 保活（warming） | `src/core/cache-warmer.ts`；`docs/settings.md:66-100` | 无 | **MISSING** | 见 §3.2 |
| Cache 命中/未命中统计 | `src/core/cache-stats.ts` | 无 | **MISSING** | 见 §3.3 |
| 传输选择（SSE／WebSocket） | `docs/settings.md`（`transport`） | 无 | **MISSING** | 见 §3.4 |
| HTTP 空闲超时可配 | `src/core/http-dispatcher.ts:6-19`；`docs/settings.md`（`httpIdleTimeoutMs`） | `provider/request/fetch.ts:30-32`（仅 env） | **DEFICIENT** | 见 §2.6 |
| Per-model thinking 级别映射 | `docs/models.md:274-317`（`thinkingLevelMap`） | `config/types.ts:10`（单一 `thinkingBudget`） | **DEFICIENT** | 见 §2.7 |
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

### 2.3 模型目录：能叠加，不能覆盖（置信度：高）

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

**现象**：我们有一张很完整的 provider 兼容性矩阵，但没有任何一处根据它调整请求。

**证据（我们）**：

- `provider/registry/provider.ts:28-41` `ProviderCompatibilityFlags` 含 `developerRole`、`systemRole`、`toolCalls`、`parallelToolCalls`、`structuredJsonOutput`、`streaming`、`reasoningEffort`、`strictMessageRoles`、`openAICompatibleShape`、`customHeaders`、`providerSpecificQuirks`。
- `grep -rn "projectProviderRegistry" packages/ts-shell/src --include='*.ts' | grep -v test` → **仅 `provider/registry/provider.ts:292` 的定义处**。`projectProviderRegistry` 与 `ModelDescriptor` 的消费者**全部是测试**（`provider/request/{invocation,boundary,attempt}.test.ts`、`runtime/events/projection.test.ts`）。
- 实际请求构造在 `turn/step.ts:103-117`：`{ role: "system", ... }` 恒定，`reasoning_effort` 是否发送取决于 `effortAccepted`（`:98`）——即「先发，被拒再撤」，靠 `:143` 的 `/reasoning_effort/i.test(detail)` 正则嗅探。

**证据（pi）**：`docs/models.md:420-520` `compat.supportsDeveloperRole: false` 会让 pi 把 system prompt 作为 `system` 消息而非 `developer` 消息发送；`supportsReasoningEffort: false` 直接不发该字段。**声明即生效**。

**影响**：兼容性矩阵是一份**说明书而非控制器**。每接一个不兼容的 OpenAI-compatible 服务，用户都要靠一次失败的请求来发现，且代价是一次重试。

**最小改动建议**：`turn/step.ts` 的 payload 构造改为读取 `ProviderCompatibilityFlags`（经 `projectProviderRegistry`），而非恒定形状 + 正则回退。这同时会让矩阵从死代码变成活代码。

### 2.5 自定义 provider：能加，不能改行为（置信度：高）

**证据（我们）**：`core/models/catalogStore.ts:74-90` `ensureUserCatalog()` 生成示例，字段限于 `label`/`runtime`/`auth`/`baseUrl`/`envVar`/`models[].id|contextWindow`。`CatalogModel`（`core/models/catalog.ts:20-23`）只有 `id` 与 `contextWindow`。

**证据（pi）**：`docs/custom-provider.md`（786 行）定义完整的自定义 API 实现面；`docs/models.md:122-133` `Supported APIs` 列出 `openai-completions`／`openai-responses`／`azure-openai-responses`／`anthropic-messages`／`google-generative-ai` 等；`models.md:179-198` 支持自定义 headers。

**影响**：用户能指向一个兼容端点，但**无法表达该端点的差异**（不支持 developer role、不支持 reasoning_effort、参数名不同、需要特殊 header）。这与 §2.4 是同一根因的两面。

**最小改动建议**：`CatalogModel` 增加 `compat?: Partial<ProviderCompatibilityFlags>` 与 `samplingParams?: Record<string, unknown>`；与 §2.3/§2.4 一起落地。

### 2.6 HTTP 超时只能靠环境变量（置信度：高）

> **2026-09-23 补充**：请求失败的重试与退避已实现（两层：provider 层默认 0 次、
> turn 层默认 3 次，`Retry-After` 优先于本地退避）。这不改变本项记录的
> 「超时只能靠环境变量」的事实，但**一个原本必然终止回合的瞬态失败现在可以恢复**。
> 见 `phase-5-execution.md` §2。

**证据（我们）**：`provider/request/fetch.ts:7-9` 读 `CHEERS_PROVIDER_CONNECT_TIMEOUT_MS` / `..._HEADERS_TIMEOUT_MS` / `..._BODY_TIMEOUT_MS`；`:32-34` 默认 `30_000` / `120_000` / `120_000`。无配置文件入口。

**证据（pi）**：`src/core/http-dispatcher.ts:6` `DEFAULT_HTTP_IDLE_TIMEOUT_MS = 300_000`，`:8-14` `HTTP_IDLE_TIMEOUT_CHOICES` 提供 30s/1m/2m/5m/disabled 五档，并有 `parseHttpIdleTimeoutMs` 解析 `"disabled"` 与数字；`docs/settings.md` 暴露为 `httpIdleTimeoutMs`（设 0 关闭）。

**影响**：慢速推理模型（长思考、大 context）在 120s 无 body 时被我们掐断；用户只能改环境变量，且 `runtimeConfig` 里没有对应字段。

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

### 3.3 Cache 命中/未命中统计（置信度：高）

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
