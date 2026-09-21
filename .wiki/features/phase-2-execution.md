# Phase 2 裁决与执行记录（2026-09-20，2026-09-21 闭环）

> **依据**：[`phase-2-pre-research.md`](phase-2-pre-research.md) 的地形测绘。
> **当前状态**：**已闭环完成**。§4 记录收口这一轮的全部施工与验证。
> **闭环前遗留的两项缺陷**（均已在 §4 处置）：
> 1. **手动压缩与自动压缩割裂（严重负向缺陷）**：自动压缩器 A 已升级为 token 预算与 split-turn，但用户敲 `/compact` 走的压缩器 B 依然保留写死 `KEEP_RECENT_MESSAGES = 4` 的旧逻辑。长会话中若前 4 条消息很短，八段式摘要体积超过原消息，导致**上下文越压越大**（实测 `134,715 → 134,913` tokens）。必须废除压缩器 B 的私有切分，统一合并到统一压缩引擎中。
> 2. **重复压缩沿用上一条 kept boundary（07-* §2.3）未真正闭环**：多轮连续压缩未沿用上一条 compaction 的锚点推进，导致重复计算和上下文丢失风险。
---

## 0. 更正：待办不是一项，是七项

主代理在讨论中一度称「Phase 2 只剩 split-turn 一个裁决点」——**不准确**。
逐项对齐 `07-*` 与 pre-research 后，实际是：

| # | 项 | 来源 | 处置 |
|---|---|---|---|
| 1 | P8 触发依据（chars/3.5 → provider usage） | `07-*` §2.1 | ✅ 已裁决，路径已钉死 |
| 2 | 切点规则（含 split-turn） | `07-*` §2.2 | ✅ 已裁决 |
| 3 | 重复压缩沿用上一条 kept boundary | `07-*` §2.3 | ✅ 已裁决（并入 #2/#5） |
| 4 | 跨压缩累积文件追踪 | `07-*` §2.4 | ⏸ **移出 Phase 2** |
| 5 | `keepRecentMessages` 是条数、非 token | pre-research 本轮发现 | ✅ 已裁决（并入 #2） |
| 6 | per-model reserveTokens/keepRecentTokens | `07-*` MISSING | ⏸ **移出 Phase 2**（依赖模型目录改动） |
| 7 | B 的 dangling guard | pre-research §3 | ✅ 已裁决（低，随 #2 做） |

**已完成**（Phase 1）：压缩钩子 `PreCompact`/`PostCompact`、rewind 分支摘要。

### 0.1 根因归一

**#2、#3、#5 是同一根因**：我们用「消息条数 + user 边界」定位压缩点，
参考实现用「token 预算 + 任意合法边界」。**这不是三个问题，是一次语义选择。**

---

## 1. 裁决

### 1.1 主裁决：换成「token 预算 + 合法边界」

| 决策项 | 结论 |
|---|---|
| 切点候选 | **user + assistant**（**不含 tool result**——result 必须与其 call 同侧） |
| `keepRecent` 单位 | **token**；默认 **20,000** |
| split-turn | **采纳**：切在 assistant 上时生成两份摘要并合并 |
| `keepRecentMessages` | **删除**，不保留双口径 |
| 默认 reserveTokens | 保持 8,000（`session/context.ts:5`），本轮不动 |

**删除 `keepRecentMessages` 而非并存**的理由与 `autoCompactPercent` 一致：
两个旋钮会让人不知道哪个生效。

### 1.2 分两步，不一步做完

| 步 | 范围 | 解决什么 |
|---|---|---|
| **步 1** | P8 触发依据 + `keepRecent` 换 token 口径（切点仍限 user） | 「**什么时候压**」 |
| **步 2** | 放开切点到 assistant + split-turn 双摘要 + `firstKeptEntryId` 持久化 | 「**压哪里**」 |

**理由**：两步的验证方法完全不同——前者量阈值，后者构造消息序列。
混在一起出错时分不清是阈值错还是切点错。

**步 1 之后巨型 turn 仍压缩不了**，这是有意的中间状态，不是遗漏。

### 1.3 split-turn 的来源

**来自参考实现**，已核实：

