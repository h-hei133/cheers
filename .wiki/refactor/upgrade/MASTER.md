# Runtime development -- Progress Tracker

> **Task**: 核实研究规划，实施仍然成立的任务，并按实际生产路径验收。
> **Started**: 2026-11-14
> **Last Updated**: 2026-11-22
> **Mode**: Linux validation and GitHub CI

## Scope and authority

本轮范围是用户指定的三份 2026-11-13 研究文档的规划任务，包含 A–F、B2、F1/F2、Track 1–6，以及深度审计中的缓存、工具与运行时条目。原文是待核实的研究输入，既有提交标题和接口存在不能直接证明完成。原文明确“暂缓／按需”的工作保留原条件，不能偷偷列为完成。以当前代码、实际消费者、测试和 Linux 原生证据逐项裁定；不以完成上一轮修复替代整个目标。

只修改 Cheers；参考目录只读，先查本项目再比较相应参考决策。产品保持 TypeScript、单一执行边界、既有配置与权限契约；新模块使用本地职责名称，不引入参考项目品牌。原研究文档和不可变历史保留来源，新增实现与记录使用中性命名。

此前未提交修复起点为 `acb617cb`，207 个现存变更文件、11 个删除文件。起始哈希已保存在本地证据目录。按验收批次提交，当前批次包含主分支推送和远端 CI。

## References

- [Task inventory](tasks.md)：唯一任务与验收清单。
- [Design and evidence](design.md)：结构事实、参考决策、复用与实施顺序。
- [Earlier repair evidence](../../wiki/references/runtime-upgrade-review-2026-11.md)：上一轮证据，不能替代本轮任务验收。
- [Progress summary](summary.md) 记录当前验收、开放任务和仓库门禁结果。
- [November follow-on roadmap](roadmap-tasks.md)：独立追踪 2026-11-23 用户指定的模型、配置、缓存、安全、交互与发布任务；不计入下方既有 62 项。

## Current status

