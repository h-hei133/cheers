---
title: "Phase 10 前置研究"
summary: "Phase 10 是 01–07 规划文档的最后一个阶段。范围由维护者裁定：扣掉「D 类不做」与「扩展宿主」两族，其余未完成项全部纳入。本文件给出 7 项候选 + 2 项边界裁决的实测证据、改动面与风险；每一条都对着代码核过，不转述旧记录。"
---

# Phase 10 前置研究

> **本文件的纪律**：每条断言都附可复现的核实方式。旧文档的说法**只作为待验证的线索**，
> 不作为结论——本轮已经抓到 3 处旧记录不实（见 §3.1、§4.1、§7）。

## 0. 范围是怎么来的

维护者裁定：**「除了 D 类不做项和扩展宿主这两类不做，其余的划分进 Phase 10」**。

主代理不读合计行，按 7 份文档判表的「判定」列逐行重算。**复核发现一处行级损坏导致漏数**，
修好后为 **102 行判定**：

| 状态 | 行数 |
|---|---:|
| 已收口 | 52 |
| OURS-ONLY／平手（仅记录，不提议开发） | 28 |
| 永久不做／维持不做 | 3 |
| 部分收口 | 10 |
| 仍开放（MISSING/DEFICIENT） | 9 |

> **复核更正（`RvP10Scope`）**：`04-*.md:63`（主题磁盘发现与 CLI 覆盖）**行首缺少 `|`**，
> Markdown 解析器把它当普通段落跳过，于是判表少了一行。
> 这是本仓库**第三处同类损坏**（前两处见 `_index.md` §6.6）。修好后总数 102、已收口 52。

**关键**：「部分收口」**不等于**「无余量」——有些行在证据列里记了**余量**，那些余量同样是未完成任务。
把判定列与余量子句一起算，再扣掉两类排除项，得到 **7 项主体 + 2 项边界**。

### 0.1 排除项 A：扩展宿主族（9 行，复核后 8 行）
`01:51` 扩展自动发现、`01:52` 注册工具、`01:53` 注册命令、`01:54` 事件订阅、
`01:61` 包分发、`01:62` 主题发现的「包层」余量、`02:47` JSONL RPC、`02:49` SDK。
**`02:53` Session 分享经复核移出本族**——见 §0.3。
**理由**：前四项是宿主本体（`grep registerTool|registerCommand` → 0），其余是它的下游或同族的「对外程序化接口」。

### 0.2 排除项 B：D 类不做（5 行）
`02:48` CBOR 系列、`03:56` 传输选择（SSE/WebSocket）、`04:62` 主题令牌余量、
`04:73` Markdown 细分语法、`03:55` Cache 统计指针行（余量唯一登记处在 `06:62`，避免两处记同一事实）。

### 0.3 复核补进来的 3 项（原枚举漏掉）

**① `04:63` 行级损坏**（计数错误）——见上表脚注。

**② `02:53` Session 分享被**错误地**链式排除。**
它的核心依赖是**会话导出 + 网络发布**，既不需要扩展加载机制，也不属于第三方注册 API 或 RPC/SDK。
原枚举把它归入「扩展宿主族」**缺乏因果支撑**。
**处置**：它**不属于** Phase 10 的「其余」——它是一个**独立的功能立项**（发布到哪个服务、
用户如何授权、链接如何失效），按 `02-*` §3.3 应单独裁决。**本阶段不纳入，但要如实说明理由**
（不是「因为它是宿主下游」，而是「它是独立的网络发布能力，需单独决策」）。

**③ 两处「正文记录了余量、但判定列已写收口」的项**（**方法本身的盲区**）。
原枚举只读判定列与行内余量子句，**漏掉了写在正文里的余量**：

