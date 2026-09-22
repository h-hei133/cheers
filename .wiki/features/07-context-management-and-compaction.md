---
title: "功能对照 07：上下文管理与压缩（我们 vs pi）"
category: article
sources: [pi-source-2026-09-20, repo-audit-2026-09-20]
created: 2026-09-20
updated: 2026-09-20
tags: [features, gap-analysis, pi, compaction, context, branching]
summary: "对照 pi 的上下文管理：触发阈值、切点、超大 turn、重复压缩、分支摘要、文件追踪、压缩钩子。四处 DEFICIENT（阈值用字符估算而非 provider usage、切点只认 user 且无 split-turn、重复压缩不沿用上一条 kept boundary、文件追踪不跨压缩累积）、两处 MISSING（rewind 不生成分支摘要、压缩钩子无运行时等价物）、一处 OURS-ONLY（每请求 tool-output 微压缩）。**2026-09-21 更新：DEFICIENT #1/#2/#3 与 pre-research 的 guard 缺口已全部收口（见 phase-2-execution.md §4）。**"
confidence: high
---

# 功能对照 07：上下文管理与压缩

> **⚠️ 本文是 2026-09-20 的调研快照，其中部分结论已过时。**
> 逐条现状（含代码证据）见 [[gap-status|功能对照 01–07 的差距完成度核验]]。
> 已在本文件相应位置加 ✅ 标注；**未标注的行仍按原文有效**。

> **本轮为功能开发前锋探索，零代码改动**。对照本地参考仓 `pi`（`/home/wang/projects/pi`）。
> 分类口径：`DEFICIENT`＝我们有但更弱／不完整／未接线；`MISSING`＝pi 有我们没有；
> `OURS-ONLY`＝我们有 pi 没有（**仅记录，本轮不提议开发**）。
>
> **2026-09-21 收口**：§2.1（触发阈值）、§2.2（切点与 split-turn）、§2.3（重复压缩）
> 三项 DEFICIENT 与 `phase-2-pre-research.md` §3 记录的 guard 缺口**已全部修复**，
> 记录见 [`phase-2-execution.md`](phase-2-execution.md) §4。§2.4（跨压缩文件追踪）、
> §3.1（rewind 分支摘要）、§3.2（压缩钩子）仍是开放项。

## 0. 方法与范围

| 侧 | 读到的位置 |
|---|---|
| pi | `src/core/compaction/{compaction.ts(1024 行), branch-summarization.ts(382 行), utils.ts(158 行)}`、`docs/compaction.md`、`src/core/settings-manager.ts`（compaction 设置）、`src/core/extensions/types.ts`（压缩事件） |
| 我们 | `session/compaction.ts`(140 行)、`session/context.ts`、`core/shell/compaction.ts`、`core/query/microCompact.ts`、`core/query/compaction/{summarizer,summarize,fileFootprint}.ts`、`context/compact/*`、`turn/session.ts`、`cli/runtime/cliSessionRuntimeFactory.ts`、`cli/interactive/{compact.ts, interactiveCommandRouter.ts, picker/rewind.ts}`、`session/{SessionManager.ts, sessionEventCodec.ts, lifecycle/sessionLifecycleWrites.ts, sessionDagEngine.ts}` |

关键检索命令与结果：

```bash
# rewind 链路是否生成分支摘要
grep -nE 'generateBranchSummary|appendBranchSummary|branch_summary|requestCompactionSummary|compactSessionHistory' \
  packages/ts-shell/src/cli/interactive/picker/rewind.ts \
  packages/ts-shell/src/cli/interactive/interactiveMode.ts \
  packages/ts-shell/src/session/SessionManager.ts
# → No matches found.

# 压缩钩子是否有派发
grep -rnE 'eventName:[[:space:]]*"(PreCompact|PostCompact)"' packages/ts-shell/src
# → No matches found.

# microcompact 是否是 pi 没有的
grep -rnE 'microcompact|microCompact|pruneToolContent' /home/wang/projects/pi/packages/coding-agent/src
# → No matches found.
```

## 1. 覆盖清单

