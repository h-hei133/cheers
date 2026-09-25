# 不可达代码簇处置建议（T9.5 item 1）

## 结论
- **主口径：value-only、全部非测试 TS**。`python3 /tmp/closure.py` 实测 `production=939 reachable=676 unreachable=263 lines=57977`。这与 T7 的 270 / 59,121 是同一口径；当前少 7 个文件、1,144 行，恰好对应本轮已删除的 7 个原不可达文件。
- **簇口径：同一 value-only 图**。`118` 个弱连通分量；最大 C1 为 **60 文件 / 14,852 行**；共有 **93 个单例分量**。因此多数文件可以在单例层面判断，但 C1/C2 等多文件簇必须整簇审查，不能摘单文件。
- **替代口径：type-inclusive 图**。`python3 /tmp/verify_clusters.py`（`m.load_graph(prod)`，保留 `import type` 边）实测 `168 文件 / 40,097 行`、`45` 个分量、最大 `98 文件 / 30,115 行`。这是导入周期门禁所用图，不是本报告的主删除候选集合。
- **推荐：top-3 域全部保留，暂不授权删除任何多文件簇。** 唯一可进入未来删除候选的是单例 `C35 core/commands/authCommandRuntime.ts`，因为 `/auth` 已被 `/connect` lane 明确替代；但这不是本轮删除授权，仍需按六项检查和测试处置完成正式裁决。

## 实测证据
### 1. 边界摘要
命令：
```bash
python3 scripts/analyze-boundaries.py
```
输出：`production=939, cliReachable=770, cliOpaque=169, scriptOnly=0, publicApiOnly=1, testOnly=132, noReference=36`。

### 2. 三个明确 scope
主口径命令：
```bash
python3 /tmp/closure.py
```
输出：
```text
[all_non_test_ts] production=939 reachable=676 unreachable=263 lines=57977
  core: 62 files / 7660 lines
  context: 36 files / 9559 lines
  edit: 27 files / 6319 lines
  planning: 27 files / 6143 lines
  provider: 19 files / 5818 lines
  tools: 14 files / 3046 lines
  browser: 11 files / 1399 lines
  session: 10 files / 2142 lines
  evidence: 8 files / 1914 lines
  result: 8 files / 1756 lines
  runtime: 7 files / 4582 lines
  test-utils: 7 files / 2248 lines
  turn: 7 files / 1266 lines
  sandbox: 5 files / 829 lines
  eval: 3 files / 111 lines
  model-adapters: 3 files / 285 lines
  repair: 3 files / 1266 lines
  verification: 3 files / 1357 lines
  cli: 1 files / 64 lines
  policy: 1 files / 163 lines
  workflow: 1 files / 50 lines
```
同一命令的第二行输出为 `exclude_test_utils_and___tests__: production=932 reachable=676 unreachable=256 lines=55729`；该较窄 scope 仅作对照，不用于本报告主簇统计。

type-inclusive 对照命令：
```bash
python3 /tmp/verify_clusters.py
```
输出：`unreachable: 168 files, 40097 lines; weak components: 45; largest: 98 files, 30115 lines`。

### 3. value-only 簇普查
命令：
```bash
python3 /tmp/value_clusters_correct.py
```
输出：`reachable 676 unreachable 263 lines 57977; components 118`，并给出：

| 簇 | 文件 | 行数 | 域组成 |
|---|---:|---:|---|
| C1 | 60 | 14,852 | context 25; planning 25; evidence 4; result 3; edit 2; verification 1 |
| C2 | 24 | 7,714 | context 6; edit 6; turn 4; evidence 2; result 2; core 1; repair 1; tools 1; verification 1 |
| C3 | 10 | 2,239 | tools 10 |
| C4 | 9 | 1,199 | edit 9 |
| C5 | 8 | 1,395 | core 8 |
| C6 | 8 | 2,935 | provider 8 |
| C7 | 6 | 1,163 | core 5; context 1 |
| C8 | 5 | 492 | core 4; browser 1 |
| C9 | 5 | 829 | sandbox 5 |
| C10 | 4 | 863 | edit 2; provider 2 |
| C11 | 3 | 796 | runtime 3 |

Component-size histogram from the same command: `60:1 24:1 10:1 9:1 8:2 6:1 5:2 4:1 3:1 2:14 1:93`; the 93 singleton count is measured, not inferred.

