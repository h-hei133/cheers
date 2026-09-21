---
title: "Phase 3 开工前裁决记录：7 项待定决策的建议与理由"
category: article
sources: [pi-source-2026-09-21, opencode-source-2026-09-21, gemini-cli-source-2026-09-21, codex-source-2026-09-21, repo-audit-2026-09-21, phase-3-pre-research-2026-09-21]
created: 2026-09-21
updated: 2026-09-21
tags: [features, phase-3, decisions, adjudication]
summary: "Phase 3 开工前的**唯一裁决源**。7 项主决策 + 1 项新增任务（T7 死字段门禁）+ 44 项补充裁决，全部定案、无待决项。经 5 个独立审查者复核后**更正 13 处**，其中 5 处为高严重度：①项目 MCP 配置可 spawn 任意命令且零信任检查（原「无插件代码宿主」论证遗漏）；②`read` 的路径监狱拒绝用户级技能，T2b 的 `location` 设计按现状无法工作（**阻断性**）；③既有信任探测器认不出要门控的资源（6 形态实测，4 种未探测到）；④`git ls-files` 裸调用在子目录下静默丢文件（须用 `-C <root>`）；⑤T4 的上限钳制不可实施（`CatalogModel` 无上限字段）。另有 2 处「未考虑」发现此前被静默丢弃，已补录。**两项阻断性选择已由维护者定案**：T2b 改为新增专用 `skill` 工具按名加载正文（不依赖 `read` 的绝对路径，与 opencode 一致）；T4 移除上限钳制、改为过大值告警（参考实现 1:3 不钳制，且我方无上限字段的权威来源）。"
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

2. **⚠️ 原记录关于 `ignore` npm 包的判断是错的，已更正。** 原文写：

   > 不引入 `ignore` npm 包（`gemini-cli` 的做法）：600 行自解析代码（`gitIgnoreParser.ts` 199 + `ignoreFileParser.ts` 123 + `ignorePatterns.ts` 278）+ 1 个新依赖，只为得到 git 已经实现的语义。

   **实测：`gemini-cli` 不手写匹配器，它 import 的正是 `ignore` 包。**

   | 文件 | 行数 | 实际内容（已核验） |
   |---|---|---|
   | `gitIgnoreParser.ts` | 199 | **目录遍历 + 嵌套前缀改写**，匹配**全部委托**（`:9 import ignorePkg`、`:59 ignore().add(...)`、`:138 ig.ignores(...)`） |
   | `ignoreFileParser.ts` | 123 | 单文件读取，同样**委托**（`:9 import`、`:85 ig.ignores()`） |
   | `ignorePatterns.ts` | 278 | **纯常量表**（`grep -c "^export const"` → 8；无任何匹配函数）——与我方 `registry.ts`/`grep.ts` 的硬编码列表**同构** |

   **即：那 600 行里匹配逻辑为 0。** 原文把它们全算作「自解析代码」，是把**加载器 + 常量表**误当成了**匹配器**。

   **参考实现的真实分工**（已核验四个参考 + claudecode）：

   | 项目 | 加载/前缀改写（手写） | 模式匹配 |
   |---|---|---|
   | `gemini-cli` | `gitIgnoreParser` + `ignoreFileParser` | **`ignore` npm** |
   | `pi` | `prefixIgnorePattern`/`addIgnoreRules`（三份副本） | **`ignore` npm**（`skills.ts:2`） |
   | `codex` | `WalkBuilder` 配置 | **Rust `ignore` crate** |
   | `claudecode` | — | **`ignore` npm** 或 `git check-ignore` |
   | `opencode` | — | **无 gitignore 支持**（67 行固定列表，非 gitignore 语义） |

   **手写匹配器的先例：零个。** 最接近的是 `opencode` 的 67 行固定列表，它**没有**取反、锚定、last-match-wins、逐目录读取——不是 gitignore。

   **`ignore` 包的成本（已核验 registry）**：MIT、**零运行时依赖**（无 `dependencies` 键）、113 KB unpacked、6 个文件、其中实现是 `index.js` **43 KB / 1454 行**、自带类型（`index.d.ts`）。**我方 `package-lock.json` 中不存在**（`ignore`/`minimatch`/`picomatch` 全部 0 命中）——所以这是**真正的第 4 个依赖**，不是既有传递依赖的提升。

   **`minimatch`/`picomatch` 不能替代**：`ignore` 的 README 明写 *"minimatch ... does not follow the gitignore spec"*。gitignore 的 **last-match-wins 序列语义**、**目录专有 `dir/`**、**逐目录相对锚定**、**父目录被排除则子项不可再包含**，**都不是 glob 特性**。

   **已核验的 `ignore` 自身偏差**（README 自述）：`ignorecase` 默认 `true`（git 在 Linux 上大小写敏感）→ 必须显式传 `ignorecase: false`；按 UTF-16 code unit 匹配而 git 按 UTF-8 字节；`***` 跟文档而非 git 二进制；**不做任何文件系统工作**（目录遍历、逐目录读取、嵌套改写仍需我方实现）；要求相对路径（`./abc` 会抛错）。

   **裁决更新**：见 §1.10 裁决 8。

3. **`git ls-files` 是既有调用面**：`workflow/gitContext.ts` 已用 `spawnSync('git', ...)`，不是新依赖。
4. **第 1 层必须独立存在**，因为第 2 层在非 git 目录**直接失败**（已实测 exit 128）。**我们的回退优于 `pi` 的**：`pi` 离线时工具直接报错，我们则降级为「无 `.gitignore` 支持但能列出文件」。

### 1.6 失败模式与边界

> **⚠️ 本节经独立审查后更正**（见 §1.9 发现 1）。原记录称「从子目录运行返回仓库相对路径且**包含 cwd 之外的文件**」——**这是反的**，会导致静默丢失文件。

| 场景 | 行为 |
|---|---|
| **子目录 cwd** | **必须显式指定仓库根**：`git -C <workspaceRoot> ls-files --cached --others --exclude-standard`。裸 `git ls-files` 在子目录下**只返回该子目录内的文件**（已实测：`root.ts` 被静默丢弃）。**仅靠「过滤到 workspace root」不能修复**——文件在源头就没了 |
| 非 git 目录 | 回退到第 1 层剪枝 + **第 3 层：进程内 `.gitignore` 匹配**（见 §1.8 裁决 2） |
| `git` 不在 PATH | 同「非 git 目录」路径处理 |
| 嵌套 git repo | 外层 `git ls-files` 把内层 repo 显示为 gitlink **且不进入**（已实测）→ 与 pi 的嵌套边界行为一致，接受 |
| 巨大仓库 | 未实测；`git ls-files` 是 C 实现，预期优于 JS 递归 |

**⚠️ 另一处原记录更正**：本表原写「非 git 目录无 `.gitignore` 支持——这是诚实的降级」。**该定性过宽**。pi 用 `--no-require-git` 证明**非 git 目录下保留 gitignore 是可行的**，且只需一个纯路径判断（向上找 `.git`），不需要 git 命令。这是**能力缺口**而非等价降级。已裁决补齐（§1.8 裁决 2）。

### 1.7 验证方式（客观可测）

文件数（14,414 → 2,741）、`.gitignore` 生效、`!` 取反生效、非 git 回退、**三工具可见文件集一致**、**从子目录运行时文件集与从根运行一致**（防 §1.9 发现 1 回归）。

### 1.8 补充裁决（对照 pi 后收口）

对照 `phase-3-comparison.md` §1 的 pi 决定后，以下三项**已裁决**：

