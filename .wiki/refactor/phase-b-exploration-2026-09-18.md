---
title: "Phase B Exploration (B1-B4)"
category: article
sources: [repo-audit-2026-09-15, plan-v6, architecture-exploration-2026-09-18, drift-exploration-2026-09-18]
created: 2026-09-18
updated: 2026-09-18
tags: [refactor, exploration, phase-b]
summary: "阶段 B 四个事项的探索记录。B3 与 B2 已定因并**推翻 plan 的两处数字/前提**；B1 与 B4 见下。所有数字实测。"
confidence: high
---

# Phase B Exploration

> 触发：plan §8.2 阶段 B 的四项**都需要维护者一次方向答复**才能动代码。
> 本文只做探索，不改代码。所有数字均为实测（命令随文附）。

---

## B3 — `renderer/` 去向（plan R5）

### 实测

| 项 | plan 记录 | **实测** |
|---|---|---|
| `src/renderer/` 文件数 | — | **2**（`StreamingRenderer.ts` + 同名 `.test.ts`） |
| `StreamingRenderer.ts` 行数 | — | **60** |
| 外部消费者 | **34** | **41**（cli 15 · core 14 · entrypoints 11 · session 1） |
| 出向 import | 0 | **0**（纯叶子，文件内零 import） |

复现：`grep -rln "renderer/StreamingRenderer" packages/ts-shell/src --include=*.ts | wc -l` → `41`。

**职责定位（读文件得出）**：`StreamingRenderer` 是**有副作用的输出通道**——默认写 `process.stdout`，
宿主安装 sink 时改走 sink（差分帧）。**不是**纯格式化器。

**`presentation/terminal/` 现状**：只有 **1 个文件** `renderer.ts`（149 行），是**纯格式化器**
（`ProductSurfaceViewModel|SessionStatusEnvelope → string[]`，无 stdout、无 sink）。
**plan 的"职责不同、不可合并"判断成立**——两者一个是通道、一个是格式化器。

**规则面**：`agent-rules/file-placement-and-naming.md` 的 Owner Domains 把 `renderer/` 列在
**cross-cutting/boundary 域**（本次修复才补入，见 A4/R3），而 `presentation/terminal/` 是其
**sanctioned 子域示例**，且推荐角色名里已含 `streaming.ts`（当前无此文件）。

### 三个选项的成本

**A=B=C 的重写成本相同**，因为 `renderer/` 只有 1 个实现文件：
**42 处 specifier 重写**（41 外部 + 1 自测）。A 与 B **仅叶文件名不同**。C（新子域）额外
制造一个单文件域。

### 建议：**A —— `presentation/terminal/streaming.ts`**

判据：
1. **规则收敛而非改变**：`presentation/terminal/` 已是 sanctioned 子域，`streaming.ts` 已是推荐角色名；
   `renderer/` 只被列为 boundary 域。搬迁是向规则靠拢。
2. **零命名碰撞**：`presentation/terminal/` 当前只有 `renderer.ts`。
3. **同文件名的 `renderer.ts` 已存在且职责不同**——若选 B（`terminal/output.ts`）会引入
   "两个 renderer 概念"的混淆；`streaming` 直接描述其真实职责（流式通道）。
4. **成本与 A/B 相同**，无额外代价。

**需维护者确认**：是否采 `streaming.ts` 这个叶名（B 选项 `output.ts` 亦可，但描述性更弱）。

---

## B2 — `docs/` 分类归档（plan R7）

### **R7 的前提被本仓自身政策否定**

`docs/archive/README.md` 原文：

> **Prefer status entries in `docs/DOC_STATUS.md` over moving files.**
> Move only clearly obsolete route drafts or closeout notes when the benefit is obvious and a pointer remains.

`docs/agent-routes/route166-docs-active-context.md:129` 原文：

> **Prefer classification over mass file moves.**

R7 提出"分类归档 ~700 份"，**与该政策直接冲突**。这不是技术发现，是**治理裁决点**。

### 实测：真正的缺口是"未分类"，不是"未归档"

