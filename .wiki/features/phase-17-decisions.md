---
title: "Phase 17 裁决：把 13 号登记册的 OPEN 项分批落地"
category: article
sources: [phase-17-pre-research, 13-feature-and-defect-register, phase-16-decisions]
created: 2026-09-30
updated: 2026-09-30
reviewed: 2026-09-30（3 个证伪式复核者，32 条断言）
tags: [features, gap-analysis, phase-17, decision, design]
summary: "Phase 17 的裁决。输入的 70 条 OPEN（12 P1 / 45 P2 / 11 P3）经前置研究后分批：本阶段纳入 A–E 五波共 26 项，其中 12 条 P1 全部纳入；明确不做 6 项（附理由）；独立裁决 4 项（需维护者定）。每条给出形态、参考依据（或标注「自研」）、撤销验证方式。裁决经 3 个只读子代理证伪式复核，主代理逐条复验并记录了被推翻的断言。"
confidence: high
---

# Phase 17 裁决

> 前置研究见 [`phase-17-pre-research.md`](phase-17-pre-research.md)；
> 条目定义与证据见 [`13-feature-and-defect-register.md`](13-feature-and-defect-register.md)。
>
> **本裁决的纪律**：
> 1. 每条给出**形态**（改哪个文件、什么机制）+ **参考依据**或 `自研` 标记 + **撤销验证**方式；
> 2. **每项独立提交**，可单独撤销；
> 3. 凡「参考实现没有对应机制」的，**必须标 `自研`**，不得伪装成照搬；
> 4. 复核者（3 个只读子代理）的结论由主代理逐条复验，被推翻的如实记录在 §7。

---

## 1. 规模与分批

### 1.1 输入

```
13 号登记册：条目 86，OPEN 70
  P0  0    P1 12    P2 45    P3 11
phase-16-decisions §4 移出：16-J 16-L 16-M 16-N + 3 项产品决定
```

### 1.2 裁剪结果

| 处置 | 数量 | 说明 |
|---|---|---|
| **纳入本阶段** | **38** | **12 条 P1 全部纳入**（其中 TUI 域 8 条在初稿里整体遗漏，见 §7.5）；其余按「与 P1 同域、可合并」纳入 |
| **移出（更后阶段）** | **22** | P2/P3 中影响面小或需前置设计的 |
| **明确不做** | **6** | 附理由，见 §6 |
| **需独立裁决** | **4** | 见 §5 |

**裁剪原则**（按优先级）：
1. **错误承诺优先**——文案/注释/命令说了却没做的（`CMD-02`、`OBS-01`、`SES-03`、`BRW-01` 的注释）；
2. **P1 全做**——欺骗性输出、未捕获异常、安全边界、数据丢失；
3. **同一改动点的多条目合并**——如 `THM-01`+`THM-05`+`THM-04` 都在色彩管道上；
4. **成本与收益比**——「单点修复、全局收益」的排最前。

### 1.3 与 16-J…16-N 的对应

| 16-x | 本文处置 |
|---|---|
| **16-J** 死代码清理 | 拆入 **W1**（`edit/patch` 三角，判决已定 **删除**）与 **W6**（其余簇，逐个闭包核实） |
| **16-L** Bedrock 端到端 | **不做**（无账号）§6 |
| **16-M** `NO_COLOR`/truecolor/`"stream"` | 拆入 **W3**（`THM-04`/`THM-01`）；`"stream"` 已删 |
| **16-N** 语法着色 | 纳入 **W3**（`THM-06`），**含一次依赖裁决** |

---

## 2. 执行序（五波，每波独立可交付）

### W1 — 错误承诺与单点全局收益（先做）

| # | 条目 | 形态 | 参考 | 撤销验证 |
|---|---|---|---|---|
| **1** | `CMD-01` | `slashRouter.ts:15` 的 `split(/\s+/)` 换成 **POSIX 风格分词器**。**⚠️ 复核纠正：这不是单点修复**——下游有命令**二次切分**，见 §3.2 | 通用做法（自研实现） | 断言 `/theme "Dark Mode"` 取到 `Dark Mode`；`/cd "a b"` 的 target 不含引号；**未闭合引号报错而非静默** |
| **2** | `CMD-02` | **注册 `view` 命令**，**⚠️ 并需在 `cliRuntimeModule.ts` 加 `show-view`/`set-view` 的非交互分支**（否则管道运行被判 interactive-only）；同步 5 处文案/测试 | 我方已有实现 | 实机 `/view developer` 在**交互与非交互下都生效**；文案与注册表一致 |
| **3** | `CMD-07` | `/todo` 兜底改为「未知子命令 → 提示用法」，并把 `list` 加进子命令 | 与 `todoTool` 对齐 | 断言 `/todo list` **列举**而非新建任务 |
| **4** | `OBS-01` | 删掉 `/marketplace` 两个 404 默认源。**⚠️ 复核发现 `pluginsAndMarketplace.test.ts:47-53` 钉住了 `official`/`community` 两个默认源名，须一并更新** | 与 `/plugin` 的诚实立场一致 | 实测两个 URL 不存在；删除后 `/marketplace` 不再展示编造地址 |
| **5** | `SES-03` | `writeSessionState` 读 `readTakeoverNotice`，或删掉整条通知机制 | — | 预置陈旧锁 → 夺取 → 断言通知被消费（或机制不存在） |
| **6** | `BLD-01` | `package.json` 的 `main` 改为 `./dist/index.js`，**并修掉钉住错误字符串的测试** | — | `node -e "import('@cheers/ts-shell')"` 成功 |
| **7** | `BLD-02` | 删三个入口 shim；**同步它们自己的两个测试 + `cli-baseline.test.ts`**。**⚠️ 复核纠正**：初稿称「`docs/` 6 处引用会让 `rules_dangling` 变红」——**错了**，见下 | Phase 5 先例 | 受影响的 3 个测试改指真实实现；`verify:docs-drift:strict` 仍 0 dangling（**它本来就不会红**） |
| **8** | `THM-02` | `Theme` 加**合成样式**方法（prefix/suffix 按开启顺序逆序构造），`fg`/`bg` 改**定向复位** | `pi/tui/src/colors.ts:330-365` | 状态栏背景不再中途丢失（probe：`first global reset` 不再出现在行中） |
| **9** | `OBS-06` | `scrubStack` 扩到**绝对路径**（归一为项目相对路径） | `自研`（参考未查） | 解压归档后 `grep '/home/'` **零命中**（用真实 `unzip`，不用手写解压） |

