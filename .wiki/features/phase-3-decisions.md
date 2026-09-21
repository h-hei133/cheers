---
title: "Phase 3 开工前裁决记录：7 项待定决策的建议与理由"
category: article
sources: [pi-source-2026-09-21, opencode-source-2026-09-21, gemini-cli-source-2026-09-21, codex-source-2026-09-21, repo-audit-2026-09-21, phase-3-pre-research-2026-09-21]
created: 2026-09-21
updated: 2026-09-21
tags: [features, phase-3, decisions, adjudication]
summary: "Phase 3 开工前的裁决记录。对 T1–T6 七项待定决策逐一给出建议与理由，每条附我方 file:line 与参考实现 file:line 双向证据。核心裁决：T1 用 `git ls-files` + 遍历期剪枝两层设计（不引入二进制下载）；T3 删除两个说谎字段；T2 采用 pi 的「分节系统提示 + 技能只注入目录」；T4 采用 codex 的「用户配置优先但被模型上限钳制」；T5 本轮只做声明式窄路径且必须带信任边界；T6 判定为低价值、暂缓。"
confidence: high
---

# Phase 3 开工前裁决记录

> **性质**：开工前把「需要拍板的事」全部定下来。**零代码改动。**
> **输入**：`.wiki/features/phase-3-pre-research.md`（候选清单与排序）、五份子代理对照报告、主代理逐条实测。
> **输出**：7 项决策，每项含**选项 / 双向证据 / 建议 / 理由 / 失败模式**。

---

## 0. 裁决方法与证据纪律

### 0.1 分工

| 角色 | 职责 |
|---|---|
| 子代理（5 个，`scout`） | 只负责**收集参考实现的证据**，报告以 `## Decision input` 结尾，**明确禁止给出推荐** |
| 主代理（本文件） | 逐条**核验**进入裁决的断言，然后**拍板** |

**为什么不让子代理推荐**：子代理看不到本仓库的约束（3 个依赖、只写流、无插件宿主）。让它们推荐会把「参考实现的做法」误当成「我们应该的做法」。裁决必须由掌握全局约束的一方做。

### 0.2 核验纪律

沿用 `phase-3-pre-research.md` §5 的方式：**读被引用的 file:line**；行为性断言则**构造真实 fixture 并运行**。本文件的核验记录见 §8。

### 0.3 参考实现的一句话画像（仅在与裁决相关处引用）

| 项目 | 与本次裁决相关的特征 |
|---|---|
| `pi` | 分节系统提示；技能只注入目录；**下载** `fd`/`rg` 二进制；有项目信任门 |
| `opencode` | 用户配置优先（无上限钳制）；**专用 skill 工具**；项目插件**无信任门** |
| `gemini-cli` | 引入 `ignore` npm 包自解析；`ls` 工具带忽略选项 |
| `codex` | `require_git(true)` 对齐 git 语义；配置优先但被 `max_context_window` **钳制**；**声明式钩子 + 内容哈希信任门** |

---

## 1. T1 — 文件遍历剪枝与 `.gitignore` 支持

### 1.1 缺陷（已实测，非推断）

`runtime/execution/service.ts:127-138` 的 `listFilesRecursive` **递归进入每个目录，无任何剪枝**。

**本次实测本仓库**：

| 指标 | 数值 |
|---|---|
| 递归走过的文件总数 | **14,414** |
| `.git/` | 6,761（46.9%） |
| `node_modules/` | 1,485（10.3%） |
| 白走过比例 | **8,246 / 14,414 = 57.2%** |

**三份互不相同的硬编码过滤列表**（同一个文件在 `glob` 里可见、在 `grep` 里不可见）：

| 调用方 | 排除列表 |
|---|---|
| `core/tools/registry.ts:576` | `node_modules/`、`.git/`、`dist/` |
| `core/tools/grep.ts:122-131` | 上述 + `.normproof/` |
| `core/tools/lsp.ts:128` | 上述 + 扩展名白名单 |

**全仓检索 `gitignore` 零命中**——用户写在 `.gitignore` 里的规则，我们的工具完全不认。

### 1.2 构造 fixture 实测的正确性差异

`/tmp/gt4`，`.gitignore` = `build/` + `*.log` + `!keep.log`：

| 文件 | `git ls-files` | 我们的 glob 过滤 |
|---|---|---|
| `build/out.js` | 排除 ✅ | **显示** ❌ |
| `x.log` | 排除 ✅ | **显示** ❌ |
| `keep.log`（被 `!` 救回） | 保留 ✅ | 保留 ✅ |

**即：我们向模型展示被 gitignore 的文件，且丢失 `!` 取反语义。**

### 1.3 参考实现的做法

| 项目 | 做法 | 证据 |
|---|---|---|
| `pi` | 下载 `fd`/`rg`；**手工向上找 `.git`** 决定是否加 `--no-require-git` | `core/tools/find.ts:182-198` |
| `opencode` | 委托 `ripgrep` | `packages/core/src/ripgrep.ts` |
| `codex` | `ignore` crate 的 `WalkBuilder`，**显式 `require_git(true)`** | `codex-rs/file-search/src/lib.rs:434-445` |
| `gemini-cli` | 引入 `ignore` npm 包**自解析**（`gitIgnoreParser.ts` 199 行 + `ignoreFileParser.ts` 123 行 + `ignorePatterns.ts` 278 行 = 600 行） | 同左 |

**codex 的注释直接印证了本次设计要点**（`file-search/src/lib.rs:408-412`）：

> `require_git(true)` to match git's own ignore semantics: git never reads `.gitignore` files from directories above the repository root. Without this flag, the `ignore` crate reads `.gitignore` files from *all* ancestor directories—a deliberate divergence from git … allowing a broad parent ignore (e.g. `~/.gitignore` containing `*`) to silently suppress every file in the walk.

**pi 的非 git 处理正是我们需要的回退形状**（`find.ts:184-198`）：手工向上遍历找 `.git`，找不到才加 `--no-require-git`。

### 1.4 裁决：**两层设计，不引入二进制下载**

**第 1 层 — 遍历期剪枝（零依赖、始终生效）**：`listFilesRecursive` 接受剪枝判定，默认排除 `.git`/`node_modules`/`dist`/`.normproof`——**把三份不一致的列表收敛为一份**。

**第 2 层 — `.gitignore` 支持（git 仓库内）**：`git ls-files --cached --others --exclude-standard`；**非 git 目录回退到第 1 层**。

**实测支持第 2 层**（本仓库）：

| 检查 | 结果 |
|---|---|
| 文件数 | 14,414 → **2,741**（降 81%） |
| 耗时 | **0.033s** |
| 嵌套 `.gitignore` | ✅ `sub/.gitignore` 生效 |
| `!` 取反 | ✅ `keep.log` 保留 |
| 目录级 `dir/` | ✅ `build/` 整目录排除 |
| `core.excludesFile` | ✅ 全局排除文件生效 |
| 未跟踪但未被忽略的新文件 | ✅ 包含 |
| **非 git 目录** | ❌ `fatal: not a git repository`（**exit 128 → 回退必须存在**） |

### 1.5 理由

1. **不复制 `pi` 的二进制下载**。已核实其代价：

   | 维度 | 实测 |
   |---|---|
   | 代码量 | `utils/tools-manager.ts` **400 行** |
   | 来源 | `https://github.com/${repo}/releases/latest` → `.../releases/download/...`（`tools-manager.ts:112,278`） |
   | **完整性校验** | **零**（`grep checksum\|sha256\|signature\|createHash\|gpg` → **0 命中**）——只依赖 TLS |
   | 离线行为 | `ensureTool` 返回 `null` → `find.ts:179-181` **硬失败**：`reject(new Error("fd is not available and could not be downloaded"))` |
   | **回退遍历** | **不存在**——离线即该工具完全不可用 |

   引入网络依赖（离线不可用）、供应链面（**下载并执行未经校验的第三方二进制**），而我们的依赖面**只有 3 个**（`playwright-core`/`typescript`/`undici`，已核实）。**不该为此破例**；且 `pi` 自己的失败模式证明这条路径在离线环境下是硬失败。

