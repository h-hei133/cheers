你说得对，**Pi 更像一个“基础 agent harness / runtime”而不是单纯的 coding CLI**。它真正值得参考的地方不是“有 read/bash/edit/write 这些工具”，而是它把一个 agent 系统里最容易变复杂的东西拆得很干净：**模型提供商、执行环境、工具调用、会话树、流式事件、扩展点、资源发现、UI** 都有相对清晰的边界。

下面我按“架构分层 → 核心运行链路 → 数据结构 → 扩展机制 → 优秀设计点 → 你做自己的 agent 时怎么参考”来整理。

---

# 1. 总体定位：Pi 的核心思想是“小核心 + 强扩展”

官方文档对 Pi 的定义非常关键：它是一个 **minimal terminal coding harness**，核心保持小，通过 TypeScript extensions、skills、prompt templates、themes、pi packages 来扩展能力。官方文档的 customization 目录也正好围绕 extensions、skills、prompt templates、themes、packages、custom models、custom providers 展开。([pi.dev][1])

这意味着 Pi 的架构理念不是：

> 把所有 agent 功能都做进核心。

而是：

> 核心只负责 agent loop、状态、工具、模型、会话、事件；具体 workflow 通过资源和扩展挂进去。

官方文档甚至明确说，它故意不内置 MCP、sub-agents、permission popups、plan mode、to-dos、background bash，而是把这些东西留给 extensions/packages 实现。([pi.dev][2])

这个取舍非常重要。很多 agent 项目一开始就把权限系统、计划模式、todo、远程执行、MCP、subagent、UI 状态全塞进核心，最后 runtime 变成一坨。Pi 的做法是：**核心稳定，workflow 外挂**。

---

# 2. Monorepo 分层结构

从仓库结构看，Pi 是一个 TypeScript monorepo。根 `package.json` 使用 npm workspaces，主 workspace 是 `packages/*`，另外还把若干 example extension package 放进 workspace；构建顺序是 `tui → ai → agent → coding-agent`，这说明底层 UI、LLM API、agent core、最终 coding CLI 是分层构建的。

可以把它理解为四层：

```text
┌──────────────────────────────────────────────┐
│ @earendil-works/pi-coding-agent              │
│ CLI / SDK / modes / built-in tools / loader  │
│ sessions UI / extensions / settings          │
└───────────────────────▲──────────────────────┘
                        │
┌───────────────────────┴──────────────────────┐
│ @earendil-works/pi-agent-core                 │
│ AgentHarness / agent loop / session tree      │
│ tool runtime / ExecutionEnv / compaction      │
└───────────────────────▲──────────────────────┘
                        │
┌───────────────────────┴──────────────────────┐
│ @earendil-works/pi-ai                         │
│ unified LLM API / providers / streaming       │
│ OpenAI / Anthropic / Google / Bedrock / etc.  │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ @earendil-works/pi-tui                        │
│ terminal rendering / editor / components      │
└──────────────────────────────────────────────┘
```

几个包的职责非常清晰：

**`@earendil-works/pi-ai`** 是统一 LLM API 层，描述里写的是 “Unified LLM API with automatic model discovery and provider configuration”。它导出了多个 provider adapter，包括 Anthropic、Azure OpenAI Responses、Google、Google Vertex、Mistral、OpenAI Responses、OpenAI Completions、Bedrock 等。

**`@earendil-works/pi-agent-core`** 是真正的 agent runtime，包描述是 “General-purpose agent with transport abstraction, state management, and attachment support”。它依赖 `pi-ai`，但不依赖 `coding-agent`，说明它是更通用的核心层。

**`@earendil-works/pi-coding-agent`** 是最终用户使用的 CLI/SDK 包，描述是 “Coding agent CLI with read, bash, edit, write tools and session management”，bin 命令是 `pi`，默认配置目录是 `.pi`。它依赖 `pi-agent-core`、`pi-ai`、`pi-tui`，并额外包含 docs、examples、themes、export-html 等面向产品化的东西。

**`@earendil-works/pi-tui`** 是终端 UI 库，描述里强调了 “differential rendering”，也就是高效的终端差量渲染。它作为独立包存在，说明 UI 能力不是直接硬编码在 agent loop 里的。

这套分层最值得学的是：**agent core 不应该知道 CLI 的存在，CLI 只是 runtime 的一个宿主。**

---

# 3. 核心运行时：AgentHarness 是 orchestration 层

Pi agent-core 里最重要的抽象是 `AgentHarness`。官方内部文档写得很直白：`AgentHarness` 是低层 agent loop 之上的 orchestration layer，负责 session persistence、runtime configuration、resource resolution、operation locking、extension-facing mutation semantics。

