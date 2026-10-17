---
title: "上下文占用显示与冷启动预算：归因更正"
category: article
sources: [repo-audit-2026-10-15, packages/ts-shell/src/observability/usageTelemetry.ts, packages/ts-shell/src/cli/interactive/sessionFacts.ts, packages/ts-shell/src/presentation/tui/chrome/items.ts, packages/ts-shell/src/session/context.ts, packages/ts-shell/src/core/commands/contextCommandRuntime.ts, packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts, packages/ts-shell/src/turn/prompt.ts, packages/ts-shell/src/turn/tools.ts, oh-my-pi/packages/tui/src/status-line/context-usage.ts, oh-my-pi/packages/tui/src/status-line/startup.ts, oh-my-pi/packages/agent/src/types.ts, oh-my-pi/packages/coding-agent/src/tools/essential-tools.ts, oh-my-pi/packages/coding-agent/src/tools/xdev.ts, codex/codex-rs/core/src/session/context_window.rs, 16-input-slash-startup-context.md]
created: 2026-10-15
updated: 2026-10-17
tags: [features, context, tokens, tool-schema, gap-analysis]
summary: "首轮前状态栏未知；历史样本的 CLI tool schema 为约4,952估算tokens，不等于完整初始上下文。omp仅Gemini默认将描述移至prompt并剥离schema，其他provider保留schema描述；discoverable可以减量，但1.5k差异尚未复现，不能把字符删除量视为无损收益，也不能否决真实tokenizer的准确度价值。"
confidence: high
---

# 上下文占用显示与冷启动预算

源码基线 `0d30d589`；参考快照 oh-my-pi `c2cb79e4`、codex `4210c08d`。2026-10-17 仅源码复核与文档修订，没有重新捕获请求或调用 provider。oh-my-pi 当前 HEAD 为 `eb74cf84`；关键描述策略通过 `git show c2cb79e4:<path>` 回核旧版本。

## 1. 为什么启动时看不到上下文占用

### 1.1 数据流

