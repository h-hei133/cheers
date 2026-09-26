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
| **T4** | **端点契约扩展**（`path` 动态化 + **传输层签名装饰器**） | pre-research §4.1 | ✅ **做**（M4/M5 的前置） | P0 |
| **T5** | **M5** Google GenAI 协议（AI Studio） | 08 `M5` | ✅ **做**（依赖 T4） | P0 |
| **T6** | **M4** AWS Bedrock 协议 | 08 `M4` | ✅ **做**（依赖 T4） | P0 |
| **T5b** | **M5** Google **Vertex** 协议 + **ADC/service account 认证** | 08 `M5` | ✅ **做**（依赖 T4） | P0 |
| **T6b** | **AWS 凭据链**（env → profile → SSO/process → ECS → IMDSv2） | pre-research §1.1 | ✅ **做** | P0 |
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
| ~~**Q5**~~ | ~~Bedrock 只做 Bearer、Google 只做 GenAI~~ | ❌ **作废**——维护者驳回「收窄」，**全量实现**（见 §1.1） |

### 1.1 Q1 的裁定与理由 —— **全量实现，不收窄**（**维护者驳回收窄后重写**）

**裁定：M4/M5 按生产企业级实现，不引入任何 AWS/Google SDK，也不收窄认证路径。**

#### 我上一版错在哪

上一版我裁定「Bedrock 只做 Bearer、Google 只做 GenAI」，理由是
「SigV4 与 ADC 需要打通一条跨 5 个调用点的认证链，成本高」。
**维护者驳回：「为什么收窄？我要的是生产企业级别的项目，不要老是做一些 demo 模块。」**

**驳回是对的**，理由有三：

① **Bearer-only 的 Bedrock 是半成品**：真实 AWS 用户用 IAM 凭据（SigV4），
   只支持 Bearer 等于「看起来支持 Bedrock，实际大部分人用不了」；
② **API-key-only 的 Vertex 同样是半成品**：Vertex 的标准企业用法就是 ADC/service account；
③ **我把「需要一点结构改动」当成了「不值得做」**——这正是上一轮已经被纠正过的同一类错误。

#### 决定性发现：**本地就有一份零 SDK 的生产级参考**

`~/projects/oh-my-pi` 用**纯 WebCrypto + 手写协议**实现了全部所需能力，
**零 AWS/Google SDK 依赖**（`grep '@aws-sdk\|aws-sdk'` → 0）：

| 文件 | 行数 | 内容 |
|---|---|---|
| `packages/ai/src/providers/aws-sigv4.ts` | **229** | 手写 SigV4（**WebCrypto-only**，注释明写「no node:crypto」） |
| `packages/ai/src/providers/aws-eventstream.ts` | **181** | AWS 二进制事件流解码器（含 `crc32`/`decodeMessage`/`decodeEventStream`） |
| `packages/ai/src/providers/aws-credentials.ts` | **1,078** | 完整凭据链：env → profile（静态/SSO/`credential_process`/角色链/`web_identity`）→ ECS → **IMDSv2** |
| `packages/ai/src/providers/amazon-bedrock.ts` | **1,345** | Bedrock provider 本身 |
| `packages/ai/src/providers/google-auth.ts` | **330** | **RS256 JWT 交换**（service account）→ 用户 ADC → GCE metadata |
| `packages/ai/src/providers/google-shared.ts` | **1,136** | 两个 Google 协议的请求/响应/工具/thinking |
| `packages/ai/src/providers/google-vertex.ts` / `google.ts` | 135 / 53 | 两个 provider 的入口 |

**且有测试与 AWS 官方测试向量**：
`test/aws-sigv4.test.ts` 直接引用 `aws-sig-v4-test-suite`
（含 `getSigningKey` 的官方期望值 `c4afb1cc...`），
`test/aws-eventstream.test.ts`、`test/aws-credentials.test.ts`、
以及 **12+ 个 `bedrock-*.test.ts`**。

**即：这条路已经被走通过，且有可对照的测试向量。**

#### 依赖结论不变，但理由更强

**不引入 SDK** 仍然成立，且现在**有了实证**：
`oh-my-pi` 就是零 SDK 做到的，**不是理论上的可行性**。
pi 用 SDK 是它的选择；`oh-my-pi` 证明另一条路同样完整。

