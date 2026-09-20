# Phase 2 裁决与执行记录（2026-09-20）

> **依据**：[`phase-2-pre-research.md`](phase-2-pre-research.md) 的地形测绘。
> **性质**：先记录裁决，再施工。本文件随施工进度更新。

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


