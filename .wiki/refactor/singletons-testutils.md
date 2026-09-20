# 93 个单文件不可达组件：测试基建与测试专用产品代码裁决

## 结论

**93 个 singleton 中，语义上明确属于测试 / 评测基建的是 19 个，不是 42 个。** 算术是：**18 个静态基建单例 + 1 个动态测试入口 = 19**。

- **18 个静态测试 / 评测基建** = `test-utils/` 的 6 个普通文件 + `core/harness/` 的 8 个 singleton + `eval/browser/` 的 3 个 benchmark 文件 + `browser/runtime/core/gauntletManifest.ts` 1 个场景元数据 wrapper。
- **再加 1 个动态测试入口**：`test-utils/longSessionDurabilityProcess.ts`。它不在静态 test-only importer 类别中，但由 `spawnSync` 通过字符串路径启动。
- **42 个“仅测试导入”**是导入图的机械分类，不等于 42 个脚手架。按严格静态集合，42 = 17 个静态基建单例 + 25 个产品模块自测；`eval/browser/benchmarkModel.ts` 是混合 type-contract/test 文件，动态 process 则是 zero-importer，因此不属于这 42 个的严格子集。
- 作为宽口径 headline，`42 - 19 = 23` 表示“仅测试引用集合”与完整语义基建集合之间的差额；更严格的集合拆分见本报告 §G（17 + 25），避免把不同基数混算。
- 另有 **47 个单例存在外部生产 type-only importer**；它们是编译契约，不是死叶，删除会破坏类型检查。这个数字来自维护者给出的修正版口径（12 个 type-contract-only + 35 个 type-contract + test）。
- 因此，本轮“测试基础设施是否只是死代码”的答案是：**19 / 93 是明确测试基建；其余 74 个不能因为不可达或仅有测试引用就直接称为 dead product code。**

**推荐总则：**

1. `test-utils/` 中的 `cleanup.ts`、`cliHarness.ts`、`longSessionContinuityFixtures.ts`、`stoppedRecoveryFixture.ts`、`terminalDouble.ts` 都是测试 seam，应保留。
2. `longSessionDurabilityProcess.ts` 虽然没有静态 importer，但由 `spawnSync` 通过字符串路径启动，属于动态测试入口，必须保留。
3. `core/harness/` 场景 fixture/report 与 `eval/browser/benchmark*.ts` 是被实际 suite 消费的测试 / 评测基建，应保留，不应按“生产不可达”删除。
4. `ptyCapabilityDetector.ts` 是唯一明显的“只测自己、没有真实消费者”的测试工具；它可以作为**单独删除候选**，但删除的是测试 seam 和其自测，不是产品替代。
5. `gauntletManifest.ts` 是一个 25 行的测试场景元数据 wrapper，不是产品运行时配置；它只有一个 gauntlet 测试消费者，可以作为另一个**薄胶水删除候选**，或直接把 `taskCount` 断言内联到测试。它不是 live product lane。
6. 其余 25 个“仅测试导入”的模块是产品语义模块（命令、策略、会话、结果、workflow、adapter 等），测试直接调用它们不等于它们是测试基建；本轮不建议删除。

---

## 实测证据

### 1. 93 个单例的修正版口径

修正版分类由维护者提供，且我用当前树的多行 import 解析器复核了文件名单：

```text
93 total
zero importer                         4   （维护者原始候选名单）
type-contract-only                   12
 test-only                           42
type-contract + test                35
```

因此维护者口径下有 `12 + 35 = 47` 个单例存在外部生产 type-only 依赖。

复现命令：

```bash
python3 /tmp/reclass2.py
```

当前命令输出的关键结果：

```text
total 93: zero=4 type-contract-only=12 test-only=42 other=35
```

> 说明：`/tmp/reclass2.py` 是维护者修正版口径的复现探针，使用 `.js -> .ts` 解析并支持多行 `import type`。它仍只匹配双引号，因此下面的单引号 type-only 反证必须用源码直接读取补充。

### 2. zero-importer 的口径反证

维护者最初列出的 4 个 zero-importer 是：

- `core/query/runtime/actionAuthority.ts`
- `core/query/runtime/proof.ts`
- `session/replay/host/facts.ts`
- `test-utils/longSessionDurabilityProcess.ts`

但当前树直接读取显示，前两个并非“全仓无 importer”：

- `core/query/runtime/batch.ts:6` 有 `import type { RuntimeActionBlock } from './actionAuthority.js'`。
- `core/query/runtime/events.ts:12` 有 `import type { QueryRuntimeProofProjection } from './proof.js'`。

命令：

```bash
git grep -n -E 'actionAuthority\\.(js|ts)|query/runtime/proof\\.(js|ts)|replay/host/facts\\.(js|ts)' -- packages/ts-shell/src
```

输出中的当前 type-only 边：

