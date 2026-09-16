# 边界分析报告（2026-09-15）

> 工具：`scripts/analyze-boundaries.py`（四重证据：CLI 入口、scripts 入口、包公共 API、测试引用）。
> 本文件只记录测量事实与方向修正，不执行删除。

## 1. 测量结果

生产源文件 1361（CLI 可达 871，CLI 不可达 490）。490 的四重证据分解：

| 类别 | 数量 | 含义 |
|---|---:|---|
| 仅被测试引用 | 339 | 有 `.test.ts` 消费者，无 CLI/脚本/公共 API 消费者 |
| 零引用 | 146 | 无任何消费者（含测试） |
| 仅公共 API | 5 | 经 `src/index.ts` 导出闭包触达 |
| 仅脚本 | 0 | 历史 route 脚本删除后已归零 |

其中测试基建（`core/harness/*`、`test-utils/*`）共 45 个，应豁免；其余 445 为重构候选。

**公共 API 闭包 246 个文件**，经 `packages/ts-shell/src/index.ts` 暴露，并被 `scripts/verify-host-surface.mjs`（`verify:host-surface`）实测消费（调用 `createHostRuntime`、`projectHostJsonResponse`、`runEvaluationCase`）。因此公共 API 不是装饰，是受门控的契约面。

## 2. 候选集的真实结构：一个 310 文件的连体簇

对 445 个候选做连通分量分析：

- **1 个主簇 310 文件**（内部高度互引）
- 105 个小簇（最大 9）

主簇构成（一级模块）：`orchestration` 154、`edit` 60、`core` 24、`verification` 13、`planning` 11、`result` 9、`model-adapters` 7、`evidence` 6、`session` 6、`repair` 6、`context` 5，其余 ≤2。

关键性质：

1. **主簇与 CLI 活跃集的 import 泄漏为 0** —— 没有任何 CLI 可达文件 import 主簇内文件。这是"整簇隔离"的强证据。
2. 主簇的簇外非测试引用者只有 6 个，全部是测试基建（`core/harness/browserTxnEval.ts`、`test-utils/workspaceWriteResumeProducer.ts` 等）。
3. 主簇有 **254 个对应测试文件**（覆盖主簇内 255 个文件）。

## 3. 上一轮误判的根因

`model-adapters` 的 7 个文件（`client.ts`、`registry.ts`、`retryPolicy.ts`、`providers/openai/*`、`providers/anthropic/*`）**全部位于主簇内部**，是主簇的一部分，唯一的簇外引用者是同样在主簇内的 `orchestration/openAICompatibleAnchoredSmokeAdapter.ts`。

因此上一轮的判断错误在于：把"CLI 不可达"直接等同于"可删"，忽略了这些文件通过主簇内部互引形成了一个完整子系统；单独摘除子集必然破坏簇内依赖（这正是复核时看到的 `client.ts → registry.ts → adapters` 依赖链）。

`model-adapters` 的两个文件 `types.ts`、`jsonRepair.ts` 是 CLI 可达的（`types.ts` 同时是公共 API 闭包成员，被 308 处引用），确认存活。

## 4. 方向修正

原来的"按目录/按子域删除"改为**按连通分量整簇删除**：

- 删除单位不是文件或目录，而是**完整连通分量**；
- 主簇必须整簇评估、整簇删除（310 文件 + 254 个测试），不存在部分删除；
- 删除前必须证明：CLI 泄漏为 0、公共 API 泄漏为 0、scripts 泄漏为 0、簇外非测试引用仅限豁免区；
- `core/harness/*`、`test-utils/*` 永久豁免（测试基建）；
- 公共 API 闭包（246 文件）永远是保护面。

## 5. 待用户裁决

主簇 310 文件（含 `orchestration` 154、`edit` 60）是一个"已建成但未接入 CLI"的完整多文件编辑/补丁/验证子系统，配套 254 个测试。删除它等于放弃这条能力线（含 `targetSetEditRoute` 原子回滚、`editProposalApply`、`patchResult/*`、`realTaskLoop*` 等），并同时删除 254 个测试文件（其中包含当前 57 项失败中的 R3 簇 5 项）。

三个选项：

1. **整簇删除**：一次提交删除主簇 + 其测试，失败基线预计从 51 降到约 46。
2. **保留并接入**：把该子系统接进 CLI 生产路径，测试转为活轨测试。
3. **冻结**：移出 `src/`（如 `src/legacy/` 或独立包）并排除出构建，保留代码与测试但不计入门控。

