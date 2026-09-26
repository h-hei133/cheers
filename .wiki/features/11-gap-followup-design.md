---
title: "Phase 11 续研：08 待办项的深入设计与新发现"
category: article
sources: [08-gap-and-debt-research, reference-implementation-survey-2026-09-26, live-probes-2026-09-26]
created: 2026-09-26
updated: 2026-09-26
tags: [features, gap-analysis, design, decision]
summary: "对 `08-gap-and-debt-research.md` 待办项的**深入一轮**：不做新的差距盘点，而是逐项回答「参考实现到底怎么做的、我们的缺口精确在哪、具体该怎么改」。**主代理逐条实机复现**了每一项（`npx tsx` 直调生产函数），子代理结论只作线索。新增 3 项 08 未记录的发现（Anthropic 流内 `error` 事件被静默丢弃、工具 schema 与系统提示不计入上下文估算、`lsp` 声明但从不读取 `line`/`character`）。**证伪 1 项**：08 记录的「SSE 事件头被丢弃」对当前支持的两个协议**不构成破坏**。所有 P0（P0-A 已随 Rust 删除消失，P0-B/P0-C 仍在）已实测复现。"
confidence: high
---

# Phase 11 续研：08 待办项的深入设计与新发现

> **本文件与 `08-gap-and-debt-research.md` 的关系**：08 是**盘点**（哪些缺口存在），本文件是**深化**（每项具体怎么改）。
> 08 的条目编号（D1–D14、M1–M10、P0-A/B/C）在本文件中沿用，不重复登记。
>
> **纪律**：每条断言附可复现方式；子代理回报**逐条由主代理实机复验**，被推翻的如实记录；
> **零代码改动**——本轮只产出设计与证据。

---

## 0. 执行方式与事故记录

| 路 | 子代理 | 结果 |
|---|---|---|
| C | `R3ProviderCtx` | ✅ 完成（provider/上下文/权限切片） |
| A | `R1KernelLoop` → `R1bKernel` | ❌ 两次均**未返回**（TLS 故障） |
| B | `R2ToolsEdit` → `R2bTools` → `R2cDesign` | ❌ 三次均**未返回**（TLS 故障） |

**事故**：`vsllm/gemini-3.8-flash-api` 端点在本次会话中**反复 TLS 失败**
（`unknown certificate verification error` / `http2 connection force closed`），
**6 次派遣中 5 次因此中断**，与任务内容无关（`curl https://vsllm.com` 同样报
`SSL_ERROR_SYSCALL`）。三个 `R2*` 与两个 `R1*` 的 **transcript 保留在 `history://`**，
显示它们**已读完全部目标文件**（pi 的 `edit-diff.ts`、Claude Code 的 `FileEditTool.ts`、
opencode 的 `lsp/`、我们的 `taskTool.ts`/`lsp.ts`/`registry.ts`），但**未输出结论**。

**处置**：A/B 两路的**结论由主代理直接完成**——参考实现的关键位置已从
transcript 中定位，主代理逐一亲读并实机验证（下文每条均标注 `[VERIFIED]` 与复现命令）。
**这比采信一个未返回的报告更可靠**，也符合本仓库「子代理结论必须亲验」的既有纪律。

---

## 1. 三项 P0 的当前状态（实测复现）

> 08 §1 记录的三项 P0 中，**P0-A 已随 Rust 执行面的删除而消失**（没有 daemon 就没有它的默认值）。
> 另两项**仍然存在**，本轮逐条实机复现。

### 1.1 P0-A：**已消除**（Rust 删除的副作用）

08 的修复方向「cargo 缺失时落回本地」被更强的方案取代：**整条分支删除**。
已实测：全新 `HOME`、无配置、PATH 去掉 cargo → 命令 `completed` / exit 0 / `executionPath: ts-local`。

### 1.2 P0-B：`cheers.json` 不被读取——**确认，且 08 的描述需要更正**

**实测**（`npx tsx` 直调生产函数）：

