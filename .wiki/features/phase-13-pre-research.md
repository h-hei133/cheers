# Phase 13 前置研究：剩余可做项的实现方案

> **范围**：`08-*` §4 的 24 项里尚未完成的 7 项（M2/M3/M4/M5/M6 + D11 + D6）
> 中，维护者裁定**要做**的 5 项（M2/M3/M4/M5/M6），
> 加上 `phase-12-decisions.md` §8 登记的两个待办（T6 plan 恢复、T7 去重范围）
> 与递归深度。
>
> **方法**：4 个只读子代理对照 `~/projects/pi` 与 `~/projects/source-claudecode`
> 深探实现方案；**主代理逐条复现子代理的关键论断**（结论见 §7）。
> 本文只记录**核实过的**事实；未核实的标 `[INFERENCE]`。

---

## 0. 本轮候选集合与来源

| # | 项 | 来源 | 维护者裁定 |
|---|---|---|---|
| **M2** | 后台命令执行 | `08` §4.2 | **要做**（`phase-12-decisions.md` §13） |
| **M3** | OAuth Device Code（RFC 8628） | `08` §4.2 | **要做** |
| **M4** | AWS Bedrock 协议 | `08` §4.2 | **要做** |
| **M5** | Google GenAI / Vertex 协议 | `08` §4.2 | **要做** |
| **M6** | Copilot / Anthropic 订阅 OAuth | `08` §4.2 | **要做** |
| **T6** | 压缩后恢复 plan | `phase-12-decisions.md` §8 | 待裁决 |
| **T7** | 工具结果去重扩到 `read` 以外 | `phase-12-decisions.md` §8 | 待裁决 |
| **R1** | 子代理递归深度 | `phase-12-decisions.md` §14.2 | 待裁决 |

**不在本轮**：`D11`（中途换模型，维护者裁定不做）、`D6`（SSE 事件头，已证伪）、
`T17`（路由期命名，已裁决不做）。

---

## 1. 决定性约束：依赖面

**这是本轮最重要的约束，且它不是技术问题。**

| | 我们的 | pi 的 |
|---|---|---|
| 运行时依赖 | **6 个**（`grok-mermaid`/`ignore`/`picomatch`/`playwright-core`/`typescript`/`undici`） | 数十个 |
| Bedrock | — | **`@aws-sdk/client-bedrock-runtime`**（`pi/packages/ai/package.json:67`） |
| Vertex | — | **`@google/genai`**（同上 `:69`） |

**已有先例裁决**（`phase-3-decisions.md:131`）：

> 引入网络依赖（离线不可用）、供应链面（**下载并执行未经校验的第三方二进制**），
> 而我们的依赖面**只有 3 个**（已核实）。**不该为此破例**。

**推论**：M4/M5 **要么裸 HTTP 实现**（自己写 SigV4 与事件流解码），
**要么打破既有先例引入两个重型 SDK**。这是本阶段最需要维护者拍板的一点（见 §6）。

---

## 2. M2 — 后台命令执行

### 2.1 参考的两个设计（**已核实**）

**pi 的发行版 bash 工具根本没有后台参数**：

```
pi/packages/coding-agent/src/core/tools/bash.ts:39-40
  command: Type.String({ description: "Shell command to execute" }),
  timeout: Type.Optional(Type.Number({ ... })),
```
`grep run_in_background packages/coding-agent/src/core/tools/bash.ts` → **0**。
后台执行只在 pi 的**实验性** harness（`pico3`）里，走事务/调度器，**规模大得多**。

**Claude Code 才是完整设计**（**已核实存在**）：

| 部分 | 位置 |
|---|---|
| `run_in_background` 参数 | `tools/BashTool/BashTool.tsx:241` |
| `TaskOutputTool` | `tools/TaskOutputTool/TaskOutputTool.tsx:28` |
| `TaskStopTool` | `tools/TaskStopTool/TaskStopTool.ts:39` |
| 输出落盘 | `diskOutput.ts` |
| 完成通知注入 | `LocalShellTask.tsx:243` 的 `enqueueShellNotification`（`<task_notification>`） |

### 2.2 我们的现状（**已核实**）

| 事实 | 位置 |
|---|---|
| **孤儿进程清理已具备**——PID 追踪、进程组级联、信号处理器 | `core/shell/platform/processTree.ts:101-111`（`trackChildPid`/`killProcessTree`/`killAllTrackedProcesses`） |
| 子进程**已经是 detached**（POSIX） | `runtime/execution/local.ts:46` |
| 输出**全量进内存字符串** | `runtime/execution/local.ts:48-78`（`stdout += text`） |
| 事后截断 | `core/tools/truncation.ts`（`truncateTail`，1500 行 / 50KB） |
| bash 参数只有 `command` + `timeout` | `core/tools/registry.ts:715-722` |
| 明确声明「无 detached 执行模式」 | `cli/interactive/ambientFacts.ts:9` |

