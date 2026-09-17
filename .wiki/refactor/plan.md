---
title: "Architecture Refactor Plan"
category: article
sources: [repo-audit-2026-09-15, tsc-baseline-2026-09-15, vitest-baseline-2026-09-15, failures-baseline, reachability-audit-2026-09-15, subagent-reviews-2026-09-15]
created: 2026-09-15
updated: 2026-09-17
tags: [refactor, architecture, plan]
summary: "Module boundary refactor plan v4。删除授权依据已从\"可达性\"改为\"是否已有实现的一部分\"（§10）。v3 记录：删除路线在执行 Step 2.6 时被证伪，前三轮删除造成 12 项真实破坏；Step 2.7 修正该错误。当前生产 958 / CLI 可达 873 / 不可达 85。"
confidence: high
---

# Architecture Refactor Plan (v4)

> 本目录（`.wiki/refactor/`）是整个模块边界重构计划的唯一记录位置。
> v4 (2026-09-17) 方向重定：删除授权依据改为"是否已有实现的一部分"，见 §10。
> v3 (2026-09-17) 新增 Step 2.7（修正前序删除造成的破坏）与阶段顺序重排：原删除路线被证伪，详见 §9。
> v2 (2026-09-15 晚) 基于"生产可达性 BFS + 三子代理语义复核"全面修正 v1。
> v1 的热点数据（browser 坟场、orchestration 平铺、SessionManager facade、命名税）经复核全部成立，但 v1 缺失了最大的事实：**全仓 24% 的生产文件不在任何运行时可达路径上**。

## 0. 生产可达性审计（v2 新增；**v3 注：本节数值已过时，仅存作方法记录**）

> **过时警告**：本节测得的 1366 文件 / 333 死链 / 24% 是 2026-09-15 的快照。
> 当前状态为**生产 965 / CLI 可达 873 / 不可达 92**（见 `deleted-audit-2026-09-16.md`）。
> 更重要的是：**本文档的删除判据已被证伪**（见 §9）。可达性只用于分析，不授权删除。
> 保留本节仅因其方法（BFS 边定义、假阴性来源排除）仍有参考价值。

方法：从真实入口（`src/entrypoints/*` 26 文件 + `scripts/` 下被 package.json 注册的 ts/mjs 脚本）做 BFS，边 = 静态 `from` + 动态 `import()` + verify-route206 字符串 import 特例。已排除的假阴性来源：worker_threads（零使用）、globalThis 注入（零使用）、createRequire/new Function 动态加载（仅外部包 playwright/playwright-core）、MCP/skills/extensions 加载器（只扫 .md 不加载 TS）、child_process（只拉起外部二进制或入口自身）。

| 指标 | 数值 |
|---|---|
| 生产源文件总数 | 1366 |
| CLI 入口可达 | 871 |
| scripts 入口额外救回 | 162 |
| **最终死链（CLI+scripts 均不可达）** | **333（24%）** |
| 其中完全无生产文本引用（纯孤儿） | 152 |
| 被其他死链互引 | 181 |

模块死链率（死/总）：edit 53% (49/91)、planning 60% (14/23)、model-adapters 58% (7/12)、verification 47%、repair 50%、runtime 34%、context 35%、orchestration 29% (66/225，其中根目录 58/186)、session 26%、core 15%、presentation 14%。

**关键单点结论：**

