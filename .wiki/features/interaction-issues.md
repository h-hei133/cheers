# 交互体验问题：处理建议与理由（2026-09-20）

> **依据**：对 `/home/wang/projects/pi` 的两轮只读勘察（工具事件粒度、bash 流式、忙碌指示器），
> 以及我们自己的源码核对与实测。
> **性质**：P0（卡片收尾）、标签修复、P1（命令输出流式）**已施工**（见 §6）；
P2（按文件互斥）与其余建议**未施工**。

---

## 0. 先更正我自己上一轮的错误结论

提交 `6f726090` 的说明与 `.wiki/log.md` 里我写过：

> 「**整批结果才发事件（主因）** …… `Promise.all(...)` 之后才在循环里发结果」

**这个说法是错的。** 我重新读了源码：

```
core/agent/tools.ts:348    await emitExecutionEnd(emit, call, result.isError);   ← 在每个工具的闭包内
core/agent/tools.ts:360      ... await emitExecutionEnd(emit, call, result.isError);  ← 同样在闭包内
core/agent/tools.ts:358    const results = await Promise.all(pending.map((run) => run()));
core/agent/tools.ts:363      messages.push(await emitToolResultMessage(...));  ← 只有这一步在 Promise.all 之后
```

`emitExecutionEnd` **在闭包内**，所以它**确实**在该工具完成时立刻发出。
分批的只有**结果消息**（`toolResult`），而那一步是**协议要求**——见 §2。

**我的错误与原报告同源**：我把「结果消息在 `Promise.all` 之后」读成了「事件在 `Promise.all` 之后」，
因为没有把 `emitExecutionEnd` 放回它所在的闭包去读。

**真正的根因**是下一层：`emitExecutionEnd` 发得及时，**但投影层把它丢了**。

```
turn/projection.ts:50-54
  case "tool_execution_end": {
    const open = this.openCalls.get(event.toolCallId);
    if (open) open.isError = event.isError;
    return [];            ← 不产出任何 QueryEvent
  }
  case "message_end": {   ← tool.result 只在这里产生
```

**结论**：信号路径是满的，**投影层是漏的**。这才是我该写下的那句。

---

## 1. 你报的三个问题，现状已确认

| # | 问题 | 状态 | 证据 |
|---|---|---|---|
| 1 | CLI 卡死（转圈无法回复） | **已修** | 复现并修复：`0694b83f`。四种 provider 形态全部 ≤2s 退出（修复前无限挂死） |
| 2 | `working` 变 `thinking` 后一直显示 `thinking` | **已确诊，未修** | 实测复现，见 §3 |
| 3 | 工具多时卡顿、之后一次性全出 | **已确诊，未修** | 见 §2；我上一轮的归因有误，已在 §0 更正 |
| 4 | 我引入的 `[stream]` 刷屏 | **已修** | `bd19b5c0`，改为写文件 |

---

## 2. 问题 3：工具多时的卡顿

### 2.1 三个事实（均已核对源码 + 实测）

**事实 A：单工具的输出全程无流式。**
`daemon/client.ts` 用 `execFileAsync` 并在**进程退出时**才取 `{ stdout, stderr }`；
`adaptTools` / `runCommandTool` 都没有传任何 `onUpdate`。
→ 跑测试、跑构建期间，屏幕上**不会有任何中间输出**。这是「卡住」最直观的来源。

**事实 B：卡片只能等结果消息才关闭。**
`tool_execution_end` 被投影层丢弃（§0），而 `tool.result` 只在 `message_end` 产生，
`message_end` 要等 `Promise.all`。→ 卡片在整批结束前不关闭。
**这就是你说的「working 一直转」。**

**事实 C：结果消息的排序是协议要求，不是缺陷。**
`Promise.all` 之后按 assistant 源顺序发结果消息——**OpenAI 协议要求同一 assistant 消息的
tool results 顺序对应、且完整**。pi 也是这么做的（`agent-loop.ts:592-613`：先 `Promise.all`，
再按 `orderedFinalizedCalls` 顺序发）。**这一层不要动。**