2. **不引入 `ignore` npm 包**（`gemini-cli` 的做法）：600 行自解析代码（`gitIgnoreParser.ts` 199 + `ignoreFileParser.ts` 123 + `ignorePatterns.ts` 278）+ 1 个新依赖，只为得到 git 已经实现的语义。
3. **`git ls-files` 是既有调用面**：`workflow/gitContext.ts` 已用 `spawnSync('git', ...)`，不是新依赖。
4. **第 1 层必须独立存在**，因为第 2 层在非 git 目录**直接失败**（已实测 exit 128）。**我们的回退优于 `pi` 的**：`pi` 离线时工具直接报错，我们则降级为「无 `.gitignore` 支持但能列出文件」。

### 1.6 失败模式与边界

| 场景 | 行为 |
|---|---|
| 非 git 目录 | 回退到第 1 层剪枝 + **第 3 层：进程内 `.gitignore` 匹配**（见 §1.8 裁决 2） |
| 子目录 cwd | `git ls-files` 默认返回**仓库相对路径**且**包含 cwd 之外的文件**（已实测）→ **过滤到 workspace root**（裁决 3） |
| `git` 不在 PATH | 同「非 git 目录」路径处理 |
| 嵌套 git repo | 外层 `git ls-files` 把内层 repo 显示为 gitlink **且不进入**（已实测）→ 与 pi 的嵌套边界行为一致，接受 |
| 巨大仓库 | 未实测；`git ls-files` 是 C 实现，预期优于 JS 递归 |

**⚠️ 原记录更正**：本表原写「非 git 目录无 `.gitignore` 支持——这是诚实的降级」。**该定性过宽**。pi 用 `--no-require-git` 证明**非 git 目录下保留 gitignore 是可行的**，且只需一个纯路径判断（向上找 `.git`），不需要 git 命令。这是**能力缺口**而非等价降级。已裁决补齐（§1.8 裁决 2）。

### 1.7 验证方式（客观可测）

文件数（14,414 → 2,741）、`.gitignore` 生效、`!` 取反生效、非 git 回退、**三工具可见文件集一致**。

### 1.8 补充裁决（对照 pi 后收口）

对照 `phase-3-execution.md` §1 的 pi 决定后，以下三项**已裁决**：

| # | 事项 | 裁决 | 理由 |
|---|---|---|---|
| **1** | 结果上限与截断通知 | **加**：条数上限 + 字节上限，且**通知可操作**（`"Use limit=N for more, or refine pattern"`） | 原计划只规定剪枝，未规定上限——巨型仓库的 `glob **/*` 仍会把全部结果塞给模型。pi 的 find/grep/ls 三者都有上限且通知可操作 |
| **2** | 非 git 目录的 `.gitignore` | **补第 3 层**：向上找 `.git`；在仓库内用 `git ls-files`，不在则**进程内读取 `.gitignore`/`.ignore` 并匹配** | pi 证明可行。**不引入依赖**——手写解析（pi 的 `skills.ts:47-63` 给出参考：前缀改写 + 递归传递 matcher）。**先交付第 1+2 层，第 3 层紧随** |
| **3** | 结果与 workspace root 的关系 | **过滤**（不保留越界结果） | 工具的作用域就是 workspace；越界结果对模型是噪音。pi 保留并渲染 `../…`，我方明确不跟，理由已记录 |
| **4** | 额外忽略文件名 | **支持 `.gitignore` + `.ignore`**（不含 `.fdignore`——那是 fd 专有，我方无 fd） | pi 支持三个；我方取前两个。`.fdignore` 与我方无关 |
| **5** | 忽略文件的**嵌套前缀改写** | **必须实现** | 这是 `git ls-files` 原本替我方承担的复杂度。pi 的做法（`prefixIgnorePattern`）是参考 |
| **6** | Windows glob 语义 | **本轮不做**，记入 backlog | 我方无 Windows 目标；`find.ts:201-213` 的 `**/` 前缀与 `[/\\]` 改写是 pi 的平台适配 |
| **7** | 部分失败的容忍 | **采纳 pi 的形态**：无匹配不是错误；上限触发不算错误；stat 失败的条目跳过但**计数报告** | `grep` exit 1 = 成功；`ls` 的静默跳过改为报告数量（见 T6） |

---

## 2. T2 — `AGENTS.md` 与技能目录注入

### 2.1 缺陷（已核实）

`turn/prompt.ts:26-40` 的 `buildSystemPrompt` 是**纯字面量**：只有角色描述 + 模式说明 + 5 条执行规则。**不含**项目指令、技能、cwd、git 状态、日期。

**`AGENTS.md` 全仓 6 处引用，无一处读取内容**：
- `initCommandRuntime.ts:65` — `existsSync` 只判存在
- `initCommandRuntime.ts:77,80` — 建议文本
- `registry.ts:307` — 命令描述
- `contextContinuityManifest.ts:54` — 元数据字面量

**讽刺之处**：本仓库自己的 `AGENTS.md`（**138 行 / 8,922 字符 ≈ 2,549 tokens**，已实测）规定了全部工程纪律——**而运行中的 agent 看不到它**。

**技能**：`SkillLoader` 已实现完整发现（用户级 + 项目级、项目覆盖用户、frontmatter 解析），`Skill` 已带 `name`/`description`/`filePath`——**正是目录所需**——但只有两个消费者：`/skill` 命令与 UI 选择器。

### 2.2 三项子决策

#### 2.2.1 放哪些文件

| 选项 | 证据 | 建议 |
|---|---|---|
| 仅 cwd 一个 | 最简单 | ❌ 不够 |
| **全局 + 从根到 cwd 每一级祖先** | `pi` `resource-loader.ts:119-155`；`codex` `agents_md.rs:206-231` | ✅ **采纳** |
| + 读取子目录时懒加载嵌套文件 | `opencode` `instruction.ts:186-224` | ❌ 本轮不做（见 §2.3） |

**优先级**（`pi` `resource-loader.ts:71-73`）：`AGENTS.override.md` > `AGENTS.md` > `CLAUDE.md`，**每目录取首个命中**。

**`pi` 与 `codex` 在遍历边界上不一致，我们采纳 `codex`**：
- `pi` 走到**文件系统根**（`resource-loader.ts:150`：`if (parentDir === currentDir) break;`）——会把 `~/AGENTS.md` 也注入。
- `codex` 停在**项目根标记**（默认 `.git`，`agents_md.rs:1-16`）——"We do **not** walk past the project root."

**理由**：走到文件系统根会把用户主目录的无关文件拉进每个项目；`codex` 的边界更符合「项目指令」的语义。且我们 T1 已经需要判断「是否在 git 仓库内」，**同一个判定可复用**。

#### 2.2.2 放在稳定前缀还是易变部分

| 参考 | 放置 | 后果 |
|---|---|---|
| `opencode` | system 消息数组（**稳定前缀**） | 命中前缀缓存 |
| `pi` | 结构化 system 消息的**分节 + 逐请求 diff** | 未变则不重发 → 等效稳定 |
| `codex` | **user 角色**片段，附在末尾 | 变化时**必须**发「替换通知」（`REPLACEMENT_NOTICE`） |

**建议：放系统提示（稳定前缀），不做 diff 机制。**

**理由**：`buildSystemPrompt` 在 `cliRuntimeInvocation.ts:207` **每次 run 计算一次**（已核实调用点），不是每步重算。因此：
- 不需要 `pi` 的分节 diff 系统（它存在的理由是「结构化 system 消息要能被增量更新」——我们没有这个需求）。
- 更不需要 `codex` 的 user 角色 + 替换通知（那是为了在对话中段可替换而付出的代价）。
- 直接拼进系统提示字符串即可，**改动面最小**。

