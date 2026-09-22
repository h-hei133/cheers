---
title: "功能对照 04：终端交互与呈现（我们 vs pi）"
category: article
sources: [pi-source-2026-09-20, repo-audit-2026-09-20]
created: 2026-09-20
updated: 2026-09-20
tags: [features, gap-analysis, pi, tui, themes, keybindings, markdown]
summary: "[部分已过时，见文首横幅] 对照 pi 的终端面：编辑器、补全、主题、快捷键、消息队列、转录渲染。发现 light 主题在生产不可达（setTheme 零调用者）、主题令牌 39 vs pi 56 且缺 thinking 档位色、无 @文件引用与 Tab 路径补全、无快捷键自定义。覆盖清单 11 项 DEFICIENT、7 项 MISSING、2 项 OURS-ONLY。"
confidence: high
---

# 功能对照 04：终端交互与呈现

> **⚠️ 本文是 2026-09-20 的调研快照，其中部分结论已过时。**
> 已过时的结论在**原位**加了 ✅ 标注（保留原文作为当时的证据）；**未标注的行仍按原文有效**。

> 本轮为**功能开发前锋探索**，零代码改动。对照本地参考仓 `pi`（`/home/wang/projects/pi`）。
> 分类口径：`DEFICIENT`＝我们有但更弱／不完整／未接线；`MISSING`＝pi 有我们没有；
> `OURS-ONLY`＝我们有 pi 没有（**仅记录，本轮不提议开发**）。

## 0. 方法与范围

| 侧 | 读到的位置 |
|---|---|
| pi | `docs/{usage.md, keybindings.md, themes.md, tui.md, terminal-setup.md}`、`src/modes/interactive/{interactive-mode.ts, theme/*, components/*}`、`packages/tui` |
| 我们 | `presentation/tui/{editor.ts, pastes.ts, terminal.ts, terminalCapabilities.ts, input/*, render/*, surface/*, text/*, transcript/*, chrome/*}`、`presentation/theme/theme.ts`、`presentation/themes/{dark.json, light.json, index.ts}`、`cli/interactive/{keymap.ts, overlay.ts, pointer.ts, slashSuggestions.ts, picker/*}` |

关键检索命令与结果：

```bash
# light 主题是否可达
grep -rn "setTheme" packages/ts-shell/src --include='*.ts' | grep -v test   # → 仅定义处
grep -rn "getTheme(" packages/ts-shell/src --include='*.ts' | grep -v "theme/theme.ts" | grep -v test   # → 0
# 快捷键自定义
grep -rn "keybindings.json" packages/ts-shell/src --include='*.ts'   # → 0
# @ 文件引用 / Tab 路径补全
grep -rn 'startsWith("@")' packages/ts-shell/src/cli packages/ts-shell/src/presentation   # → 0
grep -rn "completePath\|pathCompletion" packages/ts-shell/src --include='*.ts' | grep -v test   # → 0
# mermaid
grep -rli "mermaid" packages/ts-shell/src/presentation   # → 0
```

**令牌集合对比（可复核）**：

```
ours: 39   pi: 56
ours-only: assistantText, command, commandArg, commandFlag, commandNumber,
           commandPipe, commandString, diffAdded, diffContext, diffRemoved, filename
pi-only:   bashMode, customMessageBg, customMessageLabel, customMessageText,
           mdCodeBlock, mdCodeBlockBorder, mdHr, mdLinkUrl, mdListBullet, mdQuote,
           mdQuoteBorder, scrollbarThumb, scrollbarTrack, searchMatchBg, searchMatchText,
           syntaxOperator, syntaxPunctuation, syntaxType,
           thinkingHigh, thinkingLow, thinkingMax, thinkingMedium, thinkingMinimal,
           thinkingOff, thinkingXhigh, toolDiffAdded, toolDiffContext, toolDiffRemoved
```

## 1. 覆盖清单

