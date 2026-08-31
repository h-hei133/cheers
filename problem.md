# Problem & Solutions Ledger (Direct Adoption & Execution Diagnostics)

## 1. AltScreen 全新空白页面未生效的根本原因
- **Root Cause**: 在 `packages/ts-shell/src/cli/interactive/interactiveMode.ts` 中，`start()` 仅调用了 `this.tui.start()`，漏掉了 `altScreen.enter({ exitMode: "replay" })` 调用，导致直接在主终端缓冲区中绘图，未能切入 Alt-Screen 独立画布。
- **解决方案**: 在 `InteractiveMode.start()` 中显式调用 `altScreen.enter({ exitMode: "replay" })`，在 `stop()` 中调用 `altScreen.leave()`。

---

## 2. Slash 命令按 Enter 毫无反应的致命缺陷
- **Root Cause**: 在 `packages/ts-shell/src/presentation/tui/inputController.ts` 的第 49~57 行中：
  ```typescript
  if (event.keyId === "tab" || event.keyId === "enter") {
    const chosen = this.selectList.getSelectedItem();
    if (chosen) {
      this.editor.setText(`${chosen.value} `);
      this.autocompleteActive = false;
      this.callbacks.onRequestRedraw();
      return; // 错误地拦截了 Enter，仅在末尾加了个空格，根本没有调用 onSubmit()！
    }
  }
  ```
  当用户键入 `/help`、`/model`、`/undo` 等命令并按 Enter 时，代码误把 Enter 当成了“选择补全项”，只把文字替换为带空格的字符串，**根本没有执行任何命令提交（`onSubmit`）**！
- **解决方案**:
  - `Tab` 键负责将选中的自动补全项填入输入框（带尾随空格）。
  - `Enter` 键绝不拦截文本替换，直接向下穿透触发 **`onSubmit(submittedText)`**，真正启动 Slash 命令路由与执行！

---

## 3. 命令执行结果上屏与转录管道
- **Root Cause**: 在 `interactiveMode.ts` 中，`capturingRenderer` 捕获的输出虽然存入了 `this.transcript`，但没有推入 `pendingHistoryBatch`，并且缺乏即时的帧重绘调度。
- **解决方案**: 在命令执行完成后，立即将输出推入 `transcript` 与 `pendingHistoryBatch`，并触发 `tui.requestRender()`，确保结果清晰常驻在屏幕上方。
