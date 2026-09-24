---
title: "Phase 7 前置研究：01–07 剩余差距的第三次盘点"
category: article
sources: [repo-audit-2026-09-24, pi-source-2026-09-24, phase-6-execution-2026-09-24, phase-6-decisions-2026-09-23, plan-refactor-v7-2026-09-20]
created: 2026-09-24
updated: 2026-09-24
tags: [features, phase-7, pre-research, gap-analysis]
summary: "Phase 7 开工前的第三次地形测绘，零代码改动。Phase 6（含复核轮，12 处修复 + CI 首次全绿）之后重新盘点 01–07。本轮最重要的单一发现与 Phase 6 相反：**表格这次不是滞后，而是错的**——四条「仍开放」的判定经代码核实**已经不成立**（重复压缩边界、rewind 分支摘要、鼠标选择与复制、Undo/redo），其中两条还有**测试在钉住**它们已实现的行为。真正仍开放的是 **17 项**，其中 **3 项是有明确证据的行为缺口**：①**OAuth 登录是完整的死路**——登录、刷新、凭据解析、就绪预检全部实现且有测试，但**请求路径只读 `apiKey`**，account-auth 凭据没有该字段，所以登录后请求发出的是空 `Bearer`；②**`/skill:name` 与磁盘提示词模板**——`pi` 在同一路径上展开两者，我方 `/skill` 只打印文本、无模板引擎；③**转录内搜索**——长会话里无法定位先前内容。另有一处**死字段**（`firstRetainedEntryId` 声明且被读、**从不被写**，且无门禁覆盖）。"
confidence: high
---

# Phase 7 前置研究

> **性质**：Phase 7 开工前的测绘，**零代码改动**。
> **输入**：`.wiki/features/01-*` … `07-*`、`phase-6-execution.md`（含复核轮）、
> `phase-6-decisions.md`、`.wiki/refactor/plan.md`、`scripts/analyze-boundaries.py` 实测输出。
> **输出**：候选任务与执行顺序，**不含施工**。

---

## 0. 方法与边界

### 0.1 起点

Phase 6 收口 5 项任务（`a5858658` → `dfcccc71`）+ 复核轮 12 处修复（`daccb599` → `6e5e67d6`，
含 **CI 首次全绿**）。本轮起点是**在收口后的真实代码上第三次盘点**。

盘点方法（沿用 Phase 6 §0.2 并收紧）：对 01–07 每一份的覆盖清单逐行核对**当前代码**，
标出四种状态：**已收口** / **已实现未标注** / **仍开放** / **已变质**。

### 0.2 本轮的核心发现与 Phase 6 相反

Phase 6 的发现是「**表格滞后**」——25 个条目已实现但没标注。
**本轮是另一种形态：表格不是滞后，而是错的。**

四条判定经代码核实**已经不成立**，且两条**有测试在钉住已实现的行为**：

| 行 | 原判定 | 实测 | 决定性证据 |
|---|---|---|---|
| 重复压缩沿用上一条 kept boundary | **DEFICIENT** | **已收口** | `session/compaction.ts:491` `historyStart = previousSummary === undefined ? head : head + 1`；`compaction.test.ts:543` 标题即「revises the checkpoint it finds instead of summarizing it again」 |
| rewind／分支切换时摘要被放弃的分支 | **MISSING** | **已收口** | `SessionManager.ts:184` `appendBranchSummaryEvent(...)`，含 `summary`/`droppedTurns`/`abandonedEntryIds`；`sessionTranscript.ts:114-124` 投影回 `[Earlier Path]` |
| 鼠标选择与复制 | **DEFICIENT** | **已收口** | `cli/interactive/pointer.ts:177,187` 边缘自动滚动；`:79` `copySelection()`；`transcript/selection.ts` 去缩进/去轨道 |
| Undo | **DEFICIENT** | **已收口** | `editor/editHistory.ts:13-16` 双向栈；`keybindings.ts:62-63` `ctrl+z`/`ctrl+shift+z`；`keymap.ts:153-160` 已接线 |

**四条里我（主代理）自己错了两条。** §0.3 记录原因。

### 0.3 两条纪律（都是本轮踩出来的）

**① 「同一个词」不等于「同一个功能」——先读实现，再下判定。**

我最初用 `grep "autoScroll"` 断言「无边缘自动滚动」——**空结果**。
实际实现叫 `startAutoScroll`（`pointer.ts:217`），而且**确实存在**。
同型：我用 `grep "undoStack"` 断言「无 redo」，实际实现已换成 `EditHistory`
（`editHistory.ts:13`），旧字段名**早已不存在**。

这与 Phase 6 §0.2 的教训同源但更进一步：
那里是「**一个 grep 模式的空输出**不等于不存在」，
这里是「**字段名换了**，所以按旧名字搜必然为空」。
**据此新增纪律**：任何「X 不存在」的断言，必须**先读判定所依据的那个文件本身**，
而不是只搜名字——**判定的依据是行为，不是标识符**。

