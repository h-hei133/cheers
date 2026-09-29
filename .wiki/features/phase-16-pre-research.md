# Phase 16 预研究：从 12 号文档的 14 个候选中选出 10 项并定死做法（2026-09-29）

> 输入：[`12-gap-and-debt-research-2.md`](12-gap-and-debt-research-2.md) §9 的候选表（16-A…16-N，14 项）。
> 本文**不重新做差距盘点**，而是逐项回答「参考实现到底怎么做、我们的缺口精确在哪、最小正确改法是什么」。
> **零代码改动**，只产出设计依据。
>
> 裁决见 [`phase-16-decisions.md`](phase-16-decisions.md)。

---

## 0. 执行方式

### 0.1 三路只读子代理（并发上限 3）

| 路 | 子代理 | 负责项 | 结果 |
|---|---|---|---|
| A | `P16aMemoryCompact` | 16-A 记忆注入链、16-B `/compact` 合并与钩子 | ✅ 完成（首次因 TLS 失败，恢复后补出完整 brief） |
| B | `P16bBrowserProvider` | 16-D 浏览器假成功、16-E 双栈与治理、16-K/L provider 保真 | ✅ 完成 |
| C | `P16cTuiSession` | 16-C regular 主屏、16-F 每帧成本、16-G 会话锁、16-H `/todo` | ✅ 完成 |

**事故（第 7 次记录）**：`vsllm/gemini-3.8-flash-api` 端点本轮出现
`unknown certificate verification error`（TLS），三次派遣被中断；维护者手工恢复后
三路均续跑至完成。另有 `P16cTuiSessionCmds` 一次 TLS 失败、重派后成功。

### 0.2 主代理亲验的纪律

**所有头条数字与断言由主代理独立复算**，不采信子代理。本轮亲验手段：

| 手段 | 实例 |
|---|---|
| 模块可达图（ESM import + BFS） | 确认 `projectMemoryStore` 生产装配点为 0 |
| `grep` 全仓反查 | `projectMemoryStore:` 非测试命中仅 1 处（且是日志字符串） |
| 读参考实现源码 | pi `tui-main-screen.ts` 全文、`agent-session.ts:2394-2510`、`openai-completions.ts`、`google-shared.ts`、opencode `flock.ts`、pi `examples/extensions/todo.ts` |
| 官方文档（本地 claudecode 为早期版本） | Claude Code 现行 auto memory 规格（见 §1.1） |
| 读我方实现 | 全部涉及文件的逐行核对 |

**本轮共核实 2 条子代理断言为「方向对但结论需修正」**，并**推翻主代理自己在 12 号文档中的 1 条建议**（§4.2）。见 §6。

---

## 1. 16-A：项目记忆注入链

### 1.1 参考实现：Claude Code 是真正的先例，pi 没有

**pi**：`grep` 全仓 `auto-memory|MEMORY.md` **零命中**——pi **没有**自主记忆子系统。
它只有静态指令上下文（`AGENTS.md`/`CLAUDE.md`）的祖先目录加载与注入
（`core/resource-loader.ts:180-220`、`core/system-prompt.ts:71-165`）。
**故 16-A 不能以 pi 为依据。**

**Claude Code**（现行官方规格，本地 `source-claudecode` 是早期版本，已按维护者指示核对线上文档）：

| 维度 | 规格 |
|---|---|
| 位置 | `~/.claude/projects/<project>/memory/`，`<project>` 由 **git 仓库**派生 → 同仓所有 worktree 与子目录**共享一份** |
| 结构 | `MEMORY.md` 索引（每行一条）+ 每个记忆一个 topic 文件（`user_role.md`、`feedback_testing.md`…） |
| 注入 | **每次会话开头加载 `MEMORY.md` 前 200 行或 25KB**（先到者为准）；超限内容**不加载** |
| 惰性 | topic 文件**不在启动时加载**，模型按需用自己的文件工具读取 |
| 分类 | frontmatter `type`: `user` / `feedback` / `project` / `reference` |
| 开关 | 默认开；`autoMemoryEnabled`（settings）或 `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` 关闭 |
| 可配置根 | `autoMemoryDirectory`（须绝对路径或以 `~/` 开头） |
| 保留 | 记忆文件**豁免** `cleanupPeriodDays` 的会话清理 |
| 与压缩的关系 | `/compact` 后**项目根 CLAUDE.md 会被重读并重新注入**；嵌套与 path-scoped 规则按需重载 |
| 写限 | 写入经 `MEMORY.md` 限长检查；超限时**写仍成功**但返回错误要求重写索引 |