**放大器**：`turn/session.ts:85` 的 `SEQUENTIAL_TOOLS = {bash, write, edit, task, browser}`——
批里只要有一个就**整批串行**。

### 2.2 pi 的做法（已核实）

| pi 的机制 | 位置 | 要点 |
|---|---|---|
| **生命周期事件即时发** | `agent-loop.ts:586` | `tool_execution_end` 在闭包内完成即发，UI 立刻更新卡片 |
| **结果消息仍整批有序** | `agent-loop.ts:592-613` | 与协议一致，**和我们相同** |
| **bash 流式输出** | `tools/bash.ts:248-302` | `onUpdate` 回调，**节流 100ms**（`renderers/bash.ts:19`） |
| **大输出落临时文件** | `output-accumulator.ts:54-61` | 内存保留滚动窗口，全量写临时文件，`truncateTail` |
| **不做整批串行** | —— | **没有任何内置工具**设 `executionMode: "sequential"` |
| **按文件互斥代替整批串行** | `file-mutation-queue.ts:32` | 只串行**同一文件**的写操作，其他照旧并行 |

**最值得学的两条**：
1. **它不靠整批串行保证写安全**，而是**按目标文件加互斥队列**——只有同一个文件被串行。
   我们一刀切串行整批，代价是工具一多就慢，而收益只是「避免两次写同一文件」。
2. **bash 的 `onUpdate` 节流到 100ms**——既有实时感，又不会因为每个字节都重绘而拖垮 TUI。

### 2.3 建议（按优先级，可分批）

| 优先 | 改动 | 理由 | 成本 | 风险 |
|---|---|---|---|---|
| **P0** | 让 `tool_execution_end` 产出卡片收尾事件（投影层不再丢弃） | 唯一能让卡片**实时关闭**的信号；pi 正是靠它。**一处改动，改在漏点而非信号源** | 小 | 低。需确认 `openCalls` 的 `isError` 记录不丢 |
| **P1** | bash 输出流式透传 + 节流（学 pi 的 100ms） | 「卡住」最直观的来源是**没有任何中间输出**。有进度感就不像卡死 | 中 | 中。要动工具协议加 `onUpdate`；节流值需实测 |
| **P2** | 用**按文件互斥队列**替代 `SEQUENTIAL_TOOLS` 整批串行 | pi 已证明可只锁同一文件。能显著降低工具密集时的总时长 | 中 | **中高**。`bash`/`task`/`browser` 的语义比文件写复杂，**不能直接照搬**；需逐个判断 |
| **P3** | 不动结果消息的整批有序语义 | 协议要求，pi 同样如此 | —— | 动了会坏 | 

**P0 为什么排第一**：改动最小、风险最低、直接消除「working 一直转」。
且它修的是**我上一轮标错的那个点**——真正的漏在投影层，不在发送时机。

**P2 需要谨慎**：`write`/`edit` 的文件互斥是清晰的；但 `bash` 可能改任意文件、
`task` 会派生子代理、`browser` 是外部状态。**建议 P2 只对 `write`/`edit` 落地**，
其余保持串行。

---

## 3. 问题 2：`thinking` 标签不切回

### 3.1 已实测复现

```
after begin:          working
after reasoning.delta: thinking
after message.delta:   thinking     ← 应该切回 working
```

### 3.2 根因：一段**不对称**

`cli/interactive/turnSink.ts` 里有两条开块路径，只有一条清标签：

| 路径 | 调用者 | 是否清理 |
|---|---|---|
| `openProse()` → `finalizeAssistant()` | `line()` | **会**（`:264` 置回 `working`，并把 thinking 块收尾） |
| `openAssistant()` | `chunk()`（`message.delta`） | **不会**（`:276-279`，只置 `assistant`，未动 `thinking` 与 `label`） |

`think()` 在 `:187` 置 `label = "thinking"`，而 `finalizeAssistant()` 在 `:264` 置回 `working`。
**流式回答走的是 `chunk()`，从不经过 `finalizeAssistant()`** → 标签卡在 `thinking`。

