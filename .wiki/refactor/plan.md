---
title: "Architecture Refactor Plan"
category: article
sources: [repo-audit-2026-09-15, tsc-baseline-2026-09-15, vitest-baseline-2026-09-15, failures-baseline, reachability-audit-2026-09-15, subagent-reviews-2026-09-15]
created: 2026-09-15
updated: 2026-09-20
tags: [refactor, architecture, plan]
summary: "Module boundary refactor plan v7。当前生产 939 / CLI 可达 771 / 全量测试 2740 项（490 文件 / 2739 通过 / 1 跳过 / 0 失败；2026-09-20 实测，见 §1）。删除授权依据为「职责已被活轨承担」（§2.1），可达性只用于分析、不授权删除。Step 1–7 与阶段 A/B/C 全部完成；§9 的 T1–T18 待办已全部收口（18 项已完成、T3 前提被推翻），§9.5 四项开放问题与 93 个单文件孤立簇均已裁决，结论均为「保留」并登记 disposition。本轮另修两处真实缺陷：T2 引入的不可变性回归（§9.17 P1）与 SSRF 防线漏 169.254.0.0/16（§9.24）。§9.18–§9.25 为 2026-09-20 的复核、研究与施工记录。"
confidence: high
---

# Architecture Refactor Plan (v7)

> `.wiki/refactor/` 是整个模块边界重构计划的唯一记录位置。
> **本文件已重组：现状与规则在前，历史在后，路线在最后。**
> 阅读顺序：**§1 现状 → §2 规则 → §8 路线 → §9 区块探索（最新一轮）**；
> §3 是已完成工作的逐轮记录，§4 起为约束来源与历史，需要追溯时再读。

**版本沿革**：v1 初版 → v2 引入生产可达性 BFS → v3 发现删除路线错误、新增 Step 2.7 →
v4 方向重定（删除依据改为"是否已有实现的一部分"）→ **v5 重组结构** →
**v5.1 同步 Step 3 完成后的现状** → **v5.2 同步 Step 4/5 完成后的现状** →
**v5.3 Step 3–7 全部完成** → **v6 重组：新增 §8 路线章（三轮探索汇总 14 项待办，三阶段排期），
§3 章节顺序修正，§3.8 的测试分层结论按 §3.10.4 同步（2026-09-18）** →
**v7 §9.8/§9.5 全部收口：T1–T18 有结论、四项开放问题与 93 单文件簇裁决为保留、
修两处真实缺陷（不可变性回归、SSRF 缺口）、删除 1,250+ 行死代码与 `/auth`；
§1 计数按实测同步，§7 索引补全 12 份新报告，§9.5/§9.6 状态改写（2026-09-20）**。

---

## 1. 当前状态（2026-09-20，§9.8/§9.5 全部收口后）

| 指标 | 值 |
|---|---:|
| 生产文件 | 939 |
| CLI 可达 | 771 |
| CLI 不可达 | 168（仅测试 131 + 零引用 36 + 仅公共 API 1） |
| 全量测试 | **2740 项**（490 文件 / 2739 通过 / 1 跳过 / 0 失败） |
| 稳定失败 | **0** |
| `tsc -p tsconfig.build.json` | 0 错误 |
| **import 环** | ✅ **runtime 0 / type-only 0**（`npm run verify:import-cycles`，1429 文件） |
| **越界模块** | **3**，均有 disposition；`npm run analyze:module-facades` |
| NormProof judge | verdict `partial`；**blocking 义务 0 项未满足** |
| `strict` | ✅ **已对生产开启**（`tsconfig.build.json` `strict: true`）；`npm run build` **0 错误**；零 `!` / 零 `as` |
| 文档/规则漂移门禁 | ✅ `verify:docs-drift:strict`（RULES 0 死引用、DOCS **0 dangling**），已接入 `verify-release-core` |

**每个数字的产生命令**（可复核）：

```bash
python3 scripts/analyze-boundaries.py        # 生产/可达/不可达
npm run test:ts                              # 全量测试（官方入口，cwd=packages/ts-shell）
npm run verify:import-cycles                 # 环 + 文件数
npm run analyze:module-facades               # 越界模块
npm run verify:docs-drift:strict             # 文档漂移
```

> **本表已两次因删除而漂移**（942→946→939）。**每次删除轮次结束必须重跑上面四条命令并更新本表**，
> 否则它会像 §9.9/§9.13/§9.14/§9.16 那样"各轮记录都写了、汇总表没同步"。

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

### 85 个不可达文件的处置（2026-09-15 裁决：不动）

> **2026-09-19 更新**：该数字是**当时**的。经 Step 3–7 搬迁、CB-005 与 C2 三轮删除后，
> 当前 `analyze-boundaries.py` 输出为 `cliOpaque=172`（其中 `publicApiOnly=1`、
> `testOnly=135`、`noReference=36`）。**裁决结论（不动）不变**；
> 注意 `noReference` 从 13 升至 36，且**该指标会把动态入口误报为"零引用"**
> （实例：`longSessionDurabilityProcess.ts` 经 `spawnSync` 启动，见 §2.2 检查 4）。

审查结论（当时）：85 个中 **83 个是"独有实现"**（非冗余），**生产零引用**，75 个仅被测试引用。
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

| 类别 | 表现 | 检测 | 实例（2026-09-15 审计时；**当前状态**） |
|---|---|---|---|
| 引用型 | import 不存在的模块 | `tsc` / import 图 | 403 文件全扫，**零** |
| **契约型** | 活轨读某字段/标记，无人写 | 对被读字段反查写入点 | `provenance.toolExecutions`、`/undo` 快照 → **已随 CB-005 清除**（读取者所在模块本身不可达） |
| **半孤儿** | 在可达集内但无调用者 | 对导出函数反查调用点 | `core/context/browserAgent.ts` → **该文件已不存在**（Step 3 域搬迁后路径变更） |
| **验证型** | 门禁声称覆盖 N 项、实跑 M 项（M<N）仍报通过 | 校验声明目标是否都存在 | `verify:edit-capability-closeout` → **该门禁已删** |

> 四个类别是**判据**，长期有效；上表"实例"是**审计当时的样本**，多数已被后续工作处置。
> 需要新样本时按"检测"列的方法现测，不要沿用旧路径。

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
可达性 959/874/85 全程不变；`validate` + `verify:host-surface` PASS
（**该门禁已于 2026-09-19 随 CB-005 删除**，属当时记录）；
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
- **5 项未决问题（当时待裁决，现已随 Step 4 完成而消解）**（`step-4-orchestration-map.md` §6.3）：
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
  风险集中且不符合分批纪律。**3 项未决问题（当时待裁决）**（判据适用范围、是否保留公共面、
  是否更新 dispositions）——**Step 5 已完成（§3.5），判据 38 → 18**。

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

> **本节是探索过程的历史记录。** 6 项发现的最终处置见下方表格（2026-09-19 已更新为最终状态），
> 全部收敛于阶段 A/B/C。文中"待批准/独立决策"字样是**当时**的措辞。

**完整记录**：`.wiki/refactor/architecture-exploration-2026-09-18.md`

Step 3–7 完成后重新审视"还有哪些位置不正确、哪些需要重构、test 是否该与 src 分层"。
**所有数字由 `maskSource` 语法锚定的 import 图实测。**

| # | 发现 | 严重度 | 处置（**2026-09-19 更新为最终状态**） |
|---|---|---|---|
| 1 | `tsconfig.build.json` 的 `exclude` 仅 `**/*.test.ts`，**7 个非 `.test` 的测试支撑文件被打进 `dist/`** | 中（死重，非运行时风险） | ✅ **已完成**（阶段 A4 / R2）：`exclude` 已加 `src/test-utils/**` 与 `src/**/__tests__/**` |
| 2 | `agent-rules/architecture-boundaries.md` 的 Common Areas **仍指向 `orchestration/patchResult/`、`orchestration/patchApplication/`** | 中（规则指向不存在目录） | ✅ **已完成**（阶段 A）：两条死引用已修，`grep orchestration/` = 0 |
| 3 | `src/renderer/` 不在 sanctioned 域列表；`StreamingRenderer.ts` **41 外部消费者 / 0 出边**；规则示例路径 `presentation/terminal/renderer.ts` | 中 | ✅ **已完成**（阶段 B3）：`renderer/StreamingRenderer.ts` → `presentation/terminal/streaming.ts`，42 处引用重写 |
| 4 | ~~`src/test-utils/` 含 `utils`（规则明文禁止）~~ **【该断言是错的】**；`session/__tests__/` 是全仓**唯一**孤例 | 低 | ✅ **已完成**（A4 + C2）：`test-utils/` **被规则第 70 行明文 sanction**（"test-only support; never imported by production code"），禁止的是**新建** `utils/` 目录，不涉及此域；`session/__tests__/` 已归并（C2） |
| 5 | `presentation/theme/` 与 `presentation/themes/` **仅差一个 `s`** | 低 | ❌ **已关闭**（C2）：实测是**数据/引擎分层**，非重复，见 `c2-inventory.md` §1 |
| 6 | ~~`eval/` 语义已被 `evidence/harness/` 取代~~ **【该断言未获证实】** | 低 | **保留**（C2）：`eval/browser/` 被 3 个测试真实调用（29 项），非死代码 |

**关于 test 是否与 src 分层——原结论"不分离"已被修正（2026-09-18，详见 §3.10.4）**：

1. ~~**硬障碍**：动态入口须先改造才能搬迁~~ → **已撤回**。
   `pi` 的 `test/` **同时容纳夹具与共享基建**，故
   `session/longSessionDurability.test.ts` 那条 `path.join` 只需在**同一次搬迁里**改一处，
   **不存在先后依赖**。
2. **"分离"与 §2.2 的泄漏是正交的两件事**（此条仍成立且是决策关键）：泄漏根因是
   `exclude` **只有一条模式**，与目录布局无关。
3. **规则明文支持并排**且给出并排示例；当前形态**合规**。**分离是风格变更，非缺陷修复**。

> **裁决（2026-09-19，维护者）：R8 保持并排，不分离。**
> 理由：这是风格决策而非缺陷修复；与 `pi` 的差异不影响正确性；
> 搬迁 494 个测试文件与约 1799 条边的收益未获证明。
> **R9 已作为该决策的收尾执行**（`session/__tests__/` 归并，C2）——
> 当前约定**已无例外**。

**结构性基线（2026-09-18 实测，下方为当时值）**：`src/` 1481 文件（生产 961 + 测试 520）；
5094 条已解析边；**`prod → test = 0`**（测试是纯叶子）；`test → prod = 1799`；58% 测试依赖同域生产模块。

> **2026-09-19 更新**：经 CB-005 与 C2 两轮删除，现为
> `src/` **1434 文件（生产 941 + 测试 493）**。`prod → test = 0` 这一结构性结论不变。

**`core/` 的处理**：22 子目录 / 1515 文件，216 条外部入边——是事实上的横切基础层。

> **2026-09-19 更新**：`core/` 准入标准**已写入**（阶段 B1，`b463d87d`）——
> `file-placement-and-naming.md` 的 "`core/` admission" 一节给出三款准入条件
> （方向：feature domain 可依赖 `core/`，反向不可；受众；生存）。
> 本轮不提出拆分方案这一结论不变。

**未改动的两项及原因（当时）**：`tsconfig.build.json`（build behavior）与 `agent-rules/*`
属 `AGENTS.md` 明列"require explicit task scope"的范围；该轮**只报告，不擅自修改**。

> **2026-09-19 更新**：两者均已获授权并修改——`tsconfig.build.json` 见 #1（A4）；
> `agent-rules/file-placement-and-naming.md` 见 §3.9.5 与 2026-09-19 的示例路径更正。

### 3.9 文档与规则漂移探索（2026-09-18）

> **本节是探索过程的历史记录**（含当时的测量数字与门禁口径的三次修正）。
> **其中的"待裁决"字样已过时**——四项的最终状态见 §3.9.6 与 §8.1。
> 本节数字（155 / 224 / 44 / 61 / 26）描述的是**当时**的口径演进，保留以存档。

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

#### 3.9.6 待裁决 —— ✅ 四项已全部完成（2026-09-19 更新为最终状态）

| 项 | 最终状态 |
|---|---|
| `docs/` 分类归档（route 时代约 700 份） | ✅ **已完成**（阶段 B2，`2b262fe7`）：**0/775 文档未分类**（原 677 篇无状态行）；新建 5 个着陆页；`product_architecture_reset_routes` 挂 `historical` banner。**零文件搬迁** |
| 把 DOCS 作用域以 `--strict` 纳入门禁 | ✅ **已完成**：DOCS 224 → **0**，`verify:docs-drift:strict` 已接入 `verify-release-core` |
| `AGENTS.md`：execution 措辞 + 补顶层域 | ✅ **已完成**（阶段 A4 / R3）：`file-placement-and-naming.md` 的 Owner Domains 补全为 **26/26 顶层域**；`AGENTS.md` execution 措辞点名真实所有者并补 Rust 守护进程事实（**该事实已于 2026-09-26 失效**：Rust 守护进程与 Python 层均已删除，见 `.wiki/features/08-gap-and-debt-research.md` §2） |
| 收紧 `tsconfig.build.json` 的 `exclude`（同 §3.8 发现 1） | ✅ **已完成**（阶段 A4 / R2）：已加 `src/test-utils/**` 与 `src/**/__tests__/**` |

**结论：§3.8 与 §3.9 的全部产出均已收敛**——6 项架构发现（§3.8）+ 4 项漂移待裁决（§3.9.6）
+ 治根因门禁（§3.9.4）全部落地，分别经由阶段 A、B、C 执行。
§3.8/§3.9 作为**探索记录**保留，但**其中的"待裁决/待批准"字样均已过时**，
以本节与 §8.1 的进度行为准。

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

> **最终裁决（2026-09-19，维护者）：R8 保持并排，不做分离。**
> 上述分析说明"分离在技术上可行"，但**可行性不等于必要性**——
> 它是风格决策、非缺陷修复，与 `pi` 的差异不影响正确性。
> 作为该决策的收尾，`session/__tests__/` 已归并（R9），**当前约定无例外**。

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
公共 API 闭包 246 文件，当时由 `verify:host-surface` 实测消费
（**该门禁已于 2026-09-19 随 CB-005 删除**）。

> **2026-09-19 更新**：`analyze-boundaries.py` 已于 `b5f80df4` 重写，
> 标签口径改为 `cli` / `script` / `publicApi` / `testRef` 四类，
> 输出 `cliOpaque` / `publicApiOnly` / `testOnly` / `noReference`。
> 上表数字与当前输出**不可直接比较**。

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

> **功能开发方向不在此文件**：重构已收口，下一步的功能缺口普查与分类见
> [`.wiki/features/`](../features/_index.md)（2026-09-20，pi 对照七切片，
> 40 项 DEFICIENT / 38 项 MISSING / 16 项 OURS-ONLY / 7 项平手，含 8 项硬缺陷）。
> 本文件记录的是**架构重构**，两份文档职责不重叠。

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

### 决策与执行记录（2026-09-20，§9.8/§9.5 收口轮）

| 文件 | 内容 |
|---|---|
| `t7-unreachable-disposition.md` | T7/T16a/T16b：不可达集合处置（实测 263/57,977，非 285/60,058）|
| `t10-t11-t12-disposition.md` | T10/T11/T12：三处死代码的删除/部分删除裁决 |
| `t6-t18-disposition.md` | T6 runtimeSeed 形参 / T18 依赖方向（后者原记录不成立）|
| `t14-t17-disposition.md` | T14 四组重复收口 / T17 根跑 vitest 处置 |
| `unreachable-clusters-disposition.md` | §9.5-1：不可达簇三口径与逐域分类 |
| `dead-code-tiers-2026-09-27.md` | 不可达代码分档与**第一档删除授权**（实测 81/20,862，非 35/6,650）+ 第二档被推翻的裁决 + 第三档未查清 |
| `tier2-direction-research-2026-09-27.md` | 第二档方向研究：簇 1 能力非必需；簇 2 能力真实缺失但无参照方案 |
| `duplicate-groups-disposition.md` | §9.5-2：重复普查（96 组 / 344 份）与 5 组推进 |
| `query-runtime-orphans-disposition.md` | §9.5-3：`core/query/runtime/` 逐文件分类 |
| `browser-layout-disposition.md` | §9.5-4：browser 形状实测与不搬迁结论 |
| `singletons-zero-importer.md` | 93 单文件簇：零 importer 与弱 type 持有 |
| `singletons-core.md` | 93 单文件簇：`core/` 部分（含类型契约表）|
| `singletons-noncore.md` | 93 单文件簇：非 core 部分 |
| `singletons-testutils.md` | 93 单文件簇：测试基建 vs 产品自测的划分 |

### 已完成工作的逐轮记录

> **路线章见 §8。**

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
| `phase-b-exploration-2026-09-18.md` | **阶段 B 探索记录（B1–B4）**：推翻 plan 的两处数字/前提；所有数字实测 |
| `block-exploration-2026-09-19.md` | **区块探索坐标（10 区块）**：⚠️ 区块**只是探索坐标，不是目标架构**；含"每个区块查什么"的统一清单与强制报告格式 |
| `block-findings-2026-09-19.md` | **区块探索发现（13 节）**：全局普查（可达性/重复实现/耦合/大文件）+ 区块 A/D/G 回报与逐条核验；含 5 处主代理自行复测的计数更正 |
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

> **2026-09-19 更新：14 项全部收敛。** 下表已改为最终状态；
> 原表按"是否依赖裁决 / 风险 / 收益"排序，那是**规划期**的视图，已不适用。

