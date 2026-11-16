# 规划执行进展（2026-11-16）

用户已恢复完整规划，当前目标active。**62项中25项完成Linux功能验收，37项功能任务未完成**：12项部分完成、10项已有实现待验收、13项确认缺口、2项待核实。C.9／C.2已集成并完成当前源码／构建的联合测试、Linux原生验收和限定独立APPROVE／CLEAR；完整仓库NormProof仍exit2／not_proven，不能称全门禁完成。C.7冻结补丁的代码审查发现四个旧费用夹具不符合新presence合同，待主线程实际分类、修复和复审；所有验证串行执行。

本总结依据[任务清单](tasks.md)、[当前状态](MASTER.md)和保存的实际命令回执。此前20/62的暂停总结已归档为[历史快照](../../../.omx/artifacts/upgrade-rpc-retry-2026-11-16/summary-2026-11-15.md)；之后C.1、T3.1、D.1、C.2和C.9达到各自Linux功能验收，使当前增加到25项。用户仅授权本地分批提交，**未推送，未取得本轮远端CI**。原定暂缓的原生插件／独立桌面产品两项不在62项中，继续暂缓；T6保留原规划按需条件。

## 当前批次的验证

C.9在bootstrap前捕获print／JSON／RPC／非TTY输入或输出，保留仅stderr重定向时TUI的stdout。原writer具有限额／重试／deadline；write返回true仍等callback，同步退出先结算输出，shutdown超时取消原owner并恢复设备。C.2把现有request公共累计capture传到RPC，保留reasoning替换／空清空／closing reset；HTTP retry事实在读取错误body前捕获，529默认决定贯通外层，所有已接受错误响应都不重放或执行工具。

当前18源码hash与两项限定独立APPROVE／CLEAR匹配；28套件482项、六静态门、2655生产模块0monoliths与build `ceabe4b89b3d`输入摘要核验通过。六个有效反转均实际AssertionError且在隔离树exact恢复，主仓库未反转。Linux当前CLI 21场景／53本地POST、regular／fullscreen stderr-only重定向PTY／SIGTERM exit143、已配置模型3实际bodySent通过；[本批交付](../../../.omx/artifacts/upgrade-output-stream-2026-11-16/delivery.json)。保留最初旧构建取消失败、错误退出observer及被复审修复的529反例。

正常pinned NormProof judge仍exit2／not_proven，blocking unresolved-specifier obligation为missing，完整图超过16384边。相同manifest／collector／parser的只读比较得到HEAD基线16484边、当前16511边；两者原上限均失败，新增27边。临时32768诊断副本完整图unresolved=0，但这不是默认judge通过，也未验证32768通用安全包络；副本已删除，18个tracked NormProof文件hash不变。功能任务勾选只表示上述Linux验收，仓库门禁缺口另列，不能升级为整体完成。

此前D.1批次修复非法RPC输入回落到模型prompt、异步读取准入未到最终响应、压缩活动未覆盖完整结算三处缺口。复用原输入、command、读取、compaction和响应owner，保留JSONL与UI响应分离、custom host兼容、取消隔离、持久化和未知结果合同。

首次扩大联合测试14失败属于夹具漂移：九个RPC扩展发裸slash，五个runtime桩缺mandatory commands。只修四文件夹具并保留断言。独立架构WATCH随后发现共享raw overflow第二caller活动登记被跳过；真实反例AssertionError后把同一合法cut的caller登记提前到共享generation查询前。旧构建／911测试／六反转与失败驱动保留原代际。

该批build `43da5c29fee3`六静态门、34套件912项、2648模块0monoliths及inputsDigest核验通过；相关15/268和恢复3/110通过，七反转全部AssertionError且exact恢复。同代Linux七组55 loopback POST和配置模型四实际请求通过，含完整命令／queue／UI／错误／busy／取消／compaction／EOF、durable commit与压缩后继续；原配置hash不变，隔离最小catalog、body不可检查、未制造真实限流边界保留。独立代码APPROVE限定12生产文件、架构CLEAR绑定35源文件，主线程核验hash和逐项合同；[整项交付](../../../.omx/artifacts/upgrade-rpc-acceptance-2026-11-16/delivery.json)。

