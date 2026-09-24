---
title: "Phase 6 执行记录：4 项任务与 25 行判定回写"
category: article
sources: [phase-6-pre-research-2026-09-23, phase-6-decisions-2026-09-23, phase-5-execution-2026-09-23]
created: 2026-09-24
updated: 2026-09-24
tags: [features, phase-6, execution]
summary: "Phase 6 施工记录。按裁决顺序执行：T5a 回写 25 行滞后判定（**先做，因为它本身就是正确性工作**）→ T1 HTTP 超时接线 → T2 metrics 采集与读取 → T3 用量按模型分桶 → T4 `/report` 与 zip 写入器 → T5b 收尾。四项代码任务全部有**反向验证**（还原实现 → 测试必须失败）与**实机验证**（构建产物 + 真实运行），无一项只靠单元测试。三处执行中偏离裁决（`summarize.ts` 一并接线、T4 提高引擎下限、`/metrics` 跨进程读日志），均在本文说明。"
confidence: high
---

# Phase 6 执行记录

> **性质**：施工记录。裁决见 [`phase-6-decisions.md`](phase-6-decisions.md)，盘点见 [`phase-6-pre-research.md`](phase-6-pre-research.md)。
> **顺序**：**T5a → T1 → T2 → T3 → T4 → T5b**（T5 拆两段，理由见裁决 §5.2）。

| 提交 | 任务 | 规模 |
|---|---|---|
| `a5858658` | T5a 回写 25 行滞后判定 | 7 文件 |
| `e9476687` | T1 HTTP 超时接线 | 6 文件 + 1 新测试 |
| `2d34215e` | T2 metrics 采集与 `/metrics` | 8 文件 + 2 新测试 |
| `db576061` | T3 用量按模型分桶 | 6 文件 + 2 新测试 |
| `dfcccc71` | T4 `/report` 与 zip 写入器 | 5 文件 + 1 新测试 |

---

## 1. T5a — 回写 25 行滞后判定

**为什么先做**：裁决 §5.2 的修正结论。25 行描述的是 Phase 1–5 **早已实现**的能力，
T1–T4 的施工**不会让它们再变**；压到最后等于让施工者**在整个施工期间继续被同一张错表误导**。
初稿的主代理自己就是被 `03-*` 那张表误导的（把「接线任务」当成「需要新建」）。

**方法**：对 01–07 每一行**回到代码核对**，标出四种状态。表格判定列改为
`✅ 已收口（2026-09-23 更正）` 并附证据；`### 2.x` 详情节同步加「更正说明」。

**一处必须记的自我更正**：`01-*` §2.2 的技能表有 **3 行已过时**——
祖先目录搜索（`skillLoader.ts:84` 用 `projectDirectories`）、
注入清单（`:252` `renderSkillList` 产出 `<available_skills>`）、
`disable-model-invocation`（`:219`）**都已实现**，而表里写的是「无」。

**索引汇总表改为两行**：初稿数字与重数结果并列，差额本身就是发现。

| | DEFICIENT | MISSING | OURS-ONLY | 平手 |
|---|---:|---:|---:|---:|
| 各文初稿时 | 40 | 38 | 16 | 7 |
| **2026-09-23 重数** | **16** | **21** | **16** | **10** |

---

## 2. T1 — HTTP 超时接线

### 2.1 施工内容

**接进活轨**（不是新建）：`provider/request/fetch.ts` 的实现本来只被启动预检使用。

| 位置 | 改动 |
|---|---|
| `entrypoints/cliRuntimeInvocation.ts` | `createProviderStep` 传 `fetchImpl: providerFetch(request.runtimeConfig)` |
| `cli/runtime/cliSessionRuntimeFactory.ts` | 压缩的两条路径（`summarize`/`summarizeTurnPrefix`）同样传 |
| `provider/request/fetch.ts` | 新增 `ProviderTimeoutOverrides`、`providerFetchFromTimeouts`（**按超时三元组记忆化**）、`providerTimeoutsFrom` |
| `config/runtimeConfig.ts` | 3 个字段 `providerConnectTimeoutMs`/`providerHeadersTimeoutMs`/`providerBodyTimeoutMs` |

