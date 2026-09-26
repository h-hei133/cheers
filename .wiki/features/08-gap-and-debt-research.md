---
title: "Phase 11 前置研究：对照顶尖项目的差距、架构债务、死代码与三语言架构裁决"
category: article
sources: [08-slice-kernel-loop, 08-slice-tools-exec, 08-slice-provider-model, 08-slice-context-memory, 08-slice-debt-tests-deps, 08-slice-debt-docs-naming, repo-audit-2026-09-26, tinyfish-web-research-2026-09-26, reference-repo-survey-2026-09-26, hot-path-benchmarks-2026-09-26, bun-compile-test-2026-09-26]
created: 2026-09-26
updated: 2026-09-26
tags: [features, gap-analysis, debt, dead-code, architecture, polyglot, rust, python, benchmark, decision]
summary: "Phase 11 前置研究（**合并版**：原 08/09/10 三份文档已于 2026-09-26 合并为本文件）。五路只读子代理 + 主代理逐条亲验，覆盖内核循环、工具执行、provider/模型、上下文/记忆、架构债务五个切片，随后回答「三门语言是否有价值」与「优化 Rust/Python 能否超过纯 TS」两个追问。**§1 头条是三项既有 P0 缺陷**（`daemonEnabled` 默认 true 且缺 cargo 不降级 → 全新安装 bash 100% 失败；`cheers.json` 从不被读取；`/model refresh` 静默抹掉模型能力声明）。**§2 裁决**：Python 层与 Rust 执行面**已删除**（实测 Rust 沙箱是字符串匹配、弱于既有 bwrap，丢流式，IPC +60ms，契约仅测试引用，Python 只有 30 行且测试入口在 Linux 硬失败）。**§3 续研**：Rust 优化技术上成立，但本项目的时间瓶颈（grep 1,294ms vs ripgrep 10–30ms）用「调用既有原生工具」就能拿回，成本低一个数量级——**已施工**（grep 接 ripgrep 53ms / 24×；Bun `--compile` 启动 1.37s→0.18s、免装 Node）。差距侧 24 项（10 MISSING / 14 DEFICIENT），债务侧 35 个真死文件（6,650 行）与 90 个不可达非 harness 文件（21,247 行）。"
confidence: high
---

> **合并说明（2026-09-26）**：本文件由三份连续文档合并而成——
> 差距/债务研究（原 `08-gap-and-debt-research.md`）、三语言架构裁决（原 `09-language-architecture-verdict.md`）、
> 热路径续研（原 `10-optimize-vs-rewrite-research.md`）。三者是同一条研究线的三个阶段，
> 交叉引用密集，分开阅读需要在三份文档间往返。**内容未删减**，仅重排编号：
> 原 08 的 §0/§1 保持为 §0/§1，语言裁决成为 §2，热路径续研成为 §3，
> 原 08 的 §2–§7 顺延为 §4–§9，未验证项合并为 §7。

---

## 0. 本轮范围与执行方式


### 0.1 维护者指示

> 「基本上所有任务都完成了，除了几个明确标记不做的任务……继续做一轮深度研究，
> 结合 `~/projects/` 目录下的顶尖项目的实现方案派遣子代理深度探索……
> 研究方向是探索项目的不足，对照顶尖项目找寻差距，探索项目架构债务，
> 是否存在死代码和低价值代码，然后分析项目进步方向……研究报告在 features 中
> 创建新文档，从 08 开始，完成后更新 `_index.md`。」

### 0.2 为什么叫 Phase 11 而不是 Phase 08

维护者指定**文件名**从 `08-` 起（避免污染 01–07 的七份切片报告）。
但**阶段序号**是 Phase 11——`01-*`～`07-*` 是能力切片，
`phase-N-*` 是执行阶段，而 Phase 10 已收尾。本文件是**Phase 11 的前置研究**，
文件名 本文件 按维护者指示。

### 0.3 执行方式

| 路 | 子代理 | 切片 | 结果 |
|---|---|---|---|
| S1 | `S1KernelLoop` | 内核循环 / turn 层 / 子代理 | ✅ 完成 |
| S2 | `S2ToolsExec` | 工具面 / 编辑 / 权限 / 沙箱 | ✅ 完成 |
| S3 | `S3ProviderModel` | provider / 模型目录 / 认证 / 流式 | ✅ 完成 |
| S4 | `S4ContextMemory` | 上下文 / 压缩 / 记忆 / 指令 | ✅ 完成 |
| S5 | `S5DebtDeadCode` | 架构债务总扫 | ❌ **被上游 `content_filter` 拦截** |
| S5b | `S5bDebtSafe` | 测试/依赖/重复实现 | ✅ 完成（避开敏感阅读面） |
| S5c | `S5cDebtDocs` | 文档/脚本/命名债务 | ✅ 完成 |

**`content_filter` 事故（第 4 次记录）**：`S5DebtDeadCode` 在读到
session 编解码／凭据遮蔽／认证分派后立即死亡，与 `phase-10-pre-research.md` §10
记录的三次**拦截点一致**。处置照既有结论：**涉及这些阅读面的任务由主代理亲验**，
并重派两个避开该面的窄切片。**重派成功**，说明拦截与**阅读面**有关，与措辞无关。

**并发上限**：全程 5 个（维护者规定上限 5）。

### 0.4 主代理亲验的方法

所有**头条数字**由主代理独立重算，不采信子代理：

| 工具 | 用途 |
|---|---|
| 自写 Python import 图 + BFS | 可达性、死簇、seam |
| `npx tsx` 直接调用生产函数 | 行为验证（非读码推断） |
| 真实 CLI（`--print` / `--json`） | 端到端实机 |
| `npm run check:*` / `verify:*` | 仓库自带门禁 |

---


## 1. 头条发现：三项「开箱即坏 / 静默降级」缺陷（P0）


> **这一节是本轮最重要的产出，且三项都不是「相比 pi 的差距」，
> 而是**我方自身的既有缺陷**——前 10 个阶段都没有覆盖到，
> 因为它们不在 `01-*`～`07-*` 的七份切片范围内。

### 1.1 P0-A：`daemonEnabled` 默认 true，Rust 面不降级 → 全新安装开箱即坏

**判定**：**缺陷（CONFIRMED，实机复现）**。

**事实链**：

| 环节 | 位置 | 内容 |
|---|---|---|
| 默认值 | `config/runtimeConfig.ts:349` | `daemonEnabled: true` |
| 合并 | `config/runtimeConfig.ts:464-466` | 无配置时取 `DEFAULT_CONFIG.daemonEnabled` |
| 唯一执行者 | `daemon/client.ts:121-123` | `isRustDaemonEnabled()` → `getRuntimeConfig().daemonEnabled` |
| 分支 | `runtime/execution/service.ts:133` | `if (isRustDaemonEnabled())` |
| **不可用即失败** | `runtime/execution/service.ts:135-146` | cargo 缺失 → **直接 return failed**，**不落回本地执行** |
| 可用性判定 | `daemon/protocol.ts:186-197` | `execFileSync('cargo', ['--version'])` |
| 启动方式 | `daemon/resident.ts:58-70` | `spawn(cargo, ['run', '--manifest-path', …, '--bin', 'daemon', …])` |

**关键**：`runCommand` 的本地路径（`executeLocally`）在 `if` **之后**，
而该分支的每条失败路径都 `return`。**即：daemon 开启时，本地执行完全不可达。**

**实机复现**（`HOME=/tmp/fresh`，无 `~/.cheers/config.json`，`PATH` 去掉 `~/.cargo/bin`）：

```
daemonEnabled: true sources: []          ← 全新安装的真实默认
TOOL RESULT: {"success":false,
  "error":"Cargo executable not available. Checked: /tmp/fresh/.cargo/bin/cargo, cargo",
  "metadata":{"executionPath":"rust-daemon","errorClass":"environment_error",…}}
```

**对照**：把 cargo 放回 `PATH` 后同一调用**成功**（`elapsed ms: 127`，
`executionPath: rust-daemon`）——证明这是**cargo 缺失**而非代码路径损坏。

**为什么本机一直没暴露**：`~/.private-agents/config.json` 里写着 `"daemonEnabled": false`
（本机用户配置**覆盖**了默认值）。**这是「开发机配置恰好掩盖了默认值缺陷」的典型**，
与 `log.md` 2026-09-25 那条「CI 用 Node 20、本地 Node 24 所以一直没看到」**同型**。

**违反的既有原则**：
- `AGENTS.md`：「Do not hide unverified write outcomes behind success-like terminal or session states.」
  ——这里是**反向**：真实可用的本地执行被隐藏在一个失败的终态后面。
- `AGENTS.md`：「Rust … is not the default execution plane.」
  ——**默认值说的是相反的话**。

**影响**：任何未安装 Rust 工具链的用户，**bash 工具 100% 失败**，
且错误文本是「Cargo executable not available」——用户会以为是自己的环境问题，
而 CLI 报告里 `Execution path: rust-daemon`（`localCommandRuntime.ts:12,70`）进一步误导。

**修复方向**（三选一，需裁决）：
1. `daemonEnabled` 默认改 `false`（最保守，符合 `AGENTS.md` 的「非默认执行面」）；
2. cargo 不可用时**落回本地**（`continue` 而非 `return`），并在结果上如实标注降级；
3. 启动时探测一次并缓存，不可用则**改写为 false** 并报一次诊断。
> **推荐 2**：它同时修掉「cargo 存在但 daemon 起不来」（冷编译超 30s 等）的同类情形，
> 而 1 只掩盖了默认值，用户一旦显式开启仍会踩到。

### 1.2 P0-B：`cheers.json` 是 git 跟踪的配置契约，但从不被读取

**判定**：**缺陷（CONFIRMED）**。

**事实**：
- 仓库根有 `cheers.json`（`git ls-files` 确认**已跟踪**，757 字节，含 `maxTurns: 30`、
  `permissions.allowRules`、`tui.mode` 等）。
- 读取路径只有两条：`config/runtimeConfig.ts:555-561`
  ```ts
  return [resolveUserDataFile("config.json"), path.join(rootDir, ".cheers.json")];
  ```
  ——**`cheers.json`（无点）不在其中**；带点的是 `.cheers.json`。
