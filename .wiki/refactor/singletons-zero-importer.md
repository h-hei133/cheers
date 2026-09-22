# 四个 zero-importer 单例处置建议

> 目标：复核四个候选文件的 value/type/test importers、动态入口、公共面与 `scripts/` 字符串路径，并按 `.wiki/refactor/plan.md` §2.1/§2.2/§2.5 给出删除授权建议。
>
> 本报告只新增本文件；以下结论会随实测证据补全。

## 结论

| 文件 | 直接 importer 复核 | 动态/保护结论 | 推荐 |
|---|---|---|---|
| `packages/ts-shell/src/test-utils/longSessionDurabilityProcess.ts` | 0 value / 0 type / 0 test importer | `*Process.ts`；被 sibling test 以 `path.join(..., "longSessionDurabilityProcess.ts")` + `spawnSync(process.execPath, [tsxCli, fixturePath, ...])` 启动，属于 §2.5 动态入口保护类 | **keep（明确保护）** |
| `packages/ts-shell/src/core/query/runtime/actionAuthority.ts` | 0 value / 1 type / 0 test importer；`core/query/runtime/batch.ts:6` imports `RuntimeActionBlock` | `batch.ts` 自身不可达；这是弱 type hold，不是 live contract | **retain / keep-and-investigate；不可按单文件删，若处置则与 unreachable batch 组件一起迁移/删除** |
| `packages/ts-shell/src/core/query/runtime/proof.ts` | 0 value / 1 type / 0 test importer；`core/query/runtime/events.ts:12` imports `QueryRuntimeProofProjection` | 无动态入口、公共 API 或 scripts rescue | **retain / keep-and-investigate；不授权直接删除** |
| `packages/ts-shell/src/session/replay/host/facts.ts` | 0 value / 0 type / 0 test importer | 无动态入口、公共 API 或 scripts rescue | **retain；未证明有 live lane 覆盖其 host replay facts projection** |

这些结果修正“4 个 zero-importer”的标题：按用户要求的 value+type+test 口径，当前树中严格 zero-importer 是 2 个（`host/facts.ts`、`longSessionDurabilityProcess.ts`）；`actionAuthority.ts` 与 `proof.ts` 各有 1 条目录内 type-only 边。若把“无 value importer”作为旧 reachability 口径，四个仍可列为行为孤儿候选，但不能称为严格 zero-importer。

## 实测证据

工作树：`/home/wang/projects/cheer`。目标文件行数命令：

```bash
wc -l packages/ts-shell/src/core/query/runtime/actionAuthority.ts \
  packages/ts-shell/src/core/query/runtime/proof.ts \
  packages/ts-shell/src/session/replay/host/facts.ts \
  packages/ts-shell/src/test-utils/longSessionDurabilityProcess.ts
```

结果：`312`, `323`, `63`, `610` 行（合计 1,308）。

### 直接 importer 搜索

命令（basename、精确路径、导出符号分别查，避免把不同目录的 `facts.ts` / `proof.ts` 混淆）：

```bash
git grep -n -E 'actionAuthority|query/runtime/proof|replay/host/facts|projectHostReplayFacts|longSessionDurabilityProcess|longSessionDurability' -- '*.ts' '*.mjs' 'package.json' '.github/**' 'scripts/**' || true
```

结果中与四个目标有关的唯一代码边/路径：

```text
packages/ts-shell/src/core/query/runtime/batch.ts:6:import type { RuntimeActionBlock } from './actionAuthority.js'
packages/ts-shell/src/core/query/runtime/events.ts:12:import type { QueryRuntimeProofProjection } from './proof.js'
packages/ts-shell/src/session/longSessionDurability.test.ts:228:    "longSessionDurabilityProcess.ts",
```

同一命令没有找到 `facts.ts` 的 importer、`projectHostReplayFacts` 的调用、或四个目标的其他 test import。对动态 import 的独立命令：

```bash
git grep -n -E 'import[[:space:]]*\([^)]*(actionAuthority|query/runtime/proof|replay/host/facts|longSessionDurability)' -- '*.ts' '*.mjs' || true
```

结果：无输出。上述直接 grep 不是图脚本，覆盖单行与多行 import 的命中；随后读取了 `batch.ts:1-12`、`events.ts:1-14`、`longSessionDurability.test.ts:217-248` 上下文确认边类型与调用方式。

### liveness 复核

