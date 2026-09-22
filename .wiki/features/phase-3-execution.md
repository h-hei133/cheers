# Phase 3 执行记录

> **依据**：[`phase-3-decisions.md`](phase-3-decisions.md) 的裁决（7 项主任务 + T7 + 44 项补充裁决）。
> **对照研究**（证据层）：[`phase-3-comparison.md`](phase-3-comparison.md)。
> **本文件记录实际做了什么、以及执行中发现的与裁决不符之处。**
>
> **执行顺序**：T3 → T7 → T1 → T4 → T6 → T2/T2b → T5。

---

## 执行总览

| 任务 | 范围 | 状态 |
|---|---|---|
| T3 | 删除 `thinkingBudgets` + `promptCacheTtl`；`tuiMode` 加注释保留 | ✅ **完成**（§1） |
| T7 | 死字段门禁 | ✅ **完成**（§2） |
| T1 | 三层遍历 + `.gitignore` | ✅ **完成**（§3） |
| T4 | 逐模型窗口 + 逐模型压缩预算 | ✅ **完成**（§4） |
| T6 | 目录列举折进 `read` | ✅ **完成**（§5） |
| T2 / T2b | `AGENTS.md` 注入 + 技能（一轮） | ✅ **完成**（§6） |
| T5 | 声明式钩子 + 信任门 + 封堵既有执行面 | ⬜ 未开始 |

---

## 1. T3 — 删除两个说谎的配置字段

**提交**：见 §1.6。

### 1.1 裁决回顾

| 字段 | 裁决 | 理由（已更正版） |
|---|---|---|
| `thinkingBudgets` | **删除** | 无消费位点——我方 **4 条** `/chat/completions` 路径都不消费数值预算，且无 token 型 provider 适配层（无 `budget_tokens`/`thinking_token_budget`）。**不是**原判的「与 `reasoning_effort` 语义冲突」（该论证已被 pi 的实现推翻） |
| `promptCacheTtl` | **删除** | 标准 `/chat/completions` 无请求级缓存 TTL 参数；我方无 `cache_control` 也无 `cacheRetention` 层 |
| `tuiMode` | **保留**，加类型注释 | 它描述的能力**已实现**（`supportsFullScreenSurface` 从 TTY 能力自动判定，5 处消费），只是缺配置入口。与上两个的本质区别是「描述的能力是否存在」 |

### 1.2 施工内容

| 改动 | 位置 |
|---|---|
| 删除 `thinkingBudgets` 声明、默认值、合并行 | `config/runtimeConfig.ts`（原 `:75,113,136-141,223`） |
| 删除 `promptCacheTtl` 声明、默认值、合并行 | `config/runtimeConfig.ts`（原 `:79,117,145,227`） |
| 为 `tuiMode` 补类型注释，说明「已声明未接线」及与已删字段的区别 | `config/runtimeConfig.ts:79-89` |
| 新增回归测试 | `config/runtimeConfig.test.ts`（「does not carry a config key whose value nothing reads」） |

**净变化**：`runtimeConfig.ts` −12 行；测试 +21 行。

### 1.3 执行中发现的与裁决不符之处

**裁决记录说错了验证方式。** `phase-3-decisions.md` §4.5 原写：

> 删除字段会同时删除钉住它们的测试（这些测试只断言「字段存在」——属于「断言实现」而非「断言行为」）。

**实测：没有任何测试钉住这两个字段。** 全仓 `grep thinkingBudgets|promptCacheTtl` 于 `*.test.ts` → **0 命中**。

这个判断错误的**来源**是 `phase-1-execution.md` §2.1——那里记录的测试是**断言往返**（写入配置 → 读回），而该测试的字段列表里**本来就没有**这两个键（它只列 `contextWindow`/`reserveTokens`/`temperature`/`topP`/`maxOutputTokens`/`agentMode`）。裁决记录把「Phase 1 补了往返测试」误推为「这两个字段也被钉住」。

**后果**：删除时无需改任何测试——但**也因此，删除前没有测试能证明它们「曾是活的」**。这正是 T7（死字段门禁）要防的形态：一个字段可以在**零测试、零消费者、零文档**的状态下存活。

### 1.4 施工中发现的一个既有边界（记录，不修）

**配置文件中残留已删键不会报错，也不会有提示。** `getRuntimeConfig` 的解析路径**没有未知键校验**（全仓搜 `unknown`/`unrecognized`/`schema` 于 `runtimeConfig.ts` → **0 命中**），多余键被静默忽略。

- **好处**：向后兼容——用户的旧配置继续可用，不会因为升级而启动失败。
- **代价**：用户**无法知道**某个键已被删除。

**与 T7 的关系**：T7 防的是「文档声明了但代码没接」；此处是「代码删了但用户的配置还留着」。**两者都不报错。** 记录备查，不在 T3 解决。

### 1.5 验证

