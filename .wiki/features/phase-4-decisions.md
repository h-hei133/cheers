---
title: "Phase 4 开工前裁决记录：8 项主决策与补充裁决"
category: article
sources: [phase-4-pre-research-2026-09-22, repo-audit-2026-09-22, pi-source-2026-09-22, codex-source-2026-09-22, opencode-source-2026-09-22, gemini-cli-source-2026-09-22, phase-3-decisions-2026-09-21, phase-3-review-2026-09-22]
created: 2026-09-22
updated: 2026-09-22
tags: [features, phase-4, decisions, adjudication]
summary: "Phase 4 开工前的**唯一裁决源**。8 项主决策 + 35 项补充裁决，全部定案。核心裁决：①T1 把 Phase 3 的 T7 死字段门禁**从「配置字段」扩到「导出符号与事件名」**，并**删除 `runtime/events/` 整个目录（5,124 行，零生产消费者）**；②bash 新增 `timeout` 参数但**保留 60 秒默认**（pi 是无超时，我方更好，不照搬）并注入 5 个会话环境变量；③工具可见性新增 `allowedTools` 白名单（fail-open → fail-closed）；④`/cost` 接入 provider 报告的 cache 维度与目录费率，`/reload` 补上主题应用，`tuiMode` 接线到渲染路径；⑤会话 entry 补稳定 id（**不改存储为单文件 DAG**，与 pi 不同）；⑥技能祖先目录搜索、`APPEND_SYSTEM.md`、主题磁盘发现；⑦**补齐 `light.json` 缺的 16 个令牌**（实测：缺 `text` ⇒ 正文变纯白，白底白字不可读）+ 折叠快捷键 + redo/yankPop；⑧keybindings 数据驱动、`@` 文件引用、外部编辑器。**同时更正 3 条既有记录**：per-model 覆盖已可工作、指令注入已过信任门、Phase 1 的「18/18 钩子有派发点」不成立（实为 15/18）。"
confidence: high
---

# Phase 4 开工前裁决记录

> **性质**：开工前把需要拍板的事全部定下来。**零代码改动。**
> **输入**：[`phase-4-pre-research.md`](phase-4-pre-research.md)（候选清单与排序）、五个子代理报告、主代理逐条实测。
> **输出**：8 项主决策 + 35 项补充裁决，每项含**选项 / 双向证据 / 裁决 / 理由 / 失败模式**。

---

## 0. 裁决方法与证据纪律

### 0.1 沿用 Phase 3 的分工（`phase-3-decisions.md` §0.1）

| 角色 | 职责 |
|---|---|
| 子代理 | 只收集**参考实现的证据**，明确禁止给推荐 |
| 主代理（本文件） | 逐条**核验**进入裁决的断言，然后**拍板** |

**为什么不让子代理推荐**：它们看不到本仓库的约束（5 个依赖、只写流、无插件宿主）。
让它们推荐会把「参考实现的做法」误当成「我们应该的做法」。

### 0.2 本轮新增的裁决纪律

Phase 3 的 `phase-3-review.md` 记录了一条**代价很高**的教训：5 个审查者报上来的问题里，
**8 条经复现后不成立**，其中 3 条被标为「高优先度」。本轮据此新增两条：

1. **凡「零消费者」断言，必须用精确导入路径检索**，不能用宽泛词。
   本轮实测：`grep -rl "stream"` 得 **87 个文件**，而精确的 `events/stream.js` 得 **1 个（测试）**。
   宽泛检索会把无关命中读成消费者——这正是 `phase-3-pre-research.md` §4 把 `--json` 判错的同一形态。
2. **凡「参考实现怎么做」的计数，必须给出 `file:line` + 逐字引文**，且注明**实际读了几个仓库**。

### 0.3 参考实现的一句话画像（仅在与裁决相关处引用）

| 项目 | 与本次裁决相关的特征 |
|---|---|
| `pi` | 单文件 DAG session（`id`/`parentId`）；bash **无默认超时**但有 `timeout` 参数；注入 5 个 `PI_*`；`modelOverrides` + `compat` 直接改变请求形状；`thinkingLevelMap` 7 档 |
| `codex` | `timeout_ms` 参数；`RawMcpServerConfig` 穷尽解构（加字段不映射即编译失败）；`require_git(true)` |
| `opencode` | 无独立 `ls`（折进 `read`）；`tools` 映射转 permission；记录 `cacheReadTokens`；无 `modelOverrides` |
| `gemini-cli` | `coreTools` + `allowedTools` + `excludeTools` **三个**工具过滤字段；shell 工具用**无活动超时**而非总时长 |

---

## 1. T1 — 死接口清理与门禁扩面

### 1.1 缺陷（已实测，非推断）

Phase 3 的 T7 建立了 `scripts/check-config-consumers.mjs`，但它**只扫 `RuntimeConfig` 与 `TuiPreferences` 的 `readonly` 字段**
（`scripts/check-config-consumers.mjs:35` → `const REQUIRED_INTERFACES = ['RuntimeConfig', 'TuiPreferences']`）。
于是同一形态在**其他四种载体**上继续存在——本轮盘点出 **12 项**（`phase-4-pre-research.md` §1.1）。

其中最大的一项是 `runtime/events/` **整个目录**：

| 文件 | 行数 | 生产消费者 |
|---|---:|---|
| `runtime/events/projection.ts` | **2,997** | **0** |
| `runtime/events/stream.ts` | 167 | **0** |
| `runtime/events/projection.test.ts` | 1,160 | — |
| `runtime/events/stream.test.ts` | 800 | — |

**精确检索证据**：

```
grep -rn "events/projection.js" → provider/registry/provider.test.ts:4、tools/toolHandoff.test.ts:6
grep -rn "events/stream.js"     → tools/toolHandoff.test.ts:5
```

**三处全部是测试。**

### 1.2 为什么这不是「接线」而是「删除」

`projection.ts` 的 35 条 import 里**只有 1 条是值导入**（`:1` 的 `freezeDeep`），**其余 34 条全是 `import type`**
（逐行核验），即它几乎只在类型层被引用。
而它的上游依赖**都是活的**（实测：`core/values/freeze` 48 个非测试 importer、`evidence/savepoint/model` 48 个、
`session/replay/state` 43 个、`provider/response/boundary` 28 个）。

**即：它消费的是活数据，产出的却没人要。** 这是「为一个已废弃的集成面保留的投影层」，
与 `01-*` §2.3 的 `/plugin`（只登记不执行）是同一设计意图的另一处残留。

**它的 5 个导出**（`ProductLoopAdapterProjectionLike`/`RuntimeProjectionEventType`/`RuntimeProjectionEvent`/
`RuntimeResultFactsProjection`/`projectRuntimeEvents`）**没有任何生产模块引用**——
精确检索 `events/projection.js` 只命中两个测试文件，因此删除不会破坏类型面的消费者。

**另一条独立证据**：`--json` **已经用别的模块实现了**（`presentation/terminal/jsonEvents.ts`），
`phase-1-execution.md` §6.3 记录了这一点，并明确写「该模块是批量报告投影，非事件流」。
**Phase 1 已经判定它不该被接线，只是没有删除。**

### 1.3 裁决

**删除 `runtime/events/` 整个目录**（两个源文件 + 两个测试文件，5,124 行），
**并扩展门禁**使其能发现这类残留。

### 1.4 理由

1. **Phase 1 已判定它不该接线**，且 `--json` 用了另一个模块。保留它等于让下一个读者重新做一遍这个判断。
2. **它是 `--json` 的最强误导源**：两个模块都自称事件流、都带 `schemaVersion`、都带
   `observationOnly`/`terminalSuccessClaim`，**格式却不同**（`run-event-stream.v1` vs `runtime-event-stream.v1`）。
   `02-*` 报告把后者记为「已写好但未接线」是对的，但**读那份报告的人会以为 `--json` 依赖它**。
