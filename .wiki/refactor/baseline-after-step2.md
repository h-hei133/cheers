# Refactor Step 2 后基线（2026-09-16）

> Step 2（基线回绿）执行完成后的回归对照物，取代 `baseline-after-main-cluster-deletion.md`。
> 测量：`cd packages/ts-shell && npx vitest run`（全量）。
> 结果：**3179 项 / 15 失败 / 1 文件**（Step 2 前为 3179 项 / 30 失败 / 6 文件）。

## 本轮修复（15 项）

全部依据 `failure-triage-2026-09-16.md` 的逐项定因执行。

### 改生产代码（6 项）

| 变更 | 位置 | 修复项 |
|---|---|---|
| 透传执行溯源 metadata（`executionPath` + `errorClass`） | `core/tools/registry.ts:145-171` | A 类 5 项 |
| `detectCommand` 三分支收敛到 allowlist 成员 | `orchestration/capabilityBoundaryProjection.ts:22-44` | E 类 1 项 |

`detectCommand` 原实现返回 `npm test` / `npm run build` / `trimmed`，均不在 `RUN_COMMAND_ALLOWLIST` 内，违反该模块自身声明的不变式（映射必须留在受控 allowlist 内）。现改为返回 `npm test -- --help` / `npm run build -- --help` / `node --version`。

### 收窄断言（3 项）

`core/tools/registry-rust-bridge.test.ts`：删除对 `content` / `details.executionReceipt` / `reportSafe` / `metadata.runtimeReceipt` 的断言——这些结构由 interception/result-split 路径产出，CLI registry 路径不构建它们。改为断言该路径确实拥有的面（`output` + `metadata.executionPath` + `metadata.errorClass`）。

### 改测试锁新语义（6 项）

| 测试 | 变更 |
|---|---|
| `core/shell/recovery.test.ts`（2 项） | `visitedTransitions` 断言改为 `from->to:reason` 带理由后缀格式（生产 `core/query/runtime/state.ts:370`） |
| `core/shell/approvalTrustPolicy.test.ts`（1 项） | 改为命令签名精确匹配语义（`node --version` ≠ `node -v`）；生产 `approval/store.ts:55` 明示为防通配提权而收紧 |
| `core/shell/sessionRuntime.test.ts`（1 项） | verbose 渲染断言改为现格式 `[tool: bash]`（原 `[tool:start] bash`） |
| `core/shell/sessionRuntime.test.ts`（2 项） | 补 `outputMode: "print"`——`Continuation` 摘要由终端表面的 print 分支渲染，interactive 分支将其门控在 verbose 之下 |

## 剩余 15 项失败（全部为已登记待裁决项）

| 登记项 | 项数 | 性质 |
|---|---:|---|
| **CB-001** 会话续跑决策追踪 | 10 | 活轨从未实现（旧链曾具备，Phase 4 未迁移；消费方仍在，生产者缺失） |
| **CB-002** 非 TTY real-provider 端到端链 | 4 | 测试不可运行（mock server 就绪但 CLI 挂起；Phase 4 时已失败，非本次引入） |
| F3 未完成定因 | 1 | `print approval boundary defaults deny without prompt` |

三项均**不阻塞重构**，等维护者裁决（删除 / 收窄 / 独立立项）。

## 验证门控

| 检查 | 结果 |
|---|---|
| `tsc -p tsconfig.build.json` | 0 错误 |
| `npm run build:ts` | 通过 |
| 全量 vitest | **3179 项 / 15 失败 / 1 文件** |
| 目标套件回归 | `registry-rust-bridge`(9) + `sessionRuntime`(37) + `recovery`(23) + `approvalTrustPolicy`(5) + `capabilityBoundaryProjection`(3) = 77 项全通过 |

## 遗留

- F3（`print approval boundary defaults deny without prompt`）：期望输出含 `Approval`，实得 `Synthetic reply: …`。未完成定因，需要确认 synthetic provider 下 print 模式的审批边界打印行为。
- CB-001 / CB-002 待裁决。