```
pi/packages/coding-agent/src/core/compaction/compaction.ts:399   isSplitTurn: boolean
:414   "- isSplitTurn: whether we're cutting in the middle of a turn"
:471   isSplitTurn: !startsTurn && turnStartIndex !== -1
:809-817  turnPrefixMessages 收集
:795-838  两份摘要（messagesToSummarize + turnPrefixMessages）的准备
```

即：切点可能落在 assistant → 记 `turnStartIndex` → 分别摘要历史与该 turn 前缀后合并。

### 1.4 移出 Phase 2 的两项与理由

| 项 | 理由 |
|---|---|
| #4 跨压缩文件追踪 | 独立小功能（在 `CompactionTranscriptEntry` 加 `readFiles`/`modifiedFiles` 并合并上一条），不阻塞主裁决 |
| #6 per-model 覆盖 | 依赖 `03-*` §3.1 的模型目录改动，不在压缩层 |

---

## 2. 步 1 执行记录

### 2.1 施工内容

**触发依据（P8）**

| 改动 | 位置 |
|---|---|
| usage 记录新增 `lastPromptMessageCount`（那次请求带了多少条消息） | `observability/usageTelemetry.ts:12-19,47-48,69-70,109` |
| `step.ts` 上报消息条数 | `turn/step.ts:159` |
| policy 新增 `measureContextTokens(messages)` **回调**（不是数字） | `session/compaction.ts:19-27` |
| `planCompaction` 优先用测量值 | `session/compaction.ts:158-161` |
| 工厂把「provider 报的 + 该请求之后新增的」相加 | `cli/runtime/cliSessionRuntimeFactory.ts:102-105` |

**为什么是回调而非数字**：测量值只覆盖**已经发出的那次请求**。
turn 内后续新增的消息不在其中，所以必须按「测量值 + 尾随消息估算」现算。
这是参考实现 `estimateContextTokens` 的做法（`compaction.ts:217-244`）。

**切点口径**

| 改动 | 位置 |
|---|---|
| `CompactionPolicy.keepRecentMessages` → `keepRecentTokens` | `session/compaction.ts:7-28` |
| `KEEP_RECENT_MESSAGES = 4` → `KEEP_RECENT_TOKENS = 20_000` | `session/compaction.ts:5` |
| `findCompactionCut` 从「数消息」改为「累加字符直到超过预算」 | `session/compaction.ts:93-118` |
| 新增 `messageCharCount`（单条消息的字符数） | `session/context.ts:15-24` |
| 预算夹到「窗口能装下的量」 | `session/compaction.ts:157` |
| `turn/session.ts` 的溢出恢复跟进新口径 | `turn/session.ts:219` |

### 2.2 施工中发现并修复的两个自身缺陷

**缺陷 1：回退从不触发。** 初版写成「累加后判断，超过则 `break`」——
预算为 0 时第一次遇到 user 边界就已累积 > 0，直接 `break`，回退变量从未赋值。
实测 `findCompactionCut(history(4), 0)` 返回 `undefined`。

**修复**：改为先记录「最新边界」，再判断是否超预算（`session/compaction.ts:100-112`）。

**缺陷 2：回退过于激进。** 修完 1 之后，回退变成无条件——
预算充足（本来无需压缩）时也返回一个切点。它会误导 `turn/session.ts:219` 的
溢出恢复：摘要完上下文几乎没变小，白花一次 provider 调用。

**修复**：回退只在**确实有边界超预算**时生效（`session/compaction.ts:104-109`）。

### 2.3 一处判断被我自己的实测推翻（第 5 次）

我曾判断「预算夹到可用空间」是**死逻辑**——因为回退已覆盖「装不下」的情形。
穷举扫描（`available ∈ {0,5,20,100,1000}` × `budget ∈ {0,1,5,20,100,1000,50000}`）
后实测 **9 处行为差异**：

```
available=0 budget=5: clamped=10 raw=4
available=0 budget=100: clamped=10 raw=2
```