- `.wiki/log.md:2751` 已记录「`.agents/settings.json` 与 `cheers.json` 无消费者」
  但判定为「**属实但改名前即如此**……属既有缺陷，不在本次改名范围」——
  **当时明确记录了它、却没有立项修**。

**实机验证**：CLI 首屏自报 `max-turns=15`（默认值），而 `cheers.json` 写的是 `30`。

**影响**：仓库自带一份**看起来生效、实际被忽略**的配置。新贡献者照它改设置会毫无效果，
且没有任何诊断提示（`configDiagnostics` 只报**解析失败**，不报**文件名不匹配**）。

**修复方向**：把 `cheers.json` 加入候选（`getCandidateConfigPaths`），
或删除该文件并改为 `.cheers.json`。**需裁决**——取决于它是否是**有意的**仓库级示例。

### 1.3 P0-C：`/model refresh` 抹掉内置模型的兼容性与能力声明

**判定**：**缺陷（CONFIRMED，实机复现）**。

**机制**：
- `core/models/catalogRefresh.ts:79-100` 的 `projectIndex` **只保留**
  `id` / `label` / `models` / `envVar` / `cost` / `contextWindow`。
- `core/models/catalog.ts:522-529` 的 `mergeProviders` 对**已存在**的 provider 做
  `{...existing, ...patch}`，然后 `models: dedupeModels([...existing.models, ...patch.models])`。
- `dedupeModels`（`:534-537`）是 `Map.set` **整体替换**——
  patch 里的模型对象**覆盖**内置模型对象，**不是深合并**。

**实机复现**（直接调用生产函数）：

```
BEFORE: {"id":"gpt-5.3","contextWindow":400000,
         "compat":{"systemRole":"developer","maxTokensField":"max_completion_tokens"},
         "promptCache":{"short":600,"long":86400},"vision":true}
AFTER : {"id":"gpt-5.3","contextWindow":400000,
         "cost":{"promptPerMTok":1,"completionPerMTok":2}}
```

**用户可见后果**（`resolveRequestShape` 前后对比）：

```
BEFORE: {"systemRole":"developer","maxTokensField":"max_completion_tokens",
         "reasoningEffort":true,"vision":true,"thinkingLevelName":"high"}
AFTER : {"systemRole":"system","maxTokensField":"max_tokens",
         "reasoningEffort":true,"vision":false,"thinkingLevelName":"high"}
```

即一次 `/model refresh` 之后：
- `developer` role → `system`；
- `max_completion_tokens` → `max_tokens`（**OpenAI 推理模型会拒绝 `max_tokens`**——
  这正是 `phase-5-execution.md` §11 记录过的、曾经让**每一个这类请求都被拒**的缺陷）；
- `vision: true` → `false`（**粘贴的图片会整个请求失败并丢掉旁边的文字**，
  `phase-9-step5-design.md` 的既有结论）。

**这是一次「已修复缺陷的静默回滚」**：Phase 5 修好了 compat 接线，
但刷新路径会把它清掉，而**没有任何测试覆盖「refresh 之后 compat 仍在」**。

**修复方向**：`mergeProviders` 改为**按模型 id 深合并**（patch 未声明的字段保留 base 值），
并补一条反向测试：refresh 后 `resolveRequestShape` 的关键字段不变。

---


## 2. 三语言架构裁决：TypeScript + Rust + Python 是否值得保留



| 层 | 现状 | 裁决 |
|---|---|---|
| **TypeScript** | 975 生产文件 / ~165k 行；控制平面 + 执行平面 + 呈现 + 工具 + 全部产品行为 | **保留**——它就是产品 |
| **Python** | **30 行**（一个冒烟测试）；`src/` **不存在**；`test:python` 在本机**直接报错** | **删除**。零生产价值，且是一条从不运行的 CI 分支 |
| **Rust** | **1,112 行**（494 执行器 + 612 守护进程 + 6 lib）；比 TS 已有实现**更弱** | **删除当前实现**；**保留方向**（系统级沙箱），但不该是现在这个形状 |

**「三门语言」这个设想本身不是噱头**——参考项目里有真实的成功先例（codex 1.54M 行 Rust、oh-my-pi 用 napi 做进程内绑定）。**但本项目的实现方式让 Rust 和 Python 都成了负数**：它们不是「还没长起来」，而是**已经长歪了**，且**成本高于收益**。

---


### 2.1 本机实测证据（不是推理）


#### 2.1.1 Rust 层：比 TS 侧已有实现更弱

| 维度 | Rust 路径 | TS 本地路径 | 证据 |
|---|---|---|---|
| **沙箱机制** | **字符串包含匹配**：`joined.contains("http://") \|\| joined.contains("curl ")` | **真 OS 隔离**：`bwrap --ro-bind/--bind/--tmpfs/--unshare-net`；macOS `sandbox-exec` | `executor.rs:205-238` vs `sandbox/osSandbox.ts:237-256` |
| **流式输出** | **不支持**——协议里没有 chunk 消息类型 | **支持**，逐块回调 | 见下 |
| **往返延迟（热）** | **60 ms** | **4 ms** | 实测 |
| **首次延迟** | **923 ms**（含 `cargo run` 启动） | **16 ms** | 实测 |
| **冷编译** | **15.1 s**（clean release build） | 无 | 实测 |
| **预编译二进制** | `target/release/daemon` **存在（1.1 MB），但没有任何代码引用它** | — | `grep -rn 'target/release' daemon/` → 0 |

**流式丢失是实测的，不是推断的**：

```
# Rust 路径，命令 `for i in 1 2 3; do echo $i; sleep 0.3; done`
daemon onOutput callbacks: []              ← 零回调，实时输出被静默丢弃
daemon final stdout: "1\n2\n3\n"           ← 只在结束时整块返回

# TS 路径，同一条命令
ts-local streaming timings: [[5,"1"],[307,"2"],[609,"3"]]   ← 逐块到达
```

**这直接违反仓库自己的承诺**：`daemon/client.ts:137-142` 的注释写着
「Output is forwarded as it arrives rather than buffered: the point is that a command
which prints for a minute looks alive for that minute.」——**经 daemon 时这句是假的**。
而 `core/tools/registry.ts:158` 确实传了 `onOutput`，`service.ts:182` 也确实透传了
`onOutput` 给 `executeLocally`——**唯独 daemon 分支（`service.ts:150-163`）没有传**。

**「沙箱」名不副实**：`evaluate_sandbox` 的规则是
`joined.contains("http://") || joined.contains("https://") || joined.contains("curl ")`。
一个 `--unshare-net` 的 bubblewrap 调用是真内核隔离；`contains("curl ")` 是**字符串搜索**，
绕过方式包括但不限于：`wget`、`python -c`、`nc`、变量拼接、base64 解码后执行。
**Rust 在这里提供的隔离弱于 TS 侧已有的实现。**

#### 2.1.2 Rust 层的其余部分：契约是测试专用

| 项 | 事实 |
|---|---|
| `contracts/rust/mod.rs`（293 行）被谁用 | **只有 `#[cfg(test)]`**（`executor.rs:287-290`）——生产代码零引用 |
| `schema_version_is_valid` / `contract_schema_exists` | 两个 `pub fn`，**唯一调用者是它们自己的单元测试** |
| 跨层 `schemaVersion` 强制 | `WORKSPACE.md:170` 声称「Every payload crossing a layer boundary MUST include schemaVersion」——**`grep schemaVersion` 在 `daemon/*.ts` 与 `daemon.rs` 均为 0** |
| Rust 测试规模 | **11 项**（9 + 2），0.06 秒跑完 |

即：Rust 侧的「版本化契约」是**为通过自己的测试而存在**的，从未约束过一次真实调用。

#### 2.1.3 Python 层：不存在

| 项 | 事实 |
|---|---|
| `packages/python-eval/` 全部内容 | `package.json`、`pyproject.toml`、`tests/test_smoke.py`（30 行） |
| `packages/python-eval/src/` | **不存在**——但 `package.json` 的 `check`/`lint` 脚本指向 `mypy src` / `pylint src` |
| `test:python`（根 `package.json`） | `D:\conda-envs\coding_agents\python.exe scripts/run-python-tests.py` |
| 本机实测 | `sh: 1: D:conda-envscoding_agentspython.exe: not found` → **硬失败** |
| `contracts/python/types.py`（152 行）被谁用 | **零引用**（不在 `python-eval`，不在产品代码） |
| 生产 Python LOC | **0** |

`AGENTS.md:37` 与 `ARCHITECTURE.md:25` 都写「python-eval 是离线评测，非生产」——
**这个定位是诚实的，但一个 30 行、src 不存在、脚本指向 Windows 路径的「层」，
不是「有意保持最小」，而是「从未开始」。**

---


### 2.2 参考项目的语言普查（14 个仓，主代理自测）


> 方法：自写 Python 遍历，**排除** `node_modules`/`target`/`.venv`/`__pycache__`/`vendor`/`third_party`/`.git`/`dist`/`build`；
> 排除测试文件（`*.test.ts`、`test_*.py`、`*_test.py`）。

| 仓库 | .rs | .ts | .py | 生产 Rust LOC | 生产 TS LOC | 生产 Python LOC | 产品运行时 | Rust 集成机制 |
|---|---:|---:|---:|---:|---:|---:|---|---|
| **codex** | 3456 | 720 | 103 | **1,540,578** | 9,221 | 34,297 | **Rust** | 进程内（Rust 主体 + TS SDK 客户端） |
| **oh-my-pi** | 422 | 2806 | 149 | 266,689 | 902,730 | 70,241 | **TS** | **napi 进程内 FFI**（`@oh-my-pi/pi-natives`，10 个包依赖） |
| **pi** | 0 | 962 | 0 | 0 | 213,025 | 0 | TS | n/a |
| **opencode** | 0 | 2648 | 0 | 0 | 518,232 | 0 | TS | n/a |
| **source-claudecode** | 0 | 1884 | 0 | 0 | 513,163 | 0 | TS | n/a |
| **gemini-cli** | 0 | 1413 | 37 | 0 | 363,722 | 4,261 | TS | n/a |
| **deepseek-harness** | 0 | 5102 | 19 | 0 | 1,092,999 | 8,135 | TS | n/a |
| **OpenHands** | 0 | 1684 | 3 | 0 | 259,913 | 746 | TS | n/a |
| **stagehand** | 0 | 638 | 54 | 0 | 101,289 | 12,556 | TS | n/a |
| **GitNexus** | 209 | 1555 | 285 | **2,141**（全是测试夹具） | 374,205 | 20,844 | TS | n/a |
| **mem0** | 0 | 419 | 286 | 0 | 62,374 | 78,114 | Python | n/a |
| **mempalace** | 5 | 4 | 183 | 1,332 | 413 | 87,101 | Python | n/a |
| **graphiti** | 0 | 0 | 206 | 0 | 0 | 43,469 | Python | n/a |
| **inspect_ai** | 0 | 0 | 1064 | 0 | 0 | 266,248 | Python | n/a |
| **mini-swe-agent** | 0 | 0 | 70 | 0 | 0 | 5,270 | Python | n/a |
| **playwright-mcp** | 0 | 10 | 0 | 0 | 1,017 | 0 | TS | n/a |

