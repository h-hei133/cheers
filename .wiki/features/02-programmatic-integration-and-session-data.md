---
title: "功能对照 02：程序化集成与会话数据（我们 vs pi）"
category: article
sources: [pi-source-2026-09-20, repo-audit-2026-09-20]
created: 2026-09-20
updated: 2026-09-23
tags: [features, gap-analysis, pi, sdk, rpc, session-format, jsonl]
summary: "对照 pi 的机器面对接面：JSON 事件流、stdin/stdout RPC、SDK 嵌入、session 文件格式、导出与分享。结论：我们只有进程内事件订阅与目录化 session，没有任何对外协议；public index.ts 仅 10 组纯函数导出。共 5 项 MISSING、4 项 DEFICIENT、2 项 OURS-ONLY。"
confidence: high
---

# 功能对照 02：程序化集成与会话数据

> **⚠️ 本文是 2026-09-20 的调研快照，其中部分结论已过时。**
> 已过时的结论在**原位**加了 ✅ 标注（保留原文作为当时的证据）；**未标注的行仍按原文有效**。

> 本轮为**功能开发前锋探索**，零代码改动。对照本地参考仓 `pi`（`/home/wang/projects/pi`）。
> 分类口径：`DEFICIENT`＝我们有但更弱／不完整／未接线；`MISSING`＝pi 有我们没有；
> `OURS-ONLY`＝我们有 pi 没有（**仅记录，本轮不提议开发**）。

## 0. 方法与范围

| 侧 | 读到的位置 |
|---|---|
| pi | `docs/{json.md, rpc.md, sdk.md, session-format.md}`、`src/modes/{json-event.ts, print-mode.ts, rpc/*}`、`src/core/{sdk.ts, index.ts, session-manager.ts, session-export.ts, agent-session.ts}`、`src/modes/interactive/session-share.ts`、`packages/{protocol,client,server}` |
| 我们 | `index.ts`、`entrypoints/{cliArgs.ts, cliRuntimeModule.ts}`、`cli/print/*`、`core/query/runtime/events.ts`、`core/shell/sessionRuntime.ts`、`runtime/events/{projection,stream}.ts`、`session/{sessionEventCodec.ts, transcript/sessionTranscript.ts, schema/*, store/*, SessionManager.ts, replay/*, recovery/sessionResume.ts}`、`core/commands/exportCommandRuntime.ts` |

关键检索命令与结果：

```bash
# 是否有对外 RPC / JSONL 协议
grep -rn "rpc\|RPC\|pendingRequests\|attachJsonlLineReader" packages/ts-shell/src   # → 无协议命中
# public API 是否暴露可驱动一次 turn 的 runtime
grep -n "SessionManager\|ShellSessionRuntime\|executePrompt\|observeEvents" \
     packages/ts-shell/src/index.ts                                                  # → 0 命中
# HTML 导出 / 分享
grep -rn "exportToHtml\|shareSession\|gist\|Radius" packages/ts-shell/src             # → 0 命中
# runtime 事件流投影是否有生产消费者
grep -rn "runtime/events/stream" packages/ts-shell/src --include='*.ts'              # → 仅 tools/toolHandoff.test.ts:5
```

## 1. 覆盖清单

