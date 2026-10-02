---
title: "功能与缺陷登记册：持续维护的能力缺口与缺陷总账"
category: article
sources: [12-gap-and-debt-research-2, repo-probes-2026-09-29, reference-survey-2026-09-29]
created: 2026-09-29
updated: 2026-10-01
tags: [features, gap-analysis, register, defects, tui, browser, session, provider, memory, dead-code]
summary: "长期维护的登记册，不是某一阶段的前置研究。登记每一处 demo 级实现、已核实缺陷、接线中断、缺失能力、TUI 体验不足与死代码，每条给出证据等级、参考实现的对应位置与修复方向。与 08/11/12 的关系：那三份是某一轮的盘点与设计，读完即归档；本册是持续更新的总账，新发现追加而不重写。第一版覆盖 TUI 表面、主题与色彩、slash 命令面、浏览器栈、会话持久化、provider 协议、上下文与记忆、工具与执行、平台集成、CLI 与发布面、死代码可达性十一类。§20 为 Phase 18 复核轮新增的 20 条（含 2 条 P1：Google 主流式缺 ?alt=sse、MCP 客户端连不上真实 server）。"
confidence: high
---

# 功能与缺陷登记册

> **本册的性质**：维护者要求的**常驻总账**，不是阶段前置研究。
> 每一条发现都要能回答三个问题：**在哪**（`path:line`）、**怎么证明**（可重跑的命令或探针）、
> **参考实现怎么做**（本地只读仓的 `file:line`）。
>
> **与 08 / 11 / 12 的区别**：那三份是**某一轮的**盘点——08 是 Phase 11 的盘点，
> 11 是 08 待办项的深化设计，12 是 Phase 16 的前置研究。它们服务于一个阶段，
> 阶段结束即归档。本册**不服务任何阶段**：新发现一律**追加**，已修复的条目标注状态而不删除，
> 以免同一个缺陷在两轮之间被反复「重新发现」。
>
> **纪律**（沿用本仓既有要求）：
> 1. 每条发现给出**证据等级**：`CONFIRMED`（读码或跑过）、`INFERENCE`（推断未执行）、
>    `CARRIED-OVER`（前几轮已记，本轮复核仍成立且**有新增信息**）。
> 2. 子代理结论**逐条由主代理复验**，证伪的如实记录在 §13。
> 3. **零代码改动**是本轮的性质；本册的条目在被施工前不得当作已完成。
> 4. 维护者点名的九类——未拥有的功能、有缺陷的代码、demo 级代码、TUI 缺少的功能、
>    TUI 体验不足、slash 命令实现是否可靠、是否存在没有接入 TUI 的功能、
>    `regular` 与全屏的适配、多套主题——逐一覆盖并标注落点。

---

## 0. 编号与状态约定

### 0.1 条目编号

条目号形如 `<域>-<序号>`，域见下表，一经分配**永不复用**。
跨轮次引用一律用条目号，不用行号（行号会漂移）。

| 域 | 含义 |
|---|---|
| `TUI` | 渲染、布局、转录、键位、输入、性能 |
| `THM` | 主题、色彩、终端能力 |
| `CMD` | slash 命令面（广告 / 派发 / 参数 / 实现可靠度） |
| `BRW` | 浏览器栈 |
| `SES` | 会话持久化、锁、恢复、分支、重放、导出 |
| `PRV` | provider、端点、协议保真、流式 |
| `CTX` | 上下文、记忆、压缩 |
| `TOL` | 工具、编辑、LSP、沙箱、执行运行时 |
| `OBS` | MCP、技能、插件、子代理、钩子、可观测性、网络策略 |
| `CLI` | 入口、非交互模式、JSON 事件流、退出路径 |
| `CDE` | 死代码、可达性、模块卫生 |
| `BLD` | 构建、打包、发布面 |

### 0.2 状态

| 状态 | 含义 |
|---|---|
| **OPEN** | 已核实，未施工 |
| **FIXED** | 已施工并验证（附提交号） |
| **WONTFIX** | 明确不做（附裁决原因） |
| **STALE** | 曾经的判定已被后续改动证伪，仅留档 |

### 0.3 严重度

- `P0` — 欺骗性结果，或安全边界被旁路。
- `P1` — 用户可见的功能失效。
- `P2` — 正确性/健壮性缺陷，或明确的体验短板。
- `P3` — 增强、标准符合性、债务。

---

## 0.4 当前实施状态（2026-10-02）

Phase 17 的 38 个交付项已逐项实施或完成候选保留裁决，另完成浏览器守卫及钩子文档。
完整提交、定向/反向验证和独立复核见 [phase-17-decisions.md](phase-17-decisions.md) §8。

**Phase 18 正在实施**：W1–W6已完成相应实现、缓解或文档裁决，W7–W8继续按执行表推进。
当前逐项状态、验证与限制见 [phase-18-decisions.md §8.4](phase-18-decisions.md#84-实施记录)。
原规划的24个OPEN标题是施工前输入快照，不代表当前未完成数；该快照的侧栏重复编号已更正。
`SES-02`只交付锁续期、owner校验和空锁恢复等缓解，未实现fencing，继续OPEN。

**W6-24统计修正**：browser当前167个非测试TS模块，旧164分类表漏了Phase17迁入的3个smoke模块，
本轮仅纠正总量，不伪造重新运行的可达性或逐行审计结论；CTX-08的正确调查口径为4+3+1，
其中原表的两个对照面不计作同型缺陷。PRV-04的“改PARTIAL”是W2施工前裁决，
W2-10已补齐失败分类，当前保留FIXED；CDE-01的12文件/1,349行是历史候选，最终处置见Phase17 §8.9。
编号冲突已于W6-23更正：§10的OBS-03/OBS-04专指钩子/MCP，§11bis侧栏使用OBS-11/OBS-12。

**真实 provider 验证**：**已于 2026-10-01 实机执行**（中转站 `ai.onyxaxis.org`）——
`verify:provider-readiness:real` 两项 `[pass]`，并首次用**真实**端点跑通多步工具回合；
`D2`（Anthropic `budget_tokens`）与 `D4`（reasoning 模型拒 `temperature`）两条 `[INFERENCE]`
在本中转站**均不触发**（但**不能**据此说不必修——中转站做了协议适配）。
完整探测、限定与未解除项见 `phase-18-decisions.md` §9。
锁 fencing、扩展宿主、分栏侧栏继续遵循已有独立裁决。

**Phase 18 收尾时发现的一处统计盲区（本册自身的记账问题）**：
只统计 `OPEN` 条目会漏掉三类未完成项——**`THM-03` 标的是 `PARTIAL`**（不是 `OPEN`，
Phase 17 只做了一半，另一半「按裁决延期」从未落到任何阶段）、
**`SES-08`/`PRV-06`/`BRW-06` 三条「未逐一核验的面」按设计不带状态标记**、
以及 §13.2/§16.4/§18 散文里的「仍然未覆盖」列表。
⇒ **「统计 `OPEN`」不等于「统计未完成」**。这 9 项已补入
`phase-18-decisions.md` 的 **W7**；本册对应条目的状态与措辞待施工轮回写。

## 1. 本轮方法

### 1.1 复核方式

主代理自建**模块可达图**：解析 `from "…"`、裸 `import "…"`、动态 `import(…)`，
按 `import type` / `export type` 区分**值边**与**类型边**，从 `entrypoints/cli.tsx` 做 BFS。
配合 `npx tsx` 直调生产函数的行为探针，与隔离 `HOME` 的真实 CLI / PTY 实机。

判定口径（这是把数字收敛到正确量级的关键——上一轮曾因口径错误得出 270 个「不可达文件」）：

| 口径 | 含义 | 本轮数字 |
|---|---|---|
| 生产非测试模块 | 非 `*.test.ts`、非 `test-utils/`、非 `core/harness/` | **829** |
| 值可达 | 从 `cli.tsx` 沿**值边**可达 | **755** |
| 任意可达（含类型边） | 值边 + 类型边 | **817** |
| **完全不可达** | 连类型边都没有 | **12 文件 / 1,349 行** |
| **运行期死码** | 有运行期导出，但只被 `import type` 引用过 | **37 文件 / 6,691 行** |

**为什么必须分口径**：一份只有 `export interface` 的文件被类型边引用，不算活代码，
但它也**不是可以删除的死码**——删掉它，引用其类型的一方编译失败。
只有「**有运行期导出**（`export function|const|class|enum`）**且只被类型引用**」
才是「写好了、注册了、没人调用」的那一类，也就是本仓 `check:call-reachability` 门禁想抓的形态。
**本册的 `CDE` 条目全部按这个口径分列，避免把契约误当死码。**

### 1.2 基础设施事故

**无**。三波共 9 个只读子代理全部返回（对比 Phase 16 的 402 额度耗尽与 `content_filter`）。

**一处必须记录的方法论事故**：子代理 `W1TuiSurface` 提交了一条引用
`mainScreen.ts:112-133` 的 `alreadyWritten` 的缺陷，**该符号已不存在**——
Phase 16 的 16-C 重写了那套记账。这类「读了旧文档、没读当前代码」的断言
是**本仓复核纪律存在的原因**。详见 §13。

### 1.3 参考实现

| 参考 | 用途 |
|---|---|
| `/home/wang/projects/pi` | 主参考：`packages/tui/src`（渲染与终端）、`packages/coding-agent/src/modes/interactive`（交互面与主题）、`packages/ai/src`（协议）、`packages/coding-agent/src/core`（会话与命令） |
| `/home/wang/projects/oh-my-pi` | 次参考：`packages/tui/src`（主题 schema、色彩空间）、`packages/ai/src`（协议）、`crates/pi-*`（原生层） |
| `/home/wang/projects/opencode` | 会话锁、provider 目录 |
| `/home/wang/projects/source-claudecode` | 记忆、任务列表作用域 |
| `/home/wang/projects/playwright-mcp`、`stagehand` | 浏览器不可用时的行为契约 |

**纪律**：比较必须给出参考侧的 `file:line`，不接受「pi 做得更好」这类结论。

---

## 2. TUI 表面（`TUI`）

### TUI-01 · `documentRows` 不带任何装饰，`regular` 模式丢失高亮、选区与滚动条 — `FIXED` `P1` `CONFIRMED`

> 已实施：`8ab1c5cc`；验证与裁决更正见 `phase-17-decisions.md` §8.5。历史发现保留如下。

**事实**：`presentation/tui/surface/view.ts:63` 的 `documentRows` 返回
`[...this.pane.documentRows(width), ...chrome.rows]`，而 `pane.ts:142` 的实现是

```ts
documentRows(width: number): readonly string[] {
  return this.transcript.render(Math.max(1, Math.floor(width))).rows;
}
```

即**裸 `transcript.render(width)`**——不传 `highlight`（搜索命中）、不传 `selection`（拖选）、
不套 `pane.render` 的 `shade`、也不 `paintScrollbar`。
`regular` 模式下 `engine.ts:320` 只读 `frame.documentRows?.()`，因此这四样在 `regular` 模式**全部不存在**。

**探针**（`TranscriptPane` + 30 块 + 容量 6，可重跑）：

```
alt-screen rows (windowed, highlighted):
    "<H>line 27</H>                         \u001b[38;5;242m│\u001b[0m"    ← 高亮 + 滚动条
main-screen documentRows: count = 60 (capacity was 6)
   highlight applied anywhere? false
   scrollbar painted? true vs doc: false
```

同一探针的选区版本：`alt rows contain REVERSE: true` / `documentRows contain REVERSE: false`。

**影响**：`regular` 用户**看不到自己选中的内容**（拖选在内存里生效、屏幕上无反馈）、
**看不到搜索命中**（`ctrl+shift+f` 能输入但无可视结果）、**没有滚动条**。
这与维护者点名的「`regular` 还未开始进行适配工作」是同一件事的具体形态。

**参考**：`pi/packages/tui/src/tui-main-screen.ts` 的 `computeLineDiff` 在**同一份行数组**上做差分，
行里已带样式——行由组件渲染，不存在「文档版」与「窗口版」两套行。

**方向**：`documentRows` 复用 `pane` 的渲染管线（只去掉按视口切片），把
`selection`/`highlight`/滚动条参数一并透传。
**注意**：`container.ts:172` 的块级缓存已按 `imageProtocol` 分键，但仍只有一个 `options` 槽——
加参数时要同步扩键，否则会命中上一组参数渲染出的缓存行。

---

### TUI-02 · `regular` 模式劫持滚轮，却不滚动任何东西 — `FIXED` `P2` `CONFIRMED`

> 已实施：`9e2c987b`；验证与裁决更正见 `phase-17-decisions.md` §8.5。历史发现保留如下。

**事实**：`engine.ts:145` 的 `this.setMouseTracking(true)` **无条件**执行
（`:143` 决定 `alternateScreen`，`:145` 不看它）。
`pointer.ts:94-97` 把滚轮喂给 `view().scroll()`，改的是 `ScrollModel.scrollTop`；
而 `grep scrollTop mainScreen.ts` **零命中**——`paint()` 只做追加与固定块重画。

`pointer.ts:11-13` 的注释写着「在普通屏幕上滚轮属于终端，抢过来会赔掉用户的滚回区」，
`engine.ts:145` 正是它说的那件事。

**影响**：`regular` 模式下滚轮既不能滚会话，也**不再滚终端自己的滚回区**——
鼠标滚轮在该模式下完全失效。

**参考**：`pi/packages/tui/src/tui.ts` 按屏幕模式决定是否进入鼠标跟踪。

**方向**：`setMouseTracking(this.alternateScreen)`。随后须重新评估 `regular` 的点击/拖选：
没有 `scrollTop` 就没有「屏幕行 → 内容行」映射，`TranscriptWindow` 是按视口建的，主屏没有视口。

---

### TUI-03 · `regular` 模式下 `ctrl+shift+f` 找到匹配但屏幕不动 — `FIXED` `P2` `CONFIRMED`

> 已实施：`7967d2da / 1fb68616`；验证与裁决更正见 `phase-17-decisions.md` §8.5。历史发现保留如下。

**事实**：`interactiveMode.ts:405-408` 把 `scrollToContentRow` 接到 `TranscriptPane`，
`pane.ts:89-94` 改 `scroller.scrollTop`；`engine.ts:320` 的 `mainScreen.paint` 不读它。
故按 `enter` 逐条走匹配时**计数会变、屏幕不变**。与 TUI-02 同根（主屏无视口）。

**方向**：或明说该键在主屏不可用（并从键位表移除），或把匹配行真正落到终端视口内。

---

### TUI-04 · `regular` 模式下分页器把每一页灌进永久滚回区 — `FIXED` `P2` `CONFIRMED`

> 已实施：`b560c7f0`；验证与裁决更正见 `phase-17-decisions.md` §8.5。历史发现保留如下。

**事实**：`interactiveMode.ts:242-244` 在 pager 打开时令 `overlayFullScreen()` 为真、
`overlayRows()` 返回 `pager.render(width, height)`，**不带 `chromeRows`/`documentRows`**；
`engine.ts:320` 用 `frame.documentRows?.() ?? frame.rows`——pager 的行因此被当成**文档新增行**追加。
翻页一次 = 向滚回区追加一整屏。

**方向**：主屏模式下让分页内容临时占用备用屏（`suspend` 类语义），或改为整页一次性追加后
由终端自己翻。**不能用「窗口式分页器 + 追加式屏幕」这个组合。**

---

### TUI-05 · 每帧多次全文档遍历（`regular` 实际 4 遍）— `FIXED` `P2` `CONFIRMED`

> 已实施：`81359c2b`；验证与裁决更正见 `phase-17-decisions.md` §8.5。历史发现保留如下。

| # | 位置 | 做什么 |
|---|---|---|
| 1 | `pane.ts:51` | `transcript.rowCount(w)` — 遍历全部块算总行数 |
| 2 | `pane.ts:57` | `transcript.render(w)` — 遍历全部块拼全部行 |
| 3 | `view.ts:91` | `documentRows` → `transcript.render(w)` — **再一次** |
| 4 | `container.ts:148` | 每次 `render` 重建 `rows[]` 与 `owners[]` 两个全量数组 |

Phase 16 的 16-F 已让 `documentRows` 惰性（备用屏不付这份钱）并在 `container` 加了块级行缓存，
**但窗口仍是 `rows.slice(top, top+capacity)`**——先分配全量再切片。

**参考**：`pi/packages/tui/src/components/scroll-view.ts` 维护 `contentHeight`/`currentScrollTop`
并**只渲染视口内组件**（`layout.ts` 有高度缓存）。

**方向**：块级**行数**缓存（现在缓存的是渲染结果，`rowCount` 仍重算）＋ 按视口选块区间；
`documentRows` 在 `regular` 下天然需要全量，但应复用第 2 步已算出的那份。

---

### TUI-06 · 关闭时就地写文档与 `exit` 的时序 — `FIXED` `P2` `CONFIRMED`（子代理结论已修正）

> 已实施：`dc324a63 / 1fb68616`；验证与裁决更正见 `phase-17-decisions.md` §8.5。历史发现保留如下。

**事实**：`engine.ts:266` 先 `this.terminal.stop()`（`:207` 用 `writeSync(...RESTORE_MODES...)`，**同步**），
随后 `:285` `this.terminal.write(leaveScreen(document))`（**异步**），
而 `interactiveMode.ts` 的 `shutdown()` 紧接着调 `handleShellClose` → `exit`。

**修正子代理结论**：它断言「`stop()` 退出备用屏早于 `leaveScreen` 刷出，导致终端状态被破坏」。
核实后**不成立**——`stop()` 走 `writeSync`，不存在同异步竞态；
`leaveScreen` 里的 `\x1b[?1049l` 确实**冗余**（代码注释自己也这么说），但冗余无害；
且 `regular` 模式在 `:268` 提前 return，这条路径根本不执行。

**仍然成立的**：`:285` 的**异步** `write` 可能赶不上 `exit`，导致退出瞬间的文档被截断。
本轮**未复现**（需要一次真实的「退出瞬间截断」观测），故这一半标 `INFERENCE`。

**方向**：`:285` 也走 `writeSync`，或让退出路径等待写出完成。低成本、无副作用。

---

### TUI-07 · `regular` 模式下 `/clear` 不清屏 — `STALE`（行为已如实说明，留档）

`interactiveMode.ts:808-816` 的注释明确写「主屏上已经写出的行是历史，清不掉；
清终端是用户自己的事」。这是**诚实**处理而非缺陷。留档以防未来当作缺陷重报。

---

### TUI-08 · 字词导航对 CJK 失效 — `FIXED` `P2` `CONFIRMED`

> 已实施：`ee200c53`；验证与裁决更正见 `phase-17-decisions.md` §8.5。历史发现保留如下。

**事实**：`motion.ts:31-45` 用 `WHITESPACE` 判词边界。探针：

```
wordStart("这是一个测试样例没有空格", 10) -> 0     ← 整段跳回行首
wordStart("hello world again", 10)       -> 6     ← 正确
```

**参考**：`pi/packages/tui/src/word-navigation.ts:28` 用 `Intl.Segmenter`。
我方 `measure.ts:13` **已在用** `Intl.Segmenter`，只是 `granularity: "grapheme"`。

**方向**：词级移动改用同一 segmenter 的 `granularity: "word"`。
注意 word 粒度对中文按词切分、与「按空白」语义不同——对中文用户这正是想要的，但需一次确认。

---

### TUI-09 · 键位帮助与用户重绑定脱节 — `FIXED` `P2` `CONFIRMED`（子代理断言已修正）

> 已实施：`702c1f0d / c49a6869`；验证与裁决更正见 `phase-17-decisions.md` §8.5。历史发现保留如下。

**子代理断言**：`chrome/keys.ts` 是硬编码表、忽略 `keybindings.json`，
且 `/help` 只列 4 个键而 `keybindings.ts` 有 39 个 → 「35 个动作的帮助缺失」。

**核实修正**：

- `/help` 只列 4 个键是**有意**的（`slashCommandRegistry.ts:169-170` 注释：
  「键都在一张表里，在这里再念一遍就是帮助开始宣传没人绑的键」），并指向 `/hotkey`。
  **不是缺陷**，是子代理把设计读成了遗漏。
- `KEY_BINDINGS`（`chrome/keys.ts`，**35** 条）**不是**从 `KEY_ACTIONS`
  （`keybindings.ts`，**39** 条）派生的——`grep keybindings chrome/keys.ts` 零命中。两表并列。
- **本轮实测两表 chord 集合一致**（`KEY_ACTIONS` 的 chord 全部出现在 `KEY_BINDINGS`；
  反向只多 `shift+drag` 一条指针手势）。故「宣传了没人绑的键」**当前不成立**。

**仍然成立的**：`/hotkey` 与补全后的键位提示都不反映用户在 `keybindings.json` 里的重绑定
（`renderKeyGuide(negotiated: boolean)` 只吃一个布尔）。用户把 `ctrl+o` 改绑到别处后，
`/hotkey` 仍显示 `ctrl+o`。**且两表 chord 一致这个不变量没有测试保护**——漂移只是还没发生。

**方向**：`renderKeyGuide` 接受解析后的绑定表；两表或合并，或加一条断言其一致的测试。

---

## 3. 主题与色彩（`THM`）

### THM-01 · 终端能力探测存在，主题从不询问 — `FIXED` `P1` `CONFIRMED`

**2026-09-30 实施**：587cf063：共享编码器按实际模式输出真彩色、256 色或 16 色。 W3 相关 113/113 通过；独立代码 APPROVE、架构 CLEAR。以下为修复前研究记录。

`terminalCapabilities.ts:38-48` 探测 `hasTrueColor`/`has256Color` 并挂在 `capabilities`
（`:57-58`），但**除定义与 `test-utils/terminalDouble.ts` 外零消费者**。
`theme.ts:176-224` 的 `colorToAnsi`/`colorToAnsiBg` 无条件降到 256 色（`\x1b[38;5;Nm`），
从不发 `\x1b[38;2;R;G;Bm`。

**参考**：`pi/packages/tui/src/colors.ts:302-307` 先看 mode，truecolor 时发 24 位序列。

**方向**：`colorToAnsi` 接受能力（或由 `getTheme` 注入），truecolor 走 24 位。
并与 THM-04 的 `NO_COLOR`/`FORCE_COLOR` 一并设计——三者是同一件事（终端能显示什么）。

---

### THM-02 · `fg`/`bg` 无条件追加全局复位，嵌套样式互相破坏 — `FIXED` `P1` `CONFIRMED`

**2026-09-30 实施**：`864d74dc`：定向复位、合成样式与嵌套属性恢复；移除气泡背景补丁。展示域 539/539；还原旧实现后 11 项失败。以下为修复前记录。

**事实**：`theme.ts:139-146`

```ts
fg(token, text) { return this.colorToAnsi(color) + text + "\x1b[0m"; }
bg(token, text) { return this.colorToAnsiBg(color) + text + "\x1b[0m"; }
```

`\x1b[0m` 清掉**全部**属性，包括外围的背景与加粗。

**实测**（`renderBand` = `bgOpen(statusBandBg)` + 各段 + `\x1b[0m`）：

```
"\u001b[48;5;236m\u001b[38;5;221mgpt-5\u001b[0m\u001b[38;5;59m ▏ \u001b[0m\u001b[38;5;102mbuild\u001b[0m                           \u001b[0m"
first global reset at index 27 of 99 -> background lost mid-row
```

即状态栏**第一段之后的背景全部丢失**。`blocks.ts:127-135` 的用户气泡用
`replaceAll("\x1b[0m", "\x1b[0m" + bg)` **绕着走**——这恰好证明问题存在，
且这个绕法只覆盖了那一处。

**参考**：`pi/packages/tui/src/colors.ts:336-366` 用**定向复位**
（`\x1b[39m` 前景、`\x1b[49m` 背景、`\x1b[22m` 加粗）。
我方 `bold`/`dim`/`inverse`（`theme.ts:150-160` 一带）**已经**是定向复位，照同一模式补齐即可。

---

### THM-03 · 主题令牌 32 个、无 schema；`auto` 被静默当作未设置 — `FIXED` `P2` `CONFIRMED`

**2026-09-30 实施**：1d419b15、6ddf40a8：schema、变量解析、逐项诊断和启动错误传播已落地；auto 与扩充主题数量仍按裁决延期。 W3 相关 113/113 通过；独立代码 APPROVE、架构 CLEAR。以下为修复前研究记录。

**2026-10-02 W7-25进展**：auto已接通启动、/theme、/reload与终端外观报告；具名选择不会被覆盖。定向90项、构建、双线复核及两种隔离PTY通过；反向5项失败后恢复。随后完成48个实用令牌、4套预设及旧字段颜色继承；数字规模对齐改为真实消费者覆盖。定向105项、构建和双线复核通过；反向4项失败后恢复，两种PTY验证预设与自定义Markdown颜色。THM-03现FIXED，以下仍为修复前研究。

| 维度 | 我方 | pi | oh-my-pi |
|---|---|---|---|
| 令牌数 | **32**（`dark.json`/`light.json` 各 32；缺失 0、多余 0） | 56 | 67 |
| schema | **无** | `theme-schema.json` | `theme-schema.json` |
| 派生色 / 变量 | 无 | `vars` 可复用 | `vars` |
| 外观元数据 | 无 | `appearance` | `appearance` |
| 内置主题数 | **2** | 若干 | 99 |
| `auto`（跟随系统） | 声明了但被当 `undefined` | `system-theme.ts` 用 OSC 10/11 + DEC 997 | 有 |

**已核实健全**（这部分比「只有两套主题」的初判好）：磁盘发现
（用户目录 + 项目 `.agents/themes` + `--theme`，`themes/index.ts:41-105`）、
热重载 debounce 与 `colorRevision` 失效链、两主题令牌覆盖完整。

**判定**：**主题数量不是缺陷，令牌表与 schema 才是**。
写错的令牌名走 `theme.ts:137` 的 `?? "#ffffff"` **静默回退**——用户看不出自己拼错了。

**方向**：先补 schema 与校验（立即获得拼写诊断），再考虑扩令牌表与 `auto`。
扩令牌表与 THM-06 的语法着色是同一批工作。

---

### THM-04 · `NO_COLOR` / `FORCE_COLOR` 全仓零处理 — `FIXED` `P3` `CONFIRMED`

**2026-09-30 实施**：6c18da5a：有效 FORCE_COLOR 优先，否则非空 NO_COLOR 禁色；保留文本属性。 W3 相关 113/113 通过；独立代码 APPROVE、架构 CLEAR。以下为修复前研究记录。

`grep -rn "NO_COLOR\|FORCE_COLOR" packages/ts-shell/src` **零命中**。
`NO_COLOR=1` 是标准且与无障碍相关的约定，用户说了不加色我们照加。

**方向**：`terminalCapabilities` 读 `NO_COLOR`（非空即禁用）与 `FORCE_COLOR`。
需要一次产品决定：**是无色（保留结构字符）还是完全不发 SGR**——
`NO_COLOR` 规范只说不加颜色，加粗/反显属于允许范围。

---

### THM-05 · `closestColor` 的 `index < 16` 分支不可达，且没有真正的 16 色降级 — `FIXED` `P3` `CONFIRMED`

**2026-09-30 实施**：587cf063：移除不可达分支，使用真实 16 色映射。 W3 相关 113/113 通过；独立代码 APPROVE、架构 CLEAR。以下为修复前研究记录。

`theme.ts:183-186` 与 `:218-221` 都有 `if (index < 16) return \`\x1b[3${index}m\`;`。
穷举全部 16,777,216 个 RGB 输入：**返回值域 16–255，`< 16` 出现 0 次**。

这同时暴露一个真实能力缺失：**没有 16 色降级**。真正的 16 色终端上我们发 `\x1b[38;5;Nm`（N ≥ 16），
多数终端会近似到最近本色；但 `\x1b[3Nm`（N ≥ 8）是**非法序列**。
所以这段代码既死又危险——一旦有人改了 `closestColor` 的值域，它会立刻发出非法序列。

**方向**：删掉死分支；若要 16 色支持，用 `30-37`/`90-97` 的正确映射
（`pi/packages/tui/src/colors.ts:279-297`）。与 THM-01 合并做最省。

---

### THM-06 · 代码围栏除 bash 外无语法制色 — `FIXED` `P2` `CONFIRMED`

**2026-09-30 实施**：272681ae、6ddf40a8：显式语言子集、多行高亮、原文保真、回退主题颜色和禁色快路径。 W3 相关 113/113 通过；独立代码 APPROVE、架构 CLEAR。以下为修复前研究记录。

`markdown.ts:161-167`：`const isBash = language === "bash" || "sh" || "zsh"`，
其余语言 `defaultTheme.fg("text", wrapped)`——**纯文本**。
`grep -rn "highlight\|syntaxHighlight\|tokenize" presentation/` 零命中；
`grep -rn "highlight.js" packages/ts-shell` 零命中。

**参考**：`pi/packages/coding-agent/src/utils/syntax-highlight.ts`（214 行）+
`modes/interactive/theme/theme.ts:90-98` 的语法令牌组。

**方向**：这是本册里**收益最直接**的 TUI 增强之一（代码块是 agent 的主要输出形态）。
实现前需定：自写 tokenizer（零依赖，覆盖窄）还是引入高亮库。
**引入运行时依赖需独立裁决**——本仓目前只有 6 个运行时依赖，且 `AGENTS.md` 对新增依赖一贯谨慎。
语法令牌要先加进 `THEME_COLOR_TOKENS`，与 THM-03 的 schema 工作合并更省。

---

### THM-07 · SGR 合并器声称支持冒号分隔扩展色，实际只切分号 — `FIXED` `P3` `CONFIRMED`

**2026-09-30 实施**：bbab352e：未发现生产冒号色序列，注释改为分号完整性检查，冒号参数保持不透明。 W3 相关 113/113 通过；独立代码 APPROVE、架构 CLEAR。以下为修复前研究记录。

`sgr.ts:11-13` 的文档说支持冒号分隔；`:43-56`/`:80` 只 `split(";")`。
`\x1b[38:2::255:0:0m` 会被当成单个未解析参数，与相邻序列合并时产出
形如 `\x1b[38:2::255:0:0;1m` 的混合序列。

**待确认**（`INFERENCE`）：生产代码是否真会产出冒号形式——若从不产出，
**改文档比改代码诚实**。

---

### THM-08 · `tuiMode: "stream"` 无行为 — `STALE`（Phase 16 已删，留档）

Phase 16 的裁决已把该取值删除（与 `fullscreen` 行为逐字节相同、从未接入）。
`grep -rn tuiMode` 现仅 `"regular" | "fullscreen"`。留档以防重新引入。
**注意**：`regular` **不是**这种死取值——它的语义是明确的（不接管屏幕），
缺的是适配（TUI-01…TUI-05）而不是定义。

---

## 4. Slash 命令面（`CMD`）

> 维护者点名：「slash 命令的内部实现是否可靠（不能只是一个占位符或者实现方案草率）」。
> 本节回答这一问，分三层：**能不能路由**（CMD-02…CMD-04）、**参数对不对**（CMD-01、CMD-05、
> CMD-07）、**实现真不真**（CMD-08）。

### CMD-01 · 参数按空白裸切分，带空格的引号参数全仓失效 — `FIXED` `P1` `CONFIRMED`

**2026-09-30 实施**：`188d7c53`、`616200fd`：共享引号分词，shell 源码交由所属命令处理；主代理重跑命令、模板与接线测试共 114/114，通过 shell 注释与 here-document 回归。 以下事实为修复前记录。

`slashRouter.ts:15`：

```ts
const [rawName, ...args] = input.slice(1).split(/\s+/).filter(Boolean);
```

**探针**（`routeSlashCommand` 直调）：

```
/theme "Dark Mode"    -> {"output":"No theme named `\"dark`. Available: dark, light."}
/cd "dir with spaces" -> {"workspaceTarget":"\"dir with spaces\""}    ← 引号原样保留 → stat 必失败
```

注意 `/theme` 那条：`args[0]` 是 `"Dark`，下游 `toLowerCase()` 后成为 `"dark`。

**影响面**：**全部 56 个命令**。任何路径、主题名、模型名、自定义指令带空格即不可用。
`/workspace attach`、`/cd`、`/theme`、`/model`、`/export`、`/report` 都直接受害。

**方向**：在 `slashRouter` 内做一次 POSIX 风格引号分词（支持 `"`、`'`、`\` 转义），
在**切分之前**。这是**单点修复、全局收益**，且不需要改任何命令实现。
必须同时加测试：带引号、转义引号、**未闭合引号（应报错而不是静默吞掉）**。

