---
title: "Phase 2 前置研究：压缩层的真实地形"
category: article
sources: [repo-audit-2026-09-20, phase-1-execution-2026-09-20]
created: 2026-09-20
updated: 2026-09-20
tags: [features, phase-2, compaction, context, pre-research]
summary: "Phase 2 开工前的压缩层测绘。结论：src 下有六个名字含 compaction 的实现，其中四个是活的不同职责；真正需要动的是 A（回合内）与 B（手动 /compact）两处，它们共享同一个摘要器但切点与落盘不同。P8 的修复路径已确定：provider 的真实 usage 已被记录（lastPromptTokens），只是没喂给触发函数。"
confidence: high
---

# Phase 2 前置研究：压缩层的真实地形

> **性质**：Phase 2 开工前的测绘，**零代码改动**。目的只有一个——
> `07-*` §5 把 `context/compact/`（5,186 行）标为「最大未覆盖区域」，
> 而「不先理清就不动压缩层」是上一轮定下的纪律。本文件履行该前置条件。

---

## 0. 方法

用脚本把每个 `import` 说明符**解析到真实文件**再统计消费者——
按 basename 匹配会把 `session/compaction.ts` 与 `core/shell/compaction.ts`
混为一谈（第一轮就踩了这个坑，见 §6 教训）。

---

## 1. 六个「compaction」，四个活着，四个不同职责

| # | 文件 | 行数 | 生产消费者 | 真实职责 |
|---|---|---:|---:|---|
| **A** | `session/compaction.ts` | 179 | **1**（`turn/session.ts`） | 回合内上下文压缩 + 溢出恢复 |
| **B** | `core/shell/compaction.ts` | 116 | **3**（`sessionRuntime`、`interactive/compact.ts`、`cliSessionRuntimeFactory`） | 手动 `/compact` |
| **C** | `core/query/microCompact.ts` | 125 | 2（`turn/step.ts`、`contextAnalysis`） | **每请求**工具输出剪枝（另一维度） |
| **D** | `session/agent/compaction.ts` | — | 1（`session/agent/persistence.ts`） | working-memory 按 turn 数保留 |
| **E** | `browser/receipt/compaction.ts` | — | 1（`browser/receipt/store.ts`） | 浏览器凭据缓存压缩（无关） |
| **F** | `context/compact/**`（33 文件） | **2,919** | **11** 个外部文件 | **不是压缩器**——交接包生成器 |

### 1.1 `context/compact/` 不是压缩器（关键更正）

它的结果类型**自述**（`context/compact/command/compactCommandRunner.ts:30-38`）：

```ts
readonly persistence: "none";
readonly providerCall: "none";
readonly recoveryExecution: "none";
```

它构建的是 `buildRouteContinuityHandoffPacket(...)`——把 route/项目/目标/编辑能力清单
打包成一份**交接文档**，供人阅读或导出，**不调用 provider、不改上下文**。

所以 `07-*` §5 的担心（「两个实现之间做错改动」）**前提不成立**：
`context/compact/` 与 A/B 不在同一个问题上，不会互相干扰。

**11 个外部消费者**（`compactCommandRuntime`、`memoryCommandRuntime`、`sidebarCommandRuntime`、
`core/shell/sessionRuntime`、`core/shell/sessionFutureTurnProjection`、
`entrypoints/cliCommandExecutionBridge`、`presentation/sidebar/...` 等）
全部读的是它的 **checkpoint/injection 状态存储**，不是压缩结果。

### 1.2 `/compact` 有两个含义（已核实的现状）

`cli/interactive/interactiveCommandRouter.ts:78-85` 在路由**之前**拦截 `parseCompactCommand`：

| 输入 | 走向 | 做什么 |
|---|---|---|
| `/compact`、`/compact <指令>` | `sessionRuntime.compactHistory` → **B** | 真的压缩上下文 |
| `/compact preview\|render\|json` | 命令注册表 → **`context/compact/`** | 生成交接包（`providerCall: "none"`） |

`cli/interactive/compact.ts:10` 的注释明确了这个分工。**两者都活，不冲突，但同名易混。**

**加重这一点的是**：`parseCompactCommand`（`cli/interactive/compact.ts:15-22`）把
**`/handoff`** 也当成 `/compact` 的别名（`:19` `name !== "/handoff"` 才返回 undefined）。
即 `/handoff` 走的是**压缩**路径，而 `/compact preview|render|json` 走的是**交接包**路径——
**两条命令的名字与实际职责是交叉的**。这是 Phase 2 应当一并清理的命名问题，不在功能范围内。

---

## 2. A 与 B 是仅有的两个真压缩器

