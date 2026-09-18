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

---

## 10. 执行记录：(a) 已完成（2026-09-18）

### 10.1 第一批：删除 4 个零调用成员（`268b2f83`）

删除前完成六项检查（功能读审、等价实现核验、消费者存活、动态入口、公共面、scripts 引用）：

| 名字 | 性质 | 检查结果 |
|---|---|---|
| `loadSessionMessages` | public | 全仓**仅 1 次出现**（自身声明）；底层 `projectTranscriptMessages` 已被 `sessionStore.ts`、`exportCommandRuntime.ts` 使用 |
| `normalizeTranscriptEvents` | public | 同上；实际在用的是 `normalizeReplayTranscriptEvents`（不同函数） |
| `repairTranscriptEvents` | public | 同上；`repairReplayTranscript` 仅此一处引用 |
| `applyAutoCompactRetention` | private | `this.applyAutoCompactRetention` 零引用；底层已被 `agent/persistence.ts` 使用 |

- 不在公共面（`index.ts` 不导出 `SessionManager`）；无字符串路径/`pathToFileURL` 入口；`scripts/` 无引用。
- 连带清理 4 处失效 import + 1 处失效 `export type`。
- **计数：59 → 55。**

### 10.2 第二批：抽出 lifecycle-writes（`10350ede`）

14 个状态写入方法 + 2 个其专属 helper（`createSessionLifecycleCallbacks`、`appendTranscriptEvent`）
移入 `session/lifecycle/sessionLifecycleWrites.ts`。

**机制选择：继承**（`SessionManager extends SessionLifecycleWrites`）。

| 机制 | 降数 | 调用点改动 | 仓库先例 |
|---|---|---|---|
| **继承（采用）** | ✅ | **0** | 无（本次建立） |
| 组合 + 改调用点 | ✅ | **290 处** | `this.deps.*` 导航已有 |

选继承的理由：**同样的降数效果，零调用点改动**。290 处调用点（生产 44 / 测试 246）的改动
不带来额外收益，却把 55 个消费者文件全部卷入。

**基类不反向依赖**：它需要的 3 项（transcript events、recovery snapshot、state-snapshot overrides）
经 `SessionLifecycleWriteHost` 接口在构造时注入，而非通过 `this` 反向取用。

**计数：55 → 38**；新模块声明 **17**（≤20）。**两个文件均已达标。**

### 10.3 验证

| 项 | 结果 |
|---|---|
| 构建 | clean |
| 全量测试 | **3172 / 3172，零失败** |
| 聚焦测试 | 897 / 897（124 文件） |
| **PTY 实机** | 真实回合跑通；新会话 `sess_342` 出现在 `/resume` 列表（标题/时间/outcome 齐全） |
| 可达性 | **959/874 → 960/875**（改善） |

PTY 证据链：`/resume` 列出 15 条真实历史会话（读 `listReentrySummaries` + recovery snapshot）
→ 发一条真实 prompt → 回合执行 → 新会话落盘 → `/resume` 显示 **16 条**，新条目在首位。
**写入路径与读取路径双向验证通过。**

---

## 11. (b) 继承机制的风险与收益分析

### 11.1 收益

| 收益 | 证据 |
|---|---|
| **零调用点改动** | 290 处调用点、55 个消费者文件、25 处类型引用全部不变 |
| **公共面完全不变** | `SessionManager` 的方法签名逐个保持；无 `instanceof`、无序列化、无 own-property 枚举依赖（均已 grep 验证为空） |
| **降数效果与组合等价** | 59 → 38，与新模块 17，两个文件同时达标 |
| **依赖方向显式化** | 基类经 host 接口声明所需，不反向 `this` 取用——比原先的隐式自引用更清晰 |
| **已在本批验证** | 3172 测试 + PTY 实机均通过，机制已被证明可行 |

### 11.2 风险