| # | 事项 | 裁决 | 理由 |
|---|---|---|---|
| **1** | 结果上限与截断通知 | **加**：条数上限 + 字节上限，且**通知可操作**（`"Use limit=N for more, or refine pattern"`） | 原计划只规定剪枝，未规定上限——巨型仓库的 `glob **/*` 仍会把全部结果塞给模型。pi 的 find/grep/ls 三者都有上限且通知可操作 |
| **2** | 非 git 目录的 `.gitignore` | **补第 3 层**：向上找 `.git`；在仓库内用 `git ls-files`，不在则**进程内匹配 `.gitignore`/`.ignore`** | pi 证明可行。**依赖裁决见 §1.10 裁决 8**（已由侦察更正：引入 `ignore` 包，不自研匹配器） |
| **3** | 结果与 workspace root 的关系 | **过滤**（不保留越界结果） | 工具的作用域就是 workspace；越界结果对模型是噪音。pi 保留并渲染 `../…`，我方明确不跟，理由已记录 |
| **4** | 额外忽略文件名 | **支持 `.gitignore` + `.ignore`**（不含 `.fdignore`——那是 fd 专有，我方无 fd） | pi 支持三个；我方取前两个。`.fdignore` 与我方无关 |
| **5** | 忽略文件的**嵌套前缀改写** | **必须实现** | 这是 `git ls-files` 原本替我方承担的复杂度。pi 的做法（`prefixIgnorePattern`）是参考 |
| **6** | Windows glob 语义 | **本轮不做**，记入 backlog | 我方无 Windows 目标；`find.ts:201-213` 的 `**/` 前缀与 `[/\\]` 改写是 pi 的平台适配 |
| **7** | 部分失败的容忍 | **采纳 pi 的形态**：无匹配不是错误；上限触发不算错误；stat 失败的条目跳过但**计数报告** | `grep` exit 1 = 成功；`ls` 的静默跳过改为报告数量（见 T6） |

### 1.9 独立审查的发现（2026-09-21，已逐条复现）

#### 发现 1（高）：**`git ls-files` 的调用形式写错了，会导致静默丢失文件**

原 §1.4/§1.6 声称「从子目录运行返回仓库相对路径且**包含 cwd 之外的文件**」。**实测结果相反**：

```
# fixture: /tmp/pspec/{root.ts, sub/inner.ts}
$ cd sub && git ls-files --cached --others --exclude-standard
inner.ts                    # ← root.ts 被静默丢弃

$ git -C /tmp/pspec ls-files --cached --others --exclude-standard
root.ts                     # ← 正确：仓库相对路径，全量
sub/inner.ts
```

**裸 `git ls-files` 默认 pathspec 为 `.`（当前目录）**，因此从子目录运行只列出子目录内的文件。**§1.8 裁决 3 的「过滤到 workspace root」不能修复它**——文件在源头就没被查询到。

**追加裁决**：第 2 层必须用 `git -C <workspaceRoot> ls-files …`（或显式 pathspec `:/`）。**验证必须包含「从子目录运行时文件集与从根运行一致」**。

#### 发现 2（中）：**pi 的 `skills.ts` 不是「无依赖手写解析器」的参考**

原 §1.8 裁决 2 称「手写解析（pi 的 `skills.ts:47-63` 给出参考）」。**但 pi 在该文件第 2 行 `import ignore from "ignore"`，`package.json:63` 依赖 `ignore@7.0.8`。** pi 只手写了**嵌套前缀改写**（`prefixIgnorePattern`），**模式匹配本身交给 npm 包**。

**这意味着第 3 层的真实成本被低估**：要自研需覆盖 glob 通配、目录级斜杠、字符类、取反等边界。**追加裁决**：第 3 层仍做（裁决 2 不变），但**必须诚实记录这是一个自研解析器**，且实现前先评估是否需要为此破例引入 `ignore` 依赖——**这个取舍应显式做，而不是被「pi 也没用依赖」的错误印象掩盖**。

### 1.10 开工前的补充裁决（2026-09-21，施工前侦察）

#### 裁决 8（**推翻原裁决 2 的「不引入依赖」**）：第 3 层采用 `ignore` npm 包

**侦察已核验**（见 §1.5 理由 2 的更正）：

| 项目 | 加载/前缀改写 | 模式匹配 |
|---|---|---|
| `pi` | 手写（三份副本） | **`ignore@7.0.8`** |
| `gemini-cli` | 手写（199+123 行） | **`ignore@7.0.0`** |
| `opencode` | — | **`ignore@7.0.5`** |
| `codex` | `WalkBuilder` 配置 | **Rust `ignore` crate** |

**手写匹配器的先例：零个**（搜 `gitignoreRegex\|wildmatch\|fnmatch` 于 pi/gemini-cli 的 src → 0 命中）。

**裁决：引入 `ignore` 作为第 4 个生产依赖。**

**理由**：
1. **参考实现的分布是 4 : 0**——每一个支持 gitignore 的实现都委托给匹配器库，没有一个自研。
2. **`ignore` 的成本极低**：MIT、**零运行时依赖**（lockfile 条目数不变）、43 KB 实现（1454 行）。
3. **自研的真实成本被原记录低估**：`ignore` 的实现含一个 **90 行的括号表达式扫描器**，逐行对照 git 的 `wildmatch.c`（POSIX 字符类、ASCII-only ctype、转义、未闭合表达式匹配空）。自研要复现这些，且**没有任何参考可抄**。
4. **`minimatch`/`picomatch` 不能替代**（已核验）：`ignore` 的 README 明写 *"minimatch ... does not follow the gitignore spec"*。gitignore 的 **last-match-wins 序列语义**、**目录专有 `dir/`**、**逐目录相对锚定**、**父目录被排除则子项不可再包含**，**都不是 glob 特性**。

**必须同时记录 `ignore` 的四处已知偏差**（README 自述，全部要处理）：

| 偏差 | 后果 | 处置 |
|---|---|---|
| `ignorecase` 默认 `true` | git 在 Linux 上大小写敏感 | **必须显式传 `ignorecase: false`** |
| 按 UTF-16 code unit 匹配 | git 按 UTF-8 字节 | 非 ASCII 路径上有偏差，接受（记录） |
| **不做任何文件系统工作** | 目录遍历、逐目录读取、嵌套前缀改写**仍需我方实现** | 见裁决 9 |
| 要求相对路径（`./abc` 抛错） | 需自己的路径归一化 | 见裁决 10 |

#### 裁决 9：第 3 层的**加载器**由我方实现（这是 `ignore` 不做的部分）

`ignore` 只管模式匹配，不读文件、不走目录。参考实现都自己写了加载器，**且都是同一形状**：

1. 递归时**每进一个目录**，读该目录的 `.gitignore`/`.ignore`；
2. 把每行模式**加上该目录相对于遍历根的路径前缀**；
3. 喂给**同一个** matcher 实例（递归传递，不重建）。

**我方形状**（取 pi 的 `prefixIgnorePattern` 语义 + gemini-cli 的 `**/` 细化）：

| 输入模式 | 在 `a/b/` 目录下应变为 |
|---|---|
| `/c`（锚定） | `/a/b/c` |
| `c/d`（含斜杠） | `/a/b/c/d` |
| `c`（无斜杠、未锚定） | `/a/b/**/c` |
| `!c` | `!/a/b/**/c` |

**遍历期剪枝**：进目录前先问 `ig.ignores(relPath + '/')`（**目录必须带尾斜杠**——`ignore` 靠它区分目录），命中则不下降。

#### 裁决 10：`git ls-files` 的**精确调用形式**（已实测三轮，原记录有两处错）

**实测的三种形态**：

```
# fixture: /tmp/gt5/{root.ts, other/o.ts, sub/inner.ts}

# ① 裸调用，从 sub/ 运行 → 仅 cwd 内，路径相对 cwd
$ cd sub && git ls-files --cached --others --exclude-standard
inner.ts

# ② -C <仓库根> → 整个仓库，路径相对仓库根
$ git -C /tmp/gt5 ls-files --cached --others --exclude-standard
other/o.ts
root.ts
sub/inner.ts

# ③ -C <workspaceRoot> → 仅 workspace 内，路径相对 workspaceRoot  ✅
$ git -C /tmp/gt5/sub ls-files --cached --others --exclude-standard
inner.ts
```

**裁决：用形态 ③——`git -C <workspaceRoot> ls-files --cached --others --exclude-standard`。**

**它同时解决三件事**（本仓库实测，`workspaceRoot = packages/ts-shell`）：

| 检查 | 结果 |
|---|---|
| 返回路径相对谁 | **相对 `workspaceRoot`**（`src/artifacts/...`，非 `packages/ts-shell/src/...`） |
| 是否含 workspace 之外的文件 | **否**（越界条目 **0**） |
| 总数 | 1448（= 该目录的真实文件数） |

**因此不需要 `--full-name`，不需要 pathspec，也不需要剥前缀。** 原记录与审查者都以为要「先取全仓再过滤」——**实测不需要**，`-C` 已经把作用域限定好了。

**原记录的两处错**：

