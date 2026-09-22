# `browser/` 布局与 `runtime/` ↔ `skill/` 边界裁决

## 结论

1. **当前真实形状不是 wiki 所写的 62 个平铺文件**：`src/browser/` 当前有 **125 个平铺生产 `.ts` 文件**，另有 `receipt/` 9、`runtime/` 23、`skill/` 11，共 **168 个生产文件 / 23,616 行**。62 是旧快照中的一个子集口径，不能代表当前平铺层。
2. **“browser/ 只有一条端到端活路径”被实测否证**。更准确的判断是：`browser/` 是一个合法的浏览器产品域，但域内包含多个相互接线的活子层/子航道；它不是单一执行链，也不是四个互不汇流的孤岛。
3. **`runtime/` ↔ `skill/` 不是两套平行实现**。它们是同一个“显式外部/skill-managed 浏览器执行绑定与协议”接缝的两个切面：runtime 侧负责适配器、manifest、协议和快照验证，skill 侧负责 binding、runner 元数据和 skill 执行器。当前生产图中两向共有 **9 条跨子目录边**（6 条 value、3 条 type-only）。
4. **建议现在不要搬迁**。原因不是“文件多所以不动”，而是：当前域内有 **654 条真实内部 import 边**，四个子层之间存在双向耦合；历史上相同域搬迁的实测边数已经是估算的 **1,537 / 361 = 4.26 倍**。在没有明确的新 owner 边界前，搬迁收益不足以覆盖结构性 diff、回归和重新验证成本。
5. 本报告只做 disposition，**没有执行任何移动或重命名**。若未来重新提案，必须先按 §2.4.1 重新跑 SCC、重新测量 escaping edges、核实目标路径同名概念，并把重命名拆成独立变更。

## 实测证据

### 1. 目录形状与行数

本会话使用临时测量脚本，排除 `*.test.ts`，只统计生产 `.ts`：

```bash
python3 /tmp/browser_shape_measure.py
```

实测输出：

```text
flat_prod=125 flat_lines=16734
receipt_prod=9 receipt_lines=1442
runtime_prod=23 runtime_lines=3453
skill_prod=11 skill_lines=1987
browser_prod_total=168 browser_prod_lines=23616 all_ts=226 test_ts=58
max_prod_lines=447 max_prod_file=ts-shell/src/browser/receipt/store.ts
family=externalNetwork all=13 prod=11 tests=2
family=controlledNetwork all=6 prod=6 tests=0
family=publicReadOnlyWeb all=7 prod=7 tests=0
family=readOnly all=6 prod=6 tests=0
family=selfHealing all=17 prod=14 tests=3
family=replay all=17 prod=11 tests=6
```

因此：

| 区域 | 生产 `.ts` | 生产行数 |
|---|---:|---:|
| `browser/` 平铺 | 125 | 16,734 |
| `browser/receipt/` | 9 | 1,442 |
| `browser/runtime/` | 23 | 3,453 |
| `browser/skill/` | 11 | 1,987 |
| **合计** | **168** | **23,616** |

目录内总 `.ts` 为 226，其中测试 58；测试不计入上表生产口径。最大生产文件仍是 `browser/receipt/store.ts`，447 行，因此 block-D 关于“最大文件 447 行”的这一点当前仍成立；它不是本次发现的过期部分。

### 2. 62 的口径核对

对当前平铺层中 block-D 点名的六个前缀族重新计数：

```bash
python3 /tmp/browser_flat_family_counts.py
```

当前生产文件数为：

```text
externalNetwork 11
controlledNetwork 6
publicReadOnlyWeb 7
readOnly 6
selfHealing 14
replay 11
sum_named_families 55
other_flat 70
```

同一测量中，若把测试文件也计入，六个族合计为 66 个文件。也就是说，当前“六个命名族”的生产口径是 55，而当前整个平铺生产层是 125；wiki 的 62 既不是当前平铺总数，也不能由当前六族生产计数复现。它应被视为旧快照/旧分组口径，具体历史形成原因本次未从 git 历史逐提交重建，标记为 `[UNVERIFIED]`。

