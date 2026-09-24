---
title: "Phase 6 前置研究：01–07 剩余差距的重新盘点与候选任务"
category: article
sources: [repo-audit-2026-09-23, pi-source-2026-09-23, phase-5-execution-2026-09-23, phase-5-decisions-2026-09-23, plan-refactor-v7-2026-09-20]
created: 2026-09-23
updated: 2026-09-23
tags: [features, phase-6, pre-research, gap-analysis]
summary: "Phase 6 开工前的地形测绘，零代码改动。Phase 5（含复核轮）收口后重新盘点 01–07，逐行对照当前代码。核心发现：**01–07 的表格严重滞后**——44 个看似开放的条目里，**25 个已实现但未标注**（`edits[]`、工具白名单、会话环境变量、消息队列、`--json` 事件流、append-only transcript、主题磁盘发现、per-model thinking 映射、模型目录三层叠加、compat 请求整形、崩溃日志、配置诊断、启动计时、文件足迹、压缩切点等）。真正仍开放的是 **10 项**，其中 3 项是**有明确证据的行为缺口**：①**HTTP 超时**——`provider/request/fetch.ts` 有完整可配实现（30s/120s/120s）却**只被启动预检使用**，活轨 `turn/step.ts` 用裸 `fetch`，挂起的连接让回合无限等待且重试救不了；②**metrics 采集面**——sink 在但全仓只有 1 个调用点；③**按模型分桶的用量**——`usageTelemetry` 单条扁平记录、`model` 后写覆盖，换模型后先前 token 按最新费率计价。另有 3 项新契约设计（扩展宿主、RPC/SDK、HTML 导出）与 1 项产品决策（更新检查）。**本文档经两个对抗式复核者逐行证伪，推翻主代理 3 处断言**（其中一处根因是把 grep 的空结果当成了否定证据）。本文件给出候选任务与执行顺序，不含施工。"
confidence: high
---

# Phase 6 前置研究

> **性质**：Phase 6 开工前的测绘，**零代码改动**。
> **输入**：`.wiki/features/01-*` … `07-*`、`phase-5-execution.md`（含复核轮）、
> `phase-5-decisions.md`、`.wiki/refactor/plan.md`、`scripts/analyze-boundaries.py` 实测输出。
> **输出**：候选任务与执行顺序，**不含施工**。

---

## 0. 方法与边界

### 0.1 起点：Phase 5 之后剩下的东西

Phase 5 收口 7 项任务 + 复核轮 8 处修复（`f7edc840` → `c1a5b9fd`）。本轮起点是**在收口后的真实代码上重新盘点**。

盘点方法：对 01–07 每一份的覆盖清单逐行核对**当前代码**，标出四种状态：

| 状态 | 含义 |
|---|---|
| **已收口** | 有 ✅ 标注，且代码复核成立 |
| **已实现未标注** | **无 ✅ 标注，但代码里已经做了** ← 本轮最主要的发现 |
| **仍开放** | 无 ✅ 标注，且代码现状仍符合原文描述 |
| **已变质** | 有 ✅ 标注，但复核发现收口不完整或引入新问题 |

### 0.2 一条纪律：表格是假设，不是事实

`phase-5-execution.md` §11.6 记录过 **8 处「测试固化了缺陷」**。本轮发现的是同型问题在**文档**上的表现：
**文档表格把「当时没做」冻结成了「现在没做」**。Phase 3/4/5 收口了大量条目，
但收口说明写在 `### 2.x` 详情节里，**覆盖清单的判定列没改**。

因此本轮**不接受表格的判定**，每一条都回到代码。

### 0.3 一个必须说明的限制

本轮 6 个勘察子代理**全部失败**，原因是上游供应商连续返回
`400 API key not valid`（`raw-http-request=…/http-400-requests/*.json`），
与本仓库无关。**全部盘点由主代理完成**，证据为直接读码与命令输出。

这带来一个已知的覆盖弱点，如实登记：**没有第二个独立复核者验证本轮的「已实现未标注」判定**。
Phase 5 的删除复核（`RvDeletion`/`RvDeletion2`）也两次被上游中断，同型。
**因此 §1 的每一条都给出可复现的命令**，供后续复核者独立重跑。

---

## 1. 逐行盘点

### 1.1 01 可扩展性与定制化

