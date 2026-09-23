---
title: "Phase 5 前置研究：01–07 剩余差距的地形测绘与候选任务"
category: article
sources: [repo-audit-2026-09-23, pi-source-2026-09-23, phase-4-execution-2026-09-23, phase-4-decisions-2026-09-22, plan-refactor-v7-2026-09-20]
created: 2026-09-23
updated: 2026-09-23
tags: [features, phase-5, pre-research, gap-analysis]
summary: "Phase 5 开工前的地形测绘，零代码改动。Phase 4 收口后重新盘点 01–07 的剩余项，并按「缺陷类别」分组，给出 8 个候选任务与执行顺序。三项核心发现：①**本仓 160 个生产文件 / 35,912 行 CLI 不可达**，其中一整个「报告投影族」——`turn/` 的队列/bundle、`tools/dispatch/` 全族、`provider/request|response/` 全族——的职责已由活轨承担（活轨走 `core/agent/tools.ts` 的 `executeToolBatch` 与 `turn/step.ts` 的直接 fetch），与 Phase 4 删掉的 `runtime/events/` 是同一形态；②**retry 只有「资格判定」没有「执行」**：`provider/request/invocation.ts:328` 会算 `retry_eligible`，而活轨 `turn/step.ts` 的全部失败路径直接 `return errorStep`，无重试、无退避；③**`steeringMode`/`followUpMode` 的消费链断在 `core/agent/agent.ts`**——`AgentCore` 支持两种投递模式，但 `turn/session.ts:112` 构造时从不传入，配置里也没有这两个字段。"
confidence: high
---

# Phase 5 前置研究

> **性质**：Phase 5 开工前的测绘，**零代码改动**。
> **输入**：`.wiki/features/01-*` … `07-*`、`phase-4-execution.md`、`phase-4-decisions.md`、
> `.wiki/refactor/plan.md`（v7）、`scripts/analyze-boundaries.py` 的实测输出、六个参考实现子代理报告。
> **输出**：候选任务与执行顺序，**不含施工**。

---

## 0. 方法与边界

### 0.1 起点：Phase 4 之后剩下的东西

Phase 4 已收口 8 项任务（`86739806` → `02a20d21`）。本轮的起点是**在收口后的真实代码上重新盘点**，
而不是照抄 Phase 4 的清单——Phase 4 执行中推翻了三条既有记录（`phase-4-execution.md` §11），
说明文档与代码的偏离是常态。

盘点方法：对 01–07 每一份的覆盖清单逐行核对**当前代码**，标出：

| 状态 | 含义 |
|---|---|
| **已收口** | 该行的 ✅ 标注经代码复核成立 |
| **仍开放** | 无 ✅ 标注，且代码现状仍符合原文描述 |
| **已变质** | 有 ✅ 标注，但代码复核发现收口不完整或引入了新问题 |

### 0.2 本轮的分组口径

沿用 `phase-4-pre-research.md` §0.2 的五类，但**提高 A 类的门槛**：

| 类别 | 判据 | 处置 |
|---|---|---|
| **A 职责已由活轨承担的死代码** | 生产消费者为 0，**且能指出活轨上承担同一职责的模块** | 删除（须过 `plan.md` §2.2 六项检查） |
| **B 有可观测失效的缺陷** | 用户/模型能感知到「本该成功却失败」或「说了没做」 | 修 |
| **C 报数不来自它声称的来源** | 展示的数字与其声称依据不是同一件事 | 修 |
| **D 能力已在代码里但未接线** | 数据结构、API 都已写好，缺调用者 | 接线 |
| **E 参考实现有而我们没有** | 纯能力缺口，无现成基础设施 | 按价值/成本取舍 |

**A 类门槛为什么提高**：Phase 4 的 T1 删掉 `runtime/events/`（5,124 行）时，
`plan.md` §2.1 的规则是「可达性只用于分析，不授权删除」，真正的授权是
**「职责已被活轨承担」**。本轮对每一个候选死簇都要求指名活轨上的承担者，
指不出来的一律归 D（接线）或保留。

### 0.3 勘察分工与核验纪律

| 勘察 | 执行者 | 结果 |
|---|---|---|
| Provider / 模型层 | 子代理 `PiProvider` | 完成 |
| 会话格式与程序化集成 | 子代理 `PiSession` | 完成 |
| 扩展性与发现面 | 子代理 `PiExtensibility` | 完成 |
| 可观测性与生命周期 | 子代理 `PiObservability` | 完成 |
| 终端交互与工具 | 子代理 `PiTerminal` | 完成 |
| 配置系统全貌 | 子代理 `PiConfig` / `PiConfig2` | 完成（两次，第二次补全 key 表） |
| 重试与错误分类 | 子代理 `PiRetry` → **失败**（上游 `content_filter`）→ `PiRetry2` 重派 | 完成（`agent://PiRetry2`） |
| 死代码与可达性实测 | 主代理 | 完成 |

**纪律**：每条进入本文件结论的断言，由主代理**逐条复现**；子代理报告存于
`agent://PiProvider`、`agent://PiSession`、`agent://PiExtensibility`、`agent://PiObservability`、
`agent://PiTerminal`、`agent://PiConfig`、`agent://PiConfig2`、`agent://PiRetry2`。

**一条方法论更正（本轮自己踩到并记录）**：主代理最初用自写的正则做「值导入闭包」，
得出「603 个不可达文件」；而仓库自己的 `scripts/analyze-boundaries.py` 给出 **160**。
差别的来源是自写正则把 `import type` 也算成边。**结论：可达性数字一律以仓库脚本为准**，
自写分析只能用于「某个具体符号有没有消费者」这类点查询。这与 `plan.md` §5 记录的
「间接证据替代直接证据」是同一形态的第五次出现。

---

## 1. 类别 A：职责已由活轨承担的死代码

### 1.1 实测基线

```
$ python3 scripts/analyze-boundaries.py
{ "production": 963, "cliReachable": 802, "cliOpaque": 161, ... }
```

**160 个生产文件 / 35,912 行**从 CLI 入口不可达。这个数字本身**不授权删除**
（`plan.md` §2.1、`.normproof/dispositions.md` 的 `unreachable-code-retention` 行）。
本轮的贡献是**从中挑出能指名活轨承担者的簇**。

### 1.2 「报告投影族」——本轮最重要的发现

盘点中发现一整族模块，它们的共同形状是：**产出 `…Projection` / `…Bundle` / `…Report` 类型，
带 `terminalSuccessClaim: false` 与 `notProvenClaims`，但没有任何生产模块读取它们。**

**判定方法**（可复核）：先取 `scripts/analyze-boundaries.py --list` 的逐文件可达标记，
把「CLI 可达」与「scripts 可达」定义为**活**；然后对每个非活文件列出其**非测试 importer**，
筛出「importer 非空且**全部非活**」的集合 S（这是「没有活消费者」的精确定义）；
再对 S 取弱连通分量，得到一个「删掉不会让任何活文件悬空」的簇。

