# T7 + T16a + T16b：不可达代码处置建议

## 结论

**T7：不批准 270 个不可达生产文件的整批删除；按“活轨是否已承担职责”逐簇裁决。** 本轮按 `scripts/analyze-boundaries.py` 的生产集合（946 个非 `*.test.ts` 文件）重建仅 value-edge 的入口闭包，得到 **270 个 / 59,121 行**不可达；若为与既有记录对齐而排除 `test-utils/` 与 `__tests__/`，得到 **263 个 / 56,873 行**。这两个结果都没有复现 285/60,058，因此 285 只能作为旧记录，不能作为当前删除授权。抽样显示：`authCommandRuntime.ts` 的职责已有 `/connect` 活轨覆盖，但上下文获取、规划、工具分派、provider adapter、结果投影和事件投影等多个大簇没有被单一活模块等价接管；按 §2.1，reachability 只能证明“当前入口未进入”，不能证明“职责已被替代”。建议：保留保护类和独有实现；只把“已证明有活轨等价承担”的小簇列为后续删除候选，并在实际删除前逐簇执行 §2.2 六项检查。

**T16a：暂不删除 `verification/result/projection/mutation.ts` 所在不可达簇，但把它标记为“不可单独修复的死簇”。** `mutation.ts:68` 的唯一生产调用方是同样不可达的 `result/projection/shell/assembly.ts:46`；`runtimeOutcomeProjection.ts:61`、`context/graph/contextPacketResult.ts:73`、`planning/task/taskLifecycleResult.ts:5` 等链路也都在不可达闭包内。现有 8 个 `reasonText.includes` 分支主要由 `mutation.test.ts:75-151` 自造输入触发，不能当作活轨需求。若未来授权删除整个结果投影死簇，T16a 应随簇删除；在此之前不要对 `mutation.ts` 做单点重构。

**T16b：不把 `mutation.ts` 接回现有死调用方；若产品确需保留该语义，应在活的 edit/result lane 新建结构化生产者与消费者。** 现有活轨已经产生部分相关字段：`edit/result/journal/model.ts:65-127` 汇总 `writerStarted`，`session/continuation/stoppedSessionContinuity.ts:71-117` 从 coding result/evidence 生成 `writeEffect` 与连续性事实，`core/context/model/contextStateProjection.ts:264-292` 将这些事实投影到活的上下文状态。但没有活生产者产生 `routeBlocker = final-stale-read` / `workspace-boundary` 等 `mutation.ts` 所期待的统一判别输入，也没有活生产者产生 5 个被嗅探的完整字符串。推荐的未来 owner 是 `edit/result/journal/model.ts`（或其 `projection/failure.ts` 同域）产生结构化失败类别，再由活的 result/continuity surface 消费；不要恢复 `result/projection/shell/assembly.ts` 这条已证明不可达的旧路线。

## 实测证据

### 1. 边界分析原始输出

命令：

```bash
python3 scripts/analyze-boundaries.py
```

原始输出：

```json
{
  "production": 946,
  "cliReachable": 773,
  "cliOpaque": 173,
  "scriptOnly": 0,
  "publicApiOnly": 1,
  "testOnly": 136,
  "noReference": 36
}
```

### 2. value-edge 闭包

脚本：`/tmp/closure.py`。它通过 `importlib` 加载 `scripts/analyze-boundaries.py` 暴露的 `walk_ts`、`load_graph`、`closure`、`SRC`，再排除 `import type` 声明，入口为 `packages/ts-shell/src/entrypoints/` 全部文件加 `packages/ts-shell/src/index.ts`。

命令：

```bash
python3 /tmp/closure.py
```

原始输出：

