---
title: "命令清单对齐：注册事实、词法映射与 Phase 19 处置"
category: article
sources: [cheers-registry-2026-10-05, ref-builtin-commands-2026-10-05, 18-input-slash-startup-context]
created: 2026-10-05
updated: 2026-10-08
tags: [commands, slash-commands, alignment, parity, gap-analysis]
summary: "核对 Cheers 58 条 dispatch 定义、58 个别名、26 个参数补全提供者，以及参考 85 条顶层和 138 条子命令声明。区分命名关系与真实能力，为 53 个无词法交集的参考定义确定 Phase 19 处置。"
confidence: high
---

# 命令清单对齐：注册事实、词法映射与 Phase 19 处置

本文是源码审查与规划，不是功能交付报告。2026-10-05 审查快照：Cheers `28ff98cee8c4dd63e6752452f73a362ed3559ae3`，oh-my-pi `1c0993c3d12e70042169a951663bb2702e2c0a9e`，pi `b2b5c42f6138b73ec4b2f49ec0ca468800f88586`。研究文档处于工作区，源码结论以该快照为准；未运行交互、网络或真实 Provider 验证。

原稿把名称相同认定为语义完全等价，并从不一致的表格推出功能覆盖率。该推导撤销：同名命令可能操作不同对象，别名相交也可能只是字符串碰巧一致，已有功能还可能通过快捷键或面板暴露。本文保留可复算注册清单，将能力判断单独列出。

## 1. 统计边界与复算方式

### 1.1 声明规模

| 维度 | Cheers | oh-my-pi | 口径 |
|---|---|---|---|
| dispatch 主命令 | 58 | 85 | Cheers 为 `createCommandRegistry` 的 `commands` 数组；参考为 7 个 `BUILTIN_*_SLASH_COMMANDS` 数组 |
| 显式别名 | 58，均不重复 | 8 | 只计 `aliases`，不计为独立功能 |
| 静态交互主入口 | 59 | 不与 dispatch 数硬比 | Cheers 另注入 `/back`；运行时扩展还可增加入口 |
| 结构化子命令声明 | 尚无统一 `SubcommandDef` | 138 | 字面对象 127，加 `compact` 动态 3 项、`effort` 动态 8 项 |
| 顶层与子项声明合计 | 不适用 | 223 = 85 + 138 | 不是去重功能数，也不是所有模式均可调用的动作数 |
| 参数补全提供者 | 26 / 58 | 静态物化 29 / 85；TUI runtime 30 / 85 | 参考 28 个带子项的命令，加 `move`；TUI 再加 `switch`。数量与选项质量、可执行性分开评估 |

证据：[Cheers 注册表](../../packages/ts-shell/src/core/commands/registry.ts)、[额外 `/back` 与动态注册](../../packages/ts-shell/src/entrypoints/slashCommandRegistry.ts)、[参考注册与补全物化](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-registry.ts)、[压缩模式](../../../oh-my-pi/packages/coding-agent/src/session/compact-modes.ts)、[思考等级](../../../oh-my-pi/packages/tui/src/thinking.ts)。参数替换范围、说明与解析契约见 [23](23-command-argument-options.md)。

### 1.2 词法关系

定义 token 集合为 `[name, ...aliases]`，比较完整 token，不做子串或语义猜测：

| Cheers 分类 | 数量 | 命令 |
|---|---:|---|
| 与参考主名相同 | 22 | compact, browser, model, tree, resume, fork, mcp, exit, clear, settings, export, retry, copy, goal, loop, todo, fast, context, btw, marketplace, memory, tools |
| 主名不同，但双方 token 集合相交 | 8 | connect, statusline, init, cost, skill, hotkey, plugin, thinking |
| 与所有参考 token 无交集 | 28 | diagnose, warmup, sidebar, restore, entries, continue, cancel, workspace, cd, pwd, help, permissions, review, reload, view, theme, trust, undo, workflow, web-research, commit, brainstorm, shell, log, crash, timings, metrics, report |

反向计算，参考 **31 个主名**出现在 Cheers 的全部 token 中；扩大到参考主名及别名后，共 **32 个参考定义**有交集，余下 **53 个定义**无交集。两侧不是一一映射，例如 `resume` 携带 `session` 别名。上述均不是功能覆盖率；撤销原稿 `exact/renamed/ours-only` 能力标签及其覆盖率。

### 1.3 复算算法

用 TypeScript AST 定位 Cheers 的 `commands` 数组，仅读取对象自身的 `name`、`aliases`、`group`、`kind`、`argumentHint`、`getArgumentCompletions` 与 `execute`，避免全文件正则混入嵌套对象。参考按注册器指定的 7 个数组顺序提取，对子项分别计算字面数组与两个映射输入集合。

```text
oursTokens = union(ours.map(command => [command.name, ...command.aliases]))
samePrimary = ours.filter(command => ref.some(other => other.name == command.name))
tokenOnly = ours - samePrimary，且 token(command) 与任一 token(ref) 相交
noToken = ours - samePrimary - tokenOnly
refNoToken = ref.filter(command => intersection(token(command), oursTokens).size == 0)
```

本轮实际用 AST 生成下方两表，并核对 `58/58/26`、`85/8/138`、`22/8/28` 和反向 `53`。这只证明文档计数，不证明命令运行成功。

## 2. Cheers 58 条注册定义

下表是 **registry metadata**，不是完整 handler 语法。`—` 表示未声明；“有”只表示有 `getArgumentCompletions`。例如 `/goal` 的注册提示仍是 `<goal instruction>`，不能推断 handler 只有一种形式。真实解析、交互拦截及补全见 [23](23-command-argument-options.md)。摘要保留注册原文以便复算；摘要与行为的已知偏差在第 4 节修正，不能以摘要证明功能。

