---
title: "Architecture Refactor Plan"
category: article
sources: [repo-audit-2026-09-15, tsc-baseline-2026-09-15, vitest-baseline-2026-09-15, failures-baseline, reachability-audit-2026-09-15, subagent-reviews-2026-09-15]
created: 2026-09-15
updated: 2026-09-18
tags: [refactor, architecture, plan]
summary: "Module boundary refactor plan v5。当前生产 961 / CLI 可达 876 / 不可达 85，全量测试 3172 项。删除授权依据为「职责已被活轨承担」（§2.1），不再使用可达性。Step 3 域搬迁（3a-3f）、Step 4 orchestration 解散（9 批）、Step 5 SessionManager 拆分（3 批，判据 38→18）、Step 6 命名税（173 文件）、Step 7 judge 全量跑（0 blocking）均已完成。§4 记录删除判据被证伪的经过与 12 项真实破坏。"
confidence: high
---

# Architecture Refactor Plan (v5)

> `.wiki/refactor/` 是整个模块边界重构计划的唯一记录位置。
> **本文件已重组：现状与规则在前，历史在后。** 阅读顺序：§1 现状 → §2 规则 → §3 后续工作；
> §4 起为约束来源与历史记录，需要追溯时再读。

**版本沿革**：v1 初版 → v2 引入生产可达性 BFS → v3 发现删除路线错误、新增 Step 2.7 →
v4 方向重定（删除依据改为"是否已有实现的一部分"）→ **v5 重组结构** →
**v5.1 同步 Step 3 完成后的现状** → **v5.2 同步 Step 4/5 完成后的现状** → **v5.3 Step 3–7 全部完成（2026-09-18）**。

---

## 1. 当前状态（2026-09-18）

| 指标 | 值 |
|---|---:|
| 生产文件 | 961 |
| CLI 可达 | 876 |
| CLI 不可达 | 85（仅测试 72 + 仅公共 API 5 + 零引用 8） |
| 全量测试 | **3172 项** |
| 稳定失败 | **0**（`testTimeout` 已修为 30s，原 5 项负载超时消除） |
| `tsc -p tsconfig.build.json` | 0 错误 |
| NormProof judge | verdict `partial`；**blocking 义务 0 项未满足**（唯一 blocking 义务 satisfied） |

**注**：可达性自 Step 3 起全程未变（搬迁不改可达性，符合预期）；Step 5 第 2、3 批各 +1
（959 → 961），原因是被新模块纳入的代码进入了 CLI 可达集。最终 **961 / 876 / 85**。
全量 tsc（含测试）**387 错**——全部为测试文件的既有类型错误，与本计划无关
（Step 5 执行前后逐类 diff 为零新增，仅联合类型成员排序差异）。

### 已完成阶段

| 阶段 | 结果 |
|---|---|
| Step 1 基线与失败分类 | 57 项失败全部裁决并执行（详见 §6.1） |
| Step 2.5-A 历史脚本清理 | 删 42 个脚本/文档 + 68 条 package 注册 |
| Step 2.5-B CLI-only BFS | 产出删除候选清单（未删文件） |
| Step 2.5-C-1 产品 facade | 删 5 个单行 re-export |
| Step 2.5-C-2 `model-adapters` | **已中止**（整域摘除破坏簇内依赖） |
| Step 2.5-C-3 主簇删除 | 删 573 文件（生产 310 + 测试 254 + 测试基建 9） |
| Step 2 基线回绿 | 30 → 0 失败；同期修 CB-004 终态真实性、TUI 审批面板 |
| Step 2.6 零引用簇删除 | 删 82 文件（1 个误删已回退）；剩余范围冻结 |
| Step 2.7 修正前序删除 | 见下 |
| **Step 3 域搬迁（3a-3f）** | **✅ 全部完成**（2026-09-18）。6 个域归位，`core/context` 四域混居问题解决；详见 §3.2 |
| **Step 4 orchestration 解散** | **✅ 全部完成**（2026-09-18，9 批）。123 文件分流至 7 个 sanctioned 域，`src/orchestration/` 已删除；详见 §3.3 与 §6.10 |
| **Step 5 SessionManager 拆分** | **✅ 全部完成**（2026-09-18，3 批）。判据 **38 → 18**，继承链深度 2；详见 §3.5 |
| **Step 6 命名税** | **✅ 全部完成**（2026-09-18，路径 B）。改名 **173** 个；`playwright` 经实测裁定保留；详见 §3.3 |
| **Step 7 judge 全量跑** | **✅ 全部完成**（2026-09-18）。**0 blocking**，唯一 blocking 义务 satisfied；越界模块 13 → **12**；详见 §3.6 |

### Step 2.7 执行结果

| 目标 | 状态 |
|---|---|
| 修复 12 项破坏 | ✅ **全部处置完毕**（5 修复 + 5 删除/移除 + 2 登记 backlog）——见 §3.1 |
| 核验 403 个已删文件 | ✅ 100%（原始表 `audit-raw/*.json`） |
| 裁决 10 项未接线能力 | ✅ **全部不恢复**（§4.6） |
| 固化删除前置检查 | ✅ 入 §2.2 与 `handoff-2026-09-17.md` |
| 删除迁移残留 shim | ✅ 7 个（`cliReachable` 保持 873） |
| 删除过期 gate | ✅ 2 个（closeout 假阳性、browser-txn-gate） |
| PTY 实机验证 | ✅ 会话树正常（`session-root → user → user → assistant`） |

### 85 个不可达文件的处置（已裁决：不动）

审查结论：85 个中 **83 个是"独有实现"**（非冗余），**生产零引用**，75 个仅被测试引用。
其中 3 个受保护（2 个公共 API + 1 个字符串路径进程入口）。

**维护者裁决：不删。** 理由：能力价值已按裁决 1 放弃，但物理删除无收益
（需连带处理 75 个测试文件），且它们是独有实现——删除是净损失而非清理冗余。
**即：价值上已放弃，物理上保留。**

---

## 2. 当前规则（操作性，后续任何改动适用）

### 2.1 删除授权依据

| 已废弃 | **现行** |
|---|---|
| `cli:false` ⇒ 可删 | **职责已被活轨承担** ⇒ 可删 |
| 可达性 BFS | ① 重导目标存活（shim）② 同名声明存在于活轨（内联归并）③ 调用链覆盖（功能已实现） |

**可达性只用于分析，不授权删除。** 理由见 §4.1。

### 2.2 删除前六项检查（强制）

1. **功能读审**——读实现，不只看 import 图。
2. **等价实现核验**——不采信推理。反面教材：165 行的 `editEngine.ts` 曾被当作
   2439 行补丁链的"替代"，规模差 15 倍而未察觉。
3. **消费者存活检查**——活轨是否有 CLI 可达代码在读取其数据/标记。
4. **动态入口检查**——`path.join(...)` + `spawn`/`execFile`、`pathToFileURL` + `import()`、
   `*Process.ts`、`process.argv` / shebang / `main()`。
5. **公共面检查**——`packages/ts-shell/src/index.ts` 是 package `main`，
   由 `scripts/verify-host-surface.mjs` 实测消费。
6. **`scripts/` 引用检查**——脚本可能以字符串路径引用 `src/` 模块。

