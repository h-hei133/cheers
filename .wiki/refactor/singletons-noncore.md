# 非 `core` 单例处置建议

> 范围：非 `core`、排除 `test-utils/` 与四个 zero-importer 的单文件单例；重点回答 `runtime/events/projection.ts`、`provider/proposal/`、`provider/request/boundary.ts`、`result/types.ts`、`planning/action/graph.ts`、`turn/*`，并按家族给出处置建议。
>
> 规则：可达性只用于分析，不直接授权删除；删除前按 `.wiki/refactor/plan.md` §2.1/§2.2 判断“职责是否已被活轨承担”。本报告只创建该文件；未重新实测的旧记录标为 `[UNVERIFIED]`。

## 结论

- **`runtime/events/projection.ts`（2,997 行）：保留，但标记为“未接线的独有实现”，不列入本轮删除。** 当前没有生产 value importer，也没有 live lane 读取其输出；唯一外部生产依赖是同目录 `stream.ts` 的 type-only contract，且 `stream.ts` 自身也不在 roots 的 value-only 闭包。现有 live session surface 只是渲染别的事件形态，未证明覆盖 `RuntimeProjectionEvent` 投影责任。若维护者决定放弃整个 runtime-event product surface，未来应成簇裁决 `projection.ts` + `stream.ts` + tests；现在不能以“无 live consumer”自动授权删除，因为 §2.1 要求先证明职责由活轨承担。
- **`provider/proposal/` 是混合状态，不是整簇 live，也不是整簇 dead。** `provider/proposal/providerEditContext.ts` 有 7 个生产 value importers，但这些调用点实际使用的是 `redactProviderEditText`；`buildProviderEditContextPacket` 本身没有生产调用者。它因此是 live 的脱敏 helper，而不是 live 的 provider-proposal execution lane。其余 proposal/anchoring 文件（本轮名单中的 `providerEditProposal.ts`、`providerOutputValidator.ts`、`providerAnchorQuality.ts`、`providerAnchoredProposal.ts`、`providerAnchoringResult.ts`，以及同目录 anchors/matcher/conflict/candidate 支撑）没有生产 value importer；外部引用主要是 type-only，且 importer 自身也不在 roots value-only 闭包，另有测试引用。它们形成完整的 dormant provider-proposal subsystem，但当前没有 live call path。建议：**保留 `providerEditContext.ts` 作为 helper；其余整簇暂不删，标记为“未接线能力，需单独产品裁决”**，因为没有证据表明 live lane 已承担 exact-anchor / validation / review 责任。
- **`provider/request/boundary.ts`：保留，标记为 dormant boundary contract。** corrected 图显示它没有生产 value importer，只有 4 个外部 type-only importer（`attempt.ts`、`invocation.ts`、`response/stream.ts`、`runtime/events/projection.ts`），它们本身也不在 roots value-only 闭包；测试引用 5 个。它定义 request boundary / next-turn preparation，不能等同于 `turn/step.ts` 的直接 provider 调用或 readiness 检查。建议保留，后续单独决定是否接线或正式退休。
- **`result/types.ts`：保留。** 用户更正后的 93 单例表把它归入 external type-contract 族（报告输入给出的 corrected 口径为 51 个 external type importers、17 个 test type importers）；这是共享编译契约，不是死叶。其 value-only 不可达只表示 importer 链未从入口接入，不表示类型无消费者。
- **`planning/action/graph.ts` 与 `planning/task/workflowTaskPlanner.ts`：保留为局部 dormant planning subsystem。** `graph.ts` 的直接 importer 是 `workflowTaskPlanner.ts`，但这是 type-only edge；`workflowTaskPlanner.ts` 的 5 个外部 importer 也都是 type-only，且这些 importer 当前不在 roots value-only 闭包。因此“有生产 importer”与“CLI/live value reachable”不是同一事实。未证明活轨已实现同一 graph/planner semantics，不授权删除。
- **`turn/*`：保留。** `assistantResponse.ts`、`toolResultMessage.ts`、`turnSnapshot.ts` 的外部生产引用分别是 type-only，且引用者（包括 `runtime/events/projection.ts`、`tools/*`、`nextTurnBundle.ts`、`evidence/savepoint/model.ts`）并未把这三个文件纳入当前 roots value-only 闭包。`turn/` 目录存在 live sibling 不足以证明这三个具体 contracts 已被覆盖。
- **其余家族：保留，分为“契约型保留”与“独有实现保留”。** `browser/playwrightEvidence.ts`、`edit/patch/plan/types.ts`、`model-adapters/types.ts`、`session/agent/types.ts` 等有 external type importer，应直接保留；test-only 或 dormant production families 只有在六项检查证明“活轨已覆盖同一责任”后才可进入删除候选。本报告不授权任何文件立即删除。

