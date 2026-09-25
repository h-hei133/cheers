# Core 单例处置建议

> 范围：用户指定的 `core/workflow/`、`core/harness/`、`core/messaging/` 以及 misc `core/` 单例；不重复裁决另外四个 zero-importer（`core/query/runtime/actionAuthority.ts`、`core/query/runtime/proof.ts`、`session/replay/host/facts.ts`、`test-utils/longSessionDurabilityProcess.ts`）。
>
> 方法遵守 `.wiki/refactor/plan.md` §2.1/§2.2：可达性只用于定位，不直接授权删除；删除必须证明同一责任已由活轨承担。初版单例脚本的 `.js`→`.ts` 解析和多行 `import type` 处理有缺陷，以下不采用初版的 `live-importer=9` 结论，采用修正版口径：93 个单例中 `zero importer=4`、`type-contract-only=12`、`test-only=42`、`type-contract + test=35`；共有 **47/93** 有外部生产 type importer。

## 结论

| 家族 / 文件 | 推荐 | 决策理由 |
|---|---|---|
| `core/harness/agentScenarioReport.ts`、`browserCacheMultiprocessReport.ts` | **保留** | 直接被场景测试/报告测试导入，是测试基础设施，不是孤立的可删除文件。 |
| `core/harness/browserCliScenarioFixtures.ts`、`browserExternalNetworkHandoffScenarioFixtures.ts`、`browserPlaywrightAdapterSpikeFixtures.ts`、`browserPublicReadOnlyWebScenarioFixtures.ts`、`browserRuntimeAdapterFixtures.ts`、`browserSelfHealingApplyCliScenarioFixtures.ts` | **保留** | 直接被对应 scenario tests 导入；没有发现字符串路径加载，但删除会使测试基础设施编译/运行失败。 |
| `core/workflow/adversarialRefuter.ts`、`builderValidator.ts`、`cacheStaggering.ts`、`contextInjector.ts`、`pipelineExecutor.ts` | **保留，标记 dormant/test-only** | `/workflow` 主执行链是 live，但这 5 个 helper 只有测试值导入；没有证据证明活轨覆盖 builder/validator、adversarial refutation、prompt-cache staggering、context injection 或 stage-barrier 这几项完整责任。 |
| `core/workflow/teamStore.ts` | **保留，标记 dormant/test-only** | 仅 `messagingAndTeams.test.ts` 值导入；它实现 team mailbox 和 lockfile task claiming，没有发现活轨等价 owner。 |
| `core/workflow/types.ts` | **保留** | 3 个生产文件以 `import type` 依赖；删除会破坏 `dagResolver.ts`、`contextInjector.ts`、`pipelineExecutor.ts` 的类型解析。 |
| `core/messaging/sessionSocketHost.ts` | **保留，keep-and-investigate** | 仅测试值导入，但实现 UDS/Named Pipe host、认证、消息收件箱和 idle 通知；未证明该责任已由活轨接管。 |
| `core/messaging/types.ts` | **保留** | 3 个生产文件 `import type` 依赖该消息协议；是编译期 contract。 |
| `core/shell/platform/processTree.ts` | **保留** | 仅测试值导入，但实现跨平台进程树终止和 signal lifecycle；含 `spawn`/进程管理形状，且没有活轨等价 owner。 |
| `core/context/model/contextLayerModel.ts` | **保留** | 2 个生产文件以 `import type` 使用 `ContextLayerId`；同时提供 live context-layer definitions 和 predicates。 |
| `core/commands/authCommandRuntime.ts` | **未来删除候选；本报告不直接删除** | 没有生产 importer、没有 `/auth` registry entry；`/connect` 已明确覆盖 `/auth set` legacy path，且测试已断言 `/auth` unknown。删除前需迁移/删除其唯一直接测试。 |
| 其余 type contracts（见表） | **保留，不建议删除** | 每个都有生产 `import type` 消费者；删除会破坏编译，不属于普通 dead leaf。 |

