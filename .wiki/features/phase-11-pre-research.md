---
title: "Phase 11 前置研究"
summary: "Phase 11 收口 08 与 11 两份文档里仍未完成的项目。本轮最重要的产出不是「要做哪些」，而是**推翻了 5 处旧记录对参考实现的引用**——其中 3 处把参考项目里的「示例扩展」或「进程组管理」当成了产品设计。范围：P0 三项 + 08 §6 的 T2–T18 + 11 §5 的 14 项，去重后 16 项候选，另 2 项待维护者裁决。"
---

# Phase 11 前置研究

> **本文件的纪律**：每条断言附可复现的核实方式。旧文档（08、11）的说法**只作待验证线索**。
> 本轮抓到 **5 处旧记录不实**，其中 3 处会**直接导致照错的对象施工**——这是本文件的主要价值。

## 0. 范围是怎么来的

**维护者指示**：「继续根据 08 和 11 文档中未完成的任务规划 Phase 11」。

两份文档的未完成项**有重叠**（11 的 §5 建议顺序表本身就是 08 §6 的重排）。去重口径：

- 08 §6 的 **T1–T18** 是权威工作清单。
- 11 §5 的 14 项**逐条对回 08 的编号**；11 新增的 3 项（§3.1 流内 error、§3.2 冷启动漏算、§3.3 `lsp` 死参数）作为**独立条目**并入。
- 11 已明确**证伪**的 D6 **不再纳入**。
- 11 已标记**已完成**的 P0-A **不再纳入**（本轮复核确认已完成，见 §2.1）。

| 来源 | 条目 | 本轮状态 |
|---|---|---|
| 08 §6 | T1 P0-A | **已完成**（复核确认） |
| 08 §6 | T2 P0-B | 开放，**需裁决** |
| 08 §6 | T3 P0-C | 开放，**确认** |
| 08 §6 | T4–T13 | 开放，逐项复核 |
| 08 §6 | T14–T18 | 开放，**需裁决** |
| 11 §3 | 流内 error / 冷启动漏算 / `lsp` 死参数 | 开放，**全部确认** |

### 0.1 执行方式与子代理事故（如实记录）

**5 个子代理全部完成**，并发**全程未超过 3**（符合维护者「同时运行限制最高 3 个」）：

| # | 子代理 | 任务 | 结果 |
|---|---|---|---|
| 1 | `S1Subagent` | pi 子代理端到端机制 | ✅ 12m10s |
| 2 | `S2Context` | pi 上下文核算与 cache 统计 | ✅ 11m11s |
| 3 | `S3Perms` | Claude Code 权限规则引擎 | ✅ 12m54s |
| 4 | `S4Exec` | 后台执行 + 未变更文件去重 | ✅ 4m21s |
| 5 | `S5Provider` | Anthropic 协议细节 + 重试分类 | ✅ 3m32s |

**本轮无 TLS 失败**（上一轮 6 次派遣 5 次失败），端点恢复。**但所有子代理结论仍由主代理逐条亲验**——
本轮因此发现 3 处子代理结论**与旧文档冲突**（见 §1），这正是亲验的价值。

### 0.2 主代理亲验的方法

- **实机复现**：D12（静默改错位置）、D9（交替循环不触发）、§3.2（工具 schema 字符数）用 `npx tsx` 实跑。
- **参考侧逐行读**：所有引用的 `path:line` 均由主代理亲自打开确认，不转述子代理。
- **推翻优先于确认**：本轮 5 处更正中有 3 处是**先怀疑、后实测**发现的。

---

## 1. 本轮对旧记录的 5 处更正（**这是本文件最重要的部分**）