**为什么 W1 先做**：9 项里有 5 项是**删掉/改正一句承诺**，成本以「行」计；
且 `CMD-01` 是**唯一一条改一处、修 56 个命令**的项。

### W2 — TUI 主屏收敛（**P1，结构最大**，单独一波）

> **为什么单独一波**：`TUI-01` 的修法是**收敛成一条渲染路径**（见前置研究 §1.1），
> 它会同时改变 `view.ts`/`pane.ts`/`engine.ts`/`mainScreen.ts` 四个文件的契约；
> `TUI-02/03/04/05` 都挂在**同一个根因**（主屏没有视口）上，必须与它一起设计。
> 参考实现的做法是**一条渲染、两种投递**（`pi/tui/src/tui-main-screen.ts:264`）。

| # | 条目 | 形态 | 参考 | 撤销验证 |
|---|---|---|---|---|
| **10** | `TUI-01` | **收敛渲染路径**：`regular` 模式改读**与备用屏同一条**装饰后的行（容量＝文档长度），删掉 `pane.ts:142` 的裸 `documentRows` 双路径 | `pi/tui/src/tui-main-screen.ts:264` 的单一 `this.render(width)`；`previousLines` 单数组 | 探针：`regular` 下行里**出现**搜索高亮（`\u001b[7m`）与滚动条；两模式产出同一批行 |
| **11** | `TUI-02` | `setMouseTracking(this.alternateScreen)`——照**我方自己的注释**做（`pointer.ts:11-13` 已写明「普通屏幕上滚轮属于终端」） | `grep wheel\|mouse pi/tui/src/tui-main-screen.ts` **零命中** | PTY：`regular` 下滚轮**滚终端滚回区** |
| **12** | `TUI-03` | 转录搜索是**备用屏专属**（参考实现的答案）⇒ 主屏**禁用该键并说明**，不假装可用 | `pi/alt-screen-search.ts` 的导出全部带 `AltScreen` 前缀 | 主屏按 `ctrl+shift+f` 不再出现「计数变了屏幕不动」 |
| **13** | `TUI-04` | 分页内容**临时占用备用屏**（`suspend` 类语义），消除「窗口式分页器 + 追加式屏幕」这个组合 | `pi` **没有 pager**（`NOT-FOUND`） | 翻页不再向滚回区追加整屏 |
| **14** | `TUI-05` | **去掉重复遍历**（`TUI-01` 的收敛顺带消除第 3 遍）＋ **块级行数缓存**让 `rowCount` 变 O(块数) 加法 | `pi` 的裁剪是**组件可见性过滤**（`stack.ts:82-87`），**不是行切片**——我方主屏天然要全量，故**不照搬** | 实测每帧遍历次数从 4 降到 2；20k 块帧耗时显著下降 |
| **15** | `TUI-06` | 退出前加 **`drainInput`**（抽干 stdin，防键盘释放事件泄漏到父 shell） | `pi/tui/src/terminal.ts:84` 的 `drainInput(maxMs=1000, idleMs=50)` | 慢速链路退出后父 shell 无残留转义；**注意这是 `MISSING` 不是 `DEFECTIVE`** |
| **16** | `TUI-08` | 词级导航改用 `Intl.Segmenter(...{granularity:"word"})`（`measure.ts:13` **已在用** grapheme 粒度） | `pi/tui/src/word-navigation.ts:28` | 探针：CJK 串的 `wordStart` 不再返回 0 |
| **17** | `TUI-09` | `renderKeyGuide` 接受**解析后的绑定表**；两表（`KEY_ACTIONS` 39 / `KEY_BINDINGS` 35）加一条**断言 chord 一致**的测试 | — | 用户改绑后 `/hotkey` 反映新键；两表漂移会让测试变红 |

**波内顺序**：**10 → 11/12/13 → 14 → 15/16/17**。
10 是其余各项的前提（主屏契约变了，11-14 才有意义）。

### W3 — 色彩管道与主题（同一改动面，一次做透）