| 位置 | 正文余量 | 主代理核实 |
|---|---|---|
| `06-*.md:169`（对应 `06:60`） | 「**内置目录里没有一个模型声明 `cost`**（`grep -c 'cost:' core/models/catalog.ts` → 0），所以**所有费率仍走 `USAGE_RATES` 固定回退值**，「真实费率」这一半仍未收口」 | **成立**：`catalog.ts:31` 声明了 `cost?: ModelCostRates`，但 `grep -c "cost:"` → **0**，**无任何内置模型填它**；`usageTelemetry.ts:95` `USAGE_RATES` 仍是写死的两个常量 |
| `03-*.md:223`（对应 `03:58`） | 「**档位数仍为 3**（`low`/`medium`/`high`）——扩到 7 档是产品决策，而映射是正确性修复，两者分开处理」 | **成立**：`thinkingCommandRuntime.ts:21` `TIERS = ["low","medium","high"]`；`thinkingBudgets` 配置字段**零消费者** |

**这两项是否纳入 Phase 10？**
- `06` 的真实费率：**纳入**（见 `phase-10-decisions.md` T7）。它是「已声明但无数据」的缺陷，
  且不影响 `T4` 的算法正确性——但**没有它，T4 算出的金额仍是估算**。
- `03` 的 7 档 thinking：**不纳入**。正文自述「**扩到 7 档是产品决策**」——
  那属于需求而非缺陷修补，且 `pi` 的映射规则与我方档位语义不同。**如实记录为未纳入。**

### 0.4 独立复核
范围枚举由 `P10Sweep` 子代理**独立重推**：它逐份读了 7 份文档的全部正文段落
（DEFICIENT/MISSING 详述、OURS-ONLY、未能验证项）**以及** phase-0～9 全部阶段文档的
「遗留／未做／延后」清单（含 `phase-4-execution.md` §10–§13）。
结论：**未发现遗漏项**。它另查了 4 处可能的遗漏来源，逐条给出「已覆盖或已裁决」的判定。

---

## 1. P2 — Session 文件的 entry 级版本化（`02:50`）

### 1.1 文档怎么说
> 「**versioned 不成立**：`encodeTranscriptEvent` 就是 `JSON.stringify(event)`，**无版本字段**。**余量：entry 级版本化**」

### 1.2 实测（主代理亲验）

**成立**。`src/session/sessionEventCodec.ts:152`：

```ts
export function encodeTranscriptEvent(event: TranscriptEvent): string {
  return JSON.stringify(event);
}
```

`grep -n version` 该文件 → **0**。**但旧文档的路径写错了**：它写 `sessionEventCodec.ts`，
实际位置是 `src/session/sessionEventCodec.ts`（不在 `transcript/` 子目录下）。

### 1.3 关键发现：`isTranscriptEvent` 不拒绝未知字段

`sessionEventCodec.ts:189-200` 的守卫**只检查它认识的字段**，不检查多余字段：

```ts
function isTranscriptEvent(value: unknown): value is TranscriptEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.type !== "string" || typeof record.timestamp !== "string") return false;
  if (record.type === "message") {
    return TRANSCRIPT_ROLES.has(record.role) && isTranscriptContent(record.content);
  }
  …
}
```

**含义**：加一个 `version` 字段是**纯增量**——老代码读新文件不会失败，新代码读老文件也不会失败。

### 1.4 已存在的兼容先例（这是设计要照抄的东西）

同一文件 `:110-119` 有一个**已落地的**向后兼容机制：

```ts
export function legacyTranscriptEntryId(lineNumber: number): string {
  return `line-${lineNumber}`;
}
```

注释写明为什么**不重写旧文件**：

> 「Derived from the line number rather than assigned and stored: rewriting old transcripts
> would break the promise that they are append-only, and a derived name is stable for as
> long as the file is.」

`decodeTranscriptLineSafe`（`:200-215`）在读入时给无 id 的老行**补**一个派生 id。
`sessionTranscript.ts:32-55` 的注释进一步说明：老会话必须**照原样**继续加载。

**这条先例决定了 P2 的设计**：版本号只能是**读时推断**的，不能靠迁移重写文件。

### 1.5 参考实现（实测）
`pi` 的 `docs/session-format.md:24-31`：
- 文件**首行**是 `SessionHeader`，**带 `version` 字段**：
  `{"type":"session","version":3,"id":"uuid","timestamp":"…","cwd":"…"}`
