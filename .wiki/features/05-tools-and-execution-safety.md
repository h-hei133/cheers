---
title: "功能对照 05：工具与执行安全（我们 vs pi）"
category: article
sources: [pi-source-2026-09-20, repo-audit-2026-09-20]
created: 2026-09-20
updated: 2026-09-23
tags: [features, gap-analysis, pi, tools, sandbox, execution, safety]
summary: "[部分已过时，见文首横幅] 对照 pi 的工具与执行面。两处硬缺陷：glob/grep 递归遍历不剪枝且不读 .gitignore（一次查询要走 14,023 个文件，其中 6,389 个在 .git 下）；22 个声明的钩子事件里有 11 个从未派发。另有 bash 超时硬编码 60s、无 ls/find 工具、edit 仅单段等差距。全量输出落盘与同文件串行化经复核确认与 pi 平手（主代理原判为缺陷，已更正）。安全面（沙箱/审批/SSRF/路径围栏）我们显著强于 pi。覆盖清单 6 项 DEFICIENT、3 项 MISSING、4 项 OURS-ONLY、4 项平手。"
confidence: high
---

# 功能对照 05：工具与执行安全

> **⚠️ 本文是 2026-09-20 的调研快照，其中部分结论已过时。**
> 已过时的结论在**原位**加了 ✅ 标注（保留原文作为当时的证据）；**未标注的行仍按原文有效**。

> 本轮为**功能开发前锋探索**，零代码改动。对照本地参考仓 `pi`（`/home/wang/projects/pi`）。
> 分类口径：`DEFICIENT`＝我们有但更弱／不完整／未接线；`MISSING`＝pi 有我们没有；
> `OURS-ONLY`＝我们有 pi 没有（**仅记录，本轮不提议开发**）。

## 0. 方法与范围

| 侧 | 读到的位置 |
|---|---|
| pi | `src/core/tools/{index,read,write,edit,edit-diff,bash,grep,find,ls,truncate,output-accumulator,file-mutation-queue,path-utils}.ts`、`docs/{usage.md, environment-variables.md}`、`src/core/exec.ts` |
| 我们 | `core/tools/{registry,truncation,grep,prefilter,toolResultLifecycle,ask,todoTool,taskTool}.ts`、`runtime/execution/{service,types}.ts`、`sandbox/*`、`policy/*`、`cli/approval/*`、`tools/concurrency/fileMutationQueue.ts`、`tools/dispatch/*`、`core/shell/platform/*`、`core/hooks/types.ts` |

关键检索命令与结果：

```bash
# 目录剪枝与 .gitignore
grep -rn "gitignore" packages/ts-shell/src/core/tools packages/ts-shell/src/runtime | grep -v test   # → 0 命中
sed -n '112,123p' packages/ts-shell/src/runtime/execution/service.ts   # listFilesRecursive：无条件递归

# 遍历代价（实测）
python3 -c "import os; ..."   # → 共 14,023 文件；.git 下 6,389；node_modules 下 1,485；有用剩余 6,149

# bash 超时
grep -n "timeoutMs" packages/ts-shell/src/core/tools/registry.ts   # → :124 硬编码 60_000

# 会话环境变量注入
grep -rn "PI_SESSION_ID\|SESSION_ID" packages/ts-shell/src/core/tools/registry.ts   # → 0 命中

# 钩子事件派发覆盖
grep -rn 'eventName: "' packages/ts-shell/src --include='*.ts' | grep -v '\.test\.'   # → 11 个事件
sed -n '5,27p' packages/ts-shell/src/core/hooks/types.ts                              # → 声明 22 个
```

## 1. 覆盖清单

