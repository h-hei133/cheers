---
title: "Phase 18 前置研究：把 13 号册剩余的 OPEN 项与 12 号的未覆盖面，对照参考实现读到可实施精度"
category: article
sources: [13-feature-and-defect-register, 12-gap-and-debt-research-2, phase-17-decisions, phase-18-reference-survey]
created: 2026-10-01
updated: 2026-10-01
reviewed: 2026-10-01（5 个只读研究子代理 + 主代理逐条亲验）
reviewed_round_2: 2026-10-01（3 个探索子代理 + 主代理逐条亲验，见 §12：本文结论未推翻，新增 20 条事实、驳回 8 条子代理断言）
tags: [features, gap-analysis, phase-18, reference-survey, design]
summary: "Phase 18 的前置研究。输入是 13 号登记的 23 条 OPEN（Phase 17 未纳入的 21 条 + 1 条 P17 后新发现 + 1 条裁决保持 OPEN）+ 12 号 §10 的四项未覆盖面。每条给出：我方缺口（path:line）、参考实现的机制（repo/path:line + 引文，或 NOT-FOUND）、判定、可实施方向。零代码改动。所有参考断言由主代理逐条复验，被推翻或缩小的记入 §9；复核轮（§12）补入文档未覆盖的 20 条缺陷（含 2 条 P1）。"
confidence: high
---

# Phase 18 前置研究

> **本文的定位**：`12-gap-and-debt-research-2.md` 与 `13-feature-and-defect-register.md` 是**盘点**。
> 本文是**设计级研究**——回答「参考实现到底怎么解决的、我方缺口精确在哪、按什么形态改」。
>
> **与 13 号册的关系**：13 号是常驻总账。本文**不改 13 号**，只在需要时引用条目号；施工后由 13 号标注状态。
>
> **纪律**（沿用本仓既有要求）：
> 1. 参考侧断言必须给出 `<repo>/<path>:<line>` 并引关键代码；不接受「pi 做得更好」。
> 2. 主代理**亲验**每一条参考断言；子代理结论逐条复验，被推翻/缩小/更正的记入 §9。
> 3. **零代码改动**——本轮只产出研究与设计依据。
> 4. 参考实现**没有**等价物时明说（`NOT-FOUND`）——那意味着要么自己设计，要么不做。

---

## 0. 输入与范围

### 0.1 输入的准确数字

对 13 号册做机械统计（正则解析 `### <ID> · … — \`OPEN\``），
并用 `git show 44eebfd5:` 取 Phase 17 规划时点的同一文件做对照：

```
当前标 OPEN 的条目标题        24
  去重后的唯一 ID             23   ← 差额 1：OBS-04 出现两次（§10 的 MCP 网关 / §11bis 的 sidebar）
  其中 Phase 17 之后新登记      1（PRV-12）
  其中 Phase 17 已裁决但保持      1（SES-02，Phase 17 §5-3 取「如实降级」）
```

**Phase 18 的输入 = 这 24 个标题**（另见 `phase-18-decisions.md` §1.1 的逐行清单，
那里为每个标题写明了它落在哪一波、或为什么不进交付表）+ 12 号 §10 的四项未覆盖面。

> **口径警告**：**不要**用减法推导「未规划的有多少条」——
> 本文档早期版本的 21/22 两个数字就是这样来的，且**两个都会随解析规则漂移**
> （ID 冲突让集合口径与标题口径相差 1）。
> **权威口径是 `phase-18-decisions.md` §1.1 的逐行清单**，本节的 24 只是它的行数。

> **一处记账更正（本文发现）**：`phase-17-decisions.md` §1.2 声称「移出（更后阶段）**22** 项」，
> 但那份文档**通篇没有枚举这 22 项**（§8 只记实施、§9 记复核）。本文用「规划时点 OPEN 集合
> − decisions 全文出现过的 ID 集合」重算，得到 27 个 ID，剔除其中 7 条**确实在 W1–W6 的表格里
> 实施过**的（`BRW-02`、`PRV-03`、`TOL-03`、`OBS-05`、`CDE-01`、`CDE-02` 已 `FIXED`；
> `CDE-04` 已裁 `WONTFIX`）后剩 **20 个 ID**——与 §1.2 的「22」量级相符但**清单缺失**。
> **这是 Phase 17 唯一的文档缺口**，已在 Phase 18 的逐行清单里补上。

### 0.2 另需纳入的：12 号文档 §10 的四项未覆盖面

`12-gap-and-debt-research-2.md` §10 记了四项「本轮未做」，13 号册 §13.2/§16.4 又两次重申：

| 项 | 规模（本文实测） | 状态 |
|---|---|---|
| `browser/**` 逐模块 real-vs-demo 判定 | **167** 个非测试模块 | §13.2 记「只做了四分类」；本文**补做分类**（§7.1） |
| `cli/interactive/**` 键位与文档**双向 diff** | 44 个非测试模块 / 2 张表 / 尚无文档页 | 自 Phase 12 起**再无任何文档提及**；本文补做（§7.2） |
| `session/continuation|recovery|replay|export` 逐模块审计 | 16 + 11 + 5 + 4 = **36** 个非测试模块 | 本文给出可达性与缺陷面（§7.3） |
| 真实 provider 端到端 | 4 协议 | **已执行**（§8）：OpenAI 兼容 ✅ / Anthropic 原生 ✅ / Google 原生 ❌（405） |

### 0.3 方法

| 手段 | 用途 | 本轮产出 |
|---|---|---|
| 5 个只读子代理（并发 5，模型 `vsllm/glm-5.3-api:max`） | 分域读参考实现 | 全部成功返回（无 `content_filter`、无 402——与 Phase 16/17 不同） |
| 主代理自建 ESM 值边可达图 | 浏览器分类、session 边界、脚本闭包 | §7.1 / §7.3 的数字 |
| `npx tsx` 直调 / 真实 CLI（隔离 `HOME`） | 行为验证（非读码推断） | §1.1 的 `/exit` 实机、§1.4 的 `--json` 实机 |
| 定向测试（仅登记册相关域） | 现状基线 | `keyGuide/keymap/keybindings` 71/71 通过 |

**参考实现路径速查**：

| 用途 | 路径 |
|---|---|
| CLI 参数与模式 | `pi/packages/coding-agent/src/cli/args.ts`、`:src/main.ts`、`:src/modes/print-mode.ts` |
| 斜杠命令与树导航 | `pi/packages/coding-agent/src/core/slash-commands.ts`、`:src/modes/interactive/interactive-mode.ts`、`:src/core/agent-session.ts` |
| 锁与存储 | `pi/packages/coding-agent/src/core/session-manager.ts`、`pi/packages/durable/src/storage/**`、`opencode/packages/core/src/util/flock.ts` |
| 文件编辑 | `pi/packages/coding-agent/src/core/tools/{edit,file-mutation-queue}.ts`、`opencode/packages/core/src/file-mutation.ts` |
| 进程与 MCP | `pi/packages/coding-agent/src/utils/{shell,child-process}.ts`、`:src/extensions/mcp/**` |
| 循环检测与策略 | `gemini-cli/packages/core/src/services/loopDetectionService.ts`、`:src/policy/**` |
| Claude Code 命令契约 | `source-claudecode/types/command.ts`、`:main.tsx` |

---

## 1. 命令面与 CLI 契约

### 1.1 `CMD-04` 非交互模式下 `/exit` `/clear` `/retry` `/cancel` 一律被拦 — `CONFIRMED`

**我方**（实机复现，2026-10-01）：

```
$ printf '/exit\n'   | cheers   → - Outcome: blocked / - BlockerKind: command-not-allowlisted
                                  - Reason: This shell action is interactive-only.
$ printf '/clear\n'  | cheers   → 同上        $ printf '/retry\n' | cheers → 同上
$ printf '/cancel\n' | cheers   → 同上
```

判据在**派发处的一条 if 链**（`entrypoints/cliRuntimeModule.ts:315-396`），不在命令定义里：

```ts
if (resolved.kind === "shell-action") {
  if (resolved.slashResult.action === "show-view") { ... return; }
  if (resolved.slashResult.action === "set-view") { ... return; }
  if (resolved.slashResult.action === "show-help") { ... return; }
  if (resolved.slashResult.action === "manage-permissions") { ... return; }
  ...
  renderInteractiveOnlyShellActionBlocked(options.renderer, { printMode: options.printMode });
```

`core/commands/types.ts` 的 `CommandDefinition` **没有任何「非交互可用」字段**。
所以新增一个 shell-action 而忘了在这里加分支 ⇒ 静默落到「interactive-only」。
`/exit`/`/clear`/`/retry`/`/cancel` 正是这样被漏掉的（四个 runtime 只返回一个 action）。

**参考实现有三种形态，都不是「派发处的硬编码清单」**：

| 参考 | 形态 | 位置 |
|---|---|---|
| **Claude Code** | **per-command 声明字段** | `source-claudecode/types/command.ts:76` `supportsNonInteractive: boolean`（local 命令）与 `:37` `disableNonInteractive?: boolean`（prompt 命令）；`main.tsx:2622` 是**唯一**的过滤点 |
| **gemini-cli** | **由返回值类型决定** | `packages/cli/src/nonInteractiveCliCommands.ts:115-122` `default: throw new FatalInputError('Exiting due to command result that is not supported in non-interactive mode.')` |
| **pi / opencode** | 内建命令**在非交互路径上根本不存在**（`NOT-FOUND`） | `pi/packages/coding-agent/src/core/slash-commands.ts:19-44` 只有 `{name, description, argumentHint?}`；派发是 `interactive-mode.ts` 里的 `if (text === "/quit")` 链 |

**Claude Code 的过滤点原文**（唯一一处，且是数据驱动）：

```ts
const commandsHeadless = disableSlashCommands ? [] : commands.filter(
  command => command.type === 'prompt' && !command.disableNonInteractive
          || command.type === 'local' && command.supportsNonInteractive);
```

**判定**：`CONFIRMED`。我方是**四方里唯一把判定放在派发处的**；参考要么声明在定义上（CC）、要么由返回类型决定（gemini）。
**方向**：给 `CommandDefinition` 加一个声明字段（对齐 CC 的 `supportsNonInteractive`），派发分支改读它，**未声明按 blocked**。
`/exit` 在管道里语义就是「输入结束」——CC 对等价面（`/exit` 是 `local-jsx`，两个过滤器都不匹配）**自动排除**，全靠类型而非拒绝清单。

### 1.2 `CMD-05` 参数解析无 `--` 终止符，未知 flag 静默忽略 — `CONFIRMED`（但参考同样不做）

**我方**：`core/commands/arguments.ts` 的 `tokenizeCommandArgs` 只做引号/转义（`Phase 17 W1-1` 引入），
**无 `--` 处理**；各命令自行 `args[0]` 取值，多余参数被忽略。

**参考**：`pi` 的 **CLI** 层有 `--` 终止符（`pi/packages/coding-agent/src/cli/args.ts:82`）：

```ts
if (arg === "--") {
  for (const positionalArg of args.slice(i + 1)) { ...result.messages.push(positionalArg); }
  break;
}
```

