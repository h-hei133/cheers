---
title: "功能对照 01：可扩展性与定制化（我们 vs pi）"
category: article
sources: [pi-source-2026-09-20, repo-audit-2026-09-20]
created: 2026-09-20
updated: 2026-09-23
tags: [features, gap-analysis, pi, extensibility, skills, plugins]
summary: "[部分已过时，见文首横幅] 对照 pi 的可扩展面：扩展宿主、技能、提示词模板、包分发、主题、上下文文件。结论：我们的扩展宿主已被拆除（core/extensions、core/plugins 均不存在），技能只读不注入上下文，提示词模板与包分发缺失。覆盖清单共 10 项 MISSING、4 项 DEFICIENT、1 项 OURS-ONLY。"
confidence: high
---

# 功能对照 01：可扩展性与定制化

> **⚠️ 本文是 2026-09-20 的调研快照，其中部分结论已过时。**
> 已过时的结论在**原位**加了 ✅ 标注（保留原文作为当时的证据）；**未标注的行仍按原文有效**。
> 本轮为**功能开发前锋探索**，零代码改动。对照本地参考仓 `pi`（`/home/wang/projects/pi`）。
> 分类口径：`DEFICIENT`＝我们有但更弱／不完整／未接线；`MISSING`＝pi 有我们没有；
> `OURS-ONLY`＝我们有 pi 没有（**仅记录，本轮不提议开发**）。

## 0. 方法与范围

| 侧 | 读到的位置 |
|---|---|
| pi | `packages/coding-agent/docs/{extensions.md, skills.md, prompt-templates.md, packages.md, usage.md}`、`src/core/{skills.ts, prompt-templates.ts, package-manager.ts, pi-manifest.ts, resource-loader.ts, slash-commands.ts}` |
| 我们 | `core/skills/skillLoader.ts`、`core/hooks/{hookDispatcher.ts,types.ts,builtin/}`、`core/commands/{pluginCommandRuntime,marketplaceCommandRuntime,promptCommandRuntime,skillCommandRuntime}.ts`、`entrypoints/slashCommandRegistry.ts`、`core/commands/registry.ts`、`runtime/resources/descriptor.ts`、`core/mcp/` |

关键检索命令与结果：

```bash
# 扩展宿主是否还在
ls packages/ts-shell/src/core/plugins      # → 不存在
ls packages/ts-shell/src/core/extensions   # → 不存在
git log --oneline -1 -- packages/ts-shell/src/core/extensions   # → b463d87d（已删）

# 提示词模板是否存在
grep -rn "prompt-template\|promptTemplate\|\.agents/prompts" packages/ts-shell/src --include='*.ts' \
  | grep -v test        # → 仅 runtime/resources/descriptor.ts 的类型字面量，无加载器、无消费者

# 技能是否进入上下文
grep -rn "skill" packages/ts-shell/src/turn/prompt.ts packages/ts-shell/src/turn/session.ts \
                packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts   # → 0 命中

# 钩子磁盘加载
grep -rn "hooks.json" packages/ts-shell/src --include='*.ts'   # → 仅 hookDispatcher.ts:36 注释一处
```

## 1. 覆盖清单

