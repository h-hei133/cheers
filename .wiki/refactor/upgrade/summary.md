# 规划执行进展（2026-11-19）

本轮接续已核实任务，完成 E.6 的 kernel结算、实际startup／shutdown、树导航、CLI replacement、initial input/UI readiness、controlled CLI reload、before-tree定制摘要及SDK controlled reload子批。**62 项中 36 项已完成，26 项仍开放**，E.6整项仍部分。默认依赖图判定仍为 `not_proven`。

核查与取舍见[工程记录](design.md)，当前验收和次序见[任务清单](tasks.md)。源码按批本地提交。远端推送和本轮 CI 尚未发生。原定暂缓的原生插件与独立桌面产品不计入 62 项，T6 保留按需求开启。

## 当前批次的验证

SDK现公开reload()，沿原commands与extension lifecycle协调关闭／退休、captured loader reservation与完整snapshot、新shared host／UI绑定和start；保留same session及saved state/selection/transcriptprefix，仅bounded startup reports允许。独立复审实际反例修复file/explicit工具限制、队列多消息与失败结算、oldowner关闭、snapshot别名/Map与controlledbind、capture同步重入。最终16文件309项、七门／2747modules／0monoliths、buildf83dd7313313和两限定APPROVE/hash通过；13有效反转15AssertionErrors／1redundant control／exact恢复105项。Linuxcompiled/Node20.3禁生成/installed各8场景2POST，15公开入口strict NodeNext/skipLibCheck=false/engine-strictpassed；报告readback、lateinput、取消及partial均验证。opaque moduleexports保原capability引用，明确不属metadata冻结。normalpinnedjudge实际exit2/not_proven，未新增配置模型调用。[当前交付](../../../.omx/artifacts/upgrade-sdk-reload-2026-11-19/delivery.json)。其余input/message/tool/compaction事件结果继续，整项E.6仍部分。

以下before-tree摘要已提交e27ef805，证据保留原source范围。

before-tree现分别合并摘要／追加或替换指令与单调取消，原event保持不可变；供给摘要沿原branch-note持久化且零默认摘要请求，零abandoned turns也保留。非法／空／超限结果拒绝provider和写入，file／installed worker使用同inert decoder与primitive桥。11文件255项、七门／2733modules／0monoliths通过；TypeScript narrowing调整后40影响项和build9018502b116fpassed，10有效反转10AssertionErrors／exact恢复96项与限定APPROVE/hash核对。Linuxcompiled／Node20.3禁生成／installed各8场景12POST，15strict公开入口／skipLibCheck=falsepassed；三Worker场景是public ExtensionService fixture record消费者资格，不冒充marketplace批准。默认judge实际exit2/not_proven，未新增配置模型调用。[当前交付](../../../.omx/artifacts/upgrade-tree-2026-11-19/delivery.json)。SDK controlled reload及其余input/message/tool/compaction结果消费者继续，E.6整项保持部分。

以下controlled CLI reload已提交65699985，证据保留原source范围。

controlled CLI reload现执行old shutdown→原generation退休→file/installed资源重载→新UI/start，保留same session/selection；busy拒绝，取消原signal、partial/unknown保持真实。11文件179项与七门2732modules/0monoliths通过，联合后仅TypeScript判别式调整，最终20影响项/build7bb49e3f40cepassed。10有效反转10AssertionErrors/exact恢复81项及限定APPROVE/hash通过。Linuxcompiled/Node20.3/installed各5场景2POST、15strict入口、两模式PTY各1POSTpassed；旧observer/fixture/build失败保留。未新增配置模型调用，normaljudge actualexit2/not_proven容量缺口保持。[当前交付](../../../.omx/artifacts/upgrade-reload-2026-11-19/delivery.json)。SDK controlled reload与tree/result consumers仍开，完整E.6保持部分。

以下initial startup已提交472f23c7，证据保留原source范围。