**关键**：Claude Code 的模型是**「索引常驻 + 主题文件惰性」**，且**每次会话自动注入**。

### 1.2 我们的缺口（主代理复验）

| 环节 | 位置 | 事实 |
|---|---|---|
| 注入实现完整 | `memory/projectMemoryFutureTurnInjection.ts:36` | 预算、合并策略、质量门、冲突检测、去重**全部已实现** |
| 注入点存在 | `core/shell/sessionFutureTurnProjection.ts:101` | `memoryStore: input.deps.projectMemoryStore` |
| 注入被调用 | `core/shell/sessionRuntime.ts:268` | `buildPromptWithFutureTurnInjections({ deps: this.deps, … })` |
| **依赖从未提供** | `cli/runtime/cliSessionRuntimeFactory.ts:302-304` | 构造 `ShellSessionRuntime` 时**没有** `projectMemoryStore` |
| **唯一构造器无生产调用者** | `memory/projectMemoryLocalStore.ts:37` | `createProjectMemoryLocalStore` 的生产调用者 **= 0** |
| 反查证据 | — | `grep -rn "projectMemoryStore:" --include=*.ts .` 非测试命中 **1 处**，且是 `startupWarmContextBuilder.ts:99` 的**日志字符串** |

**后果链**：`deps.projectMemoryStore === undefined` ⇒ 计划器立即以 `memory-store-missing` 退出
⇒ `/memory use` 无法产出注入文本 ⇒ `/memory save` 报
`Explicit local memory store root is required.` ⇒ 实机 `/memory` 显示
`Persistence: not enabled` / `Store mode: disabled`。

**同时**：`CommandContext.projectMemoryStore` 也是 `undefined`（同一根因），
所以命令侧与 turn 侧**共用同一个缺口**——**一处修复同时点亮两处**。

### 1.3 与参考实现的**设计分歧**（必须裁决，不能默认照抄）

我们的注入文本（`memory/projectMemoryInjectedContextFormatter.ts:7-12,30-33`）**自述**：

```
<project_memory_context>
Source: explicit /memory use
Injection: ⟨id⟩
…
- Automatic memory injection: no.
- Startup auto-load: no.
```

即我们当前设计是**「显式按需注入」**（用户跑 `/memory use` 才注入本轮），
而 Claude Code 是**「索引常驻自动注入」**。**两者不是同一个产品决定。**

**注入状态机**（`memory/projectMemoryInjectionState.ts:94-155`）已支持两者：
`markPending` → `markInjected` → `markConsumed`，且 `markPending` 会把未消费的上一条
记为 `supersededInjectionIds` 并产出 `pending-memory-injection-superseded` 警告
——**说明实现本来预期「每轮自动产生一条 pending」**。这是分支点。

**默认状态 store 是进程级单例**（`projectMemoryInjectionState.ts:193`），
可安全缺省，无需装配。

### 1.4 结论

- **必须提供**：`projectMemoryStore`（记录存储，落盘）。
- **可缺省**：`projectMemoryInjectionStateStore`（有进程级默认）。
- **存储根**：我方已有**同型先例**`core/subagents/agentMemoryManager.ts:22-36`，
  三档 `user`（`resolveUserDataFile("agent-memory/<name>")`）/ `project`（`<root>/.agents/memory/<name>`）
  / `local`（`<root>/.agents/memory-local/<name>`）。
- **待裁决**：注入模式（显式 vs 常驻）、存储根（项目 `.agents/memory` vs 用户数据目录）。

---

## 2. 16-B：`/compact` 合并与压缩钩子

### 2.1 参考实现：pi 是**单一入口**

pi `modes/interactive/interactive-mode.ts:3181-3185`：

```ts
if (text === "/compact" || text.startsWith("/compact ")) {
  const customInstructions = text.startsWith("/compact ") ? text.slice(9).trim() : undefined;
  this.editor.setText("");
  await this.handleCompactCommand(customInstructions);
```

→ `core/agent-session.ts:2394+` 的**唯一手动入口** `compact()`：