## 逐项分析
### 1. Top-3 classification rule
The row-level classification is anchored to the **whole value-only component**: `unique-capability` means a singleton component with no unreachable neighbors and no demonstrated live equivalent; `internal-only` means the file travels inside a multi-file unreachable component and is not independently deletable; `superseded` is reserved for a file whose responsibility is covered by a named live lane.

### 2. `core` — 62 files / 7,660 lines
Measured by `python3 /tmp/closure.py`. Classification counts by whole component: **34 unique-capability**, **27 internal-only**, **1 superseded**.

| Classification | Files / components | Evidence and nearest live neighbor |
|---|---|---|
| superseded | `core/commands/authCommandRuntime.ts` — singleton C35, 275 lines | `authCommandRuntime.ts:21` exports `runAuthCommand`; the live command registry has `core/commands/registry.ts:10` import `runConnectCommand`, `:125` name `connect`, `:135` dispatch. `connectCommandRuntime.ts:70` is the live owner and `:199-224` implements `/connect set` as the compatibility migration from `/auth set`; `slashRouter.test.ts:1008-1015` asserts `/auth` is unknown. This is a real replacement for the legacy route, not merely a nearby name. |
| internal-only | 27 files across C2, C5, C7, C8, C13, C16-C19 | Examples: `core/security/redaction.ts:42` is imported by 13 other unreachable files (measured by `python3 /tmp/classify_top3.py`); `core/query/runtime/facts.ts:21` feeds `core/query/runtime/policy.ts:37` inside C19; `core/messaging/sessionSocketClient.ts:8` is imported by `core/tools/messagingTools.ts`. These are load-bearing inside unreachable clusters and must travel with their component. |
| unique-capability | 34 singleton files, including `core/query/runtime/actionAuthority.ts:16`, `core/query/runtime/events.ts:14`, `core/security/projectTrust.ts:23`, `core/shell/platform/processTree.ts:99`, and `core/workflow/teamStore.ts:44` | Each is a singleton in the value-only unreachable graph (`C34-C68` except C35). No live production consumer was found by the measured owner/reference scans. Nearest live neighbors are not equivalent: `turn/projection.ts:28` maps agent lifecycle to `QueryEvent`, while `core/query/runtime/events.ts:14` declares the old query-runtime event contract; `core/shell/sessionEventSurface.ts:73` renders live query events, but does not implement the old query-runtime policy/proof contract. |

### 3. `context` — 36 files / 9,559 lines
Measured by `python3 /tmp/closure.py`. Classification counts: **2 unique-capability**, **34 internal-only**, **0 superseded**.

| Classification | Files / components | Evidence and nearest live neighbor |
|---|---|---|
| internal-only | C1 (25 context files), C2 (6), C7 (1), C15 (2) | C1 is the 60-file context/planning/result cluster. `context/acquisition/engine.ts:94` runs the context engine and `:306` calls `buildContextWorkingMemory`; `context/acquisition/graph.ts:47` owns the graph/planning bundle. These files are connected to their code-graph, discovery, planning, result, and verification companions, so no single-file deletion is valid. C2 similarly contains `readDeliveryProjection.ts:28`, its read-window helpers, `rebuildInput.ts`, and the shared redaction consumer. |
| unique-capability | `context/compact/governance/contextAnalysis.ts:26` and `context/sessionContextRebuildProjection.ts:52` — singleton C32/C33 | `contextAnalysis.ts:26` owns token-category health auditing; no live owner with that contract was found. `sessionContextRebuildProjection.ts:52` owns a metadata-only rebuild projection; the live neighbor `session/sessionTreeProjection.ts:139` owns the underlying session-tree projection, not the rebuild contract. Therefore neither is superseded by the named neighbor. |

Representative non-equivalence checks: `context/acquisition/engine.ts:94` is an unreachable context acquisition runtime, while `turn/session.ts:80` is the live turn loop; the latter does not implement repository discovery, graph scoring, staged reads, or context-memory reuse. `context/readDeliveryProjection.ts:28` builds grounded read delivery and re-anchoring; `turn/step.ts:97` performs one model step, not read delivery. `context/acquisition/summary.ts:87` summarizes planning/context handoff but is tied to C15 and is not a live command owner.

