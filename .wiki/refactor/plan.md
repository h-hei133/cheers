---
title: "Architecture Refactor Plan"
category: article
sources: [repo-audit-2026-09-15, tsc-baseline-2026-09-15, vitest-baseline-2026-09-15, failures-baseline]
created: 2026-09-15
updated: 2026-09-15
tags: [refactor, architecture, plan]
summary: "Module boundary refactor plan: hot-spot inventory, import-blast-radius data, phased migration steps with verification gates. Step 1 records the full-test triage baseline (57 failures classified into 7 clusters)."
confidence: high
---

# Architecture Refactor Plan

> 本目录（`.wiki/refactor/`）是整个模块边界重构计划的唯一记录位置。
> 本轮只规划与基线测量，不改任何生产代码。
> 后续每一阶段执行前，先在本文件登记入口标准；执行后在 `log.md` 记录实际结果与偏差。

## 0. 重构对象与证据（2026-09-15 审计）

仓内架构债不是全局性混乱，而是三个可量化的热点加一个命名税。31 个一级模块、777 个测试文件、owner-domain 结构成立；债集中在"域长大了但没人执行搬迁"的位置。

### 热点 1：`core/context` 根目录的 browser 坟场（最大）

- 178 个文件平铺在 `packages/ts-shell/src/core/context/` 根目录，其中 **167 个为 `browser*` 前缀**，约 20k 行源码。
- 语义聚类为 14 个子域：Action(7) / Execution(11) / Playwright(9) / ExternalNetwork(11) / ControlledNetwork(6) / Network 守卫(4) / PublicReadOnlyWeb(7) / ReadOnly+快照(10) / SelfHealing(14) / Replay(10) / Sandbox+DryRun+Local(8) / Txn+Evidence+Receipt(8) / Tool+Capability+Session(6) / 其余观测追踪(约10)。
- 跨模块引用面极窄：仅 10 个外部文件 import 这些 browser 模块（`core/commands`、`orchestration` 的投影/规划器、`entrypoints` 桥）。596 处引用是域内互引（`./browserXxx.js`）。
- 一级模块 `src/browser/` 现仅 61 行。这是"边界画好了，代码没搬进去"。
- **定性：放错位置的完整域，搬迁风险低、视觉收益最大。**
- 修正：搬运方式为批量 `git mv` + 一次性脚本重写 import 相对路径（167 文件 × 域内 596 条 + 外部 10 文件），非逐文件 lsp rename。

### 热点 2：`orchestration` 根目录平铺

- 186 个文件 / 42k 行堆在根目录；前缀聚类清晰：`provider*`(20)、`edit*`(19)、`task*`(15)、`context*`(14)、`target*`(10)、`verification*`(9)、`planning*`(9)、`real*`(8)、其余 6 及以下。
- `patch*` 七个子目录先例已存在（commit 47d361d3 起同方式生长），证明该模式在仓内走过且测试锁定。
- 引用爆炸半径（已量化）：根内互引 653 条 + 全仓外部引用 323 条（指向 82 个文件）= 约 976 条 import 语句需路径重写。纯机械映射，tsc 为完备验证器。
- **定性：机械聚类，模式有先例；量真实存在但可脚本化。**

### 热点 3：`SessionManager.ts` facade

- 52 个函数式名称，NormProof dispositions 中两次 defer（2026-08-28、2026-09-02），理由均为"拆分是独立任务不是顺手事"。
- **定性：唯一需要动脑的拆分，预留为独立阶段。**

### 热点 4：命名税（决策类，最后做）

- `context/` vs `core/context/`；`orchestration/` vs `core/workflow/` vs `workflow/`；`cli/` vs `entrypoints/` vs `renderer/` vs `presentation/`。
- 概念重叠导致定位成本；属于目录语义决策，不是文件搬运。放在所有物理搬迁完成后统一裁定。

### 非债证据（不需要动的部分）

- 耦合是 hub-spoke 而非面条：`orchestration` 被 import 159 次、`core` 118 次，其余一级模块全部 ≤55。
- 职责上限（20 函数）治理在运转：dispositions.md 记录的 31 个超标模块中 10+ 个已按 "decision: fix" 拆解。

## 1. Step 1 —— 全量测试基线与问题分类（本轮执行，已完成）

目的：在动任何文件之前把测试面完全摸清。重构期间每步拿基线 diff 对照——失败集与基线一致 = 零回归；基线外新增 = 立刻停下定位。

完整实测结果与 57 项失败逐簇分类见 **[failures-baseline.md](failures-baseline.md)**（唯一回归对照物）。摘要：

| 测量 | 结果 |
|---|---|
| `tsc -p tsconfig.build.json`（生产门控） | **通过，0 错误** |
| `tsc --noEmit` 全量（含测试） | 539 错误**全部在 .test.ts**，生产 0；build tsconfig 显式排除测试文件，属测试 mock 与类型演进脱节 [known-gap] |
| `vitest run` 全量 | 4444 项，**57 失败 / 18 文件**，分 7 簇（详见 failures-baseline.md） |
| golden gate `GOLDEN_MAIN_PATH` | 通过 |
| `cargo test`（rust-core） | 2/2 通过 |
| `npm run validate` | 通过 |
| pytest（python-eval） | 未跑成：无 pytest 环境（toolchain 硬编码 Windows conda 路径）[environment] |

