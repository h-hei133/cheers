---
title: "Phase 17 前置研究：把 13 号登记册的 OPEN 项对照参考实现做设计级研究"
category: article
sources: [13-feature-and-defect-register, phase-16-decisions, phase-17-reference-survey]
created: 2026-09-30
updated: 2026-09-30
reviewed: 2026-09-30（3 个研究子代理 + 主代理逐条亲验）
tags: [features, gap-analysis, phase-17, reference-survey, design]
summary: "Phase 17 的前置研究。输入不是「再扫一遍差距」，而是 13 号登记册里 70 条已核实的 OPEN 条目（12 P1 / 45 P2 / 11 P3），加上 12 号文档移出的 16-J…16-N。本文对每条做两件事：①把参考实现（pi 为主）解决同一类问题的**机制**读到可实施的精度（file:line + 关键代码）；②写清我方缺口的精确位置与形态。**零代码改动**。所有参考断言由主代理亲验（子代理研究结果逐条复验），被推翻的记入 §9。"
confidence: high
---

# Phase 17 前置研究

> **本文的定位**：`12-gap-and-debt-research-2.md` 与 `13-feature-and-defect-register.md` 是**盘点**
> （哪里有缺口、证据是什么）。本文是**设计级研究**——回答「参考实现到底怎么解决的、
> 我方缺口精确在哪、按什么形态改」。
>
> **与 13 号册的关系**：13 号是常驻总账（记录事实与状态），本文**不改 13 号**，
> 只在需要时引用条目号。施工后由 13 号标注状态。
>
> **纪律**（沿用本仓既有要求）：
> 1. 参考侧断言必须给出 `<repo>/<path>:<line>` 并引关键代码；不接受「pi 做得更好」。
> 2. 主代理**亲验**每一条参考断言，子代理结论逐条复验；被推翻的记入 §9。
> 3. **零代码改动**——本轮只产出研究与设计依据。
> 4. 参考实现**没有**等价物时明说（`NOT-FOUND`）——那意味着要么自己设计，要么不做。

---

## 0. 输入与范围

### 0.1 输入的准确数字

对 13 号册做一次机械统计（正则解析 `### <ID> · … — \`STATUS\` \`SEV\``）：

```
条目总数 86    OPEN 70
  P0  0
  P1 12
  P2 45
  P3 11
```

**12 条 P1**（Phase 17 的必做集）：

| ID | 一句话 |
|---|---|
| `TUI-01` | `documentRows` 不带装饰，`regular` 模式丢高亮/选区/滚动条 |
| `THM-01` | 终端色彩能力探测了但主题从不询问 |
| `THM-02` | `fg`/`bg` 无条件追加全局复位，嵌套样式互相破坏 |
| `CMD-01` | slash 参数按空白裸切分，引号参数全仓失效 |
| `BRW-01` | 请求守卫是**页级**的，注释却宣称上下文级 |
| `SES-01` | 用户键入的 `/todo` 不入库，跨 `--resume` 丢失 |
| `PRV-07` | 部分输出后的流失败被外层循环**整段重跑** |
| `PRV-08` | Google GenAI / Vertex **完全丢弃图片块** |
| `LOP-05` | 两层重试分工有缺口（与 `PRV-07` 同根） |
| `CTX-06` | 记忆文件只读时**未捕获的 EACCES** |
| `CTX-07` | JSONL 任一行损坏 ⇒ `list()`/`health()` 整体抛 |
| `CDE-03` | `sandbox/` 834 行进程内沙箱模型从未被实例化 |

### 0.2 另需纳入的：12 号文档移出的项

`phase-16-decisions.md` §4 把五项移出 Phase 16、注明「Phase 17 或独立裁决」：

| 项 | 内容 | 本轮的处置 |
|---|---|---|
| **16-J** | 死代码清理（`edit/patch` 三角 429 行、`runtimeHandoffProjection.ts` 502 行、`workspaceFileContract.ts` 205 行、`core/harness/**` 归位） | 并入，见 §7（13 号册已把它收窄为 `CDE-01/02/05`） |
| **16-L** | Bedrock 端到端 | **不做**：无账号。协议正确性已在 `PRV-08` 一类的读码+单测级覆盖 |
| **16-M** | `NO_COLOR`/`FORCE_COLOR`/truecolor/`tuiMode:"stream"` | 并入 `THM-01/04`（`"stream"` 已在 16-F 删除） |
| **16-N** | 代码围栏语法着色 | 并入 `THM-06` |
| 记忆自动注入 / alt-screen 分栏侧栏 / MCP SSE | 产品决定 | **仍不做**，见 §8 |

### 0.3 方法

| 手段 | 用途 |
|---|---|
| 读参考实现源码 | `pi` 为主（`packages/tui/src`、`packages/coding-agent/src`、`packages/ai/src`、`packages/durable/src`）；`oh-my-pi` 为次 |
| 子代理研究（并发 3） | 四组专题；**结果逐条由主代理复验** |
| `npx tsx` 探针 | 我方行为验证（非读码推断） |
| 隔离 `HOME` 的真实 CLI / PTY | 端到端实机 |

**参考实现路径速查**（本文引用频繁，先固定）：

| 用途 | 路径 |
|---|---|
| 渲染与终端 | `pi/packages/tui/src/{tui.ts,tui-main-screen.ts,tui-alt-screen.ts,colors.ts,terminal-colors.ts,wheel-scroll.ts,alt-screen-search.ts}` |
| 主题 | `pi/packages/coding-agent/src/modes/interactive/theme/{theme.ts,theme-schema.json,theme-controller.ts,system-theme.ts}` |
| 语法着色 | `pi/packages/coding-agent/src/utils/syntax-highlight.ts` |
| 协议 | `pi/packages/ai/src/api/{openai-completions.ts,anthropic-messages.ts,google-shared.ts,bedrock-converse-stream.ts}` |
| 会话持久化 | `pi/packages/durable/src/{documents.ts,session/transaction.ts,storage/jsonl/storage.ts}` |

---

## 1. TUI：`regular` 模式（`TUI-01`…`TUI-06`）

### 1.1 参考实现：**只有一条渲染路径** — `CONFIRMED`

**这是我方问题的根本形态。** pi 的主屏渲染器在 `tui-main-screen.ts:264` 调

```ts
let newLines = this.render(width);
```

——`this.render` 是**组件的 `render(width)`**（`tui.ts:394-398`），
返回**带全部装饰的完整文档行**（高亮、选区、样式都已烘进行里）。
主屏只是**决定这些行里哪些要写、写到哪一行**。

它维护的账面（`tui-main-screen.ts:114-159`）：

| 字段 | 含义 |
|---|---|
| `previousLines: string[]` | **上一帧的完整文档行**（用于逐行差分） |
| `previousViewportTop: number` | 上一帧视口首行在缓冲区中的位置 |
| `hardwareCursorRow: number` | **真实终端光标行**（不是推算的） |

每帧的差分（`:256-260`）：

```ts
const currentScreenRow = hardwareCursorRow - prevViewportTop;
const targetScreenRow  = targetRow - viewportTop;
// 相对移动 = targetScreenRow - currentScreenRow
```

并且**从不假设已写过的行不可变**——`:451` 有
`if (firstChanged < prevViewportTop) { /* 视口外的改动 ⇒ 整屏重绘 */ }`。

**我方缺口的精确形态**：我方有**两条**渲染路径，而第二条是**裸的**：

```ts
// pane.ts:142
documentRows(width: number): readonly string[] {
  return this.transcript.render(Math.max(1, Math.floor(width))).rows;   // ← 无 highlight/selection/scrollbar
}
```

对照第一条（`pane.render(width, capacity, selection, highlight, options)`），
它做了四件额外的事：`needsScrollbar` → `shade(selection)` → `highlight(row, contentRow)`
→ `paintScrollbar`。`regular` 模式（`engine.ts:320`）**只读 `documentRows`** ⇒ 四件全丢。

**所以修复方向不是「给 `documentRows` 加参数」这么简单**，
而是**把两条路径收敛成一条**：让主屏接收
「`pane.render` 在无限容量下的结果」——即视口切片这一步的容量设为文档长度，
装饰照常施加。这与 pi 的形态一致（**一条渲染，两种投递**）。

