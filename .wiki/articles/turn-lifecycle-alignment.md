---
title: "Turn 生命周期架构对齐与演进方案"
category: article
sources: [local-turn-state, reference-session-model, turn-quality-audit, commit-0c66bfe5-review]
created: 2026-09-11
updated: 2026-09-12
tags: [turn, session, lifecycle, alignment, architecture, refactor]
summary: "对 commit 0c66bfe5 进行深度 review，查清全仓 turn 相关 demo 级代码，完整复盘顶级标杆会话与 turn 核心机制，制定分层收敛与生产级重构方案。"
confidence: high
---

# Turn 生命周期架构对齐与演进方案

> 本文档针对最新提交 `0c66bfe5`（`docs(turn): record lifecycle alignment exploration`）进行全面 review 与深度修正。
> 梳理并提取当前仓库中所有与 turn 相关的 demo 级早期残留，对照顶尖标杆项目的两层会话架构（底层状态机 + 上层产品会话门面），制定零外部依赖、无专有名词堆砌、高内聚低耦合的落地重构方案。

---

## 1. Commit `0c66bfe5` 审查结论（Review Report）

### 1.1 审查结论概述
Commit `0c66bfe5` 初步梳理了当前仓库中 turn 相关的部分文件清单，并定性指出了诸如快照 ID 碰撞、取消为 fire-and-forget、压缩实现分散等缺陷。但在以下核心架构维度存在严重探索不深入、认知不完整或学习不到位的问题：

1. **未厘清“外层交互轮次（Outer Prompt Turn）”与“内层模型步进（Inner Loop Step/Turn）”的本质差异**：
   - 误将交互层面的用户提示轮次与 ReAct 引擎内部的工具迭代轮次混为一谈，导致全仓 `turnNumber`、`turnIndex`、`turnId` 概念严重分裂。
2. **完全缺失标杆的两级消息队列模型（Steering Queue 与 Follow-Up Queue）**：
   - 原文仅有一句“steering 在每 turn 后检查，follow-up 在停止时检查”，未探索在流式运行中用户输入如何分流、队列排队策略（`all` vs `one-at-a-time`）以及如何在不打断当前 run 的前提下注入转向指令。
3. **未击中取消异常的真实根因，缺乏异步终态等待屏障（Async Abort & Idle Barrier）**：
   - 用户在取消时频繁遭遇 `Network error: This operation was aborted`，原文归因为简单的 fire-and-forget，未揭示标杆如何通过 `ActiveRun`、统一在 catch 中合成合法的 `aborted` 助手消息、并通过 `await waitForIdle()` 阻塞至所有下游监听器完全结算的机制。
4. **缺失完整的工具生命周期管线与输出截断防御（Truncation Defense）**：
   - 未探索标杆中的工具参数校验（`validateToolArguments`）、参数预处理（`prepareArguments`）、前置与后置拦截钩子（`beforeToolCall`/`afterToolCall`）、并行与串行动态调度；尤其遗漏了当模型因 token 上限截断（`stopReason === "length"`）时，必须主动拒绝执行工具调用以防止损坏用户文件的关键防御。
5. **未触及存储时机与持久化不变量（Persistence Invariants）**：
   - 现存代码在每个流式事件均落盘导致高 I/O 且存在半写碎行风险，且在中断时容易遗留未闭合的悬挂工具调用（dangling tool calls），导致后续 API 彻底报错；标杆坚持仅在完整消息结束（`message_end`）与压缩/会话事件时落盘。
6. **未提供压缩机制的统一收敛闭环**：
   - 仅罗列了 4 处压缩代码，未学习标杆基于上下文窗口阈值（`tokens > contextWindow - reserveTokens`）的单点决策机制，以及前置预测压缩（proactive）与上下文溢出自愈（reactive overflow recovery）的双触发协同。
7. **未给出双轨执行循环（Dual-Loop Schism）的消解与迁移路径**：
   - 遗留了 `agentLoop.ts` 与 `core/query/runtime/loop.ts` 两套并行引擎并存的问题，未设计向两层架构（通用执行内核 + 会话状态外观）平滑过渡的具体类图与接口契约。

---

## 2. 当前仓库 Turn 模块所有权地图与 Demo 级代码清单

当前仓库共有 10 大核心 demo 级残留代码，分散在 CLI 交互、执行核心、事件总线、持久化与投影等模块中：

### 2.1 Demo 级代码清单与源码指引

