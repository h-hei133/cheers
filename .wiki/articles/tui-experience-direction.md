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

#### E2 进展（873da382 → 本次复核）

管道已通：`argumentHint` 可选字段 → 补全 detail 拼接 → 截断安全（整行截宽），`/model` 首家携带（`use <provider/model>`，与运行语法一致）。复核修补：测试收紧为精确匹配 + 无参数命令负断言。

后续（不进本次）：

- 覆盖：40 个裸命令逐个补 hint（先取参命令，再显式标记无参），可选字段暂留作兼容，补齐后评估必填化；
- 统一：分发侧 `CommandDefinition` 无 hint 字段，路由不读 hint 做校验——未来参数校验源必须合流，不得开第三处；
- 渲染：hint 居尾窄屏先被截，后续保留 hint 列或 summary 前截断；
- 缓存：`candidates()` 进程级缓存无失效，统一注册订阅落地时同步加重置。

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

---

## E1 双子代理探索复核记录（d007bece / 3a86e071 → 本次修补）

两路只读子代理对照参考项目的滚动分层与按键体系，裁决如下。

### 探索结论

1. **滚动分层**——参考为 wheel(1) < Alt+wheel(5) < halfPage < page(viewport−4)，另有 line/prompt 跳转/top-bottom；裸 shift+up/down 无默认绑定（仅解析层），ctrl+shift+up/down 是语义 prompt 跳转。本仓 shift+arrow=5 行是自有设计（E1 任务文档 §2.3 明确要求），参考不能作为依据，保留。
2. **按键冲突**——shift+up/down 与 shift+tab keyId 正交（final 字节 A/B vs Z），无冲突；编辑器无键盘选区模型，无抢占；CSI 1;2A 与 CSI-u 双编码均归一，双路径测试已锁定。
3. **指南一致**——"a few rows" 与 5 行一致；符号方向正确；dispatched⊆advertised 防漂移测试锁定。

### 本次修补（LOW，1 项）

1. **指南尾注过宽**（chrome/keys.ts）——negotiated 尾注称 "the shifted chords above are available"，legacy 用户会误以为 shift+up/down 也需协商；实际 shift+up/down 走标准 CSI 无需增强协议。收窄为 "the shifted Enter chords above are available"。

### 经核实排除项

- **shift+arrow 无草稿门控**：pageup/pagedown 同样全局滚动，同类接受不对称；未来做键盘选区时须同步收回 shift+up/down（备选 ctrl+shift），已在本文记录决策点。
- **滚轮基数 3 vs 参考 1**：手感选择，不在本轮改动；真机体验确认后再定。

### 验证

- `build:ts` 通过；keymap + chrome 8 套件 137 项全部通过。

---

## E2 双子代理探索复核记录（873da382 / 33bbc81d → 本次修补）

两路只读子代理对照参考项目的命令提示与注册表机制，裁决如下。

### 探索结论

1. **hint 覆盖率**——参考同样极低（仅 model/thinking/login 三家带 hint），本仓 1/34 起步符合现状；参考错误提示为各 handler 内联、无统一可用值框架；参数前缀补全是第二阶段（精确匹配命令名后调 getArgumentCompletions）。E2 文档"后续补齐"计划成立，不加速。
2. **双注册表漂移（属实）**——展示侧 43 条 vs 分发侧 45 条：分发独有 commit/tools/thinking 可执行但补全不可见；别名分歧 compact 缺 handoff、log 缺 logs；statusline 反向漂移经核实为 picker 形态（overlay 选择器），展示有分发无正确，排除。

### 本次修补

1. **补齐漂移条目**（slashCommandRegistry.ts）——新增 commit/tools/thinking 展示条目并各带 hint（`use [guidance]` / `use [tool-name]` / `use [low|medium|high|off]`，与各 handler 实际接受的参数一致，thinking 可用值与 "is not a level" 文案一致）；compact 补 handoff 别名，log 补 logs 别名。hint 覆盖 1 → 4。
2. **回归测试**——补全必含 commit/tools/thinking 断言 + thinking hint 精确匹配。

### 经核实排除项

- **补全不匹配别名**：既有设计（40 个交集命令同样只按 label 匹配），handoff/logs 与其他别名行为一致，不改。
- **33 个裸奔 hint**：按 E2 文档后续计划逐批补齐，不在本轮。
- **candidates() 缓存无失效**：注册表静态无突变，当前零影响；动态注册落地时同步加重置（文档已有记录）。

### 验证

- `build:ts` 通过；交互 + 注册表 21 套件 250 项全部通过。