3. **删除是安全的**：零生产消费者，且上游不依赖它（上游模块各有 28–48 个其他消费者）。
4. **与 Phase 3 的纪律一致**：`phase-0-disposition.md` §1.5 确立「要么接上，要么删掉，不要保留中间态」。

### 1.5 门禁扩面的范围（**这是本项真正的产出**）

**不要**试图做一个「全仓所有导出符号都有消费者」的门禁——那会产出大量误报
（对外 API、测试辅助、按设计保留的扩展点）。**按载体逐个加**，每加一个都必须先回答
「这个载体的『消费者』定义是什么」。

| 载体 | 消费者定义 | 难度 | 本轮是否做 |
|---|---|---|---|
| 配置字段 | 非声明模块的 `.字段` 读取 | 已有（T7） | ✅ 已有 |
| **钩子事件名** | `HookEventName` 联合的每个成员，至少有一个 `eventName: "<名>"` 的派发点 | **低**（字符串匹配，无误报面） | ✅ **做** |
| **工具名** | `argsSchema`/`description` 注册的每个工具，至少被 `createCoreToolRegistry` 返回 | 低 | ✅ **做** |
| 接口字段 | 生产代码的属性读取 | 中（需排除类型导出） | ❌ **不做**——见 §1.6 |
| 模块导出 | 非测试文件的导入 | 低（但需人工裁定豁免） | ⚠️ **改为一次性人工清单**，不做门禁 |

**钩子事件门禁的证据强度最高**：`phase-1-execution.md` §7 记「18/18 有派发点」，
而本轮核实为 **15/18**。**一个能自动发现这个偏差的门禁，其价值已经被这次翻车证明。**

### 1.6 失败模式

| 场景 | 裁决 |
|---|---|
| 门禁把「按设计保留的扩展点」判为死代码 | 每类门禁都带**具名豁免表 + 理由**，照抄 T7 的 `DECLARED_WITHOUT_READER` 形式（`scripts/check-config-consumers.mjs:44-54`） |
| 门禁自己读不到目标却报通过 | **T7 已踩过**（`phase-3-execution.md` §2.4 缺陷 3）：逐接口存在性检查 + 空体检查。新门禁照抄 |
| 删除 `runtime/events/` 破坏某个测试 | 实测确认 importer 全是测试；删除时同步删除那两处 import 与对应测试 |
| 有人后续重新引入同类模块 | 门禁覆盖不到的载体，在 `scripts/check-config-consumers.mjs` 的头部注释里**列出已知盲区**（该文件已有这个习惯） |

### 1.7 验证方式

- `npm run check:config-consumers` + 新增门禁的 `node --test scripts/*.test.mjs`
- **反向验证**：把 `WorktreeCreate` 从 `core/hooks/types.ts` 恢复（而派发点不存在）→ 门禁必须报错
- **实机**：`npm run test:ts` 全绿（删除 5,124 行后文件数与用例数应下降，需与基线对账）

---

## 2. T2 — bash 参数面

### 2.1 缺陷（已实测）

| 项 | 现状 | 证据 |
|---|---|---|
| `timeout` 参数 | **不存在** | `core/tools/registry.ts:560-567` 的 `argsSchema.properties` 只有 `command` |
| 超时值 | **硬编码 60_000** | `core/tools/registry.ts:124` |
| 上限校验 | **无** | `daemon/client.ts:182-186` 直接 `setTimeout(options.timeoutMs)` |
| 会话环境变量 | **无** | `CommandExecutionRequest` 无 env 字段（`runtime/execution/types.ts:95-110`）；`spawn` 只传 `cwd`/`windowsHide`/`detached`（`daemon/client.ts:151-157`） |

### 2.2 三项子决策

**子决策 1：`timeout` 参数的默认值 —— 保留 60 秒，不照搬 `pi` 的「无超时」**

| 选项 | 证据 |
|---|---|
| 照搬 `pi`（无默认） | `pi` 的 schema 描述逐字：`"Timeout in seconds (optional, no default timeout)"`（`src/core/tools/bash.ts:36`） |
| **保留 60s 默认** | `phase-3-review.md` §9.6 已判定：「命令超时默认：pi **无默认超时**，我们 60s —— **我们有更好**，保留」 |

**裁决：保留 60 秒默认。** 理由：无默认超时的后果是**一个挂死的命令永久占用回合**，
而 `interaction-issues.md` §9.1 记录的正是这类事故（`sleep 20 & wait` 超过 60 秒不返回）。
`pi` 用「无默认」换取的灵活性，我们已经用**可指定的 `timeout` 参数**提供。

**子决策 2：上限**

**裁决：设上限，取 `pi` 的值（2,147,483,647 ms ≈ 24.8 天）。**
`pi` 的 `MAX_TIMEOUT_MS = 2_147_483_647`（`bash.ts:20`）不是随手取的——那是
`setTimeout` 的 32 位有符号上限，超过会**溢出为立即触发**。`pi` 还为此单独写了错误消息
（`bash.ts:29-31`：`Invalid timeout: maximum is ...`）。**照抄这个值，并同样报错而非静默钳制。**

**子决策 3：环境变量的注入范围**

**裁决：注入 5 个变量，名字用我方的 `CHEERS_` 前缀（不是 `PI_`）。**

| 变量 | 值来源 |
|---|---|
| `CHEERS_SESSION_ID` | `ToolExecutionContext.sessionId`（`tools/types.ts:10`，**已存在**） |
| `CHEERS_SESSION_FILE` | `locateExistingSessionLayout(...).transcriptPath`（`session/store/sessionFileLayout.ts:105`） |
| `CHEERS_PROVIDER` | 当前活动 provider |
| `CHEERS_MODEL` | 当前活动模型 |
| `CHEERS_REASONING_LEVEL` | `getThinkingEffort(workspaceRoot)`（`core/commands/thinkingCommandRuntime.ts:24`） |

**两个必须照抄 `pi` 的实现细节**（`pi` 的 `bash.ts:118-142` 的 `resolveSpawnContext`）：

1. **先删除继承来的同名变量，再写入**。否则嵌套的 agent 进程会读到**父会话的陈旧值**。
   `pi` 的代码逐字如此（先 5 个 `delete env.PI_*`，再按开关写入）。
2. **值在每条命令启动时解析**，不是会话启动时固化。这样切换模型/思考档位对下一条命令立即生效。

**`pi` 的文档把用途写成了反向指引，值得抄进工具描述**（`docs/environment-variables.md:34`）：

> When asked which model or provider is running, inspect these variables instead of inferring the answer from the system prompt

### 2.3 理由

1. **这是本轮唯一「每天都会踩到」的缺陷**：60 秒杀掉的恰好是 `npm install`、`npm run build`、
   `cargo build`、完整测试套件——**agent 最需要跑的验证命令**。而模型**没有任何参数可以表达「这个要跑久一点」**。
2. **env 注入的收益是「消除猜测」**：模型目前无法可靠回答「你在用哪个模型」，只能从 system prompt 猜，而那里没有。
3. **改动面封闭但跨 4 层**：`core/tools/registry.ts` → `runtime/execution/types.ts` →
   `runtime/execution/service.ts` → `daemon/client.ts`。**两处执行路径都要改**（ts-local 与 rust-daemon），
   否则 `isRustDaemonEnabled()` 时行为不一致——这正是 `interaction-issues.md` §9.4 记录过的「两条路径漂移」缺陷形态。

### 2.4 失败模式

