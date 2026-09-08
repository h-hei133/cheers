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

**A3. 权限询问呈现为文本 prompt 并要求键入字母而不是交互式选项菜单 [已修复]**
- 根因：`cliApprovalModule.ts` 在交互模式下直接调用 `askReadline(rl, "approval> ")`，通过 `QuestionBridge` 把提示文本当作一条 notice 注入转写历史，并在输入框强制要求用户键入 `y`/`a`/`n`，而非弹出选项面板。
- 修复：
  1. 在 `createCliEscalationPromptHandler` 增加 `promptInteractiveApproval` 接口。
  2. 在 `InteractiveMode` 实现 `promptApproval`：通过 `OverlayHost` 原生弹出 `form: "panel"` 内联选项菜单，直观呈现三项标准选项：① 允许一次（`allow-once`）、② 允许后续同样的命令/不再寻求许可（`allow-always`）、③ 拒绝（`deny`）。
  3. 键位支持：支持 `↑`/`↓`（或 j/k）上下移动选择游标并按 `Enter` 确认；同时支持直接单键热键（`1`/`y` 允许一次、`2`/`a` 始终允许、`3`/`n` 或 `Esc` 拒绝并关闭）。
  4. 非交互环境（无 TUI）安全回退至自动策略或标准文本问答。
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

**C3. 选区松手即消失与复制通知污染聊天记录 [已修复]**
- 根因：
  1. `selection.ts` 在鼠标 release 时无条件把 `anchor` 与 `focus` 清空为 undefined，导致高亮背景无法驻留。
  2. `turnSink.ts` 将复制提示当成一条 `kind: "notice"` 的对话消息直接追加进 `transcript`，多次复制严重刷屏污染聊天历史。
- 修复：
  1. 选区释放持久化：`selection.ts` 在 release 时保留 `anchor` 与 `focus`，高亮背景持续驻留；仅在单机空白处（无有效选区）、键盘打字或开始新一轮交互时清除选区。
  2. 复制提示改走 Toast 瞬态通知：在 `hints.ts` 引入 `toast` 支持并在 `frameSurface` 中透传；剪贴板通知直接就地更新提示行文本（`Copied N characters...`），多次复制原地覆盖不换行，模型开工或用户提交新提示词时自动清除，转写区 0 污染。

**C4. 废除自建文本滚动条，消除双滚动条与不可见滚轮异象 [已修复]**
- 现象与用户反馈：终端本身右侧已经存在原生 GUI 滚轮条，界面却自建了另一条在原终端滚轮条左侧；而且自建滚轮条的字符完全不可见（灰度暗淡），但又可以用鼠标点住拖拽滑动，体验怪异，与标准终端应用（只有一个滚动条）完全不同。
- 根因：`f01fc88f` 在文本缓冲区右侧（`width - 1`）自建了字符滚动条（`withScrollbar`），强行将转写宽度截取为 `width - 1`，并在最右侧注入 `│` 与 `█` 字符，与终端模拟器自带的原生滚轮条重叠形成“双滚动条”；暗色主题下字符颜色几近不可见，且劫持了右边界的鼠标选区。
- 修复：
  1. 彻底废除自建字符滚动条（删除 `withScrollbar`、恢复转写区全宽 `width` 排版，删除 `pointer.ts` 右边界鼠标拖拽劫持）。
  2. 滚动交互归位标准方式：终端窗口原生滚动条、鼠标滚轮平滑滚动（每次 3 行）、`PgUp`/`PgDn`/`Shift+↑`/`Shift+↓` 翻页。
  3. 界面回归标准单一原生滚动条，消除右侧虚空断层与不可见暗斑。
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

## 再次复核（bccb416c / 596bbf75 → 本次修补）

复核范围：前述 5 个 commit 的全量改动（`toolPolicy.ts`、`agentLoop.ts`、`history.ts`、`selection.ts`、`interactiveAskBridge.ts`、`modal.ts`、`editor.ts` 及相关套件），对照 API 规范、终端边界与安全规则逐项复验。

查出并修复 5 项隐患：