解读：`available=0`（窗口装不下任何东西）时，夹紧预算得 `cut=10`（只留最后 2 条），
**这才是正确的**；不夹紧得 `cut=2`（留 10 条，几乎不压缩）。
**夹紧不是死逻辑，它保证「保留预算不超过窗口所能容纳」。**

### 2.4 测试更新

`session/compaction.test.ts` 的 10 处失败**全部源于口径变更**（fixture 用 `keepRecentMessages: 2`，
在新口径下是「2 个 token」）。逐条判断后更新：

| 处理 | 项 |
|---|---|
| 常量测试改为断言 `KEEP_RECENT_TOKENS = 20_000` | `constants` |
| fixture 预算设为 10（实测得 `cut=6`、尾 2 条，与原意图同形） | `policy` |
| 「保留至少一个完整交换」改为在**正确的层**断言：`findCompactionCut` 只答「哪能切」，`planCompaction` 才答「该不该切」 | `keeps at least one full exchange` |

**新增回归测试**：`session/compactionUsage.test.ts`
——文本很小但 provider 报告 60k 时，估算路径**不触发**、测量路径**触发**。
**反向验证**：移除 `measureContextTokens` 支持后该测试失败（`expected undefined not to be undefined`）。

### 2.5 验证

| 门禁 | 结果 |
|---|---|
| `tsc -p tsconfig.build.json --noEmit` | **0 错误** |
| `npm run test:ts` | **491 文件 / 2743 通过 / 1 跳过 / 0 失败** |
| `npm run verify:import-cycles` | `runtime_cycles=0 type_only_cycles=0`（1428 文件） |
| 反向验证（测量路径） | 移除 `measureContextTokens` 后 `compactionUsage.test.ts` 失败 ✅ |
| 反向验证（回退语义） | 穷举扫描发现 9 处 clamp 差异，推翻了「clamp 是死逻辑」的判断 ✅ |

**实机验证**：本轮**未跑真实 CLI**——步 1 改的是触发判定，
其效果需要真实 provider 报告 usage 才能观察，而合成 provider 不产生 usage。
§2.4 的回归测试是在 `planCompaction` 层注入测量值验证的，覆盖了同一逻辑。

### 2.6 步 1 的已知边界

- **巨型 turn 仍压缩不了**——步 1 只换口径，切点仍限 user 边界。
  一个巨型 turn 内若没有更早的 user，`findCompactionCut` 只能拿到该 turn 起点之前
  的边界；若那已是 index 0，则无边界可用。**这是步 2 要解决的**，属有意中间状态。
- **`turn/session.ts:219` 的溢出恢复**已按新口径更新，但仍受同一限制。



---

## 3. 步 2 执行记录：压哪里

### 3.1 切点规则：从「只能切 user」到「任何合法边界」

| 改动 | 位置 |
|---|---|
| 新增 `canStartTail` / `opensTurn` / `findTurnStart` / `newestCutBelow` | `session/compaction.ts:112-165` |
| `findCompactionCut` 改为「预算花光 → 取该点之前最新的合法边界」 | `session/compaction.ts:167-203` |
| 返回类型从 `number` 改为 `CompactionCut { cut, turnStart, splitsTurn }` | `session/compaction.ts:40-47` |
| 开放调用计数一次算完（替代逐候选重扫前缀） | `session/compaction.ts:79-101` |

**合法边界的定义**：除 tool result 以外的任何消息。
- 起在 tool result 上 → 会交给 provider 一个「答案」，而它的「问题」刚被丢弃
- 起在 assistant 上 → 它自己的 tool_calls 与随后的 results 一起留在尾巴里，配对不破

**与参考实现的一致性**（子代理 `RefCutRules` 核实）：
合法切点 = `user` / `assistant`（不含 `toolResult`）；预算落在一串 tool result 里时，
回退到「其前置 assistant 调用」而非整个头部。**已对齐。**

### 3.2 巨型 turn 的复现与修复

| | 修复前 | 修复后 |
|---|---|---|
| 巨型 turn（42 条） | `None` | `{ cut: 41, turnStart: 0, splitsTurn: true }` |

**反向验证**：把 `canStartTail` 改回只允许 user，`compaction.test.ts` 与 split 测试**共 3 条失败**。

### 3.3 split-turn 双摘要