- 版本沿革记录在案：v1 线性、v2 树形加 `id`/`parentId`、v3 重命名 `hookMessage` → `custom`。
- 「Existing sessions are automatically migrated to the current version (v3) when loaded.」
- `docs/session-format.md:258` 的解析示例读的是 `entry.version ?? 1`——**缺省即 v1**，这是它处理无版本老文件的方式。

### 1.6 改动面
| 位置 | 改动 |
|---|---|
| `src/session/sessionEventCodec.ts` | 定义版本常量；`decodeTranscriptLineSafe` 缺省版本推断 |
| `src/session/transcript/sessionTranscript.ts` | 首行 header 的写入（若采用 header 方案） |
| `src/core/commands/exportCommandRuntime.ts` | 见 P1——导出需要能带出版本 |

### 1.7 风险
**这是本阶段唯一有向后兼容风险的一项。** 老会话文件必须继续可读，且**不许被重写**
（append-only 是写在注释里的承诺，有测试钉住）。设计必须回答：版本号放首行 header，
还是每条 entry 自带？参考实现是**首行**；但我们的文件是 append-only 追加的，
首行方案要求**新增一个只能在创建时写一次的写路径**。

---

## 2. P1 — Session 导出保留 header（`02:51`）

### 2.1 文档怎么说
> 「`/export jsonl` 已实现……**但无 header 行**（导出内容就是 transcript 本身，而 transcript 无版本头）——**「保留 header」这一半不成立**」

### 2.2 实测（主代理亲验）
**成立**。`src/core/commands/exportCommandRuntime.ts:230-232`：

```ts
function asJsonl(events: readonly TranscriptEvent[]): string {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}
```

纯逐行 dump，**无 header**。该文件的注释（`:224-229`）解释了为什么**应该**导出原始 entry 而不是投影：
投影会把 compaction 与 branch-summary 折进普通消息，丢掉「压缩过什么、回退过什么」的记录。

### 2.3 与 P2 的关系
**同一个根**：没有版本头，就没有东西可导。**P1 与 P2 应作为一个改动做**，分开做会出现
「导出了 header 但 header 里没有版本」这种半成品。

### 2.4 改动面
`exportCommandRuntime.ts` 的 `asJsonl` 与它的调用点（`:119`）。

### 2.5 风险
导出的 JSONL 是对外契约（用户会拿去喂自己的脚本）。加 header 行会**改变行数**——
若有人按「行数 == entry 数」写脚本，会受影响。需在 `/export` 的输出里点明这一点
（该命令已有解释性输出块，`:141-148`）。

---

## 3. P5 — Cache 命中率与浪费分析（`06:62`）

### 3.1 文档怎么说（并在此更正一处）
> 「**余量（本行是唯一登记处）**：**无命中率、无浪费分析**——pi 算的是「本可命中却未命中」的 token 与多花的钱。
> **2026-09-25 前置变化**：B2 已补 TTL 声明与费率投影，**只差** `usageTelemetry` 记录请求时间戳……**从「无基础设施」降为「接线」**」

### 3.2 实测（主代理亲验）
**余量成立**，`grep idleMs|hitRate|missedTokens src/observability/` → **0**。

**「只差时间戳」这一句低估了工作量**。实测：

| 事实 | 证据 |
|---|---|
| `usageTelemetry` 只有**一个**时间戳，无历史 | `:70` `lastUpdated: number`；`:227` `existing.lastUpdated = Date.now()`；`:243` 同上。**没有**每次请求的时间数组 |
| 但每次请求的 token 与模型**都记了** | `:169-178` 记录 `promptTokens`/`model`/`provider`/`cacheReadTokens`/`cacheWriteTokens` |
| 已按模型分桶 | `ModelUsageBucket`（`:15-22`），`:194-209` 累加 |
| TTL 声明**确实已就位** | `core/models/catalog.ts:74-79` `promptCache?: { short?: number; long?: number }` |
| 经济学计算**确实已就位** | `core/models/cacheEconomics.ts:116-159` `evaluateCacheWarming`：`expectedSavings = 续跑概率 × 未命中代价 − 刷新代价`，阈值 $0.05 |