| 能力 | pi 位置 | 我们位置 | 判定 | 证据 |
|---|---|---|---|---|
| 主题可达性与切换 ✅ **已修复**（配置驱动生效；仍缺 `/theme` 命令与热重载） | `docs/themes.md:17-40`；`src/modes/interactive/theme/theme-controller.ts` | `presentation/theme/theme.ts:168`；`presentation/themes/index.ts:10` | **DEFICIENT** | 见 §2.1 |
| 主题令牌完整度 | `src/modes/interactive/theme/theme-schema.json`（56 色） | `presentation/themes/dark.json`（39 色） | **DEFICIENT** | 见 §2.2 |
| 主题磁盘发现与 CLI 覆盖 | `docs/themes.md:17-40`（5 类位置 + `--theme`） | 静态 registry（`presentation/themes/index.ts:10`） | **DEFICIENT** | 见 `01-*` §2.4 |
| 快捷键可自定义 | `docs/keybindings.md:1-40`（`~/.pi/agent/keybindings.json`） | `cli/interactive/keymap.ts`（硬编码表） | **MISSING** | 见 §3.1 |
| `@` 文件引用 + 模糊查找 | `docs/usage.md:22`（`Type @ to fuzzy-search project files`） | 无 | **MISSING** | 见 §3.2 |
| Tab 路径补全 | `docs/usage.md:23`（`Press Tab to complete paths`） | 无 | **MISSING** | 见 §3.2 |
| 外部编辑器（Ctrl+G） | `docs/usage.md:31`；`docs/settings.md`（`externalEditor`） | 无 | **MISSING** | 见 §3.3 |
| 粘贴图片（Ctrl+V） | `docs/usage.md:27`；`docs/settings.md`（`images.*`） | 无 | **MISSING** | 见 §3.4 |
| 长粘贴占位 | `docs/usage.md` 未单列（pi 直接内联） | `presentation/tui/pastes.ts`（`PASTE_PLACEHOLDER_THRESHOLD = 320`） | **OURS-ONLY** | 见 §4 |
| 消息队列（steering／follow-up） | `docs/usage.md:63-73`；`docs/settings.md`（`steeringMode`／`followUpMode`） | `core/agent/queue.ts:1-40`；`core/agent/agent.ts:30-31,106-128`；`turn/session.ts:218-227` | **DEFICIENT**（仅模式不可配） | 两种投递语义已完整实现并接线；缺的是 `steeringMode`/`followUpMode` 无调用点传入（见 §2.3） |
| 转录内搜索 | `docs/keybindings.md:93,114-115`（`tui.altScreen.search`） | 无（pager 有过滤，转录没有） | **MISSING** | 见 §3.5 |
| Mermaid 图渲染 | `src/modes/interactive/components/mermaid.ts`（89 行，`grok-mermaid`） | 无 | **MISSING** | 见 §3.6 |
| Markdown 渲染（表格／围栏／行内） | `packages/tui` Marked 集成 | `presentation/tui/transcript/markdown.ts`（188 行） | **DEFICIENT** | 见 §2.4 |
| 工具输出折叠／展开 | `docs/keybindings.md:163`（`ctrl+o`） | `presentation/tui/transcript/blocks.ts:39-42,163-175`；`cli/interactive/pointer.ts:237` | **DEFICIENT** | 见 §2.5 |
| Thinking 块折叠 | `docs/keybindings.md:157`（`ctrl+t`） | `blocks.ts:122-126`（默认折叠，无键盘切换） | **DEFICIENT** | 见 §2.5 |
| Kill ring（多级） | `docs/keybindings.md:69-73`（`ctrl+y`／`alt+y` yankPop） | `presentation/tui/editor.ts:54,208-246,433-441` | **DEFICIENT** | 见 §2.6 |
| Undo | `docs/keybindings.md:71`（`ctrl+-`） | `editor.ts:251-258`；`keymap.ts:182-184`（`ctrl+z`） | **DEFICIENT** | 见 §2.6 |
| 鼠标选择与复制 | `docs/keybindings.md:76-93`；`docs/settings.md`（`fullscreenCopyOnSelect`） | `presentation/tui/input/mouse.ts`；`transcript/selection.ts`；`cli/interactive/clipboard.ts` | **DEFICIENT** | 见 §2.7 |
| Kitty 键盘协议协商 | `docs/tui.md:33-58`（`Focusable`、`CURSOR_MARKER`） | `presentation/tui/input/keyboardProtocol.ts:1-30` | **OURS-ONLY／平手** | 见 §4 |
| 全屏（alt screen）模式 | `docs/usage.md:255-257`（`--tui-mode fullscreen`） | `presentation/tui/render/engine.ts:114` 恒定进入 | **DEFICIENT** | 见 §2.8 |

