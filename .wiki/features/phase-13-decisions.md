# Phase 13 裁决

> **输入**：`phase-13-pre-research.md`（4 个子代理深探 + 主代理逐条核实）。
> **维护者裁定**（`phase-12-decisions.md` §13）：M2/M3/M4/M5/M6 **全部要做**。
> **本文档的裁决点**：pre-research §6 的 Q1–Q4。

---

## 0. 任务表

| # | 任务 | 来源 | 判定 | 级别 |
|---|---|---|---|---|
| **T1** | **M2** 后台命令执行 | 08 `M2` | ✅ **做** | P1 |
| **T2** | **M3** OAuth Device Code（RFC 8628） | 08 `M3` | ✅ **做** | P1 |
| **T3** | **M6** Copilot + Anthropic 订阅 OAuth | 08 `M6` | ✅ **做** | P1 |
| **T4** | **端点契约扩展**（`path` 动态化、`headers` 拿到请求上下文） | pre-research §4.1 | ✅ **做**（M4/M5 的前置） | P0 |
| **T5** | **M5** Google GenAI 协议 | 08 `M5` | ✅ **做**（依赖 T4）；**Vertex 为其上的增量** | P0 |
| **T6** | **M4** AWS Bedrock 协议 | 08 `M4` | ✅ **做**（依赖 T4） | P0 |
| **T7** | OAuth provider 声明式注册 | pre-research §3.3 | ✅ **做**（T2/T3 的接缝） | P1 |
| ~~**T8**~~ | ~~T6 plan 恢复~~ | 12 §8 | ❌ **不做**——**前提不成立**（见 §2.1） | — |
| ~~**T9**~~ | ~~T7 去重扩到 `read` 以外~~ | 12 §8 | ❌ **不做**——**与参考不符**（见 §2.2） | — |
| ~~**T10**~~ | ~~R1 子代理递归深度~~ | 12 §14.2 | ❌ **不改**——**与参考一致**（见 §2.3） | — |

**执行顺序**：见 §5。

---

## 1. 裁决结果（pre-research §6 的 Q1–Q4）

| # | 问题 | **裁定** |
|---|---|---|
| **Q1** | M4/M5 用裸 HTTP 还是引入 SDK？ | **裸 HTTP**。理由见 §1.1 |
| **Q2** | T6 前提不成立，怎么办？ | **不做**，并更正记录。理由见 §2.1 |
| **Q3** | T7 与参考不符？ | **不做**，更正 08 的描述。理由见 §2.2 |
| **Q4** | R1 递归？ | **不改**。理由见 §2.3 |
| **Q5** | **Bedrock 本轮是否只做 Bearer、Google 只做 GenAI**？ | **是**（推荐）。**论据比原稿强**：SigV4 与 Vertex ADC **都需要打通一条跨 3 个调用点的认证链**（见 §4 T4），而 Bearer 与 API key 都只是静态头部。**这从「省事」升级为「避开一次结构性改动」** |

### 1.1 Q1 的裁定与理由

**裁定：M4/M5 用裸 HTTP 自行实现，不引入 `@aws-sdk/client-bedrock-runtime` 与 `@google/genai`。**

**理由一：pi 自己就为此付出了可查的代价。**

`pi/packages/ai/src/api/bedrock-converse-stream.lazy.ts` 的原文注释：

> Loads the bedrock implementation through a variable specifier so **bundlers
> (browser smoke, Bun compile) cannot follow the import into the Node-only AWS SDK**.

**即：AWS SDK 是 Node-only 的，pi 必须用「变量说明符 + 动态 import」的 hack
才能让打包器不去跟进这个依赖**，还要额外维护 `setBedrockProviderModule`
给 Bun 编译用（同文件 `:19-24`）。**这是引入 SDK 的真实代价，不是假设。**

**理由二：我们的依赖面是 6 个，`phase-3-decisions.md:131` 已有先例。**

> 引入网络依赖（离线不可用）、供应链面（**下载并执行未经校验的第三方二进制**）……
> **不该为此破例**。

