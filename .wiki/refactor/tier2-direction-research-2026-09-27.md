# 第二档方向研究：参照 pi 重做，还是接入现有文件（2026-09-27）

本文件回答一个具体问题：

> 第二档那 55 个文件（16,531 行）里的能力，
> **应该参照参考实现（`~/projects/pi`）的方案重做，还是接入这些已存在的文件？**

**本文只做研究，不含任何删除或接线决定。** 分档与第一档裁决见
`dead-code-tiers-2026-09-27.md`。

---

## 0. 结论（先说结果）

**两个问题的答案不一样，必须分开处理：**

| 第二档的主题 | 结论 | 依据一句话 |
|---|---|---|
| **簇 1（34 文件 / 9,584 行）** 上下文获取与检索 | **参照 pi 重做 = 错方向；也不能直接接入**。这类能力**顶级项目普遍不做**——pi 完全没有，我们现有的活轨路线才是主流 | pi 的工具集只有 10 个文件 / 1,209 行，**无代码图、无获取引擎、无预算模块** |
| **簇 2（21 文件 / 6,947 行）** 多目标编辑事务与回滚 | **不能删，但也不能「接入现有文件」**——现有文件是「类型 + 部分实现」，缺执行器闭环。**参照实现也不可行：顶级项目自己没有** | opencode 在 `packages/core/src/file-mutation.ts:205` 原文写着 `TODO: Design multi-file transactions / rollback` |

**所以真正的答案既不是 A 也不是 B，而是第三个：**

> **这两簇都不该按「重做」或「原样接入」处理。**
> 簇 1 应当**核实后删除**（能力非必需，本产品路线与顶级项目一致）；
> 簇 2 应当**先决定这个能力要不要**——因为**没有任何可参照的现成方案**，
> 要就得自己做，不要就明确登记为放弃。

---

## 1. 关键实测证据

### 1.1 参考实现（pi）的完整能力面

```text
pi/packages/agent/src/harness/tools/   10 文件 / 1,209 行
  bash.ts  edit.ts  edit-diff.ts  file-mutation-queue.ts
  image.ts  index.ts  path-utils.ts  read.ts  tool-context.ts  write.ts
```

**pi 没有的东西（逐项实测）**：

| 能力 | pi 是否有 | 实测命令与结果 |
|---|---|---|
| 代码图 / 仓库图 | **无** | `grep -rln 'codeGraph\|repoGraph\|symbolGraph\|astGraph'` → 仅 tui 编辑器的无关命中 |
| 上下文获取引擎 | **无** | `packages/agent/src/harness/context.ts` 只有 **37 行**（类型定义） |
| 上下文预算 / 按 token 选上下文 | **无** | 仅 `compaction/branch-summarization.ts` 命中，属压缩不属于获取 |
| **多文件事务 / 编辑回滚** | **无** | `grep -rn 'rollback' packages/agent/src packages/coding-agent/src` → **0 命中** |

**pi 的实际做法**：多文件并发写入用**串行化队列**（`file-mutation-queue.ts`，**仅 62 行**）——
按「环境 + 规范化路径」串行化，防止同一文件被并发改写。**不做事务，不做回滚。**

### 1.2 其它顶级项目同样没有

| 项目 | 编辑事务 / 回滚 | 证据 |
|---|---|---|
| `opencode` | **无，且有明确 TODO** | `packages/core/src/file-mutation.ts:205`：`// TODO: Design multi-file transactions / rollback if apply_patch needs atomic edits.` |
| `oh-my-pi` | 无 | `rollback` 命中是 "early execution can be discarded **without** rollback"（语义相反） |
| `source-claudecode` | 无 | `rollback` 命中是 `rollbackConsolidationLock(priorMtime)`——**回滚文件 mtime 锁**，与编辑无关 |
| `pi` | 无 | 0 命中 |

**四个顶级项目，零个实现多文件原子编辑回滚。** opencode 把它写成了待办。

### 1.3 我们的活轨与 pi 的一致性

| 维度 | 我们（活轨） | pi |
|---|---|---|
| edit 工具进位 | **单文件**（`registry.ts` 的 `path` 字段） | **单文件**（`edit.ts:30` 的 `path` 字段） |
| 同文件多段替换 | `replaceManyInContent`（全对或全错） | `applyEditsToNormalizedContent` |
| 并发写保护 | `withFileLock`（`runtime/execution/fileLock.ts`） | `withFileMutationQueue`（按路径串行化） |
| 多文件 hunk 分组 | `edit/patch/plan/hunkSet.ts`（`groupByTarget`） | 无对应物 |

**结论：我们活轨的编辑能力与 pi 同构，方向一致。**

---

## 2. 簇 1 核实：能力非必需

**簇 1 的 55 文件逐文件核验**（`verify` 轮）显示 **34 个判为 `NONE FOUND`**——
但**「没有活等价」不等于「产品需要它」**。区分这两者是本节的目的。

**簇 1 想做的事**：扫描仓库 → 抽取符号/依赖 → 建立代码图 → 按 token 预算挑选 → 投递给模型。

**这是 RAG/索引式的上下文获取。** 实测：

