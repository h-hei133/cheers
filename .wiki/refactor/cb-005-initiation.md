# CB-005 立项探索：`turn` 内核与编排层不连通

> 阶段 C / C1（`plan.md` §8.2）。plan 对该项的要求是"**应先立项再动手**"。
> 本文即立项文档：**零代码改动**，全部结论来自实测。
> 方法纪律沿用仓库既有要求：先复现/实测，再下结论；每条断言附 `file:line`；
> 不采信"计划里写过"作为证据（§8.3 的教训正是"反复记录但从未解决"）。

**结论先行**：CB-005 的**前提全部成立，但形态与 plan 的描述不同**——
不是"两套并行 provider 路径"，而是**一条活路径 + 一条已被封死到只跑合成 provider 的旧路径**。
因此它不再是"连通两套"的工作，而是**"选择一条并删除另一条"的裁决**。
这个区别决定了工作量和风险，故必须先裁决再动手。

---

## 1. 复核方法

| 手段 | 用途 |
|---|---|
| 生产代码 `import` 语句逐条甄别 `import type` vs 值导入 | 区分"类型可达"与"实际执行" |
| `scripts/analyze-boundaries.py`（仓库自带） | 权威可达性口径 |
| 真实会话数据（`~/.private-agents/sessions/`，84 个） | 判定某字段是否真的被写入 |
| `git log -S` | 定位引入提交 |
| 逐函数反查生产调用点 | 区分"导出"与"被调用" |

**关键口径**（plan §2.3 自己写过的）：*"在 CLI 可达集内" ≠ "被调用"*——
可达性由 import 边驱动，**`import type` 也算边**。本次复核因此不采信可达性数字，
对每一处都追到值导入为止。

---

## 2. 实测事实

### 2.1 活路径：`turn/` 内核（真实对话走这里）

| 事实 | 证据 |
|---|---|
| CLI 入口驱动 `turn/` | `entrypoints/cliRuntimeInvocation.ts:16-18` 值导入 `runTurn` / `createStepFunction` / `createSyntheticStep` |
| 内核为 `core/agent` | `turn/session.ts:1` 值导入 `AgentCore`；`:100` 实例化 |
| 真实 provider 调用发生在此 | `turn/session.ts:107-116` 的 `streamStep` → `options.step(...)` |
| 终态判定在此且只读 messages | `turn/projection.ts:101` `concludeRun(messages, ...)`；调用点 `turn/session.ts:189` |

### 2.2 旧路径：`runtime/loop/*`（12 文件 / 6579 行）**在生产代码中零值导入**

| 事实 | 证据 |
|---|---|
| 生产侧对 `runtime/loop/*` 的 14 处 import **全部是 `import type`** | `presentation/surface/{model,types,events,runtimeEvents}.ts`、`core/shell/sessionTerminalState.ts:7-8` |
| 唯一生产值调用者 | `runtime/api/host/runtime.ts:351` `runAgentLoopContract` |
| 12 个 loop 文件的值导入者数 | **全部为 0**（`adapter` / `contract` / `trajectory` / `completionPacket` / `feature` / `finalization` / `infrastructure` / `modelBoundary` / `phaseStatus` / `providerBoundary` / `providerStreamAdapter` / `reentry`） |
| 其余值调用者只有测试 | `runtime/loop/*.test.ts`、`core/shell/sessionRuntime.test.ts`、`presentation/surface/model.test.ts` |

即：**6579 行代码在生产中从不执行**，只被测试调用。

### 2.3 决定性事实：旧路径的 provider 是**硬编码合成**的

```ts
// packages/ts-shell/src/runtime/api/host/runtime.ts:338
const syntheticBoundary = createSyntheticModelBoundary({ program: programFor(input.envelope) });
// :357-358
providerMode: "synthetic",
modelBoundary: syntheticBoundary,
```