**已知代价**：会话中途修改 `AGENTS.md` **不会**生效（与 `pi` 同）。这是可接受的——`opencode` 的每轮重读代价是每轮重新读盘（`instruction.system()` 在 run loop 内调用）。

#### 2.2.3 体积上限

| 参考 | 上限 |
|---|---|
| `pi` | **无**（`resource-loader.ts` 无 `maxBytes`/`truncat`；截断机制只用于**工具输出**） |
| `opencode` | **无** |
| `codex` | **32 KiB 总预算**，跨所有祖先文件累减，截断 + `tracing::warn!`；`project_doc_max_bytes = 0` 可禁用 |

**建议：采纳 `codex` 的 32 KiB 总预算（可配置），并附截断警告。**

**理由**：`pi`/`opencode` 的「无上限」意味着一个 5 MB 的 `AGENTS.md` 会被原样塞进每次请求。我们的 `AGENTS.md` 是 8.9 KB（正常），但**用户仓库里的文件不由我们控制**。32 KiB ≈ 9k tokens 是可接受的上限，且 `codex` 的实现已证明「总预算跨文件累减」是可行形状。

**`0` 禁用**这一设计建议保留：它同时充当**退出开关**（见 §2.2.4）。

#### 2.2.4 退出开关

| 参考 | 开关 |
|---|---|
| `pi` | `--no-context-files` / `-nc`（`cli/args.ts:194-195`） |
| `codex` | `project_doc_max_bytes = 0` |
| `opencode` | **无直接开关**（只有 `CLAUDE.md` 专用与 project-config 开关） |

**建议：同时提供 CLI 标志与配置项**（配置项 = 上限设为 0）。

**理由**：CLI 标志适合一次性排查（「是不是 `AGENTS.md` 干扰了行为」）；配置项适合持久偏好。两者成本都极低。

### 2.3 本轮**不做**：嵌套目录懒加载

`opencode` 的 `instruction.ts:186-224` 会在 agent `read` 某个文件时，向上遍历该文件所在目录并**懒加载**其 `AGENTS.md`，用 `claims: Map<MessageID, Set<string>>` 保证每条消息只注入一次。

**为什么不采纳**：这是**唯一**实现此机制的参考，且它依赖 `read` 工具的 `metadata.loaded` 列表（`instruction.ts:16-29` 的 `extract()` 只认 `part.tool === "read"`）。我们的 `read` 工具没有这个元数据通道，**实现它等于先改工具契约**。价值（子目录规则及时可见）真实但低于成本。**独立立项**。

### 2.4 失败模式

| 场景 | 裁决 |
|---|---|
| 文件不可读 | 警告并跳过（**`pi` 的做法**）；**不采纳 `opencode`**（它 `Effect.catch(() => succeed(""))` 后又被 falsy 过滤 → **不可读与不存在无法区分**） |
| 同名目录（名为 `AGENTS.md` 的目录） | **继续下一候选**（跟 `pi` 的 `statSync().isFile()`）——用户显然还写了别的候选文件，没有理由因此整目录放弃 |
| 超大文件 | 截断到预算 + 警告（`codex`） |
| 非 UTF-8 | 有损解码（`codex` 的 `from_utf8_lossy`） |
| BOM | 剥离（`pi` 的 `stripBom`）；复用我方 `read` 已有的 `splitByteOrderMark` |

### 2.5 补充裁决（对照 pi 后收口）

| # | 事项 | 裁决 | 理由 |
|---|---|---|---|
| **1** | 候选文件名集 | **五个**：`AGENTS.override.md` > `AGENTS.md` > `AGENTS.MD` > `CLAUDE.md` > `CLAUDE.MD`，每目录取首个命中 | `.override` 是**刻意的逐目录覆盖逃生口**——让「临时覆盖项目规则」不需要改动 `AGENTS.md` 本身（对 git 工作树友好）。成本是一个数组项 |
| **2** | 全局/用户文件 | **包含，且排在最前** | `pi` 与 `codex` 都这么做。我方原计划未提，补入 |
| **3** | 注入顺序 | **全局 → 根 → … → cwd**（由远及近） | 与 `pi` 的 `unshift` 顺序一致；顺序影响模型如何理解「更具体的规则覆盖更一般的」。原计划未显式记录 |
| **4** | 项目 `AGENTS.md` 是否过信任门 | **过**（与 T5 同一门） | `pi` 在这一点上**自相矛盾**：`.pi/SYSTEM.md` 需要信任而 `AGENTS.md` 不需要（两者都是仓库提供的、进入系统提示的文本）。理由取自 `pi` 自己对 `SYSTEM.md` 的处理——它认可这类风险。**这是安全默认，不是跟风** |
| **5** | 刷新触发 | **新增 `/reload`**，刷新全部资源（上下文文件 + 技能 + 扩展 + 配置），与 `pi` 一致 | 我方原计划只说「中途修改不生效」，未规定如何让它生效。且「刷新全部」比「只刷 `AGENTS.md`」更可预测 |
| **6** | `/cd` 切换目录后 | **重新发现上下文文件** | 我方有 `/cd` 命令（`registry.ts:210`）；`pi` 的 `cwd` 在 loader 构造时固定，它没有这个问题是因为它**没有切目录命令**。我方有，必须处理 |
| **7** | linked worktree 遮蔽 | **本轮不做**，记入 backlog | `pi` 的 `findShadowedContextFile`（`resource-loader.ts:89-111`）处理「主仓库与链接工作树的同名文件占据同一逻辑作用域、加载两次」的缺陷。我方是否支持 worktree 工作流尚未裁决；**先记入，不阻塞 T2** |
| **8** | 分节系统提示结构 | **不引入**（维持字面量数组） | 已核验：我方 `turn/step.ts:106` 只发**一条**前导 system 消息，`pi` 的分节 diff 在其「无 mid-convo system 支持」分支上**退化为重新折叠整份提示词**——即与我方做法等价。不引入不是「简化」，而是「选 `pi` 在该分支上实际执行的做法」 |
| **9** | 标签包裹 | **保留**（`<project_instructions path="...">`） | 即使不做 diff，标签给了模型结构化边界；且 `path` 属性让模型知道规则来源 |
| **10** | 无 mid-convo system 消息的 provider | **不区分**——我方只有一条前导 system 消息 | `pi` 需要 `collapseSystemMessages` 是因为它支持多 provider；我方单路径无需分支 |

---

## 3. T2b — 技能暴露方式

### 3.1 现状（已核实）

`SkillLoader` 发现完整，`Skill` 带 `name`/`description`/`body`/`filePath`/`source`，但**零注入**。

### 3.2 两种做法

| 做法 | 代表 | 机制 |
|---|---|---|
| **目录 + 通用 `read`** | `pi` | 注入 `<available_skills>` 的 `name`/`description`/`location`；模型自己 `read` |
| **目录 + 专用工具** | `opencode` | 同样注入目录；另有 `skill` 工具按名加载正文 |

### 3.3 裁决：**目录注入 + 复用现有 `read`，不加专用工具**

**采纳 `pi` 的做法**（`core/skills.ts:355-388`）。注入形状：

```
<available_skills>
  <skill>
    <name>…</name>
    <description>…</description>
    <location>/abs/path/SKILL.md</location>
  </skill>
</available_skills>
```

**理由**：