```text
packages/ts-shell/src/core/query/runtime/batch.ts:6:import type { RuntimeActionBlock } from './actionAuthority.js'
packages/ts-shell/src/core/query/runtime/events.ts:12:import type { QueryRuntimeProofProjection } from './proof.js'
```

因此应把两套事实分开写：

- **按维护者“外部 live type importer”口径：47 个外部 type-contract 仍成立。** `batch.ts` / `events.ts` 是不可达 query-runtime 子系统内的 type-only 连接，并不是 live CLI importer。
- **按“当前源码所有静态 importer”口径：真正完全无静态 importer 的文件是 `session/replay/host/facts.ts` 与 `test-utils/longSessionDurabilityProcess.ts`。** `actionAuthority.ts` 与 `proof.ts` 不能被称为绝对 zero-importer，只能称为无 live importer、但有 dormant internal type importer。

这是 scope / regex 口径差异，不应再把“4 / 2 / 3”混成一个未解释的数字。

### 3. `test-utils/` 行数与测试破坏成本

命令：

```bash
wc -l \
  packages/ts-shell/src/test-utils/cleanup.ts \
  packages/ts-shell/src/test-utils/cliHarness.ts \
  packages/ts-shell/src/test-utils/longSessionContinuityFixtures.ts \
  packages/ts-shell/src/test-utils/ptyCapabilityDetector.ts \
  packages/ts-shell/src/test-utils/stoppedRecoveryFixture.ts \
  packages/ts-shell/src/test-utils/terminalDouble.ts
```

输出：

```text
15  cleanup.ts
368 cliHarness.ts
337 longSessionContinuityFixtures.ts
129 ptyCapabilityDetector.ts
685 stoppedRecoveryFixture.ts
104 terminalDouble.ts
1638 total
```

为了计算删除六个文件会断多少个测试文件，我对所有 `packages/ts-shell/src/**/*.ts` 做了相对 import 解析，并取六个 importer 集合的并集。

命令：

```bash
python3 /tmp/count_test_files.py
```

输出：

```text
distinct_test_files 10
```

10 个会直接断链的测试文件：

```text
cli-baseline.test.ts
cli/interactive/firstFrame.test.ts
cli/interactive/interactiveMode.test.ts
core/shell/sessionRuntime.test.ts
core/tools/registry-rust-bridge.test.ts
entrypoints/cliDoctor.test.ts
observability/traceContext.e2e.test.ts
presentation/tui/render/engine.test.ts
session/SessionManager.test.ts
test-utils/ptyCapabilityDetector.test.ts
```

六个文件的直接 test importer 数：

| 文件 | 直接测试文件数 | 测试文件 |
|---|---:|---|
| `test-utils/cleanup.ts` | 3 | `core/tools/registry-rust-bridge.test.ts`; `entrypoints/cliDoctor.test.ts`; `observability/traceContext.e2e.test.ts` |
| `test-utils/cliHarness.ts` | 1 | `cli-baseline.test.ts` |
| `test-utils/longSessionContinuityFixtures.ts` | 3 | `cli-baseline.test.ts`; `core/shell/sessionRuntime.test.ts`; `session/SessionManager.test.ts` |
| `test-utils/ptyCapabilityDetector.ts` | 1 | `test-utils/ptyCapabilityDetector.test.ts` |
| `test-utils/stoppedRecoveryFixture.ts` | 2 | `cli-baseline.test.ts`; `core/shell/sessionRuntime.test.ts` |
| `test-utils/terminalDouble.ts` | 3 | `cli/interactive/firstFrame.test.ts`; `cli/interactive/interactiveMode.test.ts`; `presentation/tui/render/engine.test.ts` |
| **并集** | **10** | 同一测试文件被多个 utility import 时只计一次 |

这验证了 `plan.md §1` 中“删除会连带处理大量测试”的方向，但当前六文件 slice 的精确成本是 **10 个测试文件**，不是约 75 个。旧的约 75 数字是更大范围的历史不可达集合，不应拿来替代本 slice 的实测数。

### 4. 测试 suite 确实收集这些文件

`packages/ts-shell/package.json:18` 定义：

```json
"test": "vitest run"
```

`packages/ts-shell/vitest.config.ts:3-10` 使用 Node 环境，并把 browser / CLI scenario suite 的 timeout 设为 30 秒，因为这些测试会启动真实子进程。

命令：

```bash
cd packages/ts-shell
npx vitest run \
  src/test-utils/ptyCapabilityDetector.test.ts \
  src/cli/interactive/firstFrame.test.ts \
  src/cli/interactive/interactiveMode.test.ts \
  src/presentation/tui/render/engine.test.ts
```

实测：

```text
Test Files  4 passed (4)
Tests       42 passed (42)
```

场景 fixture 代表性套件：

