---
title: Phase 3 未做项的价值重审
tags: [phase-3, review, backlog, decisions]
created: 2026-09-22
---

# Phase 3 未做项的价值重审

Phase 3 的七个任务全部完工并推送，但有 **14 项裁决要求或候选改进没有实现**。本文件是对这 14 项的**重新审查**：逐项查证本地参考实现（`pi` / `codex` / `opencode` / `gemini-cli`）**实际怎么做**，据此把「有价值」与「无价值」分开，而不是凭感觉判断该不该补。

**方法**：5 个独立只读子代理并行重审，每组带硬范围限制；每条断言要求 `file:line` + 逐字引文；主代理对**决定性断言**逐条复现（下文标注「已核验」）。子代理报告存于 `agent://` 产物，未采信未核验部分。

**一条结论被推翻**：我此前判定的「`/reload` 不需要」**只对了一半**——指令、技能、钩子确实每轮重建，但**配置不是**。详见 A-4。

---

## A. 有价值 → **已实现**（4 项）

> **状态更新（2026-09-22）**：A 组四项**已全部实现并验证**，见 §A.0。下方保留原始判定依据（它解释了「为什么值得做」）。

### A.0 实现记录

| 项 | 改动 | 验证 |
|---|---|---|
| **A-1 字节上限** | `glob.ts` / `directoryListing.ts` 在 `join` 后调用既有的 `truncateHead`（50KB）；超限**落盘**并给出 artifact 路径 + 条数/字节两种通知分开陈述 | 新增 3 项测试；**反向验证**：撤销截断 → 3 项失败 |
| **A-2 分层** | 未改动——字节截断**没有**下沉到 `fileWalk.ts`，维持「遍历层管条数、工具层管字节」 | 与四家参考一致 |
| **A-3 技能诊断** | `SkillLoader.loadDetailed()` 新增 `diagnostics`；缺 `description` 与名称违规各自报告（**只警告仍加载**，与 `pi` 的两级划分一致）；`discoverSkills` 写入 `skills` 组件日志 | 新增 4 项测试 |
| **A-4 `/reload`** | 新增 `/reload` 命令；`ShellRuntimeContext.runtimeConfig` 由 `readonly` 改为可替换（附理由）；经 `refreshRuntimeConfig` 协作回调贯通**交互与非交互两条路径** | 新增 6 项测试；**实机验证**：会话中改配置 → `maxTurns: 15 → 99` 并生效 |

**A-1 的一处设计取舍**：字节超限时**落盘**（对齐 `opencode`/`codex`）而非丢弃——同一次匹配的结果不会变得不可达，模型可以读文件而不是重跑更窄的搜索。

**A-4 的范围**：只重读**运行时配置**。指令、技能、钩子本就每轮重读，命令里明确说明「哪些刷新了、哪些仍需重启」，不暗示全量重载。

---

## A'. 原始判定依据

## A. 有价值 → 应当做（4 项）

### A-1. `glob` 与目录列举的**字节上限** ⭐最高优先

| | |
|---|---|
| **证据强度** | **强（3/4 家一致，且 `pi` 有决定性注释）** |
| **裁决出处** | §1.8 #1 明文要求「条数上限 **+ 字节上限** + 可操作通知」 |
| **我方现状** | 只有条数上限。实测本仓 1000 条最长路径 = **69.4KB ≈ 17.7k tokens**；500 条默认 = 38KB |

**决定性证据（已核验）**：`pi` 在**已经限制了条数**的工具上**仍然单独保留字节截断**，并留下一句直接回答本问题的注释：

```ts
// ls.ts:140-141
// Apply byte truncation. There is no separate line limit because entry count is already capped.
const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER });
```

```ts
// grep.ts:281-282
// Apply byte truncation. There is no line limit here because the match limit already capped rows.
```

作者把 `maxLines` 设为 `MAX_SAFE_INTEGER`（因为条数已封顶）却**仍然调用字节截断**——即：**条数上限不构成字节上限**。

`opencode` 更彻底：`tool-output-store.ts:14-15` 定义 `MAX_LINES = 2_000` / `MAX_BYTES = 50 * 1024`，并在**所有工具返回前统一兜底**（`ToolOutputStore.bound`），超限则**落盘**并在文本里给出文件路径。

**不做会怎样**：不是「少个便利」。monorepo 的深层路径（bazel/nix hash、嵌套 `node_modules`）单行 150–200 字节，1000 条可达 **150–200KB ≈ 40–50k tokens**，直接击穿上下文、显著拖慢推理。我方 `turn/tools.ts` **没有全局字节兜底**（已核验），所以这 69KB 是原样进模型的。

**成本**：**低**。复用我方已有的 `truncateHead`（`grep.ts:138` 已在用），在 `glob.ts` 与 `directoryListing.ts` 的结果组装后加一行 + 通知文案。

**建议：做。**

### A-2. 分层维持不变（**不是改动项，但要记录为已确立的架构**）

`pi`/`codex`/`gemini-cli`/`opencode` **四家一致**采用二层分工：