**理由三：我们已有裸 HTTP 设施。**
`provider/request/fetch.ts:1` 已从 `undici` 引入 `Agent`/`ProxyAgent`/`fetch`，
并已处理代理与超时。**写新协议不需要新增网络层。**

#### 成本更正（**主代理自查发现，原估过低**）

**我最初写「SigV4 + 二进制事件流解码约 400–600 行」，这个估算过低。**
核实依据：

| 事实 | 证据 |
|---|---|
| pi 的 Bedrock 实现 **1,345 行** | `wc -l pi/.../bedrock-converse-stream.ts` |
| pi 的 Vertex 实现 **1,540 行**（三文件） | `wc -l pi/.../google-{vertex,generative-ai,shared}.ts` |
| **且这两个数字还是「用了 SDK 之后」的** | `grep SigV4` 在 pi 的 bedrock 文件里 → **0 处实现**，签名全由 SDK 完成 |
| **二进制事件流解码也是 SDK 做的** | `bedrock-converse-stream.ts:296` `for await (const item of response.stream!)` |
| pi **没有**任何手写的事件流解码器可抄 | `grep -rln 'eventstream\|prelude\|crc32'` → 只有无关的 `zip.ts` |

**即：裸 HTTP 意味着 pi 让 SDK 承担的那部分（SigV4 签名 + AWS 二进制帧解码）
我们要从零写，而 pi 没有留下可抄的实现。**

#### 但有一条显著降低成本的路径（**主代理发现**）

**Bedrock 支持 Bearer token，可完全绕过 SigV4**
（`pi/.../bedrock-converse-stream.ts:104-108`）：

> Bearer token for Bedrock API key authentication.
> **When set, bypasses SigV4 signing** and sends `Authorization: Bearer <token>` instead.
> Set via `AWS_BEARER_TOKEN_BEDROCK` env var or pass directly.

**这把最难的一部分（SigV4 的规范化请求、签名头、负载哈希、凭据作用域）变成可选的**。
`bearerToken` 路径下，Bedrock 只是一个普通 HTTPS 端点 + 二进制帧解码。

**修正后的成本**：

| 部分 | 估 | 说明 |
|---|---|---|
| Bedrock 请求体（`toolSpec`/`toolUse`/`toolResult` 映射） | 中 | 机械翻译，可单测 |
| **AWS 二进制事件流解码** | **高** | prelude + headers + CRC 校验；**无参考可抄**，但有公开规范 |
| Bedrock Bearer 认证 | 低 | 一个头部 |
| Bedrock SigV4（**可选**） | **高** | 若要支持标准 AWS 凭据链则必须；**建议本轮只做 Bearer** |
| Vertex 请求体 + `?alt=sse` | 中 | SSE 形态，我们已有解析器 |
| Vertex 认证（API key / ADC） | 中 | ADC 需读 `~/.config/gcloud/...` 并刷新令牌 |

#### 建议的收窄：本轮两个协议都只做「简单认证」路径

**同一个模式在两个协议上都成立**——各自都有一条不需要复杂签名的路径：

| 协议 | 复杂路径 | **本轮采用的简单路径** | 证据 |
|---|---|---|---|
| **Bedrock** | SigV4（规范化请求 + 签名头 + 负载哈希 + 凭据作用域） | **Bearer token**（`AWS_BEARER_TOKEN_BEDROCK`） | `pi/.../bedrock-converse-stream.ts:104-108` |
| **Vertex** | **必须** ADC 或 service account（**且还要 project + location**） | **API key** | `pi/.../google-vertex.ts:21,27-32`（`api-key` 是三个选项之一，只要一个 key） |

**理由**：
① 复杂路径是**成本与风险的主要来源**，且 **pi 的实现全在 SDK 里、无参考可抄**；
② 简单路径**能拿到可用的协议**——Bearer 的 Bedrock 与 API-key 的 Vertex 都是真实可用的；
③ 复杂路径是**非破坏性的增量**：`headers` 已经拿到请求上下文（T4），
   将来加 SigV4/ADC **不需要改契约**；
