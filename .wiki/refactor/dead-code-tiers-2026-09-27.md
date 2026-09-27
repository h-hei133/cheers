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

分档标准是**证据强度与体量**，不是「确定性」。
**三档现均已查清，裁决均为删除**：第一档证据最硬、第二档经逐文件复核后由维护者裁决删除、
第三档经数据流实测判定可删。

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

### 第二档 —— **维护者裁决：删除**（2 簇 / 55 文件 / 16,531 行）

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

#### 维护者裁决（2026-09-27）：**删除**

理由与记录（**不是**「因为它多余」——它不多余）：

- 该能力**无任何可参照方案**：四个顶级项目零实现
  （`pi` 全仓 `rollback` 0 命中；`opencode` `packages/core/src/file-mutation.ts:205`
  仍写着 `TODO: Design multi-file transactions / rollback`；
  `oh-my-pi`、`source-claudecode` 的命中均与编辑无关）。详见
  `tier2-direction-research-2026-09-27.md` §1.2。
- 我方活轨**另一条** `blocked` 条目提供了设计意图证据：
  `edit/result/editCapabilityReadiness.ts:131-134` 记
  `blocked("automatic-recovery", ["restore requires explicit user/session action"])`
  ——即**产品当前的设计意图是「恢复必须显式触发」**，自动回滚与之相悖。
- 现有文件（`edit/multifile/model.ts`）只到一半：编排与回滚循环有实现，
  但恢复裁判（`edit/recovery/model.ts`，844 行）**全是类型零函数**，
  且与活轨 hunk（`targetBinding: "single-target"`）**契约不同**——
  接入需要改编辑核心路径的契约，风险高于收益。

**⚠️ 必须随删除一并留下的记录（否则下次复核会重新发现一遍）**：

1. **这是一次明确的能力放弃，不是清理。** 删除后「多文件原子事务 + 回滚」
   在本产品中**不存在**，且**无实现路径**。
2. **`edit/result/editCapabilityReadiness.ts:134-136` 的 `blocked("atomic-rollback", ...)`
   保持不变**——它现在**更加**准确（不再是「未接线」，而是「已决定不做」）。
   执行删除时应在该条目**加注释**，指向本文件，写明「实现曾存在于
   `edit/multifile/model.ts`，已于 <日期> 按本裁决删除」。
3. **在 `capability-backlog.md` 留一条**，与簇 1 同类处理：写明若未来要做
   多文件事务，此处曾有实现，以及**为何当时删除**（无参照、与显式恢复的设计意图冲突）。
4. **删除会移除 `editCapabilityReadiness` 所报告状态的部分依据。**
   该文件声称「no transaction rollback executor exists」——删除后这句话
   从「尚未接线」变为「永久成立」。**已实测复核该文件全部 8 条 `blocked`**，
   其中 **3 条**与本能力域相关，执行时需一并加注释指向本文件：

   | 条目 | 现有理由 | 删除后的含义 |
   |---|---|---|
   | `arbitrary-broad-apply-patch` | `workspace authority remains file-scoped` | 不变（活轨权威本就是文件级） |
   | `automatic-recovery` | `restore requires explicit user/session action` | **不变**，且与本次裁决一致 |
   | `atomic-rollback` | `no transaction rollback executor exists` | 由「未接线」变为「已决定不做」 |
   | `default-durable-persistence` | `no SessionManager persistence wiring` | 不变 |

   其余 4 条（`fuzzy-patch`、`binary-mode-symlink-submodule-copy`、
   `directory-operations`、`overwrite`）与被删文件无关。

### 第三档 —— **已查清：可删**（1 簇 / 3 文件 / 932 行）

- `session/store/host/state.ts`（232）—— 全仓**零引用（连测试都没有）**
- `session/sessionTreeProjection.ts`（515）—— **无自身测试**
- `context/sessionContextRebuildProjection.ts`（185）—— 有测试

**两个复核结论最初相反**（代码派判 KEEP、参照派判 DELETABLE），
**由本人实测裁决为可删**，关键证据如下。

