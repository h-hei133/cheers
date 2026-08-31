# Problem & Solutions Ledger (SOTA TUI Root Cause Audit)

## 1. 启动文本泄漏问题 (Startup Surface Banner Leak)
- **Root Cause**: `packages/ts-shell/src/cli/bootstrap/cliProcessRunner.ts` (line 86) 在进入交互循环前无条件调用了 `projectAndRenderCliStartupSurface()`。在 `cliStartupSurface.ts` 中，交互模式下的 `showStartupSurface` 默认被判定为 `true`，导致 `startupSurfaceRenderer.ts` 直接向 `stdout` 输出多行 `Private Coding Agents Shell - Project: ...` 静态文本，污染了父终端。
- **Solution**:
  1. 在交互式终端启动时，将 `showStartupSurface` 设置为 `false`（或在交互模式下静默该输出），确保切入全屏前父终端 0 污染。
  2. 仅在 Alt-Screen 画布内部渲染微型 Welcome Banner（仅显示工作目录与当前激活模型）。

---

## 2. 缺失全包围 Box Composer、状态条与 Slash 补全浮窗的根本原因
- **Root Cause**: `packages/ts-shell/src/cli/interactive/interactiveLoop.ts` 内部仍然在使用 Node.js 标准的 `readline.createInterface()`，以行缓冲（Line-buffered Cooked Mode）监听 `rl.on("line")` 事件。
  - 由于 `readline` 接管了 `stdin` 并且只在用户按回车后才触发事件，导致我们在前期编写的 `StdinBuffer`、`TextEditor`、`AutocompleteController` 与 `InteractiveTuiSession` 完全被绕过。
  - 用户在敲击单个字符（如 `/`、退格、左右光标）时，系统根本无法捕获按键并实时驱动 2D 图层重绘。
- **Solution**:
  1. 彻底废除 `interactiveLoop.ts` 中的 Node.js `readline` 依赖，重构为由 **`StdinBuffer` + `TextEditor` + `AutocompleteController` + `InteractiveTuiSession`** 驱动的纯原生 Raw Mode 事件循环。
  2. 每次按键（`onKey`）时：
     - 若 Slash 补全菜单处于激活状态，`AutocompleteController.handleKey` 优先捕获 `Up`/`Down`（切换选项）、`Tab`/`Enter`（补全上屏）、`Escape`（关闭浮窗）。
     - 否则交给 `TextEditor` 处理字符插入、退格、光标左右移动（Left/Right/Home/End）与历史翻阅。
     - 触发 `InteractiveTuiSession.render()`，原子绘制完整的圆角包围框（`╭─ ... ╮` / `│ ❯ 输入 │` / `╰─ ... ╯`），下边框实时注入包含当前模型名、当前工作区、当前 Git 分支与 Context 占用百分比的动态状态条。

---

## 3. 退出后缺少 Session Resume 提示的问题
- **Root Cause**: `packages/ts-shell/src/core/shell/signalHandlers.ts` 中的 `handleShellClose()` 仅向终端打印了 `\nExiting...\n`，并未输出恢复命令。
- **Solution**:
  - 在用户按 `Ctrl+D`、输入 `/exit` 或发送 `SIGINT` 退出时，在 `altScreen.leave()` 恢复父终端后，格式化输出：
    `\nSession saved. Resume with: npx private-coding-agents --resume <sessionId>\n`

---

## 4. 回车空行无响应且持续下滚刷屏的问题
- **Root Cause**: 在 `readline` 模式下，按 Enter 键终端驱动会自动回显 `\r\n` 换行。
- **Solution**:
  - 在纯 Raw 模式的 `TextEditor` 中，当用户在输入框为空时按下 Enter，直接作为 **No-op（空操作）** 拦截，仅就地重新渲染干净的空输入框，绝对不发出换行或导致视口发生偏移下滚。
