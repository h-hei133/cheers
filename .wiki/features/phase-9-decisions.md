---
title: "Phase 9 裁决：扩展能力边界、图片输入、Mermaid、HTML 导出、写入路径"
category: article
sources: [phase-9-pre-research, s1-ext-paths12, s2-export-data, s3-image-plan, s4-write-policy, mermaid-measured]
created: 2026-09-25
tags: [features, phase-9, decisions, extensibility, security]
summary: "Phase 9 裁决。用户裁定：扩展只做路径 1（声明式）与路径 2（进程外），不做路径 3（进程内代码执行）；图片输入加宽 content + messageToText；Mermaid 默认 streaming；HTML 导出首版做等价交互；修 S1、做 S4。本轮研究另查出四项既有缺陷：MCP 非 stdio 传输的 invokeTool 返回**假的成功消息**（违反 AGENTS.md:25）、MCP resources/prompts 只有 mock、/report 与 /export 有同一个无围栏写入缺陷、导出只读 transcript 因而拿不到树。顺序定为 S1 → Mermaid → 扩展路径 1 → HTML 导出 → 图片输入 → 扩展路径 2。"
confidence: high
---

# Phase 9 裁决

> **来源**：`.wiki/features/phase-9-pre-research.md` 的四项方案 + 三项前置修复，
> 经用户裁决后进入本轮。用户裁定原文：
> ①扩展只做 1（声明式）与 2（进程外），**不做 3**；②图片输入加宽 `content` + `messageToText`；
> ③Mermaid 默认 `streaming`；④HTML 导出首版做**等价交互**；⑤修 S1、同意 S4。
> 顺序由主代理研究后自定（§6）。
>
> **本轮新增研究**：5 个只读子代理（其中 2 个因上游内容过滤失败，对应切片由主代理亲验）。
> 全部数字经主代理复测。

## 0. 本轮新查出的既有缺陷（4 项，均非本计划引入）

| # | 缺陷 | 证据 | 性质 |
|---|---|---|---|
| **N1** | **MCP 非 stdio 传输的 `invokeTool` 返回假的成功** | `core/mcp/client.ts:117-121`：非 `stdio` 分支**直接 return** `{content: "MCP tool X executed successfully on server Y"}`，**没有任何调用发生**。**已实测复现**（临时测试，未入库）：`new CoreMcpClient("remote", {transport:"http", url:"https://mcp.example.test"})` → `invokeTool("do_thing", {a:1})` 返回 `{"content":"MCP tool do_thing executed successfully on server remote"}` | **违反 `AGENTS.md:25`**「不得用成功态掩盖未验证结果」。且 `McpTransport`（`types.ts:1`）含 `http`/`ws`/`sdk`，**配置层接受这些值**——即用户可配出这条路径 |
| **N2** | **MCP resources / prompts 只有 mock** | `client.ts:92-97` 直接返回 `config.mockResources ?? []` / `config.mockPrompts ?? []`；`gateway.ts:139-140` 调用它们但**无任何 stdio action 去真的取**；全仓**零消费者** | 三个 MCP 原语只实现了 1 个（tools）。文档若宣称支持 resources/prompts 则为不实 |
| **N3** | **`/report` 与 `/export` 有同一个无围栏写入缺陷** | `reportCommandRuntime.ts:93-94` `mkdirSync(recursive)` + `writeFileSync`，**不 import `verifyPathContainment`**，与 S1 同形 | **这把 S1 从「修一个命令」变成「立一条策略」**——两个用户可传路径的斜杠命令都无围栏 |
| **N4** | **导出只读 transcript，拿不到会话树** | `exportCommandRuntime.ts:98-105` `readTranscript` 只读 `layout.transcriptPath`；而树在 **`state.json`** 的 `SessionThreadSnapshot`（`parentId`/`activeLeafId`/`branches`） | HTML 导出的**侧栏树**依赖树数据，当前导出路径**取不到**。这是导出首版做「等价交互」的**硬前置** |