```bash
cd packages/ts-shell
npx vitest run \
  src/core/harness/browserRuntimeGauntletScenarios.test.ts \
  src/core/harness/browserCliExecutionScenarioExamples.test.ts \
  src/core/harness/browserPlaywrightLocalScenarioExamples.test.ts \
  src/core/harness/browserExternalNetworkHandoffScenarioExamples.test.ts \
  src/core/harness/browserPublicReadOnlyWebScenarioExamples.test.ts \
  src/core/harness/browserPublicReadOnlyWebSmokeScenario.test.ts \
  src/core/harness/browserReadOnlyExtractionScenarioExamples.test.ts \
  src/core/harness/browserRuntimeCapabilityScenarioExamples.test.ts \
  src/core/harness/browserRuntimeAdapterScenarioExamples.test.ts \
  src/core/harness/browserSelfHealingApplyCliScenarioExamples.test.ts \
  src/core/harness/agentScenarioExamples.test.ts \
  src/core/harness/browserCacheMultiprocessScenarioExamples.test.ts
```

实测：

```text
Test Files  12 passed (12)
Tests       87 passed | 1 skipped (88)
```

这不是全量 suite 结论；它是本 slice 相关测试已被当前 Vitest 配置收集且通过的 focused proof。

---

## 逐类分析

### A. 六个 `test-utils/` 文件

| 文件 | 测试 importer 数 | 测试名称 | 测试的是文件本身，还是 live behavior through it? | 推荐 |
|---|---:|---|---|---|
| `test-utils/cleanup.ts` | 3 | `core/tools/registry-rust-bridge.test.ts`; `entrypoints/cliDoctor.test.ts`; `observability/traceContext.e2e.test.ts` | **Live behavior through it。** 三个测试分别验证 Rust bridge、CLI doctor、observability trace；`safeRemoveDir` 只是临时目录 teardown，没有测试把 retry helper 当产品功能断言。 | **KEEP**。共享 teardown seam。 |
| `test-utils/cliHarness.ts` | 1 | `cli-baseline.test.ts` | **Live behavior through it。** `runCliCommandToClose`、`runCliStdinToClose`、`runInteractiveStartupSmoke`、`runInteractiveLineSmoke`、`runInteractiveEofSmoke` 启动真实 CLI 子进程、发送 stdin / EOF，并断言用户可见输出、session id 与退出状态；`createGitRepoFixture` 为 CLI 诊断建立真实 git workspace。 | **KEEP**。不是 harness 自测，是 CLI entrypoint 行为测试的 seam。 |
| `test-utils/longSessionContinuityFixtures.ts` | 3 | `cli-baseline.test.ts`; `core/shell/sessionRuntime.test.ts`; `session/SessionManager.test.ts` | **Live behavior through it。** fixture 写入 session、prompt、event、failure 与 state；测试随后驱动真实 `SessionManager`、`ShellSessionRuntime`、reload / compact / `/continue` 流程，断言 snapshot、context、handoff 与 CLI 输出，不断言 fixture 自己的实现。 | **KEEP**。跨 CLI / runtime / SessionManager 的共享状态 builder。 |
| `test-utils/ptyCapabilityDetector.ts` | 1 | `test-utils/ptyCapabilityDetector.test.ts` | **Unit-testing the file itself。** 6 项测试直接调用 `detectPtyCapability` / `formatPtyUnavailableSkipMessage`，覆盖 unavailable、approved strategy、probe success、structured failure、EPERM 与 skip message；没有 PTY smoke 或生产模块消费者。设计文档还明确写着未来 PTY 分支尚未接入。 | **DELETE CANDIDATE**。若当前不立即接入真实 PTY smoke，可删 source + self-test；这不是删除 live 产品能力。 |
| `test-utils/stoppedRecoveryFixture.ts` | 2 | `cli-baseline.test.ts`; `core/shell/sessionRuntime.test.ts` | **Live behavior through it。** 三组 seed 函数把 metadata、state、transcript、changed files、write effect 与 stop reason 写入真实 session layout；测试再跑真实 CLI print / `/continue` 或 `ShellSessionRuntime`，断言 blocker、next action、write provenance、handoff 与 changed files。 | **KEEP**。685 行虽然大，但它承载的是 persisted stopped-session recovery 的测试 seam。 |
| `test-utils/terminalDouble.ts` | 3 | `cli/interactive/firstFrame.test.ts`; `cli/interactive/interactiveMode.test.ts`; `presentation/tui/render/engine.test.ts` | **Live behavior through it。** `RecordingTerminal` / `ManualScheduler` 注入真实 `InteractiveMode` 与 TUI renderer；测试观察 bytes、resize、input、frame timing 与 escape sequences，不把 double 本身当产品行为。 | **KEEP**。没有真实 TTY 时仍能验证 composed terminal behavior。 |

#### 重点：`cliHarness.ts` 与 `stoppedRecoveryFixture.ts`

这两个大文件都不是“测试它自己”：