| # | 旧记录怎么说 | 实测 | 影响 |
|---|---|---|---|
| **C1** | 11 §4.3：pi 的子代理「把自己的 CLI 作为子进程拉起」，**建议照此形状** | pi 的子代理**不在核心里**——`packages/coding-agent/src/core/tools/` 只有 `bash/edit/find/grep/ls/read/write`，**无 subagent**。它在 `examples/extensions/subagent/index.ts:461`，是**示例扩展**。而 Claude Code（`tools/AgentTool/runAgent.ts:748` `for await (... of query({...}))`）与 opencode（`packages/opencode/src/tool/task.ts`）都是**进程内** | **照 11 的建议施工会照错对象**。见 §4.2 |
| **C2** | 08 `M2`：pi `bash.ts:98` `detached` 是**后台执行**的对照 | `detached: process.platform !== "win32"` 且**从不 `unref()`**，紧接着 `await waitForChildProcess(child)`（`bash.ts:132`）。它调 `setsid()` 建进程组，目的是 `process.kill(-pid, "SIGKILL")` 杀整棵树（`utils/shell.ts:237`）。**是进程组管理，不是后台执行** | 后台执行的对照应改为 **Claude Code**（`run_in_background` + `TaskOutput` + `TaskStop`）。见 §4.4 |
| **C3** | 08 `M9`：指令文件 `@import` 的参考是 **pi resource-loader** | pi 的 `resource-loader.ts` **没有任何 `@` 导入展开**。真正的实现在 **gemini-cli** `packages/core/src/utils/memoryImportProcessor.ts`：`maxDepth: 5`、循环导入状态、**刻意不用正则**（`findImports` 用 `indexOf` 手扫，并跳过代码块区域） | 参考对象错了。见 §5.5 |
| **C4** | 08 `D9` / T8：Doom Loop 交替检测，**未给参考** | **pi 没有任何 doom loop 检测器**（全仓 grep `doomLoop\|repeatCount` → 0）。真正的参考是 **gemini-cli** `packages/core/src/services/loopDetectionService.ts:312-347`：**按循环长度 k=1..5 逐一比对**，阈值 5 次 | 参考对象缺失。见 §4.3 |
| **C5** | 08 `D7`：CJK token 低估是缺口（隐含「参考实现处理了」） | pi **同样没有 CJK 特判**——`estimate.ts:38-40` 就是 `Math.ceil(text.length / 4)`，与我们一样是**扁平字符除法**。pi 唯一的内容感知是**图片**（`ESTIMATED_IMAGE_CHARS = 4800`） | 「CJK 低估」**不是**我们相对参考的缺口；我们的**真缺口是系统提示与工具 schema 完全不计入**。见 §5.1 |

**另有两处事实性补充（不是更正，是旧记录没写）**：

- **`cheers.json` 里含外部项目名**：`"skills": { "directory": ".codex/skills" }`（`cheers.json:14`、`.agents/settings.json:14`）。
  这违反 `AGENTS.md`「避免外部项目名出现在产品代码/文件名/公开运行时字段」。且**该路径不存在**
  （`.codex/` 下只有 `agents/`、`prompts/`、`*.sqlite`，无 `skills/`）。因两文件均**无读者**，当前无害，但属该裁决的一部分。
- **压缩预留量**：我们 `DEFAULT_RESERVE_TOKENS = 8000`（`session/context.ts:5`），pi 是 `reserveTokens: 16384`
  （`compaction.ts:150`）。**形状相同**（都是 `contextWindow - reserve`，`compaction.ts:117` 对 pi `:291`），只是取值不同。**不是缺口**，记录备查。

---

## 2. 三项 P0

### 2.1 P0-A `daemonEnabled` —— **已完成，复核确认**

`grep -rn 'daemonEnabled' packages/ts-shell/src --include=*.ts` → **0 命中**。
随 Rust 执行面整条删除（不是 08 建议的「落回本地」，是更强的方案）。

### 2.2 P0-B `cheers.json` / `.agents/settings.json` 不被读取 —— **确认，且不是 3 行修复**

**实测**：

| 事实 | 证据 |
|---|---|
| 两份文件**逐字节相同** | `diff -q cheers.json .agents/settings.json` → 无输出 |
| 候选路径**不含** `cheers.json` | `runtimeConfig.ts:543-550` 只有 `resolveUserDataFile("config.json")` 与 `path.join(rootDir, ".cheers.json")`（**带点**） |
| 是**另一套 schema** | `"$schema": "https://cheers.dev/schemas/settings.v1.json"`，含 `mcpServers`/`skills`/`permissions.allowRules`/`tui`——`RuntimeConfigFile` **没有**这些键 |
| `maxTurns` **嵌在 `model` 下** | `cheers.json:11` `"maxTurns": 30` 在 `model` 内，顶层不存在 |
| **零读者** | `grep -rn 'settings.v1\|readSettings\|loadSettings'` → 仅 `globMatch.ts:79` 一条无关注释 |
| 含**外部项目名**且路径不存在 | `"directory": ".codex/skills"`；`.codex/skills` 不存在 |

**08 把它写成「运行时配置放错文件名，3 行修复」——这不成立**，因为它是**另一套 schema**。
三个选项：**(a)** 实现 `settings.v1` 读取器；**(b)** 删除两份文件；**(c)** 标记为草稿。
**推荐 (b)**（理由见裁决文件）。**需维护者裁决。**

### 2.3 P0-C `/model refresh` 抹掉能力声明 —— **确认**

`dedupeModels`（`catalog.ts:534-537`）仍是 `byId.set(model.id, model)`——`Map.set` 是**整体替换**：

```ts
function dedupeModels(models: readonly CatalogModel[]): CatalogModel[] {
  const byId = new Map<string, CatalogModel>();
  for (const model of models) byId.set(model.id, model);
  return [...byId.values()];
}
```

