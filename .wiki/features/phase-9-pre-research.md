---
title: "Phase 9 前置研究：四项候选能力的实现方案与改动面"
category: article
sources: [s1-ext-host, s2-html-export, s3-image-input, s4-mermaid, phase-8-decisions, 01-extensibility, 02-integration, 04-terminal]
created: 2026-09-25
tags: [features, gap-analysis, pi, phase-9, pre-research]
summary: "Phase 9 前置研究。四个只读子代理深探扩展宿主、HTML 导出、图片输入、Mermaid 渲染的参考实现与映射；三个复核子代理证伪式复核（事实基座/可行性/安全），主代理逐条复测。核心发现：①扩展宿主不是「补缺口」而是「推翻写进代码并带测试钉住的拒绝立场」——`lifecycle.ts` 把 `execute-plugin-code` 列入**禁止**效果集，参考实现 4,456 行（目录合计）+ `jiti` 依赖，我方需先由维护者裁决是否改向；②HTML 导出参考实现 3,736 行但**零运行时依赖**（vendor 内联两个库），我方最小实现约 700 行，且我方有 3 份重复的 `escapeHtml` 外加 `core/text/safety.ts` 的转义实现；③图片输入的「三重阻塞」经实测**部分修正**：`multimodal.ts` 并非零消费（`registry.ts` 用了 3 个函数），真正零消费的是两个 wire 格式转换器，而 `content: string` 的真实迁移面是 **18 个文件**（读 `.content` 的 52 个非测试文件中，仅这 18 个同时处理消息类型）。Mermaid 是本轮唯一「小而明确」项：依赖 508KB、零传递依赖、Apache-2.0。④安全复核推翻初稿的事实基座：**导出路径无围栏（可覆盖工作区外文件，已实测复现）、导出管线无脱敏、工具权限契约是死代码、升级审批按工具名判定**——后两条叠加使「扩展注册名为 read 的工具」可免提示自动批准。**本轮结论：不推进任何施工**，三项既有缺陷先修。教训新增一条：**被继承的前提必须被验证，而不是被假定。**"
confidence: high
---

# Phase 9 前置研究

> **本轮性质**：零代码改动，全部结论来自实测。四个并行只读子代理
> （S1=扩展宿主、S2=HTML 导出、S3=图片输入、S4=Mermaid）+ 主代理逐条核验。
> **口径**：延续 Phase 6/7/8 的教训——**表格已被证明多次滞后于代码**，因此每条
> 结论以当前代码与参考实现的实测为准，不采信历史文档的判定列。
>
> **参考仓**：`/home/wang/projects/pi`（只读）。文中引用的路径仅作证据，
> 方案中的模块名、字段名、词汇一律用我方命名，不带入参考项目的任何标识。

## 0. 汇总与建议顺序

四项的**性质完全不同**，因此不能用同一套标准推进：

| 项 | 性质 | 参考规模（实测） | 我方改动面 | 新增依赖 | 建议 |
|---|---|---:|---|---|---|
| **Mermaid 渲染** | 纯新增小功能 | 89 行 | 2 文件 + 1 测试 | 1 个（508KB，零传递依赖） | **先做** |
| **HTML 导出** | 新增功能，形状已明 | 3,736 行 | 约 700 行 / 3 新模块 | **0** | **可做** |
| **图片输入** | 跨层改动（消息模型 + 剪贴板 + wire） | 约 500 行 | 118 处/52 文件 + 2 新模块 | 0（用系统命令） | **需先裁决消息模型** |
| **扩展宿主** | **推翻架构立场** | 4,456 行 + `jiti` | 8 新文件 + 5 改 | 1 个（`jiti`） | **需维护者裁决** |

**顺序建议**：Mermaid → HTML 导出 → 图片输入（裁决后）→ 扩展宿主（裁决后）。

理由：前两项**不改变任何现有契约**，可独立验证、可随时回退；后两项都触及
「我方是什么」的定义——一个改消息模型的类型根基，一个改安全模型。

---

## 1. 扩展宿主（01×5 行 + 自定义 UI）

### 1.1 先看结论：这不是「补缺口」，是「推翻一个写进代码的立场」

我们的 `runtime/extensions/lifecycle.ts` **不是**未实现的占位，而是一份**主动的拒绝**：

| 证据 | 内容 |
|---|---|
| `lifecycle.ts:46` | `readonly execution: "not-supported"` |
| `lifecycle.ts:58-59` | `readonly supported: false; readonly executable: false` |
| `lifecycle.ts:228-231` | 校验函数**主动拒绝**任何标为可执行/受支持的描述符：`"extension hooks are contract-only and cannot be marked supported"` |
| `lifecycle.ts:285` | `findForbiddenOutcomeReason` 拒绝携带可执行代码的钩子结果 |
| `lifecycle.ts:420-431` | `FORBIDDEN_EFFECTS` **包含 `execute-plugin-code`** |
| `lifecycle.test.ts:63,118` | **测试主动钉住**这一拒绝（含 `execute-plugin-code` 用例） |

**含义**：实现扩展宿主不是「把功能接上」，而是**把一条当前被测试保护的规则反过来**。
这属于 `AGENTS.md` 要求的「显式任务范围」，必须由维护者明示，不能由施工自行决定。
用户已指出「基础还没有彻底完成，后续可以考虑」，与本节证据一致。

### 1.2 参考实现（实测）

规模（`wc -l` 实测）：

| 文件 | 行数 |
|---|---:|
| `core/extensions/types.ts` | 1,925 |
| `core/extensions/runner.ts` | 1,452 |
| `core/extensions/loader.ts` | 797 |
| `core/pi-manifest.ts` | 35 |
| 目录合计（含未列出的 `index.ts` 211 / `virtual-modules.ts` 38 / `wrapper.ts` 27 等） | **4,456** |
| 上列四文件小计 | **4,209** |

另需 `jiti` 2.7.0（运行时编译 TypeScript 扩展）。**我方运行时依赖当前仅 5 个**
（`ignore`/`picomatch`/`playwright-core`/`typescript`/`undici`），引入 `jiti` 是第 6 个。

**机制**：