- `cliHarness.ts` 的核心调用点在 `cli-baseline.test.ts` 的 interactive startup / line / EOF / closed CLI 场景；它驱动真实 `entrypoints/cli`。
- `stoppedRecoveryFixture.ts` 的核心调用点在 `cli-baseline.test.ts` 与 `core/shell/sessionRuntime.test.ts`；fixture 只准备磁盘状态，真正被断言的是 live recovery / continuation。

因此删除它们不是“删两个低价值 helper”，而是删除 CLI baseline 与 stopped-session 行为测试的共同输入 seam。

### B. 动态测试入口：`test-utils/longSessionDurabilityProcess.ts`

它没有静态 importer，但不能删除：

- `longSessionDurabilityProcess.ts:38-53` 读取 `process.argv`，按 `seed` / `append-unrelated` / `continue` 分发。
- `session/longSessionDurability.test.ts:222-232` 用 `path.join(process.cwd(), "src", "test-utils", "longSessionDurabilityProcess.ts")` 组装字符串路径，再以 `spawnSync(process.execPath, [tsxCli, fixturePath, ...])` 启动。
- `scripts/verify-session-durability-long.mjs:34-41` 执行 `src/session/longSessionDurability.test.ts` 作为 focused gate。

这正是 §2.2 动态入口检查保护的 `*Process.ts` / string-path spawn 形态。**推荐 KEEP。**

### C. `core/harness` 的 8 个 singleton 文件

当前 singleton 清单中的 8 个 `core/harness` 文件如下。另有 `browserExternalRunnerScenarioFixtures.ts`、`browserPersistentReplayScenarioFixtures.ts`、`browserReplayScenarioFixtures.ts`、`browserSkillExecutionScenarioFixtures.ts` 等 fixture 文件，但它们位于多文件不可达组件，不应从这个 singleton slice 摘出单独处置。

`core/harness/README.md:1-20` 明确说明：这是 browser / CLI / agent-scenario / replay / cache / Playwright 的 dev/eval harness，不是 product runtime ownership boundary；现有 tests / fixtures 为 route provenance 与 focused transaction gates 保留。

| 文件 | 测试 importer 数与名称 | 形态 | 删除后断裂 | 推荐 |
|---|---:|---|---|---|
| `core/harness/agentScenarioReport.ts` | 1：`agentScenarioExamples.test.ts` | 场景 runner 产出后渲染报告；不是产品 presentation。 | agent scenario foundation test 无法加载 report renderer。 | **KEEP**。 |
| `core/harness/browserCacheMultiprocessReport.ts` | 2：`browserCacheMultiprocessReport.test.ts`; `browserCacheMultiprocessScenarioExamples.test.ts` | 前者是 report renderer 的直接 unit test；后者是 cache multiprocess live-behavior scenario 的报告输出。 | report self-test 与 cache scenario suite 都在 import 阶段失败。 | **KEEP**。 |
| `core/harness/browserCliScenarioFixtures.ts` | 2：`browserCliExecutionScenarioExamples.test.ts`; `browserPlaywrightLocalScenarioExamples.test.ts` | 创建临时 local-fixture manifest、env 与 cleanup；测试真实 CLI/browser bridge。 | local fixture CLI 与 Playwright-local scenario 无法建立 manifest。 | **KEEP**。 |
| `core/harness/browserExternalNetworkHandoffScenarioFixtures.ts` | 1：`browserExternalNetworkHandoffScenarioExamples.test.ts` | 创建 external-network handoff manifest/env；测试真实 CLI handoff / blocked path。 | Route 117 scenario 无法加载。 | **KEEP**。 |
| `core/harness/browserPlaywrightAdapterSpikeFixtures.ts` | 1：`browserPlaywrightAdapterSpikeScenarios.test.ts` | 创建 injected Playwright-like client、availability variants、runtime manifest；测试 adapter evidence / availability 行为。 | adapter spike scenarios 无法创建 client 与 manifest。 | **KEEP**。 |
| `core/harness/browserPublicReadOnlyWebScenarioFixtures.ts` | 4：`browserPublicReadOnlyWebScenarioExamples.test.ts`; `browserPublicReadOnlyWebSmokeScenario.test.ts`; `browserReadOnlyExtractionScenarioExamples.test.ts`; `browserRuntimeCapabilityScenarioExamples.test.ts` | 注入 HTTP responses、request capture、manifest、confirm env 与 cleanup；测试 public read-only behavior。 | 四个 public-web / extraction / runtime-capability suite 断裂。 | **KEEP**。 |
| `core/harness/browserRuntimeAdapterFixtures.ts` | 2：`browserRuntimeAdapterScenarioExamples.test.ts`; `browserRuntimeGauntletScenarios.test.ts` | 创建真实 adapter scenario 的 controlled fixture；测试 DOM / click / type / selector repair / reporting。 | runtime adapter 与 gauntlet scenario 无法加载。 | **KEEP**。 |
| `core/harness/browserSelfHealingApplyCliScenarioFixtures.ts` | 1：`browserSelfHealingApplyCliScenarioExamples.test.ts` | 创建 external-runner / skill-runner / local-fixture manifest，proposal id、invalid manifest 与 cleanup；测试 CLI self-healing / apply。 | Route 115 CLI self-healing suite 在 import 阶段失败。 | **KEEP**。 |