```
CLOSED COMPONENTS (no live importer): 12 components / 107 files / 26,418 lines
```

其中**最大的一条 85 文件 / 23,644 行**把下面三族连成一体（它们互相 import）。
本轮只对**能指名活轨承担者的三族**提出删除，其余 85 文件里的成员
（`context/*`、`edit/*`、`planning/*`、`evidence/*`、`result/*`、`verification/*`、
`session/*`）**保留**——它们没有活轨承担者，属 `plan.md` §4.6 的既定范围。

#### 族 1：工具调度与投影（11 文件 / 2,491 行）

| 文件 | 行数 | 非测试 importer | 活轨上的承担者 |
|---|---:|---|---|
| `tools/dispatch/types.ts` | — | 3（全非活） | `core/agent/tools.ts:184` `executeToolBatch` |
| `tools/dispatch/planner.ts` | — | 2（全非活） | 同上 |
| `tools/dispatch/projector.ts` | — | 2（全非活） | 同上 |
| `tools/dispatch/executor.ts` | — | 1（非活） | 同上 |
| `tools/concurrency/fileMutationQueue.ts` | 69 | 1（非活） | `runtime/execution/fileLock.ts:85` `withFileLock` |
| `tools/scheduling/plan.ts` | 296 | 2（全非活） | 同上 |
| `tools/policy/effects.ts` | 88 | 3（全非活） | `core/query/toolPolicy.ts` |
| `tools/toolHandoff.ts` | 222 | **0** | `core/agent/tools.ts:184` |
| `tools/toolOutcomeBundle.ts` | 271 | 2（全非活） | 同上 |
| `tools/toolBatchDispatch.ts` | 39 | 4（全非活） | 同上 |
| `tools/toolCallBatch.ts` | 392 | 6（全非活） | `turn/tools.ts` 的 `parseToolCalls` |

#### 族 2：turn 层投影（7 文件 / 1,266 行）

| 文件 | 行数 | 非测试 importer | 活轨上的承担者 |
|---|---:|---|---|
| `turn/nextTurnBundle.ts` | 335 | `provider/request/boundary.ts`（非活） | `turn/session.ts:112` 直接构造 `AgentCore` |
| `turn/deliveryPolicy.ts` | 131 | `turn/nextTurnBundle.ts`（非活） | `core/agent/queue.ts` 的 `drain()` |
| `turn/steeringQueue.ts` | 136 | 2（全非活） | `core/agent/agent.ts:30-31` 的 `PendingQueue` |
| `turn/followUpQueue.ts` | 136 | 同上 | 同上 |
| `turn/toolResultMessage.ts` | 207 | 3（全非活） | `core/agent/tools.ts` 的 `createToolResultMessage` |
| `turn/assistantResponse.ts` | 178 | 3（全非活） | `turn/step.ts` 的 `toStep()` |
| `turn/turnSnapshot.ts` | 143 | `evidence/savepoint/model.ts`（非活） | `turn/projection.ts` 的 `TurnProjection` |

#### 族 3：provider 请求/响应包装（8 文件 / 2,995 行）

| 文件 | 行数 | 非测试 importer | 活轨上的承担者 |
|---|---:|---|---|
| `provider/request/attempt.ts` | 847 | **0** | `turn/step.ts:97` `createStepFunction` |
| `provider/request/boundary.ts` | 791 | 3（全非活） | 同上 |
| `provider/request/invocation.ts` | 391 | 2（全非活） | 同上 |
| `provider/request/fallback.ts` | 196 | 1（非活） | 同上 |
| `provider/response/adapter.ts` | 239 | 2（全非活） | `turn/completion.ts` `readCompletionStream` |
| `provider/response/stream.ts` | 297 | 3（全非活） | 同上 |
| `provider/response/synthetic.ts` | 89 | **0** | 同上 |
| `provider/response/boundary.ts` | 145 | 4（全非活） | `turn/step.ts` 的 `toStep()` |

（`provider/liveProviderSmokeFallback.ts` **不属于本族**，理由见 §1.4(a)。）

#### 连带闭包（6 文件 / 1,578 行）

删掉上述三族后，下列文件会失去**全部** importer（它们只被这三族引用），
因此在同一批内一并删除：

| 文件 | 行数 | 只被谁引用 |
|---|---:|---|
| `session/replay/state.ts` | 459 | `context/acquisition/summary.ts`、`session/replay/host/facts.ts` |
| `evidence/savepoint/model.ts` | 342 | `context/rebuildInput.ts`、`session/replay/state.ts` |
| `session/continuation/readiness.ts` | 248 | `context/acquisition/summary.ts` |
| `session/replay/host/facts.ts` | 232 | `session/replay/state.ts` |
| `context/rebuildInput.ts` | 174 | `session/replay/state.ts`、`evidence/savepoint/model.ts` |
| `context/acquisition/summary.ts` | 123 | `context/acquisition/engine.ts`、`session/continuation/readiness.ts` |

**合计 32 文件 / 8,330 行**（族 1 = 11 文件 / 2,491 行，族 2 = 7 文件 / 1,266 行，
族 3 = 8 文件 / 2,995 行，闭包 = 6 文件 / 1,578 行）。

> **⚠️ 复核更正（2026-09-23）**：本节初版写「32 文件 / 8,330 行」，闭包列为 10 文件、总数 36。
> 独立复核者 `RvDeadCode` 指出两处错误：
> ①**闭包方向算错**——初版把 `context/acquisition/{engine,projection}.ts`、
> `planning/runtime/*`、`planning/grounded/projection.ts`、`planning/handoff/mutation.ts`、
> `model-adapters/types.ts` 列为「只被候选集引用」，但它们**有候选集之外的引用者**
> （例如 `context/acquisition/engine.ts` 被 `planning/runtime/*` 引用，
> 而 `planning/runtime/*` 又互相引用形成另一簇），因此**不属于本批**；
> ②**漏了真正会悬空的 6 个文件**——`session/replay/state.ts` 与 `evidence/savepoint/model.ts`
> 从候选集**做类型导入**（`toolOutcomeBundle.js`、`toolBatchDispatch.js`、`turnSnapshot.js`），
> 不一起删就会让 `tsc` 报错。
> 复核者同时指出 §2.6 的 `index.ts` 断言与 §2.2 的 `withFileLock` 覆盖面描述有误，均已更正。

形状与 Phase 4 删除的 `runtime/events/` **完全同型**：

- 都是「为一套未接线的报告/投影面保留的层」；
- 都消费**活的数据**、产出**没人要的产物**；
- 都带一整套 `notProvenClaims` / `terminalSuccessClaim` 的诚实标注；
- 都只在测试里有消费者。

### 1.3 为什么这不是「接线」而是「删除」

**决定性的证据是活轨已经有承担者，而且承担者的位置更好**：