```
candidates: [ '~/.private-agents/config.json', '<root>/.cheers.json' ]
repo cheers.json exists : true
is it a candidate?      : false
resolved maxTurns       : 15          ← 默认值
config sources          : [ '~/.private-agents/config.json' ]
```

**08 的一处描述需要更正**：08 称该文件含 `maxTurns: 30` 与 `permissions.allowRules`
（顶层）。实际它**嵌套在 `model` 下**，且 `maxTurns` 在顶层**不存在**：

```json
{ "$schema": "https://cheers.dev/schemas/settings.v1.json",
  "version": 1,
  "model": { "provider": "...", "maxTurns": 30, "thinkingBudget": "medium" },
  "permissions": { "allowRules": ["read:*", "bash:git status*", ...] },
  "tui": { "mode": "differential", "altScreen": true } }
```

**这是更严重的问题**：它不是「运行时配置放错了文件名」，而是**另一套 schema**
（`settings.v1.json`，含 `mcpServers`/`skills`/`tui` 等 `RuntimeConfigFile` 没有的键）。
即：**仓库里有一份完整的、看起来是权威的配置文件，而它对应的读取器从未被实现。**

**同型第二例（08 未记录）**：`.agents/settings.json` **内容与该文件逐字节相同**（已 `diff` 验证），
同样零读者。`.agents/` 目录本身是活的（`prompts/`、`skills/`、`themes/` 都有读取器），
唯独 `settings.json` 与 `workflows/` 没有。

**结论**：这不再是「3 行修复」（08 的估计）。需要先裁决**它应该是什么**：
（a）实现 `settings.v1` 读取器并接到 `RuntimeConfig`；
（b）删除这两个文件，把有效内容并入 `.cheers.json`；
（c）明确标记为「未来 schema 的草稿」并移出仓库根。
**（b）成本最低且消除歧义；（a）是功能开发。**

### 1.3 P0-C：`/model refresh` 抹掉能力声明——**确认，实测复现**

**实测**（`npx tsx` 直调 `mergeProviders` + `resolveRequestShape`）：

```
BEFORE: {"systemRole":"developer","maxTokensField":"max_completion_tokens",
         "reasoningEffort":true,"vision":true,"thinkingLevelName":"high"}
AFTER : {"systemRole":"system","maxTokensField":"max_tokens",
         "reasoningEffort":true,"vision":false,"thinkingLevelName":"high"}

AFTER model: {"id":"gpt-5.3","label":"GPT-5.3","contextWindow":400000,
              "cost":{"promptPerMTok":1,"completionPerMTok":2}}   ← 7 个字段只剩 4 个
```

`compat` 与 `promptCache` 整个消失，`vision` 从 `true` 变 `false`。
**用户可见后果**：推理模型拒绝 `max_tokens`（HTTP 400）、图片请求整个失败——
两者都是 Phase 5 / Phase 9 已修好的缺陷被静默回滚。

**修法**（与 08 一致，此处给出精确形状）：`core/models/catalog.ts:534-537` 的
`dedupeModels` 用 `Map.set` **整体替换**。应改为**按模型 id 深合并**：
patch 未声明的字段保留 base 值，且**只对来自刷新 patch 的模型**生效
（用户自定义模型不应被内置值反向覆盖）。

---

## 2. provider 层（切片 C，子代理完成 + 主代理复验）

### 2.1 D1：`classifyProviderFailure` 是死代码——**确认，且收益已量化**

**现状**：`provider/registry/provider.ts:240-272` 定义 18 类失败；
`grep` 生产 0 引用。活轨 `turn/step.ts:307-330` 用临时字符串判断。

**实测对比**（同一 `status + message` 输入）：

| 输入 | 死分类器会给出 | 活轨今天给出 |
|---|---|---|
| `401` + "Invalid API key" | `provider_auth` | `Provider HTTP 401: …` |
| `403` + "Forbidden" | `provider_auth` | `Provider HTTP 403: …` |
| `400` + "content_filter triggered" | `provider_safety_block` | `Provider HTTP 400: …` |
| `429` + "Rate limit reached" | `provider_rate_limited` | `Provider HTTP 429: …` |
| `500` + "internal error" | `provider_endpoint` | `Provider HTTP 500: …` |

