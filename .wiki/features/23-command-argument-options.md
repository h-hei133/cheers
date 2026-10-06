---
title: "全命令参数与子命令选项呈现机制研究与声明式设计"
category: article
sources:
  - repo-audit-2026-10-05
  - packages/ts-shell/src/core/commands/registry.ts
  - packages/ts-shell/src/core/commands/syntax/projection.ts
  - packages/ts-shell/src/cli/interactive/slashSuggestions.ts
  - packages/ts-shell/src/presentation/tui/chrome/suggestions.ts
  - packages/ts-shell/src/cli/interactive/keymap.ts
  - oh-my-pi/packages/coding-agent/src/slash-commands/types.ts
  - oh-my-pi/packages/coding-agent/src/slash-commands/builtin-completions.ts
  - oh-my-pi/packages/coding-agent/src/slash-commands/builtin-registry.ts
  - oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts
  - oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts
  - oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts
  - pi/packages/coding-agent/src/core/slash-commands.ts
  - 18-input-slash-startup-context.md
created: 2026-10-05
updated: 2026-10-05
tags: [features, slash-commands, subcommand-options, autocomplete, tui, ux, gap-analysis]
summary: "复核 58 条调度命令的参数与补全现状，修正统计、词表与运行时语义；规定共享语法、原始 UTF-16 编辑区间、动态候选生命周期和提交边界，并纳入已确认的完整 Goal 与会话级 Model 决策。全部设计待 Phase 19 施工。"
confidence: high
---

# 全命令参数与子命令选项呈现机制研究与声明式设计

> **性质声明**：本轮仅修正文档。现状结论来自源码复核；doc 14/18 探针属于历史样本。设计、类型草图与验收项均待施工，不代表运行时已实现或测试已通过。总体排期与最终决策见 [Phase 19 决策](phase-19-decisions.md)。

---

## 1. 概述与设计边界

### 1.1 业务背景与问题定义

用户要求所有接受参数的命令，在 `/cmd ` 后显示清晰的合法选项或语法说明。[18](18-input-slash-startup-context.md) 的 `/goal` 个案暴露出描述缺失、错误替换范围和连续联想中断；本次覆盖全部调度命令。

缺少 provider、缺少规范动作、无法搜索别名、候选本身非法、二级/flag 不全和仅文案过时是不同缺陷。自由文本命令可以只有准确的 usage，不能为了覆盖率伪造候选。`/model use/list` 仍然合法，初版“已经废弃”的判断已撤回。

### 1.2 边界

- **本轮交付**：核对当前源码、修正研究、完成有证据的工程裁决，并把用户确认的范围转为 Phase 19 施工约束。
- **Phase 19 目标**：共享语法供 handler/parser/validator/help/completion 消费，多级参数与动态实体补全；新增动作在 owner 实现并通过验证后才进入候选。
- **范围已确认**：完整自主 `/goal`、深度研究、八种输入形态，以及完整 Git 分块暂存面板、实时顾问、安全分析、公共技能商店和远程协作均进入 Phase 19，可分批实施。不能用当前命令缺能力为由在本研究中默默延期。
- **证据边界**：修改文档不等于完成产品能力；新增动词、校验与持久化语义均属于运行时行为变更，不能称作零业务侵入。

## 2. Cheers 全量命令参数与补全覆盖审计（58 条命令全景）

### 2.1 审计方法与分类口径
审计对象为 Cheers 的命令调度与注册中枢：
- **注册表入口**：[packages/ts-shell/src/core/commands/registry.ts](../../packages/ts-shell/src/core/commands/registry.ts)（共注册 58 条命令，含 `diagnose` 至 `report`）；
- **补全字典层**：历史 argumentCompletions（当时为硬编码 `SUBCOMMAND_VALUES` 字典与专用动态 Provider；现已由领域 syntax 与[共享投影](../../packages/ts-shell/src/core/commands/syntax/projection.ts)取代）；
- **执行处理器层**：各命令对应的独立运行模块 `packages/ts-shell/src/core/commands/*CommandRuntime.ts` 及 `shellActionRuntime.ts`。

**判定分类口径**：

1. 调度注册表是 `createCommandRegistry()` 的 58 个命令；UI 投影另加 `/back`，得到 59 个主项，加 58 个别名共 117 个候选。doc 14 的 59/117 样本与该口径一致。
2. `argumentHint` 共 43 个，是显示元数据计数，不能直接当作真实参数命令数。按 Handler 有效语法分类，44 个命令接受参数；14 个不接受有效参数（其中 `/undo` 仅拦截已废弃参数）。
3. 26 个命令挂接 `getArgumentCompletions`，18 个参数型命令未挂接。无 provider 只说明没有参数候选源；自由文本若有完整 usage 也可满足提示需求。
4. 规范动作缺失、非法候选、别名不可检索、二级/flag 缺失和 hint 文案缺失分别记录。空查询不展示别名是可接受的收敛策略；别名仍应能按前缀找到，不计作缺少规范动作。
5. 下表 `argumentHint` 是当前注册值，保留其中已发现的过时内容；目标语法见 §5，不把现状表改写成尚未实现的新功能。

### 2.2 全量 58 条命令参数与补全审计总表（核心证据表）

以下表格对 Cheers 现役全部 58 条命令进行 1:1 穷举核实，交叉比对 `registry.ts` 注册元数据、`argumentCompletions.ts` 补全逻辑以及各底层 `*CommandRuntime.ts` 实际解析代码：

