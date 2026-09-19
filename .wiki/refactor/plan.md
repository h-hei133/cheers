---
title: "Architecture Refactor Plan"
category: article
sources: [repo-audit-2026-09-15, tsc-baseline-2026-09-15, vitest-baseline-2026-09-15, failures-baseline, reachability-audit-2026-09-15, subagent-reviews-2026-09-15]
created: 2026-09-15
updated: 2026-09-19
tags: [refactor, architecture, plan]
summary: "Module boundary refactor plan v6。当前生产 960 / CLI 可达 770 / 不可达 190，全量测试 2750 项（2026-09-19 CB-005 死代码清理后；CLI 可达下滑系口径修正而非回归，见 §1）。删除授权依据为「职责已被活轨承担」（§2.1），不再使用可达性。Step 3 域搬迁（3a-3f）、Step 4 orchestration 解散（9 批）、Step 5 SessionManager 拆分（3 批，判据 38→18）、Step 6 命名税（173 文件）、Step 7 judge 全量跑（0 blocking）均已完成。§4 记录删除判据被证伪的经过与 12 项真实破坏。§8 是路线章：三轮探索汇总的 14 项待办与三阶段排期（阶段 A 零裁决：strict / exclude 收紧 / AGENTS.md）。阶段 C1（R13/R14 CB-005）已于 2026-09-19 完成：删 69 文件 / −23,631 行。"
confidence: high
---

# Architecture Refactor Plan (v6)

> `.wiki/refactor/` 是整个模块边界重构计划的唯一记录位置。
> **本文件已重组：现状与规则在前，历史在后，路线在最后。**
> 阅读顺序：**§1 现状 → §2 规则 → §8 路线（接下来做什么）**；
> §3 是已完成工作的逐轮记录，§4 起为约束来源与历史，需要追溯时再读。

**版本沿革**：v1 初版 → v2 引入生产可达性 BFS → v3 发现删除路线错误、新增 Step 2.7 →
v4 方向重定（删除依据改为"是否已有实现的一部分"）→ **v5 重组结构** →
**v5.1 同步 Step 3 完成后的现状** → **v5.2 同步 Step 4/5 完成后的现状** →
**v5.3 Step 3–7 全部完成** → **v6 重组：新增 §8 路线章（三轮探索汇总 14 项待办，三阶段排期），
§3 章节顺序修正，§3.8 的测试分层结论按 §3.10.4 同步（2026-09-18）**。

---

## 1. 当前状态（2026-09-19，阶段 C1 / CB-005 死代码清理后）

| 指标 | 值 |
|---|---:|
| 生产文件 | 960 |
| CLI 可达 | 770 |
| CLI 不可达 | 190（公共 API 105 + 仅测试 72 + 零引用 13） |
| 全量测试 | **2750 项**（494 文件 / 2749 通过 / 1 跳过 / 0 失败） |
| 稳定失败 | **0**（唯一失败为 PTY spawn 并发抖动，隔离复跑 40/40 通过） |
| `tsc -p tsconfig.build.json` | 0 错误 |
| **import 环（新增门禁）** | ✅ **runtime 0 / type-only 0**（`npm run verify:import-cycles`，1453 文件） |
| **越界模块** | **3**，均有 disposition；`npm run analyze:module-facades` |
| NormProof judge | verdict `partial`；**blocking 义务 0 项未满足** |
| `strict` | ✅ **已对生产开启**（`tsconfig.build.json` `strict: true`）；`npm run build` **0 错误**；零 `!` / 零 `as` |
| 文档/规则漂移门禁 | ✅ `verify:docs-drift:strict`（RULES 0 死引用、DOCS **0 dangling**），已接入 `verify-release-core` |

> **⚠️ 可达性口径变化（2026-09-19，重要）**
>
> 上表 **CLI 可达 876 → 770** 的下滑**不是回归**，而是**口径修正**：
> 删掉的 host lane 曾是 **125 个文件通往 CLI 的唯一路径**。
>
> 实测（在 `HEAD~1` 的 worktree 上对比）：
> - 含 host lane：912 个文件可达
> - 不含 host lane：787 个文件可达
> - **仅经 host lane 可达：125 个文件**
>
> 例：`context/acquisition/engine.ts` 在基线上的唯一路径是
> `entrypoints/cli.tsx → cli/bootstrap/cliProcessRunner.ts → cli/host/runner.ts
> → runtime/api/host/runtime.ts → presentation/surface/model.ts
> → context/acquisition/summary.ts → engine.ts`
> ——**一条生产从未执行的路径**（host provider 硬编码合成）。
>
> 即：旧口径的"CLI 可达"把**死代码的 import 边**算成了真实可达。
> 那 125 个文件在删除后**并未失效**——它们经 `index.ts`（公共 API，105 个）
> 或测试引用（72 个）仍然可达，只是不再被"CLI 可达"这一类计数。
> **结论：`cliReachable` 这个指标本身被死代码污染过，不能跨此变更直接比较。**
> 后续若要继续用它做删除判据，需先排除"仅经已删 lane 可达"的路径。

**注**：`analyze-boundaries.py` 于 `b5f80df4` 重写，分类口径已与本文 §1 历史记录不同
（新增 `publicApiOnly` / `cliOpaque`，不再输出旧的 `仅公共 API` / `零引用` 分项）。
上表按**当前脚本**输出填写。

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
| **阶段 A（strict 等 4 项）** | **✅ 全部完成**（2026-09-18）。见 §3.10；本仓生产 `strict` 已开启 |
| **阶段 B（B1-B4）** | **✅ 全部完成**（2026-09-18）。B1 `core/` 准入规则 + 删 `core/extensions/`；B2 文档全分类；B3 `renderer/` → `presentation/terminal/streaming.ts`；**B4 越界模块 12 → 3**；详见 §3.11 |
| **阶段 A/B 对抗复核** | **✅ 已完成**（2026-09-18，2 个子代理）。找出 4 个真实缺陷并全部修正；详见 §3.12 |
| **阶段 C1 / CB-005 死代码清理** | **✅ 已完成**（2026-09-19）。删 **69 文件 / −23,631 行**：`runtime/loop`、host lane、死 surface 链。`tsc` 0 错误、全量 **2749 通过 0 失败**、四门禁全过、**真实 TUI 实机验证通过**；详见 §8.4 与 `cb-005-execution.md` |

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
5. **公共面检查**——`packages/ts-shell/src/index.ts` 是 package `main`。
   （原文举例 scripts/verify-host-surface.mjs 实测消费；该门禁已于 2026-09-19
   随 CB-005 死代码清理删除，非现存文件。）
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
| 3 | 契约型 | `provenance` 5 读 0 写（二级断链） | ✅ **已清除**（2026-09-19，CB-005：读取者本身已死，随整簇删除） |
| 4 | 契约型 | `disabledTools` 设置被静默忽略 | ✅ **已修复 + PTY 实机验证** |
| 5 | 能力级 | OpenAI account-auth 可登录但必然失败 | 📋 登记 **CB-006**（维护者裁决：登记不改） |
| 6 | 契约型 | `executionLane` 指向不存在的路由 | ✅ **已清除**（2026-09-19，CB-005 整簇删除） |
| 7 | 契约型 | 25 条证据标签死条件 | ✅ **已清除**（2026-09-19，CB-005 整簇删除） |
| 8 | 契约型 | `pwStatus.ts` 宣传已删的 Eval mode | ✅ 已移除该行 |
| 9 | 契约型 | focused-test 白名单 6 条全失效 | ✅ 已彻底移除该语义 |
| 10 | 脚本 | 5 个 verify 脚本 `MODULE_NOT_FOUND` | ✅ 已删脚本 + 注册 |
| 11 | 验证型 | `verify:edit-capability-closeout` 假阳性 | ✅ 已删（只打印不校验） |
| 12 | 验证型 | `verify:browser-txn-gate` 服务对象 14/14 全缺 | ✅ 已删 |