| # | 条目 | 形态 | 参考 | 撤销验证 |
|---|---|---|---|---|
| **18** | `THM-01` + `THM-05` | `colorToAnsi(color, mode)`；`getTheme`/`applyTheme` 注入探测到的 mode；**删掉 `index < 16` 死分支** | `pi/colors.ts:299-307` + `terminal-image.ts:172-174` | truecolor 终端下发出 `\x1b[38;2;R;G;Bm`；256 下仍是 `38;5` |
| **19** | `THM-04` | 读 `NO_COLOR`（任一非空即禁用）与 `FORCE_COLOR` | **`自研`**：参考**不处理**（`grep` 零命中），按 `no-color.org` 标准实现 | `NO_COLOR=1` 启动 → 断言无颜色序列 |
| **20** | `THM-03` ①② | **schema + 校验** + **`vars` 变量引用**（不做 `auto`） | `pi/.../theme-schema.json`（56 令牌、`additionalProperties:false`、变量递归解析带循环检测） | 令牌名拼错**报错**而不是静默回退白字 |
| **21** | `THM-06` | 语法着色：`highlight(code,{language})` → 作用域→`ThemeColorToken` 粗粒度映射 | `pi/.../utils/syntax-highlight.ts`（**highlight.js 10.7.3**，`lib/core.js` + 21 语言 eager，其余 `setImmediate` 懒加载且**失败降级**；**自写 HTML→ANSI**，不依赖 hljs 主题） | 代码围栏出现着色；**依赖新增需独立裁决（§5-1）** |
| **22** | `THM-07` | 冒号分隔：或支持、或改文档 | — | **先确认生产者是否产出冒号形式**；不产出则改文档 |

**W2 的顺序**：10 → 11 → 12 → 13。**12 必须先于 13**（13 要往令牌表里加语法令牌）。

### W4 — 未捕获异常与数据丢失（P1 集中）

| # | 条目 | 形态 | 参考 | 撤销验证 |
|---|---|---|---|---|
| **23** | `CTX-07` | `memoryPersistence.ts:31-36` 的 `JSON.parse` **逐行 try/catch**，坏行收集为诊断 | **同仓已判为正确的模式**：`session/sessionEventCodec.ts:317` 的 `classifyTranscriptLine` | 喂 `NOT_JSON` + 截断行 → `list()`/`health()` **返回存活条目**而非抛 |
| **24** | `CTX-06` | `projectMemoryLocalStore.ts:133` 的 `appendFileSync` 包进 try/catch，返回 `blocked(...)` | **同文件**：`invalidateRecord`/`deleteRecord` 已这么做 | 文件置 `0444` 后写入 → **返回 blocker，不抛** |
| **25** | `SES-04` | `writeSessionMetadataRecord` 与 `current-session.json` 改走 `writeJsonFileAtomic` | `pi/.../storage/jsonl/storage.ts:512-528`（**同一协议**）+ 同仓 `sessionFileStore.ts:113-140` | 写入中途 kill → metadata 仍可解析 |
| **26** | `SES-01` | 让 `/todo` 的 **local 结果也产生一条记录**（在 bridge 层给「本地命令可声明要记录的状态」一条通用通道，而非只给 `/todo` 开特例） | `pi` 的清单随工具结果 `details` 走；我方 16-H 已建同构机制 | PTY：`/todo add x` → 文件里有记录 → `--resume` 后仍在 |
| **27** | `OBS-08` | `getRecentLines` 改为跨分片读取——**照抄同仓已有的正确实现**：`metricsCommandRuntime.ts:119-155` 的 `readMetricLines` 已按 `/\.log(\.\d+)?$/` 过滤、**按 mtime 排序（同名时间相同时以当前文件为最新，再按名字做全序）**、逐文件 `tailLines` 后取 `slice(-limit)` | **同仓已有实现**（`readMetricLines`）；参考实现未查 | 写满一个分片后 `/log tail` 仍返回接近 50 行；**且 `/log export` 与 `/log clear` 同样只操作当前分片**，需一并对齐 |
| **28** | `OBS-07` | MCP `catch` 传 `mcpFailureMetadata(error)`（函数已写好） | — | 断言失败结果带 `failureClass`/`failurePlane` |

### W5 — 流式与重试语义（P1 集中，需判定后动）

| # | 条目 | 形态 | 参考 | 撤销验证 |
|---|---|---|---|---|
| **29** | `PRV-07` + `LOP-05` | 二选一（**§5-2 待裁决**）：(a) 学参考做「上下文抹除 + 重试」；(b) 已显示过内容则**不重试**（上提守卫到 loop 层） | `pi/.../agent-session.ts:3684-3685` + `:1191-1207`（`appendContextEdit(targetId, null)`） | 构造「已流一半 + 连接断」→ 断言**不出现叠加文本**（(b)）或**模型输入不含半成品**（(a)） |
| **30** | `PRV-08` | `googleWire` 加图片分支，编 `{ inlineData: { mimeType, data } }`；覆盖 user 消息**与**工具结果 | `pi/.../google-shared.ts:209-222`、`:284-338`（工具结果在 Gemini 3+ 走 `functionResponse.parts`，<3 走后续 user 轮） | 断言请求体含 `inlineData`；图片 MIME 白名单 |
| **31** | `PRV-09` | `emptyAnswerExplanation` 的判据改为**复用 `retry.ts` 的 `REFUSAL` 正则**，**并扩展该正则**加上 `\brefusal\b` 与 `guardrail_intervened`（**探针实测：现有正则对这两个值 MISS**） | `pi` 各端点把这几类一律映射为 `error`（不误导为网络问题） | 断言 `refusal`/`guardrail_intervened` **不再**落到「check the provider with /connect」；**并断言 `content_filter`/`safety`/`recitation` 的既有行为不变**（避免扩展正则时回归） |
| **32** | `PRV-01` | Anthropic 流内 `error` **立即 throw**（丢弃后续字节），与 Bedrock 一致 | 同仓 `bedrockConverse.ts:396-402` 已是此形态 | 喂 error 帧后**保持连接不关** → 断言立即抛而非等 EOF |
| **33** | `PRV-02` | `/btw` 传 `shape.supportsTemperature`（catalog 已在手） | `pi` 无此路径（我方独有命令）→ `自研` | 断言请求体按模型能力决定是否带 temperature |