| 层 | 职责 | 我方对应 |
|---|---|---|
| 遍历 / 搜索引擎层 | **条数**短路（防死循环与大目录 I/O） | `runtime/execution/fileWalk.ts` |
| 工具层 | **字节**截断（格式化后的最终字符串） | `glob.ts` / `grep.ts` / `directoryListing.ts` |

**理由（子代理给出，我认可）**：遍历层只接触原始 `Dirent`，无法预知格式化后的字节数（前缀、后缀、`[DIR]` 标记、换行）。

**建议：维持现状**，且 A-1 的字节截断**不要**下沉到 `fileWalk.ts`。

### A-3. 技能诊断两条（名称校验 + 无描述告警）

| 项 | `pi` 的做法（已核验） | 价值 |
|---|---|---|
| 无 `description` | **硬失败不加载 + 明确诊断** `"description is required"` | **是** |
| 名称格式 | `MAX_NAME_LENGTH = 64`；正则 `/^[a-z0-9-]+$/`；禁首尾 `-`、禁 `--`；**仅警告仍加载** | **是** |

`pi` 的两级划分（`skills.ts:92-127` 校验函数；`:339-344` 硬失败分界）值得照搬——**「无法被匹配」与「格式瑕疵」不是同一级问题**。

**不做会怎样**：用户漏写 `description` 时技能**静默消失**在模型视野外，控制台无任何线索。属于典型体验暗坑：技能明明写好了，模型却永远看不见。

**成本**：**低**。我方**已有** `createComponentLogger("skills")` 通道（`discoverSkills` 里已用它报重名冲突），复用即可。

**建议：做**（两项一起，约 20 行）。

### A-4. `/reload` —— **我此前的结论被推翻，只对了一半**

**我此前判定**：「系统提示每轮重建，故 `/reload` 是纯装饰」。

**重审后的实测（已核验）**：

| 资源 | 是否自动刷新 | 证据 |
|---|---|---|
| 项目指令（`AGENTS.md`） | ✅ 每轮 | 走 `startTurn` → `buildPromptContext` |
| 技能 | ✅ 每轮 | `new SkillLoader().load()` 每次重读（实测新增技能立刻可见） |
| 声明式钩子 | ✅ 每轮 | `registerDeclaredHooks` 在 `startTurn` 内 |
| **配置（`config.json`）** | ❌ **仅启动时读一次** | `cli/bootstrap/cliBootstrapContext.ts:63`，之后经 `runtimeContext.runtimeConfig` 传递 |

实测：启动读到 `maxTurns: 15`，会话中改成 99 后**重新调用 `getRuntimeConfig` 得到 99**，但运行中的会话仍持旧值。

**不做会怎样**：长会话中修改 `maxTurns`、`modelTokenBudgets`、`instructionBudgetBytes`、`theme` 等**静默不生效**，用户只能退出重启——而界面上没有任何提示。这是**可观测的失效**，不是便利缺失。

**成本**：**低到中**。需要一处能刷新 `runtimeContext.runtimeConfig` 的入口；比 pi 的 `/reload`（重载扩展、设置、键位、技能、上下文、API provider）范围小得多。

**建议：做**（范围限定为「重读运行时配置」，不必照搬 pi 的全量重载）。

---

## B. 有价值但明确排后（4 项）

| # | 项 | 证据 | 建议 |
|---|---|---|---|
| B-1 | **统一工具输出的字节兜底层** | `opencode` 的 `ToolOutputStore.bound` 是**唯一**统一兜底实现（`gemini-cli` 漏掉 glob/ls，我方也漏掉 glob/目录列举） | **backlog**：先做 A-1 补齐两个工具；统一兜底作为后续防御层 |
| B-2 | **超限落盘** | `opencode` 与 `codex`（`output_spill.rs`）都做；但 `pi` 的文件搜索类工具**只给提示不落盘** | **backlog**：对「refine pattern 即可」的搜索类工具价值低；对 `bash`/`read` 更有用 |
| B-3 | **CLI 级技能路径注入 `--skill`** | 仅 `pi` 有（additive，穿透 `--no-skills`）；`codex` 用 RPC | **backlog**：纯调试便利，不影响核心 |
| B-4 | **模型切换溢出归属守卫** | `pi` 的 `sameModel`（`agent-session.ts:2616`）+ `codex` 的 downshift compact（`turn.rs:1101`）都做 | **backlog**：单模型到底场景下不触发；改动面涉及跨轮状态 |

---

## C. 无价值 → 不做（6 项，含 2 项**做了反而是错的**）

### C-1. linked worktree 遮蔽 —— **我方物理不可达**

`pi` 的 `findShadowedContextFile` 修的是「同一份上下文被应用两次」。**但那个缺陷是我方架构消除的**：

- `pi` 向上遍历**无视 `.git` 边界**，一路爬到文件系统根 → 会同时读到 worktree 与主仓库两份。
- 我方（`projectInstructions.ts:108-117`）遇到 `.git` 即 `break`；而 linked worktree 根目录**必然有 `.git` 文件**（内容为 `gitdir: ...`）→ **永不越界**。

**实测验证**：在真实 linked worktree 里加载，只得到 worktree 自己的一份，**不重复**。