| 场景 | 裁决 |
|---|---|
| 模型给出荒谬的大超时 | 超过上限**报错**（不钳制），照 `pi` |
| 模型给出 0 或负数 | 报错（`pi`：`"Invalid timeout: must be a finite number of seconds"`） |
| rust-daemon 路径未实现 env | **必须同时实现**；`packages/rust-core/src/executor.rs:127` 的 `Command::new` 未调 `.env()`，需加协议字段 |
| 注入变量污染用户命令 | 只注入 5 个具名变量，且**先删同名继承值**；不整体替换 env |
| `sessionId` 缺失（如子代理） | 该变量**不注入**（照 `pi` 的 `PI_SESSION_FILE` 对 ephemeral session 的处理） |

### 2.5 验证方式

- 单元：schema 含 `timeout`；超限报错；`CommandExecutionRequest` 携带 env
- **实机**：跑一条 70 秒的命令，**不带** `timeout` → 60 秒被切断；**带** `timeout: 120` → 正常完成
- **实机**：`bash` 里 `echo "$CHEERS_MODEL"` 输出当前模型；切换模型后**下一条命令**即变
- **反向验证**：移除 env 透传 → 环境变量测试失败

---

## 3. T3 — 工具可见性白名单

### 3.1 缺陷（已实测）

`core/tools/prefilter.ts` 的三个判据**全是排除**：`enableMcpTools`（MCP 前缀）、`disabledTools`（精确名）、
`hiddenToolPrefixes`（前缀）。**没有加法。**

### 3.2 失效方向：fail-open

每次新增一个工具，用户既有的「只读审查」配置就**自动多暴露一个工具**。
`pi` 的文档给出的正是这个用例（`docs/usage.md:196-202`）：

```
pi --tools read,grep,find,ls -p "Review the code"
```

### 3.3 参考实现的计数

| 项目 | 是否有「只要这几个」的表达 | 证据 |
|---|---|---|
| `pi` | ✅ `--tools <list>`（白名单）+ 3 个正交开关 | `docs/usage.md:196-202` |
| `gemini-cli` | ✅ `coreTools` + `allowedTools` + `excludeTools` | `packages/core/src/config/config.ts:607-612` |
| `opencode` | ✅ `tools` 映射 → permission allow/deny | `packages/opencode/src/config/config.ts:567-579` |
| **计数** | **3/3** | 三个仓库都读了源码 |

### 3.4 裁决

**新增 `allowedTools?: readonly string[]` 到 `RuntimeConfig`，在 `buildVisibleToolPool` 里作为第一道判据。**

**语义（三条必须写清楚）**：

1. **`undefined` = 不限制**（不是「空数组 = 全部禁用」）。这与 `disabledTools` 的既有语义一致。
2. **空数组 `[]` = 全部禁用**——用户显式表达「一个都别给」。这两者必须可区分，否则无法表达。
3. **与 `disabledTools` 的顺序**：先白名单收窄，再应用黑名单。白名单是「允许集合」，黑名单在其上再减。
   **但一个同时在两边的工具应当不可见**——减法的语义是「即使允许也不给」，判据顺序不影响这个结果。

**同时新增 CLI 标志 `--tools <a,b,c>`**，走既有的 `RuntimeConfigOverrides` 通道
（`config/runtimeConfig.ts:213-217`，`--no-context-files` 与 `--dangerously-bypass-hook-trust` 已用这条路径）。

### 3.5 理由

1. **失效方向危险**：`fail-open` 的配置在工具集增长时**静默放宽**，而用户不会知道。
2. **成本极低**：`buildVisibleToolPool` 是一处纯函数，加一个判据 + 三个测试。
3. **它是「最小权限运行」的前提**：没有白名单就无法构造只读审查这类运行。

### 3.6 失败模式

| 场景 | 裁决 |
|---|---|
| 用户写了不存在的工具名 | **不报错**（与 `disabledTools` 一致——它同样静默）。但要**在 `/permissions` 或诊断里提示**未知名字 |
| 白名单排除了 `task` 工具 | 子代理不可用——这是用户的明确选择，不特殊处理 |
| 白名单与 `PLAN_MODE_TOOLS` 叠加 | 两者取交集（plan 模式是更严格的约束） |
| 与 MCP 工具名 | 白名单**在 MCP 前缀判据之前**，因此 `mcp__*` 需要在白名单里逐个列出。文档需说明 |

### 3.7 验证方式

- 单元：`allowedTools: []` → 零可见；`undefined` → 全部可见；白名单 + 黑名单交集
- **反向验证**：移除白名单判据 → 对应测试失败
- **实机**：`--tools read,grep` 启动后模型只看到两个工具（`/tools` 或工具 schema 输出可查）

---

## 4. T4 — 报数来源

> 这一类的两个先例都是**用户亲自抓到**的：`phase-2-execution.md` §5（切点被请求体积缩放）
> 与 §5.6（`/context` 读幻影环境变量）。本项目对此的纪律原文是：
> **「凡引入比率或缩放系数，必须能回答『分子与分母是否在度量同一件事』」**。

### 4.1 T4a — `/cost` 的费率与 cache 维度

**缺陷（已实测）**：

- `observability/usageTelemetry.ts:25`：`USAGE_RATES = { promptPerMTok: 0.14, completionPerMTok: 0.28 }`
  —— **两个常量，不随模型变化**。
- usage 只解析三个字段（`turn/step.ts:83`），**cache read/write 完全不读**。
- `CatalogModel` **只有 `id` 与 `contextWindow`**（`core/models/catalog.ts:20-23`）——**没有 `cost`**。

**参考实现**：`pi` 的 `ModelCostRates` 有 4 个费率（`packages/ai/src/types.ts:941-946`：`input`/`output`/`cacheRead`/`cacheWrite`），
`UsageTotals` 也有 5 个字段（`src/core/usage-totals.ts:5-10`），`getUsageCostBreakdown` 按
`${provider}/${responseModel}` 分组（`:36-60`）。`opencode` 记录 `cacheReadTokens`。

**裁决：分三步，按依赖顺序。**

| 步 | 内容 | 依赖 |
|---|---|---|
| **T4a-1** | `CatalogModel` 增加 `cost?: ModelCostRates`（4 个费率，可选） | 无 |
| **T4a-2** | usage 记录增加 `cacheReadTokens`/`cacheWriteTokens`（从 provider usage 读） | 无 |
| **T4a-3** | `/cost` 费率改从目录取；无目录费率时**回退到现有常量并明确标注** | T4a-1 |

**T4a-3 的回退是本项的关键设计**：多数模型目录里不会有 `cost`。
**回退不是失败，但必须说出来**——照 `costCommandRuntime.ts:47` 现有的诚实措辞继续：
「The money is an estimate at a fixed rate that does not follow the model in use」。
**当一个模型有真实费率时，那句话必须消失**，否则用户无法区分「有费率的精确值」与「没费率的猜测」。

**为什么 cache 维度先于费率**：cache 是**实测值**（provider 报告），费率是**查表值**。
先做实测的部分，收益立刻可见（用户能看到缓存命中率），且不需要目录扩展。

### 4.2 T4b — `/reload` 报告了主题变化却不应用

**缺陷（已实测）**：`core/commands/reloadCommandRuntime.ts:88` 把 `theme` 列入 `describeChanges` 的对比项，
于是用户会看到 `theme: "dark" → "light"`；但**全仓 `applyTheme` 只有一个调用点**
（`cli/bootstrap/cliProcessRunner.ts:104`，启动期）。

**这是 Phase 3 A-4 修复时自己引入的不完整**：把 `theme` 加进了「值得报告的变化」列表，但没接上应用动作。

**裁决：让 `/reload` 在主题变化时调用 `applyTheme`，并强制重绘。**