| 门禁 | 命令 | 结果 |
|---|---|---|
| 类型 | `npx tsc -p packages/ts-shell/tsconfig.build.json --noEmit` | **0 错误** |
| 全量 | `npm run test:ts` | **494 文件 / 2800 通过 / 1 跳过 / 0 失败** |
| import 环 | `npm run verify:import-cycles` | `runtime_cycles=0 type_only_cycles=0`（1433 文件） |
| 文档漂移 | `npm run verify:docs-drift:strict` | pass |
| 构建 | `npm run build:ts` | 成功，`dist/cli.js` 已生成 |

**反向验证（回归测试有效性）**：

- 只重新引入 `promptCacheTtl`（声明 + 默认 + 合并三处）→ 测试**失败**：
  `AssertionError: expected [ 'provider', 'daemonEnabled', …(18) ] to not include 'promptCacheTtl'`
- 移除后 → **通过**。

**即：测试对两个字段**各自独立**有效**（首次验证时两个都在，报的是 `thinkingBudgets`；反向验证时只放回 `promptCacheTtl`，报的是它）。

**实机验证（真实构建产物，非合成）**：

用一份**同时含两个已删字段**的 `.private-agents.json` 调 `getRuntimeConfig`：

| 检查 | 结果 |
|---|---|
| 存活字段正确加载 | `contextWindow: 200000`、`reserveTokens: 30000`、`temperature: 0.2`、`agentMode: "plan"`、`tuiMode: "fullscreen"` ✅ |
| 两个已删字段不在结果键集中 | `has thinkingBudgets: false`、`has promptCacheTtl: false` ✅ |
| 旧配置不报错（向后兼容） | 正常返回，无异常 ✅ |
| 真实 CLI 启动 | `node dist/cli.js` 于该目录正常启动，无错误 ✅ |
| `/context` 命令 | 输出 `Window: 200,000 tokens`——从配置读到，未被删除影响 ✅ |

### 1.6 提交

**提交**：`26d6e0ab`（`fix(config): drop two config fields nothing read`）

---

## 2. T7 — 死字段门禁

**提交**：`45e23a40`（`check: fail when a config field has no consumer`）。

### 2.1 裁决回顾与两处更正

原裁决：「扫描**用户文档**中声明的配置字段，逐个验证存在生产消费者」。

**侦察推翻了它的前提**：

| 检查 | 结果 |
|---|---|
| `USAGE_MANUAL.md`（唯一用户手册，241 行） | 只写配置文件**位置**，**零个配置键**（`grep thinkingBudgets\|promptCacheTtl\|contextWindow` → 0 命中） |
| 其它 md 中的配置键 | 全在 `.wiki/` 内部分析文档里，不是用户面 |

**即：T3 的缺陷不在「文档 vs 代码」，而在「类型声明 vs 消费者」。** 门禁改为检查**声明 → 消费者**。

**第二处更正：参考实现没有这个门禁。** 已核验 pi / opencode / codex / gemini-cli **零个**做此检查。最接近的是：

- **codex 的穷尽解构**（`mcp_types.rs:317-320`）：`RawMcpServerConfig` 的 `TryFrom` 穷尽解构每个字段，加字段而不更新映射即**编译失败**——由语言强制，但只证明「映射读了它」。
- **gemini-cli 的 schema 单一来源**（`settingsSchema.ts:3027-3030`）：类型/默认值/校验器/schema/文档全部派生 + CI `--check`。**但没有「消费者」概念**——字段加进 schema 即自动文档化、校验、CI 全绿，可能完全无人读。

**TypeScript 侧无对应物**：`noUnusedLocals`、eslint `no-unused-vars`、biome unused 规则**都只管局部变量/导入/参数，从不管接口成员**。

**结论：本门禁在已核验的参考里是首创。** 机制取 codex 的方向（声明必须有消费方），用静态扫描实现，因为 TS 没有穷尽解构那样的强制。

### 2.2 施工内容

| 文件 | 作用 |
|---|---|
| `scripts/check-config-consumers.mjs` | 门禁本体 |
| `scripts/check-config-consumers.test.mjs` | 门禁的 7 项测试（`node --test`） |
| `package.json` | `check:config-consumers`（门禁）+ `test:scripts`（`node --test scripts/*.test.mjs`，**glob** 而非逐个门禁命名） |
| `scripts/test-all-stacks.mjs` | 新增「Script Tests」栈，使 `npm test` 覆盖 `scripts/` 下的门禁测试 |
| `.github/workflows/ci.yml` | 新增两个阻断步骤：跑门禁、跑 `test:scripts` |

**命名**：用 `check-*` 而非 `verify-*`。仓库约定（与 `pi` 一致）是**结构性不变量用 `check-*`**（如 `check-import-cycles.mjs`、pi 的 `check-runtime-deps.mjs`），**行为/场景验证用 `verify-*`**。本门禁断言的是树的**结构不变量**，属前者。

**测试组织**：采纳 `pi` 的方式——**一个 glob 跑全部脚本测试**（`node --test scripts/*.test.mjs`），而不是给每个门禁造专属脚本名。我最初写成 `check:config-consumers:test`（per-gate 命名），**这是错的**：它把「门禁测试」这件事拆成 N 个脚本名，每加一个门禁就要多一行 `package.json`。`pi` 的 `test:scripts` 是单行 glob，新门禁的测试**自动被收录**。