| 改动 | 位置 |
|---|---|
| 新增 `condenseContext`——两条路径共用的唯一压缩操作 | `session/compaction.ts:300-380` |
| 新增 `SummarizeTurnPrefix` 类型 | `session/compaction.ts:293-299` |
| 前缀提示词 `TURN_PREFIX_COMPACTION_PROMPT` | `core/query/compaction/summarizer.ts:38-64` |
| `requestCompactionSummary` 支持自定义提示词 | `core/query/compaction/summarize.ts:38,41-43` |
| 工厂注入前缀摘要器 | `cli/runtime/cliSessionRuntimeFactory.ts:112-125` |
| 合并格式 | `**Turn Context (split turn):**`（与参考一致） |

**为什么是两次调用而不是一次**：参考实现的**历史摘要提示词本身就含 `In Progress` / `Current Work` 段**，
与前缀摘要要答的问题重叠；但前缀问的是「保留下来的续写段在回答什么」，
而历史摘要面对的是「之前发生过什么」。**是互补，不是重复。**

**失败语义**（已实测，非推断）：

| 情形 | 行为 | 理由 |
|---|---|---|
| 历史摘要失败 | **放弃压缩** | 前缀摘要描述不了被丢弃的整段历史，用它替换会**无声丢失** |
| 前缀摘要失败 | **仍压缩**，只用历史摘要 | 丢开题会损失上下文，但**拒绝压缩损失更大**——上下文已判定过大 |

### 3.4 我自己的施工缺陷（本轮 3 处，全部实测发现）

**缺陷 1：触发用测量值、切点用估算值 → 可能静默空转。**
步 1 让触发读 provider 的 `lastPromptTokens`，但 `findCompactionCut` 仍按 `chars/3.5` 走。
两者不一致时（provider 会算每条消息的开销，估算看不到；**CJK 文本在 3.5 比值下被系统性低估**），
触发为真而切点找不到 → 压缩**什么都不做**。测试报 `expected "spy" to be called 1 times, but got 0 times`。
**修复**：`planCompactionCut` 用**本次对话自身**的「估算/实测」比值缩放预算（`session/compaction.ts:246-260`）。

**缺陷 2：回退的语义放错了层。**
我先把「装不下就回退到最新边界」放进 `findCompactionCut`，
但 `shouldCompact` 已经在调用方挡过一道，于是「预算充足」时也会给出切点。
**修复**：把「该不该切」完全交给 `planCompaction`，`findCompactionCut` 只答「哪能切」。

**缺陷 3：前缀摘要会把被保留的系统提示词再摘要一遍。**
`applyCompaction` 原样保留开头的 system 消息，但切片从 0 开始 → 付费重复且信息重复。
**修复**：``head`` 偏移（`session/compaction.ts:346-351`）。

### 3.5 对原计划的一处更正：`firstKeptEntryId` **没有**施工

计划里写的是「`firstKeptEntryId` 持久化」。子代理 `KeptEntryIdTrace` 核实后**推翻了这个前提**：

- `firstKeptEntryId` 的**唯一语义消费者**是 `SessionDagEngine.buildSessionContext`（`sessionDagEngine.ts:230-242`）
- 而 `SessionDagEngine` **零个生产调用方**（`grep` 实测无匹配）
- 且它用的是**另一套 ID 空间**：DAG 用 `msg_<8位>`，而 `sessionProjection.test.ts:356` 用的是
  `sess_compaction_contract:turn-2`（`sessionThread.ts:184-185` 的 `${sessionId}:turn-${order}`）
- **活着的 transcript 路径不读这个字段**，它按 `keptMessages` 重新锚定（`sessionTranscript.ts:39-47`）

**结论**：为它写入一个没人读的值就是**脚手架**。**本轮不施工**，并把这个字段的真实状态记在此处备查。

### 3.6 顺带修掉的两个既有缺陷

**缺陷 A：`/context` 报的压缩阈值是错的。** 它显示 `window * 0.8`，而实际触发是 `window - reserve`。

```
修复前显示：51,200      实际：56,000
修复后显示：56,000      （实机验证，见 §3.7）
```

