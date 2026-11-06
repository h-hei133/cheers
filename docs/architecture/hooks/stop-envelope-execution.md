# R0b Stop 信封执行记录

日期：2026-11-06。基点：`a5c600f78a800ca6517d6dc1a9ab3112125ef869`；启动工作树干净。
只允许修改 Cheers；NormProof 是只读参考。状态：R0b 中性终态已实现，随后按复核修复 flat hook 兼容回归；兼容修复后一次全量退出 0：1098 文件 / 14376 项通过，2 skipped，434.94 秒。下文 1098 文件 / 14358 项是兼容修复前的历史证据，保留作对照。未提交、未推送、无远端 CI。

操作者随后明确选择“解除停止条件，继续完整实现”。以下停止报告作为前置审计保留；当前
实施已授权新增中性事件、持久分类及全部消费方。新事件选择 query.completed_unproven，携带
原 reasonCode、not_reported 和原候选结果；普通 query.completed 与 query.failed 均不代用。

## 前置阅读后的现状（修改产品前记录）

`core/hooks/stop/result.ts:7,18–45` 的 `UNCERTAIN` 把 `already_blocked_once`、
`not_configured`、`could_not_judge`、`could_not_decide` 归一为 unknown；第 28 行还有
`proofVerdict === 'unknown'` 独立短路。`turn/stop.ts:64–100` 在 decide 开头再次归一化，
unknown 进入 finish；第 99–104 行固定发出 `query.failed`。因此修复后同一命令返回
allow/already_blocked_once，仍会失败；修改集合本身不足以修复 unknown proof 短路。

“没有配置门禁，每一轮都失败”需要限定：存在 Stop hook 且它静默或返回 not_configured 时
成立；完全没有 Stop 声明时，`core/hooks/stop/dispatch.ts:43` 返回空 stopChecks，
`turn/stop.ts:68` 有空列表特例，会 accepted，随后发布原 query.completed。
下文基线命令实测复现这两个路径；当时产品代码与既有测试保持原字节。后续实施与验收单独记录。

R0a 源码有完整 contract 与 proofVerdict：
`/home/wang/projects/normproof/src/contracts/hooks/completion-gate-contracts.ts:3–4,142–150`。
冻结名称 `normproof.completion-gate.stop`，版本 `0.1.0`；R0a proof 闭集为
proven / partial / not_proven / failed / not_reported。Cheers 已有全部这五个值，另有
refuted / unknown 用于原第三方/宿主路径；not_reported 一致，本轮不修改闭集。
**实际 R0a 的 not_configured 信封为 unsupported/not_reported，非附件示例的 allow。**
来源同文件 `buildCompletionGateResultOutput`；后续必须覆盖真实 unsupported 及附件 allow。

## 第 0 步：冲突与已裁决方向

C2 `turn/stop.test.ts:91–103` 故意要求 already_blocked_once 最后 query.failed 且无
query.completed；它保护“没有新证明不能冒充正常完成”。R0b 要求成功修复可中性结束。
当前闭集缺少这个类别，两个要求应由新状态同时满足。

| 方向 | 做法 | 代价与语义 | 裁决 |
| --- | --- | --- | --- |
| A | 新增 completed_unproven 终态及中性终端事件/分类 | 跨生命周期、持久化和所有消费方；保留结束与证明的区别 | 操作者已选定；推荐并遵守 |
| B | 继续 query.failed，只改文案/上层标签 | 改动少，但失败事件和消费方仍视作失败 | 拒绝，不是 A 的等价替代 |
| C | 只放行 already_blocked_once，not_configured 仍失败 | 改动局部，但不解决两类无新证明结束，且普通 completed 混淆证明 | 拒绝，不是 A 的等价替代 |

**实施前/实施后语义对照：**

| 对象 | C2 基线 | R0b 实施后 |
| --- | --- | --- |
| UNCERTAIN | 四个原因同归 unknown | 仅两种可结束原因分到显式 completed_unproven disposition；其余仍 unknown |
| StopTerminalStatus | stopped / blocked / unknown | 加 completed_unproven |
| C2 unknown 断言 | could_not_judge 等 query.failed，无 query.completed | 保留，并禁止中性完成事件 |
| C2 already_blocked_once 断言 | query.failed，无 query.completed | 中性 completed_unproven 事件，无 query.failed/普通 query.completed；增加 not_configured 对称断言 |
| missing_recheck | 原阻断 command 未返回 allow 则 unknown | 保留原用途；必须仍能检测 hook 被移除，不能用新类别绕过缺失复查 |

## 停止条件前置审计（历史）

附件原文：“若发现现有事件协议无法表达中性的 completed_unproven，停止并报告需要新增的
事件/结果分类及其所有消费方；不得退回到 query.failed 或把它伪装成 query.completed。”

当前 `core/query/runtime/events.ts:140–141` 只有 query.completed / query.failed；
`result/types.ts:3–13`、`session/schema/sessionRecord.ts:36`、
`session/schema/sessionStateSnapshot.ts:60` 的终端闭集都没有中性完成类别。
`lifecycle.record/stop_state` 可以扩展记录，但目前不是宿主终端事件；shell 在没有 recognized
terminal event 时抛错，transcript 校验拒绝未声明的新 stop_state。因此触发停止条件。
**实测修正：** `session/transcript/output.ts:65–72` 的宽松 fallback 接收未知 query 事件，
所以候选新 query 事件可以被读取；这不等于 shell/replay/recovery 已识别其终端语义。
前置审计阶段仅完成证据与扩展清单并停止。操作者随后解除该条件，本文后半段记录实际实施与验收。