**同时补入 `test-all-stacks.mjs`**：该脚本原先只跑 vitest / cargo / pytest **三个栈**，`scripts/` 下的门禁测试**不在其中**——即 `npm test` 不会跑它们。已新增「Script Tests」栈。

### 2.3 门禁的判定规则

1. 解析 `RuntimeConfig` 与 `TuiPreferences` 的 `readonly` 字段；
2. 在 `packages/ts-shell/src` 中搜 `.字段名`；
3. **声明模块自身不计**（一个只被自己文件读的字段没有消费者）；
4. **测试文件不计**（测试断言往返不使字段有用），但会**报告**「仅被 N 个测试文件读」；
5. 零生产读者的字段 → 报错 exit 1，除非在 `DECLARED_WITHOUT_READER` 里登记了理由。

**当前唯一豁免**：`tuiMode`（理由：它描述的能力已实现，字段是将来显式覆盖的入口；与已删的两个不同，那两个描述的能力不存在）。

### 2.4 施工中发现并修复的**门禁自身缺陷**（3 处，全部由测试暴露）

| # | 缺陷 | 症状 | 修复 |
|---|---|---|---|
| 1 | `MIN_DECLARED_FIELDS = 15` 硬编码 | 每个 fixture 都被判 `parse-shrank` exit 3 | 改为从 `REQUIRED_INTERFACES.length` 派生 |
| 2 | 先解析后检查文件存在 | 缺失文件时 `statSync` **抛异常**（exit 1）而非 `config-failure`（exit 3） | 文件存在检查前置，且用 `existsSync` 而非 `statSync` |
| 3 | 弱守卫（只查 `fields.length === 0`） | 接口改名后**解析到 1 个字段却 pass** —— 门禁在它看不见的字段上通过 | 逐接口检查存在性 + 空体检查 |

**第 3 处是这次施工最重要的发现**：一个「读取不到目标却报告通过」的门禁**比没有门禁更糟**——它给出虚假保证。这条记录与 T7 的目的一致：门禁的价值在于**能否失败**，不在于能否通过。

### 2.5 验证

| 项 | 方式 | 结果 |
|---|---|---|
| 门禁测试 | `node --test scripts/check-config-consumers.test.mjs` | **7/7 通过** |
| 反向验证（注入死字段） | 在真实 config 里注入 `deadProbe`（声明+默认+合并三处） | 门禁**报错 exit 1**，点名 `deadProbe` |
| 反向验证（原始缺陷） | 重新注入**真实的** `thinkingBudgets` + `promptCacheTtl` | 门禁**同时报出两者**，exit 1 |
| 守卫验证（接口改名） | 把 `RuntimeConfig` 改名为 `Settings` | **`config-failure` exit 3**（不再静默通过） |
| 守卫验证（文件缺失） | 指向空目录 | **`config-failure` exit 3** |
| 实机（真实树） | `npm run check:config-consumers` | `fields=20 read=19 declared_without_reader=1 findings=0` **pass** |
| CI 接线 | YAML 解析 + 步骤列表 | 新步骤就位 |

**测试暴露的 fixture 缺陷（一并记录）**：初版 fixture 把 reader 放在 config 模块**自己**里，门禁正确地把它排除并报错——**是 fixture 错了，不是门禁错了**。这与 T7 规则 3 一致。


---

## 3. T1 — 文件遍历剪枝与 `.gitignore`

**提交**：`12818fe6`（`perf(execution): one walk policy, three layers, no per-caller filtering`）。

### 3.1 施工前的裁决更正（两处，均由侦察推翻原记录）

| # | 原记录 | 实测 | 处置 |
|---|---|---|---|
| 1 | 「`gemini-cli` 600 行自解析」→「不引入 `ignore` 依赖」 | `gemini-cli` **import 的正是 `ignore` 包**（`gitIgnoreParser.ts:9`）；那 600 行是**加载器 + 纯常量表**，匹配逻辑为 0 | **改为引入 `ignore`**（§1.10 裁决 8） |
| 2 | 「从子目录运行返回仓库相对路径且**包含 cwd 之外的文件**」 | **相反**：裸调用返回**相对 cwd** 的路径且**不含 cwd 之外的文件** | 裁决 10 改写为三种形态 |

**第 1 处的证据分布是 4 : 0**：`pi` / `gemini-cli` / `opencode` 全部依赖 `ignore` 包，`codex` 依赖 Rust `ignore` crate，**手写匹配器的先例为零**（搜 `gitignoreRegex\|wildmatch\|fnmatch` → 0 命中）。

### 3.2 施工内容

| 文件 | 变化 |
|---|---|
| `runtime/execution/fileWalk.ts` | **新增**（~200 行）：三层遍历 |
| `runtime/execution/fileWalk.test.ts` | **新增**：10 项测试 |
| `runtime/execution/service.ts` | 删掉旧的无剪枝 `listFilesRecursive`（14 行），改调 `listWorkspaceFiles` |
| `runtime/execution/types.ts` | `FileListExecutionRequest` 增加 `walkOptions?` |
| `core/tools/registry.ts`（glob） | **−14 行**：删前缀剥离 + 硬编码列表 |
| `core/tools/grep.ts` | **−18 行**：同上 |
| `core/tools/lsp.ts` | **−18 行**：同上，只保留扩展名收窄 |
| `packages/ts-shell/package.json` | 新增依赖 `ignore@^7.0.9` |

