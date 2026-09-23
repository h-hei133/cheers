---
title: "Phase 5 开工前裁决记录：8 项主决策与补充裁决"
category: article
sources: [phase-5-pre-research-2026-09-23, repo-audit-2026-09-23, pi-source-2026-09-23, pi-retry-2026-09-23, phase-4-decisions-2026-09-22, plan-refactor-v7-2026-09-20]
created: 2026-09-23
updated: 2026-09-23
tags: [features, phase-5, decisions, adjudication]
summary: "Phase 5 开工前的**唯一裁决源**。8 项主决策 + 22 项补充裁决。核心裁决：①**删除 32 文件 / 8,330 行的「报告投影族」**（`tools/dispatch` 全族、`turn/` 七个投影模块、`provider/request|response` 八个包装模块 + 6 个连带闭包），依据是活轨已有承担者且位置更好——工具批执行在 `core/agent/tools.ts:184`、文件锁在 `runtime/execution/fileLock.ts:85`、模型请求在 `turn/step.ts:97`；②**新增重试与错误分类**，照抄 pi 的**两层结构**（provider 层默认 0 次、agent 层默认 3 次）与「服务端 `Retry-After` 优先于本地退避」；③`CatalogModel` 从 3 字段扩到 7 字段（原裁决 8 个，执行期撤销 `input`——无任何消费者）并让 `compat` **真正改变请求形状**（当前 11 个标志只用来生成说明字符串）；④配置错误改为**降级 + 诊断**而非抛异常；⑤`steeringMode`/`followUpMode` 两跳接线；⑥压缩文件足迹跨压缩累积；⑦崩溃日志 + 启动计时；⑧`edits[]` 多段编辑（**`find` 部分经复核撤销**：`glob` 已只返回路径、已匹配模式、已读 `.gitignore`，新建即重复）。**同时更正 5 条既有记录**：`ls`、`powershell`、`find` 三项更正为「平手」/「不存在差距」、主题死令牌数从 18 更正为 14、`/export jsonl` 的原始缺陷已由 Phase 4 T5 收口。"
confidence: high
---

# Phase 5 开工前裁决记录

> **性质**：开工前把需要拍板的事全部定下来。**零代码改动。**
> **输入**：[`phase-5-pre-research.md`](phase-5-pre-research.md)（候选清单与排序）、
> 八个子代理报告、主代理逐条实测。
> **输出**：8 项主决策 + 22 项补充裁决，每项含**选项 / 双向证据 / 裁决 / 理由 / 失败模式**。

---

## 0. 裁决方法与证据纪律

### 0.1 沿用 Phase 3/4 的分工（`phase-3-decisions.md` §0.1、`phase-4-decisions.md` §0.1）

| 角色 | 职责 |
|---|---|
| 子代理 | 只收集**参考实现的证据**，明确禁止给推荐 |
| 主代理（本文件） | 逐条**核验**进入裁决的断言，然后**拍板** |

**为什么不让子代理推荐**：它们看不到本仓库的约束（5 个依赖、只写流、无插件宿主）。
让它们推荐会把「参考实现的做法」误当成「我们应该的做法」。

### 0.2 本轮新增的裁决纪律（第三条）

Phase 4 已确立两条（精确检索、逐字引文）。本轮新增：

> **凡「无消费者」断言，必须用仓库自己的分析器给出逐文件标记，不得用自写正则。**

**依据是本轮主代理自己踩的坑**：自写「值导入闭包」正则得出 603 个不可达文件，
而 `scripts/analyze-boundaries.py` 给出 160。差别来源是自写正则把 `import type` 算成边。
这与 `plan.md` §5 的「间接证据替代直接证据」是同一形态的第五次出现，
因此本轮把「用哪个工具产生数字」写进了纪律。

### 0.3 参考实现的一句话画像（仅在与裁决相关处引用）

| 项目 | 与本次裁决相关的特征 |
|---|---|
| `pi` | 两层重试（provider 默认 0 次 / agent 默认 3 次）；`Retry-After` 优先于本地退避；错误分类用**两组正则**而非枚举；模型目录 16 字段含 `compat`/`thinkingLevelMap`/`reasoning`；配置错误**降级为诊断**；`Model` 的 `compat` 直接决定请求形状 |
| `opencode` | 记录 `cacheReadTokens`；无独立 `ls`（折进 `read`） |
| `codex` | `timeout_ms` 参数；`RawMcpServerConfig` 穷尽解构 |
| `gemini-cli` | shell 工具用**无活动超时**而非总时长 |

---

## 1. T1 — 重试与错误分类

### 1.1 缺陷（已实测，非推断）

| 项 | 现状 | 证据 |
|---|---|---|
| provider 层重试 | **不存在** | `turn/step.ts` 全文件无 `retry`/`backoff`/`attempt` 循环 |
| agent 层重试 | **不存在** | 同上 |
| 重试**资格**判定 | 存在，但**在不可达模块里** | `provider/request/invocation.ts:37-39,328-334`；该模块生产 importer 为 0 |
| 退避 | **不存在** | — |
| 错误分类 | **只有** `isContextOverflow` | `turn/step.ts:70-74`（这部分是对的） |

**活轨的全部失败路径**（`turn/step.ts`）——**两处** catch，**无一处重试**：

fetch 失败（`:142-145`）：

```ts
} catch (error) {
  if (signal?.aborted) return abortedStep("");
  return errorStep(`Network error: ${error instanceof Error ? error.message : String(error)}`);
}
```

HTTP 非 2xx（`:146-154`）：

```ts
if (!response.ok) {
  const detail = await response.text();
  if (isContextOverflow(detail)) return errorStep(`${CONTEXT_OVERFLOW_PREFIX}${detail.slice(0, 200)}`);
  if (effort && /reasoning_effort/i.test(detail)) {
    effortAccepted = false;
    continue;                       // ← 唯一的重试
  }
  return errorStep(`Provider HTTP ${response.status}: ${detail.slice(0, 200)}`);
}
```

读流失败（`:173-176`）：

```ts
} catch (error) {
  if (signal?.aborted) return abortedStep(shown);
  return errorStep(`Network error: ${error instanceof Error ? error.message : String(error)}`);
}
```

**即：一次 429 或一次 502 直接终止整个回合。**

### 1.2 三项子决策

**子决策 1：重试放在哪一层**

| 选项 | 证据 |
|---|---|
| 只在 provider 层（`turn/step.ts` 内） | 简单，但重试时看不到会话状态，无法「先压缩再重试」 |
| 只在 agent 层（`core/agent/loop.ts`） | 能重新考虑上下文，但 `loop.ts` 收到的是 `AssistantStep`，丢失了 HTTP 状态码 |
| **两层，且默认不同** | `pi` 的做法：`retry.provider.maxRetries` 默认 **0**，`retry.maxRetries` 默认 **3** |

**裁决：两层，provider 层默认 0 次、agent 层默认 3 次。**

理由：两层的**可重试判据不同**，因此都需要存在。
provider 层看到的是 HTTP 状态与响应头（`Retry-After`、`x-should-retry`），
agent 层看到的是 `stopReason === "error"` 与错误消息文本。
`pi` 把默认重试放在 agent 层，是因为 agent 层能重新考虑上下文（例如先压缩再重试），
而 provider 层只能原样再发。**但 provider 层不能没有**——`Retry-After` 只在那一层可见，
而限流响应里最有价值的信息就是服务端告诉你等多久。