## 基线命令、真实输出与反例（实施前）

环境：Linux x64，Node v24.15.0。NormProof HEAD
`716cfea2d7c3d6857f45cb58242e6197c9d47a11`，只读，启动及收尾工作树均干净。
真实 CLI 使用已有 dist；源码和 dist 的 contract 名称/版本一致。
无配置工作区运行没有触发 judge 或写入 NormProof；临时 home 全部在 Cheers `.tmp/` 内。

```bash
rtk proxy node --import tsx --test .tmp/stop-envelope-audit/audit.test.ts
```

```text
tests 13
pass 13
fail 0
duration_ms 3598.130975
```

这是**基线诊断断言通过**，不是修复验收：对错误放行明确断言当前错误行为，未新增到产品
回归套件。完整输出见 [baseline.txt](evidence/stop-envelope/baseline.txt)，命令源已归档为
[audit.test.ts.txt](evidence/stop-envelope/audit.test.ts.txt)，逐次真实轨迹见
[probes.json](evidence/stop-envelope/probes.json)。复跑需把源恢复至原 `.tmp/` 位置（保留相对
import），再执行上述命令。NormProof builder 只读导入的是 dist，以冻结 producer 生成信封，
完整生命周期的模型返回合成候选；不是实机 provider 或实际修复后的 judge 证明。

最终归档轮补了输入与强制 finish 分类输出。首轮有 12 passed / 1 failed：诊断误认为未知 query 事件会被 transcript
拒绝；实际 permissive fallback 接收它。修正探针后复跑；初始失败保存于
[baseline-initial.txt](evidence/stop-envelope/baseline-initial.txt)，没有修改产品以满足诊断假设。

| 实测输入 | 最终输出 | 结论 |
| --- | --- | --- |
| allow/already_blocked_once（proof 缺省） | query.failed / Stop check unknown (already_blocked_once). | (a) 确认 |
| R0a block/actionable_gap/not_proven → 同一 hook allow/already_blocked_once/not_reported | 2 个模型 step，query.failed / Stop check unknown (already_blocked_once). | 修复尝试后仍失败；无 proven 声称 |
| allow/not_configured | query.failed / Stop check unknown (not_configured). | (b) 的有 hook 版本确认 |
| 完全没有 Stop 声明 | query.completed / success | (b) 的全称说法不成立 |
| allow/could_not_judge | query.failed / Stop check unknown (could_not_judge). | 必需反例，仍失败 |
| allow/could_not_decide | query.failed / Stop check unknown (could_not_decide). | 未判定仍失败 |
| allow/proven/proven | query.completed / success | 正例对照 |
| allow/proven/not_proven | query.failed / Stop check unknown (conflicting_verdict). | 冲突被拒 |
| 合法 proven 信封但 version=99.0.0 或 name=unrecognized | query.completed / success | **未达验收 4，现有契约准入缺失** |
| reasonCode 缺失或 unrecognized_reason | query.completed / success | **未达要求 2，现有闭集校验缺失** |

### 旧命令的 empty_output（真实进程）

实际命令：

```bash
/home/wang/.nvm/versions/node/v24.15.0/bin/node /home/wang/projects/normproof/dist/adapters/cli/normproof.js gate stop
```

测试通过 stdin 传入隔离 cwd 和 `stop_hook_active: false`。真实输出：

```json
{"oldExit":0,"oldStdout":"","normalizedOld":{"decision":"unknown","reasonCode":"empty_output","proofVerdict":"unknown"}}
```

完整 shell 生命周期最终输出：

```json
{"type":"query.failed","error":"Stop check unknown (empty_output).","stopStatus":"unknown"}
```

同一无配置 cwd、同一输入、加 `--emit-result` 的真实正例输出：

```json
{"contract":{"name":"normproof.completion-gate.stop","version":"0.1.0"},"decision":"unsupported","reasonCode":"not_configured","reason":"No completion-gate configuration was found for this workspace.","evidenceIdentity":["unspecified"],"proofVerdict":"not_reported"}
```

当前宿主仍最终 query.failed / Stop check unknown (not_configured).
缺失 evidenceIdentity 的归一化对照实际为 `["unspecified"]`。

### 真实持久化、重放、恢复投影

already_blocked_once（含 producer 信封重入）及 not_configured 的真实读取结果相同：

| 消费面 | 实测基线结果 | A 必须得到的结果（未实现） |
| --- | --- | --- |
| 最终事件 | query.failed / stopStatus unknown；没有 query.completed | 独立 completed_unproven 中性终端；无失败/普通完成事件 |
| ShellSessionRuntime | executePrompt rejects；state=error | 正常结束这轮、返回等待用户；不 terminate、不假报成功 |
| CLI terminal projection | stopped_error / classification stopped | 可见 completed_unproven 及原 reasonCode |
| 新 SessionManager 读 state.json | status error / durableStatus stopped / classification stopped / reason stopped_error | 持久中性类别与原原因，非 error/success |
| transcript | run-started → run-error，query.failed 保留，全部可读取 | 中性 run 生命周期标记和 query 事件均可读取 |
| replay | 终端 query.failed 保留，无 continuationPrompt | 中性终端关闭 open turn，不自动重放或当成功 |
| recovery | durableStatus error / classification error / reason stopped_error | 保留中性类别及 reasonCode，不能把它改成 error |

可见当前恢复消费方还将 Stop failed 的 stopped 分类重新投影成 error；不能仅改 Stop 枚举。
真实 GoalScheduler、交互 CLI paint、job、handoff、relay 未运行；下面对它们是源码消费方审计，
不声称这些消费面的运行验收通过。