initial CLI启动现等待实际input与UI绑定，ordinary／slash／steer／follow-up／goal按admitted排队；原signal取消invocation，failed readiness不重入，EOF joins原responses，primary startup错误保留。10文件215项、七门／2730modules／0monoliths、7有效反转10AssertionErrors／exact恢复104项、build1d61695fbd9f及两项限定APPROVE/hash核验通过。Linuxcompiled／Node20.3／installed各4场景7POST、安装15strict入口，两模式PTY确认／报告／普通请求各1POST及replacement回归6场景5POST通过。probe与旧build失败保留，未重复配置模型调用；normaljudge actualexit2/not_proven、16384 capacity缺口不变。[当前交付](../../../.omx/artifacts/upgrade-startup-2026-11-19/delivery.json)。controlled reload／before-tree定制summary和其他结果消费者仍缺，完整E.6保持部分。

以下CLI replacement已提交866f835a，证据保留原source范围。

CLI session replacement复用原commands／guarded activation／extension service。before取消后才创建inactive候选，旧shutdown及完整退休先于activation；publish→新UI→start→exact owner/activation/saved prefix readback，postquiesce unknown封锁。RPC异步合同贯穿且不重复selection写，before取消保留所有路由source和旧view；startup消息只绑定新host/command且取消自entry，clear在投影完成后drain。SDK inplace迁移明确拒绝，原resources可继续。当前13文件250项、七门／2727modules／0monoliths、14有效反转14AssertionErrors／exact恢复119项、buildfe58e52bc89b及限定APPROVE通过。Linuxcompiled与Node20.3禁生成各六场景5POST，安装15strict入口／6场景5POST通过；source print首timeout分类并原suite5/5rerun，旧build/native/control证据保留。未重复配置模型调用，normaljudge仍actualexit2/not_proven。[本批交付](../../../.omx/artifacts/upgrade-switch-2026-11-19/delivery.json)。initial CLI startup UI、controlled reload和结果消费者仍缺，整项E.6和26任务保持开放。

以下guarded activation前置已提交934d8299，保持原source证据。

switch前置的guarded activation已沿原registry／atomic writer／resume完成。锁内比较source/destination含absent、activationId和legacy时间；每次rename前重新准入和CAS，candidate捕获不代表写成。resume失败读回必须最终匹配本次activationId与saved version，后继同ID保持unknown。8文件142项、七門／2722modules／0monoliths、build1f30f283e030、9反转12AssertionErrors／exact恢复30项通过，限定APPROVE。Linux公开SDK及Node20.3激活资格、安装15strict入口／11场景16POST通过，原配置与source不变。只保证guarded registry不覆盖新选择；target metadata可能先写，不声称跨文件原子。完整switch/fork与其余26项仍开放。[当前交付](../../../.omx/artifacts/upgrade-activation-2026-11-19/delivery.json)。

以下tree子批已提交de8d2c0b，保持原source范围。

树导航已沿原revert／readback／summary消费session_before_tree取消与确认后的session_tree通知。固定同受众，取消／malformed／deadline／失败拒绝写；原generation在摘要等待后仍须通过最终写guard。post-tree晚回重新校验对象／signal／runtime／保存version，失效no draft且保留已确认写入。当前9文件172项、七门／2720modules／0monoliths、buildbe5ec38906f0、7反转7AssertionErrors／exact恢复25项通过，限定APPROVE。实际compiled CLI RPC两个before／一个after／3POST、Node20.3同组与安装15strict入口／10场景16POST通过。配置模型provider-auth／0requests，normaljudge仍exit2/not_proven；before-tree custom summary、switch/fork及其他结果消费者保持开放。[当前交付](../../../.omx/artifacts/upgrade-navigation-2026-11-19/delivery.json)。

以下startup／shutdown子批已提交c8f0dd7f，保持原source范围。

实际session_start／shutdown已从每轮prompt别名中移出。SDK资源／model／UI／permission完成后start；关闭先同步拒绝新消息、追加和UI，等待旧run，再通知原受众并退休generation。CLI结构化事件桥先于start回调，cleanup错误由共享结算保留。最终16文件255项、七门／2716modules／0monoliths、builddce69239cca0、9反转9AssertionErrors／exact恢复53项、Linuxcompiled11场景16POST与Node20.3同组、安装15入口strict类型／9场景13POST通过，限定APPROVE。当前CLI额外2POST／两shutdown warning证明实际两handler消费者。配置模型provider-auth／0requests，normal judge仍exit2/not_proven。switch/fork/tree、controlled reload、CLI startup UI时机和mutating results保持开放。[当前交付](../../../.omx/artifacts/upgrade-lifecycle-2026-11-19/delivery.json)。