#### 2.2.1 从这张表读出的四件事

**① 同类产品的绝对主流是单语言。** 14 个仓里 **11 个是纯单语言**（8 个纯 TS，3 个纯 Python）。
「agent 产品必须多语言」**不成立**。

**② 两个多语言反例，机制都与我们不同。**

- **codex**：Rust **是产品本身**（1.54M 行），TS 只是一个 9k 行的 SDK 客户端。这不是「TS 主体 + Rust 加速」，是**反过来的**。它付多语言成本是**因为它选了 Rust 做主体**。
- **oh-my-pi**：TS 主体 + Rust **进程内 napi 绑定**（`crates/pi-natives/src/` 有 50 个模块：`grep.rs`、`glob.rs`、`edit.rs`、`pty.rs`、`ast.rs`、`iso.rs`、`sixel.rs`…），**10 个 TS 包直接依赖它**。这是「Rust 承担热路径的原生操作」的正确形状。

**③ 我们既不是 codex 也不是 oh-my-pi。** 我们是「TS 主体 + Rust 独立守护进程」——
一个**两边都不像**的形状：没有 oh-my-pi 的进程内零 IPC，也没有 codex 的 Rust 主体地位。

**④ Python 在 agent 产品里的真实位置：离线评测。** `inspect_ai`（266k 行）、`mini-swe-agent`（5k 行）
是评测框架，不是产品运行时。**这与我们文档的定位一致**——但我们只写了定位，**没写实现**。

---


### 2.3 网络研究证据（TinyFish）


#### 2.3.1 行业里最成功的 agent 用什么写的

| 事实 | 来源 |
|---|---|
| **Claude Code = 1,884 个 TypeScript 文件 / 512,664 行**，纯 TS | 源码泄漏分析 |
| 它**刻意把 Yoga 布局引擎重写为纯 TS**，注释写明目的是「**zero native dependencies, enabling single-binary deployment**」 | 同上 |
| 分发形态：**Bun 把 TS 编译成单文件原生二进制**（240–280 MB），用户无需装 Node | `claude-code-single-binary` |
| 即：**「原生二进制分发」不等于「用 Rust 写」** | 推论 |

**这一条直接击中我们 Rust 层的主要辩护理由**——「Rust 给单二进制分发」。
Claude Code 证明：**TS + Bun `--compile` 同样给出单二进制，且零原生依赖**。
（我们目前是 `npx tsx` 解释执行，连 Bun 都没用。）

#### 2.3.2 Rust 在 agent 领域的真实价值点

权威来源（Red Hat Developer）的核心论点**不是**「Rust 跑命令更快」，而是：

> 「An agentic framework is inherently concurrent… With 500 agents, any inefficiency is
> magnified exponentially. If each agent's "thinking" process is a CPU-bound task,
> a Python-based system will grind to a halt.」——**针对的是 Python 的 GIL**，
> **不是** Node.js。Node 的事件循环处理 I/O 密集的 agent 编排并无同类瓶颈。

另一份来源（SkillLite，Rust 沙箱）指出 Rust 在 agent 中的**唯一被反复引用的硬价值**：

> 「Linux: user namespaces + mount namespaces + **seccomp-BPF**；macOS: **Seatbelt**」
> 「Rust's memory safety inherently prevents buffer overflows and use-after-free」
> 「**All dangerous operations are executed in isolation by Rust subprocesses**」

**即：Rust 值得拥有的位置是「执行不可信代码的沙箱」，不是「跑一条 bash 命令」。**

> **同时必须记录一处方法论警告**：搜索中出现一篇 `ossinsight.io` 的文章，声称
> 「Q1 2026 有 7 个 Rust agent 仓、平均 404 stars/day、zeroclaw 597 stars/day」。
> 其数字形态可疑（混合了企业背书仓、stars/day 高得不合理），
> 且无法从任何一手来源核实。**本文件不采信该文的任何数字**，只引用可交叉验证的结论。

#### 2.3.3 多语言的实证成本

IEEE TSE 2024《Multi-language software development: Issues, challenges, and solutions》
（Yang et al.，引用 56 次）的结论是**多语言开发的首要挑战就是「complexity and diversity
inherent in building multilingual code and ensuring interoperability」**——
即多语言的核心成本落在**互操作**上，而这正是我们 `WORKSPACE.md` 用整整一节
「STRICT ISOLATION RULES」去管理的部分。

**而我们的互操作现状**：`contracts/rust/mod.rs` 生产零引用、
跨层 `schemaVersion` 从未被发送、Rust 守护进程用 `cargo run` 启动。
**我们付了多语言的成本，没有拿到多语言的收益。**

---


### 2.4 逐项裁决


#### 2.4.1 Python：**删除**（无争议）

| 理由 | 证据 |
|---|---|
| 生产代码 0 行 | `packages/python-eval/src` 不存在 |
| 唯一内容是 30 行冒烟测试，测试的是「contracts 文件存在」与一个正则 | `tests/test_smoke.py` |
| 测试入口在本机**硬失败** | `D:\conda-envs\...` → `not found` |
| `contracts/python/types.py` 零引用 | `grep` → 0 |
| 无任何产品路径依赖它 | 全仓 `grep` |

**处置**：删 `packages/python-eval/`、根 `package.json` 的 `test:python`/`test:all` 中的 Python 分支、
`contracts/python/`、`scripts/run-python-*.{py,mjs}`、`ARCHITECTURE.md`/`WORKSPACE.md`/`PROJECT_GUIDE.md` 中的对应章节。

**保留条件（若维护者想保留 Python）**：唯一站得住的用途是**离线评测套件**
（对标 `inspect_ai`）。但那是**一个独立项目**，不是「三语言架构的一层」——
它不需要与产品共享 workspace、契约或构建。**建议：若要，另开仓库。**

#### 2.4.2 Rust：**删除当前实现，保留方向**

**删除的理由（逐条实测）**：

| # | 理由 | 证据 |
|---|---|---|
| 1 | **能力是 TS 的子集** | 命令执行：TS `executeLocally` 已有，且**支持流式**；Rust 不支持 |
| 2 | **「沙箱」比 TS 弱** | Rust = 字符串 `contains`；TS = `bwrap` 真内核隔离 |
| 3 | **IPC 有净成本** | 热路径 60ms vs 4ms；首次 923ms vs 16ms；冷编译 15.1s |
| 4 | **丢失流式输出** | 实测 0 回调，且**违反代码自己的注释承诺** |
| 5 | **契约是测试专用的** | `contracts/rust/mod.rs` 只在 `#[cfg(test)]` 下被引用 |
| 6 | **默认值让产品开箱即坏** | `daemonEnabled: true` + 缺 cargo 不降级（见 `08-*` P0-A） |
| 7 | **预编译二进制无人使用** | `target/release/daemon` 存在，`grep` → 0 引用，代码永远走 `cargo run` |

**保留方向的理由（如果维护者想保留 Rust）**：
Rust 在 agent 产品里**唯一被反复验证的硬价值**是**系统级沙箱**——
`seccomp-BPF` / `user namespaces` / `Seatbelt`。这是**Node 生态真正做不到的**，
且我们**已经有一个 `bwrap` 沙箱但它是 TS 拼参数的**。
若要保留 Rust，正确的形状是：

- **进程内 napi 绑定**（照 oh-my-pi），**不是** stdio 守护进程；
- 承担 **seccomp/namespace/Seatbelt 策略构造与执行**，**不是**「跑命令」；
- 提供 **prebuilt 二进制 + 优雅降级**（不可用则走 TS 路径，而不是失败）。

**但这是一次重写，不是修 bug。** 当前 1,112 行**全部推倒**。

#### 2.4.3 TypeScript：**保留，且是唯一的产品语言**

**但「全转 TS」有两个必须同时处理的点**，否则只是换个语言重复同样的问题：

1. **分发**：现在 `npx tsx` 解释执行。若要单二进制，**照 Claude Code 用 Bun `--compile`**
   （零原生依赖）。这比「用 Rust 做二进制」成本低一个数量级。
2. **不要把 Rust 删掉的理由（性能）当成不用验证的假设**：
   我们**没有**任何基准显示 Node 的进程 spawn 是瓶颈。
   `bash` 工具的耗时由**子进程本身**决定（`npm install` 要几十秒），
   编排层的 4ms vs 60ms 在这个尺度上不可见。

---


### 2.5 「三门语言」这个设想：有价值还是噱头？


**分开回答，因为两者的答案不同。**

#### 2.5.1 设想本身：**不是噱头，但用错了位置**

- **Rust**：在 agent 领域有**真实的、被验证的价值**——系统级沙箱、不可信代码隔离。
  codex（1.54M 行）和 oh-my-pi（napi 绑定 50 个模块）是活证据。
- **Python**：在 agent 领域有**真实的位置**——离线评测（inspect_ai 266k 行）。
- **但两者都不是「三层架构」的一部分**：codex 是 Rust 主体 + TS 客户端；
  oh-my-pi 是 TS 主体 + Rust 原生模块；inspect_ai 是**独立**的 Python 评测框架。
  **没有一个是「TS 控制面 + Rust 执行面 + Python 评测面」这种三层切分。**

#### 2.5.2 本项目的实现：**已经变成负数**

不是因为「还没长起来」，而是因为：