| 能力 | pi 位置 | 我们位置 | 判定 | 证据 |
|---|---|---|---|---|
| 目录遍历剪枝 + `.gitignore` 遵从 ✅ **已实现**（Phase 3 T1，`runtime/execution/fileWalk.ts`） | `src/core/tools/find.ts:65`（用 `fd`）、`src/core/tools/grep.ts` | `runtime/execution/service.ts:112-123`；`core/tools/registry.ts:505-524` | **DEFICIENT** | 见 §2.1（**最高优先级**） |
| ~~bash 超时可指定~~ ✅ **已收口 2026-09-23**：`timeout` 参数已实现（`runtime/execution/commandTimeout.ts`），默认保留 60s，上限拒绝而非钳制 | `src/core/tools/bash.ts:239`（`timeout` 参数） | **已实现** | ✅ **已收口** | 见 `phase-4-execution.md` §2 |.2 |
| 全量输出落盘并可回读 | `src/core/tools/output-accumulator.ts:19-22`（`fullOutputPath`，OS temp 文件） | `core/tools/registry.ts:141`（`ArtifactManager.save`，`artifact://` URI） | **平手** | 两侧都保留完整输出；差异仅在回读载体（§2.3 已更正原误报） |
| `ls` 工具 ⚠️ **部分实现**：无独立工具，但目录列举已折进 `read`（Phase 3 T6） | `src/core/tools/ls.ts`（175 行，`limit` 默认 500） | 无 | **MISSING** | 见 §3.1 |
| `find` 工具 ⚠️ **部分实现**：无独立工具，主体由 `glob` 覆盖（不支持谓词过滤） | `src/core/tools/find.ts`（318 行，`limit` 默认 1000，尊重 `.gitignore`） | 无（`glob` 不等价） | **MISSING** | 见 §3.1 |
| 多段编辑（`edits[]` 数组、重叠拒绝） | `src/core/tools/edit.ts:22-40` | `core/tools/registry.ts:389-489`（单段） | **DEFICIENT** | 见 §2.4 |
| 同文件写入串行化 | `src/core/tools/file-mutation-queue.ts`（edit/write 各自包队列） | `tools/dispatch/executor.ts:90-99`（dispatch 层统一包队列） | **平手** | 两侧都有；我们的位置覆盖全部工具（§2.5 已更正原误判） |
| 会话环境变量注入 bash | `docs/environment-variables.md:20-32`（5 个 `PI_*`） | 无 | **MISSING** | 见 §3.2 |
| `powershell` 工具（Windows） | `src/core/tools/powershell.ts`（67 行，独立工具） | 无独立工具（经 shell 后端切换） | **DEFICIENT** | 见 §2.6 |
| 工具白/黑名单 | `docs/usage.md:196-202`（`--tools`/`--exclude-tools`/`--no-builtin-tools`/`--no-tools`） | `core/tools/prefilter.ts`（`disabledTools`/`hiddenToolPrefixes`） | **DEFICIENT** | 见 §2.7 |
| 工具只读/可写预设分组 | `src/core/tools/index.ts:164,173`（`createCodingToolDefinitions`／`createReadOnlyToolDefinitions`） | `turn/tools.ts:45`（`PLAN_MODE_TOOLS` 白名单） | **平手** | 两侧都有，形态不同 |
| 输出截断（行+字节双预算） | `src/core/tools/truncate.ts`（276 行，含 `firstLineExceedsLimit`） | `core/tools/truncation.ts`（含 `truncateHead`/`truncateTail`/`truncateLineWidth`） | **平手** | 两侧都用字节计数；我们的 `truncateLineWidth` 是 pi 没有的 |
| 沙箱与默认拒绝 | **pi 无**（`docs/security.md:33-41` 明确声明不内置沙箱） | `sandbox/{sandboxPolicy,osSandbox,sandboxEnforcer,auditTrail,escalationWorkflow}.ts` | **OURS-ONLY** | 见 §4 |
| 审批与权限范围 | **pi 无**（`docs/usage.md:310` 明确不内置 permission popups） | `cli/approval/*`、`core/shell/approval/*` | **OURS-ONLY** | 见 §4 |
| SSRF 防线 | **pi 无** | `browser/networkAllowlist.ts`、`browser/runtime/networkEgressGuard.ts` | **OURS-ONLY** | 见 §4 |
| 路径围栏（workspace jail） | pi 用 `path-utils.ts` 的 `resolveToCwd`，无强制围栏 | `core/tools/registry.ts` 的 `verifyPathContainment` | **OURS-ONLY** | 见 §4 |
| 钩子事件派发覆盖 | `docs/extensions.md`（26 个事件，全部有派发点） | `core/hooks/types.ts:5-27`（22 个声明） | **DEFICIENT** | 见 §2.8 |

## 2. DEFICIENT 详述