1. **生产内核三层结构**（HotspotRevaluer 确认）：`entrypoints(26全活) → cli/interactive+cli/runtime+core/shell → turn/(15全活, 不 import orchestration) + core/agent + core/query + core/commands + session/ + model-adapters(仅 types+jsonRepair 活)`；另有 `src/index.ts` 公共 API 层拉活 runtime/api/host、runtime/evaluation、planning/execution 等旁路。
2. **orchestration 54 个 CLI 活文件经三条旁路悬吊**（context/acquisition 链、presentation/surface 链、planning/workflowTaskPlan 链——注意最后这条的源头 workflowTaskPlan.ts 本身是死链，见 §1 R4），**不被 turn 内核直接消费**。
3. **162 个"死链"被 scripts/dev-history/routes/*.ts（30 个 route 演示脚本）与 real-provider-smokes 脚本救回**——它们是历史开发验证脚本，是否废弃是独立裁决（见 §3 新增 Step 2.5 的裁决点）。
4. **browser 坟场 167 文件中 160 个真实存活**，挂在 `/browser` 命令链（core/commands/registry.ts:84-88）+ CLI 桥（entrypoints/cliCommandExecutionBridge.ts 直引 6 个 browser 模块）+ eval benchmark 链上。v1 的搬迁判断被二次确认且加强。
5. **core/harness 38 个死链中 34 个是测试基建**（README 自我声明 dev/eval harness surface，34 个仅被 *.test.ts 引用）——不删，但从生产文件分母剔除。
6. **model-adapters 名存实亡**：仅 types.ts（被 provider/request、provider/response、runtime/loop 引用）与 jsonRepair.ts（被 turn/step.ts 引用）存活，二者互不依赖域内其他文件。处置：types.ts 并入 provider/request/，jsonRepair.ts 并入 turn/ 或 core/，其余 7 文件+测试删除。
7. **SessionManager.ts 确认 ALIVE**，52 函数 facade 拆分（v1 热点 3）仍然有效。

## 1. Step 1 —— 全量测试基线与问题分类（已完成；v2 修订失败簇裁决，v3 确认结论已执行）

> **v3 状态**：本节 57 项失败的裁决已全部执行完毕（见 §3 的 Step 2 条目）。
> 其中 R4 的处置（删 seed 断言）即 `capability-backlog.md` 的 CB-001；
> 后续 CB-002 已删、CB-003 已实现、CB-004 已修复。当前稳定失败 **0**。

非失败基线（不变）：tsc build 门控 0 错；tsc 全量 539 错全在测试文件；golden gate / cargo / validate 通过；pytest 环境不可用 [environment]。

57 项失败的 **v2 最终裁决**（三子代理逐项复核，推翻了 v1 的 4 处定性）：

| 簇 | 项数 | v1 分类 | **v2 裁决** | 关键证据 |
|---|---|---|---|---|
| R1 rust-bridge 8 | 11→拆分 | real-defect | **死轨断言混入活轨测试**：registry-rust-bridge 直测活轨 registry 但断言 `details.executionReceipt/reportSafe/runtimeReceipt`——这些字段的生产者（tools/result/split、tools/dispatch、ToolRuntime）全是死轨，活轨 toolResultLifecycle 只产 `{success,output,metadata}`。且活轨末端 `turn/tools.ts:99-108` 把结果压扁为 `{output,isError}`，metadata 根本不透传给模型 | toolResultLifecycle.ts；turn/tools.ts:106 |
| R1 runtime.test 3 | | real-defect | **死轨测试**（import ToolRuntime） | runtime.test.ts:7 |
| R1 活轨透传 | | 修法方向 | **真缺陷但降级**：registry runCommandTool 丢 executionPath/errorClass 属实，但修了也只影响直调 registry 的消费者（如 contextCommandRuntime），不影响模型可见输出 | registry.ts:147-165 |
| R2 MCP 桩 | 16 | real-defect 产品级 | **v1 定性错误，降级为死轨测试**：生产 CLI `cliRuntimeInvocation.ts:148` 无参调 `createCoreToolRegistry()`，全仓唯一带 mcpTools/mcpGateway options 的调用点是死轨 ToolRuntime。**MCP 工具在生产 CLI 中根本不注册——不是"假成功"而是"不存在"**。占位桩 registry.ts:559-568 只有死轨经过 | cliRuntimeInvocation.ts:148；runtime.ts:50 |
| R3 rollback | 5 | contract-conflict 需裁决 | **裁决降级**：被测对象 targetSetEditRoute/editProposalApply 不在 CLI 链上，仅被 route 演示脚本引用。若废弃 demo 脚本（§3 裁决点 B），R3 五项+整簇自然消解，无需语义裁决 | 调用链 BFS |
| R4 seed | 9 | real-defect 投影未同步 | **v1 定性错误**：`seed=action-result` 唯一生产者链 planning/workflowTaskPlan.ts（零 importer 纯孤儿）→ runtimeHandoffProjection.ts。活轨 turn/projection.ts:122 只写 `notes:['steps: N']`，**从未产生过 seed 行**。"恢复注入"= 把死轨能力移植进活轨，是 feature work 非缺陷修复。处置：删 seed 断言 | workflowTaskPlan.ts 零引用；projection.ts:122 |
| R5 | 5 | known-gap/env | 维持（2 活轨漂移 + 3 环境依赖） | |
| R6 | 7 | test-infra | 维持 + 注记：**死轨 harness 驱动活 CLI 子进程**（agentCliProcess spawn 的是真 cli.tsx）；若删 harness 则 5 个场景测试文件同删 | agentCliProcess.ts:51-68 |
| R7 | 6 | real-defect | **全部为活轨测试锁旧语义，修测试**：(1) handoff 投影 `from->to:reason` 后缀是有意变更（state.ts:370）；(2) verbose 渲染 `[tool: bash]` 替代 `[tool:start] bash`（sessionEventSurface.ts:95）；(3) approvalTrustPolicy `expected undefined` 已查明——生产有意从 process-scope 收紧为 exact-command-scope（approval/store.ts:55 注释明示防通配提权），实现正常 | store.ts:55-57 |

**真正需要修活轨生产代码的只剩 1 处**：registry runCommandTool metadata 透传（低优先级）。其余 51 项失败要么是死轨测试（删/重定向）、要么是测试锁旧语义（改测试）、要么环境问题。

## 2. v1 热点数据复核结果

| v1 热点 | 复核结果 |
|---|---|
| 热点 1 browser 坟场（core/context 167 文件） | **成立且加强**：160/167 存活；外部引用面窄（10 文件）不变；import 重写预算 606 条不变。7 个死 browser 文件搬迁前删除。搬迁映射表（14 子域）不变 |
| 热点 2 orchestration 平铺（186 文件） | **重算**：CLI 死 58，scripts 救回占大头；"186 聚类"应改为"活文件聚类"（规模取决于 §3 裁决点 B）。聚类映射表必须等死链删除完成后再生成 |
| 热点 3 SessionManager facade | 成立（ALIVE，52 函数） |
| 热点 4 命名税 | 成立；死链删除后决策干扰更小 |

## 3. 阶段规划 v3（每阶段执行前补充入口标准）

**两个前置裁决点：已采纳并执行。**

- **裁决点 A**：废弃 30 个 `scripts/dev-history/routes/*.ts` 历史演示脚本及相关 route/demo 包装器；保留仍被 `scripts/verify/index.mjs` 使用的 `scripts/real-provider-smokes/approvedProviderEnv.mjs` 与其测试。共删除 42 个脚本/脚本文档文件，移除 package.json 中 68 条相关 script 注册。生产 CLI 与主测试入口不依赖这些脚本。
- **裁决点 B**：R3 atomic-rollback vs partial-failure 不再单独裁决；相关目标链随历史 demo 链进入死链审计。

- **Step 1（已完成）**：基线 + 分类（v2 修订版见 §1）。failures-baseline.md 同步修订。
- **Step 2.5-A（已完成）**：删除历史 route/demo 脚本及注册项。`npm run build:ts`、`npm run validate` 通过；删除后的全量 vitest 为 4450 项、51 失败、14 文件。初始基线为 4444 项/57 失败；失败减少 6，但新增 `deepResearch.test.ts` 1 项且测试总数增加 6。由于工作区存在用户已有源文件改动，且全量并行测试存在超时抖动，本轮不宣称零回归。
- **Step 2.5-B（已完成）**：重新从 `packages/ts-shell/src/entrypoints/*` 做 CLI-only BFS，纳入静态 `from` 与动态 `import()`，排除测试文件。结果：1366 个生产源文件，871 个 CLI 可达，495 个 CLI 不可达；其中 450 个生产删除候选、45 个测试基建豁免。精确清单写入 `cli-only-delete-candidates.md`，完整可达清单写入 `reachability-2026-09-15.json`。本步只生成清单，未删除任何 `src` 文件。
- **Step 2.5-C-1（已完成）**：删除首个最小孤儿簇——`src/product/{edit,evidence,providerProposal,repair,verification}/*Facade.ts` 五个仅有单行 re-export、无源码/测试/公共入口引用的 facade。删除前后 CLI 可达集合保持 871 个文件不变；生产源文件从 1366 降至 1361，CLI-only 死链从 495 降至 490。`npm run build:ts`、`npm run validate`、`src/repair/iteration/projection.test.ts`（6/6）通过。没有删除 core/harness 或 test-utils。
- **Step 2.5-C-2（已中止）**：`model-adapters` 整域删除被复核阻止——其 7 文件位于 310 文件主簇内部，单独摘除破坏簇内依赖。误删已恢复，未产生源码变化。
- **Step 2.5-C-3（已完成）**：主簇整簇删除 573 文件（310 生产 + 254 测试 + 9 断链测试基建）。生产源文件 1361 → 1045，CLI 可达保持 871 不变（零误删），全量测试 4450/51 失败 → 3179/30 失败。详见 `baseline-after-main-cluster-deletion.md`。
- **现状重算（已完成）**：CLI 不可达从 490 降至 174（零引用 92 + 仅测试 77 + 仅公共 API 5），不再存在大型连体簇（最大分量 9）。浏览器域搬迁面重算见 `recompute-2026-09-16.md`。**顺序偏差已记录**：Step 3 原定"先删 7 个死 browser 文件"，实际由主簇删除连带删除 12 个，删除有证据支撑但时机早于 Step 2。
- **Step 2（已完成，2026-09-16）**：基线回绿。30 项失败按裁决处置：删 CB-002（4 项 real-provider）、收窄 CB-001（10 项 seed 断言）、修活轨 metadata 透传（`core/tools/registry.ts` 透传 `executionPath`/`errorClass`）、收敛 `detectCommand` allowlist、改 6 项锁旧语义的测试。失败数 30 → 15 → 1（CB-003）→ **0**。同期修复两项生产缺陷：CB-004 审批拒绝后回合误报成功（`turn/projection.ts` 新增被拒终态判定）、TUI 审批面板失联（`cliProcessRunner` 的 `promptInteractiveApproval` 求值时机）。最终基线：3173 项 / 稳定失败 0。详见 `baseline-after-step2.md`。

---

- **Step 2.6（已完成删除部分，剩余范围冻结）**：原定"删除 92 个零引用文件中的孤立簇"。
  实际执行删除 82 个（1 个误删 `session/__tests__/longSessionDurabilityProcess.ts` 已回退；
  它由测试以字符串路径 spawn 启动，import 图不可见）。删除前后 `cliReachable` 保持 871 → 873 不变，
  `production` 1045 → 963，`noReference` 92 → 10。
  **但该步的判据已被 Step 2.7 证明不足**：删除集中已有高价值能力（如
  `edit/patch/plan/{validator,operation}.ts`、`context/graph/*`）。
  剩余 92 个不可达文件在 Step 2.7 完成前不动。详见 `step-2.6-plan.md`。
### Step 2.7 —— 修正前序删除造成的破坏（**阻塞 Step 3 及其后所有步骤**）

> **为什么需要这一步。** Step 2.6 原本被定义为"可选、纯机械"的删死码步骤。
> 执行到一半（已删 82 个文件）时，对不可达文件做功能价值审查，发现**前提本身是错的**：
> 可达性 BFS 只能回答"当前入口是否连上"，不能回答"是否有价值"。
> 前三轮删除（`0e875e37` 5 + `7a59ab23` 573 + `42d63bd7` 82 = 660 个文件，
> 其中生产文件 403）**从未做过功能价值审查**，已确认造成 **12 项真实破坏**。
> 详见 `deleted-audit-2026-09-16.md`、`restore-audit-2026-09-16.md`。

**方向：从"按可达性删除"反转为"按价值保护"。** 在完成本法之前，不得恢复任何删除动作。

**目标（按优先级）：**

1. **修复已有破坏**（12 项，见 §9 清单）。其中 3 项为待修的高优先级：
   - `verify:edit-capability-closeout` 假阳性——98 个测试路径中 75 个已不存在，
     vitest 对缺失路径不报错，脚本仍打印全部 marker 并 `exit 0`。**它让验证失效**。
   - `provenance.toolExecutions` / `approvalDecisions`——5 个 CLI 可达读取者、零写入者（含二级断链）。
   - OpenAI account-auth——`/connect login openai --account` 可存储并显示 connected，
     但活轨 `step.ts` 只发 `Bearer ${apiKey}`（account-auth 下为 `undefined`），对话必然失败。
2. **补齐审查**：403 个已删文件的逐文件价值判定已完成（100% 覆盖，
   原始表存 `.wiki/refactor/audit-raw/*.json`）；**尚未对 `7a59ab23` 同时删除的 257 个测试文件做同等审查**——
   它们是被删能力的证据，需一并核验。
3. **裁决未接线能力**：10 项高价值候选（终态真实性判据、任务相关验证阶梯、
   target-set 子集批回滚、provider 原始输出解析、重试/退避/降级、taskLifecycle 编排层、
   AST 代码图谱、LSP 自修复循环、跨文件 repair、Swarm 分发）。逐项登记输入输出、
   现有替代、接线成本，由维护者决定恢复顺序。
4. **建立删除前置检查**，写入流程（已固化在 `handoff-2026-09-17.md` §4.2/§4.6/§4.7）：
   功能读审 → 等价实现**核验**（不采信推理）→ 消费者存活检查 → 动态入口检查
   （`path.join` + `spawn`/`import()`、`*Process.ts`）→ 公共面检查 → `scripts/` 引用检查。
   断链须区分**三类**：引用型（`tsc` 可发现）、契约型（活轨读、无人写）、
   半孤儿（在可达集内但无调用者）。
5. **冻结剩余删除范围**：原计划"92 个零引用孤立簇"（Step 2.6 余量）的结论已过时
   （实测 174 不可达 = 83 纯死簇 + 5 仅公共 API + 77 仅测试 + 9 孤儿；
   且已删 82 个中有 1 个误删已回退）。**在 Step 2.7 完成前，不再删除任何文件。**

**入口标准：** 上述 12 项破坏完成分类（修复/裁决/维持）且 3 项高优先级已处理。

**出口标准：**
- 12 项破坏全部有明确处置（已修 / 已裁决 / 已登记）。
- 全量 vitest 稳定失败 0，`tsc -p tsconfig.build.json` 0 错误。
- `verify:edit-capability-closeout` 不再假阳性（要么真跑、要么明确报告覆盖缺失）。
- 删除前置检查固化进 `handoff-2026-09-17.md`，且 `plan.md` 后续步骤引用它。

**不做什么：** 不按目录批量恢复历史体系。恢复以"活轨消费者存活"或维护者明确裁决为前提。

- **Step 3（browser 搬迁，按重算执行）**：`core/context/` 平铺 128 文件（可达 122）+ `browser/` 子目录 43 文件（可达 41）；先处理 8 个不可达文件，再按 14 子域映射搬迁。
- **Step 4（orchestration 聚类）**：待 Step 2.7 / Step 3 完成后，按存活文件重算映射表。
- **Step 5（SessionManager 拆分）**：不变。
- **Step 6（命名税裁定）**：不变。
- **Step 7（收尾）**：NormProof judge 全量跑；以删除后 BFS 报告作为收敛证据。

## 4. 验证纪律（v3：新增删除前置检查）

- v1 全部保留（tsc build + vitest 基线 diff + golden gate；git mv + 脚本重写；数据只写在命令跑完之后）。
- 新增：**每波删除后重跑 BFS**，存活集与删除前完全一致才算通过——这是对"死链判定模型"本身的回归测试。
- 新增：任何"救活"判定（如未来新增 script 入口）必须同步登记入口清单，防止可达性口径漂移。
- **v3 新增（Step 2.7 固化）：任何删除前必须完成六项检查**——功能读审、
  等价实现核验（不采信推理）、消费者存活检查、动态入口检查（`path.join` +
  `spawn`/`import()`、`*Process.ts`）、公共面检查（`index.ts` 为 package `main`）、
  `scripts/` 引用检查。
- **v3 新增**：断链判定须区分三类——引用型（`tsc` 可发现）、契约型
  （活轨读、无人写）、半孤儿（在可达集内但无调用者）。
  **"在可达集内" ≠ "被调用"。**
- **v3 新增**：验证脚本必须能报告"覆盖缺失"。`scripts/verify-*.mjs` 把测试路径
  列表传给 vitest，vitest 对缺失路径不报错，会导致"覆盖缩水但报通过"。

## 5. 本轮过程教训（保留 v1 记录并追加）

1. v1 教训：基线数据只写在命令跑完之后（预写数据曾含编造项，已删除）。
2. v2 教训：**"测试失败"分类必须带"被测对象是否在生产路径"维度**——v1 的 R2 被定性为"产品级缺陷优先修"，实际生产 CLI 根本不注册 MCP 工具；R1 的修法方向（补 metadata）不能让 8 项测试通过。凡涉及修复排序，先跑可达性再定优先级。

## 6. Step 2.5-C-2 复核记录（2026-09-15）

原拟删除 `model-adapters` 失活适配器子域，但执行前复核发现该结论不可靠：`client.ts` 依赖 `registry.ts`/`retryPolicy.ts`，`registry.ts` 依赖 OpenAI/Anthropic adapters；这些关系说明此前“仅 types/jsonRepair 活跃”的 BFS 结果不能直接作为删除依据。误删候选已恢复，未产生源码变化。`npm run build:ts` 与 `npm run validate` 通过。该子域暂不重构；以后 provider/auth/execution 边界必须同时满足真实入口、脚本入口、显式依赖和 runtime 装配四重证据。

## 7. 边界分析方法与方向修正（2026-09-15，信息收集轮）

新增工具 `scripts/analyze-boundaries.py`：以四重证据（CLI 入口、scripts 入口、包公共 API 闭包、测试引用）为每个生产文件打标签。

测量事实（详见 `boundary-analysis-2026-09-15.md`）：

- 生产源文件 1361：CLI 可达 871，CLI 不可达 490。
- 490 分解：仅测试引用 339、零引用 146、仅公共 API 5、仅脚本 0。
- 测试基建 45 个（core/harness、test-utils）豁免。
- 公共 API 闭包 246 文件，由 `verify:host-surface` 实测消费，属受门控契约面，永久保护。
- 445 个候选构成 **1 个主簇 310 文件 + 105 个小簇**；主簇与 CLI 活跃集 import 泄漏为 0；簇外非测试引用者 6 个，全部为豁免的测试基建；主簇配套 254 个测试文件。
- `model-adapters` 的 7 个文件全部位于主簇内部；上一轮误判源于把"CLI 不可达"等同于"可删"，忽略簇内依赖。`types.ts`（308 处引用）与 `jsonRepair.ts` CLI 可达。

**方向修正：删除单位从"文件/目录"改为"连通分量整簇"。** 主簇只能整簇评估、整簇删除，不允许部分摘除。删除前的必要条件：CLI 泄漏 0、公共 API 泄漏 0、scripts 泄漏 0、簇外非测试引用仅限豁免区、`npm run build:ts` 与 `verify:host-surface` 通过、BFS 存活集不变。

**待裁决（阻塞下一步）**：主簇 310 文件保留/冻结/删除，三选一（见 boundary-analysis-2026-09-15.md §5）。未裁决前不执行删除。

## 8. Step 2.5-C-3 执行记录：主簇删除（2026-09-16）

用户裁决：选 1（整簇删除）。执行范围与结果：

**已删除 573 个文件：**

| 项 | 数量 |
|---|---:|
| 主簇生产文件 | 310 |
| 主簇对应测试文件 | 254 |
| 断链测试基建（core/harness 的 browserTxn*/pw* 5 个 + 2 个测试） | 7 |
| test-utils/workspaceWriteResumeProducer.ts | 1 |
| 附带断链测试（browserTxnGate/browserToolServerBackend） | 2 |