**结论**：**技术前提已具备**（孤儿进程不是问题），
缺的是**后台句柄 + 输出流式落盘 + 完成通知**三件事。

### 2.3 最小实现

| 新增 | 职责 |
|---|---|
| `core/shell/background/tasks.ts` | `BackgroundTaskManager`：`spawn()`（接 `trackChildPid`）、`list()`、`stop()`、`output(id)` |
| `core/shell/background/output.ts` | 滚动缓冲 + 超限落盘（参照 pi 的 `output-accumulator.ts`：内存保留 `2×maxBytes` 滚动尾，超限写临时文件） |
| bash 参数 `runInBackground` | `registry.ts` 的 bash schema 加一个布尔参数 |
| `taskOutput` / `taskStop` 两个工具 | 列出/停止/取输出 |
| 完成通知 | 复用现有 follow-up 队列（`turn/session.ts` 的 `getFollowUpMessages`），**不新造机制** |

**`ambientFacts.ts:9` 的注释必须同步更新**——它现在是一句假话。

---

## 3. M3 / M6 — OAuth Device Code 与订阅 OAuth

### 3.1 我们的现状（**已核实**）

| 已有 | 位置 |
|---|---|
| PKCE（RFC 7636，S256） | `core/auth/oauth/pkce.ts`（`createPkcePair`/`createState`） |
| 回环服务器回调 | `core/auth/oauth/callback.ts` |
| 登录与刷新 | `core/auth/oauth/flow.ts:80,124`（`runOAuthLogin`/`refreshOAuthTokens`） |
| 过期判断 | `flow.ts:148`（`isExpiring`） |
| **provider 名单硬编码** | `providers.ts:91-93` → `["openai", "google"]` |
| 账户认证类型 | `provider/request/authorization.ts:46-47` → 只有 `openai-chatgpt-account` / `google-gemini-account` |

**缺口**：**没有 RFC 8628 轮询状态机**（`grep device_code` → 0），
没有 Copilot token 交换，没有 Anthropic 订阅流程，provider 无法声明自己的认证机制。

### 3.2 参考实现（**已核实**）

**RFC 8628 状态机**（`pi/packages/ai/src/auth/oauth/device-code.ts`）：
- 缺 `interval` 时**默认 5 秒**（`:6` 的注释引用规范 3.2）
- `slow_down` → **间隔 +5 秒**（`:8` 引用规范 3.5）
- `authorization_pending` → 继续；`expired_token`/`access_denied` → 立即失败
- **可中断的 sleep**（`abortableSleep`），AbortSignal 贯穿

**Copilot**（`github-copilot.ts`，已核实）：
- token 端点 `https://api.${domain}/copilot_internal/v2/token`（`:60`）
- 从 token 里解 `proxy-ep=` 得到 API base（`:66-70`）
- 过期时间 `expires_at * 1000 - 5min`

**Anthropic 订阅**（`anthropic.ts`，已核实）：
- token 端点 `https://platform.claude.com/v1/oauth/token`（`:31`）
- **固定回调端口 53692**（`:33`）
- **token POST 用 `application/json`**（`:174`）——与我们现有的 form-encoded 不同
- 支持**手动粘贴回调 URL** 的降级路径

### 3.3 最小实现

| 新增 | 职责 |
|---|---|
| `core/auth/oauth/device.ts` | `pollDeviceCode()`：RFC 8628 状态机 + `abortableSleep` |
| `core/auth/oauth/copilot.ts` | `exchangeGitHubTokenForCopilot()`、`resolveCopilotBaseUrl()`、`refreshCopilotToken()` |
| `core/auth/oauth/anthropic.ts` | `anthropicOAuthConfig()`、`exchangeAnthropicCode()`、`refreshAnthropicToken()` |
| `flow.ts` 扩展 | token 交换支持 JSON 内容类型；支持手动粘贴回调 |
| `providers.ts` 重构 | 从硬编码数组改为**声明式注册**（`OAuthProviderConfig` 增加 `flow` 字段） |
| `authorization.ts` | 支持 `copilot-account` / `anthropic-account` |

### 3.4 可验证性（**这是本轮的关键论点**）

**「无账号」不等于「无法验证」**。以下**全部可离线单测**：