---

### CMD-02 · `/view` 有完整实现、有交互侧处理器，但没进注册表，且三处在宣传它 — `FIXED` `P2` `CONFIRMED`

**2026-09-30 实施**：`7b1673fd`：注册已有视图命令，并补齐非交互分支。交互、管道、print 接线测试通过；隔离 HOME 的真实 PTY、print 与管道进程验收通过。以下事实为修复前记录。

- `shellActionRuntime.ts:125-154` 定义 `runViewShellAction`（产出 `show-view`/`set-view`）。
- `grep -rn runViewShellAction packages/ts-shell/src` → **仅 1 处命中：它自己的声明**。
- `core/commands/registry.ts` 里 `name: "view"` **零命中**（全量 **56** 个命令）。
- `cli/interactive/interactiveCommandRouter.ts:271-285` **两处**处理器
  （`show-view`/`set-view`），走 `sessionRuntime.getViewMode()/setViewMode()`，
  即**功能是通的，只是没有入口**。
- 更糟的是**有地方在宣传它**，而且那些宣传字符串本身也**只从这条死路径可达**：
  `cliDisplayProjection.ts:9`（「Use /view user for …」）与 `:17`
  （「Use /view status to inspect current mode」）分别位于
  `formatViewModeStatusLines` / `formatViewModeUpdatedLine` 内，
  而这两个函数的唯一消费者是 `interactiveCommandRouter.ts:274,284`
  ——即 `show-view`/`set-view` 的处理器。**入口不存在 ⇒ 这些文案永远不会被打印。**
  第三处宣传 `cliApprovalModule.ts:500`（「Tip: use /view developer …」）
  则在一个**活着**的面上（审批提示），会真的打印给用户。
- 实机：`/view developer` → `Unknown slash command: /view`。

**判定**：与 Phase 15 的「广告与派发不一致」同型，是**第二次出现**。
`viewMode` 确实在改变 `sessionTerminalState` 的渲染模式与审批详略，用户需要一个开关。

**方向**：**注册 `view` 命令**（实现已在，接入成本极低），并删掉三处宣传或让它随注册表派生。

---

### CMD-03 · `/back` 带参数落进未知命令 — `FIXED` `P3` `CONFIRMED`（严重度已下调）

**2026-10-02 修复**：裸命令与带参数形式共用回退选择器；序号和精确 ID 只预选，文本只筛选，
用户确认后才导航。101 项定向测试与构建通过；撤销入口后 7 项失败，恢复后 12 项通过。
其他带参数命令与未知命令的派发不变。以下保留修复前诊断。

**修复前状态**（对照 Phase 16 的 16-I）：`argumentHint` 已从 `PICKER_ONLY` 条目上删掉
（`slashCommandRegistry.ts:62-73` 的注释解释了为什么——它曾宣传一个选择器并不接受的语法）。
实机：

```
/back    -> 交互模式打开 picker（正确）
/back 2  -> Unknown slash command: /back
```

**修正子代理结论**：它报「`/back` 完全不可路由」，读的是 12 号文档的旧状态，**与现状不符**。
**仍然成立的**只是带参数形式。**由于已不再对外宣传带参数形式**，
这是「体验毛刺」而非「错误承诺」，故下调为 `P3`。

**方向**：或在派发注册表里给带参数形式一句明确回答（「`/back` 不带参数使用，它需要选择器」），
或维持现状。低成本。

---

### CMD-04 · 非交互命令支持声明与会话动作 — `FIXED` `P2` `CONFIRMED`

**2026-10-02 修复**：注册表声明 `supportsNonInteractive`，未声明时在运行处理器前拒绝。
`/exit` 及别名结束输入消费，`/clear` 及别名复用会话生命周期并更新活动会话绑定；
`/retry`、`/cancel` 的交互依赖与拒绝理由由各命令声明。
97 项定向测试、2 项真实管道测试、保持上游 stdin 打开的退出验收和构建通过。
撤销修复后 7 项失败，恢复后通过。以下保留修复前诊断。

`cliRuntimeModule.ts:264-372` 的 shell-action 分支是**硬编码 4 项**允许清单
（`show-help` / `manage-permissions` / `list-sessions` / `show-workspace`，
另有 `fork-session` 与 resume 类），其余一律 `renderInteractiveOnlyShellActionBlocked`。
实机（管道输入）：

```
/exit          -> Outcome: blocked / Reason: This shell action is interactive-only.
/clear         -> 同上
/retry         -> 同上
/cancel        -> 同上
/permissions list -> Trust policy grants @ cheers    ← 可路由（Phase 16 的 16-I 成果）
```

**影响**：脚本化使用（CI、批处理、agent 调用 agent）**没有干净的退出路径**，
`/clear` 也无法重置会话。这不是「交互专属」——`/exit` 在管道里就是「输入结束」。

**方向**：`/exit` 的语义应与 stdin 关闭一致；`/clear` 可直接映射到 `startFreshSession`。
**需要一次产品决定**：哪些命令在非交互上下文中确实无意义（如 picker 类），哪些只是没接。
Phase 16 的 16-I 已经删掉了「声明为真却从不被读」的 `bridgeSafe` 字段，
现在的判据只剩硬编码清单——**这份清单本身就需要一条可维护的规则**，而不是第二处硬编码。

---

### CMD-05 · 参数解析无 `--` 终止符，未知 flag 静默忽略 — `OPEN` `P3` `CONFIRMED`

与 CMD-01 同源。已核实：`argumentCompletions.ts` 只做补全不做校验；
命令实现各自 `args[0]` 取值，多余参数通常被忽略；
`grep '\-\-' slashRouter` 零命中，即**没有 `--` 终止符处理**。
影响小（用户很少需要），但与 CMD-01 是同一次修复的自然延伸。

---

### CMD-06 · 与参考实现的命令缺口 — `FIXED` `P2` `CONFIRMED`

2026-10-02 / Phase 18 W2-7：增加一等 `/tree` 选择器及脚本 `/tree <entry-id>`，
复用会话叶切换和分支摘要；`/entries tree` 保持只读。损坏的环/孤儿条目仍可观察，但不可导航。
同时修复摘要被线程补齐误当作新问题的问题。12 个定向文件 / 158 项通过，构建通过，撤销后 4 项失败。
下面列出的其他命令仍属于原登记的产品 backlog，本条交付范围为会话树导航。

pi（`packages/coding-agent/src/core/slash-commands.ts:19-44`）有：
`/tree`（交互式分支树导航）、`/share`、`/bug`、`/import`、`/name`、`/clone`、`/scoped-models`。

实机复核：

```
/tree      -> Unknown slash command: /tree        （我方只有 /entries tree，非交互文本）
/session   -> 存在
/changelog -> Unknown slash command: /changelog
/share /import /name -> Unknown（Phase 15 已记 backlog，不重复登记）
```

**新增**：**`/tree` 值得做**——分支导航（`/back` + `/entries tree`）**已经有实现**，
缺的是一个一等入口。与 CMD-02 同型：**功能在，入口无**。
`/changelog` 是产品决定（我们是否有对外变更日志？），非缺陷。

---

### CMD-07 · `/todo list` 被解析成一条名为 "list" 的新任务 — `FIXED` `P2` `CONFIRMED`

**2026-09-30 实施**：`139fe6d4`：list 显式列举，未知子命令与错误参数只返回用法，不新建任务。5 个回归场景在旧实现上全部失败。 以下事实为修复前记录。

`todoCommandRuntime.ts:158-171` 的兜底分支：不认识的子命令一律当作**新任务文本**。实机：

```
/todo list  -> Task added: **#1** "list"
```

用户输入 `/todo list`（一个非常自然的猜测）**静默创建了一条名为 "list" 的待办**——
与 `AGENTS.md` 的「不要用成功样的输出掩盖未预期的结果」同型。

**加重情节**：`/todo` 的 `argumentHint` 是 `[add|start|done|clear]`（**不含 `list`**），
但模型的 `todo` 工具**能**传 `list`（`todoTool.ts:52` 把它映射到 `[]`）。
即**模型能列举、用户不能**，且用户的尝试被静默改写成一次写操作。

**方向**：把 `list` 加进子命令（成本最低且与工具对齐），或兜底改为「未知子命令 → 提示用法」。
两者都优于现状；**推荐两者都做**（兜底不该是写操作）。

---

### CMD-08 · 命令「真实」不等于命令「正确」— `STALE`（结论留档，防止误读）

Phase 16 给过 45 条命令的 real-vs-stub 表，结论「**零桩**」。本轮抽查
`/compact` `/memory` `/browser` `/sidebar` `/todo` `/diagnose` `/permissions` `/statusline`，
**同意该结论**——全部接真实引擎（git、provider、日志 sink、记忆 store、DAG runner）。

但 CMD-02（有实现无入口 + 三处宣传）、CMD-07（静默改写用户输入）、
CMD-04（非交互无退出路径）说明：**命令不假，不等于命令对**。
留档以防未来把「零桩」当成「零缺陷」。

---

## 5. 浏览器栈（`BRW`）

> 本节由**主代理**完成。子代理 `W2BrowserStack` 两次因上游 `content_filter` 终止
> （读面涉及 `browser/**` 与凭据相邻面），按本仓既有结论——**这类读面由主代理亲验**。
> 终止的实例的 transcript（`history://W2BrowserStack`）显示它已完成
> 164 个模块的清点与多数读码，但**未产出结论**；下面的每条断言均由主代理重新跑过。

### 5.0 历史可达性实测（口径与上一轮不同，勿混用）

**W6-24口径说明**：本节164是迁入smoke前三模块之外的旧闭包快照；2026-10-02实际目录总数为167，
本轮未重跑此历史闭包，16/160等结果保留其原时点。

脚本：解析相对 ESM 导入（含 `import type`），从两个入口分别做闭包。

```
browser non-test modules: 164
  reachable from MODEL tool: 16
  reachable from /browser  : 160
  MODEL-only               : 4   originPolicy, sessionManager, stealthPreload, urlAdmission
  NEITHER                  : 0
```

**与上一轮数字（13 / 160 / 0）的差异原因**：本轮把 `import type` 边也计入，
且统计对象是「164 个非测试模块」。数量级结论一致：**两条栈，模型侧只走极小的一支**。

**模型侧那 16 个模块**（全部）：
`accessibilitySnapshot`、`actionContract`、`capabilityModel`、`domSnapshot`、`evidenceSafety`、
`executionContract`、`networkAllowlist`、`originPolicy`、`outputBudget`、`playwrightEvidence`、
`playwrightRuntime`、`runtime/core/{executor,manifest}`、`sessionManager`、`stealthPreload`、`urlAdmission`。

**真正被执行的只有 `sessionManager.ts`**（裸 `playwright-core` 启动 + 一个请求守卫），
其余是类型与签名依赖。

### BRW-00 · 逐模块分类表（**本轮补完成**，此前 3 轮未产出） — `STALE`（事实表，非缺陷）

**方法**（两条独立的可达性口径，必须同时给出，否则会把「装配了但按开关关闭」
误判为死码——本册初稿就犯过这个错，见表下注）：

| 口径 | 含义 |
|---|---|
| **模型侧闭包** | 从 `core/tools/browserToolUnified.ts` 沿**值边**可达 |
| **`/browser` 命令闭包** | 从 `core/commands/browserCommandRuntime.ts` 沿值边可达 |
| **CLI 装配闭包** | 从 `entrypoints/cli.tsx` 沿值边可达（**捕获「装配了但被开关关闭」**） |

```
TOTAL browser non-test modules: 167 (2026-10-02目录实测；下列原四类为历史分类)
  MOVED       3 files               ← smoke/{config,report,runner}.ts；未补作四类闭包分类
  REAL        7 files    1893 lines   ← 模型侧闭包内（真正被 agent 执行的）
  FIXTURE   140 files   18484 lines   ← 只在 /browser 闭包内（受治理的夹具/证据栈）
  ASSEMBLED  12 files    2540 lines   ← 从 CLI 可达，但不在上面任一条浏览器路径里
  DEAD        5 files     747 lines   ← 从 cli.tsx 都不可达
```

**REAL（7 个，1,893 行）** —— 模型侧真正走的全部：
`capabilityModel.ts`(169)、`networkAllowlist.ts`(275)、`originPolicy.ts`(77)、
`playwrightRuntime.ts`(377)、`sessionManager.ts`(576)、`stealthPreload.ts`(185)、
`urlAdmission.ts`(234)。**真正执行的只有 `sessionManager` + `stealthPreload`**，其余是类型与策略。

**ASSEMBLED（12 个，2,540 行）** —— 这一列是本表**最容易被误判**的部分：
它们从 `cli.tsx` 可达（所以**不是死码**），但**都挂在环境变量清单开关后面**，
默认关闭：

| 模块 | 开关 |
|---|---|
| `receipt/{store,manifest,lock,integrity,recovery,retention,compaction}.ts`（7 个，1,318 行） | `loadBrowserReceiptCacheManifestFromEnv`（`cliCommandExecutionBridge.ts:113`）——无 manifest ⇒ `store` 为 `undefined` ⇒ `commandRunner` 拿到 `undefined` |
| `cliExecutorInjection.ts`(157) | 无 manifest 时**显式返回** `status: "disabled"` 且 `reason: "No CLI browser local fixture manifest was provided."`（`:49-61`） |
| `controlledNetworkRunnerManifest.ts`(292) / `externalNetworkRunnerManifest.ts`(408) | 同类清单 |
| `persistentReceiptCache.ts`(181)、`actionCacheEntry.ts`(184) | 由 `receipt/store` 间接使用 |

⇒ **判定**：这些**不是缺陷**（Phase 16 已裁定夹具栈默认关闭是**设计**），
但**「配置了才生效」这件事只写在代码里**——没有任何命令或文档告诉用户
「这一大块能力需要一个 manifest 才会醒来」。**记入 §14 的文档项。**

**DEAD（5 个，747 行）** —— 从 `cli.tsx` 都不可达，**与 §12 的 CDE-05 是同一批**：
`actionCache.ts`(149)、`playwrightEvidence.ts`(252)、
`runtime/core/directionDecision.ts`(95)、`runtime/core/executor.ts`(167)、
`toolServerBackendComparison.ts`(84)。

**FIXTURE（140 个，18,484 行）** —— 受治理的夹具/证据框架，**默认零执行**
（`cliExecutorInjection` 无 manifest 即 disabled；`playwrightLocalExecutor` 只接受
`local-fixture://`；`executor.ts` 默认 `NOOP_BROWSER_EXECUTOR`）。
**在其自身定位下正确**，见 BRW-03。

> **⚠️ 本表的一处方法论更正（记下来免得重犯）**：主代理首次生成表格时，
> 把「不在模型侧闭包、也不在 `/browser` 闭包」直接标为 `DEAD`，得到 **17 个死模块**。
> 用**第三种口径**（从 `cli.tsx`）复核后发现其中 **12 个是可从 CLI 到达的**——
> 它们被装配了，只是被环境开关关着。**只有 5 个真的从任何入口都不可达。**
> 教训：**「两条路径都不经过」不等于「没有入口」**；
> 判定死码必须用**全入口闭包**，不能用「某几条路径的差集」。

### BRW-01 · 请求守卫是**页级**的，而注释宣称**上下文级、覆盖每个页面与弹窗** — `FIXED` `P1` `CONFIRMED`

**2026-09-30 实施/裁决**：07bade66：建页前安装 context.route 并禁用 Service Worker，覆盖弹窗首请求。真实 Chromium 7/7、相关共 20/20；可达私网服务器请求计数证明阻断。服务器重定向可能先触达目标，保留落点拒绝，不宣称逐跳网络隔离。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

`sessionManager.ts:415-417`：

```ts
private async installRequestGuard(page: PwPage): Promise<void> {
  await page.route("**/*", (route) => { ... });
```

而它上方 `:179-199` 的注释写的是：

> …a context-wide handler is the only place that sees one. **It is installed before any page
> exists so every page and popup inherits it.** … The stealth preload is installed on the context
> so every page and popup inherits it rather than only the first one.

**三处与代码不符**：

1. **不是 context-wide**：`grep -n "context.route\|\.route(" browser/sessionManager.ts`
   → **只有 `:416` 一处 `page.route`**，`context.route` 零命中。
2. **不是「每个页面与弹窗」**：`PwBrowserContext`（`playwrightRuntime.ts:29-34`）
   **根本没有声明 `route`**——所以连改成 context 级都还要先扩接口。
   代码里也**没有** `context.on("page")` / popup 处理——对 `popup` 与 `on("page")`
   两种写法的 grep 均零命中。
   Playwright 里 `page.route` 只对**那一个 page**生效，新开的页面/弹窗不经它。
3. **「installed before any page exists」也是错的**：调用点在 `:202-203`
   ——`const page = await this.context.newPage(); await this.installRequestGuard(page);`
   **页面先存在，守卫后安装**。

**影响**：页面通过 `window.open` / `<a target="_blank">` 开出的**任何**新页面，
**完全不过出站判定**——可以指向 `169.254.169.254`、RFC1918 地址或任意 host。
这不是理论问题：14 个模块（`executionConfirmation`、`sandboxAuthority` 等）正是为这类
判定而存在，而它们都**到不了模型侧**（见 5.0）。

**参考**：`playwright-mcp` 与 `stagehand` 都在 context 级安装拦截。

**方向**：`PwBrowserContext` 增 `route` 声明，
把守卫改为在 `newContext()` 之后、`newPage()` 之前安装到 **context**；
弹窗若需单独处理，加 `context.on("page")` 再补一次。**并修掉那段注释**
——它现在描述的是一个不存在的实现（这也是 TUI 之外的第二处「注释说谎」实例）。

### BRW-02 · 同一段注释在另一个方向也已经过时 — `FIXED` `P3` `CONFIRMED`

**2026-09-30 实施/裁决**：07bade66：删除 main-frame-only、逐重定向拦截等错误注释；明确页内请求遵循主机规则，导航遵循 allowlist；处置 Promise 均 await/catch。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

同一注释块 `:188-196` 说：

> this is the *main frame* only. A subresource another origin serves — an image, a script,
> a `fetch()` from page code — **is not a navigation and does not pass through here**.

**但 `admitPageRequest` 正是为子资源写的**（`urlAdmission.ts:158-184`），
且 `sessionManager.integration.test.ts:102-121` 的测试名就叫
「**refuses a request the page made for a metadata address**」，注释写着
「The subresource case, which no post-`goto` check can see」。

即：**实现已经覆盖子资源，注释说它不覆盖**。
上一轮（Phase 16 的 16-D/16-E）加了这一层，注释没有跟上。

**方向**：这段注释整体重写，一次说清三件事——覆盖什么（main-frame 导航 + 子资源请求，
页级）、不覆盖什么（新页面/弹窗，见 BRW-01）、以及它不是沙箱
（`:11-15` 的「an intention declaration … not the thing that keeps a compromised page
from reaching a host」是对的，保留）。

### BRW-03 · 模型侧确实已有出站治理（更正上一轮结论）— `STALE`（留档）

Phase 16 修复前的结论是「模型侧完全绕开允许清单/出站决策/沙箱授权/执行确认/回执缓存」。
**现状**：

| 判定点 | 模型侧是否经过 | 证据 |
|---|---|---|
| 调用者给的 URL | ✅ | `sessionManager.ts:257` `this.dependencies.admitUrl(url, policy)`（默认 `admitBrowserUrl`） |
| 重定向落点 | ✅ | `:299` `admitBrowserRedirect(url, landed, policy)`，且拒绝后 `goto("about:blank")` |
| **页面自己发的请求（当前页）** | ✅ | `:416` `page.route("**/*")` → `admitPageRequest` |
| **页面开出的新页面/弹窗** | ❌ | 见 BRW-01 |
| 允许清单（`networkAllowlist.ts`） | ✅ | 在模型侧闭包内（5.0） |
| `networkEgressGuard.ts` / `sandboxAuthority.ts` / `executionConfirmation.ts` / `actionReadiness.ts` | ❌ | 只在 `/browser` 闭包内 |

**结论**：那条「模型侧零治理」的结论**已不成立**，不应再按它记录。
剩下的是 BRW-01 的那个**具体缺口**（新页面），而不是「整条策略层被绕开」。

**关于 `/browser` 那一栈的定位**（Phase 16 已判定，此处重申以便引用）：
它是**受治理的夹具/证据框架、默认关闭**（`cliExecutorInjection.ts:49-61` 无 manifest 即
`disabled`；`playwrightLocalExecutor.ts:48-55` 只接受 `local-fixture://`；
`executor.ts:49-58` 默认 `NOOP_BROWSER_EXECUTOR`）。
所以「模型侧不经过它」**不是缺陷**——它们是**两套东西**，不是一条栈的两个入口。
把这条记为**定位问题**：两套并存但定位只写在代码注释里，用户/维护者无从得知。

### BRW-04 · `closeSession` 无条件报告「资源已释放」 — `FIXED` `P2` `CONFIRMED`

2026-10-02 / Phase 18 W1-6：逐个等待 page/context/browser 关闭，失败返回
`close-failed` 并指名资源；保留失败句柄供重试、串行化并发关闭、等待进行中的初始化。
3 个定向文件 / 27 项通过（含 7 项真实浏览器测试），构建通过；撤销实现后 7 项失败。
以下为修复前证据。

`sessionManager.ts:548-572`：

```ts
async closeSession(): Promise<BrowserActionResult> {
  try {
    ...await this.currentPage.close().catch(() => {});
    ...await this.context.close().catch(() => {});
    ...await this.browser.close().catch(() => {});
  } catch { /* best-effort */ }
  ...
  return { ok: true, output: "Browser session closed and resources released." };
}
```

两重静默：内层三个 `.catch(() => {})` 吞掉每个关闭失败，外层 `catch {}` 吞掉其余，
**然后照样断言「resources released」**。若 `browser.close()` 抛出（浏览器进程僵死、
管道已断），进程可能仍在——而工具报告成功。

**对照同一文件的原则**：`docs/` 与 `AGENTS.md` 要求
「Do not hide unverified write outcomes behind success-like states」。
这个方法的**返回值形状**（`BrowserActionResult`）本来就能表达失败，却从不表达。

**注意**：方法上方的注释说「a browser that will not close is already gone, and reporting it
would leave the session unusable for no gain」。**「已消失」是未经验证的假设**——
`catch` 捕获的异常种类决定它是不是「已经没了」；`EACCES`、管道半关、进程僵而不死
都不属于这一类。**方向**：把关闭结果分三态报告（全部关闭 / 部分失败并指名 / 不可能关闭），
或至少把措辞从「resources released」降为已确认的部分。这与 Phase 15 修的 MCP 假串同型。

### BRW-05 · 编造的成功已删除（复核确认，非缺陷）— `STALE`（留档）

Phase 16 的 16-D 声称删除了 6 处 `Simulated …`。本轮复核：

```
grep -rn "Simulated click\|Simulated navigat\|Simulated Session" packages/ts-shell/src
  -> 仅 2 处命中，均为注释/测试注释（browserToolUnified.ts:13、browserUnified.test.ts:214）
```

**编造的成功确已不存在**。`browserToolUnified.ts:9-16` 的文档还主动解释了
为什么这样设计（「There is no third state where an action reports success without a page」）。

**同类残留仍有一处**：`browser/externalNetworkHandoffPolicy.ts` 的
`"handoff-allowed-simulated"` 状态与「simulated handoff only」措辞——
但它在**夹具栈**内（`/browser` 路径），措辞字段名就叫 simulated，
**不构成欺骗**。仅记录，不提议改。

**其余残余 `mock`/`fake` 命中**全部位于测试或夹具模式标记
（`fake-test` 是 `BrowserAllowedOrigin.mode` 的合法取值）。**无生产路径说谎。**

### BRW-06 · `receipt/**` 的保证强度 — W7-28 已修复并逐项核验

原九个模块只服务显式 `/browser` 缓存路径，默认不启用；生产装配在
`entrypoints/cliCommandExecutionBridge.ts`。夹具定位不豁免权限、持久化与结果真实性要求。
原“expiresAt/ownerId陈旧判定正确”的结论被行为测试推翻：普通覆盖过期锁没有互斥保证。

当前实现：manifest校验后冻结权限；read先过门，有界读取且健康查询不写盘；
嵌套receipt/entry校验并核对派生一致性；任何损坏/未知/不安全行隔离整个日志，阻止回放与重写，保留原字节。
写入在一个owner中执行独占锁、锁内读取、原子替换与读回验证；不自动抢占过期锁，清理失败单独报告。
保留策略先扣tombstone预算，内存条目别名也须查持久化失效记录。
compact只处理完整日志，repair对完整日志为unchanged、对不确定日志为blocked；不能推断遗失的tombstone。
命令与自修复入口保持written/unchanged/blocked/unverified及锁清理事实。

保证限于稳定本地目录中的合作写入方；不提供fencing、作者认证或fsync崩溃持久性。
遗留锁/损坏日志须停止写入方后恢复已知正确备份或选择新的空缓存根。
逐模块矩阵和定向/进程验收见phase-18裁决末尾W7-28记录。

**待补**：167个模块的逐个real-vs-demo逐行判定（W6-24纠正目录总数，未执行逐行判定）；
`runtime/core/*` + `skill/*` 的 `disabled` 默认是否有用户可见的告知；
浏览器进程在 crash / `/clear` / `suspend()` 下的生命周期。


---

## 6. 会话与持久化（`SES`）

> 本节由子代理 `W2SessionDurability` 产出（36m41s，成功返回），
> **主代理逐条复验**。复验改判了两处（SES-05 的严重度、SES-04 的影响面）。

### SES-01 · 用户键入的 `/todo` 不入库，恢复会话后丢失 — `FIXED` `P1` `CONFIRMED`

**2026-09-30 实施/裁决**：58f81280、3311f2ba、67ae3a6a：待办本地状态通过现有消息持久化，恢复在交互首帧前完成。实际参数是 `--session-id ID`；两种屏幕的真实 PTY 创建与恢复、print 恢复均退出 0。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