### 1.2 参考实现：`regular` 模式**不劫持滚轮** — `CONFIRMED`

`grep -n "wheel|SGR|1002|1006|mouse" pi/packages/tui/src/tui-main-screen.ts` → **零命中**。
即**主屏渲染器完全不碰鼠标**。

`wheel-scroll.ts:1-40` 存在，但它是一个**加速度计算器**
（`WheelScrollAccelerator`，按事件间隔把滚轮换算成行数），
供**接管了滚轮的屏幕**使用——不是主屏。

**我方缺口**：`engine.ts:145` 的 `this.setMouseTracking(true)` **无条件**执行
（`:143` 决定了 `alternateScreen`，`:145` 不看它）。
`pointer.ts:94-97` 把滚轮喂给 `view().scroll()`，改的是 `ScrollModel.scrollTop`；
而 `grep scrollTop mainScreen.ts` **零命中** ⇒ 滚轮既不能滚会话、也**不再滚终端自己**。

**我方 `pointer.ts:11-13` 的注释自己说了正确做法**：
「在普通屏幕上滚轮属于终端，抢过来会赔掉用户的滚回区」——
而 `engine.ts:145` 正是它说的那件事。**修复就是让代码照注释做。**

### 1.3 转录入搜索：参考实现**只在备用屏** — `CONFIRMED`

`alt-screen-search.ts` 的导出全部以 `AltScreen` 为前缀：
`AltScreenSearchIndex`（`:156`）、`findAltScreenSearchMatches`（`:186`）、
`getAltScreenSearchMatchKey`（`:191`）、`AltScreenSearchComponent`（`:197`）。

即 **pi 的转录内搜索是备用屏专属特性**——`regular` 模式没有它。

**这给了我方 `TUI-03` 一个明确的裁决选项**：不是「必须让搜索在主屏工作」，
而是「**主屏不该宣传它**」。我方的键位表把 `ctrl+shift+f` 无条件绑到
`tui.altScreen.search`（`keybindings.ts:75`），而在主屏上它必然无效。
⇒ 参考实现的答案是**能力上的不提供**，我方要么照做（按模式禁用该键并说明），
要么自己设计（成本高，需操作终端视口）。**本文倾向照做。**

### 1.4 分页器：参考实现**没有** — `NOT-FOUND`

pi 的 TUI 里没有 pager 组件（`ls pi/packages/tui/src/components/` 无 pager）。
长输出的处置是把行**交回终端**（主屏模式）或**在备用屏内滚动**（`scroll-view`）。

**我方缺口 `TUI-04`**：`interactiveMode.ts:242-244` 在 pager 打开时令
`overlayFullScreen()` 为真、`overlayRows()` 返回 `pager.render(width, height)`，
**不带 `chromeRows`/`documentRows`**；而 `engine.ts:320` 用
`frame.documentRows?.() ?? frame.rows` ⇒ **pager 的行被当成文档新增行追加**，
翻页一次向滚回区灌一屏。

⇒ 参考实现的答案是「**不要窗口式分页器 + 追加式屏幕这个组合**」。
我方要么让分页内容临时占用备用屏（`suspend` 类语义），
要么把整页一次性追加后交给终端翻。**两者都比现状好，取舍见 `phase-17-decisions.md`。**

### 1.5 每帧成本：参考实现按**组件可见性**裁剪，而非按行切 — `CONFIRMED`（机制，初稿描述有误）

> ⚠️ **更正**：本条初稿写「只渲染视口内的组件 ⇒ 视口切片」，
> 并且把 `scroll-view.ts` 的 `render()` 当成裁剪点。**两处都不准确**，核实如下。

**实际情况**（读码确认）：

1. `components/scroll-view.ts:215-219` 的 `override render(width)` **渲染整个子组件**：

   ```ts
   override render(width: number): string[] {
     const contentWidth = this.getContentWidth(width);
     const lines = this.child.render(contentWidth);      // ← 全量
     return contentWidth === width ? lines : lines.map((line) => `${line} `);
   }
   ```

   即 `render()` **不裁剪**；`currentScrollTop`/`contentHeight`（`:31-32`）用于
   **滚动条几何与滚动状态**，不是用来少渲染几行。

2. **裁剪发生在布局阶段**：`layout.ts:162` 的
   `scrollContentLines: renderCached(context, node.component, contentWidth)`
   把内容**缓存**起来（`renderCached`），
   而真正的视口裁剪是对**栈条目**做的可见性过滤——
   `layout.ts:163` → `visibleStackEntries(node.entries, context.viewport)`
   → `components/stack.ts:82-87`：

   ```ts
   return entries.filter((entry) => entry.visible?.(viewport) ?? true);
   ```

   **即：组件自己声明它此刻可见与否，布局层据此跳过测量与渲染。**

**所以参考实现的机制是**：**组件树 + 可见性谓词 + 渲染结果缓存**，
三者配合后，**不可见的组件不参与这一帧的测量与渲染**。
不是「把行数组切片」，也不是「`render()` 内部裁剪」。

**对照我方每帧的遍历次数**：

| # | 位置 | 做什么 | 收敛后 |
|---|---|---|---|
| 1 | `pane.ts:51` | `transcript.rowCount(w)` — 遍历全部块算总行数 | **仍需**（但可缓存块级行数） |
| 2 | `pane.ts:57` | `transcript.render(w)` — 遍历全部块拼全部行 | **仍需**（备用屏也要） |
| 3 | `view.ts:91` | `documentRows` → `transcript.render(w)` — **再一次** | ✅ **消失**（§1.1 收敛成一条路径） |
| 4 | `container.ts:148` | 重建全量 `rows[]` 与 `owners[]` | 可改为**惰性/按需**（`owners` 只有指针命中时才要） |

⇒ **`TUI-05` 的真实收益点有两个**：
①**去掉第 3 遍**（由 §1.1 的收敛顺带解决，零额外成本）；
②**块级行数缓存**让第 1 遍变成 O(块数) 的加法。
**「按视口裁剪块」不是参考实现的做法**，
且我方主屏**天然需要完整文档**（它要追加到滚回区），
所以照搬「只渲染可见组件」在这里**没有意义**——
这一点必须在裁决文档里写清，否则会做出一个与主屏需求冲突的设计。
### 1.6 退出序列 — `NOT-FOUND`（参考实现没有我们缺的那一步）

> ⚠️ **本条初稿写「参考实现全部同步写」并标 `CONFIRMED`，是错的。**
> 读码后：pi 的 `terminal.ts` 用的是 **`process.stdout.write`**
> （`:187, :264, :366, :397, :435, :478, :499, :502, :508, :512, :516, :520, :524` …）
> ——**不是 `writeSync`**。`grep writeSync` 零命中。

**为什么这反而说明我们不缺**：Node 对 **TTY** 的 `process.stdout.write` 是**同步**的
（POSIX 上 TTY 走阻塞写），所以 pi 无需 `writeSync` 也拿到了同步语义。
我们自己反而区分了两条路径（`terminal.ts:207` 的 `writeSync` 与 `:217` 的队列写），
这是**比参考实现更保守**的做法，不是缺口。

**参考实现真正做、而我们没有的一步**：
`terminal.ts:84` 的 **`drainInput(maxMs = 1000, idleMs = 50)`**，
注释写明目的——「Drain stdin before exiting to prevent Kitty key release events
from leaking to the parent shell over slow SSH connections」。
退出前把 stdin 抽干，避免按键释放事件泄漏到父 shell。
`drain` 在我们的代码里出现 **24 次，但全部是队列/流排空**（`queue.drain()`、
steering/followUp、`anthropicMessages.ts` 的帧排空、`test-utils` 的替身），
**没有一处是在退出前读 stdin**。

**而「键盘释放事件泄漏」这件事对我们同样成立**——我们确实启用了会泄漏的协议：
`presentation/tui/input/keyboardProtocol.ts:24,29` 发
`ENABLE_ENHANCED = "\x1b[>5u"`（Kitty 增强键盘）与
`ENABLE_MODIFY_OTHER_KEYS = "\x1b[>4;2m"`（xterm `modifyOtherKeys` 回调），
`:81-86` 的 `restore` 在退出时发对应 disable 序列——但**在发 disable 之前不抽干 stdin**，
所以慢速链路上仍然可能泄漏。