| 可测 | 怎么测 |
|---|---|
| RFC 8628 状态机 | **假授权服务器**：注入响应序列，断言轮询间隔、`slow_down` 行为、终止条件 |
| 请求形状 | 断言 device code 请求体、token 请求体、头部 |
| 回调解析 | 断言授权码/state 提取、错误路径 |
| token 交换与刷新 | 断言请求体、过期计算 |
| **不可测** | 真实 provider 是否接受（需账号） |

---

## 4. M4 / M5 — 两个新协议

### 4.1 决定性发现：**我们的端点契约撑不住**

`EndpointShape`（`provider/endpoints/kinds.ts:40-65`，**已核实**）：

```ts
readonly path: string;                                  // ← 静态
readonly headers: (apiKey: string) => Record<string, string>;  // ← 只有 apiKey
```

**Bedrock 与 Vertex 都要求 URL 里带 model**：
- Bedrock：`modelId` 在请求参数里（`pi/.../bedrock-converse-stream.ts:265`）
- Vertex：REST 路径是 `/v1beta/models/{model}:streamGenerateContent`（**已核实** `google-vertex.ts` 从 `model.baseUrl` 读，`google-generative-ai.ts:353-356`）

且 **Bedrock 需要 SigV4 签名**（`pi` 用 `@aws-sdk/client-bedrock-runtime`），
**Vertex 需要 ADC / service account 令牌获取**（异步）。

**即：M4/M5 不是 drop-in，契约必须先改。**

### 4.2 Bedrock 的差异（**已核实**）

| 维度 | 我们现有 | Bedrock |
|---|---|---|
| 认证 | `headers(apiKey)` | **SigV4 签名**（覆盖 method/path/body hash/date）或 Bearer |
| 流格式 | SSE（`\n\n` 分隔） | **`application/vnd.amazon.eventstream` 二进制帧** |
| URL | 静态 path | 含 `{modelId}` |
| 工具 | `tools[].function` | `toolConfig.tools[].toolSpec` |
| 工具调用 | `tool_calls` | `toolUse` |
| 工具结果 | `role: "tool"` | `toolResult` |

### 4.3 Vertex 的差异（**已核实**）

| 维度 | 我们现有 | Vertex / GenAI |
|---|---|---|
| 认证 | `apiKey` 头 | `x-goog-api-key` / ADC / service account |
| URL | 静态 path | `/v1beta/models/{model}:streamGenerateContent?alt=sse` |
| 角色名 | `assistant` | **`model`** |
| 工具调用 | `tool_calls` | `functionCall` |
| 工具结果 | `role: "tool"` | `functionResponse` |
| 推理 | `thinking` + signature | **`thoughtSignature` 必须往返** |

### 4.4 契约改法（**两个选项，见 §6 裁决点**）

| 选项 | 内容 | 代价 |
|---|---|---|
| **(a) 最小扩展** | `path` 改成 `(model) => string`；`headers` 改成 `(ctx) => headers \| Promise<headers>`，ctx 带 method/url/body | 改动小，**两个现有协议同步改**（各 1 处调用点） |
| **(b) 引入签名器抽象** | `headers` 换成 `sign(request) => Promise<Request>` | 更通用，但**为 2 个消费者造抽象** |

**倾向 (a)**：Bedrock 的 SigV4 是唯一需要「看 body」的消费者，
而它可以在自己的模块里实现——`headers` 只要能拿到 body 即可，不需要抽象成签名器。

---

## 5. T6 / T7 / R1 — 三个登记项（**两个前提有问题**）

### 5.1 T6「压缩后恢复 plan」——**前提不成立**

**子代理称**：plan 内容在压缩后丢失，模型会遗忘计划。

**主代理核实**：

| 事实 | 命令 | 结果 |
|---|---|---|
| 活轨有 plan **内容**概念吗？ | `grep -rn 'planContent\|planFilePath\|planAttachment' src/` | **0** |
| `planState` 在哪？ | `grep -rn planState src/` | `core/query/runtime/{policy,decision,proof}.ts` |
| 那些文件**可达**吗？ | 从 `entrypoints/cli.tsx` 做 import BFS | **不可达** |
| 它们的外部导入者？ | `grep -rn "runtime/policy.js"` | **只有 1 个测试** |

**即：`planState` 属于死代码簇；活轨的「plan 模式」只是一个权限闸门**
（`turn/tools.ts:241` 的 `planModeBlock`），**根本没有 plan 内容可恢复**。

**结论**：**T6 的前提不成立**。要做 T6，得**先有 plan 内容这个功能**——
那是新功能，不是「恢复」。**见 §6 裁决点。**

### 5.2 T7「去重扩到 read 以外」——**前提存疑**