**默认值 30s/120s/120s**（沿用既有实现），**环境变量仍优先**——
与 `CHEERS_MAX_TURNS` 的既有约定一致：环境变量是关于本次运行的声明，文件是长期偏好。

**记忆化的理由**：wrapper 持有 undici dispatcher，逐 prompt 新建会累积无人关闭的连接；
按三元组做键意味着**改超时会产生新 wrapper**，而不是静默保留旧期限。

### 2.2 执行中偏离裁决：`summarize.ts` 一并接线

裁决 §1.3 已定「一并修」，但**理由被改写**——初稿的因果是错的（挂起的请求永不返回，
不会触发 overflow 恢复）。正确理由是**压缩请求是独立的模型调用，它自己会挂**。
已在裁决 §1.3 与本文同时记录。

### 2.3 反向验证

还原 `resolveProviderTransportConfig` 忽略配置超时 → **2/11 失败**。

### 2.4 实机验证

| 场景 | 结果 |
|---|---|
| 「答就绪（`/models`）但不应答」的 provider，配置 3s 超时 | 请求**结束**，4 次尝试（1 + 3 重试）后报网络错误 |
| **对照**：同一静默 server，全局 `fetch` vs provider fetch | 全局 `fetch` **4 秒仍在等待**；provider fetch **2.5 秒抛出**（2s 期限） |

**对照实验是决定性证据**：它同时证明了「旧路径真的会无限等待」与「新路径真的会结束」。
初稿曾试图用「去掉接线再跑 CLI」来对比，但那次的 mock server 已退出，
结果无效——**已如实更正为这个受控对照**。

---

## 3. T2 — metrics 采集与读取

### 3.1 施工内容

**5 类采集点**，每项回答一个真实问题：

| 指标 | 位置 | 回答 |
|---|---|---|
| `tool.calls` / `tool.duration` | `core/agent/tools.ts:253-254`（**唯一工具执行入口**，串行与批量都经此） | 哪些工具在用、哪个慢 |
| `turn.duration` | `core/agent/loop.ts:90` | 回合耗时 |
| `provider.retries` | `loop.ts:124` | 重试实际发生频率（Phase 5 T1 的效果度量） |
| `compaction.runs` | `cliSessionRuntimeFactory.ts:235` | 压缩触发频率 |

**按回合批量写**：`metrics.ts` 改为累加器 + `flushMetrics()`。
**这不是优化**——sink 是 `fs.appendFileSync`（**同步**），逐调用写会在热路径上放几十次阻塞磁盘写。
累加器保留 count/total/max，所以 40 次工具调用产出几行而不是 40 行。

**`/metrics` 命令**：渲染 count 总和与 ms 平均/最大。

### 3.2 执行中偏离裁决：跨进程读日志

裁决未预见的一点：sink 是 `<prefix>.<date>.<pid>.log`，**只读当前进程的文件会在下次运行时看不到上次的数字**——
而指标恰恰在会话结束后才有意义。改为读**当天目录下所有日志文件**，按 mtime 排序后取尾部。
`/log tail` 保持进程内范围（它适合看正在跑的运行）。

**这个偏离是实机发现的**：先按裁决实现，实机跑 `/metrics` 得到「No metrics recorded yet」，
而日志里明明有 5 行指标。**测试也因此改过一版**：初版用同一进程的两个 sink，
它们共享 PID 故写同一个文件，**反向验证时不失败**——改成两个不同 PID 才真正测到跨文件读取。

### 3.3 反向验证

| 还原项 | 结果 |
|---|---|
| 改回逐调用写（不缓冲） | **2/9 失败** |
| 改回只读当前进程日志 | **1/6 失败**（修正 PID 后） |

### 3.4 实机验证

真实会话（mock provider，含一次工具调用）后 `/metrics`：

```
| `cli.prompts` | — | 2 | total 2 |
| `tool.calls` | tool=read outcome=ok | 1 | total 1 |
| `tool.duration` | tool=read | 1 | avg 4ms · max 4ms |
| `turn.duration` | — | 1 | avg 48ms · max 48ms |
```

日志里 5 行 `"component":"metric"`，**tags 与计数都保留**。

---

## 4. T3 — 用量按模型分桶

### 4.1 施工内容

`SessionUsageTelemetry` 从**单条扁平记录**改为 `byModel: Record<string, ModelUsageBucket>`。

