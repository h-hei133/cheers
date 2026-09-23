---
title: "功能对照 06：可观测性、配置与生命周期（我们 vs pi）"
category: article
sources: [pi-source-2026-09-20, repo-audit-2026-09-20]
created: 2026-09-20
updated: 2026-09-23
tags: [features, gap-analysis, pi, observability, config, lifecycle, diagnostics]
summary: "[部分已过时，见文首横幅] 对照 pi 的可观测性与配置面。发现最重的一项：我们有两套并行配置系统（runtimeConfig 与 settingsLoader），而 settingsLoader 的整个 AgentSettings schema（model/skills/permissions/tui）零生产消费者——.agents/settings.json 与 ~/.cheers/settings.json 里的配置从不生效。另有 metrics 无 sink、崩溃日志缺失、无 bug report、无更新检查等差距。覆盖清单 4 项 DEFICIENT、6 项 MISSING、5 项 OURS-ONLY、1 项平手。"
confidence: high
---

# 功能对照 06：可观测性、配置与生命周期

> **⚠️ 本文是 2026-09-20 的调研快照，其中部分结论已过时。**
> 已过时的结论在**原位**加了 ✅ 标注（保留原文作为当时的证据）；**未标注的行仍按原文有效**。

> 本轮为**功能开发前锋探索**，零代码改动。对照本地参考仓 `pi`（`/home/wang/projects/pi`）。
> 分类口径：`DEFICIENT`＝我们有但更弱／不完整／未接线；`MISSING`＝pi 有我们没有；
> `OURS-ONLY`＝我们有 pi 没有（**仅记录，本轮不提议开发**）。

## 0. 方法与范围

| 侧 | 读到的位置 |
|---|---|
| pi | `src/core/{crash-log.ts, bug-report.ts, diagnostics.ts, settings-diagnostics.ts, telemetry.ts, cache-stats.ts, timings.ts, usage-totals.ts, source-info.ts, settings-manager.ts, radius.ts}`、`src/cli/{setup.ts, diagnostics.ts}`、`docs/{settings.md, sessions.md}` |
| 我们 | `observability/{metrics,structuredLogger,traceContext,rotatingFileSink,usageTelemetry,index}.ts`、`config/{runtimeConfig,settingsLoader,types,schema}.ts`、`core/shell/{signalHandlers,sessionRuntime,providerReadiness}.ts`、`entrypoints/{cliDoctor,cliRuntimeModule}.ts`、`session/lifecycle/*`、`session/recovery/*`、`result/types.ts`、`result/terminal/truth.ts` |

关键检索命令与结果：

```bash
# 两套配置系统各自的路径
sed -n '216,224p' packages/ts-shell/src/config/runtimeConfig.ts   # ~/.cheers/config.json + .cheers.json
sed -n '18,24p'   packages/ts-shell/src/config/settingsLoader.ts  # ~/.cheers/settings.json + .agents/settings.json

# settingsLoader 是否有人用
grep -rn "loadCascadingSettings" packages/ts-shell/src --include='*.ts' | grep -v test
# → 仅 settingsLoader.ts:116 的定义处（零调用者）
grep -rn "ModelSettings\|SkillsSettings\|PermissionSettings" packages/ts-shell/src --include='*.ts' \
  | grep -v test | grep -v '^./config/'
# → 0 命中

# metrics 是否有 sink
grep -rn "setMetricSink" packages/ts-shell/src --include='*.ts' | grep -v 'observability/'
# → 0 命中（metrics 全部丢弃）
```

## 1. 覆盖清单