| 项 | 实测 |
|---|---|
| `docs/` 文件总数 | **810**（其中 `.md` **770**） |
| `DOC_STATUS.md` 表行数 | 130，覆盖**去重路径 116**（docs/ 下 108） |
| **未出现在 map 的 `.md`** | **677 / 770 = 88%** |
| 状态分布 | historical 60 · active 26 · module-reference 13 · implementation-context 7 · foundation-evidence 4 · superseded 3 · archived 3 |
| `docs/agent-routes/` | 243（占全树 30%），仅由**一条 glob 行** `route*.md` 覆盖 |

plan 的"**~700**"是 **git 最后提交日期分桶**（2026-05-12..06-08），**不是路径清单**——
仓内无任何 manifest/tag/glob/状态行组枚举这批文件。**故当前无法用规则表达归档边界**。

### 门禁耦合（已读 `scripts/verify-docs-and-rules-drift.mjs`）

DOCS 作用域**不是目录列表**，而是 `DOC_STATUS.md` 中状态**恰为 `active`** 的行（docs/ 下 **11 行**）。
后果：

- 归档**未列出**或**非 active** 的文件 → 门禁**完全无感**；
- 归档一个 **active** 行所指文件 → `status-map-path-missing` + **exit 1**
  （且 `verify-release-core.mjs:124-130` 已接入 `--strict`）。

**11 行 active 保护着三棵非 route 树不被整树搬迁**：`docs/sprint/`(8 行)、`docs/DOC_STATUS.md`、
`docs/build-infrastructure/provider-streaming/ps004-live-provider-smoke-recovery.md`、
`docs/product-architecture-reset/executionBoundary/README.md`、
`docs/product-architecture-reset/harness-eval-artifact-index.md`。

### "零测试依赖"已证实，且被低估

全仓只有 **2 个脚本**提到 `docs/`：`verify-docs-and-rules-drift.mjs` 与
`real-provider-readonly-fixture.mjs`（后者在**临时工作区**里自建 `docs/flow.md`，不读本仓 docs 树）。
**零测试读本仓 docs 树。**

### 既有归档先例（两处都已执行过）

| 约定 | 证据 | 已执行 |
|---|---|---|
| `docs/archive/` + 明文政策 | 8 个文件，2026-08-31 迁入；`DOC_STATUS.md:166` 已把 `docs/archive/**` 映射为 `archived` | 是 |
| `docs/dev-history/routes/` + **指针桩** | Route222–226 共 5 份迁走，原路径留 290–334B 桩 | 是（**即 R7 的机制**） |

### 建议：**先分类（填满 map），再只做 banner，不搬文件**

判据：
1. 本仓政策明文反对搬文件——R7 若执行需先**显式override**该政策。
2. 实测缺口是 **88% 未分类**，而**分类是搬移的前提**（无规则则无法产出清单）。
3. 门禁对搬移**无所谓**——搬文件买不到任何门禁收益，只买到物理树变小。
4. banner **保持所有路径不变**，故门禁、JSON 引用、`.wiki` 引用都不会断；可逆。
5. 未列出的**机器可读 JSON**（`docs/implementation-context/` 48、`docs/project-map/` 9、
   `docs/foundation/` 4）是**被按路径加载的活数据**且**无门禁覆盖**——搬移会静默断链。

### 阻塞（须维护者裁决）

1. **边界规则本身**：文件名规则（route-family，351 份）/ 日期规则（~700，无清单）/ 状态规则 / 混合——选哪个决定清单，**这就是那个裁决**。
2. **是否 override** `docs/archive/README.md` 与 `route166:129` 的政策。这是 B2 的核心争议点。
3. **指针桩是否为必需**（351–700 份各留一桩 vs 单张映射表）。
4. **机器可读 JSON 是否在范围内**（plan 未表态；无门禁覆盖，搬移会静默断链）。
5. 两处 **glob 行会在搬移后静默失真**：`docs/design/*.md`、`docs/agent-routes/route*.md`——
   搬走成员而不改行，map 会继续声称一个不存在的路径，而门禁**会跳过 glob 不报**。
6. 附带披露：`docs/audits/` 被一条 `historical` glob 行点名，**但磁盘上不存在**。

---

## B1 — `core/` 准入 + `core/extensions/`（plan R6）

### 实测