| 能力 | pi 位置 | 我们位置 | 判定 | 证据 |
|---|---|---|---|---|
| 扩展自动发现（磁盘目录） | `docs/extensions.md:109-127`（`~/.pi/agent/extensions/*.ts`、`.pi/extensions/*.ts`） | **无代码加载路径** | **MISSING**（**2026-09-23 复核确认**） | 目录不存在（`git log -1 -- src/core/extensions` → `b463d87d` 已删）。**复核更正**：`runtime/extensions/lifecycle.ts` **有**生产导入者（`runtime/resources/descriptor.ts:5,9`），但导入的全是**类型与校验谓词**，**没有任何加载或执行外部代码的函数**——缺的是宿主，不是类型。见 `phase-6-pre-research.md` §1.1 |
| 扩展 API：注册工具 | `docs/extensions.md:1404` `pi.registerTool()` | **无** | **MISSING** | `grep -rn "registerTool" packages/ts-shell/src` → 0 |
| 扩展 API：注册命令 | `docs/extensions.md:1564` `pi.registerCommand()` | **无** | **MISSING** | `entrypoints/slashCommandRegistry.ts:63-72` 的 `extensions` 数组只含 1 条硬编码 `PICKER_ONLY`（`statusline`），且注释自述「the router never sees them」 |
| 扩展 API：事件订阅 | `docs/extensions.md:1391` `pi.on(event,handler)` | 部分：`core/hooks/hookDispatcher.ts:31,38` | **DEFICIENT**（**2026-09-23 确认仍开放**） | 见 §2.1。钩子派发本身已收口（18/18 事件有派发点，`check:declarations` 通过），但那是**配置驱动的内置钩子**，不是**第三方可注册的订阅 API** |
| 扩展 API：注册快捷键／消息渲染器／Markdown 变换器／入口渲染器 | `docs/extensions.md:1632,1636,1657,1677` | **无** | **永久不做**（**2026-09-25 裁决**） | 需要把闭包与终端控件传入 TUI 进程：快捷键分发在 `cli/interactive/keymap.ts` 的**同步** keypress 循环里，渲染器按**终端列宽**计算换行（`blocks.ts` `renderBlock`、`markdown.ts` `renderMarkdown`）。跨进程往返会引入不可接受的延迟——**这是进程边界与同步渲染不兼容，不是偏好取舍**。见 `phase-9-decisions.md` §1.2 |
| 自定义 UI 组件（扩展内） | `docs/tui.md:89-124` `ctx.ui.custom()` | **无** | **永久不做**（**2026-09-25 裁决**） | 需要同步帧计算与有状态光标管理（`presentation/tui/surface/`、`cli/interactive/overlay.ts`）。同上：进程外无法传递 UI 组件树。见 `phase-9-decisions.md` §1.2 |
| 技能发现（磁盘 SKILL.md） | `src/core/skills.ts:168,409` | `core/skills/skillLoader.ts`、`core/skills/skillCatalog.ts` | **部分收口**（**2026-09-23 更正**；**2026-09-24 Phase 8 更新**；**同轮复核更新**） | 递归扫描 + `SKILL.md` 不再下钻（`skillLoader.ts:164`）；**祖先目录搜索已实现**（`:82` `projectDirectories(workspaceRoot)` 向上到根）；`disable-model-invocation` 已支持（`:219`）；**名称校验已实现**（`inspectSkill`：长度/字符集/首尾连字符/连续连字符，Phase 8 补后两条）；**CLI 显式路径已实现**（`--skill <path>` 可重复 + `--no-skills`，Phase 8）。**复核补**：flag 与信任门统一由 `resolveSkillCatalog` 解析，提示词路径 / `/skill` / `/skill:` / 选择器四个读者共用（此前只有提示词路径带 flag 与信任门，命令路径可绕过）；命名路径读不到时经 `failures` 通道点名。**2026-09-25 补**：**忽略规则已共享**——`phase-3-decisions.md` §3.6 #7 裁决「目录列举与技能发现共享同一忽略判定」，实现里从未落地（`git log -S IGNORE_FILES -- skillLoader.ts` → 空）。本轮把忽略层抽成 `runtime/execution/ignoreRules.ts`（git `check-ignore` 优先，无仓库时进程内匹配），文件走查 / 目录列举 / 技能发现三处共用；**命名路径不受忽略规则约束**（`--skill <dir>` 是被直接指名的，比一个恰好匹配的模式更具体）。反向验证：去掉判定 → 2 项测试失败。见 `phase-8-decisions.md` §8.7。**余量**：无。 |
| 技能注入上下文（模型可见清单） | `src/core/skills.ts:355-390` `formatSkillsForPrompt()` → `<available_skills>` | ✅ **已实现**（`skillLoader.renderSkillList()` + `turn/prompt.ts`） | ~~MISSING~~ | 见 §3.1 |
| 技能作为斜杠命令 `/skill:name` | `docs/skills.md:74-91`（`enableSkillCommands`） | `core/commands/slashRouter.ts`（`resolveSkillCatalog` + `expandSkill`）；`core/prompts/expansion.ts` | **已收口**（**2026-09-24 更正**，Phase 7 T2；**同日复核轮修正**） | **原判定不成立**。实机：放一个 `.agents/skills/demo/SKILL.md` 后输入 `/skill:demo hello`，**修复前报 `Unknown slash command: /skill:demo`**（`slashRouter.ts:12` 把它当命令名查注册表），**修复后展开为 `<skill name="demo">…</skill>` 并进入回合**。`/skill <name>`（只打印）**保留**——「先看看技能写了什么」是调用前的必要步骤。未知名给可用列表。**复核轮修正**：查找从单一 `expandSubmission` 改为 `expandSkill`/`expandTemplate` 两个查找，**路由自己决定优先级**（技能 → 注册表 → 模板），因为「谁赢」是路由问题而非展开问题。**一处未成文的选择已入档**：隐藏（`availability: "hidden"`）或禁用（`enabled: false`）的命令**不认领名字**，于是同名模板可用——`slashRouter.ts:62-66` 只在命令「可见且启用」时执行它。反向验证：去掉展开 → 2 项测试失败。**Phase 8 复核轮再修正**：查找此前经 `new SkillLoader(context.cwd)` 自带一份发现，既不带 `--skill`/`--no-skills` 也不带未信任项目门 —— 命名技能模型看得见而用户调不动，且未信任项目的技能可经 `/skill:<name>` 展开进提示词（实机复现）。现与提示词路径共用 `resolveSkillCatalog`。见 §2.2（已同步更正） |
| 提示词模板（磁盘 `.md` 参数化） | `src/core/prompt-templates.ts:194,269`；`docs/prompt-templates.md` | `core/prompts/templateLoader.ts`；`core/prompts/expansion.ts`（`expandTemplate`/`substituteArguments`） | **已收口**（**2026-09-24 更正**，Phase 7 T2；**同日复核轮修正**） | **原判定不成立**。磁盘 `.md` 模板（用户级 + 项目级，与技能同一套目录约定），文件名即调用名；占位符 `$1`/`$@`/`${1:-x}`/`${@:2:3}` + 引号分词，**单遍替换**（参数里的占位符不会被二次展开）。**复核轮修正两处**：①调用形式与 `pi` 一致，**必须带斜杠**（`/explain args`）——T2 初稿让**裸名**也展开，那会让 `review this function` 这类正常句子被 `review.md` 静默改写成模板正文，用户输入的字被删掉且无人过问（`pi` 的 `expandPromptTemplate` 要求 `text.startsWith("/")`）；裸名展开已删除。②**项目目录优先级修正**：`TemplateLoader` 原先把 `projectDirectories` 结果 `.reverse()`，而合并是「后者覆盖」，于是**最外层项目目录取胜**，与技能加载器（就近取胜）及自身注释相反。③**注册表优先**：内置命令先认领名字，模板才被考虑——`audit` 是 `/review` 的别名，用户写一个 `audit.md` 不能悄悄顶掉它。反向验证：斜杠要求 → 1 项失败；优先级 → 1 项失败。见 §3.2（已同步更正） |
| 包分发（npm/git 安装、manifest） | `src/core/package-manager.ts:112`、`src/core/pi-manifest.ts:4,17`、`docs/packages.md` | 部分：`core/commands/pluginCommandRuntime.ts` | **DEFICIENT**（**2026-09-23 确认**） | 见 §2.3。**代码自述**（`pluginCommandRuntime.ts:12`）：「Registering one records an address and a manifest; **this build does not execute extensions**」 |
| 主题发现（磁盘 JSON、CLI 覆盖） | `docs/themes.md:17-40` | `presentation/themes/index.ts`；`cli/options/cliOptions.ts:50,58` | ✅ **已收口**（**2026-09-25 更正**；余量：**包层**，与「包分发」同一前置） | **原判定写「仍无包/CLI 覆盖层」已过时**：用户级 + 项目级 + `/theme` 之外，**CLI 覆盖层已实现**（`--theme <path>` 加载、`--use-theme <name>` 选择，`cliArgs.ts:47,48,267,277`），`cliProcessRunner.applyStartupTheme` 在**首帧之前**应用。**漂移原因**：A2 施工只更新了 `04-terminal-interaction-and-presentation.md`，未回头关闭本行。见 `phase-8-decisions.md` §9.2 |
| 上下文文件（AGENTS.md）分层加载 | `docs/usage.md:102-108`、`src/core/resource-loader.ts:119` `loadProjectContextFiles` | ✅ **已实现**（`context/instructions/projectInstructions.ts`） | ~~MISSING~~ | 见 §3.3 |
| 提示词附加 `APPEND_SYSTEM.md` ✅ **已收口 2026-09-23**；`SYSTEM.md`（**替换**语义）**维持不做**（**2026-09-25 理由更正**） | `docs/usage.md:112-119` | `context/instructions/projectInstructions.ts`（`APPEND_CANDIDATES`） | **部分收口** | 有测试钉住 `SYSTEM.md` 未被认领。**理由已更正**（`phase-10-decisions.md` §9.1）：原写「替换会让执行规则彻底失效」**夸大了**——Plan 模式有**运行时硬拦截**（`turn/tools.ts` 的 `planModeBlock`），工具以**结构化参数**传给 provider，拒绝经工具返回值注入。真正的损失是**提示词层的引导质量**。另一处更正：参考实现**也没有**「不可覆盖的基底」——它在自定义提示词时同样跳过 tools/rules/docs，**只有信任门是真防线**。结论不变：**维持不做**，因为收益无需求支撑。 |
| MCP 客户端 | **pi 无**（`docs/usage.md:310` 明确声明不内置） | `core/mcp/`（client/config/connectionManager/errorTaxonomy/gateway/types） | **OURS-ONLY** | 见 §4 |