**② 我引用的是文档里的旧结论，而不是代码。**

`07-*` §2.3 的「重复压缩」条目写在 2026-09-20；Phase 2（2026-09-21）**重新设计过**这个机制
（`phase-2-execution.md:358-397`），从 `firstKeptEntryId` 改为**检测 `[Context Checkpoint]`**。
表格没有跟着改。**教训**：核对判定时，`### 2.x` 的详情节和判定列**都可能比代码旧**，
唯一可信的是**代码加一个能失败的测试**。

### 0.4 一条必须说明的限制

本轮**没有实机验证 OAuth 端到端**（§1.1）：需要真实订阅账号与外部授权服务器。
判定基于**代码路径的静态追踪**（凭据形状 → 请求头构造），
证据强度为**强**（字段确实不存在），但「真实端点是否接受该 token」未验证。

---

## 1. 逐行盘点

### 1.1 03 Provider 与模型层 —— **本轮最重的发现**

#### ① OAuth 登录是完整的死路（**行为缺口，未标注为缺口**）

`03-*` 把「订阅式 OAuth 登录」标为 **DEFICIENT**（「余量：订阅登录」）。
**实测比 DEFICIENT 更严重：整条链路是断的。**

**已实现的部分**（全部有代码与测试）：

| 环节 | 位置 | 证据 |
|---|---|---|
| PKCE 授权码流程 | `core/auth/oauth/flow.ts:137,197` | `accessToken: payload.access_token` |
| 两个提供方的登录命令 | `core/commands/googleAccountAuth.ts:19`、`openaiAccountAuth.ts` | 各自导出 `accessToken` |
| 凭据解析（认 account-auth） | `core/shell/providerCredentials.ts:104-121` | `authMode: "account-auth"`，带 `accountAuth`，**无 `apiKey`** |
| 就绪预检（认 account-auth） | `core/shell/providerReadiness.ts:105` | `const accountAccess = options.accountAuth?.accessToken?.trim()` |
| 测试 | `providerCredentials.test.ts:121`、`providerReadiness.test.ts:222`、`connectCommandRuntime.test.ts:363` | 三处均通过 |

**断在哪**：请求路径只读 `apiKey`。

```ts
// entrypoints/cliRuntimeInvocation.ts:438-441
return createStepFunction({
  provider: {
    apiKey: resolution.credential?.apiKey ?? "",   // ← account-auth 凭据没有这个字段
    baseUrl: resolution.baseUrl ?? resolution.credential?.baseUrl ?? "",
    model: resolution.model ?? resolution.credential?.model ?? "",
    provider: resolution.provider,
  },
```

而 `turn/step.ts:212` 无条件把 `apiKey` 放进头部：

```ts
headers: { "Content-Type": "application/json", Authorization: `Bearer ${request.provider.apiKey}` },
```

**后果**：account-auth 凭据的 `apiKey` 是 `undefined` → `?? ""` → 请求发**空 `Bearer `**。
就绪预检会**放行**（`:105` 只看 `apiKey || accountAccess`，而 `accountAccess` 存在），
所以用户看到的是「登录成功、预检通过、请求 401」。

**另有两处连带**：

1. **刷新从未发生**。`providerReadiness.ts:130-134` 的注释写「Let the model adapter perform
   refresh-token exchange」——**没有任何 model adapter 做这件事**：
   `grep -rn "accessToken" model-adapters/ provider/` → 仅 `model-adapters/types.ts` 的类型定义。
   注释描述了一个不存在的消费者（与 Phase 6 复核轮「注释里的不变量没检查过」同型）。
2. **压缩路径同样断**。`cliSessionRuntimeFactory.ts:182` `const apiKey = resolved.credential?.apiKey;`
   → account-auth 下 `apiKey` 为空 → `compactionProvider()` 返回 `undefined`
   → `/compact` 报「No credential for provider …」。

**`pi` 的做法**（`/home/wang/projects/pi`）：`CredentialStore`（`auth.json`）+ `Models.getAuth()`，
把存储的 OAuth **直接映射进请求头**，并对刷新做**双检锁串行化**（避免并发刷新互相覆盖）。

**测试为什么没抓到**：三处测试分别覆盖**登录**、**凭据解析**、**就绪预检**，
**没有一处覆盖「凭据 → 请求头」**。实测两个搜索形态均为空：
`grep -rn "accessToken" --include='*.test.ts' entrypoints/ turn/` → 0；
`grep -rn "accountAuth" --include='*.test.ts' entrypoints/cliRuntimeInvocation.test.ts` → 0。
**这是「每一段都测了，接缝没测」的典型**，与 Phase 5 §11.6、Phase 6 §4.4 同型。

#### ② Prompt cache 保活（warming）—— MISSING，**且要区分两件事**

`pi` 有**两个不同的东西**，初稿容易混为一谈：