**安全校验（删除前）：** CLI 可达文件误入删除集 = 0；删除后复核"CLI 可达但文件已删" = 0。

**残留清理：** `tsc -p tsconfig.build.json` 暴露的 11 处断链全部来自豁免区测试基建与 test-utils，已一并清理；`productPath: "runMvpIntegratedFlow"` 悬空字符串因所在文件已随主簇删除而未残留。

**验证结果：**

| 检查 | 结果 |
|---|---|
| `tsc -p tsconfig.build.json` | 0 错误 |
| `npm run build:ts` | 通过 |
| `npm run validate` | 通过 |
| `dist/cli.js --version` | `0.1.0 (ts-shell MVP)` |
| golden gate | 通过 |
| `tsc --noEmit`（含测试） | 251 错误，全在测试文件（原 539） |
| 全量 vitest | 3179 项 / 30 失败 / 6 文件（原 4450 / 51 / 14） |

新基线固化于 `baseline-after-main-cluster-deletion.md`。随删除消失的失败 21 项；剩余 30 项中，**唯一需要修生产代码的是 registry metadata 透传（8 项）**，其余为测试锁旧语义或环境依赖。

**净效果：** 生产源文件 1361 → 1043；CLI 不可达从 490 降至 190 左右（待重算确认）。

**v3 补充（2026-09-17）：本步的删除判据已被证伪。** 该批 573 个文件（生产 310）
中已确认含未接线的高价值能力，并造成 12 项真实破坏（§9）。
本步的"零误删"结论**仅对 CLI 可达集成立**（871 保持 871），
不等于"未破坏活轨功能"——破坏发生在契约层，`tsc` 与可达性 BFS 都看不见。
后续任何同类删除须先满足 §4 的六项前置检查。