### 3.3 pi 的做法（已核实，且解释了为何我们没有这个 bug）

pi **把「忙碌指示器」与「思考内容」彻底分开**：

- 指示器是独立组件 `StatusIndicator`（`components/status-indicator.ts:9`），
  值域只有 `Working` / `Retrying` / `Compacting` / `Summarizing branch`——
  **没有 `thinking` 这个值**。
- **首次可见文本不清除、工具开始/结束也不清除**；只在 `agent_end` 清除
  （`interactive-mode.ts:3455-3459` `clearStatusIndicator("working")`）。
- 推理内容渲染在**另一个组件** `AssistantMessageComponent` 里（`components/assistant-message.ts`）。

**这就是结构性差异**：我们让**同一个字段**既表示「忙碌」又表示「在思考」，
于是必须有人负责在正确时机切回来——而那个时机在两条路径上不一致，就漏了。

### 3.4 建议

| 方案 | 做法 | 理由 | 成本 | 风险 |
|---|---|---|---|---|
| **A（推荐）** | 在 `openAssistant()` 里做与 `finalizeAssistant()` 相同的收尾 | 直接消除不对称；一次改一处 | 极小 | 低 |
| **B（更贴 pi）** | 忙碌标签**不再表示「在思考」**，`thinking` 只作为块存在 | 从结构上消除这类 bug；与 pi 一致 | 中 | 中。要确认用户是否依赖该标签传达「模型在推理」 |
| C | 仅在 `chunk()` 首帧置回 `working` | 最小改动 | 极小 | 低，但保留了耦合 |

**建议 A 立刻做、B 记录为方向**：A 是修 bug，B 是消除「同一个字段两种含义」的根因。
**B 有行为取舍**——有些用户正是靠 `thinking` 标签判断模型在推理，
所以 B 不该在没有确认的情况下直接上。

---

## 4. 已登记但未处理的既有事项（供一并决策）

| 项 | 来源 | 建议 |
|---|---|---|
| `#4` 跨压缩累积文件追踪 | `phase-2-execution.md:18` | 保持延后。独立小功能，不影响正确性 |
| `#6` per-model `reserveTokens`/`keepRecentTokens` | `phase-2-execution.md:20` | **建议优先于 #4**：现在 128k 模型会早压约 55,616 tokens，是真实的浪费 |
| 采样参数无测试覆盖 | `phase-1-execution.md` §2.3 | 保持记录。删掉那段管道测试仍绿，属测试盲区 |
| `tuiSettings.statusItems` 优先级变化 | `phase-1-execution.md` §3.2 | 保持记录（有意的行为变更） |

---

## 5. 未验证（如实说明）

1. **问题 3 的修复未经实机验证**——P0/P1 尚未施工。
2. **真实 provider 的流结束形态未直接观测**——问题 1 的修复基于协议与替身 provider；
   你说「正常回答」，与该修复一致，但我不把它写成「已确认」。
3. **P1 的节流取值（100ms）是从 pi 读来的，未在我们的 TUI 上实测**。
4. **P2 未评估**：我们没有 pi 那样的按文件互斥，但也没有证据表明 `write`/`edit`
   并发写同一文件会造成实际问题。**建议先测，再决定是否值得做。**

---

## 6. 施工记录（2026-09-20）

### 6.1 已落地

| 项 | 改动 | 位置 |
|---|---|---|
| **P0 卡片收尾** | 新增 `tool.settled` 事件；投影层不再丢弃 `tool_execution_end`；卡片 `settle()` 只标状态不关闭 | `core/query/runtime/events.ts`、`turn/projection.ts:50-66`、`cli/interactive/toolCards.ts`、`cli/interactive/turnSink.ts` |
| **标签不对称** | 抽出 `settleThinking()`，`openAssistant()` 与 `finalizeAssistant()` 共用 | `cli/interactive/turnSink.ts` |
| **P1 命令输出流式** | `ToolExecutionContext.onOutput` → `CommandExecutionRequest.onOutput` → `executeLocally` 用 `spawn` 边跑边转 → `tool_execution_update` → `tool.output` 事件 → 卡片 `append()` | `tools/types.ts`、`runtime/execution/{types,service}.ts`、`daemon/client.ts`、`turn/tools.ts`、`turn/projection.ts`、`core/tools/registry.ts` |
| **节流** | 输出缓冲 **100ms** 才重绘；**所有 chunk 都保留**，只限重绘频率。活动卡片最多保留 **40 行** | `cli/interactive/turnSink.ts`、`cli/interactive/toolCards.ts` |

