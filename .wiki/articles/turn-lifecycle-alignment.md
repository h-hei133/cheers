---
title: "Turn Lifecycle Alignment"
category: article
sources: [local-turn-state, reference-session-model, turn-quality-audit]
created: 2026-09-12
updated: 2026-09-12
tags: [turn, session, lifecycle, alignment]
summary: "Turn ownership map, demo-grade findings, and narrowly scoped alignment plan. Read-only exploration only; no production behavior changed."
confidence: high
---

# Turn Lifecycle Alignment

> 本文档是只读探索结论：定位 turn 相关所有权、提取 demo 级代码、对照参考会话模型、给出可复用的窄接口学习方案。
> 本轮不修改生产行为；后续实现必须按本文的窄接口逐项落地。

## 1. 当前 turn 所有权地图

### 1.1 输入到 turn 开始

- `packages/ts-shell/src/cli/interactive/interactiveMode.ts`
  - `turnNumber` 显示计数，初始 0；
  - `lastPrompt` 保存上一次用户输入；
  - `busy` 队列管理并发提交；
  - `run()` 包装 `sink.begin()` 与 `sink.end()`；
  - `interrupt()` 触发 `sink.markCancelling()` 与 `sessionRuntime.cancelCurrentRun()`。
- `packages/ts-shell/src/cli/interactive/interactiveCommandRouter.ts`
  - `turnNumber` 透传；
  - `/compact`、resume、continue、retry、clear、exit 分支；
  - 普通 prompt 不递增显示计数。
- `packages/ts-shell/src/cli/interactive/interactivePromptRunner.ts`
  - resume 与普通 prompt 的薄桥；
  - 区分交互与非交互的 `turnNumber` 传递。
- `packages/ts-shell/src/entrypoints/cliRuntimeModule.ts`
  - `=== Turn N ===` 与 `=== End Turn N ===` 输出边界；
  - `TurnOrigin`：`normal`、`resumed`、`continued`；
  - `TurnEndStatus`：完成、中断、失败；
  - 负责 prompt 到 `sessionRuntime` 的交接。

### 1.2 turn 执行

存在两条并行执行路径：

- 真实路径：`packages/ts-shell/src/core/query/agentLoop.ts`
  - `while (turn < maxTurns)` 循环；
  - 流式获取、工具提取、工具分发；
  - 中止检查、自动压缩；
  - 历史消息转换与未完成工具调用补全。
- 合约路径：`packages/ts-shell/src/core/query/runtime/loop.ts`
  - `decide`、`executeTurn`、`transcript`、`transition`；
  - 每 turn 生成快照与存证；
  - 权威检查与工具反馈。
- 路由选择：`packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts`
  - 按运行模式选择真实循环或合约流程；
  - 传递 `runtimeSeed` 与连续性状态。
- 兼容外观：`packages/ts-shell/src/turn/turnFacade.ts`
  - 对合约流程做观察者组合；
  - 流式路径直接透传，缺少统一边界。

### 1.3 事件与投影

- 事件契约：`packages/ts-shell/src/core/query/runtime/events.ts`
  - `query.started`、`turn.started`、`turn.completed`；
  - `message`、`reasoning.delta`、`tool.*`；
  - `lifecycle.*`、`runtime.*`。
- TUI 投影：`packages/ts-shell/src/cli/interactive/turnSink.ts`
  - 唯一决定事件到 transcript block 的位置；
  - `begin`、`end`、`retryTarget`、`markCancelling`、`lastTurnFailed`；
  - 运行时 `runtime.*` 事件有意不在 TUI 显示。
- 派生投影：
  - `packages/ts-shell/src/turn/nextTurnBundle.ts`；
  - `packages/ts-shell/src/orchestration/turnKernel.ts`；
  - `packages/ts-shell/src/runtime/turnBoundary.ts`；
  - `packages/ts-shell/src/runtime/loop/contract.ts`。

### 1.4 持久化

- 外观：`packages/ts-shell/src/session/SessionManager.ts`
  - `transcript.jsonl`、`metadata.json`、`state.json`；
  - 委托生命周期、事件持久化、压缩、重放。
- 生命周期原语：`packages/ts-shell/src/session/agent/lifecycle.ts`
  - `markRunStarted`、`persistUserPromptBarrier`、`markTurnActive`；
  - `saveInterrupted`、`saveTerminated`、`saveCompleted`、`saveError`、`addTurn`。
- 事件持久化：`packages/ts-shell/src/session/agent/persistence.ts`
  - 每个 query event 追加；
  - 状态锁、去重、自动保留。
