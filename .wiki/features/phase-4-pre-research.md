---
title: "Phase 4 前置研究：01–07 剩余 41 项的地形测绘与候选任务"
category: article
sources: [repo-audit-2026-09-22, pi-source-2026-09-22, codex-source-2026-09-22, opencode-source-2026-09-22, gemini-cli-source-2026-09-22, phase-1-execution-2026-09-20, phase-2-execution-2026-09-21, phase-3-execution-2026-09-22, phase-3-review-2026-09-22, phase-3-review-commits-2026-09-22]
created: 2026-09-22
updated: 2026-09-22
tags: [features, phase-4, pre-research, gap-analysis]
summary: "Phase 4 开工前的地形测绘，零代码改动。Phase 1/2/3 已收口配置、压缩、遍历、上下文注入、信任边界与逐模型窗口；本轮把 01–07 里**剩余**的差距按「缺陷类别」而非「大小」重新分组，给出 8 个候选任务与执行顺序。核心发现：①「声明了但消费方为零」的接口在 Phase 3 之后**又长出一批**（兼容性矩阵、tuiMode、会话队列模式、3 个钩子事件、firstKeptEntryId、threadState 三函数、图片块构造器、事件流模块），而 T7 门禁只管配置字段，管不到它们；②bash 工具的 `timeout` 与 `env` 是两项**每天都会踩到**的缺口（60 秒硬编码杀掉了 npm install 与构建）；③`/reload` 会**报告**主题变化却从不应用它；④`/cost` 的费率是写死的常量且没有 cache 维度。同时**推翻两条既有记录**：per-model `contextWindow` 覆盖**已经可以工作**（实测），技能指令注入**已经过信任门**。"
confidence: high
---

# Phase 4 前置研究

> **性质**：Phase 4 开工前的测绘，**零代码改动**。
> **输入**：`.wiki/features/01-*` … `07-*`、`phase-1/2/3-execution.md`、`phase-3-review.md`、
> `phase-3-review-commits.md`、以及 `git show a419d8fa:.wiki/features/gap-status.md`（已从树上删除的那份完成度核验）。
> **输出**：候选任务与执行顺序，**不含施工**。

---

## 0. 方法与边界

### 0.1 起点：41 项未完成

Phase 3 收口时留下的核验结论（`a419d8fa`，该文件随后被 `a08d375d` 删除以避免「两处描述同一事实」）：

| # | 文档 | 差距数 | 已实现 | 部分实现 | 仍未实现 |
|---|---|---:|---:|---:|---:|
| 01 | 可扩展性与定制化 | 14 | 2 | 3 | **9** |
| 02 | 程序化集成与会话数据 | 9 | 0 | 3 | **6** |
| 03 | Provider 与模型层 | 11 | 0 | 6 | **5** |
| 04 | 终端交互与呈现 | 18 | 0 | 8 | **10** |
| 05 | 工具与执行安全 | 9 | 1 | 5 | **3** |
| 06 | 可观测性与配置 | 11 | 1 | 3 | **7** |
| 07 | 上下文管理与压缩 | 7 | 4 | 2 | **1** |
| | **合计** | **79** | **8** | **30** | **41** |

**本轮不重复报告已收口项**，也不重新论证那 41 项是否仍是差距——**每一份 01–07 文档已在原位标注了 ✅**，
未标注的行即仍按原文有效。本轮做的是**把它们按缺陷类别重新分组**，因为「按成本分级」这种排法
（`gap-status.md` 的低/中/高）会把不同性质的东西塞进同一格。

### 0.2 本轮的分组口径

Phase 1 与 Phase 3 各自确立了不同的处置标准，本轮沿用并合并：

| 类别 | 判据 | 处置 |
|---|---|---|
| **A 声明了但消费方为零** | 类型/字段/函数存在，生产读者为 0 | 按 `phase-0-disposition.md` §1.5：**要么接上，要么删掉，不要保留中间态** |
| **B 有可观测失效的缺陷** | 用户/模型能感知到「本该成功却失败」或「说了没做」 | 修 |
| **C 报数不来自它声称的来源** | 展示的数字与其声称依据不是同一件事 | 修（本项目已被用户抓过两次） |
| **D 能力已在代码里但未接线** | 数据结构、API、几何计算都已写好，缺调用者 | 接线 |
| **E 参考实现有而我们没有** | 纯能力缺口，无现成基础设施 | 按价值/成本取舍 |

**为什么 A 排第一**：它是本项目的**签名缺陷**——`phase-1-execution.md` §2.2、`phase-3-decisions.md` §3.7（T7 门禁）、
`phase-3-review-commits.md` §1.2、`phase-3-review.md` 的 A-4 都是同一形态。
而 Phase 3 新增的 T7 门禁**只扫 `RuntimeConfig` 的字段**，对**接口、导出符号、事件名**一概不覆盖。

### 0.3 勘察分工与核验纪律

| 勘察 | 执行者 | 结果 |
|---|---|---|
| 会话格式与导出 | 子代理 `P4SessionFmt` | 完成 |
| 机器面协议（`--json`/stdin/SDK） | 子代理 `P4Machine` | **2 次因上游内容过滤器失败** |
| 扩展性/生命周期/可观测性 | 子代理 `P4Extensibility` | 完成 |
| Provider 与模型层 | 子代理 `P4Provider` | 完成 |
| 终端交互 | 子代理 `P4Terminal` | 完成 |
| bash 参数面 | 子代理 `P4BashEnv` | 完成 |
| 压缩文件追踪 | 子代理 `P4Compaction` | **内容过滤器失败 → 主代理自行完成** |
| 死接口全仓盘点 | 主代理 | 完成 |

**纪律**：每条进入本文件结论的断言，由主代理**逐条复现**；子代理的断言**有 3 条被证伪或更正**（见 §5）。
子代理报告存于 `agent://P4SessionFmt`、`agent://P4Extensibility`、`agent://P4Provider`、`agent://P4Terminal`、`agent://P4BashEnv`。

---

## 1. 类别 A：第二轮「声明了但消费方为零」