**一处实现约束**：`applyTheme` 会**原地修改共享的 `defaultTheme` 实例**
（`presentation/theme/theme.ts:186-193`，注释明确「Recoloring the shared instance rather than replacing it is what
makes a theme change visible」）。所以应用之后**必须请求一次全量重绘**，否则已渲染的行仍是旧色。
`interactiveMode` 已有 `this.tui.requestRender({ force: true })` 的用法（见 `interactiveMode.ts:541`）。

**为什么这条不能只改报告文字**：报告「变化了」而屏幕不变，**比不报告更糟**——
它训练用户不相信这个命令的输出。

### 4.3 T4c — `tuiMode` 接线

**缺陷（已实测）**：`presentation/tui/render/engine.ts:114` **无条件**写 `ENTER_ALT_SCREEN`；
`tuiMode` 零消费者（4 处命中全在 `runtimeConfig.ts` 自身）。

**后果**：进入备用屏后，**用户的终端 scrollback 里不留下任何对话**。退出或崩溃后向上翻，看不到刚才的问答。

**参考实现**：`pi` 的 `--tui-mode` 默认是 **`regular`**（主屏 + 终端自有 scrollback），
`fullscreen` 是另一种（`docs/usage.md:255-257`）。**它的默认值正是为这个场景存在的。**

**裁决：`tuiMode` 接线到 `engine.start()`，决定是否写 `ENTER_ALT_SCREEN`。**

| 值 | 行为 |
|---|---|
| `fullscreen` | 现状（进备用屏） |
| `regular` | **不进备用屏**，用主屏；转录靠终端自有 scrollback |
| `stream` | **本轮不实现**——见下 |

**关于 `stream`**：该枚举值在 `pi` 的文档里**没有对应物**，疑似我方历史遗留。
**本轮不猜测其语义**：在类型注释里标注「保留但未定义」，与 `tuiMode` 现有的注释风格一致
（`runtimeConfig.ts:133-141` 已诚实说明「stays declared, and unwired」）。
**门禁白名单相应更新**：`tuiMode` 接线后应从 `DECLARED_WITHOUT_READER` **移除**。

**一处必须注意的实现细节**：`engine.stop()` 调用 `leaveScreen(document, ...)`
（`presentation/tui/render/engine.ts:135`，`paint.ts:139-147`），它**总会写 `EXIT_ALT_SCREEN`**。
在不进备用屏的模式下这仍然安全（退出一个未进入的备用屏是无害的，`phase-3-decisions.md` §7.7 的
同类判断：「`terminal.ts:32` 的退出兜底已能安全处理两种模式」），但**文档回写的行为要按模式区分**。

**关于 `regular` 的渲染成本**：`pi` 的实现需要「光标重定位而非全屏 diff」。
本轮**不要求**达到 `pi` 的完整度：最小可交付是「不进备用屏 + 文档在退出时回写」，
即**牺牲滚动中的重绘质量，换取 scrollback 保留**。这必须在执行记录里如实标注为**部分实现**。

### 4.4 验证方式

- T4a：单元（目录有费率 → 用目录；无 → 回退且文案说明）；实机（`/cost` 在有费率的模型上显示目录费率）
- T4b：单元（`/reload` 改变 theme → `applyTheme` 被调用）；**实机 PTY**（改配置 → `/reload` → 终端配色真的变）
- T4c：单元（`tuiMode: "regular"` → 不写 `ENTER_ALT_SCREEN`）；**实机 PTY**（`regular` 下退出后 scrollback 里有对话）

---

## 5. T5 — 会话 entry 身份与分支接线

### 5.1 缺陷（已实测）

| 维度 | 现状 | 证据 |
|---|---|---|
| transcript header/version | **无** | `session/transcript/sessionTranscript.ts:31-33` |
| entry `id` / `parentId` | **无** | `session/sessionEventCodec.ts:36+` 的联合无这两个字段 |
| 分支写入 | **类型有、写入者零** | `threadState.ts:24,49,76` 三函数 + `sessionDagEngine.ts:184` 的 `branchWithSummary` |
| DAG 引擎 | **已写 header 与 `id`/`parentId`，但不在活动路径上** | `sessionDagEngine.ts:18-47,150-160` |

### 5.2 关键裁决：**不采用 `pi` 的单文件 DAG**

**`pi` 的做法**：整个会话是一个 JSONL 文件，首行 header，每行 entry 带 `id`/`parentId`，
`docs/session-format.md:3-4` 原文：*"Session entries form a tree structure via `id`/`parentId` fields,
enabling in-place branching without creating new files."*

**为什么我方不该照搬**：我方的会话是**目录三件套 + 锁**
（`session/store/sessionFileLayout.ts:54-65`：`metadata.json`/`transcript.jsonl`/`state.json`/`state.lock`）。
这是 `02-*` §4 记录的 **OURS-ONLY 能力**，且 `sessionFileStore.ts` 有**原子写 + 重试 + 文件锁**。
把它改成单文件 DAG 是**一次存储层重写**，而收益只是「分支能力」——
分支能力**已经存在**（`SessionDagEngine` + `threadState.ts`），只是没接线。

**裁决：保留目录三件套，只给 transcript entry 补稳定 `id`，并把已有的分支写入函数接上。**

### 5.3 分步

| 步 | 内容 | 理由 |
|---|---|---|
| **T5-1** | `TranscriptEvent` 增加 `id: string`（每行唯一）；**不要求** `parentId` | 游标能力的最小前提。旧行没有 `id` → 读取时**按行号合成**（`line-N`），不迁移文件 |
| **T5-2** | `appendDurableSessionChild` 接到会话写入路径 | 它是 `threadState.ts` 三函数里**唯一有明确调用时机**的（追加一条 entry） |
| **T5-3** | `/export jsonl` 改为**透出原始 transcript 行** | `transcript.jsonl` 本来就是 JSONL，重新序列化投影结果**丢失了 entry 身份** |

**T5-3 的成本极低且正确性收益直接**：`core/commands/exportCommandRuntime.ts:145-147` 的
`asJsonl` 只是 `messages.map(JSON.stringify)`。而 `readConversation`（`:74-77`）先
`projectTranscriptMessages` 再序列化——**导出的不是我们存的东西**。

### 5.4 为什么 `parentId` 本轮不做

`parentId` 只有在**分支真的被写入**时才有意义。`threadState.ts` 的三函数当前零调用者，
而把「分支」变成真实的用户可见功能（`/tree` 式的导航）是**产品设计**，不是接线。
本轮只做 T5-2 的**追加**路径（不需要 `parentId`），把分支导航留给后续。

**这与 `07-*` §3.1 的状态一致**：rewind 的分支摘要**已经在 Phase 1 交付**
（`phase-1-execution.md` §5.2：`BranchSummaryTranscriptEntry` + `appendBranchSummaryEvent` + `summarizeAbandonedTurns`），
本轮不重做。

### 5.5 失败模式

| 场景 | 裁决 |
|---|---|
| 旧 transcript 无 `id` | 读取时按行号合成，**不迁移文件**（迁移会破坏 append-only 承诺） |
| `id` 生成方式 | 用已有的短 id 惯例；**不要**引入 UUID 依赖 |
| `/export jsonl` 的既有消费者 | 无（`grep` 确认只有命令自身）。但导出格式变化需在命令输出里说明 |
| 与 `firstKeptEntryId` 的关系 | T5-1 之后该字段**才有意义**。**本轮不接线它**（压缩切点仍用 `keptMessages` 计数）——`phase-3-decisions.md` §3.5 已论证过该字段活轨无人读 |

### 5.6 验证方式

- 单元：新写的 entry 带 `id`；旧文件读取合成 `line-N`；`/export jsonl` 输出含 `type`/`id`
- **实机**：导出后逐行检查是否保留 compaction/branch_summary 条目（修复前会丢失）
- **反向验证**：恢复 `asJsonl` 的投影路径 → 导出测试失败

