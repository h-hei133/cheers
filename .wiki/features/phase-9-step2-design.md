---
title: "Phase 9 施工记录：第 2 步 —— 终端图表渲染"
category: article
sources: [phase-9-decisions, ref-mermaid-2026-09-25, mermaid-measured-2026-09-25]
created: 2026-09-25
tags: [features, phase-9, execution, tui]
summary: "Phase 9 第 2 步施工。给围栏代码块加图表渲染：`mermaid` 语言标记的块渲染成 Unicode 制表字符画。用户裁决默认 streaming。主代理实测库 API 与两侧耗时后，加两条保护（按源文本缓存、体积上限）——前者抵消我方「每个 delta 全量重解析」的既有成本，后者兑现 pre-research 对参考实现「无 CPU 上限」的批评标准。"
confidence: high
---

# Phase 9 第 2 步施工

## 1. 参考实现（已读，`mermaid.ts` 89 行）

| 项 | 参考做法 |
|---|---|
| 接入方式 | `MarkdownTransformer`，在 Markdown 渲染**之前**跑；用词法分析器取 token，把 `code` 且 `lang==="mermaid"` 的 token 的 `raw` 换成图表文本 |
| 渲染 | `grok-mermaid` 的 `render(source)` → `{plain, styled, width, warnings}` |
| 上色 | `styled` 的 span `cls` 映射到主题：`border→borderMuted`、`text→text`、`edge→accent`、`edgeLabel→muted`、`title→accent+bold`、`none→原样` |
| 输出形态 | 每行包成 **inline code span** 并用 Markdown 硬换行（`  \n`）连接，以保住制表字符的对齐与空白行高度 |
| 模式 | `off` / `final` / `streaming`；`off` 与「思考块」直接原样返回；`streaming` 时若仍在流式则**不渲染** |
| 降级 | 宽度超限 → `raw`；**非流式**且 `warnings` 非空 → `raw` + 一行告警；`render` 返回空 → `raw` |

## 2. 我方与参考的结构差异（决定了不能照搬）

| 差异 | 后果 |
|---|---|
| 我方是**行级解析器**（`markdown.ts` 逐行扫，`FENCE` 正则抓围栏），参考是**词法分析器 + transformer 管线** | 没有 `token.raw` 可换，也不存在 transformer 注册表。接入点是 `renderMarkdown` 内**唯一一处** `renderFence` 调用（`markdown.ts:84`） |
| 我方输出**行数组**（`string[]`），参考输出**Markdown 文本**再交给下游渲染 | 参考的「包成 code span + 硬换行」是为了在 Markdown 里保对齐；我方直接产出已排好版的行，**不需要这层包装**——这是必须省掉的复杂度 |
| 我方渲染**已按终端列宽**计算（`cells`），参考的 transformer 拿到的是 `context.availableWidth` | 宽度判定位置不同：我方在 `renderFence` 内已有 `cells` |
| 参考的 `borderMuted` 是活令牌，我方是**死令牌**（39 个中 15 个未被消费） | 若照抄映射，图表边框会用一个**没有读取者的令牌**——渲染不出颜色且不报错。故映射到**活的** `border` |

## 3. 我方实测（主代理亲测，子代理切片因内容过滤失败）

### 3.1 库 API

```
render(src) → { plain: string[], styled: Array<Array<{text, cls}>>, width: number, warnings: string[] }
```
- `cls` 实测取值：`border` / `text`（与参考的映射表一致）。
- **无效输入返回 `null`，不抛异常**（实测 `flowchart TD\n ???bad`）。仍保留 `try/catch` 兜底库自身缺陷。
- 版本 0.2.3、Apache-2.0、**零传递依赖**、unpacked 508,454 字节（实测 `npm view`）。

### 3.2 耗时（实测）

| 规模 | 单次渲染 |
|---|---|
| 小图（2 节点） | 0.29ms |
| 20 节点 | 0.87ms |
| 120 节点 | 3.53ms |
| 时序图 | 0.14ms |