| 能力 | pi 位置 | 我们位置 | 判定 | 证据 |
|---|---|---|---|---|
| 触发阈值依据 provider usage ✅ **已实现**（`compaction.ts` 的 `measureContextTokens` 接 `getSessionUsage`） | `compaction.ts:161-195,217-252` | `session/context.ts:3-21`；`cli/runtime/cliSessionRuntimeFactory.ts:81-85` | **DEFICIENT** | 见 §2.1 |
| 切点允许非 user 边界 + split turn | `compaction.ts:323-377,393-472,899-938` | `session/compaction.ts:37-78` | **DEFICIENT** | 见 §2.2 |
| 重复压缩沿用上一条 kept boundary | `compaction.ts:762-790` | `session/compaction.ts:14-18,80-108` | **DEFICIENT** | 见 §2.3 |
| 跨压缩累积文件追踪 | `compaction.ts:46-82,961-975`；`utils.ts:12-82` | `core/query/compaction/fileFootprint.ts:19-60` | **DEFICIENT** | 见 §2.4 |
| 压缩前可取消/自定义的扩展钩子 ✅ **已实现**（`turn/session.ts:136` 的 `PreCompact` 可 block，`PostCompact` 亦派发） | `extensions/types.ts:594-630`；`agent-session.ts:2124-2138` | `core/hooks/types.ts:5-20`（仅声明） | **MISSING** | 见 §3.2 |
| rewind／分支切换时摘要被放弃的分支 | `branch-summarization.ts:108-380`；`docs/compaction.md:150-179` | `picker/rewind.ts:14-17,50-55`；`SessionManager.ts:141-150` | **MISSING** | 见 §3.1 |
| per-model reserveTokens／keepRecentTokens 覆盖 ✅ **已实现**（Phase 3 T4，`modelTokenBudgets`） | `settings-manager.ts:13-32,887-912` | 无 | **MISSING** | 见 `03-*` §3.1（同源：模型目录无 per-model 覆盖） |
| 结构化摘要格式 | `docs/compaction.md`（Goal/Constraints/Progress…） | `core/query/compaction/summarizer.ts:1-30`（`EIGHT_SECTION_COMPACTION_PROMPT`） | **平手** | 两侧都是结构化八段式，字段名不同 |
| 手动 `/compact [instructions]` | `docs/compaction.md`（含 custom instructions） | `cli/interactive/compact.ts`（`parseCompactCommand` 取 instructions） | **平手** | 两侧都支持带指令的手动压缩 |
| 每次请求前的 tool-output 微压缩 | **pi 无** | `core/query/microCompact.ts:24-60`；`turn/step.ts:103-108` | **OURS-ONLY** | 见 §4 |

## 2. DEFICIENT 详述

### 2.1 触发阈值用字符估算，而非 provider 报告的 usage（置信度：高）

**证据（我们）**：

- `session/context.ts:3-21` `estimateTokens` 累加所有 message 的 `content.length`、`tool_call_id.length`、每个 tool call 的 `id`/`name`/`arguments` 长度，除以 `CHARS_PER_TOKEN = 3.5`。**不读 provider 返回的 usage**。
- `cli/runtime/cliSessionRuntimeFactory.ts:84` `policy: { contextWindow: input.runtimeContext.runtimeConfig.contextWindow ?? 64_000 }`。
- `session/compaction.ts:84` `const reserve = policy.reserveTokens ?? DEFAULT_RESERVE_TOKENS`（`session/context.ts:5` = 8_000）。
- 判定：`session/compaction.ts:34` `tokens > contextWindow - reserveTokens`。

**证据（pi）**：`compaction.ts:161-195` `calculateContextTokens(usage)` / `getLastAssistantUsage(entries)`——**从最后一个有效 assistant message 的 usage 取真实上下文占用**；`:217-244` `estimateContextTokens(messages)` 用该 usage 作基准，只对 usage 之后的尾随消息做估算；`:247-252` 阈值同为 `contextTokens > contextWindow - reserveTokens`；`:141-151` `CompactionSettings` 默认 `reserveTokens = 16_384`。

**量化差异**（阈值层面的确定差异）：

| 场景 | 我们 | pi（默认） | 差异 |
|---|---|---|---|
| 模型窗口 64k | 约 `64,000 - 8,000` = **56,000** 触发 | 约 `64,000 - 16,384` = **47,616** 触发 | 我们多留约 8,384 tokens |
| 模型窗口 128k | 仍按 64k 算，约 **56,000** 触发 | 约 `128,000 - 16,384` = **111,616** 触发 | 我们**早约 55,616 tokens** 就压缩 |

> `chars/3.5` 与真实 tokenizer 的绝对误差无法仅凭仓库代码量化（需 provider fixture），故只给阈值层面的确定差异。

**影响**：
- 在大窗口模型上**过早压缩**（浪费上下文预算）；
- 在真实占用高于字符估算时（大量 JSON、非英文、cache 占用）**过晚压缩**，触发 provider 拒绝；
- pi 的 usage 含 cache read/write 维度，我们的字符估算**结构性看不见**这些占用。

