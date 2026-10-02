---
title: "Phase 18 裁决：把 13 号册剩余的 21 条 OPEN 与 12 号四项未覆盖面分批落地"
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
> 条目定义与证据见 [`13-feature-and-defect-register.md`](13-feature-and-defect-register.md)。
>
> **本裁决的纪律**（沿用 Phase 17）：
> 1. 每条给出**形态**（改哪个文件、什么机制）+ **参考依据**或 `自研` 标记 + **撤销验证**方式；
> 2. **每项独立提交**，可单独撤销；
> 3. 凡「参考实现没有对应机制」的，**必须标 `自研`**，不得伪装成照搬；
> 4. 复核者（3 个只读子代理）的结论由主代理逐条复验，被推翻的如实记录在 §8。

---

## 1. 规模与分批

### 1.1 输入：24 个 `OPEN` 标题，逐一列出（不用推导数字）

登记册当前有 **24 个标 `OPEN` 的条目标题**、**23 个唯一 ID**——
差额来自 **`OBS-04` 出现两次**（§10 的 MCP 网关 与 §11bis 的 sidebar 事件流；
ID 冲突本身是待修缺陷，见 W6-23）。**逐一列出，避免再靠减法得出可争议的数字**：

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
| 11 | `OBS-03`（§11bis 的 sidebar 那条） | §11bis | W5-21 |
| 12 | `OBS-04`（§10 的 MCP 那条） | §10 | W3-11 |
| 13 | `OBS-04`（§11bis 的 sidebar 那条） | §11bis | **§5-R1**（只在做真分栏侧栏时才需要） |
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
       OBS-04/sidebar → §5-R1（只在做真分栏侧栏时才需要修）
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

⇒ Phase 18 输入 = **这 24 个标题** + 12 号 §10 的四项未覆盖面。
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
| **等待外部输入** | **0** | —（真实 provider 验证**已执行**，见 §9；W7-33 的 OpenAI/Anthropic 侧凭据已就位，仅 Google 侧缺另一家中转站） |

> **复核轮更新（2026-10-01）**：§10 对 §1–§9 做了证伪与补漏——**修正 4 条裁决**（`W7-30` 翻转为缺陷、
> `W5-19` 扩大范围、`W3-11` 前置裁决、`W4-14` 补第三条）、**新增 20 条缺陷**、
> **驳回 8 条子代理断言**。上表与 §10 的附计数为**复核轮后的口径**。

**裁剪原则**（按优先级）：
1. **错误承诺优先**——文案/命令说了却没做的（`CMD-03`/`CMD-04`/`CLI-01`/`LOP-01`/`BRW-04`/`OBS-03(sidebar)`）；
2. **参考侧有明确更优实现的**——只有 `TOL-07`（opencode 的 `writeIfUnchanged`）一条，排最前；
3. **同一改动点的多条目合并**——`CTX-02`+`CTX-08` 都在 memory surface 上；
   `CMD-03`/`CMD-06` 都在会话树入口上；`OBS-04(MCP)`+`SES-07`+`CTX-09` 都是「进程级 Map 生命周期」；
4. **成本与收益比**——「单点修复、全局收益」的排前。

### 1.3 与 12 号 §10 未覆盖面的对应

| 12 号 §10 项 | 本文处置 |
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
| **21** | `OBS-03`(sidebar) | 二选一：改名为 `/sidebar snapshot`（诚实；**默认取此**），或真接 tick 源（需 TUI 侧栏容器 = **产品决定**） | 无（`pi` 无此形态，`NOT-FOUND`） | 断言命令名与输出形态一致；若选改名，usage/补全/registry 三处同步 |
| **22** | `CDE-01` 口径漂移 | 登记册 §12 写「完全不可达 **12** 文件」而 Phase 17 §8.9 的最终闭包清单不同；**以 §8.9 为准**，在 §12 加一行说明 | — | 门禁 `check:call-reachability` 无新增 advisory |

### W6（文档收口）— 登记册自身的修正

