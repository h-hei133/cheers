---
title: "Phase 11 裁决"
summary: "Phase 11 收口 08 与 11 的未完成项。13 项施工 + 5 项待维护者裁决。两条贯穿取舍：①「静默错误」优先于「响亮失败」——不报错却给错结果的一类最先修；②参考实现要看清它**在哪一层**——本轮 5 处旧记录正是因为把示例扩展或进程组管理当成了产品设计。"
---

# Phase 11 裁决

> **唯一裁决源。** 施工以此为准；与 `08-*`、`11-*` 冲突时以本文件为准并回写文档。
> 前置研究见 `phase-11-pre-research.md`（证据、`path:line`、实测输出均在其中）。

## 0. 任务表

| # | 任务 | 来源 | 判定 |
|---|---|---|---|
| **T1** | `/model refresh` 抹掉能力声明 | 08 `T3` / P0-C | **做** |
| **T2** | Anthropic 流内 `error` 被静默丢弃 | 11 §3.1 | **做** |
| **T3** | 编辑唯一性（单段路径） | 08 `T4` / D12 | **做** |
| **T4** | 接线 `classifyProviderFailure` | 08 `T6` / D1 | **做** |
| **T5** | `temperature` 按能力与思考状态门控 | 08 `T9` / D4 | **做** |
| **T6** | Anthropic `budget_tokens` | 08 `T6` / D2 | **做** |
| **T7** | Anthropic `thinkingSignature` 捕获与降级 | 08 `T11` / D3 | **做**（**优先级提前**，理由见 §7） |
| **T8** | 重试退避加抖动 | 08 `T7` / D8 | **做**（**理由更正**，见 §8） |
| **T9** | 冷启动漏算（系统提示 + 工具 schema） | 08 `T10` / D9' + 11 §3.2 | **做** |
| **T10** | Doom Loop 循环长度检测 | 08 `T8` / D9 | **做** |
| **T11** | 未变更文件去重 | 08 `T10` / M7 | **做** |
| **T12** | 指令文件 `@import` | 08 `T11` / M9 | **做** |
| **T13** | `lsp` 死参数 | 08 `T14` / D13 | **做**（删参数，见 §14） |
| **D1** | 子代理改为真 agent | 08 `T5` / D10 | **做，但形状要改**（见 §15） |
| **D2** | 数据驱动权限规则 | 08 `T13` / M1 | **待裁决**（哲学冲突，见 §16.1） |
| **D3** | `cheers.json` / `.agents/settings.json` | 08 `T2` / P0-B | **待裁决**（见 §16.2） |
| **D4** | 动态工具装载增量 | 08 `T12` / M10 | **待裁决**（见 §16.3） |
| **D5** | 后台命令执行 | 08 `T14` / M2 | **待裁决**（见 §16.4） |
| ~~**D6**~~ | ~~SSE 事件头~~ | 08 `D6` | **不做**——11 已证伪（OpenAI 不发该头，Anthropic 的 JSON 自带 `type`） |
| **D7** | 死代码处置（`core/workflow/`、`interception.ts`） | 08 `T16` | **待裁决**（`plan.md` §2.1「可达性不授权删除」，见 §16.5） |
| **D8** | 路由期命名残留 | 08 `T17` | **不纳入**——属文档卫生，不占施工预算（见 §17） |

**执行顺序**：见 §18（按「静默错误 → 响亮失败 → 能力补齐」排序）。

---

## 1. 贯穿本阶段的两条取舍

### 1.1 「静默错误」优先于「响亮失败」

本阶段的 13 项施工里，两类缺陷都有：

| 类型 | 例子 | 用户看到什么 |
|---|---|---|
| **静默错误** | T1 抹能力声明、T2 流内 error 被吞、T3 编辑改错位置、T9 漏算上下文 | **一个看起来正常的结果，但是错的** |
| **响亮失败** | T6 缺 `budget_tokens`、T5 temperature 不当 | HTTP 400，报错可见 |

**静默错误优先**，理由是本仓库的既有立场（`AGENTS.md`「不得把失败伪装成成功态」）
与「用户无法通过观察发现」这一事实。**T1/T2/T3 排在最前**，且**都成本低**。

### 1.2 参考实现要看清它**在哪一层**

**本轮 5 处旧记录更正里有 3 处是同一个错误**：把参考项目里**非产品层**的东西当成产品设计。

| 旧记录引用 | 实际是什么 |
|---|---|
| pi 的子代理（11 §4.3 建议照抄） | `examples/extensions/` 里的**示例扩展**，**不在 `core/tools/`** |
| pi 的 `detached`（08 `M2` 当作后台执行对照） | **进程组管理**（`setsid` + `kill(-pid)`），执行仍同步阻塞 |
| pi 的 `resource-loader`（08 `M9` 当作 `@import` 参考） | **根本没有 import 展开**；真正的实现在 gemini-cli |

**据此立一条本阶段的纪律**：引用参考实现时，必须写明它**在哪一层**
（`core/` 产品代码 / `examples/` 示例 / `docs/` 文档），并优先采信 `core/`。
**Claude Code 与 opencode 在子代理、权限两处的实现都比 pi 完整**——
本阶段不再默认「pi 优先」，而是**按问题选参考**。

---

## 2. T1 — `/model refresh` 抹掉能力声明

### 2.1 目标
刷新目录后，内置模型的 `compat`/`promptCache`/`vision` **不得丢失**。

### 2.2 形状：按 id 深合并，而不是整体替换
`dedupeModels`（`catalog.ts:534-537`）的 `byId.set(model.id, model)` 是**整体替换**。
改为：**同 id 时合并**，且**刷新补丁只覆盖它实际携带的字段**。

**关键约束**：合并必须是**浅层字段级**，不是无脑深合并——`compat` 本身是嵌套对象，
若用通用深合并，用户配置里的 `compat` 子字段与内置默认值的合并顺序会变得不可预测。
**采用「内置为底、补丁覆盖」的单向覆盖**，与 `mergeProviders`（`catalog.ts:520-529`）已有的
`{...existing, ...patch}` 语义一致。

### 2.3 改动面

**修正初稿的一处判断**：本文初稿把 `catalogRefresh.ts` 的窄投影也列为「要改」。
**读完 `:77-84` 的注释后，这个判断是错的**——投影**故意**只保留它能负责的字段：

> 「Only the fields we can act on are kept — id, label, models, key variable, prices —
> and **the request shape is left alone**: the index describes providers, not how this shell
> talks to them, and **guessing that from a string would break a connection that already works**.」

**这个注释是对的**：从索引字符串猜 `compat` 会**破坏已经能用的连接**。
**所以投影不该改**——问题不在「投影太窄」，而在**下游把补丁当成了完整模型**。

| 位置 | 改动 |
|---|---|
| `core/models/catalog.ts` `dedupeModels` | **唯一要改的地方**：同 id 时**以既有模型为底、补丁只覆盖它携带的字段**，而不是 `Map.set` 整体替换 |