## 实测证据

### 1. 规则与修正版口径

删除依据来自 `.wiki/refactor/plan.md:130-152`：职责由活轨承担才可删；可达性只是分析；删除前要做功能读审、等价实现、消费者存活、动态入口、公共面、scripts 引用六项检查。`plan.md:166` 另明确“在 CLI 可达集内 ≠ 被调用”。

主代理已纠正 93 单例分类：

- zero importer：4
- type-contract-only：12
- test-only：42
- type-contract + test：35
- 合计 **47/93 有 external type importer**

初版 resolver 有 `.js`→`.ts` 与多行 `import type` 缺陷，旧的 `live-importer=9` 口径已撤回。可复现的本轮修正版探针命令为：

```bash
python3 /tmp/analyze_singletons_fixed.py
```

该探针在当前树输出的全仓节点计数为：

```text
FILES=1430 ROOTS=42 VALUE_REACHABLE=570 VALUE_UNREACHABLE=860
```

这组全仓值只描述本探针的当前节点/入口口径，不替代主代理给出的 93-singleton corrected 分类。

### 2. 重点文件直接 importer / reachability

同一命令输出的关键结果如下（`extV`=外部生产 value import，`extT`=外部生产 type-only import，`tests`=测试或 test-utils importer）：

```text
runtime/events/projection.ts        reachable=False extV=0 extT=1 tests=4
provider/request/boundary.ts       reachable=False extV=0 extT=4 tests=5
provider/proposal/providerEditProposal.ts
                                    reachable=False extV=0 extT=4 tests=2
provider/proposal/providerAnchoredProposal.ts
                                    reachable=False extV=0 extT=2 tests=1
provider/proposal/providerAnchoringResult.ts
                                    reachable=False extV=0 extT=1 tests=1
provider/proposal/providerOutputValidator.ts
                                    reachable=False extV=0 extT=3 tests=6
planning/action/graph.ts            reachable=False extV=0 extT=1 tests=1
planning/task/workflowTaskPlanner.ts
                                    reachable=False extV=0 extT=5 tests=10
turn/assistantResponse.ts           reachable=False extV=0 extT=4 tests=7
turn/toolResultMessage.ts           reachable=False extV=0 extT=4 tests=4
turn/turnSnapshot.ts                reachable=False extV=0 extT=2 tests=6
```

`provider/proposal/providerEditContext.ts` 是重要例外：

```text
provider/proposal/providerEditContext.ts reachable=True extV=7 extT=0 tests=1
```

它的 7 个外部 value importers 是 `edit/proposal/editRepairContext.ts`、`edit/proposal/editRepairProposal.ts`、`planning/task/taskIntent.ts`、`provider/proposal/providerAnchorCandidate.ts`、`provider/proposal/providerEditProposal.ts`、`repair/verificationRepairContext.ts`、`verification/command/plan.ts`。这些 importer 中，`verification/command/plan.ts` 可沿以下 value path 到入口：