以下kernel子批已提交cb4f69d6，保持原source范围。

E.6首子批沿原contribution／invocation派发typed kernel事件，区分每次agent_end与最终单次agent_settled；immutable快照、排队前受众、generation撤权、5秒有界串行handler、返回值忽略／异常隔离和iterator.return结算等待已接通，late prompt真实拒绝。当前14文件216项、七静态门／2714modules／0monoliths、builda62d41f8a9cd、10有效反转11AssertionErrors／exact恢复37项通过。Linuxcompiled七场景11POST和Node20.3禁动态生成同组、安装15入口strict类型／六场景10POST通过，限定独立APPROVE。配置模型provider-auth／0requests；正常judgeexit2/not_proven／容量缺口，原配置未改、私有state清理。真实session_start／shutdown与switch／fork／tree及结果消费者仍缺，下一子批补实际create/dispose和CLI启动／关闭。[首子批交付](../../../.omx/artifacts/upgrade-events-2026-11-19/delivery.json)。

以下C.5为此前冻结source的证据，已本地提交dbc4f37e。

C.5复用原配置／请求／摘要／预热owner，补short／long／none个人选择、独立协议能力、实际地址和final body窗口、发送时间及最终handoff deadline／source检查；摘要、side、preview共享偏好和端点headers。最终27文件848项、七静态检查／2709生产模块0monoliths、十一有效反转13AssertionErrors且exact恢复6文件138项、buildecdb41348d63通过。Linux当前compiled13场景34POST和source owner预热2POST、Node20.3禁动态生成compiled13／34、安装包15公开strict类型和12场景32POST通过，两项限定独立APPROVE。广范围旧审未返回报告，保持unavailable。当前配置模型鉴权停止、0provider requests，原配置／source／build保持且私有state清理；真实TTL／收益无证据。定向script29项通过，默认NormProof仍exit2/not_proven。[本批交付](../../../.omx/artifacts/upgrade-cache-2026-11-19/delivery.json)。

以下为上一批的历史证据。

- `980bb6d1` 将工具、配置、目录、媒体和 MCP 接入无动态代码生成的校验。独立复审中的五项新回归已修复。Node 24 和 20.3 各通过四组编译入口检查。标准核心用例 3261 通过、230 准入拒绝、1 项 Draft 7 差异保留旧工具入口的相邻断言。
- `a069b2d4` 修复追踪配额、分页、隔离与撤权，补齐已接受响应的类型化事件、绝对时间和链接。编译版 `/trace` 的 HTML、JSON 和控制通过。
- `898a324a` 统一参数归属，保留帮助和版本的优先级、字面凭据及合法路径。缺少显式 provider 时停止启动。编译 CLI 的 12 个 Linux 场景通过。

六项静态检查、53 文件 737 项联合验证及最终 6 文件 178 项通过。构建为 `bf2547057b22`，2707 个生产模块检查无超限报告。脚本套件 209/210，唯一失败由锁定的依赖图采集超过 16384 边触发。基线 `02237103` 和当前均复现，默认判定退出 2。配置模型两次调用均在鉴权阶段停止，观测到零次请求，原配置未变。

F2.4已完成当前Linux功能资格：37文件765项、七静态门/2690生产module/0monoliths、build `a395e98082bc`、15有效反转24AssertionErrors/exact恢复7文件151项passed。公开compiled SDK/CLI九组24实际loopback POST、配置模型两实际bodySent/200/completed/marker与numeric usage、安装包15公开入口strict类型及八组23实际POST通过；各回执明确分别来自同构建的独立运行。价格schedule于请求前捕获，完整单次input严格选最高档后仅持久flat rates；unknown/partial allocation在cost/export/ledger/observer与重开保持。原配置/source/build未变、私有state清理；独立代码/架构最终review收尾中，不把审查pending视作批准。[本批交付](../../../.omx/artifacts/upgrade-pricing-2026-11-18/delivery.json)。

