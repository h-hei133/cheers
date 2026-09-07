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
### C. 输入与渲染（中）[已修复]

**C1. 拖拽复制时按 Ctrl+C 导致光标残影 [已修复]**
- 根因：
  1. `selection.ts` 的 `DragSelection` 仅在鼠标 release 时清除选区；用户在拖拽选区中按键盘 `Ctrl+C` 时未收到 release，选区长期悬挂。
  2. `frameSurface.ts` 将选区反色（`this.shade`）应用到了包含输入框的整个屏幕，导致反色序列直接注入 `CURSOR_MARKER`，终端双重反色重叠使硬件光标错位显示前一字符。
  3. `keymap.ts` 的 `ctrl+c` 绑定忽视了活动选区，未执行复制而直接清空了草稿。
- 修复：
  1. 在 `DragSelection` 与 `Pointer` 增加 `clear()` 与 `copyAndClear()`。
  2. 在 `frameSurface.ts` 中隔离选区反色范围：`this.shade` 仅作用于转写区（`[...filler, ...visible]`），严禁浸染 `chrome`。
  3. 在 `keymap.ts` 的 `handleCancelKey` 中优先响应活动选区：按下 `Ctrl+C` 时立即复制选中内容到剪贴板并清空选区，保留输入框草稿。

**C2. 输入框无滚动 [已修复]**
- 根因：`Editor.render` 未限制最大行数，多行输入或大粘贴时无上限向下铺展，`chrome` 高度吞噬屏幕，`capacity` 压缩到极限，最终超出行数被截断导致光标掉出屏幕。
- 修复：
  1. 在 `Editor` 引入 `scrollOffset` 与 `maxRows` 视口控制：总视觉行超过 `maxRows` 时，自动跟踪光标所在行，确保光标始终在 `[scrollOffset, scrollOffset + maxRows)` 视口内平滑卷动。
  2. 在 `frameSurface.ts` 中设定输入框屏幕占比上限（屏幕高度的 35%，界于 3 至 10 行之间），保证转写历史永远拥有至少 65% 的视口空间。

### D. 界面布局（低）[已修复]

**D1. resume 筛选框位置不对 [已修复]**
- 根因：`modal.ts` 将筛选文本、光标标记与计数硬塞在顶边框线内（`┌─ Resume session [filter] ──┐`），框内主体第 1 行直接是列表，无独立搜索框。
- 修复：
  1. 顶边框线恢复纯净标题与计数（`┌─ Resume session (N) ────────────────────────┐`）。
  2. 框内第 1 行增加标准独立搜索输入框（`│ Search: <filter><CURSOR_MARKER>              │`），未输入时显示灰度占位提示。
  3. 增加内部横向分割线（`├────────────────────────────────────────────────────┤`），使搜索与下方 session 列表层级分明。
## 与 adapter 的关系

- 不阻塞 adapter 接入：adapter 复用现有底座，这些缺陷在 adapter 接入前后都存在。
- 接入后需复验：A1/A2（权限弹窗走 overlay）、B2（resume 重建）、C1/C2（输入与渲染）在 adapter 链路下的行为。
- 修复优先级：A > B > C > D。A/B 影响核心可用性，C 影响体验，D 是布局。

## 独立复核（b1c6a207 → 本次修补）

复核范围：C1（选区反色与 Ctrl+C 复制）、C2（输入框滚动与高度预算）、D1（modal 搜索框布局）及其单元测试，对照真实终端交互与底座模块逐项复验。

查出并修复 3 个次级缺陷：

1. **C1 边界问题：空白选区按 Ctrl+C 误清空草稿（selection.ts）**
   - 根因：`DragSelection.copyAndClear()` 在选区内字符不足 `MIN_SELECTION_CELLS`（如拖选了空白区域）导致 `extractSelection` 返回 `undefined` 时返回 `false`；`keymap.ts` 的 `handleCancelKey` 误判定为“无活动选区”，落入后序逻辑执行了 `surface.editor.clear()`，抹除了草稿。
   - 修复：只要存在活动选区（`this.span !== undefined`），即执行清空选区并返回 `true` 消费取消事件，保护草稿不被误删；仅在文本有效时执行复制。补充空白选区取消回归测试。

2. **C2 滚动失步：未聚焦时 Editor 无法跟随光标滚动（editor.ts）**
   - 根因：`Editor.render` 原先将 `cursorVisualRow` 绑定在 `if (index !== this.row || !this.focused)` 分支内；未聚焦状态下渲染时 `cursorVisualRow` 保持 `-1`，使视口滚动计算失效，留在第一屏（`scrollOffset = 0`）。
   - 修复：解耦视口行计算与光标高亮：无论是否聚焦均精确计算当前 `(this.row, this.column)` 对应的视觉行；聚焦时注入 `CURSOR_MARKER`，未聚焦时不注入。并在 adapter `ComposerFacts` 支持 `maxRows`。补充未聚焦滚动回归测试。