### 4. `edit` — 27 files / 6,319 lines
Measured by `python3 /tmp/closure.py`. Classification counts: **5 unique-capability**, **22 internal-only**, **0 superseded**.

| Classification | Files / components | Evidence and nearest live neighbor |
|---|---|---|
| internal-only | C1 (2 files), C2 (6), C4 (9), C10 (2), C20 (2), C21 (1) | C1 contains `edit/proposal/editProposalReview.ts:42` and `generatedEditProposal.ts:63`, joined to planning handoff. C2 contains `edit/multifile/model.ts:118` and its observation/settlement/type/sanitize/recovery companions. C4 is the 9-file journal/recovery cluster. C10 links `edit/patch/apply/conflict.ts:36` to `edit/patch/plan/hunkSet.ts:45`; C20 links `edit/patch/status/mixedOperation.ts:47` to `edit/authority/writePolicy.ts:10`. These are load-bearing within their clusters. |
| unique-capability | `edit/patch/plan/types.ts:8`, `edit/patch/types.ts:1`, `edit/proposal/editRepairProposal.ts:82`, `edit/proposal/fencedEditPlanner.ts:67`, `edit/recovery/recoverySurfaceProjection.ts:30` | All are singleton components. The live execution service uses a different authority/recovery surface: `runtime/execution/service.ts:4-6` imports `edit/authority/workspace.ts`, `edit/recovery/editSnapshot.ts`, and `edit/recovery/recoveryAuthorityStore.ts`. That does not implement the exact fenced-edit planner, proposal normalization, patch contract types, or recovery-surface projection in these singleton files. |

`edit/multifile/model.ts:118` is intentionally not labeled superseded merely because tests call it: the 8-test file `edit/multifile/model.test.ts` exercises a complete controlled multi-target mutation lane, but no CLI-value consumer was found. It is therefore internal-only within C2 plus an independently tested capability, not evidence of live replacement.

### 4.1 全量逐文件分类表
以下表格覆盖 top-3 域的全部不可达文件；分类以 value-only 图的整簇为单位，anchor 给出该文件的最近导出声明或文件首行。`internal-only` 文件不能脱离其 component 单独删除。