以下F2.2保持其历史source/build资格。

F2.2复用原cache/atomic/configuration/commands owner，body-backed同source validator、原path/raw/inode和每次rename retry准入贯通；saved/unknown及post-result/read refusal完整结果保留。最终20/596、七门、0monoliths、buildc5ae05070276及限定独立FIXED/APPROVE通过；13有效反转25AssertionErrors、exact恢复4/73。Linux同代11组26GET和配置模型两actual requests/completed标记、npm15入口strict类型/10组25GETpassed。原配置与source hash不变、私有state清理；锁外editor最后rename窗口不声称cross-process CAS。旧绿/模型stopped_error及harness失败回执保留，normal pinned judge当前exit2/not_proven/超过16384边，18tracked文件不变。[当前交付](../../../.omx/artifacts/upgrade-catalog-2026-11-18/delivery.json)。

以下E.1/E.3/D.4及更早批次保持各自历史source/build范围。

E.5原共享host在fresh UI acquisition续绑，旧snapshot取消不复活，blocked publication独立revocation要求显式新binding。C.8删除mutable nested schema的永久对象identity memo，保留原catalogue digest和逐定义guard。当前两独立APPROVE绑定10文件hash；最终25文件355项、七门／2662生产模块0monoliths和build89344ffebd35通过，UI三反转8AssertionErrors／串行恢复4文件29项及发现三反转／恢复2文件22项passed。

当前npm-installed包15公开入口strict NodeNext／skipLibCheck=false及两模式实际async TS文件input hook passed；compiled CLI真实签名安装／坏签名与archive拒绝／enable与分开grants、public ExtensionService实际async TS脚本共享原SDK host两模式passed。安装与service分别持有原owner，caller提供明确批准／空hook assembly，不宣称SDK-private gate或named-tool service dispatch；运行零provider请求。配置模型最终8actual发现请求覆盖允许、hook阻断零效果及hidden exclusion，source-only 2000 deferred／20样本目录410input哈希仍匹配；无通用延迟／缓存收益／native历史协议声明。[本批交付](../../../.omx/artifacts/upgrade-ui-discovery-2026-11-17/delivery.json)。

当前E.1/E.3/D.4修复复用原worker/gate/catalog、session metadata与shared Markdown scanner。worker首终态取消子signal并等待host settlement；direct/adapted/delegated工具使用同restricted guarded pool。public HTML重渲染scrubbed source，坏图可见omission、source pairing独立，Thinking原位切换不重建tool cards。当前build19af1f6dc3f2、12script有效反转23AssertionErrors/恢复96项及7export反转18AssertionErrors/恢复149项保持对应source；追加两反转5AssertionErrors/exact恢复96项；配置模型allowed/prehook retry各3实际请求，two read/deferred effect/ordinary approval/hooks/parent-only feedback/OS结果passed。7compiled raw controls零provider；15入口strict类型与npm安装后实际读写同代passed，CLI导出/Chromium零网络/零页面错误。原配置和stored source不变、私有运行状态清理，metadata七文件及新独立composition/export限定FIXED/APPROVE已核对，旧中断lane为unavailable。[当前交付](../../../.omx/artifacts/upgrade-composition-export-2026-11-18/delivery.json)。

当前normal NormProof未通过；临时32768诊断16661边/0unresolved及HEAD基线16575均超16384，只用于定位，18pinned文件未改。此前模型search后无script的正常completion仍failed，same-build一actual request的provider_network失败另存，旧b5c9a284a588/a4c971b25674成功不升级。无完整GFM、rich model dispatch、provider image、通用安全sandbox/确定性重放或缓存收益声明。

以下为此前批次的冻结证据，保留各自构建与范围。

