---
title: "17：状态栏常显与面板化重设计研究"
category: article
sources: [user-experience-report-2026-10-05, user-coloring-request-2026-10-05, current-source-28ff98ce, historical-band-probe-2026-10-05, pi, oh-my-pi, codex, 14-user-experience-research]
created: 2026-10-05
updated: 2026-10-05
tags: [research, tui, status-band, panels, slash-commands, pickers, coloring]
summary: "Phase 19 待实施设计：正常会话状态持续可见且保留窗口/用量来源；共享命令投影驱动 help、picker 和报告；结构化 spans/columns 在 presentation 上色，文本/JSON/存储无 ANSI；纠正首帧归因、命令计数、TERM=dumb、context 阈值与算例。历史 F17 探针未在本轮重跑。"
confidence: mixed
---

# 17：状态栏常显与面板化重设计研究

## 1. 范围与口径

用户要求状态信息持续可见，slash 命令拥有可浏览的面板、清晰结构与文本着色。本文将这些要求转成 **Phase 19 待实施方案**。本次只审查修正文档；未修改产品源码、测试、配置或 package scripts，未运行动态 PTY。

基线为 `feat/phase-18` @ `28ff98ce`。§5 保留早先 F17 探针的历史记录，不把它们当作本次重跑证据；尤其撤回 F17-05 对 `TERM=dumb` 的错误归因。

| 问题 | 当前证据支持的结论 | 边界 |
|---|---|---|
| 状态栏似乎交互后才出现 | 正常会话首帧构建状态带；fresh 会话有些 usage 段没有可报告值 | 全屏 overlay 会接管画面；用户现场视觉未复现，不能断定内容稀疏就是原因 |
| 命令输出是文字墙 | 多个命令把纯文本/Markdown 经统一输出链路放入转录；结构与语义角色在拼接时丢失 | `/settings`、`/statusline` 裸命令已是 picker，不能将其带参文本形态重复计作“未面板化命令” |
| 输出单调 | 已有 Markdown 标题、链接、代码、表格等颜色，但命令名/数字/说明列缺少生产端语义 | 不采用全局正则猜测任意对话正文的角色 |

## 2. 状态栏：首帧、未知值与事实来源

### 2.1 当前渲染路径及例外