**这是本轮最重要的发现**：Phase 1 清理过一批、Phase 3 又清理过一批并加了门禁，
但**门禁只覆盖配置字段**，于是同一形态在其他四种载体上继续存在。

### 1.1 盘点（全部经主代理核验）

| # | 对象 | 声明处 | 生产消费者 | 证据 |
|---|---|---|---|---|
| A-1 | `ProviderCompatibilityFlags` / `projectProviderRegistry` | `provider/registry/provider.ts:28`、`:292` | **0** | 全仓 `projectProviderRegistry` 命中 6 个文件，**除定义处外全是 `.test.ts`** |
| A-2 | `tuiMode` | `config/runtimeConfig.ts:142` | **0** | 4 处出现全在 `runtimeConfig.ts` 自身；`scripts/check-config-consumers.mjs:47` 把它列为白名单 |
| A-3 | `steeringMode` / `followUpMode` | `core/agent/agent.ts:16-17` | **0** | 全仓命中仅 `agent.ts` 自身 4 处（含 `:39-40` 读取）；无调用点传入，无配置字段 |
| A-4 | `PostToolUseFailure` / `WorktreeCreate` / `WorktreeRemove` | `core/hooks/types.ts:12`、`:16-17` | **0 派发** | 排除 `types.ts` 与 `config.ts` 后，三者仅剩 `hookDispatcher.ts:160` 的 **matcher 判断**（不是派发） |
| A-5 | `firstKeptEntryId` | `session/sessionEventCodec.ts:13` | **0 生产者** | 活动压缩路径的 `onCompact` 载荷只有 `summary`/`keptMessages`/`tokensBefore`（`session/compaction.ts:564-568`） |
| A-6 | `appendDurableSessionChild` / `createDurableSessionBranch` / `switchDurableSessionActiveLeaf` | `session/store/threadState.ts:24,49,76` | **0** | 仅 `threadState.test.ts:40,48,56` |
| A-7 | `SessionDagEngine.branchWithSummary` | `session/sessionDagEngine.ts:184` | **0** | 仅 `sessionDagEngine.test.ts:47` |
| A-8 | `toAnthropicImageBlock` / `toOpenAIImageUrlBlock` | `model-adapters/multimodal.ts:50,61` | **0** | 仅 `strictAndMultimodal.test.ts:6-7,48,52` |
| A-9 | `runtime/events/stream.ts` | `runtime/events/stream.ts:16` | **0** | 唯一 importer 是 `tools/toolHandoff.test.ts:5` |
| A-9b | `runtime/events/projection.ts`（**2,997 行**） | `runtime/events/projection.ts` | **0** | 精确 importer 检索只有 `provider/registry/provider.test.ts:4` 与 `tools/toolHandoff.test.ts:6` |
| A-10 | `SYSTEM.md` / `APPEND_SYSTEM.md` | — | **0** | 全仓仅 `core/security/projectTrust.ts:108` 把它当作**敏感文件探测**，从不读内容 |
| A-11 | `prompt-template` 字面量 | `runtime/resources/descriptor.ts:13` | **0** | 联合类型成员，无加载器 |

**A-9b 是本轮盘点到的最大的单一死簇**：`runtime/events/` 整个目录（`projection.ts` 2,997 行 + `stream.ts` 167 行
+ 两个测试 1,960 行 = **5,124 行**）**没有任何生产消费者**。

**检索方式（必须用精确形式）**：`grep -rn "events/projection.js\|events/stream.js"` → 3 处，全为测试。
**注意一个陷阱**：用 `grep -rl "stream"` 这类宽泛模式会得到 87 个文件——那是**名字里含 `stream` 的无关模块**
（`core/query/runtime/events.ts` 的 `message.delta` 等），不是这个模块的消费者。
这与 `phase-3-pre-research.md` §4 的 `--json` 判定同型：**宽泛检索会把无关命中读成消费者**。

### 1.2 A-9 有一处**必须记录的混淆**

`--json` **是工作的**，但走的是**另一个模块**：

| 路径 | 文件 | 状态 |
|---|---|---|
| 实际生效 | `presentation/terminal/jsonEvents.ts`（`createJsonEventWriter`） | `cliRuntimeModule.ts:15` 导入，`:413-418` 接到 `observeEvents` 与 stdout |
| 死代码 | `runtime/events/stream.ts`（`projectJsonRuntimeEventStream`、`serializeJsonRuntimeEventStream`） | 仅测试 |

两者都自称事件流、都带 `schemaVersion`、都带 `observationOnly`/`terminalSuccessClaim`，**但格式不同**
（`run-event-stream.v1` vs `runtime-event-stream.v1`）。`02-*` 报告把后者记为「已写好但未接线」是对的，
但**读那份报告的人会以为 `--json` 依赖它**。这正是 A 类缺陷最难发现的地方：**同名同义的第二个实现**。

### 1.3 与 Phase 3 的两处**更正**（原记录错误）

| # | 原记录 | 实测 | 处置 |
|---|---|---|---|
| 1 | `03-*` §2.3/§3.1：「模型目录**能叠加，不能覆盖**——无法只把 `claude-sonnet-4-5` 的 `contextWindow` 从 200k 改成 1M」 | **相反**。`mergeProviders` 的 `dedupeModels([...existing.models, ...patch.models])` 按 id 去重，**后写覆盖先写**。实测：patch `{id:"claude-opus-4-6", contextWindow:999_999}` → 得到 `{"id":"claude-opus-4-6","contextWindow":999999}`，且模型总数不变 | 原判**证伪**。真正缺的不是覆盖机制，而是 `CatalogModel` **只有 2 个字段**（`id`/`contextWindow`）可覆盖 |
| 2 | `P4Extensibility` 子代理：「`projectInstructions.ts` 与其调用点**没有信任门**」 | **相反**。`entrypoints/cliRuntimeInvocation.ts:229-235` 明确门控：`const untrusted = projectTrust.isProjectUntrusted(...)`，未信任时返回 `{files: [], truncated: false}` | 子代理断言**证伪**，未采信 |