**状态与内容分离**（P0 的关键取舍）：`tool.settled` 只表示「调用停了」，
`tool.result` 仍表示「输出是什么」。两者不可合并——`tool.result` 被**会话恢复**用来
核对未闭合调用（`session/recovery/sessionLifecycleReadModel.ts:27`），
改它的含义会破坏恢复。这一点是我在施工中核对消费者后才发现并调整的。

**为什么节流放在显示层而非工具层**：命令不应该知道重绘节奏。
工具只管把输出报出来，由界面决定多快画一次。

### 6.2 验证

| 门禁 | 结果 |
|---|---|
| `tsc -p tsconfig.build.json --noEmit` | 0 错误 |
| `npm run test:ts` | **491 文件 / 2765 通过 / 1 跳过 / 0 失败** |
| `verify:import-cycles` | 0 环 |
| 实机（真实 SSE + 工具调用） | 命令执行、输出回传正常 |

**四项反向验证**（证明测试真的在测修复）：

| 移除什么 | 结果 |
|---|---|
| 投影层的 `tool_execution_end` 产出 | `turn/session.test.ts` 失败 |
| 标签的 `settleThinking()` | `turnSink.test.ts` 2 项失败 |
| 适配器的 `onOutput` 传递 | `turn/session.test.ts` 失败 |
| 关卡片前的 flush | `turnSink.test.ts` 失败（`'c0\nc19'` 缺 `c10`） |

**其中一项反向验证暴露了我自己的测试缺陷**：我最初把 sink 测试写成直接投喂
`tool.settled`，于是把投影层改回「丢弃」时测试**仍然全绿**——测试没覆盖到真正的漏点。
补了 `turn/session.test.ts` 的整链测试后才具备判别力。

### 6.3 仍未施工

| 项 | 理由 |
|---|---|
| **P2 按文件互斥**替代整批串行 | 需先确认并发写同一文件是否真有问题；`bash`/`task`/`browser` 语义复杂，不能照搬 |
| 方案 B：标签不再表示「在思考」 | 有行为取舍，需用户确认 |
| Rust daemon 路径的流式 | 非默认执行面；`executeLocally` 已支持，daemon 未接 |

### 6.4 未验证（如实说明）

1. **P1 的端到端实机效果未在真实交互界面逐步观察**——我验证到「命令执行 + 输出经事件流回传」，
   但**没有逐帧确认卡片在终端上随命令逐步增长**。上面 §2.3 P1 的理由仍然成立，
   但「屏幕上的观感」这一条我无法仅凭事件流断言。
2. **100ms 节流值未在真实负载下实测**——取自参考实现，未在我们的 TUI 上量过。

---

## 7. P2：按文件互斥锁（2026-09-20 已施工）

### 7.1 先纠正我上一轮的判断

我上一轮说 P2 是「缺证据，先测」。**实测结果是：会真丢数据，是正确性 bug，不是性能问题。**

```
初始:  "ALPHA\nBETA\n"
两个 edit 并发改不同行
结果:  "AAA\nBETA\n"     ← 第二次修改消失
两次调用都返回 success
```

`edit`/`write` 是**读 → 改 → 写**（`registry.ts`）。两个并发：都读到同一份原文，
第二个基于**已被替换的旧内容**计算并写入 → 第一个的修改没了，**且无任何报错**。

### 7.2 关键发现：只给「写」加锁**没用**

这是本轮最重要的实测结论。我先只包了 `writeTextFile`：

```
结果:  "ALPHA\nBBB\n"   ← 仍然丢
```