**这正好解释了这个 bug 的成因**：投影**有意**不猜 `compat`（补丁里没有 `compat`），
而 `dedupeModels` 又把补丁**整体替换**掉内置模型（内置模型**有** `compat`）——
**两个各自都合理的设计，合起来把 `compat` 抹掉了**。

### 2.4 验证
**必须钉住的行为**：内置模型（有 `compat`/`vision`）被刷新补丁覆盖后，
`resolveRequestShape` 的输出**与刷新前一致**。
**回归测试**：刷新前记 `{systemRole, maxTokensField, vision}`，刷新后逐字段比对。
**该测试在修复前必须失败**（11 §1.3 已实测当前输出为 `system`/`max_tokens`/`false`）。

### 2.5 风险
低。`dedupeModels` 是纯函数，无 I/O。注意**用户自定义模型仍应覆盖内置**
（`mergeProviders` 的 `custom: true` 路径），不要因为合并把用户的覆盖吃掉。

---

## 3. T2 — Anthropic 流内 `error` 被静默丢弃

### 3.1 目标
流中途到达的 `error` 事件**必须成为失败**，不得表现为「零 token 的正常结束」。

### 3.2 实测现状
`anthropicMessages.ts:480-505` 的 `applyEvent` 只匹配 `content_block_start`/`content_block_delta`
（`message_*` 在 `:370-378`），**无 `error` 分支**，返回空 `fragments`。
调用方看到「没有增量」，于是按正常结束处理。

### 3.3 形状：照 pi 抛异常（**并修正初稿对改动面的低估**）

pi（`anthropic-messages.ts:480-482`）：
```ts
for await (const sse of iterateSseMessages(response.body, signal)) {
    if (sse.event === "error") {
        throw new Error(sse.data);
    }
```
pi 还有一道**同类的兜底**（`:503-506`）：
```ts
if (sawMessageStart && !sawMessageEnd) {
    throw new Error("Anthropic stream ended before message_stop");
}
```
**这两条都要照做**：前者处理「服务端明确报错」，后者处理「流被截断但没报错」。

**主代理复核时发现我们的问题比初稿写的更重。** 我们的流循环（`anthropicMessages.ts:383-396`）在
迭代器抛错时**吞掉异常并 `break`**：

```ts
try {
  chunk = await iterator.next();
} catch {
  // A stream that fails mid-answer keeps what it already said, which is the
  // part the user has already read. […]
  for (const fragment of drain().fragments) yield fragment;
  break;
}
```

**注释的理由（保留用户已读到的部分）是善意的，但实现把它变成了「静默成功」**：
连接中断后函数**正常返回**一个 assistant 消息，`finishReason` **可能为 undefined**，
调用方**无从知道这次回答是残缺的**。

**所以 T2 的范围包含三件事，不是一件**：
1. `event: error` → 抛错；
2. 流在 `message_stop` 前结束 → 抛错（我们**当前根本不追踪 `message_stop`**，
   主代理已确认：`grep message_stop` 在流循环里无命中）；
3. **迭代器异常** → **不再无条件吞掉**。
   保留已产出文本**是对的**（用户确实读到了），但**必须同时标记这次回答为失败/不完整**，
   而不是让它看起来像正常结束。

**第 3 条与第 1、2 条是同一个缺陷的三种入口**——初稿只写了第 1 条。

### 3.4 改动面
`provider/endpoints/anthropicMessages.ts` 的流迭代处。需要区分 `sse.event === "error"`
（SSE 层错误）与 `event.type === "error"`（JSON 层错误）——**两者都处理**。

### 3.5 验证
**回归测试**：构造一个流，在 `content_block_delta` 之间插入一个 `error` 事件，
断言调用方**得到失败**（而非空结果）。当前实现会通过「无增量」路径静默成功。
**另测**：流在 `message_start` 后直接结束（无 `message_stop`），断言失败。

### 3.6 风险
低，但**要注意不要把 provider 的正常 `stop_reason: "error"` 误判**——
Anthropic 的 `message_delta` 会带 `stop_reason`，pi 用 `mapStopReason` 映射
（`:1502-1527`，`refusal`/`sensitive` → `error`）。我们应核对 `stop_reason` 是否已被读取，
**不要重复造一条平行的判定**。

---

## 4. T3 — 编辑唯一性（单段路径）

### 4.1 目标
`replaceInContent` 在文本出现多次且未设 `replaceAll` 时**必须拒绝**，而不是静默改第一处。

### 4.2 实测现状（已复现）
```
success: true  strategy: exact
alpha changed: true    beta also changed: false    occurrences changed: 1
```

### 4.3 形状：拒绝 + 给两条出路（照 Claude Code）
pi 是**无条件抛异常**（`edit-diff.ts:328-331`），文案只给一条出路（「提供更多上下文」）。
Claude Code（`FileEditTool.ts:331-343`）在 `matches > 1 && !replace_all` 时返回 `behavior:'ask'`，
**同时给出两条出路**：「设 `replace_all`」或「提供更多上下文」。

**采用 Claude Code 的文案形状**，因为**我们已有 `replaceAll` 参数**（`registry.ts:509`），
正好对应第一条出路——让模型有可执行的下一步，而不是只被告知失败。

**多段路径的重叠检查保留**（`editEngine.ts:262-274`）：它拦的是**真正的区域重叠**，
与「文本重复」是两种不同的错误，**互补而非重复**。

### 4.4 改动面
`core/tools/editEngine.ts` 的 `replaceInContent`；错误文案与 `registry.ts` 的 `replaceAll` 参数对齐。

### 4.5 验证
**回归测试**（修复前必须失败）：
- 文本出现 2 次、不传 `replaceAll` → **拒绝**，且错误信息**同时提到** `replaceAll` 与「更多上下文」；
- 文本出现 2 次、传 `replaceAll: true` → **两处都改**（既有行为，不得回归）；
- 文本出现 1 次、不传 `replaceAll` → 正常成功；
- 文本**不出现** → 仍是既有的「找不到」错误（不得被新检查掩盖）。

### 4.6 风险
**这是本阶段唯一会改变模型可见行为的工具契约**。
风险是**过度拒绝**：某些真实编辑确实只想改第一处。
**规避**：错误信息必须明确给出 `replaceAll` 这条出路；且**只在 `> 1` 时拒绝**，
出现 1 次或 0 次的行为**完全不变**。

---

## 5. T4 — 接线 `classifyProviderFailure`

### 5.1 目标
provider 失败在用户可见处**按类别区分**，而不是全压成 `Provider HTTP <n>`。

### 5.2 形状：**pi 有两层重试，不是一层「分类与策略分离」**

**更正初稿的一处混淆**（复核子代理 `V2Provider` 提出，主代理已核对原文）：
本文初稿把 `utils/retry.ts` 与 `provider-retry.ts` 说成是 pi 对「分类 vs 策略」的一处拆分。
**它们其实是两个不同架构层的重试**，输入类型都不同：