```text
entrypoints/cliSessionModule.ts
→ core/shell/recovery.ts
→ core/query/runtime/state.ts
→ core/query/runtime/taskState.ts
→ verification/command/plan.ts
→ provider/proposal/providerEditContext.ts
```

该路径只证明 `redactProviderEditText` 所在 helper 文件被 live verification-plan code 拉入；它不证明 `buildProviderEditContextPacket`、proposal normalization 或 anchoring functions 被 live 调用。对后者，函数名 grep 只找到定义与测试调用，没有 live production callsite；命令：

```bash
grep -R "normalizeProviderEditProposal\|validateProviderOutput\|extractProviderProposalAnchors\|matchProviderAnchorCandidates\|detectProviderAnchorConflicts\|classifyProviderAnchorQuality\|buildProviderAnchoredProposal\|buildProviderAnchoringResult" packages/ts-shell/src
```

输出显示这些函数的生产定义与测试调用，未显示 live production caller。

### 3. `runtime/events/projection.ts` 的真实状态

文件大小由以下命令实测：

```bash
wc -l packages/ts-shell/src/runtime/events/projection.ts
# 2997 packages/ts-shell/src/runtime/events/projection.ts
```

直接 importer 为：

- `runtime/events/stream.ts:2-5`：type-only，且 `stream.ts` 也不在 value roots 闭包；
- `provider/registry/provider.test.ts:4`；
- `runtime/events/projection.test.ts:61`；
- `runtime/events/stream.test.ts:15-17`；
- `tools/toolHandoff.test.ts:6`。

生产 value importer = **0**；测试文件 = **4**。`projectRuntimeEvents` 的实现从 `packages/ts-shell/src/runtime/events/projection.ts:312-361` 开始，接受 turn、receipt、tool、provider、verification、repair、session、context、resource 等多类事实，在 `:2924` 返回冻结事件数组。`stream.ts:1-60` 只把已有事件排序/序列化为 JSON，不实现同一事实投影。

仓库既有责任对照也记录：`core/shell/sessionEventSurface.ts` 渲染 QueryEvent / execution summary，但不能生成同一 `RuntimeProjectionEvent` contract；见 `.wiki/refactor/t7-unreachable-disposition.md:228-237`。因此答案是：

1. **没有 live file value-import `projection.ts`。**
2. **没有证据表明 live lane 消费 `projectRuntimeEvents` 输出。** 当前 grep 只找到测试调用；`scripts/` 与 package public surface 未发现该路径的生产注册/导出。
3. **它是 orphaned from the current live lane，但不是已证明冗余。** 它有完整、独有的跨域 runtime-event contract；按 §2.1，应保留并把“是否放弃整个 runtime-event product surface”作为显式产品/架构决策，而不是直接删除。

### 4. `provider/proposal/` 的真实消费者图

文件职责与行号：

- `providerEditContext.ts:38-139`：显式 target、预算、脱敏、full-content exclusion、`required-before-write`。
- `providerOutputValidator.ts:30-92,102-163`：exact/partial/unanchored/fuzzy/broad/unsafe/malformed/empty/over-budget 分类，`mutationAuthority: "not-granted"`。
- `providerProposalAnchors.ts:34-110`：validated output → anchor candidates，`noWrite: true`。
- `providerAnchorQuality.ts:32-131,134-177`：exact-ready/review-only/needs-anchoring/ambiguous/stale 等质量级别。
- `providerAnchoredProposal.ts:20-57,180-248`：anchored manifest、review bridge、hunk mapping。
- `providerAnchoringResult.ts:33-95,97-121`：anchoring 结果与 blocked/stale/unsupported 状态。
- `providerEditProposal.ts:93-161`：bounded proposal normalization，拒绝 broad/fuzzy/越界 target。

消费者分层：