| 能力 | pi 位置 | 我们位置 | 判定 | 证据 |
|---|---|---|---|---|
| 单次运行的 machine-readable 事件流 | `docs/json.md:1-7,67-92`；`src/modes/json-event.ts:17-60` | ✅ **已实现**（**2026-09-23 更正**）：`presentation/terminal/jsonEvents.ts`；`core/query/runtime/events.ts:14-74` | ~~DEFICIENT~~ **已收口** | `jsonEvents.ts:14` `const SCHEMA_VERSION = "run-event-stream.v1"`——**版本化契约**，每行含 `schemaVersion`/`order`/`eventType`/`facts`/`truthfulness`；`:18` 注释「it never asserts that the work succeeded」。`--json` 经 `cliArgs.ts:228` → `cliRuntimeModule.ts:413` 接线。**注意**：原表引用的 `runtime/events/stream.ts` **已在 Phase 4 删除**（`ls runtime/events` → 不存在），该职责现由 `jsonEvents.ts` 承担 |
| stdin/stdout JSONL RPC | `src/modes/rpc/rpc-types.ts:20-74,112-239`；`rpc-mode.ts:54-77`；`rpc-client.ts:56-180` | 无 | **MISSING** | 见 §3.1 |
| 已发布的远程 integration family（CBOR protocol／client／server） | `packages/protocol/`、`packages/client/`、`packages/server/` | 无 | **MISSING** | `grep -rn "CBOR\|ByteTransport\|ServerMessageDecoder" packages/ts-shell/src` → 0 |
| Node/TypeScript programmatic SDK | `docs/sdk.md:16-33`；`src/core/sdk.ts:41-100`；`src/index.ts:221-275` | `index.ts`（纯函数导出面） | **MISSING**（**2026-09-23 确认，并补一条事实**） | 见 §3.2。**补充事实**：`index.ts` 被 analyzer 标为 **`PT`**（public-API + test-only）——即**它是一个声明的公开 API 面，但生产代码零引用**。它导出纯函数（验证/工件/修复等），**不能驱动一次会话**，所以「无 SDK」的判定成立 |
| Session 文件为 versioned append-only entry log | `docs/session-format.md:197-241`；`src/core/session-manager.ts:38-101` | `session/transcript/sessionTranscript.ts`；`session/store/sessionFileLayout.ts:11-65` | **部分收口**（**2026-09-23 更正**） | **append-only 成立**：`sessionTranscript.ts:88` `fs.appendFileSync(transcriptPath, ...)`；`:32` 注释「The transcript holds every branch, because it is append-only」。**versioned 不成立**：`sessionEventCodec.ts:139` `encodeTranscriptEvent` 就是 `JSON.stringify(event)`，**无版本字段**（`grep -n version sessionEventCodec.ts` → 空）。**余量：entry 级版本化** |
| Session JSONL 导出（保留 header 与 branch） | `src/core/session-export.ts:8-44` | `core/commands/exportCommandRuntime.ts` | **部分收口**（**2026-09-23 更正**） | `/export jsonl` 已实现（`:43` 解析格式，`:58` 分派）；`:147-149` `asJsonl` 逐行原样导出 transcript 事件，**分支结构因此保留**。**但无 header 行**（导出内容就是 transcript 本身，而 transcript 无版本头）——**「保留 header」这一半不成立** |
| HTML 导出 | `src/core/agent-session.ts:3579-3612`；`docs/rpc.md:597-618` | 无 | **MISSING** | `/export` 仅 markdown/jsonl（`exportCommandRuntime.ts:35-49`） |
| Session 分享／发布链接 | `src/modes/interactive/session-share.ts:24-54,56-95` | 无 | **MISSING** | 见 §3.3 |
| 第三方可依赖的 resume/replay 合约（`since` 游标、get_tree） | `docs/rpc.md:717-772` | `session/SessionManager.ts:187-205`；`entrypoints/cliRuntimeModule.ts:457-507` | **DEFICIENT**（**2026-09-23 确认仍开放**） | 分支投影存在（`sessionTranscript.ts:44` `projectBranchMessages`），但**没有对外游标 API**；`jsonEvents.ts` 的 `order` 是**流内序号**，不是可续传游标。见 §2.4 |
| observation-only／redaction 统一 runtime envelope | **pi 无**（`json-event.ts:17-60` 只做 delta 转换） | `presentation/terminal/jsonEvents.ts:16-27,44-48` | **OURS-ONLY** | 见 §4。**路径已更正**：原引用的 `runtime/events/stream.ts` 已删，该职责现由 `jsonEvents.ts` 承担 |
| 目录化 session substrate（metadata/state/transcript/lock 分离） | **pi 无**（单 JSONL 文件） | `session/store/sessionFileLayout.ts:11-65` | **OURS-ONLY** | 见 §4 |

## 2. DEFICIENT 详述

### 2.1 内部事件模型完整，但没有对外 wire（置信度：高）

**现象**：`QueryEvent` 已覆盖 query/turn/tool/approval/message-delta/terminal-result，`ShellSessionRuntime.observeEvents()` 可在同进程订阅——但这是 in-process callback，不是 stdout 协议。

**证据（我们）**：