#### 结构问题的正解：**签名放在传输层**（4 个 scout 独立收敛到同一方案）

上一版我说「要打通一条跨 5 个调用点的认证链」——**那个判断本身也是错的**。

**正解**：SigV4 需要 `method`/`url`/`headers`/`body`，
而**这四样在 `fetchImpl` 里全都有**。所以签名的位置不是「更早」，而是「**正好在那里**」：

```
fetchImpl(url, { method, headers, body })   ← 四样齐备
```

**做法**：把 `providerFetchFor()` 的返回值再包一层签名装饰器
（`packages/ts-shell/src/provider/request/fetch.ts:172`）。
**3 个调用点（`step.ts` / `summarize.ts` / `completion.ts`）一行都不用改**，
两个构造点也不用改。

**已实机验证**：包装后的 fetch 能拿到 url、method、body、headers 全部四项。

#### 修正后的 T4 范围

| 层 | 改动 |
|---|---|
| `EndpointShape.path` | `string` → `(model) => string`（Bedrock 的 URL 含 modelId） |
| `EndpointShape.headers` | **不改签名**——需要签名的协议用**传输层装饰器** |
| `providerFetchFor` | 增加可选的 `signer`，返回包装后的 fetch |
| 3 个调用点 | **不改** |

#### 成本（**重新估算，基于参考的实际规模**）

| 模块 | 参考规模 | 我们的估计 |
|---|---|---|
| `aws/sigv4.ts` | 229 行 | ~250 行 + 官方测试向量 |
| `aws/eventStream.ts` | 181 行 | ~200 行（**CRC32 要自己写**，见下） |
| `aws/credentials.ts` | 1,078 行 | **分级实现**（见 §4 T6） |
| `endpoints/bedrockConverse.ts` | 1,345 行 | ~600–800 行 |
| `google/auth.ts` | 330 行 | ~350 行 |
| `endpoints/googleGenAI.ts` + `googleVertex.ts` | 1,324 行 | ~700–900 行 |

#### 一个真实的 Node 地板约束（**主代理实测发现**）

`oh-my-pi` 的 `crc32` 用 `Bun.hash.crc32`（`aws-eventstream.ts:36`）——**我们跑 Node**。
而 `node:zlib` 的 `crc32` 是 **v22.2.0 引入、v20.15.0 回移**的，
**我们的地板是 20.3.0，CI 就跑 20.3.0**（`.github/workflows/ci.yml:25`）。

**即：`zlib.crc32` 在 20.3.0–20.14.0 上会 `TypeError`，是 `check:node-floor` 违规。**
**必须自己写 CRC32**（IEEE 802.3 多项式 `0xEDB88320`，256 项查表，约 20 行）。

**已实测**：WebCrypto 的 HMAC-SHA256 与 SHA-256 在本机可用，
空串 SHA-256 得到 `e3b0c442...b855`，与 `oh-my-pi` 测试里 pin 的常量一致。

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
| `EndpointShape.path` | `string` → `(model: string) => string`（Bedrock 的 REST 路径含 modelId） |
| `EndpointShape.headers` | **签名不改**——需要签名的协议走传输层装饰器（见下） |
| `providerFetchFor`（`fetch.ts:172`） | 增加可选 `signer`，返回包装后的 fetch |
| 3 个调用点 | **一行不改** |
| 2 个构造点 | **不改** |

**签名装饰器为什么是最干净的接缝**：SigV4 需要 `method` / `url` / `headers` / `body`，
而**这四样在 `fetchImpl` 里全都有**：

```ts
fetchImpl(url, { method, headers, body })   // ← 四样齐备
```

**已实机验证**：包装后的 fetch 能拿到全部四项。
**4 个独立 scout 各自收敛到同一方案**——不是我的偏好。

**为什么不在 `authorization.ts` 里签**：那里在**会话构造期**运行
（`cliRuntimeInvocation.ts:619`），payload 还不存在；
强行让它在请求期运行会牵动 3 个调用点与 2 个构造点，而**收益为零**。

---

