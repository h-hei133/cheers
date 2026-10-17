---
title: "Phase 18 裁决：把 11 号册剩余的 21 条 OPEN 与 10 号四项未覆盖面分批落地"
category: article
sources: [phase-18-pre-research, 13-feature-and-defect-register, 12-gap-and-debt-research-2, phase-17-decisions]
created: 2026-10-01
updated: 2026-10-01
reviewed: 2026-10-01（3 个证伪式复核者，见 §8；本轮为规划轮，零代码改动）
reviewed_round_2: 2026-10-01（3 个探索子代理 + 主代理亲验，见 §10：修正 4 条裁决、新增 20 条缺陷、驳回 8 条）
tags: [features, gap-analysis, phase-18, decision, design]
summary: "Phase 18 的裁决。执行表分 W1–W7 七波、33 个交付项；复核轮（§10）再修正 4 条裁决并新增 W8（11 项 + 8 小项）、20 条登记册条目、1 条待裁决（R3）。另 4 项明确不做、3 项待裁决。真实 provider 验证已于 2026-10-01 用中转站 ai.onyxaxis.org 实机执行（§9）：解除 D2/D4 两条 [INFERENCE]、跑通两个真实端到端回合；PRV-12 因该中转站不支持 Google 原生路径而无法验证（并新增 PRV-13：主流式路径缺 ?alt=sse）。登记册条目与交付项不是同一计数口径。每条给出形态、参考依据或自研标记、撤销验证方式。"
confidence: high
---

# Phase 18 裁决

> 前置研究见 [`phase-18-pre-research.md`](phase-18-pre-research.md)；
> 条目定义与证据见 [`11-feature-and-defect-register.md`](11-feature-and-defect-register.md)。
>
> **本裁决的纪律**（沿用 Phase 17）：
> 1. 每条给出**形态**（改哪个文件、什么机制）+ **参考依据**或 `自研` 标记 + **撤销验证**方式；
> 2. **每项独立提交**，可单独撤销；
> 3. 凡「参考实现没有对应机制」的，**必须标 `自研`**，不得伪装成照搬；
> 4. 复核者（3 个只读子代理）的结论由主代理逐条复验，被推翻的如实记录在 §8。

---

## 1. 规模与分批

### 1.1 输入：24 个 `OPEN` 标题，逐一列出（不用推导数字）

以下是施工前的**24个OPEN输入标题**，不是当前未完成数量。原编号仅23个唯一ID，
W6-23已把侧栏重复编号改为OBS-11/OBS-12；本表按更正后的24个唯一ID引用，当前状态见§8.4。

| # | 标题（唯一 ID） | 登记位置 | Phase 18 处置 |
|---|---|---|---|
| 1 | `BRW-04` | §5 | W1-6 |
| 2 | `CLI-01` | §11 | W1-3 |
| 3 | `CMD-03` | §4 | W2-8 |
| 4 | `CMD-04` | §4 | W1-2 |
| 5 | `CMD-05` | §4 | **§6 明确不做** |
| 6 | `CMD-06` | §4 | W2-7 |
| 7 | `CTX-02` | §8 | W2-9（与 `CTX-08` 合并） |
| 8 | `CTX-08` | §8 | W2-9（同上） |
| 9 | `CTX-09` | §8 | W3-13 |
| 10 | `LOP-01` | §8bis | W1-4 |
| 11 | `OBS-11`（sidebar快照） | §11bis | W5-21 |
| 12 | `OBS-04`（§10 的 MCP 那条） | §10 | W3-11 |
| 13 | `OBS-12`（sidebar事件流） | §11bis | **§5-R1**（只在做真分栏侧栏时才需要） |
| 14 | `OBS-09` | §10 | W1-5 |
| 15 | `PRV-04` | §7 | W2-10 |
| 16 | `PRV-10` | §7 | W4-15 |
| 17 | `PRV-12` | §7 | W5-19 |
| 18 | `SES-02` | §6 | 保持 OPEN（Phase 17 §5-3 已裁，W4-14 只补两条缓解） |
| 19 | `SES-06` | §6 | W4-16 |
| 20 | `SES-07` | §6 | W3-12 |
| 21 | `TOL-05` | §9 | **方法项**（前置研究 §6.1 给审计方法，无代码改动） |
| 22 | `TOL-06` | §9 | W5-17 |
| 23 | `TOL-07` | §9 | W1-1 |
| 24 | `TOL-08` | §9 | W5-18 |
| — | **`THM-03`（`PARTIAL`）** | §3 | **W7-25**（初稿遗漏；`PARTIAL` 不是 `OPEN`，被统计跳过） |

**统计（逐行数，不用减法）**：

```
24 个 OPEN 标题
  21 个由 W1–W5 的交付项覆盖（其中 item 9 一条覆盖 CTX-02 + CTX-08 两行）
   3 个不进交付表，理由各自写在表里：
       CMD-05         → §6 明确不做（参考在斜杠命令层同样没有 --）
       TOL-05         → 方法项（登记册自标「记录，非缺陷」，前置研究 §6.1 给审计方法）
       OBS-12/sidebar → §5-R1（只在做真分栏侧栏时才需要修）
  ───────────────
 + 1 个 THM-03（PARTIAL，不是 OPEN ⇒ 被上面的统计跳过）→ W7-25
```

> **⚠️ 一处统计盲区（本轮自查发现）**：只统计 `OPEN` 会**漏掉 `PARTIAL`**——
> `THM-03` 标的是 `PARTIAL`（Phase 17 只做了一半，另一半「按裁决延期」），
> 于是**两条互不相同的筛选口径都不会命中它**。
> 另外 **`SES-08`/`PRV-06`/`BRW-06` 三条「未逐一核验的面」按设计不带状态标记**，
> 也逃过了统计。⇒ **9 项补入 W7**（详见 W7 的说明）。

其中 **`SES-02` 虽由 W4-14 覆盖，但按 Phase 17 §5-3 的裁决保持 `OPEN`**
（本阶段只补「续期」与「release owner 校验」两条缓解，不改锁语义）。

⇒ Phase 18 输入 = **这 24 个标题** + 10 号 §10 的四项未覆盖面。
**「候选 21/22 条」之类的说法一律废止**——上表是唯一口径。

> **一处记账更正（本文发现）**：`phase-17-decisions.md` §1.2 声称「移出（更后阶段）**22** 项」，
> 但那份文档**通篇没有枚举这 22 项**。本文用「规划时点 OPEN − decisions 全文出现过的 ID」
> 重算，得到 27 个 ID，剔除其中 7 条**确实在 W1–W6 实施过**的
> （`BRW-02`/`PRV-03`/`TOL-03`/`OBS-05`/`CDE-01`/`CDE-02` 已 `FIXED`、`CDE-04` 已 `WONTFIX`）
> 后剩 20 个 ID——**与「22」量级相符但清单缺失**。**这是 Phase 17 唯一的文档缺口。**

### 1.2 裁剪结果

| 处置 | 数量 | 说明 |
|---|---|---|
| **纳入本阶段** | **33 + 19** | 七波 W1–W7（33，见 §2）+ 复核轮新增 **W8 = 11 项（§10.2）+ 8 小项（§10.3）** |
| **明确不做** | **4** | 附理由，见 §6 |
| **独立裁决** | **2 未决 + 1 已决** | R1/R2 仍见 §5；R3 已依本轮授权选择标准协议，见 §10.4 与 §8.4 |
| **等待外部条件** | **1项** | W7-33：2026-10-05现有安全门禁仍为auth/exit3；历史可用记录不能代表当前条件，四端点真实矩阵未完成 |

> **复核轮更新（2026-10-01）**：§10 对 §1–§9 做了证伪与补漏——**修正 4 条裁决**（`W7-30` 翻转为缺陷、
> `W5-19` 扩大范围、`W3-11` 前置裁决、`W4-14` 补第三条）、**新增 20 条缺陷**、
> **驳回 8 条子代理断言**。上表与 §10 的附计数为**复核轮后的口径**。

**裁剪原则**（按优先级）：
1. **错误承诺优先**——文案/命令说了却没做的（`CMD-03`/`CMD-04`/`CLI-01`/`LOP-01`/`BRW-04`/`OBS-11(sidebar)`）；
2. **参考侧有明确更优实现的**——只有 `TOL-07`（opencode 的 `writeIfUnchanged`）一条，排最前；
3. **同一改动点的多条目合并**——`CTX-02`+`CTX-08` 都在 memory surface 上；
   `CMD-03`/`CMD-06` 都在会话树入口上；`OBS-04(MCP)`+`SES-07`+`CTX-09` 都是「进程级 Map 生命周期」；
4. **成本与收益比**——「单点修复、全局收益」的排前。

### 1.3 与 10 号 §10 未覆盖面的对应

| 10 号 §10 项 | 本文处置 |
|---|---|
| `browser/**` 逐行 real-vs-demo | 前置研究 §7.1 **补做分类**（167/7/143/12/5）+ 量化代理（`ok: true` 分布）；**逐行判定**见 §5-2 待裁决 |
| `cli/interactive/**` 键位双向 diff | 前置研究 §7.2 **补做**：结论是**没有文档页**（前提更正）⇒ 纳入 **W5** |
| `session/{continuation,recovery,replay,export}` 逐模块 | 前置研究 §7.3 给了可达性 + 缺陷面；逐模块行为正确性 = **W7-26**（与 §5-R2 是同一件事：R2 是裁决点，W7-26 是执行位） |
| 真实 provider 端到端 | **已执行**（§9）：OpenAI 兼容 + Anthropic 原生可跑；Google 原生该中转站 405 |

---

## 2. 执行序（七波，每波独立可交付）

### W1 — 单点高收益与错误承诺（先做）

| # | 条目 | 形态 | 参考 | 撤销验证 |
|---|---|---|---|---|
| **1** | `TOL-07` | `runtime/execution/service.ts` 的 `writeTextFileUnlocked`（锁已持有处）加可选 `expectedContent`；与写前 `before` 不一致则抛冲突错误。`registry.ts:697` 的 edit 调用处把读到的 `original` 作为 `expected` 传入 | **`opencode/packages/core/src/file-mutation.ts:144-157`** 的 `writeIfUnchanged`（锁内重读 + `sameBytes` 比较 + `StaleContentError`）；错误经 `tool/edit.ts:113-115` 映射为 `File changed after permission approval.` | 写前用外部进程改同一文件 ⇒ **返回冲突错误而非静默覆盖**；不改文件时编辑照常成功 |
| **2** | `CMD-04` | `core/commands/types.ts` 的 `CommandDefinition` 加**声明字段**（对齐 CC 的 `supportsNonInteractive`），`cliRuntimeModule.ts:315-396` 的 if 链改读它，**未声明按 blocked**；`/exit` 补非交互语义（stdin 关闭）、`/clear` 声明可用或维持 blocked 但理由来自注册表 | **`source-claudecode/types/command.ts:76`** 的 `supportsNonInteractive` + **`:37`** 的 `disableNonInteractive`；唯一过滤点 `main.tsx:2622` | 实机：管道下 `/exit`/`/clear` 不再报 interactive-only；**新增一个未声明的 shell-action 仍被拦**（这条是防回归的核心） |
| **3** | `CLI-01` | 让 `--json` 参与模式判定（`cliModeDispatch.ts:31-39`），**隐含单次非交互**（对齐 pi） | `pi/packages/coding-agent/src/main.ts:113-121` `resolveAppMode` 把 `mode==="json"` 直接判成 `json` 模式 | 实机：`printf '/help\n' \| cheers --json` 输出**全部是合法 JSON 行**（当前是 0 行） |
| **4** | `LOP-01` | 删掉 `turn/tools.ts:196` 消息里的 `without state progression`（改为只陈述观测事实）；或把结果纳入判据 | **`opencode`**：同阈值 3 但**不 block、不断言**，转权限询问（`session/processor.ts:372`）；**`gemini-cli`**：只在真正读了结果后才下无进展结论（`loopDetectionService.ts:77,574`） | 断言消息**不再含**「state progression」；阈值行为不变（3 次阻断仍生效） |
| **5** | `OBS-09` | `observability/rotatingFileSink.ts:156-190` 的年龄清理**之后**，按 mtime 排序、超出上限的最旧分片 `unlink`（或按总字节预算） | `pi/packages/coding-agent/src/core/crash-log.ts:18-19` `MAX_CRASH_RECORDS = 5` + `:139` `.slice(-MAX_CRASH_RECORDS)`；`extensions/mcp/log.ts:10` `MAX_LOG_BYTES = 5*1024*1024` + 单槽轮转 | 造 >N 个分片 ⇒ 只剩 N 个；年龄清理仍生效 |
| **6** | `BRW-04` | 去掉三次 close 的逐调用 `.catch(() => {})`，**收集** rejection，失败时返回 `{ ok: false, failure: { kind: "close-failed", reason, nextAction } }`；`process.once("exit")` 那处维持 best-effort | `pi/packages/mcp/src/transports/stdio.ts:160-174`（**观察而非假定**关闭）；`core/tools/bash.ts:158-161`（**信号杀必须映射为非零退出码**） | 注入一个 `close()` 抛错的对象 ⇒ 返回 `ok: false` 且**指名**哪个对象没关；正常关闭仍返回 `ok: true` |

### W2 — 会话树入口与命令面收口

| # | 条目 | 形态 | 参考 | 撤销验证 |
|---|---|---|---|---|
| **7** | `CMD-06` | 加**一等会话树命令**：交互侧复用 `readSessionTree` 渲染选择器 + 复用已存在的 `rewind` 宿主（`cli/interactive/interactiveMode.ts:731-750`）；非交互侧至少支持按 id 导航 | `pi`：`/tree` → `showTreeSelector()`（`interactive-mode.ts:5439`）→ `session.navigateTree`（`agent-session.ts:3866`），**print 模式也暴露**（`modes/print-mode.ts:85-91`） | 实机：命令列出树、选中后叶重指 + 摘要 + 提示放回；**`/entries tree` 保持只读不变** |
| **8** | `CMD-03` | `cli/interactive/picker/registry.ts:97` 的 `opensPicker` 判定扩到「命令名匹配即接管，参数交给 picker」；`/back <arg>` 不再落未知命令 | 与 `CMD-06` 同一改动面（无单独参考） | 断言 `/back 2` 与裸 `/back` 走同一条路；未知命令行为不变 |
| **9** | `CTX-02` + `CTX-08` | 前置接线：把 `health` 穿进 `RenderProjectMemoryReviewSurfaceInput`（与 16-A 同型）；然后 **A 类 4 个面**改读 `health.mode`/`writable`，删掉字面量。**C 类 3 个面**（已读 health 但另印常量）顺带收口；**B 类 1 个面**（`projectMemoryInjectedContextFormatter`，模型可见的提示文本）**先判定是否在范围内**（本文倾向不在） | `gemini-cli/packages/core/src/commands/memory.ts:39-44`（**全派生，零字面量**）；同目录 `projectMemoryDeleteSurface.ts:40` 已是正确写法 | 断言：**同一进程内** `/memory` 与 `/memory status` 对 store 状态的陈述**一致**（当前相反：前者 `not enabled`、后者 `writable: yes`） |
| **10** | `PRV-04` | `core/commands/btwCommandRuntime.ts` 的兜底文案带上 `classifyProviderFailure` 的**失败类别** | 无（`自研`；参考无 `/btw` 对等面） | 断言：超时/网络/模型拒绝三类兜底文案**互不相同**；凭据缺失仍走原有那句 |

### W3 — 进程级状态的生命周期

| # | 条目 | 形态 | 参考 | 撤销验证 |
|---|---|---|---|---|
| **11** | `OBS-04`(MCP) | 把 `CoreMcpGateway` 挂在会话 runtime 上、**以 workspaceRoot 为键**；substrate transition（`core/shell/runtimeContext.ts:154`）时重建；`refreshMcpGateway`（`cli/interactive/lineLoop.ts:108`，目前是 no-op 重绑定）接上 | `pi/packages/coding-agent/src/extensions/mcp/index.ts:791/816/892`（会话生命周期持有）+ `runtime.ts:240-246` 的 `getClient()`（**一 server 一长连接，掉线才重连**） | 一个 stdio MCP server 在**两次 prompt** 之间只起 **1** 个子进程。**当前实测**：每 prompt = 1（`snapshot()` 的 listTools）+ 每次工具调用 × 2（`gateway.ts:186` 先 `listTools()` 再 invoke），**再乘重试次数** |
| **12** | `SES-07` | 会话切换时也清理 `listsBySession`（最小改动，不重构为对象持有）；**并接上 `session/lifecycle/sessionLifecycleWrites.ts:214` 的 `discardIfEmpty` 直连 `store.deleteSession` 这条绕过路径**（复核者发现，主代理复验） | `pi/.../experimental/server.ts:561/593`（进程级 Map + remove 时 delete，与我方同形） | 断言：**两条**删除路径（read-surface 的 `deleteSession` 与 `discardIfEmpty`）都释放 todo 表；切换会话后旧表被释放 |
| **13** | `CTX-09` | 给五处加**显式容量 + 丢弃标记**（优先 `compactLiveCheckpoint` 与 `projectMemoryReviewState`，二者跨会话） | `pi/.../nested-tool-calls.ts:26-31` 的 `NESTED_CALL_LIMITS` + `:56-58`（`maxCalls` 超限 ⇒ `this.complete = false; return undefined`，**丢调用并打 incomplete 标记**，不是 LRU） | 断言：超过上限后结构尺寸有界、且 `incomplete` 被标记；正常路径行为不变 |

### W4 — 原子性与持久化

| # | 条目 | 形态 | 参考 | 撤销验证 |
|---|---|---|---|---|
| **14** | `SES-02` | **不加 fencing**（与参考一致、Phase 17 §5-3 已裁）；补 (a) 持锁期间**续期**、(b) release 前比对锁内 owner | `proper-lockfile` 的 `utimes` 续期与 `ECOMPROMISED`；`opencode/packages/core/src/util/flock.ts` 的 release token 校验 | 断言：被暂停的持有者苏醒后**无法删掉接管者的锁**；正常路径无额外延迟 |
| **15** | `PRV-10` | usage 快照随会话落盘（`state.json` 既有扩展点），resume 时载回；**按 `provider/model` 整体键控**（`usageTelemetry.ts:144` 的注释警告） | `pi/.../usage-totals.ts:67-69`（**从持久化条目重算，不维护内存台账**） | 断言：`--session-id` 恢复后 `/cost` **不为零**；同进程内换模型的分桶不受影响 |
| **16** | `SES-06` | **删除** `session/continuationEvidenceParity.ts` 及其测试；同簇的 `sessionResultParity.ts:80`（`collectEvidence` 的卫兵）、`session/sessionContinuationProjection.ts:63-64`、`session/actionableFailureContinuity.ts:24` **一并评估**（复核者已确认它们的生产者同样只在 `test-utils` 夹具里） | 无（`pi` `NOT-FOUND`）；同型先例见 `.normproof/dispositions.md` 的 `mutation.ts` 裁定 | **先跑一次真实会话**，确认 resumed 摘要里不含任何 parity 行（登记册要求的实机确认）；然后删。**注意**：parity 格式化器仍被活轨调用（`stoppedSessionContinuity.ts:200`、`resumeContextBuilder.ts:398`），删的是**恒空的规则表**而非调用点 |

### W5 — 文档与自研修复

| # | 条目 | 形态 | 参考 | 撤销验证 |
|---|---|---|---|---|
| **17** | `TOL-06` | **不改行为**：在 `edit` 工具 description（`registry.ts:539-540`）与 readiness 说明里写明「每个文件独立提交，非原子；中途失败时已提交的部分需 `/undo` 逐个恢复」 | **`opencode/packages/core/src/file-mutation.ts:205-206`** 逐字措辞：`Until then, edits are sequential and report partial application.` | 断言工具 description 含该承诺；`editCapabilityReadiness` 的 blocked 项不变 |
| **18** | `TOL-08` | **自研**（参考三条同构存在）：(1) Windows 分支 `await` taskkill 退出（带超时）；(2) `killProcessTree` 先 `SIGTERM` 留 1–5s 再 `SIGKILL`；(3) 子孙逃逸 / 父 SIGKILL 两条**改文档不改代码** | `pi` 的 Windows 分支**同样不 await**、Unix **同样无 SIGTERM 宽限**；pi 的 `core/exec.ts:55-61` 有 SIGTERM→5s→SIGKILL（但那条路径不 detached） | (1)(2) 用可控子进程断言信号序列与等待；**(3) 的文档必须写明「不保证」而非「已修」** |
| **19** | `PRV-12` | 由端点所有者区分「单次 / 流式」：给 `endpointUrl` 加非流式变体，或把 `googlePath(model, false)`（`googleGenAI.ts:21` 的 `stream` 形参**恒为 true**，无调用者能传 false）接出去；**不新增第二份 Google 内容转换器** | 无（`自研`）；先对照底层 SDK 对两种方法的使用 | 「URL 与响应格式成对」的合成测试：非流式路径得到 `generateContent` 且按单 JSON 解码；流式路径仍按 SSE 解码 |
| **20** | 键位文档页 | **新建**键位参考页（对齐 `pi/packages/coding-agent/docs/keybindings.md`），内容**从 `KEY_BINDINGS`/`KEY_ACTIONS` 派生**（可加一条测试断言文档与表一致）；**并把路径写进文档索引** | `pi/packages/coding-agent/docs/{keybindings.md,docs.json:153}` + `core/system-prompt.ts:158`（**接入系统提示**） | 测试：文档中每个按键都在绑定表里；`/hotkey` 与文档对同一重绑定给出**一致**结果 |
| **21** | `OBS-11`(sidebar) | 二选一：改名为 `/sidebar snapshot`（诚实；**默认取此**），或真接 tick 源（需 TUI 侧栏容器 = **产品决定**） | 无（`pi` 无此形态，`NOT-FOUND`） | 断言命令名与输出形态一致；若选改名，usage/补全/registry 三处同步 |
| **22** | `CDE-01` 口径漂移 | 登记册 §12 写「完全不可达 **12** 文件」而 Phase 17 §8.9 的最终闭包清单不同；**以 §8.9 为准**，在 §12 加一行说明 | — | 门禁 `check:call-reachability` 无新增 advisory |

### W6（文档收口）— 登记册自身的修正

| # | 条目 | 形态 |
|---|---|---|
| **23** | `13` 号册 `OBS-03`/`OBS-04` **编号冲突** | §10（MCP/钩子）与 §11bis（sidebar）各有一组同号条目，违反 §0.1「编号永不复用」。改 §11bis 为 `OBS-11`/`OBS-12`，全仓引用同步 |
| **24** | 登记册的四处数字更正 | `BRW-00`：`164` → **`167`**（差额 3 = Phase 17 `8adc76f9` 以 **rename** 从 `core/harness/` 迁入的 `browser/smoke/` 三模块）；`CTX-08`：**6** → **4 个同型缺陷 + 3 个部分派生 + 1 个模型面**（登记册把自己标 ✅ 的对照行算进了缺陷侧，原稿的「5」其表格也只列了 4 行）；`PRV-04`：改 `PARTIAL` 并写明剩余缺口；§12 的不可达数字加口径说明 |

---

### W7 — 跨轮次遗留的审计债务（**新增，2026-10-01 补入**）

> **为什么单独一波**：下面 9 项**不属于 11 号册的 `OPEN` 条目**——它们散落在
> 11 号册 §13.2「本轮未覆盖的面」、§16.4「仍然未覆盖的」与 §18「仍然未覆盖的四项」，
> 以及 `SES-08`/`PRV-06`/`BRW-06` 三个**按设计不带状态标记**的「未逐一核验的面」条目里。
> **因此它们逃过了「统计 `OPEN`」这一步**，在初稿里**一条都没有进入 Phase 18**。
> 主代理在对齐检查时发现，逐条核实后补入。
>
> **性质**：其中 **W7-1 是真正的遗漏**（有状态标记），其余 8 项是**跨轮次的审计债务**
> （Phase 11/12/13/16 各自都判「本轮范围外」，但**从未落到任何具体阶段**）。

| # | 条目 | 来源 | 形态 | 规模 |
|---|---|---|---|---|
| **25** | **`THM-03` 的剩余两半**（`auto` + 扩充令牌/主题数） | 13 册原`PARTIAL`，现`FIXED` | 已完成：auto跟随终端报告；32→48个有实际消费者的令牌；2→4套预设。原数字规模对齐已按本节末实施裁决修正，详见§8.4与W7-25记录 | 原主题owner与两个新增预设 |
| **26** | `SES-08`：session 四域逐模块行为审计 | 13 册 `SES-08` + 12 册 §10 | **已完成，判据与保证边界见phase-18-session-audit.md。** `session/continuation`(16) / `recovery`(11) / `replay`(5) / `export`(4) = **36 个非测试模块**的**行为**正确性（往返、边界、损坏输入降级）。**前置研究 §7.3 只做了可达性**（16/16、10/11、4/5、4/4 可达；两个不可达 `types.ts` 是契约） | 36 模块 |
| **27** | `PRV-06`：四端点逐字段形状表 + 流边界矩阵（含 Bedrock 单次路径） | 13 册 `PRV-06` | **已完成有界审计，详见phase-18-provider-audit.md。** (a) 四端点逐字段请求对照；(b) SSE/二进制流边界；(c) 跨模型/resume与后台用量；(d) 逐路径超时取消矩阵。认证准备、无caller signal与缺整体期限的路径明确保留为保证限制 | 4 协议 |
| **28** | `BRW-06`：`receipt/**` 的保证强度 | 13 册 `BRW-06` | 已完成：九模块逐项核验并修复权限、无副作用查询、锁、完整日志隔离、嵌套准入及结果投影；原过期锁“正确实现”判断已推翻，保证边界见本项实施记录 | 9 模块 |
| **29** | `memory/**` + `context/**` **逐模块**审计 | 13 册 §13.2 / §16.4 | **已完成有界审计**：存储、审批、质量、检索、生命周期注入、预算、源码事实及startup；67模块矩阵与保证限制见phase-18-memory-audit.md。0f2b552b两项远端检查成功 | 历史64；当前38+29模块 |
| **30** | 子代理递归深度与**工具继承** | 13 册 §13.2 / §16.4 | 已完成：单层递归和工具交集已核验；修复权限、正文、模型schema、执行工作区与worktree生命周期。清理仅保证保留检查时可见改动，要求写入方已停止；后台并发写入限制见本项实施记录 | 原runner、工具门与worktree owner |
| **31** | `core/shell` 完整审计 | 13 册 §13.2 | 有界行为审计完成，见phase-18-shell-audit.md；最新取消增量见W8-39。2026-10-05目录核对38模块均具名 | 原37，当前38模块 |
| **32** | `context/startup/**` + 原read去重的行为审计 | 13 册 §18 | 已完成：read去重退役；startup六模块验证输入、项目绑定、fresh/stale/invalid/unknown及失败状态，缺失来源不再以占位文字冒充 | 六模块及现有命令/侧栏消费者 |
| **33** | provider 四端点**真实**流边界（TLS/HTTP2 层） | 13 册 §16.4 / §18 | **未完成**。§9为历史可用证据；2026-10-04显式readiness门禁返回auth、exit3，当前不能宣称两端点可用。TLS/HTTP2与四协议真实流边界仍须独立验收；见Provider审计W7-33记录 | 4 协议；当前可执行数量未确认 |

**波内顺序建议**：**25 → 30 → 32 → 28 → 26 → 31 → 27 → 29 → 33**。
理由：25（`THM-03`）是**唯一有状态标记的真遗漏**，最该先闭；
30/32 是**小范围可判定**的（30 甚至可能直接判「已健全」）；
28/26/31/27/29 是**逐模块审计**，成本按模块数递增；
33 **必须等 §9 的凭据**。

> **⚠️ 与 §5-R2 的关系**：R2 讨论的是「143 个 FIXTURE 模块的逐行 real-vs-demo」与
> 「36 个 session 边界模块的行为正确性」**是否值得做**，倾向 (b) 不做。
> **W7-26 与 R2 的第二半是同一件事**——若维护者对 R2 选 (b)，则 **W7-26 一并出列**，
> 本波剩 8 项。**两条不重复计**：R2 是裁决点，W7-26 是它的执行位。

## 3. 逐项形态说明（只写需要展开的）

### 3.1 `TOL-07` 的写入复核（W1-1）——**本轮唯一「参考更优」的执行安全项**

**现状链**（主代理逐处复验）：

```
registry.ts:621 / :648   读原文（executionService.readTextFile）
registry.ts:697          await executionService.writeTextFile({ content: finalContent })   ← 中间零比对
service.ts:89-91         const before = existsSync(...) ? authority.readVerifiedFile(...) : undefined
                         await captureSnapshotBeforeWrite({ before })                     ← 只为 /undo
service.ts:99            authority.writeFile(relativePath, request.content)               ← 无条件 truncate
fileLock.ts:30           const queues = new Map<string, Promise<void>>()                  ← 进程内 Promise 队列
```

**参考的形态**（`opencode/packages/core/src/file-mutation.ts:144-157`，**锁内**）：