**更正 1 的方法论价值**：`mergeProviders` 的注释写的正是「A user's models **add to** what ships rather than replacing it」——
**注释说的是「不丢掉原有模型」，读者却读成了「不能覆盖」**。判断覆盖语义必须读 `dedupeModels` 的循环体，不能读注释。

---

## 2. 类别 B：有可观测失效的缺陷

### 2.1 B-1（最高优先）bash 工具没有 `timeout` 参数，硬编码 60 秒

**证据（我们）**：

- schema 只有 `command` 一个属性：`core/tools/registry.ts:560-567`
  ```ts
  argsSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command line to execute.' },
    },
    required: ['command'],
  },
  ```
- 调用处硬编码：`core/tools/registry.ts:124` → `timeoutMs: 60_000,`
- 无上限校验：`daemon/client.ts:182-186` 直接把 `options.timeoutMs` 交给 `setTimeout`。

**影响（可观测失效）**：`npm install`、`npm run build`、`cargo build`、完整测试套件**恰好是 agent 最需要跑的验证命令**，
而它们经常超过 60 秒。超时后工具返回失败，模型**无从表达「这个要跑久一点」**——它没有可用的参数。
这与 `phase-3-review.md` 的 B 组判定标准一致：**可观测失效，不是便利缺失**。

**对照参考实现**：

| 项目 | 是否暴露 | 证据 |
|---|---|---|
| `pi` | ✅ 有 | `src/core/tools/bash.ts:34-37`：`timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (optional, no default timeout)" }))`；上限 `MAX_TIMEOUT_MS = 2_147_483_647`（`:20-21`） |
| `codex` | ✅ 有 | `codex-rs/core/src/tools/handlers/test_sync.rs:39-40`：`#[serde(default = "default_timeout_ms")] timeout_ms: u64` |
| `opencode` | 未找到 | 未在 `tool/bash.ts` 命中 timeout 参数 |
| **计数** | **2/3 明确有** | |

**注意一处我方**更好**的地方**：`pi` 的默认是**无超时**，我们是 60s。
`phase-3-review.md` §9.6 已记录「命令超时默认：pi 无默认超时，我们 60s —— **我们有更好**，保留」。
因此本项的裁决应当是**保留默认、新增可选参数**，不是照搬。

### 2.2 B-2 bash 不注入会话环境变量

**证据（我们）**：

- `CommandExecutionRequest` **没有 env 字段**：`runtime/execution/types.ts:95-110`（字段为 `command`/`args`/`cwd`/`workspaceRoot`/`authority`/`caller`/`reason`/`reportSafeCommand`/`timeoutMs`/`abortSignal`/`onOutput`/`policy`）。
- `spawn` 只传三个选项：`daemon/client.ts:151-157` → `cwd`、`windowsHide`、`detached`。
- 子进程**继承宿主 `process.env`**，因此没有任何会话标识。

**影响**：模型无法可靠回答「你在用哪个模型/哪个 provider」——只能从 system prompt 猜，而 system prompt 里没有。
`pi` 的文档把这一点写成了明确的反向指引（见下）。

**对照参考实现**：`pi` 注入 5 个变量，且**值在每条命令启动时解析**：

`packages/coding-agent/docs/environment-variables.md:20-32` 逐字列出：

| 变量 | 说明 |
|---|---|
| `PI_SESSION_ID` | Current session ID |
| `PI_SESSION_FILE` | Absolute path to the current session JSONL file |
| `PI_PROVIDER` | Currently selected model provider |
| `PI_MODEL` | Currently selected model ID |
| `PI_REASONING_LEVEL` | Current effective reasoning level |

并给出用途原文：

> When asked which model or provider is running, inspect these variables instead of inferring the answer from the system prompt

`pi` 的实现位置 `src/core/tools/bash.ts:118-142`（`resolveSpawnContext`）还做了两件我们该照抄的事：
**先删除继承来的同名变量**（避免嵌套 agent 读到父会话的陈旧值），再按开关写入。

**成本**：`ToolExecutionContext` 已带 session 信息（`pi` 侧结论如此；我方需核实字段），
但要贯通 `core/tools/registry.ts` → `runtime/execution/types.ts` → `service.ts` → `daemon/client.ts` **四层**。

### 2.3 B-3 工具可见性只有「减法」，没有「加法」

**证据（我们）**：`core/tools/prefilter.ts` 的三个判据全是排除——

```ts
if (!runtimeConfig.enableMcpTools && toolName.startsWith('mcp__')) { … visible: false }
if (runtimeConfig.disabledTools.includes(toolName)) { … visible: false }
const hiddenPrefix = runtimeConfig.hiddenToolPrefixes.find(prefix => toolName.startsWith(prefix))
if (hiddenPrefix) { … visible: false }
```

**失效方向**：这是 **fail-open**。每次新增一个工具，用户既有的「只读运行」配置就自动多暴露一个工具。
白名单是 fail-closed 的。

**对照参考实现**：

| 项目 | 机制 | 证据 |
|---|---|---|
| `pi` | `--tools <list>` 白名单 + `--exclude-tools` + `--no-builtin-tools` + `--no-tools`，文档给出真实用例 `pi --tools read,grep,find,ls -p "Review the code"` | `docs/usage.md:196-202` |
| `gemini-cli` | `coreTools` + `allowedTools` + `excludeTools` **三个字段** | `packages/core/src/config/config.ts:607-612` |
| `opencode` | `tools` 映射（tool → 布尔），内部转成 permission 的 allow/deny | `packages/opencode/src/config/config.ts:567-579` |
| **计数** | **3/3 都有某种收窄到「只要这几个」的表达** | |

### 2.4 B-4 `/reload` 会**报告**主题变化，却从不应用它

**证据（我们）**：

- `core/commands/reloadCommandRuntime.ts:88` 把 `theme` 列入对比项：
  ```ts
  ["theme", before.theme, after.theme],
  ```
- 于是用户会看到 `Changed:\n  theme: "dark" → "light"`。
- 但**全仓 `applyTheme` 只有一个调用点**：`cli/bootstrap/cliProcessRunner.ts:104`（启动期）。`/reload` 不调用它。

