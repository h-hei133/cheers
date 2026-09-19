# 未实现能力登记（Capability Backlog）

> 用途：记录「测试期望但生产未实现」或「已废弃链曾具备、活轨缺失」的能力。
> 规则：**检测到有价值但未实现的能力 → 先登记并询问 → 由维护者决定是否保留 → 保留的项后续独立实现**。
> 与重构的关系：**不阻塞重构**。重构以结构为主，功能重建单独立项。

> **缺陷不登记在本文件。** 本文件记「能力缺失」；「能力在、但行为是错的」记在
> [`preexisting-defects.md`](preexisting-defects.md)（PD-001 ~ PD-003）。
> 本文件登记流程第 1 条只区分"回退"与"缺失"，没有第三类位置，故缺陷单独立档。

## 状态说明

- `待裁决` — 已登记，等维护者决定是否要做
- `已批准` — 决定要做，待排期
- `已拒绝` — 决定不做，对应测试应删除或收窄

---

## CB-001 会话续跑的决策追踪（decision trace / action-result seed）

- **状态**：`已裁决：删除断言`（维护者判定接受覆盖下降；能力本身保留在 backlog 供未来实现）
- **发现于**：`cli-baseline.test.ts` 10 项失败（2026-09-16 定因）
- **登记的测试**：
  - `prefers completed current session for /continue follow-up over recovery fallback`
  - `carries completed-session failure diagnostic through /continue follow-up`
  - `keeps stopped recoverable result context actionable through bare and follow-up /continue`
  - `keeps writer-started stopped unknown write effect actionable through bare and follow-up /continue`
  - `keeps writer-started stopped unverified write effect actionable through bare and follow-up /continue`
  - `keeps selected-workspace writer-started unknown write effect truthful across process /continue`
  - `keeps selected-workspace writer-started unverified write effect truthful across process /continue`
  - `keeps non-write stopped patch-generation-failed evidence actionable through bare and follow-up /continue`
  - `keeps non-write stopped stale-read evidence actionable through bare and follow-up /continue`
  - `keeps non-write stopped approval-denied evidence actionable through bare and follow-up /continue`

### 能力描述

会话在关键状态下停住时（写入已开始但效果未知 / 写入后验证未通过 / 审批被拒 / 补丁生成失败 / 读到过期内容），把「上一轮动作的决策痕迹」压成结构化标记写入 `query.completed.sharedContext.notes`，使**下一轮**（用户输入 `/continue` 或后续追问时）能精确知道上一轮做到哪，而不是靠推测。

期望产出的标记形态（`cli-baseline.test.ts:3651-3660` 断言）：

```
decision-trace: seed=action-result seedAction=edit-file seedTarget=src/app.ts
                seedVerifyStatus=passed seedVerifyCommandInherited=yes
                diagnosticHandoff=success diagnosticTarget=src/app.ts
                diagnosticCommandInherited=yes diagnosticReason=yes
```

字段语义：

| 字段 | 含义 |
|---|---|
| `seed=action-result` | 存在上一轮动作痕迹（该标记的总开关） |
| `seedAction` | 动作种类（如 `edit-file`） |
| `seedTarget` / `seedChangedFiles` / `seedVerifiedFiles` | 目标与改动/验证面 |
| `seedWriterStarted` / `seedWriteEffect` / `seedRequiresUserInspection` | 写入是否开始、效果是否已知、是否需人工查看 |
| `seedVerifyStatus` / `seedVerifyCommandInherited` | 验证状态与是否继承验证命令 |
| `seedBlocker` / `seedReason` | 阻塞种类与理由 |
| `diagnostic*` | 成功/失败交接诊断（另一组标记） |

### 现状：为什么产不出

| | notes 产出 | 位置 |
|---|---|---|
| 旧链（**已删除**） | `decision-trace: seed=action-result …` | `orchestration/runtimeHandoffProjection.ts:123`（`buildActionResultSeedDecisionTrace`），唯一调用者 `planning/workflowTaskPlan.ts:89` |
| 活轨（**当前**） | `['steps: N']` | `turn/projection.ts:122` |

活轨缺失的**数据源**：