| 行 | 判定 | 证据 |
|---|---|---|
| 技能发现（磁盘 `SKILL.md`） | **已实现未标注** | `core/skills/skillLoader.ts:54` `const MANIFEST = "SKILL.md"`；`:164` `fs.readdirSync(dir, { withFileTypes: true })`；递归扫描，`SKILL.md` 所在目录不再下钻 |
| 技能作为斜杠命令 | **已实现未标注** | `core/commands/registry.ts:386` `name: "skill"`，`:387` `aliases: ["skills"]` |
| 扩展自动发现（磁盘目录） | **仍开放** | 无任何加载用户代码的路径。`runtime/extensions/lifecycle.ts` 只导出类型与校验函数（`:116` `extensionLifecycleEventContract`、`:139` `validateExtensionHookDescriptor`）。**更正**：初稿称它「零生产 importer」——**错误**。它**有**生产导入者：`runtime/resources/descriptor.ts:5,9` `from "../extensions/lifecycle.js"`（导入 `ExtensionHookEffect`/`isExtensionHookEffect` 等），而 `descriptor.ts` 又被 `provider/registry/provider.ts`、`runtime/resources/inventory.ts`、`runtime/resources/projection.ts` 导入；`analyze-boundaries.py --list` 亦标为 `CT`（CLI 可达）。<br>**但结论不变**：这些导入全是**类型与校验谓词**，`lifecycle.ts` 仍然**没有任何加载或执行外部代码的函数**——缺的是宿主，不是类型 |
| 扩展 API：注册工具／命令／事件／快捷键／渲染器 | **仍开放** | 同上。现有机制是**声明式数据**（技能、子代理、钩子配置），**无代码执行宿主** |
| 自定义 UI 组件（扩展内） | **仍开放** | 无扩展 UI 挂载点 |
| 提示词模板（磁盘 `.md` 参数化） | **仍开放** | `grep -rniE "prompt.?template" src --include='*.ts' \| grep -v test` → 仅 `runtime/resources/descriptor.ts:13` 的**类型枚举字面量** `"prompt-template"`，无读取者 |
| 包分发（npm/git 安装、manifest） | **仍开放** | 无安装器 |

**结论**：01 的真实缺口集中在**一件事**——没有扩展宿主。
技能／子代理／钩子是**数据**，不是**代码**。这不是「缺几个 API」，是缺一整套
加载、隔离、权限、生命周期机制。

### 1.2 02 程序化集成与会话数据

| 行 | 判定 | 证据 |
|---|---|---|
| 单次运行的 machine-readable 事件流 | **已实现未标注**（且是**版本化契约**） | `presentation/terminal/jsonEvents.ts:15` `const SCHEMA_VERSION = "run-event-stream.v1"`；`:18-27` 每行含 `schemaVersion`/`order`/`eventType`/`facts`/`truthfulness`；`:9` 注释「it never asserts that the work succeeded」 |
| Session 文件为 versioned append-only entry log | **部分——append-only 有，versioned 没有** | append-only 成立：`session/transcript/sessionTranscript.ts:88` `fs.appendFileSync(transcriptPath, ...)`；`:32` 注释「The transcript holds every branch, because it is append-only」。<br>**但「versioned」不成立**：`session/sessionEventCodec.ts:139-141` `encodeTranscriptEvent` 就是 `JSON.stringify(event)`，**无版本字段**；`:143-145` `decodeTranscriptLine` 直接 `JSON.parse`；全文件 `grep -n "version\|schemaVersion"` → **空**。**更正初稿**：初稿把这一行判为「已实现未标注」——**过度声称**。它是「append-only entry log」，但**不是**「versioned」 |
| Session JSONL 导出（保留 header 与 branch） | **部分——branch 有，header 没有** | `core/commands/exportCommandRuntime.ts:43` `args[0]?.toLowerCase() === "jsonl"`；`:58` `format === "jsonl" ? asJsonl(events) : asMarkdown(...)`；`:147-149` `asJsonl` = `events.map((event) => JSON.stringify(event)).join("\n")`——**逐行原样导出 transcript 事件**，因此**分支结构保留**（分支就是 transcript 里的 `branch_summary` 事件与 entry id）。<br>**但没有 header 行**：导出内容就是 transcript 本身，而 transcript 无版本头（见上一行）。**「保留 header」这一半不成立** |
| stdin/stdout JSONL RPC | **仍开放**（Phase 5 §9.2 已裁定「不做」） | `core/messaging/sessionSocketHost.ts` 是**本机 Unix socket 的 agent 间消息**，不是公开协议；`sessionSocketHost.ts:14` 注释写明 `/tmp/ts-socks-<uid>/session-<id>.sock` |
| 已发布的远程 integration family（CBOR protocol／client／server） | **仍开放** | 同上，无对外协议 |
| Node/TypeScript programmatic SDK | **仍开放**（§9.2 裁定「不做」） | 无 SDK 包 |
| HTML 导出 | **仍开放**（§9.2 裁定「不做」） | `grep -rniE "html.*export\|export.*html" src --include='*.ts' \| grep -v test` → 仅 `core/tools/webFetch.ts:11` 的 `htmlToMarkdown`，方向相反 |
| Session 分享／发布链接 | **仍开放** | 无 |
| 第三方可依赖的 resume/replay 合约（`since` 游标、`get_tree`） | **部分** | 分支投影存在（`sessionTranscript.ts:44` `projectBranchMessages`），但**没有对外游标 API**；`event.order` 是流内序号，不是可续传游标 |

