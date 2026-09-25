# T10/T11/T12 处置报告

## 结论

建议：**T10 删除四个只被测试链引用的 sidebar Quality/EventBridge 模块，但保留并改造仍在验证 live sidebar 行为的测试；T11 只做部分删除，删除已被 `/resume` 与 Shift+Tab 活轨接管的 sessions/agent-mode 死代码，保留 view-mode 子链，因为当前没有被证明的 live command lane 接管 `/view`；T12 删除三文件死链，并同步移除 `WorkflowTaskPlan.browserPlan` 这一枚无赋值、仅 type-only 引用的残留字段。** 这三项不是按 CLI 可达性授权，而是按“职责是否已被活轨承担”裁决：T10 的产品 sidebar 由 `projectSidebarState` → panel/live runtime → renderer 及 event sink/adaptor 承担；T11 的 sessions 由 `runResumeCommand` 承担、agent-mode 由 Shift+Tab 承担；T12 的显式 `/browser` 活轨由 `browserCommandRuntime`/`commandRunner`/action-loop 与 execution policy 链承担。T11 的 view-mode 语义仍被 `sessionRuntime`、`sessionEventSurface`、审批显示链消费，但没有发现当前生产命令把 `/view` 解析为 action，因此不能把它当作已授权删除的唯一实现。

## 实测证据

### 行数与删除成本

以下数字均由本轮命令重新测量，未采用 wiki 行数：

```bash
# T10 候选源文件
wc -l packages/ts-shell/src/presentation/sidebar/sidebarEventBridge.ts \
  packages/ts-shell/src/presentation/sidebar/sidebarPanelQuality.ts \
  packages/ts-shell/src/presentation/sidebar/sidebarLivePanelQuality.ts \
  packages/ts-shell/src/presentation/sidebar/sidebarStateQuality.ts
# 输出：244, 97, 99, 110；合计 550 行

# T10 相关测试
wc -l packages/ts-shell/src/presentation/sidebar/sidebarEventBridge.test.ts \
  packages/ts-shell/src/presentation/sidebar/sidebarStateQuality.test.ts \
  packages/ts-shell/src/presentation/sidebar/sidebarStateSurface.test.ts \
  packages/ts-shell/src/presentation/sidebar/sidebarPanelLayout.test.ts \
  packages/ts-shell/src/presentation/sidebar/sidebarLivePanelRuntime.test.ts
# 输出：80, 79, 31, 210, 188；合计 588 行

# T11 相关源/测试文件
wc -l packages/ts-shell/src/core/commands/shellActionRuntime.ts \
  packages/ts-shell/src/entrypoints/cliDisplayProjection.ts \
  packages/ts-shell/src/core/commands/types.ts \
  packages/ts-shell/src/cli/interactive/interactiveCommandRouter.ts \
  packages/ts-shell/src/entrypoints/cliCoreSplit.test.ts
# 输出：279, 74, 142, 281, 224

# T12 候选源文件
wc -l packages/ts-shell/src/browser/toolPolicy.ts \
  packages/ts-shell/src/browser/agent.ts \
  packages/ts-shell/src/browser/plan.ts
# 输出：188, 183, 218；合计 589 行
```

真实删除成本：