| 能力 | pi 位置 | 我们位置 | 判定 | 证据 |
|---|---|---|---|---|
| 单一、生效的配置系统 ✅ **已解决**（`settingsLoader` 已删除，只剩 `runtimeConfig`） | `src/core/settings-manager.ts`；`docs/settings.md:1-18`（两层：global + project） | `config/runtimeConfig.ts` **与** `config/settingsLoader.ts` 并行 | **DEFICIENT** | 见 §2.1（**最高优先级**） |
| 配置错误可见 | `src/core/settings-diagnostics.ts:4-11`（收集 + 去重）；`docs/settings.md` | `config/runtimeConfig.ts:178,240`（抛异常） | **DEFICIENT** | 见 §2.2 |
| 崩溃日志 | `src/core/crash-log.ts`（`CrashRecord`，保留最近 5 条，7 天过期） | 无 | **MISSING** | 见 §3.1 |
| Bug report（含脱敏与打包） | `src/core/bug-report.ts`（`redactUrl`、敏感键正则、zip、UUID） | 无 | **MISSING** | 见 §3.2 |
| 启动性能计时 | `src/core/timings.ts`（`PI_TIMING=1`，命名空间） | 无 | **MISSING** | 见 §3.3 |
| Metrics 采集 | `src/core/telemetry.ts`（opt-in 安装遥测 + attribution headers） | `observability/metrics.ts`（`recordCount`/`recordTiming`） | **DEFICIENT** | 见 §2.3 |
| 结构化日志 | 无独立结构化日志层 | `observability/structuredLogger.ts`（脱敏 + trace 关联 + 轮转文件） | **OURS-ONLY** | 见 §4 |
| Trace context（traceId/spanId 传播） | 无 | `observability/traceContext.ts` | **OURS-ONLY** | 见 §4 |
| 会话用量统计（token） | `src/core/usage-totals.ts`（`UsageTotals` 含 input/output/cacheRead/cacheWrite/cost） | `observability/usageTelemetry.ts` | **DEFICIENT** | 见 §2.4 |
| 按模型拆分的成本 | `src/core/usage-totals.ts:36-60`（`getUsageCostBreakdown` 按 `provider/model` 分组） | 无（单一固定费率） | **MISSING** | 见 §3.4 |
| Cache 命中/浪费统计 ✅ **部分收口 2026-09-23**：usage 已带 `cacheReadTokens`/`cacheWriteTokens`（provider 实测值），`/cost` 按其计价 | `src/core/cache-stats.ts` | `observability/usageTelemetry.ts` | **部分收口**（`/cost` 已报 cache 维度） | 见 `phase-4-execution.md` §4 |
| 更新检查 | `docs/settings.md`（`PI_SKIP_VERSION_CHECK`、`pi.dev/api/latest-version`） | 无 | **MISSING** | 见 §3.5 |
| 终端状态恢复（崩溃/信号） | pi 的 TUI 层各自处理 | `presentation/tui/terminal.ts:111-112,212-215`（`process.once("exit")` + `restoreSync`） | **OURS-ONLY** | 见 §4 |
| 信号处理与优雅关闭 | — | `core/shell/signalHandlers.ts`（`handleShellSigint`/`handleShellClose`） | **OURS-ONLY** | 见 §4 |
| 会话生命周期状态机 | `src/core/agent-session.ts`（事件驱动） | `session/lifecycle/*`（`durableStatusProjection`、`sessionTerminalStore`、`sessionPromptBarrier`） | **OURS-ONLY** | 见 §4 |
| Provider 就绪度检查 | `src/cli/auth-check.ts` | `core/shell/providerReadiness.ts`（`checkRealProviderReadiness`） | **平手** | 两侧都有 |

## 2. DEFICIENT 详述

### 2.1 ~~两套并行配置系统，其中一套完全无效~~ ✅ 已解决（该模块已被删除）

> **现状**：`settingsLoader` 与其 `AgentSettings` schema 在 **Phase 1**（提交 `d60895e3`）已**整个删除**，`packages/ts-shell/src` 下不再存在该模块，两套并行配置系统的问题随之消失。原文保留为历史记录。

**现象**：仓库里有两个互不相关的配置加载器，读不同的文件、用不同的 schema、由不同代码消费。其中一个**从未被调用**。

**证据（我们）**：

