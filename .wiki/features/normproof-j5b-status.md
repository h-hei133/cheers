# J5b 当前设计、缺口与收口条件

2026-11-10。目标沿用用户已选定的优先级：真实开发任务完成且合规，额外时间与用量可接受。**回传配置已保存并验证原生出站路径；真实架构任务是否改善尚未验证。当前没有新模型场次排期。**

## 当前设计是什么

原始 J5b 是开发校准：6 个历史真实需求族 × 3 组 × 2 次重复，共 36 场，独立任务数是 6。三项架构题为 memory suggestions 失效、恢复会话采用、会话产物删除；三项良性控制为 glob 前缀、未闭合引号、长行截断。

| 组 | 规则提示 | 干预 |
|---|---|---|
| prose | 相同文字规范 | 普通工具与权限 |
| prose_pre | 相同文字规范 | eligible write 前调真实 NormProof |
| prose_ci | 相同文字规范 | 共同候选检查点调真实 NormProof，并反馈实际结果 |

每场最多 14 次实现 + 6 次复查请求，两个阶段最后一请求禁工具，最多 18 次可带工具请求。输出上限 8,192，累计 input+output 到 200k 后停止，交互 600 秒、单请求 120 秒、工具 80 次、公共功能检查 4 次；独立最终评分与结算各另限 120/60 秒。200k 是响应后停止阈值，允许最终响应超出，货币账单仍未知。

最初工具为 read、整文件 write 和公共检查；后续搜索与两文件诊断加入受限 grep。没有局部 edit、patch 或 bash。三组共享工具与预算，最终“联合通过”要求功能、回归、类型、独立规范全通过；模型声称完成和 host 正常结束另外记录。

原设计：[注册说明](/home/wang/projects/normproof-experiment/registrations/j5b.md)、[协议](/home/wang/projects/normproof-experiment/registrations/j5b/protocol.md)。这些文件顶部的 bailu-2.7/尚未启动是历史草稿状态；实际执行状态应读各批独立 freeze 与结果。

## 已完成什么、为何还不能进入效能研究

任务/独立评分器/真实 NormProof 接口已有离线反例和可满足 witness。WorkBuddy 批次实际完成 36 场、635 个正式请求，无 provider 错误与用量缺失；最终代码联合通过 18/36，代码通过且正常结束 15/36。

三个小任务 18/18 通过；三个架构任务 0/18，连 write 提案也没有。每组各 6/12 联合通过，12 个配对全部打平；不存在已知自然违规提案、写前预防或反馈后修复。原样源码合规不能替代开发完成，零差异不能证明等效。

预算/搜索/任务缩小的 14 场，及用户限定的两场提示试验均无写入。增加预算的条件多用 47.46% tokens，仍无实施收益。最后两场 prompt 的占位符和停止边界偏差已在原报告保留，不替补、不覆盖。

所以当前缺口是**指定模型与工作流能完成真实架构修改的准入，以及可观察的规范需求**。不是 witness 不存在，也不是还少跑几次原矩阵。继续复制原 36 场不能消除成功率上限/下限问题。

证据：[WorkBuddy 结果](/home/wang/projects/normproof-experiment/artifacts/j5b-workbuddy-cohort-v1/analysis.md)、[预算/搜索/缩题结果](/home/wang/projects/normproof-experiment/artifacts/j5b-scoped-v1/analysis.md)、[两场提示结果](/home/wang/projects/normproof-experiment/artifacts/j5b-prompt-v1/analysis.md)、[出站诊断](normproof-workbuddy-diagnosis.md)。

## 本轮配置修复

只为 WorkBuddy 精确模型 `global:deepseek-v4.1-flash` 保存 `compat.reasoningReplayField: "reasoning_content"`。用户目录原有其他语义字段、runtime config、默认模型与思考偏好均保留；当前 Cheers 和实验冻结 host 都解析到该字段。使用真实已保存目录的两次模拟原生请求证实，新响应来源绑定后，后续请求回传原字段，内部 origin 不泄露。

本轮真实模型生成请求为 0，没有给旧历史补绑定或重跑旧实验。新请求要用新轨迹与新版本登记；运行中的已捕获配置不能被假定为自动更新。旧诊断验证回执绑定修复前目录哈希；修复后目录变化是本轮授权写入，不能覆盖旧回执使其看似一直已配置。

本轮配置与核验见 [配置摘要](../../.omx/artifacts/normproof-replay-config/configuration.json)、[冻结消费者解析](../../.omx/artifacts/normproof-replay-config/frozen-consumer.json)、[原生出站模拟](../../.omx/artifacts/normproof-replay-config/outbound.json)。

## J5b 怎样收口

J5b 是开发校准交付，可以明确交付负结果与停止决定；不要求追到正收益。当前旧批次已结束，但“架构执行准入通过”和“可进入 J6”仍未成立。这里没有修改外部任务账本或把整个 J5 标记完成。