---

## 6. T6 — 发现面覆盖

### 6.1 技能祖先目录（**证据强度最高的一项**）

**现状**：`SkillLoader` 只有两个根——`resolveAllUserDataFiles("skills")` 与
`<workspaceRoot>/.agents/skills`（`core/skills/skillLoader.ts:63-83`）。**无向上搜索。**

**参考**：`pi` 的 `docs/skills.md:31` 逐字：

> `.agents/skills/` in `cwd` and ancestor directories (up to git repo root, or filesystem root when not in a repo)

**影响**：仓库根有技能、cwd 在子目录时，**技能静默消失**，且**无任何诊断**。
这是「静默的功能丢失」——文件存在、格式正确，模型就是看不到。

**裁决：加祖先搜索，边界止于项目根标记。**

**边界必须复用已有的判定**，不要新造一套：`context/instructions/projectInstructions.ts:50`
已有 `PROJECT_ROOT_MARKER = ".git"`，`:114-126` 已有向上遍历并在 `.git` 处 `break` 的循环。
**技能搜索照抄这个循环的形状**（`pi` 的「up to git repo root, or filesystem root when not in a repo」正是这个语义）。

**一个必须记录的既有取舍**：`phase-3-review.md` 的 C-1 记录了「我方止步于 `.git` ⇒ worktree 里没有自己的
`AGENTS.md` 时主仓库规则不可见」。**技能会继承同一个取舍。** 本轮**不改**这个取舍
（C-1 已判定「是否要改属产品判断」），但要在执行记录里标注技能同样适用。

### 6.2 `SYSTEM.md` / `APPEND_SYSTEM.md`

**现状**：仅作为敏感文件被探测（`core/security/projectTrust.ts:108`），**从不读内容**。

**参考**：`pi` 的 `docs/usage.md:112-119`。

**裁决：做，但范围收窄。**

**为什么收窄**：`SYSTEM.md` 的语义是**替换系统提示**，而 `APPEND_SYSTEM.md` 是**追加**。
替换会**移除**我方硬编码的执行规则（`turn/prompt.ts:48-56` 的 5 条 CRITICAL 规则）——
那是我方产品行为的一部分，不该被仓库静默替换掉。

**裁决：本轮只实现 `APPEND_SYSTEM.md`**，与指令文件同样过信任门、同样受 `instructionBudgetBytes` 预算约束。
**`SYSTEM.md` 明确不做**：一个能替换掉 harness 自身规则的文件，需要独立的信任设计，不是本轮的接线项。

### 6.3 主题磁盘发现与 `/theme`

**现状**：静态 registry，恒为 `["dark","light"]`（`presentation/themes/index.ts:10-21`）；**无 `/theme` 命令**。

**参考**：`pi` 6 层加载（`docs/themes.md:15-24`）。

**裁决：做两层（用户 + 项目），加 `/theme` 命令。**

| 维度 | 决定 | 理由 |
|---|---|---|
| 层 | `~/.cheers/themes/*.json` + `<workspaceRoot>/.agents/themes/*.json` | 与我方既有的「用户 + 项目」两级一致；不引入包/CLI 层（我方无包系统） |
| 优先级 | 项目覆盖用户（同名以项目为准） | 与 `SkillLoader` 的既有规则一致（`skillLoader.ts:79-82` 的注释：「Project skills win」） |
| 信任门 | 项目主题**过门** | 主题是仓库提供的文件；`pi` 也要求 project trust（`docs/themes.md:20`） |
| 校验 | 缺令牌**不报错**，用默认补齐 | `Theme.apply` 已是 `Map` 覆盖语义（`theme.ts:59`） |
| `/theme` | 列出可选 + 切换 + **持久化到配置** | 与 `/statusline` 的既有形状一致 |
| 热重载 | `/reload` 时重新扫描目录 | 与 T4b 同批 |

### 6.4 验证方式

- 技能祖先：**实测 fixture**——仓库根放 `.agents/skills/x/SKILL.md`，cwd 在 `sub/dir` → 必须发现
- `APPEND_SYSTEM.md`：单元 + **实机**（模型复述追加的规则）
- 主题：单元（目录扫描、优先级、缺令牌）+ **实机 PTY**（`/theme light` → 配色改变且重启后保持）

---

## 7. T7 — 终端交互低成本项

### 7.1 五项，全部「API 已在」

| 项 | 现状 | 改动 |
|---|---|---|
| **`light.json` 缺 16 个令牌（含 `text`）** | **23 / 39**；`applyTheme("light")` 后正文变**纯白**（实测 `38;5;231`） | 补齐 16 个令牌，值取 light 语境下的深色 |
| 折叠块只能鼠标点 | `setCollapsed` 唯一调用者 `cli/interactive/pointer.ts:236-240` | keymap 加 `ctrl+o`（工具输出）与 `ctrl+t`（thinking） |
| 编辑器无 redo | `presentation/tui/editor.ts:57` 只有 `undoStack` | 加 `redoStack`；`undo()` 前压栈 |
| kill ring 不能循环 | `editor.ts:246-249` 的 `yank()` 只取栈顶 | 记录当前位置 + 新增 `yankPop()`；绑 `alt+y` |
| 主题令牌补 9 个 | 39 → 48 | 7 个 thinking 档位色 + 2 个滚动条色 |

**第一项是本轮新发现的缺陷，优先级高于其余四项**（`phase-4-pre-research.md` §3.3）。
它不是「令牌不够多」而是**内容不可见**：`light.json` 的 `userMessageBg` 是 `#f9fafb`（近白），
而缺失令牌的回退是**硬编码纯白**（`presentation/theme/theme.ts:74-77`），
且 `Theme.apply` 是**整体替换** Map（`:69-72`），所以 dark 的值不会被保留。

**为什么它必须先做**：Phase 1 修好了 `light` 的**可达性**（`applyTheme` 接了配置），
于是**用户现在真的能切到 light**——而切过去之后正文不可读。
**修可达性而不修内容，等于把一个原本够不到的问题变成够得到的问题。**

**为什么既有测试没抓到**：`presentation/theme/theme.test.ts` 的 7 项测试**全部用 `defaultTheme`（dark）**
或局部构造的 `Theme`；涉及 light 的两项只断言 `name` 与 `listThemes()` 包含它。
**测试断言了「主题存在」，从未断言「主题可用」。**

**补齐方式**：`light.json` 缺的 16 个令牌逐项补值。取值原则：**light 语境下正文用深色**
（`text` 取 `#111827` 一类的近黑，与既有的 `userMessageText` 一致），语法/命令类令牌取 light 下的可读饱和色。
**同时新增一个门禁断言**：每个内建主题的令牌集合必须**等于** `ThemeColorToken` 联合——
这比「断言 light 存在」有判别力得多。

**键位选择照 `pi`**（`docs/keybindings.md`）：`ctrl+o` = `app.tools.expand`、`ctrl+t` = `app.thinking.toggle`、
`alt+y` = `tui.editor.yankPop`。**照抄的理由是肌肉记忆**——用户在两个工具间切换时不该重新学键位。

**主题令牌的取值**：`pi` 的 56 个令牌里有 9 个是「有渲染后果」的（7 个 thinking 档位色用于编辑器边框，
2 个滚动条色）。滚动条几何**已经算好**（`presentation/tui/transcript/viewport.ts:56-62` 的 `scrollbarGeometry`），
只是用了通用 `border` 色。

**thinking 档位色的动机**：`core/commands/thinkingCommandRuntime.ts:19` 已有 3 档状态，
**而编辑器边框无法表达它**——状态有了，呈现没有。

### 7.2 为什么 `ctrl+z` / `ctrl+q` 的终端冲突**不在本轮修**

