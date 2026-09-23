---
title: "Phase 6 开工前裁决记录：5 项主决策与 15 项补充裁决"
category: article
sources: [phase-6-pre-research-2026-09-23, phase-5-execution-2026-09-23, phase-5-decisions-2026-09-23, pi-source-2026-09-23, plan-refactor-v7-2026-09-20]
created: 2026-09-23
updated: 2026-09-23
tags: [features, phase-6, decisions, adjudication]
summary: "Phase 6 开工前的**唯一裁决源**。5 项主决策 + 15 项补充裁决。核心裁决：①**T1 HTTP 超时接线**——仓库里已有完整可配实现（`provider/request/fetch.ts` 的 connect/headers/body 30s/120s/120s + 三个 `CHEERS_PROVIDER_*_TIMEOUT_MS` 环境变量），**只被启动预检使用**，活轨 `turn/step.ts:134` 用裸 `fetch`；裁决**接线**而非重写，并补用户可配字段（照 `pi` 的 `httpIdleTimeoutMs` 设计）；②**T2 metrics 采集面**——sink 已存在但全仓仅 1 个调用点，且 `/log tail` **丢弃 `fields`**（数值读不出）；裁决**补采集点 + 加 `/metrics`**，并按「sink 是 `appendFileSync` 同步写」的约束**按回合汇总写**，且明确**不抄 `pi`**（它的 `telemetry.ts` 是安装遥测，无可抄的通用 sink）；③**T3 按模型分桶的用量**——复核发现的记账错误（`model` 字段后写覆盖，换模型后先前 token 按最新费率计价）；④**T4 Bug report**——复用 `core/security/redaction.ts`，打包用 `node:zlib` 手写 zip（**零新依赖**）；⑤**T5 文档表格回写**——25 行判定滞后，排最后（先改代码再回写，否则要回写两遍）。**明确不做**：扩展宿主、RPC/SDK、HTML 导出、更新检查，逐项附理由。"
confidence: high
---

# Phase 6 开工前裁决记录

> **性质**：开工前把需要拍板的事全部定下来。**零代码改动。**
> **输入**：[`phase-6-pre-research.md`](phase-6-pre-research.md)（逐行盘点与候选排序）、
> 两个对抗式复核者报告（`RvPhase6A`/`RvPhase6B`）、主代理逐条实测。
> **输出**：5 项主决策 + 15 项补充裁决，每项含**选项 / 双向证据 / 裁决 / 理由 / 失败模式**。

---

## 0. 裁决方法与证据纪律

### 0.1 角色分工（沿用 `phase-3-decisions.md` §0.1）

| 角色 | 职责 |
|---|---|
| 子代理 | 只收集**参考实现的证据**，明确禁止给推荐 |
| 主代理（本文件） | 逐条**核验**进入裁决的断言，然后**拍板** |

**为什么不让子代理推荐**：它们看不到本仓库的约束（5 个依赖、无插件宿主、只写流）。

### 0.2 本轮的一条新纪律：「空结果」不等于「不存在」

`phase-6-pre-research.md` §2.1 记录了一处主代理错误：用**绝对路径** grep
`"runtime/extensions/lifecycle"` 得到空输出，据此断言「零生产 importer」——
而实际写法是**相对导入** `"../extensions/lifecycle.js"`。

**据此新增纪律**：任何「X 不存在」的断言，必须给出**至少两个不同形态的检索**（绝对路径 + 相对路径；
或 analyzer + grep），并把两条命令都写进文档。单条 grep 的空输出**不构成证据**。

这是 `phase-5-execution.md` §11.6「测试固化缺陷」在**检索层面**的同型问题。

### 0.3 复核结果概览

| 复核者 | 覆盖 | 结论 |
|---|---|---|
| `RvPhase6A` | 01/02/03 | `overall: incorrect`，推翻 2 处 |
| `RvPhase6B` | 04/05/06/07 | `overall: incorrect`，推翻 1 处（独立发现同一处 lifecycle 断言）+ 新增 1 处漏报 |

**3 处推翻已全部修入 `phase-6-pre-research.md`**，其中第 3 处把一个「已完成」项
**升级为候选任务 T3**——说明复核的价值不只在找误报，也在找漏报。

---

## 1. 主决策一：T1 HTTP 超时的修法

### 1.1 事实（已实测）

| 位置 | 超时状态 | 证据 |
|---|---|---|
| `turn/step.ts`（**活轨主请求**） | **无** | `:134` `const fetchImpl = request.fetchImpl ?? fetch` |
| `core/query/compaction/summarize.ts` | **无** | `:67` `await fetch(...)`，全文件无 `setTimeout` |
| `core/tools/taskTool.ts` | 有，**硬编码 30s** | `:137` `setTimeout(() => controller.abort(), 30_000)` |
| `core/commands/btwCommandRuntime.ts` | 有，**硬编码** | `:35` `setTimeout(() => controller.abort(), timeoutMs)` |
| `provider/request/fetch.ts` | **有，且已可配** | `:32-34` 三个默认值（`DEFAULT_CONNECT_TIMEOUT_MS = 30_000` / `HEADERS = 120_000` / `BODY = 120_000`）；`:78-89` 读 `CHEERS_PROVIDER_{CONNECT,HEADERS,BODY}_TIMEOUT_MS` |