### 2.1 `glob`/`grep` 全树遍历：不剪枝、不读 `.gitignore`（置信度：高，已量化）

**现象**：两个工具的公共底层 `listFilesRecursive` 是**无条件递归**，剪枝发生在**遍历之后**的内存过滤里。

**证据（我们）**：

- `runtime/execution/service.ts:112-123`：

  ```ts
  async function listFilesRecursive(root: string): Promise<readonly string[]> {
    const entries = await fs.readdir(root, { withFileTypes: true })
    const files = await Promise.all(
      entries.map(async entry => {
        const fullPath = path.join(root, entry.name)
        if (entry.isDirectory()) {
          return listFilesRecursive(fullPath)      // ← 无任何目录名判断
        }
        return [fullPath]
      }),
    )
    return files.flat()
  }
  ```

- 剪枝只发生在调用方**已经拿到全部路径之后**：`core/tools/registry.ts:520-523`（glob）与 `core/tools/grep.ts:130-137`（grep）各自 `filter` 掉含 `node_modules/`、`.git/`、`dist/` 的项。
- `.gitignore` 全仓零处理：`grep -rn "gitignore" packages/ts-shell/src/core/tools packages/ts-shell/src/runtime | grep -v test` → **0 命中**。

**实测量化**（在本仓库根执行遍历）：

| 类别 | 文件数 |
|---|---:|
| 全部被 `readdir` + `stat` 走到的文件 | **14,023** |
| 其中 `.git/` 下 | **6,389** |
| 其中 `node_modules/` 下 | **1,485** |
| 剪枝后真正可能有用的 | **6,149** |

即：**一次 `glob "*.ts"` 要走 14,023 个文件，其中 7,874 个（56%）是事后注定被丢弃的。**

**证据（pi）**：`src/core/tools/find.ts:65-70` `FindOperations.glob(pattern, cwd, { ignore, limit })` 把忽略规则**下推给 `fd`**；`:82` 工具描述明写「Respects .gitignore. Output is truncated to 1000 results」；`:171` 注释「Default implementation uses fd」。pi 的 `skills.ts:14` 也读 `.gitignore`/`.ignore`/`.fdignore` 三份忽略文件。

**影响**：每次文件查找的延迟与 IO 随仓库里**依赖体积**增长，而不是随源码规模。在 monorepo 里这是秒级 vs 十毫秒级的差别。同时因为不读 `.gitignore`，用户主动忽略的构建产物仍会被列出与搜索。

**最小改动建议**：把剪枝**下推到递归里**——`listFilesRecursive` 接收一个「目录名黑名单 + .gitignore 匹配器」，在 `entry.isDirectory()` 分支先判断再递归。这是 `service.ts` 内部一处改动，两个调用方同时受益。

### 2.2 bash 超时硬编码 60 秒（置信度：高）

**证据（我们）**：`core/tools/registry.ts:124` `timeoutMs: 60_000`——写死在 `runCommandTool` 的 `executionService.runCommand` 调用里。工具 schema（`:534-543`）只有 `command` 一个参数，**模型无法指定超时**。

**证据（pi）**：`src/core/tools/bash.ts:22-23` `MAX_TIMEOUT_MS = 2_147_483_647`；`:239` 工具描述明确「Optionally provide a timeout in seconds」；`:32-33` 对超上限的值报错并给出上限。

**影响**：`npm install`、`npm run build`、完整测试套件、`cargo build` 都可能超过 60 秒——**这些恰好是 agent 最需要跑的验证命令**。超过即被我们掐断，且模型无从表达「这个要跑久一点」。

**最小改动建议**：schema 加 `timeout` 参数，默认保留 60s，上限照 pi 的做法给一个明确的最大值。
> ✅ **2026-09-23 已实施**（`runtime/execution/commandTimeout.ts`，上限 `2_147_483_647` ms 且**拒绝**而非钳制）。另外补了 5 个 `CHEERS_*` 会话环境变量（`commandEnvironment.ts`，先删同名继承值再写入）。见 `phase-4-execution.md` §2。

### 2.3 bash 的全量输出**已落盘** —— 原判为缺陷，经复核更正（置信度：高）

> **本项是主代理的一次误报，已在复核中更正。** 保留在此以记录更正过程。