从此前暂停点继续完成的本地提交：

| 提交 | 完成范围 |
| --- | --- |
| `d683a3db` | SDK compact纳入完整settlement、互斥／取消／dispose；T3.1整项本地验收完成。 |
| `e61a3402`、`9bf68f97` | 捕获完整physical请求目标，普通／direct摘要、预算和共享renewal消费保留原准入。 |
| `774c898c`、`356b996b` | 提升既有分支存储为session owner，保留CAS／ABA／namespace；virtual定义接入原扩展注册代际。 |
| `d8189ac` | 逻辑模型选择、完整physical路由与分支状态；C.1整项本地验收完成。 |
| `5ded288` | RPC读取当前持久会话，修正messages／count／stats／last-text及provider/model配对。 |
| `b1d46c3` | RPC可用fork候选、原文draft、原selection／version准入；session／tree命令矩阵。 |
| `c10c5291` | RPC shell生产执行、取消、上下文内／排除报告、完整输出归档及历史。 |
| `0caf82c` | 设置完整publication、thinking按端点／预算发现、stored／requested／effective分离、异步commands准入和取消。 |
| `bf01f8f` | compact同步登记原command owner，controls可达、EOF结算、失败结果保留结构化status。 |
| `ae9a3f59` | retry专属取消及就绪代理转发；D.1整项验收在恢复后继续。 |

## 已完成功能验收的25项

| 编号 | 项数 | 已完成的所述范围 |
| --- | ---: | --- |
| T1.1–T1.5 | 5 | TypeScript依赖归属核实、测试版本／Node下限、Biome门禁、共享构建、15个公开SDK入口及安装类型合同。运行时编译器有实际消费者，直接移除建议被反证。 |
| A.1–A.4 | 4 | edit统一Schema与有界匹配、单次准备序列化、read／工具结果统一行字节预算及全文归档、patch写前effects与批准身份。 |
| B.1–B.3 | 3 | Unicode显示宽度、1MiB writer与背压、图片准入／占行／裁剪／绘制／placement清退及缓存预算。 |
| B2.1–B2.3 | 3 | 终端状态／首次协商、提示／助手边界导航、tmux超链接、完整调色板、可组合浮层及录制输入过滤。 |
| C.1、C.2、C.3、C.9 | 4 | 循环准备／结束与完整虚拟路由；消息分离与统一准备；公共累计流式快照／HTTP retry事实／已接受响应不重放；stdout隔离／有界writer与退出结算。 |
| D.1–D.3、D.5 | 4 | RPC完整会话／模型／树／shell／设置／压缩／retry命令、严格输入和最终准入；队列／UI响应、导出持久token／费用并保留未知覆盖。 |
| E.2 | 1 | codemode分支状态持久化、原前缀／CAS／ABA保护、进程重启和多级fork隔离；不包含确定性重放。 |
| T3.1 | 1 | SDK资源代际绑定／撤权、并发dispose结算／首错、compact与prompt／command互斥和完整idle；安装入口／严格类型／配置模型联合验收。 |

完成指各项记录的Linux本地验收，依然保留证据边界。例如A.4的unsupported删除规则仍是缺口，B的协议字节验收不代表物理像素兼容，D.5没有供应商账单对照。C.6虽已有大量实现和配置模型验证，因原生历史control证据不足继续部分。

## 实际运行过的测试

下表核对保存的日志／回执；历史批次没有在当前构建全部重跑。测试或请求存在重叠，**不累加成全仓唯一通过总数**。本地HTTP、PTY和真实模型请求分别陈述。