**子代理自己也这么说**（`P13Debt` 报告 §B.3）：

> **Mostly a capability nobody asked for** ... blind global content-hash stubbing
> across arbitrary tools is brittle and rarely expected by users.

**主代理核实**：参考的 `FILE_UNCHANGED_STUB` **就在 `FileReadTool` 里**
（`source-claudecode/tools/FileReadTool/FileReadTool.ts:690`，常量定义在
`tools/FileReadTool/prompt.ts:7`）——**参考的去重也是「读文件」范围的**。

**即：08 的 T7 描述（「参考按内容哈希去重**任何**工具结果」）与参考实际不符。**

### 5.3 R1「子代理递归深度」——**现状是正确的**

**已核实**：`source-claudecode/constants/tools.ts:36-41`

```ts
...(process.env.USER_TYPE === 'ant' ? [] : [AGENT_TOOL_NAME]),
```

**外部用户被硬性限制在深度 1**（子代理不能再生子代理），**只有 Anthropic 内部**放开。
我们 Phase 12 加的 `NEVER_GIVEN = new Set(["task"])` **与参考对外的行为一致**。

**结论**：**不改**。这是**与参考一致**，不是缺陷。

---

## 6. 裁决点（需要维护者拍板）

| # | 问题 | 选项 |
|---|---|---|
| **Q1** | **M4/M5 的依赖**：裸 HTTP 自己写 SigV4/事件流解码，还是引入 `@aws-sdk/client-bedrock-runtime` + `@google/genai`？ | **(a)** 裸 HTTP（守住 6 个依赖的现状，但 SigV4 与二进制事件流要自己写，约 400–600 行） **(b)** 引入两个 SDK（快，但打破 `phase-3` 先例，供应链面显著变大） |
| **Q2** | **T6 的前提不成立**：要做「压缩后恢复 plan」，得先有「plan 内容」这个功能 | **(a)** 只做「恢复」——**但无内容可恢复，等于空转** **(b)** 先做 plan 内容（新功能）+ 恢复 **(c)** 不做，记录前提不成立 |
| **Q3** | **T7 与参考不符**：参考的去重也在 read 范围 | **(a)** 不做，更正 08 的记录 **(b)** 做「按内容哈希去重任意工具结果」（参考没有，我们自创） |
| **Q4** | **R1 递归**：现状与参考一致 | **(a)** 不改（推荐） **(b)** 加有界深度 |

---

## 7. 主代理对子代理结论的核实记录

**维护者要求**：「你要根据子代理的结论自行去检查子代理的说法是否正确」。

| 子代理论断 | 我的核实 | 结论 |
|---|---|---|
| pi 发行版 bash **无** `run_in_background` | `grep` 其 bash.ts → **0**；参数只有 command/timeout | ✅ **成立** |
| Claude Code 有 `run_in_background` + `TaskOutput` + `TaskStop` | 三个文件与行号**逐一存在** | ✅ **成立** |
| 我们 `processTree.ts` 已具备孤儿清理 | 读到 `trackChildPid`/`killProcessTree`/`killAllTrackedProcesses` | ✅ **成立** |
| 我们输出全量进内存 | `local.ts:48` `let stdout = ''` + `:78` `stdout += text` | ✅ **成立** |
| Anthropic client ID 与固定端口 53692 | `anthropic.ts:31-33` 逐字存在 | ✅ **成立** |
| Anthropic token POST 是 JSON | `:174` `"Content-Type": "application/json"` | ✅ **成立** |
| Copilot token 端点与 `proxy-ep` | `github-copilot.ts:60,66-70` 逐字存在 | ✅ **成立** |
| RFC 8628：默认 5s、slow_down +5s | `device-code.ts:6,8` 的注释与实现 | ✅ **成立** |
| 参考的去重是**读文件**范围 | `FILE_UNCHANGED_STUB` 定义在 `FileReadTool/prompt.ts:7` | ⚠️ **成立，但推翻了 08 的描述** |
| T6 是真实用户可见缺口 | 活轨**无 plan 内容概念**；`planState` 在死代码簇 | ❌ **不成立**（前提错误） |
| R1 应该做有界递归 | 参考对外**硬限深度 1**，我们与之**一致** | ❌ **不成立**（不该改） |
| Vertex 路径含 model | `google-generative-ai.ts:353-356` 从 `model.baseUrl` 读 | ✅ **成立** |
| 端点契约必须改（`path` 动态化） | `kinds.ts:207-208` 确认静态拼接 | ✅ **成立** |

**两个被推翻的**（T6 前提、R1 必要性）**已在 §5 与 §6 更正**，
**一个被修正的**（T7 与参考不符）**已记录**。