1. **A1 toolPolicy 缺失路径绕过漏洞（toolPolicy.ts）**
   - 根因：`accept-edits` 模式在检验 `(toolName === "write" || toolName === "edit")` 时，未校验 `args.path` 是否有效。当传参缺失 `path`（如 `{ content: "..." }`）时，`target` 默认取 `(unspecified path)`，被相对路径计算解析为工作区内并静默放行；且对工作区根目录自身（`rel === ""`）未排除。
   - 修复：强制要求 `typeof args.path === "string" && args.path.trim().length > 0`，缺失路径必须升级审批；同时约束 `rel.length > 0` 杜绝修改根目录。增强 `task` 目标提取（优先使用 `description`、`prompt`）及 safeArgs 防御。

2. **B1 assistant 消息 content: null 协议规范隐患（agentLoop.ts）**
   - 根因：`convertSessionMessagesToChat` 处理 assistant 消息时使用 `msg.content || null`。若历史中存在无 `tool_calls` 且空文本的 assistant 消息，输出为 `{ role: "assistant", content: null }`，直接违反 OpenAI/DeepSeek 协议（无 tool_calls 时 content 必须为 string），引发 API 400。
   - 修复：修正为 `msg.content ?? (calls ? null : "")`，无 tool_calls 时严格保证 content 为字符串。

3. **B2 resume 工具卡片失败模式遗漏与未响应卡片修复（history.ts）**
   - 根因：
     1. 失败判定正则未覆盖 `Blocked by Hook:`（带空格）、`(Operation cancelled or interrupted)` 和 `Tool '...' is not available`，导致钩子拦截或中断合成的消息恢复后依然显示为成功绿勾。
     2. 若工具调用在产生 tool 响应前进程被异常终止，恢复后 `toolBlock` 停留在 `status: "ok"` 和空文本。
   - 修复：
     1. 正则扩展为 `/^(\(Operation cancelled|Blocked\b|Tool execution error:|Tool '[^']+' is not available|Error\b)/i`。
     2. 增加 `respondedToolIds` 集合追踪已响应工具调用；对历史中完全无响应的孤立工具调用正确置为 `status: "failed"` 与 `text: "(Operation interrupted)"`，展开卡片。

4. **C1 选区反色与光标残影深度防御（selection.ts）**
   - 修复：在 `highlightRow` 中增加针对 `CURSOR_MARKER` 的绝对防御：任何包含光标标记的行直接原样返回、严禁反色高亮，防止全屏 modal/overlay 等场景下拖选产生双重反色重叠与硬件光标残影。

5. **A2 interactiveAsk 健壮性保障（interactiveAskBridge.ts）**
   - 修复：对问题缺少 `id` 自动降级为 `q_${i+1}`，对选项对象及 label 增加可选链保护，防止非结构化异常输入抛错。

验证：
 - 全量受测模块 75 项测试全部通过（新增 5 项针对性回归测试）。
 - `tsc -p tsconfig.build.json` 编译通过。
 - 仓库保持零外部项目名命中。
- 审计日志与工作区保持完全干净。

## 独立复核（56ac4c70 → 本次修补）

复核范围：A3（交互式权限审批面板、OverlayHost 键位路由、交互循环贯通）及相关单元测试，对照 NormProof 架构规则、Promise 结算生命周期与终端选项面板交互规范逐项复验。

查出并修复 3 项稳定性与架构隐患：

1. **A3 悬挂 Promise 漏洞：未决退出导致 Agent 循环死锁（overlay.ts / approval.ts）**
   - 根因：`OverlayHost.accept` 在 `ids.length === 0 && !picker.multiple`（例如选项未加载完成即按回车、或未选中项）时，直接置空 `picker` 并返回，既未调用 `apply`，也未调用 `picker.previewEnd?.()`。导致 `InteractiveMode.promptApproval` 的 Promise 无法得到 resolve/reject，在权限升级点永久挂起，阻塞整个 CLI agent 运行。
   - 修复：在 `accept` 的空选项分支中补充 `picker.previewEnd?.()` 触发；在 `approval.ts` 中由 `previewEnd` 统一调用 `settle("deny")`，确保无论是按 Esc、回车未选中还是面板被覆盖关闭，Promise 均 100% 结算为安全默认值 `"deny"`，消除死锁隐患。