刷新补丁只投影 6 个字段（`catalogRefresh.ts:79-100`），于是 `compat`/`promptCache`/`vision` **丢失**。
11 §1.3 已实测 `developer→system`、`max_completion_tokens→max_tokens`、`vision:true→false`。**本轮复核代码未变。**

---

## 3. provider 层

### 3.1 D1 `classifyProviderFailure` 是死代码 —— **确认**

`provider.ts:240-272` 定义 18 类失败；`grep -rln 'classifyProviderFailure' --include=*.ts | grep -v test`
→ **只有它自己那一个文件**。活轨（`turn/step.ts:307-330`）把 401/403/400/429/500 **全压成一句**
`Provider HTTP ${status}: ${detail.slice(0,200)}`。

**参考做法**（pi `utils/retry.ts:7-22` 与 `provider-retry.ts:24-36`）是**分类与策略分离**：

```ts
const NON_RETRYABLE_PROVIDER_LIMIT_ERROR_PATTERN = buildProviderErrorPattern([
  "GoUsageLimitError", "FreeUsageLimitError", "Monthly usage limit reached",
  "available balance", "insufficient_quota", "out of budget", "quota exceeded", "billing",
]);
```
且 `x-should-retry` 头优先于状态码（`provider-retry.ts:28-30`）——**服务端能直接否决重试**。

### 3.2 D2 Anthropic 缺 `budget_tokens` —— **确认**

我们 `anthropicMessages.ts:114-115`：`body.thinking = { type: "enabled" }`。
pi（`anthropic-messages.ts:1181-1186`）：
```ts
params.thinking = { type: "enabled", budget_tokens: options.thinkingBudgetTokens || 1024, display };
```
且**新模型走另一条分支**（`:1162-1186`）：`supportsMidConvoEffort` 或 `forceAdaptiveThinking` 时发
`{ type: "adaptive", display, block_binding: { prefix_mismatch_behavior: "drop_block" } }` + `output_config.effort`。

**`[INFERENCE]`**：无 Anthropic 账号，400 未端到端验证。

### 3.3 D3 `thinkingSignature` 被丢弃 —— **确认，且是本组最危险的一项**

`grep -c 'signature' anthropicMessages.ts` → **0**。

pi 是**两半设计**（缺任一半都会出问题）：
1. **捕获**：`content_block_start` 取 `content_block.signature`（`:646`），`signature_delta` 累加（`:715-719`）。
2. **回传 + 无签名降级**（`:1337-1362`）：有签名发 `{type:"thinking", thinking, signature}`；
   **无签名降级为 `{type:"text", text}`**，注释写明「e.g. from aborted stream」。
   还有 `allowEmptySignature` 的模型例外分支。

**为什么最危险**：子代理 `S5Provider` 的结论是——其余四项（缺 `budget_tokens`、temperature 不当、
流内错误未处理）都会**响亮报错**（HTTP 400/500 或抛异常），而签名处理错误会让
**被中断的思考内容静默变成用户可见的正文**，或整块丢失，**不抛任何错**。这与本仓库反复强调的
「不得把失败伪装成成功态」直接冲突。**`[INFERENCE]`**：无账号，未端到端验证。

### 3.4 D4 无条件发送 `temperature` —— **确认**

`openaiCompatible.ts:60` 无条件发 `temperature: input.temperature`；
`turn/step.ts:231` 默认 `?? 0.7`；`requestShape` **无 temperature 维度**。

pi（`anthropic-messages.ts:1113-1120`）三个条件同时成立才发：
```ts
if (options?.temperature !== undefined && !options?.thinkingEnabled &&
    model.compat?.supportsMidConvoEffort !== true && compat.supportsTemperature) {
```
注释原文：`Temperature is incompatible with extended thinking and unsupported on Claude Opus 4.7+.`
即 **`thinkingEnabled` 为真时也必须省略**——不只是「按模型能力门控」。

### 3.5 D8 重试退避无抖动 —— **确认；但 11 的「存疑」理由需要更正**

**确认无抖动**：`retry.ts` 的 `retryDelayMs` 给 `2000, 4000, 8000, 16000, 32000`，**无 `Math.random`**。

pi 的公式（`provider-retry.ts:66`，主代理亲验）：
```ts
const exponentialDelay = Math.min(0.5 * 2 ** retryIndex, 8) * 1000;
return exponentialDelay * (1 - Math.random() * 0.25);
```

**11 §6.5 说「若一回合只发一个请求、无并发扇出，则惊群不可能发生」——这个推理方向错了。**
惊群（thundering herd）指**多个独立进程**在服务端故障后**同时**重试，不是单进程内的并发。
我们的 CLI 是每个用户一个进程，固定退避意味着**所有客户端在同一毫秒醒来**。