```text
[all_non_test_ts] production=946 reachable=676 unreachable=270 lines=59121
  core: 62 files / 7663 lines
  context: 36 files / 9559 lines
  edit: 27 files / 6319 lines
  planning: 27 files / 6145 lines
  provider: 19 files / 5818 lines
  browser: 14 files / 1988 lines
  tools: 14 files / 3046 lines
  session: 10 files / 2142 lines
  evidence: 8 files / 1914 lines
  result: 8 files / 1756 lines
  runtime: 7 files / 4582 lines
  test-utils: 7 files / 2248 lines
  turn: 7 files / 1266 lines
  sandbox: 5 files / 829 lines
  presentation: 4 files / 550 lines
  eval: 3 files / 111 lines
  model-adapters: 3 files / 285 lines
  repair: 3 files / 1266 lines
  verification: 3 files / 1357 lines
  cli: 1 files / 64 lines
  policy: 1 files / 163 lines
  workflow: 1 files / 50 lines
[exclude_test_utils_and___tests__] production=939 reachable=676 unreachable=263 lines=56873
  core: 62 files / 7663 lines
  context: 36 files / 9559 lines
  edit: 27 files / 6319 lines
  planning: 27 files / 6145 lines
  provider: 19 files / 5818 lines
  browser: 14 files / 1988 lines
  tools: 14 files / 3046 lines
  session: 10 files / 2142 lines
  evidence: 8 files / 1914 lines
  result: 8 files / 1756 lines
  runtime: 7 files / 4582 lines
  turn: 7 files / 1266 lines
  sandbox: 5 files / 829 lines
  presentation: 4 files / 550 lines
  eval: 3 files / 111 lines
  model-adapters: 3 files / 285 lines
  repair: 3 files / 1266 lines
  verification: 3 files / 1357 lines
  cli: 1 files / 64 lines
  policy: 1 files / 163 lines
  workflow: 1 files / 50 lines
```

### 3. Protected classes

脚本：`/tmp/protected_value.py`。该 probe 使用同一 value-edge unreachable set，并检查 `index.ts` 闭包、`*Process.ts`、`spawn`/`execFile`/动态 `import`/`pathToFileURL`/`process.argv`/shebang/`main()` 形状，以及 `scripts/`/`package.json` 中的精确路径字符串。

命令：

```bash
python3 /tmp/protected_value.py
```

结果：

| §2.5 类别 | 文件数 | 文件 |
|---|---:|---|
| 公共 API（`index.ts` 闭包） | 0 | 无 |
| `*Process.ts` 动态进程入口 | 2 | `core/harness/agentCliProcess.ts`；`test-utils/longSessionDurabilityProcess.ts` |
| 动态/进程形状 | 5 | `context/graph/contextDiscovery.ts`（仅类型动态 import 形状，不能直接当执行入口）；`core/harness/agentCliProcess.ts`；`core/harness/browserRuntimeAdapterFixtures.ts`；`core/shell/platform/processTree.ts`；`test-utils/longSessionDurabilityProcess.ts` |
| `scripts/` / `package.json` 精确字符串引用 | 0 | 无 |

动态形状的逐行核验命令：

```bash
python3 - <<'PY'
from pathlib import Path
import importlib.util, io, contextlib, os
spec=importlib.util.spec_from_file_location('ab','scripts/analyze-boundaries.py')
m=importlib.util.module_from_spec(spec)
with contextlib.redirect_stdout(io.StringIO()): spec.loader.exec_module(m)
allf=m.walk_ts(m.SRC); prod=[f for f in allf if not f.endswith('.test.ts')]
g=m.load_graph(prod); roots=[f for f in prod if os.path.dirname(f)==os.path.join(m.SRC,'entrypoints')]+[os.path.join(m.SRC,'index.ts')]
un=set(prod)-m.closure(g,roots)
for f in sorted(un):
    t=Path(f).read_text(errors='ignore')
    hits=[]
    for i,l in enumerate(t.splitlines(),1):
        if any(x in l for x in ['spawn(', 'process.argv','main(', 'import("node:fs")']): hits.append((i,l.strip()))
    if hits: print(os.path.relpath(f,m.SRC), hits)
PY
```