| 层 | 文件 | 输入 | 能看到的 |
|---|---|---|---|
| **HTTP 层** | `provider-retry.ts` | `ProviderError`（`:9-12` 有 `status` + `headers`） | HTTP 状态、`x-should-retry`、`retry-after-ms` |
| **回合层** | `utils/retry.ts` | `AssistantMessage`（`:1` 导入） | 已完成的失败**文本**（`:237-242` 用正则） |

**这个区分对本项有直接后果**：`x-should-retry`（HTTP 头）**只在 HTTP 层可得**。
我方的接线点 `turn/step.ts:307-330` 是**回合层**——
那里**拿不到响应头**（除了已经被 `serverRequestedDelayMs` 显式读出的 `retry-after`）。
**所以「服务端一票否决」这一条，我方在回合层接不了**，除非把该头一路传上来。
**裁决：不为此新增传递通道。** 理由——`AGENTS.md` 要求不新增无法验证的表面，
而 `x-should-retry` 是**特定网关的私有头**，我们无账号验证它是否真被发送。

**本项实际照搬的是「分类」这一件事**，两个层的判据都可借鉴：
1. **不可重试的配额耗尽**（回合层，`utils/retry.ts:7-22`，用文本正则）：
   `GoUsageLimitError|FreeUsageLimitError|Monthly usage limit reached|available balance|insufficient_quota|out of budget|quota exceeded|billing`；
2. **可重试的传输抖动**（HTTP 层，`provider-retry.ts:23-36`）：408/409/429/≥500。

**注意我们**已有**这两类判据**（`core/agent/retry.ts` 的 `RETRYABLE_FAILURE` 与
`UNRECOVERABLE_FAILURE` 正则），且注释写明「先查不可恢复的，因为一条消息可能同时带限额与状态码」。
**所以本项不是「从零加分类」，而是「把已有的分类结果暴露到用户可见处」**——
`classifyProviderFailure`（`provider.ts:240-272`）已经能给出 18 类，只是**没有读者**。

**我们的接线方式**：`turn/step.ts:307-330` 构造 `refusal` 文本时**同时调用分类器**，
把类别并入失败记录（而不是替换既有文案——既有文案含服务端原文，是排障依据）。

### 5.3 改动面
`turn/step.ts:307-330`；`provider.ts` 的分类器**不改**（它是既有契约）。

### 5.4 验证
**回归测试**：401/403 → `provider_auth`；429 → `provider_rate_limited`；
含 `content_filter` 的消息 → `provider_safety_block`；500 → 端点类。
**断言的是「类别被记录」**，不是文案逐字——文案含服务端原文，不适合钉死。

### 5.5 风险
低。**注意 `provider.ts` 的分类器已接受 `{status, message}`**，无需改签名。

---

## 6. T5 — `temperature` 按能力与思考状态门控

### 6.1 目标
不该发 `temperature` 时**不发**。

### 6.2 形状：照 pi 的三个条件
pi（`anthropic-messages.ts:1113-1120`）：
```ts
// Temperature is incompatible with extended thinking and unsupported on Claude Opus 4.7+.
if (options?.temperature !== undefined &&
    !options?.thinkingEnabled &&
    model.compat?.supportsMidConvoEffort !== true &&
    compat.supportsTemperature) {
    params.temperature = options.temperature;
}
```
**注意第二、三条**：不只是「按模型能力门控」——**开启思考时也必须省略**。

**更正一处对 11 的不实指摘**：本文初稿写「11 §2.4 只提了 `supportsTemperature`，漏了 `thinkingEnabled`」。
**复核原文后，这个指摘是错的**——11 §2.4 **原文就带了** `!options?.thinkingEnabled`
并明确写了「推理模式下即使模型支持也应省略」。**撤回该指摘。**
（教训：核对旧记录时**要读原文**，不能凭记忆断言它漏了什么。）

### 6.3 改动面
1. `core/models/requestShape.ts` 增加 temperature 维度（**当前没有**）；
2. `provider/endpoints/openaiCompatible.ts:60` 改为条件展开（与同文件
   `reasoning_effort` 的 `...(cond ? {...} : {})` 写法一致）；
3. `turn/step.ts:231` 的 `?? 0.7` 默认值**保留**，但受门控约束。

### 6.4 验证
**回归测试**：模型声明 `supportsTemperature: false` → 请求体**无** `temperature` 键；
`thinkingEnabled: true` → **无** `temperature`；两者都不触发 → **有** `temperature`。
**`[INFERENCE]`**：真实 400 无账号不可验，测试断言的是**请求体形状**。

### 6.5 风险
低。**但这是行为变更**：此前所有请求都带 `temperature`，改后部分请求不带——
模型输出会变化。**属预期**（这正是修复目的）。

---

## 7. T7 — Anthropic `thinkingSignature`（**优先级提前**）

### 7.1 为什么提前到第 7 位
**11 §5 把它列为 P2（第 11 位），理由只是「无账号可验」。这个排序低估了它的危害。**

子代理 `S5Provider` 的收尾判断（主代理认同并复核）：
> 其余四项（缺 `budget_tokens`、temperature 不当、流内错误未处理）都会**响亮报错**；
> 而签名处理错误会让**被中断的思考内容静默变成用户可见的正文**，或整块丢失，**不抛任何错**。

**即：它属于 §1.1 定义的「静默错误」，且比 T6/T5 严重**——它污染的是**对话内容本身**。
**故提前到静默错误组内**（T1/T2/T3 之后）。

### 7.2 形状：**两个半块 + 一个模型能力开关**（照 pi）
**只做捕获不做降级，或只做降级不做捕获，都是错的**：
1. **捕获**：`content_block_start` 取 `signature`（pi `:646`），
   `signature_delta` 累加（pi `:715-719`）；
2. **回传 + 无签名降级**（pi `:1337-1362`）：有签名发
   `{type:"thinking", thinking, signature}`；**无签名降级为 `{type:"text", text}`**。
   pi 的注释写明原因：`e.g. from aborted stream`。
3. **模型能力开关 `allowEmptySignature`**（pi `:215` 默认 `false`，`:1345` 使用）：
   部分兼容 provider **能接受空签名**，此时 pi **保留 `thinking` 块**（发 `signature: ""`）
   而不是降级为 `text`。**这是「两半」之外的第三个元素**——主代理复核时补上，
   11 §2.3 与本文初稿**都只写了前两个**。

**关于 `block_binding`（复核子代理 `V2Provider` 提出，主代理核对后归位）**：
pi 还有 `block_binding: { prefix_mismatch_behavior: "drop_block" }`（`:1165`），
注释说明用途是「签名前缀不匹配时**丢弃该块**而不是让 400 持续出现」。
**但它不在签名路径上**——它只出现在 `supportsMidConvoEffort` 的 **adaptive 分支**内，
受 `THINKING_BINDING_CONTROLS_BETA` 门控（`:185`）。
**故它属于 T6（adaptive/budget 分支）的范畴，不是 T7 的。**
**裁决：本轮不引入 `block_binding`**——它是**beta 门控的私有行为**，
我们**无账号可验**，与 §16.1 对 `x-should-retry` 的处置口径一致（不新增无法验证的表面）。
**记录在此，避免将来误以为遗漏。**