**更正**：不是「只差时间戳」，而是**「缺一个按请求的滑动状态」**——
要算 `idleMs` 与 `missedTokens`，必须保留**上一次请求**的 `{promptTokens, modelKey, timestamp, reportedCache}`。
今天只有一个覆盖式的 `lastUpdated`。

### 3.3 参考实现（实测）
`pi` 的 `src/core/cache-stats.ts`（6,580 字节）：
- 常量：`CACHE_TTL_MS = 5*60*1000`、`NOISE_FLOOR_TOKENS = 1024`
- 数据结构：`CacheMiss { missedTokens, missedCost, idleMs, modelChanged }`、`CacheWasteTotals { missedTokens, missedCost, missCount }`、`PreviousRequest { promptTokens, modelKey, timestamp, reportedCache }`
- 算法 `detectMiss`：`missedTokens = min(prev.promptTokens, promptTokens) - usage.cacheRead`，
  低于噪声地板（1024）不计；`missedCost` 用「已付单价 − 缓存读单价」的**差**乘 token 数。
- 扫描 `scan`：遇到 compaction／branch_summary **重置** prev（上下文合法重建，不算浪费）；
  遇到 cache-warm 的 usage 更新 prev 时间戳。

### 3.4 改动面
1. 新增模块（建议 `src/observability/cacheStats.ts`）：`CacheMiss`/`CacheWasteTotals` 类型 + `detectMiss`。
2. `usageTelemetry` 或调用方维护 `PreviousRequest` 状态（**当前唯一缺失的状态**）。
3. 成本费率取自 `loadCatalog()`/`CatalogModel.cost`（已就位）。
4. `/cost`（`core/commands/costCommandRuntime.ts`）增加命中率与浪费展示。

### 3.5 风险
模块函数上限 20（`AGENTS.md` 规则 3）。`detectMiss` + 类型 + 展示接线需拆到多个文件，
不能堆进 `usageTelemetry.ts`（它已有 20 个函数名）。

---

## 4. P3 — OAuth 订阅登录：协议家数与真实端点（`03:49`）

### 4.1 文档怎么说（并在此更正一处）
> 「**余量**：支持 2 家（`pi` 7 家）；**端到端真实端点验证未做**（需真实订阅账号）」

### 4.2 实测（主代理亲验）
**家数成立**。`src/core/auth/oauth/providers.ts` 只有两个配置工厂：
- `openAIOAuthConfig()` `:21-52`
- `googleOAuthConfig(clientId, clientSecret?)` `:57-86`
- `oauthProviderIds()` `:91-93` 返回字面量 `["openai", "google"]`

**「真实端点验证未做」也成立**，且**这一条在本阶段无法消除**（需真实订阅账号）。

### 4.3 关键发现：存在两处重复的「家」清单（漂移风险）

`oauthProviderIds()` 是**硬编码字面量**，而真正的分派在**另一个文件**：

```ts
// src/provider/request/authorization.ts:104-113
function oauthConfigFor(provider, account) {
  if (provider === "openai") return openAIOAuthConfig();
  if (provider === "google") { … }
  return undefined;
}
```

再加两处：`core/auth/providerAuthRuntime.ts:20-22` 的 `CONTRACTS` 数组、
`entrypoints/cliArgs.ts:21` 的 `VALID_PROVIDERS`。
**加第 3 家要同时改 4 处**，且**没有任何一处会因另一处漏改而报错**。

### 4.4 加一家 provider 的真实改动面（实测）
| 位置 | 内容 |
|---|---|
| `core/auth/oauth/providers.ts` | 新增一个配置工厂 + 进 `oauthProviderIds()` |
| `core/commands/<name>AccountAuth.ts` | 新增命令与 `ProviderAuthContract` |
| `core/auth/providerAuthRuntime.ts:20-22` | 进 `CONTRACTS` 数组 |
| `provider/request/authorization.ts:104-113` | 进 `oauthConfigFor` 分派 |
| `config/runtimeConfig.ts:17-21` | 进 `RuntimeProvider` 联合类型（若该家是运行时可选的 provider） |

**注意**：`src/core/auth/oauth/flow.ts` 是**provider 无关**的（全部走 `config.*`），
所以「加一家是加一个声明」这句**只对 flow 那一层成立**，对上面 4 处注册不成立。