## 9. 删除路线被证伪的记录（2026-09-17，v3 新增）

本节记录一个方向级错误及其证据，供后续步骤参照。**不是复盘文，是约束来源。**

### 9.1 被证伪的命题

v2 全篇建立在一个命题上：

> 生产源文件中"CLI + scripts 均不可达"的部分（原测 333/1366 = 24%）是可删除的死链。

该命题**只对一半**：可达性 BFS 能回答"当前入口是否连上"，**不能回答"是否有价值"**。
前三轮删除（`0e875e37` 5 + `7a59ab23` 573 + `42d63bd7` 82 = 660 文件，生产 403）
从未做功能价值审查，已确认造成 **12 项真实破坏**。

### 9.2 12 项真实破坏

| # | 类型 | 内容 | 状态 |
|---|---|---|---|
| 1 | 契约型 | 写路径丢失 `O_NOFOLLOW` / `fstat` / `/proc/self/fd` 描述符复验 | ✅ 已恢复接线 |
| 2 | 契约型 | `/undo` / `/restore` 读取的快照目录无人写入（恒报 `Nothing to undo`） | ✅ 已恢复接线 |
| 3 | 契约型 | `provenance.toolExecutions` / `approvalDecisions`：5 个 CLI 可达读取者、零写入者；二级断链（兜底 evidence 写入者亦删） | ⚠️ 待修 |
| 4 | 契约型 | `disabledTools` / `hiddenToolPrefixes` 用户可配置，唯一执行者 `prefilter.ts` 已删 → 设置被静默忽略 | ⚠️ 待修 |
| 5 | 能力级 | OpenAI account-auth 可存储并显示 connected，但活轨只发 `Bearer ${apiKey}` → 对话必然失败；codex 端点知识仅在已删的 `normalize.ts` | ⚠️ 待修 |
| 6 | 契约型 | `planning/handoff/mutation.ts` 产出 `executionLane` 指向已删的 `fencedEditRoute` / `targetSetEditRoute` | ⚠️ 待裁决 |
| 7 | 契约型 | 证据标签正则仍识别已删生产者（`anchored-*` / `provider-smoke-*` / `real-task-loop-*`） | ⚠️ 待裁决 |
| 8 | 契约型 | `pwStatus.ts:16` 输出 `Eval mode: available-via-pwEval`，生产者已删 | ⚠️ 待修 |
| 9 | 契约型 | `capabilityBoundaryProjection.ts:14-20` focused-test 白名单含 2 个不存在路径（删除前既有） | ⚠️ 待修 |
| 10 | 脚本 | 5 个 `verify:real-user-capabilities:*` `MODULE_NOT_FOUND` | ⚠️ 待修 |
| 11 | 脚本 | `verify:edit-capability-closeout` **假阳性**（98 项中 75 项不存在仍 `exit 0`） | ⚠️ **必须修** |
| 12 | 脚本 | `verify:browser-txn-gate` 14/14 目标全缺 | ⚠️ 待裁决 |