### 现有 C2 局部回归

```bash
rtk env VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=2 npm run test:ts -- src/turn/stop.test.ts src/core/hooks/stop/dispatch.test.ts
```

```text
Test Files  2 passed (2)
     Tests  40 passed (40)
  Duration  3.40s
```

真实输出：[c2-focused.txt](evidence/stop-envelope/c2-focused.txt)。重入上限、指纹去重、timeout、
剩余预算、hook 移除、权限/取消、真实 manager 持久轨迹仍通过；原 already_blocked_once 失败
断言原样保留。这不是 R0b 已修改后的七条验收，也不是验收 7 的全量 test:ts 链。

## 中性终端契约及全部消费面

实际新增表示：
`query.completed_unproven` 携带 completed_unproven 分类、原 reasonCode、
proofVerdict=not_reported、finalOutput、attempt identity 和原 Stop checks。
durable session 分类同名，生命周期 `run-completed-unproven`；既不发 query.failed，
也不发普通 query.completed。只允许已经准入的兼容信封进入该路径，不能从任意字符串猜测。
即使 reason 属于两类，也必须先拒绝 unknown/conflicting proof 或不兼容 contract。

生产端所有直接终端/分类引用的搜索结果已完整保存于
[consumers.txt](evidence/stop-envelope/consumers.txt)。下面是必须审查/扩展的消费面；目录前缀均为
`packages/ts-shell/src/`。有纯转发/展示者可沿用类型，仍须验证不丢弃/升级该状态。

| 消费面与具体 owner | 必须保留的契约 |
| --- | --- |
| core/hooks/types.ts；core/hooks/stop/model.ts, result.ts, dispatch.ts | Stop 专属 disposition；合法 contract/version/reason/proof 准入；聚合不能丢弃中性结果，也不能短路而漏跑后续阻断 hook；PreToolUse 决策保持 |
| core/query/runtime/lifecycle.ts:3–4；events.ts:140–141；turn/stop.ts:64–104；turn/session.ts:397–405；turn/projection.ts | 只在中性结束处发布新事件；继续共享单次修复预算；missing_recheck 检测原阻断 hook 被移除；原 stopped 结果不能被新状态升级 |
| result/types.ts:3–13；result/terminal/truth.ts；session/sessionResultParity.ts；evidence/types.ts, verdictFacade.ts | 结束、失败与证明分离；相应闭集/结果 parity 不把 completed_unproven 称为 proven/success |
| core/shell/sessionRuntime.ts:342–391,450；sessionTerminalState.ts:52–72,198–252；sessionPersistenceProjection.ts；sessionPrintOutputProjection.ts | 中性事件算 recognized terminal；不抛普通失败；输出中性分类；settled/promptSettled 回调保留类别 |
| session/schema/sessionRecord.ts:36；sessionStateSnapshot.ts:60–64；session/sessionEventCodec.ts:7–12；session/lifecycle/sessionTerminalStore.ts；durableStatusProjection.ts；sessionLifecycleWrites.ts；session/SessionManager.ts | 中性 metadata/state/run 标记，清理本轮 pendingPrompt/lifecycle；使用现有锁和真实 writer，不借用 saveError 或默认 success |
| session/transcript/validation.ts:39–48；output.ts:65–84；lifecycle.ts:4,36；scope.ts:31–32 | 明确验证新终端事件的必要字段和状态，而不是宽松 fallback；终端 scope 不能继承前一轮 |
| session/replay/builder.ts:180–193,250–258；session/recovery/scope.ts:88–105；sessionRecoverySnapshot.ts:68–79；types.ts；sessionResumeEligibility.ts；work.ts；reentry/codec.ts | terminal pairing、interruption repair、选中分支恢复和重入都识别中性闭集；保留原原因，恢复不降为普通 error，也不自动重放 |
| session/sessionContinuityModule.ts；sessionCompactModule.ts；agent/compaction.ts；continuation/source.ts, branch.ts, inspection.ts, retentionPlanner.ts, sessionSeedInfluence.ts, sessionContinuitySnapshot.ts, compactSummary.ts；session/sessionContinuationProjection.ts, continuityFormatter.ts, sessionContinuityTypes.ts；presentation/sessionReentrySurface.ts | 保存/压缩/分支/续接不丢掉中性终端来源，不从旧成功继承 proven；中性结果不把尚未确认写入当成功 |
| planning/goal/run/model.ts, codec.ts, scheduler.ts:58–71, safety.ts:28–40, store.ts:55–70；planning/goal/acceptance/complete.ts:26, evaluate.ts:26 | 新 neutral round outcome 与持久 origin 绑定；中性 Stop 结束不能自动标 goal complete；保留显式 native acceptance/usage 守卫，不算普通 failure |
| cli/interactive/turnSink.ts:266–290；core/shell/sessionStateSurface.ts；session/presentation/sessionReentrySurface.ts | finalize 当前消息、展示完成但未证明，既不成功徽标也不普通 error/retry failure；下一轮仍可请求 |
| cli/jobs/agent/runtime.ts:141–163；workflow/jobs/agent/model.ts, codec.ts, journal.ts, service.ts；workflow/jobs/contract.ts；cli/jobs/hub.ts；相关 DAG/任务投影 | agent outcome、child session 与 job receipt 中性一致；不默认 failed 或 completed；不推导未确认副作用成功 |
| core/shell/sessionRuntime.ts:60,65；cli/runtime/cliSessionRuntimeFactory.ts；cli/runtime/handoff.ts:34–44；cli/handoff/state.ts, runtime.ts:111；workflow/handoff/model.ts, codec.ts, store.ts | prompt settlement 中性回调贯通 handoff phase/持久闭集，不回落 failed/unknown 或冒充成功 |
| collaboration/contract/model.ts:13,22, snapshot.ts；client/events.ts:9, host.ts:38；service/proposals.ts:45–55；cli/collaboration/acceptance.ts:46；cli/runtime/cliSessionRuntimeFactory.ts:105 | relay terminal kind、dirty snapshot、proposal outcome 同步；远端不能继续把该类别当普通 failed/completed |