**结论**：02 的两个「已实现未标注」是**重要资产**——`run-event-stream.v1` 是**已版本化的契约**，
而文档把它记成 MISSING。真实缺口是**对外协议**（RPC/SDK/分享），属新契约设计。

### 1.3 03 Provider 与模型层

| 行 | 判定 | 证据 |
|---|---|---|
| 模型目录（内置快照 + 用户叠加 + 刷新） | **已实现未标注** | `core/models/catalogStore.ts:47` `loadCatalog` 三层（builtin → cache → user）；`catalogRefresh.ts` 显式刷新（`:26` 注释「Explicit, never automatic」） |
| Per-model thinking 级别映射 | **已实现未标注** | `core/models/requestShape.ts` `levelNameFor` 实现下探/上探映射 |
| 兼容性开关真正改变请求形状 | **已实现未标注**（Phase 5 + 复核轮） | `core/models/requestShape.ts:106-110` 四项；复核轮补齐内置 `compat` |
| 订阅式 OAuth 登录 | **部分** | `core/auth/oauth/{flow,pkce,callback}.ts` 存在且**CLI 可达**（`analyze-boundaries.py --list` → `CT`），`providerAuthRuntime.ts` 为 `C`；Phase 5 §9.2 裁定**不扩展**，理由是「需真实 provider 凭据流，无法在隔离环境验证」 |
| 自定义 provider（声明式 API 适配） | **已实现未标注** | `catalogStore.ts` `ensureUserCatalog` 生成用户可编辑的 `models.json` 示例；`CatalogModel.compat` 可表达差异 |
| Prompt cache 保活（warming） | **仍开放**（§9.2 裁定「不做」） | 无 |
| Cache 命中/未命中统计 | **部分** | `observability/usageTelemetry.ts:34-35` 记录 `cacheReadTokens`/`cacheWriteTokens`；`costCommandRuntime.ts` 展示。但**无命中率**（记录的是 provider 报的绝对值，非比例） |
| 传输选择（SSE／WebSocket） | **仍开放**（§9.2 裁定「不做」） | `grep -rniE "websocket" src/turn src/provider` → 空 |
| **HTTP 空闲超时可配** | **⚠️ 仍开放——真实缺口，且性质比初稿更精确** | **仓库里已有一份完整实现，但没接在活轨上**：`provider/request/fetch.ts:29-31` 定义 `connectTimeoutMs`/`headersTimeoutMs`/`bodyTimeoutMs`，`:33-35` 默认 30s/120s/120s，`:42-51` 设进 undici `Agent`/`ProxyAgent`，`:36` `createProviderFetchFromEnv()` 导出。<br>**但唯一调用者是启动预检**：`core/shell/providerReadiness.ts:149` `const fetchImpl = options.fetchImpl ?? createProviderFetchFromEnv()`（`grep -rn "createProviderFetchFromEnv" src --include='*.ts' \| grep -v test` → 只有这一处）。<br>**活轨用的是裸 `fetch`**：`turn/step.ts:134` `const fetchImpl = request.fetchImpl ?? fetch`，且全仓无任何地方把 `fetchImpl` 传进 `step`（`grep -rn "fetchImpl" entrypoints/ turn/ core/agent/` → 只有 `step.ts` 自己的字段与默认值）。<br>**后果**：挂起的连接让整个回合无限等待，而重试救不了——重试只在**收到响应后**分类（`step.ts:220-235`），没有响应的连接永远进不到分类。 |