**必须一并迁移的第二个消费者**（复核发现）：`cli/interactive/sessionFacts.ts:54`
也计算成本（用固定回退费率渲染进 TUI 状态栏）。**只改 `/cost` 会让同一会话出现两个金额**——
比原来的缺陷更难发现。两处现在都经 `estimateSessionCost` 按模型取费率。

**保持不变**：单模型的**表格与数字逐字不变**（兼容性要求）；
`lastPromptTokens`/`lastPromptMessageCount` 仍是会话级（上下文仪表描述的是对话，不是最后读它的模型）。

**⚠️ 一处被实测推翻的断言**：初稿与提交信息写「单模型输出**逐字不变**」——
**不准确**。用 worktree 跑旧版本对比，发现**结尾那句变了**：

```
旧：The money is an estimate at a fixed rate that does not follow the model in use …
新：Some rates are estimates at a fixed fallback that does not follow the model in use …
```

**改动本身是对的**（多模型时可能有的发布费率、有的不发布，平铺陈述会对至少一张表撒谎），
但**「逐字不变」的说法是错的**，已更正为「表格与数字逐字不变」。
这是「用对比验证兼容性声称」而不是「用推理声称兼容性」的一个实例——
若只读代码推理，这条会一直留在文档里。

### 4.2 反向验证

| 还原项 | 结果 |
|---|---|
| 分桶退化为单桶（扁平覆盖） | **5/13 失败**（`usageTelemetry`）+ **2/5 失败**（`/cost`） |

**一处如实记录的局限**：试图用「所有模型套同一费率」来反向验证 `/cost` 时**测试不失败**——
因为**内置目录里没有一个模型声明 `cost`**（`grep -c 'cost:' core/models/catalog.ts` → 0），
所有费率都走固定回退值，套谁都一样。所以 `/cost` 的费率泄漏**在现有目录下不可测**；
能测到的是分桶本身（已覆盖）。**这条限制写进了提交信息与文档。**

### 4.4 全量套件抓出 4 处受影响的既有测试（已修）

改形状必然影响读旧形状的测试。**全量套件（不是受影响套件）抓出 4 项**：

| 测试 | 读的字段 | 修法 |
|---|---|---|
| `turn/step.test.ts` ×3（OpenAI 形状 / Anthropic 形状 / 无缓存） | `usage.cacheReadTokens` 等 | 改读 `usage.byModel.m?.cacheReadTokens` |
| `core/shell/compaction.test.ts` ×1 | `usage.totalTokens` | 改用 `totalTokens(usage)` 辅助函数 |

**这 4 项断言的是真实行为**（缓存字段的解析、会话总量），**不是实现细节**——
所以修的是**读取路径**，不是把断言弱化。**已反向验证**：
去掉 bucket 的缓存累加 → 其中 2 项失败，证明它们仍能捕获真实缺陷。

**这条值得单独记**：`npm run test:ts` 是**唯一**发现这 4 项的东西。
受影响套件（`src/observability/`、`src/core/commands/`）全绿，
因为它们**不包含** `turn/step.test.ts` 与 `core/shell/compaction.test.ts`。
**「改了共享数据结构就一定要跑全量」**——这是 Phase 5 复核轮
（`cli-baseline` 抓出 T1 回归）之后的第二次同型教训。

### 4.3 实机验证

两模型（cheap 1,000,000 / dear 2,000,000）→ **两张独立表 + `Session total: $0.4200`**；
单模型 → 输出与修复前一致（`Model \`solo\``）。

---

## 5. T4 — `/report` 与 zip 写入器

### 5.1 施工内容

| 文件 | 作用 |
|---|---|
| `observability/zipArchive.ts` | 手写 zip（**只用 `node:zlib`**，零新依赖） |
| `core/commands/reportCommandRuntime.ts` | `/report [path]`：环境 + 崩溃记录 → 脱敏 → 打包 |
| `package.json` | `engines` 从 `>=20.0.0` 提到 **`>=20.15.0`** |

**复用而非新建脱敏**：`core/security/redaction.ts` 自己的注释记录了
「同一套规则曾被手抄进六个模块」，而 bug report 是**唯一离开本机**的路径——
最不能有私有副本的地方。

**不含会话内容**：bug report 不是拷走用户代码的理由。