| 路线 | 做什么 | 代价与结论范围 |
|---|---|---|
| 负结果收口 | 汇总全部已开始尝试、仪器偏差、成本、覆盖和停止决定 | 最少新增投入；交付当前工作流未能通过架构执行准入，J6 不启动 |
| 修正协议后的小校准（推荐） | 只做最多 4 场普通组真实任务，先判断是否有修改和联合通过 | 有限追加模型用量；检验开发可完成性，不能直接估计 NormProof 收益 |
| 适配日常局部编辑 | 先建立修改后的完整内容、来源与一致性绑定，再验证 NormProof pre | 涉及 Cheers 工程工作；属于新工作流，需要独立接口反例与冻结，不能把 edit 当作已覆盖 |

推荐小校准方案是**尚未执行建议**，本轮没有授权它成为新排期：

1. 使用一个新版本，一次修好完整 prompt 替换、终止确认和 reasoning 回传，冻结真实正文/schema/配置/规则/来源哈希。保留现有模型、思考偏好、预算及 read/write/grep/公共检查工具；不加入新提醒，不同时调低 effort、关闭裁剪或添加编辑工具。
2. 最多 2 个开发需求 × 2 次重复 = 4 场，只用 prose。第一题可复用已准入的单根、默认 profile 两文件 artifact 行为；第二题在首个请求前选定一个真实较小边界需求及其独立 oracle，例如仅“approve 后本会话已批准建议刷新”，排除原 memory 大题的 checkpoint/eviction/完整通知体系。第二题当前仍是候选，没有可执行新 witness，离线准入未通过不启动它。
3. 不给模型 witness 补丁或要求违规；明确入口、公开行为和允许范围。观察首次源码变化、公共检查、联合评分、终态、读取比例与累计用量。全部已开始行保留，禁止只统计成功候选。
4. 总上限 80 模型请求、800k token 停止阈值之和、40 分钟交互期限之和，另有最多 8 分钟评分与 4 分钟结算；无 fallback、重试或额外模型 preflight。本轮用户指定的两场 prompt 试验继续维持关闭，新建议不冒充第三场补跑。
5. **若先完成的两次普通组仍零源码变化，立即停止，不启动剩余场。** 有写入但没有可完成的边界需求，J5b 交付执行准入失败。即使有完成而自然违规仍为零，也交付该开发分布未显示增量需求，不能继续换题直到出现违规。

第一题复用正确展开的 scoped 原提示时，可以限定为回传声明改变后的可完成性检查；第二题若缩小任务，属于新任务版本。两者都不与旧 36 场合并估计效果，也不能把整个方案的差异归于单个参数。

## 局部编辑为什么不能直接接上

