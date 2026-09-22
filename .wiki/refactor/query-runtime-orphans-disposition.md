# `core/query/runtime/` 孤儿处置建议

## 结论

**先给裁决：不要把 `core/query/runtime/` 整簇删除，也不建议现在删除三个候选死叶。应先保留 live lane，并把候选实现与 live responsibility 做一次显式分离/迁移设计。** 现有证据足以证明没有动态入口、公共面或 `scripts/` 字符串路径，但不足以证明三个候选的全部职责已经被活轨接管；其中 `policy.ts` 与 `actionAuthority.ts` 是旧 query lane 的独有编排/安全实现，`proof.ts` 是 query-specific proof glue，不能仅凭零生产 value consumer 获得删除授权。

| 文件 | 分类（严格按外部 value / 目录内 value 边） | 推荐 | 理由 |
|---|---|---|---|
| `actionAuthority.ts` | **(a) dead leaf**；仅有 `batch.ts` 的 type-only 引用 | **keep-and-investigate** | 实现 action authority、错误动作拦截和 blocked result；未发现活轨等价的 output constraint owner。 |
| `batch.ts` | **(a) dead leaf（value 口径）**；仅 type-only 被 `events.ts`、`harness.ts`、`harnessState.ts`、`observation.ts` 引用 | **keep-and-investigate** | batch contract 仍被 query runtime 类型面引用；不能按普通死叶单独删。 |
| `decision.ts` | **(a) dead leaf（value 口径）**；仅 type-only 被 `actionAuthority.ts`、`batch.ts`、`events.ts`、`harness.ts`、`policy.ts`、`proof.ts` 引用 | **keep-and-investigate** | 是整个旧 query runtime 的共享 decision contract；没有 value consumer，但删除会改动多处类型边。 |
| `events.ts` | **(a) dead leaf under the requested value-edge taxonomy; type-only contract exception** | **keep** | No external or in-directory production value consumer, but 28 external production type-only consumers use `QueryEvent`; do not delete as a behavior file without a contract migration. |
| `facts.ts` | **(b) live internal dependency（直接 value consumer）**：`policy.ts → facts.ts` | **keep-and-investigate** | 为旧 policy 提供 fact gathering；由于 `policy.ts` 本身无生产 value caller，它暂未形成 live CLI 行为。 |
| `harness.ts` | **live**：`session/harness/state.ts → harness.ts`；另有 5 个外部 type consumer | **keep** | 活的 session harness state encode/decode 仍直接创建 harness state。 |
| `harnessClaims.ts` | **(b) live internal dependency**：`harness.ts → harnessClaims.ts` | **keep** | harness 的 claim classification value dependency。 |
| `harnessPendingState.ts` | **(b) live internal dependency**：`harness.ts → harnessPendingState.ts`、`harnessClaims.ts → harnessPendingState.ts` | **keep** | harness pending queue 的 value mutation layer。 |
| `harnessState.ts` | **(a) dead leaf（value 口径）；type-only contract dependency** | **keep** | 仅 type-only 被 harness/claims/pending/support 引用，但承载跨文件 harness state contract，不能按行为死叶删除。 |
| `harnessSupport.ts` | **(b) live internal dependency**：`harness.ts → harnessSupport.ts`、`harnessClaims.ts → harnessSupport.ts`、`harnessPendingState.ts → harnessSupport.ts` | **keep** | harness 的 runtime helper value dependency。 |
| `observation.ts` | **live**：`session/replay/builder.ts → observation.ts` | **keep** | replay builder 直接调用 `deriveQueryRuntimeObservationState`。 |
| `policy.ts` | **(a) dead leaf**；无外部或目录内 value consumer | **keep-and-investigate** | 272 行 query action policy；`harness.ts` 不覆盖它的 action-selection responsibility。 |
| `proof.ts` | **(a) dead leaf（value 口径）；仅 `events.ts` type-only 引用** | **keep-and-investigate** | query-specific proof projection；底层 proof/verdict owners 仍活，但没有证明这个 projection 的完整职责已有单一 live owner。 |
| `state.ts` | **live**：生产 value consumers 为 `core/shell/recovery.ts`、`session/replay/builder.ts` | **keep** | continuation safety / runtime seed / observation merge 仍有生产 value 读取。 |
| `taskState.ts` | **live**：4 个生产 value consumers | **keep** | session compact/recovery/replay/continuation 直接读取或投影 task state。 |