### W6 — 债务与可达性（最后做，逐个闭包核实）

| # | 条目 | 形态 | 撤销验证 |
|---|---|---|---|
| **34** | `TOL-02` + `CDE-01/02` | **删除** `edit/patch` 三角（432 行）——判决已定：生产实现更强，候选会对不相交级联**误报** | `tsc` 无悬空 import；编辑相关测试全绿 |
| **35** | `TOL-01` | 删 `ToolDefinition.permissions` + `ToolPermissionRequirements`（17 处声明） | 同 `bridgeSafe` 先例；`tsc` 通过 |
| **36** | `CDE-03` | `sandbox/`：**类型移到真正的所有者**（`EscalationPrompt` 等被 17 文件类型引用），再删四个实现类 | 17 个类型引用者改指新位置后 `tsc` 通过 |
| **37** | `CDE-05` + `PRV-11` | 运行期死码 37 文件 / 6,691 行 **逐簇**处置（先 `tsc` 抓悬空 import，Phase 5 的教训） | 每簇删除后 `tsc` + 门禁 |
| **38** | `CDE-06` | `core/harness/**` 移到 `test-utils/`（**分批**，README 有此要求） | 引用者同步后测试全绿 |

**W5 的纪律**：**每簇一个提交**，先跑 `tsc` 抓悬空 import——
Phase 5 的教训是**子代理会把有引用者的文件误列进闭包**。

---

## 3. 逐项形态说明（只写需要展开的）

### 3.2 `CMD-01` 的分词器（W1-1）

**形态**：新增一个纯函数 `tokenizeCommandArgs(input: string): string[]`，
在 `slashRouter.ts` **切分之前**调用。

> ⚠️ **复核纠正（`RvAW1Claims`）：这不是「单点修复、全局收益」。**
> 初稿说「改一处修 56 个命令」——**不成立**。下游有命令**拿到 tokens 后再切一次**：
>
> `core/commands/statuslineCommandRuntime.ts:38-42`
>
> ```ts
> const requested = rest.join(" ").split(/[\s,]+/).map((v) => v.trim()).filter(Boolean);
> ```
>
> ⇒ 上层的正确分词会被这一句**重新抹平**。**复核者还指出**多个命令用
> `args.join(' ')` 重组（`btw`/`commit`/`copy`/`deepResearch`/`goal`/`memory`/
> `shellActionRuntime` 的 `runCdShellAction`/`todo`/`review`/`brainstorm`/`prompt`）——
> 重组再切分的**都会**破坏引号语义。
>
> **所以 W1-1 的实际范围是**：①上层分词器；②**逐个检查下游的 `join`+`split` 组合**，
> 至少修掉 `statuslineCommandRuntime.ts:38-42`。
> **撤销验证必须包含下游**：断言 `/statusline use "a b"` 不被二次拆开。

**必须覆盖**（否则只是把一种错换成另一种）：
- 双引号与单引号；
- 反斜杠转义（含转义引号）；
- **未闭合引号 ⇒ 报错**（当前行为是静默把它当普通字符）；
- 转义在引号内外的语义差异（POSIX：单引号内不转义）。

**不做**：变量展开、命令替换、glob —— 这不是 shell。

### 3.7 `PRV-07` / `LOP-05` 的两条路（W5-29）

| 方案 | 形态 | 成本 | 代价 |
|---|---|---|---|
| **(a) 学参考** | 给消息加「上下文抹除」标记，重试时**模型看不到半成品** | **高**——我方**没有**这个概念（`grep appendContextEdit` 零命中），需要新机制 + 持久化 | 引入新状态与新的持久化面 |
| **(b) 上提守卫** | 已显示过内容 ⇒ `retriesExhausted: true`（`loop.ts` 不再重跑） | **低**——一处参数 | **不重试**：网络抖动时用户要手动重发 |

**本文倾向 (b)**：理由是 `PRV-07` 的实际危害是**「已显示的文本之上再叠一段」**，
(b) 直接消除它；(a) 的额外能力（自动重试且不叠加）**在当前没有证据表明用户需要**。
**但这是取舍，列入 §5-2 待维护者确认。**

**无论选哪条，都必须加断言**：构造「部分输出 + 连接断」，验证**不出现叠加文本**。

### 3.3 `THM-02` 的合成样式 API（W1-8）

**形态**：`Theme` 增加

```ts
style(token: ThemeColorToken, text: string, opts?: {
  bg?: ThemeColorToken; bold?: boolean; dim?: boolean; italic?: boolean;
  underline?: boolean; inverse?: boolean; strikethrough?: boolean;
}): string
```

内部按参考实现构造 `prefix`/`suffix`：**开启按序、复位逆序**，
用 `39m`/`49m`/`22m`/`23m`/`24m`/`27m`/`29m`（**不是 `0m`**）。

**迁移**：`blocks.ts:127-135` 的 `replaceAll("\x1b[0m", ...)` **绕过手法可以删掉**
（它是问题存在的证据）。