1. `turn/projection.ts` 的 `concludeRun` 产出的 `query.completed.result` 中**没有 `codingResult` 字段**（只有 `status`/`terminalClassification`/`terminalReason`/`transcript`/`sharedContext`/`finalOutput`）。
2. `lastActionResultSeed` 类型定义在 `orchestration/types.ts:278`，活轨 `turn/`、`core/agent/`、`core/query/` **均不产出**该字段。
3. `core/shell/recovery.ts:538 formatActionResultSeedEvidenceLine`（**CLI 可达**）与 `sessionTerminalState.ts:613`（渲染 `Continuation` 行）**都在消费**这些标记——即消费方存在，生产者缺失。

### 若要实现，涉及范围（估算）

1. 在 turn 内核产出等价于 `lastActionResultSeed` 的结构（动作种类、目标、写入效果、验证状态、阻塞种类），来源是 `AgentMessage[]` 与工具执行结果，与旧链的 `CodingResultSummary` 结构不同。
2. 在 `turn/projection.ts:122` 的 notes 中生成 `decision-trace: …` 行。
3. 复用现有消费方（`recovery.ts`、`sessionTerminalState.ts`），确认字段名匹配。
4. 顺带解决 B 类定因（`sessionTerminalState.ts:165` 把 `Continuation` 渲染门控在 `verbose`，compact 模式下不显示）。

**性质**：功能开发（约等于一个独立的 Phase），不是重构收尾。

### 决策选项

| 选项 | 含义 | 代价 |
|---|---|---|
| 删除断言 | 10 项收窄为「`/continue` 能恢复会话、能读到 transcript」的端到端验证 | 失去对「续跑上下文是否携带准确决策痕迹」的验证覆盖 |
| 独立立项实现 | 在活轨重建 seed/diagnostic 投影 | 需要设计 + 实现 + 验收，超出重构范围 |
| `it.skip` 过渡 | 暂时跳过并注明原因，等决策 | 测试套件留跳过项 |

**建议**：优先「删除断言 + 登记本项」。理由：消费方已在（`recovery.ts` 可达），生产者缺失不是删除造成的，是 Phase 4 turn 切换时未迁移的能力；重建属于功能开发，应在独立阶段做，不塞进重构。

---

## CB-002 非 TTY real-provider 端到端链（CLI smoke）

- **状态**：`已裁决：删除`（维护者判定 real-provider 测试价值不大）
- **性质**：**测试不可运行**（非功能缺失）——与 CB-001 不同，这里不是"能力未实现"，而是"测试在当前环境下无法通过"
- **登记的测试**（`cli-baseline.test.ts` 4 项）：
  - `proves default CLI real-provider chain in non-tty mode stops twice with explicit approval guidance and durable stopped state`
  - `keeps CLI real-provider path alive across one transient chat fetch failure`
  - `proves default real CLI continuity: deny first approval, then resume same session with explicit non-tty allow`
  - `proves default real CLI continuity: interrupt mid-query, then /resume to completed in same session`

### 事实

1. 测试用**本地 mock HTTP server**（`createOpenAiHttpServer`，`cli-baseline.test.ts:415`）提供 OpenAI 兼容端点，**不需要真实凭据**。
2. 失败形态：`Timed out waiting for two non-tty real-provider turns`（单跑 41s；探针复现 `--print` 模式挂起 120s 无输出）。
3. **是既有失败，非本次改动引入**：在 Phase 4 提交 `a7418fcb` 的树上同样失败；该提交信息自述 "CLI smoke failure set unchanged from before the change"（承认这批为既有失败）。
4. 4 项单独复现全部失败。

### 待查清的两点

- mock server 就绪但 CLI 挂起：是 `--print` 模式在 real provider 链上的真实缺陷，还是测试对 spawn/时序的假设已过期（如 provider 配置路径或握手协议变更）？
- 该链路是否仍被产品支持（`PRIVATE_AGENTS_PROVIDER_MODE=real` + 非 TTY）？

### 决策选项

| 选项 | 含义 |
|---|---|
| 查清并修复 | 先定位挂起根因；若是产品缺陷 → 修实现；若是测试过期 → 改测试 |
| 加环境守卫跳过 | `it.skip` 或条件跳过，注明"non-tty real chain 未验证" |
| 删除测试 | 若该链路已不被支持 |