**影响**：命令**声称**某个设置已经改变并生效，而屏幕上的配色不变。
这正是 `phase-3-review.md` A-4 修复时**自己引入**的不完整——当时把 `theme` 加进了「值得报告的变化」列表，
但没接上应用动作。**一个报告变化却不产生变化的命令，比不报告更糟。**

### 2.5 B-5 三个钩子事件可被声明、永不触发

`core/hooks/config.ts:35,44,45` 把 `PostToolUseFailure`、`WorktreeCreate`、`WorktreeRemove`
列入**允许声明的集合**，`core/hooks/types.ts` 也声明了对应载荷类型，
但**没有任何派发点**（§1.1 A-4）。

**影响**：用户在 `.agents/hooks.json` 里写一个 `WorktreeCreate` 钩子，
配置**通过校验**、注册**成功**、然后**永不执行**，且没有任何提示。
这与 `05-*` §2.8 记录的旧形态（22 个声明 11 个零派发）同类，Phase 3 修掉了 8 个，**剩 3 个**。

**但派发时机是现成的**（本轮核实，这决定了成本）：

| 事件 | 自然的派发点 | 证据 |
|---|---|---|
| `WorktreeCreate` | `core/tools/taskTool.ts:103` 的 `worktreeManager.allocateWorktree(subtaskId)` 之后 | 载荷字段 `subtaskId`/`worktreePath`/`branch` 正是 `WorktreeAllocation` 的形状（`core/workflow/gitWorktreeManager.ts:6`） |
| `WorktreeRemove` | `core/tools/taskTool.ts:155` 的 `releaseWorktree(subtaskId, { squashMerge: true })` 之后 | 同上 |
| `PostToolUseFailure` | `turn/tools.ts:178-188` 的 `afterToolCall`——它**已经**拿到了 `isError`，只是把成功与失败都发到 `PostToolUse` | `success: !isError` 已在载荷里 |

即：**三项都不是「需要新建时机」，而是「时机已在手边」**——与 Phase 3 的 T1/T6 同型（基础设施在，缺调用点）。

**注意一处与 `phase-1-execution.md` §7 记录的冲突**：那里写「18 个钩子事件覆盖 → **18/18 有派发点**」。
**该记录不成立**——本轮逐个核实为 **15 个有派发点、3 个没有**。
Phase 3 收口时的 `gap-status.md` 记的是「15 个真正派发」，与本次核实一致；
即 Phase 1 的 18/18 是**当时多计了**，后续文档已自行更正，但 Phase 1 记录未回填。

---

## 3. 类别 C：报数不来自它声称的来源

> 这一类是**用户亲自抓过两次**的缺陷类别（`phase-2-execution.md` §5 的切点缩放、§5.6 的 `/context` 幻影环境变量）。
> 本项目的纪律原文是：「凡引入比率或缩放系数，必须能回答『分子与分母是否在度量同一件事』」。

### 3.1 C-1 `/cost` 的费率是写死的常量，且没有 cache 维度

**证据（我们）**：

- `observability/usageTelemetry.ts:25`：
  ```ts
  export const USAGE_RATES = { promptPerMTok: 0.14, completionPerMTok: 0.28 } as const;
  ```
  **两个常量，不随模型变化。**
- `core/commands/costCommandRuntime.ts:31-32` 直接用它们算钱，并在 `:44-45` 把费率打印给用户。
- usage 只解析三个字段：`turn/step.ts:83` → `{ prompt_tokens?, completion_tokens?, total_tokens? }`。
  **cache read / cache write 完全不读**（全仓 `cacheReadTokens`/`cached_tokens` 在 `src/` 内 0 命中，
  仅 `browser/selfHealingPatch.ts` 有一个同名的无关字段）。
- `SessionUsageTelemetry` 无 cache 字段：`observability/usageTelemetry.ts:1-22`。

**影响**：用 Claude 时 `/cost` 的数字与账单**差一个数量级**；cache 命中情况**完全不可见**。
而 `core/commands/costCommandRuntime.ts:3-10` 的注释**已经诚实承认**了费率是常量——诚实但不能替代修复。

**对照参考实现**：

| 项目 | 按模型计价 | cache 维度 | 证据 |
|---|---|---|---|
| `pi` | ✅ `getUsageCostBreakdown` 按 `${provider}/${responseModel}` 分组 | ✅ `input`/`output`/`cacheRead`/`cacheWrite`/`cost` | `src/core/usage-totals.ts:6-12,36-60` |
| `opencode` | 未验证 | ✅ 记录 `cacheReadTokens` | `packages/stats/core/src/domain/home.ts:259` |
| `codex` | 未验证 | ❌ | — |

**前置依赖（硬约束）**：`CatalogModel` **只有 `id` 与 `contextWindow` 两个字段**（`core/models/catalog.ts:20-23`），
**没有 `cost`**。因此「费率按模型取」必须先给目录加字段——这与 A-1（兼容性矩阵）是同一处结构扩展。

### 3.2 C-2 `tuiMode` 的后果：退出后终端回滚里没有任何对话

**证据（我们）**：`presentation/tui/render/engine.ts:114` 无条件写 `ENTER_ALT_SCREEN`；
`tuiMode` 零消费者（§1.1 A-2）。

**影响**：进入备用屏后，**用户的终端 scrollback 里不留下任何对话记录**。
退出（或崩溃）之后向上翻，看不到刚才的问答。

**对照参考实现**：`pi` 的 `--tui-mode` 有 `regular`（默认，主屏 + 终端自有 scrollback）与
`fullscreen` 两种（`docs/usage.md:255-257`）。**它的默认值正是为这个场景存在的。**

**注意**：这一项同时是 A 类（死字段）与 C 类（行为后果），裁决时必须一起处理——
只接线不改渲染路径，等于给字段一个假的消费者。

### 3.3 C-3（本轮新发现，未被任何既有文档记录）`light` 主题会让正文变成白底白字

**这一项不在 `04-*` 的清单里**——那份文档只记了「`light` 主题在生产不可达」，Phase 1 用
`setTheme` → `applyTheme` 的改名 + 一个调用点修好了**可达性**，但**没有检查主题文件本身是否完整**。

