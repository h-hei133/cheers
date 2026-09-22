---
title: "Phase 3 对照研究：逐决策对照参考实现的具体决定（同意 / 不同意 / 未考虑）"
category: article
sources: [pi-source-2026-09-21, phase-3-decisions-2026-09-21, phase-3-pre-research-2026-09-21, reference-repositories-rule]
created: 2026-09-21
updated: 2026-09-21
tags: [features, phase-3, comparison, research, decisions]
summary: "Phase 3 开工前的**对照研究**（证据层，非裁决层）：按 `agent-rules/reference-repositories.md` 的「Compare Decisions Before Implementing」纪律，把 pi 对 Phase 3 七项决策的**具体决定**逐条列出，并标注我方是同意、不同意、还是**未考虑**。共 **40 处「未考虑」**与**两处我方论证错误**。最重要的四条：①pi 的 `thinkingBudgets` 是活机制（档位→数值预算，Anthropic/Google/Bedrock 原生消费，注释明写与 `thinkingFormat` **无关**），我方 T3 的「双来源冲突」论证被推翻——删除仍对，但理由须换成「我方无消费位点」；②我方**已经**暴露在 pi 那条注释警告的失效模式里（同时发 `reasoning_effort` 与 `max_tokens: 4096`），我方是检测而非预防；③项目技能、项目设置、扩展、提示词、主题、`SYSTEM.md` 在 pi 里共用一个信任门（7 类资源），而我方 `SkillLoader` **零信任检查**；④**实测我方 `SkillLoader.scan` 只读一层，3 个嵌套技能只发现 1 个**。**本文档只提供证据；全部裁决见 `phase-3-decisions.md`（含 44 项补充裁决与 5 个审查者的 13 处更正）。**"
confidence: high
---

# Phase 3 对照研究

> **性质**：按对照纪律提取参考实现的**具体决定**，逐条标注我方立场。**零代码改动。**
> **上游**：`phase-3-decisions.md`（七项裁决）、`phase-3-pre-research.md`（地形测绘）。
> **纪律来源**：`agent-rules/reference-repositories.md` 的 **Compare Decisions Before Implementing**。

---

## 0. 方法

### 0.1 采用的纪律（原文要点）

> - List the decisions it makes, one line each — key derivation, ordering, fallbacks, what it
>   deliberately refuses to do, and what it does about the cases your plan treats as edge cases.
> - For each, state whether your plan agrees, disagrees, or has not considered it. **"Not
>   considered" is the finding**: it is where the defect hides.
> - Where you disagree, name the reason. A disagreement with a stated reason is a decision; a
>   disagreement by omission is a defect waiting to be found.
> - Then write a test that fails when the reference's decision is reversed.

**本文件的组织**：每项决策给出三张清单——**同意** / **不同意（附理由）** / **未考虑（即发现）**。

### 0.2 「未考虑」优先于「不同意」

**不同意的成本可控**（我们看过 pi 的做法，明确选择不跟）；**未考虑的成本不可控**（我们不知道那个决定存在，因此不知道自己在放弃什么）。本轮最重要的产出全部来自「未考虑」栏。

### 0.3 分工与核验

| 角色 | 职责 |
|---|---|
| 5 个子代理（`scout`） | 只提取 pi 的决定，**不推荐** |
| 主代理 | 逐条核验 pi 的 file:line，然后判定同意/不同意/未考虑 |

**主代理独立核验的项**（未采信子代理转述）：`thinkingBudgets` 的真实消费链、`--no-require-git` 语义、`loadProjectContextFiles` 的遍历边界、`getCompactionTokenSetting` 的解析链、`skills.ts` 的自遍历+ignore、`project-trust.ts` 的决策顺序、`resource-loader` 的信任门。

---

## 1. T1 — 文件遍历与忽略规则

### 1.1 pi 的决定（逐条）

| # | 决定 | 证据 |
|---|---|---|
| 1 | **find/grep 完全不做进程内遍历**——把剪枝、隐藏文件策略、提前停止**全部委托**给 `fd`/`rg` | `find.ts:182`、`grep.ts:162-166` |
| 2 | find 的完整命令行 | `fd --glob --color=never --hidden [--no-require-git] --max-results <N> [--full-path] -- <pattern> <root>` |
| 3 | grep 的完整命令行 | `rg --json --line-number --color=never --hidden [--ignore-case] [--fixed-strings] [--glob <g>] -- <pattern> <root>` |
| 4 | **上限推到遍历源头**（`--max-results` 交给 fd），不是事后过滤 | `find.ts:199` |
| 5 | grep 在流中计数并在达上限时**杀掉子进程** | `grep.ts:234-237` `matchLimitReached = true; stopChild(true);` |
| 6 | **非 git 目录**：手工向上找 `.git`，找不到则加 `--no-require-git` | `find.ts:184-198` |
| 7 | **grep 没有对应的 git 探测**——rg 用自己的默认行为 | `grep.ts` 全文无 `--no-require-git`（已核验 0 命中） |
| 8 | 结果**不按 root 过滤**，只做相对化；越界渲染为 `../…` 或裸 basename | `find.ts:16-24`、`grep.ts:137-144` |
| 9 | 上限对模型**可见且可操作**：`"1000 results limit reached. Use limit=2000 for more, or refine pattern"` | `find.ts:281-284` |
| 10 | 字节上限 50KB，独立于条数上限 | `truncate.ts:12` |
| 11 | **不提供任何忽略规则输入**——schema 只有 `{pattern, path, limit}` | `find.ts` schema |
| 12 | 二进制**无校验和/签名**，仅依赖 TLS | 已核验：`grep checksum\|sha256\|signature\|createHash\|gpg` → **0 命中** |
| 13 | 离线/失败 → 工具**硬失败**，**无回退遍历** | `find.ts:177-179` `reject("fd is not available and could not be downloaded")` |
| 14 | 有 `PI_OFFLINE` 显式开关，Android 拒绝下载并提示 `pkg install` | `tools-manager.ts:14-18,366-372` |
| 15 | 启动时**预热**下载（TUI 挂载后并发），避免启动卡顿 | `interactive-mode.ts:1017-1023` |
| 16 | 把受管 bin 目录**注入子 shell 的 PATH** | `shell.ts:138-142` |
| 17 | 容忍部分失败：rg exit 1（无匹配）= 成功；fd 非零但有输出则保留输出 | `grep.ts:251`、`find.ts:251-258` |
| 18 | `ls` 是**唯一**的进程内遍历，**不应用任何忽略规则**，含 dotfiles | `ls.ts:62,102` |

### 1.2 我方**同意**

| pi 的决定 | 我方立场 |
|---|---|
| #4 上限推到遍历源头 | **同意**（且我方 T1 的剪枝就是同一个思想） |
| #9 上限对模型可见且可操作 | **同意**——我方 T1 计划里**漏了**这一条，补入（见 §1.4） |
| #11 不暴露忽略规则输入 | **同意**——用户写 `.gitignore` 即可，不需要工具级旋钮 |
| #12 无校验和 | **同意拒绝**——我方拒绝二进制下载的理由因此更硬 |
| #13 无回退遍历 | **不同意**（见 §1.3） |
| #15/#16 预热与 PATH 注入 | **不适用**——我方无受管二进制 |

### 1.3 我方**不同意**（附理由）

| # | pi 的决定 | 我方选择 | 理由 |
|---|---|---|---|
| A | 委托 `fd`/`rg` 二进制（含下载） | 进程内遍历 + `git ls-files` | 引入网络依赖与供应链面；我方只有 3 个依赖。**且 pi 自己的离线失败是硬失败**（#13），证明这条路径的降级能力比我方差 |
| B | `ls` 不应用任何忽略规则 | 目录列举应用 T1 的统一忽略层 | `ls` 与 `find`/`grep` 在 pi 里行为不一致（同一产品两套可见性）。照搬会在我方工具集里制造第 4 份不一致列表——正是 T1 要消除的 |

### 1.4 我方**未考虑**（本轮发现）

**发现 1（重要）：pi 在非 git 目录下仍然尊重 `.gitignore`。**

`find.ts:184-187` 的注释原文：

> fd normally ignores .gitignore outside git repos, so keep `--no-require-git` there. Inside repos, use fd's default git-aware behavior so parent `.gitignore` rules stop at nested repo boundaries.

即 pi 的语义是：

| 场景 | pi | 我方计划 |
|---|---|---|
| 在 git 仓库内 | gitignore 生效，**且父级规则在嵌套 repo 边界停止** | `git ls-files` 生效 |
| **不在 git 仓库内** | **gitignore 仍然生效**（`--no-require-git`） | **完全不生效**（回退到纯剪枝） |

**我方 `phase-3-decisions.md` §1.6 把「非 git 目录无 gitignore 支持」写成「诚实的降级」——这个定性过宽了。** pi 证明在非 git 目录下保留 gitignore 是可行的，且它只需要一个纯路径判断（向上找 `.git`），不需要 git 命令。**这是一个能力缺口，不是等价降级。**

**修正建议**：第 2 层改为「先判断是否在 git 仓库内（向上找 `.git`，与 pi 同法）」：
- 在仓库内 → `git ls-files`（语义最准，含 `core.excludesFile` 与嵌套规则）；
- 不在仓库内 → **仍然读取 `.gitignore`/`.ignore` 并做进程内匹配**（pi 的 `skills.ts` 已给出参考实现，见发现 3）。

**发现 2：pi 的 find 有 git 探测而 grep 没有——同产品内不对称。**