| # | 命令 | argumentHint | 是否有 Provider? | 词表与 Handler 匹配度 | 源码依据与审计现状剖析 |
|---|---|---|---|---|---|
| 1 | `/diagnose` | *(none)* | 否 | N/A (0-arg) | [localCommandRuntime.ts#L85](../../packages/ts-shell/src/core/commands/localCommandRuntime.ts)：纯 0 参数命令，签名声明 `_args`，直接运行本地仓库体检。 |
| 2 | `/compact` | `[preview\|render\|json]` | 是 (`subcommandCompletions("compact")`) | 匹配 | [compactCommandRuntime.ts#L22](../../packages/ts-shell/src/core/commands/compactCommandRuntime.ts)：Provider 提供 `preview/render/json`，Handler 完整支持，亦支持 `--preview` 等 flags。 |
| 3 | `/warmup` | `[status\|rebuild]` | 是 (`subcommandCompletions("warmup")`) | 匹配 | [startupWarmCommandContract.ts#L30](../../packages/ts-shell/src/context/startup/startupWarmCommandContract.ts)：Provider 提供 `status/rebuild`，Handler 契约严格校验这两项。 |
| 4 | `/browser` | `[status\|smoke\|preview\|execute\|replay\|repair]` | 是 (`subcommandCompletions("browser")`) | 规范动作已覆盖（Hint 漏标） | [commandContract.ts#L10](../../packages/ts-shell/src/browser/commandContract.ts)：Handler 实际支持 8 种模式 (`status/preview/dry-run/execute/replay/repair/runtime/smoke`)，Provider 完整提供 8 种，但 Hint 遗漏了 `runtime` 与 `dry-run`。 |
| 5 | `/sidebar` | `[snapshot\|panel\|compact\|detail]` | 是 (`subcommandCompletions("sidebar")`) | 别名检索未覆盖 | [sidebarLivePanelCommandContract.ts#L32](../../packages/ts-shell/src/presentation/sidebar/sidebarLivePanelCommandContract.ts)：Provider 提供 4 项；Handler 额外接受 `watch/live`；三者当前均只产生一帧只读快照，不表示实时刷新。 |
| 6 | `/connect` | `[status\|login\|set\|use\|logout]` | 是 (`subcommandCompletions("connect")`) | 规范动作已覆盖（Hint 漏标） | [connectCommandRuntime.ts#L20](../../packages/ts-shell/src/core/commands/connectCommandRuntime.ts)：Provider 提供了 8 项 (`status/list/presets/login/set/use/logout/help`)，Handler 全部实现，Hint 遗漏 `list`、`presets` 与 `help`。 |
| 7 | `/model` | `use <provider/model>` | 是 (`modelArgumentCompletions`) | 缺规范动作与二级约束 | [modelCommandRuntime.ts](../../packages/ts-shell/src/core/commands/modelCommandRuntime.ts#L42) 接受 `status/refresh/config/list/ls/use/set/help/--help/-h` 和直接模型 ID。Provider 漏 `refresh/config`；`use/list` 未废弃。当前二级补全仅以是否有空格判断，未验证前级动作。 |
| 8 | `/restore` | `[preview\|execute]` | 是 (`subcommandCompletions("restore")`) | 缺完整语法与拒绝规则 | [restoreCommandRuntime.ts](../../packages/ts-shell/src/core/commands/restoreCommandRuntime.ts#L34) 还接受 `records/all`、`ledger/workspace/authority` 和 `--record/--execute/--confirm/--dry-run` 等路径。未知首词当前默认 preview、未知 flag 可被忽略；不能称为严格解析。 |
| 9 | `/tree` | `[<entry-id>\|help]` | 否 | **无 Provider** | [treeCommandRuntime.ts#L10](../../packages/ts-shell/src/core/commands/treeCommandRuntime.ts)：Handler 明确解析 `<entry-id>`、`help` 与 `--help`，但完全没有挂接 Provider，用户无法获得任何补全。 |
| 10 | `/entries` | `[<entry-id>\|tree [<entry-id>]\|help]` | 否 | **无 Provider** | [entriesCommandRuntime.ts#L18](../../packages/ts-shell/src/core/commands/entriesCommandRuntime.ts)：Handler 解析 `help`、`tree` 或直接跟条目游标，但没有任何 Provider。 |
| 11 | `/resume` | `[list\|current\|switch\|help]` | 是 (`subcommandCompletions("resume")`) | 缺规范动作 fork 与 Hint 漏标 | [resumeCommandRuntime.ts#L15](../../packages/ts-shell/src/core/commands/resumeCommandRuntime.ts)：Provider 包含 8 项 (`list/current/switch/help/panel/ls/active/use`)，Hint 仅展示 4 项；Handler 还接受 `fork`。 |
| 12 | `/fork` | `[here\|sessionId]` | 否 | **无 Provider** | [resumeCommandRuntime.ts#L41](../../packages/ts-shell/src/core/commands/resumeCommandRuntime.ts)：Handler 接受 `here` 或具体会话 ID，但无 Provider 支持。 |
| 13 | `/continue` | *(none)* | 否 | **无 Provider** | [promptCommandRuntime.ts#L14](../../packages/ts-shell/src/core/commands/promptCommandRuntime.ts)：Handler 支持传入可选的 `sessionId` 及追加提示词，但 Hint 为空且无 Provider。 |
| 14 | `/cancel` | *(none)* | 否 | N/A (0-arg) | [shellActionRuntime.ts#L3](../../packages/ts-shell/src/core/commands/shellActionRuntime.ts)：纯 0 参数动作，终止当前运行中的 Agent Turn。 |
| 15 | `/workspace` | `[status\|attach\|recent]` | 是 (`subcommandCompletions("workspace")`) | 别名检索未覆盖 | [shellActionRuntime.ts#L14](../../packages/ts-shell/src/core/commands/shellActionRuntime.ts)：Provider 提供 3 项；Handler 额外接受 `current` (status)、`switch/use` (attach)、`projects` (recent)。 |
| 16 | `/cd` | `<path>` | 否 | **无 Provider** | [shellActionRuntime.ts#L46](../../packages/ts-shell/src/core/commands/shellActionRuntime.ts)：Handler 接受路径参数，但无文件/目录补全 Provider。 |
| 17 | `/pwd` | *(none)* | 否 | N/A (0-arg) | [shellActionRuntime.ts#L64](../../packages/ts-shell/src/core/commands/shellActionRuntime.ts)：纯 0 参数动作，打印当前工作区路径。 |
| 18 | `/mcp` | `[status\|tools\|doctor\|refresh]` | 是 (`subcommandCompletions("mcp")`) | 别名检索未覆盖 | [shellActionRuntime.ts#L93](../../packages/ts-shell/src/core/commands/shellActionRuntime.ts)：Provider 提供 4 项；Handler 额外接受 `diagnose` (doctor) 与 `reconnect` (refresh)。 |
| 19 | `/help` | *(none)* | 否 | N/A (0-arg) | [interactiveCommandRouter.ts#L280](../../packages/ts-shell/src/cli/interactive/interactiveCommandRouter.ts#L280)：输出帮助清单；可搜索面板是待实施目标。 |
| 20 | `/exit` | *(none)* | 否 | N/A (0-arg) | [exitCommandRuntime.ts#L15](../../packages/ts-shell/src/core/commands/exitCommandRuntime.ts)：纯 0 参数命令，安全退出程序。 |
| 21 | `/permissions` | `[list\|explain\|revoke\|reset]` | 是 (`subcommandCompletions("permissions")`) | 缺别名检索与 selector | [shellActionRuntime.ts](../../packages/ts-shell/src/core/commands/shellActionRuntime.ts#L159) 另接受 `status/remove/clear`；`revoke` 的动态值是授权 grant selector，不是任意工具名。 |
| 22 | `/clear` | *(none)* | 否 | N/A (0-arg) | [clearCommandRuntime.ts](../../packages/ts-shell/src/core/commands/clearCommandRuntime.ts#L4) 的 clear-session 动作新建会话并清除当前 transcript；`/reset` 是其别名，不是仅清理视口。 |
| 23 | `/review` | `[focus]` | 否 | **无 Provider** | [reviewCommandRuntime.ts#L22](../../packages/ts-shell/src/core/commands/reviewCommandRuntime.ts)：Handler 接受可选的自定义审查焦点，无 Provider。 |
| 24 | `/reload` | *(none)* | 否 | N/A (0-arg) | [reloadCommandRuntime.ts#L24](../../packages/ts-shell/src/core/commands/reloadCommandRuntime.ts)：纯 0 参数命令，重新读取磁盘配置文件。 |
| 25 | `/statusline` | `[list\|use <item...>]` | 是 (`subcommandCompletions("statusline")`) | 匹配（缺二级补全） | [statuslineCommandRuntime.ts#L17](../../packages/ts-shell/src/core/commands/statuslineCommandRuntime.ts)：Provider 提供 `list/use`，但 `use` 之后无法补全状态项 ID 列表。 |
| 26 | `/settings` | `[setting]` | 否 | **无 Provider** | [settingsCommandRuntime.ts](../../packages/ts-shell/src/core/commands/settingsCommandRuntime.ts#L13) 当前只解释 `attentionOnIdle/offline` 两项设置，不是通用键值编辑器；不得枚举后端不接受的所有配置键。 |
| 27 | `/view` | `[status\|user\|developer]` | 是 (`subcommandCompletions("view")`) | 别名检索未覆盖 | [shellActionRuntime.ts#L134](../../packages/ts-shell/src/core/commands/shellActionRuntime.ts)：Provider 提供 3 项；Handler 额外接受 `compact` (user) 与 `verbose/dev` (developer)。 |
| 28 | `/theme` | `[name]` | 否 | **无 Provider** | [themeCommandRuntime.ts](../../packages/ts-shell/src/core/commands/themeCommandRuntime.ts#L20) 使用主题目录；内置仅 `dark/light/dark-contrast/light-contrast`，外部来源见 §5.4。 |
| 29 | `/trust` | `[status\|on\|off\|session]` | 否 | **无 Provider** | [trustCommandRuntime.ts#L30](../../packages/ts-shell/src/core/commands/trustCommandRuntime.ts#L30) 预期这四项，但普通对象 `levels[action]` 会接受 `constructor/__proto__` 继承属性；存储也需运行时枚举校验，不能只补 Provider。 |
| 30 | `/init` | *(none)* | 否 | N/A (0-arg) | [initCommandRuntime.ts#L9](../../packages/ts-shell/src/core/commands/initCommandRuntime.ts)：当前无参数入口，初始化仓库指令与相关引导。 |
| 31 | `/cost` | *(none)* | 否 | N/A (0-arg) | [costCommandRuntime.ts#L34](../../packages/ts-shell/src/core/commands/costCommandRuntime.ts)：纯 0 参数命令，打印会话 Token 消耗。 |
| 32 | `/undo` | *(none)* | 否 | N/A (0-arg) | [undoCommandRuntime.ts#L30](../../packages/ts-shell/src/core/commands/undoCommandRuntime.ts)：主体为 0 参数，仅针对废弃的 `--hard/--discard` 输出迁移提示。 |
| 33 | `/export` | `[jsonl] [dest-path]` | 是 (`subcommandCompletions("export")`) | 缺格式与 flags | [exportCommandRuntime.ts](../../packages/ts-shell/src/core/commands/exportCommandRuntime.ts#L45) 支持 `markdown/md`、`jsonl`、`html` 与 `--outside`，当前补全只列 `jsonl`。 |
| 34 | `/skill` | `[skill-name]` | 否 | **无 Provider** | [skillCommandRuntime.ts](../../packages/ts-shell/src/core/commands/skillCommandRuntime.ts#L18) 解析技能目录时受 `noSkills/skillPaths` 与信任规则影响；候选应与实际可调用目录一致。 |
| 35 | `/retry` | *(none)* | 否 | N/A (0-arg) | [retryCommandRuntime.ts#L15](../../packages/ts-shell/src/core/commands/retryCommandRuntime.ts)：纯 0 参数动作，重试上前回合。 |
| 36 | `/hotkey` | *(none)* | 否 | N/A (0-arg) | [hotkeyCommandRuntime.ts#L12](../../packages/ts-shell/src/core/commands/hotkeyCommandRuntime.ts)：纯 0 参数命令，展示快捷键列表。 |
| 37 | `/copy` | `[text]` | 否 | **无 Provider** | [copyCommandRuntime.ts#L16](../../packages/ts-shell/src/core/commands/copyCommandRuntime.ts)：Handler 接受可选的自定义复制文本，无 Provider。 |
| 38 | `/goal` | `<goal instruction>` | 是 (`subcommandCompletions("goal")`) | 别名检索未覆盖 | [goalCommandRuntime.ts#L20](../../packages/ts-shell/src/core/commands/goalCommandRuntime.ts)：Provider 提供 `pause/resume/complete/clear`；Handler 额外接受 `done` 作为 `complete` 的别名。 |
| 39 | `/loop` | `[attempts] <gate-command>` | 是 (`loopArgumentCompletions`) | 数值建议与运行约束分离 | [loopCommandRuntime.ts](../../packages/ts-shell/src/core/commands/loopCommandRuntime.ts#L13) 中 `3/5/10` 是数值建议，不是封闭动作集；当前解析不等于已对真实循环次数实施强制预算。 |
| 40 | `/todo` | `[list\|add\|start\|done\|clear]` | 是 (`subcommandCompletions("todo")`) | 缺别名检索与 ID 校验 | [todoCommandRuntime.ts](../../packages/ts-shell/src/core/commands/todoCommandRuntime.ts#L132) 的 `start/done` 使用稳定 ID，非列表索引；当前 `parseInt("1junk")` 可误命中 1，需拒绝非法数字。 |
| 41 | `/fast` | `[on\|off\|toggle]` | 是 (`subcommandCompletions("fast")`) | 规范动作已覆盖，别名检索不全 | [fastCommandRuntime.ts](../../packages/ts-shell/src/core/commands/fastCommandRuntime.ts#L18) 当前接受 `on/off/toggle/enable/disable/1/0`，底层是温度偏好，不能据名称声称低延迟服务能力。 |
| 42 | `/context` | *(none)* | 否 | N/A (0-arg) | [contextCommandRuntime.ts#L30](../../packages/ts-shell/src/core/commands/contextCommandRuntime.ts)：纯 0 参数命令，打印上下文调试明细。 |
| 43 | `/btw` | `<question>` | 否 | **无 Provider** | [btwCommandRuntime.ts#L15](../../packages/ts-shell/src/core/commands/btwCommandRuntime.ts)：Handler 接受自由文本问题，无 Provider。 |
| 44 | `/marketplace` | `[list\|add\|remove]` | 是 (`subcommandCompletions("marketplace")`) | 缺参数语法与别名检索 | [marketplaceCommandRuntime.ts](../../packages/ts-shell/src/core/commands/marketplaceCommandRuntime.ts#L47) 当前 `add <name> <url>`、`remove <name>`，不是单个 URL 或 ID；另支持 `ls/rm/delete`。 |
| 45 | `/plugin` | `[list\|add\|remove\|search\|enable\|disable]` | 是 (`subcommandCompletions("plugin")`) | 缺别名检索 | [pluginCommandRuntime.ts](../../packages/ts-shell/src/core/commands/pluginCommandRuntime.ts#L184) 另接受 `ls/rm/install/uninstall/find`；安装、启用与发现能力不得因同义展示而混淆。 |
| 46 | `/memory` | `[inspect\|add\|recall\|use\|invalidate\|save\|review]` | 是 (`subcommandCompletions("memory")`) | 缺规范动作与准确语义 | [memoryCommandRuntime.ts](../../packages/ts-shell/src/core/commands/memoryCommandRuntime.ts#L80) 另有 `list/approve/reject/wake/delete/status` 等合法动作。`delete` 与 `invalidate`、`wake` 与有 query 的 `recall` 不等价；见 §3.2、§5.2。 |
| 47 | `/workflow` | `[list\|run\|status]` | 是 (`subcommandCompletions("workflow")`) | 别名检索未覆盖 | [workflowCommandRuntime.ts#L24](../../packages/ts-shell/src/core/commands/workflowCommandRuntime.ts)：Provider 提供 3 项；Handler 额外接受 `templates` (list) 与 `start` (run)。 |
| 48 | `/web-research`| `<topic>` | 否 | **无 Provider** | [deepResearchCommandRuntime.ts#L18](../../packages/ts-shell/src/core/commands/deepResearchCommandRuntime.ts)：Handler 接受调研主题，无 Provider。 |
| 49 | `/commit` | `[guidance]` | 否 | **无 Provider** | [commitCommandRuntime.ts#L20](../../packages/ts-shell/src/core/commands/commitCommandRuntime.ts)：Handler 接受提交指导意见，无 Provider。 |
| 50 | `/tools` | `[tool-name]` | 否 | **无 Provider** | [toolsCommandRuntime.ts](../../packages/ts-shell/src/core/commands/toolsCommandRuntime.ts#L22) 优先使用 `context.getToolPool()`，core registry 仅 fallback；候选须反映当前可用工具池。 |
| 51 | `/thinking` | `[low\|medium\|high\|off]` | 是 (`subcommandCompletions("thinking")`) | 规范偏好已覆盖，别名检索不全 | [thinkingCommandRuntime.ts](../../packages/ts-shell/src/core/commands/thinkingCommandRuntime.ts#L51) 还支持 `auto/none`；`off` 清除 effort 偏好并交由 provider 决定，不保证关闭推理。 |
| 52 | `/brainstorm` | `[-i] [-s] <problem>` | 是 (`subcommandCompletions("brainstorm")`) | 匹配（缺 flags） | [brainstormCommandRuntime.ts#L18](../../packages/ts-shell/src/core/commands/brainstormCommandRuntime.ts)：Provider 提供 `[-i, -s]`；Handler 亦接受 `-h/--help`。 |
| 53 | `/shell` | `[status\|use\|auto]` | 是 (`shellArgumentCompletions`) | 缺别名与二级约束 | [shellCommandRuntime.ts](../../packages/ts-shell/src/core/commands/shellCommandRuntime.ts#L47) 另接受 `diag/info/set/reset`；`reset` 对应 auto。当前二级补全未校验前级必须为 use/set。 |
| 54 | `/log` | `[tail\|path\|export\|clear]` | 是 (`subcommandCompletions("log")`) | 匹配（缺行数选项） | [logCommandRuntime.ts#L20](../../packages/ts-shell/src/core/commands/logCommandRuntime.ts)：Provider 提供 4 个动作词；Handler 亦接受纯数字作为行数限制。 |
| 55 | `/crash` | `[--stack]` | 否 | **无 Provider** | [crashCommandRuntime.ts#L20](../../packages/ts-shell/src/core/commands/crashCommandRuntime.ts)：Handler 明确接受 `--stack` 参数，但无 Provider。 |
| 56 | `/timings` | *(none)* | 否 | N/A (0-arg) | [timingsCommandRuntime.ts#L13](../../packages/ts-shell/src/core/commands/timingsCommandRuntime.ts)：纯 0 参数命令，打印启动耗时打点。 |
| 57 | `/metrics` | `[lines]` | 否 | **无 Provider** | [metricsCommandRuntime.ts#L16](../../packages/ts-shell/src/core/commands/metricsCommandRuntime.ts)：Handler 接受可选日志行数限制（如 500/1000/2000），无 Provider。 |
| 58 | `/report` | `[path]` | 否 | **无 Provider** | [reportCommandRuntime.ts#L20](../../packages/ts-shell/src/core/commands/reportCommandRuntime.ts)：Handler 接受自定义输出目标及 `--outside`，无 Provider。 |

---

### 2.3 精确统计与分类

| 口径 | 数量 |
|---|---:|
| 调度命令 / aliases | 58 / 58 |
| UI 主项（增加 `/back`）/ 展开别名后的 UI 候选 | 59 / 117 |
| 声明 `argumentHint` / 挂接 completion provider | 43 / 26 |
| 有效参数型 / 无有效参数型 | 44 / 14 |
| 参数型中无 provider | 18 / 44（40.9%） |

- **14 个无有效参数命令**：diagnose、cancel、pwd、help、exit、clear、reload、init、cost、undo、retry、hotkey、context、timings。`undo` 不因拦截废弃 flags 被重复计入参数型。
- **26 个 provider**：compact、warmup、browser、sidebar、connect、model、restore、resume、workspace、mcp、permissions、statusline、view、export、goal、loop、todo、fast、marketplace、plugin、memory、workflow、thinking、brainstorm、shell、log。
- **18 个无 provider 参数命令**：tree、entries、fork、continue、cd、review、settings、theme、trust、skill、copy、btw、web-research、commit、tools、crash、metrics、report。

初版的 provider 缺失/覆盖计数及笼统的“实质脱节比例”均撤回：`undo` 重复分类、`log` 漏计，而且缺少别名空查询展示不能等同于运行能力缺失。

## 3. 已确认缺陷与语义纠错

### 3.1 提示覆盖、描述与状态

`argumentCompletions.ts` 的裸字符串字典没有给大部分静态动作生成 `detail`；固定 `trust/crash`、实体 `theme/skill/tools`、会话 `tree/entries/fork` 等缺候选，自由文本 `btw/review/copy` 缺清楚的语法提示。后二者所需展示形式不同，不能强制每个命令都有至少一个选项。

现有 prefix filter 无匹配即返回 `null`，`interactiveMode.ts` 关闭浮层；例如 `/goal s` 在当前动作集中无匹配。这证明 helper 状态缺失，不证明应把全部不匹配项继续作为合法候选。设计应提供无匹配、加载、不可用、无权限等状态与所属语法。

### 3.2 运行时词表与含义

- **Model**：`use/list` 合法，补全真正漏 `refresh/config` 等动作；现有 model/shell 动态补全只以空格为条件，能在错误动作后给出实体，应按解析位置过滤。
- **Memory**：`delete` 调用删除，`invalidate` 调用失效；`wake` 可无 query，`recall/search` 需要 query。`use [query]` 读取后只 `markPending`，结果为 staged、无 provider 调用和持久化，等待下一正常 turn 注入，不能描述成“已注入”。`save <candidate-id|approved>` 才显式持久化；approve/reject 只改变会话 review。status 查询保存/审批状态，不是注入状态机。依据见 [memoryCommandRuntime.ts](../../packages/ts-shell/src/core/commands/memoryCommandRuntime.ts#L140)、[use runner](../../packages/ts-shell/src/memory/projectMemoryUseCommandRunner.ts)、[delete runner](../../packages/ts-shell/src/memory/projectMemoryDeleteCommandRunner.ts)、[save contract](../../packages/ts-shell/src/memory/projectMemorySaveCommandContract.ts) 和 [review contract](../../packages/ts-shell/src/memory/projectMemoryReviewCommandContract.ts)。
- **别名调用**：顶层 `/recall`、`/retain` 由 `rawCommandName` 走 core/memory；`/memory recall` 等走 project memory。展示层归属不等于运行语义等价，不能归一化后丢弃 invocation。
- **清会话**：`/reset` 属于 `/clear`，会建立新会话并清除当前 transcript；前缀 `/res` 的候选接受不能触发该动作。
- **其他**：export 当前已支持三种格式；todo 使用稳定 ID；thinking 的 off 清除偏好；sidebar 的 watch/live 当前是一次快照；loop 数值建议不是执行预算证明。逐项事实保留在 §2.2。

### 3.3 草稿替换缺陷

[slashSuggestions.ts](../../packages/ts-shell/src/cli/interactive/slashSuggestions.ts#L35) 使用 `draft.trimStart()` 匹配后，直接投影没有编辑范围的参数候选。[keymap.ts](../../packages/ts-shell/src/cli/interactive/keymap.ts#L391) 在没有 `from` 时用候选覆盖整行；有 `from` 的分支也丢弃后缀。

因此 `/goal ` 接受 `pause` 可变成 `pause `。只补 `from = commandName.length + 1` 仍不够：它假定单空格、多级值会覆盖前级动作、光标居中会截断后缀，还可能混用 provider 相对偏移与原始绝对偏移。原初版相关可直接粘贴的伪实现已删除，统一采用 §4 的范围契约。

### 3.4 连续联想与执行边界

[keymap.ts](../../packages/ts-shell/src/cli/interactive/keymap.ts#L395) 接受主命令后关闭菜单且未重算参数候选。另一方面，视觉首项高亮与 `chosen=moved` 不同，导致 `/res` Enter 直接提交未完成草稿。修复须区分命令名、参数和文件候选；用完整语法判断提交合法性，不能用 `trim()` 与候选字符串相等替代 parser。

## 4. 统一语法与补全契约（待施工）

### 4.1 语法归属与参考决策

每个命令领域拥有自己的语法定义，并共同供 handler/parser/validator/help/completion 使用。注册表与入口只做投影；禁止保留独立 `SUBCOMMAND_VALUES`、手写 help 词表与 Handler 分支三套真相。

语法节点应区分固定动作、flag、位置参数、数值建议、自由文本和动态实体，并声明重复性、必填性、取值约束及动作语义。`usage` 是渲染结果，不作为 parser 输入；`usage.split(" ")` 无法表达引号、多值、可选项或原始 shell/prose。

参考决定及本项目取舍：

| 来源 | 具体决定 | Cheers 的决定 |
|---|---|---|
| [oh-my-pi types](../../../oh-my-pi/packages/coding-agent/src/slash-commands/types.ts)、[builtin-completions](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-completions.ts) | 子命令携带 description/usage，派生候选与行内提示 | 采用单源描述；进一步让运行时解析共同消费，避免仅把重复字典换成对象数组 |
| [pi autocomplete](../../../pi/packages/tui/src/autocomplete.ts) | 命令级 Awaitable 动态候选 | 采用可取消异步实体查询，增加草稿/上下文版本保护 |
| [Codex command popup](../../../codex/codex-rs/tui/src/bottom_pane/command_popup.rs) | 空查询隐藏 alias，非空参与过滤 | 采用展示收敛；保留 raw invocation，不能合并不等价路由 |
| 参考一级补全的“出现空格即退出” | 将后续参数交给另一 provider | 不机械照搬；共享解析位置支持多级 token、flags 与光标居中补全 |

[arguments.ts](../../packages/ts-shell/src/core/commands/arguments.ts) 与 [slashRouter.ts](../../packages/ts-shell/src/core/commands/slashRouter.ts) 的现有引号、转义和 raw 参数路径必须纳入兼容测试。编辑期可容忍半个引号或未完成 token，提交期必须拒绝未知 flags、缺值、额外参数和非法数字；自由文本与 shell command 的原始内容不能通过重新拼接无损以外的方式改写。

### 4.2 编辑范围与请求版本

以下为目标契约草图，不是当前已实现的 API：

```typescript
interface CompletionRequest {
  readonly draft: string;
  readonly cursor: number; // 原始草稿 UTF-16 offset
  readonly draftRevision: number;
  readonly contextRevision: number; // 项目、会话、权限或运行配置变化
  readonly catalogRevision: number; // 本次候选所依赖目录的版本
  readonly rawCommandName: string;
  readonly invocation: string; // owner 定义的调用形态，不由 UI 任意归一化
  readonly signal: AbortSignal;
}

interface CompletionEdit {
  readonly from: number;
  readonly to: number; // 原始草稿中的半开区间 [from, to)
  readonly insertText: string;
  readonly cursorAfter: number;
  readonly sourceCursor: number;
  readonly draftRevision: number;
  readonly contextRevision: number;
  readonly catalogRevision: number;
}
```

候选还需稳定 ID、类型（command/argument/file）、label、description，以及当前解析位置的合法 usage。范围必须来自未 trim 的原始草稿，满足 `0 <= from <= to <= draft.length`，不得截断 UTF-16 surrogate pair；编辑器字素定位与 UTF-16 偏移之间必须明确转换。

应用仅在 cursor 和全部 revision 仍匹配时发生：

```typescript
// 前置：候选仍有效，范围、字素边界与 cursorAfter 均已校验。
const nextDraft = draft.slice(0, edit.from)
  + edit.insertText
  + draft.slice(edit.to);
```

空格由语法产生的 edit 决定；已有分隔符不得重复添加。不能由 provider 和 keymap 各补一次空格。多空格、制表符、前导缩进、引号及 suffix 必须保留；provider 若返回局部 span，只能在 adapter 显式换算一次。

### 4.3 候选状态、缓存和异步生命周期

结果区分 `ready`、`no-match`、`loading`、`unavailable`、`denied`；自由文本位置可为 `usage-only`。空数组不等于“有候选”，也不应触发可接受高亮项。

动态候选优先读 owner 的已加载快照；缺数据时允许受控异步读取，具备取消、超时、数量上限、版本校验和错误状态。新输入、光标移动、切换项目/会话、权限变化、目录刷新时取消旧请求，迟到结果丢弃；不能虚构当前已存在统一全局缓存，也不能每次击键深度扫盘或发网络请求。取得候选不产生安装、认证或持久化副作用。

### 4.4 接受、提交与 helper

- Tab 始终只应用候选编辑。Enter 接受候选时也只改草稿；已有完整合法调用如 `/help` 可单次 Enter 显式提交。
- `/res` 接受首项 `/reset` 后本次不执行新会话动作。完整命令的合法性由语法和当前上下文判断，不能依赖选中项是否被方向键移动过。
- 主命令或参数补全后重新解析新草稿与 cursor，展示下一个合法位置；禁止 `getSlashCommand(newDraft.trim())` 解析含参草稿。
- helper/ghost 跟随实际高亮候选与动态语法，不从未选中的第一个前缀推测。无后续参数不显示占位；自由文本只给说明；加载/权限不足不伪造实体。
- 空查询隐藏别名；非空前缀允许匹配。仅语义等价 alias 可统一展示规范名，不等价 invocation 必须保留调用方式。

## 5. 逐命令语义与产品决定（待施工）

### 5.1 `/goal`：完整自主模式，用户已确认

Phase 19 实现 `set/show/pause/resume/drop/budget`，含持续执行、暂停恢复和共享真实预算。用户未填写预算时不设总 token 上限，不要求先填预算，也不默认 100k；`budget N` 才设置主代理、子代理、顾问及重试共享的显式上限，`budget off` 取消该上限。单次请求、上下文容量、取消和其他真实运行边界仍然有效。预算本阶段落地，不能只补菜单或延期。

- 保留裸 `/goal` 查询和旧裸 objective。新保留字冲突用显式 `set <objective>` 或 `-- <objective>` 表达，不静默改写旧文本含义。
- `complete/done` 保留用户明确确认完成语义并记录来源；模型的完成声明本身不是验证证据。
- `drop` 放弃运行，`clear` 清理当前目标引用；两者与完成分离。保留必要的目标 ID、终止原因和历史审计，不将清理变成伪完成。
- `budget <tokens|off>` 的数值须严格校验；限制对象是同一目标下所有主代理、子代理、顾问与重试请求。执行前预留、完成后结算，并发不能超卖；取消、崩溃和恢复不能重置累计。usage 未知保留未结算状态，不能按 0 扣除。预算耗尽是停止原因，非完成。
- 暂停后阻止新的自主请求，处理在途请求与已开始写操作的真实结果；恢复同一目标身份及剩余预算。具体可恢复性与预算口径按 [Phase 19 决策](phase-19-decisions.md) 实现并验收。

### 5.2 `/memory`：保留不同动作及写入证据

| 规范动作 | 合法别名/参数 | 语义与候选依据 |
|---|---|---|
| `inspect` | `stats` | 存储信息与统计 |
| `add` | `retain`、事实文本 | 当前通过 `executeMemoryRetain` 走 core memory 显式保留路径，不能混成 project review candidate；持久化结论由 runner 的真实结果决定 |
| `list` / `review` | 按 review owner 的语法 | 展示候选；包含稳定 candidate ID |
| `approve` / `reject` | candidate 选择器 | 改变会话 review 状态；不等于 save |
| `recall` | `search`、必需 query | 读取项目记忆；不与无 query 的 wake 合并 |
| `wake` | 独立动作 | 使用 wake 契约准备读取，不伪造 query |
| `use` | `[query]` | 暂存下一正常 turn 的注入，结果 staged；不是 `<record-id>` 激活 |
| `invalidate` | record ID | 标为失效，不物理删除 |
| `delete` | record ID | 独立删除语义，不作为 invalidate 别名 |
| `save` | `<candidate-id\|approved>` | 显式持久化已批准候选 |
| `status` | 保存/审批状态 | 不描述为注入状态机 |

candidate ID、record ID 和 query 是不同参数种类，动态 provider 不能混用。只读 store 仍可支持 recall/use；save/delete/invalidate 等写动作必须遵守其真实写权限。顶层 `/recall` 与 `/retain` 保留 raw route，不因表中子命令 alias 关系被改写。

### 5.3 其他关键决定

| 命令 | Phase 19 决定与目标约束 |
|---|---|
| `/model` | 用户已确认：默认切换仅作用当前会话，并持久化到会话供 resume；显式 `--global` 才改变全局默认。保留 `use/set` 与直接 ID、`list/ls`、status/refresh/config/help。目录候选按合法位置生成，无全局泄漏；不能声称“完全不落盘”。 |
| `/undo` | 用户已确认：最近一次已提交的编辑操作为默认单位，一次多文件 patch 是一组。先展示受影响文件并确认，拒绝覆盖后来手动修改；废弃 hard/discard 不变成候选。 |
| `/fast` | 当前温度偏好不得假称极速服务。Phase 19 的 on/off/status 与可用高性能档位遵循真实 provider 能力；参考 oh-my-pi 的 fast 是 service tier，不能断言一定切专用模型。`ultra` 只有后端实现并支持时才可选，能力不足明确不可用，不产生成功假象。 |
| `/todo` | 保留 list/add/start/done/clear 与 complete 别名，start/done 参数是稳定 ID。严格拒绝 `1junk` 等非法数字。完整编辑、导入导出和视图能力依总体 Phase 19 批次接入，只有已实现动作可出候选。 |
| `/marketplace`、`/plugin` | 公共技能商店与包生命周期均纳入 Phase 19。保留当前源管理 `add <name> <url>`、`remove <name>`；发现、安装、升级、卸载等由领域 owner 定义，不把目标描述成当前已有。安装/启用不是同一状态。 |
| `/browser` | 保留现有 8 模式及其只读/preview/受控执行边界；headless/visible 是独立显示维度，不能替换执行模式或授予写权限。 |
| `/export` | 提供 markdown（md）、jsonl、html 三格式及路径/`--outside`；导出路径允许文件名，不能套用仅目录候选。 |
| `/permissions` | list/status、explain、revoke/remove、reset/clear；revoke 提供当前 grant selector。选择候选不撤销或创建授权。 |
| `/restore` | 从实际 parser 建完整语法；preview/execute、record/records、scope 与 flags 分开。新增严格拒绝规则有行为影响，先建立旧行为证据，再迁移。补全不得自动插入 execute/confirm 或替代写入确认。 |
| `/thinking` | low/medium/high，以及 off/auto/none 的既有兼容关系；说明是 effort 偏好，off 不保证 provider 不推理。 |
| `/loop` | 3/5/10 是建议数值；解析 attempts 与运行时真正限制循环分开验证，不用菜单证明已有预算守卫。 |
| `/sidebar` | snapshot/watch/live 当前单帧；完整实时面板由 Phase 19 实现后再改变说明，保留 panel/compact/detail 的具体显示语义。 |

### 5.4 动态实体目录与合法位置

| 位置 | 实际候选来源与约束 |
|---|---|
| `/theme [name]` | [themes/index.ts](../../packages/ts-shell/src/presentation/themes/index.ts) 内置 `dark/light/dark-contrast/light-contrast`；用户 `userDataSearchDirsFor(...)/themes`、项目 `.agents/themes` 及 CLI `extraPaths`。不虚构 claude/dracula 或 `.cheers/themes`；外部主题属于目录结果。 |
| `/skill [name]` | 与 `resolveSkillCatalog` 相同的 workspace、noSkills、skillPaths、信任过滤和版本；只展示实际可调用技能，不每键扫描。 |
| `/tools [name]` | 优先当前 `context.getToolPool()`；core registry 仅 fallback。动态 MCP/其他工具与执行可见性保持一致。 |
| `/model use/set <id>` / 直接 ID | 当前已加载模型 catalog 与会话配置，刷新后版本失效；status/help 后不误显示 ID。 |
| `/shell use/set <backend>` | 合法 backend 与平台可用性；diag/info 为 status 兼容、reset 为 auto 兼容。 |
| `/statusline use <item...>` | 合法全集为 [chrome/items.ts](../../packages/ts-shell/src/presentation/tui/chrome/items.ts) 的 `STATUS_ITEMS`；`readStatusItems()` 仅为已选项。正确 ID 如 directory/branch，不伪造 cwd/git。已选项按重复规则过滤。 |
| `/permissions revoke <selector>` | 当前授权账本的 grant selector，含权限/上下文版本，不能用工具名代替。 |
| `/tree`、`/entries`、`/fork`、`/resume` | 当前会话/entry 目录及动作所需稳定 ID；切会话或项目后候选失效。 |
| `/cd`、`/workspace attach` | 仅目录，保留引号、空格与路径边界；`/report`、`/export` 支持文件目标并保留现有 outside 授权规则。 |
| `/workflow run/start` | 实际可运行模板目录，不虚构任意工作流名。 |
| `/settings` | 当前仅输出已支持设置说明；通用配置编辑由配置 owner 的 Phase 19 工作实现后再接入。 |

### 5.5 其余动作与自由文本

- `/connect`：status/list/presets/login/set/use/logout/help；候选不触发认证或读取展示秘密，详细参数与连接 owner 共用语法。
- `/workspace`：status/current、attach/switch/use、recent/projects；`/mcp` 保留 status/tools/doctor/refresh 与 diagnose/reconnect，仅在支持 server 参数的位置给对应目录。
- `/view`：status/user/developer 与 compact/verbose/dev；`/trust`：status/on/off/session，说明分别对应实际持久化或会话范围。
- `/compact`：preview/render/json 及真实 flags；`/warmup`：status/rebuild；`/log`：tail/path/export/clear 与合法行数；`/crash --stack`、`/metrics [lines]` 的数字和 flags 都经严格校验。
- `/brainstorm`：-i/-s 及当前 help 语法，保留自由问题文本；不能因 flags 枚举重排正文。
- `/continue`、`/review`、`/copy`、`/commit`、`/btw`、`/web-research` 给准确 usage 和必需参数错误；自由文本位置允许无候选。深度研究的新结构参数由研究 owner 统一接入。
- 其余无参数命令给行为说明和显式提交，不因无参数而自动执行。

## 6. 集成顺序、迁移与边界（待施工）

1. **先行为测试与局部修复**：复现整行覆盖、suffix 丢失、错位空格、/res Enter、alias invocation 等真实缺陷，再引入完整范围与版本保护。
2. **逐 owner 迁移共用语法**：从固定动作到 flags、位置参数与实体目录，覆盖 parser/handler/help/completion。旧兼容入口只薄转发，迁移完成即删除旧字典，不建立永久双轨。
3. **接动态生命周期**：受控异步、缓存版本、取消、上限与不可用状态；键盘响应不能依赖远程目录及时返回。
4. **接产品能力批次**：完整 Goal、会话级 Model、商店等分别改变运行时，带独立契约与验收。注册表投影不能代替后端施工。
5. **兼容性验证**：交互与非交互共用合法语法。新增严格拒绝、保留字、scope 和动作均需兼容说明与测试；不能用“字段可选”宣称 100% 无行为变化。

当前影响 owner 为 `core/commands/` 各命令领域、`entrypoints/slashCommandRegistry.ts` 的薄投影、`cli/interactive/slashSuggestions.ts`、`keymap.ts` 以及 `presentation/tui/chrome/suggestions.ts`。具体拆分遵循短职责命名和函数数量上限，避免把全命令解析堆进 registry。

## 7. 实施验收标准

本次只修改 Markdown，未执行以下测试或实机验证。

| 验收类别 | 必须证明的行为 |
|---|---|
| 真实语法覆盖 | 按 owner 的有效语法分类，而不是只过滤 argumentHint；固定/动态位置有合法带描述候选，自由文本有 usage。空目录不伪造候选。 |
| 编辑范围 | `  /shell   use ba\| --later`（`\|` 表示光标）、制表符分隔、引号路径、CJK、组合字/ZWJ、光标居中和 suffix；仅替换当前 token，无双空格或前级删除。 |
| 动态竞态 | 新草稿、cursor 变化、项目/会话切换、目录刷新后旧异步结果丢弃；取消/超时/无权限显示准确状态。 |
| 接受与执行 | `/help` 单 Enter；`/res` 接受 `/reset` 不执行；Tab 始终只改草稿；参数/文件候选类型不误触发命令提交。 |
| 词表与语义 | model use/list 合法且补 refresh/config；delete≠invalidate、wake≠recall；use staged、approve≠save；/recall 与 /retain raw invocation 保留。 |
| 非法输入 | 未知 flag、缺值、额外参数、非法数字与 `/todo done 1junk` 被明确拒绝；`/restore execute` 不因补全自动得到确认或写授权。 |
| 目录一致性 | 四套内置主题与真实外部目录、实际工具池、信任后的技能、STATUS_ITEMS、grant selector、三种导出格式；合法目录为空可正常解释。 |
| Goal / Model | 共享预算并发预留/结算、usage 未知、暂停与恢复、重启剩余预算；会话模型 resume 不丢失且不改全局，显式 --global 才改全局。 |
| 终端 | 普通/完整/分片 paste、CRLF、满宽行末、resize/overlay/suspend 恢复；字符和字节正确之外，真实 Windows Terminal 像素现象单独验收。 |

测试应验证用户行为并做反向变更检查：恢复旧的 from-only 替换、去掉版本守卫、丢 raw invocation、把 delete 并入 invalidate、将候选接受改为自动执行时，对应测试必须失败。通过局部候选测试不能代替 Goal/Model 等运行时能力的验收。

### CMD-01 实施记录（2026-10-06）

前文 58 个 aliases 是审计时口径。当前 58 个调度主命令与 `/back` 保留；将两种非同义 memory 调用单独声明后，为 56 个同义 alias、2 个 named invocation，总调用名称仍为 117。统一 invocation 描述已用于调度、帮助、CLI 名称识别、补全与 picker，同义 alias 共用 picker，独立调用保留原 rawName 与参数提示。扩展名称冲突与缓存失效有回归验证。222 项相关测试、Node 20.3 构建、四组反转及 regular/fullscreen 真实 PTY 验证通过；范围、证据与后续 CMD-02/03/04 边界见 [Phase 19 决策 §8.19](phase-19-decisions.md#819-cmd-01命令调用身份与目录一致性)。


### CMD-02 实施记录（2026-10-06）

原始区间、光标/草稿 revision 校验已接入命令、参数与文件候选；编辑保留前后缀、空白、引号路径和 Unicode grapheme，接受候选不执行，完整命令保留一次 Enter。组合 268 项、四类反转、Node 20.3 构建及两种终端模式真实 PTY 已验证。详见 [Phase 19 决策 §8.20](phase-19-decisions.md#820-cmd-02原草稿范围补全与接受语义)。CMD-03 语义校验与 CMD-04 异步目录身份仍待实施。


### CMD-03 首批实施记录（2026-10-06）

trust/todo/thinking 已由领域 syntax 同时驱动运行时校验、帮助和候选；trust 命令与存储双重拒绝非法枚举，todo 拒绝 1junk 等非法稳定 ID，thinking 保留 auto/none 兼容关系并拒绝额外参数。177 项组合测试、四组反转、Node 20.3 构建和两种终端模式真实 CLI 验证通过。完整范围与剩余项见 [Phase 19 决策 §8.21](phase-19-decisions.md#821-cmd-03trusttodothinking-首批共享语法与写入边界)；其余全量表尚未迁移，不标记 CMD-03 完成。


### CMD-03 flags 实施记录（2026-10-06）

export/restore 已迁移到领域语法与原生严格 flags 解析，覆盖格式别名、文件路径、选项值/重复/互斥和 end-of-options；restore 的执行确认不由候选提供。空参数位置 Enter 不再接受默认 flag，完整导出命令不会被补入 --outside。240 项组合测试、四组反转、Node 20.3 构建和两模式真实 CLI 验证通过，详见 [Phase 19 决策 §8.22](phase-19-decisions.md#822-cmd-03exportrestore-严格-flags-与确认隔离)。其余全量表继续。


### CMD-03 memory 实施记录（2026-10-06）

memory owner 的动作定义已用于入口、五组契约解析、帮助和补全，保留独立 named invocation 与 delete/invalidate、approve/save、use 暂存语义。非法额外参数、动作 flags、selector、筛选枚举和 limit 拒绝；存储与 query 共用候选类型枚举。286 项组合测试、四组反转、Node 20.3 构建及两模式真实 CLI 验证通过，范围见 [Phase 19 决策 §8.23](phase-19-decisions.md#823-cmd-03memory-动作目录契约与筛选校验)。动态实体/筛选候选和 model 会话覆盖等继续，未标记 CMD-03 完成。


### CMD-03 model 实施记录（2026-10-06）

默认选择已改为会话持久化，显式 --global 才保存全局默认。请求/状态/chooser/恢复采用同一连接绑定投影，空会话清理保留显式选择，启动参数覆盖不因刷新丢失。严格动作语法与合法位置 catalog 候选已接入；337 项组合测试、构建、六组反转与两模式真实退出/重启探针通过，范围及限制见 [Phase 19 决策 §8.24](phase-19-decisions.md#824-cmd-03model-会话选择恢复与严格语法)。全量表及 CMD-04 仍未完成。


### CMD-03 偏好命令实施记录（2026-10-06）

shell/statusline/settings/fast 已由 owner syntax 驱动执行、帮助与候选。共享有限参数按合法位置枚举；状态项支持逗号 token 补全，settings 不枚举未实现的键，fast 如实描述温度与存储失败。258 项组合测试、构建、四组反转和两模式真实 CLI 验证通过，详见 [决策 §8.25](phase-19-decisions.md#825-cmd-03shellstatuslinesettingsfast-参数与候选)。其余全量表及 CMD-04 待续。


### CMD-03 会话导航实施记录（2026-10-06）

resume/fork/tree/entries 使用共享导航语法，拒绝多余参数与非法 flags，修复对象继承属性被当成模式的问题。保留标题/前缀引用与 fork here、entries 独占游标语义，帮助和固定候选同源。257 项组合测试、构建、三组反转和两模式真实 CLI 验证，见 [决策 §8.26](phase-19-decisions.md#826-cmd-03会话导航动作校验与同源帮助)；动态实体目录及其余全量表仍待完成。


### CMD-03 工作区与运行时动作实施记录（2026-10-06）

workspace/cd、mcp、permissions、view 以领域语法驱动执行、提示与固定候选，多余参数在交接之前拒绝；权限 runner 独立拒绝非法 reset scope。213 项、构建、两组反转与两模式真实 CLI 授权文件/范围验证通过，详见 [决策 §8.27](phase-19-decisions.md#827-cmd-03workspacemcppermissionsview-动作边界)。动态目录及全量表继续。


### CMD-03 诊断命令实施记录（2026-10-06）

log/metrics/report/crash 统一语法、提示与 flags 候选，非法数字/多余参数/未知 flags 在日志清理或归档写入之前拒绝；保留 log help/数字简写、metric 记录计数与 report 既有目标策略。231 项、构建、四组反转与两模式真实 CLI 验证，见 [决策 §8.28](phase-19-decisions.md#828-cmd-03诊断命令参数与归档零写校验)。全量表和动态目录继续。


### CMD-03 工作流与状态面板实施记录（2026-10-06）

workflow/warmup/sidebar 执行契约、提示与候选共享领域声明；workflow 多余参数拒绝后不执行，sidebar watch/live 如实描述单次快照。236 项、构建、三组反转与两模式真实 CLI 验证，见 [决策 §8.29](phase-19-decisions.md#829-cmd-03workflowwarmupsidebar-同源契约)。动态目录与其余命令继续。


### CMD-03 生态命令实施记录（2026-10-06）

plugin/marketplace 共享动作、别名与参数定义，拒绝被忽略的额外参数；plugin 注册表移除模块缓存和静默保存失败，采用锁内重读与原子写入。248 项、构建、两组反转和两模式真实 CLI 验证，见 [决策 §8.30](phase-19-decisions.md#830-cmd-03生态命令语法与注册表持久化结果)。动态目录和实际生态运行能力仍待对应后续任务。


### CMD-03 目标与设计提示实施记录（2026-10-06）

goal 保留单 token 动作与多词正文差异，保存失败不再虚报内存成功；brainstorm 严格短/长 flags、冲突与 -- 字面正文接入共享定义。242 项、构建、两组反转和两模式 CLI 验证，见 [决策 §8.31](phase-19-decisions.md#831-cmd-03goal-自由文本与-brainstorm-flags)。loop 执行预算与其余命令/动态目录继续。


### CMD-03 loop 实施记录（2026-10-06）

loop 严格次数范围与示例候选同源，删除缺失 gate 时隐式 npm test，保留原始 shell 文本并如实描述次数与强制 turn budget 的差异。245 项、构建、反转与两模式真实 CLI 验证，见 [决策 §8.32](phase-19-decisions.md#832-cmd-03loop-次数与原始-gate-参数)。实际共享预算和统一 execution service 接线仍待完成。


### CMD-03 connect 实施记录（2026-10-06）

connect 统一动作/flags/互斥与直接写入函数校验，provider 候选按合法位置生成，凭据值不补全；非法输入在配置写入或认证调用之前拒绝。264 项、构建、反转及两模式真实 CLI 验证，见 [决策 §8.33](phase-19-decisions.md#833-cmd-03connect-登录与连接动作校验)。动态连接 ID 与其余任务继续。


### CMD-03 browser 实施记录（2026-10-06）

browser 顶层/action/replay-cache/repair 使用领域分层语法，拒绝额外参数，保留精确目标，confirm 不补全且保持独立审批。377 项通过、9 项既有集成跳过，构建、四组反转及两模式 CLI 验证通过，见 [决策 §8.34](phase-19-decisions.md#834-cmd-03browser-分层语法与确认隔离)。其余语法和动态目录继续。


### CMD-03 compact 实施记录（2026-10-06）

compact 契约、交互压缩入口与候选共享领域语法，非法 preview 赋值和未知 flags 不再触发真实压缩；重复约束保留，元数据与指令分离，旧固定词表已删除。284 项、构建、两组反转及两模式真实 CLI 验证通过，见 [决策 §8.35](phase-19-decisions.md#835-cmd-03compact-语法与真实压缩入口守卫)。PAR-01 默认压缩接线、剩余语法与动态目录继续。


### CMD-03 无参数命令实施记录（2026-10-06）

14 个无参数入口接入共享语法校验，非法输入不再被忽略后发出 clear/retry/exit/cancel 动作或刷新配置。292 项、构建、反转与两模式真实 CLI 会话指针不变验证通过，见 [决策 §8.36](phase-19-decisions.md#836-cmd-03无参数命令的动作边界)。自由文本/实体目录及 CMD-04 继续。


### CMD-03 实体参数实施记录（2026-10-06）

theme/skill/tools 统一单实体参数校验，非法输入不读取目录、不切换主题，引用名称与 -- 字面名称完整保留；修复共享默认动作对空输入的误判。283 项、构建、反转及两模式真实 CLI 验证通过，见 [决策 §8.37](phase-19-decisions.md#837-cmd-03themeskilltools-的单实体参数)。动态目录仍按 CMD-04 接线。


### CMD-04 首批动态目录实施记录（2026-10-06）

theme/skill/tools 已接当前会话目录与候选生命周期：防抖、缓存、上限、取消发布、超时、身份/草稿校验和结果主动重绘；明确加载/空匹配/失败状态。139 项、构建、反转及两种真实 CLI 模式验证，详见 [决策 §8.38](phase-19-decisions.md#838-cmd-04首批动态目录与候选请求生命周期)。其他动态目录、外部变动版本事件与底层 MCP 物理取消尚未完成。

### CMD-04 会话与条目目录实施记录（2026-10-06）

resume/fork/tree/entries 接入只读目录及既有请求生命周期，标题匹配接受完整会话 ID，不可导航节点不提供候选；加载期间保留固定动作。98 项、构建、反转及 regular/fullscreen 的 Tab 零切换、Enter 切换和完整条目接受验证通过，见 [决策 §8.40](phase-19-decisions.md#840-cmd-04会话与条目动态目录)。其他目录、版本事件及底层取消继续。

### CMD-04 MCP 与授权目录实施记录（2026-10-06）

MCP 服务名从配置 owner 读取，不调用连接快照；权限撤销目录只读当前项目 grant，接受稳定键。101 项、构建、信任过滤/稳定键反转及两模式真实 CLI 的 Tab 零写、Enter 撤销验证通过，见 [决策 §8.41](phase-19-decisions.md#841-cmd-04mcp-名称与授权稳定键目录)。其余目录、外部版本和 tools 快照副作用边界继续。

### CMD-04 工具快照读取实施记录（2026-10-06）

tools 补全改读现有 MCP client 的完整目录，冷目录不连接服务，配置/项目变化及断连不复用旧描述；真实空配置与不可用状态区分。137 项、构建、反转及两模式真实 CLI 冷启动零握手/刷新后补全零协议请求验证通过，见 [决策 §8.42](phase-19-decisions.md#842-cmd-04工具补全复用已加载-mcp-目录)。完整版本事件与其余目录仍待完成。

### CMD-04 连接目录实施记录（2026-10-06）

connect use/logout 及其动作别名接入同源连接目录，标签匹配接受完整 ID，候选不携带凭据。135 项、构建、ID 反转及两模式真实 CLI 的 Tab 零写/Enter 精确切换验证通过，见 [决策 §8.43](phase-19-decisions.md#843-cmd-04连接-id-动态目录)。记忆/文件目录及完整版本事件继续。

### CMD-04 记忆目录实施记录（2026-10-06）

记录与候选 ID 分源读取，invalidate 只列活动记录、save 只列内容一致的已批准候选；目录读取不更新审批或写记忆。173 项、构建、反转及两模式真实 CLI 完整 ID/文件零写验证通过，见 [决策 §8.44](phase-19-decisions.md#844-cmd-04记忆记录与审批候选目录)。路径及其余生命周期接线继续。

### CMD-04 路径目录实施记录（2026-10-06）

cd/workspace 目录及 report/export 文件位置接入一级异步目录读取与分目录缓存；目录接受不补空格且光标留在引号内，可继续下一层。235 项、构建、反转和两模式真实 CLI 路径零写验证通过，见 [决策 §8.45](phase-19-decisions.md#845-cmd-04文件与目录路径补全)。model/workflow 生命周期及完整外部版本事件继续。

### CMD-04 model/workflow 生命周期实施记录（2026-10-06）

模型/可运行 workflow 目录接入统一 controller，移除同步模型实体读取；workflow 显示标题匹配接受实际文件名，候选读取不执行。258 项、构建、循环图反转及两模式真实 CLI 验证通过，见 [决策 §8.46](phase-19-decisions.md#846-cmd-04modelworkflow-统一目录生命周期)。完整版本事件与其余参数审计继续。