| 症状 | 表现 |
|---|---|
| **比已有实现更弱** | Rust 沙箱（字符串匹配）弱于 TS 沙箱（bwrap） |
| **净增延迟** | 60ms vs 4ms，且**丢掉流式** |
| **契约空转** | 293 行 Rust 契约类型只被自己的测试引用 |
| **破坏产品** | `daemonEnabled: true` 让全新安装的 bash 100% 失败 |
| **从不运行** | Python 的 `test:python` 在本机硬失败 |
| **文档与代码不符** | `WORKSPACE.md` 声称的 5 条隔离规则，其中「schemaVersion 必带」实测为 0 |

**这就是「噱头」的定义**：一个在文档、目录结构和构建脚本里存在，
但在**产品行为里不存在**（Python）或**比替代方案更差**（Rust）的架构主张。

#### 2.5.3 是否全部转写为 TS？

**是——但分两步，且第二步可选。**

1. **立即**：删 Python 层；删 Rust 守护进程路径，让 `runtime/execution` **只剩 TS 本地实现**
   （它已经存在、更快、更强、支持流式）。这一步同时修掉 `08-*` 的 P0-A。
2. **可选，且需先证明**：若未来要**真的**做系统级隔离（seccomp/namespace 策略、
   不可信插件沙箱），**那时**再引入 Rust——用 **napi 进程内绑定**，
   **只做隔离策略**，并**必须**有 prebuilt 二进制与降级路径。
   **前提是先用基准证明 TS 的 `bwrap` 方案不够**——目前**没有**这个证据。

---


### 2.6 裁决与执行结果（**2026-09-26 更新**）


#### 2.6.1 维护者裁决

> 「可以，将 Python 和 Rust 都删除，至于是否改用 Bun `--compile` 出单二进制，有什么好处吗？」

**D1（Python）**：**删除** —— 已执行。
**D2（Rust）**：**删除执行面** —— 已执行；napi 重写方向**不启动**（无基准证据）。
**D3（Bun `--compile`）**：**已给出好处分析，待裁决**（见 §8.4）。

#### 2.6.2 已执行的删除（本文件写作后的施工）

| 类别 | 内容 |
|---|---|
| **包** | `packages/rust-core/`（含 603MB `target/`）、`packages/python-eval/` |
| **TS 执行路径** | `packages/ts-shell/src/daemon/`（6 文件：client/resident/protocol/types + 2 测试）；`core/tools/registry-rust-bridge.test.ts`（414 行） |
| **契约** | `contracts/rust/mod.rs`（293 行）、`contracts/python/types.py`（152 行） |
| **脚本** | `run-rust-command.mjs`、`run-python-command.mjs`、`run-python-tests.py`、`verify-rust-execution.mjs`、`toolchain.mjs` 的 Python/Cargo/Rustup 检测 |
| **配置** | `RuntimeConfig.daemonEnabled`、`RuntimeConfigFile.daemonEnabled`、`DEFAULT_CONFIG.daemonEnabled`、`process.env.DAEMON_ENABLED` 分支 |
| **根 package.json** | `workspaces` 去掉 `rust-core`；删 `build:rust`/`test:rust`/`test:python`/`verify:rust-execution`/`verify:rust-execution:env`/`verify:product:rust-execution` |
| **新增** | `runtime/execution/local.ts`（原 `daemon/client.ts` 的本地实现，去掉了 daemon 相关部分） |

**`runtime/execution/service.ts` 的变化**：`if (isRustDaemonEnabled())` 整段删除，
`runCommand` 现在只有一条路径。**副作用：`onOutput` 不再被丢弃**——
它以前只传给 `executeLocally`，而 daemon 分支在它之前 `return`，
所以 daemon 开启时**实时输出永远到不了调用方**（§1.1 实测 0 回调）。

**类型收窄**：`ExecutionPath` 从 `'ts-local' | 'rust-daemon'` 收窄为 `'ts-local'`；
`CommandExecutionResult` 删掉 4 个 `daemon*` 字段。

#### 2.6.3 验证（全部实机）

| 项 | 结果 |
|---|---|
| `npm run build`（tsc） | **0 错误** |
| `npm run validate` | **PASS** |
| `verify:docs-drift:strict` | **rules_dangling 0 / docs_dangling 0**（修掉 3 处绑定规则引用 + 3 处当前态文档引用） |
| `verify:import-cycles` | **0 环** |
| `check:config-consumers` | **pass**（`daemonEnabled` 删除后无悬空声明） |
| `check:declarations` / `check:node-floor` | **pass** |
| **P0-A 场景复测** | `HOME=/tmp/fresh2`、PATH 去掉 `~/.cargo/bin`、无配置 → `daemonEnabled` **字段已不存在**，bash 命令 **`completed` / exit 0 / `executionPath: ts-local`**（修复前是 `success:false, "Cargo executable not available"`） |
| **流式复测** | 同一命令 `[[4,"1"],[308,"2"],[610,"3"]]` —— **实时到达**（修复前 daemon 路径 0 回调） |
| 全量测试 | 见 §8.5 |

**`08-*` 的 P0-A 因此自动消失**：没有 daemon 就没有 daemon 默认值。
这正是本文件 §6 预测的结果。

#### 2.6.4 Bun `--compile` 有什么好处（D3 的答复）

**有，而且它正好命中 Rust 被引入时的两个理由。** 但**收益取决于你是否要分发**。

**它解决什么**：

| # | 好处 | 说明 |
|---|---|---|
| 1 | **用户不需要装 Node** | 单文件可执行，含 Bun 运行时。这是「用 Rust 出单二进制」原本想要的东西——**用零新语言拿到** |
| 2 | **启动更快、内存更省** | 官方文档：编译把「读盘 + 解析 + 转译」的成本从运行时移到构建时；配合 `--bytecode` 再省一截（官方示例：一个大型 CLI 冷启动 1.0s → 0.53s，启动内存 −40MB） |
| 3 | **交叉编译现成** | `--target=bun-linux-x64 / bun-darwin-arm64 / bun-windows-x64 / *-musl`，八个目标，一条命令 |
| 4 | **可嵌入资源** | `with { type: "file" }` / `--asset` 把目录打进二进制——主题、技能模板、默认配置都能内置 |
| 5 | **零原生依赖是可达的** | Claude Code 就是这么做的：51 万行 TS，**刻意把 Yoga 重写为纯 TS** 以避免原生依赖，然后 Bun 编译成单二进制 |

**代价与限制（必须一起看）**：

| # | 限制 |
|---|---|
| 1 | **产物很大**：Claude Code 的二进制 **224–280 MB**。Bun 官方也承认「Bun 的二进制还是太大，需要变小」 |
| 2 | **引入 Bun 作为构建依赖**（不是运行时依赖，但 CI 与发布要装它） |
| 3 | **`tsconfig.json` / `package.json` 运行时加载默认关闭**（`.env`/`bunfig.toml` 默认开启）——若代码在运行时读这两个文件需显式开启 |
| 4 | **动态 import 与 `new Worker(path)` 需显式列为入口**；相对路径加载的文件要打进 `--asset` 或会从磁盘找 |
| 5 | **需要适配层**：我们的代码大量使用 `node:` 内建与 `.js` 后缀导入，**兼容性未实测**（见 §9 未验证项） |

**与当前状态的关系**：
现在分发靠 `npm run build:ts` → `dist/cli.js` + `bin: { cheers: "./dist/cli.js" }`，
用户**必须装 Node ≥20.3**（这是 `engines` 声明与 `check:node-floor` 门禁共同维护的下限）。

**建议**：
- **若近期要对外分发**（让人 `curl | sh` 或下载一个文件就能用）→ **值得做**，
  且应作为**独立任务**：先验证 Bun 能否打包我们的代码，再决定是否进 CI。
- **若只在本机/团队内用** → **收益低**：团队成员已有 Node，多一个 200MB+ 的产物
  与一条新构建链，换不到什么。
- **无论做不做**：**不要因为「要单二进制」而重新引入 Rust**。这条理由已被
  Claude Code 的实践证伪（§3.1）。

#### 2.6.5 全量测试结果

见 `log.md` 的 2026-09-26 条目（施工后全量套件的失败项与分类）。

#### 2.6.6 未验证项（本节新增）

1. **Bun `--compile` 在本项目的兼容性**：**未实测**。我们的代码使用 `node:` 内建、
   `.js` 后缀导入、动态 `import()`、以及 `spawn` 子进程；Bun 宣称支持全部内建 Node API，
   但**没有跑过一次真实构建**。这是 D3 落地前必须做的第一步。
2. **二进制体积的实际值**：只知道 Claude Code 的 224–280MB；我们的产物**未测**。
3. **`--bytecode` 是否可用于本项目**：Claude Code 的第三方构建脚本记录了
   「bytecode 编译对复杂打包代码仍会失败」，但那是它自己的观察，**与本项目无关**。


## 3. 热路径实测与优化裁决：优化 Rust/Python 是否可能超过纯 TS



上一轮（本文件 §2）我证明的是：

> **「现有的 1,112 行 Rust 是负资产」**——它比 TS 已有的实现更弱（字符串匹配沙箱 vs `bwrap`）、
> 丢流式输出、多 60ms、且默认值让全新安装失败。

**这是对「当前实现」的判决，不是对「Rust 优化后」的判决。**
我在该文里写了一句「需先有基准证明 TS 的 `bwrap` 不够」，**但我自己没做那个基准**，
也没有量化**这个产品的时间到底花在哪里**。所以严格说，上一轮**没有资格**回答
「优化后的 Rust 会不会更值」。**本文补上这部分证据。**

---


### 3.1 实测：时间到底花在哪里


> 方法：`npx tsx` 直接调用生产函数，测量真实模块。仓库规模：**2,830 文件 / 28.9 MB**。

| 路径 | 实测耗时 | 评价 |
|---|---|---|
| **CLI 冷启动（`tsx`）** | **1,370–1,580 ms** | **最大单项**。每次调用 CLI 都付 |
| **`grep` 宽模式**（`function`，命中 100 行即停） | 206 ms | 尚可 |
| **`grep` 罕见模式**（`registerTool`，需扫完全仓） | **1,294 ms** | **真瓶颈**——无早退，读遍每个文件 |
| `glob '**/*.ts'` | 17 ms | 快 |
| `fileWalk`（全仓遍历 2,852 文件） | 14–17 ms | 快 |
| AST 解析 300 个 TS 文件 | 163 ms（≈0.54ms/文件） | 可接受 |
| 字符计数 50×1MB | 0 ms | 非问题 |

