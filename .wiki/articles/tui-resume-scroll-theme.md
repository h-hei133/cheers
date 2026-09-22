---
title: "TUI 交互体验与视觉规范实现"
category: article
sources: [local-tui-state, verification-gates, cli-interactive]
created: 2026-09-06
updated: 2026-09-08
tags: [tui, session, scroll, theme, diff, scrollbar]
summary: "汇总并记录 TUI 在会话管理、视口滚动与滑块交互、语义化配色系统、Diff 语法高亮等维度的落地架构与技术规范。"
confidence: high
---

# TUI 交互体验与视觉规范实现

## 1. Resume 会话管理增强

### 1.1 会话删除、重命名与列表管理
- **实现位置**：`presentation/tui/chrome/sessionsPanel.ts`、`cli/interactive/picker/registry.ts` 与 `session/SessionManager.ts`。
- **交互规范**：
  - 在会话管理与选择面板中，支持 `Ctrl+R` 原生触发会话重命名，支持 `Ctrl+D` 触发删除。
  - 面板列表展示优先显示语义化标题（`session.title ?? session.id`），辅助展示会话更新时间与行数统计。
  - 会话搜索输入框独立于顶边框线，空输入时显示灰度占位提示，输入字符时光标精确跟随，支持模糊匹配与键盘快速切换。

### 1.2 会话自动标题生成
- **实现位置**：`session/SessionManager.ts`。
- **生成规则**：新建会话时若未指定自定义标题，自动根据首个 Prompt 进行规范化截取（去除多余换行与控制字符，最大保留 40 字符）；若首个 Prompt 为空或命令，自动回退为标准短标识格式（`New session <shortId>`）。

---

## 2. 视口滚动与末尾跳转

### 2.1 备用屏内容视口模型
- TUI 完整运行于 Alternate Screen 模式（`\x1b[?1049h`），通过 `InteractiveSurface` 实现内容视口与视差切片。
- 转写历史行数超出视口容量时自动激活滚动状态，通过 `scrollBack` 精确维护向上滚动的行数偏置。

### 2.2 多维滚动交互支持
- **末端跟随（Sticky-to-Bottom）**：默认保持在转写区最新行；当产生新输出时自动跟随，若用户显式向上滚动浏览历史，则保持当前视口不被强行拽回。
- **滚轮与按键**：鼠标滚轮平滑滚动（每次 3 行）；支持 `PgUp` / `PgDn` 整屏翻页与 `Shift+↑` / `Shift+↓` 逐行微调；支持一键回到末尾（`scrollToEnd`）。

---

## 3. 规范级右侧滚轮条与实体滑块拖拽

### 3.1 几何模型（`ScrollbarGeometry`）
- **实现位置**：`cli/interactive/frameSurface.ts`。
- **渲染规则**：
  - 仅在转写行数超出视口容量（`totalRows > capacity`）时在最右列（`width - 1`）激活滚动条，未超出时完全隐藏。
  - 最右列使用细线字符 `│` 绘制轨道（track），使用高亮实体字符 `█` 绘制滑块（thumb）。
  - 滑块高度按 `Math.max(1, Math.round((capacity * capacity) / totalRows))` 动态比例计算，确保长篇对话时滑块尺寸合理且具辨识度。

### 3.2 鼠标命中与拖拽状态机
- **实现位置**：`cli/interactive/pointer.ts`。
- **交互逻辑**：
  - **滑块抓取**：鼠标点击滑块（thumb）时计算在滑块内的相对吸附偏移（`grabOffset`），拖动时平滑位移。
  - **轨道跳转**：点击轨道空白区域时自动居中滑块并立即调用 `scrollToRatio` 跳转至对应百分比位置。
  - **冲突隔离**：滚动条拖拽期间完全屏蔽文本框选与卡片折叠，鼠标释放立即复位状态。
  - **空白死区消除**：在 `screenToContent` 坐标映射中，自动按行实际内容宽度 `visibleWidth` 进行行末夹逼，彻底消除滚动条左侧空白区域无法框选的死区故障。

---

## 4. 语义化主题与配色系统

### 4.1 架构设计
- **实现位置**：`presentation/tui/theme/theme.ts` 与 `themes/dark.json`、`themes/light.json`。
- **设计原则**：完全杜绝在渲染代码中硬编码 ANSI 转义序列或散落 chalk 颜色，所有前景色、背景色与修饰符均统一收敛于类型安全的语义化 Token。

### 4.2 核心语义 Token 映射
| Token | 用途说明 | 默认深色配置 |
|---|---|---|
| `userMessageText` | 用户输入气泡文本 | 亮白 |
| `userMessageBg` | 用户消息全行宽背景 | 浅黑 / 深灰底色 |
| `assistantText` | 模型回复正文 | 标准白 / 亮灰 |
| `thinkingText` | 思考与推理内容（折叠/展开） | 弱化灰（dim） |
| `toolTitle` | 工具卡片标题与执行状态 | 强调青色 |
| `toolOutput` | 工具标准输出与执行结果 | 中性灰 |
| `diffAdded` | 代码/文件修改新增行 | 绿色 |
| `diffRemoved` | 代码/文件修改删除行 | 红色 |
| `diffContext` | 代码修改上下文对比行 | 弱化灰 |
| `command` | Slash 命令标识 | 明黄 |
| `success` | 成功与确认状态 | 绿色 |
| `error` | 拦截、异常与失败提示 | 亮红 |
| `warning` | 警告与权限升级提示 | 橙黄 |
| `muted` | 次要描述与边框辅助线 | 深灰 |

---

## 5. Diff 展示与结构化工具卡片

### 5.1 结构化代码对比
- **实现位置**：`presentation/tui/transcript/diff.ts` 与 `blocks.ts`。
- **展示特性**：
  - 工具调用涉及文件改动（如 `edit`、`write`）时，自动解析差异并生成围栏 Diff 视图。
  - 采用清晰的行前缀 `+` 与 `-` 配合语义配色，长差异行支持自适应宽度与软折行。

### 5.2 工具卡片折叠与交互
- 工具卡片默认显示单行紧凑摘要（工具名、核心参数与行数耗时）；失败卡片（如拦截或执行异常）默认展开以便审计排查。
- 鼠标点击卡片任一行可在折叠/展开之间平滑切换，展开时按行分配归属，支持卡片正文滚动与局部内容高亮复制。