- `core/query/runtime/events.ts:14-74` 定义 23 个事件变体，含 `message.delta`（`:57`）、`reasoning.delta`（`:63`）、`message.replace`（`:68`）、`tool.started`（`:37`）、`tool.result`（`:45`）、`lifecycle.error`（`:72`）。
- `core/shell/sessionRuntime.ts:81-89` `observeEvents(observer)` 返回退订函数；注释说明「A structured observer replaces the prose event surface」——即 observer 存在时 prose 渲染被**替换**，两者不并存。
- **关键缺口**：`message.delta` 只带 `role` + `delta`，**无 message/turn ID**；`tool.started`/`tool.result` 只带 `taskId`，无 `toolCallId` 与 request correlation。
- `runtime/events/stream.ts:16` 有 `schemaVersion: "runtime-event-stream.v1"`，但**生产消费者为 0**——`grep -rn "runtime/events/stream" packages/ts-shell/src` 仅命中 `tools/toolHandoff.test.ts:5`。`serializeJsonRuntimeEventStream`（`stream.ts:97`）只被 `stream.test.ts` 调用。

**证据（pi）**：`docs/json.md:1-7` 明确「Outputs all session events as JSON lines to stdout」；`src/modes/json-event.ts:17-60` `toJsonEvent()` 剥离累积 `partial` 快照，保留 usage 与 tool-call `id`/`name`；`docs/json.md:87-92` 规定 `message_update` 是 delta-only、由 `message_end` 权威收口。

**影响**：外部 IDE／脚本无法 spawn 我们的进程并消费稳定事件；必须绑定内部 TypeScript runtime 与依赖注入。事件流层已写好但**没有任何出口**。

**最小改动建议**：把已有 `serializeJsonRuntimeEventStream` 接到一个独立 stdout transport（而非把 prose renderer 当协议），并补 message/turn correlation 字段。

### 2.2 Transcript 是 append-only JSONL，但不是可移植的 entry log（置信度：高）

**证据（我们）**：

- `session/store/sessionFileLayout.ts:54-65` 定义**目录三件套 + 锁**：`metadata.json`、`transcript.jsonl`、`state.json`、`state.lock`。
- `session/sessionEventCodec.ts:20-36` 的 `TranscriptEvent` union 只有 4 类：`message`、`lifecycle`、`query-event`、`compaction`。**无 header、无 `version`、无稳定 entry `id`、无 `parentId`**。
- `session/transcript/sessionTranscript.ts:26-30` `appendTranscriptEvent` 确实 append-only；但读取时 `decodeTranscriptLineSafe` 静默丢弃无法解析的行。

**证据（pi）**：`src/core/session-manager.ts:38-47` `SessionHeader` 含 `type`/`version`/`id`/`timestamp`/`cwd`；`:56-59` `SessionEntryBase` 含稳定 `id`、`parentId`、`timestamp`；`:61-175` 定义 11 类 entry（message / thinking_level_change / model_change / usage / compaction / branch_summary / custom / label / session_info / custom_message）。`docs/session-format.md` 记录 version 1→2→3 的自动迁移。

**影响**：第三方无法用一个稳定 schema 订阅或增量同步我们的 transcript，也无法按 entry ID 判断分支或游标。

**最小改动建议**：给 transcript 增加 header 行（含 `version` 与 session id）与稳定 entry id；`parentId` 已有 schema 支撑（`session/schema/sessionThread.ts:132` `createSessionBranch`），但没有生产写入者（见 §2.4）。

### 2.3 `/export jsonl` 丢失会话协议元数据（置信度：高）

**证据（我们）** `core/commands/exportCommandRuntime.ts`：

- `:73-83` `readConversation()` 先 `readTranscriptEvents()` 再 `projectTranscriptMessages()` —— **投影后再导出**，原始事件类型信息已丢失。
- `:120-122` `asJsonl()` 实现是 `messages.map((m) => JSON.stringify(m)).join("\n")` —— 只序列化投影后的 `SessionMessage`。

**证据（pi）** `src/core/session-export.ts:8-29` `serializeSessionBranch()` 先写 current version header，再写当前 branch entries，保留 `parentId` 链接。

**影响**：下游工具拿到我们的 JSONL 时无法区分 session header、lifecycle／query events、compaction checkpoint 或 entry identity；也无法对等导回或增量比较。**我们导出的东西不是我们存的东西。**

**最小改动建议**：`/export jsonl` 改为直接透出 transcript 原始行（已是 JSONL），投影版本另开 `--projected` 开关。