```bash
python3 scripts/analyze-boundaries.py
python3 scripts/analyze-boundaries.py --list > /tmp/boundary-list.txt
grep -n -E 'actionAuthority|runtime/proof|replay/host/facts|longSessionDurabilityProcess|core/query/runtime/batch' /tmp/boundary-list.txt
```

当前 totals：`production=940`, `cliReachable=771`, `cliOpaque=169`, `scriptOnly=0`, `publicApiOnly=1`, `testOnly=132`, `noReference=36`。候选行显示：

```text
C     core/query/runtime/actionAuthority.ts
C     core/query/runtime/batch.ts
C     core/query/runtime/proof.ts
-     session/replay/host/facts.ts
-     test-utils/longSessionDurabilityProcess.ts
```

`C` 表示 `analyze-boundaries.py` 的 CLI-reachable 集；但该脚本的图边口径把 import type 也当 reachability 边，所以 `actionAuthority.ts` 与 `proof.ts` 的 `C` 只说明它们经 `batch.ts` / `events.ts` 进入 value-only/combined closure 的祖先集合，不能替代直接 importer 证据。重要的是 `batch.ts` 与 `events.ts` 也未显示生产 value caller；因此 actionAuthority 的唯一 importer 是 unreachable `batch.ts` 的 type contract，proof 的唯一 importer 是 unreachable `events.ts` 的 type contract（`events.ts` 自身虽有 live type consumers，但没有 proof projection 的 value consumer）。

### `*Process.ts` 动态入口证据

要求的 basename/path 搜索：

```bash
git grep -n -E 'longSessionDurabilityProcess|longSessionDurability' -- '*.ts' '*.mjs' 'package.json' '.github/**' 'scripts/**' || true
```

结果：

```text
packages/ts-shell/src/session/longSessionDurability.test.ts:228:    "longSessionDurabilityProcess.ts",
scripts/verify-session-durability-long.mjs:40:  'src/session/longSessionDurability.test.ts',
```

兄弟测试上下文：

```text
packages/ts-shell/src/session/longSessionDurability.test.ts:223-232
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const fixturePath = path.join(process.cwd(), "src", "test-utils", "longSessionDurabilityProcess.ts");
const result = spawnSync(process.execPath, [tsxCli, fixturePath, mode, scenario, ...]);
```

目标进程本身也读取 `process.argv` 并在 `main()` 中分派 `seed`, `append-unrelated`, `continue` 三种模式（`longSessionDurabilityProcess.ts:38-53`），故不是普通未引用 helper，而是测试动态 entry。命令 `git ls-files '*Process.ts'` 仅列出 `core/harness/agentCliProcess.ts` 与此目标，进一步确认其命名保护类别。

## 逐类分析

### 1. `longSessionDurabilityProcess.ts`：keep，动态入口保护

功能读审：610 行 fixture process 负责 seed 长会话、追加无关 turn、重新加载并执行 `/continue`，输出 JSON 给 sibling durability test。入口为 `main()` + `process.argv`（`:38-53`），核心状态写入在 `seedLongSession()`（`:70-125`），输出在 `writeJson()`（`:602-604`）。

授权问题：不适用“live lane 是否覆盖”作为删除授权的唯一依据，因为 §2.5 明文保护字符串路径启动与 `*Process.ts`。证据显示 sibling test 每个 fixture 调用都通过 `spawnSync` 启动该路径；删除会直接破坏 `session/longSessionDurability.test.ts` 的两条成功/部分失败耐久性场景。**结论：keep。**

### 2. `actionAuthority.ts`：弱 type hold；确认旧报告的职责判断，但修正 importer 分类

功能读审：312 行实现 action authority：无上下文时阻止 edit/repair，缺少 targeted verification 时阻止 verify，缺少 source/verification evidence 时阻止 artifact；还生成 blocked output、失败 `CodingResultSummary`、handoff 与 not-proven evidence（`:16-112`, `:121-288`）。

直接 importer：仅 `batch.ts:6` 的 `import type { RuntimeActionBlock }`；无 value importer、无 test importer、无 dynamic import。`batch.ts:96-114` 只把该类型用于 blocked batch result 的入参/结构化结果。

活性：`batch.ts` 本身在 `analyze-boundaries.py --list` 中标为 `C`，但 direct grep 未找到其生产 value caller；`events.ts` 也只有类型契约边。故这是“unreachable importer → unreachable target”的弱 hold，不是 live file dependency。依据 whole-component rule，不能孤删 `actionAuthority.ts` 而留下 batch contract。