**最小改动建议**：触发依据切到「最近一次 provider usage + 实际模型 contextWindow」，reserve/keepRecent 按 active model 解析。**注意**：这依赖 `03-*` §2.1 的 `getRuntimeConfig` 修复（否则 `contextWindow` 永远是 `undefined`）。

### 2.2 切点只认 `user`，且无 split-turn 处理（置信度：高）

**证据（我们）**：`session/compaction.ts:37-50`：

```ts
export function findCompactionCut(messages, keepRecent): number | undefined {
  for (let index = messages.length - keepRecent; index >= 2; index -= 1) {
    if (messages[index]?.role !== "user") continue;      // ← 只认 user
    if (hasDanglingCalls(messages, index)) continue;
    return index;
  }
  return undefined;
}
```

- `keepRecent` 是 `keepRecentMessages`（`:5` `KEEP_RECENT_MESSAGES = 4`）——**消息条数，不是 token 预算**。
- `turn/session.ts:170-184` 的 overflow recovery 复用同一 `findCompactionCut`。

**证据（pi）**：`compaction.ts:323-377` 把 user、assistant、`BashExecution`、custom、`branch_summary`、`compaction_summary` 都视为合法切点，明确**禁止**在 tool result 切（必须与 tool call 同侧）；`:393-472,899-938` 在 cut 落到一轮中间时标记 `isSplitTurn`，**分别摘要「历史」与「当前 turn 前缀」再合并**。

**超大单一 turn 的后果**（子代理推断，主代理核验代码路径成立）：

- 若会话只有一个超大 turn，或最近 user 之后没有更早的可接受 user 切点，`findCompactionCut` 返回 `undefined` → `planCompaction`（`:80-94`）返回 `undefined` → **不产生压缩计划**。
- overflow recovery 也因同一 cut 为 `undefined` 而在 `turn/session.ts:176-179` 直接返回 `false`。
- 若存在更早的 user 边界，切点只能落在那儿，**整段超大当前 turn 全部保留在 tail 里**——`keepRecent` 是消息条数，**不保证 token 预算**。

**影响**：一个巨型 turn（大量工具调用的长任务）会让压缩**要么不触发、要么留下过大的 tail**，最终由 provider 以 oversized context 拒绝。

**最小改动建议**：以 token 预算反向扫描合法消息边界；允许在 assistant／BashExecution／custom 边界切分；为 split turn 生成 prefix summary + history summary。

### 2.3 重复压缩不沿用上一条的 kept boundary（置信度：高）

**证据（我们）**：

- `session/compaction.ts:14-18` `CompactionPlan` 只有 `cut`、`keptMessages`、`tokensBefore`——**没有** `firstKeptEntryId` 语义。
- `:80-94` 每次 plan 都对**当前 snapshot** 全量重新估算并重新找 user cut。
- `:97-108` `applyCompaction` 写入一个普通 user checkpoint（`[Context Checkpoint]`），再拼接当前 cut 之后的 tail。
- `:110-138` `createCompactionStep` 下一次又对新的 `snapshot.messages` 走同一路径。
- 持久化侧：`session/lifecycle/sessionLifecycleWrites.ts:242-243` 写入的字段是 `firstKeptEntryId?` 与 `keptMessages?`，而活动 writer 记的是 `keptMessages`。
- 值得注意：`session/sessionDagEngine.ts:219-243` **确实**支持读 `firstKeptEntryId`，但**活动 compaction writer 不写它**。

**证据（pi）**：`compaction.ts:762-790` `prepareCompaction` 会寻找上一条 compaction，取其 summary，并**从上一条 `firstKeptEntryId` 设置 boundaryStart**，再基于 rebuilt session context 计算 `tokensBefore`；`docs/compaction.md` 明确：「On repeated compactions, the summarized span starts at the previous compaction's kept boundary (`firstKeptEntryId`), not at the compaction entry itself」。

**影响**（含一处推断，已标注）：
- **[推断]** 第二次压缩会把**上一次的 `[Context Checkpoint]` 当作普通历史内容**再次摘要——即「摘要的摘要」，逐次损失信息。
- `tokensBefore` 每次只是当前 snapshot 的字符估算，**不代表实际被替换的上下文量**。
- kept tail 的真实起点不稳定。

**最小改动建议**：让 `CompactionPlan` 携带 `firstKeptEntryId`，在 `applyCompaction` 与持久化中落盘，下次 plan 从该 boundary 起算。

### 2.4 文件追踪只在单次 request 内有效（置信度：高）

**证据（我们）**——子代理发现了一处**注入位置错误**，主代理已核验：