- **T10：直接删 550 行源代码。** wiki 的“约 440 行”低估了 110 行：质量模块实际为 `97 + 99 + 110 = 306` 行，EventBridge 为 244 行。测试处置不是整批删除：删除直接自测死模块的 `sidebarEventBridge.test.ts`（80 行）与 `sidebarStateQuality.test.ts`（79 行）；保留并窄改 `sidebarStateSurface.test.ts`、`sidebarPanelLayout.test.ts`、`sidebarLivePanelRuntime.test.ts`，因为它们仍在测试 live state/panel/runtime/renderer 行为，只是目前把死质量模块或 EventBridge 当作 fixture/断言辅助。
- **T11：不是删除整个文件。** `shellActionRuntime.ts` 的 `runSessionsShellAction` 为第 10–58 行（49 行），`runAgentModeShellAction` 为第 206–235 行（30 行），共删除 79 行；`runViewShellAction`（第 175–204 行，30 行）暂留。`cliDisplayProjection.ts` 中 `formatWorkspaceInfoLines` 为第 3–14 行（12 行，当前只有未使用 import、无调用），四个 view/agent formatter 中的两个 agent formatter 为第 33–52 行（20 行），共可删 32 行；保留两个 view formatter（第 16–31 行）及 live 的 `projectPermissionListDisplay`（第 54–74 行）。另需删除 `interactiveCommandRouter.ts` 中 agent-mode 分支第 220–238 行，并从 `ShellActionResult` 去掉 `set-agent-mode`/`show-agent-mode` 两个 action 与 `agentMode?` 字段；`list-sessions` 不能删，因为 `runResumeCommand` 仍在生产中产出它。此 partial diff 的源删除量为 **111 行**（79 + 32），另触及 router/types/test import/assertions；`cliDisplayProjection.ts` 不能整文件删除，因为 `cliPermissionModule.ts` 仍在生产中调用 `projectPermissionListDisplay`。
- **T12：直接删 589 行源代码。** 另需修改 `packages/ts-shell/src/planning/task/workflowTaskPlanner.ts`：移除 `import type { BrowserAgentPlan } from "../../browser/agent.js"` 与 `browserPlan?: BrowserAgentPlan` 字段。该字段仅 type-only 被引用且没有任何赋值点；不改这处会留下编译层残骸。

### 重点消费者扫描

```bash
# T10：候选模块的直接 import 只落在测试/测试可达质量链
# 输出命中的 import 行：7
 git grep -nE 'from "\\./sidebar(EventBridge|PanelQuality|LivePanelQuality|StateQuality)\\.js"' \
   -- packages/ts-shell/src/presentation/sidebar

# T11：候选符号与 stale action 的源内命中
# 输出：37 行；其中生产 import 只有 registry 对 shellActionRuntime 的 live exports，
# stale 三 export 不在 registry import 列表；cliDisplayProjection 的 live
# projectPermissionListDisplay 仍由 cliPermissionModule 调用
 git grep -nE 'runSessionsShellAction|runViewShellAction|runAgentModeShellAction|show-view|set-view|show-agent-mode|set-agent-mode|formatViewModeStatusLines|formatViewModeUpdatedLine|formatAgentModeStatusLines|formatAgentModeUpdatedLines|formatWorkspaceInfoLines' \
   -- packages/ts-shell/src

# T12：旧链的 import/symbol 扫描
# 输出：7 个相关 import 命中；28 个相关 symbol 命中（包含定义、type-only 边及死链内部引用）
 git grep -nE 'from "\\./(toolPolicy|plan)\\.js"|from "\\.\\./browser/agent\\.js"|from "\\.\\./\\.\\./browser/(agent|toolPolicy|plan)\\.js"' \
   -- packages/ts-shell/src
 git grep -nE 'detectBrowserAgentPlan|planBrowserTransaction|decideBrowserToolPolicy|browserActionKindForTool|isBrowserToolName|BrowserAgentPlan|BrowserTxnPlan|BrowserToolName' \
   -- packages/ts-shell/src
```

### 聚焦测试证据

```bash
cd packages/ts-shell && npx vitest run \
  src/presentation/sidebar/sidebarEventBridge.test.ts \
  src/presentation/sidebar/sidebarStateQuality.test.ts \
  src/presentation/sidebar/sidebarStateSurface.test.ts \
  src/presentation/sidebar/sidebarPanelLayout.test.ts \
  src/presentation/sidebar/sidebarLivePanelRuntime.test.ts
# 5 个文件，15 tests passed

cd packages/ts-shell && npx vitest run \
  src/cli/interactive/interactiveCommandRouter.test.ts \
  src/entrypoints/cliCoreSplit.test.ts \
  src/core/commands/slashRouter.test.ts \
  src/core/commands/slashCommandsModern.test.ts
# 4 个文件，42 tests passed

cd packages/ts-shell && npx vitest run \
  src/browser/commandRunner.test.ts \
  src/browser/executionCommandRunner.test.ts \
  src/browser/cliExecutionBridge.test.ts
# 3 个文件，33 tests passed
```