```ts
// packages/ts-shell/src/runtime/api/host/contract.ts:17
export type HostProviderMode = "synthetic" | "default-off";
// :237-239
if (record.providerMode === "real") {
  blockers.push(blocker("provider-blocked", "host.provider.default-off",
    "live provider mode is not available through this host lane"));
}
```

**类型上不存在 `real`**；传入 `"real"` 被显式阻断。且 `verify:host-surface` 门禁
（`scripts/verify-host-surface.mjs:55` 用 `providerMode: "synthetic"`；
`:90` 传 `"real"` 并**断言它必须被 `provider-blocked` 阻断**，`:96-101`）
把这个封死状态**写成了门禁**——即该路径不能跑真实 provider 是**被刻意保护的契约**。

**推论**：`runtime/loop/*` **不是**一条能与 `turn/` 并行的"另一套 provider 路径"。
它是一条**只能跑脚本化合成 provider 的契约/评估 harness**。

### 2.4 旧路径的产出在真实会话中不存在

| 测量 | 结果 |
|---|---|
| 84 个真实 session `state.json` 含 `harness` | **0** |
| 84 个真实 session `state.json` 含 `codingResult` | **0** |
| 162 个真实 `query.completed` 事件携带 `codingResult` | **5** |
| 那 5 个的时间 | 全部 ≤ **2026-08-29**，同属一个 `sess_e7b346126e1da27a`（创建于 05-06） |

即：`codingResult` 在真实会话中**只在 turn 迁移（`a7418fcb`，2026-09-12）之前**出现过。
**迁移之后为零。**

### 2.5 结构性缺口的精确位置（CB-005 的核心，确认成立）

`turn/tools.ts` 在审批点**确实持有**结构化数据：

```ts
// turn/tools.ts:123
const approvals = new Map<string, { operation: string; decision: string }>();
// :130  if (permission.approved) approvals.set(call.id, permission.approved);
```

但唯一的出站通道只允许 `{ output }`：

```ts
// turn/tools.ts:154-173
afterToolCall: async ({ call, args, result, isError }) => {
  const approval = approvals.get(call.id);          // 取到了
  ...
  return output === result.output ? undefined : { output };   // 只能返回 output
},
```

**审批的 operation/decision 被取到、被用于拼一行文本、然后丢弃。**
这正是 plan §3.4 说的"无结构化通道传给 `codingResult`"——**实测确认**。

同时 `concludeRun` 完全不看验证结果：

```
grep -n "verification\|taskSatisfaction\|failedFiles" turn/projection.ts
→ （无匹配）
```

`concludeRun` 只读 `messages` 的 `content` / `stopReason` / `errorMessage`。
所以"编辑成功但验证失败"仍报 success（CB-005 登记的另一表现）**成立**。

---

## 3. 对 plan 描述的修正

| plan 原文 | 实测 | 修正 |
|---|---|---|
| "活轨存在**两套并行**的 provider 路径" | 旧路径 provider 硬编码合成、类型上无 `real` | 不是并行，是**一条活路径 + 一条封死的 harness** |
| `runtime/loop/*` "有 retry 资格判定"（作为能力对比） | 该代码**零生产执行** | 该能力**从未在真实对话中生效**，不是"另一套能力" |
| "终态判定分属两侧，不汇合" | 成立 | ✅ 无需修正 |
| 审批 provenance 无结构化通道 | 成立 | ✅ 无需修正 |
| `provenance` 5 读 0 写 | 见 §4 | 读侧成立；写侧**只有** `actionAuthority.ts:105` 的 `blockedCodingResult`，且它**不写 `provenance`** |

---

## 4. 四条"死条件"的复核