**一句话裁决：** harness 文件不是 orphan fixtures；`core/workflow/` 不是整体 dormant，而是“`/workflow` 主链 live、指定 6 个 helper dormant/test-only”；`authCommandRuntime.ts` 是本批唯一有明确替代 owner 的未来删除候选；所有 type contracts 均保留。

## 实测证据

### 1. 文件规模

命令：

```bash
wc -l \
  packages/ts-shell/src/core/workflow/adversarialRefuter.ts \
  packages/ts-shell/src/core/workflow/builderValidator.ts \
  packages/ts-shell/src/core/workflow/cacheStaggering.ts \
  packages/ts-shell/src/core/workflow/contextInjector.ts \
  packages/ts-shell/src/core/workflow/pipelineExecutor.ts \
  packages/ts-shell/src/core/workflow/teamStore.ts \
  packages/ts-shell/src/core/workflow/types.ts
```

结果：指定 workflow 文件共 **582 行**。

命令：

```bash
wc -l \
  packages/ts-shell/src/core/harness/agentScenarioReport.ts \
  packages/ts-shell/src/core/harness/browserCacheMultiprocessReport.ts \
  packages/ts-shell/src/core/harness/browserCliScenarioFixtures.ts \
  packages/ts-shell/src/core/harness/browserExternalNetworkHandoffScenarioFixtures.ts \
  packages/ts-shell/src/core/harness/browserPlaywrightAdapterSpikeFixtures.ts \
  packages/ts-shell/src/core/harness/browserPublicReadOnlyWebScenarioFixtures.ts \
  packages/ts-shell/src/core/harness/browserRuntimeAdapterFixtures.ts \
  packages/ts-shell/src/core/harness/browserSelfHealingApplyCliScenarioFixtures.ts
```

结果：指定 harness 文件共 **723 行**。

命令：

```bash
wc -l \
  packages/ts-shell/src/core/messaging/sessionSocketHost.ts \
  packages/ts-shell/src/core/messaging/types.ts \
  packages/ts-shell/src/core/agent/events.ts \
  packages/ts-shell/src/core/hooks/types.ts \
  packages/ts-shell/src/core/mcp/types.ts \
  packages/ts-shell/src/core/memory/types.ts \
  packages/ts-shell/src/core/research/types.ts \
  packages/ts-shell/src/core/shell/approval/types.ts \
  packages/ts-shell/src/core/shell/platform/processTree.ts \
  packages/ts-shell/src/core/shell/platform/types.ts \
  packages/ts-shell/src/core/subagents/types.ts \
  packages/ts-shell/src/core/context/model/contextLayerModel.ts \
  packages/ts-shell/src/core/commands/authCommandRuntime.ts \
  packages/ts-shell/src/core/commands/types.ts
```

结果：指定 misc core 文件共 **1,311 行**。

### 2. 修正版 import 解析与 fixture 消费者

使用的脚本：`/tmp/core_counts2.py`、`/tmp/fixture_strings.py`。脚本要求：

- 将本地 `.js` specifier 先剥去 `.js`，再解析到 `.ts`；
- 跨行识别 `import type { ... } from "..."`；
- 分开生产 `.ts` 与 `*.test.ts` importer；
- 对 fixture basename 进行仓内字符串扫描。

命令：

```bash
python3 /tmp/core_counts2.py
python3 /tmp/fixture_strings.py
```

关键结果：

