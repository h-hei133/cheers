---
title: "Slash 候选与参数提示：别名、子参数膨胀、选中态回焦与 85 个 hint 审计"
category: article
sources: [repo-audit-2026-10-15, packages/ts-shell/src/cli/interactive/slashSuggestions.ts, packages/ts-shell/src/presentation/tui/chrome/suggestions.ts, packages/ts-shell/src/core/commands/invocation.ts, packages/ts-shell/src/core/commands/registry.ts, packages/ts-shell/src/core/commands/navigation/syntax.ts, oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts, oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts, codex/codex-rs/tui/src/bottom_pane/command_popup.rs, codex/codex-rs/tui/src/slash_command.rs, 16-input-slash-startup-context.md, 21-command-argument-options.md]
created: 2026-10-15
updated: 2026-10-17
tags: [features, slash-commands, completion, tui, gap-analysis]
summary: "源码复核确认非空前缀显示别名、查询变化沿用旧索引与长 hint 投影问题。历史快照统计 85 个 hint，其中 82 个从 CommandSyntax 派生；不等于全部 handler 一致性已验证。theme/skill/tools 已有动态补全，真实待补为 continue 会话目录及 usage/git/wt 动作接线。保留别名执行、快照编辑与 Enter/Tab 契约。"
confidence: high
---

# Slash 命令候选：别名显示、子参数膨胀与选中态回焦

只读研究。未修改源码/测试/配置，未运行测试套件。源码基线 `0d30d589`；参考快照 oh-my-pi `c2cb79e4`、pi `4a5d3729`、codex `4210c08d`。

**2026-10-17 源码复核**：本次仅修订文档，未新增动态或 PTY 验证。旧候选数、hint 长度与编译产物输出均为历史快照，不能作为当前运行结果。追踪 ID 按 `24/主文/S-xx`、`24/参数审计/P-xx`、`24/分类/D-xx` 区分；三个章节的结论已在正文消歧。

## 1. 问题一：别名污染下拉框

### 1.1 机制