- **manifest**：`package.json` 的一个字段，含 `extensions`/`skills`/`prompts`/`themes` 四个可选路径数组；缺 `extensions` 时回退探测 `index.ts`/`index.js`。
- **加载**：`jiti` **进程内**执行，**无隔离边界**——扩展与宿主同事件循环，可访问 `fs`/`child_process`/`net`/环境变量。
- **入口契约**：`export default function(api): void | Promise<void>`。
- **注册 API（6 类）**：`registerTool` / `registerCommand` / `registerShortcut` / `registerMessageRenderer` / `registerMarkdownTransformer` / `registerEntryRenderer`。
- **自定义 UI**：`ctx.ui.custom(factory, options)` 返回 Promise，组件实现 `render(width)/handleInput(data)/dispose?()`，完成时调 `done(result)` 解除。
- **失败处理**：加载与事件调用**各自 try/catch**，失败记入 `errors` 并继续加载其余扩展。
- **无边界**：**无** CPU/内存上限、**无**权限清单、**无**热重载、**无**版本解析。

### 1.3 我方现状（实测）

| 面 | 现状 |
|---|---|
| 工具注册 | `core/tools/registry.ts:264` 的 `tools` 数组**实测 13 项**：4 个内联对象（`read`/`write`/`edit`/`bash`）+ **9 个工厂调用**（`createGlobToolDefinition` 等）。另有条件项（`skills`）与 MCP 动态项。返回静态 `ReadonlyMap`，**无扩展挂点** |
| 命令注册 | `core/commands/registry.ts:72-697` 的 `commands` 数组**实测 53 个内置命令**（`grep -c '^      name: "'`），无动态注册 |
| 斜杠命令展示 | `entrypoints/slashCommandRegistry.ts` 的 `extensions` 数组只有 1 条硬编码 `PICKER_ONLY`；`registerSlashCommand` 只影响展示与补全 |
| 插件命令 | `core/commands/pluginCommandRuntime.ts:11-14` **代码自述**：「this build does not execute extensions」 |
| 钩子系统 | `core/hooks/` 是**声明式外部 shell 钩子**（配置文件 + 信任指纹 + 子进程），**不是**进程内注册 API——两者不可混为一谈 |

### 1.4 改动面（若裁决推进）

**最小可用宿主（MVH，约 500 行）**——只做工具与命令：

1. 新建 `runtime/extensions/manifest.ts`——**与既有 `runtime/extensions/lifecycle.ts` 同域**，不新开 `core/extensions/`（同一概念两个家正是本仓反对的）
2. 新建 `runtime/extensions/api.ts`（注册契约；`types` 过于笼统，且该域已有 `lifecycle.ts`）
3. 新建 `runtime/extensions/loader.ts`（动态导入 + try/catch）
4. 新建 `runtime/extensions/host.ts`（注册表 + 生命周期）
5. 改 `core/tools/registry.ts`（`options.extensionTools` 合入）
6. 改 `core/commands/registry.ts`（动态命令项）
7. 改 `entrypoints/slashCommandRegistry.ts`（把动态命令接到补全）
8. 改 `core/commands/pluginCommandRuntime.ts`（`/plugin` 语义从「仅登记」改为「加载」）

**完整 5 行 + 自定义 UI（约 2,200 行）**：再加快捷键（需与保留键位冲突校验）、
消息/入口渲染器、Markdown 变换器、`ctx.ui.custom()` 覆盖层与输入路由。

**必须一并处理**：`runtime/extensions/lifecycle.ts` 的拒绝立场——若改向，则
`FORBIDDEN_EFFECTS` 里的 `execute-plugin-code`、`supported:false`/`executable:false`
三处校验，以及 `lifecycle.test.ts:63,118` 两条钉死用例都要同步改。**删测试等于删保护**，
必须由维护者在同一裁决里明确。

### 1.5 风险

- **最重风险**：进程内无隔离执行第三方代码。参考实现**自己也没有**沙箱——这不是「照抄就安全」，而是「照抄就同样不安全」。我方当前有沙箱/审批/路径围栏等 OURS-ONLY 防线，扩展宿主会**绕过**它们（扩展是宿主的一部分，不是被审批的动作）。
- **次要风险**：`jiti` 依赖 + TypeScript 运行时编译，与我方「先编译后运行」的既有形态冲突。
- **需裁决**：是否引入 `jiti`？扩展是否必须预编译为 `.js`？扩展是否要沙箱（则工作量大幅上升）？

---

## 2. HTML 导出（02）

### 2.1 参考实现（实测）

`packages/coding-agent/src/core/export-html/`，**合计 3,736 行**：

| 文件 | 行数 |
|---|---:|
| `template.js`（客户端应用） | 1,869 |
| `template.css` | 1,066 |
| `index.ts`（生成器） | 316 |
| `ansi-to-html.ts` | 258 |
| `tool-renderer.ts` | 172 |
| `template.html` | 55 |

**「零依赖」的说法需修正**：生成器代码本身**只用 Node 内建 + 内部包**（这点成立），
但它依赖两个**直接提交进仓库的 vendor 库**：`marked.min.js`（约 55KB）、
`highlight.min.js`（约 45KB），并在生成时读盘内联进 `<script>`。

**机制**：

- **产物**：单个自包含 `.html`。
- **数据**：会话数据 JSON → **base64** → 塞进 `<script id="session-data" type="application/json">`。base64 的理由不是省空间（反而 +33%），而是**消除转义边界**——正文里出现 `</script>` 或引号不配对时不会破坏文档解析。
- **转义**：所有文本插入走 5 字符实体替换；Markdown 链接经**白名单**过滤（仅 `http:`/`https:`/`mailto:`/`tel:`/相对路径，剥掉 `javascript:`/`data:`/`vbscript:`）。
- **大输出**：超过阈值折叠为可展开块；**不**外链。
- **不做**：不流式（整串内存拼接后一次写盘）；不拉远程资源；不处理远程图片；导出后不能切换主题（主题变量在导出时烤进 CSS）。

### 2.2 我方现状（实测）