### 9.3 为什么 Build 一直全绿

`tsc -p tsconfig.build.json` 零 `Cannot find module` ⇒ 不存在未解析 import。
**因此任何删除都不会造成编译错误。** 编译通过从来不是删除安全的证据。

断链实际有三类，检测手段各不相同：

| 类别 | 表现 | 检测 | 本项目实例 |
|---|---|---|---|
| 引用型 | import 不存在的模块 | `tsc` / import 图 | **零**（403 文件全扫过） |
| **契约型** | 活轨读某个字段/标记，无人写 | 对被读字段反查写入点 | `provenance.toolExecutions`、`/undo` 快照、浏览器前缀 |
| **半孤儿** | 在可达集内但无调用者 | 对导出函数反查调用点 | `core/context/browserAgent.ts` |

**"在 CLI 可达集内" ≠ "被调用"**：可达性只说明被 import 链拉进来（例如仅被 `import type` 引用）。

### 9.4 另有 import 图看不见的入口

- **字符串路径启动**：`path.join(...)` + `spawn` / `execFile`。实例
  `session/__tests__/longSessionDurabilityProcess.ts`（Step 2.6 因此误删，已回退）。
- **脚本动态 import**：`scripts/verify/index.mjs` 用 `pathToFileURL` 引用 6 个已删模块。
- **验证脚本的目标列表**：`scripts/verify-*.mjs` 列出测试路径传给 vitest；
  vitest 对缺失路径不报错，导致"覆盖缩水但报通过"。