`provider/request/fetch.ts` 的**唯一调用者**是启动预检：

```bash
grep -rn "createProviderFetchFromEnv" packages/ts-shell/src --include='*.ts' | grep -v test
# → core/shell/providerReadiness.ts:6   import
# → core/shell/providerReadiness.ts:149 const fetchImpl = options.fetchImpl ?? createProviderFetchFromEnv()
# → provider/request/fetch.ts:36        export
```

活轨侧无人把 `fetchImpl` 传进 `step`：

```bash
grep -rn "fetchImpl" packages/ts-shell/src/entrypoints packages/ts-shell/src/turn packages/ts-shell/src/core/agent --include='*.ts' | grep -v "\.test\."
# → turn/step.ts:77   readonly fetchImpl?: typeof fetch;      （字段）
# → turn/step.ts:134  request.fetchImpl ?? fetch               （默认值）
# 无任何生产调用方传入
#
# 注意：不带 `grep -v test` 时还有 21 处命中，全在 turn/step.test.ts（测试注入的假 fetch）。
# 初稿把过滤后的输出当成完整输出展示，**是证据呈现错误**——
# 读者按原命令重跑会看到 21 行额外命中，从而怀疑结论。
```

### 1.2 选项

| 选项 | 内容 | 改动面 | 遗留 |
|---|---|---|---|
| **A** | 把 `createProviderFetchFromEnv()` 的结果作为 `fetchImpl` 传给 `turn/step.ts`；补配置字段 | 小（1 个构造点 + 1 个字段） | `summarize.ts` 仍无超时 |
| **B** | 建统一入口，**五处全部**走同一个 fetch 工厂 | 中（5 个调用点 + 各自的测试） | 无 |
| **C** | 只给 `turn/step.ts` 加一个 `AbortSignal.timeout` | 最小 | 仍是「四处不同实现」的第五种；`summarize.ts` 仍无 |

### 1.3 裁决：**A，并把 `summarize.ts` 一并纳入**

**理由**：

1. **实现已在仓库里，重写是浪费。** `provider/request/fetch.ts` 已解决两件我们也会撞到的事：
   `bodyTimeout` 与 `headersTimeout` **都设**（只设一个仍会在另一阶段挂住），
   以及代理与非代理两条 dispatcher 路径。
2. **`summarize.ts` 必须一起修，但理由要写准确。** 初稿的理由是「主请求超时后会触发压缩，
   而压缩自己发一个无超时的请求」——**这条推理是错的**，已更正：
   - `overflow` 恢复需要**收到 provider 的拒绝**才会触发（`turn/session.ts:243`
     `isOverflowFailure(last)`）——**挂起的请求永远不返回，所以永远不会触发它**。
   - `threshold` 压缩走 `prepareNextStep`（`core/agent/loop.ts:162`），
     在**上一步成功之后**才运行。
   - **正确理由**：压缩请求是**独立于主请求**的一次模型调用，它自己会挂。
     一次会话里主请求健康、而压缩请求挂住是完全可能的（压缩发的 prompt 更长、
     上下文更接近窗口上限），此时**用户看到的是「压缩卡住」而非「回答卡住」**。
   - 所以 `summarize.ts` 该修，但**不是「因为主请求挂死会连带它」**，
     而是「**它是一处独立的、同样会挂死的模型调用**」。
     **这两条理由都指向「一起修」，但第二条才是真的**——按第一条写，
     下一个读者会以为「修了主请求就等于修了压缩」，从而漏掉它。
3. **不选 B**：`taskTool`/`btw` 的硬编码超时各自合理（子代理 30s、旁路问答 15s 的语义不同），
   强行统一会改变它们的既有行为，属**范围外**。登记为补充裁决 §6.4。

**配置字段形态**：沿用 Phase 5 §9.2 第 22 项的裁决（**扁平命名**，不用嵌套对象）：

```ts
readonly httpConnectTimeoutMs?: number;
readonly httpHeadersTimeoutMs?: number;
readonly httpBodyTimeoutMs?: number;
```

**默认值**：沿用 `provider/request/fetch.ts` 现有的 30s/120s/120s。
**不照抄 `pi` 的 5 分钟**——理由：`pi` 的 300s 是**单一 idle 超时**（undici 的
`bodyTimeout`/`headersTimeout` 同值），而我们是三个语义不同的值；
把 `pi` 的单一默认摊到三个字段上会失去区分度。`pi` 的五档选择器（30s/1min/2min/5min/disabled）
**登记为可选增强**（§6.1），不在本轮做。

**环境变量**：三个 `CHEERS_PROVIDER_*_TIMEOUT_MS` **已存在**，保持优先于配置字段
（与 `CHEERS_MAX_TURNS` 的既有约定一致：环境变量覆盖配置文件）。

### 1.4 失败模式

| 失败 | 后果 | 缓解 |
|---|---|---|
| 超时设太短，长思考的模型被掐断 | 正常请求被中止 | 默认 120s 远高于实际；且 `bodyTimeout` 是**空闲**超时不是总时长 |
| 接线后代理配置意外生效 | 请求走错路径 | `resolveTransportDecision` 已有 `noProxy` 匹配；实机验证需同时覆盖有/无代理 |
| 只接了 `step.ts` 没接 `summarize.ts` | **压缩请求仍会挂死**（不是「挂死点迁移」——§1.3 已撤回那条因果，两者是独立调用） | **本裁决强制一并修**（§1.3 理由 2） |