| # | 事项 | 来源 | 最终状态 |
|---|---|---|---|
| **R1** | 开启 `strict`（S1→S3 生产代码） | §3.10.5 | ✅ **已完成**（阶段 A1–A3）：生产 strict 错误 **136 → 0**；`npm run build` 0 错误；零 `!` / 零 `as` |
| **R2** | 收紧 `tsconfig.build.json` 的 `exclude` | §3.8-1 | ✅ **已完成**（A4）：加 `src/test-utils/**` + `src/**/__tests__/**`；`dist` 961 → 954 |
| **R3** | `AGENTS.md` execution 措辞 + 补顶层域 | §3.9.3 | ✅ **已完成**（A4）：Owner Domains 补全为 **26/26**；execution 措辞点名真实所有者 |
| **R4** | 修 12 处越界模块 | §3.6 | ✅ **已完成**（阶段 B4）：**12 → 3**，余 3 个均有 disposition |
| **R5** | `renderer/` 归位 | §3.8-3 | ✅ **已完成**（B3）：→ `presentation/terminal/streaming.ts`，42 处引用重写 |
| **R6** | `core/` 准入 + `core/extensions/` 删除检查 | §3.8 | ✅ **已完成**（B1，`b463d87d`）：三款准入条件已写入规则；`core/extensions/` 已删 |
| **R7** | `docs/` 分类归档 | §3.9.6 | ✅ **已完成**（B2，`2b262fe7`）：**0/775 未分类**；零文件搬迁 |
| **R8** | 测试是否分离到 `test/` | §3.8/§3.10.4 | ✅ **已裁决：保持并排，不分离**（2026-09-19，维护者） |
| **R9** | `session/__tests__/` 归并 | §3.8-4 | ✅ **已完成**（C2）：2 文件迁至 `test-utils/`，全仓 `__tests__` 目录数 **1 → 0** |
| **R10** | `presentation/theme/` 与 `themes/` 合并 | §3.8-5 | ❌ **已关闭**（C2）：前提被证伪——二者是数据/引擎分层，见 `c2-inventory.md` §1 |
| **R11** | `eval/` 归并 | §3.8-6 | ✅ **已裁决：保留原位**（C2）：`eval/browser/` 被 3 个测试真实调用（29 项）；原判"已被 `evidence/harness/` 取代"**未获证实** |
| **R12** | `check:*` 借鉴 `pi` 的检查项 | §3.10.3 | ✅ **已完成**（A5）：3 项中 1 项反向、1 项不适用、1 项**当场查出真实缺陷**（`typescript` 误置 devDependencies） |
| **R13** | `turn` 内核与编排层不连通（CB-005） | §3.4 | ✅ **已完成**（2026-09-19，C1）：删 69 文件 / −23,631 行，见 §8.2.1 |
| **R14** | `provenance` 5 读 0 写等数据层表现 | §3.1 | ✅ **随 R13 一并清除**（读取者本身已死，随整簇删除） |

**结果**：**12 项已执行，1 项已裁决不做（R10），1 项已裁决保留（R11）**。
**无遗留待办**；R13/R14 之外的 12 项分别经由阶段 A（R1/R2/R3/R12）、
B（R4/R5/R6/R7）、C（R8/R9/R10/R11）完成。

### 8.2 建议的路线（三阶段）

**阶段 A — 零裁决、零风险（可立即开始）—— ✅ 全部完成（A1–A5）**

| 序 | 事项 | 理由 |
|---|---|---|
| A1 | **R1 `strict` S1** —— `runtime/events/projection.ts` | ✅ **已完成**（`ffcf63bf` + 复核修正）：73 错全部清零，生产 strict 错误 **136 → 63**；零 `!` 或 `as`。**复核发现原提交归因错误**：根因是 16 个 `*Like` 镜像接口比真实生产者类型更窄，不是"循环体缺守卫"。已回退防御式改动，改为对齐 15 个镜像到真实类型并删除死接口（保留 1 个真实断环镜像）。**A2/A3 适用同一教训：先对齐类型，再考虑防御** |
| A2 | R1 S2 —— 三个 boundary/lifecycle 文件（26 错） | ✅ **已完成**：26 个生产错全部清零（生产 strict **63 → 37**）。**三个文件形态各不相同**，逐个定因而非套用 A1 模板：① `provider/request/boundary.ts`：3 个镜像无环风险 → 对齐真实类型并删除（8 错）；② `verification/result/boundary.ts`：`RepairApplyObservationLike` **是真断环**（`repair/handoff/boundary.ts` 可达它），不能导入真实类型 → 只修正 13 个字段的可选性使其忠于生产者（10 错）；③ `core/tools/toolResultLifecycle.ts`：`LifecycleEventLike` 的**兜底成员**（`type: string` + 全字段可选）破坏 `switch` 收窄 → 对齐真实生产者 `QueryEvent` 并删除兜底成员（8 错） |
| A3 | R1 S3 —— 其余 ~13 文件（37 错） | ✅ **已完成**：37 处生产 strict 错误全部清零（散在 **24 个文件**，最大单文件 6 处——与 S1/S2 的"单文件集中"形态完全不同，故逐文件定因）。`tsconfig.build.json` 已加 `"strict": true`，`npm run build` **0 错误**。详见 log 的 `strict-s3` 条目 |
| A4 | **R2 + R3** | ✅ **R2 已完成**：`tsconfig.build.json` 的 `exclude` 增加 `src/test-utils/**` 与 `src/**/__tests__/**`，`dist` **961 → 954**，差集**恰为那 7 个测试支撑文件**（逐一验证非测试 importer 为零）；`longSessionDurabilityProcess.ts` 由 `tsx` 从 `src/` 启动故排除安全。✅ **R3 已完成**：`file-placement-and-naming.md` 的 Owner Domains 补全为 **26/26 顶层域**（实测 15 个原不在名单）；`AGENTS.md` execution 措辞点名真实所有者并补 Rust 守护进程事实（**该事实已于 2026-09-26 失效**——Rust 与 Python 层已删除，`AGENTS.md` 现述「单一运行时 TypeScript」，见 `.wiki/features/08-gap-and-debt-research.md` §2）。**均经 `verify:docs-drift:strict` 验证** |
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
| C2 | R8/R9/R10/R11（风格与命名） | **✅ 已完成（2026-09-19）**，见 §8.2.3 |

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
（C2 后为 **2748**，见 §8.2.3。）

**同时修正的既有认知**：`cliReachable` 指标被死代码污染——见 §1 的口径变化说明。

**完整记录**：`cb-005-execution.md`；立项与代价对照见 `cb-005-initiation.md`、
`cb-005-o1-vs-o3.md`、`cb-005-recommendation.md`、`turn-vs-pi-divergence.md`。

#### 8.2.2 C2 盘点（2026-09-19，已完成——结论见 §8.2.3）

盘点产出 `c2-inventory.md`：R10 前提被证伪（应关闭）、R9/R11 可执行、
新发现 2 个真孤儿簇（`runtime/events/host/envelope.ts` 与 `runtime/evaluation/task/` 5 文件）。
**该盘点的结论已全部执行**，最终结果见 §8.2.3。

#### 8.2.3 C2 执行结果（2026-09-19）

盘点（`c2-inventory.md`）→ 执行（`c2-execution.md`）。**R10 的前提被证伪，R11 被裁定保留。**

| 项 | 裁决 | 执行 |
|---|---|---|
| R8 测试分离 | **保持并排，不分离** | 无需改动 |
| R9 `session/__tests__/` 归并 | 执行 | 2 文件迁至 `test-utils/`；**全仓 `__tests__` 目录 1 → 0**；同步更新 3 个 import + 1 处 `spawnSync` 路径字符串 |
| R10 `theme/`+`themes/` 合并 | **关闭**（前提不成立） | 无需改动 |
| R11 `eval/` 归并 | **保留原位** | 无需改动 |

**顺带完成**（`c2-inventory.md` 新发现的两处孤儿）：

| 对象 | 处置 |
|---|---|
| `runtime/events/host/envelope.ts`（106 行） | **已删**——CB-005 删 host lane 时的遗留物 |
| `runtime/evaluation/`（15 文件 / 5,881 行）+ `runtime/api/host/contract.ts`（332 行） | **已删**——维护者裁决；无法被调用（缺 host dispatch 生产者）、从未接线、公共面断链 |

**验证**：`tsc` 0 错误 / 全量 **493 文件 2747 通过 0 失败** / 四门禁全过 /
`thin facades 2 → 0` / 真实 TUI 实机通过。

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

---

## 9. 区块式架构探索（2026-09-19）

> **方向声明（重要）**：本章的"区块"是**为了分工而设的观察坐标，不是项目应有的结构**。
> 真实 owner domain 是 `packages/ts-shell/src/` 下 **28 个顶层目录**，
> 由 `agent-rules/file-placement-and-naming.md` 规定。
> **不得**按区块搬迁、重组或重命名任何代码。见 `block-exploration-2026-09-19.md` 顶部警示框。

### 9.1 为什么做这一轮

阶段 A/B/C 完成后（R1–R14 全部收敛，§8.1），需要一次**不以删除为目标**的全面体检：
此前所有轮次都在回答"哪些可以删"，从未系统回答过
"**重复实现在哪里、死代码还剩多少、命名与划分有没有不合理**"。
本轮**零代码改动**，只产出事实。

### 9.2 方法

- 把 `src/` 按**耦合亲和 + 体量均衡**划成 10 个区块（纯分工，无架构含义）。
- 对每个区块回答五类问题：重复实现 / 死代码 / 命名与位置 / 模块划分 / 耦合度。
- 每条发现强制格式：`[类别] 结论 / 证据 file:line / 影响 / 最小改动建议 / 置信度`。
  **禁止**"耦合度高""可以优化""建议重构"这类无证据结论。
- 子代理并发上限 **2**；每份回报**必须经主代理逐条核验**后才能写入。
- **主代理另行做了三项不依赖区块的机械普查**（避免子代理额度限制成为瓶颈）：
  全仓重复实现哈希扫描（§12、§16）、全仓可达性闭包（§6、§14）、
  全仓跨域边统计与文件级 Tarjan（§3、§4、§6）。
- **核验共更正 12 处**，分两类，每处均保留原值、实测值与偏差来源，**不静默覆盖**：
  - **子代理回报错误 4 处**：§11.6（A：actionable blocker 两链"都在跑"→ 实为一条不可达）、
    §13.9（D：3 个计数）、§15.6（E：**声称 2 个 import 环，实测均不成立**；另有 4 个计数）、
    §17.6（B：branching 误标被过度称为"当前缺陷"→ 实为**潜在**缺陷，因承载链不可达）
  - **主代理早期自测错误 8 处**：§1、§3、§5、§6、§7、§10.3/§18.3、§12、§18
  - **其中 2 处是"解释性推断被证伪"**（不只是数字错）：
    §10.3/§18.3（"judge 计含箭头/方法的更大集合"→ 全仓实测**无箭头函数赋名**，推断删除）、
    §18（用"含类型"的宽口径得出 5 个模块超限 → 规则的 function-like 口径下**只有 1 个**）

### 9.3 全局普查结果（不依赖区块，可独立复核）

| 指标 | 实测值 | 备注 |
|---|---:|---|
| **重复实现** | **56 组 / 177 份冗余副本** | 仅覆盖 `function` 声明式，故为**下界** |
| **不可达生产文件** | **285 文件 / 60,058 行** | 原记 276/60,006，依据不可复现，见 `block-findings` §6 末 |
| **大文件（>600 行）** | **20 个** | 原记 14，已更正；除 `projection.ts` 外均在 602–967 |
| `core/` → feature 域 | **144 条 value 边（127 违规）** | 原记 190+/240，口径未记录，已按可复核口径重述 |
| 文件级强连通分量 | **0** | Tarjan 复算，value 与 value+type 两种口径均为 0 |
| `core/query/runtime/` 孤儿 | **10 个 / 1,961 行** | 原记 7/1,257，已更正 |
| 其余 7 区块孤立文件 | **108 个 / 21,054 行** | `block-findings` §14；含测试基建，未裁决 |
| `runtime/events/` 整域 | **3,182 行 / 0 生产 value 消费者** | `block-findings` §1 |

**最重的单条发现**：`sanitizeText` —— 一个含 **11 条正则**的**秘密脱敏**函数
（真实 provider 家目录、Bearer token、`sk-`/`ghp_`/`github_pat_`、raw content 排除），
被**逐字节复制 6 份**，散布在 `edit/`、`tools/`、`turn/` 三个域。
新增一条脱敏规则要改 6 处，漏一处即产生不被任何单一 review 覆盖的泄漏路径。
（对照：pi 全仓 0 处 `sanitizeText`/`redact*` 定义。详见 `block-findings` §12.2。）

### 9.4 `pi` 对照（本轮新增的可吸收点）

pi **没有**"改动→验证→裁决"投影链，也**没有**浏览器子系统 —— 这两处本仓无对应物可照搬。
可吸收的是它**底层机制**的四处（详见 `block-findings` §10.5、§11.4、§13.7）：

| # | pi 机制 | 本仓差距 | 落地成本 |
|---|---|---|---|
| 1 | 终态是协议里**一条记录**（`harness/session/types.ts:105,108-116`） | 本区块有 **16 个**各自声明 `terminalSuccessClaim: false` 的投影类型，无一为唯一终态 | 高 |
| 2 | "外部结果未知"是**一等字段**（`drive/tools.ts:44-45` `INTERRUPTION_MARKER`） | `verification/result/projection/mutation.ts:125-149` 用 **8 处 `reasonText.includes`** 从散文里猜状态 | **低** |
| 3 | 失败是**可穷尽匹配的类型**（`harness/result.ts:1-16,53-88`） | 无任何 tagged error，失败是字符串数组 | 高 |
| 4 | 进程输出预算**唯一实现**（`harness/utils/truncate.ts:1-16`）+ `utf8ByteLength` | 5 处且语义不同；**byte/char 混用**（字段名 `outputBudgetBytes`，实现是 `String.length`） | **低** |

### 9.5 本轮的开放问题 —— ✅ **四项已于 2026-09-20 全部收口**

> 本节原记"本轮没有解决的问题"。**四项现已全部裁决并执行**，见 §9.21（研究）与 §9.22（施工）。
> 下表保留原始问题陈述，便于追溯当时为何认为它们是问题。

| # | 原始问题 | 当前状态 | 结论 |
|---|---|---|---|
| 1 | 不可达文件：删除、接管，还是保持？ | ✅ **已裁决** | **保留**。实测 263 文件 / 57,977 行（原记 285/60,058 **不可复现**）；逐簇分类后无活轨等价承担。见 §9.21 |
| 2 | 56 组重复实现未逐一裁决 | ✅ **已裁决** | 普查实为 **96 组 / 344 份**；**5 组已收口**，其余记录在案。见 §9.21/§9.22 |
| 3 | `core/query/runtime/` 的 10 个孤儿 | ✅ **已裁决** | **保留**。`policy.ts` 是最强候选但 `harness.ts` 不覆盖其职责。见 §9.21 |
| 4 | `browser/` 平铺与 `runtime/`↔`skill/` 边界 | ✅ **已裁决** | **不搬迁**。实测 168 生产文件（原记 62 平铺）；`runtime/`↔`skill/` 是**耦合 adapter seam**（9 条交叉边 + 真实环），非"两套并行端口"。见 §9.21 |

**四项的共同结论是"保留"**，理由同类：按 §2.1，可达性不授权删除，而这四项均**未证明**有活轨
等价承担其职责。这**不是**回避——每项都跑了应跑的检查，检查**未能授权变更**。

**另：93 个单文件孤立簇**（§9.21 顺带发现）也已研究，见 §9.23。结论同样是保留：
其中 **47 个是编译契约**（活文件依赖其类型），真正零引用仅 2 个。

### 9.6 本轮已确认的问题 —— ✅ **八项已全部处置**

> 本节原记"不需裁决、属缺陷"的八项。**全部已处置**，逐项状态如下（每项均在
> 2026-09-20 重测，不是照抄原记录）。

| 原问题 | 重测结果 | 处置 |
|---|---|---|
| `repair/handoff/boundary.ts` 声明 **21 个具名函数**（>20 上限）但不在 judge 越界名单 | 现为 **20 个**（恰在上限内） | ✅ 已自然消解 |
| `.normproof/out/` **已过期**，名单含已删文件 | 重跑 judge 后 **dead claimId = 0** | ✅ 已刷新（§9.18 T8）|
| `cliSessionRuntimeFactory.ts:70` 2 参 vs 调用方 4 参 → seed 蒸发 | 事实成立，但 live turn lane **无 seed reader** | ✅ 已裁决保留 + disposition（§9.18 T6）|
| `AgentState` 四字段**零生产读者** | 复测**仍为 0** | ⚠️ **仍存在**（属死状态，需产品裁决是否删字段）|
| `browser/capabilityModel.ts` 反向依赖 `presentation/sidebar` | 复测 **0 处** | ✅ 已由 T5（`161e15fd`）解决 |
| `renderProjectedLines` **三份逐字节相同** | 复测**仅 1 处定义** | ✅ 已由 T9 收口 |
| `file-placement-and-naming.md` 子域示例块含重复项与已删目录 | — | ✅ 已修（`283fe006`）|
| 漂移门禁**无法发现**空目录 | 门禁已扩到**无前缀行内引用**（§9.18 P3）| ✅ 已部分解决 |

**唯一仍开放项**：`AgentState` 的 `systemPrompt` / `streamingMessage` / `pendingToolCalls` /
`isStreaming` 四个字段零生产读者。它们是**死状态**——删除属行为变更（字段可能被外部读取），
需产品裁决。

### 9.7 与既有纪律的关系