1. `:2406` `await this.abort()` —— 先中断当前操作；
2. `:2409` emit `{ type: "compaction_start", reason: "manual" }`；
3. `:2426-2442` 派发 `session_before_compact`，载荷带 **`reason: "manual"`、`preparation`、
   `branchEntries`、`customInstructions`、`willRetry: false`、`signal`**；
   **扩展返回 `cancel` 则抛 `Compaction cancelled`**；返回 `compaction` 则用扩展内容；
4. `:2460-2475` 否则调 **`_runDefaultCompaction(…, "manual")`**，
   其注释写明 *"Shared default summary generator, also used by automatic compaction"*；
5. 结束后经 `sessionManager.appendCompaction(...)` 写入会话分支。

**即 pi 的自动与手动压缩共用同一个底层引擎，且手动路径的钩子与自动路径同构、可取消。**

### 2.2 我们的缺口（主代理复验）

| 事实 | 位置 |
|---|---|
| 交互路径走**真引擎** | `cli/interactive/interactiveCommandRouter.ts:98-104` → `sessionRuntime.compactHistory` → `core/shell/compaction.ts:97` |
| 命令路径走**报告** | `core/commands/compactCommandRuntime.ts:39` → `runCompactCommand`，契约 `compactCommandContract.ts:48` 声明 `readonly previewOnly: true` |
| 真引擎**不派发钩子** | `core/shell/compaction.ts` 全文 135 行，**零** hook 引用；而 `turn/session.ts:273-292` 对自动压缩派发 `PreCompact`/`PostCompact` |
| `reason:"manual"` 是死值 | `session/compaction.ts:81` 定义三值，生产代码**零**传 `"manual"` |
| **真实持久化只有一处** | `SessionManager.appendCompactionEntry`，由两条路径分别调用：`core/shell/compaction.ts:120`（手动）与 `cli/runtime/cliSessionRuntimeFactory.ts:391` 的 `onCompact`（自动） |
| 命令路径另有一处**影子写入** | `compactCommandRuntime.ts:41-60` 写 `updateLatestCompactCheckpoint` + `markCompactCheckpointPendingInjection`，**宣称**有一个待注入 checkpoint |

**影子写入是真缺陷**：真压缩的持久化是**会话分支里的 `CompactionEntry`**（`session/store/sessionFileStore.ts`），
而命令路径往 `compactInjectionStateStore` 里写一个"待注入"标记——**两处各自声称自己才是压缩的产物**。

### 2.3 环依赖核实（主代理亲验）

`core/hooks/hookDispatcher.ts` 的 import 只有：`observability/structuredLogger`、
`./types`、`./trust`、`node:child_process`、`sandbox/osSandbox`。
`core/shell/compaction.ts` 的 import 只有：`observability/usageTelemetry`、`../../session/compaction`、
`session/schema/sessionMessage`。
**两侧无回边** ⇒ 在 `compaction.ts` 引入 dispatcher **不产生环**，`verify:import-cycles` 可保持绿。

### 2.4 结论

自动与手动**共用** `appendCompactionEntry` 是既成事实，所以「合并」不是重构而是**删掉分叉**：
让 `/compact`（裸形式与带指令形式）走真引擎，`preview`/`render`/`json` 降为**只读子形式**，
并在真引擎里补 `PreCompact`（可阻断）/`PostCompact`，把 `reason` 透传下去。

---

## 3. 16-D / 16-E：浏览器假成功与出站治理

### 3.1 参考实现：两份实现**都**在不可用时抛错，从不编造

| 参考 | 位置 | 行为 |
|---|---|---|
| `playwright-mcp` | `packages/playwright-core/src/tools/mcp/browserFactory.ts:68078-68084` | 抛 `Browser "<channel>" is not installed. Run \`npx @playwright/mcp install-browser <channel>\` to install` |
| 同上（缺系统库） | `:68024-68026` | 抛 `Missing system dependencies required to run browser… sudo npx playwright install-deps` |
| `stagehand` | `packages/sdk-ts/src/browser/localBrowser.ts:279-281` | 抛 `Chrome installation not found; set CHROME_PATH` |
| 同上（启动了但没就绪） | `:487-493` | 抛 `Chrome exited before its debugging port was ready with <detail>` |

**没有任何一条返回"看似成功"的结果。**

### 3.2 我们的缺口（主代理复验，探针）

`browser/sessionManager.ts` 六处编造：`:128`（`Simulated Session: <url>`）、
`:261`、`:278`、`:295`、`:312`、`:328`；`getOrCreatePage()` 的 `catch`（`:79-90`）
**只清字段、不留原因**。`core/tools/browserToolUnified.ts` 全部包成 `approvedResult`。

