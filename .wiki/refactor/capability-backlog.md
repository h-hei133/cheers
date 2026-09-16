# 未实现能力登记（Capability Backlog）

> 用途：记录「测试期望但生产未实现」或「已废弃链曾具备、活轨缺失」的能力。
> 规则：**检测到有价值但未实现的能力 → 先登记并询问 → 由维护者决定是否保留 → 保留的项后续独立实现**。
> 与重构的关系：**不阻塞重构**。重构以结构为主，功能重建单独立项。

## 状态说明

- `待裁决` — 已登记，等维护者决定是否要做
- `已批准` — 决定要做，待排期
- `已拒绝` — 决定不做，对应测试应删除或收窄

---

## CB-001 会话续跑的决策追踪（decision trace / action-result seed）

- **状态**：`待裁决`（维护者已表示"有价值，先记录"）
- **发现于**：`cli-baseline.test.ts` 10 项失败（2026-09-16 定因）
- **登记的测试**：
  - `prefers completed current session for /continue follow-up over recovery fallback`
  - `carries completed-session failure diagnostic through /continue follow-up`
  - `keeps stopped recoverable result context actionable through bare and follow-up /continue`
  - `keeps writer-started stopped unknown write effect actionable through bare and follow-up /continue`
  - `keeps writer-started stopped unverified write effect actionable through bare and follow-up /continue`
  - `keeps selected-workspace writer-started unknown write effect truthful across process /continue`
  - `keeps selected-workspace writer-started unverified write effect truthful across process /continue`
  - `keeps non-write stopped patch-generation-failed evidence actionable through bare and follow-up /continue`
  - `keeps non-write stopped stale-read evidence actionable through bare and follow-up /continue`
  - `keeps non-write stopped approval-denied evidence actionable through bare and follow-up /continue`

### 能力描述

会话在关键状态下停住时（写入已开始但效果未知 / 写入后验证未通过 / 审批被拒 / 补丁生成失败 / 读到过期内容），把「上一轮动作的决策痕迹」压成结构化标记写入 `query.completed.sharedContext.notes`，使**下一轮**（用户输入 `/continue` 或后续追问时）能精确知道上一轮做到哪，而不是靠推测。

期望产出的标记形态（`cli-baseline.test.ts:3651-3660` 断言）：

```
decision-trace: seed=action-result seedAction=edit-file seedTarget=src/app.ts
                seedVerifyStatus=passed seedVerifyCommandInherited=yes
                diagnosticHandoff=success diagnosticTarget=src/app.ts
                diagnosticCommandInherited=yes diagnosticReason=yes
```

字段语义：

| 字段 | 含义 |
|---|---|
| `seed=action-result` | 存在上一轮动作痕迹（该标记的总开关） |
| `seedAction` | 动作种类（如 `edit-file`） |
| `seedTarget` / `seedChangedFiles` / `seedVerifiedFiles` | 目标与改动/验证面 |
| `seedWriterStarted` / `seedWriteEffect` / `seedRequiresUserInspection` | 写入是否开始、效果是否已知、是否需人工查看 |
| `seedVerifyStatus` / `seedVerifyCommandInherited` | 验证状态与是否继承验证命令 |
| `seedBlocker` / `seedReason` | 阻塞种类与理由 |
| `diagnostic*` | 成功/失败交接诊断（另一组标记） |

### 现状：为什么产不出

| | notes 产出 | 位置 |
|---|---|---|
| 旧链（**已删除**） | `decision-trace: seed=action-result …` | `orchestration/runtimeHandoffProjection.ts:123`（`buildActionResultSeedDecisionTrace`），唯一调用者 `planning/workflowTaskPlan.ts:89` |
| 活轨（**当前**） | `['steps: N']` | `turn/projection.ts:122` |

活轨缺失的**数据源**：

1. `turn/projection.ts` 的 `concludeRun` 产出的 `query.completed.result` 中**没有 `codingResult` 字段**（只有 `status`/`terminalClassification`/`terminalReason`/`transcript`/`sharedContext`/`finalOutput`）。
2. `lastActionResultSeed` 类型定义在 `orchestration/types.ts:278`，活轨 `turn/`、`core/agent/`、`core/query/` **均不产出**该字段。
3. `core/shell/recovery.ts:538 formatActionResultSeedEvidenceLine`（**CLI 可达**）与 `sessionTerminalState.ts:613`（渲染 `Continuation` 行）**都在消费**这些标记——即消费方存在，生产者缺失。

### 若要实现，涉及范围（估算）

1. 在 turn 内核产出等价于 `lastActionResultSeed` 的结构（动作种类、目标、写入效果、验证状态、阻塞种类），来源是 `AgentMessage[]` 与工具执行结果，与旧链的 `CodingResultSummary` 结构不同。
2. 在 `turn/projection.ts:122` 的 notes 中生成 `decision-trace: …` 行。
3. 复用现有消费方（`recovery.ts`、`sessionTerminalState.ts`），确认字段名匹配。
4. 顺带解决 B 类定因（`sessionTerminalState.ts:165` 把 `Continuation` 渲染门控在 `verbose`，compact 模式下不显示）。

**性质**：功能开发（约等于一个独立的 Phase），不是重构收尾。

### 决策选项

| 选项 | 含义 | 代价 |
|---|---|---|
| 删除断言 | 10 项收窄为「`/continue` 能恢复会话、能读到 transcript」的端到端验证 | 失去对「续跑上下文是否携带准确决策痕迹」的验证覆盖 |
| 独立立项实现 | 在活轨重建 seed/diagnostic 投影 | 需要设计 + 实现 + 验收，超出重构范围 |
| `it.skip` 过渡 | 暂时跳过并注明原因，等决策 | 测试套件留跳过项 |

**建议**：优先「删除断言 + 登记本项」。理由：消费方已在（`recovery.ts` 可达），生产者缺失不是删除造成的，是 Phase 4 turn 切换时未迁移的能力；重建属于功能开发，应在独立阶段做，不塞进重构。

---

## 登记流程（供后续复用）

1. 发现测试期望 ≠ 生产实现时，先判定：**是回退（实现改坏了）还是缺失（从未实现）**。
   - 回退 → 属重构范围内的修复。
   - 缺失 → 登记到本文档，状态 `待裁决`，并向维护者询问。
2. 维护者裁决后更新状态为 `已批准` / `已拒绝`。
3. `已拒绝` → 删除或收窄对应测试断言。
4. `已批准` → 独立立项实现，实现时把对应测试从失败/跳过状态恢复为通过。