也就是说，Pi 把 agent runtime 分成两层：

```text
AgentHarness
  负责：状态、session、资源、模型配置、并发阶段、hooks、持久化、安全点

runAgentLoop
  负责：一次或多次 LLM turn、工具调用、流式事件、队列消息注入
```

这点非常优秀。很多项目会把“循环调用 LLM + 调工具 + 存 session + 改模型 + UI 事件 + 中断 + 分支”都写在一个大 loop 里。Pi 把它拆成：

- **low-level loop**：只关心消息、模型调用、工具调用、事件。
- **harness**：关心运行时快照、持久化、资源、hooks、并发安全。

---

## 3.1 AgentHarness 的四类状态

Pi 的 AgentHarness 文档明确把状态分成四类：

1. **Harness config**：最新 runtime config，例如 model、thinking level、tools、active tools、resources、stream options、system prompt。
2. **Turn snapshot**：一次 LLM turn 使用的冻结快照。
3. **Session**：已经持久化的 session entries。
4. **Pending session writes**：turn 正在运行时产生、但需要按顺序延后写入的变更。

这套设计是 Pi 的核心亮点之一。

为什么重要？因为 agent 是长时间运行的：用户可能在模型输出中途切模型、改 thinking level、开关工具、注入消息、扩展写 session。如果你直接修改当前请求用的状态，很容易出现：

- 当前 provider request 被中途篡改；
- 工具结果和 session 顺序不一致；
- UI 看到的状态和实际 LLM context 不一致；
- hooks 里改配置导致不可预测行为。

Pi 的解决方式是：

> runtime config 可以马上变，但只影响 **下一次 turn snapshot**，不影响当前 provider request。

文档明确说：setters 会立即更新 harness config，即使 turn 正在运行；这些变化影响下一次 turn snapshot，而不是当前正在运行的 provider request。

代码里 `createTurnState()` 也体现了这一点：它从 session build context、resources、session metadata、tools、active tools、system prompt callback、model、thinking level、stream options 构造一个完整 turn state。这个 state 包含 messages、resources、streamOptions、sessionId、systemPrompt、model、thinkingLevel、tools、activeTools。

---

## 3.2 操作阶段：phase 防止并发破坏

AgentHarness 有显式 phase：

```ts
type AgentHarnessPhase =
  | "idle"
  | "turn"
  | "compaction"
  | "branch_summary"
  | "retry";
```

结构性操作，例如 `prompt`、`skill`、`promptFromTemplate`、`compact`、`navigateTree`，要求 harness 必须处于 idle；而 `steer`、`followUp`、`nextTurn`、`abort` 和 runtime config setters 可以在 turn 中使用。

代码里也能看到这个规则：`prompt()`、`skill()`、`promptFromTemplate()` 都会先检查 `phase !== "idle"`，然后把 phase 设置成 `"turn"`，创建 turn state，再执行 turn。

这个设计特别适合你参考：**agent 不是普通 request/response，而是一个有生命周期的状态机**。不要只用一个 boolean `isRunning`；Pi 用 phase 表达不同结构性操作，避免 compaction、branch navigation、prompt 同时改 session 树。

---

## 3.3 save point：工具调用后的安全刷新点

Pi 的 save point 是另一个非常关键的设计。文档说 save point 发生在一个 assistant turn 及其 tool-result messages 完成之后；在 save point，harness 会：

1. flush pending session writes；
2. 如果 low-level loop 继续，创建新的 turn snapshot；
3. 把新的 context/model/thinking/stream/session id 应用于下一次 provider request。

代码里 `createLoopConfig()` 的 `prepareNextTurn` 正是这个机制：先 `flushPendingSessionWrites()`，然后 `createTurnState()`，再返回新的 context、model、thinkingLevel 给低层 loop。

这带来一个很优雅的行为：**用户在 agent 工作途中修改模型、thinking level、工具、资源，不会污染当前请求，但可以影响下一轮 LLM 调用**。

这个设计非常适合 coding agent，因为一个 assistant turn 可能是：

```text
assistant proposes tool calls
→ tool results
→ next LLM call
→ more tool calls
→ ...
```

如果没有 save point，你很难安全地在“工具执行后、下一次模型调用前”刷新状态。

---

# 4. 低层 agent loop：只处理 LLM turn、工具调用、消息事件

`packages/agent/src/agent-loop.ts` 顶部注释就说明了它的边界：agent loop 内部始终使用 `AgentMessage`，只在 LLM 调用边界转换成 provider 能理解的 `Message[]`。