**删除单元取连通分量整簇**，不按单文件摘除（`model-adapters` 先例，§6.2）。

### 2.3 断链的三类形态

| 类别 | 表现 | 检测 | 实例 |
|---|---|---|---|
| 引用型 | import 不存在的模块 | `tsc` / import 图 | 403 文件全扫，**零** |
| **契约型** | 活轨读某字段/标记，无人写 | 对被读字段反查写入点 | `provenance.toolExecutions`、`/undo` 快照 |
| **半孤儿** | 在可达集内但无调用者 | 对导出函数反查调用点 | `core/context/browserAgent.ts` |
| **验证型** | 门禁声称覆盖 N 项、实跑 M 项（M<N）仍报通过 | 校验声明目标是否都存在 | `verify:edit-capability-closeout` |

**"在 CLI 可达集内" ≠ "被调用"**：可达性由 import 边驱动，`import type` 也算边。

### 2.4 验证纪律

- v1 保留：tsc build + vitest 基线 diff + golden gate；数据只写在命令跑完之后。
- **每波删除后重跑 BFS**，`cliReachable` 与删除前完全一致才算通过。
- **PTY 实机验证（v4 强制）**：触及 `session/`、`cli/`、`turn/`、`core/shell/`、
  `entrypoints/` 任一目录的改动，必须启动真实 TUI 走完整回合
  （输入 → 工具调用 → 审批 → 执行 → 收尾 → 会话落盘）。
  **单元测试绿灯不构成实机可用的证据。**
  触发面：会话持久化、审批链、TUI 渲染、启动链、删除被 CLI 依赖的模块。
- **验证脚本必须能报告"覆盖缺失"**：把测试路径传给 vitest 时，
  vitest 对缺失路径不报错，会导致"覆盖缩水但报通过"。
- **`testTimeout` = 30s**（2026-09-18 起）：browser/CLI 场景测试 spawn 真实子进程，
  单项耗时 8–16s（实测最慢 16.23s，74 项 >3s），5s 默认值必然并发抖动。
  改配置而非改测试；真挂起仍会失败。

### 2.4.1 搬迁纪律（Step 3 固化，后续搬迁适用）

1. **搬迁前跑 import 图 SCC 检查**。环不会让 `tsc` 报错（类型解析仍成功），
   只有 NormProof judge 或运行时才暴露，故必须独立核验。
   基线：**全仓 0 环**（含测试文件）。做法：搬迁前跑一次，按目标路径重建图再跑一次。
2. **只重算 escaping 边**。整域/整树搬迁时域内相对路径解析结果不变，
   逐条改写域内边会产生大量无意义 diff。判据：`resolve(old_file, spec)` 是否仍落在域内。
3. **边数必须按 import 图实测，不采信映射表估算**。Step 3 六次搬迁估算全部偏低
   （30→37、17→18、31→46、361→1537）。
4. **目标路径先核实是否已有同名概念**。`src/context/memory/` 的既存 `ContextMemory`
   与 `ProjectMemory` 是同词异义；按目录名机械归并会造成概念混淆。
5. **搬迁不夹带重命名**。命名决策属独立步骤（Step 6），混入会让同一 diff
   同时论证"位置变更"与"命名决策"。
6. **改写产物必须校验后缀**。specifier 用 `.js`（指向 `.ts` 源）。
   曾因把解析出的 `.ts` 路径直接当 specifier 用，产生 440 条 `TS5097`。

### 2.5 不得因 `cli:false` 而删的三类

1. **公共 API 面**：`index.ts` 及 `runtime/{distribution,evaluation/task}/*`。
2. **契约型断链的生产者**：活轨有 CLI 可达消费者读取其数据者。
3. **动态入口**：字符串路径启动、`*Process.ts`。

---

## 3. 后续工作

### 3.1 Step 2.7 处理结果（12 项破坏 — 全部处置完毕）

| # | 类型 | 内容 | 处置 |
|---|---|---|---|
| 1 | 契约型 | 写授权 `O_NOFOLLOW` 缺失 | ✅ 已恢复接线 |
| 2 | 契约型 | `/undo` 快照写入缺失 | ✅ 已恢复接线 |
| 3 | 契约型 | `provenance` 5 读 0 写（二级断链） | 📋 登记 **CB-005**（架构级，不单独修） |
| 4 | 契约型 | `disabledTools` 设置被静默忽略 | ✅ **已修复 + PTY 实机验证** |
| 5 | 能力级 | OpenAI account-auth 可登录但必然失败 | 📋 登记 **CB-006**（维护者裁决：登记不改） |
| 6 | 契约型 | `executionLane` 指向不存在的路由 | 📋 记录（附十七），生产零消费 |
| 7 | 契约型 | 25 条证据标签死条件 | 📋 记录（附十八），同 #3 根因 |
| 8 | 契约型 | `pwStatus.ts` 宣传已删的 Eval mode | ✅ 已移除该行 |
| 9 | 契约型 | focused-test 白名单 6 条全失效 | ✅ 已彻底移除该语义 |
| 10 | 脚本 | 5 个 verify 脚本 `MODULE_NOT_FOUND` | ✅ 已删脚本 + 注册 |
| 11 | 验证型 | `verify:edit-capability-closeout` 假阳性 | ✅ 已删（只打印不校验） |
| 12 | 验证型 | `verify:browser-txn-gate` 服务对象 14/14 全缺 | ✅ 已删 |

**#4 的实机证据**（§2.4 强制）：以 `{"disabledTools":["bash"]}` 启动真实 TUI，
触发 bash 后实际输出 `Tool bash not found`；修复前该设置被忽略、bash 正常执行。

**#3 / #6 / #7 同源**：三者都是 **CB-005（turn 与编排层不连通）**在
不同数据层的表现——读取侧存活、写入侧随主簇删除。
**不单独修复**，待该架构问题立项时一并解决。

**#5 的裁决**：维护者 2026-09-17 选"登记不改"。恢复 codex 调用路径属
新增 provider 能力，且同属 CB-005。

### 3.2 Step 3 域搬迁（3a-3f）— ✅ 全部完成（2026-09-18）

**完整映射表与逐阶段执行记录**：`.wiki/refactor/step-3-migration-map.md`（§6.1）

**起因**：`core/context/` 不是 browser 域，而是**四域混居**（351 文件）。
目录名没表达内容，这正是"browser 坟场"观感的来源。

**结果结构**：

| 目标 | 文件 | 来源 |
|---|---:|---|
| `src/browser/` | 228 | 平铺 `browser*`/`pw*`/`stealthPreload` 161 + `browser/{receipt,runtime,skill}` 67 |
| `src/memory/` | 41 | `core/context/memory/` |
| `src/presentation/sidebar/` | 34 | `core/context/sidebar/` |
| `src/context/compact/` | 33 | `core/context/compact/` |
| `src/context/startup/` | 9 | `core/context/startup/` |
| `core/context/model/` | 6 | **留原位**（共享上下文类型层，3a 判定归属正确） |

**`core/context/` 现仅剩 `model/` 6 文件**——四域混居问题解决。

**执行顺序（按依赖方向）**：