`find.ts:184-198` 有 `.git` 向上遍历；`grep.ts:162-166` 没有任何 repo 判断（已核验 0 命中）。两个工具在**同一个产品里用两套忽略策略**。

**我方从未考虑这种不对称。** 我方 T1 的目标恰恰是**消除**三份不一致的列表，因此这个发现的价值是**反面的**：它证明「同一产品内工具行为不一致」是真实存在的失败模式，且 pi 犯了。**我方必须避免重蹈**——这强化了 T1 的「统一忽略层」设计，并给出一条可验证的验收标准：**三工具的可见文件集必须逐字节相同**。

**发现 3：pi 在 `skills.ts` 里有**一套完整的进程内 ignore 实现**——这才是与我方方案同构的部分。**

`skills.ts:2,16,47-63,175-266`：

```ts
import ignore from "ignore";
const IGNORE_FILE_NAMES = [".gitignore", ".ignore", ".fdignore"];

function addIgnoreRules(ig: IgnoreMatcher, dir: string, rootDir: string): void {
  const relativeDir = relative(rootDir, dir);
  const prefix = relativeDir ? `${toPosixPath(relativeDir)}/` : "";
  for (const filename of IGNORE_FILE_NAMES) {
    ...
    const patterns = content.split(/\r?\n/).map((line) => prefixIgnorePattern(line, prefix))...
    ig.add(patterns);
  }
}
```

且遍历时**递归前**检查：

```ts
const ignorePath = isDirectory ? `${relPath}/` : relPath;
if (ig.ignores(ignorePath)) { continue; }        // ← 遍历期剪枝
if (isDirectory) { ... loadSkillsFromDirInternal(fullPath, source, false, ig, root); }
```

**这与我方第 1 层（遍历期剪枝）+ 第 2 层（`.gitignore`）的设计同构**，且 pi 的做法是：
- 用 `ignore` npm 包（**1 个依赖**）；
- 支持**三个**忽略文件名（`.gitignore`/`.ignore`/`.fdignore`）；
- 手工处理嵌套目录的**前缀改写**（`prefixIgnorePattern`）；
- `ig` 递归传递，**累积**嵌套规则；
- 硬编码跳过 `.` 前缀目录与 `node_modules`。

**我方从未考虑**：① `.ignore`/`.fdignore` 这两个额外的忽略文件名；② 嵌套前缀改写这个具体难点（我方原计划依赖 `git ls-files` 绕过了它）。

**这意味着**：如果按发现 1 的修正做「非 git 目录下仍读 `.gitignore`」，我方**必须**自己实现嵌套前缀改写——而这正是 `git ls-files` 原本替我方言掉的复杂度。**成本从「零」变成「一个手写解析器或一个依赖」。** 这个取舍必须显式裁决（见 §8）。

**发现 4：结果不按 root 过滤，越界渲染为 `../…`。**

pi 保留 root 之外的结果并相对化（`find.ts:16-24`），grep 越界时退化为**裸 basename**（`grep.ts:139-142`）。**我方计划未规定结果与 root 的关系**，而我方 T1 已实测「`git ls-files` 从子目录运行会返回仓库相对路径且含 cwd 之外的文件」——**这正是同一个问题**，pi 的答案是「保留并标记」，我方的答案是「过滤掉」。两者都可行，但我方必须**显式选定并写进文档**，不能留空。

**发现 5：我方 T1 计划没有结果上限与截断通知。**

pi 的 find 上限 1000、grep 上限 100、ls 上限 500，且**全部**给出可操作通知（`"Use limit=2000 for more, or refine pattern"`、`"Use read tool to see full lines"`）。我方 T1 只规定了「遍历期剪枝」，**未规定结果上限**——一个巨型仓库的 `glob **/*` 仍会把全部结果塞给模型。

**发现 6：平台差异（Windows glob 语义）。**

`find.ts:201-213`：`--full-path` 模式需要 `**/` 前缀，win32 上 `/` 要改写成 `[/\\]` 字符类。我方 glob 匹配**没有 Windows 语义故事**。

**发现 7：失败容忍策略。**

rg exit 1（无匹配）视为成功、kill-on-limit 免于错误检查、fd 非零但有输出则保留、stat 失败的条目静默跳过（`ls.ts:125-128`）。**我方未考虑**这些部分失败形态。

---

## 2. T2 — 项目指令文件注入

### 2.1 pi 的决定（逐条）

| # | 决定 | 证据 |
|---|---|---|
| 1 | 候选文件名与优先级：`AGENTS.override.md` > `AGENTS.md` > `AGENTS.MD` > `CLAUDE.md` > `CLAUDE.MD`，**每目录取首个命中** | `resource-loader.ts:71-73` |
| 2 | 全局 agent 目录**先于**所有项目文件 | `resource-loader.ts:129-133` |
| 3 | 祖先遍历**走到文件系统根**——`if (parentDir === currentDir) break;`，**无项目根标记** | `resource-loader.ts:150` |
| 4 | 去重按解析后的**绝对路径**字符串（`seenPaths`） | `resource-loader.ts:131,145` |
| 5 | 处理 **linked worktree 的遮蔽**：主仓库的 context file 若被 worktree 自己的副本遮蔽，不重复加载 | `resource-loader.ts:89-111` |
| 6 | 注入位置：system prompt 的 `project_context` **分节** | `system-prompt.ts:164` |
| 7 | 渲染为 `<project_instructions path="...">` 嵌套在 `<project_context>` 内，**含文件绝对路径** | `system-prompt.ts:77-84` |
| 8 | **分节逐请求 diff**——未变的节**不重发** | `system-prompt.ts:204-215` `diffSystemPromptSections` |
| 9 | 包装成同名标签是**刻意**的，便于模型匹配后续更新 | `system-prompt.ts:44-49` 注释 |
| 10 | **无体积上限**——截断机制只用于工具输出，不用于 context files | 已核验：`resource-loader.ts` 无 `maxBytes`/`truncat` |
| 11 | 退出开关：CLI `--no-context-files` / `-nc` | `cli/args.ts:194-195` |
| 12 | 不可读文件 → **黄字警告到 stderr** 并跳过；同名目录 → 跳过；超大文件 → 全量读入 | `resource-loader.ts:75-88` |
| 13 | **不做**嵌套目录懒加载——只在 `reload()` 时重新读取 | `resource-loader.ts:515-524` |
| 14 | 内容捕获进 `contextFiles` 后，**只有 `reload()` 会刷新** | `agent-session.ts:1128` |

### 2.2 我方**同意**

| pi 的决定 | 我方立场 |
|---|---|
| #1 候选优先级与「每目录取首个」 | **同意**（我方采纳同一顺序） |
| #2 全局目录优先 | **同意** |
| #4 按绝对路径去重 | **同意** |
| #6/#7 system prompt 分节 + 含路径 | **同意**（我方也放稳定前缀、也带路径） |
| #11 CLI 退出开关 | **同意**（我方额外加配置项） |
| #12 不可读则警告并跳过 | **同意**——明确**不采纳** `opencode` 的「不可读与不存在无法区分」 |
| #13 不做嵌套懒加载 | **同意** |

### 2.3 我方**不同意**（附理由）

| # | pi 的决定 | 我方选择 | 理由 |
|---|---|---|---|
| A | #3 遍历走到**文件系统根** | 止于**项目根标记**（`.git`） | 走到文件系统根会把 `~/AGENTS.md` 注入每个项目。且我方 T1 已需判断「是否在 git 仓库内」，**同一判定可复用** |
| B | #8 分节逐请求 diff | 直接拼进系统提示字符串 | 我方 `buildSystemPrompt` 在 `cliRuntimeInvocation.ts:207` **每次 run 只算一次**，不需要增量更新机制。diff 系统的存在理由是「结构化 system 消息要能被增量 patch」——我方没有这个需求 |
| C | #10 无体积上限 | **32 KiB 总预算**（codex 形状） | pi 会把 5 MB 的 `AGENTS.md` 原样塞进每次请求。我方 `AGENTS.md` 8.9 KB 正常，但**用户仓库的文件不由我方控制** |

### 2.4 我方**未考虑**（本轮发现）

**发现 1：linked worktree 的遮蔽处理。**

`resource-loader.ts:89-111` 的 `findShadowedContextFile` 处理一个具体场景：git 链接工作树里，主仓库的 context file 与 worktree 自己的副本**占据同一逻辑仓库作用域**，都加载会应用两次。注释原文：

> The main repo's context file that a nested linked worktree's own copy shadows: both occupy the same logical repository scope, so loading both applies that context twice. Returns undefined when nothing is shadowed, leaving normal ancestor inheritance alone.

**我方完全未考虑 worktree。** 这是一个真实的双重注入缺陷，且修复它需要「canonicalize 路径 + 识别 worktree 关系」。**我方是否需要**取决于是否支持 worktree 工作流——但至少要显式裁决，不能沉默。

**发现 2：同名标签是刻意的，用于后续更新匹配。**

`system-prompt.ts:44-49` 的注释说明「每个非 preamble 节都包在同名标签里，**以便模型能把后续更新匹配到它**」。我方若不做 diff（§2.3 B），这个理由不成立——**但我方仍应保留标签**，因为标签本身给了模型结构化边界。**这个决定我方可独立论证，不必依赖 pi 的 diff 理由。**

**发现 3：分节本身的价值与 diff 无关。**

pi 的 `SystemPromptSections` 把提示词拆成 `preamble`/`tools`/`rules`/`docs`/`addendum`/`project_context`/`skills`/`cwd`（`system-prompt.ts:144-170`）。**即使不做 diff，分节也让「哪些内容属于哪一类」在代码里显式**。我方 `buildSystemPrompt` 是一个字面量数组——**加注入内容时会把字面量与动态内容混在一起**。**我方未考虑是否要引入分节结构。**