但 `pi` 的**斜杠命令参数**解析器（`pi/packages/coding-agent/src/core/prompt-templates.ts:25-55` 的 `parseCommandArgs`）
**同样只处理引号，同样没有 `--`**。`opencode` 的 `--` 只出现在 `packages/opencode/src/cli/network.ts:52`（CLI 层）。

**判定**：`CONFIRMED`，但**参考在斜杠命令层同样没有 `--`**（`NOT-FOUND`）。
⇒ 本条**不是「对齐参考」的修复**，而是**自研标准完善**。优先级应据此下调：
它修的是「用户显式写 `--` 期望终止解析」这一边缘场景，而我们连「未知 flag 静默忽略」也没有诊断。

**方向**：与 `CMD-01` 的同一改动面——在 `tokenizeCommandArgs` 里加 `--` 终止；
未知 flag 的处理需要一次**产品决定**（报错 vs 提示 vs 维持忽略），因为参考没有先例。

### 1.3 `CLI-01` `--json` 不带 `--print` 时静默降级为 prose — `CONFIRMED`

**我方**（实机复现，2026-10-01）：

```
$ printf '/help\n' | cheers --json   → exit 0；输出 105 行、其中合法 JSON 行 **0**
```

根因链（子代理给出，主代理读码确认）：

- `entrypoints/cliArgs.ts:214` `assignOption(options, "jsonEvents", rawArgs.includes("--json"))`
- `cli/print/printModeRouter.ts:84-89` **只有 `kind === "print"` 分支**传 `jsonEvents: input.options.jsonEvents === true`；`stdin-stream`（`:70-77`）与 `stdin-batch`（`:94-104`）分支**不传**
- `entrypoints/cliModeDispatch.ts:31-39` 模式判定**完全不看 `--json`**

**参考实现三种答案，没有一种是「接受并忽略」**：

| 参考 | 形态 | 位置 |
|---|---|---|
| **pi** | 机器可读输出**就是一个模式**，且隐含单次执行 | `main.ts:113-121` `if (parsed.mode === "json") return "json";` → `toPrintOutputMode` → `runPrintMode` |
| **Claude Code** | 组合不合法时**启动即报错**，能隐含时就隐含 | `main.tsx:1241-1252` `if (!outputFormat) outputFormat='stream-json'; if (!options.print) print = true;`；`cli/print.ts:788-791` `Error: When using --print, --output-format=stream-json requires --verbose` → `gracefulShutdownSync(1)` |
| **gemini-cli** | 启动时校验取值 | `packages/cli/src/config/config.ts:262-267` `Invalid values:\n  Argument: output-format, Given: "…", Choices: "text","json","stream-json"` |

**判定**：`CONFIRMED`。**我们是四方里唯一「收了 flag、跑了、还发 prose」的**——静默丢弃用户意图。
**方向**：二选一（默认取 pi 式）——让 `--json` 参与模式判定（隐含单次非交互），或在模式解析处 fail-fast（CC 式）。

### 1.4 `CMD-03` `/back` 带参数落进未知命令 — `CONFIRMED`（与 `CMD-06` 同根）

**我方**（实机复现）：`printf '/back 2\n' | cheers` → `Unknown slash command: /back`；
`printf '/tree\n' | cheers` → `Unknown slash command: /tree`。

根因：`entrypoints/slashCommandRegistry.ts:62-73` 的 `PICKER_ONLY` 只登记**帮助与补全**的显示项，
真正的接管发生在 `cli/interactive/picker/registry.ts:97` 的 `opensPicker`，条件为**行内不含空白**：

```ts
return !/\s/.test(trimmed) && name in PICKERS;
```

⇒ 裸 `/back` 打开选择器；`/back <任意>` 因含空白落到 router ⇒ 未知命令。
Phase 17 已把该条目的 `argumentHint` 删掉（诚实化），但**未修判定**。

### 1.5 `CMD-06` 与参考实现的命令缺口：`/tree` 是一等入口，我方只有只读清单 — `CONFIRMED`

**参考实现的 `/tree` 是「会话续跑点导航」，不是「打印一棵树」**（子代理读全 `showTreeSelector` + `navigateTree`，主代理复验）：

- 入口 `pi/packages/coding-agent/src/core/slash-commands.ts:22` `{ name: "tree", description: "Navigate session tree (switch branches)" }`
- 派发 `modes/interactive/interactive-mode.ts:3180-3183` → `showTreeSelector()`（`:5439`）→ `TreeSelectorComponent`（1435 行：搜索行、过滤模式、内联改名、复制选中项）
- **选中后**（`interactive-mode.ts:5525-5546`）：
  ```ts
  const result = await this.session.navigateTree(entryId, { summarize: wantsSummary, customInstructions });
  ...
  this.chatContainer.clear(); this.renderInitialMessages();
  if (result.editorText && !this.editor.getText().trim()) this.editor.setText(result.editorText);
  ```
- **语义**（`core/agent-session.ts:3866-4061`）：收集被放弃的条目 → 可选 LLM 分支摘要 → 重指叶（`sessionManager.branch(newLeafId)`）+ `_refreshFinalizedContext()` + `_restoreToolsFromTranscript()`；目标是 user 消息时把该消息**放回编辑器**重发
- **不是交互专属**：print/rpc 模式把 `navigateTree` 暴露给扩展（`modes/print-mode.ts:85-91`），内核 API 在 `agent-session.ts:3866`
- **`/tree` 不做 fork**：另开会话是 `/fork`/`/clone` 的事（`session-manager.ts:1517-1518` 注释：`append-only: use appendXXX() to add entries, branch() to change the leaf pointer`）

**我方现状**：能力**已经在**，但入口形态不同——`/back`（Escape 两次）打开 `rewindPicker`，
宿主实现（`cli/interactive/interactiveMode.ts:731-750`）做的是：

```ts
const dropped = await this.options.sessionManager.revertTo(sessionId, point.entryId,
  (abandoned) => this.options.sessionRuntime.summarizeAbandonedTurns(abandoned));
markContextUnknown(sessionId); showConversation(this.historyTarget()); ...
```

即**叶重指 + 分支摘要 + 提示放回**——与 pi 的 `navigateTree` 同构。
缺的只有两件：**一等命令入口**（`/tree` 或等价）与**非交互形式**。
`/entries tree`（`core/commands/entriesCommandRuntime.ts:86-102`）是**只读观察面**，
自述目标是外部同步客户端（`:16-18`），**从不写回**。

**判定**：`CONFIRMED`，且判定为**「功能在、入口无」**（与 `CMD-02` 同型，Phase 17 已修过一例）。
**方向**：加一等命令（可取 `/tree`），交互侧复用 `readSessionTree` 渲染选择器、复用现有 `rewind` 宿主；
非交互侧至少支持按 id 导航（对齐 pi 的 print-mode `navigateTree`）。`/entries tree` 保持只读。

### 1.6 `PRV-04` `btwCommandRuntime` 的静默吞错 — `PARTIAL`（比登记册描述**好**）

**登记册的断言**：`catch {}` 的注释说「兜底会说明」，但兜底**不区分**「模型没答」与「请求失败」。

**实测现状**（主代理读码）：兜底**确实区分**了两种「没答案」——用 `attempted` 标志：

```ts
if (!answer) {
  answer = attempted
    ? `Side question noted: "${question}".\n(The provider was asked and did not answer — a failed request or a timeout, not a missing credential.)`
    : `Side question noted: "${question}".\n(No provider credential is configured, so nothing was sent.)`;
}
```

**仍然成立的**：它仍**不区分失败类别**——超时、网络不通、模型拒答、`content_filter` 在兜底文案里是同一句。
`classifyProviderFailure` 已在手（`provider/registry/provider.ts`），只是没被用在这里。

**判定**：`PARTIAL`——登记册把「不区分凭据缺失与请求失败」当作缺口，**那一半已被修**；
真正的缺口收窄为「不区分失败类别」。**方向**：把 `classifyProviderFailure` 的类别带进兜底文案。

---

## 2. 会话持久化与记账

### 2.1 `SES-02` 陈旧锁夺取没有 fencing — `CONFIRMED`（**参考同样没有**）

**我方**：`session/store/lockStaleness.ts:16-19` 自认 `There is no fencing token to stop the first
from overwriting the second.`；阈值 `STALE_LOCK_AGE_MS = 60_000`（`:29`）。
获取：`session/store/sessionFileStore.ts:66` `fd = fs.openSync(lockPath, "wx")`，锁内容 `{pid, hostname, createdAt}`；
释放：`:80` `fs.rmSync(lockPath, { force: true })`——**无条件删除**。

**参考（子代理读上游源，主代理复验依赖声明）**：

- `pi` 依赖 `proper-lockfile@4.1.2`（`pi/packages/coding-agent/package.json:68`——**主代理已核实该行存在**）。
  该库**没有 fencing token**：staleness 是 `stat.mtime < Date.now() - stale`；
  它多的是**续期**（`utimes`）与**妥协检测**（`isMtimeOurs` 不匹配 ⇒ `ECOMPROMISED`，让持有者自知失锁）。
  pi 的会话状态写入**根本不再加锁**：`session-manager.ts:1187` `appendFileSync(this.sessionFile, ...)`。
- `opencode` 的 `packages/core/src/util/flock.ts` **名字叫 Flock 但不是 OS flock(2)**——用户态 `mkdir` lockdir 协议：
  `defaultOpts.staleMs = 60_000`（**与我方同值**）；meta 写随机 token 与 pid。
  它有两项我方**没有**的机制（主代理逐行复验两处）：
  ① **heartbeat 续期**——`:262-265` `fs.utimes(handle.heartbeatPath, new Date(), new Date())
     .pipe(Effect.ignore, Effect.repeat(Schedule.spaced(HEARTBEAT_MS)), Effect.forkScoped)`，
     而 `isStale`（`:150-161`）优先读 heartbeat 的 mtime ⇒ **活跃持有者不会被误判**；
  ② **release 前校验 token**——`:260-261` `if (current.token !== token) { throw new Error("Refusing to release: lock token mismatch (not the owner).") }`；
     另有 `LockCompromisedError`（`:125-134` 的 `exclusiveWrite` 失败即 `forceRemove` + 报错）。
  **token 仍不参与状态写**（只管 release），所以 fencing 依旧 `NOT-FOUND`；opencode 的会话状态走 SQLite。
- **另一处对照**：opencode 另有 `packages/core/src/util/effect-flock.ts`（Effect 封装版），
  同样只有 heartbeat 续期与 `LockCompromisedError`，**无 fencing**。

**判定**：`CONFIRMED`，但 **fencing 在任何参考里都 `NOT-FOUND`**——mtime staleness 是行业常态，
我方「no fencing」的自白即行业水准。**真正的差距是两项廉价缓解**：续期（避免活跃持有者被误判）
与 release 前校验 owner（避免苏醒的旧写者删掉接管者的锁）。我方的 `fs.rmSync(force)` 两点都没有。

**方向**：不加 fencing（与参考一致，且 Phase 17 §5-3 已按「如实降级」裁决）；
补 (a) 持锁期间续期、(b) release 前比对锁内 owner。两条都小。