### 1.5 验证方式

**可以隔离验证**：本地起一个**接受连接但永不响应**的 HTTP server，
断言请求在超时后以错误结束而不是永久挂起。这正是 `phase-5-execution.md` §11.6
所缺的那类「真实替身」测试——`turn/stepStream.test.ts` 已建立了这个模式，直接沿用。

---

## 2. 主决策二：T2 metrics 采集面

### 2.1 事实

`observability/metrics.ts` 有完整 sink：

```ts
export function recordCount(name: string, value: number, tags: Record<string, string> = {}): void {
  logger.info(name, { metric: "count", value, ...tags });
}
```

**全仓调用点：1 个。**

```bash
grep -rn "recordCount(\|recordTiming(" packages/ts-shell/src --include='*.ts' --include='*.tsx' \
  | grep -v "observability/metrics.ts" | grep -v "observability/index.ts"
# → entrypoints/cliRuntimeModule.ts:405:  recordCount("cli.prompts", 1, {
```

**写入面已经存在**：`structuredLogger.ts:131` 写 `getGlobalRotatingFileSink().write(entry)`。

⚠️ **但读取面不完整**（复核发现，主代理已核实）：`/log tail` 读的是同一个 sink
（`core/commands/logCommandRuntime.ts:32` `sink.getRecentLines(limit)`），
**但它丢弃 `fields`**（见 §2.4 最后一行）——所以**指标的数值读不出来**。
初稿据此说「读取面已经存在」是**过度声称**：读得到行，读不到值。

### 2.2 选项

| 选项 | 内容 |
|---|---|
| **A** | 补采集点（工具调用、回合耗时、重试次数、压缩触发），不加新命令 |
| **B** | A + 新增 `/metrics` 命令做聚合读取 |
| **C** | 不动（`/log tail` 已能读原始行） |

### 2.3 裁决：**B**

**理由**：

1. **sink 与读取面都在，缺的只是写入。** 这是「声明了能力、没有使用」的典型，
   与 Phase 5 复核轮发现的「内置目录零 `compat`」是同一形态：
   **能力接好了，数据源没接。**
2. **需要 `/metrics` 而不只是 `/log tail`**：⚠️ 初稿的理由（「`/log tail` 输出原始行，需要人肉 grep」）
   **不准确**——`/log tail` **根本不输出原始行**，它把 `fields` 丢掉了（§2.4 最后一行）。
   **正确理由**：指标值写在 `fields` 里，而现有读取路径**不渲染 `fields`**，
   所以没有 `/metrics` 的话，**采集的数据在界面上不可见**。这不是「聚合更舒服」，是「**不加就读不到**」。
3. **明确不抄 `pi`**：复核 §4 已更正——`pi` 的 `telemetry.ts` 是**安装遥测**（opt-in，
   `PI_TELEMETRY`），它的采集面在 `cache-stats.ts` 且是**缓存浪费分析**，不是通用 metrics。
   **本轮要自己定采集面**，这是少数没有参考可抄的决策。

**采集点清单**（每项都要能回答一个真实问题，且**受 §2.4 的同步写盘约束**）：

| 指标 | 类型 | 回答的问题 | 写入时机 |
|---|---|---|---|
| `tool.calls` | count + `tool` tag | 哪些工具在用 | **回合结束时按工具聚合写一次** |
| `tool.duration` | ms + `tool` tag | 哪个工具慢 | 同上 |
| `turn.duration` | ms | 回合耗时分布 | 回合结束写一次 |
| `provider.retries` | count | 重试实际发生频率（Phase 5 T1 的效果度量） | 回合结束写一次 |
| `compaction.runs` | count + `reason` tag | 压缩触发频率 | 压缩发生时就地写（**低频**，不在热路径） |

**「写入时机」这一列是初稿没有的**，因为初稿误以为 sink 非阻塞（§9.1 第 7 处）。
在 `appendFileSync` 的前提下，**每工具调用写一行是不可接受的**：
一个回合可能有几十次工具调用，每次一次同步磁盘写。
聚合到回合末写一次，把写盘次数从「工具调用数」降到「回合数」。

### 2.4 失败模式

| 失败 | 后果 | 缓解 |
|---|---|---|
| 采集点写在热路径上 | **每次写盘都阻塞事件循环** | ⚠️ **初稿说「sink 已是异步/非阻塞」——错**。`observability/rotatingFileSink.ts:68` 是 `fs.appendFileSync(this.currentFilePath, line, "utf8")`，**完全同步**。所以每个采集点都是一次**主线程磁盘写**。<br>**这条改变了 T2 的设计**：不能无脑在每个工具调用前后都写。做法是**每个回合结束时汇总写一次**（或按工具聚合后写），而不是每次调用写一行。这是 T2 施工时的**硬约束**，不是优化建议 |
| 指标名无命名空间 | 与既有日志行混在一起难筛 | 统一前缀（`tool.`/`turn.`/`provider.`/`compaction.`），且都带 `metric` 字段 |
| 采集量膨胀 | 日志文件变大 | 复用既有轮转；不采每次 token |
| **`/log tail` 读不出指标值** | 加了采集也看不见 | ⚠️ **初稿说「`/log tail` 已能读」——不完整**。`core/commands/logCommandRuntime.ts:44-58` 把每行 `JSON.parse` 后**只渲染 `timestamp`/`level`/`component`/`message` 四个字段**，`:52` 的模板字符串**完全丢弃 `parsed.fields`**。而指标值写在 `fields` 里（`metrics.ts:21` `logger.info(name, { metric: "count", value, ...tags })`）。<br>**后果**：`/log tail` 只会显示 `[INFO] [metric] tool.calls`，**计数与 tag 全部丢失**，grep 也救不回来。**这使 `/metrics` 不是「锦上添花」而是 T2 的必要组成**——没有它，采集的数据无法读出 |

