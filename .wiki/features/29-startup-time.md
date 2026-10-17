---
title: "启动耗时：tsx 转译、分发形态、首帧边界与会话扫描实测"
category: article
sources: [repo-audit-2026-10-15, packages/ts-shell/src/entrypoints/cli.tsx, packages/ts-shell/src/cli/bootstrap/cliProcessRunner.ts, packages/ts-shell/src/observability/startupTiming.ts, package.json, packages/ts-shell/package.json, scripts/build-cli-bin.mjs, oh-my-pi/packages/coding-agent/package.json, pi/packages/coding-agent/package.json, 16-input-slash-startup-context.md]
created: 2026-10-15
updated: 2026-10-17
tags: [features, startup, performance, build, gap-analysis]
summary: "历史样本：tsx --version 3.95s/编译1.04s；默认启动同步扫描会话，主图静态导入仍在--version短路前。空HOME对照约880ms含配置等混杂因素，不是确定扫描收益。用户已选npm start使用通过新鲜度校验的构建产物；首帧、可输入与运行时就绪分别量测，保留恢复语义与异步结果失效控制。"
confidence: high
---

# 启动耗时

源码基线 `0d30d589`。数值均沿用2026-10-15/16历史研究记录，本机WSL2/Node v24.15.0；2026-10-17仅源码复核与研究修订，没有新计时/构建/PTY实验，历史数值未在本轮复现。参考旧快照pi `4a5d3729`、omp `c2cb79e4`、codex `4210c08d`；当前pi/omp HEAD分别`8efd314fa`/`eb74cf84`，关键启动边界用旧快照回核。旧数值没有在本文绑定可复跑原始工件，不能据此宣称优化收益已验收。

## 1. 实测数据

### 1.1 端到端墙钟（`--version`，最短路径）

| 命令 | 三次实测 | 中位 |
|---|---|---|
| `npm start -- --version` | 4.03 / 3.95 / 3.88 s | **3.95 s** |
| `node dist/cli.js --version` | 1.11 / 1.04 / 1.01 s | **1.04 s** |

`--version`在解析后、root/bootstrap前返回，但整个静态模块图已求值。两条命令的约2.9秒差值还含npm父启动器、tsx加载/转译、缓存和环境等差异，不能精确全部归入转译，亦不能称不含任何业务求值。

### 1.2 `--help` 路径

| 命令 | 实测 |
|---|---|
| `npm start -- --help` | 5.31 s |
| `tsx src/entrypoints/cli.tsx --help` | 5.52 / 5.93 s |
| `node dist/cli.js --help` | 3.88 s |

`--help` 比 `--version` 多约 1.3–2.9 秒，因为它在返回前要构造启动表面（见 §2）。

### 1.3 内部相位（`CHEERS_TIMING=1` + `/timings`）

tsx 路径：

```text
modules loaded: 3088.6ms
arguments parsed: 72.3ms
runtime bootstrapped: 843.6ms
stdin captured: 8.0ms
startup surface prepared: 1.8ms
total: 4014.3ms
```

编译产物路径：

```text
modules loaded: 971.6ms
arguments parsed: 78.3ms
runtime bootstrapped: 829.0ms
stdin captured: 11.5ms
startup surface prepared: 3.3ms
total: 1893.6ms
```

对照：`node -e "1"` 为 0.02 s（Node 自身启动底线）；`node -e "import('…/dist/cli.js')"` 为 0.82 s。

**关键结论**：

| 相位 | tsx | 编译 | 差 |
|---|---|---|---|
| modules loaded | 3,089 ms | 972 ms | **−2,117 ms** |
| arguments parsed | 72 ms | 78 ms | ≈0 |
| runtime bootstrapped | 844 ms | 829 ms | ≈0 |