- **pi 不做**：无代码图、无获取引擎、context.ts 仅 37 行
- **我们的活轨不做**：走的是「模型自己用 `read`/`grep`/`glob`/`lsp` 按需拿」的 agentic 路线
- **我们的活轨有替代**：`context/selection/model.ts`、`context/graph/contextPacket.ts`、
  `context/compact/*`（7 个子目录的压缩链）

**判定**：这类能力**不是产品缺口**，而是一条**未被采纳的路线**。
顶级项目一致选择 agentic 按需获取而非预建图——这与本产品的既有路线一致。

> **但「非必需」仍需维护者确认**，因为它是**产品方向**而非代码事实：
> 若未来要做「大仓库快速定位」，预建图是有价值的。**取决于是不是路线图的一部分。**

**我的建议**：登记为「路线未采纳」，删除时在 `capability-backlog.md` 留一条，
写明「若做索引式上下文，此处是曾经的实现」——避免未来重新发明。

---

## 3. 簇 2 核实：能力真实存在缺口，但无现成方案

### 3.1 活轨自己声明这个能力缺失（实测）

```text
edit/result/editCapabilityReadiness.ts:134-136
blocked("atomic-rollback", [
  "rollbackAtomicityClaim remains false",
  "no transaction rollback executor exists",
```

活轨**主动报告**「不存在事务回滚执行器」。这不是我的推断，是产品自己的状态声明。

### 3.2 死文件里确实有实现（但只到一半）

```text
edit/multifile/model.ts:118  runControlledMultiTargetMutation   ← 编排（真代码）
edit/multifile/model.ts:810-825  rollback 循环                  ← 逆序 writeTextFile 恢复
edit/recovery/model.ts       16 个 export，**全是 type/interface**  ← 只有契约，无执行
```

**所以现有文件的真实成色**：

| 部分 | 状态 |
|---|---|
| 多目标编排 + 回滚循环 | **有实现**（`model.ts`，868 行，含真实 `writeTextFile` 调用） |
| 恢复裁判的契约 | **只有类型**（`edit/recovery/model.ts`，844 行，零函数） |
| 与活轨的接缝 | **不存在**——`edit/patch/*` 的 hunk 是 `targetBinding: "single-target"` |

### 3.3 为什么「直接接入」也不成立

接入要解决三件事，而现有文件只提供了第一件：

1. **事务语义**：什么叫成功/部分失败/回滚成功——现有文件有（`MultiTargetSettlementStatus` 等）
2. **执行器**：按什么顺序写、失败如何逆序恢复——**部分有**
3. **接缝**：与 `edit` 工具、`agent` 循环、批准门、`editCapabilityReadiness` 的连接——**完全没有**

而且第 2 件与活轨的 `hunkSet`（单目标绑定）**契约不同**，不是改个字段能接上的。

### 3.4 参照实现不可行

**没有任何顶级项目实现它**（§1.2，四个项目零命中；opencode 还是 TODO）。
所以「参照 pi 重做」这条路**没有参照物**——要做得自己设计。

---

## 4. 那么该怎么选（三个选项，需维护者定）

| 选项 | 含义 | 成本 / 风险 |
|---|---|---|
| **A. 删除簇 2，登记为有意放弃** | 明确写「不做多文件原子事务」，`editCapabilityReadiness` 的 `blocked` 保持 | 成本 0；**但等于承认这块能力永久不做** |
| **B. 接入现有文件** | 用 `edit/multifile/model.ts` 的编排 + 回滚循环，补出接缝 | **中高**。要设计 hunk 契约变更、接门、写测试；且**无参照**，等于自己设计事务语义 |
| **C. 保留不接，登记 disposition** | 维持现状，等路线明确 | 成本 0；21 文件 / 6,947 行继续留着 |

**我的判断（需你确认）**：

- **不推荐 B 现在做**。理由：要动活轨的 hunk 契约（`single-target` → 多目标），
  这是编辑核心路径的**契约变更**，风险高于收益；而且 `editCapabilityReadiness` 把
  `automatic-recovery` 也标为 blocked（"restore requires explicit user/session action"）——
  说明**产品当前的设计意图就是「恢复要显式触发」**，自动回滚与之相悖。先确认设计意图，再谈实现。
- **A 与 C 之间**，A 更干净，但它是一个**产品能力取舍**，该由你定。
- 若选 C，建议**同时**在 `editCapabilityReadiness` 的对应条目上加注释指向这些文件——
  否则下次复核还会重新发现一遍「活轨说缺、死文件里有」。

**无论哪个，都不该在本轮动代码。**

---

## 5. 未验证事项

- 簇 1 的 34 个 `NONE FOUND` 是逐文件按导出面与职责判定的；
  **未**评估其与活轨 `context/compact` 链的**部分**交叠（如是否有个别文件值得并入）。
- 未读 `pi` 的 `packages/chord/src/context/index.ts`（57 文件包的单一出口）内容，
  仅确认 `chord` 是多智能体编排包、其 `context` 是单文件出口。
- 未评估「索引式上下文」对**大仓库场景**的实际收益——这需要基准测试，
  而本产品无此测试设施。
- 第四档未评估：`core/harness/` 内的场景文件是否应随簇一并处置。
- **第三档（3 文件 / 932 行）仍未查清**，不在本文范围。