**子决策 2：退避公式**

**裁决：照抄 `pi` 的两条公式。**

provider 层（`provider-retry.ts:51-68`）——**服务端指令优先**：

```
1. retry-after-ms 头 → 直接用（受 maxRetryDelayMs 约束）
2. retry-after 头 → 秒数或 HTTP 日期（同上）
3. 否则 → min(0.5 * 2^retryIndex, 8) * 1000 * (1 - random()*0.25)
```

agent 层（`retry.ts:113-117`）：

```ts
const delay = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
return Math.min(safeDelay, policy.maxAgentDelayMs ?? DEFAULT_MAX_AGENT_RETRY_DELAY_MS);
```

**为什么必须照抄「服务端指令优先」**：限流响应里的 `Retry-After` 是服务端**明确告知**的等待时间。
忽略它改用本地指数退避，会在服务端要求等 60 秒时 2 秒后重试——**必然再次被拒**，
既浪费配额又延长了总等待。这是「本地猜测优先于远端事实」的错误。

**子决策 3：错误分类的形态**

| 选项 | 证据 |
|---|---|
| 枚举（auth / rate-limit / server / network / …） | 我们已有的形态（`ProviderFailureClass`，在不可达模块里） |
| **两组正则**（可重试 / 不可重试） | `pi` 的做法（`retry.ts:7-92`） |

**裁决：两组正则，但**保留** `isContextOverflow` 作为第三条独立通道。**

理由：枚举的问题是**必须穷举**——一个没见过的错误消息落进 `unknown` 后该怎么办？
`pi` 用「匹配可重试模式则重试，匹配不可重试模式则立即失败，都不匹配则不重试」，
**默认不重试是安全方向**（不会把无望的请求重试三次）。
而上下文溢出**必须单独处理**，因为它不是「失败」而是「需要先压缩」——
`pi` 的 `overflow.ts:136-146` 也正是这样做的（且**先排除非溢出模式**，避免限流文案被误判成溢出）。
我方 `turn/step.ts:70-74` 已有 `isContextOverflow`，**保留并保持其优先级**。

### 1.3 失败模式

| 场景 | 裁决 |
|---|---|
| 用户在重试期间按 Esc | 立刻中止，不等待退避结束（`pi` 的 `abortableSleep`）；中止的消息**永不重试**（`retry.ts:190-193` 的 `stopReason === "aborted"` 分支） |
| 重试耗尽 | 返回**最后一次**的错误消息（不是第一次的），因为最后一次最能反映当前状态 |
| 流式响应中途断开 | **可重试**——`pi` 把 `stream ended before message_stop`、`socket hang up`、`other side closed` 都列入可重试模式 |
| 账户余额不足 | **不可重试**——`insufficient_quota`/`billing`/`quota exceeded` 列入不可重试模式；重试只会浪费三次配额 |
| 上下文溢出 | **不重试**，走既有压缩恢复路径（`turn/session.ts` 的 overflow recovery） |
| 重试期间上下文又变长了 | agent 层重试会重新走 `prepareNextStep`，因此压缩后的新上下文会被用上 |
| 重试次数配成负数/非整数 | 拒绝（报错），不静默钳制——与 Phase 4 的 bash `timeout` 同一条理由 |

### 1.4 验证方式

- 单元：可重试判据（429/500/网络/`Retry-After`/账户限额）、退避公式（含抖动上下界）、
  `Retry-After` 优先于本地退避、中止不重试
- **实机**：用一个返回 429 + `Retry-After: 2` 的本地 stub server，观察两次请求间隔约 2 秒
- **实机**：连续 500 三次后成功 → 回合成功完成而非报错
- **反向验证**：移除重试循环 → 429 测试失败

---

## 2. T2 — 死投影族清理

### 2.1 缺陷（已实测）

**32 文件 / 8,330 行**，生产消费者为 0（**精确定义**：非活、有非测试 importer、
且全部 importer 非活）。实测 **0 个活 importer 指向该集合，且集合内无一个文件自身是活的**。

| 族 | 文件数 | 行数 | 活轨上的承担者 |
|---|---:|---:|---|
| 工具调度与投影 | 11 | 2,491 | `core/agent/tools.ts:184` `executeToolBatch`；`runtime/execution/fileLock.ts:85` `withFileLock` |
| turn 层投影 | 7 | 1,266 | `turn/session.ts:112` 的 `AgentCore`；`core/agent/queue.ts` 的 `PendingQueue` |
| provider 请求/响应包装 | 8 | 2,995 | `turn/step.ts:97` `createStepFunction`；`turn/completion.ts` `readCompletionStream` |
| 连带闭包 | 6 | 1,578 | 只被上述三族引用 |

完整清单与逐文件 importer 见 `phase-5-pre-research.md` §1.2。
**注**：本表是复核更正后的数字（初版为「36 文件 / 10,008 行，闭包 10 文件 / 3,256 行」），
更正过程见 §11.1。

### 2.2 为什么这不是「接线」而是「删除」

**决定性证据是活轨已有承担者，且位置更好**：

| 职责 | 投影族的位置 | 活轨的位置 | 为什么活轨更好 |
|---|---|---|---|
| 工具批执行 | `tools/dispatch/executor.ts` | `core/agent/tools.ts:184` | 活轨在**内核**（`core/agent/loop.ts:164` 调用）；内核不可能调用外层 |
| 同文件写入串行 | `tools/concurrency/fileMutationQueue.ts` | `runtime/execution/fileLock.ts:85` | 活轨的锁在**执行服务**层，`write` 与 `edit` 都取它（`core/tools/registry.ts:402,483`）。**复核更正**：初版写「覆盖 `read`/`write`/`edit` 三个工具」是错的——`read` 只读，不取锁 |
| 模型请求 | `provider/request/attempt.ts` | `turn/step.ts:97` | 活轨直接 `fetch`，投影族是它外面的一层包装 |
| 响应流解析 | `provider/response/stream.ts` | `turn/completion.ts` | 同上 |
| 队列投递 | `turn/steeringQueue.ts` | `core/agent/queue.ts` | 活轨的队列在 `AgentCore` 内部；投影族在 turn 层，**看不到内核的 drain** |

**接上去会得到两套批执行、两把锁、两个响应解析器**——正是 Phase 4 T1 删除
`runtime/events/` 时避免的结果（两套事件流、两个 `schemaVersion`）。

### 2.3 删除前六项检查（`plan.md` §2.2 强制，逐族执行）

| # | 检查 | 族 1（工具调度） | 族 2（turn 投影） | 族 3（provider 包装） |
|---|---|---|---|---|
| 1 | **功能读审** | 产出 `ToolBatchDispatchPlan` 等；无 I/O、无副作用 | 产出 `…Projection`；无 I/O | 产出 `…Envelope`/`…Outcome`；**有** HTTP 调用能力，但从不被调用 |
| 2 | **等价实现核验** | `core/agent/tools.ts:184` `executeToolBatch` | `core/agent/queue.ts` + `turn/session.ts` | `turn/step.ts:97` + `turn/completion.ts` |
| 3 | **消费者存活** | 0 活 importer | 0 活 importer | 0 活 importer |
| 4 | **动态入口** | 无 `path.join`+spawn、无 `pathToFileURL`+`import()`、无 `*Process.ts`、无 `process.argv` | 同 | 同 |
| 5 | **公共面** | `packages/ts-shell/src/index.ts` 未导出 | 同 | 同 |
| 6 | **`scripts/` 引用** | 无 | 无 | 无 |