- `core/commands/exportCommandRuntime.ts`（**172 行**）只有 `jsonl` 与 `markdown` 两个分支；格式判定是 `args[0] === "jsonl" ? "jsonl" : "markdown"`——**任何未知格式静默降级为 markdown**（含 `.html` 路径）。这是一个既有小缺陷，做 HTML 导出时应一并修正为「未知格式报错」。
- 读 transcript 的路径已存在且可复用（`readTranscript` → `readTranscriptEvents`）。
- **HTML/XML 转义在我方有多份实现，且分散**（实测）：名为 `escapeHtml` 的 3 份
  （`browser/playwrightEvidence.ts:241`、`browser/playwrightEvidenceMapper.ts:121`、
  `core/commands/browserAuthOnboarding.ts:194`），另有 `escapeXml`（`core/skills/skillLoader.ts:401`）、
  `escapeAttribute` 与 `neutraliseTagBoundaries`（`core/text/safety.ts:80,74`）。
  **无共享工具**。做 HTML 导出时应抽出单一实现并迁移这些调用点，而不是再加一份——
  安全相关的重复实现是「其中一份漏了某个字符」的典型来源。
- base64 已有先例（`multimodal.ts`、`copyCommandRuntime.ts`）；`node:zlib` 已在 `observability/zipArchive.ts` 用过。

### 2.3 改动面

1. 新建 `session/export/sanitize.ts`——单一 HTML 转义 + URL 白名单（**并迁移那 3 份 `escapeHtml` 与 `core/text/safety.ts` 的转义实现**）。放在 `session/export/` 而非顶层 `export/`：导出的输入是 session 数据，归属该域
2. 新建 `session/export/template.ts`——HTML 骨架 + CSS + 客户端脚本
3. 新建 `session/export/html.ts`——事件 → 载荷 → base64 → 注入
4. 改 `core/commands/exportCommandRuntime.ts`——加 `html` 分支 + 修未知格式静默降级
5. 新建测试

**约 700 行**（`sanitize` 40 / `template` 350–500 / `exportHtml` 120–150 / 命令 40 / 测试 150）。

**必须补的一步：脱敏（安全复核抓出，主代理实测确认）**。初稿的模块清单里**没有脱敏**，
而 transcript 是**原样落盘**的（`session/transcript/sessionTranscript.ts:84` 的
`appendTranscriptEvent` 直接 `appendFileSync` 编码后的事件，无任何 scrub），
`exportCommandRuntime.ts` 也**不 import** `core/security/redaction.js`。
后果：导出的 HTML 会**原样嵌入**工具输出、`oldText`/`newText` 编辑载荷、provider 原始输出、
以及会话里出现过的任何凭据串。**转义不等于脱敏**——前者防注入，后者防泄露，
两件事必须分开做。因此改动清单增加一步（在 base64 之前）：

- **`session/export/redact.ts`**——对每条投影后的消息与工具结果跑
  `core/security/redaction.ts` 的 `redactReportText`（已在 15+ 模块使用，规则链覆盖
  真实 provider home 路径、bearer token、凭据赋值、key 形状、raw edit text、
  raw provider output、hidden reasoning），并在导出文件的头部**记录本次启用了哪些排除项**。

且 §2.4 的风险陈述必须明确：**导出的文件是一个「设计上用于分享」的产物，
它的机密性取决于这一步**。这不是「锦上添花」，是签核前提。

**关键工程决定**：模板用 **TypeScript 字符串常量**而非外部资源文件。理由：外部资源在
编译产物、测试、CLI 分发三种环境下路径解析各不相同，是这类功能的经典失败点；字符串常量
对三者都免疫。代价是 CSS/JS 失去编辑器语法高亮——可用 `.ts` 里的模板字面量缓解。

**Markdown 渲染**：参考实现 vendor 了 `marked`。我方**已有自己的 Markdown 渲染**
（`presentation/tui/transcript/markdown.ts`，188 行，行级解析）。**建议不引入 `marked`**，
而是把导出页的 Markdown 渲染限制在「我方已支持的子集」（表格/围栏/行内/标题/列表），
与终端渲染保持同一套语义——否则同一个会话在终端与导出页里会长得不一样。

### 2.4 风险

- **最大风险**：客户端脚本的体积与维护。参考实现 1,869 行客户端 JS 是它最大的单文件；我方若追求等价交互（侧栏树、过滤、折叠）成本很高。**建议首版只做静态可读页**（无侧栏树、无过滤），把体积压在 300 行以内。
- **机密性（签核前提，安全复核抓出）**：导出文件是**设计上用于分享**的产物，而 transcript
  原样落盘、导出管线原本无脱敏。必须加入 `session/export/redact.ts` 一步（见 §2.3），
  并在文件头记录启用的排除项。**转义防注入，脱敏防泄露，两者不可互替**——
  初稿「base64 + 白名单已足够」的说法把两件事混为一谈，已删除。
- **写入路径（既有缺陷，必须先独立修）**：`/export` 的 `resolveTarget`（`:107`）
  不做路径围栏，`mkdirSync(recursive)` + `writeFileSync`（`:59-61`）会把文件写到工作区外。
  新增 HTML 格式**不能**沿用这条未检查的路径。详见 §5.2 的 S1。
- **注入**：base64 消除 `</script>` 破坏文档解析的风险；Markdown 链接与图片需走**白名单**
  （注意参考实现的白名单还允许 `ftp:`，我方应明确只留 `http`/`https`/`mailto`/`tel`/相对路径，
  且**图片的 `data:` MIME 需要自己的白名单**——该值来自剪贴板/扩展，不完全可信）。
  必须有测试钉住「正文含 `</script>`」与「`javascript:` 链接」两个用例。
- **格式误判即注入汇（安全复核）**：`exportCommandRuntime.ts:44` 使任何未知格式静默降级为
  markdown，而文件名原样采用。故 `/export html out.html` 会产出**扩展名 `.html`、内容为
  未转义 Markdown** 的文件——浏览器打开即把会话里的 `<script>` 当 HTML 执行。
  这**不是「小缺陷」**：它把「文件名写错」变成「注入汇」。未知格式必须**报错**，不得静默降级。

---

## 3. 图片输入（04）

### 3.1 「三重阻塞」经实测需要修正

我方文档（`04-*` §3.4）称三重阻塞。逐条实测：