**因为两个读都发生在写之前**，损害在那时已经决定。
锁必须覆盖**整个「读→改→写」**，而不只是写入这一步。

另一处实测：给工具层加锁后**死锁**（`Test timed out in 20000ms`）——
工具拿了锁，其内部的 `writeTextFile` **又拿同一把锁**。
这正是我在该模块注释里写下的那条警告，被我自己踩中。

### 7.3 落地方案

| 件 | 位置 | 作用 |
|---|---|---|
| `withFileLock(path, fn)` | `runtime/execution/fileLock.ts` | 按**规范化路径**串行；不同文件互不等待 |
| **可重入（按调用链）** | 同上 | 同一条链重复获取直接通过，否则死锁。用 `AsyncLocalStorage` 区分「同链」与「另一调用者」 |
| **锁键解析目录而非文件** | 同上 | 尚不存在的文件无法 `realpath`，而创建文件是常规操作；解析目录让同一文件在创建前后是同一个键 |
| 包住读改写 | `core/tools/registry.ts`（`edit`、`write`） | 锁在整个读改写之外 |
| 兜底 | `runtime/execution/service.ts`（`writeTextFile`） | 任何写入者自动获得**锁**——不经过 `edit`/`write` 的调用也被覆盖 |

**为什么锁放在 `runtime/execution/`**：它是 `writeTextFile`（唯一写入咽喉）所在层，
且只依赖 node 内置模块 —— 放在这里可被 `core/tools` 引用而**不引入循环**
（`core/tools` 本就从 `runtime/execution/service.js` 导入）。已过 `verify:import-cycles`。

**未收窄 `SEQUENTIAL_TOOLS`**：锁已经让安全变成**结构性**的，不再依赖那个名单。
收窄串行是**独立的提速收益**，应另行测量后再定，不与本次修复混在一起。

### 7.4 实测到的既有行为（不在本次范围）

`edit/multifile/model.ts:677` **并行写多个文件**（`Promise.allSettled`）。
不同文件安全；它还有自己的冲突检测（`:597-615`）。**未改动**，记录在案。

### 7.5 一处共享配置升级

`packages/ts-shell/tsconfig.json` 的 `lib`：`ES2022` → **`ES2024`**。

**理由**：`Promise.withResolvers`（Node 18.6+ 提供，本机 Node 24 确认存在）在 `ES2022` lib 下
不通过类型检查。**这是既有潜伏问题**：`entrypoints/cliRuntimeInvocation.test.ts:171` 早已使用它，
只因测试文件被 `tsconfig.build.json` 排除而未被发现。
**实测 ES2024 下零新增错误**，且修好了那处潜伏问题。

**注意**：`lib` **只影响类型检查，不影响运行时产物**，因此不可能改变程序行为。

### 7.6 验证

| 门禁 | 结果 |
|---|---|
| `tsc -p tsconfig.build.json --noEmit` | 0 错误 |
| `npm run test:ts` | **492 文件 / 2774 通过 / 1 跳过 / 0 失败** |
| `verify:import-cycles` | 0 环 |
| `verify:docs-drift:strict` | pass |

**反向验证**：把 `withFileLock` 改为直通 → **4 项测试失败**，
含丢更新回归（`expected 'ALPHA\nBBB\n' to include 'AAA'`）。
即锁与其回归测试都具备判别力，而非只描述现状。

**测试设计**：锁的测试用**门控 promise** 决定顺序，不用 `setTimeout` 等真实时间 ——
断言的是「实际发生的顺序」，而非「等了多久后的猜测」。

### 7.7 未验证

1. **未在真实交互会话中制造并发编辑**。验证在工具层与锁层完成，
   未观测到端到端「模型同时发起两个 edit」的实机场景。
2. **未测锁的性能开销**。设计上不同文件互不等待，但未量化。

---

## 8. P2 后续：两处自查发现的缺陷（2026-09-20）

用户问到「参考项目是怎么实现的」，我借此逐条对比，**发现我的实现与它不一致，而我的测试没有察觉**。

