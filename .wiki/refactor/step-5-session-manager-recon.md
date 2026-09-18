# Step 5 — SessionManager 拆分探索（2026-09-18）

> 目标（`plan.md §3.3`）：拆分 `SessionManager.ts`（52 函数 facade）。
> **本文件是探索结论，不含代码改动。** 所有数字脚本实测。

## 1. 现状测量

| 指标 | 值 |
|---|---:|
| 文件行数 | **816** |
| 声明的方法 | **51**（+ constructor + 3 个 private callback 工厂 = 62 个 2 空格缩进成员） |
| 外部消费者 | **55 个文件**（`SessionManager` 字面出现）／**38 个文件**实际调用其方法 |
| 被消费者调用的方法 | **46 / 51** |
| 从不被消费者调用的方法 | 15（其中 11 个是 private，4 个是 `createNewWithId` 等仅测试用） |
| 可达性 | `cli: true`、`publicApi: false`、`testRef: true` |
| 生产实例化点 | **仅 1 处**：`cli/bootstrap/cliBootstrapContext.ts:83` |
| 以类型引用（`: SessionManager`）的文件 | 25 |

## 2. 关键发现：这是**薄 facade**，不是单体

方法体规模分布（去注释后的语句数）：

| 规模 | 方法数 |
|---|---:|
| 纯委托（≤2 语句） | **22** |
| 薄（3–5） | 10 |
| 实质（>5） | **30** |

**类内总语句数仅 397**，而文件有 816 行——**约一半是文档注释与 import**。

该文件已 import 并委托给 `session/` 下 **20+ 个既有模块**：

```
store/{sessionCreation,sessionStoreAccess,sessionFileLayout,sessionProjectBinding,currentSelection}
recovery/{sessionRecoveryRuntime,sessionResume,sessionRecoverySelection,projectContextSummary,
          recoveryTrustBoundary,sessionResumeEligibility,sessionRecoverySnapshot}
transcript/{sessionTranscript,sessionQueryEventPersistence}
replay/{sessionReplayRuntime,sessionReplayFacade,builder}
continuation/{sessionPromptContinuity,sessionContinuitySnapshot,legacyPermissionRebase,
              sessionSeedInfluence,sessionProjectRootRebind}
presentation/sessionReentrySurface
agent/{lifecycle,persistence,compaction}
schema/sessionStateSnapshot
approval/sessionApprovalMemory
```

**即：职责早已被抽出，"52 个函数"是聚合面，不是待分解的单体。**

## 3. 消费者内聚度测量

把 50 个公开方法按职责分为 5 组，测量 38 个调用方各自用到哪几组：

| 组 | 方法数 |
|---|---:|
| `creation-resume` | 6 |
| `store-binding` | 11 |
| `lifecycle-writes` | 14 |
| `read-projection` | 11 |
| `reentry-recovery` | 8 |

**结果**：

| 指标 | 值 |
|---|---:|
| 只用**一组**的调用方 | **20 / 38 = 53%** |
| 组合种类 | **16 种** |
| 最高频组合 | `creation-resume`（7 文件）、`store-binding`（5）、`lifecycle-writes`（4） |
| 用到 4–5 组的调用方 | 5 文件（含 `cliBootstrapContext`、`sessionRuntime`） |

**判断**：53% 单一职责 + 16 种组合 = **接缝存在但分散**。没有像 Step 4 的
`agentPlan/analysis/taskLifecycle` 那样"消费者集合完全相同"的干净合并/切分依据；
也不像 `types.ts` 那样"拆分必然产生跨界"（Step 4 实测 19% 跨界即否决）。

## 4. 与 NormProof 判据的关系（决定"为什么拆"）

`.normproof/norm-packs/software-structure-v0/profile.json`：

```json
{ "id": "declared_functions_within_module_ceiling",
  "severity": "advisory",
  "expression": { "kind": "groupSizeUnder", "evidenceId": "source_module_functions",
                  "ceiling": 20, "onEmpty": "unsatisfied" } }
```

`.normproof/out/report.md`：**13 个模块超限**，`SessionManager.ts` 的 62 个声明名在其中
（报告列出的 proof gap 数字含 27/32/23/27/39/27/**51**/28/27/26…，与
`dispositions.md` 记录的 52 一致）。

**该义务是 `advisory` 而非 `blocking`**：报告明确
`"Every blocking obligation is satisfied; open advisory obligations do not block."`
即**当前不阻塞任何东西**。

**但 `AGENTS.md` 把它写成了硬规则**：

> 3. Responsibility ceiling. No single module may declare more than 20 function-like
> names — counting named functions, functions or arrows bound to a name, and methods.

## 5. 历史裁决记录

