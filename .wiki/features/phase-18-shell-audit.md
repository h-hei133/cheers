# Phase 18 Shell 行为审计

基线 `56df129c`：`core/shell/` 根目录26个、子目录12个生产模块，共38个；原计划37个为旧清单。
路径相对 `packages/ts-shell/src/core/shell/`。本表记录具体判据和缺口；源码核对不等于完整运行验证。
W7-31仍在执行。首批聚焦审批，其余已复现问题按下表继续修复，不把局部审查结论扩展到整个Shell。

## 根目录（26）

| 模块 | 判据 / 证据 | 当前状态 |
|---|---|---|
| `approvalPromptRenderer.ts` | prompt事实和audit投影；approvalPromptBridge测试 | 所列路径源码核对，无新缺陷 |
| `approvalTrustPolicy.ts` | 项目范围、精确目标、加载、列表和撤销；同名测试 | 首批修复大小写/空白碰撞及旧键复用；保留旧授权管理能力 |
| `bootstrap.ts` | 显式会话与workspace兼容性；同名测试 | 第二批修复非Windows大小写比较；peer/nested拒绝、显式迁移和重新打开通过 |
| `compaction.ts` | 手动/自动复用、hooks、取消、切片、检查点；同名测试 | 所列路径源码核对，无新缺陷 |
| `continueShellActionRuntime.ts` | resume/continue权限与恢复资格；同名测试 | 复用W7-26恢复证据 |
| `interactiveApprovalWiring.ts` | 当前回答与后续授权分离；同名测试 | 首批移除allow-once的后续缓存写入 |
| `printPromptInput.ts` | stdin capture与CLI输入传递 | 未找到直接symbol测试；保留transport断言缺口 |
| `providerCredentials.ts` | CLI选择的provider对应连接 | 已复现active连接属于其他provider时遮蔽匹配连接，待修复 |
| `providerFailureRedaction.ts` | 未知错误的路径/token脱敏；同名测试 | 所列路径源码核对，无新缺陷 |
| `providerReadiness.ts` | readiness请求与实际adapter认证一致 | 已复现原生消息端点探测错误使用Bearer；合成HTTP证据，待修复 |
| `recovery.ts` | 恢复准入与当前分支证据 | 复用W7-26恢复证据 |
| `restoreSurfaceSummary.ts` | authority和无成功噪声；同名测试 | 所列路径源码核对，无新缺陷 |
| `runtimeContext.ts` | workspace/session/recovery身份 | 第二批修复大小写比较；target-base/requested诊断覆盖 |
| `sessionEventSurface.ts` | runtime prose/digest；runtime/boundary测试 | success字段必填；未确认新的投影缺陷 |
| `sessionFutureTurnProjection.ts` | compact注入在真实prompt提交后消耗 | 已复现durable prompt barrier失败前提前消耗，待修复 |
| `sessionPersistenceProjection.ts` | runtime持久化适配；runtime/boundary测试 | 所列路径源码核对，无新缺陷 |
| `sessionPrintOutputProjection.ts` | stopped输出和默认opt-in；同名测试 | 所列路径源码核对，无新缺陷 |
| `sessionRuntime.ts` | 取消终态、prompt barrier、未来回合注入 | 已复现缺terminal时先打印success，以及barrier前消耗注入，待修复 |
| `sessionStateSurface.ts` | session命令与stopped continuation；同名测试 | 复用既有truthfulness与恢复证据 |
| `sessionTerminalEvidence.ts` | 终态coding evidence投影 | 历史fixture有覆盖；当前turn/projection不产生codingResult，不作为当前工具写入证明 |
| `sessionTerminalState.ts` | terminal累计与输出 | 与runtime提前打印默认success关联，待修复 |
| `shellActionBridge.ts` | command router判定与blocked文本 | 未找到直接symbol测试；保留断言缺口 |
| `signalHandlers.ts` | SIGINT、idle close及恢复提示 | SIGINT已有测试；idle close/保留提示仍需核验 |
| `startupSurfaceRenderer.ts` | 启动与workspace身份诊断 | 第二批增加直接surface测试，大小写不同根不再显示同根 |
| `stateMachine.ts` | 状态转换；同名测试 | 当前调用方busy串行化路径已核对 |
| `turnBoundarySurface.ts` | 回合边界和fallback；同名测试 | 所列formatter路径已核对 |