## 逐类分析

### T10：sidebar Quality 三模块 + EventBridge

**死性复核与 importer 分类：**

| 候选 | production importer | test-only importer | type-only | 实测结论 |
|---|---|---|---|---|
| `presentation/sidebar/sidebarEventBridge.ts` | 无 | `sidebarEventBridge.test.ts`、`sidebarStateQuality.test.ts`、`sidebarStateSurface.test.ts` | 无 | 生产零消费者；三处均为测试 fixture/自测调用 |
| `presentation/sidebar/sidebarPanelQuality.ts` | 无生产入口；仅被 test-reachable 的 `sidebarLivePanelQuality.ts` value-import | `sidebarPanelLayout.test.ts`、`sidebarLivePanelQuality.ts`（后者再由 `sidebarLivePanelRuntime.test.ts` 引用） | `SidebarPanelQualityStatus` 被同一 test-reachable 文件 type-import | 质量函数不参与 `/sidebar` 生产命令 |
| `presentation/sidebar/sidebarLivePanelQuality.ts` | 无 | `sidebarLivePanelRuntime.test.ts` | `SidebarLivePanelFrame` | live runtime 本身不 import quality |
| `presentation/sidebar/sidebarStateQuality.ts` | 无 | `sidebarStateQuality.test.ts` | `SidebarStateSnapshot` | 质量函数只自测 |

生产 `/sidebar` 的实际 lane 是 `sidebarCommandRuntime.ts` → `projectSidebarState`/`renderSidebarStateSurface`，panel/watch lane 是 `buildSidebarPanel`/`createSidebarLivePanelRuntime` → renderer；事件生产使用 `sidebarCommandEventAdapter.ts` + `sidebarEventSink.ts` + `sidebarLiveEventStore.ts`。我没有找到生产文件 import `sidebarEventBridge.ts` 或三个 quality module 的 value edge。

**T10 dilemma 的解决：**

- `sidebarEventBridge.test.ts` 的 3 个测试测试的就是 `bridgeSidebarEvents`：覆盖多类输入、redaction、deterministic order/budget；它们不是 live sidebar 行为测试，建议与模块一起删除。
- `sidebarStateQuality.test.ts` 的 3 个测试测试的就是 `checkSidebarStateQuality`（pass/warn/fail + leak detection），并把 EventBridge 当 fixture；建议整文件与质量模块一起删除。
- `sidebarPanelLayout.test.ts` 的 4 个测试主体是 `buildSidebarPanel` + `renderSidebarPanel`：sections、compact budget、redaction/output；quality 调用只是附带断言。保留该测试，去掉 `checkSidebarPanelQuality` import/调用和对应质量断言。
- `sidebarLivePanelRuntime.test.ts` 的 4 个测试主体是 `createSidebarLivePanelRuntime` + `renderSidebarLivePanelFrame` + event store + watch runner；质量调用只是附带断言。保留 live frame、metadata、budget、redaction 断言，去掉 `checkSidebarLivePanelQuality` import/调用和质量专属断言。
- `sidebarStateSurface.test.ts` 的 1 个测试测试 `projectSidebarState` + `renderSidebarStateSurface` 的生产可见输出；EventBridge 只是生成一条测试 event。保留该测试，把 fixture 改成直接 `createSidebarEvent`，不要删除 live surface 测试。

因此，T10 不是“删掉被测试覆盖的生产能力”：候选质量模块及 generic EventBridge 本身没有 production consumer；依赖它们的两个测试文件在测试死模块自身，另外三个测试在测试 live 行为时只把它们当辅助。删除/窄改不会移除 `projectSidebarState`、panel/layout/renderer、live event store/sink 的职责。

**六项删除前检查：**