**测试断言扫描归档字节**，不是结构化字段——「漏在某个没想到要脱敏的字段里」
正是逐字段检查会漏掉的情形。

### 5.2 执行中偏离裁决：提高引擎下限

裁决 §6.1 第 15 项已定「提高下限」，执行时**独立核实了版本事实**：
Node 官方发布说明确认 `zlib.crc32` 于 **v22.2.0** 加入、**回移至 v20.15.0**。
声明是 `>=20.0.0`，CI 用 `node-version: 20`（解析为最新 20.x，**不会抓到**），
所以**只有真实用户的旧 20.x 会撞到 `TypeError`**——恰好在用户来求助时失败。

**同时更正一处既有不准确**：本仓**已经**用到 `AbortSignal.any`（需 20.3.0），
所以 `>=20.0.0` 本就不准确。

### 5.3 反向验证

去掉崩溃消息的脱敏 → **1/8 失败**（字节扫描捕获）。

### 5.4 实机验证

| 检查 | 结果 |
|---|---|
| `unzip -t` | `No errors detected` |
| 内容往返 | `report.json` / `summary.md` 逐字还原 |
| **密钥在原始字节中** | **不存在**（`grep -q sk-live-… out.zip` → 未命中） |
| 消息字段 | `api_key=[redacted]` |
| 命令输出 | 报出路径、崩溃数、`Scrubbed: unsafe-content` |

**zip 格式合规由系统 `unzip` 独立验证**，不是我自己的读取器自证。

---

## 6. 门禁与测试

每个提交前跑：`tsc --noEmit`、`verify:import-cycles`、`check:config-consumers`、
`check:declarations`、`verify:docs-drift:strict`、`test:scripts`、`analyze:module-facades`。

| 门禁 | 结果 |
|---|---|
| `config-consumers` | **32 → 35 字段，全部有生产读取者** |
| `verify:import-cycles` | 通过（0 环） |
| `check:declarations` | 通过（18/18 事件有派发点） |
| `analyze:module-facades` | 仍是原有 **5 个** monolith，**无新增** |
| 受影响套件 | T1 52 文件/529 项、T2 31/283、T3 55/573、T4 27/210 |
| **全量套件** | **509 文件 / 3267 通过 / 1 跳过 / 0 失败**（修复 §4.4 与 §7.1 之后） |
| `analyze-boundaries.py` | 生产 **938 → 941**、CLI 可达 **808 → 812**、testOnly 100 → 99 |

**边界数字的一处说明（2026-09-24 更正）**：生产文件只**新增 3 个**
（`core/commands/metricsCommandRuntime.ts`、`core/commands/reportCommandRuntime.ts`、
`observability/zipArchive.ts`），基线是**紧邻的前一个提交 `3ba4abf8` 的 938**，所以差额正好是 +3。
此前这里写作「937 → 941」并把差额解释为「1 个文件从 testOnly 重分类」——**两处都错**：
937 是更早的 `e2063abd`（Phase 5 记录）的数字，而唯一发生 testOnly→生产 迁移的文件是
`core/security/redaction.ts`（`T` → `CT`），不是 `usageTelemetry.test.ts`（它从来不在生产集合里，
分析器把 `*.test.ts` 排除在外）。

核对方法（可复现）：把 `3ba4abf8` 导出到临时目录后跑
`python3 scripts/analyze-boundaries.py`，得到 `production: 938`；再 diff 两次运行写出的
`/tmp/boundary-report.json` 的 `rows`，得到**新增 3 个文件、标签迁移 3 个**：
`observability/types.ts` 与 `observability/metrics.ts`（`C` → `CT`）、
`core/security/redaction.ts`（`T` → `CT`）。
**结论不变**（没有未申报的生产文件），但**基线与文件名此前是错的**。

---

## 7. 新增文件

| 文件 | 性质 |
|---|---|
| `provider/request/fetch.test.ts` | 超时优先级 + **真实静默 server** 的挂起测试 |
| `observability/metrics.test.ts` | 累加、批量写、标签顺序无关 |
| `core/commands/metricsCommand.test.ts` | 渲染 + **跨进程读日志** |
| `observability/usageTelemetry.test.ts` | 分桶 + 按模型计价 |
| `core/commands/costCommand.test.ts` | 分表渲染 + 不串表 |
| `core/commands/reportCommand.test.ts` | **归档字节扫描** + zip 格式 |
| `observability/zipArchive.ts` | zip 写入器 |
| `core/commands/metricsCommandRuntime.ts` | `/metrics` |
| `core/commands/reportCommandRuntime.ts` | `/report` |