| 职责 | 投影族的位置 | 活轨的位置 | 为什么活轨更好 |
|---|---|---|---|
| 工具批执行 | `tools/dispatch/executor.ts` | `core/agent/tools.ts:184` `executeToolBatch` | 活轨在**内核**（`core/agent/loop.ts:164` 调用），投影族在**外层**；内核不可能调用外层 |
| 同文件写入串行 | `tools/concurrency/fileMutationQueue.ts` | `runtime/execution/fileLock.ts:85` `withFileLock` | 活轨的锁在**执行服务**层，`write` 与 `edit` 都取它（`core/tools/registry.ts:402,483`）；投影族的锁只覆盖它自己的 executor。**复核更正**：初版写「覆盖 `read`/`write`/`edit` 三个工具」是错的——`read` 只读，不取锁 |
| 模型请求 | `provider/request/attempt.ts` | `turn/step.ts:97` `createStepFunction` | 活轨直接 `fetch`，投影族是它外面的一层包装 |
| 响应流解析 | `provider/response/stream.ts` | `turn/completion.ts` `readCompletionStream` | 同上 |
| 队列投递 | `turn/steeringQueue.ts` | `core/agent/queue.ts` 的 `PendingQueue.drain()` | 活轨的队列在 `AgentCore` 内部，投影族在 turn 层，**看不到内核的 drain** |

即：**投影族是「内核之外的第二套实现」，而内核那一套在跑。**
把投影族接上去会得到**两套批执行**、**两把锁**、**两个响应解析器**——
正是 Phase 4 T1 删除 `runtime/events/` 时避免的那个结果（两套事件流、两个 `schemaVersion`）。

### 1.4 必须区分的例外

**（a）`provider/liveProviderSmokeFallback.ts`（107 行）**：非测试 importer 为 **0**，
但它**不是投影层**——它是对「真实 provider 冒烟测试失败如何归因」的分类函数
（`classifyLiveProviderPrimaryFailure`）。按 §0.2 的 A 类门槛，**指不出活轨承担者**
（活轨没有等价的失败归因分类），因此**不列入删除候选**。

**（b）`core/security/redaction.ts`（75 行）**：它被 `edit/*`、`repair/*`、`verification/*`
等**保留文件**引用，只是因为那些引用者本身非活才落进大簇。
**不列入删除候选**——它是被保留代码使用的工具，不是投影层。

**（c）`evidence/savepoint/model.ts` 与 `session/replay/state.ts`**：它们**不是投影层**，
但因为从候选集**做类型导入**（`turn/turnSnapshot.js`、`tools/toolOutcomeBundle.js`、
`tools/toolBatchDispatch.js`），删除候选集后它们的 import 会悬空。
实测它们自身**也非活、且只被非活文件引用**，因此**随闭包一起删除**
（见 §1.2 的连带闭包表）。**若将来要保留它们**，则必须改为编辑其 import
而不是删除——两条路都可，本轮选删除，因为保留它们会让一个死链继续存在。

**本轮的处置边界**：只有 §1.2 三族 + 连带闭包（6 文件）进入候选；
`context/*`（除闭包）、`edit/*`、`planning/*`、`evidence/*`（除闭包）、`result/*`、
`verification/*`、`session/*`（除闭包）、`browser/*`、`core/harness`、`test-utils/*`
**一律保留**——它们各自有独立职责，只是整条链未接线，属 `plan.md` §4.6 已裁定的
「10 项未接线候选：全部不恢复」范围。

**复核记录的边界问题**：复核者 `RvDeadCode` 指出，本仓还有 **50 个生产文件零非测试
importer**（例如 `repair/handoff/readiness.ts`、`session/recovery/sessionReconciler.ts`、
`session/presentation/facts.ts`）**未被本轮的 32 个候选覆盖**。
这是**如实记录的范围限定**：它们没有可指名的活轨承担者，因此不满足 §0.2 的 A 类门槛，
按 `plan.md` §2.1「可达性不授权删除」保留。**它们的处置属既有 `unreachable-code-retention`
裁定的范围，本轮不改。**

### 1.5 与参考实现的对照（子代理逐字核验）

| 本仓概念 | `pi` 是否有 | 证据 |
|---|---|---|
| 独立的工具批调度/投影层 | **无** | 工具派发内联在 `agent-loop.ts:267-272,516-520` |
| 独立的 provider 请求包装层 | **无** | 请求由 `packages/ai/src/api/openai-completions.ts` 直接构造 |
| 独立的响应流投影 | **无** | 流事件由 API 适配器直接产出 |
| 独立的 turn bundle / delivery policy | **无** | 投递由 `agent-session.ts` 的队列直接决定 |

即：**被删的是一个本仓独有、参考实现从未采用的抽象层**，与 Phase 4 T1 的判定一致。

---

## 2. 类别 B：有可观测失效的缺陷

### 2.1 B-1（最高优先）重试只有「资格判定」没有「执行」

**证据（我们）**：

- `provider/request/invocation.ts:37-39` 定义了完整的重试资格枚举：
  ```ts
  | "retry_metadata_unavailable"
  | "retry_eligible"
  | "retry_ineligible";
  ```
- `:328-334` 有判定函数：
  ```ts
  function retryEligibility(
    ...
  ): ModelInvocationRetryEligibility {
    ...
    ? "retry_eligible"
    : "retry_metadata_unavailable";
  ```
- **但那个模块生产 importer 为 0**（§1.2）。
- 活轨 `turn/step.ts` 的**两处** catch 全部直接返回错误（`:142-145` 与 `:173-176`）：
  ```ts
  } catch (error) {
    if (signal?.aborted) return abortedStep("");
    return errorStep(`Network error: ${error instanceof Error ? error.message : String(error)}`);
  }
  ```
  ```ts
  if (!response.ok) {
    const detail = await response.text();
    if (isContextOverflow(detail)) return errorStep(`${CONTEXT_OVERFLOW_PREFIX}${detail.slice(0, 200)}`);
    if (effort && /reasoning_effort/i.test(detail)) {
      effortAccepted = false;
      continue;                       // ← 唯一的重试：去掉 reasoning_effort 再来一次
    }
    return errorStep(`Provider HTTP ${response.status}: ${detail.slice(0, 200)}`);
  }
  ```
  **唯一的重试是「宿主拒绝 `reasoning_effort` 就丢掉该字段重试一次」**，与网络/限流/5xx 无关。

**对照参考实现**（`PiConfig2` + `PiRetry2` 逐字）——`pi` 有**两层**重试，我们一层都没有：

**层 1：provider HTTP 重试**（`packages/ai/src/utils/provider-retry.ts:105-125`）

```ts
export async function retryProviderRequest<T>(
	request: () => Promise<T>,
	options: ProviderRetryOptions = {},
): Promise<T> {
	const maxRetries = options.maxRetries ?? 0;
	let retriesRemaining = maxRetries;

	for (;;) {
		try {
			// Each retry is a fresh SDK request, so X-Stainless-Retry-Count remains zero.
			return await request();
		} catch (error) {
			if (options.signal?.aborted) throw createAbortError();
			if (retriesRemaining <= 0 || !isProviderError(error) || !isRetryableProviderError(error)) throw error;

			const retryIndex = maxRetries - retriesRemaining;
			retriesRemaining--;
			await abortableSleep(getRetryDelayMs(error, retryIndex, options.maxRetryDelayMs), options.signal);
		}
	}
}
```