两者**共享同一个摘要器** `core/query/compaction/summarize.ts` 的 `requestCompactionSummary`
（A 经 `turn/session.ts` 注入，B 直接调），也共享 `EIGHT_SECTION_COMPACTION_PROMPT`。

差异集中在**切点**与**落盘**：

| 维度 | A（`session/compaction.ts`） | B（`core/shell/compaction.ts`） |
|---|---|---|
| 切点函数 | `findCompactionCut(messages, keepRecent)` `:60-74` | `compactionCut(turns, keepRecent)` `:59-65` |
| dangling guard | ✅ `hasDanglingCalls(messages, index)` | ❌ **无** |
| 切点条件 | `index >= 2` 且 `role === "user"` | 同 |
| 默认 keepRecent | `KEEP_RECENT_MESSAGES = 4` | 同名常量 `= 4` |
| `estimateTokens` | `session/context.ts:7` **计入** tool_calls 的 id/name/arguments | `:48-52` **只计** `content.length` |
| 落盘 | `onCompact` 回调 → `appendCompactionEntry` | 直接 `appendCompactionEntry` + `markContextUnknown` |
| 触发 | 自动（threshold）+ 溢出恢复 | 手动 |
| 取消语义 | `CompactionLifecycle.before` 可返回 `false` | 无 |

---

## 3. A 的 guard 到底在防什么（原注释不准确）

A 的注释（`session/compaction.ts:78-84`）声称：

> 「Results after the cut stay paired with their own assistant message in the kept tail」

**这句话是错的**。若 `call` 在 head（被丢弃）而 `result` 在 tail（被保留），
tail 里出现的是**孤立 result**——它的 call 已经不在了。

**实测构造**（`compactionCut` 的实际算法，`keep=2`）：

```
输入:  [user, assistant(call_a), user, tool(result_a)]
cut = 2 (user)
head = [user, assistant(call_a)]      <- 丢弃
tail = [user, tool(result_a)]         <- 保留，但 result_a 的 call 已不在
```

`assistant(call_a)` 落在被丢弃的 head 里，而它的结果 `tool(result_a)` 留在 tail——
**注释声称的「配对」不成立**。

实测 `toChatMessages`（`turn/prompt.ts:87-88`）对孤立 result 的处理是**静默丢弃**：

```ts
} else if (message.role === "tool" && message.tool_call_id && pendingCalls) {
  const index = pendingCalls.findIndex((call) => call.id === message.tool_call_id);
  if (index === -1) continue;     // ← 孤立 result 被丢掉
```

**所以 guard 的真实作用是**：防止「一次工具调用的**结果**本可以留在 tail 里，
却因为它的 call 落在被丢弃的 head 里而被静默删除」。

**实测确认 guard 确实拦得住这个构造**：

```
msgs = [user, assistant(call_a), user, tool(result_a)]
cut  = 2
hasDanglingCalls(msgs, 2) = True   -> A 跳过该切点，继续往前找
                                      B 无此检查，直接采用 cut=2
```

即：这是 A 与 B 在**同一输入上的真实行为分歧**，不是理论差异。

### 3.1 后果没有初判的那么严重

我在勘查中一度推断「B 会把含未闭合 call 的 head 发给 provider，请求不合法」。
**这个推断是错的**：两条路径最终都经 `toChatMessages`（`turn/step.ts:106`），
而它会为未闭合 call 补 `(Operation cancelled or interrupted)`（`prompt.ts:67-69,101`）。

所以 B 缺 guard **不会**产生非法请求。真实损失是**保真度**：
一次工具结果在压缩后无谓地消失。

### 3.2 该场景是否可复现

需要「中间位置有未闭合 call，其后又有 user」。
`session/recovery/sessionReconciler.ts:17-51` 的 `reconcileDanglingToolCalls`
**只检查最后一条消息**——中间位置的 dangling call 不被修补。

即：**中断 → 恢复 → 用户继续发言**，可留下中间 dangling call。

**结论**：B 的 guard 缺失是**真实但轻微**的保真度缺口，不是协议缺陷。
是否补，应在 Phase 2 与 `estimateTokens` 的差异一并裁决。

---

## 4. P8：修复路径已确定

`03-*` 与 `07-*` 都记录了触发阈值的问题。本轮勘查把修复路径钉死了：

### 4.1 真实 usage 已经被记录，只是没被使用

`turn/step.ts:152-157` 每次响应都记录 `recordSessionUsage`，其中
`observability/usageTelemetry.ts:57` 写入 **`lastPromptTokens`**——**provider 报告的
真实 prompt token 数**。

它**已被 UI 使用**：
- `cli/interactive/sessionFacts.ts:67-68`（状态栏上下文百分比）
- `core/commands/contextCommandRuntime.ts:38,52`（`/context` 命令）