- 本轮**零代码改动**，故不触及 §2 的删除授权与六项检查。
- 本节所有数字均为**实测**；凡与原记录不符处，均已在 `block-findings` 对应节末
  写明**原值、实测值、偏差来源**，并保留了原记录（不静默覆盖）。
- 若后续按本节建议施工，仍适用：任何删除走 §2.2 六项检查；
  任何搬迁走 §2.4.1（SCC 前置、实测边数、不夹带重命名、校验 `.js` 后缀）。

### 9.8 待办（供下一轮）

| # | 事项 | 依据 | 依赖 |
|---|---|---|---|
| **T1** | 收口 `sanitizeText` 6 份 → 1 份 | `block-findings` §12.2 | ✅ **已完成**（`3550134f`）：新建 `core/security/redaction.ts`，6 处定义 + 10 处调用点全部改指单点；§9.9 记录了验证矩阵 |
| **T2** | 收口 `freeze`/`deepFreeze` | §12.3、§9.15 | ✅ **已完成**（`8c5f47c7`）：45 处合并为 `core/values/freeze.ts`；12 处不可达浅冻结**按裁决保留**，见 §9.16 |
| **T3** | 删 `reasonText.includes` 8 处，改结构化字段 | §10.5 pi-2 | ⚠️ **前提被实测推翻，未执行** —— 见 §9.10 |
| **T4** | 修 `browser/` 的 byte/char 混用 | §13.7 对照-3 | ✅ **已完成**（`6a793de9`）：4 处真消费点改字节计数，见 §9.13 |
| **T5** | 切断 `browser` → `presentation` 反向依赖 | §13.6 耦合-2 | ✅ **已完成**（`161e15fd`）：**实际只改 4 处 import**（非 97），见 §9.14 |
| **T18** | 同类反向依赖：`session/` 跨域指向顶层 `presentation/` | §9.14 附带发现 | ✅ **已裁决（2026-09-20）：登记 disposition，不改**。实测**顶层 0 条**（原记录不成立），全部解析到 `session/presentation/`；见 §9.18 |
| **T6** | 修 `cliSessionRuntimeFactory.ts:70` 的 runtimeSeed 丢弃 | §11.2 A-死-3 | ✅ **已裁决（2026-09-20）：保留现状 + disposition**。live turn lane 无 seed reader，补形参即接死端；见 §9.18 |
| **T7** | 裁决不可达文件的处置 | §6 | ✅ **已裁决（2026-09-20）：不批准整批删除**，逐簇按「活轨是否已承担职责」裁决。实测 **270 文件 / 59,121 行**（285/60,058 不可复现）；见 §9.18 |
| **T8** | 重跑 judge 并刷新 `.normproof/out/` | §10.3 模块-2 | ✅ **已完成**（2026-09-20）：`normproof judge` 重跑，`out/` 全部产物刷新；**ledger 的 4 个已删 `claimId` 归零**，见 §9.18 |
| **T9** | 删 2 处 `renderProjectedLines` 副本 + `parseArgsWithFlags` 私有副本 | §15.8 | ✅ **已完成**（2026-09-20）：3 → 1、2 → 1，见 §9.18 |
| **T10** | 裁决并清理 sidebar Quality 三模块 + EventBridge | §15.3 E-死-1 | ✅ **已执行（2026-09-20）**：实测 **550 行**（非约 440）。删 4 模块 + 2 自测，保留并窄改 3 个 live 行为测试；见 §9.19 |
| **T11** | 删 shell action 与 display projection 的死导出 | §15.3 E-死-2 | ✅ **已执行（2026-09-20）：部分删除**（111 行）。`/view` 无 producer 故保留；`cliDisplayProjection.ts` 不能整删；见 §9.19 |
| **T12** | 删 browser agent/plan/tool-policy 死链（589 行） | §13.3 D-死-1 | ✅ **已执行（2026-09-20）**：589 行 + 移除 `WorkflowTaskPlan.browserPlan` 的 type-only 残留；见 §9.19 |
| **T13** | 修 `cliArgs.ts` 保留字表重复项 `/memory` | §15.8 | ✅ **已完成**（2026-09-20）：100 条字面量含 1 重复 → 99 条全唯一，见 §9.18 |
| **T14** | 收口 `normalizeBaseUrl`/`normalizePathForCompare`/`toRelativeTime`/`stableId` | §12.4、§16 | ✅ **已裁决（2026-09-20）：选择性收口**。实测 **7/7/4/3**（非 4/7/4/2）；仅 `stableId` 两份可并入 `core/values/`；见 §9.18 |
| **T15** | 处理 2 个脚本式 `*.test.mjs` | §9.9「测试跑法」 | ✅ **已完成**（`b7b7880b`）：改名去掉 `.test`，见 §9.11 |
| **T16a** | 裁决不可达簇（含 `mutation.ts`）是否删除 | §9.10 | ✅ **已裁决（2026-09-20）：暂不删除**，标记为不可单独修复的死簇；见 §9.18 |
| **T16b** | 给 `mutation.ts` 接真实生产者 | §9.10 | ✅ **已裁决（2026-09-20）：不接线**。5 个嗅探字符串生产者为 0（实测）；若要保留语义，在活 edit/result lane 新建 producer；见 §9.18 |
| **T17** | 处理"从仓库根跑 vitest"的失败 | §9.12 | ✅ **已裁决（2026-09-20）：仅文档化官方入口**。实测仅 **2 文件 / 3 项**失败（非 11/16），9 个 5s 超时未复现；见 §9.18 |

### 9.9 T1 执行记录（2026-09-19，已完成）

| 项 | 内容 |
|---|---|
| **目标** | 把逐字节重复 6 份的秘密脱敏函数收口为单一 owner |
| **提交** | `3550134f` |
| **新 owner** | `packages/ts-shell/src/core/security/redaction.ts` → `redactReportText(value, maxLength)` |
| **删除的副本** | `edit/sanitize.ts`、`tools/toolOutcomeBundle.ts`、`turn/{deliveryPolicy,followUpQueue,nextTurnBundle,steeringQueue}.ts` 各 1 份（6 → 1）|
| **调用点改写** | 10 处 import（6 定义处 + `edit/multifile/{model,settlement,observation}.ts` + `edit/recovery/model.ts`），共 23 处调用点改名 |
| **净变化** | −87 行（64 插入 / 151 删除）|

**owner 裁决依据**（`core/` 准入三条件，逐条实测）：

| 条件 | 判定 |
|---|---|
| 1. Direction | ✅ `redaction.ts` **零 import**（实测 `grep -cE "^import"` = 0）|
| 2. Audience | ✅ 三个 feature 域消费（`edit/`、`tools/`、`turn/`）|
| 3. Survival | ✅ 真实共享行为，非 shim / fixture / 已放弃能力 |

**目录选择**：`core/security/` 是**既存** owner 域（已有 `pathJail.ts`、`projectTrust.ts`），
语义同类（安全边界）。**顺带补登**：该目录从未出现在 `agent-rules/architecture-boundaries.md`
的 Common Areas 列表，而规则要求新增 `core/<subdomain>/` 必须登记 —— 已补一行。

**验证矩阵**：

| 检查 | 结果 |
|---|---|
| 行为等价性 | ✅ 与 **HEAD 上的原实现**在 14 输入 × 9 长度上限 = **126 组合**上逐字节一致（探针脚本比对 git 原文，跑完即删）|
| `npm run build`（strict） | ✅ 0 错误 |
| `npx tsc -p tsconfig.json`（含测试） | ✅ **190 → 190**，零新增；且无一涉及 `sanitizeText`/`redactReportText` |
| 受影响测试（edit/ + turn/ + tools/） | ✅ 40 文件 / 175 项全过 |
| `verify:import-cycles` | ✅ runtime 0 / type-only 0（1,436 文件）|
| `verify:docs-drift:strict` | ✅ rules_refs 57 → 58（新增引用解析成功），0 dangling |
| 全量测试 | ✅ **493 文件 / 2748 项全过，0 失败**（隔离运行，与 §1 基线一致）。此前观察到的失败**全部源于从错误 cwd 跑 vitest**，非代码问题 —— 根因见下方"测试跑法" |

**⚠️ 测试跑法（本轮踩到的坑，重要）**

本轮我先用 `npx vitest run` 从**仓库根**跑，得到 4 文件失败；
改用**官方入口** `npm run test:ts`（等价于 cwd = `packages/ts-shell`）后，**0 失败**。两个失败各有独立根因：

| 失败 | 根因 | 证据 |
|---|---|---|
| `longSessionDurability.test.ts`（2 项） | 测试内 `repoRoot = path.resolve(process.cwd(), "../..")`，**假定 cwd = `packages/ts-shell`**。从仓库根跑时算出 `repoRoot = /home/wang` → `tsxCli = /home/wang/node_modules/tsx/dist/cli.mjs`（不存在）→ 子进程退出码 1 | 从错误 cwd 跑报 `Cannot find module '/home/wang/node_modules/tsx/dist/cli.mjs'`；从正确 cwd 跑 **2/2 通过** |
| `core/mcp/gateway.test.ts`（1 项） | 同类：spawn 的 fixture 路径以 cwd 为基准，从仓库根跑时解析成 `/home/wang/projects/cheers/src/core/mcp/fixtures/mockMcpServer.mjs`（**缺 `packages/ts-shell/` 前缀**）| 从正确 cwd 跑 **9/9 通过** |
| `verifierModuleBoundary` 与 `approvedProviderEnv` 两个自检脚本（原带 `.test` 后缀，已由 T15 改名，见 §9.11） | 这两个是**脚本式自检**（`node:assert` + `console.log('[pass] ...')`，**无 `describe`/`it`**），设计为 `node <file>` 独立执行；从仓库根跑时被 vitest 默认 glob 当测试收集 → `No test suite found`。**已由 T15 修复**（改名去掉 `.test`）| 从 `packages/ts-shell` 跑时 vitest root 只含 `packages/ts-shell`，`scripts/` 不在范围内 |
| `core/harness/browser*ScenarioExamples.test.ts`（8 个）<br>`core/tools/registry-rust-bridge.test.ts` | **`Test timed out in 5000ms`** —— 不是 cwd 路径问题，而是**根目录没有 `vitest.config.ts`**！本仓唯一的 vitest 配置是 `packages/ts-shell/vitest.config.ts`（`testTimeout: 30000`）。从仓库根跑时 vitest 找不到任何配置 → 用**默认 5000ms** → 这些 8–16s 的进程型场景测试必然超时 | CI 用 `npm run test:ts`（cwd = `packages/ts-shell`）→ 正确加载该配置 |

**何时引入（git 实测）**：

| 项 | 引入时间 | 引入提交 |
|---|---|---|
| `longSessionDurability.test.ts` 的 `repoRoot = cwd/../..` 假设 | **2026-05-11** | `d77d5d80` "Add long-session durability gate" |
| `verifierModuleBoundary` 自检脚本（旧名，现为 `verifierModuleBoundaryCheck.mjs`） | **2026-05-20** | `bdd5f289` |
| `approvedProviderEnv` 自检脚本（旧名，现为 `approvedProviderEnvCheck.mjs`） | **2026-06-03** | `f84e6ab2` |
| **根目录不存在 `vitest.config.ts`**（唯一配置在 `packages/ts-shell/`） | 自始至终 | — |

**即：这不是本轮回溯中任何一步引入的，也不是本轮重构引入的** ——
最早的 `d77d5d80`（2026-05-11）比 plan.md 的 Step 1 还早四个月。
`0621c28e`（C2，2026-09-19）只把该测试的 fixture 路径从 `__tests__` 改到 `test-utils`，
**未触及** `repoRoot`/`tsxCli` 两行。

**结论**：
1. **任何全量测试必须用 `npm run test:ts`**（或 `cd packages/ts-shell && npx vitest run`），**不要从仓库根跑 `npx vitest run`**；
2. 从仓库根跑会**多收集 2 个脚本式 `*.test.mjs`**（T15 已修复），并让 **11 个文件 / 16 项**失败：
   2 个是 cwd 路径错误（`Cannot find module`），9 个是**默认 5000ms 超时**（因根目录无配置可加载）；
3. 这两个脚本文件**无任何 npm script 引用**，仅在 `docs/foundation/foundation-consistency-matrix.json` 登记为 `validationEvidence`。其"只能被 vitest 收集、而收集后又必然失败"的状态是一个**真实的仓库缺陷**（未被 plan.md 记录），建议另立一项处理（见 T15）。
4. 另：**并发跑两个全量套件会导致大面积 flake**（本轮实测 17 文件失败），全量测试需串行。

**未纳入 T1 的相邻重复**（属 `block-findings` §12.4，需独立裁决）：
`turn/toolResultMessage.ts:188` 与 `turn/assistantResponse.ts:150` 等**签名不同**
（2 参数 / 1 参数带 `redacted` 返回值），以及 provider/repair/context/verification 侧的
**21 行 3 参数变体**（哈希 `1b77d3b4320e`，3 份）。这些是**不同族**，不是"同一函数的第 7 份"。

### 9.10 T3 前提推翻记录（2026-09-19，**未执行**）

**原计划**（`block-findings` §10.5 pi-2）：把
`verification/result/projection/mutation.ts:125-149` 的 8 处 `reasonText.includes` 改成
消费已有的结构化字段（`writeEffect` / `writerStarted` / `routeBlocker`），
并称之为"最低成本的一条"。

**实测结果：该改动无法按原计划执行，三条独立理由。**

| # | 事实 | 证据 |
|---|---|---|
| 1 | **目标文件在现代码中不可达** | value 边闭包（根 = `entrypoints/**` + `index.ts`）判定 `verification/result/projection/mutation.ts`、其唯一消费者 `result/projection/shell/assembly.ts`、以及 `runtimeOutcomeProjection.ts` / `contextPacketResult.ts` / `taskLifecycleResult.ts` **全部 UNREACHABLE**，属 `block-findings` §6 的不可达簇 |
| 2 | **生产调用点不传任何结构化判别字段** | 唯一生产调用 `result/projection/shell/assembly.ts:46-56` 只传 7 个字段（`changedFiles` / `failedFiles` / `verification` / `evidence` / 4 个 cross-file 字段）。`routeBlocker` 的**生产者是 0**（全仓仅 `edit/patch/status/mixedOperation.ts:24` 另有一个同名但无关的联合类型）|
| 3 | **8 处嗅探里 5 处无任何生产者** | 逐条全仓 grep（排除 `mutation.ts` 自身）：`"stale-read-blocker"` **0**、`"final-stale-read-blocked"` **0**、`"expected to remain unchanged"` **0**、`"protected file changed"` **0**、`"unchanged file assertion"` **0**。即这 5 个分支**只有 `mutation.test.ts` 自己构造的 reason 字符串能触发** |

**结论**：这**不是**"改判定逻辑"的问题，而是
**"文件不可达 + 无生产者 + 行为仅由测试自喂"** 三重问题。

按原计划改写，会发生两件错事：
- 把测试驱动出来的分支当成真实需求去"结构化"——**在死代码上增加新的类型面**；
- 反过来删掉那 5 个无生产者分支，则 `mutation.test.ts` 的 4 个用例会失败，
  而那 4 个用例断言的是**没有任何生产路径能触发的行为**。

**这修正了 §10.5 的一处判断**：pi-2 当时被评为"最低成本、可直接落地"，
是因为**只读了 `mutation.ts` 内部，没有检查它的可达性与生产调用面**。
教训与 §8.3 第 3 条同类：**判定"最低成本"之前，必须先确认目标在生产上活着。**

**建议的替代处置**（需裁决，见 T16）
- **T16a**：随 `block-findings` §6 的不可达簇一并裁决——若该簇整体删除，`mutation.ts`
  连同其测试一起消失，T3 自动消亡；
- **T16b**：若不删，则先给它一个真实生产者（把 `routeBlocker` / `writeEffect` /
  `writerStarted` 从 edit lane 真实接进 `assembly.ts`），**再接结构化判定**——
  但这属于"接线"，不是本轮"删嗅探"能覆盖的范围。

**本轮不做**：不修改 `mutation.ts`，不删除任何嗅探分支，不动其测试。

### 9.11 T15 执行记录（2026-09-19，已完成）

| 项 | 内容 |
|---|---|
| **目标** | 让 2 个脚本式自检不再被 vitest 误收集 |
| **提交** | `b7b7880b` |
| **修法** | **改名去掉 `.test`**（用户裁决）：`verifierModuleBoundary.test.mjs` → `verifierModuleBoundaryCheck.mjs`；`approvedProviderEnv.test.mjs` → `approvedProviderEnvCheck.mjs` |
| **依据** | `scripts/` 下另有 **80 个 `.mjs`**，**只有这 2 个**带 `.test` 后缀 —— 它们是命名异类，而非 vitest 测试 |
| **同步引用** | 4 个文件、7 处：`foundation-consistency-audit.md`(1)、`foundation-consistency-matrix.json`(2)、`foundation-risk-register.md`(2)、`route159-verifier-module-facades.md`(2) |
| **用的命令** | `git mv`（保留重命名历史）|

**验证**：

| 检查 | 结果 |
|---|---|
| 两脚本直接执行（预期方式 `node <file>`） | ✅ `verifierModuleBoundary=pass` / `[pass] approved-provider-env-fallback-self-test`，均 exit 0 |
| vitest 是否仍收集 `scripts/` | ✅ `npx vitest list \| grep -c scripts/` = **0** |
| 官方入口全量 | ✅ **493 文件 / 2748 项（2747 通过 + 1 跳过）/ 0 失败**，与 §1 基线一致 |
| `verify:docs-drift:strict` | ✅ 0 dangling |

### 9.12 ⚠️ 对 §9.9 根因诊断的更正（重要）

§9.9 最初写"`vitest.config.ts` 无 `include`/`exclude`"，**该表述不准确**。实测更正：