**主代理复核了「是否存在进程内并发 provider 请求」**（11 未查清的那一问）：
- `core/agent/tools.ts:377` 确有 `Promise.all` 并行执行工具批次；
- **但** `:196-200` 的 `forcedSequential` 是**按批次**判定的——只要批次里**有任何一个** `executionMode: "sequential"` 的工具，**整批串行**；
- `SEQUENTIAL_TOOLS = new Set(["bash","write","edit","task","browser"])`（`turn/session.ts:128`），
  而 `task` **在其中**。
- 结论：**进程内确有并行网络工具**（`web_fetch`/`web_search` 走 `fetch`，`webSearch.ts:81,138`），
  但它们**不走 provider 重试路径**（`retryDelayMs` 只被 `turn/step.ts:334` 与 `core/agent/loop.ts:138` 调用）。
  **故进程内 provider 请求是串行的；jitter 的价值在跨进程。**

**结论**：jitter **不是照搬**，它解决一个真实问题（多客户端同步重试），但**收益随用户数增长**，
单机单会话下不可观测。**列为 P2**，裁决时说明这一取舍。

---

## 4. 工具与执行

### 4.1 D12 编辑唯一性 —— **确认，缺口精确在单条路径（已实机复现）**

**实测输出**（`replaceInContent`，文本出现两次，不传 `replaceAll`）：
```
success: true  strategy: exact
alpha changed: true    beta also changed: false    occurrences changed: 1
```
**静默改错位置，`success: true`，无任何提示。**

| 路径 | 行为 |
|---|---|
| `replaceInContent`（**默认**，模型实际走的） | **只改第一处，成功返回** |
| `replaceInContent` + `{replaceAll:true}` | 两处都改（`exact-all`） |
| `replaceManyInContent`（多段） | **`success: false`**，报 `edits[0] and edits[1] overlap` |

**参考（两者都拒绝）**：
- pi `edit-diff.ts:328-331`：`if (occurrences > 1) throw getDuplicateError(...)`，**无条件拒绝**，
  文案 `Found N occurrences of the text in ${path}. The text must be unique. Please provide more context to make it unique.`
- Claude Code `FileEditTool.ts:331-343`：`if (matches > 1 && !replace_all)` → `behavior:'ask'`，
  **同时给出两条出路**。

### 4.2 D10 子代理不是 agent —— **确认；但 11 的施工建议要改（见 §1 C1）**

**我们的现状**（主代理读全部 233 行）：`taskTool.ts:142` 一次 `fetch` 到 `/chat/completions`，
30s abort，**无工具、无循环**。`SubagentDefinition` 声明 12 字段**只读 6 个**——
`tools`/`disallowedTools`/`maxTurns`/`skills`/`effort`/`background` **从不读取**。
worktree **确实被分配并 `squashMerge: true` 释放**，但**没有 agent 在里面工作**。

**参考实现的真实分布**（主代理亲验）：

| 项目 | 机制 | 位置 |
|---|---|---|
| **pi** | 子进程跑自己的 CLI | `examples/extensions/subagent/index.ts:346` — **示例扩展，非核心** |
| **Claude Code** | **进程内** `query()` 循环 + 可选 worktree | `tools/AgentTool/runAgent.ts:748` |
| **opencode** | **进程内** Effect fiber + 子会话 | `packages/opencode/src/tool/task.ts` |

**11 §4.3 说「照 pi 的形状——子进程跑我们自己的 CLI」，理由是「复用整个 agent 实现」。
这个理由本身成立**（pi 的子进程就是同一个产品进程），**但 11 把它当成「pi 的产品设计」来引用，
而它其实是 pi 的示例扩展**。三个参考里**两个是进程内**，且 Claude Code 是三者中最完整的实现
（worktree 隔离 + `SubagentStart`/`SubagentStop` 钩子 + 后台化 + 嵌套进度转发）。

**另外，主代理查到一处 11 未提的阻塞**：我们 CLI **没有** `--model`/`--mode`/`--thinking`/`--append-system-prompt`
（`grep` 这些字面量 → 0）。走子进程路线**要先补这套参数面**。
**但**我们**已有** `--json`（`cliArgs.ts:240`）与 `presentation/terminal/jsonEvents.ts` 的
`run-event-stream.v1` 逐行 JSON 事件流——**父进程解析面已经存在**，这是子进程路线的一个有利条件。

### 4.3 D9 Doom Loop 只认严格连续 —— **确认（已实机复现）；参考实现是 gemini-cli**

**实测**：`A B A B A B A B` **从不触发**（`A A A A` 在第 3 次触发）。
`doomLoopDetector.ts` 从尾部**连续**计数，遇任何不同调用 `break`。