| # | 条目 | 形态 |
|---|---|---|
| **23** | `13` 号册 `OBS-03`/`OBS-04` **编号冲突** | §10（MCP/钩子）与 §11bis（sidebar）各有一组同号条目，违反 §0.1「编号永不复用」。改 §11bis 为 `OBS-11`/`OBS-12`，全仓引用同步 |
| **24** | 登记册的四处数字更正 | `BRW-00`：`164` → **`167`**（差额 3 = Phase 17 `8adc76f9` 以 **rename** 从 `core/harness/` 迁入的 `browser/smoke/` 三模块）；`CTX-08`：**6** → **4 个同型缺陷 + 3 个部分派生 + 1 个模型面**（登记册把自己标 ✅ 的对照行算进了缺陷侧，原稿的「5」其表格也只列了 4 行）；`PRV-04`：改 `PARTIAL` 并写明剩余缺口；§12 的不可达数字加口径说明 |

---

### W7 — 跨轮次遗留的审计债务（**新增，2026-10-01 补入**）

> **为什么单独一波**：下面 9 项**不属于 13 号册的 `OPEN` 条目**——它们散落在
> 13 号册 §13.2「本轮未覆盖的面」、§16.4「仍然未覆盖的」与 §18「仍然未覆盖的四项」，
> 以及 `SES-08`/`PRV-06`/`BRW-06` 三个**按设计不带状态标记**的「未逐一核验的面」条目里。
> **因此它们逃过了「统计 `OPEN`」这一步**，在初稿里**一条都没有进入 Phase 18**。
> 主代理在对齐检查时发现，逐条核实后补入。
>
> **性质**：其中 **W7-1 是真正的遗漏**（有状态标记），其余 8 项是**跨轮次的审计债务**
> （Phase 11/12/13/16 各自都判「本轮范围外」，但**从未落到任何具体阶段**）。