`keymap.ts:219-220` 的 `ctrl+z` → `undo()`，`:209-215` 的 `ctrl+q` → busy 时 follow-up。
两者在部分终端上分别是 `SIGTSTP` 与 XON 流控。

**裁决：本轮不改绑定，只记录。**

理由：**改绑是用户可见的行为变化**，而 T8 的「快捷键可自定义」正是让用户自己决定这件事的机制。
先交付 T8，用户就能改；本轮改掉等于**替用户做一个他们即将能自己做的决定**，
且会在 T8 交付时产生「默认值该是什么」的二次讨论。**顺序上 T8 是 T7 的替代方案，不是后续。**

### 7.3 验证方式

- **主题完整性（最高优先）**：单元断言每个内建主题的令牌集合**等于** `ThemeColorToken` 联合
  → **该测试在修复前必须失败**（实测 light 缺 16 个）
- **反向验证**：从 `light.json` 删掉 `text` → 完整性测试失败
- **实机 PTY**：`/theme light` 后**正文可读**（这是本项唯一有意义的验收标准——
  「主题切换生效」不足以证明可用，因为白底白字也「生效」）
- 单元：`redo()` 恢复 `undo()` 的状态；`yankPop()` 沿 ring 回退；`setCollapsed` 经 keymap 可达
- **实机 PTY**：按 `ctrl+o` 展开最近一个工具输出；按 `ctrl+t` 展开 thinking

---

## 8. T8 — 输入面

### 8.1 三项，参考实现 **3/3 全有**

| 项 | 我们 | `pi` | `opencode` | `gemini-cli` |
|---|---|---|---|---|
| 快捷键可自定义 | ❌ | ✅ `keybindings.json` | ✅ `tui/src/config/keybind.ts` | ✅ `keybindings.json` |
| `@` 文件引用 | ❌ | ✅ | ✅ | ✅ |
| 外部编辑器 | ❌ | ✅ Ctrl+G | ✅ `/editor` | ✅ Ctrl+G |

**（计数由子代理给出，三个仓库的源码/文档均已读；`pi` 与 `gemini-cli` 的文档逐字引文见子代理报告。）**

### 8.2 T8-1 快捷键数据驱动

**现状**：`cli/interactive/keymap.ts` 是 `MOTIONS`/`KILLS` 数据表 + `switch (event.keyId)` 分支的**混合**。
`MOTIONS`（`:15-32`）与 `KILLS`（`:34-39`）已是纯数据，**但命令类按键在 `switch` 里**。

**裁决：把 `switch` 分支也提成「action id → handler」表，然后支持覆盖。**

**照 `pi` 的 action id 命名**（`docs/keybindings.md:3-9`）：命名空间化（`tui.editor.*`、`tui.altScreen.*`、`app.*`），
同一套 id 供扩展作者使用。**照抄的理由**：id 是**对外契约**，自己发明一套会与用户既有的 `pi` 配置不兼容，
而用户在两个工具间迁移配置的成本是真实的。

**配置文件位置**：`~/.cheers/keybindings.json`（与 `pi` 的 `~/.pi/agent/keybindings.json` 对应）。

**本轮不做**：`pi` 的「旧格式自动迁移」（`docs/keybindings.md:9`）——我方没有历史格式。

### 8.3 T8-2 `@` 文件引用 + Tab 路径补全

**现状**：补全只接斜杠命令。`cli/interactive/slashSuggestions.ts` 的 `COMMAND_DRAFT`
（`/^\/[A-Za-z0-9-]*$/`）**显式排除**非斜杠输入（注释解释 `/usr/local/bin` 不应弹菜单）。

**关键判断：缺的不是排序，是候选源。** `presentation/tui/chrome/suggestions.ts:25-48` 已实现五档分层
（Exact 1000 / Prefix 900 / Substring 700 / Subsequence 500 / Detail 200），且
`:57-60` 的 `stripSigil` **已经处理了「两侧都去掉前导符号」**——即它**已经为 `@` 做好了准备**。

**裁决：新增一个 `@` 前缀的候选源，复用既有排序。**

**候选源必须走已修好的遍历**：`runtime/execution/fileWalk.ts` 的三层遍历（T1 的成果）。
**`phase-3-pre-research.md` §2.4 已明确「`@` 补全应先修目录剪枝」——该前置已完成。**

**性能约束**：补全在**每次按键**上触发。**不能**每次按键都跑一次完整遍历。
裁决：**按 workspace 缓存文件列表**，在目录变更或 `/reload` 时失效。
（`pi` 的实现细节未逐行读；本裁决按我方约束独立做出。）

### 8.4 T8-3 外部编辑器

**裁决：做，照 `pi` 的回退顺序**（`docs/usage.md:29`）：

> Ctrl+G opens `externalEditor`, `$VISUAL`, `$EDITOR`, Notepad on Windows, or `nano` elsewhere

**一处必须注意的实现约束**：TUI 持有终端 raw mode，外部编辑器需要**完整的终端控制**。
必须先 `stop()`/恢复终端，spawn（`stdio: "inherit"`），等待退出，再重启 TUI。
`pi` 的实现用 `stdio: "inherit"`（`external-editor.ts:25-33`）。
**失败模式是终端卡在 raw mode**——必须有 `finally` 保证恢复，即使编辑器崩溃。

**编辑器内容**：`presentation/tui/editor.ts` 已有 `getText()`/`setText()`（子代理核验），
外部编辑只是「挂起 TUI → spawn → 读回 → 恢复」。

### 8.5 验证方式

- keybindings：单元（覆盖默认、冲突优先级、未知 action id 报错）+ **实机 PTY**（改配置后 `/reload` 生效）
- `@`：单元（候选源、`@` 前缀触发、缓存失效）+ **实机 PTY**（输入 `@` 弹出文件列表）
- 外部编辑器：**实机 PTY**（`EDITOR=true` 走通不崩；`EDITOR=false` 失败后终端仍可用）

---

## 9. 补充裁决汇总（35 项）