它的核心流程是：

```text
runAgentLoop(prompts, context, config)
  emit agent_start
  emit turn_start
  emit prompt message_start/message_end
  runLoop(...)
```

`runLoop()` 内部是双层循环：

```text
outer loop:
  用于处理 follow-up messages

inner loop:
  while 有 tool calls 或 steering messages:
    1. 注入 pending steering messages
    2. stream assistant response
    3. 如果 assistant 请求工具，执行工具
    4. emit turn_end
    5. prepareNextTurn
    6. 检查 shouldStopAfterTurn
    7. drain steering queue

如果 agent 本来要停：
  检查 follow-up queue
  有 follow-up 就继续
  没有就 agent_end
```

代码中的 `runLoop()` 正是这个结构：先读取 steering messages，然后在内层循环里处理 pending messages、stream assistant、tool calls、turn_end、prepareNextTurn、shouldStopAfterTurn、steering drain；外层再处理 follow-up messages。

这和官方使用文档里的交互设计对应：用户在 agent 运行时按 Enter 会排入 steering message，等当前 assistant turn 的 tool calls 完成后送入；Alt+Enter 是 follow-up message，等 agent 完成所有工作后再送入；Escape abort。([pi.dev][2])

这点对 agent 产品很重要：**不要把用户中途输入粗暴地打断当前模型/工具执行，而是定义清楚 delivery mode**。Pi 至少区分了：

- `steer`：当前 assistant turn 工具调用结束后、下一次 LLM call 前注入；
- `followUp`：agent 没活了再注入；
- `nextTurn`：下一次用户主动 prompt 前插入。

extension API 里 `pi.sendMessage()` 也暴露了类似 delivery mode：`steer`、`followUp`、`nextTurn`。([pi.dev][3])

---

# 5. 工具系统：schema、hook、并发、partial update 都考虑到了

Pi 的工具接口不是一个简单函数，而是一个带 schema、UI label、参数兼容层、执行模式、partial update 的结构。

核心类型 `AgentTool` 继承自 `pi-ai` 的 `Tool<TParameters>`，并额外包含：

- `label`：UI 展示名；
- `prepareArguments`：schema validation 前的兼容 shim；
- `execute(toolCallId, params, signal, onUpdate)`；
- `executionMode?: "sequential" | "parallel"`。

工具结果 `AgentToolResult` 也不是纯文本，它包含：

- `content`: 返回给模型的 text/image content；
- `details`: 给日志、UI、状态恢复使用的结构化 payload；
- `terminate?: boolean`: 提示当前工具 batch 后是否停止。

这很值得学。很多 agent 框架只把 tool result 当字符串，导致后面 UI、session replay、state reconstruction 都很弱。Pi 的 `details` 字段让工具可以返回“给模型看的文本”和“给系统/扩展/UI看的结构化信息”。

---

## 5.1 工具调用执行链路

工具调用流程大概是：

```text
assistant message contains toolCall blocks
  ↓
find tool by name
  ↓
prepareArguments()
  ↓
validateToolArguments(schema)
  ↓
beforeToolCall hook: 可 block
  ↓
tool.execute(..., signal, onUpdate)
  ↓
afterToolCall hook: 可 patch content/details/isError/terminate
  ↓
emit tool_execution_end
  ↓
create toolResult message
```

代码里 `prepareToolCall()` 会查找工具、调用 `prepareArguments()`、做 schema validation、触发 `beforeToolCall`，并允许 hook block 工具调用。

`executePreparedToolCall()` 会调用工具的 `execute()`，并把 `onUpdate` 产生的 partial result 变成 `tool_execution_update` 事件；工具抛错会被转换成 error tool result。

`finalizeExecutedToolCall()` 再允许 `afterToolCall` 修改 content、details、isError、terminate。

这套 hook 点很完整：**before 可以拦截，execute 可以流式更新，after 可以改写结果**。

---

## 5.2 并行与顺序工具调用

Pi 默认支持并行工具调用，但不是无脑并行。`executeToolCalls()` 会检查全局 toolExecution 配置，或者某个工具是否声明 `executionMode === "sequential"`；只要需要顺序，就走 sequential，否则走 parallel。

parallel 模式下，Pi 会先顺序 prepare 每个 tool call，然后 allowed tools 并发执行，最后按 assistant 原始 tool call 顺序发 tool result message。

这个细节很强。它兼顾了：

- preflight/hook 顺序可控；
- 真实执行可以并发；
- 给模型看的 tool result 顺序稳定；
- 有些工具可以强制 sequential。

