# 不可达代码分档与第一档删除裁决（2026-09-27）

本文件记录 **2026-09-27** 对 `plan.md` §2.2 六项检查的执行结果、不可达代码的分档，
以及维护者对**第一档删除**的授权。

**它不是删除的执行记录**——执行细节随施工提交记录，见文末。

---

## 0. 与既有记录的关系

| 既有记录 | 关系 |
|---|---|
| `unreachable-clusters-disposition.md`（T9.5 item 1） | 结论是**保留 C1/C2 等全部簇**，并给出「可执行触发条件」。**本次是满足该触发条件后的一次新裁决**，不是推翻它。 |
| `plan.md` §9.5 / §9.21 | 原文写「删除成本低，但**授权不成立**」——即当时**未**判定这些有价值，只是检查未授权删除。本次补上了它缺的 §2.2-2（等价核验）。 |
| `plan.md` §9.18 T16a | 对其中一簇裁决「暂不删除」，同属「保留」，本次一并复核。 |

**§2.1 仍然有效**：可达性只用于分析，不授权删除。本次删除的授权来自**维护者的明确决定**。

---

## 1. 口径与实测规模

**口径**：`analyze-boundaries.py` 三根可达性（CLI 入口 + `scripts/` + 包公共 API），
**排除非产品边界** `core/harness/`、`test-utils/`、`eval/`。

**命令**：

```bash
python3 scripts/analyze-boundaries.py     # 产出 /tmp/boundary-report.json
```

**实测**：

```text
production=988  cliReachable=864  cliOpaque=124  scriptOnly=0  publicApiOnly=1
testOnly=94     noReference=29
```

**不可达（产品边界内）= 81 文件 / 20,862 行 / 21 个连通分量。**

> ⚠️ **与旧记录对不上，且旧数字不可复现**：`08-*` §5 与 `phase-13-decisions.md` §8 记的是
> 「35 文件 / 6,650 行」，`unreachable-clusters-disposition.md` 记的是
> 「263 文件 / 57,977 行」（另一口径）。差异原因：旧数字含 `test-utils/`、`core/harness/`、
> `eval/` 这些**被测试真实调用**的文件，或采不同图口径。**本次以实测 81/20,862 为准。**
> 这与 `plan.md` §1 表自身「已两次因删除而漂移」的警告同源。

---

## 2. 六项检查执行结果

| # | 检查 | 结果 |
|---|---|---|
| 1 | 功能读审 | 逐簇 + **第二档 55 文件逐文件**读审，见 §3 |
| 2 | 等价实现核验 | **第二档逐文件做**，结论见 §3——48/55 找不到活等价 |
| 3 | 消费者存活 | 活轨是否有 CLI 可达代码读取其数据 → 见各簇 |
| 4 | 动态入口 | `process.argv` / `spawn`+构造路径 / `pathToFileURL` / `*Process.ts` / shebang：**全 0 命中** |
| 5 | 公共面（`src/index.ts` 是 package `main`） | 这些文件**不在** `index.ts` 闭包内（`publicApi=false`） |
| 6 | `scripts/` 字符串引用 | 命中项全为**注释**，或指向**同名不同物**（如 `core/query/runtime/engine.test.ts` ≠ `planning/runtime/engine.ts`） |

**关键安全结论（实测）**：

> **81 个文件中，被任何活文件 import 的 = 0。**

即**不存在** §2.2 最危险的「编译契约」陷阱（像 `tools/policy/interception.ts` 那样
「看着像死代码、类型却被活文件引用」）。这一条是本次删除可安全执行的技术前提。

---

## 3. 分档

分档标准是**证据强度与体量**，不是「确定性」——三档的裁决原本都是删除，
但**第二档经逐文件复核后裁决被推翻**。

### 第一档 —— **授权删除**（18 簇 / 23 文件 / 3,399 行）

每一个都在簇级别与文件级别都被判定「活轨已有等价承担」或「机制整体未接线」。