3. **D1 体验缺陷：搜索框光标位置跳变与超长截断（modal.ts）**
   - 根因：空筛选时 `searchRow` 将 `CURSOR_MARKER` 拼在 `Type to filter...` 之后，硬件光标漂浮在占位符末尾（第 28 列）；输入第一个字符时光标突跳回第 11 列。且若筛选词过长，外层 `truncateToWidth` 会截掉行末的 `CURSOR_MARKER` 导致光标丢失。
   - 修复：空筛选时光标置于 `Search:` 之后、占位符之前；有筛选时内层限制文本宽度并将光标置于筛选词之后，彻底消除跳变与光标截断风险。更新回归测试。

验证：
- 交互与 TUI 43 套件 532 项测试全部通过（新增 3 项回归测试）。
- `tsc -p tsconfig.build.json` 全量编译通过。
- 审计日志与工作区残留已完全复原。

## 独立复核（55d1351c / bbe0619a → 本次修补）

复核范围：A1（权限门控与 toolPolicy）、A2（interactiveAsk 交互问答）、B1（跨轮上下文与 convertSessionMessagesToChat）、B2（resume 工具卡片重构）及相关集成测试，对照 OpenAI/DeepSeek API 协议规范与真实会话终端行为逐项复验。

查出并修复 4 项高危与稳定性问题：

1. **A1 权限安全漏洞：accept-edits 误放行破坏性 shell 命令（toolPolicy.ts）**
   - 根因：`evaluateToolPermissionScope` 在判定 `scope === "accept-edits"` 时，只检查了 `operation === "write" || operation === "delete"`，而 `bash` 的 `rm/rmdir/unlink` 正好被归类为 `operation = "delete"`，且由于 `target` 解析为相对工作区路径，满足 `isInside = true`，导致修改性与破坏性 shell 命令在 `accept-edits` 下被静默放行免审批。
   - 修复：严格约束免审批条件：仅当 `(toolName === "write" || toolName === "edit")` 时才允许工作区内文件免审批；任何 shell 进程衍生与破坏性命令在 `accept-edits` 下强制要求用户审批，完全对齐 `permissionScope.ts` 契约。同时补全 `screenshot` 与 `ariasnapshot` 只读动作。

2. **B1 协议坏死漏洞：中断回合引发 API 400 Bad Request（agentLoop.ts）**
   - 根因：`convertSessionMessagesToChat` 仅简单映射历史消息。若前一轮次助手发出了 `tool_calls` 但因用户中断（Ctrl+C）未产生 `tool` 结果消息，历史将直接后接下一轮 `user` 消息。在 OpenAI/DeepSeek 严格协议规范下，缺少 tool 回复的 assistant 消息会导致 API 抛出 HTTP 400（`tool_calls must be followed by tool messages`），导致会话永久坏死无法再发送任何消息。
   - 修复：在 `convertSessionMessagesToChat` 中维护待完成工具调用队列。当下条非 tool 消息到达或历史遍历结束时，若仍存在未回复的 `tool_calls`，自动合成 `(Operation cancelled or interrupted)` 的 tool 响应，保证 API 消息序列协议 100% 闭环；同时过滤丢弃无对应调用的孤立 tool 消息。

3. **B2 resume 状态失真：失败/被拦截工具卡片显示为成功（history.ts）**
   - 根因：`restoreConversation` 在重构工具卡片 Block 时，无条件写死 `status: "ok"` 与 `collapsed: true`。若某工具原先被权限门拦截（`Blocked:`）或执行报错（`Tool execution error:`），resume 恢复后错误地显示为绿勾并折叠，掩盖了真实失败。
   - 修复：解析工具输出内容，若命中 `Blocked:` 或 `Error:` 等失败标志，将卡片正确置为 `status: "failed"` 且 `collapsed: false`，与实时运行状态对齐。

4. **A2 空输入回退健全度（ask.ts）**
   - 修复：在 `interactiveAsk` 收集用户回答时，增强空字符串与纯空白输入处理，健全回退到推荐选项或 `No answer provided`，杜绝出现空白决策。

验证：
- 核心逻辑与回归套件（query/approval/interactive/TUI）全部通过，新增 4 项针对性回归测试。
- `tsc -p tsconfig.build.json` 编译通过。
- 审计日志与工作区保持完全干净。