官方 extension 文档也特别提醒：如果自定义工具会改文件，需要使用与内置 `edit`/`write` 相同的 per-file mutation queue，否则并行工具可能读到同一个旧文件并互相覆盖。([pi.dev][3])

这说明 Pi 对 coding agent 的真实并发风险有实际经验，不只是“支持 parallel tool calls”这么简单。

---

# 6. 消息与事件模型：UI、持久化、扩展都靠事件驱动

Pi 的 `AgentEvent` 包含：

- `agent_start` / `agent_end`
- `turn_start` / `turn_end`
- `message_start` / `message_update` / `message_end`
- `tool_execution_start` / `tool_execution_update` / `tool_execution_end`

这套事件模型非常适合同时支撑：

- terminal UI；
- JSON event stream mode；
- RPC mode；
- session 持久化；
- extension hooks；
- export/share；
- 测试与 observability。

官方 extension 文档给出完整生命周期：从 `session_start`、`resources_discover`，到用户 prompt 的 input/skill/template/before_agent_start，再到 agent_start、message events、turn loop、provider hooks、tool hooks、agent_end，以及 session switch/fork/tree/compact/model/thinking events。([pi.dev][3])

这点你做自己的 agent 时非常值得参考：**不要把 UI 更新、持久化、hook 调用写死在 loop 里；用 event stream 做统一事实流。**

---

# 7. Session 设计：append-only JSONL + tree，而不是线性聊天记录

Pi 的 session 是我觉得最值得借鉴的一块。

官方 session format 文档说：session 存成 JSONL，每一行是带 `type` 的 JSON object；entries 通过 `id` / `parentId` 形成 tree，支持在同一个文件里原地 branching。([pi.dev][4])

文件位置大致是：

```text
~/.pi/agent/sessions/--<path>--/<timestamp>_<uuid>.jsonl
```

其中 `<path>` 是 working directory 经过编码后的路径。([pi.dev][4])

代码里的 `JsonlSessionStorage` 也是这样实现的：第一行是 session header，包含 `type: "session"`、`version: 3`、`id`、`timestamp`、`cwd`、可选 `parentSession`。

后续 entry 会 append 到文件，`appendEntry()` 写入 JSON line 后更新内存里的 entries、byId、labelsById、currentLeafId。

---

## 7.1 SessionTreeEntry 类型

agent-core 中的 session entry union 包含：

- `message`
- `thinking_level_change`
- `model_change`
- `active_tools_change`
- `compaction`
- `branch_summary`
- `custom`
- `custom_message`
- `label`
- `session_info`
- `leaf`

这比“只存 messages”强很多，因为 session 不只是聊天记录，而是完整执行轨迹：

```text
model changed
thinking level changed
tools changed
message appended
tool result appended
compaction happened
branch summary attached
extension persisted state
label added
leaf moved
```

这种 session 才能支持：

- resume；
- fork；
- tree navigation；
- branch summary；
- replay；
- audit；
- export；
- extension state restore。

---

## 7.2 active leaf 与原地分支

Pi 的 session 树有一个“当前 leaf”。代码里 `getPathToRoot(leafId)` 会从当前 leaf 沿 parentId 一路回到 root，再反向得到当前上下文路径。

`Session.moveTo(entryId, summary?)` 会把 leaf 移到某个 entry，并可选地追加一个 `branch_summary` entry。

官方 session 文档也说明：`/tree` 可以跳到之前任意点继续，不需要创建新文件；选择 user/custom message 时，会把 leaf 移到该消息的 parent，把文本放回 editor，让你编辑并提交，从而创建新分支。([pi.dev][5])

这比传统“fork 一个新 conversation”更精巧：**一个 session 文件就是一棵探索树**。

---

## 7.3 buildSessionContext：从树路径生成 LLM context

`buildSessionContext()` 的逻辑很关键：它遍历当前 branch path，恢复 thinkingLevel、model、activeToolNames、compaction，然后把 message/custom_message/branch_summary/compaction_summary 转成给 agent 用的消息列表。

官方 session format 文档也写了 context building 规则：从当前 leaf 到 root 收集 path，提取当前 model/thinking level；如果 path 上有 compaction，就先输出 summary，再输出 `firstKeptEntryId` 之后的消息；同时把 branch summary 和 custom message 转成相应消息格式。([pi.dev][4])

这说明 Pi 的 session 不是“展示用日志”，而是 **LLM context 的源数据结构**。

---

# 8. Compaction 与 branch summary：不是简单截断上下文

Pi 的 compaction 不是“超过 token 就删除前文”。它把 compaction 作为一种 session entry：