**可重试判定**（`provider-retry.ts:23-37`）——先看响应头的显式指令，再看状态码：

```ts
function isRetryableProviderError(error: ProviderError): boolean {
	const shouldRetry = error.headers?.get("x-should-retry");
	if (shouldRetry === "true") return true;
	if (shouldRetry === "false") return false;

	if (error.status === undefined) return true;
	return (
		error.status === 408 ||
		error.status === 409 ||
		error.status === 429 ||
		(typeof error.status === "number" && error.status >= 500)
	);
}
```

**退避**（`provider-retry.ts:51-68`）——**优先服从服务端指令**，否则指数退避 + 抖动：

```ts
function getRetryDelayMs(error: ProviderError, retryIndex: number, maxRetryDelayMs: number | undefined): number {
	const retryAfterMs = error.headers?.get("retry-after-ms");
	if (retryAfterMs) { ... return validateServerRetryDelayMs(value, maxRetryDelayMs, error.message); }

	const retryAfter = error.headers?.get("retry-after");
	if (retryAfter) {
		const seconds = Number.parseFloat(retryAfter);
		const delayMs = Number.isNaN(seconds) ? Date.parse(retryAfter) - Date.now() : seconds * 1000;
		return validateServerRetryDelayMs(delayMs, maxRetryDelayMs, error.message);
	}

	const exponentialDelay = Math.min(0.5 * 2 ** retryIndex, 8) * 1000;
	return exponentialDelay * (1 - Math.random() * 0.25);
}
```

**层 2：assistant 级重试**（`packages/ai/src/utils/retry.ts:181-224`，节选）

```ts
const maxAttempts = policy?.enabled ? policy.maxRetries : 0;
...
// Abort: terminal but not successful. Never retry an aborted message.
if (response.stopReason === "aborted") { ... return response; }
// Success: non-error, non-abort responses return as-is.
if (response.stopReason !== "error") { ... return response; }
// Non-retryable, or budget exhausted: return the final error message.
if (attempt >= maxAttempts || !isRetryableAssistantError(response)) { ... return response; }
```

**退避**（`retry.ts:113-117`）：

```ts
export function retryDelayMs(policy: Pick<RetryPolicy, "baseDelayMs" | "maxAgentDelayMs">, attempt: number): number {
	const delay = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
	const safeDelay = Number.isSafeInteger(delay) ? delay : Number.MAX_SAFE_INTEGER;
	return Math.min(safeDelay, policy.maxAgentDelayMs ?? DEFAULT_MAX_AGENT_RETRY_DELAY_MS);
}
```

**错误分类**（`retry.ts:7-92`）——**不是枚举，是两组正则**：

- `NON_RETRYABLE_PROVIDER_LIMIT_ERROR_PATTERN`：`GoUsageLimitError`、`insufficient_quota`、
  `out of budget`、`quota exceeded`、`billing`、`Monthly usage limit reached`……
  ——**账户/计费类限额，重试无用**，立即失败；
- `RETRYABLE_PROVIDER_ERROR_PATTERN`：`overloaded`、`rate.?limit`、`429`、`500`-`504`、
  `network.?error`、`connection.?refused`、`fetch failed`、`getaddrinfo`、`socket hang up`、
  `timeout`、`stream ended before message_stop`、`websocket.?closed`……

**关键的一条**：`pi` 把**上下文溢出**单独分类（`utils/overflow.ts:136-146` 的 `isContextOverflow`），
**且先排除非溢出模式**（`NON_OVERFLOW_PATTERNS`，如限流文案）——溢出走压缩恢复，
其余走重试。**我方已有 `isContextOverflow`（`turn/step.ts:70-74`），这部分是对的。**

**设置项**（`docs/settings.md`）：

| 设置 | 默认 | 含义 |
|---|---|---|
| `retry.enabled` | `true` | 对瞬态失败启用 agent 级重试 |
| `retry.maxRetries` | `3` | 最大重试次数 |
| `retry.baseDelayMs` | `2000` | 指数退避的初始延迟 |
| `retry.maxAgentDelayMs` | `60000` | 最大重试延迟 |
| `retry.provider.timeoutMs` | `httpIdleTimeoutMs` | provider 请求超时 |
| `retry.provider.maxRetries` | `0` | provider 级重试次数 |
| `retry.provider.maxRetryDelayMs` | `60000` | 服务端请求延迟的上限 |

**注意一处必须照抄的设计**：`retry.provider.maxRetries` 的默认是 **0**——
**provider 层默认不重试，重试发生在 agent 层**。理由是 agent 层重试能重新考虑上下文
（例如先压缩再重试），provider 层重试只能原样再发一次。

**影响（可观测失效）**：一次 429 或一次 502 直接终止整个回合。
模型**没有可用的表达方式**要求重试，用户看到的是一条错误消息，而不是「等一下就好了」。
这与 Phase 4 的 B-1（bash 60 秒超时）是同一类别：**本该成功却失败，且没有参数可表达**。

### 2.2 B-2 消息投递模式不可配，且消费链断在内核边界

**证据（我们）**：

- `core/agent/agent.ts:16-17` 声明了两个选项：
  ```ts
  readonly steeringMode?: "one-at-a-time" | "all";
  readonly followUpMode?: "one-at-a-time" | "all";
  ```
- `:39-40` 用它们构造队列，`:106-110` 有 `setQueueMode`，`:115-119` 有 `steer`/`followUp`，
  `:168-169` 把 `drain()` 接到循环。
- **但 `turn/session.ts:112` 构造 `AgentCore` 时不传这两个字段**（该处传了
  `initialState`/`tools`/`beforeToolCall`/`afterToolCall`/`streamStep`/`shouldStopAfterStep`/
  `prepareNextStep`/`onContextReplaced`/`getSteeringMessages`/`getFollowUpMessages`）。
- `setQueueMode` 的生产调用者 **0**（只有 `agent.test.ts:388`）。
- `config/runtimeConfig.ts` **没有**这两个字段。

**对照参考实现**（`PiTerminal` 逐字）：

| 设置 | 类型 | 默认 |
|---|---|---|
| `steeringMode` | `"all" \| "one-at-a-time"` | `"one-at-a-time"` |
| `followUpMode` | `"all" \| "one-at-a-time"` | `"one-at-a-time"` |

**影响**：功能等价，差别是**可配置性**。用户无法把投递模式从 `one-at-a-time` 改成 `all`。
这是 D 类（能力已在，缺接线）与 B 类的交叉——但**内核那一半已经跑起来了**
（`PendingQueue` 完整实现并有测试），缺的只是配置字段到构造参数的两跳。

### 2.3 B-3 `CatalogModel` 只有 3 个字段，不足以表达一个模型

**证据（我们）**：`core/models/catalog.ts:20-33`：

```ts
export interface CatalogModel {
  readonly id: string;
  readonly contextWindow?: number;
  readonly cost?: ModelCostRates;
}
```