---

## 3. 主决策三：T3 按模型分桶的用量记账

### 3.1 事实（复核发现，主代理已核实）

```ts
// observability/usageTelemetry.ts:108-110
if (usage.model) {
  existing.model = usage.model;
}
```

每个 session 只有**一条扁平记录**，`model` 被**后写覆盖**，token 累加进同一组计数器。
`/cost`（`core/commands/costCommandRuntime.ts:42`）用 `telemetry.model` 取费率。

**后果**：会话中途 `/model` 换模型后，**先前那些 token 会按最新模型的费率计价**。
`/cost` 因此报出一个**不会有人被收取的金额**。

**⚠️ 必须一并迁移的消费者（复核发现，主代理已核实）**——初稿只提了 `/cost`，
**漏了第二处成本计算**：

| 消费者 | 读什么 | 迁移影响 |
|---|---|---|
| `core/commands/costCommandRuntime.ts:42` | `telemetry.model` + 四个 token 字段 | 主路径，按桶渲染 |
| **`cli/interactive/sessionFacts.ts:54`** | `estimateUsageCost(usage)`（**用默认 `USAGE_RATES`**） | **第二处成本计算**，渲染进 TUI 状态栏。它用的是**固定费率**，所以今天就已经不随模型走；改成按桶后必须一起改，否则**两处成本会给出不同的数** |
| `cli/interactive/sessionFacts.ts:82-83` | `usage.totalTokens` / `usage.turnsCount` | 保留在会话级，不变 |
| `observability/usageTelemetry.ts:49-60` `estimateUsageCost` | 四个扁平 token 字段 | **签名要改**（接收一个桶而不是整条记录） |
| `core/commands/contextCommandRuntime.ts:55,69`、`cli/runtime/cliSessionRuntimeFactory.ts:114-116` | `lastPromptTokens` / `lastPromptMessageCount` | **上下文估算用，保持会话级**（§3.4 已说明） |

**这一处是初稿的真实遗漏**：T3 若只改 `/cost`，TUI 状态栏会继续用固定费率报一个数，
而 `/cost` 报另一个数——**同一会话两个金额**，比今天的一处错误更难发现。

### 3.2 选项

| 选项 | 内容 |
|---|---|
| **A** | 记录改为按 `provider/model` 分桶；`/cost` 分组渲染 |
| **B** | 保留扁平总额，只在换模型时**重置** |
| **C** | 记录每个回合的 model，`/cost` 时按回合聚合 |

### 3.3 裁决：**A**

**理由**：

1. **这是记账错误，不是功能缺失。** 已测量的数字（token 数）是**对的**，
   只是被归到了错的模型名下。`phase-5-execution.md` §11.2 第 7 项
   （`maxTokens` 有字段无读者）是「声明了没接线」，这一项是「**接错了**」——
   更隐蔽，因为输出看起来完全正常。
2. **不选 B**：重置会**丢失**先前用量，把「计价错误」换成「数据丢失」，更糟。
3. **不选 C**：按回合记录使记录量随会话线性增长，而 `usageTelemetry` 是**内存态**，
   长会话会累积。按模型分桶的键数量是**模型数**（个位数），有界。

**数据结构**：`SessionUsageTelemetry` 从
`{ promptTokens, completionTokens, ..., model }` 改为
`{ byModel: Record<string, { promptTokens, completionTokens, ... }>, turnsCount, ... }`。
**保留一个总额**（`totalTokens`）用于快速显示，但**费率必须按桶算**。

**`/cost` 渲染**：按桶分组，每桶一行 `model · tokens · rate · cost`；
单模型会话时**输出与今天完全一致**（这是兼容性要求：不能因为修记账而改变常见情况的输出）。

### 3.4 失败模式

| 失败 | 后果 | 缓解 |
|---|---|---|
| 改变单模型会话的输出 | 用户看到格式变化 | **兼容性要求**：单桶时走原渲染路径 |
| `promptMessageCount` 等辅助字段语义变化 | 上下文估算出错 | 这些字段（`lastPromptTokens`/`lastPromptMessageCount`）是**上下文估算用**，不是成本用；保持会话级、不进桶 |
| 迁移旧记录 | 旧内存态无 `byModel` | `usageTelemetry` 是**内存态**（`Map`），进程重启即空，**无持久化、无迁移** |

### 3.5 验证方式

同一 session 记两次不同 model 的用量，断言各自归属到自己的桶、且总额不变。
反向验证：把分桶还原为扁平覆盖 → 测试必须失败。