| 文件 | 生产 importer | 测试 importer | 生产边类型 |
|---|---:|---:|---|
| `core/harness/agentScenarioReport.ts` | 0 | 1 | — |
| `core/harness/browserCacheMultiprocessReport.ts` | 0 | 2 | — |
| `core/harness/browserCliScenarioFixtures.ts` | 0 | 2 | — |
| `core/harness/browserExternalNetworkHandoffScenarioFixtures.ts` | 0 | 1 | — |
| `core/harness/browserPlaywrightAdapterSpikeFixtures.ts` | 0 | 1 | — |
| `core/harness/browserPublicReadOnlyWebScenarioFixtures.ts` | 0 | 4 | — |
| `core/harness/browserRuntimeAdapterFixtures.ts` | 0 | 2 | — |
| `core/harness/browserSelfHealingApplyCliScenarioFixtures.ts` | 0 | 1 | — |
| `core/workflow/adversarialRefuter.ts` | 0 | 1 | — |
| `core/workflow/builderValidator.ts` | 0 | 1 | — |
| `core/workflow/cacheStaggering.ts` | 0 | 1 | — |
| `core/workflow/contextInjector.ts` | 0 | 1 | — |
| `core/workflow/pipelineExecutor.ts` | 0 | 1 | — |
| `core/workflow/teamStore.ts` | 0 | 1 | — |
| `core/workflow/types.ts` | 3 | 1 | 3 type-only |
| `core/messaging/sessionSocketHost.ts` | 0 | 1 | — |
| `core/commands/authCommandRuntime.ts` | 0 | 1 | — |

fixture basename 扫描只命中对应测试文件和测试报告测试；没有命中生产 loader、`import("...fixture...")`、或以 fixture basename 组成的 `path.join(...)` 动态加载路径。

补充：`browserRuntimeAdapterFixtures.ts:126` 的 `process.argv` 位于它写出的 `runner.mjs` 字符串源码中，是测试 runner 的子进程脚本内容，不是仓内对 fixture 模块的动态加载入口。

### 3. workflow 活轨

命令：

```bash
git grep -n -E 'workflowCommandRuntime|runWorkflowCommand|name: "workflow"|from "../workflow/|from "./workflow/' -- packages/ts-shell/src
```

结果：

- `core/commands/registry.ts:506-516` 注册 `workflow`、别名 `wf/pipeline/dag`，执行 `runWorkflowCommand`。
- `core/commands/workflowCommandRuntime.ts:3-5` value-import `definition.ts`、`runner.ts`、`runStore.ts`。
- `core/workflow/runner.ts:2-4` value-import `DAGResolver`、`ParallelDispatcher`；`runner.ts:71-73` 通过 `ParallelDispatcher.run` 执行真实 workflow steps。
- `core/research/deepResearcher.ts:12,100` 使用 `ParallelDispatcher`。
- `core/tools/taskTool.ts:3,8,15-16` 使用 `GitWorktreeManager`，说明 workflow 目录不是完全 dormant。
- `core/workflow/workflow.test.ts` 才值导入 `adversarialRefuter.ts`、`builderValidator.ts`、`cacheStaggering.ts`、`contextInjector.ts`、`pipelineExecutor.ts`；`core/messaging/messagingAndTeams.test.ts` 才值导入 `teamStore.ts`。
- `core/workflow/types.ts` 被 `dagResolver.ts`、`contextInjector.ts`、`pipelineExecutor.ts` 以 `import type` 导入；其中只有 `dagResolver.ts` 位于 `/workflow` 运行链上。

因此：**目录 live；指定 6 个 helper dormant/test-only。** 不能把整个 `core/workflow/` 当作一个可删除 dormant subsystem，也不能把 6 个 helper 当作已被 `/workflow` 主链等价覆盖。

### 4. auth 与 connect

命令：

```bash
git grep -n -E 'authCommandRuntime\.js|runAuthCommand|name: ["'"']auth["'"']' -- packages/ts-shell/src/core/commands
```

结果：

- 唯一 `runAuthCommand` importer 是 `core/commands/authCommandRuntime.test.ts:6`；生产 registry 没有 import/call。
- `core/commands/registry.ts:9-10` 导入的是 `runConnectCommand`，不是 `runAuthCommand`。
- `core/commands/registry.ts:125-135` 注册 `name: "connect"` 并 dispatch `runConnectCommand`；未发现 `name: "auth"`。

命令：

```bash
git grep -n -E 'addConnectionFromLegacyAuthSet|legacy /auth|/connect set' -- packages/ts-shell/src/core/commands
```

结果：