| 序号 | 缺陷类别 | 涉及源码路径与行号 | 现实表现与危害 | 标杆对照方案 |
|---|---|---|---|---|
| **D-01** | **双轨执行割裂** | `packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts:48-60` | 根据是否存在 `runtimeSeed` 分支走向 `runQueryLoop`（合约循环）或 `agentLoop`（ReAct 循环），事件协议互不兼容，系统处于人格分裂状态。 | 统一为单一的通用执行内核，消除合约循环分支。 |
| **D-02** | **轮次语义冲突** | `interactiveMode.ts:106`, `cliRuntimeModule.ts:373`, `agentLoop.ts:313` | 外层 UI 以用户输入为 Turn（Turn 1, Turn 2），内层 ReAct 以 LLM 调用为 Turn（1..maxTurns），展示层与执行层轮次无法对应。 | 解耦为 `SessionTurn`（用户会话轮次）与 `AgentStep`（内核迭代步进）。 |
| **D-03** | **粗暴 FIFO 输入缓冲** | `interactiveMode.ts:109` (`queue: string[] = []`) | 在繁忙时用户提交的所有内容被直接 push 到简单字符串数组，无法区分转向意图、后续指令或控制命令。 | 引入具备 `steering` 与 `followUp` 区分的结构化待办队列。 |
| **D-04** | **非受控取消泄漏** | `sessionRuntime.ts:309`, `agentLoop.ts:441-451`, `turnSink.ts:87-97` | 取消是同步非阻塞的，底层 fetch 抛出 `AbortError` 后在 catch 中被错误识别为 `Network error` 抛出，终端出现报错红字。 | 异步 `abort()` + 保证合成终止消息 + `waitForIdle()` 结算屏障。 |
| **D-05** | **循环内粗糙压缩** | `agentLoop.ts:279-330` (`executeFullCompaction()`) | 在循环迭代内部就地截断并直接重写 `messages` 数组，与外层 `SessionManager` 及压缩配置完全脱节。 | 将压缩收敛至下轮准备钩子（`prepareNextTurn`）中统一计算。 |
| **D-06** | **截断输出误执行风险** | `agentLoop.ts:400-435`, `jsonRepair.ts` | 当模型输出达到 max_tokens 被截断时，依赖 jsonRepair 强制拼凑出破损的工具参数并继续执行，存在误删或错改文件风险。 | 识别 `stopReason === "length"`，主动阻断工具调用并报错回传模型。 |
| **D-07** | **逐事件落盘与悬挂工具风险** | `session/agent/persistence.ts:45-72`, `agentLoop.ts:113-124` | 每个 delta 事件追加写文件，性能低下；中断时产生未闭合的 tool_call，迫使下游在转换 chat 时伪造取消消息修补。 | 严格执行 `message_end` 原子落盘，保证工具调用与结果强原子配对。 |
| **D-08** | **虚假兼容门面** | `turn/turnFacade.ts:106-113` (`streamProductTurn`) | 声明为流式门面，实际直接原样透传 `streamMvpIntegratedFlow`，快照和存证拦截完全被绕过，为纯死代码。 | 彻底废弃无用的门面层，由标准化会话监听器处理。 |
| **D-09** | **UI 状态指标伪造** | `turnSink.ts:155-160` (`tokens: 0`) | `activity()` 中实时 token 数量被硬编码为 0，流式期间 UI 无法展现上下文与生成开销。 | 基于会话累计用量与流式估算器实时驱动活动指示器。 |
| **D-10** | **无意义的投影对象** | `orchestration/turnKernel.ts:26-38`, `turnCapabilityPlan.ts` | 纯内存算子，对运行时没有反向约束，抛出通用字符串异常，未接入真实执行流。 | 移除冗余投影层，收敛至清晰的状态机上下文中。 |

---

## 3. 标杆架构的深度解构与设计精髓

标杆会话系统之所以具备极高的工业级稳定性，核心在于其**严格的两层解耦架构**与**严密的状态流转状态机**。

```mermaid
graph TB
  subgraph Layer2 ["上层：产品会话门面 (Session Manager)"]
    UI[CLI / TUI / 交互通道] --> Session[会话管理器 AgentSession]
    Session --> Persist[原子持久化 (仅在 message_end / compact 时)]
    Session --> CompactEngine[统一压缩引擎 (Token 阈值 / 溢出自愈)]
    Session --> ToolHooks[权限与生命周期拦截 (before / after)]
  end

  subgraph Layer1 ["底层：通用执行内核 (Agent Core)"]
    Session --> Core[代理核心状态机 Agent]
    Core --> InQueues[双待办队列: Steering / FollowUp]
    Core --> Loop[执行循环 agentLoop]
    Loop --> Stream[LLM 流式转换与输出]
    Loop --> ToolExec[工具批次执行: 截断防御 / 串并行 / 取消捕获]
  end

  Loop -. 统一类型化事件 .-> Session
```

### 3.1 两层架构职责划分

#### 底层：通用执行内核（Agent Core）
- **无状态/纯净运行时**：不关心具体的 UI 展示格式，不直接操作磁盘会话文件，仅持有内存中的上下文、工具集和模型配置。
- **内层步进循环（Inner Step Loop）**：一个 Run 可以包含若干个 Step（Turn），每一次 Step 包含一次 LLM 交互和随后的工具批次执行。
- **生命周期守护（Run Lifecycle）**：通过 `ActiveRun` 结构持有全局 `AbortController` 与 `resolve` 回调，确保无论是正常结束、出错还是主动中断，都能在 `finally` 块中完成状态复位，并通过 Promise 对外提供终态可等待性（`waitForIdle`）。

#### 上层：产品会话门面（Session Manager）
- **会话持久化权威**：负责维护树状历史、单行消息追加与分支元数据。
- **上下文守护者**：作为压缩和系统提示词更新的唯一决策点。
- **安全与权限闸门**：通过 `beforeToolCall` 和 `afterToolCall` 实现动态权限校验、用户确认阻断及工具结果脱敏。

---

### 3.2 核心机制深度拆解

#### 机制 A：外层交互轮次与内层模型步进的分离
- **外层交互轮次（User Interaction Turn）**：
  - 由用户敲击回车、调用 `/continue` 或外部事件触发；
  - 伴随生命周期事件：`agent_start` $\rightarrow$ `agent_end` $\rightarrow$ `agent_settled`。
- **内层模型步进（Model-Tool Step）**：
  - 核心循环内的每一次模型调用与工具执行；
  - 伴随生命周期事件：`turn_start` $\rightarrow$ `message_start` $\rightarrow$ `message_end` $\rightarrow$ `tool_execution_*` $\rightarrow$ `turn_end`。
  - 在一次外层轮次中，模型通过多次内层步进完成复杂推理与多阶段工具调用；当所有工具调用返回且模型不再发起新的调用时，内层循环退出。

#### 机制 B：Steering（转向）与 Follow-Up（跟进）双队列模型
当智能体正在流式生成或执行耗时工具时，外部输入不应粗暴报错或简单堆叠：

```text
用户在 Agent 运行中提交输入:
  ├─ 选择 "steer" (转向):
  │    └─ 压入 steeringQueue
  │    └─ 在当前步进结束后、下一个助手生成前，立即作为上下文注入
  │    └─ 智能体在不停机的情况下实时根据用户新意向调整行动路径
  └─ 选择 "followUp" (跟进):
       └─ 压入 followUpQueue
       └─ 智能体完成当前任务的所有工具调用并准备停止时，取出跟进消息
       └─ 无缝启动下一轮外层轮次，无需用户二次确认
```