**#4 的实机证据**（§2.4 强制）：以 `{"disabledTools":["bash"]}` 启动真实 TUI，
触发 bash 后实际输出 `Tool bash not found`；修复前该设置被忽略、bash 正常执行。

**#3 / #6 / #7 同源**：三者都是 **CB-005**在
不同数据层的表现——读取侧存活、写入侧随主簇删除。

> **2026-09-19 更新**：三者**已全部清除**。实测发现它们的"读取侧存活"是假象——
> 那些读取者所在的模块本身在活路径上不可达（`presentation/surface`、
> `session/presentation`、`evidence/projection/repair/verdict` 等），
> 已随 CB-005 整簇删除。详见 §8.2.1 与 `cb-005-execution.md`。

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
| 3b | `startup/` → `context/startup/` | `54021279` | 5 / 5（**漏改 2 处 test specifier**，§3.7） |
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

**3b 的漏改（复核发现，2026-09-18，已由 3c 自修复）**：`sidebarStateProjection.test.ts:7-8`
两个 specifier 未随 `54021279` 更新，且**两道门禁都看不见**——build config `exclude` 掉测试文件，
vitest 因 type-only import 被擦除而全绿。已知的早期示例，详见 §3.7。

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

**验证**：build 0 错；**SCC 1481 文件 0 环**；全量 `tsc --noEmit` **251 = 基线 251**
（逐类 diff 仅联合类型成员排序差异，零新增）；全量测试 **3170/3172**（2 项为既有负载抖动，
隔离复跑通过）；`session/`+`core/shell/` 聚焦 **509/509**；**PTY 实机**跑通真实回合，
`/resume` 19 → 20 条且新会话在首位；可达性 **961/876/85**；41 个原成员零丢失。

---

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

### 3.7 独立复核（2026-09-18，子代理，并发上限 2）

对**真正改过代码**的 24 个 commit 做独立复核（`docs`/`chore` 前缀不可靠——
`5ada9623` 标为 `chore` 却删了脚本与 package 注册，故按**实际改动文件类型**分类：
24 个含非 `.md` 改动，16 个纯 Markdown）。

**复核分片与结果**：

| 分片 | 覆盖 commit | 结论 |
|---|---|---|
| Step 5 三批 | `268b2f83` `10350ede` `09153136` | **2 处低危发现**（见下），其余全清 |
| Step 6 改名 | `b28ab2fd` | **clean，零发现** |
| Step 4 九批 | 7 个 batch commit | **5 clean + 2 处 P1（同一根因，已修复）**——见下 |

**Step 4 分片的发现（P1，高）——门禁静默失去覆盖**：

`e2317e18`（harness 三文件→`evidence/harness/`）与 `1aaf7d4f`（8 个 provider 测试→`provider/proposal/`）
共孤立了 `scripts/verify-anchored-provider-smoke.mjs` 里 **11 条** `focusedTests` 路径，
**而该门禁仍打印 `[pass]` 并 `exit 0`**。

**根因（比"漏改路径"更深）**：该门禁把 **23 条路径一次性**传给 vitest
（`npm run test -- ...focusedTests`）。**vitest 在多个 filter 中只要有一个匹配即 `exit 0`**，
故失效路径被静默吞掉。实测：修复前门禁只跑了 **2 个文件 / 13 个测试**，
却报告 `[pass] anchored-provider-smoke - deterministic fake corpus and safe-skip coverage passed`。
**这正是 §2.4 明文警示的"覆盖缩水但报通过"。**

**全仓门禁审计（本次实测 25 个 `verify-*.mjs`）**：

| 项 | 结果 |
|---|---|
| 有失效测试路径的门禁 | **9 个** |
| 其中**批量调用**（因此会静默） | **1 个** = `verify-anchored-provider-smoke.mjs` |
| 其余 8 个（逐个文件跑） | **能**正确报告 `[product-regression] ... exit=1`，`exit 3` |
| 失效路径总数 | 21（本计划引入 **11**；另 **10** 条源于更早的 `7a59ab23` 删除，那些测试已不存在） |

**处置**：

1. **11 条路径改指新位置**；
2. **10 条已删路径移除并在脚本内注明来源**（`7a59ab23` 删除了 dormant patch-transaction 簇）；
3. **在门禁内加入缺失路径检测**（`existsSync` → `[config-failure] ... missing-test` → `exit 3`）。
   这是对根因的修复，而非仅补路径——今后该门禁再不会把缺失路径吞成 pass。
   **负向测试已做**：注入一条不存在的路径 → `exit 3` + 正确的 `[config-failure]` 行；移除后 `exit 0`。
4. **效果**：门禁从 **2 文件 / 13 测试** 恢复为 **13 文件 / 39 测试**。

该脚本**未被 `package.json` 或任何 release 链引用**（孤立脚本），故未纳入 `verify-release-core`
的既有失败；但脚本自身现在会正确自检。
| Step 3 五批 + 配置 | 5 个 move + `acdc0f1b` | **4 clean + 1 处历史缺陷（已自修复）**，配置项 clean |

**Step 3 分片的发现（P2，已自修复，HEAD 不受影响）**：

`54021279`（3b，startup 搬迁）漏改了 `sidebarStateProjection.test.ts:7-8` 的两个 specifier
——目标已移到 `src/context/startup/`，测试仍指向 `../startup/`。
**两道门禁都看不见**：`tsconfig.build.json` 的 `exclude` 含 `**/*.test.ts`（build 报 0 错）；
vitest 因二者是 **type-only** import（类型导入被擦除）而**全部通过**。
Test-inclusive `tsc -p tsconfig.json` 从 251 → **253**，正是这两条 `TS2307`。
它由 `59fde020`（3c）顺带修复，缺口跨 `54021279` 与 `acdc0f1b` 两个提交存在。
**HEAD 实测：test-inclusive tsc = 251 错、`TS2307` = 0** → 无残留。

**复核者同时证实了本计划的一个方法学盲区**：python/grep 式的"悬空 specifier"扫描会
**匹配到测试夹具里的字符串内容**。复核者测得"19 处未解析"里，
**17 处是引号内的源码字符串**（如 `"import { dep } from './dep.js';"` 作为被写入的文件内容）、
2 处是合法的 JSON import（`with { type: "json" }`，文件均存在），**真实缺陷为 0**。
本计划在复核后**重蹈了同一错误**（自制扫描脚本报 17 处假阳性），
用判据同源的 `maskSource` 重做后为 **0 悬空 / 5096 条 specifier**。
**这与 §5 教训 15 同源，属同一盲区在验证工具中的再次出现，已记录。**

**复核发现并已修复（3 项，全部由复核者先于本计划发现）**：

1. **`tsc` 计数口径错误（中）** — plan/log/recon 三处将"**输出行数 387**"记作"**错误数 387**"。
   实测：`tsc --noEmit -p tsconfig.json` 输出 **387 行**，其中 `error TS` 为 **251** 行
   （差额是单个诊断的换行续行）。**251 才是错误数**；`plan.md` 原文本为正确的 251，
   是 Step 5 期间被本计划改坏。三处已全部修正并加口径说明。
   复核者报告"只能测到 251、无法复现 387"，**该质疑成立**。