但**压缩触发不用它**：`session/compaction.ts:103-115` 的 `planCompaction`
读的是 `estimateTokens(...)`（`session/context.ts:7`，chars/3.5）。

**即：正确数字就在手边，触发函数拿的是估的。**

### 4.2 需要解决的三个接缝

| # | 问题 | 位置 |
|---|---|---|
| 1 | `createCompactionStep` 没有 `sessionId`，拿不到 usage | `session/compaction.ts:133-140` |
| 2 | `contextWindow` 取自**全局常量**（`runtimeConfig.contextWindow ?? 64_000`），模型目录里有**按模型**的值却不用 | `cli/runtime/cliSessionRuntimeFactory.ts:96` vs `core/models/catalog.ts:51-90` |
| 3 | `reserveTokens` 默认 8_000（我们）vs 16_384（参考实现） | `session/context.ts:5` |

**注**：`loadCatalog()`（`core/models/catalogStore.ts:45-52`）每次调用都同步读文件——
**不能在每步热路径里调**，应在工厂构造时解析一次。

### 4.3 量化的偏差（沿用 `07-*` 的算法）

$$\text{我们} = 64{,}000 - 8{,}000 = 56{,}000 \quad\text{vs}\quad \text{参考}(128\text{k 模型}) = 128{,}000 - 16{,}384 = 111{,}616$$

大窗口模型上**早约 55,616 tokens** 触发。

---

### 4.4 重复常量清单（实测）

| 常量 | 值 | 副本数 | 位置 |
|---|---:|---:|---|
| `CHARS_PER_TOKEN` | 3.5 | **3** | `session/context.ts:3`（导出）、`core/commands/contextCommandRuntime.ts:24`（私有）、`core/shell/compaction.ts:48`（私有） |
| `KEEP_RECENT_MESSAGES` | 4 | **2** | `session/compaction.ts:5`（导出）、`core/shell/compaction.ts:45`（导出） |
| `DEFAULT_RESERVE_TOKENS` | 8000 | 1 | `session/context.ts:5` |

`CHARS_PER_TOKEN` 的 3 份是**同一比率的 3 处独立声明**——
改一处不会改另两处，而它们都参与「上下文还剩多少」的判断。

---

## 5. Phase 2 的三项候选与各自成本

| 项 | 来源 | 状态 | 成本 |
|---|---|---|---|
| **P8 触发依据** | `07-*` §2.1 | 路径已明（§4） | 中：3 个接缝 + 一处常量 |
| **切点 split-turn** | `07-*` §2.2 | 已构造复现 | 中高：需要新切点语义 |
| **B 的 guard** | 本轮 §3 | 真实但轻微 | 低：一处改动 |

### 5.1 split-turn 缺口已复现

一个巨型 turn（`user` + 20×(assistant+tool)）上：

```
巨型 turn 长度: 41
findCompactionCut 找到的 cut: None
```

**`None` 意味着整段超大 turn 无法压缩**，溢出恢复（`turn/session.ts:216`）复用同一函数，
同样返回 `false` → 用户看到 provider 拒绝。

### 5.2 A 与 B 合并的代价（初判，待子代理确认）

不建议本轮合并：

- B 直接落盘 + `markContextUnknown`，A 走 `onCompact` 回调——**落盘责任不同**
- A 有 overflow 语义与可取消 lifecycle，B 没有
- 合并需统一「谁负责写 transcript」，触及 `sessionRuntime` 与工厂

**保留两个的理由**：A 服务自动路径（需要 overflow 与取消），B 服务手动路径（需要即时落盘与状态失效）。
差异是**真实的语义差异**，不是重复。

---

## 6. 方法教训（本轮自己踩的坑）

**第一次统计消费者时按 basename 匹配**，得出「`session/compaction.ts` 与
`core/shell/compaction.ts` 有 6 个相同消费者」的**错误结论**。
根因：`from "./compaction.js"` 之类的相对说明符被按文件名匹配，两个同名文件互相污染。

**改正**：脚本解析每个说明符到真实路径再比对。

这与前一轮的三次误报同源——**证据搜索停在第一层**。已写进本文件备查。

---

## 7. 未能验证的项

1. **`reconcileDanglingToolCalls` 之外是否还有别的路径**会修补中间位置的 dangling call
   （只读了该文件本身，未穷举恢复链路）。
2. **`lastPromptTokens` 是否在所有 provider 路径上都非零**
   （若某 provider 不返回 usage，触发依据切换后需回退到估算——未验证回退条件）。
3. **A 与 B 合并的完整改动面**：子代理 `CompactLandscape` 正在核实，本文件 §5.2 是初判。
4. **未运行任何构建/测试/产品**：本文件全部为静态分析 + python 构造验证。