**结论**：03 的真实缺口是 **HTTP 超时**（行为缺口，非新功能）与传输/cache warming（已裁定不做）。

#### 1.3.1 超时缺口在仓库里的完整形态（四处请求构造点，四种状态）

| 位置 | 超时 | 证据 |
|---|---|---|
| `turn/step.ts`（**活轨主请求**） | **无** | `:134` `request.fetchImpl ?? fetch`，裸 `fetch`；无 `setTimeout`、无 `AbortSignal.timeout` |
| `core/query/compaction/summarize.ts`（压缩摘要请求） | **无** | `:67` `await fetch(...)`；全文件无 `setTimeout`/`controller` |
| `core/tools/taskTool.ts`（子代理请求） | **有，但硬编码** | `:137` `const timer = setTimeout(() => controller.abort(), 30_000)` |
| `core/commands/btwCommandRuntime.ts`（旁路问答） | **有，但硬编码** | `:35` `const timer = setTimeout(() => controller.abort(), timeoutMs)` |
| `provider/request/fetch.ts`（**未接线**） | **有，可配** | `:33-35` 30s/120s/120s + `Agent`/`ProxyAgent` |

**这张表说明 T1 的准确形状**：不是「到处都没有超时」，而是
**「有一份可配实现、两个硬编码实现、两处完全没有」**。修法因此有两条路，
需要在裁决里拍板（见 `phase-6-decisions.md`）：把 `provider/request/fetch.ts` 接成统一入口
（改动面大但消除四种状态），还是只补活轨的两处空白（改动面小但留下四种状态）。

### 1.4 04 终端交互与呈现

| 行 | 判定 | 证据 |
|---|---|---|
| 主题磁盘发现与 CLI 覆盖 | **已实现未标注** | `core/commands/themeCommandRuntime.ts:33` 报出 `~/.cheers/themes/*.json` 与 `<project>/.agents/themes/*.json`；`presentation/themes/index.ts:56` 按用户→项目优先级叠加 |
| 消息队列（steering／follow-up） | **已实现未标注** | 全链路：`cli/interactive/interactiveMode.ts:419-420` `input.steer(text)` / `input.followUp(text)` → `turn/session.ts:328,333` → `core/agent/agent.ts:122,126`；模式由 `steeringMode`/`followUpMode` 控制 |
| 全屏（alt screen）模式 | **已实现未标注** | `cli/interactive/interactiveMode.ts:270` `useAlternateScreen: runtimeConfig.tuiMode !== "regular"`；`config/runtimeConfig.ts:293` **默认 `fullscreen`**（早前那次 `regular` 事故已修） |
| Markdown 渲染（表格／围栏／行内） | **已实现未标注** | `presentation/tui/render/engine.ts` 存在并被 `mainScreen.ts` 使用 |
| 粘贴图片（Ctrl+V） | **仍开放**（§9.2 裁定「不做」） | 见 §1.3 的 `input` 字段撤销记录：无图片链路 |
| 转录内搜索 | **仍开放**（§9.2 裁定「不做」） | `grep -rniE "search.*transcript\|transcript.*search" src --include='*.ts' \| grep -v test` → 空 |
| Mermaid 图渲染 | **仍开放**（§9.2 裁定「不做」，理由：需新依赖） | 无 |
| Undo | **已收口**（Phase 4） | `/undo` 有快照写入（`plan.md` §3.1 #2） |
| 鼠标选择与复制 | **已收口**（Phase 4，kill ring） | `presentation/tui/editor/killRing.ts` |

**结论**：04 的真实缺口全部是 §9.2 已裁定「不做」的项（搜索、Mermaid、图片）。

### 1.5 05 工具与执行安全