**三个调用方净减 43 行**，且**不再各自剥离前缀**。

### 3.3 三层的精确形状

| 层 | 机制 | 何时生效 |
|---|---|---|
| 1 | 遍历期剪枝 `node_modules`/`.git`/`dist`/`.normproof`（**按路径段**，非子串） | **始终** |
| 2 | `git -C <workspaceRoot> ls-files --cached --others --exclude-standard` | 在 git 仓库内 |
| 3 | 进程内 `ignore` 匹配 `.gitignore`/`.ignore` | 无 git 时（第 2 层 exit 128） |

**层 1 不与层 2/3 重复**（实测）：一个**没有**把 `node_modules` 写进 `.gitignore` 的仓库，`git ls-files` **会**返回整个 `node_modules`。层 1 必须始终叠加。

**层 3 的嵌套前缀改写**（`addIgnoreFile`）：`a/b/.gitignore` 里的 `c` → `a/b/**/c`；`/c` → `a/b/c`；`c/d` → `a/b/c/d`。目录判定用尾斜杠（`matcher.ignores(rel + '/')`），因为匹配器不做 `fs.stat`。

**`ignorecase: false` 必须显式传**：`ignore` 默认大小写不敏感，而 git 在 Linux 上敏感。

### 3.4 施工中发现并处理的问题

**1. `npm install` 静默改写了 lockfile 的无关部分。** 它把 `workspaces: ["packages/*"]` 展开为显式列表，并删掉了 `python-eval` 条目——那是**既有的 lockfile 漂移**（`package.json` 与 lockfile 早已不一致），但**不属 T1 范围**。已还原 lockfile，只保留 `ignore` 的 10 行最小改动。

**2. 两个类型错误**（tsc 暴露，非猜测）：
- `Awaited<ReturnType<typeof fs.readdir>>` 解析到了 `Buffer` 重载 → 改用具体的 `Dirent[]`；
- `service.ts` 需要值导入而非仅重导出。

**3. 一处命名违规**（自查发现）：注释里写了 `fd` 和 `ripgrep` 两个外部工具名，违反「不得出现别人项目名字」。已改写为「a widely shared convention」。

### 3.5 验证

| 项 | 方式 | 结果 |
|---|---|---|
| 新增测试 | `fileWalk.test.ts` | **10/10 通过** |
| 全量 | `npm run test:ts` | **495 文件 / 2810 通过 / 1 跳过 / 0 失败** |
| 类型 | `tsc -p tsconfig.build.json --noEmit` | **0 错误** |
| 门禁 | import-cycles / docs-drift / config-consumers / test:scripts | **全 pass** |

**反向验证（三层各自独立有效）**：

| 反转 | 失败测试数 |
|---|---|
| 移除**层 1**（剪枝） | **2 项失败**（顶层与嵌套的剪枝用例） |
| 移除**层 3**（进程内匹配） | **3 项失败**（非 git 目录、子目录锚定、目录专有模式） |

**实机验证（真实构建产物，非合成）**：

| 场景 | 结果 |
|---|---|
| 本仓库遍历 | **2741 文件 / 18ms**（旧：**14517 文件 / 200ms**）——**11× 快、81% 更少** |
| 不含 `.git/`、`node_modules/`、`.normproof/` | ✅ 三者皆无 |
| 非 git 目录（第 3 层） | `['.gitignore', 'a.ts', 'keep.log']`——`x.log` 排除、`keep.log` 保留（**取反生效**）、`build/out.js` 排除 |
| 与 git 自己的答案交叉核对 | 去掉 `node_modules` 后**逐条一致** |

### 3.6 未做（如实记录）

- **Windows glob 语义**：裁决 6 已明确本轮不做。
- **结果条数上限与截断通知**：裁决 1 要求「加」，**本轮未实现**——三个调用方仍各自持有自己的上限（`grep` 的 `DEFAULT_GREP_LIMIT`、`glob` 的无上限）。**这是一个未完成的裁决**，见 §3.8。
- **`git` 不在 PATH 时**：会走第 3 层（`spawnSync` 的 `result.error` 已处理），但**未实测**无 git 的环境。

### 3.7 提交

**提交**：`12818fe6`。

### 3.8 遗留：裁决 1（上限与截断通知）未完成

§1.8 裁决 1 要求「条数上限 + 字节上限 + 可操作通知」，理由是「巨型仓库的 `glob **/*` 仍会把全部结果塞给模型」。

**本轮未实现**，原因：三个调用方各有上限语义（`grep` 有 `DEFAULT_GREP_LIMIT`，`glob` 无上限，`lsp` 按扩展名收窄），把它们统一到遍历层需要先决定「上限属于遍历层还是工具层」。侦察证据指向**工具层**（`pi`/`claudecode` 都是逐工具计数，只有 `codex` 把上限放进遍历层，因为它的遍历本身就是搜索引擎）。