## 2. DEFICIENT 详述

### 2.1 钩子宿主存在，但没有外部注册路径（置信度：高）

**现象**：`HookDispatcher` 声明了 22 个事件名与两种注册方法，但唯一的生产注册者是内置模块本身。

**证据（我们）**：

- `core/hooks/types.ts:5-27` 定义 `HookEventName` 共 22 项（含 `PreToolUse`、`PreCompact`、`Stop` 等）；`:29` `HookDecisionKind = "allow" | "block" | "retry" | "ask" | "defer"`。
- `core/hooks/hookDispatcher.ts:31` `registerInProcessHook`、`:38` `registerCommandHook`。
- 全仓调用者：`core/hooks/builtin/index.ts:21-23` 注册 3 个内置钩子；其余全部是 `hooks.test.ts`。
- ~~`registerCommandHook` **零调用者**~~：✅ **已接线**（`core/hooks/registration.ts` 读 `.agents/hooks.json` 并注册）。
- ~~磁盘加载不存在~~：✅ **已实现**（`core/hooks/config.ts` 的 `loadHookDeclarations`）。

**证据（pi）**：`docs/extensions.md:109-127` 扩展从磁盘自动发现；`:1391` `pi.on(event,handler)` 返回可取消订阅；`:800` 的 `tool_call` 事件明确「Can block」，是真正的拦截点。