未裁决前不执行删除。

## 6. CLI 现有能力调查（2026-09-15 追加）

问题：CLI 是否已存在"多文件编辑/补丁/验证"，还是主簇是待接入的新能力？

**答案：CLI 已有替代实现，主簇是 Phase 4 裁剪后的遗留物，不是待接入能力。**

### 6.1 CLI 的编辑能力面

工具仅 5 个（`core/tools/registry.ts`）：`read` / `write` / `edit` / `glob` / `bash`。

- `write`：整文件覆盖（单目标）
- `edit`：`content` 全量替换 或 `oldText/newText` 搜索替换 + `replaceAll`（单目标）
- `registry.ts` 中 `apply_patch` 出现次数为 0 —— **CLI 无补丁语义、无多文件原子写**
- `createUnifiedDiff` 仅用于生成 diff 文本展示给模型（`transcript/diff.ts`），不解析 diff 输入

修复循环由 `/loop` 命令承担（`core/commands/loopCommandRuntime.ts`）：先本地跑 gate 命令，失败则把输出注入提示词，让模型用 `bash`/`edit` 工具自行迭代。该文件只 import `node:child_process` 与本地类型，**不 import 主簇任何模块**。

回滚由 `/undo` 承担（`core/commands/undoCommandRuntime.ts`）：找到最近一次编辑，输出可回退该次编辑的审计命令；作者明确拒绝了 `git checkout -- . && git clean -fd` 的整树回退。

因此 CLI 的"编辑 → 验证 → 修复 → 回滚"是**模型驱动的工具循环 + git/审计命令**，不是代码驱动的补丁事务。

### 6.2 主簇提供的是另一套语义

主簇 310 文件中约 57 个构成补丁事务引擎：

| 能力 | 文件数 | CLI 是否有 |
|---|---:|---|
| diff/patch 解析（unified diff → 操作集） | 7 | 无 |
| 多文件应用（create/update/delete/move） | 12 | 无（仅单文件） |
| 原子性契约（noPartialApply / mixedFile） | 5 | 无 |
| 补丁验证（verifyParsedPatch） | 1 | 无 |
| 快照与回滚授权（recoveryAuthorityStore / editSnapshot） | 7 | 无（CLI 用 git + 审计命令） |
| 受控写入通道（patchResult/*Route） | 12 | 无 |
| 目标集编辑（targetSetEdit / fencedEdit） | 14 | 无 |
| 验证修复环（verificationRepair* / editRepair*） | 8 | 替代实现：`/loop` |
| 提案审查应用（editProposal* / hunkSet / exactHunk） | 8 | 无 |

即主簇独有的是**确定性、代码驱动的多文件补丁事务**（解析 → 校验 → 原子写 → 快照 → 回滚 → 再验证）。

### 6.3 为什么不在 CLI 路径上

`a7418fcb`（2026-09-12，Phase 4）提交信息：

> Deleted the legacy ReAct loop, the contract query loop and engine, **the integrated-flow coordinator and its stage modules**, … and the **apply-patch / planning-mutation CLI flags**

主簇的入口链正是被这次删除切断：`runMvpIntegratedFlow.ts` 已不存在（文件缺失，`docs/PROJECT_MAP.md` 仍引用它），`agentLoop`/`engine/loop` 已删除。

残留证据：`planning/runtime/projection.ts:35` 今天仍声明 `productPath: "runMvpIntegratedFlow"` —— 指向已删除模块的悬空字符串，属裁剪未清扫项。

`docs/PROJECT_MAP.md` 冻结于 2026-05-22（route201），其描述的 Plan→Proposal→Apply→Verify→Repair 主链与"Main Modules"清单已与当前代码不符。

### 6.4 接入状态结论

主簇**不是"正待接入"**：它的接入点（集成流协调器、CLI 开关）已在 Phase 4 被主动删除，替代方案（模型驱动工具循环 + `/loop` + `/undo`）已在生产运行。因此：

- 选项 2（保留并接入）= 推翻 Phase 4 的架构决策，把已剪除的集成流接回；
- 选项 1（整簇删除）= 删除已被替代且入口已删除的旧架构；
- 选项 3（冻结）= 仅当用户认为"确定性补丁事务引擎"仍是未来方向时才有价值。

裁决点：**补丁事务引擎（diff 解析 / 原子多文件写 / 快照回滚）是否为未来目标能力？** 是 → 冻结；否 → 删除。