| 检查 | T10 结果 |
|---|---|
| 1. 功能读审 | 已读四个实现。它们都是纯 projection/check/bridge；不执行 provider、model、persistence。候选代码只消费输入并生成 snapshot/report/events。 |
| 2. 等价实现核验 | 已找到 live 等价职责：事件由 `sidebarCommandEventAdapter`/`sidebarEventSink`/`sidebarLiveEventStore` 承担，状态/面板/实时帧由 `sidebarStateProjection`/`sidebarPanelLayout`/`sidebarLivePanelRuntime`/renderer 承担。质量报告本身没有生产等价需求，因为没有生产消费者。 |
| 3. 消费者存活检查 | 生产 value consumer = 0；仅测试引用命中上表。 |
| 4. 动态入口检查 | 下面命令对四个候选文件均无输出（0 命中）：`git grep -nE 'path\\.join\|pathToFileURL\|spawn(Sync)?\\(\|execFile(Sync)?\\(\|process\\.argv\|^#!\|(^\|[^A-Za-z])main\\(' -- <四文件>`。 |
| 5. 公共面检查 | `git grep -nE 'sidebar(EventBridge\|PanelQuality\|LivePanelQuality\|StateQuality)' -- scripts packages/ts-shell/src/index.ts` 无输出；不在 package public surface。 |
| 6. `scripts/` 引用检查 | 同上命令的 `scripts/` 范围无输出；无字符串路径脚本引用。 |

**T10 建议：删除。**

建议 diff 明确触及：

- 删除 `packages/ts-shell/src/presentation/sidebar/sidebarEventBridge.ts`。
- 删除 `packages/ts-shell/src/presentation/sidebar/sidebarPanelQuality.ts`。
- 删除 `packages/ts-shell/src/presentation/sidebar/sidebarLivePanelQuality.ts`。
- 删除 `packages/ts-shell/src/presentation/sidebar/sidebarStateQuality.ts`。
- 删除 `sidebarEventBridge.test.ts` 与 `sidebarStateQuality.test.ts`。
- 修改 `sidebarStateSurface.test.ts`：用 `createSidebarEvent` 直接提供事件 fixture。
- 修改 `sidebarPanelLayout.test.ts`：移除 quality helper import/call/assertion，保留 layout/renderer assertions。
- 修改 `sidebarLivePanelRuntime.test.ts`：移除 live quality helper import/call/assertion，保留 runtime/renderer/store/redaction assertions。

风险是未来有人把这些 test-only modules 接回 production；当前 source graph 与六项检查均未证明存在该 lane。若未来需要质量门，应在测试工具区重建/迁入，而不是保留当前披着 production path 的平行实现。

### T11：`shellActionRuntime.ts` 三 export + `cliDisplayProjection.ts`

**importer 分类与活轨覆盖：**

| 子目标 | production value importer | test-only importer | type-only | 授权结论 |
|---|---|---|---|---|
| `runSessionsShellAction` | 无；`registry.ts` 的 import 列表不含它 | 无直接测试 | 无 | 可删；`list-sessions` 产出职责由 live `runResumeCommand` 覆盖 |
| `runAgentModeShellAction` | 无 | 无直接测试 | 无 | 可删；agent-mode 切换由 `interactiveMode.ts:cycleAgentMode` + `keymap.ts` 的 Shift+Tab 覆盖 |
| `runViewShellAction` | 无 | 无直接测试 | 无 | **保留**；当前没有生产 `/view` command producer 被证明接管，view mode 本身仍被 session/approval/render lane 消费 |
| `formatAgentMode*` 两个函数 | 仅 stale `interactiveCommandRouter.ts` 分支调用 | `cliCoreSplit.test.ts` 直接断言 | 无 | 与 agent-mode stale branch 一起删 |
| `formatViewMode*` 两个函数 | stale `interactiveCommandRouter.ts` 分支调用 | `cliCoreSplit.test.ts` 直接断言 | 无 | 暂留，因 view lane 未获授权删除 |
| `formatWorkspaceInfoLines` | `interactiveCommandRouter.ts` 仅 import、不调用 | `cliCoreSplit.test.ts` 直接断言 | 无 | 可删；workspace display 已由 live `cliWorkspaceModule`/`cliWorkspaceSurface` 承担 |
| `projectPermissionListDisplay` | `cliPermissionModule.ts` value-import + 调用 | `cliCoreSplit.test.ts` | 无 | 必须保留；因此不能删整个 `cliDisplayProjection.ts` |