| | `config/runtimeConfig.ts` | `config/settingsLoader.ts` |
|---|---|---|
| 用户文件 | `~/.cheers/config.json`（`:221`） | `~/.cheers/settings.json`（`:19`） |
| 项目文件 | `<root>/.cheers.json`（`:222`） | `<root>/.agents/settings.json`、`<root>/cheers.json`（`:20-23`） |
| schema | `RuntimeConfigFile`（`:90-116`） | `AgentSettings`（`types.ts:47-55`） |
| 生效状态 | **生效**（10 个字段） | **零消费者** |

`settingsLoader.ts` 的调用情况（全部经 `grep -v test` 核实）：

- `loadCascadingSettings`（`:116`）→ **零调用者**，只有定义处。
- `mergeAgentSettings`（`:91`）→ 只被 `loadCascadingSettings` 内部调用（`:128,135,142`）。
- `getSettingsPaths`（`:14`）→ 只被 `tuiSettings.ts:29,45` 使用（**仅取路径**，不取 schema）。
- `AgentSettings` 的四个子 schema **全部零外部消费者**：

  ```bash
  grep -rn "ModelSettings\|SkillsSettings\|PermissionSettings" packages/ts-shell/src --include='*.ts' \
    | grep -v test | grep -v '^./config/'
  # → 0 命中
  ```

  即 `DEFAULT_AGENT_SETTINGS`（`types.ts:57-80`）里那套看起来完整的默认值——`model.provider`/`model.model`/`thinkingBudget`/`maxTurns`、`skills.directory`/`enabled`/`disabled`/`autoReload`、`permissions.mode`/`allowRules`/`denyRules`、`tui.statusItems`——**没有任何代码读取**。

**讽刺性细节**：`types.ts:31-45` 的注释解释了为什么 `TuiSettings` 只有一个字段：

> 「One setting, deliberately. There were five: a render `mode`, a `resizeScrollback` policy, `showThinking`, and a `theme` — **none of which was read anywhere**. A knob that does nothing is worse than no knob, because it is a promise the interface does not keep…」

作者**已经识别并清理过一次**「未读旋钮」，但清理的是 `TuiSettings` 内部，**没有发现整个 `AgentSettings` 层都是未读的**。

**证据（pi）**：`docs/settings.md:1-18` 只有两层（`~/.pi/agent/settings.json` 全局 + `.pi/settings.json` 项目），一个 schema，全部字段都有消费者。

**影响**：
- 用户在 `.agents/settings.json` 里写的权限规则、技能目录、模型选择**全部静默失效**。
- `permissions.mode`（`default`/`dontAsk`/`acceptEdits`/`bypassPermissions`/`plan`）与 `allowRules`/`denyRules` 不生效——**权限配置的安全含义**：用户以为设了 `denyRules`，实际没有任何效果。
- 两份 `settings.json`/`config.json` 的存在本身就在误导。

**最小改动建议**：**二选一并删掉另一套**。推荐保留 `runtimeConfig`（它已被 79 处消费），把 `AgentSettings` 里真正需要的字段（`permissions` 优先）迁进去，然后删除 `settingsLoader.ts` 的 `loadCascadingSettings`/`mergeAgentSettings`/`AgentSettings` 与 `DEFAULT_AGENT_SETTINGS`。`tuiSettings.ts` 对 `getSettingsPaths` 的使用需一并迁移。

### 2.2 配置错误直接抛异常，无诊断聚合（置信度：高）—— ✅ **2026-09-23 已收口**

> **收口说明**：`getRuntimeConfig` 不再抛异常，改为跳过坏文件并产出诊断，
> 经 `RuntimeConfig.configDiagnostics` 在启动横幅、`/doctor`、CLI `doctor` 三处可见。
> **一处必须保持抛异常**：`readUserRuntimeConfigFile` 服务于读-改-写，
> 降级会让下一次写入把用户整个配置替换成一个字段。见 `phase-5-execution.md` §3。
> **下方原文保留为当时的证据。**