| 风险 | 严重度 | 证据 / 缓解 |
|---|---|---|
| **引入仓库没有的第二套类约定** | **中** | 仓库 14 处 `extends` **全是 `Error` 子类**；`protected` 成员**零先例**（已核实：5 处 "protected" 命中全是英文文案）。本批已建立先例，后续沿用即一致 |
| **继承链深度** | **中** | 当前深度 1。若 4 组全抽出成链则深度 5——**建议不建链**：改为「基类 + 组合」混合，或每组独立基类由 SessionManager 多重继承（TS 不支持）→ 故应**限制为 1–2 层** |
| **`as SessionManager & {...}` 断言** | **低** | `sessionRuntime.ts:201/212` 的断言针对 `buildContinuitySnapshot`（read-projection，仍在 SessionManager），继承不影响 |
| **`{} as unknown as SessionManager` 测试替身** | **低** | `interactiveMode.test.ts:36`、`firstFrame.test.ts:48` 传空对象且**不调用** LW 方法；断言绕过类型检查，继承不破坏 |
| **基类与子类的隐式耦合** | **低** | 已用 host 接口切断反向依赖；基类不 import SessionManager（无环） |
| **调试时方法不在自身原型上** | **低** | 继承方法在原型链上可正常调用与断点；无 own-property 枚举依赖 |

### 11.3 剩余工作量（若要真正降到 ≤20）

当前 38，需再减 **18** 个名字。剩余各组及其**跨组依赖数**（决定 host 接口大小）：

| 组 | 方法数 | 跨组依赖 | 抽出的代价 |
|---|---:|---:|---|
| `store-binding` | 11 | **0** | **最干净**——零 host 需求 |
| `read-projection` | 8 | **0** | **同样干净** |
| `creation-resume` | 6 | 1（`setCurrentSessionForProject`） | 小 |
| `reentry-recovery` | 8 | 4 | 较大 |
| private helpers | 7 | — | 随宿主组走 |

**结论**：`store-binding`（11）+ `read-projection`（8）= **19 个名字**，且**两者跨组依赖均为 0**。
抽出后 SessionManager ≈ **19 个名字，达标**。

### 11.4 建议

**(b) 机制可行且已被本批验证，但应限制继承深度。**

推荐路径：把 `store-binding` 与 `read-projection` 各抽为一个**独立基类**，SessionManager
直接继承其中一层、组合另一层（避免深度 5 的链）。两者跨组依赖为 0，
意味着**不需要 host 接口**——比本批的 lifecycle-writes 更简单。

**风险最低的下一步**：先抽 `store-binding`（11 名字、零依赖），
SessionManager 38 → 27；再抽 `read-projection`（8 名字、零依赖）→ **19，达标**。

---

## 12. 第三批执行前修正（2026-09-18，动手前实测）

§11.3/§11.4 的三处前提在执行前被实测推翻，记录于动手之前。

### 12.1 判据对本文件漏计 2 个方法

用 §9.1 解出的判据实现（`maskSource` + `declaredFunctionNames`）复测：
**判据报 38，真实成员 41**。漏计的是 `createNew` / `createNewWithId`：

```ts
  createNew(
    projectRoot: string = process.cwd(),   // 参数里的括号
```

判据第三条正则 `\([^)]*\)\s*(?::[^{;]+)?\{` 的 `[^)]*` 在 `process.cwd(` 的 `)` 处提前收束，
整条匹配失败。探针确认两者均 `missed`。

**含义**：本文件的历史计数（59/55/38）都**低于**真实成员数。判据漏计只降不升
（其注释亦明言 "a miss lowers a count rather than raising one"），
故**不能把"判据达标"直接等同于"真实达标"**。

### 12.2 分组归属的一处实测差异

用成员间 `this.X(` 反查实测 41 个真实成员的调用边：

```
REST -> STORE = 6       READ -> REST = 1       其余方向 = 0
REST -> READ  = 5
```

- **§11.3 的 READ = 7 与"零跨组依赖"不相容**：`buildContinuitySnapshot → normalizeLegacyPermissionStateForSession`
  是一条回指边。只有当该 helper **一并划入 READ** 时 READ 才是 8 且出边为 0——
  即 §11.3 的这两行数字来自两种不同的分组口径。
- **STORE 对 REST 出边为 0** 成立。
- `buildSessionStateSnapshot` 实际被 3 处引用（`constructor`、`rebindSessionProjectRoot`、
  `recovery/sessionRecoveryRuntime.ts`），非 §11.3 所述"随宿主组走"即可忽略。

### 12.3 §11.4 的"组合另一层"在 TS 下不成立