**检查 1 的一处必须记录的差别**：族 3 的 `provider/request/attempt.ts` **有发起 HTTP 的能力**
（它调用 `providerFetchOutcomeToStreamEvents`）。但它**从不被调用**——
活轨的 `turn/step.ts` 自己 `fetch`。因此它不是「另一个实现」，而是「一个没人调用的实现」。

### 2.4 与参考实现的对照（子代理逐字）

| 本仓概念 | `pi` 是否有 | 证据 |
|---|---|---|
| 独立的工具批调度/投影层 | **无** | 工具派发内联在 `agent-loop.ts:267-272,516-520` |
| 独立的 provider 请求包装层 | **无** | 请求由 `packages/ai/src/api/openai-completions.ts` 直接构造 |
| 独立的响应流投影 | **无** | 流事件由 API 适配器直接产出 |
| 独立的 turn bundle / delivery policy | **无** | 投递由 `agent-session.ts` 的队列直接决定 |

即：**被删的是一个本仓独有、参考实现从未采用的抽象层**。

### 2.5 裁决

**删除 32 文件 / 8,330 行**（三族 + 连带闭包），同步删除只引用它们的测试文件。

### 2.6 失败模式

| 场景 | 裁决 |
|---|---|
| 某个候选其实被测试深度使用 | 删除时同步删除/改写测试；**若某测试验证的行为在活轨上也有**，把该测试改指活轨实现（照 `phase-4-decisions.md` §1.2 的删除纪律） |
| 删完后 `tsc` 报错说明有遗漏的引用 | 逐个补删；**不允许**为了少删几个文件而保留 |
| `index.ts` 的公共 API 面受影响 | **已核实**：`index.ts` 从 **10 个模块**导出（`verification/{selection,execution}/model.ts`、`artifacts/workflow/model.ts`、`repair/loop/model.ts`、`context/selection/model.ts`、`planning/execution/model.ts`、`provider/request/packet.ts`、`tools/policy/strategy.ts`、`evidence/task/proof.ts`、`result/task/verdict.ts`），**无一在候选集内**。**复核更正**：初版写「只从 `provider/request/packet.ts` 导出」是错的 |
| 有文件只被候选集引用但不在 32 个内 | 删除后 `tsc` 会暴露；按「只被候选集引用」判定补删，并更新本文件。**闭包已按此规则实测补全**（6 文件，含 `session/replay/state.ts` 与 `evidence/savepoint/model.ts` 的类型导入） |
| 门禁（`check:declarations` 等）因删除而失败 | 检查是否门禁自己引用了被删模块；门禁目标若消失应同步更新门禁 |

### 2.7 验证方式

- `tsc -p packages/ts-shell/tsconfig.build.json --noEmit` → 0 错
- `npm run verify:import-cycles` → 0 环
- 全量 `npm run test:ts` → 与基线对账（文件数与用例数应下降）
- **`python3 scripts/analyze-boundaries.py`** → 生产 963 → **927**，CLI 可达 802 不变
- **反向验证**：删除前先确认 `grep` 无活 importer（已做），删除后确认无回归

---

## 3. T3 — 模型目录扩展与请求整形

### 3.1 缺陷（已实测）

`core/models/catalog.ts:20-33` 的 `CatalogModel` **只有 3 个字段**：

```ts
export interface CatalogModel {
  readonly id: string;
  readonly contextWindow?: number;
  readonly cost?: ModelCostRates;
}
```

而 `provider/registry/provider.ts:28` 的 `ProviderCompatibilityFlags` 有 **11 个字段**，
**但全部消费点只用来生成字符串**：

- `provider/registry/provider.ts:557-559` → `knownLimitations` 数组元素
- `provider/request/boundary.ts:426-430` → 一个签名串
- `provider/request/boundary.ts:447-452` → `notProvenClaims` 条目

**没有任何一处根据它改变发出去的请求。** 活轨 payload（`turn/step.ts:103-116`）是硬编码的。

**对照参考实现**（`PiProvider` 逐字，`types.ts:675-743` + `openai-completions.ts`）：

| `pi` 标志 | 改变什么 | 证据 |
|---|---|---|
| `supportsDeveloperRole` | system 消息 role 用 `developer` 还是 `system` | `openai-completions.ts:1225` |
| `supportsReasoningEffort` | `reasoning_effort` 发不发 | `openai-completions.ts:962-969` |
| `maxTokensField` | 上限字段名 `max_tokens` / `max_completion_tokens` | `openai-completions.ts:840-846` |
| `requiresAssistantAfterToolResult` | tool 结果后的 user 消息前插合成 assistant 消息 | `openai-completions.ts:1228-1234` |

### 3.2 四项子决策

**子决策 1：`CatalogModel` 加哪些字段**

**裁决：加 5 个（3 → 8），不是 `pi` 的 16 个。**

| 字段 | 类型 | 加的理由 |
|---|---|---|
| `reasoning` | `boolean` | `/thinking` 对不支持的模型也照发 `reasoning_effort`，会被拒 |
| `thinkingLevelMap` | `Partial<Record<ThinkingLevel, string \| null>>` | 见子决策 2 |
| `maxTokens` | `number?` | 当前只有全局 `config.maxOutputTokens`，无法按模型给默认 |
| `compat` | `OpenAICompatibleFlags?` | 见子决策 3 |

**执行期撤销：`input` 未加**（原裁决列了 5 个字段，实际加了 4 个）。

`input: ("text"|"image")[]` 的**唯一消费者**是「发图片前先问模型收不收」。
实测：**本产品没有任何图片输入路径**——`model-adapters/multimodal.ts` 的两个转换函数
（`toAnthropicImageBlock`、`toOpenAIImageUrlBlock`）**零生产调用者**，
`read` 工具在 `core/tools/registry.ts:338` 对图片**主动返回占位文本**
（`"this model receives no image content"`），消息构造（`turn/prompt.ts:109`）
不产出图片块。`.wiki/features/04-terminal-interaction-and-presentation.md:281`
已把图片输入判为**「建议独立立项」**。

**所以加这个字段是加一个永远读不到的字段**——正是本次复核要清除的那类东西。
`phase-5-pre-research.md:711` 把它列为「缺口」时，把**基础设施存在**误读为
**链路可通**；复核时按「消费者是否存在」重判，撤销。

**不加的 8 个**（`name`/`api`/`provider`/`baseUrl`/`inputLimits`/`promptCache`/
`samplingParams`/`headers`）与理由：

- `name`/`api`/`provider`/`baseUrl`：`CatalogProvider` 已承担（provider 级），
  模型级重复会造出两个真相来源；
- `inputLimits`：我们没有图片预处理管线（图片输入本身不做）；
- `promptCache`：cache 保活不做（`phase-5-pre-research.md` §8），寿命字段无消费者；
- `samplingParams`：当前 `temperature`/`topP` 是全局配置，按模型覆盖的需求未出现；
- `headers`：`CatalogProvider` 级已有 `baseUrl`/`envVar`，模型级自定义头无已知需求。