**成本中、收益零。建议：不做。**

> **顺带发现一个反向问题（记录，不修）**：正因为止步于 `.git`，当 worktree 里**没有**自己的 `AGENTS.md`（例如该文件未被跟踪、或被 gitignore——实测很常见）时，主仓库的规则**完全不可见**。这与 `pi` 的取舍相反：`pi` 选择「宁重复、不遗漏」，我方选择「宁遗漏、不重复」。**是否要改属产品判断**，不在本次范围。

### C-2. Windows glob 语义改写 —— **做了有害**

`pi` 的 `replaceAll("/", "[/\\]")` 是**为外挂二进制 `fd` 打的补丁**（`fd --full-path` 在 Windows 要求反斜杠）。

**四家中仅 `pi` 一家做**。`codex`（Rust globset）、`opencode`（ripgrep）、`gemini-cli`（Node `glob`）**都不做**。

我方用 `picomatch`，其规范要求 pattern 保持 POSIX `/`；强行改写会**破坏其解析**。

**建议：不做**（做了反而引入 bug）。

### C-3 ~ C-6

| # | 项 | 理由 |
|---|---|---|
| C-3 | 技能懒加载（读文件时加载该目录技能） | **技能：0 家做**（`opencode` 只对 `AGENTS.md` 做，且**深度依赖 `read` 工具回传 `metadata.loaded` 的专有契约**）。违背 Agent Skills 规范，成本高 |
| C-4 | 钩子超时可配置 | `codex` 支持 `timeout_sec` per hook，但**四家中仅此一家暴露**；我方 3s/15s 已能拦截死循环且不卡交互。极少数场景 |
| C-5 | 模型目录新鲜度刷新 | **此项应归入 A**；但优先级低于 A-1~A-4。我方 `catalogRefresh.ts` 已是可复用能力，**仅缺触发点** |
| C-6 | `RuntimeProvider` 与 vendor id 统一 | 见下方 D |

---

## D. 一项需要纠正的**判断**（不是「不做」，而是「做法要改」）—— **已修**

> **状态更新**：已实现并验证。`catalogWindow` 现在返回 `{ window }` 或 `{ claimedBy }`：
> 唯一认领 → 用它；**多家认领 → 不取首个，回落到默认值并在警告里列出全部认领者**。
> 新增 2 项测试；**反向验证**：改回「取首个」→ 1 项失败。实机确认正常路径（唯一认领）不受误伤。
> 下方保留原始判定依据。



### 模型 ID 回退匹配：当前实现有**静默错配**风险

**我方现状**：精确匹配失败后，**按模型 id 遍历整个目录取首个命中**。依据是「实测目录里 0 个模型 id 出现在两个 provider 下」。

**`pi` 的做法（`model-resolver.ts:467-503`，已核验）** 明确禁止按目录顺序取首个，并留了注释：

```ts
// Bare exact IDs can exist in multiple providers, so do not choose by catalog order.
// Prefer the sole authenticated provider when there is one; otherwise require an
// explicit provider to avoid silently selecting an unusable provider.
```

规则：唯一匹配 → 用它；多个匹配中**恰有一个已配置认证** → 用它；**0 个或多个** → **报错拒绝**，列出候选并要求显式指定。

**风险**：我方的「0 歧义」是**当前快照**的事实，不是不变量。用户接入第三方兼容节点（或上游目录扩充）后，同名的 `deepseek-chat` 可能同时存在于多个厂商——那时**静默取首个**可能命中**未配置密钥的 provider**（报错难排查），或更糟，把流量发给非预期的厂商。

**成本低、方向明确。建议：改为「唯一 → 用；唯一已认证 → 用；否则拒绝」。**

---

## 汇总表

| 分类 | 项数 | 内容 |
|---|---|---|
| **A. 已实现** | 4 | 字节上限（A-1）、分层维持（A-2）、技能诊断（A-3）、`/reload`（A-4） |
| **B. backlog** | 4 | 统一字节兜底、超限落盘、`--skill`、切换守卫 |
| **C. 不做** | 5 | worktree 遮蔽、Windows glob、技能懒加载、钩子超时可配、vendor 统一 |
| **D. 判断纠正（已实现）** | 1 | 模型 ID 回退 → 歧义即拒绝 |

**A 组的共同特征**：都有**可观测的失效**（上下文被击穿 / 技能静默消失 / 配置静默不生效 / 鉴权错配），而非仅仅是「少个便利」。C 组则是「做了要么无对象、要么有害、要么无先例」。

---

## 复核方式与局限

- 5 个子代理报告产出后，主代理**复现**了决定性断言：`pi` 的字节截断注释、`pi` 的技能校验函数、worktree 的实际加载行为、配置的启动期读取、模型 ID 实测。
- **未采信**子代理报告中未经复现的部分（例如它对我方 `fileWalk.ts` 应加 `maxEntries` 的建议——该参数目前不存在，属其推断）。
- **局限**：子代理各自可能遗漏其他仓库的相关实现；`gemini-cli` 与 `opencode` 的覆盖面明显少于 `pi`，故「几家做」的计数应以本文件记录的引文为准。