| 项 | plan 记录 | **实测** |
|---|---|---|
| `core/` 子目录 | 22 | **22** ✓ |
| `core/` 文件数 | **1515**（§3.8） / **247**（§8.2 B1 行） | **326** |
| `core/` 外部入边 | 216 | **209**（我方独立测量）/ 216（plan） |
| `core/` 出边 | 未记 | **225** |
| 导入 `core/` 的域 | — | **9 个**（cli 76 · session 60 · entrypoints 39 · turn 24 · context 5 · config 2 · memory 1 · presentation 1 · result 1） |

**`core/` 确为横切基础层**（209 入边 / 225 出边，9 个域依赖它）——plan 的定性成立。

### **发现 plan 文档的一处硬错误（1515 与 247 均无来源）**

- 同一文档内部**自相矛盾**：`architecture-exploration-2026-09-18.md:13` 写
  **`src/` 下文件 1481（生产 961 + 测试 520）**，而 `:269` 写 **`core/` 1515 文件**——
  `core/` 是 `src/` 的**子集**，不可能大于全集。
- 该文档的提交信息（`8c6498ef`）**自己就写着 1481**，却写下 1515。
- **实测 `core/` = 326 文件**（`.ts` 324，其中 `.test.ts` 107）。
- 已验证**不是行数**（core 59232 行）、**不是 core+某域**——**1515 匹配不到任何测量**。
- **`247` 由 1515 派生**（plan.md:1222 的 B1 行），同属无来源；且 1515/247 与
  §3.8 自己的分词数字（`commands 66`/`harness 68`/`shell 55`/`tools 27`，实测吻合）
  放在同一句里，**这四个数之和仅 216**。
- plan 还引用了规则中**不存在**的句子："Keep business logic out of core"——
  `grep agent-rules/` **零命中**（最接近的真实文本是 `contracts must not contain business orchestration…`）。

### `core/extensions/`（2 文件）——**确认零消费者**

- `extensionContext.ts`（98 行）+ 其 `.test.ts`。
- **全仓唯一导入者就是它自己的测试**：`grep extensionContext` 仅命中这两个文件；
  `scripts/`、`src/index.ts`、`package.json` **零命中**。
- 历史两次独立测量都判它死：`reachability-2026-09-15.json` 同时列在 CLI 不可达与零引用。
- **决定性语境**：CLI 可达的 `core/commands/pluginCommandRuntime.ts:12` 明文写
  *"this build does not execute extensions"* —— 产品**主动声明不实现**该能力，
  而这 2 个文件正是那个被放弃能力的**孤儿实现**。
- 注意：它与 `src/runtime/extensions/lifecycle.ts` **不是一回事**——后者才是生产在用的扩展钩子。

### 规则缺口

`grep AGENTS.md agent-rules/` 对 `core/` 仅 **3 处命中**：一处举例括号、两处**子目录**职责
（`core/query/`、`core/shell/`）。**无任何准入标准**。`core/` 在 Owner Domains 里是**裸条目**
（本次 R3 修复后同一列表的其他 boundary 域都有单行定义，`core/` 在 feature 列表亦然）。

### 建议：**写准入规则 + 删除 `core/extensions/`，不搬迁**

判据：
1. 规则缺口是**全体性**的（无标准可违反），写规则是全部交付物，零代码风险。
2. `core/extensions/` 可证死（零消费者 + 产品明示未实现），且与产品声明**自相矛盾**。
3. **搬迁无依据**：`247`/`1515` 均无来源，且 plan §3.8 自己写"本轮不提出拆分方案"。
   照 247 搬移属"以未验证判据授权大规模搬迁"——正是 §6.4 记录过、产生 12 处真实破坏的模式。
4. 成本极不对称：A 是 markdown 编辑 + 2 文件删除（消费者集合可证为空）。

### 阻塞

1. **须确认 `core/` 保留并保持单域**（规则列为 owner，plan 已放弃拆分）——需一句确认。
2. **准入规则第 2 款（"≥2 个 feature 域消费，或有声明入口可达"）是否就是想要的门槛**。
   该门槛由 `core/subagents`(1 消费者)、`core/research`(1)、`core/workflow`(仅域内消费)、
   `core/extensions`(0) 反推而来。