④ 与我们「不加无法验证的表面」的既有纪律一致——
   本轮**能验证的是形状与状态机**，而 SigV4/ADC 的核心（签名正确性）
   **恰好是最需要真实账号才能验证的部分**。

**这个收窄需要维护者确认**（见 §8 Q5）。

## 2. 三项「不做」的详细理由

### 2.1 T6「压缩后恢复 plan」→ **不做：前提不成立**

**12 §8 的登记说**：plan 内容在压缩后丢失。

**核实结果**：**活轨里根本没有 plan 内容这个概念。**

| 事实 | 命令 | 结果 |
|---|---|---|
| 活轨有 plan 内容吗 | `grep -rn 'planContent\|planFilePath\|planAttachment' src/` | **0** |
| `planState` 在哪 | `grep -rn planState src/` | `core/query/runtime/{policy,decision,proof}.ts` |
| 那些文件可达吗 | 从 `entrypoints/cli.tsx` BFS | **不可达** |
| 外部导入者 | `grep -rn "runtime/policy.js"` | **只有 1 个测试** |

**我们的「plan 模式」只是一个权限闸门**（`turn/tools.ts:241` 的 `planModeBlock`
在 `agentMode === "plan"` 时拦下写操作），**没有 plan 文本、没有 plan 文件、
没有 plan 附件**。参考的 `createPlanAttachmentIfNeeded`
（`source-claudecode/services/compact/compact.ts:1470-1490`）恢复的是
**磁盘上的 plan 文件**——**我们没有那个文件**。

**所以「做 T6」实际是「先做 plan 内容功能，再做它的恢复」**——
那是**新功能立项**，不是补一个缺口。**本阶段不做**，
**并更正 12 §8 的登记**（它把「参考有而我们没有的功能」误记为「我们有但压缩会丢的东西」）。

### 2.2 T7「去重扩到 `read` 以外」→ **不做：与参考不符**

**08 §4.3 的描述**：「参考按**内容哈希**去重**任何**工具结果（256B–50KB）」。

**核实**：参考的 `FILE_UNCHANGED_STUB` **定义在 `FileReadTool` 内部**
（`tools/FileReadTool/prompt.ts:7`），**只被 `FileReadTool` 使用**
（`FileReadTool.ts:690`）。**参考的去重也是「读文件」范围的。**

**子代理 `P13Debt` 自己也这么判断**：

> **Mostly a capability nobody asked for** ... blind global content-hash stubbing
> across arbitrary tools is brittle and rarely expected by users.

**即：08 的 T7 描述有误，参考没有这个能力。** 按维护者「照搬参考」的准则，
**参考没有的不自创**。**不做，并更正 08 的描述。**

### 2.3 R1「子代理递归深度」→ **不改：与参考一致**

**核实**（`source-claudecode/constants/tools.ts:36-41`）：

```ts
...(process.env.USER_TYPE === 'ant' ? [] : [AGENT_TOOL_NAME]),
```

**外部用户被硬性限制在深度 1**——子代理不能再生子代理；
**只有 Anthropic 内部**（`USER_TYPE=ant`）放开。

我们在 Phase 12 加的 `NEVER_GIVEN = new Set(["task"])`
（`core/subagents/boundary.ts:15`）**正是参考对外的行为**。

**结论：这是与参考一致，不是缺陷。** 不改。

---

## 3. 贯穿本阶段的两条取舍

### 3.1 「无法端到端验证」≠「无法正确实现」

**这是维护者在 `phase-12-decisions.md` §13 纠正我的一点**，本阶段全程适用。

**落到 M3–M6**：