> ⚠️ **复核纠正（`RvAW1Claims`）**：初稿说 `band.ts`/`modal.ts`/`panel.ts`/`suggestions.ts`
> 的 `bgOpen(...) + … + "\x1b[0m"` **一并改为 `style(...)`**——**这个说法不完整**。
> `style(token, text, opts)` 只能给**一段同构文本**上样式；
> 而那四处是**行级背景**：先 `bgOpen` 铺一整行、行内再嵌多段不同前景的文本、
> 最后整行收尾。**这种「跨多段的外层背景」不能用 `style()` 表达。**
>
> ⇒ **正确的顺序是**：①先让 `fg`/`bg` 改用**定向复位**（这是根本前提，
> 一旦 `fg` 用 `\x1b[39m` 收尾，外层 `bgOpen` 就不再被抹掉）；
> ②`style()` 只用于**单段合成**的场合（如 `blocks.ts:126-133` 的逐行 `fg`）；
> ③**行级背景仍用 `bgOpen` + 行尾复位**，但行内各段不再需要 `replaceAll` 补背景。
> **`blocks.ts` 那个 `replaceAll` 因此可以删——因为前提①已经修好了根本原因。**

### 3.4 `THM-06` 的依赖取舍（W2-13，转 §5-1）

**参考实现的形态已读清**（`pi/.../syntax-highlight.ts`）：
`highlight.js/lib/core.js` + 21 个语言文件 eager、其余 `setImmediate` 懒加载、
**自写 HTML→ANSI**（不需要 hljs 主题）。
`highlight.js@10.7.3` 全量包 unpacked **1.71 MB**，但**我们只取 core + N 个语言文件**。

**替代方案**：自写 tokenizer（零依赖，覆盖窄）。

**列 §5-1 待裁决**——本仓只有 **6 个**运行时依赖，且 `AGENTS.md` 对新增一贯谨慎。

### 3.5 `SES-01` 的通用通道（W3-18）—— **成本已被复核纠正**

> ⚠️ **更正**：本条初稿断言通用通道「改动面更小」。**复核者 `RvCW3W5Deletions` 指出反了**：
> 通用通道要动 `LocalCommandResult` 类型、bridge、turn sink 与各 handler，
> **改动面严格大于**给 `/todo` 开一个特例。我接受这个更正。

**两种形态的真实取舍**：

| 形态 | 改动面 | 架构 |
|---|---|---|
| **(a) `/todo` 特例** | **小**：在 bridge 的 `kind === "local"` 分支里对 `/todo` 的结果调一次 `onTurnMessage` | 长出第一个特例 |
| **(b) 通用通道** | **大**：`LocalCommandResult` 加可选「要记录的状态」位 + bridge + turn sink + handler 适配 | 干净，`/goal`/`/loop`/`/thinking` 将来复用 |

**裁决**：**先做 (a)，并在 (b) 的形状上留痕**——
即在 (a) 的实现里把「要记录的状态」表达为一个**通用形状**（而非 `/todo` 专用字段），
这样 (b) 到来时只需把它从 bridge 的 `/todo` 分支**提升**到通用路径，而不用重写。
**理由**：`SES-01` 是 P1（数据丢失），且**当前只有 `/todo` 一个消费者**证明了这个需求；
为一个尚未出现的第二个消费者先建一套通道，违反「不为假想的复用建抽象」。

### 3.6 `W5` 的删除顺序（先易后难、先无争议）

1. `TOL-02` / `CDE-01/02`——**判决已定**，且**已有参考侧佐证**（pi 的区间重叠检查与我方同构）；
2. `BLD-02`——三个 shim（记得同步 `docs/`）；
3. `TOL-01`——`permissions`（同 `bridgeSafe` 先例）；
4. `CDE-03`——沙箱（**先移类型**，再删实现）；
5. `PRV-11`——`projectProviderRegistry` 那 ~445 行（**同文件的死半**）；
6. `CDE-05` / `CDE-06`——最后，逐簇。

---

## 4. 验证纪律（每波）

1. **每项独立提交**，提交信息说明**为什么**（不只是改了什么）；
2. **撤销验证**：施工后**反向**验证一次
   （Phase 4/5/6/16 都这么做——把修复还原，确认测试变红，再恢复）；
3. **每波末**：`check:*` + `verify:*` + `test:scripts` 全跑；
   触及 TUI/会话/斜杠命令的波按 §2.4 的 **PTY 实机**要求做端到端；
4. **不新增依赖**除非 §5-1 裁决通过；
5. **诚实**：凡参考无对应机制的，提交信息与文档都要标 `自研`（不许伪装成「对齐参考」）。

---

## 5. 需独立裁决的 4 项（**不在本阶段自作主张**）

