---
title: "Phase 3 前置研究：从七个对照文档收拢出的任务与依据"
category: article
sources: [pi-source-2026-09-21, repo-audit-2026-09-21, phase-1-execution-2026-09-20, phase-2-execution-2026-09-21]
created: 2026-09-21
updated: 2026-09-21
tags: [features, phase-3, pre-research, gap-analysis]
summary: "Phase 3 开工前的地形测绘。Phase 1/2 已收口配置、钩子、主题、rewind 摘要、事件流与压缩层；本轮把七份对照文档里**剩余**的缺口按「证据强度 + 是否同源缺陷 + 成本」重新排序，给出 6 个候选任务与执行顺序。核心发现：三处「声明了但消费方为零」的配置字段应删而非接；文件遍历是全仓最大的一处性能与正确性双重缺陷；`AGENTS.md`/技能对模型完全不可见。"
confidence: high
---

# Phase 3 前置研究

> **性质**：Phase 3 开工前的测绘，**零代码改动**。
> **输入**：`.wiki/features/01-*` … `07-*` 七份对照文档、`phase-0-disposition.md`、
> `phase-1-execution.md`、`phase-2-execution.md`。
> **输出**：本轮给出**候选任务**与**执行顺序**，不含施工。

---

## 0. 方法与边界

### 0.1 本轮不重复报告已收口项

Phase 1 与 Phase 2 已关闭的项**不再作为缺口列出**，只在与新发现同源时引用：

| 已关闭 | 依据 |
|---|---|
| 配置字段返回（P1） | `phase-1-execution.md` §2.1 |
| `settingsLoader` 团删除 | 同上 §3.1 |
| 18 个钩子事件全部有派发点 | 同上 §4 |
| `setTheme` → `applyTheme` | 同上 §5.1 |
| rewind 分支摘要 | 同上 §5.2 |
| metrics 写入日志流 | 同上 §6.1 |
| `read` 图片二进制缺陷 | 同上 §6.2 |
| `--json` 事件流 | 同上 §6.3 |
| 压缩器统一 + 防膨胀 + checkpoint 继承 | `phase-2-execution.md` §4 |
| 切点不再随请求体积缩放 | 同上 §5 |

### 0.2 五项并行勘察（子代理）

| 勘察 | 覆盖 | 结果 |
|---|---|---|
| 文件遍历与忽略 | P3、工具层 | 完整 |
| 上下文注入 | P5、AGENTS.md、技能、模板 | 完整 |
| 程序化接口 | `--json`、导出、会话格式、RPC | 完整 |
| 零散待办 | 7 项逐个核实 | 完整 |
| 扩展宿主 | P4、插件、键位、`@` 引用 | **3 次因上游内容过滤器失败，主代理自行完成** |

**主代理逐条核验**了所有进入本文件结论的断言（§5 列出核验方式）。

---

## 1. 三处「声明了但消费方为零」——裁决为**删除**

`phase-1-execution.md` §2.3 记录了「3 个字段保留待接线」：
`tuiMode`、`thinkingBudgets`、`promptCacheTtl`。本轮逐个核实，**结论是其中两个应删、一个需要先补基础设施**。

| 字段 | 现状（已核实） | 裁决 | 理由 |
|---|---|---|---|
| `thinkingBudgets` | 声明 `Record<string, number>`，**零消费者** | **删除** | 与 `thinkingCommandRuntime.ts` 的**语义冲突**：活轨走 OpenAI 兼容的 `reasoning_effort` **档位**（`low`/`medium`/`high`，见 `turn/step.ts:102-114`），而本字段是 Anthropic 的**数值 token 预算**概念。接线会产生两个 thinking 来源——与 Phase 1 已删的 `permissionMode` 同构 |
| `promptCacheTtl` | 声明 `"5m" \| "1h"`，**零消费者** | **删除** | 我们的 provider 层只发标准 `POST /chat/completions`（`turn/step.ts:100-135`）。该端点**没有**请求级缓存 TTL 参数（OpenAI 的缓存是 1024+ token 前缀自动生效；Anthropic 用 `cache_control` 块标记，不是根字段）。接线只能接成空转或 400 |
| `tuiMode` | 声明 `"regular" \| "fullscreen" \| "stream"`，**零消费者** | **暂缓，不删** | 它是**真能力**（`supportsFullScreenSurface` 已有能力探测，见 `cli/interactive/interactiveLoop.ts:50`），只是没有配置入口。接线需要把 `runtimeConfig.tuiMode` 传进表面选择。**成本低但不是本轮最高价值** |