- `providerEditContext.ts`：**7 个生产 value importer，但这些调用点使用的是 `redactProviderEditText`; `buildProviderEditContextPacket` 没有生产调用者**。它是 live helper，保留；不把整个文件描述为 live provider-proposal execution lane。
- `providerEditProposal.ts`：4 个外部 type-only importer，均为当前不可达的 provider/edit/planning 辅助链；2 个测试 importer。
- `providerOutputValidator.ts`：3 个外部 type-only importer，均为同一不可达 subsystem；6 个测试 importer。
- `providerAnchorQuality.ts`：1 个外部 type-only importer（`providerAnchoredProposal.ts`）；2 个测试 importer。
- `providerAnchoredProposal.ts`：2 个外部 type-only importer（`planning/quality/model.ts`、`providerAnchoringResult.ts`）；1 个测试 importer。
- `providerAnchoringResult.ts`：1 个外部 type-only importer（`planning/quality/model.ts`）；1 个测试 importer。
- `providerAnchorCandidate.ts`：同簇 1 个 value importer、1 个 type importer，生产 importer 自身不在 value roots；1 个测试 importer。
- `providerProposalAnchors.ts`、`providerAnchorMatcher.ts`、`providerAnchorConflict.ts`：生产边主要是 type-only，消费者均位于同一不可达子系统；测试覆盖 exact/partial/ambiguous/stale/conflict。

因此“provider/proposal 是 live subsystem 吗？”的精确回答是：**只有脱敏 helper `redactProviderEditText` 已接入 live verification/planning code；proposal normalization/validation/anchoring/review 家族当前不是 live execution subsystem，而是 dormant, test-covered subsystem。** 这比“整簇 live”或“整簇 dead”都准确。当前 live provider route 是 `entrypoints/cliRuntimeInvocation.ts:177-199` → `turn/session.ts` → `turn/step.ts:97-133`，该 route 不导入或调用 proposal/anchoring functions。

旧记录还显示 `scripts/verify-anchored-provider-smoke.mjs:12-19` 明确列出 8 个 provider proposal 测试路径；`.wiki/refactor/plan.md:581-589` 记录该 gate 曾因路径漂移而静默缩水。这证明脚本/测试面存在，但不证明生产 lane 已消费 proposal 输出。

## 逐类分析

### A. Runtime events / stream

**推荐：retain，另行裁决是否接线或正式退休。** `projection.ts` 是跨域 facts → `RuntimeProjectionEvent` 的唯一实现；`stream.ts` 是其类型/输出的 JSON adapter。由于没有活轨等价 owner，不满足“职责已被活轨承担”的删除授权。若维护者明确放弃 runtime-event product surface，则应成簇删除实现、stream 与 tests，并同步移除测试-only imports；本轮不做该产品决策。

### B. Provider proposal / request

**推荐：**

- `provider/proposal/providerEditContext.ts`：**retain/helper only; 不把它描述为 live proposal lane**。
- `provider/proposal/{providerEditProposal,providerOutputValidator,providerAnchorCandidate,providerProposalAnchors,providerAnchorMatcher,providerAnchorConflict,providerAnchorQuality,providerAnchoredProposal,providerAnchoringResult}.ts`：**retain/dormant；不列为立即删除**。它们没有 live production call path，但也没有活轨等价的 exact-anchor/validation/review owner；删除需要单独产品裁决“放弃未接线 provider proposal lane”。
- `provider/request/boundary.ts`：**retain/dormant boundary contract**。它的 responsibility 是 request preparation / next-turn boundary，不被当前 direct-call/readiness lane 等价覆盖。

### C. Result / planning

**推荐：retain。** `result/types.ts` 是共享 type contract；`planning/action/graph.ts` 与 `workflowTaskPlanner.ts` 是局部 planning contract chain。它们当前 value-only orphaned，不等于无编译消费者；也没有足够证据证明 live lane 已覆盖 graph/planner semantics。

### D. Turn

**推荐：retain。**

