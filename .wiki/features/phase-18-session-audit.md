# Phase 18 会话边界行为审计

基准清单：`b271e40b` 下 continuation 16、recovery 11、replay 5、export 4，共36个生产模块。
当前已提交基线：`35f6a2c1`；第十六批的本地证据见实施裁决。路径均相对 `packages/ts-shell/src/session/`。
“已核对”指实现与所列断言一致，不代表任意输入下无缺陷。原36模块的所列行为判据已闭合，W7-26完成；下列保证边界继续适用。
前十六批证据见 [实施裁决](phase-18-decisions.md)。第十一批实际运行29套384项，不含本表新发现的全部边界。

## continuation（16）

| 原模块 | 行为判据 / 具体证据 | 审计状态 |
|---|---|---|
| `continuation/compactSummary.ts` | 当前结果整组替换，chat不改旧来源；`continuation/retention.test.ts`、`continuation/snapshot.test.ts` | 当前结果仍整组替换；第十六批从保留日志独立投影历史unknown/unverified，不混入B字段 |
| `continuation/legacyContinuityMemory.ts` | 结构化字段优先、false保留、summary-only兼容；同名测试 | 第十三批三枚举formatter→summary-only→reader回归通过，结构化优先及旧格式保留 |
| `continuation/legacyPermissionRebase.ts` | 锁内重读，不复活删除状态或覆盖较新根/终态；同名测试 | 所列竞争边界已核对 |
| `continuation/projectRootRebaseProjection.ts` | 组件边界与原字符串一次迁移；同名测试、`continuation/rebase.test.ts` | 所列值迁移边界已核对，不承诺文件系统事务 |
| `continuation/retentionPlanner.ts` | 阈值前计数、阈值后每次完成更新；同名测试、retention测试 | 第十五批仅初始化undefined，异常已有值不改；fresh SessionManager及双模式12轮CLI检查点通过 |
| `continuation/sessionContinuitySnapshot.ts` | 先准入分支再选结果；未知顺序不作确定性投影；snapshot测试 | 第十一批来源/排序边界通过；第十六批完整准入日志投影通过，超出recent-4仍保留历史检查提示 |
| `continuation/sessionMutationContinuity.ts` | planned/changed/verified分离、历史目标限量去重；`mutationContinuityState.test.ts` | 第十六批同文件后续验证通过解除已知旧失败；顺序、trim去重、理由、8条上限及不确定写入保护通过 |
| `continuation/sessionProjectRootRebind.ts` | 最新锁内状态、写入次序、失败观察与补偿；同名测试 | 第三至五批限定场景通过，无跨文件崩溃事务保证 |
| `continuation/sessionPromptContinuity.ts` | snapshot和模型context对同一续接词保持一致；同名测试、resumeContextBuilder测试 | 第十三批统一准入，runtime与双模式PTY验证next；无历史/新路径不自动附带 |
| `continuation/sessionReadContinuity.ts` | 读取当前结果的完整fragment/staged字段；`sessionManagerBoundary.test.ts` | 第十三批八字段重排/反序回归通过，保留每字段最新有效值 |
| `continuation/sessionRootRebase.ts` | 根解析和memory迁移使用同一目标；同名测试与rebind集成 | 薄组合已核对；空目的地由调用边界拒绝 |
| `continuation/sessionSeedInfluence.ts` | 同次completion的notes/evidence/continuation/repair诊断来源；同名测试 | 第十六批四来源冲突及逐层无效回退通过，保持首个有效标记优先 |
| `continuation/sessionToolContinuity.ts` | 最后provenance整组投影，不补前一个缺失字段；SessionManager测试 | 第十六批两个provenance回归通过；后者无taskId/failureBoundary时不借用前者 |
| `continuation/sessionUnresolvedItems.ts` | 仅汇总已准入错误/终态/验证失败；snapshot测试 | 第十六批session error→lifecycle→stopReason的非空优先级通过，独立stopReason仍保留 |
| `continuation/stoppedSessionContinuity.ts` | unknown/unverified写入要求检查，拒绝与执行失败分开；同名测试 | 第十六批结构化writer=false、inspection=false及writeEffect=none覆盖旧unknown标记回归通过 |
| `continuation/summaryFormatter.ts` | 旧结果文本整组替换，保留独立文本，结构化值覆盖；compactSummary/retention测试 | 合并已核对；第十三批seed三枚举文本往返通过 |

上述三个具体缺陷先由独立隔离探针复现，再以checked-in回归及第十三批修复闭合。
当前真实CLI的turn/projection完成结果没有codingResult；未找到生产端生成历史read-fragment、seedInfluence、toolExecutions字段的写入点。
相关手工结果与长会话fixture证明兼容消费/持久化，不证明真实工具会生成这些字段。

## recovery（11）与 replay（5）