| # | 条件 | 读侧 | 写侧 | 结论 |
|---|---|---|---|---|
| 1 | `provenance.toolExecutions` / `approvalDecisions` | 7 处生产读取（`sessionTerminalEvidence.ts:536,540`、`stoppedSessionContinuity.ts:234`、`sessionToolContinuity.ts:8`、`sessionApprovalContinuity.ts:25`、`sections.ts:205` 等） | **无**（唯一 `codingResult` 生产者为 `actionAuthority.ts:105`，其 `blockedCodingResult` 不含 `provenance`） | ✅ 确认为死条件 |
| 2 | `executionLane` | **无**（`.executionLane` 无任何生产读取点；仅 `mutation.ts:304` 声明、`:270` 拼进 evidence 字符串） | `planning/handoff/mutation.ts:252` | ⚠️ **读侧为零**——不只是"指向不存在路由"，是**无人读** |
| 3 | 25 条证据标签死条件 | 部分 | 部分 | 与 #1 同源（未逐条穷举，见 §6） |
| 4 | `lastActionResultSeed` | 多处生产读取（`stoppedSessionContinuity.ts:77,130,242`、`sessionContinuitySnapshot.ts:81,88`、`resumeContextBuilder.ts:354`、`actionAuthority.ts:127` 等） | **仅测试**（`longSessionContinuityFixtures.ts:313`、`longSessionDurabilityProcess.ts:430,522`） | ✅ 确认为死条件 |

### 4.1 额外发现（本次新查，plan 未登记）

**`getSessionReceipts` 零消费者。** `core/hooks/builtin/evidenceReceiptCollector.ts:16`
导出该函数（连同 `clearSessionReceipts`、`ToolExecutionReceipt`），
但生产代码中**只有 `builtin/index.ts:10-12` 的 re-export**，无任何调用点；
唯一调用者是 `core/hooks/hooks.test.ts:158`。

该 hook 在真实路径上**确实注册并执行**（`cliRuntimeInvocation.ts:10` →
`setupBuiltinVerificationHooks` → `core/hooks/builtin/index.ts:23` 注册），
它收集的 `ToolExecutionReceipt` **被写进内存环形缓冲后无人读取**。

这是与 #1 形态相同、但 plan 未登记的第 5 条死条件：**写入侧存在、读取侧缺失**（与 #1 方向相反）。

---

## 5. 立项建议

CB-005 的真实形态是**裁决问题**，不是施工问题。

> **命名说明**：本节三个处置方案原写作 A/B/C，与 `plan.md` 的**阶段 A/B/C** 撞名，
> 极易误读为"回到阶段 A"。已改为 **O1/O2/O3**（option）。两者无关：
> 阶段 A/B 是已完成的 strict / 文档 / `core/` 准入等工作；阶段 C 是"需独立立项"的路线章。
> 本节 O1~O3 是**阶段 C1（CB-005）内部的三个可选做法**。

| 方案 | 内容 | 代价 | 风险 |
|---|---|---|---|
| **O1. 删旧路径** | 删除 `runtime/loop/*`（6579 行）+ `runtime/api/host/*` 的 loop 相关面 + `truthMatrix.test.ts`（791 行）；保留 `turn/` 为唯一执行路径；`codingResult` 一族消费方随之处置 | 大（需逐一判定 ~40 个 `CodingResultSummary` 消费者） | 中：会删掉"公共 API"的一部分（`index.ts` 导出 `createHostRuntime`） |
| **O2. 连通两路径** | 在 `turn/tools.ts` 的 `afterToolCall` 打开结构化出站通道，让 `turn` 产出 `codingResult` | 大（等于给 `turn` 补一整套投影层） | **高**：等于把已封死的 harness 复活成第二条真路径 |
| **O3. 只补缺口，不裁决路径** | 仅修 §4 的死条件（`provenance` 写入、`lastActionResultSeed` 生产、`getSessionReceipts` 消费） | 中 | 低 |

**建议：先裁决 O1 还是 O3，不要选 O2。**

理由：
1. **O2 与实测事实冲突**。旧路径的 provider 是硬编码合成、类型上无 `real`——
   "连通"它等于**新建**一条真实 provider 路径，而不是"接上已有的"。
   这与 plan §8.3 的判断（"CB-005 是唯一真正的架构重构项"）方向相反：
   它其实是**一条已经废弃的路径还留着**。