### T6a — `aws/sigv4.ts` + `aws/eventStream.ts`（**纯函数，最先做**）

两个模块都是**纯函数、零依赖、可对着官方测试向量验证**，因此排在最前，
且可以与其他任务并行。

#### SigV4 的精确算法（**已核实**）

**规范化请求**（6 行，`\n` 分隔）：
```
<METHOD>
<CanonicalURI>            ← 各段 RFC 3986 编码，`/` 保留
<CanonicalQueryString>    ← 先编码，再按**编码后**的字节序排序
<CanonicalHeaders>        ← 名字小写、按字典序；值去首尾空白并折叠内部空白；每条结尾带 \n
<SignedHeaders>           ← 分号分隔的小写名
<Hex(SHA256(body))>
```

**String to sign**（4 行）：
```
AWS4-HMAC-SHA256
<YYYYMMDDTHHMMSSZ>
<YYYYMMDD>/<region>/<service>/aws4_request
<Hex(SHA256(CanonicalRequest))>
```

**签名密钥**（链式 HMAC-SHA256）：
```
kDate    = HMAC("AWS4" + secret, YYYYMMDD)
kRegion  = HMAC(kDate, region)
kService = HMAC(kRegion, service)
kSigning = HMAC(kService, "aws4_request")
signature = Hex(HMAC(kSigning, stringToSign))
```

**Authorization 头**：
```
AWS4-HMAC-SHA256 Credential=<accessKeyId>/<scope>, SignedHeaders=<names>, Signature=<sig>
```

**必须签**：`host`、`x-amz-date`、`x-amz-content-sha256`、
`x-amz-security-token`（有会话令牌时）、`content-type`、`accept`。
**必须排除**：`authorization`、`user-agent`、`connection` 等不可签头部。

**Bedrock 的 payload hash 是 body 的普通 SHA-256**（`applyChecksum: true`），
**不是** `STREAMING-AWS4-HMAC-SHA256-PAYLOAD` 分块变体。

#### 二进制事件流（**已核实字节布局**）

```
[0..3]   total_length    u32 BE（最小 16）
[4..7]   headers_length  u32 BE
[8..11]  prelude_crc     u32 BE（CRC32 覆盖 [0..7]）
[12 .. 12+headers_length)             头部块
[12+headers_length .. total_length-4) payload
[total_length-4 .. total_length)      message_crc（CRC32 覆盖 [0..total_length-4)）
```

**头部条目**：`[name_len u8][name utf8][type u8][value]`，
类型 `0/1`=布尔、`2/3/4/5`=有符号整数（1/2/4/8 字节 BE）、
`6`=字节数组（`[len u16][bytes]`）、`7`=字符串（`[len u16][utf8]`）、
`8`=时间戳、`9`=UUID。

**Bedrock 用到**：`:message-type`、`:event-type`、`:content-type`、`:exception-type`。

#### **CRC32 必须自己写**（Node 地板约束，**已实测**）

`oh-my-pi` 用 `Bun.hash.crc32`（`aws-eventstream.ts:36`）——**我们跑 Node**。
而 `node:zlib` 的 `crc32` **v22.2.0 引入、v20.15.0 回移**，
**我们的地板是 20.3.0，CI 就跑 20.3.0**（`.github/workflows/ci.yml:25`）。

**在 20.3.0–20.14.0 上调用 `zlib.crc32` 会 `TypeError`**，是 `check:node-floor` 违规。
**自己写**：IEEE 802.3 多项式 `0xEDB88320`，256 项查表，约 20 行。

**已实测**：WebCrypto 的 HMAC-SHA256 与 SHA-256 在本机可用；
空串 SHA-256 得到 `e3b0c442…b855`，与参考测试里 pin 的常量一致。

---

### T6b — `aws/credentials.ts`（**分级，但都要做**）

| 优先级 | 来源 | 为什么 |
|---|---|---|
| **P0** | 环境变量（`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` / `AWS_REGION`） | 最基本，CI 也走这条 |
| **P0** | `~/.aws/credentials` + `~/.aws/config` 的 profile | 笔记本上的标准做法 |
| **P1** | SSO token 缓存（`~/.aws/sso/cache/`） | 企业 AWS 开发环境的标准 |
| **P1** | `credential_process` | `aws-vault` / `granted` / 1Password CLI 走这条 |
| **P2** | ECS 容器凭据、EC2 IMDSv2 | 云上才需要，**生产实现应当包含** |