3. **`core/harness/`（69 文件）的归属**：其 `README.md` **明文禁止整树批量搬迁**且声明
   该目录非产品运行时边界，但恰有 1 个文件被 `entrypoints/cliCommandExecutionBridge.ts` 导入。
   Step 4 对同类冲突的处置是把那 3 个生产可达文件移到 `evidence/harness/` 而非留在 `core/harness/`。
4. **规则编辑需显式授权**（`AGENTS.md` 明列规则文件需 explicit task scope）。

---

## B4 — 12 处越界模块（plan R4）

### 实测：**这 12 个不是一类**

用 judge 自己的三条正则（从 `normproof/dist/adapters/sidecar-file/module-graph.js:324`
`declaredFunctionNames` 取回）复算，并逐文件枚举核对：

| 模块 | judge | 实测真名 | 行数 | 纯委托 | 委托率 | 消费者 |
|---|---:|---:|---:|---:|---:|---:|
| `presentation/surface/model.ts` | 51 | 40 | 2254 | 0 | 0.00 | 9 |
| `runtime/evaluation/task/model.ts` | 52 | 40 | 2297 | 0 | 0.00 | 1（barrel） |
| `edit/multifile/model.ts` | 39 | 29 | 1710 | 0 | 0.00 | 5 |
| `core/query/runtime/harness.ts` | 32 | 30 | 1414 | 0 | 0.00 | 9（全在 session/） |
| `presentation/tui/editor.ts` | 28 | 29 | 463 | 1 | 0.03 | 2 |
| `cli-baseline.test.ts` | 27 | 23 | 3906 | 0 | 0.00 | — **测试文件** |
| `core/shell/sessionTerminalState.ts` | 27 | 25 | 1089 | 0 | 0.00 | 3 |
| `planning/runtime/engine.ts` | 27 | 25 | 964 | 0 | 0.00 | 4 |
| `runtime/evaluation/model.ts` | 27 | 24 | 641 | 0 | 0.00 | 1（barrel） |
| `runtime/evaluation/task/liveRun.ts` | 26 | 15 | 1735 | 0 | 0.00 | 1（test） |
| `core/query/runtime/policy.ts` | 23 | 21 | 534 | 0 | 0.00 | 1（test） |
| `session/store/sessionStoreAccess.ts` | 22 | 18 | 192 | **19** | **1.00** | 3 |

**结论**：**2 个是薄 facade**（`sessionStoreAccess` 委托率 1.00；`liveRun.ts` 15 真名且大半是字面量表），
**其余是不同密度的真单体**。我方独立复算的委托率（0.00–0.14）与此一致。

**对照**：`SessionManager` 的委托率约 **0.35**（22/62）——这才是"薄 facade"。

### judge 判据**并非总是下界**（推翻 plan 的一处前提）

plan 断言"判据计数是下界，真实成员数只会更多"。**实测对 3/12 个模块不成立**：
`edit/multifile/model.ts`（judge 39 → 真 29，**高估 26%**）、
`liveRun.ts`（26 → 15，**高估 42%**）、`runtime/evaluation/model.ts`（27 → 24）。
成因：正则 2 的 `=…(` 分支会命中普通 `const x = someCall(`；正则 3 会命中函数体内的对象字面量成员。
**故任何拆分都不得按 plan 的表定范围，须重新测量。**

### plan 的规则引用是**误引**

plan 写"按 agent-rules **第 147 行**，facade 可保留，单体不可"。实测：
- **147 行**是 `Prefer this:` 代码块里的一个**文件名**（`presentation/terminal/renderer.ts`），
- facade 的实际依据在 **151–170 行**（`## Compatibility Shims`），且 **170 行点名
  `SessionManager`**："may retain real session lifecycle coordination, public API compatibility,
  dependency assembly, transaction ordering, and cross-session coordination"。
- **它只对这一个具名例子授权**，**不是**通行豁免。

### judge 严重度：**advisory，不阻塞**

`.normproof/norm-packs/software-structure-v0/profile.json` 的
`declared_functions_within_module_ceiling` = **`severity: "advisory"`**；
judge 自己的输出：**"open advisory obligations do not block"**，`Would block: no`。
**当前没有任何构建/测试/发布门禁因此 12 项而停止。**