### 2.2 `SES-06` parity 规则表绝大多数匹配不到生产者 — `CONFIRMED`（比登记册更彻底）

**我方**：`session/continuationEvidenceParity.ts:111` `if (!codingResult) { return []; }`。
**主代理独立复验**：`grep -n codingResult turn/projection.ts` → **零命中**；
`turn/projection.ts` 的 `concludeRun` 构造的 result 只有
`{status, terminalClassification, terminalReason, stopReason, transcript, sharedContext, finalOutput}`。

**子代理补充、复核者 `RvB18State` 独立复现、主代理抽查确认**：
不只是「规则前缀没有生产者」——**入口条件恒假**：`codingResult` 在 `turn/` 内 **0 命中**
（复核者用 `ripgrep` 与 `grep -rn | wc -l` 两种方法都得到 0），
`turn/projection.ts` 的 `concludeRun`（`:139`）构造 result 时只写
`{status, terminalClassification, terminalReason, stopReason, transcript, sharedContext, finalOutput}`（`:162-180`）。
**三个生产 `query.completed` 发射点全部不含它**（`turn/projection.ts:162/:180`、
`entrypoints/providerReadinessCliSurface.ts:15`、`core/shell/providerReadiness.ts:320`）；
带 `codingResult` 的事件只存在于 `test-utils` 夹具（`longSessionDurabilityProcess.ts:100/:109`、
`longSessionContinuityFixtures.ts:69/:108`）。

**消费方仍在**，但复核者指出范围应**收窄**：
`session/sessionResultParity.ts:80` 的 `if (!codingResult) { return []; }`（`collectEvidence`）、
`session/actionableFailureContinuity.ts:24` 的同款卫兵，
以及 `session/sessionContinuationProjection.ts:63-64` 的 allowlist
——**后者在 `session/` 而非 `session/continuation/`**，且与 parity 批次只**部分**重叠
（`claim-ledger` 与 `verify-blocker-kind`），**不宣称「同一批前缀」**。

**一处必须保留的活轨调用**（复核者补充）：parity **格式化器**仍被
`session/continuation/stoppedSessionContinuity.ts:200` 与 `resumeContextBuilder.ts:398` 调用；
它的 `codingResult` 来自 `sessionContinuityModule.ts:355-389` 的 `findLastCodingCompletionEvent`
——扫的是 transcript 的 `query.completed` 事件，而**生产从不产生**。
⇒ **要删的是那张恒空的规则表，不是这些调用点**。

**参考**：`pi` 无等价表面（`NOT-FOUND`）。连续性在 pi 里是**持久化产物**（compaction 摘要 + 会话条目），不是前缀规则表。

**判定**：`CONFIRMED`，且与 `.normproof/dispositions.md` 里
`verification/result/projection/mutation.ts` 那条裁定**完全同型**（「its only caller is itself
unreachable, so it cannot be repaired in place」）。登记册已判「删除安全，但需一次实机确认」。
**方向**：删除 `continuationEvidenceParity.ts` 及其测试；跑一个真实会话确认 resumed 摘要里不含 parity 行。

### 2.3 `SES-07` `listsBySession` 跨会话不回收 — `CONFIRMED`（参考里两种模式都有）

**我方**：`core/commands/todoCommandRuntime.ts:17` `const listsBySession = new Map<string, {items, nextId}>()`；
唯一回收点 `session/sessionReadSurface.ts:132` 的 `forgetSessionTodos(sessionId)`，只在 `deleteSession` 内。

复核者 `RvB18State` 找到**第二条泄漏路径**（主代理复验 `session/lifecycle/sessionLifecycleWrites.ts:214`）：
`discardIfEmpty` 在判定会话为空后**直接** `this.host.store.deleteSession(sessionId)`
——**绕过了** `SessionReadSurface.deleteSession`，因此**被丢弃的空会话永远不会 forget 它的 todo 表**。
⇒ 修复该条时**必须把这条路径也接上**，否则只修了一半。

**参考**（子代理给出，主代理复验 `WeakMap` 与 server Map 两处）：

| 模式 | 实例 | 位置 |
|---|---|---|
| **状态长在会话对象上**（主模式） | pi `SessionManager` 实例字段 | `pi/.../session-manager.ts:993-998` `private fileEntries… private byId… private leafId` |
| **WeakMap** | pi / opencode | `pi/.../agent-session.ts:405` `private readonly _entryIdsByMessage = new WeakMap<object, string>()` |
| **与我们完全同形**（进程级 Map + remove 时 delete） | pi server 变体 | `pi/.../experimental/server.ts:561` `const sessionPluginSelections = new Map<string, ResolvedSessionPlugins>()`、`:593` `.delete(metadata.path)` |

**判定**：`CONFIRMED`（切换会话只增不减），但**参考里既有更干净的模式、也有与我们同形的**。
严重度维持 `P3`。**方向**：低优先。若要修，最小改动是「切换会话时也清理」（对齐 pi server 的 remove 语义），
而非重构为对象持有。

### 2.4 `PRV-10` 用量遥测只在内存，跨 `--session-id` 归零 — `CONFIRMED`

**我方**（实机复现）：`observability/usageTelemetry.ts:225`
`const sessionTelemetries: Map<string, SessionUsageTelemetry> = new Map()`；
唯一写入者 `turn/step.ts:466` `recordSessionUsage(...)`；
`grep -rn "usageTelemetry\|getSessionUsage" session/` → **零命中**（无持久化/恢复）。
实机：`printf '/cost\n' | cheers` → `No completions have been recorded in this session yet, so there is nothing to count.`

**参考**：**两者都不维护内存台账，usage 长在持久化记录上，报告端重算**：

- pi：usage 附在 `AssistantMessage` 上（`pi/packages/ai/src/types.ts:559` `usage: Usage;`），
  随会话文件追加（`session-manager.ts:1187` `appendFileSync(...)`）；另有专条 `appendUsage(...)`（`:1244`）。
  报告一律重算：`pi/.../core/usage-totals.ts:67-69` 从 `entry.message.usage` 累加；
  `/cost` 等价物 `interactive-mode.ts:6486` `const usageBreakdown = getUsageCostBreakdown(entries);`
- pi 的 `durable` 更进一步：`pi/packages/durable/src/harness/usage.ts:24-25` 把 usage 写进
  一次会话的 `pi.usage` 文档，**在追加该条 entry 的同一事务里提交**（`generation.ts:430`、`tool.ts:455`）。
- opencode：SQLite 列（`opencode/packages/core/src/session/sql.ts:47-48`），增量更新（`projector.ts:102`）。

**判定**：`CONFIRMED`。**方向**：把 usage 快照随会话落盘（`state.json` 的既有扩展点）并在 resume 时载回；
或对齐 pi 的「从持久化条目重算」。前者改动小。

> **诚实边界**：`usageTelemetry.ts:144` 的注释提到模型 id 可含斜杠——恢复时必须按
> `provider/model` 整体键控，不能拆成两段。

### 2.5 `PRV-12` Google 次要请求用流式 URL 却按单个 JSON 读取 — `CONFIRMED`

**我方**（主代理逐字复验）：

```ts
// provider/request/completion.ts:76,93
const res = await fetchImpl(endpointUrl(request.provider.baseUrl, kind, request.provider.model), {...});
const text = endpointText(kind, await res.json());
```

```ts
// core/query/compaction/summarize.ts:135,157
const res = await fetchImpl(endpointUrl(request.provider.baseUrl, endpointKind(request.provider.endpoint), request.provider.model), {...});
const summaryContent = endpointText(endpointKind(request.provider.endpoint), await res.json());
```

**URL 侧**（主代理复验）：两个 Google 端点的 path **都是流式方法**——
`provider/endpoints/googleGenAI.ts:22` `const method = stream ? "streamGenerateContent" : "generateContent";`
且该端点在 `declareEndpoint` 里硬编码 `path: (model) => googlePath(model, true)`（**永远 stream=true**）；
`provider/endpoints/googleVertex.ts:78` `path: (model) => `/${encodeURIComponent(model)}:streamGenerateContent?alt=sse``。
而 `provider/endpoints/kinds.ts:250` 的 `endpointUrl` **只接受 `(baseUrl, kind, model)`**，
**没有任何参数能选非流式路径**。

⇒ **`googleGenAI.ts:22` 那个 `stream` 形参在生产里恒为 `true`**——
它存在但**没有任何调用者能传 false**，与 `THM-08`（`tuiMode: "stream"` 无行为）同型的「有参数无选择」。

**响应侧**：`readGoogleBody` 接受单个候选文档，**不接受 SSE 文本或数组**。

**影响面**：`/btw` 与压缩（`summarize`）的 Google 请求。
**证据边界**：Phase 17 W5-33 的温度测试**只证明 body 字段传递**，**没有真实提供方调用**，
不能推广为该通路成功——登记册原文已如此声明，本文确认。

**判定**：`CONFIRMED`。**方向**：由端点所有者明确区分「单次」与「流式」两条路径
（例如给 `endpointUrl` 加一个非流式变体，或把 `googlePath(model, false)` 接出去），
**或**统一复用已存在的流读取器；
**先对照底层 SDK 对两种方法的使用**，再以「URL 与真实响应格式成对」的合成测试验证。
**明确不做**：不新增第二份 Google 内容转换器（登记册已裁）。

**与 §8 的关系**：本条可以在**无凭据**下用「URL + 响应格式成对」的合成测试修复，
但要**确认哪条路径是对的**，需要一次真实请求（见 §8）。

---

## 3. 编辑与执行安全

### 3.1 `TOL-06` 多文件编辑没有事务 — `CONFIRMED`；**裁决应为「改承诺」而非「加事务」**

**我方**：`core/tools/registry.ts:539-540` 的 `edit` 工具声明 `required: ['path']`（单文件）；
`:697` 每次调用立即 `await executionService.writeTextFile({...content: finalContent})`；
`runtime/execution/service.ts:99` 原地写（无 staging/temp/rename）；
`captureSnapshotBeforeWrite`（`:89-91`）只为 `/undo`。
`edit/result/editCapabilityReadiness.ts:141-144` **已经如实报告**该能力缺失：
`blocked("atomic-rollback", [... "the implementation was removed by decision"])`。

**子代理核实并**（**主代理复验**）**更正了 CB-007 的两处字面表述**：

1. CB-007 称「`pi` 全仓 `rollback` 0 命中」——**字面已过期**。主代理实测（`grep -i -w 'rollback' --include=*.ts --include=*.md`，排除 `node_modules`）：
   **38 处**命中，其中 **26 处**在 durable/SQLite 的**存储事务**语境
   （如 `pi/packages/durable/src/storage/sqlite/node.ts:71` 的 `this.database.exec("ROLLBACK")`）；
   **其余 12 处**分布在**另外三类**语境——`packages/agent/docs/**` 的存储/事务设计文档
   （`harness.md:401` 的 `BEGIN IMMEDIATE` 讨论、`values.md:688` 的「rollback when a later write is invalid」）、
   `packages/chord/PLANNING.md:227` 的**模块重载**事务、以及测试夹具里的错误名/变量名
   （`agent/test/harness/pico3/watch.test.ts:51` 的 `throw new Error("rollback")`）。
   ⇒ **没有一处是文件编辑事务**，所以**结论（pi 无多文件编辑事务）成立**，但
   「全部在 durable/SQLite 语境」是一个**过强的表述**，已按实测更正。
   **正确引文应是**：`pi/packages/coding-agent/src/core/tools/` 内
   `rollback|transaction|revert|undo`（大小写不敏感）**零命中**（主代理实测 0，该目录 17 个文件，非空目录假象）。