**原判（错误）**：称「bash 截断后原始输出被丢弃」。

**更正后的事实**：`core/tools/registry.ts:141` 在截断时**确实**落盘：

```ts
if (truncated.truncated) {
  const artifact = await artifactManager.save(rawOutput, 'bash')
  finalOutput += `\n\n[Showing last ${truncated.shownLines} of ${truncated.originalLines} lines (...). Full raw output saved: ${artifact.uri}]\n[To read full or earlier sections: read(path="${artifact.uri}:1-500")]`
}
```

`ArtifactManager.save`（`core/session/artifactManager.ts:44`）写入会话 artifacts 目录，`read` 工具能经 `artifact://` 解析回来（`core/tools/registry.ts:255-268` 的 `isArtifact` 分支）。

**误报原因（方法教训）**：我用 `sed -n '81,140p'` 读 `runCommandTool`，而落盘分支在 **141 行**——**读窗口差一行，把结论读反了**。这正是本项目反复记录的模式：自制截断读取替代完整读取。

**与 pi 的真实差异（保留为观察，不构成缺陷）**：pi 把完整输出写到 OS temp 文件并在结果里给出路径（`src/core/tools/output-accumulator.ts:19-22` `fullOutputPath`、`bash.ts:335`），模型可以用 `bash` 直接 `tail`/`grep` 那个文件；我们给出的是 `artifact://` URI，模型需要经 `read` 工具解析。**两者都保住了内容**，差别在回读路径的便利性，不在数据完整性。

### 2.4 `edit` 只支持单段替换（置信度：高）

**证据（我们）**：`core/tools/registry.ts:389-489`。schema（`:392-416`）字段为 `path`、`content`（整文件重写）、`oldText`、`newText`、`replaceAll`。`oldText`/`newText` 是**单个字符串对**（`:429-441`）；`replaceInContent` 支持模糊匹配与 `replaceAll`。

**模糊落点的具体风险**（子代理复核补充，`core/tools/editEngine.ts`）：exact miss 后依次尝试行 `trim`、NFKC 归一化、**块首尾锚点 + Levenshtein 相似度（阈值 0.45）**。0.45 是低阈值——当旧文本不再精确匹配时，锚点策略可能选中「首尾相同且相似度最高」的**另一块相似代码**，把替换落到错误位置；`replaceAll` 会把这个错误放大到全文。

**证据（pi）**：`src/core/tools/edit.ts:22-40` schema 是 `edits: Array<{ oldText, newText }>`；描述明确「Each edit is matched against the original file, **not incrementally**. Do not include overlapping or nested edits.」；`edit-diff.ts` 提供 `applyEditsToNormalizedContent`、`detectLineEnding`、`normalizeToLF`、`restoreLineEndings`（`:11-20`）。

**影响**：改一个文件的 3 处需要 3 次工具调用（3 次往返、3 次读盘、3 次 diff），且中间态可能不一致。pi 的「全部对原始文件匹配」语义还消除了「第 2 处编辑因第 1 处改变了上下文而失败」这类失败。

**注意**：我们的模糊匹配是**能力也是风险**——pi 只做精确匹配。这是两侧的**真实权衡**，不是单纯的落后；但 0.45 的阈值与 `replaceAll` 的组合值得单独评估。

**最小改动建议**：schema 增加 `edits?: Array<{oldText, newText}>`，内部循环应用（全部对原始内容匹配，与 pi 同语义），保留现有单段形式作兼容；同时评估模糊阈值是否应提高或要求显式开启。

### 2.5 同文件写入串行化：**已接线** —— 原判为待确认，经复核更正（置信度：高）

> **本项是主代理的第二处误报，已在复核中更正。**

**原判（错误）**：称 registry 层的 `edit`/`write` 未经 `withFileMutationQueue`，可能未串行化。

**更正后的事实**：串行化在 **dispatch 层**，不在工具层。`tools/dispatch/executor.ts:90-99`：

```ts
// Safe concurrency: protect file mutations via withFileMutationQueue if target path exists
const filePath = typeof call.reportSafeArguments?.path === "string"
  ? (call.reportSafeArguments.path as string) : undefined;

if (filePath && (call.name === "write" || call.name === "edit")) {
  result = await withFileMutationQueue(filePath, () =>
    input.dispatch!(call, planned.beforePolicyDecision, input.context),
  );
} else { ... }
```