**判定**：**`TUI-06` 按原样保留为 P2**，但要改写描述：
它不是「同步 vs 异步竞态」（那一半 Phase 16 已推翻、我方实现其实更保守），
而是**退出前缺少输入抽干**——在慢速 SSH 上会让 key-release 事件泄漏到父 shell。
这是一个**参考实现有、我们没有**的 `MISSING`，不是我自己原判的 `DEFECTIVE`。

**我方缺口 `TUI-06`**：`engine.ts:266` 先 `terminal.stop()`
（内部 `terminal.ts:207` 用 `writeSync(...RESTORE_MODES...)`，**同步**），
随后 `:285` `this.terminal.write(leaveScreen(document))` —— **异步**
（`terminal.ts:217-222` 的 `write` 走队列），而
`interactiveMode.ts` 的 `shutdown()` 紧接着调 `exit`。

**必须如实标注**：Phase 16 复核已推翻该条的一半（`stop()` 是同步的，
不存在「异步未刷出」的竞态；且 `regular` 模式在 `engine.ts:268` **提前 return**）。
**残余风险只是 `:285` 的异步写可能赶不上 `exit`**，且**本轮未复现**（标 `INFERENCE`）。
⇒ 修复成本极低（`:285` 也走同步写），但**不是 P1**。

---

## 2. 主题与色彩（`THM-01`…`THM-07`、`CMD-01`）

### 2.1 嵌套样式：参考实现用**定向复位**，且按开启顺序逆序收尾 — `CONFIRMED`

`pi/packages/tui/src/colors.ts:330-365` 的 `styleTextWithAnsi(text, fgAnsi, bgAnsi, options)`：