**对照 `ripgrep`（同一查询、同一仓库）**：

| 查询 | 我们 | `rg` | 差距 |
|---|---|---|---|
| `registerTool` | **1,294 ms** | **10–30 ms** | **43–130×** |
| `function` | 206 ms | 30 ms | ~7× |

**第一个结论**：这个产品**确实有一个真瓶颈**——`grep`。而它慢的原因**不是语言**：
`core/tools/grep.ts:103-134` 是**逐文件串行 `stat` + `readFile` + 逐行正则**，没有早退。

**验证「是语言问题还是实现问题」**：把同一算法改成**有界并发 32**（仍是 TS）：

```
A 串行（当前实现）:  1211 ms  hits=6
B 并行 ×32（TS 修复）: 454 ms  hits=6     ← 2.7× 提升，零新语言
rg（既有原生工具）:     10-30 ms          ← 再快 15-45×
```

**第二个结论**：TS 层面的实现缺陷可以先拿回 2.7×；
**剩下的 15–45× 来自 ripgrep 的成熟工程**（SIMD 字面量扫描、并行目录遍历、内存映射、跳过二进制文件），
**不是来自「Rust 比 JS 快」**。

---


### 3.2 关键发现：参考项目是怎么拿到那个速度的


这是本轮最重要的一组证据。**三家参考实现，没有一家是自己写搜索算法的。**

| 参考 | 做法 | 证据 |
|---|---|---|
| **Claude Code** | **内嵌 ripgrep 二进制**（编译进单文件可执行） | `source-claudecode/utils/ripgrep.ts:47`：「In bundled (native) mode, ripgrep is **statically compiled into** bun-internal」 |
| **pi** | **`spawn(rgPath, args)`**，甚至会在缺失时**自动下载 rg** | `pi/.../tools/grep.ts:168` `spawn(rgPath, args, …)`；`:121` `reject(new Error("ripgrep (rg) is not available and could not be downloaded"))` |
| **oh-my-pi** | Rust napi 绑定，但**链接的是 ripgrep 的库** | `crates/pi-natives/Cargo.toml`：`grep-searcher`、`grep-regex`、`grep-pcre2`、`grep-matcher`、`ignore`、`globset` |

**oh-my-pi 那行是决定性的**：它的 Rust 价值**不是「用 Rust 重写搜索」**，
而是**「用 napi 把 ripgrep 的现成库链进进程」**。
即：**Rust 在这里是「原生库的粘合层」，不是「更快的实现」。**

**这直接回答维护者的问题**：Rust 优化**在技术上确实成立**——
但**成立的内容是「接入既有原生工具」，而不是「用 Rust 写更好的代码」**。
而「接入既有原生工具」这件事，**TS 用 `spawn(rg)` 就能做**（pi 就是这么做的）。

#### 3.2.1 AST 解析同样是「接入既有工具」

| 参考 | 做法 | 证据 |
|---|---|---|
| **Claude Code** | **tree-sitter 原生 NAPI 模块**，且**优雅降级** | `utils/bash/parser.ts:41`：`success ? 'tree-sitter: native module loaded' : 'tree-sitter: unavailable'`；`:79`/`:127` 各有 `catch` 回退 |
| **oh-my-pi** | tree-sitter + **ast-grep-core**，覆盖 20+ 语言 | `crates/pi-ast/Cargo.toml`：`tree-sitter`、`tree-sitter-<lang>` ×20、`ast-grep-core` |
| **我们** | `ts.createSourceFile`（TypeScript 编译器 API） | `context/graph/ast/parser.ts:67` |

**我们这一项其实不差**：`ts.createSourceFile` 是**官方编译器**，精度高于 tree-sitter，
0.54ms/文件 也在可接受范围。**AST 不是需要 Rust 的地方。**

---


### 3.3 实测：Bun `--compile` 真的能用（上一轮未验证项）


上一轮我把它列为「未实测」。本轮**跑了**：

```
bun build packages/ts-shell/src/entrypoints/cli.tsx --compile --outfile /tmp/cheers-test-bin
  [345ms]  bundle  750 modules
  [464ms]  compile  /tmp/cheers-test-bin
  产物: 106 MB
```

| 项 | `tsx`（现状） | `bun run` | **Bun 编译产物** |
|---|---|---|---|
| 启动 | **1,370–1,580 ms** | 270–850 ms | **200 ms** |
| 需装 Node | 是 | 是（需 Bun） | **否** |
| 产物大小 | — | — | 106 MB |

**编译产物实机跑通**：

```
/tmp/cheers-test-bin --print "run echo BUN_BINARY_OK"
  → Outcome: success / Actions: bash (1 run)
```

**发现一个真实缺陷（未修，仅记录）**：编译产物 `--version` 输出 **`version unknown`**。
根因已定位：`core/version/current.ts:26-35` 的 `manifestPath()` 从 `import.meta.url`
向上走 6 层找 `package.json`；在编译产物里 `import.meta.url` 指向 Bun 的虚拟文件系统
（`/$bunfs/...`），走不出去。**`--compile-autoload-package-json` 无效**（实测仍是
`version unknown`）。修法是构建期 `--define` 注入版本号，或让 `manifestPath` 认
`Bun.isStandaloneExecutable` 后改走 `--asset` 内嵌的清单。

**结论**：Bun 编译**能跑，且启动快 7×、用户免装 Node**，代价是 106MB 产物 + 一处版本号缺陷。

---


### 3.4 逐项裁决：优化后的价值 vs 直接用 TS


维护者的问题是「优化后是否**仍不如** TS 重写」。**逐项回答，因为答案是分裂的。**

#### 3.4.1 `grep` 搜索——**优化价值高，但不需要 Rust**

| 方案 | 预期耗时 | 成本 | 可验证性 |
|---|---|---|---|
| 现状（串行 TS） | 1,294 ms | — | — |
| TS 并行化 | ~450 ms | 低（改一个循环） | 高 |
| **`spawn(rg)`（照 pi）** | **~10–30 ms** | **低**（一个子进程 + 参数映射） | 高 |
| 用 Rust 重写搜索 | ~10–30 ms | **高**（重写 + 绑定 + 打包） | 高 |
| Rust napi 链接 ripgrep 库（照 oh-my-pi） | ~10–30 ms | **很高**（napi 工具链 + 20+ 平台产物） | 高 |

**裁决：做「`spawn(rg)`」，不做 Rust。** 三者**终点相同**（都是 ripgrep 的实现），
但 `spawn(rg)` 的成本比引入 napi 低一个数量级，且**不需要第二门语言、不需要交叉编译矩阵、
不需要处理原生模块加载失败**。
**唯一要处理的**是 `rg` 缺失时的降级（保留现有 TS 实现作回退，照 Claude Code 的
`tree-sitter: unavailable` 模式）。

#### 3.4.2 AST 解析——**优化价值低，Rust 更不值**

我们的 `ts.createSourceFile` 是官方编译器，0.54ms/文件。
换 tree-sitter 的收益是「支持 20+ 语言」，**但那是产品需求问题，不是性能问题**——
若真需要多语言，正确做法是 `web-tree-sitter`（WASM，零原生依赖）或照 Claude Code
引原生模块，**都不需要我们自己写 Rust**。

#### 3.4.3 系统级沙箱——**唯一 Rust 能独占的位置，但目前没有需求证据**

| 事实 | 证据 |
|---|---|
| 我们的沙箱是**真内核隔离** | `sandbox/osSandbox.ts:237-256` `bwrap --ro-bind/--bind/--tmpfs/--unshare-net`；macOS `sandbox-exec` |
| 本机 `bwrap` 可用 | `which bwrap` → `/usr/bin/bwrap` |
| 我们**没有**任何基准显示它不够 | 未测——但也没有任何一次沙箱相关的性能投诉记录 |
| Rust 在此的价值 | `seccomp-BPF` / user namespaces / Seatbelt 的**细粒度策略**（SkillLite 那类），可做到 `bwrap` 表达不了的白名单粒度 |

**裁决：维持「不做」。** 理由是**需求证据为零**，不是「Rust 不行」。
若将来要「只允许某几个系统调用」级别的策略，**那时** Rust/napi 是对的形状——
**本文不反对那条路，只是它现在没有触发条件。**

#### 3.4.4 性能基准与延迟——**不是 Rust 的场景**

agent 的墙上时间由**子进程 + 网络往返**决定：
- 一次 `npm install` 几十秒；
- 一次模型请求几秒；
- 编排层 4ms vs 60ms **在这个尺度上不可见**（上一轮实测）。

**裁决**：不构成理由。

#### 3.4.5 Python——**连「优化对象」都不存在**

| 问题 | 事实 |
|---|---|
| 有多少代码可优化？ | **30 行冒烟测试**；`src/` 不存在 |
| 评测需求真实存在吗？ | **已被 TS 覆盖**：`packages/ts-shell/src/eval/browser/`（benchmarkModel/Report/Runner）+
`scripts/real-shape-coverage.mjs`、`broader-regression.mjs`、`comprehensive-regression.mjs`、`daily-regression.mjs` |
| Python 生态的独占优势是什么？ | 科学计算（numpy/pandas/torch）、ML 训练、Jupyter。**本产品不用任何一项** |

**裁决：Python 没有可优化的部分。** 若真要做「对标 `inspect_ai` 的评测框架」，
那是一个**独立项目**（独立仓库、独立 CI），不是「本产品的一层」。

---


### 3.5 直接回答维护者的问题


> **「优化这两部分，让他们不再是负担而是有价值的一部分」——这条策略成立吗？**

**分三层回答：**

#### 第一层：Rust 优化**技术上成立**，而且**参考项目正是这么做的**

Claude Code 用 tree-sitter NAPI + 内嵌 ripgrep；oh-my-pi 用 napi 链接 ripgrep 的库。
**所以「Rust 有价值」这句话本身是对的。**

#### 第二层：**但本项目的收益来自「接入既有工具」，不是「用 Rust 写代码」**

这是本轮的核心发现。三家参考的 Rust/原生价值，**全部是「把已经存在的成熟原生实现接进来」**：

- oh-my-pi 的 `grep-searcher` 就是 ripgrep 的库——**它没有自己写搜索算法**；
- Claude Code 内嵌的是 **ripgrep 二进制本身**；
- pi 干脆 `spawn(rg)`，**一行 Rust 都没有**。