| # | 问题 | 选项 | 本文倾向 |
|---|---|---|---|
| **1** | `THM-06` 是否引入 `highlight.js` | (a) 引入 `highlight.js@10.7.3`（只取 core + 21 语言，参考实现的验证选择）；(b) 自写 tokenizer（零依赖，覆盖窄） | **(a)** —— 参考实现已用它验证过「core + 语言子集 + 自写 HTML→ANSI」这条路径，且**不引入第二个依赖**；但这是第 7 个运行时依赖，需维护者定 |
| **2** | `PRV-07`/`LOP-05` 走 (a) 上下文抹除还是 (b) 不重试 | 见 §3.2 | **(b)**（低成本、直接消除危害）；(a) 是新机制 |
| **3** | `SES-02` 的锁是否加 **fencing（epoch）** | (a) 加 epoch（真正成立）；(b) **维持现状 + 把保证如实降级写入文档** | **(b)** —— 13 号册已按「如实降级」记录；加 epoch 会动 `state.json` 格式与迁移 |
| **4** | `BRW-01`：请求守卫改 **context 级**还是**改为页级 + 改注释** | (a) 扩 `PwBrowserContext.route` 改 context 级；(b) 保持页级、**改掉那句不实注释** | ⚠️ **复核纠正**：初稿的「(b)+弹窗补拦截」**自相矛盾**——`RvAW1Claims` 指出，Playwright 里弹窗是 `BrowserContext` 新生的 `Page`，**要拦弹窗就必须在 context 级观察**（`context.route` 或 `context.on('page')`）。⇒ 两选项必须**互斥**地重写：(a) context 级（真正覆盖弹窗，代价是扩接口）；**(b) 纯页级**：只改注释说清「新开页面不受管辖」，**不声称补了弹窗拦截**。本文倾向 **(b) 纯页级**——因为参考侧**没有可验证先例**，且 (b) 立刻消除「注释说谎」；(a) 留作后续独立裁决 |

---

## 6. 明确不做（6 项，附理由）

| 项 | 理由 |
|---|---|
| **16-L** Bedrock 端到端 | **无可用账号**。协议正确性已在 `PRV-08` 一类的**读码 + 合成块单测**层级覆盖；「无法端到端验证」不等于「无法正确实现」 |
| **记忆自动注入**（Claude Code 式索引常驻） | **产品模型变更 + 提示注入面**。我方是显式 `/memory use`，参考是常驻注入——**不同产品模型**，Phase 16 §5 已记 |
| **alt-screen 分栏侧栏** | 产品决定（Phase 15/16 两次记 backlog）。且 `OBS-03` 的现状是**文本面板**，与「分栏」是两件事 |
| **MCP SSE/HTTP 传输** | 与 15-A 分离，避免一个提交背两个协议 |
| **扩展宿主**（进程内编程式扩展） | Phase 8 已裁决不做（**写进代码的防御立场**）。**本轮新证据**：pi 有 49 个扩展事件，**但那是不同机制**（编程式 vs 我方的声明式外部钩子）⇒ 不能按「参考有 49 个」来加 |
| **凭据路径的主动测试** | 两次 `content_filter` 的读面；按本仓纪律留给维护者 |

**另需记录的一项**：`OBS-03`（18 个钩子事件只有 1 个有内建消费者）
**本阶段只做「可发现性」**（列出 18 个事件及其载荷字段），
**不为对称而补 17 个内建钩子**——每个内建钩子都有自己的产品判断。

---

## 7. 复核安排与结果

### 7.1 安排

> **状态**：**已完成**（三个复核者全部返回，结果见 §7.3）。

本文与 `phase-17-pre-research.md` 交 **3 个只读子代理**分域证伪（并发 3）：

- **RvA**：W1（`CMD-01/02/07`、`OBS-01`、`SES-03`、`BLD-01/02`、`THM-02`、`OBS-06`）
  ——重点证伪「单点修复」类断言与「参考依据」是否真的成立；
- **RvB**：W2 + W4（`THM-01/03/04/05/06/07`、`PRV-07/08/09/01/02`、`LOP-05`）
  ——重点证伪参考实现的**形态描述**（尤其 `THM-06` 的依赖结论与 `PRV-07` 的两条路）；
- **RvC**：W3 + W5 + §5 的 4 项裁决
  ——重点证伪「删除是安全的」（`TOL-01/02`、`CDE-03/05/06`）与 4 项裁决的取舍是否合理。

### 7.2 主代理**在复核者返回之前**已自查的三处（探针级）

> 这三处是 W2/W4 里风险最高的断言，我在派发复核的同时**自己也证了一遍**，
> 以免复核者的结论成为唯一依据。

**① `THM-05`：参考实现确实没有 16 色档** — `CONFIRMED`

`pi/packages/tui/src/colors.ts:25`

```ts
export type TerminalColorMode = "256color" | "truecolor";
```

`colorAnsi(color, mode, background)`（`:299`）只有两条分支；
`rgbToAnsi256`（`:279-297`）的返回值域是
`16 + 36*r + 6*g + b`（16–231 色立方）或 `232 + grayOffset`（232–255 灰阶），
**最小值 16**。`grep "16color|ansi16|bright"` **零命中**。

⇒ **「我方也不需要真正的 16 色降级，删掉死分支即可」成立**。

**② `PRV-09`：现有 `REFUSAL` 正则**不**匹配那两个新值——必须扩展** — `CONFIRMED`

探针（实测，可重跑）：

```
MATCH   content_filter      MATCH   safety / SAFETY / recitation
MISS    refusal             ← Anthropic
MISS    guardrail_intervened ← Bedrock
```

加上文档提出的两个词后，六个样例**全部 MATCH**。
⇒ **裁决里「补上 `refusal` / `guardrail_intervened`」是必需的，不是可选的**——
只复用现有正则会漏掉这两个端点。
**这条同时说明**：`PRV-09` 的修复**不能**只写「复用 `retry.ts` 的 `REFUSAL`」，
必须写明**扩展**它；否则实施者会照做而漏掉两个值。

**③ `THM-04`：参考实现确实不处理 `NO_COLOR`/`FORCE_COLOR`** — `CONFIRMED`

`grep -rn "NO_COLOR\|FORCE_COLOR" pi/packages/tui/src/*.ts` → **零命中**。
⇒ 裁决里标的 `自研` 是诚实的；实施者与复核者都**不应**期待在参考里找到对应实现。