`.normproof/dispositions.md` 对 SessionManager 有 **4 条**记录：

| 日期 | 裁决 | 理由 |
|---|---|---|
| 2026-08-28 | **defer** | "session manager coordinator owning branch management, persistence, and recovery" |
| 2026-08-28 | fix | 已拆为 agent lifecycle / compaction / persistence facades |
| 2026-09-02 | **defer** | "Pre-existing facade violation; the four additions are session re-entry operations that belong on this surface, **and splitting a 700-line facade with 26 dependents is its own task rather than a side effect of fixing resume**" |

**Step 5 正是那条被推迟的"its own task"。** 自 2026-08-28 以来文件从 763 → 816 行
（+53 行），说明它在缓慢增长而非收敛。

## 6. 拆分方案（三个候选）

### 方案 A：按 5 组职责拆为协作类（推荐度：中）

`SessionManager` 保留为**组合面**，把 5 组各自抽为独立类，`SessionManager` 委托：

```
session/manager/
  index.ts              <- SessionManager（组合 + 委托，约 15 个方法）
  sessionStoreBinding.ts     (store-binding, 11)
  sessionCreation.ts         (creation-resume, 6)
  sessionLifecycle.ts        (lifecycle-writes, 14)
  sessionReadProjection.ts   (read-projection, 11)
  sessionReentry.ts          (reentry-recovery, 8)
```

- **优点**：`SessionManager` 的方法数降到约 15–20，满足判据；55 个消费者的
  import 路径不变（仍是 `session/SessionManager.js`）；每组内聚度可单独验证。
- **缺点**：**没有真正减少总函数数**，只是搬家——总声明名从 62 变为
  `SessionManager(15) + 5×N`。若判据按"每模块"计，则各组都合规；
  但若按"每个类"计，5 个新类各约 8–14 个方法，同样合规。
- **风险**：中等。`SessionManager` 的私有 callback 工厂
  （`createSessionCreationCallbacks` 等）与 `this.store` 是**跨组共享状态**，
  拆分需要把它们下移为构造参数或共享 context 对象。

### 方案 B：只拆"实质方法"最多的一组（推荐度：高，最小步）

只抽出 **`lifecycle-writes`（14 方法，含 8 个 save*/mark* 状态写入）**：

- 该组是**写入路径**，有独立的验证方式（`sessionManagerBoundary.test.ts`、
  `sessionRuntime.test.ts` 已覆盖）；且 4 个调用方只用这一组。
- `SessionManager` 从 51 → 约 37 个方法。**仍超 20**，但：
  - 这是**最小可验证的一步**，符合本项目"分批、每批独立验证"的纪律（§2.4.1）。
  - 若本步成功，可继续按同样方式抽下一组。
- **风险**：低。改动面 = 14 个方法体 + 1 个新文件 + `SessionManager` 委托。

### 方案 C：登记 defer，不拆（推荐度：需维护者权衡）

理由：判据是 `advisory`、当前不阻塞、53% 单一职责说明 facade 形态**正在被消费者正确使用**
（多数调用方只用一部分），且历史已两次 defer。

**反方理由**：`AGENTS.md` 是硬规则；Step 5 已在计划里排了号；文件仍在增长。

### 建议

**方案 B 起步，逐组推进**。理由：
1. 与 Step 3/4 的纪律一致（分批、每批独立可验证、不夹带）。
2. 方案 A 一次抽 5 组，改动面 51 个方法 + 55 个消费者中的类型引用，
   且要重构跨组共享的 `this.store` 与 callback 工厂——风险集中，不符合本项目
   "风险递增、分批"的既有做法。
3. 方案 B 每步都能用现有测试验证（`sessionManagerBoundary`、
   `sessionRuntimeBoundary`、`SessionManager.test.ts` 共 3 个边界测试文件）。

## 7. 未决问题（须维护者裁决）

1. **判据适用范围**：`AGENTS.md` 的 20 名上限是"每模块"还是"每类"？
   若按模块，方案 A 的各组是独立模块、各自合规；若按类，方案 B 分步也能最终达标。
   **这决定要拆到什么程度。**
2. **`SessionManager` 是否保留为公共面**：55 个消费者、25 处类型引用。
   若保留（建议保留），则它是**合法的域管理器**——`agent-rules/file-placement-and-naming.md`
   明文允许："`SessionManager` may retain real session lifecycle coordination, public API
   compatibility, dependency assembly, transaction ordering, and cross-session coordination
   when those duties are part of its public contract."
   **该条款直接适用于本文件**，建议作为裁决依据。
3. **是否先更新 `.normproof/dispositions.md`**：若决定拆分，应把现有 4 条
   defer 记录改为 "fix" 并注明本步；若不拆，应记录新的 defer 理由。

