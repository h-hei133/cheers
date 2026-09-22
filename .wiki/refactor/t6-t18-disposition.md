# T6 + T18 裁决报告（2026-09-20）

## 结论
**T6 建议暂不“恢复接线”，保留现状并记录 disposition：不要只给 `cliSessionRuntimeFactory.ts:70` 补两个形参。** `runtimeSeed` 在 `recovery.ts` 生产、经过 `/continue` 与 `cliRuntimeModule` 传入 `ShellSessionRuntime`，并且 `ShellSessionRuntime` 自己已经消费 `recoveryBoundary`；但 CLI 工厂之后的当前 live turn lane（`streamCliRuntimePrompt` → `runCliRuntimeInvocation` → `runTurn`）没有任何 `QueryRuntimeStateSeed` 输入或生产读取者。因此，补 factory 参数只能把 `runtimeSeed` 和 `continuityState` 接到一个不读它们的末端，属于把死字段重新接到死端；删调用点参数又会破坏现有 `SessionRuntimeDependencies` 契约及其测试 seam。T6 不是 CB-005 那种“生产者被删、读取者仍活着”的同类断链，而是生产者仍活、调用者仍传、具体 CLI 实现忽略尾部参数的反向/惰性消费问题。**T18 建议记录 disposition，不改代码：新扫描得到的 5 个所谓跨域边全部解析到 `session/presentation/`，没有一条解析到顶层 `src/presentation/`；其中只有 3 条是 value import，另 2 条是 `import type`。它们分别是 session-domain recovery model、session lifecycle predicate、以及 session-local warning formatting，不满足 T5 中“跨 feature 域共享实现应下沉到 `core/`”的前提。**

## 实测证据

### T6 参数流

实测命令：

```bash
python3 - <<'PY'
from pathlib import Path
root=Path('/home/wang/projects/cheer')
for rel, ranges in {
'packages/ts-shell/src/cli/runtime/cliSessionRuntimeFactory.ts':[(68,72)],
'packages/ts-shell/src/core/shell/sessionRuntime.ts':[(42,50),(244,270)],
'packages/ts-shell/src/entrypoints/cliRuntimeModule.ts':[(392,399)],
'packages/ts-shell/src/core/shell/recovery.ts':[(324,328),(356,367)],
'packages/ts-shell/src/core/shell/continueShellActionRuntime.ts':[(156,162)],
}.items():
    lines=(root/rel).read_text().splitlines()
    for a,b in ranges:
        for i in range(a,b+1): print(f'{rel}:{i}: {lines[i-1]}')
PY
```

关键结果：

- `core/shell/recovery.ts:324-328` 生产 `runtimeSeed`，`core/shell/recovery.ts:364-367` 放入 `autoResume.runtimeSeed`。
- `core/shell/continueShellActionRuntime.ts:158-161` 把该 seed 继续放入 `executeResolvedPromptTurn`。
- `entrypoints/cliRuntimeModule.ts:392-399` 把 `options.runtimeSeed` 放入 `sessionRuntime.executePrompt(..., { runtimeSeed, continuityState })`。
- `core/shell/sessionRuntime.ts:45-50` 的 `SessionRuntimeDependencies.runPrompt` 契约声明四个位置参数：`prompt`、`signal`、`runtimeSeed?`、`continuityState?`。
- `core/shell/sessionRuntime.ts:270` 实际传四个参数：
  `this.deps.runPrompt(promptForModel, signal, options?.runtimeSeed, continuityState)`。
- `cli/runtime/cliSessionRuntimeFactory.ts:70` 的实现只声明 `(prompt, signal)`。因此被具体 CLI 工厂忽略的是：
  1. 第三个参数 `runtimeSeed`；
  2. 第四个参数 `continuityState`。

用原生 JavaScript 语义做的最小复现命令：

```bash
node - <<'JS'
const received=[];
const cliFactoryRunPrompt = function(prompt, signal){
  received.push({prompt, signal, argc: arguments.length, runtimeSeed: arguments[2], continuityState: arguments[3]});
};
cliFactoryRunPrompt('prompt', 'signal', { observations: ['obs'], taskState: { id: 'task' }, harness: { id: 'harness' } }, { sessionId: 's' });
console.log(JSON.stringify({
  declaredParameters: cliFactoryRunPrompt.length,
  runtimeSeedAtBoundary: received[0].runtimeSeed,
  continuityStateAtBoundary: received[0].continuityState,
  argcAtBoundary: received[0].argc,
}, null, 2));
JS
```