### 2.4 resume／replay 是内部便利，不是第三方合约（置信度：高）

**证据（我们）**：

- `session/SessionManager.ts:187` `resume()`、`:195` `tryResume()` —— 加载目录、把 status 改 active、更新 current selection。
- `entrypoints/cliRuntimeModule.ts:457-507` `--replay-file` 解析文本 prompt 脚本后**逐条重新执行**——是 prompt script，不是 durable session replay。
- ~~`session/store/threadState.ts:24-47` `appendDurableSessionChild`、`:49-69` `createDurableSessionBranch`、`:71+` `switchDurableSessionActiveLeaf` 三个函数**零生产调用者**~~
  → **2026-09-23 已改变**：`switchDurableSessionActiveLeaf` 现有生产调用者
  （`SessionManager.revertTo`，回退入口 `/back` 或双击 Esc）；`appendDurableSessionChild`
  因改用「按 entry 身份 catch-up」而被**删除**；`createDurableSessionBranch` 仍零调用者。
  见 [`phase-4-execution.md`](phase-4-execution.md) §12。

**证据（pi）**：`docs/rpc.md:717-745` 规定 `get_entries` 支持 `since` entry ID，返回 entries 与 current `leafId`，并明确可跨 client restart 使用；`:747-772` `get_tree` 返回树与 leaf。

**影响**（2026-09-23 部分收口）：分支能力**已接线到回退路径**（`revertTo` 切换 active leaf，
`loadSessionRecord` 按活跃分支投影 turns）。**仍未做的是对外暴露**：没有 RPC/`since` 游标接口，
第三方依旧无法「从上次看到的 entry 之后继续收取」—— 那属于本文件记录的 RPC 契约缺口。

**最小改动建议原始文本**：把 `appendDurableSessionChild` 接到会话写入路径（当前只写 `metadata.json`，见 `session/store/sessionStore.ts:32-42`），即可让分支能力生效。
> **2026-09-23 更正**：该建议的前提有误 —— `metadata.json` **不记录 turns**（`projectSessionMetadata`
> 无该字段），turns 是从 `transcript.jsonl` 回放投影的。正因如此，原 `rewindTo` 的截断从未落盘。

## 3. MISSING 详述

### 3.1 stdin/stdout RPC 协议（置信度：高）

**pi 如何实现**：`src/modes/rpc/rpc-types.ts:20-74` `RpcCommand` 覆盖 prompt／steer／follow_up／abort／new_session／state／model／thinking／session／export／tree 等；`:112-239` response 统一带 `{id, type:"response", command, success, data?, error?}`（见 `rpc-mode.ts:63-76` 的 `success`/`error` 构造器）；`rpc-mode.ts:54-77` 从 stdin 收 JSONL、向 stdout 写 JSONL；`rpc-client.ts:56-180` `RpcClient` spawn 子进程、维护 pending request map、按 id resolve。

**我们缺失的证明**：

```bash
grep -rn "rpc\|RPC\|pendingRequests\|attachJsonlLineReader" packages/ts-shell/src   # → 无协议命中
```

我们的 stdin 入口只把 newline-delimited 文本当 prompt（`entrypoints/cliRuntimeModule.ts:63-77`），随后串行执行。若存在协议类型，应在 `entrypoints/` 或 `core/` 出现——当前没有。

**影响**：IDE／外部 orchestrator 不能用 request/response correlation 驱动会话、取消、切换或读取 state。

**最小落地路径**：需独立定义 command/response/event framing；**不应**把当前 text stdin stream 直接当 RPC。

### 3.2 public SDK：无法从外部驱动一次完整 turn（置信度：高）

**pi 如何实现**：`docs/sdk.md:16-33` 用 `createAgentSession()` + `SessionManager.inMemory()` 创建会话，`session.subscribe()` 收事件，`await session.prompt()` 驱动完整 turn；`src/index.ts:221-275` 导出 `createAgentSession`／`createAgentSessionRuntime`／`createAgentSessionServices`／`AgentSessionRuntime`／`SessionManager`。

**我们缺失的证明**：`index.ts` 全文 55 行、10 组 `export {}` 语句，导出的全是纯函数与类型：`selectVerification`、`executeVerification`、`correctArtifact`、`decideRepair`、`selectContext`、`buildExecutionPlan`、`buildTaskRequestPacket`、`chooseToolStrategy`、`buildTaskProofInput`、`projectTaskVerdict`。