2. **A3 选项过滤扰动与快捷键完善（overlay.ts / approval.ts）**
   - 根因：原 `isApprovalPicker` 仅通过 `this.model.visible` 选项内容判断，在 `open()` 后的微任务加载期间判定为 false；且审批面板未阻止普通字母键的过滤逻辑（`appendFilter`），键入非快捷键字符会导致 3 个固定选项被过滤隐藏乃至列表变空。此外，快捷键缺失常见的 `d`（deny）以及 `j`/`k` 导航键。
   - 修复：识别逻辑增加 `picker.title.startsWith("Permission:")` 实现同步即时判定；在审批面板激活期间屏蔽 `space`、`backspace` 和常规文本的过滤操作，保持 3 项标准选项始终常驻可见；增加 `d` 快捷拒绝，增加 `j`/`k` 移动游标；并在选项右侧增加直观操作提示注记（`1 / y`、`2 / a`、`3 / n / esc`）。

3. **架构规范遵守：消除 interactiveMode.ts 函数超限（interactiveMode.ts / approval.ts）**
   - 根因：`InteractiveMode` 在此前提交中累积了 21 个类方法，违反了 AGENTS.md 规范与 NormProof 规则 3（每个模块最多声明 20 个函数/方法）。
   - 修复：遵循 `picker/` 现有领域拆分范式，将审批面板构造逻辑独立为 `cli/interactive/picker/approval.ts`；并将仅被一处调用的 2 行辅助方法 `isCancelArmed()` 内联。`InteractiveMode` 声明方法数精准恢复至 20，完全符合架构规范。

验证：
- 核心套件 61 个测试文件 634 项测试全部通过（新增 5 项审批面板与快捷键测试）。
- `tsc -p tsconfig.build.json` 编译通过。

## 再次复核（03d58187 → 本次修补）

复核范围：上一轮提交后的交互式审批面板全链路（`approval.ts`、`overlay.ts`、`interactiveMode.ts`、`cliApprovalModule.ts` 及相关测试），对照终端交互直觉、小键盘输入模式、未捕获异常恢复以及架构规则逐项复验。

查出并修复 4 项隐患：

1. **A3 overlay Ctrl+C 吞键与无响应（overlay.ts）**
   - 根因：`OverlayHost.handleKey` 在 `switch` 中仅捕获了 `escape`，而 `Ctrl+C`（`keyId: "ctrl+c"`，`ctrl: true`）落入 `default` 分支后由于 `event.ctrl === true` 命中 `else { return true; }` 被静默吞掉。导致用户在审批面板或模态框中习惯性按 Ctrl+C 无法退出或拒绝，被迫寻找 Esc 或数字键。
   - 修复：在 `switch (event.keyId)` 中紧随 `case "escape":` 增加 `case "ctrl+c": this.close(); return true;`，并在 `default` 中增加防御分支。按 Ctrl+C 立即调用 `this.close()`，在审批面板中触发 `previewEnd` 自动将决策结算为 `"deny"`，实现即时安全退出。

2. **A3 数字小键盘及无 text 事件 keyId 映射兼容（overlay.ts）**
   - 修复：在 `isApprovalPicker` 快捷键判断中，将原本仅依赖 `event.text === "1" | "2" | "3"` 拓展为兼顾 `event.keyId === "1" | "2" | "3"`，使得在无 text 携带的小键盘按键或合成 key 事件下依然能直接选定对应决策。

3. **A3 交互式审批异常兜底（cliApprovalModule.ts）**
   - 修复：对 `promptInteractiveApproval` 增加 try/catch 保护，若交互式提示发生异常或 Promise 意外拒绝，安全兜底判定为 `"deny"`，避免整个 CLI 调用链发生未决死锁或未捕获拒绝。

4. **A3 approvalPicker 上下文安全与提示对齐（approval.ts）**
   - 修复：对 `prompt.context` 的属性访问增加可选链与缺省回退（`toolName`、`operation`、`target`），防止畸形或最小化 prompt 对象触发属性读取报错；并将拒绝项注记更新为 `"3 / n / d / esc"`，与实际支持的按键完全对齐。

验证：
 - `tsc -p tsconfig.build.json` 编译通过。
 - 仓库保持零外部项目名，工作区保持完全干净。

## 交互审批污染消除与人工授权感知（本次修补）

针对真机测试反馈的“同意请求后页面输出大段控制台纯文本”与“模型未感知人工授权产生只读认知偏差”两个问题进行针对性修复：