## 8. 验证纪律（本步适用）

- 探索阶段零代码改动 → 不跑构建/测试。
- 若执行拆分：按 §2.4.1 —— 先跑 SCC（基线全仓 0 环）、按 import 图实测边数、
  只重算 escaping 边、PTY 实机验证（`session/` 是 §2.4 强制触发面）、
  证明改动仅 import/委托。

---

## 9. 执行前侦察的修正（2026-09-18，第二轮）

在动手前对方案 B 做了机制核实，**发现 §6 方案 B 的机制前提有误**，须先修正再执行。

### 9.1 判据计数机制的权威校准

从 `.normproof/normproof-0.1.0.tgz` 解出真实实现
（`package/dist/adapters/sidecar-file/module-graph.js` → `declaredFunctionNames`），
逐字复刻后在 5 个标定文件上与 judge **完全一致**：

| 文件 | judge | 复刻 |
|---|---:|---:|
| `session/SessionManager.ts` | 59 | **59** |
| `session/store/sessionStoreAccess.ts` | 22 | **22** |
| `edit/multifile/model.ts` | 39 | **39** |
| `presentation/surface/model.ts` | 51 | **51** |
| `runtime/evaluation/task/model.ts` | 52 | **52** |

计数规则（三类文本形态，按**名字去重**）：
1. `function name(` 声明
2. `const/let/var name = (function|(` 绑定
3. **方法位**：`^[ \t]*(修饰符)*name(...)  {` —— **类方法计入**
   （`constructor` 与 `NOT_A_FUNCTION_NAME` 列表除外）
4. **属性声明不计入**（已用探针验证）

### 9.2 由此推翻的两个前提

**前提 A 被推翻**：§6 方案 B 说"抽出 lifecycle-writes 可降低计数"。
实测：**当前 59，抽出该组 15 个名字后剩 44 —— 仍远超 20**。

**前提 B 被推翻**：§6 设想"SessionManager 保留组合面并委托"。
但判据数的是**模块内声明名**，**新增委托方法仍会被计数**——
组合面不降数，反而增加。已用探针确认：把协作者作为**属性**暴露则不计数，
但 SessionManager 现有方法必须**真正移出文件**才降数。

### 9.3 机制候选（须裁决）

| 机制 | 是否降数 | 仓库先例 | 改动面 |
|---|---|---|---|
| **组合 + 改调用点** | ✅ 方法移出即降数 | ✅ 已有（`this.deps.*` 导航） | **290 处调用点**（生产 44 / 测试 246），10 种接收者表达式 |
| **继承（基类持有 LW）** | ✅ | ❌ **无先例**（仓库 14 处 `extends` **全是 `extends Error`**） | 调用点不变 |
| **仅加委托包装** | ❌ **不降数** | — | — |

### 9.4 另发现的零风险收益（与拆分无关）

3 个方法**全仓零调用**（已 grep 验证，含 `scripts/`、`index.ts`、prototype、`.call`）：

| 方法 | 其底层实现 |
|---|---|
| `loadSessionMessages` | `projectTranscriptMessages` 已被 `sessionStore.ts`、`exportCommandRuntime.ts` 使用 |
| `normalizeTranscriptEvents` | `normalizeReplayTranscript` → 实际用的是 `normalizeReplayTranscriptEvents` |
| `repairTranscriptEvents` | `repairReplayTranscript` 仅此一处引用 |

另有 1 个 private 死方法：`applyAutoCompactRetention`（`this.applyAutoCompactRetention` 零引用；
底层 `applyAutoCompactRetention` 已被 `agent/persistence.ts` 使用）。

**删除这 4 个名字：59 → 55。** 不改变任何行为（零调用），
但**单独不足以达标**，且属"删除"而非"拆分"——须与 Step 2.7 的删除纪律一致（先查生产者/消费者）。

### 9.5 结论

**方案 B 需重新裁决**，因为：
1. 它达不到"降到 20"的目标（44 > 20），除非继续抽更多组；
2. 它的实现机制（组合 + 改 290 处调用点）与"最小风险一步"的初衷不符；
3. 若目标是**真正达标**，需把 5 组全部抽出（59 − 50 − 11 ≈ 0 个名字），
   即 SessionManager 退化为纯组合面——**这是方案 A，改动面 290 处调用点 + 55 个消费者**。

**须维护者裁决**：
- (a) 是否接受"分步降数但不达标"（如先删 4 个死名 + 抽 lifecycle-writes → 44）；
- (b) 是否允许引入继承机制（无先例，但零调用点改动）；
- (c) 是否改为"登记 defer"——依据仍是 `agent-rules` 第 147 行的明文条款
  （SessionManager 可保留真实生命周期协调职责）。