**所以「优化 Rust」在本项目会退化成两种选择**：

| 选择 | 拿到的东西 | 成本 |
|---|---|---|
| **A. `spawn(rg)`（纯 TS）** | 与 Rust 方案**完全相同的速度** | 低——一个子进程 |
| **B. Rust + napi 链接 ripgrep** | 同上 | 高——第二门语言、napi 工具链、多平台产物、加载失败处理 |

**A 与 B 的终点相同，A 的成本低一个数量级。** 这就是维护者问的「是否不如直接用 TS」的答案：
**不是「TS 写得更快」，而是「TS 可以直接调用那个更快的原生工具，不必自己成为它」。**

#### 第三层：**Rust 有一个 TS 拿不到的位置，但它现在没有触发条件**

**系统级沙箱**（`seccomp-BPF` / namespaces 的细粒度白名单）。
`bwrap` 能做的我们已经做了且工作正常；`bwrap` 做不到的，只有原生代码能做。
**但：零需求证据。** 所以正确态度是**登记为「条件性候选」**，不是「现在不做」也不是「现在就做」。

---


### 3.6 建议的路线（按「先便宜后昂贵」排序）


| # | 动作 | 语言 | 预期收益 | 成本 |
|---|---|---|---|---|
| **1** | `grep` 改 `spawn(rg)`，保留 TS 实现作 `rg` 缺失时的回退 | **纯 TS** | **1,294ms → ~30ms（43×）** | **低** |
| **2** | `grep` 现状同时加有界并发（若不想引子进程，退路方案） | 纯 TS | 1,294 → ~450ms（2.7×） | 低 |
| **3** | Bun `--compile` 出单二进制（修 `--version` 缺陷） | 纯 TS + Bun | 启动 **1,370ms → 200ms（7×）**；用户免装 Node | 中 |
| **4** | **条件性候选**：若将来需要 `seccomp` 级策略，**那时**引 Rust/napi 沙箱 | Rust | 未量化 | 高 |

**第 1 与第 3 项合起来，用零新语言拿到**：
比现状快 43× 的搜索 + 快 7× 的启动 + 免装 Node 的分发。
**这两项都不需要 Rust，也不需要 Python。**

---


### 3.7 施工结果（**2026-09-26 更新：第 1 与第 3 项已执行**）


维护者裁定「执行 1+3」。两项均已落地并实机验证。

#### 3.7.1 第 1 项：`grep` 接入 ripgrep

新增 `core/tools/grepRipgrep.ts`；`grep.ts` 先走 `rg`，失败则回退到原有的串行遍历。
两条路径经**同一个** `reportGrepMatches`，所以 transcript 看不出哪条答的。

| 查询 | 修复前 | 现在（rg） | 回退（无 rg） |
|---|---|---|---|
| `registerTool` | **1,294 ms** | **53 ms（24×）** | 1,383 ms |
| `function` | 206 ms | 57 ms | 197 ms |

**回退返回完全相同的行数**（13 / 100）——行为等价的降级，不是功能缺失。

**施工中发现的两处实测事实（非推理）**：
1. **必须加 `--hidden`**：`rg` 默认跳过隐藏目录，而我们的 in-process walk 不跳。
   不加 → 2 处命中；加了 → 13 处（与 TS 路径一致）。**不加会让两条路径搜索不同的文件集**，
   回退时静默换一个问题回答。
2. **必须用 `--json`**：`path:line:text` **无法可靠切分**——文件名可含冒号，
   且 `rg` 在**单文件搜索时省略文件名**。已写成测试钉住（`weird:name.ts`）。

#### 3.7.2 第 3 项：Bun 单文件可执行

新增 `scripts/build-cli-executable.mjs` + `npm run build:exe`。

| 项 | `tsx` | 编译产物 |
|---|---|---|
| 启动 | 1.91–1.97 s | **0.18 s（≈10×）** |
| `--version` | `0.1.0` | **`0.1.0`**（修复前 `version unknown`） |
| 需装 Node | 是 | **否** |
| 产物 | — | **95 MB**（`--minify`；未 minify 106 MB） |

**§3 记录的 `--version` 缺陷已修**：`core/version/current.ts` 在**读不到 manifest 时**
才用构建期常量（`--define` 注入），**manifest 优先**——否则源码检出会报出过期的内置版本。

**编译产物实机**：`--print "run echo …"` → success；`--print "grep for registerTool …"` →
**成功走 rg 路径**（模型正确报出 7 个文件且指出源码零命中），证明 `execFileSync` 在 Bun 编译环境可用。

#### 3.7.3 本轮验证

`tsc` **0 错误**；五道门禁**全 pass**；聚焦测试 **24 文件 / 179 项通过**；
全量 **3715 项 / 3 failed**——3 项均为既有负载抖动（隔离复跑全绿、
**不引用本轮任何模块**、**启动时间 A/B 实测无回归**、`log.md` 已逐字记录过）。

---


## 4. 差距清单（对照 pi / Claude Code / opencode）


### 4.1 分类口径（沿用 01–07）

| 判定 | 含义 | 本轮是否提议开发 |
|---|---|---|
| **MISSING** | 参考有，我们无等价物 | ✅ 提议 |
| **DEFICIENT** | 我们有但更弱／不完整／未接线／已损坏 | ✅ 提议 |
| **OURS-ONLY** | 我们有参考没有 | ❌ **仅记录**（维护者指示暂缓） |
| **TIE** | 两侧都有，形态不同 | ❌ 仅记录 |

### 4.2 MISSING（10 项）

| # | 缺口 | 参考位置 | 我方核实（命令 + 结果） | 成本 |
|---|---|---|---|---|
| M1 | **数据驱动的 per-path/per-regex 权限规则**（allow/deny/ask） | Claude Code permissions、opencode | `grep -rn 'allowRules\|denyRules' packages/ts-shell/src` → **0**。审批是**工具名 + 分类器**（`core/shell/approval/evaluator.ts:145-194`），无路径/正则规则。**注**：`cheers.json` 声明了 `allowRules` 但**无人读取**（见 §1.2） | 中 |
| M2 | **后台命令执行**（`run_in_background` / detach） | Claude Code `Bash(run_in_background)`；`pi/core/tools/bash.ts:98` `detached` | bash schema 只有 `command` + `timeout`（`core/tools/registry.ts:662-672`） | 中 |
| M3 | **OAuth Device Code 流**（无浏览器环境） | pi `docs/providers.md`；现为 loopback-only | `core/auth/oauth/flow.ts` 只起本地回环服务器 | 中 |
| M4 | **Bedrock 协议** | pi provider 层 | `provider/endpoints/` 只有 2 种（见 §2.3） | 高 |
| M5 | **Google GenAI / Vertex 原生协议** | pi、gemini-cli | 同上 | 高 |
| M6 | **Copilot / Anthropic 订阅 OAuth** | pi 7 家 vs 我方 2 家 | `core/auth/oauth/providers.ts:91-93` 字面量 `["openai","google"]` | 中（**无账号可验**） |
| M7 | **未变更文件去重**（`FILE_UNCHANGED_STUB`） | Claude Code read | `grep -rn 'unchanged\|FILE_UNCHANGED' core/tools/` → 0 | 低 |
| M8 | **压缩后工作文件恢复**（`POST_COMPACT_MAX_FILES_TO_RESTORE`） | Claude Code | `grep -rn 'restore.*file\|restoreFiles' session/compaction.ts` → 0 | 中 |
| M9 | **指令文件 `@import` / 转写** | pi resource-loader | `context/instructions/projectInstructions.ts` 只读候选文件，无 import | 低 |
| M10 | **动态工具装载增量**（`toolsAdded`/`toolsRemoved` 系统消息） | pi `agent-loop.ts:333-379` | turn 层无此事件 | 低 |

### 4.3 DEFICIENT（14 项）

**（a）provider / 请求形状**

| # | 缺陷 | 位置 | 核实 | 影响 |
|---|---|---|---|---|
| D1 | **`classifyProviderFailure` 是死代码** | `provider/registry/provider.ts:240`；**唯一调用者是自己的测试** | `grep -rn classifyProviderFailure` → 生产 0、测试 6 | `turn/step.ts` 用**临时代码串匹配**，把可分类的失败报成泛化文本 |
| D2 | **Anthropic `thinking` 缺 `budget_tokens`** | `provider/endpoints/anthropicMessages.ts:114-116` `body.thinking = { type: "enabled" }` | 逐字确认 | Anthropic 要求 `budget_tokens`，缺失 → **HTTP 400**。**注**：需真实账号验证，**未验证** |
| D3 | **Anthropic 丢弃 `thinkingSignature`** | `anthropicMessages.ts` 全文 `grep signature` → **0** | 逐字确认 | 多轮 Claude 推理链断裂 |
| D4 | **无条件发送 `temperature`** | `openaiCompatible.ts:60` `temperature: input.temperature`；调用点 `turn/step.ts:231` `?? 0.7` | 逐字确认 | OpenAI o1/o3/o4 拒绝非默认 temperature → **400**。**注**：`requestShape` **没有** temperature 维度（`grep temperature core/models/requestShape.ts` → 0） |
| D5 | **目录刷新抹掉能力声明** | 见 §1.3 | 实机复现 | **已修复缺陷的静默回滚** |
| D6 | **SSE 事件头被丢弃** | 流读取未保留 event 头 | 子代理报告，主代理**未独立复现** | 部分 provider 靠事件头区分帧类型 |
| D7 | **CJK token 低估** | `session/context.ts:3` `CHARS_PER_TOKEN = 3.5` | 逐字确认 | 见 D9 |

**（b）内核 / 循环**

| # | 缺陷 | 位置 | 核实 | 影响 |
|---|---|---|---|---|
| D8 | **重试退避无抖动** | `core/agent/retry.ts:127` `baseDelayMs * 2 ** (attempt-1)`，**无 `Math.random`** | 逐字确认；pi `packages/ai/src/utils/provider-retry.ts:66` 有 `* (1 - Math.random() * 0.25)` | 限流下**惊群**（thundering herd） |
| D9 | **Doom Loop 只认严格连续** | `core/query/doomLoopDetector.ts:38-47` 从尾部连续计数，遇任何不同调用 `break` | 逐字确认 | **A→B→A→B 交替循环检测不到** |
| D10 | **子代理 `task` 工具不是 agent** | `core/tools/taskTool.ts:142` 单次 `fetch` 到 `/chat/completions` | `grep 'AgentCore\|createStepFunction\|runTurn' taskTool.ts` → **0** | **最重的一项**：`subagentDef.tools` 被忽略、worktree 里的改动**没有任何 agent 去改**、无多轮循环。它是一次「带工作目录参数的补全调用」 |
| D11 | **`prepareNextStep` 不能中途改模型/推理档** | turn 层 | 子代理报告 | 中途升级模型需重开会话 |

