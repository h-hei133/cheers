# Problem & Solutions Ledger (5 Core TUI Defects & Native Resolution)

## 1. Slash 命令浮窗残留与无法滚动查看完整列表问题 (Menu Ghosting & Scrollability)
- **Root Cause 深度诊断**：
  1. **残影残留（Ghosting）**：当补全浮窗打开时，视口包含 12 行（`topAnchor = H - 12`）；当浮窗关闭时，视口缩小为 5 行（`topAnchor = H - 5`）。`DifferentialTerminalBuffer` 仅重绘新视口范围内的行，而此前在物理行号 `H - 12` 到 `H - 5` 上绘制的边框线**从未被发送 `\x1b[2K` 清除**，导致残影永久留存在终端屏幕上。
  2. **无法滚动**：`selectList.ts` 简单截取前 6 项，缺少 `scrollOffset` 滚动视口管理与滚动条指示器，超出 6 个的命令永远无法被翻阅。
- **解决方案**：
  1. 在 `DifferentialTerminalBuffer` 与 `tui.ts` 中维护上一次绘制的绝对行范围 `[prevTopAnchor, prevTopAnchor + prevLen)`。在新一帧中，任何属于上一帧但不在当前帧内的物理行，**强制发送 `\x1b[${row};1H\x1b[2K` 进行彻底擦除**！
  2. 在 `selectList.ts` 中引入 `scrollOffset` 动态窗口滑动，当方向键选中项超出可视区域时自动平滑滚动，并渲染 `↑ N more` / `↓ M more` 提示。

---

## 2. 中文 (CJK) 输入导致光标位置错乱与框体破损问题 (CJK East Asian Width)
- **Root Cause 深度诊断**：
  1. 当前 `utils.ts` 中的 `visibleWidth(text)` 只是简单调用 `stripAnsi(text).length`。
  2. JavaScript 的 `string.length` 是按 UTF-16 Code Unit 计算的（1 个汉字为 1），而终端栅格遵循 **Unicode UAX #11 (East Asian Width)** 标准，中文字符（如 `你`、`好`、`中`、`文`）**实际占用 2 个物理终端列宽**！
  3. 当用户输入中文时，`visibleWidth` 少算了列数：
     - 光标钉扎 `\x1b[row;colH` 计算的列号偏小，导致硬件光标倒退并直接压在汉字上方乱跳；
     - `boxComposer.ts` 计算的右填充空格过多，导致右边框 `│` 被挤出超宽，破坏了圆角框结构。
- **解决方案**：
  1. 在 `utils.ts` 中实现标准 East Asian Width 算法：检测 CJK 统一表意文字（`0x4E00 - 0x9FFF`）、全角符号（`0xFF01 - 0xFF60`）及宽字符 Emoji，准确计为 **2 列宽**。
  2. 修复 `sliceWithWidth` 与 `boxComposer.ts`，确保无论输入纯英、中文还是混合 Emoji，光标与右边框 100% 精确对齐！

---

## 3. 用户输入与模型输出缺少视觉背景区分问题 (User Message Shading)
- **Root Cause 深度诊断**：
  `TranscriptContainer.render()` 渲染用户提问时，仅在行首加了青色 `❯ ` 提示符，背景依然是终端默认的透明/黑色，与模型输出和工具执行日志混在一起，视觉对比度差。
- **解决方案**：
  1. 在 `theme.ts` 中新增 `userMessageBg` 专属背景 Token（如深蓝灰 `\x1b[48;5;236m` / `\x1b[48;2;31;35;53m`）。
  2. 在 `TranscriptContainer` 中以 **通栏背景色块气泡（Full-Width Shaded Bubble）** 渲染用户提问，模型输出保持默认背景，形成极其清晰的层次区分。

---

## 4. Slash 命令必须绝对前缀匹配而无法模糊/子串匹配问题 (Fuzzy Matching)
- **Root Cause 深度诊断**：
  `slashAutocomplete.ts` 硬编码了 `cmd.name.toLowerCase().startsWith(query)`。如果用户输入后半段（如 `st`、`un`、`mod`），前缀匹配直接返回空，导致用户必须从头输入完整的命令名。
- **解决方案**：
  实现分级模糊匹配与打分引擎（Exact -> Prefix -> Substring -> Subsequence Fuzzy -> Description）：
  - 键入 `st` $\rightarrow$ 自动匹配并高亮 `/cost`；
  - 键入 `do` $\rightarrow$ 自动匹配 `/undo`；
  - 键入 `mod` $\rightarrow$ 自动匹配 `/model`。

---

## 5. Alt-Screen 导致无法使用鼠标滚轮向上查看历史记录问题 (Native Scrollback)
- **Root Cause 深度诊断**：
  `InteractiveTuiSession` 在启动时强制调用了 `altScreen.enter()`（`\x1b[?1049h`）。备用屏幕缓冲区是固定尺寸的无历史画布，终端仿真器在此模式下会完全禁用原生的滚动条（Scrollback Buffer），超出视口的早期对话被切片丢弃后便无法回看。
- **解决方案**：
  遵循 **原生滚动条驱动模式（Native Scrollback Architecture）**：
  1. 默认在 **主屏幕缓冲区** 中运行交互会话，仅在打开全屏模态选择器时临时借用 Alt-Screen。
  2. 结合 `HistoryBatch` 机制：当对话历史超出上方可用高度时，已完成的历史块作为不可变批次自然提交给终端标准流（进入系统滚动条），下方固定停靠 Box Composer，用户随时可用鼠标向上翻看所有历史记录！
