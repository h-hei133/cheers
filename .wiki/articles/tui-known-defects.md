---
title: "TUI 真机验证发现的既有缺陷"
category: article
sources: [user-report, local-tui-state]
created: 2026-09-07
updated: 2026-09-07
tags: [tui, defects, verification, phase-3]
summary: "真机验证发现的 7 项既有缺陷：权限门失效、ask 工具无交互、跨轮上下文丢失、复制时光标残影、输入框无滚动、resume 筛选框位置、resume 丢工具记录。均非 adapter 引入。"
confidence: high
---

# TUI 真机验证发现的既有缺陷

## 性质

全部是**既有缺陷**（一直存在，非 adapter 引入）。adapter 尚未接入默认链路，生产链路仍是 `InteractiveMode` + `InteractiveSurface` + `TUI` 引擎。这些缺陷不阻塞 adapter 接入判断，但影响产品可用性，需单独排期。

## 分类

### A. 权限与安全（高）[已修复]

**A1. ask 模式下写操作不询问 [已修复]**
- 根因：
  1. `runAutonomousReActLoop`（在 `cliRuntimeInvocation.ts` 中调用）未接收 `permissionScope` 与 `escalationPromptHandler`，循环中执行工具时直接调用 `tool.execute`，跳过了权限检查。
  2. `SandboxPolicy.checkFilesystemPermission` 将工作区内修改直接判为 `allowed: true, requiresEscalation: false`，脱离了 `permissionScope`。
- 修复：
  1. 引入 `core/query/toolPolicy.ts`：实现 `evaluateToolPermissionScope` 与 `buildToolEscalationPrompt`，严格区分只读工具（`read`/`glob`/`grep`/`lsp`/`web_search`/`web_fetch`/只读 `bash`）与修改工具（`write`/`edit`/修改性 `bash`/`task`）。
  2. 模式对齐顶尖实践：
     - `ask` 模式：修改工具必须触发升级弹窗（allow-once/allow-always/deny）。
     - `accept-edits` 模式：工作区内文件修改放行；修改性命令依然触发弹窗。
     - `allow-all` 模式：直接放行。
  3. 调用链打通：`cliSessionRuntimeFactory.ts` → `cliRuntimeInvocationBridge.ts` → `cliRuntimeInvocation.ts` → `agentLoop.ts` 完整传递 `permissionScope` 与 `escalationPromptHandler`。

**A2. ask 工具无交互 [已修复]**
- 根因：`core/tools/ask.ts` 的 `execute` 硬编码了静态 mock 文本（`Autonomous execution mode - selected default recommended choices...`），完全未与用户交互。
- 修复：
  1. 在 `ToolExecutionContext` 增加 `interactiveAsk` 回调接口。
  2. 建立 `cli/interactive/interactiveAskBridge.ts`：通过 `ReadlineInterface`（在交互模式下由 `QuestionBridge` 承接）向用户顺序展示问题与选项，支持按数字编号或完整文本进行交互式选择。
  3. 在 `ask.ts` 中优先使用 `context.interactiveAsk`，用户回答后格式化为真实决策返回给模型；非交互环境优雅回退到推荐默认值。
### B. 会话与上下文（高）[已修复]

**B1. 跨轮上下文丢失 [已修复]**
- 根因：`agentLoop.ts` 启动时直接将 `messages` 初始化为 `[system, user(options.prompt)]`，完全丢弃了当前会话在此轮次之前的所有前序消息。
- 修复：
  1. 在 `ReActAgentLoopOptions` 增加 `historyMessages` 与 `onTurnMessage` 回调。
  2. 在 `agentLoop.ts` 中实现 `convertSessionMessagesToChat`：将历史 `SessionMessage` 转换为规范聊天消息（包括 `user`、`assistant` 及其 `tool_calls`，以及 `tool` 返回值），插入在 system prompt 和当前 prompt 之间。
  3. 在 `cliSessionRuntimeFactory.ts` 中提取当前会话历史消息（排除刚刚持久化的当前 user prompt）并完整传入，模型在后续轮次中完全保留对先前轮次操作文件与回答的记忆。

**B2. resume 后工具记录丢失 [已修复]**
- 根因：
  1. 每一轮自主循环内的 `tool_calls` 与 `tool` 结果消息之前未持久化到 `session.turns`，会话结束时仅存了最终纯文本。
  2. `history.ts` 中的 `restoreConversation` 显式过滤了非 `user`/`assistant` 文本，强制还原为纯文本块。
- 修复：
  1. 在 `agentLoop.ts` 中通过 `onTurnMessage` 实时将 `assistant` 携 `tool_calls` 与 `tool` 结果消息写入 `sessionManager.addTurn`，完整保留在会话 JSONL 中。
  2. 导出 `toolCards.ts` 中的 `summarize` 函数，重构 `history.ts` 的 `restoreConversation`：遇到带 `tool_calls` 的助手消息时重建工具卡片 `Block` 并按参数推导摘要；遇到对应 `tool_call_id` 的 `tool` 消息时关联回填输出并划分 diff。resume 时完整复原历史工具卡片与命令框。
### C. 输入与渲染（中）

**C1. 拖拽复制时按 Ctrl+C 导致光标残影**
- 现象：鼠标拖拽选中一段文本时按 Ctrl+C，之后输入框光标处一直显示前一个位置的字符；实际发送的文本正常。
- 影响：视觉误导，不影响数据。
- 方向：查 `cli/interactive/pointer.ts` 的拖拽结束与 `editor.ts` 的光标标记渲染，确认 Ctrl+C 是否触发了未清屏的重绘。

**C2. 输入框无滚动**
- 现象：输入文本过长时输入框一直累加，超出终端高度后看不到屏幕外文本，整个屏幕被输入框占据。
- 影响：长 prompt 不可用。
- 方向：查 `cli/interactive/frameSurface.ts` 的 chrome 高度分配，确认 composer 是否有最大高度与内部滚动。

### D. 界面布局（低）

**D1. resume 筛选框位置不对**
- 现象：resume 页面的 session 筛选输入框位置不对，应在所有 session 上方一行。
- 影响：可用性，不阻塞。
- 方向：查 `cli/interactive/picker/` 或 resume 面板的布局，确认筛选框是否作为独立行渲染在列表上方。

## 与 adapter 的关系

- 不阻塞 adapter 接入：adapter 复用现有底座，这些缺陷在 adapter 接入前后都存在。
- 接入后需复验：A1/A2（权限弹窗走 overlay）、B2（resume 重建）、C1/C2（输入与渲染）在 adapter 链路下的行为。
- 修复优先级：A > B > C > D。A/B 影响核心可用性，C 影响体验，D 是布局。