输出为 `declaredParameters: 2`、`runtimeSeedAtBoundary` 与 `continuityStateAtBoundary` 能通过 `arguments[2]` / `arguments[3]` 被观察到，但没有对应的命名形参，且当前函数体没有把它们转发给 `streamCliRuntimePrompt`；因此它们在 CLI factory 之后的调用链中蒸发。`argcAtBoundary: 4` 证明调用方确实传了四个实参。复现的是“调用方传四个，具体实现只声明并消费前两个、未向下游转发尾部两个”的事实；并不是 JavaScript 自动丢弃。

### T6 种子来源与读者

种子 shape 与恢复构造：

- `core/query/runtime/state.ts:155-167` 定义 `QueryRuntimeStateSeed`，含 `config`、`currentRole`、`turn`、`pendingLifecycle`、`recoveryBoundary`、`truthBoundary`、`derivedState`，以及可选 `observations`、`harness`、`taskState`。
- `session/replay/builder.ts:371-408` 生成这些字段：`derivedState.transcript`、条件性的 `observations`、`taskState`、`harness`。
- `core/query/runtime/state.ts:191-222` 的 `createQueryRuntimeStateFromSeed` 会读取 `seed.derivedState.transcript`、`seed.observations`、`seed.taskState`、`seed.harness`。

但是，下面这个实测命令排除了测试文件和声明本身，扫描生产调用者：

```bash
python3 - <<'PY'
from pathlib import Path
root=Path('/home/wang/projects/cheer')
src=root/'packages/ts-shell/src'
needle='createQueryRuntimeStateFromSeed('
rows=[]
for p in src.rglob('*.ts'):
    if '.test.' in p.name: continue
    for i,line in enumerate(p.read_text().splitlines(),1):
        if needle in line and not line.strip().startswith('export function createQueryRuntimeStateFromSeed'):
            rows.append((str(p.relative_to(root)),i,line.strip()))
print('production callers excluding declaration:',len(rows))
for r in rows: print(r)
for pat in ['seed.observations','seed.taskState','seed.harness','seed.derivedState.transcript']:
    rows=[]
    for p in src.rglob('*.ts'):
        if '.test.' in p.name or p.name=='state.ts': continue
        for i,line in enumerate(p.read_text().splitlines(),1):
            if pat in line: rows.append((str(p.relative_to(root)),i,line.strip()))
    print(pat, len(rows), rows)
PY
```

实测输出：

```text
production callers excluding declaration: 0
seed.observations 0 []
seed.taskState 1 [('packages/ts-shell/src/core/query/runtime/harness.ts', 71, 'taskStateVersion: seed.taskStateVersion ?? 1,')]
seed.harness 0 []
seed.derivedState.transcript 0 []
```

`harness.ts:71` 的 `seed.taskStateVersion` 属于 harness 自身的局部 seed，不是 `QueryRuntimeStateSeed` 的生产读者，不能当作 T6 的 live consumer。换言之：`createQueryRuntimeStateFromSeed` 的读者目前是测试，不是当前 CLI turn lane 的生产调用链。

`runtimeSeed` 并非从源头完全无意义：`core/shell/sessionRuntime.ts:222-267` 用它决定是否构造 continuation state、是否注入 future-turn prompt、是否写入 user-prompt barrier、以及是否调用 `markRecoveryReentry`；`core/shell/recovery.ts:412-413` 与 `:431-438` 也在生成 continuation prompt 时读取 `recoveryBoundary`、`truthBoundary.continuationSafety` 和 `derivedState.transcript`。但这些消费发生在 CLI 工厂边界之前。**被丢弃的尾部 payload 在当前 CLI 执行层没有 live reader；已到达 `ShellSessionRuntime` 的部分语义已经在丢弃前完成。**

### T18 fresh scan

实测命令：

```bash
python3 /tmp/t6-t18-scan.py
```

脚本对 `packages/ts-shell/src/session/**/*.ts` 扫描非测试文件中的相对 import，按相对路径解析 `.js` → `.ts`，并单独标记 `import type`。结果：