- `assistantResponse.ts`：assistant response accumulation、safe text/tool-call candidates、not-proven claims。
- `toolResultMessage.ts`：tool dispatch/result detail → prepared/blocked/unsupported message projection。
- `turnSnapshot.ts`：session/phase/provider/workspace/evidence 的稳定脱敏快照。

三者外部生产引用是 type-only，且引用者当前未从 roots value-only 到达；`turn/` 目录中的其他 live 文件只提供相邻执行职责，未构成等价替代。

### E. Browser / skill / CLI / context

**推荐：保留。** `browser/playwrightEvidence.ts` 属 external type contract；`browser/runtime/core/{directionDecision,gauntletManifest}.ts`、`browser/skill/runner/manifest.ts`、`browser/toolServerBackendComparison.ts`、`cli/interactive/interactiveCancellation.ts`、`context/compact/governance/contextAnalysis.ts`、`context/sessionContextRebuildProjection.ts` 等应按各自 dynamic/public/test surface 继续保留，除非后续六项检查证明已有 live owner。当前不授权删除任何一个。

### F. Edit / evidence / repair / session / verification

**推荐：保留。** `edit/patch/plan/types.ts`、`edit/patch/types.ts`、`edit/proposal/editRepairProposal.ts`、`edit/proposal/fencedEditPlanner.ts`、`edit/recovery/recoverySurfaceProjection.ts`、`evidence/host/proof.ts`、`evidence/savepoint/model.ts`、`repair/handoff/readiness.ts`、`session/continuation/readiness.ts`、`session/presentation/facts.ts`、`session/replay/state.ts`、`session/sessionDagEngine.ts`、`verification/verificationFacade.ts` 等多数属于 external type contracts、evidence/readiness projections 或独有 recovery semantics。不要因 test-only 或 dormant 而直接删；先证明活轨覆盖同一 contract。

### G. Model adapters / result / workflow / tools

**推荐：保留。** `model-adapters/{multimodal,strictSchema,types}.ts`、`result/host/verdict.ts`、`result/projection/runtimeHandoffProjection.ts`、`tools/result/split.ts`、`workflow/gitChangeSetAttribution.ts` 都是适配、结果/证据或拆分语义。若未来要删，应先证明输出字段与 truthfulness semantics 已被现有 result/session lane 逐字段接管。

### H. Provider smoke / operational support

`provider/liveProviderSmokeFallback.ts`、`browser/toolServerBackendComparison.ts` 等 operational/test-support 文件建议保留原位。它们可能没有 CLI value path，但承担 provider/browser availability comparison 或显式 smoke diagnostics；不能仅凭“只被测试引用”授权删除。

## 六项检查

本轮没有任何文件获得“立即删除”建议，因此没有可填为“删除”的六项授权单元。对最强删除候选，检查结果如下：

| 文件/家族 | 1 功能读审 | 2 等价实现 | 3 活消费者读取 | 4 动态入口 | 5 公共面 | 6 scripts 引用 | 当前裁决 |
|---|---|---|---|---|---|---|---|
| `runtime/events/projection.ts` | 已读：多域 facts → runtime events | 未发现等价 owner；session surface 只渲染其他事件 | 生产 value=0；测试 4 个；live output reader 未发现 | 当前静态 grep 未发现 `spawn`/dynamic import；仍需删除前复核 | `index.ts` 未发现 export | `scripts/` 未发现生产注册；测试 gate 另有路径 | **retain；若明确放弃 runtime-event surface，才可成簇复核删除** |
| proposal/anchoring 9-file dormant family | 已读：context → validation → anchors → quality → manifest/result | 未发现 live exact-anchor/validation/review 等价 owner | 生产 value=0；type importers 位于不可达链；测试广泛 | 未发现动态入口 | 未发现 `index.ts` 公共 export | smoke gate 显式列测试路径；不是生产消费 | **retain/dormant；需产品裁决后再谈删除** |
| `provider/request/boundary.ts` | 已读：request boundary / next-turn preparation | direct provider call/readiness 不等价 | 生产 value=0；4 个 external type edges，引用者也不可达 | 未发现动态入口 | 未发现公共 export | 未发现直接脚本生产消费 | **retain/dormant** |
| `result/types.ts` | 已读：共享 result contract | 无单一等价 type owner | corrected 总表：external type contract（输入给出的 51 extT / 17 testT） | 不适用 | 需主代理最终公共面复核 `[UNVERIFIED]` | 未发现脚本运行时读取 | **retain/contract** |
| `planning/action/graph.ts` + `workflowTaskPlanner.ts` | 已读：graph/planner semantics | 未证明 live equivalent | importer edges 是 type-only，importer 自身不在 value roots | 未发现动态入口 | 未发现公共 export | 未发现脚本字符串入口 | **retain/dormant subsystem** |
| `turn/*` | 已读：三个 turn projection contracts | 相邻 turn/step 不等价 | external edges type-only；引用者不在 value roots；测试存在 | 未发现动态入口 | 未发现公共 export | 未发现脚本字符串入口 | **retain/contract** |