```ts
type: "compaction"
summary
firstKeptEntryId
tokensBefore
details?
fromHook?
```

代码中的 `Session.appendCompaction()` 会把 summary、firstKeptEntryId、tokensBefore、details、fromHook 作为持久化 entry 写入 session。

branch summary 也是 session entry，用于在 `/tree` 切换分支时保留离开分支的重要上下文。官方文档说明，当 `/tree` 从一个分支切到另一个分支时，Pi 可以总结被离开的分支，并把 summary 挂到新位置，避免完整 replay 被放弃的路径。([pi.dev][5])

AgentHarness 里 `compact()` 和 `navigateTree()` 都是结构性操作，需要 idle，且会触发 hooks：`session_before_compact`、`session_compact`、`session_before_tree`、`session_tree`。代码里 `compact()` 会先 prepareCompaction，允许 hook 取消或提供 compaction，然后 append compaction entry；`navigateTree()` 会收集 branch entries、可选生成 summary，再 move session leaf。

这个设计的优秀之处是：**上下文管理被建模为 session tree 上的结构性变更，而不是一次性字符串裁剪。**

---

# 9. Resource 系统：skills、prompt templates、packages 是“上下文与能力”的外部化

Pi 的 resources 不只是 extension。它把不同粒度的能力分成几类。

## 9.1 Skills：按需加载的能力包

官方文档说 skills 是 self-contained capability packages，agent 按需加载；一个 skill 可以包含 workflow、setup instructions、helper scripts、reference docs。([pi.dev][6])

代码里的 `Skill` interface 很简单但抓住了重点：

```ts
interface Skill {
  name: string;
  description: string;
  content: string;
  filePath: string;
  disableModelInvocation?: boolean;
}
```

其中 name、description、filePath 会插入 system prompt，content 是完整 skill 指令，`disableModelInvocation` 可以让 skill 不出现在模型可见列表里但仍允许显式调用。

这体现了一个很重要的“progressive disclosure”思路：**系统 prompt 里不塞所有长文档，只放 name/description/path；需要时再读完整 skill。**

---

## 9.2 Prompt templates：显式触发的 prompt 宏

Prompt templates 是 Markdown snippets，输入 `/name` 展开成完整 prompt；它们从 global/project/packages/settings/CLI 多个来源加载。([pi.dev][7])

代码中的 `PromptTemplate` 也保持极简：

```ts
interface PromptTemplate {
  name: string;
  description?: string;
  content: string;
}
```

资源容器 `AgentHarnessResources` 只包含：

```ts
{
  promptTemplates?: TPromptTemplate[];
  skills?: TSkill[];
}
```

这说明 agent-core 本身不关心资源从哪来，只接收已经加载好的资源。

---

## 9.3 Pi packages：把扩展能力打包分发

Pi packages 可以把 extensions、skills、prompt templates、themes 打包，通过 npm 或 git 分发，也可以在 `package.json` 的 `pi` key 下声明资源。([pi.dev][8])

这也是一个很好的产品化抽象：**extension 是单个行为，package 是可分发的能力集合**。

---

# 10. 模型/Provider 抽象：内置 provider + custom models + custom providers

`pi-ai` 层本身就支持多个 provider adapter；`package.json` exports 里能看到 Anthropic、OpenAI Responses、OpenAI Completions、Google、Google Vertex、Mistral、Bedrock 等模块。

上层文档还允许通过 `~/.pi/agent/models.json` 添加 custom models/providers，例如 Ollama、LM Studio、vLLM、代理服务等；本地模型最小配置可以只是 provider 的 baseUrl/api/apiKey/models。([pi.dev][9])

进一步，extensions 还可以通过 `pi.registerProvider()` 注册 custom provider，用于代理、私有部署、OAuth/SSO 或非标准 streaming API。([pi.dev][10])

AgentHarness 的 `createStreamFn()` 也体现了 provider 解耦：它在每次 provider request 前动态解析 auth，把 headers 合并进 stream options，触发 `before_provider_request` / `before_provider_payload` / `after_provider_response` hooks，然后调用 `streamSimple()`。

这点值得参考：**API key / OAuth token 不应该只在 session 开始时解析一次，而应该在每次 provider request 前解析**。长时间 coding agent 经常会经历大量工具执行，token 可能过期。

---

# 11. ExecutionEnv：把文件系统和 shell 抽象出来

Pi agent-core 里有 `ExecutionEnv` 抽象，它把 `FileSystem` 和 `Shell` 合在一起。

`FileSystem` 包括 readTextFile、readTextLines、readBinaryFile、writeFile、appendFile、fileInfo、listDir、canonicalPath、exists、createDir、remove、temp file/dir 等；文档注释明确要求这些操作 **不能 throw/reject**，所有失败都要返回 `Result<T, FileError>`。