| 类别 | 实际运行与结果 | 证据及限制 |
| --- | --- | --- |
| 当前C.9／C.2联合 | 六静态门、28/482、六有效反转exact恢复、0生产monoliths及build `ceabe4b89b3d`通过。Linux21场景／53本地POST、两模式PTY exit143、配置模型3actual请求通过；限定APPROVE／CLEAR。 | [交付](../../../.omx/artifacts/upgrade-output-stream-2026-11-16/delivery.json)，当前18源码hash／build一致；正常NormProof exit2／not_proven单列，诊断不代替门禁。 |
| 此前D.1整项联合 | 六门、34/912、七反转exact恢复、相关15/268、恢复3/110、0monoliths及build `43da5c29fee3`通过。Linux七组55本地POST、配置模型四actual请求通过，独立APPROVE／CLEAR。 | [整项交付](../../../.omx/artifacts/upgrade-rpc-acceptance-2026-11-16/delivery.json)，绑定该批hash／build；限于Linux本地。 |
| 此前retry聚焦回归 | 14套件412项通过，覆盖kernel、provider、turn、RPC及CLI就绪代理；六门／build／0monoliths通过。五个有效反转都触发AssertionError，源码逐字节恢复，恢复4/67通过。 | [本批交付](../../../.omx/artifacts/upgrade-rpc-retry-2026-11-16/delivery.json)。初SSE夹具错误及原生proxy缺口均保留，不将初绿代替最终验证。 |
| 此前retry Linux编译CLI | 六个loopback POST：provider／outer等待各一次取消为failed且零第二请求，显式新prompt可复用；普通已接受响应与native bash不受影响；accepted body故障不重放。所有进程有效JSONL／EOF exit0。 | [原生回执](../../../.omx/artifacts/upgrade-rpc-retry-2026-11-16/retry-native.json)，build `754fdcb217b0`，本地服务明确不是外部真实provider。 |
| 此前retry配置模型 | 两次实际bodySent；在普通请求进行中发abort_retry仍completed，idle发取消不影响第二prompt，EOF exit0。原四配置文件hash保持。 | [真实模型回执](../../../.omx/artifacts/upgrade-rpc-retry-2026-11-16/retry-real.json)。未主动制造真实服务限流／故障，Undici body不可检查。 |
| C.1完整路由 | 39套件840项、六门、十反转、strict安装类型通过；安装SDK10／CLI2／自动摘要12／重试续轮8／RPC1个本地POST，配置模型4个真实POST通过。 | [路由交付](../../../.omx/artifacts/upgrade-virtual-routing-2026-11-15/delivery.json)，当时build `083b3d78d8bf`。该批RPC仅限定选择和持久origin，旧messages缺口由后续批修复。 |
| T3.1 SDK联合验收 | 16套件236项、六门、四反转、15公开入口strict类型通过；Linux配置模型4次实际请求覆盖prompt／compact／复用／同ID重开，取消零派发／零commit及资源撤权通过。 | [SDK交付](../../../.omx/artifacts/upgrade-sdk-2026-11-15/compaction-delivery.json)，当时build `d9acacbc4260`；不作全平台承诺。 |
| RPC会话／树／fork | 当前持久读取／切回／删除拒绝两进程各1POST通过；随后真实JSONL矩阵3POST覆盖rename、排他cursor、树导航、clone／fork原文draft、往返history、busy／abort／missing和EOF。 | [读取](../../../.omx/artifacts/upgrade-rpc-read-2026-11-15/delivery.json)、[命令](../../../.omx/artifacts/upgrade-rpc-commands-2026-11-15/delivery.json)，各自历史构建；当前整项证据另列，历史请求不累计。 |
| RPC shell／设置／压缩 | shell13/227及最终恢复5/68、196637字节artifact逐字节比对、2本地／1配置模型POST；设置11/200、最后发现3/29、设置恢复3/62、2本地／1真实POST；compact4/43、3反转、3本地／2真实POST，socket取消／零commit与复用commit通过。 | [shell](../../../.omx/artifacts/upgrade-rpc-shell-2026-11-15/delivery.json)、[设置](../../../.omx/artifacts/upgrade-rpc-settings-2026-11-15/delivery.json)、[压缩](../../../.omx/artifacts/upgrade-rpc-compaction-2026-11-15/delivery.json)。各自代际；设置200项在最终skill predicate修复前，受影响29项另跑通过。 |
| 消息／声明配置模型联合路径 | 两组各7次实际请求通过，覆盖统一context、跨轮tools／effort、自动／手动压缩、rewind／重开、取消零派发与复用。 | [14次请求回执](../../../.omx/artifacts/upgrade-messages-2026-11-14/context-joint-native-evidence.json)，当时build `c7857153d401`；目标nativeHistoryProtocol=false，不能证明Anthropic原生历史control。 |
| 安装／下限／输出与存储 | 隔离npm安装15入口strict类型、TS扩展／worker、Node20.3及Linux单文件exe prompt；8MiB输出全文artifact/read、codemode独立进程重启／fork通过。 | [工程基础](../../../.omx/artifacts/upgrade-toolchain-2026-11-14/validation.json)、[输出](../../../.omx/artifacts/upgrade-output-2026-11-14/validation.json)。入口使用synthetic provider，不证明真实任务质量或性能提升。 |
| 管道／PTY／tmux | OS受阻管道4MB全文摘要一致、块≤1MiB；约5.7MB PTY输出，断管／SIGTERM真实退出；regular／fullscreen Unicode、图片、cell-size晚回复、裁剪／双图／浮层／导航，真实tmux四格超链接通过。 | [writer](../../../.omx/artifacts/upgrade-writer-2026-11-14/writer-receipt.json)、[终端](../../../.omx/artifacts/upgrade-protocols-2026-11-15/tmux-native.json)，清单B／B2的各批回执；部分注入终端回复，不是物理字体／像素证明。 |
| 离线浏览器／协议／追踪 | Linux Chromium离线HTML实际session费用与未知output保留，0网络／0页面错误；本地HTTP／TLS／CONNECT／SSE取消、独立追踪进程拒绝不崩溃及sink捕获通过。 | [导出](../../../.omx/artifacts/upgrade-export-2026-11-14/validation.json)、[连接](../../../.omx/artifacts/upgrade-connections-2026-11-14/validation.json)、[追踪](../../../.omx/artifacts/upgrade-tracing-2026-11-14/validation.json)。D.4／F1／F2相应整项仍未完成。 |