**重要更正。** 按用户要求的“外部 value / 目录内 value”分类，严格的 (a) 集合不是只有三个文件：`actionAuthority.ts`、`batch.ts`、`decision.ts`、`events.ts`、`harnessState.ts`、`policy.ts`、`proof.ts` 均没有外部或目录内生产 value consumer；其中 `events.ts` 仍有 28 个外部 type-only consumers，`actionAuthority.ts` 有 1 个目录内 type-only consumer，`batch.ts` 有 4 个、`decision.ts` 有 6 个、`harnessState.ts` 有 4 个、`proof.ts` 有 1 个目录内 type-only consumers。若把 type-only 入边也纳入“fully isolated”，本次复测只有 `policy.ts` 真正没有任何生产 value/type 入边。这个结果**推翻**了“只有三个 fully isolated”作为严格全边结论；三个文件仍是最值得单独审查的行为候选，但不是唯一的 value-edge (a) 文件。

## 实测证据

### 1. 文件与行数

命令：

```bash
wc -l packages/ts-shell/src/core/query/runtime/*.ts
```

结果：15 个生产文件，共 **4,269 行**。其中按零外部生产 value consumer 的原孤儿集合为：

```bash
python3 - <<'PY'
from pathlib import Path
p=Path('packages/ts-shell/src/core/query/runtime')
files=['actionAuthority.ts','batch.ts','decision.ts','facts.ts','harnessClaims.ts','harnessPendingState.ts','harnessState.ts','harnessSupport.ts','policy.ts','proof.ts']
print(sum(len((p/f).read_text().splitlines()) for f in files))
PY
```

结果：**10 个 / 1,961 行**。这与 `plan.md` §9.5 的“10 / 1,961”一致；`events.ts` 被剔除是因为它有外部 type-only contract consumers。

### 2. 生产 import 图重算

我用 `/tmp/query_counts_prod.py` 解析 `packages/ts-shell/src/**/*.ts`，排除 `*.test.ts`，解析相对 `.js` specifier 到 `.ts` 文件，并区分普通 import 与 `import type`。命令：

```bash
python3 /tmp/query_counts_prod.py
```

该脚本对 **1,429 个生产 TypeScript 文件**建立 import 边；结果表如下。`extV/extT` 是目录外生产 value/type consumer；`inV/inT` 是目录内生产 value/type consumer。

| 文件 | 行数 | extV | extT | inV | inT |
|---|---:|---:|---:|---:|---:|
| `actionAuthority.ts` | 312 | 0 | 0 | 0 | 1 |
| `batch.ts` | 143 | 0 | 0 | 0 | 4 |
| `decision.ts` | 30 | 0 | 0 | 0 | 6 |
| `events.ts` | 74 | 0 | 28 | 0 | 0 |
| `facts.ts` | 298 | 0 | 0 | 1 | 0 |
| `harness.ts` | 967 | 1 | 5 | 2 | 1 |
| `harnessClaims.ts` | 177 | 0 | 0 | 1 | 0 |
| `harnessPendingState.ts` | 154 | 0 | 0 | 2 | 0 |
| `harnessState.ts` | 177 | 0 | 0 | 0 | 4 |
| `harnessSupport.ts` | 75 | 0 | 0 | 3 | 0 |
| `observation.ts` | 462 | 1 | 0 | 1 | 1 |
| `policy.ts` | 272 | 0 | 0 | 0 | 0 |
| `proof.ts` | 323 | 0 | 0 | 0 | 1 |
| `state.ts` | 374 | 2 | 12 | 3 | 0 |
| `taskState.ts` | 431 | 4 | 6 | 1 | 0 |

这推翻了三点常见误读：

- `batch.ts` 与 `decision.ts` 的目录内引用都是 type-only，不是 value consumers。
- `harnessState.ts` 的 4 条目录内引用也是 type-only；它是 contract dependency，不是 runtime value dependency。
- `events.ts` 的外部 type-only consumer 是 **28 个生产文件**；行为生产者仍为 0。

### 3. 生产 live value consumer 链

由上面的图直接得到：

- `harness.ts`：`session/harness/state.ts:1-12` 普通 import；该文件在 `decodeSessionHarnessState()` 中调用 `createQueryRuntimeHarnessState()`【session/harness/state.ts:40-83】。
- `observation.ts`：`session/replay/builder.ts:2` 普通 import；builder 直接使用 `deriveQueryRuntimeObservationState`。
- `state.ts`：`core/shell/recovery.ts:11` 使用 `CONTINUATION_SAFETY_POLICY`；`session/replay/builder.ts:10-15` 使用 `buildContinuationPolicyEvidence`、`resolveContinuationSafety` 等。
- `taskState.ts`：生产 value consumers 为 `session/continuation/sessionContinuitySnapshot.ts`、`session/recovery/sessionRecoverySnapshot.ts`、`session/replay/builder.ts`、`session/sessionCompactModule.ts`。