### 7.3 结果

三个复核者全部返回（`RvAW1Claims` 23m50s / `RvBW2W4Mechanisms` 11m52s / `RvCW3W5Deletions` 22m43s）。
主代理**逐条复验**其断言，结果如下。

**累计 32 条断言：`correct` 22、`partly-wrong` 8、`wrong` 1、`unverifiable` 1。**

> **含 1 条 `wrong`——而且是推翻主代理的**（`BLD-02`，见 7.3.1 第 7 行）。
> 这与前几轮「复核者结论也常有错」不同：本轮**没有**推翻复核者，
> 反而**被复核者推翻了 1 条**。原因见 7.3.4。

#### 7.3.1 复核者**成立**且**改了计划**的 7 条（这是复核的主要价值）

| # | 条目 | 复核者发现 | 主代理复验 | 计划改动 |
|---|---|---|---|---|
| 1 | `CMD-01` | **不是单点修复**：`statuslineCommandRuntime.ts:38-42` 会 `rest.join(" ").split(/[\s,]+/)` **二次切分**，抹平上层分词 | 读码确认（§3.1 已引原文） | W1-1 范围扩大：加「逐个检查下游 join+split」，撤销验证含 `/statusline use "a b"` |
| 2 | `CMD-02` | `cliRuntimeModule.ts:268-372` **不处理** `show-view`/`set-view` ⇒ 管道运行仍报 interactive-only | `grep` 确认零命中 | W1-2 增加非交互分支；验收改为「交互**与非交互都生效**」 |
| 3 | `OBS-01` | `pluginsAndMarketplace.test.ts:47-53` **钉住了** `official`/`community` 两个默认源名 | 读测试确认 | W1-4 增加「同步该测试」 |
| 4 | `SES-01` | 通用通道**成本更高**（要动 `LocalCommandResult`/bridge/turn sink/handler），比 `/todo` 特例**大** | 接受：确实更广 | §3.5 改为「**先做 (a)，但把状态表达成通用形状**」，等第二个消费者再提升 |
| 5 | `OBS-08` | **同仓已有正确实现**：`metricsCommandRuntime.ts:119-155` 的 `readMetricLines` **已经**跨分片读（按 mtime 全序，同名时当前文件最新，再按名字） | 读码确认 | W3-19 由「按 part 号降序」改为**照抄 `readMetricLines`**；并补「`/log export`、`/log clear` 同样只操作当前分片」 |
| 6 | `PRV-09` | 现有 `REFUSAL` 正则**不匹配** `refusal` / `guardrail_intervened`；只「复用」会漏掉两个端点 | **探针实测**：两者均 MISS；加上文档提出的两个词后 6 个样例全 MATCH | W4-23 明确写「**并扩展该正则**」，验收补「既有 `content_filter`/`safety`/`recitation` 行为不变」 |
| **7** | `BLD-02` | ⚠️ **推翻主代理（`wrong`）**：初稿称「`docs/` 有 6 处引用，删 shim 会让 `rules_dangling` 变红」——**不成立** | 主代理读 `verify-docs-and-rules-drift.mjs:44`：`RULES = ['AGENTS.md','agent-rules','.wiki/_index.md']`，**不含 `docs/`**；且被引的 `control-plane-atlas.md`/`module-atlas.md` 在 `DOC_STATUS.md` 里标的是 **`superseded`** 而非 `active`（`:38`、`:41`），**根本不进门禁**；未加前缀的引用只进 advisory 计数 | W1-7 改为：**真正要同步的是三个测试**（`cliPrintModeRunner.test.ts`、`cliStdinModeRunner.test.ts`、`cli-baseline.test.ts`），不是 docs |

#### 7.3.2 复核者**成立但计划无需改**的（澄清性）

| 条目 | 复核内容 | 判定 |
|---|---|---|
| `THM-05` | 参考确实**只有** `truecolor`/`256color`，无 16 色档（`index < 16` 在 pi 里只出现在 `indexedToRgb` 的**输入侧**） | ✅ 计划不变 |
| `THM-04` | 参考确实**零处理** `NO_COLOR`/`FORCE_COLOR` ⇒ `自研` 标注诚实 | ✅ 计划不变 |
| `THM-03①` | 我方令牌名**真未校验**（`themes/index.ts:147-162` 的 `asThemeConfig` 接受任意字符串），`fg()` 静默回退 `#ffffff` | ✅ 计划不变 |
| `THM-06` | highlight.js 的**每个机械细节**成立（10.7.3 / `lib/core.js` / 21 个 eager 语言 / `setImmediate` 懒加载 + 失败降级 / **自写 HTML→ANSI**） | ✅ 计划不变（依赖裁决仍待定） |
| `THM-02` | 复位码与逆序 suffix 构造与引用一致 | ✅ 计划不变 |
| `PRV-07` | **投影代码确认**：`session-manager.ts:519-524` 的 `projectContextEntry` 里 `if (replacement === null) return []` ⇒ 抹除**真的**把该条从模型输入里去掉 | ✅ **强化**了 (a) 方案的可行性结论 |
| `PRV-08` | `inlineData` 形态与**用户消息 / 工具结果**两处用法成立；我方 `googleWire.ts` 确无图片分支 | ✅ 计划不变 |
| `PRV-01` | Anthropic 等 EOF、Bedrock 立抛，两侧已引原文 | ✅ 计划不变 |
| `PRV-02` | `/btw` 硬编码 `false`，而 `loadCatalog()` 已在 `:48` 调用 | ✅ 计划不变 |
| `CTX-06` | `mkdirSync` 有守卫、`appendFileSync` 无；**复核者独立复现了 EACCES** | ✅ 计划不变（与我方探针一致） |
| `CTX-07` | 无守卫的 `JSON.parse`；同仓 `sessionEventCodec.ts:324-334` 确实按行隔离 | ✅ 计划不变 |
| `SES-04` | 两处非原子写；`writeJsonFileAtomic` 与 pi 的 `replaceSidecar` 同协议 | ✅ 计划不变 |
| `OBS-07` | `mcpFailureMetadata` 零消费者；`registry.ts:822-824` 丢弃分类 | ✅ 计划不变 |
| `CMD-07` | 兜底确是写入；加 `list` 需同步 `argumentCompletions.ts:33`、`registry.ts:484`、usage 文案 | ✅ 计划不变（补齐同步点） |