### 4.5 参考实现
`pi` 的 `docs/providers.md:1-18` 说明 `/login [provider]` 支持浏览器流与设备流；
其 provider 声明经由 `provider-composer.ts` 的 `oauth?: ExtensionOAuthConfig`（`:58`）
与 `composeOAuthAuth`（`:489`）**组合**而来，配置在 provider 数据里，不是硬编码分支。

**待定**：参考实现把 provider 配置做成**数据**而非**代码分支**——这正是上面 4 处漂移的根治方向。
是否在本阶段把我们的 4 处合并为一张表，需裁决。

### 4.6 风险
**OAuth 改动会触碰凭据写入路径。** `AGENTS.md` 把 provider/auth 核心列为需明确任务范围的部分。
另外本阶段的**验证能力有硬上限**：没有真实订阅账号，登录成功路径无法端到端验证——
**这一点必须如实写进裁决，不许声称验证过**。

---

## 5. P4 — 自定义 provider：更多端点种类（`03:53`）

### 5.1 文档怎么说
> 「**余量**：端点种类为 2（默认兼容形 + Anthropic Messages），其余（Responses／Bedrock／Vertex 等）仍无——
> 但**表达方式是通用的**，加第三种是加一个模块而不是改判定」

### 5.2 实测（主代理亲验）
**家数成立**。`src/provider/endpoints/` 只有 4 个文件：`anthropicMessages.ts`、
`anthropicMessages.test.ts`、`chatRequest.ts`、`chatResponse.ts`（即「默认兼容形」的实现）。
协议种类由 `chatRequest.ts:20` 声明：

```ts
export type EndpointKind = "openai-compatible" | "anthropic-messages";
```

### 5.3 「加一个模块」这一句**只对了一半**（本次实测的主要更正）

真正的问题：**协议分支散落在 5 个地方**，不是集中在一处。

| 位置 | 分支内容 |
|---|---|
| `provider/endpoints/chatRequest.ts:40` | `chatPath()` 决定 URL 路径 |
| `provider/endpoints/chatRequest.ts:50-51` | `chatBody()` 决定 body |
| `provider/endpoints/chatResponse.ts:14` | 响应读取 |
| `turn/step.ts:180-181` | `endpointFor()` 决定本请求用哪种 |
| `turn/step.ts:216-217` | 主回合**自己又判了一次** body（不走 `chatRequest`，因为它要带 tools/streaming） |
| `provider/request/authorization.ts:8` | `anthropicHeaders` 决定认证头 |

**含义**：加第三种协议要动 **6 处分支**，不是「加一个模块」。
更重要的是 `turn/step.ts` 与 `chatRequest.ts` **各判一次**——这正是 `chatRequest.ts:4-18` 注释
自述想避免的问题：

> 「Three places send a model request … three copies of "which endpoint wants what" is three chances for one of them to be missed.」
> 「The turn's own request is not built here: it carries tools, streaming and a listener, and folding that in would make this a worse version of it.」

**所以这句自述是诚实的**，但它也说明：主回合那条路径**没有被抽象覆盖**，加协议时它是最容易漏的一处。

### 5.4 一个容易搞错的点：`endpointClass` 不是协议选择器
`src/provider/registry/provider.ts:115`：

```ts
readonly endpointClass: "default" | "openai-compatible" | "custom" | "unknown";
```

它属于 `ProviderDescriptor`——**诊断/就绪度注册表**的类型，取值 `"unknown"` 说明它是**标签**，
与 `EndpointKind`（`"openai-compatible" | "anthropic-messages"`）**不是同一个概念**。
**加协议不改它。**

### 5.5 参考实现
`pi` 的 `docs/custom-provider.md` 与 `provider-composer.ts`：
provider 配置里可声明 `baseUrl`、`oauth`、`refreshToken`、`modifyModels` 等；
协议形状差异通过 **provider 数据 + extension 适配**表达。

### 5.6 改动面与风险
**建议**：本阶段**不**加具体的新协议（Vertex/Bedrock 各自的认证与流式语义差异很大，
且同样面临「无法真实验证」的问题），而是**把 6 处分支收敛到一处**——
让「加协议」这句话**变成真的**。这是收益确定、可完整验证的改动。