- `connectCommandRuntime.ts:91-92` 将 `/connect set` dispatch 到 `addConnectionFromLegacyAuthSet`。
- `connectCommandRuntime.ts:199-225` 将旧 `/auth set` 参数转换为 `addConnection`，并明确输出“legacy compatibility path”。
- `connect/renderer.ts:187` 将 `/connect set` 标注为“legacy /auth set compatibility”。
- `connectCommandRuntime.test.ts:220-257` 直接测试 legacy `/auth set` 语义。
- `slashRouter.test.ts:1008-1016` 明确断言迁移后 `/auth status` 为 `Unknown slash command: /auth`。

结论：`/auth` 已从命令 registry 退役；`/connect set` 覆盖旧 `/auth set` 的兼容语义，`/connect use`/`logout`/`status` 覆盖对应 provider 管理路径。`authCommandRuntime.ts` 可进入未来删除，但必须先处理其唯一测试 importer。

### 5. 动态入口、公共面、scripts

命令：

```bash
git grep -n -E 'path\.join|pathToFileURL|spawn(Sync)?\(|execFile(Sync)?\(|process\.argv|^#!|(^|[^A-Za-z])main\(' -- packages/ts-shell/src/core/commands/authCommandRuntime.ts
```

结果：无命中。

命令：

```bash
git grep -n -E 'authCommandRuntime\.js|runAuthCommand' -- packages/ts-shell/src/index.ts scripts package.json
```

结果：无命中。

对 harness fixture basenames 的 `path.join`/动态 `import()` 精确扫描也无生产 loader 命中；fixture 中的 `path.join` 仅用于创建临时测试目录、manifest 或 runner 文件。

## 逐类分析

### A. Harness reports / fixtures

这些文件都是测试基础设施，不是 production runtime：

- `agentScenarioReport.ts`：`agentScenarioExamples.test.ts:3` 直接导入并渲染报告。
- `browserCacheMultiprocessReport.ts`：`browserCacheMultiprocessScenarioExamples.test.ts:13` 与 `browserCacheMultiprocessReport.test.ts:2` 直接导入。
- `browserCliScenarioFixtures.ts`：两个 CLI/Playwright scenario example tests 直接导入。
- `browserExternalNetworkHandoffScenarioFixtures.ts`：对应 handoff scenario test 直接导入。
- `browserPlaywrightAdapterSpikeFixtures.ts`：对应 Playwright spike scenario test 直接导入。
- `browserPublicReadOnlyWebScenarioFixtures.ts`：4 个 public/read-only/runtime/smoke scenario tests 直接导入。
- `browserRuntimeAdapterFixtures.ts`：runtime adapter example 与 gauntlet tests 直接导入。
- `browserSelfHealingApplyCliScenarioFixtures.ts`：对应 self-healing apply CLI scenario test 直接导入。

**推荐保留。** “生产 value importer=0”在这里是预期的测试隔离形态；测试 importer 是真实消费者。没有发现仓内 string-path loader，故不需要把它们误报为动态入口；但这不授权删除测试基建。

### B. Workflow

#### Live 主链

`/workflow` 是真实注册命令，不是仅测试命令：

```text
registry.ts
  → workflowCommandRuntime.ts
    → definition.ts / runner.ts / runStore.ts
      → runner.ts: DAGResolver + ParallelDispatcher
```

它读取项目 `.agents/workflows/*.json`，解析 dependency graph，运行真实 shell steps，并保存/读取 last run。`workflow.test.ts:245-343` 对 list/run/status、exit code、failed batch、skipped dependency、cycle、malformed definition 和 slash routing 做端到端验证。

#### Dormant helper lane

以下 5 个文件只有 `workflow.test.ts` 值导入：

- `adversarialRefuter.ts`：独立 reviewer/refuter pipeline；没有生产 consumer。
- `builderValidator.ts`：builder 与 independent validator 分离；没有生产 consumer。
- `cacheStaggering.ts`：按时间错开并发 dispatch；生产 `runner.ts` 使用的是 `ParallelDispatcher`，没有该 staggering contract。
- `contextInjector.ts`：从 memory store 注入 task context；只有测试值 consumer，同时以 type-only 依赖 `workflow/types.ts`。
- `pipelineExecutor.ts`：按 stage barrier 顺序执行；只有测试值 consumer，同时以 type-only 依赖 `workflow/types.ts`。