2. **两个孤儿导出（低）** — `268b2f83` 删除 `normalizeTranscriptEvents` / `repairTranscriptEvents`
   后，其底层 `normalizeReplayTranscript` / `repairReplayTranscript`
   **失去了唯一的调用者**（实为两个薄包装，各自 `return f(...)`）。
   且 `268b2f83` 的提交信息声称这三个实现"已被真实消费者直接 import"——
   **对其中两个为假**（`grep` 全仓零调用点）。**已删除**这两个包装并重跑 `src/session/` **316/316**。
3. **日志组件名被静默改变（低）** — `09153136` 将 `sessionReadSurface.ts` 的 logger
   从 `"SessionManager"` 改为 `"SessionReadSurface"`，与同批 `10350ede` 刻意保留原名**不一致**，
   且与提交信息"Nothing else changes"矛盾。该字符串是用户可见的（`/log tail` 的
   `[component]` 徽标）。**已恢复为 `"SessionManager"`。**

**复核者独立确认的关键事实**（不依赖本计划的工具）：

- `09153136`：41 个方法 **20 留 + 21 移 = 41，零丢失**；20 个迁移方法体在允许的三类改写之外
  **逐字节等价**；继承链无环、`super()` 先于任何 `this`；编译前后**分离构建**的公共面冒烟
  （38 条断言）输出一致。
- `b28ab2fd`：173 个改名**逐一核对**为纯改名；**937 个字符串字面量改动全部可解释**，
  且**逐字面量核对"非 specifier 位置的字符串零改动"**——直接覆盖了本仓 Step 4 曾经的
  "字符串内假冒 import"失败模式；937 个 specifier **全部解析到正确目标**，零错目标零残留。
- 计数差异属**定义口径**而非缺陷：复核者边数 4959 vs 本计划 4960、可达性 875/86 vs 876/85——
  复核者以其自身方法测得的**改动前后差值均为 0**，即守恒结论成立。

### 3.8 架构位置再探索（2026-09-18，零代码改动）

**完整记录**：`.wiki/refactor/architecture-exploration-2026-09-18.md`

Step 3–7 完成后重新审视"还有哪些位置不正确、哪些需要重构、test 是否该与 src 分层"。
**所有数字由 `maskSource` 语法锚定的 import 图实测。**

| # | 发现 | 严重度 | 处置 |
|---|---|---|---|
| 1 | `tsconfig.build.json` 的 `exclude` 仅 `**/*.test.ts`，**7 个非 `.test` 的测试支撑文件被打进 `dist/`** | 中（死重，非运行时风险） | **待批准**（见下） |
| 2 | `agent-rules/architecture-boundaries.md` 的 Common Areas **仍指向 `orchestration/patchResult/`、`orchestration/patchApplication/`**，两条路径 Step 4 已消失 | 中（规则指向不存在目录） | **待批准** |
| 3 | `src/renderer/` 不在 sanctioned 域列表；`StreamingRenderer.ts` **41 外部消费者 / 0 出边**（原文记 34，已勘误）；规则示例路径 `presentation/terminal/renderer.ts` 已存在但职责不同（**该判断成立**：前者有副作用 stdout 通道，后者纯格式化器） | 中 | 独立决策 |
| 4 | `src/test-utils/` 含 **`utils`**（规则明文禁止）；`session/__tests__/` 是全仓**唯一**孤例 | 中 | 与 #1 一并 |
| 5 | `presentation/theme/` 与 `presentation/themes/` **仅差一个 `s`**，必须一起读 | 低 | 独立命名决策 |
| 6 | `eval/` 语义已被 `evidence/harness/` 取代 | 低 | 独立决策 |

**关于 test 是否与 src 分层——原结论"不分离"已被修正（2026-09-18，详见 §3.10.4）**：

1. ~~**硬障碍**：动态入口须先改造才能搬迁~~ → **已撤回**。
   `pi` 的 `test/` **同时容纳夹具与共享基建**，故
   `session/longSessionDurability.test.ts` 那条 `path.join` 只需在**同一次搬迁里**改一处，
   **不存在先后依赖**。
2. **"分离"与 §2.2 的泄漏是正交的两件事**（此条仍成立且是决策关键）：泄漏根因是
   `exclude` **只有一条模式**，与目录布局无关。
3. **规则明文支持并排**且给出并排示例；当前形态**合规**。**分离是风格变更，非缺陷修复**——
   **属维护者决策**。若做，应采用 `pi` 的**按主题组织**（免维护镜像路径）
   而非"镜像 `src/` 路径"。

**结构性基线（本轮实测）**：`src/` 1481 文件（生产 961 + 测试 520）；5094 条已解析边；
**`prod → test = 0`**（测试是纯叶子）；`test → prod = 1799`；58% 测试依赖同域生产模块。

**`core/` 的处理**：22 子目录 / 1515 文件，216 条外部入边——是事实上的横切基础层。
规则未定义 `core/` 的准入标准，**需维护者先裁定其语义**，本轮不提出拆分方案。

**未改动的两项及原因**：`tsconfig.build.json`（build behavior）与 `agent-rules/*`
属 `AGENTS.md` 明列"require explicit task scope"的范围；本轮**只报告，不擅自修改**。

### 3.9 文档与规则漂移探索（2026-09-18）

**完整记录**：`.wiki/refactor/drift-exploration-2026-09-18.md`

#### 3.9.1 推翻一个前提：测试**并未**阻碍删除 `docs/`

用户提出的约束是"test 涉及这些文档，导致删除受阻"。**实测不成立。**

**全部 12 个提及 `docs` 的测试文件逐一核对**：全部是①**提示文本里的目标文件名**
（`"docs/uncertain-edit.md"`）、②**断言命令生成的文本**、③**临时目录里自建的 `docs/` 结构**
（`mkdtemp` 出来的 workspace）。决定性证据：

```
grep -rn "join(__dirname|join(process.cwd()|repoRoot" src --include=*.test.ts | grep -i docs
→ 空
```

**零测试从磁盘读取仓库 `docs/` 树。** 非测试消费者同样：`scripts/real-provider-readonly-fixture.mjs`
的 `'docs/flow.md'` 是**在 fixtureDir 里写入**该文件。
**结论：删除 `docs/` 无需改动任何测试**；唯一真实成本是**知识丢失**。

#### 3.9.2 `docs/` 过期程度（实测）

| 指标 | 值 |
|---|---:|
| `docs/` 总文件 / `.md` | 810 / **770** |
| **含死 `src/` 引用的文档** | **325 / 770（42%）** |
| **死引用总数** | **2417** |
| 最后修改在 2026-05~06 | **约 700 / 770（91%）** |

`orchestration/` 占死引用绝大多数（Step 4 已解散该域）。
**42% 是可机械检测的下界**——未被引用的架构描述与结论同样可能失真，那些**无法机械检测**。

**`docs/DOC_STATUS.md` 实测**：存在（25.5 KB / 126 表项），**具体路径引用 111/111 全部有效**，
但**只覆盖 101/770（13%）**，且自述不完整。**它把 61 份标为 `active`，
其中 `docs/architecture/*.md` 实测有 155 处死引用——"active"标注与事实不符。**

**不能整树删**：树内混有四类——route 时代历史（约 700，含 2417 死引用）、
当前架构（22 份有更新）、设计规格、以及 **Step 2.7 要求保留的审计底账**
（`deleted-audit-*`、`restore-audit-*`）；**后两类不可删且无分界标记**。

#### 3.9.3 `AGENTS.md` 漂移（实测）

- **链接全部有效**：11/11（9 个 `agent-rules/*.md` + `.wiki/_index.md` + `.normproof/dispositions.md`）。
- **正文 3 处与实际不符**（其中 1 处经复核**降级为"含糊"而非断链**：
  `packages/ts-shell/src/` 确实存在，只是把整个 `src/` 当作执行面等于没说）。