1. **A4 消除交互式审批终端文本污染（cliApprovalModule.ts）**
   - 根因：当 `promptInteractiveApproval` 激活（TUI 内联选项面板弹出）时，底层 `createCliEscalationPromptHandler` 未加 `if (!promptInteractiveApproval)` 门控，依然无条件向 `renderer`（标准输出 stdout）打印 `renderApprovalRequiredSurface`、`trustPolicy.explain`、`formatApprovalPromptDecisionMenuLine`、`formatAllowOnceAppliedLine`、`formatTrustPolicyUpdatedLine` 以及全量 `approval-audit:*` 调试文本。由于 TUI 运行在备用屏且接管了屏幕控制，向 stdout 写入的大段控制台纯文本直接覆盖、冲刷了 TUI 页面，造成严重的终端排版错乱与信息污染。
   - 修复：对所有向 `renderer` 打印审批提示、策略说明、审计表面（`renderApprovalAuditSurface`）及决策状态的调用严格增加 `if (!promptInteractiveApproval)` 门控；当处于 TUI 交互式审批模式时完全静默，审计记录仅通过 `persistApprovalAudit` 写入会话底层日志，彻底保持终端界面干净无杂质。

2. **A5 模型缺乏用户人工授权感知导致结论偏差（agentLoop.ts）**
   - 根因：当修改性工具触发权限升级并被用户点击“允许一次”/“始终允许”后，工具执行返回的原始文本（如 `Successfully wrote ...`）未包含任何审批凭据与授权标记；且系统提示词环境行未注明当前生效的 `permission_scope`。模型作为纯客户端无法感知外部 Harness 发生了人工弹窗与审批介入，只观测到工具直接成功返回，从而在被提问“当前环境是否只读/是否有权限门”时产生“工具直接执行成功，环境并非只读”的误判。
   - 修复：
     1. 在 `environmentLine` 中加入 `permission_scope` 上下文（如 `permission_scope=ask`），让模型知晓当前处于权限询问门控策略下。
     2. 当工具执行经历过人工审批并成功时，在工具返回结果首行注入 `[User approved <operation> operation (<decision>)]` 授权标记（参考业界智能体标准与人类在环交互协议），使模型精准感知该次执行是经由用户显式授权放行的，消除状态认知偏差。

验证：
 - 全量受测模块 83 个测试套件 896 项测试全部通过（新增审批结果授权标记断言及 clean renderer 断言）。
 - `tsc -p tsconfig.build.json` 编译通过。
 - 仓库保持零外部项目名，工作区保持完全干净。

## 独立复核（f01fc88f → 本次修补）

复核范围：根据真实终端与用户实操反馈，对 commit `f01fc88f` 引入的选区驻留、复制反馈、滚动条及相关测试进行深度复查与二次验证。

查出并彻底修复 2 项严重交互体验缺陷：

1. **C3 选区坐标未解耦：滑动页面时选区内容不固定，停留在固定屏幕绝对位置（frameSurface.ts / selection.ts / pointer.ts）**
   - 现象：鼠标拖拽选中一段文本后，如果向上或向下滑动页面，被选中的高亮方块依然死死固定在当前屏幕的绝对行号上（如第 3 到第 7 行），而转写文字在下方滚动穿梭，导致选区与文字彻底脱节；再次按 Ctrl+C 复制甚至会把滚动后处于该屏幕行上的全新内容复制走。
   - 根因：`DragSelection` 的 `anchor` 和 `focus` 存储的是鼠标事件直接上报的物理屏幕行（`report.row`），渲染时直接在当前屏幕视口行上反色；页面发生滚动后视口起始行 `top` 改变，而屏幕选区依然按旧行号渲染，造成高亮悬空。
   - 修复：实现**内容空间坐标锚定（Content-Anchored Selection）**：
     1. 在 `InteractiveSurface` 建立 `screenToContent(row, col)` 与 `contentToScreenSpan(span)`，实现屏幕视口行与转写内容绝对行之间的精确双向转换；
     2. `DragSelection` 的 `anchor` 与 `focus` 完全基于内容绝对行号建立与维护；
     3. `renderFrame` 绘制时通过 `contentToScreenSpan` 动态投影当前视口内的选区切片：页面上下滚动时，选区高亮与转写文本 1:1 像素级同步位移；当文字滚出视口时高亮自然滑出屏幕，滚回时精准复现；
     4. 复制（release 或 Ctrl+C）统一从 `contentRows()` 提取文字，无论如何翻页滚动，复制的永远是最初选定的真实内容；
     5. 单击未拖拽时立即清空选区，键盘输入自动消除选区。