**证据（我们）**：`config/runtimeConfig.ts:177-181` 与 `:239-243` 两处 `catch` 都**直接 `throw new Error(...)`**。一个 JSON 语法错误会让进程无法启动，且没有「哪个文件、哪一行、其他配置是否仍可用」的聚合视图。

对比同文件内的另一个设计：`core/models/catalogStore.ts:93-110` 的 `readOverlay` 对损坏的用户模型文件**降级为「无 overlay」**，注释明确「A hand-edited file with a stray comma should degrade to "no overlay", not to a session that cannot start.」——**同一仓库里两种相反的错误策略**。

**证据（pi）**：`src/core/settings-diagnostics.ts:4-11` `collectSettingsDiagnostics` 把 `settingsManager.drainErrors()` 转成 `{type:"warning", message: "Invalid settings file <path>: <err>"}` 的诊断数组，**不抛异常**；`:14-25` `deduplicateDiagnostics` 按 `type\0message` 去重，注释解释为何需要（启动与运行时两个 manager 会报同一文件错误）。

**影响**：一个手写错的配置导致整个 CLI 起不来，而产品里已经有「降级而非失败」的先例可循。

**最小改动建议**：改为收集诊断 + 在启动横幅或 `/diagnose` 里显示，与 `catalogStore` 的降级策略统一。

### 2.3 Metrics 有 API 无 sink（置信度：高）

**证据（我们）**：

- `observability/metrics.ts:8-22` 定义 `MetricEvent` 与 `setMetricSink`/`recordCount`/`recordTiming`。
- `recordCount` 有**唯一一个**生产调用点：`entrypoints/cliRuntimeModule.ts:388` `recordCount("cli.prompts", 1, { sessionId })`。
- `recordTiming` **零调用点**。
- `setMetricSink` **零调用点**（`grep -rn "setMetricSink" packages/ts-shell/src --include='*.ts' | grep -v 'observability/'` → 0）。

因为 `metrics.ts:11` 是 `metricSink?.({...})`（可选链），**没有 sink 时所有指标静默丢弃**。那个唯一的 `cli.prompts` 计数从未被任何人看到。

**证据（pi）**：`src/core/telemetry.ts:7-14` `isInstallTelemetryEnabled(settingsManager, telemetryEnv)`——env 优先、settings 兜底；`docs/settings.md` 的 `enableInstallTelemetry` 与 `enableAnalytics`（opt-in，`trackingId`）构成完整的遥测开关面。

**影响**：可观测性层是**空转**的。用户无法得到任何运行统计，我们也无法从真实使用中得到任何数据。

**最小改动建议**：要么接一个 sink（最简单的实现是把 `MetricEvent` 写进已有的 `RotatingFileSink`），要么按 `01-*` §3.1 的标准删除 `metrics.ts`。**不要保留「发射了但没人收」的中间态。**

### 2.4 用量统计缺 cache 维度与真实费率（置信度：高）

**证据（我们）**：`observability/usageTelemetry.ts:1-19` `SessionUsageTelemetry` 字段为 `promptTokens`/`completionTokens`/`totalTokens`/`lastPromptTokens`/`turnsCount`/`toolCallsCount`/`model`/`lastUpdated`——**无 cache 维度**。`:19` `USAGE_RATES = { promptPerMTok: 0.14, completionPerMTok: 0.28 }` 是**写死的两个常量**，不随模型变化；`core/commands/costCommandRuntime.ts:3-10` 的注释诚实承认了这一点（「The money is not measured — the rate table is a constant that does not vary by model」）。

**证据（pi）**：`src/core/usage-totals.ts:6-12` `UsageTotals` 含 `input`/`output`/`cacheRead`/`cacheWrite`/`cost`；`:22-29` `addUsageToTotals` 累加全部五个；`:36-60` `getUsageCostBreakdown` 按 `${provider}/${responseModel ?? model}` 分组，并把工具/摘要用量单列到 `"Tools/summaries"` 桶。