## 2. DEFICIENT 详述

### 2.1 ~~`light` 主题在生产不可达~~ ✅ 已修复

> **现状**：`setTheme` 已重构为 `applyTheme`，并在 `cli/bootstrap/cliProcessRunner.ts:104` 由 `runtimeConfig.theme` 驱动调用——配置指定 `light` 在生产已生效。仍缺：`/theme` 命令不存在，且 `/reload` 比对 `theme` 后**未重新 `applyTheme`**（热重载不生效）。

**现象**：`light.json` 存在、`listThemes()` 会列出它，但没有任何代码路径能切换到它。

**证据（我们）**：

- `presentation/themes/index.ts:10-12` `registry = { dark: darkJson, light: lightJson }`。
- `presentation/theme/theme.ts:176` `export const defaultTheme = new Theme(getDefaultTheme())` —— `getDefaultTheme()`（`themes/index.ts:23-25`）恒返回 `registry.dark`。
- `presentation/theme/theme.ts:168` `setTheme(name)` 是唯一的切换入口，`grep -rn "setTheme" packages/ts-shell/src --include='*.ts' | grep -v test` → **仅定义处，零调用者**。
- `getTheme(` 在生产代码中零调用（仅 `theme.test.ts:36-37` 测试调用）。
- 生产代码引用 `defaultTheme` 共 **159 处**，全部指向 dark。
- `config/runtimeConfig.ts:85` 声明了 `theme?: "dark" | "light" | "auto"`，但 `getRuntimeConfig` 不返回它（见 `03-*` §2.1），所以配置文件也切不动。
- 无 `/theme` 或 `/settings` 命令（`grep -n "theme" core/commands/registry.ts` → 0 命中）。

**证据（pi）**：`docs/themes.md:30-40` 通过 `/settings` 或 `settings.json` 的 `theme` 选择，`:42-57` `--use-theme light` 可单次运行覆盖，且支持 `light/dark` 跟随终端外观。

**影响**：浅色终端用户拿到的是深色配色，`light.json` 与 39 个令牌定义是**维护负担而非功能**。

**最小改动建议**：`setTheme` 接到一个真实入口（`/settings` 或 config 的 `theme` 字段），或按 `01-*` §3.1 的标准承认它是未接线旋钮并删除 `light.json`。二选一，不要维持现状。

### 2.2 主题令牌缺 thinking 档位色与滚动条色（置信度：高）

**证据（我们）**：`presentation/themes/dark.json` 39 色；`presentation/theme/theme.ts:13-52` 的 `ThemeColorToken` 联合类型恰好 39 项。

**证据（pi）**：`src/modes/interactive/theme/theme-schema.json` 56 色。差异中**有实际渲染后果的**：

| pi 有我们没有 | 用途 |
|---|---|
| `thinkingOff`/`Minimal`/`Low`/`Medium`/`High`/`Xhigh`/`Max`（7 个） | 编辑器边框按当前 thinking 档位着色（`docs/keybindings.md` 与 `docs/settings.md` 的 thinking 设置） |
| `scrollbarTrack`／`scrollbarThumb` | 全屏转录滚动条 |
| `searchMatchBg`／`searchMatchText` | 转录搜索结果高亮 |
| `mdCodeBlock`／`mdCodeBlockBorder`／`mdHr`／`mdListBullet`／`mdQuote`／`mdQuoteBorder`／`mdLinkUrl` | Markdown 元素细分 |
| `syntaxOperator`／`syntaxPunctuation`／`syntaxType` | 语法高亮细分 |