**证据（实测，非推断）**：

| 文件 | 令牌数 | 证据 |
|---|---:|---|
| `presentation/theme/theme.ts:12-50` 的 `ThemeColorToken` 联合 | **39** | |
| `presentation/themes/dark.json` | **39** | 与联合**逐项一致、无差集** |
| `presentation/themes/light.json` | **23** | **缺 16 个** |

缺失的 16 个（`python3` 解析差集得出）：

```
text, borderAccent, borderMuted, commandFlag, commandNumber, commandPipe,
commandString, mdCode, mdHeading, mdLink, syntaxComment, syntaxFunction,
syntaxKeyword, syntaxNumber, syntaxString, syntaxVariable
```

**为什么这会造成不可读**：`Theme.apply`（`theme.ts:69-72`）是**整体替换** `colors` Map：

```ts
apply(theme: ThemeConfig): void {
  this.name = theme.name;
  this.colors = new Map(Object.entries(theme.colors) as [ThemeColorToken, string][]);
}
```

而 `fg` 的缺失回退是**硬编码白色**（`theme.ts:74-77`）：

```ts
fg(token: ThemeColorToken, text: string): string {
  const color = this.colors.get(token) ?? "#ffffff";
  ...
}
```

**实机探针结果**（真实模块，已清理）：

| 令牌 | dark | applyTheme("light") 之后 |
|---|---|---|
| `text` | `38;5;252`（浅灰） | **`38;5;231`（纯白）** |
| `mdHeading` | `38;5;39`（蓝） | **`38;5;231`（纯白）** |
| `syntaxKeyword` | `38;5;110` | **`38;5;231`（纯白）** |
| `commandString` | `38;5;186` | **`38;5;231`（纯白）** |
| `borderAccent` | `38;5;102` | **`38;5;231`（纯白）** |

`light.json` 的 `userMessageBg` 是 `#f9fafb`（近白）。**纯白正文落在近白背景上 = 不可读。**
这不是配色品味问题，是**内容不可见**。

**受影响的调用点**（`grep -rho '\.fg("[a-zA-Z]*"'` 计数）：`borderAccent` 2 处、`mdLink`/`mdHeading`/`mdCode`/
`commandString`/`commandPipe`/`commandFlag`/`commandNumber` 各 1 处，`text` 1 处。
**注意**：Markdown 渲染的**行内文本**大量走 `renderInline`，其中 `text` 与 `mdCode` 是主路径——
即**模型回答的正文本身**会变白。

**为什么测试没抓到**：`presentation/theme/theme.test.ts` 的 7 项测试**全部用 `defaultTheme`（dark）**
或 `new Theme({...})` 构造的局部实例，**没有一项对 `light` 断言颜色值**。
唯一涉及 light 的两项（`:34` 与 `:39-41`）只断言 `name === "light"` 与它在 `listThemes()` 里。
**即：测试断言了「主题存在」，从未断言「主题可用」。** 这是「断言实现而非断言行为」的又一例。

**结论：这是 `04-*` 与 Phase 1 都漏掉的真实缺陷，且它比「令牌不够多」严重得多。**
T7 的「补 9 个令牌」原本被定为「有渲染后果的补全」，现在必须先处理**这 16 个缺失令牌**。

**处置建议**：见 `phase-4-decisions.md` §7.1 与补充裁决 32/33。

### 3.4 C-4（附带核查）压缩文件足迹的注入位置

**证据（我们）**：`core/query/compaction/summarize.ts:85`：

```ts
const footprintXml = formatFileFootprintXml(extractFileFootprint(request.messages));
return formatCheckpointMessage(rawSummary, footprintXml);
```

footprint 在 provider **返回摘要之后**才计算，且拼进的是 **checkpoint message**，
**不是**送给摘要 provider 的 prompt（`:75-84` 的 request body 只有 `[...request.messages, {role:"user", content: prompt}]`）。

**跨压缩不累积**：`CompactionTranscriptEntry`（`session/sessionEventCodec.ts:9-17`）只有
`summary`/`firstKeptEntryId?`/`keptMessages?`/`tokensBefore?`/`timestamp`——**没有文件明细**。
所以第二次压缩时 `extractFileFootprint` 只能看见当前的 `assistant.tool_calls`，
上一条 checkpoint 里的是 XML 文本，**恢复不出来**。

**对照参考实现**：`pi` 的 `CompactionDetails { readFiles, modifiedFiles }` 存在 entry 的 `details` 里，
`extractFileOperations` 会**先读上一条 compaction 的 details**（`compaction.ts:56-72`），
再补当前消息。`docs/compaction.md:206` 原文：

> This means file tracking accumulates across multiple compactions or nested branch summaries, preserving the full history of read and modified files.

**影响**：多次压缩后，早期读改过的文件会从可见列表里消失——模型会重复读已经读过的文件。

---

## 4. 类别 D / E：能力已在代码里未接线，与纯能力缺口

### 4.1 D-1 会话 transcript 没有 entry 身份

**证据（我们）**：

| 维度 | 现状 | 证据 |
|---|---|---|
| header / version 行 | **无** | `session/transcript/sessionTranscript.ts:31-33` 直接 `appendFileSync(JSON.stringify(event))` |
| 每条 entry 的 `id` | **无** | `TranscriptEvent` 联合（`session/sessionEventCodec.ts:36+`）无 `id` |
| `parentId` | **无** | 同上 |
| 分支写入 | **有类型、无写入者** | `threadState.ts` 三函数零调用者（A-6）；`branchWithSummary` 零调用者（A-7） |

**对照参考实现**：`pi` 的 session 是**单文件 DAG**，首行 header、每行 entry 带 `id`/`parentId`：

```json
{"type":"session","version":3,"id":"uuid","timestamp":"...","cwd":"/path/to/project"}
```
```ts
interface SessionEntryBase {
  type: string;
  id: string;           // Usually an 8-char hex ID
  parentId: string | null;  // Parent entry ID (null for a root entry)
  timestamp: string;
}
```

