---
title: "功能对照 01：可扩展性与定制化（我们 vs pi）"
category: article
sources: [pi-source-2026-09-20, repo-audit-2026-09-20]
created: 2026-09-20
updated: 2026-09-20
tags: [features, gap-analysis, pi, extensibility, skills, plugins]
summary: "对照 pi 的可扩展面：扩展宿主、技能、提示词模板、包分发、主题、上下文文件。结论：我们的扩展宿主已被拆除（core/extensions、core/plugins 均不存在），技能只读不注入上下文，提示词模板与包分发缺失。覆盖清单共 10 项 MISSING、4 项 DEFICIENT、1 项 OURS-ONLY。"
confidence: high
---

# 功能对照 01：可扩展性与定制化

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
| 扩展自动发现（磁盘目录） | `docs/extensions.md:109-127`（`~/.pi/agent/extensions/*.ts`、`.pi/extensions/*.ts`） | **无** | **MISSING** | `ls packages/ts-shell/src/core/extensions` → 不存在；`git log --oneline -1 -- packages/ts-shell/src/core/extensions` → `b463d87d`（已删） |
| 扩展 API：注册工具 | `docs/extensions.md:1404` `pi.registerTool()` | **无** | **MISSING** | `grep -rn "registerTool" packages/ts-shell/src` → 0 |
| 扩展 API：注册命令 | `docs/extensions.md:1564` `pi.registerCommand()` | **无** | **MISSING** | `entrypoints/slashCommandRegistry.ts:63-72` 的 `extensions` 数组只含 1 条硬编码 `PICKER_ONLY`（`statusline`），且注释自述「the router never sees them」 |
| 扩展 API：事件订阅 | `docs/extensions.md:1391` `pi.on(event,handler)` | 部分：`core/hooks/hookDispatcher.ts:31,38` | **DEFICIENT** | 见 §2.1 |
| 扩展 API：注册快捷键／消息渲染器／Markdown 变换器／入口渲染器 | `docs/extensions.md:1632,1636,1657,1677` | **无** | **MISSING** | 同上，无任何注册入口 |
| 自定义 UI 组件（扩展内） | `docs/tui.md:89-124` `ctx.ui.custom()` | **无** | **MISSING** | `grep -rn "ui\.custom\|ctx\.ui" packages/ts-shell/src` → 0 |
| 技能发现（磁盘 SKILL.md） | `src/core/skills.ts:168,409` | `core/skills/skillLoader.ts` | **DEFICIENT** | 见 §2.2 |
| 技能注入上下文（模型可见清单） | `src/core/skills.ts:355-390` `formatSkillsForPrompt()` → `<available_skills>` | **无** | **MISSING** | 见 §3.1 |
| 技能作为斜杠命令 `/skill:name` | `docs/skills.md:74-91`（`enableSkillCommands`） | **无** | **MISSING** | 我们只有 `/skill <name>` 子命令形式（`core/commands/skillCommandRuntime.ts:15`），非注册命令 |
| 提示词模板（磁盘 `.md` 参数化） | `src/core/prompt-templates.ts:194,269`；`docs/prompt-templates.md` | **无** | **MISSING** | 见 §3.2 |
| 包分发（npm/git 安装、manifest） | `src/core/package-manager.ts:112`、`src/core/pi-manifest.ts:4,17`、`docs/packages.md` | 部分：`core/commands/pluginCommandRuntime.ts:12,18` | **DEFICIENT** | 见 §2.3 |
| 主题发现（磁盘 JSON、CLI 覆盖） | `docs/themes.md:17-40` | 部分：`presentation/themes/index.ts:10` | **DEFICIENT** | 见 §2.4 |
| 上下文文件（AGENTS.md）分层加载 | `docs/usage.md:102-108`、`src/core/resource-loader.ts:119` `loadProjectContextFiles` | **无** | **MISSING** | 见 §3.3 |
| 系统提示词覆盖（`SYSTEM.md`／`APPEND_SYSTEM.md`） | `docs/usage.md:112-119` | **无** | **MISSING** | `grep -rn "SYSTEM.md" packages/ts-shell/src` → 仅 `core/security/projectTrust.ts:87` 把它当作「敏感文件」探测，不读取内容 |
| MCP 客户端 | **pi 无**（`docs/usage.md:310` 明确声明不内置） | `core/mcp/`（client/config/connectionManager/errorTaxonomy/gateway/types） | **OURS-ONLY** | 见 §4 |