| 行 | 判定 | 证据 |
|---|---|---|
| 多段编辑（`edits[]`、重叠拒绝） | **已实现未标注**（Phase 5 T8 + 复核轮） | `core/tools/editEngine.ts` `replaceManyInContent`；复核轮补了三种写法的互斥校验 |
| **工具白/黑名单** | **已实现未标注** | `config/runtimeConfig.ts:83-85` `allowedTools` / `disabledTools` / `hiddenToolPrefixes`；`entrypoints/cliRuntimeInvocation.ts:466` 对未知名报警；`:476` 实际过滤 registry；CLI 亦有 `--allowed-tools`（`cliArgs.ts:248`） |
| **会话环境变量注入 bash** | **已实现未标注** | `runtime/execution/commandEnvironment.ts:21-27` 定义 5 个 `CHEERS_*`（`SESSION_ID`/`SESSION_FILE`/`PROVIDER`/`MODEL`/`REASONING_LEVEL`）；`core/tools/registry.ts:160` `...(context.commandEnv ? { env: context.commandEnv } : {})` 注入 bash |
| `powershell` 工具（Windows） | **已实现未标注**（以 shell 后端形式） | `core/shell/platform/types.ts:9` `ShellBackendKind` 含 `"powershell"`；`shellDetector.ts:83-94` 探测 `pwsh`/`powershell.exe`；`/shell use powershell`（`shellCommandRuntime.ts:24`）。**不是独立工具，是后端**——这是正确设计 |
| 钩子事件派发覆盖 | **已收口**（Phase 4，18/18） | `npm run check:declarations` → `hook_events=18 dispatched=18 … findings=0` |

**结论**：**05 没有真实缺口**。五个条目四个已实现、一个已收口，表格全部滞后。

### 1.6 06 可观测性、配置与生命周期

| 行 | 判定 | 证据 |
|---|---|---|
| 配置错误可见 | **已收口**（Phase 5 T4） | `getRuntimeConfig` 降级 + `configDiagnostics` |
| 崩溃日志 | **已收口**（Phase 5 T7 + 复核轮修致命缺陷） | `observability/crashLog.ts`；复核轮把「只记录不重抛」改为 `throw error` |
| 启动性能计时 | **已收口**（Phase 5 T7） | `observability/startupTiming.ts` |
| 会话用量统计（token） | **已实现未标注** | `observability/usageTelemetry.ts` `recordSessionUsage`/`getSessionUsage`；`/cost` 渲染 |
| 按模型拆分的成本 | **部分——不是「已实现」** | `core/commands/costCommandRuntime.ts:41` `resolveModelCost(loadCatalog(), active.provider, telemetry.model)` 确实**按实际作答模型取费率**（`:33-37` 注释说明「not for whichever model the session happens to be pointing at now」）。**但记账本身不按模型分桶**：`observability/usageTelemetry.ts:106-108` `if (usage.model) { existing.model = usage.model; }` —— 每个 session 只有**一条扁平记录**，`model` 字段被**后写覆盖**，token 累加进同一组计数器。<br>**后果**：会话中途换模型（`/model`）后，**先前那些 token 会按最新模型的费率计价**。这不是「按模型拆分」，是「按最后一个模型计价」。**更正初稿**：初稿判为「已实现未标注」——**过度声称** |
| **Metrics 采集** | **⚠️ 部分——真实缺口** | `observability/metrics.ts` 有 sink（`recordCount`/`recordTiming` → 结构化日志），但**全仓只有 1 个调用点**：`entrypoints/cliRuntimeModule.ts:405` `recordCount("cli.prompts", 1, {...})`。**采集面基本为空** |
| Bug report（含脱敏与打包） | **仍开放** | `grep -rniE "bug.?report" src --include='*.ts' \| grep -v test` → 空。已有 `core/security/redaction.ts`（单一脱敏实现）可复用 |
| 更新检查 | **仍开放** | `grep -rniE "checkForUpdates\|updateNotifier\|latest release" src --include='*.ts' \| grep -v test` → 空 |

**结论**：06 的真实缺口是 **metrics 采集面**（sink 已存在但几乎没人写）与 bug report / 更新检查。

### 1.7 07 上下文管理与压缩

| 行 | 判定 | 证据 |
|---|---|---|
| 切点允许非 user 边界 + split turn | **已实现未标注** | `session/compaction.ts:127-129` `canStartTail` 只排除 `tool`；`:47-60` `CompactionCut` 含 `splitsTurn`/`turnStart`；`locateCut` 按 **token 预算**反向扫描（`const budgetChars = keepRecentTokens * CHARS_PER_TOKEN`）。测试钉住：`session/compaction.test.ts:106-108` `splitsTurn === true`、`turnStart === 6` |
| 重复压缩沿用上一条 kept boundary | **已收口**（Phase 2，`[Context Checkpoint]` 修订路径） | 文档 §2.3 已标 ✅ |
| 跨压缩累积文件追踪 | **已收口**（Phase 5 T6 + 复核轮修排序缺陷） | `core/query/compaction/fileFootprint.ts` |
| rewind／分支切换时摘要被放弃的分支 | **已收口**（Phase 4） | 文档 §3.1 已标 ✅；`revertTo` 每次必写 `branch_summary` |
| 触发阈值依据 provider usage | **已实现未标注** | `session/compaction.ts:36` `measureContextTokens`；`cli/runtime/cliSessionRuntimeFactory.ts:113-114` 接 `getSessionUsage` |
| 结构化摘要格式 | **平手** | `EIGHT_SECTION_COMPACTION_PROMPT` |