**（c）工具 / 编辑**

| # | 缺陷 | 位置 | 核实 | 影响 |
|---|---|---|---|---|
| D12 | **编辑不检查 `oldText` 唯一性** | `core/tools/editEngine.ts:198-206` `locateInContent` 返回**首个**匹配 | **实机复现**：`replaceInContent("const a = 1;\nconst b = 2;\nconst a = 1;\n", "const a = 1;", "const a = 99;")` → `success: true, strategy: "exact"`，只改了第一处。pi `core/tools/edit-diff.ts:247-271` 有 `countOccurrences` + `getDuplicateError`「The text must be unique. Please provide more context」 | **静默改错文件位置**——模型以为改的是第二处 |
| D13 | **`lsp` 工具不是 LSP** | `core/tools/lsp.ts:78-89,120-140` 正则扫描 | 逐字确认：schema 声明 `line`/`character`（`:39-46`），**`grep args.line` → 0 次读取** | 参数被接受、从不读取、却返回结果——与 `phase-5-execution.md` §11 记录的「静默丢弃」同型 |
| D14 | **`grep` 在 JS 内存里跑正则** | `core/tools/grep.ts:73-75` `new RegExp` + 逐文件读 | 逐字确认 | 大仓下慢；参考用 ripgrep/fd 子进程 |

**（d）上下文**

| # | 缺陷 | 位置 | 核实 | 影响 |
|---|---|---|---|---|
| D9' | **压缩阈值含估算误差** | `session/context.ts:3` `3.5`；`cliSessionRuntimeFactory.ts:152-155` 用 `lastPromptTokens + estimateTokens(新增)` | 逐字确认 | 冷启动（`lastPromptTokens === 0`）时**系统提示与工具 schema 不计入**，约 5k–15k token 漏算；CJK/JSON 内容误差 15–70% |

> **注**：D9 与 D7/D9' 同源（都是 `CHARS_PER_TOKEN`），合并为一个修复项。

### 4.4 OURS-ONLY / 平手（**仅记录，不提议**）

按维护者指示，参考没有而我方有的能力**暂缓**。本轮识别到的：
浏览器统一工具（`browser`）、`ask` 交互决策工具、`todo` 程序化清单、
沙箱 OS 隔离（`sandbox/osSandbox.ts`）、审批信任指纹（`core/hooks/trust.ts`）、
只读 bash 分类器（`core/shell/approval/evaluator.ts:70-100`，含链式/重定向/替换拒绝）。
**这些在 05-* 已被判为 OURS-ONLY 或平手，本轮不重复登记。**

---


## 5. 架构债务与死代码


### 5.1 死代码：三层口径，数字逐层收紧

> **方法**：自写 Python import 图（含**副作用导入** `import "./x.js"`），
> 从 `entrypoints/cli.tsx` 做 BFS。**不采信子代理的原始数字**。

| 口径 | 文件数 | LOC | 说明 |
|---|---:|---:|---|
| `analyze-boundaries.py` 的 `cliOpaque` | 129 | — | testOnly 99 + noReference 29 + publicApiOnly 1 |
| **CLI 不可达（非 harness）** | **90** | **21,247** | 排除 `core/harness/`、`test-utils/`、`eval/`（非产品边界） |
| **真死（不可达 **且** 零生产导入者）** | **35** | **6,650** | 两者交集 |

**「真死」清单（35 个，按 LOC 降序，前 12）**：

| LOC | 文件 | 测试导入者 |
|---:|---|---:|
| 868 | `edit/multifile/model.ts` | 1 |
| 844 | `edit/recovery/model.ts` | 1 |
| 827 | `context/readDeliveryProjection.ts` | 1 |
| 571 | `runtime/resources/inventory.ts` | 1 |
| 301 | `context/acquisition/projection.ts` | 1 |
| 272 | `core/query/runtime/policy.ts` | 1 |
| 240 | `planning/runtime/engine.ts` | 1 |
| 236 | `repair/handoff/readiness.ts` | 1 |
| 232 | `session/store/host/state.ts` | **0** |
| 213 | `core/workflow/teamStore.ts` | 1 |
| 193 | `browser/skill/runner/manifest.ts` | 1 |
| 185 | `context/sessionContextRebuildProjection.ts` | 2 |

**「真死」的 seam（seam 校验）**：对 90 个不可达文件，扫描**非测试、非 harness** 的导入者
→ **0 条**。即：**没有任何活代码引用它们**，全部引用者都是测试或 harness。

**连通分量**：90 个不可达文件恰好构成 **36 个连通簇**（并集 == 全集），
最大三簇：

| 根 | 簇大小 | LOC |
|---|---:|---:|
| `planning/runtime/engine.ts` | 33 文件 | 9,283 |
| `context/acquisition/projection.ts` | 28 文件 | 7,756 |
| `edit/multifile/model.ts` | 12 文件 | 3,831 |
| `edit/recovery/model.ts` | 10 文件 | 3,667 |

> ⚠️ **删除授权**：`plan.md` §2.1 明确规定「**可达性只用于分析，不授权删除**」，
> 且 §2.2 要求**删除前六项检查**、删除单元取**连通分量整簇**。
> §9.18 的 T16a 已对其中一簇裁决「**暂不删除**」。
> **本轮同样不提议删除**——本节只登记事实与数字，**处置需裁决**（见 §5）。

### 5.2 结构性死代码：`core/workflow/` 的 6 个「管线」模块

**判定**：**确认（零生产导入者）**。

| 模块 | LOC | 生产导入者 | 唯一引用 |
|---|---:|---:|---|
| `core/workflow/builderValidator.ts` | 68 | **0** | `workflow.test.ts` |
| `core/workflow/adversarialRefuter.ts` | 68 | **0** | `workflow.test.ts` |
| `core/workflow/contextInjector.ts` | 66 | **0** | `workflow.test.ts` |
| `core/workflow/pipelineExecutor.ts` | 60 | **0** | `workflow.test.ts` |
| `core/workflow/cacheStaggering.ts` | 33 | **0** | `workflow.test.ts` |
| `core/workflow/teamStore.ts` | 213 | **0** | `messagingAndTeams.test.ts` |

**活轨是什么**：`/workflow` 命令（`core/commands/workflowCommandRuntime.ts`）走
`runner.ts` → `dagResolver.ts` + `parallelDispatcher.ts` + `definition.ts` + `runStore.ts`。
**这 6 个模块不在该链路上**。

**注**：`log.md` 2026-08-30 记录「Delivered modern Workflow & Agentic SDLC subsystem:
DAGResolver … PipelineExecutor … BuilderValidatorPipeline …」——
即它们**曾被当作交付物**，但**从未接进任何调用方**。这与 `phase-5` 的
「报告投影族」（32 文件 / 8,330 行零活消费者）**完全同型**。

### 5.3 `tools/policy/interception.ts`：411 行的零消费者模块

**判定**：**确认**。

- 5 个导出函数（`createToolInterceptionIntent`、`createToolBeforePolicyDecision`、
  `shouldPreventToolExecution`、`createBlockedToolInterceptionResult`、
  `createToolAfterObservationAnnotation`）**全部零非测试外部引用**。
- 模块本身**可达**（被 `tools/result/split.ts` 引用），但 `split.ts` 的
  `createCommandToolResultSplit` **也零非测试外部引用**。
- `tools/types.ts` 的 `ToolResultDetails` / `ToolReportSafeProjection` **被声明**
  但**没有任何生产者**（`grep 'reportSafe:'` → 只有这两个文件自己）。
- `tools/types.ts:66-86` 的 `MVP_TOOL_ALLOWLIST` / `isAllowlistedTool` / `MvpToolName`
  **零引用**，且其中的 `'git-status'` / `'git-diff'` 工具**在 Phase 5 已被删除**。

**即**：`tools/` 域有一整条「工具结果投影」链，声明完整、实现完整、**消费者为零**。

### 5.4 低价值代码

| 形态 | 实例 | 证据 |
|---|---|---|
| 仅测试可达的模块 | 35 个（§3.1） | 交集计算 |
| 声明无读者 | `MVP_TOOL_ALLOWLIST`、`isAllowlistedTool`、`MvpToolName`、`ToolReportSafeProjection` | `grep` → 生产 0 |
| 死分类器 | `classifyProviderFailure` | 生产 0、测试 6 |
| 重复的斜杠命令注册表 | `core/commands/registry.ts`（53 条）vs `entrypoints/slashCommandRegistry.ts`（`PICKER_ONLY`: `statusline`、`back`） | 后者自述「the router never sees them」 |
| 扩展注册 API 无消费者 | `registerSlashCommand` / `subscribeSlashCommands` | `grep` → 只有定义与 `slashSuggestions.ts` 的**读**侧 |

### 5.5 脚本与文档债务

| 项 | 数字 | 核实 |
|---|---:|---|
| `scripts/` 中零 `package.json` 注册的脚本 | **5** | `verify-anchored-provider-smoke.mjs`、`toolchain.mjs`、`delta-artifact-validate.mjs`、`generate-t12-evidence.mjs`、`git-workflow.mjs` |
| 文档悬空引用（**advisory**） | **78** | `npm run verify:docs-drift:strict` → `docs_source_dangling=78`（规则引用 0） |
| 判定列与正文矛盾 | 已在 `_index.md` §6.6 登记 10 处 | 本轮未新增 |
| 路由期命名残留 | `context/compact/continuity/routeContinuityHandoff.ts`（342 行，字段含 `routeId`/`route-info`）；`edit/result/editCapabilityCloseoutManifest.ts`（硬编码 `route: '73'`）；`browser/` 多处 `route125`/`route117` 注释 | 子代理报告 + 抽查确认 |