## 2. DEFICIENT 详述

### 2.1 钩子宿主存在，但没有外部注册路径（置信度：高）

**现象**：`HookDispatcher` 声明了 22 个事件名与两种注册方法，但唯一的生产注册者是内置模块本身。

**证据（我们）**：

- `core/hooks/types.ts:5-27` 定义 `HookEventName` 共 22 项（含 `PreToolUse`、`PreCompact`、`Stop` 等）；`:29` `HookDecisionKind = "allow" | "block" | "retry" | "ask" | "defer"`。
- `core/hooks/hookDispatcher.ts:31` `registerInProcessHook`、`:38` `registerCommandHook`。
- 全仓调用者：`core/hooks/builtin/index.ts:21-23` 注册 3 个内置钩子；其余全部是 `hooks.test.ts`。
- `registerCommandHook` **零调用者**：`grep -rn "registerCommandHook" packages/ts-shell/src` → 仅定义处 + 注释。
- 磁盘加载不存在：`grep -rn "hooks.json" packages/ts-shell/src --include='*.ts'` → 仅 `hookDispatcher.ts:36` 的注释提到 `.agents/hooks.json`，无任何读取代码。

**证据（pi）**：`docs/extensions.md:109-127` 扩展从磁盘自动发现；`:1391` `pi.on(event,handler)` 返回可取消订阅；`:800` 的 `tool_call` 事件明确「Can block」，是真正的拦截点。

**影响**：用户无法在不改我们源码的前提下影响任何工具调用。`HookDecisionKind` 里的 `"block"`/`"retry"`/`"ask"` 语义对第三方不可达。

**最小改动建议**：让 `registerCommandHook` 有真实调用者——在启动时读 `.agents/hooks.json`（或 settings 的 `hooks` 数组）并注册。这是把已有能力接线，不是新建机制。

### 2.2 技能：发现面窄、无校验、无优先级规则（置信度：高）

**证据（我们）** `core/skills/skillLoader.ts`：

| 维度 | 我们 | pi（`src/core/skills.ts`） |
|---|---|---|
| 根目录 | 2 个：`~/.private-agents/skills`（`:37`）、`<ws>/.agents/skills`（`:40`） | 6 类：`~/.pi/agent/skills`、`~/.agents/skills`、`.pi/skills`、祖先目录 `.agents/skills`、包、settings、CLI（`docs/skills.md:24-35`） |
| 祖先目录搜索 | **无**（只查 cwd 正下方） | 有，向上到 git 根（`docs/skills.md:31`） |
| manifest 名 | `SKILL.md`（`:28`） | `SKILL.md`（同） |
| frontmatter 解析 | 本地正则 `FRONTMATTER`（`:29`），`parseFields` 手写 | `parseFrontmatter`（`skills.ts:4`） |
| 校验 | 无 | 名称长度/字符集/连字符规则（`skills.ts:92-115`）+ 描述必填（`:117-127`） |
| `disable-model-invocation` | 无 | 有（`skills.ts:70,80,341`） |
| 关闭机制 | frontmatter `enabled: false`（`:89`） | `--no-skills`、settings 数组（`docs/skills.md:35`） |
| 忽略规则 | 无 | `.gitignore`/`.ignore`/`.fdignore`（`skills.ts:14`） |
| 注入模型 | **无** | `formatSkillsForPrompt()`（`skills.ts:355`） |

**影响**：`.agents/skills` 只在 cwd 正下方被发现，仓库根不在 cwd 时技能静默消失；技能名可任意字符，`/skill` 查表依赖 `toLowerCase()` 松散匹配（`core/commands/skillCommandRuntime.ts:62-66`）。

**最小改动建议**：① 增加祖先目录向上搜索；② 补名称/描述校验并输出诊断；③ 用 `disable-model-invocation` 替代自定义 `enabled`。

### 2.3 插件注册表只记录地址，不执行（置信度：高，且代码自述）

**证据（我们）** `core/commands/pluginCommandRuntime.ts:12` 注释原文：