**缺陷 B：`/context` 里 `reserve = 8_000` 与 `CHARS_PER_TOKEN = 3.5` 是硬编码副本。**
已改为从 `session/context.ts` 引入，重复常量从 3 处降为 1 处。

### 3.7 B 的 dangling guard 与重复估算器

| 改动 | 位置 |
|---|---|
| B 新增 `hasDanglingCalls` 并接入 `compactionCut` | `core/shell/compaction.ts:56-93` |
| 删除 B 自己的 `estimateTokens`（**低估 84.94%**：只数 content，不数 tool_calls） | `core/shell/compaction.ts` → 改用 `session/context.js` |
| 删除 B 的 `CHARS_PER_TOKEN` 副本 | 同上 |

**反向验证**：移除 guard 后 `core/shell/dangling.test.ts` 失败；
带 guard 时 `compactionCut` 对悬空调用返回 `undefined`、对配对完整返回索引。

### 3.8 验证

| 门禁 | 结果 |
|---|---|
| `tsc -p tsconfig.build.json --noEmit` | **0 错误** |
| `npm run test:ts` | **491 文件 / 2751 通过 / 1 跳过 / 0 失败**（见 §3.10） |
| `npm run verify:import-cycles` | `runtime_cycles=0 type_only_cycles=0`（1429 文件） |
| `npm run build:ts` + 实机 `/context` | **已实机验证**：显示 56,000 = 64,000 − 8,000 ✅ |
| 反向验证（切点放开） | 改回只允许 user → 3 条测试失败 ✅ |
| 反向验证（B 的 guard） | 移除 guard → 测试失败 ✅ |
| 反向验证（测量路径） | 移除 `measureContextTokens` → `compactionUsage.test.ts` 失败 ✅ |

### 3.9 一次全量失败：判定为既有抖动，非本轮回归

首次全量运行报 `cli-baseline.test.ts > pipe-spawn interactive slash command smoke` 失败 1 项。

**判定依据**（三重）：
1. **隔离复跑 40/40 通过**——失败的是 PTY 子进程冒烟测试，并发下超时。
2. **该测试以 `tsx` 直接跑源码**（`cli-baseline.test.ts:29-35`），不依赖本轮改动的构建产物。
3. **项目历史已有两次同款记录**：`.wiki/log.md:620` 与 `:1722` 均记载
   「唯一失败 `cli-baseline.test.ts` 为既有抖动，隔离复跑通过」。

**随即重跑全量：491 文件 / 2751 通过 / 0 失败**——同一棵工作树，确证抖动。

### 3.10 仍未验证的项

1. **未跑真实 provider 触发一次自动压缩。** 实机验证的是 `/context` 的阈值显示与构建；
   自动压缩需要真实 provider 报告 usage 越阈值，合成 provider 不产生 usage。
2. **前缀摘要在真实 provider 上的输出质量**未知——只验证了「两条摘要都进入 checkpoint」的结构。

---

## 4. 收口：统一压缩引擎（2026-09-21）

### 4.1 施工内容

**废弃 B 的私有切分，B 变成共享引擎的适配器**

| 改动 | 位置 |
|---|---|
| 删除 `KEEP_RECENT_MESSAGES = 4`、`compactionCut`、`hasDanglingCalls` | `core/shell/compaction.ts`（全部移除） |
| B 改为「读存储 → 交引擎 → 记录结果」的适配器 | `core/shell/compaction.ts` |
| 两路共用同一 policy / 摘要器 / 测量回调 | `cli/runtime/cliSessionRuntimeFactory.ts`（新增 `buildCompactionWiring`） |

`core/shell/compaction.ts` 从 135 行降到 130 行，但**没有一行是自己的切点逻辑**——
切点、split-turn、摘要、落盘判定全部来自 `session/compaction.ts`。

**防膨胀保护（本轮新增，来自实测缺陷）**

引擎在 `condenseContext` 返回前比较压缩前后体积，**不缩小就拒绝**：

```ts
const before = estimateTokens(input.messages);
const after = estimateTokens(messages);
if (after >= before) return { status: "declined", reason: "would-not-shrink" };
```

