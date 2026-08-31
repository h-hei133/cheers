# Problem & Solutions Ledger (Interactive TUI Realization)

## 1. 光标漂移与对话框边框破坏问题 (Cursor Drift & Box Destruction)
- **Root Cause 深度诊断**：
  1. 当前 `DifferentialTerminalBuffer.render()` 和 `interactiveLoop.ts` 仅仅是将生成的文本行写出，**没有禁用终端的自动折行（DECAWM / `\x1b[?7l`）**。当一行刚好写到终端右边缘时，终端仿真器会自动追加一个隐藏的换行，导致整体画面产生“楼梯状（Staircase）”向下偏移与撕裂。
  2. 当前在渲染光标时，只是在字符串内拼入了一个反色字符 `\x1b[7m \x1b[0m`，而**没有将硬件终端光标定位到该单元格（`\x1b[<row>;<col>H`）并显式开启光标（`\x1b[?25h`）**。结果硬件光标留在帧渲染结束的右下角，导致用户在打字时光标在终端各处乱跳。
  3. `boxComposer.ts` 在计算多行输入时，当光标位于行尾时没有动态扣减右边框 padding，导致单行总字符数超出终端列宽，将右侧竖线 `│` 挤到下一行，破坏了圆角框的封闭性。
- **解决方案**：
  1. 每次 Differential 渲染必须严格包裹在原子帧保护序列中：
     - 开始：`\x1b[?25l\x1b[?2026h\x1b[?7l`（隐藏光标 + 开启原子同步 + 禁用终端自动折行）。
     - 结束：`\x1b[?7h\x1b[?2026l`（恢复自动折行 + 结束同步）。
  2. 精确计算输入框在当前视口中的绝对行号与列号，在刷屏结束时通过 `\x1b[${cursorRow};${cursorCol}H\x1b[?25h` 将硬件光标精准钉在框内的输入位置。
  3. 在 `boxComposer.ts` 中引入严格的行宽约束（`contentWidth = safeWidth - 4 - gutterWidth`），利用 `sliceWithWidth` 确保每一行的视觉宽度严格对齐，绝不把右边框挤出。

---

## 2. 快捷键职责错位问题 (Cancel Shortcut: Escape vs Ctrl+C)
- **Root Cause 深度诊断**：
  - 目前将 `Ctrl+C` 错误地定义为“中止/取消（Cancel）”的主快捷键，而现代一流 Agent（如 OMP/Pi）中：
    - **`Escape`** 是唯一的**业务中断/取消键（`app.interrupt`）**：
      - 优先关闭打开的 Autocomplete 下拉浮窗；
      - 若有正在运行的工具/大模型生成，则发送 `AbortSignal` 中断当前任务；
      - 在空闲输入状态下，保留用户已打出的草稿不清除。
    - **`Ctrl+C`** 是**清空输入框与安全退出键（`app.clear`）**：
      - 单击 `Ctrl+C`：清空当前输入框内的草稿文本（Clear Draft）；
      - 连按两次 `Ctrl+C`（或按 `Ctrl+D`）：触发优雅退出并打印 Session Resume 命令。
- **解决方案**：
  1. 调整 `keybindings.ts` 与 `interactiveLoop.ts`：将 `Escape` 绑定为首要的中断/取消键，取消时不杀进程、不退终端。
  2. 将 `Ctrl+C` 修正为清空草稿；双击 `Ctrl+C` 或按 `Ctrl+D` 触发安全退出。

---

## 3. Tab 键自动补全失效并插入制表符空格问题 (Tab Autocomplete & Key Filtering)
- **Root Cause 深度诊断**：
  1. `Tab` 键（`\t` 或 ASCII 9）在未做按键拦截时，直接落入到了常规字符处理逻辑中，被作为普通可打印文本插入到了 `TextEditor` 中，表现为插入了一个大制表符空格。
  2. `\t` 的制表符在不同终端下的宽度不确定（通常占 8 个字符），插入 `\t` 会导致列宽计算彻底失真，引发框体结构崩溃。
- **解决方案**：
  1. **按键阶段绝对过滤 `\t`**：在字符插入拦截器中，禁止插入原生 `\t`；若用户粘贴包含 Tab 的代码，一律在进入编辑器前统一展开为 2 或 4 个空格。
  2. **Tab 键的交互语义**：
     - 当 Slash 补全浮窗打开时：按 `Tab` 立即将当前选中的命令（如 `/model`、`/cost`、`/compact`）自动补全上屏并附带空格，随后关闭浮窗。
     - 当 Slash 补全浮窗关闭且输入以 `/` 开头时：按 `Tab` 自动强制触发匹配并打开补全浮窗。