**三层事实**（子代理与主代理各自独立复现）：

1. `todoCommandRuntime.ts:17` 的 `listsBySession` 是**进程内 `Map`**。
2. **只有模型工具路径**把清单写进消息 `metadata.todo`
   （`todoTool.ts:64-68` 的 `approvedResult(..., { todo: getSessionTodos(...) })`），
   `sessionEventCodec.ts:204` 落盘，`replayTodosFromMessages`（`:187`）回放。
3. **用户命令路径不写任何消息**：`cliCommandExecutionBridge.ts:147-152` 对
   `kind === "local"` 只 `renderer.renderLine(output)` 然后 `return { kind: "handled" }`
   ——没有 `addTurn`，没有 metadata。

**PTY 实机**（隔离 `HOME`，`\r` 提交）：

```
/todo add pty-check   ->  "Task added: #1 \"pty-check\""（状态栏同时显示 1 open todo）
find $HOME/.cheers/sessions/<id> -type f | xargs grep -c pty-check  ->  0 命中
```

**探针**（直调回放）：

```
replayTodosFromMessages("S",  [tool message with metadata.todo])  ->  [{"id":1,...}]
replayTodosFromMessages("S2", [user message "/todo add y"])       ->  []        ← 用户路径无痕
```

**影响**：用户在会话里建的清单**重启后消失**；而
`cli/interactive/sessionFacts.ts:75` 的 `openTodos` 读数会把状态栏显示为 **0**，
即**状态栏报「没有未完成事项」而事实相反**。

**Phase 16 的 16-H 修的是另一半**（模型工具 + 回放 + 分支正确性），
**没有修「用户键入的命令不产生记录」**。这是 16-H 的**残留缺口**，不是回归。

**参考**：`pi/packages/coding-agent/src/core/session-manager.ts:355-375`。

**方向**：两条路——(a) 让 `/todo` 的 local 结果也经 `onTurnMessage` 写一条记录；
(b) 把清单并入会话状态快照。**(a) 与现有回放机制同构，改动面更小**；
但只给 `/todo` 开特例会让 bridge 长出第一个特例，
应在 bridge 层给出**通用的「本地命令可声明要记录的状态」通道**。

### SES-02 · 陈旧锁夺取**没有 fencing**，被暂停的持有者恢复后可以静默覆盖 — `OPEN` `P2` `CONFIRMED`

2026-10-02 W4-14 缓解：同步临界区不能运行定时 heartbeat，改为本机有效 PID 存活时不按年龄夺锁，
只有明确 ESRCH 判死，权限不足保守等待；无效 PID 走未知 owner 的年龄规则。
释放前校验随机 token 与文件身份，接管在取得声明后重新检查 stale。
action 错误不再触发整个 action 重试。SIGSTOP 实机验证本机旧锁不因年龄过期，
模拟外部替换后旧持有者退出失败并保留接管者锁。仍无 fencing：外部替换、跨主机和
检查到删除之间的竞争并未得到原子排除保证，故本条保持 OPEN。以下为修复前证据。

`session/store/lockStaleness.ts:16` 的注释**自己承认**：「There is no fencing token
to stop the first from …」。年龄阈值 `STALE_LOCK_AGE_MS = 60_000`（`:29`）。

**交错**：进程 A 被 `SIGSTOP`／VM 冻结／超过 60s 的 GC 停顿 ⇒
进程 B 判定陈旧（`:118`、`:129`，读 mtime **或** 锁内 `createdAt`）⇒ `takeOverStaleLock`（`:176-197`）
⇒ B 写 `state.json` ⇒ **A 恢复后仍认为自己是持有者**，经 `writeSessionState`
（`sessionStateStore.ts:48-56`，内部 `writeJsonFileAtomic`）**覆盖 B 的写入**，无人察觉。

**判定**：这是**如实记录的已知保证上限**（注释在），
但 Phase 16 的 16-G 声称「陈旧回收 + breaker 防并发夺取」，读者容易读成「安全」。
**本册据实下调其保证**：它防的是**死进程的锁**，不防**活进程的竞争**。
需要 fencing（`state.json` 里放 epoch、写入前比对）才能真正成立。
与 `.normproof/dispositions.md` 里那条「租约锁无 fencing，须如实降级其保证」**同一条**。

### SES-03 · 夺取通知写了盘，但**从不被读** — `FIXED` `P2` `CONFIRMED`

**2026-09-30 实施**：`66a70f3e`：采用删除无人读取的通知机制方案，保留锁恢复及 finally 释放。11/11 测试通过；恢复旧机制时 2 项失败。没有新增 fencing 保证。 以下事实为修复前记录。

`lockStaleness.ts:53` 定义 `readTakeoverNotice`，其上方 `:49-51` 的文档写：

> `writeSessionState` reads it on every write because the caller that wants to know
> cannot have been watching at the moment it happened.

**这句话是假的**。`grep -rn readTakeoverNotice packages/ts-shell/src` ⇒
**只有 `lockStaleness.ts` 自身与 `lockStaleness.test.ts`**；
`sessionStateStore.ts:43-57` 的 `writeSessionState` **没有调用它**。

**后果**：夺取发生时（用户看不到任何提示）写到 `state.lock.stale`，
**没有任何代码路径会读它**，所以「一次夺取发生过」这件事只有翻文件系统才知道。
即：**用户被静默夺走了锁**。

**方向**：二选一——在 `writeSessionState` 里读并在值得告知时报告；
或删掉整条通知机制（`writeTakeoverNotice` 的 `catch` 已经声称「The notice is a record,
not a requirement」，那就说明它不是必需品）。**不能保留一句话描述它被读、而它不被读。**

### SES-04 · `metadata.json` / `current-session.json` 写入**非原子** — `FIXED` `P2` `CONFIRMED`（影响面已修正）

**2026-09-30 实施/裁决**：2f9dcd49：metadata 与当前会话注册表改用独占临时文件、fsync、rename。12 文件 51/51，两个 SIGKILL 探针保留旧 JSON；不宣称断电持久性。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

`session/store/sessionStore.ts:52-61`：

```ts
const metadata = projectSessionMetadata(input.session);
fs.writeFileSync(input.layout.metadataPath, JSON.stringify(metadata, null, 2), "utf8");
```

**没有 temp+rename，没有 fsync，没有加 `state.lock`**。
对照同仓 `sessionFileStore.ts:113-140` 的 `writeJsonFileAtomic`（temp + `fsync` + rename +
瞬时错误回退）——**同一个 store 里两种写法**。

**影响面如实修正**（子代理说「permanently breaking session resume」）：
`loadSessionRecord`（`sessionStore.ts:88-94`）对解析失败会抛出，
所以**损坏确实会让该会话无法加载**。但要说清分量：
- 窗口极短（一次 `writeFileSync`），
- 且下一次成功写入会自我修复；
- 真正致命的是**恰好在写入中途崩溃**，此时 metadata 截断，该会话从此读不出来
  （`state.json` 因走原子路径而完好，但 `loadSessionRecord` 先读 metadata）。

**方向**：`metadataPath` 与 `current-session.json` 一律改走 `writeJsonFileAtomic`。
这是**低成本、无争议**的修复。

### SES-05 · `state.json` 的 epoch 缺失是 SES-02 的同一件事 — `STALE`（合并至 SES-02）

子代理把它作为独立的 DUR-02 报出。**核实后判定为 SES-02 的重复**——
同一根因（无 fencing），同一修复（epoch 比对）。本册合并，只留 SES-02 一条。

### SES-06 · 证据 parity 显示规则退役 — `FIXED` `P2` `CONFIRMED`（2026-10-02）

删除显示规则表、其专用测试及两个追加调用，保留成功/失败 handoff 格式化器；结果投影去掉无人消费的 evidence 派生字段，快照不再优先 claim-ledger。历史 transcript 仍可含 codingResult，所以保留 actionableFailure 的阻断/下一步兼容解析以及 verify 提示优先级。旧文中「入口恒假」仅适用于当前回合生产链，不能用于否定历史恢复。删除前后均用隔离 CLI 合成提供方回合实际落盘再恢复：正常退出、摘要无 parity；不是 live provider 验证。

以下保留修复前研究事实：

**先给方法**（这决定了数字可信）：

```
声明在 CONTINUATION_EVIDENCE_PREFIXES 里的前缀串          69 条（形状为 `…=`、`…:` 或尾随空格，即 matcher 真正比对的那种）
其中在树的其它文件里能找到生产者的                        2 条
 ⇒ 匹配不到生产者的                                        67 条（97%）
```

**仅有的两条活的**是 `claim-ledger ` 与 `claim-ledger:`，
由 `sessionContinuationProjection.ts:63-64` 引用。

**根因**（这是子代理没走到的一层）：整条链的输入是
`CodingResultSummary.continuation.evidence`，而
**活轨的 turn 层从不产生 `codingResult`**——
`turn/projection.ts:161-190` 构造 `query.completed` 时**没有 `codingResult` 字段**
（`grep -n codingResult turn/projection.ts` 零命中），
`core/shell/sessionTerminalState.ts:62` 的 `state.terminalCodingResult = event.result.codingResult`
因此永远是 `undefined`。

⇒ `collectContinuationEvidenceParityDetails`（`:108`）的第一句 `if (!codingResult) return [];`
**恒真**。即：**这整个 parity 表面在生产中是一个恒空的函数**，
它上面挂着 67 条只为已删除的管线（`real-task-loop`、`proposal-*`、`code-graph-*`、
`edit-repair-*`、`harness-*` 等）写的规则。

**这与 Phase 16 §7 记录的 CB-005 同源**（生产者已删、标签死了、规则还活），
但本轮的**新信息是**：不只是标签死了，**入口条件恒假**——
所以「规则本身仍活（喂入死标签仍匹配）」这句描述也不完整。

**方向**：`continuationEvidenceParity.ts` 与 `sessionResultParity.ts` 的规则表整体重评。
判据与 CDE-02 相同：**有活跃生产者才留，否则删**。
因为它恒空，删除是安全的（无行为变化）——但**这个结论要一次实机验证**
（跑一个真实会话，确认 resumed 摘要里不含任何 parity 行）。

### SES-07 · `listsBySession` 跨会话不回收 — `FIXED` `P3` `CONFIRMED`（2026-10-02）

W3-12 在 substrate transition 更换会话 ID 时释放旧表，并补齐 `discardIfEmpty` 删除成功后的清理。
同 ID/root-only 更新保留清单；共享切换入口从传入会话历史重建清单，不依赖 UI 展示触发恢复。
存储删除失败不清理。
下述为历史定位，原先根据继承关系推断所有删除都经过 read-surface 的结论不成立：
空会话丢弃直接调用 store，现已单独补齐。83 项定向回归通过；撤销两处修复后 3 项回归失败。

`forgetSessionTodos` 的唯一生产调用者是 `session/sessionReadSurface.ts:132`，
在 `deleteSession` 内。子代理据此判「长驻进程内存泄漏」，
但**核实后下降**：

- `deleteSession` 的注释（`:126-131`）声称「Every deletion — the sessions panel,
  `/resume`'s chooser, and the discard of a session nothing was said in — reaches
  the store through here」，而 `SessionManager extends SessionReadSurface`
  （`SessionManager.ts:92`），所以**切换/丢弃会话确实经过它**；
- 泄漏只发生在「**会话被切换到但从未删除**」这种情形，
  且每条记录只有 `{id, text, status}[]`，一个 session 一条。

**方向**：`state.json` 的既有扩展点足够；或改为随 `Session` 实例持有（子代理的建议）。

### SES-08 · 未逐一核验的面（如实记录）

`session/continuation/**`（16 文件）与 `session/recovery/**`（11）的**逐模块**审计未做；
`session/replay/**`、`session/export/**` 的往返正确性未验证；
会话内其它 map 的有界性未系统扫描。§14 列出。

2026-10-03 W7-26进行中：第一批修复了回放跨运行污染、结构化消息丢失、fresh-only的compact事实回流、
重复调用ID错误结算和恢复准入二次加载。13套161项定向验证通过；完整36模块审计尚未完成。
第二批已修复导出分支/重复ID关联、坏图与深树、JSON和元信息凭据脱敏、损坏数据提示及codec消费字段检查；
69套512项、隔离编译命令+浏览器验收通过，反转43项失败后恢复，双线APPROVE/CLEAR。
continuation与损坏记录对恢复准入的影响仍待后续，完整审计尚未闭合；详见Phase18裁决的W7-26第一、二批。

## 7. Provider 与协议（`PRV`）

> 本节由**主代理**完成。子代理 `W2ProviderProtocol` 于 31m47s 后因上游
> `content_filter` 终止（读面涉及 `provider/aws/credentials.ts` 等凭据相邻文件），
> 但它**留下了完整的证据笔记本** `local://slice-W2ProviderProtocol.md` 与 transcript。
> 本节的每一条都由主代理重新跑过或重读代码；
> **笔记本中有一条断言被主代理证伪**（PRV-07）。

### 7.0 Phase 16 的 16-K 修复复核表

| 16-K 声称修好的项 | 本轮复核 | 证据 |
|---|---|---|
| OpenAI 兼容流内 `error` 帧抛错而非吞掉 | ✅ **已修** | `turn/completion.ts:131` 的新增 `DeltaChunk.error` 字段 + `:346-349` `throw new Error("Provider reported an error mid-stream: …")` |
| Google 停因映射出 `error` | ✅ **已修** | `provider/endpoints/googleWire.ts:197-202`：`STOP→"stop"`、`MAX_TOKENS→"length"`、**其余一律 `"error"`** |
| Google 流尾未分隔帧不再丢 | ✅ **已修** | `googleWire.ts:325-341` 的 EOF 分支显式处理残留 buffer |
| Bedrock 展开图片块 | ✅ **已修** | `bedrockConverse.ts:166-182` + `imageFormat()` |
| Bedrock 下发 thinking 预算 | ✅ **已修** | `bedrockConverse.ts:289-295` `additionalModelRequestFields.thinking` |
| 压缩请求带 `supportsTemperature` | ✅ **已修** | `core/query/compaction/summarize.ts:141-143` |
| 停因映射区分拒答 | ✅ **已修** | `turn/step.ts:621-626` 的 `stopReasonOf`：`length`/`stop`/`tool_calls` 之外一律 `error` |

**结论**：16-K 的七项**全部成立**，无回归。

### PRV-01 · Anthropic 在流内 `error` 之后仍等 EOF，与 Bedrock 的处置相反 — `FIXED` `P2` `CONFIRMED`

**2026-09-30 实施/裁决**：ba398a9d：流内 error 立即结束、取消迭代器，保留此前片段并忽略后续事件。46/46；反向用例因后续文本被产出而失败。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

`provider/endpoints/anthropicMessages.ts:471-475`：

```ts
if (event.type === "error") {
  streamFailure = event.error?.message || event.error?.type || "provider reported an error mid-stream";
  continue;        // ← 记下但不中断
}
```

读到 `chunk.done` 才 `break`（`:523`），随后在 `:543` 抛。
**若代理保持连接（keep-alive 很常见），读端会一直等到超时。**

**对照同仓**：`bedrockConverse.ts:396-402` 在解析到 `:exception-type` 时**立即 throw**，
注释明确写「the stream is not read. Draining it would spend the connection on bytes
that cannot change the outcome, and would delay the failure until the provider chose to close」。

**即两个端点对同一问题给出相反处置，且 Bedrock 那侧的理由完全适用于 Anthropic。**
Phase 16 的 12 号文档已记此项；**本轮确认仍未修**（并补上了「两处相反」的对照）。

**方向**：把 `continue` 改为立即 throw（保留 `drain()` 已产出的 fragment，
与 `:509-515` 的 `catch` 分支同一模式）。

### PRV-02 · 次要模型调用的 `supportsTemperature` 是**硬编码 `false`** — `FIXED` `P2` `CONFIRMED`

**2026-09-30 实施/裁决**：154671d6：次要请求与压缩使用目录温度能力，续期也传递；btw 3/3，相关请求/压缩/传输 40/40，build 通过。仅验证请求形状，Google 次要通路的另一个问题见 PRV-12。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

全部 `endpointBody` 调用点只有两个（`grep` 证实）：

| 调用点 | 是否传 `supportsTemperature` |
|---|---|
| `turn/step.ts:303` | ✅ `shape.supportsTemperature`（来自 catalog 的 `compat`） |
| `core/query/compaction/summarize.ts:139-143` | ✅ 来自 `request.provider.supportsTemperature` |
| `provider/request/completion.ts:80-87` | ⚠️ 只在**调用者传了**才转发 |
| → 其唯一调用者 `core/commands/btwCommandRuntime.ts:71` | ❌ **硬编码 `supportsTemperature: false`** |

`false` 在这条路径上的语义是「**不发 temperature**」。所以 `/btw` 侧问题：
**即使模型支持 temperature，也从不发**。这不是 400 风险（不发比发错安全），
而是**该传的没传**——`loadCatalog()` 已经被调用了（`:48`），
`providerEndpoint(catalog, …)` 也已经拿到了条目，缺的只是一次
`resolveRequestShape(...)` 并把它传下去。

**判定**：**真实但低危**。严重度 `P2`：行为不正确、无崩溃、
且与本仓「兼容标志应真正改变请求形状」的既定方向（Phase 5 T3）不一致。

**方向**：`btwCommandRuntime` 改传 `shape.supportsTemperature`。
**注意**：`request/completion.ts:85-87` 的 `!== undefined` 判断本身是对的
（区分「不知道」与「明确为假」），不要改成 `?? false`。

### PRV-03 · `content_filter` 被当作**终止帧**，于是**不进入拒答分类** — `FIXED` `P2` `CONFIRMED`

**2026-09-30 实施/裁决**：3ceed5e7、cb4883e4、4ba647ca：停因进入共享拒答分类；Google 安全原因跨适配器保留，内层重试也先排除拒答。独立相关 119/119。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

这是本轮**新增**的一条，Phase 16 未记。

**事实链**：

1. `turn/completion.ts:401-408` 的 `isTerminalFinishReason` **把 `content_filter` 列为终止**；
2. 随之 `:363` `settled: true` ⇒ 流**停止读取**，**不再消费后续事件**（包括 usage）；
3. `stopReasonOf`（`step.ts:621-626`）把 `content_filter` 映射为 **`"error"`**；
4. 但如果该响应**带了任何文本**，`step.ts:576` 的 `silent = !text && calls.length === 0`
   为假 ⇒ **不会**调用 `emptyAnswerExplanation`，
   于是用户**看不到** `:733-735` 那条为拒答专门写的话
   （「The provider withheld the reply. Rephrasing the request usually gets past it.」）；
5. 用户看到的是**被截断的部分回答**，没有任何说明。

**而 `stopReasonOf` 的 `"error"` 拿不到可行动文本**：
此时 `errorMessage` 是 `undefined`（`Step` 只在 `silent` 时填它），
`isRetryableFailure(step.stopReason, step.errorMessage)` 里
`message = ""`，不匹配 `REFUSAL` ⇒ 落回 `RETRYABLE_FAILURE.test("")` ⇒ **false**。
**所以不会重试（结果是好的），但原因不是「识别出拒答」，而是「空消息不匹配任何模式」。**
两个后果叠加：**拒答被静默地当作截断的回答呈现**。

**方向**：`stopReasonOf` 返回 `error` 时，`toStep()` 应把
`emptyAnswerExplanation(...)` 的结果作为 `errorMessage` **无条件**填上（不止 `silent` 时），
这样 `REFUSAL` 模式能真正命中、用户也能看到那句话。
**不要**把 `content_filter` 从 `isTerminalFinishReason` 里删掉——终止是对的
（拒答不会再有内容），错的是终止之后没有留痕。

### PRV-04 · `btwCommandRuntime` 的静默吞错 — `FIXED` `P3` `CONFIRMED`

**2026-10-02 修复**：缺凭据与已尝试请求原已区分；本次补齐失败分类，并保留单次请求的
HTTP 状态、拒答停因和坏 JSON 分类。33 项定向测试和构建通过，覆盖实际计时器中止与无凭据零请求。
只显示分类，不回显提供方错误正文。自研修复；以下保留修复前诊断。

`core/commands/btwCommandRuntime.ts:77-81`：

```ts
} catch {
  // A side question that fails is a side question with no answer; the
  // fallback below says so rather than reporting a transport error.
}
```

注释说「下面的兜底会说明」，但兜底说的是「没有答案」，
**不区分**「模型没答」与「请求失败了」。用户无法知道是配置错、网络不通还是模型拒绝。
**方向**：至少把失败类别带进兜底文案（`classifyProviderFailure` 已有）。

### PRV-05 · 已核实健全的项（记录以防未来重查）— `STALE`

| 项 | 事实 |
|---|---|
| UTF-8 跨块 | 所有文本流均用 `decoder.decode(chunk.value, { stream: true })`（`completion.ts`、`googleWire.ts:297`、`anthropicMessages.ts:521`） |
| 一个 chunk 多事件 | `while (nextEvent(buffer))` 完整排空 |
| Bedrock 二进制事件流 | 逐帧 CRC32 校验后再解析（`aws/eventStream.ts`） |
| Google 尾帧 | EOF 残留 buffer 显式处理（`googleWire.ts:325-341`） |
| 重定向/`Retry-After` | provider 侧 status/headers 拼装与 429/5xx 分类完整 |
| 端点的 `supportsTemperature` 语义 | 各端点一致区分「缺席＝允许」与「显式 false＝不发」（`&&`/`!== false` 的用法正确） |

### PRV-06 · 未逐一核验的面（如实记录）

- 四个端点的**逐字段请求形状**与参考实现的对照表（笔记本给出了部分，
  主代理只复核了 `supportsTemperature` 与停因两条）；
- 流解析的**完整边界情形矩阵**（SSE 注释、`\r\n` 边界、无终止帧）；
- 用量记账的跨模型/跨 resume 正确性；
- 超时与取消的逐路径覆盖（`provider/request/fetch.ts` 是否被所有路径使用）；
- 凭据路径（`grep -n "Bearer" provider/` 有 114 行命中，未逐条读）——
  **凭据面是两次 `content_filter` 终止的读面，按本仓纪律留给维护者或后续轮次**。

### PRV-07 · **部分输出后的流失败会被外层循环重跑整个 step** — `FIXED` `P1` `CONFIRMED`

**2026-09-30 实施/裁决**：44842ca3：text/reasoning/replace 任一可见输出后都不再自动重试；复用 retriesExhausted，不引入持久化上下文抹除。初验 73/73；撤销后 3 项失败。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

> ⚠️ **本条推翻了我自己 LOP-05 的一半。** 我上一轮写「第 3 层有 `!shownAnything` 守卫
> ⇒ 已在屏幕上显示过内容的请求不会重试，**三层各有明确边界**」。
> **前半句对，后半句错。** 守卫只管**内层**，外层不知道。

**事实链**（主代理逐条 grep + 探针核实）：

1. `turn/step.ts:479` 确实有 `!shownAnything && streamAttempts < retry.maxRetries`
   的内层重试守卫 —— 我上一轮读到的就是这个，**它是对的**；
2. 但守卫为假时，`:492` 走 **`failedStep(str, shown)`**，
   而 `failedStep`（`:706-718`）的 `retriesExhausted` 参数**默认 `false`**；
3. `core/agent/loop.ts:172` 的 `if (step.retriesExhausted) return step;` 因此**不生效**；
4. 接着 `:173` 的 `isRetryableFailure("error", "Network error: …")` ——
   探针实测 **RETRY**（`Network error` 命中 `RETRYABLE_FAILURE` 的 `network.?error`）；
5. ⇒ **外层循环把整个 step 从头重跑。**

**关键证据（谁设过这个标志）**：

```
grep -n retriesExhausted turn/step.ts
  -> 683, 689, 710, 718  ← 全是函数定义/默认值
grep -n 'errorStep(|failedStep(' turn/step.ts
  -> 只有 :429-430 传了 `tried`（provider 内层重试循环那条路径）
```

⇒ **除 `:429-430` 外，`step.ts` 的每条失败路径都不设 `retriesExhausted`**，
所以外层循环对它们一律可见。

**后果**：一个**已经流到一半**的回答（用户已看到开头）失败后，
**整段从头重新生成**——第二次流的内容可能不同，用户看到的是「文本突然被换掉」，
而且**双倍 token**。这正是 `!shownAnything` 守卫想避免的事，只是它的作用域小了一层。

**探针（各失败路径是否可重试）**：

```
RETRY   | step.ts:492 流失败（shownAnything=true）
noretry | step.ts:570 无 choices
noretry | step.ts:453 无 response 对象
noretry | step.ts:385 上下文溢出
```

⇒ **只有 `:492` 这一条**是问题（其余消息不含可重试模式，所以恰好不重试）。

**方向**：`:492` 改为 `failedStep(msg, shown, undefined, /*retriesExhausted*/ true)`
——**已输出过内容的失败不得整段重跑**。或让 `loop.ts` 在
`step.text.length > 0 && step.stopReason === "error"` 时也拒绝重试（更防御，
但把判断放到两层）。**推荐前者**（改动点单一，且语义就在失败点）。

### PRV-08 · Google GenAI / Vertex **完全丢弃图片块** — `FIXED` `P1` `CONFIRMED`

**2026-09-30 实施/裁决**：168d1c0a：两个端点共用 googleWire 图片编码；新旧模型工具结果形状分别处理，旧模型图片放在连续工具响应分组之后。45/45，反向 10 项失败；未做真实提供方调用。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

`provider/endpoints/googleWire.ts` 的 `textOf(content)` 在
`content` 不是字符串时返回 `''`（`:65` 一带），于是
**带图片数组的 user 消息整条被丢掉**（`:116-120`）。

**证据**：`grep -rn 'image|inlineData|bytes' provider/endpoints/google*` → **0 命中**
⇒ **没有任何图片编码分支存在**。

**对照**：
- 参考实现 `pi/packages/ai/src/api/google-shared.ts:213-219` 把多模态编码为
  `{ inlineData: { mimeType, data } }`；
- **同仓**的 `anthropicMessages.ts:264-275` 与 `bedrockConverse.ts:166-182` **都做了**。
⇒ **四个端点里三个支持图片，Google 两个端点没有。**

**注意与 16-K 的关系**：16-K 修的是 **Bedrock** 丢图片，
**Google 的同类问题当时没有被发现**（§7 的复核表里 Google 只查了停因与尾帧）。
**这是「同一缺陷在多端点重复、只修了一处」的又一例**——
与本册 TOL-01/`bridgeSafe`、SES-06 同型。

### PRV-09 · 安全拒答的 `finishReason` 只在 `content_filter` 一个值上被识别 — `FIXED` `P2` `CONFIRMED`

**2026-09-30 实施/裁决**：3ceed5e7、cb4883e4、4ba647ca：共享拒答词汇扩展、适配器透传安全停因、内外重试一致；unknown/malformed 仍归普通 error。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

`turn/step.ts:729-740` 的 `emptyAnswerExplanation` **只判 `content_filter`**：