- **15 个顶层域不在其引用的 Owner Domains 名单内**：
  `artifacts browser cli config core daemon entrypoints eval memory model-adapters
  observability renderer sandbox test-utils workflow`
  ——含体量最大的 `browser`(1787)、`core`(1515)、`session`(977)。
  （**勘误**：这三个数字**均无来源**——实测文件数为 `browser` 228 / `core` 326 / `session` 155。
  详见 `phase-b-exploration-2026-09-18.md` 的 B1 节。）
  **规则说"用既有 owner domain"，但既有域一半不在名单里，据此无法判断归属。**

#### 3.9.4 根因与治根因

**根因：本仓验证全部针对代码（tsc / vitest / SCC / judge），零针对"文档与规则是否仍与代码一致"。**
无检测 ⇒ 每次重构必然扩大漂移且**不可见**。

**已执行**：新建 **`scripts/verify-docs-and-rules-drift.mjs`**——两个作用域：

| 作用域 | 文件 | 首跑结果 | 门禁行为 |
|---|---|---|---|
| **RULES** | `AGENTS.md` + `agent-rules/**` + `.wiki/_index.md`（11） | 16 引用 / **0 死引用** | **exit 1**（修完下述两行后为 0） |
| **DOCS** | `DOC_STATUS.md` + `docs/architecture/**` + `docs/project-map/**`（44） | 508 引用 / **155 死引用** | **`[advisory]` 报告不失败**；`--strict` 才失败 |

**已修**：`agent-rules/architecture-boundaries.md` 的两条 `orchestration/*` 死目录引用
+ "legacy orchestration paths" 措辞。**该文件此前指向 Step 4 已删除的目录，
而 `AGENTS.md` 要求代理启动时遵守它。**

**双向验证**：规则层 exit 0；注入死路径 → exit 1；DOCS 计数始终打印（不可隐藏）。

**设计理由**：规则**必须准确**（约束每个新起代理，死路径会误导工作）；
当前态文档**已既存 155 处**，一上线就失败的门禁**会被关掉**，故先让其**可见**并给出计数。

**两处检测器自身缺陷（已修，恰是本门禁要防的那类错误）**：
① 只认文件不认**目录**（漏掉 `orchestration/patchResult/`，首版在规则层误报"0 问题"）；
② 不跳过**通配符**（把 `docs/design/*.md` 当字面路径，11 处假阳性）。

#### 3.9.5 第一步执行结果（2026-09-18，已完成）

**先做 3.9 的理由（判定依据）**：3.8 有 **6 项待裁决的设计决策**（`renderer/` 去向、
`test-utils/` 归属、`eval/` 归并、`theme(s)/` 合并、`exclude` 收紧、`core/` 语义），
而 3.9 的止损动作**不依赖任何裁决**；且两者耦合度极低——3.8 的候选路径在 RULES 作用域内
**0 引用**，在 docs 侧仅 7 个文件。

**执行中发现：我上轮的门禁口径错了两次，而修正口径本身就是全部工作。**

| 轮次 | 口径 | 结果 |
|---|---|---|
| 上轮 | 按**目录**（`docs/architecture` + `docs/project-map`） | 44 文件 / 155 死引用 |
| 本轮第一次修正 | 按 `DOC_STATUS` 的 **active** 标注 | 61 文件 / **224** 死引用 |
| 本轮第二次修正 | 同上 + **按文档自述重分类** | **26 文件 / 0 死引用** |

`docs/architecture/` 的 32 份里**只有 3 份是 active**（2 historical、1 superseded、
**27 未登记**）——**目录是错的单位**。

**关键证据（文档自述，非我的推断）**：61 份 active 里 **39 份**的正文自己写着
`Status: PL003 roadmap. Date: 2026-05-29`、`PS001 audit and planning`、
`This audit closes Phase 2 Goal 3` —— 它们是**带日期的审计/路线图/结项记录**，
而 `DOC_STATUS` 自己的定义里 `historical` 就是 "route closeout, migration, **audit**,
or decision history"。**它们是标注错误，不是内容过期。**

**已执行**：
1. **按自述重分类 39 条**（`active` → `historical`）；`control-plane-atlas.md` → **`superseded`**
   （`DOC_STATUS` 早已把 `module-atlas` 标为被它取代，而它是两者中较弱的那个）。
2. **补登缺失的真源**：`DOC_STATUS` 此前**只列 `.wiki/_index.md`，完全没有 `.wiki/refactor/plan.md`**
   ——而那才是重构与当前结构状态的真源。已登记 `plan.md`、
  两份本轮探索文档、以及漂移门禁本身。
3. **门禁两处修正（均由负向测试暴露）**：
   - `active` 条目指向不存在的文件**现在失败**（此前只打印不阻断）——
     一个自称"当前真源"却指向空处的条目，正是本门禁要抓的漂移；
   - 跳过占位符模式（`<path>`），此前被我自己的描述性正文误报。
4. **接入 `verify-release-core`（带 `--strict`）** + 注册 `verify:docs-drift` /
   `verify:docs-drift:strict`——搬迁文件的人**必须同步更新指向它的文字**。

**效果**：RULES 2 → **0**；DOCS 224 → **0**（`--strict` 通过）。
**双向验证**：干净态 exit 0；`active` 条目指向缺失文件 → exit 1 并指名该条目。

**未改动**：`docs/` 其余约 700 份历史文档**保持原样**——它们按定义就是历史，
"过期"是正确状态。**未删除任何文档。**

#### 3.9.6 待裁决

| 项 | 性质 |
|---|---|
| `docs/` 分类归档（route 时代约 700 份 → `archive/` + `historical` 横幅） | 需裁决；**不可整树删** |
| 把 DOCS 作用域以 `--strict` 纳入门禁 | 需先把 155 降至 0 |
| `AGENTS.md`：execution 措辞 + 补 15 个实际在用的顶层域 | 需裁决 |
| 收紧 `tsconfig.build.json` 的 `exclude`（同 §3.8 发现 1） | 需裁决 |

### 3.10 `pi` 参考仓可行性分析 + `strict` 评估（2026-09-18）

**完整记录**：`reference-pi-feasibility-2026-09-18.md`、`strict-mode-assessment-2026-09-18.md`

#### 3.10.1 提议与结论

提议："`pi` 架构明显更干净，为什么不直接学它、把我们的重构成那种形式？"

**结论：不推荐照搬。** 但发现 **3 项局部实践可吸收**，其中 `strict` 是本轮**最高价值发现**。

**方法学更正（重要）**：第一轮用**本仓自定规则**（0 环、≤20 名上限）评判 `pi`，
被判为**循环论证**——那两条是 NormProof 的规定，非业内共识，且 NormProof 是**进行中**项目。
**重做后的分析只使用不依赖我们规则的角度。**

#### 3.10.2 三个不依赖我们规则的角度

| 角度 | 我们 | `pi` | 判读 |
|---|---|---|---|
| **① 包的性质** | 4 包（1 真包） | **11 包，10 个 `private:false` 全部发布 npm**，统一 0.85.1 | `pi` 的包布局由**发布约束**决定（`pi-tui` 要被外部消费就不能依赖 `coding-agent`）。我们无外部消费者，搬过来只有发布开销 |
| **② `strict`** | ❌ **未设置** | ✅ `"strict": true` | **唯一 `pi` 明确更好且与规则无关的项** |
| **③ 变更局部性** | p50=4 文件/commit、fan-in p50=10 | p50=4、fan-in p50=6 | **同量级**，差距不足以支撑重写 |

**`pi` 的结构本身更松（已核实非 barrel 假阳性）**：环 **10**（最大 **32 文件**）、
超上限模块 **75**、最大模块 **204 函数 / 6,649 行**；`core/` **无任何定义文档**，
而其 10 个环中 **3 个横跨 `core/`**。