等价实现：`planning/execution/model.ts:34-184` 只构建 execution plan/action contracts；`tools/policy/strategy.ts:72-213` 选择 next action 并计算 proof gaps。它们没有 `actionAuthority.ts` 的 output mismatch blocking、targeted verification enforcement 或 blocked `CodingResultSummary` 生成。**没有证明完整职责已由 live lane 接管。**

推荐：**retain / keep-and-investigate**，与先前 `.wiki/refactor/query-runtime-orphans-disposition.md:7-9,135-153` 的“keep-and-investigate”结论一致，但本报告将分类更正为“1 条 unreachable type-only importer”，不是严格 zero-importer。只有在明确退休旧 query runtime 并先把 authority enforcement 迁移到 live execution lane 后，才可删除其连通组件。

### 3. `proof.ts`：unreachable type-only hold；确认旧报告的职责判断

功能读审：323 行把 query runtime state/observation/harness 与 output/decision 组合成 artifact receipt、artifact correction、task proof、task verdict，并计算 changed-file coverage、repair post-validation、original failure preservation、staged-action consistency、host status（`:41-137`, `:158-323`）。

直接 importer：仅 `events.ts:12` 的 `import type { QueryRuntimeProofProjection }`，无 value importer、无 test importer、无 dynamic import。`events.ts:33` 把它放进 `runtime.task-proof` 事件的类型 contract；没有找到任何 `projectQueryRuntimeProof(...)` 调用。

活性与覆盖：`events.ts` 有许多 live type consumers，但 proof projection 自身无 live value consumer；因此这是 unreachable type-only hold。底层 live owners 确实存在：`evidence/task/proof.ts:61-227` 构建 `TaskProofInput`，`result/task/verdict.ts:18-37` 构建 `TaskVerdict`，`artifacts/workflow/model.ts:24-65` / `correction.ts:10-67` 管理 artifact receipt/correction，`verification/execution/model.ts:57-164` 管理 verification/changed-file coverage。但这些 owner 不接收 query runtime 的完整 `state + decision + output` glue，也不直接生成 `QueryRuntimeProofProjection` 或 runtime event projection。

推荐：**retain / keep-and-investigate**，与 `.wiki/refactor/query-runtime-orphans-disposition.md:21,166-175` 一致。**没有证明 live lane 已完整覆盖其 query-specific projection 责任**；若要删除，先迁移 state/observation/harness-derived inputs、artifact correction 与 staged-action consistency，并保留等价行为验证。

### 4. `session/replay/host/facts.ts`：strict zero importer；retain

功能读审：63 行把 `HostSessionRecord` 与可选 `ReplaySafeLoopStateSummary` 投影成 host replay facts：session/active leaf、retained fact ids、provider-safe request facts、redaction exclusions、cancelled guard、not-proven claims（`:5-63`）。

直接 importer：`git grep` 未发现 `replay/host/facts`, `projectHostReplayFacts`, `HostReplayFacts` 的任何外部或测试使用；只有文件自身声明。无 dynamic import、无 basename string path、无 public export、无 `scripts/` 命中。

授权问题：**未证明有 live lane 覆盖完整责任。** `session/replay/state.ts:58-174,189-409` 生成更宽的 `ReplaySafeLoopStateSummary`；`context/rebuildInput.ts:19-158` 生成 context rebuild facts；`session/store/host/state.ts:10-21,190-200` 保存 host session/tree projection。它们分别覆盖 replay summary、context rebuild、host session state，但没有任何一个输出 `HostReplayFacts` 的 host-specific projection（尤其是 `replayReady = lifecycle !== cancelled`、host fact id、retained ids 聚合与固定 exclusions）。**结论：retain；不要按不可达性删除。**

## 六项检查

### `longSessionDurabilityProcess.ts`

1. **功能读审**：完成；它是 610 行可执行 fixture process，不是被动工具。
2. **等价实现核验**：未发现 sibling test 可替代的独立 process；测试明确依赖其 JSON stdout/session lifecycle。
3. **消费者存活检查**：sibling `session/longSessionDurability.test.ts:25-185` 通过 `runFixture()` 启动，覆盖 success 与 partial failure 两个场景；该测试由 `scripts/verify-session-durability-long.mjs:34-41` 注册执行。
4. **动态入口检查**：通过。`path.join(..., "longSessionDurabilityProcess.ts")` + `spawnSync(process.execPath, [tsxCli, fixturePath, ...])`；目标自身 `process.argv`/`main()`。
5. **公共面检查**：`packages/ts-shell/src/index.ts` 不导出；但这不削弱动态入口保护。
6. **`scripts/` 检查**：脚本字符串只指向 sibling test，而 sibling test 再以路径 spawn 目标；因此脚本间接保护测试 gate，不是零引用。