这些 helper 的责任没有被 `/workflow` 主链完整实现。主链使用 `definition/runner/runStore`，并不自动等价覆盖上述验证、refutation、context injection、staggering 或 stage-barrier API。**推荐物理保留并标 dormant/test-only；若维护者正式放弃这组实验性 API，再连同其测试一起做单独删除裁决。**

#### `teamStore.ts`

`TeamConfigManager` 和 `TaskStore` 在 `teamStore.ts:44-208` 实现：

- `~/.cheers/teams/{team}/config.json` membership；
- per-agent mailbox JSON；
- `~/.cheers/tasks/{team}` task files；
- `openSync(..., "wx")` lockfile claiming 与 dependency completion check。

当前仓内只有 `messagingAndTeams.test.ts:7` 值导入它。`core/tools/messagingTools.ts` 的 live-looking messaging surface 使用 `AgentRegistryScanner` 和 `SessionSocketClient`，没有直接接入 `TeamConfigManager`/`TaskStore`。由于未找到另一条活轨等价实现，**保留并登记 dormant/test-only**，不按可达性直接删除。

### C. Messaging host

`sessionSocketHost.ts:8-166` 提供：

- local UDS / Windows Named Pipe host；
- session token authentication；
- JSON-L framed message receive；
- inbox drain；
- zero-polling idle notification subscriptions；
- stop/cleanup。

当前唯一值 importer 是 `messagingAndTeams.test.ts:5`。但该文件不是纯类型、也没有被任何已确认 live lane 的替代 host 覆盖。**推荐 keep-and-investigate，而不是删除。**

`messaging/types.ts:1-42` 定义 `AgentDescriptor` 与 `MessagingFrame`（auth/message/subscribe_idle/idle_notice），被 `sessionSocketClient.ts`、`sessionSocketHost.ts`、`agentRegistryScanner.ts` 以 `import type` 使用；详见下表。

### D. Shell process tree

`processTree.ts:4-12,44-110` 是跨平台子进程树管理器：Windows 用 `taskkill /F /T /PID`，POSIX 用负 PID process group kill，并安装 SIGINT/SIGTERM/SIGHUP/exit handlers。当前只有 `processTree.test.ts:2-7` 值导入；测试覆盖 PID tracking 和不存在 PID 的 graceful kill。

它的责任不是普通 shell command rendering，未发现 live owner；而且文件本身就是进程管理安全边界。**推荐保留**，不要因“test-only importer”删除。

### E. Context layer model

`contextLayerModel.ts:1-115` 定义 live context layer taxonomy、retention/sensitivity/payload contract、`CONTEXT_LAYER_DEFINITIONS` 以及四个 predicate。`contextContinuityManifest.ts:1`、`contextStateProjection.ts:1` 以 type-only 依赖 `ContextLayerId`。这不是 dormant test helper，而是 live context model 的共享 contract；**保留**。

### F. Type contracts

以下文件都存在生产 `import type` 依赖；其 value-only 不可达不改变 TypeScript 编译依赖。删除任一个会使 importer 的模块解析或导出类型解析失败，不能按 dead leaf 处理。