**发现 4：pi 的注入顺序是「全局 → 根 → … → cwd」。**

`ancestorContextFiles.unshift(...)` 使祖先文件**根在前、cwd 在后**（`resource-loader.ts:147`），全局文件在最前。**这个顺序（由远及近）与我方计划一致，但我方未显式记录它**——而顺序影响模型如何理解「更具体的规则覆盖更一般的」。

**发现 5（重要）：pi 在**同一个产品里有两种祖先遍历边界**——AGENTS.md 走到文件系统根，技能停在 git 根。**

已核验两处实现：

| 资源 | 遍历边界 | 证据 |
|---|---|---|
| **AGENTS.md / CLAUDE.md** | **文件系统根**（`if (parentDir === currentDir) break;`） | `resource-loader.ts:150` |
| **`.agents/skills/`** | **git 仓库根**（`if (gitRepoRoot && dir === gitRepoRoot) break;`） | `package-manager.ts:462-479` |

且 pi **已经有一个 `findGitRepoRoot` helper**（`package-manager.ts:448-460`，向上找 `.git`），但 `resource-loader.ts` **没有用它**（已核验：`grep findGitRepoRoot resource-loader.ts` → **0 命中**）。

**这是一处真实的不一致**：同一产品里，「项目指令文件」的继承范围比「项目技能」更大。`resource-loader.ts` 的注释解释了自己的选择（worktree 遮蔽处理），但**没有解释为什么与技能不同**。

**对我方的意义**：我方 `phase-3-decisions.md` §2.2.1 选择「止于项目根标记（`.git`）」——**这与 pi 的技能一致，与 pi 的 AGENTS.md 不一致**。这个发现的价值是：**我方选择的边界在 pi 里有先例（技能侧），且 pi 的 AGENTS.md 侧是无意的更宽边界**。我方的决定因此更站得住，但应把「为什么与 pi 的 AGENTS.md 不同」写进文档（理由：`~/AGENTS.md` 不该注入每个项目）。

**发现 6：pi 的分节 diff 是为「支持会话中途 system 消息的 provider」服务的——我方不在这条分支上，这反过来验证了我方的选择。**

pi 的分节机制（`diffSystemPromptSections` → 会话中途的 system 消息 patch）**只对支持 mid-conversation system 消息的 provider 有意义**。对不支持的 provider，pi 用 `collapseSystemMessages` 把整份提示词**重新折叠到首条消息**（`transcript.ts:108-112`）：

```ts
export function collapseSystemMessages(context: TranscriptContext): TranscriptContext {
    const head = getCurrentSystemMessage(context.messages);
    const messages = context.messages.filter((message) => message.role !== "system");
    return { messages: head ? [head, ...messages] : messages } as TranscriptContext;
}
```

**我方已核验属于后一种**：`turn/step.ts:106` 只发**一条**前导 system 消息（`{ role: "system", content: request.systemPrompt }`），无中途 system 消息。

**即：我方 `buildSystemPrompt` 每次 run 重建一个字符串的做法，与 pi 在「无 mid-convo system 支持」分支上的行为等价。** 我方不采纳分节 diff（§2.3 B）**不只是「不需要」，而是「pi 的机制在我方对应的分支上退化为同样的事」**。这使 §2.3 B 的裁决从「我们选了更简单的做法」升级为「我们选了 pi 在该分支上实际执行的做法」。

**发现 7：`AGENTS.override.md` 是刻意的逐目录覆盖逃生口。**

pi 的候选集是**五个**文件名（`resource-loader.ts:72`）：`AGENTS.override.md` > `AGENTS.md` > `AGENTS.MD` > `CLAUDE.md` > `CLAUDE.MD`。其中 `AGENTS.override.md` 是**专为「覆盖」设计的**——它排在最前，使一个目录能用它替换掉同目录的 `AGENTS.md`。

**我方计划只考虑了 `AGENTS.md`/`CLAUDE.md` 的优先级，未考虑 `.override` 这个逃生口。** 价值：它让「临时覆盖项目规则」不需要改动 `AGENTS.md` 本身（对 git 工作树友好）。**建议采纳**——成本是一个数组项。

**发现 8：刷新触发是显式的 `/reload` 命令，且它同时刷新所有资源。**

pi 的 `/reload` 描述（`slash-commands.ts:42`）：

> Reload keybindings, extensions, skills, prompts, themes, and context files

**我方计划只说「会话中途修改不生效」，未规定如何让它生效。** pi 的答案是「一个显式命令刷新全部」。**建议采纳同一形状**——我方已有 `/` 命令体系，加一个 `/reload` 即可；且「刷新全部」比「只刷 `AGENTS.md`」更可预测。

**发现 9：BOM 剥离与「目录名为 AGENTS.md」的处理。**

pi 在读取时 `stripBom`（`resource-loader.ts:81`），且用 `statSync().isFile()` 跳过同名目录，**使下一个候选（如 `CLAUDE.md`）有机会胜出**（`resource-loader.ts:77-79`）。我方 `read` 工具已有 BOM 剥离（`splitByteOrderMark`），**但上下文文件加载是另一条路径**——需确认它是否复用同一处理。**同名目录使下一候选胜出**这个行为我方未考虑（我方的直觉是「跳过该目录」）。

---

## 3. T2b — 技能暴露

### 3.1 pi 的决定

| # | 决定 | 证据 |
|---|---|---|
| 1 | 清单文件名 `SKILL.md`；两个默认根目录也接受根级 `.md` | `skills.ts:150,236-249` |
| 2 | frontmatter 只解析 `name`/`description`/`disable-model-invocation` 进行为 | `skills.ts:66-72` |
| 3 | `name` 缺省回退到父目录名；`description` 缺失则**丢弃该技能** | `skills.ts:326-328,338-340` |
| 4 | 注入 **XML 目录**，字段仅 `name`/`description`/`location`——**不含正文** | `skills.ts:355-388` |
| 5 | 告知模型用**通用 `read`**（或 `bash`）加载正文，**无专用工具** | `skills.ts:361-363` |
| 6 | 提示模型「技能里的相对路径要相对技能目录解析」 | `skills.ts:364` |
| 7 | 逐技能退出：`disable-model-invocation: true` → 从提示中隐藏，仍可 `/skill:name` 调用 | `skills.ts:356,366` |
| 8 | 每个技能同时注册为 `/skill:name` 命令 | `interactive-mode.ts:759-768` |
| 9 | `/skill:name` **强制注入正文**为用户消息 | `agent-session.ts:1508-1533` |
| 10 | 按解析后的真实路径 + 名字去重，**首个胜出**，冲突出诊断 | `skills.ts:472-499` |
| 11 | **无数量上限、无排序**——按发现顺序 | 已核验：`skills.ts` 无 `sort`/`slice`/`MAX_SKILLS` |
| 12 | **文档自承失败模式**：模型不总会去读 | `docs/skills.md:86-91` |
| 13 | 技能发现**自己遍历**并用 `ignore` 包过滤（不用 fd） | `skills.ts:175-266` |

### 3.2 我方**同意**

| pi 的决定 | 我方立场 |
|---|---|
| #4 只注入目录不注入正文 | **同意**——`pi`/`opencode` 两个独立实现一致 |
| #5 复用 `read`，不加专用工具 | **同意** |
| #6 提示相对路径解析规则 | **同意**——**我方计划漏了这条**，补入 |
| #7 `disable-model-invocation` 逐技能退出 | **同意** |
| #9 `/skill:name` 强制注入正文 | **同意**——这正是 pi 对 #12 的补偿，我方已有 `/skill` 命令可扩展 |
| #10 首个胜出 + 冲突诊断 | **同意** |
| #11 不设上限 | **同意**（目录注入天然受 T2 的 32 KiB 预算保护） |
| #13 自己遍历 + ignore 过滤 | **同意**——与我方 T1 同构（见 §1.4 发现 3） |

### 3.3 我方**不同意**（附理由）

| # | pi 的决定 | 我方选择 | 理由 |
|---|---|---|---|
| A | #12 把「模型不总会读」当作已知缺陷、靠 `/skill:name` 补偿 | 采纳同样补偿，**但把它写进验收标准** | pi 的补偿是对的，但它把这个失败模式**留在文档里**而非测试里。我方应有一条可失败的测试（见 §7） |

### 3.4 我方**未考虑**（本轮发现）

**发现 1：pi 的 `disable-model-invocation` 是「隐藏但可用户调用」——两个集合的交集语义。**

我方 `phase-3-decisions.md` §3.5 只说了「无 description 则丢弃」。**pi 的退出字段语义更精确**：它不是「禁用技能」，而是「从模型视野隐藏，保留用户调用路径」。我方需确认 `Skill` 类型能否表达这个区分——已核验我方 `Skill` 带 `source` 但**无隐藏标志**。

**发现 2：pi 的目录条目含 `location` 绝对路径，`opencode` 不含。**

我方计划采纳 pi（含 `location`），但**未记录为什么不跟 opencode**：opencode 能省掉 `location` 是因为它有**专用工具按名查找**；我方复用 `read`，**必须**给绝对路径。这是一个**被依赖关系决定的选择**，应写进文档。

**发现 3：项目技能也受**同一个项目信任门**控制——T2b 与 T5 共用一个门。**

已核验（`package-manager.ts:2398-2401,2425-2435`）：