**处置**：记入 T6（目录列举）一并裁决——T6 必然要处理上限与分页，届时统一三个工具的上限语义更自然，避免两轮各改一次。

---

## 4. T4 — 逐模型上下文窗口

**提交**：`26567504`。

### 4.1 施工内容

| 文件 | 变化 |
|---|---|
| `core/models/window.ts` | **新增**：逐模型窗口 + 逐模型预算解析 |
| `core/models/window.test.ts` | **新增**：16 项测试 |
| `config/runtimeConfig.ts` | 新增 `modelTokenBudgets` 字段；**`contextWindow` 不再填默认值**；`ModelTokenBudget` 类型移入此处 |
| `cli/runtime/cliSessionRuntimeFactory.ts` | policy 改为逐模型解析；catalog 每会话读一次 |
| `cli/interactive/sessionFacts.ts` | 状态栏分母改为同一解析 |
| `core/commands/contextCommandRuntime.ts` | `/context` 改为同一解析；删除已成死代码的本地常量 |

### 4.2 施工中发现并修复的**两个自身缺陷**

**缺陷 1（重要）：`getRuntimeConfig` 总是填默认窗口，使逐模型解析永远不生效。**

原实现 `contextWindow: merged.contextWindow ?? DEFAULT_CONFIG.contextWindow`——**用户未配置时也返回 64000**。于是「用户设了 64k」与「没人设过」是同一个值，解析链的第一层（用户配置优先）**永远命中**，目录**永远不会被查**。

**这个缺陷是实机验证发现的**：`/context` 仍报 64,000，而代码看起来「已经接线」。查下去才发现 source 是 `config` 而非 `catalog`。

**修复**：配置层**不再发明**默认值，字段改为「用户没设就不存在」。已加测试钉住。

**教训**：「把默认值填在配置层」会让下游的「是否显式配置」判断**永远为真**——这类缺陷在类型上完全合法，只有跑起来才看得见。

**缺陷 2：类型放错模块，制造了一个 type-only 环。**

`ModelTokenBudget` 最初定义在 `window.ts`，而 `window.ts` import `catalog.ts`、`catalog.ts` import `runtimeConfig.ts`——形成 `runtimeConfig → window → catalog → runtimeConfig`。

**被仓库既有的 `verify:import-cycles` 抓到**（`type_only_cycles=0 → 1`）。该门禁的提示原文：*"they become runtime cycles the moment one is converted to a value import"*。

**修复**：类型移入 `config/runtimeConfig.ts`（它本来就是配置形状），`window.ts` 改为 re-export。

### 4.3 一处需要记录的**跨命名空间**问题

凭证解析器返回的是 **`RuntimeProvider`（协议名）**：`openai-compatible`、`anthropic`。目录用的是 **vendor id**：`siliconflow`、`deepseek`。

**实测本环境**：活动模型是 `openai-compatible/deepseek-ai/DeepSeek-V4-Flash`，而该模型在目录里挂在 **`siliconflow`** 下（`runtime: openai-compatible`）。**只按 provider 精确匹配会漏掉**。

**已核验无歧义**：目录里**没有任何模型 id 出现在两个 provider 下**（实测：0 个）。因此**按模型 id 回退匹配是安全的**，已实现并加测试。

**未做**：未把 `RuntimeProvider` 与 vendor id 统一——那是更大的重构，且回退匹配已经消除症状。

### 4.4 验证

| 项 | 方式 | 结果 |
|---|---|---|
| 新增测试 | `window.test.ts` | **16/16 通过** |
| 配置测试 | 新增「未配置时窗口应为 undefined」 | **13/13 通过** |
| 全量 | `npm run test:ts` | **496 文件 / 2827 通过 / 1 跳过 / 0 失败** |
| 类型 | `tsc` | **0 错误** |
| 门禁 | import-cycles / docs-drift / config-consumers / test:scripts | **全 pass**（环回到 0） |

**反向验证**：移除目录查找 → **3 项测试失败**（含钉住原始缺陷的那条）。

**实机验证（真实构建产物 + 真实配置）**：

| 检查 | 修复前 | 修复后 |
|---|---|---|
| `/context` 报告的窗口 | 64,000（**恒为此值**） | **128,000**（来自目录） |
| 解析来源 | `config`（被默认值污染） | `catalog` |

**逐模型预算实测**：该模型的覆盖 40000、其他模型走全局 8000、无覆盖走默认 20000。

### 4.5 未做（如实记录）

- **未统一 `RuntimeProvider` 与目录 vendor id 的命名空间**：回退匹配已消除症状，但两者仍是两套名字（见 §4.3）。
- **模型切换后的溢出归属**（裁决 §5.6 #6）：未专门实现。已核验 `runPrompt` 每轮重算 wiring（`compactionProvider()`），因此切换后阈值会重算；但「旧模型的溢出不触发新模型压缩」这一具体守卫**未实现**。
- **目录新鲜度**（裁决 §5.6 #7）：本轮不引入，符合裁决。

