# CB-005 执行记录：死代码清理（已完成）

> 2026-09-19 执行。**`tsc` 0 错误 / 全量测试 2749 通过 / 四道门禁全过 / 真实 TUI 实机验证通过。**

---

## 1. 先回答"到底是不是死代码"

**是死代码。证据链：**

| 事实 | 证据 |
|---|---|
| 活路径 `turn/projection.ts` **从不产出** `codingResult` / `loopTrajectory` / `productLoopAdapter` | 该文件 grep = 0 |
| `projectProductSurfaceViewModel` 的守卫要求这 7 个字段至少一个非空 | `presentation/surface/model.ts:58` |
| 活路径只传 3 个，**全是 `undefined`** | `sessionTerminalState.ts:531-537` |
| 所以它**恒 `return undefined`** → 整条 surface 链从未执行 | 逻辑必然 |
| 84 个真实会话中，唯一含 `loopTrajectory` 的是 **2026-09-11**，在 turn 迁移（`a7418fcb`，09-12）**之前** | 逐会话核对 |
| 迁移后所有 `query.completed` 的 `result` 只有 6 个字段，无 loop 形状 | 实读事件 |

**关键区分**：上一轮我误判为"测试指向死代码"。更准确的是——
**那些"活模块"本身也是死的**（`evidence/projection/repair/verdict.ts`、
`result/projection/repair/verdict.ts`、`session/replay/state.ts`、
`runtime/evaluation/task/model.ts` 经可达性验证全部 dead）。
只有 `core/shell/sessionRuntime.ts` 是活的。

---

## 2. 删除清单

| 类别 | 对象 |
|---|---|
| 旧 provider 执行路径 | `runtime/loop/*`（26 文件，13,208 行） |
| host lane | `runtime/api/host/{runtime,io}.ts` + 测试 |
| CLI host 委托 | `cli/host/` |
| 包就绪度 | `runtime/distribution/` |
| 死 surface 链 | `presentation/surface/*`（7 文件） |
| 死状态面 | `session/presentation/envelope.ts`、`core/shell/cliSessionProductSurface.ts` |
| 死格式化器 | `presentation/terminal/renderer.ts` |
| 死投影字段 | `runtime/events/projection.ts` 的 8 个从未填充字段 |
| 公共面 | `index.ts` 3 条导出、`scripts/verify-host-surface.mjs`、`--host-command` 开关 |

**保留**：`runtime/api/host/contract.ts`（**纯类型**，`runtime/evaluation` 公共 API 仍引用）。

**合计：69 文件变更，+109 / −23,631 行。**

---

## 3. 验证（全部实跑）

| 门禁 | 结果 |
|---|---|
| `tsc -p tsconfig.build.json` | **0 错误** |
| `npm run build` | **0 错误**（含 Rust） |
| 全量测试 | **2749 通过 / 1 跳过 / 0 失败** |
| `verify:import-cycles` | `runtime_cycles=0 type_only_cycles=0` **pass** |
| `verify:docs-drift:strict` | **pass**（35 → 0 dangling） |
| `analyze:module-facades` | 3 monolith（**均为既有 disposition**，无新增） |
| NormProof | `openBlockingObligationCount: 0`（与基线一致） |

### 真实 TUI 实机验证（`plan.md` §2.4 强制）

| 场景 | 结果 |
|---|---|
| `--print "say hello"` | `Outcome: success` / `Detail: completed`，exit 0 |
| 交互 TUI 完整回合 | 提示 → `=== Turn 1 ===` → `Outcome: success` → 回到提示符 |
| `/sessions current` | 输出含 `- ID: sess_...`（与 `cli-baseline.test.ts:649` 断言一致） |

**无崩溃、无回归。**

### 唯一失败项

`cli-baseline.test.ts` 的 PTY spawn 测试在全量并发下超时 1 次；**隔离复跑 40/40 通过**。
该测试**不依赖任何已删模块**，且 `plan.md` 已记录同类既有抖动
（`3171/3172`、`3170/3172`）。判定为**既有负载抖动**。

---

## 4. 测试数变化说明

| | 项数 |
|---|---:|
| 清理前 | 3174 |
| 清理后 | 2750 |

**减少 424 项**——全部是**被删模块自身的测试**（其被测对象已不存在）。
活模块的测试**一项未删**（`sessionRuntime.test.ts` 仅移除 1 个断言已删 lane 输出的用例）。

---

## 5. 文档同步

| 文档 | 动作 |
|---|---|
| `docs/sprint/project-gap-and-priority-plan.md` | 两个"Completed Batch"加更正说明（其证据文件已删） |
| `docs/sprint/component-adoption-log.md` | "Host JSON Framing" 节记录移除，rollback plan 标注已执行 |
| `.wiki/refactor/architecture-exploration-2026-09-18.md` | `renderer.ts` 引用更新为已删 |
| `.wiki/refactor/plan.md` | §2.2 检查 5 的 `verify-host-surface` 引用标注为历史 |
