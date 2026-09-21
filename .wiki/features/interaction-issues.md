# 交互体验问题：处理建议与理由（2026-09-20）

> **依据**：对 `/home/wang/projects/pi` 的两轮只读勘察（工具事件粒度、bash 流式、忙碌指示器），
> 以及我们自己的源码核对与实测。
> **性质**：建议，未施工。每条含理由、证据、成本与风险。

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