**Current phase** 56/62 项通过 Linux 本地功能验收，6 项开放。
**Completed batch** E.7 已通过编译版 CLI 和 SDK 验收。T5.1 已验证普通创建、分叉发布和根重绑。详见 [任务清单](tasks.md)。
**Open work** C.6、E.3、F1.2、F1.4、F2.1、T5.1。当前会话事务沿用多文件布局。迁移单文件格式前须保留旧转录、字节预算、前缀身份和命令环境中的转录路径。外部资格缺口见 [进展摘要](summary.md)。
**Repository gate** 本批通过六项静态检查、聚焦回归、221 项脚本测试及 Linux 构建 `a647c4d303d7`。固定归档结构判定为 `proven`，开放义务为 0。续接顺序见 [进展摘要](summary.md#后续工作)。
**Evidence boundary** 本批原生证据来自隔离 Linux 进程和本地 stdio。配置模型和账户证据见 [进展摘要](summary.md)。
**Validation**: 只在 Linux 侧；子代理只读或编辑，所有安装、构建、测试、门禁与真实模型调用由主线程串行执行。真实模型使用已配置凭据的原生入口，报告不包含秘密。

## Governance

规则源为根 `AGENTS.md`、`agent-rules/`、全局 RTK；`CLAUDE.md` 指向根规则。可复用陷阱追加根 `HANDOFF.md`，不把本任务状态写成全局规则。不写用户未授权的 native memory。

使用 spec-driven 工作流的核实、分解、实施和验收结构。用户已明确授权核实后执行，项目要求常规可逆工作自主推进，因此阶段检查记录在清单，不重复请求执行许可。进度目录复用 `.wiki/refactor/upgrade/`，不另外建立重复的 docs 清单。高风险契约修改在主线程验证后做独立只读复审。

## Completion rule

所有仍然成立的必需任务均需实现和相应范围的当前证据；“代码已有但未验收”“部分完成”“证据不足”都不算完成。研究结论被反证时记录具体消费者与理由，不为删除任务而缩小目标。缺少某一家服务或人类授权时继续其他独立工作，保留该项状态。Linux 证据不扩展为 Windows 或全平台验证。每批更新 tasks 和本文件；总目标只在逐项审计通过后关闭。

## Adaptive control

E.6 controlled CLI reload实际L，复用10/10，原commands/lifecycle/retirement/queue/UI保持，无新依赖。未预见依赖6（microtask前source捕获、partial错误、cancel原shutdown、共享retirement、旧outer退休、close同步重入）；源码审查缺口各实际red后修，10反转10AssertionErrors/exact恢复。CLI当前只Linux资格，SDK owner仍独立开放；normaljudge not_proven保持，不补造统一drift数字。

E.6 initial startup实际L，复用10/10，原input／queue／UI／lifecycle／invocation owner保持，无新依赖。新增未预见依赖4（slash control绕过、live child steer、line EOF先cancel、cleanup不能覆盖primary error）；两限定复审、六实际反例红后修，7有效反转exact恢复。native GET误拦截／Python basename／PTY proxy／isolated scratch误用保留为probe失败。36/62、26开放，full E.6与goal保持active，不补造历史drift数字。

E.6 CLI replacement实际L／复用10/10，原commands／guarded activation／service／queue／state lock不分裂，无新依赖。新增未预见依赖6（quiesced分类、retirement join、activation capture前target lease、postread owner、RPC abort chain、startup queue/UI投影）。逐个真实反例修复、14有效反转exact恢复，first source CLI timeout原suite重验passed；isolated目录与observer/handler assertion误用分别保留。只接受本batch范围，36/62、26开放，initial startup/reload/result继续；不补造统一历史drift数字。

E.6激活前置实际L，复用10/10，原registry/state锁／atomic writer／resume/readback owner保持，无新依赖或事务系统。额外依赖4项：fsync/rename取消、admission自重入、load期间同id再激活、final read后撤权；均实际red后修。首probe在锁内再setter自死锁与named fs import spy缺syncBuiltinESMExports为fixture误用，已修并重验；源码窄化调整导致首reversal代际失效记录历史，最终9/12exact通过。36/62与goal active不变，switch本体未验收；metadata partial和normaljudge容量not_proven保留。

当前Linux功能验收任务数为32/62，包含T1五项、A四项、B.1/B.2/B.3/B2.1/B2.2/B2.3、D.1/D.2/D.3/D.5、E.2、C.1、C.2、C.3、C.4、C.7、C.8、C.9、E.5、E.1、F2.2、F2.4和T3.1；核实不计实现完成，仓库NormProof容量阻断单列。T1已提交`a8ffe683`，A写入批次已提交`e58d8786`，E.2已提交`43edd014`，D.2已提交`9c683208`，输出已提交`28ffb9e7`，参数/端点旧修复已分别提交`24a23997`/`a410eab2`，writer已提交`6e1e3eb4`。结构复核为单一发布/执行owner、无新增循环、入口共享代际。原路线图其余任务未删除，继续按每批反例、实现、验证、复审和本地提交推进。

恢复时已核对干净工作区与`560c0cc4`。T3.1 compact仅持有controller、不登记settlement，且只凭状态机拒绝重入；该缺口经源码核实仍成立。复用原commands owner登记完整压缩操作、保持忙时拒绝，覆盖prompt／command互斥和SDK dispose等待；不建立第二任务管理器。C.1完整路由由独立只读核实线检查，后续独立实施；已有证据不扩展为新构建的重新验收。

本批遥测：实际L；结构复审10/10，复用SDK／command／runtime／scheduler原owner，没有新运行时或依赖库；新增未预见依赖2（取消回调失败边界、goal scheduler空闲判断）。此前未记录统一估算／数值基线，不补造历史delta或累计drift；后续C.1按已核实的完整目标重绑定和会话注册依赖拆批，先完成物理目标捕获，再实施session-owned注册和持久状态。

摘要目标子批遥测：实际L，复用检查10/10，新增未预见依赖2（显式角色renewal的消费者准入、成功rotation共享结果归属）。复用原压缩进度、预算、凭据renewal及connection owner，不修改auth core。下一批提升既有codemode分支store为session owner，使用隔离namespace和原捕获lease，避免建立平行持久化路径；注册和正式路由须在这些前置合同成立后启用。

分支store子批遥测：实际L，复用检查10/10，新增未预见依赖2（无输出的read-key验证、准入同步重入）。单coder负责既有owner提升，主线程捕反例／串行验证，限定独立审查发现重入后两红修复。正式router应将同一个状态键加入写CAS；分开的assertCurrent与commit不能被宣称为原子读写事务。下一注册批复用catalog contribution与扩展代际，virtual元数据不伪造physical auth。

虚拟注册子批遥测：实际L，复用检查10/10，新增未预见依赖2（VM data跨realm显式捕获、调用方可变signal／options身份）。复用原loader generation、contribution和snapshotData，默认JSON准入不变。初9断言红、复核6红及observer补1红后修；首轮reload占位host、AbortError文案、native reload cause和CLI slash路径夹具错误分别记录。E.7由缺口转部分，完成总数保持21/62。

逻辑路由子批遥测：实际L；结构复用检查10/10，复用原session model／branch store／provider／compaction／loader owner，不新增运行时或依赖。新增未预见依赖3（显式delegation的logical隔离、内部retry实际dispatch身份、file callback的realm／UI结算边界）；D.1旧messages另立后续批次。测试／原生证据及限定独立审查通过，C.1勾选为本地完成，22/62。先前无返回的代码lane仍记录unavailable，不作为批准来源；当前代码APPROVE来自新独立8-owner复核。未补造统一历史drift基线。

RPC读取子批遥测：实际M，结构复用10/10，新增未预见依赖1（真实CLI override的provider/model配对）；复用现有存储reader和RPC宿主，新增本域read owner，不建立缓存或并行持久化。原工具输出／usage汇总语义不改；D.1由确认缺口转部分，22/62保持。

RPC fork子批遥测：实际M，复用10/10，新增未预见依赖1（helper resolve至consumer之间的microtask准入）。保持原branch/fork与history version CAS，read owner传递原lease，无新增存储或执行平面。完整D.1命令审计新增确认bash／abort_bash宿主未接入，单独后续实现，22/62保持。

RPC shell子批遥测：实际L；复用检查通过原gate／commands／capture／report／branch store六个owner，不新增依赖、执行平面或转换消息类型。额外依赖3（部分started事件写入结算、branch校验的有界读取、navigate_tree全操作busy）；独立审查发现均有真实反例并修复。只承诺新lease读取上限，旧event／message writer同步读取未整体有界；branch check加普通addTurn不提供跨进程原子性。D.1其余命令待联合资格审计，22/62保持。

RPC设置／发现子批遥测：实际L；复用检查10/10，沿用配置publication、effort capability／endpoint budget、command invocation、skill catalog和原JSONL response join，无新loader或执行平面。额外依赖3（保存后的完整publication、应用callback换代、异步发现到最终响应的准入与取消）。project默认覆盖显式user值的推断被反证，保留原优先级；实际launch／显式config输入差异如实报告。下一批只接原retry等待的取消归属与compact command admission，不重建重试或压缩引擎，22/62保持。

RPC压缩控制子批遥测：实际M；复用10/10，原session commands／compaction／JSONL owner不变，无新增生产依赖。两处原生夹具错误分别为缺少合法旧prefix及旧compaction事件名，保留失败记录并修观察器，不修改压缩切点／持久化规则。retry所有权独立实施；22/62保持。

RPC重试取消子批遥测：实际M；复用原retry wait、kernel run signal、TurnInput和CLI就绪代理，无新重试引擎／执行平面或生产依赖。额外依赖2（retry_scheduled发布前所有权、就绪输入转发）；真实CLI首先证明仅接runTurn不足，补代理后重建并重跑。已接收SSE不重放是既有合同，错误重试夹具修为pre-response网络失败并另验accepted stream。配置模型实际请求通过，但没有主动制造真实服务限流或读其body；失败取消证据来自本地HTTP及聚焦测试。按用户要求此批后暂停，D.1联合验收及其余40项保留。

RPC整项遥测：实际L，复用检查10/10，未增加依赖或执行／存储平面；额外依赖4（严格输入隔离、最后读取准入、完整活动投影、共享generation的caller活动）。原架构WATCH有真实反例并修复；无结果的旧代码review lane记unavailable，最终APPROVE来自新独立12文件审查。此前没有统一数值估算，不补造历史drift。

C.4／C.7子批实际L，复用normalizer／usage history／captured rates／cost report与原projection／compaction owner，结构检查10/10，无新依赖、执行或存储平面。额外依赖3：缺失字段presence、旧cost消费者夹具、同代native observer接受清退。模型恢复发现C.1既有显示回归，单独commit；C.4研究结论不成立仍做有效反转及真实消费者。未补造历史估算／drift数值。

E.5本批实际L／额外依赖3（blocked publication独立撤权、原共享host消费、签名与npm当前安装），C.8实际M／额外依赖1（caller可变schema指纹与成本）。复用检查10/10，原UI binder／ConfigState／discovery digest和guard保留，无新增库、执行或存储平面。counterexample／独立review／最终serial receipt均绑定10source hash，原构建保持历史；未补造统一drift数字。

## Session log

| Date | Evidence and next action |
| --- | --- |
| 2026-11-22 | `13b40efe` 完成分叉目录发布和转录字节校验。`7cbad149` 修复两处断链，普通创建复用暂存发布，根重绑使用 v5 注册表回执。`374b21a0` 验证安装 worker 准入、实时消息渲染和精确 stdio MCP 撤权，E.7 完成，56/62。 |
| 2026-11-21 | `e72fad7` 提交受保护恢复的注册表回执与读取快照。`e5f9a28` 提交 SDK 扩展 MCP 隔离、受控重载持久设置及网关快照归位。联合六项静态检查、23 文件 331 项、Linux 构建 `bd359e1bca57`、固定归档结构判定 `proven`。两项继续开放，55/62 已验收。 |
| 2026-11-21 | Batch 4 完成 E.4 Codemode 确定性重放（环境/源码/输入绑定、固定时钟与种子 PRNG、有序只读目录 RPC 追踪与副作用零重派发），并修复全量同步模型目录元数据上限与 worker `execArgv` 隔离缺陷。六门、7 套件 126 项、build `d853f94c600c`、三进程编译产物重放/漂移测试、配置模型真实 `record`→`replay_id` 逐字节一致实测与 `normproof judge` `proven` 通过；51/62 完成，11 项开放。 |
| 2026-11-21 | Batch 3 完成 T5.1 其余多文件记录事务（v3：`addTurn`/`markRunStarted`/`markTurnActive`/`markRecoveryReentry`/`saveTerminated`/`updateSessionWorkspaceBinding` 统一复用 `prompt-transaction.json`）与 T5.2 旧格式转录迁移及回退（`SessionManager.migrateTranscript`）。六门、11 套件 231 项、build `8a49bf947565`、Linux 编译产物多进程恢复/迁移验收与 `normproof judge` `proven` 通过；50/62 完成，12 项开放。 |
| 2026-11-21 | Batch 1 (`d49c2ab0`) 落地离线 Node 20.3 `completion-gate` 固定产物并下沉 `PermissionScope` 至 `core/shell/approval/scope.ts`，默认 `normproof judge` 转绿为 `proven`（0 open obligations）；Batch 2 合并 OpenRouter 浏览器授权密钥（F1.4 部分），六门、8 套件 274 项、build `924191a436aa` 与 `normproof judge` `proven` 通过；真实人类同意仍缺，F1.4 保持开项。 |
| 2026-11-19 | C.5本地功能验收，27／848、七静态门、十一反转13AssertionErrors／exact恢复6／138、buildecdb41348d63、Linuxcompiled13／34加sourcewarm2POST、Node20.3禁生成compiled13／34及安装15入口strict／12场景32POST通过；两独立限定APPROVE，旧广审无报告unavailable。配置模型auth零requests、默认judge容量not_proven；36／62、26开放，下一E.6typed内核事件与settlement，按批本地提交不push。 |
| 2026-11-18 | 核实此前 30 个开放项，三个生产批次完成验收并本地提交。最终 35/62，下一批 C.5。基线和当前图均超出锁定容量，当前配置模型鉴权未完成。 |
| 2026-11-17 | E.5／C.8最终25文件355项／七门／0monoliths、build89344ffebd35、UI三反转／串行4/29恢复和发现三反转／2/22恢复passed，两限定独立APPROVE及10hash匹配；当前npm15入口strict类型、实际async TS／签名安装共享host两模式、配置模型8actual发现请求passed。29/62功能验收；33任务及默认NormProof not_proven保留，继续E.1／E.3，不push。 |
| 2026-11-17 | C.4／C.7当前21文件933项、六门、七有效反转exact恢复／恢复4/61、build0247cb1b526d与13源码独立APPROVE；Linux配置模型21实际请求／10轮、真实read保留／重开／显式pruning／实际compaction commit passed。27/62功能验收，35任务／NormProof容量缺口保留；模型恢复另批提交，继续E.5／C.8，不push。 |
| 2026-11-16 | C.9／C.2当前18源码hash及build `ceabe4b89b3d`核验，六静态门28/482、六有效反转exact恢复、0生产monoliths、Linux21场景／53本地POST、两模式PTY exit143及配置模型3actual请求passed，限定APPROVE／CLEAR。25/62仅指Linux功能；正常NormProof exit2／not_proven，基线16484／当前16511边均超过16384，诊断不升级为门禁。归档upgrade-output-stream-2026-11-16并本地提交；C.7四旧cost夹具REQUEST_CHANGES待实际分类，不push。 |
| 2026-11-16 | D.1最终build `43da5c29fee3`六门34/912、七反转exact恢复、恢复3/110、Linux七组55本地POST与四配置模型请求passed；原共享overflow WATCH先红后修，当前架构CLEAR／新独立代码APPROVE，23/62与active。归档后本地提交；C.9真实退出反例和C.2当前capture反例在隔离树继续修复，不push。 |
| 2026-11-15 | 设置／发现已提交0caf82c；compact控制／结构化结果4/43、六门、三个反转exact恢复、build `1a9b082e419d`和限定APPROVE/CLEAR通过。Linux三loopback POST取消／reuse／EOF与两次配置模型请求／durable commit passed。原native夹具失败保留，证据upgrade-rpc-compaction-2026-11-15；22/62不变，继续retry专属取消，不push。 |
| 2026-11-15 | shell已提交c10c5291；settings／thinking／commands当前11/200、发现最终3/29、七反转exact恢复、六门、2646模块0monoliths、build `119bed2092d3`通过，限定APPROVE/CLEAR。Linux两loopback POST与配置模型一次actual请求、effort／skill派发、同会话重开／配置优先级／EOF全passed；证据upgrade-rpc-settings-2026-11-15。D.1仍部分，22/62；继续retry专属取消与compact控制，不push。 |
| 2026-11-15 | RPC fork已提交b1d46c3；shell／abort接通原owner，六门13/227、最终3/59／恢复5/68、五反转exact恢复、0monoliths、build `90499a5f654c`通过，限定复核APPROVE/CLEAR。Linux当前CLI两loopback POST与配置模型一次actual请求、组合归档／排除／重开／fork／取消／EOF全passed；证据upgrade-rpc-shell-2026-11-15。D.1仍部分，22/62，按批本地提交不push。 |
| 2026-11-15 | RPC read已提交5ded288；fork／commands子批七反例红、六门6/65、五反转、0monoliths、build `8f67e032b1c9`和Linux三POST session/model/tree/busy矩阵passed，限定复审APPROVE/CLEAR。D.1 bash／abort_bash待接入，22/62保持，按批本地提交。 |
| 2026-11-15 | C.1已提交d8189ac；D.1当前读取子批十二反例先红，六门4/33、三反转、0monoliths、build `545e59e9f16a`、Linuxlogical／physical两进程真实JSONL及两POST通过，限定独立双lane复核通过。本地22/62保持，待提交后继续session／tree／error联合验收。 |
| 2026-11-15 | C.1逻辑选择／生产路由完成当前六门39/840、十反转、0monoliths、build `083b3d78d8bf`与Linux公开SDK／CLI／摘要／重试／RPC限定矩阵及4次配置模型POST；证据归档upgrade-virtual-routing-2026-11-15。架构CLEAR、限定独立代码复审APPROVE，本批待本地提交，C.1完成22/62；D.1 get_messages旧快照已由普通physical对照证实，下一单独修复。 |
| 2026-11-15 | 分支store前置：基线8断言红，重入补2红后修；最终六门8/247、0monoliths、build `7bcb4574ea2a`，五反转exact恢复，限定复审CLEAR。Linux同代三进程重开/分叉/实际worker namespace隔离和冲突拒绝passed。证据`.omx/artifacts/upgrade-branch-store-2026-11-15/delivery.json`；无新增provider调用，21/62保持，继续注册／路由consumer。 |
| 2026-11-15 | C.1摘要目标子批六门、15/246、0monoliths、build `9e91decd500a`与五断言反转通过；限定复核CLEAR。同代Linux内部自动／overflow／role均route一次，公开SDK配置模型两次bodySent完成prompt／compact。原生前两次夹具先触发threshold而非overflow，失败receipt/source保留；最终只扩大overflow物理窗口并核对首POST拒绝。证据`.omx/artifacts/upgrade-summary-target-2026-11-15/delivery.json`，C.1/E.7开项、21/62保持。 |
| 2026-11-15 | C.1物理目标子批六门、15/297、0monoliths、build `3ff7e7c3ad7b`和同代Linux内部compiled route／公开SDK配置模型一次请求通过；六反转实际断言红且exact恢复，限定复核CLEAR。最初candidate反转触发普通拒绝而未到断言，收紧成功断言后重跑六项；初日志保留。当前21/62，继续摘要fallback／session注册／分支状态；T3.1已提交`d683a3d`。 |
| 2026-11-15 | 恢复后T3.1本地完成。compact和取消／idle完整等待，goal scheduler尾部反例修复；六门16/236、0monoliths、build `d9acacbc4260`及同代隔离安装15入口／严格类型／四次配置模型请求passed。四反转red且exact恢复，限定独立复核CLEAR；21完成／41未完成，继续C.1，按批本地提交。 |
| 2026-11-15 | 用户要求在手子批完成后暂停。SDK loader／dispose已提交`c8d14775`，6/34、六门、0monoliths、当前编译原生能力撤权／后继保留通过，build `1787d90736d1`；两个实际反转红且exact恢复，限定复核CLEAR。记录20完成／42未完成，提交暂停总结；不进入compact／虚拟路由后续任务，不宣称push／CI或整体完成。 |
| 2026-11-14 | 四条只读核实线完成初步盘点；研究中的部分“缺失”已过期。14 个公开子路径实际导入全部 ERR_MODULE_NOT_FOUND；确认构建交付缺口。T1 开始实施；其余任务保持待实施／待验证。 |
| 2026-11-14 | T1五项本地验收完成，生产build `b57986b62aa3`；210脚本、Node20.3 65定向项、隔离安装15入口/严格类型/SDK/资源/worker与Linux原生prompt通过。独立复审只覆盖T1；继续A，不关闭总目标。 |
| 2026-11-14 | 用户要求每批完成后提交。T1从暂存内容导出独立检查目录，六静态门、生产build `fa4c37d23706`及55项相关脚本通过；补纳入新lint检测出的既有不可达yield删除。首次独立夹具遗漏workspace-local依赖导致编译失败，补齐原锁定依赖后重验通过，非产品依赖故障。 |
| 2026-11-14 | T1提交`a8ffe683`；A独立暂存树9/255、五静态门、build `b217b2736927`通过，含真实原生patch写前拒绝与选择封存；A.4独立复审CLEAR。B2/E.2首次局部green后复审发现新增反例，保留未提交状态修复；C仍缺实际消息/声明消费者。 |
| 2026-11-14 | A提交`e58d8786`；E.2复审两反例修复，独立暂存树5/80、五静态门、build `d3279f86c0e7`与两个Linux进程的持久化/重启/多级fork验收通过，独立复核CLEAR。 |
| 2026-11-14 | E.2提交`43edd014`；D.2独立暂存树6/117、五静态门、build `0d399d72cbe2`通过，宿主按职责拆分满足函数上限，独立复核CLEAR；尚未接入的bash RPC及其他规划继续保留。 |
| 2026-11-14 | D.2提交`9c683208`；A.3独立暂存树14/119及read消费者2/27、五静态门、build `961a0cc7dfe6`通过。Linux编译产物8MiB输出归档大小/摘要及原生read通过，单行读取夹具按现有50KiB边界修正。继续缩小旧修复工作区，不增加新的并行生产修改。 |
| 2026-11-14 | A.3提交`28ffb9e7`；流式参数修复独立暂存树2/172、五静态门和build `cc6f429b3e71`通过。保留原始工具参数、删除未消费修补解析；F1.1实际预览仍开项。B2限定复核CLEAR，另补键盘协商期间paste原始字节反例待验证。 |
| 2026-11-14 | 流式参数提交`24a23997`；端点路由独立暂存树2/26、五静态门和build `3a0b1baf2323`通过。B2新增协商期paste两项真实红例，交回输入owner修复；仍串行验证和小批提交。 |
| 2026-11-14 | 端点路由提交`a410eab2`；B.2独立暂存树4/107、五静态门、build `85c4ef80b41d`及真实Linux受阻/关闭管道、SIGTERM、PTY验收通过。B2新增粘贴/协商边界修复待最终验证与复审；不扩大其他编辑面。 |
| 2026-11-14 | B.2提交`6e1e3eb4`；D.5独立暂存树4/66、五静态门、build `9ad07e84b0db`和Linux离线Chromium真实存储/HTML计量投影通过。B2精确新增边界10红/1通过，继续最小输入owner修复，其他批次仍按已验证范围提交。 |
| 2026-11-14 | D.5提交`46b80eec`；账户codec清理独立暂存树19项、五静态门、build `3a18c732b2d1`通过，既有正常凭据消费者保留。继续设备登录批次和终端关闭复核。 |
| 2026-11-14 | 账户清理提交`1d5ee319`；设备登录复审发现headers deadline缺口，主线程反例失败后修复，独立暂存树6/191、五静态门、build `810b9a19a4c4`通过。设备真实人类同意/续期未发生；F1.4继续开项。 |
| 2026-11-14 | 设备登录提交`d81e4f86`；B2.2独立暂存树11/166、五静态门、build `64e760e74bd1`和两条Linux实际PTY输入路径通过，限定复审CLEAR。新增红例覆盖paste/截止/DA1归属；PTY首次夹具误用旧协议状态名，按实际enhanced契约修正后通过。继续按批收拢图片和连接，不关闭未实现任务。 |
| 2026-11-14 | B2.2提交`b607fd6`；图片最终准入/原生缩放独立暂存树11/315、五静态门、build `6d1d1be8347f`通过。复审新增JPEG别名两反例先红后修，限定复核CLEAR；连接SSE fallback取消和tracing carrier另有实质缺陷，按批先反例后修，不借旧green完成任务。 |
| 2026-11-14 | 图片提交`260e549`；连接独立暂存树6/75、五静态门、build `b4e5995ee59a`通过，新增真实SSE fallback两反例先红后修，限定复核CLEAR。继续tracing失败隔离和扩展批次。 |
| 2026-11-14 | 连接提交`df99ff0`；tracing实际消费者与失败隔离最终独立暂存树9/70、五静态门、build `2c8cce9867b8`通过，11个补充反例先红后修。作用域检索剩余核实保持F2.5开项；扩展reload在途确认另有反例，下一批处理。 |
| 2026-11-14 | tracing提交`783c2836`；包元数据本地命名独立暂存树3项、五静态门、build `55f4520a8ef4`通过；准备扩展基础在途reload修复。 |
| 2026-11-14 | 包元数据提交`16baff4`；扩展基础独立暂存树8/46+turn4/114、五静态门、build `63c53a330913`通过。在途reload确认先红后修，复核CLEAR；SDK配置UI重绑定仍WATCH，接着收拢hyperlink/RPC/terminal UI。 |
| 2026-11-14 | 扩展基础提交`a66e16de`；超链接独立暂存树8套件601项、六静态门、build `6a9bc408aeed`通过，实际regular/fullscreen宿主均传递捕获能力，独立复核限定CLEAR。RPC新增配置／会话转换后UI失效BLOCK，保留未提交并新增生产JSONL反例；B2.1全协议验收仍开项。 |
| 2026-11-14 | 超链接提交`2f186ae`；D.3新增六项中四红／两绿，修后独立暂存树6套件47项、六静态门、build `16aec298a055`和当前编译产物Linux JSONL改配置／新会话／EOF通过；限定复核CLEAR。终端UI录制遗漏两模式先红后修，20项相邻测试通过，待独立暂存整合。 |
| 2026-11-14 | D.3提交`9dd3d65`；B2.3独立暂存树6套件497项、六静态门、build `22b63f350222`及实际regular/fullscreen PTY通过，录制隐私新缺陷复核CLEAR。C.3/C.6 owner与参考决策只读交接完成，仍需生产实现，不计完成。 |
| 2026-11-14 | B2.3提交`bd1f2f9`；loop优先级独立暂存树4套件111项、六静态门、build `1e9c526087ec`通过，限定复核CLEAR；既有反转回执中两项队列断言确实失败。C.1真实配置模型与其他hooks验收仍开项，不能以本小修勾选。 |
| 2026-11-14 | loop提交`7ad89c3`；命名整理独立暂存树六静态门和3套件71项通过，行为未改，提交`1aa588b`。保留第一轮审计为有日期的证据快照并链接当前清单；HANDOFF保留已提交顺序，仅追加遗漏的三条既有护栏，不提交历史重排。 |
| 2026-11-14 | 消息基础类型拆层：provider叶合同、agent身份及durable兼容类型分离。六静态门、4套件85项和build通过。独立复审指出新增core→context类型依赖，实际测量合同移回core/agent/request后，循环／lint／build重验通过、限定复审CLEAR。此批不含custom行为，不增加16项完成数。 |
| 2026-11-14 | custom持久化／显示：保存、重开、分叉、隐藏正文与data分离、版本化导出及失败live状态通过13套件280项，六静态门通过。独立复审补充role accessor、有限数预算、tree隐藏正文和contextSummary误排除四个实际红例，修复后限定CLEAR。联合构建首次发现泛型断言错误，纯类型修正后build `094220828813`通过；原失败保留。C.3转换／SDK仍未实现，不增加完成数。 |
| 2026-11-15 | 前台转换／SDK：prepareRequest后捕获raw与provider，system文本进真实system字段，转换内容参与工具/图片/预算准入；相同raw重试复用capture、替换raw重新转换并换requestId。SDK idle追加覆盖完整settlement，普通native Promise取消后保留late rejection观察。复审新增数组/Promise钩子、system丢失、早取消和settlement等反例先红后修；Promise附属async context符号不被误拒。12套件391项、六静态门、函数上限、build `48bafd6fec4c`和Linux编译SDK实际配置模型三次wire通过，限定复审CLEAR。诊断夹具跨root配置失效、global fetch未观察Undici发送及错误私有符号均保留失败分类，最终用实际bodySent观察重验。C.3压缩/rewind一致性与C.6仍未完成，16项完成数不变。 |
| 2026-11-15 | 摘要转换：manual/automatic/prefix/merge/branch复用有界converter、complete body preflight与获准capture。7个集成红例及byte/changed-identity unknown/nav取消红例修复，18套件326项、六静态门、函数上限、build `5e1c8ee4afbb`通过；限定复审CLEAR。Linux当前编译SDK实际配置模型3次摘要（manual两段、branch一次）及verified manual publication/取消零派发通过。首次native夹具假定单段导致计数失败，实际消费者全通过，修正计数后重验并保留失败日志。旧含秘密target identity不复算；无法映射的legacy unknown/无材料墓碑保守拒绝新capture，旧记录不迁移不删除。实际增加legacy兼容和navigation signal两个必要依赖，owner复用/单ledger成立；C.3 threshold/候选缩小仍开，16项不变。 |
| 2026-11-15 | C.3转换主请求接线：复用已捕获完整request决定threshold；候选完成转换、预算／字节限制和live／durable准入后才发布；forced overflow按下一closing合同生成并直接消费capture。修复refresh丢live fence、native retries、transient diagnostics及重复checkpoint marker差异。17套件446项、六静态门、函数上限与build `fed3b0f8c0d2`通过；限定独立复审CLEAR。当前编译SDK配置模型7次bodySent覆盖automatic/manual/rewind/reopen/取消零派发，隐藏raw未送出。首次storage夹具错误给无参数SessionManager传目录且遗漏prompt barrier，修正隔离和实际barrier后重验；native首次转换规则误把历史自动prompt作为当前请求，限制观察阶段后通过，失败日志保留。普通无converter/custom请求仍走早期policy，C.3保持部分、总数16；下批接通后再做完整验收。 |

| 2026-11-15 | C.3压缩policy：完整caller/source在prepare前惰性捕获、raw source切点、重建完整candidate后一次prepare与缩小比较、candidate/authority双准入和当前policy进度。独立HEAD新增反例15失败/3通过；独立批次8套件160项、六静态门、build `c0a48b5abd86`通过，限定只读复核CLEAR。标准metadata/origin等应用字段比较补齐，仅忽略storage id/timestamp。最初build夹具node_modules符号链接触发既有保护，改实际目录后通过。主请求调用方尚未接通，16项验收数不变。 |

| 2026-11-15 | C.3请求准备层：提取完整route/system/tools/images/closing/budget/body capture，initial loop projection复用，candidate raw先route再转换，accepted body直接send；动态声明单次refresh，发送前漂移原attempt确认未发送。独立复审新增旧overflow refusal与发送后用途/模式/计费owner修改两BLOCK已修复；5套件199项、六静态门、build `0a240477cfd4`通过，限定复核CLEAR。只交付准备接口，主请求threshold/live publication尚未接通，16项验收数不变。 |

| 2026-11-15 | 普通请求完整capture：不再用选择模型的早期policy压缩实际路由请求；实际小窗口完整system开销、candidate raw归属及goal closing/provider分离通过。独立复审的大→小effort fallback和refresh通知两反例先红后修；每次有效准备通知bare capture，原live fence继续约束重试/发送。六静态门、16套件356项、build `c7e760063e80`通过，限定复核CLEAR。当前编译SDK配置模型6次bodySent、普通自动压缩持久commit及重开通过。首次原生过小window、55s多段摘要截止和不存在的内部字段为探针失败，保留回执；最终只调fixture历史/窗口/时限，未修改生产边界。工具发现两夹具在独立HEAD同样失败，显式full模式单独提交`dae1b97`。实际M，额外依赖1（latest capture通知），单一owner/无新循环；16项验收数不变，C.6继续开项。 |
| 2026-11-15 | C.6数据／持久化首批：完整版本化工具／target／mapped effort和空文本system载体，strict inert JSON及append-first，双向codec保留字段／ID／顺序。公开write边界三红例已修复；六静态门、5套件93项、build `cd08cabeb2bf`通过，限定独立复核CLEAR。初次两夹具失败为旧createNew对象，调整当前loaded观察后仍保留独立reopen／fork；错误npm筛选启动不计红。实际L，额外依赖1（公开append入口）；C.6协议／发送／压缩保留待下一批，16项不变。 |
| 2026-11-15 | C.6协议／转换边界：native相邻schema/effort增量固定在原marker，首个同target epoch为baseline、返回target重新开段；转换保留显式marker身份／顺序，无法保留则拒绝。真实outgoing的empty assistant/工具配对及capture前undefined两缺口补反例修复。7/8协议红例与9/15 carrier红例、复核2failed/1passed已保留；最终六静态门、13套件337项、build `2a1feaebbaa4`、函数上限通过，限定独立复核CLEAR。首轮未知Google endpoint名和OpenAI额外system字段是夹具错误，改实际端点及与无marker原body对比，不更改协议。实际L，额外依赖2（复用capture和真实配对）；发送／压缩保留仍未实现，16项不变。 |
| 2026-11-15 | C.6发送前发布：committed source与prospective marker分离，raw路由后生成完整runtime tools／mapped effort再转换；候选和refresh不写历史。原dispatch边界同步onMessage成功后窄append live，取消或漂移零派发，原attempt confirmUnsent；HTTP retry复用同capture，effort fallback记录实际新声明。closing撤权不写runtime removal，goal summary排除未发布marker；promote通知bare capture供overflow recovery。原两红例修复，新增7项真实边界及owner/wrapper集成通过；六静态门、18套件346项、build `c29d540a73fa`和函数上限0超限。首轮空cache误判／prototype复用差异、build类型收窄和复审published reframe差异已修复，失败回执保留。实际L，额外依赖2（窄append与native wrapper转换复用）；压缩spine及真实provider联合验收仍开，16项不变。 |

| 2026-11-15 | 声明压缩保留按原ID／顺序移到checkpoint前，kept tail保持原始位置；transcript通过一次登记与区间移动避免每次重扫声明。新增取消、计数、stored system与split checkpoint反例先红后修；去重后的checkpoint-only调度曾导致progress三项回归，恢复同一完整准入链后13/231及六门/build通过。四反转均红、逐字节恢复后3/32再绿，限定复审CLEAR；本地批次提交，实际L／额外依赖2（局部取消和空history摘要准入）。无真实provider、push／CI或C.3/C.6完成声明，下一批联合验收。 |

| 2026-11-15 | C.3补实际owner联合30套件502项及六静态门通过，限定只读复核CLEAR。账户刷新早拒绝是fixture main100与默认4096冲突；只修fixture并保留全部行为断言。当前编译SDK两组14次actual请求证据通过，C.3本地验收数17；Anthropic native未被当前目标消费，C.6继续部分。此批只有测试／文档，生产build未改变；按批提交后继续B.1。 |

| 2026-11-15 | B.1原文资格化宽度修复7套件306项、六静态门、函数上限和build `12c748aff97c`通过，限定只读复核CLEAR。两反转红／逐字节恢复再绿，Linux编译CLI两模式各五样本cursor／键盘／第二cell点击原文编辑通过，physical glyph未测。初几何与cue预算探针错误保留，只改fixture。本地验收18项；按批提交后接B.3。 |

| 2026-11-15 | B.3首批拒绝unknown／格式伪装／损坏头／单图超限，复审MIME terminal-control两红例修复；Kitty PNG-only／非PNG fallback与iTerm实际read JPEG/alias通过。六门、6/124、0monoliths、build `320e22d14438`和Linux当前编译CLI两模式×两协议四格passed；两反转红／逐字节恢复后再绿。实际M／额外依赖1，B.3保持部分、18项不变，下一批占行与cell-size。 |

| 2026-11-15 | B.3布局／cell-size：48×48与窄宽fits、N行reservation、C=1、iTerm保存恢复、finalized局部cache及Pointer generation接线通过。复审背景次序／旧drag copy红修复；旧颜色夹具HEAD也失败，按原键盘deadline等待后8/313和六门／0monoliths／build `f3c7f85fd552`通过，限定CLEAR。Linux当前编译CLI四格late split10→20行passed；两反转红／逐字节恢复，实际L／额外依赖2，B.3与18项计数不变。 |

| 2026-11-15 | B.3裁剪子批8/243、六门、函数上限、build `2443a54998eb`、Linux fullscreen两协议crop/fallback/扩屏恢复通过，限定复核CLEAR；两反转红且逐字节恢复。仅记录本批完成，B.3仍部分、本地18项不变，按批提交后继续painter和预算。 |

| 2026-11-15 | B.3fullscreen绘图／精确预算9/261、六门、0monoliths、build `e240273b687f`和Linux编译CLI两协议双placement／重排／exit通过；复审duplicate首帧和failed upload/cleanup身份反例修复，限定CLEAR，两反转红且逐字节恢复。regular仍开项，18项不变，按批提交。 |

| 2026-11-15 | regular图片预清完整reserved rows后绘制，独立occurrence ID和p=1避免重复source重传及叠加placement；完整visible隐藏按pair撤图、替换释放无历史upload，partial placement交给native LF，document替换先保存crossing残余。同步输出throw保留原cause并退休painter，后续paint/start/外部移交拒绝，stop仅恢复mode/cursor，不伪造物理回滚。六静态门、7套件248项、0monoliths和build `d3c1c005a1a5`通过；Linux编译CLI regular Kitty/iTerm完整extent预清、同源双图、typing不重传、保留history退出均exit0。两个反转红且逐字节恢复；限定独立复核CLEAR。 初native夹具错误将startup短暂借屏视为regular接管，按实际1049归还顺序修正后重验通过，失败日志保留。实际L／额外依赖2（named placement和unknown-write退休），18项不变，tail overlay／fullscreen stop另批。 |

| 2026-11-15 | document浮层复用已有1049借屏，用原文档有界tail裁剪后composite，原native history/placement不改；进出screenRevision使旧选择失效，背景pointer/composer/choice坐标退休，浮层保留自身bounds。fullscreen清ID在真实terminal.stop恢复主屏之前，继续尝试全部cleanup并保留首错。六静态门、8套件244项、0monoliths、build `f78d9a11fe0d`通过；实际Screen证明partial主图层/cursor/scrollback关闭后精确恢复及同ID跨屏清退隔离，限定独立复核CLEAR。Linux当前编译CLI两协议通过临时input hook触发实际OverlayStack借屏／抑图／还屏且exit0，两反转红且逐字节恢复。 独立owner probe错误导入非公开dist路径导致ERR_MODULE_NOT_FOUND，改用当前CLI已编译owner的临时触发钩子，未新增产品入口；初fixture超长label截断及完全visible高度已更正，失败日志保留。实际M／额外依赖1（选择退休），18项不变，物理像素与native history重排不计完成。 |

| 2026-11-15 | B.3最终资格：完整WebP经实际user/tool block的占行／iTerm传输／Kitty回退和损坏／decoded拒绝通过，六门与3套件56项通过；无生产改动。错位paint/lifecycle receipt从原日志恢复且源码hash验证，失败probe另存保留，修正诊断driver目的文件避免再覆盖。原native history不可重排、无physical pixels／其他平台边界不升级；19/62项本地完成，整体active。下一批B2.1先重现7501 DA1顺序与stop后setter复活，再补提示区消费者及真实Linux tmux。 |

| 2026-11-15 | B2.1状态生命周期：共享7501尾随DA1、32个有deadline的全部query owner、停止／排空撤权及write/cancel重入护栏；原9红、复审3红和两个单红修复。六门8/210、0monoliths、build `744017336148`、Linux loaded两模式×支持/不支持四格通过，两反转红且逐字节恢复5/93。native初查询输入约966ms才处理使bootstrap协商失效，保留真实缺口；paste回显被slash tokenizer处理反斜杠，改观察实际StdinBuffer原始paste并继续原命令，未更改产品契约。调用native过早遇构建未结束是主线程序列错误，保留失败并完成串行新代验证。整体19/62不变，下一批startup／133／tmux。 |

| 2026-11-15 | B2.1启动子批：首帧write及原协议owner readiness一起等待，DA1／250ms／stop／drain／disconnect结束，未新增timer或query。terminal拆input/output保留现有消费入口并满足20函数上限；复核发现构造bind绕过动态write，现有7项反例红后修。联合颜色fixture在HEAD同样失败，补齐独立keyboard/color哨兵并显式能力，原较晚颜色断言保持。六门、9/231、0monoliths、build `220cdd055d01`通过；Linux编译CLI四格bootstrapKeyboardConfirmed全部true、精确paste与暂停／stop清理通过。两个有效反转红、逐字节恢复后3/77通过，限定只读复核CLEAR；实际M／额外依赖1（断连等待清退），19/62不变，继续133／tmux。 |

| 2026-11-15 | B2.1用户提示导航：前导notice通向保留页及按键释放两红例修复，原owner与copy保持。六门、9/280、恢复3/131、0monoliths、build `3154882609b3`和Linux编译CLI三格通过；两有效反转红／exact恢复，限定复核CLEAR。按批提交，19/62不变，继续助手边界与真实tmux。 |

| 2026-11-15 | 助手消息边界：实际message_end工具调用事实同步进入原block，结束无工具消息可导航、未知partial保守拒绝。六门、9/233、恢复3/81、0monoliths、build `fbb35f5b6199`及Linux编译CLI三格通过，限定复核CLEAR；三反转red/exact恢复。原生viewport已在最后回答首行时previous正确跳prompt，错误起点预期保留；按批提交后继续tmux，19/62保持。 |

| 2026-11-15 | B2.1最终本地验收：同build `fbb35f5b6199`六门15/430、navigation3/status4/cell4/tmux2client×2host全passed，source/receipt身份核验，限定只读审计CLEAR。B2.1勾选、20/62，独立文档提交后继续C.1/T3.1；physical/provider/其他平台/push/CI均未证明，不关闭总目标。 |

C.9／C.2联合子批遥测：实际L，复用检查10/10，沿用原stdout／shutdown／request／provider retry／RPC event owner，无新生产依赖或执行／存储平面。额外依赖4（stderr-only终端资格、同步exit结算、shutdown总预算取消、529决定跨层传递）；各复审缺口均有实际反例并已修。仓库graph容量缺口作为独立门禁证据问题保留，未补造统一历史drift基线。

本批遥测：E.1实际L，E.3/D.4子批各L；原gate/worker/catalog/session source/renderer复用核对10/10，无新增依赖或执行平面。未预见依赖四项：caller-retained definition隔离、child allow/deny、未闭合math streaming回归、source pairing与media omission分开。新独立composition/export审查各确认一P2；三effect barrier/两nested style反例实际红后复用原owner修复，限定FIXED/APPROVE。当前50/987及build19af1f6dc3f2通过，E.1功能完成数增至30；旧build和503/provider_network失败run保持独立，F2.2按真实反例继续。

F2.2本批实际L，结构复用检查10/10，无新增依赖、执行或存储平面；额外依赖四项：same-FD/absent-parent cache identity、每次native retry前guard、post-result callback安全结算、read拒绝携带自身publication receipt。最终限定独立复核通过；旧build/失败/unknown保留原范围，无统一历史估算不补造drift。功能31/62，F2.4只读核实后继续单次request pricing owner。

F2.4当前遥测：实际L，结构复用检查10/10，无新依赖、执行或存储平面；额外依赖6项（原始用量资格、分类不完整持久化、账本同拒绝标记、实际warm/trace消费者、captured unknown mode、legacy聚合遇schedule拒绝）。普通schedule覆写仍整项替换，未列类别只继承同捕获base；不补造缺价或真实账单。反转launcher首次标题filter不匹配、一次judge早于restored suite终态的串行协调违规均保留分类，恢复suite与judge已严格串行重验。F2.4已完成native/package/配置模型资格，功能总数32/62，总目标active；最终独立review返回后提交。

2026-11-18恢复收尾：当前55源码hash与a395e980构建匹配，无production修改。Linux九组24实际POST/安装八组23POST及配置模型两actual POST完成并重开passed。探针先误取非公开step factory，改公开SDK；GET readiness不消耗completion响应；失败API terminal异常、摘要实际两次dispatch/合法cut/关闭后state与RPC agent_end均按实际消费者修正，原失败回执保留。实时模型缺公布价格保持unknown；一次cache observer叠加full prompt的错误先保存后修，stopped_error/zero-body网络终态仍失败。F2.3解释式validator候选已实测不兼容，后续保留strict dialect/ref/format和ownProperties，避免直接接入错误替代。

复审控制：原full-history代码/架构lane经多个明确返回请求仍无report，保持unavailable/pending而非APPROVE。主线程限定新独立code6文件与architecture7文件输入，前review-current限定结果和其余owner机器/原生证据继续原scope；不让等待导致扩大复审或重跑绿色suite。后续schema仅在.tmp/draft授权worker草拟，不触碰冻结pricing生产文件/依赖清单。

用户说明当前子代理高延迟、要求继续后续任务；恢复旧review并保留新限定lane，不再重复打断。F2.5独立owner已核实修复：scope/query/view复用log/trace/profile，五红加两追加红，当前5/34及七门passed，仍待原生/build/反转/复审。F2.3draft主线程串行21+4=25tests/stricttypes/禁codegen原生guard passed，fullwrappedcore3372passed其余120为明确scope准入（remote/meta/自定义dialect）refusal，未假装fullconformancepassed；旧Draft7ref sibling$id两反转修复，仍仅draft未更改package/production。功能32/62总目标保持。

F2.5更新：原profile/store/commands/logger owner贯通，普通logger捕获session/workspace不信callerfield，六files39tests/七门0monoliths、6有效反转/11restore、build088efb、compiledpublicSDK/inputhook/actualregistrytracecommand两组原生读取及physicalprofile409passed，独立review已启动。功能仍32/62，不勾F2.5。F2.3草稿33tests/strictNodeNextpassed，标准meta和实际annotationtarget保留；fullwrappedcore3384passed/108主动准入拒绝（remote/customdialect），schema生产尚未变。各价格source55hash未动，原a395native保留其source，不代表新tracebuild全部验证。

F2.3当前草稿后续33tests及strictNodeNext passed，新增official/实际default-reference保持旧验证语义，先两实际红后修。rootbaseline显示旧Ajv允许validdefaultref/拒unknownref，不为更易测试而删特性；wrapper3372→3384核心控制通过，余108外部资源/customdialect主动refusal保留。Next独立source推广需等pricing审查提交界限，或隔离combinedbuild后分批stage；不将draft验收当production完成。

## 2026-11 follow-on roadmap execution

用户在 2026-11-23 明确要求执行 `.wiki/wiki/references/` 中的新审计和 Batch 0–4 路线图。本任务由 [roadmap execution record](roadmap-tasks.md) 单独跟踪，不改动既有 62 项任务计数。

Batch 0 的实现与 Linux 本地证据已完成。420/420 聚焦 Vitest、六项静态门禁、源码构建、Linux `build:exe` 和生产 `--list-models` 入口均通过。三个实际模型请求在隔离临时 workspace 成功。workbuddy 路由正确，但本机 `127.0.0.1:7863` 无监听服务，真实 provider 请求失败，B0.6 保持部分验证。

真实请求测试曾误复用已有 Cheers session `sess_ce712b9e215964b0_1795310273004`，并将 session 模型绑定写为 `bailu-2.8`。执行前未捕获原绑定，不能安全恢复推测值。此副作用在 `roadmap-tasks.md` 保留准确记录，供用户核对。

后续核实确认 Batch 0.5 与 Batch 2–4 仍有待实现内容。Batch 1 原审计中的开头消息改写、收尾步骤移除工具和持久历史微压缩三项判断已被当前实现反证。各批的真实代码缺口、现有实现边界和未验证证据见路线图任务记录。

Batch 0 本地提交：待创建。整个 2026-11 目标保持执行中。


2026-11-19 当前input子批完成：沿原contribution/SDK/CLI/turn/approval/session owner修transform/handled与legacy veto、inert callback、receipt及保存前后准入；未增加执行、存储或事件bus。实际L；原新普通提交已验收，live steer/followUp另留E.6缺口。20/416、末改144/恢复159、七门/buildcca13a50f2ac、11有效反转/两限定APPROVE、Linux native/floor/installed各15场景7POST及配置1actualPOST200/completed。默认judge容量not_proven保持，功能36/62、26开放。最新用户要求当前批提交后总结并停止，停止后不执行下一批。