**P0 先行**（否则 Bedrock 不可用），**P1/P2 同属本轮范围**——
只做 P0 就是维护者说的 demo 模块。

---

### T6 — `endpoints/bedrockConverse.ts`

请求体映射（与两个现有协议不同）：

| 维度 | 我们现有 | Bedrock |
|---|---|---|
| 工具声明 | `tools[].function` | `toolConfig.tools[].toolSpec` |
| 工具调用 | `tool_calls` | `toolUse` |
| 工具结果 | `role: "tool"` | `toolResult` |
| 系统提示 | `systemPrompt` 字段 | `system: [{ text }]` |
| 流格式 | SSE | **二进制事件流**（T6a 解码） |

---

### T5 — Google GenAI（AI Studio）

| 项 | 值 |
|---|---|
| URL | `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse` |
| 认证 | `x-goog-api-key: <key>` |
| 角色名 | `user` / **`model`** |
| 工具 | `functionDeclarations` / `functionCall` / `functionResponse` |
| 推理 | **`thoughtSignature` 必须往返** |
| 流格式 | **SSE**（`?alt=sse`），与我们已有的解析器同构 |

**先做它**，因为它形态最简单，**用来验证 T4 的契约改对了**。

---

### T5b — Google Vertex + `google/auth.ts`（**全量认证**）

| 项 | 值 |
|---|---|
| URL | `https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/{model}:streamGenerateContent?alt=sse` |
| 认证 | **ADC / service account** → `Authorization: Bearer <token>` |
| 额外必填 | **project + location** |

#### 认证流程（参考 `oh-my-pi/.../google-auth.ts`，330 行，**零 SDK**）

优先级：

1. **`GOOGLE_APPLICATION_CREDENTIALS`** 指向的文件（`type: "service_account"`）→ **RS256 JWT 交换**
2. **`~/.config/gcloud/application_default_credentials.json`**（`type: "authorized_user"`）→ **refresh_token 交换**
3. **GCE / Cloud Run metadata server**（`metadata.google.internal`）

| 流程 | 细节 |
|---|---|
| **Service account JWT** | header `{alg: RS256, typ: JWT, kid}`；claims `{iss: client_email, scope: "…/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat, exp: iat+3600}`；**WebCrypto `RSASSA-PKCS1-v1_5` + `importKey("pkcs8")`** |
| **交换端点** | `POST https://oauth2.googleapis.com/token`，`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer` |
| **用户 ADC** | 同端点，`grant_type=refresh_token` + `client_id`/`client_secret`/`refresh_token` |
| **缓存** | 按 `expires_in` 缓存，**提前 60s 过期** |

**已实测**：WebCrypto 的 `RSASSA-PKCS1-v1_5` 与 `pkcs8` 导入在本机 Node 可用。

**为什么不能只做 API key**：Vertex 的企业标准用法就是 ADC/service account。
只做 API key 等于「声称支持 Vertex，实际企业用户用不了」。

---

### T7 — provider 声明式注册

`providers.ts:91-93` 的硬编码 `["openai","google"]` 改为声明式，
使「加一个 provider」是加一条声明而不是改代码。
**T2/T3 依赖它**（Device Code 与订阅 OAuth 是两种不同的 flow）。

---

### T2 — M3 Device Code（RFC 8628）

`core/auth/oauth/device.ts`：`pollDeviceCode()`——RFC 8628 状态机：
缺 `interval` 时**默认 5 秒**；`slow_down` → **间隔 +5 秒**；
`authorization_pending` 继续；`expired_token`/`access_denied` 立即失败；
**可中断的 sleep**（AbortSignal 贯穿）。

---

### T3 — M6 订阅 OAuth

- `copilot.ts`：token 端点 `https://api.${domain}/copilot_internal/v2/token`，
  从 token 解 `proxy-ep=` 得 API base，过期 `expires_at * 1000 - 5min`