**建议**：先做一次定点调查（限时），区分"产品挂起"与"测试过期"再决定。这 4 项**不阻塞 Step 2 的其余部分**。

---

## CB-003 synthetic provider 不驱动工具调用（非交互审批边界无法验证）

- **状态**：`待裁决`
- **性质**：**能力回退**（测试引入时通过，Phase 4 turn 切换后失效）
- **登记测试**：`cli-baseline.test.ts` → `print approval boundary defaults deny without prompt`

### 事实

1. **测试引入时通过**：在引入提交 `a302d77e`（2026-05-02 "Add print approval boundary smoke"）的树上单跑通过。
2. **Phase 4 后失败**：在 `a7418fcb`（2026-09-12）的树上同样失败，与当前一致。
3. **根因**：`turn/synthetic.ts:11-21` 的 synthetic step 恒定返回 `toolCalls: []`——**从不发出工具调用**。因此：
   - 提示 "Run node --version" 只得到 `Synthetic reply: Run node --version`
   - 工具审批从未被请求，非交互审批边界（`Decision source: default-deny`、`Non-interactive approval policy: deny (default deny)`、`approval-audit:channel=non-interactive`）无处触发
4. **消费者仍在**：`entrypoints/approvalPromptBridge.ts:91,118`（CLI 可达）仍在产出这些字符串；缺失的是触发链路，不是输出逻辑。
5. 实测输出：`Synthetic reply: Run node --version / Result / - Outcome: success / - Detail: completed`（`exit 0`）。

### 决策选项

| 选项 | 含义 |
|---|---|
| 让 synthetic 按提示中的命令意图发出工具调用 | 恢复该测试前提；但需定义"哪些提示应触发哪个工具"的合成规则，可能污染其他 30+ 依赖"纯回显"语义的 synthetic 测试 |
| 单独提供一个 synthetic 工具调用模式（如环境开关） | 更聚焦：只让需要工具链的测试启用，不影响纯回显契约 |
| 删除该测试 | 承认非交互审批边界不再有端到端覆盖 |

**建议**：先不动，登记待裁决。若要做，选第二项（专用模式），因为选项一会改变现有 30+ 测试依赖的 synthetic 语义。

**注意**：`turn/synthetic.ts` 的文档注释明确"a model that answers without a provider"，即纯回显是**有意设计**，不是缺陷。所以这是"设计变更导致测试前提消失"，属于重构遗留的验证缺口。

### 2026-09-16 执行（裁决 A）与根因更新

按裁决 A 实现：`createSyntheticStep({ toolIntent })` + `PRIVATE_AGENTS_SYNTHETIC_TOOLS=1` 环境开关（`entrypoints/cliRuntimeInvocation.ts`）。synthetic 现可对匹配的提示发出一次工具调用，完成后转为回显收尾。默认仍为纯回显，30+ 依赖该语义的测试不受影响。

**修复过程中发现并修复一个更严重的接线缺陷**（超出 CB-003 原范围）：

`cli/bootstrap/cliProcessRunner.ts:148` 原来把 `promptInteractiveApproval` 传成一个**恒定存在**的闭包：
```ts
promptInteractiveApproval: (prompt) =>
  interactiveApprovalPrompt ? interactiveApprovalPrompt(prompt) : Promise.resolve("deny"),
```
而审批桥用 `isNonInteractive = rl === null && !promptInteractiveApproval` 判定通道（`entrypoints/cliApprovalModule.ts:185`）。闭包恒存在 ⇒ `isNonInteractive` 恒为 `false` ⇒ **非交互审批分支永远不可达**，print/管道模式下的审批边界渲染（`Decision source`、`Non-interactive approval policy`、`approval-audit:*`）从不输出。

修法：只有交互表面真正安装处理器后才报告存在（`promptInteractiveApproval: interactiveApprovalPrompt`）。修复后该测试的审批输出全部恢复。

**剩余差异（升级为独立项 CB-004）**：见下。

---

## CB-004 审批拒绝后回合仍报成功（终态真实性缺口）