| # | 事项 | 裁决 | 理由 |
|---|---|---|---|
| 1 | `runtime/events/` 整个目录 | **删除**（5,124 行） | 零生产消费者；Phase 1 已判定不该接线 |
| 2 | 门禁扩面 | **只加钩子事件 + 工具名两类** | 接口字段与模块导出的误报面太大 |
| 3 | 门禁豁免表 | 照抄 T7 的 `DECLARED_WITHOUT_READER` 形式 | 一个「能失败」的门禁才有价值 |
| 4 | 门禁盲区 | 写进脚本头部注释 | 该文件已有此习惯 |
| 5 | bash `timeout` 默认 | **保留 60s**，不照搬 `pi` 的无默认 | 无默认会导致回合永久占用（§9.1 的事故） |
| 6 | bash `timeout` 上限 | `2_147_483_647` ms，**报错不钳制** | `setTimeout` 的 32 位上限；照 `pi` |
| 7 | bash env 变量名 | `CHEERS_*`（5 个） | 与既有环境变量前缀一致 |
| 8 | bash env 注入方式 | **先删同名继承值再写入** | 防嵌套 agent 读到父会话陈旧值（照 `pi`） |
| 9 | bash env 解析时机 | **每条命令启动时** | 切模型/档位对下一条命令立即生效（照 `pi`） |
| 10 | bash env 与 rust-daemon | **必须同时实现** | 否则两条执行路径漂移（§9.4 的教训） |
| 11 | `allowedTools` 缺省语义 | `undefined` = 不限制；`[]` = 全部禁用 | 两者必须可区分 |
| 12 | `allowedTools` 与黑名单顺序 | 白名单先收窄，黑名单再减 | 两边都在 → 不可见 |
| 13 | `allowedTools` 未知名字 | 不报错，但诊断里提示 | 与 `disabledTools` 一致 |
| 14 | `allowedTools` 与 MCP | 白名单在 MCP 前缀判据**之前** | `mcp__*` 需逐个列出，文档说明 |
| 15 | `--tools` CLI 标志 | **做**，走 `RuntimeConfigOverrides` | `--no-context-files` 已用该路径 |
| 16 | `CatalogModel` 加 `cost` | **做**（4 个费率，可选） | 无它则 `/cost` 无法按模型计价 |
| 17 | usage cache 维度 | **先做**（实测值），费率后做 | cache 是 provider 报告的实测值，不需目录扩展 |
| 18 | `/cost` 无目录费率时 | **回退到常量并明确标注** | 让用户能区分「精确」与「猜测」 |
| 19 | `/reload` 主题 | **调用 `applyTheme` + 强制重绘** | 报告变化而不产生变化比不报告更糟 |
| 20 | `tuiMode` 接线 | **做**，`regular` 不进备用屏 | scrollback 保留 |
| 21 | `tuiMode: "stream"` | **不实现**，注释标为「保留但未定义」 | `pi` 无对应物，疑似历史遗留 |
| 22 | `tuiMode` 的 `regular` 完整度 | **部分实现即可**（不进备用屏 + 退出回写），如实标注 | 完整 `pi` 级重定位不是本轮范围 |
| 23 | `tuiMode` 门禁白名单 | 接线后**移除** | 门禁条目是「决定」不是「积压」 |
| 24 | 会话存储形态 | **保留目录三件套**，不改成单文件 DAG | 改 DAG 是存储层重写；分支能力已存在 |
| 25 | transcript `id` | **加**；旧行按行号合成，**不迁移文件** | 迁移会破坏 append-only 承诺 |
| 26 | transcript `parentId` | **本轮不做** | 只有分支真被写入时才有意义 |
| 27 | `firstKeptEntryId` | **本轮不接线** | 压缩切点仍用 `keptMessages`；§3.5 已论证 |
| 28 | `/export jsonl` | **改为透出原始行** | `transcript.jsonl` 本就是 JSONL |
| 29 | 技能祖先搜索边界 | 复用 `PROJECT_ROOT_MARKER = ".git"` 的既有循环 | 不新造第二套根判定 |
| 30 | `SYSTEM.md` | **不做**；只做 `APPEND_SYSTEM.md` | 替换 harness 自身规则需独立信任设计 |
| 31 | 主题层数 | **两层**（用户 + 项目），不做包/CLI 层 | 我方无包系统 |
| 32 | `light.json` 缺 16 个令牌 | **补齐**，并加「令牌集合 == 联合」的门禁断言 | 缺 `text` ⇒ 正文变纯白，白底白字不可读 |
| 33 | 主题缺失令牌的**运行时**回退 | **本轮不改**（仍回退纯白），只保证内建主题不缺 | 改回退需要决定「按令牌给语义默认」还是「回退到 dark 的值」，是独立设计 |
| 34 | 折叠键/redo/yankPop 的键位 | **照 `pi`**（`ctrl+o`/`ctrl+t`/`alt+y`） | 肌肉记忆：用户在两个工具间切换不该重新学键位 |
| 35 | 主题新增 9 个令牌的**范围** | 只补有渲染后果的（7 thinking + 2 滚动条） | 其余是 Markdown/语法细分，收益不明 |

---

## 10. 汇总表

| 项 | 裁决 | 类型 | 成本 | 风险 | 关键依据 |
|---|---|---|---|---|---|
| **T1** | 删 `runtime/events/`（5,124 行）+ 门禁加「钩子事件 / 工具名」两类 | 删死代码 + 防回归 | 低 | 低 | 零生产消费者（精确检索）；Phase 1 已判定不该接线 |
| **T2** | bash 加 `timeout`（保留 60s 默认，上限报错）+ 注入 5 个 `CHEERS_*` | 修缺陷 | 低 | 低 | 60s 杀掉 `npm install`/构建；2/3 参考有 timeout |
| **T3** | 加 `allowedTools` 白名单 + `--tools` | 修缺陷（fail-open → closed） | 低 | 低 | 3/3 参考都有收窄表达 |
| **T4** | `/cost` cache + 目录费率；`/reload` 应用主题；`tuiMode` 接线 | 修缺陷（报数来源） | 中 | 中 | 用户已抓过两次同类；`pi` 的 `regular` 默认 |
| **T5** | transcript 加 `id`；接 `appendDurableSessionChild`；`/export` 透出原始行 | 接线 | 中 | 中 | 分支能力已在，写入者为零；`/export` 导出的不是存的东西 |
| **T6** | 技能祖先搜索；`APPEND_SYSTEM.md`；主题磁盘 + `/theme` | 补能力 | 低-中 | 低 | 技能是静默功能丢失；`pi` 逐字 |
| **T7** | **补齐 `light.json` 缺的 16 个令牌**；折叠键 `ctrl+o`/`ctrl+t`；redo + yankPop；9 个新令牌 | 修缺陷 + 补能力 | 低 | 低 | **light 下正文变纯白（实测）**；API 已在；`pi` 键位 |
| **T8** | keybindings 数据驱动；`@`/Tab；外部编辑器 | 补能力 | 中-高 | 中 | 3/3 参考都有 |

### 10.1 执行顺序

$$\text{T1} \to \text{T2} \to \text{T3} \to \text{T4} \to \text{T6} \to \text{T7} \to \text{T5} \to \text{T8}$$

与预研一致。三条依赖是**硬约束**：

1. **T1 必须先**：T4 的 `/cost` 费率需要给 `CatalogModel` 加字段，而加字段必须已过门禁；
   T6 的主题发现新增文件类型，同样受门禁约束。
2. **T7 与 T8 的关系**：`ctrl+z`/`ctrl+q` 的终端冲突**由 T8 解决**（用户可自定义），
   所以 T7 **不改绑定**——顺序上 T8 是 T7 的替代方案，中间隔着 T5 只是因为它成本更高。
3. **T5 在 T6 之后**：T5 触及持久化格式（`transcript.jsonl`），
   应在发现面与工具面稳定后单独处理。

**每个任务的施工纪律**（沿用 `plan.md` §2.4 与 `agent-rules/testing-and-validation.md`）：
先写会失败的回归测试 → 施工 → 反向验证（移除改动后测试必须失败）→ 实机验证 → 全量门禁。

---

## 11. 移出本轮（附理由）

| 项 | 理由 |
|---|---|
| **订阅式 OAuth 扩展** | 需真实 provider 凭据流，**无法在隔离环境验证**（Phase 1/3 已两次以此移出） |
| **stdin/stdout RPC 协议** | 需定义 framing + 审批远程应答，是**新契约设计** |
| **programmatic SDK** | 依赖 RPC 契约先定 |
| **HTML 导出 / 会话分享** | 需先定隐私边界，属产品决策 |
| **图片输入** | `SessionMessage.content: string` 需类型迁移；Phase 1 §9 已判为独立立项 |
| **Mermaid 渲染** | 需引入新依赖；我方依赖面只有 5 个 |
| **转录内搜索** | 成本中高，收益低于 T5/T8 |
| **SSE / WebSocket 传输选择** | `pi` 自己也标注为实验 |
| **prompt cache 保活** | 依赖目录 `promptCache` 字段；**T4a 是它的前置** |
| **完整扩展宿主 / 插件包分发** | 平台级工程；Phase 3 T5 只做声明式窄路径是有意边界 |
| **主题令牌补齐到 56** | T7 只补**有渲染后果**的 9 个；其余是 Markdown/语法细分，收益不明 |
| **`SYSTEM.md`** | 能替换 harness 自身规则，需独立信任设计（见 §6.2） |
| **分支导航（`/tree` 式）** | 是产品设计而非接线；T5 只做追加路径 |
| **`tuiMode: "stream"`** | 语义未定义（`pi` 无对应物） |
| **`ctrl+z`/`ctrl+q` 改绑** | 由 T8 让用户自己决定 |
| **`OURS-ONLY` 各项** | 维护者指示暂缓 |