`docs/session-format.md:3-4` 原文：

> Session entries form a tree structure via `id`/`parentId` fields, enabling in-place branching without creating new files.

**我方已有的部分**：`SessionDagEngine`（`session/sessionDagEngine.ts:18-47,150-160`）**已经**会写 header 与 `id`/`parentId`，
`session/schema/sessionThread.ts:5-12` 的 `SessionThreadEntry` 也有这两个字段。
**但它不在活动会话运行时上**——活动写入走 `appendTranscriptEvent`。

**这是一项 D 类（已写好未接线）而不是 E 类（纯缺口）**：DAG 引擎存在，缺的是把它接到活动路径，或把活动路径的 entry 补上身份。

### 4.2 D-2 `/export jsonl` 导出的不是我们存的东西

**证据（我们）**：`core/commands/exportCommandRuntime.ts:145-147`：

```ts
/** One JSON object per line, which is what a downstream tool can read back. */
function asJsonl(messages: readonly SessionMessage[]): string {
  return `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`;
}
```

数据来自 `readConversation`（`:74-77`），即 `projectTranscriptMessages(readTranscriptEvents(...))`——
**先投影再导出**，原始事件类型、compaction checkpoint、branch summary 全部丢失。

**注意**：`transcript.jsonl` **本来就是 JSONL**。所以「导出一份可移植的 JSONL」的正确实现是
**直接透出原始行**，而不是重新序列化投影结果。成本极低。

**对照参考实现**：`pi` 的 `session-export.ts:19-27` 先写 header，再逐条写当前分支的 entry，
并把 `parentId` 线性化：

```ts
const entries: object[] = [header];
let parentId: string | null = null;
for (const entry of sessionManager.getBranch()) {
  entries.push({ ...entry, parentId });
  parentId = entry.id;
}
```

### 4.3 D-3 发现面比参考实现窄

| 项 | 我们 | 参考 | 影响 |
|---|---|---|---|
| **技能祖先目录** | 只有 `~/.cheers/skills` + `<workspaceRoot>/.agents/skills`（`core/skills/skillLoader.ts:63-83`） | `pi` 搜 `.agents/skills` **in cwd and ancestor directories (up to git repo root)**（`docs/skills.md:24-35`） | 仓库根有技能、cwd 在子目录时，技能**静默消失** |
| **`SYSTEM.md` / `APPEND_SYSTEM.md`** | 仅作为敏感文件被探测（`core/security/projectTrust.ts:108`），**从不读内容** | `pi` 的 `docs/usage.md:112-119` 支持系统提示覆盖 | 用户写了不生效，且无提示 |
| **主题磁盘发现** | 静态 registry，恒为 `["dark","light"]`（`presentation/themes/index.ts:10-21`） | `pi` 6 层：内置 / 全局 / 项目 / 包 / settings / CLI `--theme`（`docs/themes.md:15-24`） | 用户无法自带主题 |
| **`/theme` 命令** | 不存在 | `pi` 经 `/settings` 或 `settings.json` | 只能在启动前改配置 |

**技能祖先目录这一项的证据强度最高**：它是**静默的功能丢失**——技能文件存在、格式正确、
只是位置在 cwd 之上，模型就永远看不到，且没有任何诊断。

### 4.4 E 类：终端交互的低成本补全

| 项 | 现状 | 参考 | 成本 |
|---|---|---|---|
| 折叠块只能鼠标点 | `setCollapsed` 唯一调用者 `cli/interactive/pointer.ts:236-240` | `pi` 有 `ctrl+o`（tool output）与 `ctrl+t`（thinking） | **极低**——API 已在 |
| 编辑器无 redo | `editor.ts:57` 只有 `undoStack`，无 `redoStack` | `pi` 有 `ctrl+-` undo | 低 |
| kill ring 不能循环 | `editor.ts:246-249` 的 `yank()` 只取栈顶 | `pi` 有 `alt+y` yankPop | 低 |
| 主题令牌缺 thinking 档位色与滚动条色 | 39 个令牌（`presentation/theme/theme.ts:12-50`，与 `dark.json` 逐项一致）；**`light.json` 只有 23 个** | `pi` 56 个 | 低 |
| 转录内搜索 | 无（pager 的过滤是**另一个视图**，`presentation/tui/chrome/pager.ts:143-147`） | `pi` `ctrl+shift+f` | 中高 |

**但本轮实测发现一个比「缺 9 个」严重得多的问题**：`light.json` 缺 **16** 个令牌（含 `text`），
而缺失回退是纯白 → **light 主题下正文不可读**。详见 §3.3。

**主题令牌这一项有一个具体后果**：`core/commands/thinkingCommandRuntime.ts:19` 有 3 个档位
（`low`/`medium`/`high`）的状态，而**编辑器边框无法表达它**——状态有了，呈现没有。
滚动条几何**已经算好**（`presentation/tui/transcript/viewport.ts:56-62` 的 `scrollbarGeometry`），只是用了通用 border 色。

### 4.5 E 类：输入面

| 项 | 我们 | 参考计数 |
|---|---|---|
| 快捷键可自定义 | 无（`keymap.ts` 是 `MOTIONS`/`KILLS` 数据表 + `switch` 分支） | **3/3**（`pi` `keybindings.json`；`opencode` `tui/src/config/keybind.ts`；`gemini-cli` `keybindings.json`） |
| `@` 文件引用 + Tab 路径补全 | 无（补全只接斜杠命令，`cli/interactive/slashSuggestions.ts` 的 `COMMAND_DRAFT` 显式排除非斜杠输入） | **3/3** |
| 外部编辑器 | 无 | **3/3**（`pi` Ctrl+G；`opencode` `/editor`；`gemini-cli` Ctrl+G） |

**两个绑定在部分终端上会失效**（子代理核验，主代理读源码确认分支存在）：

- `ctrl+z` → `editor.undo()`（`keymap.ts:219-220`）。POSIX 终端上 `Ctrl+Z` 是 `SIGTSTP`。
- `ctrl+q` → busy 时 `submitDraft(context, "followUp")`（`keymap.ts:209-215`）。`Ctrl+Q` 是 XON 流控。