**探针实测**（`PLAYWRIGHT_BROWSERS_PATH=/nonexistent`）：

```
open    -> success:true  "…(Title: \"Simulated Session: https://example.com\")"
click   -> success:true  "Simulated click on element 'e1' (selector: e1)."
close   -> success:true  "Browser session closed and resources released."
```

即**两个截然不同的世界返回同一个 `success: true`**。

**现成可复用**：`browser/playwrightRuntime.ts` **已经**计算
`PwRuntimeStatus`（`status: "ready"|"package-missing"|"binary-missing"|"disabled"|"failed"`、
`reasonCode: PwFailureCode`、`dependency`、`executableSource`、`reason`）
——**不需要发明第四套词汇**，把失败原因接出来即可。

### 3.3 16-E：**主代理推翻了 12 号文档自己的建议**

12 号文档 §2.3 原建议：「模型侧 `browser` 工具改为经 `/browser` 同一条受控执行路径」。
本轮二次核实证明**该方向不可行**：

| 证据 | 位置 | 事实 |
|---|---|---|
| 默认零执行 | `browser/cliExecutorInjection.ts:49-61` | 无 manifest 环境变量时返回 `status: "disabled"`、`reason: "No CLI browser local fixture manifest was provided."` |
| 只吃夹具 URL | `browser/playwrightLocalExecutor.ts:48-55` | `navigate` 非 `local-fixture://` 一律 `blocked-external-url` |
| 默认执行器是空操作 | `browser/executor.ts:49-58` | `NOOP_BROWSER_EXECUTOR` 返回 `blocked` |
| 治理链带 `local-fixture` 模式 | `browser/cliExecutionBridge.ts:100-160` | `createBrowserLocalExecutionAuthority({ mode: "local-fixture" })`、`allowedOrigins: []` |

⇒ **那 155 个模块是「受治理的夹具/证据框架」**（为评测与可复现证据服务，默认关闭），
**不是用户可用的浏览器**。产品里**唯一真能浏览的实现就是 `sessionManager.ts`**。

所以 16-E 的正确形态是**给真实路径补治理**，而非把它接到一个不能浏览的栈上。
12 号文档 §2.3 已按此**就地更正**（2026-09-29）。

### 3.4 出站规则现状与参考取向

| 问题 | 我方现状 | 参考 |
|---|---|---|
| 允许清单原语 | `browser/networkAllowlist.ts:43` `createBrowserNetworkAllowlist`、`:112` `decideBrowserNetworkAllowlist`、`:240` `isPrivateNetworkHost` | — |
| 共享判定 | `core/security/egressGuard.ts:130` `blockedHostReason`，被 `webFetch.ts:133` 与 `networkAllowlist.ts:1` 引用 | — |
| **模型浏览器路径** | **零调用**（`grep` 证明） | — |
| loopback 默认 | 工具描述 `browserToolUnified.ts:21` **主动宣传**可开 localhost | `playwright-mcp` 默认允许（`--allowed-origins` 可限）；`stagehand` 默认允许并用于本地开发 |
| 元数据端点 | 未拦 | 两者都未默认拦 loopback 族 |

**注意（2026-09-29 按维护者质疑更正）**：参考实现**默认允许 loopback**，
我们的 `web_fetch` 默认**拒绝**——但这不是「两个实现不一致」的缺陷，
而是**两个工具的设计意图不同**：

| 工具 | 立场 | 原文 |
|---|---|---|
| `web_fetch` | 只做公网 | `webFetch.ts:135` *"This tool reaches the public web only."* |
| `browser` | 本职含本地 | `browserToolUnified.ts:13` *"open URLs (**including localhost**)"* |

**并且该守卫不构成安全边界**（实测）：`bash` **完全无出站限制**
（`grep blockedHostReason core/tools/registry.ts` 零命中），
且 **OS 沙箱默认关闭**（探针：`sandbox plan state: off`；`osSandbox.ts:259`
`if (rules.enabled !== true) return { state: "off" }`，本工作区 `readSandboxRules` 返回 `{}`；
只有显式开沙箱**且**无域名允许清单时才加 `--unshare-net`，`:294`）。
⇒ agent 今天就能 `curl localhost`。
**故 loopback 裁决为默认放行**，见裁决文档 §2 16-E 第 7 条。

---