- transcript 日志：`packages/ts-shell/src/session/transcript/sessionTranscript.ts`
  - transcript 事件读写；
  - 压缩重锚；
  - turn 追加。
- 状态机：`packages/ts-shell/src/session/lifecycle/sessionLifecycleStore.ts`
  - `prompt-persisted`、`turn-active`、`idle`；
  - 中断种类、标题推导。
- 恢复：`packages/ts-shell/src/session/recovery/sessionRecoveryRuntime.ts`
  - 恢复快照、信任边界、待定生命周期对账；
  - 重放种子构造。

### 1.5 resume、continue、retry、compact、中断

- resume/continue：`packages/ts-shell/src/core/shell/continueShellActionRuntime.ts`
  - 只有 resume/continue 才递增显示 `turnNumber`；
  - `turnOrigin` 为 `resumed` 或 `continued`；
  - `runtimeSeed` 与连续性状态两条路径。
- retry：`interactiveMode.ts` 与 `turnSink.ts`
  - 读取上一 turn 是否失败；
  - 成功不重试；
  - TUI 追加用户行后重新执行。
- compact：
  - 手动 durable 路径：`packages/ts-shell/src/core/shell/compaction.ts`；
  - 循环内临时路径：`agentLoop.ts`；
  - 事件级保留路径：`session/agent/persistence.ts`。
- 中断：
  - keymap Esc/Ctrl+C；
  - `InteractiveMode.interrupt()`；
  - `sessionRuntime.cancelCurrentRun()`；
  - `TurnSink.end` 合成中断提示；
  - 持久化写入中断记录。

## 2. 参考会话模型

### 2.1 两层结构

- 核心 turn 状态机：
  - `packages/agent/src/agent.ts`；
  - `packages/agent/src/agent-loop.ts`；
  - `packages/agent/src/types.ts`。
- 会话外观：
  - `packages/coding-agent/src/core/agent-session.ts`；
  - `packages/coding-agent/src/core/session-manager.ts`；
  - `packages/coding-agent/src/core/compaction/compaction.ts`；
  - `packages/coding-agent/src/core/extensions/types.ts`。

### 2.2 turn 生命周期

核心循环顺序：

```text
agent_start
  -> turn_start
  -> message_start/message_end
  -> inject steering
  -> stream assistant response
  -> execute tool calls
  -> turn_end
  -> shouldStop ? agent_end : prepareNextTurn
  -> poll steering
  -> turn_start ...
```

外层：

```text
drain followUp
  -> continue inner loop
  -> else agent_end
```

错误或中止的 assistant 直接结束 turn 并结束 agent，避免悬挂工具调用。

### 2.3 可复用的窄模式

1. 两个 drain 点：
   - steering 在每 turn 后检查；
   - follow-up 只在即将停止时检查。
2. `prepareNextTurn` 作为压缩、系统提示词、工具刷新的单一 choke point。
3. `message_end` 才持久化，`turn_end` 才 flush 自定义消息，保持工具调用与结果相邻。
4. `message_end` 原地替换支持。
5. 线路输出剥离累计 partial，保留常量大小 ID。
6. 每个子系统独立 AbortController，`agent_end` 监听器完成后再 `waitForIdle`。
7. 压缩谓词为 `tokens > window - reserve`，保留最近 tail，溢出只重试一次。
8. 工具 terminate 规则为全部 true 才停止；截断失败闭合；同文件编辑串行。

## 3. Demo 级代码清单

### P0：身份与可观测性缺口

1. 快照 ID 在 retry/resume/re-entry 下碰撞：
   - `packages/ts-shell/src/turn/turnSnapshot.ts:56`；
   - `packages/ts-shell/src/evidence/savepoint/model.ts:141`；
   - `packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts:380-383`。
2. 流式路径绕过 turn 边界：
   - `packages/ts-shell/src/turn/turnFacade.ts:80-92` 有快照收集；
   - `packages/ts-shell/src/turn/turnFacade.ts:106-112` 直接透传，无边界。
3. phase 是标签不是门：
   - `packages/ts-shell/src/runtime/runtimePhase.ts:33-48`；
   - `packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts:379-383,472-486`；
   - `aborted` 可能是查表失败，不是真实中止。

### P0：取消不安全