2. **C4 终端双滚动条与自建滚动条暗淡不可见异象（frameSurface.ts / pointer.ts）**
   - 现象：终端右侧本身具备原生窗口滚轮条，界面却在内侧并排自建了另一条完全不可见的字符滚动条；虽然鼠标盲点能够拖动，但视觉上突兀怪异，且导致文本右侧多出 1 列空隙。
   - 根因：`f01fc88f` 误引入了字符级内嵌滚动条 `withScrollbar` 与右边界鼠标劫持，与终端原生 GUI 滚动条冲突。
   - 修复：彻底删除 `withScrollbar`、`scrollToRatio` 及 `pointer.ts` 右侧拖拽逻辑，恢复转写区全宽度 `width` 绘制；统一由终端窗口原生滚动条、鼠标滚轮事件（每次 3 行）与翻页热键驱动滚动，回归标准单一滚动条体验。

验证：
- 交互与 TUI 46 套件 564 项测试全部通过（新增选区滚动跟踪测试、全宽排版测试与单机取消测试）。
- `tsc -p tsconfig.build.json` 编译通过。
- 仓库保持零外部项目名，工作区保持完全干净。

## 滚轮条滑块重塑与选区死区消除（本次修补）

针对真机测试中“右侧滚动条无滑块且完全无法拖拽滚动”以及“滚动条左侧与文本之间存在大片无法选中死区”两个关键问题进行深度根因排查、对齐顶级终端实现方案并进行彻底修复：

1. **C4 规范级右侧滚轮条与实体滑块拖拽实现（frameSurface.ts / pointer.ts）**
   - 根因：此前提交（37123ad3）误认为备用屏可以依靠终端原生滚动条，因而将字符滚动条与拖拽拦截彻底移除。但在 Alternate Screen 模式下终端关闭了原生回滚历史，原生滚轮条失去滚动作用或无法提供与转写内容绑定的滑块，导致界面右侧滚轮条彻底瘫痪。
   - 修复：
     1. 在 `frameSurface.ts` 中引入完整的滚动条几何模型 `ScrollbarGeometry`（包含 `column`、`trackTop`、`trackHeight`、`thumbTop`、`thumbHeight`、`maxScrollTop`）；
     2. 当转写行数溢出视口容量（`totalRows > capacity`）时，自动在 `width - 1` 最右列渲染 `│` 细轨道与高亮 `█` 实体滑块（thumb），滑块高度按 `(capacity * capacity) / totalRows` 比例动态计算并提供最小高度约束；
     3. 在 `pointer.ts` 中实现严密的鼠标点击与拖拽状态机：点击滑块时计算点选内相对吸附位置（`grabOffset`）；点击轨道空白处时光标自动居中并立即平滑跳转；在拖拽过程中连续平滑滚动转写区且完全屏蔽文本框选与卡片折叠；鼠标 release 立即干净释放拖拽状态。

2. **C5 消除滚轮条左侧空白区域“无法选中”死区（frameSurface.ts）**
   - 根因：短文本行末尾未填充到终端全宽，文本右边界与最右侧滚动条之间存在自然空白。原 `screenToContent` 盲目将鼠标所在列传递给内容行，若用户从右侧空白区域发起框选，由于内容行在该列无字符（`contentRows()[row]` 长度较短），`extractSelection` 提取为空并判定选区无效而自动清空，造成右侧空白区域“完全拖不动、选不中”的死区故障。
   - 修复：在 `screenToContent` 坐标映射中，自动根据对应行的实际渲染内容宽度（`visibleWidth(line)`）进行末端夹逼（`Math.min(column, lineWidth)`）。当用户在空白区域拖拽时，选区智能锚定至该行的真实末尾；跨行选择时自上一行末端无缝贯通至下一行，既保留了自然的行末空白，又彻底消除了无法选中的死区现象。

验证：
 - 交互与 TUI 46 套件 567 项测试全部通过（包含滚轮条渲染、几何计算、滑块跳转拖拽与选区末端夹逼回归测试）。
 - `tsc -p tsconfig.build.json` 编译通过。
 - 仓库保持零外部项目名，工作区保持完全干净。