这些 fixture 的测试确实进入 suite：相关 12 个 Vitest 文件本轮 focused run 为 **87 passed / 1 skipped**。因此“只有 test importer”在这里的真实含义是“测试基建”，不是“无消费者”。

### D. `eval/browser` 三文件

| 文件 | 测试 importer / 形态 | 判断 | 推荐 |
|---|---|---|---|
| `eval/browser/benchmarkModel.ts` | 3 个 scenario tests 以 `import type` 使用：`browserPlaywrightAdapterSpikeScenarios.test.ts`; `browserRuntimeCapabilityScenarioExamples.test.ts`; `browserRuntimeGauntletScenarios.test.ts`；同时被 `benchmarkRunner.ts` / `benchmarkReport.ts` 作为 harness 类型契约导入。 | **评测契约 / test infrastructure。** 它描述 benchmark task / score，不是 live product result contract。 | **KEEP**。 |
| `eval/browser/benchmarkRunner.ts` | 3 个 scenario tests：同上三者；函数把 task 送入 `runBrowserActionLoopExecutor`，产生 scores。 | **Live behavior through benchmark harness。** 测试驱动真实 browser action loop，不是测试 runner 自己。 | **KEEP**。 |
| `eval/browser/benchmarkReport.ts` | 3 个 scenario tests：同上三者；由 scores 生成 report，断言 score、status、no-provider/no-network 与 redaction。 | **Live behavior through benchmark reporting seam。** | **KEEP**。 |

### E. `browser/runtime/core/gauntletManifest.ts`

| 文件 | 测试 importer | 测试形态 | 推荐 |
|---|---:|---|---|
| `browser/runtime/core/gauntletManifest.ts` | 1：`core/harness/browserRuntimeGauntletScenarios.test.ts` | `browserRuntimeGauntletScenarios.test.ts:56-68` 已经由 `runBrowserEvalBenchmark` 产生真实 scores/report，`gauntletManifest.ts` 只提供 `taskCount` 与固定 capabilities；测试只断言 `gauntlet.taskCount === tasks.length` 以及 benchmark report 的结果。没有生产 importer，也没有 index/scripts/public export。 | **薄胶水删除候选**：可以把 `taskCount` 断言内联到 scenario，删除此 wrapper 与其单一测试 import；但这不是 live product deletion，也不是本轮必须施工。若维护者希望保留 route-era metadata，则 KEEP。 |

### F. 其余 25 个“仅测试导入”模块：是产品代码，不是测试基建

下面这些文件属于 42 个 test-only importer，但它们被自己的测试直接验证产品语义。它们不应与 `test-utils/` / `core/harness` 混为一谈：

