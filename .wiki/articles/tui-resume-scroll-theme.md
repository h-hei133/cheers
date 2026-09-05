# TUI 体验优化方案

## 1. Resume 面板增强

### 1.1 删除/重命名 Session
- `sessionsPanel.ts` 已有 Ctrl+R（重命名）和 Ctrl+D（删除）逻辑
- 需确认 `SessionManager.renameSession()` 和 `deleteSession()` 已实现（已存在）
- 当前 sessionsPanel 显示时用 `session.id`，需改为 `session.title ?? session.id`

### 1.2 默认标题
- 新建 session 时 `session.title` 为空
- 方案：在 `SessionManager.createSession()` 中自动生成标题
- 标题生成逻辑：截取 prompt 前 40 字符（去除换行），如为空则生成 "New session <shortId>"
- 参考 OMP：用 AI 生成标题（需异步），我们先用 prompt 截取

## 2. 滚动到底部快捷键 Ctrl+End

### 2.1 当前实现
- TUI 使用 alternate screen + 自定义渲染
- 无滚动概念，因为整个内容都在屏幕上

### 2.2 需要滚动的场景
- 内容溢出 viewport 时需要滚动
- OMP 使用 `ScrollView` 组件管理 offset
- 我们需决定：是否引入 ScrollView？

### 2.3 方案选择
- 选项 A：在现有 TUI 中加 `scrollOffset` 状态，Ctrl+End 直接跳到末尾
- 选项 B：引入类似 OMP ScrollView 的组件

推荐 A：轻量，不引入新组件。在 render engine 中加滚动状态。

## 3. 右侧滚动条

### 3.1 OMP 方案
- 使用 `ScrollView` 组件，在右侧渲染滚动条
- `track` 用 `│` 字符，`thumb` 用 `█` 字符
- 根据内容高度和 viewport 高度计算 thumb 位置和大小

### 3.2 移植方案
- 复制 OMP ScrollView 核心逻辑到 `src/presentation/tui/components/scroll-view.ts`
- 适配我们的 TUI 架构

## 4. 配色系统

### 4.1 当前问题
- 所有文本白色，区分度不够
- 缺少语义化颜色

### 4.2 OMP 方案
- 使用 JSON 配置文件定义 theme（dark/light）
- `theme.ts` 提供类型安全的 color token 访问
- 支持运行时切换

### 4.3 我们的方案
- 扩展现有 `theme.ts`，添加更多 semantic tokens
- 创建 `themes/dark.json` 和 `themes/light.json` 配置文件
- Theme 类加载配置，支持扩展

### 4.4 颜色映射表
| Token | 用途 | 颜色建议 |
|-------|------|----------|
| `userMessageText` | 用户输入（已有背景色） | 白色 |
| `assistantText` | 模型输出 | 白色/亮灰 |
| `thinkingText` | 思考过程 | 灰色（dim） |
| `toolTitle` | 工具调用标题 | 青色 |
| `toolOutput` | 工具输出 | 灰色 |
| `diffAdded` | 新增内容 | 绿色 |
| `diffRemoved` | 删除内容 | 红色 |
| `diffContext` | 上下文 | 灰色 |
| `filename` | 文件名 | 蓝色 |
| `command` | 命令 | 黄色 |
| `commandArg` | 命令参数 | 白色 |
| `success` | 成功 | 绿色 |
| `error` | 错误 | 红色 |
| `warning` | 警告 | 黄色 |
| `muted` | 次要信息 | 灰色 |

## 5. Diff 展示增强

### 5.1 当前问题
- 只显示编辑命令，不显示 diff 内容

### 5.2 OMP 方案
- 在 tool result 中展示 diff（新增/删除行）
- 用颜色区分（绿色=新增，红色=删除）

### 5.3 移植方案
- 在 `toolResultMessage.ts` 或 render 层解析 diff
- 使用现有 `diffPaint` 能力