## 4. 16-K/L：provider 流内错误与协议保真

### 4.1 流内错误帧（主代理探针复验）

**探针**：把 `data: {"error":{"message":"upstream exploded","type":"server_error"}}`
夹在两个正常增量之间喂给 `readCompletionStream`：

```
fragments: [{"kind":"text","text":"Hel"},{"kind":"text","text":"lo"}]
```

⇒ **"Hello" 被当作正常完整回答**。根因：`turn/completion.ts:115-124` 的 `DeltaChunk`
**没有 `error` 字段**，`absorb`（`:325-345`）只读 `choices`。

**参考**：pi `packages/ai/src/api/openai-completions.ts:693-695`
`throw new Error(output.errorMessage || "Provider returned an error stop reason")`。

### 4.2 停因映射（主代理逐行读码）

pi `openai-completions.ts:1554-1575`：

```ts
case "content_filter":
  return { stopReason: "error", errorMessage: "Provider finish_reason: content_filter" };
case "network_error":
  return { stopReason: "error", errorMessage: "Provider finish_reason: network_error" };
default:
  return { stopReason: "error", errorMessage: `Provider finish_reason: ${reason}` };
```

pi `google-shared.ts:440-468` 把 16 个安全/过滤原因
（`SAFETY`/`BLOCKLIST`/`PROHIBITED_CONTENT`/`SPII`/`IMAGE_*`/`RECITATION`/`OTHER`/…）
**全部映射为 `"error"`**，并以 `never` 穷尽检查强制新增枚举必须被处理。

**我方两处都抹平**：`provider/endpoints/googleWire.ts:187-191` 把非 `MAX_TOKENS`
一律归 `"stop"`；`turn/step.ts:608-611` 的 `stopReasonOf` 同样只认 `"length"`。

**我方词汇已就绪**（这是关键，改动比看起来小）：
`core/agent/state.ts:3` 已有 `AgentStopReason = "stop" | "length" | "error" | "aborted"`；
`core/agent/loop.ts:278` **已把 `"error"` 当作终态**（发出 `turn_end` + `agent_end` 后 return）。
⇒ 只需让映射产出 `"error"`，**终止行为已有**。

**pi 的映射是按 API 值而非字面量**：`openai-completions.ts:578` 是
`mapStopReason(choice.finish_reason)`——**API 联合类型**，不是字符串比较。
故「pi 也字面量比较，所以按字面量抄是忠实的」**不成立**；
穷尽检查才是其忠实性的来源。

### 4.3 次要缺陷（子代理产出，主代理读码确认）

| 项 | 位置 | 事实 |
|---|---|---|
| Google 尾帧丢失 | `googleWire.ts:258-315` | 只在 `findEventBoundary` 命中 `\n\n`/`\r\n\r\n`/`\r\r` 时解析，**EOF 残留 buffer 不处理**；而 `turn/completion.ts:284-287` **有**尾处理——两处不一致 |
| Bedrock 丢图片 | `bedrockConverse.ts:140-142` | `textOf()` 只取 `block.type === "text"`；同仓 `anthropicMessages.ts:264-275` 对同一结构**正确**展开图片块 |
| Bedrock 无 thinking | `bedrockConverse.ts:209` | 仅用 `thinkingLevelName` **抑制 temperature**，从不下发 `additionalModelRequestFields.thinking` |
| 次要调用缺 `supportsTemperature` | `core/query/compaction/summarize.ts:122-128`、`provider/request/completion.ts:79-88` | 都没传；而 `turn/step.ts:303` 传了 ⇒ 对拒绝 temperature 的推理模型，**压缩请求会 400** |

---

## 5. 16-C / 16-F / 16-G / 16-H

### 5.1 16-C `regular` 主屏（主代理读过 pi 全文）

**(a) 参考实现的状态模型** —— `packages/tui/src/tui-main-screen.ts`：

| 字段 | 位置 | 作用 |
|---|---|---|
| `TuiMainScreenRenderState` | `:111-121` | `previousLines`、`previousWidth/Height`、`cursorRow`、**`hardwareCursorRow`**、**`maxLinesRendered`**、**`previousViewportTop`** |
| `captureRenderState()` / `restoreRenderState()` | `:135-145` / `:147-158` | 显式存取，**含把图片行替换成空串**（`isImageLine(line) ? "" : line`） |
| `resetRenderState()` | `:160-166` | 独立的真正重置路径 |
| 使用处 | `interactive-mode.ts:860` / `:879` | 模式切换时 capture ⇒ `previousUi.stop({ preserveScreen: true })` ⇒ 新建 ⇒ restore |