**即**：分类器能区分**认证失败 / 安全拦截 / 限流 / 端点故障**四类，
而活轨把它们压成同一句。用户拿到 `Provider HTTP 401: {...}` 时不会想到去 `/connect`；
拿到 `content_filter` 时不会想到改写输入。

**参考**（`[VERIFIED]` 读 `pi/packages/ai/src/utils/retry.ts:22-60`）：pi 把**分类与策略分离**——
`NON_RETRYABLE_PROVIDER_LIMIT_ERROR_PATTERN`（配额耗尽，**快速失败不重试**）
与 `RETRYABLE_PROVIDER_ERROR_PATTERN`（限流/传输抖动，重试）分开。

**设计**：在 `turn/step.ts` 的 `const detail = await attemptResponse.text();` 之后调用
`classifyProviderFailure({ status, message: detail })`，按结果：
`provider_auth` → 立即停止重试并提示 `/connect`；`provider_safety_block` → 不重试，
返回安全拦截说明；`provider_rate_limited` → 保持重试但**尊重 `Retry-After`**（已实现）。
**成本低**：分类器与其单测已存在，只缺调用。

### 2.2 D2：Anthropic `thinking` 缺 `budget_tokens`——**确认，参考实现有对照**

**现状**：`provider/endpoints/anthropicMessages.ts:114-116` 只发 `{ type: "enabled" }`。

**参考**（`[VERIFIED]` 读 `pi/packages/ai/src/api/anthropic-messages.ts:1181-1186`）：

```ts
params.thinking = { type: "enabled", budget_tokens: options.thinkingBudgetTokens || 1024, display };
```

pi 还对新模型走 `type: "adaptive"` + `output_config.effort` 分支，即**区分了新旧两种形态**。

**缺口**：Anthropic Messages API 在 `thinking.type === "enabled"` 时要求 `budget_tokens`，
且约束 `budget_tokens >= 1024` 与 `budget_tokens < max_tokens`。
**`[INFERENCE]`**：无 Anthropic 账号，**400 未端到端验证**——依据是 API 契约。

**设计**：`anthropicMessages.ts` 发 `budget_tokens`（下限 1024），并保证 `max_tokens` 大于它。
**成本低**，纯 payload 构造。

### 2.3 D3：Anthropic `thinkingSignature` 被丢弃——**确认，参考实现完整**

**现状**：`anthropicMessages.ts` 全文 `signature` 0 命中；
`content_block_start` 的 `content_block.signature` 与 `signature_delta` 都被忽略。

**参考**（`[VERIFIED]` 读 pi 同文件 `:645-647, :713-719, :1340-1361`）：
pi 在流中累积 `thinkingSignature`，回传历史时**有签名则发 `thinking` 块、无签名则降级为 `text` 块**：

```ts
if (!hasThinkingSignature) {
  blocks.push({ type: "text", text: sanitizeSurrogates(block.thinking) });
} else {
  blocks.push({ type: "thinking", thinking: ..., signature: thinkingSignature });
}
```

**这是「两半」的设计**：签名是 Anthropic 维持多轮推理链的**加密续传令牌**；
而**流被中断时签名可能缺失**，此时必须降级为文本块，否则空签名同样被拒。
我们两半都没有。

**设计**：`turn/completion.ts` 与 `anthropicMessages.ts` 采集 `thinkingSignature`，
存入消息模型；序列化时按 pi 的规则二分。
**成本中**：需要消息模型新增字段。

### 2.4 D4：无条件发送 `temperature`——**确认，参考实现按模型能力门控**

**现状**：`openaiCompatible.ts:60` 无条件发 `temperature: input.temperature`；
`turn/step.ts:231` 默认 `?? 0.7`。`requestShape` **没有 temperature 维度**（`grep` → 0）。

**参考**（`[VERIFIED]`）：pi `packages/ai/src/types.ts:892` 有 `supportsTemperature?: boolean`，
并在 `anthropic-messages.ts:1113-1120` 这样门控：