---

## 12. 对既有记录的更正（3 项）

| # | 既有记录 | 实测 | 处置 |
|---|---|---|---|
| 1 | `03-*` §2.3/§3.1：「模型目录**能叠加，不能覆盖**」 | **相反**。`dedupeModels([...existing.models, ...patch.models])` 按 id 去重、后写覆盖。实测 patch `claude-opus-4-6` 的 `contextWindow` 为 999_999 → 生效且模型总数不变 | 原判**证伪**。真正缺的是 `CatalogModel` 只有 2 个字段 |
| 2 | `phase-1-execution.md` §7：「18 个钩子事件覆盖 → **18/18 有派发点**」 | **15/18**。`PostToolUseFailure`/`WorktreeCreate`/`WorktreeRemove` 无派发点 | Phase 1 **多计了**；`gap-status.md` 与本次核实一致（15 个）。**Phase 1 记录未回填，本文件更正** |
| 3 | 子代理 `P4Extensibility`：「`projectInstructions.ts` 与其调用点**没有信任门**」 | **相反**。`cliRuntimeInvocation.ts:229-235` 明确 `isProjectUntrusted` 门控 | 子代理断言**证伪**，未采信 |

**更正 1 的方法论价值**：`mergeProviders` 的注释写的是「A user's models **add to** what ships rather than replacing it」——
**注释说的是「不丢掉原有模型」，读者却读成了「不能覆盖」**。
判断覆盖语义必须读 `dedupeModels` 的循环体，**不能读注释**。

---

## 13. 核验记录

本文件所有断言由主代理逐条核验。

| 结论 | 核验方式 |
|---|---|
| `runtime/events/` 零生产消费者 | **精确** `grep -rn "events/projection.js\|events/stream.js"` → 3 处，全为测试 |
| 宽泛检索会误判 | 实测 `grep -rl "stream"` → 87 文件（无关命中） |
| `projection.ts` 几乎只在类型层被引用 | 读 `runtime/events/projection.ts` 的 35 条 import：**仅 `:1` 是值导入**，其余 34 条为 `import type` |
| `projection.ts` 的 5 个导出无生产引用 | 列出导出名后逐个精确检索 → 只命中两个测试文件 |
| `projection.ts` 的上游是活的 | 逐个计数非测试 importer（`freeze` 48 / `savepoint` 48 / `replay/state` 43 / `response/boundary` 28） |
| bash schema 无 `timeout` | 读 `core/tools/registry.ts:560-567` |
| bash 无 env 透传 | 读 `runtime/execution/types.ts:95-110` + `daemon/client.ts:151-157` |
| rust-daemon 也无 env | 读 `packages/rust-core/src/executor.rs:127-131`（`Command::new` 无 `.env()`） |
| `prefilter` 无白名单 | 读全文（三个判据全是排除） |
| `USAGE_RATES` 是常量 | 读 `observability/usageTelemetry.ts:25` |
| usage 无 cache 维度 | 精确 `grep cacheReadTokens\|cached_tokens` → `src/` 内 0 命中 |
| `CatalogModel` 只有 2 字段 | 读 `core/models/catalog.ts:20-23` |
| `applyTheme` 唯一调用点 | `grep -rn applyTheme` → 3 处（import / 定义 / `cliProcessRunner.ts:104`） |
| `/reload` 报告 theme 不应用 | 读 `reloadCommandRuntime.ts:88` + 上一行 |
| `tuiMode` 零消费者 | 全仓 4 处命中全在 `runtimeConfig.ts` 自身 |
| `ENTER_ALT_SCREEN` 无条件 | 读 `presentation/tui/render/engine.ts:114` |
| transcript 无 `id` | 读 `sessionEventCodec.ts:36+` |
| `threadState` 三函数零调用者 | `grep -rn` → 仅 `threadState.test.ts` |
| `/export jsonl` 先投影 | 读 `exportCommandRuntime.ts:74-77,145-147` |
| 技能根只有两个 | 读 `core/skills/skillLoader.ts:63-83` |
| `SYSTEM.md` 零内容读取 | 全仓命中仅 `projectTrust.ts:108` |
| 主题 39 令牌 | `python3` 解析联合类型与 `dark.json`，**两边逐项一致、无差集** |
| `setCollapsed` 唯一调用者 | `grep -rn setCollapsed` → 定义 + `container.ts:62` + `pointer.ts:236-240` |
| 无 redo / 无 yankPop | 读 `editor.ts:57`（只有 `undoStack`）、`:246-249`（只取栈顶） |
| 补全排序已支持去符号 | 读 `presentation/tui/chrome/suggestions.ts:57-60` 的 `stripSigil` |
| 15 个钩子派发点 | `grep 'eventName: "'` 排除测试与 `types.ts` → 15 处，逐个读 |
| 三个未派发事件的时机已在手边 | 读 `core/tools/taskTool.ts:103,155` + `turn/tools.ts:178-188` |
| 门禁只扫配置字段 | 读 `scripts/check-config-consumers.mjs:35` |
| 门禁的豁免表形式 | 读 `scripts/check-config-consumers.mjs:44-54` |
| **per-model 覆盖已可工作** | **实测探针**（已清理）：patch `claude-opus-4-6` → 覆盖成功、总数不变 |

**子代理断言中被证伪或更正的部分**：

| # | 断言 | 复现结果 |
|---|---|---|
| 1 | `P4Extensibility`：指令注入无信任门 | **证伪**。调用点明确门控 |
| 2 | `P4Terminal`：主题令牌「exactly 37」 | **更正为 39**。联合类型与 `dark.json` 均为 39 且无差集 |
| 3 | `P4SessionFmt`：`SessionDagEngine` 的 header 带 `version: 3` | **需限定**。`version` 在该接口上可选，且该引擎不在活动写入路径 |

**子代理失败记录**：`P4Machine`、`P4Compaction`、以及首轮的 `P4Programmatic`、`P4ToolsContext`
**共 4 次因上游内容过滤器或证书错误失败**；这四块由主代理自行完成或改派更窄的范围。
失败模式与 `phase-3-pre-research.md` §0.2 记录的「扩展宿主方向 3 次因上游内容过滤器失败」同源。

---

## 14. 未做 / 未验证

1. **未运行构建、测试套件或产品 CLI**。除 §13 标注为「实测」的一项（`mergeProviders` 探针，已清理）外，
   全部为**静态代码分析**。
2. **未实测 60 秒超时的真实发生率**：未统计真实会话里 `bash` 因超时失败的次数。
3. **未实测 `ctrl+z`/`ctrl+q` 在各终端的失效比例**：未检查 termios 的 IXON 状态。
4. **未评估 T5 的旧数据兼容成本**：`transcript.jsonl` 已有大量无 `id` 的行；按行号合成的方案未做规模测试。
5. **未验证 `pi` 的 RPC/SDK 实际行为**：`pi` 的 `node_modules` 不存在。
6. **未评估 T8 的 keymap 数据驱动对模态优先级的影响**：建议框、picker、pager 的拦截顺序未逐条梳理。
7. **`tuiMode: "stream"` 的语义未查**：`pi` 无对应物。
8. **未统计 `CatalogModel` 加 `cost` 的全部下游**：T4a-1 的改动面未逐个列出。
9. **未验证 `@` 补全的缓存失效策略**：目录变更的检测方式未设计（文件监听？轮询？）。
10. **门禁扩面的误报率未实测**：钩子事件与工具名两类的豁免表规模未估算。