| 阶段 | 内容 | 提交 | 实测边数（估/实） |
|---|---|---|---|
| 3a | `model/` 判定 + 错置文件归位 | `e53ba6b4` | 1 / 1 |
| 3b | `startup/` → `context/startup/` | `54021279` | 5 / 5 |
| 3c | `compact/` → `context/compact/` | `59fde020` | 30 / **37** |
| 3d | `sidebar/` → `presentation/sidebar/` | `35ca1751` | 17 / **18** |
| 3e | `memory/` → `src/memory/` | `dc38b155` | 31 / **46** |
| 3f | browser 域 → `src/browser/`（4 批） | `d527993a` `60b24107` `28e6e433` `3f4fd752` | 361 / **1,537** |

**3f 分 4 批，顺序由依赖方向决定**（非文件数）：
`receipt`(14) → `runtime`(32) → `skill`(21) → 平铺(161)。
理由：`runtime` 引用 `skill/*`、`skill` 引用 `runtime/*`、平铺层被三者共同引用——
**先搬被依赖者**，后续批次的 escaping 边始终指向已存在的路径。
平铺批次**必须整批**（内部 567 边），拆开会让同一批边被重写两遍。

**约束遵守**：`core/harness/README.md` 的"Do not bulk-move this directory as one
artifact family"——`core/harness` 本身**不搬迁**，仅更新其引用。

**3f 未执行的事项（留给 Step 6）**：草案曾提议"平铺实现命名去掉冗余 `browser` 前缀"。
**未做**——命名决策属独立步骤，混入搬迁会让同一 diff 同时论证两件事。

**关键前置检查（§2.4.1）**：六次搬迁**全部** 搬迁前 0 环 → 搬迁后 0 环。

**验证**（每阶段均执行）：build 0 错；相关域测试全绿；最终**全量 3172 项零失败**；
可达性 959/874/85 全程不变；`validate` + `verify:host-surface` PASS；
**PTY 实机**逐阶段验证（`/compact preview`、`/sidebar panel`、`/memory save`、
`/browser status` + `/browser replay`）。

### 3.3 Step 4-7

| 步骤 | 内容 | 前置 |
|---|---|---|
| Step 4 | orchestration 聚类 | ✅ **已完成**（2026-09-18，9 批）——`src/orchestration/` 已解散，123 文件全部分流 |
| Step 5 | SessionManager 拆分（51 方法 facade，ALIVE） | ✅ **已完成**（2026-09-18，3 批）：判据 **38 → 18**，全仓首次进入上限内；详见 §3.5 |
| Step 6 | 命名税裁定（含 3f 遗留的 `browser` 前缀） | ✅ **已完成**（2026-09-18，路径 B）：改名 **173** 个；`playwright` 经实测裁定**保留**（真实依赖）；边集守恒 4960→4960；详见 §3.3 |
| Step 7 | 收尾：NormProof judge 全量跑 | ✅ **已完成**（2026-09-18）：**0 blocking**；无环与 specifier 两项 **satisfied**；`SessionManager` 已退出越界名单；详见 §3.6 |

**Step 4 决策研究结论**（2026-09-18，`step-4-decision-research.md`，零代码改动）：

| Q | 议题 | 结论 |
|---|---|---|
| 1 | `types.ts`（44 导出 / 73 消费者）归属 | **不拆**，迁 `session/result/`。实测：拆分会造 **14 个双向 import**（19% 消费者需两半）——接缝不干净 |
| 2 | harness 3 文件（1,203 行） | 迁 **`evidence/harness/`**，**不进** `core/harness/`（README 明文非产品边界，其 33 个非测试文件全是 fixture；pi 亦把记分卡放在独立 evals 包） |
| 3 | `graph.ts` 的 29 边 | **本步只机械重写，不重构**。未超模块上限（15≤20），是合法组合根；风险不对称（它是 14 个模块的唯一可达路径） |
| 4 | `orchestration/` 目录存废 | **不保留该名**——不在 `agent-rules` 的 sanctioned 域列表内，且 **active 的 `control-plane-atlas.md` 引用的 13 个文件全部已删**（需顺带修正） |
| 5 | agentPlan/analysis/taskLifecycle 合并 | **合并为一个子域**（17 文件平铺，**不造抽象层**）。决定性证据：三组的**生产消费者集合完全相同**（同为 4 个文件）；内部 43 边零环 DAG |

**执行结果**（2026-09-18）：**9 批全部完成**，`src/orchestration/` 已删除。
生产 959 / CLI 可达 874 / cliOpaque 85 全程不变；全量 3172 项零失败。
逐批提交：`1ec0a429` → `a8142e66` → `e2317e18` → `47a4dd3e` → `1aaf7d4f`
→ `c2fd8824` → `76d8c081` → `b7b3f13f`。详见 `log.md` 的 step4-exec 条目。

**实际执行顺序**（与建议一致，5-6 合并）：


`patchRecovery`→`edit/recovery` → `patchResult`→`edit/result` + `patchParsing`→`edit/patch`
→ harness→`evidence/harness` → 17 文件→`planning/task` → provider-proposal→`provider/proposal`
→ edit-proposal→`edit/proposal` → context-graph→`context/graph` → misc 逐个判定
→ 修正 `control-plane-atlas` 失效引用 + 删除空 `orchestration/`。

**pi 参考的边界（重要）**：`grep -rl "ContextGraph|TaskLifecycle|AnalysisBrief"` 在 pi 的
5 个包中**零命中**——本仓这些概念是独有的，故 5 项决策**不能靠"pi 怎么做"回答**，
只用其 4 条可迁移原则（契约置于所属包根部、harness 属运行时而记分卡属 evals、
禁止通用抽象层、域目录承载上下文）。

**Step 4 重算结果**（2026-09-18，零代码改动）：

- **`orchestration/` 的真实性质不是编排执行域，而是「被广泛消费的模型/投影层」。**
  判据：入向 182 边 : 出向 18 边（**10:1**）；55 文件主分量中 12 个是无内部入边的
  sources（`*Result`/`*Projection`/`*Trace`）；`types.ts` 被 **7 个顶层域**引用。
- **与 `turn/`、`runtime/loop/` 零 import 边**——执行侧根本不在 `orchestration/`。
  该事实独立佐证 **CB-005**。
- **前缀族不构成子域边界**：内聚度最高的 `contextGraph*` / `providerAnchor*` 仅 **0.42**，
  族间边 112 > 族内边 32。语义聚类内聚度 0.47。**按前缀切分会产生大量跨目录边。**
- **三个子目录不属 orchestration**（消费者全在 edit/restore/compact 侧）：
  `patchRecovery/`（8 生产）、`patchResult/`（2）、`patchParsing/`（1）。
- 原 composition root `runMvpIntegratedFlow.ts` 已删；`module-atlas.md` 相关描述过期。
- **5 项未决问题待裁决**（`step-4-orchestration-map.md` §6.3）：
  ① `types.ts`（318 行 / 44 导出 / 7 域消费）归属；② harness 3 文件（1,203 行，
  生产可达但 README 声明该目录非产品边界）去向；③ `context/acquisition/graph.ts`
  的 29 边是否随 cluster 拆分一并重构（**它自身仅 1 个调用者，却是 27 条边的汇合点**）；
  ④ 是否保留 `orchestration/` 目录及其更名；⑤ `agentPlan`/`analysis`/`taskLifecycle`
  三组是否合并。