<!-- TOP3_EXHAUSTIVE_TABLES_START -->
### core 全量逐文件分类（value-only / all non-test TS）
| 分类 | 簇 | 文件（均含 anchor） |
|---|---:|---|
| superseded | C35 (1 files) | `core/commands/authCommandRuntime.ts:21` |
| unique-capability | C34 (1 files) | `core/agent/events.ts:3` |
| unique-capability | C36 (1 files) | `core/commands/types.ts:26` |
| unique-capability | C37 (1 files) | `core/context/model/contextLayerModel.ts:1` |
| unique-capability | C38 (1 files) | `core/harness/agentScenarioReport.ts:3` |
| unique-capability | C39 (1 files) | `core/harness/browserCacheMultiprocessReport.ts:3` |
| unique-capability | C40 (1 files) | `core/harness/browserCliScenarioFixtures.ts:13` |
| unique-capability | C41 (1 files) | `core/harness/browserExternalNetworkHandoffScenarioFixtures.ts:11` |
| unique-capability | C42 (1 files) | `core/harness/browserPlaywrightAdapterSpikeFixtures.ts:17` |
| unique-capability | C43 (1 files) | `core/harness/browserPublicReadOnlyWebScenarioFixtures.ts:16` |
| unique-capability | C44 (1 files) | `core/harness/browserRuntimeAdapterFixtures.ts:8` |
| unique-capability | C45 (1 files) | `core/harness/browserSelfHealingApplyCliScenarioFixtures.ts:19` |
| unique-capability | C46 (1 files) | `core/hooks/types.ts:5` |
| unique-capability | C47 (1 files) | `core/mcp/types.ts:1` |
| unique-capability | C48 (1 files) | `core/memory/types.ts:6` |
| unique-capability | C49 (1 files) | `core/messaging/sessionSocketHost.ts:12` |
| unique-capability | C50 (1 files) | `core/messaging/types.ts:1` |
| unique-capability | C51 (1 files) | `core/query/runtime/actionAuthority.ts:10` |
| unique-capability | C52 (1 files) | `core/query/runtime/batch.ts:8` |
| unique-capability | C53 (1 files) | `core/query/runtime/decision.ts:5` |
| unique-capability | C54 (1 files) | `core/query/runtime/events.ts:14` |
| unique-capability | C55 (1 files) | `core/query/runtime/proof.ts:19` |
| unique-capability | C56 (1 files) | `core/research/types.ts:6` |
| unique-capability | C57 (1 files) | `core/security/projectTrust.ts:5` |
| unique-capability | C58 (1 files) | `core/shell/approval/types.ts:1` |
| unique-capability | C59 (1 files) | `core/shell/platform/processTree.ts:98` |
| unique-capability | C60 (1 files) | `core/shell/platform/types.ts:7` |
| unique-capability | C61 (1 files) | `core/subagents/types.ts:1` |
| unique-capability | C62 (1 files) | `core/workflow/adversarialRefuter.ts:1` |
| unique-capability | C63 (1 files) | `core/workflow/builderValidator.ts:1` |
| unique-capability | C64 (1 files) | `core/workflow/cacheStaggering.ts:1` |
| unique-capability | C65 (1 files) | `core/workflow/contextInjector.ts:4` |
| unique-capability | C66 (1 files) | `core/workflow/pipelineExecutor.ts:3` |
| unique-capability | C67 (1 files) | `core/workflow/teamStore.ts:5` |
| unique-capability | C68 (1 files) | `core/workflow/types.ts:6` |
| internal-only | C2 (24 files) | `core/security/redaction.ts:42` |
| internal-only | C5 (8 files) | `core/harness/agentCliProcess.ts:39`; `core/harness/agentCliScenarioAssertions.ts:11`; `core/harness/agentCliScenarioModel.ts:1`; `core/harness/agentCliScenarioRunner.ts:23`; `core/harness/browserCacheMultiprocessFixtures.ts:21`; `core/harness/browserCacheMultiprocessRunner.ts:21`; `core/harness/browserCacheMultiprocessScenarioModel.ts:4`; `core/harness/browserExecutionReceiptAssertions.ts:7` |
| internal-only | C7 (6 files) | `core/harness/agentScenarioAssertions.ts:9`; `core/harness/agentScenarioFixtures.ts:23`; `core/harness/agentScenarioModel.ts:4`; `core/harness/agentScenarioRunner.ts:28`; `core/harness/agentScenarioSafety.ts:6` |
| internal-only | C8 (5 files) | `core/harness/browserExternalRunnerScenarioFixtures.ts:13`; `core/harness/browserPersistentReplayScenarioFixtures.ts:15`; `core/harness/browserReplayScenarioFixtures.ts:12`; `core/harness/browserSkillExecutionScenarioFixtures.ts:15` |
| internal-only | C13 (2 files) | `core/harness/browserRuntimeCapabilityScenarioFixtures.ts:14` |
| internal-only | C16 (2 files) | `core/harness/agentCliScenarioReport.ts:4`; `core/harness/browserSelfHealingApplyCliReport.ts:3` |
| internal-only | C17 (2 files) | `core/harness/browserControlledNetworkScenarioFixtures.ts:15`; `core/harness/browserControlledNetworkServer.ts:3` |
| internal-only | C18 (2 files) | `core/messaging/sessionSocketClient.ts:8`; `core/tools/messagingTools.ts:10` |
| internal-only | C19 (2 files) | `core/query/runtime/facts.ts:21`; `core/query/runtime/policy.ts:37` |