即：`write`/`edit` 按目标路径包在队列里执行，与 pi 的 `edit.ts` 行为等价。**这是比「工具各自包队列」更好的位置**——它覆盖所有工具，新工具不会漏。

**误报原因（方法教训）**：我只查了 `withFileMutationQueue` 的 import 消费者，看到 registry 层没 import 就判为未接线，**没有继续追 dispatch 层**。这与 §2.3 是同一类错误：**证据搜索停在第一层**。

### 2.6 `powershell` 不是独立工具（置信度：中）

**证据（我们）**：`core/shell/platform/types.ts:9` `ShellBackendKind = "bash" | "git-bash" | "powershell" | "wsl" | "auto"`；`core/tools/registry.ts:92-107` 的 `runCommandTool` 按**当前活动后端**决定 shell 与参数（`:96-105`），模型看到的工具始终叫 `bash`。切换入口是 `/shell use <backend>`（`core/commands/shellCommandRuntime.ts:37`）。

**证据（pi）**：`src/core/tools/powershell.ts` 是**独立工具**（67 行），`src/core/tools/index.ts:95` 的 `ToolName` 联合里 `bash` 与 `powershell` 并列；`docs/usage.md:196-202` 的 `--tools` 可单独选 `powershell`；`docs/settings.md` 的 `defaultTools` 示例在 Windows 上「select `powershell` instead of `bash`, or include both」。

**置信度说明**：本条为**中**。这是**形态差异而非能力缺失**——我们的模型在 Windows 上仍能执行 PowerShell 命令（只要后端切对），只是工具名与 schema 不反映这一点，模型无法在一次会话里同时用两种 shell。

**最小改动建议**：属 UX 层，优先级低。若要改，`runCommandTool` 可按后端暴露不同工具名。

### 2.7 工具过滤只到「禁用」一层（置信度：高）

**证据（我们）**：`core/tools/prefilter.ts:9-27` 的 `buildVisibleToolPool` 三个判据：`enableMcpTools`（`:15`，MCP 前缀）、`disabledTools`（`:19`，精确名）、`hiddenToolPrefixes`（`:24`，前缀）。`entrypoints/cliRuntimeInvocation.ts:172-176` 调用 `restrictToolPool`。**只有减法，没有加法**——无法表达「只要这几个」。

**证据（pi）**：`docs/usage.md:196-202` 四个正交开关——`--tools <list>`（**白名单**）、`--exclude-tools <list>`（黑名单）、`--no-builtin-tools`（保留扩展工具）、`--no-tools`（全关）。文档还给了一个真实用例：`pi --tools read,grep,find,ls -p "Review the code"`（只读审查模式）。

**影响**：无法构造「只读审查」这类最小权限运行——必须枚举所有要禁用的工具，且**新增工具时会漏**（fail-open）。白名单是 fail-closed 的。

**最小改动建议**：`runtimeConfig` 增加 `allowedTools?: string[]`，`buildVisibleToolPool` 在 `disabledTools` 之前先做白名单收窄
> ✅ **2026-09-23 已实施**（`core/tools/prefilter.ts`：白名单在最外层先收窄，MCP 判据与 `disabledTools` 其后；`undefined` = 不限制、`[]` = 全部禁用，两者可区分；`--tools` CLI 标志走 `RuntimeConfigOverrides`）。见 `phase-4-execution.md` §3。。

### 2.8 22 个钩子事件中 11 个从未派发（置信度：高）

**证据（我们）**：