- 队列支持配置消费模式 `QueueMode`：`"one-at-a-time"`（单步消费）或 `"all"`（一次性清空）。

#### 机制 C：安全取消与异步终态屏障（Async Abort & Idle Barrier）
彻底消除 `Network error: This operation was aborted` 的根本解法：

1. **取消接口必须异步**：
   ```ts
   async abort(): Promise<void> {
     this.abortRetry();
     this.abortCompaction();
     this.agent.abort();
     await this.waitForIdle(); // 必须阻塞等待底层完全静止
   }
   ```
2. **底层捕获并合成标准终止消息**：
   在底层执行的 `catch (error)` 中，如果检测到 `signal.aborted === true`，绝不向上层抛出未处理异常，而是合成一个标准助手消息：
   - `role: "assistant"`
   - `stopReason: "aborted"`
   - `errorMessage: "Operation aborted"`
   - 随之正常依次派发 `turn_end` 与 `agent_end`。
3. **终态屏障保证一致性**：
   UI 层与持久化层在接收到 `turn_end`（带 aborted 标志）后，正常关闭活动状态，绝不会将中断误报为网络崩溃。

#### 机制 D：工具执行截断防御与健壮性保障
1. **Token 超限截断防御（Truncation Defense）**：
   当模型返回的 `stopReason === "length"` 时，说明生成的 JSON 参数在物理上已被截断。即使字符串修复算法能勉强补齐闭合括号，其参数语义必然残缺（如文件名被截断、命令字符串丢失尾部）。
   标杆行为：**立即阻断该批次所有工具调用**，对每个调用生成明确错误结果：
   > `Tool call "xxx" was not executed: the response hit the output token limit... Re-issue with complete arguments.`
   回传模型重新发起，彻底杜绝破坏性意外操作。
2. **工具动态调度**：
   检查当前批次工具元数据，只要有一个标记为 `executionMode: "sequential"`，整批严格按序执行；其余情况使用 `Promise.all` 享受并发优势。
3. **更新流式传输**：
   执行器提供 `onUpdate` 回调，使长时间运行的工具（如 bash、外部 API）能够持续推送局部进度，驱动终端实时刷新。

#### 机制 E：原子持久化与存储不变量
1. **落盘触发点**：
   - 仅在 `message_end` 时将完整消息追加至持久化存储；
   - 在 `compaction_end` 时追加压缩节点与元数据。
2. **调用-结果成对不变量（Tool Pairing Invariant）**：
   - 永远不允许在存储中出现“存在 `tool_calls` 但其后没有对应的 `toolResult` 消息”的状态；
   - 哪怕由于中断提前终止，合规的终止逻辑也不包含悬挂工具调用，保证会话恢复重放时 100% 符合模型提供商的校验要求。

#### 机制 F：双触发统一上下文压缩体系
消除全仓 4 个重复压缩模块，构建统一的压缩策略：
- **前置预测压缩（Proactive Threshold Compaction）**：
  在每个 Step 启动前的单一入口点（`prepareNextTurnWithContext`）中，调用：
  `shouldCompact(currentTokens, contextWindow, settings)`
  当 token 占用超过预留安全水线（例如 `contextWindow - reserveTokens`）时，在本次请求发送前自动执行微缩并更新上下文。
- **后置溢出自愈（Reactive Overflow Self-Healing）**：
  若提供商依然返回 `context_length_exceeded` / `context_overflow`，内核捕获该特定异常，强制触发应急深度压缩，成功后重试当前步进。
- **压缩内容范式**：
  保留第一条系统提示词 + 结构化压缩摘要 + 最近 N 轮完整交互（保留关键语义上下文与最近工具反馈）。

---

## 4. 本仓库适配重构设计方案

为严格遵守项目规则，我们设计高聚合、低耦合的复用方案：**不使用任何外部项目的专有名词或标签，文件名保持简短、职责单一**。

### 4.1 核心领域分层与文件职责规划

```text
packages/ts-shell/src/
  ├── core/
  │   └── agent/
  │       ├── state.ts        # 代理运行时状态机与可变数据容器
  │       ├── queue.ts        # 待办队列管理 (Steering / FollowUp)
  │       ├── events.ts       # 统一生命周期事件类型定义
  │       ├── loop.ts         # 单一 ReAct 执行循环 (替代现有双轨)
  │       ├── tools.ts        # 工具调用准备、参数校验、截断防御与分发执行
  │       └── agent.ts        # 通用代理内核 (ActiveRun 生命周期管理)
  ├── session/
  │   ├── context.ts          # 会话上下文定义与 Token 估算
  │   ├── compaction.ts       # 统一压缩引擎 (前置阈值检查与自愈恢复)
  │   ├── persistence.ts      # 原子持久化适配器 (message_end 挂载)
  │   └── session.ts          # 产品级会话门面 (对齐两层模型)
  └── cli/
      └── interactive/
          └── turnSink.ts     # 消费标准 AgentEvent，驱动 TUI 渲染
```

### 4.2 核心接口契约设计（TypeScript）

#### 1. 待办队列接口与消费模式 (`core/agent/queue.ts`)
```ts
export type MessageQueueMode = "one-at-a-time" | "all";

export interface PendingQueue {
  enqueue(message: SessionMessage): void;
  hasItems(): boolean;
  drain(): SessionMessage[];
  clear(): void;
  mode: MessageQueueMode;
}
```

#### 2. 通用代理事件联合体 (`core/agent/events.ts`)
```ts
export type AgentLifecycleEvent =
  | { readonly type: "agent_start" }
  | { readonly type: "agent_end"; readonly messages: readonly SessionMessage[] }
  | { readonly type: "turn_start" }
  | { readonly type: "turn_end"; readonly message: SessionMessage; readonly toolResults: readonly SessionMessage[] }
  | { readonly type: "message_start"; readonly message: SessionMessage }
  | { readonly type: "message_update"; readonly delta: string; readonly message: SessionMessage }
  | { readonly type: "message_end"; readonly message: SessionMessage }
  | { readonly type: "tool_execution_start"; readonly toolCallId: string; readonly toolName: string; readonly args: unknown }
  | { readonly type: "tool_execution_update"; readonly toolCallId: string; readonly partialResult: unknown }
  | { readonly type: "tool_execution_end"; readonly toolCallId: string; readonly toolName: string; readonly isError: boolean };
```