---

## 6. P6 — 崩溃日志 7 天过期（`06:54`）

### 6.1 文档怎么说
> 「保留最近 5 条 + `/crash`（含 `--stack`）。**余量**：无 7 天过期（pi 有）」

### 6.2 实测（主代理亲验）
**成立**。`src/observability/crashLog.ts`：
- `:38` `export const MAX_CRASH_RECORDS = 5;`
- `:86` `const kept = [...readCrashLog(filePath), record].slice(-MAX_CRASH_RECORDS);`

**只有条数上限，无时间上限**。`grep expire|days|prune|maxAge` → 0。
一条崩溃记录只要没有新崩溃产生，会**永久留在磁盘上**。

### 6.3 参考实现（实测）
`pi` 的 `src/core/crash-log.ts`：
- `:16` `const MAX_AGE = 7 * 24 * 60 * 60 * 1000;`
- **消费点不在写入时**，而在 `takeUnnotifiedCrash`（`:146-150`）：
  反向找最近一条 `!notified` 且 `now - Date.parse(timestamp) <= MAX_AGE` 的记录。
- 交互模式启动时调用它（`modes/interactive/interactive-mode.ts:1153`）。

**参考实现的 7 天是「提示新鲜度」而非「删除」**——过期记录不提示，但不一定被删。

### 6.4 改动面
1. `crashLog.ts`：定义 `MAX_CRASH_AGE_MS`；在 `recordCrash`（`:68-93`）写入前过滤过期记录。
2. 顺序：现有序是**旧在前、新在后**（`/crash` 正向遍历，`crashCommandRuntime.ts:44-46` 注释自述），
   按时间淘汰自然从头部淘汰，**不破坏**既有遍历。

### 6.5 风险
低。但要注意**别把「过期不提示」写成「静默删除」**——删除用户磁盘上的东西需要更明确的理由。
这一取舍要在裁决里写清。

---

## 7. P7 — 主题热重载（`04:61`）

### 7.1 文档怎么说
> 「**余量**：无热重载（改主题文件需重启）。**余量与 `01-*` 主题发现行一致**：包层不做（无包系统）。」

### 7.2 实测（主代理亲验）
**成立**。`grep reload|watch src/presentation/theme/` → 仅 1 处**注释**
（`theme.ts:111`，讲缓存失效，不是实现）。
**全仓** `grep fs.watch|FSWatcher|chokidar|watchFile src/` → **0**。
即：仓库**没有任何文件系统监听基础设施**，引入热重载是**从零引入**。

### 7.3 关键发现：设计已预留好接口（这是本项成本低的原因）

`Theme` 类（`theme.ts:103-137`）**已经有**为热重载准备的机制：

```ts
apply(theme: ThemeConfig): void {
  this.name = theme.name;
  this.colors = new Map(...);
  this.revision += 1;      // ← 每次换调色板就 +1
}

get colorRevision(): number { return this.revision; }
```

它的注释**明确写的就是重载场景**：

> 「A theme is recolored in place, so a surface that renders the same text twice gets different
> output from an unchanged input. Anything caching rendered rows has to key on this or it keeps
> serving rows in the old colors — **the reload would change the palette and nothing on screen would follow.**」

且缓存**确实**用了它：
- `presentation/tui/transcript/container.ts:123-127`：`cached.revision === revision` 校验
- `presentation/tui/transcript/mermaid.ts:123`：缓存 key 前缀含 `colorRevision`

**所以「重载后画面跟上」这一步已经完成**，缺的只是「发现文件变了」这一步。

### 7.4 参考实现（实测）
`pi` 的 `modes/interactive/theme/theme.ts:826-910` 有一套完整设计，且**有值得照抄的判断**：
1. **只监听自定义主题**——内置的 `dark`/`light` 直接 return（`:831-833`）
2. **只监听已存在的文件**（`:839-841`）
3. **100ms 防抖**（`:844-874`），因为编辑器保存会触发多次事件
4. **陈旧定时器保护**：防抖回调里先比 `currentThemeName !== watchedThemeName`（`:851-853`），
   防止切换主题后旧定时器把新主题覆盖回去