**仓库根目录根本没有 `vitest.config.ts`** —— 全仓唯一的 vitest 配置是
`packages/ts-shell/vitest.config.ts`（`testTimeout: 30000`）。

这解释了从仓库根跑时的**全部**失败现象，共 **11 文件 / 16 项**，两类：

| 类 | 数量 | 现象 | 原因 |
|---|---:|---|---|
| **默认超时 5000ms** | 9 | `Test timed out in 5000ms` | 根目录无配置可加载 → vitest 用默认 `testTimeout: 5000`，而 `core/harness/browser*ScenarioExamples` 等进程型场景测试需 8–16s |
| **cwd 路径错误** | 2 | `Cannot find module ...` | 测试内 `path.resolve(process.cwd(), "../..")` / fixture 路径假定 cwd = `packages/ts-shell` |

**即：从仓库根跑 vitest 是"无配置 + 错误 cwd"的双重误用**，不代表代码有问题。
CI（`.github/workflows/ci.yml:30`）用 `npm run test:ts`，`scripts/test-all-stacks.mjs:55`
用 `--dir packages/ts-shell/src` —— **两者都不从仓库根跑**，故 CI 一直是绿的。

**T15 只解决了"误收集"这一类。** 剩余 11 文件 / 16 项属**测试自身的 cwd 依赖** +
**缺根配置**，是否需要处理见 **T17**。

### 9.13 T4 执行记录（2026-09-19，已完成）

| 项 | 内容 |
|---|---|
| **目标** | `browser/` 输出预算字段名（`outputBudgetBytes`）与实现（`String.length`）不符 |
| **提交** | `6a793de9` |
| **新模块** | `browser/outputBudget.ts`：`exceedsByteBudget(value, maxBytes)` + `appendWithinByteBudget(current, next, maxBytes)` |
| **裁决** | 用户选**改实现为真字节计数**（保留 JSON 键名，避免破坏外部契约）|

**关键约束（决定了修法）**：`outputBudgetBytes` **是磁盘/env JSON 的键**
（`externalNetworkRunnerManifest.ts:239` 的 `JSON.parse`，生产者
`entrypoints/cliCommandExecutionBridge.ts:63`）。**改名会破坏用户已写好的 manifest**，
故只改实现、不改字段名。

**与 T3 的关键差异 —— T4 的目标是活的**（逐个实测 value 边可达性）：

| 文件 | 可达性 |
|---|---|
| `browser/runtime/external/runner.ts` | ✅ REACHABLE |
| `browser/skill/execution/executor.ts` | ✅ REACHABLE |
| `browser/externalNetworkHandoffProtocol.ts` | ✅ REACHABLE |
| `browser/evidenceSafety.ts` | ✅ REACHABLE |
| `browser/controlledNetworkExecutor.ts` | ✅ REACHABLE |

**改动清单（4 处真消费 + 1 处判定为 inert）**：

| # | 位置 | 改前 | 改后 |
|---|---|---|---|
| 1 | `runtime/external/runner.ts:77,80`（`appendBudgeted` → 删除） | `merged.length > budget` | `appendWithinByteBudget(…)` |
| 2 | `skill/execution/executor.ts:200,203`（同上，两份**逐字节相同**，哈希 `569ee9ef3468`） | 同 | 同 |
| 3 | `externalNetworkHandoffProtocol.ts:102` | `combined.length > input.outputBudgetBytes` | `exceedsByteBudget(combined, …)` |
| 4 | `evidenceSafety.ts:119` | `normalized.length > budget` | `exceedsByteBudget(normalized, budget)` |

**第 5 处经核验后**不改**（判为 inert）**：`controlledNetworkExecutor.ts:205` 把
`outputBudgetBytes` 传给 `sanitizeBrowserText`（字符截断）。但其上游 `:196` 的 chunk 循环
用 `Buffer.length`（**真字节**）已封顶，而 `code units ≤ bytes` 恒成立 →
该字符截断**永远不会触发**。按"不写无重量代码"原则，**不引入 inert 的字节包装**，
改为加注释说明原因。**我一度改了这一处，核验后主动回退。**

**验证矩阵**：

| 检查 | 结果 |
|---|---|
| **反证明（决定性）** | 100 个「中」= 300 字节，预算 120：**旧判定接受（超支 2.5 倍）**，新判定拒绝 |
| 探针（临时，跑完即删） | ✅ 5/5：CJK 被拒、emoji 截断不劈字符（无 U+FFFD）、ASCII 不受影响、与 `Buffer.byteLength` 在混合输入上一致 |
| `npm run build`（strict） | ✅ 0 错误 |
| `verify:import-cycles` | ✅ 0 环 |
| `browser/` + `core/harness/` 套件 | ✅ 93 文件 / 413 项全过 |
| 全量（官方入口） | 1 文件失败（`cli-baseline.test.ts`）——**在 HEAD（改动 stash）上同样失败** → **既存 flake**，与 T4 无关 |

**顺带发现**：`appendBudgeted` 的两份（`runner.ts` 与 `skill/execution/executor.ts`）
**逐字节相同**，正是 §13.2 D-重复-1 记录的"3 份 spawn 机器"中的 2 份。本轮收口了这 2 份
（第 3 份 `processAdapter.ts` 用 `outputBudgetChars`，命名与实现本就一致，未动）。

**新增可复核事实**：本仓**另有**一批**已正确**用 `Buffer.byteLength` 的地方
（`core/tools/truncation.ts`、`publicReadOnlyWebExecutor.ts`、`observability/rotatingFileSink.ts` 等），
说明缺陷**只存在于 `outputBudgetBytes` 这一支**，不是全仓性认知缺失。

### 9.14 T5 执行记录（2026-09-19，已完成）

| 项 | 内容 |
|---|---|
| **目标** | 切断 `browser/` → `presentation/` 反向依赖 |
| **提交** | `161e15fd` |
| **新 owner** | `packages/ts-shell/src/core/security/reportText.ts` → `redactUnsafeReportText(value, redactions?, maxLength?)` |
| **删除的实现** | `presentation/sidebar/sidebarStateModel.ts` 内的 `sanitizeSidebarText`（原 32 行）|
| **裁决** | 用户选**中立位置 `core/`** |

**⚠️ 对 §13.6 成本估计的更正（重要）**

§13.6 写"**97 处 import 改写**"。**实测只改了 4 处 import**：

| 文件 | 改动 |
|---|---|
| `browser/capabilityModel.ts:1,140` | 改从 `core/security/reportText.js` 导入，函数体改调 `redactUnsafeReportText` |
| `presentation/sidebar/sidebarStateModel.ts` | 删本地实现 + 27 处调用改名 + 加 core import |
| `presentation/sidebar/sidebarEventModel.ts` | 6 处调用改名 + 改 import 源 |
| `presentation/sidebar/sidebarStateProjection.ts` | 4 处调用改名 + 改 import 源 |

**原因**：那 91 个 `import { sanitizeBrowserText } from "./capabilityModel.js"` 的文件
**import 的是 `capabilityModel.js` 本身**，而 `capabilityModel.ts` 仍导出 `sanitizeBrowserText`。
只要换掉该文件**内部**的实现来源，91 处**一行都不用动**。
§13.6 把"89 处使用 `sanitizeBrowserText`"误算成了"89 处需要改"。

**测绘结果（可复核）**：

| 分类 | 数量 |
|---|---:|
| 只 import `sanitizeBrowserText` | 91 |
| 混合 import（还取 `BrowserActionKind` 等）| 4 |
| 不 import `sanitizeBrowserText`（只用能力模型）| 6 |

**顺手核实的语义区分（避免误判为重复）**：

| 函数 | 位置 | 类别数 | 关系 |
|---|---|---:|---|
| `redactUnsafeReportText`（原 `sanitizeSidebarText`）| 现 `core/security/reportText.ts` | **6** | 本次搬迁对象 |
| `sanitizeBrowserEvidenceText` | `browser/localFixture.ts:58` | 3 + 追踪 | **另一个函数**，包装 + 收集 redactions |
| `sanitizeBrowserText` | `browser/capabilityModel.ts:139` | — | 仅包装前者（保留导出）|
| `redactReportText` | `core/security/redaction.ts`（T1）| 11 条正则 | **不同 surface**，处理 provider 家目录/Bearer/凭据赋值 |

**三者哈希均不同**（`2a08f08fe670` / `4ad7be1bceea`），确认**不是**互相重复。

**core/ 准入三条件（逐条实测）**：

| 条件 | 判定 |
|---|---|
| 1. Direction | ✅ `reportText.ts` **零 import** |
| 2. Audience | ✅ **两个** feature 域消费（`browser/`、`presentation/`）|
| 3. Survival | ✅ 真实共享实现，非 shim / fixture |

**验证矩阵**：

| 检查 | 结果 |
|---|---|
| **行为等价性** | ✅ 与 **HEAD 原实现**在 14 输入 × 9 长度上限 = **126 组合**上文本逐字节一致，**且脱敏标签集合也一致**（探针读 `git show HEAD:` 原文比对，跑完即删）|
| **反向依赖消失** | ✅ `grep presentation/ browser/` = **0** |
| `npm run build`（strict） | ✅ 0 错误 |
| `verify:import-cycles` | ✅ 0 环 |
| `browser/` + `presentation/` 套件 | ✅ 97 文件 / 589 项全过 |
| 全量（官方入口）| ✅ **493 文件 / 2748 项 / 0 失败** |

**顺带补登**：`core/security/` 的 Common Areas 登记更新为涵盖两个模块
（`redaction.ts` 与 `reportText.ts`），说明二者 guard 不同 surface。

**附带发现（记为 T18）**：全仓扫描"其它域是否也有指向顶层 `presentation/` 的反向依赖"，
发现 **`session/` 有 5 处真实跨域边**：
`session/recovery/projectContextSummary.ts:1`、`session/recovery/sessionRecoverySelection.ts:1-2`、
`session/store/sessionListStore.ts:6`、`session/lifecycle/sessionLifecycleWrites.ts:48`。

**注意区分**：`session/SessionManager.ts:33,75` 与 `session/sessionReadSurface.ts:21`
用的是 `./presentation/…` —— 那是 `session/presentation/` **域内子目录**，**不构成反向依赖**。
（`session/presentation/` 确实存在，含 `sessionReentrySurface.ts`、`sessionWarningSurface.ts`。）
其余跨域边：`cli/` 53 处、`core/` 25 处、`entrypoints/` 9 处 —— 这些都在 §3 已记录的
`core/` 越界范围内，非本轮新增。

### 9.15 T2 语义分析（2026-09-19，已分析；**裁决与执行见 §9.16**）

**实测：不是 2 套而是 3 类，共 56 份**（`plan.md` 原记 27 份是按"逐字节相同"的更严口径；
放宽到"同族"后为 56）：

| 类别 | 份数 | 特征 | 分组哈希数 |
|---|---:|---|---:|
| **A 递归 + 已冻结就跳过** | **30** | `!Object.isFrozen(value)` 短路后递归 | 3 |
| **B 递归 + 不跳过** | **13** | 无短路，无条件下探全部子节点 | 1 |
| **C 浅冻结（不递归）** | **13** | 只 `Object.freeze(value)`，不处理子节点 | 5 |

**A/B 的实测差异**（同一输入跑两套）：

| 场景 | A | B |
|---|---|---|
| 正常新建对象（绝大多数调用） | **结果相同** | **结果相同** |
| 父已冻结、子未冻结 | 子保持可变 | 子被冻上 |
| **自引用对象** | 安全返回 | **RangeError 栈溢出** |
| **重复结构**（20 层 × 每层 2 个引用指向同一子节点） | ≈O(深度) | **314 万次访问** |
| 对同一已冻结对象再冻一次 | 1 次访问 | 5 次 |

**但当前代码基本没触发这些差异**（逐个查了 B 的 13 个调用点）：
绝大多数传的是**刚写出的对象字面量**，本来就没冻结过、无环。
最像共享结构的一处是 `runtime/events/projection.ts:2923`：传入累积的 `events` 数组，
每个事件都引用同一个模块级常量 `REDACTION_EXCLUSIONS`。**实测 A=604 次 / B=901 次访问（1.5 倍）**
—— 量级很小，**不是爆炸**。即：**代码写得不一致，但不是线上正在出错。**

**C 类（浅冻结）的实际情况**（更正：并非"只有 2 处"）：
13 份中 **11 份返回 `Readonly<T>`**（嵌套不可变由**类型层**保证），仅 **2 份返回 `T`**：

| 位置 | 返回类型 | 是否真有洞 |
|---|---|---|
| `evidence/task/proof.ts:260` | `Readonly<T>` | 否（仅用于冻 `unique()` 的字符串数组）|
| `result/task/verdict.ts:49` | `Readonly<T>` | 否（同上）|
| `tools/toolHandoff.ts:216` | **`T`（无 readonly）** | **是** —— 被 `:65` 用来冻含嵌套数组的对象，且类型层无保护 |
| `turn/turnSnapshot.ts:135,143` | `readonly T[]` / `Readonly<T>` | 否（单一用途，名字已表意）|

**实测**（浅冻结行为）：外层被冻，**嵌套数组仍可 `push` 成功**（运行时确实有洞）；
但 11 份的调用点返回类型是 `Readonly<T>`，编译期已挡住。

**建议**（按重要性）：

1. **统一到 A 类**（带"已冻结就跳过"）→ 56 份收为 1 份。理由：
   - A 是**严格更安全**的：唯一 B 能做而 A 不能的，是修补"已冻结父对象下漏冻的子对象"，
     而所有调用输入都是自造字面量，不存在这种半冻结输入；
   - A 能防**自引用崩溃**（B 遇环栈溢出，是真实生产崩溃面）；
   - A 在重复结构下自动剪枝（B 指数展开）；今天未触发，只因输入恰好都浅，
     而"输入永远浅"**没有任何东西保证**；
   - 已冻结对象按定义内部不可能再变，B 的下探是纯无用功。

2. **C 类的 11 份**：并入 A（递归版），行为对扁平结构等价、对嵌套结构**更正确**
   （当前它们靠 `Readonly<T>` 兜住，但运行时洞仍在）。

3. **`tools/toolHandoff.ts:216` 单独修正** —— 它是唯一"浅冻结 + 无类型保护 + 输入含嵌套"的三重叠加，
   应并入 A。

4. **代价接近零**：正常输入上 A/B 行为完全一致，替换是机械的。

**裁决与执行（2026-09-19，已完成）**：上述 1–4 已按建议执行，见 §9.16。
**且该执行本身在 2026-09-20 被复核发现引入了一处真实回归**（A/B 语义替换导致
`turn/assistantResponse.ts` 的 `toolCallCandidates` 元素不再被冻结），已修复并补测试，
见 §9.17 P1。**本节保留为分析原貌**，结论以 §9.16 + §9.17 为准。

### 9.16 T2 执行记录（2026-09-19，已完成）

| 项 | 内容 |
|---|---|
| **目标** | 56 份 `freeze`/`deepFreeze` 收敛 |
| **提交** | `8c5f47c7` |
| **新 owner** | `core/values/freeze.ts` → `freezeDeep`（A 类语义：带"已冻结就跳过"）|
| **实际改动** | **48 文件**，净变化 **+238 / −632 行**（净减 394 行）|

**执行范围（与 §9.15 的分析一致）**：

| 类别 | 处理 | 数量 |
|---|---|---:|
| A 递归+跳过 | 并入 `freezeDeep` | 30 |
| B 递归+不跳过 | 并入 `freezeDeep` | 13 |
| C 浅冻结（`verification/execution/model.ts`）| 并入 —— 唯一可达的浅冻结，3 个冻结点只吃 `string[]`/标量 | 1 |
| C 浅冻结（`context/rebuildInput.ts`）| 并入 —— 实为转发别名（`return freeze(value)`），删除后调用直连 | 1 |
| **小计（转换）** | | **45** |
| C 浅冻结（其余 10 个载体不可达）| **按裁决保留原位** | 12 |

**⚠️ 执行中差点造成的破坏（已回退并修正）**

第一次批处理脚本有 bug：我把「函数体 `{` 的位置」误当作「函数声明起点」，
结果**删掉了函数体、把签名留在原地**，45 个文件全部产生孤立声明。

- **发现方式**：脚本自检输出显示每个文件都残留 `deepFreeze` 计数 = 1
- **处理**：`git checkout -- packages/ts-shell/src/` **全面回退**，修正 span 起点（`m.start()`）后重做
- **加固**：重做时改为**先单文件验证 span 内容**（打印待删区间的首尾），确认无误再批量；
  且分类不再依赖易漂移的哈希，改用**函数体特征**（是否含 `Object.values`、是否含 `Object.isFrozen`）

**执行前的关键风险核验（决定了 C 类不并入不可达载体）**

实测证明深冻结会**冻住调用方对象**：

```
SHALLOW: 调用方 workspaceFiles[1] frozen = false
DEEP   : 调用方 workspaceFiles[1] frozen = true     ← 波及调用方
```

原因：`context/selection/model.ts` 冻结的对象里放的是
`input.workspaceFiles.filter(...)` —— **数组是新的，元素仍是调用方的对象**。
该文件**不可达**，故合并只有行为变更、没有收益 → **按裁决保留**。

**跨模块引用一并处理**：`edit/sanitize.ts` 原本**导出** `deepFreeze`，
被 4 个同域模块 import（`edit/multifile/{model,observation,settlement}.ts`、`edit/recovery/model.ts`）。
删除该导出后**断链风险真实存在**，已把这 4 处改为直接从 `core/values/freeze.js` 导入。

**验证矩阵**：