| 文档说法 | 实测结论 |
|---|---|
| 「`multimodal.ts` **没有任何生产消费者**」 | **不成立**。`core/tools/registry.ts:4` 导入并使用了 `formatNonVisionFallback`/`getImageMimeType`/`isImageFilePath`（`:338-347`，用于「read 工具遇到图片时说明不返回图片」）。**文档自带的 grep 命令 `\| grep -v "model-adapters/"` 把唯一的 import 行自己过滤掉了**，所以得出了零消费的错误结论。 |
| 「`toAnthropicImageBlock`/`toOpenAIImageBlock` 零消费」 | **成立**，但**函数名与行号引用有误**：实际是 `toOpenAIImageUrlBlock`（`multimodal.ts:61`），文档写 `toOpenAIImageBlock` 且标 `:68`（`:68` 实为 `formatNonVisionFallback`）。 |
| 「消息模型 string-only，约 134 处消费点」 | **方向成立，数字需修正**。实测 `.content` 访问：**118 处 / 52 个非测试文件**（含测试 141 处/53 文件）。 |
| 「无剪贴板读取」 | **成立**。我方只有 OSC 52 文本复制与 bracketed paste 文本粘贴，**零**剪贴板读取。 |
| 「请求形状不能带图片」 | **成立**。`turn/prompt.ts:19` `content?: string \| null`；`anthropicMessages.ts:153-154` 只产出 `{type:"text"}`，其 `ContentBlock` 联合只有 `text`/`tool_use`/`tool_result`。 |

**净结论**：图片输入是**「格式转换的逻辑已有，但接口全不兼容」**。
两个 wire 转换器**确实零消费且确实存在**，但复核实测发现**签名与目标类型都不匹配**：
它们返回 `Record<string, unknown>`（`multimodal.ts:50,61`），而 `anthropicMessages.ts:108-112`
的 `ContentBlock` 是**严格判别联合**（无 `image` 分支）、`turn/step.ts` 的 OpenAI 分支
要求 `content` 是**数组**而非单个块。因此工作量是「扩展联合类型 + 适配签名」，
**不是「接上即可」**。文档原称「新基础设施」**偏重**，但复核者的「接上即可」**偏轻**——
真实位置在两者之间：**缺三处接线，且其中两处的既有代码需要改签名。**

### 3.2 参考实现（实测）

- **剪贴板链**：原生 → `wl-paste`（Wayland）→ `xclip`（X11）→ **WSL 走 `powershell.exe`**（因为 Linux 剪贴板拿不到 `Win+Shift+S`）→ 无图形环境/headless 优雅返回 `null`。WSL 路径需 `wslpath -w` 转换。
- **数据模型**：`content: string | (TextContent | ImageContent)[]`；`ImageContent = {type:"image", data: base64, mimeType}`。
- **wire**：Anthropic `{type:"image", source:{type:"base64", media_type, data}}`；OpenAI 兼容 `{type:"image_url", image_url:{url:"data:<mime>;base64,<data>"}}`。**这两个转换函数我方已有**。
- **限制**：2000×2000 px、base64 上限 4.5MB（低于 Anthropic 5MB 请求上限）、JPEG 质量 80；缩放走 worker 线程，**但 worker 失败会回退到主线程**。
- **依赖口径需说明（安全复核）**：参考实现把**剪贴板里不支持的格式解码**（BMP/DIB 等）用的是
  **原生/WASM 解码器**（处理的是剪贴板持有者选定的字节）。§3.3 写的「新增依赖 0」
  **只在我方选择「拒绝不支持的格式」时成立**；若照抄「转换」行为，就引入了一个
  对**攻击者可控字节**做原生解析的组件，依赖数字随之改变。**建议首版只接受
  `png`/`jpeg`/`webp`/`gif` 四种已支持类型并明确拒绝其余**，保持零依赖口径为真。
- **不做**：不支持视频、不把 PDF 当图片、不支持裁剪/旋转、不外链图床。

### 3.3 改动面与迁移成本

**核心决定：`content` 是否改为联合类型。**

| 方案 | 改动 | 代价 |
|---|---|---|
| **A. 加宽 `content`** 为 `string \| readonly Block[]` | 改 `sessionMessage.ts:13`、`turn/prompt.ts:19`、两个 wire 序列化器 | **实测 18 个非测试文件**同时处理消息类型且读 `.content`（另 34 个读的是工具/文件内容，不受影响）；用 `messageToText()` 收口后这 18 个是真实迁移面 |
| **B. 新增并行字段**（如 `parts?`） | 不动 `content` | 每个消费者都要「先看 parts 再看 content」，**双源**，正是本仓一直在消除的模式 |

**建议 A**，并用一个 `messageToText(content)` 收口所有「只想要文本」的读者
（日志、索引、CLI 展示、转录投影）。理由：`origin` 字段的先例证明**可选字段的加宽是兼容变更**，
且双源是本仓明确反对的（`AGENTS.md`「不要两处描述同一事实」）。

**主代理自查发现的一处计划缺口**（子代理复核前已补）：`session/sessionEventCodec.ts:165`
是一个**运行时类型守卫**——`typeof record.content === "string"`。`content` 一旦加宽，
**带图片的消息会在重新加载时被这个守卫静默丢弃**（`isTranscriptEvent` 返回 false，
该行按「无法解析」处理）。这比类型层的 118 处更危险：类型错误编译期就报，
而守卫失败是**运行期静默丢数据**。因此加宽 `content` 时必须同步放宽该守卫，
并加一条「带图片的消息经编解码往返后仍在」的测试钉住它。

具体改动：
0. `session/sessionEventCodec.ts:165`——放宽 `isTranscriptEvent` 的 content 守卫（**否则静默丢数据**）
1. `session/schema/sessionMessage.ts`——`content` 加宽 + 导出 `messageToText`
2. `turn/prompt.ts`——`ChatMessage.content` 加宽
3. `provider/endpoints/anthropicMessages.ts`——`ContentBlock` 加 `image` 分支
4. `turn/step.ts`——OpenAI 兼容分支用 `toOpenAIImageUrlBlock`
5. 新建剪贴板读取模块（Wayland/X11/WSL 链）
6. 接入 TUI 粘贴路径——**我方已有 `PasteStore`（`presentation/tui/pastes.ts:22`）与占位符机制**，图片可复用同一形状（占位符 `[#N 图片]`），这是比我方文档所估计更小的改动。**但复用有边界**（主代理实测）：`PasteStore` 的存储是 `Map<number, string>`，且 `expand(draft)` 返回**字符串**、提交点 `cli/interactive/keymap.ts:407` 直接 `view.pastes.expand(draft).trim()`。因此图片不能只靠 `expand` —— 需要在同一提交点用 `idsIn(draft)`（`:68`，已存在）**再取一次**图片引用，把「文本展开」与「图片附件收集」分成两步。占位符本身可复用，但**存储与展开必须并行一条**，不能塞进 `Map<number,string>`。
7. 视觉能力：**建议在 catalog 上声明**（如 `CatalogModel.vision?: boolean`），而非按模型名前缀猜——与本仓 `promptCache` 的做法一致