命令复核：

```bash
git grep -n 'runtime/state.js' -- packages/ts-shell/src
git grep -n 'runtime/taskState.js' -- packages/ts-shell/src
git grep -n 'runtime/harness.js' -- packages/ts-shell/src
git grep -n 'runtime/observation.js' -- packages/ts-shell/src
```

## 逐文件分类

### live：外部生产 value consumer

- `harness.ts`：`session/harness/state.ts → harness.ts`。
- `observation.ts`：`session/replay/builder.ts → observation.ts`。
- `state.ts`：`core/shell/recovery.ts → state.ts`；`session/replay/builder.ts → state.ts`。
- `taskState.ts`：`session/continuation/sessionContinuitySnapshot.ts`、`session/recovery/sessionRecoverySnapshot.ts`、`session/replay/builder.ts`、`session/sessionCompactModule.ts`。

`harness.ts` 还有 5 个外部 type-only consumers；`state.ts` 还有 12 个外部 type-only consumers；`taskState.ts` 还有 6 个外部 type-only consumers。type-only edge 不构成运行时行为，但会影响拆分时的 contract 迁移。

### (b)：只有目录内生产 value consumers

- `facts.ts`：`policy.ts → facts.ts`。`policy.ts` 的 `latestResult`、`taskKindFor`、`proofGapFor` 等 value 调用直接来自 `facts.ts`【packages/ts-shell/src/core/query/runtime/policy.ts:19-35】。
- `harnessClaims.ts`：`harness.ts → harnessClaims.ts`，harness 在 `settleHarnessOutput()` / `harnessObservationPatch()` 路径使用其 claim classification【packages/ts-shell/src/core/query/runtime/harness.ts:13-18】【packages/ts-shell/src/core/query/runtime/harness.ts:620-868】。
- `harnessPendingState.ts`：`harness.ts → harnessPendingState.ts`，并且 `harnessClaims.ts → harnessPendingState.ts`；pending write/verification/repair/artifact queue 的 mutation functions 在该文件中定义【packages/ts-shell/src/core/query/runtime/harnessPendingState.ts:19-38】。
- `harnessSupport.ts`：`harness.ts`、`harnessClaims.ts`、`harnessPendingState.ts` 三个 value consumers；`uniqueStrings`、`safeText`、`freezeHarness`、`appendTrajectory` 等 helper 被这些模块调用【packages/ts-shell/src/core/query/runtime/harnessSupport.ts:17-28】。

这些模块中只有 harness 子链被外部 live value consumer 拉入；`facts.ts` 目前只被无生产 caller 的 `policy.ts` 拉入，因此它是“旧 policy 内部 live”，不是 CLI live。

### (a)：没有外部或目录内生产 value consumer

- `actionAuthority.ts`：无生产 value consumer；`batch.ts:6` 仅 `import type` `RuntimeActionBlock`。
- `batch.ts`：无生产 value consumer；被 `events.ts`、`harness.ts`、`harnessState.ts`、`observation.ts` 仅 type-only 引用。
- `decision.ts`：无生产 value consumer；被 6 个目录内模块仅 type-only 引用。
- `harnessState.ts`：无生产 value consumer；被 harness 分层模块仅 type-only 引用。
- `policy.ts`：无生产 value consumer；唯一精确外部路径引用是测试文件。
- `proof.ts`：无生产 value consumer；`events.ts:12` 仅 type-only 引用 `QueryRuntimeProofProjection`。

### 类型合同特殊项：`events.ts`

`events.ts` 按用户要求的 value-edge taxonomy 属于 (a)，但它有 28 个生产 type-only consumers。`QueryEvent` 被 shell、CLI、session、turn、result terminal 等模块引用。当前 `runtime.*` 事件变体的生产者为 0；这说明部分契约 inert，不说明整个文件可安全删除。

### `actionAuthority.ts` 六项检查