#### 7.3.3 复核者断言中**主代理未能证实**的 1 条

| 条目 | 复核者断言 | 主代理判定 |
|---|---|---|
| `TOL-02` 的反向用例 | 复核者称构造并确认了 `conflict.ts` 对不相交级联的误报 | 主代理**未**独立构造出该输入（§7.2 已记）。**判决不变**（三角完全不可达 + 生产实现与我方参考 pi 同构已足够支持删除），但**「候选会误报」这一条仍标 `INFERENCE`**，不当作已证事实 |

#### 7.3.4 本轮复核为何**没有**出现「推翻复核者」

前几轮每轮都有 4-6 条复核者断言被推翻。本轮为 0，有三个具体原因：

1. **复核 brief 把证据门槛写死了**——「无 `file:line` 与引文的 `wrong` 无效」、
   「探针返回空必须换方法复核」。前几轮的失败模式（读旧文档、引用已删符号、
   手写探针出错）**都被这两条挡住**。
2. **复核者被要求自己跑探针**——`CTX-06` 的 EACCES 与 `OBS-06` 的归档泄漏
   都由复核者**独立复现**，不是读码推断。
3. **有 1 条 `wrong` 打在主代理身上**（`BLD-02`），说明复核是**真的在证伪**，
   不是走过场——只是这次证伪命中的是计划而非复核者。

**但仍有一项主代理未能证实**（如实记录）：
`TOL-02` 的「候选检测器会对不相交级联误报」——复核者称构造并确认，
主代理**未**独立复现该输入。**判决不变**（三角完全不可达 + 生产实现与 pi 同构
已足够支持删除），但该条仍标 `INFERENCE`。

**结论**：本文的计划经复核后**有 7 处实质改动 + 1 处取舍纠正**，
其中 1 处是主代理自己的事实错误（`BLD-02`）。
按本仓纪律，**这些改动已写入 §2/§3/§5 的对应条目**，不留待施工时发现。

---

#### 7.3.5 ⚠️ 主代理在收尾自查中发现**自己的规划漏洞**：TUI 域整体遗漏

> 这一条**不是复核者发现的，是主代理在写完文档后自查发现的**，
> 按本仓纪律如实记录——它比复核者发现的问题更严重，因为它意味着
> 一个**P1 被排除在计划之外**。

**问题**：初稿的 §1.2 声称「12 条 P1 **全部纳入**」，
但 §2 的五波里**一条 `TUI-*` 都没有**。
把 13 号册的 12 条 P1 逐条对照裁决文档，发现 **`TUI-01` 缺失**；
进一步 grep 后确认：**整个 TUI 域 8 条 OPEN 全部不在计划里**
（`TUI-01/02/03/04/05/06/08/09`）。

**根因**：前置研究 §1 **做了**这一节的机制研究（而且是最详实的一节——
读出了「pi 只有一条渲染路径」这个关键事实），
但写裁决时**从 W1 直接跳到色彩管道**，把「已经研究过」当成了「已经规划过」。
**这是「拿研究当计划」的错误**，与前面三次「只看一层就断言」同型——
都是**把中间产物当成了最终产物**。

**处置**：新增 **W2「TUI 主屏收敛」**（8 项），并把原 W2–W5 顺延为 W3–W6，
条目编号 10–30 整体重编为 18–38。**最终 38 项**：

```
W1 错误承诺与单点全局收益        9 项（1-9）
W2 TUI 主屏收敛（P1，结构最大）  8 项（10-17）  ← 本次补入
W3 色彩管道与主题                5 项（18-22）
W4 未捕获异常与数据丢失（P1）     6 项（23-28）
W5 流式与重试语义（P1）           5 项（29-33）
W6 债务与可达性                  5 项（34-38）
```

**12 条 P1 现已全部在位**（逐条核对：`TUI-01`→10、`THM-01`→18、`THM-02`→8、
`CMD-01`→1、`BRW-01`→§5-4、`SES-01`→26、`PRV-07`→29、`PRV-08`→30、
`LOP-05`→29、`CTX-06`→24、`CTX-07`→23、`CDE-03`→36）。

**方法论教训（第 4 次同型）**：
`TOL-02`（把生产实现判为更弱）、浏览器表（12 个装配模块判为死码）、
`LOP-05`（只看守卫不看标志设置者）、**本次（把研究当成计划）**——
**都是「只看了一层就断言」。**
前三次由复核者指出，这次由自查发现；
**但四次都说明同一件事：写完之后的机械核对（逐条对照清单）是不可省的步骤。**