**(b) pi 的核心不变量（主代理逐段读 `doRender()`）**：
逐行比对 `oldLine !== newLine` 求 `firstChanged`/`lastChanged`（`:365-385`），
**对可见行原地重写**；只有当 **`firstChanged < prevViewportTop`（`:436`）** 时才整屏重绘
（注释：*"Differential rendering can only touch what was actually visible."*）。
即 **pi 从不把「已写过」当不可变**——它维护的是**视口锚点 + 硬件光标行**，据此改写任意**可见**行。

**(c) DSR**：pi **从不**逐帧查询光标位置（`\x1b[6n`）；靠内部记账维护 `hardwareCursorRow`。
我方 `mainScreen.ts` 头部注释所说「DSR 每帧一次往返」在**两侧都不成立**——
真正的理由是**不需要**，不是**太贵**。这是一处**注释与事实错位**。

**(d) 我方两个缺陷**（主代理探针）：

```
f1 (first paint)   : "\r\x1b[2Khel\r\n\r\x1b[2K> prompt\r\n\x1b[2Kstatus"
f2 (row grew)      : "\x1b[1A\r\x1b[2K> prompt\r\n\x1b[2Kstatus"     ← 没有 "hello world"
after suspend      : "…\x1b[2Kline one\r\n\x1b[2Kline two\r\n…"     ← 整份 transcript 重复
```

根因：`mainScreen.ts:114` `if (content.length <= alreadyWritten) return;`
（行数未增即整段跳过）；`engine.ts:243-251` `suspend()` 销毁并重建 painter。

### 5.1b 新发现：render 缓存**先于**折叠失效（主代理探针）

**判定**：**DEFECTIVE（CONFIRMED，探针）**——不在 12 号文档内，本轮新查出。

`container.ts:120` 的 `rowsFor` 只对 `block.finalized === true` 的块使用缓存，
而缓存键是 `width` + `colorRevision` + `imageProtocol`——**不含任何内容或折叠状态**。
两处因此漏失效：

| 现场 | 位置 | 事实 |
|---|---|---|
| 折叠 | `setCollapsed`（`container.ts:77-81`）确实 `cache.delete(block)`，但**只有当块已经进过缓存**才有效 | — |
| **探针实测** | — | 一个 `finalized: true` 的 20 行块，`setCollapsed(block, true)` **之后**行数仍是 **21**，`render()` 前几行仍是 `["line 0","line 1","line 2"]` ⇒ **折叠完全没有生效** |
| **原地改文本** | `cli/interactive/turnSink.ts:124` | `this.lastNotice.block.text = text;` —— 改的是 **`finalized: true`** 的块（`turnSink.ts:129` 建块时即 `finalized`），`onChange()` 请求重绘后**仍从缓存取旧行** |
| 探针实测 | — | `notice` 块文本由 `"x"` 改为 400 个字符后，`rowCount(80)` **仍是 11**；把同内容的块设为 `finalized: false` 绕过缓存后变为 **6** ⇒ **证明是缓存导致** |

**根因**：`TurnSink.notify` 的「合并同一 tag 的通知」路径（`turnSink.ts:122-127`）
直接改字段而不经 container，所以 container 无从失效。

**与 16-F 的交互**：16-F 计划再加一层**行数缓存**，与本缺陷**同键**。
若不先修本项，行数缓存会让问题**倍增**（缓存套缓存）。
故 16-F 的正确形态是：**内容或折叠状态变化必须经由一个会失效缓存的入口**，
而不是给一个已经会返回陈旧值的缓存再加一层。

**修复方向**：把 `block.text`/`block.collapsed`/`block.status` 的写入收敛到
container 上的方法（`setText`/`setCollapsed`/`setStatus`），或在缓存键里带上
一个**由 container 维护的块版本号**；
`TurnSink`/`ToolCards` 一律经该入口写入。
**撤销验证**：折叠后 `rowCount` 必须下降；同一 tag 的第二条通知必须渲染出新文本。

---

### 5.2 16-F 每帧三遍全文档

主代理实测（宽 100、视口 40）：

| 总块数 | ms/帧 |
|---|---|
| 500 | 1.63 |
| 2,000 | 4.53 |
| 8,000 | 20.09 |
| **20,000** | **48.82** |