| `pi` 的文件 | 性质 | 内容 |
|---|---|---|
| `core/cache-stats.ts` | **事后分析** | `CacheMiss { missedTokens, missedCost, idleMs, modelChanged }`；`CACHE_TTL_MS = 5 * 60 * 1000`；`NOISE_FLOOR_TOKENS = 1024` |
| `core/cache-warmer.ts` | **行为改变** | 发 1-token 的刷新请求；决策模型 `expectedSavings = continuationProbability * missCost - warmCost`，`≥ $0.05` 才 warm |

我方**只有记账**（`usageTelemetry.ts` 的 `cacheReadTokens`/`cacheWriteTokens`），
无分析、无保活。**注意**：`cache-warmer.ts` 会**主动发请求**，
与本项目「无未经询问的对外请求」的既有姿态冲突（见 §1.5 更新检查）。

#### ③ 传输选择（SSE／WebSocket）—— MISSING，判定为**有意简化**

我方只有 HTTP POST + SSE（`turn/step.ts` + `turn/completion.ts`）。
`pi` 支持 `"sse" | "websocket" | "websocket-cached" | "auto"`，
但那是**为 `openai-codex-responses` 的会话缓存 WebSocket 专门做的**。
对 OpenAI 兼容的 `chat/completions` 端点，SSE 是标准路径。
**判定：不是缺口，是范围选择。** 维持 MISSING 但降级为「不纳入」。

---

### 1.2 01 可扩展性与定制化

#### ① 扩展宿主 —— MISSING（**判定不变，但证据要更正**）

`runtime/extensions/` 只有 `lifecycle.ts`（+ 测试）。它的契约**明确拒绝执行**：

```ts
// runtime/extensions/lifecycle.ts:49,62-63
execution: "not-supported",
readonly supported: false;
readonly executable: false;
```

且 `:233-238` 的校验函数把 `supported !== false` 与 `executable !== false` **都判为违规**——
即这个模块的设计意图就是「只描述、不执行」。

**唯一生产 importer** 是 `runtime/resources/descriptor.ts:5,9`，**只导入类型与谓词**，
不导入任何函数。**三种检索形态**（目录名、相对导入、动态加载 `import(`/`require(`）均为「无执行路径」。

`pi` 用 `jiti` 在**同进程**内加载（`extensions/loader.ts:494-515`），
配 `virtualModules` 重定向宿主依赖（`virtual-modules.ts:13-33`），
**没有 worker/子进程隔离**；权限靠**项目信任**（`runner.ts:90-95`）。
一旦信任，扩展拥有完整 Node API。

**规模：大**（需移植 jiti 集成、虚拟模块映射、ExtensionAPI、runner 派发）。
**判定：不纳入 Phase 7**，理由同 Phase 5 §9.2 对 RPC/SDK 的裁决——
需要定义加载/隔离/权限/生命周期四件事，且**无隔离验证手段**（要跑第三方代码）。

#### ② 技能作为斜杠命令 `/skill:name` —— **MISSING，本轮纳入候选**

三种检索形态确认不存在：字面 `/skill:`、`` `skill:${...}` `` 构造、命令注册表中的前缀处理。
现状是 `/skill <name>` **只把技能文本打印到终端**（`skillCommandRuntime.ts:14-26`），
**不展开进提示词**。

**实机验证（构建产物，决定性证据）**：放一个 `.agents/skills/demo/SKILL.md`，
在真实 CLI 里输入 `/skill:demo hello`：

```
- Outcome: blocked
- BlockerKind: command-not-allowlisted
- Reason: Unknown slash command: /skill:demo
```

**所以这不只是「功能缺失」，而是「文档化的用法直接报错」。**
原因在 `core/commands/slashRouter.ts:12`：`input.slice(1).split(/\s+/)` 把
`skill:demo` 当作一个**命令名**去查注册表，查不到就走 `buildUnknownSlashOutput`（`:34-40`）。
**没有任何前缀匹配的中间态**。

`pi` 的做法（`core/agent-session.ts:1797-1823`）：`/skill:name args` 被展开成

```
<skill name="..." location="...">…body…</skill>

<args>
```

即**技能内容成为用户消息的一部分**，模型据此执行。并且 `pi` 有
`enableSkillCommands` 开关（默认 `true`），以及一个重要的细节：
`disable-model-invocation: true` 的技能**不进系统提示词，但仍可经 `/skill:name` 显式调用**。

**我方已具备的**：`SkillLoader`（含 frontmatter 解析、祖先目录搜索、
`disable-model-invocation` 支持，Phase 6 T5a 已核实）、系统提示词注入、`/skill` 命令、交互式选择器。
**缺的**：`:name` 前缀路由（**要在未知命令分支之前**） + 展开模板 + 开关。

**规模：小**（但**路由顺序**是关键，见 `phase-7-decisions.md` §2）。

#### ③ 提示词模板（磁盘 `.md` 参数化）—— **MISSING，本轮纳入候选**

三种检索形态确认不存在。**注意 `promptCommandRuntime.ts` 是个陷阱**：
它叫 `/prompt`，但**实现的是「继续会话」**，不是模板。