### `actionAuthority.ts`

1. **功能读审**：`:16-312`，覆盖 action blocking/output constraint/blocked result。
2. **等价实现核验**：strategy/plan lane 只覆盖 action selection/contracts，未覆盖 authority output enforcement。
3. **消费者存活检查**：唯一 importer `batch.ts:6` 为 type-only；`batch.ts` 无生产 value caller，故是弱 hold；无 test importer。
4. **动态入口检查**：目标文件无 `import()`, `pathToFileURL`, `spawn/execFile`, `process.argv`, shebang 或 `main()`；`git grep` 无命中。
5. **公共面检查**：package main 为 `dist/packages/ts-shell/src/index.js`（`packages/ts-shell/package.json:6`）；`src/index.ts:1-55` 未导出 query runtime authority。
6. **`scripts/` 检查**：对候选路径/名称的 `git grep` 无命中。

### `proof.ts`

1. **功能读审**：`:41-323`，覆盖 query-specific proof projection glue。
2. **等价实现核验**：底层 proof/verdict/artifact/verification owners 存活，但无完整 query projection equivalent。
3. **消费者存活检查**：唯一 importer `events.ts:12` 为 type-only；无 `projectQueryRuntimeProof` value call、无 test importer。
4. **动态入口检查**：无动态 import/process entry indicators；候选路径在 dynamic scan 无命中。
5. **公共面检查**：`src/index.ts` 导出的是 `evidence/task/proof.ts` 与 `result/task/verdict.ts`，不是 query runtime proof。
6. **`scripts/` 检查**：候选路径/名称在 scripts/package/.github 无命中。

### `session/replay/host/facts.ts`

1. **功能读审**：`:5-63`，host replay facts projection。
2. **等价实现核验**：replay state/context rebuild/host session state 各自存活，但无同构 host facts projection。
3. **消费者存活检查**：0 value / 0 type / 0 test importer。
4. **动态入口检查**：无 `import()`, process entry, spawn/execFile, shebang 或 `main()`。
5. **公共面检查**：未由 `src/index.ts` 导出。
6. **`scripts/` 检查**：无候选路径字符串命中。

## 风险与反证

- **反证 1：直接 grep 与旧图分类冲突。** 本报告以直接 `git grep` + 上下文为准：`actionAuthority.ts` 的 `batch.ts:6`、`proof.ts` 的 `events.ts:12` 都是当前工作树真实 type-only 边；任何把它们称为 strict zero-importer 的数字都应视为 resolver/multiline parser 误报。
- **反证 2：`events.ts` 有 live type consumers，是否因此让 `proof.ts` live？** 不能。`events.ts` 的 live consumers 读取 `QueryEvent`；当前没有 `projectQueryRuntimeProof()` 的 value call，只有 proof projection 类型出现在事件 union 中。
- **反证 3：底层 proof/verdict owners 存活，是否足以删除 query `proof.ts`？** 不足。底层 owner 不覆盖 query state/observation/harness glue、artifact receipt correction 与 staged-action consistency 的完整组合责任。
- **反证 4：`ReplaySafeLoopStateSummary` / context rebuild 是否已取代 host facts？** 只覆盖更宽或相邻事实面；仓内没有 host facts equivalent 或 callsite。按 §2.1，缺少 live lane covering responsibility，不能授权删除。
- **反证 5：reachability output 标记 `C` 是否证明 action/proof live？** 不是。`analyze-boundaries.py` 的 closure 将 type-only edges 纳入图；因此 `C` 只说明图闭包，不等于生产 value execution。删除判据仍是 §2.1 的 live-lane coverage。

## 未验证事项

- `[UNVERIFIED]` 仓库外 package consumer、未入仓 plugin、发布后直接 import `dist` 的使用者。
- `[UNVERIFIED]` 动态入口运行时 tracing；本报告完成 §2.2 #4 的静态扫描，未对所有进程做 runtime interception。
- `[UNVERIFIED]` 构建后 `dist/` 生成物对候选路径的引用；本次直接 grep 以 git-tracked 源码、scripts、package、`.github` 为范围。
- `[UNVERIFIED]` 维护者是否正式退休 query runtime authority/proof projection 或 host replay facts 产品责任；若确认退休，应先迁移等价责任，再按连通组件执行删除。