三遍来源（主代理 `grep` 确认）：`pane.ts:52` `rowCount`、`pane.ts:57` `render`、
`view.ts:85` `documentRows`。而 `documentRows` **只在 `mainScreen` 存在时被读**
（`engine.ts:293`）——备用屏模式下**算完即丢**。

`container.ts:120` 的 `rowsFor` **已有**按 `width` + `colorRevision` + `imageProtocol` 的
块级 memo；缺的是**块级行数缓存**与**按视口裁剪块**。

参考：pi `components/scroll-view.ts:186-218` 维护 `contentHeight`/`currentViewportHeight`/`currentScrollTop`；
`layout.ts:330-378` 的 `paintBox` 只在 `[firstRow, lastRow)` 内合成。

### 5.3 16-G 会话锁

| 参考 | 证据 |
|---|---|
| `pi` **用 `proper-lockfile`** | `packages/coding-agent/package.json:66` 依赖 `4.1.2`；`core/auth-storage.ts:76,128`、`core/settings-manager.ts:248`、`core/trust-manager.ts:146` 实际调用 |
| `opencode` 自建 flock | `packages/core/src/util/flock.ts`：默认 `staleMs: 60_000`、`timeoutMs: 5*60_000`；`meta.json` 记 `{ token, pid, hostname, createdAt }`；用原子 breaker 目录防并发夺取 |
| **我方同例** | `browser/receipt/lock.ts:140-160` 已带 `expiresAt`/`ownerId`/`lockId`，读时判 `stale`/`active` |

我方缺口：`session/store/sessionFileStore.ts:53-90` 的 `withFileLock` 用
`openSync(lockPath, "wx")`、超时 1200ms 抛错、**无陈旧判定、无清理**。
**影响面**：`withSessionStateLock` 是 `writeSessionState` 的唯一入口，
故陈旧锁会让该会话**所有状态写入**持续失败。

### 5.4 16-H `/todo`

**参考（子代理产出，主代理读码确认）**：pi 的 todo **是扩展**
（`examples/extensions/todo.ts`，非核心），其头部注释即设计声明：

> *"State is stored in tool result details (not external files), which allows proper branching —
> when you branch, the todo state is automatically correct for that point in history."*

实现：`let todos: Todo[] = []`（`:109-110`，**也是内存态**），
但每次 `session_start`/`session_tree` 事件调 `reconstructState(ctx)`（`:119-135`），
**扫描 `ctx.sessionManager.getBranch()` 里 `toolName === "todo"` 的 `toolResult` 的 `details`，按序重放**。

**这是关键**：pi 的持久化**不在外部文件**，而在**工具结果自带的 details**里，
所以分支/回退时状态**自动正确**。

**我方现状**：`core/commands/todoCommandRuntime.ts:9-10` 模块级单例；
`core/tools/todoTool.ts` 复用同一函数 ⇒ 模型与用户共用进程内存；**不落盘**。
且 `cli/interactive/sessionFacts.ts:75`、`ambientFacts.ts:19` 读 `getSessionTodos()` 供状态条。

**我方缺的通道**（主代理核实）：`tool.result` 事件（`core/query/runtime/events.ts:86-95`）
**不携带 `metadata`**，而 `ToolExecutionResult` 有 `metadata`
（`tools/types.ts:44-50`）。⇒ 若要照 pi 的做法，**需要新增一条传递通道**，不是「已具备」。

---

## 6. 被修正与被推翻的断言（留档）