`pi` 的做法（`core/prompt-templates.ts`）：
从 `<agentDir>/prompts/` 与 `<cwd>/.pi/prompts/` 发现 `.md`，
`substituteArgs()` 支持 `$1`/`$2`/`$@`/`$ARGUMENTS`/`${1:-default}`/`${@:N}`/`${@:N:L}`，
用 `parseCommandArgs()` 做引号分词，在 `agent-session.ts:1650` 的**同一路径**上与技能展开**串联**：

```ts
expandedText = this._expandSkillCommand(expandedText);
expandedText = expandPromptTemplate(expandedText, [...this.promptTemplates]);
```

**这个「同一路径串联」是关键设计**：两者都是「用户输入 → 展开 → 送模型」，
分开实现会产生两套分词与两套优先级。**我方应照此在同一个展开点做。**

**规模：中。**

#### ④ 包分发 —— MISSING（**判定不变**）

`/plugin` 与 `/marketplace` **都只操作本地元数据**，且**代码注释自己说清楚了**：

```ts
// pluginCommandRuntime.ts:216-218
"The registration is recorded. This build does not execute extensions, so nothing about the running session changed."
"Nothing was downloaded. Install the package with your package manager, then re-register it from its path to have its manifest read."
```

`marketplaceCommandRuntime.ts:10-23` 是**硬编码的 URL 数组**，`add`/`remove` 只改内存。

`pi` 有完整的 `package-manager.ts`（2699 行）：`npm:`/`git:`/本地路径三种来源，
装到 `<agentDir>/npm/node_modules/` 或 `.pi/git/`，解析 `package.json` 的 `pi` 块
（`pi-manifest.ts:14-35` 的 `extensions`/`skills`/`prompts`/`themes`）。

**规模：大**（git/npm 进程管理、lockfile、版本解析、目标目录布局、信任边界）。
**判定：不纳入 Phase 7。**

**一处值得记的观察**：`/plugin` 的**输出文案是诚实的**——它明确说「没有下载、没有执行」。
这比「注册成功」的暗示要好，应当保持。

---

### 1.3 02 程序化集成与会话数据

#### ① resume/replay 合约（`since` 游标、`get_tree`）—— DEFICIENT（**判定成立**）

我方有丰富的**内部**结构（`SessionThreadSnapshot` 的 `id`/`parentId` 树、
`sessionTreeProjection.ts` 的完整投影），但**没有任何对外游标或树查询**：

- **无 `since` 游标**：两个检索形态为空（`\bsince\b` 的 44 处命中**全是英文散文注释**，
  无 API 参数；`sessionTranscript.ts`/`SessionManager.ts` 无游标切片方法）。
- **无 `get_tree`**：`projectSessionTree` 是**内部投影**，无 CLI 旗标、无命令、无导出。
- **`TranscriptEvent` 缺 `parentId`**：树关系只存在于 `state.json`，
  所以**光有 `transcript.jsonl` 无法重建树**。
- **`--replay-file` 是陷阱**：它是**提示词批处理脚本**，不是事件重放。

`pi` 的契约（`docs/rpc-commands.md:683-711`）：`get_entries { since }` 返回严格晚于游标的条目
+ `leafId`；`get_tree` 返回 `SessionTreeNode[]`。**每条 `SessionEntry` 都带 `parentId`**，
所以 **entry id 就是持久游标**，跨客户端重启有效。

**规模：中。** 这是 02 里**唯一**不是「新契约设计」的缺口——数据都在，缺的是查询面。

**与既有裁决的关系**：Phase 5 §9.2 #5 裁「transcript 加 header/version 行 → 不做」、
#7 裁「`firstKeptEntryId` 接线 → 不做」。**本轮初稿曾试图推翻 #7，经复核证伪后维持**（见 `phase-7-decisions.md` §4.1）。#5 直接相关，**T5 的设计已避开它**（不改文件格式，只加查询方法）。

#### ② 其余四项 —— 维持「不做」

| 项 | 既有裁决 | 本轮核实 |
|---|---|---|
| stdin/stdout JSONL RPC | Phase 5 §9.2 #21 **不做** | 已核实原文；`pi` 有完整 `rpc-mode.ts`（请求/响应关联、审批远程应答、持续事件流）。**规模：大** |
| Node/TS SDK | 同上 **不做** | `index.ts` **55 行 / 10 个导出**，全是纯函数（`selectVerification` 等），**零会话生命周期**。`pi` 有 `createAgentSession`。**规模：中** |
| HTML 导出 | Phase 5 §9.2 #18 / Phase 6 §7 **不做** | `/export` 只支持 `markdown`/`jsonl`。`pi` 有自包含 HTML 模板。**注意**：若纯字符串模板则**不违反 5 依赖约束**——但裁决已做，维持 |
| Session 分享／发布 | 未裁决，登记为独立立项 | `pi` 用 Radius + `gh gist` 回退。**涉及外部认证与隐私，规模：中到大** |
| CBOR protocol/client/server | 范围外 | 两种检索形态均为空。**规模：大** |

#### ③ `--json` 事件流的一处小缺口