**影响**：我们的编辑器边框**无法表达 thinking 档位**——而 `core/commands/thinkingCommandRuntime.ts:21` 已经有三档状态可显示。这与 `03-*` §2.7 是同一缺口的两端：状态有了，呈现没有。

**最小改动建议**：补 7 个 thinking 色 + 2 个滚动条色（滚动条几何**已经算好**，见 `presentation/tui/transcript/viewport.ts:11-19` 的 `ScrollbarGeometry`，只是用了通用 border 色）。

### 2.3 消息队列：**两种投递语义已完整实现**，仅模式不可配（置信度：高）

> **本项经复核大幅收窄。** 主代理初判「单一队列、无投递时机区分」是**错误的**——队列机制比初判完整得多。保留原判与更正过程。

**原判（错误）**：称 `interactiveMode` 只有 `queue: string[]` 单一队列，未区分 steering 与 follow-up 的投递时机。

**更正后的事实**：投递语义**完整实现**且**接线到位**：

| 层 | 实现 |
|---|---|
| 队列数据结构 | `core/agent/queue.ts:1-40` `PendingQueue<T>`，`PendingQueueMode = "one-at-a-time" \| "all"`，`drain()` 按模式返回一条或全部 |
| 两个独立队列 | `core/agent/agent.ts:30-31` `steeringQueue` / `followUpQueue`；`:39-40` 各自可配模式 |
| 循环钩子 | `core/agent/loop.ts:39-40` `getSteeringMessages` / `getFollowUpMessages`；`:209,217` 分别调用 |
| 接线 | `core/agent/agent.ts:168-169` `getSteeringMessages: () => this.steeringQueue.drain()` |
| 公共 API | `core/agent/agent.ts:114` `steer()`、`:118` `followUp()`、`:106` `setQueueMode()` |
| 回合层 | `turn/session.ts:218-227` `steer()` / `followUp()` 同时压入本地数组与 `core` |
| 交互层 | `cli/interactive/interactiveMode.ts:382-388` 按 `disposition` 分流：命令**不**参与 steer（注释明确「A command is never steered」），消息按 `disposition === "steer"` 分流 |
| CLI 入口 | `entrypoints/cliRuntimeInvocation.ts:137-151` 缓冲的 steer/follow-up 在回合启动后重放 |

**真正的剩余缺口**：`steeringMode` / `followUpMode` **只能取默认值**——`agent.ts:16-17` 声明了这两个选项，但全仓**无任何调用点传入**（`grep -rn "steeringMode\|followUpMode" packages/ts-shell/src --include='*.ts' | grep -v test` → 仅 `agent.ts` 自身 4 处）。`config/runtimeConfig.ts` 也没有对应字段。

**证据（pi）**：`docs/settings.md` 的 `steeringMode` / `followUpMode` 是**用户可设**的 `"all"` / `"one-at-a-time"`；`docs/usage.md:63-73` 描述 Enter/Alt+Enter/Escape/Alt+Up 四键语义。

**影响**：功能等价，差别是**可配置性**。用户无法把投递模式从 `one-at-a-time` 改成 `all`。

**最小改动建议**：`config/runtimeConfig.ts` 加两个字段并在 `turn/session.ts:100` 的 `AgentCore` 构造处传入。**一行接线**（连同 `03-*` §2.1 的 `getRuntimeConfig` 展开式修复一起做）。

### 2.4 Markdown 渲染：自研，覆盖面窄（置信度：中）

**证据（我们）**：`presentation/tui/transcript/markdown.ts` 188 行自研渲染器，`renderMarkdown(text, width)`（`:56`）手工处理：表格（`:61-72`，`renderTable` 列宽自适应）、围栏代码（`:73-84`，`renderFence`）、其余逐行（`renderLine`）。行内处理在 `renderInline`（`:40`）。

**证据（pi）**：`src/modes/interactive/components/markdown-transform.ts:1-20` 用 `Marked` 解析器产出 token，再经可插拔 `MarkdownTransformer[]` 渲染；`docs/extensions.md:1636` 允许扩展注册 Markdown 变换器。