| 项 | 能离线验证的部分 | 不能验证的部分 |
|---|---|---|
| **M3** Device Code | **RFC 8628 状态机**（假授权服务器注入响应序列：`authorization_pending`/`slow_down`/`expired_token`/`access_denied`）、请求形状、轮询间隔 | provider 是否真的接受 |
| **M4** Bedrock | **SigV4 签名的规范向量**（AWS 公开测试向量）、二进制事件流**用录制字节流解码**、请求体形状 | 真实端点 |
| **M5** Vertex | 请求体形状、`?alt=sse` 解析、`thoughtSignature` 往返 | 真实端点 |
| **M6** 订阅 OAuth | token 交换/刷新请求形状、`proxy-ep` 解析、过期计算 | 真实登录 |

**验证标准：协议/流程层单测覆盖形状与状态机**，而不是「必须拿真账号跑通」。

### 3.2 协议是模块，契约是接缝

`provider/endpoints/index.ts` 的注释已经写明设计意图：

> A new protocol is a new module imported here and nowhere else:
> no caller, and no other protocol, has to know it exists.

**这个意图目前被契约本身限制了**：`path: string` 与 `headers(apiKey)` 是静态的，
而 Bedrock/Vertex 都需要动态 URL 与请求级签名。**T4 就是把这条接缝补上**，
**让那个注释重新成立**。

---

## 4. 每项的设计要点

### T4 — 端点契约扩展（**M4/M5 的前置**）

| 改动 | 内容 |
|---|---|
| `EndpointShape.path` | `string` → `(model: string) => string` |
| `EndpointShape.headers` | **不能只改签名**——见下方「T4 的真实范围」 |
| `endpointUrl()` | 接受 model 参数 |
| 两个现有协议 | 各改 1 处（`path` 返回常量） |

**不做的事**：**不引入签名器抽象**。Bedrock 是唯一需要看 body 的消费者。

#### T4 的真实范围（**复核子代理指出，主代理已核实并更正**）

**我原稿说「`headers` 改成拿到请求上下文就够了」——这是错的。**
核实：`request.provider.headers` 是一个**预先解析好的静态对象**，
在**会话构造时**就构建完成（`cliRuntimeInvocation.ts:619`），
而 `step.ts:337` 只是把它传进 fetch：

```ts
headers: request.provider.headers,   // ← 早已构建，此处不参与任何计算
body: JSON.stringify(payload),       // ← payload 在这里才存在
```

**即：headers 的构建点距离 payload 有整条调用链那么远**，
`providerAuthorization`（`authorization.ts:62-74`）**只拿到 apiKey 与 endpoint，
拿不到 body、拿不到最终 URL**。SigV4 恰恰要签这两样。

**所以 T4 不是「改一个函数签名」，而是要打通一条链**：

| 层 | 现状 | T4 需要 |
|---|---|---|
| `providerAuthorization` | 构造期调用，产出静态 headers | 改为产出**按请求签名的能力** |
| `ProviderConfig.headers` | 静态 `Record<string,string>` | 改为 `headersFor(request) => ...` |
| 三处 fetch 调用点 | 直接用 `provider.headers` | 改为传 method/url/body 进去 |
| `EndpointShape.headers` | `(apiKey) => headers` | 移到请求期，能看到完整请求 |

**这条链有 3 个调用点**（`step.ts` / `summarize.ts` / `completion.ts`）
与 2 个构造点（`cliRuntimeInvocation.ts:619`、`cliSessionRuntimeFactory.ts:265,291`），
**改动面比原稿描述的大得多**。

**这直接影响 Q5**：SigV4 需要打通这条链，**成本比「写个签名函数」高得多**；
而 **Bearer 认证只需要一个静态头部**（`Authorization: Bearer <token>`），
**完全不需要动这条链**。
**这让「本轮只做 Bearer」从「省事」变成了「避开一次结构性改动」**——
论据比我原稿写的强。

#### 收窄之后的 T4 反而变小了（**主代理进一步核实**）

既然本轮认证都是静态头部，**`headers` 那半不需要改**。剩下的是：