`Shell.exec()` 同样返回 `Result<{ stdout; stderr; exitCode }, ExecutionError>`，而不是直接 throw。

这个设计对基础 agent 很重要。它允许：

- 本地执行；
- sandbox 执行；
- 远程执行；
- 测试时 mock；
- 浏览器/服务器端不同实现；
- 统一错误码。

同时 Pi 的错误策略也分层：低层能力和 helper 用 `Result<TValue, TError>` 表达预期失败，高层 orchestration API 比如 Session 和 AgentHarness 则 throw/reject，并归一化成 `AgentHarnessError`。

这是一种很实用的边界设计：**低层能力不要异常满天飞，高层 API 可以用异常表达操作失败。**

---

# 12. Extension 系统：这是 Pi 能作为“基础 agent”的关键

官方文档说 extensions 是 TypeScript modules，可以订阅 lifecycle events、注册 LLM 可调用工具、添加 commands 等；还可以做 event interception、用户交互、自定义 UI、session persistence、自定义 rendering。([pi.dev][3])

它暴露的能力非常完整：

- `pi.on(event, handler)`：订阅事件；
- `pi.registerTool(definition)`：注册工具；
- `pi.sendMessage()` / `pi.sendUserMessage()`：注入消息；
- `pi.appendEntry()`：持久化 extension state；
- `pi.registerCommand()`：注册 slash command；
- `pi.registerMessageRenderer()`：注册自定义消息渲染；
- `pi.getActiveTools()` / `pi.setActiveTools()`：动态调整工具；
- `pi.setModel()` / `pi.setThinkingLevel()`：动态改 runtime；
- `pi.registerProvider()`：注册 provider。([pi.dev][3]) ([pi.dev][3])

`pi.registerTool()` 还能在 extension load 后动态调用，新工具会立即刷新到当前 session，不需要 `/reload`；工具还支持 `promptSnippet` 和 `promptGuidelines` 影响默认 system prompt。([pi.dev][3])

更值得注意的是 state 管理建议：官方建议有状态 extension 把状态存到 tool result `details` 里，这样才能正确支持 branching；session_start 时从当前 branch 的 toolResult details 重建状态。([pi.dev][3])

这说明 Pi 对 extension state 和 session branch 的关系想得很细：**extension 的状态不能只是内存变量，否则 `/tree` 回到旧分支后状态会错；状态应该跟着 branch path 重建。**

---

# 13. SDK：CLI 不是唯一入口

官方 SDK 文档说 SDK 可以把 Pi 嵌进其他 Node.js 应用，用于自定义 UI、自动化 workflow、程序化测试 agent 行为等。它给出的 quick start 是创建 `AuthStorage`、`ModelRegistry`、`SessionManager`，然后 `createAgentSession()`，订阅 streaming events，再调用 `session.prompt()`。([pi.dev][11])

这说明 Pi 的产品形态不是只有 TUI：

```text
同一个 agent runtime
  ├─ interactive terminal
  ├─ print mode
  ├─ JSON event stream mode
  ├─ RPC mode
  └─ SDK embedding
```

这也是一个基础 agent 应该追求的结构：**UI/mode 是 adapter，不是 core。**

---

# 14. Pi 最优秀的设计点总结

我觉得 Pi 最值得作为参考的地方主要有这些。

## 14.1 “小核心”是真的落到了代码结构上

它不是文档上说小核心，代码也确实分成 `pi-ai`、`pi-agent-core`、`pi-coding-agent`、`pi-tui`。agent-core 只关心 runtime，不关心 CLI 细节；coding-agent 负责产品化外壳；ai 负责 provider；tui 负责终端组件。

你自己的项目也可以照这个方向拆：

```text
agent-core        # 运行时
agent-provider    # LLM provider abstraction
agent-cli         # CLI/TUI shell
agent-ui          # UI adapter
agent-sdk         # programmatic API
agent-extensions  # extension API and loader
```

## 14.2 Turn snapshot 机制非常成熟

“当前运行使用快照，配置修改影响下一次 turn”是长期运行 agent 必备机制。否则用户在 agent 工作途中切模型/工具/系统提示词，会导致不可预测状态。Pi 在 docs 和代码里都把这个机制做成一等概念。

## 14.3 Save point 是 agent loop 的关键同步点

Pi 没有在任意时间 flush 状态，而是在 assistant turn 和 tool results 完成后建立 save point。这个点既适合持久化，也适合刷新 context/model/thinking/tools。