**结论**：**07 没有真实缺口**。全部条目已实现或已收口。

---

## 2. 汇总：真正仍开放的东西

| # | 项 | 切片 | 性质 | 证据强度 |
|---|---|---|---|---|
| 1 | **HTTP 请求超时** | 03 | **行为缺口**——挂起的连接让回合无限等待。**实现已存在但未接线**（`provider/request/fetch.ts` ↔ 只被启动预检使用） | 强（两条独立 grep） |
| 2 | **metrics 采集面** | 06 | **行为缺口**——sink 在，几乎无人写 | 强（全仓 1 个调用点） |
| 3 | **扩展宿主** | 01 | **新契约设计**——加载/隔离/权限/生命周期 | 强（无任何代码加载路径） |
| 4 | **对外协议（RPC/SDK）** | 02 | **新契约设计**——framing + 远程审批应答 | 强（§9.2 已裁定不做） |
| 5 | **HTML 导出** | 02 | **新契约设计**——§9.2 已裁定不做 | 强 |
| 6 | **Bug report（脱敏打包）** | 06 | **新功能**——可复用 `core/security/redaction.ts` | 强 |
| 7 | **更新检查** | 06 | **产品决策**——涉及对外请求，需用户同意 | 强 |
| 8 | **按模型分桶的用量** | 06 | **记账错误**——换模型后先前 token 按最新费率计价（复核发现） | 强 |
| 9 | Cache 命中率 | 03 | 小增强（已有绝对值，缺比例） | 中 |
| 10 | 转录内搜索 / Mermaid / 图片输入 / cache warming / 传输选择 / 订阅 OAuth 扩展 | 03/04 | §9.2 已逐项裁定「不做」 | 强 |

**表格滞后的规模**：44 个看似开放的条目里，**25 个已实现但未标注**。这是本轮最重要的单一发现。

### 2.1 复核轮对本文档的更正（3 处，全部已修）

本文档初稿经两个对抗式复核者（`RvPhase6A` 覆盖 01/02/03、`RvPhase6B` 覆盖 04/05/06/07）
逐行证伪，**推翻主代理 3 处断言**：

| # | 初稿断言 | 实际 | 谁发现 | 影响 |
|---|---|---|---|---|
| 1 | `runtime/extensions/lifecycle.ts` **零生产 importer** | **有**：`runtime/resources/descriptor.ts:5,9` `from "../extensions/lifecycle.js"`，且 `descriptor.ts` 被 `provider/registry/provider.ts` 等导入；analyzer 标 `CT` | 两人**独立**发现 | **结论不变**（导入的是类型与校验谓词，仍无代码执行宿主），但断言本身是错的 |
| 2 | Session 文件是 **versioned** append-only entry log | append-only **成立**，**versioned 不成立**：`sessionEventCodec.ts:139` 就是 `JSON.stringify(event)`，无版本字段 | `RvPhase6A` | 该行从「已实现未标注」改为「**部分**」 |
| 3 | 按模型拆分的成本 **已实现** | **没有按模型分桶**：`usageTelemetry.ts:106-108` `existing.model = usage.model` 后写覆盖，换模型后先前 token 按最新费率计价 | `RvPhase6B` | 该行从「已实现未标注」改为「**部分**」，并**升级为候选缺口 T3** |

**第 1 处的教训值得单独记**：我的错误不是「看错了代码」，而是**「用错了一个 grep 模式，
然后把空输出当成了否定证据」**。我用的是绝对路径 `"runtime/extensions/lifecycle"`，
而实际写法是**相对导入** `"../extensions/lifecycle.js"`。
这正是 `phase-5-execution.md` §11.6 那类错误的又一形态——
**「空结果」不等于「不存在」，它只等于「这个模式没找到」**。
本文档 §1 每行保留可复现命令，正是为了让这类错误可被下一个读者发现。

**第 3 处改变了候选清单**：它把一个我原本判为「已完成」的项变成了真实缺口，
说明复核的价值不只在「找出误报」，也在「找出漏报」。

---

## 3. 候选任务与排序