当前 [write hook 翻译](../../packages/ts-shell/src/core/hooks/translation.ts#L47)只检查单文件完整替换，`edits`/`oldText`/`newText` 等局部形式明确 unsupported。原生 [edit](../../packages/ts-shell/src/core/tools/registry.ts#L337)在拥有模块内重建完整内容并带 `expectedContent` 写入；该完整结果目前没有作为 pre 输入绑定。bash 与多文件 patch 也没有对应的逐文件语义。

若选择日常编辑路线，必须复用原生 edit owner 的匹配与 BOM/行尾行为，检查准确的完整修改后内容，将被检查内容和来源身份绑定到真正写入；过期原文必须拒绝而不是重新匹配后写另一个结果。保留普通权限、取消和未验证写入语义。不能在 hook translator 再实现一套替换逻辑，也不能让 unsupported 绕过检查后算作 PRE 成功。

这是减少编辑摩擦的独立适配工作，不是已证实的零写入根因。可由 Cheers 适配独立 NormProof，NormProof 本身无需成为子模块。产品修改本轮未实施。

## J6 的启动条件与规模

J6 才是前瞻登记的真实净收益研究，当前未启动。至少需要稳定的工作流、真实边界任务可完成证据、可靠独立评分、明确支持范围与修复预算。若采用新编辑方式，三组必须同样提供该方式且 pre 覆盖已验证。

开发池与 held-out 需求族分离；在看到结果前固定最低有价值收益、允许的良性损害、coverage 下限和时间/用量上限。用户目前选定了净收益优先，尚未批准这些数值。24 个新需求 × 3 组 × 2 次的 144 场是历史投入建议，不是当前排期，不能先宣称足够的统计检验能力。

正式规模应按独立需求数、任务级配对差异与成本波动确定；重复不能充当新的独立任务。可以预注册一个有总预算和停止点的描述性 pilot，结果不足就报告不足；后续扩规模另立版本，不能把它当一直运行直到得到好结果的队列。

正式终态既报告功能+规范收益，也报告良性任务损害、真实写入/预防/修复、未知覆盖及全部成本。自然违规为零仍可成为负需求证据；强制违规草稿与固定轨迹恢复属于 J7，不能混入 J6 来制造效果。

任务边界：[Phase 1 的 J5/J6 定义](/home/wang/projects/normproof/.wiki/features/phase-1-decisions.md:3056)。本页仅澄清当前状态并提出下一步，没有运行新 cohort、提交、推送或修改独立 NormProof/实验仓库。

本轮保留、配置、链接和脱敏核验见 [verification.json](../../.omx/artifacts/normproof-replay-config/verification.json)。只修改模型目录声明与本页，既有诊断报告和结果保持原字节；严格文档门仍有旧 dispositions 引用失效，不能计为通过。


## 2026-11-11 当前补充：NOFX Terra 六场 JSON 开发结束，净收益未证明

本节更新当前状态；前面的 WorkBuddy/J5b/J6 说明保留为历史记录。Cheers 已添加独立 `openai-compatible-nofx` 连接，地址 `https://b872cff39391.nofx.one/v1`，凭据来源 `NOFX_API_KEY`；模型目录包含 `gpt-6.1-terra` 与 `gpt-6.1-sol`，当前选择 Terra。[配置最终核验](/home/wang/projects/normproof-experiment/artifacts/nofx/configuration-final.json)通过。原生两请求 [smoke](/home/wang/projects/normproof-experiment/artifacts/nofx/smoke.json)完成真实工具调用与结果回传；此前另一次 smoke 的原生参数字段使用错误在本地失败，回执和 NB-071a 修正决定均保留。

新的六场开发登记为 KEY、Unicode SEARCH、retained WINDOW 各 prose/PRE；两组用相同需求、文字规范、原生 read/grep/write/edit/public_check 和预算。每场 24 请求、300k reported-token 响应后阈值、10 分钟交互、单请求 120 秒，工作/收尾输出 16,384/2,048。仅 [terra-1 KEY/prose](/home/wang/projects/normproof-experiment/artifacts/nofx/trials/terra-1/result.json)与 [terra-2 KEY/PRE](/home/wang/projects/normproof-experiment/artifacts/nofx/trials/terra-2/result.json)开始：[finished](/home/wang/projects/normproof-experiment/artifacts/nofx/finished.json)记录 2/6，四场 SEARCH/WINDOW 未开始。

普通组五次请求中两次原生 edit 真正修改 renderer 和 CLI，两次 committed/候选落盘哈希一致；第五请求错误且缺用量。PRE 组首次请求即错误、没有工具调用且缺用量。合计 **6 个正式开发请求、33,431 已知 reported tokens 加两次未知用量、2 次实际编辑**；PRE 组记录的 0 tokens 只是空已知 subtotal。两场最终功能同为基线 3/19，严格生产类型 867 文件/零 diagnostics、定向 keybindings 测试 23/23 与选定规范通过，功能及运行联合结果均失败。HTTP 200、外层 exit 0 与 agent_end 没有掩盖 nativeFailure/runValid:false。

当前没有足够证据确定 gateway/backend/产品错误根因。正式场次没有 PRE 提案、自然违规或预防机会；离线新文件拒绝/创建/edit controls 只支持机制。NB-070 的 baseline 2/20、lawful 20/20 保留，剩余离线工作 deferred。**NormProof 净收益未证明，原目标仍 active；没有新的收益、commit、push 或 CI 声明。** 详细证据和边界见 [Terra 开发报告](/home/wang/projects/normproof-experiment/research/net-benefit/nofx-terra-development.md)。

### 诊断与六场最终结果补记

[NB-073 三请求诊断](/home/wang/projects/normproof-experiment/artifacts/nofx-transport/finished.json)复现原 KEY 请求：HTTP 200 事件流包含 `upstream_error`，原生错误哈希与旧失败一致。相同开场改为 JSON 响应成功；微型 SSE 也成功，因此没有将 streaming 判定为故障原因。诊断已知用量 1,458 tokens 加一次未知，零工具执行。

另行登记的 [NB-074 六场实验](/home/wang/projects/normproof-experiment/artifacts/nofx-json/registration.json)仅在实验请求中固定 `stream:false`，没有修改产品传输默认。[finished](/home/wang/projects/normproof-experiment/artifacts/nofx-json/finished.json)与 [summary](/home/wang/projects/normproof-experiment/artifacts/nofx-json/summary.json)记录六场全部结束、零未开始：**4/6 有效联合完成**，KEY 两组均 19/19，SEARCH 两组均 12/12，WINDOW 两组均 2/20、运行无效且联合失败；六场严格类型和现有定向测试均通过。共 **60 次请求、800,407 已知 reported tokens 加两次未知用量、19 次真实源码修改**；另一次 unchanged 写入回执未计作修改。

WINDOW PRE 的一次自然函数数量违规 22 > 20 被实际写门阻止，随后合规修改未恢复功能；600 秒交互上限停止。WINDOW 普通组零写入，末次请求 120 秒上限中止。KEY/prose 的初次公共检查 unknown、WINDOW 的两次 1/5 公共检查、所有缺用量和失败回执均保留。两组联合完成数同为 2/3，没有配对成功增益；一次预防不证明功能改善，缺用量使完整成本比未知。开发批次不提供传输因果结论或确认性净收益证据。

[全登记输入归档回执](/home/wang/projects/normproof-experiment/artifacts/nofx-json/frozen-inputs.json)记录 3,161 文件/53,181,964 字节，已核验且不含 secret inputs；[settled-preservation](/home/wang/projects/normproof-experiment/artifacts/nofx/settled-preservation/)保存每场 workspace、检查入口/报告和依赖链接目标，核验后删除新 scratch，readiness scratch 也已保存后删除，NB-070 历史 baseline 保留。登记时的宿主哈希是历史身份，不能作为后续产品补丁仍匹配的声明。WINDOW 只读诊断及公共反馈缺少 expected/actual 的限制见 [Terra 开发报告](/home/wang/projects/normproof-experiment/research/net-benefit/nofx-terra-development.md)。**NormProof 净收益仍未证明，原目标 active，NB-070 deferred；本补记没有重跑模型/检查或宣称 commit、push、CI。**


### NB-075 宿主错误边界已修复并本地验证

Cheers 现在将 HTTP 200 SSE 中的显式 API 错误保留为安全结构化 failureClass，不再把原始 provider detail 放进通用 Network error。失败响应保留已显示文字，零工具准入/执行，接受响应后不自动重试。两文件 167 项通过；安全错误和禁止重试的两项反转分别产生 12/2 项断言失败，逐字节恢复后同套 167 项再通过；严格生产类型与 diff check 通过。四项静态门通过，strict docs drift 仍有 28 个既有失效路径。

[补丁与验证](/home/wang/projects/normproof-experiment/artifacts/nofx-provider-error/)绑定 NB-074 冻结基线与当前源码；产品传输默认、认证和重试框架未改，未发新模型请求。修复不证明 gateway 可用性或 NormProof 净收益，当前目标仍 active；未提交、未推送、未运行 CI。


### NB-076 WINDOW 开发对结束：PRE 18/20，双方联合失败

[新登记](/home/wang/projects/normproof-experiment/artifacts/nofx-window/registration.json)固定一个已暴露 WINDOW 需求的 PRE/prose 对，使用 NB-075 后宿主与原基线/oracle，澄清两个 notice 的句点，共同期限改为 900 秒交互/180 秒请求，并提供同样的有界公共 expected/actual、transfers 与 anchor flags。hidden cases 与旧评分没有改变；其余模型、工具、权限和预算不变。

[summary](/home/wang/projects/normproof-experiment/artifacts/nofx-window/summary.json)与 [finished](/home/wang/projects/normproof-experiment/artifacts/nofx-window/finished.json)记录两场都有效结束、无未知用量，但均 `runJoint:false`。PRE 功能 **18/20、规范 compliant、4 次实际修改、3 次预防、15 请求、312,019 reported tokens、554,900.186 ms**；prose 功能 **2/20、规范 violation、9 次修改、15 请求、308,796 tokens、462,790.777 ms**。两场严格类型与现有 130/130 测试通过，合计 30 请求、620,815 tokens、13 次修改、0/2 有效联合完成。PRE 的 `document-mode`/`unavailable-frames` 未通过；prose 最终 container 仍 22 > 20。

PRE 有 7 个已知 hook 结果，但实际 PRE 进程调用未独立观察；公共反馈与 3 次预防不增加独立进程或任务数。本对 PRE 相对 prose 多 **1.044% tokens、19.903% 交互时间**，只作描述性比较，账单未知。功能 case 改善与合规不等于完整交付，联合成功差为零；一个 exposed pair 不证明统计效能或 NormProof 净收益。

[冻结输入](/home/wang/projects/normproof-experiment/artifacts/nofx-window/frozen-inputs.json)的 3,175 文件全部核验；[保存/清理回执](/home/wang/projects/normproof-experiment/artifacts/nofx-window/preservation.json)确认两场及公共反馈 controls 已归档重验后删除三个 scratch 根，NB-070 历史输入保持。没有晋升实验任务补丁为产品修改或本批 commit/push/CI。只读任务供给仍仅为两个未准入 benign proposal：保留的 `/agents show` 读操作权限与新的 extension list activation truthfulness；前者有已知 owner 暴露，两者均未建立 witness、自然规范压力或 holdout 独立性，不作为新增完成数。原目标 active，NB-070 deferred，净收益 `not_proven`。