57 项失败分类汇总：

| 簇 | 项数 | 分类 | 根因（已核实到代码行） |
|---|---|---|---|
| R1 rust-daemon 元数据投影断裂 | 11 | real-defect | `registry.ts runCommandTool` 组装 metadata 时丢弃 `executionPath/errorClass` |
| R2 MCP 工具执行占位桩 | 16 | real-defect | `registry.ts:562-568` MCP execute 返回恒定字符串，`invokeTool` 生产零调用——**真实 MCP 调用全部假成功** |
| R3 atomic-rollback 契约冲突 | 5 | **contract-conflict** | `3bc2ad5b`(2026-08-30) 引入全量回滚与 partial-failure 测试契约冲突，**提交当日即失败**（已实测复现），提交信息误称 28/28 通过。需裁决保留哪种语义 |
| R4 seed=action-result 透传丢失 | 9 | real-defect | turn Phase 4 后 stopped continuity 投影未同步（log.md 09-12 已跟踪为 57 项基线的一部分） |
| R5 非交互 CLI 漂移 + real-provider 环境依赖 | 5 | known-gap/env | deny 默认/落盘断言漂移；3 项依赖真实 provider |
| R6 harness 场景 5s 超时 | 7 | test-infra | 真实 CLI 子进程场景超 vitest 默认单测预算，并行负载下抖动 +14 项 |
| R7 handoff/continuity 投影漂移 | 6 | real-defect | Phase 4 语义演进遗留（handoff 带阶段后缀、Continuation 措辞、verbose 开关、1 项 approvalTrust 持久化待查） |

关键结论：

1. **生产代码类型零错误**（build 门控干净）——重构可安全依赖 tsc 作为 import 重写验证器。
2. 57 失败中 47 项是真实债（R1/R2/R4/R7），且**绝大部分与 2026-09-13 audit 记录的已知基线一致**（log.md:217 "rust-bridge/MCP 18 失败与基线一致"、09-12 "聚合失败集 118→57"），零新近回归。
3. R2（MCP 占位桩）是产品级缺陷，优先修。
4. R3 需要用户裁决：atomic rollback（改测试）vs partial-failure 语义（改实现）。
5. 一个过程教训已修正：本轮最初在测试完成前预写的"实测结果"含编造数字与不存在的提交哈希（d0ad96e2），已全部删除并以本节数据为准。后续任何基线数据只写在命令跑完之后。

## 2. 待量化项（Step 2 前补测）

1. **orchestration 聚类映射表**：186 文件 → 目标子目录的精确映射 + 976 条 import 的新路径逐条清单（脚本生成）。
2. **browser 域搬迁映射表**：167 文件 → 14 子域目录 + 606 条引用改写方案。
3. **python-eval pytest 环境决策**：装 pytest 或显式豁免（Windows conda 路径硬编码应一并修）。
4. **R3 契约裁决**（阻塞 Step 2 的该簇修复，不阻塞基线固化）。

## 3. 阶段规划（每阶段执行前补充入口标准）

> 顺序原则：先修信号（基线回绿），再搬文件（视觉+机械收益最大先做），再拆 facade（动脑），最后命名税（决策）。

- **Step 1（本轮）**：全量测试基线 + 分类登记。✅ 完成——57 项 7 簇，`failures-baseline.md` 固化。
- **Step 2**：基线回绿。按 failures-baseline.md §修复优先级：R2 MCP 接线 → R1 投影透传 → R3（裁决后）→ R4/R7 投影同步 → R6 超时预算 → R5 环境标记 → tsc 测试债口径决策（tsconfig.test.json 豁免或补齐）。pytest 环境决策。
- **Step 3**：browser 域搬迁——167 个 `browser*` 文件按 14 子域从 `core/context/` 搬入独立 browser 域；`git mv` + import 重写脚本 + tsc + 基线 diff。注意：R2 修复会让 MCP/browser 相关测试开始真实执行，搬迁前后基线需重新固化一次。
- **Step 4**：orchestration 根目录聚类——按 §2.1 映射表执行，同上验证。
- **Step 5**：SessionManager facade 拆分——52 函数按生命周期/压缩/持久化分组；最高风险阶段，单独规划、单独验证。
- **Step 6**：命名税裁定——`context/` vs `core/context/` 等概念重叠归位；纯决策 + 机械执行。
- **Step 7**：收尾——NormProof judge 全量跑，更新 dispositions，wiki 收敛记录。

## 4. 验证纪律（全程有效）

- 每步必须跑：`tsc -p tsconfig.build.json`（生产门控）+ 全量 `vitest run` + golden gate。
- 回归判定只认 diff：`failures-baseline.md` 是唯一对照物；基线变化（如 Step 2 修复后）必须重新固化并记录版本。
- 基线外新增失败 = 该步未完成，禁止带病前进。
- 搬文件用 `git mv`（保留 rename 追踪），import 重写用一次性脚本（机械映射），禁止手工逐条改。
- 每步完成后在 `log.md` 记录一行实测数据（命令、项数、与基线 diff 结果）。