**参考**（见 §1 C4）：**pi 没有此检测器**。gemini-cli `loopDetectionService.ts:312-347` 的做法是
**按循环长度逐一比对**：
```ts
const R = TOOL_CALL_LOOP_THRESHOLD; // 5
for (let k = 1; k <= 5; k++) {
  const requiredLength = k * R;
  if (n >= requiredLength) {
    const cycle = this.toolCallHistory.slice(-k);
    for (let i = 0; i < requiredLength; i++) {
      if (this.toolCallHistory[n - (requiredLength - i)] !== cycle[i % k]) { isPatternMatch = false; break; }
    }
    if (isPatternMatch) return true;
  }
}
```
**k=1 即覆盖我们现有的连续检测**，故在 **k=1 这一档上是严格超集**。
**但阈值必须按 k 分档**——主代理实测：若对所有 k 统一用我们的 R=3，
`read edit read edit read edit`（6 次调用，**完全正常的真实工作**）会被判成死循环（k=2、required=6）。
**正确分档：k=1 用 R=3（保持既有行为），k≥2 用 R=5（照 gemini-cli）。**
详见 `phase-11-decisions.md` §10.2 的实测表。
**更正一处**：本文初稿写「gemini-cli 只在**参数与结果实质相同**时才算循环」——**这是错的**。
实测 `getToolCallKey`（`:174-177`）只哈希 `name` + `args`，**从不记录结果**；
`checkToolCallLoop` 在**执行前**判定。那句「参数与结果实质相同」是它**给 LLM 双检模型的提示词**
（`:77-78`），不是机械判据。**我们在这一点上与 gemini-cli 完全对等。**
gemini-cli 确实有、我们没有的是**一层 LLM 双检**（`:37,42,65`：20 条历史、30 回合后、
置信度 0.9），故我们的机械判据必须更保守（见裁决 §10.2 的分档）。

### 4.4 M2 后台命令执行 —— **确认缺失；08 的参考引用是错的（见 §1 C2）**

我们 `bash` schema 只有 `command` + `timeout`（`registry.ts:662-672`）。

**pi 不是参考**：它的 `detached` 是进程组管理（`setsid` + `kill(-pid)`），执行仍**同步阻塞**。

**真正的参考是 Claude Code**（`S4Exec` 报告 + 主代理核对）：
- `run_in_background: z.boolean().optional()`（`BashTool.tsx:241`）；
- 立即返回 `Command running in background with ID: ${backgroundTaskId}. Output is being written to: ${outputPath}`（`:994-1000`）；
- **配套两个工具**：`TaskOutput`（`task_id`/`block`/`timeout`，默认阻塞 30s）与 `TaskStop`（`:13-17`）；
- 完成时向后续回合注入 `<task_notification>`（`:1034-1038`）。

**注意 pi 有一处值得我们借鉴的既有机制**：它**跟踪 detached 子进程 PID**（`trackDetachedChildPid`，
`utils/shell.ts:199-210`），并在 `SIGHUP`/`SIGTERM` 与各模式下调 `killTrackedDetachedChildren()`。
**我们已有 `core/shell/platform/processTree.ts`**（`local.ts` 在用），需核对它是否覆盖退出清理。

### 4.5 M7 未变更文件去重 —— **确认缺失；参考实现完整**

我们 `grep -rn 'unchanged\|FILE_UNCHANGED' core/tools/` → **0**。

Claude Code 的实现（`S4Exec` 报告，主代理核对常量与触发条件）：
- 常量 `FILE_UNCHANGED_STUB`（`FileReadTool/prompt.ts:7-8`），文案
  `'File unchanged since last read. The content from the earlier Read tool_result in this conversation is still current — refer to that instead of re-reading.'`
- **五个条件同时成立**（`FileReadTool.ts:536-570`）：killswitch 关闭、有 `readFileState` 条目、
  `!isPartialView && offset !== undefined`、`offset` 与 `limit` **都相同**、`mtimeMs === timestamp`。
- **失效机制很巧**：Edit/Write 写入 `offset: undefined`（`FileEditTool.ts:520-523`），
  而触发条件要求 `offset !== undefined`——**一个字段同时表达了「缓存的是读取视图」与「别信它」**。
- 清空点：`/clear`、压缩、子代理拆除。

---

## 5. 上下文、配置与权限

### 5.1 D7 / D9' token 估算 —— **确认；但缺口的定义要改（见 §1 C5）**

**实测**：`estimateTokens` 是 `chars / 3.5`（`session/context.ts:3,31`），**对内容形态完全不敏感**。

**冷启动漏算（主代理实机测得，11 §3.2 的数字复核一致）**：
```
tools: 13   wireChars: 8933   estTokens(tools): 2553
promptChars: 1129            estTokens(prompt): 323
messagesOnly est: 1
```
**约 2,876 token 完全不计入**——因为系统提示与工具 schema 在 `openaiCompatible.ts:47` 是**独立参数**，
而 `estimateTokens` **只看 `messages`**。