实测 live replacement：`runResumeCommand` 明确返回 `list-sessions`；`interactiveMode.ts` 的 `cycleAgentMode()` 直接调用 `sessionRuntime.setAgentMode`，`keymap.ts` 的 `shift+tab` 调用 `actions.cycleAgentMode()`；`interactiveCommandRouter.test.ts` 明确断言 `/mode plan` 是 retired/unknown，agent-mode 不是 slash route。相反，`sessionRuntime.getViewMode/setViewMode`、`sessionEventSurface`、`cliApprovalEscalationBridge` 仍是 live view-mode consumer，但没有发现对应的 `/view` registry entry 或新的 command producer。

**六项删除前检查：**

| 检查 | T11 结果 |
|---|---|
| 1. 功能读审 | 已读 `shellActionRuntime.ts`、`cliDisplayProjection.ts`、router、types、registry。`shellActionRuntime.ts` 同时包含 7 个 live exports 与 3 个未注册 dead exports；`cliDisplayProjection.ts` 只有 `projectPermissionListDisplay` 确认 live。不能整文件删。 |
| 2. 等价实现核验 | sessions = `runResumeCommand`；agent-mode = Shift+Tab live lane；workspace display = `cliWorkspaceModule`/`cliWorkspaceSurface`。view-mode 没有被证明的 live command equivalent，因此保留。 |
| 3. 消费者存活检查 | stale action 的 router consumers 仍在，但没有 live producer；`list-sessions` 的 live producer 是 `runResumeCommand`。`projectPermissionListDisplay` 有 live consumer，必须保留。 |
| 4. 动态入口检查 | 对 `shellActionRuntime.ts` 与 `cliDisplayProjection.ts` 执行 `git grep -nE 'path\\.join\|pathToFileURL\|spawn(Sync)?\\(\|execFile(Sync)?\\(\|process\\.argv\|^#!\|(^\|[^A-Za-z])main\\(' -- <两文件>`，无输出。 |
| 5. 公共面检查 | `git grep -nE 'shellActionRuntime\|cliDisplayProjection\|show-view\|set-view\|show-agent-mode\|set-agent-mode\|formatViewMode\|formatAgentMode' -- scripts packages/ts-shell/src/index.ts` 无输出；非 `index.ts` public surface。 |
| 6. `scripts/` 引用检查 | 同上命令的 `scripts/` 范围无输出；无字符串路径脚本引用。 |

**T11 建议：partial。**

建议 diff 触及：

- 修改 `packages/ts-shell/src/core/commands/shellActionRuntime.ts`：删除 `runSessionsShellAction` 与 `runAgentModeShellAction`；保留 `runViewShellAction` 与所有 live shell actions。
- 修改 `packages/ts-shell/src/entrypoints/cliDisplayProjection.ts`：删除 `formatWorkspaceInfoLines`、`formatAgentModeStatusLines`、`formatAgentModeUpdatedLines`；保留两个 view formatter 与 `projectPermissionListDisplay`。
- 修改 `packages/ts-shell/src/cli/interactive/interactiveCommandRouter.ts`：删除 agent-mode 分支与死 import；保留 view 分支；删除未使用的 `formatWorkspaceInfoLines` import。
- 修改 `packages/ts-shell/src/core/commands/types.ts`：删除 `set-agent-mode`/`show-agent-mode` union members 与 shell-action result 的 `agentMode?` 字段；保留 view fields/actions。
- 修改 `packages/ts-shell/src/entrypoints/cliCoreSplit.test.ts`：移除已删 agent/workspace formatter 的直接断言，保留 view 与 permission projection 测试。
- 不删除 `list-sessions` union/action，因为 `runResumeCommand` 生产路径仍使用它。

风险：保留的 view 子链仍是未接线的 dormant implementation，且 `USAGE_MANUAL.md` 仍把 `/view` 写成可用命令；若维护者要把 `/view` 恢复为产品命令，应先建立生产 registry/producer，再决定是否保留当前 parser/formatter。现在直接删除会违反 §2.1 的“没有证明活轨接管就不能删”。