- `anthropic.ts`：token 端点 `https://platform.claude.com/v1/oauth/token`，
  **JSON** token POST（非 form-encoded），**固定端口 53692**，手动粘贴回调的降级路径

---

### T1 — M2 后台命令执行

| 新增 | 职责 |
|---|---|
| `core/shell/background/tasks.ts` | `BackgroundTaskManager`：`spawn`/`list`/`stop`/`output`，接 `trackChildPid` |
| `core/shell/background/output.ts` | 滚动缓冲 + 超限落盘（内存留 `2×maxBytes` 尾，超限写临时文件） |
| bash 参数 | 加 `runInBackground` |
| 两个工具 | `taskOutput`、`taskStop` |
| 完成通知 | **复用现有 follow-up 队列**，不新造机制 |

**必须同步**：`cli/interactive/ambientFacts.ts:9` 的「no detached execution mode」
将变成假话。

---

### 测试策略（**全阶段**）

| 层 | 可离线验证 | 不能验证 |
|---|---|---|
| **SigV4** | **AWS 官方测试向量**（`aws-sig-v4-test-suite`） | 真实端点接受与否 |
| **事件流** | 手工构造帧 + 双 CRC + 跨 chunk 分片 | 真实 Bedrock 流 |
| **凭据链** | 假文件系统 + 假 IMDS/ECS 响应 | 真实 IAM |
| **Google JWT** | 固定密钥对 + 断言签名与 claims | 真实 ADC |
| **协议形状** | 请求体、工具映射、`thoughtSignature` 往返 | 真实端点 |
| **RFC 8628** | 假授权服务器注入响应序列 | 真实 provider |
| **后台执行** | 真实短命令：spawn → 读输出 → 停止 → 校验清理 | Windows 进程组 |


## 5. 执行顺序

| 序 | 任务 | 级别 | 为什么在这个位置 |
|---|---|---|---|
| 1 | **T4** 端点契约（`path` 动态化 + 传输层签名装饰器） | **P0** | **M4/M5 的前置**；两个现有协议同步改并保持全绿 |
| 2 | **T6a** `aws/sigv4.ts` + `aws/eventStream.ts` | **P0** | **纯函数，可对着 AWS 官方测试向量做**，不依赖其他任务 |
| 3 | **T6b** `aws/credentials.ts` | **P0** | 依赖 T6a 的类型；分级实现，P0 部分先行 |
| 4 | **T6** `endpoints/bedrockConverse.ts` | **P0** | 依赖 T4/T6a/T6b |
| 5 | **T5** Google GenAI | P0 | 依赖 T4；形态最简单，**用来验证契约改对了** |
| 6 | **T5b** Google Vertex + `google/auth.ts` | P0 | 依赖 T5 与 T4 |
| 7 | **T7** provider 声明式注册 | P1 | T2/T3 的接缝 |
| 8 | **T2** M3 Device Code | P1 | 独立，RFC 8628 状态机可完整单测 |
| 9 | **T3** M6 订阅 OAuth | P1 | 依赖 T7 |
| 10 | **T1** M2 后台执行 | P1 | 独立 |

**可并行组**：{T6a, T6b} 与 T4 并行（纯函数）/ {T5, T6} 在 T4 之后 / {T2, T1} / {T3} 在 T7 之后。

---

## 6. 本阶段要更正的旧记录