**影响**：自研渲染器对嵌套列表、引用块、脚注、行内 HTML 等的覆盖未知（未逐项测试）；且**没有扩展点**——第三方无法调整渲染。

**置信度说明**：本条为**中**而非高——我确认了两侧的实现形态差异，但**未逐项测试**我们的渲染器在复杂 Markdown 上的表现。不做超出证据的断言。

### 2.5 折叠只能鼠标点，不能键盘切（置信度：高）

**证据（我们）**：

- `presentation/tui/transcript/blocks.ts:38-43` `Block.collapsed?: boolean`，注释说明「Collapsed blocks show one summary row instead of their body. Reasoning is collapsed by default」。
- 展开入口**只有指针**：`cli/interactive/pointer.ts:237-238` `if (!block || block.collapsed === undefined) return; this.context.view().transcript.setCollapsed(block, !block.collapsed)`。
- `presentation/tui/transcript/container.ts:62-63` `setCollapsed(block, collapsed)`。
- `cli/interactive/keymap.ts` 的按键集合里**没有** `ctrl+o` 或 `ctrl+t`。

**证据（pi）**：`docs/keybindings.md:163` `app.tools.expand` 默认 `ctrl+o`「Collapse or expand tool output」；`:157` `app.thinking.toggle` 默认 `ctrl+t`「Collapse or expand thinking blocks」。

**影响**：键盘用户无法展开折叠的工具输出或 reasoning。触屏/无鼠标终端下这些内容**不可达**。

**最小改动建议**：给 `keymap.ts` 加 `ctrl+o`／`ctrl+t` 两个分支，调用已有的 `transcript.setCollapsed`（对「最近一个」或「全部」块）。**API 已存在，只缺按键。**

### 2.6 编辑器：kill ring 不能循环，undo 无重做（置信度：高）

**证据（我们）**：

- `presentation/tui/editor.ts:54` `private readonly killRing: string[] = []`；`:37` `MAX_KILL_RING = 16`；`:433-441` `push` + 超限 `shift()`。
- `:246-249` `yank()` 只取 `killRing[killRing.length - 1]`——**只能粘最近一次**。全文件无 `yankPop` 或等价函数（`grep -n "yankPop\|killRingPop"` → 0）。
- `:251-258` `undo()` 从 `undoStack` 弹一层，**无 redo**（无 `redoStack`）。

**证据（pi）**：`docs/keybindings.md:69-73` `tui.editor.yank` = `ctrl+y`、`tui.editor.yankPop` = `alt+y`「Cycle through deleted text after yank」、`tui.editor.undo` = `ctrl+-`。

**影响**：连续剪切多段后只能取回最后一段；误撤销无法恢复。

**最小改动建议**：`yank()` 记录「当前在 kill ring 中的位置」，新增 `yankPop()` 沿 ring 回退；`undo()` 前把当前状态压入 redo 栈。两者都是 `editor.ts` 内的局部改动。

### 2.7 鼠标选择与复制的完整度（置信度：中）

**证据（我们）**：`presentation/tui/input/mouse.ts:1-25` 解 SGR（`CSI < b ; x ; y M|m`）与 X10 两种编码，`:14` 只请求 button-event tracking（`\x1b[?1002h`）+ SGR（`\x1b[?1006h`）；`presentation/tui/transcript/selection.ts` 做内容空间选择投影（`viewport.ts:10-12` 注释：`maps a screen row back to a content row, projects a content-space selection onto the screen, and places the scrollbar thumb`）；`cli/interactive/clipboard.ts` 统一复制出口。

**证据（pi）**：`docs/keybindings.md:76-93` 全屏模式下的完整鼠标语义——拖拽选择并复制、按住边缘自动滚动、点击 OSC 8 超链接打开、`fullscreenCopyOnSelect` 开关；`docs/terminal-setup.md` 记录各终端的鼠标/触控板差异。

**置信度说明**：本条为**中**。我们确实有选择与复制，但**未逐项对照**「边缘自动滚动」「超链接点击」「选中即复制开关」这三项。不做未验证的断言。

### 2.8 恒进 alt screen，无模式选择（置信度：高）