### 3.4 风险

- **WSL 延迟**：`powershell.exe` 往返 100–300ms（本机正是 WSL2）。
- **键位冲突**：bracketed paste 只承载**文本**；图片粘贴必须靠独立快捷键触发系统命令，不能靠 paste 事件。
- **headless/SSH**：拿不到客户端剪贴板，OSC 52 也不承载二进制图片——必须优雅降级并说明原因（本仓既有风格）。

---

## 4. Mermaid 渲染（04）

### 4.1 参考实现（实测）

`modes/interactive/components/mermaid.ts`，**89 行**（实测 `wc -l`）。

- **输出**：**纯 Unicode 制表字符画**（`┌─┐│└┘▶▼`），**不是**终端图形协议（无 Sixel/Kitty graphics/iTerm），**不是**半块字符位图。
- **依赖**：`grok-mermaid` 0.2.3，Apache-2.0，**零传递依赖**，unpacked **508,454 字节**（子代理估 250KB，实测 508KB）。
- **检测**：Markdown 词法分析后匹配 `token.type === "code" && lang === "mermaid"`。
- **三种模式**：`streaming`（默认）/ `final` / `off`。`final` 存在的理由：流式未闭合的图会解析失败并闪烁。
- **失败降级**（三档，全部回退到原始代码块）：宽度超限 → 原样；解析告警 → 原样 + 一行告警；渲染返回空 → 原样。
- **不做**：不生成 SVG/位图、不起子进程、不支持库本身不支持的图类型（Git graph/Gantt/Mindmap 会降级）。

### 4.2 我方现状（实测）

- **插入点已存在且是单点**：`presentation/tui/transcript/markdown.ts:74-84` 解析围栏，`:167-178` `renderFence(body, language, cells)` **已经按语言分支**（`isBash` 走 `formatCommandLine`）。Mermaid 是**第三个分支**，不是新管线。
- 围栏正则已捕获语言：`markdown.ts:19`。
- 流式未闭合围栏已有稳定化处理：`trimPartialFence`（`markdown.ts:28-36`）——**`final` 模式的等价物已存在**。
- **我方无任何终端图形协议**（`terminalCapabilities.ts` 只探测同步输出、色深、Kitty 键盘），因此 Unicode 字符画是唯一跨终端可行的形态——与参考实现的选择一致，不是妥协。
- 依赖现状：运行时 **5** 个。

### 4.3 改动面

1. 加依赖 `grok-mermaid`（第 6 个运行时依赖）
2. 新建 `presentation/tui/transcript/mermaid.ts`——隔离库调用、主题映射、宽度/语法校验、`try/catch` 降级
3. 改 `presentation/tui/transcript/markdown.ts:167`——加 mermaid 分支
4. 配置开关（**必须带生产读者**，否则 `check:config-consumers` 失败）
5. 新建测试（正常图 / 超宽回退 / 语法错误 / 关闭）

**约 120 行新代码**。这是四项里唯一**不触及任何现有契约**的。

**必须加一条体积上限**（复核指出本计划对自己和对参考实现用了两套标准）：§1.2 批评参考实现
扩展宿主「无 CPU/内存上限」，而本节却在交互终端的主线程上为**模型撰写的文本**引入了一个
新解析器，且只写了 `try/catch`。**异常与「无界工作」是两种失败**：深度嵌套或超大的图
不会抛异常，它只会占住主线程。因此在 `renderFence` 调用库**之前**加行数/字符数上限，
超限即降级为代码块——插入点已是单点（`markdown.ts:167`），加这个守卫很便宜。

### 4.4 风险与决定

- **风险**：库对某些图类型抛异常 → 用 `try/catch` 兜住并降级为代码块（与参考实现同策）。
- **模式默认值**：建议默认 `final` 而非参考的 `streaming`。理由：我方已有 `trimPartialFence`，但流式渲染半张图仍会产生告警噪声；`final` 在长回答里更安静。这是一个**与我方既有流式稳定化策略一致**的选择，需要记录理由。
- **依赖成本**：508KB / 零传递依赖 / Apache-2.0。相对于功能收益，这是四项里唯一「依赖换功能」划算的一处。

---

## 5. 复核轮（2026-09-25）：独立子代理证伪式复核

三个只读复核者分别攻**事实基座**、**方案可行性**、**安全后果**。事实基座一轮命中
5 处错误，**全部由主代理独立复测后改正**（不采信复核者结论，也不采信原稿）：

| # | 原稿 | 实测真相 | 性质 |
|---|---|---|---|
| 1 | 参考扩展宿主「合计 4,456 行」（列为 4 文件之和） | 4,456 是**目录**总和；所列 4 文件之和是 **4,209**。差额来自未列出的 `index.ts` 211 / `virtual-modules.ts` 38 / `wrapper.ts` 27 | **算术错误**（把目录合计当成小计） |
| 2 | 参考 Mermaid 组件「80 行」 | **89 行** | 数字错误 |
| 3 | 我方 `createCoreToolRegistry`「只有 4 个硬编码工具」 | **13 项**：4 个内联对象 + **9 个工厂调用**。我的初次统计只匹配了内联 `name:` 字面量，漏掉了 `createXxxToolDefinition()` 形式 | **计数方法错误** |
| 4 | 我方命令注册表「38 个内置命令」 | **53 个** | 计数错误 |
| 5 | 「`escapeHtml` 恰有 3 份重复」 | 另有 `escapeXml`（`skillLoader.ts:401`）、`escapeAttribute` / `neutraliseTagBoundaries`（`core/text/safety.ts:80,74`） | **范围过窄** |