4. 取消是 fire-and-forget：
   - `packages/ts-shell/src/core/shell/sessionRuntime.ts:309-311`；
   - `packages/ts-shell/src/core/shell/sessionRuntime.ts:122-123,274-275,304,319-330`；
   - `packages/ts-shell/src/cli/interactive/interactiveCommandRouter.ts:142-143`；
   - `packages/ts-shell/src/core/query/agentLoop.ts:320-323,444,751`。

### P1：所有权分裂与死代码

5. `turnFacade` 是命名 shim：
   - `packages/ts-shell/src/turn/turnFacade.ts:80,124-140`。
6. `turnKernel` 是纯投影：
   - `packages/ts-shell/src/orchestration/turnKernel.ts:26-38,40-72`。
7. 能力与 owner 词汇有不可达分支：
   - `packages/ts-shell/src/orchestration/turnCapabilityPlan.ts`；
   - `run-command` 与 browser 被误标为 `no-write`。
8. continuation/resume 三个 owner 不相遇：
   - `packages/ts-shell/src/orchestration/continuationModule.ts`；
   - `packages/ts-shell/src/orchestration/continuationLineage.ts`；
   - `packages/ts-shell/src/core/shell/continueShellActionRuntime.ts`；
   - `packages/ts-shell/src/session/SessionManager.ts:329-333,98-101`。

### P1：压缩、存证、脱敏分歧

9. 三个压缩实现：
   - `packages/ts-shell/src/core/shell/compaction.ts:KEEP_RECENT_MESSAGES=4`；
   - `packages/ts-shell/src/session/continuation/retentionPlanner.ts`；
   - `packages/ts-shell/src/core/query/agentLoop.ts`；
   - `packages/ts-shell/src/session/agent/compaction.ts:AUTO_COMPACT_TURN_THRESHOLD=12`。
10. 存证字段混淆：
    - `packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts:489-493`；
    - `packages/ts-shell/src/evidence/savepoint/model.ts`。
11. 四个脱敏器：
    - `packages/ts-shell/src/turn/turnSnapshot.ts`；
    - `packages/ts-shell/src/evidence/savepoint/model.ts`；
    - `packages/ts-shell/src/turn/nextTurnBundle.ts`；
    - `packages/ts-shell/src/orchestration/turnReceiptAggregation.ts`。
12. 边界观察者同步、抛错、无界：
    - `packages/ts-shell/src/runtime/turnBoundary.ts:9-21`；
    - `packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts:404,502`；
    - `packages/ts-shell/src/turn/turnFacade.ts:88-89`。

## 4. 对齐方案

### 4.1 身份

- turn 快照 ID 增加 workspace、provider、nonce、时间戳或 attempt 计数；
- savepoint ID 跟随唯一 turn ID；
- resume/retry 可关联、可去重。

### 4.2 边界

- 流式与非流式共用同一 turn 边界；
- 快照与存证收集不依赖入口形态；
- `runtime.*` 仍不在 TUI 显示，但必须进入可观测记录。

### 4.3 状态机

- phase 从标签升级为门；
- `aborted` 只表示真实中止；
- overlapping continue、compact、retry 必须被阻止。

### 4.4 取消

- 每个 turn 独立 AbortController；
- cancel 与 turn ID 关联；
- 等待 turn 到达 `aborted` 或 `idle`；
- 中断记录落盘后再返回；
- 避免压缩控制器覆盖 prompt 控制器。

### 4.5 执行路径

- 收敛真实循环与合约循环的事件语义；
- facade 不再只是命名包装；
- kernel 不再抛无类型错误；
- 能力分类修正高风险任务。

### 4.6 continuation 与 resume

- lineage 决策与 shell resume 同一入口；
- `blocked` 能真正阻止继续；
- session resume 为唯一权威，orchestration 为投影。

### 4.7 压缩

- 统一 cut 语义；
- 统一 token 估算；
- 统一保留 tail；
- 消除 one-shot latch；
- 压缩与 turn ID 关联，避免竞态。

### 4.8 存证与脱敏

- 修正 verification 与 terminal 字段混淆；
- 统一脱敏 owner 与规则；
- 统一截断长度与模式；
- 跨层等价测试。

### 4.9 观察者

- try/catch 隔离；
- 支持异步；
- 排序与背压；
- 有界收集；
- 观察者失败不 abort 被观察 turn。

## 5. 后续实施顺序建议

1. 身份与边界；
2. 取消与状态机；
3. 执行路径收敛；
4. continuation 与 resume；
5. 压缩统一；
6. 存证与脱敏；
7. 观察者隔离。

每一步必须先有 failing test，再改生产代码，最后跑 focused 验证。