| 检查 | 结果 |
|---|---|
| **行为等价性** | ✅ 探针取 git 上的**原实现**（覆盖 A 与 B 两种形态，5 个代表站点）逐一对拍：冻结后的**图结构与返回的身份**完全一致（探针跑完即删）|
| **真实输出前后对比** | ✅ 受影响 12 域：**HEAD 与改动后均为 427 文件 / 851 项 / 0 失败** |
| `npm run build`（strict）| ✅ 0 错误 |
| `verify:import-cycles` | ✅ 0 环 |
| `verify:docs-drift:strict` | ✅ rules_refs 58 → 59（新增登记被解析），0 dangling |
| **全量（官方入口）** | ✅ **493 文件 / 2748 项 / 0 失败** |
| 保留的 10 个 C 类载体 | ✅ 逐一确认本地实现仍在位 |

**规则补登**：`core/values/` 已按 core 准入要求写入
`agent-rules/architecture-boundaries.md` 的 Common Areas。

**core/ 准入三条件**：

| 条件 | 判定 |
|---|---|
| 1. Direction | ✅ `freeze.ts` **零 import** |
| 2. Audience | ✅ **12 个 feature 域**消费（48 个 import 点）|
| 3. Survival | ✅ 真实共享实现 |

**遗留**：§9.15 提到的"`tools/toolHandoff.ts:216`（浅冻结 + 返回 `T` 无 readonly + 输入含嵌套）"
**未单独修正** —— 它属 10 个保留载体之一（不可达），按同一裁决一并保留。
若将来该文件被接线，应优先把它并入 `freezeDeep`。

### 9.17 2026-09-20 独立复核与处置（T 轮收口）

对 T 轮（`3550134f` / `6a793de9` / `161e15fd` / `8c5f47c7` / `b7b7880b` / `96252719`）
与两轮删除（`6925b242` / `0621c28e` / `8f5b5832`）做独立对抗复核。**发现 1 项真实回归并修复**，
另有 6 项记录/文档缺陷。全部处置如下。

#### P1 ✅ 已修复 —— T2 的 A/B 语义替换造成不可变性回退（真实回归）

**性质**：`8c5f47c7` 把 13 处 B 语义（`deepFreeze` 不短路）实现并入 A 语义
（`freezeDeep` 带 `!Object.isFrozen` 短路）。§9.15 断言"当前代码基本没触发这些差异"——
**该断言对外层成立、对内层不成立**。

**根因**：B 语义文件里，调用点把 `Object.freeze(...)` 的容器直接塞进了 `freezeDeep` 的参数，
例如 `turn/assistantResponse.ts:91` 的 `toolCallCandidates: Object.freeze(candidates)`。
改动前 `deepFreeze` 会下探并冻结元素；改动后遇到已冻结的数组**直接跳过**，元素保持可写。

**实测（同输入、同模块、改动前后对拍）**：

| | `8c5f47c7^` | HEAD（修复前） |
|---|---|---|
| `toolCallCandidates` 冻结 | true | true |
| `toolCallCandidates[0]` 冻结 | **true** | **false** |
| `candidate.arguments` 冻结 | **true** | **false** |
| 改写 `candidate.arguments.command` | `TypeError` 阻止 | **成功** |

**为何是缺陷**：`AssistantResponseState.toolCallCandidates` 声明为 `readonly unknown[]` ——
`readonly` 只保护数组本身，**元素无任何类型保护**。改动前运行时兜住了，改动后类型与运行时都不挡。

**修复**（`turn/assistantResponse.ts`）：移除 `toolCallCandidates` 与 `notProvenClaims`
两处的内层 `Object.freeze`，交由 `freezeDeep` 统一深冻结。

**验证**：`accumulateAssistantResponse` 的 `candidate.arguments.options` 现已冻结，
改写抛 `TypeError`；新增回归测试 `assistantResponse.test.ts`「freezes the accumulated response
and every reachable candidate」——**实测在修复前失败、修复后通过**（已用 `git stash` 双向验证）。

**⚠️ 同类形态在 A 类文件里是既有形态，非本轮引入 —— 但实测未造成泄漏。**
`freezeDeep({ ... Object.freeze(child) ... })` 在 A 类原实现里**不会**深冻结该 child
（遇已冻结值即跳过），这是改动前就有的行为。实测 `freezeDeep` 对象字面量内共
**68 处**预冻结子表达式，分布：

| 文件 | 处数 | 性质 |
|---|---:|---|
| `evidence/savepoint/model.ts` | 33 | 全部为新建容器 |
| `provider/request/boundary.ts` | 20 | 全部为新建容器 |
| `tools/toolCallBatch.ts` | 8 | 元素已由 `normalizeToolCall` 深冻结 |
| `provider/registry/provider.ts` | 3 | 新建容器 |
| `provider/response/stream.ts` / `request/attempt.ts` / `request/fallback.ts` / `response/boundary.ts` | 各 1 | 新建容器或字符串数组 |

**逐点核验结论（`/tmp` 探针实跑，非推断）**：

- `evidence/savepoint/model.ts`：`executionReceipts[0]` 与 `observedResult` **均为新建对象**
  （前者由 `.map((receipt) => Object.freeze({...}))` 构造，后者由 `input.resultProjection`
  的字段展开为新字面量），**深冻结是 no-op，调用方对象未被冻结**
  （实测 `callerReceipt` / `callerResultProjection` / `callerReceipt.redaction` 均 `false`）。
- `tools/toolCallBatch.ts`：`calls` 的元素由 `normalizeToolCall` 各自 `freezeDeep`，
  **元素本就深冻结**（实测仍为 `true`）。
- `provider/*`：字符串数组或新建容器，深冻结为 no-op 或已由外层覆盖。

**即：这 68 处是"冗余但无害"**——`Object.freeze` 与 `freezeDeep` 的语义重叠，删掉它
既无收益也无风险，属可选清理，**不在本轮范围**。先前我一度写成"22 处"并指认
`savepoint/model.ts:148` 为"唯一真实泄漏点"，**该指认被实测推翻**，已按上述实测更正。

**已核验为非缺陷的 2 处**（无需处理）：
- `tools/toolCallBatch.ts` 的 `calls: Object.freeze(calls)` —— `normalizeToolCall` 已对每个
  call 调用 `freezeDeep`，元素本就深冻结，故不受影响（实测元素仍冻结）。
- `provider/response/boundary.ts` 的 `notProvenClaims` 等 —— 纯字符串数组，深冻结是 no-op。

#### P2 ✅ 已修复 —— T1 收口不完整：11 条安全正则链仍有 4 份

§9.9 记「6 → 1」。**实测仍有 3 份与 owner 规则链完全相同**（括号配对提取函数体，
名字归一后哈希 `5eed66aaf6ba` 三份一致）：`repair/handoff/boundary.ts:705`、
`verification/result/boundary.ts:776`、`context/rebuildInput.ts:171`。

**差异仅在链外**：签名多一个 `redactions: Set<string>`，尾部记 `unsafe-content` / `truncated`
标签并用 `slice(0, maxLength)}...` 截断（注意：**产出 `maxLength + 3` 字符**，非保留尾缀）。
`block-findings` §12.4 记过这组，但描述为"与 12.2 的 6 份**不同的另一套**"——**不准确**，
规则链完全相同。

**处置**：把链抽为 owner 的单一实现，链外差异参数化为
`redactReportText(value, maxLength, { redactions?, ellipsis? })`。三个文件的私有 `sanitizeText`
改为一行委托。

**等价性验证（逐字节，含副作用集合）**：
- 带 `ellipsis` 路径：19 输入 × 8 上限 = **152 组，0 不一致**（含 `redactions` 标签集合比对）
- 默认路径（原 6 份语义）：11 输入 × 9 上限 = **99 组，0 不一致**
- **自纠一处**：我最初把 `ellipsis` 实现为保留尾缀 `maxLength - 3`，探针立刻报 63 组不一致；
  已改为与原实现一致的 `slice(0, maxLength) + "..."` 后归零。

**收口结果**：承载完整 11 条规则的实现 **4 → 1**。

#### P3 ✅ 已修复 —— 漂移门禁对"无前缀行内引用"失明

门禁在 `96252719` 专门加了 fence 解析，但 `CANDIDATE` 正则要求行内引用带仓库根前缀，
`resolves()` 里那条 `packages/ts-shell/src` 回退基址**永远收不到输入**。

**处置**：新增 `SOURCE_PATH` 规则，**以"首段是否为 `packages/ts-shell/src` 下的真实域"为闸门**
（域列表从磁盘读取，新增域当天即覆盖，删除域自动失效）。该闸门避免把
"一次性工作区里的 `test/artifact-workflow.mjs`"这类非仓库路径误判为漂移。

**口径对照（同一脚本、同一 active 文档集）**：

| 口径 | 引用数 | 死引用 |
|---|---:|---:|
| 修复前 | 260 | 0 |
| 修复后（含无前缀源码路径） | 418 | **0 dangling + 47 source-dangling** |

47 条**单列为 advisory 计数、不逐条打印、不判失败**——因为删除轮次会合法引用已删路径
（如 `plan.md` 记录"Step 2.6 误删 X，已回退"），硬失败会误报。计数本身即信号：它衡量
"根前缀正则看不见的散文面有多大"。

**双向验证**：注入根前缀死路径 → DOCS 作用域 exit 1；注入死规则引用 → RULES 作用域 exit 1；
干净态 → exit 0。**自纠一处**：我最初在脚本自己的注释里写了根前缀示例路径，
而该脚本被 `DOC_STATUS` 标为 active，导致门禁自报 1 条 dangling；已改写注释。

#### P4 ✅ 已修复 —— plan §1 计数漂移

| 指标 | 原值 | 实测 |
|---|---:|---:|
| 生产文件 | 942 | **946** |
| CLI 可达 | 770 | **773** |
| CLI 不可达 | 172 | **173**（仅测试 136 + 零引用 36 + 仅公共 API 1） |
| 环扫描文件 | 1435 | **1439** |
| front-matter 生产数 | 941 | **946**（与正文 942 亦不一致） |

T 轮新增 4 个 owner 模块各轮执行记录都写了，但**汇总表与 front-matter 未同步**。

#### P5 ✅ 已修复 —— 三处陈旧产物

| 位置 | 处置 |
|---|---|
| `.normproof/dispositions.md` | 追加失效说明行：**20 条** disposition 指向已删路径。协议 append-only，故不删原行，改为显式登记其为惰性（最易被误读为现存 deferral 的是 4 条 `runtime/evaluation` / `presentation/surface`）|
| `scripts/analyze-module-facades.mjs:44` | 注释改为说明该限制**现已无实际暴露文件**，并对任何声明 `readonly { ... }` 字段的模块成立 |
| `docs/sprint/project-gap-and-priority-plan.md:44` | 现在时陈述改为过去时 + 删除说明 |

#### P6 ✅ 已记录 —— `verification/execution/model.ts` 的 C→A 转换副作用

§9.16 记了 `context/selection/model.ts` 的"深冻结会冻住调用方对象"，**未记此文件的同类副作用**：

| | 改动前（浅冻结） | 改动后（`freezeDeep`） |
|---|---|---|
| `out.blockers` 冻结 | false | true |
| **调用方传入数组冻结** | false（可 push） | **true（push 抛 TypeError）** |

**当前无破坏**：该模块 CLI 可达，但两个活消费者
（`core/query/runtime/harness.ts:7`、`core/query/runtime/proof.ts:15`）只调
`classifyVerificationTargetCoverage` / `verifyChangedFileCoverage`；受影响的是
`executeVerification`，仅由 `index.ts` 公共面与测试调用。属需记录的行为变更。

#### P7 ✅ 已记录 —— 保留载体计数口径

§9.16 记"12 处不可达浅冻结保留"。实测 `8c5f47c7^` 全仓浅冻结定义共 **12 个**，
其中 **1 个被转换**（`verification/execution/model.ts:167`），**保留 11 个**，
差 1 且口径未说明。

保留的 11 个：`context/selection/model.ts:211`、`evidence/task/proof.ts:261`、
`planning/execution/model.ts:187`、`provider/request/packet.ts:70`、`repair/loop/model.ts:293`、
`result/task/verdict.ts:50`、`tools/policy/strategy.ts:369`、`tools/toolHandoff.ts:217`、
`turn/turnSnapshot.ts:136/140`、`verification/selection/model.ts:280`。

其中 **10 个返回 `Readonly<T>`**，**仅 `tools/toolHandoff.ts:217` 返回 `T`（无 readonly 保护）**——
§9.16 的记述与此一致，且实测该文件生产侧仅 type-only 引用，**不可达结论成立**。

#### 复核中被证实的声明（不逐条展开）

T1 六份副本规则链逐条一致；T4 字节语义（CJK/emoji 边界、不劈字符、exact-cap 正确）与
inert 判定（上游确以 `Buffer.length` 封顶）；T5 提取后**逐字节相同**且反向依赖归零；
T15 改名零残留；CB-005 的 `runtime/loop` 生产零值导入、动态入口无字符串路径、
`index.ts` 无悬空导出；C2 的 `runEvaluationCase` 确无可调用的 `HostCommandResponse` 生产者、
零外部测试导入者、`index.ts` 已修复。全量 493 文件 / 2747 通过 / 0 失败；
`tsc --noEmit -p tsconfig.build.json` 0 错误；import 环 0。

### 9.18 §9.8 剩余待办的深度研究（2026-09-20，四个子代理并行）

**方法**：4 个 `unsee/gpt-5.6-luna:max` 子代理并行，每个负责一个不相交切片，
各自独立重测所有数字（不复用 wiki 数字）。**主代理已逐条复核其头条数字**（见下）。
四份完整报告：

| 报告 | 覆盖 | 行数 |
|---|---|---:|
| `t7-unreachable-disposition.md` | T7 / T16a / T16b | 272 |
| `t10-t11-t12-disposition.md` | T10 / T11 / T12 | 246 |
| `t6-t18-disposition.md` | T6 / T18 | 239 |
| `t14-t17-disposition.md` | T14 / T17 | 460 |

**主代理独立复核的头条数字**（每条都亲自重跑）：

| 复核项 | 子代理结论 | 主代理复核 |
|---|---|---|
| value-edge 不可达集合 | 270 文件 / 59,121 行 | ✅ 复现（`python3 /tmp/closure.py`） |
| T18 的 5 处"跨域边" | 全部解析到 `session/presentation/`，顶层 0 条 | ✅ 复现（自写扫描：8 条命中，顶层 0） |
| `mutation.ts` 嗅探的 5 个字符串 | 生产生产者 0 | ✅ 复现（逐字符串 grep，全 0） |
| T6 形参丢失 | 调用方传 4、工厂声明 2 | ✅ 复现（`sessionRuntime.ts:270` vs `cliSessionRuntimeFactory.ts:70`） |
| T10 行数 | 550（非 wiki 的约 440） | ✅ 复现（`wc -l`） |
| T12 行数 | 589 | ✅ 复现（`wc -l`） |
| T14 组数 | 7/7/4/3（非 wiki 的 4/7/4/2） | ✅ 复现（`stableId` 实为 3 处：2 同 + 1 异） |

#### 逐项裁决建议

| # | 建议 | 理由（核心） | 成本 / 风险 |
|---|---|---|---|
| **T7** | **不批准整批删除**；按"活轨是否已承担职责"逐簇裁决 | 285/60,058 **不可复现**（实测 270/59,121）。抽样 12+ 文件显示 context 获取链、planning runtime、runtime event 投影、session tree 投影**均无活轨等价承担**，属独有实现。§2.1 规定可达性不授权删除 | 保留成本＝继续占用 59k 行；删除成本＝193 个测试文件直接 import 不可达集（129 仅死 + 64 混合），且需逐簇六项检查 |
| **T16a** | **暂不删除**该不可达簇，标记为"不可单独修复的死簇" | `mutation.ts:68` 唯一生产调用方 `result/projection/shell/assembly.ts:46` 本身不可达；8 个嗅探分支只由自测输入触发 | 若将来授权整簇删除，T16a 随簇删除；**在此之前不做单点重构** |
| **T16b** | **不接线**；若产品确需该语义，在活 edit/result lane 新建结构化生产者 | 5 个被嗅探字符串生产者为 0（已复核）；`writerStarted`/`writeEffect` 有活连续性生产者但**不是同一 contract**；`routeBlocker` 值域不覆盖 | 新建 producer 的 owner 建议 `edit/result/journal/model.ts`；**不要**恢复 `assembly.ts` 旧路线 |
| **T10** | **删除** 4 个仅测试可达的模块（550 行）+ 2 个自测文件；**保留并窄改** 3 个 live 行为测试 | 生产 value consumer = 0；`/sidebar` 活轨由 `projectSidebarState` + panel/live runtime + renderer + event sink/adapter 承担 | 需改 3 个测试（把死质量模块从 fixture/断言中摘除）。风险：未来有人把 test-only 模块接回生产 |
| **T11** | **部分删除**（111 行）：删 `runSessionsShellAction`(49) + `runAgentModeShellAction`(30) + agent/workspace 死 formatter(32)；**保留** `runViewShellAction` 与 view formatter | sessions 由 `runResumeCommand` 活轨承担（实测 `resumeCommandRuntime.ts:53` 产出 `list-sessions`）；agent-mode 由 `cycleAgentMode` + Shift+Tab 承担（实测 `keymap.ts:191`）；**`/view` 无任何 producer**（实测 4 个 action 全无写入点）→ 按 §2.1 不可删 | `cliDisplayProjection.ts` **不能整删**（`projectPermissionListDisplay` 仍 live）。风险：`USAGE_MANUAL.md` 仍宣称 `/view` 可用，需产品确认该承诺 |
| **T12** | **删除**三文件（589 行）+ 移除 `WorkflowTaskPlan.browserPlan` 的 type-only 残留 | 显式 `/browser` 活轨（`browserCommandRuntime` → `commandRunner` → action loop/policy）承担该职责 | 需同步改 `planning/task/workflowTaskPlanner.ts:2`（`BrowserAgentPlan` 无任何赋值点）。风险：若将来恢复 prompt-driven browser planning，需作为新 lane 明确接线 |
| **T6** | **保留现状 + 登记 disposition**，不补形参 | seed 生产者存活、`ShellSessionRuntime` 调用点仍传值，但 CLI 工厂之后的 live turn lane **无任何 seed reader**（`createQueryRuntimeStateFromSeed` 生产调用者 = 0）。补形参＝接到死端；删实参＝破坏现有契约及测试 seam | 与 CB-005 **方向相反**（CB-005 是生产者被删/读者存活；T6 是生产者存活/消费端惰性）。若产品要恢复 seed 语义，必须端到端扩展 `streamCliRuntimePrompt` → `CliRuntimeInvocationInput` → `runTurn` |
| **T18** | **登记 disposition，五处全部不改** | fresh 扫描证明**没有一条**指向顶层 `src/presentation/`：全部解析到 `session/presentation/`（主代理复核：顶层 0 条）。原记录"5 处跨域反向依赖"**不成立**；且实为 3 value + 2 type-only | 与 T5 不同：这些对象携带 session 专属类型（`SessionReentrySummary` 等），**不满足** `core/` 的 direction/audience/survival 准入。强行修的成本高于收益（`SessionReentrySummary` 48 处命中 / 12 文件） |
| **T14** | **选择性收口**，不四组一刀切 | 实测 7/7/4/3。仅 `stableId(prefix, parts)` 的 2 份逐字节相同 → 候选 owner `core/values/`；`normalizeBaseUrl` 需先按 provider/config 语义拆分（`providerReadiness.ts` 版本不 trim）；`normalizePathForCompare` 依赖 `node:path` **不满足** `core/` 零 import 准入 → 本轮不合；`toRelativeTime` 4 份**无用户可见输出差异** → 可谨慎收口到 `core/shell/` 显示层 | 低风险项只有 `stableId`；其余需先定语义边界 |
| **T17** | **仅文档化官方入口**（选项 C），不加根配置、不为迁就错误 cwd 改测试 | 实测根跑只剩 **2 文件 / 3 项**失败（非 wiki 记的 11/16），全部是测试自行把 `process.cwd()` 当 package 根；**9 个 5s 超时未复现**。CI 与官方入口均为 `npm run test:ts`（cwd = `packages/ts-shell`） | 加根配置会改变官方入口行为并有重复收集风险；根跑从未是承诺入口 |