#### 决定性证据：数据流是死的，不只是「没人 import」

该簇声称做「会话树 + 压缩记录 + 事实出处 + 上下文重建审计」。
实测其**数据来源从未被生产代码写入**：

```text
# 1. 谁构造 SessionCompactionRecord？
grep -rn 'addDurableSessionCompaction' src --include=*.ts | grep -v '\.test\.'
  → 只有它自己的定义，零调用者
grep -rn 'addSessionCompactionRecord' src --include=*.ts | grep -v '\.test\.'
  → 只有 schema 定义 + threadState.ts:87 —— 而该函数的唯一出口
     addDurableSessionCompaction 零调用者
  ⟹ 生产代码从不写入任何 compaction 记录

# 2. 谁读 thread.compactions？
grep -rn '\.compactions' src --include=*.ts | grep -v '\.test\.'
  → sessionTreeProjection.ts:176、:222（**死文件自己**）
  → schema/sessionThread.ts:179（定义处）
  ⟹ 读它的只有死文件

# 3. 谁读 retainedContextFacts / staleInputIds / unsafeInputIds / missingFactIds？
  → 仅 schema 定义 + sessionTreeProjection.ts（死）+ 两个测试
  ⟹ 零活轨读者

# 4. 死簇的输出被谁用？
grep -rn 'projectSessionTree|SessionTreeProjection' src --include=*.ts | grep -v test
  → 仅 session/store/host/state.ts:8,192,193（**同为死文件**）
  ⟹ 输出只在簇内流转，无出口
```

**活轨读 `SessionThreadSnapshot` 的只有 `activeLeafId`**
（`query/sessionEntries.ts:183`、`export/collect.ts:159`、`entriesCommandRuntime.ts:58`），
即**「当前叶子在哪」**，而**不是**压缩记录、事实出处或树出处标记。

#### 与参照实现的对照

| 维度 | 本簇 | 参照实现 |
|---|---|---|
| 会话树 | 携带 compaction + 事实出处 + `treeSupport`/`branchSupport` | 纯拓扑父子图（节点 + 子引用），**不带出处审计** |
| 恢复上下文 | 产出**审计结构**（缺哪些事实、哪些过期） | 产出**可执行消息流**（回退到最近 compaction，拼 summary + 保留尾部） |
| 内存态会话 | 裸 `HostSessionRecord[]` 数组，无消费者 | 完整存储后端（实现 commit/scan/get/set/delete），**已接线** |

**本簇产出的是「审计投影」，不是「可执行数据」。** 而活轨**已有**可执行侧：
`session/recovery/resumeContextBuilder.ts` 的 `buildSessionResumeContext`、
`session/replay/builder.ts:260` 的 `replayMessages`。

#### 裁决

**可删。** 理由分三层：

1. **数据流死**（上述实测）：来源从无写入、输出无出口、标记无读者。
   「职责未被活轨承担」与「这份职责从未成立」是两件事——本簇属后者。
2. **能力方向不一致**：本簇的审计式投影与产品既有路线（可执行消息流 + 显式恢复）**不是同一条**，
   参照实现亦无对应物。
3. **`state.ts` 的「内存态多会话协调」**：这是唯一可能有价值的残余，
   但**零引用（连 harness 与测试都没有）**，属「未建成的线」而非「被取代的能力」；
   重建成本低于维护成本。

**⚠️ 删除时的注意项**：
- `schema/sessionThread.ts` 的 `retainedContextFacts` / `excludedContextFacts` /
  `SessionCompactionFact` **不是**本簇文件——它们是 `schema` 的一部分。
  删除本簇后这些字段**将失去唯一的读者**，应在**同一轮**一并裁决
  （`schema/sessionThread.ts` 本身是活的：`buildLinearSessionThreadSnapshot`、
  `appendSessionThreadChild` 等被活轨使用）。
- `state.ts` 引用的 `buildLinearSessionThreadSnapshot` / `appendSessionThreadChild`
  在 schema 内是活的，**不要连带删除**。