---

## 4. 主决策四：T4 Bug report

### 4.1 事实

- 无 bug report：`grep -rniE "bug.?report" packages/ts-shell/src --include='*.ts' | grep -v test` → 空
- 已有单一脱敏实现：`core/security/redaction.ts:42` `redactReportText`
- 已有数据源：`observability/crashLog.ts:51` `readCrashLog`
- **无 zip 依赖**：`packages/ts-shell/package.json` 依赖只有 5 个（`ignore`/`picomatch`/`playwright-core`/`typescript`/`undici`）

### 4.2 选项

| 选项 | 内容 | 依赖 |
|---|---|---|
| **A** | 复用 `redactReportText` + 用 `node:zlib` 手写 zip | **零新增** |
| **B** | 引入 zip 库 | +1 依赖 |
| **C** | 输出目录而非 zip | 零依赖，但分享不便 |

### 4.3 裁决：**A**

**理由**：

1. **`node:zlib` 自带 `crc32` 与 `deflateRawSync`**，实测可用：

   ```bash
   node -e "const z=require('node:zlib'); console.log(typeof z.crc32, typeof z.deflateRawSync)"
   # → function function      （node v24.15.0）
   ```

   `pi` 的 zip 写入器（`packages/coding-agent/src/utils/zip.ts`，**72 行**）
   **正是只用这两个 API 手写的**（`import { crc32, deflateRawSync } from "node:zlib"`）。
   72 行换一个依赖是不划算的。

   ⚠️ **但有一个必须处理的引擎下限问题**（复核发现，主代理已核实）：

   | 事实 | 证据 |
   |---|---|
   | 本仓声明 `"node": ">=20.0.0"` | `package.json` `engines` |
   | CI 用 `node-version: 20` | `.github/workflows/ci.yml:20` |
   | `zlib.crc32` 需要 **Node ≥ 20.15.0** | 该 API 于 v22.2.0 加入并回移至 v20.15.0 |
   | 本仓**已经**用到 ≥20.3.0 的特性 | `turn/step.ts:202` `AbortSignal.any([...])`（需 20.3.0） |

   **所以在 20.0.0–20.14.x 上 `z.crc32` 是 `undefined`**，bug report 会以
   `TypeError: z.crc32 is not a function` 失败——**而这是在用户已经出事、来求助的时候失败**，
   是最不能失败的路径。

   **CI 不会抓到它**：`node-version: 20` 由 `actions/setup-node` 解析为**最新的 20.x**
   （≥20.15，有 `crc32`），而声明写的是 `>=20.0.0`。
   所以**只有真实用户的旧 20.x 会撞到**，而门禁全绿。
   这是「声明与实际不符」的典型：**契约允许的版本比代码实际能跑的版本更宽**。

   **裁决：T4 必须同时做下面两件事之一，由施工时按实际情况择一：**
   - **(a) 提高声明的引擎下限到 `>=20.15.0`**（并在 CI 里固定到 ≥20.15），
     理由是本仓**实际**已要求 ≥20.3.0，声明本身已不准确；或
   - **(b) 不依赖 `zlib.crc32`**，改为**自己实现 CRC-32 表**（约 20 行常量表 + 循环）——
     `deflateRawSync` 仍在 20.0.0 就有，只有 `crc32` 是新的。

   **倾向 (a)**，因为 (b) 会让「零新依赖」变成「零新依赖 + 自写校验和」，
   而自写 CRC-32 是**又一个可以写错的地方**；但 (a) 是**契约变更**（提高引擎要求），
   必须显式记录。**这条在选择 T4 时就要一起定，不能留到施工**——
   `phase-5-decisions.md` §0.1 的纪律是「开工前把需要拍板的事全部定下来」。
2. **复用 `redactReportText` 而非新建脱敏**：该模块的注释明确它存在的理由就是
   「同一套十一条规则曾被手抄进六个模块」，**新建第二套脱敏正是它要消灭的问题**。
3. **打包内容的脱敏必须在写入前**，不是写入后。构造含密钥的输入、断言产物字节里不含密钥——
   这是可隔离验证的核心断言。

**产物结构**（照 `pi` 的形态，字段名用我方词汇）：

```
cheers-report-<timestamp>.zip
  report.json        环境与版本
  crashes.json       最近 5 条崩溃（redactReportText 处理）
  session-summary.md 会话摘要
```

### 4.4 失败模式

| 失败 | 后果 | 缓解 |
|---|---|---|
| 脱敏漏字段 | **密钥泄漏到磁盘** | 断言必须扫描**产物字节**，不是扫描结构化字段 |
| zip 格式不合规 | 用户解不开 | 手写 zip 是固定格式，测试用一个已知 zip 工具校验（`unzip -t`） |
| 打包了 session 全文 | 泄漏用户代码 | **明确不含** session 全文，只含摘要；登记为补充裁决 §6.2 |

---

## 5. 主决策五：T5 文档表格回写

### 5.1 事实

`phase-6-pre-research.md` §1 逐行核对后：44 个看似开放的条目里 **25 个已实现但未标注**。

### 5.2 裁决：**做，且排在最后**

**理由**：