### 8.1 缺陷：我的锁键漏了符号链接

| | 「同一文件的另一个名字」是否同键 |
|---|---|
| 我的原实现（**只解析目录** + 文件名） | **不同键** ❌ |
| 参考实现（**先解析文件本身**） | 同键 ✅ |

**实测**：持锁于真实路径时，**通过符号链接的调用可以完整跑完**（`link completed WHILE real held: true`）——
即两次修改**真的并发**，正是丢更新的场景。

我原来的理由（「不存在的文件无法 `realpath`，而创建文件是常规操作」）**本身成立**，
但我据此选了「只解析目录」，**牺牲了符号链接这一条**。正确做法是先试文件、失败再退回目录。

**修复后两者都成立**：文件存在 → 解析文件（符号链接同键）；不存在 → 解析目录（键稳定）。

### 8.2 缺陷：我提交的符号链接测试是**假通过**

原测试只观察「第二次调用是否**开始**」，而 `withFileLock` 注册阶段本身含多次 `await`，
所以「尚未开始」既可能因为**在等锁**，也可能因为**还在注册** —— **两种情况无法区分**。

它因此对一个**完全不覆盖符号链接**的实现也报通过，给了我虚假信心。

**修复**：改为断言「不能被**完成** while 另一个持锁」，并自旋 `setImmediate` 给足注册时间。
**反向验证**：把锁键改回「只解析目录」→ 该测试**失败**（`expected true to be false`）。

### 8.3 方法教训

这与本项目此前反复出现的「证据停在第一层」同源：
**我验证了锁存在，但没有验证锁对不同名字都生效**。
测试**观察了错误的属性**（是否开始）而不是**需要的属性**（能否并发完成）。

### 8.4 验证

**492 文件 / 2774 通过 / 0 失败**；`tsc` 0 错误；0 import 环。
符号链接测试经反向验证具备判别力。

---

## 9. 命令执行：按新规则比对后发现的三个缺陷（2026-09-20）

按 §0 新增的项目规则，**动工前**先逐条比对了参考实现在「命令执行」上的决策。
结果发现三处，其中两处是既有缺陷。

### 9.1 缺陷 A：超时/取消只杀直接子进程 → 工具**永不返回**

**实测**：

| 命令 | 修复前 | 修复后 |
|---|---|---|
| `/bin/bash -c 'sleep 20'` | 807ms 返回 | 807ms 返回 |
| `/bin/bash -c 'sleep 20 & wait'` | **超过 60 秒不返回** | **810ms 返回** |

**根因**：`child.kill('SIGTERM')` 只杀直接子进程。它的**孙进程仍活着，且继承着
stdout/stderr 管道**；管道不关闭，`close` 事件永不触发，`executeLocally` 永不 resolve。

**用户感受**：工具卡住、模型等不到结果、回合挂住 —— 即你报告过的「卡住」。

**修法**：`detached: true` 让子进程成为进程组长，用 `process.kill(-pid)` 杀**整棵树**。
**复用我们已有的 `core/shell/platform/processTree.ts`** —— 它早就实现了
Windows `taskkill /T` 与 POSIX 进程组终止，**但只有它自己的测试在调用它**。
本该解决这个问题的代码一直在仓库里，只是没接上线。

### 9.2 缺陷 B：取消信号**从未传到本地执行**

`CommandExecutionRequest.abortSignal` 一直传到了 `runCommand`（`service.ts:163`），
但**只被 Rust 分支使用**；本地路径根本没把它传给 `executeLocally`。
所以本地命令**不可取消** —— 只能等超时。

### 9.3 缺陷 C：状态语义丢失

`'cancelled'` 早在 `daemon/types.ts:5` 就有，且 `service.ts:293`、`error.ts:28`
都已完整处理 —— **只是没人产出它**。取消被报成 `timeout`，把用户的决定说成了超时。

### 9.4 顺带消除的分歧：两条执行路径

原来有两条：有回调走 `spawn`、没回调走 `execFile`。**它们已经分叉** ——
被观察的那条学会了流式与杀进程组，没被观察的那条两样都没有。
**已合并为一条**。同一个职责有两套实现，必然漂移。