```ts
const projectTrusted = this.settingsManager.isProjectTrusted();
const projectAgentsSkillDirs = projectTrusted
    ? collectAncestorAgentsSkillDirs(this.cwd).filter((dir) => resolve(dir) !== resolve(userAgentsSkillsDir))
    : [];
```

且 `.pi/skills` 的加载在 `if (projectTrusted) { ... }` 块内。

**即：在 pi 里，项目技能 = 项目设置 = 项目扩展 = 包安装，四者共享一个信任位。** 一个未信任的仓库，其 `.agents/skills/` **完全不进入模型视野**。

**我方完全未考虑这个交互。** 我方 `phase-3-decisions.md` 把 T2b（技能注入）与 T5（信任门）当作**独立决策**分别裁决。但若 T2b 要注入**项目级**技能（我方 `SkillLoader` 已支持 `<workspace>/.agents/skills`，`skillLoader.ts:40`），**就必须决定它是否过信任门**。

**这是一个真实的攻击面**：项目技能的内容会**直接进入系统提示**。一个克隆的仓库若能在其 `.agents/skills/SKILL.md` 里写指令，就等于**未经验证地向模型注入文本**——比执行代码更隐蔽（代码至少要过 `registerCommandHook` 的信任门）。

**且我方当前已经具备这个读取路径**（已核验 `skillLoader.ts:32-42`）：

```ts
this.roots = [
  { dir: path.join(home, ".cheers", "skills"), source: "user" },
  // Project skills win: a repository that ships its own way of doing something
  // should override the user's general habit for that repository.
  { dir: path.join(path.resolve(workspaceRoot), ".agents", "skills"), source: "project" },
];
```

`grep -c "trust\|Trust" skillLoader.ts` → **0**。即：**今天这个注入面是「惰性」的**（技能只喂 `/skill` 打印与 UI 选择器，不进提示词）；**一旦 T2b 把技能目录接进 `buildSystemPrompt`，这个面就被激活了**，且项目技能会**覆盖**用户同名技能（注释明写 "Project skills win"）。

**这不是 T2b 引入的新缺陷，而是 T2b 会让一个既有的无防护读取路径变得有实际后果。** 因此 T2b 的施工**必须**同时解决信任判定——不能分两轮。

**修正建议**：T2b 必须明确——
- **用户级技能**（`~/.cheers/skills`）：无条件注入；
- **项目级技能**（`<workspace>/.agents/skills`）：**必须过与 T5 相同的信任门**。

这与 §6.4 发现 3 是同一结论，但**攻击面更直接**（提示注入 vs 代码执行）。应把 Q5 的裁决范围扩大到技能。

**发现 4：pi 的 `allowed-tools` 是**文档化了但从未读取**的字段——与我方 T3 的死字段**同类缺陷**。**

已核验：`docs/skills.md:148` 声明

| `allowed-tools` | No | Space-delimited list of pre-approved tools (experimental). |

而 `grep allowed-tools\|allowedTools` 于 `packages/coding-agent/src` → **0 命中**（同一搜索确认 `license`/`compatibility`/`metadata` 也从未被读取；只有 `name`/`description`/`disable-model-invocation` 进入行为）。

**这是与我方 T3 完全同构的缺陷**：一个「声明了能力、零消费者」的字段，且**被写进用户文档**。pi 比我们更严重——我方至少没把它写进文档。

**价值**：这是**第三个独立实现**出现同一类缺陷（我方 `thinkingBudgets`/`promptCacheTtl`、pi 的 `allowed-tools`）。说明「声明了但没接线」是这类产品的**系统性失效模式**，不是我方的孤立失误。**支持 T3 的删除裁决，也提示我方应在文档与类型之间做一致性检查**（见 Q16）。

**发现 5：pi 的校验分两级——「缺 description」硬失败，「名字/长度不合规」仅警告。**

已核验（`skills.ts:318-341`）：

```ts
const nameErrors = validateName(name);
for (const error of nameErrors) { diagnostics.push({ type: "warning", message: error, path: filePath }); }

// Still load the skill even with warnings, unless description is missing or empty.
if (!hasDescription) { return { skill: null, diagnostics }; }
```

即：**名字超 64 字符、字符集不合规、description 超 1024 → 仅警告，技能仍加载**；**只有缺/空 description 才不加载**。

**我方 `phase-3-decisions.md` §3.5 只规定了「无 description 则丢弃」**，未规定名字/长度不合规如何处理。**pi 的两级划分是合理的**：description 是模型**匹配技能的唯一依据**（缺了就无法被发现），而名字格式问题是**可容忍的瑕疵**。

**发现 6：pi **刻意不要求** `name` 与父目录名一致——并给出了理由。**

`docs/skills.md:145` 原文：

> `name` | Yes | Max 64 chars. Lowercase a-z, 0-9, hyphens. **Unlike the standard, Pi does not require this to match the parent directory because that standard requirement is suboptimal for shared skill directories.**

即 Agent Skills 标准要求 `name` 匹配目录名，**pi 明确偏离**，理由是「共享技能目录下该要求不合理」。

**我方未考虑**：`SkillLoader` 的 `readSkill(filePath, dirName, source)` 把 `dirName` 作为 fallback（`skillLoader.ts:68,90`），但**未校验 `name` 是否与目录一致**。**我方的默认行为与 pi 一致（不强制）**，但**未记录这是一个刻意的标准偏离**。应显式记录——否则将来有人「修复」它就会引入不兼容。

**发现 7：技能根目录**不再继续递归**，且根级散落 `.md` 的加载规则因模式而异。**

已核验（`package-manager.ts:378-399`）：找到 `SKILL.md` 后 **`return entries`**——该目录即为技能根，**不再向下递归**。

且根级散落 `.md` 的规则是：

```ts
const shouldIncludeMarkdownFile = isFile && entry.name.endsWith(".md") && !ig.ignores(relPath)
    && ((mode === "pi" && dir === root) || (mode === "agents" && dir !== root));
```

即：**`~/.pi/agent/skills` 与 `.pi/skills`（pi 模式）在根级收 `.md`；`.agents/skills`（agents 模式）根级不收，但子目录收**。

**我方 `SkillLoader` 的 `scan` 行为不同**——**且已实测是一个真实缺陷**。

我方 `scan`（`skillLoader.ts:53-74`）**只读一层**：它遍历根目录的条目，对目录取 `<dir>/SKILL.md`，对 `.md` 文件直接取。**没有任何递归调用**（`grep -c "scan("` → 2，即定义 + `load()` 里的一次调用，**无自递归**）。

**实测**（构造 fixture：`top/SKILL.md`、`group/nested/SKILL.md`、`nested/deep/SKILL.md`，复刻我方 `scan` 逻辑运行）：

```
discovered: [ 'top-skill' ]
on disk    : [ 'top-skill', 'nested-skill', 'deep-skill' ]
```

**3 个技能只发现 1 个。** 任何把技能放进子目录的用户都会**静默丢失**技能。

**这不是我的推测——pi 有两条专门测试这个行为的用例**（`packages/coding-agent/test/skills.test.ts:97-116`）：

```ts
it("should load nested skills recursively", () => {
    const { skills, diagnostics } = loadSkillsFromDir({ dir: join(fixturesDir, "nested"), source: "test" });
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("child-skill");
    expect(diagnostics).toHaveLength(0);
});

it("should prefer a directory's root SKILL.md over nested SKILL.md files", () => {
    const { skills } = loadSkillsFromDir({ dir: join(fixturesDir, "root-skill-preferred"), source: "test" });
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("root-skill-preferred");
    expect(skills[0].description).toBe("Root skill should win.");
});
```

且 pi 的 fixture 目录里就有 `nested/child-skill/SKILL.md` 与 `root-skill-preferred/nested-child/SKILL.md`。**opencode 的真实技能也采用同样布局**（`opencode/.opencode/skills/effect/SKILL.md`、`rtl-aware-development/SKILL.md`）。

**即：`<root>/<name>/SKILL.md` 与 `<root>/<group>/<name>/SKILL.md` 两种布局在参考实现里都被支持且被测试。**

**这是本轮发现的第二个真实缺陷**（第一个是 T6 的 EISDIR）。它与 T2b 直接相关：**T2b 要注入技能目录，但目录本身是残缺的**——注入一个漏掉 2/3 技能的目录，比不注入更糟（模型以为看到了全部）。

**必须与 T2b 同批修**：`scan` 需要递归，且语义与 pi 一致——**找到 `SKILL.md` 的目录不再向下递归**（`return entries`），否则继续。两条测试应对应移植。

**发现 8：`--skill` CLI 参数**即使与 `--no-skills` 同时给出也生效**（additive）。**

pi 的发现顺序（`package-manager.ts:917-968`）：已安装包 → settings 的 `skills` 数组（项目优先于用户）→ 自动发现 → CLI `--skill`。

**我方未考虑 CLI 级的技能路径注入**，也未考虑「显式指定的技能应覆盖禁用开关」这个语义。

---

## 4. T3 — 删除 `thinkingBudgets` 与 `promptCacheTtl`

### 4.1 ⚠️ 本轮最重要的一处自我更正

**我方 `phase-3-decisions.md` §4.2 的论证被 pi 的实现推翻。**

原文声称：`thinkingBudgets` 与活轨的 `reasoning_effort` 语义冲突，「接线会产生两个 thinking 来源」——**这是错的**。

**pi 的 `thinkingBudgets` 是活机制，且与档位互补而非冲突**（已逐层核验）：