另有 3 个 `eval/browser/` 基准文件不属于 `src/browser/` 域，不能混入 browser 生产计数：

```bash
wc -l packages/ts-shell/src/eval/browser/*.ts
```

输出为 3 个文件、111 行。它们是浏览器场景 benchmark，不是 `src/browser/` 目录成员；把它们按目录名计入会造成另一种 bookkeeping 差异。

### 3. SCC 基线

搬迁前的当前 import-graph SCC 检查：

```bash
node scripts/check-import-cycles.mjs packages/ts-shell/src
```

输出：

```text
scc-gate root=packages/ts-shell/src files=1430
scc-gate runtime_cycles=0 type_only_cycles=0
[pass] no-dependency-cycles - every module import resolves acyclically
```

当前基线为运行时环 0、type-only 环 0。由于本次建议“不搬”，没有伪造一个不存在的 post-move 结果。

### 4. 真实 import 图与边数

本会话临时探针 `python3 /tmp/browser_layout_measure2.py`：

```bash
python3 /tmp/browser_layout_measure2.py
```

只对 `packages/ts-shell/src/` 的生产 `.ts` 建图，解析本地 `.js` specifier 到对应 `.ts` 文件；可达性闭包从全部 `entrypoints/*.ts` 开始，并保留 value/type-only import 边。

关键输出：

```text
REACHABLE_TOTAL 162 UNREACHABLE_TOTAL 6
REACHABLE_GROUP flat 121 4
REACHABLE_GROUP receipt 9 0
REACHABLE_GROUP runtime 22 1
REACHABLE_GROUP skill 10 1
BROWSER_INTERNAL_EDGE_TOTAL 654
```

六个不可达生产文件是：

```text
browser/directPlaywrightAdapter.ts
browser/playwrightEvidenceMapper.ts
browser/runtime/core/gauntletManifest.ts
browser/selectorRepairApplyExecutor.ts
browser/selectorRepairApplyPolicy.ts
browser/skill/runner/manifest.ts
```

这不是“browser 只有 6 个活文件”的结论；它是 **162/168 个 browser 生产文件可从 entrypoints import-reachable**，并且 receipt 全部可达、runtime 22/23 可达、skill 10/11 可达。

按 browser 内部群组的真实 source-target 边计数：

```text
flat    -> flat     435
flat    -> receipt    9
flat    -> runtime   45
flat    -> skill     18
receipt -> flat       8
receipt -> receipt   16
runtime -> flat      53
runtime -> runtime   25
runtime -> skill      3
skill   -> flat      18
skill   -> runtime    6
skill   -> skill     18
```

合计为 654 条 browser 内部边。若把每个现有子目录当成潜在搬迁单元，当前 escaping-edge 基线为：

```text
flat    escaping=72  (-> receipt 9, -> runtime 45, -> skill 18)
receipt escaping=8   (-> flat 8)
runtime escaping=56  (-> flat 53, -> skill 3)
skill   escaping=24  (-> flat 18, -> runtime 6)
```

这些是当前真实 import 图的基线，不是未来搬迁批次承诺；本报告不建议执行搬迁。

### 5. 历史成本基线

计划中的历史记录和 3f 迁移映射可由以下命令定位：

```bash
grep -n -E '361 / \*\*1,537\*\*|1,537|62 文件|195 条双向边|567 边|escaping 87|外部 313' .wiki/refactor/plan.md .wiki/refactor/step-3-migration-map.md .wiki/refactor/block-findings-2026-09-19.md
```

记录值为估算 361、实测 1,537；差值倍率由下列命令实测：

```bash
python3 - <<'PY'
print(1537/361)
PY
```

输出：

```text
4.257617728531856
```

## 逐项分析

### 1. browser/ 是一个域，还是多层堆叠