| 产品模块 | 直接测试文件 | 测试的是它本身还是 through it | 推荐 |
|---|---|---|---|
| `browser/skill/runner/manifest.ts` | `browser/skill/runner/manifest.test.ts` | **Self-test**：manifest creation / serialization / validation / unsafe execution claim rejection。 | **KEEP**，或未来随 skill-manifest contract 一起退休。 |
| `cli/interactive/interactiveCancellation.ts` | `cli/interactive/interactiveCancellation.test.ts` | **Self-test**：double-Esc timing 与 cancellation message。 | **KEEP**；这是 CLI interaction product behavior。 |
| `context/compact/governance/contextAnalysis.ts` | `context/compact/governance/contextGovernance.test.ts` | **Self-test**：token/category health auditing。 | **KEEP**；未证明 live owner 已接管该 contract。 |
| `core/commands/authCommandRuntime.ts` | `core/commands/authCommandRuntime.test.ts` | **Self-test** legacy `/auth` runtime；这是唯一已有 named live replacement 的产品候选，`/connect` lane 已取代 `/auth`。 | **删除候选**，但须按 §2.2 完成最终六项检查并同步移除其自测。 |
| `core/messaging/sessionSocketHost.ts` | `core/messaging/messagingAndTeams.test.ts` | **Live messaging behavior through it**：与 client / team store / tools 组合验证 socket host。 | **KEEP**；不是 fixture。 |
| `core/security/projectTrust.ts` | `core/security/projectTrust.test.ts` | **Self-test** project trust store / sandbox decision。 | **KEEP**；未证明 live security owner 等价接管。 |
| `core/shell/platform/processTree.ts` | `core/shell/platform/processTree.test.ts` | **Self-test** process tree lifecycle。 | **KEEP**；平台能力边界，不能凭 test-only 删除。 |
| `core/workflow/adversarialRefuter.ts` | `core/workflow/workflow.test.ts` | **Integrated workflow test**：workflow pipeline 直接实例化 refuter。 | **KEEP**。 |
| `core/workflow/builderValidator.ts` | `core/workflow/workflow.test.ts` | **Integrated workflow test**：builder validation pipeline。 | **KEEP**。 |
| `core/workflow/cacheStaggering.ts` | `core/workflow/workflow.test.ts` | **Integrated workflow test**：cache staggering dispatcher。 | **KEEP**。 |
| `core/workflow/contextInjector.ts` | `core/workflow/workflow.test.ts` | **Integrated workflow test**：context injector。 | **KEEP**。 |
| `core/workflow/pipelineExecutor.ts` | `core/workflow/workflow.test.ts` | **Integrated workflow test**：pipeline executor。 | **KEEP**。 |
| `core/workflow/teamStore.ts` | `core/messaging/messagingAndTeams.test.ts` | **Live messaging/team behavior through it**：team config/task store。 | **KEEP**。 |
| `model-adapters/multimodal.ts` | `model-adapters/strictAndMultimodal.test.ts` | **Self-test** adapter normalization / multimodal contract。 | **KEEP**。 |
| `model-adapters/strictSchema.ts` | `model-adapters/strictAndMultimodal.test.ts` | **Self-test** strict schema adapter。 | **KEEP**。 |
| `provider/liveProviderSmokeFallback.ts` | `provider/liveProviderSmokeFallback.test.ts` | **Self-test** fallback decision / single retry semantics。 | **KEEP**；provider operational contract。 |
| `repair/handoff/readiness.ts` | `repair/handoff/readiness.test.ts` | **Self-test** repair handoff readiness classification。 | **KEEP**；truthfulness / readiness contract。 |
| `result/host/verdict.ts` | `result/host/verdict.test.ts` | **Self-test** host truth projection。 | **KEEP**；结果真实性边界。 |
| `runtime/events/stream.ts` | `runtime/events/stream.test.ts`; `tools/toolHandoff.test.ts` | **Mixed**：一个直接自测 stream，另一个通过 tool handoff 使用它；但仍是 runtime event contract，不是 test helper。 | **KEEP**，与 `runtime/events/projection.ts` 成簇保留。 |
| `session/presentation/facts.ts` | `session/presentation/facts.test.ts` | **Self-test** session presentation facts。 | **KEEP**；没有 live equivalent proof。 |
| `session/recovery/sessionReconciler.ts` | `session/recovery/sessionReconciler.test.ts` | **Self-test** dangling tool-call reconciliation。 | **KEEP**。 |
| `session/sessionDagEngine.ts` | `session/sessionDagEngine.test.ts` | **Self-test** JSONL session DAG persistence / branch semantics。 | **KEEP**；未接线不等于 live lane 已替代。 |
| `session/store/threadState.ts` | `session/store/threadState.test.ts` | **Self-test** branch switching / compaction facts。 | **KEEP**。 |
| `tools/result/split.ts` | `tools/result/split.test.ts`; `tools/toolBatchDispatch.test.ts` | **Mixed**：一个直接测试 split，另一个通过 tool batch dispatch 使用 split 语义。 | **KEEP**；tool result contract。 |
| `workflow/gitChangeSetAttribution.ts` | `workflow/gitChangeSetAttribution.test.ts` | **Self-test** git change-set attribution。 | **KEEP**；删除前需证明 live workflow 已逐字段接管。 |

这 25 个文件的共同结论是：**测试是它们当前唯一的 value caller，但被测的是产品语义本身；它们不是可直接删除的“测试基建”。** 若维护者要放弃其中某项能力，应先做明确产品 retirement，再删除实现与测试；不可把“test-only importer”当作授权。

### G. 42 个 test-only importer 的汇总表

为了避免数字混淆，42 个机械 test-only 文件按语义分为：

| 语义类别 | 数量 | 文件集合 |
|---|---:|---|
| 测试 / 评测基建（静态 importer） | 17 | `browser/runtime/core/gauntletManifest.ts`; 8 个 singleton `core/harness` 文件; `eval/browser/benchmarkReport.ts`; `eval/browser/benchmarkRunner.ts`; 6 个普通 `test-utils` 文件 |
| 产品代码，但当前仅被测试 value-import | 25 | 上一节列出的 `browser/skill/runner/manifest.ts`、CLI/context/core/workflow/model-adapters/provider/repair/result/runtime/session/tools/workflow 文件 |
| **机械 test-only 合计** | **42** | 17 + 25 |
| 另加动态测试入口 | +1 | `test-utils/longSessionDurabilityProcess.ts` |
| 另加 harness-owned benchmark type contract | +1 | `eval/browser/benchmarkModel.ts` |
| **语义测试 / 评测基建合计** | **19** | 17 + 1 动态入口 + 1 benchmark type contract |

---

## core/harness fixture verdict