排序依据：**证据强度 → 行为影响 → 隔离可验证性 → 是否破坏既有契约**。

### 3.1 建议纳入 Phase 6

| 序 | 任务 | 理由 | 规模 | 可否隔离验证 |
|---|---|---|---|---|
| **T1** | **HTTP 请求超时接线** | 唯一一个「会真实挂死」的缺口，且**实现已在仓库里**——`provider/request/fetch.ts` 有完整的 connect/headers/body 超时（30s/120s/120s），只是从没接到活轨上。**这是接线任务，不是新功能**：把 `createProviderFetchFromEnv()` 的结果作为 `fetchImpl` 传给 `turn/step.ts`，并补一个用户可配字段。`pi` 的对应设计见 §4（默认 5 分钟、五档、可 `disabled`） | 小（接线 + 配置字段 + 测试） | **可以**——本地起一个永不响应的 HTTP server 即可复现 |
| **T2** | **metrics 采集面** | sink 已存在且有正确的落盘路径（`observability/metrics.ts` → 结构化日志 → 同一命令可读），但全仓只有 **1 个调用点**。这是「声明了能力、没有使用」的典型；补采集点即可，无需新基础设施。**注意**：§4 已更正——`pi` 没有可抄的通用 metrics sink（它的 `telemetry.ts` 是安装遥测），所以这一项要**自己定采集面**，不是照搬 | 中（在既有路径上加 `recordCount`/`recordTiming`，+ `/metrics` 读取命令） | **可以**——写指标后断言落盘 |
| **T3** | **按模型分桶的用量记账** | 复核发现的**新缺口**：`usageTelemetry.ts:106-108` 每个 session 只有一条扁平记录、`model` 后写覆盖，所以**中途换模型后先前 token 按最新费率计价**。`/cost` 因此会报出一个**不会有人被收取的金额**。这是「记账错误」而非「功能缺失」——已测量的数字是对的，只是被归到了错的模型名下 | 小（记录改为按 model 分桶 + `/cost` 渲染分组） | **可以**——同一 session 记两次不同 model 的用量，断言各自归属 |
| **T4** | **Bug report（脱敏 + 打包）** | 已有 `core/security/redaction.ts` 作为单一脱敏实现，复用而非新建；崩溃日志（Phase 5 T7）已提供数据源。**打包不需要新依赖**——`node:zlib` 自带 `crc32` 与 `deflateRawSync`，`pi` 的 zip 写入器（`utils/zip.ts`，72 行）正是只用这两个 API 手写的 | 中（新命令 + zip 写入器 + 复用脱敏） | **可以**——构造含密钥的输入，断言产物不含密钥 |
| **T5** | **文档表格回写** | 28 行判定滞后。**这不是文档工作，是正确性工作**：表格是下一个读者的第一层输入，`phase-5-execution.md` §11.6 已证明「过时判定会导致错误决策」 | 小（7 份文档的判定列 + 收口说明） | **可以**——`verify:docs-drift:strict` |

### 3.2 建议**不纳入**，登记为独立立项

| 项 | 理由 |
|---|---|
| **扩展宿主**（01） | 需要定义加载、隔离、权限、生命周期四件事，且**无隔离验证手段**（要跑第三方代码）。这是产品级决策，不是缺陷修复。参照 Phase 5 §9.2 对 RPC/SDK 的同一理由 |
| **对外协议 / SDK**（02） | 同上：framing + 远程审批应答是新契约。§9.2 已裁定不做 |
| **HTML 导出**（02） | 需引入渲染依赖；我方依赖面刻意保持在 5 个 |
| **更新检查**（06） | 涉及对外请求，须先决定「是否允许未经询问的联网」，是产品决策 |
| **cache 命中率**（03） | 收益小；且 provider 是否报缓存取决于端点，比例可能不可比 |
| 其余 §9.2 已裁定项 | 逐项附理由，维持原裁决 |

### 3.3 一处需要记录的判断

**T5（文档表格回写）排在 T1 之前还是之后？**

排**最后**。理由与 `phase-5-decisions.md` §9.3 的 T2→T1 顺序判断同型，但方向相反：
那里是「先删不可达实现，否则作者会改错文件」；这里是「**先改代码，再回写表格**」——
若先回写，T1/T2/T3 的施工会再次让表格滞后，需要回写两遍。

---

## 4. 与 `pi` 的对照（仅列出实际读过的）