**Step 5 探索结论**（2026-09-18，零代码改动）：

- `SessionManager.ts` **816 行 / 51 方法 / 55 消费者**，生产实例化点**仅 1 处**。
- **关键发现：这是薄 facade，不是单体**——22/62 方法是纯委托，类内总语句仅 **397**
  （约一半行数是文档注释），且已委托给 `session/` 下 **20+ 个既有模块**。
  **职责早已抽出，"52 个函数"是聚合面。**
- 消费者内聚度：**53% 的调用方只用 5 组职责中的一组**，但组合种类达 **16 种**——
  接缝存在但分散，既无 Step 4 那种"消费者集合完全相同"的合并依据，
  也无 `types.ts` 那种"拆分必然跨界"的否决依据。
- **判据是 `advisory` 而非 `blocking`**（report.md 明文
  "open advisory obligations do not block"），但 `AGENTS.md` 将其写成硬规则。
- `agent-rules/file-placement-and-naming.md:147` **明文允许** SessionManager 保留
  真实生命周期协调、公共 API 兼容、依赖装配、事务顺序、跨会话协调——
  **该条款直接适用于本文件**，是裁决的关键依据。
- 历史 4 条 disposition（2 次 defer，理由含"splitting a 700-line facade with 26
  dependents is its own task"）——**Step 5 正是那条被推迟的任务**。
- 建议：**方案 B 起步**（先抽 `lifecycle-writes` 14 方法），逐组推进；
  不建议一次抽 5 组（方案 A），因需重构跨组共享的 `this.store` 与 callback 工厂，
  风险集中且不符合分批纪律。**3 项未决问题待裁决**（判据适用范围、是否保留公共面、
  是否更新 dispositions）。

**Step 6 范围**：Step 4 已完成，`orchestration/` 域已解散（原拟的"域更名"随之消解）。
剩余范围为 3f 遗留项——
`src/browser/` 下 161 个平铺文件仍带冗余 `browser` 前缀
（如 `browserCommandRunner.ts` 在 `src/browser/` 内）。
按 `agent-rules/file-placement-and-naming.md`「让文件夹承载域上下文，文件只命名局部角色」，
这些应改为 `commandRunner.ts` 等。**属独立决策，须单独评估**：
影响面为全仓引用边，且需与 Step 4 的 orchestration 命名一并裁定。

**Step 6 探索结论**（2026-09-18，`step-6-naming-exploration.md`，零代码改动）：

- **范围修正：170 个文件，不是 161**。plan 只算了平铺层；`receipt/` 全部 **14** 个文件
  同样是 `browserReceiptCache*`（该子域已存在却未去前缀）。`runtime/`(32) 与 `skill/`(21)
  **已合规**。
- **只去前缀不满足规则**：规则要求「加子域文件夹，而不是加长文件名」。
  实测去除前缀后 **125/170（74%）仍 >20 字符**，仅 **1/170** 成为规则推荐的角色名
  （`browserPlan.ts` → `plan.ts`）。任务①只完成一部分，任务②（外部项目名）完全未动。
- **子域切分被实测否证**：平铺层 567 条内部边中，族内 **190** : 跨族 **588** = **0.32**，
  与 Step 4 否证 `orchestration/` 前缀切分的 0.42 同档。17 个族里最高的 `Self` 仅 0.53。
  对照既有已接受子域：`context/compact` 0.76、`planning/task` 0.73、`browser/receipt` 0.67、
  `browser/runtime` 0.35、`session/continuation` 0.28。
- **6 处文件名碰撞全是异主**（`sessionManager`↔`SessionManager`、`agent`、`executor`×4、
  `plan`×3、`toolPolicy`、`sandboxPolicy`），规则明文允许跨域同名。
  其中 `src/browser/sessionManager.ts` ↔ `src/session/SessionManager.ts` **仅大小写之差**，
  技术合规但必须逐条披露。
- **plan 未记的第二类违规**：外部项目名——`playwright` **15** 处、`pw` 缩写 **3** 处
  （`pwRuntime`/`pwEvidence`/`pwStatus`，这些文件就在 `browser/` 内）。
- **判据与 Step 6 零关联**：`software-structure-v0` 只有 3 项义务（无环、specifier 可解析、
  函数名上限），**无任何命名/前缀/放置条款**。若 Step 6 是**纯规则合规**改动，
  不改善任何指标、不影响 Step 7 judge 报告。
- **影响面**：871 条 import 边（252 文件，其中 201 条来自 `src/browser/` 外的 49 个文件）；
  **170 个旧 basename 仓库内全部唯一 → 按 basename 改写无歧义**。
  已核验为零：`vi.mock`/`import()` 指向面、vitest alias、脚本/配置路径引用、`.ts` 文件名断言、
  动态入口。
- **三个候选**：A 只去前缀（任务①部分达成）；B 去前缀 + 缩写/外部名裁定（两者都达成，增量约 18 文件）；
  C 登记 defer（判据零命名义务，且 0.32 无干净切分点）。**不建议族切分。**

**Step 6 执行结果**（2026-09-18，路径 B，**已完成**）：

- **改名 173 个**：`src/browser/` 平铺去 `browser` 前缀 156 + `receipt/` 去 `browserReceiptCache` 前缀 14
  （→ `cacheStore.ts` 等）+ `pw` 缩写 3。
- **`playwright` 裁定保留（实测推翻 plan 的读法）**：`package.json:23` 声明
  `"playwright-core": "^1.60.0"` 且 `pwRuntime.ts` 用 `createRequire` 加载它——
  **它是被驱动的真实技术，不是参考项目名**；仓库既有先例 `openaiAccountAuth.ts`/`googleAccountAuth.ts`
  同属集成目标名。`AGENTS.md` 禁止的是「作为参考/来源标签的外部项目名」。15 个 `playwright*` 文件名**保持**。
- **`pw` 缩写不内联**：`pwRuntime.ts` **350 行**、`pwEvidence.ts` **251 行**，不是薄包装；
  改为与其余 15 个一致的 `playwrightRuntime/playwrightEvidence/playwrightStatus`。
  （`pwRuntime`→`runtime.ts` 会与同目录 `runtime/` 子目录并列，该歧义因此回避。）
- **机制**：`maskSource` 锚定——仅 mask 后处于 `from`/`import`/`vi.mock`/`require` 位置的
  字符串字面量参与改写；171 个旧 basename 在 `src/` 内全部唯一，故按 basename 键改写无歧义。
- **首次尝试失败并回滚**：编辑按升序应用导致偏移量漂移（`Unterminated string literal`）。
  `git reset --hard` 后重做，加入「写入前断言切片等于原 specifier」+「按位置降序应用」两条自检，
  重做后 **930 次改写、0 断言失败**。（Step 4 教训 15 的同源形态，已记入 §5。）