`run-event-stream.v1` 是**版本化**契约（`jsonEvents.ts:15`），
每行含 `schemaVersion`/`order`/`eventType`/`facts`/`truthfulness`。
但：**一次性、每回合**；**不暴露会话文件路径**（只发 `sessionId`），
消费者必须自己拼 `~/.cheers/sessions/<id>/`。

**规模：小**（在 `query.started` 或结束事件里带上会话目录路径）。

---

### 1.4 04 终端交互与呈现

#### ① Undo —— **判定已不成立**（详见 §0.2 表）

现状**优于** `pi`：我方有**双向栈**（`EditHistory` 的 `past`/`future`），
`pi` 只有单向 `UndoStack`（`packages/tui/src/undo-stack.ts:6-18`），**没有 redo**。

**但确实有一个真实差距**：**粒度是逐键的**。
`editor.ts:150-154` 的 `insert()` 每次调用都 `saveUndo()`，
而 `keymap.ts:358` 对每个字符调用一次 → **输入 "hello" 产生 5 个撤销快照**，
要按 5 次 `ctrl+z` 才能撤销。

**一处必须精确的事实**：`editor.ts:76` **已经有** `lastAction: "kill" | "yank" | null`，
且 `:253` 用它做**连续 kill 的合并**（`const continuing = backward && this.lastAction === "kill"`）。
所以缺的不是「合并机制」，而是**把这个机制扩展到输入**——
`insert()` 在 `:154` 无条件 `this.lastAction = null`，**主动放弃了连续性**。
这使改动比「新增一套机制」更小，也更不容易与既有 kill/yank 语义冲突。

`pi` 有 **fish 风格合并**（`packages/tui/src/components/editor.ts:1201-1211`）：
连续单词字符合并为一个撤销单元，空格单独成界，原子操作（粘贴）跳过合并。

**规模：小**（约 25 行 + 测试）。**本轮纳入候选。**

#### ② 鼠标选择与复制 —— **判定已不成立**（详见 §0.2 表）

实测**已实现**：SGR 鼠标上报（`mouse.ts:15` `\x1b[?1002h\x1b[?1006h`，经
`engine.ts:278` 可开关）、拖拽选择、**边缘自动滚动**（`pointer.ts:177,187`）、
滚动条拖动、**去缩进复制**（`selection.ts` 去掉轨道 `RAIL` 并计算 `commonIndent`）、
OSC 52 剪贴板出口。

**`pi` 的两个额外能力**（我方没有）：**双击选词 / 三击选行**、
OSC 8 超链接点击。**规模：小。**

**一处必须记的技术事实**：启用鼠标上报**会破坏终端的原生选择**。
`pi` 的 `docs/tui.md:58-62` 说明 regular 模式**不接管鼠标**，因为「terminal owns scrollback」。
我方目前**恒进备用屏**，所以接管鼠标是自洽的——但**如果将来做 `tuiMode: "regular"`**，
就**必须**同时考虑放开鼠标（否则用户在主屏下既无原生选择、又无应用内选择的必要语境）。

#### ③ 转录内搜索 —— **MISSING，本轮纳入候选**

两种检索形态确认不存在。**`chrome/pager.ts:109-114` 不是它**——
那是**全屏命令输出**的实时过滤（`/help`、`/restore` 用的临时模态）。

`pi` 的（`packages/tui/src/alt-screen-search.ts` + `tui-alt-screen.ts:706-724`）：
`ctrl+shift+f` 打开**底部粘性搜索条**，高亮全部匹配（当前项反显加粗），
`Enter`/`Shift+Enter` 循环跳转并居中，显示 `x of y`，`Escape` 关闭。

**规模：中**（约 200–250 行）。

#### ④ 图片粘贴 —— **MISSING，且被更大缺口阻塞**

两种检索形态确认不存在。**更关键的是它被三件事阻塞**：

1. **`read` 工具主动拒绝图片**：`core/tools/registry.ts:341-356` 返回
   `formatNonVisionFallback(...)` + 「this model receives no image content」。
2. **多模态构造器零生产调用者**：`toAnthropicImageBlock`/`toOpenAIImageUrlBlock`
   仅出现在 `strictAndMultimodal.test.ts`。
3. **消息模型不支持附件**：`turn/session.ts` 的用户消息是 `{ role, content: string }`。
4. **无剪贴板图片读取**：`cli/interactive/clipboard.ts` 只有文本（OSC 52 / `pbpaste` 等）。

`pi` 有 **原生 N-API 插件**（`packages/tui/native/`，C/ObjC/C++）+
`wl-paste`/PowerShell 回退（`utils/clipboard-image.ts:113-140`）。

**规模：大／跨切面。判定：不纳入 Phase 7**，登记为独立立项。

#### ⑤ Mermaid 渲染 —— **MISSING，判定为「需要新依赖」**

两种检索形态为空。`markdown.ts` 的 `renderFence` 只按语言做语法着色，未知语言原样输出。