**证据（我们）**：`presentation/tui/render/engine.ts:114` `start()` 中无条件 `this.terminal.write(ENTER_ALT_SCREEN)`（常量定义在 `render/paint.ts:117`）。全仓无 `tuiMode` 消费点（`config/runtimeConfig.ts:86` 声明了 `tuiMode?: "regular" | "fullscreen" | "stream"` 但未被返回）。

**证据（pi）**：`docs/usage.md:255-257` 两种模式可选——`regular`（默认，主屏 + 终端自有 scrollback）与 `fullscreen`（转录在视口内滚动，编辑器/状态栏固定在底部）；`docs/settings.md` 的 `tuiMode` 可即时切换，`--tui-mode` 可单次覆盖；`fullscreenExitOutput` 控制退出时打印什么。

**影响**：我们恒定占用 alt screen，意味着**用户的终端 scrollback 里没有任何对话记录**——退出后（或崩溃后）无法向上翻阅历史输出。pi 的 `regular` 模式正是为这个场景存在的默认值。

**最小改动建议**：`tuiMode` 生效并让 `engine.start()` 按模式决定是否 `ENTER_ALT_SCREEN`。注意 `presentation/tui/terminal.ts:32` 的退出兜底（`"\x1b[?1049l"`）已能安全处理两种模式。

## 3. MISSING 详述

### 3.1 快捷键不可自定义（置信度：高）

**pi 如何实现**：`docs/keybindings.md:1-20` 所有快捷键可经 `~/.pi/agent/keybindings.json` 覆盖，用**命名空间化的 action id**（如 `tui.editor.cursorUp`、`app.model.cycleForward`、`tui.altScreen.search`）；每个 action 可绑单键或键数组；旧格式启动时自动迁移；`/reload` 即时生效；扩展作者用同一套 id。

**我们缺失的证明**：

```bash
grep -rn "keybindings.json" packages/ts-shell/src --include='*.ts'   # → 0 命中
```

`cli/interactive/keymap.ts`（375 行）是硬编码的 `MOTIONS`／`KILLS` 表与 `switch` 分支，无配置读取。

**影响**：`ctrl+z`（我们的 undo）在 Windows/WSL 与终端挂起冲突；`ctrl+q`（我们的 follow-up）在多数终端是 XON/XOFF 流控——**这两个绑定在不同平台上会失效或产生副作用，而用户无法改**。

**最小落地路径**：`keymap.ts` 的 `MOTIONS`／`KILLS` 已是数据表，把 `switch` 分支也提成「action id → handler」表即可支持覆盖。

### 3.2 无 `@` 文件引用与 Tab 路径补全（置信度：高）

**pi 如何实现**：`docs/usage.md:22-23` `@` 触发项目文件模糊查找，Tab 补全路径；`docs/usage.md:246-247` CLI 侧 `@file` 作为文件参数（`pi @prompt.md "Answer this"`、`pi @code.ts @test.ts "Review these files"`），且 `@screenshot.png` 会作为图片附件。

**我们缺失的证明**：

```bash
grep -rn 'startsWith("@")' packages/ts-shell/src/cli packages/ts-shell/src/presentation   # → 0
grep -rn "completePath\|pathCompletion" packages/ts-shell/src --include='*.ts' | grep -v test   # → 0
```

我们唯一的补全源是斜杠命令：`cli/interactive/slashSuggestions.ts:15-25` `candidates()` 只映射 `listSlashCommands()`；`COMMAND_DRAFT = /^\/[A-Za-z0-9-]*$/`（`:41`）显式**排除**非斜杠输入（注释解释 `/usr/local/bin` 不应弹菜单）。`cli/interactive/keymap.ts:186` 的 Tab 只调 `syncSuggestions`。

**影响**：用户要把文件交给模型只能手打路径或让模型自己 `read`。这是日常最高频的交互之一。

**最小落地路径**：复用 `slashSuggestions` 的 `Suggestion` 与 `matchSuggestions` 排序（`presentation/tui/chrome/suggestions.ts:11-31` 已实现分层匹配），新增一个 `@` 前缀的候选源（走 `executionService.listFilesRecursive`，**但见 `05-*` 的 glob 性能问题——应先修目录剪枝**）。