| # | 条目 | 来源 | 形态 | 规模 |
|---|---|---|---|---|
| **25** | **`THM-03` 的剩余两半**（`auto` + 扩充令牌/主题数） | 13 册 `PARTIAL` | 令牌 32 → 对齐参考的规模（pi 56 / oh-my-pi 67）；`auto`（跟随系统外观）当前**声明了但被当 `undefined`**——参考用 OSC 10/11 + DEC 2031 探测。**Photon 17 已明确把这两半「按裁决延期」，但那延期从未落到任何阶段** | 2 个主题 JSON + `themes/index.ts` |
| **26** | `SES-08`：session 四域逐模块行为审计 | 13 册 `SES-08` + 12 册 §10 | `session/continuation`(16) / `recovery`(11) / `replay`(5) / `export`(4) = **36 个非测试模块**的**行为**正确性（往返、边界、损坏输入降级）。**前置研究 §7.3 只做了可达性**（16/16、10/11、4/5、4/4 可达；两个不可达 `types.ts` 是契约） | 36 模块 |
| **27** | `PRV-06`：四端点逐字段形状表 + 流边界矩阵（含 Bedrock 单次路径） | 13 册 `PRV-06` | (a) 四端点**逐字段**请求形状与参考的对照表；(b) 流解析**完整边界矩阵**（SSE 注释、`\r\n` 边界、无终止帧）；(c) 用量记账跨模型/跨 resume；(d) 超时与取消的**逐路径**覆盖（`provider/request/fetch.ts` 是否被所有路径使用） | 4 协议 |
| **28** | `BRW-06`：`receipt/**` 的保证强度 | 13 册 `BRW-06` | 9 个模块 / 1,447 行的**保证强度逐项核验**（`retention.ts` 的预算先扣 tombstone、`lock.ts:140-160` 的 `expiresAt`/`ownerId` 陈旧判定是本仓**正确实现**；但整族未逐项验） | 9 模块 |
| **29** | `memory/**`(36) + `context/**`(28) **逐模块**审计 | 13 册 §13.2 / §16.4 | 前置研究已覆盖 `CTX-02/06/07/08/09`（含 3 条 P1）；**其余模块的逐模块行为**未做 | 64 模块 |
| **30** | 子代理递归深度与**工具继承** | 13 册 §13.2 / §16.4 | ⚠️ **主代理本轮初查：工具继承已经接上了**——`core/subagents/runner.ts:135-142` 用 `subagentTools(definition, available)` 过滤并把选中的工具装进 `selected`，`NEVER_GIVEN`（`core/subagents/boundary.ts:17`）剥掉 `task`。**Phase 12/13 的记录（「与参考一致，不改」）需要复核是否仍然成立**；若无缺口，本条降级为「已核实健全，登记留档」 | 2 模块 |
| **31** | `core/shell`(37) 完整审计 | 13 册 §13.2 | 13 册 §13.2 明确记「`core/shell` 仍部分未覆盖」（补做轮只覆盖了内核循环）。**37 个非测试模块** | 37 模块 |
| **32** | `context/startup/**` + `readCache` 的**行为**验证 | 13 册 §18 | **有界性**已记 `CTX-09`（且 W3-13 会给它加上限），但**命中/失效语义未验**（`startupWarmContextCache` 的缓存命中判定、`readCache` 的「同一请求同一 mtime」谓词在真实编辑循环下的行为）。`context/startup/` 是 6 个非测试模块 | 6 模块 |
| **33** | provider 四端点**真实**流边界（TLS/HTTP2 层） | 13 册 §16.4 / §18 | 合成块覆盖了帧级；**TLS/HTTP2 层未覆盖**。⚠️ **凭据已就位**（§9 已跑通 openai 兼容与 Anthropic 原生两条路径）⇒ **OpenAI 兼容侧现在即可执行**；Anthropic 原生侧需给 `anthropic` provider 另配 baseUrl；**Google 侧该中转站不支持（405）**，需另一家 | 4 协议（本轮可执行 2/4） |

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
| **R1** | `OBS-04`(sidebar) / 真正的分栏侧栏 | (a) **改名 `/sidebar snapshot`**（诚实，成本一行）+ 保持文本面板；(b) 做真分栏侧栏（需 TUI 侧栏容器，牵动主屏契约） | **(a)** —— 与 Phase 15/16 两次 backlog 一致；`(b)` 是产品决定且体量大。**注意**：`(a)` 只能解决「名字承诺过多」，**不解决**「事件源只有命令」（§11.2 的另一条） |
| **R2** | 12 号 §10 的两项**深度审计**是否值得做（**对应执行位 W7-26**） | (a) 做：143 个 FIXTURE 模块的**逐行** real-vs-demo 判定 + 36 个 session 边界模块的行**为**正确性；(b) 不做，只保留前置研究的可达性分类与 36 模块可达性 | **(b)** —— 理由：`(a)` 的成本是**每模块一个判据**（Phase 12/13 已两次因成本判为「非本轮范围」），而**收益已被 `BRW-01`/`BRW-03` 的定位裁决覆盖**（夹具栈默认关闭是设计，不是缺陷）。⚠️ **原稿曾用「`ok: true` 只出现在夹具侧」当依据，该依据已被复核者推翻**（真实路径 `sessionManager`/`playwrightRuntime` 也有运行时 `ok: true`）⇒ **判决不变，但依据只剩「定位裁决」。** 若维护者要求 (a)，应作为**独立审计阶段**而非 Phase 18 的一波 |

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
| W5-21–W8 | 按 §2、§10 的完整执行表继续；合并重复问题但保留各项验收证据 | 待完成 |

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
| **12 号 §6 的 openai 侧「已复验（合成块）」结论** | ✅ **可升级为真实**（`stream` 分块形状与我们的读取器一致） | `curl` SSE 实测 |

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
> `TOL-10..13`、`CMD-09..13`、`TUI-10/11`、`OBS-13..15`、`SUB-01`，见 13 号册 §20）。

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
| **34** | `SUB-01`（`R10-1`） | 把 `definition.permissionMode` 穿进 `runSubagent` 建门（`agentMode: definition.permissionMode ?? 会话模式`）；`taskTool.ts:82` 的展示串改读**生效值** | `gemini-cli/.../policy-engine.ts:610` `check(…, subagent?, …)` | 在 build 会话派 `code-reviewer` ⇒ 其 `bash` 调用**被 plan 门拦**；展示与实际一致 |
| **35** | `PRV-13`（`R10-2`） | `googleGenAI` 的 `path` 加 `?alt=sse`（流式），并接出 `googlePath(model,false)`（非流式）；改 `googleGenAI.test.ts:65-67` | `googleVertex.ts:78` 同仓对照；`gemini-cli` 的 `alt:'sse'` | 「URL 与响应格式成对」的合成测试：流式 URL 以 `?alt=sse` 结尾且按 SSE 解码；非流式走单 JSON |
| **36** | `PRV-14` | 两处 `data:` 多行连接改 `join("\n")`（`anthropicMessages.ts:622-631`、`googleWire.ts:437-444`） | `pi/.../anthropic-messages.ts:409`；`gemini-cli/.../server.ts:510`；**同仓正确处** `turn/completion.ts:563` | 合成多行 `data:` 事件 ⇒ 解码后含 `\n` 且 JSON 可解析 |
| **37** | `PRV-15` | 把服务器 `requestedDelayMs` 带到 failed step（新字段），`core/agent/loop.ts:178` 的 `retryDelayMs(policy, attempt, undefined)` 改传它 | `pi/.../provider-retry.ts:51-70`（层内消费服务器延迟） | `429` + `Retry-After: 5` ⇒ 首次重试延迟 ≥5s |
| **38** | `SES-09`（`R10-4`） | 空/不可读锁用**远短**宽限（微秒窗口，建议 ≤5s）；或把获取等待上界提到陈旧阈值之上 | `自研`（`opencode` 的 heartbeat 治的是另一面） | 造零字节锁 ⇒ **不再** 1.2s 超时、也**不**等 60s |
| **39** | `SES-10` | 中止时**经 event channel 发终止帧**（新增 `query.cancelled` 或让 `lifecycle.cancelled` 走 `eventObservers` 通道） | `pi/.../agent-session.ts:2361-2371`（取消是正常生命周期状态） | `--json` 下中止一回合 ⇒ 事件流**以终止帧结束**；`turn/session.test.ts:114-128` 的旧断言需改 |
| **40** | `TOL-10` | `task` 工具终态按 `subagentFailure` 判定（有失败即 `success:false`） | `自研`（对照 `pi` 子代理扩展的结果判定） | 注入「步数耗尽但有叙述文本」的子代理 ⇒ 返回 `success:false` 且失败原因可见 |
| **41** | `TOL-12` | 读 MCP `annotations.readOnlyHint` 判只读；把 `/tools` 的 `ALLOWED_IN_PLAN` **从门派生**（同一常量） | `gemini-cli/.../policy-engine.ts:610`（按注解决策） | 只读 MCP 工具在 plan 模式**可调用**；`/tools` 的 plan 列与门**逐项一致**（新增一致性测试） |
| **42** | `TOL-13` | `/tools` 接受当前工具池（含 `mcpTools`/`skills`）或至少读 live 快照 | `自研` | 配 MCP 时 `/tools` 列出的数量与模型实际一致 |
| **43** | `CMD-09` | `/deep-research` 接模型做查询生成与综述（复用 `/btw` 的侧信道调用样板），或**去掉机制宣称**并改名 | `自研`（`pi` 无对等命令） | 报告正文**不含**「multi-agent tree search」等未做过的机制词 |
| **44** | `CMD-10` | `/review` 对齐 `/commit`：读 diff → 构造 prompt 回合，交模型评审 | `自研`（对照同仓 `/commit`） | `/review` 触发一次模型回合；不再打印固定清单 |

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
| `TOL-11` | `grep` 快路径改异步 `spawn` + 流式 + signal/timeout + `--max-count` | 随 `W7`（审计域），标 `自研` |

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

见 13 号册 §20.3（附实测证据）。一句话：**否定式断言（「从未被调用」「丢参数」）必须自己再 grep 一遍**——
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
`TUI-10/11`、`OBS-13/14/15`、`SUB-01`——**共 20 条**（13 号册 §20.1）。