2. CB-007 引用的 `edit/patch/plan/hunkSet.ts` 的 `single-target` **在当前树已不存在**
   （Phase 17 W6-34 已删该三角）。单目标契约现在体现在 `registry.ts:580`。

**参考的正解是 opencode 的措辞**（`opencode/packages/core/src/file-mutation.ts:205-206`，主代理逐字复验）：

```ts
// TODO: Design multi-file transactions / rollback if apply_patch needs atomic edits.
// Until then, edits are sequential and report partial application.
```

**判定**：`CONFIRMED`；行为上三方都不做事务，**唯一的差距是文档**：
opencode 把「顺序执行、部分应用」写成显式承诺，我方只在 `editCapabilityReadiness` 的 blocked 清单里记了「不做回滚」，
而**模型可见的工具 description（`registry.ts:539-540`）没有说明非原子性**。

**方向**：(b) **不改行为，改承诺**——在 `edit` 工具 description 与 readiness 说明里写明
「每个文件独立提交，非原子；中途失败时已提交的部分需 `/undo` 逐个恢复」。
与 `phase-12-decisions.md` CB-007 的既有裁决一致。

### 3.2 `TOL-07` 读后写窗口内没有内容复核 — `CONFIRMED`，**参考给出了正解**（本次研究最重要的发现之一）

**我方**：`core/tools/registry.ts:621` / `:648` 读原文 → `:697` 直接写 `finalContent`，**中间零比对**；
`runtime/execution/fileLock.ts:30` 的 `withFileLock` 是**进程内 `Promise` 队列**
（`const queues = new Map<string, Promise<void>>()`），`grep flock|fcntl` **零命中** ⇒ 非 OS 锁。

**参考**：

- `pi`：**不做复核**——`file-mutation-queue.ts`（**主代理读过全文，62 行**）键是 `realpath`、值是 `Promise` 链，
  **没有任何内容/mtime 比对**；`edit.ts:186` 读与 `:198` 写之间零比较。**与我方机制完全同构**。
- `opencode`：**做了**——`packages/core/src/file-mutation.ts:144-157`（主代理逐字复验）：

  ```ts
  const current = yield* fs.readFile(input.target.canonical)
  if (!sameBytes(current, input.expected)) {
    return yield* new StaleContentError({ path: input.target.canonical })
  }
  ```

  且 `tool/edit.ts:113-115` 把它映射为用户可见错误：
  `"File changed after permission approval. Read it again before editing."`
  **注意**：opencode 的锁同样是进程内的（`KeyedMutex`），其跨进程防护**靠写时比较而非锁**。

**判定**：`CONFIRMED`。**这是本轮唯一「参考侧有明确更优实现」的执行安全项。**
**方向**：在 `writeTextFile` 持锁处加可选 `expectedContent`；不一致抛冲突错误（对齐 opencode 的
`StaleContentError` 语义），edit 路径把读到的 `original` 作为 `expected` 传入。
**改动面**：`runtime/execution/service.ts` + `registry.ts:697` 调用处 + 一条回归测试。

### 3.3 `TOL-08` 进程树回收三处泄漏 — `CONFIRMED`（**参考同样存在这三条**，我方修复属自研）

**我方**：`runtime/execution/local.ts:46` `detached: process.platform !== 'win32'`；
`core/shell/platform/processTree.ts:65` `process.kill(-pid, "SIGKILL")`（**无 SIGTERM 宽限**）；
Windows 分支 `:54-57` `spawn(taskkill, ...)` **不 await**，只挂 `child.once("error", () => {})`；
收尾挂 `process.once("exit", cleanup)`（`:94-97`）——SIGKILL 时不执行，detached 子进程存活。

**参考（主代理逐处复验）**：

- pi 的 `killProcessTree`（`pi/packages/coding-agent/src/utils/shell.ts:187`）：Windows 分支
  `:191-200` **同样不 await**，只 `child.once("error", () => {})`；Unix `:208` **同样直接 `process.kill(-pid, "SIGKILL")`，无 SIGTERM 宽限**。
- pi 的 bash 工具同样 `detached: process.platform !== "win32"`（`core/tools/bash.ts:117`）。
- pi **没有** `process.once("exit")` 清理（grep 零命中）；清理挂在**显式信号处理器**上
  （`modes/print-mode.ts:58`、`modes/rpc/rpc-mode.ts:374`、`modes/interactive/interactive-mode.ts:4212`，后者用 `prependListener`）。
- **`NOT-FOUND`**：subreaper / cgroup / `prctl(PDEATHSIG)`（全 coding-agent grep 零命中）。
- pi 的两处**独有改进**：(1) `core/exec.ts:55-61` 的**扩展命令路径**有 `SIGTERM` → 5s → `SIGKILL`
  （但该路径不 detached，**不是** bash/进程树那条）；(2) `utils/child-process.ts:59` 的
  `waitForChildProcess`（`EXIT_STDIO_GRACE_MS = 100`）防「已退出的 shell 被脱离的后代拖着 stdio 不关」，
  **这是 stdio 悬挂问题，不是杀树**。

**判定**：`CONFIRMED`，但**三条参考几乎逐行同构地都存在**。⇒ 我方修复**必须标「自研」，不得伪装成对齐参考**。
**方向**：(1) Windows 分支 `await` taskkill 的退出（带超时）；(2) `killProcessTree` 先 `SIGTERM` 留 1–5s 宽限再 `SIGKILL`；
(3) 子孙逃逸 / 父进程被 SIGKILL 两条**改文档不改代码**（与 pi 一致的行为，如实声明）。
真回收需 subreaper/cgroup，Node 无原生绑定，成本远超收益（`[INFERENCE]`）。

---

## 4. 上下文、记忆与循环

### 4.1 `CTX-02` + `CTX-08` 硬编码持久化字面量 — `CONFIRMED`（**面数已按复核重算：4 个同型 + 1 个模型面 + 3 个部分派生**）

> **原稿写「5 个面」、登记册写「6 个」，两者都不准确。**
> 复核者 `RvA18CliSession` 逐个文件复算并把口径拆开后，主代理按同一口径重测（`grep -c health` 逐文件）：

| 分类 | 文件 | `health` 引用 | 字面量 |
|---|---|---|---|
| **A. 同型缺陷（4）**——输入里**没有 `health`**，只能印常量 | `memory/projectMemoryReviewSurface.ts:39-42` | **0** | 4 条 |
| | `memory/projectMemoryCandidateSurface.ts:35-37` | **0** | 3 条 |
| | `memory/projectMemoryInjectionSurface.ts:29-33` | **0** | 5 条 |
| | `context/compact/delivery/compactSessionSurface.ts:16-19` | **0** | 4 条 |
| **B. 模型面（1）**——同一批字面量，但**受众是模型**（进提示词）而非用户状态面 | `memory/projectMemoryInjectedContextFormatter.ts:29-36` | **0** | 4 条 |
| **C. 部分派生（3）**——**读了** `health`，但**仍**另印若干常量 | `memory/projectMemoryDeleteSurface.ts:40-41` ✅health | 3 | `:45-46` 两条 |
| | `memory/projectMemoryRecallSurface.ts:36-38` ✅health | 6 | `:41-42`、`:64-65` 各两条 |
| | `memory/projectMemoryStoreSurface.ts:29-32` ✅health | 8 | `:40-41` 两条 |

**结论**：
- **登记册的「6」是错的**——它把自己表格里标 ✅ 的对照行（`projectMemoryStoreSurface`）算进了缺陷侧；
- **原稿的「5」也不成立**——其表格只列了 4 个文件；
- **同型缺陷（输入缺 `health`、只能印常量）是 4 个**；若把「读了 health 但另有常量」也算上，是 **7 个用户面**；
  `projectMemoryInjectedContextFormatter` 是**第 8 个面但性质不同**（模型可见的提示文本，
  「Automatic memory injection: no」在那里是**对模型说明当前机制**，不是对用户报告状态）。
  ⇒ **施工时须先判定 B 那一面是否在范围内**（本文倾向：**不在**，它是提示词不是状态面）。

**实机证据**（复核者跑出）：`printf '/memory\n'` 打印 `- Persistence: not enabled`，
而 `printf '/memory status\n'` 打印**真实的** `- Store mode: explicit-local / - Store writable: yes`
——**同一进程、同一 store，两个面给出相反陈述**，这就是「字面量不随真实状态变」的直接证明。

**参考**（子代理核实，主代理复验 gemini 两处）：

- `pi`：**`NOT-FOUND`**——pi 没有任何 project-memory 功能。全部 `memory` 命中都是无关结构
  （`session-manager.ts` 的 `static inMemory(...)`、`InMemoryCodingAgentModelsStore`、测试后端）。
- `gemini-cli`（有真实 memory）：**全派生，零字面量**——
  `packages/core/src/commands/memory.ts:39-44` 逐行读 `config.getUserMemory()` 与 `config.getGeminiMdFileCount()`；
  inbox 子命令读活开关 `memoryCommand.ts:117` `if (!config.isAutoMemoryEnabled())`。

**判定**：`CONFIRMED`。**参考不支持「打印静态字面量」**（要么没这个面，要么全派生）。
**方向**：A 类 4 个面改读 `health`（delete/recall/store 已证明输入可用、渲染干净），而非删面。
**结构性前提**：`RenderProjectMemoryReviewSurfaceInput` **没有 `health` 字段** ⇒
修复要先把 store 穿进命令层（与 16-A 接通注入链同型的接线工作）。

### 4.2 `CTX-09` 五处单调增长的数组/映射 — `CONFIRMED`（**五处无界，全部复验**）

**我方**（主代理逐处 `grep`，**零容量常量**）：

| 位置 | 结构 | 事实 |
|---|---|---|
| `core/tools/readCache.ts:23` | `seenBySession` | 无 cap；`grep MAX_` 命中 6 处**全部是 offset/limit 语义**，非容量 |
| `context/compact/checkpoint/compactLiveCheckpoint.ts:67` | `checkpointsById` | 条目只原地改 status（`created→superseded→cleared`），**从不 delete**；`latestBySession` 会删，by-id 不会 |
| `context/compact/injection/compactInjectionState.ts:99-101` | `supersededCheckpointIds` | `[previous.checkpointId, ...previous.supersededCheckpointIds]` 单调头插 |
| `memory/projectMemoryInjectionState.ts:97-100` | `supersededInjectionIds` | 同款 |
| `memory/projectMemoryReviewState.ts:96-124` | `decisions` | `[...current, ...carried]`，历史条目永不清除 |

**参考的两条正路**（子代理给出，主代理复验常量与丢弃分支）：