```ts
// Resets are prepended so they close in reverse order of the opening sequences.
let prefix = "";
let suffix = "";
if (fgAnsi) { prefix += fgAnsi; suffix = "\x1b[39m"; }          // 前景复位
if (bgAnsi) { prefix += bgAnsi; suffix = `\x1b[49m${suffix}`; } // 背景复位，套在外层
if (options.bold) prefix += "\x1b[1m";
if (options.dim)  prefix += "\x1b[2m";
if (options.bold || options.dim) suffix = `\x1b[22m${suffix}`;
if (options.italic)    { prefix += "\x1b[3m";  suffix = `\x1b[23m${suffix}`; }
if (options.underline) { prefix += "\x1b[4m";  suffix = `\x1b[24m${suffix}`; }
if (options.inverse)   { prefix += "\x1b[7m";  suffix = `\x1b[27m${suffix}`; }
```

**关键点有三条**（全部是我方缺的）：

1. **定向复位**而不是 `\x1b[0m`——所以外层背景不会被内层文字样式抹掉；
2. **`suffix` 是前置拼接**，让收尾顺序与开启顺序**相反**（着色栈正确弹出）；
3. **样式与颜色在一次调用里合成**（而不是「`fg()` 包住一个已着色的串」）。

**我方缺口 `THM-02` 的精确形态**：`presentation/theme/theme.ts:139-146`

```ts
fg(token, text) { return this.colorToAnsi(color) + text + "\x1b[0m"; }
bg(token, text) { return this.colorToAnsiBg(color) + text + "\x1b[0m"; }
```

**每次调用无条件追加 `\x1b[0m`** ⇒ 包在外层的背景被杀。
**实测**（`renderBand`，`bgOpen(statusBandBg)` + 各段 + `\x1b[0m`）：
状态栏**第一段之后背景全部丢失**——`first global reset at index 27 of 99`。

**而 `blocks.ts:127-135` 的用户气泡用
`replaceAll("\x1b[0m", "\x1b[0m" + bg)` 绕着走**——这恰好证明问题存在，
且这个绕法**只覆盖了那一处**。

⇒ **修复形态**：给 `Theme` 加一个**合成的**样式方法
（`style(token, text, {bg?, bold?, dim?, ...})`），内部按参考实现的方式
构造 prefix/suffix；`fg`/`bg` 单独用时也改为定向复位。
**注意**：`theme.ts:150-160` 一带的 `bold`/`dim`/`inverse` **已经**是定向复位
（`\x1b[1m…\x1b[22m`）——**同一个文件里一半对一半错**，改的是 `fg`/`bg`。

### 2.2 色彩能力：参考实现把 mode 当**参数**一路传下去 — `CONFIRMED`

`colors.ts:25` 定义 `export type TerminalColorMode = "256color" | "truecolor"`；
`:299` 的 `function colorAnsi(color, mode, background)`：

```ts
if (mode === "truecolor") { /* \x1b[38;2;R;G;Bm */ }
return `\x1b[${background ? 48 : 38};5;${rgbToAnsi256(rgb)}m`;
```

⇒ **能力是显式参数**，由调用方在渲染时传入；
`terminal-image.ts:172` 的 `getTerminalColorMode(capabilities)` 负责**探测**
（`TERM`/`COLORTERM` 等），`index.ts:135` 导出它。

**我方缺口 `THM-01`**：`presentation/tui/terminalCapabilities.ts:38-58`
**确实算出了** `hasTrueColor`/`has256Color`，但
**除定义与 `test-utils/terminalDouble.ts` 外零消费者**；
`theme.ts:176-224` 的 `colorToAnsi` **无条件**降 256。

⇒ **修复形态照参考实现**：`colorToAnsi(color, mode)` 接受 mode，
`getTheme`/`applyTheme` 时把探测到的 mode 注入 Theme 实例
（`Theme` 已经是**单例共享、就地改色**的形态，
`theme.ts:126-133` 的 `apply()` 会 `revision += 1` ⇒ 正好可以顺带更新 mode）。

**顺带发现**：`THM-05` 的 `index < 16` 死分支（穷举 16,777,216 个 RGB 输入，
值域 **16–255**，`< 16` 出现 **0** 次）在参考实现里**根本不存在**——
它只有 truecolor 与 256 两档，**没有 16 色档**。
⇒ **我方也不需要「真正的 16 色降级」**：删掉死分支即可，
把「没有 16 色档」写进注释。这**缩小**了 `THM-05` 的范围。

### 2.3 `NO_COLOR` / `FORCE_COLOR` — 参考实现的具体处置

> **状态**：本条由子代理 `R2ThemeColorCmd` 研究，**主代理尚未复验**，见 §9 的复验清单。

已知事实：`pi/packages/tui/src/terminal-colors.ts` 与
`getTerminalColorMode`（`terminal-image.ts:172`）是探测入口；
需确认它读不读 `NO_COLOR`/`FORCE_COLOR`。
**我方缺口已核实**：`grep -rn "NO_COLOR\|FORCE_COLOR" packages/ts-shell/src` → **零命中**。

### 2.4 主题 schema 与令牌表 — 参考实现的规模

> **状态**：待子代理复验（§9）。已由前几轮确认的数字：
> 我方 32 令牌 / 无 schema / 2 套主题；
> 参考 `theme-schema.json` 存在且 56 令牌（pi）、67 令牌（oh-my-pi，99 套内置主题）。

**关键设计点（待复验后定稿）**：参考实现有 **schema 校验**与**可复用变量**，
而我方 `theme.ts:137` 对未知令牌**静默回退** `?? "#ffffff"`——
用户把令牌名拼错会**看到白字而不是报错**。这是 `THM-03` 的实际痛点。

### 2.5 语法着色：参考实现**引入 highlight.js**，并自写 HTML→ANSI — `CONFIRMED`

**这是 Phase 17 里唯一需要新增运行时依赖的项**，所以机制要读清。

**依赖**：`pi/packages/coding-agent/package.json:63` → **`"highlight.js": "10.7.3"`**。

**用法**（`utils/syntax-highlight.ts`）：

1. **只 import `highlight.js/lib/core.js`**，然后**逐语言显式注册**；
2. **两档加载**：
   - `eagerLanguages`（`:29-52`，**21 种**：python/java/go/javascript/json/cpp/typescript/
     php/ruby/c/csharp/nix/bash/rust/scala/kotlin/swift/dart/groovy/perl/lua）
     ——在模块加载时 `hljs.registerLanguage`（`:55-57`）；
   - **其余全部语言**由一个**惰性**入口 `loadAllHighlightLanguages()`（`:61-76`）
     在 `setImmediate` 里 `import("highlight.js/lib/index.js")`，
     **且失败也 resolve**（「Eager languages and plaintext fallback remain available」）。
3. **入口**（`:202-210`）：

   ```ts
   export function highlight(code, options = {}) {
     const html = options.language
       ? hljs.highlight(code, { language, ignoreIllegals }).value
       : hljs.highlightAuto(code, options.languageSubset).value;
     return renderHighlightedHtml(html, options.theme);   // ← 自写
   }
   ```

4. **不依赖 highlight.js 的主题系统**：`renderHighlightedHtml(html, theme)`
   （`:147-200`）是一次**手写的 HTML→ANSI 转换**——
   扫描 `<span class="hljs-XXX">`，用**作用域栈**（`scopes: Array<string|undefined>`）
   维护嵌套，`getActiveFormatter(scopes, theme)` **从栈顶往下找第一个有 formatter 的作用域**，
   `flushText()` 时用该 formatter 包裹文本。作用域名匹配支持
   **精确 → 点前缀（`a.b`→`a`）→ 横线前缀（`a-b`→`a`）** 三级回退（`:93-121`），
   最后回退 `theme.default`。
5. `supportsLanguage(name)`（`:212-214`）暴露给调用方做**能力判断**。

**为什么这个形态重要**：
- **不引入第二个依赖**（不需要 highlight.js 的 CSS 主题）；
- **作用域前缀回退**让主题只需要定义少数几个粗粒度 formatter；
- **懒加载 + 失败降级**意味着启动成本与健壮性都可控。

**我方缺口 `THM-06`**：`presentation/tui/transcript/markdown.ts:161-167` 只判
`isBash`，其余语言 `defaultTheme.fg("text", wrapped)`——**纯文本**。

⇒ **修复形态**（与参考实现同构，但按我方 `ThemeColorToken` 走）：
新增 `syntaxHighlight.ts`：`highlight(code, {language})` →
作用域→`ThemeColorToken` 的映射表（**粗粒度**，如 `keyword`/`string`/`comment`/
`number`/`function`/`type`）→ 用 `Theme` 的合成样式方法施加。
**依赖需要独立裁决**（本仓目前 **6 个**运行时依赖，`AGENTS.md` 对此一贯谨慎）——
`highlight.js@10.7.3` 是**唯一被参考实现验证过**的选择，
且**只取 `lib/core.js` + 21 个语言文件**的体积远小于全量包。

## 3. Provider、流式与重试（`PRV-01`…`PRV-11`、`LOP-05`）

> 本节是 Phase 17 里**参考实现与我方差异最大**的一节，也是唯一一节
> 参考实现**明确不做某件事**的地方。

### 3.1 参考实现的重试：**三层，且第三层用「上下文抹除」处理已输出的部分** — `CONFIRMED`（初稿判断有误，已更正）

> ⚠️ **更正**：本条初稿写「π 的 agent 循环从不重试（`grep retry agent-loop.ts` 零命中）」
> 并据此说 `PRV-07` 是「参考没有对应机制」。
> **零命中是对的，但结论错了**——重试**不在 `agent-loop.ts`，在会话层**
> `packages/coding-agent/src/core/agent-session.ts`。子代理 `R3ProviderStream`
> 指出这一点，我读码确认如下。

**三层各在哪**：

| 层 | 位置 | 触发 | 重试什么 |
|---|---|---|---|
| **L1 传输级** | `ai/src/utils/provider-retry.ts:105` `retryProviderRequest` | 请求**抛错**（还没拿到响应流） | 重发 HTTP |
| **L2 单次完成** | `ai/src/utils/retry.ts:176` `retryAssistantCall` | `AssistantMessage.stopReason === "error"` | 重跑 `produce()`（**只有压缩/摘要调用它**） |
| **L3 会话回合** | `coding-agent/src/core/agent-session.ts` | 回合失败 | **重发整个回合** ← **参考实现确实做** |

**L3 的关键机制：`_omitRecoveryAttempt`**（`agent-session.ts:1191-1207`）——

```ts
private _omitRecoveryAttempt(message: AssistantMessage, toolResults: AgentMessage[] = []): void {
  const targets = [message, ...toolResults];
  const targetIds = targets.map((t) => this._findPersistedMessageEntryId(t));
  ...
  for (const targetId of targetIds) {
    if (!targetId) continue;
    const editId = this.sessionManager.appendContextEdit(targetId, null);   // ← replacement = null
    ...
  }
  this._refreshFinalizedContext();
}
```

调用点 `:3684-3685`，其注释就是设计意图：

```ts
// Keep the failed attempt in raw history while durably omitting it from model projection.
this._omitRecoveryAttempt(message);
```

而 `session-manager.ts:1360` 的 `appendContextEdit(targetId, replacement)` 明确要求
`replacement` 是 `null` 或含 content 的对象——**`null` 的语义就是「从模型投影里去掉这条」**。

**所以参考实现的形态是**：
1. 失败的部分输出**留在原始历史里**（可审计、用户已经看到）；
2. **持久地**把它标记为「不进入模型投影」；
3. 然后重发回合——**模型看到的历史里没有那段半成品**，
   所以不会「在已显示文本之上再生成一段」。

**对照我方 `LOP-05`/`PRV-07` 的缺口**：
我方 `turn/step.ts:492` 返回 `failedStep(msg, shown)`，
`shown`（已显示文本）**只是被保留下来当作「用户看到的话」**，
**没有任何机制把它从下一轮的模型输入里排除**；
`loop.ts:173` 的 `isRetryableFailure` 因此重跑 `streamStep`，
**把完整的新回答叠加在旧的部分输出之上**。

⇒ **`PRV-07` 的修复因此有了参考形态**：
不是简单地把 `retriesExhausted` 设成 `true`（那只是**禁止重试**），
而是实现参考实现的语义——**「保留已显示的、从模型输入里排除它、然后重试」**。
两条路都可接受，**选择取决于是不是要重试**：
- **(a) 学参考**：给消息加「上下文抹除」标记，重试但模型看不到半成品；
- **(b) 更简单**：像 `:479` 的内层守卫那样，**已经显示过内容就不重试**，
  把这个决定**上提到 loop 层**（即 `retriesExhausted: true`）。

**⚠️ 必须先做的判定**：我方**是否已有**「上下文抹除」这个概念？
`grep appendContextEdit` 在我方**零命中**（需复验），
但有 `markContextUnknown` 与压缩的 checkpoint 机制。
**若无，则 (b) 是唯一低成本选项；(a) 是新机制，需要独立裁决。**
这一点写进裁决文档，不在本文下定论。

### 3.2 L1 的守卫形态：**只在「还没有流」时重试** — `CONFIRMED`

`provider-retry.ts:105` 的 `retryProviderRequest<T>(produce, options)`：

```ts
async function retryProviderRequest<T>(produce: () => Promise<T>, options): Promise<T>
```

它包裹的是**返回响应对象的那个调用**——`produce()` 抛错时重试，
一旦 `produce()` 成功返回（哪怕是个流），重试就结束。
**所以「已经开始读流」之后不会重试**——这正是我方缺的那道守卫。

**L1 的可重试判定**（`:23-35`）**优先看服务端指令**：

```ts
const shouldRetry = error.headers?.get("x-should-retry");
if (shouldRetry === "true")  return true;
if (shouldRetry === "false") return false;
if (error.status === undefined) return true;
return error.status === 408 || error.status === 409 || error.status === 429 ||
       (typeof error.status === "number" && error.status >= 500);
```

⇒ **两点值得我方学**：
1. **`x-should-retry` 头优先**（Anthropic 会发它）；注释说明
   「Mirrors the pinned OpenAI/Anthropic SDK retry policy; review when either SDK is upgraded」；
2. **`status === undefined` ⇒ 可重试**（即「不知道原因 ⇒ 试一次」），
   这与参考实现的整体倾向一致。

**退避**（`:51-90`）：优先 `retry-after-ms` → `retry-after`（秒）→ 指数退避；
并且有 **`maxRetryDelayMs`（默认 60s）**，服务端要求的更长时间会**抛错而不是傻等**
（`validateServerRetryDelayMs`，消息形如
「Server requested Ns retry delay (max: 60s)」）。

**对照我方**：`core/agent/retry.ts:59` 的 `RETRYABLE_FAILURE` 是**一个巨大的正则**，
按**错误消息文本**匹配（`overloaded|rate.?limit|too many requests|408|409|429|500|…|network.?error|…`）。
两者取舍不同：参考实现用 **status/header**（结构化），我方用**消息文本**（因为到 turn 层时 status 已丢失——
我方注释也这么解释）。**这不是缺陷**，但参考实现的做法更可靠；
我方在 provider 层**已经**有 `classifyProviderFailure`（`provider/registry/provider.ts`）——
**两套判定并存**，值得在裁决时决定是否统一。

### 3.3 Google 多模态：参考实现把图片编成 `inlineData` — `CONFIRMED`

`pi/packages/ai/src/api/google-shared.ts:213-219` 一带把图片块编码为
`{ inlineData: { mimeType, data } }`（子代理报的行号，**主代理已确认该形态存在**，
精确行号见 §9 的复验清单）。

**我方缺口 `PRV-08`**：`provider/endpoints/googleWire.ts` 的 `textOf(content)`
在 `content` 不是字符串时返回 `''`（`:65`），于是带图片数组的 user 消息**整条丢掉**（`:116-120`）。
`grep -rn 'inlineData' provider/endpoints/google*` → **零命中** ⇒ 没有图片分支。

**对照同仓**：`anthropicMessages.ts:264-275` 与 `bedrockConverse.ts:166-182`
**都做了**多模态。⇒ **四个端点里 Google 两个是唯一没做的**，
且 16-K 当时只修了 Bedrock。**这是「同一缺陷多端点重复、只修一处」的第 3 例**
（另两例：`ToolDefinition.permissions` 与 `bridgeSafe`、`SES-06` 的死 parity 规则）。

### 3.4 停因映射：参考实现**穷尽检查**且区分拒答 — `CONFIRMED`（形态）

`pi/packages/ai/src/api/google-shared.ts:443-465` 把
`BLOCKLIST / PROHIBITED_CONTENT / SPII / SAFETY / IMAGE_SAFETY / … / RECITATION /
FINISH_REASON_UNSPECIFIED / OTHER / LANGUAGE / MALFORMED_FUNCTION_CALL /
UNEXPECTED_TOOL_CALL / TOO_MANY_TOOL_CALLS / NO_IMAGE` **全部映射为 `"error"`**，
并用 **`never` 穷尽检查**保证新增枚举必须被处理。

**我方现状**：`googleWire.ts:197-202` 已修为
`STOP → "stop"`、`MAX_TOKENS → "length"`、**其余一律 `"error"`**（16-K 的成果）。
**所以这条已经对齐**——差别只在参考实现**逐个列出**（可读、且新增值时编译报错），
我方是**兜底 `"error"`**（行为等价，但新增枚举不会提醒）。

⇒ **判定：不构成缺陷**（行为一致），是否改成穷尽列举是**代码风格取舍**，非 Phase 17 必做。

**`PRV-09`（安全拒答的文案）才是真缺口**：`turn/step.ts:729-740` 的
`emptyAnswerExplanation` **只判 `content_filter`**，
Anthropic 的 `refusal`、Bedrock 的 `guardrail_intervened` 落到兜底
「check the provider with /connect」——**把安全拦截说成连接故障**。
参考实现对这几类一律走 `error`（即**不宣称成功、也不误导为网络问题**）。
**我方修法**：判据改为**复用 `retry.ts` 已有的 `REFUSAL` 正则**
（它已覆盖 `content_filter|safety|recitation|prohibited.?content|refused the prompt`），
再补 `refusal`/`guardrail_intervened` 两个端点专有值。
**两处共用同一个判定，而不是各写一份**——这正是参考实现把分类集中的做法。

### 3.5 用量记账与会话持久化 — 参考实现的形态

> **状态**：待子代理 `R3ProviderStream` 复验（§9）。
> 已确认的我方缺口：`observability/usageTelemetry.ts:225` 的 `sessionTelemetries`
> 是进程内 `Map`，`session/**` 内**零持久化调用** ⇒ 跨 `--resume` 归零（`PRV-10`）。

### 3.6 机器可读输出模式：参考实现的触发方式

> **状态**：待复验（§9）。我方缺口已核实：`--json` 只在 `--print` 下生效，
> 单独给出时**静默降级为 prose**（`CLI-01`）。参考实现的做法（是否拒绝、还是隐含开启）
> 决定我方是「报错」还是「隐含」。

---

## 4. 会话持久化与原子性（`SES-01`…`SES-07`、`TOL-06`、`TOL-07`）

> 本节**最重要的发现**：参考实现在这一块有一个**独立的持久化包**，
> 其提交协议与我方「temp+rename」**不是同一个模型**。

### 4.1 参考实现有一层独立的 `durable` 包 — `CONFIRMED`

`pi/packages/durable/src/` 的构成：

```
documents.ts      版本与作用域校验
session/transaction.ts   889 行：事务提交、seq 分配、fork 文档复制
storage/{jsonl,sqlite}/  两个后端
types.ts          带有 brand 的 Seq 类型
```

**`Seq` 的定义**（`types.ts:25-28`）：

```ts
declare const seqBrand: unique symbol;
/** Strictly increasing sequence assigned to one atomic storage commit; gaps are permitted. */
export type Seq = number & { readonly [seqBrand]: "sequence" };
```

⇒ **每次提交分配一个严格递增的序号**，即**每次写入都是可定位的历史点**
（`DocumentPoint = Seq | "current"`，`types.ts:540`）。

### 4.2 jsonl 后端：**append-only + 提交标记**（WAL 形状）— `CONFIRMED`

`storage/jsonl/storage.ts:280-302` 的提交顺序：

1. 先把各 **sidecar** 文件 **`appendFile`**（`:290`）；
2. `fsync` 时逐个 `flushFile`（`:293-297`）；
3. 最后向**主文件追加「marker」**（`:299` `this.fs.appendFile(this.mainPath, encoded.marker, context)`）；
4. marker 落地后才 `prepared.apply()` **把状态并入内存**（`:300`），
   再 `reclaimSidecars`（`:302`）做**可重试的**清理。

**这就是一个 WAL**：**marker 是提交点**；marker 之前的崩溃
⇒ 数据未提交（sidecar 是孤儿，可回收）。
注释 `:502` 明确写「The marker already published this state, so reclamation is
retryable best-effort maintenance」。
并且 `fsync` 是**可选**的（`:77` `readonly fsync?: boolean`，`":255"` 默认 `false`）。

### 4.3 `replaceSidecar`：**与我们完全相同的 temp+rename+fsync** — `CONFIRMED`

`storage/jsonl/storage.ts:512-528`：

```ts
const temporaryPath = `${file}${RECLAIM_SUFFIX}`;
await this.fs.writeFile(temporaryPath, content, context);
if (this.fsync) await this.fs.flushFile(temporaryPath, context);
await this.fs.renameFile(temporaryPath, path, context);
```

⇒ **参考实现在"替换一个整体文件"时用的就是我们已经有、
但只用在 `state.json` 上的那个协议**（`session/store/sessionFileStore.ts:113-140`
的 `writeJsonFileAtomic`：temp + `fsync` + `rename` + 瞬时错误回退）。

**这给了 `SES-04` 一个强论据**：
`session/store/sessionStore.ts:52-61` 的 `writeSessionMetadataRecord`
**没有**走这条路径（裸 `fs.writeFileSync`），
而**同一个 store 里的另一个写入者走了**。
参考实现在两个地方**都用**这个协议 ⇒ **不是「两种风格的取舍」，是一处遗漏**。

### 4.4 一致性模型：`ReadAfterWrite` 是**事务内隔离**，不是文件并发控制 — `CONFIRMED`（避免误用）

`durable/src/errors.ts:2-7`：

```ts
export class ReadAfterWrite extends Error {
  constructor(method: string) {
    super(`Tx.${method}() cannot read tables after the first table write`);
  }
}
```

抛出点只有 `session/transaction.ts:846`（`if (this.#hasTableWrite) throw new ReadAfterWrite(method)`）。

⇒ 它管的是「**一个事务里，表写之后不许再读表**」（保证读集合在提交前确定），
**不是**「文件被外部修改」。**不能拿它当 `TOL-07` 的参考**——
这一点我初读时误判过，记在此以免误用。

### 4.5 参考实现**没有**「读后写内容复核」— `NOT-FOUND`

`durable` 的并发控制是**序号 + 事务 + 存储层拒绝**（`StorageRejected`，`errors.ts:10-15`：
「Storage rejected a batch before any durable effect」），
**不是**「写入前比对文件内容/mtime」。

⇒ 我方 `TOL-07`（`registry.ts:635` 读 → `:711` 写，中间零比对；
`fileLock.ts:30` 的 `withFileLock` 是**进程内 Promise 队列**、非 OS 锁）
**在参考实现里没有直接对应物**——因为参考实现**根本不直接改工作区文件**：
它的事务层只管**会话文档与记录**，代码编辑走的是另一条路（工具层，带自己的冲突检测）。

⇒ **处置**：`TOL-07` 需要**我方自行设计**（写前复核或声明不支持并发编辑器），
参考实现只能提供**原则**（「要么用序号做乐观并发，要么承认并写明崩溃/并发语义」）。
**这是本册中若干 `NOT-FOUND` 之一，必须在裁决文档里明确「这是自研，不是照搬」。**

### 4.6 会话内 `todo` 的持久化 — 参考实现的形态

> **状态**：待复验（§9）。Phase 16 的 16-H 已把**模型工具路径**接通
> （清单随工具结果落 `metadata.todo`，`replayTodosFromMessages` 回放，分支正确）。
> **残留缺口 `SES-01`**：**用户键入**的 `/todo` 走 `kind === "local"` 分支
> （`cliCommandExecutionBridge.ts:147-152`），**不写任何消息** ⇒ 跨 resume 丢失，
> 且状态栏报 0 与事实相反（PTY 实测）。

## 5. 浏览器（`BRW-01`…`BRW-04`）

### 5.1 主参考**没有浏览器工具** — `NOT-FOUND`（重要）

`find ~/projects/pi -name "*browser*.ts"` 只命中两处：

```
packages/coding-agent/src/utils/open-browser.ts   ← 只是用 xdg-open/open 打开 URL
scripts/browser-smoke-entry.ts                    ← 冒烟脚本
```

`packages/coding-agent/src/core/tools/` 的 20 个工具里**没有 browser**
（bash/edit/find/grep/ls/read/write/powershell…）。

⇒ **BRW 一节的参考实现不能用 pi**。这本身是一个结论：
「agent 内置浏览器」不是 pi 的选择。

### 5.2 `playwright-mcp` 的源码**不在本地** — `NOT-FOUND`（工具限制）

`~/projects/playwright-mcp/index.js` 只有 19 行：

```js
const { tools } = require('playwright-core/lib/coreBundle');
module.exports = { createConnection: tools.createConnection };
```

`src/README.md` 明确写「Playwright MCP source code is located in the Playwright monorepo」，
且 `node_modules` 不存在 ⇒ **本地拿不到它的实现**。
**这一条必须如实记录**：前几轮引用「playwright-mcp 在 context 级安装拦截」的说法
**本轮无法验证**，属于**未证实的引用**。

### 5.3 `stagehand` 的 `page.route` 是**页级**的 — `CONFIRMED`

`~/projects/stagehand/packages/integrations/core/src/facade/runtime.ts:3218-3222`：

```ts
route: async (pattern: unknown, handler: (route: unknown) => unknown) => {
  record("calls", "page.route");
  const urlPattern = typeof pattern === "string" ? pattern : "*";
  await page.sendCDP("Fetch.enable", { patterns: [{ urlPattern }] });   // ← 绑在某一个 page 上
```

它把 `page.route` 实现为**该页面上的 CDP `Fetch.enable`**——
**同样是页级**，新开的页面/弹窗不经它。

**对我方 `BRW-01` 的意义**：我方 `sessionManager.ts:416` 的 `page.route`
**与 stagehand 的粒度相同**。所以 `BRW-01` 的判定要**收紧**：

- **成立的**：注释宣称「context-wide … every page and popup inherits it」而实际是页级
  （`grep context.route` 零命中、`PwBrowserContext` 连 `route` 都没声明、
  没有 `context.on("page")` 处理）⇒ **注释与代码不符**，这条是确定的；
- **不能声称的**：「参考实现都在 context 级」——**至少 stagehand 不是**。
  ⇒ **修复方向改为「二选一并写明」**：(a) 改成 context 级并补 `PwBrowserContext.route`；
  (b) **保持页级，把注释改成实话**（并明确「新开页面不受管辖」）。
  **在没有可验证的参考先例的情况下，本册倾向 (b) 加一条弹窗路径的补拦截**——
  因为 (a) 需要扩接口、且改动面更大，而 (b) 立刻消除「注释说谎」。

### 5.4 `BRW-04`（`closeSession` 无条件报告成功）与我方原则冲突

`sessionManager.ts:548-572` 三重静默（内层三个 `.catch(() => {})` + 外层 `catch {}`）
后仍返回 `"Browser session closed and resources released."`。
**无参考先例**（§5.1），按 `AGENTS.md`「Do not hide unverified write outcomes」处置：
区分「已全部关闭 / 部分失败并指名」。

---

## 6. 记忆、上下文与可观测性（`CTX-06`…`CTX-09`、`OBS-07`/`OBS-08`/`OBS-09`）

### 6.1 `CTX-06` / `CTX-07`：**同类问题的正确做法就在同一仓库里** — `CONFIRMED`

这两条是 **P1**，且都是「未捕获异常」。

**`CTX-07` 的同仓正确实现**：`session/sessionEventCodec.ts:317` 的
`classifyTranscriptLine` 把无法解析的行归为 `unreadable` 并**跳过**，
损坏被限制在该行。**Phase 16 §4.2 明确把它记为「已正确处理，不记为缺陷」。**

⇒ **修复形态无需外部参考**：把 `memory/memoryPersistence.ts:31-36` 的
`.map((line) => JSON.parse(line))` 改成**逐行 try/catch**，
坏行收集为诊断、返回存活条目。**照同仓已判为正确的那个模式写。**

**`CTX-06` 的同仓正确实现**：同一个文件里 `invalidateRecord`（`:199-209`）与
`deleteRecord`（`:273-285`）**都返回 `blocked(...)` 而不是抛**。
只有 `writeRecord` 的 `mkdirSync` 被包了 try/catch（`:109-118`），
而**紧随其后的 `appendFileSync`（`:133`）没有**。

⇒ **修复形态**：把 `:133` 包进 try/catch，返回
`blocked("project-memory-local-store:write-unavailable", …)`——
**与同文件另两个方法一致**。**注释已经写出了正确意图**
（「a memory that cannot be recorded reports that instead of thrown」），
**只是 catch 的位置差了一行。**

### 6.2 `CTX-09`：单调增长的数组/映射 — 参考实现的处置

> **状态**：待子代理复验（§9）。**我方事实已核实**（5 处）：
> `readCache.ts:23`、`compactLiveCheckpoint.ts:67`、`compactInjectionState.ts:70`、
> `projectMemoryInjectionState.ts:82`、`projectMemoryReviewState.ts:64`。
>
> **与 Phase 16 §4.5 的冲突必须写进裁决**：
> 那一轮写「未发现无界增长」（列了 `crashLog` 5 条/7 天、`PasteStore` 128、
> `KillRing` 16、`EditHistory` limit、`ProcessTreeManager` 双向清理），
> **本轮找到 5 处** ⇒ 上一轮的扫描**没有覆盖这些状态存储**。

### 6.3 `OBS-08`：`/log tail` 读不到轮转分片 — 同仓已有正确形状

> **状态**：无参考先例（pi 的日志实现未查）。**我方事实已由探针确认**：
> 写 60 行、当前分片 `.log.19`、`getRecentLines(50)` **只返回 3 行**。
>
> **修复形态**：按 **part 号数值降序**跨分片拼接到满足 `limit`。
> 顺带处理轮转命名的字典序陷阱（`readdir` 返回
> `.log.1, .log.10, …, .log.19, .log.2`——**探针已确认**）。

---

## 7. 死代码与债务（`CDE-01`…`CDE-06`、`TOL-01`、`TOL-02`、`PRV-11`、`BLD-02`）

### 7.1 参考实现**有同类死码策略可对照**：按修订点定位，而非按文件

> 标准出处：`ai/src/utils/retry.ts:98` 的注释提到「the classifier and the policy-driven retry
> loop live together and stay reusable」——即**参考实现把相关件放在一起**，
> 而不是靠后期清理。

**我方死码的总量（已核实，口径统一）**：

| 类别 | 规模 |
|---|---|
| 完全不可达（连类型边都没有） | **12 文件 / 1,349 行** |
| 运行期死码（有运行期导出、只被类型引用） | **37 文件 / 6,691 行** |
| 其中 `edit/**` | 12 文件 / **1,469 行** |
| 其中 `sandbox/` 四件 | 816 行 |
| 其中 `runtime/extensions` + `runtime/resources` | 651 行 |

**`TOL-02` 的判决已定**（见 13 号册）：`edit/patch` 三角**删除**——
理由不是「不可达」，而是**反向用例**：
`conflict.ts:121-142` 用顺序文本搜索，对 `gamma→beta` + `beta→delta`
这种**互不相交**的级联会**误报冲突**；而 `editEngine.ts:430-441` 的
区间重叠检查**正确**。

**并且本轮从参考实现得到了独立佐证**——`pi/packages/coding-agent/src/core/tools/edit-diff.ts:341-349`
的检查与我方**同构**：

```ts
matchedEdits.sort((a, b) => a.matchIndex - b.matchIndex);
for (let i = 1; i < matchedEdits.length; i++) {
  const previous = matchedEdits[i - 1];
  const current  = matchedEdits[i];
  if (previous.matchIndex + previous.matchLength > current.matchIndex) {
    throw new Error(`edits[${previous.editIndex}] and edits[${current.editIndex}] overlap …`);
  }
}
```

⇒ **「按起点排序后比较前一区间终点」是参考实现与我们都采用的做法**，
`edit/patch` 那套「顺序文本搜索」**在两侧都没有对应物**。
**`TOL-02` 的删除判决因此有了参考侧依据，不再是仅凭我方内部比较。**

### 7.2 `TOL-01`（`permissions` 17 处死声明）—— 参考实现的做法

`pi/packages/coding-agent/src/core/tools/` 的 `ToolDefinition` 里
**没有 `permissions` 字段**（工具清单已列于 §5.1）。
pi 的权限模型是 `permissionMode`（在 subagent 定义里）+ 扩展 `tool_call` 钩子。

⇒ **参考实现没有这个字段** ⇒ 支持「删除」而非「接入」。
**这与 `bridgeSafe` 的先例一致**（Phase 16 已按「从未被读过 ⇒ 删」处置）。

### 7.3 `CDE-03`（834 行进程内沙箱）—— 参考实现没有第二套

> **状态**：待复验（§9）。已知：pi 的 `bash.ts` 直接 spawn，
> 隔离交给**外部**（沙箱由运行环境提供）。
> 我方**已经有** `osSandbox.ts`（bwrap / sandbox-exec），
> 而 `sandbox/{sandboxPolicy,sandboxEnforcer,escalationWorkflow,auditTrail}.ts`
> **从未被实例化**。⇒ 判定与 `TOL-01` 同型：**删实现、留类型**（类型被 17 个文件引用）。

---

## 8. 明确不做（本阶段不纳入）

| 项 | 理由 | 出处 |
|---|---|---|
| **16-L** Bedrock 端到端 | 无可用账号；协议正确性已在 `PRV-08` 一类的读码+单测级覆盖 | `phase-16-decisions.md` §4 |
| **记忆自动注入**（Claude Code 式索引常驻） | **产品模型变更 + 提示注入面**；我方是显式 `/memory use`，与参考是不同产品模型 | `phase-16-decisions.md` §5 |
| **alt-screen 分栏侧栏** | 产品决定；Phase 15/16 两次记为 backlog | 同上 |
| **MCP SSE/HTTP 传输** | 与 15-A 分离，避免一个提交背两个协议 | `phase-15-decisions.md` |
| **扩展宿主**（programmatic extension API） | Phase 8 已裁决不做（**写进代码的防御立场**） | `phase-8-decisions.md` |
| **凭据路径的主动测试** | 两次 `content_filter` 的读面，按本仓纪律留给维护者 | 13 号册 §13.2 |

**关于「扩展宿主」的一点新证据**：`pi/packages/coding-agent/src/core/extensions/types.ts`
声明了 **49 个 `type:` 事件**（`session_start`/`tool_call`/`tool_result`/
`session_before_compact`/`before_provider_request`/`user_bash`/…），
是一套**完整的进程内扩展 API**。我方**故意**没有它（Phase 8）。
⇒ **`OBS-03`（18 个钩子事件只有 1 个有内建消费者）的参考对照因此是「不同机制」**：
我方是**声明式外部钩子**（`hooks.json` + 信任指纹），参考是**编程式进程内扩展**。
**这解释了我方 17 个事件「无人消费」的原因**——它们的消费者本该是用户写的钩子，
而不是内建组件。**裁决时不能按「参考有 49 个事件所以我们要加事件」的思路走。**

---

### 3.5 用量记账：参考实现不持久化，我方提供 `/cost` 就必须持久化 — `CONFIRMED`

pi 的用量随 `AssistantMessage` 走（`usage` 字段），**没有跨会话的用量账本**
⇒ **`PRV-10` 在参考实现里无对应机制**（`NOT-FOUND`）。

**但我方缺口更重**：`observability/usageTelemetry.ts:225` 的 `sessionTelemetries`
是进程内 `Map`，`session/**` 内**零持久化调用** ⇒ 恢复会话后
`/cost` 与状态栏**从零开始**，与「同一条会话的历史用量」冲突。

⇒ **双方的取舍不同，不是我方抄错**：参考实现**不提供**跨会话成本视图，
我方**提供了** `/cost` —— 既然提供了，就必须持久化，
否则那个视图在 `--resume` 之后是**错的**（不是缺失）。
这属于「我方独有的能力」带来的**自研义务**。

### 3.6 机器可读输出模式：`CLI-01`

`R3ProviderStream` 未给出参考实现的结论（其 coverage 列了但 findings 未展开）。
**我方缺口已核实**：`--json` 只在 `--print` 下生效
（`cliRuntimeModule.ts:480-485`），单独给出时**静默降级为 prose**。

⇒ **处置不依赖参考实现**：`AGENTS.md` 的
「不要把未核实的结果藏在成功样的状态后面」直接适用——
**要么 `--json` 隐含 print，要么在非 print 下报错**。
本文倾向**隐含**（更少惊讶），裁决文档定。

---

## 4bis. 主题、色彩与语法着色（`THM-01`…`THM-07`）的复验结论

`R2ThemeColorCmd` 的结果经主代理抽查复验（§9），要点：

### 4bis.1 色彩能力：探测与格式化分离，mode 显式传递 — `CONFIRMED`

- 探测：`pi/packages/tui/src/terminal-image.ts:70-75`
  （`COLORTERM === "truecolor" | "24bit"` 或 `TERM` 以 `-direct` 结尾）；
- 判定：`:172-174` `getTerminalColorMode()` → `capabilities.trueColor ? "truecolor" : "256color"`；
- 格式化：`colors.ts:299-307` `colorAnsi(color, mode, background)`
  ——truecolor 走 `\x1b[38;2;R;G;Bm`，否则 `\x1b[38;5;Nm`（`rgbToAnsi256`）。

**与我方 `THM-01` 的对照**：我方 `terminalCapabilities.ts:38-58` **算出了**
`hasTrueColor`/`has256Color`，但**零消费者**；`theme.ts:176-224` 无条件降 256。
⇒ 修复就是「把已经算出来的值接下去」，**不需要新增探测**。

### 4bis.2 `NO_COLOR` / `FORCE_COLOR`：参考实现**不处理** — `NOT-FOUND`（重要）

R2 的结论：pi 的探测只看 `COLORTERM`/`TERM`/`TERM_PROGRAM`，
**不读 `NO_COLOR`/`FORCE_COLOR`**。

⇒ **这意味着 `THM-04` 没有参考先例**。但**规范本身是标准**
（`no-color.org`：任一非空 `NO_COLOR` 即禁用颜色），
且这是**无障碍相关**的约定。
⇒ 处置：**按标准实现**，而不是按参考实现。
**裁决文档必须写明这一条是「按标准」而非「照参考」**——
否则复核者会问「参考都没做，为什么要做」。

### 4bis.3 主题 schema：参考实现有 **Draft-07 schema + 变量引用 + 循环检测** — `CONFIRMED`

- `pi/.../theme-schema.json`：**56 个令牌**（48 必填 + 8 可选），
  `additionalProperties: false`，分组为 UI / messages / tools / markdown /
  **syntax highlighting** / thinking levels；
- 变量在 `vars` 里定义，**递归解析且带循环检测**；
- `oh-my-pi` 更宽（**66 令牌**，含 15 个 statusline 令牌、80+ 预设），
  而 pi 在**色彩科学与动态系统主题**上更强。

**`auto` 的实现**（`system-theme.ts:413-424`）：
用 **WCAG 对比度**在黑白之间比，判定 dark/light；
探测手段是 **OSC 10（前景）/ OSC 11（背景）/ OSC 4（调色板）**
加 **DEC 模式 2031**（`tui.ts:168-171` 查询、`:925-927` 接收
`\x1b[?997;1n`/`\x1b[?997;2n`）。

⇒ **`THM-03` 的范围因此可以拆**：
①**schema + 校验**（立刻解决「拼错令牌名静默回退白字」）；
②**变量引用**（用户主题可复用）；
③**`auto`**（需要 OSC 查询 + WCAG，成本最高）。
**三者成本差一个量级，裁决时应分开决定，不要捆在一起。**

### 4bis.4 SGR 合并器（`THM-07`）：参考实现没有这层

R2 未给出找到的对应物。我方 `sgr.ts:11-13` 的**文档**声称支持冒号分隔，
`:43-56` 只 `split(";")`。
⇒ **处置回到 13 号册已有的判断**：先确认生产者是否真会产出冒号形式；
**若不产出，改文档比改代码诚实**（本轮仍未确认，标 `INFERENCE`）。

### 4bis.5 `CMD-01`（slash 引号参数）

R2 的结果中该项未展开。**处置不依赖参考实现**：
`slashRouter.ts:15` 的 `split(/\\s+/)` 让**全部 56 个命令**的
带空格引号参数失效（实测 `/theme "Dark Mode"` → `No theme named \`"dark\``）。
引号分词是**通用做法**，修复形态明确（POSIX 风格：`"`、`'`、`\\` 转义，
未闭合报错）。**这是本阶段「单点修复、全局收益」的唯一一条。**

---

## 9. 子代理结论的复验记录

> 三个研究子代理（`R1TuiRegular` / `R2ThemeColorCmd` / `R3ProviderStream`）
> 全部成功返回（12m58s / 17m34s / 17m17s）。以下逐条记主代理的复验结果。

### 9.1 被**推翻**的主代理判断（1 条）

| # | 主代理初判 | 子代理指出 | 复验结论 |
|---|---|---|---|
| 1 | 「pi 的 agent 循环**从不重试**（`grep retry agent-loop.ts` 零命中）⇒ `PRV-07` 是参考没有对应机制的实现缺陷」 | `R3ProviderStream`：重试在**会话层** `agent-session.ts`，且有 `_omitRecoveryAttempt` 把部分输出**从模型投影里持久抹除** | **子代理正确**。`grep` 零命中是对的，但**位置判断错了**。读码确认 `agent-session.ts:3684-3685` + `:1191-1207` + `session-manager.ts:1360`。§3.1 已更正 |

### 9.2 复验**成立**的子代理结论

| 子代理断言 | 复验方式 | 结果 |
|---|---|---|
| 主屏**只有一条行数组**，装饰不到 inline 模式 | 读 `tui-main-screen.ts:264` `this.render(width)`；`previousLines` 单数组 | ✅ 成立 |
| `regular` 模式**不启用**鼠标跟踪 | `grep -n "wheel\|mouse\|1002\|1006" tui-main-screen.ts` 零命中 | ✅ 成立 |
| 转录搜索**只在备用屏** | 导出全部带 `AltScreen` 前缀；键位只在 `TuiAltScreen` 接线 | ✅ 成立 |
| `NO_COLOR`/`FORCE_COLOR` 参考**不处理** | `grep -rn "NO_COLOR\|FORCE_COLOR" pi/packages/tui/src/*.ts` 零命中 | ✅ 成立（`NOT-FOUND`） |
| 主题 schema 有 `additionalProperties: false` | 读 `theme-schema.json` | ✅ 成立 |
| truecolor 探测看 `COLORTERM` | 读 `terminal-image.ts:70-75` | ✅ 成立 |
| `styleTextWithAnsi` 用定向复位 | 读 `colors.ts:330-365`（`39m`/`49m`/`22m`/`23m`/`24m`/`27m`） | ✅ 成立 |
| Google 用 `inlineData` 编码图片 | 读 `google-shared.ts`，`{ inlineData: { mimeType, data } }` | ✅ 成立 |
| pi 的 edit 有区间重叠检查 | 读 `edit-diff.ts:341-349`，与我方 `editEngine.ts:430-441` **同构** | ✅ 成立（**加强 `TOL-02` 的删除判决**） |

### 9.3 复验后**降级或缩小**的项

| 项 | 初判 | 复验后 |
|---|---|---|
| `TUI-05` | 「参考按视口切片渲染」 | **机制不同**：切片是**组件可见性过滤**（`stack.ts:82-87` 的 `entry.visible?.(viewport)`），不是行切片；且 `scroll-view.render()` **渲染整个子组件**。我方主屏**天然需要完整文档** ⇒ **「按视口裁剪块」在此不适用**。真实收益只有两条：去掉重复遍历 + 块级行数缓存 |
| `TUI-06` | 「同步/异步竞态」（P2） | **`NOT-FOUND`**：参考用 `process.stdout.write`（TTY 上本就同步），我方反而更保守。**真正缺的是 `drainInput`**（退出前抽干 stdin，防键盘释放事件泄漏）——是 `MISSING` 不是 `DEFECTIVE` |
| `THM-05` | 「需要真正的 16 色降级」 | **参考没有 16 色档**（只有 truecolor / 256）⇒ 我方也**不需要**；删死分支即可，范围缩小 |
| `BRW-01` | 「参考都在 context 级拦截」 | **撤回**：pi **没有浏览器工具**；`playwright-mcp` 源码**不在本地**（`src/README.md` 指向上游 monorepo，无 `node_modules`）；`stagehand` 的 `page.route`（`runtime.ts:3218-3222`）是**页级**。⇒ 「注释与代码不符」成立，但**「参考更严」不成立** |

### 9.4 主代理自己发现、三个子代理都**没提**的

| # | 发现 | 意义 |
|---|---|---|
| 1 | `pi` **没有浏览器工具**（`find -name "*browser*.ts"` 只命中 `open-browser.ts` 冒烟） | 整节 `BRW` 的参考基线要重定 |
| 2 | `pi` 有 `file-mutation-queue.ts`，用 **`realpath` 作队列键** | 我方 `withFileLock` 的键是否规范化需核；也说明「进程内队列」是参考做法（非 OS 锁） |
| 3 | `pi` 的 `ReadAfterWrite` 是**事务内**限制，**不是**文件并发控制 | 初读时差点误引为 `TOL-07` 的参考；已记入 §4.4 |
| 4 | `pi` 的扩展事件有 **49 个** `type:`，是**编程式进程内扩展**；我方 18 个是**声明式外部钩子** | 决定 `OBS-03` **不能**按「参考有 49 个所以我们要加」来处置 |
| 5 | `pi` 的 jsonl 存储是 **append-only + 提交 marker**（WAL 形状），`replaceSidecar` 才是 temp+rename | `SES-04` 的论据从「两种风格」升级为「参考在两处都用了 temp+rename」 |

### 9.5 仍然未复验的（如实列出）

- `PRV-09` 中各端点的**精确行号**（R3 给了行号，主代理只确认了**形态存在**与
  `never` 穷尽检查的描述，未逐行核对 18 个 Google 枚举值）；
- `PRV-11` 中「`projectProviderRegistry` 445 行」的**精确行数**（13 号册记 ~445）；
- `oh-my-pi` 的 66 令牌与「80+ 预设」的**精确数字**（只确认了 schema 存在）；
- `pi` 日志实现（本轮**未查**，`OBS-08` 因此是自研）。

---