| 文件 | 行 | 活轨等价 / 判据 |
|---|---:|---|
| `core/tools/messagingTools.ts` | 128 | 工具**未注册进 registry**（实测 `registry.ts` 命中 0） |
| `core/messaging/sessionSocketClient.ts` | 116 | 仅被上面那个未注册的工具引用 |
| `core/messaging/sessionSocketHost.ts` | 167 | host **从未被启动**（零生产引用） |
| `core/workflow/teamStore.ts` | 213 | 团队/邮箱存储，活轨无消费者 |
| `runtime/resources/inventory.ts` | 571 | 包清单校验；活轨用 `provider/registry/provider.ts` 编目 |
| `runtime/resources/projection.ts` | 147 | 同上投影 |
| `policy/resourceTrustPolicy.ts` | 163 | 仅被上面两者引用 |
| `core/query/runtime/facts.ts` | 298 | 仅被 `policy.ts` 引用（簇内） |
| `core/query/runtime/policy.ts` | 272 | 活轨的 `selectContext` / `artifactContractFor` 是其积木，但 `decideQueryRuntimeAction` **零调用者** |
| `browser/directPlaywrightAdapter.ts` | 143 | **无任何产品测试**；引用者仅 harness spike fixtures |
| `browser/playwrightEvidenceMapper.ts` | 131 | 同上 |
| `browser/selectorRepairApplyExecutor.ts` | 66 | **无任何产品测试** |
| `browser/selectorRepairApplyPolicy.ts` | 70 | 仅被上面那个引用 |
| `browser/runtime/core/gauntletManifest.ts` | 25 | **无任何产品测试**；仅 gauntlet 场景用 |
| `browser/skill/runner/manifest.ts` | 193 | 活的 `browser/runtime/external/manifest.ts` 才是出货的那个 schema |
| `session/presentation/facts.ts` | 166 | 活的 `sessionReentrySurface` / `sessionWarningSurface` 不用它 |
| `session/recovery/sessionReconciler.ts` | 47 | **实测活轨已覆盖**：`turn/prompt.ts:128-130` 的 `closePending()` 对**每个**未闭合 call 都补合成结果（比本文件只查最后一条更彻底） |
| `context/compact/governance/contextAnalysis.ts` | 153 | 仅 token 估算工具，活轨无消费者 |
| `provider/liveProviderSmokeFallback.ts` | 107 | 零生产引用 |
| `cli/interactive/interactiveCancellation.ts` | 64 | 活的 `keymap.ts` 已原生处理双 Esc 取消 |
| `model-adapters/strictSchema.ts` | 58 | 活轨把 schema 直接交给 provider 适配器 |
| `runtime/runtimePhase.ts` | 51 | 活的 `core/shell/stateMachine.ts` 才是状态机 |
| `workflow/gitChangeSetAttribution.ts` | 50 | 活的 `workflow/gitContext.ts` 已承担 |

### 第二档 —— **裁决被推翻，暂不删除**（2 簇 / 55 文件 / 16,531 行）

- 簇 1：34 文件 / 9,584 行（`context/`、`evidence/`、`planning/`、`result/`、`verification/`）
- 簇 2：21 文件 / 6,947 行（`edit/`、`repair/`、`context/readWindow`）

**簇级判断原本是「删除」**（以为主干能力已被活轨承担）。
**逐文件复核后 48/55 判为「找不到活等价」**（`NONE FOUND`），
7 个声称有等价的经复核**全部不成立**：

| 声称等价 | 复核结果 |
|---|---|
| `edit/recovery/model.ts` ← `restoreExecutionBridge.ts:25` | 那行是**同批词汇的另一个消费者**，非替代 |
| `edit/multifile/model.ts` ← `hunkSet.ts:44` | `hunkSet` **无** `buildParallelEligibility`、**无** rollback（实测命中 0） |
| `edit/multifile/{observation,types,settlement}.ts` ← `edit/patch/*` | 跨文件 hunk 分组 ≠ 多目标事务 |
| `edit/sanitize.ts` ← `core/security/redaction.ts` | `fingerprint`/`sanitizeId`/`unique` 与文本脱敏**无关** |
| `verificationFacade.ts` ← `evidence/verdictFacade.ts` | 导出集完全不同，是两个模块 |