**与 Phase 1 的纪律一致**：`phase-0-disposition.md` §1.5 已确立「声明了但没接的，要么接上要么删掉，不要保留中间态」。
`thinkingBudgets` 与 `promptCacheTtl` 属于「接了也没有对应能力」——**保留它们就是在类型里说谎**。

---

## 2. 文件遍历：本轮发现的**最大单一缺陷**（P3）

### 2.1 现状（已实测，非推断）

`runtime/execution/service.ts:127-138`：

```ts
async function listFilesRecursive(root: string): Promise<readonly string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async entry => {
      const fullPath = path.join(root, entry.name)
      if (entry.isDirectory()) {
        return listFilesRecursive(fullPath)   // ← 无任何剪枝
      }
      return [fullPath]
    }),
  )
  return files.flat()
}
```

**实测本仓库**：

| 指标 | 数值 |
|---|---|
| 递归走过的文件总数 | **14,023** |
| 其中 `.git/` 下 | 6,389（45.6%） |
| 其中 `node_modules/` 下 | 1,485（10.6%） |
| 过滤后真正可用的 | 6,149（43.8%） |
| **白走过的比例** | **7,874 / 14,023 = 56.2%** |

### 2.2 这是**性能与正确性**的双重缺陷，不只是性能

**性能**：每次 `glob`/`grep`/`lsp` 都把整棵树读进内存，再在调用方过滤。

**正确性**（更严重，且此前未被记录）：**过滤是「调用方各自硬编码」，三份列表互不相同、且都不读 `.gitignore`**：

| 调用方 | 硬编码排除 |
|---|---|
| `core/tools/registry.ts:576`（glob） | `node_modules/`、`.git/`、`dist/` |
| `core/tools/grep.ts:122-131` | `node_modules/`、`.git/`、`dist/`、**`.normproof/`** |
| `core/tools/lsp.ts:128` | `node_modules/`、`.git/`、`dist/`（另加扩展名白名单） |

三份列表**不一致**：同一个文件在 `glob` 里可见、在 `grep` 里不可见。而**全仓检索 `gitignore` 零命中**——
即：**用户写在 `.gitignore` 里的排除规则，我们的工具完全不认**。

### 2.3 对照参考实现

| 项目 | 做法 | 位置 |
|---|---|---|
| `pi` | 调用外部 `rg` / `fd` 二进制，工具描述明确写 "Respects .gitignore" | `core/tools/grep.ts:110-168`、`core/tools/find.ts:170-216` |
| `opencode` | 同样委托 `ripgrep`，显式 `--glob=!**/.git/**` | `packages/core/src/ripgrep.ts:160-176` |
| `gemini-cli` | npm `glob` 包 + `getFileExclusions().getGlobExcludes()` | `packages/core/src/tools/glob.ts:203-228` |

**三者都尊重 `.gitignore`。我们三者都没做到。**

### 2.4 修复路径的取舍（**不复制 `pi` 的做法**）

`pi` 依赖 `utils/tools-manager.ts`（**400 行**）从 GitHub Releases **下载** `fd`/`rg` 二进制到本地缓存。
**这条路径不适合我们**，理由有三：

1. 引入**网络依赖**：首次使用需下载，离线环境直接不可用（`pi` 自己也有 `--offline` 分支）。
2. 引入**供应链面**：从第三方 release 拉二进制并执行。
3. 我们的依赖面只有 **3 个**（`playwright-core`/`typescript`/`undici`），不该为此破例。

**采用零依赖方案**：`git ls-files --cached --others --exclude-standard`。

**已实测其语义**（在本仓库与非 git 目录各验证）：

| 检查 | 结果 |
|---|---|
| `.gitignore` 生效（`node_modules` 被排除） | ✅ 0 命中 |
| **未跟踪但未被忽略的新文件**被包含 | ✅ 找到 |
| 新目录下的未跟踪文件被包含 | ✅ 找到 |
| 新加的 `.gitignore` 规则立即生效 | ✅ 被排除 |
| 本仓库文件数 | **14,023 → 2,740（降 80.5%）** |
| 耗时 | **0.32s** |
| **非 git 目录** | ❌ `fatal: not a git repository`（**必须有回退**） |

**因此设计为两层**：