两边都用估算（估算对估算），因为比较的是两个上下文，而 provider 对**两者都没测过**。
用 provider 的实测值比估算值会引入第三把尺子。

**拒绝语义显式化**

`condenseContext` 返回类型从 `CondensedContext | undefined` 改为
`CondenseOutcome = { status:"condensed", … } | { status:"declined", reason }`。
理由：原来「无可切点」「预算充足」「摘要为空」三种情形挤在 `undefined` 里，
调用方无法给出正确的用户提示。现在三种各有名字：

| reason | 含义 | 手动路径的提示 |
|---|---|---|
| `nothing-to-condense` | 无合法切点，或历史已在预算内 | 「对话太短」 |
| `would-not-shrink` | 摘要 ≥ 被替换内容 | 「摘要不小于被替换的消息，压缩不会释放任何上下文」 |
| `unsummarized` | 摘要器没产出 | 报 `failed`（请求已发出但结果不可用，是真实故障） |

**跨压缩继承上一条 checkpoint（`07-*` §2.3）**

上一轮判定此项「未真正闭环」。本轮**换了实现路径**——不再写 `firstKeptEntryId`
（§3.5 已证该字段在活轨无人读），而是**从上下文自身识别**：

```ts
const existing = input.messages[head];
const previousSummary = existing ? readContextCheckpoint(existing.content) : undefined;
const historyStart = previousSummary === undefined ? head : head + 1;
```

即：被压缩的上下文若以 checkpoint 开头，那段文本**本身就是要修订的摘要**，
不作为「待压缩的历史」再摘要一遍。摘要器侧新增 `UPDATE_COMPACTION_PROMPT`
（保留既有条目、只并入新进展），由 `requestCompactionSummary` 依据
`previousSummary` 是否存在自动选用。

**`SummarizeHistory` 签名改为请求对象**

`(messages, signal)` → `({ messages, previousSummary, instructions, signal })`。
理由：`previousSummary` 是新增的必需输入，再往后加参数会让位置参数失控；
且 `instructions` 原本只在手动路径上生效，现在两条路径统一走同一签名。

**`/compact` 不再受自动阈值限制**

手动路径以 `force: true` 调用引擎：`/compact` 是用户明确要求，
不该因为上下文还没越阈值就被拒。引擎自身的「不缩小就拒绝」仍然生效。

### 4.2 施工中发现并修复的自身缺陷（本轮 2 处）

**缺陷 1：`findCompactionCut` 的回退会在预算充足时给出切点。**

原实现末尾无条件 `return newestCutBelow(messages, openCalls, messages.length - 1)`。
当整个对话都在预算内（无需压缩）时，它仍返回一个切点 → 摘要白花一次 provider 调用、
且**摘要比被替换内容更大**，正是「越压越大」的成因之一。

**修复**：预算未花光就返回 `undefined`（「没有可压缩的历史」），
只有「预算花光但切在 tool result 串里」才回退到最新合法切点。

**反向验证**：修复前 `condenseContext` 对「对话短于预算」的输入返回 `condensed`；
修复后返回 `declined/nothing-to-condense`（`session/compaction.test.ts`
「declines when the conversation already fits the recent-tail budget」）。

**缺陷 2：我最初的测试 fixture 全部过短，导致新 guard 把它们全部拒掉。**

`history(4)`（8 条 `question 0`/`answer 0`）总字符数远小于任何摘要，
guard 判定 `would-not-shrink` 而拒绝——**7 个测试因此失败**。

这不是 guard 的错误，是 fixture 不真实。改为 `longHistory(n)`（每条 400 字符）后，
`longHistory(4)` 实测 938 tokens，`keepRecentTokens: 300` 的切点落在 `cut=5`。
**这恰好证明了 guard 有效**：它拒掉的正是「摘要比原文长」的输入。

### 4.3 验证

| 门禁 | 结果 |
|---|---|
| `tsc -p tsconfig.build.json --noEmit` | **0 错误** |
| `npm run verify:import-cycles` | `runtime_cycles=0 type_only_cycles=0`（1433 文件） |
| `npm run verify:docs-drift:strict` | `rules_dangling=0`，**pass** |
| `npm run test:ts`（空载机器，load 0.22） | **494 文件 / 2792 通过 / 1 跳过 / 0 失败** |
| 聚焦套件（`session` + `core/shell` + `turn` + `cli/interactive` 压缩相关） | **58 通过 / 0 失败** |