C.7保留当前响应的cache read/write有效presence；缺失或invalid以及旧sticky-only零不计为已观测零。cache miss美元估算使用captured普通input／write费率含premium；缺少已观察write价格不估算也不从新目录补填。实际/cost与两模式notice标estimated overlap／possible expiry并计retained-request读覆盖。C.4默认false保留机制原已存在，研究结论被当前源及实际wire反证，沿用同projection／measurement／compaction owner。

当前21文件933项、六静态门、2657生产模块0monoliths与build `0247cb1b526d`输入摘要核验通过；七有效反转全AssertionErrors／exact恢复，恢复4文件61项、分拆测试2/48通过。五实际HTTP→accounting→persistence→cost和四regular/fullscreen通知案例通过；原13反例10红／3控制、追加6控制、四cost夹具41/45再45/45和十旧恢复失败均归档。[本批交付](../../../.omx/artifacts/upgrade-history-cost-2026-11-17/delivery.json)，限定当前13cache源文件独立APPROVE；模型恢复单独提交，原可选补充output／stream评审未完成为unavailable，不升级成新批准。

同代Linux公开SDK／CLI使用原配置目标21实际请求／10prompt轮：两个6144字节builtin read、四续轮跨年龄保留精确digest、save/reopen原usage与request ID/timestamp及history、默认重开续轮和显式pruning控制、零provider的/cost、实际automatic compaction commit／checkpoint重开均passed。compaction压力明确32seeded pairs／64messages、本地16000window、keep600；不是32真实provider轮。实际response两read-reported／19absent，captured prices=null，不宣称节省／TTL／cache-control／远端容量或native preview等价。

C.9在bootstrap前捕获print／JSON／RPC／非TTY输入或输出，保留仅stderr重定向时TUI的stdout。原writer具有限额／重试／deadline；write返回true仍等callback，同步退出先结算输出，shutdown超时取消原owner并恢复设备。C.2把现有request公共累计capture传到RPC，保留reasoning替换／空清空／closing reset；HTTP retry事实在读取错误body前捕获，529默认决定贯通外层，所有已接受错误响应都不重放或执行工具。

此前18源码hash与两项限定独立APPROVE／CLEAR匹配；28套件482项、六静态门、2655生产模块0monoliths与build `ceabe4b89b3d`输入摘要核验通过。六个有效反转均实际AssertionError且在隔离树exact恢复，主仓库未反转。Linux当前CLI 21场景／53本地POST、regular／fullscreen stderr-only重定向PTY／SIGTERM exit143、已配置模型3实际bodySent通过；[本批交付](../../../.omx/artifacts/upgrade-output-stream-2026-11-16/delivery.json)。保留最初旧构建取消失败、错误退出observer及被复审修复的529反例。

本批正常pinned NormProof judge仍exit2／not_proven，blocking unresolved-specifier obligation为missing，完整图超过16384边。前一批相同manifest／collector／parser的只读比较得到HEAD基线16484边、当时16511边；两者原上限均失败，新增27边。临时32768诊断副本完整图unresolved=0，但这不是默认judge通过，也未验证32768通用安全包络；副本已删除，18个tracked NormProof文件hash不变；当前批未另做扩大图诊断。功能任务勾选只表示上述Linux验收，仓库门禁缺口另列，不能升级为整体完成。

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

## 已完成功能验收的36项