1. **不持有该结构**：pi 的 read 工具每次 `ops.readFile(...)`，**没有 seen-read 缓存**（`NOT-FOUND`）；
   compaction 状态**派生自持久化会话条目**（`session-manager.ts:559-562` 注释
   `// Only the newest compaction at index zero contributes a checkpoint and summary.`）。
2. **显式封顶 + 丢弃标记**：pi 的 `nested-tool-calls.ts:26-31` 常量
   `maxCalls: 256, maxArgumentBytesPerCall: 8*1024, maxArgumentBytesTotal: 32*1024, maxErrorChars: 500`；
   `:71-74` 超限时 `this.complete = false; return undefined;`——**丢调用并打 incomplete 标记**，不是 LRU。
   bash 输出同思路：`truncate.ts:11-12` `DEFAULT_MAX_LINES=2000` / `DEFAULT_MAX_BYTES=50*1024`。
   pi 的 crash log 用 **count** cap：`core/crash-log.ts:18-19` `MAX_CRASH_RECORDS = 5`、
   `:139` `writeCrashLog([...readCrashLog(path), record].slice(-MAX_CRASH_RECORDS), path)`。

**判定**：`CONFIRMED`，五处**全部**无界。**方向**：(a) 按 pi 的封顶+标记模式给每处加上限；
或 (b) 学 pi 的 compaction——把可推导状态存为持久化条目、按需读取。
(b) 更彻底但改动大；`compactLiveCheckpoint` 与 `projectMemoryReviewState` 是**跨会话**的，优先级最高。

### 4.3 `LOP-01` Doom Loop 阈值过紧，且消息宣称了未做过的判断 — `CONFIRMED`

**我方**（主代理读码复验）：

- `turn/tools.ts:158` `const doomLoop = new DoomLoopDetector(3);`
- `core/query/doomLoopDetector.ts` 的输入只有 `{toolName, argsHash, timestamp}`——**从不比较结果**
- `turn/tools.ts:196` 的消息却断言：
  `` `Warning: Doom Loop detected! Tool '${call.name}' has been repeatedly executed ${repeat.repeatCount} times with identical arguments without state progression.` ``

  **主代理实测**：`without state progression` 仍逐字存在（`grep` 命中 `turn/tools.ts:196`）。

**参考**（子代理给出，主代理逐处复验）：

| 参考 | 判定输入 | 阈值 | 消息措辞 |
|---|---|---|---|
| **gemini-cli** | 参数 sha256（`:165-169`）**+ 流式内容块重复**（`CONTENT_LOOP_THRESHOLD=10`）**+ 第 30 轮起把含结果的历史发给诊断 LLM**（`:42`、`:574`） | 工具调用 **5** | `System: Potential loop detected. …`（`client.ts:1294`，**"Potential" 是免责**）；确定性路径的 detail **只陈述观测**（`:206`） |
| **opencode** | 同样只比参数（`session/processor.ts:363`） | **3**（与我方同值） | **不 block、不断言**——转成权限询问 `permission.ask({ permission: "doom_loop", ... })`（`:372`），UI 文案 `"Continue after repeated failures"` |
| **Claude Code** | `NOT-FOUND`（无工具级循环检测器，只有失败计数断路器） | — | — |

gemini 的 LLM 提示词**明确定义**了什么叫循环（`:77`）：
`alternating between actions is only a loop if the arguments and outcomes are substantively identical each cycle. If the assistant is modifying different code or getting different errors, that is debugging progress, not a loop.`

**判定**：`CONFIRMED`。我方是**唯一「只比参数却宣称状态判断」**的。
**方向**：两条正路——(i) opencode 式：消息只陈述观测到的事实，并转交用户裁决；
(ii) gemini 式：把结果纳入判定（至少比较 `isError` / 输出哈希）。
**最小改动**：删掉 `without state progression`（或兑现它）。阈值 3 与 opencode 相同，**不是缺陷**。

### 4.4 `OBS-04` MCP 网关每个 prompt 重建 — `CONFIRMED`，且**比登记册更严重**

**登记册的描述**：N 个 prompt = N 个 gateway = 每 stdio server 每次 `listTools` 起一个子进程。

**主代理读码复验并加重**：我们的 `core/mcp/client.ts:198` **每次调用**都 `spawn`：

```ts
const child = spawn(this.config.command, this.config.args ?? [], {
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: isWin,
})
```

它被 `listTools()`（`:111-113`）与 `invokeTool()`（`:146-148`）**都**经 `callStdioWithRetry` 走到。

复核者 `RvB18State` 又**加重了一层**（主代理复验 `core/mcp/gateway.ts`）：
`gateway.invokeTool`（`:186`）在每次调用前先跑一次 `client.listTools()` 做工具存在性检查：

```ts
// gateway.ts:186-189
const liveTools = await client.listTools();
if (!liveTools.some((tool) => tool.toolName === toolName)) { throw new McpGatewayBlockedError({ ... }) }
```

且 `snapshot()`（`:117-131`）是 `connectAll` 之后**逐 client** `await client.listTools()`。

⇒ **每个 prompt 的子进程数 = 1（snapshot 的 listTools）+ 工具调用数 × 2（每次先 list 再 invoke）**（每 server），
再乘上重试次数（`:179-184` 的 `callStdioWithRetry`）。
**这不只是「每 prompt 重建一次网关」，而是「每次调用都重建连接」。**

**参考**（子代理给出，主代理复验 `getClient` 与 lifecycle 两处）：

- pi 的 MCP 连接是**会话生命周期持有的**：
  `extensions/mcp/index.ts:791` `pi.on("session_start", ...)` → `:816` `const started = await Promise.all(enabled.map((server) => createConnection(server)))`；
  `:892-898` `pi.on("session_shutdown", async () => { ... await Promise.all(closing.map((connection) => connection.close())) })`。
- 复用逻辑（主代理逐字复验 `runtime.ts:240-246`）：
  ```ts
  getClient(): Promise<McpClient> {
    if (this.closed) return Promise.reject(new Error(`MCP server "${this.entry.name}" is shut down`));
    if (this.client?.connectionState === "connected") return Promise.resolve(this.client);
    this.opening ??= this.open().finally(() => { this.opening = undefined; });
    return this.opening;
  }
  ```
  即**一个 server 一条长连接，掉线才重连**。

**我方的结构性问题（子代理指出，主代理复验）**：
会话级容器**已经有位置**——`cli/runtime/cliSessionRuntimeFactory.ts:310` 每会话构造一次 `ShellSessionRuntime`；
但它**活得比会话切换久**（`runtimeContext` 就地变更，见 `runtimeContext.ts:143` 的 `applyShellSubstrateTransition`），
而 `CoreMcpGateway` 在构造时**冻结 `workspaceRoot`** ⇒
**盲目提升会切到错误项目的 MCP 配置**。这正是 Phase 15 判「需独立裁决、牵动 runtimeContext 生命周期」的原因。

**判定**：`CONFIRMED`，且**严重度应上调**（Phase 15 判为「性能非缺陷」的依据是「stdio 为请求/应答短进程，不累积」，
但实测是**每次调用都 spawn**）。**方向**：把 gateway 挂在 session runtime 上、**以 workspaceRoot 为键**，
在 substrate transition 时重建（`cli/interactive/lineLoop.ts:108` 已有 `refreshMcpGateway` 信号，
目前是 no-op 重绑定）；`snapshot()` 仍每次重读配置，配置编辑照样生效。

---

## 5. 平台与可观测性

### 5.1 `OBS-09` 日志只有时长上界，没有文件数上界 — `CONFIRMED`

**我方**（主代理读码复验）：`observability/rotatingFileSink.ts`
`:44` `this.maxHistoryDays = options.maxHistoryDays ?? 7`；
`:168` `const maxAgeMs = this.maxHistoryDays * 24 * 60 * 60 * 1000`；
`:182-186` 循环里**只有年龄判断** `if (now - fileDate > maxAgeMs) { fs.unlinkSync(...) }`——**无数量、无大小、无总量**。
分片数增长无界：`:156-160` `while (fs.existsSync(this.computeLogPath(part))) { part++; }`；
且**每个进程启动都建一个新分片**（`:26-27` 按 PID + 日期分片）。

**参考**（子代理给出，主代理逐处复验）：

- pi 的 crash log：**count + age 双上界**——`core/crash-log.ts:18-19` `MAX_CRASH_RECORDS = 5; MAX_AGE = 7*24*60*60*1000;`
  `:139` `.slice(-MAX_CRASH_RECORDS)`。
- pi 的 MCP 日志：**字节上界 + 单槽轮转**（最多 2 个文件）——`extensions/mcp/log.ts:10` `const MAX_LOG_BYTES = 5 * 1024 * 1024;`
  `:50-53` `if (this.size > MAX_LOG_BYTES) { if (this.currentSize() > MAX_LOG_BYTES) renameSync(this.path, `${this.path}.1`); ... }`。
- pi 的**会话文件无自动清理**（用户经选择器删除，`modes/interactive/components/session-selector.ts:654-656`，失败如实上报 `:683-687`）。
- `NOT-FOUND`：pi 里**没有任何纯时长**的日志清理策略。

**判定**：`CONFIRMED`；与 `crashLog` 的**双上界**对照，日志 sink 只有一半。
**方向**：在 `pruneStaleLogs` 的年龄清理之后，按 mtime 排序、超出 `maxFiles` 上限的最旧分片 `unlink`
（pi 的 `.slice(-MAX_CRASH_RECORDS)` 直接类比），或按总字节预算删除最旧直到达标。

### 5.2 `BRW-04` `closeSession` 无条件报告「资源已释放」 — `CONFIRMED`

**我方**（主代理读码复验 `browser/sessionManager.ts:534-557`）：
page/context/browser 三次 `close()` 各自 `.catch(() => {})`，外层再来一个 `try/catch`，随后**无条件**：

```ts
return { ok: true, output: "Browser session closed and resources released." };
```

注释说 `a browser that will not close is already gone`——**这是未经验证的假设**。

**参考**（子代理给出，主代理复验 shell.ts 与 opencode 两处）：

- pi **没有浏览器工具**（`utils/open-browser.ts:10-22` 只是 best-effort 拉起，无会话可拆），
  故直接类比为 `NOT-FOUND`。但 pi 在**三处**区分「已关」与「关不掉」：
  1. MCP stdio transport 的 close **观察而非假定**：`packages/mcp/src/transports/stdio.ts:160-174`
     `child.once("close", ...)` 才 resolve，期间 `SIGTERM` → `SIGKILL` 逐级升级；
  2. bash 工具**把信号杀映射为非零退出码**：`core/tools/bash.ts:158-161`
     `// A signal-killed shell has no exit code. … so callers do not mistake the termination for a successful command.`
  3. MCP 连接状态机把掉线变成可见状态：`extensions/mcp/runtime.ts:424-428` `this.state = "disconnected"`。
- opencode：拆解失败**视为缺陷**（`Effect.orDie`）且原因进结果
  （`packages/opencode/src/tool/shell.ts:549-554`、`:567-576`）。