**决定性反证**——活轨自己的文件声明这块能力**不存在**：

```text
edit/result/editCapabilityReadiness.ts:134-136
  blocked("atomic-rollback", [
    "rollbackAtomicityClaim remains false",
    "no transaction rollback executor exists",
```

而 `edit/multifile/model.ts:810-825` **真的实现了回滚**：逆序 `writeTextFile` 恢复内容，
记录 `revertedTargetIds` / `failedTargetIds`。

> **所以「第二档已有其他模块实现、属多余」不成立。**
> 删掉它等于**主动删掉活轨自己报告为 blocked 的能力**。

### 第三档 —— **未查清**（1 簇 / 3 文件 / 932 行）

- `context/sessionContextRebuildProjection.ts`（185）
- `session/sessionTreeProjection.ts`（515）
- `session/store/host/state.ts`（232）

活轨 `session/query/sessionEntries.ts` 承担了会话树读取，
但 `host/state.ts` 的持久化模型（`appendHostSessionTurn` 等 9 个函数）**未找到活的对应物**。
可能是「会话 host 状态」这条**未建成的线**，也可能是被 `SessionManager` 取代。**§2.2-2 未做到底。**

---

## 4. 测试处置原则（第一档）

按 §2.2「删除单元取连通分量整簇」与「测试不是生产覆盖」：

- **专属测试同批删除**：`runtime/resources/inventory.test.ts`、
  `policy/resourceTrustPolicy.test.ts`、`runtime/resources/projection.test.ts`、
  `session/presentation/facts.test.ts`、`context/compact/governance/contextGovernance.test.ts`、
  `browser/skill/runner/manifest.test.ts`、`provider/liveProviderSmokeFallback.test.ts`、
  `cli/interactive/interactiveCancellation.test.ts`、`runtime/runtimePhase.test.ts`、
  `workflow/gitChangeSetAttribution.test.ts`、`session/recovery/sessionReconciler.test.ts`。
- **混合测试需改写而非删除**（同时覆盖活轨）：`core/messaging/messagingAndTeams.test.ts`
  （3 个文件都指向它）、`model-adapters/strictAndMultimodal.test.ts`、
  `session/replay/builder.test.ts`（引用 `query/runtime/policy.ts` 但主体是回放）。
- **harness 场景文件**：`browser/runtime/core/gauntletManifest.ts` 与
  `browser/selectorRepairApplyExecutor.ts` 被 `core/harness/` 场景引用——
  这些**不是**产品边界，需随簇一并处置，不能留悬挂引用。

**验收**：删除后 `npx tsc -p packages/ts-shell/tsconfig.build.json --noEmit` 零错误、
全量套件通过、七道门禁全过，并**重跑 `analyze-boundaries.py` 同步 `plan.md` §1 计数表**
（该表已被记录漂移两次）。

---

## 5. 未验证事项

- 第一档 23 个文件**未逐个**做「活轨是否有代码读取其**数据/状态字符串**」的语义读审；
  簇级与文件级读了导出面与主要调用点。
- `core/harness/` 内的场景文件未评估其自身是否应保留（超本次范围）。
- 第二档的 **48 个 `NONE FOUND`** 是「按导出面与职责未找到等价」，
  **不是**「已证明产品需要它们」——是否接入需另行裁决（见 `plan.md` 后续记录）。
- 第三档未查清。

---

## 6. 待办

- [ ] 第一档删除执行（逐簇，含上述测试处置与 `plan.md` §1 计数表同步）
- [x] 第二档方向研究 —— 见 `tier2-direction-research-2026-09-27.md`
      （结论：簇 1 能力非必需；簇 2 能力真实缺失但**无任何可参照方案**）
- [ ] 第三档 `session/store/host/state.ts` 单独做 §2.2-2