| 层 | 形状 | 证据 |
|---|---|---|
| 类型 | `{minimal?, low?, medium?, high?}: number` | `settings-manager.ts:67-72` |
| 默认值 | `minimal:1024, low:2048, medium:8192, high:16384` | `simple-options.ts:57-62` |
| 档位→预算映射 | `thinkingBudgetForLevel(level, customBudgets)` → `budgets[clampReasoning(level)]` | `simple-options.ts:68-72` |
| `xhigh`/`max` 处理 | **钳制到 `high` 的预算** | `simple-options.ts:63-66` |
| 消费（token 型 provider） | Anthropic `budget_tokens`、Google `budgetTokens`、Bedrock | `anthropic-messages.ts:1175`、`bedrock-converse-stream.ts:564-568` |
| 消费（OpenAI 兼容） | **仅当** `compat.thinkingTokenBudgetField` 设置时发 `thinking_token_budget`/`thinking_budget`/`thinking_budget_tokens` | `openai-completions.ts:976-977,1004-1023` |
| 与 `reasoning_effort` 的关系 | **同一档位、两种编码**——`reasoning_effort` 是分类值，budget 是该档位的 token 数 | `openai-completions.ts:962-964` vs `976-977` |

**决定性原文**（`openai-completions.ts:974-977`）：

```ts
// Cap reasoning with a top-level budget field. Independent of thinkingFormat: the
// same server can serve zai, qwen or chat-template models. Reasoning and the answer
// share max_tokens here, so an uncapped reasoning phase can consume the whole
// response and leave no answer and no tool call.
if (thinkingTokenBudgetField && thinkingBudget !== undefined) {
    Object.assign(params, { [thinkingTokenBudgetField]: thinkingBudget });
}
```

**三点关键**：① 注释明写「**Independent of thinkingFormat**」——预算与档位**不互斥**，可同时发送；② 预算的职能是 **cap**（上限），不是替代品；③ 它存在的原因是**推理与答案共享 `max_tokens`**——不设上限的推理阶段会吃掉整个响应，导致**既没有答案也没有工具调用**。

**即：在 pi 里，档位（categorical）与预算（numeric）是同一决策的两种序列化，且预算是安全上限。**

### 4.2 那么我方该删还是该接？

**结论：仍然删除，但理由必须换掉。**

| 我方事实（已核验） | 推论 |
|---|---|
| 我方只有**一条**请求路径：`POST /chat/completions`（`turn/step.ts:138`） | 无 token 型 provider 路径 |
| `RuntimeProvider` 声明了 6 个值（`anthropic`/`openai`/`google`/…），但**不驱动请求形状**（已核验：`step.ts` 只有一个请求体） | 声明与实际能力不符 |
| 我方**无** `thinking_token_budget`/`budget_tokens`/`cache_control` 任何字段（已核验 0 命中） | 没有消费位点 |
| 活轨只发 `reasoning_effort`（`turn/step.ts:114`） | 唯一存在的编码方式 |

**正确理由**：`thinkingBudgets` 在我方是死字段，**不是因为它与 `reasoning_effort` 冲突，而是因为我方运行时只有 OpenAI 兼容的单一请求路径，没有 token 型 provider 的消费位点，也没有 `compat.thinkingTokenBudgetField` 这层适配。** 字段描述的能力（按档位设定 token 预算）在我方**不存在**。

**这个更正的价值**：原论证会导致一个错误结论——「将来接入 Anthropic 时也不该有这个字段」。**pi 证明恰恰相反**：接入 token 型 provider 时，数值预算是**必需**的，而 `reasoning_effort` 无法表达它。因此：

> **删除是正确的（当前），但必须记录「接入 token 型 provider 时需要重新引入，形状见 pi 的 `ThinkingBudgets` + `thinkingBudgetForLevel` + `clampThinkingBudgetToAnswerRoom`」。**

### 4.3 `promptCacheTtl` 的对照

**pi 同意「删除」——但方式是「不存在这个形状」**（已核验）：

| 项 | pi | 我方 |
|---|---|---|
| 用户可设的缓存 TTL | **无**（搜 `promptCacheTtl\|cacheTtl` → 仅 CHANGELOG 与适配器内的硬编码字符串） | `"5m" \| "1h"`（零消费者） |
| 实际存在的形状 | 分类 `cacheRetention: "none"\|"short"\|"long"` | — |
| TTL 值 | **硬编码在各 provider 适配器**：Anthropic `"1h"`、OpenAI `"24h"`、responses `"30m"` | — |
| 额外设置 | `cacheWarming`（全局、默认 `"streaming"`、**显式标注「因为每次刷新都花钱」**）、`showCacheMissNotices` | — |
| 模型侧元数据 | `promptCache: {short?, long?}` 秒数，**只读**，且「缺失的档位表示寿命未知，pi 不预热这类缓存」 | — |

**我方未考虑**：① 分类 `cacheRetention` 这个中间层（比 `"5m"|"1h"` 更贴 provider 实际能力）；② `cacheWarming` 的**成本守护**设计（全局限定 + 注释说明理由）；③ 模型侧 `promptCache` 只读元数据。

**裁决不变（删除 `promptCacheTtl`），但记录**：若将来做缓存，pi 的形状是「分类档位 + 适配器内硬编码 TTL + 成本守护的预热开关」，**不是**用户可设的 TTL 字符串。

### 4.4 我方**未考虑**（本轮发现）

**发现 1：逐模型的 thinking 档位层。**

pi 有三层 thinking 配置（`settings-manager.ts:105-106`、`model-config.ts:46-55`）：
- 全局 `defaultThinkingLevel`；
- 逐模型 `modelThinkingLevels["provider/modelId"]`（分类值）；
- 逐模型的 **provider 字符串映射** `thinkingLevelMap`（models.json，把档位映射为 provider 专有字符串）。

**我方 `phase-3-decisions.md` 完全未考虑逐模型 thinking 层。** 我方 `thinkingCommandRuntime.ts` 是项目状态驱动的单点。

**发现 2：`xhigh`/`max` 钳制到 `high` 的预算。**

`clampReasoning`（`simple-options.ts:63-66`）把 `xhigh`/`max` 折叠为 `high`——即**最高的两个档位共享最高预算**。这是一个具体的边界决定（预算表只有 4 档而档位有 6 个），我方未考虑这个映射缺口。

**发现 3（重要）：我方**确实**暴露在 pi 那条注释所警告的失效模式里——但我方是「检测并解释」，pi 是「预防」。**

pi 引入预算上限的理由（`openai-completions.ts:974-977` 注释原文）：

> Reasoning and the answer share max_tokens here, so an uncapped reasoning phase can consume the whole response and leave no answer and no tool call.

**我方完全符合这个前提**（已核验）：`turn/step.ts:114,116` **同时**发送 `reasoning_effort` 与 `max_tokens`（默认 `4096`，`runtimeConfig.ts:135`）。推理与答案共享 4096 的额度。

**我方的处理方式不同**——不预防，而是**检测并给出可操作诊断**（`turn/step.ts:288-299`）：

```ts
export function emptyAnswerExplanation(finishReason: string | null | undefined, reasoningLength: number): string {
  if (finishReason === "length") { return "The reply was cut off before any of it arrived — the context is probably full. Run `/compact` and ask again."; }
  if (finishReason === "content_filter") { return "The provider withheld the reply. Rephrasing the request usually gets past it."; }
  if (reasoningLength > 0) { return `The model spent the whole turn working and never wrote an answer (${reasoningLength} characters of reasoning, shown above). Asking again usually resolves it.`; }
  return `The model returned nothing at all...`;
}
```

**这是一个我方**已有而 pi 未强调**的能力**（按 `reasoningLength > 0` 区分「空响应」与「推理吃满额度」）。**但它替代不了预防**：检测发生在**一次请求白花之后**，而预算上限在**发送前**就避免了它。

**这个发现修正了 §4.2 的结论边界**：`thinkingBudgets` 在我方**不是纯粹的死字段**——它描述的「给推理阶段设上限」对应一个**我方真实存在且未被防护的失效模式**。删除仍然正确（当前无消费位点），但 backlog 项应升级：**接入任何 token 型 provider 前，必须先决定推理预算策略**（无论是 pi 的数值上限，还是 `max_tokens` 与推理额度的分离）。

---

## 5. T4 — 逐模型上下文窗口

### 5.1 pi 的决定

| # | 决定 | 证据 |
|---|---|---|
| 1 | **配置优先**：`contextWindow: override.contextWindow ?? model.contextWindow` | `provider-composer.ts:149` |
| 2 | models.json 的 `modelOverrides` 是**最顶层**，在所有其它层之后应用 | `provider-composer.ts:470-484` |
| 3 | 完整层序（下→上）：内置静态 → 远程目录覆盖 → models.json 自定义模型 → 扩展模型 → models.json `modelOverrides` | `provider-composer.ts:472-481` |
| 4 | **逐模型覆盖键是裸 `modelId`**（不带 provider 前缀） | `provider-composer.ts:482` |
| 5 | 但 settings.json 的逐模型键是 **`"provider/modelId"`**——**同一产品两种键格式** | `settings-manager.ts:27,106` |
| 6 | settings.json **没有** contextWindow 字段——用户覆盖窗口只能走 models.json | `settings-manager.ts:29-166` |
| 7 | 自定义模型的默认值：`contextWindow ?? 128000`、`maxTokens ?? 16384` | `provider-composer.ts:190-191` |
| 8 | **无任何上限钳制**（已核验：搜 `clamp\|Math.min(.*contextWindow` 无此机制） | `provider-composer.ts:172-174` 只有 `<= 0` 抛错 |
| 9 | 窗口未知/为 0 → **跳过压缩**，不猜 | `agent-session.ts:571-573` |
| 10 | 非压缩路径硬回退 `128_000` | `bug-report.ts:332` |
| 11 | 逐模型压缩预算：`compaction.modelOverrides["provider/modelId"]` = `{reserveTokens?, keepRecentTokens?}`，默认 16384/20000 | `settings-manager.ts:19-27` |
| 12 | 压缩预算解析链：`override ?? ordinary ?? default`，**每次调用重新校验** | `settings-manager.ts:885` |
| 13 | 非法值 → **抛精确错误**，不静默忽略 | `settings-manager.ts:858-883` |
| 14 | 窗口解析**一次**（快照进 `agent.state.model`）；压缩预算**每次重解** | `agent-session.ts:963-966` vs `2311,568` |
| 15 | 远程目录：4h 刷新窗口、4s 超时、etag 仅在缓存体存在时才发、404/501 → 空覆盖、瞬时失败保留 etag、`localGeneratedAt` 守卫 | `remote-catalog-provider.ts:5-110` |
| 16 | 模型切换后，**旧模型的溢出不触发新模型的压缩** | `agent-session.ts:2319-2339` |
| 17 | 项目 settings 在未信任前按 `{}` 加载 | `settings-manager.ts:397-399` |