| # | 旧记录 | 更正 | 证据 |
|---|---|---|---|
| **C1** | `phase-12-decisions.md` §8 把「plan 恢复」登记为待办 | **前提不成立**——活轨无 plan 内容概念，`planState` 在死代码簇 | pre-research §5.1 |
| **C2** | `08-*` §4.3 称参考「按内容哈希去重**任何**工具结果」 | **与参考不符**——`FILE_UNCHANGED_STUB` 定义在 `FileReadTool` 内 | pre-research §5.2 |
| **C3** | `08-*` §4.2 把 M4/M5 列为「成本高」 | **成本来源是依赖 + 认证链**，不是协议本身 | §1.1 |
| **C4** | 本文档初稿把「Google GenAI」与「Vertex」当成同一协议的两种认证 | **是两个 provider**：GenAI 只需 API key；Vertex 需 ADC/service account **且要 project + location** | §4 T5 |
| **C5** | 本文档初稿称 T4「改 `headers` 签名就够」 | **不够**——headers 在**会话构造期**就解析完了（`cliRuntimeInvocation.ts:619`），距 payload 整条链 | §4 T4 |
| **C6** | 本文档第二稿据此收窄为「Bedrock 只做 Bearer、Google 只做 GenAI」 | **收窄是错的**，维护者驳回。正解是**签名放在 `fetchImpl`**（四样信息齐备），3 个调用点零改动；认证**全量实现** | §1.1、§4 T4 |
| **C7** | 本文档称「SigV4 与事件流解码约 400–600 行，无参考可抄」 | **有零 SDK 的完整参考**：`~/projects/oh-my-pi` 的 `aws-sigv4.ts`(229) + `aws-eventstream.ts`(181) + `aws-credentials.ts`(1078) + `google-auth.ts`(330)，**且含 AWS 官方测试向量** | §1.1 |

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

---

## 9. 施工结果（**2026-09-26**）

**10 项全部落地**（T1–T7 + T5b/T6a/T6b + T4）。**零新增依赖**（仍是 6 个）。

| 任务 | 新增模块 | 验证方式 |
|---|---|---|
| **T4** 契约 | `EndpointShape.path` 动态化 + 传输层 `withRequestSigner` + 端点自声明 `signer` | 4 个调用点零改动；实机验证包装后能看到 url/method/body/headers |
| **T6a** | `provider/aws/signature.ts` | **AWS 官方测试向量**：`getSigningKey` = `c4afb1cc…`、空串 SHA-256 = `e3b0c442…` |
| **T6a** | `provider/aws/eventStream.ts` | CRC 校验值 `0xCBF43926`；跨 chunk、多帧、截断、坏校验和 |
| **T6b** | `provider/aws/credentials.ts` + `profile.ts` | 五个来源 + SSO + `credential_process` + 角色链；每个用例自带 env 与 home |
| **T6** | `provider/endpoints/bedrockConverse.ts` | 工具历史必须有 `toolConfig`（占位工具）；结果合进 user turn；未完成的流报错 |
| **T5** | `provider/endpoints/googleGenAI.ts` + `googleWire.ts` | 角色是 `model`；`functionResponse` 合并；`thoughtSignature` 原样往返 |
| **T5b** | `provider/google/auth.ts` + `endpoints/googleVertex.ts` | **用真密钥对跑 RS256 往返**；ADC 三条来源；令牌提前过期 |
| **T7** | `providers.ts` 列表派生 | 列表与声明不再有两份；列出与构建分离 |
| **T2** | `core/auth/oauth/deviceCode.ts` | RFC 8628：默认 5s、`slow_down` +5s、可中断 sleep、**两种超时区分** |
| **T3** | `core/auth/oauth/subscription.ts` | GitHub 设备流（token 直接可用）；Anthropic **JSON** token POST + 固定端口 |
| **T1** | `core/shell/background/tasks.ts` + `runInBackground` + `taskOutput`/`taskStop` | **真实进程**：启动/读输出/停止/状态落定；输出保尾 64KB；停止打整个进程组 |

### 9.1 集成：否则就是「demo 模块」

**协议写完不等于可用**——必须接线，否则它只是一段没人调用的代码：

| 接线 | 内容 |
|---|---|
| **catalog** | 新增 `bedrock` / `google-ai` / `vertex` 三条 provider 条目，各自指向正确的 endpoint |
| **端点自声明 `signer`** | Bedrock 声明 SigV4 签名器；Vertex 声明 bearer 令牌获取器 |
| **传输层应用** | `providerFetchForEndpoint()` 把端点的签名器包进 fetch，**签名在 dispatch 前一行发生** |
| **授权层** | `providerAuthorization` 接受「有签名器但无 key」的端点（否则配置正确也报无凭据） |
| **UI** | 后台命令计数器接到真实来源，并**删掉那句已变成假的注释** |

**实机验证**：三条 provider 出现在 catalog 且端点/基址正确；`taskOutput`/`taskStop`
在真实 registry 里（15 个工具）；后台命令的完整生命周期走通。

### 9.2 施工中发现的一个真实约束