`pi` 用 `grok-mermaid@0.2.3`（`package.json:60`）→ Unicode 方框图。
**无依赖自研不现实**：Mermaid 语法 + 2D 图布局（节点定位、边路由、交叉最小化、标签对齐）
是 2000–5000 行图论代码。

**规模：小（引入依赖）／不可行（不引入）。判定：不纳入**——我方依赖面刻意保持 5 个，
且 Phase 5 §9.2 #18 已有同类裁决。**维持。**

---

### 1.5 06 可观测性、配置与生命周期

#### 更新检查 —— MISSING，**维持「不做」**

两种检索形态为空（符号名 + 注册表域名/`npm view`）。
Phase 6 §7 已裁 **不做**，理由「涉及对外请求，须先决定『是否允许未经询问的联网』」。

**本轮补充一条此前没说清的事实**：我方**目前完全没有对外请求的同意机制**。
现有对外请求只有**模型 provider**（用户配置即同意）与**本地工具**。
所以「更新检查」不是加一个请求，而是**引入一个新的同意类别**。

**判定：维持不做**，理由从「产品决策未定」收紧为
「**需要先建立对外请求的同意与离线开关，那是独立立项**」。

---

### 1.6 07 上下文管理与压缩

两条判定**均已不成立**，见 §0.2 表。补充证据：

**重复压缩**：`pi` 用 `firstKeptEntryId`（树节点上存），我方用
**检测 `[Context Checkpoint]` 标记**（`session/compaction.ts:393` `readContextCheckpoint`）。
**两者达成的运行时不变量完全相同**：新切点按 token 预算重算、
送摘要的是「上次检查点之后的消息」、上次摘要在 `<previous-summary>` 里**修订**而非重摘要、
文件足迹跨压缩合并。

**反向验证**：把 `historyStart` 改回 `head`（即制造所声称的缺陷）→ **2 项测试失败**；
恢复 → 34 项全过。**行为是被测试钉住的。**

**一处必须记录的边界（我自己探出的，复核者未覆盖）**：`readContextCheckpoint` 只检查
**`messages[head]` 这一个位置**（`session/compaction.ts:489-491`）。实测三种输入：

```
A system+checkpoint : prev="prior"   msgsSummarized=2   ← 正常
B bare checkpoint   : prev="prior"   msgsSummarized=2   ← 无 system 也正常（head=0）
C checkpoint offset : prev=undefined msgsSummarized=4   ← 检查点被当作普通历史！
```

**Case C 是「检查点不在 `head` 位置」**——此时它**不**被识别，会作为普通历史重新摘要，
**正是原判定所描述的缺陷**。

**但 Case C 当前不可达**：唯一写检查点的地方是 `applyCompaction`（`session/compaction.ts:556-557`），
它无条件把检查点放在 `head` 之后：

```ts
const head = messages[0]?.role === "system" ? [messages[0]] : [];
return [...head, checkpoint, ...messages.slice(plan.cut)];
```

分支摘要（`[Earlier Path]`）是**追加到末尾**（`sessionTranscript.ts:116-123`），不会插到检查点前面。

**结论：判定仍为「已收口」，但实现依赖「检查点必在 `head`」这个不变量，而该不变量没有断言。**
这是一处**应当补测试**的地方（而不是应当改判定），已登记为 Phase 7 的收尾项。

**rewind 分支摘要**：`SessionManager.ts:155-188` 计算 `abandonedTurns`，
调 `summarizeAbandonedTurns`（`cliSessionRuntimeFactory.ts:212-225`，
Phase 6 复核轮已补 `fetchImpl` 超时），写 `appendBranchSummaryEvent`。
`sessionTranscript.ts:57-79` 在**离开被放弃分支时**才投影出该摘要。

**与 `pi` 的一处设计差异**：`pi` 在切换分支时**询问**「Summarize abandoned branch? (y/n)」；
我方**自动在后台做**，且摘要失败时**仍写入移动元数据**（`SessionManager.ts:176-178` 注释：
「Recorded whether or not anything could summarize it」）。
**我方更稳健**（网络失败不阻塞分支切换），**但用户没有选择权**。
本轮**不判定为缺陷**——这是取舍，不是缺失。

---

### 1.7 05 工具与执行安全

**无开放行**（全部收口或平手）。本轮未发现新缺口。

---

## 2. 汇总：真正仍开放的东西