## 子目录（12）

| 模块 | 判据 / 证据 | 当前状态 |
|---|---|---|
| `platform/types.ts` | 纯环境/backend契约，无执行权限 | 源码核对 |
| `platform/shellDetector.ts` | shell存在性及类型准确性 | WATCH：不存在的绝对SHELL被标available，任意shell标bash/POSIX；待核验修复 |
| `platform/shellManager.ts` | backend生命周期 | WATCH：进程静态状态与session表述不一致；待核验 |
| `platform/processTree.ts` | PID边界、去重、pending、all-settled；同名测试 | 复用W7-30有界清理契约证据 |
| `platform/termination.ts` | 进程组TERM/grace/KILL及Windows launcher观察；同名测试 | 复用W7-30有界清理契约证据 |
| `approval/contract.ts` | prompt/decision/response显式契约 | 源码核对，无隐含执行授权 |
| `approval/types.ts` | 替代grant类型与live store不同 | WATCH：除替代evaluator外无生产消费者，不扩展平行授权模型 |
| `approval/evaluator.ts` | read-only准入与未知语法拒绝 | 首批修复branch创建/output/helper绕过；保守正向语法集合 |
| `approval/deny.ts` | 拒绝优先于scope和自动放行；同名测试 | 所列匹配/解析已核对；首批补真实producer的空白目标拒绝回归 |
| `approval/store.ts` | 精确授权身份、旧键隔离、重载/撤销 | 首批保留原始目标，使用exact命名空间 |
| `background/output.ts` | 内存上限、spill失败与backpressure | 已确认无spill时buffer无界、忽略backpressure、错误重开丢前缀，待修复 |
| `background/tasks.ts` | output路径真实、结束前完成spill | 已确认sink失败后旧路径及spill关闭前发布完成，待修复 |

## 首批审批决策与保证边界

对照本地参考实现后采用：权限资源保留原始命令；未匹配时询问；once只回答当前请求，always才新增未来授权。
未采用命令参数大小写折叠或通用通配授权。旧有有损键保留列表/撤销能力，但必须重新确认才能成为exact授权。

Git status/diff可调用fsmonitor、external diff和clean filter；固定禁用external diff/textconv/fsmonitor仍不能阻止任意clean filter。
log/show也可能调用签名或内容转换helper。因此这些命令在ask/accept-edits下请求审批，在plan下拒绝；只保留branch/rev-parse正向参数集合自动准入。
不改写实际命令，不另建执行器。仓库配置helper已用真实registry验证拒绝前不写入、明确批准后执行。

授权键使用原始文件路径/命令字节；拒绝匹配另保留命令trim兼容，并按已知文件工具解析路径组件，不能因空白逃过protected前缀。
真实handler→hooks→registry回归覆盖write/edit的大小写、前后空格目标，以及三种权限scope下的拒绝优先级。
普通/全屏CLI验收首个allow-once后第二次同目标重新询问；拒绝后文件保留首轮内容，终态stopped与持久化来源一致。

旧result-contract脚本仍需修复：测试路径已移动、历史测试名失效，synthetic echo不能作为read/write工具证据。
本表中的待修复和断言缺口都仍属于W7-31后续工作。


## 第二批根目录身份

三个既有比较函数只在Windows折叠大小写，其他平台保留`path.resolve`的原始大小写。沿用现有拒绝、显式迁移和绑定重建流程，不引入另一个根管理器。
参考实现对session cwd采用保留大小写的resolved equality；本仓保留已有Windows兼容政策。比较仍是词法规则，不探测磁盘大小写策略或symlink别名，大小写不敏感的非Windows文件系统可能需要显式迁移。
5套56项与CLI构建通过，独立APPROVE/CLEAR；反转三个owner后5失败22通过，逐字节恢复。双模式编译PTY证明未授权迁移先拒绝且无模型请求；明确迁移后模型和实际审批写入使用新根，旧根不写入，持久化绑定/终态来源一致。产物.tmp/root-case-pty-rqhj08xe。
