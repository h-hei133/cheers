---
title: Phase 3 提交复核
tags: [phase-3, review, security, defects]
created: 2026-09-22
---

# Phase 3 提交复核

对 Phase 3 全部 **12 个有实质代码修改的 commit** 做对抗性复核。方法：8 个独立只读 reviewer 并行（其中一个因基础设施错误失败后补派），每组带硬范围限制；每条断言要求 `file:line` + 逐字引文；**主代理逐条复现**决定性断言后才采纳——**8 条断言被证伪**，其中 3 条来自 reviewer 的高优先度发现。

**复核范围**（按主题分组）：

| 组 | commit |
|---|---|
| 钩子与信任 | `6532463d`、`ca1e97ac`、`6d7585a7` |
| 延后项补齐 | `4801ce50`、`9b9abd53` |
| 工具与遍历 | `f9fbc600`、`12818fe6` |
| 上下文与模型 | `46ccca0f`、`5274b2b6`、`26567504`、`26d6e0ab`、`45e23a40` |

---

## 1. 已确认并修复的缺陷（7 项）

### 1.1（严重）符号链接可绕过信任门

**位置**：`core/security/projectTrust.ts` 的 `isProjectUntrusted` / `isProjectTrusted`

`path.resolve` 只做词法规范化，不解析符号链接。标记 `/repo` 不可信后，经 `/link → /repo` 访问会**返回 false（视为可信）**——用户拒绝的资源全部恢复。

**复现**：`store.setProjectTrust(real,'untrusted')` 后 `store.isProjectUntrusted(link)` 返回 `false`。

**参考**：`pi` 的 `canonicalizePath`（`utils/paths.ts:25-33`）用 `realpathSync`，并在注释里说明正是为 macOS `/tmp → /private/tmp` 这类符号链接。

**修复**：新增 `identifyProject()`，用 `fs.realpathSync` 规范化（目标不存在时回退词法路径）；`setProjectTrust` 与两个查询共用。

### 1.2（高）配置文件可授予钩子信任豁免

**位置**：`config/runtimeConfig.ts`

```ts
allowUntrustedHooks: overrides?.allowUntrustedHooks ?? merged.allowUntrustedHooks ?? ...
```

`RuntimeConfigFile` 声明了该字段，于是仓库可自带 `.private-agents.json` 写上 `allowUntrustedHooks: true`，**把自己的钩子豁免掉**——与 `ca1e97ac` 提交信息声称的「config file cannot grant it」**相反**。

**参考**：`codex` 明确规定豁免状态只能来自 CLI 标志或用户层配置，绝不允许项目层。

**修复**：改为 `overrides?.allowUntrustedHooks ?? DEFAULT_CONFIG.allowUntrustedHooks`，并从 `RuntimeConfigFile` 移除该字段。审查者独立复现了同一缺陷。

### 1.3（高）包装文本可逃逸出标签边界

**位置**：`context/instructions/projectInstructions.ts`、`core/tools/skill.ts`

`AGENTS.md` 内容与技能正文**原样**插进 `<project_instructions>` / `<skill_content>`。内容里的 `</project_instructions>` 会提前闭合边界，后续文本落在边界之外——**可以伪造出 harness 自己的结构标记**（实测造出假的 `<system>` 与假的 `<available_skills>`）。

**参考**：`pi`（`system-prompt.ts:76`）与 `opencode`（`skill.ts:51`）**都不转义**——这是继承来的行业遗漏，非我方独有。

**修复**：新增 `neutraliseTagBoundaries()`（只转义形如标签的 `<`，保留 `a < b` 这类散文）+ `escapeAttribute()`。

### 1.4（中）中和函数遗漏 C1 与 Unicode 分隔符

**位置**：三处重复实现（`turn/tools.ts`、`cliRuntimeInvocation.ts`、`trustCommandRuntime.ts`）

三份实现都只处理 `< 0x20` 与 `0x7f`，遗漏 **C1 区间 0x80–0x9F**（8-bit CSI/OSC）与 **U+2028/U+2029**（部分渲染器视为换行）。

**修复**：合并为单一 `core/text/safety.ts`，覆盖 C0 + DEL + C1 + Unicode 分隔符。**三份重复实现正是其中一份处理得更少的原因**——与 T1 消除的漂移同类。

### 1.5（中）`spawnSync` 缺 `maxBuffer`，大仓库静默回退

**位置**：`runtime/execution/fileWalk.ts`

实测：2 万文件仓库的 `git ls-files` 输出 **1.5MB**，超过 Node 默认 1MB → `ENOBUFS` → `result.error` 被当作「不是 git 仓库」→ 静默回退到进程内递归。

**结果正确**（实测 20001/20000 条全对，多出的是我建的 `.gitignore`），但**慢一倍**（122ms vs 49ms），且会在**普通大仓库**上触发而非罕见情况。

**修复**：`GIT_MAX_BUFFER_BYTES = 64MB`。

### 1.6（中）`spawnSync` 无超时，git 挂起会冻结会话

**位置**：同上。两个 `spawnSync` 均无 `timeout`——NFS 卡顿或巨大仓库会让**同步调用永久阻塞事件循环**。

**修复**：`GIT_TIMEOUT_MS = 10_000`。已验证超时产生 `ETIMEDOUT`，而现有代码把任何 error 视为「回退」，故降级安全。

### 1.7（中）glob 剥前缀把隐藏文件改成了别的名字

**位置**：`core/tools/glob.ts`