---

## 8. 本轮未验证 / 存疑（如实记录）

1. **Bedrock/Vertex 的真实请求**：无账号，**未端到端验证**。
   可验证的是**请求形状与事件解析**（用录制的字节流）。
2. **Copilot / Anthropic 订阅的真实登录**：无账号，**不可验证**。
3. **Windows 上的进程组清理**：在 WSL2/Linux 上核实，**Windows 路径未实测**。
4. **Google 的 URL 拼接**：pi 走 SDK，`baseUrl` 由 SDK 内部拼；
   **`?alt=sse` 的确切位置未在 pi 源码中逐字找到**（`[INFERENCE]`：来自 REST API 契约）。
5. **SigV4 的自行实现规模**：**未估算到行级**（`[INFERENCE]`：400–600 行）。


---

## 9. 复核子代理对本轮裁决的审查（**2026-09-26**）

派 2 个只读子代理审裁决文档（`R13Facts2` 审事实、`R13Deps` 审依赖与协议）。
**`R13Facts2` 四项全部确认**；**`R13Deps` 三项全部成立**，
其中两项**推翻了我文档里的写法**。

### 9.1 R13Facts2：四项事实全部确认

| 论断 | 结论 |
|---|---|
| `core/query/runtime/{policy,decision}.ts` 不可达，外部导入者只有测试 | ✅ **确认** |
| `FILE_UNCHANGED_STUB` 定义在 `FileReadTool` 内，参考去重也是读文件范围 | ✅ **确认** |
| 参考对外硬限深度 1（`USER_TYPE === 'ant'` 才放开） | ✅ **确认** |
| `interception.ts` 的运行时函数只有测试调用 | ✅ **确认** |

### 9.2 R13Deps 的三项，主代理逐条核实后**全部成立**

**发现一：Q1 的成本估算仍然过低（我已改过一次，还是不够）。**
我写的「400–600 行」——子代理指出：pi 的 1,345 行**是在用了 SDK 的前提下**，
SDK 承担了 **SigV4 签名、凭据发现、HTTP 代理、连接池、二进制事件流解码**。
**自写这些的成本远高于 600 行。** ✅ **成立**（§1.1 已更正）

**发现二（结构性）：T4「改 `headers` 签名」不够。** ✅ **成立**
核实：`request.provider.headers` 是**会话构造期**就解析好的静态对象
（`cliRuntimeInvocation.ts:619`），而 `step.ts:337` 只是把它传进 fetch——
**headers 的构建点距 payload 有整条调用链那么远**。
`providerAuthorization`（`authorization.ts:62-74`）只拿到 apiKey 与 endpoint，
**拿不到 body、拿不到最终 URL**，而 SigV4 恰恰要签这两样。
**T4 不是改签名，是要打通一条链**（3 个调用点 + 2 个构造点）。§4 已更正。

**发现三：我把 GenAI 与 Vertex 混为一谈。** ✅ **成立**
它们是**两个 provider**：GenAI 只需 API key；
**Vertex 需要 ADC/service account，且还要 project + location**
（`google-vertex.ts:21-23,49-50`，`:11` 的注释明确写了）。
我原稿写「Vertex 有 `?alt=sse`，比 Bedrock 简单」——**把 AI Studio 的形态安到了 Vertex 头上**。
§4 已更正：本轮做 **GenAI**，**Vertex 留作增量**。

### 9.3 这三项对裁决的影响

**没有推翻任何裁决，但显著改变了论据与顺序**：

| 裁决 | 变化 |
|---|---|
| **Q1**（裸 HTTP） | **维持**，但成本估算改为「远高于 600 行」，且明确了自写范围的边界 |
| **Q5**（只做简单认证） | **论据加强**——从「省事」升级为「**避开一次跨 5 个调用点的结构性改动**」 |
| **T4**（契约扩展） | **范围扩大**：从「改签名」改为「打通认证链」，**T4 的级别与成本都要上调** |
| **T5**（Google 协议） | **拆为两步**：GenAI（本轮）→ Vertex（增量） |

### 9.4 教训（与 `phase-12-decisions.md` §9 同类）

**两次估算错误都出在「我以为我读过这段代码」**：
第一次把 pi 的行数当成自写成本（没注意那行数是 SDK 之上），
第二次把 GenAI 的形态安到 Vertex 头上（没读 `google-vertex.ts` 的认证分支）。

**两次都是复核子代理抓到的，不是我自己发现的。**
这与 `phase-12-decisions.md` §9 记录的教训一致：
**写完裁决后必须让独立读者去查，而不是自查**。