我方 Markdown 单次全量重解析：201 行 0.58ms / 1,001 行 1.46ms / 4,001 行 **4.31ms**。

### 3.3 关键机制：我方**本来就每个 delta 全量重解析**

`blocks.ts:253-257` `renderAssistant` 对**未 finalize** 的块直接调 `renderMarkdown`，
即流式期间每个 delta 都重解析整块。**因此图表渲染的成本是叠加在既有成本上的**
（4,000 行时约 `4.31 + 3.53 ≈ 7.8ms/次`），不是新引入的架构问题。

## 4. 决定

| # | 决定 | 依据 |
|---|---|---|
| **M1** | 新建 `presentation/tui/transcript/mermaid.ts`，暴露 `renderDiagram(source, width) → string[] \| undefined` | 把库调用、主题映射、宽度/体积校验、降级全部关在一个模块里；`markdown.ts` 只做一次分支调用 |
| **M2** | 接入点是 `markdown.ts:84` 的**单点** `renderFence` 调用，加一个 `language === "mermaid"` 分支 | 该处已是**唯一**围栏出口（全仓实测），改动面最小 |
| **M3** | 输出**直接用行数组**，不做 code span 包装 | 我方不需要经 Markdown 往返；照抄会引入无用层 |
| **M4** | 主题映射到**活令牌**：`border→border`、`text→text`、`edge→accent`、`edgeLabel→muted`、`title→accent+bold` | 参考用 `borderMuted`，但我方该令牌**无读取者**（15 个死令牌之一）。用死令牌 = 静默无色 |
| **M5** | **按源文本缓存**渲染结果 | 流式期间同一段图表源码会随 delta 被反复渲染。缓存使「围栏内容未变」时零成本——这是 `streaming` 默认模式能成立的前提 |
| **M6** | **体积上限**：围栏正文超过行数/字符上限即不渲染，降级为普通代码块 | 兑现 pre-research §1.2 对参考实现「无 CPU/内存上限」的批评。**不对自己用两套标准**。上限在**调用库之前**检查 |
| **M7** | 三档降级：宽度超限 → 原样；`warnings` 非空 → 原样 + 一行提示；返回 `null` 或抛异常 → 原样 | 与参考同策；失败必须**看得见**（提示行）而非静默 |
| **M8** | 模式经 `tuiSettings` 持久化，形态照 `statusItems` 先例 | 该字段必须有**生产读取者**，否则 `check:config-consumers` 失败 |

### 4.1 与裁决的一处偏离（须记录）

裁决为默认 `streaming`。但 M5 的缓存使「同一围栏内容只渲染一次」，
故流式期间的实际成本 = **图表源码每变一次渲染一次**，与参考的 `streaming` 语义一致而成本受控。

**未采纳参考的 `final` 分支语义**：参考在 `streaming` 模式下**仍会**渲染（只是等 `isStreaming` 为假才渲染的 `final` 模式相反）。
我方 `trimPartialFence` 已保证未闭合围栏不会进入解析，因此「围栏未闭合」不会触发渲染尝试。
即：**我方不需要 `final` 模式**——它是为「未闭合围栏会闪烁」这一参考侧问题而存在的，而我方已用另一种方式解决。
故只实现 `off` 与 `streaming` 两档，`final` 不做（无对应问题，做了是多余分支）。

## 5. 文件

| 文件 | 改动 |
|---|---|
| `package.json` | 加 `grok-mermaid`（第 6 个运行时依赖；零传递依赖、Apache-2.0、508KB） |
| `src/presentation/tui/transcript/mermaid.ts`（新） | 渲染、主题映射、缓存、体积上限、降级 |
| `src/presentation/tui/transcript/markdown.ts` | `:84` 加 mermaid 分支 |
| `src/config/runtimeConfig.ts` | `TuiPreferences` 加 `diagrams?: "off" \| "streaming"` |
| `src/cli/interactive/tuiSettings.ts` | 读写该偏好（照 `statusItems` 形状） |
| `src/cli/interactive/interactiveMode.ts` | 启动时应用到渲染模块（照 `applyTheme` 先例） |
| 测试 | 正常图、宽度超限、语法错误、关闭、缓存命中、体积上限 |

