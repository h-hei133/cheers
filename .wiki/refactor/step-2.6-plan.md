# Step 2.6 方案：零引用孤立簇删除

> 2026-09-16。基于主簇删除后的现状重算（`recompute-2026-09-16.md`）。
> 工具：`scripts/analyze-boundaries.py` + 本次补算的 import 图（正则已修正多行 `import type { … } from "…"` 与 `.js` 后缀剥离）。

## 0. 为什么需要这份文档

`plan.md:87` 只有一行："删除 92 个零引用文件中的孤立簇（57 个完全孤立 + 小分量），逐个验证。"

这行有三处与实测不符，必须更正后才有可执行方案：

| plan.md 说法 | 实测 | 说明 |
|---|---|---|
| "掉 92 个零引用文件中的孤立簇" | 零引用 92 = **纯死簇 83** + 有生产入边的孤儿 9 | 9 个孤儿有生产入边（来自其他不可达文件），严格说不是"孤立"，但同样不可达 |
| "57 个完全孤立" | **83 个文件构成 76 个分量**，其中 68 个单点 + 15 个双点（去重后 83 文件） | 57 是 174 全候选集某个中间口径的数字 |
| "最大分量仅 9 文件" | 174 不可达集的最大分量 **6 文件**（`runtime/evaluation/task`） | 9 的口径不同 |

## 1. 测量口径

**图定义**：`packages/ts-shell/src/**/*.ts{,x}` 生产文件为节点；`from "…"` / `import("…")` / `import "…"` 的**相对说明符**为有向边，解析时剥离 `.js` 后试 `.ts` / `.tsx` / `/index.ts`。

**不可达集**：`analyze-boundaries.py` 判定 `cli == false` 的 174 个生产文件。

**删除单元**：不可达集内的**弱连通分量**。删除单位取整簇而非单文件，是因为簇内互为唯一消费者——单独删会留下断链。

## 2. 结果

```
CLI 不可达（174）
├── 纯死簇            83   ← 本步目标：簇内所有文件的消费者都在簇内
├── 零引用孤儿         9   ← 有生产入边，但入边全部来自不可达文件
├── 仅测试引用        77   ← 被测件引用，需先裁决测试
└── 仅公共 API         5   ← 从 index.ts 暴露，需先裁决 API 面
```

校验：`83 + 5 + 77 + 9 = 174`；零引用 `83 + 9 = 92`。✓

### 2.1 纯死簇 83 文件的模块分布

| 模块 | 文件数 | 模块 | 文件数 |
|---|---:|---|---:|
| `runtime` | 17 | `core` | 5 |
| `session` | 17 | `planning` | 5 |
| `edit` | 15 | `orchestration` | 4 |
| `presentation` | 8 | `evidence` | 2 |
| `context` | 6 | 其余 5 模块各 1 | 5 |

合计 **3649 行**。

### 2.2 非单点的簇（15 个，共 30 文件；68 个单点未列）

```
context/graph/ast/graphRag.ts            + context/graph/ast/scopeTree.ts
context/graph/callGraph.ts               + context/graph/symbolTable.ts
core/context/browserToolServerBackend.ts + core/context/pwReport.ts
edit/multifile/conflict.ts               + edit/multifile/types.ts
edit/multifile/graph.ts                  + edit/multifile/types.ts
edit/patch/plan/operation.ts             + edit/patch/plan/validator.ts
edit/patch/gauntlet/astGauntlet.ts       + edit/repair/lspRepairLoop.ts
orchestration/swarm/convergence.ts       + orchestration/swarm/types.ts
orchestration/swarm/dispatcher.ts        + orchestration/swarm/types.ts
planning/runtime/classifier.ts           + planning/runtime/types.ts
planning/runtime/handoff.ts              + planning/runtime/types.ts
planning/runtime/proposal/context.ts     + planning/runtime/types.ts
presentation/surface/sections/events.ts  + presentation/surface/sections/types.ts
presentation/surface/sections/layout.ts  + presentation/surface/sections/types.ts
presentation/surface/sections/status.ts  + presentation/surface/sections/types.ts
```

注意 `types.ts` 类节点被多个簇共享（`edit/multifile/types.ts` 被 2 个簇引用，`planning/runtime/types.ts` 被 3 个，`presentation/surface/sections/types.ts` 被 3 个），因此是**整簇一起删**而非拆开。

## 3. 删除前已验证的四项

| 验证 | 方法 | 结果 |
|---|---|---|
| 生产入边 | 174 候选对零引用集的入边精确解析 | **0 条**（此前粗搜的命中全部来自簇内文件或同名不同文件） |
| 测试/脚本引用 | 扫描 `packages/`、`scripts/`、`contracts/` 全部 `.ts/.tsx/.mjs/.js/.json`（排除 `dist`、`node_modules`） | 83 中 **74 个零引用**；另 9 个的"引用"全部来自簇内 |
| 公共导出面 | 全部 `index.ts` 桶文件的 `export … from` 指向 | **0 命中** |
| package 导出 | 三处 `package.json` 的 `exports` 字段 | **0 条目**（字段本就不存在） |

## 4. 执行步骤

1. **冻结证据**：记录当前 `cliReachable = 871`、生产文件 `1045`。
2. **删除**：整簇删除 83 个文件（含 15 个多文件簇 + 68 个单点）。
3. **重算**：重跑 `scripts/analyze-boundaries.py`，要求：
   - `cliReachable` 仍为 **871**（不得下降——下降即误删）
   - `production` 从 1045 降至 **962**
   - `noReference` 从 92 降至 **9**