**子决策 2：thinking 档位名**

| 选项 | 证据 |
|---|---|
| 保持 3 档、直传 | 现状 |
| **3 档 + per-model 映射表** | `pi` 的 `thinkingLevelMap`（`openai-completions.ts:964`：`model.thinkingLevelMap?.[level] ?? level`） |
| 扩到 7 档 | `pi` 的 `ThinkingLevel = "minimal" \| "low" \| "medium" \| "high" \| "xhigh" \| "max"`（加 `off`） |

**裁决：保持 3 档（`low`/`medium`/`high`），加 per-model 映射表。**

理由：**档位数是产品决策，映射是正确性修复。** 我方 `/thinking` 已有 3 档的完整 UI 与
项目级状态（`core/commands/thinkingCommandRuntime.ts:19` 的 `TIERS`），扩到 7 档要改
UI、状态与文档，而收益（更细的粒度）未经验证。但**映射表必须有**——
`pi` 的 `openai-completions.ts:964` 说明端点不认 `low`/`high` 这些名字是常态，
需要按模型翻译。**当前我方的应对是「整个丢掉该字段重试」（`turn/step.ts:151-153`），
即从「低档思考」静默降级为「不思考」——这是错的。**

**映射表缺失时的行为**：照 `pi`——档位名原样发出（`?? level`）。
**映射值为 `null`**：该档不支持，**取最接近的支持档**而非报错（与 `pi` 的
`getSupportedThinkingLevels` 过滤语义一致，但降级而非拒绝，因为档位是偏好不是契约）。

**子决策 3：`compat` 生效的范围**

**裁决：只让**有明确失败证据**的 4 个标志改变请求形状。**

| 标志 | 改变 | 依据 |
|---|---|---|
| `developerRole` | system 消息 role | `pi` 有；我方类型面已声明该字段 |
| `reasoningEffort` | `reasoning_effort` 发不发 | 我方已有「被拒就丢掉」的运行时探测，说明这确实会发生 |
| `maxTokensField` | 上限字段名 | 两个字段名都存在于真实端点 |
| `assistantAfterToolResult` | tool 结果后插合成消息 | 端点硬要求，不插就失败 |

**其余 7 个标志**（`systemRole`/`toolCalls`/`parallelToolCalls`/`structuredJsonOutput`/
`streaming`/`strictMessageRoles`/`openAICompatibleShape`/`customHeaders`/`providerSpecificQuirks`）
**保持描述性**，但**必须去掉误导**——见子决策 4。

**为什么不全做**：每个标志都要有「哪类端点会因此失败」的证据。没有证据的标志做成开关，
等于把「参考实现有这么个字段」当成「我们需要这个字段」——
这正是 `phase-4-decisions.md` §0.1 反对子代理给推荐的理由。

**子决策 4：不生效的标志怎么办**

| 选项 | 问题 |
|---|---|
| 保留现状（声明但不影响请求） | **类型说谎**——读者会以为设置它会改变行为 |
| 删除字段 | 会丢失「我们知道这个端点有这个限制」的信息，且 `notProvenClaims` 依赖它 |
| **保留字段，但改名表达「仅描述」** | 需要改名，触及 `provider/registry/provider.ts` 的多个消费点 |

**裁决：保留字段，但把类型与注释改成明确表达「这是描述性元数据，不改变请求」。**

理由：`ProviderCompatibilityFlags` 现在的**实际用途是「告诉用户这个 provider 有什么已知限制」**
（生成 `knownLimitations` 与 `notProvenClaims`），这是一个**真实且有用的功能**。
问题只在于**名字暗示了它会影响请求**。因此改名为 `ProviderLimitationNotes`
（或在类型注释首行写明），**而不是删除能力或假装它生效**。

**这一条的验收标准**：一个读者读完类型定义后，能正确回答「设置 `strictMessageRoles` 会改变发出去的请求吗？」→ **不会**。

### 3.3 失败模式

| 场景 | 裁决 |
|---|---|
| 用户目录里的 `compat` 写了未知字段 | 忽略并诊断（不报错），与 `catalogStore` 的降级策略一致 |
| `thinkingLevelMap` 的值不是字符串也不是 `null` | 拒绝该条目并诊断，该档回退到「原样发出」 |
| `maxTokensField` 配了非法值 | 拒绝，用默认 `max_tokens`（**不静默**） |
| 加字段后 `/cost` 的费率读取路径 | 已读 `cost`（Phase 4 T4 完成），加字段不影响 |
| 加字段后 `check:config-consumers` | 该门禁只管 `RuntimeConfig`/`TuiPreferences` 字段；`CatalogModel` 不在其中，**但**新字段必须有生产读取者（否则就是本项目的签名缺陷） |

### 3.4 验证方式

- 单元：每个生效标志各一条「改变 payload」断言；每个描述性标志一条「不改变 payload」断言
- **实机**：用 stub server 断言收到的 payload 里 role/字段名/`reasoning_effort` 的形状
- **反向验证**：移除 `developerRole` 的消费 → 对应断言失败

---

## 4. T4 — 配置降级与诊断

### 4.1 缺陷（已实测）

`config/runtimeConfig.ts:282` 与 `:374`：

```ts
} catch (error) {
  throw new Error(
    `Failed to read runtime config at ${candidate}: ${error instanceof Error ? error.message : String(error)}`,
  );
}
```

**影响**：一个手写错的 `config.json`（多一个逗号）让产品**完全无法启动**。

### 4.2 裁决

**改为「降级 + 诊断」**，照 `pi` 的 `settings-manager.ts:419-428` + `settings-diagnostics.ts:4-9`：

```ts
// pi 的捕获
private static tryLoadFromStorage(...): { settings: Settings; error: Error | null } {
    try {
        return { settings: SettingsManager.loadFromStorage(storage, scope, projectTrusted), error: null };
    } catch (error) {
        return { settings: {}, error: error as Error };
    }
}
```

```ts
// pi 的诊断
return settingsManager.drainErrors().map(({ scope, path, error }) => ({
    type: "warning",
    message: path ? `Invalid settings file ${path}: ${error.message}` : `Invalid ${scope} settings: ${error.message}`,
}));
```

**三项必须照抄的细节**：

1. **降级到空对象而非「上一层的值」**——一个坏的项目配置不应静默继承用户配置里
   可能冲突的值；空对象让「这个文件没生效」是明确的。
2. **诊断去重**（`pi` 的 `deduplicateDiagnostics` 按 `type\0message`）——
   启动与运行时两个 reader 会报同一文件的同一错误。
3. **诊断必须可见**——`pi` 把它送进 `InteractiveModeOptions.startupDiagnostics`
   并在 TUI 容器里显示。我方应显示在启动横幅或 `/diagnose`。

**诊断的可见位置**（我方的裁决）：启动横幅**一行**（`Warning: invalid config at <path>`），
详情进 `/diagnose`（或既有的 `/doctor` 等价物）。理由：完整错误消息可能很长，
放在横幅会淹没启动信息；但**不能只进日志**——用户不会去看日志。

### 4.3 失败模式

| 场景 | 裁决 |
|---|---|
| 两个配置文件都坏 | 两条诊断，各自指名路径 |
| 坏的是 `providerCredentials` 所在文件 | 降级后凭据为空 → 已有的「未配置 provider」路径会给出正确指引，**不需要特殊处理** |
| 用户修好文件后重开 | 诊断消失（每次启动重新读） |
| `/reload` 时读到坏文件 | 同样降级 + 诊断，**不中断当前会话** |