- `core/query/compaction/fileFootprint.ts:19-60` `extractFileFootprint` 用两个 `Set` 扫描传入的 messages：单次调用内**是累积的**（modified 会从纯 read 集合移除）。
- **关键**：`core/query/compaction/summarize.ts:59-62`：

  ```ts
  const { rawSummary } = parseCompactedSummary(summaryContent);
  const footprintXml = formatFileFootprintXml(extractFileFootprint(request.messages));
  return formatCheckpointMessage(rawSummary, footprintXml);
  ```

  footprint 是在 provider **返回摘要之后**才计算的，并且拼进的是**checkpoint message**，**不是送给 summarization provider 的 prompt**（`:49` 的 request body 只有 `[...request.messages, {role:"user", content: prompt}]`）。
- 持久化：`session/lifecycle/sessionLifecycleWrites.ts:242-243` 只写 `firstKeptEntryId`/`keptMessages`，**没有** `readFiles`/`modifiedFiles` 明细。

**证据（pi）**：`compaction.ts:46-82` `CompactionDetails { readFiles, modifiedFiles }` 从上一条 **pi-generated compaction 的 details** 读入，再从当前待摘要消息补充；`:961-975` 把累计 file lists 追加到 summary；`docs/compaction.md:181-187` 明确「file tracking accumulates across multiple compactions or nested branch summaries」。

**结论**：
- **单次 request 内**：我们累积（Set 去重）。
- **跨压缩**：**不累积**——上一条 checkpoint 里的是 XML 文本，不是 `assistant.tool_calls`，`extractFileFootprint` 无法从它恢复。
- **注入位置**：我们不把 footprint 注入摘要请求，而是注入 checkpoint 内容供**后续**上下文看到。

**影响**：多次压缩后，早期读取/修改过的文件会从可见的 `<read-files>`／`<modified-files>` 列表**消失**。

**最小改动建议**：把 `readFiles`/`modifiedFiles` 落进 `CompactionTranscriptEntry` 的 details，下次提取时合并上一条的明细。

## 3. MISSING 详述

### 3.1 rewind 不生成被放弃分支的摘要（置信度：高）

**pi 如何实现**：`branch-summarization.ts:108-145` `collectEntriesForBranchSummary` 从旧叶回溯到共同祖先并收集 entries；`:195-246` `prepareBranchEntries(entries, tokenBudget)` 按预算（**从新到旧**）准备消息并提取累计 file ops；`:293-380` `generateBranchSummary` 调模型；`docs/compaction.md:150-179` 描述 `/tree` 导航时询问用户是否摘要并把结果注入新分支。

**我们缺失的证明**：

```bash
grep -nE 'generateBranchSummary|appendBranchSummary|branch_summary|requestCompactionSummary|compactSessionHistory' \
  packages/ts-shell/src/cli/interactive/picker/rewind.ts \
  packages/ts-shell/src/cli/interactive/interactiveMode.ts \
  packages/ts-shell/src/session/SessionManager.ts
# → No matches found.
```

实际链路（逐步核实）：

1. `picker/rewind.ts:14-17` 注释明确语义：「Choosing one **drops every turn after it** and puts that question back in the prompt」。
2. `:50-55` 只调用 `input.rewind(point)`，**无 summary／provider 参数**。
3. `interactiveMode.ts:535-539` 直接调 `sessionManager.rewindTo(...)`。
4. `SessionManager.ts:141-150` `rewindTo` 把 `session.turns` **截断**并写 metadata，返回丢弃条数。

**旁证**：`session/sessionDagEngine.ts:184-200` 有 `branchWithSummary` API——**但不在实际 rewind 调用链中**（与 `02-*` 报告的 `threadState.ts` 零消费者是同一模式：分支能力已写好但未接线）。

**影响**：被放弃的 turns **不被摘要**，直接从 active session 的 turns 视图中消失。这与 pi 的 `/tree` 形成鲜明对比：pi 让你带着「刚才那条路试过什么、为什么放弃」的摘要继续，我们让你从零开始。

**最小落地路径**：把 rewind 变成 branch navigation——保留旧叶与共同祖先，按预算收集 dropped entries，询问是否摘要，并在目标路径追加 branch-summary entry。**已有的 `sessionThread.ts` + `sessionDagEngine.ts` 提供了大部分基础。**

### 3.2 压缩钩子没有运行时等价物（置信度：高）

**pi 如何实现**：`extensions/types.ts:594-605` `session_before_compact` 事件带 `preparation`（含 `messagesToSummarize`、`turnPrefixMessages`、`previousSummary`、`fileOps`、`tokensBefore`、`firstKeptEntryId`、`settings`）、`reason`（`"manual"`/`"threshold"`/`"overflow"`）、`willRetry`、`signal`，**可返回 `{cancel: true}` 或自定义 summary**；`:607-630` 另有成功/失败事件；`agent-session.ts:2124-2138` 手动 compact 前发出，可被 cancel；`:2194-2199` 成功后发出。

