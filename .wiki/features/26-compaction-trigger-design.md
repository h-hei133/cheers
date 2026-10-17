---
title: "压缩触发：单点阈值与参考的多机制非刚性设计"
category: article
sources: [repo-audit-2026-10-15, packages/ts-shell/src/session/compaction.ts, packages/ts-shell/src/session/context.ts, packages/ts-shell/src/turn/session.ts, packages/ts-shell/src/core/agent/loop.ts, codex/codex-rs/protocol/src/openai_models.rs, codex/codex-rs/core/src/session/context_window.rs, codex/codex-rs/core/src/session/turn.rs, codex/codex-rs/core/src/session/token_budget.rs, oh-my-pi/packages/coding-agent/src/config/compaction-threshold.ts, oh-my-pi/packages/coding-agent/src/session/model-compaction-threshold.ts, 07-context-management-and-compaction.md]
created: 2026-10-15
updated: 2026-10-17
tags: [features, compaction, context, gap-analysis]
summary: "Cheers 的阈值随窗口变化，固定的是默认 reserve 8000；同一 turn 的后续 step 前已有自动压缩，缺口在首个请求前的检查、请求预算、计量身份与重复压缩控制。Codex 的 BodyAfterPrefix 只改变软计量域，不减少实际上下文；参考的比例、缓冲和提醒必须受完整请求硬预算约束。"
confidence: high
---

# 压缩触发：单点阈值与参考的多机制非刚性设计

源码基线 `0d30d589`；参考快照 codex `4210c08d`、oh-my-pi `c2cb79e4`。2026-10-17 仅复核源码并修订研究，没有新运行时实验或产品实现。oh-my-pi 当前 HEAD 已为 `eb74cf84`；本文关键参考断言用 `git show c2cb79e4:<path>` 核对旧快照，不能把新 HEAD 当成旧证据。

## 1. Cheers 当前触发（实测）