**`AGENTS.md` 明令**：「Avoid external-project names, route-era terms, and process
vocabulary in product code, filenames, public runtime fields, and user-visible output
unless the surface is explicitly historical or compatibility-only.」
——上述**不在例外之列**。

### 5.6 依赖与测试债务

| 项 | 发现 |
|---|---|
| `playwright-core` | 声明为 runtime 依赖，但**活轨从不直接调用**（只在受控/夹具路径）——需确认是否可降为 devDependency |
| 测试/生产文件比 | 457 测试 : 518 生产（0.88） |
| 超大测试 | `cli-baseline.test.ts`（1,688 LOC）、`testImpactPlan.test.ts`（653 LOC 测 142 LOC 实现，4.6×） |
| 零测试的分支逻辑模块 | 含 §3.2 的 6 个 workflow 模块、`contextAnalysis.ts`、`sessionContextRebuildProjection.ts`、`verificationRepairContext.ts` |

### 5.7 子代理结论中**被主代理推翻**的项

| 子代理原判 | 主代理核验 | 处置 |
|---|---|---|
| S4：「memory 子系统未接入活轨」 | **错误**。`core/shell/sessionRuntime.ts:268` 调 `buildPromptWithFutureTurnInjections`，后者引 `memory/projectMemoryFutureTurnInjection.ts`；可达性计算为 **REACHABLE** | 已推翻，**不登记** |
| S4：「`context/acquisition/` 与 `context/graph/` 是 100% 未接线」 | **部分错误**。`context/acquisition` 10 文件中 **6 个可达**、`context/graph` 12 中 **7 个可达**。**未接线的是子集**（4 + 5），不是整个域 | 已更正为「子集不可达」，数字见 §3.1 |
| S2：「`editEngine` 缺少唯一性检查」 | **成立**，且主代理**实机复现**（§2.3 D12） | 保留 |
| S3：「`classifyProviderFailure` 是死代码」 | **成立**，生产 0 引用 | 保留 |
| S5c：「`routeContinuityHandoff.ts` 违反命名规则」 | **成立**（342 行，`routeId` 等字段） | 保留 |
| S1：「retry 已完整接线」 | **成立**（`turn/step.ts` 确有重试执行）；**但缺 jitter**（D8） | 部分保留 |

**方法论教训（与 `_index.md` §4.2 同源）**：子代理的**可达性结论**必须由主代理
用同一张图重算。S4 的两处错误都是「把**子集**说成**整个域**」。

---


## 6. 项目进步方向（排序）


排序依据：**证据强度 × 影响面 × 可验证性**。

### 第 1 梯队：P0 缺陷修复（必须先做）

| # | 项 | 为什么排第一 |
|---|---|---|
| **T1** | `daemonEnabled` 默认值与不降级（§1.1） | **开箱即坏**，且**违反 `AGENTS.md` 明文**（Rust 非默认执行面）。修复可完整验证 |
| **T2** | `cheers.json` 不生效（§1.2） | 静默失效的配置契约；修复是 3 行 + 一条诊断 |
| **T3** | 目录刷新抹掉能力声明（§1.3） | **静默回滚已修复的缺陷**（推理模型 400、图片请求失败） |

### 第 2 梯队：高影响行为缺陷

| # | 项 | 证据强度 |
|---|---|---|
| **T4** | 编辑唯一性检查（D12） | 实机复现；pi 有对照实现 |
| **T5** | 子代理不是 agent（D10） | 逐字确认（零 agent 循环调用） |
| **T6** | `classifyProviderFailure` 接线（D1） | 生产 0 引用 |
| **T7** | 重试 jitter（D8） | pi 有对照公式 |
| **T8** | Doom Loop 交替检测（D9） | 逐字确认 |
| **T9** | `temperature` 按模型条件化（D4） | 与 D5 同源（都缺 requestShape 维度） |

### 第 3 梯队：能力补齐（成本低、收益明确）

| # | 项 | 成本 |
|---|---|---|
| T10 | 未变更文件去重（M7） | 低 |
| T11 | 指令 `@import`（M9） | 低 |
| T12 | 动态工具装载增量（M10） | 低 |
| T13 | 权限规则集（M1） | 中——**且与 T2 同根**（`allowRules` 已在 `cheers.json` 里声明） |

### 第 4 梯队：需独立裁决

| # | 项 | 需裁决什么 |
|---|---|---|
| T14 | 后台命令执行（M2） | 与「同步终端渲染」的既有立场是否冲突 |
| T15 | OAuth Device Code（M3） | 无账号可验；价值取决于用户环境 |
| T16 | 死代码处置（§3） | **`plan.md` §2.1 明确「可达性不授权删除」**——需维护者明示授权，或逐簇六项检查 |
| T17 | 路由期命名残留（§3.5） | 是否属「explicitly historical or compatibility-only」 |
| T18 | 新协议（M4/M5） | **无账号可验**；`phase-10-decisions.md` §1.1 已有先例裁决「不加无法验证的表面」 |

---


## 7. 本轮未做的核验（如实记录）

1. **pi 的实机运行**：`pi` 的 `node_modules` 不存在，未实跑其 CLI/TUI。所有参考侧结论
   来自**其源码与文档**（与 `phase-10-pre-research.md` §11 同）。
2. **Anthropic 端点（D2/D3）**：**无真实账号**，`thinking` 缺 `budget_tokens` 会 400
   这一条**未端到端验证**——它是从 API 契约推出的 `[INFERENCE]`。
3. **OpenAI 推理模型 temperature（D4）**：同上，**未验证**。
4. **OAuth 登录成功路径（M3/M6）**：无订阅账号，**不可验证**。
5. **SSE 事件头（D6）**：子代理报告，**主代理未独立复现**。
6. **`playwright-core` 是否可降级**：仅做静态扫描，未跑依赖裁剪。
7. **全量测试套件**：本轮**零代码改动**，未跑（符合「改动为零」的既有纪律）。
8. **死代码处置**：本轮**只登记不删除**——`plan.md` §2.1 禁止用可达性授权删除。

---


**语言裁决与热路径研究的未验证项**（合并自原 09 / 10 两份文档的对应章节）：


1. **Rust 沙箱的绕过测试**：未实际构造 `wget`/`python -c` 等绕过用例验证
   `contains` 检查的失效——**这是 `[INFERENCE]`**，依据是字符串匹配的性质。
2. **Node 的 spawn 上限**：未做高并发基准（数百并行命令）验证 Node 是否会成为瓶颈。
   **即「Rust 无性能收益」这一条，我证明的是「当前实现无收益」，不是「Rust 永远无收益」。**
3. **Bun `--compile` 在本项目的可行性**：未实测。Claude Code 的用法是**公开事实**，
   但我们的代码是否 Bun-compatible（`node:` 内建、动态 import 形态）未验证。
4. **codex / oh-my-pi 的实测运行**：只做静态清点与文件阅读，未跑它们的构建。
5. **`ossinsight.io` 那篇文章**：数字不可核实，**已明确不采信**，仅记录该事实。

---



1. ~~`spawn(rg)` 的完整改动面~~ → **§7.1 已完成并实测**。
2. ~~`rg` 缺失时的回退行为~~ → **§7.1 已实测**（返回相同行数，耗时与修复前一致）。
3. **Bun 编译产物的完整功能面**：测了 `--version`、一次 bash 工具调用、一次 `grep`（走 rg）。
   **交互式 TUI、Playwright、MCP、`/report` 仍未在编译产物中测过。**
4. **95MB 产物在真实分发场景的接受度**：未评估下载/更新成本。
5. **`seccomp` 沙箱的实际收益**：未量化——因为没有需求证据，也没有对照实现可测。
6. **大仓库（10× / 100×）下的表现**：数据来自 28.9MB / 2,830 文件的单仓。
   `rg` 路径已不再线性于文件数（并行遍历），但**未在大仓库实测**。
7. **`rg` 版本差异**：实测环境是 `rg 15.1.0`；本机该版本**没有 `--files-from`**
   （曾尝试「把我们的文件列表喂给 rg」这一更保守的方案，因该标志缺失而放弃）。
   更早的 `rg` 是否缺其它标志**未测**。
## 8. 验证纪律执行情况


| 要求 | 执行情况 |
|---|---|
| 每条发现附 `file:line` | ✅ 全部 |
| 缺失类结论附检索命令 + 结果 | ✅ 全部 |
| 子代理并发上限 5 | ✅ 全程未超过 5 |
| 子代理回报**必须经主代理逐条核验** | ✅ 见 §3.7（推翻 2 项、更正 1 项） |
| **零代码改动** | ✅ `git status` 无源码改动 |
| 头条数字由主代理独立重算 | ✅ 可达性/死簇/seam 全部自写脚本 |

### 8.1 本轮实机执行记录（不是静态分析）

| 验证 | 手段 | 结果 |
|---|---|---|
| `daemonEnabled` 默认值 | `HOME=/tmp/fresh` 无配置启动 | `true` → bash 工具**失败** |
| cargo 存在时 daemon 可用 | 同调用加回 `PATH` | 成功，127ms，`rust-daemon` |
| `cheers.json` 不生效 | 真实 CLI 首屏 | 报 `max-turns=15`，文件写 `30` |
| 目录刷新抹掉 compat | 直接调用 `mergeProviders` + `resolveRequestShape` | 前后差异已列（§1.3） |
| 编辑唯一性 | 直接调用 `replaceInContent` | `success: true`，只改首处 |
| JSON 事件流 | `--print --json` | 7 条合法 JSONL，含 `schemaVersion` |

---


## 9. 建议的下一步


1. **先修三项 P0**（T1/T2/T3）——它们是「开箱即坏 / 静默失效 / 静默回滚」，
   与「新能力」不同，**不需要等裁决就能确认是缺陷**。
2. **T1 的具体形态需裁决**：默认值改 `false`，还是 cargo 缺失时**落回本地**。
   本文件推荐**后者**（同时覆盖冷编译超时等同类情形）。
3. **T16（死代码）需明示授权**：`plan.md` §2.1 的「可达性不授权删除」是本仓库的
   **既有硬规则**，本轮不越过它。若授权，建议按 §3.1 的**连通簇**为单元，
   并逐簇过 §2.2 的六项检查。
4. **`OURS-ONLY` / 平手**按维护者指示**暂缓**。
5. 本文件产出的分类**不写入 01–07**；若后续施工，新建 `phase-11-decisions.md`。
