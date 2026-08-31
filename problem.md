# Problem & Solutions Ledger (Full-Fidelity TUI Engine Porting)

## 1. 根本问题：手工原型积木（Toy Prototypes）与成熟工业级引擎的断层
- **深入剖析**：
  此前虽然实现了一些小文件（`textEditor.ts`, `selectList.ts`, `inputController.ts`, `boxComposer.ts`），但由于是“零碎手写原型”，缺少工业级成熟架构的几十个关键核心机制：
  1. 缺少 **ConPTY 16KB 分块写入与 Windows VT 输入模式**，导致 Windows/WSL 终端光标错乱与丢包；
  2. 缺少 **两通道帧调度计划 (`TerminalFramePlan`：`HistoryBatch` 与 `Viewport` 分流)**，导致输出时将输入框冲毁；
  3. 缺少 **`CURSOR_MARKER` 零宽硬件光标自动提取**，导致光标必须手动算行号且容易偏移；
  4. 缺少 **`InteractiveMode` 全生命周期交互编排器** 与 **`CommandController`**，导致 Slash 命令输出直接被异步重绘覆盖。

- **破局解决方案（直接 1:1 本地化适配成熟代码体系，杜绝重复手写简易玩具）**：
  将成熟 TUI 体系完整、严谨地迁移重构到本项目中（严格使用纯原生命名，不出现任何外部违规名词）：
  1. **底层驱动层（Terminal & Input Subsystem）**：
     - `terminal.ts`：生产级 `ProcessTerminal`，支持 UTF-8 安全分块、Backlog 内存防爆、Raw Mode 严格控制。
     - `stdinBuffer.ts` & `keys.ts`：完整支持 Kitty 协议、ANSI CSI/SS3 序列、修饰键解码与 Bracketed Paste。
     - `utils.ts`：基于 `Intl.Segmenter` 的真正 Unicode 字符簇（Grapheme Cluster）宽度与折行计算。
  2. **核心差分渲染引擎（Core Differential TUI Engine）**：
     - `tui.ts`：全功能双缓冲差分引擎，支持 `HistoryBatch`（历史转录块自然回滚至系统滚动条）与 `Viewport`（动态视口），支持 `CURSOR_MARKER` 自动钉扎硬件光标，支持自适应帧率防抖（30~60 FPS）。
     - `components/box.ts`、`components/text.ts`、`components/spacer.ts`、`components/scrollView.ts`：完整的组件树容器体系。
     - `components/composer/`（`box.ts`、`rule.ts`、`compact.ts`、`borderless.ts`、`registry.ts`）：模块化输入框边框与状态条挂载系统。
  3. **交互式编辑器与补全组件（Editor & SelectList）**：
     - `components/editor.ts`：工业级多行编辑器（词跳跃、Kill-Ring 剪贴环、100 级 Undo 栈、光标居中与自动折行）。
     - `components/selectList.ts`：支持模糊搜索的下拉选择浮窗组件，完美处理方向键、Tab 与 Enter。
  4. **交互编排器（Interactive Mode & Controllers）**：
     - `interactiveMode.ts`：全面替换 `interactiveLoop.ts`，基于事件总线接收用户输入，驱动 Slash 命令与 Agent 回复渲染。
     - `composer.ts`：协调 Welcome 顶部、转录历史、Slash 补全菜单与底部固定编辑器。