**对照参考实现**（`PiProvider` 逐字，`packages/ai/src/types.ts:982-1017`）——`pi` 的 `Model` 有 **16 个字段**：

`id`、`name`、`api`、`provider`、`baseUrl`、`reasoning`、`thinkingLevelMap`、`input`、
`inputLimits`、`cost`、`promptCache`、`contextWindow`、`maxTokens`、`samplingParams`、
`headers`、`compat`。

**这不是「字段越多越好」**。逐项对照后，其中**对我们当前能力有实际影响**的是：

| `pi` 字段 | 我们是否有等价物 | 影响 |
|---|---|---|
| `reasoning: boolean` | 无 | 无法判断一个模型是否支持思考，`/thinking` 对不支持的模型也照发 `reasoning_effort` |
| `thinkingLevelMap` | 无（见 §3.1） | 档位名直传，模型不认的名字被拒 |
| `maxTokens` | 部分（`config.maxOutputTokens`，全局） | 无法按模型给默认输出上限 |
| `input: ("text"\|"image")[]` | 无 | 无法判断模型是否支持图片（与 §5.4 的图片输入缺口同源） |
| `samplingParams` | 无 | 无法按模型给默认采样参数 |
| `promptCache` | 无 | cache 保活无从判断寿命（§3.3） |
| `compat` | 有但**描述性**（见 §2.4） | |

### 2.4 B-4 兼容性标志是描述性的，不改变请求形状

**证据（我们）**：`provider/registry/provider.ts:28` 声明 `ProviderCompatibilityFlags`
（11 个字段：`developerRole`/`systemRole`/`toolCalls`/`parallelToolCalls`/`structuredJsonOutput`/
`streaming`/`reasoningEffort`/`strictMessageRoles`/`openAICompatibleShape`/`customHeaders`/
`providerSpecificQuirks`）。

**但它的消费点全部是「生成字符串」**：

- `provider/registry/provider.ts:557-559` 把 `"unsupported"` 转成 `knownLimitations` 数组元素；
- `provider/request/boundary.ts:426-430` 把值拼进一个签名串；
- `provider/request/boundary.ts:447-452` 把 `"unsupported"` 转成 `notProvenClaims` 条目。

**没有任何一处根据它改变发出去的请求。** 活轨 `turn/step.ts:102-116` 构造的 payload 是硬编码的：

```ts
const payload = {
  model: request.provider.model,
  messages: [...],
  tools: request.tools,
  tool_choice: options.allowTools ? "auto" : "none",
  stream: true,
  stream_options: { include_usage: true },
  temperature: samplingTemperature(request.workspaceRoot, request.temperature ?? 0.7),
  ...(effort ? { reasoning_effort: effort } : {}),
  ...(request.topP != null ? { top_p: request.topP } : {}),
  ...(request.maxOutputTokens != null ? { max_tokens: request.maxOutputTokens } : {}),
};
```

**对照参考实现**（`PiProvider` 逐字，`packages/ai/src/types.ts:675-743` + `openai-completions.ts`）：

| `pi` 标志 | 改变什么 | 证据 |
|---|---|---|
| `supportsDeveloperRole` | system 消息的 role 用 `developer` 还是 `system` | `openai-completions.ts:1225` |
| `supportsReasoningEffort` | `reasoning_effort` 字段发不发 | `openai-completions.ts:962-969` |
| `maxTokensField` | 上限字段名是 `max_tokens` 还是 `max_completion_tokens` | `openai-completions.ts:840-846` |
| `requiresAssistantAfterToolResult` | 在 tool 结果后的 user 消息前插一条合成 assistant 消息 | `openai-completions.ts:1228-1234` |
| `thinkingFormat` | 思考参数的**形状**（12 种：openai/openrouter/deepseek/qwen/…） | `types.ts:696-712` |

**影响**：接一个「不接受 `developer` role」或「只认 `max_completion_tokens`」的
OpenAI 兼容端点会失败，而我们的类型面**已经声明知道这件事**（`compatibility` 里有该字段），
却没有任何代码使用它。**类型说谎**——这正是本项目签名缺陷（A 类）在 provider 面的形态。

### 2.5 B-5 thinking 档位名直传，且只有 3 档

**证据（我们）**：

- `core/state/projectState.ts:35`：`export type ThinkingEffort = "low" | "medium" | "high";`
- `turn/step.ts:102,114`：`const effort = ...getThinkingEffort(...)` → `...(effort ? { reasoning_effort: effort } : {})`
- **档位名直接作为 `reasoning_effort` 的值发出**，没有按模型映射。

**对照参考实现**（`PiProvider` 逐字）：

- `packages/ai/src/types.ts:84-86`：`ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh" | "max"`（加 `"off"` 共 **7 档**）；
- `openai-completions.ts:964`：`(params as any).reasoning_effort = model.thinkingLevelMap?.[options.reasoningEffort] ?? options.reasoningEffort;`
  —— **先查模型的映射表，查不到才用档位名本身**；
- `models.ts:925-932`：`xhigh`/`max` 需要显式映射才出现，`null` 表示不支持。

**影响**：一个只认 `"high"`/`"medium"` 的端点收到 `"low"` 会被拒。
我方 `turn/step.ts:151-153` 的应对是**整个丢掉该字段重试**——即档位从「低」变成「不思考」，
而不是退到该模型支持的最低档。**这是一个静默降级。**

### 2.6 B-6 配置错误直接抛异常，整个 CLI 起不来

**证据（我们）**：`config/runtimeConfig.ts:282` 与 `:374`：

```ts
} catch (error) {
  throw new Error(
    `Failed to read runtime config at ${candidate}: ${error instanceof Error ? error.message : String(error)}`,
  );
}
```

**对照参考实现**（`PiConfig` 逐字，`settings-manager.ts:419-428`）：

```ts
private static tryLoadFromStorage(...): { settings: Settings; error: Error | null } {
    try {
        return { settings: SettingsManager.loadFromStorage(storage, scope, projectTrusted), error: null };
    } catch (error) {
        return { settings: {}, error: error as Error };
    }
}
```

配合 `settings-diagnostics.ts:4-9` 转成 `{type:"warning", message: "Invalid settings file <path>: <err>"}`。

**影响**：一个手写错的 `config.json`（多一个逗号）会让产品**完全无法启动**，
而项目里已有「降级而非失败」的先例（`catalogStore` 的降级策略）。

---

## 3. 类别 C：报数不来自它声称的来源

### 3.1 C-1 跨压缩的文件足迹不累积（07-* §2.4 唯一未收口项）

**证据（我们）**：

- `core/query/compaction/fileFootprint.ts:19-60` `extractFileFootprint` 用两个 `Set` 扫描
  **传入的 messages**——单次调用内是累积的，**跨压缩不是**。
- `core/query/compaction/summarize.ts:84-86`：
  ```ts
  const { rawSummary } = parseCompactedSummary(summaryContent);
  const footprintXml = formatFileFootprintXml(extractFileFootprint(request.messages));
  return formatCheckpointMessage(rawSummary, footprintXml);
  ```
  足迹是在 provider **返回摘要之后**才计算的，拼进 **checkpoint message**。