- **验证**：build 0 错；**SCC 1481 文件 0 环**；**边集守恒 4960 → 4960**（按改名映射归一化后
  零丢失零新增）；**diff 性质审计 937 增/937 删，全部为 import 行，零非 import 变更**；
  全量 **3171/3172**（唯一失败为既有抖动，隔离复跑通过）；
  **PTY 实机**回合跑通 + **`/browser` 输出 37 行完整能力报告**；残留 `browser*`/`pw*` 均为 **0**；
  可达性 **961/876/85** 不变。
- **残余（如实记录）**：去前缀后**仍有 125/170（74%）文件 >20 字符**（p50 32→25）。
  规则第二条（避免长复合名编码功能路径）**步后仍被违反**，且本步已实测证明唯一解法是子域切分，
  而切分被内聚度 **0.32** 否证。**这是 Step 6 范围内无法闭合的残余。**

### 3.6 Step 7 — NormProof judge 全量跑 ✅ 已完成（2026-09-18）

**运行**：`node .normproof/normproof-0.1.0.tgz 解出的 CLI judge`（`normproof judge`，
`software-structure-v0` profile，read_only / shadow 模式）。`.normproof/out/` 被 `.gitignore` 忽略，
故本次只提交 `.normproof/dispositions.md` 的追加记录。

**裁决**：

| 项 | 值 |
|---|---|
| Verdict | `partial` |
| **Open blocking obligations** | **0** |
| **Blocking proof gaps** | **0** |
| Would block / Did block | no / no |
| Proof gaps（非阻塞） | 12 |

**三项义务的最终状态**：

| 义务 | 严重度 | 状态 | 本次收敛证据 |
|---|---|---|---|
| `source_graph_is_acyclic` | advisory | **satisfied** | 独立 SCC 核验 1481 文件 **0 环**（Step 3/4/5/6 每次搬迁/改名前后均为 0） |
| `source_graph_has_no_unresolved_specifiers` | **blocking** | **satisfied** | 每次改动后 `tsc -p tsconfig.build.json` 0 错 |
| `declared_functions_within_module_ceiling` | advisory | failed（12 模块） | **59 → 38 → 18**（SessionManager），已退出名单 |

**Step 5 的成果被 judge 证实**：`SessionManager.ts` **已从越界名单消失**。
此前 13 个越界模块，现为 12 个。

**剩余 12 个越界模块**（11 生产 + 1 测试，实测计数）：

| 模块 | 判据 |
|---|---:|
| `presentation/surface/model.ts` | 51 |
| `runtime/evaluation/task/model.ts` | 52 |
| `edit/multifile/model.ts` | 39 |
| `core/query/runtime/harness.ts` | 32 |
| `presentation/tui/editor.ts` | 28 |
| `cli-baseline.test.ts` | 27（**测试文件**） |
| `core/shell/sessionTerminalState.ts` | 27 |
| `planning/runtime/engine.ts` | 27 |
| `runtime/evaluation/model.ts` | 27 |
| `runtime/evaluation/task/liveRun.ts` | 26 |
| `core/query/runtime/policy.ts` | 23 |
| `session/store/sessionStoreAccess.ts` | 22 |

**11 个生产模块合计 419 个声明名**。它们与 `SessionManager` 的关键差别：
`SessionManager` 是**薄 facade**（22/62 纯委托、类内仅 397 条语句），
而 `presentation/surface/model.ts`(51)、`runtime/evaluation/task/model.ts`(52)
是**真单体**——按 `agent-rules` 第 147 行，facade 可保留，单体不可。

**判据自身的已知缺陷（本轮再次确认）**：`declaredFunctionNames` 的第三条正则
`^[ \t]*(修饰符)*name\([^)]*\)\s*(?::[^{;]+)?\{` 的 `[^)]*` 会在参数内的右括号处提前收束，
**漏计多行签名中含 `()` 的方法**。实测 `SessionManager.ts` 判据报 38 时真实成员 **41**
（漏 `createNew`/`createNewWithId`，参数里 `process.cwd()`）。
judge 注释自述「a miss lowers a count rather than raising one」——
**故判据计数是下界，真实成员数只会更多**。上文 12 个的数字同样是下界。

**dispositions 追加（协议要求 append-only，未删任何行）**：

- **Step 5 成果 +8 名被证实达标**：`artifacts/workflow/model.ts`(2)、`context/discovery/scan.ts`(1)、
  `context/readWindowContinuation.ts`(3)、`core/commands/connectCommandRuntime.ts`(9)、
  `core/paths/legacyRootRebase.ts`(15)、`core/shell/approvalTrustPolicy.ts`(14)、
  `daemon/client.ts`(4)、`tools/toolBatchDispatch.ts`(1) —— **全部 ≤20，实测判定**。
  历史 deferral 是当时真实的，现已由后续拆分与搬迁自然达成；按协议**追加**修正行而非删除原文。
- **`SessionManager.ts` 记 `fix`**：3 批拆分（删 4 个零调用成员 → 抽 `sessionLifecycleWrites.ts`
  → 抽 `sessionReadSurface.ts`），判据 **59 → 18**。历次 deferral 的理由
  （"splitting a 700-line facade with 26 dependents is its own task"）已被本条**兑现**。
- **18 条 disposition 路径已不存在**（`orchestration/` 解散、Step 3 搬迁、Step 2.5 删除所致），
  作为历史记录保留，不改写。
- 当前 dispositions 共 **64** 行（原 55 + 本轮 9）。

**Step 6 不影响任何指标（预测已被验证）**：改名前后的越界模块数均为 **12**，
判据三项状态不变——与 `step-6-naming-exploration.md` §6 的结论一致。

**结论**：Step 3–7 全部完成。**唯一的 blocking 义务 satisfied**，
advisory 的函数名上限从 13 模块降至 12 模块（`SessionManager` 退出），
残余 11 个生产单体与 1 个测试文件均有据登记，属独立立项而非本计划尾部。

### 3.4 独立立项（记录，不在本计划处理）

**`turn` 内核与编排层不连通。** 活轨存在两套并行的 provider 路径：

| 路径 | 使用者 | 能力 |
|---|---|---|
| `turn/step.ts` | 模型驱动工具循环（实际对话） | 无重试、无终态裁决；验证仅作 `[Verification feedback]` 文本注入 |
| `runtime/loop/*` + `provider/request/*` | 编排层 / 公共 API | 有 retry 资格判定（自述 `retry-eligibility-is-not-retry-execution`） |

终态判定同理：`turn/projection.ts:concludeRun`（2 分支）与 `evidence/verdictFacade.ts`
分属两侧，不汇合。

**这是维护者此前重新编排 `turn` 时留下的既有架构状态，不是清理造成的破坏。**
记录于 `deleted-audit-2026-09-16.md` 附十。

### 3.5 Step 5 — SessionManager 拆分 ✅ 已完成（2026-09-18）

**完整探索、机制校准与逐批执行记录**：`.wiki/refactor/step-5-session-manager-recon.md`

**三批提交**：

| 批 | 内容 | 提交 | 判据 |
|---|---|---|---:|
| 1 | 删 4 个全仓零调用成员 | `268b2f83` | 59 → 55 |
| 2 | 抽 `lifecycle-writes`（14 方法 + 2 helper） | `10350ede` | 55 → 38 |
| 3 | 抽 `store-binding`+`read-projection`（20 成员） | 本批 | **38 → 18** |