4. **构建**：`npx tsc -p tsconfig.build.json` 零错误。
5. **测试**：全量 `npx vitest run`，失败数不得高于当前基线（稳定 0）。

## 5. 明确不在本步范围

- **仅测试引用的 77 文件**：删除会使测试断链。需先裁决"测试是否保留"，可能要连带删除测试。单独一步。
- **仅公共 API 的 5 文件**（`index.ts`、`runtime/evaluation/task/{model,loop,progression}.ts`、`runtime/distribution/model.ts`）：属对外承诺面，删除是破坏性变更。单独裁决。
- **零引用孤儿 9 文件**：有生产入边但全部来自不可达文件。它们与"仅测试引用 77"中的部分文件构成同一批死链（如 `core/harness/agentScenarioRunner.ts` → `agentScenarioAssertions.ts`/`agentScenarioSafety.ts`）。若要删这 9 个，需连同其上游一起删，届时分量结构会变。**建议并入下一批做**，与 77 一起作为"不可达链清理"处理。

## 6. 风险

| 风险 | 评估 |
|---|---|
| 误删仍被运行时动态加载的文件 | **已验证无风险**。全仓动态 `import("…")` 扫描：命中 83 集 **0 次**。历史盲区 `runtime/api/host/runtime.ts:231` 的 `await import("../../evaluation/model.js")` 目标解析为 `runtime/evaluation/model.ts`，其 `cli = true`（CLI 可达），不在删除集。 |
| 删除后 CLI 可达集下降 | 有兜底：第 3 步的重算显式要求 `cliReachable` 不降。 |
| 断链测试 | 83 个文件零测试引用，不产生断链。 |

## 附录：83 个待删文件完整清单

### runtime (17)
```
runtime/events/index.ts
runtime/events/jsonEventStream.ts
runtime/events/runtimeEventProjection.ts
runtime/execution/executionErrorTaxonomy.ts
runtime/execution/executionReceipt.ts
runtime/execution/executionService.ts
runtime/execution/index.ts
runtime/loop/agentLoopContract.ts
runtime/loop/featureContract.ts
runtime/loop/index.ts
runtime/loop/infrastructureMap.ts
runtime/loop/productLoopAdapter.ts
runtime/loop/trajectoryProjection.ts
runtime/resources/index.ts
runtime/resources/packageInventory.ts
runtime/resources/staticResourceDescriptor.ts
runtime/resources/staticResourceProjection.ts
```

### session (17)
```
session/__tests__/longSessionDurabilityProcess.ts
session/approvalAuditProjection.ts
session/approvalMemoryCodec.ts
session/compactContinuitySummary.ts
session/compactRetentionPlanner.ts
session/compactSummaryFormatter.ts
session/continuationReadiness.ts
session/currentSessionSelection.ts
session/durableStatusProjection.ts
session/projectBindingPolicy.ts
session/projectRootRebaseProjection.ts
session/replaySafeLoopState.ts
session/sessionPresentationFacts.ts
session/sessionReplayBuilder.ts
session/sessionResumeContextBuilder.ts
session/stoppedSessionContinuity.ts
session/store/sessionTree.ts
```

### edit (15)
```
edit/multifile/conflict.ts
edit/multifile/graph.ts
edit/multifile/types.ts
edit/patch/gauntlet/astGauntlet.ts
edit/patch/normalization/diffNormalize.ts
edit/patch/plan/operation.ts
edit/patch/plan/validator.ts
edit/repair/lspRepairLoop.ts
edit/result/journal/journalDurableAuthority.ts
edit/result/journal/journalFailureStateProjection.ts
edit/result/journal/journalMetadataBoundary.ts
edit/result/journal/journalOriginalContentAuthority.ts
edit/result/journal/journalRecoveryPlanProjection.ts
edit/result/journal/journalRecoveryReadinessProjection.ts
edit/result/journal/journalResultProjection.ts
```

### presentation (8)
```
presentation/components/box.ts
presentation/components/statusBadge.ts
presentation/surface/index.ts
presentation/surface/sections/events.ts
presentation/surface/sections/layout.ts
presentation/surface/sections/status.ts
presentation/surface/sections/types.ts
presentation/terminal/index.ts
```

### context (6)
```
context/graph/ast/graphRag.ts
context/graph/ast/scopeTree.ts
context/graph/callGraph.ts
context/graph/symbolTable.ts
context/index.ts
context/runtimeStageTypes.ts
```

### core (5)
```
core/context/browserToolServerBackend.ts
core/context/memory/episodic/history.ts
core/context/memory/working/state.ts
core/context/pwReport.ts
core/harness/browserAgentFixtures.ts
```

### planning (5)
```
planning/runtime/classifier.ts
planning/runtime/handoff.ts
planning/runtime/proposal/attempt.ts
planning/runtime/proposal/context.ts
planning/runtime/types.ts
```

### orchestration (4)
```
orchestration/prompts.ts
orchestration/swarm/convergence.ts
orchestration/swarm/dispatcher.ts
orchestration/swarm/types.ts
```

### evidence (2)
```
evidence/runtimeSavePoint.ts
evidence/turnEvidenceLedger.ts
```

### model-adapters (1)
```
model-adapters/providerFetch.ts
```

### result (1)
```
result/sessionResultTruthAdapter.ts
```

### test-utils (1)
```
test-utils/approvalToolProvenanceFixtures.ts
```

### verification (1)
```
verification/verificationCommandPlan.ts
```
