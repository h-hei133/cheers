# Phase 18 Shell 行为审计

基线 `56df129c`：`core/shell/` 根目录26个、子目录12个生产模块，共38个；原计划37个为旧清单。
路径相对 `packages/ts-shell/src/core/shell/`。本表记录具体判据和缺口；源码核对不等于完整运行验证。
W7-31已完成本表38模块的所列行为审计与旧结果门禁修复。结论限于表中判据及下文保证边界。

## 根目录（26）

| 模块 | 判据 / 证据 | 当前状态 |
|---|---|---|
| `approvalPromptRenderer.ts` | prompt事实和audit投影；approvalPromptBridge测试 | 所列路径源码核对，无新缺陷 |
| `approvalTrustPolicy.ts` | 项目范围、精确目标、加载、列表和撤销；同名测试 | 首批修复大小写/空白碰撞及旧键复用；保留旧授权管理能力 |
| `bootstrap.ts` | 显式会话与workspace兼容性；同名测试 | 第二批修复非Windows大小写比较；peer/nested拒绝、显式迁移和重新打开通过 |
| `compaction.ts` | 手动/自动复用、hooks、取消、切片、检查点；同名测试 | 所列路径源码核对，无新缺陷 |
| `continueShellActionRuntime.ts` | resume/continue权限与恢复资格；同名测试 | 复用W7-26恢复证据 |
| `interactiveApprovalWiring.ts` | 当前回答与后续授权分离；同名测试 | 首批移除allow-once的后续缓存写入 |
| `printPromptInput.ts` | stdin capture与CLI输入传递 | 第八批补直接测试：BOM/CRLF、空输入、显式prompt顺序、注释政策、transport优先级与fence/literal边界 |
| `providerCredentials.ts` | CLI选择的provider对应连接 | 第四批修复：活动连接先匹配显式provider再进入原fallback；端点、模型、账号及key优先级回归与双模式PTY通过 |
| `providerFailureRedaction.ts` | 未知错误的路径/token脱敏；同名测试 | 所列路径源码核对，无新缺陷 |
| `providerReadiness.ts` | readiness请求与实际adapter认证一致 | 第五批修复：按catalog协议使用资源与认证；探测/生成共享快照和续期凭据，双模式原生HTTP/PTY通过 |
| `recovery.ts` | 恢复准入与当前分支证据 | 复用W7-26恢复证据 |
| `restoreSurfaceSummary.ts` | authority和无成功噪声；同名测试 | 所列路径源码核对，无新缺陷 |
| `runtimeContext.ts` | workspace/session/recovery身份 | 第二批修复大小写比较；target-base/requested诊断覆盖 |
| `sessionEventSurface.ts` | runtime prose/digest；runtime/boundary测试 | success字段必填；未确认新的投影缺陷 |
| `sessionFutureTurnProjection.ts` | compact与memory注入在实际kernel准入后消耗 | 第三批修复：prepare不改状态，准入前检查两类generation后同步消耗；失败重试、替换与驱逐通过 |
| `sessionPersistenceProjection.ts` | runtime持久化适配；runtime/boundary测试 | 所列路径源码核对，无新缺陷 |
| `sessionPrintOutputProjection.ts` | stopped输出和默认opt-in；同名测试 | 所列路径源码核对，无新缺陷 |
| `sessionRuntime.ts` | 取消终态、prompt barrier、未来回合注入 | 第三批修复：缺terminal先拒绝再渲染；barrier/readiness/hooks未准入不消耗；双模式PTY通过 |
| `sessionStateSurface.ts` | session命令与stopped continuation；同名测试 | 复用既有truthfulness与恢复证据 |
| `sessionTerminalEvidence.ts` | 终态coding evidence投影 | 历史fixture有覆盖；当前turn/projection不产生codingResult，不作为当前工具写入证明 |
| `sessionTerminalState.ts` | terminal累计与输出 | 第三批由runtime在调用渲染前验证terminal；另修复交互TurnSink漏显stopped完成事件 |
| `shellActionBridge.ts` | command router判定与blocked文本 | 第八批补动作身份与resume/continue区分、非交互blocked投影及无success断言 |
| `signalHandlers.ts` | SIGINT、idle close及恢复提示 | 第八批补retention顺序与嵌入式close；行模式统一SIGINT/EOF关闭，检查真实保留状态并移除监听器 |
| `startupSurfaceRenderer.ts` | 启动与workspace身份诊断 | 第二批增加直接surface测试，大小写不同根不再显示同根 |
| `stateMachine.ts` | 状态转换；同名测试 | 当前调用方busy串行化路径已核对 |
| `turnBoundarySurface.ts` | 回合边界和fallback；同名测试 | 所列formatter路径已核对 |