**结果结构**（继承链固定为深度 2）：

```
session/SessionManager.ts              判据 18   ← 组合面 + 创建/恢复/重入
  └─ session/sessionReadSurface.ts     判据 20   ← 存储绑定 + 读取投影
       └─ session/lifecycle/sessionLifecycleWrites.ts   判据 17   ← 状态写入
```

**机制：继承而非组合。** 依据：这 20 个方法就是 SessionManager 的公共 API
（外部调用点实测 **88 生产 / 178 测试**）；改为组合成员会同时改公共面与全部调用点，
而保留委托包装**不降数**（判据计的是模块内声明名）。TS 单继承 ⇒ 抽 2 组只能是深度 2 的链。

**关键事实修正（执行前实测）**：

- **判据对本文件漏计 2 个方法**（`createNew` / `createNewWithId`，因参数里 `process.cwd()` 的
  右括号使正则 `\([^)]*\)` 提前收束）。判据报 38 时真实成员是 **41**。
  判据漏计只降不升，故"判据达标"≠"真实达标"；本文件历史计数（59/55/38）均低于真实值。
- **§11.4 的"两个独立基类、各继承一层"在 TS 下不成立**，已改为单模块承载两组。
- 代价：`sessionReadSurface.ts` 判据 **20 恰好卡上限**（真实 21）；若判据修好上述漏计，
  该模块成为新的越界项（SessionManager 本身不受影响）。

**验证**：build 0 错；**SCC 1481 文件 0 环**；全量 `tsc --noEmit` **387 = 基线 387**
（逐类 diff 仅联合类型成员排序差异，零新增）；全量测试 **3170/3172**（2 项为既有负载抖动，
隔离复跑通过）；`session/`+`core/shell/` 聚焦 **509/509**；**PTY 实机**跑通真实回合，
`/resume` 19 → 20 条且新会话在首位；可达性 **961/876/85**；41 个原成员零丢失。

---

## 4. 约束来源：删除路线被证伪（2026-09-17）

**本节是 §2 规则的来源。不是复盘文，是约束依据。**

### 4.1 被证伪的命题

v2 全篇建立在一个命题上：

> 生产源文件中"CLI + scripts 均不可达"的部分（原测 333/1366 = 24%）是可删除的死链。

该命题**只对一半**：可达性 BFS 能回答"当前入口是否连上"，**不能回答"是否有价值"**。
前三轮删除（`0e875e37` 5 + `7a59ab23` 573 + `42d63bd7` 82 = 660 文件，生产 403）
**从未做过功能价值审查**，已确认造成 12 项真实破坏。

### 4.2 12 项真实破坏

完整清单与逐项处置见 §3.1 表（**12 项全部处置完毕**）。其中四项是本判据最典型的反例：

| # | 内容 | 处置 |
|---|---|---|
| 1 | **写路径丢失 `O_NOFOLLOW` / `fstat` / `/proc/self/fd` 描述符复验**——活轨 `writeTextFile` 曾是裸 `fs.writeFile`，符号链接可逃逸出工作区 | 恢复 `edit/authority/workspace.ts`（552 行）并接入 `runtime/execution/service.ts` |
| 2 | **`/undo` / `/restore` 读取的快照目录无人写入**——恒报 `Nothing to undo` | 恢复 `orchestration/editSnapshot.ts` 并接线写前快照捕获 |
| 11 | `verify:edit-capability-closeout` 假阳性（98 项中 75 项不存在仍 `exit 0`） | 删除该 gate |
| 12 | `verify:browser-txn-gate` 14/14 目标全缺 | 删除该 gate |

其余 8 项：`#3` `provenance` 5 读 0 写、`#5` account-auth、`#6` `executionLane`、
`#7` 25 条死标签 → **登记/记录**（同源 CB-005）；`#4` `disabledTools`、
`#8` `pwStatus` 宣传、`#9` 白名单失效、`#10` 5 个 verify 脚本 → **已修复/已删除**。

破坏 #1、#2 是**契约型断链**的典型：活轨没有 import 被删模块，
而是**自己实现了一半**（写路径裸实现 / 读目录但无人写）。

### 4.3 为什么 Build 一直全绿

`tsc -p tsconfig.build.json` 零 `Cannot find module` ⇒ 不存在未解析 import。
**因此任何删除都不会造成编译错误。编译通过从来不是删除安全的证据。**

这解释了为什么三轮删除 Build 全绿却仍破坏功能。

### 4.4 import 图看不见的入口

- **字符串路径启动**：`path.join(...)` + `spawn` / `execFile`。
  实例 `session/__tests__/longSessionDurabilityProcess.ts`（Step 2.6 因此误删，已回退）。
- **脚本动态 import**：`scripts/verify/index.mjs` 用 `pathToFileURL` 引用 6 个已删模块。
- **验证脚本的目标列表**：vitest 对缺失路径不报错（§2.4 末条）。

### 4.5 已判定无需恢复

- **`apply_patch` 解析/验证/应用路线**（`patchParsing/*`、`patchVerification/*`、
  `patchApplication/*`、`patchContract/*`、`edit/patch/plan/*`）：
  删除前后 CLI 工具面均为 `read/write/edit/glob/bash`，从未注册 `apply_patch`；
  活轨明文拒绝该输入形态（3 文件 3 处 `do not pass unified diff or apply_patch syntax`）。
  **被有意废弃的路线，非误删。** 26 个文件的独立审查确认为零断链。
- **纯 re-export shim / 活轨已内联归并的模块**：可维持删除。
- **`sessionContinuationProjection.ts:57-60` 的 browser 前缀**：**非断链**——
  是压缩保序白名单，不是功能消费者。

### 4.6 10 项未接线候选：全部不恢复

三轮核实收敛过程（详见 `deleted-audit-2026-09-16.md` 附四/五/七/八）：

| 轮次 | 结论 | 修正原因 |
|---|---|---|
| 附四 | 接线 3 / 恢复 2 / backlog 5 | 按语义相似度判断 |
| 附五 | 接线 2 / 恢复 2 | 核实接线点，`verdictFacade` 5 导出中 4 个零调用者 |
| 附七 | 恢复 1 | 核实调用链，provider 链终点在 `context/acquisition`，不到 turn |
| **附八** | **恢复 0** | 重试能力挂 `runtime/loop` 而非 turn |

四类归属：

| 类别 | 数量 | 项 |
|---|---:|---|
| 活轨已有能力 | 2 | 终态真实性（`verdictFacade` 三态裁决）、批回滚（`/restore` 的 `recordSelection.recordIds`） |
| 消费链不到 turn | 3 | provider 原始解析、任务相关验证阶梯、taskLifecycle 编排 |
| 输入契约不存在 | 4 | AST 代码图谱、跨文件 repair、Swarm、LSP 自修复 |
| 需新功能 | 1 | 重试退避降级 |

---

## 5. 方法论教训

1. **可达性 ≠ 价值**。`cli:false` 只说明"当前入口没连上"。
2. **不采信"已有替代"的推理，必须核验**。
3. **消费者存活 + 生产者被删 = 断链，不是裁剪**。最危险的形态。
4. **恢复文件 ≠ 恢复能力**。判据：`analyze-boundaries.py` 的 `cli` 字段由 `false` 变 `true`。
5. **"活轨有这个函数" ≠ "该函数在需要的链路上"**。判断"是否可接线"必须从目标调用点
   反向追踪数据通路。