1. **这不是文档工作，是正确性工作。** 表格是下一个读者的**第一层输入**。
   `phase-5-execution.md` §11.6 已证明「过时判定会导致错误决策」——
   本轮的主代理自己就被 `03-*` 的表格误导过（把 HTTP 超时判为「需要新实现」，
   实际是「实现已在、只需接线」）。
2. **但回写要拆成两段，不是一次**（复核发现，主代理已核实并采纳）：

   初稿说「排最后，否则要回写两遍」——**这条理由只对了一半**。
   25 行滞后描述的是 **Phase 1–5 早已实现**的能力，**T1–T4 的施工不会让它们再变**。
   把它们压到最后，等于让 T1–T4 的施工者**在整个施工期间继续被同一张错表误导**——
   而 §5.2 的理由 1 恰恰说「过时判定会导致错误决策」。
   初稿的主代理自己就是被 `03-*` 那张表误导的（把「接线任务」当成「需要新实现」）。

   **修正后的做法**：
   - **T5a（施工前）**：回写 **25 行已实现的判定**。它们与 T1–T4 无关，现在就能定稿。
   - **T5b（施工后）**：只回写 **T1–T4 改变的少数几行**。

   这样既避免了「误导施工者」，也避免了「回写两遍」——**两段各自只写一次**。

**回写范围**：7 份文档的**判定列** + 每处 `✅ 已收口` 说明，
以及 `_index.md` 的汇总表与 summary。

**验证**：`npm run verify:docs-drift:strict`。

---

## 6. 补充裁决（15 项）

### 6.1 逐项裁决

| # | 事项 | 裁决 | 理由 |
|---|---|---|---|
| 1 | `pi` 式五档超时选择器（30s/1min/2min/5min/disabled） | **不做**（登记为可选增强） | 三个字段各给五档会产生 125 种组合；`pi` 是单一值所以五档成立。本轮给字段 + 环境变量足够 |
| 2 | Bug report 含 session 全文 | **不做** | 泄漏用户代码。只含摘要 |
| 3 | Bug report 上传（`pi` 有 `bug-report-upload.ts`） | **不做** | 对外请求 + 需用户同意，属产品决策（见 §7） |
| 4 | 统一 `taskTool`/`btw` 的硬编码超时 | **不做** | 两者语义不同（子代理 30s / 旁路问答 15s），强行统一改变既有行为，超出 T1 范围。**登记现状**，避免下一个读者当成遗漏 |
| 5 | 扩展宿主（01） | **不做**，独立立项 | 见 §7 |
| 6 | 对外协议 / SDK（02） | **不做**，维持 Phase 5 §9.2 | 见 §7 |
| 7 | HTML 导出（02） | **不做**，维持 Phase 5 §9.2 | 需引入渲染依赖；我方依赖面刻意保持 5 个 |
| 8 | 更新检查（06） | **不做**，独立立项 | 涉及对外请求，须先决定「是否允许未经询问的联网」 |
| 9 | Cache 命中率（03） | **不做** | provider 是否报缓存取决于端点，比例可能不可比 |
| 10 | `provider/request/fetch.ts` 的 `noProxy` 语义 | **维持** | 已实现且正确（`matchesNoProxy`）；T1 接线后需实机覆盖有/无代理两条路径 |
| 11 | T1 的默认值是否照 `pi` 的 5 分钟 | **不照抄**，维持 30s/120s/120s | 见 §1.3 |
| 12 | metrics 是否采样（避免长会话膨胀） | **不采样** | 指标行很小且 sink 有轮转；采样会让「重试了几次」这类计数失真 |
| 13 | T3 的 `byModel` 是否持久化 | **不持久化** | `usageTelemetry` 是内存态 `Map`，进程重启即空；持久化是新契约，超出记账修复范围 |
| 14 | 本轮是否重跑 `analyze-boundaries.py` 数字 | **做** | `phase-6-pre-research.md` 未给新的可达性数字（本轮无代码改动），但 T1–T4 施工后需重测并对比 |
| 15 | T4 的 `zlib.crc32` 引擎下限 | **提高声明下限到 `>=20.15.0`**（见 §4.3） | 本仓已实际要求 ≥20.3.0（`AbortSignal.any`），声明 `>=20.0.0` 本就不准确；自写 CRC-32 会引入又一个可写错的地方。**这是契约变更，必须显式记录** |

### 6.2 一处需要记录的判断：T2 与 T3 的顺序

候选顺序是 **T1 → T2 → T3 → T4 → T5**（T5 拆为 T5a/T5b，见 §5.2）。
T3（记账错误）排在 T2（采集面）之后，但**都排在 T4（bug report）之前**。

理由：**T3 是唯一一处「输出看起来正确但数值是错的」**。
T1 的失败是「挂住」（用户立刻发现），T2 的失败是「没有数据」（能力缺失，不误导），
而 T3 的失败是**「报出一个错的金额且看起来完全正常」**。
按「误导性」排序，T3 应当尽早。

**⚠️ 初稿的共享路径理由是错的**（复核发现，主代理已核实）：
初稿说「T2 与 T3 有共享的写入路径，所以 T2 先做能顺带提供 T3 需要的计数」——
**不成立**。两者写的是**完全不同的存储**：