## 子目录（12）

| 模块 | 判据 / 证据 | 当前状态 |
|---|---|---|
| `platform/types.ts` | 纯环境/backend契约，无执行权限 | 源码核对 |
| `platform/shellDetector.ts` | shell存在性及类型准确性 | 第七批修复：已知bash/sh与校验后的PATH；任意登录SHELL不决定执行，缺失/目录/不可执行均不可用 |
| `platform/shellManager.ts` | backend生命周期 | 第七批明确当前进程scope；显式选择先验证可用性，失败不改变原选择或声称切换成功 |
| `platform/processTree.ts` | PID边界、去重、pending、all-settled；同名测试 | 复用W7-30有界清理契约证据 |
| `platform/termination.ts` | 进程组TERM/grace/KILL及Windows launcher观察；同名测试 | 复用W7-30有界清理契约证据 |
| `approval/contract.ts` | prompt/decision/response显式契约 | 源码核对，无隐含执行授权 |
| `approval/types.ts` | 替代grant类型与live store不同 | WATCH：除替代evaluator外无生产消费者，不扩展平行授权模型 |
| `approval/evaluator.ts` | read-only准入与未知语法拒绝 | 首批修复branch创建/output/helper绕过；保守正向语法集合 |
| `approval/deny.ts` | 拒绝优先于scope和自动放行；同名测试 | 所列匹配/解析已核对；首批补真实producer的空白目标拒绝回归 |
| `approval/store.ts` | 精确授权身份、旧键隔离、重载/撤销 | 首批保留原始目标，使用exact命名空间 |
| `background/output.ts` | 内存上限、spill失败与backpressure | 第六批修复：只保留UTF-8字节有界tail、单次exclusive spill，失败移除路径，反压等待与close结算覆盖 |
| `background/tasks.ts` | output路径真实、结束前完成spill | 第六批修复：动态路径、两管道暂停/恢复与独立解码；close后通知，最近100条完成记录，运行中不淘汰 |

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

## 第三批准入与停止结果

准备上下文只读取现有store；durable prompt barrier、readiness与两个启动hook完成，且未取消后，
既有turn入口在kernel.prompt前同步接纳。两个generation先全部核对，再消耗或标记无效；
同ID重置、检查点替换、异步检索期间驱逐均拒绝旧准备结果，保留当前pending供重试。
state/get与checkpoint/getLatest的对象身份契约已明确，未增加另一套store或执行器。
入核后的模型失败不会重新注入，runtime reentry不消费为下一正常回合暂存的上下文。

无terminal的流先进入错误/中断结算，不渲染默认success。
PTY还证明既有交互层漏显readiness的stopped_error：事件已持久化但屏幕为空。
TurnSink现显示实际stopReason，保留partial answer、error/notice分类和显式retry，正常成功无额外footer。
参考采用的是启动检查后再取待注入消息、终态错误与部分正文分开显示的顺序；没有复制代码。

最终14套201项、CLI构建、静态门与40项脚本测试通过；联合反转6个生产owner后28失败80通过，随后逐字节恢复并复跑。
独立代码APPROVE/架构CLEAR。普通/全屏编译PTY验证readiness拒绝、真实hook block、启动中取消均无模型请求，
成功重试携带两类上下文且仅一次，持久化终态来源正确；产物.tmp/admission-pty-ahbsjr4f。
保证限于现有同步进程内store，不承诺跨进程/跨store落盘事务；hook dispatcher既有异常处理政策不变。
W7-31的凭据/readiness协议、background、platform与直接断言缺口继续处理，旧result-contract脚本仍未修复。

## 第四批显式提供方的连接选择

显式CLI provider与活动连接冲突时，原选择器先锁定该连接、随后丢弃profile，跳过本来存在的同provider备用连接。
现于活动连接筛选时排除冲突，随后复用原fallback排序。未显式选择时仍以活动连接为准；
匹配的活动连接仍优先于更新备用连接；CLI/env key沿用匹配连接端点与模型，账号优先级不变。
不存在匹配凭据时仍缺失，不能借用其他provider的key、端点或模型。
参考采用显式provider先限定候选集合的语义；本仓保留原连接状态/账号/时间排序，没有新增选择器。
3套38项与构建通过；撤销后4失败12通过，逐字节恢复。独立APPROVE/CLEAR。
普通/全屏编译PTY使用另一provider的活动连接及显式--provider，验证实际HTTP请求仅到匹配连接端点、使用其合成凭据和模型，
并保留前批拒绝/阻断/取消/重试/一次注入/终态来源断言；产物.tmp/connection-pty-adbsriyo。
readiness协议与剩余Shell项仍未完成。


## 第五批准入探测协议