- **状态**：`待裁决`
- **性质**：**真实性缺陷**（非纯能力缺失）——工具被审批拒绝，回合却报 `Outcome: success`
- **登记测试**：`cli-baseline.test.ts` → `print approval boundary defaults deny without prompt`（最后 4 项断言）

### 事实

1. 审批链路已修复（见 CB-003），工具确实被拒：transcript 中 `tool.result.success: false`，`failureReason: "Blocked: User denied permission for tool 'bash' (execute) on 'node --version'."`
2. 但回合终态仍为 `Outcome: success` / `Detail: completed`；实测输出**不含** `denied`、`Blocked`、`stopped`、`approval-denied` 任何字样。
3. 根因：`turn/projection.ts:95-119` 的 `concludeRun` 只区分两种终态——
   - `last.stopReason === "error"` → `failed`
   - 其余 → `completed` + `terminalClassification: "success"`
   没有「工具被拒」这一分支；工具结果不参与终态判定。
4. 测试期望：`Outcome: stopped`、`BlockerKind: approval-denied`、且不得出现 `Outcome: success`。

### 为什么值得单独处理

这违反仓库的 [`agent-rules/evidence-and-truthfulness.md`](../../AGENTS.md) 原则：一个被拒绝执行的回合对外宣称成功，会让用户与后续轮次都误判「事情做完了」。这与 CB-001（缺失一个增强能力）不同——**这里是错误的成功声明**。

### 决策选项

| 选项 | 含义 |
|---|---|
| 修终态分类 | `concludeRun` 在「存在被拒工具且无成功动作」时返回 stopped/denied，并让终端表面渲染 `BlockerKind` |
| 收窄测试 | 只保留已恢复的审批渲染断言，删掉终态断言并注明已知缺口 |
| 暂缓登记 | 保持失败，等更大范围的终态语义设计（可能与其他终态缺口一并处理） |

**建议**：选项 1。它是真实性问题，不是可选增强；修复面也明确（一个函数 + 一个渲染分支）。若选择它，需确认 stopped 的 `blockerKind` 从哪来（工具结果是唯一现场）。

---

## CB-005 turn 内核与编排层不连通（架构级）

- **状态**：`待裁决`（**记录优先，不单独修复**）
- **性质**：架构问题，非单点缺陷。**多个已确认破坏同源于此。**
- **来源**：`deleted-audit-2026-09-16.md` 附十四（#3）、附八（10 项候选判定）、
  `plan.md` §3.4

### 问题

活轨存在**两套并行的 provider 路径**，互不共享数据：

| 路径 | 使用者 | 能力 | 数据形态 |
|---|---|---|---|
| `turn/step.ts` | 模型驱动工具循环（**实际对话**） | 无重试、无终态裁决；验证仅作 `[Verification feedback]` 文本注入模型上下文 | 不产生 `codingResult` |
| `runtime/loop/*` + `provider/request/*` | 编排层 / 公共 API | 有 retry 资格判定（自述 `retry-eligibility-is-not-retry-execution`）、`NormalizedProviderError` | ~~产生 `codingResult` 但不经 turn~~ **【2026-09-19 更正：两侧都不产生】** |

> **更正（2026-09-19）**：上表右栏原写编排层"产生 `codingResult`"，**实测为假**。
> `grep -rn "codingResult\|CodingResult" runtime/loop/` = **0**；`provider/` = **0**；
> `git log -S"codingResult" -- runtime/loop` = **空**（历史上也从未有过）。
> `codingResult` 的真实产生链在**第三个地方**：
> `core/query/runtime/actionAuthority.ts:105` → `result/projection/shell/assembly.ts:138`
> （`buildShellCodingResult`）→ `result/projection/runtimeOutcomeProjection.ts:42`
> → `planning/task/taskLifecycleResult.ts` / `context/graph/contextPacketResult.ts`
> → `context/acquisition/graph.ts` → `planning/runtime/engine.ts`（**零 value 导入者**）。
> 即：**不是"两条路径不连通"，而是"一条路径被删除后，它产生的数据无人接管"**——
> 孤立发生在 turn 迁移 `a7418fcb` 时。详见 `cb-005-recommendation.md`。