```ts
if (options?.temperature !== undefined && !options?.thinkingEnabled
    && model.compat?.supportsMidConvoEffort !== true && compat.supportsTemperature) {
  params.temperature = options.temperature;
}
```

注意它同时看**模型能力**与**本次是否开了思考**——推理模式下即使模型支持也应省略。

**设计**：`requestShape` 增加 `supportsTemperature`（默认 `true`），
在 `resolveRequestShape` 中由 `compat.supportsTemperature === false` 或
模型 id 属推理族（`o1`/`o3`/`o4`）置 `false`；两个 endpoint 都据此条件发送。
**成本低**：一个布尔字段 + 两处条件展开。

### 2.5 D7 / D9'：token 估算——**确认，误差已量化**

**现状**：`session/context.ts:3` `CHARS_PER_TOKEN = 3.5`，纯字符除法。

**实测**（`npx tsx` 调 `estimateTokens`）：

```
CHARS_PER_TOKEN = 3.5
latin prose (1000 chars)  estimate=286
CJK         (1000 chars)  estimate=286      ← 与拉丁文完全相同
JSON        (1000 chars)  estimate=286
```

即**估算对内容形态完全不敏感**。真实比值（BPE 分词器）：
拉丁 ~4 字符/token、CJK ~0.7–1.5 字符/token、密集 JSON ~2 字符/token。

**因此 CJK 低估约 65–79%，JSON 低估约 35–52%。** 后果是压缩阈值
（`compaction.ts` `shouldCompact`）**在上下文真正溢出前不会触发**，回合以 provider
context overflow 崩溃。

**参考**（`[VERIFIED]`）：pi `packages/ai/src/utils/estimate.ts` 用 `CHARS_PER_TOKEN = 4`
但**关键在于它优先采用最后一次真实 usage**，只估算其后的增量；
Claude Code `services/tokenEstimation.ts:210-224` 更进一步，**按文件类型给不同比值**
（`json` = 2 字节/token，默认 4）。

**新增发现（08 未记录）**：**冷启动时系统提示与全部工具 schema 完全不计入**。
实测：`createCoreToolRegistry()` 的 13 个工具 schema = **8,933 字符 ≈ 2,552 token**；
`buildSystemPrompt("default", {})` = **1,054 字符 ≈ 301 token**。
而 `estimateTokens(messages)` 只看 `messages` —— 两者在
`openaiCompatible.ts:47` 是**作为独立参数**传的（`systemPrompt`、`tools`）。
即**冷启动漏算约 2,850 token**（工具更多时更高）。

**设计**：① 估算按字符类别加权（ASCII / CJK / 结构字符）；
② 冷启动时把系统提示与工具 schema 长度计入；③ 沿用 pi 的「真实 usage 优先」策略
（我们已有 `lastPromptTokens`，只是 `<= 0` 时直接返回 `undefined`）。
**成本中**。

### 2.6 D6：SSE 事件头被丢弃——**证伪（08 的该项不成立）**

08 记录「流读取未保留 event 头，部分 provider 靠事件头区分帧类型」。
**实测与阅读后判定：对我们支持的两个协议不构成破坏。**

- `turn/completion.ts:528-533` 与 `anthropicMessages.ts:453-458` **确实只取 `data:` 行**。
- 但：OpenAI `/chat/completions` 的 SSE **根本不发 `event:` 头**（只有 `data:` 与 `[DONE]`）；
  Anthropic 虽发 `event:` 头，但 `data:` 的 JSON **自带 `type` 字段**，而我们的
  `applyEvent` 正是按 `event.type` 分派（`anthropicMessages.ts:485`）。

**故 08 的该项应撤回**。**但同一处发现一个更窄的真实缺陷**（见 §3.1）。

### 2.7 M1：数据驱动的权限规则——**确认，参考实现完整**

**现状**：`grep 'allowRules' packages/ts-shell/src` → **0 生产读取者**。
审批逻辑（`core/shell/approval/evaluator.ts:145-194`）是**硬编码**的只读工具名单
+ 只读 bash 分类器 + 精确字符串信任授权。**无 glob、无正则、无路径前缀、无 deny 规则。**