**规模对照**：代码量相当（177k vs 163k 行），但 commit 数 **1,599 vs 6,421**，
`docs/` **1,134 vs 113** —— 它是 13 个月高频小步，我们是 5 个月 route 式大步。
**我们的 770 份 docs 与 30 个顶层目录是开发方式的产物，不是架构缺陷；
照搬布局不会改变开发方式。**

#### 3.10.3 三项可吸收的局部实践

| 项 | 价值 | 依赖我们的规则？ |
|---|---|---|
| **`tsconfig` 开 `strict`** | ⭐ 最高 | **否** |
| `test/` 与 `src/` 分层，`test/` 自带 `fixtures/` 与共享基建 | 中 | 否 |
| `check:*` 门禁的检查项（`check:ts-imports`/`check:entry-graphs`/`check:runtime-deps`） | 中——与既有 25 个 `verify-*.mjs` 同构 | 否 |

#### 3.10.4 已据此修正的既有结论

`architecture-exploration-2026-09-18.md` §4 的"**不应分离测试**"：
**第一条理由（动态路径构成硬障碍、须先改造再搬迁）已撤回**。
`pi` 的 `test/` 同时容纳夹具与共享基建，故 `longSessionDurabilityProcess.ts`
只是**随测试一起搬**，那条 `path.join` 在同一次搬迁里改一处即可。
**组织形态亦修正**：应用 `pi` 的**按主题组织**（免维护镜像路径），而非"镜像 `src/`"。

#### 3.10.5 `strict` 评估（本轮最高价值项）

**现状**：tsconfig 链**完全未设 `strict`** → `strictNullChecks`、`noImplicitAny` 等全部默认关闭。

| 配置 | 错误数 | 生产代码 | 测试 |
|---|---:|---:|---:|
| 现状 | 251 | **0** | 251 |
| `--strict` | 401 | **136** | 265 |

**136 个生产错误高度集中**：

| 文件 | 错误数 |
|---|---:|
| **`runtime/events/projection.ts`** | **73（54%）** |
| `verification/result/boundary.ts` | 10 |
| `provider/request/boundary.ts` | 8 |
| `core/tools/toolResultLifecycle.ts` | 8 |
| 其余 ~17 文件 | 各 1–6 |

**且 `projection.ts` 的 73 个是重复模式**：TS18048 的标识符只有
`cycle.cycleBoundary`(22) 与 `cycle.responseReentry`(13) 两个为主——
可选字段在循环内无守卫访问。**循环体开头加一次窄化即可消除约 35 个**。

**分批**：S1（`projection.ts`，73）→ S2（三个 boundary/lifecycle 文件，26）→
S3（其余 ~13 文件，37）→ S4（265 个测试，独立）→ S5（写入配置）。
**关键可分批点：`tsconfig.build.json` 已 `exclude` 测试文件，可先只对生产代码开 `strict`，
不必等 S4。**

**纪律**：每批错误数须严格下降且不新增错误码；**禁止用 `!` / `as` 消错**，
只做窄化（守卫、解构 + `continue`、可选链）；窄化导致跳过的分支须在提交信息里解释为何正确。

**未验证项（如实标注）**：`pi` 的 `node_modules` 不存在，
`npx tsc -p tsconfig.json` 报 `TS2688: Cannot find type definition file for 'node'`，
故 **"`pi` 在 strict 下干净"是推断，未经验证**。

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
| `architecture-exploration-2026-09-18.md` | **Step 3–7 后的架构位置再探索：5 项发现、test 分层结论（不分离）、`core/` 待裁定** |
| `drift-exploration-2026-09-18.md` | **docs/ 与 AGENTS.md 漂移探索：测试不阻碍删除（实测）、770 份中 91% 陈旧、漂移检测门禁** |
| `reference-pi-feasibility-2026-09-18.md` | **`pi` 参考仓可行性分析：不可照搬的四个理由 + 三项可吸收实践** |
| `strict-mode-assessment-2026-09-18.md` | **`strict` 开启评估：136 个生产错误的分批路径（单文件占 54%）** |

> **路线章见 §8。** 本章其余小节为已完成工作的逐轮记录。
| `deleted-audit-2026-09-16.md` | **主文档**：403 个已删文件审查总账 + 附一至附十二 |
| `restore-audit-2026-09-16.md` | 事故认定、三路审查、D 集恢复、补丁层复核 |
| `capability-backlog.md` | 未实现能力登记（CB-001 ~ CB-006） |
| `preexisting-defects.md` | **既有缺陷登记（PD-001 ~ PD-003）**：活轨真实存在但非本轮重构引入的缺陷 |
| `cb-005-initiation.md` | **CB-005 立项探索（阶段 C1）**：`runtime/loop` 生产零值导入、provider 硬编码合成；CB-005 是裁决问题而非施工问题 |
| `cb-005-o1-vs-o3.md` | **O1/O3 代价对照（实测）**：删旧路径 vs 只补缺口；含三个待裁决的公共面问题 |
| `cb-005-recommendation.md` | **CB-005 建议 + 三处自我更正**：成因是"产出无人接管"而非"两路径不连通"；建议先接回 `codingResult` 产生，O1 后置 |
| `turn-vs-pi-divergence.md` | **turn 实现与参考项目 pi 的差异对照**：3 处结构性差异；`codingResult` 早于 pi 对齐 5 个月且职能已有活轨替身 |
| `cb-005-execution.md` | **CB-005 执行记录（已完成）**：删 69 文件 / −23,631 行；验证矩阵与 TUI 实机结果；含 `cliReachable` 口径被死代码污染的说明 |
| `c2-inventory.md` | **C2 启动前盘点**：R10 前提被证伪（应关闭）；R9/R11 可执行；发现 2 个真孤儿簇 |
| `c2-execution.md` | **C2 执行记录**：三项已执行（删 host 遗留 / R9 归并 / 关闭 R10）；R11 与 evaluation 孤儿的深入分析与建议 |
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


## 8. 重新规划的路线（2026-09-18）

> §3 是**已完成工作的记录**；本章是**接下来做什么**。
> 3.8 / 3.9 / 3.10 三轮探索共产生 **14 项未决事项**，本章按"是否依赖裁决"与"风险"排序。

### 8.1 未决事项总表（三轮探索的汇总）

三轮探索（§3.8 架构位置、§3.9 文档漂移、§3.10 pi/strict）的全部待办，合并去重后：