### 5.2 我方**同意**

| pi 的决定 | 我方立场 |
|---|---|
| #1 配置优先、目录补位 | **同意**——三参考一致 |
| #9 窗口未知则跳过压缩 | **同意方向**，但我方当前是「回退 64,000 并压缩」。pi 的「跳过 + 报告未知」比「用一个猜的值」更诚实。**这是一个需要重新裁决的点**（见发现 2） |
| #10 非压缩路径硬回退 | **同意**（显示用途可以回退） |
| #14 窗口解析一次 | **同意**——我方已定「不在热路径调 `loadCatalog()`」 |
| #15 目录新鲜度设计 | **同意方向**，我方无新鲜度故事（见发现 4） |

### 5.3 我方**不同意**（附理由）

| # | pi 的决定 | 我方选择 | 理由 |
|---|---|---|---|
| A | #8 **无上限钳制** | 钳制到模型声明的上限（codex 形状） | pi 只拒绝 `<= 0`；一个过大的用户值会让压缩**永不触发**（静默失效）。`codex` 的 `context_window.min(max_context_window)` 是唯一处理此事的参考，且有专门测试 |
| B | #5 两种键格式并存 | 单一键格式 | pi 同一产品里 `modelOverrides` 用裸 `modelId` 而 `compaction.modelOverrides` 用 `"provider/modelId"`——**这是不一致，不是设计**。我方不应复制 |
| C | #12/#13 每次调用重解并重新校验 | 解析一次并缓存 | 我方 `loadCatalog()` **每次同步读盘**（`catalogStore.ts:45`），pi 的「每次重解」在我方会变成每次读盘。且校验应在加载期一次完成，不是每次调用 |

### 5.4 我方**未考虑**（本轮发现）

**发现 1：逐模型压缩预算层。**

pi 有 `compaction.modelOverrides["provider/modelId"]` = `{reserveTokens?, keepRecentTokens?}`（默认 16384/20000），解析链 `override ?? ordinary ?? default`。**我方 `CompactionPolicy` 无逐模型维度**——`keepRecentTokens` 是全局的。

**这个发现直接关联我方 Phase 2 的历史缺陷**：`phase-2-execution.md` §5 记录的「预算被当作测量值」问题，根因之一是**预算只有全局一个口径**。逐模型预算是参考实现给出的、我方缺失的一层。

**发现 2：窗口未知时「跳过」而非「回退」。**

我方当前 `runtimeConfig.contextWindow ?? 64_000`——**用一个具体的错误值继续压缩**。pi 的选择是**跳过压缩并报告未知**（`agent-session.ts:571-573`）。两者的差别是：我方会按 64k 压缩一个 1M 的模型（浪费 93.6%），pi 会**不压缩**并让用户看到「窗口未知」。

**这需要重新裁决**：我方的 64,000 回退是「保守」（宁可早压缩），pi 是「诚实」（不猜）。**我倾向于我方保留回退但加警告日志**——因为不压缩会导致上下文无限增长直至 provider 报错，比早压缩更糟。**但这个取舍必须显式记录**。

**发现 3：非法配置值应抛精确错误。**

pi 对 `reserveTokens: -1` 或非安全整数**抛带字段名的错误**（`settings-manager.ts:858-883`）。我方计划未规定非法值的处理。**静默忽略非法配置是最坏的选项**——用户以为设置了，实际没有。

**发现 4：目录新鲜度与失败设计。**

pi 的远程目录覆盖有完整设计：4h 窗口、4s 超时、etag 仅在缓存体存在时发送（注释：「a 304 can never leave the overlay empty」）、404/501 → 持久化空覆盖、瞬时失败保留 etag、`localGeneratedAt` 守卫（**旧覆盖不遮蔽更新的内置数据**）。

**我方 `catalogRefresh.ts` 存在但未考虑这些**。特别值得注意的是 `localGeneratedAt` 守卫——它防止**陈旧远程数据覆盖更新的内置快照**，这是一个我方未考虑的具体失效模式。

**发现 5：模型切换后的溢出归属。**

`agent-session.ts:2319-2339`：**旧模型产生的溢出不会触发新模型的压缩**。这是一个微妙的边界（切换模型后，上下文按新模型的窗口衡量），**我方未考虑**。

**发现 6：未信任项目的作用域加载。**

`settings-manager.ts:397-399`：`if (scope === "project" && !projectTrusted) return {};`——**项目配置在未信任前完全不可见**。这与 T5 的信任边界是同一机制，我方应统一设计（见 §6）。

---

## 6. T5 — 扩展宿主

### 6.1 pi 的决定

| # | 决定 | 证据 |
|---|---|---|
| 1 | 声明形式是**代码模块**（TS），不是配置数据 | `extensions/` |
| 2 | 路径声明在 `settings.json` 的 `extensions: [...]` 或 `package.json` 的 `pi.extensions` | `pi-manifest.ts` |
| 3 | 发现根：全局 `~/.pi/agent/extensions` + 项目 `.pi/extensions` | `resource-loader.ts:815-823` |
| 4 | **项目本地扩展只在项目被信任后加载** | `docs/extensions.md`、`resource-loader.ts:380-399` |
| 5 | 信任决策顺序：`trustOverride` → 无项目资源则信任 → 扩展 `project_trust` 事件 → 持久化 → `defaultProjectTrust`(`ask`/`always`/`never`) → **无 UI 则 false** → UI 选择 | `project-trust.ts:46-95` |
| 6 | **无 UI 时默认拒绝**（非交互模式） | `project-trust.ts:83-85` |
| 7 | 信任提示文案明确列出后果：「load `.pi` settings and resources, install missing project packages, and execute project extensions」 | `project-trust.ts:24-26` |
| 8 | 选项含 `Trust (this session only)`——**不持久化**，下次再问 | `trust-manager.ts:66-95` |
| 9 | 实现方式：**先以 untrusted 强制加载一遍**（用于展示列表），询问后再以真实状态重载 | `resource-loader.ts:380-387` |
| 10 | 执行模型：**同进程**（jiti 编译 TS） | `loader.ts:496-501` |
| 11 | **无超时、无输出上限、无隔离** | — |
| 12 | handler 可**阻塞**工具调用、**就地改参数**、注册工具/命令 | `types.ts:1129-1132,943-944` |
| 13 | 改参数**不做再校验**（文档明示） | `types.ts:943-944` |
| 14 | 加载错误 → 记入 `result.errors` 字符串数组，**不崩溃** | `loader.ts:576-578` |
| 15 | CLI 逃生口 `--approve`/`--no-approve` | `cli/args.ts:219-222` |

### 6.2 我方**同意**

| pi 的决定 | 我方立场 |
|---|---|
| #4 项目行为必须过信任门 | **同意**——`opencode` 的静默执行是反面教材 |
| #6 无 UI 默认拒绝 | **同意**——这是一个关键的**安全默认值** |
| #7 提示文案列出具体后果 | **同意**——**我方计划未规定提示文案**，补入 |
| #8 「仅本次会话」选项 | **同意** |
| #9 先 untrusted 加载以展示列表 | **同意**——这是我方未想到的具体实现技巧（见发现 1） |
| #14 加载错误不崩溃 | **同意** |
| #15 CLI 逃生口 | **同意** |

### 6.3 我方**不同意**（附理由）

| # | pi 的决定 | 我方选择 | 理由 |
|---|---|---|---|
| A | #1 声明形式是**代码模块** | **声明式配置数据**（codex 形状） | 声明式可审计、可列出、可在不执行的情况下检查。代码模块**无法在不执行的前提下审计** |
| B | #5 信任粒度是**路径/作用域** | **内容哈希**（codex 形状） | pi 的一次批准覆盖全部项目资源（设置 + 扩展 + 包安装）；内容哈希使**改动命令会重新触发审查**。粒度更细、更安全 |
| C | #10-#13 同进程 + 无超时 + 改参数不再校验 | 子进程 + 超时 + 输出上限 | pi 的扩展能就地改工具参数且不再校验（`types.ts:943-944`），且**无超时**——一个挂死的 handler 会卡住整个会话 |

### 6.4 我方**未考虑**（本轮发现）

**发现 1：信任提示需要「先展示再询问」的两遍加载。**

`resource-loader.ts:380-387` 的具体技巧：