核验结果包括：`agentCliProcess.ts:89` 的 `spawn`、`browserRuntimeAdapterFixtures.ts:126` 的 `process.argv`、`processTree.ts:51` 的 `spawn`、`longSessionDurabilityProcess.ts:38-39` 的 `main()`/`process.argv`。`contextDiscovery.ts:418` 是 `import("node:fs").Dirent` 类型形状，不是运行期加载入口。

### 4. `core/query/runtime/` 孤儿复算

命令：

```bash
python3 /tmp/query_orphans.py
```

value-only 外部消费者为 0 的原始结果是 11 个文件；包括 `events.ts` 在内总行数为 2,035。`events.ts` 有外部 type-only 消费者，因此按既有 §7 的“孤儿”定义剔除它后，得到 **10 个 / 1,961 行**，与既有表的 10/1,961 对齐：

- `actionAuthority.ts` 312 行
- `batch.ts` 143 行
- `decision.ts` 30 行
- `facts.ts` 298 行
- `harnessClaims.ts` 177 行
- `harnessPendingState.ts` 154 行
- `harnessState.ts` 177 行
- `harnessSupport.ts` 75 行
- `policy.ts` 272 行
- `proof.ts` 323 行

### 5. `mutation.ts` 与 8 个嗅探

命令：

```bash
python3 -c "from pathlib import Path; p=Path('packages/ts-shell/src/verification/result/projection/mutation.ts'); print(sum('reasonText.includes' in l for l in p.read_text().splitlines()))"
```

结果：`8`。

命令：

```bash
python3 -c "from pathlib import Path; terms=['stale-read-blocker','final-stale-read-blocked','expected to remain unchanged','protected file changed','unchanged file assertion']; files=[p for p in Path('packages/ts-shell/src').rglob('*.ts') if not p.name.endswith('.test.ts') and p.name!='mutation.ts']; print({t:sum(t in p.read_text(errors='ignore') for p in files) for t in terms})"
```

结果：五个精确字符串的生产者计数全部为 `0`。`stale-read:` 的活生产形状来自 `edit/multifile/observation.ts:515`，但不是 `stale-read-blocker` 或 `final-stale-read-blocked`。`writerStarted`/`writeEffect` 的活连续性生产来自 `session/continuation/stoppedSessionContinuity.ts:71-117`；`routeBlocker` 在 `edit/patch/status/mixedOperation.ts:17-80` 中存在，但其值域是 `mixed-operation-route-not-enabled`/`none`，不覆盖 `mutation.ts:109-149` 期待的统一 blocker 值。

### 6. 测试删除成本

命令：

```bash
python3 /tmp/testcost_full.py
python3 /tmp/mutation_list.py
```

结果：

- 直接 import 不可达生产文件的测试文件：**193**。
- 其中只直接 import 不可达集合的测试文件：**129**。
- 同时直接 import 活文件与不可达文件的测试文件：**64**。
- 直接 import 边：**482**。
- `mutation.ts` 的传递测试文件：**11**，包括 `context/acquisition/engine.test.ts`、`context/acquisition/projection.test.ts`、`context/acquisition/summary.test.ts`、`context/graph/contextPacketResult.test.ts`、`context/memory/model.test.ts`、`planning/grounded/projection.test.ts`、`planning/runtime/engine.test.ts`、`planning/task/taskLifecycle.test.ts`、`result/projection/runtimeOutcomeProjection.test.ts`、`result/projection/shell/assembly.test.ts`、`verification/result/projection/mutation.test.ts`。

这些测试并非都在测试死代码本身：`mutation.test.ts` 直接测试死模块；其余测试中，部分测试的是不可达 context/planning/result projection，部分测试只是在测试路径上把死 projection 带入依赖闭包。故删除成本不是“只删一个测试”。

## 逐类分析

### A. context：独有上下文获取链，未证明由活轨承担

