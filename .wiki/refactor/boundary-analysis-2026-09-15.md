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