readiness复用现有endpoint声明的可选modelsPath与authorization头，默认地址来自catalog；
同一次invocation的探测与生成共享catalog快照、base URL及续期后的账号凭据。
原生消息使用版本头与key，账号令牌保留版本头；原生生成协议不再被provider标签上的账号免探测规则跳过。
显式取消立即退出，不消耗网络重试；响应体清理失败保留已收到的HTTP分类。
区域/账号签名端点没有通用model-list资源时只准入，签名与认证由实际请求验证；
探测通过不证明生成权限或模型可用，也不声称真实provider认证通过。

定向6套86项、build:ts及40项脚本测试通过。反转8个生产文件后10失败29通过，精确恢复并复跑86项通过。
独立代码APPROVE、架构CLEAR；双方指出的body.cancel错误覆盖HTTP分类问题已修复并补200/401/403回归。
静态阻断门通过，1432文件零循环；reachability7、ceiling7与docs-source120为既有advisory；
judge exit0，阻断义务满足，整体仍partial。

普通/全屏兼容协议PTY保留compact与memory的拒绝/阻断/取消后重试、一次注入和终态来源断言；
产物.tmp/admission-pty-jxazndlj。原生协议双模式PTY核对真实HTTP路径、认证头、memory保留与一次注入，
以及拒绝/阻断/取消无模型请求、成功终态来源；产物.tmp/readiness-pty-bhbuf8mv，均exit0。
全部使用本地合成HTTP与隔离home，未访问真实provider配置。

原生PTY首次尝试/compact失败（.tmp/readiness-pty-wm7w0wmn）：
原生simple body沿用stream:true，既有requestCompactionSummary却调用res.json()。
这属于现存W7-27协议字段/流边界缺口，转该任务处理；本批原生PTY不再执行压缩，不把该路径计为通过。
W7-31继续background、platform、直接行为断言与旧result-contract脚本债务。


## 第六批后台输出与任务结算

OutputSink移除重复buffer，首次溢出前由tail提供完整前缀；始终按UTF-8字节截尾并避开字符中间。
文件只尝试一次，以唯一名称exclusive创建；失败后永久移除可读路径，不把后续片段伪称完整输出。
append遇到反压返回等待，TaskRegistry暂停两条管道，drain/error/close后恢复；
stdout/stderr各自持续解码，分片多字节字符不互相污染。

进程关闭即删除控制句柄并untrack PID，随后等待日志close；结束状态与通知只在文件结算后发布。
运行中的路径投影实时读取sink，异步失败无需再来一块输出就能清除旧路径。
最近100条完成记录按完成顺序保留；运行中任务不淘汰，历史文件不删除，旧完成ID可能查不到。
沿用既有owner与执行入口；参考比较采用字节尾部、先关闭再读取文件及有界任务历史决策，没有复制代码。

5套53项、build:ts与独立APPROVE/CLEAR通过；反转两个owner后8失败5通过，精确恢复并最终复跑。
新增慢/失败stream、独立UTF-8管道、完成记录上限与真实子进程大输出回调读取测试。
静态阻断门通过，1433文件零环，旧reachability7/ceiling7/docs-source120保留；
judge exit0且阻断义务满足，总体仍partial。

普通/全屏编译PTY各4次本地HTTP请求，审批前无子进程标记；
完成通知到达模型时完整280012字节日志可读，最终消息来源匹配；产物.tmp/background-pty-5r1lnx3j，均exit0。
idle通知沿用既有队列，在下一次用户回合后投递，本批未改变其调度。
最初PTY驱动发了字面换行转义，另一次误等idle自动回合；两者均为测试适配问题，修正驱动后通过。
单测初轮两处fs mock未拦截命名导入、一次resume微任务时序断言不当；改为模块mock与实际恢复条件同步，未降低行为断言。
慢存储仍会拖慢输出生产与完成通知；无磁盘额度/运行中任务并发上限，不声称无限资源场景。
W7-31继续platform与直接行为缺口、旧result-contract脚本。


## 第七批可执行Shell选择

已知bash路径、PATH中的bash、已知sh/PATH sh按顺序核验，任意登录SHELL不再被标成bash执行。
Windows候选使用平台路径及where结果；Unix使用which结果，所有候选验证实际文件，Unix再检查执行权限。
强制选择不可用时保持原状态，/shell返回不可用而非切换成功；状态显示可用性与当前进程scope。
保留原ShellManager静态owner和registry launch/sandbox路径；参考采用验证实际shell、已知bash优先及sh回退决策。