5. **文件暂时消失时保留上一个好主题**（`:859-861`）
6. **解析失败吞掉错误**（`:873-878`），因为「文件可能正在被编辑」
7. **监听的是目录而非文件**——注释 `footer-data-provider.ts:315` 说明原因：
   「fs.watch on a file stops working after the inode changes」（编辑器保存常换 inode）

### 7.5 改动面
1. 新增 watcher 归属模块（如 `presentation/themes/watch.ts`），用 `node:fs` 的 `watch`——**零新依赖**。
2. 在 `applyTheme`（`theme.ts:264-275`）成功后启动；`/theme` 切换时先停旧 watcher。
3. 重载成功后调用 `defaultTheme.apply(newConfig)`——**已有机制**，无需新代码。
4. 生命周期：进程退出／非交互模式下要释放，否则进程挂起。

### 7.6 风险
- 后台进程生命周期管理（watcher 不关会让进程不退出）——**这是本项最容易出的真 bug**。
- 平台差异：`node:fs.watch` 在 Linux/macOS/Windows 的事件语义不同（参考实现监听目录 + 比对文件名来规避）。

---

## 8. 边界项 B1 — `SYSTEM.md` 替换语义（`01:64`）

### 8.1 现状
该行行首写「**刻意不做**」，行内理由：

> 「`SYSTEM.md` 替换会连带删掉 harness 自身的执行规则，是不同的信任决定；有测试钉住它未被认领。」

`projectInstructions.ts:50-57` 的注释原文（实测）：

> 「There is deliberately no `SYSTEM.md`. That name means 'replace the system prompt', and the
> prompt carries the harness's own execution rules — a file able to remove those is a different
> kind of trust decision than a file that adds to them, and inventing a half-considered version
> of it here would be worse than leaving the name unclaimed.」

### 8.2 「替换会删掉什么」——逐段列清（实测 `turn/prompt.ts:62-77`）

| 段 | 丢失后 |
|---|---|
| 身份 + **工具清单**（`:61`，由 `toolNames` 动态生成） | 模型不知道自己有哪些工具 |
| **PLAN/BUILD 模式守卫**（`:62-64`） | Plan Mode 的只读约束在提示词层**彻底失效** |
| 规则 1–2（必须给结构化答复） | 只跑工具不说话 |
| 规则 3（搜索用 `web_search`） | — |
| 规则 4（文件操作工具映射） | — |
| **规则 5（用户拒绝必须立即遵从、不得重试）**（`:70`） | **这是安全规则**，丢失后拒绝反馈被无视 |

### 8.3 测试确实钉住了它
`projectInstructions.test.ts:271-285` 断言 `SYSTEM.md` 既不进 `appended.files` 也不进 `rules.files`。

### 8.4 参考实现**确实实现了**替换（实测，这一点旧记录没写）

`pi` 的 `resource-loader.ts:1027-1037` `discoverSystemPromptFile()`：
- 项目级 `.pi/SYSTEM.md`：**仅当 `settingsManager.isProjectTrusted()`** 才返回
- 全局 `<agent-dir>/SYSTEM.md`：无条件返回
- `docs/security.md:40-41` 把这两个文件列为**敏感资源**，受项目信任门控

`system-prompt.ts:120-158` `buildSystemPromptSections()`：当有 `customPrompt` 时，
只把 `preamble` 换成自定义内容，**并跳过默认的 `tools`/`rules`/`docs` 生成**——
即**也接受「丢失内置规则」这个后果**，但用**结构化分节 + 信任门**换来安全。

### 8.5 待裁决的问题
**旧理由今天是否仍成立？**
- **成立的部分**：我方 `buildSystemPrompt` 是**扁平的字符串数组**（`prompt.ts:60-71`），
  没有「不可覆盖的基底」这一层。真允许替换，规则 5 与 Plan 模式守卫会一起消失。
- **变化的部分**：参考实现证明**这件事是可做的**——条件是 ①系统提示**分节**，
  基底约束独立且不可覆盖；②项目级文件走**信任门**（我方已有 `ProjectTrustStore`，
  但实测**没有**参考实现那样的交互式确认流程）。