- `core/hooks/types.ts:5-27` 声明 `HookEventName` 共 **22** 个：`SessionStart`、`SessionEnd`、`UserPromptSubmit`、`UserPromptExpansion`、`PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`PostToolBatch`、`PermissionRequest`、`PermissionDenied`、`PreModelSwitch`、`PostModelSwitch`、`PreCompact`、`PostCompact`、`SubagentStart`、`SubagentStop`、`WorktreeCreate`、`WorktreeRemove`、`TaskCreated`、`TaskCompleted`、`Stop`、`StopFailure`。
- 生产代码中实际派发的只有 **11** 个：`PostModelSwitch`、`PostToolUse`、`PostToolUseFailure`、`PreModelSwitch`、`PreToolUse`、`Stop`、`SubagentStart`、`SubagentStop`、`UserPromptSubmit`、`WorktreeCreate`、`WorktreeRemove`。
- 逐个核实**零派发**的 11 个（在 `hooks/types.ts` 之外的**非测试**引用数为 0）：

  ```
  SessionStart: 0    SessionEnd: 0      UserPromptExpansion: 0
  PostToolBatch: 0   PermissionRequest: 0   PermissionDenied: 0
  PreCompact: 0      PostCompact: 0     TaskCreated: 0
  TaskCompleted: 0   StopFailure: 0
  ```

  派发点总数：`turn/tools.ts:132,162`（Pre/PostToolUse）、`turn/session.ts:143,199`（UserPromptSubmit/Stop）——**整个回合只有 4 个派发点**。

  > **✅ 2026-09-23 已收口：18/18 全部有生产派发点。**
  >
  > 但**上面这一整段的数字与名单在本快照写下时就已经是错的**，必须一并更正，否则
  > 「已收口」会掩盖「当时到底缺什么」：
  >
  > - **声明数不是 22 而是 18。** 本快照由 `d60895e3`（2026-09-20）创建，而**同一个提交**
  >   已经把 `HookEventName` 从 22 裁到 18 —— 删掉了 `UserPromptExpansion`、`PostToolBatch`、
  >   `TaskCreated`、`TaskCompleted` 四个。22 是 `443d28fb`（2026-08-31）时的旧值。
  > - **这份名单没有一个是真的。** 实测对照：
  >   - `22 声明` 那时（`443d28fb`）真正的零派发是 **14 个**；名单只列了 11 个，
  >     漏掉的正好是 `PostToolUseFailure`、`WorktreeCreate`、`WorktreeRemove`。
  >   - `d60895e3` 补掉 11 个、裁掉 4 个之后，剩下的恰好就是**被漏掉的那 3 个**；
  >     而名单里列的 11 个中，7 个当时**已有派发点**，另外 4 个**已不在类型里**。
  >   - 「整个回合只有 4 个派发点」同样是低估。
  > - **T1 补的正是那 3 个**：`PostToolUseFailure`（`turn/tools.ts`）、`WorktreeCreate` /
  >   `WorktreeRemove`（`core/tools/taskTool.ts`）。补完后 18/18。
  >
  > 恢复手段：`scripts/check-declarations.mjs` 现在要求「每个声明的事件必须在生产代码里有
  > dispatch」，已接入 CI —— 这正是这份名单不该再靠人手维护的原因。
  > 该门禁**只覆盖钩子事件与工具工厂两类**：接口字段与模块导出的误报面太大，不纳入。
  > 见 `phase-4-execution.md` §1。

**证据（pi）**：`docs/extensions.md` 的 Events 章共 **26** 个事件（`project_trust`、`resources_discover`、`session_start`、`session_info_changed`、`session_before_switch`、`session_before_fork`、`session_before_compact`、`session_before_tree`、`session_shutdown`、`before_agent_start`、`agent_start`、`ui_prompt_start`、`turn_start`、`message_start`、`tool_execution_start`、`context`、`before_provider_headers`、`before_provider_request`、`after_provider_response`、`cache_warming_decision`、`model_select`、`thinking_level_select`、`tool_call`、`tool_result`、`user_bash`、`input`），每个都有实际派发点与文档化的返回值语义。

**影响**：`PermissionDenied`、`PreCompact`/`PostCompact`、`TaskCreated`/`TaskCompleted`、`SessionStart`/`SessionEnd` 是**外部集成最常需要的钩子**（审计、日志、策略、清理）。它们出现在类型里会让人以为可以挂钩——**声明的契约大于实现的契约**。

**最小改动建议**：二选一——把缺的 11 个接上（多数在 `turn/session.ts` 与 `core/shell/sessionRuntime.ts` 里有现成时机），或从联合类型里删掉。**不要保留「声明了但不派发」的中间态。**

## 3. MISSING 详述

### 3.1 无 `ls`／`find` 工具（置信度：高）

**pi 如何实现**：`src/core/tools/ls.ts`（175 行）`path` + `limit`（默认 500），目录条目按类型排序；`src/core/tools/find.ts`（318 行）`pattern` + `path` + `limit`（默认 1000），下推 `fd` 并尊重 `.gitignore`。两者都在 `src/core/tools/index.ts:95` 的 `ToolName` 里，且 `createReadOnlyToolDefinitions`（`:173-180`）就是 `read`+`grep`+`find`+`ls` 四件套。

**我们缺失的证明**：

```bash
grep -oE "name: '[a-z_]+'" packages/ts-shell/src/core/tools/registry.ts | sort -u
# → bash, edit, glob, read, write   （+ 以 create* 形式定义的 grep/lsp/ask/todo/task/browser/web*）
```

我们的 `glob`（`core/tools/registry.ts:489-524`）**不等价于 pi 的 `find`**：它没有 `path` 参数（恒从 workspace root 起）、没有 `limit` 参数（返回全部匹配）、不读 `.gitignore`（§2.1）、且因为不剪枝而慢。

**影响**：模型没有「列出这个目录里有什么」的原语——只能 `glob` 猜模式或 `bash ls`。后者在有沙箱与审批的情况下是更重的路径。

**最小落地路径**：`ls` 是最便宜的一个（`fs.readdir` + 排序 + limit），且能复用 §2.1 修好后的目录遍历。

### 3.2 bash 不注入会话环境变量（置信度：高）

**pi 如何实现**：`docs/environment-variables.md:20-32` 每次 bash 调用注入 5 个变量——`PI_SESSION_ID`、`PI_SESSION_FILE`、`PI_PROVIDER`、`PI_MODEL`、`PI_REASONING_LEVEL`；值在**每条命令启动时解析**，所以切换模型/思考级别立刻对下一条命令生效。文档还给了明确用途：「When asked which model or provider is running, **inspect these variables instead of inferring the answer from the system prompt**」，并给了示例命令：

```bash
printf '%s/%s\n' "$PI_PROVIDER" "$PI_MODEL"
tail -n 1 "$PI_SESSION_FILE"
```

另有进程级标记 `AI_AGENT=pi` 与 `PI_CODING_AGENT=true`（`:9-14`），让子进程能识别自己在哪个 agent 里运行。

**我们缺失的证明**：`core/tools/registry.ts:92` 只取 `ShellManager.getActiveEnvironment()`（shell 二进制与参数），`:112-122` 的 `runCommand` 请求里**没有任何 env 字段**。全仓无 `PI_SESSION_ID` 类注入。

**影响**：模型无法可靠回答「你在用哪个模型」（只能从 system prompt 猜，而 system prompt 里没有）；用户也无法在 shell 里定位当前会话文件。对脚本化与自省类任务是实打实的缺口。

**最小落地建议**：`runCommandTool` 增加 `env` 透传，值从 `ToolExecutionContext` 已有的 session 信息构造。**这是本轮成本最低、收益最直接的一项。**

## 4. OURS-ONLY（仅记录，本轮不提议开发）

安全面是我们**显著强于 pi** 的地方——pi 在 `docs/security.md:33-41` 与 `docs/usage.md:310` 明确声明**不内置沙箱、不内置权限弹窗**，改为建议用户用容器隔离。

| 能力 | 我们位置 | pi 是否真的没有（检索命令+结果） |
|---|---|---|
| 沙箱策略（默认拒绝） | `sandbox/sandboxPolicy.ts`（`SandboxPolicy` 类，默认拒绝工作区外的 filesystem/network/process/system 操作）、`sandbox/osSandbox.ts`、`sandbox/sandboxEnforcer.ts`、`sandbox/auditTrail.ts` | **确认没有**。`docs/security.md:33` 原文：「Pi does not include a built-in sandbox.」；`docs/security.md:37-41` 解释这是**有意为之**（「A partial in-process sandbox would be easy to misunderstand as a security boundary」） |
| 权限范围三档 + 升级工作流 | `cli/approval/permissionScope.ts`（`ask`/`accept-edits`/`allow-all`）、`sandbox/escalationWorkflow.ts`、`cli/approval/cliApprovalEscalationBridge.ts` | **确认没有**。`docs/usage.md:310`：「It intentionally does not include built-in MCP, sub-agents, **permission popups**, plan mode, to-dos, or background bash.」 |
| 审批信任策略与审计记忆 | `core/shell/approvalTrustPolicy.ts`、`cli/approval/cliApprovalAuditBridge.ts`、`session/approval/sessionApprovalMemory.ts` | 同上，pi 无审批层 |
| SSRF 防线（双实现） | `browser/networkAllowlist.ts`（`isPrivateNetworkHost`）、`browser/runtime/networkEgressGuard.ts`（`isPrivateOrigin`） | **确认没有**：`grep -rn "isPrivateNetworkHost\|isPrivateOrigin\|SSRF" /home/wang/projects/pi/packages/coding-agent/src` → 0 命中 |
| 工作区路径围栏 | `core/tools/registry.ts` 的 `verifyPathContainment` + `resolveToolTarget`（read/write/edit 全部调用） | pi 只做路径解析不做围栏：`src/core/tools/path-utils.ts` 的 `resolveToCwd`/`resolveReadPathAsync` 无 containment 检查 |
| 项目信任（trust store） | `core/security/projectTrust.ts`（`ProjectTrustStore`，含父路径继承与敏感资源探测） | pi **有对应能力**（`docs/security.md:5-31`、`src/core/project-trust.ts`、`trust-manager.ts`）——**此处为平手，非我们独有** |
| 静态资源清单（`executable:false`） | `runtime/resources/descriptor.ts` | pi 无对应物 |

> **诚实标注**：`project-trust` 一行是**平手**，列出以免把「我们也有」误报成差距。
> 前六项是真实差异；其中沙箱与审批两项，pi 的**缺失是明确的设计选择**（其文档解释了为何不做进程内沙箱），
> 因此这里的「OURS-ONLY」是事实陈述，**不构成「pi 落后」的判断**。

## 5. 未能验证的项

1. **pi 的 `fd` 是否在运行时可用**：pi 的 `node_modules` 不存在，未验证 `ensureTool`（`find.ts:6`）如何获取 `fd`，也未实跑其 `find` 做延迟对比。因此「pi 的 `find` 尊重 `.gitignore`」来自其工具描述（`find.ts:82`）与 `fd` 的参数（`:171-214`），**未实机验证**。
2. **我们的 `glob` 实际耗时**：量化的是**文件数量**（14,023），未实测端到端延迟（受磁盘缓存影响大，单次测量不可靠）。数量级结论可靠，绝对耗时未测。
3. **`replaceInContent` 模糊匹配的失败率**：未构造用例测试 0.45 阈值下错位落点的实际概率（§2.4）。
4. **pi 的 26 个事件是否全部有派发点**：只核对了文档列出的清单，未逐个在 pi 源码中确认派发（我们的 11/22 缺口是**我们侧**逐个 grep 确认的，这部分证据是完整的）。
5. **`ExecutionService` 是否有其他可注入 backend**：`listFilesRecursive` 的默认实现是 `fs.readdir` 递归（`service.ts:112-123`），但未检查是否存在注入路径带额外过滤。
6. **未运行我们的 CLI 做工具行为验证**：本轮为静态分析，未实跑 `glob`/`grep`/`bash` 观察输出。

## 6. 本轮主代理的两处误报（方法记录）

本轮**主代理自己写错两条，均由子代理以直接证据反驳**。按本项目惯例保留记录，不静默覆盖：

| # | 主代理原判 | 实际 | 误报原因 |
|---|---|---|---|
| 1 | bash 截断后丢弃原始输出 | `registry.ts:141` 已 `artifactManager.save(rawOutput, 'bash')` 并给出 `artifact://` URI | 用 `sed -n '81,140p'` 读函数，落盘分支在 **141 行**——读窗口差一行 |
| 2 | registry 层 `edit`/`write` 未串行化 | 串行化在 `tools/dispatch/executor.ts:90-99`，**比工具层更好**（覆盖全部工具） | 只查 import 消费者，见 registry 层没 import 就下结论，未继续追 dispatch 层 |

**共同模式**：**证据搜索停在第一层**——要么读窗口截断，要么检索范围未扩展到调用链下一层。
这与 `plan.md` §5 记录的既有教训同源（自制截断替代完整读取）。