```ts
const current = yield* fs.readFile(input.target.canonical)
if (!sameBytes(current, input.expected)) {
  return yield* new StaleContentError({ path: input.target.canonical })
}
```

**关键领悟**：opencode 的锁**同样是进程内的**（`KeyedMutex`），它的跨进程防护**不是靠锁，是靠写时比较**。
这正好也回答了我们 `fileLock.ts` 的定位——**进程内队列 + 写时比较**才是完整的一对；
我们现在有前者、缺后者。

**形态**：`writeTextFileUnlocked` 增可选 `expectedContent?: string`；
存在时与写前 `before` 比较，不一致抛结构化冲突错误。
`registry.ts:697` 把**编辑时读到的 `original`** 传进去。
**不改** `service.ts:99` 的无条件写（那是「没有 expected 就不是条件写」的默认语义）。

**撤销验证必须覆盖两侧**：外部改动后编辑 ⇒ 冲突（不是覆盖）；无外部改动 ⇒ 编辑照常成功。

### 3.2 `CMD-04` 的声明字段形态（W1-2）

**现状**：判定是**派发处的 if 链**（`cliRuntimeModule.ts:315-396`），`CommandDefinition`
（`core/commands/types.ts:162-185`）**没有任何非交互字段**。四个被漏掉的命令
（`/exit`/`/clear`/`/retry`/`/cancel`）都是「runtime 只返回一个 action」的形态。

**参考的形态**（三种，取 CC）：

```ts
// source-claudecode/types/command.ts:76（local 命令）
supportsNonInteractive: boolean
// source-claudecode/types/command.ts:37（prompt 命令）
disableNonInteractive?: boolean
// main.tsx:2622 —— 全仓唯一的过滤点
const commandsHeadless = disableSlashCommands ? [] : commands.filter(
  command => command.type === 'prompt' && !command.disableNonInteractive
          || command.type === 'local' && command.supportsNonInteractive);
```

**为什么选 CC 而不是 gemini/pi**：
gemini 靠**返回值类型**决定（`nonInteractiveCliCommands.ts:115-122` 的 `default: throw`），
那要求命令的返回值**语义上可判定**，我方 shell-action 的返回值是 `{kind, action}`，判不出；
pi/opencode 的内建命令**在非交互路径上根本不存在**（`NOT-FOUND`），我方可以像它们一样「不支持就拦」，
但**那样就永远无法修 `/exit`**。

**我方形态**：`CommandDefinition` 加 `nonInteractive?: boolean`（或 `supportsNonInteractive`），
**覆盖 shell-action 与 local 两类**；`cliRuntimeModule.ts` 的分支改读它，**未声明一律 blocked**
（默认安全）。`/exit` 在管道里语义 = stdin 关闭；`/clear` 视产品判断（登记册已指出它「不是交互专属」）。

**⚠️ 必须覆盖的防回归**：新增一个 shell-action 但**不声明**时，仍须被拦——
否则这个改动只是把一处硬编码换成另一处。

### 3.3 `CMD-06` / `CMD-03` 的会话树入口（W2-7/8）

**关键事实**：**能力已经在，且与参考同构**——我方 `rewind` 宿主
（`cli/interactive/interactiveMode.ts:731-750`）做的是叶重指 + 分支摘要 + `markContextUnknown`，
与 pi 的 `session.navigateTree`（`agent-session.ts:3866-4061`）同一套语义。
**缺的只有一等入口与非交互形式。**

**不做的事**：不重写 `rewind` 宿主；不把 `/entries tree` 变成可变命令（它的定位是**只读观察面**，
自述目标是外部同步客户端，`entriesCommandRuntime.ts:16-18`）。

**⚠️ 一处结构债必须在裁决里点明**（Phase 17 遗留）：
`session/query/sessionEntries.ts:142` 遇到**父子环**时「打断环、把分支挂到根上」——
注释明说这是为了「不让分支从树里消失」。但 `session/schema/sessionThread.ts:218-228` 的
`sessionThreadPath` 对同一情形**返回 `{path: [], resolved: false}`**（拒绝）。
**两处对同一损坏输入给出相反构造**：一个是「修好并展示」，一个是「拒绝」。
⇒ **本裁决要求**：实现 W2-7 前先判定**哪一个是对的**，并把另一处对齐或在注释里说明两者为何不同。
**这是「只声明、不实现」型缺陷最容易藏身的地方**，Phase 17 已在 `CAPABILITY` 类上栽过一次。
**标记**：这一条**尚未判定对错**，施工时必须以一次构造（人为造一个环的线程）来定。

### 3.4 `OBS-04`(MCP) 的提升形态（W3-11）

**为什么 Phase 15 判「独立裁决」而现在可以判**：前置研究 §4.4 找到了**具体的挂点与具体的风险**：

- 挂点**已存在**：`cli/runtime/cliSessionRuntimeFactory.ts:310` 每会话构造一次 `ShellSessionRuntime`；
- 风险**具体**：`CoreMcpGateway` 构造时冻结 `workspaceRoot`，而 `runtimeContext` 会**就地变更**
  （`runtimeContext.ts:143` 的 `applyShellSubstrateTransition`）⇒ 必须**以 workspaceRoot 为键**重建；
- 信号**已在**：`cli/interactive/lineLoop.ts:108` 的 `refreshMcpGateway` 目前是 no-op 重绑定。

**参考的复用语义**（`pi/.../extensions/mcp/runtime.ts:240-246`）：
`getClient()` 在 `connectionState === "connected"` 时直接复用，否则 `open()` 一次（`this.opening ??= ...`）。
**一个 server 一条长连接，掉线才重连。**

**不做的事**：不改 `snapshot()` 的每次重读配置（配置编辑照样生效）；不动 `runCliRuntimeInvocation` 的
per-prompt 调用形态（那是会话循环的结构，不是本项范围）。

### 3.5 `SES-02` 为什么**不**加 fencing（W4-14）

Phase 17 §5-3 已裁「维持现状 + 如实降级」，本裁决**沿用**，并补两条**前置研究新证据**：

1. **fencing 在所有参考里 `NOT-FOUND`**：`proper-lockfile` 没有；opencode 的 lockdir 协议没有；
   两家的会话状态写**都不再持有 fencing 校验**（pi 直接 `appendFileSync`，opencode 走 SQLite）。
2. **opencode 的 `staleMs` 与我方同为 `60_000`** ⇒ 我方阈值不是异常保守或异常激进。

**真正可做的两条廉价缓解**（本文新增）：
(a) 持锁期间**续期**（避免**活跃**持有者被误判为陈旧——这是「被 SIGSTOP 的进程」之外更常见的一种）；
(b) **release 前比对锁内 owner**（我方现在是 `fs.rmSync(lockPath, { force: true })` **无条件删除**，
苏醒的旧写者能删掉接管者的锁）。
两条都小、都不引入新依赖、都不改锁语义。

### 3.6 `SES-06` 的删除边界（W4-16）

**子代理给出的关键事实**（主代理复验入口恒假）：不只是「69 个前缀没有生产者」，
而是**入口条件恒假**——`codingResult` 在活层**根本不存在**（`grep` `turn/` 零命中）。

**三个同簇消费面**必须一起评估（否则会留下半死链）：

```
session/continuationEvidenceParity.ts:111   if (!codingResult) { return []; }        ← 恒假
session/sessionResultParity.ts:165          正则匹配同批前缀
session/continuation/sessionContinuationProjection.ts:63-64   allowlist 引用同批前缀
session/actionableFailureContinuity.ts:24   if (!codingResult)                       ← 同款卫兵
```

**与既有裁定的同型性**：`.normproof/dispositions.md` 里 `verification/result/projection/mutation.ts`
那条写的是「its only caller is itself unreachable, so it cannot be repaired in place」
⇒ 同类情形**判删除**是既有先例。

**⚠️ 登记册要求的实机确认不可省**：跑一个真实会话，确认 resumed 摘要里**不含任何 parity 行**，
再删。这是本裁决里**唯一需要运行时的删除前置**。

### 3.7 `TOL-08` 为什么标「自研」（W5-18）

前置研究 §3.3 已证：**参考的三条几乎逐行同构地都存在**——
pi 的 Windows `taskkill` **同样不 await**（`utils/shell.ts:191-200`），
Unix **同样直接 `process.kill(-pid, "SIGKILL")` 无 SIGTERM 宽限**（`:208`），
`NOT-FOUND` 的 subreaper/cgroup/`PDEATHSIG` 更是三家都没有。

⇒ 本项**不能写成「对齐参考」**。它是**自研的健壮性改进**，
且第 (3) 条（子孙逃逸 / 父 SIGKILL）**必须写成「不保证」而不是「已修」**——
Node 无原生 prctl 绑定，真回收需要外部 helper，成本远超收益（`[INFERENCE]`）。

### 3.8 键位文档页的形态（W5-20）——**前提已被更正**

**前置研究 §7.2 更正了这项的前提**：登记册记的是「键位与文档的**双向 diff** 未做」，
实测结论是**没有可 diff 的文档**——全仓 markdown 只有 `.wiki/` 里的历史研究笔记提到按键。

**同时记录两条对照**：

1. **我方表内部无漂移**（实测：`KEY_ACTIONS` 默认键 − `KEY_BINDINGS` 键 = 空集；
   反向差 5 个全是鼠标/手势行），且有折线测试钉住（`cli/interactive/keyGuide.test.ts:5-9`，实跑 71/71 通过）。
2. **pi 的 `/hotkeys` 输出是手写 Markdown 表格**（`interactive-mode.ts:6637-6705`），
   **不是**从绑定表派生的——即 pi 在**展示**层也有一份手写清单。
   我方 `renderKeyGuide`（`chrome/keys.ts:107-129`）**从表派生**，**这一点比 pi 更好，不应退回去**。

⇒ **形态**：新建的文档页必须**可从表派生**（或加一条测试断言二者一致），
**不要**抄 pi 的手写表格——那是 pi 的弱点，不是优点。

---

## 4. 验证纪律（每波）

1. **每项独立提交**，提交信息说明**为什么**（不只是改了什么）；
2. **撤销验证**：施工后**反向**验证一次（把修复还原，确认测试变红，再恢复）——
   Phase 4/5/6/16/17 都这么做；
3. **每波末**：运行 `AGENTS.md` 列出的 CI 静态 `check`/`verify` 门禁及 `test:scripts`；
   其他行为门禁按改动面触发，真实提供方和发布门禁只在其明确执行项运行。
   （2026-10-02 补正：原来的通配写法还会包含 real/release 以及重复包装脚本，与定向验证规则冲突。）
   触及 TUI/会话/斜杠命令的波按既有要求做 **PTY 实机**端到端；
4. **PTY 实机必须用隔离 `HOME` + 合成配置**，且**不得使用真实提供方凭据**
   （见 `agent-rules/provider-and-secret-boundary.md`）；
5. **诚实**：凡参考无对应机制的，提交信息与文档都要标 `自研`——
   本轮需标 `自研` 的有：`PRV-04`、`SES-02` 的两条缓解、`TOL-08`（全部三条）、
   `PRV-12`（优先路径）、键位文档派生方式。

---

## 5. 需独立裁决的 2 项（**不在本阶段自作主张**）

| # | 问题 | 选项 | 本文倾向 |
|---|---|---|---|
| **R1** | `OBS-12`(sidebar) / 真正的分栏侧栏 | (a) **改名 `/sidebar snapshot`**（诚实，成本一行）+ 保持文本面板；(b) 做真分栏侧栏（需 TUI 侧栏容器，牵动主屏契约） | **(a)** —— 与 Phase 15/16 两次 backlog 一致；`(b)` 是产品决定且体量大。**注意**：`(a)` 只能解决「名字承诺过多」，**不解决**「事件源只有命令」（§11.2 的另一条） |
| **R2** | 10 号 §10 的两项**深度审计**是否值得做（**对应执行位 W7-26**） | (a) 做：143 个 FIXTURE 模块的**逐行** real-vs-demo 判定 + 36 个 session 边界模块的行**为**正确性；(b) 不做，只保留前置研究的可达性分类与 36 模块可达性 | **(b)** —— 理由：`(a)` 的成本是**每模块一个判据**（Phase 12/13 已两次因成本判为「非本轮范围」），而**收益已被 `BRW-01`/`BRW-03` 的定位裁决覆盖**（夹具栈默认关闭是设计，不是缺陷）。⚠️ **原稿曾用「`ok: true` 只出现在夹具侧」当依据，该依据已被复核者推翻**（真实路径 `sessionManager`/`playwrightRuntime` 也有运行时 `ok: true`）⇒ **判决不变，但依据只剩「定位裁决」。** 若维护者要求 (a)，应作为**独立审计阶段**而非 Phase 18 的一波 |

---

## 6. 明确不做（4 项，附理由）

| 项 | 理由 |
|---|---|
| **多文件编辑事务/回滚**（`TOL-06` 的 (a)） | 三方**都不做**（pi 的 tools 目录 `rollback|transaction|revert|undo` **零命中**；opencode 明文 `TODO`，`file-mutation.ts:205-206`）；且 `editCapabilityReadiness.ts:141-144` 已把「capability 被**决定移除**，不是遗漏」写进代码。与 `CB-007`（2026-09-27 裁决）一致。**本阶段只改承诺**（W5-17） |
| **`fencing token` / epoch**（`SES-02` 的 (a)） | 参考全部 `NOT-FOUND`。⚠️ **成本表述已按复核更正**：登记册原提的**具体设计**（`13` 号册 `:930`「`state.json` 里放 epoch」）**确实**会改快照格式（`buildSessionStateSnapshot` 逐字段重建，要显式穿线 + 混版本互操作）；但**加 fencing 本身不需要动 `state.json`**——锁文件是独立的（`sessionFileLayout.ts:89` `state.lock`）、每次获取都重写，epoch 放锁里即可（opencode 的 token-in-lockdir 正是这个形状）。「与迁移」那半最弱：`state.json` **没有版本字段、也没有可扩展的迁移机制**。⇒ **结论不变**（与 Phase 17 §5-3 一致），但理由改为「**加 epoch 要新增一条写路径校验，收益未被证据支持**」。**本阶段只补续期与 release owner 校验**（W4-14） |
| **真 subreaper / cgroup 进程回收**（`TOL-08` 的深度方案） | Node 无原生 `prctl(PDEATHSIG)` 绑定；参考三家都没有。成本远超收益（`[INFERENCE]`）。**本阶段只做 await + SIGTERM 宽限 + 如实声明**（W5-18） |
| **`CMD-05` 的 `--` 终止符 + 未知 flag 报错** | **参考在斜杠命令层同样没有 `--`**（pi 的 `--` 只在 CLI 层）⇒ 不是「对齐参考」。且「未知 flag 是否报错」需要**产品决定**（参考没有先例）。**本阶段不做**，留作后续（若做，与 `CMD-01` 的同一改动面） |

---

## 7. 明确**不**重开（Phase 17 已裁，仅记录防止重新发现）

| 项 | Phase 17 的裁决 |
|---|---|
| `CDE-04`（`index.ts` 公共包 API 岛） | `WONTFIX`：包 `main` 已指向 `dist/index.js`，CLI 可达性不能退役公共包契约；已追加 disposition |
| `CDE-01`/`CDE-02`（不可达文件、`edit/patch` 三角） | 已逐簇处置；「旧表的 37 文件包含重叠候选和活跃公共导出，**不能当作删除配额**」 |
| `SES-05`（`state.json` epoch = `SES-02` 重复） | 已合并至 `SES-02` |
| `TOL-09`（`edit/**` 12 死码） | 已由 `CDE-05` 覆盖 |
| `THM-08`（`tuiMode: "stream"`） | Phase 16 已删 |

---

## 8. 复核安排与结果

### 8.1 安排

前置研究与本文交 **3 个只读子代理**分域证伪（并发 3，模型 `vsllm/glm-5.3-api:max`）：

- **RvA**：W1 + W2（`TOL-07`、`CMD-04`、`CLI-01`、`LOP-01`、`OBS-09`、`BRW-04`、`CMD-06`、`CMD-03`、`CTX-02/08`、`PRV-04`）
  ——重点证伪「参考依据是否真的成立」与「撤销验证是否真的能红」；
- **RvB**：W3 + W4（`OBS-04`(MCP)、`SES-07`、`CTX-09`、`SES-02`、`PRV-10`、`SES-06`）
  ——重点证伪「提升 gateway 的安全性」与「删除 `SES-06` 是安全的」；
- **RvC**：W5 + W6 + §5/§6 的裁决
  ——重点证伪「自研标记是否正确」（`TOL-08`/`SES-02` 是否真的参考也没有）与「明确不做」的理由。

### 8.2 主代理**在复核者返回之前**已自查的四处（探针级）

> 这四处是风险最高的断言，我在派发复核的同时**自己也证了一遍**。

**① `TOL-07`：opencode 确实做写前比对，pi 确实不做** — `CONFIRMED`（主代理读过两个文件）

`opencode/packages/core/src/file-mutation.ts:144-157` 的 `sameBytes(current, input.expected)` +
`StaleContentError`；`tool/edit.ts:113-115` 的用户可见文案。
`pi/packages/coding-agent/src/core/tools/file-mutation-queue.ts` **全文 62 行**（主代理读过），
**无任何内容/mtime 比对**；`edit.ts:186` 读与 `:198` 写之间零比较。
⇒ **「参考侧唯一更优实现」这个结论成立**，且是我方可以直接照搬的最小形态。

**② `CMD-04`：Claude Code 的 per-command 字段确实存在且是唯一过滤点** — `CONFIRMED`

```
source-claudecode/types/command.ts:37   disableNonInteractive?: boolean
source-claudecode/types/command.ts:76   supportsNonInteractive: boolean
source-claudecode/main.tsx:2622         const commandsHeadless = ... commands.filter(...)
```

**③ `SES-02`：fencing 在参考里确实 `NOT-FOUND`** — `CONFIRMED`

`pi/packages/coding-agent/package.json:68` 确有 `"proper-lockfile": "4.1.2"`（主代理读过该行）；
`opencode/packages/core/src/util/flock.ts` 是**用户态 lockdir 协议**（`mkdir` + token + `staleMs: 60_000`
+ release 时校验 token），**不是** OS `flock(2)`，且 **token 不参与状态写**。
`pi` 的会话状态写**不加锁**（`session-manager.ts:1187` 直接 `appendFileSync`）。
⇒ 我方的「no fencing」自白**没有落后于行业**，但缺**续期**与 **release owner 校验**这两条**两家都有**的缓解。

**④ `OBS-09`：pi 确实有 count cap 与 size cap 两种上界** — `CONFIRMED`

`core/crash-log.ts:18-19` `MAX_CRASH_RECORDS = 5` + `:139` `.slice(-MAX_CRASH_RECORDS)`；
`extensions/mcp/log.ts:10` `MAX_LOG_BYTES = 5 * 1024 * 1024` + `:50-53` 单槽轮转。两句均逐字存在。

### 8.3 结果

**累计 25 条断言（RvA 10 / RvB 7 / RvC 8）：`correct` 21、`partly-wrong` 4、`wrong` 0、`unverifiable` 0。**

> **本轮没有出现 `wrong`**（对比 Phase 17 有 1 条推翻主代理）。
> 但出现了 **4 条 `partly-wrong`**，其中 **2 条推翻了我的依据**（另 2 条只纠正引文精度），
> 且全部**判决不变**——只有依据被替换。这是本仓「复核攻击推理而非事实」的正常产出。

#### 8.3.1 复核者**成立且改了依据**的 4 条

| # | 条目 | 复核者发现 | 主代理复验 | 处置 |
|---|---|---|---|---|
| 1 | `CTX-08` 的面数 | 登记册的「6」**把它自己表格里标 ✅ 的对照行算进了缺陷侧**；而**我写的「5」在其自己的表格里只有 4 行** ⇒ 两个数字都不准。复核者按口径拆开：**4 个输入缺 `health` 的同型面 + 3 个「读了 health 但仍印常量」的部分派生面 + 1 个模型可见提示面** | 主代理逐文件 `grep -c health` 重测：**4/0、3/0、5/0、4/0**（A 类）；delete 3 / recall 6 / store 8（C 类）；formatter 0（B 类）——**与复核者一致** | **前置研究 §4.1 重写**为三分类；**裁决 W2-9 改为「A 类 4 个面」**+ C 类顺带 + B 类**先判定是否在范围内**（倾向不在）；**W6-24** 的数字更正同步 |
| 2 | `ok: true` 分布代理（§7.1） | 原稿「23 个模块、**全部在 FIXTURE 侧**」**两项都错**：实为 **25** 个模块，且 **2 个在 REAL 侧**（`sessionManager.ts` 6 处、`playwrightRuntime.ts` 5 处——都在模型侧真正执行的路径上） | 主代理重算：25 个模块 / 93 处；REAL 2、ASSEMBLED 5、FIXTURE 18 | **前置研究 §7.1 重写**该段，并记下**教训**：`ok: true` 在真实路径上是**正确用法**、在夹具里才可疑——**同一个字面量在不同定位下含义相反**，拿它当 demo 判据是「只看了一层」；**裁决 §5-2 的依据改为只剩「定位裁决」**（判决不变） |
| 3 | `TOL-06` 的 `rollback` 计数 | 原稿「全仓 33 处，**全部**在 durable/SQLite 语境」——**过强**。复核者用多种 grep 变体都复现不出 33 | 主代理重测（`grep -i -w 'rollback' --include=*.ts --include=*.md`）：**38 处**，其中 **26** 在存储事务语境，**其余 12** 分散在 agent 包的设计文档、`packages/chord/PLANNING.md` 的**模块重载**事务、以及测试夹具里的错误名 | **前置研究 §3.1 更正**为准确的 38/26/12 分解；**结论（pi 无文件编辑事务）不变**，正确引文仍是 `core/tools/` 内**零命中** |
| 4 | `SES-02` 的成本理由 | 原稿「加 epoch 会动 `state.json` 格式**与迁移**」——**「与迁移」那半站不住**（`state.json` **没有版本字段、也没有可扩展的迁移机制**）；且**加 fencing 本身不必动 `state.json`**（锁文件独立、每次获取重写，epoch 放锁里即可） | 主代理复验：只有**登记册原提的那个具体设计**（`13` 号册 `:930`「`state.json` 里放 epoch」）才改格式（`buildSessionStateSnapshot` 逐字段重建） | **裁决 §6 重写**该行的成本表述；**「不做」的判决不变**，理由改为「加 epoch 要新增一条写路径校验，**收益未被证据支持**」 |

#### 8.3.2 复核者**成立但只纠正引文精度**的（不改判决）

| 条目 | 复核内容 | 处置 |
|---|---|---|
| `OBS-09` | `crash-log.ts` 的常量行号是 **`:18-19`**（我写 `:15-16`） | 已在 §8.5 自查中先行更正 |
| `CTX-09` | `nested-tool-calls.ts` **不在 `core/tools/` 下**（在 `core/`），常量 `:26-31`、丢弃分支 `:56-58` | 已在 §8.5 先行更正 |
| `TOL-08` | `interactive-mode.ts` 的 `prependListener` 在 **`:4212`**（我写 `:4211`） | 已更正 |
| `TOL-06` | `pi` 的 `file-mutation-queue.ts` 是 **61 行**（我写 62） | 不改（`wc -l` 与末行换行的差异，无实质） |
| `LOP-01` | 复核者补了一条**对我方有利**的事实：我们的 `DoomLoopDetector` **也有** `findRepeatingCycle` 交替检测（`cycleThreshold` 5）⇒ 登记册「只比参数」的说法**只对历史条目成立**，对检测器不全对 | **不改判决**（消息宣称未做过判断这一条完全成立），但**登记册的措辞应收窄** |

#### 8.3.2b 复核者**加重**了 3 条（判决不变，但缺口比我写的更大）

| 条目 | 原稿 | 复核者实测（主代理复验） | 处置 |
|---|---|---|---|
| `OBS-04`(MCP) | 「每 prompt 一个网关 ⇒ 每 server 每次 `listTools` 起一个子进程」 | **远不止**：`core/mcp/gateway.ts:186` 的 `invokeTool` 在每次工具调用前**先跑一次 `listTools()`** 做存在性检查；`snapshot()`（`:117-131`）逐 client `listTools` ⇒ **每 prompt = 1 + 工具调用数 × 2**（再乘重试） | **W3-11 的验收指标改写**为真实公式；前置研究 §4.4 补该证据 |
| `SES-07` | 「唯一回收点在 `deleteSession`」 | 有**第二条绕过路径**：`session/lifecycle/sessionLifecycleWrites.ts:214` 的 `discardIfEmpty` **直接** `this.host.store.deleteSession(sessionId)`，不过 `SessionReadSurface` ⇒ 被丢弃的空会话**永不** forget todo 表 | **W3-12 增加该路径**（否则只修一半）；前置研究 §2.3 补该证据 |
| `SES-06` | 「三个同簇消费面」 | 属实，但范围比我写的**窄**：`sessionContinuationProjection.ts` 在 `session/` 而非 `session/continuation/`，其 allowlist 只与 parity 批次**部分**重叠（`claim-ledger`、`verify-blocker-kind`） | **W4-16 的措辞收窄**（仍整体评估，但不宣称「同一批前缀」） |

#### 8.3.3 复核者**独立复现**的证据（本轮最有价值的部分）

复核者不是读码推断，而是**自己跑了**：

- `RvA18CliSession` **实机复现** `CLI-01`：`printf '/help\n' | cheers --json` → **0 行 JSON / 105 行输出**（与我的数字逐字一致）；
  **实机复现** `CMD-04`：`/exit`、`/clear`、`/cancel` 全部 `blocked / interactive-only`；
  **实机构造 2-环**（`a.parentId=b, b.parentId=a, c.parentId=b`）后**分别调用** `readSessionTree` 与 `sessionThreadPath`，
  得到**相反结论**（前者返回完整树，后者 `{path: [], resolved: false}`）——**我的 §3.3 矛盾断言被独立构造证实**；
  **独立跑** `keyGuide + keybindings + keymap` = **71/71 通过**，且用脚本复算出「两表零漂移」与我的数字一致。
- `RvC18SelfMarked` **独立构造**环、**独立 grep** 全仓确认「无键位文档页」（`find -name 'keybindings*.md'` → 0）。

#### 8.3.4 本轮复核为何**没有**出现 `wrong`

三个具体原因（沿用 Phase 17 §7.3.4 的观察）：

1. **brief 把「载重断言」逐条列出并给了行号锚点**——复核者不需要自己猜哪里可能错；
2. **要求复核者自己跑探针**（`CLI-01`/`CMD-04`/`CTX-02` 的实机复现都是复核者独立执行的）；
3. **前置研究里已经先标了 `[INFERENCE]` 与「未复验」的边界**（§9.5），复核者的火力集中在有断言的地方。

**仍有一条复核者未能独立验证、由主代理降级记录的**：
`proper-lockfile@4.1.2` 的**内部机制**（续期 / `ECOMPROMISED`）读自**上游源**而非 `pi` 树内
（`pi` 未签入 `node_modules`）；复核者确认了依赖声明在 `pi/.../package.json:68`，
但机制细节仍标 `[INFERENCE-依赖上游源]`（前置研究 §9.5 已记）。

### 8.4 实施记录

当前完成验收见[52项核对表](phase-18-acceptance.md)。历史波次记录不是整体完成声明。

2026-10-02：从 `feat/phase-18` 上已有的条件写入实现继续施工。规划原稿独立保存于
`b271e40`；执行状态按下表与登记册核对，其余执行项仍待完成。