5套54项与build:ts通过；4文件反转8失败9通过，逐字节恢复后复跑。
独立APPROVE/CLEAR；静态阻断门通过，1433文件零环，旧advisory保留；judge阻断义务满足，总体partial。
普通/全屏PTY用会写错误标记的任意登录SHELL，验证它从未执行；
/shell use wsl在Linux本地拒绝且无模型请求，随后实际审批后台命令、完整日志及终态来源均通过。
产物.tmp/platform-pty-c6ibh9s7，两模式exit0；初轮驱动未关闭status详情视图而停在视图，补上esc后通过。
Windows为确定性mock测试，未进行真实Windows/WSL运行；可执行文件存在不证明发行版或命令成功，
同步PATH查找有超时但仍有检测成本。其余直接行为断言及旧result-contract脚本继续处理。


## 第八批直接行为覆盖与行模式关闭

补齐printPromptInput和shellActionBridge直接契约测试，覆盖输入归属、BOM/CRLF、空行/注释、
显式prompt顺序、多行fence/literal、动作身份与blocked投影；不改变这些模块行为。
signalHandlers测试明确先terminate、再查询retention、最后渲染resume与退出；嵌入式close不退出host。

既有行模式分别安装SIGINT和readline.close处理器。编译基线复现idle SIGINT触发同步close重入：
terminate/exit/resume各2次，SIGINT监听器残留；且未传sessionManager，已删除会话仍显示resume。
现由原interactiveSignals持有一个关闭guard，lineLoop安装一次并传入真实manager；
关闭后删除自己的监听器，活动回合SIGINT仍走既有取消语义。参考采用先置关闭guard、按实际会话格式化恢复提示的决策。

7套46项、build:ts与独立APPROVE/CLEAR通过；两生产文件反转后3项失败，精确恢复后定向复跑。
初轮测试误用了本仓旧Vitest不支持的matcher，改为精确calls断言后确认3项行为回归均红，再修复产品。
混合终端编译CLI（TTY stdin、pipe stdout）覆盖真实行模式：空会话删除且0条resume，保留会话1条resume，
均exit0，磁盘metadata与提示一致；产物.tmp/line-close-nz63oe6y，无provider请求。
静态阻断门与judge阻断义务通过，1436文件零环，旧advisory保留、judge整体partial。
原38模块审计的直接行为缺口至此闭合；W7-31仍等待旧result-contract脚本债务修复。


## 第九批结果门禁与审计完成

旧脚本失败归类为harness/setup drift：两个测试路径已迁移，名称过滤会漏跑，synthetic echo没有执行声称验证的read工具。
保留现有npm入口，改跑六个当前owner套件，并检查JSON报告：每个指定文件必须存在、至少一条断言、全部passed；缺失、空套件、跳过与失败均拒绝。
参考测试采用隔离会话和结构化协议事实；本批同意这两项决策，进一步通过真实源码CLI子进程与本地HTTP替身执行工具，不扩展产品synthetic模式。
每轮生成仓内唯一HOME/tmp及新报告；环境使用白名单，runner日志上限128KiB，不读取真实provider配置。

新增print/replay读、批准写、拒绝写和readiness拒绝五场景。随机文件内容必须进入真实tool结果及下一次模型请求；
写入必须与审批、磁盘字节一致；终态sourceEntryId必须关联非空assistant ID。
拒绝写后模型仍返回成功文字，持久化finalOutput保留它，但terminal/surface仍为stopped；readiness失败是error且模型请求和工具调用均为零。
这是tsx源码CLI证据，不代替编译或安装产物验收；第八批已有混合终端编译CLI证据，本批不重记为新验收。

`npm run verify:result-contract` exit0：6套136项，最终报告.tmp/result-contract-Ma59Uk/tests.json；
`node --test scripts/verify-result-contract.test.mjs` 3/3，`npm run test:scripts` 43/43，构建与全部静态阻断门通过。
撤掉未通过断言检查后脚本测试1失败2通过；逐字节恢复后门禁136项和脚本3项再次通过。
独立代码审查APPROVE；架构复核提出ID相等可能同时undefined，已增加非空ID断言并复跑，架构复核CLEAR。
NormProof exit0，阻断义务满足，整体因既有advisory仍partial。

测试驱动首轮4个print超时是stdin未关闭；关闭后两项新预期不符，依现行owner修正为readiness分类error、拒绝后的模型文字从finalOutput断言，未改产品行为。
第八批eaab164d的CI37141669601失败：537套通过、1套失败，5056通过、1失败、1跳过；原因是interactiveLoop旧mock缺sessionExists而关闭抛错。
本批补齐mock并断言一次exit及SIGINT清理，2项定向通过；Architecture Watch37141669607成功。

W7-31至此完成；后续27→29→33及剩余W8继续。原生摘要的流模式问题仍归W7-27，未计为本批通过。
