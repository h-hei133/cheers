---
title: "TUI Experience Direction"
category: article
sources: [local-tui-state, reference-experience-survey, slash-commands, keybindings, theme]
created: 2026-09-12
updated: 2026-09-12
tags: [tui, experience, direction]
summary: "Non-architectural experience gaps and direction: feel, slash commands, configuration, style. No production behavior changed."
confidence: high
---

# TUI Experience Direction

> 本文档是方向性文档：记录参考实现中值得吸收的手感、体验、slash 命令、配置、风格，不局限于架构。
> 本轮只建档，不改生产代码；后续实现必须按 Phase 4 原则逐项落地。

## 1. 总体判断

当前 TUI 已经是生产路径上的真实实现，但体验层仍是“可用”，不是“顺手”。

差距不在渲染底座，而在：

- 输入手感；
- 命令发现；
- 快捷键体系；
- 状态表达；
- 配置能力；
- 视觉风格一致性。

后续方向是继续当前备用屏实现，把参考实现中可验证的体验语义逐项吸收到现有 `surface/`、`chrome/`、`transcript/`、`input/`、`editor/` 边界。

## 2. 手感

### 2.1 当前状态

- 滚轮每次 3 行；
- 滑块支持点击跳转与拖拽；
- 选区基于内容坐标；
- 拖选到达边缘自动滚屏；
- Escape 按层级 unwind；
- Ctrl+C 双击退出。

### 2.2 可参考方向

1. 统一取消阶梯：
   - overlay 打开时先关 overlay；
   - turn 运行中再中断；
   - 空闲输入中保护草稿；
   - 每级都有明确视觉反馈。
2. 队列手感：
   - busy 输入 Enter 转为转向；
   - Alt+Enter 转为跟进；
   - 中断后未投递输入回填；
   - 队列状态在状态带可见。
3. 滚动手感：
   - 滚轮、PgUp/PgDn、Shift+方向键速度分层；
   - Home/End 到达两端；
   - 滑块 grabOffset 保持；
   - 拖拽期间屏蔽选区与折叠冲突。
4. 编辑器手感：
   - Emacs 风格 kill-ring；
   - undo/redo；
   - 词跳跃；
   - 外部编辑器；
   - 图片粘贴；
   - 消息复制与恢复队列。

## 3. Slash 命令

### 3.1 当前状态

- 命令来自注册表，不是手写列表；
- `/` 开头且符合命令名才提示；
- 支持别名与分组；
- 路径输入不会误触发命令菜单。

### 3.2 可参考方向

1. 内置命令补齐：
   - settings 菜单；
   - model 选择器；
   - thinking 等级；
   - session tree；
   - fork/clone；
   - trust；
   - login/logout；
   - new/compact/resume/reload/quit；
   - export/import/share/copy/name/session/changelog/hotkeys。
2. 参数提示：
   - 每个命令携带 `argumentHint`；
   - 参数前缀补全；
   - 参数错误时给出可用值。
3. 命令来源：
   - 内置、扩展、模板、技能统一注册；
   - 同名替换可逆；
   - 订阅变更后自动刷新补全。
4. 交互形态：
   - 选择器式命令用独立选择界面；
   - 表单式命令用面板；
   - 只读查询直接输出；
   - 破坏性命令先确认。

## 4. 配置

### 4.1 当前状态

- 状态带可配置显示项；
- provider、模型、权限、agent 模式有运行时状态；
- 主题支持 JSON 加载；
- 非 TTY 自动降级。

### 4.2 可参考方向

1. 显示配置：
   - thinking 块显示/隐藏；
   - 缓存未命中提示；
   - 输出内边距；
   - 补全最大可见数；
   - 硬件光标显示；
   - Markdown 渲染选项；
   - 警告选项。
2. 快捷键配置：
   - 应用级与编辑器级分离；
   - Windows/WSL 差异处理；
   - 可重载；
   - `/hotkeys` 可查；
   - 冲突可发现。
3. 会话配置：
   - 模型作用域；
   - thinking 等级；
   - 外部编辑器；
   - shell 路径；
   - 自动压缩阈值；
   - 保留 token。