搜索命令：

```bash
rtk proxy rg -n 'query\.completed|query\.failed|TerminalClassification|terminalClassification|terminalReason|durableStatus|run-completed|run-error' packages/ts-shell/src --glob '!*.test.ts'
```

另外沿 `promptSettled` / `settled` 回调追到 job、handoff、collaboration 的闭集。
该清单先作为遵守停止条件的扩展报告提出，授权解除后按这些 owner 实施；原本只是转发或独立验收的消费方保留其边界。

## 五态信封归类与 reasonCode 全表（C2 基线 / R0b 实施后）

| R0a decision | C2 基线 | R0b 实施后 | 是否普通失败 |
| --- | --- | --- | --- |
| allow | proven/advisory_only 可 accepted；already_blocked_once unknown | proven/advisory_only 按原语义 accepted；already_blocked_once 中性 completed_unproven | 后者目标否，当前是 |
| block | blocked → 单次 repairing → accepted 或 bounded terminal | 保留原上限和 fingerprint | 上限/重复时是 |
| unknown | unknown | unknown | 是 |
| unsupported | unknown | not_configured 中性 completed_unproven；invalid_input unknown | 前者目标否，其他是 |
| failed | 当前被无效 decision 拒为 unknown/invalid_output | unknown，保留失败来源 reasonCode | 是 |

| reasonCode（闭集或宿主生成原因） | C2 基线终态/事件 | R0b 实施后终态 | 是否失败/是否新 proven |
| --- | --- | --- | --- |
| proven | accepted / query.completed | accepted，原结果完成 | 否 / 仅 producer 自报 proven，不是独立审计 |
| advisory_only | accepted / query.completed，proof partial | 保留原 accepted | 否 / 否 |
| already_blocked_once | unknown / query.failed | completed_unproven，保留原因/not_reported | 否 / 否 |
| not_configured（allow 或真实 unsupported 信封） | unknown / query.failed | completed_unproven，保留原因/not_reported | 否 / 否 |
| actionable_gap | block → repairing；重复/限额 blocked | 保留单次修复，最终分类取复查 | 不能从 gap 推导 proven |
| could_not_judge | unknown / query.failed | unknown | 是 / 否 |
| could_not_decide | unknown / query.failed | unknown | 是 / 否 |
| invalid_input | unknown / query.failed | unknown | 是 / 否 |
| internal_error（failed 信封） | unknown/invalid_output / query.failed | unknown/internal_error | 是 / 否 |
| invalid_output | unknown / query.failed | unknown | 是 / 否 |
| empty_output | unknown / query.failed | unknown | 是 / 否 |
| timeout | unknown / query.failed | unknown | 是 / 否 |
| process_failed | unknown / query.failed | unknown | 是 / 否 |
| conflicting_verdict | unknown / query.failed | unknown | 是 / 否 |
| incompatible_contract | 当前没有这条校验，可能错误 completed | unknown/incompatible_contract | 是 / 否 |
| contract-bearing reasonCode 缺失/未入闭集 | 当前可能默认 explicit_allow 或接受未知字符串 | unknown/invalid_output | 是 / 否 |
| handler_failed / registration_changed / sandbox_refused / output_limit / not_authorized | unknown / query.failed | 保留 unknown | 是 / 否 |
| missing_recheck | unknown / query.failed | 保留 unknown | 是 / 否 |
| repeated_block / reentry_limit / step_limit | blocked / query.failed | 保留 blocked | 是 / 否 |
| cancelled / model_failed / runtime_failed | stopped 记录；保留既有取消/失败事件 | 保留原机制 | 取消非普通失败，其他按原机制 / 否 |
| flat hook 缺省或自定义 reasonCode | allow 缺省 explicit_allow；block/retry 缺省 hook_blocked；合法自定义码保留 | 恢复相同默认值及原格式约束；带 contract 的信封仍需闭集 | 不推导 proven |
| exit_2 / unknown / unsupported | 原宿主/第三方兼容来源，非 R0a 冻结 reason 闭集 | 原 unknown/unsupported decision 保留 unknown；仅内部 exit_2 可阻断 | 不作为 R0a 新证明 |

以上分类以合法、兼容且不冲突的信封为前提；unknown proof 的短路必须保留，不能仅从
reasonCode 把 unknown 变成 completed_unproven。完全没有 Stop 声明的现有 accepted 特例，
与外部 not_configured 信封的中性分类是两个独立路径；不可用这个内部特例放宽外部准入。

## 实施与消费方验收

Stop 专属 disposition 仅加入 Stop result/HookDecision；通用 PreToolUse decision 闭集保留。
normalize 先检查 contract 名称与版本、reason 闭集、proof 冲突，保留 unknown proof 短路。
contract-bearing 输入必须报告字符串 proofVerdict；数组/对象不通过 String 转换准入。
flat handler 的 reasonCode 可省略，保留原格式规则与默认值；只有 contract-bearing 信封要求闭集。
R0a 两类原因 + not_reported 分到 completed_unproven；dispatch 会继续消费后续 hook，
后续 block/unknown 覆盖中性结果。reason 和 proof 不能由 stdout exit 0 或模型正文猜测。