| # | 项 | 切片 | 性质 | 证据强度 | 规模 |
|---|---|---|---|---|---|
| 1 | **OAuth 凭据到请求的接线** | 03 | **行为缺口**——登录是死路，请求发空 `Bearer` | 强（字段不存在 + 三处测试只测接缝两侧） | 中 |
| 2 | **`/skill:name` 展开** | 01 | **行为缺口**——技能只能看，不能执行 | 强（三种检索形态） | 小 |
| 3 | **磁盘提示词模板** | 01 | **行为缺口**——无模板引擎 | 强（三种检索形态） | 中 |
| 4 | **转录内搜索** | 04 | **行为缺口**——长会话无法定位 | 强（两种检索形态） | 中 |
| 5 | **Undo 合并粒度** | 04 | 人体工学——逐键撤销 | 强（读实现） | 小 |
| 6 | **`get_entries(since)` / `get_tree`** | 02 | **新查询面**——数据在，无对外契约 | 强（两种检索形态） | 中 |
| 7 | **`firstRetainedEntryId` 死字段** | 07 | **死字段**——声明且被读、从不被写 | 强（两形态 + 无门禁） | 小 |
| 8 | **双击选词／三击选行** | 04 | 人体工学 | 强 | 小 |
| 9 | **`--json` 暴露会话路径** | 02 | 小缺口 | 强 | 小 |
| 10 | 扩展宿主 | 01 | 新契约设计 | 强 | 大 |
| 11 | 包分发 | 01 | 新契约设计 | 强 | 大 |
| 12 | RPC／SDK／HTML／分享／CBOR | 02 | 新契约设计 | 强 | 中–大 |
| 13 | 图片粘贴 | 04 | 被更大缺口阻塞 | 强 | 大 |
| 14 | Mermaid | 04 | 需新依赖 | 强 | 小／不可行 |
| 15 | 更新检查 | 06 | 需先建同意机制 | 强 | 小 |
| 16 | cache 保活 | 03 | 行为改变（发请求） | 强 | 中 |
| 17 | 传输选择 | 03 | 范围选择 | 强 | 中 |

**收敛情况**（在 `phase-7-decisions.md` 中逐项处置）：
纳入任务 **8 项**（#1→T1、#2/#3→T2、#4→T3、#5/#8→T4、#6/#9→T5、#7→T6）；
明确不做 **8 项**（#10–#17 中的独立立项）；
**#8 与 #9 初稿曾漏处置，经复核指出后已纳入 T4/T5**（见 `phase-7-decisions.md` 裁决 16、17）。

**四条判定被推翻**（§0.2）。**我自己的错共三处**（§0.3 两处 + `phase-7-decisions.md` §4.1 一处）——第三处最重：**据一个未核实的假设推翻了既有裁决**。

### 2.1 候选任务与排序

排序依据：**证据强度 → 行为影响 → 隔离可验证性 → 是否破坏既有契约**。

| 序 | 任务 | 理由 | 可否隔离验证 |
|---|---|---|---|
| **T1** | **OAuth 凭据接线** | 唯一一个「用户按文档操作会失败」的缺口，且**三段实现全在、只有接缝断**。性质是**接线**（同 Phase 6 T1），不是新功能 | **可以**——本地 HTTP server 断言 `Authorization` 头等于存储的 token |
| **T2** | **技能与提示词模板展开** | 两件事**必须一起做**：`pi` 在**同一路径**串联展开，分开做会产生两套分词与优先级。已有 `SkillLoader` 与 frontmatter 解析 | **可以**——纯字符串函数，输入输出确定 |
| **T3** | **转录内搜索** | 长会话的**核心可用性**缺口；`pi` 的实现可完整对照 | **可以**——但需 PTY 实机验证渲染 |
| **T4** | **Undo 合并粒度** | 最小改动、最高频率的人体工学收益 | **可以**——纯编辑器状态测试 |
| **T5** | **`get_entries(since)` / `get_tree`** | 02 里唯一不是新契约的缺口；数据都在 | **可以**——构造多分支会话断言游标与树 |
| **T6** | **死字段与判定回写** | `firstRetainedEntryId` **删除**（经复核确认无消费者、也无规划中的消费者，见 `phase-7-decisions.md` §4.1）；**四条被推翻的判定必须回写**，否则下一个读者继续被误导 | **可以**——`verify:docs-drift:strict` + 门禁 |

### 2.2 明确**不纳入**，登记为独立立项

| 项 | 理由 |
|---|---|
| 扩展宿主（01） | 需定义加载/隔离/权限/生命周期；**无隔离验证手段**。同 Phase 5 §9.2 对 RPC/SDK 的理由 |
| 包分发（01） | 需 git/npm 进程管理、lockfile、信任边界。**规模大且非缺陷** |
| RPC／SDK／HTML／分享／CBOR（02） | 维持 Phase 5 §9.2 与 Phase 6 §7 的裁决；本轮已核实原文 |
| 图片粘贴（04） | 被 `read` 工具拒绝、消息模型无附件、无剪贴板图片读取**三重阻塞** |
| Mermaid（04） | 需新依赖（`grok-mermaid`）；维持 Phase 5 §9.2 #18 |
| 更新检查（06） | 需先建立「对外请求的同意与离线开关」，那是独立立项 |
| cache 保活（03） | 会**主动发请求**，同更新检查的同意问题；且 `pi` 的决策模型依赖它的计费结构 |
| 传输选择（03） | 范围选择，非缺口 |

### 2.3 两处需要记录的判断

**① T1 与 T2 的顺序。**