**结论：一个产品域，多个相互接线的活层；不是单一活路径，也不是四个互不汇流的独立系统。**

block-D 的“唯一端到端路径”是：

```text
CLI command → browser/commandRunner.ts → executionCommandRunner → BrowserExecutor
```

这个路径确实存在，但 import 图证明它不是唯一活路径。关键最短路径如下，均由 `python3 /tmp/browser_layout_measure2.py` 输出：

```text
PATH commandRunner -> entrypoints/slashCommandRegistry.ts -> core/commands/registry.ts -> core/commands/browserCommandRuntime.ts -> browser/commandRunner.ts
PATH executionCommandRunner -> entrypoints/slashCommandRegistry.ts -> core/commands/registry.ts -> core/commands/browserCommandRuntime.ts -> browser/commandRunner.ts -> browser/executionCommandRunner.ts
PATH runtimeCoreExecutor -> entrypoints/slashCommandRegistry.ts -> core/commands/types.ts -> browser/runtime/core/executor.ts
PATH runtimeExternalExecutor -> entrypoints/cliCommandExecutionBridge.ts -> browser/cliExecutionBridge.ts -> browser/runtime/external/executor.ts
PATH skillExecutionExecutor -> entrypoints/cliCommandExecutionBridge.ts -> browser/cliExecutionBridge.ts -> browser/skill/execution/executor.ts
PATH skillRuntimeBinding -> entrypoints/slashCommandRegistry.ts -> core/commands/types.ts -> browser/skill/runtime/binding.ts
PATH sessionManager -> entrypoints/cliRuntimeInvocation.ts -> core/tools/registry.ts -> core/tools/browserToolUnified.ts -> browser/sessionManager.ts
PATH replayCommandRunner -> entrypoints/slashCommandRegistry.ts -> core/commands/registry.ts -> core/commands/browserCommandRuntime.ts -> browser/commandRunner.ts -> browser/replayCommandRunner.ts
PATH selfHealingCommandRunner -> entrypoints/slashCommandRegistry.ts -> core/commands/registry.ts -> core/commands/browserCommandRuntime.ts -> browser/commandRunner.ts -> browser/selfHealingCommandRunner.ts
```

读实现后可确认这些不是只有类型声明的假路径：

- `core/commands/browserCommandRuntime.ts` 直接调用 `runBrowserCommandAsync`；`commandRunner.ts` 再按 mode 分派到 runtime action loop、`runBrowserExecutionCommand`、`runBrowserReplayCommand`、`runBrowserSelfHealingCommand`。
- runtime execute 分支使用 `BrowserRuntimeAdapterExecutor` 或注入的 `BrowserRuntimeExecutor`，随后进入 `runBrowserActionLoopExecutor`，执行 snapshot、policy、observation、receipt 和 action。
- CLI execution bridge 实际创建 `BrowserPlaywright*Executor`、`BrowserExternalRunnerExecutor` 或 `BrowserSkillExecutionExecutor`，这些都实现扁平层的 `BrowserExecutor` seam。
- `core/tools/browserToolUnified.ts` 实际调用 `defaultBrowserSessionManager`，形成另一条状态化 Playwright 浏览器工具路径；它不是 `/browser` slash command 的别名。
- replay 和 self-healing 都由 `commandRunner.ts` 的 mode 分支显式接入，不是孤立文件簇。

因此推荐的结构描述是：

```text
一个 browser 产品域
├─ slash-command / execution lane
├─ runtime action-loop / adapter lane
├─ external-runner / skill-managed bridge lane
├─ receipt / replay / self-healing lane
└─ stateful Playwright browser-tool lane
```

这些层有独立职责，但通过 `commandRunner`、`cliExecutionBridge`、runtime adapter、receipt 和 shared contract 互相接线；“其余入口各自独立、互不汇流”不成立。

### 2. runtime/ ↔ skill/ 的边界裁决

**结论：不是两个平行端口；是一个显式 runner/adapter seam 的两侧。**