**我们三样都没有**（`grep -c signature anthropicMessages.ts` → 0）。

**改动面因此多一处**：`core/models/catalog.ts` 的模型 `compat` 需要 `allowEmptySignature`
（默认 `false`，与我们 `compat` 的既有「显式声明才生效」风格一致）。

### 7.3 改动面
`provider/endpoints/anthropicMessages.ts`：流事件处理（捕获）+ 下一轮请求的消息构造（回传/降级）。

### 7.4 验证
**回归测试**：
- 流含 `signature_delta` → 下一轮请求的 thinking 块**带** `signature`；
- 流**无**签名（模拟中断）→ 下一轮该块降级为 `text` 类型，**不是**无签名的 `thinking`；
- **断言请求体形状**（无账号，不能端到端）。

### 7.5 风险
中。**这是本阶段改动面最大的一项**——它同时触及流解析与请求构造两侧。
`[INFERENCE]`：真实 400 未验证，依据是 API 契约与 pi 的实现。

---

## 8. T8 — 重试退避加抖动（**理由更正**）

### 8.1 11 的存疑理由不成立
11 §6.5 说：「若一个回合**只发一个请求、无并发扇出**，则惊群**不可能发生**，jitter 就是照搬」。

**这个推理方向错了**：惊群指**多个独立进程**在服务端故障后**同时**重试，
不是单进程内的并发。我们的 CLI 是**每个用户一个进程**，固定退避意味着
**所有客户端在同一毫秒醒来**——这正是 jitter 要打散的东西。

**主代理已查清 11 未查的那一问**（是否存在进程内并发 provider 请求）：
- `core/agent/tools.ts:377` 确有 `Promise.all` 并行工具批次；
- **但** `:196-200` 的 `forcedSequential` **按批次**判定——批次里**有任何一个** `executionMode: "sequential"`
  的工具，**整批串行**；`SEQUENTIAL_TOOLS` 含 `bash`/`write`/`edit`/`task`/`browser`（`turn/session.ts:128`），
  **`task` 在其中**；
- `retryDelayMs` 只被 `turn/step.ts:334` 与 `core/agent/loop.ts:138` 调用，
  而并行网络工具（`web_fetch`/`web_search`）**不走 provider 重试路径**。
- **结论：进程内 provider 请求是串行的；jitter 的价值在跨进程。**

### 8.2 形状：照 pi 的系数
pi（`provider-retry.ts:66`）：
```ts
const exponentialDelay = Math.min(0.5 * 2 ** retryIndex, 8) * 1000;
return exponentialDelay * (1 - Math.random() * 0.25);
```
**只改本地计算的那条路径**。`requestedDelayMs`（服务端 `Retry-After`）**不加抖动**——
服务端给的数字是**指令**，抖动它就是不听话。

### 8.3 改动面
`core/agent/retry.ts` 的 `retryDelayMs`。

### 8.4 验证
**回归测试**：
- 服务端 `Retry-After` 存在 → 返回值**精确等于**该值（**不受抖动影响**）；
- 无服务端提示 → 返回值落在 `[base, base]` 的 75%–100% 区间内；
- 多次调用**不全相等**（证明抖动生效）。
**注意**：抖动使该函数**非确定性**，测试必须断言**区间**而非定值——
既有测试若钉死了 `2000/4000/8000`，**必须改为区间**（这属于「现有测试钉住了实现细节」，
按 `AGENTS.md` 应删除或改写，不是重新钉死）。

### 8.5 风险
低。**但收益在单机下不可观测**——如实记录，不夸大。

---

## 9. T9 — 冷启动漏算（系统提示 + 工具 schema）

### 9.1 目标
上下文核算**包含**系统提示与工具 schema，不只是 `messages`。

### 9.2 实测现状（主代理实机测得）
```
tools: 13   wireChars: 8933   estTokens(tools): 2553
promptChars: 1129            estTokens(prompt): 323
messagesOnly est: 1
```
**约 2,876 token 完全不计入**。根因：两者在 `openaiCompatible.ts:47` 是**独立参数**，
而 `estimateTokens(messages)` 只看 `messages`。

**另一处**：`cliSessionRuntimeFactory.ts:152-155` 的
`usage.lastPromptTokens + estimateTokens(messages.slice(usage.lastPromptMessageCount))`
在 `lastPromptTokens <= 0` 时**整个退回估算**，而退回路径**不含**系统提示与工具。

### 9.3 形状：**不照抄 pi 的结构**，只补计数
pi 把系统提示与工具**作为 `SystemMessage` 存进 transcript**（`session-manager.ts:80-85`），
于是天然被算进去。**这个结构改动太大**——我们的系统提示是**每轮构造**的
（`turn/prompt.ts:62-77`），不是会话状态。

**采用最小改动**：让估算函数**接受**系统提示与工具作为**额外入参**，
在 `measureContextTokens` 与压缩阈值判定处**传入**。

**同时修正 `CHARS_PER_TOKEN` 吗？**
**不**。pi 也是扁平除法（`estimate.ts:38-40`，常数 4）。**我们 3.5 vs pi 4 的差异不构成缺陷**，
而改动它会**无依据地改变压缩时机**。**本轮只补漏算，不动常数**——如实记录这一取舍。

### 9.4 改动面
| 位置 | 改动 |
|---|---|
| `session/context.ts` | 估算函数接受额外入参（系统提示字符数、工具 schema 字符数） |
| `cli/runtime/cliSessionRuntimeFactory.ts:152` | 传入两者 |
| `session/compaction.ts:328,348` | 阈值判定处同样传入 |

### 9.5 验证
**回归测试**：给定同样的 `messages`，**传入**系统提示与工具后估算值**必须更大**，
且增量约等于 `(promptChars + toolsChars) / 3.5`。
**修复前该断言失败**（当前增量恒为 0）。
**另测**：`lastPromptTokens > 0` 时**仍优先用真实计数**（不得因为补漏算而丢掉锚点）。

### 9.6 风险
中。**压缩会来得更早**（核算值变大），这是**预期**——此前是**低估**导致压缩偏晚。
**但这会改变用户可观测的压缩时机**，属行为变更，需在文档中写明。

---

## 10. T10 — Doom Loop 循环长度检测

### 10.1 形状：照 gemini-cli 的 k=1..5 滑动比对
**不是照 pi**（pi 没有此检测器，见前置研究 §1 C4）。
gemini-cli（`loopDetectionService.ts:312-347`）按**循环长度 k** 逐一比对，阈值 `R = 5`：
```ts
for (let k = 1; k <= 5; k++) {
  const requiredLength = k * R;
  if (n >= requiredLength) {
    const cycle = this.toolCallHistory.slice(-k);
    for (let i = 0; i < requiredLength; i++) {
      if (this.toolCallHistory[n - (requiredLength - i)] !== cycle[i % k]) { isPatternMatch = false; break; }
    }
    if (isPatternMatch) return true;
  }
}
```
**k=1 即覆盖我们现有的连续检测**，故这是**严格超集**，可以**替换**而非并存。