**影响**：`/cost` 的数字与真实账单无关（用 Claude 时偏低一个数量级）；cache 使用完全不可见（见 `03-*` §3.3）。

**最小改动建议**：usage 记录增加 `cacheReadTokens`/`cacheWriteTokens`（provider 响应里已有），费率改从模型目录的 `cost` 字段读取（需先做 `03-*` §3.1 的 `modelOverrides`）。

## 3. MISSING 详述

### 3.1 崩溃日志（置信度：高）—— ✅ **2026-09-23 已收口**（**复核轮修正**）

> **收口说明**：新增 `observability/crashLog.ts`（保留最近 5 条，
> `prependListener` 保证先于其他监听器运行，写入包在吞异常的 try/catch 里）
> 与 `/crash` 命令。见 `phase-5-execution.md` §6。**下方原文保留为当时的证据。**
>
> ⚠️ **复核轮修正**：首次实现**有一个致命缺陷**——只写记录、**从不重抛**。
> 注册任何 `uncaughtException` 监听器都会**取代 Node 的默认终止行为**，
> 所以它把**每个致命崩溃都变成了「进程继续运行」**。实测：无监听器 exit 1，
> 加监听器 exit 99（存活）。**已修为 `throw error`**，并加了真实子进程退出码断言。
> 详见 `phase-5-execution.md` §11.2 第 1 项与 §11.6。
>
> 同时如实更正两处注释失真：`unhandledRejection` 的「继续运行」**不是** Node 默认
> （Node ≥15 起未处理拒绝是致命的），以及 `time("process start")` 实际测的是
> 模块加载完成后的间隔而非进程启动。

**pi 如何实现**：`src/core/crash-log.ts:4-13` `CrashRecord` 含 `timestamp`/`version`/`kind`（`"uncaught_exception" | "fatal_error"`）/`message`/`stack`/`sessionFile`/`cwd`/`notified`；`:15-16` `MAX_CRASH_RECORDS = 5`、`MAX_AGE = 7 天`；`:18-20` 存 `~/.pi/agent/crashes.json`。`docs/sessions.md` 说明：下次交互启动显示一次警告，`/bug` 会把崩溃附加到 `diagnostics.json` 并在上传后删除该文件。

**我们缺失的证明**：

```bash
grep -rn "uncaughtException\|unhandledRejection" packages/ts-shell/src --include='*.ts' | grep -v test
# → 仅 core/agent/agent.ts:186 与 core/shell/sessionRuntime.ts:175 的注释（说明不再触发 unhandledRejection），
#   无任何 process.on("uncaughtException") 注册
```

我们的 TUI 层**有**退出兜底（`presentation/tui/terminal.ts:150` `process.once("exit", this.handleExit)`），但那只是恢复终端模式（`:212-215` `restoreSync`），**不记录任何崩溃信息**。

**影响**：崩溃后除了终端里滚过去的堆栈，没有留下任何可供事后诊断的痕迹。

**最小落地路径**：在 `cli/bootstrap/cliProcessRunner.ts` 装 `uncaughtException`/`unhandledRejection` 处理器，写一个 `crashes.json`（照 pi 的字段与保留策略）。成本低，收益直接。

### 3.2 Bug report（含脱敏与打包）（置信度：高）

**pi 如何实现**：`src/core/bug-report.ts` 定义 `BUG_REPORT_CUSTOM_ENTRY_TYPE = "pi.bug-report"` 与 `BUG_REPORT_SCHEMA_VERSION = 1`；`:26-28` `SENSITIVE_KEY` 正则覆盖 `api[-_]?key|secret|token|password|passwd|credential|authorization|cookie`（含 camelCase 拆分）；`:30-52` `redactUrl` 剥离 URL 里的 userinfo 与敏感查询参数；`docs/sessions.md` 描述产物结构（`report.json`/`diagnostics.json`/`session.jsonl`/`summary.md`）与两条出路（Radius 上传 / 导出 zip），并明确「API keys, header values, URL credentials, and the analytics tracking id are never included」。