**判定**：`CONFIRMED`。**方向**：保留状态重置，但**收集**三次 close 的 rejection
（去掉逐调用 `.catch(() => {})`），失败时返回 `{ ok: false, failure: { kind: "close-failed", reason, nextAction } }`；
`process.once("exit")` 那处（`:201-204`）维持 best-effort（那里没有读者）。

---

## 6. 死代码与投影

### 6.1 `TOL-05` 未逐一核验的面 — `OPEN`（记录，非缺陷）；**参考侧给出了审计靶子**

**登记册列出的未核验面**：内置工具逐字段（已由 `TOL-04` 结清）、编辑路径原子性与读后写竞态（已由 §3.1/§3.2 结清）、
执行运行时超时/上界/进程树（已由 §3.3 结清）、**权限门 `turn/tools.ts` → `core/query/toolPolicy.ts` 的逐决策清单**。

**参考侦察结论**（对「最后一个未结清面」直接有用）：

- pi **没有内建权限门**——决策权委托给扩展（`docs/security.md:3`
  `Pi can read, change, and execute files with the permissions of the account that started it, and it does not ask for approval before every tool call.`），
  契约只有两字段 block 结果（`packages/agent/src/types.ts:49-56`）。⇒ **pi 侧 `NOT-FOUND`，不能作为对照靶子**。
- **gemini-cli 恰恰是所需形状**（子代理给出，主代理复验三处）：
  入口 `packages/core/src/policy/policy-engine.ts:610` `async check(toolCall, serverName, toolAnnotations?, subagent?, skipHeuristics = false): Promise<CheckResult>`；
  决策枚举 `policy/types.ts:11-15` `export enum PolicyDecision { ALLOW='allow', DENY='deny', ASK_USER='ask_user' }`；
  **可 diff 的规则表**是 TOML：`policy/policies/write.toml:32-40`

  ```toml
  [[rule]]
  toolName = "replace"
  decision = "ask_user"
  priority = 10
  interactive = true

  [[rule]]
  toolName = "replace"
  decision = "allow"
  priority = 15
  modes = ["autoEdit"]
  ```

  另有优先级带（`policy/config.ts:379-407`：Admin 5.x > User 4.x > Workspace 3.x > Extension 2.x > Default 1.x）。

**我方现状**：`core/query/toolPolicy.ts` 的 `evaluateToolPermissionScope` 返回
`{requiresEscalation, denied, operation, target, reason}`，路径为 `READ_ONLY_TOOLS` 表 +
bash 前缀分类 + scope 三分支 + deny 规则优先——**决策散在 if-else 链里，没有枚举化产物、没有可 diff 的规则文件**。

**判定**：`OPEN`（记录项）。**方向**：Phase 18 的审计切片应**仿 gemini 的形状**——
把每条决策路径落成可 diff 的枚举 + 带优先级的规则表，而不是隐式 if-else 链。
这条本身是**审计方法**，不是「照抄 gemini 的 policy engine」。

### 6.2 `CDE-01` / `CDE-02` — 已在 Phase 17 处置，`OPEN` 集合外

`CDE-01`（完全不可达 12 文件）与 `CDE-02`（`edit/patch` 三角）**在 Phase 17 W6 已逐簇处置**
（`c13fa25d`、`06b33ffb`、`48123a32` 等）。本文不重复；仅记录一处**对照口径的漂移**：
登记册 §12 说「完全不可达 **12** 文件 / 1,349 行」，而 Phase 17 §8.9 的最终闭包清单与之不同
（Phase 17 说「旧表的 37 文件包含重叠候选和活跃公共导出，**不能当作删除配额**」）。
⇒ **口径以 Phase 17 §8.9 为准**，§12 的数字是删除前快照。

### 6.3 `CDE-04` `index.ts` 的公共包 API 岛 — `WONTFIX`（Phase 17 已裁，不再列入）

裁决理由（Phase 17 §8.9）：包 `main` 已指向 `dist/index.js`，**CLI 可达性不能退役公共包契约**。
`index.ts` 的导出、`actionCache`、模拟执行器、`runtimeManifest` 等已追加 `.normproof/dispositions.md`。
**Phase 18 不重开**。

---

## 7. 12 号文档 §10 的四项未覆盖面（本轮补做）

### 7.1 `browser/**` 逐模块 real-vs-demo 判定 — **补做：四分类重算，与登记册一致**

**方法**（可重跑）：自建 ESM **值边**可达图（`import`/`export … from`，剔除 `import type`，
`.js` specifier 回落到 `.ts`），三个种子：`core/tools/browserToolUnified.ts`（模型侧）、
`core/commands/browserCommandRuntime.ts`（`/browser` 命令侧）、`entrypoints/cli.tsx`（全入口）。

```
browser 非测试模块总数        167
  REAL       （模型侧闭包）     7
  FIXTURE    （仅 /browser）   143
  ASSEMBLED  （仅 cli 可达）    12
  DEAD       （cli 也不可达）    5
```

| 类别 | 模块 |
|---|---|
| **REAL（7）** | `capabilityModel`、`networkAllowlist`、`originPolicy`、`playwrightRuntime`、`sessionManager`、`stealthPreload`、`urlAdmission` |
| **ASSEMBLED（12）** | `actionCacheEntry`、`cliExecutorInjection`、`controlledNetworkRunnerManifest`、`externalNetworkRunnerManifest`、`persistentReceiptCache`、`receipt/{compaction,integrity,lock,manifest,recovery,retention,store}` |
| **DEAD（5）** | `actionCache`、`playwrightEvidence`、`runtime/core/directionDecision`、`runtime/core/executor`、`toolServerBackendComparison` |

**与登记册 BRW-00 的对照**：登记册记 `164 / REAL 7 / FIXTURE 140 / ASSEMBLED 12 / DEAD 5`。
本文实测 **167 / 7 / 143 / 12 / 5**。**差额 3 全部来自 Phase 17 W6-38**：
`8adc76f9` 以 **rename** 把活跃 smoke 的三模块从 `core/harness/` 移入 `browser/smoke/`
（`git show 8adc76f9 --name-status`：`R096 core/harness/browserPublicReadOnlyWebSmokeConfig.ts → browser/smoke/config.ts`，
`R082 …Report.ts → browser/smoke/report.ts`，`R090 …Runner.ts → browser/smoke/runner.ts`）——
搬家前它们**不在** `browser/` 下、不计入那个 164，搬家后计入 ⇒ **表没随之更新**
（属于「各轮记录都写了、汇总表没同步」的同型漂移）。

⇒ **判定不变**：REAL 7 个与 DEAD 5 个与登记册完全一致；FIXTURE 143 = 140 + 3。
**登记册 BRW-00 应把 `164` 更正为 `167`**（本文记录，施工轮更新）。

**「逐行判定」仍**未**做**：本文给的是**可达性分类**。真正的「逐行 real-vs-demo」
需要一个模块一个判据（例如：该模块是否在有 manifest 时执行真网络、无 manifest 时是否可能伪造成功）。
**一处被复核者推翻的量化指标**（原稿写「23 个模块含 `ok: true`，全部在 FIXTURE 侧」）：

复核者 `RvC18SelfMarked` 用 `grep` 复算后指出——**原稿错了**。主代理重算确认：

```
含字面 `ok: true` 的非测试模块   25（不是 23）      出现次数 93（这一项对）
   REAL        2 个（11 处）  sessionManager.ts(6)、playwrightRuntime.ts(5)
   ASSEMBLED   5 个           actionCacheEntry、controlledNetworkRunnerManifest、
                              externalNetworkRunnerManifest、persistentReceiptCache、receipt/manifest
   FIXTURE    18 个
```

**原稿的两个错误**：(1) 模块数是 **25** 而非 23；
(2) 「REAL 侧 0 个」**不成立**——`sessionManager.ts` 的 `ok: true`
（`:305` `return { ok: true, url: this.currentUrl, title: this.currentTitle };` 等 4 处运行时返回）
与 `playwrightRuntime.ts` 的 5 处都在**模型侧真正执行的路径**上。

**更正后的判定不变**：`sessionManager`/`playwrightRuntime` 里的 `ok: true` 是**真实 Playwright 结果**
（真实执行成功就是成功），**不是 demo-vs-real 的气味**；
⇒ 「逐行判定的重点在 FIXTURE 143」这一结论**仍然成立**，但**不能再用「REAL 侧 0 个」当依据**。
**教训**（与 13 号册 §16.3 同型）：把「某类字面量的分布」当成「demo 判据」是**只看了一层**——
`ok: true` 在真实路径上是正确用法，在夹具里才是可疑用法，**同一个字面量在不同定位下含义相反**。

### 7.2 键位与文档的双向 diff — **补做：结论是「不需要 diff，因为根本没有文档页」**

**自 Phase 12 起被三度拦截（`content_filter`）、此后无任何文档提及的那一项。**
本轮实测结论（部分**推翻了该项的前提假设**）：

1. **我方没有任何键位参考文档页**。`grep` 全仓 markdown：
   只有 `.wiki/` 里的**历史研究笔记**（`phase-4/5/7-pre-research.md`、`04-terminal-interaction-and-presentation.md`、
   `tui-live-path-defects.md`）提到具体按键，**没有 `docs/keybindings.md` 等价物**。
   参照 pi：`pi/packages/coding-agent/docs/keybindings.md` 是**正式文档页**，
   且 `docs.json:153` 注册进文档索引、`core/system-prompt.ts:158` 把它**写进系统提示**
   （`When asked about: … keybindings (docs/keybindings.md) …`）——
   所以 pi 里「键位→文档→模型」是一条**完整链路**。
2. **我方表内部是自洽的**（双向 diff **无漂移**，实测）：

   ```
   KEY_ACTIONS 默认键（50 个 distinct）  −  KEY_BINDINGS 键（55 个 distinct）  =  []
   KEY_BINDINGS − KEY_ACTIONS = [click, drag, paste twice, shift+drag, wheel]   ← 全部是鼠标/手势行
   ```

   且有一条**漂移测试**钉住两边一致：`cli/interactive/keyGuide.test.ts:5-9`
   （`keeps default keyboard chords in sync with the display catalogue`），
   主代理实跑 `keyGuide + keymap + keybindings` **71/71 通过**。
   Phase 17 W2-17（`702c1f0d`/`c49a6869`）已让 `/hotkey` 读**解析后的绑定表**（`keybindings.ts:286-300` 的 `guide()`）。

**⇒ 该项的真实缺口不是「表与文档漂移」，而是「表与文档之间没有文档」**：
用户重绑定后 `/hotkey` 正确反映，但**外部读者（模型、新用户、仓库文档）没有任何可读的键位页**，
而 pi 有且把它接进了系统提示。

**判定**：**前提更正**（从「双向 diff 未做」改为「文档页缺失」）。**方向**：见裁决 §4。
**顺带记录一处 pi 的对照**：pi 的 `/hotkeys` 输出（`interactive-mode.ts:6637-6705`）
是**手写的 Markdown 表格**（含硬编码的 `**Navigation**` / `**Editing**` / `**Other**` 分组与动作描述），
**不是**从绑定表派生的——即 pi 自己在**展示**这一层也有第二份手写清单。
我方 `renderKeyGuide`（`chrome/keys.ts:107-129`）从表派生，**在这一点上比 pi 更好**，不应退回去。