### 3.3 无外部编辑器（置信度：高）

**pi 如何实现**：`docs/usage.md:31` Ctrl+G 打开 `externalEditor` 设置指定的命令，回退顺序为 `$VISUAL` → `$EDITOR` → Windows 记事本 → `nano`；`docs/settings.md` 给出 VS Code 的 `code --wait` 配置。

**我们缺失的证明**：

```bash
grep -rni "externalEditor\|VISUAL\|\$EDITOR" packages/ts-shell/src --include='*.ts' | grep -v test   # → 0 命中
```

**影响**：长 prompt 只能在 TUI 编辑器里写，无法用熟悉的环境。

**最小落地路径**：`presentation/tui/editor.ts` 已有 `getText()`/`setText()`（`:95,100`），外部编辑只是「挂起 TUI → spawn → 读回 → 恢复」。注意 `keymap.ts` 无空闲按键可绑，需先做 §3.1。

### 3.4 无图片粘贴（置信度：高）

**pi 如何实现**：`docs/usage.md:27` Ctrl+V 粘贴图片（Windows 用 Alt+V，或拖入终端）；`docs/settings.md` 的 `terminal.showImages`／`images.autoResize`／`images.blockImages` 控制；`docs/usage.md:255` 说明 Kitty 图形协议下的内联图片行为。

**我们缺失的证明**：

- `presentation/tui/terminalCapabilities.ts:36,60` 只探测 **Kitty 键盘协议**（`supportsKittyKeyboard`），**不探测图形协议**。
- `grep -rn "kitty.*graphics\|iterm.*image\|inline.*image" packages/ts-shell/src/presentation` → 0。

**但注意**：我们**有**多模态基础设施——`model-adapters/multimodal.ts:33` `isImageFilePath`、`:50` `toAnthropicImageBlock`、`:68` `toOpenAIImageBlock`、`getImageMimeType`。**它没有任何生产消费者**：

```bash
grep -rn "multimodal" packages/ts-shell/src --include='*.ts' | grep -v "model-adapters/"   # → 0
grep -rn "isImageFilePath\|toAnthropicImageBlock" packages/ts-shell/src --include='*.ts' | grep -v test   # → 仅定义处
```

**影响**：图片输入链路**两端都有、中间断**：`multimodal.ts` 能转格式，`read` 工具不认图片（`core/tools/registry.ts:222-330` 纯文本），编辑器不接收粘贴。

**最小落地路径**：这是三处接线（编辑器接收 → 存储 → `read` 或消息附件走 `multimodal.ts`），建议独立立项。

### 3.5 无转录内搜索（置信度：高）

**pi 如何实现**：`docs/keybindings.md:114-115` `tui.altScreen.search` 默认 `ctrl+shift+f` 打开转录搜索面板，`searchNext`／`searchPrevious` 在匹配间跳转；`docs/keybindings.md:93` 面板显示可点击的前后箭头。

**我们缺失的证明**：

```bash
grep -rni "search" packages/ts-shell/src/presentation/tui/transcript/*.ts | grep -v test
# → 仅 blocks.ts:28 的注释（描述 tool card 显示 pattern）
```

**注意区分**：`presentation/tui/chrome/pager.ts:109-113` 的**全屏阅读器有过滤**（「Typing filters, which is what "search" means in a view this size: the rows that do not match are simply not shown」，实现见 `:144-146`）。但那是 `/help` 之类长输出的独立视图，**转录本身没有搜索**。

**影响**：长会话里找不到之前某条输出。

**最小落地路径**：`presentation/tui/transcript/viewport.ts` 已把「屏幕行 ↔ 内容行」映射算好（`:10-12` 注释），搜索只需在此映射上找匹配行并 `scrollTo`。

### 3.6 无 Mermaid 渲染（置信度：高）