**我们缺失的证明**：

```bash
grep -rni "bugReport\|bug-report" packages/ts-shell/src --include='*.ts' | grep -v test   # → 0 命中
```

**影响**：用户报障时只能手动描述或贴日志，没有一条受控的脱敏收集路径。

**最小落地路径**：需先定隐私边界与去向，建议单独立项；但**脱敏部分可以先行**——我们已有 `core/security/redaction.ts`（`redactReportText`）与 `observability/structuredLogger.ts:10-18` 的 7 条密钥正则，pi 的 `redactUrl` 是它们缺的一块。

### 3.3 启动性能计时（置信度：高）—— ✅ **2026-09-23 已收口**

> **收口说明**：新增 `observability/startupTiming.ts`，`CHEERS_TIMING=1` 时记录
> **相邻标记的差值**（而非距起点），关闭时什么都不做；新增 `/timings` 命令。
> 见 `phase-5-execution.md` §6。**下方原文保留为当时的证据。**

**pi 如何实现**：`src/core/timings.ts:6` `const ENABLED = process.env.PI_TIMING === "1"`；`:14-30` `resetTimings(namespace)`/`time(label, namespace)` 支持 `"main"`/`"extensions"` 两个命名空间；`:24-28` 记录每次调用的**间隔毫秒**。零成本关闭（未启用时全部早返回）。

**我们缺失的证明**：

```bash
grep -rni "PI_TIMING\|startupTiming\|timings" packages/ts-shell/src --include='*.ts' | grep -v test   # → 0 命中
```

**影响**：启动慢时无法定位是哪一段。我们的启动链路很长（`cliProcessRunner` → `cliStartupPlan` → `rootContext` → 各模块），没有分段计时就没有可归因的数据。

**最小落地路径**：照 pi 的形状做一个 30 行的 `timings.ts`，在 `cliProcessRunner` 的既有分阶段处插桩。**成本极低**。

### 3.4 按模型拆分的成本（置信度：高）

**pi 如何实现**：`src/core/usage-totals.ts:36-60` `getUsageCostBreakdown(entries)` 遍历会话条目，按 `${provider}/${responseModel ?? model}` 分组累加，把 `toolResult` 的用量与 `type === "usage"` 的条目分别归到 `"Tools/summaries"` 与对应模型桶；`:32-34` `UsageCostBreakdownEntry { key, cost, tokens }`。

**我们缺失的证明**：`observability/usageTelemetry.ts:19` 是全局常量费率，`getSessionUsage` 按 session 聚合，**无按模型拆分**。`SessionUsageTelemetry.model`（`:17`）只存**最后一次**的模型名，切换模型后历史用量归到新模型名下。

**影响**：一个会话里换了模型，`/cost` 会用最后那个模型的名义报出全部花费。

**最小落地路径**：与 §2.4 同批——费率按模型取，聚合按模型分组。

### 3.5 更新检查（置信度：高）

**pi 如何实现**：`docs/settings.md` 的 `collapseChangelog`（更新后显示压缩版 changelog）与 `PI_SKIP_VERSION_CHECK=1`（禁用检查）；`PI_OFFLINE=1` 禁用全部启动网络操作。

**我们缺失的证明**：

```bash
grep -rni "latest-version\|checkUpdate\|updateCheck" packages/ts-shell/src --include='*.ts' | grep -v test
# → 仅 browser/stealthPreload.ts:64（Chromium 内部常量，与本产品无关）
```

**影响**：用户不知道有新版本。优先级取决于发布节奏——若尚未对外发布，此项可延后。

## 4. OURS-ONLY（仅记录，本轮不提议开发）