#### 3. 执行内核准备与拦截接口 (`core/agent/agent.ts`)
```ts
export interface NextStepContext {
  readonly context: AgentContext;
  readonly lastMessage?: SessionMessage;
  readonly toolResults?: readonly SessionMessage[];
}

export interface NextStepUpdate {
  readonly context?: AgentContext;
  readonly model?: string;
  readonly thinkingLevel?: string;
}

export interface AgentCoreOptions {
  readonly initialState?: Partial<AgentState>;
  readonly beforeToolCall?: (call: ToolCallIntent, signal?: AbortSignal) => Promise<ToolCallDecision | undefined>;
  readonly afterToolCall?: (outcome: ToolExecutionOutcome, signal?: AbortSignal) => Promise<ToolExecutionOutcome | undefined>;
  readonly prepareNextStep?: (context: NextStepContext, signal?: AbortSignal) => Promise<NextStepUpdate | undefined>;
}
```

#### 4. 异步取消终态保证 (`core/agent/agent.ts`)
```ts
export class AgentCore {
  private activeRun?: {
    readonly promise: Promise<void>;
    readonly resolve: () => void;
    readonly abortController: AbortController;
  };

  public abort(): void {
    this.activeRun?.abortController.abort();
  }

  public waitForIdle(): Promise<void> {
    return this.activeRun?.promise ?? Promise.resolve();
  }
}
```

---

## 5. 分阶段落地与迁移路线图

本方案按照依赖关系自底向上推进，确保每个步骤均可通过单元测试独立验证：

### Phase 1：内核执行循环与生命周期收敛（Foundation Layer）
1. **新建 `core/agent/` 模块**：
   - 提取并适配统一状态机 `state.ts` 与双待办队列 `queue.ts`；
   - 实现无依赖的通用循环 `loop.ts`，内置 `stopReason === "length"` 截断防御，支持工具并行与串行执行；
   - 实现 `agent.ts`，统一包装 `runWithLifecycle` 与 `waitForIdle` 终态控制。
2. **测试门禁**：
   - 验证中断时正常生成 `aborted` 消息且事件完整结算；
   - 验证截断输出时工具拒绝执行并正确报错。

### Phase 2：产品级会话门面与原子持久化（Session Layer）
1. **重构 `session/` 模块**：
   - 统一持久化逻辑：监听 `message_end`，仅在消息完结时写入磁盘，彻底消除逐 delta 写入与不闭合 tool_call 风险；
   - 统一压缩逻辑：整合分散在 `agentLoop.ts`、`compaction.ts`、`retentionPlanner.ts` 中的逻辑，由单一 `CompactionEngine` 在 `prepareNextStep` 统一调度。
2. **测试门禁**：
   - 验证大上下文交互时前置压缩平滑触发；
   - 验证会话序列化在任意异常退出后依然满足结构完整性校验。

### Phase 3：输入路由与取消机制升级（Interactive Surface）
1. **升级 `interactiveMode.ts` 与 `interactiveCommandRouter.ts`**：
   - 移除原始的 `queue: string[]` 缓冲，接入 `steeringQueue` 与 `followUpQueue`；
   - 将 `interrupt()` 改为异步安全调用：
     `await session.abort()`；
   - 升级 `turnSink.ts`：直接挂载标准 `AgentLifecycleEvent`，移除硬编码 `tokens: 0`。
2. **测试门禁**：
   - 验证流式生成中按 Esc 或 Ctrl+C 能够优雅停机，终端无红字抛出；
   - 验证流式期间提交转向指令能正确注入下一模型步进。

### Phase 4：清理死代码与双轨终结（Legacy Purge）
1. **彻底移除历史兼容包袱**：
   - 废弃 `packages/ts-shell/src/turn/turnFacade.ts`；
   - 移除 `core/query/runtime/loop.ts`（合约循环分支），全量走标准化 `core/agent/loop.ts`；
   - 移除 `orchestration/turnKernel.ts` 与 `turnCapabilityPlan.ts` 中不可达的伪投影代码；
   - 清理代码注释中所有残留的外部项目提及。
2. **全量回归验证**：
   - 运行针对会话、执行、TUI 交互与持久化的全量集成测试，确保 NormProof 架构合规验证通过。

---

## 6. 内核提交复核记录（76c11617 / b5805314 → 本次修补）

对 Phase 1 内核两笔提交进行逐文件对照复核，确认双队列、截断防御、异步取消与终态屏障均已按第 3 节机制落地；发现并修补一处行为缺口：

### 6.1 发现与修补

1. **continue() 拒绝队列重启**（agent.ts）
   - 现象：运行中断或异常结束后，转写以 assistant 结尾，此时调用 `continue()` 即使 steering/followUp 队列中仍有待办输入也直接抛出 `Cannot continue from message role: assistant`，用户排队指令被死锁，只能手动重新 prompt（造成上下文重复）。
   - 修复：对齐标杆语义——continue 时先检查队列：steering 非空则以其为新 prompt 重启（并跳过首轮 steering 轮询避免重复消费）；否则回退 followUp；两者皆空才维持拒绝。转写为空但队列有输入时同样允许启动。
   - 配套：`runAgentLoop` 新增 `skipInitialSteeringPoll` 选项；`prompt()` 与队列重启路径统一收敛至私有 `runPromptMessages()`，消除重复执行体。

### 6.2 复核确认无误的机制清单