| 协议 | 需要 `path` 动态化吗 | 依据 |
|---|---|---|
| **Bedrock** | ✅ **需要** | REST 路径含 `{modelId}`；`modelId` 是请求参数（`bedrock-converse-stream.ts:265`） |
| **Google GenAI** | ❌ **不需要** | SDK 把 model 作为**参数**传入（`google-generative-ai.ts:100` `client.models.generateContentStream(params)`），**不在 URL 里** |

**即收窄后的 T4 = 只把 `path` 从 `string` 改成 `(model) => string`，
并同步 3 个调用点。** 这是个小改动，**比我原稿描述的两种方案都小**。

**代价**：将来要做 SigV4 或 Vertex ADC 时，**仍需打通那条认证链**——
但那时的改动是**纯增量**（`headers` 加一个能看请求的形态），
**不会推翻本轮的任何结构**。

### T1 — M2 后台命令执行

| 新增 | 职责 |
|---|---|
| `core/shell/background/tasks.ts` | `BackgroundTaskManager`：`spawn`/`list`/`stop`/`output`，接 `trackChildPid` |
| `core/shell/background/output.ts` | 滚动缓冲 + 超限落盘（参照 pi `output-accumulator.ts`：内存留 `2×maxBytes` 尾，超限写临时文件） |
| bash 参数 | 加 `runInBackground` |
| 两个工具 | `taskOutput`、`taskStop` |
| 完成通知 | **复用现有 follow-up 队列**，不新造机制 |

**必须同步**：`cli/interactive/ambientFacts.ts:9` 的「no detached execution mode」
将变成假话。

### T2 — M3 Device Code

`core/auth/oauth/device.ts`：`pollDeviceCode()`——RFC 8628 状态机
（缺 `interval` 默认 5s、`slow_down` +5s、可中断 sleep）。

### T3 — M6 订阅 OAuth

`copilot.ts`（token 端点 + `proxy-ep` 解析）、`anthropic.ts`
（**JSON** token POST + 固定端口 53692 + 手动粘贴降级）。

### T7 — provider 声明式注册

`providers.ts:91-93` 的硬编码 `["openai","google"]` 改为声明式，
使「加一个 provider」是加一条声明而不是改代码。

### T5 — M5：**两个不同的 provider，不是一个**

**复核子代理指出、主代理已核实的更正**：我原稿把「Google GenAI」与
「Vertex」当成同一个协议的两种认证——**它们其实是两个不同的 provider**：

| | **Google GenAI（AI Studio）** | **Vertex AI** |
|---|---|---|
| 认证 | **API key**（`x-goog-api-key`） | **ADC 或 service account**，**且必须再给 project + location** |
| pi 的位置 | `providers/google.ts` + `api/google-generative-ai.ts` | `providers/google-vertex.ts` + `api/google-vertex.ts` |
| 我们的 M5 原文 | 「Google GenAI / Vertex 原生协议」**——把两者混为一谈** | 同左 |
| 本轮 | ✅ **做** | ⏸ **增量**（见下） |

**证据**（`pi/packages/ai/src/providers/google-vertex.ts`）：
`:21-23` 三个认证选项里 `api-key` 只是其一，另两个是 `adc` 与 `service-account`；
`:49-50` 还要额外问 **project** 与 **location**；
`:11` 的注释明确说「ADC additionally requires project and location env vars」。

**即：Vertex 不是「另一种 header」，它多一套凭据解析与两个必填参数。**

**本轮裁定**：
① **做 GenAI**（API key，形态简单，`?alt=sse` 与我们已有的 SSE 解析同构）；
② **Vertex 留作其上的增量**——它需要 ADC 令牌获取（读
`~/.config/gcloud/application_default_credentials.json` 或 service account JWT 交换），
**这部分恰好是最难离线验证的**（与 SigV4 同理）。

### T6 — M4 Bedrock

按 pre-research §4.2 的差异表逐项实现，**认证走 Bearer**（见 §1.1）。

---

## 5. 执行顺序