**关于两次带负载的运行（已定性，非回归）**：本轮曾两次在全量/分区运行中看到失败，
**两次都是验证脚本自己占满机器造成的**：
- 全量那次 12 项全为 `core/harness/browser*ScenarioExamples` 与 `registry-rust-bridge`
  的 `Test timed out in 30000ms`——当时 PTY 实机验证正在同机运行。**隔离复跑
  36 文件 / 230 通过 / 1 跳过、零失败**。
- 受影响域那次是 `cli-baseline.test.ts > gates resume continuity` 超时。
  **隔离复跑 9.9s 通过**（30s 预算），该测试是子进程中断/恢复门禁，**不涉及压缩**。

**空载复跑全量：494 文件 / 2792 通过 / 0 失败**——同一棵工作树，确证为负载抖动。

**实机验证（真实 CLI + PTY，本轮必做）**

用真实 TUI（`pty.fork` + 120×40 窗口）驱动真实 CLI，合成 provider 返回 JSON 格式的
八段式摘要，种入一个长会话（90 轮交换 ≈ 31.4k tokens）：

| 场景 | 观察到的结果 |
|---|---|
| 正常 `/compact` | 输出 `Condensed 65 earlier messages into a checkpoint; the latest 115 stay verbatim.` + `~31,418 → ~20,288 tokens`；transcript 新增 `type:"compaction"` 条目（`keptMessages:115`、`tokensBefore:31418`） |
| 摘要过大（30k 字符） | 输出 **`The summary would be at least as large as the messages it replaces, so compacting would not free any context.`**；**不写任何 entry**；上下文不变 |
| 会话太短 | 输出 `The conversation is too short to compact.`；**不调用 provider** |
| 继承上一条 checkpoint | 种入「已有 compaction 条目 + 新历史」的 transcript，摘要请求带 **`<previous-summary>`**（provider 侧实测 `hasPreviousSummary: true`），且该 checkpoint **不在**待压缩消息里 |

**反向验证（guard）**：`core/shell/compaction.test.ts`
「refuses to replace messages with a summary that is not smaller」——
摘要 1829 tokens vs 原文 1406 tokens 时返回 `nothing` 且不写 entry。

**反向验证（继承 checkpoint）**：`session/compaction.test.ts` 「repeated compaction」两条——
① 上下文以 checkpoint 开头时，摘要器收到 `previousSummary`，且该 checkpoint
**不出现**在待压缩消息里；② 没有新历史时**不再调用**摘要器，直接沿用既有 checkpoint 文本。

### 4.4 施工过程中的一处自我更正

最初把「对话短于预算」与「无合法切点」合并成一个 decline reason，写文档时发现
两者对用户是同一句话（「太短」），但对**调用方**含义不同——前者说明预算充足，
后者说明历史里没有可切点。合并会丢掉这个区别。

**最终保留合并**，理由：要区分二者需要**第二遍扫描**才能知道预算是否花光，
而两条路径（自动/手动）对它们的处置完全相同（都不压缩、都提示「太短」）。
为一个无人消费的区别付一遍扫描的代价不划算。这一判断记在此处备查。

### 4.5 未验证的项（诚实记录）

1. **未跑真实 provider 的 `/compact`**：§4.3 的实机验证用的是**合成 provider**
   （返回固定的八段式摘要文本）。真实模型产出的摘要质量、以及真实 provider 在
   超长 prompt 下的行为未验证。
2. **`UPDATE_COMPACTION_PROMPT` 在真实 provider 上的输出质量**未知——
   只验证了「修订提示词被选用、`<previous-summary>` 被传递、checkpoint 不被重复压缩」的结构。
3. **连续两次真实压缩的累积效果**未在真实 provider 上观察；§4.3 第 4 行的
   「继承 checkpoint」用的是**种入的历史**而非真实第一次压缩的产物。