### 9.5 审查覆盖率

403 个已删生产文件**已 100% 逐文件判定**，原始表存 `.wiki/refactor/audit-raw/*.json`
（R1_PatchRoute 26 / R2_EditChain 57 / R3_OrchRest 71 / R4_Browser 16 / R5_CoreAdapters 30
+ 此前 G2 68 / G4 48 / Step2.6 82 / facade 5）。

**尚未审查**：`7a59ab23` 同时删除的 257 个测试文件。它们是被删能力的证据
（例如 `editCapabilityReadiness.ts` 的 11 行 `default-ready-candidate` 中有 10 行
引用的实现已在本批删除，其测试也被删）。需在 Step 2.7 内一并核验。

### 9.6 方法论修正（已固化）

1. **可达性 ≠ 价值**。`cli:false` 只说明"当前入口没连上"。
2. **不采信"已有替代"的推理，必须核验**。反面教材：165 行的 `editEngine.ts`
   曾被当作 2439 行补丁链的"替代"，规模差 15 倍，当时未做此对比。
3. **消费者存活 + 生产者被删 = 断链，不是裁剪**。这是最危险的形态。
4. **删除前须查**：功能读审、等价核验、消费者存活、动态入口（字符串路径 /
   `*Process.ts`）、公共面（`index.ts` 是 package `main`）、`scripts/` 引用。