**影响**：用户无法在不改我们源码的前提下影响任何工具调用。`HookDecisionKind` 里的 `"block"`/`"retry"`/`"ask"` 语义对第三方不可达。

**最小改动建议（已完成）**：✅ 已读 `.agents/hooks.json` 并注册，另加信任门（`core/hooks/trust.ts`）。

### 2.1.1 当前钩子配置与事件载荷（2026-09-30）

当前支持 18 个声明式事件。用户级 `~/.cheers/hooks.json` 与工作区
`.agents/hooks.json` 都会加载；磁盘命令需通过现有信任门才能执行。
以下示例在工具执行前运行工作区脚本，脚本从 stdin 读取一份 JSON：

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "^edit$",
      "hooks": [{ "command": "node scripts/check-edit.mjs" }]
    }]
  }
}
```

每份载荷均含 `eventName`、`sessionId`、`workspaceRoot`、`timestamp`；
`agentId`、`agentType` 是可选字段。下表列出额外字段，字段类型以
`packages/ts-shell/src/core/hooks/types.ts` 为准。

| 事件 | 发生时机 | 额外字段 |
|---|---|---|
| `SessionStart` | 会话启动 | `resumed: boolean` |
| `SessionEnd` | 会话结束 | `turnsExecuted: number` |
| `UserPromptSubmit` | 用户提交提示 | `prompt: string` |
| `PreToolUse` | 工具执行前 | `toolName`, `toolCallId`, `args: object` |
| `PostToolUse` | 工具返回结果 | `toolName`, `toolCallId`, `args`, `output: string`, `success: boolean` |
| `PostToolUseFailure` | 工具失败 | `toolName`, `toolCallId`, `args`, `error: string` |
| `PermissionRequest` | 请求工具授权 | `toolName`, `toolCallId`, `args` |
| `PermissionDenied` | 工具授权被拒 | `toolName`, `toolCallId`, `args`, `reason: string` |
| `PreModelSwitch` | 切换模型前 | `fromModel`, `toModel` |
| `PostModelSwitch` | 切换模型后 | `fromModel`, `toModel` |
| `PreCompact` | 压缩前 | `reason: manual/threshold/overflow`, `tokensBefore`, `messageCount` |
| `PostCompact` | 压缩后 | `reason`, `summary: string`, `keptMessages`, `tokensBefore` |
| `SubagentStart` | 子任务启动 | 基础字段中的 `agentId`、`agentType`，无额外专用字段 |
| `SubagentStop` | 子任务结束 | 基础字段中的 `agentId`、`agentType`，无额外专用字段 |
| `WorktreeCreate` | 创建隔离工作树 | `subtaskId`, `worktreePath`, `branch` |
| `WorktreeRemove` | 移除隔离工作树 | `subtaskId`, `worktreePath` |
| `Stop` | 查询正常停止 | `turnsExecuted`, `finalOutput: string` |
| `StopFailure` | 查询失败停止 | `turnsExecuted`, `error: string` |

未显式注明类型的标识、路径、模型名为字符串；计数为数字。
`matcher` 仅对三个工具事件匹配 `toolName`（正则，非法正则退回忽略大小写的精确匹配）；
其他事件不按工具名过滤。省略或使用 `*` 表示全部匹配。
命令可输出 `{"decision":"allow"}` 或 `{"decision":"block","reason":"说明"}`；
退出码 2 且 stderr 非空也会形成 block。`PreToolUse` 的执行失败、超时和非法 JSON
按阻止执行处理。观察事件不因此撤销已经完成的动作；声明一个事件不意味着它有否决能力。
常规命令超时为 15 秒，`SessionEnd`、`Stop`、`StopFailure` 为 3 秒。

这份索引补齐现有事件的可发现性，不增加扩展宿主或内建事件消费者。
上节的旧事件数与「无外部路径」描述保留作研究历史，以本节及当前代码为准。

### 2.2 技能：发现面窄、无校验、无优先级规则（置信度：高）—— ⚠️ **2026-09-23 部分更正**

> **更正说明**：下方表格有 **3 行已过时**，实际代码已补齐。复核证据：
> ① **祖先目录搜索已实现**——`skillLoader.ts:84` 用 `projectDirectories(workspaceRoot)`
> 生成「从工作目录到根」的每一层 `.agents/skills`，注释明写「Reading only the working
> directory made those skills invisible, with nothing said about it」；
> ② **注入模型已实现**——`skillLoader.ts:252` `renderSkillList` 产出
> `<available_skills>` 清单，由 `cliRuntimeInvocation.ts:272` 注入系统提示；
> ③ **`disable-model-invocation` 已支持**——`skillLoader.ts:219` 读该 frontmatter 字段，
> `:254` 据此过滤注入清单。
> **仍然成立的余量**：**无名称/描述校验**（pi 有名称长度/字符集/连字符规则）、
> **无 `.gitignore`/`.ignore` 忽略规则**、根目录数量少于 pi（我方 2 类 + 祖先展开）。
> 下方原文保留为当时的证据。

> **⚠️ 2026-09-25 再更正（Phase 10 D2）**：上面「仍然成立的余量」三项**全部已不成立**，
> 这段注记当时漏改。逐项核实：
> ① **名称/描述校验已实现**——`skillLoader.ts:541` `inspectSkill` 应用**四条**名称规则
> （长度上限、字符集 `^[a-z0-9-]+$`、首尾连字符、连续连字符）**加**描述必填；
> ② **忽略规则已接入**——`skillLoader.ts:6` 导入 `ignoreRules.js`，`:357` 实际过滤
> （`source !== "cli"` 才过滤：直接指名的路径比恰好匹配的模式更具体）；
> ③ **根目录数量的差距不构成缺陷**——缺的根属于**包系统／扩展宿主／设置项**，
> 三者都在 Phase 10 的排除范围内。
> **即：技能发现已无代码余量，这是纯文档修复。**

**证据（我们）** `core/skills/skillLoader.ts`：

| 维度 | 我们 | pi（`src/core/skills.ts`） |
|---|---|---|
| 根目录 | 2 个：`~/.cheers/skills`（`:37`）、`<ws>/.agents/skills`（`:40`） | 6 类：`~/.pi/agent/skills`、`~/.agents/skills`、`.pi/skills`、祖先目录 `.agents/skills`、包、settings、CLI（`docs/skills.md:24-35`） |
| 祖先目录搜索 | **无**（只查 cwd 正下方） | 有，向上到 git 根（`docs/skills.md:31`） |
| manifest 名 | `SKILL.md`（`:28`） | `SKILL.md`（同） |
| frontmatter 解析 | 本地正则 `FRONTMATTER`（`:29`），`parseFields` 手写 | `parseFrontmatter`（`skills.ts:4`） |
| 校验 | 无 | 名称长度/字符集/连字符规则（`skills.ts:92-115`）+ 描述必填（`:117-127`） |
| `disable-model-invocation` | ✅ 有（`skillLoader.ts:198`） | 有（`skills.ts:70,80,341`） |
| 关闭机制 | frontmatter `enabled: false`（`:89`） | `--no-skills`、settings 数组（`docs/skills.md:35`） |
| 忽略规则 | 无 | `.gitignore`/`.ignore`/`.fdignore`（`skills.ts:14`） |
| 注入模型 | **无** | `formatSkillsForPrompt()`（`skills.ts:355`） |

**影响**：`.agents/skills` 只在 cwd 正下方被发现，仓库根不在 cwd 时技能静默消失；技能名可任意字符，`/skill` 查表依赖 `toLowerCase()` 松散匹配（`core/commands/skillCommandRuntime.ts:62-66`）。

**最小改动建议**：① 增加祖先目录向上搜索；② 补名称/描述校验并输出诊断；③ 用 `disable-model-invocation` 替代自定义 `enabled`。

### 2.3 插件注册表只记录地址，不执行（置信度：高，且代码自述）

**证据（我们）** `core/commands/pluginCommandRuntime.ts:12` 注释原文：

> 「Registering one records an address and a manifest; **this build does not execute extensions**, and the output says so rather than implying a capability arrived.」

`InstalledPlugin`（`:18-29`）字段含 `resolved`（`:28`，注释「False until the spec has been resolved on disk」）、`source: "path"|"package"`；存储位置 `~/.cheers/plugins.json`（`:34`）；默认空注册表（`:38`）。

**证据（pi）**：`src/core/package-manager.ts:112` `PackageManager` 接口，配合 `ResolvedResource`/`ResolvedPaths`/`PackageUpdate`（`:74,80,98`）；`src/core/pi-manifest.ts:4` `PiManifest`、`:17` `readPiManifest`；`docs/packages.md` 描述 npm/git 源与 `pi install/remove/update/list/config`。

**影响**：`/plugin` 与 `/marketplace` 是**登记簿**而非安装器。`core/commands/marketplaceCommandRuntime.ts:10-22` 的两个源 URL（`github.com/cheers/marketplace`、`.../community-plugins`）是硬编码字面量，全文件无任何网络拉取代码。用户以为装了能力，实际什么都没变。

**最小改动建议**：二选一——要么把 `/plugin` 的输出与帮助文案改成明确「仅登记、不加载」（注释已诚实，但命令输出与帮助未对齐），要么实现真实加载路径（大工程，建议单独立项）。

### 2.4 主题：只有两个内建，无磁盘发现（置信度：高）

**证据（我们）** `presentation/themes/index.ts:1-2` 静态 `import darkJson from "./dark.json"` / `lightJson`；`:10` `registry` 只含这两个键；`:15-17` `listThemes()` 返回 `Object.keys(registry)`，即恒为 `["dark","light"]`；`:19-21` `loadTheme(name)` 只在该 registry 内查表。

**证据（pi）** `docs/themes.md:17-40` 从 5 类位置加载（内置、`~/.pi/agent/themes/*.json`、`.pi/themes/*.json`、包、settings、CLI `--theme`）；`docs/themes.md:168-278` 定义了具名色令牌分组（Core UI 13、Backgrounds 11+2、Markdown 10、Tool Diffs 3、Syntax 9、Thinking Level Borders 6+1、Bash Mode 1）。

**影响**：`config/runtimeConfig.ts` 声明了 `theme?: "dark"|"light"|"auto"`，但 `getRuntimeConfig` 不返回该字段（见 `02-*` 报告），且 `loadTheme` 只认这两个名字——用户无法自带主题。

**最小改动建议**：把 `presentation/themes/index.ts` 的静态 registry 改为「静态兜底 + 目录扫描」，扫描 `~/.cheers/themes/*.json` 与 `<ws>/.agents/themes/*.json`。

## 3. MISSING 详述

### 3.1 ~~技能不进入模型上下文~~ ✅ 已修复（原文保留为历史记录）

**pi 如何实现**：`src/core/skills.ts:355` `formatSkillsForPrompt(skills)` 产出 `<available_skills>` XML 块（`name`/`description`/`location`），追加进系统提示；`disableModelInvocation` 的技能被过滤。模型据此知道有哪些技能，再用 `read` 去取内容。

**我们缺失的证明**：

```bash
grep -rn "skill" packages/ts-shell/src/turn/prompt.ts \
                 packages/ts-shell/src/turn/session.ts \
                 packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts   # → 0 命中
```

`turn/prompt.ts:26` `buildSystemPrompt()` 是纯字面量数组，不含任何技能或上下文文件内容。技能只在用户显式 `/skill <name>`（`skillCommandRuntime.ts:15`）时被打印到终端，**从不进入任何一次请求**。

**影响**：这是本轮最严重的功能缺口。技能的存在对模型完全不可见——模型无法主动加载它，`/skill` 也只是「打印给你看」。`docs/` 与 `.agents/skills` 的全部投资在当前产品里对模型零收益。

**最小落地路径**：`buildSystemPrompt` 增加一个「技能清单」段，由 `SkillLoader.load()` 生成（复用 pi 的 `<available_skills>` 形状）；`disable-model-invocation` 语义照搬。改动点集中在 `turn/prompt.ts` + 调用方 `entrypoints/cliRuntimeInvocation.ts:207`。

### 3.2 提示词模板缺失（置信度：高）

**pi 如何实现**：`src/core/prompt-templates.ts:194` `loadPromptTemplates()` 从 `~/.pi/agent/prompts/*.md`、`.pi/prompts/*.md`、显式路径加载；`PromptTemplate` 含 `name`/`description`/`argumentHint`/`content`（`:11-18`）；`:24` `parseCommandArgs` 支持引号、`:70` `substituteArgs`、`:269` `expandPromptTemplate`。文件名即命令名（`docs/prompt-templates.md:29-31`）。

**我们缺失的证明**：

```bash
grep -rn "prompt-template\|promptTemplate\|\.agents/prompts" packages/ts-shell/src --include='*.ts' | grep -v test
# → runtime/resources/descriptor.ts:13 的联合类型字面量 "prompt-template"
# → runtime/resources/projection.test.ts:114,145（仅测试）
```

`runtime/resources/descriptor.ts:13` 声明了 `StaticResourceKind` 含 `"prompt-template"`，但该文件同时把 `enabledByDefault` 固定为 `false`、`executable: false`（`:44,30-31`）——它是**静态清单描述符**，不是加载器。全仓无 `loadPromptTemplates` 等价物。

**影响**：用户无法定义可复用的参数化提示词。当前唯一的「模板」是硬编码在 `core/commands/registry.ts` 里的 45 个内建命令。

**最小落地路径**：新增 `core/skills/promptTemplateLoader.ts`，扫描 `~/.cheers/prompts/*.md` 与 `<ws>/.agents/prompts/*.md`，在 `core/commands/registry.ts` 构建时动态注册为命令（`CommandDefinition` 已支持 `summary`/`argumentHint` 形状，见 `entrypoints/slashCommandRegistry.ts:17-27`）。

### 3.3 ~~上下文文件（AGENTS.md）不被加载~~ ✅ 已修复（原文保留为历史记录）

**pi 如何实现**：`docs/usage.md:102-108` 从 `~/.pi/agent/AGENTS.md`、祖先目录、cwd 分层加载 `AGENTS.md`/`CLAUDE.md`，`AGENTS.override.md` 覆盖同级（`:108`）；`src/core/resource-loader.ts:119` `loadProjectContextFiles()`。

**我们缺失的证明**：

```bash
grep -rn "AGENTS.md" packages/ts-shell/src --include='*.ts' | grep -v test
# → core/commands/initCommandRuntime.ts:65,77,80  （只 existsSync + 提示用户创建）
# → core/commands/registry.ts:307                  （/init 的 summary 文案）
# → core/context/model/contextContinuityManifest.ts:54  （字符串 "AGENTS.md:repository-boundaries"，是清单里的证据标签，不读文件）
```

全仓**没有一处读取 `AGENTS.md` 的内容**，更没有把它放进系统提示或用户消息。

**影响**：本仓库自己的 `AGENTS.md`（含不可协商的安全边界、架构规范、验证门禁）对运行中的 agent 不可见。这是一个讽刺性缺口：我们靠人工把规则贴进上下文，而产品本身不会读。

**最小落地路径**：`buildSystemPrompt` 或 `turn/prompt.ts` 的 `toChatMessages` 增加一个「项目指令」段，按 pi 的分层顺序（全局 → 祖先 → cwd）拼接，并支持 `AGENTS.override.md`。

## 4. OURS-ONLY（仅记录，本轮不提议开发）

| 能力 | 我们位置 | pi 是否真的没有（检索命令+结果） |
|---|---|---|
| MCP 客户端与网关 | `core/mcp/{client,config,connectionManager,errorTaxonomy,gateway,types}.ts`；工具注入见 `core/tools/registry.ts:214,563-578` | **确认没有**。`docs/usage.md:310` 原文：「It intentionally does not include built-in MCP, sub-agents, permission popups, plan mode, to-dos, or background bash.」；`grep -rln "mcpServers\|modelcontextprotocol" packages/*/src packages/*/docs` → 仅 `docs/usage.md` 该句与一张图片 |
| 钩子的 22 事件分类法 | `core/hooks/types.ts:5-27` | pi 的事件名集合不同（`docs/extensions.md:351-933` 按 Startup/Resource/Session/Agent/Model/Tool/UserBash/Input 分组），无同名分类法 |
| 静态资源清单描述符（`enabledByDefault:false`、`executable:false`） | `runtime/resources/descriptor.ts:13,37-38,50` | pi 无对应物 |

> 注：`runtime/resources/` 的 `StaticResourceDescriptor` 是**声明式清单**（明确 `executable: false`、`supported: false`），
> 唯一生产消费者是 `provider/registry/provider.ts:2` 的**类型导入**。它记录「我们**不**执行扩展」这一事实，
> 与 §2.3 的 `/plugin` 是同一设计意图的两处体现。

> **2026-09-25 补正（Phase 9）**：上一轮复核发现本模块三条**如实性**缺陷，已在 Phase 9 修复。
> ①非 stdio 传输的 `invokeTool` 曾**返回假的成功**（`client.ts` 直接 return "executed successfully"，
> 无任何调用）；②`resources`/`prompts` 只有 mock，三个 MCP 原语实际只实现了 tools；
> ③stdio 用自有 `{action:"list-tools"}` 封包而非 JSON-RPC 2.0，**与外部 MCP 服务器不互通**——
> 这是「MCP 形状」而非「MCP 协议」。处置见 `phase-9-decisions.md` §1.5。
> **安全正面确认**：`mcp__<server>__<tool>` 不命中 `READ_ONLY_TOOLS`（精确匹配），
> 在 `ask`/`accept-edits` 下**始终要求升级**，天然免疫顶名继承豁免。

## 5. 未能验证的项

1. **pi 的扩展实际运行效果**：pi 的 `node_modules` 不存在，未能实跑 `pi -e ./ext.ts` 验证其扩展宿主行为。上述 pi 侧结论全部来自**其文档与源码**，未做实机对照。
2. **`runtime/resources/` 是否曾被接线**：其 `projection.ts` 只有测试导入者（`provider/registry/provider.test.ts:5`）。未追溯 git 历史确认它是否曾有过生产消费者。
3. **`docs/` 中是否有技能/插件的既有设计文档**：仅做了关键词级 grep，未逐份阅读 770 份 `docs/`，可能遗漏既有设计意图记录。
4. **`core/commands/marketplaceCommandRuntime.ts` 的源 URL 是否可达**：未做网络请求，未验证 `github.com/cheers/marketplace` 是否存在。