`oh-my-pi` 的 `crc32` 用 `Bun.hash.crc32`，而 `node:zlib` 的 `crc32` 是 **v22.2 / v20.15** 引入的，
**我们声明的地板是 20.3 且 CI 就跑 20.3** —— **用它会撞 `check:node-floor`**。
**CRC32 自己写**（多项式 `0xEDB88320`，256 项查表），并**实测校验值正确**。
**一个特性不值得抬高整个包的地板。**

### 9.3 一个被施工推翻的旧注释

`cli/interactive/ambientFacts.ts` 原文写着：

> There is deliberately no "background commands" counter: the shell has no
> detached execution mode, so the number could only ever be invented.

**后台执行落地后这句话变成假的**。已删掉并**把计数器接上真实来源**——
这正是「文档与行为不一致」那一类，与 `phase-12-decisions.md` §1.1 的取舍同源。

---

## 10. 复核轮（**2026-09-26**）：三个子代理 + 逐条自证

复核针对 Phase 13 的 11 个 commit。**三个子代理各返回若干条，我逐条回读代码核实**
——**不盲信**，其中一条被证伪、一条降级。

### 10.1 已证伪 / 降级的两条

| 复核结论 | 核实结果 |
|---|---|
| A4「显式 profile 缺 key 应报错而非回落 IMDS」 | **证伪**。参考实现同样静默回落（`aws-credentials.ts` 五级链里 profile 返回空即继续）。**与参考一致，不改**。 |
| A2「流内异常应在收到时立即抛出」 | **方向对、理由错**。复核说 `failure` 检查被截断检查遮蔽——**实际顺序是对的**（先 `failure` 后截断）。真正的缺陷是**继续读完整条流**。 |

**教训**：复核结论的「为什么」也需要核实。否则会按错的理由改对的代码。

### 10.2 比复核更严重的一类：**实现了但没有入口**

复核只看到「函数内部对不对」。**更严重的是这批代码根本没人能调用到**：

| 模块 | 实际状态 |
|---|---|
| `core/auth/oauth/deviceCode.ts` | **零生产调用者**（只被 `subscription.ts` 引，而后者也没人引） |
| `core/auth/oauth/subscription.ts` | **零生产调用者** |
| `core/models/catalog.ts` 的 `bedrock` / `google-ai` / `vertex` | 三个 id **都不在 `RUNTIME_PROVIDERS`**，因此**永远不可能被选中** |
| `provider/endpoints/googleVertex.ts` 的 `vertexBaseUrl` / `vertexTarget` | **零调用者**——真实 URL 从未被算出来 |
| `core/shell/background/tasks.ts` 的 `onEnded` | **零订阅者**——「完成通知」从未存在 |

**实机证据**（跑真实代码，不是读码）：

```
bedrock   | isRuntimeProvider = false | endpoint = "bedrock-converse-stream"
google-ai | isRuntimeProvider = false | endpoint = "google-generative-ai"
vertex    | isRuntimeProvider = false | endpoint = "google-vertex"
```

端点声明**认得**这三个 id，但连接层的 `provider` 被约束成 `RuntimeProvider`，
所以**没有任何路径能把 "bedrock" 传进去**。

**同一条链上的第二个坑**：连接选择器按 catalog 条目拼建议命令，
对 `vertex` 会拼出**字面占位符** `--base-url .../projects/GOOGLE_CLOUD_PROJECT/...`
——照抄就会把这个字符串发出去。

**判定**：这就是维护者说的「demo 模块」——写完了、测过了、**用户碰不到**。
按「不能有任何 demo 模块」的要求，必须接线，不是记一笔。

### 10.3 本轮的其它真实缺陷（均已修复并撤销验证）