| 序 | 任务 | 级别 | 为什么在这个位置 |
|---|---|---|---|
| 1 | **T4** 端点契约扩展 | **P0** | **M4/M5 的前置**；两个现有协议必须同步改并保持全绿 |
| 2 | **T5** M5 Google 协议 | P0 | 依赖 T4；**先做 GenAI（API key + `?alt=sse`，形态简单）**，以验证契约改对了；**Vertex 作为其上的增量** |
| 3 | **T6** M4 Bedrock | P0 | 依赖 T4；SigV4 + 二进制事件流，最重 |
| 4 | **T7** provider 声明式注册 | P1 | **T2/T3 的接缝**，先做省得后面改两遍 |
| 5 | **T2** M3 Device Code | P1 | 独立；RFC 8628 状态机可完整单测 |
| 6 | **T3** M6 订阅 OAuth | P1 | 依赖 T7 |
| 7 | **T1** M2 后台执行 | P1 | 独立；接缝最多（工具 + 通知 + 输出） |

**可并行组**：{T5, T6} 在 T4 之后 / {T2, T1} / {T3} 在 T7 之后。

---

## 6. 本阶段要更正的旧记录

| # | 旧记录 | 更正 | 证据 |
|---|---|---|---|
| **C1** | `phase-12-decisions.md` §8 把「plan 恢复」登记为待办 | **前提不成立**——活轨无 plan 内容概念，`planState` 在死代码簇 | pre-research §5.1 |
| **C2** | `08-*` §4.3 称参考「按内容哈希去重**任何**工具结果」 | **与参考不符**——`FILE_UNCHANGED_STUB` 定义在 `FileReadTool` 内 | pre-research §5.2 |
| **C3** | `08-*` §4.2 把 M4/M5 列为「成本高」 | **成本来源是依赖 + 认证链**，不是协议本身 | §1.1 |
| **C4** | 本文档初稿把「Google GenAI」与「Vertex」当成同一协议的两种认证 | **是两个 provider**：GenAI 只需 API key；Vertex 需 ADC/service account **且要 project + location** | §4 T5 |
| **C5** | 本文档初稿称 T4「改 `headers` 签名就够」 | **不够**——headers 在**会话构造期**就解析完了（`cliRuntimeInvocation.ts:619`），距 payload 整条链；SigV4 要签 body，必须打通这条链 | §4 T4 |

---

## 7. 本阶段不做的事

| 项 | 理由 |
|---|---|
| **T6** plan 恢复 | 前提不成立（§2.1） |
| **T7** 去重扩范围 | 与参考不符（§2.2） |
| **R1** 递归深度 | 与参考一致（§2.3） |
| **D11** 中途换模型 | 维护者裁定不做（`phase-12-decisions.md` §2.5） |
| **D6** SSE 事件头 | 已证伪（`phase-11-decisions.md` §17） |
| **死代码两簇** | `plan.md` §2.1「可达性不授权删除」；**需维护者明示授权**（见 §8） |

---

## 8. 需要维护者决定的一件事：死代码两簇

`08-*` §5 登记的两簇**仍未处置**：

| 簇 | 规模 | 本轮核实 |
|---|---|---|
| `tools/policy/interception.ts` | 411 行 | **四个运行时函数全部只有测试调用**（生产调用者 **0**）；只有**类型**被 2 个活文件引用 |
| 真死文件 | 35 个 / 6,650 行 | 36 个连通簇，最大簇 9,283 行 |

**`plan.md` §2.1 明确「可达性只用于分析，不授权删除」**，
`AGENTS.md` 也要求「删别人代码前先问」。**故不自行删除。**

**选项**：
- **(a)** 按 §2.2 六项检查，**逐簇**处置（先 `core/workflow/` 已完成的那簇同法）；
- **(b)** 只删 `interception.ts`（证据最硬：零生产调用者）；
- **(c)** 保留，登记 disposition。

**注**：`interception.ts` 的类型被活文件引用，
所以**不能整文件删**——要么保留类型、删函数，要么把类型移走。
这正是 §2.2「删除单元取连通分量整簇」要防的那种「看着像死代码、其实是编译契约」。