**参考**（`[VERIFIED]`，Claude Code `utils/permissions/`）：
规则格式 `ToolName` 或 `ToolName(specifier)`（`Bash(npm test:*)`、`FileEdit(/src/**)`、`Read(docs/*)`）；
**优先级严格为 `deny > ask > mode/bypass > allow > 默认 ask`**，deny 永远压过 allow；
交互提示的选项包含「Allow always（写入 allowRules）」「Deny always（写入 denyRules）」。

**设计**：定义 `PermissionRule { behavior: "allow"|"deny"|"ask"; pattern: string }`，
用已有的 `picomatch`（`globMatch.ts` 已依赖）做匹配；
`evaluatePermission` 中 **deny → allow → 既有只读分类器 → 交互 ask** 的顺序求值。
**成本中**，且**与 P0-B 同根**（`allowRules` 已经在配置文件里写好了）。

---

## 3. 本轮新增发现（08 未记录）

### 3.1 Anthropic 流内 `error` 事件被静默丢弃

**`[VERIFIED]`**：`anthropicMessages.ts:480-505` 的 `applyEvent` 只处理
`content_block_start` / `content_block_delta`（以及 `:370-378` 的 `message_*`）。
Anthropic 在流中报错时发 `event: error` + `data: {"type":"error",...}`——
**没有任何分支匹配它，函数返回空片段**。

**后果**：一个 provider 侧的错误（如 `overloaded_error`）表现为
**「零 token 的正常结束」**，而不是失败。这与 `AGENTS.md`
「Do not hide unverified write outcomes behind success-like terminal or session states」
直接冲突——这里是**把失败伪装成空结果**。

**设计**：`applyEvent` 增加 `error` 分支并抛出，让 `turn/step.ts` 的重试/分类逻辑接管。
**成本低**。

### 3.2 工具 schema 与系统提示不计入上下文估算

见 §2.5 末段（实测 2,552 + 301 token）。**成本中**。

### 3.3 `lsp` 声明但从不读取 `line`/`character`

**`[VERIFIED]`**：schema 声明二者为 "1-based"（`lsp.ts:39-46`），
而 `grep 'args.line'` / `args.character` → **0**。

**实测**：`hover` 带 `{line:1, character:1}` 与不带位置**输出逐字节相同**：

```
with line/char : "# Hover Information for `…/grep.ts`\nTarget symbol is part of …"
without        : "# Hover Information for `…/grep.ts`\nTarget symbol is part of …"
IDENTICAL?     : true
```

**性质与 `phase-5-execution.md` §11 记录的「参数被接受、从不读取、却返回结果」同型。**

**系统性扫描（08 未做）**：对 `core/tools/` 全部工具做「声明 vs 读取」比对，
**只有 `lsp` 存在此问题**（`ask.ts` 的 `id` 经 `q.id` 读取，是误报）。
即这是**孤例**，不是模式。

**设计（三选一，见 §4.2）**。

---

## 4. 逐项设计裁决

### 4.1 D12：编辑唯一性——**缺口已精确定位到单条路径**

**08 的描述需要收窄**。实测两条路径行为**不同**：

| 路径 | 输入（两处相同文本） | 行为 |
|---|---|---|
| `replaceInContent`（**默认**，模型实际走的） | 无 `replaceAll` | **`success: true`，只改第一处，无任何提示** |
| `replaceInContent` + `{replaceAll:true}` | — | 两处都改（`strategy: "exact-all"`） |
| `replaceManyInContent`（多段编辑） | 两段命名同一文本 | **`success: false`**，报 `edits[0] and edits[1] overlap` |

**即：多段路径已经会拒绝，只有单段默认路径静默改错位置。**

**参考（两者都拒绝）**：
- pi `edit-diff.ts:328-331`：`const occurrences = countOccurrences(...); if (occurrences > 1) throw getDuplicateError(...)`，
  文案 `Found N occurrences of the text in ${path}. The text must be unique. Please provide more context to make it unique.`
  **无条件拒绝任何重复**。