- `session/sessionEventCodec.ts:9-17` 的 `CompactionTranscriptEntry` 只有
  `summary` / `firstKeptEntryId?` / `keptMessages?` / `tokensBefore?` / `timestamp`——
  **没有文件明细**。所以第二次压缩时 `extractFileFootprint` 只能看见当前的
  `assistant.tool_calls`，上一条 checkpoint 里的是 XML 文本，**恢复不出来**。

**对照参考实现**（`phase-4-pre-research.md` §3.4 已逐字核验，本轮未重复）：
`pi` 的 `CompactionDetails { readFiles, modifiedFiles }` 存在 entry 的 `details` 里，
`extractFileOperations` 会**先读上一条 compaction 的 details** 再补当前消息；
`docs/compaction.md:206` 原文：

> This means file tracking accumulates across multiple compactions or nested branch summaries, preserving the full history of read and modified files.

**影响**：多次压缩后，早期读改过的文件会从可见列表里消失——**模型会重复读已经读过的文件**。
这是 `07-*` 中**唯一**未收口的 DEFICIENT。

### 3.2 C-2 `/export jsonl` 已收口，但导出的是「原始行」而非「可移植的 entry log」

**状态更正**：Phase 4 的 T5 已把 `asJsonl` 从「投影后重序列化」改为
**直接透出 transcript 原始行**（`core/commands/exportCommandRuntime.ts:147-149`）：

```ts
function asJsonl(events: readonly TranscriptEvent[]): string {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}
```

`02-*` §2.3 的原始缺陷（「导出的不是我们存的东西」）**已收口**。

**但仍有差距**：`TranscriptEvent` 联合（`session/sessionEventCodec.ts:52-71`）**没有 header 行、
没有 `version`**。参考实现（`PiSession` 逐字，`docs/session-format.md:55-63`）：

```json
{"type":"session","version":3,"id":"uuid","timestamp":"2024-12-03T14:00:00.000Z","cwd":"/path/to/project"}
```

**影响**：下游工具拿到我们的 JSONL 时**无法判断格式版本**。这不影响我们自己的读取
（`decodeTranscriptLineSafe` 按行解析），但影响「导出一份给别人」这个用途。

**成本判断**：极低——写一行 header 即可。但**必须同时决定**：读取端遇到 header 行要跳过，
且旧文件没有 header 也要能读。这是一个**契约变更**，需要裁决。

### 3.3 C-3 `CatalogModel` 无 `promptCache`，cache 保活无从判断

**证据（我们）**：§2.3 已述——`CatalogModel` 只有 `id`/`contextWindow`/`cost`。

**对照参考实现**（`PiProvider` 逐字，`types.ts` + `cache-warmer.ts:40-46`）：

```ts
export function getPromptCacheTtlMs(model: Model<Api>, options: SimpleStreamOptions | undefined): number | undefined {
	const retention =
		options?.cacheRetention ??
		(getProviderEnvValue("PI_CACHE_RETENTION", options?.env) === "long" ? "long" : "short");
	if (retention === "none") return undefined;
	const seconds = model.promptCache?.[retention];
	return seconds === undefined ? undefined : seconds * 1000;
}
```

**我们不做 cache 保活**（`phase-4-pre-research.md` §6 已列为「不做」，理由是依赖 `promptCache` 寿命字段）。
**本轮维持该判定**——保活会**主动发请求花钱**，且其收益取决于继续对话的概率，
是一个需要真实账单数据才能验证的优化。**记录但不提议。**

---

## 4. 类别 D：能力已在代码里但未接线

### 4.1 D-1 `CatalogModel` 扩展（§2.3/§2.4/§2.5 共同的前置）

§2.3（字段太少）、§2.4（compat 不生效）、§2.5（thinking 无映射）**共享同一个前置**：
模型目录必须能表达「这个模型怎么说话」。这不是三件事，是**一处结构扩展**。

**`pi` 的对应物是一个 16 字段的 `Model` 接口**（`PiProvider` 逐字）。逐项取舍见 §2.3 的表。

### 4.2 D-2 主题令牌有 14 个零消费

**证据（实测，本轮复核）**：`presentation/theme/theme.ts:12-50` 的 `ThemeColorToken` 联合
有 **39** 个成员。对每个成员在 `src/**/*.ts`（排除测试与主题基础设施）中检索**任意出现**：

```
union: 39 | 零出现: 14
DEAD: assistantText, borderMuted, selectedBg, syntaxComment, syntaxFunction,
      syntaxKeyword, syntaxNumber, syntaxString, syntaxVariable, thinkingText,
      toolErrorBg, toolPendingBg, toolSuccessBg, userMessageText
```

**注意一处与我方既有记录的差异**：`phase-4-execution.md` §15.3 记「21/39 被真正读取，
18 个是死配置」。本轮实测为 **25 个被读取、14 个零出现**。差异原因是计数口径——
§15.3 数的是「被 `fg`/`bg`/`bgOpen` 直接调用」，本轮数的是「在源码中任意出现」，
而 `diffAdded`/`diffRemoved`/`diffContext`/`command*` 这些是通过**变量传递**进
`fg()` 的（`presentation/tui/transcript/diff.ts:78,87` 的 `token` 参数、
`presentation/theme/commandHighlight.ts:68`）。**两个数字都对，度量的是不同的东西**；
本轮的 14 才是「删掉不会有任何渲染变化」的那个数。

**处置判断**：`phase-4-execution.md` §15.3 已裁定「不删，因为删令牌会让用户主题文件里已有的名字失效」。
**本轮维持**——但要把这 14 个明确登记，避免下一个读者重新数一遍。

### 4.3 D-3 `firstKeptEntryId` 仍无生产者

**证据（我们）**：`session/sessionEventCodec.ts:15` 声明该字段；
`session/transcript/sessionTranscript.ts:150` 会写入它；
但**唯一调用方** `session/lifecycle/sessionLifecycleWrites.ts:248` 不传该字段。
`session/schema/sessionThread.ts:47` 的 `firstRetainedEntryId` 同样无写入者。

**Phase 4 已判定**（`phase-4-execution.md` §10）：「该字段活轨无人读；压缩切点仍用 `keptMessages` 计数」。
**本轮维持该判定**，但注意：`pi` 的 `compaction.ts:762-790` **用它**做重复压缩的边界
（`docs/compaction.md`：「On repeated compactions, the summarized span starts at the previous
compaction's kept boundary (`firstKeptEntryId`)」）。我方 Phase 2 用了**另一条路**
（从上下文自身识别 `[Context Checkpoint]` 并修订）达到同一意图。
**两条路都成立**，我方那条不依赖 entry id，因此不需要该字段。**登记为「有意保留但不用」。**

---

## 5. 类别 E：参考实现有而我们没有

按 `phase-4-pre-research.md` §6 的取舍继续筛，**只列成本低且有明确用途的**。