| Contract | 生产 type importer 数 | 代表依赖文件 |
|---|---:|---|
| `core/commands/types.ts` | **54 个外部生产文件**；另有 3 个同 `core/commands/` 家族内生产 importer，合计 57 | `entrypoints/slashCommandRegistry.ts`、`registry.ts`、各 command runtimes、sidebar/CLI adapters |
| `core/messaging/types.ts` | **3** | `sessionSocketClient.ts`、`sessionSocketHost.ts`、`agentRegistryScanner.ts` |
| `core/shell/platform/types.ts` | **3** | `core/commands/shellCommandRuntime.ts`、`shellManager.ts`、`shellDetector.ts` |
| `core/subagents/types.ts` | **2** | `subagentLoader.ts`、`agentMemoryManager.ts` |
| `core/workflow/types.ts` | **3** | `dagResolver.ts`、`contextInjector.ts`、`pipelineExecutor.ts` |
| `core/agent/events.ts` | **5** | `turn/projection.ts`、`turn/session.ts`、`core/agent/{tools,loop,agent}.ts` |
| `core/hooks/types.ts` | **4** | `hookDispatcher.ts` 与 3 个 builtin hooks |
| `core/mcp/types.ts` | **8** | `entrypoints/mcpControlCliSurface.ts`、`core/mcp/{client,config,gateway,connectionManager}.ts`、`core/tools/registry.ts`、`config/types.ts` |
| `core/memory/types.ts` | **4** | `memoryCommandRuntime.ts`、`memoryTools.ts`、`memoryStore.ts`、`factArbiter.ts` |
| `core/research/types.ts` | **3** | `deepResearcher.ts`、`reportGenerator.ts`、`claimVoter.ts` |
| `core/shell/approval/types.ts` | **2** | `config/types.ts`、`core/shell/approval/evaluator.ts` |

计数脚本：

```bash
python3 /tmp/contract_importers.py
```

该脚本将 `.js` specifier 映射到 `.ts` 并跨行识别 import；输出显示上述生产 importer 均为 `TYPE`，没有 value importer。`core/commands/types.ts` 的 57 个生产 importer 中，3 个是同目录 command family 内边，因此按“外部 importer”口径为 **54**，与修正版总表一致。

### G. Misc contract family recommendation

以上 11 个 type contract 均建议 **保留**，不是删除候选。问题不是“是否还有 value caller”，而是“是否仍有生产类型消费者”；答案均为是。删除任何一个都必须先完成 contract migration，并同步所有 importer，不应以 singleton 或 value-only unreachable 标签直接删除。

- `core/commands/types.ts`：命令上下文、执行结果、注册定义；54 个外部生产 type importer，另 3 个同 family importer。
- `core/messaging/types.ts`：消息 frame 与 peer descriptor；3 个生产 importer。
- `core/shell/platform/types.ts`：平台与 shell backend contract；3 个生产 importer。
- `core/subagents/types.ts`：subagent definition、permission/isolation/memory contract；2 个生产 importer。
- `core/workflow/types.ts`：workflow task/stage/definition/state/DAG result contract；3 个生产 importer。
- `core/agent/events.ts`：agent lifecycle event union 与 event sink/listener；5 个生产 importer。
- `core/hooks/types.ts`：hook event、decision、payload、configuration contract；4 个生产 importer。
- `core/mcp/types.ts`：MCP transport/config/connection snapshot/tool-call contract；8 个生产 importer。
- `core/memory/types.ts`：memory fact/query/arbitration/stats contract；4 个生产 importer。
- `core/research/types.ts`：research query/learning/voted claim/report contract；3 个生产 importer。
- `core/shell/approval/types.ts`：permission behavior、grant、evaluation/persisted policy contract；2 个生产 importer。

## 六项检查

本报告唯一建议进入未来删除候选的是 `core/commands/authCommandRuntime.ts`；因此逐项执行 §2.2：

