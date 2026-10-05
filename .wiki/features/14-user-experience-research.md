---
title: "14：交互体验、工具成熟度与上下文来源研究"
category: article
sources: [user-experience-report-2026-10-05, current-source-28ff98ce, isolated-probes-2026-10-05, pi, oh-my-pi, codex]
created: 2026-10-05
updated: 2026-10-05
tags: [research, tui, startup, tools, sessions, context, configuration]
summary: "逐项核对用户体验反馈，记录当前实现、隔离验证、参考实现差异与未证实原因。已发现工具参数、路径边界、用户决定真实性和交互一致性问题；本轮仅研究及文档交付，不修复代码，不宣称生产验收完成。"
confidence: mixed
---

# 14：交互体验、工具成熟度与上下文来源研究

## 1. 范围与结论口径

本轮任务是**验证、探索并记录全部问题**。没有修改运行时代码、测试、配置契约、package scripts、构建行为或 provider/auth 实现。研究完成不表示文中缺陷已修复，也不表示 Phase 18 或全部工具已通过生产验收。

基线为 `feat/phase-18` 的 `28ff98cee8c4dd63e6752452f73a362ed3559ae3`。开始时已有用户对 `.gitignore` 的修改，本轮保留。输入为用户附件及后续澄清；历史背景参见 [Phase 18 验收核对](phase-18-acceptance.md)、[裁决记录](phase-18-decisions.md) 和 [项目日志](../log.md)。

### 1.1 用户现场澄清

| 项目 | 当前已知 |
|---|---|
| 使用环境 | WSL 中的 Ubuntu 终端；具体 Windows 终端前端、版本、字体与光标样式尚未确定 |
| 启动方式 | `npm start` |
| 粘贴触发 | 任意短单行文本也能触发；正常逐字输入不出现；用户示例为 `He│llo` 看起来像 `Heello` |
| 约 5.4k 的位置与时点 | **第一次发送“你好”后，状态栏显示**。这条澄清取代附件中“还没有开始对话”的初始表述 |
| 上游提示词 | 用户提出的待检验解释；本轮没有真实出站负载或上游内部输入证据 |

文中证据标记：**实测**指本轮实际运行的隔离探针；**源码**指当前实现或既有测试断言的阅读；**历史**指先前提交和验收记录；**未知**指现有证据不能确定。既有测试被引用不表示本轮运行过该测试。

本轮探针使用仓内临时目录、隔离运行时 HOME、合成会话、内存执行器或 mock fetch；没有使用真实 provider 配置，没有访问真实用户会话或编辑快照。多路只读分查中出现了 rate limit 中断，不能将未返回的分查计作独立审查通过。

### 1.2 用户问题覆盖表

| 用户问题 | 本轮结论 | 位置 |
|---|---|---|
| 裸 `/` 展示全部别名 | 已确认；59 个主命令投影出 117 项候选，其中 58 项是别名 | §2.1 |
| 短单行粘贴光标残影 | 组件探针未出现重复插入；用户终端的视觉残影仍未复现、未归因 | §2.4 |
| 启动慢 | 实测 `npm start` 到输入框约 2.48–5.38 秒；内部计时有明显覆盖盲区；没有旧版本对照 | §3 |
| `/res` 有候选但 Enter 不补全 | 已确认默认高亮与 `chosen` 状态不一致；当前首项还是 `/reset`，需与候选排序问题区分 | §2.2 |
| 工具输出混入审批文字 | 已复现审批状态与最终正文混层；批准前缀还进入模型工具消息 | §4.1 |
| deep-research 被改方向 | 当前是有界网页资料收集器；去除虚假机制宣称不等于完成用户要求的深度研究 | §6 |
| 高级配置与参考项目比较 | 已有 JSON 配置和多项参数；类型诊断、覆盖来源、配置入口存在缺口 | §5 |
| resume 选择位置不归零 | 已复现 OverlayHost 重开后保留上次索引 | §8.1 |
| resume 的 turn 改成文件大小 | 当前未实现；先记录需求及落盘大小口径问题，本轮不改 UI | §8.2 |
| 首次“你好”后约 5.4k | 状态栏来自请求用量；3,063 仅是工具 schema 粗估，本地还有系统提示和项目指令 | §7 |
| 15 个工具是否生产就绪、是否与参考等同 | 不能确认；有已复现的正确性及边界缺陷，也有明确能力差距 | §9 |
| 一次编辑多文件是否必须 bash | 多个单文件 `edit` 调用可以完成，不必用 bash；缺单调用多文件 patch 契约及跨文件事务 | §9.9 |
| `/undo` 长文字与测试夹具文件 | 它只描述最近编辑和恢复入口；项目级快照扫描未限定当前会话，能解释夹具记录进入候选的路径 | §8.3 |
| 双 Esc 是否真正回退、分支和刷新 | 合成探针确认持久叶节点切换、旧分支保留和界面对话数据更新；现场视觉问题仍未知 | §8.4 |
| 配色需要重新讨论 | 当前有主题系统与四套预设；视觉方向留待用户要求的深入讨论 | §4.2 |
| 面板及 slash 输出排版 | 有面板基础设施，但主题等命令仍主要输出文本，交互和信息密度不一致 | §4.3 |
| W7-33 auth/exit3 与四端点验收 | 沿用历史未完成状态；本轮未运行真实 provider 门禁 | §10.3 |

### 1.3 按影响排序的发现

优先级是研究中的影响排序，不是开发排期或变更授权。高置信度只覆盖列出的输入与路径。

| 优先级 | 发现 | 证据与置信度 |
|---|---|---|
| P1 | `write` 的非字符串内容会变为空字符串并到达写执行器，存在意外清空风险 | 实测内存 writer + 源码，高；未执行真实文件覆盖，§9.2 |
| P1 | `lsp hover` 可读取选定工作区外的路径 | 实测仓内隔离外部 fixture + 源码，高，§9.3 |
| P1 | `ask` 将未答项填成推荐项，并将无交互/取消路径返回为成功 | 实测 + 源码，高；不是已证明绕过文件审批，§9.4 |
| P2 | `grep .hidden` 实际搜索 `hidden`，有静默搜错目录的风险 | 实测 native rg + 源码，高，§9.5 |
| P2 | `web_fetch` 收到已经取消的 signal 仍发起请求 | mock fetch 实测 + 源码，高，§9.6 |
| P2 | `web_search` 自带期限被父 signal 替代；非 2xx 正文进入工具错误 | mock fetch 实测 + 源码，高，§9.7 |
| P2 | 错误类型的配置不诊断；`attentionOnIdle` 保存值未进入有效配置 | 隔离配置实测 + 源码，高，§5.2–5.3 |
| P2 | 裸 `/` 别名膨胀、前缀 Enter 状态和 resume 别名路由不一致 | 组件实测/源码，高，§2 |
| P2 | resume 重开继承选择位置 | 组件实测 + 源码，高，§8.1 |
| P2 | 审批状态和工具正文混合；流式片段与最终正文可重复 | 组件实测 + 源码，高，§4.1 |
| P2 | `/context` 的 schema 估算使用默认 15 工具，未绑定当前实际目录 | 源码，高，§7.3 |
| 产品方向缺口 | 深度研究、会话大小展示、主题及命令面板体验不符合本次用户目标 | 当前能力与用户要求的对照；不伪装为已实施，§4、§6、§8 |
| 待归因 | 粘贴视觉残影、启动相对旧版本是否回归、现场回退不刷新、5.4k 精确分项 | 未知；已有探针不足以判定现场根因 |