StopLifecycle 保留原一次修复上限、fingerprint、取消、剩余预算和 missing_recheck。
原来已经 stopped 的候选仍 stopped，结构化 Stop 状态同样不改称 completed_unproven。
只在原候选可完成时发布 query.completed_unproven，包含原结果、原因、not_reported 与 attempt。
普通完成和普通失败事件均不代用；已保存的新 query 事件显式验证闭集与字段一致性。

Session metadata/state 保存 completed_unproven、terminalReasonCode、idle 与
run-completed-unproven；清除 pendingPrompt/lastError/pending lifecycle。新请求及取消清除
旧 terminalReasonCode，避免原因污染后续状态。恢复、replay、选中分支和 compaction 保留
中性结果，不自动重放；续接摘要不把中性 stopReason 放进 lastFailure/last-error。

CLI 输出 Outcome: completed_unproven 与原原因，交互 sink finalize 当前消息，lastTurnFailed
保持 false。settled/promptSettled、handoff phase、agent child/job receipt、relay kind 与
collaboration proposal outcome 都保持独立中性分类。Agent job 的完整输出只表示输出已收齐，
completionProof 仍 false；显式新请求才能创建下一 run，旧 run 不 replay。
Goal round 的 lastOutcome=completed_unproven，可继续自动轮次，goal.phase 仍 active。
独立 goal acceptance 继续要求 completed/success/run-completed，不能从中性 Stop 推导 complete。

### 命令与真实输出

在仓库根目录，所有 build/test/gate 串行，Vitest 最多两个 worker。

```bash
rtk proxy sh -c 'CHEERS_R0A_CLI=/home/wang/projects/normproof/dist/adapters/cli/normproof.js VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=2 npm run test:ts -- src/turn/stop.envelope.test.ts src/turn/stop.test.ts src/core/hooks/stop/dispatch.test.ts src/planning/goal/run/scheduler.test.ts src/core/shell/sessionRuntime.test.ts src/cli/interactive/turnSink.test.ts src/cli/handoff/runtime.test.ts src/workflow/jobs/agent/service.test.ts src/cli/jobs/agent/command.test.ts src/cli/collaboration/acceptance.test.ts src/collaboration/service.test.ts src/session/continuation/compactSummary.test.ts src/session/compaction/progress.test.ts'
```

```text
Test Files  13 passed (13)
     Tests  261 passed (261)
  Duration  19.24s
```

最终输出：[focused-strict.txt](evidence/stop-envelope/focused-strict.txt)；之前的 242 项聚焦输出保留在
[focused-final-accepted.txt](evidence/stop-envelope/focused-final-accepted.txt)。
最终输出原样解析的 49 个真实探针：[accepted-probes.json](evidence/stop-envelope/accepted-probes.json)。
真实 NormProof subprocess 读现有 dist；配置和 missing source 夹具写在 Cheers .tmp，NormProof
仓库只读。模型响应为测试夹具；handoff 有本地 HTTP 响应和真实 native write/model switch。
不把 re-entry yield 称为实际修复已 proven，首次 actionable gap 在夹具中仍可存在。

| 路径 | 最终真实输出 |
| --- | --- |
| 同一真实 R0a command 首次 block/actionable_gap、再次 allow/already_blocked_once/not_reported | 2 steps、reentryCount 1、stop_hook_active true、query.completed_unproven；无 query.failed/普通 query.completed |
| 真实 R0a unsupported/not_configured/not_reported；附件 allow 变体 | 1 step、query.completed_unproven，原 reasonCode 与 not_reported 保留 |
| could_not_judge | query.failed / stopStatus unknown / Stop check unknown (could_not_judge). |
| could_not_decide | query.failed / stopStatus unknown / Stop check unknown (could_not_decide). |
| 不带 --emit-result 的旧 command | query.failed / stopStatus unknown / Stop check unknown (empty_output). |
| compatible proven 但 version=99.0.0 或 name=other | query.failed / unknown / incompatible_contract |
| allow/proven/not_proven；unproven reason + proven；decision/reason 冲突 | query.failed / unknown / conflicting_verdict |
| reason 缺失或未知、contract-bearing proof 缺失 | query.failed / unknown / invalid_output |
| failed/internal_error/not_reported | query.failed / unknown / internal_error |
| 两类中性 reason + proof unknown | query.failed；两种完成事件均无 |
| proven 正例、缺省 evidenceIdentity | 普通 query.completed；hook_result.evidenceIdentity 为 [unspecified] |

两个中性 reason 的完整事件、原 state 读回、transcript 与下游投影见
[neutral-projections.json](evidence/stop-envelope/neutral-projections.json)，由机器探针原样抽取。
每个 neutral probe 断言独立事件和最终状态，未以 normalize 返回值替代验收。