#### 与既有记录的差异（本轮实测更正）

| 记录 | 原值 | 实测 | 性质 |
|---|---:|---:|---|
| §6 不可达文件 | 285 / 60,058 | **270 / 59,121** | 不可复现，口径已变 |
| §14 孤立文件 | 108 / 21,054 | **129 / 26,855**（排除 test-utils） | 定义/集合口径不同 |
| §7 `core/query/runtime/` 孤儿 | 10 / 1,961 | 10 / 1,961（剔除 `events.ts` 的 type-only 消费者后） | ✅ 对齐 |
| T10 行数 | 约 440 | **550** | 低估 110 |
| T14 组数 | 4/7/4/2 | **7/7/4/3** | `stableId` 漏算多行签名 |
| T18 边 | 5 处跨域指向顶层 `presentation/` | **顶层 0 条**；实为 3 value + 2 type-only，全在 `session/presentation/` | **原记录不成立** |
| T17 根跑失败 | 11 文件 / 16 项 | **2 文件 / 3 项** | 9 个 5s 超时未复现 |

#### 未验证事项（诚实边界）

- 四份报告**均未**逐一完成 270 个文件的 §2.2 六项检查；T7 结论基于 12+ 跨域抽样与关键簇核验，**不构成整批删除授权**。
- 未运行全量 vitest / `npm run build`（并发约束）；未对建议 diff 实际施工。
- 未做动态 `import()` / `spawn` / `pathToFileURL` 的运行时 tracing；保护类判定基于静态形状 + 精确字符串探针。
- 未验证仓库外 consumer、未入仓 plugin；`WorkflowTaskPlan.browserPlan` 与 `/view` 文档承诺是否属外部契约需维护者确认。

### 9.19 §9.8 剩余项的施工执行（2026-09-20）

§9.18 给出裁决后，按 **T12 → T10 → T11** 顺序施工（风险由低到高），
并先把 T6/T7/T16a/T16b/T18 五项"决定不改"登记进 `.normproof/dispositions.md`。

#### 先登记：5 条 disposition

`dispositions.md` 追加 4 条（协议 append-only，未删任何行）：

| obligation-id | 内容 |
|---|---|
| `unreachable-code-retention` | T7：270 文件 / 59,121 行不可达，**不授权整批删除**（抽样证明 context 获取、planning runtime、event 投影、session tree 投影均无活轨等价承担）|
| `unreachable-code-retention` | T16a/T16b：`mutation.ts` 簇不可达且 5 个嗅探字符串生产者为 0；**不删、不接线**，若需语义应在活 edit/result lane 新建 producer |
| `contract-seam-inert` | T6：`cliSessionRuntimeFactory.ts` 声明 2 参、调用方传 4 参；生产者存活但 CLI 后无 seed reader，**补形参＝接死端**。与 CB-005 方向相反 |
| `dependency-direction` | T18：原记录"5 处跨域指向顶层 `presentation/`"**不成立**，实测顶层 0 条，全部在 `session/presentation/` 内 |

#### T12 ✅ 已执行 —— 删除 browser 死链

| 项 | 内容 |
|---|---|
| 删除 | `browser/toolPolicy.ts`(188) + `browser/agent.ts`(183) + `browser/plan.ts`(218) = **589 行** |
| 连带修改 | `planning/task/workflowTaskPlanner.ts`：移除 `BrowserAgentPlan` type-only import 与 `browserPlan?` 字段 |
| 六项检查 | 1 功能读审 ✅（构造 prompt-driven plan，无 side effect）｜2 等价核验 ✅（显式 `/browser` 活轨：`browserCommandRuntime` → `commandRunner` → action loop/policy）｜3 消费者 ✅（唯一外部边是 type-only，**全仓 `browserPlan` 仅 1 处出现＝声明本身，无赋值无读取**）｜4 动态入口 ✅ 0 命中｜5 公共面 ✅ 0 命中｜6 scripts ✅ 0 命中 |
| 验证 | `tsc` 0 错误；`src/browser` 71 文件 / 210 项通过；残留引用扫描 0；环扫描 **1439 → 1436 文件，0 环** |

#### T10 ✅ 已执行 —— 删除 sidebar Quality/EventBridge

| 项 | 内容 |
|---|---|
| 删除 | `sidebarEventBridge.ts`(244) + `sidebarPanelQuality.ts`(97) + `sidebarLivePanelQuality.ts`(99) + `sidebarStateQuality.ts`(110) = **550 行**；另删 2 个自测（`sidebarEventBridge.test.ts`、`sidebarStateQuality.test.ts`）|
| 保留并窄改 | `sidebarStateSurface.test.ts`：`bridgeSidebarEvents` fixture → 活 `createSidebarEvent`（**断言全保留**）｜`sidebarPanelLayout.test.ts`：摘除 `checkSidebarPanelQuality` import/调用/断言（**其余 4 项断言全保留**）｜`sidebarLivePanelRuntime.test.ts`：摘除 `checkSidebarLivePanelQuality` 调用与 6 条断言（**它们与已有的直接输出断言重复**）|
| 六项检查 | 全部通过；生产 value consumer = 0（实测：仅 `sidebarLivePanelQuality.ts` 内部 import，而它自身只被测试 import）|
| 验证 | `tsc` 0 错误；`src/presentation/sidebar` **10 文件 / 33 项通过**——live state/panel/runtime/renderer/store 行为仍被覆盖 |

**关键点**：T10 的"测试基建 vs 删除不可兼得"两难**已解决**——3 个 live 行为测试保留，只把死模块从它们的 fixture/断言中摘除。

#### T11 ✅ 已执行 —— 部分删除（111 行）

| 项 | 内容 |
|---|---|
| 删除 | `shellActionRuntime.ts`：`runSessionsShellAction`(49) + `runAgentModeShellAction`(30)；`cliDisplayProjection.ts`：`formatWorkspaceInfoLines`(12) + `formatAgentMode*`(20) = **111 行** |
| 连带修改 | `interactiveCommandRouter.ts`：删 agent-mode 两条分支与 3 个死 import；`types.ts`：删 `set-agent-mode`/`show-agent-mode` union 成员与 `agentMode?` 字段；`cliCoreSplit.test.ts`：删对应断言 |
| **保留** | `runViewShellAction` + `formatViewMode*` + `projectPermissionListDisplay` |
| 保留理由 | `/view` 的 4 个 action（`show-view`/`set-view`/`show-agent-mode`/`set-agent-mode`）**全仓无任何可达 producer**（§9.26 更正：`shellActionRuntime.ts:130/137/145` 确实产出 `show-view`/`set-view`，但该函数 `runViewShellAction` **自身零调用者**、`registry.ts` 无 `view` 条目——即 producer 存在但不可达，原措辞"从不被写"不准确，结论不变。**且该不可达并非 `bfe56b20` 造成**：`/view` 于 **2026-09-01 `c0ae9ba0`**（"turn catalogue commands into choosers"，registry 减 56 行）即已从注册表移除，`bfe56b20` 父提交实测 registry 无 `view` 条目、`runViewShellAction` 零调用者——属**先于本次删除**的既有状态）→ 按 §2.1 无活轨接管即不可删。agent-mode 的**读侧**同样无 producer，但写侧语义已由 Shift+Tab 活轨承担，故其死分支可删 |
| 六项检查 | 全部通过 |
| 验证 | `tsc` 0 错误；`cliCoreSplit.test.ts` 6/6、`src/cli/interactive` 全通过；残留引用扫描 0 |

#### 本轮结束时状态

| 指标 | 值 | 变化 |
|---|---:|---|
| 生产文件 | 939 | −7（T10 4 + T12 3）|
| CLI 可达 | 770 | — |
| CLI 不可达 | 169 | −4 |
| 仅测试 | 132 | −4 |
| import 环扫描文件 | 1430 | −9（含 2 个自测）|
| 越界模块 | 3 | — |
| 死引用（RULES）| 0 | — |
| 死引用（DOCS 无前缀）| 47 | — |

**删除总量**：源码 **1250 行**（589 + 550 + 111）+ 2 个自测文件。
**未删除但已裁决保留**：T7 的 270 文件 / 59,121 行、T16a 的 `mutation.ts` 簇、T11 的 `/view` 子链。

**本轮未做的事（诚实边界）**：未运行真实 TUI 实机验证——本轮改动触及 `entrypoints/`、`cli/interactive/`、`core/commands/`、`presentation/sidebar/`，**按 §2.4 属 PTY 实机验证触发面**，见 §9.20。

### 9.20 本轮 PTY 实机验证（2026-09-20，§2.4 强制）

本轮触及 `entrypoints/`、`cli/interactive/`、`core/commands/`、`presentation/sidebar/`
——按 §2.4 属**实机验证触发面**，故必须启动真实 TUI 走完整回合。

| 场景 | 命令 | 结果 |
|---|---|---|
| 完整回合 | 提示 → `bash` 工具调用 → 执行 → `echo t10-verify` 输出 → 收尾 → 回到提示符 | ✅ **无崩溃、无回归** |
| 会话落盘 | `/sessions`（上一轮已验证同路径） | ✅ 正常 |
| **`/view` 实机行为** | 输入 `/view status` | ⚠️ **`Outcome: blocked` / `BlockerKind: command-not-allowlisted` / `Unknown slash command: /view`** |

**`/view` 实机结果是对 §9.19 决策的独立证实**：T11 之所以**保留** view 子链，是因为它
"没有 producer"。实机运行进一步证明该命令**根本不在 registry 中**——用户敲 `/view` 得到的是
"未知命令"，而非保留的功能。

**但保留仍是正确的**，原因是实测发现 view-mode 的**读侧是活的**：

| 位置 | 角色 |
|---|---|
| `entrypoints/cliApprovalModule.ts:490,494` | **活消费**：读取 `getViewMode()`，`"verbose"` 时改变审批输出 |
| `core/shell/sessionRuntime.ts:123,127` | `getViewMode`/`setViewMode` 实现 |
| `cli/runtime/cliSessionRuntimeFactory.ts:104` | 桥接到 session runtime |

即：view **模式**被活路径读取（影响审批显示），只有 view **命令**（`/view`）未接线。
这与 §9.19 的判断一致：`/view` 的 4 个 action 无 producer，但 view-mode 语义仍有活消费者，
所以既不能删 `getViewMode`/`setViewMode`，也不该在无产品裁决的情况下把 `/view` 接回。

**若要让 `/view` 可用**：需在 registry 注册命令并接线 `runViewShellAction`
（该函数已按裁决保留），这是**新增产品能力**，不是删除清理，需单独裁决。

### 9.21 §9.5 四项开放问题的深度研究（2026-09-20，四个子代理并行）

**方法**：4 个 `unsee/gpt-5.6-luna:max` 子代理并行，各负责 §9.5 的一项，独立重测所有数字。
四份完整报告：

| 报告 | 覆盖 | 字节 |
|---|---|---:|
| `unreachable-clusters-disposition.md` | §9.5-1 不可达簇 | 23,493 |
| `duplicate-groups-disposition.md` | §9.5-2 重复实现 | 38,919 |
| `query-runtime-orphans-disposition.md` | §9.5-3 query/runtime 孤儿 | 20,780 |
| `browser-layout-disposition.md` | §9.5-4 browser 布局 | 17,908 |

**过程中主代理纠正了 3 处自己的错误**（子代理反驳成立，已改）：
① 我给 query/runtime 研究员的"0 消费者"表漏了目录内消费者（实际只有 3 个文件全隔离）；
② 我把 `closure.py` 的两个 scope 标签写反了（263 是 all-non-test，256 才是排除 test-utils）；
③ 我用一个只清首行的破损脚本算出 252/97，两个数都是伪值——真正权威是 263/118。

#### §9.5-1 不可达簇 ✅ 已裁决 —— **全部保留，逐簇处置**

**三口径必须分开标注**（此前多次混淆，已固化）：

| 口径 | 不可达 | 弱连通分量 | 最大簇 |
|---|---:|---:|---|
| value-only，全部非测试 TS | **263 / 57,977 行** | **118** | **60 文件 / 14,852 行** |
| value-only，排除 test-utils | 256 / 55,729 行 | — | — |
| type-inclusive（环门禁用的图）| 168 / 40,097 行 | 45 | 98 / 30,115 |

**关键结构事实**：118 个分量中 **93 个是单文件孤立**。这直接决定 §2.2 的适用方式——
对单文件，分量就是文件本身，可单独裁决；对 60 文件的 C1，**不能按单文件处置**。

**建议：保留全部**。理由：抽样与逐文件分类显示 top-3 域（core 62 / context 36 / edit 27）
中绝大多数是**独有能力**或**不可达链内的 internal-only 载体**，没有证明活轨等价承担。
唯一进入未来删除候选的是 `core/commands/authCommandRuntime.ts` 所在单文件簇
（若正式认定 `/connect` 已替代 `/auth`），但**仍需先过六项检查**。
> **2026-09-20 后续**：维护者已正式认定 `/connect` 取代 `/auth`，六项检查全过，
> **该文件与其测试已删除**（§9.24.2）。

**触发条件（何时可重访）**：产品明确退休旧 query/context/planning lane，并完成职责迁移后，
按连通分量整簇删除，而非按文件。

#### §9.5-2 重复实现 ✅ 已裁决 —— **推进 5 组，其余记录在案**

**普查数字修正**：可靠下界是 **96 组 / 344 份**（TS lexical scanner），**不是 wiki 的 56/177**。
诚实边界：仅 `function` 声明式、跨文件、函数体 ≥3 行；箭头函数/方法简写/短函数体全排除，
真实值更高。

**"同名"≠"同职责"**（wiki 曾把两者混为一谈）：
- `sanitizeId` **24 个定义**，跨多域多行为族 —— 是**命名风险**，不是合并目标；
- `truncate` **13 个定义**，字符/宽度/trim/ellipsis 规则不统一 —— 同上。

**本轮推进的 5 组**（均已有现成 owner，无需新建）：

| 组 | 份数 | owner | 理由 |
|---|---:|---|---|
| `isPrivateNetworkHost` | 4 | `browser/networkAllowlist.ts`（已有）| **安全边界**（SSRF 防线），最高优先 |
| `redactSensitiveText`（浏览器族）| 3 | `browser/evidenceSafety.ts`（已有）| 脱敏家族；**不得**吞并 `policy/workspaceFileContract.ts` 的不同 redactor |
| `isRecord` | 11 exact + 2 变体 | `core/values/`（已有）| 中性值守卫，无 import |
| `compactText`/`compactContinuityText` | 5 | `session/sessionContinuityModule.ts`（已有）| 同域，可直接收口 |
| `normalizeOptionalString` | 3 | `session/sessionContinuityModule.ts`（已有）| 同域 |

**次选**：plain `truncate` 的 5 份 exact（32 个直接调用点），因 sidebar/result projection
另有语义且无隔离 canonical 文件，暂不推进。

**其余全部保持"已记录、未裁决"**，非 dismiss。

#### §9.5-3 `core/query/runtime/` 孤儿 ✅ 已裁决 —— **全部保留，登记 disposition**