### 9.5 验证

| 门禁 | 结果 |
|---|---|
| `tsc -p tsconfig.build.json --noEmit` | 0 错误 |
| `npm run test:ts` | **492 文件 / 2776 通过 / 1 跳过 / 0 失败** |
| `verify:import-cycles` | 0 环 |
| `verify:docs-drift:strict` | pass |

**反向验证**：把杀进程组改回 `child.kill('SIGTERM')` → 新增的 2 项测试**各自挂死 15 秒**
（即修复前的真实行为），而带修复时共 12 项通过。

### 9.6 仍未做（已比对但未施工）

| 项 | 参考实现 | 我们 | 判断 |
|---|---|---|---|
| BOM / 换行符保持 | 读时拆分 BOM、探测换行风格并还原 | **不处理** —— 编辑 CRLF 文件会**静默改成 LF**，删 BOM 的行会把 BOM 带上 | **真实缺陷**，建议下一轮修 |
| 写入原子性 | 直接写（无 temp+rename） | 同样直接写 | **平手**，非缺陷 |
| 输出溢出 | 落临时文件，保留全量可读 | 已有 `truncateTail` + artifact | 已具备 |
| 行数上限 | 2000 行 / 50KB | 1500 行 / 50KB | 差异微小，不改 |
| 命令超时默认 | **无默认超时** | 60s | **我们有更好**，保留 |

---

## 10. 文件存储形态：BOM 与换行符（2026-09-20）

按项目规则，**动工前**先提取了参考实现在这件事上的决策，再对照我们的实现。

### 10.1 我先测错了：范围比我想的小

我最初判断「编辑 CRLF 文件会整体变成 LF」—— **实测不成立**。
因为替换只换匹配到的那一段，其余内容原样保留。三个用例：

| 用例 | 实测 |
|---|---|
| CRLF 文件、单行替换 | CRLF **保留** ✅ |
| BOM 文件、非首行替换 | BOM **保留** ✅ |
| BOM 文件、编辑**首行** | BOM **丢失** ❌ |

**真正的缺陷只有两处**（我把范围说大了，这是更正）：

1. **替换文本跨行时换行符混用** —— 模型写的是 `\n`，文件是 `\r\n`，
   插进去后得到 `"ALPHA\r\nB1\nB2\r\n"`，**同一文件两种换行并存**。
2. **编辑首行会丢掉 BOM**。

### 10.2 参考实现的决策（已逐条核实）

| 决策 | 做法 |
|---|---|
| 读出时 | 拆下 BOM，探测换行风格 |
| 匹配前 | **内容 + 模型给的 oldText/newText 全部归一化为 LF** |
| 写回时 | **整个文件**还原为该文件的换行风格，再接回 BOM |
| 换行探测 | 看**最先出现**的是 `\r\n` 还是 `\n`；无换行则按 LF |
| 未改动的行 | 按原文保留（我们本来就一致） |

**关键决策是「归一化后再匹配」**：模型不会去猜文件用哪种换行，
所以两种写法都必须能匹配上。

### 10.3 落地

| 件 | 位置 |
|---|---|
| `splitByteOrderMark` / `detectLineEnding` / `toUnixLines` / `withLineEnding` | `runtime/execution/fileText.ts` |
| `edit` 工具接上：读时拆分 → 归一化匹配 → 写时还原 | `core/tools/registry.ts` |
| 消除 2 处重复的归一化逻辑 | `edit/proposal/fencedEditPlanner.ts`、`edit/patch/plan/hunkSet.ts` |

**`withLineEnding` 内部会先归一化**，而不是要求调用者记得先做。
写测试时发现：输入若未归一化，会产生 `\r\r\n` —— **本该保护换行符的函数反而写出损坏的换行符**。
让它在结构上不可能出错，而不是靠约定。

### 10.4 施工中我引进的一个缺陷（已修）