```text
ALL_NONTEST_SESSION_PRESENTATION_IMPORTS
packages/ts-shell/src/session/SessionManager.ts:33 [value] ./presentation/sessionReentrySurface.js -> packages/ts-shell/src/session/presentation/sessionReentrySurface.ts
packages/ts-shell/src/session/lifecycle/sessionLifecycleWrites.ts:48 [value] ../presentation/sessionReentrySurface.js -> packages/ts-shell/src/session/presentation/sessionReentrySurface.ts
packages/ts-shell/src/session/recovery/projectContextSummary.ts:1 [type] ../presentation/sessionReentrySurface.js -> packages/ts-shell/src/session/presentation/sessionReentrySurface.ts
packages/ts-shell/src/session/recovery/sessionRecoverySelection.ts:1 [type] ../presentation/sessionReentrySurface.js -> packages/ts-shell/src/session/presentation/sessionReentrySurface.ts
packages/ts-shell/src/session/recovery/sessionRecoverySelection.ts:2 [value] ../presentation/sessionReentrySurface.js -> packages/ts-shell/src/session/presentation/sessionReentrySurface.ts
packages/ts-shell/src/session/sessionReadSurface.ts:21 [value] ./presentation/sessionReentrySurface.js -> packages/ts-shell/src/session/presentation/sessionReentrySurface.ts
packages/ts-shell/src/session/store/sessionListStore.ts:6 [value] ../presentation/sessionWarningSurface.js -> packages/ts-shell/src/session/presentation/sessionWarningSurface.ts
COUNT=7 VALUE=5 TYPE=2 TOP_LEVEL=0
T18_CANDIDATE_IMPORTS
packages/ts-shell/src/session/lifecycle/sessionLifecycleWrites.ts:48 [value] ../presentation/sessionReentrySurface.js -> packages/ts-shell/src/session/presentation/sessionReentrySurface.ts
packages/ts-shell/src/session/recovery/projectContextSummary.ts:1 [type] ../presentation/sessionReentrySurface.js -> packages/ts-shell/src/session/presentation/sessionReentrySurface.ts
packages/ts-shell/src/session/recovery/sessionRecoverySelection.ts:1 [type] ../presentation/sessionReentrySurface.js -> packages/ts-shell/src/session/presentation/sessionReentrySurface.ts
packages/ts-shell/src/session/recovery/sessionRecoverySelection.ts:2 [value] ../presentation/sessionReentrySurface.js -> packages/ts-shell/src/session/presentation/sessionReentrySurface.ts
packages/ts-shell/src/session/store/sessionListStore.ts:6 [value] ../presentation/sessionWarningSurface.js -> packages/ts-shell/src/session/presentation/sessionWarningSurface.ts
ALL=7 VALUE=5 TYPE=2 TOPLEVEL=0
T18_FIVE
packages/ts-shell/src/session/lifecycle/sessionLifecycleWrites.ts:48 [value] ../presentation/sessionReentrySurface.js -> packages/ts-shell/src/session/presentation/sessionReentrySurface.js
packages/ts-shell/src/session/recovery/projectContextSummary.ts:1 [type] ../presentation/sessionReentrySurface.js -> packages/ts-shell/src/session/presentation/sessionReentrySurface.js
packages/ts-shell/src/session/recovery/sessionRecoverySelection.ts:1 [type] ../presentation/sessionReentrySurface.js -> packages/ts-shell/src/session/presentation/sessionReentrySurface.js
packages/ts-shell/src/session/recovery/sessionRecoverySelection.ts:2 [value] ../presentation/sessionReentrySurface.js -> packages/ts-shell/src/session/presentation/sessionReentrySurface.js
packages/ts-shell/src/session/store/sessionListStore.ts:6 [value] ../presentation/sessionWarningSurface.js -> packages/ts-shell/src/session/presentation/sessionWarningSurface.js
```

因此，计划中列出的“五处”数量对应 **5 个 import 声明**，但不是“五处指向顶层 `presentation/` 的 value edge”：实际是 **3 条 value edge + 2 条 type-only edge**，且 **0 条**解析到 `packages/ts-shell/src/presentation/`。另外，`SessionManager.ts:33` 和 `sessionReadSurface.ts:21` 的 `./presentation/...` 也明确解析到 `session/presentation/`，不是顶层 presentation。

## 逐类分析

### T6：是否应恢复参数

#### 1. 丢失内容

- 第三个位置参数是 `runtimeSeed`，来源是恢复链构造的 `QueryRuntimeStateSeed`；其潜在字段包括 `observations`、`taskState`、`harness`、`derivedState.transcript`，以及恢复边界与生命周期索引。
- 第四个位置参数是 `continuityState`，来源是 `SessionManager.buildContinuitySnapshot(...)`；`ShellSessionRuntime` 自己在 terminal surface 渲染时仍直接使用它（`sessionRuntime.ts:219-240`、`:305-314`），所以 CLI 工厂忽略它不会抹掉该次 `ShellSessionRuntime` 的本地渲染输入。
- `runtimeSeed.recoveryBoundary` 在调用 CLI 工厂前已经被 `sessionRuntime.ts:258-267` 读取并用于 `markRecoveryReentry`；它不是在工厂之后才首次需要。