5. **恢复文件 ≠ 恢复能力**。判据：`analyze-boundaries.py` 的 `cli` 字段由 `false` 变 `true`。
6. **删除单元取连通分量整簇**，不按单文件摘除（`model-adapters` 先例）。
7. 流程要求：**先完成审查、台账成型，再集中修复**；不要边审边修。
8. 读子代理结果必须取 `yield` 的 payload，不能只看对话文本（曾因此误报覆盖率为 50%，
   实际 100%）。

### 9.7 已判定无需恢复

- **`apply_patch` 解析/验证/应用路线**（`patchParsing/*`、`patchVerification/*`、
  `patchApplication/*`、`patchContract/*`、`edit/patch/plan/*`）：
  删除前后 CLI 工具面均为 `read/write/edit/glob/bash`，从未注册 `apply_patch`；
  活轨 3 文件明文拒绝该输入形态（`do not pass unified diff or apply_patch syntax`）。
  属**被有意废弃的路线**，非误删。26 个文件的独立审查确认为零断链。
- **纯 re-export shim / 活轨已内联归并的模块**：可维持删除。
- **`sessionContinuationProjection.ts:57-60` 的 browser 前缀**：**非断链**——
  是压缩保序白名单，不是功能消费者。

### 9.8 未接线但高价值（待裁决，不得按目录批量恢复）