- Claude Code `FileEditTool.ts:331-343`：`if (matches > 1 && !replace_all)` → 返回
  `behavior:'ask'` 并给出**两条出路**：「设 `replace_all` 替换全部」或「提供更多上下文以唯一定位」。

**设计**：`replaceInContent` 在 `replaceAll` 未设置时，先计数；
**`> 1` 则拒绝**，错误文案照 Claude Code 的写法**同时给出两条出路**
（我们已有 `replaceAll` 参数，正好对应第一条）。
**注意**：多段路径的重叠检查**保留**——它拦的是另一种错误（真正的区域重叠），
两者互补而非重复。**成本低**。

### 4.2 D13：`lsp` 工具——**建议「诚实地缩到它能做到的事」**

**参考的量级**（`[VERIFIED]`）：opencode 有**真正的 LSP 客户端**——
`packages/opencode/src/lsp/` 共 **3,311 行**（`client.ts` 650 / `lsp.ts` 507 /
`server.ts` 1983 / `language.ts` 121 / `diagnostic.ts` 29 / `launch.ts` 21），
用 `vscode-jsonrpc` 的 `createMessageConnection`，注册 **39 个语言服务器**，
服务器缺失时优雅降级为 `undefined`。

**这不是一个小工具，是一个子系统。** 而我们当前是正则扫描。

**四个选项**：

| 方案 | 成本 | 得到什么 |
|---|---|---|
| （a）完整 LSP 客户端 | **高**（3k+ 行 + 依赖 + 每语言服务器探测） | 精确的 definition/references/hover |
| （b）只接一个语言（`typescript-language-server`） | 中 | 对**本仓库自己**精确；对其他语言仍不准 |
| （c）**删掉 `line`/`character`，明确文档化为「符号扫描器」** | **低** | 诚实：不再声称能按位置查询 |
| （d）正则保留作回退 + 有服务器时走 LSP | 高 | 两者兼得，但要先做（a） |

**建议（c）**，理由：
① 当前**没有任何证据**表明按位置的 hover/definition 是真实需求（无用户报告、无失败记录）；
② 保留两个从不读取的参数是**主动误导模型**——它会让模型以为可以精确定位，
   从而在需要精确位置时错误地信任输出（这正是 `lsp.ts` 现状的危害）；
③ （a）（b）是**功能开发**，应作为独立立项，前提是有需求证据——
   与 08 §4.3 对「新协议」的裁决口径一致（`phase-10-decisions.md` §1.1 先例）。

**若未来做（a）**，正确形状是照 opencode：`vscode-jsonrpc` + 服务器探测 + 缺失时降级，
而不是自己实现 JSON-RPC。

### 4.3 D10：子代理不是 agent——**参考实现的机制已确定**

**我们的现状**（`[VERIFIED]`，读全部 233 行）：`taskTool.ts:142` 一次 `fetch` 到
`/chat/completions`，30s abort，**无工具、无循环**。
`SubagentDefinition` 声明 12 个字段，**只读 6 个**——
`tools`、`disallowedTools`、`maxTurns`、`skills`、`effort`、`background` **从不读取**。
worktree **确实被分配并 `squashMerge: true` 释放**，但**没有任何 agent 在里面工作**。

**参考实现**（`[VERIFIED]`，`pi/packages/coding-agent/examples/extensions/subagent/index.ts`）：
pi 的子代理**把自己的 CLI 作为子进程拉起**：

```ts
spawn(invocation.command, invocation.args)          // :346
args = ["--mode","json","-p","--no-session"]
if (model)  args.push("--model", model)
if (agent.tools?.length) args.push("--tools", agent.tools.join(","))   // :307
if (inheritsDispatchConfig && thinkingLevel) args.push("--thinking", thinkingLevel)
```

**即：每个声明字段都流向一个真实的 agent 循环**（因为那是同一个产品进程，
只是以子进程方式启动）。这是「复用整个 agent 实现」而不是「再写一个 agent 框架」。