2. ~~**O1 与 O3 不冲突**，且 O1 会自然消灭 O3 的大部分对象。~~
   **【2026-09-19 更正——此条已被实测推翻，保留原文以存档】** 原文写：
   "若 `runtime/loop` 被删，`codingResult` 的唯一生产者 `actionAuthority.ts` 也随之暴露
   （它同样零生产值调用者），届时 §4 的 4 条死条件大多**自动消失**"。
   实测：删除 `runtime/loop/` + `runtime/api/` + `runtime/evaluation/` 后，
   逐一检查的 **16 个死条件读取者全部仍可达（16/16）**——它们由
   `entrypoints/cliRuntimeModule.ts` → `session/SessionManager.ts` 直接可达，
   与 loop lane **无任何依赖**。详见 `cb-005-recommendation.md` §0 更正二。
   **因果被我写反了：O1 不解决 CB-005。**
3. 因此**最小且诚实**的第一步是：**先测 O1 的删除闭包有多大**（不改代码），
   据此再决定"删"还是"补"。

### 5.1 建议的下一步（待裁决）

| 序 | 动作 | 产出 | 是否改代码 |
|---|---|---|---|
| 1 | 测 `runtime/loop` + `runtime/api/host` + `core/query/runtime` 的**删除闭包** | 受影响文件清单、公共 API 面变化、测试损失数 | 否 |
| 2 | 据此写 O1 / O3 的**代价对照** | 一页对照表 | 否 |
| 3 | 维护者裁决 | O1 或 O3 | — |
| 4 | 按裁决执行（若 O1：按 §2.2 六项删除检查 + 整簇删除） | — | 是 |

**第 1 步的已知边界**（本次已测）：
- `runtime/api/host/runtime.ts` 是 `index.ts`（package `main`）的导出面，且被 `verify:host-surface` 门禁实测消费
- `verify:host-surface` 只用合成 provider，故它验证的是 **harness 契约**，不是真实对话
- 若删 O1，该门禁需要一并裁决（保留则等于保留一个只跑合成的 API 面）

---

## 6. 本次未完成的部分（如实记录）

| 项 | 状态 | 原因 |
|---|---|---|
| 25 条证据标签逐条穷举 | **未做** | 子代理基建故障（见下），时间用于更高价值的 §2.3/§2.5 |
| `runtime/loop` 删除闭包的精确定量 | **未做** | 属"下一步"第 1 项，需独立一轮 |
| `CodingResultSummary` 全部 ~40 个消费者的逐一定性 | **未做** | 同上 |

### 子代理基建故障（影响本轮方法）

按维护者要求并发上限 2，派出 2 个子代理。**两个均因基础设施故障失败**：

1. `HostPathReach`：`[workbuddy/global:deepseek-v4.1-flash] Retry budget exhausted after 10 retries: 503`，
   返回腾讯云 WAF 拦截页（`type=api_error param=waf_ip_blocked`）。
2. `DeadConditions`：同类故障，运行 9 分钟后取消。

**两者均未产出任何结论**，本文所有事实**均由主代理亲自实测**，无子代理输入。
此故障与 CB-005 本身无关，但记录在此以便区分"未完成"与"未尝试"。

---

## 7. 与既有记录的关系

| 文档 | 关系 |
|---|---|
| `plan.md` §3.4 / §8.2 C1 | 本文是其"立项"要求的具体产出；§3 修正了其"两套并行路径"的描述 |
| `plan.md` §3.1 #3/#6/#7 | §4 逐条复核；#6 `executionLane` 的结论比原记录更强（读侧为零） |
| `capability-backlog.md` CB-001 / CB-005 | CB-001 的 `lastActionResultSeed` 在 §4 得到独立确认 |
| `capability-backlog.md` CB-006 | account-auth 失败同属"旧 provider 路径封死"的表现，本文 §2.3 给出其结构性原因 |
| `preexisting-defects.md` | **无关**。PD-001~003 是活路径上的行为缺陷，与本次架构裁决无交集 |