### 10.2 阈值必须**按循环长度分档**（主代理实测后发现，**本条经自我更正**）

**初稿写的是「保留 R=3、K=5」，即对所有 k 用同一个阈值。这个写法是错的**——
主代理在写完后用 `npx tsx` 模拟两种算法，实测：

| 历史 | R=3 统一 | R=5 统一 |
|---|---|---|
| `A A A`（k=1） | 触发 | **不触发** |
| `read edit` ×3（6 次调用，**完全正常的真实工作**） | **触发**（k=2） | 不触发 |
| `grep edit bash` ×3（9 次调用） | **触发**（k=3） | 不触发 |

**`read → edit → read → edit → read → edit` 是极常见的正常节奏**。
统一 R=3 会把它判成死循环——**这是不可接受的误报**，而且**比现状更糟**
（现状只查 k=1，不会误报这种）。

**正确写法：按 k 分档。**
- **k = 1**（连续同一调用）：**R = 3**，**保持我们既有行为**；
- **k ≥ 2**（交替循环）：**R = 5**，**照 gemini-cli**。

**这仍然是既有行为的严格超集**（已实测）：k=1 的判定与现状**逐例相同**
（`A A A`/`A A A A`/`A A A A A` 全部仍触发），k≥2 是**新增**能力。
且 `read/edit` ×3 在分档后**不再误报**，×5（10 次调用）才触发——**这才是「卡住」的样子**。

**参数化为 `(R1 = 3, Rk = 5, K = 5)`**，三项都要有名字，不要写成单个阈值。

**这是对 gemini-cli 的一处刻意偏离，必须写明**：主代理复核原文确认，
gemini-cli 用的是**单一阈值** `const R = TOOL_CALL_LOOP_THRESHOLD; // 5`，
对 k=1..5 **一视同仁**（`loopDetectionService.ts:322-324`）。
**我们偏离的理由是**：我们的 k=1 阈值**已经是 3**（`doomLoopDetector.ts:18` 构造默认），
若为了对齐 gemini-cli 把它**放宽到 5**，就等于**削弱一个既有的、有效的保护**
（连续 3 次相同调用正是最该拦的情况）。**所以分档不是「我们比 gemini-cli 好」，
而是「我们的既有阈值与它的不同，两个都要保住」**——保 k=1 的严格性，同时新增 k≥2 的能力。

### 10.3 改动面
`core/query/doomLoopDetector.ts` 的 `recordAndCheck`。**历史裁剪长度要跟着调**——
当前 `maxHistorySize = 50`，需 ≥ `K * Rk = 25`，**50 已足够**，不改。

### 10.4 验证
**回归测试**（修复前必须失败）：
- `A B A B`（k=2，**2 轮**）→ **不触发**（未达 Rk=5；防止把正常节奏误判）；
- `A B A B A B A B A B`（k=2，**5 轮**）→ **触发**（当前**不触发**，已实测）；
- `A A A`（k=1，3 次）→ **仍触发**（**既有行为不得回归**，这是分档的关键约束）；
- `A B C A B C A B C A B C A B C A B C`（k=3，5 轮）→ 触发；
- `A B C D E F`（无重复）→ **不触发**（防误报）；
- **`read edit read edit read edit`（k=2，3 轮）→ 不触发**（**这是最重要的反例**，
  初稿的统一 R=3 会让它触发，见 §10.2）。

### 10.5 风险
**误报是主要风险，且初稿的设计会放大它**（见 §10.2 的实测）。

**更正一处对 gemini-cli 的不实描述**（复核子代理 `V3Tools` 发现，主代理已核对原文）：
本文初稿写「gemini-cli 只在**参数与结果实质相同**时才算循环，我们拿不到结果，故比它更容易误报」。
**这是错的。** 实测 `getToolCallKey`（`loopDetectionService.ts:174-177`）：
```ts
const argsString = JSON.stringify(toolCall.args);
const keyString = `${toolCall.name}:${argsString}`;
return createHash('sha256').update(keyString).digest('hex');
```
**只哈希 `name` + `args`，从不记录工具结果**；`checkToolCallLoop` 在**执行前**判定
（`:313-338`），它**同样不知道结果**。
**所以「结果相同」这一半 gemini-cli 也没有——我们在这一点上与它完全对等，不存在「更容易误报」的差距。**
（它文档里那句「参数与结果实质相同」是**给 LLM 双检模型的提示词措辞**（`:77-78`），
描述的是那个语义检查器的判据，**不是** `checkToolCallLoop` 的机械判据。我把两者混为一谈了。）

**真正的误报风险只剩两条，都在我们这边可控**：
① **阈值分档**（§10.2，这是主要防线）；
② `argsHash` 用**完整参数**而非截断。

**另需如实记录 gemini-cli 有、我们没有的一层**：它还有一个 **LLM 双检**
（`LLM_LOOP_CHECK_HISTORY_COUNT = 20`、`LLM_CHECK_AFTER_TURNS = 30`、
`LLM_CONFIDENCE_THRESHOLD = 0.9`），在机械判据触发后用模型确认「是否真的零进展」。
**我们不引入这一层**（需额外模型调用），故**我们的机械判据必须更保守**——
这正是 §10.2 分档的另一个理由。

---

## 11. T11 — 未变更文件去重

### 11.1 形状：照 Claude Code 的五条件 + `offset: undefined` 技巧
1. **五条件同时成立**（`FileReadTool.ts:536-570`）：killswitch 关闭、有状态条目、
   `!isPartialView && offset !== undefined`、`offset` 与 `limit` **都相同**、`mtimeMs === timestamp`；
2. **失效机制**：Edit/Write 写入 `offset: undefined`（`FileEditTool.ts:520-523`），
   而触发条件要求 `offset !== undefined`——**一个字段同时表达「缓存的是读取视图」与「别信它」**；
3. **清空点**：`/clear`、压缩、子代理拆除。

### 11.2 我们的落地
- 状态：**每个会话一个 `Map<absolutePath, {offset, limit, mtimeMs}>`**，
  存在会话运行时（**不进 transcript**——它是**缓存**，不是对话事实）；
- **必须用绝对路径做键**（照 Claude Code 的 `expandPath` 归一化），
  否则相对路径与绝对路径会各存一份；
- 压缩与 `/clear` 时**清空**。

### 11.3 改动面
`core/tools/` 的 read 工具 + 一个状态持有者（建议放在 read 工具所属的域内，**不要新建顶层模块**）。

### 11.4 验证
**回归测试**：
- 读同一文件的同一范围两次，**文件未变** → 第二次返回**桩文本**；
- **改动文件**后再读同一范围 → **返回真实内容**（不得返回桩）；
- 读**不同范围** → 返回真实内容；
- **编辑后**再读**同一范围** → 返回真实内容（`offset: undefined` 生效）；
- 压缩后 → 缓存已清空。

### 11.5 风险
**桩文本会让模型看不到内容**——若条件判断过宽，模型会**拿不到它需要的内容**。
**这是本项最大的风险**。规避：**五条件一个都不能省**，尤其 `mtimeMs` 相等
（这是「文件真的没变」的唯一硬证据）。