### 7.3 `session/{continuation,recovery,replay,export}` 逐模块审计 — **补做：可达性 + 缺陷面**

**规模实测**：`continuation` 16 prod + 9 test；`recovery` 11 + 6；`replay` 5 + 2；`export` 4 + 2（**共 36 prod**）。

**可达性（值边，从 `cli.tsx`）**：`continuation` 16/16 可达；`export` 4/4 可达；
`recovery` **10/11**（`types.ts` 不可达）；`replay` **4/5**（`types.ts` 不可达）。
两个不可达的 `types.ts` **只被类型引用**——按本仓口径**是契约不是死码**，属 `CDE-04` 同类。

**缺陷面**（本文实测，非逐模块读，如实说明）：
**该域最强的一条是 `SES-06`**（见 §2.2）：`continuationEvidenceParity.ts` 的入口条件恒假，
其规则的 69 个前缀里只有 2 个有生产者。同域另三处消费面
（`sessionResultParity.ts:165`、`sessionContinuationProjection.ts:63-64`、`actionableFailureContinuity.ts:24`）
**与它同构**（`if (!codingResult)` 守卫），因此**该簇应整体处置**。

**未做**（如实）：36 个模块的**逐模块行为正确性**（往返、边界、损坏输入下的降级）
本轮**未做**；`replay`/`export` 的往返正确性未验证。**列入 Phase 18 的可选审计切片**（见裁决 §5）。

### 7.4 真实 provider 端到端 — **已执行**（见 §8）

---

## 8. 真实 provider 验证：**已执行**（2026-10-01）

**背景**：13 号册与 11 号文档里的一批结论因**无凭据**只能用合成块/读码，标注为 `[INFERENCE]`：
`D2`（Anthropic `budget_tokens` 是否 400）、`D3`（`thinkingSignature` 往返）、`D4`（reasoning 模型是否拒 `temperature`）、
token 估算误差、`PRV-12`（Google 次要请求的 URL/解码契约）、四端点的逐字段请求形状与流边界、
12 号 §6 的全部「已复验（合成块）」结论。

**已执行**：维护者提供了中转站 `https://ai.onyxaxis.org/v1` + `ONY_API_KEY`。
完整探测、逐条 `[INFERENCE]` 的解除与限定、以及两个真实端到端回合的记录见
[`phase-18-decisions.md`](phase-18-decisions.md) **§9**。

**一句话结论**：OpenAI 兼容 ✅ / Anthropic 原生 ✅ / **Google 原生 ❌（405）**；
`D2`、`D4` 两条 `[INFERENCE]` 在本中转站**均不触发**（但**不能**据此说不必修——
中转站做了协议适配，官方端点仍未知）；`PRV-12` **无法**在该中转站验证。

下列「可执行清单」保留为**方法记录**（后续换另一家中转站时照此复用）。

**仓库已备好的形状**（主代理核实）：`openai-compatible` 正是为「用户自备 host + key + model」设计的
（`core/providers/facts.ts:112` `apiKeyEnvVar: "OPENAI_COMPATIBLE_API_KEY"`，
`compatibleStyle: true`），现成门禁直接吃环境变量：

```
CHEERS_REAL_PROVIDER_SMOKE=1
CHEERS_REAL_PROVIDER=openai-compatible      # 或 google / antigravity / claudecode
CHEERS_REAL_API_KEY=<key>
CHEERS_REAL_BASE_URL=<中转站 url>
CHEERS_REAL_MODEL=<model id>
CHEERS_TEST_ROOT=/tmp/cheers-test/<gate>
HOME=/tmp/cheers-test/<gate>-home
```

对应脚本：`npm run verify:provider-readiness:real`、`verify:lightweight-chat:real`、
`verify:real-user-capabilities:candidate-mutation:real`。
凭据路径**只通过** `CHEERS_REAL_HOME` 的显式 opt-in gate 消费（`agent-rules/provider-and-secret-boundary.md`），
**绝不写入仓库**。

**三条必须先确认的前提**（否则拿到 URL/key 也验不了对应的条目）：

| 想验证的 | 需要中转站暴露 | 否则 |
|---|---|---|
| `D4`、openai 侧行为、token 估算 | `/v1/chat/completions`（OpenAI 兼容） | — |
| `D2` `budget_tokens` 400、`D3` `thinkingSignature` | `/v1/messages`（**Anthropic 原生**，非兼容层） | 只能继续标 `[INFERENCE]` |
| Google GenAI / Vertex 形状、`PRV-12` | `/v1beta/models/<m>:streamGenerateContent` | 同上 |

**两条与账号无关、给 URL/key 也**无法**解除的**（如实记录，避免误期待）：

- `M3` Device Code（RFC 8628）与 `M6` Copilot/Anthropic 订阅 OAuth——中转站 API key 走 key 认证，
  **完全不经过** OAuth 授权码/设备码流程。
- **16-L Bedrock 端到端**——正确性一半在 SigV4 签名（中转站不校验签名，AWS 会）；
  仓库已有 AWS 官方测试向量钉住签名算法，端到端仍只能 `[INFERENCE]`。

**两条实操约束**（主代理核实）：CLI **没有** `--base-url` / `--model` 参数
（`cliArgs.ts` 只有 `--provider`、`--api-key`），baseUrl/model 只能来自 config 的
`providerCredentials.<provider>` 或 `/connect login … --base-url … --model …`；
且 model id **不在 catalog 里**时会退回 `DEFAULT_REQUEST_SHAPE`
（`core/models/requestShape.ts:96-119`：`max_tokens`、允许 temperature、`vision: false`），
上下文窗口无数 ⇒ 窗口估算会偏。

---

## 9. 子代理结论的复验记录

**派遣**：5 个只读子代理，并发 5，模型 `vsllm/glm-5.3-api:max`（`.omp/config.yml`）。
**全部成功返回**（56m41s / 32m50s / 32m30s / 38m59s / 26m12s）——
**无 `content_filter`、无 402**（对比 Phase 16 的 402 与 Phase 17 的 `content_filter`）。

**复验方式**：每条**载重**断言由主代理在该参考树的当前 HEAD 上重跑 `grep`/读码，
而非采信子代理的引文。以下是**更正、缩小或加重**的记录。

### 9.1 主代理**更正**了子代理的 1 条

| # | 子代理断言 | 主代理核实 | 处置 |
|---|---|---|---|
| 1 | `CTX-08`：「**6** 个 surface 打印硬编码字面量」 | 逐文件复验：缺陷侧是 **5** 个。`projectMemoryStoreSurface.ts:29` 读 `health.mode`，是**正确的那一个**，被误计入；`projectMemoryDeleteSurface.ts` 是**部分派生**（同时输出真实 `health.mode`/`writable`） | §4.1 更正为 **5 个面** |

> 注：`CTX-08` 的这个数字**原本就是登记册写的**（子代理沿用了它）。更正后应回写 13 号册。

### 9.2 主代理**加重**了子代理的 1 条

| 子代理断言 | 主代理核实 | 处置 |
|---|---|---|
| `OBS-04`：「每个 prompt 一个网关 ⇒ 每 server 每次 `listTools` 起一个子进程」 | 读 `core/mcp/client.ts:198`：`spawn` 在 `callStdioWithRetry` 内，被 `listTools()` **与** `invokeTool()` **都**调用 ⇒ **每个 prompt 的子进程数 = 1 + 工具调用次数**，不只是 1 | §4.4 加重；**严重度应上调**（Phase 15 判「性能非缺陷」的前提「stdio 不累积」不成立） |

### 9.3 主代理**更正了登记册**（本轮最值钱的记录）

| 登记册/CB 的断言 | 主代理实测 | 处置 |
|---|---|---|
| CB-007：「`pi` 全仓 `rollback` **0 命中**」 | 全仓 **33 处**命中，但**全部**在 durable/SQLite 会话存储事务语境。**结论仍成立**，引文应改为 `pi/packages/coding-agent/src/core/tools/` 内 **0 命中** | §3.1 更正 |
| CB-007 引用 `edit/patch/plan/hunkSet.ts` 的 `targetBinding: "single-target"` | 该文件**已不存在**（Phase 17 W6-34 删除该三角）；单目标契约现在体现在 `registry.ts:580` | §3.1 更正 |
| 登记册 BRW-00：`TOTAL browser non-test modules: 164` | 实测 **167**（差额 3 = Phase 17 `8adc76f9` 移入 `browser/smoke/` 的 3 模块，**表没随之更新**） | §7.1 更正 |
| 登记册 `PRV-04`：「兜底不区分凭据缺失与请求失败」 | `btwCommandRuntime.ts:45,48,89` 的 `attempted` 标志**已区分**（该修复在 `4429a89c`，早于 Phase 17 规划）；真正剩下的缺口只是**不区分失败类别** | §1.6 缩小为 `PARTIAL` |
| `phase-17-decisions.md` §1.2：「移出 22 项」 | **通篇无该清单**；本文重算得净 **21** 条 | §0.1 更正并列出清单 |

### 9.4 复验后**降级或缩小**的项

| 项 | 初判 | 复验后 |
|---|---|---|
| `CMD-05`（`--` 终止符） | 「与 CMD-01 同源的行为缺陷」 | 参考在**斜杠命令层同样没有 `--`**（`pi` 的 `--` 只在 CLI 层，`args.ts:82`）⇒ **不是「对齐参考」**，是自研标准完善，优先级下调 |
| `TOL-08`（进程树） | 「三处泄漏」 | **参考三条几乎逐行同构地都存在**（pi 的 Windows 分支同样不 await、Unix 同样无 SIGTERM 宽限）⇒ 修复必须标 **`自研`**，且「真回收」成本远超收益 |
| `SES-02`（fencing） | 「缺少安全保证」 | **fencing 在所有参考里 `NOT-FOUND`**；opencode 的 `staleMs` 与我方同为 60_000 ⇒ 我方自白即行业水准；真实差距只是**续期**与 **release owner 校验** |
| `LOP-01`（阈值 3） | 「阈值对『读』太紧」 | opencode 的 `DOOM_LOOP_THRESHOLD` **同为 3** ⇒ **阈值不是缺陷**；唯一确认的缺陷是**消息宣称了未做过的判断** |

### 9.5 仍然未复验的（如实列出）

- `SES-02`：`proper-lockfile@4.1.2` 的**内部机制**读自上游源
  （`pi` 树里未签入 `node_modules`）；主代理只核实了**依赖声明**在
  `pi/packages/coding-agent/package.json:68`。⇒ 该库的续期/妥协检测细节标 `[INFERENCE-依赖上游源]`。
- `SES-06`：**实机确认未做**（只做了读码确认「入口恒假」）。
  登记册已要求「删除前需一次实机确认」，施工时必须补。
- §7.3 的 36 个 `session/{continuation,recovery,replay,export}` 模块的**逐模块行为正确性**未做。
- §7.1 的 **143 个 FIXTURE 模块逐行** real-vs-demo 判定未做（只给了可达性分类与「`ok: true` 分布」这一量化代理）。
- `pi` 的 `docs/keybindings.md` 是否由脚本生成：**未查到生成器**
  （`grep keybindings.md` 只命中 `docs.json` 注册与 `system-prompt.ts` 的提示），
  故判定为**手写文档**；若存在生成器，§7.2 的结论「我方缺文档页」不变，但「pi 无第二份清单」的措辞需改。