1. **`location` 是必需的**：模型需要绝对路径才能 `read`。`pi` 明确注入它；`opencode` 不注入（因为它有专用工具按名查）。
2. **不加专用工具**：`opencode` 的专用工具需要「工具 + 权限动作 + 工具描述管线」三处新增。我们的工具面已有 13 个（`ask`/`bash`/`browser`/`edit`/`glob`/`grep`/`lsp`/`read`/`task`/`todo`/`web_fetch`/`web_search`/`write`）。**`read` 已能完成这件事**。
3. **`pi` 自己文档化了这个做法的失败模式，且我们的结论是接受它**（`docs/skills.md:86-91`）：

   > When a task matches, the agent uses `read` … to load the full SKILL.md (**models don't always do this; use prompting or `/skill:name` to force it**)

   `pi` 的补偿是 `/skill:name` **强制注入正文**。我们**已有** `/skill` 命令——本轮把它扩展为 `/skill:name` 的强制注入路径即可，**与目录注入共用同一份 `Skill` 数据**。

### 3.4 不做：正文全量注入

把技能正文全部塞进 system prompt 的成本随技能数线性增长，且绝大多数技能与当前任务无关。`pi` 与 `opencode` **都不这么做**——两个独立实现的一致选择是强证据。

### 3.5 失败模式

| 场景 | 裁决 |
|---|---|
| 技能无 `description` | **硬失败，不加载**（`pi`）——description 是模型匹配技能的唯一依据，缺了无法被发现 |
| 技能名/长度不合规 | **仅警告，仍加载**（`pi` 的两级划分）——名字格式是可容忍瑕疵，与「无法被匹配」不同级 |
| 技能名冲突 | **首个胜出 + 冲突诊断**（记录 `winnerPath`/`loserPath`）；`opencode` 是后者覆盖 + 警告 → 采纳 `pi`（首胜更可预测） |
| 符号链接指向同一文件 | **静默跳过**（`pi` 的 `realPathSet` 去重）——同一文件经符号链接出现两次不是冲突 |
| 技能数量 | **不设上限**（两个参考都无）——目录注入天然受 T2 的 32 KiB 预算保护 |

### 3.6 补充裁决（对照 pi 后收口）

| # | 事项 | 裁决 | 理由 |
|---|---|---|---|
| **1** | **`SkillLoader.scan` 递归** | **改为递归**，语义跟 `pi`：找到 `SKILL.md` 的目录**不再向下**，否则继续 | **实测我方只读一层：3 个嵌套技能只发现 1 个**（`top/SKILL.md`、`group/nested/SKILL.md`、`nested/deep/SKILL.md` → 只发现 `top-skill`）。`pi` 有两条专门测试（`should load nested skills recursively`、`should prefer a directory's root SKILL.md over nested`），`opencode` 真实技能即用嵌套布局。**必须与 T2b 同批**——注入残缺目录比不注入更糟 |
| **2** | 项目级技能的信任门 | **过信任门**（与 T5 同一门）；用户级技能无条件注入 | 项目技能内容**直接进入系统提示**。已核验我方 `SkillLoader` 读 `<workspace>/.agents/skills` 时 `grep -c "trust"` → **0**，且项目技能**覆盖**用户同名技能（`skillLoader.ts:36-40` 注释明写 "Project skills win"）。今天这条路是惰性的（技能只喂 `/skill` 与 UI）；**T2b 一旦接线就激活它** |
| **3** | 逐技能退出字段 | **加 `disable-model-invocation`**，语义为「从模型视野隐藏，保留用户调用路径」 | `pi` 的语义比「禁用」精确。我方 `Skill` 类型**无隐藏标志**，需补字段。补偿路径是 `/skill:name` 强制注入正文 |
| **4** | `name` 是否必须匹配父目录 | **不强制**，但**在文档中显式记录这是刻意的标准偏离** | `pi` 刻意偏离 Agent Skills 标准，理由：「该要求对共享技能目录不合理」。我方行为已一致（`dirName` 仅作 fallback），但**未记录是刻意的**——将来有人「修复」会引入不兼容 |
| **5** | 根级散落 `.md` | **支持**（我方 `scan` 已支持） | 我方比 `pi` 更宽（`pi` 只在特定模式目录收根级 `.md`）；保持现有行为，不收紧 |
| **6** | CLI 级技能路径注入 | **不做**（记入 backlog） | `pi` 有 `--skill`（additive，即使与 `--no-skills` 同用也生效）。我方无此需求，且 `SkillLoader` 的根是构造时固定的两个 |
| **7** | 目录列举中的技能目录 | 与 T6 一致——**应用统一忽略层** | 技能目录可能含 `node_modules` 等；T6 的目录列举与 T2b 的技能发现共享同一忽略判定 |

### 3.7 死字段门禁（新增，源自 T3 与 pi 的同类缺陷）

**已核验**：`pi` 的 `allowed-tools` 在 `docs/skills.md:148` 被声明，但 `grep allowed-tools` 于 pi `src` → **0 命中**。这与本仓库的 `thinkingBudgets`/`promptCacheTtl` 是**完全同构**的缺陷。

**三个独立实现都犯过** → 这是这类产品的**系统性失效模式**，不是孤立失误。

**裁决：加一个门禁**——扫描用户文档中声明的配置字段，逐个验证存在生产消费者。反向可失败：给某字段加文档但不接线 → 门禁必须失败。

---

## 4. T3 — 删除 `thinkingBudgets` 与 `promptCacheTtl`

### 4.1 现状（已核实）

| 字段 | 声明 | 消费者 |
|---|---|---|
| `thinkingBudgets` | `Record<string, number>`，`runtimeConfig.ts:75,113,136,223` | **仅此 4 处（声明+默认+合并），零实际使用** |
| `promptCacheTtl` | `"5m" \| "1h"`，`runtimeConfig.ts:79,117,145,227` | **同上，零实际使用** |
| `tuiMode` | `"regular" \| "fullscreen" \| "stream"`，`runtimeConfig.ts:81,119,147,229` | **同上，零实际使用** |

### 4.2 关键证据：我方只有一条请求路径，无 token 预算的消费位点

**⚠️ 本节原论证有误，已更正。** 原文称 `thinkingBudgets` 与活轨的 `reasoning_effort`「语义冲突、接线会产生两个来源」——**这个论证是错的**。pi 的实现证明二者互补：`thinkingBudgets` 把档位映射为数值预算（`minimal:1024 / low:2048 / medium:8192 / high:16384`），Anthropic/Google/Bedrock 原生消费，且注释明写 *"Independent of thinkingFormat"*——**它是 cap，不是竞争来源**。详见 `phase-3-execution.md` §4.1。

**正确的理由**（已核验）：

| 事实 | 证据 |
|---|---|
| 我方只有**一条**请求路径：`POST /chat/completions` | `turn/step.ts:138`（唯一 fetch） |
| `RuntimeProvider` 声明了 6 个值（`anthropic`/`openai`/`google`/…），但**不驱动请求形状** | `step.ts` 只有一个请求体 |
| 我方**无**任何 token 预算字段 | 搜 `thinking_token_budget\|budget_tokens` → **0 命中** |
| 活轨只发 `reasoning_effort` | `turn/step.ts:114` |

即：`thinkingBudgets` 描述的能力（按档位设定 token 预算）在我方**没有消费位点**——不是因为它与 `reasoning_effort` 冲突，而是因为我方运行时只有 OpenAI 兼容的单一路径，没有 token 型 provider 的适配层。

**这个区别有实际后果**：原论证会导出「将来接 Anthropic 也不该有此字段」，而 pi 证明**恰恰相反**——接 token 型 provider 时数值预算是**必需**的，`reasoning_effort` 无法表达它。

**`promptCacheTtl` 同理但独立**：标准 `/chat/completions` 没有请求级缓存 TTL 参数（OpenAI 的缓存是 1024+ token 前缀自动生效；Anthropic 用 `cache_control` 块标记，不是根字段）。我方无 `cache_control` 也无 `cacheRetention` 层（已核验 0 命中），接线只能接成空转或 400。

### 4.3 裁决

| 字段 | 裁决 | 理由 |
|---|---|---|
| `thinkingBudgets` | **删除** | 无消费位点（我方只有 OpenAI 兼容单路径）。**接入 token 型 provider 时必须重新引入**，形状见 `phase-3-execution.md` §4.1 |
| `promptCacheTtl` | **删除** | 端点无对应参数，且我方无 `cache_control` 层 |
| `tuiMode` | **暂缓，不删** | 它是**真能力**，只是缺配置入口 |

**`tuiMode` 为何与上两个不同**：表面选择是**真实存在且已在运行**的——`supportsFullScreenSurface(stdin, stdout)` 从 TTY 能力**自动判定**（`cliStartupSurface.ts:61`、`interactiveLoop.ts:50`，共 5 处消费），并在不支持时回退到 `runLineLoop`。所以 `tuiMode` 描述的是一个**已经实现的机制**，只是用户无法**强制**选择。而 `thinkingBudgets`/`promptCacheTtl` 描述的是**不存在的机制**。

**但要注意**：当前判定是**纯自动**的（依据 TTY 能力），不是配置驱动。因此「接线」需要定义**自动判定与显式配置的优先级**（显式配置应能覆盖自动判定，但自动判定为「不支持全屏」时不应允许强制全屏）。**裁决：本轮不接线，`tuiMode` 保留并在类型注释中标注「已声明未接线」**，避免下一个人重复调查。

### 4.4 一个附带的真实失效模式

pi 引入预算上限的理由（`openai-completions.ts:974-977` 注释）：

> Reasoning and the answer share max_tokens here, so an uncapped reasoning phase can consume the whole response and leave no answer and no tool call.

**我方符合这个前提**：`turn/step.ts:114,116` **同时**发 `reasoning_effort` 与 `max_tokens`（默认 4096）。我方是**检测并解释**（`emptyAnswerExplanation` 按 `reasoningLength > 0` 区分空响应与推理吃满），**pi 是预防**。

**裁决：本轮不改**（检测已覆盖可观测性），但记入 backlog——接入 token 型 provider 时预算上限成为必需。

### 4.5 验证

`tsc` 0 错 + 全量测试。删除字段会同时删除钉住它们的测试（这些测试只断言「字段存在」——属于「断言实现」而非「断言行为」，按 `AGENTS.md` 验证纪律应删）。

---

## 5. T4 — 逐模型上下文窗口解析

### 5.1 缺陷（已核实，且**比预研记录的更严重**）

`core/models/catalog.ts:18-24` 已带 `contextWindow`（`claude-opus-4-6: 200_000`、`gpt-5.3: 400_000`、`gemini-3-pro: 1_048_576`）。

**但目录值只用于显示，从不参与压缩决策**。已核实的完整消费面：

| 消费点 | 用途 |
|---|---|
| `cli/interactive/picker/model.ts:51` | 显示 `· 200k` |
| `core/models/catalogSurface.ts:58` | 显示 |
| `provider/registry/provider.ts:690` | 透传 |
| **`session/compaction.ts:116,256,302,328,348`** | **压缩判定——但值来自 `policy.contextWindow`** |
| `cli/runtime/cliSessionRuntimeFactory.ts:55` | **policy 的值来源：`runtimeConfig.contextWindow ?? 64_000`** |

**即：1M 窗口的模型被按 64k 压缩。** 压缩判定 `session/compaction.ts:116`：

```ts
return tokens > contextWindow - reserveTokens;
```

以 1,048,576 窗口为例，**过早压缩约 968,000 tokens 的可用空间（浪费 93.6%）**。

**预研记录需要修正一处**：`contextCommandRuntime.ts:38` 与 `contextAnalysis.ts:44` 是两个不同的文件（预研把它们记为同一组三处）。实际三处是：`cliSessionRuntimeFactory.ts:55`（**压缩策略，影响最大**）、`sessionFacts.ts:68`（TUI 显示）、`contextCommandRuntime.ts:38`（`/context`）。

### 5.2 参考实现的优先级链

| 项目 | 优先级 | 上限钳制 |
|---|---|---|
| `pi`（聊天路径） | 目录值直接使用，**无配置路径** | 无 |
| `pi`（自定义模型） | `override.contextWindow ?? model.contextWindow` | 无 |
| `opencode` | **配置优先**（`{...model.limit, ...config.limit}`，靠插件注册顺序保证） | **无** |
| `codex` | **配置优先，但被 `max_context_window` 钳制** | ✅ `context_window.min(max_context_window)` |

### 5.3 裁决：**配置优先 + 目录回退 + 模型上限钳制**

采纳 `codex` 的 `with_config_overrides` 形状（`model_info.rs:25-33`）：

```
用户配置的 contextWindow（若有）
  → 否则：目录的 contextWindow
  → 否则：64_000（保持现有回退）
  → 上限：不超过目录/模型声明的 max（防止用户声称超出 provider 实际能力）
```

**理由**：

1. **配置优先**：三个参考**一致同意**（`pi` 的 override、`opencode` 的 spread、`codex` 的 override）。用户知道自己接的是哪个端点。
2. **钳制向上越界**：`codex` 是唯一做此约束的，且有专门测试 `model_context_window_override_clamps_to_max_context_window` 与字段注释 *"Maximum context window allowed for config overrides."*。**理由**：`opencode` 与 `pi` 无上限，意味着用户配置过大时压缩**永不触发**——这是一个静默失效。`codex` 的钳制把「用户保守」与「用户越界」分开处理：保守允许，越界拒绝。
3. **未知模型回退 64,000**（保持现状）：`opencode` 未知模型回退到 `0` 并**静默禁用压缩**（`session/compaction.ts:234-236`）——这是危险的静默行为。`codex` 回退 272,000 并 `warn!`。我们的 64,000 是**保守**选择（宁可早压缩），保留即可，但**应加警告日志**。

### 5.4 实现约束（已核实，必须遵守）

1. **`loadCatalog()` 每次同步读文件**（`catalogStore.ts:45`：`readOverlay` × 2）——**不可在热路径调用**。必须在会话/run 建立时解析一次并缓存。
2. **活动模型不在 `runtimeConfig` 里**：它来自 `resolveProviderCredential(...).model`（`core/shell/providerCredentials.ts:37`）。因此解析点必须放在**已有 credential snapshot 的地方**——`cliSessionRuntimeFactory.ts` 已经在用（`request.providerCredentialResolution`）。
3. **解析结果应注入 `policy.contextWindow`**（`session/compaction.ts:8` 的类型），而不是改各调用点——**单点修复**。

### 5.5 验证

选一个 200k 模型，断言 `/context` 与压缩策略**都用 200k**（当前会用 64k）。

### 5.6 补充裁决（对照 pi 后收口）

| # | 事项 | 裁决 | 理由 |
|---|---|---|---|
| **1** | 窗口未知/为 0 时 | **回退 64,000 + 警告日志**（不跟 `pi` 的「跳过压缩」） | `pi` 跳过压缩（`agent-session.ts:571-573`），我方回退。**取舍**：不压缩会导致上下文无限增长直至 provider 报错，比早压缩更糟。**但必须加警告日志**——当前静默回退让用户不知道窗口是猜的 |
| **2** | 逐模型压缩预算 | **引入** `reserveTokens`/`keepRecentTokens` 的逐模型覆盖，解析链 `override ?? ordinary ?? default`，与 T4 同批 | `pi` 有这一层（`settings-manager.ts:19-27`），我方 `CompactionPolicy` 无逐模型维度。**它关联 Phase 2 已修缺陷的根因**——`phase-2-execution.md` §5 的「预算被当作测量值」问题，根因之一是预算只有全局一个口径 |
| **3** | 非法配置值（如负的 `reserveTokens`） | **抛带字段名的精确错误**（跟 `pi`） | 静默忽略让用户以为设置生效了。`pi` 校验非安全整数并抛错（`settings-manager.ts:858-883`） |
| **4** | 覆盖键格式 | **单一格式**：`"provider/modelId"` | `pi` 在同一产品里有**两种**（models.json 用裸 `modelId`，settings.json 用 `"provider/modelId"`）——**这是不一致，不是设计**，不复制 |
| **5** | 窗口解析时机 | **解析一次并缓存**（比 `pi` 更严） | `pi` 快照模型对象但**每次调用重解并重校验压缩预算**（`agent-session.ts:2311,568`）。我方 `loadCatalog()` **每次同步读盘**（`catalogStore.ts:45`），「每次重解」会变成每次读盘。校验应在加载期一次完成 |
| **6** | 模型切换后的溢出归属 | **按当前模型衡量** | `pi` 的 `agent-session.ts:2319-2339` 保证旧模型的溢出不触发新模型的压缩。我方需显式处理（切换后重算阈值） |
| **7** | 目录新鲜度 | **本轮不引入远程刷新**，但**加 `localGeneratedAt` 式守卫**（若将来引入） | `pi` 有完整设计（4h 窗口、etag 仅在缓存体存在时发、404/501 → 空覆盖、瞬时失败保留 etag）。特别值得注意的是 `localGeneratedAt` 守卫——**防止陈旧远程数据覆盖更新的内置快照**，这是一个我方未考虑的具体失效模式。我方 `catalogRefresh.ts` 已存在，本轮不扩展 |
| **8** | 未信任项目的设置 | **不可见**（与 T5 同一门） | `pi` 的 `settings-manager.ts:397-399`：`if (scope === "project" && !projectTrusted) return {}` |

---

## 6. T5 — 扩展宿主的最小诚实步骤

### 6.1 现状（已核实）

| 事实 | 证据 |
|---|---|
| `registerCommandHook` **零调用者** | `core/hooks/hookDispatcher.ts:38`，全仓仅 1 处（即定义本身） |
| `HooksConfiguration` **从不被构造** | `hookDispatcher.ts:19` 构造参数可选；生产只用 `new HookDispatcher()`（`:163`） |
| 插件子系统**只存元数据** | `pluginCommandRuntime.ts` 持久化 `InstalledPlugin[]`；**无 `await import`/`require`**（已 grep 确认为空） |

**即：Phase 1 解决了「类型诚实」，但没解决「可扩展」。**

### 6.2 三种参考范式

| 项目 | 声明形式 | 信任门 |
|---|---|---|
| `codex` | **TOML/JSON 声明式**（`type = "command"` + `command = "..."`） | ✅ **内容哈希**：`trusted_hash == current_hash` 才执行；启动时审查 UI |
| `pi` | 代码模块（`settings.json` 的 `extensions: ["./x.ts"]`） | ✅ **路径/作用域**：整个 `.pi/` 项目命名空间由一次信任决定把关 |
| `opencode` | 代码模块（`opencode.json` 的 `plugin: ["./x.ts"]`） | ❌ **无**：项目插件 `await import(row.entry)` **静默执行** |

**`opencode` 的失败模式值得单独记录**：克隆一个仓库即可执行其 `.opencode/plugins/*.ts`，**无任何提示**。已核实其 `plugin/index.ts` 与 `loader.ts` 中**不存在** trust/permission/consent 检查。

### 6.3 裁决：**本轮只做声明式窄路径，且必须带信任边界**

**范围**：只做「**配置文件 → `registerCommandHook`**」，**不做**插件代码宿主。

**采纳 `codex` 的声明式形状**（最小的真实声明面）：

```json
{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"x"}]}]}}
```

**信任边界：采纳 `codex` 的内容哈希门。**

**理由**：

1. **注册函数与事件类型都已存在**，缺的只是一个受校验的配置读取点——这是**最小诚实步骤**。
2. **「执行第三方代码」是另一个量级的安全问题**。`opencode` 的静默执行是明确的反面教材；`pi` 与 `codex` 都设了门——**2:1 的多数且是更安全的多数**。
3. **内容哈希优于路径信任**：`codex` 的 `hook_hash` 覆盖「事件 + matcher + handler」，所以**改动命令会重新触发审查**（`Modified` 状态）。`pi` 的路径信任粒度太粗——一次批准覆盖全部项目资源。
4. **声明式优于代码模块**：命令文本即配置，可审计、可列出（`codex` 有 `hooks list` + TUI 浏览器）。代码模块无法在不执行的情况下审计。

### 6.4 必须实现的失败处理（来自 `codex` 的实测行为）

| 场景 | 行为 |
|---|---|
| 命令超时 | 有超时（`codex` 默认 600s，`SessionEnd` 钳制到 180s） |
| 输出非 JSON / 垃圾 | **`None` → 无操作**（`output_parser.rs:345-357`）——**注意这是 fail-open**，对安全型钩子有风险，需在文档中明示 |
| `block` 但无 reason | 视为无效（`invalid_block_message`） |
| 配置不可读 | 警告 + 忽略该文件 |
| 未信任 | **仍列出但不执行**（`discovery.rs:701-707`）——避免「用户以为钩子在跑」 |

### 6.5 补充裁决（对照 pi 后收口）

| # | 事项 | 裁决 | 理由 |
|---|---|---|---|
| **1** | 信任门作用域 | **一个门，覆盖 7 类资源**：项目设置、扩展/钩子、技能、提示词模板、主题、`SYSTEM.md`、`APPEND_SYSTEM.md`（+ 本项目 T2 的 `AGENTS.md`） | `pi` 的 `TRUST_REQUIRING_PROJECT_CONFIG_RESOURCES`（`trust-manager.ts:30-38`）就是这 7 类。**一个门**的语义是「信任此项目的所有本地行为」，比分门可预测 |
| **2** | 提示文案 | **必须逐项列出获批范围** | `pi` 的文案做到了：「load `.pi` settings and resources, install missing project packages, and execute project extensions」。含糊的「信任此项目？」不够——用户要能看见自己批准了什么 |
| **3** | 批准前如何展示内容 | **两遍加载**：先以「不信任」加载一遍（用于**展示待批准项**，此时项目代码**尚未执行**），询问后再以真实状态重载 | `pi` 的 `resource-loader.ts:380-387` 的具体技巧。原计划只说了「需要一个信任门」，未考虑「用户如何在批准前看到内容」 |
| **4** | 无 UI 时（非交互模式） | **默认拒绝** | `pi` 的 `project-trust.ts:83-85`。这是关键的安全默认值——非交互模式无人能批准，必须默认不信任 |
| **5** | 自举风险：扩展能否决定自身信任 | **明确排除**——声明式钩子**不得**注册 `project_trust` 类 handler | `pi` 允许扩展注册 `project_trust` handler **程序化覆盖**信任决策（`project-trust.ts:56-69`），形成鸡生蛋问题：能决定「是否信任项目」的代码本身来自项目。**我方不做这个能力** |
| **6** | 逃生口 | **提供，且必须带危险提示** | `codex` 的 `--dangerously-bypass-hook-trust` 在运行时警告「Enabled hooks may run without review for this invocation.」；`pi` 的 `--approve` 无警告。**采纳 codex 的带警告形式** |
| **7** | 失败处理 | 超时、输出上限、非 JSON 输出 → 无操作、`block` 无 reason → 无效、配置不可读 → 警告并忽略、**未信任仍列出但不执行** | 全部来自 `codex` 的实测行为。最后一条尤其重要——避免「用户以为钩子在跑」 |

### 6.6 若本轮不做

**明确说明**：`registerCommandHook` 与 `HooksConfiguration` 保持零调用者。**这是可接受的**——它们不是「说谎的字段」（不像 T3 那三个），而是**已就绪但未接线的能力**。但应在类型注释中标注「未接线」，避免下一个人重复调查。

---

## 7. T6 — 目录列举能力

### 7.1 现状（已核实）——**这不只是「缺一个 `ls` 工具」**

我们的 13 个工具中无 `ls`（已核实完整列表）。**但更重要的发现是**：我们的 `read` 工具**不处理目录**。

`core/tools/registry.ts:300-350` 的 `read` 执行体直接调用 `executionService.readTextFile(...)`。传入目录路径时，该调用会抛出**原始 fs 错误**：

```
IsADirectoryError: [Errno 21] Is a directory: 'packages/ts-shell/src'
```

（已实测确认。）

**即：模型尝试「看看这个目录里有什么」时，得到一个未加工的 EISDIR 错误，而不是目录内容。**

### 7.2 参考实现（已读源码，四个实现三种答案）

| 项目 | 做法 | 忽略规则 | 上限 |
|---|---|---|---|
| `pi` | 专用 `ls` 工具 | **无任何忽略过滤**（纯 `readdir`） | 500 条 / 50KB |
| `gemini-cli` | 专用 `list_directory` | ✅ 与 `glob` **共用**同一个 `filterFilesWithReport` | **无上限** |
| `opencode` | **无独立工具，折进 `read`** | 无 | 2000 条/页 + `next` 续读 |
| `codex` | **无**（模型用 shell `ls`） | — | — |

**`opencode` 的折叠做法**（`core/src/tool/read.ts:80-81`）：

```ts
if (type === "directory") return yield* reader.list(absolute, { offset: input.offset, limit: input.limit })
```

`read-filesystem.ts:326-353` 的实现：单层、分页（`offset`/`limit`，上限 `MAX_READ_LINES = 2000`）、目录优先排序、目录加 `path.sep` 后缀、返回 `ListPage { entries, truncated, next }`。

**两个关键交叉信号**：
1. **四个参考全部是单层**（`gemini-cli` 的描述里写死了 "directly within"）。**递归属于 `glob`/`find`，不属于目录列举**——四个独立实现一致。
2. **没有任何参考在提示里写「优先用 ls 而非 glob/find」**（`pi` 只有一条反向规则：仅当 `ls`/`grep`/`find` **全部缺失**时才建议用 shell）。

### 7.3 裁决：**做，但采纳 `opencode` 的折叠形状，而不是新增 `ls` 工具**

**修订理由（相较预研的「暂缓」）**：

预研把 T6 记为「补功能（小）」并判为低优先级，理由是「收益只是省一次 bash 启动」。**这个判断基于「我们已有能力覆盖目录列举」这一未核验的假设。实测证明该假设不成立**——`read` 对目录抛 EISDIR，而 `glob` 需要模式（`**/*` 可模拟但不表达「直接子项」的语义）。

因此 T6 的性质从「补功能」变为**「修缺陷」**：**模型缺少一个「列出此目录直接内容」的原语**，且现有工具的失败方式是未加工的 fs 错误。

**为什么采纳 `opencode` 的折叠而非 `pi` 的独立工具**：

1. **不增加工具面**。模型已有 13 个工具；`read` 的语义（「读取某路径的内容」）自然覆盖「路径是目录时列举其内容」。`opencode` 的描述文本正是这样表述的：`"Read a text file or supported image, page through a large UTF-8 text file by line offset, or list a directory page."`
2. **`read` 已有 `offset`/`limit` 分页机制**（`registry.ts:328-338`），目录分页可**复用同一套参数与截断通知**，无需新参数。
3. **`codex` 与 `opencode` 都不新增工具**——与 T2b 的推理一致。
4. **`pi` 的独立 `ls` 有已知不一致**：它**不应用任何忽略规则**，而 `pi` 自己的 `find`/`grep` 尊重 `.gitignore`。照搬会在我们工具集里制造**第 4 份不一致的过滤行为**——正是 T1 要消除的问题。

**但必须与 `pi` 的做法相反的一点**：目录列举**应应用 T1 的统一忽略规则**（`gemini-cli` 的方向），而不是 `pi` 的「无过滤」。理由：一致性优先于「看得见被忽略文件」这个边缘收益；且若用户确实需要看被忽略的文件，`bash` 可用。

### 7.4 具体形状

| 维度 | 决定 | 依据 |
|---|---|---|
| 触发 | `read` 的 `path` 解析为目录时 | `opencode` |
| 层级 | **单层**（不递归） | 四个参考一致 |
| 分页 | 复用现有 `offset`/`limit`（默认 500，上限 1000） | 我们的既有约定 |
| 排序 | 目录优先，然后字母序 | `gemini-cli`、`opencode` 一致 |
| 目录标记 | `/` 后缀 | `pi`、`opencode` 一致 |
| 忽略 | **应用 T1 的统一忽略规则** | `gemini-cli`（与 `pi` 相反） |
| 空目录 | 中性消息（`(empty directory)` / `Directory ... is empty.`），**非错误** | `pi`、`gemini-cli` 一致 |
| 不存在 / 非目录 | 明确错误消息 | `pi`、`gemini-cli` 一致 |
| 大小信息 | **不做**（`gemini-cli` 有 `(N bytes)`，`pi`/`opencode` 无） | 2:1；且省一次 `stat` |
| 截断通知 | 可操作（提示如何续读） | `pi`、`opencode` |

### 7.5 与 T1 的顺序依赖（**这是硬约束**）

目录列举**必须**建立在 T1 的统一忽略层之上，否则会继承同一缺陷（`pi` 就是这样分裂的）。因此 T6 **排在 T1 之后**——与预研的执行顺序一致，只是**理由从「收益依赖」变为「正确性依赖」**。

### 7.6 失败模式

| 场景 | 裁决 |
|---|---|
| 巨大目录 | 分页（1000/页）+ 截断通知 |
| 权限不足 | 明确错误（`pi`：`Cannot read directory: ...`） |
| 符号链接指向工作区外 | 沿用现有 containment 检查 |
| 目录为空 | 中性消息，非错误 |
| 条目 stat 失败 | 跳过，**但报告跳过数量**（不跟 `pi` 的静默跳过） |
| 隐藏文件 | **显示**（跟 `pi` 的 "Includes dotfiles"）——忽略层只排除 gitignore 命中的项，不额外排除 dotfiles |

### 7.7 补充裁决（对照 pi 后收口）

| # | 事项 | 裁决 | 理由 |
|---|---|---|---|
| **1** | 输出是否含文件大小 | **不含** | `pi`/`opencode` 无，`gemini-cli` 有 `(N bytes)` → 2:1，且省一次 `stat` |
| **2** | 条目 stat 失败 | **报告跳过数量**（`(N skipped)`） | `pi` 静默跳过（`ls.ts:125-128`）会让模型以为「目录就这些」。`gemini-cli` 的 `(N ignored)` 是可取的 |
| **3** | 忽略规则的可见反馈 | **报告被忽略数量** | `gemini-cli` 的 `(N ignored)` 帮助模型判断是否需要换策略 |
| **4** | 与 `read` 的分页参数共用 | **共用**现有 `offset`/`limit`（默认 500，上限 1000） | 我方 `read` 已有该机制（`registry.ts:328-338`），无需新参数 |
| **5** | 提示词是否加「优先用目录列举」的正面指引 | **不加** | 四个参考**都没有**正面指引；`pi` 只有一条**反向**规则（仅当 `ls`/`grep`/`find` 全部缺失时才建议用 bash）。这是强信号 |

---

## 8. 汇总表

**全部 7 项主决策 + 44 项补充裁决已定案，无待决项。**

| 项 | 裁决 | 类型 | 成本 | 风险 | 关键依据 |
|---|---|---|---|---|---|
| **T3** | **删除** `thinkingBudgets` + `promptCacheTtl`；`tuiMode` 保留待接线 | 删死配置 | 极低 | 极低 | **无消费位点**（我方只有 OpenAI 兼容单路径）；非「语义冲突」 |
| **T1** | **三层**：遍历期剪枝 + `git ls-files` + 非 git 时进程内 `.gitignore` | 修缺陷（性能+正确性） | 中低 | 低 | 57.2% 白遍历；`.gitignore` 零支持；`pi` 的 `--no-require-git` |
| **T4** | 配置优先 + 目录回退 + **上限钳制** + 逐模型压缩预算 | 修缺陷 | 低 | 低 | 1M 模型被按 64k 压缩（浪费 93.6%） |
| **T2** | 祖先遍历（**止于项目根**）+ **32 KiB 预算** + 五候选含 `.override` + `/reload` + **过信任门** | 修缺陷 | 低 | 中（推高固定成本） | `AGENTS.md` 对模型完全不可见 |
| **T2b** | **目录注入 + 复用 `read`**；`/skill:name` 强制注入；**`scan` 改递归**；**过信任门** | 修缺陷（含实测缺陷） | 低 | 低 | **实测 3 个嵌套技能只发现 1 个** |
| **T5** | **声明式窄路径 + 内容哈希信任门**（一门管 7 类资源）；不做插件代码宿主 | 补基础设施 | 中 | 中高（安全面） | `opencode` 静默执行是反面教材 |
| **T6** | **做**：目录列举**折进 `read`**，应用 T1 忽略层 | **修缺陷** | 低 | 低 | `read` 对目录抛 EISDIR（实测） |

### 8.1 本轮实测发现的**两个真实缺陷**

| 缺陷 | 实测证据 | 归属 |
|---|---|---|
| `read` 对目录抛原始 `EISDIR` | `IsADirectoryError: [Errno 21]` | T6 |
| `SkillLoader.scan` 只读一层，嵌套技能静默丢失 | 3 个 fixture 只发现 1 个 | T2b |

**两者都必须与各自的任务同批修，不能分两轮**——T2b 注入残缺目录比不注入更糟。

### 8.2 执行顺序

$$\text{T3} \to \text{T1} \to \text{T4} \to \text{T6} \to \text{T2/T2b} \to \text{T5}$$

**T2 与 T2b 合并为一轮**（共用 `Skill` 数据与同一个系统提示组装点，且共用信任门）。

**T6 的位置修订**：预研判为「补功能」并排在最后。**实测推翻了这个定性**——`read` 对目录抛 EISDIR 是真实缺陷，且修复形状已由 `opencode` 验证。排在 **T1 之后**（硬依赖统一忽略层）、**T2 之前**（T2 会推高每次请求的固定成本，其收益评估需要 `/context` 数字准确；T6 不改变请求成本，先做无干扰）。

### 8.3 移出本轮（附理由）

| 项 | 理由 |
|---|---|
| linked worktree 遮蔽 | 我方是否支持 worktree 工作流未裁决；记入 backlog |
| Windows glob 语义 | 我方无 Windows 目标 |
| CLI 级技能路径注入（`--skill`） | 我方无此需求 |
| 远程目录新鲜度刷新 | `catalogRefresh.ts` 已存在，本轮不扩展；但已裁决「若引入则加 `localGeneratedAt` 守卫」 |
| 推理预算上限（防推理吃满 `max_tokens`） | 我方已有 `emptyAnswerExplanation` 检测；接入 token 型 provider 时成为必需 |
| 文档↔类型死字段门禁（§3.7） | 已裁决要做，但属独立小工具，不与 T1–T6 同批 |

---

## 9. 核验记录

本文件所有断言由主代理逐条核验，**未采信子代理报告的未核验部分**。

| 结论 | 核验方式 |
|---|---|
| 遍历无剪枝、57.2% 白遍历 | **实测** 14,414 / 8,246 |
| 三份硬编码列表不一致 | 逐个 `sed` 读 `registry.ts:570-585`、`grep.ts:118-135`、`lsp.ts:122-135` |
| `git ls-files` 语义 | **5 项 fixture 实测**：嵌套 `.gitignore`、`!` 取反、`dir/`、`core.excludesFile`、未跟踪新文件 |
| 非 git 目录失败 | **实测** `fatal: not a git repository`，exit 128 |
| `pi` 二进制下载无完整性校验 | `grep checksum\|sha256\|signature\|createHash\|gpg` 于 `tools-manager.ts` → **0 命中** |
| `pi` 离线无回退遍历 | 读 `find.ts:179-181`（`reject("fd is not available and could not be downloaded")`） |
| `git ls-files` 性能 | **实测** 2,741 文件 / 0.033s |
| 子目录 cwd 语义 | **实测**：返回仓库相对路径且含 cwd 外文件 → 需过滤 |
| `buildSystemPrompt` 是字面量 | 读 `turn/prompt.ts:26-40` |
| `AGENTS.md` 零内容读取 | 全仓 6 处引用逐个读 |
| `AGENTS.md` 体积 | **实测** 138 行 / 8,922 字符 ≈ 2,549 tokens |
| 三个配置字段零消费者 | 全仓 `grep`，逐个确认仅剩声明/默认/合并 |
| `thinkingBudgets` 无消费位点（**原判「与活轨冲突」已更正**） | 读 `turn/step.ts:102-114,138`（唯一请求路径）；搜 `thinking_token_budget\|budget_tokens` → **0 命中** |
| `pi` 的 `thinkingBudgets` 是活机制 | 逐层读 `settings-manager.ts:67-72` → `simple-options.ts:57-72` → `anthropic-messages.ts:1175` / `bedrock-converse-stream.ts:564-568` / `openai-completions.ts:974-977` |
| 我方同时发 `reasoning_effort` + `max_tokens` | 读 `turn/step.ts:114,116`（`max_tokens` 默认 4096，`runtimeConfig.ts:135`） |
| **我方 `SkillLoader.scan` 只读一层** | 构造 3 个嵌套技能 fixture，复刻 `scan` 逻辑运行 → **只发现 1 个** |
| 我方 `SkillLoader` 零信任检查 | `grep -c "trust\|Trust" skillLoader.ts` → **0** |
| 我方 `read` 对目录抛 EISDIR | **实测** `IsADirectoryError: [Errno 21]` |
| 我方无 `/reload`、有 `/cd` | 列 `registry.ts` 全部命令名 |
| 目录 `contextWindow` 只用于显示 | 全仓 `grep .contextWindow` 逐个分类（显示 3 处 / 压缩 0 处） |
| 压缩策略值来自 `runtimeConfig` | 读 `cliSessionRuntimeFactory.ts:55` → `session/compaction.ts:116` |
| `loadCatalog` 同步读盘 | 读 `catalogStore.ts:45` |
| 活动模型来自 credential | 读 `providerCredentials.ts:37` |
| `registerCommandHook` 零调用者 | 全仓 `grep`（1 命中 = 定义） |
| 插件不加载代码 | `grep "await import\|require("` 于 `pluginCommandRuntime.ts` → **空** |
| `codex` `require_git(true)` 及其理由 | 读 `file-search/src/lib.rs:405-450`（含注释原文） |
| `pi` 非 git 处理 | 读 `find.ts:182-200` |
| `pi` 技能目录形状 | 读 `skills.ts:355-388` |
| `pi` `ls` 无忽略过滤 | 读 `ls.ts:80-160` 全文 |
| `read` 不处理目录（抛 EISDIR） | 读 `registry.ts:300-350` + **实测** `IsADirectoryError` |
| `read` 已有 offset/limit 分页 | 读 `registry.ts:328-338` |
| `opencode` 把列举折进 `read` | 读 `read.ts:80-81` + `read-filesystem.ts:326-353` |
| `codex` 无目录列举工具 | 子代理读 `spec_plan.rs:1008-1240` 注册表（全部 `ls` 命中均为 shell 命令策略） |
| 四个参考的目录列举均为单层 | 逐份报告交叉比对（`gemini-cli` 描述写死 "directly within"） |
| `codex` 32 KiB 上限 | 读 `config_toml.rs:73` + `agents_md.rs:143-166` |
| `codex` 声明式钩子 + 哈希信任 | 读 `hook_config.rs` + `discovery.rs:701-707,783-794` |
| `opencode` 无信任门 | grep `trust\|permission\|consent` 于 `plugin/` → 无加载路径命中 |
| 我们的依赖数 = 3 | 读 `packages/ts-shell/package.json` |

**未核验 / 未做**：
1. **未运行构建或产品**：本文件为静态分析 + 定向实测（文件计数、`git ls-files` 语义、fixture 行为）。
2. **未测 T2 注入后的真实 tokenizer 开销**：8,922 字符按 3.5 折算约 2,549 tokens，真实值未测。
3. **未在超大仓库上测 T1**：本仓库 14k 文件属中等。
4. **T5 的信任模型未细化到实现级**：已定「内容哈希门」这一方向，但状态存储位置、审查 UI 形状未设计。
5. **未验证 `pi` 的 `hasTrustRequiringProjectResources` 具体覆盖哪些路径**（子代理标注为证据缺口）。