| # | name | aliases | group / kind | argumentHint | 补全 | summary（注册原文） | execute 入口 |
|---|---|---|---|---|---|---|---|
| 1 | `diagnose` | `repo`, `changes` | `diagnostics` / `local` | — | 无 | repo-aware diagnosis and next action | [runDiagnoseCommand](../../packages/ts-shell/src/core/commands/localCommandRuntime.ts) |
| 2 | `compact` | `handoff` | `context` / `local` | `[preview\|render\|json]` | 有 | condense earlier turns into a checkpoint to free context | [runCompactLocalCommand](../../packages/ts-shell/src/core/commands/compactCommandRuntime.ts) |
| 3 | `warmup` | — | `context` / `local` | `[status\|rebuild]` | 有 | prebuild the startup context cache for this project | [runWarmupLocalCommand](../../packages/ts-shell/src/core/commands/warmupCommandRuntime.ts) |
| 4 | `browser` | — | `workspace` / `local` | `[status\|smoke\|preview\|execute\|replay\|repair]` | 有 | inspect the guarded browser capability and its receipts | [runBrowserLocalCommand](../../packages/ts-shell/src/core/commands/browserCommandRuntime.ts) |
| 5 | `sidebar` | — | `workspace` / `local` | `[snapshot\|panel\|compact\|detail]` | 有 | a snapshot of session state, tools, and checkpoints; run again to refresh | [runSidebarLocalCommand](../../packages/ts-shell/src/core/commands/sidebarCommandRuntime.ts) |
| 6 | `connect` | `providers` | `diagnostics` / `local` | `[status\|login\|set\|use\|logout]` | 有 | provider connection management | [runConnectCommand](../../packages/ts-shell/src/core/commands/connectCommandRuntime.ts) |
| 7 | `model` | `models` | `diagnostics` / `local` | `use <provider/model>` | 有 | inspect and switch active model | [runModelCommand](../../packages/ts-shell/src/core/commands/modelCommandRuntime.ts) |
| 8 | `restore` | — | `session` / `local` | `[preview\|execute]` | 有 | preview or execute guarded recovery authority restore | [runRestoreLocalCommand](../../packages/ts-shell/src/core/commands/restoreCommandRuntime.ts) |
| 9 | `tree` | — | `session` / `shell-action` | `[<entry-id>\|help]` | 无 | navigate the session tree, including other branches | [runTreeCommand](../../packages/ts-shell/src/core/commands/treeCommandRuntime.ts) |
| 10 | `entries` | — | `session` / `local` | `[<entry-id>\|tree [<entry-id>]\|help]` | 无 | read this session's entries, optionally after a cursor | [runEntriesCommand](../../packages/ts-shell/src/core/commands/entriesCommandRuntime.ts) |
| 11 | `resume` | `sessions`, `session` | `session` / `prompt` | `[list\|current\|switch\|help]` | 有 | pick, inspect, switch, or continue a session | [runResumeCommand](../../packages/ts-shell/src/core/commands/resumeCommandRuntime.ts) |
| 12 | `fork` | — | `session` / `prompt` | `[here\|sessionId]` | 无 | continue one session's conversation in a second, new session | [runResumeCommand](../../packages/ts-shell/src/core/commands/resumeCommandRuntime.ts) |
| 13 | `continue` | `c` | `session` / `prompt` | — | 无 | pick up this session's stopped work, optionally with a follow-up | [runContinuePromptCommand](../../packages/ts-shell/src/core/commands/promptCommandRuntime.ts) |
| 14 | `cancel` | — | `workflow` / `shell-action` | — | 无 | stop only the current run | [runCancelShellAction](../../packages/ts-shell/src/core/commands/shellActionRuntime.ts) |
| 15 | `workspace` | `where`, `project` | `workspace` / `shell-action` | `[status\|attach\|recent]` | 有 | inspect or switch project/workdir binding | [runWorkspaceShellAction](../../packages/ts-shell/src/core/commands/shellActionRuntime.ts) |
| 16 | `cd` | — | `workspace` / `shell-action` | `<path>` | 无 | quick attach by path | [runCdShellAction](../../packages/ts-shell/src/core/commands/shellActionRuntime.ts) |
| 17 | `pwd` | — | `workspace` / `shell-action` | — | 无 | print current workspace status | [runPwdShellAction](../../packages/ts-shell/src/core/commands/shellActionRuntime.ts) |
| 18 | `mcp` | — | `diagnostics` / `shell-action` | `[status\|tools\|doctor\|refresh]` | 有 | inspect and recover MCP state | [runMcpShellAction](../../packages/ts-shell/src/core/commands/shellActionRuntime.ts) |
| 19 | `help` | `?` | `diagnostics` / `shell-action` | — | 无 | show full command guide | [runHelpShellAction](../../packages/ts-shell/src/core/commands/shellActionRuntime.ts) |
| 20 | `exit` | `quit`, `q` | `session` / `local` | — | 无 | gracefully exit session and restore terminal | [runExitCommand](../../packages/ts-shell/src/core/commands/exitCommandRuntime.ts) |
| 21 | `permissions` | `approval-policy` | `diagnostics` / `shell-action` | `[list\|explain\|revoke\|reset]` | 有 | inspect trust policy state | [runPermissionsShellAction](../../packages/ts-shell/src/core/commands/shellActionRuntime.ts) |
| 22 | `clear` | `reset`, `cls` | `session` / `shell-action` | — | 无 | clear conversation context and start fresh | [runClearCommand](../../packages/ts-shell/src/core/commands/clearCommandRuntime.ts) |
| 23 | `review` | `audit`, `check` | `workflow` / `prompt` | `[focus]` | 无 | review working tree code changes and diffs | [runReviewCommand](../../packages/ts-shell/src/core/commands/reviewCommandRuntime.ts) |
| 24 | `reload` | — | `context` / `local` | — | 无 | re-read the configuration this session started with | [runReloadCommand](../../packages/ts-shell/src/core/commands/reloadCommandRuntime.ts) |
| 25 | `statusline` | `status` | `workspace` / `local` | `[list\|use <item...>]` | 有 | choose which facts the status band keeps in view | [runStatuslineCommand](../../packages/ts-shell/src/core/commands/statuslineCommandRuntime.ts) |
| 26 | `settings` | — | `workspace` / `local` | `[setting]` | 无 | open the settings panel, or name what a setting does | [runSettingsCommand](../../packages/ts-shell/src/core/commands/settingsCommandRuntime.ts) |
| 27 | `view` | — | `workspace` / `shell-action` | `[status\|user\|developer]` | 有 | inspect or switch between user and developer output | [runViewShellAction](../../packages/ts-shell/src/core/commands/shellActionRuntime.ts) |
| 28 | `theme` | — | `workspace` / `local` | `[name]` | 无 | list the available themes, or switch to one | [runThemeCommand](../../packages/ts-shell/src/core/commands/themeCommandRuntime.ts) |
| 29 | `trust` | — | `context` / `local` | `[status\|on\|off\|session]` | 无 | show or set what this project is allowed to contribute | [runTrustCommand](../../packages/ts-shell/src/core/commands/trustCommandRuntime.ts) |
| 30 | `init` | `setup` | `workflow` / `local` | — | 无 | inspect tech stack and initialize AGENTS.md rules | [runInitCommand](../../packages/ts-shell/src/core/commands/initCommandRuntime.ts) |
| 31 | `cost` | `tokens`, `stats` | `session` / `local` | — | 无 | display session token usage and estimated cost | [runCostCommand](../../packages/ts-shell/src/core/commands/costCommandRuntime.ts) |
| 32 | `undo` | — | `session` / `local` | — | 无 | report the most recent file edit and the command to revert it | [runUndoCommand](../../packages/ts-shell/src/core/commands/undoCommandRuntime.ts) |
| 33 | `export` | `save` | `session` / `local` | `[jsonl] [dest-path]` | 有 | export session history as markdown or jsonl | [runExportCommand](../../packages/ts-shell/src/core/commands/exportCommandRuntime.ts) |
| 34 | `skill` | `skills` | `workspace` / `local` | `[skill-name]` | 无 | the written-down ways of working this project and this user have | [runSkillCommand](../../packages/ts-shell/src/core/commands/skillCommandRuntime.ts) |
| 35 | `retry` | — | `session` / `shell-action` | — | 无 | run the last turn again after it failed or was interrupted | [runRetryCommand](../../packages/ts-shell/src/core/commands/retryCommandRuntime.ts) |
| 36 | `hotkey` | `hotkeys`, `keys` | `workspace` / `local` | — | 无 | every key this surface binds, and which ones this terminal delivers | [runHotkeyCommand](../../packages/ts-shell/src/core/commands/hotkeyCommandRuntime.ts) |
| 37 | `copy` | `cp` | `session` / `local` | `[text]` | 无 | copy last assistant response to clipboard | [runCopyCommand](../../packages/ts-shell/src/core/commands/copyCommandRuntime.ts) |
| 38 | `goal` | `objective`, `target` | `workflow` / `local` | `<goal instruction>` | 有 | manage active goal state machine and prevent goal drift | [runGoalCommand](../../packages/ts-shell/src/core/commands/goalCommandRuntime.ts) |
| 39 | `loop` | `ralph`, `autoloop` | `workflow` / `prompt` | `[attempts] <gate-command>` | 有 | run autonomous edit-and-verify loops until test pass | [runLoopCommand](../../packages/ts-shell/src/core/commands/loopCommandRuntime.ts) |
| 40 | `todo` | `tasks`, `checklist` | `workflow` / `local` | `[list\|add\|start\|done\|clear]` | 有 | manage structured task checklist and view progress | [runTodoCommand](../../packages/ts-shell/src/core/commands/todoCommandRuntime.ts) |
| 41 | `fast` | `turbo`, `speed` | `workflow` / `local` | `[on\|off\|toggle]` | 有 | toggle low-latency fast model tier on or off | [runFastCommand](../../packages/ts-shell/src/core/commands/fastCommandRuntime.ts) |
| 42 | `context` | `ctx`, `tokens-map` | `diagnostics` / `local` | — | 无 | visualize context window allocation and token categories | [runContextCommand](../../packages/ts-shell/src/core/commands/contextCommandRuntime.ts) |
| 43 | `btw` | `side`, `ask` | `session` / `local` | `<question>` | 无 | ask a quick side question out of band without history pollution | [runBtwCommand](../../packages/ts-shell/src/core/commands/btwCommandRuntime.ts) |
| 44 | `marketplace` | `marketplaces`, `market` | `workflow` / `local` | `[list\|add\|remove]` | 有 | manage and discover plugin marketplace sources | [runMarketplaceCommand](../../packages/ts-shell/src/core/commands/marketplaceCommandRuntime.ts) |
| 45 | `plugin` | `plugins` | `workflow` / `local` | `[list\|add\|remove\|search\|enable\|disable]` | 有 | record, list, enable, or disable extension registrations | [runPluginCommand](../../packages/ts-shell/src/core/commands/pluginCommandRuntime.ts) |
| 46 | `memory` | `mem`, `recall`, `retain` | `session` / `local` | `[inspect\|add\|recall\|use\|invalidate\|save\|review]` | 有 | inspect, search, retain, or invalidate persistent memory facts | [runMemoryCommand](../../packages/ts-shell/src/core/commands/memoryCommandRuntime.ts) |
| 47 | `workflow` | `wf`, `pipeline`, `dag` | `workflow` / `local` | `[list\|run\|status]` | 有 | inspect, run, or cancel multi-stage agentic workflows and DAG tasks | [runWorkflowCommand](../../packages/ts-shell/src/core/commands/workflowCommandRuntime.ts) |
| 48 | `web-research` | `deep-research`, `research`, `deep` | `workflow` / `local` | `<topic>` | 无 | collect public web source excerpts with fixed search queries | [runDeepResearchCommand](../../packages/ts-shell/src/core/commands/deepResearchCommandRuntime.ts) |
| 49 | `commit` | — | `workflow` / `prompt` | `[guidance]` | 无 | draft a commit message from the staged diff | [runCommitCommand](../../packages/ts-shell/src/core/commands/commitCommandRuntime.ts) |
| 50 | `tools` | — | `diagnostics` / `local` | `[tool-name]` | 无 | list available tools or inspect one in detail | [runToolsCommand](../../packages/ts-shell/src/core/commands/toolsCommandRuntime.ts) |
| 51 | `thinking` | `effort` | `diagnostics` / `local` | `[low\|medium\|high\|off]` | 有 | inspect or set reasoning effort for the next turn | [runThinkingCommand](../../packages/ts-shell/src/core/commands/thinkingCommandRuntime.ts) |
| 52 | `brainstorm` | `explore`, `brainstorming` | `workflow` / `prompt` | `[-i] [-s] <problem>` | 有 | multi-perspective design exploration and anti-pattern red-teaming | [runBrainstormCommand](../../packages/ts-shell/src/core/commands/brainstormCommandRuntime.ts) |
| 53 | `shell` | `sh`, `platform` | `workspace` / `local` | `[status\|use\|auto]` | 有 | inspect or switch the shell backend this session runs commands with | [runShellCommand](../../packages/ts-shell/src/core/commands/shellCommandRuntime.ts) |
| 54 | `log` | `logs` | `workspace` / `local` | `[tail\|path\|export\|clear]` | 有 | tail, locate, export, or clear the structured session log | [runLogCommand](../../packages/ts-shell/src/core/commands/logCommandRuntime.ts) |
| 55 | `crash` | `crashes` | `workspace` / `local` | `[--stack]` | 无 | list the recent runs that ended by falling over | [runCrashCommand](../../packages/ts-shell/src/core/commands/crashCommandRuntime.ts) |
| 56 | `timings` | — | `workspace` / `local` | — | 无 | how long each phase of startup took, when CHEERS_TIMING=1 was set | [runTimingsCommand](../../packages/ts-shell/src/core/commands/timingsCommandRuntime.ts) |
| 57 | `metrics` | — | `workspace` / `local` | `[lines]` | 无 | tool calls, timings, retries and compactions this session recorded | [runMetricsCommand](../../packages/ts-shell/src/core/commands/metricsCommandRuntime.ts) |
| 58 | `report` | — | `workspace` / `local` | `[path]` | 无 | write a scrubbed environment and crash report to attach to a bug report | [runReportCommand](../../packages/ts-shell/src/core/commands/reportCommandRuntime.ts) |