- 截断防御：`stopReason === "length"` 时 `failTruncatedCalls` 全批拒绝并回传重发指引（tools.ts / loop.ts）。
- 中断配对：`executeToolBatch` 在 abort 后为未获结果调用补齐 aborted 工具结果，杜绝悬挂 tool_call；失败路径 `handleRunFailure` 合成 `stopReason: aborted/error` 的标准 assistant 消息并依次派发 turn_end / agent_end。
- 终态屏障：`waitForIdle()` 返回活动 run 的 promise；监听器异常经 reject 透出且保留上轮终态。
- 双队列消费：steering 在每步完成后、下一助手生成前注入；follow-up 仅在停止点消费；mode 支持 one-at-a-time / all。
- 历史完整：失败 `agent_end` 携带全量已产生消息而非仅失败消息。

### 6.3 验证

- 新增 3 项回归测试（steering 队列重启 / followUp 回退 / 空队列拒绝），内核 5 套件 57 项全部通过。
- `core/agent` 模块 tsc 无错误（仓库存量两处测试类型错误属历史遗留，与本次无关）。
- `build:ts` 通过。

---

## 7. 三子代理并行深审复核记录（76c11617 / b5805314 / 1f07cd99 → 本次修补）

三路只读子代理对照标杆逐项核查，裁决与修补如下（误报与延后项已排除）：

### 7.1 确认修补（HIGH/MEDIUM）

1. **工具结果缺消息事件（HIGH，loop/tools）**——tool 结果只 push context/produced，从不 emit message_start/end，导致 AgentCore 状态机经 processEvents 永远收不到 tool 消息，`internalState.messages` 丢失工具结果。修复：在创建点（runSequential / runParallel / failTruncatedCalls / abort 配对合成）统一经 `emitToolResultMessage` 补发 message_start/end，与标杆 `emitToolResultMessage` 顺序一致（execution_end → message_start → message_end）。
2. **截断无标记（MEDIUM，tools.ts）**——`boundText` 硬切 10000 字符无任何标记，模型无法感知截断。修复：追加 `[... output truncated to N chars]` 后缀；配对点位置不变。
3. **afterToolCall 抛错被吞（MEDIUM，tools.ts）**——catch 后静默返回原结果，与标杆转错误结果不一致。修复：对齐标杆，返回 `Tool result hook error: ...` 的 isError 结果。
4. **lastRun 未处理拒绝（MEDIUM，agent.ts）**——监听器抛错时 prompt 与 lastRun 双拒绝，只消费 prompt 的调用方触发 unhandledRejection。修复：创建后预挂 `promise.catch(() => {})`，await 语义不变。
5. **reset 未清 lastRun（LOW，agent.ts）**——失败后 reset 再 waitForIdle 仍 reject 旧失败。修复：reset 末尾清 `lastRun`。
6. **缺运行时队列模式切换（LOW，agent.ts）**——构造后无法切换 drain 策略。修复：新增 `setQueueMode(queue, mode)` 单方法（方法数 18，合规）。
7. **abort 配对 O(n²)（LOW，tools.ts）**——`pairedIds.includes` 改为 Set。

### 7.2 经核实排除项

- F1-loop（streamStep/prepareNextStep 抛错无终态事件）：误报。`runWithLifecycle` catch → `handleRunFailure` 已保证 turn_end/agent_end 合成，abort/error 测试即为证明。
- 双轨残留（agentLoop / query/runtime/loop / turnFacade / turnKernel 仍在生产路径）：属实但按第 5 节 Phase 4 路线图延后，本次不动生产路径；新内核零生产接入状态不变。
- 空转写+有队列启动与参考分歧：刻意改进（已在 6.1 记录），本次补测试锁定。
- 脱敏哨兵 `private-agents-real` 字面量：属安全脱敏逻辑与测试中毒字符串，非外部项目标签，不处理。

### 7.3 验证

- 新增 8 项回归测试（tool 消息事件×2、hook 抛错、空转写队列启动、reset 清屏障、运行时切 mode、loop 全序列锁定、截断标记更新×2），内核 5 套件 62 项全部通过。
- 内核 + 会话 67 套件 361 项全部通过；`build:ts` 通过；AgentCore 方法数 18，合规。

---

## 8. Phase 2 双子代理探索复核记录（aeeb2330 / d79b73f5 → 本次修补）

两路只读子代理对照参考项目的压缩与持久化机制，裁决与修补如下。参考的 DAG/Entry 树/Usage 账本/预留 ID 强校验属远期架构（Phase 4+），本次只修 Phase 2 范围内真实缺陷：

### 8.1 确认修补（HIGH/MEDIUM）

1. **配对判定方向反了（HIGH，compaction.ts）**——`hasDanglingCalls` 要求切点前所有调用的结果必须落在切点之后，但切点之后是保留尾、切点之前才是被丢弃头；任何含工具调用的历史都找不到合法切点，工具场景下压缩永不触发。修复：改为头部自闭合判定——切点前的调用必须在切点前已有结果；切点后的配对随保留尾完整保留。
2. **压缩落盘无接线（MEDIUM，compaction.ts）**——`createCompactionStep` 压缩成功后从不通知转写器，`recordCompaction` 无生产调用方，转写里永远没有 compaction 条目。修复：新增可选 `onCompact` 回调，成功时透出 summary/keptMessages/tokensBefore，调用方直连 `recordCompaction` 即可闭环。

### 8.2 经核实排除/延后项

- 摘要 user 角色混入、token 预算切点、溢出自愈重试、Usage 账本、预留 ID 强校验、torn 尾物理修复：均为参考远期形态，本地简化版（按条数切 + user 检查点 + fail-open）在 Phase 2 设计文档范围内，不在本轮改动；已记入 Phase 4+ 演进。
- `estimateTokens` 未计 id/timestamp：体积极小，可接受。
- `findCompactionCut` 负下标与 `reserveTokens: 0` 语义：已验证正确（`??` 保留 0，负起始直接返回 undefined）。

### 8.3 验证

- 新增 2 项回归测试（头部自闭合切点可用、onCompact 透出记录），会话 3 套件 36 项通过。
- 会话 + 内核 70 套件 397 项全部通过；`build:ts` 通过。
---

## 9. Phase 2 三路审计与 Phase 3 交互升级记录（fcab75a5 → 本次）