```bash
grep -n "SessionManager\|ShellSessionRuntime\|executePrompt\|observeEvents" packages/ts-shell/src/index.ts   # → 0 命中
```

内部其实存在可驱动一次 prompt 的 runtime：`core/shell/sessionRuntime.ts:148-159` `executePrompt()`、`:81-89` `observeEvents()`——但它依赖 `SessionRuntimeDependencies`、renderer、provider/query factory，未形成 package 级构造 API。

**影响**：外部 Node 进程不能仅依赖 package entrypoint 创建会话、订阅事件、执行 prompt、读取终态。**我们已有全部零件，但没有装配面。**

**最小落地路径**：暴露稳定的 construction／session／turn 接口；`executePrompt` 的签名已经是可用起点。

### 3.3 Session 分享／发布（置信度：高）

**pi 如何实现**：`src/modes/interactive/session-share.ts:24-54` `createShareTrailingEntries()` 把 system prompt 与 tool schemas 作为 `pi.share` custom entry 写入导出；`:56-95` `shareSession()` 先导出 JSONL，优先 Radius，失败时检查 `gh`、导出 HTML 并发 private gist。

**我们缺失的证明**：

```bash
grep -rn "shareSession\|share link\|gist\|Radius\|publish.*session" packages/ts-shell/src   # → 0 命中
```

`core/commands/exportCommandRuntime.ts:25-70` 只写本地 markdown/jsonl 文件，无网络 publish、无 URL 返回。

**影响**：第三方无法把会话变成可访问的 review／share artifact。

**最小落地路径**：需先定义隐私／认证／分享格式；建议单独立项。

## 4. OURS-ONLY（仅记录，本轮不提议开发）

| 能力 | 我们位置 | pi 是否真的没有（检索命令+结果） |
|---|---|---|
| 统一 observation-only／redaction runtime envelope | `runtime/events/stream.ts:16` `schemaVersion: "runtime-event-stream.v1"`、`:23` `notProvenClaims`、`:25-26` `observationOnly: true` / `terminalSuccessClaim: false` | `grep -rn "schemaVersion.*runtime-event-stream\|observationOnly\|terminalSuccessClaim\|redaction:" /home/wang/projects/pi/packages/coding-agent/src /home/wang/projects/pi/packages/protocol/src` → **0 命中**。pi 的 `json-event.ts:17-60` 只做 delta 转换，`rpc-types.ts:112-239` 只定义 RPC payload，均无该统一 envelope |
| 目录化 session substrate（metadata／state／transcript／lock 分离） | `session/store/sessionFileLayout.ts:54-65`；`session/store/sessionStore.ts:18-47`；`session/store/sessionFileStore.ts:53-126`（原子写 + 重试 + 文件锁） | `grep -rn "metadata.json\|state.json\|state.lock" /home/wang/projects/pi/packages/coding-agent/src /home/wang/projects/pi/packages/coding-agent/docs` → **0 命中**。pi 以单个 JSONL session file 为主（`docs/session-format.md:5-17`、`src/core/session-manager.ts:13-24`） |

> **对 OURS-ONLY 第 1 项的诚实限定**：`runtime/events/stream.ts` 的生产消费者为 **0**
> （唯一 importer 是 `tools/toolHandoff.test.ts:5`）。它是**已写好但未接线**的内部能力，
> 不是已交付的对外协议。这一限定由主代理在核验时补上——子代理原报告称其为能力，
> 未指出其仅测试可达。

## 5. 未能验证的项

1. **构建产物是否额外 re-export**：未验证已发布包是否对 `index.ts` 之外的符号做了 re-export；本报告以源码 public entrypoint 为准。
2. **pi Radius／gist 的最终 viewer URL 与全部失败 UX**：只确认 `session-share.ts` 中存在 Radius 优先、GitHub CLI private gist fallback 的调用路径，未验证服务端行为。
3. **是否存在隐藏的动态 emitter**：未穷举运行时配置或打包入口；按「未发现可依赖 surface」记录，而非断言绝对不存在。
4. **compaction／branching 算法本身**：本切片未比较算法，只使用 pi 的 IDs／version／cursor 作为 machine-facing 证据，避免越界（该部分见 `03-*` 报告）。