用户特别点名的 `core/harness/*ScenarioFixtures.ts` 需要先验证是否真的被 suite 消费，而不能只看“有 test importer”。当前目录共有 11 个 `*ScenarioFixtures.ts` 文件；其中 8 个在 93 singleton 清单中，另外 4 个（external runner / persistent replay / replay / skill execution）属于多文件不可达组件，不应从组件中单摘。

### 8 个 singleton fixture/report 的测试侧结论

- `agentScenarioFixtures.ts` 被 `agentScenarioExamples.test.ts`、`browserLocalExecutionScenarioExamples.test.ts`、`browserSandboxScenarioExamples.test.ts`、`browserScenarioExamples.test.ts` 使用；同时被 `agentScenarioRunner.ts` 使用。删除会让 scenario context、memory seeding、validation evidence 与 runner fixture step 同时断裂。
- `browserCliScenarioFixtures.ts` 被 `browserCliExecutionScenarioExamples.test.ts`、`browserPlaywrightLocalScenarioExamples.test.ts` 使用；删除会让真实 CLI local-fixture manifest/env setup 消失。
- `browserExternalNetworkHandoffScenarioFixtures.ts` 被 `browserExternalNetworkHandoffScenarioExamples.test.ts` 使用；删除会让 handoff manifest/env setup 消失。
- `browserPlaywrightAdapterSpikeFixtures.ts` 被 `browserPlaywrightAdapterSpikeScenarios.test.ts` 使用；删除会让 injected Playwright-like client、availability variants 与 evidence fixture 消失。
- `browserPublicReadOnlyWebScenarioFixtures.ts` 被 4 个场景测试使用；删除会让 injected HTTP responses、request capture、manifest、confirmation env 与 cleanup 消失。
- `browserRuntimeAdapterFixtures.ts` 被 `browserRuntimeAdapterScenarioExamples.test.ts` 与 `browserRuntimeGauntletScenarios.test.ts` 使用；删除会让 controlled runtime page / adapter fixture 消失。
- `browserSelfHealingApplyCliScenarioFixtures.ts` 被 `browserSelfHealingApplyCliScenarioExamples.test.ts` 使用；删除会让 manifest variants、proposal ids、invalid manifest 与 cleanup 消失。
- `browserCacheMultiprocessReport.ts` 被 `browserCacheMultiprocessReport.test.ts` 与 `browserCacheMultiprocessScenarioExamples.test.ts` 使用；它是 report layer，不是 product report surface。

这些测试文件确实被当前 package Vitest 收集；本轮 12-file focused run 为 **87 passed / 1 skipped**。因此 verdict 是：**保留。它们是测试 seam，删除会直接破坏 live-behavior tests 的 setup，而不是只删除“测试 fixture 自己的测试”。**

---

## 六项检查

本报告只有两个明确删除候选：`ptyCapabilityDetector.ts` 与薄胶水 `gauntletManifest.ts`。`authCommandRuntime.ts` 是另一个产品删除候选，但它属于 core 产品代码，已由 core / command 负责人单独裁决；本报告不把它算作测试基建删除。

### 候选 1：`test-utils/ptyCapabilityDetector.ts`

| 检查 | 结果 |
|---|---|
| 1. 功能读审 | 文件只做 PTY capability status / unavailable reason / skip-message 结构化；`ptyCapabilityDetector.design.md:1-21` 明确说明这是未来 PTY smoke 的 test-only helper。 |
| 2. 等价实现核验 | 当前没有 approved `node-pty` / external PTY probe，也没有真实 PTY smoke consumer；pipe-spawn CLI harness 不等价于 PTY。 |
| 3. 消费者存活检查 | 生产 value consumer = 0；外部 test consumer = 0；只有 `test-utils/ptyCapabilityDetector.test.ts:3-5` 自测。 |
| 4. 动态入口检查 | `git grep` 对该文件没有 `spawn` / `process.argv` / `pathToFileURL` / `main()`；不是动态入口。 |
| 5. 公共面检查 | 未发现 `packages/ts-shell/src/index.ts` export；不属于 package public API。 |
| 6. scripts 引用检查 | 未发现 `scripts/` 对其路径引用；设计文档与自测不是生产脚本消费。 |

**裁决：DELETE CANDIDATE。** 若删除，必须同步删除 `ptyCapabilityDetector.test.ts`；删除后影响 1 个测试文件、6 个测试项，但不影响 live CLI / session / PTY behavior，因为当前并无 PTY runner。

### 候选 2：`browser/runtime/core/gauntletManifest.ts`

