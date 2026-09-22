# turn 实现与参考项目（pi）的差异对照

> 回答"我的 turn 是根据 pi 实现的，现在还存在差异吗？"
> 参考项目只读，位于 `~/projects/pi`。本文只做**语义对照**，不复制实现。
> 所有 pi 侧论断标注 `file:line`；所有本仓侧论断同样标注。

---

## 0. 结论先行

**差异存在，而且是结构性的，共 3 处：**

| # | 差异 | 本仓 | pi | 影响 |
|---|---|---|---|---|
| **1** | `afterToolCall` 的结构化出站通道 | `AfterToolCallUpdate` 只有 `{output, isError, terminate}`（`core/agent/tools.ts:50-54`） | `AfterToolCallResult` 有 **`details?: unknown`**（`packages/agent/src/types.ts:84-95`） | **这是 CB-005 的真实缺口** |
| **2** | 结构化数据挂在哪 | 独立汇总对象 `CodingResultSummary`（`result/types.ts`） | 挂在**消息**上：`CustomMessage.details`（`harness/messages.ts:30-37`） | 本仓多出一整层"汇总对象" |
| **3** | 终态形态 | `query.completed.result` 含 `codingResult` 一族 | `OperationResultRecord` = `{operationId, kind, status, error, tipId, startedAt, endedAt}`（`harness/session/types.ts:108-117`） | pi 的终态**没有**验证汇总 |

**pi 完全没有 `codingResult` 这个概念**：
`grep -rn "codingResult" packages/` = **0**；`changedFiles` / `verifiedFiles` /
`taskSatisfaction` / `taskVerdict` 同样 = **0**。

---

## 1. 差异一：`afterToolCall` 的 `details` 通道（最关键）

### pi 侧

```ts
// packages/agent/src/types.ts:84-95
export interface AfterToolCallResult {
  content?: (TextContent | ImageContent)[];
  details?: unknown;        // ← 结构化出站通道
  isError?: boolean;
  usage?: Usage;
  terminate?: boolean;
}
```

pi 的 `details` **确实被消费**（`harness/hooks.ts:300/315/321`），
并且工具结果消息本身也带 `details`（`harness/messages.ts:111/119` 的
`createCustomMessage(..., details, ...)`）。

### 本仓侧

```ts
// core/agent/tools.ts:50-54
export interface AfterToolCallUpdate {
  readonly output?: string;
  readonly isError?: boolean;
  readonly terminate?: boolean;
}
```

**没有 `details`，没有 `content`，没有 `usage`。**

### 这解释了什么

`turn/tools.ts` 在审批点**确实持有数据**：

```ts
// turn/tools.ts:123
const approvals = new Map<string, { operation: string; decision: string }>();
// turn/tools.ts:130
if (permission.approved) approvals.set(call.id, permission.approved);
```

但在 `afterToolCall`（`:154-173`）里，这份数据只被用来**拼一行文本**（`:158-159`），
然后 `:173` 只返回 `{ output }`——**结构化部分被丢弃**。

**这不是"本仓漏抄了 pi 的某个功能"，而是：pi 有这条通道，本仓在移植时把它削掉了。**

---

## 2. 差异二：结构化数据挂在消息上 vs 独立汇总对象

| | pi | 本仓 |
|---|---|---|
| 结构化数据载体 | `CustomMessage.details?: T`（`harness/messages.ts:30-37`） | `CodingResultSummary`（`result/types.ts:255-282`，28 个字段） |
| 工具结果载体 | `ToolResultMessage` 带 `details` | `AgentToolResult` 只有 `output` |
| 终态汇总 | **无** | `query.completed.result.codingResult` |

pi 的选择是：**结构化信息跟着消息走，不另立汇总对象**。
本仓多出了一整层 `CodingResultSummary` 及其投影链。

---

## 3. 差异三：终态形态

```ts
// pi: packages/agent/src/harness/session/types.ts:108-117
export interface OperationResultRecord {
  operationId: string;
  kind: OperationMeta["intent"]["kind"];
  status: TerminalStatus;
  error?: OperationError;
  fromTipId: string | null;
  tipId: string | null;
  startedAt: number;
  endedAt: number;
}
```

**没有 `changedFiles`、没有 `verification`、没有 `taskSatisfaction`、没有 `provenance`。**

本仓的 `query.completed.result` 则带着 `codingResult` 一族（含 `verification`、
`taskSatisfaction`、`provenance`、`lastActionResultSeed`）。

---

## 4. `codingResult` 一族在本仓的**真实年龄**

这一点决定了"为什么不能直接删"：

| 事实 | 证据 |
|---|---|
| `codingResult` 最早出现于 **2026-04-21** | `git log -S"codingResult" --reverse` 首条 = `4b00f24f`（2026-04-21） |
| turn 迁移（对齐 pi）发生于 **2026-09-12** | `a7418fcb` |
| 即：**`codingResult` 比 pi 对齐工作早 5 个月** | 两者时间差 |

**所以 `codingResult` 不是 pi 迁移的产物，而是迁移前的旧架构遗留。**
pi 对齐工作删掉了它的**生产者**（`orchestration/`），但没删掉它**本身**。

---

## 5. 生产环境的实测状态

### 5.1 面板已经不可见

| 环节 | 位置 | 状态 |
|---|---|---|
| 生产者 | `turn/projection.ts:110-145` | 发出的 `result` **不含 `codingResult`** |
| 赋值 | `core/shell/sessionTerminalState.ts:67` | `event.result.codingResult` → **恒为 `undefined`** |
| 渲染 | `core/shell/sessionTerminalState.ts:300-302` | `if (!codingResult) return;` → **面板从不渲染** |

### 5.2 真实会话数据