`shouldCompact`（[compaction.ts:125-135](../../packages/ts-shell/src/session/compaction.ts#L125)）：

```ts
export function shouldCompact(tokens, contextWindow, reserveTokens, enabled = true): boolean {
  if (!enabled) return false;
  return tokens > contextWindow - reserveTokens;
}
```

默认常量：

- `DEFAULT_RESERVE_TOKENS = 8000`（[context.ts:5](../../packages/ts-shell/src/session/context.ts#L5)）
- `KEEP_RECENT_TOKENS = 20_000`（[compaction.ts:7](../../packages/ts-shell/src/session/compaction.ts#L7)）
- `CHARS_PER_TOKEN = 3.5`（[context.ts:3](../../packages/ts-shell/src/session/context.ts#L3)）

按历史观测的 window 64,000 换算，触发点是 **大于 56,000 tokens**；等于 56,000 不触发。固定的是默认 reserve，阈值 `window - reserve` 随窗口变化：200,000 窗口对应 192,000。不能把它描述成与窗口无关的固定触发点。CLI 已按模型解析窗口与 `provider/model` 的 reserve/keepRecent 覆盖（[compaction.ts:88-126](../../packages/ts-shell/src/cli/runtime/compaction.ts#L88)）。

### 1.1 触发时机

- **计划路径**：`createCompactionStep`（[compaction.ts:635-682](../../packages/ts-shell/src/session/compaction.ts#L635)）作为 `prepareNextStep` 回调。`driveLoop` 在 `completedStep` 已存在、仍有后续工具或排队消息时调用它（[loop.ts:243-264](../../packages/ts-shell/src/core/agent/loop.ts#L243)），因此**同一 turn 内的 mid-turn 检查已经存在**。首次 step 尚无 `completedStep`，新用户消息、恢复的大历史、模型缩窗等在首个请求前没有经过这一回调。
- **救援路径**：`recoverOverflow`（[turn/session.ts:379-430](../../packages/ts-shell/src/turn/session.ts#L379)）在 provider 因超长拒绝后，以 `force: true` 绕过阈值压缩并重试。
- **压缩不在工具批次中途插入**：这保留 tool-call/result 配对；取消、权限失效、执行失败仍可能终止批次，不能承诺已开始的批次必然成功跑完。

### 1.2 token 计量

`planCompaction` 优先用 provider 实测值，回退到字符估算（[compaction.ts:343-346](../../packages/ts-shell/src/session/compaction.ts#L343)）：

```ts
const tokensBefore = policy.measureContextTokens?.(messages) ?? estimateRequestTokens(messages, policy.overhead);
```

`estimateRequestTokens` 把 system prompt 与 tool schema 作为 overhead 计入（[context.ts:63-84](../../packages/ts-shell/src/session/context.ts#L63)）。冷启动历史样本的核心工具 overhead 为 16,279 字符 ≈ 4,652 估算 tokens（详见 [28](28-context-display-and-startup-budget.md)），不是所有配置的固定值。

CLI 的实际测量回调是 `lastPromptTokens + estimateTokens(messages.slice(lastPromptMessageCount))`（[runtime/compaction.ts:120-126](../../packages/ts-shell/src/cli/runtime/compaction.ts#L120)），并非只用上次 prompt 原值。计费层先把 OpenAI inclusive cache 与 Anthropic exclusive cache 归一化为互斥分类（[usage.ts:10-23](../../packages/ts-shell/src/provider/response/usage.ts#L10)），telemetry 再把 prompt/cache-read/cache-write 相加为完整输入量（[usageTelemetry.ts:146-178](../../packages/ts-shell/src/observability/usageTelemetry.ts#L146)）。不能把已包含 cache 的原始 `prompt_tokens` 再加一次。

仍需补核并修复的生产缺口是计量与当前请求的对应关系：`step.ts:539` 保存 `messages.length + 1`，但 `lastPromptTokens` 仅表示输入，后续 slice 会跳过新 assistant 消息；长回答或 tool-call arguments 不应漏出下一次预算。跨模型、schema/system prompt 变化、恢复或上下文替换后也不能沿用旧量的身份。当前自动压缩落盘会调用 `markContextUnknown`（[cliSessionRuntimeFactory.ts:380-383](../../packages/ts-shell/src/cli/runtime/cliSessionRuntimeFactory.ts#L380)），这一失效语义应保留。

## 2. codex 的多机制设计

### 2.1 上限推导：9/10 窗口，可被配置收紧

[openai_models.rs:499-510](https://github.com/openai/codex/blob/4210c08defe92fe8828f789b6f9fda287ad3709e/codex-rs/protocol/src/openai_models.rs#L499)：

```rust
pub fn auto_compact_token_limit(&self) -> Option<i64> {
    let context_limit = self.resolved_context_window().map(|w| (w * 9) / 10);
    let config_limit = self.auto_compact_token_limit;
    if let Some(context_limit) = context_limit {
        return Some(config_limit.map_or(context_limit, |limit| std::cmp::min(limit, context_limit)));
    }
    config_limit
}
```

要点：此 `ModelInfo` 方法以 **窗口 × 9/10** 为上限，配置只能收紧；这不是整个系统所有 scope 的统一覆盖规则——下节 `BodyAfterPrefix` 的 config 优先路径另行取值。两边阈值都会随窗口变化，差别是比例留白与绝对 reserve。

### 2.2 两种计量域

[context_window.rs:60-78](https://github.com/openai/codex/blob/4210c08defe92fe8828f789b6f9fda287ad3709e/codex-rs/core/src/session/context_window.rs#L60)：

```rust
let (auto_compact_scope_tokens, auto_compact_scope_limit, auto_compact_window_prefill_tokens) =
    match config.model_auto_compact_token_limit_scope {
        AutoCompactTokenLimitScope::Total => (active_context_tokens, model_info.auto_compact_token_limit(), None),
        AutoCompactTokenLimitScope::BodyAfterPrefix => {
            let window = sess.auto_compact_window_snapshot().await;
            let baseline = window.prefill_input_tokens.unwrap_or(active_context_tokens);
            let scope_limit = config.model_auto_compact_token_limit
                .or_else(|| model_info.auto_compact_token_limit());
            (active_context_tokens.saturating_sub(baseline), scope_limit, window.prefill_input_tokens)
        }
    };
```

`BodyAfterPrefix` 以本压缩窗口的 prefill 为基线，计量其后的增长；该基线不等于仅 system prompt/tool schema，恢复时也可由已有 history 与 base instructions 估算（参考 `session/mod.rs:1552-1582`）。它**没有减少实际发送量或扩充模型窗口**，也不是 schema 装载优化的替代品；只有同时保留完整上下文硬闸才可使用。

### 2.3 缓冲上限与硬窗口双闸

[context_window.rs:92-107](https://github.com/openai/codex/blob/4210c08defe92fe8828f789b6f9fda287ad3709e/codex-rs/core/src/session/context_window.rs#L92)：

```rust
let auto_compact_fallback_buffer_tokens = config.token_budget.as_ref()
    .map_or(0, crate::config::TokenBudgetConfig::fallback_buffer_tokens);
let buffered_auto_compact_limit = auto_compact_scope_limit
    .map(|limit| limit.saturating_add(auto_compact_fallback_buffer_tokens));

let full_context_window_limit_reached =
    full_context_window_limit.is_some_and(|limit| active_context_tokens >= limit);
let token_limit_reached = buffered_auto_compact_limit
    .is_some_and(|limit| auto_compact_scope_tokens >= limit) || full_context_window_limit_reached;
```

即：达到**软阈值 + 缓冲**或完整有效窗口任一界限即触发。完整窗口还乘以 `effective_context_window_percent`（同文件 82-84 行）。这提供第二道检查，但不能单凭此式保证下一次请求不会溢出：检查粒度、待加入的消息、工具返回体与输出上限仍须纳入请求预算。

### 2.4 软提醒（压缩前的预警带）

[token_budget.rs:70-105](https://github.com/openai/codex/blob/4210c08defe92fe8828f789b6f9fda287ad3709e/codex-rs/core/src/session/token_budget.rs#L70)：当 `base_window_tokens_remaining <= reminder_threshold_tokens` 时注入 `TokenBudgetReminder`（模板来自模型自身默认），让模型**自己开始收敛**；仅在剩余为 0 时才注入 `auto_compact_fallback_prompt`。这是「不打断模型操作」的直接机制。

### 2.5 两阶段检查

| 阶段 | 位置 | 理由枚举 |
|---|---|---|
| Pre-turn | [turn.rs:1043-1062](https://github.com/openai/codex/blob/4210c08defe92fe8828f789b6f9fda287ad3709e/codex-rs/core/src/session/turn.rs#L1043) `run_pre_sampling_compact` | `ContextLimit` |
| Mid-turn | [turn.rs:458-485](https://github.com/openai/codex/blob/4210c08defe92fe8828f789b6f9fda287ad3709e/codex-rs/core/src/session/turn.rs#L458) `should_roll_over` | `ContextLimit` |
| 模型降级 | [turn.rs:1150-1187](https://github.com/openai/codex/blob/4210c08defe92fe8828f789b6f9fda287ad3709e/codex-rs/core/src/session/turn.rs#L1150) | `ModelDownshift` |
| 压缩哈希变化 | [turn.rs:1130-1140](https://github.com/openai/codex/blob/4210c08defe92fe8828f789b6f9fda287ad3709e/codex-rs/core/src/session/turn.rs#L1130) | `CompHashChanged` |

mid-turn 检查的条件是 `needs_follow_up && (new_context_window_requested || token_limit_reached)`。Cheers 已有同类 step 边界检查；应借鉴的是首个 sampling 前检查、模型降窗与上下文兼容性处理，不能再建一套重复 mid-turn owner。

## 3. oh-my-pi 的阈值模型

**（2026-10-15 更正）** 本文初稿称 omp 的 `resolveThresholdTokens` 源码「不在本仓」。**该判断错误**——源码在 `packages/agent/src/compaction/compaction.ts`（该包名在仓库中是 `@oh-my-pi/pi-agent-core` 的目录 `packages/agent`）。以下为实际实现。

### 3.1 最终比较式

（[compaction.ts:350-354](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/agent/src/compaction/compaction.ts#L350)）

```ts
export function shouldCompact(contextTokens: number, contextWindow: number, settings: CompactionSettings): boolean {
	if (!settings.enabled || settings.strategy === "off" || contextWindow <= 0) return false;
	const thresholdTokens = resolveThresholdTokens(contextWindow, settings);
	return contextTokens > thresholdTokens;
}
```

与 Cheers 形式相同（`tokens > threshold`），差别全在 `resolveThresholdTokens` 与喂入的 `contextTokens`。

### 3.2 阈值解析：固定值优先，其次百分比，最后回退到 prompt 预算

（[compaction.ts:384-417](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/agent/src/compaction/compaction.ts#L384)）

```ts
export function resolveThresholdTokens(contextWindow: number, settings: CompactionSettings): number {
	// Fixed token limit takes priority over percentage, and is checked against
	// the real window: `baseWindowTokens` only rescales the policies below.
	const thresholdTokens = settings.thresholdTokens;
	if (typeof thresholdTokens === "number" && Number.isFinite(thresholdTokens) && thresholdTokens > 0) {
		if (thresholdTokens >= contextWindow) return promptBudgetTokens(contextWindow, settings);
		return Math.min(contextWindow - 1, Math.max(1, thresholdTokens));
	}
	const baseWindowTokens = settings.baseWindowTokens;
	if (typeof baseWindowTokens === "number" && Number.isFinite(baseWindowTokens) && baseWindowTokens > 0) {
		contextWindow = Math.min(contextWindow, baseWindowTokens);
	}
	const thresholdPercent = settings.thresholdPercent;
	if (typeof thresholdPercent !== "number" || !Number.isFinite(thresholdPercent) || thresholdPercent <= 0) {
		return promptBudgetTokens(contextWindow, settings);
	}
	const clampedThresholdPercent = Math.min(99, Math.max(1, thresholdPercent));
	return Math.floor(contextWindow * (clampedThresholdPercent / 100));
}
```

三条优先级：**固定 token 数 → 百分比 → prompt 预算回退**。且有两条防御：

- 固定值 ≥ 窗口时**回退**到 `promptBudgetTokens`（注释：触发点在窗口处永远来不及触发）。
- 百分比被钳到 `[1, 99]`。
- `baseWindowTokens` 只**缩小**窗口（`Math.min`），不放大。

### 3.3 触发用的 token 数：provider 值与本地估算取**较大者**

（[compaction.ts:356-373](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/agent/src/compaction/compaction.ts#L356)）

```ts
export function compactionContextTokens(providerContextTokens: number, storedConversationEstimate: number): number {
	return Math.max(Math.max(0, providerContextTokens), Math.max(0, storedConversationEstimate));
}
```

注释给出的理由（同 356-370 行）：

> The provider-reported usage is normally ground truth, but a `before_provider_request` payload transform — a compression extension (e.g. Headroom), an obfuscator, or inline snapcompact — can shrink the request below the real stored conversation. The provider then reports deflated prompt tokens, so anchoring compaction purely on that usage lets the real history grow unbounded until it overflows and native compaction can no longer run. Flooring by the agent's own estimate of the stored conversation keeps the compaction trigger honest regardless of on-wire compression.

**这是 Cheers 完全没有的机制**：Cheers 的 `planCompaction` 优先用 provider 值、否则用估算（[compaction.ts:343-346](../../packages/ts-shell/src/session/compaction.ts#L343)）——即「provider 值**替代**估算」，而 omp 是「两者取**较大**」。

### 3.4 与 Cheers 的对照（更正后）

| 维度 | Cheers | oh-my-pi |
|---|---|---|
| 比较形式 | `tokens > window - reserve` | `tokens > thresholdTokens` |
| 阈值来源 | 固定 reserve（默认 8000） | 固定值 / 百分比 / prompt 预算三选 |
| 窗口缩放 | 阈值随窗口变化，默认 reserve 为绝对值 | `baseWindowTokens` 可缩小；百分比按窗口算 |
| 触发 token 数 | provider 值**或**估算（互斥） | provider 值与估算**取较大者** |
| 越界防御 | keepRecent 已钳到可用空间；reserve/输出的联合预算仍不足 | 固定触发值 ≥ 窗口时回退 |
| 按模型/agent 覆盖 | `modelTokenBudgets`（reserve/keepRecent） | `modelThresholds` + `agentCompactionThresholdOverrides` |

## 4. 非刚性机制清单（可借鉴项）

| # | 机制 | 参考出处 | Cheers 现状 |
|---|---|---|---|
| M-01 | 用比例留白替代单一绝对reserve默认值 | codex 9/10；omp `"80%"` | 阈值已随窗口变化，默认reserve 8000 |
| M-02 | 计量域可选（总上下文 vs 前缀之后） | codex `BodyAfterPrefix` | 无 |
| M-03 | 软阈值 + 缓冲 + 硬窗口双闸 | codex `buffered_auto_compact_limit` | 单点 |
| M-04 | 压缩前软提醒（提示模型自行收敛） | codex `reminder_threshold_tokens` + guidance | 无 |
| M-05 | 首个 sampling 前 + 后续 step 的统一检查 | codex pre-turn/`should_roll_over` | 后续 step 已有；首次 step 缺口 |
| M-06 | 按模型/按 agent 的阈值覆盖 | omp `modelThresholds`、`agentCompactionThresholdOverrides` | `modelTokenBudgets` 已有，粒度更粗 |
| M-07 | 触发点在 UI 上可预览 | omp `previewModelCompactionPoint` | 无 |
| M-08 | **触发 token 数取「provider 值」与「本地估算」的较大者**，防止线上压缩让历史无界增长 | omp `compactionContextTokens`（§3.3） | 无（Cheers 是互斥替代） |
| M-09 | 固定阈值越界时回退到 prompt 预算（而非钳位） | omp `resolveThresholdTokens`（§3.2） | 无 |

注：M-06 的 `modelTokenBudgets`（[fields.ts:48](../../packages/ts-shell/src/config/fields.ts#L48)）已支持 `provider/model → {reserveTokens, keepRecentTokens}`，是既有基础。

**M-08 的适用边界**：omp 为存储历史与线上 payload 变换分离的场景增加本地估算下限，并明确只用于压缩触发、显示和费用仍取 provider 量。Cheers 尚未确认存在同样的请求变换路径，不能据此宣称已复现相同故障。应分别记录当前 wire 请求估算、stored-history 估算及同身份的 provider 测量；若采用 `max` 作为保守触发，必须处理估算偏高造成的反复压缩，且不得把该最大值冒充 provider 实测。

## 5. 待定决策点

| # | 决策 | 选项 |
|---|---|---|
| K-01 | 比例阈值与现有 reserve 覆盖 | 技术建议：保留显式覆盖，统一解析软触发与硬预算；比例仅是软策略 |
| K-02 | 缓冲带 | 技术建议：先补硬预算；buffer 不得扩大可提交预算 |
| K-03 | 软提醒 | 技术建议：可作为有界提示，不能代替硬闸或制造新的请求循环 |
| K-04 | 检查时机 | 技术建议：复用现有 mid-turn owner，补首次请求前检查与模型缩窗 |
| K-05 | 计量域 | 技术建议：默认总量；BodyAfterPrefix 若加入仅影响软策略，保留完整硬闸 |
| K-06 | 默认比例取值 | 技术建议：0.9 仅作待评估起点，受输出预算/保留尾部/小窗口反例约束，尚未验证最优值 |

## 6. 未验证项

- 未实测 codex 的 reminder 注入对模型行为的影响（无 provider 访问）。
- **已解决（2026-10-15）**：oh-my-pi `resolveThresholdTokens` 的比较式已取得行号级证据，见 §3（初稿的「源码不在本仓」判断错误）。
- Cheers `modelTokenBudgets` 解析调用链已在 2026-10-17 源码复核；没有新增动态覆盖测试证据。

## 7. 生产设计约束与反例验收

这些是 Phase 20 的实现输入，不表示已实现或用户批准新默认值。

1. **一个预算 owner。** 主请求、自动/手动压缩与 overflow 救援共用模型窗口、输出上限和计量快照。完整请求 `P` 包含 system、工具 schema、历史、待提交用户/steering 消息及协议开销。协议若规定输入输出共享窗口，则发送条件为 `P + O + H <= W`；另有独立输入上限时也须满足它。`O` 是实际请求的输出上限，`H` 是明确的安全余量，不把 cache hit 当作免费上下文。窗口未知/估算不足须标记，不能称硬适配已证明。
2. **软策略从属于硬预算。** 软触发值不得高于本次可提交输入预算。明确现有 `>` 与新策略 `>=` 的兼容边界，验证 NaN/负数/零/超窗 reserve、16k 小模型、大模型、显式覆盖与缩窗。切点保持最近历史与 tool-call/result 配对；overhead 独占预算而没有合法切点时给出明确原因，不反复总结短对话。
3. **当前请求身份。** provider/model、配置 publication、system/schema 指纹、历史 revision 与测量对应消息范围一起保存；旧测量失效后回退到有标签的估算。把本次生成的 assistant 内容和工具参数加入下次预算，避免 `messages.length + 1` 漏记。验收含 cache inclusive/exclusive、usage 缺失、长回答、工具结果暴涨、模型切换与恢复。
4. **限制重复派发。** 建立非秘密logical operation identity，绑定profile/session/workspace/branch、history revision、policy、摘要角色/模型/config publication及指令/切点plan digest；history/prefix/segment/merge各用稳定step ID并连接现attempt账本。并发manual/auto同操作合并，已完成step校验后复用；dispatched/unknown step在恢复后不自动重播。合法分段可有多次真实收费，每send均计量，不承诺“同revision只收费一次”或远端恰好一次。当前would-not-shrink和每run有界overflow救援保留；无增长、摘要偏大或overhead无法缩减时不反复派发。
5. **摘要请求也必须能放下。** history summary与turn-prefix summary各有输入/输出预算、取消与费用归属；不能直接沿用主请求输出上限。旧历史超过摘要模型容量时分段/归并或明确拒绝，不盲截用户约束。提交在session锁内CAS原history/branch/owner revision；摘要失败、hook拒绝、取消或在途新增turn/换branch/改指令不替换原历史。迟到结果保留真实成本及可校验复用材料，不能覆盖新会话状态。
6. **反转验收。** 删除首请求守卫、漏加最新assistant、移除完整硬闸、错误复用测量、同operation/step重复派发或canceled summary覆盖历史时必须失败。另覆盖manual/auto竞争、第一段完成而第二段unknown后重启、摘要等待中新增turn/切branch/改instructions。仅shouldCompact单元测试不足以验收预算闭环。