### context 全量逐文件分类（value-only / all non-test TS）
| 分类 | 簇 | 文件（均含 anchor） |
|---|---:|---|
| unique-capability | C32 (1 files) | `context/compact/governance/contextAnalysis.ts:3` |
| unique-capability | C33 (1 files) | `context/sessionContextRebuildProjection.ts:4` |
| internal-only | C1 (60 files) | `context/acquisition/code/facts.ts:7`; `context/acquisition/code/impact.ts:6`; `context/acquisition/code/query.ts:6`; `context/acquisition/code/result.ts:4`; `context/acquisition/code/staleness.ts:6`; `context/acquisition/code/trace.ts:7`; `context/acquisition/engine.ts:22`; `context/acquisition/graph.ts:47`; `context/discovery/ranker.ts:24`; `context/discovery/scan.ts:28`; `context/discovery/scanner.ts:22`; `context/discovery/scorer.ts:12`; `context/discovery/types.ts:1`; `context/graph/contextBudget.ts:6`; `context/graph/contextDiscovery.ts:13`; `context/graph/contextGraph.ts:3`; `context/graph/contextGraphBudget.ts:7`; `context/graph/contextGraphDiscovery.ts:36`; `context/graph/contextGraphReadiness.ts:5`; `context/graph/contextGraphResult.ts:5`; `context/graph/contextGraphScore.ts:3`; `context/graph/contextPacket.ts:12`; `context/graph/contextPacketResult.ts:8`; `context/graph/contextPlan.ts:3`; `context/memory/model.ts:8` |
| internal-only | C2 (24 files) | `context/readDeliveryProjection.ts:28`; `context/readWindow/cue.ts:1`; `context/readWindow/fingerprint.ts:3`; `context/readWindowContinuation.ts:17`; `context/rebuildInput.ts:9`; `context/repoExplainStage.ts:1` |
| internal-only | C7 (6 files) | `context/startup/startupWarmContextHealth.ts:13` |
| internal-only | C15 (2 files) | `context/acquisition/projection.ts:3`; `context/acquisition/summary.ts:8` |

### edit 全量逐文件分类（value-only / all non-test TS）
| 分类 | 簇 | 文件（均含 anchor） |
|---|---:|---|
| unique-capability | C69 (1 files) | `edit/patch/plan/types.ts:8` |
| unique-capability | C70 (1 files) | `edit/patch/types.ts:1` |
| unique-capability | C71 (1 files) | `edit/proposal/editRepairProposal.ts:7` |
| unique-capability | C72 (1 files) | `edit/proposal/fencedEditPlanner.ts:1` |
| unique-capability | C73 (1 files) | `edit/recovery/recoverySurfaceProjection.ts:6` |
| internal-only | C1 (60 files) | `edit/proposal/editProposalReview.ts:5`; `edit/proposal/generatedEditProposal.ts:4` |
| internal-only | C2 (24 files) | `edit/multifile/model.ts:84`; `edit/multifile/observation.ts:34`; `edit/multifile/settlement.ts:32`; `edit/multifile/types.ts:19`; `edit/recovery/model.ts:45`; `edit/sanitize.ts:33` |
| internal-only | C4 (9 files) | `edit/result/journal/authority/durable.ts:3`; `edit/result/journal/authority/original.ts:6`; `edit/result/journal/failure/state.ts:6`; `edit/result/journal/metadata/boundary.ts:1`; `edit/result/journal/model.ts:3`; `edit/result/journal/projection/failure.ts:13`; `edit/result/journal/recovery/plan.ts:28`; `edit/result/journal/recovery/readiness.ts:11`; `edit/result/perFilePatchResultProjection.ts:14` |
| internal-only | C10 (4 files) | `edit/patch/apply/conflict.ts:5`; `edit/patch/plan/hunkSet.ts:4` |
| internal-only | C20 (2 files) | `edit/authority/writePolicy.ts:1`; `edit/patch/status/mixedOperation.ts:7` |
| internal-only | C21 (2 files) | `edit/proposal/editRepairContext.ts:9` |

<!-- TOP3_EXHAUSTIVE_TABLES_END -->

### 5. Test cost and superseded candidate
Only the singleton auth candidate is classified superseded; no multi-file superseded cluster exists, so §2.2 six-check cost is limited to C35 plus its test.

| §2.2 check | Result for C35 |
|---|---|
| 1. 功能读审 | `authCommandRuntime.ts:21-275` is the legacy `/auth` command implementation; `connectCommandRuntime.ts:70-224` is the current connection lane and explicitly documents `/connect set` as migrated compatibility. |
| 2. 等价实现核验 | Pass for the route responsibility: `/connect status\|login\|use\|logout` is registered at `registry.ts:125-135`; `/connect set` covers legacy set semantics at `connectCommandRuntime.ts:199-224`. This does not claim byte-for-byte equivalence for every legacy message. |
| 3. 消费者存活检查 | Production value consumers: 0. The only direct importer is `core/commands/authCommandRuntime.test.ts:6`; no live registry entry imports it. The live consumer is `registry.ts:135` dispatching `runConnectCommand`. |
| 4. 动态入口检查 | `git grep -n -E 'path\\.join\|spawn\\(\|execFile\\(\|pathToFileURL\|process\\.argv\|^#!\|main\\(' -- packages/ts-shell/src/core/commands/authCommandRuntime.ts` returned no hits. |
| 5. 公共面检查 | `git grep -n -E 'authCommandRuntime\|runAuthCommand' -- packages/ts-shell/src/index.ts scripts package.json` returned no hits. |
| 6. scripts 引用检查 | The same exact-path search found no script/package reference. A broad `/auth` search finds unrelated text and is not treated as a path reference. |