```ts
async loadProjectTrustExtensions(): Promise<LoadExtensionsResult> {
  // Force untrusted project settings for the bootstrap pass. This keeps project-local
  // extensions/packages out while still loading user/global and temporary CLI extensions.
  this.settingsManager.setProjectTrusted(false);
  await this.settingsManager.reload();
  return this.loadCurrentExtensionSet({ includeInlineFactories: true });
}
```

即：**先以「不信任」加载一遍**——这样用户能在**批准之前**看到「有哪些项目扩展待批准」，同时项目代码**尚未被执行**。然后询问，再以真实信任状态重载。

**我方计划只说了「需要一个信任门」，未考虑「如何让用户在批准前看到内容」。** 这是一个具体的交互设计缺口。

**发现 2：扩展的 `project_trust` 事件可以**程序化覆盖**信任决策。**

`project-trust.ts:56-69`：扩展可以注册 `project_trust` handler，**返回 `trusted: "yes"/"no"` 来覆盖用户的默认流程**（首个 yes/no 胜出，`runner.ts:249-258`）。且 handler 的错误会被收集并继续。

**这是一个鸡生蛋问题**：能决定「是否信任项目」的代码，本身来自项目。**我方未考虑这个自举风险。** pi 的缓解是：该 handler 来自**已加载的扩展**（包括全局扩展），且首个决定胜出。**我方若做声明式路径，应明确排除这类「决定自身信任」的能力。**

**发现 3：项目设置与项目扩展共享同一信任位——且覆盖 **7 类资源**。**

已核验（`trust-manager.ts:30-38,185-207`）：

```ts
const TRUST_REQUIRING_PROJECT_CONFIG_RESOURCES = [
    "settings.json", "extensions", "skills", "prompts", "themes", "SYSTEM.md", "APPEND_SYSTEM.md",
] as const;
```

`hasTrustRequiringProjectResources(cwd)` 的判定是：**项目 `.pi/` 下存在上述任一资源**，**或**任意祖先目录存在 `.agents/skills`（排除用户主目录的那个）。

即：**批准一次 = 项目设置 + 扩展 + 技能 + 提示词模板 + 主题 + 两个 system 提示文件，同时生效**。

**我方 `phase-3-decisions.md` §6 只讨论了「钩子配置的信任边界」**，未考虑：
- 项目设置是否也需要信任门；
- **项目技能、提示词模板、主题**是否也需要；
- 信任门的作用域边界（pi 是「一个门管所有项目资源」）。

**注意 `SYSTEM.md` / `APPEND_SYSTEM.md` 在列表里**——这两个是**直接追加到系统提示**的文件。这与我方 T2（`AGENTS.md` 注入）是同一类资源，**pi 把它放在信任门内**。若我方 T2 要注入项目 `AGENTS.md`，按同一逻辑它**也应过信任门**——这是一个我方计划未覆盖的推论（见 Q11）。

**但已核验一处不一致**：`loadProjectContextFiles`（`AGENTS.md`/`CLAUDE.md`）**没有任何信任检查**（`resource-loader.ts:119-155` 全文无 `isProjectTrusted`），而 `discoverSystemPromptFile` / `discoverAppendSystemPromptFile` **有**：

```ts
private discoverSystemPromptFile(): string | undefined {
    const projectPath = join(this.cwd, CONFIG_DIR_NAME, "SYSTEM.md");
    if (this.settingsManager.isProjectTrusted() && existsSync(projectPath)) {   // ← 信任门
        return projectPath;
    }
    ...
}
```

**即：在 pi 里，项目 `.pi/SYSTEM.md` 需要信任，但项目 `AGENTS.md` 不需要。** 两者都是「注入系统提示的仓库提供文本」，处理方式却不同。

**这是一个真实的不一致，而非设计**——`AGENTS.md` 走的是独立函数（`loadProjectContextFiles`），从未接入信任门。**对我方的意义**：我方 T2 必须**自己决定** `AGENTS.md` 是否过信任门，不能以「pi 怎么做」为依据（pi 在这个点上自相矛盾）。**我的倾向：项目 `AGENTS.md` 应过信任门**——它与 `.pi/SYSTEM.md` 是同类资源（仓库提供的、进入系统提示的文本），pi 把后者放进门内说明它认可这类风险。

**发现 4：逃生口的命名与语义。**

pi 用 `--approve`/`--no-approve`（`cli/args.ts:219-222`）；codex 用 `--dangerously-bypass-hook-trust` 并**在运行时警告**「Enabled hooks may run without review for this invocation.」**我方未考虑逃生口的命名是否应带危险提示。**

---

## 7. T6 — 目录列举

### 7.1 pi 的决定

| # | 决定 | 证据 |
|---|---|---|
| 1 | **独立工具** `ls`，不是折进 `read` | `ls.ts` |
| 2 | 参数只有 `{path?, limit?}` | `ls.ts:11-14` |
| 3 | **单层**，无递归、无深度参数 | `ls.ts:101` |
| 4 | 默认上限 500 条 | `ls.ts:23` |
| 5 | 字节上限 50KB，独立于条数 | `ls.ts:141,146-151` |
| 6 | 输出：字母序（忽略大小写）、目录加 `/` 后缀、**含 dotfiles**、**无大小/日期**、**非树形** | `ls.ts:108-124,62` |
| 7 | **不应用任何忽略规则** | `ls.ts:102` |
| 8 | 空目录 → `(empty directory)`，**不是错误** | `ls.ts:135` |
| 9 | 不存在 → `Path not found:`；非目录 → `Not a directory:`；不可读 → `Cannot read directory:` | `ls.ts:88,95,104` |
| 10 | stat 失败的条目**静默跳过** | `ls.ts:125-128` |
| 11 | 截断通知可操作：`"500 entries limit reached. Use limit=1000 for more"` | `ls.ts:146-147` |
| 12 | 提示词里只有一行 snippet；**无「优先用 ls」的正面指引** | `ls.ts:17` |
| 13 | 唯一的规则是**反向**的：仅当 `ls`/`grep`/`find` **全部缺失**时才建议用 bash | `system-prompt.ts:101-107` |

### 7.2 我方**同意**

| pi 的决定 | 我方立场 |
|---|---|
| #3 单层（不递归） | **同意**——四个参考一致，递归属于 `glob`/`find` |
| #4/#5 条数与字节双上限 | **同意** |
| #6 目录 `/` 后缀、字母序 | **同意** |
| #6 **无大小/日期** | **同意**（`gemini-cli` 有 `(N bytes)`，`pi`/`opencode` 无；2:1 且省一次 `stat`） |
| #8 空目录不是错误 | **同意**——`pi`/`gemini-cli` 一致 |
| #9 三类明确错误 | **同意** |
| #11 截断通知可操作 | **同意** |
| #12/#13 无「优先用 ls」的正面指引 | **同意**——**四个参考都没有**，这是强信号 |

### 7.3 我方**不同意**（附理由）

| # | pi 的决定 | 我方选择 | 理由 |
|---|---|---|---|
| A | #1 独立 `ls` 工具 | **折进 `read`**（opencode 形状） | 我方工具面已有 13 个；`read` 的语义（「读取某路径的内容」）自然覆盖「路径是目录时列举」。且 `read` **已有 `offset`/`limit` 分页机制**可复用。`opencode` 与 `codex` 都不新增工具 |
| B | #7 不应用忽略规则 | **应用 T1 的统一忽略层** | 见 §1.3 B——pi 的 `ls` 与它自己的 `find`/`grep` 行为不一致 |
| C | #10 stat 失败静默跳过 | **报告跳过数量** | 静默跳过让模型以为「目录就这些」。`gemini-cli` 的 `(N ignored)` 是可取的 |

### 7.4 我方**未考虑**（本轮发现）

**发现 1：我方 `read` 对目录抛原始 EISDIR——这是一个真实缺陷。**

已实测：

```
IsADirectoryError: [Errno 21] Is a directory: 'packages/ts-shell/src'
```

**`pi` 不存在这个问题，因为它有独立 `ls`；`opencode` 不存在这个问题，因为 `read` 分派到 `ListPage`。** 我方是三者中唯一「目录会抛未加工 fs 错误」的。这印证了 T6 从「补功能」到「修缺陷」的重新定性。

**发现 2：`ls` 的 dotfiles 包含是显式决定。**

`pi` 的描述写明「Includes dotfiles.」（`ls.ts:62`）。**我方未考虑**：目录列举是否应显示隐藏文件。`pi` 的答案「是」（且它的 `find` 也用 `--hidden`）。**但我方若应用忽略层，`.git/` 等会被排除**——两者的交互需要明确。

**发现 3：`gemini-cli` 的 `(N ignored)` 反馈。**

`gemini-cli` 在输出尾部报告 `(N ignored)`，且区分 `llmContent` 与 `displayMessage`（`ls.ts:278-290`）。**我方未考虑「告知模型有多少条目被忽略」**——这对模型判断「是否需要换策略」有价值。

---

## 8. 对照产生的裁决（已全部定案）

本节原为「需要维护者裁决的开放问题」，列出 19 项。**这 19 项已全部裁决**，并入
`phase-3-decisions.md` 各任务的「补充裁决」小节——见该文件 §1.8 / §2.5 / §3.6 /
§5.6 / §6.5 / §7.7，以及 §3.7 的死字段门禁。

**分流如下**（避免两处记录不一致）：