### T12：`browser/toolPolicy.ts` + `agent.ts` + `plan.ts`

**importer 分类：**

| 候选 | production value importer | test-only importer | type-only | 实测结论 |
|---|---|---|---|---|
| `browser/toolPolicy.ts` | 无 | 无 | `browser/agent.ts` import `BrowserToolName`，但该 importer 本身无 live value consumer | 全文件 value 面死 |
| `browser/agent.ts` | 无 | 无 | `planning/task/workflowTaskPlanner.ts` 仅 import `BrowserAgentPlan`；`browserPlan?` 无赋值点 | 只剩无效 type edge |
| `browser/plan.ts` | 无 | 无 | `browser/agent.ts` 内部 type/value import；外部无消费者 | 随 agent 一起死 |

功能读审显示它们是旧的 prompt → browser agent/transaction plan 路线：`detectBrowserAgentPlan` 依赖 `planBrowserTransaction` 与 `BrowserToolName`，但没有生产调用者。当前 live browser lane 是显式 `/browser`：`core/commands/browserCommandRuntime.ts` → `browser/commandRunner.ts` → `actionContract`/`actionReadiness`/`dryRunPlan`/`actionLoopPolicy`/`executionPolicy`/runtime adapters；相邻 focused browser tests 对这条 live lane 通过。

**六项删除前检查：**

| 检查 | T12 结果 |
|---|---|
| 1. 功能读审 | 已读三文件。它们构造 prompt-driven browser plan/action，但没有写入当前 `BrowserCommandContract` 或 execution request，也没有 provider/model/process side effect。 |
| 2. 等价实现核验 | 已找到活轨：显式 `/browser` contract/runner、`BrowserDryRunPlan`、`BrowserActionLoopPolicy`、`BrowserExecutionPolicy` 与 runtime/external adapters，覆盖当前 browser preview/execute/replay/repair 责任；旧 agent route 不再是现行入口。 |
| 3. 消费者存活检查 | value consumer = 0；唯一外部边是 `workflowTaskPlanner.ts` 对 `BrowserAgentPlan` 的 type-only 字段，且无 `browserPlan:` 赋值点。删除时一并移除该 type edge。 |
| 4. 动态入口检查 | 对三文件执行 `git grep -nE 'path\\.join\|pathToFileURL\|spawn(Sync)?\\(\|execFile(Sync)?\\(\|process\\.argv\|^#!\|(^\|[^A-Za-z])main\\(' -- <三文件>`，无输出。 |
| 5. 公共面检查 | `git grep -nE 'toolPolicy\\.js\|browser/agent\\.js\|browser/plan\\.js\|browser/toolPolicy\\.js\|browser/agent\\.ts\|browser/plan\\.ts\|browser/toolPolicy\\.ts' -- scripts packages/ts-shell/src/index.ts` 无输出；三文件不在 `index.ts` public surface。 |
| 6. `scripts/` 引用检查 | 同上命令的 `scripts/` 范围无输出；无脚本字符串路径入口。 |

**T12 建议：删除。**

建议 diff 触及：

- 删除 `packages/ts-shell/src/browser/toolPolicy.ts`。
- 删除 `packages/ts-shell/src/browser/agent.ts`。
- 删除 `packages/ts-shell/src/browser/plan.ts`。
- 修改 `packages/ts-shell/src/planning/task/workflowTaskPlanner.ts`，移除 `BrowserAgentPlan` type-only import 与 `browserPlan?: BrowserAgentPlan` 字段。
- 当前扫描未发现这些文件的直接测试文件，因此不需要删除专属测试；保留并继续运行显式 `/browser` live lane tests。

风险：若未来要恢复 prompt-driven autonomous browser planning，这三文件包含一套独立 planner/action vocabulary；但当前活轨是显式 `/browser` contract + guarded execution，旧链没有生产调用者，也不在 public/scripts surface。恢复应作为新 lane 明确接线，而不是以“未接线但保留”方式占用现行 runtime。

## 与既有记录的差异