`readStatusFacts`（[sessionFacts.ts:79-80](../../packages/ts-shell/src/cli/interactive/sessionFacts.ts#L79)）：

```ts
...(usage.lastPromptTokens !== undefined ? { contextUsed: usage.lastPromptTokens } : {}),
```

`lastPromptTokens` 在 provider 回报可用输入 usage 后写入，初始为 `undefined`；新请求被接受时清空，压缩/恢复/缺 usage 等也会使测量失效（[usageTelemetry.ts:178,242-260](../../packages/ts-shell/src/observability/usageTelemetry.ts#L178)、[step.ts:430](../../packages/ts-shell/src/turn/step.ts#L430)）。它是**上次请求的输入测量**，不是实时历史大小，也不是会话累计消耗。

`renderContext`（[items.ts:150-160](../../packages/ts-shell/src/presentation/tui/chrome/items.ts#L150)）：

```ts
if (facts.contextUsed === undefined) return defaultTheme.fg('statusLineContext', `?/${window}`);
const percent = Math.min(100, Math.round((facts.contextUsed / facts.contextWindow) * 100));
```

**结论**：启动时必然显示 `?/64k`（或 `?/200k`），直到第一轮 provider 回报。这是**设计使然**，不是 bug——但用户的问题是「为什么估算不用在这里」。

### 1.2 估算其实可算

`estimateRequestTokens`（[context.ts:78-84](../../packages/ts-shell/src/session/context.ts#L78)）可对已组装的请求给出字符估算；**不是精确 tokenizer 或 provider 实测**。`withRequestOverhead` 在 turn invocation 已获得实际 system prompt/tool pool 时附加 overhead，不能据此声称空闲 CLI 首帧已经有完整请求快照：

```ts
const compaction = withRequestOverhead(request.compaction, {
  systemPrompt: buildSystemPrompt(request.agentMode, promptContext),
  tools: toolSchemas(tools),
});
```

这一压缩策略估算没有流到状态栏。还需定义首帧估算的构造边界：最终工具池、项目指令、skills、模型/协议、恢复历史可能尚未加载；不能为显示一个数字阻塞启动或额外读取未经准入的上下文。只有 snapshot 已就绪时显示 `~` 估算，尚未就绪保留未知。

### 1.3 参考做法：明确区分「未知」与「估算」

oh-my-pi 的 prepaint 状态栏（[status-line/startup.ts:70-90](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/status-line/startup.ts#L70)）：

```ts
getContextUsage: () =>
    data.model?.contextWindow ? { tokens: 0, contextWindow: data.model.contextWindow, percent: null } : undefined,
```

该 prepaint 数据是**tokens 0、percent null** 的占位，不能解读为已测量实际输入为零，也不能仅凭 getter 断言最终渲染文本。而 `computeNonMessageTokens`（[context-usage.ts:360-372](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/status-line/context-usage.ts#L360)）具备非消息 token 估算：

```ts
const tokens =
    tokenizer.countTokens(Array.from(systemPromptParts, part => part ?? "")) +
    estimateToolSchemaTokens(tools, tokenizer, sourceRevision);
```

并且 `computeNonMessageBreakdown`（同文件 393-406）给出四类拆分：`skillsTokens`、`toolsTokens`、`systemContextTokens`、`systemPromptTokens`。

**差距**：Cheers 有等价的量（`overheadCharCount`）但只用于压缩；参考把它用于显示并分四类。

## 2. 为什么初始上下文这么大

### 2.1 实测分解

以下是历史样本的字符/JSON估算（无对话历史）；不是同一实际请求的 provider token 拆分：

| 组成 | 实测 | 来源 |
|---|---|---|
| system prompt | 1,331 字符（含 17 个工具名） | `buildSystemPrompt`（[prompt.ts:66-92](../../packages/ts-shell/src/turn/prompt.ts#L66)） |
| tool schema | 14,948 字符（核心 17 工具）/ 17,332 代码单元（CLI 20 工具） | `toolSchemas`（[tools.ts:90](../../packages/ts-shell/src/turn/tools.ts#L90)） |
| 项目指令 | **0**（无 AGENTS.md 时） | `projectInstructions` |

核心工具样本合计 16,279 字符 ÷ 3.5 = **约4,652估算tokens**。CLI 20工具 schema 则是另一工具池，不能把这两个样本混为完整首轮预算。

`/context` 报告的约4,952只是 CLI 当前20工具的 **schema估算**，没有包含完整 system/instructions/history/协议开销：

```text
Current tool schema estimate: ~4,952 tokens (20 tools)
Current tool definitions: 17,336 UTF-8 bytes, 17,332 UTF-16 code units of JSON
```

### 2.2 用户判断的更正

历史研究在 `/tmp/empty-proj`（无 AGENTS.md）下运行 `/context`，仍得到相同 schema 估算。这证明工具声明本身有固定开销，**不能反驳本项目真实请求还包含 AGENTS.md**：

```text
- Window: 64,000 tokens (assumed default)
- Current tool schema estimate: ~4,952 tokens (20 tools)
```

**结论**：tool schema 是已量化的大项；用户所见5.2k的完整归因尚需相同模型、指令、工具池与状态栏口径的请求快照。项目内 AGENTS.md、引用的规则、skills 与历史会额外贡献，不能把单一文件约4.4KB的历史值当作完整指令预算。

### 2.3 单工具开销排行（实测，字符数）

```text
  1894 edit        1690 browser     1353 lsp       1191 desktop
  1107 bash         974 read         966 task       816 ask
   741 apply_patch   717 grep         560 glob       506 web_search
   467 todo          415 taskOutput   414 web_fetch   323 write
   269 taskStop
```

`edit` + `browser` + `lsp` + `desktop` 四项就占 6,128 字符（41%）。其中 `desktop`、`browser` 是大多数会话不会用到的能力。

### 2.4 参考做法：把 schema 移出请求

oh-my-pi 的 `ToolLoadMode`（[packages/agent/src/types.ts:1042-1050](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/agent/src/types.ts#L1042)）：

> `"essential"` tools are exposed as normal top-level tools. `"discoverable"` tools are removed from the top-level schema and either mounted under `xd://` device URLs … or surfaced through BM25 tool search — **keeping their schemas off every request**.

实测各工具声明：

| 模式 | 数量 |
|---|---|
| `essential` | 13（`read`、`write`、`bash`、`edit`、`glob`、`find`、`eval`、`task`、`wait`、`learn`、`manage_skill`、`context_notes`、`new_context`） |
| `discoverable` | 15（`ask`、`ast_edit`、`ast_grep`、`checkpoint`×2、`debug`、`gh`、`grep`、`ida`、`memory_*`×4、`security_scan`、`todo`） |

`discoverable` 标记不是最终 wire 集合：还要经过 enabled/allowed、xdev设置与钉顶规则。`XDEV_KEEP_TOP_LEVEL`（[xdev.ts:57-62](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/tools/xdev.ts#L57)）把 `todo`、`yield`、`ask`、`grep`、`web_search` 钉在顶层。附录列的13个可挂载工具是源码候选，不是已捕获的生产请求。

codex 的 `BodyAfterPrefix` 以压缩窗口的prefill为基线计量后续增长，并保留完整上下文硬闸（见 [26](26-compaction-trigger-design.md) §2.2）。prefill可能含历史，不等于仅schema；它不减少请求字节、费用或实际容量占用。

### 2.5 omp 的 1.5k 从哪来

用户提到 omp 初始约1.5k，该数字未在本轮复现。其 `system-prompt.md` 原始模板约14,296字符，含条件分支与变量；模板源文件长度**不等于渲染后prompt**，不能据此排除更短实际prompt，也不能唯一归因schema隐藏。应在同模型/配置下比较渲染prompt、最终wire schema、历史和显示计量域，不能靠改显示口径把真实占用「降下来」。

## 3. 差距表

| 维度 | Cheers | oh-my-pi | codex |
|---|---|---|---|
| 首轮前显示占用 | `?/window`（无估算） | prepaint 占位 + `percent: null` | 有 token status 结构，首帧显示另需取证 |
| 非消息 token 分类 | 无（只有总量估算） | 四类拆分 | 有 `auto_compact_scope_tokens` |
| 工具 schema 装载模式 | 全部顶层 | essential/discoverable | 不适用（计量域方案） |
| schema 是否进实际上下文 | 顶层声明进入请求 | 视最终wire装载模式 | 仍进完整窗口；prefill scope仅改软触发 |
| 估算 vs 实测标注 | `/context` 有说明 | 有 | 有 |

## 4. 待定决策点

| # | 决策 | 选项 |
|---|---|---|
| T-01 | 首轮前估算 | 技术建议：有当前快照显示估算，否则未知；不阻塞首帧 |
| T-02 | 估算与实测区分 | 技术建议：`~` 与文字说明；不只靠颜色，保留测量时间与身份 |
| T-03 | 分类拆分 | 技术建议：`/context` 展示同快照可归因项，未知项明示，不拿当前schema倒扣旧provider测量 |
| T-04 | schema 装载模式 | **用户已裁决（2026-10-17）**：Phase20引入动态发现，默认开启；保留原工具调用合同与权限边界 |
| T-05 | 顶层清单 | 技术建议见下方本仓ID清单；不机械照抄参考5个钉顶或18个候选，最终以任务成功率验收 |
| T-06 | 发现方式 | 技术建议：独立、有界的发现/加载入口，复用原工具权限；不把read/write变成万能执行隧道 |

## 5. 未验证项

- 未取得 omp 1.5k 的实测数值（用户口述，无本地复现环境）。
- 未测 Cheers 在真实会话中 provider 回报的 `prompt_tokens` 与本地估算的偏差。
- 未核对 CLI 20 工具与核心 17 工具的差集具体是哪 3 个（`browser`/`desktop`/`lsp` 等推测未证实）。
- `instructionBudgetBytes` 默认 32 KiB 下的最坏贡献未实测。

---

## 附：初始上下文比较：描述位置、装载与计量边界

只读研究。未修改产品源码。参考快照 oh-my-pi `c2cb79e4`（已安装版本 `omp/18.10.3`）；Cheers 基线 `0d30d589`。

### 0. 更正上一轮结论

历史研究测得「20个工具schema约4,952估算tokens」；把它扩大成「完整5.2k来自schema、与AGENTS.md无关」不成立。以下区分参考机制、字符量候选与未复现的端到端差异。

[32](32-defect-register-2026-10.md)登记了装载模式候选；本次补充按模型描述位置、最终wire集合与质量验收边界。不能把工具级/参数级描述直接判为已证明重复，也没有已验证的端到端节省数字。

### 1. 先反驳「omp 工具更少」的假设

| 项 | Cheers | oh-my-pi |
|---|---|---|
| 顶层（进入请求）工具数 | **17**（核心注册表）/ 20（CLI 工具池） | **18** |
| 注册的工具总数 | 17 | **33**（30 `BUILTIN_TOOLS` + 3 `HIDDEN_TOOLS`） |
| `loadMode: essential` | 不适用（全顶层） | 13 |
| `loadMode: discoverable` | 不适用 | 15 |

omp 顶层 18 个（实测源码推导）：

```text
essential(13): read write bash edit glob find eval task wait learn
               manage_skill context_notes new_context
keep-top(5):   todo yield ask grep web_search
```

这是源码声明的候选数量，不能代表相同用户配置下最终启用或wire集合；尤其Cheers CLI样本为20而非17。它只反驳「注册总数更少」这一笼统解释，不能据此锁定实际token差异原因。

### 2. 按模型选择描述位置，不能当作普遍减量原因

omp 提供**可选**的工具描述剥离（[wire.ts:684-697](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/ai/src/utils/schema/wire.ts#L684)），但存在函数不等于每个provider都调用：

```ts
/**
 * Strip a tool's human-readable text from its provider-bound spec: empties the
 * top-level `description` and removes nested schema `description` annotations.
 * Used when the full tool catalog is rendered into the system prompt instead, so
 * the descriptions ride the wire once (in the prompt) rather than duplicated on
 * every tool definition.
 */
export function stripToolDescriptions(tools: readonly Tool[]): Tool[] {
	return tools.map(tool => ({
		...tool,
		description: "",
		parameters: stripSchemaDescriptions(toolWireSchema(tool)),
	}));
}
```

嵌套描述的剥离是递归的，且只走 schema 关键字（[wire.ts:646-660](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/ai/src/utils/schema/wire.ts#L646)）：

```ts
function stripSchemaDescriptionsInPlace(node: unknown): void {
	if (Array.isArray(node)) { for (const child of node) stripSchemaDescriptionsInPlace(child); return; }
	if (!isRecord(node)) return;
	delete node.description;
	for (const key of STRIP_SCHEMA_VALUE_KEYS) { ... }
	for (const mapKey of STRIP_SCHEMA_MAP_KEYS) { ... }
}
```

开关是**按模型决定**的（[inline-tool-descriptors-mode.ts:14-26](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/config/inline-tool-descriptors-mode.ts#L14)）：

```ts
export function shouldInlineToolDescriptors(setting, modelId): boolean {
	switch (setting ?? "auto") {
		case "on": return true;
		case "off": return false;
		default: return modelId !== undefined && classifyModel("", modelId, { lenient: true }).class === "gemini";
	}
}
```

`auto` 下**Gemini把完整描述内联prompt并剥离schema；其他provider保留schema描述，prompt使用compact元数据**。旧快照 `sdk.ts:3835-3837,4445` 将 `pruneToolDescriptions` 绑定到 `resolveInlineToolDescriptors()`，`sdk.ts:3934-3938` 在非inline native-tools路径使用compact prompt。旧 `agent-loop.ts:1928-1944` 还以 `!ownedDialect` 限制剥离。初稿对非Gemini分支的解释相反，已在此更正。

#### 2.1 Cheers 描述字符量，不等于语义重复量

历史样本中Cheers的工具级与参数级描述字符量如下。两者职责不同，不能仅凭字段都叫`description`就判定语义重复；Cheers基础prompt主要列工具名，不存在已证明的完整工具说明双份呈现（[prompt.ts:87-105](../../packages/ts-shell/src/turn/prompt.ts#L87)）：

| 组成 | 字符 | 占比 |
|---|---|---|
| 工具级描述 | 3,790 | 25% |
| 参数 JSON（含嵌套属性描述） | 9,798 | 66% |
| 其中**嵌套属性描述** | **3,766** | **25%** |
| 全部 schema JSON | **14,948** | 100% |

删除全部嵌套描述可从此schema样本移除约25%字符（3,766字符≈1,076估算tokens @3.5）；这是**删除量**，不是已证明的无损净收益。若把说明完整移到system prompt，字节仍进入每次请求；schema执行约束未变，也不代表模型参数选择质量不变。

实证一个例子——Cheers 的 `bash.timeout` 描述（[registry.ts:496](../../packages/ts-shell/src/core/tools/registry.ts#L496)）：

> "Optional timeout in seconds. Foreground defaults to 60 seconds; the maximum is 2147483.647. Session-owned background jobs default to 300 seconds and accept 1–300 seconds; unbound legacy background callers refuse an explicit timeout."

这段历史描述含默认期限和两条不同执行合同，适合研究更简洁的表达；若简单删除会丢失模型所需约束。放到prompt「说一次」仍随每次完整请求发送，只有原先确有双份语义时才产生去重收益。

### 3. discoverable 可减少顶层schema，实际收益待测

`tools.xdev` **默认为 true**（[tools/settings.ts:912-923](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/tools/settings.ts#L912)）：

```ts
export const cfgToolsXdev = register({
	id: "tools.xdev",
	type: "boolean",
	default: true,
	ui: { ... description: "Mount rarely-used (discoverable) tools under xd:// device URLs driven via read/write instead of shipping their schemas on every request. ... Disable to expose every enabled tool top-level." },
});
```

挂载判定（[xdev.ts:85-88](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/tools/xdev.ts#L85)）：

```ts
export function isMountableUnderXdev(tool: { name: string; loadMode?: ToolLoadMode }): boolean {
	if (tool.name in XDEV_TRANSPORT_TOOLS || tool.name in XDEV_KEEP_TOP_LEVEL) return false;
	return tool.loadMode === "discoverable";
}
```

**被挂载的 13 个工具**（本轮推导）：

```text
ast_edit ast_grep checkpoint debug github ida lsp
memory_edit recall reflect retain rewind security_scan
```

启用xdev且通过mount判定时，它们不作为顶层wire schema发送；目录提示和被发现/加载的描述仍可能进入后续上下文，不能概称「完全不进入任何请求」。最终集合还受用户配置与权限过滤。

Cheers 的对照：**没有这个概念**。`grep` 与 `glob` 在 Cheers 是顶层，在 omp 里 `grep` 因 `XDEV_KEEP_TOP_LEVEL` 保持顶层（注释说明「bash 拦截规则的重定向目标」），但 `ast_grep`/`ast_edit`/`lsp`/`checkpoint` 等全部挂载。

### 4. tokenizer 仍影响准确度，13%示例不能排除全部差异

以下只能比较未知模型ASCII启发式，不能当成用户实际模型的tokenizer对照实验。

omp 的 `TokenCountMode`（[tokenizer.ts:74-80](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/agent/src/tokenizer.ts#L74)）：

```ts
/**
 * `strict` always tries an exact native count (the catalog-resolved tokenizer
 * when known, o200k_base otherwise), falling back to the byte upper bound when
 * the loaded addon does not recognize that encoding. `approximate` and
 * `upperbound` prefer the same exact count for known tokenizer families or
 * when `PI_TOKENIZER_ACCURATE=1` is set; otherwise they use a cheap heuristic:
 * `approximate` a bytes/4 guess, `upperbound` the raw byte length (never
 * undercounts).
 */
export type TokenCountMode = "strict" | "approximate" | "upperbound";
```

关键：**未知模型的默认是 `bytes/4`**（[tokenizer.ts:202](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/agent/src/tokenizer.ts#L202)：「unknown models keep the fast byte estimate」）。而 Cheers 是 `chars / 3.5`（[context.ts:3](../../packages/ts-shell/src/session/context.ts#L3)）。

对 ASCII 文本，bytes == chars，因此：

| 侧 | 除数 | 14,948 字符 → tokens |
|---|---|---|
| Cheers | 3.5 | 4,271 |
| oh-my-pi（unknown model，approximate） | 4.0 | 3,737 |

对**同一ASCII字符串**两条启发式约差13%，不足以单独解释5.2k/1.5k；这不覆盖已识别模型的精确tokenizer、多语言文本、工具JSON framing或不同显示口径。

omp可依模型catalog选tokenizer；strict和环境覆盖也会影响选择（上方原注释已说明）。没有同内容实测就不能断言精确计数通常更高或Cheers始终保守，尤其JS code units/3.5对中文、emoji等不具备上界保证。

**结论**：工具装载与描述位置是可确认机制；对用户差异的主因排序仍未证明。真实tokenizer可用于降低估算误差，不以「token数看起来更低」为采用目标。

`/context` 的4,952是定义明确的当前schema启发式估算，不能称provider精确值，也尚未证明Cheers的完整请求字节必然大于omp。

### 5. 两重机制的量级

| 机制 | 节省 | 证据 | 可信度 |
|---|---|---|---|
| 删除嵌套属性描述 | 历史样本可移除≈3,766字符（25% of schema）；净收益/质量待测 | §2.1历史量测 | 字符量高；生产可取性未验证 |
| discoverable 挂载（omp 侧 13 个工具） | 每个被挂载工具的完整 schema | §3 | 高（机制确认），但 Cheers 侧收益需按 Cheers 工具集重算 |

**注意**：§5 第二项**不能**直接套用 Cheers 的 `lsp` 大小，因为两边工具集不同。要给出准确收益需先决定 Cheers 哪些工具可挂载。

**仍无法解释的部分**：即 §5 两项全部实施，能否从 4,952 降到约 1,500，**本轮未证明**。用户口述的 omp 1.5k 未在本机复现（见 §8）。可能还有未发现的机制，也可能用户看到的是不同的模型/配置。

### 6. Cheers 侧可做的三类改动

| # | 改动 | 收益来源 | 风险 | 可信度 |
|---|---|---|---|---|
| X-01 | 按语义精简重复描述与过长默认说明 | 候选删除量≈25% of schema，净收益另测 | 模型选工具/传参可能退化，不能称无风险 | 字符量已量化，质量未验 |
| X-02 | 引入 discoverable 概念，把低频工具移出顶层 | 每个被移出工具的 schema | 中：需要发现机制（`xd://` 或搜索） | 机制确认，收益待算 |
| X-03 | 研究按模型tokenizer与估算校准 | 准确度，不是降低真实上下文 | 模型映射/版本/加载成本/回退 | 尚未否决，需基准 |

X-01应先量化总请求净变化并验质量。X-02需要决定发现方式与稳定工具合同——omp的`xd://`复用read/write传输，不意味着Cheers应绕开原工具审批或把读文件权限升级为执行权限。

X-03恢复为准确度研究：13%启发式示例不足以否决真实tokenizer。

### 7. 待定决策点

| # | 决策 | 选项 |
|---|---|---|
| G-01 | X-01与X-02顺序 | 技术建议：先测最终wire/质量基线；描述压缩与发现机制分开验收 |
| G-02 | 发现机制 | 同T-06；动态发现默认开启已获用户裁决，具体接口是技术设计 |
| G-03 | 可移出顶层的工具清单 | 同T-05，由实际依赖/权限/质量证据确定 |
| G-04 | 真实tokenizer | 技术建议：保留估算标记，按模型做校准后决定；不为压低UI数字选算法 |
| G-05 | 分类拆分 | 归并T-03 |

### 8. 未验证项

- **未实测 omp 的实际初始上下文数字**：安装版是 266 MB 编译二进制，其 provider 端点未指向本机捕获服务器，`--print` 运行 150 秒未产生捕获。用户提到的「omp 约 1.5k」仍为口述。
- 未量化 §3 中 13 个 discoverable 工具在 omp 侧的实际 schema 字节（需运行 omp 的 `toolWireSchema`，但该包依赖未安装）。
- omp 顶层 18 个的数字由 `ESSENTIAL_BUILTIN_TOOL_NAMES`（13）+ `XDEV_KEEP_TOP_LEVEL`（5）推导，未在运行时确认最终集合（`isToolAllowed` 可能按 settings 再过滤）。
- 未验证 `NATIVE_CACHE_MAX_LENGTH` 的具体值。
- 未核对 Cheers 的 20 个 CLI 工具与 17 个核心工具的差集具体是哪 3 个。

## 生产设计与反例验收

1. **统一快照，保留来源。** 状态栏、`/context`与压缩共享当前provider/model、配置revision、system/schema指纹、历史revision及as-of请求身份；区分unknown、estimated、provider-measured与stale。上次输入量、当前存储历史、下一次请求预测、会话累计费用是不同量，不能只用一个`tokens`字段替代。
2. **显示不驱动隐藏I/O。** 首帧只有窗口已知时保留`?`；异步准备估算须遵守读取准入、资源预算和generation fencing。已捕获的最终请求可用于准确归因；项目指令、skills、system、schema、history、协议/媒体未分配项分别计量，分类总和只对同一快照有意义。旧provider总量不减去当前schema来伪造历史拆分。
3. **真实减量保持工具合同。** 无论顶层还是discoverable，最终调用都回到原schema校验、权限、sandbox与审计owner；发现不授予写权限，加载变更使预算/缓存失效。无法发现、拒绝、模型不支持、跨turn恢复、MCP变更时有明确回退。不得通过改计量域隐去实际硬预算。
4. **净收益与质量一起量。** 在相同模型/协议/指令/工具池下捕获redacted请求，分别记录UTF-8 bytes、tokenizer估算、provider输入usage、schema加载回合与缓存命中。描述迁移需比较system+schema总量，包含发现请求额外成本。测试工具选择、参数边界、默认值、拒绝反馈与多语言输入，不能仅看schema JSON变短。
5. **反转验收。** 把估算当实测、cache重复计数、模型切换复用旧量、取消后的旧快照覆盖当前UI、将discoverable写工具当read权限执行、删除关键参数说明后质量回归时，对应测试必须失败。首轮未知与usage缺失的诚实显示必须保留。

### 动态发现默认开启的具体交接

用户已选择该方向，以下为技术方案建议，尚无产品实现或质量实验。

| 类型 | Cheers实际工具ID候选 | 原因 |
|---|---|---|
| 常驻 pinned | `read`、`glob`、`grep`、`bash`、`edit`、`write`、`apply_patch`、`ask`、`taskOutput`、`taskStop` | 保留代码任务基础读改与shell、用户澄清、已返回后台句柄的读取/停止；同时经过当前模式/权限过滤，pinned不等于可执行授权 |
| 默认 discoverable | `browser`、`desktop`、`lsp`、`web_fetch`、`web_search`、`todo`、`task`，以及实际注册的可选`skill`、MCP/feature tools | 这些ID来自核心注册表；可选工具以当前catalog为准，不从历史「CLI 20」数量猜清单 |
| 新的发现接口 | 独立 discovery/load 元工具，名称由工具owner确定 | 始终提供可发现入口；不能隐藏全部工具后让模型没有发现路径 |

`task`/`todo`/`lsp`等是否需要改为pinned，应由代码导航、委派与多步骤任务基准决定；完整工具合同、用户显式启用与可用模型能力优先。不能通过把失败任务移出统计来证明节省。

1. **先准入后建目录。** 在生成工具名、描述、搜索语料与schema之前应用当前模式、权限和能力可见性政策，禁止泄露无权发现的schema/参数/服务器身份；只需执行时审批的可见工具可以显示其审批要求。结果只返回当前可见且真实存在的工具，不编造参数默认值或把截断schema冒充完整定义。
2. **加载不授予权限。** discovery返回稳定工具ID、完整schema或明确的可取回引用、schema digest与catalog generation；执行仍按当时的schema重新校验args并经过原pre-tool权限/准入/sandbox。加载后被隐藏、禁用、撤销、schema改变或MCP断开时旧调用必须明确失效，不复用先前authority。
3. **请求与缓存身份。** directory generation由session/root、配置publication、模式/权限可见性、插件/MCP与工具schema digest决定。搜索结果、loaded set和下一次provider请求绑定该generation；request/cache key包含最终工具集合、顺序与schema/system版本。重建原子发布，异步旧搜索或加载结果不能覆盖新目录；同名不同源工具不得碰撞。
4. **预算与prompt cache。** 按需加载后增加的schema要在下一请求前重新预算；工具集合与prompt前缀变化可能降低provider cache复用，需要稳定排序/分组并实测。不可用旧缓存估算证明新请求仍能装下。发现文本和schema结果本身也占历史预算，重复发现有界复用且不能永远叠加副本。
5. **端到端质量门。** 对同模型、相同工具权限与任务集比较默认全量和动态发现：真实任务成功率、错误参数、漏发现/错误工具、审批遵守、轮次、总输入/输出tokens、延迟与cache复用。包含未知工具需求、无匹配、能力撤销、恢复、并发目录变化、工具调用失败反馈与长会话。mock只能验证状态机，token下降不能替代任务成功率；未跑真实隔离任务前保持质量未验证。