| 检查 | 结果 | 证据 |
|---|---|---|
| 1. 功能读审 | 通过 | `authCommandRuntime.ts:21-50` 实现 `/auth status\|set\|use\|logout`；`:116-231` 负责凭据写入、默认 provider、删除 credential、openai-compatible base URL/model 校验。 |
| 2. 等价实现核验 | 通过，但限定为 route responsibility | `connectCommandRuntime.ts:70-107` 注册 status/list/login/set/use/logout；`:199-225` 把 legacy `/auth set` 参数转换为 connection add；`connect/renderer.ts:187` 明确标注兼容路径。`/connect` 不是字节级复制，但覆盖了旧命令的 provider-management responsibility。 |
| 3. 消费者存活检查 | 通过 | 生产 `runAuthCommand` importer 为 0；唯一直接 importer 是 `authCommandRuntime.test.ts:6`。live registry 在 `registry.ts:125-135` dispatch `runConnectCommand`。 |
| 4. 动态入口检查 | 通过 | `git grep -n -E 'path\\.join\|pathToFileURL\|spawn(Sync)?\\(\|execFile(Sync)?\\(\|process\\.argv\|^#!\|(^\|[^A-Za-z])main\\(' -- packages/ts-shell/src/core/commands/authCommandRuntime.ts` 无命中。 |
| 5. 公共面检查 | 通过 | `git grep -n -E 'authCommandRuntime\\.js\|runAuthCommand' -- packages/ts-shell/src/index.ts scripts package.json` 无命中；未被 `index.ts` re-export。 |
| 6. scripts 引用检查 | 通过 | 同一精确路径扫描未发现 `scripts/`、`package.json` 或 package public surface 引用。 |

**删除触发条件：** 先将 `authCommandRuntime.test.ts` 的行为测试迁移到 `connectCommandRuntime.test.ts` 的 `/connect set/use/logout/status` 路径，或由维护者明确删除 legacy-only tests；再删除 `authCommandRuntime.ts` 并跑 targeted command tests。当前报告只作推荐，不执行物理删除。

## 风险与反证

- **反证 1：`core/workflow/` 不是全 dormant。** `/workflow` 在 `registry.ts:506-516` 是 available local command，且 `workflowCommandRuntime.ts` 读取真实 `.agents/workflows`、调用 `runner.ts`、写入 `runStore.ts`；只能把指定 6 个 helper 判为 dormant/test-only。
- **反证 2：测试 importer 不能升级为 live product consumer，但也不能忽略。** 删除 harness fixtures/reports 会直接断开 scenario tests；它们的职责就是测试基建。
- **反证 3：`import type` 不产生 value runtime edge，但是真实编译依赖。** `core/commands/types.ts`、`core/messaging/types.ts` 等文件的生产 importer 在 emit 后可擦除，却仍在 `tsc` 类型解析阶段被需要；删除不是安全的“只删死叶”。
- **反证 4：`teamStore.ts` 与 `sessionSocketHost.ts` 没有 live importer，不等于责任被覆盖。** 当前 `messagingTools.ts` 使用的是 scanner/client；没有找到 team mailbox、task lock claiming 或 host idle-notification 的等价 live owner。
- **反证 5：`browserRuntimeAdapterFixtures.ts` 的 `process.argv` 是生成 runner 脚本内容。** 它不构成仓内 fixture module loader，但仍是测试 child-process harness 的一部分，因此应保留。
- **反证 6：`authCommandRuntime.ts` 仍有测试价值。** 这不否定删除候选资格，只表示删除前必须迁移测试；否则会把行为回归风险伪装成“无生产 importer”。
- **反证 7：仓外消费者未覆盖。** 本报告检查仓内 `src/`、`scripts/`、`package.json` 和 `index.ts`，不证明未入仓插件、用户脚本或已发布 `dist` consumer 不存在。

## 未验证事项

- 未运行全量 `tsc`、全量 Vitest 或 build；本任务要求只做判定，不做仓库级验证。
- 未启动真实 CLI/TUI 做 runtime tracing；动态入口检查是静态 grep，不是运行时拦截。
- 未对 `teamStore.ts`、`sessionSocketHost.ts` 的仓外/未入仓使用做验证；建议未来删除前保留一次发布包/脚本 consumer 搜索。
- 未执行 `authCommandRuntime.ts` 的物理删除，因此“删除后编译/测试仍绿”不是本报告声称的结果；当前结论是“满足六项静态检查、但先迁移唯一测试再删”。
- corrected 93-singleton 总表由主代理提供并已采用；本报告对本目标文件的 importer 计数使用 `/tmp/core_counts2.py`、`/tmp/contract_importers.py` 与 `/tmp/live_importers.py` 复测，未重新输出其余非-core 48 个单例的逐文件表。