| # | 事项 | 来源 | 依赖裁决？ | 风险 | 收益 |
|---|---|---|---|---|---|
| **R1** | **开启 `strict`**（S1→S3 生产代码，S4 测试独立） | §3.10.5 | **否** | 低（分批、禁令明确） | ⭐ **最高** |
| **R2** | 收紧 `tsconfig.build.json` 的 `exclude`（+ 处置 `test-utils/`） | §3.8-1 | **是**（build 行为） | **零** | 高 |
| **R3** | `AGENTS.md`：execution 措辞 + 补 15 个实际在用的顶层域 | §3.9.3 | **是**（措辞） | **零** | 中 |
| **R4** | 修 12 处越界模块（11 生产 + 1 测试，419 个声明名） | §3.6 | 否 | 中 | 中 |
| **R5** | `renderer/` → `presentation/terminal/output.ts` | §3.8-3 | **是**（去向 A/B/C） | 中（**41** 边，已勘误） | 中 |
| **R6** | `core/` 准入写入规则 + `core/extensions/` 走删除检查 | §3.8 | **是**（是否接受"不搬迁"） | 低 | 中 |
| **R7** | `docs/` 分类归档（route 时代约 700 份） | §3.9.6 | **是**（分界） | 低（零测试依赖，已实测） | 中 |
| **R8** | 测试是否分离到 `test/`（`pi` 形态） | §3.8/§3.10.4 | **是**（风格决策） | 中（~1799 边） | 低—中 |
| **R9** | `session/__tests__/` 归并（全仓唯一孤例） | §3.8-4 | 随 R8 | 低 | 低 |
| **R10** | ~~`presentation/theme/` 与 `themes/` 合并~~ | §3.8-5 | — | — | **❌ 已关闭（2026-09-19）**：前提被证伪，二者是数据/引擎分层，见 `c2-inventory.md` §1 |
| **R11** | `eval/` 归并（语义已被 `evidence/harness/` 取代） | §3.8-6 | **是** | 低 | 低 |
| **R12** | `check:*` 借鉴 `pi` 的检查项 | §3.10.3 | 否 | 低 | 低 |
| **R13** | ~~`turn` 内核与编排层不连通（**CB-005**，架构级）~~ | §3.4 | — | — | **✅ 已完成（2026-09-19）**，见 §8.2.1 |
| **R14** | ~~`provenance` 5 读 0 写等 CB-005 的数据层表现~~ | §3.1 | — | — | **✅ 随 R13 一并清除**（其读取者本身已死，随整簇删除） |

**14 项里，7 项不依赖任何裁决**（R1、R4、R12 全部，R2/R3 只需"授权 build/规则范围"这一个答复，
R6/R7 只需一个方向答复）。

**进度**：R1/R2/R3/R5/R6/R7 已随阶段 A/B 完成；**R13/R14 已于 2026-09-19 完成**（§8.2.1）；
余 R4（部分完成，12 → 3）、R8–R12 未启动。

### 8.2 建议的路线（三阶段）

**阶段 A — 零裁决、零风险（可立即开始）—— ✅ 全部完成（A1–A5）**

| 序 | 事项 | 理由 |
|---|---|---|
| A1 | **R1 `strict` S1** —— `runtime/events/projection.ts` | ✅ **已完成**（`ffcf63bf` + 复核修正）：73 错全部清零，生产 strict 错误 **136 → 63**；零 `!` 或 `as`。**复核发现原提交归因错误**：根因是 16 个 `*Like` 镜像接口比真实生产者类型更窄，不是"循环体缺守卫"。已回退防御式改动，改为对齐 15 个镜像到真实类型并删除死接口（保留 1 个真实断环镜像）。**A2/A3 适用同一教训：先对齐类型，再考虑防御** |
| A2 | R1 S2 —— 三个 boundary/lifecycle 文件（26 错） | ✅ **已完成**：26 个生产错全部清零（生产 strict **63 → 37**）。**三个文件形态各不相同**，逐个定因而非套用 A1 模板：① `provider/request/boundary.ts`：3 个镜像无环风险 → 对齐真实类型并删除（8 错）；② `verification/result/boundary.ts`：`RepairApplyObservationLike` **是真断环**（`repair/handoff/boundary.ts` 可达它），不能导入真实类型 → 只修正 13 个字段的可选性使其忠于生产者（10 错）；③ `core/tools/toolResultLifecycle.ts`：`LifecycleEventLike` 的**兜底成员**（`type: string` + 全字段可选）破坏 `switch` 收窄 → 对齐真实生产者 `QueryEvent` 并删除兜底成员（8 错） |
| A3 | R1 S3 —— 其余 ~13 文件（37 错） | ✅ **已完成**：37 处生产 strict 错误全部清零（散在 **24 个文件**，最大单文件 6 处——与 S1/S2 的"单文件集中"形态完全不同，故逐文件定因）。`tsconfig.build.json` 已加 `"strict": true`，`npm run build` **0 错误**。详见 log 的 `strict-s3` 条目 |
| A4 | **R2 + R3** | ✅ **R2 已完成**：`tsconfig.build.json` 的 `exclude` 增加 `src/test-utils/**` 与 `src/**/__tests__/**`，`dist` **961 → 954**，差集**恰为那 7 个测试支撑文件**（逐一验证非测试 importer 为零）；`longSessionDurabilityProcess.ts` 由 `tsx` 从 `src/` 启动故排除安全。✅ **R3 已完成**：`file-placement-and-naming.md` 的 Owner Domains 补全为 **26/26 顶层域**（实测 15 个原不在名单）；`AGENTS.md` execution 措辞点名真实所有者并补 `packages/rust-core/` 事实。**均经 `verify:docs-drift:strict` 验证** |
| A5 | R12 | ✅ **已完成，结论与预设不同**：`check:ts-imports` **反向**（它禁止 `.js` 后缀，而本仓规则**要求** `.js`，实测 4918 处）→ 不可借鉴；`check:entry-graphs` **不适用**（它按已发布包的 `exports` map 设预算，而本仓无 `exports`，根因即 3.10.2 ①）；`check:runtime-deps` **适用且当场查出真实缺陷**——`typescript` 被**生产代码**（`postMutationLspGuard.ts`，CLI 静态可达）导入却只在 `devDependencies`，`--omit=dev` 安装会使 CLI 启动失败 → 已移入 `dependencies`，`package-lock.json` 仅一行移动 |

**为什么 `strict` 排在最前**：它是三轮探索中**唯一不依赖我们任何自定规则、且被外部项目实践支持**的项；
错误高度集中（单文件 54%）；`build` 与 `test` 配置可分离（**不必等 265 个测试错误**）。

**阶段 B — ✅ 全部完成（2026-09-18，经维持人裁决执行）**

| 序 | 事项 | 执行结果 | 提交 |
|---|---|---|---|
| **B1** | `core/` 准入 + 删 `core/extensions/` | 写入三款准入规则（方向/受众/生存）；删 `core/extensions/`（2 文件，通过全部 6 项删除检查，**零消费者**） | `b463d87d` |
| **B2** | `docs/` 分类归档 | **0/775 文档未分类**（原 677 篇无状态行）；新建 5 个着陆页；`product_architecture_reset_routes` 挂 `historical` banner。零文件搬迁 | `2b262fe7` |
| **B3** | `renderer/` 归位 | `src/renderer/StreamingRenderer.ts` → `src/presentation/terminal/streaming.ts`；42 处引用重写；顺带修复 A2 引入的真实环 | `d9459cac` |
| **B4** | 12 处越界模块拆分 | 落地判据（`analyze:module-facades`）；拆分 9 个模块；**越界模块 12 → 3**（余 3 个均有 disposition）；去重 `edit/sanitize.ts` | `78cfade9` ~ `78a864d6` |

**B4 已完成（2026-09-18）。** 越界模块 **12 → 3**，且剩余 3 个均已登记 disposition。

#### B4.1 可计算判据（已落地并成为绑定规则）

`npm run analyze:module-facades`（`scripts/analyze-module-facades.mjs`）＋
`agent-rules/file-placement-and-naming.md` 的 "Facade Or Monolith" 一节。判据三款：

```text
thinFacade(module) :=
      delegationRatio >= 0.90          声明以聚合为主，非自有逻辑
   && branchingFunctionCount === 0     自身无分支
   && ownStateWriteCount === 0         构造函数外无 this.<field> = 赋值
```

**原计划的第四款 `linesPerDeclaredName <= 15` 已实测删除**：它在**全量程上无区分力**
（越界模块无一例外超过 15），却**误杀真 facade**——委托率 1.00、零分支的模块在
body 为字面量表时可达 **80 行/名**。**长度不是复杂度**，无法区分二者的条款不构成判据。
删除依据已写入脚本注释与规则文本。

#### B4.2 实测结果