| 下游 | 实际断言与读取 |
| --- | --- |
| Shell | executePrompt resolves、返回 Candidate、idle，下一人工请求可继续 |
| session / recovery | new SessionManager 读取 status/durable/classification=completed_unproven、原 terminalReasonCode；pendingPrompt/lastError 清除 |
| transcript / replay | 全部真实落盘记录可读取，run-completed-unproven；终端关闭 open turn，无自动 continuationPrompt；篡改 proof/reason/classification/attempt 拒绝 |
| continuity / compaction / branch | 原 reason 保留，无 lastFailure/last-error；压缩阈值计数保留中性分类，排除另一分支来源后不继承旧成功 |
| CLI / sink / reentry cache | Outcome 与 reason 可见；sink.lastTurnFailed false；decodeReentrySummary 保存原因，新请求开始后旧原因消失 |
| goal scheduler | round 2、lastOutcome completed_unproven、pendingRound false；phase active，继续调度，未自动完成 |
| native handoff | 本地 HTTP/native write/model switch 后 phase completed_unproven、switchedBy first-write；新 manager 读取中性 session |
| native agent job / hub | child session、job/status/run 均 completed_unproven，output complete，completionProof false；无 live owner，无旧 run replay |
| collaboration | terminal relay kind completed_unproven；prompt settlement 保留 outcome 和 provenance/controller fence；service 持久同名 outcome，revocation/takeover 后仍拒绝迟到 terminal settlement |

### 原测试断言的前后对照

C2 unknown 表中的 could_not_judge/could_not_decide/invalid_output/empty_output/process_failed
继续 query.failed 且无普通完成，另加无中性事件断言。already_blocked_once 从同一失败表
拆出对称 already_blocked_once/not_configured 测试，原“不能普通 completed”断言保留，改为
必须中性事件 + not_reported + 无 query.failed；测试注释说明 C2 → R0b 语义变更。

其他 bare allow 的 injected empty-dispatcher 夹具（含全量发现的 compaction progress）改成 stopChecks: []，对应实际“没有声明 hook”
路径，保留原业务断言。初轮 2 个 goal 测试失败被归为 harness/setup drift，未放宽真实
缺失 reason 的信封准入规则。这轮误把闭集要求套到 flat hook，后续复核发现并修复，见下节。
输出早期 180 / 229 / 231 均为阶段聚焦，242 为中性语义聚焦；最终 proofVerdict 字符串类型校验及 compaction progress 共 13 文件 / 261 项通过。

C2 原七条验收的执行行为仍由同一 Stop 测试与原 dispatch 测试验证：一次修复、identity/active、
fingerprint 去重及动态文本、timeout 与 JSON timeoutMs、持久五类事实、权限/预算/取消/
missing_recheck。R0b 仅两类无新证明完成的终端归类变更；不删除其余原断言。

### 反转、脚本与构建

```bash
rtk proxy python3 .tmp/stop-envelope-validation/reversal.py
rtk npm run test:scripts
rtk npm run build
```

五项反转：重新并入 UNCERTAIN、删除 unknown-proof 短路、忽略 version、用普通 completed
替代中性 event、session writer 丢弃中性状态，全部 exit 1 / AssertionError，之后恢复 exact bytes。
摘要 [reversal.json](evidence/stop-envelope/reversal.json)，runner 源
[reversal.py.txt](evidence/stop-envelope/reversal.py.txt) 与各 reversal-*.txt 日志同目录。
首轮 npm test:ts 的 -t 转发报 EUNKNOWNCONFIG，是无效 runner，不计入反转；改为直接 workspace
npm run test -- 后重跑全部五项。反转后聚焦通过；后续中性摘要修正再次通过 242 项。

脚本 tests 191 / pass 191 / fail 0，见 [scripts.txt](evidence/stop-envelope/scripts.txt)。
阶段 build manifest 234a190ccda9，见 [build-final-accepted.txt](evidence/stop-envelope/build-final-accepted.txt)。
夹具修正后的阶段 build 为 fb137bcca3b3，见 [build-release.txt](evidence/stop-envelope/build-release.txt)。
最终 proofVerdict 字符串类型收紧后 build 为 46d83ccb6c75，见 [build-strict.txt](evidence/stop-envelope/build-strict.txt)。
五静态门通过，119 个既有 docs-source advisory 保留。最终结构扫描有 64 个修改生产模块的 callable rows，均未新增 over-ceiling；类型模块无 callable
row。见 [structure-final-touched.txt](evidence/stop-envelope/structure-final-touched.txt)。

### 指定完整链（兼容修复前的历史通过）

```bash
rtk proxy sh -c 'npm run verify:import-cycles && npm run check:declarations && npm run check:node-floor && CHEERS_R0A_CLI=/home/wang/projects/normproof/dist/adapters/cli/normproof.js VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=2 npm run test:ts'
```

源码冻结清单的身份见 [source-identity.json](evidence/stop-envelope/source-identity.json)，逐文件 SHA-256
保存在 [source-files.json](evidence/stop-envelope/source-files.json)。
首轮刚启动即因审查发现中性 stopReason 被 lastFailure 消费而中止，exit 130，无完整统计，
不计通过。修正后第一轮完整链退出 1：1097 文件 / 14356 项通过，1 文件 / 1 项失败，2 skipped，
1122.01 秒。失败为 compaction progress 的 bare allow 空 dispatcher 夹具缺少 stopChecks，
分类为 harness/setup drift；仅补 stopChecks: []，原 query.completed 与 overflow 断言全部保留。
失败日志见 [full-suite-initial.txt](evidence/stop-envelope/full-suite-initial.txt)。修复后 3 文件 /
62 项聚焦通过，见 [focused-compaction-restored.txt](evidence/stop-envelope/focused-compaction-restored.txt)。
夹具修正后一次全量退出 0：1098 文件 / 14357 项通过，2 skipped，1124.58 秒；输出保留在
[full-suite-before-proof-type.txt](evidence/stop-envelope/full-suite-before-proof-type.txt)。这轮对应
proof 类型收紧前的源码，不替代最终验收。