正常 surface 的 [renderChrome](../../packages/ts-shell/src/presentation/tui/surface/view.ts#L173) 把 activity、overlay 行、`renderBand`、composer 和 hints 组装进帧；`renderBand` 不依赖 busy 或首轮 usage。fullscreen 正常会话与 regular 固定尾块均消费该结果。

但 [view.ts](../../packages/ts-shell/src/presentation/tui/surface/view.ts#L62) 在**全屏 overlay** 分支跳过正常 chrome 并清除 composer geometry，所以不能说“所有模式每一帧都无条件显示 band”。小屏容量与用户终端的实际视觉也未由源码结论证明。

[band.ts](../../packages/ts-shell/src/presentation/tui/chrome/band.ts#L44) 在所有条目空缺时回退模型名；这保证有内容，不保证任意宽度下用户都能看到完整状态。

### 2.2 历史首帧观察

早先组件探针记录 80×24 首帧出现 `opus-5 ▏ build ▏ ask ▏ main ▏ /workspace`；隔离 synthetic PTY 的 fullscreen 与 regular 也记录到状态行（见 F17-01～03）。这些观察反驳该测试环境下“必须先请求模型才构建状态行”，但不能证明用户现场问题原因或所有终端一致。

[firstFrame.test.ts](../../packages/ts-shell/src/cli/interactive/firstFrame.test.ts#L135) 中模型/分支字符串断言可能同时命中欢迎块与状态带，不能独自证明 band 位置；后续验收应按行或布局角色断言。

### 2.3 当前事实门闸

[readStatusFacts](../../packages/ts-shell/src/cli/interactive/sessionFacts.ts#L50) 的相关逻辑为：

```ts
...(usage.lastPromptTokens > 0
  ? { contextUsed: usage.lastPromptTokens, contextWindow: resolveContextWindow(...).window }
  : {}),
...(totalTokens(usage) > 0 ? { sessionTokens: totalTokens(usage) } : {}),
...(usage.turnsCount > 0 ? { turns: usage.turnsCount } : {}),
...(cost > 0 ? { costUsd: cost } : {}),
```

模型、目录、分支、agent mode 与 permission scope 有独立来源；fresh 会话尚无计量时，上下文、累计 token、cost、turns 可能省略。遥测也可由恢复路径重建（[usageTelemetry.ts](../../packages/ts-shell/src/observability/usageTelemetry.ts#L264)），因此“每次首帧必为空 Map”不成立。

内容稀疏、欢迎块信息重复、背景对比都可能影响状态存在感，但仅是待验证解释。不能把用户的视觉报告直接归因为门闸或终端颜色模式。

### 2.4 参考实现的未知态

| 参考 | 实际行为 | 可借鉴边界 |
|---|---|---|
| pi | 用量未知但窗口已知时显示 `?/200k` | [footer.ts](../../../pi/packages/coding-agent/src/modes/interactive/components/footer.ts#L157)；保留 unknown，而非补零 |
| oh-my-pi | `pct === null && window > 0` 时窗口独显 | [segments.ts](../../../oh-my-pi/packages/tui/src/status-line/segments.ts#L840)；窗口与用量可以独立投影 |
| Codex | 百分比优先，其次 used tokens；部分无值分支为 `100% context left` | [footer.rs](../../../codex/codex-rs/tui/src/bottom_pane/footer.rs#L999)；不能把该 100% 作为 Cheers 的事实语义 |
| Codex pending | pending 分支返回空 `Line`，可隐藏该行 | [chat_composer.rs](../../../codex/codex-rs/tui/src/bottom_pane/chat_composer.rs#L1427)；因此“三家都不省略整项”不成立 |

pi/oh-my-pi 另有本地估算路径；估算与 provider 报告应分开显示。参考的 unknown 时机也不同，不能概括为仅在压缩后出现。

### 2.5 决定：状态连续可见、来源连续可追溯

| 决定 | 实施责任 | 目标行为 |
|---|---|---|
| D1 窗口与 usage 解耦 | sessionFacts producer | 即使 usage 未知，也产出窗口 resolution 与来源 |
| D2 保留来源与 warning | [models/window.ts](../../packages/ts-shell/src/core/models/window.ts#L135) → 状态 projection | `config`、`catalog`、`default` 与 warning 不能在取 `.window` 后丢失 |
| D3 明确未知/估算/已报告 | 状态/报告 renderer | 已知目录窗口可为 `?/200k`；配置窗口标配置来源；默认 64k 标 `assumed`，不能冒充模型已知上限 |
| D4 保留已有默认条目 | 状态配置 | session 短 id 继续可选，不为“会动”强塞默认；它在同一会话中本来静态，且会挤掉右侧段 |
| D5 常态与 overlay 生命周期 | surface/overlay | 正常会话保留可见状态；全屏 overlay 接管，关闭后恢复；窄屏按明确优先级降级 |
| D6 数值真实性 | usage/cost producer | 真实已记录的 0 请求/0 token 可显示；未知 provider 用量不能写 0；费用 0 需计量范围与费率依据 |

`default` 窗口来自 resolver 的假定预算，当前默认为 64,000；其值可能与 catalog 恰巧相同，**数字相等不表示来源相同**。紧凑状态可显示 `?/64k assumed`，详情保留 warning；config 高于 catalog 的警告也必须可见。若显示 `~4k est`，必须标本地估算，不占用 provider reported 的字段。

默认形态采用 16 号文档的顶线 chip/底栏挂载，不要求所有形态都保留一条填充 band。状态语义相同，几何由 shape 决定；不得重复绘制两份状态。

### 2.6 风险与待验证项

- 用户现场尚未复现。新验收区分 fresh/resume/compaction、正常会话/全屏 overlay、宽/窄屏，而非仅找模型名字符串。
- 当前 [detectColorMode](../../packages/ts-shell/src/presentation/theme/color.ts#L17) 顺序是显式 `FORCE_COLOR` → 非空 `NO_COLOR` → truecolor 能力或 256。**`TERM=dumb` 本身不返回 none**；有效 FORCE_COLOR 优先于 NO_COLOR。历史 F17-05 的环境归因撤回。
- `colorMode=none` 取消颜色，但 [theme.ts](../../packages/ts-shell/src/presentation/theme/theme.ts#L129) 仍可输出 bold/dim/其他属性 SGR；NO_COLOR 不等于无 ANSI。输出边界策略见 §6.5。
- 小屏状态段裁剪不能掩盖 permission、pending、failed、unknown 等真实状态；详情入口必须可达。

## 3. 命令面板与共享报告

### 3.1 当前链路与问题

TTY 本地命令通常经 `routeInteractiveCommand` → [cliCommandExecutionBridge](../../packages/ts-shell/src/entrypoints/cliCommandExecutionBridge.ts#L97) → `renderLine(slashResult.output)` → [StreamingRenderer](../../packages/ts-shell/src/presentation/terminal/streaming.ts#L37) → [turnSink](../../packages/ts-shell/src/cli/interactive/turnSink.ts) 进入转录。Markdown renderer 能识别标题/代码/表格标记，但已拼好的命令名、摘要、Tokens 列与说明列通常没有独立角色。

这不是完全没有颜色，也不是加一个面板外壳就能恢复结构。生产端需保留语义，presentation 才能按角色排版、上色、复制和导出。

### 3.2 命令口径与迁移矩阵

完整命令盘点由 [22-command-inventory-alignment.md](22-command-inventory-alignment.md)、[23-command-argument-options.md](23-command-argument-options.md)、[24-shared-command-parity.md](24-shared-command-parity.md) 共同约束。14 号文档的 UI 口径是 **59 = 58 个该配置下的 dispatch 命令 + picker-only `back`**；历史 F17-04 的“58 可见”是当时配置的观察，不能当完整 UI 命令总数。MCP 门控和动态扩展会改变集合。

[slashCommandRegistry.ts](../../packages/ts-shell/src/entrypoints/slashCommandRegistry.ts#L51) 的共同投影包含 builtin、picker-only 和 extensions；`/help`、slash suggestions、picker 与文档生成须消费该投影并订阅变化。直接调用 `listVisibleCommands` 会漏 `back` 和动态扩展。

迁移矩阵按 **canonical id × 裸/带参 × TTY/print × 读写效果** 建立。以下是展示层目标分组，不是相加得到总命令数的完整清单：

| 命令/形态 | 当前或目标交互 | Phase 19 决定 |
|---|---|---|
| `/model`、`/resume`、`/settings`、`/statusline` 等裸命令 | 已有 picker | 保留入口，统一 alias/canonical 路由、可见性与生命周期 |
| `/help`、`/?` | 当前长清单 | 可搜索命令面板；选择后填入 composer |
| `/theme` | 当前主题目录文本 | 内存预览选择器，Esc 恢复，Apply 保存 |
| `/hotkey`、`/context`、`/cost`、`/diagnose`、`/sidebar`、`/metrics` | 报告 | 结构化只读报告；inline/fullscreen 自适应 |
| `/tools` | 目录/详情 | 列表到详情；报告源数据可复用 |
| `/undo`、`/restore` 的操作分支 | 恢复/写盘 | 接 21 号文档完整预览、权限、stale-read、writer 与结果链 |
| `/thinking`、`/fast`、`/shell`、`/view` | 设置或状态 | 适合选择器的分支用显式 Apply；导航不改运行语义 |
| `/statusline list`、`/settings <name>`、带参命令 | 文本或明确执行 | 保留可脚本化路径；不可与裸命令重复计数 |
| `/log tail`、`/entries`、`/timings`、导出等 | 流或管道 | 保留文本/JSON 契约，按用途增加浏览视图 |
| `/goal`、深度研究、Git 面板、顾问、安全分析、技能商店、远程协作 | 需要各自完整 runtime | 全部纳入 Phase 19，由功能 owner 实现；面板不得冒充功能完成 |

### 3.3 具体面板决定

#### P1 `/help`：选择填入 composer

采用可搜索列表：canonical name、summary、category 与适用状态分列；空过滤器以主命令为主，过滤时可匹配 alias。数据来自共同命令投影，包括 picker-only 与扩展。

Enter 选择后将规范命令与必要参数提示填入 composer，并关闭面板、恢复输入焦点；**再次明确提交才执行**。footer 为 `Enter to insert · Esc to close`。浏览、过滤、选择都不得执行写盘/联网/退出等副作用，也不把任意字符串作为可调用函数。

参考 Codex 的 8 行是可见选项上限的设计依据；Cheers 当前 [overlay.ts](../../packages/ts-shell/src/cli/interactive/overlay.ts#L82) `PANEL_ROWS=12` 是整体 capacity，panel 还扣标题/footer，不能称“现有上限已是 8”。目标列表最多显示 8 个选项，另算标题、过滤、溢出与 footer，最终受物理屏高限制。

#### P2 主题与形态：纯视觉预览

主题与 16 号文档形态共享真实 renderer 预览；预览仅内存，不写配置。Esc/取消/错误恢复进入前状态；Apply 保存并显示实际结果。主题来源、预览项和保存层可见，保存失败不伪装成功。

#### P3 只读报告与详情

参考 [ReportPanel](../../../oh-my-pi/packages/tui/src/overlays/report-panel.ts) 的 inline/fullscreen 选择，但以实际报告 chrome 与屏高计算，不照抄固定常数。报告拥有 title、结构化 body、scroll state 与只读关闭操作，**不要求虚构 apply 回调**。

↑/↓、PgUp/PgDn、Home/End 与滚轮调整同一报告 viewport；长列窄屏改上下堆叠或折行，不截掉关键值。`/tools` 等可浏览列表显式打开详情；只读报告本身不在 Enter 时执行动作。resize 在 inline/fullscreen 间切换仍保留合理阅读位置；关闭、取消或错误恢复 composer 焦点。

#### P4 恢复/写操作面板

面板列表选择只选择目标。预览、确认和批准为独立状态；执行复用 recovery owner 的守卫与 stale-read，writer 结果与验证证据决定成功。确认框本身不是授权系统，也不能把 partial/failed/unverified 升为成功。具体契约见 [21-session-recovery-and-undo-ux.md](21-session-recovery-and-undo-ux.md)。

#### P5 语义设置

`thinking`、`fast`、`shell` 等影响运行语义，光标移动不得调用 setter 或触发请求。选择后 **Apply** 才提交，按各设置 owner 的校验与生效边界处理；不能套用主题的即时视觉预览模型。档位来自模型/配置能力，不硬编码“四档适用于所有模型”。

### 3.4 结构化报告契约与所有权

沿用 `LocalCommandResult.output` 作为纯文本兼容投影，增加独立 `report` 语义字段。整行 `{ text, role }` 不足以表达同一行里的命令、参数、数字和说明，采用 spans/columns：

```ts
export interface ReportSpan {
  readonly text: string; // 纯文本，无 ANSI；数据生产方保留语义
  readonly role: ReportRole;
}
export type ReportLine =
  | { readonly kind: "text"; readonly spans: readonly ReportSpan[] }
  | { readonly kind: "columns"; readonly cells: readonly (readonly ReportSpan[])[] }
  | { readonly kind: "heading"; readonly spans: readonly ReportSpan[] }
  | { readonly kind: "space" };
export interface CommandReport {
  readonly title: string;
  readonly columns?: readonly ReportColumn[]; // 列键、对齐、窄屏次序
  readonly lines: readonly ReportLine[];
}
```

`ReportRole` 与 `ReportColumn` 在 command/report owner 明确定义；runtime 只产语义，不知道 `ThemeColorToken` 或 ANSI。纯文本与结构化内容从同一模型投影，避免两套内容漂移；JSON 输出保留稳定数据字段、来源和状态，不能将 TTY 行文本当 JSON 数据模型。

| owner | 需要改变的内容 |
|---|---|
| 各 command owner / result contract | 结构化报告与纯文本/JSON 投影；保留错误、来源、partial/unknown 状态 |
| `presentation` 报告 renderer | spans 上色、columns 宽窄布局、纯文本序列化、theme revision 缓存 |
| entrypoint bridge | 薄适配：转交结构化数据或兼容 output，不内嵌 token 着色 |
| interactive overlay/report host | form、键鼠路由、scroll、resize、取消、焦点与生命周期 |
| transcript/session projection | 保存纯文本及必要的版本化语义结构；重放时重新着色 |

这涉及数据契约与交互层，不再声称“数据层不动、交互层零改动”。新代码置于明确报告域，使用 `contract`、`projection`、`renderer`、`state` 等短职责名，入口维持薄适配。

### 3.5 兼容与风险

canonical/alias 先收敛，否则相同命令不同拼写会进入不同面板。带参/print/非 TTY 路径保持支持，命令是否支持非交互由其 contract 决定；面板不能替所有命令统一放行。

[cliCommandExecutionBridge.ts](../../packages/ts-shell/src/entrypoints/cliCommandExecutionBridge.ts#L155) 仅在 `slashResult.state` 存在的分支写本地结果消息，不是每个 output 都无条件持久化；无论是否保存，`output` 与 report 文本均不得带 ANSI。报告角色只能在 presentation 消费时转成样式。

## 4. Phase 19 交付顺序与决定

1. 统一命令 metadata/canonical 投影与状态事实来源，修正 alias/picker-only/扩展一致性。
2. 完成 16 号文档主题默认色与映射；实现结构化报告及纯文本/JSON 输出边界。
3. 接入主题/形态预览、只读报告 host、help 填入 composer；逐命令迁移 context/cost/tools/hotkey/diagnose/sidebar/metrics。
4. 语义设置按 Apply 生效；恢复和其他写操作面板接各 owner 的授权/执行/证据链。大型功能全部在 Phase 19 分批交付，不因面板工作量而删减。

D1–D6、结构化 spans/columns、只读报告生命周期、help 两步提交、纯视觉预览、语义设置 Apply 均为本次技术决定。所有代码仍待实施；不能把这份文档视作功能完成。

## 5. 历史验证记录与撤回项

以下记录来自早先研究，**本次审查未重跑**。它们仅证明记录环境中的历史观察；临时探针当前是否可复现、是否完整保存环境均未在本轮重新确认。

| 编号 | 历史探针 | 保留的观察/修正 |
|---|---|---|
| F17-01 | InteractiveMode + RecordingTerminal，80×24，dark，FORCE_COLOR=3 | 记录首帧 band 与 `48;2;48;48;48` 背景序列；不泛化用户终端 |
| F17-02 | synthetic 隔离 PTY，fullscreen | 记录首帧 band；本轮未重跑 |
| F17-03 | synthetic 隔离 PTY，regular | 记录首帧 band；本轮未重跑 |
| F17-04 | listVisibleCommands/renderUserHelp/renderKeyGuide | 当时配置记录 58 可见、help 70 行、hotkey 66 行；不是完整 UI 命令总数或固定输出行数 |
| F17-05 | detectColorMode/colorToAnsi 检查 | **撤回“TERM=dumb ⇒ none”及据此归因。** 当前源码没有该分支，完整探针环境未保存为可核验证据；有效 FORCE_COLOR=3 ⇒ truecolor 仍由源码支持 |

早先记录称探针隔离运行、无真实 provider、无真实会话读写且清理临时 fixture；本次不补作这些动作已经再次执行的断言。本轮证据为源码阅读与文档一致性审查；未运行 build/tests/动态 PTY。

## 6. 命令输出与面板着色

### 6.1 当前颜色与缺口

[markdown.ts](../../packages/ts-shell/src/presentation/tui/transcript/markdown.ts) 已处理 mdHeading、mdCode、filename、mdLink、表格线、引用与代码围栏；[blocks.ts](../../packages/ts-shell/src/presentation/tui/transcript/blocks.ts#L281) 为命令块标题加 bold。`/help` 中普通命令清单、`/context` 数字列与说明列仍多为未分角色文本。

目标是让 producer 保留结构，renderer 按语义排版；不通过在所有 Markdown 正文上匹配 `/path`、数字或组合键来猜测。

### 6.2 参考语义与采用边界

参考 [tui-adapters.ts](../../../oh-my-pi/packages/tui/src/theme/tui-adapters.ts#L194) 将 Markdown 元素映射到 token，未知/失败高亮回退 `mdCodeBlock`；[segments.ts](../../../oh-my-pi/packages/tui/src/status-line/segments.ts) 按状态来源和档位着色。采用角色表与渲染期取色即可，无需仅因参考文件较大而复制整套函数注入结构。

参考 `toolTitle`、`toolOutput`、`toolDiff*`、`customMessageText`、`customMessageLabel` 都是前景角色；不能声称参考“没有 tool/custom 前景色”。工具背景是另一层视觉语义，是否采用由对应组件决定。

### 6.3 角色到主题 token

报告角色复用既有 token；主题新增项与默认色由 [16-tui-composer-and-theme.md](16-tui-composer-and-theme.md) §10 统一定义，不在本文件另定调色板。

| 语义角色 | token / 样式 | 说明 |
|---|---|---|
| 命令 | `command` + bold | dark `#89d281` |
| 参数/普通值 | `commandArg` / `text` | 目标为终端默认前景，不保留未经批准固定白色 |
| 标志/开关 | `commandFlag` | dark `#569CD6` |
| 键名 | `syntaxKeyword` | dark `#569CD6`，保留可读键文本 |
| 路径 | `filename` | dark `#89d281`；不擅自改色区分命令 |
| 数字/计数 | `syntaxNumber` | dark `#B5CEA8` |
| 单位/次要说明 | `muted` 或 `dim` | 关键说明不得只用低对比 dim |
| 标题/分组 | `mdHeading` / `accent` + bold | dark `#febc38` |
| 列头 | `muted` + bold | 结构依赖列模型，不靠空格猜列 |
| 链接 | `mdLink` / `mdLinkUrl` | 保留 label/URL 数据；OSC 8 由输出能力决定 |
| 行内代码 | `mdCode`，显式路径角色用 `filename` | dark mdCode `#e5c1ff` |
| fenced code | `syntax*`；失败/未知为 `mdCodeBlock` | fallback dark `#9CDCFE`，边框 `mdCodeBorder #777d88` |
| warning/error/success | 同名 token + 明确文本或字形 | 无色和降色后仍能区分 |
| 表格线 | `border` | dark `#178fb9` |

**上下文阈值统一复用当前 50/70/90 策略**（[items.ts](../../packages/ts-shell/src/presentation/tui/chrome/items.ts#L89)）：`<50%` 正常色 `statusLineContext`，`≥50%` accent，`≥70%` warning，`≥90%` error。将阈值投影为共享 owner，status 与 report 消费同一结果；着色改造不得引入配额的 50/80 另一套 context 阈值。百分比数值服从该角色，不能既规定用量档位又一律写成 syntaxNumber。

### 6.4 唯一实施路径：结构化语义、渲染期着色

采用 §3.4 的报告契约。runtime 生成纯文本 spans/columns；bridge 转交；transcript 与 panel 保存语义并在每次渲染时用当前主题取色。print/text 与 JSON 由输出边界选择对应 serializer。

不采用旧草案的路线 B，也不在 `renderInline` 增加全局正则兜底。未迁移的旧字符串输出继续走原 Markdown 路径，语义色缺失保持可见，不能用启发式把普通对话、路径或数字误标为命令角色。

`Theme.apply` 的 revision 与 transcript 缓存失效继续复用。结构化报告必须将 theme revision、宽度、内容版本和 viewport 纳入相应缓存键，不能把早先 ANSI 字符串长期缓存为源数据。

### 6.5 NO_COLOR、无 ANSI 与输出边界

当前行为必须与目标策略分开：

- 当前 `FORCE_COLOR` 显式覆盖优先，其次非空 `NO_COLOR`；`TERM=dumb` 没有直接关闭颜色；颜色检测不读 `isTTY`，重定向不会自然变纯文本。
- 当前 `colorMode=none` 让 `colorToAnsi` 返回空串，但 bold/dim/underline 等属性仍可输出 SGR。NO_COLOR 仅是禁颜色约定，不是完全去控制序列的承诺。
- Phase 19 由输出边界明确选择能力：正常 TTY 可用颜色/属性；无覆盖的 dumb 或非 TTY/管道默认走无控制序列文本；显式要求彩色的文本输出可在支持的 CLI 契约下覆盖。JSON、纯文本导出与持久化始终无 ANSI，不受 FORCE_COLOR 影响。
- 完全纯文本 serializer 直接拼语义文本，不调用样式函数，也不输出 cursor/OSC 控制序列。NO_COLOR 下即使保留 TTY 属性，状态仍有可读标签/字形，不能仅依赖颜色。

16 色降色会合并一些角色色，256 色量化也不保证视觉精确；“精确调色板”指 truecolor 角色值/默认语义一致。低色模式靠文本与结构区分，不能未经用户批准微调 filename 或其他 token 来制造差异。

### 6.6 目标示例（未实施）

下面 `⟨role/token⟩` 是文档注记，不是最终显示文本。目标颜色来自 16 号最终表；示例不是本轮真实渲染结果。

`/help`：

```text
⟨mdHeading #febc38⟩Slash commands
⟨accent #febc38⟩Session
  ⟨command #89d281 bold⟩/resume  ⟨text default⟩open the session surface
  ⟨command⟩/fork              ⟨text default⟩continue in a new session
⟨accent⟩Keys
  ⟨syntaxKeyword #569CD6⟩shift+tab  ⟨text default⟩switch between planning and building
```

命令面板选项的 Enter 只填入输入框；同一数据的报告/print 展示不带执行回调。

`/context` 算例：窗口 **200,000**、已用 **64,000**、保留 **17,000**、可用 **119,000**。已用比例为 **32.0%**，不是 3.2%；32-cell 图按当前分配算法为 **10 used + 3 reserved + 19 free = 32**。

```text
Context window
██████████▒▒▒░░░░░░░░░░░░░░░░░░░  32.0% used
Last request: 64,000 / 200,000 tokens
Free: 119,000 · Reserve: 17,000

What                           Tokens   How it is known
Tool schemas                   ~8,000   22 definitions, locally counted
Instructions and conversation ~56,000   residual estimate from reported total
Last request total             64,000   reported by the provider
```

图例分别用 used/accent、reserve/dim、free/muted；数字字段 `syntaxNumber #B5CEA8`，`32.0%` 用正常 context 角色 `#8787af`；若 62% 为 accent、75% 为 warning、91% 为 error。说明列保留 estimate/reported 来源，颜色不能把估算变成已报告值。表格窄屏按 columns 结构重排，不能截掉“如何得知”。

`/hotkey` 的 `not reported` caveat 属 warning，保留说明文本；终端未报告某键不等于确定该键永远不能工作。

### 6.7 组合关系与数据守恒

报告数据可以先让 transcript 文本路径受益，再接面板；两者共享 spans/columns，不各写一套内容。纯文本 output、会话保存、复制、导出与 JSON 不含 ANSI；TTY 着色只在 presentation 最后消费时发生。

bridge 不在 runtime 的 output 生成阶段包色，也不把渲染字符串回写 session。主题切换重新渲染历史报告；结构化字段若需要持久化，应有版本与兼容投影，未支持字段仍有纯文本内容可读。

### 6.8 实施验收与未验证项

| 范围 | 后续需要的证据 |
|---|---|
| 状态 | fresh/resume/compaction 的 reported/estimate/unknown；config/catalog/default 来源与 warning；正常/overlay/窄屏恢复 |
| 命令目录 | builtin、picker-only back、alias、动态扩展与权限/能力门控在 help/suggestions/picker 一致 |
| 报告结构 | 同一行多 span、多列、长字段、CJK、窄屏重排；纯文本/JSON/复制内容守恒 |
| 交互 | Help 选择不执行、再次提交执行；只读报告无 apply 副作用；滚动/resize/取消/错误恢复焦点 |
| 设置 | 主题/shape 内存 preview 和 Esc 恢复；语义设置只 Apply；保存失败真实 |
| 恢复写盘 | preview/approval/stale-read/writer/verification 状态不混淆；partial/failed/unverified 不变成功 |
| 颜色 | 最终调色板与 context 50/70/90 同源；truecolor/256/16/NO_COLOR；dumb/非 TTY/JSON 无控制序列分别验证 |
| 存储与重放 | output/session/export 无 ANSI；theme revision 后报告重渲染；旧文本兼容 |

本轮没有执行这些验证；before/after 与算例为静态设计。后续测试应断言纯文本模型与角色结构，不能只 stripAnsi 后看起来相同而漏掉持久化污染或错误角色。