六项检查的意义在此不是“凑表”，而是说明：**当前证据足以判定 orphaned/dormant，但不足以判定职责已被活轨承担。** 因而本轮没有合法的物理删除单元。

## 风险与反证

- **反证 1：orphaned ≠ redundant。** `runtime/events/projection.ts` 没有 live consumer，但实现覆盖了 session/provider/tool/verification/resource 等多域 observation contract；不能用 session surface 的渲染逻辑替代它。
- **反证 2：provider/proposal 的整体结论必须拆开。** `providerEditContext.ts` 已因 `redactProviderEditText` 被 live verification/planning code 引入，但 proposal context builder 与其余 proposal/anchoring functions 没有 live call path。把整个目录称为“live”或“dead”都会误导。
- **反证 3：type-only contract 是真实依赖。** corrected 93-singleton 表明 47 个文件有 external type importer；删除会破坏编译契约，即使这些文件不在 value-only runtime graph。
- **反证 4：有 importer 不等于 importer live。** `result/types.ts`、`workflowTaskPlanner.ts`、`planning/action/graph.ts` 的 importer 链存在，但 corrected value-only closure 显示相关 importer 自身未从 roots 接入；“被生产文件 import”不能直接翻译为“CLI live”。
- **反证 5：测试不能升级为生产接线。** runtime events 与 proposal tests 证明实现可运行、分支有验证，但不证明生产 CLI 读取这些输出。
- **反证 6：反过来也成立：目录 live 不等于 sibling live。** `turn/`、`provider/`、`result/` 目录均有 live 文件；本报告仍按单文件/契约/责任判断。
- **反证 7：脚本 gate 曾出现静默缩水。** `.wiki/refactor/plan.md:581-589` 记录 anchored-provider smoke gate 因路径漂移仍报 pass；scripts 中出现测试路径不是生产消费者证据。

## 未验证事项

- 本报告没有重新生成完整 93 行逐文件表；主代理提供的 corrected split 是当前总口径。单文件的最终 ext/type/test 分类应在合并前以同一修正版脚本一次性重跑。
- `provider/request/boundary.ts` 的静态图结论已复核，但若要删除仍需主代理按当前 `scripts/`、package exports、动态入口再做一次最终六项检查。
- `runtime/events/projection.ts` 的“无 live output reader”来自当前源码与 scripts grep；若仓库外部包、构建产物或运行时配置以字符串注册它，当前源码 grep 不会发现。删除前须检查 package exports/build manifests。
- `browser/*`、`cli/*`、`context/*`、`edit/*`、`evidence/*`、`repair/*`、`session/*`、`verification/*` 其余单例尚未逐文件完成六项检查；本报告对这些家族给出保守 retain，不把“保留”误写成已证明 live。
- 本轮未运行 build/全套测试，符合判定性文档任务约束；因此没有把测试绿灯作为删除证据。