真实跨目录边共 9 条：

```text
value browser/runtime/core/adapterExecutor.ts -> browser/skill/runtime/binding.ts
value browser/runtime/external/manifest.ts -> browser/skill/runner/binding.ts
value browser/runtime/external/manifest.ts -> browser/skill/runner/metadata.ts
value browser/skill/execution/executor.ts -> browser/runtime/external/protocol.ts
value browser/skill/execution/protocol.ts -> browser/runtime/external/protocol.ts
value browser/skill/runner/binding.ts -> browser/runtime/external/protocol.ts
type  browser/skill/runner/capability.ts -> browser/runtime/external/protocol.ts
type  browser/skill/runtime/binding.ts -> browser/runtime/core/protocol.ts
type  browser/skill/runtime/binding.ts -> browser/runtime/external/runtimeManifest.ts
```

边的方向和实现语义说明：

- `runtime/core/adapterExecutor.ts` 是 runtime 侧的适配器编排器；它在 `skill-managed` manifest 下调用 `validateBrowserSkillRuntimeBinding`，并通过 binding 的 `run()` 取得 runtime protocol response，再做统一 response/snapshot 验证。
- `skill/runtime/binding.ts` 不是另一个 executor；它定义并验证显式 skill runtime binding，依赖 runtime protocol response 类型和 external runtime manifest 类型。
- `runtime/external/manifest.ts` 负责 external runner manifest，但对 `skillRunnerMetadata` / `skillRunnerBinding` 进行联合校验，说明 skill 绑定是 manifest seam 的一部分，而不是旁路实现。
- `skill/execution/executor.ts` 实现扁平层 `BrowserExecutor`，其进程协议复用 `runtime/external/protocol.ts`；它与 runtime adapter 的结果模型不同，但共享同一外部 runner 安全/协议基础。

所以不应把目录名直接解释成“runtime 是基础设施、skill 是完全上层”。当前代码更准确地表达为：

```text
runtime/*  = runtime manifest / adapter / protocol / snapshot orchestration
skill/*    = skill metadata / binding / skill-managed process execution
共享 seam  = explicit manifest + binding + protocol + bounded safe runner execution
```

### 3. §2.4.1 搬迁纪律如何应用

本次建议为 **不搬迁**，所以没有虚构目标目录、没有重写 specifier、没有做 rename，也没有 post-move SCC 声明。仍将五项约束落实为未来变更的门槛：

1. **SCC**：当前 pre-move baseline 已实测为 0 runtime / 0 type-only cycle；任何未来移动必须重新执行同一命令，并按目标路径重建图后再跑一次。
2. **只改 escaping edges**：当前真实 baseline 是 flat 72、receipt 8、runtime 56、skill 24；未来不能按文件数或 wiki 估算改写，更不能重写域内相对边制造噪音。
3. **边数实测**：本报告已保留 654 条内部边和 9 条 runtime↔skill 边作为当前基线；未来批次必须从移动前真实图重新计算。
4. **目标路径同名概念核实**：本次未提出目标路径，因此没有做未经授权的目录合并。尤其不能因为“runtime”或“skill”目录名相似就强行归并。
5. **不夹带重命名**：本次不移动，也不做 `browser*` 前缀重命名。未来若要处理命名税，必须是独立步骤。

### 4. 现在移动是否值得

**推荐：不移动，记录 disposition。**

潜在收益：

- 将明显的 `externalNetwork*`、`replay*`、`selfHealing*` 等家族放进更窄的子域目录，可改善浏览和局部 ownership 认知。
- 平铺层当前确实拥挤，且 70 个平铺生产文件不属于 block-D 点名的六个前缀族。

但当前成本更硬：