三路只读子代理（内核审计 / 持久化审计 / 交互表面测绘）对照参考语义逐项核查，裁决如下：

### 9.1 Phase 2 无需修补

1. **内核审计：无 HIGH/MEDIUM**——工具结果消息事件、abort 配对、截断防御、终态屏障、双队列消费、失败历史携带全部成立；6 个 LOW 均为可接受分歧（steering-skip 实现层不同而效果等价、lastRun 拒绝透出优于参考吞掉、失败 agent_end 携带全量历史、省略 schema 强校验、onUpdate fire-and-forget、空转写队列启动为刻意改进）。
2. **持久化审计 scout 失败**（模型不可用，非结论性失败）——亲补：生产写路径已有 tmp+fsync+rename 原子保护（sessionFileStore.ts），新 writer 为纯内存订阅器、Phase 4 前不接生产路径，无双写 hazard；writer 丢弃字段（tool_calls 数组等）仅影响新内核回放，不碰生产转写。
3. **Phase 2 基线 98/98 全绿**，确认无需修补，直接进入 Phase 3。

### 9.2 Phase 3 落地（中断等待三项；转向路由未动）

1. **可等待 idle（sessionRuntime.ts）**——`executePrompt` 拆分为 track（`trackRun` 登记 currentRun/lastRun，预挂 catch 防 unhandledRejection）与 `drivePrompt`（原方法体）；新增 `waitForIdle()`（显式 await 透出失败，对齐 AgentCore）与 `cancelAndWait()`（abort 后等待结算，内部吞错：Esc 与 provider 失败竞态时 interrupt 方恒成功，失败归因以 run 侧为准）。`cancelCurrentRun()` 同步语义不变，3 处生产调用方（signalHandlers/interactiveCancellation/interactiveCommandRouter）零改动，interrupt 一处切异步。已知语义：lastRun 失败后粘滞（每次 waitForIdle 都 reject 直至下一 run 登记），本模块无清理通道；空闲 cancel 会无条件翻状态机为 interrupted（历史行为）。
2. **队列类型化（interactiveMode.ts）**——`queue: string[]` 改为 `{ text, disposition: "followUp" }` 数组；busy 时输入记 followUp 语义（运行中输入默认跟进），drain 取 text，`queuedCount` 行为不变。`disposition` 当前只写不读：steering 路由尚未实现，为后续扩展留字段位。§5 Phase 3 门禁中的“转向指令注入下一步进”判未过，移至后续阶段。
3. **中断等待（interactiveMode.ts）**——`interrupt()` 改异步：`markCancelling` 后 `await cancelAndWait()`，消除 drain 与 run 结算竞态；keymap 合约 `interrupt(): void` 不变，host 侧 `void` 显式标记 fire-and-forget（`cancelAndWait` 内部已吞错，无拒绝风险）。渲染面“无红字”尚未被测试锁定（sessionIdle 只断 promise 结算；run 侧 abort 仍 throw，经 run catch 追加 error 文块）：全链路渲染测试成本过高，留待生产路径收敛时一并处理，门禁前半判部分通过。

---

## 9. Phase 3 双子代理探索复核记录（ec2af0e0 / 99cfcfb8 → 本次修补）

两路只读子代理对照参考项目的中断取消与输入队列机制，裁决如下。

### 9.1 探索结论

1. **中断语义**——参考分两层：内核 abort 纯同步（仅触发 AbortController），会话层 async abort（同步 abort 各域 + await 永 resolve 的 idle 门闩）；中断合成 `stopReason: aborted` 标准消息，`prompt()` 不抛；`waitForIdle` 永 resolve、无 lastRun、无 reject；Escape 为唯一逐 run 中断链（Ctrl+C 不中断）；防护靠永不 reject 的观察柄，无全局句柄。
2. **队列语义**——参考为 steering/followUp 双队列：busy 默认 Enter=steer（本轮内插队）、Alt+Enter=followUp（run 边界起新轮）；本仓 interactiveMode 自建第三个本地字符串队列，busy 输入只进本地队列、run 结束后顺序重放，与内核双队列（AgentCore / steerableQueue）零接线；`disposition` 字段只写不读。

### 9.2 本次修补（LOW）

1. **队列项 disposition 扩展为联合类型**（interactiveMode.ts）——`"followUp"` 单字面量连表达 steer 的能力都没有；扩展为 `"steer" | "followUp"` 并注释当前语义（全部按 followUp 重放）与未来接线方向。零行为变化，为 Phase 4 接线留好形状。

### 9.3 经核实排除/延后项

- **waitForIdle 透错 + lastRun 粘滞**：与参考语义相反，但 Phase 1 已有测试锁定透错契约（agent.test.ts），sessionIdle 同样锁定 reject；改语义等于推翻已锁定契约。本仓选择显式失败面（调用方必须处理失败），与参考的静默成功面是 deliberate 分歧，不动。
- **本地队列与内核双队列接通**：属 Phase 3 设计文档 §9 明确列为"转向路由未动"的遗留工作；旧轨生产路径（drivePrompt）无 steering 消费点，接通需先动生产循环。延后至 Phase 4，不动生产接线。
- **cancelAndWait 内吞错 / trackRun 预挂 catch**：与本仓透错语义配套（中断方恒成功、观察方可按需拿失败），正确，不动。

### 9.4 验证

- `build:ts` 通过；会话屏障 4 项 + 交互 21 套件 241 项全部通过。

---

## 10. Phase 4 前置四路审计门闩（b7daf547 前）

本轮仅做补充与修补，不开 Phase 4 新分支。派四路只读子代理地毯式复核，全部持 file:line 证据。

### 10.1 内核（KernelScout）—— 无 HIGH/MEDIUM

`queue/state/events/tools/loop/agent` 六文件与测试全部复核为 PASS；工具结果消息事件、abort 配对、length 拒执行并继续、退出前全量历史携带、idle 透错 + lastRun 粘滞、双队列 continue/skipInitialSteeringPoll 等均与参考一致。仅 2 个 LOW 为已记载的 deliberate 分歧，不修。