1. **遍历期剪枝**（零依赖、始终生效）：`listFilesRecursive` 接受剪枝判定，默认排除 `.git`/`node_modules`/`dist`/`.normproof`——**把三份不一致的硬编码列表收敛为一份**。
2. **`.gitignore` 支持**（git 仓库内）：优先用 `git ls-files`；**非 git 目录回退到第 1 层的纯遍历**。

我们**已经**在 `workflow/gitContext.ts:1,34` 用 `spawnSync('git', ...)` 调用 git，所以这不是新依赖面。

---

## 3. 上下文注入：`AGENTS.md` 与技能对模型完全不可见（P5）

### 3.1 现状（已核实）

`turn/prompt.ts:26-40` 的 `buildSystemPrompt` 是**纯字面量**：

```ts
export function buildSystemPrompt(agentMode: "plan" | "build" | undefined): string {
  return [
    "You are an expert autonomous coding agent equipped with real tools (...)",
    agentMode === "plan" ? "PLAN MODE ACTIVE: ..." : "BUILD MODE ACTIVE: ...",
    "CRITICAL EXECUTION & ANSWER RULES:",
    ...
  ].join("\n");
}
```

**不含**：项目指令、技能、工具清单、cwd、git 状态、日期。

**`AGENTS.md` 全仓引用仅 3 处，无一处读取内容**：
- `initCommandRuntime.ts:65` — `existsSync` 只判存在
- `registry.ts:307` — 命令描述字符串
- `contextContinuityManifest.ts:54` — 元数据描述符里的字面量

**讽刺之处**：本仓库自己的 `AGENTS.md`（**138 行 / 8,942 字符**）规定了这个项目的全部工程纪律
（架构边界、验证纪律、参考项目使用规则）——**而运行中的 agent 看不到它**。

**技能**：`SkillLoader` 已实现完整发现（用户级 + 项目级、frontmatter 解析、项目覆盖用户），
但**只有两个消费者**：`/skill` 命令（打印给人看）与技能选择器（UI）。
`Skill` 类型已带 `name`/`description`/`filePath`——**正是目录所需**——却从不进入 prompt。

### 3.2 对照参考实现（已读源码）

`pi` 的 `system-prompt.ts` 是**分节组装**的：

| 节 | 内容 | 位置 |
|---|---|---|
| `project_context` | `AGENTS.md`/`CLAUDE.md`，包在 `<project_instructions path="...">` | `system-prompt.ts:72-78,164` |
| 技能目录 | `<available_skills>` 列 `name`/`description`/`location`，让模型按需 `read` | `system-prompt.ts:165-169` |
| 工具清单 | 只列当前可见工具 + 各自 snippet + 去重 guidelines | `system-prompt.ts:140-150` |
| `cwd` | `<cwd>` 包裹 | `system-prompt.ts:170` |

`pi` 的上下文文件加载是**层级**的：全局 agent 目录 + 从根到 cwd 的**每一级祖先目录**，
并按 `AGENTS.override.md` > `AGENTS.md` > `CLAUDE.md` 优先级取首个
（`resource-loader.ts:72,120-156`）。

**关键设计**：技能**只注入目录**（名字/描述/路径），**不注入正文**。
模型匹配到任务时自己 `read` 技能文件。这避免了「把所有技能正文塞进 system prompt」的成本。

### 3.3 本项的价值判断

这不是「补一个 MISSING」，而是**修一个自相矛盾**：
项目把规则写在 `AGENTS.md` 里，工具却把它当不存在。Phase 3 应至少交付 `AGENTS.md` 注入；
技能目录是同一机制的自然延伸。

---

## 4. 候选任务汇总

按**证据强度 + 是否修真实缺陷 + 成本**排序。

### T1 文件遍历剪枝 + `.gitignore`（P3）

| 维度 | 内容 |
|---|---|
| **性质** | 修缺陷（性能 + 正确性），非补功能 |
| **证据** | §2：56.2% 白遍历；三份不一致的硬编码列表；`.gitignore` 零支持 |
| **成本** | 中低。改 5 处：`runtime/execution/service.ts`（遍历）、`types.ts`（请求形状）、`registry.ts`/`grep.ts`/`lsp.ts`（收敛调用） |
| **风险** | 低。行为变化是「更少且更一致的可见文件」，可用现有测试 + 实测文件数验证 |
| **验证** | 实测遍历文件数（14,023 → 约 2,740）、`.gitignore` 规则生效、非 git 目录回退、三工具可见文件集一致 |