- 125 个平铺文件不是一个自洽的小簇；它们对 runtime、skill、receipt 有 72 条 escaping 边，同时自身内部有 435 条 flat→flat 边。
- runtime 和 skill 之间有 9 条真实双向跨边，不能靠目录名机械分层解决。
- receipt 也反向依赖 flat 8 条；runtime 反向依赖 flat 53 条；skill 反向依赖 flat 18 条。不存在可直接套用“只向下依赖”的干净目录 DAG。
- 历史同域搬迁已经从估算 361 边膨胀到实测 1,537 边，即 4.26 倍；当前 654 条 browser 内部边说明低估风险仍然很高。
- 现有架构约束已经允许 `browser/` 作为 sanctioned domain，且现有 `receipt/`、`runtime/`、`skill/` 子域已经承担明确职责。当前证据支持“一个域内多个接线层”，不支持立即再做一次大范围位置重排。

因此，本轮最稳妥的动作是：**保留现状，不移动、不重命名；把 62→125、唯一活路径、runtime↔skill 平行端口等旧说法修正为本报告的实测结论。**

## 与既有记录的差异

| 既有记录 | 本次实测 | 判断 |
|---|---:|---|
| wiki：62 个 flat 文件 | 125 个平铺生产 `.ts` | 旧数字不是当前总数；当前六族生产合计也只有 55，另有 70 个其他平铺生产文件 |
| Step 3 旧结构表：161 个平铺文件 | 当前 125 个平铺生产文件 | 经过后续删除/改动后口径已变化；不能直接沿用旧快照 |
| block-D：唯一活路径是 `commandRunner → executionCommandRunner → BrowserExecutor` | 162/168 个 browser 生产文件从 entrypoints 可达；runtime、skill、replay、selfHealing、sessionManager 均有真实路径 | **否证**“唯一”与“互不汇流” |
| block-D：runtime/ 与 skill/ 是第二套平行端口 | 9 条真实 runtime↔skill 边，6 value + 3 type-only | **否证**平行隔离；应记录为耦合 adapter/binding seam |
| block-D：最大文件 receipt/store.ts 447 行 | 最大生产文件仍为 447 行 | 该条当前仍成立 |
| Step 3：361 估算 / 1,537 实测 | 本次计算 `1537/361 = 4.257617728531856` | 支持继续拒绝估算式搬迁 |

## 风险与反证

- 本报告的“可达”是静态 import-graph reachability，不等于每个配置分支都已在生产运行中被触发；真实 CLI 执行频率和配置覆盖未测量。
- `sessionManager.ts` 内含 `Function('return import("playwright-core")')()` / fallback import；这种动态加载未作为静态 import 边计入，不能把静态图误说成完整运行时 tracing。
- external runner / skill runner 使用 `spawn`，本次没有跨进程运行时追踪；runner command 是否在仓库外被消费也未验证。
- `eval/browser/` 的 3 个 benchmark 文件被明确排除在 `src/browser/` 口径之外；若后续报告采用“路径名包含 browser”的宽口径，必须显式加回 3 文件 / 111 行，不能与本报告的域内数字混用。
- 如果产品明确决定把某一组 flat 文件迁入新 owner 域，并能先给出稳定的 target concept、所有外部消费者和迁移收益，当前“不移动”结论可重新审议；但那将是新的迁移提案，不是对本报告的隐式授权。

## 未验证事项

- `[UNVERIFIED]` wiki 中“62”的精确历史形成原因；本次确认它无法由当前目录和当前六族生产计数复现，但未逐提交重建该旧快照。
- `[UNVERIFIED]` 仓库外 consumer、未入仓 plugin、发布包下游是否按当前路径直接引用 browser 文件。
- `[UNVERIFIED]` 动态 `import()`、`spawn`、`pathToFileURL` 的运行时 tracing；本报告只做静态 import 图与实现读审。
- 未执行任何搬迁，因此没有 post-move SCC、specifier 重写验证或目标路径冲突检查；这些应在未来确有移动提案时作为强制前置检查执行。
- 未运行全量 vitest 或 `npm run build`；本报告只新增 markdown disposition，且没有代码行为变更。