```ts
if (finishReason === "length")       return "…context is probably full…";
if (finishReason === "content_filter") return "The provider withheld the reply…";
if (reasoningLength > 0)             return "…spent the whole turn working…";
return `The model returned nothing at all…check the provider with \`/connect\`.`;   // ← 兜底
```

而各端点的拒答值不同：Anthropic 用 **`refusal`**、Bedrock 用
**`guardrail_intervened`**、Google 现在映射为 **`error`**（`googleWire.ts:197-202`）。

⇒ **除 OpenAI 兼容之外的拒答全部落到兜底那句**，
告诉用户「the model returned nothing at all … check the provider with `/connect`」
——**把一次安全拦截描述成连接故障**，方向完全错误（与 `retry.ts` 里
`REFUSAL` 单独成类的理由——「conflating them would report a safety block
as an exhausted account」——**是同一个错误，只是在文案层**）。

**方向**：把判据从「等于 `content_filter`」改成「命中 `retry.ts` 已有的 `REFUSAL` 模式」
（那个正则已经覆盖 `content_filter`/`safety`/`recitation`/`prohibited.?content`/
`refused the prompt`），并补上 `refusal`/`guardrail_intervened` 两个端点专有值。
**两处应当共用同一个判定，而不是各写一份。**

### PRV-10 · 用量遥测跨会话恢复 — `FIXED` `P2` `CONFIRMED`（2026-10-02）

已在既有 `state.json` 写入路径持久化累计分桶，并在共享启动/切换入口恢复；键保持完整 `provider/model`。锁内合并本进程自上次成功保存后的增量，避免并行写入覆盖及重复累计；无 live 记录保留磁盘值。上下文 footprint 与近期缓存比较历史只属于当前进程，恢复时重新测量。旧会话未记录的用量无法追补，记录到下一次状态写入之间的崩溃窗口仍存在。定向测试、独立复核和实际 PTY/JSON 恢复验收见裁决 §8.4。

以下保留修复前研究事实：

`observability/usageTelemetry.ts:225` 的 `sessionTelemetries` 是
`Map<string, SessionUsageTelemetry>`。`grep` 在 `session/**` 内
**0 命中**（无任何持久化或恢复调用）。

⇒ **恢复会话后 `/cost` 与状态栏从零开始**——同一条会话的历史用量不可恢复。
**注意**：这与 Phase 6 的 T3（按模型/按 provider 分桶）**不冲突**，
T3 修的是**同进程内**换模型后的计价，**没有涉及跨进程**。
⇒ `PRV-10` 是 T3 的**残留边界**，不是回归。

**方向**：把 telemetry 快照随会话落盘（`state.json` 的既有扩展点），resume 时载回。

### PRV-11 · `provider/**` 与 `model-adapters/**` 的死码（**新发现，此前未登记**） — `FIXED` `P3` `CONFIRMED`

**2026-09-30 实施/裁决**：4a4acf91、ff4d9900、07e21e80：移除无人消费的 registry 投影、hasImageContent、parseStreamingJson 和第二套浏览器映射；保留失败分类、readiness 与类型。逐簇 build 通过。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

子代理 `F2ProviderTables` 报了三处，**主代理逐条 grep 复验，全部成立**：

| 目标 | 生产消费者 | 事实 |
|---|---|---|
| `provider/request/packet.ts`（`buildTaskRequestPacket`） | **0** | 只在自身测试、`index.ts` 桶导出里出现 |
| `provider/registry/provider.ts:295-739` 的 `projectProviderRegistry` + **15 个**内部函数（**~445 行**） | **0** | 同文件其余部分**是活的**（`turn/step.ts:12` 用 `classifyProviderFailure`、`core/agent/loop.ts:2` 用类型、`core/shell/providerReadiness.ts:4` 用类型）⇒ **一个文件里活着一半** |
| `model-adapters/multimodal.ts:123` 的 `hasImageContent` | **0** | |
| `model-adapters/jsonRepair.ts:204` 的 `parseStreamingJson` | **0** | 同文件的 `parseJsonWithRepair` **是活的**（`turn/step.ts:4`） |

**注**：`provider/request/packet.ts` **已在本册 §12 的「运行期死码」表里**
（CDE-05 单文件簇），**其余三项是新的**。

**判定**：`projectProviderRegistry` 这 ~445 行是**同一文件内的死半**——
比「整个文件死」更难发现，因为 `grep provider.ts` 会命中三条活引用。
这类**半死文件**是本仓死码检测的一个盲区：
`check:call-reachability` 按**模块**报，模块整体有消费者就不再往下看。

**方向**：删 `projectProviderRegistry` 及其 15 个私有函数、
`packet.ts`、两个未用导出。**先确认**没有测试依赖它们的**行为**
（测试引用不算生产消费者，但删前要知道会动哪些测试）。

### PRV-12 · Google 次要请求使用流式 URL，却按单个 JSON 响应读取 — `FIXED` `P2` `CONFIRMED`

**2026-10-02 实施**：端点路径增加单次/流式模式；两个 Google 端点的侧问题与压缩走
`generateContent` + JSON Accept，主回合走 `streamGenerateContent?alt=sse`，沿用同一内容转换器。
两端点 × 三调用入口的 URL/响应格式矩阵及本地 HTTP 六请求验收通过；无真实 Google 调用。
以下保留修复前事实。另确认 `bedrockConverse` 的 simple body/readBody 已存在但 path 固定
`converse-stream`，是先前同型缺口，纳入 W7-27 的非流式请求审计；本次不宣称所有端点均支持单次方法。

**2026-09-30 新发现，读码确认**：`provider/request/completion.ts` 的
`requestSimpleCompletion` 与 `core/query/compaction/summarize.ts` 的
`requestCompactionSummary` 都调用 `endpointUrl` 后执行 `res.json()`。
两个 Google 端点的 path 均为 `streamGenerateContent`，其中 Vertex 明确请求 `alt=sse`；
`readGoogleBody` 接受单个候选文档，不接受 SSE 文本或数组。
因此次要通路的 URL/响应解码契约不一致。该问题早于本轮温度能力修复。

**影响与证据边界**：影响 `/btw` 与压缩的 Google 请求；本轮温度测试仅证明 body 的字段传递，
没有真实提供方调用，不能把该测试推广为通路成功。
**后续修复方向**：由端点所有者明确区分单次与流式路径，或统一复用已存在的流读取器；
先对照底层 SDK 对两种方法的使用，再以 URL 与真实响应格式成对的合成测试验证。
不新增第二份 Google 内容转换器。

---

## 8. 上下文与记忆（`CTX`）

> **本节的覆盖是部分的，如实说明**：子代理 `W3MemoryContext` 因上游 402（额度耗尽）
> 于 14m02s 终止，**无产出**。本节的条目全部由主代理亲验，
> 因此**只覆盖 Phase 16 的 16-A / 16-B 两项修复的复核 + 上下文记账**，
> 不覆盖 `memory/**` 36 个模块与 `context/**` 28 个模块的逐模块审计。
> 缺口列在 §14。

### CTX-01 · 16-A 记忆注入链**已接通** — `FIXED`（`CONFIRMED`）

Phase 16 §17.2 记录的头条缺陷是「`projectMemoryStore` 从不出现在任何 CLI 装配点」。
**现状已修，两条装配路径都在**：

| 装配点 | 位置 |
|---|---|
| turn 路径 | `cli/runtime/cliSessionRuntimeFactory.ts:324` `projectMemoryStore: createProjectMemoryLocalStore({ ref: { mode: "explicit-local", root: projectMemoryRootFor(...) } })` |
| 命令路径 | `entrypoints/cliCommandExecutionBridge.ts:123` |

注入点 `core/shell/sessionFutureTurnProjection.ts:101` 的 `memoryStore: input.deps.projectMemoryStore`
因而**拿到了真实的 store**。

**未修的是「表面文案」**：`memory/projectMemoryReviewSurface.ts:40-42` 的输出里
`- Persistence: not enabled` / `- Cross-session loading: none` /
`- Retrieval / wake-up / recall: not enabled` 是**硬编码字面量**，
不来自 `health`（对照 `projectMemoryDeleteSurface.ts:40` 与
`projectMemoryStoreSurface.ts:29` 都用 `input.health.mode`，是**同一个目录里的两种做法**）。

⇒ **见 CTX-02。**

### CTX-02 · `/memory review` 的持久化状态是硬编码文案，不是实测值 — `FIXED` `P2` `CONFIRMED`

**2026-10-02 修复**：命令层读取实际 store health，review 与 status 共享状态投影。
可读、可写、模式、健康诊断与本次是否写入分别展示。10 文件 / 90 项定向测试和构建通过，
撤销接线后新增 7 项全部失败。以下保留修复前诊断。

`memory/projectMemoryReviewSurface.ts:39-42`：

```ts
"- Memory written: no",
"- Persistence: not enabled",
"- Cross-session loading: none",
"- Retrieval / wake-up / recall: not enabled",
```

四条**全部是字面量**，没有一个读 `input.health`。
而同一个目录下 `projectMemoryDeleteSurface.ts:40` 写 `\`- Store mode: ${input.health.mode}\``，
`projectMemoryStoreSurface.ts:29` 同——**两套做法并存**。

**实机**（隔离 `HOME`，`/memory`）：

```
- Persistence: not enabled
```

**判定**：**这正是维护者点名的那一类**——「用看起来像状态输出的字符串掩盖真实状态」。
它是否构成**欺骗**取决于语义：
若这些行的意思是「本 session 未启用持久化」，那是**结论**；
若读起来像「去探测过，结果是未启用」，那是**断言**。
无论哪种，**它现在不随实际状态变化**，所以至少是**误导**：
16-A 接通之后 store 是可写的，用户仍会读到「not enabled」。

**方向**：改读 `health`（`mode`/`writable`/`root`），
或把这四行改成一句关于**本次调用明确做了什么**的话
（对照 `:37` 的 `- Outcome: ${input.outcome ?? "listed"}` 已经是动态的）。

### CTX-03 · 16-B `/compact` 合并与钩子**已成立** — `FIXED`（`CONFIRMED`）

Phase 16 §17.2 记「`/compact` 是 `previewOnly` 报告、真压缩路径不派发钩子、
`reason:"manual"` 零生产者」。**现状**：

| 声称 | 复核 |
|---|---|
| `/compact` 走真引擎 | ✅ `core/shell/compaction.ts:177` 的 `compactSessionHistory` 调 `condenseContext({ force: true, ... })`（`:194-206`） |
| `PreCompact`/`PostCompact` 派发 | ✅ `buildCompactionLifecycle`（`:27-58`）里 `before` 派发 `PreCompact` 并在 `decision === "block"` 时返回 false（`:148` 有对应结果）；`after` 派发 `PostCompact` |
| **两条路径共用同一 builder** | ✅ 手动路径 `:180`，自动路径 `turn/session.ts:275` 与 `:387`——**同一函数**，注释也写明「One builder for both entry points, so a hook sees the same event with the same reason」 |
| `reason: "manual"` 有生产者 | ✅ `:179` `const reason = input.reason ?? "manual"` |
| `reason` 三种取值都有生产者 | ✅ `"threshold"`（`turn/session.ts:279`）、`"overflow"`（`:391`，救援压缩）、`"manual"`（手动）——注释还解释了 `overflow` 「was a declared reason with no producer」 |

**结论**：16-B 全部成立，无回归。

### CTX-04 · 上下文记账**已包含系统提示与工具 schema** — `FIXED`（`CONFIRMED`）

Phase 11 记录「`RequestOverhead` 不计入上下文估算」。**现状**：

- `session/context.ts:49-60` 定义 `RequestOverhead { systemPrompt?, tools? }`；
- `overheadCharCount`（`:63-75`）把工具的 `JSON.stringify(...).length` 计入；
- `estimateRequestTokens`（`:78-84`）在**一个地方**完成相加；
- 装配点 `entrypoints/cliRuntimeInvocation.ts:501` 的 `withRequestOverhead(request.compaction, {
  systemPrompt: buildSystemPrompt(...), tools: toolSchemas(tools) })`
  ——注释明确：「Computes here because this is the only place both facts exist:
  the instruction as it will be sent, and the declarations of the tools actually
  in the pool **after the user's own filters have been applied**」；
- 三个阈值读取点（`session/compaction.ts:344`、`:364`、`isBelowThreshold`）**全部**用
  `policy.measureContextTokens?.(...) ?? estimateRequestTokens(messages, policy.overhead)`
  ——即**provider 的实测值优先，估算只作冷启动兜底**。

**判定**：Phase 11 的缺口**已闭合**，且做法比「把 overhead 加进 estimate」更正确
（实测优先）。**记录以防未来误判重查。**

### CTX-05 · 记忆的「显式 opt-in」是有意分歧，不是缺陷 — `STALE`（留档）

Phase 16 §5 已裁定：我方是**显式 `/memory use`**，参考实现（Claude Code）是
**每会话自动注入索引**。本册**确认该分歧仍然存在且是有意的**，
不重复登记为缺陷。**仅记录**：若未来要做自动注入，`projectMemoryFutureTurnInjection.ts`
的实现已经具备（预算、合并策略、质量评估、冲突检测），缺的是**默认值**与
**提示注入面的产品决定**。

## 8bis. 内核循环与守卫（`LOP`）

> 本节**零覆盖**是上一轮的缺口：`turn/**`(10) + `core/agent/**`(7) + `core/query/**`(20)
> 的审计在子代理队列里，但派不出去了（402）。**主代理本轮补完**，
> 覆盖：循环边界、两层重试、中止传播、工具批、Doom Loop。

### LOP-01 · 重复请求拦截的证据陈述 — `FIXED` `P2` `CONFIRMED`

**2026-10-02 修复**：提示描述请求次数或循环序列次数，移除未做过的状态进展判断，
也不把即将拦截的请求声称为已经执行。阈值保持不变。2 文件 / 30 项通过，
回退提示后 2 项失败；以下为修复前记录。

**事实**（探针直调 `DoomLoopDetector`）：

```
3x identical read: [false,false,true]          ← 第 3 次即 isDoomLoop
alternating read/edit, flagged at call # 10
public methods: constructor, recordAndCheck, reset, …
```

`DoomLoopDetector` 用**同一工具名 + 同一参数哈希连续三次**判为循环
（`turn/tools.ts:158` 的 `new DoomLoopDetector(3)`）。

**两个问题**：

1. **阈值对「读」太紧**：一个 `read` 同一文件三次是合法行为——
   文件在两次之间被改过、或模型在确认一次编辑的结果。
   探针确认第 3 次就被 `block: true`。
   而**循环是每个 turn 新建的**（`createToolHooks` 在 `runTurn` 内，`turn/session.ts:227`），
   所以是**同一个 turn 内三次**，概率不高但确实存在。

2. **阻断消息宣称它没有验证的事**。`turn/tools.ts:196` 的原文：

   > `… has been repeatedly executed N times with identical arguments
   > **without state progression**.`

   而 `doomLoopDetector.ts` **不比较任何结果**——它只有
   `{toolName, argsHash, timestamp}`（`:1-5`）。
   **参数相同 ≠ 状态未推进**：一个 `read` 在同一参数下可能每次返回不同内容，
   而同一个 `grep` 无结果反覆三次可能正是模型在**逐步收窄**。

**判定**：与 `AGENTS.md`「不要用看起来确凿的措辞断言你没有验证的东西」同型。
**这是本册里第 4 处「文案宣称了代码没做的事」**（另三处：SES-03 的夺取通知、
BRW-01/02 的守卫注释、CMD-02 的宣传）。

**方向**：把「without state progression」改为它真正有依据的说法
（「同一工具以相同参数连续调用 N 次」），或把结果纳入判据
（结果相同才叫无推进）。**前者更省且更诚实。**

### LOP-02 · 内核循环**没有步数上限**，上限由 `shouldStopAfterStep` 从外部按 — `STALE`（已核实健全，留档）

`core/agent/loop.ts:231` 的 `while (true)` 是**无界**的，`grep maxSteps core/agent/loop.ts`
零命中。**但这不是缺陷**：`turn/session.ts:267` 的
`shouldStopAfterStep: () => projection.stepCount >= options.maxSteps`
在每步之后被 `loop.ts:315` 询问，`options.maxSteps` 来自 `request.maxTurns`
（默认 15，`cli-runtime` 装配）。同时 `:259` 的 `allowTools: projection.stepCount < options.maxSteps`
在达到上限后**停止授予工具**——所以模型不会在最后一步还能继续调工具。

**判定**：设计上把「跑多久」放在 turn 层（它知道用户配的 `maxTurns`），
loop 层只提供钩子。**这是正确的分层**，不是遗漏。**留档以防未来误判为无界循环。**

### LOP-03 · 工具批的终止语义是「全部说停才停」 — `STALE`（已核实健全，留档）

`core/agent/tools.ts:252`：

```ts
return results.length > 0 && results.every((result) => result.terminate === true);
```

即 `terminate` 只有在**批内每一个工具**都要求终止时才生效。这看起来像常见 bug
（`some` 与 `every` 写反），但**核实后是正确的**：
`terminate` 的语义是「这次调用之后没有更多要做的了」，
一个工具说停而另一个没说，说明还有事要做。**留档免得被「修正」成 `some`。**

### LOP-04 · 中止传播在每个 await 点之后都检查 — `STALE`（已核实健全）

`core/agent/tools.ts:184`、`:198`、`core/agent/loop.ts:305` 三处都在 await 之后
立刻 `if (signal?.aborted)`。`loop.ts:306-310` 在中止时仍发出
`turn_end` + `agent_end`（不静默退出）。**健全。**

### LOP-05 · 两层重试分工**有缺口**：内层守卫只管内层 — `FIXED` `P1` `CORRECTED`

**2026-09-30 实施**：44842ca3、4ba647ca：可见输出禁止内外层自动重试，拒答词汇先于网络错误判断；独立相关 119/119 通过。以下保留修复前研究记录。

> ⚠️ **本条初稿判定为「已核实健全」，是错的。** 详见 **PRV-07** 的完整证据链。
> 我当初只读到 `turn/step.ts:479` 的 `!shownAnything` 守卫就下了结论，
> **没有跟到 `loop.ts:172` 的 `retriesExhausted` 究竟由谁设置**。
> `H2`/`F2` 两个子代理都独立指到这一点，我 grep 后确认：

```
grep -n 'errorStep(|failedStep(' turn/step.ts   -> 只有 :429-430 传了 `tried`
```

⇒ **除 provider 内层循环那条路径外，`step.ts` 的每条失败路径都不设 `retriesExhausted`**，
所以 `loop.ts:172` 的守卫对它们**一律不生效**。

**仍然成立的部分**（我当初读对的一半）：

- `loop.ts:173` 的注释「一个自己层里已经重试过的 step 不再被这里重试」——**设计意图正确**；
- 三层结构（provider 内层 → step 流内 → loop）**确实存在**；
- `!shownAnything` 守卫**确实**阻止了**内层**重试已显示内容的请求。

**判定**：设计对、实现漏了一处接线。**记本条为 `CORRECTED` 而不是删除**——
保留我当时的错误判断与更正过程，因为「读到一半就下结论」这个错误**本册已经犯过 3 次**
（`TOL-02` 把生产实现判为更弱、浏览器表把 12 个装配模块判为死码、本条）。
**三次都是同一个模式：只看了一层就断言这一层的行为。**

### CTX-06 · 记忆文件只读时**未捕获的 EACCES 直接抛出** — `FIXED` `P1` `CONFIRMED`

**2026-09-30 实施/裁决**：8dcff541：追加失败返回 blocked，不泄漏未捕获异常；与损坏读写边界共同通过 9/9。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

`memory/projectMemoryLocalStore.ts:109-118` 的 `mkdirSync` **有** try/catch，
其注释明确写「A read-only checkout is a normal thing to work in. The write is refused
with the reason rather than thrown, so a memory that cannot be recorded reports that
instead of taking the session down with it.」——
**但 `:133` 的 `fs.appendFileSync(recordsFile, …)` 没有包。**

**触发条件**（关键）：**目录可写、文件只读**。此时 `mkdirSync(recursive)` **成功**，
所以第一个 try/catch 不触发；随后的 `appendFileSync` 抛 EACCES，
**逃出 store、逃出命令**。

**主代理复现**（探针，可重跑）：

```
seed: written=true file=true
CTX-06 read-only file, second write THREW: EACCES: permission denied,
        open '/tmp/mem6-…/project-memory.jsonl' | code: EACCES
```

即：**一条记录已存在，文件被置只读，再写第二条 ⇒ 未捕获异常。**
同文件的 `invalidateRecord`（`:199-209`）与 `deleteRecord`（`:273-285`）
**都返回 `blocked(...)` 而不是抛** ⇒ **同一个 store 里两种处置**。

**方向**：把 `:133` 包进 try/catch，返回
`blocked("project-memory-local-store:write-unavailable", …)`，与另外两个方法一致。
**这是一个 catch 块的差距，不是设计问题**——注释已经写出了正确意图。

### CTX-07 · JSONL 任一行损坏 ⇒ `list()` / `health()` **整体抛异常** — `FIXED` `P1` `CONFIRMED`

**2026-09-30 实施/裁决**：b70b5902：逐行读取存活记录并报告诊断；损坏或不可读存储阻止变更、保留原字节。读取许可与写入许可已区分。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

`memory/memoryPersistence.ts:31-36`：

```ts
return fs.readFileSync(recordsFile, "utf8").split(/\r?\n/)
  .map((line) => line.trim()).filter(Boolean)
  .map((line) => JSON.parse(line) as ProjectMemoryStoreEntry);   // ← 无 try/catch
```

**主代理复现**（探针，可重跑）——文件内容 = 1 条合法 + `NOT_JSON` + 1 条被截断：

```
CTX-07 list()   THREW: Unexpected token 'N', "NOT_JSON" is not valid JSON
CTX-07 health() THREW: Unexpected token 'N', "NOT_JSON" is not valid JSON
```

**为什么这是 P1**：`health()` 是**状态面板调用的**（`/sidebar`、`/memory`），
而 `list()` 是注入规划调用的。⇒ **一行坏数据让整个记忆子系统不可用**，
用户看不到健康度、也读不到检索结果。

**对照本仓既有做法**：`session/sessionEventCodec.ts:317` 的
`classifyTranscriptLine` 把无法解析的行归为 `unreadable` 并**跳过**，
且 Phase 16 §4.2 明确把那个行为记为「**已正确处理，不记为缺陷**」。
⇒ **同一个仓库里，transcript 的损坏被正确隔离，记忆的损坏没有。**
这一对比本身就是修复方向：**按行隔离，收集诊断，返回存活条目**。

### CTX-08 · 记忆状态面：4 个缺快照、3 个部分派生、1 个模型提示面 — `FIXED` `P2` `CONFIRMED`

**2026-10-02 修复**：四个缺快照的用户面完成接线；三个部分派生的面移除已过时的能力常量。
共享健康投影保留 disabled、readable、writable、degraded 的差别；模型提示面保留其单次授权合同。
「6」混入了原表中的对照项，正确口径为 4 + 3 + 1；下表保留修复前调查范围。

`CTX-02` 记录了 `projectMemoryReviewSurface.ts:39-42` 的四行硬编码文案。
修复前同型缺快照面为**4个**；下面两个标为对照的面不计入同型缺陷。
此外3个部分派生面及1个模型提示面使用不同判据，详见上方4+3+1口径：

| 文件 | 行 | 形态 |
|---|---|---|
| `memory/projectMemoryReviewSurface.ts` | 39-42 | **完全**硬编码（连 `health` 参数都没接） |
| `memory/projectMemoryCandidateSurface.ts` | 34-38, 72 | 硬编码 |
| `memory/projectMemoryInjectionSurface.ts` | 23-33 | 硬编码 |
| `context/compact/delivery/compactSessionSurface.ts` | 16-19, 30 | 硬编码 |
| （对照）`projectMemoryStoreSurface.ts` | 29 | ✅ 读 `health.mode` |
| （对照）`projectMemoryDeleteSurface.ts` | 40 | ✅ 读 `health.mode` |

**结构性原因**：`RunProjectMemoryReviewCommandInput` 与
`RenderProjectMemoryReviewSurfaceInput` **根本没有 `health` / `memoryStore` 参数**
——所以那个 surface **拿不到真实状态**，只能印常量。
⇒ 修复不只是改字符串，**要先把 store 穿进命令层**（与 16-A 接通注入链同型的接线工作）。

### CTX-09 · 五处**单调增长**的数组/映射（无上界、无淘汰） — `FIXED` `P2` `CONFIRMED`（2026-10-02）

W3-13 已限制五处 owner 的历史容量及外层会话表：会话 128、读取路径/会话 256、
checkpoint 总量 256、注入历史与 review decisions/会话 256。保留最近写入的会话及最近历史，
review 优先保留当前候选；淘汰 checkpoint 同时清理 latest 索引。
`dropped`/`incomplete` 随状态保留，命令诊断显示历史不完整；被淘汰的读取记录退回磁盘读取，
审批和注入状态不复活。异步检索期间被淘汰则跳过注入，迟到失败不重新建旧状态。
上限是条目数，不是字节限额。Phase18后续审计更正：W7-32因read去重无法证明正文仍在模型上下文且mtime不足以证明内容未变，已删除该缓存及其容量状态；其余四处容量策略保持。以下保留修复前证据。

| 位置 | 结构 | 事实 |
|---|---|---|
| `core/tools/readCache.ts:23` | `seenBySession` + 每会话路径表 | **无 size 上限、无 LRU** |
| `context/compact/checkpoint/compactLiveCheckpoint.ts:67,78,138,154` | `checkpointsById` | **从不删除**；被取代与被清空的 checkpoint **永久留存** |
| `context/compact/injection/compactInjectionState.ts:70,101` | `supersededCheckpointIds` | **单调增长** |
| `memory/projectMemoryInjectionState.ts:82,99` | `supersededInjectionIds` | **单调增长** |
| `memory/projectMemoryReviewState.ts:64,80,115` | `decisions` | 累积**所有**历史被取代候选 |

**判定**：与 Phase 16 §4.5「未发现的无界增长」的结论**冲突**——
那一轮写道「`crashLog` 有 5 条/7 天双上限；`PasteStore` 有 `MAX_HELD = 128`；
`KillRing` 16；`EditHistory` 有 limit……**未发现无界增长**」。
**本轮在同一仓里找到 5 处**，说明上一轮的扫描**没有覆盖 `readCache` 与 compaction/memory 的状态存储**。
**这正是「常驻登记册」存在的理由**——上一轮的「未发现」被下一轮证伪。

**方向**：按上界给每处加容量（轮转或 LRU）。`compactLiveCheckpoint` 与
`projectMemoryReviewState` 是**跨会话**的，优先级最高。

## 9. 工具与执行（`TOL`）

> **覆盖是部分的**：子代理 `W3ToolsExec` 因上游 402 终止（14m12s，无产出）。
> 本节条目全部由主代理亲验，覆盖：`permissions` 死字段、`edit/patch` 三角的判定、
> 沙箱双实现、以及执行运行时的几处检查。**未覆盖**：每个内置工具的逐字段核对、
> 编辑路径的完整原子性、重试/分类表。缺口列在 §14。

### TOL-01 · `ToolDefinition.permissions` 17 处声明、**零读取者** — `FIXED` `P2` `CARRIED-OVER`

**2026-09-30 实施/裁决**：c75d0bb9、50771545：删除无人消费的权限声明和旧白名单，实际目标解析、turn 授权和 hook 仍在。21 文件 241/241，build 通过。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

> **更正**：本节初稿写「与已删的 `bridgeSafe` 同型——**第二次出现**」，
> **这是错的**。核实后：它**就是** Phase 15 §16.3 已登记的那一条
> （`_index.md:1423-1428`），当时写明「要么接上…要么连同 `ToolPermissionRequirements`
> 一起删。**独立裁决**」。所以这是 **CARRIED-OVER**，不是新发现。
> **本轮的新信息有三条**：①声明数从当时记的 **21** 更正是 **17**（多轮删除后重数）；
> ②`bridgeSafe` 已经按「从未被读过 ⇒ 删」的先例被删（`phase-16-decisions.md:41`），
> **该先例现在直接适用于本条**；③确认 `ToolPermissionRequirements`
> **除 `ToolDefinition.permissions` 外无任何其它引用者**（含类型引用）——
> 当时「需确认 sandbox 层未来是否要用它」这一保留条件，可以按下面的方式收口。

**方法**（两种引用形态都查了，避免单引号漏检）：

```
grep -rn "permissions: {" --include=*.ts .    -> 17 处声明（10 个工具文件 + registry.ts 7 处）
grep -rn "\.permissions" --include=*.ts .   -> 仅 4 处 navigator.permissions（browser/stealthPreload.ts）
                                                  与 0 处对 ToolDefinition 的读取
grep -rn "tool\.permissions\|def\.permissions\|\.permissions\.check"  -> 零命中
```

`ToolPermissionRequirements`（`tools/types.ts:51`）与
`ToolDefinition.permissions`（`tools/types.ts:59`）**除彼此以外没有任何引用者**。

**真正的审批门**在别处：`turn/tools.ts` → `core/query/toolPolicy.ts` →
`core/tools/permissionContext.ts`（`pathPermission`/`processPermission`）。

**判定**：与 Phase 16 已删除的 `CommandDefinition.bridgeSafe`（**54 处声明、0 读取者**）
**完全同型**——**第二次出现**。当时的处置是**删除**（依据：`git log -S` 显示自项目初始化
就存在、从未有提交加过读取者、无文档注释、非交互派发是硬编码清单）。

**方向**：按同一先例**删除** `ToolDefinition.permissions` 与 `ToolPermissionRequirements`
（17 处声明）。**但删前须确认一件事**：`AGENTS.md` 提到 sandbox 层未来可能要用它。
若确实预期接上，则应写进 disposition 并给出接入点，而不是继续留着 17 处空实现。
**这是本册里「最容易做、最容易反复」的一条**——它已经以 `bridgeSafe` 的名字被删过一次。

### TOL-02 · `edit/patch` 三角：**判定删除**（一套更弱的检测器） — `FIXED` — `CONFIRMED`

**2026-09-30 实施/裁决**：c13fa25d：执行删除封闭三角，保留生产原文区间检查及不相交级联回归。21 文件 93/93，撤销生产检查后回归失败；此前候选误报断言仍只保留历史证据等级。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

> ⚠️ **本条推翻了我自己上一句结论**。§9 初稿写「`edits[]` 分段形式**没有重叠检查**」，
> 并据此建议「先验证再二选一」。**那句是错的。** 子代理 `H2EditAtomicity`
> 指到 `core/tools/editEngine.ts:430-441`，我读码确认如下：

```ts
const ordered = [...located].sort((l, r) => l.edit.start - r.edit.start);
for (let index = 1; index < ordered.length; index += 1) {
  const previous = ordered[index - 1]!;
  const current = ordered[index]!;
  if (previous.edit.end > current.edit.start) {
    return { success: false, content: originalContent,
      error: `edits[${previous.index}] and edits[${current.index}] overlap. …` };
  }
}
```

**生产路径有区间重叠检查**（按 `start` 排序后比 `previous.end > current.start`），
且 `core/tools/registry.ts:650` 的 `edits[]` 分段形式**正是**委托给
`replaceManyInContent`（`registry.ts:5` 的 import）。所以：
**生产路径既做唯一性计数（`replaceInContent`）又做区间重叠（`replaceManyInContent`）**。

**而三角里那个检测器更弱**：`edit/patch/apply/conflict.ts:121-142` 的
`verifySequentialOrder` 用**顺序文本搜索**，对**互不相交**的替换会**误报**——
例如 `gamma→beta` 与 `beta→delta` 这样的级联，它会报 `order-dependent-conflict`。
即：**它会把合法编辑判为冲突**。

**判决**：**无「生产漏检而它抓到」的用例；反向用例存在**。
按 §2.2 的口径，`edit/patch/{plan/hunkSet.ts,plan/fencedEditMapping.ts,apply/conflict.ts}`
（219+189+24 = **432 行**）**按 CDE-01 删除**，不要接入。
子代理声称「排除了 6 个假设」（重叠区间、同 oldText 目标、乱序数组、
按行裁剪的模糊重叠、相邻编辑、级联 token 引入），我复核了重叠区间与级联两条，**与其结论一致**。

**这条的方法论价值**：我上一轮**没有找到反例**就写了「建议接入」的倾向，
而真相是**生产实现更好、候选实现更差**。
「没找到反例」不等于「候选更强」——必须**反向也测一次**（候选会不会误报）。

### TOL-03 · 沙箱有两套，活的是 OS 级那套 — `FIXED` `P2` `CONFIRMED`

**2026-09-30 实施/裁决**：f69ff3f6：移除未采用的进程内沙箱四类；活跃审批类型归 core/shell/approval/contract.ts，OS 隔离保留。10 文件 102/102。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

| 实现 | 规模 | 状态 |
|---|---|---|
| `sandbox/osSandbox.ts` | 340 行 | **活轨**：`bwrap`（Linux）/ `sandbox-exec`（macOS），被 `core/tools/registry.ts:141` 的 `planCommandLaunch` 与 `core/hooks/hookDispatcher.ts:5` 使用 |
| `sandbox/{sandboxPolicy,sandboxEnforcer,escalationWorkflow,auditTrail}.ts` + `index.ts` | 834 行 | **从未实例化**（`new Sandbox*`/`new EscalationWorkflow`/`new AuditTrail` 生产零命中）；`index.ts` 只被 `import type { EscalationPrompt }` 引用（17 个文件） |

**这是「编译契约」而非纯死码**：`EscalationPrompt`/`EscalationResponse` 是**活轨需要的类型**
（审批提示的形状），所以**不能整文件删**——但四个**实现类**不产生任何行为。

**方向**（按 §2.2 六项检查）：把 `EscalationPrompt`/`EscalationResponse` 等类型
移到真正的所有者（`core/shell/approval/**`），再删四个实现类。
**须先确认** `core/tools/permissionContext.ts:2` 的 `import type { PermissionCheck }`
引的是 `sandbox/index.js` —— **删除会牵动它**（这正是「不能整文件删」的实例）。

**关于 `planSandboxedCommand` 的保证**（已核实）：三种状态
（`isolated` / `unavailable` / `off`）如实上报，
`core/tools/registry.ts:200` 把 `sandbox.notice` 与网络提示**一起放进结果**——
**不静默降级为无隔离**。这一条是健全的。

### TOL-04 · 每个内置工具的 schema 字段**全部有读取者** — `STALE`（已核实健全，留档）

Phase 5 曾在 `edit`/`write` 上发现 **3 处**「参数被接受、从不读取、却返回成功」
（`edits[]`×`oldText/newText`、`content`×`oldText/newText`、`replaceAll`×`edits`）。
**本轮逐字段重扫，全部已修**：

- **10 个独立工具模块**（glob 2 / grep 5 / webFetch 2 / webSearch 2 / lsp 3 / ask 1 /
  todoTool 3 / taskTool 6 / skill 1 / browserToolUnified 6 = 31 个字段）：
  **无一个字段缺少读取者**。
- **`registry.ts` 的 read / write / edit / bash**：直接读 + 经
  `resolveToolTarget(args, 'path', …)`（`permissionContext.ts:5-16`，内部 `args[key]`）
  间接读取，**全部有消费者**。
- 那三处曾被静默忽略的组合，现在**显式互斥并抛错**
  （`registry.ts:618-630`：`edits`×`content`、`edits`×`oldText/newText`、
  `replaceAll`×`edits` 各自报错，注释写明「每个分支否则会静默赢过其它分支，调用方无从察觉」）。

**方法论记录（主代理自身的错误）**：首次扫描用
`new RegExp('args\\.' + name)` 判「是否被读取」，
把**间接读取**（`resolveToolTarget(args,'path',…)`）与**嵌套 schema key**
（`ask.ts` 的 `items:` 位于 `properties.items` 内）都误判为「从不读取」。
**这是与 `check-call-reachability.mjs` 文件头自述的同一个盲区**
（「A use reached through a computed member access … errs toward silence」）。
**教训**：字段级审计必须同时覆盖「直接 `args.x`」「`args['x']`」「辅助函数代读」三种形态，
否则会产出假缺陷。**本轮因此没有把它登记为缺陷。**

### TOL-05 · 未逐一核验的面 — `OPEN`（记录，非缺陷）

主代理**未**完成的检查（子代理死后无替代）：

- 每个内置工具的**逐字段**核对（「接受但从不读取的字段」——Phase 5 已发现过 3 例）；
- 编辑路径的多文件原子性与「读后写之间文件被改」的处置；
- 执行运行时的超时、输出上界、进程树在 abort/timeout/crash 下的回收；
- 权限门 `turn/tools.ts` → `core/query/toolPolicy.ts` 的逐决策清单。

**这几项是 `TOL` 域最实质的部分**，本册**不给出结论**，
列入 §14 作为下一轮的首要任务。**其中 schema 字段一项已在 TOL-04 完成并结清。**

### TOL-06 · 多文件编辑**没有事务**：中途失败前已写的文件留在盘上 — `FIXED` `P2` `CONFIRMED`

2026-10-02：edit 工具说明和 atomic-rollback readiness 明确每文件独立提交、后续文件失败保留先前改动。`/undo` 只查看最近快照及恢复命令，`/restore` 才显式恢复单条已记录编辑；同文件多替换仍保持全部匹配后一次提交。29 项定向测试与独立双线复核通过，撤销说明后契约回归失败。

**判定 (b)：部分失败、无回滚。** 依据链（逐条核实）：

| 环节 | 事实 |
|---|---|
| 编辑粒度 | `core/tools/registry.ts:553-556` 的 `edit` 工具**只接受单个 `path`**；`edits[]` 是「单文件多段」，不是多文件 |
| 提交方式 | `registry.ts:711` 每个工具调用**立即** `await executionService.writeTextFile(...)`，**没有跨文件的事务包装** |
| 落盘 | `runtime/execution/service.ts:99` `authority.writeFile(relativePath, request.content)` **原地**写，无 staging、无回滚日志 |
| 自述 | `edit/result/editCapabilityReadiness.ts:141-144` 明确 `blocked("atomic-rollback", [...])`，且注释写明「**the implementation was removed by decision**」（该能力被**决定移除**，不是遗漏），并指向 `.wiki/refactor/dead-code-tiers-2026-09-27.md` |

**所以准确的说法是**：多文件编辑由**多次独立的单文件写**组成；
第 3 个失败时，前 2 个**已经在盘上**，后 2 个没动。

**⚠️ 但有一层子代理漏掉、我核实后必须补上的**：
`runtime/execution/service.ts:88-94` 的 `captureSnapshotBeforeWrite` **确实会**
在写之前记录原内容（`before`），其注释写明目的是「so `/undo` and `/restore` have
something to take back」。所以**并非「零回滚能力」**——
**可回滚的是「内容」，不可回滚的是「这一批操作」**：
用户要自己逐个 `/undo`，而不是「撤销这次多文件编辑」这个原子动作。

**方向**：两条都成立，选一条并**写明**——
(a) 实现跨文件的 staging/commit（成本高，且本仓 2026-09-27 已**决定**不做）；
(b) **不改行为，改承诺**：在 `edit` 工具的文档/契约里写明「每个文件独立提交，
多文件编辑不是原子的；中途失败时已提交的部分需要 `/undo` 逐个恢复」。
**本册倾向 (b)**——与 `editCapabilityReadiness` 已有的「记录一个决定，而不是一个遗漏」保持一致。

### TOL-07 · 读后写窗口的内容复核 — `FIXED` `P2` `CONFIRMED`

**2026-10-02 修复**：edit 的三条输入路径传递原始 `expectedContent`，执行边界在持锁时、
异步恢复快照前后比较当前文本，不一致返回 `FILE_CONTENT_CHANGED` 并要求重新读取。
覆盖外部进程改写、快照期间改写或删除、空文件与 BOM/CRLF。条件写入 11 项通过，
移除复核后 8 项失败；相关 6 文件 / 89 项通过、`build:ts` 通过。
这不是文件系统原子比较交换；未携带条件的普通 write/create 仍遵循原有契约。

以下为修复前的诊断记录。

**判定 (b)：照写不误，覆盖掉别人的改动。** 依据：

| 环节 | 事实 |
|---|---|
| 读 | `registry.ts:635`（`edits[]` 路径）/ `:662`（`oldText/newText` 路径）经 `executionService.readTextFile` 读原内容 |
| 写 | `registry.ts:711` 直接写 `finalContent`，**中间没有任何比对** |
| service 层 | `service.ts:88-94` 读文件**只为了快照**（`/undo` 用），**从不与编辑时读到的内容比较** |
| 落盘 | `service.ts:99` 无条件 `writeFile`（truncate） |

**锁的范围被高估了**（子代理的补充，我已核实）：
`runtime/execution/fileLock.ts:30` 的 `withFileLock` 是
**Node 进程内的 `Promise` 队列**（`const queues = new Map<string, Promise<void>>()`），
`grep flock|fcntl` **零命中** ⇒ **不是 OS 级文件锁**。
所以它**只能串行化同一进程内经由该函数的写**，
**挡不住**：另一个进程、用户编辑器、或同一会话里 `bash` 工具起的子进程写的同一个文件。

**方向**：在 `writeTextFile` 或 registry 里于写前复核内容（或 mtime/哈希）
与编辑时读到的一致，不一致就报冲突而不是覆盖。
**这与本仓对 `state.json` 的处置（`withFileLock` + owner 记录）是两种标准**，
值得一次统一判断。

### TOL-08 · 进程组有界终止；逃逸子孙与父进程 SIGKILL 不保证回收 — `PARTIAL` `P2` `CONFIRMED`

W5-18（2026-10-02）完成本阶段约定的三项：

1. Windows 等待 `taskkill /F /T /PID` 的退出，最多 5s；启动失败、非零退出、超时均失败。
2. POSIX 对执行器建立的独立进程组先发 SIGTERM，观察该组最多 1s，仍存在时发 SIGKILL。
   只把 ESRCH 当作不存在；不退回直接 PID，避免原 leader 退出后误杀复用的 PID。
   CLI 退出与前台超时/取消、后台 stop 均等待清理请求完成；leader 提前 close 不能跳过升级。
   清理失败保留尚存目标供退出重试（Windows 根进程一旦观察到 close 即移除旧 PID），执行器即使收不到 close 也会返回明确失败，不无限等待。
3. **不保证**收回调用 `setsid` / `setpgid` 脱离原组的子孙；**不保证**父进程被 SIGKILL/OOM
   等不可捕获终止后回收其子孙。没有引入 subreaper、cgroup 或父死亡信号机制。

承诺边界：POSIX 清理 Promise 完成表示组已消失或信号序列已发送；**SIGKILL 发送成功不是退出证明**。
前台执行额外观察直属子进程 close；后台 `taskStop` 只报告请求，状态仍由 child close 更新。
Node exit 事件只能同步强杀兜底，不执行异步宽限。保留 PARTIAL 表示整树保证没有升级。

本地覆盖 Windows launcher 模拟、真实 POSIX 宽限/升级、超时 handler exit 0、失败无 close、pending
退出等待。实际编译 CLI 的常规/全屏 PTY 与 JSON 验证了受控子进程清理；**未做 Windows 实机验收**。

### TOL-09 · `edit/**` 的 12 个运行期死码 —— **已由 CDE-05 覆盖**，不重复登记 — `STALE`

子代理报了「**12 additional dead modules (1,561 lines)**」。核实：

- 用全入口闭包重算 `edit/**`（28 个非测试模块）：**live 11 / type-only 14 / zero-edge 3**；
- 其中「有运行期导出且只被类型引用」的是 **12 个文件 / 1,469 行**
  ——**与 CDE-05 已列的那 12 个完全同一批**（`edit/result/journal/**` 8 个 971 行 +
  `perFilePatchResultProjection` 187 + `recoverySurfaceProjection` 129 +
  `edit/patch/{types,plan/types,status/mixedOperation}` 之前已分别列入）。
- **行数差异**：子代理说 1,561，我实测 **1,469**（它多算了 92 行——
  很可能把已单列的 `edit/patch/status/mixedOperation.ts`(107) 与
  `edit/authority/writePolicy.ts`(25) 重复计入）。

⇒ **不新增条目**，只把 CDE-05 的 `edit` 簇行数按实测收准。

## 10. 平台集成：MCP / 技能 / 插件 / 子代理 / 钩子 / 可观测性（`OBS`）

> **覆盖是部分的**：子代理 `W3Platform` 因上游 402 终止（14m01s，无产出）。
> 本节由主代理亲验，覆盖：18 个钩子事件的派发与消费者、MCP 网关生命周期、
> 插件/市场的诚实性、以及 sidebar（见 §11bis）。**未覆盖**：MCP 错误分类的逐项、
> 技能发现的优先级与越界、子代理的递归与工具继承、日志轮转的正确性。缺口列在 §14。
>
> **OBS-01 / OBS-02 见下方**（`/marketplace` 的假 URL 与 `/plugin` 的诚实登记簿）。

### OBS-03 · 18 个钩子事件**全部有派发点，但内建消费者只覆盖 1 个** — `FIXED` `P2` `CONFIRMED`

**2026-09-30 实施**：46529616：既有扩展文档 §2.1.1 已列出 18 个事件、载荷字段、配置示例与匹配/超时边界；本阶段只补文档可发现性，不新增内建消费者。以下是研究历史。

**先明确两个不同的门禁**：`npm run check:declarations` 报
`hook_events=18 dispatched=18`——它证明的是**每个声明的事件都有一个派发点**。
**它不证明有人读那些载荷。** 本册因此单独核了消费者。

**派发点**（`grep 'eventName: "'`，排除 `types.ts` 的声明）：

| 事件 | 派发点 | 内建 in-process 消费者 |
|---|---|---|
| `SessionStart` | `turn/session.ts:330` | — |
| `UserPromptSubmit` | `turn/session.ts:337` | — |
| `PreToolUse` | `turn/tools.ts:168` | — |
| `PostToolUse` | `turn/tools.ts:224` | **3 个**（`builtin/{affectedUnitTestRunner,postMutationLspGuard,evidenceReceiptCollector}.ts`） |
| `PostToolUseFailure` | `turn/tools.ts:214` | — |
| `PermissionRequest` | `turn/tools.ts:295` | — |
| `PermissionDenied` | `turn/tools.ts:278,314` | — |
| `PreModelSwitch` / `PostModelSwitch` | `modelCommandRuntime.ts:336,407` | — |
| `PreCompact` / `PostCompact` | `core/shell/compaction.ts:38,50` | — |
| `SubagentStart` / `SubagentStop` | `taskTool.ts:89,197` | — |
| `WorktreeCreate` / `WorktreeRemove` | `taskTool.ts:122,185` | — |
| `Stop` / `StopFailure` | `turn/session.ts:429,414` | — |
| `SessionEnd` | `turn/session.ts:450` | — |

**判定**：**18 个事件全部可被用户配置的 hook 订阅**
（`core/hooks/config.ts:29-48` 的 `HOOK_EVENTS` 白名单就是这 18 个，由
`registration.ts` 从配置文件读入并注册）。所以**这不是「死事件」**——
用户写一个 `hooks.json` 声明 `{"PreCompact": [...]}` 是**能生效的**。

**真正的问题是覆盖不对称**：内建（开箱可用、不需要用户配置与批准）只用了 `PostToolUse`。
其余 17 个事件的能力**完全依赖用户自己发现并配置**——
而用户发现它的唯一途径是读 `core/hooks/types.ts` 的 178 行类型定义。
**没有任何文档、命令或提示列出「你可以订阅这 18 个事件」**。

**方向**：加一条 `/hooks`（或 `/diagnose` 的一节）列出 18 个事件与各自的载荷字段。
这是**低成本、高可发现性收益**的一条；比对每个事件都补一个内建 hook 更务实
（内建 hook 各有自己的产品判断，不该为了对称而加）。

### OBS-04 · MCP 网关**每个 prompt 重建一次** → 每个 stdio server 每次 `listTools` 起一个子进程 — `FIXED` `P2` `CONFIRMED`

**2026-10-02 更新**：已由 Phase 18 W3-11 修复：命令和 prompt 共享会话网关，配置/目录变化关闭旧连接，退出观察直接子进程回收。
验证和限制见 [Phase 18 §8.4](phase-18-decisions.md#84-实施记录)。以下为修复前证据。

**链路**（主代理逐跳核实）：

```
ShellSessionRuntime.deps.runPrompt                       core/shell/sessionRuntime.ts:58,293
  ← cli/runtime/cliSessionRuntimeFactory.ts:375         runPrompt: (prompt, …) => streamCliRuntimePrompt({…})
      ← cli/runtime/cliRuntimeInvocationBridge.ts:47     runCliRuntimeInvocation({…})
          ← entrypoints/cliRuntimeInvocation.ts:484      const mcp = await mcpToolsForRun(request)
              ← :305-311                                 new CoreMcpGateway(...) + await gateway.snapshot()
```

`snapshot()`（`core/mcp/gateway.ts:117`）对每个 server 走 `listTools`，
对 stdio server 即**起一个子进程**。因为 `runPrompt` 是**闭包在每次 prompt 上**的，
且 `runCliRuntimeInvocation` 是**每次 prompt 调用一次**，
所以 **N 个 prompt = N × M 个子进程**（M = server 数）。

**Phase 15 §16.3 已登记此项**，判为「性能优化非缺陷（stdio 为请求/应答短进程，不累积），
修它需把 gateway 提升到会话作用域、牵动 `runtimeContext` 生命周期 —— 独立裁决」。
**本册确认该判断仍然成立**，并补一条新事实：
`cli/runtime/cliSessionRuntimeFactory.ts:312` 的 `new ShellSessionRuntime` 是**每会话一次**，
所以**提升到会话作用域在装配上是有位置的**——不是「无处可放」，
而是「放得下但会改变 `runtimeContext` 的生命周期假设」。

**方向**：不改（性能），但**把它写进 disposition**，因为它会在每一轮被重新发现。

### OBS-05 · 18 个钩子事件的用户可见性为零 — `FIXED`（并入 OBS-03）

**2026-09-30 实施**：46529616：既有扩展文档 §2.1.1 已列出 18 个事件、载荷字段、配置示例与匹配/超时边界；本阶段只补文档可发现性，不新增内建消费者。以下是研究历史。

不单独登记，见 OBS-03 的「方向」。

### OBS-07 · MCP 的错误分类**到不了模型**：`mcpFailureMetadata` 零消费者 — `FIXED` `P2` `CONFIRMED`

**2026-09-30 实施/裁决**：1f609933：MCP class/plane 同时进入 metadata 与模型可见错误文本；25/25。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

`core/mcp/errorTaxonomy.ts` 定义了一套完整分类
（`McpFailureClass`、`McpFailurePlane`、`safeDetail`、`McpClassifiedError`），
`classifyMcpFailure` **被 `client.ts` 用了 8 处、`gateway.ts` 1 处**——分类是**真的算了的**。

**但**：`mcpFailureMetadata`（`errorTaxonomy.ts:70`）——那把分类转成
工具结果 metadata 的函数——**全仓零调用者**（`grep` 只命中它自己的定义）。

而 dispatch 侧（`core/tools/registry.ts:826-828`）在异常时的处置是：

```ts
} catch (error) {
  return runtimeErrorResult(error)     // ← 只取 error.message
}
```

`runtimeErrorResult(error, metadata?)`（`toolResultLifecycle.ts:164-173`）
**接受** metadata 参数却**没被传**，所以 `failureClass`/`failurePlane` 全部丢弃——
模型只拿到一句 `error.message`。

**后果**：模型无法区分「服务器没起来」「协议说错话」「工具自己报了错」，
只能看到一个字符串。**这与 Phase 15 修 MCP 假串的方向是同一条**（让失败可被反应），
只是停在了最后一步。

**注意**：`answer.isError` 那条路径**是**处理对的（`:811-818` 用 `deniedResult`
并带上服务器原话）。**丢的是异常路径的分类。**

**方向**：`catch` 里传 `mcpFailureMetadata(error)`——函数已经写好，一个参数的事。

### OBS-08 · `/log tail` 只读**当前一个**分片，写多了就读不到 — `FIXED` `P2` `CONFIRMED`

**2026-09-30 实施/裁决**：0d3de5a9、ee4bac5d：tail/export/clear 都按当前日志族枚举轮转分片；读面容忍单分片失败，导出/清空严格返回失败。17/17。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

**探针**（真实 `RotatingFileSink`，1KB 触发轮转）：

```
written: 60 | current file part: cheers.2026-09-30.888888.log.19
getRecentLines(50) returned: 3
lines on disk across all parts: 60
```

`getRecentLines`（`rotatingFileSink.ts:80-82`）只读
`this.getCurrentFilePath()`——**当前分片**。轮转产生的 `.log.1 … .log.19`
**不在读取范围内**。`/log tail`（`logCommandRuntime.ts:32`）直接用它。

⇒ **写满一个分片之后，`/log tail` 的输出会突然从「最近 50 行」变成「最近 3 行」**，
并且**越早的日志越读不到**——正好与「tail」的语义相反。

**加重**：轮转命名用**文件系统查找**决定 part 号（`:126-131` `while exists part++`），
所以 `readdirSync` 的顺序是字典序 `.log.1, .log.10, .log.11, …, .log.2`——
任何未来的「按 part 排序」实现都会**按字典序拿到错误的时间顺序**（探针已确认
`part numbers: 0,1,10,11,…,19,2,3,…`）。**当前没坏是因为它只读一个文件**。

**方向**：读取改为按 part 号**数值降序**跨分片拼接到满足 `limit` 为止。
这同时把「按字典序」这个坑一并处理。

### OBS-09 · 日志历史的年龄与数量限制 — `FIXED` `P3` `CONFIRMED`

**2026-10-02 修复**：新增 `maxFiles`（默认 20，含当前文件），启动与每次轮转均先按年龄清理，
再复用日志文件的 mtime 排序删除超额历史分片。本进程已关闭的分片可回收，其他活跃进程的
日志与当前文件保留；进程检查失败不视为已经退出。受保护文件或删除失败可能使总数暂时超限。
4 文件 / 25 项通过；回退后容量套件 8 项失败。以下为修复前记录。

`pruneStaleLogs`（`:137-176`）按 **日期** 淘汰（`maxHistoryDays` 默认 7），
并保护仍活跃的 PID。但**没有文件数量上界**——一个在 7 天内反复重启的进程
（每次新 PID）会留下大量分片，且 1KB 的测试阈值下**一次写入循环就产生 20 个文件**
（探针实测）。

**判定**：不是缺陷，但是**未声明的界限**。与 `crashLog` 的
`MAX_CRASH_RECORDS = 5` + `MAX_CRASH_AGE_MS = 7 天` 的**双上界**对照，
日志 sink 只有一半。**方向**：补一个文件数上限，或把「只有时间上界」写进注释。

### OBS-10 · 技能发现的优先级已核实为**正确**，且碰撞会被报告 — `STALE`（已核实健全，留档）

`core/skills/skillLoader.ts` 的发现链有三层，**顺序与注释一致**（逐一读码核实）：

1. **用户目录**（`resolveAllUserDataFiles("skills")`，多个历史位置全读，`:167`）；
2. **项目目录**（`projectDirectories(workspaceRoot).reverse()`，`:175-178`
   ——**最近的目录优先**，因为「一个为子目录写的技能是更具体的陈述」）；
3. **用户显式命名的路径**（`extraPaths`，`:228-230` 排在最后 ⇒ **最后写入者胜**，
   即显式命名赢过发现）。

**跨源覆盖规则正确**：`:243-252` 里，若新技能与已有同名且**来源相同**，
只记 `collision` 并 `continue`（先在者胜，保证同一 root 内结果稳定）；
若**来源不同**（用户 vs 项目），则**覆盖**——与我方注释宣称的
「project overriding user」一致（`:200`）。

**而碰撞是**报告**的而不是静默的**（`:207-216` 的文档解释了为什么：
「the losing file is otherwise invisible … nobody learns that editing it has no effect」）。

**另外两条已核实健全**：
- `--skill` 命名的路径**不受**项目 ignore 规则约束（`:139-145` 注释：
  「pointing at a file is a more specific statement than a pattern」）——
  否则 `--skill` 会静默什么都不做；
- `--no-skills`（`disableDiscovery`）**只跳过发现的 root，不跳过命名路径**（`:158-159`），
  即 `--no-skills --skill foo/SKILL.md` 仍然加载 `foo`。**这是正确语义**。

**未覆盖**：技能体的大小上界（是否 bounded）与本轮未展开的其余 `subagents` 面。

### OBS-01 · `/marketplace` 的默认源是两个不存在的地址 — `FIXED` `P2` `CONFIRMED`

**2026-09-30 实施**：`413a9141`：删除两个虚构默认源，默认显示空列表及添加用法；两个旧 URL 实测 HTTP 404，9/9 定向测试通过，恢复旧实现时 1 项失败。 以下事实为修复前记录。

`marketplaceCommandRuntime.ts:10-22` 硬编码两个源：

```
https://github.com/cheers/marketplace          -> HTTP 404（实测 curl）
https://github.com/cheers/community-plugins    -> HTTP 404（实测 curl）
```

且这两个源**只存在于模块级数组**，无任何持久化
（`grep "writeFile|save|persist" marketplaceCommandRuntime.ts` 零命中），
进程重启即回到这两个 404 地址。`cli/interactive/picker/sources.ts:22` 会**展示**它们。

**判定**：这是**编造的数据**，不是占位符——它会被渲染给用户，且 URL 形如真实地址。
与 `AGENTS.md`「不要把未核实的东西藏在成功样的状态后面」同型。
**对比**：`pluginCommandRuntime.ts:37-39` 与 `:225-231` 的 `/plugin search`
**明确说「没有目录服务」**——同一个子系统里，一处诚实、一处编造。

**方向**：删掉默认源（与 `/plugin` 的诚实立场一致），或换成真实可达的地址。**推荐删除**。

### OBS-02 · `/plugin` 是诚实的登记簿，不是加载器 — `STALE`（有意为之，留档）

`pluginCommandRuntime.ts:10-16` 的文档明说「本构建不执行扩展，输出也这么讲」；
`:161` 的输出含「This build does not execute extensions」；
未处理的包名标 `resolved: false` 并说明「没有下载任何东西」；
`/plugin search` 直接说「There is no catalogue service behind this」。
**这是诚实降级**，不是 demo。留档以免重报。

## 11. CLI 入口、构建与发布面（`CLI` / `BLD`）

### CLI-01 · `--json` 模式与完整输出通道 — `FIXED` `P2` `CONFIRMED`

**2026-10-02 修复**：`--json` 隐含非交互模式；启动时安装唯一 JSON 输出器，
命令回复与诊断以 `cli.output` 事件输出，模型回合继续使用原有事件契约。
临时抑制回合重复文本后恢复此前的输出器，后续命令仍输出 JSON，跨回合序号连续。
67 项定向测试、构建与含启动诊断的真实回放验收通过；反向撤销后 5 项失败。
以下保留修复前诊断。

`entrypoints/cliArgs.ts:214` 把 `--json` 记为 `jsonEvents`；
`cliRuntimeModule.ts:480-485` 只在**非交互 prompt 路径**里挂 `createJsonEventWriter`
并静音 prose sink。而 `cliModeDispatch.ts:36-44` 的 `resolveCliMode` 把
「有 stdin 输入但无 `-p`」判为 `stdin-batch`。实机：

```
printf "/help\n"  | cheers --json        -> 人类可读文本（无任何 JSON 行）
printf "say hi\n" | cheers -p --json     -> {"schemaVersion":"run-event-stream.v1","order":1,
                                             "eventType":"query.completed",...}
```

**严格说这不是 bug**（`--json` 是 `--print` 的修饰），但**是文档与直觉的缺口**：
单独 `--json` 静默降级，没有任何提示。**方向**：`--json` 隐含 print 模式，或在非 print 下报错。

**已核实健全 —— 且比初判更好**（补做轮实测，可重跑）：

```
printf "say hi\n" | cheers -p --json > out.txt 2> err.txt
```

- `stdout` **每一行都是合法 JSON**（实测 1 行、**0 行非法**）；
- `order` **严格递增无缺号**（writer 内部计数，`jsonEvents.ts:41-44`）；
- `eventType` 取自 `QueryEvent["type"]`，且每行带
  `truthfulness: { observationOnly: true, terminalSuccessClaim: false }`
  ——**流本身拒绝宣称成功**，这正是 `AGENTS.md` 要的「不要把未核实的结果
  藏在成功样的状态后面」；
- **prose 不混入**：`cliRuntimeModule.ts:485` 在 `jsonEvents` 时把 renderer 的
  `line`/`chunk` sink 换成空函数，事件走 `process.stdout.write` 直达；
- 注释自述「Lines are not buffered until the end」——增量书写，消费者读到第一行
  就已拿到第一行。

**结论**：`--json` 的**流本身是干净的**；CLI-01 记的缺口只是
「单独用 `--json`（不带 `-p`）时静默降级为 prose」，**与流的正确性无关**。

---

### OBS-06 · `/report` 的归档**仍然泄漏绝对路径**（栈帧里的） — `FIXED` `P2` `CONFIRMED`

**2026-09-30 实施**：共享脱敏器增加报告专用路径归一选项，保留项目相对位置与外部文件名/行号；覆盖驱动器、共享路径、文件 URL、空格及异步匿名帧。解码后再次过滤秘密与原始内容。36/36 定向测试使用系统 unzip 检查实际内容；绕过路径规则后 21 项失败。以下为修复前记录。

**发现方式**：本轮在工作区发现两个**未跟踪的归档残留**
（`./some_argument_xyz`、`./testarg123`，各 1,225 字节，Sep 29 22:54 / 23:07，
`git log` 显示从未提交）。解开后是 `/report` 的产物
（`report.json` + `summary.md`）。

**可重跑的复现**（`tsx` 直调 + **真实 `unzip`**，2026-09-30 00:15 确认）：

```
npx tsx -e 'import {runReportCommand} from "./core/commands/reportCommandRuntime.js";
            await runReportCommand(["/tmp/cheers-report-check.zip"],{cwd:process.cwd()})'
unzip -p /tmp/cheers-report-check.zip report.json | grep -o '/home/[A-Za-z0-9_./-]*' | sort -u
```

```
/home/wang/projects/cheers/packages/ts-shell/dist/cli/bootstrap/cliStartupSurface.js
/home/wang/projects/cheers/packages/ts-shell/dist/entrypoints/cliRuntimeModule.js
/home/wang/projects/cheers/packages/ts-shell/src/cli/print/printModeRouter.ts
/home/wang/projects/cheers/packages/ts-shell/src/entrypoints/cliRuntimeModule.ts
/home/wang/projects/cheers/packages/ts-shell/src/presentation/terminal/streaming.ts
```

**泄漏内容**（实测从归档里解出原字节）：

```
/home/wang/projects/cheers/packages/ts-shell/src/presentation/terminal/streaming.ts:40:20)
/home/wang/projects/cheers/packages/ts-shell/src/entrypoints/cliRuntimeModule.ts:180:20)
/home/wang/projects/cheers/packages/ts-shell/src/cli/print/printModeRouter.ts:66:9)
```

即 **V8 栈帧里的绝对路径原样进入归档**——含用户账户名（`/home/wang`）
与项目在磁盘上的完整位置。

**为什么这值得记**：`reportCommandRuntime.ts:100-104` 的注释**明确宣称这个问题已修**：

> The comment here used to claim the path was not absolute while the field held `context.cwd`
> verbatim, so a report carried `/home/<user>/...` — the user's account name and every
> directory above the project. The name alone still says what kind of project it was.

**修的是 `report.environment.project` 一个字段**（现在确实是 `basename` ——实测 `'cheers'`），
**栈没有跟着改**。而 `:166-168` 的注释说另一处泄漏
（`stack` 逐行脱敏 vs 跨行规则）是「Found by extracting the archive」——
**同一个函数里，同一类问题，第三次**：修了一处，另一处留着。

**同一次检查里已核实健全的部分**（应当记下以免误报）：

- `report.json` 里**没有**任何 key-shaped 或 token-shaped 字符串（`sk-…`/`Bearer`/`token=` 全部零命中）；
- `environment` 只含 `platform`/`arch`/`nodeVersion`/`project`（basename）；
- 崩溃记录内容本身是 `write EPIPE` 这类无害消息。

**方法论记录（主代理自身的工具错误，与结论无关但必须记）**：本轮先用**手写的
`inflateRawSync` 遍历**去找 `PK\x03\x04` 偏移并解压，得到「绝对路径 0 条」——
**差点据此把本条撤销**。用**真实 `unzip`** 复核后是 **5 个唯一路径**。
手写解压的偏移计算在遇到 ZIP 的数据描述符/额外字段时不可靠。
**教训与 `check-call-reachability.mjs` 提到的「工具出错时先怀疑工具」同型**：
**「探针返回空」既可能是目标正确，也可能是探针坏了——必须用第二种手段交叉验证**
才能区分。本册的 OBS-09 与 TOL-04 都因此各得到一次纠正机会（后者最终判定为无缺陷）。

**方向**：把 `scrubStack` 的脱敏范围扩到**绝对路径**
（把 `<root>/…` 归一为 `<project>/…`，或一律只留相对路径 + 行号）。
这与 THM/SES 无关，是**独立的隐私面**，且改法明确。

**另外两件事需要维护者决定**（本册不自行处置）：

1. 工作区里那两个归档**不是本册产生的**、**从未提交**，本册**未删除**它们
   （按 AGENTS.md「删除他人产物前先问」）。它们含上面那些路径，建议清理。
2. `.gitignore` **未覆盖**这类归档（Phase 16 只加了 `.probe_*.ts`）。
   一条 `/report` 默认写到用户数据目录，但 `--path` 形式可以落在仓库根，
   于是「跑一次 `/report ./x` 就多一个未跟踪文件」。建议加一条模式。

---

### BLD-01 · `packages/ts-shell/package.json` 的 `main` 指向不存在的路径 — `FIXED` `P2` `CONFIRMED`

**2026-09-30 实施**：`68dabc14`：main 改指 dist/index.js。真实包导入在旧值时 ERR_MODULE_NOT_FOUND（退出 1），新值时成功（退出 0）；3/3 smoke 通过。完整构建仍受两项既有类型错误阻断，待 W5。 以下事实为修复前记录。

```json
"main": "./dist/packages/ts-shell/src/index.js"
```

实际产物是 `packages/ts-shell/dist/index.js`（`tsconfig.build.json` 的 `outDir: "./dist"` +
`include: ["src"]`）。实测：

```
node -e "import('@cheers/ts-shell')"
  -> ERR_MODULE_NOT_FOUND: Cannot find package
     'node_modules/@cheers/ts-shell/dist/packages/ts-shell/src/index.js'
```

**影响面如实说明**：全仓**没有任何** `import "@cheers/ts-shell"`
（只有 `package.json` 与一条**钉住这个错误字符串**的测试 `src/smoke.test.ts:45`）。
所以这是**发布面的破损**而非当前功能破损——但 `"files": ["dist","src"]`
与 `bin` 的存在说明这个包本来是要被消费的。

**同时发现**：`node_modules/@cheers/rust-core` 是**指向已删除目录的悬空符号链接**
（`packages/` 下只有 `ts-shell`）。不影响运行，属残留。

**方向**：`main` 改为 `./dist/index.js`，并**同时**修正 `smoke.test.ts` 那条断言——
它钉住的是**错误的字符串**，是「测试固化缺陷」的又一例（本仓已记录多起同型问题）。
删掉悬空符号链接。

---

### BLD-02 · 3 个入口 shim 与 1 个信号处理器完全不可达 — `FIXED` `P2` `CONFIRMED`

**2026-09-30 实施**：`b87a5da6`：删除两个重导入口和一个无人调用的信号处理器，测试改测活轨。6 项入口/信号测试及 1 项 CLI 基线场景通过；还原旧测试导入后 3 套件解析失败。生产与脚本旧路径引用为零。 以下事实为修复前记录。

| 文件 | 行数 | 事实 |
|---|---|---|
| `entrypoints/cliPrintModeRunner.ts` | 5 | 纯转发 `../cli/print/printModeRunner.js`；真实调用者在 `cli/bootstrap/cliProcessRunner.ts:184`，走的是 `../print/printModeRouter.js` |
| `entrypoints/cliStdinModeRunner.ts` | 5 | 同上，转发 `../cli/print/stdinBatchModeRunner.js` |
| `entrypoints/handleSigint.ts` | 28 | 只有 `cli-baseline.test.ts` 引用；活轨的信号处理在 `cli/interactive/interactiveSignals.ts` → `core/shell/signalHandlers.ts` |

**来源**：`git log` 显示前两个是 `680ebbbe phase3-cli-route1: extract bootstrap and print modes`
的搬迁残留——当时把实现搬到了 `cli/print/`，留下 `entrypoints/` 的转发壳。

**方向**：前两个按 Phase 5 的先例删除。
`handleSigint.ts` 是**被活轨取代的实现**，删除前须确认其语义
（`saveInterrupted` / `saveTerminated`）在 `core/shell/signalHandlers.ts` 里都有
——**这正是删除前六项检查里的一条**。
**注意**：`docs/` 下 6 处引用它们（`architecture/control-plane-atlas.md:360-361`、
`architecture/module-atlas.md:634-635`、`project-map/*`、`design/*`）。

> ⚠️ **本条已更正**（Phase 17 复核者 `RvAW1Claims` 指出，主代理读码确认）：
> 初稿接着说「删除需一并同步，否则 `verify:docs-drift:strict` 的 `rules_dangling`
> 会变红」——**这句是错的**。`scripts/verify-docs-and-rules-drift.mjs:44` 的
> `RULES = ['AGENTS.md','agent-rules','.wiki/_index.md']`，**不含 `docs/`**；
> 且被引的 `control-plane-atlas.md`/`module-atlas.md` 在 `DOC_STATUS.md:38,41`
> 标的是 **`superseded`** 而非 `active`，**根本不进门禁**；
> 未加前缀的引用只进 advisory 的 docs-source 计数。
> **真正要同步的是三个测试**：`entrypoints/cliPrintModeRunner.test.ts`、
> `entrypoints/cliStdinModeRunner.test.ts`、`cli-baseline.test.ts`。
> 教训与本节其他处同型：**门禁的判定范围要读源码确认，不能从名字推断。**

---

## 11bis. 未接入 TUI 的功能（`OBS` 补充）

> 维护者点名：「是否存在没有接入 tui 的功能」。本节单独回答这一问。

### OBS-11 · `/sidebar watch` 是「同步吐 N 帧」而不是实时面板 — `FIXED` `P2` `CONFIRMED`

**2026-10-02 实施**：正式入口为 `/sidebar snapshot`，帮助/补全/标题同步声明单次捕获，命令owner
只生成一帧。旧 `watch/live` 保留为同一快照的兼容别名，不再列入补全；裸 `/sidebar` 保留原有
normal布局（不额外添加采集元信息，以免挤掉状态），panel/compact/detail仍为快照的密度变体。
没有新增定时刷新或分栏容器，OBS-12/sidebar的命令事件源缺口继续OPEN。以下保留修复前事实。

`/sidebar watch`（别名 `/sidebar live`）的整条实现是：

```ts
// presentation/sidebar/sidebarLivePanelCommandRunner.ts:29-31
const frames = Array.from({ length: input.contract.frameCount }, () => runtime.tick());
const output = frames.map((frame) => renderSidebarLivePanelFrame(frame)).join("\n");
```

`frameCount` 默认 **1**（`sidebarLivePanelCommandContract.ts:34`），且
`createSidebarLivePanelRuntime` **没有定时器**（对 `setInterval|timer|refresh` 的 grep 零命中）。
`runtime.tick()` 无参调用 ⇒ 每帧的 `snapshot` 与 `events` 都不变。

**所以 `/sidebar watch` 的实际行为是**：渲染一次当前状态、打印成文本、结束。
名字里的 `watch`/`live` 与「`manual-tick`」（`sidebarLivePanelRuntime.ts:110` 的自述 evidence）
之间没有实现差距上的对应——**它没有 tick 源**。

**同一簇的定位问题**：`presentation/sidebar/**` 共 **17 个非测试模块，
全部从 CLI 可达**（自建可达图复核），但 `presentation/tui/` 内**零处**引用 sidebar
（对 `sidebar` 的 grep 在 `presentation/tui/` 与 `cli/interactive/` 均零命中）。
即 sidebar 是**文本面板**而不是**分栏侧栏**——
这一点 Phase 16 §3.3 已记录为「形态与裁决描述不同」，本轮确认**仍然如此**。

**判定**：是否做真正的分栏侧栏是**产品决定**（Phase 15/16 两次都记为 backlog，
本册不重复提议）。但 **`/sidebar watch` 这个名字当前是错误承诺**：
用户会期待一个持续更新的面板，得到的是静态快照。
两个低成本选项：(a) 改名为 `/sidebar snapshot`（诚实），
或 (b) 真的接一个 tick 源（需要 TUI 侧栏容器，即产品决定）。

### OBS-12 · sidebar 的实时事件流只由命令结果驱动 — `OPEN` `P3` `CONFIRMED`

`emitCommandResultToSidebar` 的调用者全部是命令实现
（`compactCommandRuntime.ts:73,84`、`warmupCommandRuntime.ts:25,36`、
`browserCommandRuntime.ts:23` 等），即**只有命令执行才产生 sidebar 事件**。
工具调用、轮次开始/结束、权限询问**都不产生事件**。

且 `context.sidebarEventSink` **从未被任何生产装配点赋值**
（`grep -rn "sidebarEventSink:"` 在生产代码零命中），
所以 `sidebarEventSinkForContext` 每次调用都走
`context.sidebarEventSink ?? createSidebarEventSink({...})` 的**第二个分支**，
而它包的 `DEFAULT_SIDEBAR_LIVE_EVENT_STORE`（`sidebarLiveEventStore.ts:102`）
是**模块级单例**——事件跨会话共享一个存储，靠 `sessionScopeId` 过滤。

**判定**：与 `/todo` 的模块级单例**同型**（见 SES-01），
但这里**有 `sessionScopeId` 隔离**，所以**不是缺陷**。真正的缺口是
**事件源只有命令**：面板上的「Recent activity」永远只反映用户敲过的命令，
不反映 agent 实际做了什么。**方向**：把 `turnSink` 的事件面接进来（若做分栏侧栏）。

---

## 12. 死代码与模块卫生（`CDE`）

### CDE-01 · 早期不可达候选 12 文件 / 1,349 行（历史口径） — `FIXED` `P2` `CONFIRMED`

**统计口径（W5-22，2026-10-02）**：12文件/1,349行是修复前候选表，不是最终删除数量，也不是当前不可达数；
最终逐簇处置以 [Phase 17 §8.9](phase-17-decisions.md#89-w6-交付与逐簇裁决) 的闭包提交和保留决定为准。

**2026-09-30 实施/裁决**：完成逐项处置：c13fa25d 删除编辑三角，06b33ffb/48123a32 删除零引用投影与契约，入口 shim 在 W1 已删。eval/browser 有实际场景消费者，index.ts 是公共包入口，保留；旧表不是删除配额。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

| 文件 | 行数 | 类别 |
|---|---|---|
| `result/projection/runtimeHandoffProjection.ts` | 503 | 零消费者（Phase 5 同型的「报告投影族」残留） |
| `edit/patch/apply/conflict.ts` | 219 | 真死码（三角闭环），见 CDE-02 |
| `policy/workspaceFileContract.ts` | 206 | 零消费者 |
| `edit/patch/plan/hunkSet.ts` | 189 | 同上 |
| `eval/browser/benchmarkRunner.ts` | 44 | 浏览器评测框架，无生产入口 |
| `eval/browser/benchmarkReport.ts` | 49 | 同上 |
| `eval/browser/benchmarkModel.ts` | 21 | 同上 |
| `entrypoints/handleSigint.ts` | 28 | 见 BLD-02 |
| `entrypoints/cliPrintModeRunner.ts` | 5 | 见 BLD-02 |
| `entrypoints/cliStdinModeRunner.ts` | 5 | 见 BLD-02 |
| `edit/patch/plan/fencedEditMapping.ts` | 24 | 三角成员 |
| `index.ts` | 56 | 见 CDE-04 |

### CDE-02 · `edit/patch` 三角：一套更严格的冲突检测写好了没接上 — `FIXED` `P2` `CONFIRMED`

**2026-09-30 实施/裁决**：c13fa25d：实际生产检查比候选更合适，已删除封闭三角并保留回归。不能继续把生产检查描述为“没有重复/重叠检测”。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

三者互相引用成一个**封闭三角**，无任何外部消费者（连类型边都没有）：

```
edit/patch/plan/{hunkSet.ts (189), fencedEditMapping.ts (24)}
edit/patch/apply/conflict.ts (219)
```

`hunkSet.ts` 实现 `ExactHunkRange`、`sortHunksForApply`、`splitExactHunkLines`；
`conflict.ts` 的 `detectExactHunkConflicts` 被 `check:call-reachability` 列为
「导出但无人调用」的一条。

**而生产编辑路径**（`core/tools/editEngine.ts` + `registry.ts` 的 `edit` 工具）
用的是**自己的** `replaceInContent`，**没有**这套重复/重叠检测。

**判定**：与 Phase 5 删掉的「报告投影族」（32 文件 / 8,330 行）**同型**——
一套更严格的机制写好了没接上。规模小得多（429 行），但**性质相同**。

**方向**：**先做一次对比**（`hunkSet` 的冲突检测 vs `replaceInContent` 的现状覆盖了什么），
**强则接入、弱则删除**——不要既不接也不删。
这一条是本册里**唯一一条可能需要「接入而非删除」的死码**，值得单独立项。

### CDE-03 · `sandbox/` 内 834 行进程内沙箱模型从未被实例化 — `FIXED` `P1` `CONFIRMED`

**2026-09-30 实施/裁决**：f69ff3f6：活跃类型归真正审批所有者，四个无人实例化的类及出口删除。权限检查旧类型的消费者已随死声明删除；OS 执行通路不变。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

| 文件 | 行数 | 被谁用 |
|---|---|---|
| `sandbox/sandboxPolicy.ts` | 244 | 仅 `sandboxEnforcer.ts` |
| `sandbox/sandboxEnforcer.ts` | 132 | **无外部消费者**（`check:call-reachability` 点名 `SandboxEnforcer`） |
| `sandbox/escalationWorkflow.ts` | 183 | 仅 `sandboxEnforcer.ts` |
| `sandbox/auditTrail.ts` | 257 | 仅 `sandboxEnforcer.ts` |
| `sandbox/index.ts` | 18 | 只被 `import type { EscalationPrompt, EscalationResponse }` 引用（17 个文件） |

`grep "new SandboxPolicy\|new SandboxEnforcer\|new AuditTrail\|new EscalationWorkflow"`
在生产代码中**零命中**（只有 `sandbox/*.test.ts`）。

**活的沙箱**是另一套：`sandbox/osSandbox.ts`（340 行，`bwrap`/`sandbox-exec`），
被 `core/tools/registry.ts:141` 的 `planCommandLaunch` 与
`core/hooks/hookDispatcher.ts:5` 使用。

**判定**：`index.ts` 只被引用**类型**，而 `EscalationPrompt`/`EscalationResponse`
恰恰是**活轨需要的**（审批提示的形状）。所以这一簇是**「类型契约 + 一整套未被采用的实现」**：
删不掉（类型在用），但实现部分（策略/强制/升级/审计四个类）不产生任何行为。
**这正是所谓「编译契约」而不是「死代码」的典型**，也是本仓删除纪律强调「不能整文件删」的原因。

**方向**：把 `EscalationPrompt`/`EscalationResponse` 等类型移到真正的所有者
（它们服务于 `core/shell/approval/**` 与 `turn/tools.ts`），
然后删掉 `sandbox/{sandboxPolicy,sandboxEnforcer,escalationWorkflow,auditTrail}.ts`。
**须先确认** `sandboxPolicy` 的 `PermissionScope`/`PermissionCheck`
与 `core/tools/permissionContext.ts:2` 的 `import type { PermissionCheck }` 是同一份——
`permissionContext.ts` 引的是 `sandbox/index.js`，即**删除会牵动它**。
这一步要按 §2.2 的六项检查逐条走。

### CDE-04 · `index.ts` 的 15 文件岛，9 个目标只有类型引用 — `WONTFIX` `P2` `CONFIRMED`

**2026-09-30 实施/裁决**：保留公共包 API。68dabc14 已修 main 为 dist/index.js，并完成真实导入验证；不被 CLI 调用不构成删除公共出口的依据。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

`packages/ts-shell/src/index.ts`（56 行）是包的公共 API 面（`package.json` 的 `main` 指向它，
见 BLD-01）。它自身**完全不可达**，`export ... from` 的 9 个目标中：

| 目标 | 行数 | 外部值引用者 |
|---|---|---|
| `verification/selection/model.ts` | 283 | **无** |
| `planning/execution/model.ts` | 194 | **无** |
| `provider/request/packet.ts` | 73 | 仅 `tools/policy/strategy.ts` 的 `import type` |
| `repair/loop/model.ts` | 296 | **无** |
| `result/task/verdict.ts` | 56 | 仅 `core/query/runtime/proof.ts`（而 `proof.ts` 自己也是运行期死码） |
| `evidence/task/proof.ts` | 267 | 仅 `core/query/runtime/proof.ts` |
| `context/selection/model.ts` | 214 | **无** |
| `tools/policy/strategy.ts` | 372 | 仅 `import type { ToolActionKind }`（6 处） |
| `verification/execution/model.ts` | — | `core/query/runtime/harness.ts` / `proof.ts` 的值引用 |

`verification/execution/model.ts` 与 `artifacts/workflow/model.ts` 有值引用者，
而那两个引用者（`core/query/runtime/harness.ts`、`proof.ts`）**自己**处于运行期死码簇。
⇒ 这个岛整体是**上一代编排管线**的公共面，随 Phase 5/14 的删除失去了消费者，
只剩 `index.ts` 这个门面还挂着。

**方向**：`index.ts` 的去留取决于**产品是否对外发布这个包**。
若发布，`main` 路径要先修（BLD-01），且岛内每个导出都应有测试或文档；
若不发布（当前无任何内部消费者），整个岛连同 `main`/`files` 声明一起删。
**需一次产品决定**。

### CDE-05 · 运行期死码 37 文件 / 6,691 行 — `FIXED` `P2` `CONFIRMED`

**2026-09-30 实施/裁决**：本阶段逐簇处置完成，不代表所有候选都删除。详见 phase-17-decisions.md §8.9：journal/query/context/browser 保留被消费类型；公共 API、独有测试/注入能力保留并追加 disposition，旧 37 文件计数存在交叠。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

「有运行期导出（`export function|const|class|enum`）但只被 `import type` 引用」。
最大几簇：

| 簇 | 文件 | 行数 | 说明 |
|---|---|---|---|
| `edit/result/journal/**` + `perFilePatchResultProjection` + `edit/patch/{types,status}` + `edit/{recovery,authority}` | **12** | **1,469**（实测重算；旧记录 9/1,208） | 编辑日志与每文件结果投影；`recoveryAuthorityStore.ts:4` 只 `import type`。逐文件清单见 **TOL-09** |
| `index.ts` 岛（见 CDE-04） | 9 | 1,709 | 上述门面的目标 |
| `core/query/runtime/{actionAuthority,batch,proof}.ts` | 3 | 781 | `proof.ts` 被 `check:call-reachability` 点名 |
| `sandbox/` 四件（见 CDE-03） | 4 | 816 | 进程内沙箱模型 |
| `runtime/extensions/lifecycle.ts` + `runtime/resources/descriptor.ts` | 2 | 651 | **扩展宿主**——Phase 8 明确裁决不做，代码仍在 |
| 单文件簇 | 10 | ~1,900 | `tools/policy/strategy.ts`(372)、`repair/loop/model.ts`(296)、`verification/selection/model.ts`(283)、`context/startup/startupWarmContextHealth.ts`(260)、`browser/playwrightEvidence.ts`(252)、`evidence/task/proof.ts`(267)、`browser/runtime/core/executor.ts`(167)+`directionDecision.ts`(95)、`browser/actionCache.ts`(149)、`contextLayerModel.ts`(116)、`edit/patch/status/mixedOperation.ts`(107)、`browser/toolServerBackendComparison.ts`(84)、`provider/request/packet.ts`(73)、`result/task/verdict.ts`(56)、`edit/authority/writePolicy.ts`(25) |

**门禁旁证**：`npm run check:call-reachability` 报 **18 个模块「导出但无人调用」**
（advisory，不阻断），与本册的判定高度重合——它是本仓**已经存在的**检测器，
只是不阻断。**方向**：要么修这 18 条，要么把它们写进
`.normproof/dispositions.md` 的 disposition 行（该协议要求「反复出现的发现先尝试修，
只有真正决定延后时才记录」）。

### CDE-06 · `core/harness/` 位置错（29 文件在 `core/` 下但只被测试用）— `FIXED` `P3` `CONFIRMED`

**2026-09-30 实施/裁决**：8adc76f9、505c7f25、609d64cc：活跃 smoke 归 browser/smoke，其他场景支撑按域归 test-utils。66 处迁移经 AST 对比行为不变；浏览器 39 文件 221 通过/1 原有跳过，build 通过。 以下保留修复前研究事实；当前结果以本注及阶段实施记录为准。

自建可达图把 `core/harness/**` 的 29 个非测试模块排除在「生产」口径外——
它们是**场景夹具与 runner**，被各自的 `*.test.ts` 直接 import
（`core/harness/README.md` 也自述是 dev/eval 表面）。

**判定**：**不是缺陷**（代码在正确使用中），但**位置错**：
`core/` 里应当是产品运行时，`test-utils/` 才是测试基础设施。
`check:declarations` 一类的门禁**看不见**它们。

**方向**：移动到 `test-utils/`。纯位置问题，但会让「`core/` 里全是生产代码」
这条心智模型重新为真。**风险**：README 明确要求「分批搬迁、保留测试」，
且引用者众多（`core/harness/agentScenarioFixtures.ts:64` 等），
须按文档的分批纪律执行，不能整目录 `git mv`。

---

## 12bis. 本轮证伪的子代理断言（留档）

> 本仓既有纪律：子代理结论必须逐条复验，被推翻的如实记录。
> Phase 16 的复核轮推翻 4 条，Phase 15 累计剔除 5 条。**本轮 4 条。**

| # | 断言 | 来源 | 核实 | 结论 |
|---|---|---|---|---|
| 1 | `regular` 模式因 `mainScreen.ts:112-133` 的 `alreadyWritten` 记账「**行数没增加就整段跳过**」，且 `firstDifference` 只比 `sharedContent` 导致漂移 | `W1TuiSurface` `REGULAR-SCREEN-DRIFT` | **`alreadyWritten` 这个符号已不存在**——Phase 16 的 16-C 把整套记账重写了。探针实测：同一行文本增长**会被重写**（`frame2 (grew in place)` 输出了 `hello world`）。它引的是 12 号文档的**旧代码状态** | **错**，剔除。**方向上仍然成立的部分**是「`documentRows` 不带装饰」——但那是我方新发现的 TUI-01（高亮/选区/滚动条丢失），不是漂移 |
| 2 | `stop()` 先 `terminal.stop()` 后异步 `leaveScreen`，**二者竞态损坏终端状态** | `W1TuiSurface` | `terminal.ts:207` 的 `stop()` 走的是 **`writeSync`（同步）**，不存在「异步未刷出」；`regular` 模式在 `engine.ts:268` 提前 return，这条路径**根本不执行**。**残余**只是 `:285` 的异步 `write` 可能赶不上 `exit`，且本轮**未复现** | **部分错**，降为 TUI-06（P2 + `INFERENCE`），且必须如实标注「未复现」 |
| 3 | `/help` 只列 4 个键而 `keybindings.ts` 有 39 个 ⇒ **35 个动作的帮助缺失** | `W1TuiSurface` `KEYBINDING-HELP-DISCREPANCY` | `slashCommandRegistry.ts:169-170` 的注释写明**这是有意的**（「键都在一张表里，在这里再念一遍就是帮助开始宣传没人绑的键」）并指向 `/hotkey`。子代理把设计读成了遗漏 | **错**，剔除。**仍成立的部分**是 `/hotkey` 不反映用户重绑定，且两表 chord 一致**没有测试保护**——记入 TUI-09 |
| 4 | **生产环境流内 `error`、拒答等失败会被无差别重试** | `W2ProviderProtocol` 笔记本 | 探针（`isRetryableFailure` 真实消息形状）：`Network error: Provider reported an error mid-stream: content_filter` → **NO-RETRY**；`…refused the prompt: SAFETY` → **NO-RETRY**；`socket hang up` → RETRY。`retry.ts:85-86` 的 `REFUSAL` 模式先于 `RETRYABLE_FAILURE` 检查，且 `/content.?filter/` 命中 `content_filter` | **错**，剔除。**仍成立的**是**原因不同**：它不重试不是因为「识别为拒答」，而是因为 `errorMessage` 为空不匹配任何模式——记入 PRV-03 |

**方法论收获**：第 1 条与第 3 条是**同一类错误**——读了 `.wiki/features/12-*` 的
历史结论，没有回到当前代码验证。第 1 条尤其严重：它引用的**符号已经不存在**。
**这与 Phase 16 之前记录的「探针必须复用生产路径的消息构造」是同一条教训的另一面**：
**引用必须重新解析，不能沿用文档里的行号与符号名**。

---

## 13. 覆盖边界（如实记录，不掩饰）

### 13.1 子代理事故

三波共派遣 **9** 个只读子代理，**成功 4、失败 5**：

| 路 | 子代理 | 结果 | 原因 |
|---|---|---|---|
| W1a | `W1TuiSurface` | ✅ | — |
| W1b | `W1ThemesColor` | ✅ | — |
| W1c | `W1SlashCommands` | ✅ | — |
| W2a | `W2BrowserStack` | ❌ | **`content_filter`**（浏览器 + 凭据相邻读面） |
| W2b | `W2SessionDurability` | ✅ | — |
| W2c | `W2ProviderProtocol` | ❌ | **`content_filter`**（`provider/aws/credentials.ts` 等） |
| W3a | `W3Platform` | ❌ | **402 额度耗尽** |
| W3b | `W3MemoryContext` | ❌ | **402 额度耗尽** |
| W3c | `W3ToolsExec` | ❌ | **402 额度耗尽** |

**两类事故都是本仓已多次记录的**：
- `content_filter` ——**第 7、8 次**。既有结论是「涉及这些阅读面的切片由主代理亲验」，
  本轮照此执行（§5 浏览器、§7 provider 全部由主代理完成）。
- 上游额度耗尽（402）——**第 2 次**（首次见 Phase 16 W2a/W2b）。三个并发一起死。

**无产出的三路（W3a/b/c）**：浏览器与 provider 两路的笔记本还抢救出来了
（`local://slice-*.md`），**平台、记忆、工具三路什么都没留下**。
本册据此**明确标出**这三节的覆盖是部分的，不假装完整。

### 13.2 本轮**未**覆盖的面

| 面 | 规模 | 说明 |
|---|---|---|
| `browser/**` 逐模块 real-vs-demo 判定 | 167模块（原审计表164） | §5 只给了入口级可达性 + 治理走向 + 3 条具体缺陷；**逐模块表未产出**（补做轮仍**未**完成，见 §13.4） |
| `memory/**` / `context/**` 逐模块审计 | 36 + 28 模块 | §8 只覆盖 16-A/16-B 复核与记账 |
| ~~每个内置工具的逐字段核对~~ | ~~17 个工具声明~~ | ✅ **补做轮已完成** → **TOL-04**（41 个字段全部有读取者，无缺陷） |
| 编辑路径的多文件原子性、读后写竞态 | `edit/**` 28 模块 | 未做 |
| 执行运行时的超时/上界/进程树回收 | `runtime/execution/**` | 未做 |
| ~~MCP 错误分类、技能发现优先级~~ / 子代理递归与工具继承 | `core/{mcp,skills,subagents}/**` | ✅ **补做轮已覆盖 MCP 分类与技能发现** → **OBS-07 / OBS-10**；**子代理递归仍未做** |
| ~~日志轮转的正确性~~ | ~~`observability/**`~~ | ✅ **补做轮已完成** → **OBS-08 / OBS-09**（发现 1 条 P2） |
| ~~`core/shell` + `core/query` + `turn` 的完整审计~~ | ~~36 + 20 + 10 模块~~ | ✅ **补做轮已覆盖内核循环部分** → **§8bis**（5 条，含 1 条 P2）；`core/shell` 仍部分未覆盖 |
| `session/continuation/**` / `recovery/**` / `replay/**` / `export/**` | 16+11+5+4 | §6 只覆盖了锁、metadata 原子性、todo、parity |
| provider 四端点的逐字段请求形状表 | — | §7 只复核了 `supportsTemperature` 与停因两条 |
| 凭据路径（`Bearer` 的 114 处命中） | `provider/**` | **主动回避**——两次 `content_filter` 的读面 |

### 13.3 可重跑的手段清单

| 手段 | 用途 | 本轮产出 |
|---|---|---|
| 自建 ESM 可达图（值边 / 类型边 / 从 `cli.tsx` BFS） | 死码、接线中断、双栈 | §12 的 12 / 37 文件分列 |
| `npx tsx` 直调生产函数 | 行为验证（非读码推断） | TUI-01 的装饰丢失、TUI-02 的 `documentRows`、THM-02 的状态栏背景、TUI-08 的 CJK、PRV-03 的重试谓词、SES-06 的 parity 恒空、CTX-01 的回放 |
| 真实 CLI（隔离 `HOME`） | 端到端实机 | CMD-01/02/03/04/07、CLI-01、OBS-03（原记录未限定域，不作独立侧栏验收）、SES-01 |
| PTY（`\r` 提交） | 交互面实机 | SES-01 的 `/todo` 不落盘、TUI-04 的 pager |
| `curl` | 外部可达性 | OBS-01 的两个 404 |
| 七门禁 + `test:scripts` | 结构性 | 全 PASS（见 §14） |

---

## 14. 建议执行序（供裁决使用）

排序原则：**先修「说了却没做」的承诺**（`WONTFIX` 或修），
再修「做了却不对」的行为，最后才是增强与债务。
每项独立提交 + 撤销验证。

### 第一档：错误承诺与欺骗性输出（先做，成本低、解除错误信息）

| # | 项 | 为何第一档 |
|---|---|---|
| **1** | **CMD-01**（slash 参数引号分词） | **单点修复、全局收益**：56 个命令全部受益。这是本册里「改一处、修一片」的唯一一条 |
| **2** | **CMD-02**（`/view` 注册或删宣传） | 实现已在，接入成本极低；且三处文案在向用户承诺一个不存在的命令 |
| **3** | **OBS-01**（`/marketplace` 假 URL） | 删两行常量。同子系统的 `/plugin` 已有诚实立场可对齐 |
| **4** | **THM-02**（`fg`/`bg` 全局复位） | 用户可见的渲染错误（状态栏背景中途丢失），改法是照搬同文件已有的定向复位 |
| **5** | **CTX-02**（`/memory review` 硬编码文案） | 四条字面量改读 `health`，同目录已有正确写法可抄 |
| **6** | **OBS-06**（`/report` 归档泄漏绝对路径） | 隐私面；同函数里同一类问题**第三次**，注释已宣称修好 |
| **7** | **BLD-01**（`main` 指向不存在的路径） | 一行 + 一条**钉住错误字符串**的测试 |

### 第二档：已核实的行为缺陷

| # | 项 | 说明 |
|---|---|---|
| **8** | **BRW-01**（请求守卫是页级，弹窗不过判定） | **安全边界**：这是本轮唯一一条「绕过判定」的缺口。修法明确（context 级 + 扩 `PwBrowserContext` 接口 + 改注释） |
| **9** | **TOL-01**（`permissions` 17 处死声明） | Phase 15 已登记待裁决；`bridgeSafe` 的先例现已确立，可直接适用 |
| **10** | **PRV-03**（`content_filter` 静默截断） | 用户看到被截断的回答却没有任何说明 |
| **11** | **SES-03**（夺取通知从不被读） | 一句话（注释）描述了一件不存在的事 |
| **12** | **SES-04**（`metadata.json` 非原子） | 同 store 里两种写法，改法无争议 |
| **13** | **SES-01**（`/todo` 用户路径不落盘） | 16-H 的残留缺口；状态栏报 0 与事实相反 |
| **14** | **TUI-01**（`regular` 丢高亮/选区/滚动条） | regular 适配的核心；维护者点名项 |
| **15** | **CMD-07**（`/todo list` 静默建任务） | 静默改写用户输入 |
| **16** | **TUI-02/03**（regular 滚轮/搜索失效） | 与 **14** 同一族的 regular 适配 |
| **17** | **PRV-01**（Anthropic 等 EOF） | 两个端点相反处置，Bedrock 的理由完全适用 |
| **18** | **PRV-02**（`/btw` 硬编码 `supportsTemperature: false`） | catalog 已在手，缺一次 `resolveRequestShape` |

### 第三档：结构性重写与债务

| # | 项 | 说明 |
|---|---|---|
| **19** | **TUI-05**（每帧多次全文档遍历） | 需按视口切片 + 块级行数缓存；相位 16 已做了一半 |
| **20** | **THM-06 + THM-03**（语法着色 + schema） | 合并做：语法令牌入 `THEME_COLOR_TOKENS` 与 schema 是同一批 |
| **21** | **THM-01 + THM-05**（truecolor / 16 色） | 同一件事（终端能显示什么），与 THM-04 的 `NO_COLOR` 一起 |
| **22** | **CDE-01/02/03/05**（死码簇） | 每簇按 §2.2 六项检查 + 闭包核实；`hunkSet` **先验证再二选一** |
| **23** | **SES-06**（parity 恒空的规则表） | 删除安全（恒空），但需一次实机确认 |
| **24** | **BLD-02 + CDE-06**（入口 shim 与 `core/harness/` 归位） | 注意 `docs/` 的 6 处引用，`verify:docs-drift:strict` 会阻断 |
| **25** | **OBS-04 / SES-02 / CDE-04**（三个需先裁决的登记项） | MCP 网关作用域、锁 fencing、`index.ts` 岛的去留——**都要产品决定** |

### 明确不做或需裁决（不自行决定）

- **真正的 alt-screen 分栏侧栏**（OBS-11）：Phase 15/16 两次记为 backlog，产品决定。
- **记忆自动注入**（CTX-05）：有意分歧，产品模型变更。
- **`/share` `/import` `/name` `/changelog`**：Phase 15 已记 backlog。
- **MCP SSE/HTTP 传输**：Phase 15 已记 backlog。
- **凭据路径**（`provider/**` 的 `Bearer`）：读面触发 `content_filter`，留给维护者。
- **`edit/patch` 三角是否接入**（CDE-02 / TOL-02）：**先有反例再决定**，
  本轮未构造出「生产路径漏检而 `hunkSet` 抓到」的用例。

---

## 15. 本轮门禁结果（文档-only 改动，仍按纪律全跑）

```
npm run verify:import-cycles        [pass] runtime_cycles=0（1 条 type-only back-edge 为已知且被解释）
npm run check:config-consumers      [pass] fields=39 read=39 declared_without_reader=0
npm run check:declarations          [pass] hook_events=18 dispatched=18; tool_factories=10 registered=10
npm run check:node-floor            [pass] no use of a runtime API newer than >=20.3.0
npm run test:scripts                [pass]
npm run verify:docs-drift:strict    rules_dangling 0 / docs_dangling 0
                                    docs_source_dangling 118（advisory，非阻断；本轮未新增引用）
npm run check:call-reachability     [advisory] 18 module(s) export work nothing calls, 870 checked
```

`check:call-reachability` 的 18 条与本册 §12 的判定高度重合——
它是**本仓已经存在的**检测器，只是 advisory。
**按 `.normproof/dispositions.md` 的协议要求**（「反复出现的发现先尝试修，
只有真正决定延后时才记录」），这 18 条要么修，要么写进 disposition 行。

**未运行全量 `npm run test:ts`**：本轮是**零代码改动**的盘点轮，
没有行为变化需要测试保护，且 §12 的结论「恒空/不可达」本身就是**不运行**的证据。
若后续施工其中任一条，必须按仓库纪律跑改动域测试。

---

## 16. 补做轮（2026-09-30）：子代理全灭之后的自行收口

**背景**：上游额度耗尽（402）让最后三个子代理**同时**零产出终止，
另有两条因 `content_filter` 终止。派不出去了，**主代理把缺口自己补完**。

### 16.1 补完的内容

| 缺口 | 结果 | 条目 |
|---|---|---|
| 内核循环（`turn`/`core/agent`/`core/query`）——**此前零覆盖** | 5 条（1 条 P2 + 4 条已核实健全） | §8bis `LOP-01…05` |
| 浏览器逐模块分类——**此前 3 轮未产出** | 历史164模块四分类表；当前167含迁入3模块 | `BRW-00` |
| 全工具 schema 字段核对 | 41 个字段**全部有读取者** | `TOL-04` |
| MCP 错误分类到模型的链路 | 1 条 P2（分类被丢弃） | `OBS-07` |
| 日志轮转 | 2 条（`/log tail` 读不到轮转分片；无文件数上界） | `OBS-08/09` |
| 技能发现优先级与碰撞 | 已核实健全 | `OBS-10` |

### 16.2 本轮补做中发现的**最实用**的两条

1. **`OBS-08`：`/log tail` 在轮转之后只返回 3 行。**
   探针实测：写入 60 行、当前分片是 `.log.19`、`getRecentLines(50)` **返回 3 行**。
   因为 `rotatingFileSink.ts:80-82` 只读**当前分片**。写满一个分片后，
   `/log tail` 的输出会从「最近 50 行」**突变**为「最近几行」——恰好与 tail 的语义相反。
2. **`LOP-01`：Doom Loop 阻断消息宣称了它没有做的判断。**
   `turn/tools.ts:196` 写「… without **state progression**」，
   而检测器只有 `{toolName, argsHash, timestamp}`（`doomLoopDetector.ts:1-5`）
   ——**不比较任何结果**。阈值是 3 次相同调用（探针：`[false,false,true]`）。

### 16.3 本轮**更正了自己**三处（这是本册最有价值的部分）

| # | 我的初判 | 核实后 | 影响 |
|---|---|---|---|
| 1 | `TOL-01` 「与已删的 `bridgeSafe` 同型，**第二次出现**」 | **就是** Phase 15 §16.3 已登记的那条，标为 **CARRIED-OVER**；新信息只是「声明数 21→**17**」+「先例已确立」 | 避免把一个旧 backlog 当成新发现，虚增数字 |
| 2 | 浏览器表：**17 个死模块** | **5 个**。其余 12 个从 `cli.tsx` **可达**（装配了、被环境开关关着） | 12 个模块的误判；`DEAD` 与 `ASSEMBLED` 必须分列 |
| 3 | `OBS-06`（`/report` 泄漏绝对路径）**探针返回 0 条 ⇒ 差点撤销** | 真实 `unzip` 解出 **5 个唯一路径**——**泄漏是真的**，坏的是我手写的 ZIP 解压 | 差点撤销一条已证实的隐私缺陷 |

**第 3 条的方法论价值最高**：`check-call-reachability.mjs` 的文件头已经写下过
「工具出错时先怀疑工具」，本轮是它的**又一次**实证。
**探针返回空与目标确实为空，在输出上不可区分**——必须用第二种手段交叉验证。
这条纪律应当写进仓库的验证规则，而不只是留在本册。

### 16.4 仍然未覆盖的（不掩饰）

`browser/**` 140 个夹具模块的**逐行** real-vs-demo 判定（只做了四分类）；
`memory/**`(36) 与 `context/**`(28) 的逐模块审计；
provider 四端点的**逐字段**请求形状表与流解析边界矩阵；
编辑路径的多文件原子性与读后写竞态；
子代理递归深度与工具继承；
`core/shell`(36) 的完整审计；
凭据路径（两次 `content_filter` 的读面，**主动回避**）。


---

## 17. 与 `.normproof/dispositions.md` 的交叉核对（协议要求）

`.normproof/dispositions.md` 的协议规定：
「**若一个发现反复出现，先尝试修它；只有延后是一个真实决定时才记录。**」
本节逐条核对本册的发现是否**已经**在那里有裁定，避免把一个旧 backlog 当成新发现。

| 本册条目 | dispositions 里已有？ | 处置 |
|---|---|---|
| **TOL-01**（`permissions` 17 处死声明） | ❌ **不在 dispositions**，但在 `phase-15-decisions.md` §16.3 与 `_index.md:1423-1428` 有裁定（「独立裁决」） | **已按 CARRIED-OVER 标注**，并补上「`bridgeSafe` 先例已确立」这一新依据 |
| **CDE-03**（834 行进程内沙箱） | ❌ 无 | 见下 |
| **CDE-05 / 浏览器 DEAD 5 个** | ✅ **有**：`unreachable-code-retention` 多条（270 文件 / 59,121 行；263 文件 / 57,977 行…），裁定 **defer**，理由「Reachability does not authorise deletion (plan.md 2.1)… Delete only per-cluster, after the six checks in 2.2 and **after naming the live lane that covers the responsibility**」 | **本册不提议删除**，只登记。**本册的新信息**：把口径收敛到「有运行期导出且只被类型引用」的 **37 文件**（对比旧记录的 263–270），**大幅收窄了待裁决范围** |
| **CDE-02 / TOL-02**（`edit/patch` 三角） | ❌ 无（但有同型的先例）：`unreachable-singleton-retention` 裁定「47 of the 93 have an external production **TYPE** importer, so live files depend on their types and deleting them breaks compilation - they are contracts, not dead leaves」 | ✅ **本册的 `edit/patch` 三角属于「连类型边都没有」的那一类**（完全不可达 12 文件之一），所以**不受该裁定的保护**。**但仍不提议直接删**——TOL-02 已写明「先构造反例再二选一」 |
| **SES-02**（锁无 fencing） | ❌ 无，但有同型的：`contract-seam-inert` 的处置方式（「如实降级其保证」） | 本册照同一方式**降级其保证声明**，未提议改实现 |
| **SES-06**（parity 恒定为空） | ❌ 无 | 见下 |
| **OBS-06**（`/report` 泄漏绝对路径） | ❌ 无 | 见下 |
| **`check:call-reachability` 的 18 条 advisory** | ❌ **不在 dispositions** | **协议要求**：反复出现的发现要么修、要么记 disposition。**本册不代为决定**，但把它列为 §14 第 25 项 |

**三条 dispositions 里没有、且本册认为应当尽快补上 disposition 或修复的**：

1. **`CDE-03`（834 行进程内沙箱）**——它是**唯一一条「有实现、有类型消费者、从未被实例化」**
   的簇。`unreachable-code-retention` 要求删除前「name the live lane that covers
   the responsibility」；这里的活轨是 `osSandbox.ts`（OS 级隔离），
   **但两者职责并不重叠**（一个隔离进程，一个是进程内的策略/升级/审计模型）。
   所以按该裁定的判据，它**仍需一次真正的裁决**，不能靠既有裁定带过。
2. **`SES-06`（parity 规则表恒空）**——入口条件 `if (!codingResult) return []` 恒真
   （活轨 turn 层从不产生 `codingResult`）。这与 `verification/result/projection/mutation.ts`
   那条裁定**完全同型**（「its only caller is itself unreachable, so it cannot be repaired in place」）
   ——本册据同型先例判定「删除安全但需一次实机确认」。
3. **`OBS-06`（`/report` 泄漏）**——**隐私面，优先级高于上面两条**，
   且它是**同一条已修两次的问题的第三次**（`environment.project` 修过、
   `stack` 逐行脱敏修过、绝对路径仍留着）。

**结论**：本册的 **93 条**中，**只有 1 条（TOL-01）**与既有裁定直接重叠，
且已按重叠修正了分类。其余 92 条**不在**任何既有 disposition 里——
这说明本轮确实产出了新信息，而不是把旧账重抄一遍。

---

## 18. 未完成项（第二轮后更新）

**原本声明的三项**在第二轮（模型换成 `google-antigravity/gemini-3.8-flash:high` 后）
**全部已完成**：

| 项 | 状态 | 结果 |
|---|---|---|
| Slice F——provider 四端点请求形状与流解析 | ✅ 完成 | **PRV-07/08/09/10/11**（含 2 条 P1：部分输出后整段重跑、Google 丢图片） |
| Slice G——`memory/**`(36) 与 `context/**`(28) 逐模块 | ✅ 完成 | **CTX-06/07/08/09**（含 2 条 P1：只读文件抛未捕获异常、一行坏 JSONL 让整个子系统不可用） |
| Slice H——编辑路径原子性与读后写竞态 | ✅ 完成 | **TOL-06/07/08/09** + **TOL-02 判决翻转** |

**仍然未覆盖的（四项，如实列出）**：

| 项 | 规模 | 为何仍未做 |
|---|---|---|
| 140 个浏览器夹具模块的**逐行** real-vs-demo 判定 | 140 模块 | 只做了四分类（BRW-00）；逐行需要每个夹具一个判据 |
| `context/startup/**` 与原read去重的行为验证 | 6 模块 + read链路 | **2026-10-02 W7-32已完成**：read去重退役；缓存结构/项目/新鲜度/有界读写和状态投影修复，详见Phase18裁决 |
| provider 四端点的**真实**流边界（无凭据，只用合成块） | 4 协议 | 合成块覆盖了帧级；TLS/HTTP2 层未覆盖 |
| 凭据路径（`provider/**` 的 `Bearer`） | — | **主动回避**：两次 `content_filter` 的读面 |



---

## 19. 第二轮复核：三个重派切片的产出与**自我更正**

> 模型换成 `google-antigravity/gemini-3.8-flash:high` 后重派
> `F2ProviderTables` / `G2MemoryContext` / `H2EditAtomicity`，**三个全部成功返回**
> （12m56s / 12m46s / 8m04s）。以下每条均经主代理独立复验（代码或探针）。

### 19.1 新增 11 条

| 条目 | 级别 | 一句话 |
|---|---|---|
| **`PRV-07`** | **P1** | 部分输出后的流失败会让**外层循环重跑整个 step**（见 19.2） |
| **`PRV-08`** | **P1** | **Google GenAI/Vertex 完全丢弃图片块**——四端点里唯一没做多模态的，且 `inlineData` 全仓零命中 |
| **`PRV-09`** | P2 | 安全拒答只在 `content_filter` 一个值上被识别；Anthropic 的 `refusal`、Bedrock 的 `guardrail_intervened` 落到「check the provider with /connect」 |
| **`PRV-10`** | P2 | 用量遥测只在内存，跨 `--resume` 归零 |
| **`PRV-11`** | P3 | **新发现**：`projectProviderRegistry` +15 个私有函数（~445 行）零消费者——**同一文件里活着一半** |
| **`CTX-06`** | **P1** | 目录可写、**文件只读**时 `appendFileSync` 抛**未捕获 EACCES**；同文件的 `invalidate`/`delete` 都返回 `blocked` |
| **`CTX-07`** | **P1** | JSONL **任一行**损坏 ⇒ `list()` 与 `health()` **整体抛**；对照 `sessionEventCodec` 的 transcript 是按行隔离的（Phase 16 已记为「正确」） |
| **`CTX-08`** | P2 | `CTX-02` 的范围是 **6 个 surface** 不是 1 个；根因是 `RunProjectMemoryReviewCommandInput` **没有 `health` 参数** |
| **`CTX-09`** | P2 | **5 处单调增长**（`readCache`、`compactLiveCheckpoint`、两个 injection state、review state）——**与 Phase 16 §4.5「未发现无界增长」矛盾** |
| **`TOL-06/07/08`** | P2×3 | 多文件无事务；读后写无内容复核（且 `withFileLock` 是进程内 Promise 队列、**不是** OS 锁）；进程树三处泄漏 |
| **`TOL-09`** | STALE | 子代理报的「12 个新死模块」与 `CDE-05` **同一批**，行数实测 1,469 而非 1,561 |

### 19.2 两次**推翻主代理自己**（本册最有价值的部分）

**更正一：`TOL-02` 判决翻转——「接入」改为「删除」。**
我先写「`edits[]` 分段形式**没有重叠检查**」并倾向建议接入。
`H2EditAtomicity` 指到 `core/tools/editEngine.ts:430-441`，我读码确认
**生产路径有区间重叠检查**，`registry.ts:650` 的 `edits[]` **正是**委托给它。
更关键的是**反向证据**：三角里的 `conflict.ts:121-142` 用顺序文本搜索，
对 `gamma→beta` + `beta→delta` 这类**互不相交**的级联会**误报冲突**。
⇒ **生产实现更强、候选实现更弱 ⇒ 删除（432 行）。**
**教训：「没找到反例」≠「候选更强」，必须反向再测一次。**

**更正二：`LOP-05` 从「已核实健全」改为「有缺口」。**
我读到 `turn/step.ts:479` 的 `!shownAnything` 守卫就断言「三层各有明确边界」。
**没跟到 `loop.ts:172` 的 `retriesExhausted` 由谁设置。** grep 结果：

```
grep -n 'errorStep(|failedStep(' turn/step.ts  -> 只有 :429-430 传了 tried
```

⇒ 除 provider 内层循环外，**每条失败路径都不设该标志**，外层守卫一律不生效。
探针实测 `Network error: …`（`:492` 那条，即 **shownAnything=true**）→ **RETRY**。
⇒ **已经流了一半、用户已经看到开头的回答，会被整段重新生成。**

### 19.3 同一错误的**第三次**出现

| # | 我怎么错的 | 只看了一层 |
|---|---|---|
| 1 | `TOL-02`：把生产实现判为更弱 | 只看了候选的检测器，没看生产的 |
| 2 | 浏览器表：12 个装配模块判为死码 | 只用了两条路径的差集，没用全入口闭包 |
| 3 | `LOP-05`：断言「三层边界清晰」 | 只看了守卫本身，没看标志由谁设置 |

**三次都是「只看了一层就断言这一层的行为」。**
本册把这条写进方法论，因为它比任何单条缺陷都更值得记住——
**而三次都是子代理指出来之后我才发现的**，这本身说明复核机制在起作用。

---

## 20. Phase 18 复核轮：3 个探索子代理 + 主代理逐条亲验（2026-10-01）

> 模型 `google-antigravity/gemini-3.8-flash:high`（`.omp/config.yml`），并发 3，**3/3 返回**
> （11m59s / 15m51s / 16m27s；`ExTuiCommands` 事后补问时上游 400，其结论由主代理自行复验）。
> **复核对象**：Phase 18 的裁决（`phase-18-decisions.md` W1–W7）与「文档没有涉及」的代码面。
> **纪律**：子代理每条载重断言由主代理在 HEAD 上重跑 `grep`/读码/模拟；被**驳回**的记入 §20.3。

### 20.1 新增条目（20 条，逐条附证据）

### PRV-13 · `googleGenAI` 主流式路径**缺 `?alt=sse`** — `FIXED` `P1` `CONFIRMED`

**2026-10-02 实施**：与 PRV-12 一起修复；主路径加入 SSE 参数，旧 URL 断言已更新。
URL 决定响应格式的矩阵能检出缺参数后的空答案，撤销此处及两个单次调用模式后6项失败。


**主代理亲验**（决定性）：同一个仓库里的两个 Google 端点**只有 `googleVertex` 带 `?alt=sse`**：

```
provider/endpoints/googleGenAI.ts:21-24  googlePath(model, stream) -> `/v1beta/models/${m}:${stream ? "streamGenerateContent" : "generateContent"}`
provider/endpoints/googleGenAI.ts:28    path: (model) => googlePath(model, true)          ← 生产唯一入口，stream 恒 true
provider/endpoints/googleVertex.ts:78   path: (model) => `/${m}:streamGenerateContent?alt=sse`   ← 同类端点，带
```

`googleWire.ts:437-444` 的 `dataOf()` 只取 `data:` 行；`turn/completion.ts:182` 的
`isEventStream` 只认 `content-type: text/event-stream`。**缺 `alt=sse` 时 Google 返回
`application/json` 的 JSON 数组**（非 SSE）：`isEventStream` 判否 → `readGoogleBody(array)`
读 `(array).candidates` → `undefined` → **空文本、无 finish_reason、无报错**。
⇒ Google AI Studio 的**主流式回合静默产出空答案**。

**参考**：`gemini-cli/packages/core/src/code_assist/server.ts:478-482` `params: { alt: 'sse' }`——
这是 Google 官方 SSE 约定。我方 `googleVertex` 自己就遵守。

**现状测试反向钉错了 URL**：`googleGenAI.test.ts:65-67` 断言路径**不含** `?alt=sse`。

**与 `PRV-12` 的关系**：`PRV-12` 记的是**次要请求**（`/btw`、`summarize`）用流式 URL 却按单 JSON 读；
本条是**主流式路径**本身错。**同一根因**（端点未区分「单次 / 流式」，且流式 URL 缺 SSE 参数），
施工时应一次修：`path` 加 `?alt=sse`（流式）+ 接出 `googlePath(model, false)`（非流式）+ 修该测试。
**无法在中转站验证**（Google 路径 405，见 `phase-18-decisions.md` §9）。

### PRV-14 · SSE 多行 `data:` 用 `join("")` 而非 `join("\n")` — `OPEN` `P3` `CONFIRMED`

W3C SSE：一个事件的多条 `data:` 行必须用 `\n` 连接。我方两处用空串，一处正确：

```
provider/endpoints/anthropicMessages.ts:622-631  parseEvent ... .map(l => l.slice(5).trim()).join("")
provider/endpoints/googleWire.ts:437-444          dataOf    ... 同款 join("")
turn/completion.ts:558-563                         eventData ... parts.join("\n")   ← 正确的那一处
```

**参考**：`pi/packages/ai/src/api/anthropic-messages.ts:409` `data: state.data.join("\n")`；
`gemini-cli/.../server.ts:510` `bufferedLines.join('\n')`。

**实际影响**：Anthropic/Google 现实中每个事件的 JSON 都在单行，**当前不触发**；但这是
**同一线格式在同一仓被解析成两种**——正是 `anthropicMessages.ts:455-460` 自己写下的那条教训
（「the same wire format parsed two ways, and only one of them right」）。属**标准符合性**缺陷。
**并入 `W7-27` 的流边界矩阵**（施工轮）。

### PRV-15 · `Retry-After` 在「provider 层 → turn 层」边界被丢弃 — `OPEN` `P2` `CONFIRMED`

**主代理亲验**：`turn/step.ts:409-413` 从响应头取 `requestedDelayMs`，
`:443-449` 在**本层**重试时用它（`retryDelayMs(retry, attempt, requestedDelayMs)`），
但**耗尽后返回的 step 不带它**（`:427-437` `failedStep(refusal, "", refusalClass, tried)`）。
`core/agent/loop.ts:178` 的**外层**重试调用 `retryDelayMs(policy, attempt, undefined)`——**恒传 `undefined`**。

**默认配置下这条必然发生**：`DEFAULT_PROVIDER_RETRIES = 0`（`core/agent/retry.ts:41`），
所以 provider 层**从不**重试；`Provider HTTP 429: …` 一律交给 turn 层，turn 层用
**指数退避**（base 2s）**无视服务器要求的等待**。服务器说 `Retry-After: 30`，我们 2s 后重试。

**参考**：`pi/packages/ai/src/utils/provider-retry.ts:51-70` 在同一层内读 `retry-after-ms`/`retry-after`
并把服务器延迟喂给退避 sleep；超过 `maxRetryDelayMs`（默认 60s）则**直接失败并报出**该秒数。
⇒ 我方是把「哪一层重试」分开了，却没把「服务器给的延迟」跨层传下去。

**撤销验证**：响应 `429` + `Retry-After: 5` ⇒ turn 层首次重试延迟**≥ 5s**（当前为 ~2s）。

### SES-09 · 锁**获取超时（1.2s）≪ 陈旧判定阈值（60s）**，崩溃后的空锁造成 60s 硬失败 — `FIXED` `P2` `CONFIRMED`（2026-10-02）

空/半写 JSON 使用 500ms 创建宽限，可在 1.2s 获取等待内恢复；新建锁不立即接管。
只有 SyntaxError 进入该路径，EACCES/EIO 等读取失败不推断持有者死亡。
身份尚未写入前任意暂停仍无法与崩溃区分，宽限是启发式而非 fencing。以下保留原定位证据。

```
session/store/sessionFileStore.ts:9    const STATE_LOCK_TIMEOUT_MS = 1200
session/store/lockStaleness.ts:29      export const STALE_LOCK_AGE_MS = 60_000
```

进程在 `openSync(lockPath,"wx")` 与 `writeFileSync(...)` 之间被杀 ⇒ 留下**零字节锁**。
`isLockStale` 对「读不出 owner」的文件只有 mtime ≥ 60s 才判陈旧（`lockStaleness.ts:73-82`）；
而获取循环 1.2s 就 `throw new Error("Session state lock timeout …")`（`sessionFileStore.ts:97-99`）。
⇒ **崩溃后该会话的每一次写入 60 秒内都硬失败**，期间既不能等待接管、也不能自愈。

**对照**：opencode 的 `staleMs` 同为 60_000，但它有 **heartbeat 续期**（`flock.ts:262-265`）
让「活跃」持有者不被误判；我方两项缓解已在 `W4-14` 计划中（续期 + release owner 校验），
**但都治不了「已死持有者的空锁」**。这一条是**新的**：两个常量**彼此不一致**。
**方向**：空/不可读锁用**远短**的宽限（写入紧跟创建，窗口是微秒级），
或把获取循环的等待上界提到 `STALE_LOCK_AGE_MS` 之上以便真正接管。与 `W4-14` 同批施工。

### SES-10 · 中止的中止回合**不发终止事件** ⇒ 事件流无终止帧 — `OPEN` `P2` `CONFIRMED`

`turn/session.ts:343,356,441` 在 `signal.aborted` 时**直接 return / 静默放弃**，
`drive()` 从不 `push` 终止事件（`query.completed`/`query.failed` 只在 `:436`/`:421` 发）。
`turn/session.test.ts:114-128` 把这一行为**钉死**（`ends quietly when interrupted`：无 failed、无 completed）。

**消费端**：`core/shell/sessionRuntime.ts:346-347` `if (!sawTerminalEvent) throw …`；
捕获分支（`:368-381`）在 `signal.aborted` 时补记 `lifecycle.cancelled`——但那是
`sessionManager.appendQueryEvent`（写会话），**不经过 `eventObservers` 通道**（`:308`）。
⇒ `--json` 的 `createJsonEventWriter`（`cliRuntimeModule.ts:498-502`）在中止时**看不到任何终止帧**，
流只是「结束」。消费者无法区分「被中止」与「崩了」。

**交互面为什么看不出**：`cliRuntimeModule.ts:525-533` 用 `shellState === "interrupted"` 兜住并渲染
「cancelled」；异常被当**控制流**用。功能不坏，**契约坏**（JSON 事件流的终止帧承诺）。
**参考**：`pi/packages/coding-agent/src/core/agent-session.ts:2361-2371` 把取消当正常生命周期状态报出。
**方向**：中止时经 `channel` 发一个终止事件（新增 `query.cancelled` 或让 `lifecycle.cancelled` 走通道）。

### TOL-10 · `task` 工具在**子代理失败但产出了文本**时返回 `success: true` — `FIXED` `P2` `CONFIRMED`

**2026-10-02修复**：task按失败状态结算，原因与部分答复同时保留；空答复也明确失败。runner检测启动前及工具执行期间中止，turn适配器传递error，父模型与失败事件得到相同事实。80项定向测试、构建和独立双线复核通过；反向16项失败后恢复。隔离编译运行时验证任务正文及预算失败投影；未做真实provider。旧result-contract脚本仍有缺失测试目标和过期合成输出预期，未宣称其通过。以下保留历史定位。

`core/tools/taskTool.ts:170` 记下 `subagentFailure`，但终态只按**文本有无**判定（`:238-240`）：

```ts
return subagentResponse ? approvedResult(lines.join("\n")) : { success: false, error: lines.join("\n") }
```

`core/subagents/runner.ts:181-190` 会在两种情况设 `failed`：末步 `error`/`aborted`，
或**步数耗尽且末步仍在要工具**——**两者都可能已经产出叙述文本** ⇒ `subagentResponse` 非空 ⇒
`approvedResult`（`toolResultLifecycle.ts:142-149` 恒 `success:true`），失败原因只在无文本时才显示。
⇒ 模型读到「Subagent Task Executed」+ `success:true`，**失败被叙述掩盖**。

**方向**：终态按 `subagentFailure` 判定（有失败即 `success:false`，失败原因进 `error`/正文），
与 `AGENTS.md`「不要把未核实的结果藏在成功样的状态后面」一致。

### TOL-11 · `grep` 的 ripgrep 快路径 `execFileSync` **阻塞事件循环** — `OPEN` `P3` `CONFIRMED`

`core/tools/grepRipgrep.ts:208` `execFileSync(binary, args, { maxBuffer: 256*1024*1024, … })`——
**同步**、**无 timeout**、**无 `AbortSignal`**；`ripgrepArgs`（`:105-125`）也不传 `-m/--max-count`。
大仓搜索期间 TUI 不重绘、不可中断，直到结果全部缓冲进 256MB 上限。

**参考**：`pi/packages/coding-agent/src/core/tools/grep.ts:4,168` `spawn(rgPath, args, …)` 异步流式。
**方向**：异步 `spawn` + 流式解析 + 传 signal/timeout + `--max-count`。标 `自研`（我方快路径设计）。

### TOL-12 · plan 模式**无条件拦掉所有 MCP 工具**；且 `/tools` 的列表与门不一致 — `OPEN` `P2` `CONFIRMED`

`turn/tools.ts:70-72` 的 `PLAN_MODE_TOOLS = {read,glob,grep,lsp,web_fetch,web_search,ask,todo}`——
MCP 工具名形如 `mcp__server__tool`，**永不命中** ⇒ plan 模式下所有 MCP 工具被拦，
**包括只读的**（MCP 有 `annotations.readOnlyHint` 可用，未读）。
`core/query/toolPolicy.ts:108-118` 的 `else` 分支同样把未知工具一律判 `execute`（非只读）。

同时 **两处列表已经漂移**：
`core/commands/toolsCommandRuntime.ts:24-35` 的 `ALLOWED_IN_PLAN` 含 `task`、`browser`，
而门 `PLAN_MODE_TOOLS` **不含 `task`**（`browser` 另有 `READ_ONLY_BROWSER_ACTIONS` 分支）——
⇒ `/tools` 打印 `| task | allowed |`，但 plan 模式下发 `task` 会被**门拦掉**。
`newCommands.test.ts:20-27` 只断言了 `write/read/bash` 三行，**没钉住这张表的完整性**。
**参考**：`gemini-cli/packages/core/src/policy/policy-engine.ts:610` 的 `check(toolCall, …, toolAnnotations?, …)`——
按工具注解而非硬编码名单决策。
**方向**：读 MCP 注解判只读；把 `/tools` 的列表**从门派生**（同一常量），并加一条一致性测试。

### TOL-13 · `/tools` 列的是**静态注册表**，隐藏生效的 MCP 工具与技能 — `OPEN` `P3` `CONFIRMED`

`toolsCommandRuntime.ts:41` `createCoreToolRegistry()` **不带参数** ⇒ 无 `mcpTools`、无 `skills`
（生产装配在 `entrypoints/cliRuntimeInvocation.ts:485-490` 才注入）。
⇒ 配了 MCP 的用户看到的工具数**少于**模型实际拥有的。
（**注意**：`lsp` **是**真实注册的工具——`core/tools/lsp.ts:28`、`registry.ts:757`，
「幽灵 lsp」的说法**不成立**，见 §20.3。）

### CMD-09 · `/deep-research` 是**无模型**的抓取+模板，却宣称「多智能体树搜索」 — `OPEN` `P2` `CONFIRMED`

`core/research/deepResearcher.ts` 全链路无任何模型调用：`generateSerpQueries`（字符串拼接）→
web search/fetch → `extractLearningsFromContent`（`:168-183` 按标点切句）→
`claimVoter.ts:33-36`（**Jaccard 词元重叠 ≥ 0.25** 聚类）→ `reportGenerator.ts`（模板）。
命令帮助（`deepResearchCommandRuntime.ts:12-14`）与报告正文（`reportGenerator.ts:29`）
都写「multi-agent tree search / cross-source consensus voting」——**「多智能体」不实**。
**参考**：`pi` 无此命令（`NOT-FOUND`）。**方向**：接模型做查询生成与综述（`/btw` 已有侧信道模型调用的样板），
或改名并去掉伪造的机制宣称。

### CMD-10 · `/review` 是**硬编码清单 + 原始 diff**，不调模型 — `OPEN` `P2` `CONFIRMED`

`core/commands/reviewCommandRuntime.ts:8-72`：`execSync` 取 `git status`/`git diff`（截断 5000 字符），
接一段**固定 4 条**的「Reviewer Checklist」（`:63-69`）。**没有任何模型调用**。
同仓的 `/commit`（`commitCommandRuntime`）走的是**读暂存 diff → 构造 prompt 回合**的正路。
⇒ `/review` 输出的是任何读者不看 diff 也能写出的模板。
**方向**：对齐 `/commit`——把 diff 交给模型做评审。

### CMD-11 · 未闭合引号按字面参数传递 — `FIXED` `P2` `CONFIRMED`

**2026-10-02 修复**：共用 tokenizer 保留已经完成的参数；最后一个未闭合参数从原始起点取到末尾，保留引号/撇号，不重新拆分选项状尾部。合法引号与转义规则不变，末尾孤立反斜杠仍报错。命令与模板采用同一规则。94项定向测试、构建、独立APPROVE/CLEAR；撤销后8项失败。常规/全屏PTY验证 `/btw` 撇号问题可传递，隔离环境无提供方凭据。

以下保留修复前证据：

**实机复现**：`printf "/btw what's the difference\n"` ⇒
`Invalid /btw arguments: Unclosed single quote in command arguments.`（`slashRouter.ts:85-88`）。
tokenizer（`core/commands/arguments.ts`，Phase 17 W1-1 引入）把撇号当**未闭合单引号**，
拒绝整条命令。英文自然语言里撇号极常见（`what's`、`don't`、`it's`），
`/btw`、`/commit`、`/brainstorm` 等自由文本命令**都可能受影响**。
**参考**：`pi` 的 CLI 层 `--` 终止符（`cli/args.ts:82`）是另一回事；斜杠层无先例（`NOT-FOUND`）。
**方向**：未闭合引号**回落为字面文本**（shell 的做法）或给出可恢复提示，而非整条失败。

### CMD-12 · `/marketplace` 来源持久化与真实能力说明 — `FIXED` `P3` `CONFIRMED`（2026-10-02）

来源保存到当前用户数据目录的 `marketplaces.json`，支持 `CHEERS_MARKETPLACES_FILE` 隔离覆盖。共享文件锁内读最新列表并原子替换，不缓存旧列表；损坏 JSON/非法条目阻止写入，写失败不报告成功，picker 显示独立错误行。来源只是供用户访问的地址，不提供抓取/目录搜索。41 项测试、构建与新进程 CLI 增删查、4 个并发写入者验收通过。

以下保留修复前证据：

`marketplaceCommandRuntime.ts:10` `let marketplaceSources: MarketplaceSource[] = []`——模块级数组，
`grep writeFile|persist` **零命中** ⇒ 重启即丢，而输出说「successfully registered」。
同子系统 `pluginCommandRuntime.ts:110` **有**持久化（`CHEERS_PLUGINS_FILE`）。
且 `marketplaceCommandRuntime.ts:52-54` 宣传 `/plugin search <keyword>`，
而 `pluginCommandRuntime.ts:229-240` 明说「There is no catalogue service behind this」——两处**互相矛盾**
（`OBS-01` 只修了编造的默认 URL，未涉持久化与这条交叉承诺）。

### CMD-13 · `/reload` 显式报告主题应用失败 — `FIXED` `P3` `CONFIRMED`

**2026-10-02 修复**：命令输出包含主题失败原因与保留的active theme；配置变化与实际应用分开陈述，其他配置仍生效。22项定向测试、构建及双线APPROVE/CLEAR；撤销后1项失败。常规/全屏PTY运行中改为不存在的主题再reload，错误可见且正常退出。auto已随后由W7-25接通，见THM-03。

以下保留修复前证据：

`reloadCommandRuntime.ts:77-87` 的 `applyConfiguredTheme` 捕获异常只 `logger.warn`、返回 `undefined`；
命令输出只在成功时加「Applied theme …」（`:56`），失败时**用户看不到任何原因**
（warning 只进日志）。`describeChanges` 仍会把 `theme` 列为「已更改」⇒ 屏幕没变、也无解释。
**方向**：把失败原因写进命令输出（`logger.warn` 对 `--json`/无日志读者不可见）。

### TUI-10 · 编辑器上下箭头按可视行导航 — `FIXED` `P3` `CONFIRMED`

**2026-10-02 修复**：渲染与导航共用既有wrapToWidth生成的可视行映射；垂直连续移动保留目标单元格列，短行及宽字符钳制到字素边界，编辑/横移/缩放重置目标列。历史记录只在可视边界参与。112项定向测试、构建和双线APPROVE/CLEAR；撤销5项失败。常规/全屏PTY验证软换行后上移插入仍保留命令前缀，退出0。

以下保留修复前证据：

`presentation/tui/editor.ts:386-390` `move("up")` 以 `this.row`（**逻辑行**）为单位，
而渲染才软换行（`:454-475` `wrapToWidth`）。
`cli/interactive/keymap.ts:329-348` 的 `recallOrMove`：`move` 返回 false 时，
**非空草稿**跳行首（`:339-343`）、**空/已在浏览**则**翻历史**。
⇒ 光标在某个长逻辑行的**第二个可视行**上按上键，不会在可视行间上移，而是跳行首/翻历史。
**参考**：`pi/packages/tui/src/components/editor.ts:443-447,1478-1530` 建**可视行映射**
（`isOnFirstVisualLine` + `moveToVisualLine`），只有到**首个可视行**才翻历史。

### TUI-11 · 全屏picker与补全支持点击选中 — `FIXED` `P3` `CONFIRMED`（裁决范围）

**2026-10-02 裁决/实施**：采用最小范围，左键仅聚焦已绘制picker/补全行，Enter确认，多选仍用Space切换；点击不批准操作、不写设置、不提交文本。按现有owner分工，由渲染器提供行映射，surface提供几何，overlay优先接管指针；拖入选择区的手势持续捕获到释放。regular模式未开启鼠标跟踪，编辑器点击定位未实现且不在本轮承诺内。
7文件123项定向测试、构建及APPROVE/CLEAR；撤销7项失败，源码恢复。独立复核发现的拖入后释放与无效组合键命中表失效均修复并有回归。全屏真实PTY验证补全点击和设置点击，在Enter前配置逐字不变，Enter后才保存，退出0。

以下保留修复前证据：

`cli/interactive/pointer.ts:92-167` 只处理：滚轮、滚动条拖拽、transcript 选区拖拽、composer 拖拽。
`cli/interactive/overlay.ts`（520 行）**零鼠标处理**（`grep click|mouse` 零命中）——
picker（`/back`、`/model`、`/resume`…）与补全列表**纯键盘**，点击会落到下层拖拽。
**参考**：`pi/packages/tui/src/components/mouse-region.ts` + `settings-list.ts:202-213`
（左键点选）+ 消息组件用 `MouseRegion` 做折叠切换（`assistant-message.ts:164`）。
**产品决定**：做到什么程度（本次仅登记）。

### OBS-13 · 斜杠命令**别名不参与补全** — `FIXED` `P3` `CONFIRMED`

**2026-10-02 修复**：候选包含去重别名，参数补全复用注册表解析，新增/卸载命令同步清除缓存。
25 项定向测试和构建通过；撤销后 3 项失败，恢复后 20 项通过。自研完善；以下保留修复前诊断。

`cli/interactive/slashSuggestions.ts:15-19` 的 `candidates()` 只映射 `/${command.name}`，
**丢弃 `aliases`**；`:26` 的 `argumentSuggestions` 用 `/${entry.name}` **精确匹配**，
别名打头取不到参数补全。实机模拟：`/qu`（`exit` 的别名 `quit`）无候选；`/where re`（`workspace` 别名）无参数候选。
注册表本身解析别名正常（`entrypoints/slashCommandRegistry.ts:107`，`getSlashCommand` 查 aliases）⇒
**命令能跑、补全不认**。**参考**：`pi` 的内建命令**无别名**（`NOT-FOUND`）⇒ 属 `自研` 完善。

### OBS-14 · 删除未消费的换行提示字段链 — `FIXED` `P3` `CONFIRMED`

**2026-10-02 裁决/实施**：保留空闲无提示时不占行的布局，删除newlineKey字段、传参和仅为它服务的协议名称转换器；实际按键解析、换行dispatch与/hotkey不变，键位发现由实际绑定表和参考页负责。删除的三个测试只验证该死辅助函数，归类为obsolete scenario；其余渲染、键位和文档契约测试保留。6文件121项定向测试、构建通过。

以下保留修复前证据：

`presentation/tui/chrome/hints.ts:26` 定义 `HintContext.newlineKey`，
`presentation/tui/surface/view.ts:198` 传入（`interactiveMode.ts:241` 由 `newlineKeyFor(...)` 产出），
但 `transientHint()`/`renderHints()`（`:36-78`）**从不读它** ⇒ 死数据流。
`newlineKeyFor`（`:81-85`）逻辑正确（legacy→`ctrl+j`、否则 `shift+enter`），只是结果无人显示。
**方向**：要么在空提示里显示，要么删掉该字段与传参链。

### OBS-15 · MCP stdio 客户端用**自定义信封**，无法与真实 MCP server 互操作 — `FIXED` `P1` `CONFIRMED`

**2026-10-02 更新**：已由 Phase 18 R3/W3-11 修复：标准 JSON-RPC 握手、分页工具目录和调用接入官方 SDK，保留失败分类和结果校验。
验证和限制见 [Phase 18 §8.4](phase-18-decisions.md#84-实施记录)。以下为修复前证据。

`core/mcp/client.ts:44-55` 自述（原文）：写 `{"action":"list-tools"}` / `{"action":"invoke-tool"}`，
「A real protocol client writes JSON-RPC 2.0 (`tools/list`, `tools/call`), so **this cannot talk to a
third-party server**」。夹具 `core/mcp/fixtures/mockMcpServer.mjs:9` 同样只说这套自定义协议。
⇒ **任何真实 MCP server（playwright-mcp、github-mcp…）都接不上**。
`callStdioWithRetry`（`:175-186`）还只重试**一次**（`maxRetryAttempts` 字段写 3）。
`loadMcpConfigs` 只接受无参数的 `command`/`args`（`SUPPORTED_TRANSPORTS = {stdio}`）。

**参考**：`pi/packages/mcp/src/protocol/jsonrpc.ts:4` `jsonrpc: "2.0"` + 完整 `initialize`/`tools/list`/`tools/call`
+ 传输层（`transports/stdio.ts`）；`pi` 的 MCP 连接由会话生命周期持有（`W3-11` 已引用）。

**判定**：代码**诚实声明**了这是「有意范围」而非疏漏——但对一个**企业级 agent 产品**而言，
MCP 不能连真实 server 是**能力缺口**而非「记录项」。⇒ 记为 `OPEN P1`，**须维护者裁决**：
(a) 实现 JSON-RPC 2.0（帧协议、握手、通知）——一次性较大，但可一次接上整个 MCP 生态；
(b) 维持现状，但 `/mcp doctor` 必须**明确声明**「本构建只能连自带夹具协议」。
**这一条 `phase-18-decisions.md` 完全没有涉及**（`W3-11` 只谈连接复用）。

### SUB-01 · 子代理定义里的 `permissionMode` **只用于显示**，不进工具门 — `FIXED` `P2` `CONFIRMED`

**2026-10-02 修复**：定义/请求/父会话的plan限制取交集，由每个子运行的工具门执行；父拒绝规则与审批范围保留，task只显示建门owner回报的模式。77项定向用例、构建和双线复核通过；撤销后5项失败。编译运行时真实工具注册表验收plan阻止文件创建；无真实provider。正文/schema/工作区等同域额外缺口另行处理。以下为历史研究。

`subagentLoader.ts:13,22,39` 三个内置定义声明 `permissionMode: "plan"`（Explore / Plan / code-reviewer）。
`core/tools/taskTool.ts:82` 只用它拼**展示字符串**（`"PLAN (Read-Only)"`）；
真正生效的门 `runSubagent`（`core/subagents/runner.ts:117-140`）接收的是
`gateOptionsFor(options)`（`turn/session.ts:191`），其中 `agentMode: options.agentMode`
——**会话的模式**，与定义无关。⇒ 在 **build 模式会话**里派 `code-reviewer`
（`tools: [read,grep,glob,lsp,bash]`、`disallowedTools: [write,edit]`），
它拿到的是 **build 门**⇒ **可用 `bash` 执行改动**，而声明与展示都写着「PLAN (Read-Only)」。
**参考**：`gemini-cli/packages/core/src/policy/policy-engine.ts:610` 的 `check(…, subagent?, …)`
按子代理上下文决策。**方向**：把 `definition.permissionMode` 穿进 `runSubagent` 建门
（`agentMode: definition.permissionMode ?? 会话模式`）。
**这一条直接推翻 `phase-18-decisions.md` `W7-30` 的裁决**（见 §20.2）。

### 20.2 对 Phase 18 裁决的**修正**（本轮核心产出）

| 位置 | 原裁决 | 修正 | 依据 |
|---|---|---|---|
| **`W7-30`（子代理工具继承）** | 「⚠️ 工具继承**已经接上了**… 若无缺口，本条降级为『已核实健全』」 | **`PARTLY-WRONG`**。**工具继承确实健全**（`subagentTools` + `NEVER_GIVEN` 成立）；但**权限模式继承缺失**——`permissionMode` 是**展示专用**，plan 模式**不生效**（`SUB-01`）。⇒ W7-30 不但不能降级，反而**升级为真缺陷** | §20.1 `SUB-01`；`taskTool.ts:82` vs `runner.ts:117-140` |
| **`W5-19`（`PRV-12`）** | 由端点所有者区分「单次 / 流式」 | **范围扩大**：主线（流式）各自也错——`googleGenAI` 缺 `?alt=sse`，主回合静默空答案（`PRV-13`）。**两条同根因，一起修**；且要改 `googleGenAI.test.ts:65-67` 这个**钉错 URL 的测试** | §20.1 `PRV-13`；`googleVertex.ts:78` 对照 |
| **`W3-11`（`OBS-04` MCP 网关）** | 「挂到会话 runtime、以 workspaceRoot 为键」 | **不完整**：即便按此修，仍连不上任何真实 MCP server（`OBS-15`）。**须先裁决协议**，否则优化的是一个只能连夹具的通道 | §20.1 `OBS-15` |
| **`W1-4`（`LOP-01`）** | 删「without state progression」 | **成立**（主代理复验 `turn/tools.ts:196` 逐字仍在；检测器输入只有 `toolName/argsHash/timestamp`）。**补充**：检测器**有** `findRepeatingCycle`（`doomLoopDetector.ts:18,58,91`，`cycleThreshold` 5）⇒ 登记册「只比参数」的措辞应收窄（`phase-18-decisions.md` §8.3.2 已记，此处确认） | 主代理读码 |
| **`W4-14`（`SES-02` 缓解）** | 续期 + release owner 校验 | **补充第三条**：`SES-09` 的「空锁 60s 阻塞」是**同域另一条**（两常量互斥），应并入本项施工 | §20.1 `SES-09` |
| **`W1-2`（`CMD-04`）** | 四个命令被「interactive-only」拦 | **成立**（主代理实机 `/exit` 复现；判定确在派发处 if 链 `cliRuntimeModule.ts:272-390`，`CommandDefinition` 无该字段）。**但注意 `CMD-11`**：同在 `slashRouter` 一层的引号解析会**整条拒绝**含撇号的命令 | 主代理实机 + 读码 |

### 20.3 复核中**被驳回**的 8 条（记此以防重报）

> 子代理会**幻觉**：函数名、行号、影响面都可能错。以下每条主代理都重跑过。

| # | 子代理断言 | 主代理实测 | 处置 |
|---|---|---|---|
| 1 | `sendSentRequest` 有「`retrySentRequest` 丢弃 signal」 | **`retrySentRequest` 不存在**（grep 零命中）；`sentRequest.ts:62-66` **确实**传了 `{ signal }` | **驳回** |
| 2 | `RotatingFileSink.flushAndClose` 从不被调用 ⇒ 退出丢日志 | 写入是 `fs.appendFileSync`（`:69`）**同步**；`flushAndClose` 只置标志（`:103-105`），**无缓冲可丢** | **驳回** |
| 3 | `editEngine` 的 `lineRangeSpan` 在 CRLF 上留孤立 `\r` | `registry.ts:634-646,666-677` 先 `toUnixLines`、后 `withLineEnding` 复原；主代理**模拟全路径**得完全正确的 CRLF 往返；`editEngine` 无其他生产调用者 | **驳回** |
| 4 | `/undo` 推荐的 `--all` 会「恢复整个 authority」 | `defaultAuthorityId` 含 `Date.now()+random`（`editSnapshot.ts:190`）⇒ **每次快照一个独立命名空间**，`--all` 命中的就是那一次写入 | **驳回** |
| 5 | `/tools` 列了「幽灵 `lsp` 工具」 | `core/tools/lsp.ts:28` 真实注册（`registry.ts:757`） | **驳回**（但「隐藏 MCP/技能」成立，见 `TOL-13`） |
| 6 | `/compact` 与压实引擎「完全断开」 | 裸 `/compact` 在**两个入口**都被拦截：`interactiveCommandRouter.ts:100-108`、`cliRuntimeModule.ts:229-238` ⇒ `compactHistory` → 真实 `compactSessionHistory`；命令注册表只管 `preview/render/json` 工件形式 | **驳回** |
| 7 | `splitBucketKey` 把含斜杠的模型名切错 | `usageTelemetry.ts:141-152` 的注释**明确**约定「provider 是首个 `/` 之前」；仅当 **provider 为空且模型含 `/`** 才歧义（可达性低） | **驳回**（记为已知取舍） |
| 8 | `CMD-06`/`CMD-03` 裁决 `PARTLY-WRONG`（补问时上游 400，未给理由） | 主代理独立复验：`opensPicker`（`picker/registry.ts:101-108`）确要求**行内无空白**；实机 `/back 2` ⇒ `Unknown slash command: /back`；rewind 宿主（`interactiveMode.ts:731-750`）确为叶重指+摘要+放回 | **无法证实**；按主代理复验，裁决**维持** |

### 20.4 本轮的方法论收获

1. **子代理的「P1」有一半经不起亲验**：本轮 3 个子代理共报 ~20 条，主代理**驳回 8 条**
   （含 1 条不存在的函数名、2 条读错调用链、2 条没验证复原逻辑）。
   **规律**：凡是「某处从未被调用」「某处丢参数」这类**否定式**断言，**必须自己再 grep 一遍**。
2. **同一个字面量在不同定位下含义相反**（承 §7.1 的教训）：`ok:true` 在真实路径是正确、
   在夹具才可疑；本轮 `success:true`（`TOL-10`）亦然——**定位**决定含义。
3. **「常量对不上」是新一类**：`SES-09` 的 `1.2s vs 60s` 与 `TOL-12` 的
   「`ALLOWED_IN_PLAN` vs `PLAN_MODE_TOOLS`」都是**两处各自正确、合起来错**，
   且**没有任何测试钉住它们的关系**。建议在施工轮为这类加**一致性测试**。