> 「Registering one records an address and a manifest; **this build does not execute extensions**, and the output says so rather than implying a capability arrived.」

`InstalledPlugin`（`:18-29`）字段含 `resolved`（`:28`，注释「False until the spec has been resolved on disk」）、`source: "path"|"package"`；存储位置 `~/.coding-agents/plugins.json`（`:34`）；默认空注册表（`:38`）。

**证据（pi）**：`src/core/package-manager.ts:112` `PackageManager` 接口，配合 `ResolvedResource`/`ResolvedPaths`/`PackageUpdate`（`:74,80,98`）；`src/core/pi-manifest.ts:4` `PiManifest`、`:17` `readPiManifest`；`docs/packages.md` 描述 npm/git 源与 `pi install/remove/update/list/config`。

**影响**：`/plugin` 与 `/marketplace` 是**登记簿**而非安装器。`core/commands/marketplaceCommandRuntime.ts:10-22` 的两个源 URL（`github.com/private-coding-agents/marketplace`、`.../community-plugins`）是硬编码字面量，全文件无任何网络拉取代码。用户以为装了能力，实际什么都没变。

**最小改动建议**：二选一——要么把 `/plugin` 的输出与帮助文案改成明确「仅登记、不加载」（注释已诚实，但命令输出与帮助未对齐），要么实现真实加载路径（大工程，建议单独立项）。

### 2.4 主题：只有两个内建，无磁盘发现（置信度：高）

**证据（我们）** `presentation/themes/index.ts:1-2` 静态 `import darkJson from "./dark.json"` / `lightJson`；`:10` `registry` 只含这两个键；`:15-17` `listThemes()` 返回 `Object.keys(registry)`，即恒为 `["dark","light"]`；`:19-21` `loadTheme(name)` 只在该 registry 内查表。

**证据（pi）** `docs/themes.md:17-40` 从 5 类位置加载（内置、`~/.pi/agent/themes/*.json`、`.pi/themes/*.json`、包、settings、CLI `--theme`）；`docs/themes.md:168-278` 定义了具名色令牌分组（Core UI 13、Backgrounds 11+2、Markdown 10、Tool Diffs 3、Syntax 9、Thinking Level Borders 6+1、Bash Mode 1）。

**影响**：`config/runtimeConfig.ts` 声明了 `theme?: "dark"|"light"|"auto"`，但 `getRuntimeConfig` 不返回该字段（见 `02-*` 报告），且 `loadTheme` 只认这两个名字——用户无法自带主题。

**最小改动建议**：把 `presentation/themes/index.ts` 的静态 registry 改为「静态兜底 + 目录扫描」，扫描 `~/.private-agents/themes/*.json` 与 `<ws>/.agents/themes/*.json`。

## 3. MISSING 详述

### 3.1 技能不进入模型上下文（置信度：高）

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

**最小落地路径**：新增 `core/skills/promptTemplateLoader.ts`，扫描 `~/.private-agents/prompts/*.md` 与 `<ws>/.agents/prompts/*.md`，在 `core/commands/registry.ts` 构建时动态注册为命令（`CommandDefinition` 已支持 `summary`/`argumentHint` 形状，见 `entrypoints/slashCommandRegistry.ts:17-27`）。

### 3.3 上下文文件（AGENTS.md）不被加载（置信度：高）

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

## 5. 未能验证的项

1. **pi 的扩展实际运行效果**：pi 的 `node_modules` 不存在，未能实跑 `pi -e ./ext.ts` 验证其扩展宿主行为。上述 pi 侧结论全部来自**其文档与源码**，未做实机对照。
2. **`runtime/resources/` 是否曾被接线**：其 `projection.ts` 只有测试导入者（`provider/registry/provider.test.ts:5`）。未追溯 git 历史确认它是否曾有过生产消费者。
3. **`docs/` 中是否有技能/插件的既有设计文档**：仅做了关键词级 grep，未逐份阅读 770 份 `docs/`，可能遗漏既有设计意图记录。
4. **`core/commands/marketplaceCommandRuntime.ts` 的源 URL 是否可达**：未做网络请求，未验证 `github.com/private-coding-agents/marketplace` 是否存在。