### 10.2 会话（SessionScout）—— 2 个 MEDIUM 已在 §8 记录为 Phase 4 接线工作

压缩策略/持久化 writer/内核钩子/参考对比全部验证；7 项既往修补均在文件。`proactive compaction 未挂载生产路径` 与 `token vs message 保留策略 drift` 属 §8 已知的 Phase 4 接线工作，不在本轮消化；其余 3 个 LOW 为启发式偏差或 schema 形态差异。

### 10.3 表面（SurfaceScout）—— queue 已拓宽、idle 已可等待，disposition 死字段等 3 个 MEDIUM 已在 §9.3 延后

`queue: Array<{text, disposition}>` 联合类型正确但只写不读、busy 默认 followUp 无 steering 消费点、idle 屏障已可等待（`waitForIdle`/`cancelAndWait` + `interrupt` 异步化且保留 sync 合约）、turnSink 边界与取消合成为刻意保形。剩余 MEDIUM 均为 Phase 4 本体工作。

### 10.4 遗留与横切（LegacyScout）—— 双轨待切、R-01..R-06 边际借用已评估

双轨（agentLoop / contract loop / turnFacade / turnKernel 等 D-01..D-10）仍在生产路径，新内核零生产接入——属 Phase 4 消化范围，本轮不切流量。R-02 `onUpdate checkpoint` 值得借用（本轮已拓宽，零行为变化），R-01 schema 校验与 R-03 溢出重试属 Phase 4 增量，R-04/R-05 已正确借用。

### 10.5 本轮修补

1. **tools.ts onUpdate 拓宽**（R-02 借用，LOW）——`onUpdate?: (partial, options?: {checkpoint?: boolean}) => void`，为长运行工具留位；busywait 测试不改（并发成立时机敏感，留 LOW）。
2. **文档沉淀**为本节。

### 10.6 验证

- `build:ts` 通过；内核 + 会话 70 套件 397 项通过；新文件零外部项目名称。

---

## 11. Phase 4 落地记录（565a79a1 → 本次）：双轨终结与内核接管生产路径

本轮为 §5 Phase 4 的正式落地：删除全部历史双轨与死投影，生产提示词路径全量切换到 `core/agent/` 内核，新建 `turn/` 领域作为产品级会话门面。设计取自参考项目的两层模型（内核纯循环 + 会话门面拥有持久化/压缩/队列），所有代码为复制适配后的本仓实现，无外部项目名称。

### 11.1 新增 `turn/` 领域（文件名短、职责单一）

| 文件 | 职责 |
|---|---|
| `turn/session.ts` | 一次用户轮次：构造内核、工具适配、`message_end` 持久化（跳过开场提示与空助手消息）、`prepareNextStep` 前置压缩、溢出一次压缩重试、`steer/followUp/pending/clearQueue` 输入句柄、运行终态汇报 |
| `turn/step.ts` | 唯一的模型调用点：流式/整体响应统一成 `AssistantStep`，`stopReason` 映射（`length` 触发内核截断防御），中断返回 `aborted` 并保留已流出的文本，溢出以前缀错误上报，`reasoning_effort` 拒绝仅重试一次，用量记账 |
| `turn/tools.ts` | 注册表工具 → 内核 `AgentTool`；`beforeToolCall` 依次做计划模式门、死循环熔断、权限范围升级（用户拒绝理由原文回传模型）、PreToolUse 钩子；`afterToolCall` 标注审批并附加 PostToolUse 反馈 |
| `turn/prompt.ts` | 稳定系统提示前缀、环境行、会话历史 → 聊天消息（悬挂调用合成取消、孤儿工具消息丢弃） |
| `turn/projection.ts` | 内核事件 → 既有 `QueryEvent`（工具卡片、终态），`concludeRun` 决定 completed/failed 与空答案解释 |
| `turn/completion.ts` | 原 `core/query/streamCompletion.ts` 整体迁入 |
| `turn/stream.ts` | 推送式异步通道，内核监听器与 shell 事件流的接缝 |
| `turn/synthetic.ts` | 无提供商的合成步进，供烟测与演示 |

### 11.2 生产接线变化

- `entrypoints/cliRuntimeInvocation.ts` 重写：真实模式先做就绪检查，再启动同一条轮次；合成模式走合成步进而非旧合约循环。返回 `{ events, input }`，`input` 为运行中输入句柄。
- `core/shell/sessionRuntime.ts`：`runPrompt` 可返回 `{ events, input }`；新增 `input()` 暴露当前运行的输入句柄；助手最终消息不再由 runtime 落盘（改由轮次在 `message_end` 落盘，工具消息同源）。
- `cli/runtime/cliSessionRuntimeFactory.ts`：装配自动压缩（阈值策略 + 提供商摘要 + `appendCompactionEntry` 落盘 + 上下文量表置未知）。
- 交互面：Enter 在运行中改为**转向**（下一步前注入），Alt+Enter 为**跟进**（运行边界后执行），空闲时 Alt+Enter 仍为换行；中断时未投递的输入回填到编辑器；提示行显示 `N steering` / `N queued`；按键指南同步。
- `session/compaction.ts` 检查点措辞与转写投影统一为 `[Context Checkpoint]`。

### 11.3 删除清单（生产路径零引用后删除）