#### 2. 当前 live lane 是否读取 seed 字段

没有被证明的生产读取者。`createQueryRuntimeStateFromSeed` 当前只有测试调用者；`streamCliRuntimePrompt` 的输入契约（`cliRuntimeInvocationBridge.ts:11-28`）、`CliRuntimeInvocationInput`（`entrypoints/cliRuntimeInvocation.ts:23-39`）和 `runTurn` 的 `TurnOptions`（`turn/session.ts:41-60`）都没有 runtime seed 字段。当前 `runTurn` 从 `history` 和 prompt 建立新的 `AgentCore`，没有从 seed 重建 query runtime state。

#### 3. 与 CB-005 的关系

不是同一类“producer deleted, reader alive”断链：

- CB-005 的典型形态是生产者消失，活轨仍读取旧字段/标记。
- T6 是生产者 `buildRuntimeStateSeed` 存活，`ShellSessionRuntime` 调用点也仍传值，但 CLI 工厂的具体实现只消费前两个参数；下游 `turn/`/`entrypoints/cliRuntimeInvocation.ts` 也没有 seed reader。
- 因此 T6 更像“producer alive, consumer seam inert / stale contract”，是与 CB-005 相反的方向，且目前没有证据表明 live CLI lane 已经因为这个尾部 payload 丢失而改变用户可见行为。

#### T6 推荐

**选择“leave as is”，但登记为明确 disposition，不要把它标成已修复。**

理由：

1. 只把 `cliSessionRuntimeFactory.ts:70` 改成四个形参，会把 seed 接到 `streamCliRuntimePrompt` 之外的空白处；不能使 `turn/` 读取 `observations`、`taskState`、`harness` 或 transcript。
2. 只删除 `sessionRuntime.ts:270` 的第三、第四实参，会改变当前 `SessionRuntimeDependencies` 契约及其大量测试 seam；该动作不是“修复语义”，而是另一个 contract cleanup 任务。
3. 若产品真的要恢复 seed 语义，必须端到端扩展 `streamCliRuntimePrompt` → `CliRuntimeInvocationInput` → `runCliRuntimeInvocation` → `runTurn`，并在 turn/query owner 中明确调用 `createQueryRuntimeStateFromSeed` 或等价恢复逻辑；不能只改 factory 签名。

### T18：五个候选边的分类

| 文件:行 | 精确 specifier | 类型 | 实际解析 | 分类 | 若未来要拆，shared part 应放哪里 |
|---|---|---|---|---|---|
| `session/recovery/projectContextSummary.ts:1` | `../presentation/sessionReentrySurface.js` | `import type` | `session/presentation/sessionReentrySurface.ts` | 共享的 session recovery model 类型，不是 UI-only | `session/recovery/sessionReentryModel.ts` 或 `session/recovery/sessionReentryTypes.ts` |
| `session/recovery/sessionRecoverySelection.ts:1` | `../presentation/sessionReentrySurface.js` | `import type` | `session/presentation/sessionReentrySurface.ts` | 共享的 session recovery model 类型，不是 UI-only | 同上，放 recovery owner |
| `session/recovery/sessionRecoverySelection.ts:2` | `../presentation/sessionReentrySurface.js` | value | `session/presentation/sessionReentrySurface.ts` | `scoreSessionReentrySummary` 是恢复选择策略，不是终端渲染 | `session/recovery/sessionRecoverySelection.ts` 内联/本地 helper，或 `session/recovery/sessionReentryPolicy.ts` |
| `session/store/sessionListStore.ts:6` | `../presentation/sessionWarningSurface.js` | value | `session/presentation/sessionWarningSurface.ts` | 警告字符串格式化，确实是 presentation-specific behavior，但仍是 session-local warning surface，不是顶层 presentation 反向边 | 最干净的是 storage 返回结构化 warning，再由 CLI/presentation 格式化；低风险折中是 `session/store/sessionWarnings.ts` |
| `session/lifecycle/sessionLifecycleWrites.ts:48` | `../presentation/sessionReentrySurface.js` | value | `session/presentation/sessionReentrySurface.ts` | `sessionHasConversation` 是 session 生命周期语义谓词，不是 UI 行为 | `session/recovery/sessionReentryPolicy.ts` 或 `session/sessionPredicates.ts` |

`session/presentation/sessionReentrySurface.ts` 本身依赖 `Session`、`RecoverySnapshot`、`SessionResumeEligibility`、`SessionContinuitySnapshot` 等 session-domain 类型；把它机械移动到 `core/` 会违反 core 的 domain-neutral 准入。它的文件夹名偏 presentation，但其主要内容是 session reentry projection/policy，而非顶层终端/TUI 渲染。