| | T2 | T3 |
|---|---|---|
| 写入目标 | `observability/metrics.ts:21` `logger.info(...)` → 结构化日志 → 轮转文件 | `observability/usageTelemetry.ts:65` `recordSessionUsage` → **进程内 `Map`** |
| 持久化 | 落盘 | **不落盘**（进程重启即空） |
| 键 | 指标名 + tag | session id |

**两者之间没有共享路径，T2 也不会「顺带」给 T3 提供任何东西。**

**修正后的顺序理由**（初稿的两条都站不住，这是重新论证后的结果）：

**T2 与 T3 之间没有依赖关系，顺序可以互换。** 我试图为「T2 先」找理由，
找到的两条（共享存储、落点相邻）**经核实都不成立**——重试事件在
`turn/projection.ts:101` 投影，与 `recordSessionUsage`（`turn/step.ts:271`）不在同一处。

**保留的顺序是 T2 → T3，但理由是「按影响面从大到小」，不是依赖**：
T2 影响的是「有没有数据」（全仓 1 个采集点 → 一批），
T3 影响的是「已有的一个数字是否可信」（三行累加逻辑）。
**若施工时发现 T3 更该先做，调换没有代价**——这一点明确写下来，
避免下一个读者把不存在的依赖当成约束。

---

## 7. 明确不做的事，与理由

| 项 | 理由 | 依据 |
|---|---|---|
| **扩展宿主** | 需定义加载、隔离、权限、生命周期四件事，且**无隔离验证手段**（要执行第三方代码）。这是产品级决策，不是缺陷修复 | Phase 5 §9.2 对 RPC/SDK 的同一理由 |
| **对外协议 / SDK** | framing + 远程审批应答是新契约 | Phase 5 §9.2 |
| **HTML 导出** | 需渲染依赖 | Phase 5 §9.2 |
| **更新检查** | 涉及对外请求，须先决定「是否允许未经询问的联网」 | 本轮新增 |
| **图片输入 / 转录内搜索 / Mermaid / cache warming / 传输选择** | 维持 Phase 5 §9.2 逐项理由 | Phase 5 §9.2 |

**一处必须登记的交叉引用**：Phase 5 §9.2 第 16 项裁定图片输入「不做」时，
理由写的是「**T3 的 `input` 字段是它的前置，先做 T3**」。
而 Phase 5 的**复核轮把 `input` 字段删除了**（`phase-5-decisions.md` §3.2 的撤销记录），
理由是本产品**没有任何图片输入路径**，该字段没有可能的消费者。

**所以那条理由现在是不成立的**：`input` 字段**不会**先做，它被撤了。
图片输入若要做，需要**重新从「消费者是谁」开始推导**，而不是假设前置已备。
这不是新裁决，是**对既有裁决记录的一处更正**——按 Phase 5 自己确立的纪律
（`phase-5-execution.md` §11.6），过时的理由会让下一个读者做出错误决策。

**这五项登记为「有需要时再做」，不是「永远不会做」。** 每一项都需要一次**独立立项**，
因为它们都不是「修复」，而是「新增一个产品能力」。

---

## 8. 施工顺序与验证纪律

### 8.1 顺序

```
T5a 回写 25 行既有判定（施工前）
  →  T1 HTTP 超时接线  →  T2 metrics 采集  →  T3 按模型分桶  →  T4 bug report
  →  T5b 回写 T1–T4 改动的行（施工后）
```

### 8.2 每个任务的强制验证

1. **反向验证**：把实现还原 → 新测试必须失败 → 恢复。
   （Phase 5 的纪律，`phase-5-execution.md` §11.5）
2. **实机验证**（凡有可执行面）：
   - T1：本地永不响应的 server + 真实 CLI
   - T2：真实会话后 `/metrics` 输出
   - T3：真实换模型后 `/cost`
   - T4：真实产物 + `unzip -t` + **密钥扫描**
3. **门禁**（每个提交前）：
   `tsc --noEmit`、`verify:import-cycles`、`check:config-consumers`、`check:declarations`、
   `verify:docs-drift:strict`、`test:scripts`、`analyze:module-facades`、`analyze-boundaries.py`、
   `normproof judge`

### 8.3 一处纪律：新配置字段必须同时有读取者

T1 会新增 3 个配置字段。`npm run check:config-consumers` 会检查
「声明的字段是否有生产读取者」——**这是门禁不是提醒**，接线不完整会让它失败。
Phase 5 的记录（`config-consumers` 24 → 32 字段全部有读取者）是这条纪律的既有实践。

---

## 9. 复核记录

本裁决经**两个对抗式复核者**逐项证伪（`RvDec6A` 覆盖 §1/§2，`RvDec6B` 覆盖 §3–§7），
**共推翻主代理 9 处**（4 处推理错 + 3 处证据不实 + 2 处引用漂移）。全部已修入本文件。

**两个复核者都判 `overall: incorrect`。**