| # | 断言 | 来源 | 主代理核实 | 结论 |
|---|---|---|---|---|
| 1 | 「模型侧 `browser` 工具改为经 `/browser` 同一条受控路径」 | **主代理自己在 12 号文档 §2.3** | `/browser` 默认 `status:"disabled"`（无 manifest 环境变量），且即便开启只接受 `local-fixture://`；默认执行器是 `NOOP` | **推翻**。12 号文档已就地更正；正确形态是给真实路径补治理 |
| 2 | 「pi 的 todo 状态持久化应学着写进会话状态快照」 | 子代理 fixShape（隐含） | pi 明确**不落外部文件**，靠 tool-result details + 分支重放 | **修正**：写快照**不是**分支正确的；照 pi 需要「工具结果携带可重放状态」 |
| 3 | 「pi 也按字面量比较 finish_reason，所以按字面量抄是忠实的」 | 子代理 refApproach（隐含） | pi `:578` 传的是**API 联合类型**给 `mapStopReason`；忠实性来自穷尽检查 | **修正**：不学字面量，学**穷尽默认分支** |
| 4 | 子代理称「`mainScreen.ts` 的 DSR 注释成立（每帧往返）」 | — | pi 根本不查 DSR；我方也不查 | **修正**：注释理由错，真实理由是「不需要」 |
| 5 | 子代理称「`BrowserExecutor` 在生产无真实实现」 | `P16bBrowserProvider` | 属实（默认 `NOOP`，真实实现只在夹具/外部 runner 形态） | **对**，保留 |
| 6 | 子代理称「pi/opencode 用 `proper-lockfile`」 | `P16cTuiSession` | pi **确实**用（依赖 + 4 处调用）；opencode 是**自建 flock**，非 proper-lockfile | **半对**：pi 是，opencode 不是；已按实情拆分记录 |

---

## 7. 候选裁剪：14 → 10

12 号文档 §9 列出 14 项。按「缺陷严重度 × 依赖 × 体量平衡」裁剪：

**纳入 Phase 16（10 项）**：

| 项 | 标题 | 严重度 | 依据节 |
|---|---|---|---|
| 16-A | 项目记忆注入链接通 | P0 接线 | §1 |
| 16-D | 浏览器假成功改为真实失败 | P0 欺骗 | §3.2 |
| 16-E | 浏览器出站治理 + 修正不实注释 | P0 安全 | §3.3/§3.4 |
| 16-B | `/compact` 合并到真引擎 + 压缩钩子 | P1 语义分裂 | §2 |
| 16-I | `bridgeSafe` 接线或删除 + `/statusline` `/back` 参数 | P1 声明不符 | §8 |
| 16-K | provider 流内错误 + 停因映射 + 协议保真 | P1 错误保真 | §4 |
| 16-G | 会话锁陈旧回收 | P1 可用性 | §5.3 |
| 16-C | `regular` 主屏记账重写 | P1 结构性 | §5.1 |
| 16-F | 每帧 O(N) 与 `documentRows` 惰性化 | P2 性能 | §5.2 |
| 16-H | `/todo` 可重放持久化 | P2 状态丢失 | §5.4 |

**移出（Phase 17 或独立裁决）**：

| 项 | 为何移出 |
|---|---|
| 16-J 死代码清理 | 是**债务**不是缺陷；且需逐条闭包核实，与「企业级生产代码」的本轮主题弱相关 |
| 16-L 的 Bedrock 专属部分 | 无可用账号端到端验证（与 Phase 15 对 M4/M5 的既有结论一致）；其**不依赖账号**的部分（Google 尾帧、次要模型 temperature）已并入 16-K |
| 16-M `NO_COLOR`/truecolor/`"stream"` | P3，且属「补标准支持」而非修缺陷 |
| 16-N 代码围栏语法着色 | P3 增强，参考侧有 56 令牌表可照抄，体量不小，适合作独立阶段 |

---

## 8. 16-I 的补充核实

`bridgeSafe`（`core/commands/types.ts:153`）在 `registry.ts` 声明 30+ 次，
除声明处**零消费者**（`grep` 确认）。`/permissions` 声明 `bridgeSafe: true`，
实机却得 `Outcome: blocked` / `Reason: This shell action is interactive-only.`
（`cliRuntimeModule.ts:325`）。

**子代理给出的判据**（`P16cTuiSessionCmds` 未返回，由 `P16cTuiSession` 与我复核）：
`entrypoints/cliPermissionModule.ts` 的 `runCliPermissionCommand` **存在且可用**，
故「非交互支持」对 `manage-permissions` 是**可行的**，不是不可能。

`/statusline` 与 `/back`：`entrypoints/slashCommandRegistry.ts:61-75` 把它们放进 `PICKER_ONLY`
（只进帮助与补全，不进派发注册表），而 `picker/registry.ts:101-106` 的 `opensPicker`
只对**不含空白**的行生效 ⇒ 带参数的行必然落到 `routeSlashCommand` 的未知命令分支。
`statusline` 的 `argumentHint` 是 **`"use <preset|item...>"`**，即**帮助文本在教用户带参数**。

---

## 9. 下一步

`phase-16-decisions.md` 将对上述 10 项逐条裁决（做/不做/形态/顺序），
并给出**每项的撤销验证口**与**分波执行序**。