| 模块 | before | after | 处置 |
|---|---|---|---|
| `runtime/evaluation/task/model.ts` | 52 名 / 2298 行 | 8 名 / 510 行 | 拆为 `cases/`（facade 0.96）＋ `liveReadiness.ts` ＋ `liveProjection.ts` |
| `presentation/surface/model.ts` | 51 / 2255 | 2 / 229 | 拆为 `types.ts` ＋ `shared.ts` ＋ `events.ts` ＋ `runtimeEvents.ts` ＋ `sections.ts` |
| `edit/multifile/model.ts` | 39 / 1711 | 10 / 424 | 拆为 `observation.ts` ＋ `settlement.ts`；**先**去重 6 个跨模块重复 helper 至 `edit/sanitize.ts` |
| `core/query/runtime/harness.ts` | 32 / 1415 | 8 / 305 | 拆为 `harnessClaims.ts` ＋ `harnessPendingState.ts` ＋ `harnessSupport.ts` |
| `planning/runtime/engine.ts` | 27 / 965 | 1 / 199 | 拆为 `types.ts` ＋ `facts.ts` ＋ `support.ts` |
| `core/shell/sessionTerminalState.ts` | 27 / 1090 | 9 / 557 | 拆出 `sessionTerminalEvidence.ts` |
| `runtime/evaluation/task/liveRun.ts` | 26 / 1736 | 14 / 1386 | 拆出 `observation.ts`＋3 个 receipt 类型 |
| `runtime/evaluation/model.ts` | 27 / 642 | 7 / 243 | 拆出 `cases/index.ts`（facade 0.95） |
| `core/query/runtime/policy.ts` | 23 / 535 | 5 / 255 | 拆出 `facts.ts` |
| **`presentation/tui/editor.ts`** | 28 / 464 | 28 / 464 | **defer**：单个 `Editor` 类、165 处 `this.` 共享可变状态；**2026-09-03 已有裁决**"kill 状态属于持有 caret 的 editor" |
| **`session/store/sessionStoreAccess.ts`** | 22 / 193 | 22 / 193 | **defer**：委托率 **0.91**、唯一分支是 `sessionExists` 的空 id 校验（属真实行为） |
| **`cli-baseline.test.ts`** | 27 / 3907 | 27 / 3907 | **defer**：测试套件非产品代码；judge 命中它是因为 evidence-manifest 的 glob 未排除测试 |

#### B4.3 方法论教训（写入 log）

1. **拆分的判据是"两半都必须过线"，不是"抽出多大一块"**。`task/model.ts` 首次只抽
   目录数据，结果越界模块 **12→13**（抽出的 `cases/` 自身 27 名）——问题只是搬了家。
   后续每次都验证**所有**产出模块的判据值。
2. **判据条款必须证明有区分力**。`linesPerName` 是这次唯一的判据错误：它删除了一个
   真实信号（facade 长度）与一个噪声（数据表长度）无法区分的条款。
3. **提取脚本的 end-of-span 判定必须先确认 `{` 已开启**。`multifile` 第二次尝试
   静默删掉了两处多行签名的首行，把下一个函数的函数头一起吞掉——语法错误而非判据错误。
   修正后重跑，未打补丁。
4. **"两半相互独立"要靠实测，不能靠直觉**。`harness` 的三个子层是先测调用图再切的；
   `liveProjection` 的两半（readiness / projection）实测**双向零调用**才敢切。
5. **`coversTargets` 这类跨半函数说明 seam 需要调整**，而非新增 import 制造环。
   `multifile` 里 3 个 helper 从 `settlement.ts` 移回 `observation.ts` 正是为了避免环。

#### B4.4 对抗式复核发现的真实缺陷与修复（2026-09-18，2 个子代理）

阶段 B 完成后，派两个子代理对 Phase A 和 Phase B 分别做独立对抗复核。
**复核找出 4 个真实缺陷，已全部修复**：

1. **`fingerprint` 算法静默替换（Release Blocker，`36e36718` 引入，`89b23472` 修复）**：
   `edit/sanitize.ts` 去重时把两个原版的 `computeFragmentFingerprint(c).slice(0, 16)`（SHA-256 前缀）
   错误替换为 32 位 `hash * 31` 滚动哈希（`fp-95a3a00a`），导致所有下游指纹变动，
   且因**无测试断言其输出值**而全绿通过。
   **修复**：恢复 SHA-256 实现，并新增 `src/edit/sanitize.test.ts` 钉死已知输入的精确输出
   （`e3f30fe5`，证实能精确捕获该回归）。

2. **自写 SCC 检测器存在严重盲区：声称 0 环，实际 18 环（`89b23472` 修复）**：
   原检测器将文件路径收集为相对路径、import specifier 解析为绝对路径，
   导致 identity map **永远不匹配**，所有边静默丢失，图表面上无环。
   复核者手工找出 `c8b03d12` 引入的真实运行时 2-环（`sessionTerminalEvidence ⇄ sessionTerminalState`）。
   **修复**：
   - 将 `sessionTerminalState.ts` 内 19 行纯解析器移至唯一调用方 `sessionTerminalEvidence.ts`，消除运行时环；
   - 将子模块从父模块反向导入类型的 3 组 type-only 环下沉为独立 `types.ts` 叶子模块
     （`harnessState.ts`、`edit/multifile/types.ts`、evaluation 两个 `types.ts`）；
   - **新增正式门禁 `npm run verify:import-cycles`（`scripts/check-import-cycles.mjs`）**，
     带自身路径一致性断言，并在合成 2-环上验证其阻断能力。
   - **最终实测：runtime cycles = 0，type-only cycles = 0**（1505 文件）。

3. **`linesPerName` 条款删除理由失实（`bdb0c570` 修复）**：
   原记录声称"所有越界模块都超过 15 行/名"，实测 `sessionStoreAccess.ts` 为 **8.8 行/名**（反例存在）。
   **修复**：在规则文本和脚本注释中将理由修正为诚实版本——长度不具备区分两类形态的能力
   （全树 502 模块超过 40 行/名多因字面量表与注释，而委托率/分支/自有状态能有效切分）。

4. **`package-lock.json` 中 `typescript` 残留 `"dev": true`（`bdb0c570` 修复）**：
   手动提升依赖时漏改的元数据，已清理。

5. **`edit/multifile/model.ts` 既有 17 处非空断言（`!`）彻底清零（`9c6b9fc5`、`45e50380`）**：
   搬迁代码中继承的 `!` 断言全数改为 `never`-returning 守卫 helper（如 `missingClassification`），
   **零 `!`、零 `as`**，不变量在类型系统中显式表达。

6. **真实 CLI 渲染验证（补齐 PTY 缺口）**：
   驱动真实 CLI（`--print --replay-file` 经真实 provider；`--host-command` 经 session 核心），
   并与 `c8b03d12~1`（拆分前）的 worktree 渲染结果逐行对比，
   **结构化输出（`Result / Outcome: success / Detail: completed`）逐字节一致**。

**阶段 C — 需独立立项**

| 序 | 事项 | 状态 |
|---|---|---|
| C1 | **R13 CB-005**（`turn` 内核与编排层不连通） | **✅ 已完成（2026-09-19）**，见 §8.2.1 |
| C2 | R8/R9/R10/R11（风格与命名） | 未启动；无回归压力，可随时穿插 |

#### 8.2.1 C1 / CB-005 执行结果（2026-09-19）

**裁决依据**：CB-005 的表述（"两套并行 provider 路径不连通"）经实测**不准确**。
真实情况是**一条路径已死、其产出无人接管**，且**消费方本身也已死**：