### T2 `AGENTS.md` + 技能目录注入（P5）

| 维度 | 内容 |
|---|---|
| **性质** | 修缺陷（规则对模型不可见） |
| **证据** | §3：`buildSystemPrompt` 纯字面量；`AGENTS.md` 三处引用无一读取；技能零注入 |
| **成本** | 低。新增一个上下文加载模块 + `turn/prompt.ts` 接受注入内容 |
| **风险** | 中。**注入体积会推高每次请求的固定成本**——`AGENTS.md` 8,942 字符 ≈ 2,555 tokens。需定上限与截断策略 |
| **验证** | 实机：模型能复述 `AGENTS.md` 里的规则；`/context` 显示固定开销上升 |

### T3 删除两个说谎的配置字段（`thinkingBudgets`、`promptCacheTtl`）

| 维度 | 内容 |
|---|---|
| **性质** | 删死配置（延续 Phase 1 纪律） |
| **证据** | §1：零消费者 + 与活轨语义冲突 / 端点不支持 |
| **成本** | 极低。删字段 + 删钉住它们的测试 |
| **风险** | 极低 |
| **验证** | `tsc` 0 错；全量测试 |

### T4 逐模型上下文窗口解析（03-* §3.1）

| 维度 | 内容 |
|---|---|
| **性质** | 修缺陷（**与用户上一轮抓到的 `/context` 缺陷同源**） |
| **证据** | `core/models/catalog.ts:18-24` 已带 `contextWindow`（`claude-opus-4-6: 200_000`、`gemini-3-pro: 1_048_576`）；但三处解析点**全部只读 `runtimeConfig.contextWindow ?? 64_000`**（`cliSessionRuntimeFactory.ts:55`、`sessionFacts.ts:68`、`contextCommandRuntime.ts:38`） |
| **影响** | 1M 窗口的模型被按 64k 压缩——**过早压缩约 55,616 tokens**（与 `07-*` §2.1 的量化一致） |
| **成本** | 低。3 个文件各改一处解析顺序 |
| **风险** | 低，但两个已核实的实现细节必须注意：①`loadCatalog()`（`core/models/catalogStore.ts:45`）**每次同步读文件**，不能在热路径反复调用；②**活动模型不在 `runtimeConfig` 里**——它来自 `resolveProviderCredential(...).model`（`core/shell/providerCredentials.ts:37`，由 `cliProviderRuntimeBridge.resolveCredentialSnapshot()` 提供）。因此解析点必须放在**已有 credential snapshot 的地方**（`cliSessionRuntimeFactory.ts` 已在用），而不是简单读 config |
| **验证** | 选一个 200k 模型，断言 `/context` 与压缩策略都用 200k |

### T5 扩展宿主的**最小诚实步骤**（P4）

| 维度 | 内容 |
|---|---|
| **性质** | 补基础设施（Phase 1 只解决了「类型诚实」，未解决「可扩展」） |
| **证据** | `hookDispatcher.ts:38` `registerCommandHook` **零调用者**；生产只用 `defaultHookDispatcher = new HookDispatcher()`（无 config）；插件子系统 `InstalledPlugin` **只存元数据，从不执行代码**（`getInstalledPlugins` 仅喂 UI 选择器） |
| **成本** | 中。需要一个配置文件加载器 + 校验 + 调用已有的 `registerCommandHook` |
| **风险** | **中高**。这是**执行外部命令**的入口，属安全面。需要审批/信任边界设计 |
| **裁决建议** | **本轮只做「文件 → `registerCommandHook`」的窄路径**，不做完整插件宿主。理由：注册函数与事件类型都已存在，缺的只是一个受校验的配置读取点；而「执行第三方代码」是另一个量级的安全问题，应独立立项 |

### T6 `ls` 工具（M4）

| 维度 | 内容 |
|---|---|
| **性质** | 补功能（小） |
| **证据** | 我们的工具集无 `ls`；`pi` 有（`core/tools/ls.ts:59-65`） |
| **成本** | 低。~80 行 + 注册 + 测试，复用现有路径监狱与截断 |
| **风险** | 低 |
| **优先级** | **低于 T1**——`ls` 的收益是「省一次 bash 启动」，而 T1 是每次 glob/grep 都付 56% 的浪费 |

### 本轮明确**不做**（附理由）