接入 `processTree` 后，`cli-baseline.test.ts` 开始**间歇性失败**
（修复前 4 次中失败 1 次；作为对照，改动前跑 1 次通过）。

**根因**：`ProcessTreeManager` 在**构造函数里安装全局信号处理器**
（`SIGINT`/`SIGTERM`/`SIGHUP`/`exit`），而构造函数在**模块导入时**执行。
我把它导进 `daemon/client.ts` 后，**整个进程一启动就注册了这些处理器**，
改变了 CLI 自身的退出行为。

**修复**：改为**首次跟踪子进程时才安装**。不再跟踪时就不注册，`getTrackedCount()` 语义也更准确。
**修复后连跑 2 次全绿。**

### 10.5 验证

| 门禁 | 结果 |
|---|---|
| `tsc -p tsconfig.build.json --noEmit` | 0 错误 |
| `npm run test:ts` | **493 文件 / 2786 通过 / 1 跳过 / 0 失败** |
| `verify:import-cycles` | 0 环 |
| `verify:docs-drift:strict` | pass |

**反向验证**：把 `edit` 改回不处理 BOM/换行 →
`"writes every line with the file's own line ending"` 失败，
报出修复前的真实产物 `'ALPHA\r\nB1\nB2\r\n'`。

### 10.6 仍未做

| 项 | 参考实现 | 我们 | 判断 |
|---|---|---|---|
| `write` 工具的 BOM/换行 | **同样不处理**（它整份覆盖，本就不该保留旧形态） | 一致 | 平手 |
| CR-only（老 Mac）文件 | 归一化了但**不会还原** `\r` | 同样不还原 | 平手 |
| UTF-16 | **不支持** | 不支持 | 平手 |
| 读取时的 BOM | 原样交给模型 | 未查 | 待比对 |
| 超长单行 | 首行超限时提示改用 bash 读取 | 未查 | 待比对 |

---

## 11. 读取工具增强：BOM 剥离与超长单行防护（2026-09-20）

按项目规则与参考实现（Claude Code、Pi）决策比对后，对文件读取工具进行增强补全。

### 11.1 决策比对与发现

1. **读取文件时的 BOM**：
   - 参考实现中，Claude Code 采用在快速与流式读取前剥离 BOM（`raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw`），避免不可见的 `\uFEFF` 混入 prompt 或干扰模型比对。
   - 我们的 `edit` 在前一轮已做到了拆除 BOM 并在写入时还原，但模型如果在 `edit` 的 `oldText` 中意外带上或未带上 BOM，仍存在匹配不对称风险。
   - **改进**：
     - `read` 工具读取内容后，通过 `splitByteOrderMark` 显式剥离首字符 BOM 后再切分行与返回，模型永远获取干净文本；
     - `edit` 工具对模型传入的 `oldText` 与 `newText` 同样预先过滤可能复制进去的开头 BOM。

2. **超长单行（如混淆压缩后的 JS / 单行大 JSON / Base64）**：
   - 参考实现（Pi `truncate.ts` & `read.ts`）发现：当文件第一行单行体积即超过整体预算（50KB）时，传统逐行预算检查会导致返回 0 行或截断出超限内容。
   - Pi 的决策：判定 `firstLineBytes > maxBytes`，内容丢弃为 `""`，并返回可操作的建议提示：
     `[Line 1 is 1.2MB, exceeds 50.0KB limit. Use bash: sed -n '1p' file.js | head -c 50.0KB]`。
   - **改进**：
     - `truncateHead` 中增加 `firstLineExceedsLimit` 判定；
     - `read` 工具检测到该情况后，返回明确的指示行，告知具体行数、体积，并给出精准的 `bash sed | head -c` 可行回退方案，避免模型面对不可读内容发生阻塞或死循环。

### 11.2 验证

| 门禁 | 结果 |
|---|---|
| `tsc -p tsconfig.build.json --noEmit` | 0 错误 |
| `npm run test:ts` | **494 文件 / 2789 通过 / 1 跳过 / 0 失败** |
| `verify:import-cycles` | 0 环 |
| `verify:docs-drift:strict` | pass |