终态判定同理：`turn/projection.ts:concludeRun`（2 分支）与
`evidence/verdictFacade.ts`（三态裁决）分属两侧，**不汇合**。

### 由此产生的已确认破坏

| 破坏 | 表现 | 证据 |
|---|---|---|
| **#3** `provenance` 5 读 0 写 | `sessionTerminalState` 等 5 处 CLI 可达读取者恒得 `undefined`；兜底 evidence 生产者已删 | 附十四 |
| 终态真实性不完整 | `concludeRun` **完全不看** `verification.status` / `taskSatisfaction.verdict` / `failedFiles`，**"编辑成功但验证失败"会报 success** | 附八 |
| 10 项候选全部不恢复 | provider 解析、验证阶梯、taskLifecycle 编排等的消费链终点在 `context/acquisition`，**不到 turn** | 附八 |

### 为什么不能单独修 #3

活轨在审批点**确实持有数据**（`turn/tools.ts:123` 的
`approvals = new Map<string, { operation, decision }>()`），
但 `afterToolCall` 的返回类型**只允许 `{ output }`**（`turn/tools.ts:175`），
无结构化通道传给 `codingResult`。

即：不是"恢复一个被删文件"，而是**在两个子系统之间架一条新通道**。
单独修一处会在架构立项时返工。

### 处置建议

**记录，不单独修复。** 待"turn 与编排层连通性"作为独立架构立项时，
一并解决：终态数据来源、验证结果传递、审批 provenance 通道、retry 归属。

**这是本项目最大的结构性技术债**：它使得"活轨有的能力"与"编排层有的能力"
长期各半，且每次删除都会在其中一侧造成不可见的缺失。

---

## CB-006 OpenAI account-auth 可登录但无法使用

- **状态**：`已裁决 — 登记不改`（2026-09-17）
- **来源**：`deleted-audit-2026-09-16.md` 附十六

### 事实

`/connect login openai --account` 的 OAuth 链路**完整可走通**，登录成功后
会话显示 connected。但**每一次对话必然失败**：

| 环节 | 位置 | 行为 |
|---|---|---|
| 凭据解析 | `providerCredentials.ts:185-197` | account-auth 产出**不含 `apiKey`** |
| readiness | `providerReadiness.ts:138-141` | `return { ok: true }`（注释：*"Let the model adapter do the real call"*） |
| 执行 | `turn/step.ts:131` | `Authorization: Bearer ${request.provider.apiKey}` |
| 填充 | `cliRuntimeInvocation.ts:201` | `?? ""` → 空字符串 |

发出 `Authorization: Bearer `（空），请求必然被拒。

### 缺失的知识（仅在已删 adapter 中）

| 知识 | 已删位置 |
|---|---|
| Codex 端点 `https://chatgpt.com/backend-api/codex/responses`（+ fallback） | `OpenAIModelAdapter.ts:26,352` |
| `instructions` 字段要求 | `normalize.ts:187-189` |
| `toCodexResponsesRequestBody`（拒 `max_output_tokens`、需 `store:false`） | `normalize.ts` |
| token refresh（access/refresh 交换 + 持久化） | `OpenAIModelAdapter.ts:381-472` |

活轨仅保留 `originator: "codex_cli_rs"`（`auth/oauth/providers.ts:44`）。

### 维护者裁决（2026-09-17）

**登记不改。** 恢复 codex 调用路径属新增 provider 能力，且同属 CB-005 的
"两套 provider 路径不连通"——统一该架构时应一并解决。

### 已知代价

account-auth 登录入口**仍然可用**，用户可完成登录并看到 connected，
但随后的对话会失败。**这是已知的、已记录的行为**，非新发现缺陷。

---

## 登记流程（供后续复用）

1. 发现测试期望 ≠ 生产实现时，先判定：**是回退（实现改坏了）还是缺失（从未实现）**。
   - 回退 → 属重构范围内的修复。
   - 缺失 → 登记到本文档，状态 `待裁决`，并向维护者询问。
2. 维护者裁决后更新状态为 `已批准` / `已拒绝`。
3. `已拒绝` → 删除或收窄对应测试断言。
4. `已批准` → 独立立项实现，实现时把对应测试从失败/跳过状态恢复为通过。