- `context/sessionContextRebuildProjection.test.ts` 与
  `session/sessionProjection.test.ts`（后者同时测活轨的续接投影）需分别处置：
  前者随簇删除，**后者必须改写**（去掉对死模块的引用，保留活轨断言）。

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
- 第三档**已查清**（见 §3），其中「参照实现是否有对应物」由子代理在 `~/projects/pi`
  与 `~/projects/oh-my-pi` 上核实；本簇的**数据流死结论由本人实测**（命令与输出见 §3）。
- 第三档遗留：`schema/sessionThread.ts` 的 `retainedContextFacts` 等字段在删除后将失去唯一读者，
  其**去留**尚未裁决（属 schema 文件，不在本簇范围内）。

---

## 6. 执行结果（**2026-09-27**，三档全部完成）

| 档 | 提交 | 删除 |
|---|---|---|
| 第一档 | `812d7f22` | 23 核心文件 + 6 专属测试 + 2 harness 文件 = 31 |
| 第二档 | `33c369ae` | 55 核心文件 + 29 测试 = 84 |
| 第三档 | （本次） | 3 核心文件 + 1 专属测试 = 4 |

**每档独立验证**：`tsc` 0 错误 → 全量套件 → 七道门禁。

**实测计数变化**（`analyze-boundaries.py`）：

```text
删除前:  production=988  cliReachable=864  cliOpaque=124
第一档后: production=964  cliReachable=864  cliOpaque=100
第二档后: production=909  cliReachable=864  cliOpaque=45
第三档后: production=906  cliReachable=864  cliOpaque=42
```

**最终**：`520 文件 / 3960 通过 / 1 跳过 / 0 失败`；七道门禁全 pass；
`plan.md` §1 表与 frontmatter 已同步。

**删除过程中的三个实测修正**（记录备查）：

1. **闭包比清单大**：删核心文件后 `tsc` 会暴露所有悬挂引用。
   第一档因此多删了 2 个 harness 文件（spike fixture 及其场景测试，
   整个子图只为已删适配器而存在）。
2. **「混合测试」需按断言目标而非 import 分辨**：12 个引用活模块的测试中，
   6 个只是**拿活模块当夹具、断言却全部落在死模块上**（删），
   4 个真正测试活链（改），2 个是纯悬挂 import（改）。
   判据：测试体里对**哪个模块**的调用产生了 `expect`。
3. **门禁会抓文档漂移**：`verify:docs-drift:strict` 两次因删除而失败——
   一条 binding rule 的示例路径、一条 active sprint plan 的四个证据路径。
   按各文档**既有约定**修正（rule 换成活文件；sprint plan 标注删除日期），
   而非删除引用。

**遗留**（未在本轮裁决，见 §3 第三档注意项）：
`schema/sessionThread.ts` 的 `retainedContextFacts` / `excludedContextFacts` /
`SessionCompactionFact` 在被删簇之后**只剩测试读者**（`threadState.test.ts`）。
该 schema 文件本身是活的（`threadState.ts` 仍用 `addDurableSessionCompaction`），
故**未随簇删除**；这些字段的去留需另行裁决。

---

## 7. 待办

- [x] 第一档删除执行（`812d7f22`）
- [x] 第二档删除执行（`33c369ae`）
- [x] 第三档删除执行（见 §6）
- [ ] **§3 第二档「必须随删除一并留下的记录」四条**：其中第 2、3 条
      （`editCapabilityReadiness.ts:134-136` 的 `blocked("atomic-rollback")` 加注释、
      `capability-backlog.md` 留条目）**尚未执行**——属记录工作，不影响构建
- [ ] `schema/sessionThread.ts` 事实字段的去留（见 §6 遗留）
- [x] 第二档方向研究 —— 见 `tier2-direction-research-2026-09-27.md`
      （结论：簇 1 能力非必需；簇 2 能力真实缺失但**无任何可参照方案**）
- [x] 第三档 §2.2-2 —— 结论：**可删**（数据流死；详见 §3）