1. 原 §1.6 称「从子目录运行返回仓库相对路径且**包含 cwd 之外的文件**」——**错**。裸调用返回的是**相对 cwd 的路径**且**不含 cwd 之外的任何文件**（形态 ①）。
2. 原 §1.9 发现 1 的追加裁决称「必须用 `git -C <workspaceRoot>`（或显式 pathspec `:/`）」——**方向对了，但理由错**。它以为 `-C` 是为了拿到「全仓路径」，实际 `-C` 的作用是**把作用域限定到 workspace**。

**另有一处需记录的观察**：本仓库里 `packages/ts-shell/.sisyphus/` **存在于该目录之下**，所以裸调用返回的 `.sisyphus/...` 是**合法的 cwd 内路径**，不是越界。我最初误判为越界——**这正是「路径基准」容易看错的地方**，故此处把三种形态都写下。

**非 git 目录**：`-C` 仍报 `fatal: not a git repository`（exit 128）→ 落到第 3 层。

#### 裁决 11：返回值形态——**改为相对 workspace 的路径**（收敛三处字符串手术）

已核验三个调用方**各自重写同一段前缀剥离**（`registry.ts:570-574`、`grep.ts:114-120`、`lsp.ts:119-124`），且都用 `file.includes('node_modules/')` 这类**子串**判定而非**路径段**判定——`my_node_modules_notes/readme.md` 会被误杀，而根级 `node_modules`（无尾斜杠）不会被杀。

**参考实现的共识**（已核验）：**相对化在遍历层完成，或在唯一一个共享 helper 里完成，绝不在每个调用方**。`codex` 的 `FileMatch { path, root }`、`gemini-cli` 的 `crawler` 内相对化 + 共享 `makeRelative`、`claudecode` 的单一 `toRelativePath` 都是这个形状。

**裁决**：`listFilesRecursive` 返回**相对 workspaceRoot 的 posix 路径**；调用方不再做字符串手术，也不再各自过滤。

#### 裁决 12：忽略策略的位置——**请求选项**，不由调用方各自构造

已核验三种形态：`codex` 的 options struct（最纯粹）、`gemini-cli` 的注入式 service（最集中）、`pi` 的逐工具内联 + 匹配器两份副本（**反面教材**——两份策略会漂移，且工具都够不到它）。

**裁决**：采纳 **`codex` 的请求选项形状**——`FileListExecutionRequest` 增加一个可选选项对象，`listFilesRecursive` 读它并剪枝。理由：不引入新模块与新注入路径；我方 `runtime/execution` 没有 `gemini-cli` 那样的 `Config` 对象可供注入；且调用方传默认值即得一致行为。

#### 裁决 13：`dist/` 与 `.normproof/` 属「明显非源码」类，与 `node_modules`/`.git` 不同

`gemini-cli` 同时维护**两套**机制（gitignore 语义 + 一组「明显非源码」的 glob 常量），说明这两类排除**不是一回事**。我方 `node_modules`/`.git` 是第一类（几乎所有项目都有），`dist`/`.normproof` 是第二类（本项目特有）。

**裁决**：第 1 层剪枝**保留**这四项（它们描述的是「此工作区里不可能有源码的目录」），但**写成一份共享常量**，不再三处各写一遍。

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

### 3.3 裁决：**目录注入 + 按名加载正文（不依赖 `read` 的绝对路径）**

> **⚠️ 本节经审查后更正**（见 §3.8 发现 1）。原裁决采纳 `pi` 的做法——注入 `<location>` 绝对路径、复用现有 `read` 工具。**该做法在我方不可行**：`read` 强制 workspace containment，用户级技能（`~/.private-agents/skills/…`）**全部被拒**（已实测）。

**注入形状（元数据，不变）**：

```
<available_skills>
  <skill>
    <name>…</name>
    <description>…</description>
    <location>/abs/path/SKILL.md</location>
  </skill>
</available_skills>
```

**正文加载（更正）**：**按名加载，正文来自发现期已读入内存的内容**——`SkillLoader` 已经在发现期 `readFileSync` 了正文（`skillLoader.ts:83`），把它暴露为一条按名查询的路径即可。`read` 工具**不参与**。

**参考依据**：`opencode` 正是这样——`core/src/tool/skill.ts:82` 在发现期读入正文到 `skill.content`，注册一个 `skill` 工具（`:65`），调用时按名查表返回 `<skill_content>` 包裹的正文（`:38-50`）。它**从不触碰路径监狱**。

**为什么安全**：模型不能借这条路径读任意文件——它只能按名请求**已在我方技能目录里的**资源。技能是我方自己发现并读入的受信任本地资源，不是模型指定的路径。

**理由**：