| # | 初稿 | 实际 | 谁发现 | 处置 |
|---|---|---|---|---|
| 1 | §1.3 理由 2：「主请求超时后会触发压缩，压缩请求自己会挂」 | **推理错**：挂起的请求永不返回，**不会触发 overflow 恢复**（`turn/session.ts:243` 要收到 provider 拒绝）；threshold 压缩在**上一步成功之后**才跑（`core/agent/loop.ts:162`） | 主代理自查 + `RvDec6A` 追问 | 改写理由：压缩请求是**独立的**会挂死的调用（见 §1.3） |
| 2 | §3.1 引用 `usageTelemetry.ts:106-108`、`costCommandRuntime.ts:41` | **行号漂移**：实际是 `:108-110` 与 `:42` | `RvDec6B` | 已改 |
| 3 | §3.1 只提 `/cost` 一个消费者 | **漏了第二处成本计算**：`cli/interactive/sessionFacts.ts:54` `estimateUsageCost(usage)` 用**默认费率**渲染进 TUI 状态栏。只改 `/cost` 会让**同一会话出现两个金额** | `RvDec6B` | §3.1 补消费者表；T3 范围扩大 |
| 4 | §4.3 「`node:zlib` 零依赖」 | **引擎下限不成立**：声明 `>=20.0.0`、CI 用 Node 20，而 `zlib.crc32` 需 **≥20.15.0**。在 20.0.0–20.14.x 上 bug report 会 `TypeError` —— **恰好在用户来求助时失败** | `RvDec6B` | §4.3 补引擎下限分析 + 两个选项；**新增补充裁决 15** 裁定提高下限 |
| 5 | §6.2 「T2 与 T3 有共享写入路径」 | **错**：metrics 写日志文件，usageTelemetry 写进程内 `Map`，**无共享路径** | `RvDec6B` | 改写：承认**无依赖关系**，顺序可互换 |
| 6 | §5.2 「T5 必须排最后，否则要回写两遍」 | **只对一半**：25 行滞后描述的是 Phase 1–5 早已实现的能力，**T1–T4 不会让它们再变**；压到最后等于让施工者继续被错表误导 | `RvDec6B` | 拆为 **T5a（施工前回写 25 行）/ T5b（施工后回写 T1–T4 改动的行）** |

**第 4 处是本轮最有价值的发现**：它把一个「零依赖、很简单」的判断，
变成了一个**必须在开工前拍板的契约变更**。若留到施工，
T4 的开发者会在 Node 20 上撞到 `TypeError`，而那时用户已经在求助路径上。

**第 6 处改变了执行计划**：T5 从「一个末尾任务」变成「两段」，其中一段**必须在施工前做**。

### 9.1 `RvDec6A` 追加的 5 处（§1/§2）

| # | 初稿 | 实际 | 处置 |
|---|---|---|---|
| 7 | §2.4「sink 已是**异步/非阻塞**」 | **完全同步**：`rotatingFileSink.ts:68` `fs.appendFileSync(...)`。每个采集点都是**主线程磁盘写** | §2.4 改为**硬约束**：按回合汇总写，不是每次调用写一行 |
| 8 | §2.1「`/log tail` 读的是同一个 sink」→ 暗示读取面已备 | **它丢弃 `fields`**：`logCommandRuntime.ts:44-58` 只渲染四个字段，`:52` 不渲染 `parsed.fields`。**指标的数值读不出来** | §2.1 改为「读得到行，读不到值」；§2.3 理由改为「**不加 `/metrics` 就读不到**」 |
| 9 | §1.1 的 grep 证据只展示生产命中 | **原命令会命中 `step.test.ts` 21 处**（测试注入假 fetch）。初稿展示的是过滤后的输出，**未标注过滤** | 命令补 `grep -v "\.test\."` 并把「另有 21 处测试命中」写进注释 |
| 10 | §1.1 引用 `fetch.ts:33-35`、`:83-92` | **漂移且漏了 connect**：默认值在 `:32-34`，env 解析在 `:78-89` | 已改 |
| 11 | §1.4 仍写「挂死点迁移」 | **与 §1.3 已撤回的因果矛盾**——同一文件里两处说法冲突 | §1.4 改为「压缩请求仍会挂死」，并注明 §1.3 已撤回那条因果 |

**第 7、8 两处是本轮最实质的发现**，因为它们**改变 T2 的设计**：
初稿把 T2 当作「加几个调用点」，实际是「加调用点 + 控制写盘频率 + 提供读取路径」。
若按初稿施工，会得到一个**每次工具调用都同步写盘、且读不出数值**的 metrics。

**第 11 处是一个值得单独记的教训**：我在 §1.3 撤回了错误因果，却**没有回头检查 §1.4 引用它的地方**——
**一处更正必须扫全部引用点**，否则同一文档里会留下互相矛盾的两段。
这与 Phase 5 复核轮「改了实现没改注释」是同一形态。

---

## 10. 未做的事（如实记录）

| 项 | 原因 |
|---|---|
| 复核者对本裁决的**二次复核** | 两个复核者各覆盖一半，**没有第三人对「修正后的版本」再核一遍**。已修 6 处，每处都给出可复现命令 |
| `pi` 的扩展宿主逐文件对照 | §7 已裁定不做；若该裁决被推翻，需单独一轮深度研究 |
| 任何代码改动 | 本文件性质是裁决 |
| T1 的实机复现 | 属施工阶段；本文件只声明验证方式 |
| Node 20.15 以下的行为实测 | 本机只有 v24.15.0；引擎下限结论来自 API 加入版本，**未在 20.14 上实跑验证**——标注为 `UNVERIFIED`，但**提高下限的处置是安全的**（不会因为结论错而引入故障） |