**参考（pi）的解法不是「加个常数」，而是结构性的**：pi 把系统提示与工具声明**作为 `SystemMessage` 存进 transcript**
（`session-manager.ts:80-85`），于是 `estimateMessageTokens`（`estimate.ts:46-55`）**天然把它们算进去**：
```ts
if (message.role === "system") {
  return estimateTextTokens(getSystemMessageText(message)) +
         estimateToolsTokens(message.toolsAdded) + estimateToolsTokens(message.toolsRemoved);
}
```
且 pi 用**锚点 + 尾部估算**（`estimate.ts:98-107`）：最后一个有效 assistant 的 `usage` 作基数，
只估算它**之后**的消息。**这正是我们 `measureContextTokens` 想做的事**
（`cliSessionRuntimeFactory.ts:152-155`），但我们的 `messages.slice(...)` **不含系统提示与工具**。

**更正**：pi **也没有** CJK 特判。故 08 把「CJK 低估」列为缺口（隐含参考已解决）**不准确**——
真实缺口是**冷启动的 ~2,876 token 漏算**。pi 唯一的内容感知是**图片**（`ESTIMATED_IMAGE_CHARS = 4800`）。

### 5.2 P0-C 已在 §2.3 述

### 5.3 M1 数据驱动权限规则 —— **确认缺失；但参考选择需要裁决**

我们 `evaluator.ts:145-194` **硬编码**：只读工具表 + 只读 bash 分类器 + 精确字符串信任。
`grep -rn 'allowRules' packages/ts-shell/src --include=*.ts | grep -v test` → **0**。

**主代理读全 `evaluator.ts:140-194` 后的关键发现**：我们**没有 deny 概念**。
判定只有三种出口：`allow`（plan 模式只读 / 只读自动批准 / 匹配信任授予）、
`deny`（**仅 plan 模式的写操作**）、`ask`（默认）。
**即：用户没有任何方式表达「这个工具永远不许用」**——这是安全语义的缺失，不只是「少了配置项」。

**两个参考方向完全不同**（`S3Perms` 报告，主代理核对）：

| | Claude Code | pi |
|---|---|---|
| 模型 | 声明式规则表 `ToolName(specifier)` | **没有声明式规则引擎** |
| 存储 | settings JSON 的 `permissions.{allow,deny,ask}` | 无 |
| 机制 | 中心化管线 `hasPermissionsToUseTool` | 扩展订阅 `tool_call` 事件 |
| 优先级 | `deny > ask > 内容规则 > 绕过免疫 > bypass > allow > 默认 ask` | 首个返回 `{block:true}` 的扩展处理器胜出 |

**pi 的立场是刻意的**，`docs/security.md:1-17` 原文：
> 「Pi can read, change, and execute files with the permissions of the account that started it,
> and it does not ask for approval before every tool call. […] **Safety comes from limiting the files,
> credentials, processes, and network services Pi can access** […]. Watching the transcript, using
> project trust, and reviewing changes **do not create a security boundary**.」

**这意味着 M1 有一个 11 未提出的冲突**：照 Claude Code 做规则表，与 pi 的「进程边界才是安全边界」
哲学相反。**需裁决**（见裁决文件）。

Claude Code 的关键设计（`S3Perms` 报告，主代理核对语法与优先级）：
- 语法 `Rule := ToolName | ToolName '(' Specifier ')'`，`\(` `\)` `\\` 转义（`permissionRuleParser.ts:84-144`）；
- bash 三种匹配：精确、前缀 `Bash(npm:*)`（`cmd === prefix || cmd.startsWith(prefix + ' ')`）、通配 `Bash(git *)`；
- 文件路径按 gitignore 语义（用 `ignore` 包），`//` 绝对、`~/` home、`/` 配置根、裸路径相对 cwd；
- **deny 与安全检查对 bypass 免疫**（`permissions.ts:1225-1258`）——**这一条是安全关键**。

### 5.4 M10 动态工具装载增量 —— **确认缺失，但它是为「我们没有的能力」准备的**

我们 turn 层无 `toolsAdded`/`toolsRemoved`（grep → 0）。

**pi 的机制是「重放确定性」，不是通知**（主代理读 `agent-loop.ts:320-380`）：
`context.tools` 是**运行时可执行的**集合，transcript 里的 system 消息声明**模型可调用的**集合，
两者之差每轮成为 `toolsAdded`/`toolsRemoved`。注释原文：
> 「When a pending system message exists, its tool fields are treated as intent and replaced with
> the delta between the committed transcript and the executable set, **so replay always yields
> exactly `context.tools`**.」