**教训（与 Phase 8「结论对不能豁免理由错」同型，此处是「数字对不能豁免口径错」）**：
第 1 与第 3 项都不是抄错数字，而是**统计口径本身错了**——一个把目录总和当成文件小计，
一个用只匹配内联字面量的正则去数一个「内联 + 工厂混合」的数组。
**复核者给出的替代数字也不完全对**（第 3 项复核者说 11，实测 13），因此改正一律以主代理
复测为准。这类错误的共同特征是**看起来精确**（具体到个位），因此最不容易被察觉。

### 5.1 可行性复核（§3 图片输入 / §4 Mermaid）——4 项成立，1 项需修正

| 复核发现 | 主代理复测 | 处置 |
|---|---|---|
| 「`messageToText` 收口后仅 **12** 个文件需动」 | **低估**。实测：读 `.content` 的 52 个非测试文件中，**18 个同时处理消息类型**（真正受影响面），另 34 个是工具/文件内容。复核者说的 31 偏高（它把「引用 `SessionMessage` 类型」也算进去了，而引用类型不等于读内容）。**正确数字：18** | 已改 |
| 「`PasteStore` 可复用同一形状」 | **成立但需收窄**。复核者给的理由（`normalizePaste` 会破坏 base64）**经实测不成立**——`pastes.ts:119` 只替换制表符与 CRLF，base64 字母表两者都不含，故对 base64 是幂等的。**真正的阻碍是类型**：`held` 是 `Map<number, string>`（`:22`），`expand(draft)` 返回 `string`（`:78`），二进制无法通过。结论（占位符可复用、存储必须并行一条）**成立，但理由已改正** | 已改 |
` 切分算行数——**base64 塞进去会被破坏**。故占位符可复用，**存储必须并行一条**（见 §3.3 第 6 条已补） | 已改 |
| 「两个 wire 转换器**已存在**，接上即可」 | **不成立**（这是本轮最有价值的一条）。实测：`multimodal.ts:50,61` 返回 `Record<string, unknown>`，而 `anthropicMessages.ts:108-112` 的 `ContentBlock` 是**严格判别联合**（无 `image` 分支）；`anthropicMessages.ts:154` 直接 `{type:"text", text: message.content}`——**把数组传进去会生成畸形请求**。签名与目标类型都不兼容，不是「接上即可」 | 已改：§3.3 改为「需扩展 `ContentBlock` 联合」 |
| 「`microCompact` 会因非字符串 content 崩溃」 | **复核者此条过度**。实测 `microCompact.ts:86` 有 `typeof msg.content === "string"` 守卫，**是跳过而非崩溃**。但跳过的后果是**带图片的消息静默绕过微压缩**——仍须处理，只是性质从「崩溃」改为「静默失效」 | 已按实测措辞改正 |
| 「§1.4/§2.3 的文件放置违反 `AGENTS.md` 的领域归属」 | **成立**。`export/html/` 放在 `src/` 顶层、`core/extensions/` 与既有 `runtime/extensions/` 并存，都会造成「同一概念两个家」。应改为：导出归入既有 `core/commands/` 的邻域（或 `session/export/`），扩展宿主与既有 `runtime/extensions/` **合并为一个域**而非新建第二个 | 已改：见 §1.4 与 §2.3 的放置说明 |

**关于「两个转换器已存在」这一条的教训**：这正是 Phase 8「结论对不能豁免理由错」的同类——
**「文件存在」不等于「接口兼容」**。一个签名不匹配的函数，与不存在是同样的工作量，
但前者会让人以为已经做了一半。因此 §3.1 的「两端已有一半」表述已按实测收紧为
「格式转换的**逻辑**已有，但**签名与目标联合类型均不兼容**」。

### 5.2 安全复核（§1 扩展宿主 / §2 HTML 导出 / §3 剪贴板）

安全复核者的结论：**扩展宿主一项在当前形态下不应签核**，理由是本仓已有的防线会被绕过，
而计划对这一点陈述不足。主代理实测确认了防线的存在与位置：

| 我方防线（**只列生产中真实生效的**） | 位置 | 扩展宿主的影响 |
|---|---|---|
| OS 沙箱（**活的**） | `sandbox/osSandbox.ts` `planSandboxedCommand`，消费者是 `core/tools/registry.ts:143` 与 `core/hooks/hookDispatcher.ts:229` | 扩展**自行执行**的动作不经此处 |
| 审批/权限范围（**活的**） | `cli/approval/permissionScope.ts` + `core/query/toolPolicy.ts:31` `evaluateToolPermissionScope` | 同上——扩展不是「被审批的动作」；且见 S3，该门按工具名判定，扩展可顶名绕过 |
| 路径围栏 | `core/security/pathJail.ts` | 同上；且见 S1，`/export` 这条写入路径**当前就没接它** |
| 项目信任门 | `core/security/projectTrust.ts`（`trusted`/`untrusted`/`session-only`） | 若扩展从**未信任仓库**加载，当前无门 |
| 脱敏 | `core/security/redaction.ts` `redactReportText`（15+ 模块在用） | 扩展可直接读环境变量，不经脱敏 |

**这张表的更正记录（安全复核抓出，主代理实测确认）**：初稿把
`sandbox/sandboxEnforcer.ts`、`sandbox/sandboxPolicy.ts`、`sandbox/escalationWorkflow.ts`
列为「会被绕过的防线」，**这是错的**——实测
`grep -rn "new SandboxEnforcer\|new SandboxPolicy\|new EscalationWorkflow" src`
在生产代码中**零命中**（唯一构造处是 `sandboxEnforcer.ts:29-30` 的内部字段与各测试文件）。
它们是**仅有测试在用的模块**，不是生产防线；把它们写进这张表会让维护者去加固
「没有任何生产路径到达」的代码。**真正的 OS 沙箱是 `sandbox/osSandbox.ts`。**
`EscalationPrompt` 被广泛 import 的是**类型**（`import type`，编译期擦除），不是那个类。

**这解释了为什么 §1 必须由维护者裁决而非施工自决**：不是「工作量大」，而是
**它会让我方现有的安全承诺变成局部承诺**——「所有动作都经沙箱与审批」这句话在
扩展宿主落地后不再为真。

**安全复核另外找出三条必须先修的真实缺陷（均为既有代码，非本计划引入）**，
主代理已逐条实测确认：

| # | 缺陷 | 实测证据 | 后果 |
|---|---|---|---|
| **S1** | **`/export` 的写入路径没有路径围栏** | `exportCommandRuntime.ts:107` `path.resolve(root, requested)` 直通；`:59-61` `mkdirSync(recursive:true)` + `writeFileSync`；**全文不 import `verifyPathContainment`**，而 `core/tools/registry.ts:315,432,528` 的 read/write/edit 都调它 | `/export markdown ../../.bashrc` **可覆盖工作区外任意文件**，且会自动建父目录。**已实测复现**：`root=/home/user/project` + `../../../home/user/.bashrc` → 解析为 `/home/user/.bashrc` |

**S1 的严重性需精确界定（主代理实测）**：`/export` **只能由用户键入触发**——
`runExportCommand` 的唯一调用者是 `core/commands/registry.ts:397`，即斜杠命令表；
**模型无法调用它**（`bridgeSafe` 字段声明了但全仓零读取，不存在模型→命令桥）。
因此 S1 是**「用户自己打错路径会毁掉工作区外文件」的 footgun**，
**不是**「模型或提示注入可远程触发」的漏洞。定级差异影响处置顺序：
它值得**立刻修**（改动小、后果不可逆），但不构成紧急安全事件。

**另需注意**：不能简单地把 `verifyPathContainment` 套上去——导出到 `~/Desktop`
是**合理用法**，而该围栏会拒绝一切工作区外路径。因此 S1 的正确修法是
**明确导出目标策略**（例如：默认落在工作区内；工作区外要求显式绝对路径且提示确认），
而不是直接套用 read/write/edit 的那套围栏。这是**一个需要决定的产品问题**，不是一行修复。
| **S2** | **`ToolDefinition.permissions.check` 声明了但从未被调用** | `tools/types.ts:51` 是**必填**字段，`registry.ts:286,422,517,676` 都实现了 `check`；全仓 `grep permissions.check` **零调用**。真正生效的是 `core/query/toolPolicy.ts:31` 的**按名字查表** | 权限契约是装饰性的。**且叠加 S3 后成为授权绕过** |
| **S3** | **升级审批按「工具名」判定，不按契约** | `toolPolicy.ts:17-26` `READ_ONLY_TOOLS` 把 `read`/`glob`/`grep`/`lsp`/`web_search`/`web_fetch`/`todo`/`ask` 标为只读 → `:44` 直接 `requiresEscalation:false`；`registry.ts:717` `new Map(tools.map(t => [t.name, t]))` **重名静默覆盖** | 若扩展注册名为 `read` 的工具，它**顶掉内置 read 并在 `ask` 模式下免提示自动批准**。参考实现**专门检测这类冲突**（`resource-loader.ts` 的 `detectExtensionConflicts`，`resource-loader.ts:1064`），本计划完全没提 |

**S1/S2/S3 的性质**：前两条是**既有缺陷**，与本计划无关，但
**本计划会放大它们**——S1 因为 HTML 导出让产物更敏感（自包含、含完整会话、设计上用于分享），
S2/S3 因为扩展宿主引入了「工具名不再可信」的前提。因此：

- **S1 必须独立修**（不依赖本计划是否推进）：在 `resolveTarget` 后加 `verifyPathContainment`，失败即拒绝且不写任何文件。
- **S2/S3 必须在扩展宿主落地前修**：只读分类必须挂在 `ToolDefinition` 上（契约驱动），
  而不是按名字查表；扩展工具名与内置/彼此冲突必须**拒绝或加命名空间**，不能静默覆盖。

若推进扩展宿主，最小前提是：①扩展加载必须过 `projectTrust` 门；
②扩展的工具执行必须走 `ExecutionService`（而非自己的 `execute`）；
③S2/S3 先修完；④`FORBIDDEN_EFFECTS` 的处置需要一份明文的安全决定，不能只是删掉校验。

**另外一条与 §2 相关的既有缺陷（安全定性被低估）**：`exportCommandRuntime.ts:44`
`args[0] === "jsonl" ? "jsonl" : "markdown"` 使**任何未知格式静默变成 markdown**，
而请求的文件名被原样采用。因此 `/export html out.html` 会生成一个**扩展名为 `.html`、
内容为未转义 Markdown** 的文件——浏览器打开时，会话里出现过的 `<script>`/`<img onerror>`
会执行。这不是「小缺陷」，而是**「文件名写错即成为注入汇」**。§2.4 已按此改写。

### 5.3 安全复核结论与前置修复项

安全复核的裁决：**事实基座不成立**——两条 BLOCKER 级遗漏在导出路径、
一处对我方防线的错误归属、一条扩展工具的自动批准路径、
以及一个被代码否证的「当前保证」前提。

**主代理对全部结论逐条实测后的最终判定**：

| 结论 | 主代理判定 |
|---|---|
| SEC-001 `/export` 无路径围栏 | **成立且已复现**（见 S1） |
| SEC-002 导出无脱敏、transcript 原样落盘 | **成立**（`sessionTranscript.ts:84` 无 scrub；导出不 import redaction） |
| SEC-003 §5.2 防线表引用了仅测试使用的模块 | **成立**（生产零构造；真沙箱是 `osSandbox.ts`）→ 表已重写 |
| SEC-004 按名自动批准（扩展顶名绕过） | **成立**（`toolPolicy.ts:17-26` + `registry.ts:717` 静默覆盖） |
| SEC-005 `permissions.check` 是死契约 | **成立**（全仓零调用） |
| SEC-015 未知格式静默降级 = 注入汇 | **成立**，已从「小缺陷」升格为 §2.4 安全项 |
| SEC-016 「18 个文件」不可复现 | **成立**（初稿未附命令）→ 已补口径与命令 |
| SEC-017 §5.1 的 `normalizePaste` 理由错误 | **成立**（base64 不含制表符/CRLF）→ 理由已改正，结论保留 |
| SEC-018 参考实现用原生解码器处理剪贴板字节 | **成立**→ 已记入 §3.2/§3.3 的依赖口径 |
| SEC-019 URL 白名单描述不全（含 `ftp:`，且不覆盖 `data:` 图片） | **成立**→ 已记入 §2.4 |
| SEC-020 Mermaid 无体积上限，与 §1.2 的批评标准不一致 | **成立**→ 已加守卫要求 |

**结论：本轮不推进任何施工。** 三项前置修复按依赖顺序排列：

1. **S1（独立，与本计划无关）**——`/export` 需要一条明确的**目标路径策略**。
   注意不能直接套用 `verifyPathContainment`：导出到工作区外（如 `~/Desktop`）是合理用法，
   而那套围栏会一律拒绝。可选的形态：默认工作区内；工作区外要求显式绝对路径 + 确认提示；
   或引入「导出目标允许列表」。**这是一个需要决定的产品问题**，
   但**「相对路径可以逃出工作区」这一条无论如何都该堵**。
   这是既有缺陷，**应当立刻修**，无论本计划是否推进。
2. **S2/S3（扩展宿主的前提）**——只读分类从「按名查表」改为**契约驱动**
   （挂在 `ToolDefinition` 上）；扩展工具名与内置/彼此冲突**拒绝或加命名空间**。
   参考实现专门做这件事（`detectExtensionConflicts`，`resource-loader.ts:1064`），本计划原稿漏了。
3. **S4（HTML 导出的前提）**——脱敏步骤 + 未知格式报错 + 写入路径围栏。

**方法论教训（第三条，与前两条并列）**：本轮复核暴露出**「计划会放大既有缺陷」这一类盲区**。
初稿逐条核对了「要新增什么」，却没有问「我要接入的这条路径当前是什么状态」——
`/export` 的写入路径没有围栏、工具权限契约是死的、升级审批按名字判定，
三者都与本计划无关，却都被本计划踩到。**因此新增功能的检查清单必须包含一条：
「我接入的既有路径，本身是否已经安全？」** 这与 Phase 8 的「结论对不能豁免理由错」、
本轮的「数字对不能豁免口径错」构成同一族教训：**被继承的前提必须被验证，而不是被假定。**

## 6. 主代理核验记录

子代理报告的关键数字经主代理独立复测（不复述子代理结论）：

| 数字 | 子代理说法 | 主代理实测 | 结论 |
|---|---|---|---|
| 参考扩展宿主规模 | 4,456 行 + `jiti` | `wc -l` → 4,456；`jiti` 2.7.0 | 成立 |
| 参考 HTML 导出规模 | 3,736 行 | `wc -l` → 3,736 | 成立 |
| HTML「零依赖」 | 部分成立 | 生成器零外部依赖，但 vendor 两个库 | 修正表述 |
| `grok-mermaid` 体积 | ~250KB | `npm view` → **508,454 字节** | 修正 |
| `grok-mermaid` 传递依赖 | 0 | lockfile 中 `deps: None` | 成立 |
| 我方 `.content` 消费点 | 141 处/53 文件 | 非测试 **118 处/52 文件**（含测试 141/53） | 成立，需分口径 |
| `multimodal.ts` 零消费 | 文档如此声称 | **不成立**——`registry.ts:4` 在用 3 个函数 | **文档错误，已定位成因** |
| 我方运行时依赖数 | 5 | `package.json` → 5 | 成立 |
| `escapeHtml` 重复 | 3 处 | 3 处（`grep -rn "function escapeHtml"`） | 成立 |
| 我方扩展立场 | 硬编码拒绝 | `lifecycle.ts:58-59,228-231,285,420` + 测试钉住 | 成立，且比子代理描述更硬 |

**子代理报告中的两处需修正**（已在上文改正）：
①HTML「零依赖」应表述为「生成器零外部依赖 + vendor 两个内联库」；
②`grok-mermaid` 体积 508KB 而非 250KB。

**我方文档的一处实证错误**（本轮发现，需在文档中更正）：
`04-*` §3.4 判定 `multimodal.ts` 零生产消费者，其依据的 grep 命令自带
`| grep -v "model-adapters/"`，把唯一的生产 import 行过滤掉了。
同时该节把 `toOpenAIImageUrlBlock` 写成 `toOpenAIImageBlock`、行号 `:68` 写成转换函数
（`:68` 实为 `formatNonVisionFallback`）。

---

## 7. 需维护者裁决的点

1. **扩展宿主是否立项**（改向性最大）。若推进，必须同时决定：
   - 是否引入 `jiti`（第 6 个运行时依赖），还是要求扩展预编译为 `.js`
   - 是否给扩展任何沙箱/边界（参考实现**无**；我方有沙箱/审批/路径围栏，扩展会绕过）
   - `FORBIDDEN_EFFECTS` 里的 `execute-plugin-code` 与两条钉死测试如何处置
2. **图片输入的消息模型**：采用「加宽 `content` + `messageToText` 收口」（建议），还是加并行字段（本仓反对的双源）。
3. **Mermaid 默认模式**：`final`（建议，安静）还是 `streaming`（参考实现默认）。
4. **HTML 导出首版范围**：静态可读页（建议，约 300 行客户端脚本）还是等价交互（侧栏树/过滤，客户端脚本上千行）。
5. **顺序**：是否按建议「Mermaid → HTML → 图片 → 扩展宿主」推进。
6. **S1 导出目标策略**（既有缺陷，建议先修）：工作区内默认 / 工作区外需显式绝对路径 + 确认 /
   允许列表——三者选一。无论如何，「相对路径 `../` 可逃出工作区」必须堵住。
7. **S2/S3**（扩展宿主前提）：只读分类是否改为契约驱动（挂在 `ToolDefinition` 上）？
   扩展工具名冲突是拒绝还是加命名空间？——这两条**必须在扩展宿主落地前**定。
8. **S4**（HTML 导出前提）：脱敏的排除项集合如何确定与记录？未知格式是否一律报错（建议是）？

## 8. 本轮未做的核验（如实记录）

- **未实机**：剪贴板读取链（Wayland/X11/WSL）在任何环境下的真实行为——本机是 WSL2，`powershell.exe` 路径可测，但尚未测。
- **未验证**：`grok-mermaid` 对各类图的实际渲染质量与崩溃率（需装包后实测）。
- **未验证**：参考实现导出的 HTML 在真实浏览器中的表现（未打开）。
- **未验证**：扩展宿主的进程内执行在真实扩展上的行为（参考仓未安装任何扩展）。