### 4.4 验证方式

- 单元：坏 JSON → 不抛异常、返回空配置、产出一条诊断
- 单元：两条诊断去重
- **实机**：写一个含语法错误的 `config.json`，启动产品 → 正常进入 TUI + 一行警告
- **反向验证**：恢复 `throw` → 测试失败

---

## 5. T5 — 消息投递模式接线

### 5.1 缺陷（已实测）

`core/agent/agent.ts:16-17` 声明、`:39-40` 使用、`:106-110` 有 setter、
`:115-119` 有入队、`:168-169` 接到循环。**但 `turn/session.ts:112` 构造 `AgentCore` 时不传**，
`setQueueMode` 的生产调用者为 **0**，`config/runtimeConfig.ts` **没有这两个字段**。

### 5.2 裁决

**新增两个配置字段并接到构造处。**

| 字段 | 类型 | 默认 |
|---|---|---|
| `steeringMode` | `"all" \| "one-at-a-time"` | `"one-at-a-time"` |
| `followUpMode` | `"all" \| "one-at-a-time"` | `"one-at-a-time"` |

**默认值与 `pi` 一致**（`docs/settings.md:29-30`），且**与当前行为一致**
（`agent.ts:39-40` 的 `?? "one-at-a-time"`）——接线不改外观，这是
`phase-4-execution.md` §4.2.1 的教训（`tuiMode` 接线时改错了默认值）。

**为什么这一项成本极低**：内核那一半**已经跑起来并有测试**（`PendingQueue` 完整实现，
`agent.test.ts:388` 测了 `setQueueMode`）。缺的只是**配置字段 → 构造参数**两跳。

**不做 CLI 标志**：`pi` 只通过 settings 暴露这两个（无 `--steering-mode`），
且它们是偏好而非一次性选择。

### 5.3 失败模式

| 场景 | 裁决 |
|---|---|
| 配置里写了非法值 | 回退到默认 + 诊断（与 T4 同一条路径） |
| 会话中途改配置 | `/reload` 后对**下一个回合**生效；当前回合的队列已构造，不改 |
| `all` 模式下队列里有多条 steer | 全部一次性投给下一步——这是 `all` 的定义，用户显式选择 |

### 5.4 验证方式

- 单元：两个字段从配置读到构造参数（`runtimeConfig` 往返 + `AgentCore` 构造断言）
- 单元：`one-at-a-time` 投一条、`all` 投全部（复用既有 `PendingQueue` 测试的形态）
- **反向验证**：移除构造处的透传 → 配置往返测试失败

---

## 6. T6 — 压缩文件足迹跨压缩累积

### 6.1 缺陷（已实测）

- `core/query/compaction/fileFootprint.ts:19-60` 只扫描**传入的 messages**——单次调用内累积，
  **跨压缩不累积**；
- `core/query/compaction/summarize.ts:84-86` 在 provider **返回摘要之后**才算足迹；
- `session/sessionEventCodec.ts:9-17` 的 `CompactionTranscriptEntry` **没有文件明细**。

**影响**：多次压缩后，早期读改过的文件从可见列表消失，**模型会重复读已读过的文件**。

### 6.2 裁决

**把 `readFiles`/`modifiedFiles` 落进 `CompactionTranscriptEntry`，下次提取时合并上一条的明细。**

三项实现细节：

1. **entry 加两个可选字段**（`readFiles?: readonly string[]`、`modifiedFiles?: readonly string[]`）——
   **可选**，因为旧 transcript 没有它们（`phase-4-decisions.md` §5.3 的 `id` 处理同型：
   读取时容忍缺失，不迁移文件）。
2. **合并方向照 `pi`**：先读上一条 compaction 的 details，再补当前消息
   （`pi` 的 `compaction.ts:46-82`）。**modified 从 read 集合移除**——现有
   `fileFootprint.ts:47-49` 已这么做，保留该语义。
3. **注入位置不改**：足迹仍拼进 checkpoint message。`pi` 把它追加到 summary
   （`docs/compaction.md:206`），我方拼进 checkpoint——**两者都是让后续上下文看到，
   差别只在容器**。改注入位置会同时改动压缩输出格式，收益不明。

**为什么不做 `pi` 的 `firstKeptEntryId` 边界**：我方 Phase 2 已用**另一条路**
（从上下文自身识别 `[Context Checkpoint]` 并修订）达到同一意图，那条路不依赖 entry id。
**两条路都成立**，不叠加。

### 6.3 失败模式

| 场景 | 裁决 |
|---|---|
| 旧 entry 没有文件明细 | 从空集合开始累积（不报错、不迁移） |
| 文件路径重复出现在多条 entry | Set 去重（既有语义） |
| 同一个文件先 read 后 modify，跨压缩 | modified 优先，从 read 集合移除（既有语义延伸到跨压缩） |
| 路径是相对路径而 cwd 变了 | 按记录时的原样保存；**不解析成绝对路径**（解析会把 worktree 的临时路径固化进 transcript） |
| 明细过大 | 上限 200 条/类，超出时保留最近的（避免 entry 无限增长） |

### 6.4 验证方式

- 单元：压缩两次，第二次的足迹含第一次读过的文件
- 单元：旧 entry（无明细）仍能压缩
- 单元：read→modify 跨压缩后只出现在 modified
- **反向验证**：移除明细持久化 → 第二次压缩的测试失败

---

## 7. T7 — 崩溃日志与启动计时

### 7.1 裁决

**两项都做，均照 `pi`。**

**崩溃日志**（`pi` 的 `packages/coding-agent/src/core/crash-log.ts`）：

| 项 | `pi` 的值 | 我方采纳 |
|---|---|---|
| 记录形状 | `{timestamp, version, kind, message, stack, sessionFile, cwd}` | ✅ 相同 |
| `kind` | `"uncaught_exception" \| "fatal_error"` | ✅ 相同 |
| 保留条数 | `MAX_CRASH_RECORDS = 5` | ✅ 5 |
| 位置 | `<agentDir>/crashes.json` | `<userDataDir>/crashes.json` |
| 注册 | `process.prependListener("uncaughtException", …)` | ✅ 同 |

**必须照抄的一处**：`pi` 用 **`prependListener`** 而非 `on`——崩溃处理器必须**先于**
其他监听器运行，否则别的监听器可能先退出进程。且写入本身**包在 try/catch 里**
（`recordCrash` 的 `catch { return undefined }`）：崩溃日志写入失败不能再抛一个异常。

**启动计时**（`pi` 的 `packages/coding-agent/src/core/timings.ts`）：

| 项 | `pi` 的值 | 我方采纳 |
|---|---|---|
| 开关 | `process.env.PI_TIMING === "1"` | `CHEERS_TIMING === "1"` |
| 单位 | 相邻检查点之间的**毫秒差** | ✅ 相同 |
| 命名空间 | `"main" \| "extensions"` | 我方用 `"main"`（无扩展宿主） |
| 检查点位置 | `main.ts:646-778` 六处 | 配置加载后、主题后、服务后、模式后 |