---

## 7.1 复核轮（施工后，第一次）

> 本节是**第一次**复核轮（2 个复核者，发现 5 处）。
> **第二次复核轮**（5 个复核者，12 处）见 §8。

施工完成后派两个对抗式复核者（`RvP6Code` 覆盖 T1/T2/T3 代码、`RvP6ZipDocs` 覆盖 T4 与文档）。
**发现 5 处，其中 1 处是严重缺陷，全部已修并反向验证。**

### 7.1.1 ⚠️ 最严重的一处：报告归档泄漏密钥（我的测试是无效的）

**缺陷**：`reportCommandRuntime.ts` 把崩溃的 `stack` **原样写入**归档，理由是
「stack 是文件路径与函数名，最不可能带用户内容」。**这个理由是错的**——
V8 的 stack **以 `Error: <message>` 开头**，所以消息里的密钥在 stack 里**逐字重复**。

**更糟的是我的测试给了假的安心**：它扫描归档的**原始字节**
（`fs.readFileSync(...).toString("latin1")`），而条目是 **deflate 压缩**的，
所以密钥**不会以连续 ASCII 出现**。实测：

```
secret in RAW zip bytes?      false   ← 我的测试据此判定「干净」
secret in EXTRACTED content?  true    ← 实际上就在里面
```

**实机复现**（构建产物）：`/report` 后 `grep` 原始 zip **未命中**，
而 `unzip -p out.zip report.json` **明文输出密钥**。`unzip -t` 也通过——
**格式合规与内容安全是两件事**。

**修复**：① `stack` 也过脱敏；② **逐行**脱敏并保留缩进
（共享脱敏器按设计会折叠空白，会把整个 stack 挤成一行、变得无用）；
③ 新增 `MAX_STACK_LENGTH = 4000`，**截尾保留头部**（靠近抛出点的帧才有信息量）；
④ **测试改为解压后扫描**（`archiveContents` 走本地头逐个 inflate）。

**反向验证**：去掉 stack 脱敏 → **1/9 失败**（旧版字节扫描**不会失败**）。

**实机验证**：修复后 `stack` 显示 `api_key=[redacted]` 且**保留 2 行结构**；
密钥在解压内容中**不存在**。

**这条教训值得单列**：**「压缩容器的字节扫描」不是安全检查**。
它通过了，而秘密就在里面——**测试断言的是错误的层面**。

### 7.1.2 其余 4 处

| # | 位置 | 问题 | 处置 |
|---|---|---|---|
| 2 | `zipArchive.ts` | `totalBytes` **累加但从未读取**——死变量，让人以为存在第二道尺寸检查 | 删除；给真正生效的 `offset` 检查补注释（32 位偏移是它必须在构建中检查的原因） |
| 3 | `reportCommand.test.ts` | zip 测试**只有单条目**，抓不到经典偏移 bug（把累计尺寸写进「运行偏移」位置） | 新增三条目测试，遍历中央目录断言每条记录指向真实本地头；**反向验证**：注入该 bug → 1/9 失败 |
| 4 | `costCommandRuntime.ts` | 「单模型输出**逐字不变**」的声称**不准确**（结尾句变了） | 用 worktree 跑旧实现 **diff 出差异**，更正文档与提交信息为「表格与数字不变」 |
| 5 | `metricsCommandRuntime.ts` | `readLogLines` 的排序比较器**不是全序**（mtime 相同时返回 0，顺序取决于目录列举） | 回退到文件名比较，构成全序 |

**第 4 处的方法论**：兼容性声称必须**用对比验证**，不能用推理声称——
读代码看不出来，跑旧版本 diff 才看得出来。

---

## 8. 复核轮（2026-09-24，五个复核者）

施工完成后派 5 个对抗式复核者（T1 超时接线、T2 metrics、T3 用量分桶、T4 报告归档、T5 文档判定），
**共发现 12 处，其中 3 处严重**。全部已修并**逐项反向验证**（去掉修复→测试失败→恢复→通过）。

