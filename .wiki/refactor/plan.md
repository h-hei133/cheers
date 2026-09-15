---
title: "Architecture Refactor Plan"
category: article
sources: [repo-audit-2026-09-15, tsc-baseline-2026-09-15, vitest-baseline-2026-09-15, failures-baseline, reachability-audit-2026-09-15, subagent-reviews-2026-09-15]
created: 2026-09-15
updated: 2026-09-15
tags: [refactor, architecture, plan]
summary: "Module boundary refactor plan v2, revised after three-agent deep re-audit: final dead-link set 333/1366 (24%), 57 failures re-clustered by live/dead track, dead-code removal promoted to top priority, orchestration clustering rescoped to 128 live files."
confidence: high
---

# Architecture Refactor Plan (v2)

> 本目录（`.wiki/refactor/`）是整个模块边界重构计划的唯一记录位置。
> v2 (2026-09-15 晚) 基于"生产可达性 BFS + 三子代理语义复核"全面修正 v1。
> v1 的热点数据（browser 坟场、orchestration 平铺、SessionManager facade、命名税）经复核全部成立，但 v1 缺失了最大的事实：**全仓 24% 的生产文件不在任何运行时可达路径上**。

## 0. 生产可达性审计（v2 新增，最高优先事实）

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

## 1. Step 1 —— 全量测试基线与问题分类（已完成，v2 修订失败簇裁决）

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

## 3. 阶段规划 v2（每阶段执行前补充入口标准）

**两个前置裁决点：已采纳并执行。**

- **裁决点 A**：废弃 30 个 `scripts/dev-history/routes/*.ts` 历史演示脚本及相关 route/demo 包装器；保留仍被 `scripts/verify/index.mjs` 使用的 `scripts/real-provider-smokes/approvedProviderEnv.mjs` 与其测试。共删除 42 个脚本/脚本文档文件，移除 package.json 中 68 条相关 script 注册。生产 CLI 与主测试入口不依赖这些脚本。
- **裁决点 B**：R3 atomic-rollback vs partial-failure 不再单独裁决；相关目标链随历史 demo 链进入死链审计。

- **Step 1（已完成）**：基线 + 分类（v2 修订版见 §1）。failures-baseline.md 同步修订。
- **Step 2.5-A（已完成）**：删除历史 route/demo 脚本及注册项。`npm run build:ts`、`npm run validate` 通过；删除后的全量 vitest 为 4450 项、51 失败、14 文件。初始基线为 4444 项/57 失败；失败减少 6，但新增 `deepResearch.test.ts` 1 项且测试总数增加 6。由于工作区存在用户已有源文件改动，且全量并行测试存在超时抖动，本轮不宣称零回归。
- **Step 2.5-B（已完成）**：重新从 `packages/ts-shell/src/entrypoints/*` 做 CLI-only BFS，纳入静态 `from` 与动态 `import()`，排除测试文件。结果：1366 个生产源文件，871 个 CLI 可达，495 个 CLI 不可达；其中 450 个生产删除候选、45 个测试基建豁免。精确清单写入 `cli-only-delete-candidates.md`，完整可达清单写入 `reachability-2026-09-15.json`。本步只生成清单，未删除任何 `src` 文件。
- **Step 2.5-C（下一步）**：先删除 450 个生产删除候选中的第一小簇（纯孤儿/无生产引用），暂不碰 core/harness 与 test-utils 测试基建；删除前后重跑 BFS，要求 CLI 可达集合不变。
- **Step 2（随后）**：基线回绿。R7 六项修测试锁新语义；R1 死轨断言删除/收窄 + 活轨 metadata 透传（低优先）；R4 删 seed 断言；R5 两项活轨漂移复核；R6 若保留 harness 则加 timeout；R2/R3 不修（并入 Step 2.5 删除）。tsc 539 测试债口径决策不变。
- **Step 3（browser 搬迁，顺位后移）**：先删除 7 个死 browser 文件，再搬 160 个到独立 browser 域（14 子域映射不变）。
- **Step 4（orchestration 聚类，重算）**：待 Step 2.5 完成后按存活文件重新生成映射表；v1 的 976 条 import 重写预算作废重算。
- **Step 5（SessionManager 拆分）**：不变；死链删除后其真实引用面更清晰，利于分组。
- **Step 6（命名税裁定）**：不变。
- **Step 7（收尾）**：NormProof judge 全量跑；以删除后 BFS 报告（目标死链率 <5%）作为收敛证据。

## 4. 验证纪律（v2 增强）

- v1 全部保留（tsc build + vitest 基线 diff + golden gate；git mv + 脚本重写；数据只写在命令跑完之后）。
- 新增：**每波删除后重跑 BFS**，存活集与删除前完全一致才算通过——这是对"死链判定模型"本身的回归测试。
- 新增：任何"救活"判定（如未来新增 script 入口）必须同步登记入口清单，防止可达性口径漂移。

## 5. 本轮过程教训（保留 v1 记录并追加）

1. v1 教训：基线数据只写在命令跑完之后（预写数据曾含编造项，已删除）。
2. v2 教训：**"测试失败"分类必须带"被测对象是否在生产路径"维度**——v1 的 R2 被定性为"产品级缺陷优先修"，实际生产 CLI 根本不注册 MCP 工具；R1 的修法方向（补 metadata）不能让 8 项测试通过。凡涉及修复排序，先跑可达性再定优先级。