6. **"在可达集内" ≠ "被调用"**（`import type` 也会拉入可达集）。
7. **单元测试绿灯 ≠ 实机可用**。触及 CLI 交互面必须 PTY 验证（§2.4）。
8. **流程：先完成审查、台账成型，再集中修复**。不要边审边修——这曾导致信息碎片化。
9. **读子代理结果必须取 `yield` 的 payload**，不能只看对话文本（曾因此误报覆盖率 50%，
   实际 100%）。
10. **基线数据只写在命令跑完之后**（v1 曾预写含编造项）。
11. **估算不是测量**。Step 3 六次搬迁的边数估算**全部偏低**（最严重的 361→1,537，差 4.3 倍）。
    根因：估算只数"跨域边"，漏掉域内 escaping 边与分批后新增的边。
    **边数必须按 import 图实测**，估算只能用于排序批次。
12. **`tsc` 不报的错，必须另设检查**。①依赖环：类型解析成功，只有 judge/运行时才暴露
    → 独立跑 SCC。②测试文件的悬挂 `import type`：类型被擦除，测试照绿
    → 只有全量 `tsc`（含测试）可见（3b 曾漏掉一处，3c 才发现）。
13. **搬迁的改动面必须可证明是"仅 import"**。做法：逐文件与 HEAD 对比，
    断言所有差异行都落在 import 语句范围内。Step 3 各批均以此验证（如 3f 平铺批
    140 个变更文件、非 import 改动 0）。
14. **返工优于打补丁**。3f 平铺批首次改写误产出 `.ts` specifier（440 条 `TS5097`），
    处理方式是 `git reset --hard` 回上一提交重做，而非在错误产物上逐条修补。
15. **改写器只应匹配语法，不应匹配文本**。Step 4 批次 7 暴露：用
    `(?:from|import) ... ["']([^"']+)["']` 正则改写 import 时，会命中**字符串字面量内部**
    的 import 语法。`contextPacket.test.ts` 的 fixture 恰好构造了含
    `import { dep } from './dep.js';` 的测试文件内容，该字符串被改写，
    导致 packet 不再报告 direct-import candidate——**只有测试失败才暴露**。
    正确做法：先按 AST 或按"行首 import 语句"判定，再改写。
    另：该批次的 file list 在搬迁**之后**计算，漏掉了已不在原路径的 `.test.ts`。
    **教训：改写清单必须在搬迁前固化。**

> **共性**：以上 1、5、6、7 是同一个错误的不同表现——**用间接证据替代直接证据**
> （可达性代调用链、语义相似代数据通路、文件可达代被调用、测试绿灯代实机）。
> 本项目共出现 5 次。
> **11、12、13 是同一错误在搬迁场景的复现**：估算代实测、编译通过代结构正确、
> 目视代断言。

---

## 6. 历史记录

### 6.1 Step 1 失败分类（57 项，已全部执行）

非失败基线：tsc build 0 错；tsc 全量 539 错全在测试文件；golden gate / cargo / validate 通过；
pytest 环境不可用。

| 簇 | 项数 | v1 分类 | **v2 裁决** | 关键证据 |
|---|---|---|---|---|
| R1 rust-bridge | 8 | real-defect | **死轨断言混入活轨测试**：断言 `details.executionReceipt/reportSafe/runtimeReceipt`，其生产者全是死轨；活轨 `toolResultLifecycle` 只产 `{success,output,metadata}` | `turn/tools.ts:106` |
| R1 runtime.test | 3 | real-defect | **死轨测试**（import ToolRuntime） | `runtime.test.ts:7` |
| R1 活轨透传 | — | 修法方向 | **真缺陷但降级**：修了只影响直调 registry 的消费者 | `registry.ts:147-165` |
| R2 MCP 桩 | 16 | real-defect 产品级 | **v1 定性错误**：生产 CLI 无参调 `createCoreToolRegistry()`，**MCP 工具在生产 CLI 中根本不注册** | `cliRuntimeInvocation.ts:148` |
| R3 rollback | 5 | 需裁决 | **降级**：被测对象不在 CLI 链上，随 demo 脚本废弃自然消解 | 调用链 BFS |
| R4 seed | 9 | real-defect | **v1 定性错误**：`seed=action-result` 生产者是零 importer 孤儿；活轨从未产生过 seed 行 | `projection.ts:122` |
| R5 | 5 | known-gap/env | 维持（2 活轨漂移 + 3 环境依赖） | |
| R6 | 7 | test-infra | 维持；注：死轨 harness 驱动活 CLI 子进程 | `agentCliProcess.ts:51-68` |
| R7 | 6 | real-defect | **全部为活轨测试锁旧语义，修测试** | `store.ts:55-57` |

**真正需要修活轨生产代码的只剩 1 处**：registry metadata 透传（已修）。

### 6.2 Step 2.5-C-2 复核记录（2026-09-15）

原拟删除 `model-adapters` 失活适配器子域，执行前复核发现结论不可靠：
`client.ts` 依赖 `registry.ts`/`retryPolicy.ts`，`registry.ts` 依赖 OpenAI/Anthropic adapters。
误删候选已恢复，未产生源码变化。该子域暂不重构。

**规则**：provider/auth/execution 边界必须同时满足真实入口、脚本入口、显式依赖、
runtime 装配四重证据。

### 6.3 边界分析方法（2026-09-15）

工具 `scripts/analyze-boundaries.py`：以四重证据（CLI 入口、scripts 入口、
包公共 API 闭包、测试引用）为每个生产文件打标签，输出 `/tmp/boundary-report.json`。

测量事实（当时）：生产源文件 1361：CLI 可达 871，不可达 490
（仅测试 339 + 零引用 146 + 仅公共 API 5）。测试基建 45 个豁免。
公共 API 闭包 246 文件，由 `verify:host-surface` 实测消费。

**当时的方向修正**：删除单位从"文件/目录"改为"连通分量整簇"。

### 6.4 Step 2.5-C-3 主簇删除（2026-09-16）

用户裁决：整簇删除。范围：

| 项 | 数量 |
|---|---:|
| 主簇生产文件 | 310 |
| 主簇对应测试 | 254 |
| 断链测试基建 | 7 |
| test-utils/workspaceWriteResumeProducer.ts | 1 |
| 附带断链测试 | 2 |

**删除前校验**：CLI 可达文件误入删除集 = 0；删除后复核"CLI 可达但文件已删" = 0。

**当时验证**：`tsc build` 0 错、`build:ts` 通过、`validate` 通过、golden gate 通过；
全量 vitest 3179 项 / 30 失败（原 4450 / 51）。生产源文件 1361 → 1043。

**v3 补充（关键）**：本步判据**已被证伪**。该批含未接线的高价值能力，
并造成 12 项真实破坏（§4.2）。"零误删"结论**仅对 CLI 可达集成立**，
不等于"未破坏活轨功能"——破坏发生在契约层，`tsc` 与可达性 BFS 都看不见。

### 6.5 Step 2 基线回绿（2026-09-16）