### 8.1 三处严重缺陷

#### ⚠️ ① 报告归档再次泄漏密钥（我的第一轮修复不完整）

第一轮我把 `stack` **逐行**脱敏，理由是「保留缩进」。**这绕过了跨行规则**：
`core/security/redaction.ts` 里有两条规则用 `[\s\S]` 匹配**跨行**内容——
`/<html[\s\S]*?<\/html>/` 与 `/oldText[:=][\s\S]*?(?=\snewText[:=]|$)/`。
按行切分后，每一行都不再包含完整的块，规则**永不触发**。

**实机复现**（构建产物，`crashes.json` 里放一个 `<html>` 块）：
```
message  -> "fetch failed [raw-content-excluded]"     ← 脱敏成功
stack    -> "Error: fetch failed <html>\n<body>SECRET-HTML-BODY-CONTENT</body>\n</html>"  ← 原块还在
```
**消息被脱敏了，同一段内容在旁边的 stack 里逐字保留。**

**修复**：给共享脱敏器加 `preserveLines` 选项——**规则照常整段跑**（跨行规则因此有效），
只把最后的空白折叠从 `\s+` 改成 `[^\S\n]+`，保留换行。测试改为断言**解压后的内容**且
**必须有 `[raw-content-excluded]` 标记**（证明规则跑了，而不是内容根本没写进去）。
**反向验证**：恢复逐行实现 → 1/13 失败。

#### ⚠️ ② CI 从未通过（26/26 全红）

**复核者指出 CI 在 `main` 上是红的，而我一直没查过。** 核实：
`gh run list --workflow=CI --limit 60` → **26 次运行，0 次成功**。

**根因**：`Promise.withResolvers` 需要 **Node 22**，而 `.github/workflows/ci.yml:20` 是 `node-version: 20`。
本地是 Node 24，所以**本地全绿、CI 全红**——这正是「本地通过不等于 CI 通过」的典型。
CI 日志：45 处 `Promise.withResolvers is not a function`。

**修复**：两处生产调用（`core/agent/retry.ts:141`、`runtime/execution/fileLock.ts:100`）
改为手写 promise，两处测试同样处理；`zlib.crc32`（需 20.15 **或** 22.2，而 22.0–22.1 **两者都没有**）
换成自带的表驱动 CRC-32。**验证**：把 `engines` 定为**真实下限 `>=20.3.0`**（`AbortSignal.any`），
并在**真实 Node 20.19.5** 上跑编译产物——三个路径全部通过（修复前是 `TypeError`）。

**方法论教训**：**声明的版本下限必须在那个版本上真的跑过**。
`engines` 是承诺，不是注释；CI 应该验证下限，否则它验证的是开发机。

**CI 同步修改**：`node-version` 从 `20` 改为 **`20.3.0`**（声明下限本身），
这样 `engines` 是被**验证**的而不是被**断言**的。验证方式：下载 Node 20.3.0，
确认它**有** `AbortSignal.any`（下限的依据）而**没有** `Promise.withResolvers`
（这正是修复要承受的差异），再跑编译产物——`waitBeforeRetry` / `withFileLock` / `zipArchive` 三条路径全部通过。

#### ⚠️ ③ `/metrics` 读不到自己写的数据

四个独立缺陷，每个都会让数字**看起来是数据而实际是错的**：

| # | 缺陷 | 后果 |
|---|---|---|
| a | 限流 `slice(-limit)` 作用在**原始行**上 | 2500 行普通日志把指标挤出窗口，命令**自信地报告「没有记录」** |
| b | 过滤 `endsWith(".log")` | 旋转分片 `.log.1` 被排除，**旋转之后的指标全部消失** |
| c | 旧格式行（`value` 字段）读成 `total: 0` | 真实存在的 31 行历史数据被报成 `count 9, total 0` |
| d | `sessionId` 不在 `TAG_KEYS` | 标签**写进了磁盘**却在读取端被丢弃，无法归因到会话 |