| 不可达样本 | 责任证据 | 活轨对照 | 结论 |
|---|---|---|---|
| `context/memory/model.ts:139` `buildContextWorkingMemory` | 853 行；构造 context memory、freshness、planning handoff | `context/acquisition/engine.ts:94` `runContextEngine` 负责活的 repo/context engine，但没有同名 memory record/freshness owner | **独有/未覆盖**；不能因不可达删除 |
| `context/acquisition/graph.ts:204` `buildContextGraphPlanningBundle` | 生成 graph、task lifecycle、planning bundle | `context/acquisition/engine.ts:103-117` 生成 repo、reuse、discovery handoff；不是 graph planning bundle 的等价实现 | **未证明覆盖** |
| `context/readDeliveryProjection.ts:28` `buildReadTaskDelivery` | 827 行，负责 read fragment、reanchor、filtered output 与 `Read result for ...` | `context/selection/model.ts:37` 只做 target/context selection；`turn/step.ts:97` 只做 model step | **独有/未覆盖**。删前必须先找到活的 read delivery owner |

### B. core：少数兼容层可被替代，query runtime 不能按“无人 import”直接删

| 不可达样本 | 责任证据 | 活轨对照 | 结论 |
|---|---|---|---|
| `core/commands/authCommandRuntime.ts:21` `runAuthCommand` | 完整 `/auth set/status/use/logout` legacy command，275 行 | `core/commands/connectCommandRuntime.ts:70` 提供 `/connect` 活命令；`:205-224` 明确保留 `/connect set` legacy compatibility | **高度冗余/可列删除候选**，但需先确认 slash command registry 无 `/auth` 生产注册；当前 grep 只找到测试调用 |
| `core/query/runtime/policy.ts:37` `decideQueryRuntimeAction` | 272 行，跨 artifacts/context/planning/provider/repair/tools 的旧 query policy | `turn/step.ts:97-165` 是活的模型 step；`core/shell/sessionRuntime.ts:65` 是活的 session runtime；`session/replay/builder.ts:206-278` 是活 replay lane | **旧架构独有但已无活入口**；可随 query orphan 簇审查，不能声称已有一份等价函数 |
| `core/query/runtime/harness.ts:91` / `:620` | 967 行旧 harness snapshot/settle/restore 链 | `core/shell/sessionEventSurface.ts:73` 只渲染 QueryEvent；`session/replay/builder.ts:206` 只构造 replay pairing | **未证明覆盖**；应作为“旧 query runtime 是否正式放弃”的产品裁决，不做孤立文件删除 |

### C. planning：完整规划/交接子系统，没有同名活 owner

| 不可达样本 | 责任证据 | 活轨对照 | 结论 |
|---|---|---|---|
| `planning/handoff/mutation.ts:138` `buildPlanningMutationHandoffProjection` | 生成 review-ready/blocked、proposal manifest、verification intent | `planning/runtime/engine.ts:69-123` 也构造 planning result，但本身同属不可达闭包；活的 `edit/patch/status/mixedOperation.ts:47` 只做 mixed-operation readiness | **独有/未覆盖** |
| `planning/runtime/engine.ts:69` `runPlanningRuntime` | 调 `runContextEngine`、创建 planning mutation handoff | 活的 `context/acquisition/engine.ts:94` 只做 context engine；没有 live planning runtime caller | **未覆盖**；不能以 context engine 作为等价实现 |

### D. tools/provider：有活的相邻 lane，但不是完整替代

| 不可达样本 | 责任证据 | 活轨对照 | 结论 |
|---|---|---|---|
| `tools/dispatch/planner.ts:21` `planToolBatchDispatch` | 规范化 tool batch、policy decision、dispatch status | `core/tools/registry.ts:213` 建立活工具 registry，但不做 batch dispatch planning；`turn/tools.ts` 负责活工具类型/执行接缝 | **相邻但非等价**；不授权删除 |
| `tools/toolCallBatch.ts:77` `extractToolCallBatch` | 从 assistant response 归一化 tool call batch | `turn/step.ts:9`/`:168-183` 处理 completion stream 与 tool calls，但没有同名 batch normalization owner | **未证明覆盖** |
| `provider/request/attempt.ts:153` `runControlledModelInvocationAdapter` | controlled provider fetch、attempt envelope、fallback、response handoff | `turn/step.ts:97-165` 直接负责 provider request/stream；`core/shell/providerReadiness.ts:88` 做 readiness | **部分覆盖但不等价**：活轨覆盖“调用/ready”，死模块覆盖“controlled adapter projection/fallback handoff” |