1. **`location` 仍保留**，但**用途改变**：不再作为模型传给 `read` 的参数（那会被监狱拒绝），而是作为**来源标注**（与 `pi` 注入它的目的之一一致——让模型知道规则来自哪个文件）。
2. **必须新增一条按名加载路径**——这是与原裁决「不加专用工具」的**实质冲突**，见下方「与原裁决的冲突」。
3. **`pi` 文档化的失败模式被这条路径消除**（`docs/skills.md:86-91`）：

   > When a task matches, the agent uses `read` … to load the full SKILL.md (**models don't always do this; use prompting or `/skill:name` to force it**)

   `pi` 的补偿是 `/skill:name` **强制注入正文**。我方**已有** `/skill` 命令——扩展为 `/skill:name` 强制注入即可，**与按名加载共用同一份 `Skill` 数据**。按名加载把「模型自己找路径读」变成「按名取」，**从源头减少了「模型不读」的机会**。

#### 与原裁决的冲突（必须显式记录）

原 §3.3 理由 2 写的是「**不加专用工具**」，并称 `opencode` 的专用工具需要「工具 + 权限动作 + 工具描述管线」三处新增，而我方 `read` 已能完成这件事。

**这两句现在都被推翻**：

| 原判断 | 事实 |
|---|---|
| 「`read` 已能完成这件事」 | ❌ **不能**——路径监狱拒绝用户级技能（已实测） |
| 「不加专用工具」 | ⚠️ **必须重新裁决**——按名加载需要新的加载路径 |

**替代方案与取舍**（三选一，**已裁决**）：

| 方案 | 形状 | 取舍 |
|---|---|---|
| **A. 新增专用 `skill` 工具** | 与 `opencode` 完全一致 | 工具面 13 → 14；新增权限动作与描述管线（正是原裁决想避免的成本） |
| **B. 扩展 `read` 支持 `skill://` scheme** | 复用 `read` 已有的 `artifact://` 分支形状（`registry.ts:262-278`：按名解析 → 读文件 → **不做 containment**） | 工具面不变；但 `read` 的语义扩展为「可读非工作区资源」，**削弱了监狱的单一性** |
| **C. 扩展 `/skill` 命令为 `/skill:name`，仅用户可触发** | 纯用户路径，模型无法主动加载 | 模型**无法自主**使用技能——与 T2b 的目的（让模型按需使用技能）冲突 |

**已裁决：采纳 A（新增专用 `skill` 工具）。**

**理由**：B 会让 `read` 承担「绕过监狱读非工作区资源」的职责，而这个职责一旦存在，它的边界就只能靠「哪些 scheme 算安全」来维持——**监狱的单一性被破坏**，且 `artifact://` 的存在已经是一个先例（artifact 是**本会话产物**，语义上属于工作区）；技能是**跨会话的稳定外部资源**，性质不同，不应借用同一机制。C 放弃了 T2b 的核心目的。

**A 的成本是真实的但可接受**：`opencode` 已经证明这个工具的形状（按名查表 + 权限断言 + 正文包裹 + 兄弟文件列表），且我方 `Skill` 类型已带全部所需字段。

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

**归属（修正原记录的自相矛盾）**：本门禁**列为第 8 项任务（T7）**，排在 T3 之后（T3 刚删掉两个死字段，门禁正是防止再长出来的机制），不依赖 T1–T6 的任何改动。原记录把它同时写进 §3.7（「裁决：加」）与 §8.3（「移出本轮」），**是收口时留下的接缝**——已消除。

#### 施工前的侦察更正了原裁决的两处（2026-09-21）

**更正 1：原裁决说「扫描用户文档」——但没有用户文档列出配置键。**

| 检查 | 结果 |
|---|---|
| `USAGE_MANUAL.md`（241 行，唯一的用户手册） | 只写了配置文件**位置**（`%USERPROFILE%\.private-agents\config.json`、`<projectRoot>\.private-agents.json`），**一个配置键都没列**（`grep thinkingBudgets\|promptCacheTtl\|contextWindow` → 0 命中） |
| 其它 md | 提及配置键的全是 `.wiki/` 下的**内部分析文档**，不是用户面文档 |

**即：T3 那两个字段的缺陷不在「文档与代码不一致」，而在「类型声明与消费者不一致」。** 门禁必须检查**声明 → 消费者**，不是**文档 → 代码**。

**更正 2：参考实现没有这个门禁——不能照搬。**

已核验四个参考（pi / opencode / codex / gemini-cli），**零个**做「声明字段是否有消费者」的检查。最接近的两种机制：

| 机制 | 位置 | 能catch什么 | 不能catch什么 |
|---|---|---|---|
| **codex：穷尽解构** | `config/src/mcp_types.rs:317-320`——`RawMcpServerConfig` 的 `TryFrom` **穷尽解构每个字段**，加字段而不更新映射即**编译失败** | 「声明必须有映射点」由**语言强制** | 只证明**映射**读了它；映射结果仍可能在下游被丢弃 |
| **gemini-cli：schema 单一来源** | `settingsSchema.ts:3027-3030` → 类型、默认值、zod 校验器、JSON Schema、用户文档**全部派生**；CI `--check` 防漂移 | 声明/默认表/合并行/校验器/schema/文档六者**无法互相矛盾** | **没有「消费者」概念**——字段加进 schema 就自动被文档化、校验、CI 全绿，而**可能完全无人读**（它甚至有 `ignoreInDocs` 允许声明一个不出现在任何用户面的字段） |

**TypeScript 侧无对应物**：`noUnusedLocals`、eslint `no-unused-vars`、biome 的 unused 规则**都只管局部变量/导入/参数，从不管接口成员**（已核验 gemini-cli 的 `tsconfig.json:12` 开了 `noUnusedLocals` 但接口成员不在其范围）。gemini-cli 的 `ts-prune`/`depcheck` 声明了却**从未被任何脚本调用**。

**结论：本门禁是本仓库首创**（在已核验的参考里），机制上取 codex「声明必须有消费方」的方向，但用 TypeScript 可用的手段（静态扫描）实现，因为 TS 没有穷尽解构那样的强制。

### 3.8 独立审查的发现（2026-09-21，已逐条复现）

#### 发现 1（高，**阻断性**）：**用户级技能会撞上 `read` 的路径监狱——§3.3 的 `location` 设计按现状无法工作**

§3.3 裁决注入绝对路径 `<location>/abs/path/SKILL.md</location>`，让模型用现有 `read` 工具加载正文。**但 `read` 工具对路径做 workspace containment 检查**（`core/tools/registry.ts:280-285`）：

```ts
target = resolveToolTarget({ path: selector.cleanPath }, 'path', context.workspaceRoot)
const containment = verifyPathContainment(target, context.workspaceRoot)
if (!containment.allowed) {
  throw new Error(containment.reason ?? `Target '${target}' is outside workspace jail.`)
}
```

而 `verifyPathContainment`（`core/security/pathJail.ts:15-40`）**无条件拒绝 workspace 之外的绝对路径**。**已实测复现**（复刻其逻辑运行）：

```
用户级技能（~/.private-agents/skills/pdf/SKILL.md）
  → { allowed: false, reason: "Path '…' resolves outside workspace root '…'." }
项目级技能（<ws>/.agents/skills/x/SKILL.md）
  → { allowed: true }
```

**后果**：用户级技能（我方 `SkillLoader` 的第一个根，`skillLoader.ts:37`）**全部无法被 `read` 加载**。T2b 按现状实施会让每一个用户级技能在模型尝试读取时**硬失败**。

**已裁决（2026-09-21，维护者确认）：技能正文不经 `read` 的绝对路径——新增专用 `skill` 工具按名加载。完整裁决与理由见 §3.3。**

**一句话形状**：`SkillLoader` 在**发现期**已把正文读入（`skillLoader.ts:83` 的 `readFileSync`），把它暴露为一条**按名查询**的路径；`read` 工具**完全不参与**。这与 `opencode` 一致（`tool/skill.ts:82` 发现期读入 → `:65` 注册工具 → `:38-50` 按名返回）。

**为什么安全**：模型不能借这条路径读任意文件——它只能按名请求**已经在我方技能目录里的**资源。技能是**我方自己发现并读入**的受信任本地资源，不是模型指定的路径。

**否决的方案**（详见 §3.3 的取舍表）：
- **在 `read` 里加技能白名单分支**：无参考先例，且把技能的特殊性泄漏进通用工具。
- **借用 `artifact://` 机制**：artifact 是**本会话产物**（语义上属工作区），技能是**跨会话的稳定外部资源**——语义错配，且破坏监狱的单一性。
- **放宽 workspace 监狱**：`opencode` 允许越界但**要求 `external_directory` 审批**；我方没有这个审批面，**不应为此引入**。
- **把正文注入目录条目**：放弃了 §3.3 的「只注入元数据」，目录体积随技能数线性增长。

**同时记录一处我方与参考实现的真实差距**：`read` 对 workspace 外路径**只有「抛错」一条路**——`verifyPathContainment` 的三个返回点（`pathJail.ts:40,58,70`）**全是拒绝**，没有「允许但需审批」这个状态；而 `pathPermission`（`permissionContext.ts:18-25`）产生的权限检查项是**权限层的输入，不是监狱的出口**（监狱在 `execute` 里无条件抛出，权限批准与否都到不了那里）。`pi` 的 `read` **没有监狱**，`opencode` 有监狱但**带审批出口**。**本裁决不要求补这个出口**（技能走按名加载即可），但记为已知差距。

**注意**：`bash` 工具**不受**路径监狱限制（走 `processPermission`），所以「用 bash 读技能」是可行的工作区，但 `pi` 的文档已记录「模型不总会去读」（`docs/skills.md:69`）——依赖 bash 会放大这个已知失败模式。**按名加载正是为避免它。**

#### 发现 2（中）：**「同一个信任门」在四处被描述成两种不同的门**

| 位置 | 声称的门 |
|---|---|
| T2 §2.5 裁决 4 | 「与 T5 同一门」 |
| T2b §3.6 裁决 2 | 「与 T5 同一门」 |
| T5 §6.3 | **内容哈希门**（codex 形状，覆盖 `event + matcher + handler`） |
| T4 §5.6 裁决 8 | 「与 T5 同一门」 |

**但两者是不同粒度的机制**：codex 的哈希门针对**可执行钩子命令**；而 `AGENTS.md`/技能是**文档**，没有「handler」可哈希——`pi` 对这类资源用的是**路径/作用域级**信任（`settingsManager.isProjectTrusted()`）。

**追加裁决**：必须区分两种门并写明各自覆盖什么——
- **内容哈希门**：用于**可执行**项目行为（声明式钩子命令、MCP 命令）；
- **作用域门**：用于**项目提供的文本**（`AGENTS.md`、技能、subagent 定义、`SYSTEM.md`）。
两者共用**同一个批准动作与同一份信任记录**，但**校验机制不同**。原裁决把二者混为一谈，实现时会发现「文档没有哈希可算」。

#### 发现 3（低）：**`/cd` 的提示词失效契约未定义**

§2.5 裁决 6 要求 `/cd` 后重新发现上下文文件，但未说明**如何在会话中途重建系统提示**。已核验：`/cd` 走 `runCdShellAction` → `show-workspace/attach` → `runCliWorkspaceAttach`，且**已有 `onProjectContextSwitched` 回调**（`cliWorkspaceModule.ts:283`），消费者在 `interactiveCommandRouter.ts:174-180` 设置 `projectContextSwitched = true` 并触发 `refreshPromptChrome`。

**即：钩子点已存在**，裁决 6 可挂在这里。**追加裁决**：复用 `onProjectContextSwitched`，在其中重算系统提示（而非新造机制）。

---

## 4. T3 — 删除 `thinkingBudgets` 与 `promptCacheTtl`

### 4.1 现状（已核实）

| 字段 | 声明 | 消费者 |
|---|---|---|
| `thinkingBudgets` | `Record<string, number>`，`runtimeConfig.ts:75,113,136,223` | **仅此 4 处（声明+默认+合并），零实际使用** |
| `promptCacheTtl` | `"5m" \| "1h"`，`runtimeConfig.ts:79,117,145,227` | **同上，零实际使用** |
| `tuiMode` | `"regular" \| "fullscreen" \| "stream"`，`runtimeConfig.ts:81,119,147,229` | **同上，零实际使用** |

### 4.2 关键证据：我方只有一条请求路径，无 token 预算的消费位点

**⚠️ 本节原论证有误，已更正。** 原文称 `thinkingBudgets` 与活轨的 `reasoning_effort`「语义冲突、接线会产生两个来源」——**这个论证是错的**。pi 的实现证明二者互补：`thinkingBudgets` 把档位映射为数值预算（`minimal:1024 / low:2048 / medium:8192 / high:16384`），Anthropic/Google/Bedrock 原生消费，且注释明写 *"Independent of thinkingFormat"*——**它是 cap，不是竞争来源**。详见 `phase-3-comparison.md` §4.1。

**正确的理由**（已核验）：

| 事实 | 证据 |
|---|---|
| 我方**有 4 处**构造 `/chat/completions` 请求 | `turn/step.ts:138`（主循环）、`core/commands/btwCommandRuntime.ts:38`、`core/query/compaction/summarize.ts:62`、`core/tools/taskTool.ts:121` |
| **但其余 3 处都不发 `reasoning_effort`**，也不读 `thinkingBudgets`/`promptCacheTtl` | 已核验：三者对 `reasoning_effort` 与两个字段的 `grep -c` **全为 0** |
| 只有主循环发 `reasoning_effort` | `turn/step.ts:114` |
| 全仓**无**任何 token 预算字段 | 搜 `thinking_token_budget\|budget_tokens` → **0 命中** |

> **⚠️ 原记录更正**：本节初稿称「我方只有**一条**请求路径：`turn/step.ts:138`（唯一 fetch）」——**这是错的**，有 4 处。**结论不变但论据必须换**：不是「只有一条路径」，而是「**4 条路径都不消费数值预算**，且只有主循环发 reasoning 档位」。

即：`thinkingBudgets` 描述的能力（按档位设定 token 预算）在我方**没有消费位点**——不是因为它与 `reasoning_effort` 冲突，而是因为我方运行时没有 token 型 provider 的适配层（无 `budget_tokens`/`thinking_token_budget` 字段，无 `cache_control`）。

**这个区别有实际后果**：原论证会导出「将来接 Anthropic 也不该有此字段」，而 pi 证明**恰恰相反**——接 token 型 provider 时数值预算是**必需**的，`reasoning_effort` 无法表达它。

**`promptCacheTtl` 同理但独立**：标准 `/chat/completions` 没有请求级缓存 TTL 参数（OpenAI 的缓存是 1024+ token 前缀自动生效；Anthropic 用 `cache_control` 块标记，不是根字段）。我方无 `cache_control` 也无 `cacheRetention` 层（已核验 0 命中），接线只能接成空转或 400。

### 4.3 裁决

| 字段 | 裁决 | 理由 |
|---|---|---|
| `thinkingBudgets` | **删除** | 无消费位点（我方只有 OpenAI 兼容单路径）。**接入 token 型 provider 时必须重新引入**，形状见 `phase-3-comparison.md` §4.1 |
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

`tsc` 0 错 + 全量测试。

> **⚠️ 原记录更正（执行时实测）**：本节原写「删除字段会同时删除钉住它们的测试（这些测试只断言『字段存在』）」。**实测：没有任何测试钉住这两个字段**——全仓 `grep thinkingBudgets|promptCacheTtl` 于 `*.test.ts` → **0 命中**。即原判断不成立，删除时无需改测试。

**实际执行的验证**（T3 已施工）：

| 项 | 方式 | 结果 |
|---|---|---|
| 回归测试 | 新增 `runtimeConfig.test.ts` 的「does not carry a config key whose value nothing reads」——旧配置**仍含**两个已删字段时，断言解析结果的键集**不含**它们 | **反向验证通过**：只重新引入 `promptCacheTtl` → 该测试失败（`expected [...] to not include 'promptCacheTtl'`）；移除 → 通过 |
| 类型 | `tsc -p packages/ts-shell/tsconfig.build.json --noEmit` | **0 错误** |
| 全量 | `npm run test:ts` | **494 文件 / 2800 通过 / 1 跳过 / 0 失败** |
| 实机（真实构建产物） | 用含两个已删字段的 `.private-agents.json` 调 `getRuntimeConfig` | 存活字段正确（`200000`/`30000`/`0.2`/`plan`/`fullscreen`）；**两个已删字段均不在结果键集中**；**旧配置不报错**（向后兼容） |
| 实机（真实 CLI） | `node dist/cli.js` 于该目录 | 正常启动，无错误 |
| 实机（`/context`） | `printf '/context\n' \| node dist/cli.js` | `Window: 200,000 tokens` —— 从配置读到，未被删除影响 |

**一个必须记录的边界**：**配置文件中残留已删键不会报错，也不会有提示**。`getRuntimeConfig` 的解析路径**没有未知键校验**（全仓搜 `unknown`/`unrecognized`/`schema` 于 `runtimeConfig.ts` → 0 命中），多余的键被静默忽略。这是**有意的向后兼容**（旧配置继续可用），但也意味着**用户无法知道某个键已被删除**。这与 T7（死字段门禁）方向一致——T7 防的是「文档声明了但代码没接」，此处是「代码删了但用户的配置还留着」；**两者都不报错**。记录备查，不在 T3 解决。

### 4.6 独立审查的发现（2026-09-21，已逐条复现）

#### 发现 1（中）：**两处「未考虑」发现被静默丢弃，现补录**

`phase-3-comparison.md` §4.4 记录了两项 pi 的决定，但**两者都未进入本文件的任何裁决，也不在 §8.3 的移出清单**——即**静默丢弃**：

| 被丢弃的发现 | 内容 | 现裁决 |
|---|---|---|
| 逐模型 thinking 档位层 | `pi` 有三层：全局 `defaultThinkingLevel`、逐模型 `modelThinkingLevels["provider/modelId"]`、逐模型 provider 字符串映射 `thinkingLevelMap` | **本轮不做**，记入 backlog。理由：我方 thinking 由项目状态文件驱动（`thinkingCommandRuntime.ts`），无逐模型维度，且**没有消费位点**——与 `thinkingBudgets` 同因 |
| `xhigh`/`max` 折叠到 `high` | `pi` 的 `clampReasoning` 把最高两档折叠为 `high` 的预算（`simple-options.ts:63-66`） | **仅记录**。这是 `pi` 预算表只有 4 档而档位有 6 个导致的映射缺口；我方无预算表，无此问题 |

**纪律教训**：对照产出的发现必须**逐条**落到「裁决 / 明确移出 / 明确拒绝」三者之一。这两条落空，说明收口时漏检了执行文档 §4.4。

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

### 5.3 裁决：**配置优先 + 目录回退 + 过大值告警（不钳制）**

> **⚠️ 本节经审查后更正**（见 §5.7 发现 1）。原裁决的「钳制到模型声明的上限」**按现状不可实施**——我方目录**没有独立的上限字段**。已改为告警，理由见下。

采纳 `codex` 的 `with_config_overrides` 形状（`model_info.rs:25-33`）：

```
用户配置的 contextWindow（若有）
  → 否则：目录的 contextWindow
  → 否则：64_000（保持现有回退）
  → 若用户值 > 目录值：告警（不拒绝）
```

**为何原裁决不可实施**：`codex` 有**两个**字段——`context_window`（默认值）与 `max_context_window`（**允许配置覆盖的上限**，注释原文 *"Maximum context window allowed for config overrides."*，`openai_models.rs:434-437`）。**我方 `CatalogModel` 只有一个 `contextWindow`**（`catalog.ts:20-24`，已核验），全仓搜 `maxContextWindow` → **0 命中**。

**已裁决（2026-09-21，维护者确认）：采纳方案 2——不做钳制，改为对过大的用户值告警。**

**参考实现的分布**（已逐一核验）：

| 项目 | 字段结构 | 是否钳制用户覆盖 |
|---|---|---|
| **codex** | **两个**：`context_window` + `max_context_window` | ✅ `context_window.min(max_context_window)`（`model_info.rs:25-33`） |
| **pi** | 一个 `contextWindow` + 一个 `maxTokens` | ❌ **无**（`maxTokens` 是**输出**上限，不是窗口上限——不可复用为窗口天花板） |
| **opencode** | `limit: { context, input, output }` | ❌ **无**（`config/plugin/provider.ts` 直接 spread，无 `Math.min`） |
| **gemini-cli** | 硬编码 `switch`，无用户覆盖通道 | 不适用 |

**1 : 3，且唯一的 1 为此专门加了第二个字段。**

**为什么否决方案 1（加 `maxContextWindow` 字段）**——理由与我上一轮的倾向相反，因为证据不支持它：

1. **加字段意味着我方要自己编造每个模型的 `maxContextWindow` 值。** 目录里只有 `contextWindow` 一个数（`claude-opus-4-6: 200_000`、`gemini-3-pro: 1_048_576`），**没有第二个有权威来源的数**。编出来的天花板可能比用户配置更错——用编造的值去拒绝用户的正确值，比不拒绝更糟。
2. **`pi` 的 `maxTokens` 不是窗口上限**，说明「模型元数据里带一个窗口天花板」在真实 provider 数据里**并不常见**——codex 能这么做是因为它从 `/models` 端点拿到 `max_context_window`（`manager.rs` 的远程合并），而我方目录是**静态快照 + 用户覆盖**，没有这个来源。
3. **不钳制时的失效是可观测的**：用户配了 2M 而模型只有 1M，provider 会报错——那是**真实的、可归因的错误**。而钳制会把「用户配错」静默改成「按我以为的上限跑」。

**保留的部分**：§5.3 的**配置优先 + 目录回退**不变；§5.6 裁决 1 的「未知模型回退 64,000 + 警告日志」不变。**仅移除「钳制到模型声明的上限」这一步**，替换为：用户配置值**大于目录值**时**告警**（不拒绝），提示「配置的窗口大于目录声明，若模型实际不支持会由 provider 报错」。

**理由**：

1. **配置优先**：三个参考**一致同意**（`pi` 的 override、`opencode` 的 spread、`codex` 的 override）。用户知道自己接的是哪个端点。
2. **不钳制，但告警**：`codex` 是唯一做钳制的（1 : 3），且它为此**专门加了第二个字段** `max_context_window`。我方**没有这个字段的权威来源**（目录只有一个 `contextWindow`），编造一个天花板去拒绝用户的配置，可能比不拒绝更错。改为**告警**——用户配得比目录大时提示「若模型实际不支持会由 provider 报错」。**代价如实记录**：`opencode`/`pi` 的「配置过大导致压缩永不触发」静默失效**仍然存在**，告警是缓解而非消除。若将来 provider 元数据能提供真实天花板，再引入钳制。
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

### 5.7 独立审查的发现（2026-09-21，已逐条复现）

#### 发现 1（高）：**上限钳制不可实施**——已裁决改为告警（见 §5.3）

`CatalogModel` 只有 `contextWindow`，无 `maxContextWindow`。`codex` 的钳制依赖 `max_context_window` 的存在，而我方**没有这个字段的权威来源**。

**已裁决（维护者确认）：不钳制，改为过大值告警。** 参考实现分布 **1 : 3**（只有 codex 钳制，且它为此刻意加了第二个字段）。完整理由与代价见 §5.3。

#### 发现 2（中）：**`tuiMode` 的「保留」与 T3 的删除纪律存在张力**

§4.3 删除 `thinkingBudgets`/`promptCacheTtl`（零消费者），却**保留** `tuiMode`（同样零消费者）。原裁决给的理由是「它是真能力，只是缺配置入口」。

**审查指出这是不一致**：三者的**共同事实**是「声明了、零消费」，区别只在「描述的能力是否存在」。**追加裁决**：保留 `tuiMode` 是**有意的不一致**，理由必须写进类型注释——「此字段描述的能力（表面选择）已实现且自动判定，本字段用于将来提供显式覆盖；与 `thinkingBudgets`/`promptCacheTtl` 不同，后者描述的能力不存在」。**若注释不写，下一个人会把它当第三个死字段删掉，或反过来把前两个当「待接线」保留。**

#### 发现 3（低）：**`contextAnalysis.ts:44` 不是第四个生产解析点**

审查提到该处有独立的 64,000 回退。**已核验：它只被自己的测试文件 import**（`contextGovernance.test.ts:2`），**零生产消费者**。§5.1 已正确地把生产解析点列为 3 处，此条不构成遗漏。

#### 发现 4（低）：**`resolve once` 的表述可更精确**

§5.4 说「解析一次并缓存」。审查指出 `pi` 的做法是「模型对象快照一次，但压缩预算每次重解并重校验」。**追加裁决**：我方缓存的是**解析结果**（窗口值），不是**校验过程**——校验应在配置加载期一次完成并抛错，而非每次调用重校验。理由：我方 `loadCatalog()` 每次同步读盘（`catalogStore.ts:45`），照搬 `pi` 的「每次重解」会变成每次读盘。

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

> **⚠️ 本节经独立安全审查后大幅更正**（见 §6.7）。原表有 3 行错误描述 codex 行为，其中一行（`SessionEnd` 180s）是**无出处的虚构数字**。

| 场景 | codex 的实际行为（已核验） |
|---|---|
| 命令超时 | 默认 **600s**；`SessionEnd`/`Interrupt` 钳制到 **最大 3s、默认 1s**（`SESSION_END_DEFAULT_TIMEOUT_SEC = 1`、`SESSION_END_MAX_TIMEOUT_SEC = 3`，`session_end.rs:20-23`）。**不是 180s**——全仓搜 `180` 于 hooks crate **零命中** |
| 空 stdout | **no-op**（唯一真正的静默路径） |
| 看起来像 JSON 但解析失败 | **记录为可见的 `Failed` 运行**，带错误条目 `"hook returned invalid pre-tool-use JSON output"`（`pre_tool_use.rs:213-284`）——**不是静默 no-op** |
| 非零退出码 | **可见的 `Failed`**；**exit code 2 + 非空 stderr 才是真正的 block 信号**（文档原表完全未提这个契约） |
| 输出上限 | codex **没有** stdout 大小上限（无界读取）。唯一的限制是 `additionalContext` 的 **2500 token 预算**，超出部分**落盘而非丢弃**（`output_spill.rs:11-24`）——原表的「output cap → no-op」**描述的机制不存在** |
| `block` 但无 reason | 无效（`invalid_block_message`） |
| 配置不可读 | 警告 + 忽略该文件 |
| 未信任 | **仍列出但不执行**（`discovery.rs:701-707`） |

**我方 `hookDispatcher.ts` 比上述任何描述都差**：`exec` 错误（超时、`maxBuffer` 超出）与 `JSON.parse` 抛错都被 catch、记日志、然后**继续下一个钩子并最终返回 allow**——**每一个失败模式（含超时的安全钩子）都是静默 fail-open**（`hookDispatcher.ts:107-156`）。

### 6.5 补充裁决（对照 pi 后收口）

| # | 事项 | 裁决 | 理由 |
|---|---|---|---|
| **1** | 信任门作用域 | **必须映射到我方实际存在的资源**，不照抄 pi 的 7 项清单 | 原裁决照抄 pi 的 `TRUST_REQUIRING_PROJECT_CONFIG_RESOURCES`，但映射到我方后：**2 项无对应物**（无项目提示词模板加载器；主题是内置注册表无磁盘发现），**至少 4 项既有可执行面被遗漏**（见 §6.7 发现 3） |
| **2** | 提示文案 | **必须逐项列出获批范围**，且**列出的内容必须中和处理** | 原裁决只要求「列出」，未说明列出的是**项目可控字符串**（命令文本、matcher、名称、路径）。逐字渲染给用户 = 仓库控制用户在决策瞬间读到什么（换行、控制序列、伪装成 harness 自身界面）。**codex 也没解决**（`hooks_browser_view.rs:444-452` 直接渲染），所以这是**继承来的遗漏**，必须显式处理 |
| **3** | 批准前如何展示内容 | **声明式路径只需解析文件，不需要两遍加载**；但**必须规定「哈希在执行时重新校验」这条不变式** | 原裁决照搬 pi 的两遍加载。**声明式命令是惰性数据**，列示它只需解析——比 pi 的代码模块更简单。但「询问后重载」会开一个 **TOCTOU 窗口**：批准提示与重载之间被改写的命令会**未经展示与哈希**就执行。codex 靠「哈希与信任判定在同一次遍历中完成、之后不再重读文件」避免（`discovery.rs:663-708`）。**这条不变式必须写进裁决** |
| **4** | 无 UI 时（非交互模式） | **默认拒绝** | `pi` 的 `project-trust.ts:86-88`（**原裁决引用的 `:83-85` 有误**，那是 `defaultProjectTrust` switch 的尾部） |
| **5** | 自举风险 | **我方无 `project_trust` 事件可拒**，因此这条裁决无对象 | **原裁决的理由是错的**：它称 pi 允许扩展程序化覆盖信任决策，形成鸡生蛋问题。**实际上 pi 的两遍加载正是关闭这个洞的机制**——`loadProjectTrustExtensions` 先强制 `setProjectTrusted(false)`，使项目设置返回 `{}`、项目扩展路径根本不进入集合，因此能发 `project_trust` 的**只有用户级/全局与 CLI 扩展**——正是项目写不到的那一组（`project-trust.ts:54-70`、`settings-manager.ts:410-413`、`package-manager.ts:2417-2465`）。裁决结论仍成立（我方无此事件），但**理由必须更正**，否则误导下一个读者 |
| **6** | 逃生口 | **提供，且必须带危险提示** | `codex` 的 `--dangerously-bypass-hook-trust` 在运行时警告；`pi` 的 `--approve` 无警告。采纳 codex 形式 |
| **7** | 失败处理 | 见 §6.4 更正表 | 原表的 3 行错误已更正 |

### 6.7 独立安全审查的发现（2026-09-21，已逐条核验）

**审查者**：`security-reviewer`，覆盖我方 + codex + pi + opencode。以下断言由主代理独立复现。

#### 发现 1（高）：**我方今天已经能执行克隆仓库提供的任意命令——而 T5 的「无插件代码宿主」论证忽略了它**

`core/mcp/config.ts:27-45` 读取 `<workspaceRoot>/.private-agents.mcp.json`，`core/mcp/client.ts:146-149` 直接 `spawn(this.config.command, this.config.args ?? [], …)`。**整个 `core/mcp/` 路径零信任检查**（已核验：`grep -c "isProjectTrusted\|projectTrust"` 于全部 7 个 MCP 文件 → 全 0）。

**且 `gateway.ts:20-23` 声明的 `"command-not-allowlisted"` 阻断类型从未被任何代码路径产生**——它不是一个门。

**这动摇了 T5 §6.2 的核心论证**：该节把 `opencode` 的「克隆仓库即执行插件」记为反面教材，据此裁决「本轮只做声明式、不做插件代码宿主」。但**同一失效模式在我方已通过 MCP 可达**——「无插件代码宿主」对**插件子系统**为真，对**产品**为假。

**追加裁决**：T5 的范围必须包含「盘点并封堵既有的未受控执行面」，否则信任门只保护了新入口而放过了旧入口。至少涉及：
- `<workspace>/.private-agents.mcp.json`（spawn 任意命令）
- `.agents/workflows/*.json`（`workflow/runner.ts:98-104` `exec(step.run, …)`，已核验）
- `.agents/sandbox.json`（`sandbox/osSandbox.ts:53-66` 从 workspace 读取并**直接塑造沙箱计划**，已核验）
- `.agents/agents/*.md`（`subagents/subagentLoader.ts:65-66` 读取，body 成为 subagent 的 `systemPrompt`，零信任检查已核验）

#### 发现 2（高）：**仓库里已有一个完整但零消费者的信任实现——T5 的前提「需要新建信任基础设施」是错的**

`core/security/projectTrust.ts`（163 行）已实现 `ProjectTrustStore`，含 `isProjectTrusted` / `setProjectTrust` / `hasSensitiveProjectResources`，且 `projectTrust` 单例已导出。**零生产消费者**（只有自己的测试文件 import）。

**这与 T3 的「声明了、零消费者」是同构缺陷**，且 T5 的裁决通篇未提及它——**T5 的实际工作是「接线」而非「新建」**，成本与形状都不同。

#### 发现 3（高）：**既有的敏感资源探测器认不出 T5 要门控的那些资源**（已实测复现）

我复刻 `hasSensitiveProjectResources` 的逻辑跑了 6 种项目形态：

| 项目形态 | 探测结果 |
|---|---|
| `.agents/hooks.json`（T5 要读的配置） | **未探测到** ❌ |
| `.agents/hooks/`（目录） | 探测到 ✅ |
| `.private-agents.mcp.json`（spawn 命令） | **未探测到** ❌ |
| 根 `AGENTS.md`（T2 裁决 4 要求过门） | **未探测到** ❌ |
| `.agents/workflows/`（exec） | **未探测到** ❌ |
| `.agents/sandbox.json`（塑造沙箱） | **未探测到** ❌ |

**探测器由「固定文件名列表（只有 `SYSTEM.md`）+ 形状规则（任意 dot 目录含 `extensions`/`agents`/`skills`/`hooks` 子目录）」构成**，因此**结构上无法匹配 dotfile**，也无法覆盖仓库根的 `AGENTS.md`。

**若 T5 直接建在这个 store 上而不改探测器，门对 T5 新增的那一项资源永不触发，对 T2 裁决 4 要求过门的 `AGENTS.md` 也永不触发。**

#### 发现 4（高）：**哈希记录必须存放在项目写不到的位置——这是门是否成立的单点属性，原裁决未声明**

`codex` 的 `config_rules.rs:11-29` 把它写成**安全属性**而非实现细节：

> This intentionally reads only user and session flag layers… Project, managed, and plugin layers can discover hooks, but they do not get to write user hook state.

**缺了这条，一个仓库只要同时提供钩子配置与匹配的 `trusted_hash`，就能在首次加载时自我批准。** 原裁决 §9 把「状态存放位置未设计」记为未验证项，但**从未把「必须位于项目不可写的位置」写成实现必须满足的约束**。已补入 §6.5 裁决 3。

#### 发现 5（中）：**钩子的影响力面从未被声明，且钩子不受沙箱约束**

| 事实 | 证据 |
|---|---|
| `PostToolUse` 的 feedback **被拼接到模型可见的工具输出上**——项目可控文本进入提示词 | `turn/tools.ts:166-178` |
| `PreToolUse` 的 `retry` 判定被 dispatcher 返回，但**唯一消费者只检查 `block`**，`retry` 被静默丢弃 | `turn/tools.ts:136-148` |
| 钩子**不在沙箱内运行**：`hookDispatcher.ts:107-121` 用裸 `exec`，而 `bash` 工具走 `planSandboxedCommand` | 两者对比 |

**后果**：用户即使为工具命令启用了 OS 隔离，钩子进程仍是**完全特权、无沙箱**的。原裁决未提及这个不对称，而裁决 6 恰好在讨论「绕过审查的逃生口」。

#### 发现 6（中）：**批准提示里列出的内容本身是攻击者可控的**

裁决 2 要求逐项列出获批范围，但列出的是**项目编写的字符串**（命令文本、matcher、名称、路径）。逐字渲染给终端 = 仓库控制用户在决策瞬间读到什么（换行、控制序列、伪装成 harness 自身界面）。**codex 同样未处理**（`hooks_browser_view.rs:444-452` 直接渲染），因此这是**继承来的遗漏**。已补入裁决 2。

#### 发现 7（中）：**我方 dispatcher 的 fail-open 比文档描述的更严重**

已核验 `hookDispatcher.ts:107-156`：`exec` 错误（含**超时**）与 `JSON.parse` 抛错都被 catch、记日志、继续下一钩子、最终返回 allow。**即：一个超时的安全钩子等同于「无异议」。** 原裁决把它写成「garbage → no-op」（这是 codex 的行为），但**我方比 codex 差**——codex 至少把 JSON 解析失败记为可见的 `Failed`。

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

### 7.7 施工期更正（2026-09-22）

**更正 1：§7.2 表格里「`gemini-cli` 无上限」的对照结论未覆盖我方 glob。**

§7.4 只规定了目录列举的分页，**未规定 glob 的上限**。施工时实测：我方 `glob "**/*"` 在本仓匹配 **2744 条 / 155KB**，全部原样返回。§1.8 #1 早已裁决「加条数上限 + 字节上限 + 可操作通知」，但 T1 施工时判为「延迟到 T6」——**本轮已落实**（默认 500 / 上限 1000）。

**更正 2（重要）：glob 匹配器有两份手写副本，且都有同一缺陷。**

`registry.ts` 与 `grep.ts` 各有一份相同的 glob→regex 改写，其中 `(.+/)?` 的 `?` 被后续的 `.replace(/\?/g, '[^/]')` 吃掉，使可选组变必需。实测 `**/*.ts` 不匹配 `a.ts`、`src/**/*.ts` 不匹配 `src/a.ts`——**两者都是工具描述里宣传的形态**。

原裁决 §7.2 只对照了「忽略规则」与「上限」两列，**未对照「匹配器正确性」**。已引入 `picomatch`（零依赖、124KB）并删除两份副本。

**更正 3：§7.4「忽略」一行需要补充「省略计数」。**

原文只写「应用 T1 的统一忽略规则」。施工时确认 §7.7 #2/#3 的「报告数量」必须**同时覆盖被忽略的条目**，否则「全部被忽略的目录」会显示为 `is empty`——把「被排除」说成「不存在」。已实现并加测试。

---

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

**全部 7 项主决策 + 1 项新增任务（T7）+ 44 项补充裁决已定案，无待决项。**
**2026-09-21 经 5 个独立审查者（4 审查 + 1 安全）复核，发现并更正 13 处问题——见 §8.4。**

| 项 | 裁决 | 类型 | 成本 | 风险 | 关键依据 |
|---|---|---|---|---|---|
| **T3** | **删除** `thinkingBudgets` + `promptCacheTtl`；`tuiMode` 保留并加注释 | 删死配置 | 极低 | 极低 | **4 条请求路径都不消费数值预算**；非「语义冲突」 |
| **T7**（新增） | **死字段门禁**：文档声明的配置字段必须有生产消费者 | 防回归工具 | 极低 | 极低 | 三个独立实现都犯过（pi 的 `allowed-tools`、我方两个） |
| **T1** | **三层**：遍历期剪枝 + `git -C <root> ls-files` + 非 git 时进程内 `.gitignore` | 修缺陷（性能+正确性） | 中低 | 低 | 57.2% 白遍历；`.gitignore` 零支持；**子目录必须用 `-C`** |
| **T4** | 配置优先 + 目录回退 + **过大值告警（不钳制）** + 逐模型压缩预算 | 修缺陷 | 低 | 低 | 1M 模型被按 64k 压缩（浪费 93.6%） |
| **T2** | 祖先遍历（**止于项目根**）+ **32 KiB 预算** + 五候选含 `.override` + `/reload` + **过作用域信任门** | 修缺陷 | 低 | 中（推高固定成本） | `AGENTS.md` 对模型完全不可见 |
| **T2b** | **目录注入 + 复用 `read`**（**需先解决路径监狱**）；`scan` 改递归；过作用域信任门 | 修缺陷（含实测缺陷） | 低 | **中高（阻断性未决项）** | **实测 3 个嵌套技能只发现 1 个**；用户技能撞监狱 |
| **T6** | **做**：目录列举**折进 `read`**，应用 T1 忽略层 | **修缺陷** | 低 | 低 | `read` 对目录抛 EISDIR（实测） |
| **T5** | **声明式窄路径 + 内容哈希门 + 作用域门**；**范围扩大到封堵既有未受控执行面** | 补基础设施 + **修既有安全缺口** | **高**（范围已扩大） | 中高（安全面） | **MCP 已可执行克隆仓库的任意命令** |

### 8.1 本轮实测发现的**真实缺陷**

| 缺陷 | 实测证据 | 归属 |
|---|---|---|
| `read` 对目录抛原始 `EISDIR` | `IsADirectoryError: [Errno 21]` | T6 |
| `SkillLoader.scan` 只读一层，嵌套技能静默丢失 | 3 个 fixture 只发现 1 个 | T2b |
| **`read` 的路径监狱拒绝用户级技能** | `allowed: false`（实测复现） | T2b（**阻断性**） |
| **项目 MCP 配置可 spawn 任意命令，零信任检查** | `mcp/client.ts:146` + 全 MCP 目录 0 命中 | T5（**高**） |
| **既有信任探测器认不出要门控的资源** | 6 种形态实测，4 种未探测到 | T5（**高**） |

### 8.2 执行顺序

$$\text{T3} \to \text{T7} \to \text{T1} \to \text{T4} \to \text{T6} \to \text{T2/T2b} \to \text{T5}$$

**T2 与 T2b 合并为一轮**（共用 `Skill` 数据、同一系统提示组装点、同一信任门）。

**T6 的位置修订**：预研判为「补功能」并排在最后。**实测推翻了这个定性**——`read` 对目录抛 EISDIR 是真实缺陷。排在 **T1 之后**（硬依赖统一忽略层）、**T2 之前**（T2 推高请求成本，其收益评估需要 `/context` 数字准确）。

**T5 的范围修订（重要）**：原裁决把它定位为「补基础设施」（接线声明式钩子）。审查发现**既有未受控执行面已经存在**（MCP 命令、workflow `exec`、sandbox 规则、subagent 提示词），因此 T5 现在同时是**修既有安全缺口**。这提高了它的优先级权重，但**仍排在最后**——因为封堵既有缺口需要信任基础设施先就位。

### 8.3 移出本轮（附理由）

| 项 | 理由 |
|---|---|
| linked worktree 遮蔽 | 我方是否支持 worktree 工作流未裁决；记入 backlog |
| Windows glob 语义 | 我方无 Windows 目标 |
| CLI 级技能路径注入（`--skill`） | 我方无此需求 |
| 远程目录新鲜度刷新 | `catalogRefresh.ts` 已存在；已裁决「若引入则加 `localGeneratedAt` 守卫」 |
| 推理预算上限（防推理吃满 `max_tokens`） | 我方已有 `emptyAnswerExplanation` 检测；接入 token 型 provider 时成为必需 |
| 逐模型 thinking 档位层 | 我方 thinking 由项目状态驱动，无逐模型维度且无消费位点（与 T3 同因） |

### 8.4 审查轮次与更正（2026-09-21）

**方式**：5 个独立子代理（T1+T6 / T2+T2b / T3+T4 / T5 安全 / 交叉一致性），各带硬范围限制（禁止扩展方向）。主代理**逐条复现**每个断言。

**更正 13 处**，按严重度：

| # | 更正 | 严重度 |
|---|---|---|
| 1 | T5：**项目 MCP 配置可执行任意命令**，原「无插件代码宿主」论证遗漏了它 | **高** |
| 2 | T2b：**用户级技能撞 `read` 路径监狱**，§3.3 设计按现状无法工作 | **高（阻断）** |
| 3 | T5：既有信任探测器认不出要门控的资源（实测 6 形态） | **高** |
| 4 | T1：**`git ls-files` 调用形式错误**——裸调用在子目录下静默丢文件 | **高** |
| 5 | T4：**上限钳制不可实施**——`CatalogModel` 无上限字段 | **高** |
| 6 | T5：`SessionEnd` 超时 180s 是**无出处的虚构数字**（实际 1s/3s） | 中 |
| 7 | T5：§6.4 三行错误描述 codex（fail-open 分级、exit-code 契约、输出上限） | 中 |
| 8 | T5：自举风险的理由**说反了**——pi 的两遍加载正是关闭该洞的机制 | 中 |
| 9 | T3：**4 条请求路径**，非「唯一 fetch」（结论不变，论据更正） | 中 |
| 10 | T2b：四处「同一个门」混用了**内容哈希门**与**作用域门** | 中 |
| 11 | T1：pi 的 `skills.ts` **依赖 npm `ignore` 包**，不是无依赖手写参考 | 中 |
| 12 | T3：两处「未考虑」发现**被静默丢弃**（现补录） | 中 |
| 13 | T4：`tuiMode` 保留与 T3 删除纪律的张力需注释说明 | 低 |

**同时确认正确的**：T1 的三份硬编码列表不一致、T6 的 EISDIR、T2b 的 `scan` 只读一层、T3 的字段零消费者（三个「零消费者」断言全部 CONFIRMED）、T2 的 `AGENTS.md` 零注入、T5 的 `registerCommandHook` 零调用者。

**审查自身的局限（如实记录）**：
- 一个审查者报 `contextAnalysis.ts:44` 是第四个生产解析点——**已核实为误报**（只被测试文件引用）。
- 审查发现的 40 项「未考虑」中，**2 项**（T3 §4.4 的逐模型 thinking 与 `xhigh`/`max` 折叠）此前确实落空，现已补录。
- 测试覆盖仍不完整：44 项补充裁决中约 **12 项**有对应测试要求（`phase-3-comparison.md` §9 共 19 行）。**这是已知缺口**，施工时逐项补齐。

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