**N1 的严重性最高**：它不是「功能缺失」，而是**主动报告虚假结果**——本仓有一条明文规则专门禁止这件事。

## 1. 扩展能力边界（裁决：只做路径 1 + 路径 2）

### 1.1 三种「扩展」在架构上是三类东西

| 机制 | 扩展物 | 执行位置 | 能力 |
|---|---|---|---|
| **路径 1：声明式**（技能/主题/钩子） | 文本 / JSON / 外部命令 | 宿主解释；钩子走**子进程** | 教模型、改外观、在 18 个事件点拦截 |
| **路径 2：进程外**（MCP） | 外部进程 | **独立进程**，`spawn` | 提供工具（`mcp__<server>__<tool>`） |
| ~~**路径 3：进程内**~~ | ~~TS 代码~~ | ~~同进程 `import`~~ | **已裁决不做** |

### 1.2 路径 3 被拒的**技术**理由（不只是安全偏好）

参考实现**自己承认**无隔离（`docs/extensions.md:4-5`：「runs inside the Pi process with the same
operating-system permissions」），且**没有任何进程外能力机制**（子代理实测：全仓无 subprocess 插件协议）。
故「路径 2」在本仓**没有参考可抄**——我方 MCP 已实现它，参考实现没有。

被拒的实质是：**行 5/6 在架构上不可能由进程外实现**。子代理给出的边界分析经主代理复核成立：

| 行 | 为何进程外做不到 |
|---|---|
| 注册快捷键 | 按键分发在 `cli/interactive/keymap.ts` 的**同步** keypress 循环里；跨进程往返会引入不可接受的终端延迟 |
| 消息渲染器 / Markdown 变换器 | `presentation/tui/transcript/blocks.ts` 的 `renderBlock` 与 `markdown.ts` 的 `renderMarkdown` 按**终端列宽**计算换行；逐行跨进程会拖垮渲染 |
| 自定义 UI 组件 | `presentation/tui/surface/` 与 `overlay.ts` 需要**同步帧计算**与有状态光标管理 |

**因此行 5/6 标记为「永久不做」，不是「暂缓」。** 这不是能力取舍，是**进程边界与同步渲染不兼容**。

### 1.3 六行的最终归类

| 行 | 归类 | 依据 |
|---|---|---|
| 1 扩展自动发现 | **路径 1** | 扫描磁盘上的声明式清单（如 `.agents/extensions/*.json`），不加载 TS |
| 2 注册工具 | **路径 2** | MCP stdio 已覆盖；工具名强制 `mcp__` 前缀 |
| 3 注册命令 | **路径 1（受限）** | 声明式别名（`/prompt:name` 式）可做；**任意 TS handler 不做** |
| 4 事件订阅 | **路径 1** | 已有钩子（18 事件）就是它；不做进程内 `on(event, handler)` |
| 5 快捷键/渲染器/变换器 | **永久不做** | 见 §1.2 |
| 6 自定义 UI 组件 | **永久不做** | 见 §1.2 |

### 1.4 路径 1 的真实缺口（子代理实测）

| 机制 | 现状 | 缺口 |
|---|---|---|
| **技能** | `skillLoader.ts:314-340` 的 `parseFields` **只读 4 个字段**：`name`/`description`/`disable-model-invocation`/`enabled` | `license`/`compatibility`/`metadata`/`allowed-tools` 等标准字段**静默丢弃**，无诊断。写法是扁平的 `key: value`，嵌套结构不支持 |
| **主题** | 39 个令牌，**24 个被真实消费，15 个是死配置** | 死令牌：`dim`/`userMessageText`/`assistantText`/`thinkingText`/`borderMuted`/`selectedBg`/`toolPendingBg`/`toolSuccessBg`/`toolErrorBg`/`syntaxKeyword`/`syntaxFunction`/`syntaxVariable`/`syntaxString`/`syntaxNumber`/`syntaxComment` |
| **钩子** | 18 事件；`PreToolUse`/`PreCompact`/`PreModelSwitch` **可阻断**；`PostToolUse*` **可回灌反馈**；其余只观察 | 信任指纹只覆盖 `[event, matcher, command]` 三串（`trust.ts:38-42`），**不覆盖被调用脚本文件的内容**——改 `./check.sh` 不会使信任失效 |

