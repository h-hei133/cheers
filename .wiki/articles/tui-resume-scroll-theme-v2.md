# TUI 体验优化完整方案（V2 已实施）

## 1. Resume 面板

### 当前实现
- `sessionPicker` 使用 `sessionManager.listRecentSessions(MAX_SESSIONS)`
- **主 label**：`session.title ?? session.id`（`session.ts:43`）
- 标题自动生成：`sessionLifecycleStore.ts` 的 `markSessionRunStarted` 中调用 `deriveSessionTitleFromPrompt`，从 prompt 第一行派生（≤60 字符）
- 删除：`picker.onDelete` 钩子（`overlay.ts`）+ `sessionManager.deleteSession()`
- 重命名：`picker.onRename` 钩子（`overlay.ts`）+ `sessionManager.renameSession()`
- 快捷键：`Delete` 键（删除）、`Ctrl+R`（重命名）
- `PickerHost` 接口扩展了 `deleteSession`/`renameSession`，`interactiveMode.ts` 已接入

### 参考实现
- OMP session-selector.ts：使用 `ScrollView` 组件渲染会话列表，右侧有 scroll thumb
- Delete 实现：用户按 Delete 键触发，弹出 `HookSelectorComponent` 确认对话框

## 2. 滚动机制

### 架构说明
- TUI 使用备用屏（alt-screen, `\e[?1049h`）
- 备用屏本身无原生滚动条——滚动由 surface 管理（frameSurface.ts 的 `scrollBack`）
- 快捷键：PageUp/PageDown、Shift+Up/Down、Ctrl+End
- **未实现虚拟滚动条**：因架构不同，OMP 的 ScrollView 只在 picker 全屏中使用

### 参考
- OMP tui.ts 只在 fullscreen overlay 用备用屏，主循环在 normal screen
- 我们的 TUI 整体在备用屏上，所以原生终端滚动条不可用
- 解决方向：若要用原生滚动条，需将主循环改为 normal screen 模式——改动太大，暂不做

## 3. 配色系统

### 架构
- `presentation/themes/` 目录：`dark.json`（默认）、`light.json`
- `presentation/theme/theme.ts`：`Theme` 类，支持 truecolor（检测 `TerminalCapabilities.hasTrueColor`）
- Token 命名：语义化（`diffAdded`/`diffRemoved`/`thinkingText`/`toolOutput` 等）
- 切换主题：`setTheme(name)` → `defaultTheme` 不变，运行时 `currentTheme`

### 配色方案（dark，参考参考项目 dark.json）
- 主要 token 已对齐：accent/border/success/error/warning/muted/dim/工具 token
- 使用参考项目的色值（`#febc38` accent, `#89d281` success, `#fc3a4b` error 等）
- 扩展 token：`filename`（蓝）/ `command`（黄）/ `thinkingText`（灰）

## 4. Diff 展示

### 现状
- `blocks.ts` 的 `splitFencedDiff` 提取 fenced diff（` ```diff ... ``` `）
- `toolCards.finish` 调用 `splitFencedDiff`，把 diff 移到 `block.diff` 字段
- `renderTool` 在 `block.diff` 时调用 `renderDiff`，用 `diffAdded`/`diffRemoved` token 着色
- `turnSink.line` 也有调用（prose 模式下），覆盖模型内联 diff 场景

## 5. 下一步可考虑
- 主循环改用 normal screen + 真实终端滚动条（大改，影响鼠标选择、alt 屏依赖）
- OMP 参考：`session-selector.ts` 的 `ScrollView` 组件，可移植为 picker 的右侧 thumb
- 更多配色：参考项目有 5 套主题，可逐步移植