| 序 | 能力 | 代表文件 |
|---|---|---|
| 1 | 终态真实性判据（把 `verification.failed/blocked/insufficient-evidence` 映射为 stopped） | `core/query/mapping/capabilityClassification.ts`、`terminal/classificationProjection.ts`、`result/terminal/queryTerminalTruth.ts` |
| 2 | 任务相关验证阶梯 | `verification/taskRelevantVerificationRoute.ts`（721 行） |
| 3 | target-set 子集批回滚（底座存活，成本低） | `editRecoveryPlan/Apply/Result/Outcome`、`editRollback`、`targetSetEditRecovery` |
| 4 | provider 原始输出解析（输出类型 `ProviderEditRawProposal` **活轨在用**） | `orchestration/patchContract/parser.ts`（672 行） |
| 5 | 重试 / 退避 / 降级（活轨 fallback 明确 `executesFallback: false`） | `model-adapters/retryPolicy.ts`、`client.ts` |
| 6 | taskLifecycle 编排层（底层全活，仅编排被删） | `taskLifecycle{Activation,Handoff,Router}.ts` |
| 7 | AST 代码图谱 | `context/graph/{callGraph,symbolTable,ast/scopeTree,ast/graphRag}.ts` |
| 8 | LSP 自修复循环 | `edit/repair/lspRepairLoop.ts`、`edit/patch/gauntlet/astGauntlet.ts` |
| 9 | 跨文件 repair | `repair/flow/{stage,crossFilePlanning}.ts`、`repair/proposal/*` |
| 10 | Swarm 分发 | `orchestration/swarm/{dispatcher,convergence,types}.ts` |

**注**：第 1 项与已修的 CB-004 同源——CB-004 只补了 8 个分支中的 1 个
（审批拒绝）；活轨 `concludeRun` 至今**完全不看** `verification.status` /
`taskSatisfaction.verdict` / `failedFiles`，即"编辑成功但验证失败"会以 `success` 报出。


## 10. 方向重定（2026-09-17，维护者裁决后）

### 10.1 三条裁决

**裁决 1：放弃"有部分价值但未接入 CLI"的文件。**

不再评估其价值、不再恢复、不再登记 backlog。**但须审查其是否为已有实现的一部分**——
即只有职责**已被活轨某处承担**（重导目标存活、同名声明存在、调用链覆盖）时，
删除才被授权。

**裁决 2：`turn` 与编排层不连通 → 记录，不处理。**

该问题是维护者此前重新编排 `turn` 时留下的既有架构状态，**不是清理造成的破坏**。
记录于 `deleted-audit-2026-09-16.md` 附十，不在本计划内处理。

**裁决 3：删除的授权依据从"可达性"改为"是否已有实现的一部分"。**

### 10.2 新的删除判据

| 旧判据（已废弃） | **新判据** |
|---|---|
| `cli:false` ⇒ 可删 | 职责**已被活轨承担** ⇒ 可删 |
| 可达性 BFS | ① 重导目标存活（shim）② 同名声明存在于活轨（内联归并）③ 调用链覆盖（功能已实现）④ 公共 API 面除外 ⑤ 消费者存活的生产者除外 |

**仍须保护的三类**（不得因 `cli:false` 而删）：

1. **公共 API 面**：`packages/ts-shell/src/index.ts`（package `main`，`verify-host-surface` 实测消费）
   及 `runtime/{distribution,evaluation/task}/*`。
2. **契约型断链的生产者**：活轨有 CLI 可达消费者在读取其数据/标记者（如 `provenance.toolExecutions`）。
3. **动态入口**：`path.join` + `spawn`/`import()` 的字符串路径、`*Process.ts`。

### 10.3 当前状态（2026-09-17）

| 指标 | 值 |
|---|---:|
| 生产文件 | 958 |
| CLI 可达 | 873 |
| CLI 不可达 | 85（仅测试 72 + 仅公共 API 5 + 零引用 8） |
| 全量测试 | 3173 项，稳定失败 0（2 项负载超时，宽超时通过） |

### 10.4 剩余可做项

| 项 | 内容 | 需裁决 |
|---|---|---|
| 1 | 85 个不可达文件（72 仅测试 + 8 零引用） | 其能力价值已按裁决 1 放弃；**删除需连带处理测试**，且需按 10.2 新判据审查 |
| 2 | 两个过期 gate（附六） | `browser-txn-gate` 建议删（服务对象全不存在）；`closeout` 建议收窄。涉及 `package.json` scripts 面 |
| 3 | Step 3 browser 域搬迁 | 原计划待执行；其判据同样受 10.2 影响，需重算 |
| 4 | Step 4 orchestration 聚类 | 待重算 |
| 5 | Step 5/6 SessionManager 拆分、命名税 | 不变 |

**注意**：Step 3 的原判据（"8 个不可达 browser 文件先删"）**已失效**，
须按 10.2 重新审查。