### 1.5 路径 2 的真实缺口

| 缺口 | 证据 | 处置 |
|---|---|---|
| **N1 假成功** | `client.ts:117-121` | **必修**：非 stdio 传输必须**报错**（`unsupported-transport`），不得返回成功 |
| **N2 resources/prompts 是 mock** | `client.ts:92-97` | 二选一：实现（需 stdio action）或**在文档/类型上明确标注只支持 tools**。**不做无声的假支持** |
| 非标准 stdio 封包 | 用 `{action:"list-tools"}` 而非 JSON-RPC 2.0 | 我方自有协议，与外部 MCP 服务器**不互通**。这是「MCP 形状」而非「MCP 协议」——**文档须如实** |
| 只有 stdio 可用 | `http`/`ws` 在校验层被接受，执行层无实现 | 同 N1 |

**安全上的正面确认**：`mcp__<server>__<tool>` **不会**命中 `READ_ONLY_TOOLS`（精确匹配表），
因此在 `ask` 与 `accept-edits` 下**始终要求升级**，仅 `allow-all` 才免提示。
即路径 2 **天然免疫** S3 那类「顶名继承豁免」。

## 2. 图片输入（裁决：加宽 `content` + `messageToText`）

### 2.1 迁移面：**19 个文件**（修正此前 18 的说法）