外加一个：**进程中途退出会丢缓冲区**（Ctrl+D、崩溃），因为只在 `finally` 里 flush。
修复：先解析再限流、正则匹配 `.log` 与 `.log.N`、兼容 `value`、把 `sessionId` 纳入标签、
**注册 `process.once("exit")` 兜底 flush**。
**反向验证**：四个缺陷各恢复一次 → 分别失败 1/3/1/1 项；去掉 exit 钩子 → 2 项失败。

### 8.2 其余缺陷

| # | 位置 | 问题 | 处置 |
|---|---|---|---|
| 4 | `usageTelemetry.ts` | **原型污染**：模型名 `__proto__` 写进 `Object.prototype`（实机验证：`for..in` 遍历任意对象都会吐出桶字段），`constructor` 得到 `NaN` | `Object.create(null)` + `hasOwnProperty`；模型名来自未校验的 `/model` 与 provider 列表，**可达** |
| 5 | `usageTelemetry.ts` | 分桶键只有模型名，**漏了 provider**；切 provider 会用新价重算历史 token——正是本轮要修的缺陷**换个轴** | 键改为 `<provider>/<model>`（与 pi 的 `usage-totals.ts:47` 一致）；两个消费方一起改 |
| 6 | `cliSessionRuntimeFactory.ts:215` | 三个 compaction 调用点**漏接一个**（`summarizeAbandonedTurns`，`/back` 路径），仍用全局 fetch，**无超时且无 abort** | 补接线；并把 `fetchImpl` 从可选改为**必填**，杜绝同类遗漏 |
| 7 | `provider/request/fetch.ts` | memo 键用 `/` 拼接原始值：`{connectTimeoutMs:"1/2"}` 与 `{1, "2/"}` 撞键；`"6000"`（`${VAR}` 插值产生）被守卫丢弃后与数字 `6000` 撞键 → **重载后沿用旧超时** | 键改用**解析后的值** `JSON.stringify([...])` |
| 8 | 同上 | `positiveOr` 接受分数（undici 要求整数，**一个 120000.5 让所有请求失败**）、丢弃字符串、接受 20 亿（**等于没有超时**） | 强制整数、接受可解析字符串、上限 1 小时 |
| 9 | `reportCommandRuntime.ts` | `cwd` **绝对路径**写进报告（注释还声称「故意不是绝对路径」），泄漏用户名与客户目录名 | 只留 `basename`；补测试 |
| 10 | `metrics.ts` | 注释声称「`ShellSessionRuntime` 会拒绝第二个 prompt」——**该守卫不存在**（`executePrompt` 直接接受并发调用） | 改写注释：说明**实际**约束（所有调用方都串行）与**未强制执行** |
| 11 | `_index.md:174` | 合计行是**派生值**，Phase 6 改了判定列却没同步：真实是 **13/19/16/10**，写着 16/21/16/10 | 重数并加第二次重数说明 |
| 12 | `phase-6-execution.md:266` | 边界差基线写成 937（应为 `3ba4abf8` 的 **938**），并把重分类文件写成 `usageTelemetry.test.ts`（实为 `core/security/redaction.ts`） | 用可复现命令更正 |

### 8.3 复核轮的方法论收获

1. **压缩容器的字节扫描不是安全检查**——它通过了，而秘密就在里面。
   两次都栽在这里：第一次是 deflate 隐藏了明文，第二次是逐行脱敏绕过了跨行规则。
2. **兼容性声称要用对比验证**：`/cost` 单模型输出「逐字不变」是**错的**，跑旧实现 diff 才看出来。
3. **`engines` 必须在那个版本上验证**，否则 CI 验证的是开发机。
4. **派生值（合计行）必须随源值一起改**。
5. **注释里的不变量必须是真检查过的**——两处注释（`cwd`、并发守卫）都在描述**不存在**的行为。

---

## 9. 未做的事（如实记录）

| 项 | 原因 |
|---|---|
| 真实 provider 端点的超时验证 | 用本地静默 server 代替；**真实验证需要真实端点与真实挂起**，不可控 |
| 真实发布费率 | 内置目录零 `cost` 声明，`/cost` 仍用固定回退（输出如实说明） |
| `/report` 上传 | 裁决 §7 定为独立立项（对外请求 + 需用户同意） |
| 扩展宿主、RPC/SDK、HTML 导出、更新检查 | 裁决 §7 逐项裁定不做 |
| 全量套件 | 见 §6（已跑，0 失败） |