这组样本中主要差异在模块加载，bootstrap约830ms；有限样本不能证明唯一原因。内部`time()`以运行时单调原点排除父启动器时间（[startupTiming.ts:20-27](../../packages/ts-shell/src/observability/startupTiming.ts#L20)），因此内部phase差值与`npm start`端到端差值是不同口径。

## 2. 模块加载成本的构成

### 2.1 规模

- 源文件：**2,472** 个 `.ts`/`.tsx`。
- 编译产物：**1,897** 个 `.js`。
- `cliProcessRunner.ts` 单文件 45 条静态 import。

`node --cpu-prof` 对编译产物加载的采样（前 8 项，单位 ms）：

```text
  257.9  (self, no url)
  186.4  node:internal/modules/esm/utils
  153.3  node:internal/modules/esm/get_format
   50.1  node:internal/modules/esm/loader
   37.7  node:internal/modules/package_json_reader
   36.4  node_modules/ajv/dist/compile/codegen/index.js
   26.4  node:path
   18.1  node_modules/ajv/dist/compile/codegen/code.js
```

**观察**：编译产物下大部分时间在 ESM loader 自身（`utils` + `get_format` + `loader` + `package_json_reader` ≈ 428 ms），这是**模块数量**的代价；`ajv` 是最大的单个第三方叶子（约 54 ms），因为配置 schema 在模块求值时就 `new Ajv()` 并编译全部校验器（[fields.ts:19-21](../../packages/ts-shell/src/config/fields.ts#L19)）。

### 2.2 tsx 的额外成本

`tsx`对实际导入的源码转译。仓库存在2,472个源文件不证明全部进入启动图；样本中的约+2.1秒只能归于两种加载方式的整体差异，需模块图/缓存对照才能细分。

根 `package.json` 的 `start` 转发到 workspace 的 `tsx src/entrypoints/cli.tsx`（[packages/ts-shell/package.json:14](../../packages/ts-shell/package.json#L14)），`dev` 用 `tsx watch`。

### 2.3 已存在的编译路径

- `npm run build:ts` → `tsc -p tsconfig.build.json`，然后 `scripts/build-cli-bin.mjs` 写 `dist/cli.js`（内容只有一行 re-export）。
- `npm run build:exe` → `scripts/build-cli-executable.mjs`，单文件可执行。

即**编译路径已经存在且可用**，只是 `start` 没走它。

## 3. 参考做法

| 项目 | 入口 | 形态 |
|---|---|---|
| pi | `"bin": { "pi": "dist/bundle/cli.js" }`，另有 `./rpc-entry` → `dist/bundle/rpc-entry.js` | **bundle** |
| oh-my-pi | `"main": "./src/index.ts"`，`"build": "bun scripts/build-binary.ts"` | **二进制**（bun 编译） |
| codex | `codex-rs/cli` | **原生 Rust 二进制** |

三家**没有一家**以「按需转译源码」作为产品启动方式。pi 的 `files` 里包含 `dist`、`docs`、`examples`、`schemas`，说明分发物是构建产物。

## 4. 其他启动期工作

- **更新检查**：`checkForUpdate` 被 `void` 调用且**不等待**，明确注释「first frame is never behind a network call」（[cliProcessRunner.ts:204-215](../../packages/ts-shell/src/cli/bootstrap/cliProcessRunner.ts#L204)）。**不阻塞首帧**，设计正确。
- **崩溃记录器**：`installCrashRecorder` 在入口最先执行（[cli.tsx:14](../../packages/ts-shell/src/entrypoints/cli.tsx#L14)），是同步少量工作。
- **主题/图示模式**：启动时解析并应用（`applyStartupTheme`、`setDiagramMode`），需在首帧前完成。
- **运行时 bootstrap**：约 830 ms。本轮把它拆开了（见 §4.1）。

### 4.1 `runtime bootstrapped` 的实测分解（新发现）

`runtime bootstrapped` 在 tsx 与编译产物下**都是约 830 ms**，因此它是真实业务成本而非启动机制。逐项实测（编译产物，本机 119 个会话目录 / 56 个真实会话）：

| 步骤 | 实测 | 位置 |
|---|---|---|
| `getWorkflowGitContext`（git 探测） | 51 ms | [cliBootstrapContext.ts:66](../../packages/ts-shell/src/cli/bootstrap/cliBootstrapContext.ts#L66) |
| `getRuntimeConfig` | 22 ms（模块 import 另 130 ms） | [cliBootstrapContext.ts:68](../../packages/ts-shell/src/cli/bootstrap/cliBootstrapContext.ts#L68) |
| `SessionManager` 构造 | 1 ms | [cliBootstrapContext.ts:88](../../packages/ts-shell/src/cli/bootstrap/cliBootstrapContext.ts#L88) |
| `listSessions()` | 137–144 ms → 219 条 | `SessionManager.ts` |
| `listRealSessions()` | 137 ms → 56 条 | `SessionManager.ts:237` |
| `describeSessionReentry` × 56 | **470 ms** | `SessionManager.ts:239` |
| `getReentryCandidate`（合计） | **633–728 ms**（三次） | [cliBootstrapContext.ts:102-106](../../packages/ts-shell/src/cli/bootstrap/cliBootstrapContext.ts#L102) |

**历史分解结论**：该样本`getReentryCandidate`约占bootstrap的76–88%。源码确认它可经`getSuggestedRecoverySession`和fallback两次进入摘要构建；结果既用于Recovery hint，也作为交互、print/replay恢复的`fallbackSessionId`（[cliProcessRunner.ts:283](../../packages/ts-shell/src/cli/bootstrap/cliProcessRunner.ts#L283)）。不是只有横幅这一消费者。

当前路径为每个候选构建摘要，存在随会话数/内容增长的I/O与解析成本；仅一个规模样本不能证明墙钟线性关系，也不能断言它是唯一随使用增长的项目。它确实位于首帧前，独立于tsx。

### 4.2 已排除的候选

本轮一个子代理提出「`--version`/`--help` 未在早期短路」。**核实为误**：

- `--version` 在 `parseCliArgs` 之后、`createCliRootContext` **之前**返回（[cliProcessRunner.ts:87-90](../../packages/ts-shell/src/cli/bootstrap/cliProcessRunner.ts#L87)）。
- `--doctor` 也在 root context 之后立即返回（同文件 100-103 行）。

历史`--version`约1.01–1.11s与模块阶段量级一致，说明函数内短路生效；但「把轻量argv入口与重runtime静态图隔开」仍是成立的优化候选，不能因已有return就否决。

## 5. 优化候选（按证据强度排序）

| # | 候选 | 证据 | 预期收益 | 风险 |
|---|---|---|---|---|
| P-01 | `start`走经新鲜度校验的构建产物，保留源码开发模式 | 用户2026-10-17已裁决；旧样本差约2.9s | 待同环境新产物基准 | 缺失/过期明确要求build，不能静默运行旧代码或启动时偷偷构建 |
| P-02 | 将建议性reentry扫描移出首帧，保持显式恢复按需 | §4.1历史分解633–728ms | 非承诺值，需隔离实验 | 不能只按最近N剪裁而改变恢复排序/信任边界 |
| P-03 | 比较现有编译/单文件产物与bundle | §3参考形态；`build:exe`已存在 | 未测，不承诺接近1s | 先复用既有构建，新增bundler需独立证据 |
| P-04 | 把 `ajv` 的 schema 编译延迟到首次配置读取 | §2.1 `ajv` 约 54 ms 且在最热路径 | 约 −50 ms | 需确认无模块求值期校验 |
| P-05 | 减少 `cliProcessRunner.ts` 的静态 import（45 条） | §2.1 模块数主导加载 | 未量化 | 需确认无循环/顺序依赖 |
| P-06 | 保持更新检查异步 | 已实现 | — | — |

**判定**：P-01解决开发启动方式与产品入口混用，P-02/P-05处理源码可确认的同步扫描与静态加载边界。历史数据支持优先研究，不能替用户机器归因或承诺固定节省；换编译入口不会自动消除会话扫描。

## 6. 待定决策点

| # | 决策 | 选项 |
|---|---|---|
| S-01 | `start`入口 | **用户已裁决**：使用经新鲜度校验构建产物，缺失/过期要求build；保留源码开发模式 |
| S-02 | 分发形态 | 技术建议：先测现有tsc/单文件可执行，不为参考形态立即加新bundler |
| S-03 | 开发循环如何保持 | `dev` 已用 `tsx watch`，需确认足够 |
| S-04 | 是否做 P-04/P-05 | 需先量化 |
| S-05 | `getReentryCandidate`处置 | 技术建议：建议性hint异步或按需，显式resume仍完整核验；不擅自移除恢复能力 |
| S-06 | 会话索引 | 技术建议：优先有界异步扫描；索引只是可重建投影，非信任/恢复authority |

## 7. 未验证项

- 未测 `build:exe` 产物的实际启动时间（未运行构建）。
- 未在用户机器（可能是 Windows Terminal / 不同 Node 版本）复测。
- 未量化 P-04/P-05 的模块裁剪收益。
- 未核对 tsx 是否有可复用的持久转译缓存（tsx 4.21.0 未观察到缓存目录）。
- `getReentryCandidate` 的 728 ms 中，`listSessions` 与 `describeSessionReentry` 的分配已实测，但 `describeSessionReentry` 内部的 I/O 与解析占比未进一步拆分。
- 子代理报告的「Bun 编译产物 0.2–0.5 s」未在本轮复现（未运行 `build:exe`）。

---

## 附：启动耗时深挖：分发形态、首帧边界与会话扫描

只读研究。未修改产品源码或构建脚本。本文是 本文「启动耗时」 的深挖续篇，回答「启动慢的根因是什么、其他项目如何解决」。

### 0. 结论先行

[31 §5](#5-优化候选按证据强度排序) 列的 P-01（走编译产物）**是正确的一半**，但漏掉了更重要的一半：

| # | 根因 | 量级 | 参考侧是否也这样 |
|---|---|---|---|
| **A** | 开发态tsx与编译入口不同 | 历史端到端差约2.9s，非纯转译分解 | 产品分发方式不同（见§2） |
| **B** | 无显式session时同步扫描历史候选 | 历史单规模分解633–728ms；规模曲线未测 | pi/omp默认新会话分支不做同类全量枚举（见§3） |

**B是结构性候选**：换启动方式不会移除同步扫描。已取证的是pi/omp默认新会话分支不做该类历史枚举，不能扩展为三家所有启动路径均无任何会话I/O。

### 1. 29 号已验证的数字（沿用，不重测）

```text
npm start (tsx) --version        3.88–4.03 s
node dist/cli.js --version       1.01–1.11 s
modules loaded                   3,089 ms (tsx)  vs   972 ms (compiled)
runtime bootstrapped             844 ms (tsx)     vs   829 ms (compiled)
  └ getReentryCandidate          633–728 ms  (76–88% of it)
     └ describeSessionReentry ×56    470 ms
     └ listSessions()                137–144 ms
```

### 2. 三家参考的分发形态（实测）

| 项目 | `bin` 指向 | 构建工具 | 产物 | 证据 |
|---|---|---|---|---|
| **pi** | `dist/bundle/cli.js` | **esbuild** | 单文件 bundle | [package.json](https://github.com/earendil-works/pi/blob/4a5d37291531ad48b8e536c892557877d219463c/packages/coding-agent/package.json) |
| **oh-my-pi** | `src/cli.ts`（源码）；发布走 `bun scripts/build-binary.ts` | **bun `--compile`** | 单二进制（实测 266 MB ELF） | [build-binary.ts](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/scripts/build-binary.ts) |
| **codex** | `codex-cli/bin/codex.js` → 原生 | **Rust / Bazel + Cargo** | 原生二进制 | `codex-rs/cli/Cargo.toml` |

#### 2.1 pi 的 bundle 配置（逐项）

[build-coding-agent-bundle.mjs:79-104](https://github.com/earendil-works/pi/blob/4a5d37291531ad48b8e536c892557877d219463c/scripts/build-coding-agent-bundle.mjs#L79)：

```js
bundle: true,
define: { PI_BUNDLED_NODE: "true" },
external: ["@silvia-odwyer/photon-node"],   // 唯一 external
format: "esm",
legalComments: "none",
minifySyntax: true,
minifyWhitespace: true,
platform: "node",
target: "node22.19",
sourcemap: false,
```

**注意两点**：

1. **唯一 external 是一个原生图像库**（photon-node）——因为原生模块不能 bundle。
2. **有一条会失败的校验**（[同文件 106-120](https://github.com/earendil-works/pi/blob/4a5d37291531ad48b8e536c892557877d219463c/scripts/build-coding-agent-bundle.mjs#L106)）：

```js
function validateExternalImports(metafiles) {
  const unexpected = new Set();
  for (const metafile of metafiles)
    for (const input of Object.values(metafile.inputs))
      for (const imported of input.imports)
        if (!imported.external || isBuiltin(imported.path) || allowedExternalPackages.has(imported.path)) continue;
        else unexpected.add(imported.path);
  if (unexpected.size > 0)
    throw new Error(`Bundle left unexpected external imports: ${Array.from(unexpected).sort().join(", ")}`);
}
```

即 **bundle 一旦意外留下未声明的 external，构建直接失败**。这是「单文件产物」的强制保证，而不是希望。

3. **pi 还会把 jiti 换成惰性 require**（[同文件 88-93](https://github.com/earendil-works/pi/blob/4a5d37291531ad48b8e536c892557877d219463c/scripts/build-coding-agent-bundle.mjs#L88) 注释）：Node 包用「同步惰性 require」替换 `jiti/static`，使 Babel **只在缓存未命中需要转换时才加载**。

#### 2.2 pi 的动态导入很少（反直觉）

实测 `packages/coding-agent/src` 全目录只有 **15** 处 `import(`，其中真正的惰性加载只有 4 个 `.lazy.ts` 文件：

```text
extensions/mcp/cli.lazy.ts          → import("./cli.ts")
extensions/mcp/runtime.lazy.ts      → import("./runtime.ts")
extensions/codemode/execute.lazy.ts → import("./execute.ts")
modes/interactive/components/easter-egg-3d.lazy.ts
```

另有 `utils/photon.ts:128`（原生图像库）、`utils/syntax-highlight.ts:59`（highlight.js）、`core/extensions/loader.ts`（jiti）。

**结论**：pi采用bundle并减少运行时文件解析，这是可确认设计；其启动时间未测，动态import数量也不能证明各机制的性能贡献。bundle仍有解析/求值成本，不能称其消除了全部模块成本。

#### 2.3 oh-my-pi 的首帧边界（明确写在代码里）

omp 的 `commands/launch.ts:9-13` 有一句**显式的启动边界注释**：

```ts
/** Load the session/runtime graph only after the launch command has accepted its argv. */
async function loadRunRootCommand() {
	// Startup boundary: a static import makes command construction evaluate the
	// provider, browser-prelude, codec, and interactive-mode graphs.
	return (await import("../main")).runRootCommand;
}
```

即：`--version`/`--help` 这类命令**根本不加载** provider/browser/codec/interactive 图。omp 的 `src/cli.ts` 有 **37** 处 `await import(`，包括：

| 行 | 被推迟的子系统 |
|---|---|
| 97 | `@oh-my-pi/pi-utils/process-name` |
| 104 | `@oh-my-pi/pi-ai/utils/proxy` |
| 139–152 | stats / tiny-title / stt / tts / mnemopi / activity / js-eval / daemon-broker / lsp-mux / ida / blob-broker / terminal-output / text-predict 的 **smoke test** |
| 171 | computer supervisor |
| 213 | stats sync-worker |
| 228 | browser tab-worker |

**smoke test 全是惰性的**——只在实际使用该 worker 时启动。

### 3. 决定性差异：默认路径是否扫描会话

#### 3.1 pi：默认路径**不扫**

旧快照`main.ts`中相关历史解析/列表操作位于以下显式分支：

| 调用点 | 条件 |
|---|---|
| `main.ts:377` `resolveSessionPath(parsed.fork, …)` | 仅 `--fork` |
| `main.ts:392` `resolveSessionPath(parsed.session, …)` | 仅 `--session` |
| `main.ts:418` `SessionManager.list(...)` | 仅 `--resume`（在 `selectSession` 回调内） |
| `main.ts:433` `SessionManager.continueRecent(...)` | 仅 `--continue` |

**默认启动（无这些旗标）从不调用它们**。pi 因此不为「上次在哪个会话」付任何启动成本。

**当它确实要扫时**，pi 的做法（[session-manager.ts:924-939](https://github.com/earendil-works/pi/blob/4a5d37291531ad48b8e536c892557877d219463c/packages/coding-agent/src/core/session-manager.ts#L924)）：

```ts
const MAX_CONCURRENT_SESSION_INFO_LOADS = 10;             // 891 行
const CURRENT_SESSION_LIST_PUBLISH_INTERVAL = 10;         // 893 行
// 10 路并发 + 每 10 个发布一次部分结果（onProgress）
```

即 **10 路并发读 + 渐进发布**，用户看到列表在填充而不是等全部完成。

#### 3.2 oh-my-pi：默认路径**不扫**，且有两级优化

`main.ts` 只在 `--fork`（1229 行）与 `--session`（1269 行）调用 `resolveResumableSession`。

**当它扫时，代码里有两条独立优化**（下述两条的调用链已验证到函数级；其中 `getRecentSessions` 无生产调用者，见标注）：

**优化 1：SQLite 标题索引**（[session-index.ts:1-21](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/session/session-index.ts#L1) + [session-listing.ts:877-912](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/session/session-listing.ts#L877)）：

`getRecentSessions(sessionDir, limit = 4)` 的注释原文：

> Get recent sessions for display in the welcome screen. **Deliberately avoids `scanSessionDir`'s full-directory content scan (multi-hundred-ms with thousands of sessions)**: lists files, sorts by mtime, and resolves names for the newest `limit` files from the history.db title index. Files without an indexed title fall back to a per-file header scan whose title — when present — is **backfilled into the index so the next launch skips the read**.

即「**stat 全部 + 查表拿标题 + 未命中才扫一次并回填索引**」三段式。

**⚠️ 但必须指出**：`getRecentSessions` 在 omp 仓库内**没有任何生产调用者**——`grep` 全仓只有它自己的定义与 `test/session/recent-sessions-title-index.test.ts`（它从 `index.ts` 的 `export *` 可见，可能供外部消费者使用）。因此**不能断言 omp 的欢迎页当前就走这条路**。可断言的是：**omp 写了并测试了这套机制**，且其默认启动路径（§3.2 首段）确实不扫会话。

**优化 2：只 stat 全部、只扫描到 `limit` 为止**（[session-listing.ts:798-812](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/session/session-listing.ts#L798)；调用者是 `/archive`，见 [archive.ts:105,127](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/archive/archive.ts#L105)）：

```ts
/**
 * Newest non-empty sessions by mtime, with lifecycle status. Stats every
 * candidate file but content-scans only until `limit` sessions are found, so
 * it stays fast across tens of thousands of sessions where
 * listAllSessions scans everything.
 */
export async function listRecentSessions(query: RecentSessionsQuery): Promise<SessionInfo[]> {
	const files = query.sessionDir
		? await newestSessionFiles(query.sessionDir, "*.jsonl", storage)
		: await newestSessionFiles(query.sessionsRoot ?? getSessionsDir(), "*/*.jsonl", storage);
	for (const { file, stat } of files) {
		if (sessions.length >= query.limit) break;    // ← 达标即停
		const info = await scanSessionFile(file, storage, true, stat);
		if (info && !isEmptySession(info)) sessions.push(info);
	}
```

omp把metadata与content工作分开：仍需枚举并stat所有候选、排序，再按需读内容；stat在网络盘/WSL挂载盘并不保证廉价，总成本也不是近常数。另有LRU 4096及负面缓存；Cheers采用时须有身份/mtime/size等失效策略，不能缓存权限authority。

**⚠️ 范围限定**：优化 1 与优化 2 的服务对象**不是启动路径**——优化 1 的 `getRecentSessions` 无生产调用者，优化 2 的 `listRecentSessions` 由 `/archive` 命令调用。**它们证明的是「omp 知道并解决了这个问题」，而不是「omp 在启动时用了它们」。** omp 启动之所以不受影响，靠的是 §3.2 首段那个更简单的事实：**默认路径根本不扫会话**。

#### 3.3 Cheers：默认路径**无条件**扫，且每个会话做全量加载

[cliBootstrapContext.ts:100-107](../../packages/ts-shell/src/cli/bootstrap/cliBootstrapContext.ts#L100)：

```ts
const recoveryCandidate = !input.options.sessionId
  ? sessionManager.getReentryCandidate({ preferredProjectRoot: input.rootContext.workspaceRoot })
  : null;
```

条件是没有显式sessionId；该扫描位于print路由和完整交互界面前，因此不限交互启动。`--session-id`等显式入口绕过它，`--version`在更早处返回。

`getReentryCandidate` → `listReentrySummaries` → 对**每个**真实会话调 `describeSessionReentry`（[SessionManager.ts:232-243](../../packages/ts-shell/src/session/SessionManager.ts#L232)）：

```ts
const sessions = input?.includeUntouched === true ? this.listSessions() : this.listRealSessions();
return projectSortedSessionReentrySummaries({
  summaries: sessions.map((session) => this.describeSessionReentry(session.id)),
```

而 `describeSessionReentry` 每会话做四件事（[SessionManager.ts:340-352](../../packages/ts-shell/src/session/SessionManager.ts#L340)）：

```ts
const session = this.host.store.load(sessionId);              // 1. 全量加载会话记录
const trustBoundary = this.evaluateRecoveryTrustBoundary(session);  // 2. 读 state snapshot + transcript
const recoverySnapshot = this.getRecoverySnapshot(sessionId);        // 3. 读恢复快照
const continuitySnapshot = this.buildContinuitySnapshot(sessionId);  // 4. 读连续性快照
```

**且是串行的**（`sessions.map`，无并发、无缓存）。实测 119 个会话目录 / 56 个真实会话 → 470 ms。

**`limit`不能避免前置工作**：bootstrap并未直接传limit；`getReentryCandidate`先尝试suggested recovery，再在fallback调用`listReentrySummaries({limit:20})`（[SessionManager.ts:254-278](../../packages/ts-shell/src/session/SessionManager.ts#L254)），存在重复枚举/摘要机会。limit最终在全部摘要构建完后切片（[sessionRecoverySelection.ts:15-24](../../packages/ts-shell/src/session/recovery/sessionRecoverySelection.ts#L15)）：

```ts
const scored = input.summaries.map((summary) => ({ summary, score: scoreSessionReentrySummary({…}) }));
scored.sort((left, right) => right.score - left.score);
const sorted = scored.map((item) => item.summary);
if (!input.limit || input.limit <= 0) return sorted;
return sorted.slice(0, input.limit);   // ← 切片在 map 之后
```

即 `limit: 3` 仍会为**每个**会话构建完整摘要——**没有提前终止**。对比 omp 的 `if (sessions.length >= query.limit) break;`（§3.2 优化 2）在循环**内部**判断。

**规模对比**：

| 维度 | Cheers | pi | oh-my-pi |
|---|---|---|---|
| 默认启动扫会话 | **是（无条件）** | 否 | 否 |
| 并发 | **1（串行）** | 10 路 | — |
| 提前终止 | **无** | 按需 | **有（`limit` 即停）** |
| 结果缓存 | **无** | 无（靠不扫） | **LRU 4096 + SQLite 标题索引** |
| 每会话读取量 | **会话 + state + 恢复快照 + 连续性快照（4 份）** | 整文件流式（仅列名/计数） | stat 为主，内容按需 |
| 渐进发布 | 无 | **有（每 10 个）** | — |
| 随会话数增长 | 全量候选读取，墙钟曲线未测 | 默认避免该枚举，列表按需 | stat/排序仍随N增长，索引只减少内容读取 |

### 4. Cheers 可做的六件事（结构候选）

| # | 措施 | 依据 | 预期收益 | 风险 |
|---|---|---|---|---|
| **S-01** | `start`采用通过新鲜度校验构建产物 | 用户已裁决；不自动postinstall/启动构建 | 同环境重新测量 | 缺失/过期明确build提示 |
| **S-02** | 建议性reentry提示移出首帧 | §3.3同步扫描 | 尚未验证固定收益 | 保持恢复语义与异步失效约束 |
| **S-03** | 分开metadata与按需内容扫描 | §3.2优化2 | 内容读取减少，仍有O(N)stat/排序 | 不能按mtime前N代替完整恢复排序 |
| **S-04** | 引入标题索引（等价 omp 的 `session_titles`） | §3.2 优化 1 | 面板列表不再 content-scan | 需存储层改动 |
| **S-05** | 仿 pi 的 bundle 校验：构建期断言无意外 external | §2.1 | 保证单文件产物 | 需引入 bundler |
| **S-06** | 首帧前不加载 provider/browser/codec 图（omp 的显式启动边界） | §2.3 | 缩短 `--version`/`--help` 路径 | 需梳理静态 import |

**S-02修正的是同步启动边界**。恢复候选还用于`/resume`/`/continue`的fallback，不仅是一条横幅；不能把它当无语义成本的纯删除。

### 5. 与 29 号的差异

| 29 号写的 | 本文补充 |
|---|---|
| P-01 走编译产物（−2.9 s） | 确认（§2），并补充 pi 的 bundle 校验机制 |
| P-02 延迟`getReentryCandidate` | 结构候选确认；固定−0.6s未验收，恢复fallback也须保留 |
| 未提并发/提前终止/索引 | 新增 S-03/S-04（§3.2） |
| 「三家都分发 bundle 或二进制」 | 精确到工具：pi=esbuild、omp=bun `--compile`、codex=Rust（§2） |
| 未提 omp 的启动边界注释 | 新增 S-06（§2.3） |

### 6. 待定决策点

| # | 决策 | 选项 |
|---|---|---|
| T-01 | `start`入口 | 归并正文S-01，用户已裁决新鲜度校验构建产物 |
| T-02 | bundler | 归并正文S-02，先测现有产物再决定 |
| T-03 | 是否引入 bundle 的 external 校验 | (a) 引入；(b) 不做 |
| T-04 | `getReentryCandidate`处置 | 归并正文S-05，建议性扫描不阻塞，保留显式恢复合同 |
| T-05 | 是否引入会话标题索引 | (a) 引入；(b) 只做 stat/scan 分离 |
| T-06 | 是否引入 10 路并发 + 渐进发布 | (a) 引入；(b) 不做 |

### 7. 未验证项

- **pi 的 `dist/` 未构建**（工作区无 `dist` 目录），因此**未实测 pi 的启动时间**，也未测得 bundle 的实际体积。§2.1 的配置来自源码，不是运行观测。
- 未实测 omp 二进制的启动时间（266 MB ELF，未运行）。
- 未实测 codex 二进制体积（`codex-rs` 无 `target/`，未构建）。
- **`pi 的 bundle 是否真的消除了模块解析成本`属推断**——依据是 esbuild 单文件 + `bundle: true`，未做对照实验。
- 未验证 Cheers 引入标题索引后的实际收益（未实现）。
- 未核对 omp 的 `listRecentSessions` 在真实数千会话目录下的耗时。
- 未查证 pi 是否有等价的「reentry/recovery」概念（若没有，则 Cheers 的 633 ms 是**功能**成本而非纯浪费——但即便如此也不该在首帧路径上）。

### 8. 子代理失败说明

本轮派出的 `StartupDeep` 子代理在 18m58s 后因 `content_filter` 终止；重新派出的 `StartupPi` 与 `ArgAuditFull` 均以 **HTTP 402「当前账户暂无生效套餐」** 失败（账户计费状态，非任务问题）。本文内容由主代理直接完成，未使用子代理产出。


---

## 附：启动实测与参考项目对照（2026-10-16 实机）

只读研究。未修改产品源码。本文补 本文「启动耗时深挖：分发形态、首帧边界与会话扫描」 §7 声明未测的部分，所有数字来自本机实际运行的命令。

### 1. 四侧 `--version` 实测（各 3 次）

| 侧 | 命令 | 三次实测 | 中位 |
|---|---|---|---|
| **oh-my-pi** | `omp --version`（266 MB ELF） | 0.13 / 0.02 / 0.01 s | **≈0.02 s** |
| **codex** | `codex --version`（Node shim → 原生） | 0.14 / 0.06 / 0.05 s | **≈0.06 s** |
| **Cheers（编译）** | `node dist/cli.js --version` | 1.78 / 1.34 / 1.02 s | **≈1.34 s** |
| **pi** | — | **未测量** | — |

**pi 未测量的原因**（不是猜测，是核对过的）：`/home/wang/projects/pi/packages/coding-agent/dist` **不存在**（未构建），且工作区无 `node_modules`，因此 `scripts/build-coding-agent-bundle.mjs`（esbuild）无法运行。**没有编造数字。**

**对照结论**：omp 与 codex 的 `--version` 在 **10–60 ms** 量级；Cheers 编译产物在 **1,000–1,800 ms** 量级，差 **约 20–90 倍**。注意 omp/codex 是原生二进制，与 Cheers 的 Node 启动下限（`node -e "1"` ≈20 ms）不可直接等同——但 Cheers **自身的**模块图加载（§3）就占了大头。

### 2. 会话扫描的真实成本（隔离实测）

历史方法：用空HOME与现有HOME分别测`runtime bootstrapped`。**这不是仅会话数量变化的受控实验**：HOME也可能改变配置、缓存、skills、认证发现与目录状态；差值只能视为HOME环境整体差异，不能直接等于扫描成本。本轮不读取或复用真实provider配置。

| 条件 | `runtime bootstrapped` 三次 |
|---|---|
| 现有 HOME（119 会话目录） | **2,048.1 / 946.0 / 987.6 ms** |
| 空 HOME（0 会话） | **65.4 / 65.0 / 75.6 ms** |

选取946与65所得差约881ms；按三次中位数987.6与65.4则约922.2ms。只挑「稳定值」再标93%归因会夸大确定性；原分布应保留，扫描独立收益未被该对照证明。

（第一次 2,048 ms 是冷启动抖动；后两次 946/988 ms 稳定。）

该差异与源码中的同步扫描相容，但不足以证明0.9秒全部归因或随N线性增长。应在相同隔离配置/构建/目录下只改变合成会话数量与内容，并在实际owner边界计时。

#### 2.1 每会话读取的文件数（实测）

`~/.cheers/sessions/<id>/` 实际内容：

```text
metadata.json    377 B
state.json       542 B
transcript.jsonl 5.9 K
```

`readSessionRecordSnapshot` 依次读这三个（[sessionStore.ts:111-122](../../packages/ts-shell/src/session/store/sessionStore.ts#L111)）：

```ts
if (!fs.existsSync(input.layout.sessionDir) || !fs.existsSync(input.layout.metadataPath) || !fs.existsSync(input.layout.transcriptPath)) {
  throw new Error(`Session ${input.sessionId} not found`);
}
const metadata = readSessionMetadataRecord(input.layout.metadataPath);
const state = readStateSnapshotRequired(input.layout.statePath);
// … 以及 transcript
```

即 **3 次 `existsSync` + 3 次读**，每个会话至少 **6 次文件系统调用**。56 个会话 ≈ **336 次**。加上 `describeSessionReentry` 还会读恢复快照与连续性快照（[SessionManager.ts:340-352](../../packages/ts-shell/src/session/SessionManager.ts#L340)），实际更多。

### 3. `--version` 的短路发生在模块图加载**之后**（实测）

`--version` 的处理位置（[cliProcessRunner.ts:87-90](../../packages/ts-shell/src/cli/bootstrap/cliProcessRunner.ts#L87)）：

```ts
const parsedCliArgs = parseCliArgs(input.args, { cwd: input.launchCwd });
if (parsedCliArgs.ok === false) { … }
if (parsedCliArgs.args.versionRequested) {
  input.writeOutput(versionLabel());
  return;                      // ← 在这里才返回
}
```

**但 `cliProcessRunner.ts` 本身有 45 条静态 import**（[cliProcessRunner.ts:1-45](../../packages/ts-shell/src/cli/bootstrap/cliProcessRunner.ts#L1)），包括 `../runtime/shutdown.js`、`../runtime/jobs.js`、`../runtime/director.js`、`../runtime/extensions.js`、`../../core/shell/approvalTrustPolicy.js` 等整个运行时图。

**实测**：

```text
importing cliProcessRunner.js alone: 1163ms
```

即**仅仅 import 这个模块**（在它执行任何一行逻辑之前）就要 **1,163 ms**。`--version` 的 `return` 省掉了**业务逻辑**，但省不掉**模块求值**。

这与 [48 §2.3](#23-oh-my-pi-的首帧边界明确写在代码里) 的 omp 对照鲜明——omp 把主图放在动态 import 之后：

```ts
/** Load the session/runtime graph only after the launch command has accepted its argv. */
async function loadRunRootCommand() {
	return (await import("../main")).runRootCommand;
}
```

**omp 的 `--version` 路径根本不求值 provider/browser/codec/interactive 图。**

#### 3.1 `ajv` 是否在 `--version` 路径上

`ajv` 由 [fields.ts:19](../../packages/ts-shell/src/config/fields.ts#L19) 在**模块求值期**构造并编译全部 schema：

```ts
const ajv = new Ajv({ allErrors: false, strict: true });
```

而 `fields.ts` 被 `config/runtimeConfig.ts` 引入，后者在 `cliProcessRunner.ts` 的静态图内。因此**在 `--version` 返回之前，`ajv` 已被构造并编译完 schema**——尽管 `--version` 一个配置字段都不读。

（[31 §2.1](#21-规模) 曾用 `--cpu-prof` 测得 `ajv` 约 54 ms 是最热的第三方叶子。它是**可延迟的**。）

### 4. 修正 29 号的一处数字

| 项 | 29 号写 | 本文实测 |
|---|---|---|
| `runtime bootstrapped` | ≈830 ms（tsx 与编译相同） | 编译产物下 **946–988 ms**（119 会话），空 HOME **65 ms** |
| 会话扫描占比 | 历史分步样本76–88% | HOME对照混杂，不能更新为93%因果结论 |

两次样本环境/时点不同，保留差异；不能称HOME对照「隔离更彻底」，也不能在会话数相同的样本间用增长解释差值。

### 5. 三家参考如何避免这笔成本（29 号已查，此处只列结论）

| 侧 | 默认启动是否扫会话 | 依据 |
|---|---|---|
| pi | **否**（仅 `--fork`/`--session`/`--resume`/`--continue`） | [pi main.ts:377,392,418,433](https://github.com/earendil-works/pi/blob/4a5d37291531ad48b8e536c892557877d219463c/packages/coding-agent/src/main.ts#L377) |
| omp | **否**（仅 `--fork`/`--session`/`--continue`） | [omp main.ts:1229,1269,1306,1320](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/main.ts#L1229) |
| Cheers | **是（无条件）** | [cliBootstrapContext.ts:100-107](../../packages/ts-shell/src/cli/bootstrap/cliBootstrapContext.ts#L100) |

### 6. 优化候选（按实测收益排序）

| # | 措施 | 实测依据 | 预期收益 |
|---|---|---|---|
| **S-01** | 建议性`getReentryCandidate`移出首帧 | 源码调用链；HOME差约880ms含混杂 | 收益未隔离验证，不承诺−0.88s |
| **S-02** | 首帧前不加载 provider/browser/codec 图（omp 的启动边界） | §3 单模块 import **1,163 ms** | 大幅缩短 `--version`/`--help` |
| **S-03** | 延迟`ajv`校验器求值 | §3.1历史CPU采样 | 未隔离验证，不能简单把54ms全部转为收益 |
| **S-04** | `start`走通过新鲜度校验构建产物 | 用户已裁决；§1.1旧差约2.9s | 新产物同环境重新测量 |
| **S-05** | 引入「stat 全部 + 只读前 N」与标题索引 | [48 §3.2](#32-oh-my-pi默认路径不扫且有两级优化) | 面板列表不再 content-scan |

**S-01 与 S-02 是本轮最有价值的两项**：它们修的不是「换个启动方式」，而是「启动时求值/读取了不需要的东西」。

### 7. 未验证项

- **pi 的启动时间未测量**——`dist/` 不存在且无 `node_modules`，esbuild bundle 无法运行。**没有用推断代替测量。**
- 未测量 `build:exe` 单文件可执行产物的启动时间。
- 未测量 omp/codex 在**冷缓存**（首次执行）下的时间——上表是热缓存。
- `ajv` 的 54 ms 沿用 [31 §2.1](#21-规模) 的 `--cpu-prof` 结果，本轮未重测。
- 未验证延迟 `ajv` 是否有模块求值期的校验依赖（需确认没有 schema 在 import 时就被使用）。
- 未测 `describeSessionReentry` 里「恢复快照 + 连续性快照」各自额外的文件读取次数（只实测了 `readSessionRecordSnapshot` 的 3 个文件）。

### 8. 子代理产出未被采用（重要）

本轮派出的三个子代理（`PanelsGap17`、`ArgAuditHandlers`、`StartupMeasure`）**全部把报告写到了同一个文件** `local://panels-gap17.md`（这是我分配路径时的失误），且**三份报告的内容都是「参数提示审计」**，与各自被指派的任务不符。

**已核实其中存在虚构**：`ArgAuditHandlers` 的报告把 `/continue` `/review` `/theme` `/usage` `/skill` `/copy` `/btw` `/web-research` `/git` `/wt` `/commit` `/tools` 列为「无 hint」，但**实测这些命令全部有 hint**（例如 `/git` 的 hint 是 `[status|diff|stage|…|goal]`）。它引用的 `/model` hint `[status|list|switch <model>|preset <name>|pull|check]` 与真实值 `[status|refresh|config|list [provider] [--refresh]|use <model-id> …|help]` 完全不同——它似乎把 `CommandSyntax` 的**动作名**当成了 hint 文本。

**因此本文的全部数字均为主代理直接运行命令所得，未采用任何子代理产出。**

#### 8.1 顺带查清的一个真实事实

hint 并非手写，而是**由语法定义生成**：`syntaxHint(syntax)`（[projection.ts:15-21](../../packages/ts-shell/src/core/commands/syntax/projection.ts#L15)）：

```ts
export function syntaxHint(syntax: CommandSyntax): string {
  if (syntax.actions.length === 1 && syntax.actions[0]?.name === "") return (actionUsage(syntax.actions[0]) + flagUsage(syntax)).trim();
  const actions = syntax.actions.filter(action => action.name || action.parameters?.length).map(action => actionUsage(action)).join("|");
  return `${actions ? `[${actions}]` : ""}${flagUsage(syntax)}`.trim();
}
```

实测对账：

| 来源 | 数量 | 说明 |
|---|---|---|
| `argumentHint: syntaxHint(…)` | **82** 个顶层命令 | 派生（源码中 75 处调用，含 15 个独立 registration 模块 + `registry.ts` 的 60 处） |
| 手写字面量 | **3** 个顶层命令：`/git` `/wt` `/usage` | [git/registration.ts:6,10](../../packages/ts-shell/src/core/commands/git/registration.ts#L6)、[registry.ts:561](../../packages/ts-shell/src/core/commands/registry.ts#L561) |
| 合计 | **85** | 与实测总数一致 |

（另有 2 处字面量属于 **named invocation** 而非顶层命令：`collab join` 的 `<room>`、`reload-plugins` 的空串，不计入 85。）

#### 8.2 一个相关性：本轮发现的三条漂移来自手写hint

[24](24-slash-completion-defects.md)记录的三条问题为`/git`/`wt`/`usage`，与当时手写hint清单重合。派生hint可避免hint与同一syntax树之间的字符串漂移，**不能证明syntax树、handler、help或动态目录结构上不可能分歧**；仍需契约与真实handler测试。本段只作交叉研究，不替代24号完整复核。

**这改变了 [24](24-slash-completion-defects.md) 的修法**：

| 原判断（24 号） | 修正后 |
|---|---|
| 66 个 hint 把语法树压成一行 → 逐个改字符串 | 那是 `syntaxHint()` 的**输出策略**问题——改 1 个函数即可覆盖 82 个命令 |
| `/git` 的 hint 与 handler help 冲突 → 收敛两个真相源 | 正解是**把 `/git` `/wt` `/usage` 也改成派生**，让它们与其余 82 个走同一条路 |

`syntaxHint`输出策略可集中改进；82/85只是历史注册样本，不能把整套命令补全/执行语义工作缩为改一个函数。本任务归24号规划，启动任务不重复实现。

## 生产设计、任务归并与反例验收（2026-10-17）

以下是设计与验收要求；本轮仅修改研究文档，未实现、未新增动态性能证据。

| 稳定任务ID | 合并原条目（同名ID按原章节区分） | 交付 |
|---|---|---|
| START-01 | 正文P-01/S-01/S-03；深挖S-01/T-01；实机S-04 | 用户已选`npm start`使用通过新鲜度校验的构建产物，保留源码开发模式；缺失/过期要求build |
| START-02 | 正文P-05；深挖S-06；实机S-02 | 轻量argv/version/help入口与重runtime图建立可测加载边界 |
| START-03 | 正文P-02/S-05；深挖S-02/T-04；实机S-01 | 建议性reentry按需/异步，显式恢复保留，结果不覆盖用户选择 |
| START-04 | 正文S-06；深挖S-03/S-04/T-05/T-06；实机S-05 | 有界异步会话列表/渐进发布；索引可重建且不得成为恢复authority |
| START-05 | 正文P-03/P-04/S-02/S-04；深挖S-05/T-02/T-03；实机S-03 | 现有产物与Ajv/模块成本基准；按证据决定是否需要新bundle，不重复已有单文件构建 |
| START-06 | 正文P-06与各节未验证项 | 统一性能证据协议、首帧/输入就绪/运行时就绪与跨平台验证 |

1. **产物新鲜度是执行合同。** 启动校验须同时绑定源码、参与构建的配置/脚本、依赖lock与必要资源，不能只比较某个`dist`文件mtime或package version；校验manifest应由成功构建的最终产物原子生成并绑定产物digest。源码/lock/schema/资源任一变化、manifest缺失、部分构建或并发构建中都不能默默执行旧产物。失败用明确可行动的build提示；不在`npm start`里偷偷安装、构建或回退tsx。dev仍保留源码运行。工作树身份/commit不能代替未提交内容的新鲜度证明，校验本身也需预算。
2. **首帧不冒充ready。** 分开记录process入口、argv处理、首次可见帧、可接受用户输入、prompt/runtime可执行、首token与退出墙钟。若先画loading壳，清楚表明未就绪，用户输入有界排队/可取消，不能把禁用输入的壳计作完整启动成功。主题/终端/安全准入等首帧必要工作仍在正确边界。更新检查保持异步且退出可取消。
3. **reentry结果只作建议。** `getReentryCandidate`当前同步I/O不能仅包在`Promise.resolve`/microtask/setTimeout就宣称非阻塞；须在owner内使用有界异步I/O、可中止yield或合适的后台读取边界。捕获session id/createdAt、project/root identity、配置revision与UI generation；`/new`、`/resume`、项目切换、用户选择或退出后旧扫描不得更新hint/fallback、抢焦点、替换会话或写当前session。扫描不自动恢复；明确选择时重新核验原恢复信任边界与当前事实。
4. **避免变更恢复语义。** 当前reentry按可恢复性/项目/时间等评分，并有suggested-recovery优先路径；mtime前N不是同一排序，旧中断会话可能被漏掉。若做分批，显示partial/complete状态，不把暂未发现当不存在。`/resume`/`/continue`的显式解析保持按需完整核验；索引只加速展示，损坏/缺失/负面缓存失效时可重建，不缓存权限或把陈旧索引当恢复成功。
5. **可复跑性能协议。** 用合成隔离HOME/USERPROFILE/测试root与固定无网络provider模式；两组仅改变被测项，固定构建digest、Node版本、cwd、配置与缓存策略，随机/交替顺序并保留原始样本、p50/p95及冷/热缓存区分。测0/100/1000会话与不同内容体积，单独计reentry owner、加载图与校验成本。不能用真实HOME差值归因会话扫描，也不能把`--version`改善当作交互prompt启动改善。平台结论限于实际测量环境。
6. **反转验收。** version/help重新加载重图、stale构建仍执行、仅改mtime绕过校验、构建失败留下success manifest、旧扫描在用户选会话后覆盖fallback、索引当authority、扫描阻塞输入、取消后仍持有文件/定时器、loading壳冒充ready时，对应检查必须失败。新鲜度与行为测试不被窄计时基准替代。

**方向状态**：`npm start`的产物入口已由用户裁决；恢复提示保留并改变执行边界是技术建议。删除默认恢复提示、启动即自动恢复旧会话、引入daemon或新增分发渠道均不由本研究默认授权。本轮不修改package scripts或构建行为。