**补全排序已经实现**：`presentation/tui/chrome/suggestions.ts:25-48` 是五档分层
（Exact 1000 / Prefix 900 / Substring 700 / Subsequence 500 / Detail 200），
`slashSuggestions.ts` 只是**只喂了一个候选源**。所以 `@`/Tab 的缺的不是排序，是**候选源**。

---

## 5. 候选任务汇总

| 任务 | 类别 | 性质 | 证据强度 | 成本 | 风险 |
|---|---|---|---|---|---|
| **T1** 第二轮死接口清理 + 门禁扩面 | A | 删/接 | **强**（11 项逐个核实） | 低-中 | 低 |
| **T2** bash 参数面（`timeout` + 会话 env） | B | 修缺陷 | **强**（2/3 参考有 timeout；5 个变量有逐字文档） | 低 | 低 |
| **T3** 工具可见性白名单 | B | 修缺陷（fail-open→closed） | **强**（3/3 参考） | 低 | 低 |
| **T4** 报数来源（`/cost` 费率与 cache、`/reload` 主题、`tuiMode`） | C | 修缺陷 | **强**（本项目已被抓两次的同类） | 中 | 中（T4c 需改渲染路径） |
| **T5** 会话 entry 身份与分支接线 | D | 接线 | **强**（DAG 引擎已在，写入者为零） | 中-高 | 中 |
| **T6** 发现面覆盖（技能祖先、`SYSTEM.md`、主题磁盘） | D/E | 补能力 | 强（`pi` 逐字） | 低-中 | 低 |
| **T7** 终端交互低成本项（折叠键、redo/yankPop、**主题令牌完整性**） | C/E | 补能力 + **修缺陷** | 强（API 已在；**light 缺 16 令牌已实测**） | 低 | 低 |
| **T8** 输入面（keybindings 自定义、`@`/Tab、外部编辑器） | E | 补能力 | **强**（3/3 参考） | 中-高 | 中 |

### 5.1 建议顺序

$$\text{T1} \to \text{T2} \to \text{T3} \to \text{T4} \to \text{T6} \to \text{T7} \to \text{T5} \to \text{T8}$$

**理由**：

1. **T1 先做**：零风险清掉类型谎言，且它**扩大了 Phase 3 的 T7 门禁**——后续任务不再受「这个接口到底有没有用」的干扰。
   与 Phase 3 把 T3 排第一的理由完全一致。
2. **T2 次之**：**唯一的「每天都会踩到」的缺陷**。60 秒杀掉的恰好是 agent 最需要的验证命令。
   改动面封闭（4 层透传），验证方式客观（跑一条 70 秒的命令）。
3. **T3 第三**：同样是缺陷，且**失效方向是危险的**（fail-open）。
   但它比 T2 少一点紧迫——没有白名单不会出错，只是不能表达「只要这几个」。
4. **T4 第四**：与用户亲自抓过的两次缺陷**同源**（报数来源）。放在 T1 之后，因为 `/cost` 的费率
   依赖给 `CatalogModel` 加字段，而加字段必须已过 T1 的门禁。
5. **T6 第五**：技能祖先目录是**静默功能丢失**，成本低；主题磁盘发现与 `SYSTEM.md` 同属「加载器没看该看的地方」。
6. **T7 第六**：纯补能力，但**成本最低**（多数是「API 已在，缺一个按键」），适合穿插。
7. **T5 第七**：唯一触及**持久化格式**的任务，需要迁移考虑（旧 transcript 没有 `id`）。
   应在前几项把工具面稳定后单独处理。
8. **T8 最后**：改动面最大（keymap 数据驱动会碰到模态/建议框的优先级层次），
   且三项都是**新增交互面**而非修缺陷，风险最高。

**每个任务的施工纪律**（沿用 `plan.md` §2.4 与 `agent-rules/testing-and-validation.md`）：
先写会失败的回归测试 → 施工 → 反向验证（移除改动后测试必须失败）→ 实机验证 → 全量门禁。

---

## 6. 本轮明确**不做**（附理由）

| 项 | 理由 |
|---|---|
| **订阅式 OAuth 扩展**（Claude Pro/Max、GitHub Copilot） | 需真实 provider 凭据流，**无法在隔离环境验证**。Phase 3 已两次以此理由移出 |
| **stdin/stdout RPC 协议** | 需要定义 framing + 审批远程应答，是**新契约设计**。我方 stdin 目前是 newline-delimited prompts（`entrypoints/cliRuntimeModule.ts:66`） |
| **programmatic SDK** | 依赖 RPC 契约先定；`index.ts` 目前导出 10 组纯函数，没有会话构造面 |
| **HTML 导出 / 会话分享** | 需先定隐私边界与去向，属产品决策 |
| **图片输入** | `SessionMessage.content: string`（`session/schema/sessionMessage.ts:13`）是字符串，需类型迁移；`multimodal.ts` 的构造器零消费者。Phase 1 §9 已判为独立立项 |
| **Mermaid 渲染** | 需引入新依赖（`pi` 用 `grok-mermaid`）。我方依赖面只有 5 个，不应为此破例 |
| **转录内搜索** | 成本中高（`viewport.ts` 的屏幕行↔内容行映射需扩展），收益低于 T5/T8 |
| **SSE / WebSocket 传输选择** | 仅在确有 provider 收益时再做；`pi` 自己也标注为实验 |
| **prompt cache 保活（warming）** | 依赖目录里的 `promptCache` 寿命字段，而我方 `CatalogModel` 连 `cost` 都没有。**C-1 是它的前置** |
| **完整扩展宿主** | 平台级工程；Phase 3 T5 只做了声明式窄路径，这是有意的边界 |
| **插件包分发（npm/git 安装 + manifest）** | 同上 |
| **主题令牌补齐到 56** | T7 只补**有渲染后果**的 9 个（thinking 档位 7 + 滚动条 2）；其余是 Markdown 与语法的细分，收益不明 |
| **`OURS-ONLY` 各项** | 维护者指示暂缓 |