**裁决方向**：要么维持不做，要么把「分节 + 信任门」作为前置一起立项。**不能只做替换。**

---

## 9. 边界项 B2 — 技能发现的注记已过时（`01:57`）

### 9.1 问题
该行**判定列写「部分收口」且行内余量写「余量：无。」**，但 `01-*.md:97` 一段散注记
仍写「**仍然成立的余量**：无名称/描述校验、无 `.gitignore`/`.ignore` 忽略规则、根目录数量少于 pi」。
**两处自相矛盾**，且注记是旧的（日期 2026-09-23）。

### 9.2 逐条核实（主代理亲验）

**① 名称/描述校验：已实现。** `skillLoader.ts:541-573` `inspectSkill` 应用**四条**名称规则
（长度上限、字符集 `^[a-z0-9-]+$`、首尾连字符、连续连字符）**加**描述必填：

```ts
if (skill.description.trim() === "") {
  note("has no description, so the model cannot match it; it will not appear in the skill list");
}
```

注释还说明了**为什么不丢弃而是报告**：坏名字只是瑕疵，描述缺失才让技能对模型不可见。

**② 忽略规则：已接入。** `skillLoader.ts:6` 导入 `isDirectoryIgnored`，
`:357` 在扫描时跳过被忽略目录：

```ts
if (source !== "cli" && isDirectoryIgnored(this.ignoreRoot, child)) continue;
```

且 `:354-356` 注释说明**为什么 `cli` 除外**：用户直接指名的路径比「恰好匹配某个模式」更具体。

**③ 根目录数量：差距不是缺陷。**
我方（`skillLoader.ts:167-192`）扫：`resolveAllUserDataFiles("skills")` 的**全部**用户级目录
（含历史版本目录）+ `projectDirectories(workspaceRoot)` 展开的**每一层** `.agents/skills`。
参考实现多出来的根属于**包系统／扩展宿主／设置项数组**——**这三者都已在排除项 A 内**。

### 9.3 结论
**注记已过时（STALE）**。代码无余量，**这是纯文档修复**，不占 Phase 10 施工预算。
`P10ThemeSkill` 与 `P10Sweep` 两个子代理**独立**得出同一结论。

---

## 10. 复核安排

| 项 | 复核者 | 结果 |
|---|---|---|
| P1/P2 session | 主代理亲验（子代理被 `content_filter` 拦截） | 见 §1、§2 |
| P3 OAuth | 主代理亲验（子代理被拦截） | 见 §4 |
| P4 端点 | 主代理亲验（子代理被拦截） | 见 §5 |
| P5/P6 可观测性 | `P10Observe` 子代理 + 主代理复核 | 见 §3、§6；**主代理更正其一处列读错** |
| P7 主题 + B2 | `P10ThemeSkill` 子代理 + 主代理复核 | 见 §7、§9 |
| B1 + 范围独立重推 | `P10Sweep` 子代理 + 主代理复核 | 见 §8、§0 |

**`content_filter` 事故记录**：本轮 3 个子代理（`P10Session`、`P10Provider`、`P10Endpoint`）
被上游拦截，拦截点一致——**读到 session 编解码／凭据遮蔽／认证分派代码后立即死亡**。
处置照既有结论：**涉及这些阅读面的任务直接由主代理亲验**，不是省略复核。
重派 `P10Endpoint` 仍被拦，说明拦截与措辞无关，与**阅读面**有关。

## 11. 本轮未做的核验（如实记录）

1. **参考实现的真实运行**：`pi` 的 `node_modules` 不存在，未实跑其主题热重载／崩溃提示／
   OAuth 登录验证结论。所有参考侧结论来自**其源码与文档**。
2. **P3 的真实端点登录**：无真实订阅账号，**登录成功路径未验证**。这是本阶段无法消除的验证缺口。
3. **P4 新增协议的可行性**：未评估 Vertex／Bedrock 各自的认证与流式语义差异（本阶段建议不做）。
4. **`npm run test:ts` 全量**：本阶段是规划，未跑（改动为零）。