**关键**：pi 的工具集**会在会话中途变化**（扩展可注册/注销工具），所以需要这个 diff。
**我们的工具集在会话构造时固定**（`turn/session.ts:174`），唯一的变化是
`allowTools: projection.stepCount < options.maxSteps`（`:189`）——**超过步数上限后工具整体消失，
且没有任何东西告诉模型**。

**所以 M10 对我们的正确含义不是「照抄 pi 的字段」**，而是：**要么补上工具集变化时的声明，
要么承认工具集不可变**。照抄 pi 的字段而没有工具集变化，是**空转**。**需裁决**。

### 5.5 M9 指令文件 `@import` —— **确认缺失；参考是 gemini-cli（见 §1 C3）**

我们 `projectInstructions.ts` 只读候选文件（`AGENTS.override.md`/`AGENTS.md`/`CLAUDE.md`…，
`:40-44`），**无 import 展开**。

**gemini-cli 的实现**（`memoryImportProcessor.ts`，主代理亲验）：
- 语法 `@path/to/file`，**手扫而非正则**（`findImports`，`:100-155`）：逐个 `indexOf('@')`，
  要求**前一个字符是空白**（词边界），路径首字符为 `.` `/` 或字母；
- **跳过代码块**（`findCodeRegions`，`:169-175`，用反引号正则找区域）——避免把文档里的示例路径当真导入；
- **`maxDepth: 5`**（`:196`），并有循环导入状态（`processedFiles`）；
- **包含性校验** `validateImportPath(importPath, fileBasePath, [projectRoot])`（`:390-421`）——
  **不许跳出项目根**（基准是**项目根**，不是当前文件所在目录，故子目录里的 `@../sibling.md` 合法），
  且拒绝 URL（`:396`）、解析符号链接后再比较（`:403`）、
  解析失败即拒绝（`:404-407`，注释写明 `fail-closed`）——
  与我们 grep 的 workspace 逃逸修复同一类问题。
  **注意它的拒绝是静默的**（`:266-271` 直接 `continue`）——**这一点我们不照抄**，见裁决 §12.1；
- 失败**不中断**（`:288-295` 只 warn），最后按顺序拼成扁平内容。

---

## 6. D13 `lsp` 工具

**确认**：schema 声明 `operation`/`filePath`/`line`/`character`/`symbol`，
`line`/`character` 文档写「1-based」（`lsp.ts:39-46`），但 `grep 'args.line'` → **0**、`args.character` → **0**。
11 §3.3 实测：带位置与不带位置**输出逐字节相同**。

**系统性扫描**（11 已做，本轮复核）：`core/tools/` 全部工具中「声明但从不读取的参数」**仅此一例**
（`ask.ts` 的 `id` 经 `q.id` 读取，是误报）。

**参考量级**（11 §4.2）：opencode `packages/opencode/src/lsp/` 共 **3,311 行**
（`client.ts` 650 / `lsp.ts` 507 / `server.ts` 1983 / `language.ts` 121 / `diagnostic.ts` 29 / `launch.ts` 21），
用 `vscode-jsonrpc` 的 `createMessageConnection`，**39 个语言服务器**，缺失时降级为 `undefined`。
**这是一个子系统，不是一个小工具。**

---

## 7. 复核安排

| 项 | 复核者 | 结果 |
|---|---|---|
| 子代理机制（D10） | `S1Subagent` + 主代理亲验 | **推翻 11 的引用**（§1 C1） |
| 上下文核算（D7/D9'） | `S2Context` + 主代理亲验 | 确认，**更正缺口定义**（§1 C5） |
| 权限规则（M1） | `S3Perms` + 主代理亲验 | 确认，**发现哲学冲突**（§5.3） |
| 后台执行 + 去重（M2/M7） | `S4Exec` + 主代理亲验 | **推翻 08 的引用**（§1 C2） |
| provider 细节（D2/D3/D4/D8） | `S5Provider` + 主代理亲验 | 确认全部 |
| 编辑唯一性（D12）、Doom Loop（D9）、冷启动漏算 | 主代理 `npx tsx` 实跑 | 全部复现 |

**5 个子代理全部成功，本轮无 TLS 事故**（与上一轮 6 次中 5 次失败形成对比）。

### 7.1 裁决复核（维护者要求「做好的裁决要经过子代理复核」）

三个复核子代理 `V1Corrections` / `V2Provider` / `V3Tools`（并发上限 3），
**全部完成并 yield 了结论**。期间端点出现 **402「账户暂无生效套餐」**，
导致 `W*`/`X*` 两轮重派共 6 次全部失败；维护者补足额度后原三个子代理的结论可读。