**纠正主代理的"只有 3 个文件全隔离"**：按外部 value + 目录内 value 双口径，
(a) 类实为 **7 个**（`actionAuthority`、`batch`、`decision`、`events`、`harnessState`、`policy`、`proof`），
其中多数仍有 **type-only 入边**。**只有 `policy.ts` 真正零 value/type 入边。**

| 分类 | 文件 | 裁决 |
|---|---|---|
| **live**（外部 value 消费者）| `harness`（`session/harness/state.ts:12`）、`observation`（`session/replay/builder.ts:2`）、`state`（`core/shell/recovery.ts:11`）、`taskState`（4 处）| 保留 |
| **(b) 目录内 value 依赖** | `facts`（← `policy`）、`harnessClaims`、`harnessPendingState`、`harnessSupport`（← `harness`）| 保留——**承重**，非死叶 |
| **(a) 无 value 消费者** | `actionAuthority`(312)、`batch`(143)、`decision`(30)、`events`(74)、`harnessState`(177)、`policy`(272)、`proof`(323) | **keep-and-investigate** |

**为何不删**（关键反证）：`policy.ts` 是最强候选（唯一零入边），但实测 `harness.ts`
**不覆盖**它的 action-selection 责任——harness 管 snapshot/save-point/pending queue/output
settlement（`:183-967`），policy 管 fact→context→plan→request→strategy→repair-plan 编排
（`:37-170`）。二者是**不同职责**。`proof.ts` 的底层 owner 虽活
（`evidence/task/proof.ts:61`、`result/task/verdict.ts:18`），但 query-specific projection glue
未被证明接管。

**六项检查**：三个候选的 #4（动态入口）与 #6（`scripts/`）均 0 命中，#5 公共面 0 命中。
**测试成本**：`policy.ts` 仅 1 个直接测试（`session/replay/builder.test.ts:7`），
`actionAuthority`/`proof` 各 0 —— 删除成本低，但**授权不成立**。

#### §9.5-4 `browser/` 布局 ✅ 已裁决 —— **不搬迁，登记 disposition**

**形状修正**：wiki 记"62 个平铺文件"，实测 **125 个平铺**（+ `receipt/` 9、`runtime/` 23、
`skill/` 11 = **168 生产文件 / 23,616 行**；含测试共 226）。最大文件仍是
`receipt/store.ts` 447 行（无生产文件 >600）。

**可达性**：**162/168 可达**；不可达仅 6 个（`directPlaywrightAdapter.ts`、
`playwrightEvidenceMapper.ts`、`runtime/core/gauntletManifest.ts`、`selectorRepairApplyExecutor.ts`、
`selectorRepairApplyPolicy.ts`、`skill/runner/manifest.ts`）。

**⚠️ 推翻 wiki 的"两套并行端口"判断**：`runtime/` ↔ `skill/` **不是并行实现，而是耦合的
adapter seam** —— 交叉边 **9 条**（6 value + 3 type-only），且**存在真实环**
（`runtime/core/adapterExecutor.ts:19` → `skill/runtime/binding.ts` →
`runtime/core/protocol.ts`）。这也解释了环门禁为何把 type-only 环单列。

**不搬迁的理由**：654 条内部边 + 9 条跨 seam 边 + 多入口 ingress；且历史先例是
Step 3f 实测 1,537 边 vs 估算 361（**低估 4 倍**）。按 §2.4.1 的搬迁纪律，
此规模搬迁需先跑 SCC、按依赖方向分批、实测每条 escaping 边——**收益不明确，成本已证明会低估**。

### 9.22 §9.5-2 五组重复实现的收口执行（2026-09-20）

按 §9.21 的裁决，收口 5 组。**每组都先证明等价、再改调用点**，全部实测：

| 组 | 前 | 后 | owner | 等价性证明 |
|---|---:|---:|---|---|
| `isPrivateNetworkHost`（**SSRF 防线**）| 4 | 1 | `browser/networkAllowlist.ts`（既有）| 28 个 host 输入，**0 不一致** |
| `redactSensitiveText`（浏览器族）| 3 | 1 | `browser/evidenceSafety.ts`（既有）| 21 输入 × 2 变体 = **42 组，0 不一致** |
| `isRecord` | 13 | 1 | `core/values/record.ts`（**新建**）| 两个变体在 16 个值上**行为相同** |
| `compactText` | 4 | 1 | `session/sessionContinuityModule.ts`（既有导出 `compactContinuityText`）| 函数体**逐字节相同** |
| `normalizeOptionalString` | 3 | 1 | `session/sessionContinuityModule.ts`（既有）| 函数体**逐字节相同** |

**关键安全发现（未改，需裁决）**：`isPrivateNetworkHost` 的探针暴露该防线本身有两个缺口——
`LOCALHOST`（大写）与 `169.254.169.254`（云元数据端点）**均判为非私有**。
这两处是**行为缺口而非重复问题**，收口不改变它们（4 份本来就一致地有缺口）。
**修它属行为变更，需独立裁决**，本轮不做。

**`core/values/record.ts` 新建的依据**：`core/` 准入三条件实测通过——
① Direction：零 import；② Audience：`browser/`(12) + `turn/`(1) 两个域；
③ Survival：真实共享值守卫。已按规则要求在 `agent-rules/architecture-boundaries.md`
的 Common Areas 登记。

**过程中的两次自纠**：
- 批处理脚本误删了 `core/values/record.ts` 自身的定义（它也被 `grep -rl` 命中），已立即重建；
- `permissionRequestMemoryCodec.ts` 的 import 路径算错（`../` 应为 `./`），`tsc` 报错后修正。

**验证**：
| 检查 | 结果 |
|---|---|
| `tsc --noEmit -p tsconfig.build.json` | 0 错误 |
| `src/browser` | 58 文件 / 191 项通过 |
| `src/session` | 57 文件 / 265 项通过 |
| `src/browser` + `src/turn` + `src/core/values` | 67 文件 / 260 项通过 |
| 全量（官方入口）| 490/491 文件，**2741 通过 / 1 失败** |
| import 环 | 0（1431 文件）|
| 越界模块 | 3，无新增 |
| drift 门禁 | strict pass |

**那 1 个失败是既存 flake，非本轮引入**：`cli-baseline.test.ts:649` 的
`sessions current` 断言 `- ID:`。三重证据：
① 该字符串由 `core/shell/sessionStateSurface.ts:115` 产出，**不在本轮改动文件内**；
② 隔离复跑 **40/40 通过**；
③ `git stash` 掉本轮全部改动后该测试同样通过——即两侧行为一致，失败只出现在全量并发下。
`plan.md` §9.14 已记录同一测试的同类抖动（"在 HEAD 上同样失败 → 既存 flake"）。

### 9.23 93 个单文件孤立簇的深度研究（2026-09-20，四个子代理并行）

§9.21 发现 263 个不可达文件中 **118 个弱连通分量里有 93 个是单文件**。
因 §2.2 的整分量规则，单文件分量**就是分量本身**，可逐个裁决——这是该集合里唯一低成本清理面。
4 个子代理并行，报告：

| 报告 | 覆盖 | 行数 |
|---|---|---:|
| `singletons-zero-importer.md` | 零 importer 簇 | 190 |
| `singletons-core.md` | `core/` 簇 | 347 |
| `singletons-noncore.md` | 非 core 簇 | 220 |
| `singletons-testutils.md` | test-utils 与测试基建 | 800+ |

#### 分类（**主代理自己的前两次测量都错了，已由子代理纠正**）

| 类别 | 数量 | 含义 |
|---|---:|---|
| **type-contract**（有外部 type importer）| **47** | **活文件依赖其类型，删了会编译失败** |
| test-only（仅测试 import）| 42 | **17 静态基建 + 25 产品自测**；另加 1 个动态进程 fixture，语义基建共 **19** |
| 零 importer（value + type + test 全无）| **2** | 仅 `session/replay/host/facts.ts` 与 `test-utils/longSessionDurabilityProcess.ts` |

**核心结论**：**93 个中 47 个是类型契约**——"孤立"不等于"可删"。
这一条推翻了"93 个单文件簇是低成本清理面"的初始预期：真正可考虑删除的只有
**2 个零 importer + 25 个自测产品模块**，且后者删了会连带删掉它们唯一的测试。

#### 主代理的三次自我纠错（均由子代理以直接证据反驳）

1. 我给研究员的"零 importer = 4"**错了**：`actionAuthority.ts` 被 `batch.ts:6`
   **type-only 导入**，`proof.ts` 被 `events.ts:12` type-only 导入 → **实际零 importer 是 2**。
2. 我的扫描脚本有 **resolver bug**（给 `./x.js` 直接拼 `.ts` 而非先剥 `.js`），
   导致首轮"live-importer=9"分类全部不可靠。
3. 我还**漏掉了多行 `import type { ... } from "./x.js"` 块**（`hookDispatcher.ts:3-11` 即为此形态），
   这使我把 `core/hooks/types.ts` 误判为"live importer"。

**方法教训**：本次三轮都栽在同一个模式——用自制的静态扫描替代直接 grep + 读上下文。
子代理坚持用 `grep` + `git show` 验证并**拒绝接受我的更正**，才纠正了这三处。

#### 逐项裁决

| 簇 | 裁决 | 决定性理由 |
|---|---|---|
| `test-utils/longSessionDurabilityProcess.ts` | **保留（受保护）** | §2.5 动态入口：`session/longSessionDurability.test.ts:228` 用 `path.join` + `spawnSync` 启动；另有 `scripts/verify-session-durability-long.mjs` 驱动 |
| `core/harness/*ScenarioFixtures.ts`（8 个）| **保留** | 均被 `*ScenarioExamples.test.ts` / `*GauntletScenarios.test.ts` **直接 import**（主代理已独立验证 `browserRuntimeAdapterFixtures.ts` 有 2 个命名消费者）|
| `core/workflow/*`（6 个）| **保留** | `core/workflow/` **是活的**（`registry.ts` → `workflowCommandRuntime.ts` → definition/runner/runStore）；这 6 个是**测试专用/休眠辅助**，非死代码 |
| `core/commands/authCommandRuntime.ts` | ✅ **已删除**（2026-09-20）| 无生产 importer、无 registry 条目；`/connect` 已注册且 `addConnectionFromLegacyAuthSet` 显式覆盖 legacy `/auth set`；`slashRouter` 测试断言 `/auth` 为 unknown。维护者认定后连同测试删除，见 §9.24.2 |
| 其余 type-contract（47）| **保留** | 活文件依赖其类型 |
| 其余自测产品模块（25）| **保留，登记 disposition** | 删除会连带删除其唯一测试，需产品裁决 |

#### 与既有记录的差异

| 项 | 原记录 | 实测 |
|---|---|---|
| "93 个是低成本清理面" | §9.21 的预期 | **不成立**：47/93 是类型契约，仅 2 个真零 importer |
| `actionAuthority` / `proof` 零 importer | 主代理首测 | **各有 1 个 type-only importer**（且 importer 本身也不可达，属"弱持有"）|
| test-only 簇的性质 | 未区分 | **42 个中仅 19 个是基建**，23 个是自测产品代码 |

#### 未验证事项

- 未逐文件完成 47 个 type-contract 的六项检查（结论是"保留"，无需删除检查）。
- 未运行全量测试；本轮零代码改动。
- `runtime/events/projection.ts`（2,997 行）的裁决基于静态 import 图 + 测试消费者，
  未做运行时 tracing 验证其输出确实无人消费。

#### 9.23.1 主代理第四处错误的根因（单引号 import）

`singletons-testutils` 报告指出了我那个扫描脚本的**真正根因**，值得单独记录：

我的正则只匹配**双引号** specifier（`from\s+"([^"]+)"`），而 `core/query/runtime/`
的文件用**单引号**：

```
batch.ts:6   import type { RuntimeActionBlock } from './actionAuthority.js'   ← 单引号
events.ts:12 import type { QueryRuntimeProofProjection } from './proof.js'    ← 单引号
```

因此这两条 type-only 边对我的扫描**完全不可见**，我才把零 importer 数成 4（实为 2）。
**这与多行 `import type` 是同一类缺陷的两个变体**：都是"自制正则比真实语法窄"。

**四条错误的共同根因**：三次用自制静态扫描替代 `grep` + 读上下文，四次都栽在
"正则覆盖不了真实语法"（resolver 不剥 `.js`、多行 import 块、单引号 specifier）。
子代理每次都用直接证据反驳，四次全部成立。

**修正后的权威数字**：
| 口径 | 值 |
|---|---:|
| type-contract（外部 type importer）| 47 |
| test-only（严格静态）| 42 = **17 静态基建 + 25 产品自测** |
| 语义测试基建 | **19**（18 静态 + 1 动态进程）|
| 零 importer（value+type+test 全无）| **2** |

### 9.24 SSRF 防线缺口修复 + `/auth` 删除（2026-09-20，维护者裁决后执行）

#### 9.24.1 SSRF：`169.254.169.254` 两道防线都放行

**发现经过**：§9.22 收口 `isPrivateNetworkHost` 时，探针顺带暴露该函数不认
`169.254.169.254`。维护者要求验证完整攻击链是否可达，实测结果：

| 地址 | 第一道防线（`publicReadOnlyWebPolicy`）| 第二道防线（`networkEgressGuard`）|
|---|---|---|
| `https://169.254.169.254/` | ✗ **放行** | ✗ **放行** |
| `https://localhost/` | ✓ 拦截 | ✓ 拦截 |
| `https://10.0.0.5/` | ✓ 拦截 | ✓ 拦截 |
| `https://example.com/` | ✗ 放行（正常）| ✗ 放行（正常）|

**放行后确实发请求**（`publicReadOnlyWebExecutor.ts:73` 调 `client({url})`）。

**根因**：两份**独立实现**的私有地址列表**都漏了链路本地段 `169.254.0.0/16`**：

| 位置 | 函数 | 缺 `169.254.` |
|---|---|---|
| `browser/networkAllowlist.ts` | `isPrivateNetworkHost` | ✅ 缺 |
| `browser/networkEgressGuard.ts` | `isPrivateOrigin`（**第二份独立实现**）| ✅ 缺 |

**为何重要**：`169.254.0.0/16` 是云厂商发布实例元数据的地址段（AWS / 阿里云 / 腾讯云等），
`169.254.169.254` 会返回实例的临时凭据。私有网络检查漏掉它，意味着
**只要 allowlist 恰好写进该地址，元数据端点就可达**——白名单是配置，可能由脚本/模板/用户输入生成。

**实际严重性（诚实边界）**：不是"立即可被攻击"。走到发请求还需**同时**满足
manifest 的 `allowedPublicOrigins` 显式包含该地址、`confirmationRequirement: "required"`
的确认通过、sandbox authority 通过。即**"防线不完整"**，不是"防线不存在"。

**修复**（两处）：
1. `isPrivateNetworkHost` 增加 `hostname.startsWith("169.254.")`；
2. `networkEgressGuard.ts` 的 `isPrivateOrigin` **删除本地列表、改为委托**
   `isPrivateNetworkHost(new URL(origin).hostname)` —— 消除第二份独立实现，
   使今后只需修一处。保留 origin 解析失败的 `catch`（返回 `false`，因周边检查已拒绝不可解析目标，
   返回 `true` 会把畸形值误报为私有网络）。

**修复后验证**：两道防线**均拦截** `169.254.169.254`，`localhost` / `10.0.0.5` 仍拦截，
`example.com` **仍放行**（无过度拦截）。`src/browser` + `src/core/harness` 93 文件 / 412 项通过。

**同时更正 §9.22 的一处误报**：上轮称"`LOCALHOST` 大写可绕过"——**错误**。
实测走真实入口时 `parseBrowserNetworkTarget` 已 `.toLowerCase()`，大写到不了判断处。
上轮的测法只调函数本身、未走真实入口。**只有 `169.254.` 这一处是真缺口。**

#### 9.24.2 删除 `/auth`（维护者认定 `/connect` 已取代）

**裁决**：维护者 2026-09-20 认定 `/connect` 取代 `/auth`。

**六项删除前检查**（全部实测）：

| 检查 | 结果 |
|---|---|
| 1 功能读审 | 275 行，实现 `/auth set/status/use/logout` legacy 命令 |
| 2 等价核验 | ✅ `/connect` 已注册（`registry.ts:125`）且 `addConnectionFromLegacyAuthSet`（`connectCommandRuntime.ts:199`）**显式处理** legacy `/auth set` 参数形状 |
| 3 消费者存活 | 生产 value/type consumer = **0**；仅 `authCommandRuntime.test.ts` 引用 |
| 4 动态入口 | 0 命中 |
| 5 公共面 | `index.ts` 0 命中 |
| 6 `scripts/` | 0 命中 |

**辅助证据**：`/auth` **未在 registry 注册**；`slashRouter` 测试断言 `/auth` 为 unknown。

**测试处置**：`authCommandRuntime.test.ts` 随之删除——它只测该死模块。
其另一处依赖 `getUserRuntimeConfigPath` 属**活代码**，但该函数另有 3 个测试覆盖
（`runtimeConfig.test.ts`、`modelCommandRuntime.test.ts`、`connectCommandRuntime.test.ts`），**无覆盖损失**。

**删除量**：`authCommandRuntime.ts`(275) + 测试(约 160) 行。

### 9.25 `provider/proposal/` 家族：一个活函数寄居在休眠目录里（2026-09-20，仅记录）

**背景**：§9.23 的单文件簇研究顺带发现 `provider/proposal/` 是"混合状态"。
本轮逐个函数实测后，结论比"混合"更精确。

#### 实测：一个目录，两种完全相反的存活状态

**9 个源文件 / 1,985 行**的校验-匹配-定级逻辑，**每个导出函数的外部生产调用者都是 0**：