---

## 12. T12 — 指令文件 `@import`

### 12.1 形状：照 gemini-cli（**不是 pi**，见前置研究 §1 C3）
1. **手扫而非正则**（`findImports`，`memoryImportProcessor.ts:100-155`）：
   逐个 `indexOf('@')`，要求**前一字符是空白**（词边界），路径首字符为 `.`/`/`/字母；
2. **跳过代码块**（`findCodeRegions`，`:169-175`）——**这条必须有**，
   否则文档里写的示例路径会被当真导入；
3. **`maxDepth: 5`**（`:196`）+ **循环导入检测**（`processedFiles`）；
4. **包含性校验**（`validateImportPath`，`:390-421`）——**不许跳出项目根**。
   主代理读全该函数后确认，它比「前缀比较」严格得多：
   - **拒绝 URL**（`:396` `if (/^(file|https?):\/\//.test(importPath)) return false;`）；
   - **解析符号链接后再比较**（`:403` `resolveToRealPath(path.resolve(basePath, importPath))`）——
     否则 `@./link-to-outside.md` 可绕过；
   - **解析失败即拒绝**（`:404-407` `catch { return false; }`，注释写明 `fail-closed`）；
   - 最终用 `isSubpath(allowedDir, resolvedPath)` 判定（`:419-421`）。

   **两处要澄清（复核子代理 `V3Tools` 提出，主代理已核对）**：
   ① **包含性的基准是「项目根」，不是「当前文件所在目录」**——
      相对路径按 `path.resolve(fileBasePath, importPath)` 解析（`:270`），
      所以**子目录里的 `@../sibling.md` 是合法的**，只要最终仍在项目根内。
      **我们实现时必须照这个语义**，否则会拒绝合法用法。
   ② **拒绝是静默的**——`validateImportPath` 返回 `false` 时，调用方
      `if (!validateImportPath(...)) { continue; }`（`:266-271`）**直接跳过，不报错**。
      **这一点我们不照抄**：被拒绝的导入**必须告警**（理由见 §12.2），
      否则用户写了 `@../../outside.md` 会**以为它生效了**——这正是本仓库要消灭的静默失效。

5. 失败**不中断**（`:288-295` 只 warn）。

### 12.2 我们的落地
在 `context/instructions/projectInstructions.ts` 的读取路径后加一层展开。
**注意 `AGENTS.md` 的要求**：这一层**不能**让指令文件读到自己以外的敏感文件——
**包含性校验是安全边界，不是可选优化**。

### 12.3 改动面
`context/instructions/` 域内新增展开逻辑（**不要塞进 `projectInstructions.ts`**——
它已有既有职责，且 `AGENTS.md` 规则 3 有 20 函数上限）。

### 12.4 验证
**回归测试**：
- `@./other.md` → 内容被展开；
- `@` 在**代码块内** → **不展开**（这是最容易错的用例）；
- **超过 5 层** → 停止展开并告警；
- **循环导入**（A 引 B、B 引 A）→ 不死循环；
- `@../../outside.md`（跳出项目根）→ **拒绝，且必须告警**（不得静默跳过）；
- **`@../sibling.md`（子目录引用同级，仍在项目根内）→ 允许**（基准是项目根，不是当前目录）；
- **`@./link-to-outside.md`（指向外部的符号链接）→ 拒绝**（`resolveToRealPath` 那一条）；
- **`@https://example.com/x.md`（URL）→ 拒绝**；
- 引用的文件不存在 → 告警但**继续**（不得中断整个指令加载）。

### 12.5 风险
中。**文件读取面的安全**：包含性校验必须与 T11 同一标准。
**不引入新依赖**（gemini-cli 也是手写扫描，无需库）。

---

## 13. D7（文档卫生）—— 不纳入施工

08 `T17`（路由期命名残留）：属**文档卫生**，不占施工预算。
**理由**：它与 `AGENTS.md` 的「除非显式历史或兼容」条款存在解释空间，
且**不改代码行为**。**记录为独立项**，由维护者按需处理。

---

## 14. T13 — `lsp` 死参数

### 14.1 形状：删参数，并诚实文档化（11 的方案 (c)）
- **删** `line`/`character`（`lsp.ts:39-46`）；
- 工具描述改为**明确说明它是符号级扫描**，**不声称能按位置查询**。

### 14.2 理由
① **无任何证据**表明按位置的 hover/definition 是真实需求（无用户报告、无失败记录）；
② 保留两个**从不读取**的参数是**主动误导模型**——它会让模型以为可以精确定位，
   从而在需要精确位置时**错误地信任输出**（这正是现状的危害）；
③ 完整 LSP 客户端（opencode 是 **3,311 行 + 39 个语言服务器**）是**独立立项**，
   前提是有需求证据——与 08 §4.3 对「新协议」的口径一致（`phase-10-decisions.md` §1.1 先例）。

### 14.3 验证
**回归测试**：schema 中**不再有** `line`/`character`；
传 `line`/`character` **不再被静默接受**（多余参数应被拒绝或明确忽略并告警）。
**若未来做完整 LSP**，正确形状是照 opencode：`vscode-jsonrpc` + 服务器探测 + 缺失时降级，
**不是自己实现 JSON-RPC**。

### 14.4 风险
低。**但属对外契约变更**（schema 收窄），需在文档与变更记录中写明。

---

## 15. D1 — 子代理改为真 agent（**形状要改**）

### 15.1 11 的建议要修正
11 §4.3 建议「照 pi 的形状——子进程跑我们自己的 CLI」，理由是「复用整个 agent 实现」。
**这个理由本身成立**，但 11 把 pi 的**示例扩展**当成了 pi 的产品设计（见前置研究 §1 C1）。

**三个参考的真实分布**：
| 项目 | 机制 | 层 |
|---|---|---|
| **Claude Code** | **进程内** `query()` 循环 + worktree 隔离 + `SubagentStart`/`SubagentStop` | `tools/AgentTool/` **产品代码** |
| **opencode** | **进程内** Effect fiber + 子会话 | `src/tool/task.ts` **产品代码** |
| **pi** | 子进程跑自己的 CLI | `examples/extensions/` **示例** |

**三个里两个是进程内**，且 **Claude Code 是最完整的实现**（worktree 隔离 + 生命周期钩子 + 后台化 + 嵌套进度转发）。

### 15.2 两个候选形状

**方案 A（进程内，照 Claude Code）**
- 复用我们的 `AgentCore`（`core/agent/loop.ts`），用**过滤后的工具集**构造子会话；
- worktree 作为子会话的工作根；
- **优点**：无进程启动开销；工具/权限/压缩**在进程内直接可用**；与既有 hook 事件天然衔接。
- **代价**：需让 `AgentCore` 支持**可重入 + 工具集参数化**；需让工具栈感知**不同的工作根**。

**方案 B（子进程，照 pi）**
- 子进程跑我们自己的 CLI，worktree 作为 `cwd`；
- **优点**：工具集/循环/权限/压缩/记忆**全部自动继承**，不需要改造 `AgentCore`；
  进程边界本身就是隔离边界（与 `AGENTS.md`「execution is an explicit boundary」一致）。