| 能力 | 我们位置 | pi 是否真的没有（检索命令+结果） |
|---|---|---|
| 结构化日志（含密钥脱敏 + trace 关联 + 轮转文件） | `observability/structuredLogger.ts:10-18`（7 条密钥正则）、`:120-133`（sink + 文件持久化）、`observability/rotatingFileSink.ts:19`（`RotatingFileSink` 类）；消费者 4 处（`sessionReadSurface`、`sessionLifecycleWrites`、`hookDispatcher`、`cliProcessRunner`） | pi 无独立结构化日志层：`grep -rn "structuredLog\|RotatingFileSink\|createComponentLogger" /home/wang/projects/pi/packages/coding-agent/src` → 0 命中；pi 用 `crash-log.ts` + `timings.ts` + 各模块 `console` |
| Trace context（traceId/spanId/parentSpanId 传播） | `observability/traceContext.ts:3-25`（`createTraceContext`/`createChildSpan`/`setGlobalTraceContext`）；在 `cli/bootstrap/cliProcessRunner.ts:55` 安装 | pi 无对应物：`grep -rn "traceId\|spanId\|parentSpanId" /home/wang/projects/pi/packages/coding-agent/src` → 0 命中 |
| 终端状态恢复电池（含崩溃路径的 unbuffered write） | `presentation/tui/terminal.ts:111-112`（`process.once("exit")` → `restoreSync`）、`:212-215`（`writeSync` 注释：「Unbuffered restore for exit and crash handlers, where queued writes are lost」） | pi 的 TUI 恢复分散在其 `modes/interactive` 层，无等价的集中「restore battery」抽象 |
| 信号处理与优雅关闭 | `core/shell/signalHandlers.ts`（`handleShellSigint` 区分「运行中取消」与「空闲关闭」；`handleShellClose` 可选 exit hook） | pi 无同名模块；其退出逻辑在 `interactive-mode.ts` 内 |
| 会话生命周期状态机（durable status + terminal store + prompt barrier） | `session/lifecycle/{durableStatusProjection,sessionLifecycleStore,sessionTerminalStore,sessionPromptBarrier}.ts`；`result/terminal/truth.ts` 的 `selectContinuityTerminalSource` | pi 无等价分层：其会话状态在 `agent-session.ts` 内，无独立的 durable-status 投影 |
| Provider 就绪度矩阵 | `core/shell/providerReadiness.ts`（`checkRealProviderReadiness`，被 `cliRuntimeInvocation.ts:2` 生产调用） | pi 有 `src/cli/auth-check.ts`，**此处为平手**（列出以免误报） |

> **诚实标注**：最后一行是**平手**。前五项是真实的形态差异——但请注意，
> 其中「结构化日志」与「trace context」两项**在当前产品里也没有产生可观测的产出**：
> 日志只被 4 个组件使用、metrics 无 sink（§2.3）、`/log` 命令读的
> `getGlobalRotatingFileSink()`（`observability/rotatingFileSink.ts:175`）是**惰性创建**的，
> 因此它确实有文件产出——但内容仅限于那 4 个组件的记录。
> 即：**基础设施比 pi 完善，覆盖面比 pi 窄**。

## 5. 未能验证的项

1. **`~/.cheers/settings.json` 是否曾生效过**：只确认了当前零消费者，未追溯 git 历史确认它是否在某个已删除的路径下工作过。
2. **`tuiSettings.ts` 的写入是否与 `settingsLoader` 的 schema 兼容**：它用 `getSettingsPaths` 取路径但自己定义 `StoredTuiSettings`（`cli/interactive/tuiSettings.ts:21-26`），未验证两者写入同一文件时是否互相破坏。
3. **pi 的 Radius 上传服务端行为**：只读了 `radius.ts` 与 `bug-report.ts` 的客户端代码，未验证服务端。
4. **我们的 metrics 是否有外部消费者**：只做了源码内 grep；可能存在仓库外的仪表盘读取某种导出。
5. **`RotatingFileSink` 的实际产出**：未实跑 CLI 检查日志文件内容与轮转行为。
6. **未运行任何构建/测试/产品**：本轮全部为静态分析。