### 建议：**先定判据（O4），再只拆 3 个真单体（O2）**

**四款可计算判据**（全部满足才算薄 facade，否则适用上限）：

```
thinFacade(module) ≜
    delegationRatio ≥ 0.90          # 名称数是聚合，不是逻辑
  ∧ branchingFunctionCount = 0      # 无 if/for/while/switch/try/三元
  ∧ ownStateWriteCount = 0          # 构造函数外无 this.<field> =
  ∧ linesPerDeclaredName ≤ 15       # 声明不是蔓延的函数体
```

**阈值有实测分离度支撑，非拟合**：实测**只有 1 个模块**满足委托率 ≥0.90（`sessionStoreAccess` = 1.00），
**也只有同一个**满足无分支；其余全部落在 0.00–0.03。**facade 簇(1.00) 与其余(≤0.03) 之间存在全量程断层，
故 (0.03, 1.00) 区间内取任何阈值分类结果相同**——这就是 0.90 安全的理由。

**安全 / 危险分组（实测）**：
- **危险（禁机械拆分）**：`edit/multifile/model.ts`（`classifyTarget→…→observeRollback`
  是**安全有序**的写路径序列，`applyTarget`/`observeRollback` 真写工作区）；
  `core/query/runtime/harness.ts`（`settleHarnessBatch` 435 行 + `settleHarnessOutput` 247 行
  的状态机，其 `QueryRuntimeHarnessState` 是**被编解码的契约**）。
- **安全**：`runtime/evaluation/task/model.ts`（40 名中 18+ 是 `caseDefinition` 字面量块，1 消费者是 barrel）、
  `runtime/evaluation/model.ts`（24 名中约 18 是字面量构造器）、`liveRun.ts`、`core/query/runtime/policy.ts`。
- **不该拆**：`sessionStoreAccess.ts`（判据下**根本不是违规**，且 3 个消费者依赖它作装配面
  = 170 行"dependency assembly"职责）；`cli-baseline.test.ts`（**测试文件**，为生产规则拆测试属类别错误）。

### 阻塞

1. **`cli-baseline.test.ts` 是否在范围内**：manifest glob 为 `packages/**/*.ts`，**无测试排除**。
   这决定头条计数是 12 还是 11。
2. **上限是 per-module 还是 per-class**：`presentation/tui/editor.ts` 是**单个内聚类**（29 方法、463 行、单一职责），
   per-class 规则下无需改任何代码即可清零。**无测量能裁决，是政策选择**。
3. **`runtime/evaluation/{task/,}model.ts` 是否属发布面**：二者唯一消费者是 `src/index.ts` 的 re-export。
   是"发布的公共 API"（则名称计数成立）还是"内部评测脚手架"（可收进 barrel），
   **只有发布面政策能回答**。
4. **拆 `multifile/model.ts` 或 `harness.ts` 前须先定回归门禁**：二者触及持久化/写语义，
   而 B4 未指定验证门禁。

---

## 四项交叉结论

| 项 | plan 的前提是否成立 | 关键测量 |
|---|---|---|
| **B1** `core/` | 定性成立（确为横切层：**209 入边 / 9 域**）；**但 `1515` 与 `247` 均无来源** | `core/` = **326** 文件；同一文档自述 `src/` 仅 **1481** |
| **B2** `docs/` | **被本仓自身政策否定**（`docs/archive/README.md`："Prefer status entries over moving files"） | **677/770（88%）文档未分类**；门禁对搬移无感 |
| **B3** `renderer/` | 去向待裁；**消费者数记错**（34 → 实测 **41**） | 单文件域，A/B/C 同为 **42 处重写** |
| **B4** 越界模块 | **"都是真单体"不成立**（2 个是 facade）；**规则引用是误引** | 委托率：facade **1.00** vs 其余 **≤0.03** |

**共同模式**：四项里**三项**的 plan 前提含未经验证的数字或误引，
与阶段 A 复核发现的 `*Like` 镜像漂移、`check:*` 误判**同属一类**——
**结论先行、数字未复核**。阶段 B 动代码前应先修正这些前提。