**设计建议**：**照 pi 的形状——子进程跑我们自己的 CLI**，而不是进程内再起一套循环。
理由：
① **工具集、循环、权限、压缩、记忆全部自动继承**——我们不必把
   `core/agent/loop.ts` 改造成可重入的、带过滤工具集的形态；
② **worktree 隔离天然成立**：子进程的 `cwd` 就是已分配的 worktree，
   而进程内方案要让整个 agent 栈感知一个不同的工作根；
③ **已有的 hook 事件（`WorktreeCreate`/`SubagentStop`）无需改动**；
④ 与 `AGENTS.md` 的「execution is an explicit boundary」一致——
   子进程是既有的执行边界，不需要新概念。

**代价**：进程启动开销（可接受，子代理本来就是长任务）；
以及需要 CLI 暴露 `--tools`/`--model`/`--thinking` 等参数
（检查 `entrypoints/cliArgs.ts` 是否已有——`--mode` 已存在）。
**成本中**。

---

## 5. 更新后的建议顺序

| # | 项 | 级别 | 成本 | 依赖 |
|---|---|---|---|---|
| 1 | **P0-C** 刷新抹掉能力声明 | P0 | 低 | 无 |
| 2 | **§3.1** Anthropic 流内 error 被静默丢弃 | P1 | 低 | 无 |
| 3 | **D12** 编辑唯一性（单段路径） | P1 | 低 | 无 |
| 4 | **D1** 接线 `classifyProviderFailure` | P1 | 低 | 无 |
| 5 | **D4** temperature 按能力门控 | P1 | 低 | 无 |
| 6 | **D2** Anthropic `budget_tokens` | P1 | 低 | **无账号可验** |
| 7 | **D8** 重试 jitter | P2 | 低 | 见 §6 的存疑 |
| 8 | **D7/D9'** token 估算 + 冷启动漏算 | P1 | 中 | 无 |
| 9 | **D10** 子代理改为真 agent | P1 | 中 | 需裁决形态 |
| 10 | **P0-B** `cheers.json`/`settings.json` | P0 | **中** | **需裁决它该是什么** |
| 11 | **D3** `thinkingSignature` | P2 | 中 | 无账号可验 |
| 12 | **M1** 权限规则集 | P2 | 中 | 与 P0-B 同根 |
| 13 | **D9** Doom loop 交替检测 | P2 | 低 | 无 |
| 14 | **D13** `lsp` 参数 | P2 | 低（建议删参数） | 无 |

**前三项都是「低成本的静默错误」**——它们不会报错，只会让用户拿到错误的结果或错误的结论，
这正是本仓库反复强调要消灭的一类。

---

## 6. 本轮未验证 / 存疑（如实记录）

1. **Anthropic `budget_tokens` 的 400（D2）**：**无账号，未端到端验证**。
   依据是 API 契约与 pi 的实现，属 `[INFERENCE]`。
2. **`thinkingSignature` 缺失导致 400（D3）**：同上，`[INFERENCE]`。
3. **OpenAI 推理模型拒绝 temperature（D4）**：同上，`[INFERENCE]`。
4. **CJK/JSON 的 token 误差幅度**：本机**无分词器**（`node_modules` 无
   `tiktoken`/`gpt-tokenizer`），数字来自公开的 BPE 行为，**未在本机实测**。
5. **D8 的 jitter 是否真的需要**：**存疑**。实测我们的策略是
   `maxRetries: 0`（provider 层，**刻意**如此，模块头注释解释了原因）
   + turn 层 3 次。若一个回合**只发一个请求、无并发扇出**，则惊群（thundering herd）
   **不可能发生**，jitter 就是照搬。**建议先确认是否存在并发 provider 请求，再决定是否加**——
   这一条我在本轮**没有查清**，故在建议顺序中列为 P2。
6. **pi 子代理的完整生命周期**：只读了示例扩展的 spawn 部分，
   **未追踪其输出如何流回父级**（`--mode json` 的解析）。
7. **opencode 的 LSP 是否可直接借鉴**：只做了规模与机制清点，**未读其 39 个服务器的注册细节**。
8. **`.agents/settings.json` 与 `cheers.json` 的设计意图**：**未知**——
   无法从代码判断它们是「未实现的 schema」还是「已废弃的草稿」，故 P0-B 需要维护者裁决。