---

## 10. 与 `.normproof/dispositions.md` 的交叉核对（协议要求）

| 本册条目 | dispositions 里已有？ | 处置 |
|---|---|---|
| `SES-02`（无 fencing） | ✅ 有同型条目（`lease`/`contract-seam-inert` 的处置方式：「如实降级其保证」） | 本文**照同一方式**处理，并**建议**补续期与 release owner 校验这两条廉价缓解 |
| `SES-06`（parity 恒空） | ❌ 无，但有**完全同型**的先例：`verification/result/projection/mutation.ts`（「its only caller is itself unreachable, so it cannot be repaired in place」） | 本文据同型先例判「删除安全但需一次实机确认」 |
| `CDE-04`（`index.ts` 岛） | ✅ 有（`unreachable-code-retention`，2026-09-30 追加） | **不重开**，Phase 17 已裁 `WONTFIX` |
| `TOL-06` / `TOL-07` | ❌ 无 | 见 §3.1 / §3.2 |
| `OBS-04`（MCP 网关） | ❌ 无 | Phase 15 曾判「需独立裁决」，本文给出可实施的提升形态 |

**结论**：本文的 21 条候选里，**只有 2 条**与既有 disposition 直接重叠（一条同型、一条已裁定），
其余 19 条是**新信息**——再次说明登记册式的常驻盘点比「每阶段重扫」有效。

---

## 11. 未接入 TUI 的功能（13 号册 §11bis）

> 维护者点名项：「是否存在没有接入 TUI 的功能」。该节有两条 `OPEN`，
> 且**编号与 §10 的 MCP 域 `OBS-03`/`OBS-04` 冲突**（见 §11.3）。

### 11.1 sidebar `/sidebar watch` 是「同步吐 N 帧」而不是实时面板 — `CONFIRMED`

**我方**（主代理读码复验）：

```ts
// presentation/sidebar/sidebarLivePanelCommandRunner.ts:29-31
const frames = Array.from({ length: input.contract.frameCount }, () => runtime.tick());
const output = frames.map((frame) => renderSidebarLivePanelFrame(frame)).join("\n");
```

- `frameCount` 默认 **1**（`sidebarLivePanelCommandContract.ts:34` 的 `frameCount: 1`）
- `presentation/sidebar/*.ts` 内 `setInterval`/`setTimeout` **零命中**（主代理实测）⇒ **没有 tick 源**
- `runtime.tick()` 无参 ⇒ 每帧的 `snapshot` 与 `events` **不变**
- 自述证据串里写着 `no-indefinite-loop`、`read-only`——**它自己承认这是一次性输出**

**判定**：`CONFIRMED`。`watch`/`live` 这两个名字**承诺了持续更新，得到的是静态快照**。
**低成本选项**（登记册已给）：(a) 改名为 `/sidebar snapshot`（诚实）；(b) 真接一个 tick 源（需要 TUI 侧栏容器，**产品决定**）。
**参考**：pi 的实时面板是 `waitForChildProcess` + 流式渲染的组合（§3.3），**没有**「打印 N 帧」这个形态（`NOT-FOUND`）。

### 11.2 sidebar 事件流只由命令结果驱动 — `CONFIRMED`（**不是缺陷**，是定位问题）

**我方**：`emitCommandResultToSidebar` 的调用者**全部是命令实现**（主代理实测：
`compactCommandRuntime.ts:73,84`、`warmupCommandRuntime.ts:25,36`、`browserCommandRuntime.ts:23,59`）；
`context.sidebarEventSink` **从未被生产装配点赋值** ⇒ `sidebarEventSinkForContext` 每次走
`?? createSidebarEventSink({...})` 的第二分支，其 `DEFAULT_SIDEBAR_LIVE_EVENT_STORE` 是**模块级单例**
（靠 `sessionScopeId` 过滤，**有隔离，不是缺陷**——与 `SES-01` 的 `/todo` 单例不同）。

**判定**：`CONFIRMED`。真正缺口是**事件源单一**：面板的「Recent activity」永远只反映用户敲过的命令，
不反映 agent 实际做了什么。**方向**：把 `turnSink` 的事件面接进来——**但前提是决定做分栏侧栏**（产品决定，登记册已记）。

### 11.3 ⚠️ 编号冲突（本文发现，需回写 13 号册）

13 号册**有两组 `OBS-03`/`OBS-04`**：

| 位置 | 内容 |
|---|---|
| §10 平台集成（第 1877 / 1917 行） | `OBS-03` 钩子事件消费者、`OBS-04` MCP 网关每 prompt 重建 |
| §11bis 未接入 TUI（第 2259 / 2289 行） | `OBS-03` `/sidebar watch`、`OBS-04` sidebar 事件流 |

登记册 §0.1 明文规定「条目号一经分配**永不复用**」，且「跨轮次引用一律用条目号」——
**当前引用 `OBS-03`/`OBS-04` 必然有歧义**。本文档统一按「§10 / §11bis」限定，
并**建议**把 §11bis 的两条改号为 `OBS-11`/`OBS-12`（或 `SBW-01`/`SBW-02`）。
**这一条不是缺陷，是登记册自身的一致性问题**，施工轮修。

### 11.4 `OBS-10` 技能发现的优先级 — `STALE`（已核实健全，留档）

不作为 Phase 18 候选。

---

## 12. 复核轮补记（2026-10-01）：本文的**更正**与**新增事实**

> 复核过程、裁决修正与新增交付项见 [`phase-18-decisions.md`](phase-18-decisions.md) §10；
> 新增条目定义见 13 号册 §20。本节只记**与研究结论直接相关**的内容。

### 12.1 本文 §4.1（`CTX-02`/`CTX-08` 面数）

**维持三方复核后的定稿**：**4 个同型 + 3 个部分派生 + 1 个模型面**。复核轮未再改动。

### 12.2 本文 §3.3（`TOL-08`）与 §2.1（`SES-02`）

**维持**：参考侧同构存在 / fencing 全面 `NOT-FOUND`。复核轮**未推翻**，
只**新增** `SES-09`（空锁 60s 阻塞）作为 `SES-02` 同域的另一条（见 §12.4）。

### 12.3 本文 §1.6（`PRV-04`）与 §4.3（`LOP-01`）—— 复核确认

- `PRV-04`：缺口确实是**不区分失败类别**——维持。
- `LOP-01`：`without state progression` **逐字仍在**（`turn/tools.ts:196`）；检测器输入确只有
  `{toolName,argsHash,timestamp}`。**补充确认**：检测器**有** `findRepeatingCycle`
  （`core/query/doomLoopDetector.ts:18,58,91`，`cycleThreshold` 5）⇒ 13 号册「只比参数」措辞应收窄——
  检测器比的是**参数序列的重复模式**，仍**从不看结果**，故「宣称状态判断」这一缺陷成立。

### 12.4 **新增事实**（本文未覆盖；详见 13 号册 §20.1）

| 发现 | 一句话 | 级别 |
|---|---|---|
| **`PRV-13`** | `googleGenAI` 主流式路径缺 `?alt=sse`（同仓 `googleVertex` 有）⇒ 主回合静默空答案 | **P1** |
| **`PRV-14`** | SSE 多行 `data:` 用 `join("")`（应为 `join("\n")`）；同仓 `turn/completion.ts` 是对的 | P3 |
| **`PRV-15`** | `Retry-After` 在 provider→turn 边界被丢（`loop.ts:178` 恒传 `undefined`） | P2 |
| **`SES-09`** | 锁获取超时 `1.2s` ≪ 陈旧阈值 `60s`：崩溃空锁 ⇒ 60s 硬失败 | P2 |
| **`SES-10`** | 中止回合**不发终止事件** ⇒ `--json` 流无终止帧 | P2 |
| **`TOL-10`** | `task` 工具在子代理失败但**有文本**时返回 `success:true` | P2 |
| **`TOL-11`** | `grep` 快路径 `execFileSync` 阻塞事件循环（`pi` 用异步 `spawn`） | P3 |
| **`TOL-12`** | plan 模式**无条件拦**所有 MCP 工具；`/tools` 的表与门已漂移 | P2 |
| **`TOL-13`** | `/tools` 列**静态**注册表，隐藏生效的 MCP 工具与技能 | P3 |
| **`CMD-09`** | `/deep-research` 无模型，却宣称「多智能体树搜索」（Jaccard 聚类 + 模板） | P2 |
| **`CMD-10`** | `/review` 硬编码清单 + 原始 diff，不调模型 | P2 |
| **`CMD-11`** | 撇号（未闭合引号）令整条命令参数**硬失败**（`/btw what's…`） | P2 |
| **`CMD-12`** | `/marketplace` 只在内存；帮助还指向 `/plugin search`（后者自称无目录服务） | P3 |
| **`CMD-13`** | `/reload` 在输出里吞掉主题加载失败 | P3 |
| **`TUI-10`** | 编辑器箭头**只走逻辑行**，忽略软换行（`pi` 用可视行映射） | P3 |
| **`TUI-11`** | 指针**点不了** picker/补全/光标定位 | P3 |
| **`OBS-13`** | 斜杠命令**别名不参与补全** | P3 |
| **`OBS-14`** | `newlineKey` 已接线但从不渲染 | P3 |
| **`OBS-15`** | MCP stdio 客户端用**自定义信封**，**连不上真实 MCP server**（代码自述） | **P1** |
| **`SUB-01`** | 子代理定义的 `permissionMode` **只用于显示**，plan 模式不生效 | P2 |

### 12.5 复核轮验证的**新 demo 判据**（比「`ok:true` 分布」更有辨识力）

1. **「机制宣称」与「实际机制」对照**：命令帮助/报告正文宣称的机制词
   （`/deep-research` 的「多智能体」、`/review` 的「Code Review Report」、
   `taskTool` 的「Subagent Task Executed」）**在实现里找不到对应**——这与 `AGENTS.md`
   「不要把未核实的结果藏在成功样的状态后面」同型，是**比字面量更可靠**的判据。
2. **「同类端点的差集」**：同一仓里两个 Google 端点，**一个带 `?alt=sse`、一个不带**（`PRV-13`）——
   同类实现的差异**直接暴露缺陷**，不需要外部参考。
3. **「常量关系」**：两处各自正确的常量**合起来矛盾**（`SES-09` 的 `1.2s vs 60s`、
   `TOL-12` 的 `ALLOWED_IN_PLAN vs PLAN_MODE_TOOLS`），且**无测试钉住关系**——建议施工轮为这类加**一致性测试**。

### 12.6 仍**未**覆盖的（如实列出，承接 §9.5）

- `PRV-13`/`PRV-15`/`PRV-14` 的真实提供方行为**仍未验证**（中转站不支持 Google 原生，见 §8）。
- `OBS-15` 的 JSON-RPC 实现工作量**未估算**（属产品级裁决，见裁决 §10.4 的 `R3`）。