**pi 如何实现**：`src/modes/interactive/components/mermaid.ts`（89 行）用 `grok-mermaid` 库把 ` ```mermaid ` 代码块渲染成终端图形（`render` → `Span[]`），并按主题给 border/label 上色；`:18-27` `isMermaid(token)` 判定；`:29-41` `codeSpan()` 处理反引号转义。模式可配（`docs/settings.md` 的 `markdown.mermaid`：`"off"`/`"final"`/`"streaming"`）。

**我们缺失的证明**：

```bash
grep -rli "mermaid" packages/ts-shell/src/presentation   # → 0
```

`presentation/tui/transcript/markdown.ts:73-84` 的 `renderFence(body, lang, cells)` 接收语言标签但只做语法高亮分流。

**影响**：架构图只能看到源码文本。

**最小落地路径**：`renderFence` 已是按 lang 分流的唯一入口，加一个 `lang === "mermaid"` 分支即可接入渲染库。优先级取决于用户是否常用。

## 4. OURS-ONLY（仅记录，本轮不提议开发）

| 能力 | 我们位置 | pi 是否真的没有（检索命令+结果） |
|---|---|---|
| 长粘贴占位（超过 320 字符折叠为 `[#N …]`，二次粘贴展开） | `presentation/tui/pastes.ts:14-22`（`PASTE_PLACEHOLDER_THRESHOLD`、`DOUBLE_PASTE_MS`、`PasteStore`） | pi 未记录该机制：`grep -rni "paste.*placeholder\|PasteStore" /home/wang/projects/pi/packages/coding-agent/src /home/wang/projects/pi/packages/tui/src` → 0 命中 |
| 全屏 pager 的「输入即过滤」 | `presentation/tui/chrome/pager.ts:109-113,144-146` | pi 的对应物是转录搜索面板（`docs/keybindings.md:93`），语义不同：我们是全屏阅读器内过滤，它是转录内跳转 |
| 状态栏项目可配置（`/statusline use <preset\|item...>`） | `cli/interactive/tuiSettings.ts:28,40`（`readStatusItems`/`writeStatusItems`）；`presentation/tui/chrome/items.ts` | pi 的 footer 是固定的（`docs/usage.md:15`：`working directory, session name, token/cache usage, cost, context usage, current model`），无等价配置面 |
| 分层补全排序（Exact/Prefix/Substring/Subsequence/Detail 五档） | `presentation/tui/chrome/suggestions.ts:24-30,61` | pi 未记录该分层：其补全由 `getArgumentCompletions` 提供者自行过滤（`docs/extensions.md:1584-1598`） |
| Kitty 增强键盘协议协商（含 xterm `modifyOtherKeys` 回退） | `presentation/tui/input/keyboardProtocol.ts:1-30` | pi 也支持（`docs/tui.md:33-58` 的 `Focusable`/`CURSOR_MARKER`、`docs/keybindings.md` 的 `super` 绑定），**此处为平手，非我们独有** |

> **诚实标注**：最后一行是**平手**，列在此处是为了避免把「我们也有」误报为差距。
> 前四项中，`pastes.ts` 与 `statusline` 是真实的独有能力；`pager` 过滤与补全分层是**同目的不同实现**，价值判断留给维护者。

## 5. 未能验证的项

1. **Markdown 渲染的复杂输入表现**：未用嵌套列表、引用块、脚注、行内 HTML 逐项测试我们的自研渲染器（§2.4 置信度中）。
2. **鼠标交互的细节对照**：未逐项验证「拖拽到边缘自动滚动」「OSC 8 超链接点击」「选中即复制开关」三项（§2.7 置信度中）。
3. **pi 的 TUI 实机行为**：pi 的 `node_modules` 不存在，无法启动其 TUI 做视觉对照；所有 pi 侧结论来自文档与源码。
4. **`terminalCapabilities.ts` 的探测完整性**：只确认它探测 Kitty **键盘**协议与同步输出；未验证是否遗漏了其他能力探测（如 bracketed paste）。
5. **我们 TUI 在真实终端的渲染**：本轮为静态代码分析，**未启动我们的 CLI 做视觉验证**。按 §2.4 的纪律，任何视觉结论需实机确认——本报告未做，故所有视觉类判断均以代码结构为据。