### E. session/evidence/runtime/result：多数是结果/证据投影，而不是无价值重复

| 不可达样本 | 责任证据 | 活轨对照 | 结论 |
|---|---|---|---|
| `session/sessionTreeProjection.ts:139` `projectSessionTree` | 构造 active path、branch facts、compaction/context rebuild readiness | `session/SessionManager.ts:85` 是 facade/存储协调，不是 tree projection；`core/shell/sessionRuntime.ts:65` 是运行时协调 | **独有/未覆盖** |
| `evidence/harness/harnessFailureTaxonomy.ts:526` `classifyHarnessFailure` | 失败分类、safe reason、next action、verifier marker | `session/continuation/stoppedSessionContinuity.ts:120-228` 有活 failure handoff，但不是 harness taxonomy 的同一 contract | **相邻但非等价** |
| `runtime/events/projection.ts:312` `projectRuntimeEvents` | 把 session/provider/tool/verification/resource facts 投影成 runtime events | `core/shell/sessionEventSurface.ts:73` 渲染 QueryEvent；`:160` 渲染 execution summary，不能生成同一 runtime event contract | **独有/未覆盖**；但其内部活测试消费者构成高删除成本 |
| `runtime/resources/inventory.ts:141` `projectPackageResourceInventory` | package manifest validation、conflicts、package inventory | `runtime/resources/projection.ts:55` `projectStaticResourceRegistry` 处理 static resource descriptors | **部分语义重叠，不是等价替代**：package inventory 与 static resource registry 是两种输入 contract |
| `result/projection/shell/assembly.ts:42` `assembleShellResult` | 组装 CodingResult、task satisfaction、actionable blocker 与 user-facing output | `turn/projection.ts:28` `TurnProjection.project`/`:101` `concludeRun` 负责 turn/query terminal surface，但不组装 CodingResult contract | **未覆盖** |
| `verification/result/projection/mutation.ts:68` `projectMutationVerificationHandoff` | 根据 verification、writer state、reason text 生成 mutation handoff kind | `session/continuation/stoppedSessionContinuity.ts:71-117` 只提取 write continuity；`core/context/model/contextStateProjection.ts:264-292` 只投影事实 | **未覆盖**；正是 T16a/T16b 的核心风险 |

### F. browser：旧 agent planner 与当前 command/policy lane 有明显替代关系

| 不可达样本 | 责任证据 | 活轨对照 | 结论 |
|---|---|---|---|
| `browser/agent.ts:21` `detectBrowserAgentPlan` | 183 行，按 prompt 自动生成 browser actions | `browser/commandContract.ts:31` 解析显式 `/browser` contract；`browser/actionLoopPolicy.ts:29` 对 execute route 做 allow/block；`browser/actionPreview.ts:14` 输出 preview-only | **高度冗余/可列删除候选**，但要确认所有 continuity/agent imports 已切换到显式 command lane |
| `browser/plan.ts` | 218 行，旧 transaction planner | `browser/commandContract.ts:38-117` + `actionLoopPolicy.ts:29-60` 是当前显式 route/policy | **可能冗余，但不是仅靠 reachability 授权** |

## 与既有记录的差异