**为什么计时用「相邻差值」而非「距起点」**：差值直接回答「哪一段慢」，
距起点还要读者自己做减法。`pi` 的选择是对的。

**新增 CLI 面**：`/crash` 命令（列出最近崩溃记录 + 路径），与既有 `/log` 同形。
理由：`pi` 有 `crashLogPath` 但**没有专门的 slash 命令**（它靠 TUI 启动时的
`notified` 标记提示）。我方无此提示机制，一个 `/crash` 比一个只在启动时出现一次的
提示更可发现。

### 7.2 失败模式

| 场景 | 裁决 |
|---|---|
| 崩溃发生在崩溃日志写入过程中 | `try/catch` 吞掉，不递归 |
| `crashes.json` 内容损坏 | 读取时返回空数组（照 `pi` 的 `readCrashLog`） |
| 计时开关未设 | 所有 `time()` 立即返回（**零开销**，不是「记录后不打印」） |
| 计时点被调用但未 `reset` | 首次调用自动初始化（照 `pi` 的 `if (!timingNamespaces.has(namespace)) resetTimings(namespace)`） |
| 用户数据目录不可写 | 崩溃日志失败不影响进程退出；计时不受影响 |

### 7.3 验证方式

- 单元：`recordCrash` 追加 + 保留 5 条 + 损坏文件容错
- 单元：`time()` 在开关关闭时零记录
- **实机**：`CHEERS_TIMING=1` 启动，观察检查点输出
- **实机**：注入一个 `throw` 到启动路径，确认 `crashes.json` 有记录且进程正常退出
- **反向验证**：移除 `prependListener`（改用 `on`）→ 顺序测试失败

---

## 8. T8 — 多段编辑（`find` 部分经复核撤销）

### 8.1 多段编辑

**现状**：`core/tools/registry.ts:446-470` 的 `edit` 只有
`path`/`content`/`oldText`/`newText`/`replaceAll`——**单段替换**。

**参考实现**（`PiTerminal` 逐字，`edit.ts:22-38`）：

```ts
const replaceEditSchema = Type.Object({
    oldText: Type.String({
        description: "Exact text for one targeted replacement. It must be unique in the original file and must not overlap with any other edits[].oldText in the same call.",
    }),
    newText: Type.String({ description: "Replacement text for this targeted edit." }),
}, {});

const editSchema = Type.Object({
    path: Type.String({ description: "Path to the file to edit (relative or absolute)" }),
    edits: Type.Array(replaceEditSchema, {
        description: "One or more targeted replacements. Each edit is matched against the original file, not incrementally. ...",
    }),
}, {});
```

**重叠拒绝**（`edit-diff.ts:340-349`）：

```ts
matchedEdits.sort((a, b) => a.matchIndex - b.matchIndex);
for (let i = 1; i < matchedEdits.length; i++) {
    const previous = matchedEdits[i - 1];
    const current = matchedEdits[i];
    if (previous.matchIndex + previous.matchLength > current.matchIndex) {
        throw new Error(`edits[${previous.editIndex}] and edits[${current.editIndex}] overlap in ${path}. Merge them into one edit or target disjoint regions.`);
    }
}
```

**裁决：新增 `edits[]` 参数，保留现有单段参数。**

| 决策 | 裁决 | 理由 |
|---|---|---|
| 保留 `oldText`/`newText` | **保留** | 模型已经在用；删掉是破坏性契约变更，且单段是 `edits[]` 长度为 1 的特例 |
| `edits[]` 与 `oldText` 同时给 | **拒绝**（报错） | 两个真相来源；静默取其一会让调用者以为另一个也生效了 |
| 匹配基准 | **原始文件**（不是增量） | 照 `pi`；增量匹配会让后面的 edit 受前面 edit 影响，重叠检测失去意义 |
| 重叠 | **拒绝整个调用**（不写盘） | 照 `pi` 的原子性：一个 edit 失败则整个调用失败 |
| 某个 `oldText` 匹配到多处且未标 `replaceAll` | **拒绝**（既有语义） | 与单段路径一致 |

**必须更新的一处**：`edit` 工具结果里的 `oldText`/`newText` 会被
`session/sessionTreeProjection.ts:506-510` 等处的正则脱敏（`oldText=[raw-content-excluded]`）。
`edits[]` 里的同名键**必须同样被脱敏**——否则原始文件内容会泄漏进 transcript。
**但注意**：那些脱敏函数位于**待删的投影族**里（§2）。活轨的脱敏在
`runtime/execution/error.ts:74` 与 `core/security/redaction.ts`。
**施工时必须确认活轨的脱敏覆盖 `edits[]` 的新形状。**

### 8.2 `find` 工具 —— **撤销裁决：不新建，`glob` 已是等价物**

**参考实现**（`PiTerminal` 逐字，`find.ts:23-33,63`）：

```
pattern: string  — "Glob pattern to match files, e.g. '*.ts', '**/*.json', or 'src/**/*.spec.ts'"
path?: string    — "Directory to search in (default: current directory)"
limit?: number   — "Maximum number of results (default: 1000)"
description: "Search for files by glob pattern. Returns matching file paths relative to the search directory. Respects .gitignore."
```

**原裁决**：新建 `find`，理由是「`glob` 返回匹配文件（含内容），`find` 返回路径列表，后者更省 token」。

**该前提经复核证伪**。实测 `core/tools/glob.ts`：

- `:82` `const page = filtered.slice(0, limit)` —— 取的是路径
- `:90` `const raw = page.join('\n')` —— **只拼接路径，不读文件内容**
- 全文件唯一的 `content` 命中（`:117` 的 `truncated.content`）是那个拼接结果，
  不是文件内容
- 底层 `executionService.listFilesRecursive` → `listWorkspaceFiles`（`fileWalk.ts:217`），
  返回 `readonly string[]`

**逐项对照 `pi` 的 `find`**：

| `pi` 的 `find` 能力 | 我方 `glob` | 证据 |
|---|---|---|
| glob 模式匹配 | ✅ | `matchesGlob(file, pattern)` |
| 只返回路径 | ✅ | `page.join('\n')` |
| 尊重 `.gitignore` | ✅ | `fileWalk.ts:217-238`：优先问 git，退化到读 `.gitignore`/`.ignore` |
| 剪枝无价值目录 | ✅ | `PRUNED_DIRECTORIES` |
| `limit` 默认 1000 | ✅ | `DEFAULT_MATCH_LIMIT = 500`，`MAX_MATCH_LIMIT = 1000` |
| `path` 参数 | ⚠️ 无独立参数 | 模式本身可写 `src/**/*.ts`，覆盖同一用途 |

**撤销后的裁决：不新建 `find`。** 理由：新建一个与 `glob` 行为相同的工具，
会让模型面对两个都能完成同一件事的名字，而它必须从中挑一个——
这正是本项目反复清理的「同一职责的第二个实现」。
`path` 参数的差异由模式自身表达（`src/**/*.ts`），不需要第二个工具名。

**`ls` 同样不做**——见 §9.1 的更正。

**（保留原裁决的上下文供追溯）**：`05-*` §3.1 记录「无 `find` 工具，主体由 `glob` 覆盖」，
当时判为 MISSING；本轮核实后该差距**不存在**。

### 8.3 失败模式