| 项 | 理由 |
|---|---|
| **完整 RPC 协议（M9）** | `pi` 有 JSONL RPC + CBOR/Unix-socket 双协议，`opencode` 有 HTTP+SSE。我们的 `--json` 是**只写流**（`cliRuntimeModule.ts:403-408` 只绑定 `process.stdout.write`），无入站通道。补成双向需要定义 framing + 审批远程应答，**是新契约设计**，不应塞进 Phase 3 |
| **HTML 导出 / 会话分享（M8）** | 需先定隐私边界（`pi` 会上传到远端或建 gist）。属产品决策 |
| **订阅式 OAuth（M10）** | 需真实 provider 凭据流，无法在隔离环境验证 |
| **图片输入** | Phase 1 §9 已判定需 `SessionMessage.content` 类型迁移（156 处），独立立项 |
| **`OURS-ONLY` 各项** | 维护者指示暂缓 |
| **`context/compact/` 域（2,919 行）** | Phase 2 已查明它不是压缩器而是交接包生成器，与压缩层无冲突 |

---

## 5. 核验记录

本文件所有结论均由主代理**逐条核验**，方式如下：

| 结论 | 核验方式 |
|---|---|
| 遍历无剪枝、无 `.gitignore` | 读源码 + **实测** 14,023 / 2,740 / 0.32s + 非 git 目录回退 |
| 三份硬编码列表不一致 | `grep -rn "node_modules/"` 逐处比对 |
| `git ls-files` 语义正确 | 4 项边界实测（新文件、新目录、新 ignore 规则、非 git） |
| `buildSystemPrompt` 是字面量 | 读源码 |
| `AGENTS.md` 零内容读取 | 全仓 3 处引用逐个读 |
| 技能零注入 | 两个消费者逐个读 |
| `pi` 注入方式 | 读 `system-prompt.ts` + `resource-loader.ts` 源码 |
| 三个配置字段零消费者 | `grep` 全仓 |
| `thinkingBudgets` 与活轨冲突 | 读 `turn/step.ts:102-114` + `thinkingCommandRuntime.ts:18-20` |
| 目录 `contextWindow` 被忽略 | 读 `catalog.ts:18-24` + 三处解析点 |
| `registerCommandHook` 零调用者 | `grep` 全仓 |
| 插件只存元数据 | 读 `pluginCommandRuntime.ts` + 确认无 `await import`/`require` |
| `--json` 只写 | 读 `cliRuntimeModule.ts:403-408` |

**未核验 / 未做**：
1. **未运行任何构建或产品**：本文件全部为静态分析 + 实测（文件计数、`git ls-files` 语义）。
2. **未测 T2 注入后的真实 token 开销**：`AGENTS.md` 8,942 字符按 3.5 折算约 2,555 tokens，
   但真实 tokenizer 下的开销未测。
3. **未评估 T1 在超大仓库上的表现**：本仓库 14k 文件属中等；`git ls-files` 在 monorepo
   上的耗时尚需实测。
4. **T5 的安全边界未设计**：只指出「需要一个受校验的配置读取点」，未定义信任模型。

---

## 6. 建议的执行顺序

$$\text{T3（删死配置）} \to \text{T1（遍历）} \to \text{T4（逐模型窗口）} \to \text{T2（上下文注入）} \to \text{T6（ls）} \to \text{T5（扩展宿主窄路径）}$$

**理由**：

1. **T3 先做**：零风险、清掉类型谎言，让后续改动不再受「这个字段到底有没有用」的干扰。
2. **T1 次之**：它是**唯一的性能 + 正确性双重缺陷**，且改动面封闭（5 处），
   验证方式客观（文件计数 + `.gitignore` 生效）。放前面能让后续所有工具类工作受益。
3. **T4 第三**：与用户上一轮亲自抓到的 `/context` 缺陷**同源**（配置值被忽略），
   证据最硬，成本最低。
4. **T2 第四**：价值高但**会推高每次请求成本**，需要在 T1/T4 之后，
   以便 `/context` 的固定开销数字已经准确（T4 刚修过）。
5. **T6 第五**：小功能，但 `ls` 的收益依赖 T1 已把遍历修好（否则新工具继承同一缺陷）。
6. **T5 最后**：唯一触及安全面的项，且需要设计信任模型，应在其他项稳定后单独处理。

**每个任务的施工纪律**（沿用 `plan.md` §2.4 与 `agent-rules/testing-and-validation.md`）：
先写会失败的回归测试 → 施工 → 反向验证（移除改动后测试必须失败）→ 实机验证 → 全量门禁。