| 原编号 | 主题 | 现位置 |
|---|---|---|
| Q1, Q2 | 非 git 目录的 gitignore、结果与 root 的关系 | `phase-3-decisions.md` §1.8 裁决 2、3 |
| Q3, Q4, Q6 | 窗口未知的回退、逐模型压缩预算、非法配置值 | §5.6 裁决 1、2、3 |
| Q5, Q9, Q11, Q12 | 信任门作用域、逃生口警告、`AGENTS.md` 信任、门的粒度 | §6.5 裁决 1、6，§2.5 裁决 4 |
| Q7 | 分节系统提示结构 | §2.5 裁决 8（不引入） |
| Q8 | 目录列举显示隐藏文件 | §7.7 + §7.6 |
| Q10 | 项目级技能的信任门 | §3.6 裁决 2 |
| Q13 | 刷新触发（`/reload`、`/cd`） | §2.5 裁决 5、6 |
| Q14, Q15 | `AGENTS.override.md`、同名目录 | §2.5 裁决 1、§2.4 |
| Q16 | `SkillLoader.scan` 递归 | §3.6 裁决 1 |
| Q17, Q18 | 技能校验分级、`name` 与目录名 | §3.6 裁决 4、§3.5 |
| Q19 | 死字段门禁 | §3.7 |

**本节不再保留独立清单**——`phase-3-decisions.md` 是唯一裁决源。

---

## 9. 对照产出的测试要求

按纪律「**Then write a test that fails when the reference's decision is reversed**」，以下决定各需一条反向可失败的测试：

| 决定 | 测试要求 |
|---|---|
| T1 三工具可见文件集一致 | 同一 fixture 下，`glob`/`grep`/`lsp`/目录列举返回的**文件集合逐字节相同**；反转「统一忽略层」即失败 |
| T1 `.gitignore` 的 `!` 取反 | fixture 含 `*.log` + `!keep.log`，断言 `keep.log` **可见**；反转忽略实现即失败 |
| T1 嵌套 `.gitignore` | fixture 含子目录 `.gitignore`，断言其规则生效 |
| T1 非 git 目录 | 无 `.git` 的目录下断言**不抛错**且返回文件；反转回退即失败 |
| T2 祖先遍历止于项目根 | fixture 在项目根**之外**放 `AGENTS.md`，断言**不被注入**；反转边界即失败 |
| T2 32 KiB 预算 | 注入超大文件，断言截断 + 警告 |
| T2b `disable-model-invocation` | 断言该技能**不在**目录中、但 `/skill:name` 仍可用 |
| T3 字段已删 | 类型层面（`tsc`）；并断言请求体中**不含** `thinking_token_budget`（防止误接） |
| T4 窗口优先级 | 配置 200k + 目录 64k → 断言用 **200k**；目录 1M + 配置 2M → 断言**钳制到 1M**；反转钳制即失败 |
| T4 逐模型压缩预算 | 两个模型配不同 `keepRecentTokens`，断言各自生效 |
| T5 未信任不执行 | 项目钩子配置存在但未信任 → 断言**零执行**；反转信任门即失败 |
| T5 内容哈希变更触发复审 | 改动命令文本 → 断言信任状态回到未信任 |
| T5 未信任时项目资源不可见 | 未信任 → 断言项目 `.agents/skills`、项目设置、项目钩子**全部不生效**；用户级资源**仍生效** |
| T2 项目 `AGENTS.md` 的信任边界 | 未信任项目的 `AGENTS.md` → 断言**不注入**；用户级/全局 `AGENTS.md` 仍注入 |
| T6 目录列举 | `read(目录)` 返回条目列表而非 EISDIR；断言目录 `/` 后缀、单层、忽略规则生效 |
| T2b 嵌套技能被发现 | fixture `nested/child-skill/SKILL.md` → 断言被发现（**当前实测会失败**：3 个只发现 1 个） |
| T2b 技能根不再递归 | fixture `root-skill-preferred/nested-child/SKILL.md` → 断言只返回根技能 |
| T2b 缺 description 硬失败、名字不合规仅警告 | 两组 fixture，断言前者不加载、后者加载 |
| Q19 死字段门禁 | 断言文档声明的每个配置字段都存在生产消费者（反向：给某字段加文档但不接线 → 门禁失败） |

---

## 10. 核验记录

| 结论 | 核验方式 |
|---|---|
| pi 的 `thinkingBudgets` 是活机制 | **逐层读源码**：类型（`settings-manager.ts:67-72`）→ 默认值（`simple-options.ts:57-62`）→ 映射（`:68-72`）→ 消费（`anthropic-messages.ts:1175`、`bedrock-converse-stream.ts:564-568`、`openai-completions.ts:976-977`） |
| `xhigh`/`max` 折叠到 `high` | 读 `simple-options.ts:63-66` |
| pi 非 git 目录保留 gitignore | 读 `find.ts:184-198` 注释与代码 |
| pi 的 grep 无 git 探测 | `grep -c "insideGitRepo\|no-require-git\|require_git" grep.ts` → **0** |
| pi 二进制无校验和 | `grep -c "checksum\|sha256\|signature\|createHash\|gpg" tools-manager.ts` → **0** |
| pi 离线硬失败、无回退遍历 | 读 `find.ts:177-179` |
| pi 祖先遍历到文件系统根 | 读 `resource-loader.ts:150` |
| pi 的 `skills.ts` 自遍历 + ignore 包 | 读 `skills.ts:2,16,47-63,175-266` |
| pi 的 find/grep 无进程内遍历 | 读两份 schema 与 spawn 调用 |
| pi 无窗口上限钳制 | 读 `provider-composer.ts:172-174`（只有 `<=0` 抛错） |
| pi 窗口未知则跳过压缩 | 读 `agent-session.ts:571-573` |
| pi 无 `promptCacheTtl` 形状 | 搜 `promptCacheTtl\|cacheTtl` → 仅 CHANGELOG 与硬编码 TTL 字符串 |
| pi 信任决策顺序与「无 UI 默认拒绝」 | 读 `project-trust.ts:46-95` |
| pi 两遍加载（先 untrusted 展示） | 读 `resource-loader.ts:380-387` |
| pi `ls` 无忽略规则、含 dotfiles | 读 `ls.ts:62,102` |
| pi `ls` stat 失败静默跳过 | 读 `ls.ts:125-128` |
| 我方 `read` 对目录抛 EISDIR | **实测** `IsADirectoryError: [Errno 21]` |
| pi 的信任门覆盖 7 类资源 | 读 `trust-manager.ts:30-38,185-207` |
| pi 的 `.pi/SYSTEM.md` 过信任门而 `AGENTS.md` 不过 | 读 `resource-loader.ts:1024-1026`（有信任检查）vs `:119-155`（无） |
| pi 的项目技能过信任门 | 读 `package-manager.ts:2398-2401,2425-2435` |
| pi 的两条祖先遍历边界不同 | `resource-loader.ts:150`（文件系统根）vs `package-manager.ts:462-479`（git 根），且 `findGitRepoRoot` 存在但前者不用 |
| pi 的 `collapseSystemMessages` 分支 | 读 `transcript.ts:108-112`；我方 `step.ts:106` 只发一条前导 system 消息 → 等价 |
| pi 的 `/reload` 刷新范围 | 读 `slash-commands.ts:42` |
| 我方无 `/reload` 命令 | 列 `registry.ts` 45 个命令名，无此项 |
| 我方有 `/cd` 命令 | 读 `registry.ts:210` |
| 我方 `SkillLoader` 零信任检查 | `grep -c "trust\|Trust" skillLoader.ts` → **0** |
| **我方 `scan` 只读一层（实测）** | 构造 3 个嵌套技能 fixture，复刻 `scan` 逻辑运行 → **只发现 1 个** |
| 我方 `scan` 无自递归 | `grep -c "scan(" skillLoader.ts` → 2（定义 + `load()` 一次调用） |
| pi 的嵌套技能有测试 | 读 `test/skills.test.ts:97-116`（两条用例）与 fixture 目录 |
| pi 的 `allowed-tools` 从未被读取 | `grep allowed-tools\|allowedTools` 于 pi `src` → **0 命中**（文档在 `docs/skills.md:148`） |
| pi 的技能校验分两级 | 读 `skills.ts:318-341`（名字错误仅警告；缺 description 才 `return null`） |
| pi 的技能根不再递归 | 读 `package-manager.ts:378-399`（找到 `SKILL.md` 后 `return entries`） |
| pi 的 `enableSkillCommands` 默认 true | 读 `settings-manager.ts:1182` |
| 我方 `emptyAnswerExplanation` 覆盖推理吃满额度 | 读 `turn/step.ts:288-299` |
| 我方同时发 `reasoning_effort` + `max_tokens` | 读 `turn/step.ts:114,116`（`max_tokens` 默认 4096，`runtimeConfig.ts:135`） |
| 我方只有一条请求路径 | 读 `turn/step.ts:138`（唯一 `/chat/completions`） |
| 我方无 budget/cache 字段 | 搜 `thinking_token_budget\|budget_tokens\|cache_control` → **0 命中** |
| 我方 `loadCatalog` 同步读盘 | 读 `catalogStore.ts:45` |

**未核验 / 未做**：
1. **未运行任何构建或产品**——本文件为静态分析 + 定向实测（EISDIR、grep 计数）。
2. **未在真实多 provider 环境验证** token 型 provider 的预算行为（我方无此路径）。
3. **未测 pi 的 `--no-require-git` 在真实 fd 上的行为**——只读了代码与注释；fd 二进制未运行。
4. **Q1 的手写解析器成本未实测**（~150 行是估计）。
5. **未评估 worktree 遮蔽处理对我方是否必要**——取决于是否支持 worktree 工作流。