| 文件 | 行数 | 导出函数 | 外部生产引用 |
|---|---:|---|---:|
| `providerAnchorMatcher.ts` | 264 | `matchProviderAnchorCandidates` | **0** |
| `providerAnchorConflict.ts` | 197 | `detectProviderAnchorConflicts` | **0** |
| `providerAnchorQuality.ts` | 178 | `classifyProviderAnchorQuality` | **0** |
| `providerAnchoredProposal.ts` | 290 | `buildProviderAnchoredProposal` | **0** |
| `providerAnchoringResult.ts` | 179 | `buildProviderAnchoringResult` | **0** |
| `providerOutputValidator.ts` | 164 | `validateProviderOutput` | **0** |
| `providerProposalAnchors.ts` | 170 | `extractProviderProposalAnchors` | **0** |
| `providerAnchorCandidate.ts` | 161 | （类型 + 候选构造）| **0** |
| `providerEditProposal.ts` | 386 | `normalizeProviderEditProposal`、`buildProviderEditProposalManifest` | **0 / 0** |

**唯一活的**：`providerEditContext.ts:134` 的 `redactProviderEditText`（4 行），
**13 处外部生产引用**。

#### 关键事实：13 个调用者全是活文件

| 调用者 | 次数 |
|---|---:|
| `planning/task/taskIntent.ts` | 5 |
| `provider/proposal/providerEditProposal.ts` | 5 |
| `edit/proposal/editRepairContext.ts` | 2 |
| `edit/proposal/editRepairProposal.ts` | 2 |
| `repair/verificationRepairContext.ts` | 2 |
| `verification/command/plan.ts` | 2 |

**即：准确表述不是"该目录混合"，而是——一个通用脱敏函数被放在一个整体休眠的目录里。**
`redactProviderEditText` 与 provider 的"提案"语义无关，只是碰巧同居；
它被 `edit/`、`planning/`、`repair/`、`verification/` 四个域消费。

#### 裁决：记录，不动

| 对象 | 处置 | 理由 |
|---|---|---|
| 休眠的 9 文件 / 1,985 行 | **保留** | 属"独有能力、无活轨覆盖"，与 §9.5-1 的 270 文件同类；§2.1 规定可达性不授权删除 |
| `redactProviderEditText` | **保留，另记待裁决** | 它是**脱敏家族的第 N 份**（与 `core/security/redaction.ts`、`core/security/reportText.ts` 同族但**规则不同**）。合并属**行为变更**，需独立裁决 |

**遗留待裁决项**：`redactProviderEditText` 是否并入 `core/security/`。
注意其规则与现有两份**不完全相同**（它额外处理 `sk-{12,}` 与 `Bearer`，但**不处理**
`oldText/newText`、`<html>`、`raw provider output`），故**不能直接替换**，需先定规则并集。

**若将来清理该目录**：**不能整目录删除**——必须先把 `redactProviderEditText` 迁出，
否则会切断 `edit/`、`planning/`、`repair/`、`verification/` 四个域的活路径。

### 9.26 本会话代码改动的独立复核（2026-09-20，子代理并发上限 2）

**范围**：本会话 5 个含实质代码改动的 commit（其余 5 个为纯文档）。
复核采用**对抗式**：要求子代理证伪作者声明，而非复述。主代理对每条头条发现**自行复现**后才采信。

#### 已确认缺陷并修复（2 项）

**（1）`/auth` 删除后遗留用户文档指向不存在的命令**（由 `ReviewDedupSSRF` 独立发现，主代理复现）

`26a76eba` 删除了 `/auth` 运行时，但三份**面向用户**的文档仍在教用户使用它：

| 文档 | 行 | 原文 |
|---|---|---|
| `INSTALL.md` | 24, 52-53 | "by using `/auth` inside the CLI"、`/auth set ...`、`/auth status` |
| `USAGE_MANUAL.md` | 22, 101-105 | 整节 "### 3.10 `/auth`（兼容入口…）" |
| `WORKSPACE.md` | 28 | "Provider onboarding and selection via `/auth`" |

复现：`grep -rn "/auth" INSTALL.md USAGE_MANUAL.md WORKSPACE.md`。
`slashRouter.test.ts` 已断言 `/auth status` 为 unknown，**照文档操作必然失败**。
`USAGE_MANUAL.md` 该节还写着"建议逐步迁移到 `/connect`"——迁移已完成，该前提已假。

**处置**：三份文档全部改为 `/connect`。`/connect` 的 `status|set|use|logout` 与旧 `/auth` 子命令**一一对应**（`connectCommandRuntime.ts:86-99`，其中 `set` 走 `addConnectionFromLegacyAuthSet`，参数形状刻意保留）。在 `USAGE_MANUAL.md` 保留一条迁移说明，供仍调用 `/auth set` 的旧脚本参考。

**（2）`provider/response/stream.ts:197` 存在与 `d65c9178` 同形态的深度丢失**（由 `ReviewFreezeRedaction` 发现，主代理复现并修复）

`d65c9178` 修的是 `turn/assistantResponse.ts` 把已冻结的容器交给 `freezeDeep`。复核在**另一处**发现同一形态：

```ts
completedToolCalls: Object.freeze(completedToolCalls),   // ← 冻结了容器
```

`freezeDeep` 对**已冻结的值不再下降**（`core/values/freeze.ts:28-35`），所以数组里的每个 tool call 及其 `arguments` 都没被冻结。实测：

```
array frozen      : true
element frozen    : false   ← 应为 true
element.arguments : false
MUTATION SUCCEEDED -> rm -rf /     ← 可改模型请求的原始参数
```

`normalizeCompletedToolCall`（`stream.ts:224-240`）返回**新建的普通对象**，未被单独冻结，故必然触发。这与 `d65c9178` 修的是**同一类缺陷、同一类成因**，只是发生在另一个文件。

**为何 `d65c9178` 的"68 处均无害"结论不成立**：该结论的前提是"已冻结的子值是新建容器"。此处容器是新建的，但**其元素不是**——`arguments` 承载模型请求的原始参数，属应冻结内容。该声明已被本次复核证伪。

**处置**：改为交给 `freezeDeep` 冻结（附注释说明原因）。修复后实测 `element frozen: true`、`arguments: true`、mutation 抛 `TypeError`。新增回归测试 `stream.test.ts`，**已验证其在修复前失败、修复后通过**。

**同类扫描**：全仓 `freezeDeep` 参数内的 `Object.freeze(标识符)` 共 **18 处**，逐处核查后仅上述 1 处有实质深度丢失。其余分三类：持有原始类型（`string[]`、`boolean[]`）故无深度可丢；元素已由 `.map(Object.freeze({...}))` 或 `sanitizeToolCallCandidate` 单独深冻结；元素仅含原始类型字段（如 `boundary.ts:374` 的 `safeRequestMessages`，字段为 `messageId/source/safeSummary/terminalSuccessClaim`）。

**（3）T10 的测试收窄丢失了两条活断言**（由 `ReviewDeletionsT10T11T12` 发现，主代理复现并修复）

`bfe56b20` 删除 `checkSidebarLivePanelQuality` 时，一并删掉了经由它断言的**两条活不变式**：

| 丢失的断言 | 原实现位置 | 现状 |
|---|---|---|
| 输出宽度 ≤ `budget.maxWidth` | `sidebarLivePanelQuality.ts` 的 `watchOutputBounded` | `sidebarLivePanelRuntime.test.ts` 只留了 `maxLines` |
| next-action 可见 | 同上 `nextActionVisible` | 测试种了 `nextAction`（L98）却从不断言它出现 |

`sidebarPanelLayout.test.ts:81` 的 `maxWidth` 断言**不覆盖此处**——它测的是 `renderSidebarPanel` 且传了显式 budget，不是 `renderSidebarLivePanelFrame` 的活路径。

**处置**：两条断言已按**渲染输出**（消费者实际所见）恢复，并各自注入真实回归验证其有效：`innerWidth = width + 30` 触发宽度断言失败；过滤掉 `next-action` 段触发 next-action 断言失败。
**注意**：单纯放宽 `options.maxWidth` **不会**触发——`renderSidebarPanel` 会把宽度 clamp 到 `panel.budget.maxWidth`，真正能回归的是 inner-width 路径。

#### 复核未发现问题的部分（补 `bfe56b20` 与 `4a65ddf3` 的实测）

- **`bfe56b20`（T12/T10/T11 删除）**：三项删除均有**活轨接管**，非仅凭"不可达"：
  T12 → `browserCommandRuntime` → `commandRunner`；T10 → `sidebarCommandRuntime` →
  `projectSidebarState`/panel/live runtime + 事件适配器；T11 → sessions 走 `runResumeCommand`，
  agent-mode 走 Shift+Tab → `InteractiveMode.cycleAgentMode`。
  测试计数实测：父提交 114 文件/458 测试 → 目标 112 文件/452 测试，**恰为删掉的 2 文件/6 测试**。
  两个被删的自测（`sidebarEventBridge.test.ts`、`sidebarStateQuality.test.ts`）确只覆盖被删模块。
  `WorkflowTaskPlan.browserPlan` 全仓仅其声明处出现一次，确认从未被赋值或读取。
  **例外**：T10 的测试收窄丢失两条活断言，见上文（3）。
- **`4a65ddf3`（T8/T9/T13）**：三份 `renderProjectedLines` 旧实现逐字等价（现归属
  `cli/output/projectedLineRenderer.ts`）；两份 `parseArgsWithFlags` 语义一致（仅空白/导出差异），
  且 `--flag=value`、`--flag value`、未知 flag、空输入四种行为均一致，`./connect/preset.js`
  的导入**未引入环**。T13 实测：父提交 100 条目/99 唯一（`/memory` 重复两次）→ 目标 99/99。
  `.gitignore` 仅新增注释与 `.omp/`，**无任何原被跟踪路径转为被忽略**。
  `.normproof/dispositions.md` 父→子 77 行未变，append-only 完整。

**复核正式结论**：`ReviewDeletionsT10T11T12` 以 `overall_correctness=incorrect`、confidence 0.98 结案，
两条 P2 分别锚定 `sidebarLivePanelRuntime.test.ts:109-116`（宽度）与 `:98-116`（next-action）。
主代理在**该两处行区间**确认已恢复，且各自注入真实回归验证有效。同时该复核确认
`bfe56b20` 正确保留了 T12 browser 活轨、T10 sidebar runtime/event-store 活轨、T11 session/agent-mode 活轨，
以及 view-mode **状态**（`getViewMode` 仍被 `cliApprovalModule` 读取），仅将**未注册**的 `/view` 命令链留作休眠。

**复核内部存在分歧（如实记录）**：`ReviewDeletionsT10T11T12` 判 `overall_correctness=incorrect`（两条 P2）；
其下属 `CoverageScout` 独立复查后**反对**，认为宽度/next-action 由共享的 renderer/panel 测试覆盖，非行为断裂。
**主代理裁决：采纳 P2**。依据是主代理自己注入真实回归的实测——`innerWidth = width + 30` 与移除
`next-action` 段**各自触发断言失败**，证明这两条不变式此前确实无人守护；且 `sidebarPanelLayout.test.ts:81`
走的是 `renderSidebarPanel` + 显式 budget，不覆盖 `renderSidebarLivePanelFrame` 的活路径。

#### 记录但不修复（1 项）

`isPrivateNetworkHost` 不覆盖 `fd00:ec2::254`（AWS 的 **IPv6 元数据地址**，等价于 `169.254.169.254`）。原注释列了 IPv6 链路本地、CGNAT、`0.0.0.0`、DNS rebinding，**唯独漏了这一条**——而它恰是本次修复所针对的元数据端点。已补入注释，并注明"调用方不应单独依赖此防线"。**不扩大修复范围**：覆盖它需要解析 IPv6 网段，超出本次修复的授权范围。

#### 复核未发现问题的部分

- 五组重复实现收口（`80ad3616`）：逐组比对语义等价，**未发现缺陷**。`isRecord` 新旧实现 16 个取值一致（含 `null`/`NaN`/`Object.create(null)`/类实例）；脱敏器在短串/恰好 280/多字节边界一致。
- SSRF 修复（`26a76eba`）：经**两个真实入口**（`publicReadOnlyWebPolicy`、`networkEgressGuard`）复现，`169.254.169.254` 拦截、`example.com` 放行。全仓独立私有网络判断仅剩 `runtime/core/manifest.ts:207`，为**白名单**（只放行回环、拦截其余），极性与 SSRF 相反，非漏洞。
- `d65c9178` 的冻结修复与脱敏合并：冻结 before/after 探针复现（父提交 `candidate:false`、`8c5f47c7^` 为 `true`）；`redactReportText` 截断语义与三份原实现一致（`slice(0,maxLength)+"..."`，非更整洁的 `slice(0,maxLength-3)`）。
- 门禁 `verify-docs-and-rules-drift.mjs` 新检测：strict 通过，且对 `` `test/artifact-workflow.mjs` `` 这类工作区相对路径**不误报**。

### 9.27 结构防护面实测（2026-09-20）：门禁存在，但大多不阻断

**问题**：重构收口后，如何防止后续开发重新破坏这些结构？本章不回答"应该怎么做"，
只记录**实测到的现状**——因为未经实测的建议不可靠。

#### 实测方法

向工作区**注入真实违规**，逐门禁观察退出码与报告。每次注入后立即还原，`git status` 干净。

| 门禁 | 检出违规 | 退出码 | 能否阻断 |
|---|---|---|---|
| `npm run verify:import-cycles` | ✅ 检出真实环 | **1** | ✅ **能** |
| `npm run verify:docs-drift:strict` | ✅ 检出悬空引用 | **1** | ✅ **能** |
| `npm run test:ts` | ✅ | **1** | ✅ **能** |
| `npm run analyze:module-facades` | ✅ 3→4 越界模块 | **0** | ❌ 仅告警 |
| `normproof judge` | ✅ 检出 | **0 或 2** | ⚠️ **视义务等级**（见下） |

**更正（同日实测补充）**：judge 的退出码**并非恒为 0**——它取决于命中的是 blocking 还是 advisory 义务：

| 注入的违规 | judge exit | `wouldBlock` |
|---|---|---|
| 环（`source_graph_is_acyclic`，**advisory**） | **0** | false |
| 函数超限（**advisory**） | **0** | false |
| **无法解析的导入**（**blocking**） | **2** | **true** |

即 judge 对唯一那条 blocking 义务**是会阻断的**，这也是 `ci.yml` 里该步骤长期绿色的原因——
它并非"永不失败"，只是**只对一条义务失败**。

实测命令示例（注入两个模块互指的真实环）：

```bash
# core/values/freeze.ts → presentation/sidebar/sidebarStateProjection.ts，且反向
node scripts/check-import-cycles.mjs   # exit 1，报告 1 个 runtime cycle
npx normproof judge                     # exit 0，wouldBlock=false
```

#### 关键缺口 1：CI 不跑那两个**能阻断**的架构门禁

`.github/workflows/ci.yml` 实际只跑三步：`build:ts`、`test:ts`、`normproof judge`。
**不含** `verify:import-cycles`、`verify:docs-drift:strict`、`analyze:module-facades`、`verify:cli-entry`。

后果：**一个真实的循环依赖今天可以被推入 `main` 且 CI 全绿**——因为唯一跑架构的门禁
（`normproof judge`）处于 shadow 模式永不阻断，而真正会 exit 1 的 `verify:import-cycles` 根本没被 CI 调用。

#### 关键缺口 2：NormProof 把最重要的两条义务定为 advisory

`.normproof/norm-packs/software-structure-v0/profile.json` 的三条义务等级：

| 义务 | severity |
|---|---|
| `source_graph_is_acyclic`（无循环依赖） | **advisory** |
| `declared_functions_within_module_ceiling`（函数上限 20） | **advisory** |
| `source_graph_has_no_unresolved_specifiers`（导入必须可解析） | blocking |

即：即便把 judge 从 shadow 切到 enforcing，**环与函数超限仍不会阻断**——只有"导入无法解析"会。
而这恰是 §9 全程最在意的两条结构约束。

`.github/workflows/normproof-watch.yml` 亦自述为"observation instrument, not a release gate"，
且 `exit 0 # Observation mode: record, never gate`。

#### 关键缺口 3：§1 的计数会持续漂移，且无机器校验

§1 的计数表**本轮已第二次漂移**：记录值 2739，实测 2740——原因是本轮修复新增了一个回归测试。
文件数（939/771/168）经复核未变。

根因：该表是手写同步，没有任何门禁校验"文档记载的数字 == 实跑得到的数字"。
`verify-docs-drift` 只校验**路径引用**能否解析，不校验**计数**。

#### 关键缺口 4：`verify:import-cycles` **不检查导入是否可解析**

该脚本名字暗示它覆盖 AGENTS.md 的规则 2，实则**只查环**：第 44-56 行对无法解析的说明符
**静默返回 `null`**，环路计算直接跳过。

实测：向 `core/values/freeze.ts` 注入 `import { nope } from "./does-not-exist.js"`，
`npm run verify:import-cycles` 仍输出 `[pass] no-dependency-cycles`，**exit 0**。

好在 `normproof judge` 的 blocking 义务 `source_graph_has_no_unresolved_specifiers` **确实抓住了它**
（exit 2）。所以此缺口**当前由 CI 中的 judge 步骤兜住**，但依赖关系脆弱：
一旦 judge 被摘除或被调成 advisory，可解析性就完全失守。
**建议**（未实施）：给 `check-import-cycles.mjs` 增加 unresolved 报告，使两个门禁职责不重叠也不留缝。

#### 未发现问题

`docs-drift --strict` 与 `import-cycles` 耗时分别为 **171 ms / 270 ms**，
`module-facades` 391 ms——三者合计 **< 1 秒**，相对 `test:ts` 的 ~187 秒可忽略。
即"把门禁接进 CI"的成本障碍接近于零。