- **代价**：**我们 CLI 缺少所需参数**——`--model`/`--mode`/`--thinking`/`--append-system-prompt`
  **全部为 0 命中**（主代理已查），要先补这套参数面；
  另有进程启动开销（子代理本就是长任务，可接受）。
- **有利条件**：`--json` 已存在（`cliArgs.ts:240`），`presentation/terminal/jsonEvents.ts` 的
  `run-event-stream.v1` **逐行 JSON 事件流已经就绪**——**父进程解析面不用新造**。

### 15.3 裁决倾向

**先自我更正一处推理**：本文初稿把「pi 的子代理只是示例扩展」当作**反对方案 B 的理由**。
**这是范畴错误**——一个机制写在 `examples/` 里**不代表它不好**；
pi 的示例扩展**能跑、能工作**，而且它的「子进程跑自己」思路**确实更省事**。
「它在示例目录」只能说明**它不是 pi 的默认能力**，不能说明**它不该被我们采用**。

**排除这条站不住的理由后，真正的取舍是**：

**倾向方案 A（进程内）**，理由只剩下三条，但每条都成立：
① **两个产品级参考都是进程内**（Claude Code `tools/AgentTool/`、opencode `src/tool/task.ts`），
   且 **Claude Code 的实现最完整**（worktree 生命周期 + `SubagentStart`/`SubagentStop` 钩子 + 后台化 + 嵌套进度）；
   子进程路线**只有 pi 的示例**一个先例。
② **方案 B 的前置成本是「对外接口」**：我们需要新增 `--model`/`--mode`/`--thinking`/`--append-system-prompt`
   四个参数（**当前 0 命中**）。`AGENTS.md` 要求「不新增无法验证的表面」——
   这四个参数一旦存在，就**要测试、要文档、要长期兼容**，而它们**只为子代理服务**。
   方案 A 的代价（`AgentCore` 可重入 + 工具集参数化）是**内部重构**，**不增加对外契约**。
③ **方案 A 的隔离语义与既有代码一致**：我们**已有** worktree 分配/释放 + `squashMerge: true`
   （`taskTool.ts` 里已存在，只是没有 agent 在里面跑）。Claude Code 的「**无变更则删、有变更则留**」
   正是这套语义的完整版——**方案 A 是把它接上，方案 B 是把它当 `cwd` 传出去**。

**同时如实记录方案 B 的两个真实优势**（不因倾向 A 而隐去）：
- 工具集/循环/权限/压缩/记忆**零改造自动继承**，方案 A 需要让这些**全部感知不同的工作根**；
- 进程边界**本身就是隔离边界**，与 `AGENTS.md`「execution is an explicit boundary」天然一致，
  而进程内方案要让整个 agent 栈**共享一个进程**。

**复核子代理 `V3Tools` 对本文的 D1 判断提出异议，主代理核对后部分采纳**：

它指出「pi 的子代理在 `examples/` 里」**不能**作为否定方案 B 的理由，因为
**pi 的扩展模型是刻意的架构选择**（微内核：子代理、后台任务、技能都是模块化扩展），
不是随手写的样例。**主代理核实了这个说法的两个事实基础**：
① `examples` **确实在 pi 的发布清单里**（`packages/coding-agent/package.json:35` 的 `files` 数组）；
② pi 的文档把扩展当作**架构级能力**描述（`docs/how-pi-works.md:41-43`：
   「Extensions are TypeScript modules loaded into the Pi process. Their factory functions
   register tools, commands, shortcuts, providers, event handlers, renderers, and terminal UI.」）。
**但它不在 `examples/` 里被默认加载**——扩展路径来自用户配置
（`resource-loader.ts:484-513` 从 `resolvedPaths.extensions` 与 CLI 路径解析），
所以它**不是** pi 的开箱能力。

**结论**：`V3Tools` 关于「这不是随手样例」的判断**成立**，本文 §15.3 已据此删掉那条理由。
但「它是架构选择」**仍然不能推出「我们应当采用它」**——
**参考实现的架构偏好不等于我们的架构偏好**，
我们仍按 §15.3 剩下的三条（产品级先例数量、对外接口成本、既有 worktree 语义）判断。
**这是一个真实的架构分叉，不是明显的对错。** **需维护者裁决**（见 §16.6）。

### 15.4 无论选哪个方案，都要做的
`SubagentDefinition` 的 12 字段里**从不读取的 6 个**（`tools`/`disallowedTools`/`maxTurns`/
`skills`/`effort`/`background`）必须**要么接上、要么删除**——
**留着不读的字段是主动误导**（与 §14 的 `lsp` 参数同一类问题）。

---

## 16. 需维护者裁决的 5 项

### 16.1 D2 — 数据驱动权限规则（M1）

**冲突**：照 Claude Code 做规则表，与 pi 的「进程边界才是安全边界」哲学**相反**。
pi 的 `docs/security.md:1-17` 明确说审查与信任**不构成安全边界**。

**但我们有一个 Claude Code 有、pi 没有的东西**：**我们完全没有 deny 概念**
（`evaluator.ts:140-194` 只有 allow/deny(仅 plan)/ask）。**用户无法表达「永远不许用这个工具」**。

**三个选项**：
| 选项 | 内容 |
|---|---|
| **(a)** 只补 deny | 最小：加 `denyRules`，**对 bypass 免疫**（照 Claude Code `permissions.ts:1225-1258`）。不做完整规则表 |
| **(b)** 完整规则表 | 照 Claude Code：`ToolName(specifier)` 语法 + allow/deny/ask + 优先级 + 路径锚点。**大** |
| **(c)** 维持现状 | 承认「审查不构成安全边界」，把精力放在进程/文件边界 |

**倾向 (a)**：它**填补一个真实的安全语义缺口**（无 deny），
且**不与 pi 的哲学冲突**——deny 是「减少权限」，不是「用审查代替隔离」。
**(b) 的成本与 (a) 的收益不成比例**，且我们**已依赖 `picomatch`**，(a) 可用它做路径匹配。

### 16.2 D3 — `cheers.json` / `.agents/settings.json`

**三个选项**：
| 选项 | 内容 |
|---|---|
| **(a)** 实现 `settings.v1` 读取器 | 工作量**中**：一套新 schema（`mcpServers`/`skills`/`permissions`/`tui`），其中 `mcpServers` 与 `skills` **是未实现的功能** |
| **(b)** **删除两份文件** | 工作量**低**。它们是**重复的**（逐字节相同）、**零读者**、且**含外部项目名**（`.codex/skills`，路径还不存在） |
| **(c)** 标记为草稿 | 保留但加注释说明未实现。**留着不读的权威配置仍是误导** |

**倾向 (b)**：理由
① **两份文件内容完全相同**，说明其中一份是**复制产物**，不是两处刻意的配置；
② **零读者**——留着它们会让用户以为改了有用（**静默失效的配置契约**，与 08 `T2` 的原始问题同类）；
③ **含外部项目名**且路径不存在，**违反 `AGENTS.md`**；
④ 真要支持 `settings.v1`，**应从 schema 与读取器开始**，而不是从两份无读者的文件开始。