最后检查发现数组 proofVerdict 可被 String 转换成合法词汇，遂收紧为只接受字符串，
新增最终事件反例后重新执行完整链。退出 0，原 compaction progress 18 项全部通过，最终真实输出：

```text
Test Files  1098 passed (1098)
     Tests  14358 passed | 2 skipped (14360)
  Duration  1110.60s
```

完整输出见 [full-suite.txt](evidence/stop-envelope/full-suite.txt)。两项既有 skipped 保留。最终
3,119 个源码/清单文件逐项 SHA-256 与冻结字节一致，source drift=0；本轮未在全量期间编辑产品。

最终五静态门通过，详见 [final-gates.txt](evidence/stop-envelope/final-gates.txt)。完整 callable 扫描
另执行 `rtk proxy npm run analyze:module-facades -- --all`，64 个修改生产模块未新增 over-ceiling。
仓内 pinned
NormProof archive 解包至 .tmp 串行执行 judge，退出 0，verdict 为 partial：acyclic 与 unresolved
specifier 两义务 satisfied，阻塞缺口 0；原 interactiveMode.ts / interactiveMode.test.ts 两项
20-name ceiling advisory 保留，见 [verdict.json](evidence/stop-envelope/verdict.json)。没有新增
本任务模块 finding，也未改历史 disposition 或将 partial 当作全仓 proven。

最终静态与 judge 的实际命令（仅在完整 suite 退出后运行）：

```bash
rtk proxy sh -c 'mkdir -p .tmp/stop-envelope-validation/judge && tar -xzf .normproof/normproof-0.1.0.tgz -C .tmp/stop-envelope-validation/judge && npm run verify:import-cycles && npm run check:config-consumers && npm run check:declarations && npm run check:node-floor && npm run verify:docs-drift:strict && npm run analyze:module-facades > .tmp/stop-envelope-validation/structure-final.txt && node .tmp/stop-envelope-validation/judge/package/dist/adapters/cli/normproof.js judge .normproof/judge-input.json .tmp/stop-envelope-validation/judge-output --evidence-manifest .normproof/evidence-manifest.json'
rtk proxy npm run analyze:module-facades -- --all
```

### 验收逐项审计

| 验收 | 本轮证据与状态 |
| --- | --- |
| 0.1 冲突与 A/B/C | 已记录，A 实施 |
| 0.2 could_not_judge 失败 | 最终 query.failed，正例 proven 对照 |
| 0.3 旧命令 empty_output | 真实 CLI + shell，原命令 empty failed、emit-result 中性正例 |
| 0.4 未知版本拒绝 | 最终 unknown/incompatible_contract；兼容版正例 |
| 0.5 proof 冲突 | 最终 unknown/conflicting_verdict；proven/not_reported 正例 |
| 0.6 C2 七条与中性分流 | 最终 261 聚焦通过；unknown 无两种完成，中性无普通失败/成功 |
| 0.7 指定完整链 | 退出 0：1098 文件 / 14358 项通过，2 既有 skipped |
| 1.8 already_blocked_once 完整链与下游 | 真实 R0a command block→reentry，中性完整轨迹与消费方断言 |
| 1.9 not_configured 同上 | 真实 unsupported + 附件 allow，对称投影断言 |
| 1.10 正反例 | 原 22 条信封端到端与强化原断言；兼容修复后该文件共 40 项 |
| 能力矩阵/执行契约/五态表/commit message | 已同步本次语义与证据，CI/平台缺口明确 |

真实 NormProof 之外的第三方 hook、Node 20.3 本次完整消费链、macOS/Windows、真实 provider、
远端 CI 均未验证。前一份 J2 的 Node20/24 信封解析结果绑定旧 source snapshot，此处不复用。
不改 NormProof、PreToolUse、依赖、provider/auth core、重入上限或 missing_recheck。
并发工作 scripts/hooks/ 与 capability/runtime 证据文档保留，未作为本任务验收替代。

## Commit message 版本

```text
feat(hooks): preserve completed-unproven Stop outcomes end to end

Validate the frozen Stop envelope before terminal consumption. Settle re-entry
yields and unconfigured gates through query.completed_unproven, retaining the
original reason and not_reported proof. Preserve neutral session, goal-round,
CLI, replay, recovery, handoff, job and relay outcomes without success inference.
Keep undecidable checks failed and retain one bounded repair and missing_recheck.
```

最终 docs-drift strict 与 git diff --check 通过，`rtk proxy node scripts/start.mjs --version` 输出 0.1.0，构建新鲜度
通过。输出见 [final-document-check.txt](evidence/stop-envelope/final-document-check.txt)。
仅清理本任务 .tmp/stop-envelope-validation，归档日志保留；NormProof 收尾工作树仍干净。

未提交、未推送、无远端 CI 声明。

## Flat hook 兼容回归复核与修复

用户复核正确：原 R0b 将 REASONS 闭集校验应用到所有结果，缺省码提前 invalid_output，
合法自定义码也被拒绝。这是 product behavior drift；原 14358 项全量没有覆盖这条边界。
原 dispatch 的无 reasonCode unknown 夹具被改成显式字段，进一步隐藏了缺省路径。
本次恢复原夹具，不用补字段回避兼容测试。
精确影响：unknown 仍阻止普通完成；回归破坏的是 block/retry 分类、反馈和有界修复语义。

| 方向 | 行为与代价 | 裁决 |
| --- | --- | --- |
| A | 仅 contract-bearing 信封强制 reason 闭集；flat 恢复旧格式与默认值 | 采用；用户已授权建议正确时直接修复 |
| B | 拒绝全部旧 flat 输出并宣布 breaking change | 拒绝；违反既有 hook 兼容行为 |
| C | 只恢复 block，allow/retry 仍失败 | 拒绝；只修部分回归，协议语义不统一 |