口径：读 `.content` 的非测试文件 ∩ 引用 `SessionMessage`/`AgentMessage`/`ChatMessage`/**`TranscriptEvent`** 的文件。
此前得 18 是因为**漏掉了 `TranscriptEvent`** 这一类。命令：
`grep -rl '\.content\b' src --include='*.ts' | grep -v test` 与
`grep -rl 'SessionMessage\|AgentMessage\|ChatMessage\|TranscriptEvent' src --include='*.ts' | grep -v test` 求交。

**按处置分类**（这是可执行的清单，不是计数）：

| 类别 | 文件数 | 内容 |
|---|---|---|
| **真改**（契约/序列化/wire） | 6 | `sessionMessage.ts`、`sessionEventCodec.ts`、`turn/prompt.ts`、`turn/step.ts`、`anthropicMessages.ts`、`chatRequest.ts` |
| **需 `messageToText`** | 12 | `history.ts`、`interactiveMode.ts`、`picker/rewind.ts`、`picker/session.ts`、`cliSessionRuntimeFactory.ts`、`exportCommandRuntime.ts`、`session/context.ts`、`sessionContinuitySnapshot.ts`、`sessionReentrySurface.ts`、`replay/builder.ts`、`sessionContinuityModule.ts`、`turn/projection.ts`、`turn/synthetic.ts` |
| **透传/不受影响** | 3 | `core/agent/loop.ts`、`core/agent/tools.ts`、`microCompact.ts` |

### 2.2 必须同时落地的耦合（否则丢数据）

**`sessionMessage.ts` 与 `sessionEventCodec.ts` 必须同批改。** `sessionEventCodec.ts:165`
的守卫是 `typeof record.content === "string"`，而 `decodeTranscriptLineSafe`（`:174-184`）
在守卫失败时**返回 `undefined`**、`readTranscriptEvents` 跳过该行。
若先加宽类型、后改守卫，**带图片的消息会在重新加载时静默消失**。
这是本轮唯一「漏一步就静默丢数据」的耦合点，必须有一个「带图片的消息经编解码往返后仍在」的测试钉住。

### 2.3 其余决定

- **`messageToText` 归属**：`model-adapters/multimodal.ts`（与 `ImageContent` 同处），
  从 `sessionMessage.ts` 再导出。纯图片消息默认返回 `""`；`exportCommandRuntime.ts:131`
  这类**面向人**的读者传 `placeholderForImages: true`，否则用户导出后看不到自己发过图。
- **codec 无版本字段**，加宽是**向后兼容**的（旧 `string` 行照旧解析），**不需要 bump**。
- **wire 转换器改签名**：`toAnthropicImageBlock` 返回具名类型而非 `Record<string, unknown>`，
  使其可直接推入 `anthropicMessages.ts:108-112` 的**严格判别联合**（需先加 `image` 分支）。
  **不加宽就传数组会生成 `{type:"text", text:[object Object]}`**，被 provider 以 400 拒绝。
- **视觉能力声明在目录上**（照 `promptCache` 先例）：`CatalogModel.vision?: boolean`。
  已确认 `check:config-consumers` **只管 `RuntimeConfig`/`TuiPreferences`**，目录字段不受该门禁约束。
- **粘贴通道**：`PasteStore.held` 是 `Map<number, string>`、`expand()` 返回 `string`，
  故图片走**并行的 `heldImages`**，提交点 `keymap.ts:407` 改用返回
  `{text, images, content}` 的展开函数。占位符可复用，存储必须并行。
- **首版不接受未支持的图片格式**（保持「零新依赖」口径为真），不做格式转换。

## 3. Mermaid（裁决：默认 `streaming`）

### 3.1 主代理实测（子代理切片因内容过滤失败，本节全部亲验）

**库 API 实测**（`grok-mermaid@0.2.3`，装于 `/tmp`，未进仓库）：

| 项 | 实测 |
|---|---|
| 返回形状 | `{ plain: string[], styled: Array<Array<{text, cls}>>, width: number, warnings: string[] }` |
| `cls` 取值 | `border` / `text` 等——**可直接映射到我方主题令牌** |
| 无效输入 | 返回 `null`，**不抛异常**（但仍需 `try/catch` 兜底库自身缺陷） |
| 渲染耗时 | 小图 0.29ms / 20 节点 0.87ms / 120 节点 3.53ms / 时序图 0.14ms |
| 依赖 | 0.2.3、Apache-2.0、**零传递依赖**、unpacked 508,454 字节 |

**我方重解析成本实测**（`renderMarkdown`，本仓真实实现）：

| 输入规模 | 单次全量重解析 |
|---|---|
| 201 行 / 2,820 字符 | **0.58ms** |
| 1,001 行 / 14,100 字符 | **1.46ms** |
| 4,001 行 / 56,400 字符 | **4.31ms** |

### 3.2 关键机制发现：我方**本来就每次增量全量重解析**

`blocks.ts:253` `renderAssistant` 对**未 finalize** 的块调用
`renderMarkdown(source, bodyWidth)`，而 `blocks.ts:15` 的注释自述
「必须能从自身状态渲染，且 finalized 后每次渲染结果相同」。
即**流式期间每个 delta 都会重解析整块 markdown**。

**因此 `streaming` 模式的增量成本是「在既有成本上再加一次图渲染」**：
4,000 行时约 `4.31 + 3.53 ≈ 7.8ms/次`。这不是新引入的架构问题，是**放大了既有问题**。

**决定**：按用户裁决默认 `streaming`，但**必须加两条保护**（否则长回答会卡顿）：
1. **按源文本缓存**——同一段 mermaid 源码只渲染一次，delta 未改变围栏内容时直接复用。
2. **体积上限**——围栏正文超过行数/字符上限即降级为代码块（`renderFence` 已是单点，`markdown.ts:167`）。
   这条同时兑现了 pre-research §1.2 对参考实现「无 CPU 上限」的批评标准。

### 3.3 三档降级（照参考实现的形状，全部回退到代码块）

宽度超限 → 原样；`warnings` 非空 → 原样 + 一行提示；返回 `null` 或抛异常 → 原样。
未闭合围栏由既有 `trimPartialFence`（`markdown.ts:28-36`）处理。

## 4. HTML 导出（裁决：首版做等价交互）

### 4.1 硬前置：导出路径**取不到树**

`exportCommandRuntime.ts:98-105` 只读 `transcript.jsonl`。而树在 **`state.json`**：
`SessionThreadEntry.parentId`（`sessionThread.ts:5-12`）、`SessionThreadSnapshot.activeLeafId`
（`:63`）、`branches: SessionBranchRecord[]`（`:15-21,65`）。

**因此导出必须改成读两处**（transcript + state），否则侧栏树无数据可建。

### 4.2 好消息：树的构建逻辑**已存在且已被使用**

`session/query/sessionEntries.ts:95-130` 的 `readSessionTree` 已经：
按 `parentId` 建父子关系、自指视为根、按 `order` 稳定排序。
消费者是 `core/commands/entriesCommandRuntime.ts`（**生产代码**）。
另有 `session/sessionTreeProjection.ts` 的 `ProjectedSessionNode`
（含 `parentId`/`activeLeaf`/`activePath`），但其消费者 `store/host/state.ts` **无生产调用者**。

**决定**：导出复用 `readSessionTree`，**不新建树构建逻辑**。同时按仓规处理
`sessionTreeProjection.ts` 的孤儿状态（记录，不在本轮删）。

### 4.3 客户端（裁决为等价交互）

参考实现客户端 `template.js` **1,869 行**，分段实测：
树构建 42 / 树展平 74 / 过滤 63 / 可视结构重算 **125** / 树节点 HTML 74 / 树渲染 77 /
可展开输出 55 / **工具卡片渲染 191** / 分享链接 68 / 条目渲染 **148** / 统计 42 /
头部 97 / 导航 144 / 侧栏拖拽 66 / 可编辑目标判定 45。

**我方首版范围**（按收益排序，砍掉参考实现里与本仓无关的部分）：
- **做**：树构建/展平/过滤、条目渲染、工具卡片、可展开长输出、统计、头部、导航。
- **不做**：分享链接（`buildShareUrl`，68 行——依赖参考实现的分享服务）、侧栏拖拽（66 行）。
- **估**：客户端约 **1,100–1,300 行**，CSS 约 **600–800 行**。

**Markdown 决定**：**不 vendor `marked`**，复用我方 `presentation/tui/transcript/markdown.ts`
的语义子集，避免同一会话在终端与导出页长得不一样。代价是导出页不支持我方未实现的语法
（与终端一致，属**有意**的一致性而非缺陷）。

**模板打包**：TS 字符串常量（避免编译产物/测试/CLI 分发三套路径解析）。
1,300 行客户端脚本放进模板字面量是可接受的——它是**只读字符串**，不需要类型检查。

## 5. S1 与 S4

### 5.1 S1 的性质修正：不是「一个命令的 bug」，是「缺一条策略」

子代理查出 **N3**：`/report`（`reportCommandRuntime.ts:93-94`）与 `/export` **同形同缺陷**。
两个用户可传路径的斜杠命令都无围栏。**故 S1 的修法是立策略并同时套用两处**，不是补一处。

**策略建议**（三选一，倾向 B）：
| 方案 | 说明 |
|---|---|
| A 工作区内 | 最安全，但**导出到 `~/Desktop` 是合理用法**，一律拒绝会伤正常使用 |
| **B 工作区内默认；工作区外要求显式绝对路径 + 一次确认** | 与「用户键入的命令」这一前提相符；把「打错相对路径」与「有意写到外面」区分开 |
| C 允许列表 | 配置负担大，收益不明显 |

**无论选哪个，「相对路径 `../` 可逃出工作区」都必须堵**——这条没有争议。

**注意**：`verifyPathContainment` 不能直接套用（它会拒绝一切工作区外路径）。
需要的是**新的一层「目标策略」**，`pathJail` 作为其工作区内那一支的判定。

### 5.2 S4（已同意）

1. **脱敏步骤**：新建 `session/export/redact.ts`，对每条投影消息与工具结果跑
   `core/security/redaction.ts` 的 `redactReportText`（15+ 模块在用），
   并在导出文件头部记录**本次启用了哪些排除项**。
2. **未知格式必须报错**：`exportCommandRuntime.ts:44` 的
   `args[0] === "jsonl" ? "jsonl" : "markdown"` 改为显式三选 + 未知即错。
   否则 `/export html out.html` 产出「`.html` 扩展名、未转义 Markdown 内容」——
   浏览器打开即执行会话里的 `<script>`。
3. **写入围栏**：见 §5.1。

## 6. 执行顺序（主代理定）

排序依据：**先修「会主动说假话/会丢数据/会写错地方」的，再做加法；先做独立可验证的，再做跨层的。**

| # | 工作 | 理由 | 依赖 |
|---|---|---|---|
| **1** | **N1 修假成功** + **S1/N3 立写入策略并套用 `/export`、`/report`** | 都是**既有缺陷**且都是「报告与事实不符」：一个说成功没做，一个能写到工作区外。改动小、无依赖、应当立刻做 | 无 |
| **2** | **Mermaid**（含缓存 + 体积上限） | 唯一**不触及任何现有契约**的新功能，可独立验证与回退；且它给「体积上限」这条纪律立了先例 | 无 |
| **3** | **扩展路径 1**（技能 frontmatter 字段 + 主题死令牌） | 纯声明式、零执行面、零安全影响；直接兑现「路径 1」裁决 | 无 |
| **4** | **HTML 导出**（含读 state 的树 + 脱敏 + 格式报错） | 依赖 1 的写入策略与脱敏；需先扩导出数据源 | 1 |
| **5** | **图片输入**（19 文件 + codec 同批 + 粘贴通道） | 最大跨层改动；`content` 加宽会影响 4 之后的所有读者，故排在导出之后 | 无（但会碰 4 的产物） |
| **6** | **扩展路径 2**（MCP 诚实化 + resources/prompts 二选一） | 收尾项；N1 已在第 1 步修掉最关键的一条，此处处理 N2 与文档如实性 | 1 |

**为什么 Mermaid 排在扩展路径 1 之前**：两者都无依赖，但 Mermaid 有**实测的性能数据与明确验收标准**
（渲染正确 + 降级正确 + 上限生效），而扩展路径 1 是「补字段/清死配置」，验收标准较软。
先做硬的，可更早暴露流程问题。

**为什么图片输入排在 HTML 导出之后**：`content` 加宽会改 `exportCommandRuntime.ts`
（在 19 文件清单内）。若先做图片输入，导出要改两遍。

## 7. 与 pre-research 的差异（本轮修正）

| pre-research | 本轮 | 原因 |
|---|---|---|
| 图片输入迁移面 **18 文件** | **19** | 口径漏了 `TranscriptEvent` 这一类 |
| 扩展行 5/6「需维护者裁决」 | **永久不做** | 进程边界与**同步**终端渲染不兼容，不是偏好问题 |
| HTML 导出「静态页可选」 | **等价交互**（用户裁决） | 需先解决导出读不到树的硬前置 |
| S1「修一个命令」 | **立一条策略，套用两处** | 查出 `/report` 同形缺陷 |
| Mermaid 默认 `final`（建议） | **`streaming`**（用户裁决） | 须加缓存与体积上限以承受实测的增量成本 |
| 未发现 MCP 假成功 | **N1 列为最高优先级** | 违反 `AGENTS.md:25` 明文规则 |

## 8. 本轮未验证（如实记录）

- **剪贴板读取链未实机**：`wl-paste`/`xclip`/`powershell.exe` 三条路径均未在真实环境测（本机 WSL2 可测 `powershell.exe` 路径）。
- **`grok-mermaid` 渲染质量未目视**：只测了耗时、返回形状、无效输入行为；未看真实图在终端里的观感。
- **参考实现导出的 HTML 未在浏览器打开**：客户端分段行数为静态统计，未运行。
- **MCP 真实服务器未接**：stdio 封包为自有形状，未与任何第三方 MCP 服务器对接验证。
- **`/report` 缺陷未实机复现**：按与 `/export` 同形的代码证据判定，未跑一次真实逃逸。
