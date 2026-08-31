# Problem & Solutions Ledger (Bottom-Pinned Viewport & Interactive Commands)

## 1. 输入框固定在页面最上方的问题 (Top vs Bottom-Pinned Viewport)
- **Root Cause 深度诊断**：
  - 在 `packages/ts-shell/src/presentation/tui/buffer.ts` 中，`DifferentialTerminalBuffer.render(frame)` 是从 `i = 0` 循环到 `maxLines`，并依次向终端输出 `\x1b[${i + 1};1H\x1b[2K${line}`。
  - 由于当前的 Box Composer 帧总共只有 4 行，因此被硬生生刷在了终端的第 1、2、3、4 行（即终端最顶端）。
  - 在顶尖现代 TUI（如 OMP）中，全屏终端高度 $H = \text{stdout.rows}$，Box Composer 始终**被钉死在终端的最底部（Bottom Pinned）**：
    $$\text{topAnchor} = H - F$$
    其中 $F$ 为 Box Composer 的行数（约 4~5 行）。Box Composer 的第 $i$ 行必须渲染在物理行号 $\text{topAnchor} + i + 1$ 上，使得输入框永久牢牢固定在屏幕最底端，上方全部空间留给可滚动的对话转录区！
- **解决方案**：
  1. 重构 `DifferentialTerminalBuffer` 与 `ViewportCoordinator`：在全屏/Alt-Screen 模式下，自动计算 $\text{topAnchor} = \max(0, H - F)$，将 Box Composer 及其光标精准钉在屏幕最底端行（例如 24 行终端的第 20~24 行）。
  2. 硬件光标的行号相应偏移至 $\text{topAnchor} + \text{cursorLine} + 2$，保证光标稳稳落在底部输入框内。

---

## 2. Slash 命令交互式浮窗与模式切换缺失 (/model, /undo 体验修复)
- **Root Cause 深度诊断**：
  - 当前的 `/model`、`/undo` 等命令只是作为 CLI 文本脚本处理，执行时打印几行死板的字符串，没有接入 TUI 的交互式模态选择器（Modal Selector）。
  - 例如用户输入 `/model` 时，应该像成熟 Agent 那样直接弹出一个 **交互式 ModelPicker / SelectList 下拉选择框**，列出所有可用模型供方向键选择并回车生效；
  - 输入 `/undo` 时，应该调用 `sessionDagEngine` / Git 还原上一轮变更并展示实时的 Diff 撤销预览。
- **解决方案**：
  1. 实现交互式 `ModelPicker`：当用户在 TUI 中输入 `/model` 时，自动挂载候选模型列表（如 `claude-3.5-sonnet`, `gpt-4o`, `gemini-2.0-flash`, `deepseek-chat`），支持上下箭头选择、Enter 即时切换并实时刷新底部状态栏中的模型名称！
  2. 增强 `/undo`：联动物理 Git 回滚与 Session DAG 分支回退，展示已撤销的文件变更。
  3. 增强 `/compact`、`/context`、`/cost`：直接在 TUI 视口中以美观的图表/卡片呈现，而非散乱文本。