这是你设计自己的 agent loop 时很应该借鉴的概念。

## 14.4 Session tree 比线性 transcript 更适合 coding agent

coding agent 的本质是探索：试方案 A、回退、试方案 B、保留 checkpoint、总结 abandoned branch。Pi 用 JSONL tree 解决这个问题，简单、可读、可审计、容易导出，也容易由外部工具解析。([pi.dev][4])

## 14.5 工具结果有 `details`，这让系统可恢复、可渲染、可扩展

`content` 给模型看，`details` 给系统/UI/extension 用。这个区分非常重要。比如 edit 工具可以给模型看摘要，同时在 details 里存 diff/patch；todo 工具可以给模型看“已添加”，同时在 details 里存完整 todo state。

## 14.6 Extension API 是真正的 middleware 层

Pi 的 extension 不只是“加几个工具”，而是能拦截 context、provider request、tool call、tool result、compaction、tree navigation，还能注册命令、UI、provider、message renderer。生命周期文档显示它几乎覆盖了 agent 运行的所有关键节点。([pi.dev][3])

## 14.7 它把“模型能力差异”放在 provider/model 层处理

custom models 里有 compat 设置，比如某些 OpenAI-compatible server 不支持 developer role 或 reasoning_effort，就可以通过配置关闭。([pi.dev][9])

这比在 agent prompt 或业务代码里到处判断模型强很多。

## 14.8 它承认并发工具写文件的风险

Pi 默认工具可以并行，但对 mutating file tools 提醒使用 per-file mutation queue。这是 coding agent 实战里非常关键的细节。([pi.dev][3])

## 14.9 `ExecutionEnv` 让 runtime 可以移植

只要实现 FileSystem + Shell，agent-core 理论上就可以跑在本地、sandbox、远程容器、测试内存环境里。这个抽象比直接到处用 `fs` 和 `child_process` 更适合作为基础 agent。

## 14.10 资源发现和能力分发是完整体系

Pi 不只是支持 extensions，还支持 skills、prompt templates、themes、packages、custom models/providers。它形成了一个“能力生态”的抽象：轻量 prompt 用 template，复杂 workflow 用 skill，代码扩展用 extension，组合分发用 package。([pi.dev][1])

---

# 15. 如果你要参考 Pi 做自己的基础 agent，我建议这样抽象

你可以把自己的基础 agent 拆成下面几个模块。

## 15.1 `AgentRuntime / AgentHarness`

职责：

```text
- 当前 model / reasoning / active tools / resources
- turn snapshot
- phase 状态机
- prompt / skill / template invocation
- steer / followUp / nextTurn queue
- abort / waitForIdle
- save point
- pending session writes
```

参考 Pi 的 `AgentHarnessOptions`，它把 env、session、tools、resources、systemPrompt、getApiKeyAndHeaders、streamOptions、model、thinkingLevel、activeToolNames、queue modes 都作为构造输入。

## 15.2 `AgentLoop`

职责：

```text
- append user prompt
- stream assistant message
- extract tool calls
- prepare / validate / execute tools
- emit lifecycle events
- after each turn call prepareNextTurn
- drain steering/follow-up queues
```

这层不应该知道 session 文件怎么存，也不应该知道 UI 怎么画。

## 15.3 `ToolRegistry`

工具定义建议至少包含：

```ts
interface Tool {
  name: string;
  label: string;
  description: string;
  parameters: Schema;
  prepareArguments?: (raw: unknown) => unknown;
  execute(
    callId: string,
    params: unknown,
    signal: AbortSignal,
    onUpdate: (partial: ToolResult) => void,
  ): Promise<ToolResult>;
  executionMode?: "parallel" | "sequential";
}
```

ToolResult 建议保留：

```ts
interface ToolResult {
  content: ModelVisibleContent[];
  details?: unknown;
  isError?: boolean;
  terminate?: boolean;
}
```

这基本就是 Pi 的精简版。

## 15.4 `SessionStore`

不要只做：

```json
[{ "role": "user" }, { "role": "assistant" }]
```

建议直接参考 Pi 做 append-only tree：

```ts
interface SessionEntryBase {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
}

type SessionEntry =
  | MessageEntry
  | ModelChangeEntry
  | ThinkingLevelChangeEntry
  | ActiveToolsChangeEntry
  | CompactionEntry
  | BranchSummaryEntry
  | CustomEntry
  | CustomMessageEntry
  | LabelEntry
  | LeafEntry;
```

关键点是：

```text
currentLeafId 决定当前上下文路径
appendEntry 默认把 parentId 指向 currentLeafId
moveTo(entryId) 通过 leaf entry 记录跳转
buildContext() 从 leaf 回溯到 root
```