| # | 缺口 | `pi` 证据（逐字） | 成本 | 本轮是否提议 |
|---|---|---|---|---|
| E-1 | **崩溃日志** | `crash-log.ts:6-15` `CrashRecord{timestamp,version,kind,message,stack,sessionFile,cwd}`；`:17-22` `MAX_CRASH_RECORDS = 5`；`interactive-mode.ts:4266-4268` `process.prependListener("uncaughtException", …)` | 低 | ✅ |
| E-2 | **启动分段计时** | `timings.ts:6` `const ENABLED = process.env.PI_TIMING === "1";`；`main.ts:646-778` 六个检查点 | 低（~30 行） | ✅ |
| E-3 | **多段编辑** | `edit.ts:22-38` 的 `edits[]` 数组 + `edit-diff.ts:340-349` 的重叠拒绝（`previous.matchIndex + previous.matchLength > current.matchIndex` 则报错） | 中 | ✅ |
| E-4 | **`find` 工具** | `find.ts:23-33` 的 schema（`pattern`/`path`/`limit` 默认 1000）；`:63` 「Respects .gitignore」 | 低（复用 `fileWalk`） | ✅ |
| E-5 | **转录内搜索** | `keybindings.md:112-115` `ctrl+shift+f`；`alt-screen-search.ts:114-118` 转义后的**大小写不敏感子串**搜索 + 前后跳转 | 中高 | ⚠️ 见下 |
| E-6 | **图片粘贴** | `keybindings.md:128` `ctrl+v`；`interactive-mode.ts:3050-3057` 存临时文件 + 插入路径；`settings.md:93-94` `images.autoResize`/`images.blockImages` | 高 | ❌ 见下 |
| E-7 | **`ls` 工具** | `ls.ts:11-21` schema（`path`/`limit` 默认 500）；`:60` 「sorted alphabetically, with '/' suffix for directories」 | 低 | ⚠️ 见下 |
| E-8 | **`powershell` 工具** | `powershell.ts:14,25-30` UTF-8 前缀 + `-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command`；`shell.ts:112-124` 仅 `win32` | 低 | ❌ 见下 |

**E-5 不做**：`viewport.ts` 的屏幕行↔内容行映射需扩展，成本中高；
`phase-4-pre-research.md` §6 已判「收益低于 T5/T8」，本轮维持。

**E-6 不做**：`SessionMessage.content: string` 是字符串，图片需要类型迁移
（`phase-4-pre-research.md` §6 已判「独立立项」）。**且 `CatalogModel` 连 `input: ("text"|"image")[]`
都没有**（§2.3），无法判断模型是否支持图片。**D-1 是它的前置。**

**E-7 不做（但要更正一条记录）**：`05-*` 的覆盖清单写「`ls` ⚠️ 部分实现：目录列举已折进 `read`」。
本轮实测**成立且比记录更完整**：`core/tools/registry.ts:239` 的描述逐字含
「Reading a directory path lists its direct contents instead, one level deep」，
且 `:249-253` 的 `offset`/`limit` 对目录读也生效（「entry number when reading a directory」，
默认 500，max 1000）——**与 `pi` 的 `ls` 默认 500 一致**。
即 `ls` 的能力**已经在 `read` 里**，不需要独立工具。**更正 05-* 的判定为「平手」。**

**E-8 不做**：`/shell use powershell` 已能切换后端（`core/commands/shellCommandRuntime.ts:24`），
独立工具是 `pi` 的组织方式，我方用后端切换达到同一目的。
`05-*` 已记为 DEFICIENT，**本轮更正为「平手」**——差别是形态而非能力。

---

## 6. 未完成的勘察与如实记录

| 项 | 状态 |
|---|---|
| `PiRetry`（首次派发） | **子代理失败**（上游 `content_filter`）；已重派 `PiRetry2` 并**完成**。§2.1 的 pi 侧证据来自 `PiRetry2`（实现层）与 `PiConfig`/`PiConfig2`（设置层） |
| `pi` 实机 | 无法运行（`node_modules` 不存在）。所有 pi 侧结论来自**源码与文档** |
| 我方全量测试 | 本轮**未运行**（零代码改动） |
| 死代码删除的六项检查 | **未对 §1.2 的 32 个候选逐个执行**——裁决通过后按 `plan.md` §2.2 逐项做 |
| `pi` 的错误分类**完整清单** | `PiRetry2` 给出两组正则的**代表性条目**，未逐条穷举全部模式；裁决不依赖穷举（见 §2.1） |

---

## 7. 候选任务汇总

| 任务 | 类别 | 性质 | 证据强度 | 成本 | 风险 |
|---|---|---|---|---|---|
| **T1** 重试与错误分类 | B | 修缺陷（可观测失效） | **强**（我方链路逐行 + pi 两层实现逐字） | 中 | 中（触及失败路径） |
| **T2** 死投影族清理 | A | 删除 | **强**（32 文件逐个列 importer + 指名活轨承担者） | 中 | 中（8,330 行） |
| **T3** 模型目录扩展与请求整形 | B/D | 修缺陷 + 接线 | 强（两侧逐字） | 中高 | 中（触及请求构造） |
| **T4** 配置降级与诊断 | B | 修缺陷 | 强（两侧逐字） | 低 | 低 |
| **T5** 消息投递模式接线 | D | 接线 | 强（内核已实现） | 极低 | 低 |
| **T6** 压缩文件足迹跨压缩累积 | C | 修缺陷 | 强（我方逐行 + pi 逐字） | 低 | 低 |
| **T7** 崩溃日志与启动计时 | E | 补能力 | 强（pi 逐字） | 低 | 低 |
| **T8** 多段编辑与 `find` 工具 | E | 补能力 | 强（pi 逐字） | 中 | 低 |

### 7.1 建议顺序

$$\text{T2} \to \text{T1} \to \text{T5} \to \text{T4} \to \text{T6} \to \text{T3} \to \text{T7} \to \text{T8}$$

**理由**：

1. **T2 先做**：它删掉的是**下一批任务要碰的那些文件的邻居**。`provider/request|response` 全族
   （8 文件 / 2,995 行）与 T1 要改的 `turn/step.ts` 是同一个链路的两个位置——**先删掉不用的那一套，
   再改在用的那一套**，否则 T1 会在两套实现之间做选择。与 Phase 4 把 T1 排第一的理由同型。
2. **T1 次之**：唯一的「每天都会踩到」的新缺陷（429/502 直接杀死回合）。
   排在 T2 之后是因为它触及失败路径，而这些路径现在有一部分在待删文件里。
3. **T5 第三**：**成本极低**（两跳接线 + 两个配置字段），且是 B 类缺陷里唯一「内核已经跑起来」的。
4. **T4 第四**：配置降级是低风险改动，但**它改变了「配置坏了会发生什么」**，
   应在 T3 之前做——否则 T3 新增的模型目录字段在配置写错时会一起抛异常。