`store-binding` 与 `read-projection` 的方法**就是 SessionManager 的公共 API**
（外部调用点实测 **88 生产 / 178 测试**）。把它换成组合成员会同时改变公共面和全部调用点；
而保留委托包装**不降数**（§9.2 已证）。TS 单继承 ⇒ 抽 n 组只能是**深度 n 的链**，
不存在"两个独立基类各继承一层"。

### 12.4 实际采用的方案（维护者裁决）

**一个模块承载 STORE+READ 两组（18 名 + `constructor` = 判据 20），继承链固定为深度 2**：

```
SessionManager → SessionReadSurface → SessionLifecycleWrites
```

- 不是"1 组/base"：那会得到深度 3。
- 不是"2 bases"：TS 不允许。
- 代价：新模块 `sessionReadSurface.ts` 判据 **20，恰好卡在上限**（真实成员 21）。
  若判据修好 `createNew` 漏计，21 > 20——**该模块会变成新的越界项**（不影响 SessionManager 本身）。

**共享 store 的接法**：`host` 由 `SessionLifecycleWrites` 的 `private` 提升为
`protected`，`SessionReadSurface` 直接 `this.host.store`。**不新增 host 回调**——
READ 组对 REST 的 1 条边通过**把该 helper 一并迁移**消除，而非新增接口。

## 13. 第三批执行记录：（b）已完成（2026-09-18）

### 13.1 迁移内容

20 个成员迁入新模块 `src/session/sessionReadSurface.ts`：

| 组 | 成员 |
|---|---|
| STORE（9） | `getSessionFilePath` `getSessionDirPath` `listRealSessions` `getSession` `sessionExists` `getCurrentSessionForProject` `resolveCurrentSessionForProject` `setCurrentSessionForProject` `clearCurrentSessionForProject` |
| STORE 列表（2） | `listSessions` `listRecentSessions` |
| READ（9） | `deleteSession` `getTranscriptEvents` `getRecoverySnapshot` `getReplayPlan` `buildRuntimeStateSeed` `buildContinuitySnapshot` `normalizeLegacyPermissionStateForSession` `buildPromptContinuityContext` `buildPromptContinuitySnapshot` |

**逐字等价已证**：与 `10350ede` 的 SessionManager 对比，20 个方法体**唯一差异**是
`this.store.` → `this.host.store.`（含 `handleGetTranscriptEvents(this.store, …)` 一处），
`SessionManager.APPROVAL_AUDIT_HISTORY_LIMIT` → `this.host.approvalAuditHistoryLimit`，
以及 `listRealSessions` 由 `private` 放宽为 `protected`（子类仍需调用）。

SessionManager 的 `constructor` 是唯一实质改动：`store` 不再提升为字段，
直接以 `store: new SessionStoreAccess()` 传入 `super`。基类链各层构造函数原样透传 host。

### 13.2 计数结果（判据实测）

| 模块 | 判据 | 真实成员 |
|---|---:|---:|
| `session/SessionManager.ts` | **18** | 18 |
| `session/sessionReadSurface.ts` | **20** | 21 |
| `session/lifecycle/sessionLifecycleWrites.ts` | 17 | 17 |

**SessionManager 38 → 18（真实 41 → 18），首次进入上限内。**

### 13.3 验证

| 项 | 结果 |
|---|---|
| `tsc -p tsconfig.build.json` | 0 错误 |
| **SCC（1481 文件）** | **0 环**（搬迁前后一致，符合 §2.4.1） |
| 全量 `tsc --noEmit`（含测试） | **387 = 基线 387**，逐类 diff 仅联合类型成员**排序**差异，**零新增错误** |
| 全量测试 | **3172 项，3170 通过 / 2 失败** |
| 2 项失败定性 | 均为负载抖动：`cli-baseline.test.ts`（子进程）、`presentation/tui/surface/benchmark.test.ts`（CPU 计时）；**隔离复跑均通过** |
| `src/session/` + `src/core/shell/` 聚焦 | **509 / 509 通过** |
| **PTY 实机**（§2.4 强制） | 真实回合跑通（`working → thinking → ok`）；`/resume` 从 19 条增至 **20 条**，新会话 `sess_716` 在首位（`completed · 2 turns`） |
| 可达性 | **961 / 876 / 85**（较 960/875 改善 1） |
| 成员守恒 | 41 个原成员**零丢失**；三模块合计无重复（`constructor` 各一） |