| 编号 | 项数 | 已完成的所述范围 |
| --- | ---: | --- |
| T1.1–T1.5 | 5 | TypeScript依赖归属核实、测试版本／Node下限、Biome门禁、共享构建、15个公开SDK入口及安装类型合同。运行时编译器有实际消费者，直接移除建议被反证。 |
| A.1–A.4 | 4 | edit统一Schema与有界匹配、单次准备序列化、read／工具结果统一行字节预算及全文归档、patch写前effects与批准身份。 |
| B.1–B.3 | 3 | Unicode显示宽度、1MiB writer与背压、图片准入／占行／裁剪／绘制／placement清退及缓存预算。 |
| B2.1–B2.3 | 3 | 终端状态／首次协商、提示／助手边界导航、tmux超链接、完整调色板、可组合浮层及录制输入过滤。 |
| C.1、C.2、C.3、C.4、C.5、C.7、C.8、C.9 | 8 | 循环准备／结束与完整虚拟路由；消息分离与统一准备；公共累计流式快照／HTTP retry事实／已接受响应不重放；stdout隔离／有界writer与退出结算；默认正文保留／measurement／compaction消费者、缓存配置／协议能力／预热窗口，当前cache presence／captured write premium／估算报告；工具发现／mutable schema guard与实际激活消费者。 |
| D.1–D.3、D.5 | 4 | RPC完整会话／模型／树／shell／设置／压缩／retry命令、严格输入和最终准入；队列／UI响应、导出持久token／费用并保留未知覆盖。 |
| E.1、E.2、E.5 | 3 | 脚本完整host settlement、普通gate/hooks/child boundary/动态读写effect barrier；codemode分支状态持久化、原前缀／CAS／ABA保护、进程重启和多级fork隔离；共享SDK UI续绑／撤权。不包含确定性重放。 |
| F2.2–F2.5 | 4 | 远程目录 ETag 和保存结果、无动态代码生成的校验、单次输入阶梯计价、追踪查询和类型化记录。 |
| T2.1 | 1 | 单次参数归属、早期命令及 Linux 启动。 |
| T3.1 | 1 | SDK资源代际绑定／撤权、并发dispose结算／首错、compact与prompt／command互斥和完整idle；安装入口／严格类型／配置模型联合验收。 |

完成指各项记录的Linux本地验收，依然保留证据边界。例如A.4的unsupported删除规则仍是缺口，B的协议字节验收不代表物理像素兼容，D.5没有供应商账单对照。C.6虽已有大量实现和配置模型验证，因原生历史control证据不足继续部分。

## 实际运行过的测试

下表核对保存的日志／回执；历史批次没有在当前构建全部重跑。测试或请求存在重叠，**不累加成全仓唯一通过总数**。本地HTTP、PTY和真实模型请求分别陈述。

| 类别 | 实际运行与结果 | 证据及限制 |
| --- | --- | --- |
| 当前F2.2 | 20文件596项、七门/2682modules/0monoliths、buildc5ae05070276；13有效反转25AssertionErrors/exact恢复73项。Linux11组26GET与配置模型两actual请求、npm15入口strict类型/10组25GETpassed。 | [交付](../../../.omx/artifacts/upgrade-catalog-2026-11-18/delivery.json)，限定独立FIXED/APPROVE/source hash匹配；normal judge exit2/not_proven单列，原配置保持、私有state清理。 |
| 此前E.1／E.3／D.4 | 50文件987项、七门、build19af1f6dc3f2；原19反转和补两反转5AssertionErrors/exact恢复96项。配置模型6actual requests、七raw controls、安装15入口strict类型与离线CLI/Chromium passed。 | [交付](../../../.omx/artifacts/upgrade-composition-export-2026-11-18/delivery.json)，限定FIXED/APPROVE已核对；E.3 richer dispatch/D.4完整GFM仍开项。 |
| 此前E.5／C.8共享构建 | 25文件355项、七静态门、0monoliths、build89344ffebd35；六有效反转、exact恢复，UI串行4/29、发现2/22通过。 | [交付](../../../.omx/artifacts/upgrade-ui-discovery-2026-11-17/delivery.json)；独立APPROVE绑定10source hash，默认NormProof仍exit2／not_proven。 |
| 此前安装与发现消费者 | npm15公开入口strict类型、实际async TS文件两模式及signed CLI安装／公开service共享host两模式passed；配置模型8actual发现请求passed，2000 deferred有限目录410输入未变。 | 安装运行零provider，native配置模型与source-bundle性能分开；服务调用方assembly、named-tool派发和native历史协议未宣称。 |
| 此前C.4／C.7及模型恢复 | 21文件933项、六门、七有效反转exact恢复／恢复4/61、拆分2/48、0生产monoliths；五实际HTTP/accounting/persistence/cost与四两模式notice passed。 | [交付](../../../.omx/artifacts/upgrade-history-cost-2026-11-17/delivery.json)，build0247cb1b526d；13cache源码独立APPROVE，模型恢复独立提交。 |
| 此前配置模型history/cache | 21实际请求／10prompt轮，两次builtin read／四续轮／save-reopen／显式pruning／automatic commit及checkpoint续轮passed，CLI/cost零派发。 | [native](../../../.omx/artifacts/upgrade-history-cost-2026-11-17/accounting/native.json)，压缩64条seeded消息单列，2read-reported／19absent-read、价格null；不宣称节省、TTL、远端capacity或native preview等价。 |
| 此前C.9／C.2联合 | 六静态门、28/482、六有效反转exact恢复、0生产monoliths及build `ceabe4b89b3d`通过。Linux21场景／53本地POST、两模式PTY exit143、配置模型3actual请求通过；限定APPROVE／CLEAR。 | [交付](../../../.omx/artifacts/upgrade-output-stream-2026-11-16/delivery.json)，当前18源码hash／build一致；正常NormProof exit2／not_proven单列，诊断不代替门禁。 |
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