## 15.5 `ExtensionBus`

至少提供这些 hook：

```text
before_agent_start
context
before_provider_request
before_provider_payload
after_provider_response
tool_call
tool_result
turn_end
session_before_compact
session_before_tree
```

Pi 的 `AgentHarnessEventResultMap` 很适合作为参考：不同事件有不同返回值，例如 context 可以返回替换后的 messages，tool_call 可以 block，tool_result 可以 patch，before_provider_request 可以 patch stream options。

## 15.6 `ResourceLoader`

把资源加载和 runtime 解耦：

```text
ResourceLoader
  ├─ loadExtensions()
  ├─ loadSkills()
  ├─ loadPromptTemplates()
  ├─ loadSystemPrompt()
  ├─ loadContextFiles()
  ├─ loadModels()
  └─ reload()
```

AgentRuntime 只接收 resolved resources，不关心资源来自全局目录、项目目录、npm package、git package 还是 CLI flag。

---

# 16. 可以直接“照抄”的几个设计原则

1. **所有模型请求前都从 snapshot 取状态，不直接读 mutable global state。**

2. **所有 session mutation 都 append entry，不原地修改历史。**

3. **branch 是 session 的一等能力，不是“复制一份聊天记录”。**

4. **工具返回值分成 model-visible `content` 和 system-visible `details`。**

5. **tool call hook 分 before/after；before 能 block，after 能 patch。**

6. **流式 assistant message、tool execution update、message persistence 统一走事件。**

7. **低层 FS/Shell 返回 Result，高层 Agent API 抛标准化错误。**

8. **extension state 应该能从当前 branch 的 session entries 重建。**

9. **用户中途输入不要只有“打断”一种语义，要区分 steer/followUp/nextTurn。**

10. **核心不要内置所有 workflow；permission gate、plan mode、todo、MCP、subagent 都做成扩展。**

---

# 17. 需要注意的边界

Pi 很适合作为基础 agent 参考，但有几个地方不要误解。

第一，它是 **coding agent 优先** 的设计。read/bash/edit/write、session tree、branch summary、compaction、context files 都非常适合代码工作流；如果你做的是通用业务 agent，仍然可以复用它的 harness/session/tool/hook 思路，但工具层和 UI 层要换。

第二，extension 安全边界要自己重视。官方文档明确提醒 extensions 运行时有完整系统权限，packages 也可能运行任意代码。([pi.dev][3]) ([pi.dev][8])

第三，Pi 自己的 AgentHarness 文档也标注了一些 planned/provisional 的点，例如部分 session facade、phase/settlement 语义、auto-compaction/retry 还在演进。文档里明确说 auto-compaction 和 retry decision points 尚未在 `AgentHarness` 中实现。

---

# 18. 最终评价

Pi 的架构优秀之处可以概括成一句话：

> 它不是把 agent 做成一个“聊天循环”，而是把 agent 做成一个可持久化、可分支、可扩展、可插拔 provider、可插拔工具、可事件化观察和干预的 runtime。

如果你要做自己的基础 agent，我最建议优先参考 Pi 的这四块：

1. **AgentHarness 的状态模型**：harness config、turn snapshot、session、pending writes。
2. **runAgentLoop 的 turn/tool/queue 结构**：stream → tool calls → tool results → save point → next turn。
3. **JSONL session tree**：append-only、id/parentId、active leaf、compaction/branch summary/custom entries。
4. **extension/hook/resource 体系**：核心小，workflow 外挂，能力可分发。

[1]: https://pi.dev/docs/latest "Pi Documentation · Docs · Pi"
[2]: https://pi.dev/docs/latest/usage "Using Pi · Docs · Pi"
[3]: https://pi.dev/docs/latest/extensions "Extensions · Docs · Pi"
[4]: https://pi.dev/docs/latest/session-format "Session File Format · Docs · Pi"
[5]: https://pi.dev/docs/latest/sessions "Sessions · Docs · Pi"
[6]: https://pi.dev/docs/latest/skills "Skills · Docs · Pi"
[7]: https://pi.dev/docs/latest/prompt-templates "Prompt Templates · Docs · Pi"
[8]: https://pi.dev/docs/latest/packages "Pi Packages · Docs · Pi"
[9]: https://pi.dev/docs/latest/models "Custom Models · Docs · Pi"
[10]: https://pi.dev/docs/latest/custom-provider "Custom Providers · Docs · Pi"
[11]: https://pi.dev/docs/latest/sdk "SDK · Docs · Pi"