4. 持久化：
   - 全局与项目级分离；
   - 修改标记；
   - 保存失败可感知；
   - 重载不丢会话。

## 5. 风格

### 5.1 当前状态

- 语义 token：text、assistant、thinking、tool、diff、filename、command、md、success、error、warning、muted、dim、accent、border、selectedBg、userMessageBg、tool 状态背景、syntax；
- 用户消息满宽背景；
- 工具卡片边框与状态色；
- 状态带单行填充；
- composer 无框 cue；
- toast 瞬态覆盖。

### 5.2 可参考方向

1. 消息风格：
   - 用户、assistant、thinking、tool、compaction、notice 视觉分层；
   - 时间戳可选；
   - 输出内边距可配；
   - 代码块语言标签；
   - diff 行语义色；
   - 长输出折叠与展开一致。
2. 状态风格：
   - footer/status bar 状态文本；
   - streaming 加载语；
   - hidden thinking 标签；
   - editor 上下方 widget；
   - selection 与 focus 恢复。
3. 主题风格：
   - track/thumb 可注入；
   - border/accent/muted 语义统一；
   - 深浅主题对比度验证；
   - 终端原生 ANSI 回退；
   - 屏幕阅读器可读性。
4. 布局风格：
   - chrome 高度预算固定；
   - transcript 最小可见行；
   - overlay 全屏与内联分离；
   - modal/panel/search 层级一致；
   - 窄屏降级策略明确。

## 6. 后续实施顺序建议

1. 取消阶梯与队列手感；
2. slash 参数提示与命令补齐；
3. 快捷键体系与 `/hotkeys`；
4. 状态带与 footer 状态表达；
5. 主题 track/thumb 注入与对比度；
6. 消息视觉分层与折叠一致性；
7. 配置持久化与重载；
8. 终端矩阵体验记录。

每一步先有 failing test，再改生产代码，最后跑 focused 验证；手感部分由真机体验确认，不用脚本伪造。

## 7. 阶段划分

> 按用户价值与依赖关系划分，不按文件数量划分；每个阶段独立可验证、可发布。

### E1：输入与取消手感

范围：取消阶梯、队列手感、滚动速度分层、编辑器基础手感。

- overlay 打开先关 overlay，turn 运行中再中断，空闲保护草稿；
- busy 输入 Enter 转向、Alt+Enter 跟进、中断回填、队列状态可见；
- 滚轮、PgUp/PgDn、Shift+方向键、Home/End 速度分层；
- 词跳跃、kill-ring、undo/redo 基础能力。

验证：focused 交互测试 + 真机手感确认。

### E2：命令发现与执行

范围：slash 命令补齐、参数提示、命令来源统一、交互形态分离。

- 补齐 settings、model、thinking、tree、fork/clone、trust、login/logout、new/compact/resume/reload/quit、export/import/share/copy/name/session/changelog/hotkeys；
- 每个命令携带参数提示与前缀补全；
- 内置、扩展、模板、技能统一注册订阅；
- 选择器、面板、只读输出、破坏性确认四种形态分离。

验证：注册表测试 + 补全测试 + 真机命令走查。

### E3：状态与风格一致性

范围：状态表达、消息分层、主题语义、布局预算。

- footer/status bar、streaming 加载语、hidden thinking 标签、editor widget；
- 用户、assistant、thinking、tool、compaction、notice 视觉分层；
- track/thumb 主题注入与深浅对比度；
- chrome 高度预算、transcript 最小可见行、overlay 全屏/内联分离、窄屏降级。

验证：chrome/transcript 主题测试 + 真机视觉确认。

### E4：配置与发布准备

范围：显示配置、快捷键配置、会话配置、持久化与发布门。

- thinking 显示、缓存提示、输出内边距、补全可见数、硬件光标、Markdown、警告；
- 应用级与编辑器级快捷键分离、Windows/WSL 差异、重载、`/hotkeys`、冲突发现；
- 模型作用域、thinking 等级、外部编辑器、shell 路径、压缩阈值；
- 全局与项目级分离、修改可感知、重载不丢会话；
- 终端矩阵记录、长会话预算、断开证据、发布门归档。

验证：配置测试 + 真机矩阵 + 发布门清单。