**T1 在前。** 理由：T1 修的是**已经承诺但失效**的能力（`/connect login … --account` 是
文档化的用户操作），T2 是**新增**能力。**失效的承诺优先于新功能**——
这与 Phase 5 §9.3「先删不可达实现再改」、Phase 6 §3.3「先改代码再回写表格」同源：
**先让现有承诺成立，再扩大承诺范围。**

**② T6 排在最后。**

同 Phase 6 §3.3：**先改代码，再回写表格**，否则 T1–T5 的施工会让表格再次滞后。
但 **`firstRetainedEntryId` 的处置必须在 T5 之前决定**——T5 若决定做 `get_tree`，
这个字段正是它要读的东西（§1.3①），**先删后接会把 T5 的前提拆掉**。

---

## 3. 与 `pi` 的对照（仅列出实际读过的）

| 项 | `pi` 的实现 | 我方现状 | 判断 |
|---|---|---|---|
| OAuth → 请求 | `CredentialStore` + `Models.getAuth()`，**直接映射进请求头**，刷新有双检锁串行化 | 登录/解析/预检全在，**请求路径只读 `apiKey`** | **我方断链**，`pi` 的方案可直接对照 |
| 技能命令 | `/skill:<name>` 展开为 `<skill>` 块（`agent-session.ts:1797-1823`），`enableSkillCommands` 开关 | `/skill <name>` **只打印文本** | **我方更弱** |
| 提示词模板 | `prompt-templates.ts`：`$1`/`$@`/`${1:-default}`/`${@:N:L}` + 引号分词；与技能**同路径串联** | **无** | **我方更弱**，且**串联设计值得照抄** |
| 转录搜索 | `alt-screen-search.ts`：粘性搜索条、高亮、`Enter` 循环、`x of y` | **无** | **我方更弱** |
| Undo | 单向 `UndoStack`，**无 redo**；有 fish 风格**词合并** | **双向栈**（有 redo），**逐键粒度** | **各有一项**：我方有 redo，`pi` 有合并 |
| 鼠标选择 | 接管鼠标，另有双击选词/三击选行、OSC 8 超链接 | 接管鼠标，**有边缘滚动与去缩进复制**，无双击选词 | **基本平手** |
| 扩展宿主 | `jiti` 同进程加载 + 虚拟模块 + 项目信任 | **契约明确拒绝执行** | **我方更弱**（但见 §2.2） |
| 包分发 | `package-manager.ts`（2699 行）：npm/git/本地 + `pi` manifest | `/plugin`、`/marketplace` **只存元数据**（且文案诚实说明） | **我方更弱** |
| cache 保活 | `cache-warmer.ts` 主动发 1-token 请求，`expectedSavings ≥ $0.05` 才 warm | 只有记账 | **我方更弱**，但涉及对外请求同意 |
| cache 分析 | `cache-stats.ts`：missed tokens/cost、`CACHE_TTL_MS`、`NOISE_FLOOR_TOKENS` | 只有绝对值 | **我方更弱** |
| session 游标 | `get_entries { since }` + `get_tree`，**每条 entry 带 `parentId`** | 内部树投影，**无对外游标**；`TranscriptEvent` 无 `parentId` | **我方更弱** |
| 压缩边界 | `firstKeptEntryId` 存在树节点上 | **检测 `[Context Checkpoint]`**，`historyStart = head + 1` | **平手**（不变量相同） |
| 分支摘要 | 切换分支时**询问**用户 | **自动后台做**，失败仍记录移动 | **各有权衡**，不判为缺陷 |

**说明**：`pi` 路径均为本轮实际打开读过的文件。未读的不列。

---

## 4. 未做的事（如实记录）

| 项 | 原因 |
|---|---|
| **OAuth 端到端实机验证** | 需真实订阅账号与外部授权服务器。判定基于代码路径静态追踪（字段确实不存在），强度为强，但「真实端点是否接受该 token」**未验证** |
| `pi` 的扩展宿主逐文件对照 | 若 §2.2 的裁决被推翻（决定做扩展宿主），需要单独一轮深度研究 |
| `grok-mermaid` 的渲染质量与性能 | 未安装依赖，未实测 |
| 任何代码改动 | 本文件性质是测绘 |
| 除 `pi` 外的参考仓 | 本轮缺口不需要更多对照；`opencode` 仅在 undo 一处被读到 |

### 4.1 子代理执行记录

| 子代理 | 覆盖 | 结果 |
|---|---|---|
| `ScExtHost` | 01 扩展/技能/模板/分发 | **失败**（上游 `content_filter`），已由 `ScExtHost2` 重派完成 |
| `ScExtHost2` | 同上 | 完成 |
| `ScIntegration` | 02 集成与会话数据 | 完成 |
| `ScProvider` | 03 provider/模型层 | 完成 |
| `ScTerminal` | 04 终端交互 | 完成 |
| `ScContext` | 07 压缩 + 06 更新检查 | 完成 |

**每一处子代理断言都由主代理独立核实**，其中 **`ScTerminal` 推翻了主代理的两处错误判定**
（§0.3 的 `autoScroll`/`undoStack`）——**这正是复核的价值**。