### 16.3 D4 — 动态工具装载增量（M10）

**关键事实**：pi 的 `toolsAdded`/`toolsRemoved` 是**重放确定性**机制，
前提是**工具集会在会话中途变化**（扩展可注册/注销工具）。
**我们的工具集在会话构造时固定**（`turn/session.ts:174`），唯一变化是
`allowTools: projection.stepCount < options.maxSteps`（`:189`）。

**照抄 pi 的字段而没有工具集变化，是空转。**

**三个选项**：
| 选项 | 内容 |
|---|---|
| **(a)** 只处理 `maxSteps` 这一处 | 工具因步数上限消失时**明确告知模型**。**小**，且解决一个真实问题（模型不知道自己没工具了） |
| **(b)** 照 pi 做完整机制 | **前提是先有可变的工具集**——那是扩展宿主，**属 08 §0.1 的排除项** |
| **(c)** 不做 | 承认工具集不可变，文档写明 |

**倾向 (a)**：它把「工具静默消失」变成「工具变化被声明」，
**成本低且不与排除项冲突**。**(b) 依赖被明确排除的扩展宿主**，不应在 Phase 11 做。

### 16.4 D5 — 后台命令执行（M2）

**参考是 Claude Code**（不是 pi，见前置研究 §1 C2）：`run_in_background` + `TaskOutput` + `TaskStop`
+ `<task_notification>`。

**冲突**：08 §4.4 记有既有立场——**`cli/interactive/ambientFacts.ts:9` 自述
「the shell has no detached execution mode」**。引入后台执行**改变这个立场**。

**三个选项**：
| 选项 | 内容 |
|---|---|
| **(a)** 完整照 Claude Code | 参数 + 两个配套工具 + 通知注入。**大**，且**改既有立场** |
| **(b)** 不做，但补一件事 | **核对 `core/shell/platform/processTree.ts` 是否覆盖退出清理**——pi 有 `killTrackedDetachedChildren`，我们是否有对应物**未读**。若缺，**这是真缺陷**（孤儿进程），应单独修 |
| **(c)** 不做 | — |

**倾向 (b)**：后台执行是**功能开发**（有既有立场要推翻，且需要配套工具与通知机制），
而**孤儿进程清理是缺陷**。**先把缺陷查清**，功能另立。

### 16.5 D7 — 死代码处置

08 §5 记有：`cliOpaque` → **90 个非 harness 不可达文件 / 21,247 行** →
**35 个真正死代码 / 6,650 行**；`core/workflow/` 6 个管线模块（508 行）零生产导入者；
`tools/policy/interception.ts`（411 行）零消费者。

**但 `plan.md` §2.1 明确「可达性不授权删除」**，需维护者明示授权或逐簇六项检查。
**这不是我能单方面决定的**（`AGENTS.md`：删别人代码前先问）。

### 16.6 D1 的形状（§15.3 的方案 A vs B）

见 §15.3。

---

## 17. 不纳入本阶段的项

| 项 | 理由 |
|---|---|
| 08 `D6` SSE 事件头 | 11 已**证伪**（OpenAI 不发该头；Anthropic 的 JSON 自带 `type`） |
| 08 `T17` 路由期命名残留 | **文档卫生**，不改代码行为，有解释空间（见 §13） |
| 完整 LSP 客户端 | **无需求证据**；opencode 是 3,311 行子系统，属独立立项（见 §14.2） |
| 新协议（Vertex/Bedrock）、新认证家数 | 沿用 `phase-10-decisions.md` §1.1 先例：**无法验证的表面不加** |
| `CHARS_PER_TOKEN` 由 3.5 改 4 | **无依据**——pi 也是扁平除法；改动会无根据地改变压缩时机（见 §9.3） |
| Session 分享 / 发布链接 | `phase-10-decisions.md` §9.3 已定：**独立立项** |

---

## 18. 执行顺序

按「静默错误 → 响亮失败 → 能力补齐 → 待裁决」排序：

| 序 | 任务 | 级别 | 成本 | 为什么在这个位置 |
|---|---|---|---|---|
| 1 | **T1** 刷新抹能力声明 | P0 | 低 | 静默回滚**已修复的**缺陷（推理模型 400、图片失败） |
| 2 | **T2** 流内 `error` 被吞 | P0 | 低 | 静默成功态，违反 `AGENTS.md` 明文 |
| 3 | **T3** 编辑唯一性 | P1 | 低 | 静默改错位置，模型与用户都看不见 |
| 4 | **T7** `thinkingSignature` | P1 | **中** | **静默污染对话内容**（11 原列 P2，本轮提前） |
| 5 | **T9** 冷启动漏算 | P1 | 中 | 静默低估 → 压缩偏晚 → 溢出 |
| 6 | **T4** 接线死分类器 | P1 | 低 | 排障能力；无静默风险 |
| 7 | **T5** temperature 门控 | P1 | 低 | 响亮 400 |
| 8 | **T6** `budget_tokens` | P1 | 低 | 响亮 400 |
| 9 | **T8** 重试抖动 | P2 | 低 | 跨进程收益，单机不可观测 |
| 10 | **T10** Doom Loop 循环检测 | P2 | 低 | 防误报需谨慎 |
| 11 | **T11** 未变更文件去重 | P2 | 低 | 桩文本有「模型看不到内容」的风险 |
| 12 | **T12** 指令 `@import` | P2 | 低 | 触及文件读取面，包含性校验是安全边界 |
| 13 | **T13** `lsp` 删参数 | P2 | 低 | 对外契约收窄 |
| — | **D1–D7** | — | — | **等裁决** |

**前四项都是静默错误**，且前三项成本低。**T1/T2/T3 可以立即开工**。

---

## 19. 验证计划

| 层级 | 命令 | 说明 |
|---|---|---|
| 类型 | `npm run validate` | 每个任务后 |
| 聚焦测试 | `npx vitest run <改动的测试文件>` | 每个任务后 |
| 门禁 | `verify:import-cycles` / `check:config-consumers` / `check:declarations` / `check:node-floor` | 阶段末 |
| 文档漂移 | `npm run verify:docs-drift:strict` | 阶段末（基线 `docs_dangling=0`，`docs_source_dangling=79` advisory） |
| 脚本测试 | `npm run test:scripts` | 阶段末 |
| 全量 | `npm run test:ts` | 阶段末 |

**每个修复都要求「修复前失败、修复后通过」的回归测试**（§2.4/§3.5/§4.5/§6.4/§7.4/§8.4/§9.5/§10.4/§11.4/§12.4/§14.3）。
**既有测试若钉住了实现细节**（如 T8 的定值退避），**必须改为断言区间**，而不是重新钉死。

**已知 flake（不追）**：`src/cli-baseline.test.ts` 3 个用例，隔离运行 40/40 绿，
0 处引用被改模块，`log.md:556` 等已记录其对负载敏感。
