---
title: "Turn 生命周期架构对齐与演进方案"
category: article
sources: [local-turn-state, reference-session-model, turn-quality-audit, commit-0c66bfe5-review]
created: 2026-09-11
updated: 2026-09-11
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