## 2. 输入框与 slash 命令

### 2.1 裸 `/` 将别名当作独立行展示

**实测，高置信度。** 当前注册表有 59 个主命令，`slashSuggestions('/')` 返回 117 项，其中 58 项标注 `alias of`。不是增加了 117 种独立能力。

[候选生成](../../packages/ts-shell/src/cli/interactive/slashSuggestions.ts#L12) 遍历 `[command.name, ...command.aliases]`，只按字符串去重，裸 `/` 与带前缀输入共用这批候选。[既有测试](../../packages/ts-shell/src/cli/interactive/slashSuggestions.test.ts#L10) 明确要求裸 `/` 的数量等于全部主名加别名，已经固化了用户不接受的展示规则。

[候选窗口](../../packages/ts-shell/src/presentation/tui/chrome/suggestions.ts#L30) 每次最多显示八行；总候选膨胀会增加查找和滚动负担。别名可用于匹配、解析和参数补全，与裸 `/` 必须把别名逐行列出是不同决策。

参考 Codex 的空过滤器会隐藏 alias，输入前缀时仍可匹配 alias（§10.1）。这满足“每类命令一个主入口，同时保留别名”的语义，不能用先前“支持 alias”的验收记录证明当前展示符合用户要求。

### 2.2 `/res` 默认高亮不代表 Enter 会接受候选

**源码与组件实测，高置信度。** [SuggestionList](../../packages/ts-shell/src/presentation/tui/chrome/suggestions.ts#L78) 默认 `selected=0`，但 `moved=false`；`chosen` 返回的是 `moved`。首项已经显示箭头、粗体和选择背景，只有导航或点击后才变成 `chosen=true`。

[键盘处理](../../packages/ts-shell/src/cli/interactive/keymap.ts#L372) 的 Tab 接受当前候选；Enter 仅在 `suggestions.chosen` 为真时接受，否则把原草稿提交。因此用户看到候选后直接按 Enter，仍会提交 `/res`。

补充实测：在当前基线，`/res` 的首项为 **`/reset`**，`chosen=false`。`/resume` 确实能匹配，但前缀评分还偏好较短标签，不能将问题简化成“Enter 应直接执行 resume”。**候选接受、候选排序、完整命令执行**是三个需要分别核对的行为。

[既有键位测试](../../packages/ts-shell/src/cli/interactive/keymap.test.ts#L281) 保护完整 `/help` 无需移动就能首次 Enter 执行；随后测试先导航再接受，未覆盖本次“输入前缀、未导航、首项已高亮”的用户情形。参考 pi、oh-my-pi 和 Codex 都有 Enter 接受候选的路径，但不能不区分完整命令与前缀就机械替换。

### 2.3 同一命令的 alias 可能绕开交互面板

**源码，高置信度。** `/resume` 的 alias 为 `/sessions`、`/session`。通用注册表会归一化 alias，但 [picker 路由](../../packages/ts-shell/src/cli/interactive/picker/registry.ts#L99) 按字面命令查表；交互入口先检查 picker，再进入通用命令路由。

所以裸 `/resume` 打开选择器，裸 `/sessions`、`/session` 会走 [resume shell action](../../packages/ts-shell/src/cli/interactive/interactiveCommandRouter.ts#L150)。继续追踪 [resume 行为](../../packages/ts-shell/src/core/shell/recovery.ts#L152) 可见，它会显示少量文字候选，并按显式目标、fallback、优先可恢复会话或 suggested recovery 选择目标。它**不只是返回一段无效说明**，也不等价于等待用户在同一个面板内选择。

这是 alias 解析与交互入口的契约差异。本轮没有拿真实用户会话执行这些别名。

### 2.4 单行粘贴残影：组件路径未复现，终端层仍未知

**用户报告成立为待复现场景；根因未知。** 当前链路为 [StdinBuffer](../../packages/ts-shell/src/presentation/tui/input/stdinBuffer.ts#L110) → 交互 paste 回调 → [PasteStore](../../packages/ts-shell/src/presentation/tui/pastes.ts#L50) → [Editor.insert](../../packages/ts-shell/src/presentation/tui/editor.ts#L147) → composer → [paint 光标定位](../../packages/ts-shell/src/presentation/tui/render/paint.ts#L62)。

只有至少 320 个字符或超过六行的粘贴才进入长粘贴占位路径。短 `Hello` 直接插入；编辑器用零宽 marker 标记光标，绘制前去掉 marker 并定位硬件光标，没有在这条路径发现明确的“复制前一字符”分支。

本轮以真实组件分别输入逐字 `Hello`、完整 bracketed paste、跨 chunk bracketed paste，再左移三次，三者均得到：

```json
{"text":"Hello","editorRows":["He|llo"],"cursor":{"row":0,"column":5},"painted":["╰─ Hello"]}
```

这证明这些受测路径没有重复插入文本。PTY 原始输出中出现 `Hello`，未捕获 `Heello`；**字节搜索不能证明 Windows 终端的屏幕没有残影**。本轮没有用户同款终端前端下的逐帧画面、光标样式或字体对照证据。

参考 pi 的编辑器通过替换下一字素呈现软件光标，Cheers 使用硬件光标；二者绘制方式不同，不能由参考代码推定本仓根因。后续区分性验证应在同一前端记录：输入字节、editor 文本、光标目标与真实屏幕，分别比较普通输入、完整/分片 bracketed paste、regular/fullscreen。当前不将其归因于 provider、长粘贴阈值或用户操作。

## 3. `npm start` 启动耗时与计时盲区

### 3.1 实际启动链

根 [package.json](../../package.json#L29) 的 `start` 是 `npm run start -w packages/ts-shell --`，工作区 [package.json](../../packages/ts-shell/package.json#L14) 再运行 `tsx src/entrypoints/cli.tsx`。用户走的是两层 npm 加 tsx 源码加载路径。

本轮没有修改启动脚本，也没有构建单文件可执行程序。已有编译 Node 入口的测量只能作为辅助观察，不能代替用户启动方式或证明某个产物与当前源码完全一致。

### 3.2 本轮隔离 PTY 测量

主机为 WSL2，内核 `6.6.87.2-microsoft-standard-WSL2`，Node `v24.15.0`。每次使用独立 HOME/USERPROFILE 和 fixture project，设置 `CHEERS_OFFLINE=1`、`CHEERS_PROVIDER_MODE=synthetic`、`CHEERS_TIMING=1`、`GIT_CEILING_DIRECTORIES`；项目指令预算为 0，并传 `--no-skills`。没有发送自然语言模型请求。

从仓库执行 `npm start -- --project <fixture> --no-skills`，以真实 `╰─` 输入框首次出现为计时终点，再发送 `/timings`、`/exit`：

| 顺序 | TUI 模式 | tsx 临时缓存 | 进程启动至输入框 | `/timings total` | 退出 |
|---|---|---|---:|---:|---|
| 1 | regular | 新目录 | 5,378.77 ms | 768 ms | 0 |
| 2 | fullscreen | 复用 | 2,644.99 ms | 56 ms | 0 |
| 3 | regular | 复用 | 2,482.54 ms | 52 ms | 0 |

这里的“新缓存”仅指本轮 tsx 临时目录，不表示清空 OS 页面缓存或严格冷启动。三次不是统计基准，模式和运行顺序也没有随机化。隔离项目排除了真实项目指令、技能和个人配置成本，不能精确代表用户的完整现场。

辅助观察：先前以已有 `dist/cli.js` 运行同类隔离命令，三次输入框耗时为 1,879.90 / 829.69 / 687.53 ms，内部 total 为 278 / 39 / 35 ms，均 exit 0。该产物未在本轮重建，也没有同条件旧提交对照，不能据此宣称 Phase 18 已发生或已消除某个倍数的性能回归。

### 3.3 可以定位到什么程度

**高置信度：当前 `/timings` 不是用户感知启动时长。** [startupTiming](../../packages/ts-shell/src/observability/startupTiming.ts#L14) 从该模块加载时开始，报告到已有的最后一个 mark；[启动流程](../../packages/ts-shell/src/cli/bootstrap/cliProcessRunner.ts#L140) 的最后标记是 startup surface rendered，不等于随后交互 TUI 已可输入。两层 npm、tsx 以及更早的静态依赖加载成本没有被完整涵盖。

**有支持但未完成归因：** 新 tsx 缓存时更慢，源码启动链及计时边界是优先调查对象。现有样本不能把数秒差值精确分配给 npm、转译、依赖求值、文件系统或 TUI 初始化。

**没有证据：** 不能因入口存在后台更新检查就断言它导致本次慢启动；该检查是非等待调用，且本轮 offline。也没有历史版本的同环境测量来回答“为什么比之前慢”。后续只需在同命令、同项目、同缓存条件下补入口前后边界和旧提交对照，无须先改构建路径。

## 4. 工具输出、主题与面板

### 4.1 审批状态进入工具正文，且可能重复

**组件实测与源码，高置信度。** [turn 工具 hooks](../../packages/ts-shell/src/turn/tools.ts#L153) 在成功结果前拼接 `[User approved write operation (allow-once)]`；审批请求/结果还另发事件，经 [turnSink](../../packages/ts-shell/src/cli/interactive/turnSink.ts#L218) 转成 note，[ToolCards](../../packages/ts-shell/src/cli/interactive/toolCards.ts#L41) 把 note 追加到工具正文，完成时再追加最终结果。

用内存结果和合成审批事件观察到：

```text
工具卡正文：
awaiting approval
approval approved
[User approved write operation (allow-once)]
wrote example

模型收到的工具内容：
[User approved write operation (allow-once)]
wrote example
```

[agent 工具结果处理](../../packages/ts-shell/src/core/agent/tools.ts#L298) 会接纳 hooks 改写的内容并形成 `role=tool` 消息，所以这不仅是视觉噪声，还会占用后续模型上下文。现有 `turn/tools.test.ts` 特别断言批准前缀；turnSink 测试也保护 awaiting 文本。

另一个组件级复现：先 `ToolCards.append("line one")`，再以相同最终输出 finish，卡片正文变为 `line one\nline one`。这证明片段/最终结果的组合可重复，不等于已经证明所有实际工具回合都会重复。

参考 Codex 也保留审批历史，但使用独立审批 cell；命令输出保存在执行 cell 模型中。pi 也分开工具调用与结果渲染、更新结果并支持折叠。问题是**状态、审计和业务输出缺少清晰边界**，不能误写成“参考项目从不显示审批”，也不能为了减少文字丢弃拒绝原因、用户反馈或未确认写入状态。

### 4.2 配色已有实现，但未满足本次审美诉求

**源码。** [主题发现](../../packages/ts-shell/src/presentation/themes/index.ts#L17) 已有 `dark`、`light`、`dark-contrast`、`light-contrast` 四套预设，并支持用户/项目 `.agents/themes` 及显式路径。不能把现状描述为“没有主题系统”。

[预设测试](../../packages/ts-shell/src/presentation/themes/presets.test.ts#L10) 检查 token 完整性；其中对比度断言只覆盖 contrast 两套指定的配色组合，不构成全部主题、字体、终端与组件的视觉验收。

[`/theme`](../../packages/ts-shell/src/core/commands/themeCommandRuntime.ts#L24) 当前以 Markdown 列表介绍主题并接受名称参数，没有当前 TUI 内的实时预览选择器。Codex 的主题选择器提供搜索、预览、取消恢复和宽窄布局，但它主要处理语法高亮主题，不能当成整套 UI 配色方案直接照搬。

“太丑”是明确的用户体验反馈；本轮记录已有调色能力、选择方式和验证边界，按用户要求将颜色参数与视觉方向留待深入讨论，没有擅自选色或改主题。

### 4.3 面板能力存在，命令交互形态不一致

[panel renderer](../../packages/ts-shell/src/presentation/tui/chrome/panel.ts#L30) 已处理标题、过滤、计数、可视窗口、列对齐和 footer；[picker 注册表](../../packages/ts-shell/src/cli/interactive/picker/registry.ts#L62) 有十四类入口。不能概括为“完全没有排版”。

实际差距包括：没有 theme picker；多种命令及带参数分支走通用文本路由；[本地输出桥](../../packages/ts-shell/src/entrypoints/cliCommandExecutionBridge.ts#L156) 交给 [StreamingRenderer](../../packages/ts-shell/src/presentation/terminal/streaming.ts#L37)；`/undo` 等结果向普通用户暴露 ledger/authority 等机制字段。功能相近的主名与 alias 还可能使用不同呈现方式（§2.3）。

参考比较应围绕可选择项、焦点、宽度、状态密度、渐进展开和取消后的恢复，而不是把其他项目的全部 UI 或架构搬过来。本轮没有审美验收截图，也没有把“存在 renderer”升级成“用户体验已达标”。

## 5. 高级配置：已有基础、诊断和接线有缺口

### 5.1 当前实际配置契约

[配置路径](../../packages/ts-shell/src/config/runtimeConfig.ts#L615) 包括用户 `.cheers/config.json`（兼容旧目录）和项目 `.cheers.json`。[配置字段](../../packages/ts-shell/src/config/runtimeConfig.ts#L362) 已有采样参数、context window/reserve/model budgets、指令字节预算、工具允许/禁用列表、retry/timeout、队列模式、theme/tui/offline 等，并非只能从环境变量配置。

普通字段的合并是 defaults → project → user，再由各自的环境变量或显式覆盖项处理；**不是普遍的项目覆盖用户**。普通嵌套对象主要为浅覆盖，providerCredentials 有专门合并逻辑。独立的 [TUI settings reader](../../packages/ts-shell/src/cli/interactive/tuiSettings.ts#L25) 对 statusItems/diagrams 等采用项目优先，不能宣传成所有字段共用一种优先级。

文件使用 `JSON.parse`，不是 JSONC、TOML 或 YAML。TypeScript interface 只描述编译期形状；当前没有通用运行时 schema 校验和未知字段诊断。[`/settings` 面板](../../packages/ts-shell/src/cli/interactive/picker/settings.ts) 目前主要提供 attentionOnIdle/offline 两项，远小于文件里的参数集合。

### 5.2 错误配置可以原样进入有效配置

**隔离实测，高置信度。** project 设置 `maxTurns: 9`，user 设置 `maxTurns: "many"`、`retryEnabled: "false"`、`temperature: 999`、`tui.keybindings: {}` 并带未知字段。读取结果为：

- 错误类型和超范围数值原样出现在对应有效字段；`configDiagnostics=[]`。
- user 的 tui 对象覆盖 project 的对应对象，未获得通用深合并。
- 未知字段没有进入最终投影，也没有诊断。

本轮没有将这些值送给模型，因此不声称已经观测到某个 provider 的具体报错。已证明的是配置加载层不能将这些错误在生效前准确报告；把配置文件做得更丰富之前，现有契约就有可用性与正确性缺口。

### 5.3 `attentionOnIdle` 界面保存与运行时读取不连通

**隔离实测与源码，高置信度。** RuntimeConfig interface 声明该字段，交互运行时在 [提醒分支](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts#L674) 读取它；设置面板通过原始用户配置读写，可显示为已开启。但 RuntimeConfigFile、默认值以及 `getRuntimeConfig` 的返回投影没有传递该值。

fixture 中 user 配置为 `{"attentionOnIdle":true}`：原始配置读到 `true`，有效配置读到 `undefined`，诊断仍为空。故“开关已保存”不构成“重启或 reload 后提醒已生效”的证据。本轮未修复接线。

### 5.4 参考配置的具体差异

Codex 使用带类型/schema 的 TOML 配置及 profiles，包含上下文、推理等高级参数；不能仅因源码含 `schemars(deny_unknown_fields)` 就推定所有运行时 serde 路径都会拒绝未知键。oh-my-pi 使用 YAML 和注册设置，提供默认值、说明、配置来源，并明确 runtime → overlay → project → global → default 的取值顺序。

对 Cheers 有用的比较维度是：字段有哪些真实消费者、输入何时被校验、覆盖结果从何而来、错误能否定位、哪些字段能在界面修改，以及保存值是否进入运行时。文件格式或参数数量本身不能证明成熟度。相关参考路径见 §10.1。

## 6. deep-research 的当前能力与方向偏差

**源码与历史，高置信度。** 当前主命令是 `/web-research`，旧研究名称作为 alias 保留；[命令入口](../../packages/ts-shell/src/core/commands/deepResearchCommandRuntime.ts#L6) 不启动模型研究回合。[collector](../../packages/ts-shell/src/core/research/collector.ts#L31) 使用两个固定查询，每个取三个结果，URL 去重，并发抓取上限二，每页最多五条摘录。

这是一条有界网页资料收集路径。当前没有模型生成后续研究问题、迭代调查、综合论证、事实核验或生成研究综述的等价链路。

提交 `89c1dd18` 删除旧 deepResearcher/claimVoter/reportGenerator，新增 collector。[原登记册](13-feature-and-defect-register.md#L3113) 曾列“接模型改进”或“改名去伪”两条方向；[Phase 18 裁决](phase-18-decisions.md#L2139) 记录选择改名分支；[当前专题文档](../wiki/theses/deep-research-command-architecture.md) 也已按资料收集能力描述。

这些材料说明改动的来源，不构成用户对本次方向的追认。用户现在明确要求改进深度研究能力，而非把目标收缩为网页收集。**去掉未实现机制的宣称是已完成的诚实化工作；用户期待的深度研究仍是能力和方向缺口。** 同样不能反向声称被删除的旧实现已经有可靠的多代理研究能力。本轮只登记差异，没有重新设计或实现研究引擎。

## 7. 首次“你好”后的约 5.4k 从何而来

### 7.1 状态栏数值与本地估算不是同一口径

[状态栏投影](../../packages/ts-shell/src/cli/interactive/sessionFacts.ts#L78) 在 `usage.lastPromptTokens > 0` 时显示上下文值；[usageTelemetry](../../packages/ts-shell/src/observability/usageTelemetry.ts#L139) 用 promptTokens、cacheReadTokens、cacheWriteTokens 更新 lastPrompt。应结合 provider 归一化后的用量字段理解，不能把状态栏当作启动时对文件大小的直接计算，也不能未经核对宣称缓存一定被重复计数。

用户澄清时点为第一条消息后，与请求完成后有用量数据的路径一致。此前测得的 **3,063 只是默认工具 schema 的字符估算**，从来不是整个首轮输入总量。

### 7.2 本地安全组装探针

使用当前 Cheers 项目根、空隔离 HOME、真实 prompt 组装组件；未发请求、未读取个人 provider 配置。源码入口为 [buildPromptContext](../../packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts#L297)、[system prompt 组装](../../packages/ts-shell/src/turn/prompt.ts#L75)、[项目指令发现](../../packages/ts-shell/src/context/instructions/projectInstructions.ts#L96)。

| 部分 | 字符数 | UTF-8 字节 | 按 chars/3.5 粗估 token |
|---|---:|---:|---:|
| 根 AGENTS 原文 | 10,256 | 10,287 | 2,930 |
| 包装后的项目 instructions | 10,359 | 10,390 | 2,960 |
| 基础 system prompt | 1,309 | 1,309 | 374 |
| 完整 system（已含 instructions） | 11,669 | 11,700 | 3,334 |
| 默认 15 工具 schema JSON | 10,721 | 10,725 | 3,063 |
| “你好” | 2 | 6 | 1 |

可相加的是**完整 system + 工具 schema + 用户消息**，当时按各分项取整求和约 **6,398**；若先合计 22,391 字符再除以 3.5 四舍五入，则约 **6,397**。不要再把 AGENTS 和 instructions 行重复加进去。这个估算不是模型 tokenizer 测量，也没有包括全部 wire framing。

该 fixture 没有 APPEND 指令，当前 Cheers `.agents` 技能发现为 0，指令没有被截断。Codex 宿主列出的 `.codex/skills` 不能直接算作 Cheers 会向模型发送的技能池；Cheers 的技能列表通常发送描述和路径索引，而不是所有 SKILL.md 全文。

根 AGENTS 中的普通 Markdown 链接不会把所有 `agent-rules` 文档递归展开。[导入展开](../../packages/ts-shell/src/context/instructions/importExpansion.ts) 还限制项目边界，宿主提供的外部 RTK 规则不能未经核对就计为 Cheers 的模型输入。真实 HOME 下额外指令、实际技能/MCP 目录和真实请求参数不在本探针覆盖内。

**结论：本地内容本来就能构成数千 token。** AGENTS 是其中显著的一部分，工具 schema 也是另一大部分。5.4k 与字符估算的差别不能证明上游加提示词，也不能证明上游没有加；需要实际 provider/model/tokenizer 与可安全审计的出站输入证据才能继续分解。

### 7.3 `/context` 仍有目录口径缺口

[`/context`](../../packages/ts-shell/src/core/commands/contextCommandRuntime.ts#L52) 自己调用 `createCoreToolRegistry()`，按默认 15 工具估算 schema，未使用当前过滤后的工具名单及 skill/MCP 扩展目录。W8-42 已统一 `/tools` 与模型发送目录，不能据此推定 `/context` 也共用了目录。

因此 `/context` 关于 schema 数量、体积和“每次发送”的说明可能与真实请求不一致。这是可直接定位的观测缺口；不需要以真实上游注入作为解释。用户本次看到的是状态栏数值，不能将 `/context` 的这个问题直接当作 5.4k 的根因。

## 8. resume、undo 与对话回退

### 8.1 resume 选择位置保留已复现

[OverlayHost](../../packages/ts-shell/src/cli/interactive/overlay.ts#L84) 持有同一个 OptionModel。open 只设置 filter/options，有 initialSelection 时才主动 focus；close 不销毁模型。[OptionModel.applyFilter](../../packages/ts-shell/src/presentation/tui/chrome/options.ts#L120) 只把旧 cursor 限制到合法范围，没有归零。[session picker](../../packages/ts-shell/src/cli/interactive/picker/session.ts#L26) 不提供 initialSelection。

组件探针加载 `a/b/c` 三项，移动到 `c`、关闭，再用新的 resume picker 实例打开，直接 Enter，实际接受 `c`，而非首项 `a`，exit 0。由于模型共享，位置还可能来自其他 picker，具体取决于过滤后的条目数；不能只看“当前是否重建了 picker 对象”。

### 8.2 当前 turn 并非严格对话轮数，大小需求未实现

[session detail](../../packages/ts-shell/src/cli/interactive/picker/session.ts#L82) 显示 `session.turns.length`，即消息数组长度，不严格等于用户问答回合数。SessionLike 没有落盘 byte size 字段。

用户要改成 session 文件大小，本轮按需求登记。当前 [存储布局](../../packages/ts-shell/src/session/store/sessionFileLayout.ts) 涉及 transcript、metadata、state 等文件，后续需明确显示 transcript 字节数，还是整个会话目录占用，以及附件/artifact 是否计入。用内存对象 `JSON.stringify` 的大小替代落盘统计会改变含义；本轮没有代用户裁决或实现。

### 8.3 `/undo` 当前是说明入口，不执行回滚

[`undoCommandRuntime`](../../packages/ts-shell/src/core/commands/undoCommandRuntime.ts#L26) 找到最近编辑后输出时间、文件以及 `/restore execute --ledger-root … --authority … --all --execute`，自身没有执行文件恢复。“Most recent edit”是在描述快照记录，不表示已经撤销。

其 [latestEdit](../../packages/ts-shell/src/core/commands/undoCommandRuntime.ts#L88) 扫描项目默认 ledger 下各 authority，按记录 createdAt 比较，没有限定当前 session/turn，也没有排除测试路径。因此用户所见 `.tmp/tools-catalog-check/.../written.txt` 有一条明确的进入候选的源码路径：共享项目 ledger 的测试编辑也可能成为“最近一次”。

本轮没有读取用户实际快照记录，不能断言该条快照的来源、内容或是否仍可恢复；也没有执行 `/restore`。现有长输出把内部 authority、ledger 与写操作参数直接交给用户，解释成本很高。它与双 Esc 的会话导航必须分别评估，不能将不易理解的输出记为“已回滚文件”。

### 8.4 双 Esc 背后的分支导航确实实现了

源码链为 [rewind picker](../../packages/ts-shell/src/cli/interactive/picker/rewind.ts#L41) → host.rewind → [navigateSession](../../packages/ts-shell/src/cli/runtime/navigation.ts#L16) → [SessionManager.revertTo](../../packages/ts-shell/src/session/SessionManager.ts#L159)。它检查 busy/父链完整性，写 active leaf 后再次读取确认，更新运行时 session，清除旧上下文测量并回放 todo。

它保留旧分支，追加 branch summary；摘要失败不应抹去导航事实。选中的 user 消息本身保留，并回填到输入框；只提供有稳定 ID 的用户消息，最多最近 25 个。[交互回调](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts#L769) 在 changed 后调用 [showConversation](../../packages/ts-shell/src/cli/interactive/history.ts#L128) 并请求重新绘制；showConversation 会 clear 当前 transcript，再按活动会话重建。

**本轮合成持久会话探针，exit 0：** 建立两组问答，用 stub 摘要器回退到第一条 user entry，然后重新实例化 SessionManager 读取落盘内容，并调用真实 showConversation。

| 观察项 | 结果 |
|---|---|
| changed / draft | `true` / `First question` |
| 落盘 active leaf | 等于第一条 user entry ID |
| 新实例读回的用户消息 | 仅 `First question` |
| 旧 transcript 与分支摘要 | 原记录保留，新增 branch_summary |
| 回退前的界面对话数据 | 含 `Second answer` |
| 回退后的界面对话数据 | 不再含 `Second answer`，仍含 `First question` |
| 再导航到旧末尾 | 成功，界面对话数据重新包含 `Second answer` |

这比只读测试更直接地证明了分支切换、重载和界面对话数据的更新。**它没有验证用户终端里的双 Esc 按键到最终像素的完整链路**，也没有操作用户真实会话。用户现场“不像回退了”的原因仍未知，不能归结成“底层是假实现”，也不能因这次探针通过就否定现场问题。

后续可在同一个现场同时记录所选 entry ID、active leaf、draft、showConversation 后的块列表和终端画面，区分选择项/语义误解、输入事件未触发及最终绘制问题。回退对话不等于撤销文件，也不删除其他分支。

## 9. 默认 15 工具的能力与风险

### 9.1 能力矩阵

下表是当前代码、既有断言与本轮定点探针的有界审计。**没有逐项负载、跨平台或真实服务验收，不能给全部工具贴“企业级完成”标签，也没有证据证明与 pi、oh-my-pi、Codex 全面等同。** 工具同名并不意味着输入、输出、取消、隔离与恢复语义相同。

| 工具 | 当前实现 | 已知边界或缺口 | 证据入口 |
|---|---|---|---|
| read | 单路径，offset/limit、selector、目录一层、BOM、输出截断和 artifact | 默认 500/最多 1,000 行；输出约 50 KiB/1,500 行上限不代表内存读取上限，先读整文件再分页；图片只给说明，未返回视觉附件 | [registry](../../packages/ts-shell/src/core/tools/registry.ts#L295)；readFreshness/readImprovements/readImage/conditionalWrite 既有测试 |
| write | 单路径全量写，走执行服务、路径限制、锁与快照 | 非字符串 content 被转为空串；无要求调用方提交旧文本的 CAS 输入契约 | [registry](../../packages/ts-shell/src/core/tools/registry.ts#L433)；§9.2 实测 |
| edit | 单路径 oldText/newText、edits[] 多段、整内容等模式；互斥参数、BOM/CRLF、expectedContent | edits[] 仍限同一文件；快照前后精确原文检查及进程内锁不构成跨进程/跨文件事务 | [registry](../../packages/ts-shell/src/core/tools/registry.ts#L496)、[execution service](../../packages/ts-shell/src/runtime/execution/service.ts#L74)；§9.9 |
| glob | 递归列出文件后匹配，默认 500/最多 1,000 项及输出字节限制 | 当前不是直接运行 rg；返回上限不等于遍历提前停止或总内存上限 | [glob](../../packages/ts-shell/src/core/tools/glob.ts) |
| grep | native rg 异步流式搜索；仅 rg 未安装时走进程内 fallback；取消、超时及最多 500 项 | `.hidden` 路径可被改成 `hidden` | [grep](../../packages/ts-shell/src/core/tools/grep.ts)；§9.5 实测 |
| lsp | TS/JS 符号名称搜索及 hover 签名提取 | 是名称扫描器，不是完整 LSP；hover 绕开统一读取边界，无跨语言语义/诊断/重命名等价保证 | [lsp](../../packages/ts-shell/src/core/tools/lsp.ts)；§9.3 实测 |
| bash | ShellManager、sandbox 与统一 execution service，流式输出、后台句柄、超时 | 默认 60 秒，可配置；截断输出和 artifact 不等于无限保留；进程树终止有逃逸子孙/父进程被强杀等边界 | [registry](../../packages/ts-shell/src/core/tools/registry.ts#L682)、Phase 18 第 18/39 项历史证据 |
| web_search | 根据配置选择 Exa、Tavily，否则 DDG | 非失败后自动 failover；期限被父 signal 替代，错误正文直出；DDG HTML 正则及读取体积边界需继续核对 | [webSearch](../../packages/ts-shell/src/core/tools/webSearch.ts)；§9.7 |
| web_fetch | 有界文本抓取、重定向检查、正文/输出限制和超时 | 已取消信号仍可发请求；host guard 不检查 DNS 最终连接地址 | [webFetch](../../packages/ts-shell/src/core/tools/webFetch.ts)；§9.6 |
| browser | 真实 Playwright session；open/observe/click/type/select/hover/press/close 八动作；关闭失败保留失败事实 | 核心工具面无截图、标签页、上传/下载等全面等价能力；execute 收到的 abortSignal 未传给具体动作 | [browserToolUnified](../../packages/ts-shell/src/core/tools/browserToolUnified.ts#L17)；browser/sessionManager/receipt 既有测试 |
| todo | add/start/done/clear/list；按 session 绑定，结果 metadata 支持持久态回放 | 勾选完成只是任务记录，不证明外部工作或验证已完成 | [todoTool](../../packages/ts-shell/src/core/tools/todoTool.ts) 与 todo 持久化链 |
| task | 等待子代理返回，可选 worktree；父/定义/请求权限取交集，限制递归，保留部分结果和清理状态 | 无 runner 或隔离失败明确失败；不是 taskOutput 可查询的后台命令句柄；本轮未做真实模型委派验收 | [taskTool](../../packages/ts-shell/src/core/tools/taskTool.ts)、[taskWorkspace 测试](../../packages/ts-shell/src/core/tools/taskWorkspace.test.ts) |
| ask | 结构化问题、建议选项和交互 callback | 未答项与取消路径可被升级为默认推荐选择/成功 | [ask](../../packages/ts-shell/src/core/tools/ask.ts)；§9.4 实测 |
| taskOutput | 查询本进程后台命令的输出和状态，含输出 spill | 不是 task 子代理结果通道；运行项加最近 100 个完成项，不承诺进程重启后句柄恢复 | [registry](../../packages/ts-shell/src/core/tools/registry.ts#L848) |
| taskStop | 请求终止后台命令，返回需继续查看 taskOutput 的状态 | “Stop requested”不是已确认退出；继承进程组/树终止的边界 | [registry](../../packages/ts-shell/src/core/tools/registry.ts#L888) |

read 的旧缓存已经退役，不应把历史的陈旧 readCache 问题当成当前实现；本轮没有反向改代码来运行撤销验证，既有反转记录仍只按历史证据使用。

### 9.2 `write`：错误参数可以成为空内容写入请求

**实测，高置信度。** 实际组合 adaptTools、prepareToolCall 和工具 hooks，在 accept-edits 模式下输入：

```json
{"path":"never-written.txt","content":7}
```

内存 writer 收到 `content:""`、`expectedContent:null`，工具结果 `isError:false`，并产生删除合成 `KEEP` 文本的 diff。fixture 工作区实际文件列表仍为空，**没有把真实文件清空**。

原因在 [write 入口](../../packages/ts-shell/src/core/tools/registry.ts#L433)：content 不是 string 时取空串。[工具 hooks 参数检查](../../packages/ts-shell/src/turn/tools.ts#L100) 只确认 args 是对象；[prepareToolCall](../../packages/ts-shell/src/core/agent/tools.ts#L169) 没有补上通用 JSON Schema 字段验证。因此“schema 声明 content 为 string”不能证明运行时会拒绝错误字段。

已证明的缺陷是错误参数可到达具有破坏含义的写入请求，不是审批绕过，也不是本轮发生了用户数据丢失。pi 的 agent loop 在执行工具前调用参数 schema 验证，值得对照的是运行时拒绝点而非只补 TypeScript 类型。

### 9.3 `lsp hover`：路径读取越过选定工作区

**隔离实测，高置信度。** 在仓内临时目录建立 `workspace/` 和同级 `outside.ts`，后者仅含 `export class OutsideProbe {}`。经真实工具适配和 ask 权限路径调用 `hover`，传入 `../outside.ts`，返回该符号信息且 `isError:false`。

[hover](../../packages/ts-shell/src/core/tools/lsp.ts#L158) 直接 `existsSync/readFileSync`，支持绝对路径和父级路径，未走本工具其他读取分支使用的 execution service。当前 [tool policy](../../packages/ts-shell/src/core/query/toolPolicy.ts#L81) 把 lsp 归为只读，目标提取没有使用 filePath，不能挡住这个路径。

所有数据都在本轮仓内 fixture 中，没有读取秘密或真实工作区外文件。该结果说明“只读”不等于“读取范围受工作区限制”；也不能因此把整个 lsp 描述成真实语言服务器。位置语义、引用、跨语言诊断和重命名能力应按各自实现核对。

### 9.4 `ask`：未回答、取消与明确选择被混淆

**内存实测，高置信度。** [ask 实现](../../packages/ts-shell/src/core/tools/ask.ts#L71) 在交互答案缺某一项时用 recommended.label 填补，并写入 `User Decision`；无 callback 或 callback 抛错时，返回 `success:true`，内容为：

```text
Autonomous execution mode - selected default recommended choices to prevent blocking.
```

三个输入路径均已观察：无 callback、合成 cancellation、只回答第一项而留下另一项未答。最后一种将未答项的推荐值报告为用户决定。既有 ask 测试也包含对默认选择行为的断言。

这暴露的是决定来源与完成状态真实性问题。推荐值可作为建议，不等于用户已经选择；取消不能无条件被解释为成功回答。没有证据证明这条工具路径直接绕过独立文件写审批，文档不作这种升级指控。

### 9.5 `grep`：合法点目录被改写

**真实 rg、小 fixture 实测，高置信度。** 创建 `.hidden/a.txt` 含 `needle INTENDED_HIDDEN`，以及 `hidden/a.txt` 含 `needle WRONG_VISIBLE`，调用：

```json
{"pattern":"needle","path":".hidden"}
```

结果为 `success:true`，输出 `hidden/a.txt:1: needle WRONG_VISIBLE`。[路径归一化](../../packages/ts-shell/src/core/tools/grep.ts#L69) 的 `replace(/^[./\\]+/, "")` 抹掉合法开头点；[glob](../../packages/ts-shell/src/core/tools/glob.ts#L55) 已使用更窄的处理，不能把两个工具的路径语义当作一致。

这里不只是没搜索到内容，而是成功返回错误范围的结果。现有 native rg 性能或取消验收不能覆盖该输入语义缺陷。

### 9.6 `web_fetch`：预先取消信号未阻止请求

**mock fetch 实测，高置信度。** 输入 `abortSignal: AbortSignal.abort()`，观察到 fetch 被调用一次，收到的新 signal 的 `aborted=false`，工具返回成功。没有产生真实网络流量。

[实现](../../packages/ts-shell/src/core/tools/webFetch.ts#L270) 建立新 AbortController 并订阅父 signal 的后续 abort 事件，但没有先处理父 signal 已经 aborted 的状态。已验证的是预先取消情形，不是所有运行中取消都失效。

已有边界仍应保留描述：默认 20 秒、最大 60 秒、正文约 5 MiB、文本输出约 10k 字符、最多五跳且逐跳检查 host。[egressGuard](../../packages/ts-shell/src/core/security/egressGuard.ts#L47) 明确仅检查 hostname，不解析 DNS 或最终连接地址，因此不能宣称完整 SSRF 防护；本轮没有做 DNS 攻击实验。

### 9.7 `web_search`：期限组合与错误正文风险

**mock fetch 实测与源码，高置信度。** [webSearch](../../packages/ts-shell/src/core/tools/webSearch.ts#L78) 使用 `signal ?? AbortSignal.timeout(...)`。当主回合提供 signal 时，函数自身的 15/20 秒期限被替代，而不是与父取消信号组合；最终时限取决于调用方和底层，不应夸大为任何情形都无限等待。

给 mock fetch 传入合成父 signal、虚构 Exa 配置和 429 正文 `SYNTHETIC_BODY_SENTINEL`，实测一次 fetch、传入的正是父 signal，返回错误中含正文 marker。Exa/Tavily 非 2xx 分支读取 response.text 并拼进错误，最后进入工具输出，缺少安全报告投影。**没有调用真实搜索服务，也没有输出真实 key 或 response body。**

源码还显示 Exa → 否则 Tavily → 否则 DDG 是按配置选实现，不是某个已配置 provider 失败后的自动 failover；DDG 使用 HTML 正则提取，搜索响应读取没有 web_fetch 相同的正文上限。这些是已识别边界，本轮没有以负载实验测量内存、网页改版可靠性或全部失败组合。

### 9.8 其余成熟度差距如何解释

当前 read 不返回视觉附件，而 pi read 会生成图片内容；当前 lsp 的符号扫描不能等价于 oh-my-pi 的语言服务器客户端及诊断管线；browser 的八动作不是完整浏览器自动化工具面。这些是可具体比较的能力差异，不能被“工具数量相同”掩盖。

bash/task/会话写入等已有隔离、取消、持久化和失败诚实性修复，相关断言并非空白。本轮也不能反向把有边界的实现统称为 mock。结论应逐项落到真实行为、保证范围与缺失证据，尤其要保留“请求停止”“部分结果”“清理失败”等状态。

### 9.9 多文件编辑：可以多个调用，缺单调用批量契约

**源码，高置信度。** 一个 `edit` 的 `path` 只指向一个文件，`edits[]` 是该文件内的多段编辑。[executeToolBatch](../../packages/ts-shell/src/core/agent/tools.ts#L210) 可以执行同一模型回合中的多个工具调用，默认批量并行仍受工具 executionMode 约束。因此修改多个文件不必通过 bash，可以发多个 edit。

当前没有单个多文件 patch 的核心工具输入，也没有跨文件 all-or-nothing 事务。工具说明已明确后面文件失败时，前面文件可能已提交；进程内文件锁及 expectedContent 比较不能自动提供跨文件原子性。

参考 Codex apply_patch 支持多个文件 hunks，但 [ApplyPatchFailure](../../../codex/codex-rs/apply-patch/src/lib.rs#L311) 和错误返回保留已经提交的 changes/delta，不能宣称其天然提供全文件事务。pi 的 edit 仍是单 path + edits[]；oh-my-pi 的 edit 有多种编辑模式、batch 参数和 LSP write-through。应分别比较单调用范围、冲突检测、部分提交反馈和恢复方式。

## 10. 参考、验证记录与未关闭问题

### 10.1 只读参考基线与具体决策

本轮先检查 Cheers，再对照下列本地参考的具体实现，没有修改参考仓，也没有以同名工具或历史宣传替代行为比较。

| 参考仓 | 本轮 HEAD | 具体阅读入口与用途 |
|---|---|---|
| pi | `200387122ca450d6387f033949423114a270b96c` | [editor](../../../pi/packages/tui/src/components/editor.ts#L576)：软件光标及 Enter 候选路径；[tool-execution](../../../pi/packages/coding-agent/src/modes/interactive/components/tool-execution.ts#L100)：调用/结果渲染；[read](../../../pi/packages/coding-agent/src/core/tools/read.ts#L76)：图片附件；[validation](../../../pi/packages/ai/src/utils/validation.ts#L317) 与 [agent-loop](../../../pi/packages/agent/src/agent-loop.ts#L726)：执行前参数校验；[edit](../../../pi/packages/coding-agent/src/core/tools/edit.ts#L21)：单文件语义 |
| oh-my-pi | `6d8552d7f9df1852826923f07f0eed4fe29511f3` | [editor](../../../oh-my-pi/packages/tui/src/components/editor.ts#L1932)：候选 Enter；[settings](../../../oh-my-pi/packages/coding-agent/src/config/settings.ts#L850)：覆盖层与来源；[tool settings](../../../oh-my-pi/packages/coding-agent/src/tools/settings.ts)：工具参数登记；[edit](../../../oh-my-pi/packages/coding-agent/src/edit/index.ts#L243)：编辑模式与批量入口；[LSP client](../../../oh-my-pi/packages/coding-agent/src/lsp/client.ts)：实际语言服务边界 |
| Codex | `4210c08defe92fe8828f789b6f9fda287ad3709e` | [command_popup](../../../codex/codex-rs/tui/src/bottom_pane/command_popup.rs#L145)：空查询隐藏 alias；[slash_input](../../../codex/codex-rs/tui/src/bottom_pane/chat_composer/slash_input.rs#L341)：Enter 候选；[approvals](../../../codex/codex-rs/tui/src/history_cell/approvals.rs#L45)：独立审批 cell；[exec model](../../../codex/codex-rs/tui/src/exec_cell/model.rs)：输出归属；[theme_picker](../../../codex/codex-rs/tui/src/theme_picker.rs#L312)：预览/取消；[config_toml](../../../codex/codex-rs/config/src/config_toml.rs#L153)：类型/schema/profiles；[apply-patch](../../../codex/codex-rs/apply-patch/src/lib.rs#L311)：多文件及部分提交反馈 |

### 10.2 本轮实际验证记录

临时探针均使用 `.tmp/feat14-*` 下由本轮创建的目录并在结束后清理；内存 writer、mock fetch、stub summarizer 不代表真实工具写入、真实网络或真实模型验收。下表记录运行结果，不把“成功复现缺陷”叫作“功能验证通过”。

| 编号 | 探针及输入 | 观察结果 | 退出/证据边界 |
|---|---|---|---|
| V01 | 真实输入组件，逐字/完整 paste/分片 paste 的 Hello 后左移三次 | 三者 editor 文本与绘制文本相同，无重复字符 | exit 0；无 Windows 前端视觉证明 |
| V02 | createToolHooks + 审批事件 + ToolCards，合成结果 | 审批文字进入卡片及模型消息；片段/最终结果可重复 | exit 0；组件级，无真实工具操作 |
| V03 | 隔离 user/project config，错误字段/嵌套覆盖 | 错误类型不诊断，user 覆盖 project | exit 0；未发模型请求 |
| V04 | 隔离 config，attentionOnIdle=true | raw=true，resolved=undefined，diagnostics=[] | exit 0；未验证真实终端铃声 |
| V05 | 当前项目 prompt 组件组装，空 HOME | 完整 system + 默认工具 + 你好，粗估 6,398 | exit 0；字符估算，非 wire/tokenizer 测量 |
| V06 | adaptTools/prepareToolCall/hooks，write content=7 | writer 收到空串，工具报非错误 | exit 0；writer 为内存 spy，工作区文件为空 |
| V07 | lsp hover ../outside.ts，仓内隔离外部 fixture | 成功返回工作区外符号 | exit 0；没有真实私密数据 |
| V08 | ask 无 callback、合成取消、部分答案 | 成功/默认推荐值被报告为决定 | exit 0；未推定绕过独立审批 |
| V09 | grep .hidden，与 hidden 放不同 marker | 返回 WRONG_VISIBLE | exit 0；真实 rg、小 fixture |
| V10 | web_fetch 预先 aborted signal | fetchCalls=1，新 signal 未取消，success=true | exit 0；mock fetch，零真实网络 |
| V11 | web_search 父 signal + 合成 429 | 期限被父 signal 替代，错误含合成正文 marker | exit 0；虚构配置，mock fetch |
| V12 | 实际 npm start，修正后的三次 PTY | 5,378.77 / 2,644.99 / 2,482.54 ms 出现输入框 | 三次 exit 0；仅 /timings、/exit |
| V13 | 初轮 npm PTY 同时检查粘贴/启动 | 6,057.56 / 2,688.13 / 2,546.18 ms；退出脚本有误 | 三次 -15 来自探针 SIGTERM，见下文；不记作产品退出故障 |
| V14 | 已有编译 Node 入口，三次隔离 PTY | 1,879.90 / 829.69 / 687.53 ms | 三次 exit 0；非本轮 build，不作为源码产物一致性证据 |
| V15 | slash + OverlayHost 重开 + 合成 SessionManager 导航 | 59/117/58，/res 当前项 /reset 且 chosen=false；重开保留 c；分支与显示数据更新 | exit 0；没有真实终端逐帧验收 |

V13 的脚本错误已定位：粘贴 Hello、左移三次后 Ctrl+U 只删除光标前的 He，留下 llo，随后 `/exit` 被拼成 `/exitllo`；父脚本超时后 SIGTERM 终止进程。V12 将启动测量与粘贴操作分开，只发送 /timings、/exit，已正常退出。保留这个分类，避免将测试脚本错误包装成产品退出缺陷。

本轮没有运行 build、Vitest 全套、脚本测试套件或真实 provider。源码未改，既有回归测试仅作证据阅读。文档门禁和链接核对结果见下节。

### 10.3 未关闭的验证与交付边界

以下问题仍未知：用户终端的粘贴残影根因；同环境旧版本启动性能差值；现场双 Esc 到实际屏幕的失败点；真实首轮 5.4k 的精确 tokenizer 分项及上游是否追加提示。前文提供的是进一步区分原因的验证入口，没有把未复现情形抹掉，也没有预先宣称某项修复有效。

[Phase 18 验收表](phase-18-acceptance.md#L3) 的 51/52 是历史有界核对，不是本次全部体验需求达标。W7-33 仍沿用 auth/exit3、四端点真实 TLS/HTTP2 矩阵缺失的记录；本轮没有重跑该门禁，不提升其状态。

本轮最终交付只包含本研究文档、features 索引和简短 wiki 日志；不包含代码修复、commit、push 或本次 CI 通过证据。

14 原研究轮的文档验证：`rtk npm run verify:docs-drift:strict` 已运行并 exit 0；门禁同时报告 120 个未加前缀的源码路径 advisory，不能解释成所有文档引用均无漂移。当时对本文件核对 109 个本地链接和 90 个源码/文档行号锚点，全部存在且在范围内。`rtk proxy git diff --check` 已通过；当时创建的 `feat14-*` 临时目录均已清理。该次工作区范围为本文件、features 索引、wiki 日志，以及开始时就有的用户 `.gitignore` 修改；随后修订轮的范围与检查另见下节复核记录。

---

## 11. 解决方案研究的下游文档（2026-10-05 增补）

本文件（14 号）记录问题、现状与当时的隔离探针。15–24 补充方案，并在本轮按源码、参考实现和用户裁决直接纠正原正文。它们均为研究设计；实施范围、依赖和验收以 [Phase 19 决策与任务规划](phase-19-decisions.md) 为准。

| 问题（本文件章节） | 方案文档 | 覆盖内容 |
|---|---|---|
| §6 深度研究被改方向 | [15：深度研究](15-deep-research-design.md) | `/deep-research` 为主名，research/deep aliases 同步迁移；软件与论文全文、真实来源、对抗核验、共享预算及恢复 |
| §4.2 配色与输入框样式 | [16：Composer 与主题](16-tui-composer-and-theme.md) | 八形态全部提供、默认 `default`、中性命名；精确配色与终端默认前景、左右各 2 cells、复制保留源文 |
| §3、§4.3、§8.2 状态带与面板 | [17：状态与面板](17-tui-status-and-panels.md) | 区分正常界面与 overlay；复用现有 picker，补状态事实与结构化着色，明确新增主题角色 |
| §2.1/§2.2/§2.4/§7 输入、启动与上下文 | [18：输入与上下文](18-input-slash-startup-context.md) | regular marker/caret 修复、原草稿区间补全、别名语义、真实首帧计时、估算与 usage 分账 |
| §4.1、§9 工具与多文件编辑 | [19：工具成熟度](19-tools-maturity-and-multifile-edit.md) | 运行校验、路径/网络/取消/资源边界；单一 apply_patch 复用 writer，部分提交与未知结果如实保留 |
| §5 高级配置 | [20：配置系统](20-configuration-system.md) | 字段 schema/来源/合并与安全策略，JSONC、并发保存、revision reload、设置实际生效；model 会话默认、显式 --global |
| §8 resume/undo/回退 | [21：会话与恢复](21-session-recovery-and-undo-ux.md) | 打开聚焦 current、异步逻辑文件大小；撤销最新已提交 operation，多文件 patch 一组；分支与失败真值 |
| §2、§4 命令覆盖 | [22：命令清单](22-command-inventory-alignment.md) | 注册字段与参考声明的可复算清单、53 个无词法交集入口逐项处置，不把名称差异当能力缺失 |
| §2.1 命令后续选项 | [23：参数选项](23-command-argument-options.md) | 44 个参数命令、18 个无 provider 的行为分类；help/parser/completion 共用语法，动态值与副作用验证 |
| §4 命令能力 | [24：语义对齐](24-shared-command-parity.md) | 20 组精选比较及辅助项，复用已有能力；自主目标、Git、安全、生态、协作及其他新增工作流均入 Phase 19 |

**复核记录**：[verification-15-21](verification-15-21.md) 保留文件名，覆盖范围已扩至 15–24；区分历史父代理抽查、本轮分域源码审查和修订后复核，不把不可用审查算通过。预算未填写即无累计 cap、显式 cap 统一准入、完整大型系统范围、undo/model/三项配色均已按用户答复裁定。

**仍未闭合**：本文件 §10.3 的现场未复现项（粘贴残影真实终端根因、旧版本启动差值、双 Esc 现场像素）在新文档里给的是**验证计划**而非结论；W7-33 认证门禁与四端点真实 TLS/HTTP2 验收仍未完成。所有方案均未施工，不得当作已修复。