| 项 | 既有记录 | 本轮实测 | 判定 |
|---|---:|---:|---|
| `analyze-boundaries.py` | 未在本项旧表中给出同口径当前值 | production 946 / cliReachable 773 / cliOpaque 173 / testOnly 136 / noReference 36 | 当前脚本输出应作为现状基线；与旧版不可直接比较 |
| value-edge 不可达（全非测试 TS） | 285 / 60,058（§6） | 270 / 59,121 | **285 不可复现**；文件集合或解析口径已变化 |
| value-edge 不可达（排除 `test-utils/`、`__tests__`） | 285 / 60,058（§6 复测表） | 263 / 56,873 | **差 22 文件 / 3,185 行**；本轮按现文件与精确 value-only import 解析重算 |
| 孤立文件 | 108 / 21,054（§14） | 129 / 26,855（排除 `test-utils/` 的生产集合，`/tmp/isolated_noutils.py`） | **不可复现**；“孤立”定义/集合口径不同，不能把 108 当当前授权数字 |
| `core/query/runtime/` 孤儿 | 10 / 1,961 | value-only 外部消费者为 0 的原始集合包含 `events.ts`，11 / 2,035；剔除 `events.ts` 的 27 个 type-only 外部消费者后为 10 / 1,961 | **结论对齐**；差异是是否把 type-only consumer 计为活消费者 |

## 风险与反证

- **入口漏报风险**：`scripts/analyze-boundaries.py` 的入口集合只覆盖 `entrypoints/`、`index.ts` 与其自身记录的 script roots；未被精确字符串探测到的外部 launcher、CI、用户本地脚本仍可能启动不可达文件。尤其 `core/harness/agentCliProcess.ts`、`test-utils/longSessionDurabilityProcess.ts` 已被动态形状保护。
- **测试不等于生产覆盖**：193 个测试文件直接 import 不可达生产文件，其中 64 个同时触及活文件；删除死簇可能删掉仍有价值的 fixture、contract regression 或间接覆盖，不应把测试绿灯/红灯当作职责替代证据。
- **结构化字段的“相邻生产者”不等于同一语义**：`writerStarted`/`writeEffect` 已在 continuity lane 产生，但 `routeBlocker` 统一枚举及 mutation handoff kind 尚未在活轨形成；把相邻字段直接接回 `mutation.ts` 可能制造新的伪契约。
- **`reasonText.includes("unsupported")` 过宽**：即便能找到活路径产生“unsupported”字样，也无法证明它与 patch-shape 分类同义；必须先确定 producer contract，再做结构化迁移。
- **公共 API 反证本轮为 0，不代表所有可外部加载面为 0**：package `main` 是 `index.ts`，但脚本/动态进程入口不属于 value closure；因此 `*Process.ts` 与实际 `spawn`/`process.argv` 文件必须保留或另行核验。

## 未验证事项

- 未逐一完成 270 个文件的 §2.2 六项删除前审查；本报告只完成了 12 个以上跨域样本与关键簇核验，因此不授权整批删除。
- 未对所有 `scripts/` 做 AST 级字符串路径解析；本轮 exact path probe 为 0，但宽松 basename probe 曾产生 24 个假阳性，说明简单字符串包含会误报。
- 未对 `package.json` 的所有命令通过真实执行覆盖到每一个脚本；只做了源码文字检查。
- **脚本探测口径限制**：`/tmp/protected_value.py` 对 `scripts/`/`package.json` 采用精确完整相对路径/源路径匹配，结果为 0；此前 `/tmp/protected.py` 的 basename/短路径匹配得到 24 对，但已确认是 `state.ts`/`scan.ts` 等通用 basename 的假阳性，不能作为字符串引用证据。
- 未运行完整 Vitest、`npm run build` 或全仓删除模拟；这些不属于本轮允许的验证范围。
- `context/graph/contextDiscovery.ts:418` 的 `import("node:fs").Dirent` 仅按形状计入动态类，尚未用编译产物证明其完全擦除；因此该项在保护表中保守保留。
- 未证明 `authCommandRuntime.ts` 的 `/auth` 是否通过外部兼容入口注册；当前生产源码 grep 未找到 `runAuthCommand` 调用，只有 `authCommandRuntime.test.ts` 直接调用，仍需产品/命令注册清单确认后才能删除。