9. **子代理端点故障**：`vsllm/gemini-3.8-flash-api` 本次会话 **6 次派遣中 5 次 TLS 失败**，
   与任务无关。A/B 两路结论由主代理亲自完成。

---

## 7. 验证纪律执行情况

| 要求 | 执行情况 |
|---|---|
| 每条发现附 `file:line` | ✅ 全部 |
| 子代理回报**经主代理逐条核验** | ✅ 证伪 1 项（D6）、更正 1 项（P0-B 的文件结构）、收窄 1 项（D12 只涉及单段路径） |
| 头条结论**实机复现**（非读码推断） | ✅ P0-B / P0-C / D12 / D13 / D7 / D9 / D1 全部 `npx tsx` 实跑 |
| 参考侧结论附具体位置 | ✅ pi / Claude Code / opencode 均给出 `path:line` |
| **零代码改动** | ✅ 仅新增本文档与索引/日志条目 |
| 子代理并发上限 3 | ✅ 全程未超过 3 |

---

## 8. 复核轮（**2026-09-26**）：08 的缺口清单里，哪些从未进入 Phase 11

复核发现一个**记账缺口**：`08-*` §4 的 MISSING(10) + DEFICIENT(14) 共 24 项，
但 `phase-11-decisions.md` §0 的任务表只覆盖了其中 **16 项**（T1–T13 + D1–D3），
**另外 8 项从未被登记为任何任务或裁决点**——不是「决定不做」，是**漏了**。

### 8.1 从未进入 Phase 11 的项（本轮逐条实机核实，全部仍未实现）

| 08 编号 | 项 | 核实命令与结果 | 性质 |
|---|---|---|---|
| **M8** | 压缩后恢复工作文件 | `grep -rn 'POST_COMPACT\|restoreFile\|filesToRestore' packages/ts-shell/src` → **0** | 能力缺失，**可做** |
| **M6** | Copilot / Anthropic 订阅 OAuth | `grep -n 'copilot\|anthropic' core/auth/oauth/providers.ts` → **0**（只有 openai/google） | 能力缺失，**无账号可验** |
| **M3** | OAuth Device Code 流 | `grep -rn 'deviceCode\|device_code' core/auth/oauth/` → **0**（只有 loopback） | 能力缺失，**无账号可验** |
| **D11** | `prepareNextStep` 不能中途改模型/推理档 | `turn/session.ts` 只有压缩用的 `prepareNextStep`，无模型切换 | 能力缺失，**可做** |
| **M4** | Bedrock 协议 | `provider/endpoints/` 只有 `anthropicMessages` + `openaiCompatible` | **无账号可验** |
| **M5** | Google GenAI / Vertex 原生协议 | 同上 | **无账号可验** |
| **T15** | （= M3 的梯队编号） | 同上 | — |
| **T17/D8** | 路由期命名残留 | 属文档卫生，`phase-11-decisions.md` §17 已明确**不纳入施工预算** | 已裁决不做 |

**其中 4 项是「可做但漏登记」**（M8、D11，以及 M6/M3 中不需要账号验证的部分），
**4 项是「无账号/无环境可验」**（M4、M5、M6、M3 的端到端路径）。

### 8.2 这一节要更正的两处记账

1. **`phase-11-decisions.md` §16 标题原写「5 项」，实际列出 6 个小节**——
   D1 的**形状**（§16.6）同样是裁决点，但 §0 任务表把它记成「做」，
   读起来像「D1 已施工」。**实际 D1 未施工**：方向已定（改为真 agent），形状待裁决。
   标题与任务表已同步更正为「6 项」与「待裁决」。
2. **08 §4 的 24 项与 Phase 11 的 16 项之间的差额从未说明**。本节把差额补齐。

### 8.3 结论

Phase 11 完成的是 **08/11 中「已登记为任务」的全部 13 项**；
**不是**「08/11 的全部缺口」。剩余缺口分三类，见主报告。