**我们缺失的证明**：

```bash
grep -rnE 'eventName:[[:space:]]*"(PreCompact|PostCompact)"' packages/ts-shell/src
# → No matches found.
```

- `core/hooks/types.ts:18-19` **声明**了 `"PreCompact"` 与 `"PostCompact"`（这属于 `05-*` §2.8 记录的「22 个声明、11 个零派发」之一）。
- 活动压缩路径只传 `onCompact` 回调：`turn/session.ts:119-120` `createCompactionStep(policy, summarize, undefined, onCompact)`。
- `session/compaction.ts:110-138` 的回调在成功后通知记录，**无 cancel、无 custom-summary 契约**。

**影响**：不存在「压缩前可取消/自定义、压缩后可观测、失败可配对」的机制。这是 `01-*` 报告「扩展宿主已被拆除」在压缩面的具体体现。

**最小落地路径**：在 `createCompactionStep` 的 plan 与 apply 之间派发 `PreCompact`（带 preparation + 可取消），之后派发 `PostCompact`。**钩子类型与 dispatcher 都已存在，只缺派发点。**

## 4. OURS-ONLY（仅记录，本轮不提议开发）

| 能力 | 我们位置 | pi 是否真的没有（检索命令+结果） |
|---|---|---|
| 每次 provider 请求前的 tool-output 微压缩（旧工具输出裁成 head/tail + 省略标记） | `core/query/microCompact.ts:24-41` `pruneToolContent`（head 500 / tail 500 字符）、`:45-60` `microcompactMessages`（保留最近 N turn）；真实请求处 `turn/step.ts:107` `microcompactMessages(toChatMessages(messages), { keepRecentTurns: 3, maxOutputChars: 1000 })` | **确认没有**：`grep -rnE 'microcompact\|microCompact\|pruneToolContent' /home/wang/projects/pi/packages/coding-agent/src` → **No matches found**。pi 的对应物只在**摘要序列化**时截断单个 tool result 到 2,000 字符（`compaction/utils.ts:87-99`），不是每次请求都做的滚动剪枝 |

> **价值判断（供维护者参考）**：我们的 microcompact 是**每请求**生效的，pi 的是**摘要时**生效的。
> 前者能持续压低常规请求的 token 成本，但会**永久丢弃**工具输出的中段——
> 这是有代价的能力，不是纯粹的领先。列入 OURS-ONLY 仅为记录。

## 5. 未能验证的项

1. **`chars/3.5` 相对真实 tokenizer 的误差**：未从 provider fixture 或真实 transcript 取同一段内容对比，故只给阈值层面的确定差异（§2.1）。
2. **`rewindTo` 之外 transcript 的物理清理策略**：不能断言旧 transcript 文件字节是否同步删除；能确定的是 active session 的 turns 已截断且无 branch summary 生成（§3.1）。
3. **`SessionDagEngine.branchWithSummary` 的全仓调用图**：已确定它不在 rewind picker 调用链中，但未穷举所有产品入口（§3.1）。
4. **`context/compact/` 域（4,659 行含测试 / 2,919 行非测试）的完整职责**：本轮只读了 `checkpoint/compactLiveCheckpoint.ts` 与 `governance/contextAnalysis.ts` 的头部；该域与 `session/compaction.ts` 的关系未系统梳理。**这是本轮最大的未覆盖区域。**
   > **2026-09-20 更正**：本项初记「5,186 行」，该数字实为 `context/compact/`（4,659 含测试）**加上** `context/readWindow/`（527）之和——两者被误并为一个域。
   > 且后续研究（`phase-2-pre-research.md` §1.1）已查明：`context/compact/` **不是压缩器**，而是交接包生成器（结果类型自述 `providerCall: "none"`），与 `session/compaction.ts` 不在同一问题上。该未覆盖项已收口。
5. **`core/shell/compaction.ts` 与 `session/compaction.ts` 的语义重叠**：确认了两者是**不同的活路径**（前者服务交互式 `/compact`，后者服务自动压缩与 overflow），但未逐字段对比二者的 cut 逻辑是否一致。
   > **2026-09-20 已收口**：见 [`phase-2-pre-research.md`](phase-2-pre-research.md) §2 的逐字段对照。结论：两者共享同一摘要器，差异在**切点 guard** 与**落盘责任**，是真实语义差异而非重复。
6. **未运行任何构建/测试/产品**：全部为静态分析。