对照 HEAD 的旧 normalize：自定义码按 `^[a-z][a-z0-9_]{0,79}$` 校验；无有效码时
allow→explicit_allow、block/retry→hook_blocked，unknown/unsupported 保留相应原因。
现在恢复这一点，同时保留 R0b 的不兼容 contract、unknown proof、verdict 冲突及中性分流。
自定义码表示旧 hook 的分类，不增加任何 proof authority。

只读参考：Claude Code `utils/hooks.ts:525–536` 直接消费 block 和 reason，无 reasonCode
要求，缺 reason 使用 Blocked by hook；NormProof
`src/contracts/hooks/completion-gate-contracts.ts:229–241` 的旧输出正是 block/reason，allow
静默。修复遵守其 block/reason 输入决策；Cheers 自有一次修复与静默 unknown 策略保留。

| 输入 | 回归行为 | 当前最终行为 |
| --- | --- | --- |
| flat block + reason；flat retry 无码 | unknown/invalid_output，未修复 | hook_blocked，恰好一次 query.retrying；同 command 明确 allow 后普通完成，重复 block 仍 blocked |
| flat allow 无码 | unknown/invalid_output | explicit_allow，普通完成 |
| flat allow/lint_passed；block/lint_failed；retry/need_more | unknown/invalid_output | 原自定义码保留，block/retry 有界修复，allow 完成 |
| flat unknown 无码；allow + unknown proof | invalid_output 或 unknown | query.failed / unknown，不出现任一完成事件 |
| 带 contract 的缺省或自定义 reasonCode | invalid_output | 仍 query.failed / invalid_output |
| 真实旧 gate stop 首次 block、重入静默 | 首次 invalid_output，1 step | 首次 hook_blocked→repair，2 steps，最终 query.failed / empty_output |
| R0a 两种中性原因；could_not_judge；旧命令无配置静默 | 已正确分流 | 原完整下游断言仍通过 |

修复前加入真实 command 与终端消费方回归测试：2 文件 / 9 failed / 50 passed，7.86 秒。
修复后第一轮：3 文件 / 1 failed / 81 passed；唯一失败是新测试误断言修复反馈作为 turn
落盘，分类为 harness/setup drift，改为检查第二次模型调用实际收到的 system 反馈。
未为测试修改产品。随后 3 文件 / 85 项通过，构建 008c420bf49f 通过。

反转将闭集再次应用于 flat 输出：6 个真实命令兼容用例均 AssertionError、exit 1；恢复 exact
bytes 后执行原 R0b 全部下游聚焦，加上新增 18 项：13 文件 / 279 项通过，20.25 秒。
原七条 C2 守卫和 R0a 中性终端断言均保留。命令：

```bash
rtk proxy sh -c 'CHEERS_R0A_CLI=/home/wang/projects/normproof/dist/adapters/cli/normproof.js VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=2 npm run test:ts -- src/turn/stop.envelope.test.ts src/turn/stop.test.ts src/core/hooks/stop/dispatch.test.ts && npm run build'
rtk proxy node .tmp/stop-flat-validation/reversal.mjs
rtk proxy sh -c 'npm run verify:import-cycles && npm run check:config-consumers && npm run check:declarations && npm run check:node-floor && npm run verify:docs-drift:strict && CHEERS_R0A_CLI=/home/wang/projects/normproof/dist/adapters/cli/normproof.js VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=2 npm run test:ts -- src/turn/stop.envelope.test.ts src/turn/stop.test.ts src/core/hooks/stop/dispatch.test.ts src/planning/goal/run/scheduler.test.ts src/core/shell/sessionRuntime.test.ts src/cli/interactive/turnSink.test.ts src/cli/handoff/runtime.test.ts src/workflow/jobs/agent/service.test.ts src/cli/jobs/agent/command.test.ts src/cli/collaboration/acceptance.test.ts src/collaboration/service.test.ts src/session/continuation/compactSummary.test.ts src/session/compaction/progress.test.ts'
```

证据归档于 [flat 修复聚焦输出](evidence/stop-envelope/flat-compatibility/focused-final.txt)、
[反转摘要](evidence/stop-envelope/flat-compatibility/reversal.json)、
[当前源码身份](evidence/stop-envelope/flat-compatibility/source-identity.json)。此前全量与 J2
观测绑定旧源码；当前修复不复用其 Node20/24、CI 或跨平台结论。

修复后补跑一次完整链（静态门 + `npm run build` + `npm run test:ts`）：1098 文件 / 14376 项
通过，2 skipped，434.94 秒，exit 0。该轮是兼容修复后的最终验收，取代上文兼容修复前的
14358 项全量；两轮差 18 项即本轮新增的 flat 兼容用例。J2 的 Node20/24 矩阵与 CI 结论仍绑定
修复前源码，本次未重跑，保留其原身份声明。

五静态门再次通过；result.ts 的 6 个 function-like names 未超过 ceiling。Pinned judge
退出 0，partial 仅保留原 interactiveMode 两项 ceiling finding，阻塞缺口为 0。
构建新鲜度通过，3119 项源码/清单 SHA-256 在最终聚焦前后无漂移，NormProof 仍只读且干净。
见 [门禁](evidence/stop-envelope/flat-compatibility/final-gates.txt) 和
[文档与构建检查](evidence/stop-envelope/flat-compatibility/final-document-check.txt)。

Commit message：`fix(hooks): restore legacy flat Stop output compatibility`。