84 个真实会话（`~/.cheers/sessions`）：

| 检查 | 结果 |
|---|---|
| 含 `query.completed` 事件的会话 | 23 |
| 其中 `result` 含 `codingResult` 的 | **0** |
| 真实 completed 事件的 `result` 字段 | `status` / `terminalClassification` / `terminalReason` / `transcript` / `sharedContext` / `finalOutput` |

（另有 3 个文件 grep 命中 "codingResult"，逐条核对后**均为聊天文本**——
是对话里讨论这个词，不是事件数据。）

### 5.3 测试为何没发现

`core/shell/sessionRuntime.test.ts` 等 **手工注入** `codingResult`
（`:581`、`:682`、`:997`、`:1296`、`:1459` …），
没有任何测试断言**活路径真的产出**它。

---

## 6. 于是"为什么不直接删"有了准确答案

**你的直觉方向是对的，但前提要先分清两件事：**

| 对象 | 能否直接删 | 理由 |
|---|---|---|
| `runtime/loop` + `runtime/api/host`（旧 provider 路径） | **能** | 生产零值导入；provider 硬编码合成；无外部消费者 |
| `codingResult` 一族 | **不能直接删** | 它是**独立于 pi 迁移的旧架构**，被 42 个生产文件引用，其中含**活路径**上的续跑/恢复逻辑 |

**关键**：`codingResult` 的两个死字段——
`provenance`（`result/types.ts:280`）与 `lastActionResultSeed`（`:278`）——
**是 `CodingResultSummary` 的字段**。

所以"删掉 `runtime/loop`"与"删掉 `codingResult`"是**两件独立的事**：

- 删 `runtime/loop` → 面板仍然不可见（因为生产者是 `turn/`，它本来就不产出）
- 删 `codingResult` → 会同时删掉 `session/continuation/*`、`session/recovery/*`
  里的续跑判定逻辑，那是**活路径在用的**

---

## 7. 决定性发现：`codingResult` 的多数内容**已有活轨替身**

这解释了为什么"直接删"是可行的、而不是"必须接回"。

| `codingResult` 里的死字段 | 活轨上的替身 | 状态 |
|---|---|---|
| `provenance.approvalDecisions`（`:280`，2 个生产读取者，**0 写入者**） | **审批审计记忆** `session/approval/auditProjection.ts:15-18`（`lastApprovalDecision` / `lastApprovalDecisionSource` / `lastApprovalPersistent` / `lastApprovalCacheEffect`） | **有活写入者**：`cli/approval/cliApprovalAuditBridge.ts:34` → `session/lifecycle/sessionLifecycleWrites.ts:107` |
| `lastActionResultSeed`（`:278`，16 个生产读取者，写入者**仅在测试**） | `extractActionHandoffSummaryFromMemory`（`sessionContinuitySnapshot.ts:82`）等 `workingMemory` 提取器 | 活轨 fallback 已存在 |
| `executionLane`（0 读取者） | 无 | 纯遗留 |

**`sessionContinuitySnapshot.ts` 的写法已经说明了一切**：
每一处 `codingResult` 读取后面都跟着 `?? extract...FromMemory(...)`：

```ts
// sessionContinuitySnapshot.ts:81-83
const lastActionHandoffSummary =
  buildActionHandoffSummary(lastCodingResult?.lastActionResultSeed) ??
  extractActionHandoffSummaryFromMemory(stateSnapshot?.workingMemory);
```

因为 `lastCodingResult` 恒为 `undefined`，**实际生效的一直是 `??` 右边那一路**。

**即：`codingResult` 是"旧架构的载体"，而它的职能已经由
审批审计记忆 + `workingMemory` 提取器在活轨上承担了。**

---

## 8. 于是"为什么不直接删"有了准确答案

**你的直觉方向是对的。** 但要分清两件事——它们**可以分开处置**：

| 对象 | 能否直接删 | 理由 |
|---|---|---|
| `runtime/loop` + `runtime/api/host`（旧 provider 路径） | **能** | 生产零值导入；provider 硬编码合成；无外部消费者 |
| `codingResult` 一族 | **技术上能，但需要一次判定** | 它比 pi 对齐早 5 个月；42 个生产文件引用；但它的**职能已有活轨替身**，且面板已不可见 |

**关键事实**：这两个死字段——`provenance`（`result/types.ts:280`）与
`lastActionResultSeed`（`:278`）——**是 `CodingResultSummary` 的字段**。

所以：

- 删 `runtime/loop` → 面板**仍然**不可见（生产者是 `turn/`，它本来就不产出）
- 删 `codingResult` → 需要迁移 42 个引用点，但**不丢失活轨功能**
  （因为职能已由审计记忆与 `workingMemory` 承担）

---

## 9. 修正后的选项

| 选项 | 动作 | 依据 |
|---|---|---|
| **O1'** | 删 `runtime/loop` + `runtime/api/host`，**不动** `codingResult` | 生产零值导入；但**不解决**面板不可见 |
| **O2'** | 照 pi 补 `AfterToolCallResult.details` 通道 | 差异一；但需先判定"产出什么形态"——pi 的答案是不立汇总对象 |
| **O3'** | 判定 `codingResult` 一族为旧架构遗留，**整体移除** | 面板已不可见、生产 0 产出、pi 无此概念、职能已有活轨替身 |

**`cb-005-recommendation.md` 里我建议的"接回 `codingResult` 产生"需要收回。**
理由：pi 的答案是**不立汇总对象**（结构化数据挂消息上），
所以"接回一个 pi 没有的概念"方向可疑；
**而 O3' 的证据（面板不可见 + 0 生产产出 + 职能有替身）比"接回"更硬。**