| # | 缺陷 | 后果 |
|---|---|---|
| O1 | `runInBackground` 走 `spawn` 裸启动 | **绕过沙箱、超时校验与执行授权**——同一命令前台受约束、后台不受 |
| O3 | `taskStop` 权限检查为空 | 结束任意进程组**无审批门** |
| G1 | `GOOGLE_APPLICATION_CREDENTIALS` 指向坏文件时静默回落 | 掩盖配置错误，还会去问 metadata server |
| G2 | Google 的 `finishReason` 未映射 | `MAX_TOKENS` 被当成正常停止，**截断处理不触发** |
| G3 | tool 结果发给 Google 时名字是 `"unknown"` | 名字与 call 不匹配，**API 拒绝** |
| G4 | 非流式响应丢弃 `functionCall` | 非流式工具调用直接消失 |
| A1 | 签名区域固定取自环境变量 | 跨区域请求 `SignatureDoesNotMatch` |
| A3 | 凭据解析一次后不刷新 | 临时凭据过期后**直到重启都失败** |
| A2 | 流内异常帧后继续读完 | 白耗连接，失败被推迟 |
| O2 | Copilot 未做 token 交换 | 拿去用的是 GitHub OAuth token，**不是 Copilot 会话 token** |
| 新 | `credential_process` / SSO 无超时 | 卡住的子进程**无限期挂住会话** |
| 新 | `finish` 在 error+close 时触发两次 | 完成通知**重复投递** |
| 新 | `renderTask` 注释称会说明截断，实际不说 | 读者把截断的尾巴当完整输出 |
| 新 | 签名器 `headers("")` 传空 key | 拼出 `Authorization: Bearer `（**空凭据**） |

**共同点**：**静默降级**——不报错、不崩溃，只是给出一个看起来正常的错误答案。
这类最难查，也最该在生产代码里杜绝。

### 10.4 修复结果（**2026-09-27**）

全部**撤销即失败**验证过（每条给出实际断言文本）。除复核条目外，自证还发现 5 条。

**接线（把 demo 变成可用）**：

| 项 | 做法 |
|---|---|
| 三个协议可选 | `RUNTIME_PROVIDERS` 加 `bedrock` / `google-ai` / `vertex`，各补 `FACTS` 条目 |
| vertex 地址 | catalog 不再写占位符；**用回 `vertexBaseUrl` / `vertexTarget`**，从环境算真实地址 |
| 订阅登录可达 | 新增 `subscriptionAccountAuth.ts` 契约，注册进 `CONTRACTS`；`/connect login github-copilot --account` 已跑通 |

**实机确认**：

```
github-copilot | preset=true | provider=github-copilot | methods=device-code,account-auth
anthropic      | preset=true | provider=anthropic      | methods=account-auth,api-key
bedrock        | preset=true | provider=bedrock        | methods=none
vertex         | preset=true | provider=vertex         | methods=none
```

**一个必须避开的陷阱**：`apiKeyEnvVar` 是这个解析器**去找静态 key 的名字**，
找到就当成 key 用。所以 `bedrock` 若写成 `AWS_ACCESS_KEY_ID`，
环境里那份真实凭据会被当成 bearer key **顶替掉签名**——请求就不签了。
实测确认（撤销即失败）：`expected { provider: 'bedrock', … } to be undefined`。
故改用 `BEDROCK_API_KEY` / `VERTEX_API_KEY`，并在测试里锁住「不与签名链读的变量同名」。

**全量套件**：`561 文件 / 4,124 通过 / 0 失败`（首跑 3 项负载敏感，
**逐项隔离复跑 40/40、6/6、CLI 正常启动**，且都与本轮改动无关）。

### 10.5 补齐计划里的 T1 落盘要求（**2026-09-27**）

计划 §T1 原写：`background/output.ts`「滚动缓冲 + 超限落盘（内存留尾，超限写文件）」。
**施工时只做了内存留尾**，超限部分直接丢弃——与计划不符，且丢失的正是「开头为什么出问题」。

已补 `core/shell/background/output.ts`：**超限才建文件**（多数命令几行输出，不该产生空日志），
文件**从第一行开始完整**（不是溢出之后的续写），内存仍留尾供通知使用，
通知改为**给出文件路径**而不是「已丢弃」。

**实机验证**（真实进程，30000 行输出）：

```
truncated: true | outputPath set: true
notice:   (earlier output is in /tmp/.../bg_1-muip6rfh-30598.log)
file starts with: "line-1-xxxxxxxxxxxxx"
file contains line-1-: true
```

落盘目录取 `ArtifactManager.directory`（与前台工具产物同处），而非自造路径。