### T18 推荐与成本

**推荐：record a disposition，五处全部不改。** 不是“fix subset”，因为没有一条是题目所指的 `session/` → 顶层 `presentation/` 反向依赖；修其中一部分不会消除一个真实的顶层环。

如果强行修五处，成本不是 T5 的“把共享纯函数搬到 `core/`”那种低风险替换：

```bash
python3 - <<'PY'
from pathlib import Path
root=Path('/home/wang/projects/cheer')
src=root/'packages/ts-shell/src'
symbols=['SessionReentrySummary','scoreSessionReentrySummary','sessionHasConversation','formatUnreadableSessionDirectoryWarning','formatListSessionsFailureWarning','projectSessionReentrySummary','sessionHasReentrySurface']
for sym in symbols:
    hits=[]
    for p in src.rglob('*.ts'):
        for i,line in enumerate(p.read_text().splitlines(),1):
            if sym in line: hits.append((str(p.relative_to(root)),i,line.strip()))
    print(f'{sym}: {len(hits)} textual hits; files={len(set(x[0] for x in hits))}')
PY
```

实测 blast radius：

- `SessionReentrySummary`：48 个文本命中，分布在 12 个文件；
- `scoreSessionReentrySummary`：6 个命中，3 个文件；
- `sessionHasConversation`：5 个命中，2 个文件；
- 两个 warning formatter 合计各 5 个命中，均分布在 3 个文件。

最低成本的“命名/放置修正”是把 `sessionReentrySurface.ts` 拆成 session recovery model/policy，再改约 3 个生产 import 声明和若干 facade/test 引用；但这属于 session 内部 owner 归位，不是 T18 所声称的跨顶层域解环。更严格的 warning 解耦则需要改变 `listSessionRecords` 的 warning 输出契约，让 storage 不再生成用户可见字符串，成本高于简单搬文件。

## 与既有记录的差异

1. 既有记录称 T18 有 5 处“跨域指向顶层 `presentation/`”边；fresh scan 复核出 5 个候选 import 声明，但 **0 个**解析到顶层 `src/presentation/`，全部解析到 `src/session/presentation/`。
2. 既有记录将 5 处写成“跨域 value edges”；fresh scan 将其拆成 **3 条 value + 2 条 type-only**。两条 type-only 仍可参与 import-cycle 图，但不是运行时 value edge。
3. 既有记录把 T6 描述为 runtimeSeed 在 CLI 边界蒸发；这一事实成立，但产品语义需要分层：seed 的恢复边界字段已在 `ShellSessionRuntime` 内消费，当前 CLI turn lane 没有 seed-aware reader，所以“补 factory 形参”不会恢复实际 seed state reconstruction。
4. 与 T5 不同：T5 的对象是 browser 与 presentation 共同消费的纯文本安全实现，满足 `core/` 的 direction/audience/survival 条件；T18 的对象携带 session-specific 类型或 session-local warning semantics，不满足同样的 core 下沉条件。

## 风险与反证

- 如果存在本次静态扫描看不到的动态入口，能够把 `streamCliRuntimePrompt` 或 `runCliRuntimeInvocation` 替换成 seed-aware implementation，则 T6 的“当前无 live reader”结论需要重做；本次扫描未发现这样的生产调用者，但没有运行动态 tracing。
- 如果未来 turn kernel 恢复 query runtime state reconstruction，`observations`、`taskState`、`harness`、`derivedState.transcript` 将变成真正有意义的 CLI 输入；届时应端到端恢复参数，而不是只改 factory。
- 如果团队把 `session/presentation/` 视为严格禁止被 recovery/store/lifecycle 依赖的命名边界，即使没有顶层环，也可以执行内部 owner 归位；这会是 placement cleanup，不应描述为 T18 的顶层反向依赖修复。
- warning formatter 当前直接生成用户可见字符串；若未来需要多种 front-end、结构化告警或国际化，`sessionListStore` 与 formatter 的耦合应另立任务处理。

## 未验证事项

- 未运行真实 TUI/PTY；本任务没有修改 `session/`、`cli/` 或 `turn/` 代码，只做裁决报告。
- 未对动态 `import()`、`spawn` 或 `pathToFileURL` 做专项运行时 tracing；本次 T18 结论基于 `packages/ts-shell/src/session/` 相对 import 的解析结果。
- 未验证任何外部/未检出的插件是否实现 seed-aware `runPrompt`；仓库内当前生产源码未显示该实现。
- 未修改既有 `plan.md` 或任何产品源码；本报告是本轮唯一新增文件。