| 检查 | 结果 |
|---|---|
| 1. 功能读审 | 25 行固定 metadata wrapper：manifest id、task count、required capabilities、no-network / no-provider / raw-content excluded。 |
| 2. 等价实现核验 | `eval/browser/benchmarkRunner.ts` + `benchmarkReport.ts` 已承担 task execution、score、status、no-provider/no-network evidence；gauntlet wrapper 只提供固定标签和 count，未发现独立 live responsibility。 |
| 3. 消费者存活检查 | 生产 value consumer = 0；唯一 consumer 是 `core/harness/browserRuntimeGauntletScenarios.test.ts:7`，只在 `:62-65` 断言 `taskCount`。 |
| 4. 动态入口检查 | 文件无 `spawn`、`process.argv`、dynamic import、shebang、main。 |
| 5. 公共面检查 | 未发现 index / package exports / public API export。 |
| 6. scripts 引用检查 | 未发现 scripts 字符串路径引用；只有 gauntlet scenario test。 |

**裁决：薄胶水 DELETE CANDIDATE / 可内联。** 建议先把 `expect(tasks.length).toBe(...)` 或等价 count assertion 内联到 gauntlet test，再删 wrapper；若要保留 route-era manifest label，则 keep 也合理。它不应被描述成 live product config。

### `longSessionDurabilityProcess.ts` 不得走“zero importer 六项删除”模板

它的第 4 项动态入口检查明确失败（存在 `process.argv` 与 `spawnSync` 字符串路径启动链），且 §2.5 的动态入口保护类直接命中。因此它不是删除候选。

---

## 风险与反证

1. **“只有测试 importer”不等于测试基建。** 本轮实测 42 个静态 test-only 文件中，25 个是产品语义模块；测试直接调用它们是 product unit / integration coverage，不是 fixture 消费。
2. **“不可达”不等于“职责已被活轨承担”。** `core/security/projectTrust.ts`、`session/sessionDagEngine.ts`、`runtime/events/stream.ts`、`workflow/gitChangeSetAttribution.ts` 等都有独立 contract；邻近 live sibling 不能自动证明等价替代。
3. **测试 fixture 删除会破坏行为测试。** `cliHarness.ts` 与 `stoppedRecoveryFixture.ts` 不是自测对象，而是把真实 CLI / shell runtime 接到 persisted fixture state 的唯一 seam；删除会令 `cli-baseline.test.ts` 与 `sessionRuntime.test.ts` 在 setup / import 处失败。
4. **`core/harness` 目录是显式测试 / eval ownership。** README 明说它不是 product runtime boundary，但这恰好说明“没有生产 importer”是预期形态，不是删除授权。
5. **`gauntletManifest.ts` 是例外。** 它没有 fixture state、runner process 或 broad harness setup，只有一个 test metadata wrapper；所以它才是测试基建中最像可删除薄胶水的文件。
6. **zero-importer 口径存在内部 type-only 边。** `actionAuthority.ts` ← `batch.ts:6`、`proof.ts` ← `events.ts:12` 的边说明不能把 4-file 历史候选表当作当前所有静态 importer 的最终事实。外部 live type-contract 的 47 数字仍应与 dormant internal type edge 分开。
7. **脚本 / 外部使用仍可能超出源码 import 图。** 本报告已核对已知 `scripts/verify-session-durability-long.mjs`，但仓库外部调用者、未入仓插件、构建后路径注册未全面验证。
8. **本报告的 focused test 通过不等于全量 suite 通过。** 它只证明相关 utility seam 与 scenario files 在当前 package Vitest 配置下可收集、可运行；没有把 focused green 升级成全量验证结论。

---

## 未验证事项

- 未运行全量 Vitest、`npm run build` 或删除模拟；本任务要求的是裁决报告，且没有修改现有源码。
- `browser/runtime/core/gauntletManifest.ts` 的删除需要维护者决定是否保留 route-era evidence label；报告只判为薄胶水候选，不宣称已获施工授权。
- `ptyCapabilityDetector.ts` 的删除需要维护者确认未来 PTY smoke 是否会在近期接入；当前证据显示没有消费者，但设计文档保留了未来 API 方向。
- `core/harness` 其余非-singleton fixture 处于多文件组件中，不能按单文件删除；它们应由组件负责人按整簇规则处置。
- 外部 type-contract 的 47 数字采用维护者的修正版 live-importer 口径；本地源码额外发现两个 dormant internal type-only edge，已在本报告明确记录，不把它们误报为 live external consumers。

## 最终建议

**不要把这 93 个 singleton 当成“93 个死产品文件”。** 本 slice 的真正结论是：

- **19 个是测试 / 评测基建，应该保留或仅做结构迁移；**
- **25 个是产品代码，只是目前只有测试 value caller，应按产品能力裁决；**
- **47 个是外部类型契约，删除会破坏编译契约；**
- 只有 `ptyCapabilityDetector.ts` 与 `gauntletManifest.ts` 具备相对清晰的测试胶水删除理由；动态 process fixture 必须保留。

这说明清理面不是“42 个测试脚手架可直接删”，而是一个混合面：**真正的测试基建占 19 / 93，约五分之一；其余大部分仍需要产品职责、类型契约或动态入口判断。**