| 场景 | 裁决 |
|---|---|
| `edits[]` 为空数组 | 拒绝（报错），不是「什么都不做」 |
| `edits[]` 里某个 `oldText` 为空串 | 拒绝 |
| `edits[]` 与 `content` 同时给 | 拒绝 |
| `edits[]` 里某段的 `oldText` 匹配不到 | 拒绝整个调用，**一个字节都不写** |
| `edits[]` 里有重叠段 | 拒绝并指名是哪两段（`edits[0]` 与 `edits[1]`） |
| `replaceAll` 与 `edits[]` 同时给 | `replaceAll` 只作用于单段形式；`edits[]` 每段各匹配一次 |
| `find` 结果超过 `limit` | 截断并**明说截断了**（不是静默） |
| `find` 在无 `.gitignore` 的目录 | 正常遍历（`fileWalk` 已处理） |

### 8.4 验证方式

- 单元：`edits[]` 多处替换、重叠拒绝、空数组拒绝、与单段参数互斥
- 单元：`find` 返回路径、尊重 `.gitignore`、`limit` 截断
- **实机**：`read @src/...` 后让模型做一次三处编辑
- **反向验证**：移除重叠检测 → 重叠测试失败

---

## 9. 补充裁决（22 项）

### 9.1 更正既有记录（4 项）

| # | 原记录 | 实测 | 处置 |
|---|---|---|---|
| 1 | `05-*`：「`ls` 是 MISSING，我们无独立工具」 | **能力已在 `read` 里**：`core/tools/registry.ts:239` 描述含「Reading a directory path lists its direct contents instead, one level deep」，`:249-253` 的 `offset`/`limit` 对目录读生效（默认 500、max 1000）——**与 `pi` 的 `ls` 默认 500 一致** | 更正为**平手**，不做 |
| 2 | `05-*`：「`powershell` 是 DEFICIENT」 | `/shell use powershell` 已能切换后端（`core/commands/shellCommandRuntime.ts:24` 的 `validBackends`） | 更正为**平手**，不做 |
| 3 | `phase-4-execution.md` §15.3：「39 个令牌中 21 个被读取，18 个是死配置」 | 本轮实测：**25 个被读取、14 个零出现**。差异是口径——§15.3 数的是「被 `fg`/`bg`/`bgOpen` 直接调用」，本轮数的是「在源码中任意出现」，而 `diffAdded`/`command*` 等是通过变量传入 `fg()` 的 | **两个数字都对，度量不同**。本轮的 **14** 才是「删掉不会有渲染变化」的那个数 |
| 4 | `02-*` §2.3：「`/export jsonl` 丢失会话协议元数据」 | Phase 4 T5 已把 `asJsonl` 改为**直接透出原始行**（`exportCommandRuntime.ts:147-149`） | **该缺陷已收口**；残留差距只是「无 header/version 行」（见 §9.2 第 5 项） |

### 9.2 逐项裁决

| # | 事项 | 裁决 | 理由 |
|---|---|---|---|
| 5 | transcript 加 header/version 行 | **不做** | 我方能读（`decodeTranscriptLineSafe` 按行解析），且 `id` 已有；加 header 是**契约变更**（读端要跳过、旧文件要容忍），而「给别人读」这个用途尚无消费者。**登记为「有需要时再做」** |
| 6 | 主题 14 个死令牌删除 | **不删**（维持 Phase 4 §15.3） | 删令牌会让用户已写的主题名失效，是产品决策而非缺陷修复。**登记数量（14）与名单**，避免下一个读者重数 |
| 7 | `firstKeptEntryId` 接线 | **不做** | 我方 Phase 2 用「识别 `[Context Checkpoint]` 并修订」达到同一意图，不依赖 entry id。**登记为「有意保留但不用」** |
| 8 | `evidence/savepoint/model.ts` | **保留** | 指不出活轨承担者（`TurnProjection` 不含 savepoint 语义），不满足 §2 的删除门槛 |
| 9 | `provider/liveProviderSmokeFallback.ts` | **保留** | 不是投影层；是对「冒烟测试失败如何归因」的分类，活轨无等价物 |
| 10 | `core/security/redaction.ts` | **保留** | 被保留文件使用，只因引用者非活才落进大簇 |
| 11 | 其余 85 文件大簇的成员（`context/*`/`edit/*`/`planning/*`/`evidence/*`/`result/*`/`verification/*`/`session/*`） | **保留** | 无活轨承担者；属 `plan.md` §4.6 与 `.normproof/dispositions.md` 的 `unreachable-code-retention` 既定范围 |
| 12 | `core/harness` 30 文件 | **保留** | `core/harness/README.md` 明确禁止整体搬迁；它们是测试 seam |
| 13 | `test-utils/*` | **保留** | 测试基础设施 |
| 14 | cache 保活（warming） | **不做** | 主动发请求花钱，收益取决于继续对话的概率，需真实账单数据验证 |
| 15 | 传输选择（SSE/WebSocket） | **不做** | 我方只有一个传输；`pi` 自己也标注为实验 |
| 16 | 图片输入 | **不做** | 需 `SessionMessage.content` 类型迁移；**T3 的 `input` 字段是它的前置**，先做 T3 |
| 17 | 转录内搜索 | **不做** | `viewport.ts` 的屏幕行↔内容行映射需扩展，成本中高，收益低于 T1/T2 |
| 18 | Mermaid 渲染 | **不做** | 需引入新依赖；我方依赖面只有 5 个 |
| 19 | 树形可视化导航 | **不做** | `pi` 的组件 1435 行，收益与成本不匹配 |
| 20 | 订阅式 OAuth 扩展 | **不做** | 需真实 provider 凭据流，**无法在隔离环境验证** |
| 21 | stdin/stdout RPC 协议 / SDK | **不做** | 需定义 framing + 审批远程应答，是新契约设计 |
| 22 | `retry.*` 的配置字段形态 | **扁平命名**（`retryMaxRetries` 等），不用 `pi` 的嵌套对象 | 我方 `RuntimeConfig` 是扁平结构，引入嵌套会与既有字段风格不一致；`check:config-consumers` 也已按扁平字段工作 |

### 9.3 关于 T2 与 T1 的顺序依赖（一处必须记录的判断）

**T2 在 T1 之前做**，因为 T1 要改的 `turn/step.ts` 与 T2 要删的
`provider/request|response` 是**同一链路的两个位置**。

若顺序反过来（先 T1 后 T2），T1 的作者会面对「有两套 provider 请求实现」的局面：
`turn/step.ts` 在跑，`provider/request/attempt.ts` 不在跑但看起来更完整
（它有完整的错误分类枚举与重试资格判定）。**一个理性的作者会倾向于改那个"更完整"的**——
而它不可达。这正是 Phase 4 T1 删除 `runtime/events/` 的理由：
**两个模块都自称事件流、都带 `schemaVersion`，读者会以为 `--json` 依赖后者。**

因此顺序是 **T2 → T1**，且 T2 的提交信息必须写清楚「活轨的承担者是谁」。

---

## 10. 施工顺序与验证纪律

$$\text{T2} \to \text{T1} \to \text{T5} \to \text{T4} \to \text{T6} \to \text{T3} \to \text{T7} \to \text{T8}$$

（理由见 `phase-5-pre-research.md` §7.1；§9.3 补充了 T2 必须先于 T1 的依赖。）

### 10.1 每个提交前跑的门禁