| 原模块 | 行为判据 / 具体证据 | 审计状态 |
|---|---|---|
| `recovery/projectContextSummary.ts` | 项目聚合计数、最新会话ID/时间/标题一致；`sessionRecoverySelection.test.ts` | 第十五批两个输入顺序通过，最新无标题不借用旧标题；正常生产者目前默认ID |
| `recovery/recoveryTrustBoundary.ts` | 拒绝原因与修复提示保持明确；`sessionProjection.test.ts` | 薄投影已核对，不赋予恢复权限 |
| `recovery/resumeContextBuilder.ts` | 续接/反思筛选、边界摘要、原始请求判定；同名测试、runtime/invocation及PTY | 第十/十一/十三批交付路径通过；next沿用pathless准入 |
| `recovery/sessionLifecycleReadModel.ts` | 最新运行内配对，不跨query复用同taskId；同名测试 | 运行范围及选中分支准入已核对；scope/branch回归覆盖同taskId隔离 |
| `recovery/sessionLifecycleReconciliation.ts` | 已有resolution优先，未解决项按denied/failed补偿，不伪造成功；同名测试 | 调用者已改用同份scoped transcript；函数及shell恢复断言通过 |
| `recovery/sessionRecoveryRuntime.ts` | snapshot、准入、补偿沿owner委派；SessionManager与reconciliation测试 | 薄边界与scoped snapshot/补偿调用已核对 |
| `recovery/sessionRecoverySelection.ts` | interrupted/error才建议恢复，根偏好及拒绝理由明确；`sessionRecoverySelection.test.ts` | 第十五批带根/无根统一资格；拒绝active/completed/terminated，手动上下文恢复不等于自动执行 |
| `recovery/sessionRecoverySnapshot.ts` | 选中分支决定消息、pending、terminal、task/harness来源，修复不能复活弃用提示 | 第十二批branch/scope回归通过；含新分支、回切、缺失提示、错误来源及旧harness拒绝 |
| `recovery/sessionResume.ts` | 激活已准入对象；拒绝不依赖可选block；失败不改变调用对象；同名测试 | 第一批限定场景已核对，根迁移由外层owner负责 |
| `recovery/sessionResumeEligibility.ts` | stopped/indeterminate明确拒绝；auto仅有有效pending及中断证据；同名测试 | 线性及分支snapshot准入已核对；废弃提示不auto，新提示仍可恢复 |
| `recovery/types.ts` | RecoverySnapshot只声明恢复事实与边界 | 构建及恢复消费者通过；lastError取scoped终态 |
| `replay/builder.ts` | 最新query内repair/pair，漂移降级、保留消息结构、拒绝stale队列；同名测试 | 第十二批按选中路径输入，缺失起点向所有读模型保留修复边界；builder/seed回归通过 |
| `replay/sessionReplayFacade.ts` | 单一builder、normalize/repair幂等、sentinel语义保持；同名测试 | 薄委派已核对，第十二批通过scoped输入和修复起点消除已知来源缺口 |
| `replay/sessionReplayRuntime.ts` | replay plan和seed参数不变地委派 | 源码与SessionManager/replay测试已核对 |
| `replay/sessionRuntimeSeed.ts` | seed只由既有builder生成，无第二恢复实现 | 薄委派已核对，第十二批通过scoped输入和修复起点消除已知来源缺口 |
| `replay/types.ts` | repair context与plan消息/提示/sentinel表达一致 | 构建及facade测试通过 |

第十二批闭合已复现的操作性恢复来源缺口：26套281项、双线审查及4场景PTY通过。缺失中间执行日志保守降级，不承诺精确重建。selection/project聚合、continuation及export后续证据分别见第十三至十六批，不将第十二批证据替代完整矩阵。

## export（4）

| 原模块 | 行为判据 / 具体证据 | 审计状态 |
|---|---|---|
| `export/collect.ts` | 单次只读收集、消息/树身份连接、输入失败分类、脱敏保留关联；同名测试及exportCommandRuntime测试 | 已核对；第十四批增加重复message ID拒绝及原文件不变回归 |
| `export/html.ts` | 自包含文档、UTF-8和头部转义、flat edges无深递归；graph/collect/command测试 | gathered-payload契约已核对；base64并非脱敏 |
| `export/htmlRender.ts` | 支持的Markdown子集转义并拒绝可执行URL；同名测试 | 已核对；不承诺完整CommonMark嵌套等价 |
| `export/template.ts` | 选中路径、call occurrence配对、缺口隔离、filter/hash与长输出交互；同名测试及前次浏览器验收 | 第十四批修复并验证挂载/打开后的测量，真实浏览器覆盖长输出、展开收起及尺寸变化 |

第十四批浏览器验收闭合长输出交互缺口，VM回归增加挂载/打开状态及尺寸变化。此前4000消息验收继续只用于深树/长日志边界；不将其挪用为长输出交互证据。


## 第十六批完成边界

29套424项、build:cli、独立APPROVE/CLEAR与源码反转通过；反转两个既有owner后7失败67通过并逐字节恢复。
新增inspection投影在原始query日志通过选中分支准入后扫描，显示总记录数及最新3条来源引用；不是当前失败或已链接的解决结论。未知与未验证写入在同文件或无关文件后续成功后仍保留观察记录。
12轮检查点替换、真正appendCompactionEntry后的消息视图缩减、原始事件保留、重开和分支切走/切回均有直接回归。已知旧失败解除有公开resume入口回归；额外helper的字段优先级已直接核验。

当前运行时压缩不删除原始query事件。若外部工具或历史数据已删除事件，且后续结果又替换了唯一compact检查点，本次无法重建消失事实，不新增未经设计的持久化账本或声称具备历史结算协议。
兼容结果字段的合成测试不证明现行工具生产这些历史字段。原有跨文件事务、合作writer和浏览器支持边界保持。旧result-contract脚本的失效目标和预期留到W7-31修复，不记为本项通过。