`.replace(/^[./\\]+/, '')` 是**字符类**，会把开头的点吃掉：`.gitignore` → `gitignore`，`.github/**` → `github/**`——**隐藏文件与目录的 glob 全部失效且无提示**。

**参考**：`pi` 与 `gemini-cli` 都只 `trim()`，不剥前缀；`picomatch` 本身理解 `./`。

**修复**：删除该行（只保留 `trim()`）。实测 `picomatch` 对 `./src/a.ts`、`.gitignore`、`.github/**/*.yml` 都正确匹配。

### 1.8（低）符号链接目录使敏感资源探测漏报

**位置**：`core/security/projectTrust.ts` 的 `hasToolDefinitions`

`entry.isDirectory()` 对指向目录的符号链接为 false → 漏报。

**边界已验证**：加载器用**固定路径**（`.agents/hooks.json` 等），不会跟随任意符号链接目录，故**不存在「加载了却未探测」**——影响仅为 `/trust` 少报。仍予修复（成本一行）。

### 1.9（低）glob 两条通知互相矛盾

**位置**：`core/tools/glob.ts`

同时触发条数与字节上限时输出 `showing 243 of 1500` **与** `Showing 500 of 1500`，并建议增大 limit（而字节预算才是真正的限制因素）。

**修复**：字节截断时抑制条数通知，改为「增大 limit 无用，请收窄模式」。

---

## 2. 复核中被**证伪**的断言（8 条，未改动）

记录在此以免后人重复怀疑。

| # | 断言 | 复现结果 |
|---|---|---|
| 1 | `/reload` 不会刷新 compaction 策略（「闭包固化了启动时的 config」） | **不成立**。`buildCompactionWiring` 在 `runPrompt` **内部**构造，每轮现读 `runtimeContext.runtimeConfig`。实测改 `reserveTokens` 后立即生效 |
| 2 | `git check-ignore` 传纯文件名导致嵌套路径规则失效 | **不成立**。实测祖先规则 `sub/drop.txt`、目录规则 `build/` 都从被查目录正确解析；`listDirectoryEntries` 端到端也正确隐藏 `build/` |
| 3 | `hasToolDefinitions` 的符号链接绕过可致「加载了却未探测」 | **不成立**（影响仅限于 `/trust` 少报，见 1.8） |
| 4 | `neutralise` 未处理 ANSI，OSC/DCS/CSI 可穿透终端 | **不成立**。ESC 本身被转义后，所有序列都变成惰性文本。已用真实终端渲染验证：不清屏、不变色 |
| 5 | T7 门禁漏掉 `RuntimeConfigFile` 是缺陷 | **前提错误**。该接口字段**本就不是 `readonly`**（它是解析输入形状），解析器按 `readonly` 收集故无法覆盖；且其字段经 `getRuntimeConfig` 合并到**已被检查的** `RuntimeConfig`。已把该边界写入门禁注释 |
| 6 | `ArtifactManager` 无清理机制致磁盘耗尽 | **成立但非本轮引入**。落盘机制与 `.ts-shell/sessions/<id>/artifacts/` 路径均为既有；本轮只新增两个调用点。见 §3 |
| 7 | 指令 32 KiB 预算未含包装开销 | **成立但为设计选择**。预算计的是**文件内容**口径，包装为每文件固定开销（实测两文件约 130 bytes），不随预算增长。已把口径写进配置与函数注释 |
| 8 | `/model` 切换后未刷新 config | **部分成立**。窗口来自**实时 bridge**（实测切换后窗口 200k→400k 正确跟随），只有 `modelTokenBudgets` 滞后。已让 `/model` 调用 `refreshRuntimeConfig` |

---

## 3. 未修复但记录在案（2 项）

| 项 | 说明 | 为何不做 |
|---|---|---|
| **Artifact 无保留期/淘汰** | `.ts-shell/sessions/<id>/artifacts/` 会随会话增长 | 既有机制，非本轮引入；`opencode` 有 7 天保留期可参考。改动面涉及会话生命周期，超出「复核近期 commit」范围 |
| **钩子落盘/超限未做** | `codex` 的 `output_spill.rs` 会落盘；我方钩子只受 `maxBuffer: 1MB` 限制 | 裁决 §6.4 未要求；钩子输出通常很小 |

---

## 4. 验证

| 项 | 结果 |
|---|---|
| 新增/修改测试 | 8 个文件，含安全（symlink 绕过、标签逃逸、中和覆盖）、遍历（无 git 回退、超时）、glob（隐藏文件、双上限通知） |
| 反向验证 | 标签逃逸、glob 前缀剥除、条数通知、symlink 绕过——各自撤销实现即测试失败 |
| 全量 | 见提交信息（499→后续文件数）**0 失败** |
| 门禁 | 环 / docs-drift / config-consumers / test:scripts / module-facades **全 pass** |

---

## 5. 复核本身的诚实说明

- **8 条断言被证伪**，其中 3 条是 reviewer 标为「高优先度」的。这说明 reviewer 的严重度评估需要主代理复现后才可采用——本文件只记录复现过的结论。
- **一个 reviewer 因证书错误失败**，补派后完成同一范围。
- reviewer 各自可能遗漏其他仓库的相关实现；「参考实现怎么做」的计数以本文件引文为准。
- **未采信**未经复现的部分（例如 reviewer 建议我方 `fileWalk.ts` 增加 `maxEntries` 参数——该参数并不存在，属其推断）。