| 事实 | 证据 |
|---|---|
| 活路径 `turn/projection.ts` **从不产出** `codingResult`/`loopTrajectory`/`productLoopAdapter` | 该文件 grep = 0 |
| surface 入口守卫要求这 7 个字段至少一个非空 | `presentation/surface/model.ts:58`（**该文件已删**，见 `6925b242~1`） |
| 活路径只传 3 个，**全是 `undefined`** | `sessionTerminalState.ts:531-537`（**该调用点已随删除移除**，见 `6925b242~1`；现文件 493 行） |
| ⇒ `projectProductSurfaceViewModel` **恒 `return undefined`** | 逻辑必然；`6925b242` 前的源码可复核 |
| 84 个真实会话中唯一含 `loopTrajectory` 的是 **2026-09-11**（迁移 `a7418fcb` 在 09-12 **之后**无） | 逐会话核对 |

**执行**：删 **69 文件 / +109 / −23,631 行**。

| 类别 | 对象 |
|---|---|
| 旧 provider 执行路径 | `runtime/loop/*`（26 文件，13,208 行） |
| host lane | `runtime/api/host/{runtime,io}.ts` + 测试 |
| CLI host 委托 / 包就绪度 | `cli/host/`、`runtime/distribution/` |
| 死 surface 链 | `presentation/surface/*`（7 文件） |
| 死状态面 / 死格式化器 | `session/presentation/envelope.ts`、`core/shell/cliSessionProductSurface.ts`、`presentation/terminal/renderer.ts` |
| 死投影字段 | `runtime/events/projection.ts` 的 **8 个从未填充字段** |
| 公共面 | `index.ts` 3 条导出、scripts/verify-host-surface.mjs（已删）、`--host-command` 开关 |

**保留**：`runtime/api/host/contract.ts`（**纯类型**，`runtime/evaluation` 公共 API 仍引用）。

**验证**（全部实跑）：

| 门禁 | 结果 |
|---|---|
| `tsc -p tsconfig.build.json` | **0 错误** |
| `npm run build` | **0 错误**（含 Rust） |
| 全量测试 | **2749 通过 / 1 跳过 / 0 失败** |
| `verify:import-cycles` | `runtime_cycles=0 type_only_cycles=0` |
| `verify:docs-drift:strict` | pass（dangling 35 → 0） |
| `analyze:module-facades` | 3 monolith 均为既有 disposition，**无新增** |
| NormProof | `openBlockingObligationCount: 0` |
| **真实 TUI**（§2.4 强制） | `--print` → `Outcome: success` exit 0；交互回合完整通过；`/sessions current` 含 `- ID:` |

**测试数 3174 → 2750**：减少的 424 项**全部是被删模块自身的测试**；活模块测试一项未删。

**同时修正的既有认知**：`cliReachable` 指标被死代码污染——见 §1 的口径变化说明。

**完整记录**：`cb-005-execution.md`；立项与代价对照见 `cb-005-initiation.md`、
`cb-005-o1-vs-o3.md`、`cb-005-recommendation.md`、`turn-vs-pi-divergence.md`。

#### 8.2.2 C2 待办（已盘点，见 `c2-inventory.md`）

盘点结果（2026-09-19）：

| 项 | 原判 | 盘点后 |
|---|---|---|
| R8 测试分离到 `test/` | 中（~1799 边） | 风格决策，非缺陷；建议标记"保持并置" |
| R9 `session/__tests__/` 归并 | 低 | **确认存在**（2 文件，全仓唯一 `__tests__`），可执行 |
| R10 `theme/`+`themes/` 合并 | 低 | **❌ 前提被证伪**：二者是数据/引擎分层，**应关闭** |
| R11 `eval/` 归并 | 低 | 确认只被测试引用（114 行），**需裁决** |
| **新增** `runtime/events/host/envelope.ts` | — | **CB-005 遗留孤儿**（106 行，0 引用），**可直接删** |
| **新增** `runtime/evaluation/task/` 5 文件 | — | **孤儿簇**（2,447 行，0 生产引用），**需裁决** |

**无需裁决、可立即执行**：删 `runtime/events/host/envelope.ts`、R9 归并、关闭 R10。
**以上三项已于 2026-09-19 执行完毕**，见 `c2-execution.md`。

**执行结果**：`host/envelope.ts` 已删；`session/__tests__/` 已消除（2 文件迁至 `test-utils/`，
同步更新 3 个 import + 1 处 `spawnSync` 路径字符串）；R10 已关闭。
`tsc` 0 错误 / 全量 **494 文件 2750 通过 0 失败** / 四门禁全过 / 真实 TUI 实机通过。

**剩余两项的深入分析（`c2-execution.md` §2）**：

1. **R11 `eval/browser/`（114 行）→ 建议保留**。实测被 3 个测试真实调用（29 项），
   且不是重复实现；原判"已被 `evidence/harness/` 取代"**未获证实**。
   建议仅把它加入 `tsconfig.build.json` 的 `exclude`（测试专用代码不应进发布产物）。
2. **`runtime/evaluation/task/` 5 文件（2,447 行）→ 建议随 `runtime/evaluation` 整体裁决**。
   **关键发现**：它们不仅无引用，而且**无法被调用**——`runTaskLiveReport` 需要
   `dispatch => Promise<HostCommandResponse>`，而唯一生产者 `createHostRuntime`
   已随 CB-005 删除。**同样的问题也存在于 `index.ts` 公共面导出的
   `runEvaluationCase` / `runTaskAssessment`**：CB-005 删了生产者、留了消费者。

   **这是 CB-005 遗留的公共面断链**（当时记为"三个待裁决的公共面问题"之一）。

   **裁决（2026-09-19）：删除。** `runtime/evaluation/`（15 文件 / 5,881 行）
   + `runtime/api/host/contract.ts`（332 行，唯一消费者是 evaluation）
   + `index.ts` 3 条导出，合计 **16 文件 / 约 6,213 行**已移除。
   依据：无法被调用（缺 host dispatch 生产者）、从未接入任何 gate/脚本/测试。
   **保留** `eval/browser/`（114 行）——它是另一件事（browser 场景基准，
   被 3 个测试真实调用），不动。详见 `c2-execution.md` §4。

### 8.3 本轮规划的三个判断依据

1. **优先"不依赖裁决 + 治根因"的项**：`strict`（语言工具链层面，非我们规则）与
   `exclude` 收紧（根治发布泄漏）都属此类，且都不需搬迁代码。
2. **暂不启动大搬迁**：R4（419 个声明名）、R8（~1799 条边）、R5（34 边）都需要裁决，
   且我们已经完成 Step 3–7 的大规模搬迁——**先巩固，再动**。
3. ~~**CB-005 是唯一真正的"架构需要重构"项**~~ —— **已于 2026-09-19 完成**（§8.2.1）。
   回顾：它确实解释了 §3.1 里 4 条登记项的共同根因，但**根因与立项时的表述不同**：
   不是"两条路径需要连通"，而是"一条路径已死、消费方也已死"。
   **教训**：立项表述本身也可能带错方向；实测（可达性 + 真实会话数据）应优先于既有描述。

### 8.4 与既有纪律的关系

所有阶段 A 的事项都适用既有纪律，不需新规则：

- `strict` 各批：**禁止 `!` / `as` 消错**，只做窄化；错误数须严格下降且不新增错误码（§3.10.5）。
- 任何搬迁：§2.4.1（SCC 前置、实测边数、不夹带重命名、校验 `.js` 后缀）。
- 任何删除：§2.2 六项检查。
- **文档/规则改动**：新增的 `verify:docs-drift`（§3.9.4）已接入 `verify-release-core --strict`，
  搬迁文件者**必须同步更新指向它的文字**——这条现在由门禁强制。