```
npx tsc -p packages/ts-shell/tsconfig.build.json --noEmit
npm run verify:import-cycles
npm run check:config-consumers
npm run check:declarations
npm run verify:docs-drift:strict
npm run test:scripts
npm run analyze:module-facades
python3 scripts/analyze-boundaries.py
npx --package .normproof/normproof-*.tgz normproof judge   # 与 CI 同一条命令
```

### 10.2 每个任务的施工纪律

沿用 `plan.md` §2.4 与 `agent-rules/testing-and-validation.md`：

1. 先写**会失败的回归测试**
2. 施工
3. **反向验证**：移除改动后测试必须失败
4. **实机验证**（触及 TUI/CLI 时用 PTY）
5. 全量门禁

### 10.3 本轮明确**不做**的（汇总）

见 §9.2 第 5–21 项。**每一项都记录了理由**，不留「待定」。

---

## 11. 复核（2026-09-23）

五个只读复核者并行执行，各负责一个切片，**参照 `pi` 与仓库分析器**独立重算。
**每项发现要求带可执行证据**；下面只记录**经我复现确认成立**的项与处置。

### 11.1 已确认成立并已修正（4 项）

| # | 发现 | 复核者 | 复现 | 处置 |
|---|---|---|---|---|
| 1 | **T2 的闭包方向算错**：初版把 `context/acquisition/{engine,projection}.ts`、`planning/runtime/*`、`planning/grounded/projection.ts`、`planning/handoff/mutation.ts`、`model-adapters/types.ts` 列为「只被候选集引用」，但它们**有候选集之外的引用者**（`planning/runtime/*` 互相引用形成另一簇），不属于本批 | `RvDeadCode` | ✅ 逐个列 importer 复现 | 移除这 10 个，改列**真正会悬空的 6 个**（见下） |
| 2 | **漏了 6 个会悬空的文件**：`session/replay/state.ts`、`evidence/savepoint/model.ts` 从候选集**做类型导入**（`toolOutcomeBundle.js`、`toolBatchDispatch.js`、`turnSnapshot.js`），不一起删 `tsc` 必报错 | `RvDeadCode` | ✅ 复现：`grep -n "toolOutcomeBundle\|toolBatchDispatch\|turnSnapshot" session/replay/state.ts evidence/savepoint/model.ts` | 闭包改为 6 文件：`session/replay/state.ts`、`evidence/savepoint/model.ts`、`session/continuation/readiness.ts`、`session/replay/host/facts.ts`、`context/rebuildInput.ts`、`context/acquisition/summary.ts` |
| 3 | **`index.ts` 断言错误**：初版写「只从 `provider/request/packet.ts` 导出」，实际是 **10 个模块** | `RvDeadCode` | ✅ `grep -n "} from" src/index.ts` → 10 条 | §2.6 改为列出全部 10 个并确认无一在候选集内 |
| 4 | **`withFileLock` 覆盖面描述错误**：初版写「覆盖 `read`/`write`/`edit` 三个工具」，实际 `read` **不取锁**（只读，无竞争） | `RvDeadCode` | ✅ `grep -n withFileLock src/core/tools/registry.ts` → 仅 `:402`（write）与 `:483`（edit） | §1.3/§2.2 两处更正为「`write` 与 `edit` 都取它」 |

**修正后的 T2 数字**：**32 文件 / 8,330 行**（族 1 = 11 文件 / 2,491 行，
族 2 = 7 文件 / 1,266 行，族 3 = 8 文件 / 2,995 行，闭包 = 6 文件 / 1,578 行）。
初版的「36 文件 / 10,008 行」是错的。

### 11.2 已确认成立但**不修正**（1 项，如实记录）

- `RvDeadCode` 指出：本仓还有 **50 个生产文件零非测试 importer**
  （`repair/handoff/readiness.ts`、`session/recovery/sessionReconciler.ts`、
  `session/presentation/facts.ts` 等）**未被 32 个候选覆盖**。
  **不修正的理由**：它们**没有可指名的活轨承担者**，不满足 §0.2 的 A 类门槛。
  按 `plan.md` §2.1「可达性只用于分析，不授权删除」与 `.normproof/dispositions.md` 的
  `unreachable-code-retention` 裁定，它们**保留**。已在 pre-research §1.4 末段登记为
  「如实记录的范围限定」。

### 11.3 复核确认无发现（3 个切片）

| 切片 | 复核者 | 结论 |
|---|---|---|
| T1 重试与错误分类 | `RvRetry` | **全部 CONFIRMED**。我方链路、pi 两层实现、引用与行号均准确。唯一提示：`provider-retry.ts` 全文 125 行，`:105-125` 是函数范围 |
| T3 模型目录与请求整形 | `RvProvider` | **全部 CONFIRMED，零发现**。特别确认了核心断言：`ProviderCompatibilityFlags` 的消费点**只生成字符串与声明**，**无一处改变请求 payload/header/field** |
| T4–T8 与 §9.1 更正 | `RvDecisions` | **全部 CONFIRMED**。唯一提示：pi 的 `crash-log.ts`/`timings.ts` 在 `src/core/` 下（已补全路径） |
| 跨文档一致性 | `RvSweep2` | 1 项发现：`phase-5-pre-research.md` §7.1 的 `3,102 行` 与 §1.2/decisions §2.1 的 `2,995 行` 不一致（前者是含 `liveProviderSmokeFallback.ts` 的整目录数）。**已改为 `8 文件 / 2,995 行`** |

### 11.4 复核方法

- 五个只读复核者，每人一个切片，**明确要求证伪而非确认**，并要求区分
  CONFIRMED / REFUTED / UNVERIFIABLE。
- **`RvRetry` 与 `RvProvider` 各有一条 P3 级准确性问题**（引文合并、路径未含 `core/`），
  均已修正。
- **`RvDeadCode` 判定 overall `incorrect`**，指出 4 项错误——**全部复现成立并已修正**。
  这是本轮复核**最有价值的一份**：它推翻的是我自己的算错方向。
- **`RvSweep` 两次因上游 `content_filter` 失败**，重派为 `RvSweep2` 后完成。
  `RvSweep2` 只做一致性检查（未做原派的 5 项全检），**因此「未做」的部分登记如下**：
  - 未抽查 20 处 `file:line` 引用（部分由 `RvRetry`/`RvProvider`/`RvDecisions` 的逐条复核覆盖）
  - 未系统核验「不做清单」的全部 17 项事实前提（主代理已自查 5 项：cache-warmer / transport / image / mermaid / RPC-SDK 均确认不存在）
  - 未核验与 `phase-4-execution.md` §11/§15 的**新增**矛盾（§9.1 的 4 项更正已由 `RvDecisions` 确认）

### 11.5 复核结论

- **T2 的数字从 36/10,008 更正为 32/8,330**，且**修正了闭包方向**——
  这是本次复核最实质的收获：若不复核就施工，`tsc` 会在删到一半时报出
  6 个悬空 import，而施工者会以为是「多删了几个」而不是「闭包算错」。
- **T1/T3 的裁决经两个独立切片确认成立**，包括最关键的
  「`compat` 标志不改变请求形状」——这是 T3 整个裁决的前提。
- **T4–T8 与 22 项补充裁决的前提全部成立**。
- **未覆盖的部分**（§11.4 末段）如实登记，未声称已核验。