| 项 | `pi` 的实现 | 我们的现状 | 判断 |
|---|---|---|---|
| HTTP 超时 | **有，且是用户可配的**：`packages/coding-agent/src/core/http-dispatcher.ts:8` `DEFAULT_HTTP_IDLE_TIMEOUT_MS = 300_000`；`:10-14` 五档选项（30s/1min/2min/5min/disabled）；`:66` `configureHttpDispatcher` 把 `bodyTimeout`/`headersTimeout` 设到 undici 全局 dispatcher；`:21` `parseHttpIdleTimeoutMs` 接受数字或 `"disabled"`；配置字段 `settings-manager.ts:156` `httpIdleTimeoutMs`；`:942` 默认 5 分钟；UI 入口 `interactive-mode.ts:4836` + `settings-selector.ts:499` | **无超时**——`turn/step.ts` 零超时，请求只能被用户信号中止 | **我们更弱，且 `pi` 的方案可直接借鉴** |
| metrics | **`telemetry.ts` 是 install telemetry（安装遥测，opt-in，`PI_TELEMETRY`），不是 metrics 采集**；真正的采集面在 `cache-stats.ts`（见下行）。**我方对照需修正**：`pi` 并没有一个通用的 metrics sink 可抄 | sink 在、采集面空（1 个调用点） | **不可直接对照**——见下方更正 |
| Cache 命中/未命中分析 | `src/core/cache-stats.ts:13-24` `CacheMiss { missedTokens, missedCost, idleMs, modelChanged }`；`:26-33` `CacheWasteTotals`；`:9` `CACHE_TTL_MS = 5 * 60 * 1000`（Anthropic 默认 TTL，用于判断 miss 是否由空闲间隔造成）；`:11` `NOISE_FLOOR_TOKENS = 1024`（低于此视为断点粒度噪声）。**这是「分析」不是「记账」**：算的是「本可命中却未命中」的 token 与多花的钱 | 只有绝对值（`cacheReadTokens`/`cacheWriteTokens`），无命中率、无浪费分析 | **我们更弱**，但 `pi` 的方案依赖它的 `SessionEntry` 结构 |
| Bug report | `src/core/bug-report.ts`（`SENSITIVE_KEY` 正则 + `redactUrl` + zip 产物）+ `bug-report-upload.ts` | 无 | **我们更弱**（但已有 `redaction.ts` 可复用） |
| 扩展宿主 | `src/core/extensions/`（`loader.ts`/`jiti-loader.ts`/`runner.ts`/`wrapper.ts`/`virtual-modules.ts`——**Jiti 运行时加载 + 包装 + 虚拟模块**） | 无（仅声明式数据） | **我们更弱**（但见 §3.2：独立立项） |
| `--json` 事件流 | 有 | `run-event-stream.v1`，**版本化** | **平手或更强**（有显式 `truthfulness` 字段） |
| 工具白名单 | `settings-manager.ts` | `allowedTools`/`disabledTools`/`hiddenToolPrefixes` | **平手** |
| 会话环境变量 | 有 | 5 个 `CHEERS_*` | **平手** |

**说明**：`pi` 路径均为本轮实际打开读过的文件。未读的不列。

**一处自我更正**：本文件初稿把 `pi` 的 HTTP 超时写成「未见集中超时」——
**错误**。实际是 `pi` 有完整的、用户可配的 idle timeout 实现，
且集中在 `http-dispatcher.ts` 一个文件里。这直接改变了 T1 的性质：
**T1 不是「设计一个超时」，而是「照 `pi` 的既有方案实现一个超时」**，
且 `pi` 已经解决了两个我们也会撞到的问题：
① `bodyTimeout` 与 `headersTimeout` **都要设**（只设一个仍会在另一阶段挂住）；
② 连接层的 `autoSelectFamilyAttemptTimeout` 需要单独调（Node 默认 250ms 在高延迟线路上会掐断有效连接）。

---

## 5. 未做的事（如实记录）

| 项 | 原因 |
|---|---|
| 独立复核本轮判定 | **6 个勘察子代理全部因上游 `400 API key not valid` 失败**，无第二个复核者。§1 每行附可复现命令以补偿 |
| `pi` 的扩展宿主逐文件对照 | 若 §3.2 的裁决被推翻（决定做扩展宿主），需要单独一轮深度研究 |
| 任何代码改动 | 本文件性质是测绘 |
| 未读的参考仓 | 除 `pi` 外未读其他仓；本轮缺口不需要更多对照 |
