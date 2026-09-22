# 现状重算（2026-09-16，主簇删除后）

> 工具：`scripts/analyze-boundaries.py`（四重证据）。主簇删除后重新测量。

## 1. 总量变化

| 指标 | 主簇删除前 | 删除后 | 变化 |
|---|---:|---:|---:|
| 生产源文件 | 1361 | **1045** | −316 |
| CLI 可达 | 871 | 871 | 0 |
| CLI 不可达 | 490 | **174** | −316 |
| 仅测试引用 | 339 | 77 | −262 |
| 零引用 | 146 | 92 | −54 |
| 仅公共 API | 5 | 5 | 0 |

CLI 可达集合保持 871 不变 —— 删除未触及任何生产路径（再次确认零误删）。

## 2. 剩余不可达集构成（174）

| 类别 | 数量 |
|---|---:|
| 零引用（无任何消费者） | 92 |
| 仅测试引用 | 77 |
| 仅公共 API | 5 |

一级模块分布：`runtime` 22、`core` 62、`session` 26、`edit` 17、`presentation` 8、`context` 8、`planning` 5、`orchestration` 6、其余零散。

**不再存在大型连体簇**：135 个候选构成 105 个连通分量，最大分量仅 9 个文件（`runtime/evaluation` 7 + `runtime/distribution` 1 + `index.ts`）。零引用文件中 57 个是完全孤立文件。

## 3. 浏览器域现状（Step 3 搬迁面重算）

| 项 | 数量 |
|---|---:|
| `core/context/` 平铺 `browser*`/`pw*` 生产文件 | 128（CLI 可达 122） |
| `core/context/browser/` 子目录生产文件 | 43（CLI 可达 41） |
| `core/context/` 全部生产文件 | 257（CLI 可达 242） |

**仍不可达的 8 个：**

```
core/context/browserDirectPlaywrightAdapter.ts
core/context/browserPlaywrightEvidenceMapper.ts
core/context/browserSelectorRepairApplyExecutor.ts
core/context/browserSelectorRepairApplyPolicy.ts
core/context/browserToolServerBackend.ts
core/context/pwReport.ts
core/context/browser/runtime/core/gauntletManifest.ts
core/context/browser/skill/runner/manifest.ts
```

其中 `browserToolServerBackend.ts`、`pwReport.ts` 零引用（活跃链用的是 `browserToolServerBackendComparison.ts`，CLI 可达）；`browserDirectPlaywrightAdapter.ts`、`browserPlaywrightEvidenceMapper.ts` 仅被 `core/harness/browserPlaywrightAdapterSpikeFixtures.ts`（测试基建）引用。

## 4. 已删除浏览器文件的定性复核

主簇删除时连带删除 12 个浏览器文件，全部在 Step 2.5-B 归档的候选清单内，全部 CLI 不可达：

```
browser/browserIntentPlanning.ts、core/context/{browserObs,browserRepair,browserScore,
browserTool,browserTrace,browserTxn,browserTxnEvidence,browserTxnReport,browserTxnTypes,
pwAdapter}.ts、orchestration/browserModule.ts
```

性质：与 CLI 现用的浏览器链**不是同一套实现**。CLI 现用 `core/tools/browserToolUnified.ts` + `core/context/browser/{runtime,receipt,skill}/` + `browserActionContract`/`browserCommandRunner` 等 122 个可达平铺文件；被删的 12 个是旧事务式实现（`browserTxn` 事务、`browserObs` 观测、`pwAdapter` Playwright 适配、旧 `browserTool` 入口），删后生产门控 0 错误。

**偏差记录**：计划 Step 3 原写"先删除 7 个死 browser 文件，再搬 160 个"，实际是主簇删除阶段连带删了 12 个（时机早于 Step 2/Step 3）。删除本身有证据支撑，但顺序偏差已记录；Step 3 搬迁数字按本文件 §3 重算。

## 5. 阶段顺序修正（回到计划）

原计划顺序：

```
Step 2   基线回绿
Step 3   browser 域搬迁
```

实际执行偏离为：Step 2.5 期间插入"边界分析 + 主簇删除"。修正后的顺序：

- **Step 2（当前应做）**：基线回绿。剩余 30 项失败中：
  - `registry-rust-bridge` 8 项 → 修活轨生产代码（`runCommandTool` metadata 透传 `executionPath`/`errorClass`）
  - `sessionRuntime` 3 项 + `recovery` 2 项 + `approvalTrustPolicy` 1 项 → 测试锁旧语义，改测试
  - `capabilityBoundaryProjection` 1 项 → `detectCommand` 返回不在 allowlist 的命令，修实现或改断言
  - `cli-baseline` 15 项 → 4 项环境依赖 + 10 项 `/continue` seed 断言 + 1 项 print 模式
- **Step 2.6（可选，纯机械）**：删除 92 个零引用文件中的孤立簇（57 个完全孤立 + 小分量），逐个验证。
- **Step 3（browser 搬迁）**：按 §3 重算数字执行——128 平铺中 122 个可达 + 43 子目录中 41 个可达；先处理 8 个不可达文件。
- **Step 4 及以后**：按原计划。
