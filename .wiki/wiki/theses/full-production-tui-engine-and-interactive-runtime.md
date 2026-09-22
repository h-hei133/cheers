# 工业级全套 TUI 交互引擎与两通道视口架构专著 (Production TUI Engine & Two-Channel Viewport Architecture)

## 1. 架构目标与总体拓扑

为了彻底告别原型拼凑、一次性实现全球顶尖水准的终端编码交互体验，我们对工业级成熟 TUI 架构进行了全量解构与本地化重构规划：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Native TUI Runtime                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [ ProcessTerminal & StdinBuffer ] ── (Raw Input / ConPTY chunking / Paste) │
│          │                                                                  │
│          ▼                                                                  │
│  [ TUI Engine ] ── (Frame Throttling / SGR Coalescing / DEC 2026 Sync)      │
│          │                                                                  │
│          ├──► [ History Batch Channel ] ── (Monotonic Scrollback Commits)   │
│          │                                                                  │
│          └──► [ Viewport Channel ] ── (Double-Buffered Diffing + Overlays)  │
│                     │                                                       │
│                     ├──► [ Transcript Container ] (Streaming LLM & Tools)   │
│                     ├──► [ Floating SelectList ] (Slash Autocomplete)       │
│                     ├──► [ Full-Featured Editor ] (Multiline / Word Wrap)   │
│                     └──► [ Dynamic Status Line ] (Multi-Segment Layout)     │
│                                                                             │
│  [ Interactive Coordinator ] ── (InputController, Keybindings, Esc Ladder)  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心四大子系统设计

### 一、 终端两通道帧机制 (Two-Channel Terminal Frame Provider)
- **`HistoryBatch` 不可变历史通道**：
  - 已经完成的对话块和工具执行记录，转化为单调递增的 `HistoryBatch` 批量提交到终端的原生滚动缓冲区（Native Scrollback），确保长程会话（1000+ 轮）不占用活动视口内存。
- **`Viewport` 可变视口通道**：
  - 仅保留当前正在流式生成的回复、正在运行的工具卡片以及底部固定的编辑器与状态栏，在双缓冲差分器中进行毫秒级原子刷新（ANSI Mode 2026）。

### 二、 全功能多行文本编辑器 (`Editor`)
- **排版与光标模型**：
  - 基于 `Intl.Segmenter` 的真实字符与单词切分，支持多行自动折行（`wordWrapLine`）。
  - 支持 `Ctrl+A`/`Ctrl+E`（行首/行尾）、`Alt+Left`/`Alt+Right`（词跳跃）、`Ctrl+K`/`Ctrl+U`（行剪切）、`Alt+Backspace`（词删除）。
  - 内置 Emacs 风格的 **Kill-Ring 剪贴环** 与 100 级 **Undo/Redo 撤销栈**。
- **光标钉扎**：
  - 在渲染输出流中精准嵌入零宽光标标记（`CURSOR_MARKER`），刷屏后自动转换为硬件终端光标物理绝对坐标定位（`\x1b[row;colH\x1b[?25h`）。

### 三、 交互式悬浮菜单与命令选择器 (`SelectList`)
- **模糊搜索与按键捕获**：
  - 输入 `/` 瞬间挂载 `SelectList` 组件。
  - 优先拦截 `Up`/`Down` 切换选项，`Tab`/`Enter` 自动补全上屏并附加空格，`Escape` 瞬时关闭。

### 四、 交互协调器与多级取消阶梯 (`InputController`)
- **`Escape` 业务级取消阶梯**：
  1. 浮窗可见 $\rightarrow$ 关闭浮窗，保留草稿。
  2. 任务运行中 $\rightarrow$ 发送 `AbortSignal` 终止执行，不退程序。
  3. 空闲输入中 $\rightarrow$ 保护草稿不被清空。
- **`Ctrl+C` 与退出**：
  1. 单击 `Ctrl+C` $\rightarrow$ 清空输入框草稿。
  2. 连按两次 `Ctrl+C` 或按 `Ctrl+D` $\rightarrow$ 优雅退出并输出恢复命令：
     `Session saved. Resume with: private-coding-agents --resume <sessionId>`。