`/back` 不在上表，因为它由[交互注册适配层](../../packages/ts-shell/src/entrypoints/slashCommandRegistry.ts)注入。Phase 19 应让帮助、补全、模式可用性与真实路由共享描述，保留交互专有入口的显式边界。

## 3. 参考 85 条顶层声明

下表取自本地 oh-my-pi 的 7 个 `builtin-*.ts`。子项保留声明 token，包括 `memory` 的 `mm list` 等多词项；138 条声明不能拆词重新加总。空子项不表示不接受参数。`handle` 与 `handleTui` 的模式差异见[注册器](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-registry.ts)，不承诺 ACP、TUI、RPC 可用性相同。

| # | name | aliases | subcommands（声明） | 来源 |
|---|---|---|---|---|
| 1 | `security` | — | `plan`, `scan`, `status`, `cancel`, `scans`, `show`, `import`, `export`, `validate`, `compare`, `disposition` | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 2 | `settings` | — | — | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 3 | `setup` | `providers` | `providers` | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 4 | `plan` | — | — | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 5 | `plan-review` | — | — | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 6 | `vibe` | — | — | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 7 | `goal` | — | `set`, `show`, `pause`, `resume`, `drop`, `budget` | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 8 | `guided-goal` | — | — | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 9 | `loop` | — | — | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 10 | `queue` | — | — | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 11 | `model` | `models` | — | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 12 | `switch` | — | — | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 13 | `fast` | — | `on`, `ultra`, `off`, `status` | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 14 | `slow` | — | `on`, `off`, `status` | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 15 | `skillful` | — | `on`, `off`, `status` | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 16 | `extended-context` | — | `on`, `off`, `status` | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 17 | `computer` | — | `on`, `off`, `status` | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 18 | `ratchet` | — | — | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 19 | `prewalk` | — | `restart` | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 20 | `modelpreset` | — | `list`, `save`, `switch`, `delete` | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 21 | `effort` | — | `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, `auto` | [builtin-modes](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts) |
| 22 | `advisor` | — | `on`, `off`, `status`, `dump`, `configure` | [builtin-collaboration](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-collaboration.ts) |
| 23 | `export` | — | — | [builtin-collaboration](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-collaboration.ts) |
| 24 | `trace` | — | — | [builtin-collaboration](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-collaboration.ts) |
| 25 | `dump` | — | `all` | [builtin-collaboration](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-collaboration.ts) |
| 26 | `share` | — | — | [builtin-collaboration](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-collaboration.ts) |
| 27 | `collab` | — | `view`, `list`, `status`, `stop` | [builtin-collaboration](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-collaboration.ts) |
| 28 | `join` | — | — | [builtin-collaboration](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-collaboration.ts) |
| 29 | `leave` | — | — | [builtin-collaboration](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-collaboration.ts) |
| 30 | `browser` | — | `headless`, `visible` | [builtin-collaboration](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-collaboration.ts) |
| 31 | `copy` | — | — | [builtin-collaboration](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-collaboration.ts) |
| 32 | `open` | — | — | [builtin-collaboration](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-collaboration.ts) |
| 33 | `todo` | — | `edit`, `copy`, `expand`, `collapse`, `export`, `import`, `append`, `start`, `done`, `drop`, `rm` | [builtin-session](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts) |
| 34 | `session` | — | `info`, `delete`, `pin` | [builtin-session](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts) |
| 35 | `jobs` | — | `full` | [builtin-session](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts) |
| 36 | `usage` | — | `show`, `reset` | [builtin-session](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts) |
| 37 | `stats` | — | — | [builtin-session](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts) |
| 38 | `changelog` | — | `full`, `last` | [builtin-session](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts) |
| 39 | `hotkeys` | — | — | [builtin-session](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts) |
| 40 | `tools` | — | — | [builtin-session](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts) |
| 41 | `context` | — | — | [builtin-session](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts) |
| 42 | `extensions` | `status` | — | [builtin-session](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts) |
| 43 | `agents` | — | — | [builtin-session](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts) |
| 44 | `git` | — | — | [builtin-session](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts) |
| 45 | `hub` | — | — | [builtin-session](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts) |
| 46 | `branch` | `rewind` | — | [builtin-session](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts) |
| 47 | `fork` | — | — | [builtin-session](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts) |
| 48 | `tree` | — | — | [builtin-session](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts) |
| 49 | `login` | — | — | [builtin-session](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts) |
| 50 | `logout` | — | — | [builtin-session](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts) |
| 51 | `mcp` | — | `add`, `list`, `remove`, `test`, `reauth`, `unauth`, `enable`, `disable`, `smithery-search`, `smithery-login`, `smithery-logout`, `reconnect`, `reload`, `resources`, `prompts`, `notifications`, `help` | [builtin-session](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts) |
| 52 | `ssh` | — | `add`, `list`, `remove`, `help` | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 53 | `new` | — | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 54 | `fresh` | — | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 55 | `clear` | — | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 56 | `delete` | — | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 57 | `compact` | — | `soft`, `remote`, `snapcompact` | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 58 | `shake` | — | `elide`, `images`, `thinking` | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 59 | `handoff` | — | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 60 | `resume` | — | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 61 | `pin` | — | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 62 | `btw` | — | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 63 | `tan` | — | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 64 | `omfg` | — | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 65 | `cleanse` | — | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 66 | `retry` | — | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 67 | `debug` | — | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 68 | `memory` | — | `view`, `stats`, `diagnose`, `queue`, `sync`, `clear`, `reset`, `enqueue`, `rebuild`, `mm list`, `mm show`, `mm refresh`, `mm history`, `mm seed`, `mm delete`, `mm reload` | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 69 | `rename` | — | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 70 | `move` | — | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 71 | `wt` | `worktree` | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 72 | `add-dir` | — | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 73 | `remove-dir` | — | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 74 | `dirs` | — | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 75 | `exit` | — | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 76 | `restart` | — | — | [builtin-lifecycle](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts) |
| 77 | `marketplace` | — | `add`, `remove`, `update`, `list`, `discover`, `install`, `uninstall`, `installed`, `upgrade`, `help` | [builtin-marketplace](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-marketplace.ts) |
| 78 | `plugins` | `plugin` | `list`, `enable`, `disable` | [builtin-marketplace](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-marketplace.ts) |
| 79 | `reload-plugins` | — | — | [builtin-marketplace](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-marketplace.ts) |
| 80 | `skills` | — | `search`, `install`, `installed`, `update` | [builtin-skills](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-skills.ts) |
| 81 | `force` | `force:` | — | [builtin-control](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-control.ts) |
| 82 | `live` | — | — | [builtin-control](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-control.ts) |
| 83 | `record` | — | — | [builtin-control](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-control.ts) |
| 84 | `pause` | — | — | [builtin-control](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-control.ts) |
| 85 | `quit` | `q` | — | [builtin-control](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-control.ts) |

## 4. 会改变规划的语义修正

| 对照 | 已核对现状 | Phase 19 决定 |
|---|---|---|
| `/clear` / `/new` | Cheers 交互 `/clear` 创建新 session ID，保留旧非空会话；参考 `/clear` 保持原会话。 | 保持 Cheers 行为，`/new` 复用新会话路径；不再声称新会话需重启。 |
| `/rename` / `/delete` | Cheers 会话选择器已有重命名/删除，并非只有未消费的底层函数。 | 补 Slash 直达、解析与确认，复用 session owner。 |
| `/plan` | Shift+Tab 已切 Plan/Build，工具策略与子代理实际受限。 | 显式入口与结构化计划 UX 复用现有模式；不新建平行门禁，不强制所有任务先审批计划。 |
| `/queue` | 忙时普通输入已经进入 follow-up/steer。 | 补显式管理/撤回/反馈，复用现有队列。 |
| `/fast` / `/slow` | Cheers 当前只把 temperature 改为 0.2，没有切模型/设置 priority；低温不保证快。参考切 Provider 服务层。 | 修正契约并接真实能力；不支持时明确不可用，不用温度冒充服务层。 |
| `/goal` | 当前项目级 objective/phase 仅注入提示词，没有自治续跑与真实预算。 | 按用户决定实现会话自治、持续执行、暂停恢复与主子共享预算。 |
| `/permissions` / `/trust` / `/security` | 工具审批、项目内容信任、漏洞扫描是三个对象；参考 security 没有 settings 子项。 | 分域保留；新增安全分析，不重定向权限命令。 |
| `/review` / `/plan-review` / `/advisor` | 分别审查代码 diff、计划、持续回合。 | 保留各自对象/来源/输入快照，不互作别名。 |
| `/statusline` / `/extensions` | 只因 token `status` 相交。 | 保留 `/status` 现有语义，不改成扩展中心。 |
| `/init` / `/setup` | Cheers 检查项目并给规则建议；参考 setup 是 Provider 向导。原稿成熟多语言 CLI 脚手架未获证据。 | `/init` 管项目规则，Provider 向导归 `/connect`；保留现有 setup 别名语义。 |
| `/browser` / `/computer` | Cheers 管受控浏览器执行/回执；参考 browser 切 eval prelude 的显示方式，computer 切桌面 prelude。 | 不互作别名；桌面能力单列实质任务。 |
| `/undo` / `/branch` | 文件恢复指导不等于对话导航。 | 文件撤销与对话回溯分开，撤销单位按用户选择的一次已提交编辑操作。 |
| `/diagnose` / `/cleanse` | 只读诊断不等于自主写入修复。 | 修复链单列审批、执行和复验。 |
| `/commit` / `/git` | 同一 Git owner 已接通 staged/index/worktree、split diff 与 hunk；模型 commit 只拟消息并调用 host 绑定的 `git_commit`。 | stage/commit/merge/push 分别审批；原生读回与收据保存结果分开，未知远端写先 reconcile。 |
| `/wt` | 已复用 manager 与同 ID session rebind，复制精确 index/工作树/未跟踪内容并保留源。 | 当前 source read grant 和 destination deny 均检查；冲突/子模块/转换后 clean bytes 不匹配拒绝迁移；外改/replacement/ignored 用户文件保留。 |

证据：[新会话](../../packages/ts-shell/src/cli/runtime/session.ts)、[会话选择器](../../packages/ts-shell/src/cli/interactive/picker/session.ts)、[键位](../../packages/ts-shell/src/cli/interactive/keybindings.ts)、[工具策略](../../packages/ts-shell/src/core/query/toolPolicy.ts)、[忙时交互](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts)、[fast](../../packages/ts-shell/src/core/commands/fastCommandRuntime.ts)、[goal](../../packages/ts-shell/src/core/commands/goalCommandRuntime.ts)、[commit](../../packages/ts-shell/src/core/commands/commitCommandRuntime.ts)、[worktree](../../packages/ts-shell/src/core/workflow/gitWorktreeManager.ts)。其他语义审查见 [24](24-shared-command-parity.md)。

## 5. 53 个参考无词法交集项的 Phase 19 处置

“新增”指需增加对应产品能力；“复用增强”指已有能力需补入口/闭环；“独立对象”指不能错误重定向。全部是 Phase 19 任务，不是 53 项“完全缺失功能”。参考含义依据第 3 节声明及已审 handler；更细的 Provider/平台支持仍须在实施时证明，不能由一条声明推断全平台可用。

| # | 参考命令 | 处置与目标 | 必须交付的行为和验收 | Phase 19 任务 |
|---|---|---|---|---|
| 1 | advisor | 新增实时顾问 | 独立上下文/模型持续审查回合，反馈标来源和输入快照；共享预算/暂停/取消；失败可见，意见不产生写权限。 | AUTO-02/05 |
| 2 | trace | 增强 observability | 真实事件关联请求/工具/耗时，本地仪表盘默认 loopback、脱敏、可关闭；缺失 span 不冒充精确测量。 | PAR-04 |
| 3 | dump | 新增诊断导出 | 转录复制与显式请求诊断导出；默认脱敏，原始数据单独确认并限定本地目的地；截断/未采集可见。 | REM-02 |
| 4 | share | 新增异步分享 | 默认支持自托管；内容、访问者、有效期、脱敏预览、撤销与访问控制齐全；secret gist 不等于 ACL。 | REM-01/02 |
| 5 | collab | 新增实时 host | 认证会话，查看/提问/执行分权；共享不授权工具或主机写入；连接及审计可追踪。 | REM-01/03/05 |
| 6 | join | 新增实时 guest | 验证来源/身份/权限、防重放，重连按游标去重；远端提问保留来源，不当作本地授权。 | REM-01/03/05 |
| 7 | leave | 新增协作退出 | 撤销连接及临时权限，保留可解释转录；不误停 host 任务，未完成远端操作仍可查询。 | REM-03/05 |
| 8 | open | 增强链接操作 | 选定消息链接，校验允许协议后经系统打开边界；无链接/不可用/失败真实报告。 | PAR-01 |
| 9 | force | 新增受限工具选择 | 下一次请求一次性指定已存在且可用工具；不放大权限，不绕 Plan、沙箱或审批。 | PAR-05 |
| 10 | live | 新增实时语音 | 音频输入输出、打断、取消、会话关联、真实用量；按设备/Provider 明确可用性，录音与外发显式启用。 | MEDIA-01 |
| 11 | record | 新增录制回放 | 明确范围与敏感内容处理、开始/停止、回放格式、尺寸变化及中断恢复；默认不上传。 | MEDIA-02 |
| 12 | pause | 完整 goal 控制 | 主子任务和顾问停止新增调度并到安全点；区分暂停请求/已暂停，持久化可恢复状态，不假称任意 OS 进程无损冻结。 | AUTO-03、FLOW-01 |
| 13 | ssh | 新增远端执行 | 主机验证、隔离凭据引用、cwd 绑定、取消和回执；经现有执行接口接入，执行权限独立于共享权限。 | REM-04 |
| 14 | new | 复用新会话路径 | 复用 `/clear`，旧非空会话可恢复；当前运行按明确策略停止/等待，草稿不丢。 | SES-04 |
| 15 | fresh | 新增 Provider 状态控制 | 清理真实连接/游标/缓存 owner 而不改转录；无状态 Provider 返回无须重置，禁止虚报缓存已清。 | PAR-03 |
| 16 | delete | 复用会话删除 | Slash/picker 共享目标解析、预览确认、运行中处理和接续；不存在/歧义时不删除。 | SES-04 |
| 17 | shake | 新增定向上下文精简 | 预览工具结果/大块/图片等范围，保留持久历史及合法 tool pair/签名；节省量标估算。 | PAR-01 |
| 18 | pin | 新增会话置顶 | 持久标记、稳定排序、过滤后选择保持；删除和导入正确处理元数据。 | PAR-01 |
| 19 | tan | 增强后台旁路任务 | 独立上下文和生命周期，主会话继续；工作区冲突、输出归属、取消、预算、权限均可追踪。 | FLOW-01 |
| 20 | omfg | 新增规则提炼流 | 反馈生成规则提案，展示位置/diff，确认后走 stale-content 写入；投诉本身不是持久写授权。 | PAR-05 |
| 21 | cleanse | 独立诊断修复流 | 复用诊断/修复 owner，分配修改范围，批准后修复并复验；未消除诊断报告 partial。 | PAR-05、EDIT-02 |
| 22 | debug | 增强诊断入口 | 聚合已有日志/崩溃/耗时/指标和实际可用工具，不虚构 DAP/AST 调试器。 | PAR-04 |
| 23 | rename | 复用会话重命名 | Slash/picker 共用持久化；空参编辑/建议、重名和失败可见，模型标题标建议。 | SES-04 |
| 24 | move | 增强 session rebind | 保持 ID，迁移路径值及缓存身份；锁内重读、边界和补偿有证据，不直接改 cwd 冒充迁移。 | SES-05 |
| 25 | wt | 已接通 dirty 迁移 | 原生 create/switch/migrate/delete 与同 ID rebind；保留源 index/bytes，补偿只移除原身份的 clean owned checkout，ignored 用户文件保留。 | GIT-03，§10 |
| 26 | add-dir | 新增多根工作区 | 每根规范化、信任/读写权限独立，containment 使用授权根集合；新增根不自动扩大代理权限。 | SES-05 |
| 27 | remove-dir | 新增多根撤销 | 撤销未来访问、处理在途操作、失效缓存；不删除物理目录或静默重绑主根。 | SES-05 |
| 28 | dirs | 新增多根查看 | 显示主根/附加根/权限/失效状态，与增删同源，不能用单根 pwd 代替。 | SES-05 |
| 29 | restart | 新增受控重启 | 保存可恢复状态、处理在途任务、保留启动参数，兼容编译产物；重启与恢复分别举证。 | PAR-04 |
| 30 | reload-plugins | 增强插件生命周期 | 排空/取消实例、清理 hooks/tools/MCP/commands 后重建；版本及缓存一致，部分失败不报全成功。 | ECO-03、PAR-04 |
| 31 | security | 新增漏洞分析系统 | 扫描计划/执行/取消/历史、SARIF 导入导出、验证/对比/处置；外部分析器经执行 owner，规则来源和漏扫可见。 | SEC-01/02/03 |
| 32 | plan | 复用 Plan 模式 | 与 Shift+Tab 同一状态/门禁，增加计划产物、状态和退出入口，不新建平行模式。 | AUTO-04 |
| 33 | plan-review | 新增计划审查 UX | 打开指定版本，记录修改及批准对象；过期计划不可沿用批准，不重定向代码 review。 | AUTO-04 |
| 34 | vibe | 新增 director/worker 工作流 | director 可见工具收窄为读取/管理；持久 worker 可执行 session 已授权且显式委派的能力（可含写），继续受审批/沙箱/预算约束；退出终止 worker，不因模式自动放权。 | FLOW-02 |
| 35 | guided-goal | 新增目标澄清 | 收集目标/验收/可选预算/约束，形成可审阅目标后进入同一 goal owner；取消不暗中启动任务。 | AUTO-04 |
| 36 | queue | 复用输入队列 | 查看/追加/撤回 follow-up，明确 steer 与 yield 后投递；忙闲切换/取消/重放无丢失或重复。 | AUTO-04 |
| 37 | switch | 复用模型选择 | 统一解析后作 `/model` 快捷入口，默认 session；模型和思考等级联合校验，不另建配置路径。 | CFG-05、PAR-03 |
| 38 | slow | 新增真实服务层控制 | 与修正后的 fast 共用能力矩阵，显示费用/延迟语义和生效层；不支持则拒绝，不改温度冒充。 | PAR-03 |
| 39 | skillful | 增强技能注入策略 | 控制 session 技能目录提示注入，显示实际状态并可恢复；不卸载技能或改变执行权限。 | PAR-03 |
| 40 | extended-context | 新增窗口选择 | 仅暴露 Provider/模型支持的窗口，检查请求限制/预算/费用，保留压缩策略，不任意翻倍元数据。 | PAR-03 |
| 41 | computer | 新增受控桌面交互 | 平台适配、屏幕/窗口范围、敏感动作审批、取消及回执；与 browser 分域，无适配器明确 unavailable。 | TOOL-05 |
| 42 | ratchet | 新增评测优化流 | 固定 evaluator/基线/保留集、修改范围和预算；保存每轮证据、防指标投机，未达阈值不报成功。 | FLOW-03 |
| 43 | prewalk | 新增单次模型交接 | 参考是 @default 规划后在下一次 edit/write（todo-gated）交给 @smol，不是廉价先研；Cheers 明确触发/快照/接管/回退，一次性状态及用量可追踪。 | FLOW-02 |
| 44 | modelpreset | 新增模型预设 | 保存角色模型/思考等级和作用域，应用前整体验证，失败无半更新，恢复一致。 | PAR-03 |
| 45 | jobs | 增强后台任务视图 | 真实 ID/状态/输出/取消/预算；DAG、普通后台工具和子代理保留类型，不能互相冒充。 | FLOW-01 |
| 46 | usage | 独立额度入口 | 与估算 cost 分开，显示可得额度及未知；权益兑换预览实际消耗并确认，不承诺清任意 429。 | PAR-03 |
| 47 | changelog | 新增版本说明 | 绑定真实构建版本/发布记录，离线或无记录可解释，不把无法获取当最新版本。 | PAR-04 |
| 48 | agents | 增强角色配置面板 | 复用本地角色覆盖，接通 per-agent 模型/思考路由、来源和权限；不只编辑未被消费的字段。 | ECO-04 |
| 49 | git | 已接通完整 Git 面板 | staged/unstaged/untracked、split diff、文件/hunk stage/unstage、composer 与原生 commit/branch/merge/push/reconcile；源与执行身份绑定审批。 | GIT-01/02/04，§10 |
| 50 | hub | 新增实时代理总览 | 真实事件显示主子任务、顾问、依赖、预算、停止原因；与角色配置 agents 分清。 | FLOW-01 |
| 51 | branch | 增强对话分支 | 历史节点选择保留旧路径，摘要策略及失败可见；不触发文件撤销。 | PAR-01、SES-03 |
| 52 | login | 复用 Provider 登录 | 明确入口到 `/connect login`，复用认证 owner；Provider/账号/作用域明确，不近似匹配错账号。 | PAR-03 |
| 53 | logout | 复用 Provider 退出 | 复用 `/connect logout`，区分 session 解绑及持久凭据移除；外部失败不报已退出。 | PAR-03 |

`skills`、`marketplace`、`plugins` 因有词法交集而不在此表，**不代表公共生态已齐全**。完整公共技能商店已纳入 Phase 19：真实来源/查询、固定版本/完整性校验、安装审批、隔离脚本执行、升级/回滚/卸载和依赖审计均需交付，详见 [24](24-shared-command-parity.md)。


### 5.1 大型扩展的参考证据边界

| 能力 | 精确参考位置 | 已核对决定与 Cheers 取舍 |
|---|---|---|
| tan / jobs / hub | [TanCommandController.start](../../../oh-my-pi/packages/coding-agent/src/modes/controllers/tan-command-controller.ts#L42)、[jobs](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts#L323)、[hub](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts#L582) | tan 要求持久 session 与 async jobs，fork 时重置继承费用并修复中断尾部；jobs 读取实际 snapshot，hub 打开 activity。Cheers 采用任务归属和真实状态原则，不复制引用缓存/文件布局。 |
| prewalk / vibe | [prewalk handler](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts#L766)、[handleVibeModeCommand](../../../oh-my-pi/packages/coding-agent/src/modes/interactive-mode.ts#L5806) | prewalk 是 @default 规划到 @smol 写入的一次交接；vibe 与参考 plan/goal 互斥并保持输入顺序，收窄的是 director 的 active toolset；[worker runtime](../../../oh-my-pi/packages/coding-agent/src/vibe/runtime.ts#L9)明确 worker 仍是完整 task-executor 会话。Cheers 分清 director 可见工具与已授权委派能力，不把所有 worker 强制只读，也不因模式放大权限。 |
| ratchet | [prepareRatchet](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts#L251)、[命令投递](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts#L733) | 入口检查 eval/task 与 prelude 后投递 kickoff。固定 evaluator/保留集和防投机是 Cheers 的验收设计，不能声称只读此入口就证明参考已有全部保障。 |
| live | [handleLiveCommand](../../../oh-my-pi/packages/coding-agent/src/modes/interactive-mode.ts#L7733)、[LiveCommandController](../../../oh-my-pi/packages/coding-agent/src/modes/controllers/live-command-controller.ts#L30) | 与进行中的 STT 捕获互斥，挂载 realtime visualizer 并管理媒体 session、停止和 editor 恢复；不是协作 relay。Provider/硬件实际兼容性未在本轮运行。 |
| record | [toggleRecording](../../../oh-my-pi/packages/coding-agent/src/modes/interactive-mode.ts#L7700)、[recording owner](../../../oh-my-pi/packages/coding-agent/src/stream/recording.ts) | 启停 SessionRecorder，加载 StreamRedactor，显示路径和回放命令；不能由“存在 redactor”推断所有秘密必然被遮蔽，Cheers 须做敏感输入/终端转义专项验收。 |

## 6. 已完成的裁决与实施依赖

1. **命名**：保留现有主名与兼容 alias。唯一明确迁移是恢复 `/deep-research` 主名，`research/deep` 随新研究入口在同一发布迁移，并从轻量 `/web-research` collector 移除这些 alias；帮助说明行为变化，按 [15](15-deep-research-design.md) 分清两种能力。新增参考名称先校验语义，不批量重定向。
2. **别名展示**：空前缀按主命令去重；输入 alias 仍可匹配并回显所属命令。解析保留 raw 调用信息，尤其 `/recall`、`/retain`，折叠展示不改变执行。
3. **模型**：用户已选默认当前 session，随 session 保存供 resume；仅显式 `--global` 改全局默认。模型/思考等级完整验证后共同生效，失败无半更新。
4. **撤销**：用户已选最近一次已提交编辑操作，多文件 patch 算一组。先预览确认，再走 restore 权限/路径/stale-content/恢复链；确认不允许覆盖用户后续编辑，partial 与未验证保持可见。
5. **完整 goal**：实现持续执行、暂停/恢复、真实账本及完成证据。预算可省略：省略或 off 表示无目标累计 cap，不设默认 100k、不强制用户选择；每请求上下文/输出/重试/并发等约束仍生效。显式 N 必须由主子任务共享 reservation/admission/settlement，并发不能各用 N；暂停恢复保留 ID、累计消耗与上限，重放去重。旧项目级目标向 session 迁移需明确。
6. **大型系统**：完整 Git hunk 面板、实时 Advisor、安全分析、公共技能商店、远端协作/执行全部纳入 Phase 19，可分更多批次；批次表达依赖，不是移出范围。
7. **远端**：共享、执行、凭据分别授权；默认具备自托管能力，不默认外发公共 SaaS。具体内容/目的地决定审批与脱敏，启用协作不一次性授权所有操作。

参考 goal 并不证明硬预算已解决：[goals/runtime.ts](../../../oh-my-pi/packages/coding-agent/src/goals/runtime.ts) 缺省 unbounded，使用增量 `input + cacheWrite + output`，阈值在 usage flush 后判断并发 steer；[session-stats.ts](../../../oh-my-pi/packages/coding-agent/src/session/session-stats.ts) 还汇入已返回 task usage 和 model_usage，不能说完全没有子代理记账，但也不能说已有实时共享硬限。Cheers 的显式预算须单独证明请求前 reservation、并发 admission、结算及恢复去重，并准确标明本产品 token 口径。

建议依赖顺序：共享命令描述/解析/补全与已有 picker → 配置作用域/session 生命周期 → 预算/任务状态与 Plan/queue → Git/恢复/多根迁移 → Advisor/安全分析/公共商店 → 远端与多模态。可并行准备，依赖的权限/账本/持久状态未验证前不得声称上层完成。正式编号及总验收见 [Phase 19 决策](phase-19-decisions.md)。第 5 节每行已映射任务，FLOW/MEDIA 分别承担后台执行与真实媒体能力，不能由 PAR 总标题代替。

## 7. 验收与证据边界

- 每入口核对 metadata、帮助、补全、解析、真实 owner、交互/非交互可用性；返回面板或字符串不等于功能交付。
- 复用已有 14 个 picker，增强 busy/filter/cancel/draft 与错误状态，不新造平行 ModalHost。
- 实施时保留会在关键决定反转后失败的测试：raw alias、Plan 不放权、stale hunk 不暂存、撤销不覆盖外部修改、显式预算耗尽不再 admission。
- 用量、费用估算、目标预算和账单分开；缺失用量标未知并执行保守 admission，不能算零。
- 本轮只有 Markdown，做静态事实/计数/路径/差异核对；未运行 build/tests、PTY、网络或真实 Provider，不能据此声称功能可用。

## 8. SES-04 直达入口实施补充（2026-10-08）

`/new` 作为 `/clear` 别名、`/session new` 作为同一 shell action 已接通；`/rename [title...]` 管当前会话，`/delete <reference>` 与 `/session rename|delete` 管保存记录。帮助、语法和动态会话候选共用现有注册表；完整目录的 exact/prefix/title/last 匹配、确认与锁内复验归 session owner。非交互 delete 只预览，交互默认 Cancel，裸 rename 提供标题编辑。具体校验与交付边界见 [决策 §8.107](phase-19-decisions.md#8107-ses-04会话直达管理与完整目录匹配)；本文原始 58 条统计仍是规划基线，不作为当前注册数。

## 9. SES-05 workspace 实施补充（2026-10-08）

现有 `/workspace` 语法新增 `add <path> [--write]`、`remove <path>` 与 `rebind <path>`，解析、帮助、补全及交互/脚本入口共用描述；默认附加只读、写根仍经审批与 deny rules。`attach` 跨项目创建独立 session，`rebind` 迁移同一保存身份；附加根不接管配置、技能或 MCP 发现。持久继承、失效根撤权、busy/overlap/unknown 与动作前复验见 [决策 §8.108](phase-19-decisions.md#8108-ses-05持久多根授权与同会话工作区迁移)。

## 10. W9 Git/worktree 实施补充（2026-10-09）

`/git` 裸入口打开现有 panel；显式 `status` 返回原生状态，`diff <staged|unstaged|untracked> <path>` 共用 split report，`stage|unstage <path> [hunkId]` 绑定原始版本。`commit <message>`、`branch create|switch|delete <name>`、`merge <branch>`、`push <remote> <refs/heads/branch>` 各自进入普通审批，`reconcile <operationId>` 另行批准精确远端查询。`review [focus]` 共用逐请求只读审查，`goal` 转给现有 goal owner。

`/wt list|create <path> <branch>|migrate <path> <branch>|switch <path>|delete <path>` 与 `/worktree` alias 共用同一 owner。`/commit [guidance]` 的模型仅拟提交消息；host commit ID、原始 staged index、普通审批和原生 tree/parent/hash 读回决定实际结果。仅有原生 metadata/status 的受限路径显式显示 limited，diff/review/commit evidence/migration 需要当前 source read grants；nested 全仓迁移需要已有父仓 read root。收据保存 unknown 不抹去已发生的原生结果。能力边界及最终验收状态见 [Phase 19 §8.123](phase-19-decisions.md#8123-w9-git-01–04原生-git-工作台与保留源改动的迁移)。原始注册计数仍作为规划基线。