---

## 7. 核验记录

本文件所有结论由主代理**逐条复现**。

| 结论 | 核验方式 |
|---|---|
| 18 个钩子事件、3 个零派发 | 全仓 `grep 'eventName: "'` 得 18 个派发点；再对 3 个逐个排除 `types.ts`/`config.ts` 后确认为 0 |
| bash schema 无 timeout | 读 `registry.ts:560-567` |
| bash 无 env 透传 | 读 `runtime/execution/types.ts:95-110` + `daemon/client.ts:151-157` |
| `prefilter` 无白名单 | 读全文（三个判据全是排除） |
| `applyTheme` 唯一调用点 | 全仓 `grep applyTheme` → 3 处：import、定义、`cliProcessRunner.ts:104` |
| `/reload` 报告 theme 但不应用 | 读 `reloadCommandRuntime.ts:88` 的 `describeChanges` 列表 + 全仓 `applyTheme` 调用点 |
| `USAGE_RATES` 是常量 | 读 `usageTelemetry.ts:25`；`costCommandRuntime.ts:31-32` 使用处 |
| usage 无 cache 维度 | `grep cacheReadTokens\|cached_tokens` → `src/` 内 0 命中（`browser/` 的命中是无关字段） |
| `tuiMode` 零消费者 | 全仓 4 处命中全在 `runtimeConfig.ts` 自身 |
| transcript 无 header/id/parentId | 读 `sessionTranscript.ts:31-33` + `sessionEventCodec.ts:36+` |
| `threadState` 三函数零调用者 | `grep -rn` → 仅 `threadState.test.ts` |
| `branchWithSummary` 零调用者 | `grep -rn` → 仅 `sessionDagEngine.test.ts:47` |
| `firstKeptEntryId` 无生产者 | 读 `session/compaction.ts:564-568` 的 `onCompact` 载荷（无该字段） |
| footprint 注入位置 | 读 `summarize.ts:75-85`（provider 调用在前，footprint 在后，拼进 checkpoint） |
| `CompactionTranscriptEntry` 无文件明细 | 读 `sessionEventCodec.ts:9-17` |
| 技能根只有两个 | 读 `skillLoader.ts:63-83` |
| `SYSTEM.md` 零内容读取 | 全仓命中仅 `projectTrust.ts:108` |
| 主题 39 个令牌 | `python3` 解析联合类型与 `dark.json`，**两边逐项一致、无差集** |
| **`light.json` 只有 23 个令牌** | `python3` 解析差集 → 缺 16 个（含 `text`） |
| **light 主题下正文变纯白** | **实测探针**（已清理）：`applyTheme("light")` 后 `fg("text")` → `38;5;231`，dark 下为 `38;5;252` |
| 主题测试未覆盖 light 颜色 | 读 `presentation/theme/theme.test.ts` 全部 7 项：无一断言 light 的颜色值 |
| `setCollapsed` 唯一调用者 | `grep -rn setCollapsed` → 定义处 + `container.ts:62` + `pointer.ts:236-240` |
| 无 redo / 无 yankPop | 读 `editor.ts:57`（只有 `undoStack`）、`:246-249`（`yank` 只取栈顶） |
| `steeringMode`/`followUpMode` 零调用点 | `grep -rn` → 仅 `agent.ts` 自身 |
| `ProviderCompatibilityFlags` 零生产消费者 | `grep -rn projectProviderRegistry` → 6 文件，除定义处全为 `.test.ts` |
| `multimodal` 构造器仅测试 | `grep -rn toAnthropicImageBlock\|toOpenAIImageUrlBlock` → 定义 + 测试 |
| `runtime/events/stream.ts` 仅测试 | `grep -rn "events/stream"` → 仅 `tools/toolHandoff.test.ts:5` |
| **per-model 覆盖已可工作** | **实测**：`mergeProviders` patch `{id:"claude-opus-4-6", contextWindow:999_999}` → 覆盖成功且模型总数不变 |
| 指令注入**已过信任门** | 读 `cliRuntimeInvocation.ts:229-235` |

**子代理断言中被证伪或更正的部分**：

| # | 断言 | 复现结果 |
|---|---|---|
| 1 | `P4Extensibility`：「`projectInstructions.ts` 与其调用点没有信任门」 | **证伪**。调用点明确门控（见上表末行） |
| 2 | `P4Terminal`：主题令牌「exactly 37」 | **更正为 39**。解析联合类型与 `dark.json` 均为 39，且无差集 |
| 3 | `P4SessionFmt`：`SessionDagEngine` 的 `SessionHeader` 带 `version: 3` | **需限定**。`version` 在 `sessionDagEngine.ts:18-47` 的接口上是可选的，且**该引擎不在活动写入路径上** |

---

## 8. 未做 / 未验证（如实记录）

1. **未运行构建、测试套件或产品 CLI**。除 §7 表中标注为「实测」的一项（`mergeProviders` 探针，已清理）外，
   全部为**静态代码分析**。
2. **未实测 60 秒超时的真实发生率**：未统计真实会话里有多少次 `bash` 因超时失败。结论基于「`npm install`/构建常超 60 秒」这一常识推断。
3. **未实测 `Ctrl+Z`/`Ctrl+Q` 在各终端的失效比例**：子代理标注为未验证；我方 raw mode 是否关闭 IXON 未检查 termios。
4. **未评估 T5 的迁移成本**：旧 `transcript.jsonl` 没有 `id`/`parentId`，如何回填或容忍未设计。
5. **未验证 `pi` 的 RPC/SDK 实际行为**：`pi` 的 `node_modules` 不存在，无法实跑；其结论来自文档与源码。
6. **未评估 T8 的 keymap 数据驱动对模态优先级的影响**：建议框、picker、pager 各自拦截按键的顺序未逐条梳理。
7. **`tuiMode: "stream"` 的语义未查**：该枚举值在 `pi` 的文档里没有对应物，可能是我方历史遗留。
8. **未统计 `CatalogModel` 加字段的全部下游**：C-1 的费率依赖它，但改动面未逐个列出。