30 项失败处置：删 CB-002（4 项 real-provider）、收窄 CB-001（10 项 seed 断言）、
修活轨 metadata 透传、收敛 `detectCommand` allowlist、改 6 项锁旧语义测试。
失败数 30 → 15 → 1（CB-003）→ **0**。

同期修复两项生产缺陷：

- **CB-004 终态真实性**：`turn/projection.ts` 新增被拒终态判定
  （审批拒绝后不再报 success）。
- **TUI 审批面板失联**：`cliProcessRunner` 的 `promptInteractiveApproval`
  求值时机错误（值 vs 闭包），面板永远挂不上。

### 6.6 Step 2.6 零引用簇删除（2026-09-16）

原定删除 92 个零引用文件中的孤立簇。实际删 82 个。

**误删 1 个已回退**：`session/__tests__/longSessionDurabilityProcess.ts`——
由测试以字符串路径 spawn 启动，import 图不可见。

`cliReachable` 871 → 873，`production` 1045 → 963，`noReference` 92 → 10。
详见 `step-2.6-plan.md`。

### 6.7 Step 2.7 详细记录

见 `deleted-audit-2026-09-16.md` 附一至附十二：

| 附录 | 内容 |
|---|---|
| 附一 | 符号级断链穷尽扫描（403 文件 1563 符号，引用型断链为零） |
| 附二 | 验证脚本断链（5 个 `MODULE_NOT_FOUND` + 1 个假阳性） |
| 附三 | 契约级断链（`provenance` 5 读 0 写、浏览器前缀、半孤儿） |
| 附四～八 | 10 项候选的三轮核实（最终：全部不恢复） |
| 附九 | 出口验证 |
| 附十 | 维护者裁决与方向重定 |
| 附十一 | 7 个迁移残留 shim 删除 |
| 附十二 | 2 个过期 gate 删除 |

### 6.8 Step 3 域搬迁（2026-09-18）

**详细执行记录**：`step-3-migration-map.md` §6.1（含逐阶段边数、批次依据、验证证据）。
**逐阶段提交**：`e53ba6b4` → `54021279` → `59fde020` → `35ca1751` → `dc38b155`
→ `d527993a` / `60b24107` / `28e6e433` / `3f4fd752`。

同期附带修复：

- **`vitest.config.ts` 缺 `testTimeout`**（`acdc0f1b`）：默认 5s，而 browser/CLI 场景测试
  单项需 8–16s（实测最慢 16.23s，74 项 >3s）→ 全量并发下 5 项间歇超时。
  量测后设为 30s，**改配置不改测试**。
- **3b 遗漏的悬挂 `import type`**：`sidebarStateProjection.test.ts` 仍指向已搬走的
  `../startup/*`。测试照绿（类型被擦除），只有全量 `tsc` 可见；3c 期间修复。

**遗留未做**：`src/browser/` 下 161 个平铺文件的冗余 `browser` 前缀未去掉
（属 Step 6 命名税，见 §3.3）。

### 6.10 Step 4 执行（2026-09-18，9 批，完成）

`src/orchestration/` 已解散，123 文件全部分流至 7 个 sanctioned 域。
逐批提交与明细见 `log.md` 的 step4-exec 条目；映射表与决策研究见
`step-4-orchestration-map.md`、`step-4-decision-research.md`。

**两处返工**（已记入 §5 教训 15）：
① 批次 5-6 用搬迁后的 file list 做改写，漏掉 2 个 `.test.ts` → 从 HEAD 重建；
② 批次 7 发现改写器**匹配字符串字面量内的 import 语法**，损坏了
`contextPacket.test.ts` 的 fixture（测试失败暴露）→ 已还原，并审计前 5 批
全部提交，确认零非 import 改动。

**附带发现**：`docs/architecture/control-plane-atlas.md` 标注 active，
但 78 个路径引用中 **35 个已删**（45% 失效），多数早于 Step 4。
已加实测 staleness 表，未擅自重写未核实引用。

### 6.9 Step 4 orchestration 聚类重算（2026-09-18）

**产出**：`step-4-orchestration-map.md`（零代码改动，纯判定）。

`orchestration/` 从删除前的 412 文件降至 123（Step 2.5-C-3 删除 289）。
重算发现其真实性质是**被广泛消费的模型/投影层**，而非编排执行域——
入向 182 : 出向 18（10:1），`types.ts` 被 7 个顶层域引用，
且与 `turn/`、`runtime/loop/` **零 import 边**（独立佐证 CB-005）。

**前缀族被否证**：内聚度最高 0.42，族间边 112 > 族内边 32 → 不能按前缀切分。

**三个子目录判定不属 orchestration**：`patchRecovery/`、`patchResult/`、`patchParsing/`。

**5 项未决问题**已登记 §3.3，待维护者裁决后执行。

---

## 7. 文档索引

### 本计划相关

| 文件 | 内容 |
|---|---|
| `step-3-migration-map.md` | **Step 3 映射表 + §6.1 逐阶段执行记录（3a-3f）** |
| `step-4-orchestration-map.md` | **Step 4 orchestration 聚类重算（含 5 项未决问题）** |
| `step-4-decision-research.md` | **Step 4 的 5 项决策研究：实测结论 + 方案建议 + pi 参考** |
| `step-5-session-manager-recon.md` | **Step 5 SessionManager 拆分探索（含 3 个方案与 3 项未决问题）** |
| `step-6-naming-exploration.md` | **Step 6 命名税探索：170 文件实测、族切分否证（0.32）、`playwright` 裁定依据、执行记录 ± 残余** |
| `deleted-audit-2026-09-16.md` | **主文档**：403 个已删文件审查总账 + 附一至附十二 |
| `restore-audit-2026-09-16.md` | 事故认定、三路审查、D 集恢复、补丁层复核 |
| `capability-backlog.md` | 未实现能力登记（CB-001 ~ CB-006） |
| `handoff-2026-09-17.md` | 任务转接包（方向、记录位置、执行要求） |
| `audit-raw/*.json` | 403 个已删文件的逐文件判定原始表 |
| `step-2.6-plan.md` | Step 2.6 方案与执行记录 |
| `baseline-after-step2.md` | 最终基线 |
| `baseline-after-main-cluster-deletion.md` | 主簇删除后的回归对照物 |
| `failures-baseline.md` / `failure-triage-2026-09-16.md` | 初始失败基线与逐项定因 |
| `recompute-2026-09-16.md` | 主簇删除后的现状重算 |
| `boundary-analysis-2026-09-15.md` | 主簇边界分析（其"已有替代"结论部分被推翻） |
| `cli-only-delete-candidates.md` | CLI-only 删除候选原始清单 |
| `reachability-2026-09-15.json` | 可达性快照 |

### 仓库规则

`AGENTS.md` 及 `agent-rules/*`（provider-and-secret-boundary、evidence-and-truthfulness、
architecture-boundaries、file-placement-and-naming、testing-and-validation、
development-workflow、compatibility-and-history、reference-repositories）。

### 工具

`scripts/analyze-boundaries.py` —— 可达性分析，输出 `/tmp/boundary-report.json`，
字段 `rows.<相对src路径> = {cli, script, publicApi, testRef}`。