---

## 5. T6 — 目录列举

**提交**：`f9fbc600`。

### 5.1 施工内容

| 文件 | 变化 |
|---|---|
| `runtime/execution/fileWalk.ts` | 新增 `listDirectoryEntries` + `matcherForDirectory` + `listIgnoredViaGit` |
| `core/tools/directoryListing.ts` | **新增**：列表渲染（分页、排序、截断与省略通知） |
| `core/tools/globMatch.ts` | **新增**：统一 glob 匹配器（替换两份手写副本） |
| `core/tools/glob.ts` | **新增**：glob 工具独立成模块 + 结果上限 |
| `core/tools/registry.ts` | `read` 增加目录分支；删除内联 glob 与重复匹配器；描述更新 |
| `core/tools/grep.ts` | 收敛到共享匹配器（删除本地副本） |

### 5.2 施工中发现并修复的**两个额外缺陷**（不在原裁决范围内）

**缺陷 1（重要）：glob 的两份手写匹配器都无法匹配 `**/*` 的根级文件。**

`registry.ts` 与 `grep.ts` **各有一份完全相同的手写 glob→regex 改写**。两者都有同一个错误：

```
.replace(/\*\*\//g, '(.+/)?')   // 生成 (.+/)? —— 这个 ? 是「可选」
.replace(/\?/g, '[^/]')          // 但这一步把这个 ? 变成了 [^/]
```

结果是 `(.+/)?` 变成 `(.+/)[^/]`——**可选组变成必需**。实测：

| 模式 | 文件 | 修复前 | 应为 |
|---|---|---|---|
| `**/*.ts` | `a.ts` | ❌ false | true |
| `**/*.ts` | `src/a.ts` | ✅ true | true |
| `src/**/*.ts` | `src/a.ts` | ❌ false | true |

**即：工具描述里宣传的两种模式，对最常见的位置都是失效的。**

**处置**：引入 `picomatch`（**零依赖、124KB**，`gemini-cli` 同选），删除两份手写副本，两个工具收敛到 `globMatch.ts` 一份实现。

**为什么选 `picomatch` 而非 `minimatch`**：两者语义都正确（已实测），但 `minimatch` 带 2 层依赖、680KB；`picomatch` 零依赖、124KB。参考实现里两者各有采用（`minimatch` 2 家、`picomatch` 1 家），**体积与依赖树是决定因素**。

**保留了大小写不敏感**（原实现编译时带 `i` 标志）：改为 `nocase: true`，避免「修复后 `Package.json` 突然搜不到」。

**缺陷 2：glob 无任何结果上限。**

实测本仓 `**/*` 匹配 **2744 条 / 155KB**，全部 `join` 后交给模型。这正是裁决 §1.8 #1「**加**：条数上限 + 字节上限 + 可操作通知」要求的事项——T1 时判为「延迟到 T6」，本轮落实。

**处置**：默认 500、上限 1000，截断时通知「Showing N of M matches (limit L). Narrow the pattern, or pass limit=K to see more」。

### 5.3 形状（按裁决 §7.4）

| 维度 | 实现 |
|---|---|
| 触发 | `read` 的路径 `stat` 为目录时 |
| 层级 | **单层**（四个参考一致） |
| 分页 | 复用 `offset`/`limit`（默认 500，上限 1000） |
| 排序 | 目录优先，然后字母序（**按码点比较，不用 locale**，避免随环境漂移） |
| 目录标记 | `/` 后缀 |
| 忽略 | **T1 的统一忽略层**（`git check-ignore --stdin` 批量问 git，非仓库时进程内匹配） |
| 空目录 | `Directory X is empty.`，**非错误** |
| 全部被忽略 | **不报 empty**，报「holds no entries that this tool may show (N omitted)」 |
| 省略计数 | `[N entries omitted by the ignore rules]`（裁决 §7.7 #2/#3） |
| 符号链接 | 指向目录的链接按目录标记（`stat` 跟随）；断链按文件 |
| 大小信息 | **不做**（裁决 §7.7 #1） |

**一个实现细节值得记录**：`read` 的目录分支**在 `stat` 之后、读文件之前**——这样目录永远不会进入 `readTextFile`，也就永远不会产生 EISDIR。

### 5.4 验证

| 项 | 方式 | 结果 |
|---|---|---|
| 目录列举 | `readImprovements.test.ts` 新增 7 项 | **通过** |
| glob 上限 | `globCap.test.ts` 新增 4 项 | **通过** |
| glob 匹配 | 同上新增 5 项 | **通过** |
| 全量 | `npm run test:ts` | **497 文件 / 2843 通过 / 1 跳过 / 0 失败** |
| 类型 | `tsc` | **0 错误** |
| 门禁 | import-cycles / docs-drift / config-consumers / test:scripts / module-facades | **全 pass**（环 0，无新增超限模块） |

**反向验证**：把 `globMatch.ts` 换回原来的手写改写 → **5 项测试失败**（含 2 项钉住根级匹配缺陷）。

**实机验证（真实构建产物）**：