Test-file cost measured by:
```bash
git grep -l -E 'from ["'"'][^"'"']*authCommandRuntime\\.js["'"']|runAuthCommand' -- 'packages/ts-shell/src/**/*.test.ts'
```
Result: **1 test file**, `core/commands/authCommandRuntime.test.ts`, directly tests the legacy implementation. Focused proof:
```bash
cd packages/ts-shell && npx vitest run src/core/commands/authCommandRuntime.test.ts src/core/commands/connectCommandRuntime.test.ts src/core/commands/slashRouter.test.ts
```
Result: **3 files passed, 41 tests passed**. This is focused evidence only, not a full-suite claim.

### 6. Is each top-domain file load-bearing for another unreachable file?
- `core`: 27 files are internal-only within multi-file clusters; 34 are singleton components; `authCommandRuntime.ts` is a singleton candidate. Thus core is mixed, not one monolith.
- `context`: 34 of 36 files are internal-only; the two singleton files are independently judgeable. C1 alone contains 25 context files and spans 60 files across six domains.
- `edit`: 22 of 27 files are internal-only; 5 singleton files are independently judgeable. C2/C4/C10/C20/C21 are the relevant connected units.

## 与既有记录的差异
| 项 | 既有记录 | 本轮实测 | 判定 |
|---|---:|---:|---|
| T7-compatible value-only, all non-test TS | 270 / 59,121 | **263 / 57,977** | Current tree is 7 files / 1,144 lines smaller; drop matches the seven recent unreachable deletions. |
| Old §6 figure | 285 / 60,058 | not reproduced | Stale pre-deletion/pre-migration record. |
| Value-only weak components | not recorded in T7 report | **118**, largest **60 / 14,852**, **93 singletons** | New cluster census; deletion unit is component. |
| Type-inclusive graph | not used for T7 primary count | **168 / 40,097**, 45 components, largest 98 / 30,115 | Separate cycle-gate graph; do not mix with value-only deletion scope. |
| Narrow value-only scope excluding test-utils and __tests__ | T7 report listed 263 / 56,873 under an older mixed scope | current `closure.py` output **256 / 55,729** | Keep as comparison only; not the primary scope. |

## 风险与反证
- The value-only graph is a source-import approximation. External launchers, CI, or user-local scripts not represented in `entrypoints/`, `index.ts`, `scripts/`, or package metadata can make a file live.
- `import type` edges matter to the cycle gate and can connect otherwise separate components; this is why the report states both graph scopes.
- Tests are not production coverage. The 1 auth test file proves the legacy implementation is directly tested, not that it is live.
- A nearby live file is not an equivalent owner unless the responsibility, data contract, and consumer path match. This is why context acquisition, read delivery, planning runtime, and edit proposal/recovery files remain retained.
- §2.2 requires whole-component deletion. A singleton can be judged alone; C1/C2/C4 and other multi-file components cannot.

## 未验证事项
- No full Vitest, `npm run build`, or repository-wide delete simulation was run; these were outside the assignment limits.
- The report does not authorize deletion. A future auth deletion still needs the maintainers' explicit decision and a final stale-read of the current tree before write.
- Broad external launcher discovery beyond repository `scripts/` and package metadata remains unverified.
- All 263 files were not given a bespoke semantic read; the top-three domains were classified by exact component membership plus representative owner/neighbor reads. Therefore singleton `unique-capability` labels are conservative recommendations, not proof that product value is absent.

## 可执行触发条件
Revisit deletion only when a candidate component satisfies all of the following: (1) a named live lane owns the same responsibility and contract, with `file:line` producer and consumer evidence; (2) all six §2.2 checks pass; (3) dynamic/public/scripts scans are clean; (4) every test importing the component is either migrated to live behavior or intentionally removed; and (5) focused tests covering the replacement pass. Until then, retain the component, especially C1 and C2.