`candidates(includeAliases, scope)`（[slashSuggestions.ts:16-42](../../packages/ts-shell/src/cli/interactive/slashSuggestions.ts#L16)）构造两个池：

- `cached`：**全部** invocation，含 `kind === "alias"`，detail 追加 `(alias of /<主名>)`。
- `defaults`：过滤掉 alias，只留 `kind !== "alias"`。

调用点决定用哪个：

```ts
const matches = matchSuggestions(token.prefix, candidates(token.prefix !== "/", scope));
```

即：**前缀恰为裸 `/` 时用 `defaults`；只要多打一个字符就切到含别名的 `cached`**。

别名来源是 `commandInvocations`（[invocation.ts:19-31](../../packages/ts-shell/src/core/commands/invocation.ts#L19)），它为 `command.aliases` 里每个名字生成一条 `kind: "alias"` 记录。注册表里 37 处 `aliases` 声明（[registry.ts](../../packages/ts-shell/src/core/commands/registry.ts)）。

### 1.2 实测

直接调用编译产物 `slashSuggestions`：

```text
"/"    -> 107 candidates
"/m"   -> 115 candidates
         /mcp, /mem, /model, /models, /market, /memory
"/mode"-> 23 candidates
         /model, /models, /modelpreset, /model-presets, /shake, /advisor
```

`/m` 的 115 项里包含 `/mem`、`/models`、`/market`、`/model-presets` 等别名。注意**裸 `/` 已经收敛**（107 项而非 117 项），说明文档 18 的「空过滤折叠别名」已实施；**非空前缀仍未收敛**，这正是用户看到的现象。

### 1.3 用户要求与实现路径

用户要求：**下拉框永不出现别名，代码中保留别名可执行**。

需要改动的位置（枚举）：

| 位置 | 现状 | 影响 |
|---|---|---|
| [slashSuggestions.ts:34](../../packages/ts-shell/src/cli/interactive/slashSuggestions.ts#L34) `candidates(token.prefix !== "/", scope)` | 非空前缀启用别名 | 主入口，必须改 |
| [slashSuggestions.ts:16-42](../../packages/ts-shell/src/cli/interactive/slashSuggestions.ts#L16) `candidates` 的双池 | `cached`/`defaults` 两套 | 可退化为单池 |
| `getSlashInvocation(command.value, scope)`（同文件 47 行） | 按 invocation 解析 | **解析路径，必须保留别名能力** |
| [slashCommandRegistry.ts](../../packages/ts-shell/src/entrypoints/slashCommandRegistry.ts) `resolveCommandInvocation` | 扫全部 invocation | 保留 |
| `/help` 渲染 | 已 `filter(invocation => invocation.kind !== "alias")` | 已正确 |

**关键约束**：别名必须仍能被**输入并执行**（`/models` 要能跑 `/model`），只是不出现在候选列表里。由于解析走 `getSlashInvocation` 而非候选池，二者可以解耦。

### 1.4 参考做法

codex 在 `command_popup.rs:149-156` 的空过滤分支里显式跳过 `ALIAS_COMMANDS`；但其**非空过滤仍保留别名**，与 Cheers 当前行为相同。也就是说「非空也隐藏别名」比 codex 更严格，是用户提出的新要求，参考里没有直接等价物。

## 2. 问题二：子参数膨胀

### 2.1 Cheers 现状

历史运行时目录统计为 **85 个**有 hint 的顶层命令；单个 registry 文件的 62 处字面声明不能当作完整数量。`/resume` 的语法树（[navigation/syntax.ts:11-28](../../packages/ts-shell/src/core/commands/navigation/syntax.ts#L11)）暴露 **15 个动作**：

```text
(resume) | panel | list | current | switch | fork | rename | delete
| pin | history | import | open | shake | new | help
```

且每个动作自带参数与别名（`list`→`ls`、`current`→`active`、`switch`→`use`）。用户抱怨的「resume 搞这么多参数」指的就是这个。

### 2.2 参考对照

| 命令 | Cheers | oh-my-pi | codex |
|---|---|---|---|
| `resume` | 15 个动作 + 参数 + 别名 | `inlineHint: "[session id\|@claude\|@codex]"`，**单一内联参数，无子命令**（[builtin-lifecycle.ts:372-405](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts#L372)） | `Resume => "resume a saved chat"`（[slash_command.rs:97](https://github.com/openai/codex/blob/4210c08defe92fe8828f789b6f9fda287ad3709e/codex-rs/tui/src/slash_command.rs#L97)），无参数 |
| `compact` | 多动作 | 有 `COMPACT_MODES` 子命令 + `[focus]`，**与 Cheers 量级相当**（[builtin-lifecycle.ts:210-275](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts#L210)） | 无 |
| `session` | 分散在 `/resume` 各动作 | 独立 `/session [info\|delete\|pin [account]]`，**3 个子命令**（[builtin-session.ts:243-250](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/slash-commands/builtin-session.ts#L243)） | 无 |

**关键观察**：参考的会话命令边界不同；Cheers 的显示投影还把完整动作语法拼进一行。本轮决定修复投影与补全、保留现有管理语法，不删除或拆分顶层入口，不能仅凭动作数改变命令边界。

### 2.3 判定口径

区分两类，处置不同：

| 类型 | 例子 | 建议 |
|---|---|---|
| **真参数**（模型/用户会传值） | `/resume <id>`、`/compact [focus]`、`/model use <p>/<m>` | 保留，作为内联 hint |
| **已有入口的管理动作** | `/resume fork`、`/resume rename` | 短 hint 不展开整棵树；保留解析、完整 help 与上下文动作补全 |
| **纯装饰**（无对应 handler 分支） | 待逐条核对 | 删除 |

`argumentHint` 是显示元数据，不能直接充当真实参数契约数量。附录完成了快照计数与展示分类，但未逐一验证全部 handler 元数，不能断言不存在任何装饰性或失真的 hint。

## 3. 问题三：选中态不回焦

### 3.1 机制

`SuggestionList.setItems`（[suggestions.ts:74-83](../../packages/ts-shell/src/presentation/tui/chrome/suggestions.ts#L74)）：

```ts
setItems(items: readonly Suggestion[]): void {
  const selected = this.moved ? this.current() : undefined;
  const retained = selected?.edit ? items.findIndex(item => item.value === selected.value && sameEdit(item.edit, selected.edit)) : -1;
  this.renderedItems = [];
  this.items = items;
  this.selected = retained >= 0 ? retained : Math.min(this.selected, Math.max(0, items.length - 1));
  this.moved = retained >= 0;
  this.scrollToSelection();
}
```

`sameEdit`（同文件 160-165 行）比较 `revision`、`text`、`cursor`、`from`、`to`、`text`、`cursorOffset` 七项。**用户继续打字会改变 `text`/`cursor`/`revision`，`sameEdit` 必然为 false**，于是 `retained = -1`，走到兜底分支 `Math.min(this.selected, items.length - 1)`——把**旧的数字索引**钳进新列表，而不是回到最佳匹配。

### 3.2 实测复现

用编译产物构造用户描述的序列（裸 `/` → 下移 7 次 → 输入 `model`）：

```text
moved to index -> /cmd7 chosen true
after typing, focused -> /modelpreset chosen false
```

焦点落在 `/modelpreset`（新列表索引 1），而最佳匹配是索引 0 的 `/model`。**与用户描述完全一致。**

更小的复现（`/mcp` → 输入 `mc`）：

```text
after moves, current = /mcp chosen = true
after retype, current = /mcp chosen = false
```

此例恰好索引仍为 0，所以看不出偏差；`chosen` 被重置为 `false` 本身不等于 Enter 直接提交。[keymap.ts:383-403](../../packages/ts-shell/src/cli/interactive/keymap.ts#L383) 同时检查 `incomplete`：未完成词仍可用 Enter 接受候选，完整词且无显式选择时才落回提交。查询编辑后清除旧显式选择有助于避免接受用户已经撤回的选择，应保留这个安全边界。

### 3.3 参考做法

Scout 断言参考「在查询变化时把选中重置为 0」，但**未能给出可核对的文件行号**，本轮无法确认。倾向的判定是：这不是「参考怎么做」的问题，而是**当前兜底逻辑本身错误**——用旧索引钳位在新列表上没有任何语义依据。合理修法是：查询变化（`retained < 0`）时回到索引 0，而不是钳位。

## 4. 决策与任务（保留原 ID）

| # | 决策 | 选项 |
|---|---|---|
| S-01 | 非空前缀是否也隐藏别名 | 已按用户要求：候选显示 canonical 名称，别名仍可执行 |
| S-02 | 别名可执行性如何保证 | 保持 `getSlashInvocation`、alias 参数补全与动态注册失效 |
| S-03 | `/resume` 动作如何瘦身 | 技术决定：仅简化UI，保留原语法；本轮不删命令或拆分顶层入口 |
| S-04 | hint 与 handler 一致性 | 快照统计 85；展示分类已做，handler 元数全量核验仍是实施任务 |
| S-05 | 新查询的选中项 | 技术决定：回到最佳匹配；同一 draft 的异步刷新可按稳定身份保留选择 |
| S-06 | 继续打字是否清除 `moved` | 技术决定：新 draft 清除旧显式选择，保留 keymap 的 incomplete/Tab/Enter 区别 |

## 5. 未验证项

- 未逐条核对快照 85 个 `argumentHint` 与 handler 的全部元数（S-04 未闭环）。
- 未在真实 TUI 中目视确认选中态偏差（结论来自编译产物直接调用）。
- 参考项目「查询变化重置选中」的具体实现未取得行号级证据。

---

## 附：参数提示审计：85 个 argumentHint 与 handler 的一致性

只读研究。未修改产品源码。本文更正主文 S-04 的计数，并完成元数据分类；不能替代逐 handler 的语法一致性审计。

### 1. 更正 doc 26 的计数

| 项 | doc 26 写的 | 实测 |
|---|---|---|
| `argumentHint` 总数 | 62 | **85** |
| `getArgumentCompletions` | 未列 | **74** |
| 有 hint 但无静态 getArgumentCompletions | 未列 | **12**（含已有动态Catalog的命令） |

实测方法：`listSlashInvocations().filter(kind === 'command')` 后统计 `argumentHint` 与 `getArgumentCompletions` 字段。命令总数 **102**。

**doc 26 的 62 是错的**——它数的是 `registry.ts` 文件里 `argumentHint` 字面量出现的次数，漏掉了通过 `gitCommandDefinitions()` 等独立注册模块并入的命令（[registry.ts:840](../../packages/ts-shell/src/core/commands/registry.ts#L840) 的 `...gitCommandDefinitions()`）。

### 2. 有 hint 但无静态 provider 的 12 个命令

```text
/continue       [sess_<id>] [prompt]
/review         [focus]
/theme          [name]
/usage          [show|account|reset [apply <preview-id>|status [request-id]]]
/skill          [name]
/copy           [text]
/btw            <question>
/web-research   <topic>
/git            [status|diff|stage|unstage|commit|branch|merge|push|reconcile|review|goal]
/wt             [list|create <path> <branch>|migrate <path> <branch>|switch <path>|delete <path>]
/commit         [guidance]
/tools          [name]
```

这 12 个是“无静态 `getArgumentCompletions`”，不等于交互无补全。`/theme`、`/skill`、`/tools` 已在 [completion/request.ts:42-46](../../packages/ts-shell/src/cli/interactive/completion/request.ts#L42) 接动态 Catalog，且 [interactiveMode.ts:608](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts#L608) 先走动态目录。`/copy`、`/btw`、`/web-research`、`/commit`、`/review` 的自由文本不应被强制枚举。`/continue` 的会话 ID 尚未接入 `navigationKind`（[request.ts:83-91](../../packages/ts-shell/src/cli/interactive/completion/request.ts#L83)）。

但 **`/usage`、`/git`、`/wt` 三个是「状态机」**——hint 声明了子动作，却没有补全提供者。这是真缺口：用户看到 `[status|diff|stage|...]` 却无法用 Tab 补全。

### 3. 三类不一致（逐条取证）

#### 3.1 类型一：hint 列平铺动词，handler 要求**嵌套元数**

**`/git`**（[git/registration.ts:4-5](../../packages/ts-shell/src/core/commands/git/registration.ts#L4)）：

```ts
argumentHint: '[status|diff|stage|unstage|commit|branch|merge|push|reconcile|review|goal]',
```

**11 个平铺动词**。但实际 handler 要求嵌套结构（[workflow/git/service.ts:22-37](../../packages/ts-shell/src/workflow/git/service.ts#L22)）：

| hint 写的 | handler 实际要求 | 证据 |
|---|---|---|
| `diff` | `diff <staged\|unstaged\|untracked> <path>` — **两个必填参数** | 第 26 行 `rest.length === 2 && ['staged','unstaged','untracked'].includes(rest[0])` |
| `stage` / `unstage` | `<path> [hunkId]` — 1–2 个参数 | 第 29 行 `rest.length >= 1 && rest.length <= 2` |
| `branch` | `branch <create\|switch\|delete> <name>` — **二级动词 + 名字** | 第 31 行 `rest.length === 2 && ['create','switch','delete'].includes(rest[0])` |
| `merge` | `merge <branch>` | 第 32 行 |
| `push` | `push <remote> <refs/heads/branch>` — **两个参数** | 第 33 行 |
| `reconcile` | `reconcile <id>` | 第 34 行 |
| `commit` | `commit <message...>` — rest 拼接 | 第 30 行 `rest.join(' ')` |

即：**hint 把 11 个动词平铺，但其中 6 个还需要额外的位置参数，`branch` 甚至需要第二级动词**。用户照 hint 输入 `/git branch` 会得到：

> `Invalid Git operation. Use /git help. No write was attempted.`

（第 35 行的兜底分支）。

**对比**：handler 自己有一个**更准确的** `help` 文本（[service.ts:23](../../packages/ts-shell/src/workflow/git/service.ts#L23)）：

```text
/git [status|diff <staged|unstaged|untracked> <path>|stage|unstage <path> [hunkId]|commit <message>|branch create|switch|delete <name>|merge <branch>|push <remote> <refs/heads/branch>|reconcile <id>|review [focus]|goal]
```

**两个真相源不一致**：`registration.ts` 的 `argumentHint` 与 `service.ts` 的 help 文本描述同一个命令，粒度不同。前者用于补全/提示，后者用于报错。**这是 doc 23 §2「hint 是显示元数据」的具体实例。**

**`/wt`**（[git/registration.ts:7](../../packages/ts-shell/src/core/commands/git/registration.ts#L7)）：

```ts
argumentHint: '[list|create <path> <branch>|migrate <path> <branch>|switch <path>|delete <path>]',
```

这个**写得比 `/git` 准确**——它标出了 `<path> <branch>`。handler 也是按此实现的（[service.ts:45-47](../../packages/ts-shell/src/workflow/git/service.ts#L45)）。**同一文件里两个命令的 hint 质量不一致。**

#### 3.2 类型二复核：`/usage` 路径基本一致，别名按位置消歧

**`/usage`**（hint）：

```text
[show|account|reset [apply <preview-id>|status [request-id]]]
```

实际语法树（[usage/syntax.ts:3-7](../../packages/ts-shell/src/core/commands/usage/syntax.ts#L3)）：

```ts
export const usageSyntax: CommandSyntax = { name: 'usage', defaultAction: 'show', actions: [
  { name: 'show', aliases: ['status'], summary: 'show measured session activity and account availability' },
  { name: 'account', summary: 'read quota and offers for the current selected account' },
  { name: 'reset', summary: 'preview a credit; apply requires its ID; status [request-id] inspects local receipts',
    parameters: [{ name: 'action', kind: 'text', values: ['apply', 'status'] }, { name: 'request-id', kind: 'text' }] },
```

**两者基本一致**。`show` 的别名为 `status`，而 reset 也有子动作 status；位置不同使解析无歧义。短 hint 省略别名并非缺陷，完整 help 应说明两种路径；不应为了列全别名再次扩大短提示。

#### 3.3 类型三：hint 与 handler 无补全提供者

`/usage`、`/git`、`/wt` 三者都有 `argumentHint` 但 `getArgumentCompletions` 为 `undefined`。而它们**都已有语法树或分支逻辑**可以派生补全：

- `/usage` 有 `usageSyntax`（可像 `/memory` 那样接 `getArgumentCompletions`）。
- `/git` 的 handler 有完整的动词 + 元数分支（可派生）。
- `/wt` 同理。

**结论**：这三个不是「没有可补全的内容」，而是**没有接线**。这是 doc 23 已记录的「规范动作缺失/别名不可检索」的又一实例。

### 4. 与 omp 的对照

omp 的 `BuiltinSlashCommand` 把两者**分开声明**（[types.ts:25-34](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/slash-commands/types.ts#L25)）：

```ts
/** Subcommands for dropdown completion (e.g. /mcp add, /mcp list). */
subcommands?: SubcommandDef[];
/** Static inline hint when command takes a simple argument (no subcommands). */
inlineHint?: string;
```

且 `SubcommandDef` 自带 `usage` 字段（同文件 7-14 行）：

```ts
export interface SubcommandDef {
	name: string;
	description: string;
	/** Usage hint shown as dim ghost text, e.g. "<name> [--scope project|user]". */
	usage?: string;
}
```

即 omp 用**结构化声明**（子命令列表 + 每个子命令的 usage）而非一个自由格式字符串。`/git` 若在 omp 里，会被写成 `subcommands: [{name:'diff', usage:'<staged|unstaged|untracked> <path>'}, ...]`——**粒度信息不会丢**。

**对 Cheers 的适用决定**：已有 `CommandSyntax` 能表达动作、参数、别名与 flag；问题是手写 hint 的重复真相源，以及完整语法被压成一行的投影。复用现有结构生成简洁 usage、上下文候选和完整 help，不再创建一套与其平行的 `subcommands` 元数据。

### 5. 技术决定（保留原 P-ID）

| # | 决策 | 选项 |
|---|---|---|
| P-01 | `/git` 的 hint 是否改为嵌套形式 | 技术决定：建立现有 CommandSyntax 声明，按当前动作投影 |
| P-02 | `/usage` `/git` `/wt` 是否接补全 | 技术决定：全部接线，写操作仍走原权限与确认 |
| P-03 | 是否引入结构化参数声明 | 技术决定：复用已有 CommandSyntax，避免第二套声明 |
| P-04 | 两个真相源如何收敛 | 技术决定：handler 解析、hint、help、completion 共享声明；不反射 handler 函数 |
| P-05 | `/usage status` 的显示 | 技术决定：完整 help 列别名和 reset status 路径，短 hint 保持 canonical |

### 6. 未验证项

- 未逐一验证其余 73 个有 hint 的命令是否也存在粒度失真（只抽查了 `/git`、`/wt`、`/usage`）。
- 未运行这 12 个命令的真实 TUI 补全；源码已确认 theme/skill/tools 的动态路径，不再列为新增补全。
- 其他文章的参数命令统计与本文采用的 runtime invocation 统计口径不同，不据此相减推导缺陷数。


---

## 附：参数提示全面审计：85 个 hint 的 DELETE / ADD / FIX 分类

只读研究。未修改产品源码。本节按历史快照对 **85 个 hint 的展示元数据分类**，并回应「哪些该删、哪些该加」；未完成全部 handler 的参数元数核对。

### 0. 2026-10-16 重要更正：85 个 hint 中 82 个是派生的

[29 §8.1](29-startup-time.md#81-顺带查清的一个真实事实) 查清了一个改变本文修法的事实：

| 来源 | 数量 |
|---|---|
| `argumentHint: syntaxHint(…)`（由 `CommandSyntax` 生成） | **82** |
| 手写字面量 | **3**（`/git` `/wt` `/usage`） |

**这减少了独立字符串漂移，不证明另外 82 个都与 handler 一致。** `/git` 确有手写文本粒度不足；`/wt` 文本与 handler 一致，`/usage` 省略别名也不构成语法错误。不能把三个手写来源直接记成三个缺陷。

**因此本文 §4 的分类要按下表重新理解**：

| 本文原分类 | 实际性质 | 修法 |
|---|---|---|
| FIX-结构 10 个（>200 字符） | 全部是**派生** hint，冗长来自 `syntaxHint()` 把 action usage 用 `\|` 拼接 | 在现有语法 owner 增加面向当前动作的简短投影；保留完整 help，并更新消费方 |
| FIX-文本（`/git`） | 手写，与 handler help 冲突 | 单独改为派生 |
| FIX-补全 | 与 hint 来源无关；theme/skill/tools 已走动态 Catalog | 新增 continue 会话目录及 usage/git/wt 动作补全 |

**工作范围**：共享投影与消费方改造、手写来源收敛、4 处补全接线，以及 handler 契约核验；不能用修改一个函数的估算代替语义审计。

---

### 1. 全量计数（实测）

```text
顶层命令         102
有 argumentHint   85
有 getArgumentCompletions  74
有 hint 但无静态 provider   12（动态目录另计）
无 hint 但有补全    1  (/fresh)   ← ADD 候选
```

### 2. 核心发现：66 个 hint 把整棵语法树塞进一行

实测 85 个 hint 中 **66 个含 `|`**（子动作列表）。长度分布：

| 统计 | 值 |
|---|---|
| 最长 | **475** 字符（`/settings`） |
| 最短 | 6 |
| 平均 | 89 |
| >200 字符 | **10** |
| >400 字符 | **2** |

最长的 15 个：

| 命令 | 长度 | `\|` 数 |
|---|---|---|
| `settings` | **475** | 31 |
| `mcp` | **446** | 22 |
| `memory` | 361 | 20 |
| `security` | 342 | 10 |
| `resume` | 340 | 36 |
| `compact` | 339 | 5 |
| `plugin` | 301 | 15 |
| `agents` | 299 | 11 |
| `connect` | 244 | 8 |
| `collab` | 231 | 16 |
| `deep-research` | 172 | 9 |
| `record` | 170 | 6 |
| `restore` | 166 | 1 |
| `plan` | 163 | 5 |
| `director` | 162 | 11 |

**`/settings` 的 hint 把 32 个设置名全部列在一行**——而这 32 个名字本身就是 `/settings` 的**补全候选**（`getArgumentCompletions` 存在）。即同一份数据被表达两次：一次作为补全列表，一次塞进 hint 字符串。

### 3. 渲染路径的两处缺陷（用户「一堆文字」的具体来源）

#### 3.1 候选列表：`summary + hint` 拼成一行

[slashSuggestions.ts:28](../../packages/ts-shell/src/cli/interactive/slashSuggestions.ts#L28)：

```ts
const detail = invocation.argumentHint ? `${invocation.summary} ${invocation.argumentHint}` : invocation.summary;
```

实测（`slashSuggestions('/m')`，115 个候选）：

```text
/mcp     | inspect and recover MCP state [status|list|show <server>|add <scope> <server> <file>|edit <scope> <server> <fi…
/mem     | inspect, search, retain, or invalidate persistent memory facts [view [record-id]|diagnose|queue|enqueue <state…
/model   | inspect and switch active model [status|refresh|config|list [provider] [--refresh]|use <model-id> [--global] […
```

`renderRow` 用 `truncateToWidth`（[suggestions.ts:163](../../packages/ts-shell/src/presentation/tui/chrome/suggestions.ts#L163)）截断，所以不换行；但**每个候选行都被 400+ 字符的 hint 撑满**，用户看到的是「描述 + 一长串被截断的语法」，而非可读的摘要。

#### 3.2 Usage 提示：整行渲染

[slashSuggestions.ts:61](../../packages/ts-shell/src/cli/interactive/slashSuggestions.ts#L61)：

```ts
return invocation?.argumentHint ? `Usage: ${invocation.invocation} ${invocation.argumentHint}` : undefined;
```

实测（输入命令名 + 空格）：

| 输入 | 渲染长度 |
|---|---|
| `/settings ` | **492** |
| `/mcp ` | **458** |
| `/memory ` | **376** |
| `/resume ` | **355** |
| `/model ` | **161** |

这些是生成字符串长度，**实际只占一行，并按终端宽度截断**（[hints.ts:74-75](../../packages/ts-shell/src/presentation/tui/chrome/hints.ts#L74)）。问题是被截掉的必要参数与低信息密度，不能写成 492 个可见字符或多行溢出。

#### 3.3 对照：omp 的结构化模型

omp 把两件事**分开声明**（[types.ts:25-34](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/slash-commands/types.ts#L25)）：

```ts
subcommands?: SubcommandDef[];   // 34 处使用
inlineHint?: string;             // 33 处使用
```

`SubcommandDef` 自带 `usage`（同文件 7-14 行，注释原文「Usage hint shown as **dim ghost text**」）：

```ts
export interface SubcommandDef {
	name: string;
	description: string;
	/** Usage hint shown as dim ghost text, e.g. "<name> [--scope project|user]". */
	usage?: string;
}
```

即 omp 的形态（[builtin-collaboration.ts:68-75](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/slash-commands/builtin-collaboration.ts#L68)）：

```ts
subcommands: [
  { name: "on", description: "Enable the advisor" },
  { name: "off", description: "Disable the advisor" },
  { name: "status", description: "Show advisor status" },
  { name: "dump", description: "Copy the advisor's transcript to clipboard", usage: "[raw]" },
  { name: "configure", description: "Open the advisor configuration editor (TUI)" },
],
allowArgs: true,
```

**差别**：参考把候选说明与简短 usage 分开。Cheers 也已有结构化动作与 `syntaxCompletions`；长字符串是 hint 的投影，并非全部参数能力。应对比同一命令的实际候选与 hint 两条路径，不能从 hint 长度推断 Cheers 只能显示文本。

**修法**：候选行以摘要为主，选中动作的简短 usage 独立展示；完整语法留在 help。三者从现有 CommandSyntax 派生，避免重复声明。

### 4. 分类结果

#### 4.1 ADD（1 个）

| 命令 | 现状 | 应有 |
|---|---|---|
| `/fresh` | **有 `getArgumentCompletions` 但无 `argumentHint`** | 补 hint，内容与补全提供者一致 |

#### 4.2 FIX（10 个 hint >200 字符，须重构而非微调）

这 10 个**不是文本错误**，而是**表达方式错误**——单字符串承载了应结构化的内容：

```text
settings(475) mcp(446) memory(361) security(342) resume(340)
compact(339) plugin(301) agents(299) connect(244) collab(231)
```

**技术决定（见§5 D-01）**：复用已有CommandSyntax投影默认/当前动作的简短usage，动作说明继续作为补全候选，完整help保留全部语法；不新建平行subcommands声明。

#### 4.3 手写来源核对（3 个来源，非 3 个缺陷）

| 命令 | hint 写的 | handler 实际要求 | 证据 |
|---|---|---|---|
| `/git` | 平铺 11 个动词 | `diff <staged\|unstaged\|untracked> <path>`、`branch create\|switch\|delete <name>`、`push <remote> <refs/heads/branch>` | [git/service.ts:22-37](../../packages/ts-shell/src/workflow/git/service.ts#L22) |
| `/wt` | 标注了 `<path> <branch>` | 与 hint 一致（**这个是对的**） | [git/service.ts:45-47](../../packages/ts-shell/src/workflow/git/service.ts#L45) |
| `/usage` | `[show\|account\|reset …]` | 基本一致；完整 help 说明别名，短 hint 无需列全 | [usage/syntax.ts:3-7](../../packages/ts-shell/src/core/commands/usage/syntax.ts#L3) |

**`/git` 还有一个「两个真相源」问题**：`registration.ts:4` 的 `argumentHint` 与 `service.ts:23` 的 help 文本描述同一命令、粒度不同，且后者**更准确**。

#### 4.4 12 个没有静态 provider 的命令：区分动态目录与真实缺口

```text
/continue /review /theme /usage /skill /copy /btw /web-research /git /wt /commit /tools
```

| 类别 | 命令 | 判定 |
|---|---|---|
| **自由文本/单值**（无补全合理） | `/btw` `/web-research` `/commit` `/review` `/copy` | KEEP |
| **已有动态目录** | `/theme`（主题名） `/skill`（技能名） `/tools`（工具名） | KEEP；验证目录加载、取消与观察，不重复接静态 provider |
| **状态机**（hint 列了动作却无补全） | `/usage` `/git` `/wt` | **FIX**（最高优先） |

`/continue` 需要 `sess_<id>` 补全（会话 id），也属 FIX。

#### 4.5 汇总

| 分类 | 数量 |
|---|---|
| **ADD**（有补全无 hint） | **1** |
| **FIX-结构**（>200 字符，须重构表达） | **10** |
| **FIX-补全**（缺动态会话目录） | **1**（`/continue`） |
| **FIX-补全**（状态机） | **3**（`/usage` `/git` `/wt`） |
| **FIX-文本**（粒度失真） | **1**（`/git` 的 hint 与 handler help 冲突） |
| **DELETE** | 已读来源未发现；全部 handler 尚未验证 |
| **KEEP** | 其余展示元数据暂保留；上述分类可能重叠，不相加作命令总数 |

**证据边界**：当前没有足够证据删掉某一组 hint，也没有证据宣称每个 hint 的全部参数都真实可执行。长度与 `|` 密度只用于定位展示问题，不能替代 handler 一致性证明。

### 5. 技术决定（保留原 D-ID）

| # | 决策 | 选项 |
|---|---|---|
| D-01 | hint 表达方式 | 技术决定：复用 CommandSyntax，短 hint 只投影当前动作参数 |
| D-02 | 候选列表 detail 是否再拼 hint | 技术决定：候选仅摘要，选中动作 usage 独立显示 |
| D-03 | Usage 提示是否改为多行/分页 | 技术决定：短提示保持受预算约束的单行，完整语法走已有 help/report |
| D-04 | `/git` 的两个真相源如何收敛 | 同参数审计 P-04：共享声明，不从 handler 函数反射 |
| D-05 | 12 个缺静态 provider 的命令 | 排除已有动态目录；补 continue 与 usage/git/wt，并保留自由文本 |
| D-06 | 是否引入编辑区 ghost text | 技术决定：本轮使用简洁上下文usage，不建立重复的ghost输入模式 |

### 5.1 生产契约与反例验收

- 裸 `/`、非空前缀和 fuzzy 查询均不产生 alias 候选；直接输入 alias 仍执行并补全参数。scope 变化、动态注册/撤销必须失效，named invocation 的原有语义不变。
- 从列表深处继续输入后聚焦新查询最佳项；同 snapshot 的异步刷新按稳定身份保留选择，新 snapshot 不沿用旧 edit。Tab 接受、Enter 的显式选择/incomplete 判定、陈旧 revision 拒绝与引号词替换分别验收。
- theme/skill/tools 的动态加载、无结果、错误、取消与 observer 解除继续可用；新增 continue 会话目录不得把用户尾随自由文本当作 session ID 替换。
- `/git diff`、`branch`、`push` 和 `/usage reset apply/status` 的元数从同一声明解析及投影。补全只编辑草稿，不能触发写入或跳过 preview ID、权限及 stale-read。

### 6. 未验证项

- 未逐个读取全部 85 个命令的 handler 以确认 hint 与实现的**每一处**元数是否一致（本文的 FIX 分类基于长度与 `|` 密度这两个**可测量**的代理指标，加上 本文「参数提示审计：85 个 argumentHint 与 handler 的一致性」 已深读的 3 个）。
- 未新增真实终端验证；源码消费方已确认单行 `truncateToWidth`，实现后仍需核对窄屏必要参数的可发现性。
- 未核对 `/fresh` 的补全提供者与应有 hint 的具体内容。
- 未验证 omp 的 `subcommands` 在 TUI 里的实际渲染形态（只读了类型与声明）。

### 7. 子代理失败说明

本轮为该问题派出的 `ArgAuditFull` 子代理以 **HTTP 402「当前账户暂无生效套餐」** 失败（账户计费状态）。本文由主代理直接完成。