| 执行项 | 当前证据 | 状态 |
|---|---|---|
| W1-1 / `TOL-07` | 三条 edit 输入路径传递未经正规化的原文；持锁快照前与异步快照后各复核一次；外部进程改写、删除、空文件与 BOM/CRLF 回归覆盖 | 已实现，本地验证通过 |
| W1-2 / `CMD-04` | 注册表显式声明支持与拒绝理由，处理前默认拒绝；`/clear` 复用会话创建与绑定，`/exit` 停止脚本、批量与实时 stdin 后续输入 | 已实现，本地验证通过 |
| W1-3 / `CLI-01` | `--json` 隐含非交互输入；启动诊断、命令与回合共享单个 JSON 输出器，事件序号跨回合连续 | 已实现，本地验证通过 |
| W1-4 / `LOP-01` | 只描述已观察到的请求重复，区分单次与循环序列；不声称已执行或分析过结果进展 | 已实现，本地验证通过 |
| W1-5 / `OBS-09` | 日志按年龄、mtime 与数量清理；启动和持续轮转均执行，默认保留 20 文件 | 已实现，本地验证通过 |
| W1-6 / `BRW-04` | 逐个观察资源关闭结果，失败指名并保留句柄供重试；并发关闭共享结果，等待进行中的初始化 | 已实现，本地验证通过 |
| W2-7 / `CMD-06` | `/tree` 选择器与按 ID 导航共享既有叶切换、摘要、上下文与 todo 重建；损坏路径可见但不可导航 | 已实现，本地验证通过 |
| W2-8 / `CMD-03` | `/back` 参数交给同一选择器：最近序号或条目 ID 预选，其余文本筛选；确认后才导航 | 已实现，本地验证通过 |
| W2-9 / `CTX-02`、`CTX-08` | 各记忆命令从实际 store 健康快照派生可读、可写、模式与诊断；未写入操作仍明确报告未写入 | 已实现，本地验证通过 |
| W2-10 / `PRV-04` | `/btw` 兜底显示超时、网络、拒答、HTTP、空答或坏 JSON 分类，保留缺凭据路径 | 已实现，本地验证通过 |
| W2 小项 / `OBS-13` | 命令名与别名共同参与候选，参数补全使用既有别名解析；注册变更使缓存失效 | 已实现，本地验证通过 |
| W3-11 / R3 / OBS-04、OBS-15 | 标准 stdio JSON-RPC，握手后可用；同一会话复用连接，配置/目录切换释放旧进程；关闭取消等待并拒绝排队调用 | 已实现，本地验证通过 |
| W3-12 / SES-07 | 切换会话释放旧 todo；两条删除路径均在存储删除成功后释放，同 ID 更新保留 | 已实现，本地验证通过 |
| W3-13 / CTX-09 | 五处状态持有者增加容量及丢弃标记；外层会话表同样有界，异步注入失去状态后不报告成功 | 已实现，本地验证通过 |
| W4-14 / SES-02 缓解 | 同步临界区按本机持有者存活保护，release 校验 token/文件身份，action 不重复执行；仍无 fencing | 已实现，本地验证通过 |
| W8-38 / SES-09（随 W4） | 空/半写锁 500ms 创建宽限；文件读取错误不夺锁 | 已实现，本地验证通过 |
| W4-15 / PRV-10 | 累计用量随现有 state 写入；锁内增量合并；恢复重建上下文测量 | 已实现，本地验证通过 |
| W4-16 / SES-06 | 删除旧显示规则和未消费投影；保留历史阻断/写入状态恢复 | 已实现，本地验证通过 |
| CMD-12 | 来源列表持久化、失败显式显示、移除无实现的搜索承诺 | 已实现，本地验证通过 |
| W5-17 / TOL-06 | 明确每文件提交边界和显式恢复入口 | 已实现，本地验证通过 |
| W5-18 / TOL-08 | 有界 TERM/KILL 与 Windows launcher 等待；失败可见、退出等待 pending | 已实现，本地验证通过 |
| W5-19 / PRV-12、PRV-13 | 两Google端点区分单次/流式方法并对齐Accept与解码 | 已实现，本地验证通过 |
| W5-20 | 键位参考页、表格漂移检测、重绑定示例与runtime提示入口 | 已实现，本地验证通过 |
| W5-21 / OBS-11(sidebar) | 正式snapshot入口；旧别名仅单帧快照，默认布局保留 | 已实现，本地验证通过 |
| W5-22 / CDE-01 | 明确早期候选数不等于当前不可达数或删除配额；链接最终闭包 | 已完成文档修正 |
| W5小项 / CMD-11 | 未闭合参数保留原文，已完成参数和正常引号解析保留 | 已实现，本地验证通过 |
| W5小项 / CMD-13 | 配置变更与主题实际应用区分，失败原因及保留主题可见 | 已实现，本地验证通过 |
| W5小项 / TUI-10 | 共用可视行映射、单元格目标列与历史边界 | 已实现，本地验证通过 |
| W5小项 / TUI-11 | 全屏picker/补全点击聚焦，仍由键盘确认；弹层捕获完整指针手势 | 已实现，本地验证通过 |
| W5小项 / OBS-14 | 删除未消费换行提示链，实际输入与/hotkey保持既有路径 | 已实现，本地验证通过 |
| W6-23 | sidebar编号改为OBS-11/OBS-12，钩子/MCP保持OBS-03/OBS-04 | 已完成文档修正 |
| W6-24 | 修正浏览器总数与历史分类口径；CTX-08/CDE-01已纠正；PRV-04按W2修复保留FIXED | 已完成文档修正 |
| W7-25 / THM-03 | auto已落地；48个实用令牌、4套预设及旧主题继承；数字对齐裁决按实际消费者修正 | 已完成，本地验证通过 |
| W7-30 / W8-34 / SUB-01 | 最窄权限、单层递归、工具清单、任务正文、执行上下文及worktree生命周期已闭合；清理须停止写入方 | 已完成，本地验证通过；并发后台写入为明确限制 |
| W8-40 / TOL-10（随W7-30） | 失败原因及部分答复保留；工具阶段取消和空答复按失败结算；适配器向父模型传递error | 已完成，定向验证通过；旧result-contract脚本仍失败 |
| W7-32 | read每次返回正文；startup结构/身份/有界读写、freshness与命令投影已修复；保留默认禁用 | 已完成，定向验证与隔离验收通过 |
| W7-28 / BRW-06 | receipt保证审计闭合；有界读取、合作锁、日志隔离、tombstone与命令状态已验证 | 已完成，定向验证与隔离进程验收通过 |
| W7-26 / SES-08 | 回放、导出、迁移、恢复准入、检查点、字段优先级与历史写入观察已核验；后续转W7-31 | 已完成；原36模块行为矩阵闭合，保证边界与历史数据限制见审计表 |
| W7-31 | [38模块Shell审计](phase-18-shell-audit.md)；审批、根绑定、准入、后台输出、Shell选择与关闭均有行为证据 | 已完成；所列行为矩阵及旧result-contract门禁债务闭合，保证边界见审计表 |
| W7-27 | [Provider审计](phase-18-provider-audit.md)；单次响应、SSE/EOF、重试、签名、字段、缓存刷新与用量恢复 | 有界审计已完成；认证准备与整体期限限制保留，真实传输归W7-33 |
| W7–W8 | 按 §2、§10 的完整执行表继续；合并重复问题但保留各项验收证据 | 待完成 |

W1-1：`npm run test:ts -- src/runtime/execution/conditionalWrite.test.ts
src/runtime/execution/service.test.ts src/runtime/execution/fileLock.test.ts
src/core/tools/editEngine.test.ts src/core/tools/highValueTools.test.ts
src/core/security/writeTarget.test.ts`，6 文件 / 89 项通过；`npm run build:ts` 退出 0。
反向移除两处内容复核后，条件写入套件 8 失败 / 3 通过，恢复后 11 项通过。
保留现有无条件写入语义；条件写入检测已经观察到的外部改动，不承诺文件系统级原子比较交换。
对照决策为「原有单文件队列 + 锁内原文比较」；本仓额外覆盖恢复快照的异步等待窗口。

W1-2：7 个定向文件 / 97 项测试与 2 项隔离真实 CLI 管道测试通过，`build:ts` 退出 0。
反向撤销声明检查与会话动作处理，7 失败 / 6 通过；恢复后该 13 项全部通过。
编译后 CLI 在上游 stdin 保持打开时接收 `/exit`，退出 0，仅处理 1 个输入。
`/retry` 与 `/cancel` 依赖交互会话中的上一失败提交或进行中回合，保留拒绝并由注册表说明理由。
对照决策为「命令逐项声明 + 执行前统一过滤」；已有派发分支只承担宿主动作，不再决定命令是否获准执行。

W1-3：4 文件 / 67 项通过、构建通过。撤销 JSON 模式与启动输出捕获后，5 失败 / 7 通过。
补充编译后 CLI 验收：`--json` 与回放文件、启动主题诊断同时使用，102 个输出行均为合法 JSON，
序号连续且包含回合终止事件。对照决策为「JSON 是独立非交互输出模式」；
本仓还需覆盖模型回合之外的命令与诊断，不能只在模型调用期间抑制普通文本。

W1-4：2 文件 / 30 项通过；回退提示后 2 项失败，恢复后通过。
沿用既有重复阈值与检测器，不引入结果进展判断；对照决策是只陈述检测实际使用的证据。

W1-5：4 文件 / 25 项通过；回退后新增容量套件 8 失败 / 1 通过，恢复后通过。
复用既有日志枚举与排序，不增加第二份排序规则。对照决策为「年龄与数量双界限」。
本仓按 PID 分文件，因此保留当前文件与其他活跃进程的日志；活跃外部进程文件或删除失败
可能使目录总数暂时超过 `maxFiles`，不宣称强制删除它们。单进程持续轮转的 1/3 文件边界均实测通过。

W1-6：`npm run test:ts -- src/browser/sessionManager.test.ts
src/browser/sessionManager.integration.test.ts src/core/tools/browserUnified.test.ts`，
3 文件 / 27 项通过，其中 7 项使用本地真实浏览器；`npm run build:ts` 退出 0。
回退资源关闭实现后，7 失败 / 4 通过；恢复后上述 27 项再次通过。
对照决策为「观察关闭完成、保留失败供下一次处理」，不从关闭异常推定资源已消失。
正常关闭才报告全部释放；失败关闭继续尝试其余资源，并阻止新建会话直到清理成功。
进程退出钩子仍为尽力清理，不参与成功证明。

W1 波末（2026-10-02）：`verify:import-cycles`（1356 文件，运行时/类型环均 0）、
`check:config-consumers`（39/39）、`check:declarations`（18/18 hooks、10/10 factories）、
`check:node-floor`、`verify:docs-drift:strict` 均退出 0；文档检查保留 120 个已有非前缀源码引用 advisory。
`test:scripts` 40 项通过；`check:call-reachability` 为 7 个既有 advisory。
`analyze:module-facades` 报 7 个既有超限模块，未触及这些模块的 W1 不将其宣称为修复。
使用仓内 `.normproof/normproof-0.1.0.tgz` 执行 `normproof judge`，退出 0：
循环与未解析导入义务满足，总体仍为 `partial`，函数数量义务报告 6 个模块
（该工具与 facade gate 的扫描/计数范围不同）。

编译产物真实 PTY 验收：隔离 HOME/USERPROFILE、独立临时 git workspace、合成离线配置；
regular/fullscreen 两种界面均验证 `/clear` 更换持久会话、todo 不串会话、`/exit` 在终端仍打开时退出 0。
JSON 模式以 `--replay-file` 指定输入，90 行全部可解析且序号连续，退出 0。
探针最初两次失败分别是大小写断言错误、误把 TTY stdin 当作 print 输入；修正探针后全部通过，未据此修改产品。
本波未跑完整 TypeScript 套件、未使用真实提供方；远端 CI 结果另记。