1. **功能读审（Evidence）**：312 行实现三类责任：`blockUnsafeRuntimeAction()`（`:16-60`）阻止无 context 的 edit/repair、无 verification target 的 verify、无 artifact target 的 artifact；`constrainRuntimeActionOutput()`（`:62-80`）校验 output action 与 selected action；`blockedRuntimeActionOutput()` / `blockedCodingResult()`（`:82-288`）生成失败事件、not-proven coding result、verification blocker 与 last-action seed。
2. **等价实现核验（Evidence + Inference）**：未发现完整等价实现。`planning/execution/model.ts:34-58` 只产生 plan blockers；`tools/policy/strategy.ts:72-226` 选择 next action。两者都没有 output mismatch blocking 或 blocked `CodingResultSummary` 生成。因此这是**独有实现**，当前没有单一 live lane 覆盖完整职责。
3. **消费者存活检查（Evidence）**：生产 `extV=0, extT=0, inV=0, inT=1`；唯一入边是 `batch.ts:6` 的 type-only import。测试文件直接引用数为 0。
4. **动态入口检查（Evidence）**：
   ```bash
   git grep -nE 'path\\.join|pathToFileURL|spawn(Sync)?\\(|execFile(Sync)?\\(|process\\.argv|^#!|(^|[^A-Za-z])main\\(' -- packages/ts-shell/src/core/query/runtime/actionAuthority.ts packages/ts-shell/src/core/query/runtime/policy.ts packages/ts-shell/src/core/query/runtime/proof.ts
   git ls-files 'packages/ts-shell/src/core/query/runtime/*Process.ts'
   ```
   结果：候选三文件模式扫描 0 命中，`*Process.ts` 0 个文件。
5. **公共面检查（Evidence）**：`packages/ts-shell/package.json:6` 的 package main 指向 `dist/packages/ts-shell/src/index.js`；`src/index.ts` 未 re-export `actionAuthority.ts`，候选路径精确扫描 0 命中。
6. **`scripts/` 引用检查（Evidence）**：
   ```bash
   git grep -nE 'actionAuthority\\.js|query/runtime/policy\\.js|query/runtime/proof\\.js' -- scripts packages/ts-shell/src/index.ts packages/ts-shell/package.json package.json
   ```
   结果：0 命中。

**授权结论**：六项安全检查未发现动态、公共面或脚本 rescue，但删除授权不成立：没有 live lane 覆盖 action authority 的完整职责。推荐 **keep-and-investigate**。

### `policy.ts` 六项检查

1. **功能读审（Evidence）**：`decideQueryRuntimeAction()`（`:37-170`）组合 transcript、observation、harness patch、task kind、changed files、verification targets、failure categories、pending action、context selection、execution plan、request packet、tool strategy 与 repair plan；`:172-180` 提供 `hasOpenRuntimeProofGap()`。
2. **等价实现核验（Evidence + Inference）**：`tools/policy/strategy.ts:72-226` 有 action ladder，`planning/execution/model.ts:34-183` 有 execution plan/action contracts；但没有文件取代 `policy.ts` 的完整事实收集 → context → plan → request → strategy → repair-plan 编排。`harness.ts`（`:183-967`）处理 batch/output settlement、observation patch 与 save-point restore，不选择 `nextAction`，不构造 context/plan/request；所以 `harness.ts` 与 `policy.ts` 是不同责任。
3. **消费者存活检查（Evidence）**：生产 `extV=0, extT=0, inV=0, inT=0`。测试直接引用数为 1：`packages/ts-shell/src/session/replay/builder.test.ts:7`；该测试在 `:175,346,405,436,466` 调用 `decideQueryRuntimeAction()`。
4. **动态入口检查（Evidence）**：同上候选三文件模式扫描 0 命中，`*Process.ts` 0 个文件。
5. **公共面检查（Evidence）**：`src/index.ts` 不 re-export `policy.ts`；package main 虽为 index，但候选路径 public edge 为 0。
6. **`scripts/` 引用检查（Evidence）**：候选路径在 `scripts/` 与 package 配置中 0 命中。

**授权结论**：`policy.ts` 是最强 reachability 删除候选，但没有 live task-level policy equivalent。推荐 **keep-and-investigate**；若产品明确退休旧 query lane，应先迁移事实/context/plan/request/strategy 责任，再删。

### `proof.ts` 六项检查

1. **功能读审（Evidence）**：`projectQueryRuntimeProof()`（`:41-137`）生成 artifact receipt、artifact correction、task proof、task verdict，并组合 changed-file verification、repair post-validation、original failure preservation、staged action consistency；辅助函数 `:158-322` 完成 coverage、failure、host status、action consistency 判断。
2. **等价实现核验（Evidence + Inference）**：底层 owners 仍活：`evidence/task/proof.ts:61-87`、`result/task/verdict.ts:18-35`、`edit/multifile/model.ts:398-422`、`edit/recovery/model.ts:740-745`。但没有文件完整替代 query state + observation + artifact receipt + staged-action glue；因此只能判定底层职责部分覆盖，不能判定整个 query projection 已被 live lane 接管。
3. **消费者存活检查（Evidence）**：生产 `extV=0, extT=0, inV=0, inT=1`；唯一目录内入边是 `events.ts:12` type-only。测试文件直接引用数为 0。
4. **动态入口检查（Evidence）**：同上候选三文件模式扫描 0 命中，`*Process.ts` 0 个文件。
5. **公共面检查（Evidence）**：`src/index.ts` 导出的是 `evidence/task/proof.ts` 的 `buildTaskProofInput` 与 `result/task/verdict.ts` 的 `projectTaskVerdict`，没有导出 `core/query/runtime/proof.ts`；候选路径 public edge 为 0。
6. **`scripts/` 引用检查（Evidence）**：候选路径在 `scripts/` 与 package 配置中 0 命中。

