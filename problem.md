# Problem & Solutions Ledger (Full Production TUI Architecture)

## 核心问题：从最小手写 Toy 转向全量成熟工业级 TUI 交互引擎
- **现状诊断**：
  此前虽然实现了按键解析、编辑器状态机与差分缓冲，但由于采用的是“散装小积木”的自制原型拼接，缺少工业级 TUI 运行时的核心机制（两通道帧计划 `TerminalFramePlan`、滚动历史批量退役 `HistoryBatch`、多行富文本编辑器 `Editor`、`SelectList` 悬浮组件、多段状态栏控制器 `StatusLineComponent` 与 `InteractiveMode` 交互编排器），导致在真实复杂终端环境下存在体验断层。
- **工业级解决方案（直接本地化吸收成熟架构体系）**：
  1. **全套 TUI 渲染与事件引擎**：
     - `terminal.ts` & `stdinBuffer.ts`：纯原生虚拟终端控制、输入流拼装、Kitty 协议解码与括号粘贴。
     - `tui.ts` & `buffer.ts`：两通道双缓冲差分帧渲染（支持 `HistoryBatch` 不可变历史回滚与 `Viewport` 可变视口分离，ANSI Mode 2026 原子刷屏，APC 硬件光标绝对钉扎）。
     - `components/editor.ts`：全功能多行编辑器，支持单词跳跃、Emacs Kill-Ring 剪贴环、Undo/Redo 撤销栈、多行折行渲染与光标自动滚动。
     - `components/selectList.ts`：交互式悬浮菜单组件，支持模糊搜索打分、方向键平滑导航、Tab/Enter 补全。
  2. **多段自适应状态栏与微型欢迎卡片**：
     - `statusLine/`：多段式自适应状态栏（实时模型、Git 状态、3 级 Context 阶梯预警、耗时与成本）。
     - `welcomeBanner.ts`：全屏画布顶部极简卡片，纯净无外部终端日志泄漏。
  3. **交互编排器（Interactive Mode Coordinator）**：
     - 彻底接管交互式入口，按键直通 `InputController` 与 `Editor`，支持多级 `Escape` 取消阶梯（关闭浮窗 $\rightarrow$ 中断流式/工具 $\rightarrow$ 保留输入草稿）与 `Ctrl+C` 清空草稿/双击退出。
     - 退出时恢复终端并输出标准的 `Session saved. Resume with: private-coding-agents --resume <sessionId>`。