5. **T6 第五**：`07-*` 唯一未收口项，改动面封闭（entry 加字段 + 提取时合并上一条）。
6. **T3 第六**：唯一需要**决定接口形状**的任务（`CatalogModel` 加哪些字段）。
   放在后面，因为前五项会把「哪些字段真的被需要」验证清楚。
7. **T7 第七**：纯新增，零风险，可与 T8 互换。
8. **T8 最后**：`edits[]` 会改变 `edit` 工具的**契约**（从单段到多段），
   需要更新既有调用点与测试。

**每个任务的施工纪律**（沿用 `plan.md` §2.4 与 `agent-rules/testing-and-validation.md`）：
先写会失败的回归测试 → 施工 → 反向验证（移除改动后测试必须失败）→ 实机验证 → 全量门禁。

---

## 8. 本轮明确**不做**

| 项 | 理由 |
|---|---|
| **cache 保活（warming）** | 主动发请求花钱，收益取决于继续对话的概率，需真实账单数据验证。§3.3 |
| **传输选择（SSE/WebSocket）** | `pi` 自己也标注为实验；我方只有一个传输，加选择器无收益 |
| **订阅式 OAuth 扩展** | 需真实 provider 凭据流，**无法在隔离环境验证**（Phase 3/4 已两次以此理由移出） |
| **stdin/stdout RPC 协议** | 需定义 framing + 审批远程应答，是**新契约设计** |
| **programmatic SDK** | 依赖 RPC 契约先定 |
| **HTML 导出 / 会话分享** | 需先定隐私边界与去向，属产品决策 |
| **图片输入** | 需 `SessionMessage.content` 类型迁移；**D-1（模型目录）是它的前置** |
| **Mermaid 渲染** | 需引入新依赖；我方依赖面只有 5 个，不应为此破例 |
| **`ls` 独立工具** | **更正为平手**——能力已在 `read` 的目录分支里（§5 E-7） |
| **`powershell` 独立工具** | **更正为平手**——`/shell use powershell` 已覆盖（§5 E-8） |
| **树形可视化导航（`/tree`）** | `phase-4-execution.md` §13.6 已记为未做；`pi` 的组件 1435 行，收益与成本不匹配 |
| **`OURS-ONLY` 各项** | 维护者指示暂缓 |

---

## 9. 核验记录

| 结论 | 核验方式 |
|---|---|
| 160 个生产文件 CLI 不可达 | `python3 scripts/analyze-boundaries.py`（仓库脚本，非自写正则） |
| 32 个删除候选「无活消费者」 | 用 `--list` 的逐文件标记：非活、有非测试 importer、且 importer 全部非活。实测 **0 个活 importer 指向候选集** |
| 闭包 6 文件只被候选集引用 | 同上脚本对每个闭包成员列出 importer，全部落在候选集内。**复核更正**：初版把闭包算成 10 文件且方向错，见 §1.2 的更正说明 |
| `tools/dispatch/` 生产 importer 为 0 | 全仓 `grep -rn "tools/dispatch\|dispatch/executor"` 排除测试 → 仅 `toolBatchDispatch.ts` 自己 |
| `turn/*Queue` / `nextTurnBundle` / `deliveryPolicy` 生产 importer | 逐个 grep，见 §1.2 表 |
| 活轨工具批执行是 `executeToolBatch` | `core/agent/loop.ts:4` 导入、`:164` 调用；`core/agent/tools.ts:184` 定义 |
| 活轨文件锁是 `withFileLock` | `runtime/execution/fileLock.ts:85`；消费点 `core/tools/registry.ts:402,483` |
| `turn/step.ts` 失败路径无重试 | 读 `:142-145`、`:146-154`、`:173-176` 三处失败分支。**复核更正**：初版把两处 catch 合并引用且引错一处文本 |
| `retryEligibility` 在不可达模块 | `provider/request/invocation.ts:37-39,328-334`；该模块生产 importer 0 |
| `steeringMode`/`followUpMode` 无调用点 | 全仓 grep → 仅 `agent.ts` 自身 4 处 + `agent.test.ts:388` |
| `AgentCore` 构造处不传模式 | 读 `turn/session.ts:112-130` 的完整对象字面量 |
| compat 标志不改变请求 | 读全部消费点（`provider.ts:557-559`、`boundary.ts:426-430,447-452`），无一处影响 payload；对照活轨 `turn/step.ts:103-116` 的硬编码 payload。**复核者 `RvProvider` 独立穷举确认零发现** |
| thinking 只有 3 档且直传 | `core/state/projectState.ts:35`；`turn/step.ts:114` |
| 配置错误抛异常 | `config/runtimeConfig.ts:282,374` |
| 文件足迹不跨压缩累积 | 读 `fileFootprint.ts:19-60`（只看传入 messages）+ `summarize.ts:84-86`（摘要后才算）+ `sessionEventCodec.ts:9-17`（无文件明细） |
| `/export jsonl` 已透出原始行 | 读 `exportCommandRuntime.ts:147-149` |
| transcript 无 header/version | 读 `sessionEventCodec.ts:52-71` 的联合 |
| 主题令牌 14 个零出现 | `python3` 对 39 个成员逐个在 `src/**/*.ts`（排除测试与主题基础设施）检索任意出现 |
| `ls` 能力已在 `read` 里 | 读 `core/tools/registry.ts:239,249-253` |
| `powershell` 经 `/shell use` 可达 | `core/commands/shellCommandRuntime.ts:24` 的 `validBackends` |

**子代理断言中被证伪或更正的部分**：本轮无——八个子代理的报告均为纯证据收集
（禁止给推荐），且其引用的 `file:line` 由主代理抽查复核。**唯一未完成的勘察是 `PiRetry`**
（上游 `content_filter` 失败），重派 `PiRetry2` 后已完成，见 §6。

**独立复核推翻的主代理错误**（5 项，全部已修正，详见 `phase-5-decisions.md` §11）：

| # | 主代理原判 | 实际 | 发现者 |
|---|---|---|---|
| 1 | T2 闭包 10 文件（`context/acquisition/{engine,projection}`、`planning/runtime/*` 等） | 这 10 个**有候选集之外的引用者**，不属本批 | `RvDeadCode` |
| 2 | T2 共 36 文件 / 10,008 行 | **32 文件 / 8,330 行**（漏了 6 个会悬空的类型导入者） | `RvDeadCode` |
| 3 | `index.ts` 只从 `provider/request/packet.ts` 导出 | 实际 **10 个模块** | `RvDeadCode` |
| 4 | `withFileLock` 覆盖 `read`/`write`/`edit` | 实际只覆盖 `write`/`edit`（`read` 不取锁） | `RvDeadCode` |
| 5 | §7.1 的 `provider/request\|response` 族 3,102 行 | **2,995 行**（3,102 是含被保留文件的整目录数） | `RvSweep2` |

**共同模式**：**闭包方向算错**（1、2）与**未读全文就写覆盖面**（3、4）——
与 `plan.md` §5 记录的「间接证据替代直接证据」同源。这已是第六次出现，
因此 `phase-5-decisions.md` §0.2 新增了「可达性数字一律以仓库脚本为准」的纪律。