`core/query/agentLoop.ts`、`core/query/runtime/{loop,engine}.ts`、`orchestration/runMvpIntegratedFlow.ts`、`runtime/workflowExecutionCoordinator.ts`、`runtime/{integratedFlowEnvironment,turnBoundary}.ts`、`orchestration/MultiAgentOrchestrator.ts`、`turn/turnFacade.ts`、`product/turn/`、`orchestration/{turnKernel,turnCapabilityPlan,turnReceiptAggregation,toolEcosystemCapabilityRoute,resultSurfaceModule}.ts`、`core/query/{steerableQueue,systemPromptBuilder,lightweightChat,lightweightRoute,routeDecision}.ts`、`turn/roleDraftStage.ts`、`provider/request/draft.ts`、`result/projection/workflow/runtime.ts`、`result/workflowRuntimeProjection.ts`、`context/{inspectFilesStage,readRuntimeStage,repoExplainRuntimeStage}.ts`、`edit/runtime/workflow.ts`、`verification/command/stage.ts`、`verification/commandStage.ts`、`session/persistence.ts`（Phase 2 内存转写器，已由 SessionManager 落盘替代）、`session/agent/events.ts`、`cli/runtime/cliPlanningMutationBridge.ts`、`entrypoints/{cliPlanningMutationExecution,cliProposalReviewSurface}.ts`，以及 `--apply-patch-*` / `--planning-mutation-*` CLI 标志。连带删除仅覆盖上述模块的测试 30 余个；对既含活模块断言的测试只删除驱动旧流程的用例。

### 11.4 验证

- `tsc -p tsconfig.build.json` 通过；本地图检查：`turn/`、`core/agent`、入口均无环；未解析导入数与改前一致（均为存量测试文件）。
- 新增测试：`turn/session.test.ts`（8）、`turn/step.test.ts`（6）、`turn/tools.test.ts`（6）、`turn/prompt.test.ts`（4），`entrypoints/cliRuntimeInvocation.test.ts` 重写（5），`keymap.test.ts` 与 `composer.test.ts` 锁定转向/跟进路由与提示。`turn/` 9 套件 59 项通过。
- 跨域聚合运行（core/session/cli/entrypoints/presentation/turn/orchestration/…）：改前 118 项失败、改后 57 项失败，无新增失败；减少的 61 项为随旧轨删除的用例。
- CLI 烟测：改前 15 失败/39 通过，改后 15 失败/31 通过（删除 8 个仅断言旧合成流程文本的用例），失败集合完全相同，均为改前既有的真实提供商与 `/continue` 断言；`GOLDEN_MAIN_PATH` 门禁在新内核上通过。
- NormProof 三条规范：无环、导入闭包不变、触及与新增模块函数名均 ≤ 20（`turn/session.ts` 为 19，`interactiveMode.ts` 方法数 20 不变）。

### 11.5 已知与遗留

- `runtime/loop/*`、`turn/{assistantResponse,toolResultMessage,nextTurnBundle,turnSnapshot,steeringQueue,followUpQueue,deliveryPolicy}.ts` 仍被 `runtime/loop/contract.ts` 与 `evidence/savepoint` 引用，本轮不动。
- 15 个既有 CLI 烟测失败（真实提供商链、`/continue` 结果面）在改前即失败，属存量，未在本轮范围。

### 11.6 双车道复核修补（a7418fcb → 本次）

双车道独立审查（code lane 31 文件 / arch lane 全域）：code lane REQUEST CHANGES（2 HIGH + 4 MEDIUM），arch lane WATCH（结构性债务 4 项，无 BLOCK）。

已修补（生产行为变化）：

1. **计划模式放行子代理调度（HIGH，turn/tools.ts）**——`task` 在允许表但子代理默认 BUILD 可写文件；已从计划允许表移除。旧引擎行为一致，属忠实移植的存量缺陷。
2. **计划模式放行全部浏览器动作（HIGH，turn/tools.ts）**——仅 bash 有只读豁免，click/type 照跑；现按只读动作表过滤（`READ_ONLY_BROWSER_ACTIONS` 已导出复用）。
3. **溢出标记大小写敏感（MEDIUM，turn/step.ts）**——`Context length exceeded` 等常见大小写被当普通失败；现统一小写匹配。
4. **就绪前输入静默丢失（arch WATCH 实为正确性缺陷，cliRuntimeInvocation.ts）**——就绪检查完成前的 steer/followUp 被代理丢弃；现缓冲并在启动后投递，`pending`/`clearQueue` 可见缓冲。
5. **doom 计数先于门禁（LOW，turn/tools.ts）**——被拒绝的调用也计入死循环并掩盖拒绝原因；现仅对通过门禁的调用计数，hook 拦截时清理审批记录。
6. **空输入边界（LOW，turn/session.ts）**——空白 steer/followUp 进队列造成存储与上下文分歧；现边界丢弃。
7. **解析错误回显无界（LOW，turn/step.ts）**——原始参数全文进上下文；现截断 500 字符。
8. **注释口径（LOW，turn/step.ts）**——`reasoning_effort` 作用域为 step 函数实例而非会话；已正注释。

跟踪中（本次不动，需后续决策）：

- **QueryEvent 旧联合体成为永久契约**：新路径只发 7 种 shell 变体，旧 `runtime.*`/`turn.*`/`query.retrying`/`mcp.snapshot` 变体已无生产者。后续二选一：冻结为 shell 契约并剪除死变体（projection 为文档化 owner），或让内核事件直达新消费者。不得静默双轨并存。
- **shell → turn 反向依赖**：`sessionRuntime.ts` 引 `TurnInput`（turn/session）、`core/shell/compaction.ts` 引 `toChatMessages`（turn/prompt）。后续将类型与纯函数下沉，恢复单向分层。
- **名称预算耗尽**：`turn/session.ts` 19/20、`interactiveMode.ts` 20/20。下次改动前先拆分（溢出恢复/conclude/队列句柄；host 历史与 picker 助手），不得为压数内联嵌套。
- **压缩失败静默**：`session.ts` 传 `undefined` 作 onError。无可用诊断通道（hook 事件无诊断位、transcript 污染不可取），保持静默，待可观测性方案后统一处理。
- **accept-edits 符号链接穿越**（toolPolicy.ts，本提交未触及）：lexical resolve 可被 workspace 内软链绕过。属存量问题，记入安全 backlog。
- **已删覆盖的风险接受**：cli-baseline 入口对等用例断言旧合成流程文本（不可移植）；recovery.* 四套件测旧 harness 交互，recovery.ts 本体测试保留。新路径由 turn 59 项 + GOLDEN_MAIN_PATH 覆盖，接受缺口。