## 文档中尚未完成的26项功能任务

“已有待验收”表示代码／消费者存在，缺本轮整项证据；“部分”表示实现已有进展但仍缺行为或资格验证。以下列出每个未勾选编号，恢复时以tasks.md逐项继续。

| 编号 | 状态 | 尚缺任务或证据 |
| --- | --- | --- |
| C.6 | 部分 | 历史声明、转换、压缩／重开已有实现；Anthropic原生历史control缺真实服务证据。 |
| D.4 | 部分 | 高亮、CJK、Thinking/Diff/灯箱与离线安全已通过；完整GFM仍未验收；限定独立FIXED/APPROVE通过。 |
| E.3 | 部分 | 声明、namespace、冻结session list/get、native image/输出预算已过；richer classify/generateImages派发与provider image缺。 |
| E.4 | 缺口 | 固定执行环境、记录结果交付、可验证的恢复及未知副作用零重派发。 |
| E.6 | 部分 | 逐个完整生命周期事件的dispatch与结果消费者。 |
| E.7 | 部分 | virtual注册／逻辑路由已接通；provider、MCP、renderer和其余runtime setters仍缺，worker virtual明确unsupported。 |
| E.8 | 部分 | shortcuts／flags的CLI／SDK消费者、冲突、默认值、参数与按键生命周期。 |
| E.9 | 部分 | npm／git／local安装adapter和顶层CLI入口、完整性／精确版本／批准边界。 |
| F1.1 | 部分 | 增量工具JSON的实际预览UI／事件，不能恢复孤立parser。 |
| F1.2 | 部分 | Azure 和账户 WebSocket 的真实服务资格。Mistral 独立 Conversations 协议仍缺。 |
| F1.3 | 缺口 | 最终body准入／签名后由传输owner消费zstd，endpoint支持及未知派发不重放。 |
| F1.4 | 部分 | 其他OAuth提供方、设备登录实际同意／续期，复用原凭据proof。 |
| F1.5 | 已有待验收 | MCP PKCE／loopback／renewal／懒加载的OAuth fixture、撤权和tools readiness。 |
| F2.1 | 部分 | 图片／分类器模型类别、逐端点媒体能力／预算与真实Linux输入。 |
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

下一批继续 E.6 before-tree定制summary／instructions和其他结果消费者；SDK controlled reload另由原资源owner显式adoption；保持原contribution、commands和普通Hook拒绝／批准／持久化边界。F2.6指标归属／跨进程传播和T5.1排他创建仍有独立已核实缺口。

## 阶梯计价历史验收

F2.4已实现并完成当前Linux功能资格的单次input阈值最高档、请求前schedule/协议mode捕获、最终flat rate的v2 bucket持久化、原三入口和warm/trace/ledger消费；缺input/分类/价格、captured unknown和legacy聚合均保留unknown/partial。当前37文件765项、七门/2690modules/0monoliths、builda395e98082bc及15有效反转24AssertionErrors/exact恢复151项passed；正常pinned judge仍实际exit2/not_proven。Native/package/真实配置模型当前全部passed，32/62功能总数；独立审查收尾后本地提交，总目标active。