真实模型沿用既有active连接和凭据。用户models目录的原JSON损坏，相关新原生测试在隔离home使用原目标的最小有效目录entry；原用户配置未修改，该证据不代表原损坏目录可加载。失败、setup错误和observer错误均单独保存。没有Windows、物理终端、真实Azure／Mistral／Anthropic原生control、OAuth真人同意／续期、服务账单对照或性能收益基准。本次只跑聚焦检查，未宣称全仓测试／全仓类型通过；六静态门保留119条既有非阻断文档source提示。

## 文档中尚未完成的37项功能任务

“已有待验收”表示代码／消费者存在，缺本轮整项证据；“部分”表示实现已有进展但仍缺行为或资格验证。以下列出每个未勾选编号，恢复时以tasks.md逐项继续。

| 编号 | 状态 | 尚缺任务或证据 |
| --- | --- | --- |
| C.4 | 已有待验收 | 默认历史工具正文保留、多轮前缀与压缩测量一致性。 |
| C.5 | 已有待验收 | Anthropic历史缓存marker、OpenAI／Responses affinity和TTL的最终wire与能力边界。 |
| C.6 | 部分 | 历史声明、转换、压缩／重开已有实现；Anthropic原生历史control缺真实服务证据。 |
| C.7 | 已有待验收 | 五生产／四测试冻结补丁修presence与captured write premium；四旧costCommand夹具审查REQUEST_CHANGES，待实际分类／修正、当前联合验证、持久化／真实usage消费者及复审。 |
| C.8 | 已有待验收 | 六个核心工具、动态prompt、BM25／词干／Schema索引、search→execute与失效代际。 |
| D.4 | 已有待验收 | HTML高亮、GFM／CJK、Thinking、Diff、灯箱及转义安全的完整离线导出。 |
| E.1 | 已有待验收 | 沙箱组合、多工具嵌套权限／hook／过滤结果与中间历史。 |
| E.3 | 已有待验收 | TS声明、namespace／image／models API的真实脚本调用与输出预算。 |
| E.4 | 待核实 | 确定性重放的记录、恢复和副作用边界，已有worker不等于可安全重放。 |
| E.5 | 部分 | 异步／代际／共享宿主已修；安装产物最终资格及SDK配置发布后的UI重绑定仍待核实。 |
| E.6 | 部分 | 逐个完整生命周期事件的dispatch与结果消费者。 |
| E.7 | 部分 | virtual注册／逻辑路由已接通；provider、MCP、renderer和其余runtime setters仍缺，worker virtual明确unsupported。 |
| E.8 | 部分 | shortcuts／flags的CLI／SDK消费者、冲突、默认值、参数与按键生命周期。 |
| E.9 | 部分 | npm／git／local安装adapter和顶层CLI入口、完整性／精确版本／批准边界。 |
| T2.1 | 部分 | CLI参数集合、单遍解析、早期判断和完整启动矩阵。 |
| F1.1 | 部分 | 增量工具JSON的实际预览UI／事件，不能恢复孤立parser。 |
| F1.2 | 已有待验收 | Azure／Mistral／Responses WebSocket真实服务、连接复用／取消／代理／TLS。 |
| F1.3 | 缺口 | 最终body准入／签名后由传输owner消费zstd，endpoint支持及未知派发不重放。 |
| F1.4 | 部分 | 其他OAuth提供方、设备登录实际同意／续期，复用原凭据proof。 |
| F1.5 | 已有待验收 | MCP PKCE／loopback／renewal／懒加载的OAuth fixture、撤权和tools readiness。 |
| F2.1 | 部分 | 图片／分类器模型类别、逐端点媒体能力／预算与真实Linux输入。 |
| F2.2 | 已有待验收 | 远程目录ETag、304、无效内容拒绝及配置换代。 |
| F2.3 | 缺口 | 替换运行时eval式Schema compile，完整dialect／ref／format、严格不coerce及安全错误。 |
| F2.4 | 缺口 | 单次请求阶梯定价、含缓存输入的严格阈值、完整费率选择和持久化。 |
| F2.5 | 部分 | span／event／link基础已接通；dashboard的profile／session检索来源一致性待核实。 |
| F2.6 | 缺口 | 有界直方图、跨进程传播接入实际运行边界及失败隔离。 |
| T4.1 | 缺口 | 共享契约／组合方向，消除包级反向依赖。 |
| T4.2 | 缺口 | browser／desktop／media可选领域包独立边界，核心仍可启动。 |
| T4.3 | 缺口 | workflow／research／planning／collaboration／advisor独立编译／依赖／公开接口。 |
| T4.4 | 待核实 | config／scripts按职责收敛重复实现，保持配置来源／信任／门禁。 |
| T5.1 | 缺口 | 统一追加事务日志、明确提交／未知结果，解决多文件分步写。 |
| T5.2 | 缺口 | 旧格式迁移、单一读写权威和可回退恢复。 |
| T5.3 | 缺口 | ContextEdit／Label追加事件、书签／编辑历史及UI／RPC消费者。 |
| T5.4 | 部分 | DAG重启安全续调度，只恢复明确续点或未派发节点；未知副作用不重放。 |
| T6.1 | 缺口 | 增量reducer、持久outbox、快照重置、确认丢失／重复／背压。 |
| T6.2 | 缺口 | 协作流式传输与断线续接，保持撤权和后继owner。 |
| T6.3 | 缺口 | 常驻远程多路连接／文件能力，复用唯一执行边界，取消／deadline／EOF及未知派发。 |

## 后续工作

C.9／C.2证据归档和本地提交后，主线程继续C.7旧夹具实际分类／修正、冻结补丁复审、集成验证和真实usage消费者；再做C.4实际多轮retained tool-text／measurement／compaction验收。仓库NormProof容量缺口保留，未获或实施scope／bundle／default gate修改，不通过缩图隐藏missing。全部原规划和暂缓条件保留，总目标active，未push或取得远端CI。