**命名理由**：模块名 `mermaid` 是**围栏语言标记本身**（用户写的 ` ```mermaid `），
不是我方发明的名词，也不是别人的项目名；与同目录的 `markdown.ts`、`diff.ts`、`blocks.ts` 同层级同风格。
对外 API 用 `renderDiagram` 而非 `renderMermaid`，因为**对调用方而言它渲染的是一个图表**，
语言标记是实现细节。

## 5.5 实现结果（2026-09-25）

### 已落地

| 文件 | 内容 |
|---|---|
| `package.json` | `grok-mermaid@^0.2.3`（实测 license Apache-2.0、`dependencies: null`、ESM） |
| `presentation/tui/transcript/mermaid.ts`（新） | `renderDiagram(source, cells)`、`setDiagramMode`/`diagramMode`、`DIAGRAM_LANGUAGE`、`diagramWidth` |
| `presentation/tui/transcript/markdown.ts` | `renderFence` 加 `language === DIAGRAM_LANGUAGE` 分支（**单点**） |
| `config/runtimeConfig.ts` | `TuiPreferences.diagrams?: "off" \| "streaming"` |
| `cli/interactive/tuiSettings.ts` | `readDiagramMode`（用户级 + 项目级，**只认这两个值**——拼错不静默当第三档） |
| `cli/bootstrap/cliProcessRunner.ts` | 启动时 `setDiagramMode(...)`，紧随 `applyStartupTheme` 之后 |

**门禁**：`check:config-consumers` → `fields=38 read=38`（新字段有生产读取者）。

### 实机（构建产物）

`renderMarkdown` 直接输出（真实终端字符）：

```
                            yes  ┌────────┐
                           ┌────▶│ Handle │
┌─────────┐      ╭────────╮│     └────────┘
│ Request ├─────▶│ Valid? ├┤
└─────────┘      ╰────────╯│no   ┌────────┐
                           └────▶│ Reject │
                                 └────────┘
```
时序图同样正确（`Alice`/`Bob` 生命线 + 实线/虚线箭头）。`off` 时回退为带 `mermaid` 标签的代码块。

### 施工中发现并修掉的既有问题

**`cli-baseline.test.ts` 的 5 个用例失败**——根因是 **9 处测试夹具用了 `transport: "sdk"`**，
其中 5 处带 `mockTools` 并断言 `connectedSdk: connected`。**它们钉住的是第 1 步刚修掉的假连接**。

处置：新增 `stdioServerFixture()` 辅助，把 5 处 connected 夹具改为**真实 stdio mock 服务器**
（`fixtures/mockMcpServer.mjs`），工具名相应改为该服务器真实暴露的 `echo_message`。
**另 4 处 `enabled: false` 的夹具保留 `sdk`**——实测它们走 `connect` 的 disabled 短路，
**在传输判定之前返回**，故不受影响（测试通过证实）。

这与第 1 步同一性质：**不是「改测试迁就代码」，而是旧断言描述的行为已不存在**，
且各测试的**意图**（入口一致性、状态呈现、refresh 路由）全部保留。

### 反向验证

| 移除 | 失败数 |
|---|---|
| `renderFence` 的 mermaid 分支 | 1 |
| `invokeTool` 的抛错（第 1 步，回归确认） | 2 |
| `/export` 的写入判定（第 1 步，回归确认） | 2 |

### 与设计的偏离

无。M3（不做 code span 包装）与 M4（用活令牌 `border` 而非死令牌 `borderMuted`）
在实机输出中均得到确认：图表有颜色且对齐正确。

## 6. 本步不做

- 不做 `final` 模式（见 §4.1）。
- 不做终端图形协议（Sixel/Kitty graphics）——实测我方 `terminalCapabilities.ts` 只探测同步输出、色深、键盘协议，无图形协议；参考实现同样只用字符画。
- 不做交互（缩放/折叠）——参考也没有。
- 不清理 15 个死令牌（属第 3 步）。