```
read src  →  Directory src/ (3 entries):  sub/  a.ts  b.ts
read .    →  Directory ./ (4 entries):   .ts-shell/  src/  .private-agents.json  package.json
```

修复前：`read src` → `IsADirectoryError: [Errno 21] Is a directory`。

### 5.5 未做（如实记录）

- **`grep` 的字节上限**：`grep` 已有 `truncateHead(50KB)` + 溢出落盘，未改动。
- **`lsp` 的上限**：未动（裁决未要求）。
- **Windows glob 语义**：仍为 backlog（裁决 §1.8 #6）。

---

## 6. T2 / T2b — 上下文注入与技能

**提交**：`46ccca0f`（主体）、`5274b2b6`（补齐 §2.2.3 与 §2.2.4）。

### 6.1 施工内容

| 文件 | 变化 |
|---|---|
| `context/instructions/projectInstructions.ts` | **新增**：指令文件发现 + 预算 + 渲染 |
| `core/tools/skill.ts` | **新增**：按名加载技能正文的工具 |
| `core/skills/skillLoader.ts` | `scan` **改递归**；新增 `disableModelInvocation`；新增 `renderSkillList` |
| `core/security/projectTrust.ts` | 新增 `isProjectUntrusted` |
| `turn/prompt.ts` | `buildSystemPrompt` 接受指令与技能目录 |
| `entrypoints/cliRuntimeInvocation.ts` | 每轮发现技能与指令，过信任门，注入系统提示 |
| `core/tools/registry.ts` | 接受 `skills`，注册 `skill` 工具 |
| `config/runtimeConfig.ts` | 新增 `instructionBudgetBytes`（0 = 关闭） |

### 6.2 施工中发现的**三个关键问题**

**发现 1（重要）：信任门按「未信任」实现会让 T2/T2b 完全失效。**

裁决 §2.5 #4 与 §3.6 #2 都要求「过信任门」。但实测我方 `ProjectTrustStore`：

- `setProjectTrust` 的**生产调用方为零**（全仓仅测试文件）
- `isProjectTrusted()` 对**没有记录的**项目返回 `false`

即：**没有任何路径能让一个项目变成「已信任」**。若按 `!isProjectTrusted()` 门控，注入将**永远不发生**——功能上线即死，且是静默的（调用方只是「没找到东西可加载」）。

**核对参考后更正**：`codex` 的门是 `is_untrusted()`（`agents_md.rs:61`），语义是**只在显式标记为不可信时跳过**；无记录的项目照常加载。已按此实现，新增 `isProjectUntrusted`，并加 4 项测试钉住「无记录 ≠ 不可信」。

**发现 2：`/reload` 不需要实现——每轮已自动重新发现。**

裁决 §2.2.2 记载「会话中途修改 `AGENTS.md` **不会**生效（与 `pi` 同）」，§2.5 #5 因此要求新增 `/reload`。

**实测推翻了前半个断言**：`startTurn` 是**每个用户提示调用一次**，系统提示每次重建。实机验证（同一会话两个提示之间改写 `AGENTS.md`）：

```
提示 1 → "Rule ALPHA is in force"
（改写 AGENTS.md 为 BETA）
提示 2 → "Rule BETA is now in force ... The rule has changed since the last check"
```

**故未新增 `/reload`**：刷新已经是自动的，加一个什么都不刷新的命令是纯装饰。**比 `pi` 更好，且是免费得到的。** `/cd` 亦同——切目录后下一轮即重新发现，无需专门处理。

**发现 3：技能发现的递归边界。**

`pi` 的规则是「目录含 `SKILL.md` 则其为技能根，**不再下探**；否则继续递归」。我方按此实现，并**修正了自己一度写反的条件**：根级散落 `.md` 仍支持（裁决 §3.6 #5），但**只在根级**——更深处的裸 `.md` 更可能是上层技能的组成部分。

### 6.3 形状

**指令注入**（`<project_instructions path="...">`，来源标注）：

| 维度 | 实现 |
|---|---|
| 候选 | `AGENTS.override.md` > `AGENTS.md` > `AGENTS.MD` > `CLAUDE.md` > `CLAUDE.MD`，每目录取首个 |
| 顺序 | 用户级 → 项目根 → … → cwd（由远及近） |
| 边界 | 上溯止于**项目根标记**（`.git`）；无标记则**只取 cwd** |
| 预算 | 32 KiB **跨文件累减**；截断按**字节**切（非字符） |
| 关闭 | `instructionBudgetBytes: 0` |
| 失败 | 不可读跳过；候选是目录则**继续下一候选**；剥 BOM |

**技能**（`<available_skills>` + `skill` 工具）：

| 维度 | 实现 |
|---|---|
| 目录字段 | `name` / `description` / `location`（**来源标注，非 `read` 参数**） |
| 正文加载 | `skill` 工具按名取，正文来自**发现期已读入内存** |
| 路径监狱 | **不经过**——工具不接触模型给的路径 |
| 隐藏 | `disable-model-invocation: true` → 从模型视野移除，`/skill` 仍可见 |
| 递归 | 含 `SKILL.md` 的目录即技能根，不下探；跳过点目录与 `node_modules` |
| 作用域 | 项目级技能过信任门；**用户级无条件** |