| 复核者 | 结论 | 主代理处置 |
|---|---|---|
| **`V1Corrections`** | 5 处更正（C1–C5）**全部 CONFIRMED**，`findings: []`，`overall_correctness: correct` | 无需改动 |
| **`V2Provider`** | 3 项：T7 漏 `allowEmptySignature`/`block_binding`；T5 对 11 的指摘不实；T4 混淆 pi 的两层重试 | **全部核对并采纳**（T5/T7 的 `allowEmptySignature` 主代理已自行更正，`block_binding` 归位到 T6） |
| **`V3Tools`** | 3 项：T10 对 gemini-cli 的描述不实；T12 包含性语义有偏差；D1 的理由含范畴错误 | **全部核对并采纳**（见下） |

**复核发现并已修正的 5 处**（全部由主代理逐条读原文核对后采纳）：

1. **T10**：初稿说「gemini-cli 只在参数与**结果**实质相同时才算循环，我们拿不到结果」。
   **错**——`getToolCallKey`（`:174-177`）**只哈希 `name`+`args`，从不记录结果**；
   那句「参数与结果实质相同」是**给 LLM 双检的提示词**（`:77-78`），不是机械判据。
   **我们在这一点上与它完全对等。**
2. **T10 阈值**：初稿的统一 `R=3` 会把 `read edit read edit read edit`（正常节奏）判成死循环
   （主代理 `npx tsx` 实测）。**改为按 k 分档**（k=1 用 R=3、k≥2 用 R=5）。
3. **T12**：初稿漏了两点——包含性基准是**项目根**而非当前目录（子目录 `@../sibling.md` 合法）；
   且 gemini-cli 的拒绝是**静默的**（`:266-271` 直接 `continue`）。**我们照语义但不照静默。**
4. **T4**：初稿把 `utils/retry.ts` 与 `provider-retry.ts` 说成一处「分类 vs 策略」拆分。
   **它们是两个不同层的重试**（输入类型都不同）。**后果**：`x-should-retry` 只在 HTTP 层可得，
   我们的接线点接不了——**裁决不为此新增传递通道**。
5. **T5**：初稿指摘「11 §2.4 漏了 `thinkingEnabled`」。**读原文后确认该指摘不实**，已撤回。
6. **D1**：初稿用「pi 的子代理在 `examples/` 里」作为反对子进程方案的理由。
   **`V3Tools` 指出这是范畴错误**——pi 的扩展模型是**刻意的架构选择**。
   主代理核实：`examples` **确在 pi 的发布清单里**（`package.json:35`），
   pi 文档把扩展当**架构级能力**（`how-pi-works.md:41-43`）。**已删掉该理由**，
   仅保留其余三条（产品级先例数量、对外接口成本、既有 worktree 语义）。

**复核也确认了主代理自行做的 4 处更正**（`V2Provider` 与 `V3Tools` 各自独立复述了同一问题）：
T1 的改动面收窄、T7 的 `allowEmptySignature`、D1 的范畴错误、T5 的撤回。

**如实记录**：`V2Provider` 与 `V3Tools` 的 `overall_correctness` 都是 `incorrect`——
**即它们认为初稿有实质错误**，而实际核对下来**确有 5 处**（上表）。
这是本轮复核的价值所在，也是「裁决必须过子代理复核」这条要求的直接回报。

---

## 8. 本轮未做的核验（如实记录）

1. **Anthropic 协议的三项 400**（D2 `budget_tokens`、D3 `signature`、D4 `temperature`）：
   **无订阅账号，未端到端验证**。依据是 API 契约与 pi 的实现，属 `[INFERENCE]`。
2. **CJK token 误差幅度**：本机 `node_modules` **无分词器**（`tiktoken`/`gpt-tokenizer`），
   数字来自公开 BPE 行为，**未在本机实测**。且本轮确认 **pi 也不特判 CJK**，故这不是相对缺口。
3. **pi 子代理输出如何流回父级**：`S1Subagent` 读了 `message_end`/`tool_result_end` 的解析
   （`index.ts:352-390`）与 50KB 截断（`PER_TASK_OUTPUT_CAP`），**但未实跑 pi 验证**（其 `node_modules` 不存在）。
4. **`processTree.ts` 是否覆盖 detached 子进程的退出清理**：**未读**。
   M2 若立项，这是必须先查清的一项（pi 有 `killTrackedDetachedChildren`，我们是否有对应物未知）。
5. **opencode 的 LSP 注册细节**：只做了规模清点，**未读其 39 个服务器的注册方式**。
6. **`cheers.json` / `.agents/settings.json` 的设计意图**：**无法从代码判断**是「未实现的 schema」
   还是「已废弃草稿」——故 P0-B 需维护者裁决。
7. **`npm run test:ts` 全量**：本阶段是规划，改动为零，**未跑**。
