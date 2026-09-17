---
title: "Architecture Refactor Plan"
category: article
sources: [repo-audit-2026-09-15, tsc-baseline-2026-09-15, vitest-baseline-2026-09-15, failures-baseline, reachability-audit-2026-09-15, subagent-reviews-2026-09-15]
created: 2026-09-15
updated: 2026-09-17
tags: [refactor, architecture, plan]
summary: "Module boundary refactor plan v5。当前生产 958 / CLI 可达 873 / 不可达 85，稳定失败 0。删除授权依据为「职责已被活轨承担」（§2.1），不再使用可达性。§4 记录该判据被证伪的经过与 12 项真实破坏。"
confidence: high
---

# Architecture Refactor Plan (v5)

> `.wiki/refactor/` 是整个模块边界重构计划的唯一记录位置。
> **本文件已重组：现状与规则在前，历史在后。** 阅读顺序：§1 现状 → §2 规则 → §3 后续工作；
> §4 起为约束来源与历史记录，需要追溯时再读。

**版本沿革**：v1 初版 → v2 引入生产可达性 BFS → v3 发现删除路线错误、新增 Step 2.7 →
v4 方向重定（删除依据改为"是否已有实现的一部分"）→ **v5 重组结构**。

---

## 1. 当前状态（2026-09-17）

| 指标 | 值 |
|---|---:|
| 生产文件 | 958 |
| CLI 可达 | 873 |
| CLI 不可达 | 85（仅测试 72 + 仅公共 API 5 + 零引用 8） |
| 全量测试 | 3173 项 |
| 稳定失败 | **0**（偶发 2 项负载超时，宽超时通过） |
| `tsc -p tsconfig.build.json` | 0 错误 |

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

### Step 2.7 执行结果

| 目标 | 状态 |
|---|---|
| 修复 12 项破坏 | 4 项已解决（2 修复 + 2 删除），8 项待处理（§3.1） |
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

### 3.2 Step 3 browser 域搬迁（映射表已重算 — 2026-09-17）

**完整映射表**：`.wiki/refactor/step-3-migration-map.md`

**核心发现**：`core/context/` **不是 browser 域，而是四个域混居**（351 文件）：

| 组 | 文件 | 职责 |
|---|---:|---|
| `browser*` 平铺 + `browser/` 嵌套 + `pw*`/`stealthPreload` | **228** | browser 域 |
| `memory/` | 41 | 项目记忆 |
| `sidebar/` | 34 | 侧栏投影 |
| `compact/` | 29 | 上下文压缩 |
| `startup/` `model/` | 15 | 上下文 |
| `routeContinuityHandoff` / `contextAnalysis` | 4 | 编排域 / 上下文域（错置） |

**耦合**：`browser-flat` ↔ `browser-nested` **双向 195 边** → 是**同一域被拆两层**，
搬迁应**合并**。其余小域间边数 ≤6，可独立处置。

**外部引用面**：448 边 / 124 文件（生产值导入 134 边/40 文件）。
主要来自 `core/harness`（256，其中仅 3 文件 CLI 可达）与 `core/commands`（83）。

**约束**：`core/harness/README.md` 明确"**Do not bulk-move this directory as one
artifact family**"——须分批、保测试。该域**不搬迁**。

**目标结构**：

```
src/browser/（228，合并 receipt/runtime/skill 子目录）
src/memory/（41）
src/presentation/sidebar/（34）
src/context/compact|startup|model/（44）
```

**执行顺序（风险递增）**：3a `model/`+错置文件 → 3b `startup/` → 3c `compact/`
→ 3d `sidebar/` → 3e `memory/` → **3f browser（361 边，最末且分批）**。

**3f 须 PTY 实机验证**（触及 CLI 桥 + `/browser` 命令链）。

### 3.3 Step 4-7

| 步骤 | 内容 | 前置 |
|---|---|---|
| Step 4 | orchestration 聚类 | 待 Step 2.7 / Step 3 后按存活文件重算映射表 |
| Step 5 | SessionManager 拆分（52 函数 facade，确认 ALIVE） | 不变 |
| Step 6 | 命名税裁定 | 不变 |
| Step 7 | 收尾：NormProof judge 全量跑 | 以删除后 BFS 报告作为收敛证据 |

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

完整清单见 §3.1 表（4 项已解决、8 项待处理）。已解决的四项：

| # | 内容 | 处置 |
|---|---|---|
| 1 | **写路径丢失 `O_NOFOLLOW` / `fstat` / `/proc/self/fd` 描述符复验**——活轨 `writeTextFile` 曾是裸 `fs.writeFile`，符号链接可逃逸出工作区 | 恢复 `edit/authority/workspace.ts`（552 行）并接入 `runtime/execution/service.ts` |
| 2 | **`/undo` / `/restore` 读取的快照目录无人写入**——恒报 `Nothing to undo` | 恢复 `orchestration/editSnapshot.ts` 并接线写前快照捕获 |
| 11 | `verify:edit-capability-closeout` 假阳性（98 项中 75 项不存在仍 `exit 0`） | 删除该 gate |
| 12 | `verify:browser-txn-gate` 14/14 目标全缺 | 删除该 gate |

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

> **共性**：以上 1、5、6、7 是同一个错误的不同表现——**用间接证据替代直接证据**
> （可达性代调用链、语义相似代数据通路、文件可达代被调用、测试绿灯代实机）。
> 本项目共出现 5 次。

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

---

## 7. 文档索引

### 本计划相关

| 文件 | 内容 |
|---|---|
| `deleted-audit-2026-09-16.md` | **主文档**：403 个已删文件审查总账 + 附一至附十二 |
| `restore-audit-2026-09-16.md` | 事故认定、三路审查、D 集恢复、补丁层复核 |
| `capability-backlog.md` | 未实现能力登记（CB-001 ~ CB-004） |
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