**授权结论**：底层 proof/result 能力有 live owners，但 query-specific projection glue 没有被证明接管。推荐 **keep-and-investigate**；若要删除，必须先迁移 observation/state-derived inputs、artifact correction、staged-action consistency，并保留等价行为测试。

## 测试成本
```bash
python3 /tmp/query_test_cost.py
```

并用精确路径扫描复核：

```bash
git grep -nE 'actionAuthority\\.js|query/runtime/policy\\.js|query/runtime/proof\\.js' -- packages/ts-shell/src -- '*.test.ts'
```

结果：

| 候选 | 直接 import 的测试文件数 | 测试文件 | 测试性质 |
|---|---:|---|---|
| `actionAuthority.ts` | 0 | — | 没有仓内直接测试成本；这不等于职责已被 live lane 覆盖。 |
| `policy.ts` | 1 | `session/replay/builder.test.ts:7` | 直接测试 replay seed 进入 runtime state 后，`decideQueryRuntimeAction()` 是否选择正确 action；它测试的是旧 policy 行为，不是 live `tools/policy/strategy.ts` 的独立单元。 |
| `proof.ts` | 0 | — | 没有仓内直接 path import；相关 `evidence/task/proof.test.ts`、`result/task/verdict.test.ts` 测试的是底层 live owners，不是 query projection。 |

注意：搜索裸文件名 `proof.ts` 会命中许多不同目录的 proof 模块，不能作为本候选测试成本；上表只接受精确 `core/query/runtime/{...}.js` 路径。

## 风险与反证

- **反证 1：旧文档把 policy/actionAuthority/proof 描述为 live。** `docs/sprint/autonomous-capability-audit.md:15-17` 仍描述 `runQueryLoop` 消费 policy、`executeTurn` 调 action authority；但当前仓库的精确生产 import 图对这三个文件 extV=0。该文档与当前源码状态不一致，不能作为现行 consumer 证据。
- **反证 2：`harness.ts` 是 live，是否因此覆盖 policy？** 否。harness 处理 snapshots、save points、pending queues、trajectory 和 output settlement【packages/ts-shell/src/core/query/runtime/harness.ts:183-967】；policy 处理 action decision pipeline【packages/ts-shell/src/core/query/runtime/policy.ts:37-170】。两者输入输出和责任边界不同。
- **反证 3：`proof.ts` 的底层依赖都有 live owner。** 这只证明底层 proof/verdict 能力存在；不证明 query runtime 对 state/observation/artifact correction/staged action 的组合逻辑被完整迁移。
- **反证 4：删除三个候选可能减少旧 query cluster。** 这在物理清理上成立，但 §2.1 明确要求“职责被活轨承担”而不是仅有不可达性。当前证据最多支持“无生产 value caller”，不支持“全部职责已被接管”。
- **反证 5：type-only edges 可以被擦除。** 它们确实不形成 runtime behavior，但 `events.ts`、`harnessState.ts`、`decision.ts`、`batch.ts` 仍承担跨文件 TypeScript contract；删除或迁移它们需要同步改写类型边，不应当混入三个 dead-leaf 的行为处置。

## 未验证事项

- `[UNVERIFIED]` 仓库外 package consumer、未入仓 plugin 或发布后直接 import `dist` 的 consumer；本报告只验证仓内源码、package main、scripts 与 package 配置。
- `[UNVERIFIED]` 动态入口的实际运行时 tracing；本报告完成了 §2.2 #4 要求的静态模式扫描，但没有启动每个脚本/进程做 runtime interception。
- `[UNVERIFIED]` 是否存在生成后代码或构建产物引用候选路径；本次 import 图只扫 `packages/ts-shell/src/**/*.ts`，未把 `dist/` 作为生产源码输入。
- `[UNVERIFIED]` 维护者是否已经裁决旧 query action policy、action authority、query proof projection 的产品责任正式放弃。若该裁决明确为“旧 lane 放弃”，建议下一步按“先迁移职责、再删除闭包”的顺序执行，而不是按零 value consumer 直接删除。