- **T10 行数差异：** 既有记录写“约 440 行”；本轮 `wc -l` 得到 244 + 97 + 99 + 110 = 550 行。差异来源是三个 Quality 文件实测合计 306 行，而记录用“约 200”概算。处置判断不变，但删除成本应按 550 行计算。
- **T10 importer 结论细化：** 既有记录把 `sidebarLivePanelQuality.ts` 描述为测试引用；本轮读到它确实 value-imports `sidebarPanelQuality.ts`，但它自己只被 `sidebarLivePanelRuntime.test.ts` import，因此整条链仍是 test-reachable、无生产入口。不能把“非 `.test.ts` 文件”误判为 production lane。
- **T11 记录的“删 `cliDisplayProjection.ts`”过宽：** 本轮确认 `projectPermissionListDisplay` 仍由 `cliPermissionModule.ts` 生产调用，故只能删死 formatter，不能删文件。另发现 `formatWorkspaceInfoLines` 只有未使用 import、无调用，属于记录中四个 formatter 之外的额外死 export。
- **T11 agent-mode 反证得到加强：** `interactiveMode.ts` 的 `cycleAgentMode` 与 `keymap.ts` 的 Shift+Tab 是可读的 live replacement；`interactiveCommandRouter.test.ts` 还把 `/mode` 明确标为 retired/unknown。该部分满足 §2.1 的活轨覆盖。
- **T11 view-mode 保留是有意保守：** view mode 仍被 `sessionRuntime`、`sessionEventSurface`、approval display 使用，但本轮没有发现 `/view` registry/producer。既有记录把所有 view stale chain 一并归为可删，本报告按 §2.1 不把“无 producer”自动等同“可删”。
- **T12 行数一致：** 本轮 `wc -l` 仍为 188 + 183 + 218 = 589 行；但“全仓零引用”必须改写为“无 value consumer，存在 `workflowTaskPlanner.ts` 的 type-only importer”。

## 风险与反证

- **T10 反证：** 若未来 production `/sidebar` 开始直接调用 generic `bridgeSidebarEvents` 或 quality report，T10 删除会移除真实 owner；本轮 source graph、public/scripts checks 与 live command runtime 均未显示该情况。删除前应保留 live renderer/store/sink tests，防止把 live 行为误删。
- **T11 反证：** `USAGE_MANUAL.md` 仍宣称 `/view` 可用；若存在仓库外调用者或尚未接线的正式兼容承诺，删除 view 子链会破坏该承诺。因为当前 `/view` 不在 registry、`index.ts`/scripts 无 public edge，本报告选择保留而不是猜测。
- **T11 反证：** `ShellActionResult` 可能被外部 package 直接构造；`packages/ts-shell/src/index.ts` 未导出该类型，且本轮 public check 无命中，但 package 内部以外的消费者不能由仓库内 grep 证明。
- **T12 反证：** `WorkflowTaskPlan.browserPlan` 可能是未入仓的插件契约；仓库内只有 type-only import 且无赋值点，`index.ts`/scripts 无 public edge。若要保留外部插件契约，应先将其显式登记为 public surface，再否决删除。
- **共同反证：** 动态入口扫描采用明确模式，不能证明任意运行时字符串拼接都不存在；本轮六项检查已经覆盖规定的 `path.join`、`pathToFileURL`、spawn/execFile、`process.argv`、shebang、`main()` 与 scripts/index surface，但没有运行外部消费者。

## 未验证事项

- 未运行全量 vitest（按任务约束禁止）；本报告只运行了 T10 的 5 个文件/15 tests、T11 的 4 个文件/42 tests、T12 相邻 browser 的 3 个文件/33 tests。
- 未运行 `npm run build`（按任务约束禁止），也未对建议 diff 实际施工；以上是删除前 disposition，不是已应用变更。
- 未验证仓库外 package consumer、未入仓 plugin、或未来通过动态 `import()` 读取这些相对路径的外部脚本；仓库内 `index.ts` 与 `scripts/` 检查均无命中。
- T11 的 `/view` 文档/用户承诺是否必须维持，需维护者另行裁决；本报告因没有 live producer 而保留该子链。