### 6.4 验证

| 项 | 方式 | 结果 |
|---|---|---|
| 指令发现 | `projectInstructions.test.ts` 11 项 | **通过** |
| 技能递归 | `skillLoader.test.ts` 新增 3 项 | **通过** |
| 技能工具 | `skill.test.ts` 9 项 | **通过** |
| 提示组装 | `prompt.test.ts` 新增 4 项 | **通过** |
| 信任门 | `projectTrust.test.ts` 新增 4 项 | **通过** |
| 配置默认 | `runtimeConfig.test.ts` 新增 1 项 | **通过** |
| 全量 | `npm run test:ts` | **499 文件 / 2875 通过 / 1 跳过 / 0 失败** |
| 门禁 | 环 / docs-drift / config-consumers / test:scripts / module-facades | **全 pass** |

**反向验证**：把 `scan` 换回单层 → **1 项测试失败**（钉住嵌套技能丢失）。

**实机验证（真实构建产物 + 真实 CLI）**：

| 检查 | 结果 |
|---|---|
| 注入内容 | `<project_instructions path="/tmp/t2verify/AGENTS.md">` |
| 嵌套技能发现 | `['nested-skill', 'pdf']`（修复前只发现 1 个） |
| 模型读到规则 | 提问后回答 "You MUST always write tests before code" |
| `skill` 工具端到端 | 调用后模型复述出技能正文的 `pdftotext` 流程 |
| 中途改写 `AGENTS.md` | 同一会话内**立即生效**（见 §6.2 发现 2） |
| 关闭开关 | `instructionBudgetBytes: 0` → 加载 0 个文件，渲染为空 |

### 6.5 补充：裁决 §2.2.4 与 §2.2.3 的两项已补齐

首版提交时这两项未做，已补：

| 项 | 实现 | 实机验证 |
|---|---|---|
| CLI 标志 `--no-context-files` | `cliOptions` → `cliArgs`（无值布尔）→ `getRuntimeConfig` 的 `overrides` 参数 | 带该标志提问，模型回答「我的指令里没有 `AGENTS.md` 的内容」 |
| 截断告警 | `truncated` 现由 `project-instructions` 组件日志记录 | 单元测试保证返回值正确 |

**`getRuntimeConfig` 新增 `overrides` 参数**：命令行标志是关于**本次运行**的声明，应当高于两个配置文件。单独设参数而不是让配置层解析 argv，是为了让配置层不依赖参数解析。

### 6.6 未做（如实记录）

- **`/reload` 命令**：已论证不需要（§6.2 发现 2）。
- **嵌套目录懒加载**（裁决 §2.3）：明确移出本轮。
- **linked worktree 遮蔽**（裁决 §2.5 #7）：backlog。
- **CLI 级技能路径注入**（裁决 §3.6 #6）：backlog。
- **技能名/长度不合规的警告**（裁决 §3.5）：**未实现**——当前不校验名称格式。裁决把「名字格式不合规」定为**仅警告仍加载**，因此不做不会损失功能，但少了一条诊断。
- **技能无 `description` 时硬失败**（裁决 §3.5）：行为已达成（无描述则不进入 `<available_skills>`，模型无法匹配到它），但**不产生诊断**。

**已补齐的裁决项**（首版遗漏，已在 `5274b2b6` 补）：

| 裁决 | 要求 | 实现 |
|---|---|---|
| §3.5 | 技能名冲突：**首个胜出 + 冲突诊断** | 新增 `SkillCollision` 与 `loadDetailed()`；同 root 首个胜出，跨 root 项目覆盖用户；冲突写入 `skills` 组件日志 |
| §2.2.3 | 截断时**告警** | 写入 `project-instructions` 组件日志 |
| §2.2.4 | **CLI 标志 + 配置项** | `--no-context-files` + `instructionBudgetBytes` |

---

## 7. T5 — 扩展宿主与信任边界

⬜ 未开始。

---

## 8. 文档结构调整（本轮顺带）

**`phase-3-execution.md` 已改名为 `phase-3-comparison.md`。**

**原因**：该文件的内容是**对照研究**（逐条列参考实现的决定并标注我方立场），不是执行记录。而 `phase-1-execution.md` 与 `phase-2-execution.md` 是**真实的施工记录**。**在开始真正施工时，这个命名会变成一句谎话**——两份不同性质的文件共用一个名字，且 `phase-3-execution.md` 会与即将写入的施工记录冲突。

**处置**：
- `phase-3-execution.md` → `phase-3-comparison.md`（标题改为「Phase 3 对照研究」，tags 从 `execution` 改为 `comparison, research`）；
- 新建**本文件**作为真正的执行记录；
- `phase-3-decisions.md` 中 5 处引用已同步更新（`grep phase-3-execution` → **0 处残留**）。

**符合** `agent-rules/file-placement-and-naming.md` 的「Avoid roadmap-title, phase-title, implementation-process names」精神——文件名应反映**内容性质**，而不是「第几阶段」这个流程位置。