W1 远端首轮：草稿 PR #1，`b53c831a8f91fec45c049ef3428af9748cbdfda2` 的
[CI 36958391897](https://github.com/h-hei133/cheers/actions/runs/36958391897) 完整套件为
4226 通过 / 1 失败 / 1 既有跳过，失败在日志家族 tail/export。
分类为两部分：测试原本要求保留全部 60 行，需要显式设更大的 `maxFiles`；
产品轮转会复用清理后留下的低编号，导致同 mtime 下顺序错误，连最新记录也可能被优先清理。
修复为编号递增、重新打开时从现存最高编号继续；对照保留记录的追加顺序，不把空闲名字当作时间顺序。
新增持续清理/重新打开/同时间戳回归，5 文件 / 34 项通过、构建通过，撤销编号修复后 2 项失败。
这是首轮 CI 暴露后补修的真实回归，不把首轮描述为通过。

W2-7：12 个定向文件 / 158 项通过，构建与循环门禁通过。撤销命令注册和摘要来源标记后，
导航集成套件 4 失败 / 3 通过；恢复后 9 项导航/损坏投影测试通过。
对照决策：同一会话中保留所有分支；当前叶选择不写入；运行中不导航；摘要投影保留其来源。
沿用既有 `/back` 的合同：选中的用户问题仍在历史中，同时放回输入框；这一点与选中问题前移到父节点的参考实现不同。
`readSessionTree` 只修复展示边，不改原始 `parentId`；导航以原始祖先链为准，环/孤儿/缺失消息显示为不可选，
构造测试证明两者对同一损坏线程的处理各有明确用途。

**裁决补正**：原有 `revertTo` 在摘要成功时会把无来源的上下文投影误判为新用户条目，
读取线程就会改变活动叶。为压实/分支摘要增加 `metadata.contextSummary`，线程补齐与分支计数忽略该投影，
保留真实摘要事件和原始消息；集成测试钉住「摘要成功后仍指向所选 ID」，不能用无摘要路径代替。
会话选择器在异步导航期间排队新输入，直到历史和草稿均恢复后再消费。

W2-8：`npm run test:ts -- src/cli/interactive/picker/rewind.test.ts
src/cli/interactive/picker/pickers.test.ts src/cli/interactive/history.test.ts
src/cli/interactive/overlay.test.ts src/presentation/tui/chrome/options.test.ts`，
5 文件 / 101 项通过，构建退出 0。撤销选择器入口后 7 失败 / 5 通过；恢复后 12 项通过。
与 W2-7 共用选择器和确认语义；数字从最近问题起按 1 计数，精确 ID 预选，其余参数作为初始筛选。
仅 `/back` 接管带参数形式，`/resume id`、`/model use name`、`/tree id` 保留各自直接调用路径；
未知命令和对象原型属性名均不被误接管。此处未宣称已完成 W2 的波末真实 PTY 验收。

W2-9：10 文件 / 90 项定向测试通过，构建退出 0。移除命令层实际 health 接线后，新增的
7 项生产入口/状态矩阵测试全部失败；恢复后 7 项通过，循环门禁通过。
对照决策为「每次读取实际配置和存储状态再渲染」，
保留可读但不可写的损坏存储状态；无快照明确显示 `not checked`，不推断为 disabled。
同进程覆盖真实 CLI 装配的 `/memory`、`/memory status`、`/compact preview`，
并覆盖禁用、测试存储、显式本地存储、可读损坏、不可读以及损坏后恢复。
review/preview/use 的「没有写入」仍是操作结果，不推导出存储不存在；recall/wake/use 能力随可读状态派生。
三个 runner 的禁用快照复用同一个 owner，既有证据来源保留。
模型可见的单次显式注入提示属于授权与上下文合同，未作为用户状态面改写；本项不更改保存或注入权限。

W2-10（自研）：4 文件 / 33 项定向测试与构建通过。撤销命令分类后 6 失败 / 4 通过，恢复后 10 项通过。
复用既有提供方分类器与拒答模式，HTTP 失败和空输出由单次请求 owner 回报分类，传输异常由调用方归类；
响应正文和异常原文不进入兜底文案。15 秒命令截止时间用可控时钟验证，计时器释放后退出。
缺凭据仍明确说明没有发送请求；失败结果的脚注不再使用「已回答」措辞。
裁决补正：只改命令的 catch 不足以识别 HTTP 拒绝，因为请求 owner 原来先把它折叠为 undefined；
增加可选分类观察回调，原有 string/undefined 返回合同保留，不新建请求路径。

W2 小项 `OBS-13`（自研）：2 文件 / 25 项定向测试和构建通过；撤销补全实现后 3 失败 / 17 通过，
恢复后 20 项通过。`/qu` 返回 `/quit`，`/where re` 与 `/workspace re` 使用同一参数候选；
大小写、动态注册/卸载和重复别名均覆盖。候选冲突保留注册表的先匹配语义。

W2 波末复核（2026-10-02）：两路独立复核发现并修复三个遗漏，修复期间又发现一条嵌套队列回归：

- `4393be92`：祖先消息缺失会使整条后代路径不可导航，健康兄弟分支不受影响。
  对照持久条目遍历后，按本仓索引与 transcript 分离的结构补上消息完整性条件；
  选择器与直接 ID 路径都验证 state/transcript 未变。3 文件 / 35 项通过；撤销后 2 失败 / 8 通过。
- `cb9d8382`、`f875115f`：排队命令保留选择器确认语义；选择器内部执行命令时，
  最外层选择操作独占队列消费，内部命令结束不能提前启动下一条输入。
  覆盖导航/嵌套命令与确认/取消的四种组合；4 文件 / 59 项通过。
  两次撤销分别使两项回归失败。复核明确记录了首版队列修复的不足，未把首版当成最终验收。
- `71798437`（自研）：端点解析保留结构化拒答与 prompt-block 原因，单次请求先分类再接受正文；
  即使拒答伴随部分正文，也不会宣称回答成功。7 文件 / 165 项通过；撤销后 7 项拒答回归全部失败。
  对照流适配器保留停止原因的决策，单次请求的补充映射由本仓实现，不复制另一套请求通道。

修复后两路定向复核分别为 **APPROVE / CLEAR**。最终收尾执行：
`npm run test:ts -- src/session/query/navigation.test.ts src/cli/runtime/navigation.test.ts
src/cli/interactive/interactiveMode.test.ts src/provider/request/completion.test.ts`，
4 文件 / 39 项通过；`build:ts` 退出 0。
`verify:import-cycles`（1365 文件，运行时/类型环均 0）、`check:config-consumers`（39/39）、
`check:declarations`（18/18、10/10）、`check:node-floor` 均退出 0；`test:scripts` 40 项通过。
`check:call-reachability` 与 `analyze:module-facades` 分别保留 7 个既有 advisory，未声称已消除。

最新构建真实 PTY 验收：隔离 HOME/USERPROFILE、独立临时 git workspace、合成配置、无凭据；
regular/fullscreen 均验证 `/back 2` 先选择后确认、`/tree` 保留其他分支、按 ID 切换持久活动叶、
分支摘要落盘、记忆 store 状态、缺凭据 `/btw` 与 `/exit` 退出 0。
两种配置下的 `--json --replay-file` 分别输出 24 行合法 JSON，order 为连续的 1–24，
按 ID 导航在进程结束后仍生效。探针早期失败归因于启动画面假设、Escape 分帧、分页器关闭时机与
单复数文案；修正探针后通过，没有依据这些探针错误修改产品。
本波未跑本地完整 TypeScript 套件、未调用真实提供方；新提交的远端 CI 另记。


W2 远端补记：提交 8dada1f9 的 NormProof run 36966943362 成功；CI run 36966943357
为 **4277 通过 / 1 失败 / 1 跳过**，失败是 cli-baseline 的持久化测试固定等待 2.5 秒后杀掉启动进程，
读取到零个会话目录。独立修复提交 74913e7 改为复用 close-event harness，完成合成 prompt 后验证
metadata/state 为可读 JSON；定向测试通过，未据此改动持久化实现。

W3-11 / R3（2026-10-02）：标准 MCP stdio 与持久连接同批交付，R3 的实施前决策见 §10.4。
CLI bootstrap 创建一个网关，通过既有 session factory/bridge 同时供命令与 prompt 使用。
独立 invocation 自行持有并在 setup 失败或事件消费结束时关闭；项目目录和配置每次快照重读。
连接失败与不支持的传输维持 failed，认证与 disabled 状态不混为成功。

协议使用官方 SDK 的帧处理、握手、请求和 schema/JSON Schema 校验；目录 owner 保留全部分页元数据，
避免 SDK 每页覆盖前页 validator 的行为。工具返回结构化数据不符合 outputSchema 时明确失败；
需要异步 task 执行的工具明确拒绝；文本和结构化结果投影，无法携带的内容块显式标为错误。
工具失败不重放。退出先取消进行中的请求、拒绝未开始的队列，再观察直接子进程 close；
终端断连、SIGTERM/SIGHUP 与非交互 SIGINT 同样清理。每次请求的取消监听在结束时解除，
规避 SDK 保留已完成请求监听器的行为。完整进程树回收仍属 W5，不能由直接子进程验证代替。

独立代码/架构复核分别 **APPROVE / CLEAR**。复核实际捕获并修正：前页输出校验丢失、
远端参数拒绝错归为畸形结果、断连未释放连接、关闭后排队调用仍开始、取消监听单调增长。
最后的定向验证：
- build:ts 退出 0；
- MCP、工具转发、prompt、交互关闭、bridge 与 print 相关 **13 文件 / 72 项通过**；
- CLI 基线 MCP/持久化子集 **7 项通过 / 33 未选中**；
- 撤销共享网关注入、输出 schema 校验、每请求取消信号，三次各触发一个预期回归失败；
  分别观察到进程数 2 而非 1、坏结果被接受、17 个已完成请求被取消。源码逐次原字节恢复；
- 阻断静态门禁通过，脚本测试 40 项通过；保留既有函数数量 7、调用可达性 7、
  未加前缀的文档源引用 120 个 advisory。未运行本地完整 TypeScript 套件或真实提供方。

最终构建的真实 CLI 验收全部通过：regular/fullscreen 下先执行 /mcp status，再连续两个合成 prompt，
每个会话均只启动一个 MCP 进程；/exit 为 0 且子进程已退出。两组 JSON 回放各 31 行合法 JSON，
包含两个完成事件，仍只启动一个 MCP 进程，结束后已退出。另用忽略 EOF/SIGTERM 的服务验证：
PTY 主端断连为 exit 1，SIGTERM 为 exit 143，两者均在直接子进程退出后才结束。
全程隔离 HOME/USERPROFILE、临时 git 工作区、合成提供方、无凭据。

PTY 还实测捕获 stdout 的异步 EIO 导致 exit 7、MCP 子进程仍在运行的缺口；修复归 CLI
shutdown owner：监听已知流断连错误，保持监听直至异步资源释放结束，最后以失败码退出。
对照输出管道关闭和延迟 EIO 的参考处理后，采纳显式错误监听与延迟错误保护；不采纳立即 exit 0，
因为本仓必须先回收资源并保留输出失败。正常退出等待期间发生 EIO 也会把待定 0 升为失败。
新增两种错误顺序回归通过；新一轮独立代码复核 APPROVE、架构 CLEAR。
探针早期关于工作区识别、JSON envelope 字段与 fullscreen 重绘占位符的假设也已修正，
这些探针问题没有引起产品改动。

SDK 依赖精确固定 1.31.0；锁文件新增 92 项，原有依赖版本没有变化。安装时审计的七项依赖告警
所涉及版本与提交前锁文件相同；未扩大范围执行 audit fix，也未授权受阻的安装脚本。

---

W3-12（2026-10-02）：沿用既有 todo owner，在 substrate transition 与空会话 discard 补清理。
独立复核指出行模式缺少恢复调用，已将输入会话历史重放也放在共享切换入口，避免依赖 TUI 展示。
最终两条独立复核为 APPROVE / CLEAR；切走再切回的回归无需测试手动调用 replay。
参考比较采用显式生命周期移除，不另建状态所有者。`runtimeContext`、`todoPersistence`、
`SessionManager` 三文件 83 项通过，覆盖正常恢复、同 ID 保留、两条成功删除及失败不清理。
撤销新增的两处清理后 3 项失败（exit 1），恢复原字节。
W3-11 推送头 `1e8ce643` 的 CI `36972204423` 与 NormProof `36972204373` 均 success。

W3-13（2026-10-02）：参考 §4.2 的容量 + 丢弃标记方式，在既有 owner 保留行为，
共享 `core/state/retention.ts` 只负责无 I/O 的有界容器和历史裁剪，不新建执行或持久化系统。
默认会话 128、读取路径/会话 256、checkpoint 总量 256、注入历史与 review decisions/会话 256；
累计诊断也以 256 封顶，重复 review 决策 evidence 去重。容量是条目数，不承诺总字节数。
map 淘汰最近最少写入的条目；review 保留当前候选优先，其后保留历史。只读 miss 不新建会话表。
删除/clear 不增加丢弃计数；容量淘汰显式增加 `dropped`，`incomplete` 不因下一次正常写入消失。
外层淘汰后，缺失会话保守显示历史可能不完整，不保留无界 tombstone 表。正常写入流程保持既有权限语义。
独立复核补齐 `/memory status`/save 的截断显示，及检索期间发生淘汰时的注入结算检查。
撤销容量限制时五个 owner 测试文件 7 项失败；保留容量但删掉丢弃标记时 8 项失败，均 exit 1，
随后恢复原字节。W3-12 最新产物 regular/fullscreen PTY 的 A→B→A 清单恢复通过，
两种配置各 45 行 JSON 回放通过、exit 0；使用隔离 HOME、合成配置，未用真实提供方。
最终两条独立复核 APPROVE / CLEAR。`npm run build:ts` exit 0；最终定向组 27 文件 / 210 项通过：

```sh
npm run test:ts -- src/core/tools/readCache.test.ts src/core/tools/highValueTools.test.ts src/context/compact src/memory/projectMemoryReview src/memory/projectMemoryInjection src/memory/projectMemoryFutureTurnInjection.test.ts src/memory/projectMemorySaveCommandRunner.test.ts src/core/commands/slashRouter.test.ts src/core/shell/runtimeContext.test.ts src/core/commands/todoPersistence.test.ts src/session/SessionManager.test.ts
```

静态阻断门禁及 40 项脚本测试通过，既有 7 项函数数量 advisory、120 个无前缀文档源路径 advisory 保留。
本地未跑完整 TypeScript 套件；本批提交的远端 CI 结果与前批结果分别记录。
W3 远端头 `1b4d99e1`：NormProof `36975297206` success；CI `36975297210` 为
4309 passed / 4 failed / 1 skipped。4 个失败均是 history/recovery 测试使用 `as never`
省略了 Session 必需的 `turns`，生产 Session 创建/加载始终提供数组；补齐夹具后两文件及
runtimeContext 回归共 46 项通过。该测试修正独立提交，不把前批的远端成功挪用到本批。

W4-14 实施前修正（2026-10-02）：`withFileLock` 的会话临界区全部同步，包含同步 I/O 与
`Atomics.wait`。参考的定时 heartbeat 依赖异步临界区让出事件循环；直接照搬 `setInterval`
无法在我方同步临界区续期。逐次写入另建 worker 的成本也与本项最小缓解不符。
故用「本机仍存活的持有者不按年龄夺锁」替代同线程定时续期，只在本机 PID 明确 ESRCH 时回收，
其他主机/缺 owner 的锁仍保留年龄兜底；随机 token 与文件身份共同校验 release。
这是自研的同步边界适配，不宣称分布式锁或 fencing；PID 复用可能造成保守等待。
同步 action 失败不走获取锁的重试，避免 EEXIST/EPERM 被误当锁竞争而重复执行已部分写入的操作。
空锁短宽限 SES-09 单独提交。
W4-14 验证：`npm run test:ts -- src/session/store/sessionFileStore.test.ts src/session/store/lockStaleness.test.ts src/session/SessionManager.test.ts`
3 文件 / 85 项通过；`npm run build:ts` exit 0。撤销两处 owner 实现后 8 项失败、exit 1，恢复原字节。
真实子进程 SIGSTOP + 超过年龄阈值的观察仍判本机锁存活；模拟外部替换后 SIGCONT，
旧持有者 exit 3（ownership lost）且 successor 锁原样保留。独立复核 APPROVE / CLEAR。
SES-09 同域独立修复：空/半写 JSON 的创建宽限为 500ms，小于 1.2s 获取等待；EACCES/EIO
等 I/O 读失败不推断死亡，缺身份时任意暂停仍是无 fencing 的已知边界。锁测试 2 文件 / 22 项通过，
涵盖新建空锁/半写锁实际恢复及精确宽限边界。改回 60s 后 2 项失败，exit 1，恢复原字节。
独立代码复核 APPROVE、架构 CLEAR；正文与旧注释统一为「恢复启发式」，不把年龄称为死亡证明。


W5-18 / TOL-08（2026-10-02）：保留既有执行 owner，进程组管理器只管跟踪/去重，OS 终止适配放在
`core/shell/platform/termination.ts`。参考 shell 路径使用立即 KILL/不等 taskkill，未解决本条；另一执行
路径的 TERM→延迟→KILL 决策采纳，但不采用 `child.killed` 判断退出（该字段只表示信号发送）。
本仓用组存在性观察，1s 后升级；Windows 等待 launcher close，5s 超时失败。所有调用者已迁移为 await；
CLI 对资源与进程清理 allSettled 后才退出，失败退出码 1。失败目标保留跟踪（Windows root 已 close 则移除旧 PID，不再启动新的 taskkill）；前台清理失败独立结算、
保留已有输出和触发原因，不依赖可能永不发生的 close。后台只报告 Stop requested。
不保证逃逸子孙/父进程 SIGKILL 后回收，POSIX Promise 也不宣称整个树已退出，详见登记册 TOL-08。

验证：9文件87项定向测试通过；TypeScript构建、零循环通过，
函数 ceiling 保留原7项 advisory。撤销宽限和Windows等待后6项失败（伴随1项测试拒绝诊断），源码逐字恢复。
实际编译CLI：常规PTY /exit 给TERM handler完成flush后退出0；全屏PTY SIGTERM 升级忽略TERM的子进程后退出143；
JSON /exit退出0、最终复跑20行均可解析，受控子进程均不再运行。未做Windows实机或真实提供方验证。独立代码/架构复核 APPROVE / CLEAR。


W5-19 / PRV-12、PRV-13（2026-10-02）：对照底层 SDK 使用独立 generateContent / generateContentStream
的方法及流式 alt=sse 约定，保留本仓端点 owner 与 googleWire 单一转换器。path 接收 stream 参数，
默认保持主回合；两个 res.json 调用入口明确选择单次方法并用 Headers 副本设置 JSON Accept。
认证字段保留、大小写合并，原 provider.headers 不修改；签名层既有 Headers 消费路径兼容。
旧 Google 流式 URL 测试属于钉住缺陷的预期，改为包含 SSE 参数。

7文件143项首轮定向测试通过，JSON headers改动后的4文件40项（含btw命令）通过，TypeScript构建通过；
撤销三个关键点后8项矩阵中6项失败，源码逐字恢复。编译模块对本地HTTP服务发送2端点×3入口共6请求，
URL/Accept/SSE或JSON解码均符合约定。独立复核 APPROVE / CLEAR。传输扩展测试首次因 Date.now 负耗时
（-3685ms，疑似环境时钟回拨）失败1项；未改源码，单独复跑25项全部通过。未做真实Google提供方验证。
同型边界：Bedrock简单调用仍固定converse-stream（先前缺口），已登记到W7-27而未混入Google提交。


W5-20（2026-10-02）：新增 [键位参考页](../guides/keybindings.md)，39个action及5个gesture从既有表导出；
测试逐行比对以阻止增删/描述漂移，并将文档JSON示例送入真实 Keybindings 与 /hotkey 渲染，验证覆盖和禁用。
采纳参考的动作ID/覆盖/禁用/reload使用方式，不采用其手写帮助表；表派生/一致性验证属本仓自研。
裁决微调：包只发布dist/src、不携带.wiki，产品可在任意项目目录运行，所以系统提示指向实时/hotkey，
仓库文档通过wiki索引接入，不往运行时注入不存在的仓库文档路径。
4文件81项定向测试和构建通过；篡改默认表与示例后2项失败，文档逐字恢复后5项guide测试通过。
独立复核APPROVE / CLEAR。实际常规/全屏PTY均验证f2绑定、image禁用显示unbound、修改后/reload切到f3，退出0。
验收脚本曾未关闭长输出查看器/等待视口外文字，已按真实交互调整；没有据此修改产品行为。


W5-21 / OBS-11(sidebar)（2026-10-02）：选诚实命名方案，正式入口/sidebar snapshot。
兼容watch/live仍可输入但只返回单帧快照，不进补全；registry、usage、标题和说明同步。
命令contract固定frameCount:1，runner只tick一次；现有state/layout/event store继续复用，无新刷新系统。
复核修正：bare/sidebar保持原normal布局，显式snapshot的metadata替换重复header，避免把新元信息
加给原默认面板；原始检查点/活动/遮盖处理与分页回归继续通过。事件源仅命令的问题保持OPEN。
12文件79项定向测试和构建通过；撤销canonical入口及诚实标题后3项失败，源码逐字恢复。
独立复核APPROVE / CLEAR。常规/全屏PTY分别验证snapshot与watch别名，退出0；JSON三种拼写29行均可解析。

W5-22 / CDE-01（2026-10-02）：登记册标题及注释明确12文件/1,349行仅为历史候选口径，
以Phase 17 §8.9逐簇删除/转类型/保留决定为准，不制造一个新的最终删除总数。纯文档变更，未跑构建/测试。

### 8.5 主代理在等待复核者期间新增的六处自查（已并入正文）

为降低「复核者结论成为唯一依据」的风险，在派发复核的同时我自己把风险最高的一批引文又跑了一遍，并**更正了三处行号**：

| # | 我原先写的 | 实测 | 处置 |
|---|---|---|---|
| 1 | `pi/core/crash-log.ts:15-16` | 实为 **`:18-19`**（`MAX_CRASH_RECORDS = 5`、`MAX_AGE`） | 已更正（`:139` 的 `.slice(-MAX_CRASH_RECORDS)` 正确） |
| 2 | `pi/core/tools/nested-tool-calls.ts:30-36`、`:71-74` | 文件实为 `pi/packages/coding-agent/src/core/nested-tool-calls.ts`（**不在 `tools/` 下**）；常量在 **`:26-31`**，丢弃分支在 **`:56-58`** | 已更正 |
| 3 | `pi/core/tools/truncate.ts:16-17` | 实为 **`:11-12`**（`DEFAULT_MAX_LINES=2000`、`DEFAULT_MAX_BYTES=50*1024`） | 已更正 |
| 4 | 「`browser/smoke/` 三模块搬入导致 164→167」 | `git show 8adc76f9 --name-status` 证实是 **rename**（`R096/R082/R090`，从 `core/harness/` 迁出），**搬家前不计入 `browser/`** | 已补证据（前置研究 §7.1） |
| 5 | `pi` 的 `killProcessTree`「Windows 不 await」 | 逐行确认：`:191-200` 只挂 `child.once("error")`，**无 await**；`:208` `process.kill(-pid, "SIGKILL")` **无 SIGTERM 宽限** | `自研` 标记成立 |
| 6 | 我方 `writeSessionState` 的锁释放 | 逐行确认：`sessionFileStore.ts` 的 `finally` 里是 `fs.rmSync(lockPath, { force: true })`——**无条件删除，未比对 owner** | W4-14 的 (b) 依据成立 |

**这六处是我自己在复核者返回之前发现的**，不依赖复核结论；记在此处以免复核者重复劳动，也便于对照复核者的独立结论。

W4-15 / PRV-10（2026-10-02）：参考从持久化条目按 provider/model 聚合的决定，沿用本仓
`state.json` 扩展点；累计桶保留完整键，不持久化 live footprint 或 recentRequests。
原因：压缩/导航后的内存 context reset 可能发生在上一次写入之后，恢复旧测量会制造错误缓存比较。
两个既有状态写入入口共用 usage owner，在锁内将本地相对上次成功写入/恢复基线的增量加到当前磁盘值；
写成功才同步 live 与基线，避免同一增量重复计入或另一个进程的总量被覆盖。未激活的读/改写不归零，
纯 schema builder 只保留当前 snapshot。新增类型/数值解码拒绝损坏记录，桶保持 null prototype。
旧格式无 usage 仍可加载，但无法追补过去未保存的用量；记录与下一次状态写入间的崩溃窗口不由此关闭。

验证：`npm run test:ts -- src/observability src/session/store/usage.test.ts src/session/store/sessionStore.test.ts src/session/store/threadState.test.ts src/session/schema/sessionStateSnapshot.test.ts src/session/transcript/sessionQueryEventPersistence.test.ts src/session/SessionManager.test.ts src/core/shell/runtimeContext.test.ts src/core/shell/recovery.test.ts src/cli/interactive/history.test.ts src/core/commands/costCommand.test.ts`
**21 文件 / 227 测试通过**；构建与 import cycles（1379 文件、零环）通过。双线独立复核 APPROVE / CLEAR。
替换增量合并为全量覆盖并撤销激活恢复后，两个新测试文件均失败（2 tests failed），恢复精确源字节。
常规/全屏真实 PTY：新进程以 `--session-id` 恢复 **3,000,000 tokens / $0.4200**，A→B→A
保留各自用量；两种配置的 JSON 回放各 45 行、退出 0。首次 PTY 脚本未关闭 `/cost` 长输出视图，
后续输入被视图消费；补发 Esc 并等待提示后通过，无产品修复。前一提交 `ee1842d9` 的
CI `36977519414` 与 NormProof `36977519368` 已全部成功；本项尚未据此声称远端通过。

W4-16 / SES-06（2026-10-02）：修正「入口恒假」的边界：当前 turn/query 不产出 codingResult，
历史 transcript 仍可经恢复链读取它。因此移除显示前缀表与专用测试、两个追加调用，以及
sessionResultParity 中无人消费的 capability/authority/redaction/evidence 派生字段，
但保留外层成功/失败 handoff、结构化 verification、writer-started/unknown/unverified、检查与 restore 信息。
同簇评估：actionableFailure 的兼容阻断/下一步解析保留（终端 owner 仍支持同类历史 hints），
snapshot 保留 verify 提示与安全过滤，仅取消 claim-ledger 的特殊优先级。与参考无同型实现；
本次为既定退役裁决，不新增替代显示或执行系统。

删除前后实际启动编译 CLI，隔离 home/workspace，以合成提供方完成 query→transcript→重启恢复；
两个进程退出 0，恢复输出 44 条有效 JSON，未产生 codingResult 或 parity 行。不是 live provider 测试。
初轮 24 项失败均断言已退役显示表；移除专用表测试，合并重复标签情形为「保留结构化事实、拒绝再生成标签」
回归，保留旧写入安全测试。8 文件 / 143 项定向测试通过，构建通过；独立复核又发现一条 compact
旧标签断言，已改为核验阻断原因/下一步与标签缺席。休眠脚本中对已删专用测试的引用一并移除；
该脚本另有 11 个先前已缺失目标、无 package/CI 调用，不声明其门禁通过。
补充 compact 4/4 通过（含独立复跑），累计主代理 147 项定向测试通过，双线最终 APPROVE / CLEAR。
撤销五处退役改动后 15 项失败，精确恢复源字节；脚本语法检查与严格文档漂移门禁通过。

CMD-12（2026-10-02）：来源列表由 `core/commands/marketplace/store.ts` 所有，当前用户目录
`marketplaces.json` + `CHEERS_MARKETPLACES_FILE` 可覆盖。参考 settings-manager 的锁内读取与合并决策，
复用本仓既有 lock/atomic write；无进程缓存，修改前读最新文件。未照搬 plugin 的吞掉 I/O 错误行为：
仅 ENOENT 视为空，损坏 JSON/schema/重复名称报错并保留文件，命令不报成功，picker 有禁用错误行。
帮助与 picker 注释不再承诺目录搜索。既有 plugin 的吞错问题留作后续扩展域审计，不属于此项已修范围。

`npm run test:ts -- src/core/commands/marketplace/store.test.ts src/core/commands/pluginsAndMarketplace.test.ts src/cli/interactive/picker/pickers.test.ts`
**3 文件 / 41 测试通过**；构建通过，独立双线 APPROVE / CLEAR。实际编译 CLI 三个独立进程
分别 add/list/remove，JSON 有效行 **20/21/21**、全退出 0；4 个并发进程新增不同源，最终保留 4 项、全退出 0。
撤销来源写入后 3 项回归失败，精确恢复源字节。
W4 收口静态门禁：import cycles（1379 文件、零环）、config（39/39）、declarations（18/18、10/10）、
Node floor、strict docs 均通过；脚本测试 **40/40**。call reachability 仍 7 项既有 advisory；
函数 ceiling 仍 7 项，未新增。W5–W8 继续执行，本地未跑全套 TypeScript 或真实提供方。

W5-17 / TOL-06（2026-10-02）：沿用参考的 sequential/partial 决策，仅修正工具承诺和 readiness 说明；
不同文件独立提交、失败不回滚已提交的其它文件。同文件的多替换仍全匹配后一次写入。
实际 `/undo` 仅给出最近快照及明确 restore 命令，因此修正裁决中「逐个 /undo 恢复」的简写，
明确 `/restore` 才执行单条已记录编辑恢复。atomic-rollback 仍 blocked。
`npm run test:ts -- src/core/tools/highValueTools.test.ts src/edit/result/editCapabilityReadiness.test.ts`
**2 文件 / 29 项通过**（架构复核也独立通过）；双线 APPROVE / CLEAR。
撤销工具新增承诺后单项契约测试失败，已精确恢复。未改变执行路径或引入多文件事务。

## 9. 真实 provider 验证：**已执行**（2026-10-01，中转站 `ai.onyxaxis.org`）

**状态**：**已解除一部分 `[INFERENCE]`**。维护者提供了中转站配置
（`https://ai.onyxaxis.org/v1` + `ONY_API_KEY`，该变量已在环境中，49 字符 `sk-o…`）。
凭据只写入隔离的运行时配置（`~/.cheers/config.json`，`chmod 600`），**未进入仓库任何文件**
（`git status` 确认）。

### 9.1 探测结果：暴露哪些协议路径（`curl` 直测）

| 路径 | 结果 | 含义 |
|---|---|---|
| `GET /v1/models` | **200**，17 个模型 | 目录可用 |
| `POST /v1/chat/completions` | **200**，`{"content":"PONG"}`，含 `usage` | ✅ **OpenAI 兼容可用** |
| `POST /v1/chat/completions` + `stream:true` | **200**，标准 SSE `data:` 分块 | ✅ 流式可用 |
| `POST /v1/messages`（`x-api-key` + `anthropic-version`） | **200**，`{"type":"message",...}` | ✅ **Anthropic 原生可用** |
| `/v1beta/models/<m>:streamGenerateContent?alt=sse` | **405 method not allowed** | ❌ **Google 原生不可用** |
| `/v1beta/models/<m>:generateContent` | **405** | ❌ 同上 |

**模型清单（17）**：`claude-opus-5` `claude-fable-5` `claude-sonnet-5` `claude-haiku-4-5`
`gpt-5.4` `gpt-5.6-luna` `gpt-5.3` `gpt-image-2.5-flare-auto` `gpt-oss-120b`
`gemini-3.1-pro` `gemini-3.6-flash` `gemini-3.5-flash`
`qwen3.8-27b`（+ `-high`/`-medium`/`-low`/`-nothink` 变体）。
**注意这些 id 全都不在 `core/models/catalog.ts` 的 builtin 里** ⇒ 都会走
`resolveRequestShape` 的 `DEFAULT_REQUEST_SHAPE` 兜底（`requestShape.ts:96-119`）。

### 9.2 实测结论：逐 `[INFERENCE]` 解除

| 条目 | 结论 | 证据 |
|---|---|---|
| **`D2` Anthropic `budget_tokens` 缺失是否 400** | ❌ **本中转站不 400** —— `{"type":"enabled"}`（不带 `budget_tokens`）返回 **200** | `curl /v1/messages` 两种 body 各一次 |
| **`D3` `thinkingSignature` 往返** | ⚠️ **未测**（需要多轮扩展思考，本轮未跑） | — |
| **`D4` reasoning 模型是否拒 `temperature`** | ❌ **本中转站不拒** —— `gpt-5.3` + `temperature:0.7` 返回 **200** | `curl` 实测 |
| **token 估算误差** | ⚠️ **未测**（需与真实用量对照跑一批样本） | — |
| **`PRV-12`（Google 次要请求流式 URL 配单 JSON 读）** | ❌ **本中转站无法验证** —— Google 原生路径 **405** | `curl` 两次 |
| **10 号 §6 的 openai 侧「已复验（合成块）」结论** | ✅ **可升级为真实**（`stream` 分块形状与我们的读取器一致） | `curl` SSE 实测 |

> **重要限定**：`D2`/`D4` 的结论是**「本中转站不触发这些 400」**，
> **不是**「上游官方端点不触发」。中转站做了协议适配，可能吞掉了上游的严格校验。
> ⇒ 这两条从 `[INFERENCE]` 降为 **「中转站实测通过 / 官方端点仍未知」**，
> **不能**据此宣称「我方不需要修 `budget_tokens`」——官方文档要求该字段。
> **诚实记法**：`D2`/`D4` 的**我方修复必要性不变**（对齐 API 契约），
> 只是「在本测试环境下不表现为错误」。

### 9.3 仓库门禁实测（**已跑**）

**（a）官方 readiness 门禁**——`CHEERS_REAL_PROVIDER_SMOKE=1` +
`CHEERS_REAL_PROVIDER=openai-compatible` + `CHEERS_REAL_API_KEY` + `CHEERS_REAL_BASE_URL` +
`CHEERS_REAL_MODEL=gpt-5.3` + `CHEERS_TEST_ROOT=/tmp/cheers-test/p18-readiness`：

```
[pass] real-provider-readiness-cli - structured terminal result observed
[pass] real-provider-readiness-smoke-gate
```

（隔离 `HOME`/`USERPROFILE`，`CHEERS_REAL_HOME=unset`，**未读真实用户 provider 配置目录**。）

**（b）端到端真实回合**（隔离 `HOME` + 合成配置，`npx tsx` 直跑源码）：

```
$ printf 'Reply with exactly: PONG\n' | cheers --provider openai-compatible
Assistant: PONG
Result / - Outcome: success / - Detail: completed
```

**（c）真实工具调用回合**（临时 git 工作区 + `--print --non-interactive-approval deny`）：

```
$ printf 'Read note.txt and report its exact contents.\n' | cheers --project <tmp> --print
The exact contents of note.txt are: ```text hello ```
Execution summary / - Actions: read (1 run)    exit=0
```

⇒ **模型循环、工具调用、审批门（deny）、终态投影在真实 provider 下全部工作。**
这是本仓第一次用**真实**（非合成）端点跑通多步工具回合。

### 9.4 写入了什么（可复核）

`~/.cheers/config.json`（`chmod 600`）：

```json
{
  "provider": "openai-compatible",
  "providerCredentials": {
    "openai-compatible": {
      "apiKey": "<49 字符，已在 /home/wang 的环境变量 ONY_API_KEY 中>",
      "baseUrl": "https://ai.onyxaxis.org/v1",
      "model": "gpt-5.3"
    }
  }
}
```

**为什么用 `openai-compatible` 而不是新目录 provider 条目**：
`openai-compatible` 是**唯一「用户自备 baseUrl + key + model」的运行时 provider**
（`core/providers/facts.ts:112` `compatibleStyle: true`），且 `endpointShape(undefined)`
回落到 `DEFAULT_ENDPOINT_KIND` = `openai-compatible`（`provider/endpoints/kinds.ts:220-222`），
于是**无需改 catalog**。若要用 `/v1/messages`（Anthropic 原生），
需要给 `anthropic` provider 配 `baseUrl` 指向本中转站——**尚未做**。

### 9.5 关于 OAuth / 订阅登录（维护者问的）

**现状：本仓不会打开授权网站让用户登录上游订阅。** 三条路径分开：

| 路径 | 现状 | 与中转站的关系 |
|---|---|---|
| **API key**（本中转站） | ✅ 可用，已配 | 就是现在这条 |
| **Device Code（RFC 8628）** | ✅ **已实现**（`core/auth/oauth/deviceCode.ts`，Phase 13 T2） | 需**上游 provider 自己**的 device-code 端点与 client id；中转站不提供 ⇒ 用不上 |
| **订阅 OAuth**（GitHub Copilot / Anthropic） | ✅ **已实现**（`core/auth/oauth/subscription.ts`） | 同理：OAuth 授权在**上游**完成，中转站不参与 ⇒ **中转站不该走这条路** |

⇒ **用 OAuth 打开网站登录对「中转站」没有意义**——中转站的价值恰恰是**免 OAuth**。
OAuth 只在「直连上游订阅（Copilot / Anthropic 订阅）」时有意义，
而那需要**你已有的订阅凭据**，与本中转站是**两条独立路线**。

**若你要直连订阅**：说一声，我用 `/connect login` 起 device-code 流程，
它会打印一个 URL 与 user code，你在浏览器完成授权即可——**无需把任何密钥给我**。

### 9.6 仍未执行（等下一轮）

| 项 | 阻塞 |
|---|---|
| `W7-33` provider 真实流边界（TLS/HTTP2 层） | **现有中转站已可跑 OpenAI 兼容侧**；Anthropic 原生需给 `anthropic` provider 另配 baseUrl；Google 侧 405，需另一家中转站 |
| `PRV-12` | **中转站不支持 Google 原生**（405）⇒ 需要另一家支持 Gemini 原生路径的中转站 |
| `D3` `thinkingSignature` 往返 | 需要多轮扩展思考会话 |
| token 估算误差对照 | 需要一批样本与真实 `usage` 对照 |
| `W7-27` 四端点逐字段形状表 | Anthropic 原生可用（可测）；Google 侧不可用 |

---

## 10. 复核轮（2026-10-01）：3 个探索子代理 + 主代理逐条亲验，**裁决修正 + W8 新增**

> **性质**：这不是新规划，而是**对 §1–§9 的证伪与补漏**。3 个只读子代理
> （`google-antigravity/gemini-3.8-flash:high`，并发 3，**3/3 返回**）分域探索
> 「文档裁决是否成立」与「文档没有涉及、但代码里确实是 demo / 有缺陷的部分」。
> 主代理**亲验每一条载重断言**（读码 / `grep` / 实机 / 数值模拟），
> **驳回 8 条**、**修正 4 条裁决**、**新增 20 条缺陷**（登记为 `PRV-13..15`、`SES-09/10`、
> `TOL-10..13`、`CMD-09..13`、`TUI-10/11`、`OBS-13..15`、`SUB-01`，见 11 号册 §20）。

### 10.1 裁决**修正**（4 条）

| # | 原裁决 | 修正 | 证据（主代理亲验） |
|---|---|---|---|
| **R10-1** | **`W7-30`**：「⚠️ 工具继承已经接上了… 若无缺口，本条降级为『已核实健全』」 | **判决从「可能已健全」翻转为「有真缺陷」**。工具**继承**确健全（`core/subagents/boundary.ts:44-51` 的 `subagentTools` + `NEVER_GIVEN`）；但**权限模式不继承**——`subagentLoader.ts:13,22,39` 声明的 `permissionMode:"plan"` 在 `taskTool.ts:82` **只用于拼展示串**，实际门（`runner.ts:117-140` ← `turn/session.ts:191` 的 `gateOptionsFor`）用的是**会话**的 `agentMode`。⇒ build 会话里派 `code-reviewer`（工具含 `bash`）**以 build 门执行**，声明与显示却写「PLAN (Read-Only)」 | §20.1 `SUB-01`；登记册新增 `SUB-01` |
| **R10-2** | **`W5-19`（`PRV-12`）**：由端点所有者区分「单次 / 流式」 | **范围扩大为「端点整体」**。`PRV-12` 只覆盖**次要请求**（`/btw`、`summarize`）；新发现 `PRV-13`：**主流式路径**也错——`googleGenAI.ts:28` 的 `path` 缺 `?alt=sse`（对照同仓 `googleVertex.ts:78` **有**），而 `dataOf`/`isEventStream` 只认 SSE ⇒ Google AI Studio 主流式回合**静默产出空答案**。**两条同根因（端点未区分单次/流式、流式 URL 缺 SSE 参数），一次修**；且 `googleGenAI.test.ts:65-67` **把错 URL 钉进了测试**，须一并改 | §20.1 `PRV-13`；`gemini-cli/.../server.ts:478-482` `params:{alt:'sse'}` |
| **R10-3** | **`W3-11`（`OBS-04` MCP）**：把网关挂到会话 runtime、以 workspaceRoot 为键 | **前提缺失**：即便照此修好连接复用，**仍连不上任何真实 MCP server**——`core/mcp/client.ts:44-55` 明说自己写的是 `{"action":"list-tools"}` 自定义信封而非 JSON-RPC 2.0，**「cannot talk to a third-party server」**（`OBS-15`）。⇒ **协议是前置裁决**，否则优化的是一个只能连夹具的通道。**建议**：`W3-11` 拆成「协议（须裁决）」+「连接复用（可实施）」两步 | §20.1 `OBS-15`；`pi/packages/mcp/src/protocol/jsonrpc.ts:4` |
| **R10-4** | **`W4-14`（`SES-02` 缓解）**：续期 + release owner 校验 | **补第三条**：`SES-09`——锁**获取超时 1.2s ≪ 陈旧阈值 60s**（`sessionFileStore.ts:9` vs `lockStaleness.ts:29`），崩溃留下的**零字节锁**在 60s 内既不被判陈旧、获取又已超时 ⇒ 该会话写入**硬失败 60s**。续期与 owner 校验**都治不了已死持有者的空锁**，须单独修（空锁用远短宽限）| §20.1 `SES-09` |

### 10.2 W8 — 复核轮新增的交付项（11 项）

> **入表理由分三类**：**①裁决前提被推翻**（`R10-1/2/3` 对应的执行位）、
> **②面数/严重度被低估**（`SES-09`、`PRV-15`、`TOL-12`）、
> **③文档完全没涉及的 demo 面**（`CMD-09/10/11/12/13`、`TUI-10/11`、`OBS-13/14/15`）。
> 与 W1–W7 不重复计：`TOL-12` 与 `W1-4` 同属「声明与实现不符」但**不同文件**；
> `SES-09` 与 `W4-14` **同批施工、独立提交**。

| # | 条目 | 形态 | 参考 / 标记 | 撤销验证 |
|---|---|---|---|---|
| **34** | `SUB-01`（`R10-1`） | 已完成：父/定义/请求plan取交集，复用工具门工厂；task显示建门owner回传的生效值；未启动与未回报分开 | `gemini-cli/.../policy-engine.ts:610` `check(…, subagent?, …)` | 在 build 会话派 `code-reviewer` ⇒ 其 `bash` 调用**被 plan 门拦**；展示与实际一致 |
| **35** | `PRV-13`（`R10-2`） | `googleGenAI` 的 `path` 加 `?alt=sse`（流式），并接出 `googlePath(model,false)`（非流式）；改 `googleGenAI.test.ts:65-67` | `googleVertex.ts:78` 同仓对照；`gemini-cli` 的 `alt:'sse'` | 「URL 与响应格式成对」的合成测试：流式 URL 以 `?alt=sse` 结尾且按 SSE 解码；非流式走单 JSON |
| **36** | `PRV-14` | 两处 `data:` 多行连接改 `join("\n")`（`anthropicMessages.ts:622-631`、`googleWire.ts:437-444`） | `pi/.../anthropic-messages.ts:409`；`gemini-cli/.../server.ts:510`；**同仓正确处** `turn/completion.ts:563` | 合成多行 `data:` 事件 ⇒ 解码后含 `\n` 且 JSON 可解析 |
| **37** | `PRV-15` | 把服务器 `requestedDelayMs` 带到 failed step（新字段），`core/agent/loop.ts:178` 的 `retryDelayMs(policy, attempt, undefined)` 改传它 | `pi/.../provider-retry.ts:51-70`（层内消费服务器延迟） | `429` + `Retry-After: 5` ⇒ 首次重试延迟 ≥5s |
| **38** | `SES-09`（`R10-4`） | 空/不可读锁用**远短**宽限（微秒窗口，建议 ≤5s）；或把获取等待上界提到陈旧阈值之上 | `自研`（`opencode` 的 heartbeat 治的是另一面） | 造零字节锁 ⇒ **不再** 1.2s 超时、也**不**等 60s |
| **39** | `SES-10` | **已完成**：既有`lifecycle.cancelled`在shell结算后发给eventObservers；非交互信号退出等待cancelAndWait。Node最低版本兼容修复后d0f7dfe2两项远端检查成功 | 对照会话abort等待idle与公开事件广播 | 编译CLI三种信号均收到唯一取消终态，部分正文与来源持久化、连接关闭；turn内部契约无需新增同义事件 |
| **40** | `TOL-10` | 已完成：`task`终态按失败事实判定，保留部分答复；runner补足工具阶段取消，适配器保留error | 对照子代理扩展的失败结算与独立取消事实 | 步数耗尽但有叙述文本、实际工具阶段取消均返回失败；父模型收到原因 |
| **41** | `TOL-12` | **已完成**：严格布尔MCP只读标注只解除plan禁止，仍经过权限；/tools与执行共用toolPolicy。d0f7dfe2两项远端检查成功 | 对照标注准入后仍ask_user的策略 | 真实stdio夹具仅批准时调用；全部内置工具展示与参数门一致；主回合/子代理接线回归 |
| **42** | `TOL-13` | **已完成**（37685986两项远端检查成功）：模型与/tools共用catalog，按当前技能/MCP快照及配置过滤；三种命令入口接通 | 对照启用工具和全部定义的区别，保留当前按调用发现的生命周期 | 编译CLI列表与实际HTTP模型schema一致，含MCP/skill；动态过滤、空白名单与连接关闭回归 |
| **43** | `CMD-09` | **已完成**（89c1dd18两项远端检查成功）：主命令改为 `/web-research`，旧名兼容；逐页资料摘录，移除虚假共识与模型机制宣称 | `自研`（`pi` 无对等命令） | 报告正文**不含**「multi-agent tree search」等未做过的机制词 |
| **44** | `CMD-10` | **已完成**（c8146b40两项远端检查成功）：`/review` 对齐 `/commit`，读取暂存/未暂存diff并构造prompt，旧别名兼容 | `自研`（对照同仓 `/commit`） | `/review` 触发一次模型回合；不再打印固定清单 |

### 10.3 W8 的**小项**（不单列波，随邻近波施工）

| 条目 | 形态 | 随哪一波 |
|---|---|---|
| `CMD-11`（`W8`） | 未闭合引号**回落为字面文本**（或可恢复提示），不再整条拒绝 | 随 `W5`（`CMD-05` 同属参数解析层） |
| `CMD-12` | `/marketplace` 持久化（对齐 `plugin` 的 `CHEERS_PLUGINS_FILE`）；删掉指向 `/plugin search` 的交叉承诺 | 随 `W4`（持久化域） |
| `CMD-13` | `/reload` 把主题加载失败写进**命令输出** | 随 `W5`（文档与自研修复） |
| `TUI-10` | 编辑器箭头建**可视行映射**（或至少：软换行的末行之外不上翻历史） | 随 `W5`（TUI） |
| `TUI-11` | 指针支持点击 picker/补全（**产品决定范围**，最小可只做选中行） | 随 `W5`，标注「范围待定」 |
| `OBS-13` | 补全把 `aliases` 纳入候选，且参数补全解析别名 | 随 `W2`（命令面） |
| `OBS-14` | `newlineKey` 或在空提示显示、或删字段与传参链 | 随 `W5` |
| `TOL-11` | **已完成**（8a998664两项远端检查成功）：复用现有异步执行器，流式解析、signal/timeout和`--max-count`，只有未安装时回退 | 随 `W7`（审计域），标 `自研` |

### 10.4 **须维护者裁决**（在 §5 的 R1/R2 之外，**新增 R3**）

| # | 问题 | 选项 | 本文倾向 |
|---|---|---|---|
| **R3** | **MCP 协议互操作**（`OBS-15`）：本构建的 MCP 客户端用自定义信封，**连不上任何真实 MCP server** | (a) **实现 JSON-RPC 2.0**（帧协议 / `initialize` 握手 / `tools/list` / `tools/call` / 通知）——一次性较大，但一次接上整个 MCP 生态，`W3-11` 的连接复用才有意义；(b) 维持现状，但 `/mcp doctor` **必须明确声明**「仅支持自带夹具协议」 | **(a)** —— 对一个企业级 agent 产品，MCP 不能连真实 server 是**能力缺口**而非记录项；但这是**产品级投入**，不在本阶段自作主张 |

#### R3 实施裁决（2026-10-02）

维护者本轮明确授权修正裁决并顺序实现，故选 (a)，作为 W3-11 的前置一起交付。
使用官方 `@modelcontextprotocol/sdk@1.31.0` 实现标准 stdio JSON-RPC，不另写协议栈。
包声明 Node >=18，兼容仓库 Node >=20.3；不改变脚本、构建或真实提供方开关。

定向对照后的决策（实现前记录）：

- 握手完成及 initialized 通知发送后才能 connected；失败关闭已启动传输：采纳。
- 分页列工具，仅询问声明 tools 能力的服务器：采纳；加页数/工具数上限，超限明确失败。
- 会话持有连接，复用进行中的连接；配置每次重读、工作目录变化关闭旧连接：采纳。
- 工具调用失败不盲目重放，未知写入结果必须留作失败：采纳。
- stdio 使用工作目录、stderr 管道并持续排空：采纳；不记录原始 stderr。
- 环境变量全量继承：不采纳，使用 SDK 的最小继承集，避免隐式转交其他服务凭据。
- 关闭必须观察进程退出：采纳。SDK 在 SIGKILL 后不等 close，适配层补有界观察；
  此处验证直接子进程，不将其宣称为完整进程树回收（后者仍属 W5-18）。
- 文本结果正常投影；无法表达的内容块明确标记失败，保留已返回文本，避免伪造执行成功。

参考证据为本轮已读的本地标准客户端握手/分页/生命周期实现及官方 SDK stdio 传输；
不复制参考代码。撤销验证覆盖握手、跨 prompt 单进程、配置/目录切换、失败不重放与退出清理。

### 10.5 本轮**驳回**的 8 条子代理断言

见 11 号册 §20.3（附实测证据）。一句话：**否定式断言（「从未被调用」「丢参数」）必须自己再 grep 一遍**——
本轮 8 条里有 4 条属此类（含 1 条**不存在的函数名**、1 条**读错调用链**、1 条**没验证复原逻辑**）。

### 10.6 与 `W7` 的关系（防重复计）

- `W7-30` **不降级**，按 `R10-1` 改为执行项 **34**（`SUB-01`）；`W7-30` 的「工具继承」半部分**确认健全**并留档。
- `W7-27`（流边界矩阵）**吸收** `PRV-14`（多行 `data:`）与 `PRV-15`（跨层延迟）作为具体用例，
  但两者**各自独立提交**，不混入 `W7-27` 的大表。
- `SES-09` 与 `W4-14` **同批、独立提交**；`SES-10` 与 `W4-16`（`SES-06` 删除）**不同域**，勿混。

---

## 附：Phase 18 交付项**总数**（复核轮后）

```
W1–W5 执行表             24 项（§2，含 SES-02 保持 OPEN）
W6 收口                   2 项（§2）
W7 跨轮审计债务           9 项（§2；W7-30 已改判为缺陷 ⇒ 实际 9 项仍计，形态变）
W8 复核轮新增            11 项（§10.2）+ 8 小项（§10.3）
明确不做                  4 项（§6）
待裁决                    3 项（§5 的 R1/R2 + §10.4 的 R3）
```

**登记册新增条目**：`PRV-13/14/15`、`SES-09/10`、`TOL-10/11/12/13`、`CMD-09/10/11/12/13`、
`TUI-10/11`、`OBS-13/14/15`、`SUB-01`——**共 20 条**（11 号册 §20.1）。

CMD-11（2026-10-02）：对照参考提示模板解析器的容错策略，但不采纳丢弃未闭合引号的行为；
复用现有tokenizer，未闭合最后参数按原文保留且不再拆分，先前参数仍正常解析。
4文件94项定向测试、构建和双线APPROVE/CLEAR；撤销8项失败后逐字恢复。常规/全屏PTY的/btw撇号验收通过。

CMD-13（2026-10-02）：对照参考reload在界面显示诊断与失败的决策，保留现有主题加载owner；
失败通过命令结果输出而不只写日志。22项测试、构建、独立APPROVE/CLEAR；反向1项失败，源码恢复。
常规/全屏PTY均验证运行中改配置后的主题失败输出；auto未计入本项。

TUI-10（2026-10-02）：采纳参考编辑器的可视行映射/垂直目标列策略，但复用本仓wrapToWidth与字素测量，
实现放在editor/layout.ts，原Editor移除两个方法，未新增类方法。112项定向测试、构建、APPROVE/CLEAR；
反向5项失败后逐字恢复，常规/全屏PTY的软换行导航验收通过。

TUI-11（2026-10-02）：采纳子组件优先消费鼠标和按下聚焦的参考决策，选择最小交付范围；
renderer记录实际行id，surface给出几何，复用OptionModel/SuggestionList，不建立第二个选择系统。
7文件123项定向测试、构建、APPROVE/CLEAR；撤销7项失败。拖入后释放和无效组合键两条复核发现已修复。
全屏PTY证明点击不应用，Enter才完成补全或配置保存。regular鼠标仍归终端，编辑器点击定位未纳入。

OBS-14（2026-10-02）：选择删除死字段链，保留空闲提示零行；复用W5-20已经对照参考的运行时/hotkey入口，
不另造脱离重绑定配置的提示系统。辅助函数专属3项测试随删除归类为obsolete scenario；
6文件121项现有渲染/键位/指南测试和构建通过，独立复核APPROVE/CLEAR。

W5波末静态检查（2026-10-02）：cycles 1386文件零环；config 39/39；hooks18/18、factories10/10；
Node>=20.3；docs strict无失效绑定路径，120个已有advisory；call reachability 7个已有advisory；
函数ceiling仍7项（editor从29降到27），脚本测试40/40。未运行本地全套TypeScript或真实提供方。

W6-23（2026-10-02）：侧栏重复编号改为OBS-11/OBS-12，更新当前裁决、前置研究和Phase17侧栏引用；
历史编号冲突说明保留并明确已更正。旧CLI汇总中的歧义编号未强行归属，不作为侧栏独立验收。

W6-24（2026-10-02）：实测browser非测试TS模块167，核对8adc76f9迁入smoke/config、report、runner三模块；
历史四类164分区与行数不改造成新审计结论，新增迁入3模块单列，逐行审计仍未完成。
CTX-08清除“第6例”误计对照项，CDE-01已由W5-22修正；PRV-04依据W2-10实际修复保留FIXED，
不执行旧PARTIAL降级。同步原输入OPEN快照的时间限定。纯文档修正，未运行构建或测试。


### W7-25 自动主题实施边界（2026-10-02）

现有主题加载、共享调色板、文件观察与 stdin 分帧已经可复用；问题是启动与 reload 把 auto 跳过。
定向对照参考的主题控制器和终端颜色处理后，采用以下决策：

- 分开保存选择（auto/具名）与实际调色板。具名主题不随报告切换；auto 使用内置 dark/light，避免磁盘同名主题破坏外观语义。自定义文件仍走原有具名加载与热重载。
- 终端驱动启用 DEC 2031，查询当前外观和 OSC 11 背景。背景亮度足以选择明暗，因此不请求未消费的 OSC 10 前景或整套 ANSI 调色板。显式外观报告优先于背景推断。
- 完整报告经现有 StdinBuffer 分帧后消费，粘贴正文不解释为报告。不增加第二个 stdin 监听器。首帧不等待探测：无报告时暗色回退，迟到的有效报告触发共享调色板修订和重绘。
- stop、同步恢复和输入 drain 均关闭通知；终端重新启动时重新查询。命令显示选择和当前解析结果，auto 切换为同色具名模式也更新选择。
- 回归必须覆盖具名选择不被报告覆盖、报告分片/粘贴隔离、显式外观优先、迟到报告和退出恢复。以撤销关键决定后测试失败作为对照证据。

实现与验证：9套定向测试共90项通过，最终输入修正复跑62项及25项受影响用例通过；构建通过。
首次9项失败属于测试设置漂移（不支持的新断言、未开启颜色的颜色对比），已修正；修补报告重新同步时曾引入连帧丢弃，被既有测试捕获并修正。
双线复核最终APPROVE/CLEAR；复核指出的40ms尾片键盘泄漏、同块dispose后继续分发、畸形CSI变方向键均已补回归。
已识别的报告前缀不按键超时释放；超长载荷保留无效帧标记直到终止，新escape可恢复下一帧，不增加持续定时器或无界缓冲。
撤销具名选择保护和报告超时隔离后5项失败，源码按字节恢复。隔离且无凭据的编译CLI：常规/全屏PTY均验证启动auto、150ms分片背景报告、显式报告优先、具名与auto切换、reload及通知恢复，退出0；非TTY验证启动参数覆盖auto配置且不查询终端。
静态阻断门禁全部通过：1390文件零环、39/39配置消费者、18/18 hooks、10/10工具工厂、Node >=20.3与文档引用；文档120项既有advisory未变化。
令牌/主题扩充另行按实际渲染用途裁决，不为数值对齐增加无消费的字段。


### W7-25 令牌与预设裁决修正（2026-10-02）

现有语法映射借用commandFlag/commandString等命令颜色，Markdown引用、链接地址和代码边框借用dim/border；主题作者无法分别调色。
对照参考的syntax作用域映射与Markdown独立令牌，采用10个syntax令牌和6个Markdown令牌，32→48；每个新增令牌必须接入现有消费者并以不同颜色的回归测试证明。
原裁决的「对齐56/67规模」修正为实际用途覆盖，不加入当前语法引擎没有稳定消费的运算符/标点或不存在的消息面。
旧主题省略新字段时从原对应颜色继承，明确新字段优先。新增dark-contrast/light-contrast两套具名预设，分别面向黑/白终端背景；保留auto的基础明暗对，不改变自动选择范围。
预设数量不作为缺陷判据：2→4服务高对比度选择，不复制大主题目录。此次不改变Markdown结构、文本宽度或语法引擎。


W7-25令牌验证：首轮6文件104项通过，兼容修正后3文件67项通过（累计6个唯一套件105项）；构建通过。双线复核APPROVE/CLEAR，独立8套118项及最终55项复跑通过。
复核发现新增params/variable映射会把旧主题参数/字符串内变量染成filename颜色，已去掉额外作用域扩展，并用Python参数与Bash嵌套变量回归守住旧语义。
四套预设均48字段且通过schema；高对比度两套在声明的黑/白背景上通过前景4.5:1门槛，消息正文7:1，选中区/状态带关键文字4.5:1。命名预设不替用户设置终端背景。
撤销语法/Markdown独立令牌与旧字段继承后4项失败，源码逐字节恢复。隔离无凭据的常规/全屏PTY均验证两套预设切换及自定义mdListBullet的真实ANSI输出，退出0。
静态门禁通过：1391文件零环；配置/声明/Node门禁正常；docs严格门禁通过并保留120项既有advisory；可达性7项、函数上限7项既有advisory，无新增。本项未运行本地全套TypeScript或真实provider。


### W7-30 权限边界实施设计（2026-10-02）

SUB-01仍成立：task丢失permissionMode，子运行复用父hooks。现有工具集合交/差集与task剥除正常，递归仍限制为一层。
对照参考的共享策略引擎把subagent身份纳入同一次决策，而非另开无门执行器，保留同一ToolGateOptions与createToolHooks，按每个子运行创建门。
有效模式采用权限交集：父会话plan、定义plan、任务请求plan任一成立即plan；build请求不能覆盖只读定义或父plan。其余兼容permissionMode值不授予额外审批权限，permissionScope与denyRules原样继承。
模式由建门owner回传，task显示实际结果，未启动/未回报分开；不把声明串冒充实际状态。
同域审计额外发现：runner未把input.prompt送到模型；模型步骤仍看父工具schema；worktree路径只进入说明、工具上下文仍是父工作区。这些先登记，按独立修复与回归处理，勿把SUB-01的通过扩大为全域健全。


W7-30权限验证：初轮6套76项通过；异常状态修正后3套32项及子运行套件11项通过（6套唯一77项），构建通过。最初1项测试失败为测试设置使用不存在的scope/decision枚举，按真实ask/deny契约纠正，未修改权限实现来迁就测试。
双线最终APPROVE/CLEAR。复核捕获的「工具已执行、下一模型步抛错却显示未启动」已修复并有真实建门路径回归。
撤销模式交集后5项失败，源码字节恢复。隔离无凭据的编译运行时接真实工具注册表，build派code-reviewer尝试touch：返回plan拒绝，标记文件不存在，task显示PLAN；模型步骤由脚本驱动，本次未声称真实provider或PTY模型委派验收。
静态门禁通过：1393文件零环、39/39配置、18/18 hooks、10/10工厂、Node最低版本与严格文档门禁，120项既有文档advisory。递归task运行时不可执行；0<maxTurns<1取1，非法宿主步数也收敛为1。
SUB-01完成；下一步先闭合同域已登记的task正文/工具schema/工作区和TOL-10结果真实性，随后进入W7-32。


### 子代理任务传递与失败结果（W7-30相邻修复、W8-40）

对照参考子任务入口把任务正文作为独立输入、失败判据同时检查退出/错误/中止并保留原因，修复两项独立契约：
1. runner将input.prompt作为独立user消息送入原循环；定义、上下文和记忆仍在前面的指令消息，不从摘要猜任务。
2. TOL-10按失败事实判结果，失败原因与已产生文本一起可见；成功但无答复也不能冒充未派发或成功。turn工具适配层须保留error字段，避免success:false却投影为文本Success。
两项分别提交；不在此提交吸收尚未修复的模型工具schema和worktree执行路径。

正文传递验证：runner与子运行2套22项通过，构建通过；双线独立APPROVE/CLEAR。撤销正文消息后专属断言失败（1失败、10通过），源码字节恢复。首次反向命令的过滤参数被npm拒绝，未进入测试，修正为整套执行后得到上述证据。
隔离无凭据的编译运行时通过真实turn/task注册表，脚本模型确认收到多行正文；未调用真实provider。正文在runner边界原样传递，模型适配器既有的首尾空白规范化未改变。

TOL-10验证：初轮6套78项通过；独立评审复现工具执行中signal取消但末条模型消息正常、runner仍称成功。对照参考实现独立跟踪取消事实，runner补足启动前与收尾检查，真实工具阶段取消回归加入后6套80项通过。最终双线APPROVE/CLEAR，构建及静态阻断门禁通过（1394文件零环，39/39配置，18/18 hooks，10/10工厂，Node floor，120项既有文档advisory）。撤销三处生产修复后16项失败、59通过，源码字节恢复。
隔离编译运行时经真实工具注册表验证预算耗尽原因、部分文本和失败事件到达父模型。独立result-contract脚本退出1：两个测试目标已不存在，合成print/replay仍要求旧Action result等输出；readiness子门通过。恢复至本修复前生产源码时复现同组失败，归类为既有harness/setup drift与stale expectation，未削弱断言或把该门算通过；后续session/shell审计需处理其退役路径。无真实provider证据。

### 子代理模型工具清单（W7-30相邻修复）

目标链路中runner已限制可执行工具，但共享step持有父工具schema。参考子任务入口以工具白名单启动独立运行，使模型声明与执行集一致；本实现同意这一边界，不另起provider解析或进程。
runner把已裁决的allowedTools传给step，step只对绑定的父schema做交集；空列表表示无工具，未知名称不能扩权，未指定时保留父调用行为。请求头能力投影、请求正文和末步提示使用同一过滤清单；一次子调用不得污染后续父调用。工作区和系统指令的绑定另行修复。

验证：5个唯一套件99项；首轮空数组参数化用例被测试框架展开为undefined，归类harness/setup drift，改为对象行后受影响2套67项通过，其余3套已通过。构建、独立双线APPROVE/CLEAR；撤销关键两处生产修改后4项失败、63通过，源码字节恢复。
隔离编译运行时与真实工具注册表向本地HTTP服务发4次请求：父委派、子read、子末步、父继续。验证子清单仅5个允许工具、真实文件内容到达模型、末步撤下工具、父清单恢复；没有真实provider调用。

### 子代理执行上下文（W7-30相邻修复）

参考子任务入口把工作目录交给执行进程，而非只写入说明；本实现同意，在现有子工具门设置input.workspace，审批目标与hooks沿同一根路径。生效权限模式也传给共享step，以已有prompt工厂重建模式及工具清单；不再向plan子代理发送父BUILD模式声明。
会话选定的模型、采样配置与已获准的项目指令继续继承父会话，避免重读worktree中的未信任配置或重新选择provider。子运行的具体目录由runner指令声明；此处不改worktree分配器。后续分配器修复将删除非Git空目录/共享回落，并明确清理失败。

上下文验证：5个唯一套件92项通过，构建、双线独立APPROVE/CLEAR。入口测试最初用global fetch mock未拦截实际自有传输，0请求，归类harness/setup drift；改为本地HTTP服务后7项通过。撤销工作区/模式绑定后2项失败、6通过，源码字节恢复。
隔离编译运行时调用真实bash，验证pwd、读取及新建文件均在子目录，父目录未产生文件，hooks携带子根；生产入口本地HTTP验证PLAN子请求与BUILD父请求。此验收未经过worktree分配器，也不是实际provider调用。

### worktree分配与释放（W7-30相邻修复）

已定位：默认manager在模块加载时绑定process.cwd而非task工作区；非Git分配空临时目录，Git失败返回isIsolated:false的父目录，task仍宣称Git Worktree；拼接`.git`目录不支持linked worktree；removeWorktree吞掉失败后上层仍返回removed。WorktreeCreate在运行try/finally之前也可能绕过释放与Stop。
定向参考比较：工作树服务拒绝非Git项目，按当前项目工作区传递cwd，以argv执行Git，创建非零退出是明确失败，移除失败会复核仍存在的工作树。计划同意这些决策，保留本项目“有改动则保留、绝不自动合并”的既有规则；不复制外部服务或全局存储结构。后续修复需覆盖分配失败不启动子任务、工作区来源、linked worktree、清理失败不冒充removed及已产生工作的可追溯路径。

实施：默认manager按task工作区创建，Git命令经既有ExecutionService与固定argv集合执行，单命令60秒上限；审批元数据仅归属已获准的task，不授予子工具写权限。非Git、bare、unborn、冲突和创建失败均阻止子运行，不回落空目录或共享目录。Git common-dir支持linked worktree，选中子目录映射至新checkout，创建前拒绝重定向容器并在创建后复核路径、HEAD和分支。
释放保留检查时可见的tracked/untracked/ignored改动、HEAD变化（含向祖先reset）与切分支；不自动合并、不force删除。目录、注册记录、分支均移除才报告removed；部分清理和未知ID返回unverified，重复/并发释放共享已记录结果。创建hook纳入保护区，release、remove hook和stop分别尝试；原因与子任务部分正文一起返回。

验证：前轮6套71项通过；容器重定向/并发释放补测及其余受影响工具验证后5套74项通过，累计8个唯一套件105项。构建通过。反向撤销容器拒绝、ignored保护和清理失败投影后5项失败、18通过；源码逐字节恢复。独立代码通道APPROVE，架构通道WATCH，综合COMMENT：无剩余架构阻塞，但清理依赖写入方已停止。
架构通道另行真实Git验证：状态检查之后写入ignored文件，非force remove仍会删除它。因此本契约是观察结果，不是原子并发保护；await子runner不足以证明脱离控制的后台进程已停止。API注释与文档明确此限制，不以重复status冒充解决竞态；未声称任意并发写入可保留。
隔离无凭据的编译运行时经真实turn/task注册表、默认manager、Git及read/write/bash验证子目录读写、父文件/HEAD不变、有改动保留、干净目录删除、分配失败不启动子任务、locked worktree清理unverified；退出0。未调用真实provider。上一提交fec423f0的CI 37010035753与Architecture Watch 37010035734均已通过，本提交远端结果另行跟踪。
静态门禁通过：1396文件零环、39/39配置消费者、18/18 hooks、10/10工厂、Node最低版本与严格文档门禁；文档120项、可达性7项与函数上限7项既有advisory无新增。旧result-contract脚本既有失败仍待session/shell审计处理，本项未重新宣称通过。


### W7-32 read内容可见性与去重退役

实际工具链复现4项失败：外部改写并保留mtime；读取之后、记录mtime之前发生改写；父子共享session与目录而子模型没有父模型正文；新会话上下文复用同一session标识。原缓存把文件元数据与模型上下文可见性混为一项事实，返回的“内容仍然有效”没有足够依据。
定向参考read工具每次调用读取当前字节，再限制行数/字节数，没有以mtime替换内容的分支。采用同一职责边界：删除readCache及registry/CLI的查重、记录、失效接线，继续使用原ExecutionService、路径门、分页/截断/产物机制。不另加内容hash、会话代际或跨子代理缓存协议；重复read会再次消耗上下文，这是明确取舍。
原Phase12“参考也按mtime去重”的依据未被当前参考实现支持；本次更正该依据，而非把父子上下文缺失缩成亚毫秒风险。原去重返回提示的测试改为精确正文；2项只验证已删除缓存容量的测试归类obsolete scenario，read/edit/write/分页/截断测试保留。startup六模块的持久化审计仍单独继续。

验证：新4项在旧实现上全部失败；修复后8套128项通过，构建通过。隔离无凭据的编译运行时经真实turn/task注册表验证父read→共享目录子read→同mtime外部改写→父read，两个模型均收到对应正文；未调用真实provider。
独立代码/架构复核最终APPROVE/CLEAR。将registry与原缓存恢复至修复前后，两套测试5失败、18通过；源码字节与删除状态恢复。静态阻断门禁通过：1395文件零环，配置39/39、hooks18/18、工厂10/10、Node floor与docs strict（120项既有advisory）。前一worktree提交e7303863的CI 37013332299与Architecture Watch 37013332066均通过。

### W7-32 startup六模块行为审计

这是一份显式本地、可丢弃的摘要缓存，生产默认不创建store、不启动时加载、不注入模型。源审和编译探针证实：错误项目/安全字段/日期被当作fresh返回；未知版本仍返回正文；disabled带路径仍读文件；损坏文件被health称作安全缺失；runner以占位说明冒充三类真实来源。
参考的本地设置加载器把解析错误与空配置分开，未获信任的项目不读配置；本实现采用“拒绝入口与保留错误”决策。参考没有等价warm-cache协议，以下结构、freshness与显式来源规则标为自研，不声称照搬缓存机制。

| 模块 | 判据及结果 |
|---|---|
| startupWarmContextCache | 先验证unknown结构、枚举、日期及精确安全字面量，再按已知字段投影；嵌套额外数据不会透传。项目根统一resolve；签名针对安全摘要，不是认证证据 |
| startupWarmContextBuilder | 编辑能力来源仍为现有清单；记忆来源走原预览/有效记录过滤；省略的compact/validation/phase为missing。既有脱敏与无provider/持久写入测试通过 |
| startupWarmContextHealth | disabled在I/O前返回；匹配显式项目root/hash；只读打开的常规文件，上限256KiB；仅ENOENT是missing，其余无效/不可读不返回摘要。写入经独占临时文件和同目录rename；替换前失败保留旧缓存且只清理自有临时文件 |
| startupWarmCommandContract | 原status/rebuild语法保持，超额/未知参数仍由契约拒绝；合法命令经现有runner与路由验收 |
| startupWarmCommandRunner | 去掉固定compact/validation/phase占位输入；status取单次读取；rebuild写入后以当前来源签名回读验证，写成功而回读失败仍blocked；不同项目不读store |
| startupWarmContextSurface | 缺失、invalid、unknown与blocked分别展示；invalid不显示write阶段旧摘要，给出重建动作；unknown不宣称当前来源已验证 |

freshness表：没有当前来源签名为unknown；签名不等或TTL过期为stale；签名相等且其他检查正常才为fresh；未来时间/非法日期/TTL为invalid。未过期TTL只证明年龄，不能证明来源相同。侧栏同样绑定选定项目，并用同次读取投影健康状态和正文。
项目hash防止误配，不认证缓存作者。rename避免半写文件，但不承诺fsync崩溃持久性；显式路径由调用者配置，不把本地缓存当授权或事实证明。

验证：实现前新增两套用例10失败、7通过。初轮14套97项通过；附加边界与侧栏项目保护后相关4套70项通过，累计14个唯一套件103项；构建通过。一次超大write测试误用相同warnings，被既有去重收敛，归类harness/setup drift；改成不同内容后通过，未削弱产品限额。
独立代码/架构最终APPROVE/CLEAR；复核补入侧栏项目拒绝及无真实来源的missing状态。反向恢复5个生产模块后17失败、53通过，源文件逐字节恢复。
隔离编译运行时经实际slashRouter与文件store验证rebuild回读、无来源unknown、损坏blocked、修复、侧栏项目绑定和默认禁用；未使用真实provider。常规/全屏PTY验证/warmup status为disabled、rebuild为blocked，退出0。首轮PTY误以为regular长输出不打开阅读器，第二条命令进入阅读器过滤；改为关闭阅读器后两模式均通过，这是验收交互设置错误。
前一read提交33118b2b的CI 37014985304与Architecture Watch 37014985560均通过。W7-32完成，继续W7-28 receipt保证强度审计。
静态门禁全部通过：1395文件零环，配置39/39、hooks18/18、工厂10/10、Node floor和docs strict；文档120项、可达性7项与函数上限7项advisory无新增。旧result-contract脚本仍待后续session/shell审计处理。

### W7-28 receipt保证审计实施裁决

审计推翻原“expiresAt/ownerId陈旧判定正确”的表述：超时只能观察，不能证明旧owner停止。采用独占创建、无自动抢占、唯一token、文件身份复核及幂等释放；只保证稳定本地目录中合作写入方的互斥，不声称抵抗外部替换的fencing。遗留锁须停止所有写入方后人工处理。

读取在权限门后执行，缺失/拒绝/不可读/损坏保持区分；状态不创建目录。未知版本或任一不可解释的行可能包含tombstone，因此整份日志逻辑隔离：保留原字节、拒绝回放及重写式维护，不将“过滤坏行”称为修复成功。默认缓存仍关闭。list与compact共用保留策略，tombstone优先于预算，内存回放也遵守持久化失效记录。

只读对照既有配置存储实现的三个决定：不可信项目在读取前短路；错误独立于空数据保存；只在实际写入时创建目录。本仓均采纳并用反转回归验证。对照锁封装后保留本地同步接口，但不复制忙等重试，也不以定时心跳替代互斥证明。compaction只生成计划，所有提交归入receipt写入owner；临时文件独占创建、同目录rename，清理状态单独报告，不声称fsync崩溃持久性。

| 原owner | 核验结论与修复 | 证据边界 |
|---|---|---|
| manifest | 工厂校验并冻结快照，read门先于I/O；文件16KiB，预算1–1000 | 畸形warnings、越权、后续原对象修改不扩权 |
| integrity | 同一次恢复观察投影，缺失/拒绝/不可读不混同；未知版本为阻断 | unavailable及未知版本测试，无二次文件扫描 |
| retention | tombstone先扣预算，超过预算仍保留；list与compact共用 | 两个tombstone在预算1仍可观察；别名回放被阻断 |
| lock | wx与唯一token、文件身份检查、幂等释放；过期不转移owner | 四进程过期锁竞争全部拒绝；外部替换只能检测，非fencing |
| recovery | 8MiB常规文件、单条256KiB、UTF-8；损坏保留；唯一临时文件替换并读回 | 目录/软链/超限、换行缺失、rename和读回故障 |
| store | 读观察与mutation owner分离；所有重写需read及对应操作权限 | 锁内读，失败无成功升级；write与cleanup分别投影 |
| compaction | 纯计划；不确定日志拒绝改写；完整日志保留失效语义 | 五种mutation均不能抹掉损坏行；repair无自动过滤恢复 |
| health | 无目录创建；记录、完整性共享一份观察；writable仅目录访问观察 | status只调用一次health；不是未来写入承诺 |
| surface | 真实outcome、失效别名、清理失败及自修复unchanged可见 | 实际slash路由与隔离文件store验收，无真实provider/browser |

准入新owner `receipt/validation.ts` 复用现有entry构造器校验派生关系，不建立第二套重放器；结构准入不证明文件作者身份。
read/list/get契约新增blocked与missing区分，返回记录必须来自完整日志。原无锁effectful compact/repair导出已移除，调用者统一经store。
独立复核额外发现并修复日期注释夹带敏感内容、缓存别名绕过tombstone、自修复把unchanged升级applied三处问题。
初轮测试7失败/2通过；生命周期补测12失败/2通过。旧“覆盖陈旧锁/滤除坏行”断言按已修订契约收紧为拒绝并核对原字节。
扩展外部runner首轮因隔离TMPDIR没有现有策略要求的`/tmp/`路径段而被拒；只调整测试目录到仓内`.tmp/tmp/receipt-tests`，未改执行策略，随后五套31项通过。

W7-28最终验证：`npm run test -w packages/ts-shell -- src/browser/receipt src/browser/replayCommandRunner.test.ts src/browser/replayPlanner.test.ts src/browser/replayPolicy.test.ts src/browser/executionCommandRunner.test.ts src/test-utils/browser/cache src/test-utils/browser/replay/persistent.test.ts src/test-utils/browser/healing/apply.test.ts` 在仓内隔离TMPDIR运行，18套137项通过（exit 0）。构建、import-cycles（1403文件零循环）、config39/39、hooks18/18、factory10/10、Node floor、docs严格门通过；旧docs120/reachability7/function-ceiling7提示不变。
双线复核APPROVE/CLEAR；架构线独立15套121项通过，代码线内存故障探针通过。原15个产品文件回退后26失败/4通过，全部逐字节恢复。隔离编译产物实际slash路由/文件store验收与四子进程过期owner互斥通过；未跑真实provider或浏览器。
`verify:result-contract`仍exit 1：两处旧测试路径不存在，print/replay旧标记失配；已知脚本债务留到W7-26/31，不记为通过。W7-28完成，下一项W7-26。

### W7-26 第一批：回放范围与恢复准入（2026-10-03）

W7-26仍在执行，以下只闭合第一批，不代表36模块审计完成。
发现并复现：跨query配对旧输出；修复扫描整个历史而删除旧终结事件；空文本助手消息丢失工具调用/推理；
fresh-only回放从compact状态重新拿回safe任务事实；重复工具ID复用旧成功/批准或抑制本次相同结算；
恢复准入与激活读取不同session对象。

实施决定：

- `session/transcript/scope.ts`给修复、配对和生命周期读模共用当前范围：比较run/query/branch边界；
  旧格式缺少启动事件时，终结事件后的新用户消息/turn确定新后缀。历史终结事件保留。
- `replay/builder.ts`保留结构化空文本消息，复用现有消息转换器；派生事实不允许时，compact回退同样标为stale。
- 生命周期反向查找只接纳本次请求/启动之后的最新结算；重复ID不再把旧批准/成功当作新调用证据。
  新运行的当前任务索引清空，历史仍保存在append-only transcript。
- `sessionResume.ts`激活准入已检查的同一份session副本；负准入即使无可选block也拒绝。
  实际manager准入调用既有snapshot builder，避免其内部再load一次。metadata→selection顺序保留。
  metadata不存状态：选择会话仍保留磁盘interrupted，真正`markRecoveryReentry`才写active。
  多文件读取/写入没有整体事务或并发writer fencing，本批不作该保证。

对照决定：会话参考`core/session-manager.ts:439-464`保留完整消息、`:476-511`按选中路径恢复；
运行参考`session/prompt.ts:1092-1116`绑定最新用户消息与其assistant，`session/processor.ts:586-610`
只结算当前调用。采纳完整消息、来源范围与当前调用结算，保留本仓owner；不复制实现。
参考导出也存在全局toolCallId匹配，不能作为分支正确性证据，后续导出批次明确不采纳。

验证：初始回放/生命周期8失败13通过、恢复3失败2通过；扩展组曾有1条旧断言仍要求新run返回历史taskStates，
按当前运行索引合同改成空索引并断言历史结算仍完整保留。最终定向13套161项通过，构建通过。
反转5个产品文件后15失败15通过，原字节恢复。独立复核先后补出实际manager二次load与无pendingPrompt的旧格式边界，
修复后第一批代码APPROVE、架构CLEAR；架构最终独立25项通过。
仓内隔离的编译产物真实文件store验收通过：新manager重开、重复ID补偿、旧终结事件保留、
当前query seed与结构化消息往返、恢复选择后仍interrupted及runtime重入后active均有断言。
静态门通过：1404文件零循环，配置39/39、hooks18/18、工厂10/10、Node floor与docs strict；
既有docs120、可达性7、函数上限7提示无新增。未做本地完整TS套件或真实provider调用。

未完成的已确认问题：导出跨分支/重复call ID结果串用、非消息祖先和坏图遍历、深树序列化、
JSON凭据字段/元信息脱敏、损坏数据降级标识、codec嵌套输入检查；continuation的根路径替换及状态投影继续审计。
`verify:result-contract`保持exit1（旧路径和旧输出断言）；首轮误用旧脚本仓外默认测试路径，随后显式设置
`CHEERS_SYNTHETIC_HOME`和`CHEERS_TEST_ROOT`为仓内`.tmp/tmp`重跑，失败相同；不把TMPDIR当作该脚本的完整隔离配置。
前批`4d651202`的CI 37029534144与Architecture Watch 37029534173均成功。

### W7-26 第二批：导出分支与输入边界（2026-10-03）

本批闭合导出已复现的问题；W7-26及36模块逐项审计仍在执行。

| 原owner | 决定与行为 | 验证边界 |
|---|---|---|
| export/collect | 单次读取transcript；直接读取持久化thread；source区分缺失、不可读与空会话；重复消息身份拒绝 | 不调用load/catch-up，不改源文件；不同文件仍是独立观察 |
| export/template | 按选中路径和本次调用关联结果；缺失消息保留断点；同批重复ID不推断归属 | 任一数据降级提示都关闭inline关联，工具结果仍作为消息可见 |
| export/html | 序列化平面显示边，显示损坏与版本警告；标识符使用一致匿名映射 | 12000节点有效图及fallback可序列化；匿名ID只用于单份HTML |
| export/htmlRender | 保留既有Markdown/XSS/URL边界，无新渲染框架 | 原26项回归通过；真实浏览器离线页面验收 |
| query/sessionEntries | 既有图修复保留，遍历和排序改成迭代；导出使用修复后的显示边 | 不改持久化parentId；坏图显示不证明原分支正确 |
| transcript/validation、output | codec检查消息工具字段、身份及回放消费的query/output/result容器、数组和标量 | 拒绝对象/数组枚举且不做强制转换；不是完整扩展字段schema或证据作者认证 |
| core/security/redaction | 共用凭据规则处理JSON字符串/数字/布尔/null及相邻shell片段；元信息同样脱敏 | 保留正常正文、代码和相邻JSON字段；不把HTML转义或base64当作脱敏 |
| exportCommandRuntime | HTML统计实际消息，三格式显示读取诊断；Markdown脱敏；JSONL保留原始entry内容并明确说明 | JSONL不是可安全分享的脱敏格式；旧compaction/branch记录身份保留 |

参考决定：导出参考`core/export-html/index.ts:131/160`使用平面entry与leaf，采纳其避免嵌套序列化的选择；
不采纳`template.js:842-851`的全局call ID查找。另一导出参考`cli/cmd/export.ts:221-239/289`
区分原始导出与sanitize模式；本仓沿用已有JSONL原始entry契约，HTML/Markdown使用共用凭据清理。
入口仍负责命令和写入策略，收集、图投影及显示脱敏留在session/export，没有第二套session加载或执行器。

验证：最初5失败6通过；嵌套输入/脱敏扩展13失败20通过；独立审查补出的缺失调用断点、
Cookie与逗号后缀、JSON标量、畸形codingResult/turn、shell拼接均有失败复现与修复后断言。
最终命令`npm run test -w packages/ts-shell -- src/session src/core/security/redaction.test.ts src/core/security/paths.test.ts src/edit/sanitize.test.ts src/core/commands/exportCommandRuntime.test.ts src/core/shell/recovery.test.ts`在仓内TMPDIR运行，
**69套512项通过，exit0**；构建通过。反转8个既有产品owner后**43失败30通过**，随后逐字节恢复；新增模块保留但旧生产路径不调用。
双线最终代码APPROVE、架构CLEAR；架构独立113项及最后18项通过，代码独立内存/真实恢复投影探针exit0。

编译产物实际slash命令+隔离Chromium验收通过：持久化分支、重复call ID、JSON凭据脱敏、
源文件字节不变、筛选与hash重载、损坏数据提示且不推断inline归属、4000消息页面显示，页面错误0、网络请求0。
首轮浏览器启动因仓内临时路径过长触发Unix socket限制；缩短到仓内共用TMPDIR后通过，没有改变产品代码。
静态门：1414文件零循环，配置39/39、hooks18/18、工厂10/10、Node floor通过；
既有docs120、可达性7、函数上限7提示未新增。未跑本地完整TS套件或真实provider。
`verify:result-contract`显式仓内隔离重跑仍exit1：两处旧测试路径与print/replay旧标记失配，provider readiness子检查通过，留待后续session/shell批次修复。
第一批提交`5a544c06`的CI 37039154960与Architecture Watch 37039155034均成功。

后续继续continuation根路径替换、锁内状态投影、跨query连续性以及损坏transcript对恢复准入的影响；
本批只保证已检查记录的读取与导出降级，不宣称所有恢复消费者已消费诊断或实现原子快照。

### W7-26 第二批CI测试夹具修正（2026-10-03）

提交`0d17cf0c`的CI 37049054966为520套通过/1套失败、4639项通过/1失败/1跳过；
Architecture Watch 37049055051通过。唯一失败是旧export用例未创建会话却断言空会话提示，
归类为夹具与新缺失/空会话契约失配。拆成缺失会话与真实header-only空会话，
双向排除错误原因并继续断言Nothing was written和目标文件不存在，HOME/USERPROFILE隔离后恢复。
仓内TMPDIR复验同时暴露review夹具向上发现父仓库的环境依赖；只给该用例建立独立Git根，保留原断言。
最终`npm run test -w packages/ts-shell -- src/core/commands/slashCommandsModern.test.ts src/core/commands/exportCommandRuntime.test.ts --reporter=dot`
在仓内TMPDIR运行，2套26项通过（exit0）。本次仅改测试与记录，不包含continuation进行中的产品变更。

### W7-26 第三批：根路径迁移与锁内旧权限修复（2026-10-03）

本批闭合已复现的根路径和值迁移问题；W7-26及原36模块审计仍未完成。
旧实现会在目标包含原根时反复替换，改动同名前缀目录和嵌入路径，丢失普通路径的大小写，
并把冲突缓存命名空间直接改为当前根。锁前计算的旧workingMemory还可能覆盖锁内更新或重新写回已删除状态。

实施决定：

- 活跃根候选检测只有session一个生产消费者，迁入`session/continuation/roots.ts`；
  共用值迁移归`session/continuation/rebase.ts`，删除原core模块及无调用者的文件系统推断函数。
  原projection保留检测器的薄导出，不建立core到session依赖或第二套候选实现。
- 只在原字符串上做一次替换，迭代处理JSON形状数据，保留共享引用及未改动输入；
  普通路径保持目标大小写，Windows根按其身份折叠。组件边界、完整绝对路径和配对引号阻止兄弟目录及嵌入路径误改。
  父目录逐步越出原根时保留原文；空白、冒号和竖线不自动当作路径结束。含糊自然语言允许保守地保持不变。
- 缓存命名空间和target按原始记录处理：只接纳已知previous/current根，外来缓存连同原空白保留。
  当前namespace仍修复旧target，并保护已经迁移的嵌套target；较长候选不满足边界或包含性时，
  在同一次原文匹配里回退较短有效根，不重新扫描插入文本。audit/history、continuity/history和summary共用该规则。
- POSIX展示根区分大小写，缓存小写根只能确认已知根，不能把`/Old`与`/old`合并。
  多个旧根候选使整份memory原样返回，不补默认字段、不写磁盘；既有多根测试要求重分配cache key的断言归类为错误契约预期，
  改为验证原根、原key及状态文件字节全部保留。
- 锁前只判定是否需要修复，锁内重读最新状态；缺失、memory已删除、根已改变或新memory无需迁移时不写。
  返回实际最新状态，不复活旧内容，不覆盖较新的终结状态及错误字段。

对照决定：路径参考`core/src/fs-util.ts:270`用relative拒绝绝对结果和`..`越界，采纳组件包含性而非字符串前缀；
会话参考的`core/tools/path-utils.ts`负责解析与存在性，无存储值根迁移实现。
本批保留本仓的值投影设计并自研迁移，不把文件系统解析函数复制成存储修复。
256组父组件组合与path.posix.relative逐前缀对照，反转后旧生产实现的相关用例失败。

复审补出引号、空白/冒号、父目录越界、当前namespace中的旧target，以及最长候选遮蔽三类目标；均保留回归。
父组件检查从每个匹配重扫余文改为单次组件预处理和二分查询，避免重复路径文本的二次方工作。
本机85KB/5000项探针由约1052ms降至代码复审的8.84ms；这是本地观察，不是通用延迟保证。
最新候选回退回归先6失败54通过（exit1），修复后3套67项通过。

最终`npm run test -w packages/ts-shell -- src/session src/core/paths`在仓内TMPDIR运行，
**67套510项通过，exit0**；构建通过。反转3个原生产owner后**17失败7通过**，随后逐字节恢复。
独立代码APPROVE（67项和18项额外断言）、架构CLEAR（68项和6项额外断言）。
仓内隔离编译产物实际SessionManager/文件store验收通过：嵌套目的地、路径边界、重开与transcript字节不变、
旧权限持久化及幂等、真实锁内删除/换根不复活、冲突POSIX根不写；另16组显式/自动混合缓存场景覆盖独立/嵌套目的地。
静态门通过：1417文件零循环、配置39/39、hooks18/18、工厂10/10、Node floor；既有可达性7、函数上限7提示未新增。
文档严格门通过，既有120条source advisory未增加；打包judge退出0，阻断义务全部满足，函数上限advisory使整体verdict仍为partial。
未跑本地完整TS套件或真实provider。

本批不提供文件系统/symlink授权或metadata/state跨文件事务；显式rebind失败次序、恢复摘要与跨query连续性、
损坏transcript恢复准入仍继续审计。旧result-contract的缺失测试路径及过期输出断言仍待修复，未改记为通过。
前一夹具提交`40ab9a96`的CI 37053389823与Architecture Watch 37053389815均成功。

### W7-26 第四批：显式迁移失败次序（2026-10-03）

旧实现先改调用者和metadata，再获取state锁；锁、读取或state写入失败时会留下不一致记录。
现由原continuation owner在锁内读取最新记录、验证身份和根、准备副本，依次写state与metadata，
两者完成后才返回新Session并选择新项目。失败明确区分unchanged、restored、partial、committed；
锁释放或选择失败不把已提交记录说成未写入，也不在锁外回滚。

对照决定：会话文件参考的`_setSessionFile`拒绝覆盖非空损坏文件，采纳失败前验证并保留记录；
文件写入参考的`writeIfUnchanged`锁内重读比较，且明确多文件写入需报告partial，采纳这两个边界。
本仓metadata/state分离，参考没有对应补偿协议；本批观察后补偿为**自研**，保留原单文件原子写入和锁。
仅当原metadata未变、state等于本次候选时恢复旧state，之后回读验证；外来内容或不可读结果保持partial。

复核发现旧metadata缺根时，完整Session会从state补根；相同时间戳还会让未写metadata被误认为committed。
已把原始metadata读取收归现有store函数，普通load复用该函数；恢复直接比较原记录，不重读transcript。
真实文件回归覆盖metadata写前/写后报错、恢复失败、缺根旧记录和相同时间戳。旧观察路径先1失败5通过，
修复后六种情况全通过。独立代码APPROVE、架构CLEAR；架构复核另独立运行这六项通过。

最终`npm run test -w packages/ts-shell -- src/session src/core/shell/bootstrap.test.ts`在仓内TMPDIR运行，
**67套548项通过，exit0**；构建通过。反转3个产品owner后**34失败1通过、69过滤**，随后逐字节恢复。
bootstrap旧夹具在仓内TMPDIR向上继承父Git根，前序基线9失败；加Git发现上界后通过，属于harness/setup drift。
常规/全屏真实PTY各完成迁移、输入、工具请求、审批、写入、收尾与落盘，均exit0；各2次本地HTTP脚本模型请求，
审批前无文件，审批后只写新根，metadata/state和transcript一致。首次验收误要求TUI显示被隐藏的启动提示，
改读实际存储根后通过，未改产品显示策略。无真实provider调用。

静态门通过：1417文件零循环、配置39/39、hooks18/18、工厂10/10、Node floor；可达性和函数上限各7条既有提示未增加。
本批不承诺跨文件崩溃事务或非合作并发写入保护。已发现旧workspace绑定字段在迁移后仍保留，另批修复；
恢复摘要、跨query连续性与损坏记录准入仍待审计，W7-26未完成。旧result-contract脚本的已记录失败本批未重跑或改记通过。
前一`62ae97ef`的CI 37092763488与Architecture Watch 37092763482均成功。

### W7-26 第五批：迁移后的工作区绑定（2026-10-03）

第四批相邻检查发现：带完整metadata的会话迁移后仍保留旧targetPathBase、requestedWorkspaceRoot、
rootMode和gitRoot。启动虽使用新projectRoot，仍会显示旧基准及错误Git状态，产生绑定不一致诊断。
新回归在原实现上3失败1通过，属于product behavior drift，不修改原有根绑定契约。

定向对照会话参考的`forkFrom`：解析目标cwd，按目标生成位置header，保留历史内容。
采纳目的地位置独立重建；本仓显式migration保留会话ID，不采用参考的新会话分叉语义。
参考没有本仓四个绑定字段，对应失效投影为**自研**：仅根身份改变时把请求根/目标基准设为新根，
删除旧rootMode/gitRoot，由现有bootstrap和会话切换入口发现目标Git状态，bootstrap负责持久化补全。
不得把缺失gitRoot改为null：两者分别表示尚未发现与已确认无Git。相同根迁移保留现有绑定。
这组投影参加第四批同一metadata提交及失败补偿，没有新增文件系统探测层或迁移协议。

`npm run test -w packages/ts-shell -- src/core/shell/bootstrap.test.ts src/core/shell/runtimeContext.test.ts
src/session/continuation/sessionProjectRootRebind.test.ts src/session/SessionManager.test.ts`
在仓内TMPDIR运行，**4套128项通过，exit0**；构建通过。反转单个产品owner后3失败1通过、39过滤，源码逐字节恢复。
独立代码APPROVE、架构CLEAR；架构复核独立运行4项通过。常规/全屏PTY分别验证Git→普通目录与普通目录→Git，
均完成输入、模型工具请求、审批后写入、收尾和落盘，exit0；旧根无新文件，五个绑定字段均正确。
各2次本地HTTP脚本模型请求，无真实provider。静态门通过，脚本测试40/40，文档严格门通过；既有advisory保持。

第四批提交`55f2c813`的CI 37096214392与Architecture Watch 37096214446均成功。
W7-26仍待恢复摘要、跨query连续性及损坏记录准入等逐模块闭合；之后按31→27→29→33顺序继续。

### W7-26 第六批：续接摘要来源（2026-10-03）

当前结构化结果缺少可选字段时，旧实现会从compact memory补入旧成功、旧失败、旧写入和seed事实；
消息还优先取自原始恢复日志，绕过已选分支。首轮6项回归5失败1通过，属于product behavior drift。
现由原snapshot owner把结构化结果视为完整观察，缺失字段保持缺失；无结构化结果时保留旧checkpoint兼容。
seed影响与所选编码结果取自同一次completion，不再套用后续聊天的标记。

定向对照会话参考的`buildSessionPath`、`buildContextEntries`与`buildSessionProjection`：沿选中祖先路径投影，
较新的compaction覆盖旧摘要来源。采纳选中路径和权威来源优先原则；本仓分离的handoff字段没有直接对应实现，
fallback准入修复为**自研**。显示消息使用已加载的session.turns，复用已有contextSummary分类排除合成摘要；
只有replay明确补出待恢复提示时才使用durable pendingPrompt。历史查询结果的非chat优先策略本批未改。

独立审查发现并修复两个边界：分支/压缩摘要不能被当成用户请求，insertedPromptMessage不能使后续原始用户消息
冒充被补出的提示。代码APPROVE、架构CLEAR，架构方独立内存探针通过。真实文件测试覆盖结构化结果落盘重开、
含/不含摘要的分支回退及中断提示恢复。

`npm run test -w packages/ts-shell -- src/session/continuation/snapshot.test.ts src/session/SessionManager.test.ts
src/session/continuation src/session/recovery src/result/terminal`：**20套242项通过，exit0**；构建和40项脚本测试通过。
反转snapshot产品文件后**13失败1通过**，随后逐字节恢复。常规/全屏PTY各2次本地HTTP脚本模型请求，完成提示、
工具请求、审批、实际写入、结算与落盘，均exit0；请求包含选中消息，不含废弃消息或旧handoff字段。
首次PTY夹具缺少codec必填数组而被拒绝，修正夹具并增加落盘回归后通过；未改准入规则，无真实provider调用。

静态门通过：1418文件零循环、配置39/39、hooks18/18、工厂10/10、Node floor；可达性和函数上限各7条既有提示。
NormProof exit0，阻断义务满足，整体仍因既有函数上限提示为partial。旧result-contract重跑exit1，仍是两处失效测试路径
及print/replay过期预期，不记为通过。第五批`0245fb92`的CI 37097269144与Architecture Watch 37097269145均成功。

W7-26继续：snapshot重复读取、完整branch/query结果归属、compact更新与损坏记录准入尚待逐项审计，未声明完整审计通过。

### W7-26 第七批：摘要入口复用观察输入（2026-10-03）

`buildContinuitySnapshot`已有session和state后仍调用`getRecoverySnapshot`再次load，并重复读取transcript。
两项生产manager回归复现了后一次pendingPrompt覆盖已观察提示、后一次日志使已观察失败丢失，原实现2失败3通过。
原read surface现把同一session、规范化state及一次显式transcript观察传给恢复与续接builder；恢复准备用切片处理，
不修改共享输入。初始state必须可读；锁内规范化发现删除时直接失败，不以旧state兜底。

对照会话参考的`buildSessionProjection`及`buildSessionContext`：从同一entries/path派生各投影并复用结果，
采纳输入复用原则。参考没有本仓metadata/state分离格式，本批组合逻辑为**自研**，复用原recovery builder。
不承诺store.load内部的多个文件读取是原子快照，也不借此声明branch/query结果归属已解决。

`npm run test -w packages/ts-shell -- src/session/continuation src/session/recovery src/session/SessionManager.test.ts
src/result/terminal`：**21套247项通过，exit0**；构建、独立代码APPROVE和架构CLEAR。
反转read surface后2失败3通过，逐字节恢复。隔离编译manager验收确认一次顶层load及一次显式日志读取；
常规/全屏PTY各2次本地HTTP脚本模型请求，均完成提示、工具请求、审批后实际写入、结算与落盘，exit0，无真实provider。
静态阻断门通过，1419文件零循环；既有可达性和函数上限各7条提示未增加。旧result-contract的第六批失败未改记通过。
完整branch/query结果归属、compact更新与损坏记录准入等继续审计，W7-26未完成。

### W7-26 第八批：compact结果检查点更新（2026-10-03）

原retention planner在首次compacted后永久跳过结果更新；summary builder则把新结果没有的可选字段继续从旧对象保留。
6项初始回归4失败2通过，属于product behavior drift。现每次达到阈值后的query完成都会更新检查点；
结果派生字段作为一次完整投影传递，替换时先移除整组旧字段，包括action/write/seed/diagnostic/taskState。
审批记录、独立上下文和其他非结果字段不因结果替换而删除。

对照会话参考的`buildContextEntries`与`buildSessionProjection`：选取最新compaction并保留后续路径条目，
不把首次检查点永久当成当前状态。采纳持续更新和较新权威结果覆盖旧检查点；本仓结构化handoff组与非chat选择规则
没有直接对应实现，替换准入为**自研**。检查点存储lastTaskKind，使chat之间可更新，但后续chat不覆盖已有非chat结果；
旧检查点缺少类型时保守保留，未携带结构化结果的完成事件也不清空旧结果。纯文本旧字段仅在结果被替换时清除；
未替换时保留，已有结构化字段优先于重复文本，避免将旧文本重新投影为新事实。

最终`npm run test -w packages/ts-shell -- src/session`：**69套566项通过，exit0**，包含10项新增结果替换/保留回归及
真实文件落盘重开、仅剩旧格式检查点时的读取；构建、40项脚本测试与独立APPROVE/CLEAR通过。
反转5个产品owner后8失败2通过，随后逐字节恢复。常规/全屏PTY各2次本地HTTP脚本模型请求，验证第12次失败检查点
在第13次成功结果后更新，再完成提示、工具请求、审批后实际写入、结算与落盘，均exit0；无真实provider。
静态门通过，1420文件零循环；可达性和函数上限各7条既有提示未增加。

范围限制：替换当前结果检查点不证明更早的未知写入已解决；完整历史损坏跟踪与branch/query归属仍待审计。
复审另发现既有读取缺口：结构化编码历史被裁剪、只剩chat事件时，snapshot reader可能忽略已保留的非chat检查点。
本批只验证检查点生产/保留及无结构化日志时的fallback，不将其扩写为chat-only日志恢复通过；该读取缺口接续修复。
旧result-contract的已记录失败未重跑或改记通过。第七批`c765904c`的CI 37100058819与Architecture Watch 37100058822均成功。


### W7-26 第九批：chat-only日志的检查点读取（2026-10-03）

编码query事件被裁剪而只剩chat时，原snapshot将chat当作当前编码结果，屏蔽保留的检查点并可能显示聊天成功。
初始17项回归3失败14通过，属于product behavior drift。现在compact生产与snapshot读取共用continuation/source的来源选择：
chat不能替换非chat或未知旧检查点，所有结果派生字段在选定来源后投影，避免混入chat的seed、验证或成功诊断。
检查点同时保存任务类型、终态分类、原因和停止说明；替换时整组清除旧值。旧格式或无效类型保持未知，查询成功不会把未知升级为成功；较新查询错误仍可显示。

延续已检查的会话参考`buildContextEntries`/`buildSessionProjection`的检查点来源与后续路径原则；本仓非chat结果组的替换策略没有直接对应实现，属于自研适配。
未证明较旧非chat日志与较新compact之间的顺序，也未解决完整branch/query归属、历史未知写入消解或损坏记录准入。

`npm run test -w packages/ts-shell -- src/session src/result/terminal`：70套577项通过；含真实生产检查点、裁剪旧事件、追加chat、落盘重开。
构建、静态阻断门、40项脚本测试、独立APPROVE/CLEAR通过。反转5个产品文件后7失败24通过，随后逐字节恢复。
1421文件零循环，可达性及函数上限各7条既有提示；judge exit0且所有阻断义务满足，整体partial来自advisory。
旧`verify:result-contract`重跑exit1：两处测试路径缺失及print/replay旧预期仍失败，没有改记通过。

隔离编译SessionManager检查保留的unknown写入与stopped终态。常规/全屏PTY各2次本地HTTP脚本模型请求，
完成提示、工具请求、审批后实际写入、结算与落盘，均exit0；这只证明普通执行流程与已检查snapshot并存。
首轮额外模型上下文断言失败：`cli/runtime/cliSessionRuntimeFactory.ts`的runPrompt忽略continuityState，
HTTP请求没有保留的结果事实。失败脚本及请求记录保留在本地验收产物；不将双模式执行通过表述成连续性上下文已经交付模型。
该消费者缺口接续修复，W7-26未完成。

第八批c586ea16的Architecture Watch 37101567508成功；CI 37101567632失败：525套通过、1套失败，4770项通过、1失败、1跳过。
唯一失败为浏览器缓存并发CLI写入场景返回blocked而测试期望passed。本地定向重跑1失败5跳过，实际failed而非远端blocked；原因待进一步归类，不能视为同因复现或本批通过证据。


### W7-26 第十批：连续性事实交付模型（2026-10-03）

第九批PTY暴露运行适配器忽略continuityState；新增invocation回归先失败，证实模型输入缺少已保留unknown写入。
现ShellSessionRuntime复用原buildSessionResumeContext，以原始用户请求选择续接/反思上下文，再经现有CLI invocation传递。
turn层将带来源说明的历史事实放入本轮模型opening；原始请求的事件与hook字段不混入该摘要，opening仍不作为新用户消息落盘，图像块保持。
沿用当前权限选项与工具审批，不从历史审批事实推导新授权。参考会话投影的`buildSessionProjection`及`convertToLlm`：
摘要事实需要实际映射为模型消息，且保留其来源；本仓通过既有opening传输的适配属于自研，没有增加持久化历史消息类型。

双线复审发现首版在补入历史文本后判断continue，导致历史摘要中的Continue词误触发无关用户请求。
最终判断移到原始请求上，第六个可选runPrompt参数承载已选择的文本，既有snapshot和图像参数位置保持。
真实compact注入回归同时覆盖继续任务和无关算术请求；反转该判断到补入历史文本后的请求，1失败1通过，逐字节恢复。
反转5个产品owner，4失败42通过，随后逐字节恢复。最终独立APPROVE/CLEAR。

最终在仓库内隔离HOME下运行invocation、cli/runtime、turn、sessionRuntime、continueShellActionRuntime及resumeContextBuilder：
18套250项通过，构建与静态阻断门通过。1421文件零循环，可达性与函数上限各7条既有提示；judge阻断义务满足，整体advisory仍partial。
旧mock的snapshot缺必填数组导致一次测试失败，已补齐当前契约，没有放宽生产准入。
常规/全屏PTY各2次本地HTTP模型请求，直接断言请求包含unknown写入和检查要求；审批前无文件、审批后真实写入、结算与落盘通过，
且落盘没有新增合成continuity用户提示。两模式exit0，不使用真实provider配置。旧result-contract的第九批失败记录保持，本批未重跑。

测试隔离限制：首次扩大测试未隔离HOME，既有step测试把仓库内TMPDIR的临时workspace归入上级仓库，
调用writeProjectState写入thinkingEffort=high；随后采样测试因启用thinking不发送temperature而失败。
只读检查确认真实HOME对应项目状态为high；没有运行前快照，未擅自恢复仓库外状态。最终使用仓库内新HOME通过，
此后验证必须同时隔离HOME/USERPROFILE和TMPDIR，不能把仅指定TMPDIR当成写入范围隔离。

第九批cf4d9c21的CI 37102799966与Architecture Watch 37102799957均成功。
前一CI的缓存场景blocked由runner唯一超时分支归因为8秒子进程超时；本地failed则是夹具不接受裸`.tmp`绝对runner路径，
并把脱敏占位符计为RAW泄漏。使用仓库内`.tmp/tmp`后该定向场景1通过5跳过；未修改缓存生产路径或把旧CI失败改为成功。
完整branch/query归属、较旧日志与新compact排序、历史未知写入和损坏准入仍未闭合，W7-26继续。


### W7-26 第十一批：续接结果的分支归属（2026-10-03）

回退到较早答案后，界面正确显示选中分支，但recentVerifiedFiles仍来自已放弃答案；原始回归1失败。
沿用已对照的会话投影原则：消息祖先路径控制上下文，摘要须保留来源，后续检查点不能被较旧事实替换。
本仓查询事件与消息分离，因此在既有transcript envelope上添加sourceEntryId，保持通用QueryEvent不变。
CLI运行闭包在消息持久化成功后保存其ID，终态查询和失败沿现有append入口携带该来源；初始化失败显式记录来源未知。
来源getter的保证限于当前生产者的终态事件；它不是任意排队中间事件的产生时刻快照。

compact结果组连同eventId/entryId保存或替换，chat、审批及计数更新不改写旧结果来源。
读写两侧在结果替换前检查选中路径，迟到的已放弃分支结果不能覆盖当前compact检查点。
缺来源的旧结果仅在可证明线性、覆盖普通transcript消息的历史中兼容；损坏、矛盾或离开路径的来源被排除。
全局错误、恢复终态、补入pending prompt及审批/request-scope记忆不能替代缺失的分支证明；操作性恢复及审批数据仍保留在存储中。
结果、失败与终态按现有事件顺序或不同消息边界排序；同一边界且来源事件缺失时，不猜测较新结果，
省略确定性结果/验证/终态并写入unresolved诊断。后续chat或无编码结果的success不能升级已有unknown/stopped写入。

最终验证：29套384项通过，build:cli通过；覆盖续接、恢复、回放、SessionManager、runtime和invocation。
11个产品owner反转后15失败56通过；脚本finally逐字节恢复全部文件。独立代码APPROVE、架构CLEAR。
普通及全屏编译PTY各2次本地HTTP请求，断言模型请求排除放弃分支、保留选中unknown写入，审批前不写、审批后真实写入并结算；
终态envelope来源等于实际末尾助手消息ID，且摘要未作为新用户消息落盘。最终产物在本地.tmp/branch-pty-_4ap9bw7。
静态阻断门通过，1423文件零循环；judge exit0且阻断义务满足，整体仍有既有advisory，不能记为完整架构SATISFIED。

旧result-contract重跑仍exit1：两个失效测试路径和旧print/replay标记；提供方readiness子项通过。
首次重跑虽设置HOME/USERPROFILE/TMPDIR，该脚本仍通过专用路径helper改用默认/tmp合成HOME及fixture目录，
实际写入超出仓库边界；没有运行前快照，未清理或擅自恢复外部数据。未读取真实provider配置。
随后同时设置CHEERS_SYNTHETIC_HOME与CHEERS_TEST_ROOT到仓库内再跑，仍为相同旧契约失败。
后续运行这类脚本必须检查专用目录变量，不能仅凭外层HOME推断写入隔离。本批未重跑test:scripts。

第十批7f1e2d0d的CI 37104585807与Architecture Watch 37104585806均成功。
本批仅闭合已列续接来源场景；不声称跨进程事务、操作性replay隔离或36模块完整审计完成。W7-26继续。


### W7-26 第十一批CI适配器修正（2026-10-03）

`e17f899f`的Architecture Watch 37107169853通过；CI 37107169849为526套通过、1套失败，4807项通过、1失败、1跳过。
唯一失败为usage持久化测试的强制类型转换适配器未实现transcriptPath；生产SessionStoreAccess已有此方法。
给测试补入既有layout.transcriptPath，保留全部用量断言；隔离运行该测试1套1项通过。归类为确定性的测试适配器缺口，不是提供方、环境或第十二批变更引入的失败。


### W7-26 第十二批：操作性恢复的分支归属（2026-10-03）

回退会话后，原全局pendingPrompt仍可安排废弃请求自动执行；新增落盘回归先失败。恢复owner现在先按选中祖先路径准入消息、查询、生命周期及状态，再进行缺失记录修复。参考会话投影同样以选中祖先链为上下文边界；本仓独立的pending、query及harness状态没有直接对应实现，来源校验和修复协议为自研。

提示屏障把实际用户消息ID与pendingPrompt一起持久化；读取使用同一份state观察，要求来源为最新选中用户消息，已有日志必须与角色及文本一致。缺失原始消息可由有效durable来源修复；旧无来源入口清空旧stamp，终态保存清空提示及stamp。分支切走再切回仍可恢复原提示，新分支的新提示也可恢复。

全局interrupted状态不再删除选中分支终态或凭空补入中断。pending来源不能认证旧harness或全局终态；补偿查询使用相同scoped transcript，废弃分支上同taskId结算不能关闭当前工具。shell不再从raw runtime session补回被拒绝的提示；continuity复用已准入且修复的提示。

独立复审发现并修正两个缺失记录边界：索引须在移除空assistant记录后计算；缺失起点时，durable提示屏障支持的合成run-started须留在返回流中，保证生命周期与runtime seed也看见新回合边界。该修复仅在内存中生成，并通过insertedRunStarted报告，不伪造durable执行或写入结论。

验证：21套237项，加continue/reentry/selection/codec/retention消费者5套44项，累计26套281项通过；build:cli通过。第一轮expanded测试的missing prompt顺序失败属于产品缺口，已修复；shell新增断言漏写返回中的autoResume/disposition属于新测试预期不完整，补齐精确断言。保留线性不完整日志中的未索引消息，但不让它们认证旧执行事实。

静态阻断门通过，1426个文件零依赖循环；7项可达性提示保持，docs-source-drift有120项非阻断提示。NormProof exit0且所有blocking obligations满足，整体advisory verdict仍为partial。

独立代码APPROVE、架构CLEAR。13个既有产品owner反转后26失败27通过，逐文件字节恢复确认。反转脚本首次路径计数和Python变量错误均在源码写入前终止，修正脚本后完成正式反转。

编译CLI普通/全屏PTY各覆盖废弃提示和新选中提示，共4场景，均exit0、各2次本地HTTP脚本模型请求。废弃提示的/continue不触发模型，随后显式指令正常运行；选中提示的/continue正常执行。均验证审批前无文件、审批后实际写入、终态落盘及最终assistant消息来源；模型请求排除废弃提示，无合成continuity用户消息。首次验收未关闭命令输出pager而超时，修正终端驱动后通过，产品行为未因夹具改动。

所有本批测试/验收使用仓内隔离HOME/USERPROFILE/TMPDIR及专用合成目录，无真实provider配置。本批不重跑已有失败的result-contract或test:scripts，不将旧失败改记通过。上一独立CI适配器修复7c34d0fd的CI 37108774969与Architecture Watch 37108774974均成功。

保证不涵盖跨文件事务、并发writer fencing或缺失中间执行事件的精确复原。无来源分支事件保守排除，必要时重新执行而非继承无法证明的工具/审批状态。W7-26继续，逐模块清单见phase-18-session-audit.md；next续接、seed文本往返、历史读取字段顺序、历史unknown写入和导出长输出等仍未闭合。


### W7-26 第十三批：续接判定与历史格式兼容（2026-10-03）

逐模块审计的三个确定性缺陷均已补入回归：snapshot接受有任务上下文的next，但context拒绝；formatter写出的last-seed-influence读不回；read-fragment只收齐四字段就结束反向扫描，较早的fingerprint、source window及ranges因字段顺序丢失。修复前10失败60通过。

context现在复用snapshot已有的pathless续接判定，保留无任务历史及显式其他路径的拒绝条件。模型入口仍依据原始用户输入判定，不依据注入历史。seed按有效结构化值、formatter键、旧bare/seedInfluence=格式依次读取，仅允许原三个枚举；片段扫描保留最新有效字段规则，收齐全部八字段才提前结束。

参考上下文投影以规范化来源生成最终模型消息，采纳同一选择策略贯穿消费者的原则；本仓seed和fragment文本为自身历史兼容格式，无直接对等参考实现，本次修复由本地formatter/reader契约约束，没有引入新的标记生产者或第二套连续性机制。

18套248项及build:cli通过，独立APPROVE/CLEAR；三个产品owner反转10失败60通过后逐字节恢复。普通/全屏编译PTY输入next，各2次本地HTTP模型请求，直接验证选中unknown写入事实交付模型、审批前无写入、审批后实际写入、结算及消息来源落盘，无合成continuity用户提示，无真实provider配置。全部测试与PTY使用仓内完整隔离目录。

seed/fragment回归证明历史格式消费及往返，不证明当前真实工具会生成这些字段。W7-26仍在执行；历史unknown写入、其余字段优先级与导出长输出等按审计矩阵继续，不把此批记为36模块全量完成。第十二批49dc51e9的Architecture Watch 37110368332与CI 37110368330均成功。旧result-contract失败未重跑或改记通过。

第十三批静态阻断门通过，1426文件零循环；NormProof exit0且全部阻断义务满足，整体advisory verdict仍为partial，docs-source-drift仍有120项非阻断提示。


### W7-26 第十四批：导出长输出交互（2026-10-03）

导出页在details尚未挂载/打开时读取尺寸，且在overflow检查之后才设置max-height，导致长工具输出没有Show more。新增回归1失败20通过；实际编译导出命令生成的HTML在Chromium中同样找不到按钮，证明不是VM布局模拟问题。补充重复message ID的collect拒绝与原文件不变回归，既有产品拒绝逻辑无需改动。

参考导出按行数生成预览与完整内容。本仓保留已有CSS高度上限及单份文本，以覆盖长单行自动换行：挂载并首次打开后先应用高度上限再测量，短输出移除折叠，长输出创建一次切换按钮。复审指出窗口/侧栏缩窄后的新overflow缺口，进一步用单一ResizeObserver检查尚无控件的当前输出；视图重建时disconnect并替换WeakMap，已创建控件保留用户展开选择。

最终5套66项及build:cli通过；独立APPROVE/CLEAR。编译slash导出与Chromium验收覆盖长多行、长换行单行、短输出、Show more→Show less→收起、重复打开、窗口及侧栏尺寸变化，0页面错误/0网络请求。观察器触发布局变化未在这组浏览器场景产生ResizeObserver错误。无真实provider，HOME/USERPROFILE/TMPDIR及合成目录均在仓内。

本批仅改变导出显示，不改变原消息、分支配对、脱敏或权限。无ResizeObserver的旧浏览器仍可在打开卡片时检测高度，但不保证已打开卡片自动响应尺寸变化；无外部资源依赖。第十三批d3dcca9c的CI 37111182072与Architecture Watch 37111182078均成功。W7-26其余continuation/recovery矩阵项继续，未宣布36模块完整审计完成。

第十四批模板owner反转后2失败20通过，原文件逐字节恢复。静态阻断门通过，1426文件零循环；NormProof exit0且全部阻断义务满足，整体advisory verdict仍为partial，docs-source-drift仍有120项非阻断提示。


### W7-26 第十五批：新会话检查点与恢复选择（2026-10-03）

全新SessionManager的workingMemory未初始化，retentionPlanner直接返回，导致没有审批历史的会话即使完成12轮也不建立检查点。只对undefined初始化空对象，既有null、数组及其他异常值不被覆盖，分支来源准入顺序保持。参考压缩判据由上下文用量和设置驱动，不依赖审批状态；本次只解除意外初始化耦合，未引入token压缩器或第二套状态。

项目聚合的最新会话ID/时间/标题整体更新，最新无标题时不借用旧标题；带项目根的恢复建议复用无根路径已有的interrupted/error资格判据。正常生产者会给标题默认值并拒绝completed恢复，因此两项helper修复不被描述为已证实可达的自动恢复绕过。丢弃pending来源的会话仍可手动恢复上下文，但autoResumeReady保持false。

最终16套225项、build:cli及静态阻断门通过；1426文件零循环，7项可达性提示保持。独立代码APPROVE、架构CLEAR。三个产品owner反转后6失败24通过，逐文件字节恢复。普通/全屏编译PTY各跑12轮无审批对话，检查sourceTurnCount=12及compacted=true；第13轮明确写入仍等待批准，然后验证实际文件及终态持久化，两模式均exit0、各14次本地HTTP请求。产物为.tmp/retention-pty-bxz5qgip。

首次全屏驱动等待未被增量重画的提示文字而超时，落盘状态已completed；改用对应回合持久化计数与pending清除判定结算后通过，未修改产品满足驱动。所有测试及PTY均使用仓内隔离HOME/USERPROFILE/TMPDIR和专用合成目录，无真实provider配置。NormProof exit0且阻断义务满足，整体advisory仍partial；旧result-contract和test:scripts本批未重跑。

第十四批8b920aaf的CI 37112529831和Architecture Watch 37112529822均成功。W7-26继续：已确认较新同文件验证成功后旧失败仍残留的缺陷；历史unknown写入及其余字段优先级仍需闭合。


### W7-26 第十六批：已知失败解除与历史写入观察（2026-10-03）

已知失败聚合原来只追加：同一文件后来changed、verified且验证passed，恢复提示仍同时列verified和failed并要求重试。最新优先扫描现在记录逐路径的较新成功，只抑制旧的已知失败；较新失败、无关路径、缺少修改或验证、unverified条目和unknown/inspection事实不被清除。路径只做trim，不引入大小写/真实路径归一化。seed明确非passed状态也阻止解除；复审发现只有command、没有可选status的seed被误判为矛盾，改为沿用顶层passed并增加回归。

参考文件跟踪以工具调用收集路径，不足以证明写入或验证成功，未照搬该判据；快照差异及工具结算分别依赖对应消息/调用身份。本仓沿用自己的changed/verified/失败证据定义，仅按同一路径比较。公开resume回归确认旧failed-files及错误重试指令消失，未改变current结果的其他字段。

历史unknown/unverified是独立问题：当前compact结果必须整组替换，不能把A字段混到B。现有原始日志为append-only，实际消息压缩只改变加载视图；参考同样将保留的选中路径与压缩模型上下文分开。新inspection投影复用既有写入事实解释器，扫描全部已准入query日志，把记录总数及最新3条带来源的历史观察前置到unresolvedItems。后续同文件或无关文件成功不被解释为已链接的历史结算；B自己的终态、验证、taskState及lastWrite字段保持原值，不加新持久化账本。

补齐四类helper直接断言：seed四来源冲突和无效回退；最后tool provenance无taskId/failureBoundary不补旧值；session/lifecycle/stopReason的非空优先级及独立stopReason；结构化false/none覆盖旧unknown标记。初始已知失败回归1失败12通过，历史回归2失败13通过。

最终29套424项及build:cli通过；独立代码APPROVE、架构CLEAR。两个既有owner反转7失败67通过后逐字节恢复。12轮检查点后历史记录超出recent-4仍可见；四组unknown/unverified与同/异目标成功序列另调用appendCompactionEntry，证明旧消息离开加载视图时原始事件及检查提示保留，并覆盖重开和分支切走/切回。新增压缩断言首次误用不存在的loadSession方法，归类为测试适配器错误，改用真实getSession接口后通过，未改产品接口。

全部验证使用仓内隔离HOME/USERPROFILE/TMPDIR及专用合成目录，无真实provider配置。原始事件若已被外部或旧数据处理删除，且唯一旧compact结果又被替换，本次无法重建消失事实；没有历史写入显式结算协议，观察不等于当前失败或授权。旧result-contract失败和test:scripts本批未重跑。原36模块逐项行为矩阵至此闭合，W7-26完成，按裁决继续W7-31→27→29→33及剩余W8项。第十五批35f6a2c1的CI 37113652433和Architecture Watch 37113652454均成功。

第十六批最终普通/全屏编译PTY各2次本地HTTP请求：模型opening含历史unknown和来源、无已解决失败及错误重试指令；命令型partial seed同样正确回退passed。审批前无文件、批准后实际写入、终态来源与最终assistant消息匹配；无合成continuity用户提示。产物.tmp/history-pty-srmq1gzu，两模式exit0。
静态阻断门通过，1428文件零循环；7项可达性提示与120项docs-source-drift提示保持。NormProof exit0且所有阻断义务满足，整体advisory仍partial。


### W7-31 首批：精确审批、一次性授权与拒绝优先级（2026-10-03）

当前Shell清单为26个根模块加12个子目录模块，共38个，完整判据和未闭合项见[Shell审计](phase-18-shell-audit.md)。
目标是消除真实工具执行前的审批绕过。对照参考实现的原始命令权限资源、未匹配询问、once只完成当前请求和always才持久化的决策；保留现有handler、工具hooks、registry与execution路径。

- Git branch创建及diff/show/log输出选项不再仅凭子命令被判read-only。status/diff实测可调用external diff、fsmonitor、clean filter，固定禁用若干helper仍不完整；这些命令及log/show要求审批，plan拒绝，branch/rev-parse仅正向参数集合自动准入。工具描述同步更新。
- producer和store保留命令/文件目标原始大小写及空白，exact命名空间拒绝旧有损键静默复用；旧授权仍可查看/撤销。真实write/edit回归证明末尾空格、前导空格、大小写变化不能借用已有授权。
- allow-once只回答当前等待请求，scope自动回答不留下下一次缓存；非交互式预存once只在实际选中时消耗。显式deny不消耗未用授权。
- 拒绝规则独立于exact键：命令兼容trim后前缀/相对路径比较；已知文件目标即使含空白也按路径解析dot组件。三种scope下拒绝优先，原始目标仍完整返回。

最终命令：隔离环境下`npm run test -w packages/ts-shell -- --threads=false`，指定approval/evaluator、approvalTrustPolicy、interactiveApprovalWiring、approvalPromptBridge、approvalExecution、turn/tools、toolPolicy、turn/subagent，以及approval/deny、session/approval、permissionRequestMemoryCodec、legacyPermissionRebase、cli/approval、osSandbox、toolPolicyResult对应测试。19套217项通过、exit0；`npm run build:cli` exit0。
独立代码审查APPROVE、架构CLEAR；代码审查另跑3套49项、exit0。反转五个行为owner到HEAD后62失败89通过，随后逐字节恢复（.tmp/approval-reversal.log）。

最终编译普通/全屏PTY各自完成两类验收：一次批准后同目标再询问，第二次拒绝后文件不变；allow-always后末尾空格的不同文件仍再询问并拒绝。四次运行均exit0，实际HTTP请求各3次，审批前无写入、终态stopped、持久化来源匹配。产物为.tmp/approval-pty-fjx64y_e与.tmp/approval-target-pty-u2adrhtz。
静态阻断门通过：1429文件零循环、config/declarations/node-floor通过；7个reachability与120个docs-source advisory保留。打包judge exit0，阻断义务满足，整体advisory verdict仍partial。

验证异常分类：最早两项失败因真实registry创建审计目录而与fixture目录断言冲突，改为精确检查文件集合；另一次9套42项报告通过后Node/V8原生崩溃exit134，不计为成功，最终单worker重跑覆盖全部相关套件。旧result-contract脚本与test:scripts本批未跑，前者仍作为W7-31债务。
所有本批测试使用仓内独立HOME/USERPROFILE/TMPDIR、CHEERS_SYNTHETIC_HOME、CHEERS_TEST_ROOT与npm cache；不使用真实provider配置。56df129c的CI 37115159213与Architecture Watch 37115159216均已成功。
W7-31仍未完成，继续处理审计表中的根绑定、取消终态、compact注入、readiness/凭据选择、background及直接行为断言缺口。


### W7-31 第二批：大小写不同的根目录绑定（2026-10-03）

`bootstrap`、`runtimeContext`、`startupSurfaceRenderer`原先统一小写比较，Linux上CaseRoot/caseroot被误认同根，`--migrate-session-root`也成为no-op。现仅Windows折叠，保留三个既有owner及SessionManager迁移流程。对照session cwd的resolved原始大小写相等决策；不引入文件系统探测或symlink别名重写。
隔离`npm run test -w packages/ts-shell -- --threads=false src/core/shell/bootstrap.test.ts src/core/shell/runtimeContext.test.ts src/core/shell/startupSurfaceRenderer.test.ts src/session/continuation/sessionProjectRootRebind.test.ts src/session/continuation/sessionRootRebase.test.ts`：5套56项、exit0；`npm run build:cli` exit0。独立APPROVE/CLEAR，代码审查另3套27项通过。反转三个owner为5失败22通过，随后精确恢复。
最终编译普通/全屏PTY先以不同大小写根请求同一session，两次都拒绝且零模型请求；显式迁移后每次2个本地HTTP请求，审批前无文件、批准后只写新根、重开绑定正确、终态success与来源一致。产物.tmp/root-case-pty-rqhj08xe，双模式exit0。
静态阻断门和judge阻断义务通过，已有advisory保留；无真实provider，旧result-contract及test:scripts未跑。当前比较按host策略，非Windows大小写不敏感文件系统可能仍需显式迁移，不声称真实Windows验收。
首批0428c2cc已推送；Architecture Watch 37118672620成功，CI 37118672630仍执行。W7-31继续取消终态、compact注入和其余Shell项目。

### W7-31 第三批：请求准入、一次注入与停止结果显示（2026-10-03）

沿用原注入planner/store与CLI→turn链路，增加只读prepare和同步accept。
durable prompt barrier、readiness、SessionStart/UserPromptSubmit检查通过且未取消之后，
在kernel.prompt前核对compact状态/检查点与memory状态generation，全部有效才消费或标记无效。
同ID重新暂存、检查点替换、异步检索期间驱逐均拒绝旧结果；失败保留当前pending供重试。
接纳只执行一次，模型后续失败不重复注入；runtime reentry不消费下一正常回合的暂存上下文。
旧planner直接调用的消费行为保留；generation对象身份契约写入既有store接口。

参考比较：本地参考的会话prompt先验证模型/凭据、完成启动扩展，再取pending next-turn消息，
交互终态把错误/取消与已生成正文分开显示。采纳顺序与显示语义；本仓保留durable barrier与独立注入store，未复制代码。

无terminal的空流、非终态流与取消流现先失败/中断，再决定输出，不再打印默认success。
实际PTY另揭示TurnSink忽略stopped query.completed，导致readiness已拒绝并落盘但交互屏幕为空。
同一停止结果投影现保留error/notice分类、partial answer、stopReason与显式retry；成功结果不添footer。

验证：在仓内隔离HOME/USERPROFILE/TMPDIR执行定向14套201项与build:ts，均exit0。
联合反转6个生产owner后28失败80通过（含6项停止显示回归），逐字节恢复后完整定向复跑通过。
静态门：1431文件值/类型图零环、config39/39、hooks18/18、factories10/10、Node地板通过；
reachability7与function-ceiling7为既有advisory。test:scripts 40/40通过。
独立代码与架构复核APPROVE/CLEAR；预设评审服务不可用后由两个独立同会话模型子代理完成，未以作者自评替代。
普通/全屏编译PTY通过真实hook阻断/取消、readiness拒绝、成功重试、两类上下文仅一次、终态消息来源匹配；
仅调用本地合成HTTP服务，产物.tmp/admission-pty-ahbsjr4f。首轮PTY失败归因于上述真实显示缺陷，未降低断言。

保证限于当前同步进程内store；不承诺跨进程注入持久化事务，也未改变dispatcher既有的hook handler异常政策。
旧result-contract脚本债务未在此批修复；W7-31其余已登记项及后续27→29→33/W8保持未完成。
第二批ebbcb7a8的CI 37119359176和Architecture Watch 37119359119已成功。
提交前docs严格门通过（0 dangling、旧120 source advisory）；内置judge exit0，图无环和无未解析specifier两义务满足，函数上限旧advisory使总体仍partial。

### W7-31 第四批：显式提供方连接选择（2026-10-03）

活动连接筛选增加显式provider匹配条件，避免选中另一provider后丢弃profile并跳过可用的匹配fallback。
沿用已有候选排序与凭据优先级：无显式provider仍采用活动连接，匹配活动连接优先，
CLI/env key与匹配连接端点/模型配对，匹配账号连接的优先级保留；无匹配凭据仍返回缺失。
参考对照为先按显式provider收窄候选再解析；本仓只修改原选择条件，没有复制或增加平行能力。

定向3套38项、build:ts通过；撤销该条件后4失败12通过，逐字节恢复。
独立代码APPROVE、架构CLEAR；普通/全屏编译PTY用另一provider的活动连接加显式--provider，
服务器断言实际请求地址与合成认证均来自匹配连接，并完成拒绝/阻断/取消后重试和一次上下文注入。
产物.tmp/connection-pty-adbsriyo；未访问真实provider或真实配置。W7-31剩余项保持未完成。


### W7-31 第五批：探测与生成的协议一致性（2026-10-04）

复用endpoint描述和authorization，按所选协议请求model-list资源；catalog提供默认地址，
不向通用回退主机发送区域/账号凭据。签名端点无model-list时只准入，由实际transport验证。
探测与生成持有同一catalog快照和续期凭据；自定义原生协议保留账号版本头并执行其声明的探测。
取消退出重试，清理响应体失败不改变已知HTTP分类。参考采用协议自己的key/Bearer语义与请求验证边界，未复制代码或增加第二套认证器。

隔离定向6套86项及build:ts通过；8文件反转10失败29通过后精确恢复，最终86项通过。
独立APPROVE/CLEAR；审查发现的响应体清理错误已修复，200/401/403回归覆盖。
静态阻断门及40项脚本测试通过，1432文件零循环；旧reachability7、ceiling7、docs-source120保留。
judge exit0、所有阻断义务满足，总体advisory仍partial。旧verify:result-contract未在此批运行或修复。

兼容协议普通/全屏PTY（.tmp/admission-pty-jxazndlj）与原生协议普通/全屏PTY
（.tmp/readiness-pty-bhbuf8mv）均exit0；后者服务器核对原生资源与认证头，验证失败重试、
memory仅一次及终态来源。无真实provider调用或配置访问。
原生初轮/compact因stream:true与res.json()不匹配失败，属于既有simple-body/compaction契约缺陷；
保留证据.tmp/readiness-pty-wm7w0wmn并转W7-27，与已登记的签名端点simple-call问题一并处理。
当前原生PTY不包含压缩成功证明，兼容侧继续覆盖压缩。
第三批2265b3b的CI 37132112387/Architecture Watch 37132112369，
第四批30ec3d3e的CI 37133598680/Architecture Watch 37133598681均成功。
W7-31与后续W7/W8仍在执行，Phase 18未完成。


### W7-31 第六批：后台输出与任务保留（2026-10-04）

既有sink改为字节有界tail、单次exclusive spill、反压等待与关闭结算；原前缀不再被隐形buffer无限保留，
失败不重开也不继续公布旧路径。Registry暂停两条管道，分别解码UTF-8；
进程关闭先释放PID控制，日志关闭后才发布完成。保留最近100个完成任务，活跃任务与磁盘文件不淘汰。
taskOutput描述同步说明保留范围，完成通知不再声称该工具能返回超出tail的全文。
参考决策为有界decoded tail、关闭文件后消费结果、有限后台历史及exclusive文件创建；保留现有模块与执行路径。

隔离定向output/tasks/settlement/backgroundTools/interactiveMode共5套53项、build:ts通过；
两owner反转8失败5通过，精确恢复后最终定向复跑。独立代码APPROVE、架构CLEAR，
后者指出的关闭后PID控制窗口已修复并保留stop拒绝回归。代码复核首轮服务限流，重试后完成独立审查。
静态阻断门通过、1433文件零环；旧reachability7/ceiling7/docs-source120保留；judge exit0、总体partial而阻断义务满足。

普通/全屏PTY各4次本地HTTP，审批前无启动标记，结束通知携带的完整日志可立即读，终态消息来源一致；
产物.tmp/background-pty-5r1lnx3j。驱动按既有idle队列规则在下一用户回合后接收通知，不声称自动启动回合。
两次PTY失败源于驱动转义与调度假设；单测mock和同步问题已修正，详见Shell审计。
无真实provider配置访问；慢存储会延迟完成，无新增磁盘额度或活跃任务并发额度。
旧result-contract脚本未在此批运行或修复；W7-31继续platform、直接行为断言，然后27→29→33/W8。
第五批63053ae9的CI 37136729912与Architecture Watch 37136729939均成功。


### W7-31 第七批：Shell发现与选择事实（2026-10-04）

已知bash/sh及校验后的PATH结果决定执行，不把任意登录SHELL按bash解释。
缺失、目录、不可执行候选均不可用，Windows不再预设PowerShell存在；
强制选择先验证再保存，失败保持旧选择。状态明确进程scope，继续走既有launch/sandbox。
参考采用实际可执行候选与bash→PATH→sh顺序；没有新增shell生命周期或第二执行器。

5套54项、build:ts及独立APPROVE/CLEAR通过；4文件反转8失败9通过，精确恢复并复跑。
静态阻断门与judge阻断义务通过，1433文件零环、旧advisory保留，总体仍partial。
普通/全屏PTY用会写错误标记的任意登录shell验证其未执行；不可用wsl选择本地拒绝，
后续bash审批、真实后台输出与终态来源一致，产物.tmp/platform-pty-c6ibh9s7。
初轮驱动未关闭status详情视图，修正交互步骤后通过。
Windows只做确定性候选测试，没有真实Windows/WSL验收；存在可执行文件不证明运行环境完整。
第六批ca48aab2的CI 37138807330与Architecture Watch 37138807377均成功。
W7-31继续直接行为测试与旧脚本，再按顺序推进后续任务。


### W7-31 第八批：直接行为断言与行模式退出（2026-10-04）

新增printPromptInput/shellActionBridge直接契约覆盖及idle close保留顺序测试。
编译基线的两类行模式处理器在idle SIGINT时同步重入，重复terminate/exit/resume且残留监听器，
缺少manager还会给已删除会话恢复提示。复用interactiveSignals增加统一关闭guard，
lineLoop只安装一次并传入实际会话查询；活动SIGINT取消语义不变，core默认契约未扩张。
参考采纳关闭幂等guard与按会话实际状态决定恢复提示，未创建新生命周期系统。

7套46项、build:ts及独立APPROVE/CLEAR通过；两个生产owner反转3失败，恢复后复跑。
混合终端编译CLI覆盖真正的行模式，空/保留会话分别0/1条resume提示，磁盘状态一致、exit0；
产物.tmp/line-close-nz63oe6y，无provider调用。静态阻断门与judge阻断义务满足，1436文件零环，总体仍partial。
初轮不支持的测试matcher已改为精确calls断言，再复现产品红测；未放宽验证。
W7-31的38模块直接行为矩阵已闭合，旧result-contract仍需修复，未将任务提前标完成。
第七批d0a8d7d7的CI 37140252338与Architecture Watch 37140252418均成功。


### W7-31 第九批：结果门禁及审计完成（2026-10-04）

保留npm入口，旧路径/名称过滤和合成echo markers改为六个当前套件及逐断言JSON核验。
隔离会话与结构化协议事实沿用参考的决策；真实源码CLI经本地HTTP执行五种读写/拒绝/准入场景，交叉核验随机内容、磁盘、审批和非空终态来源。
模型成功文字不能提升拒绝终态；readiness失败保持error，非流式print/replay不冒充PTY/安装产物证据。
门禁6套136项、脚本43项、build:cli与静态阻断门通过；撤销检查1失败2通过，精确恢复后136与3项复跑通过。
独立APPROVE，架构发现source ID可能同时缺失的断言漏洞已补非空检查并复核CLEAR；无产品代码或真实provider配置变更。
首轮stdin未关闭引起4超时，随后两项预期按现行error分类及finalOutput承载修正，未削弱拒绝/不写入判据。
eaab164d远端CI37141669601唯一失败为旧interactiveLoop mock缺sessionExists，本批补齐且2项通过；Architecture Watch37141669607成功。
W7-31完成，继续27→29→33及剩余W8；Phase 18未完成。细节见Shell审计第九批。


### W7-27 首批：单次请求的响应格式（2026-10-04）

原生消息simple body固定stream:true，签名会话simple URL固定converse-stream，两者都与已有JSON消费者冲突。
端点owner现显式输出stream:false或/converse；主turn仍默认stream，simple消息同时保留supportsTemperature能力约束。
参考实现的决策是请求模式和reader配对；本仓同意该不变量，但保留现有单次JSON消费路径，不把摘要改成第二套流式编排。
官方消息SDK的非流式参数与签名会话API的/converse定义补足单次路径依据。既有认证头、最终URL签名和signal传递均保留。

7套114项、build:cli与静态阻断门通过，test:scripts43项通过；两owner撤销后5失败2通过，逐字节恢复并复跑114项。
独立APPROVE/CLEAR。普通/全屏编译PTY均验证原生compact生成并持久化checkpoint，下一次实际HTTP请求收到摘要及一次注入，拒绝/取消/重试与终态来源保持正确。
产物.tmp/simple-pty-2whpgm10，两模式exit0，无真实provider访问。签名会话仅合成transport验证，本批不声称真实云服务运行。
PTY初次断言错误要求摘要位于最后user消息；请求证据确认它位于历史checkpoint，当前user承载注入标记，随后按两个实际来源断言通过。
NormProof阻断义务满足、整体advisory仍partial。W7-27逐字段表、完整流边界、用量与逐路径超时/取消审计继续，Phase18未完成。
W7-31提交9d4a4cbf的CI37143499101与Architecture Watch37143499107均成功。


### W8-36 / PRV-14：SSE多行数据（随W7-27，2026-10-04）

两个原生文本协议的data解码改为按CRLF/CR/LF分行，只去冒号后的一个可选空格，再以换行连接。
对照参考的decodeSseLine/flushSseEvent，这三项决策全部一致；保留现有坏JSON忽略政策，不借此扩展完整SSE生命周期承诺。
新增8项逐字节回归覆盖中文、三种换行、合法多行JSON及无效字符串不能跨行拼成未发送的文本；基线与撤销均4失败4通过。
两个owner精确恢复后，6套161项在新隔离HOME连续两遍通过；build:cli、静态阻断门和43项脚本通过，独立APPROVE/CLEAR。
首次复跑1失败160通过归测试隔离：两个thinking fixture没有项目标记，仓内TMPDIR让状态写到父项目；各加.agents根标记后连续通过。
普通/全屏编译PTY使用CRLF多行HTTP事件，伪拼接文本未入终端/会话，原生compact、拒绝/取消/重试及终态来源均通过；产物.tmp/sse-pty-3e8fia14，无真实provider。
本批完成W8-36并独立提交；EOF/终止帧、完整形状与超时用量矩阵仍属W7-27后续，不记为已完成。
b805f63e的CI37144756195与Architecture Watch37144756229均成功。


### W8-37 / PRV-15：跨层重试延迟（随W7-27，2026-10-04）

HTTP step在provider重试预算为零时仍把Retry-After解析值带入AssistantStep.requestedDelayMs；
默认负责重试的turn loop消费它，超等待上限时停止并保留原错误，已耗尽provider预算仍不触发第二层重试。
该字段只在step内传递，显式构造的持久化AgentMessage不携带它。继续复用现有解析、可重试判定和等待owner。
参考重试实现的服务器提示优先、超上限拒绝、0表示无服务器等待上限、可取消等待全部采用；保留本仓双层责任，不引入重复重试。

审查发现maxDelayMs=0直接把长等待传入Node定时器会溢出成1ms；同owner现分段至多2^31-1ms，剩余等待可取消。
新增跨step+loop测试覆盖seconds/ms优先/date、上限、无上限、长计时器、跨段取消与provider耗尽。
5套135项、build:cli、静态阻断门及43项脚本通过；三owner撤销7失败2通过，精确恢复后135项通过。
独立代码审查由REQUEST CHANGES转APPROVE，架构由WATCH转CLEAR；长等待与取消回归验证了修正。

普通/全屏编译CLI经本地HTTP实测第一次重试分别5.009/5.010秒；取消、90秒超上限均只发一次请求。
六场景均exit0，失败/取消持久化不冒充success；产物.tmp/retry-pty-_rpwngja，无真实provider。
初次PTY在超上限场景等待了错误的query.completed；核对现行失败投影为query.failed/lifecycle.error，按真实失败事件与error输出复跑通过。
本批完成W8-37并独立提交；W7-27其余字段、流生命周期、用量及超时矩阵继续。7509788d的CI37146300145与Architecture Watch37146300152均成功。


### W7-27 第二批：EOF完成证据（2026-10-04）

四协议不再把无结束信号的EOF当成成功；保留现有sentinel/finish兼容与两秒usage宽限。
原生消息尾帧及尾部error被读取，Google提前停止释放body；缺终态的工具不准入，已显示正文/思考不重试。
九套260项、build:cli、静态阻断门、43项脚本通过；四owner撤销19失败93通过，精确恢复复跑。
独立APPROVE/CLEAR；编译CLI三协议双模式12个HTTP/PTY场景通过，部分失败与成功终态来源正确。
首轮驱动把Google provider注册名写错，归类为harness问题并修正；未使用真实provider。
详见Provider审计表；本批不证明TLS/HTTP2或单文件可执行产物，W7-27其余矩阵继续。
2f44a914两项远端检查成功；NormProof阻断义务满足、整体advisory仍partial。


### W7-27 第三批：摘要与旁路端点签名（2026-10-04）

/btw与手动/自动/前缀/回退摘要复用主回合既有签名transport；由signer取凭据的端点不再要求静态key。
独立审查发现的cache warm间接准入扩大已修复，仍保留旧门槛；其自身签名/body审计继续。
真实本地HTTP HMAC验收发现Host遗漏非默认端口，核对官方SDK后改为签名完整authority，region解析不变。
九套136项、构建、静态阻断门与43项脚本通过；caller撤销10失败3通过、端口撤销1失败30通过，精确恢复最终复跑。
独立APPROVE/CLEAR。双模式编译PTY的/btw与/compact共四请求签名独立验证、摘要落盘，exit0，无真实provider。
4e6290c8两项远端检查成功；NormProof整体advisory仍partial。完整字段、用量及其余路径矩阵继续，见Provider审计。


### W7-27 第四批：Bedrock能力与二进制分流（2026-10-04）

vision=false复用文字fallback；thinking预算最多为caller上限减1024，低于1024省略，不提高输出上限。
消息转换拆到bedrock/messages.ts，两个owner函数名15/6；旧21超限消除。参考预算留答案空间的决定，保留本仓caller ceiling优先。
实际PTY揭示binary MIME被当JSON解析；补isEventStream分流，复用原端点reader。原失败保留，不归咎驱动。
定向6套170项、构建、静态阻断门和43项脚本通过；字段反转12失败91通过，分流反转3失败91通过，精确恢复后170项再通过。
独立APPROVE/CLEAR；双模式编译JS CLI本地HTTP共6场景验证字段和合法binary完成、单次请求与来源一致，无真实provider。
证据及参考差异见Provider审计第四批。a86e1936两项远端检查成功；W7-27剩余缓存刷新、最终流/timeout/cancel与usage继续。


### W7-27 第五批：缓存刷新生命周期（2026-10-04）

runner取消/结束后不再被旧await重新调度，新前缀与idle阶段转移取消旧刷新；迟到timer超半个预留margin时不发送。
参考现有run身份校验与调度deadline，保留当前失败后继续及经济性策略。四套61项、构建、静态阻断门及43项脚本通过；反转8失败11通过并精确恢复复跑，独立APPROVE/CLEAR。
普通PTY发现现有invocation未把runner转交turn，首次刷新未启动；本批不宣称CLI验收成功，诊断和原始证据见Provider审计第五批。
缺失接线与签名/协议正文/用量放在同一后续批修复，避免仅接线便启用未闭合的后台请求；W7-27仍进行中。


### W7-27 第六批：缓存刷新与用量闭合（2026-10-04）

invocation接入runner，每次成功step以本请求的用量准入；新step使旧prefix失效，无计量或失败不能借旧gauge刷新。
各endpoint拥有一token重放规则，保留catalog输出字段，拒绝预算式thinking；Google须证明thinking关闭。
刷新复用认证准备和最终body签名，整体替换认证头、保留gateway元数据，拒绝端点错配、过期run与取消结果。
Bedrock JSON补原生拒绝原因映射。共享计量区分inclusive与exclusive input，补cache和Google thoughts；
后台只累计费用和请求数，不改前台context/cache比较，持锁合并usage且不新增会话事件。

14套337项、CLI构建与43项脚本通过，独立APPROVE/CLEAR。三组反转13/11/15项失败，精确恢复后337项复跑通过。
普通/全屏编译CLI本地HTTP验证旧延迟刷新取消、新prefix持续刷新、后台4次用量持久化与500,000 context gauge不变；均exit0。
NormProof阻断义务满足、整体仍partial；细节、失败分类、算术和保证范围见Provider审计第六批。
c4eb2bd4两项远端检查成功。W7-27只剩最终流/timeout/cancel逐路径矩阵，再继续W7-29、W7-33和剩余W8。


### W7-27 第七批：流期限及审计完成（2026-10-04）

首个finish建立固定两秒usage宽限，心跳/重复finish不能续期；原reader直接cancel并解锁，避免return排在待读之后。
SSE矩阵补齐两个兼容入口及晚到usage，二进制补UTF-8与提前退出；共享fetch增加真实socket的握手超时、body停滞和取消连接证据。
直接5套138项、调用方15套315项与CLI构建通过；生产owner反转后三项回归全失败，精确恢复再跑138项通过，独立APPROVE/CLEAR。
普通/全屏编译CLI四场景通过：心跳约2.04秒完成并记录1207 tokens，body停滞约0.98秒失败、保留正文、不重试；连接关闭且终态来源正确。
仅本地HTTP与合成凭据。逐路径矩阵明确HTTP不活动时限、额外timer与caller取消；认证准备和无整体deadline的限制不被写成已消除。
静态门与43项脚本通过；NormProof阻断义务满足、整体advisory仍partial，详情见Provider审计第七批。
f2ee3c17的CI37171187869和Architecture Watch37171187862均成功。W7-27完成有界审计，继续W7-29→W7-33及剩余W8；Phase18未完成。

### W8-39 / SES-10：取消事件与非交互退出（2026-10-04）

采用既有`lifecycle.cancelled`，不新增同义`query.cancelled`类型：shell先记录事件、保存interrupted与清理运行句柄，
再向eventObservers发布同一事件。JSON订阅者因此收到唯一取消终止帧，正文和sourceEntryId仍由原持久化路径保存。
编译CLI验收发现SIGINT等退出原先直接关闭资源，未取消当前回合；启动接线复用`cancelAndWait()`，
先等回合结算，再关闭gateway及完成进程退出。原turn内部安静结束的契约不变，shell负责公共终态。

目标核验后定向比较本地参考`core/agent-session.ts`的abort→waitForIdle与公开事件广播，
及`modes/rpc/rpc-mode.ts`的await abort后回执：采用结算完成再对外确认，不复制其事件schema或signal特殊分支。
差异是本仓三种可捕获信号走同一既有资源清理入口；不可捕获终止、永不响应取消的外部hook不在保证范围。
两条shell回归先失败；补退出接线前，JSON CLI已有部分正文但没有取消帧。

最终8套132项与CLI构建通过，覆盖原print/replay成功、拒绝、readiness失败及三种信号取消。
编译入口直接子进程验证SIGINT/SIGTERM/SIGHUP退出130/143/129、唯一取消事件、无成功/失败混淆、
部分正文持久化、sourceEntryId对应助手消息、单次请求且连接关闭。测试要求先构建，与CI顺序一致。
初始SIGHUP测试经加载器包装进程无法准确传递信号，归为测试驱动问题；直接编译入口三项通过。
两生产owner反转并重建后五项全部失败，字节恢复、重建后132项复跑通过。
静态阻断门与43项脚本通过；NormProof阻断义务满足、整体partial，既有六项职责上限提示保留。
证据在`.tmp/cancellation-check/`；本批无PTY或独立审查结论，远端验证待完成。

W7-29的0f2b552b两项远端检查成功并收口；W7-33当前门禁auth失败，保证范围见Provider审计。
Phase18仍有W8其余条目与真实传输验收未完成。
原标称Node20.3的编译CLI三信号测试实际运行于Node24；该版本声明撤回，明确路径的重新验证见下节。

### W8-39补验：Node最低版本与主题资源（2026-10-04）

8d1fd664的CI37211647799失败：5307通过、3失败、1跳过，三失败均为新增编译CLI取消测试。
失败发生在主题JSON的`with { type: "json" }`导入，Node20.3解析阶段即退出，与取消结算代码无关。
此前标称Node20.3的`npm exec --package=node@20.3.0 -- node ...`实际启动本机v24.15.0；
因此撤回那条本地Node20.3通过声明。现在使用下载到仓内的明确二进制路径，并先确认`--version`为v20.3.0。

主题assets owner集中原生JSON加载，静态require供打包器内嵌，Node ESM使用createRequire回退；
不改主题数据、Node版本下限、构建脚本或包脚本。参考原生资源解析及独立可执行资源处理后自研该兼容接线。
单纯createRequire版本曾在二进制中缺少dark.json，未作为完成结果；最终同时覆盖原生Node与打包资源。
明确Node20.3的旧编译产物三项失败，修复重建后三项通过；独立二进制在隔离目录完成`--version`与`/theme list`，四套预设均存在。
证据在`.tmp/node-floor/`；W8-39最终远端验证随新提交继续。

### W8-41 / TOL-12：MCP plan准入与展示共源（2026-10-04）

registry保留MCP的严格布尔readOnlyHint，主回合和子代理把同一个工具池交给工具门。
缺失、false或字符串true不能解除plan禁止；true只改变plan资格，不跳过既有permissionScope、用户拒绝和PreToolUse。
工具池之外的工具与子代理未继承工具仍不能执行。

目标核验后定向比较本地策略参考的`policy/policies/plan.toml:82-93`：标注只读的MCP覆盖plan拒绝，
但决策仍为ask_user；非交互不能靠提示自授权。本仓沿用既有显式权限scope，ask时需实际批准，无handler仍拒绝。
把plan资格与参数检查收回既有toolPolicy owner，删除turn与/tools两份清单。
/tools的task改为blocked，browser与bash显示read-only，且明确仍受会话权限限制。
当前/tools工具池仍是默认registry；动态MCP、skills和配置过滤属于紧接着的W8-42，不在本项冒充完成。

测试覆盖严格布尔准入、批准/拒绝、无handler、全部内置工具展示与实际门一致、主回合与子代理接线；
CLI invocation经过真实stdio JSON-RPC夹具，仅批准时产生tools/call，模型step为合成注入，无真实provider。
两处新夹具错误（缺mcp__前缀、未给子代理继承工具）修正后通过，未放宽产品继承规则。
七生产文件反转后7失败3通过，字节恢复后10条新增回归通过；证据`.tmp/tools-plan-check/`。
明确路径Node20.3、正确包工作目录下最终16套244项全部通过，CLI构建与独立二进制构建/主题列表验收通过。
首次直接从仓根启动Vitest造成MCP相对夹具路径错误；无项目主题用例则继承仓库祖先标记。
前者修正驱动工作目录，后者在该用例显式模拟无根标记，保留原行为断言，不修改产品目录发现策略。
静态阻断门、43项脚本和NormProof阻断义务通过，整体advisory仍partial。远端验证待完成；本批无PTY或独立审查结论。

### W8-42 / TOL-13：当前工具池展示（2026-10-04）

把原模型入口的技能发现、MCP快照与工具过滤迁入`core/tools/catalog.ts`，模型与命令共用该owner。
CLI通过延迟getToolPool连接交互、管道和print命令入口，每次检查读取当前runtimeConfig、skillOptions与项目根。
复用已有gateway；仅在没有host gateway且显式启用MCP时创建临时gateway，并在读取后关闭。
命令只检查工具，不调用execute；禁用MCP不请求snapshot，空allowedTools保持空池。

目标核验后对照参考会话的getActiveToolNames与getAllTools：前者来自实际模型工具，后者是完整定义，二者不能混称。
本仓选择复用下一次调用的构建规则与当前snapshot，不新增常驻缓存，也不承诺检查后外部配置/服务器再变化时仍一致。
技能表现为既有skill工具和可加载目录，不把每个技能伪造为独立工具；MCP名称保持大小写，详情来自当前池。
未注入CLI上下文的独立命令调用仍可查看默认registry，这是兼容回退，不是已连接服务器的声明。

新测试对比命令列表和模型池，验证技能、MCP、禁用项、隐藏前缀、空白名单及配置替换；
三种命令入口均读取当前池。编译CLI通过真实stdio夹具与本地HTTP，确认两边均为同样三个工具，
/tools没有模型请求或tools/call，两个进程的MCP均正常关闭；未访问真实provider。
初次CLI夹具继承仓库项目根，修正为独立Git根后通过，未修改产品根判定。
五处生产接线反转并重建后六条回归全部失败；精确恢复、重建后六条通过，证据`.tmp/tools-catalog-check/`。

前批d0f7dfe2的CI37213593791与Architecture Watch37213593777均成功，W8-39兼容修复与W8-41远端验证闭合。
最终明确路径Node20.3下12套120项通过，CLI构建、静态阻断门、43项脚本通过；NormProof阻断义务满足、整体advisory仍partial。
技能无项目根旧用例在仓内临时目录继承外层.git，改为用例内显式模拟无根标记后复跑全部120项，不改变产品发现策略。
本批无PTY或独立审查结论，远端验证待完成；W7-33认证门禁条件和W8其他未完项保持未完成。


### W8-43：网页资料收集与能力真实性（2026-10-05）

选择第43项的改名分支：主命令 `/web-research`，旧三个名字兼容；两个固定搜索、最多六个去重 URL、每页五行摘录。移除未被其他消费者依赖的递归研究、Jaccard投票与“verified”报告契约，逐页保留原文；不同URL不证明来源独立或内容正确。
失败搜索输出不能产生抓取目标；失败抓取不能形成证据；空内容与失败分别计数；只解析搜索结果URL字段，忽略查询/摘要中的链接；错误正文不进入报告。

参考比较：定点阅读 `/home/wang/projects/gemini-cli/packages/core/src/tools/web-search.ts:91-120,172-199`。其综述有真实模型调用、来源来自返回元数据、空结果及失败单独返回。本实现采用相同的证据/失败区分，但明确不提供模型综述；当前工具只有格式化URL字段，收集器只消费该字段而不对任意文本抽链。测试可反转这些失败准入与URL去重决定。既有pi无同等命令的结论不扩展为本轮广泛检索结论。

本地编译CLI使用合成网页响应（非真实网络/provider），两次命令各两次搜索、两次去重抓取；一页摘录、一页失败，原始错误正文不显示。无新PTY或独立审查结论。旧架构文档已改为当前真实能力及边界。

验证：明确Node20.3下4套72项、CLI构建、静态门及43项脚本通过。收集准入/去重与命令注册两文件反转5失败4通过，精确字节恢复后72项通过。NormProof阻断义务全部满足，整体advisory仍partial。证据 `.tmp/research-check/`，W8-42的CI仍在运行，Architecture Watch已通过。


### W8-44：将变更交给模型评审（2026-10-05）

命令返回既有prompt契约，notice只说明开始评审，不再打印固定清单充当结果；模型回合由既有主运行路径处理，不增加侧信道或重复请求。异步execFile固定参数读取Git；状态失败、diff失败与干净树分别处理，不吞错误后宣称干净。分开读取暂存和未暂存diff，支持首次提交前的暂存内容，也保留两份反向改动；未跟踪文件明确待模型读取，不伪称已审阅。diff每份24k字符、状态12k字符，超限明确提示补读；单次Git读取32MiB/10秒失败明确停止评审。

参考：现有commitCommandRuntime的prompt/notice交接契约；定点阅读 `/home/wang/projects/opencode/packages/opencode/src/command/template/review.txt` 的默认未提交范围、分别读取暂存/未暂存、未跟踪文件与完整上下文。采用这些决策，新增反向diff、未跟踪别名与首次提交前测试。未采用该模板的commit/branch/PR参数推断：本命令既有参数是focus，本轮保持其范围，不扩展接口。评审提示要求依据具体触发条件报告缺陷、未获证据则说明不完整，并保持只读；提示本身不是额外权限执行门。

验证：明确Node20.3下5套80项、CLI构建、静态门与43项脚本通过。单owner反转并重建后8项新增回归全失败；字节恢复重建后80项通过。编译CLI对本地HTTP合成模型：干净树零请求，有变更恰一次请求，实际请求含暂存diff/focus，输出模型答复，索引和文件不变。Git失败夹具曾因配置连status一起失败、缺失blob被工作树补足而不符合预设；改为同时缺失blob/工作文件、确认status仍可读后测试通过，未削弱产品断言。NormProof阻断义务满足、整体advisory仍partial；无新PTY或独立审查结论。证据 `.tmp/review-check/`。W8-43的Architecture Watch成功，CI仍在运行。


### TOL-11：异步有界内容搜索（2026-10-05）

快路径及二进制探测均复用 `runtime/execution/local.ts` 的spawn、进程组取消与结算，不另造进程执行平面。执行器新增可选原始stdout回调和关闭输出缓存开关，默认输出行为保持。grep用StringDecoder接收UTF-8分片、逐行解析JSON，保留最多limit条展示宽度文本；单条JSON缓冲上限为文件大小上限的六倍加64KiB，超限明确失败。每文件`--max-count`配合全局达到limit后的进程组取消，只有清理结算完成才返回有界匹配。

二进制探测每候选最多2秒，搜索默认30秒，均可取消；用户取消优先于已经到达的匹配。进程非零失败不再因有stdout而成功，也不再被回退扫描隐藏；只有未安装时使用既有文件遍历。回退路径增加await边界/每文件之间的取消观察，本轮不重写其JavaScript正则引擎。展示上限不是扫描完整性证明；超长JSON或不完整末行明确失败，格式解析仍沿用既有记录过滤规则。

定点对照 `/home/wang/projects/pi/packages/coding-agent/src/core/tools/grep.ts:168-265`：采用流式JSON、全局匹配上限后终止、外部取消优先、非零失败不冒充结果；区别是本仓复用执行器的进程组清理和结算，而非另设child.kill通道，并补原有文件大小约束和每文件max-count。测试用可控进程证明上限后PID退出、探测/搜索取消、超时与失败输出拒收；反转失败准入、max-count和输出缓存四个定向断言全失败。

测试夹具在仓内临时目录显式声明CommonJS，防止继承项目ESM后假报二进制未安装。编译CLI以本地HTTP模型返回真实grep工具调用，在10,000行文件上只回传3条匹配，原文件不变；该证据不代表真实provider或PTY验证。无独立审查结论。

验证：明确Node20.3、仓内隔离HOME/TMPDIR下8套51项通过，CLI构建、静态门和43项脚本通过。两owner反转四项定向断言全失败（其他12项未选），精确字节恢复后全51项通过。NormProof阻断义务全部满足、整体advisory仍partial；证据 `.tmp/grep-check/`。W8-44的CI仍在运行，Architecture Watch已通过。


### 完成验收第一批（2026-10-05）

最新编译产物在明确Node20.3、普通/全屏PTY各执行/tools、/web-research、旧名/deep-research、/review，合计8次。
三个本地命令不调用模型，review各一次请求；工具列表与模型schema相同，评审文件与索引不变，退出0。
运行时创建.ts-shell/prompt-history.txt是既有历史功能，早期探针把整个工作区无副作用作为前提导致误报；现精确断言评审目标和索引。
产物.tmp/phase18-commands-pty-ep9szrra。该证据补齐最近命令波的PTY缺口，不替代真实提供方验证。

目录清点：Shell38、memory38、context29均在矩阵具名；session四域当前46，补齐十个拆分owner的判据与回归入口。
建立phase-18-acceptance.md的44编号项+8小项验收表；未核对项明确待复核，Phase18未完成。
c8146b40两项远端检查成功，CI557文件/5339通过/1既有跳过。8a998664两项远端检查成功，CI559文件/5351通过/1既有跳过。


### 完成验收第二批：本地复核收口（2026-10-05）

逐项核对剩余执行位的当前测试断言及既有实施、反转、PTY记录，证据集中于 [完成验收核对](phase-18-acceptance.md)。
52项中51项有界证据已核对；readCache退役、锁同步边界适配和receipt保证修正均按后续裁决解释，未恢复旧承诺。
本轮可达性门exit0，906模块、7项既有advisory；仅修改文档，不重复构建/测试。W7-33外部auth条件持续，未取得用户可重试通知；整体仍未完成。
