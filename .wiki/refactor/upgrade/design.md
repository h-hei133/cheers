# Design and evidence

## Current architecture and risk

只有一个 workspace 包。单个模块的 import 图无环不等于可以直接搬目录成为无环包：browser/core、workflow/core、planning/session/provider 的双向边存在。现有分支树、CAS 状态写入、任务日志、远端作业派发栅栏均已实现；问题是事务权威和独立模块边界未完成，不能重造另一套执行器或任务系统。

起始工具链为 TypeScript 5.9.3、Vitest 0.34.6、Vite 5.4.21；实际 Undici 7.18.2 要求 Node >=20.18.1，和声明／CI 的 >=20.3.0 冲突。Node API 静态门不能代替依赖下限运行证据。TypeScript 编译器由 graph parser、language scanner、扩展转译和 post-mutation diagnostics 直接消费，移除运行时依赖会损坏产品。此条研究主张予以纠正，保留编译器依赖。

当前静态包 export 宣告 14 个非根入口，但 publisher 只保留 stable index，其余目录被清理。实际导入证实全部失败。公开 SDK／子路径和 CLI 需要共用一个 immutable generation，不能把每条入口独立打包而产生多份 WeakMap／单例。

## Reuse decisions

构建参考的相关决定是：在 TypeScript 类型检查后一次构建多个 ESM entry，共享 chunk；保留 SDK 路径，显式检查动态资源和 worker。采用 shared graph 与 asset 检查；保留本项目现有 build input digest、journal、immutable publication、launcher 和单文件 executable 边界。不照搬较高 Node floor 或参考命名。目标 Node 20.3；Vitest 3.2.7 与 Vite 6.4.6 满足声明下限，显式单 worker 取代旧环境变量约定。

静态检查使用直接依赖的工具和非修改式命令，先启用有实际缺陷检测价值的规则。格式工具可单独运行，批量机械排版不得混在本次行为修改里。门禁自身需要反例，不能只证明当前树“恰好通过”。

首次规则试跑发现 26 项，其中 cleanup finally 的显式未知结果覆盖和 Node 模块内名为 escape 的局部变量不是当前契约下的通用缺陷；这两条高误报规则不纳入首批阻断集，不为通过 lint 改写清理语义。生成器夹具里 throw 后的不可达 yield 删除，异常行为保持。保留重复键／case／参数、不可达语句、const 赋值及 constructor/super 检测；真实重复键反例验证门禁工作。规则集覆盖范围不等于全规则无告警。

存储参考的决定是：追加确认记录、失败 owner 失效、事件化编辑／书签、持久 outbox、连续序号和快照重置。采用其事务与恢复语义，同时保留本项目 fsync、原文件保护、未知派发不重放与单执行边界；不复制其另一语言 daemon。当前独立目录结构先保留，待统一日志契约和迁移器通过后再切换权威。

## Implementation order

```mermaid
flowchart TD
  Verify[核实与任务表] --> T1[工具链与发布]
  T1 --> Runtime[A B B2 C D E T2 T3]
  Runtime --> Protocol[F1 F2]
  Protocol --> Packages[T4 依赖方向与拆包]
  Packages --> Storage[T5 事务与迁移]
  Storage --> Remote[T6 增量协作与常驻远程]
  Remote --> Acceptance[逐项 Linux 实际验收]
```

核实已完成的任务无需重写，但其缺少的实际消费者或证据仍列入验收。每批实现先给具体契约与失败场景，再由主线程串行运行静态门、合并的定向测试、构建及适用 Linux native／真实模型验证。参考比较只记录决定；源码不跨仓复制、参考仓只读。

## Known remaining risks

消息／缓存增量必须保留原始声明位置，不只维持顶层 tools 不变。Patch 混合删除不能丢失 unsupported 覆盖。codemode 无法读取真实会话时不能静默落到全局内存。RPC 队列模式需修改活跃队列，不能只更改展示配置。阶梯费率必须按请求选档后持久化，不按聚合 usage 再选。异步 UI／遥测必须沿用捕获的 owner。

真实提供方支持受当前配置和服务端能力限制；不以自定义 capability 或 synthetic 应答冒充真实兼容。用户已允许 Linux 真实测试，执行使用已有配置模型；需要人工同意的登录验证如未发生，明确保留缺证据。

## Toolchain publication contract (2026-11-14)

公开入口与CLI由一次shared graph构建，元数据产生静态public.js，stable wrappers经唯一current.js共享运行时。别名由specifier和export name编码，新增入口不会重用旧别名；默认和live binding保留。manifest v3把全部wrapper、声明转发和pack规则绑定到输入与产物；journal v2记录旧字节/模式/不存在状态，兼容旧日志恢复。仅清理旧manifest记录且未被用户改动的managed files，不宽泛清目录。旧build保留在磁盘，dist/.npmignore仅打包当前代，防止安装包携带989代历史。声明目录复制原JSON资源，公开类型的Node依赖随包安装。

边界：静态聚合会提前求值所有公开入口；跨多个文件的导出形状变化无法对任意已运行直接importer原子可见，可能拒绝链接，不能混代或谎称恢复撤销了模块缓存。生产构建b57986b62aa3、本地打包/安装和Node20.3验收已完成；后续源码变化应重新绑定构建证据。首次pack fixture假定npm JSON为数组（npm12为名称对象），以及原生CLI fixture未建立HOME，已修fixture重验，不能作为产品失败或忽略失败。

## Approved patch inspection (2026-11-14)

写前判断复用原prepare/permission/bind/hook/authorize/consume路径，在普通批准后由patch owner重新规划所选组并核对确切revision，再封存完整write/delete目标及相应内容。选择一次设置且禁止重设，异常被hook吞掉也不能扩张授权；delete-only/noop同样需要参数身份。删除不虚构为空内容；supported写判断与unsupported缺口同时存在，unknown/block优先于unsupported，后者优先于ordinary allow。现有锁内原始字节检查仍是实际写入边界。匹配计数使用与实际匹配相同的长度剪枝，保持原始范围和歧义拒绝。

## Branch script storage (2026-11-14)

codemode复用已有会话state锁与transcript追加owner；没有新增全局或第二持久存储。读取真实保存会话失败立即拒绝，无会话的纯脚本可执行，但store写入明确unavailable。活动分支先校验保存的唯一root、ID和完整ancestry，再补齐未入树消息；锁内重读保留无关正规追加，写键CAS和当前预算拒绝冲突。capture保存原始字节长度与SHA256，current/before/confirmed及同一追加FD均重验前缀，避免inode未变却删改旧历史。append/fsync/readback/close后不能确定结果时报告unknown，不重试或伪装回滚。已await嵌套效果不会因后续store失败被擦除；无await调用的更广泛结算和确定性重放保留原独立任务。

## Terminal color admission (2026-11-14)

实际宿主在input-ready后查询OSC10/11/4，启动面adoption复用同一StdinBuffer。协议协商在其前发出并持有自己的DA1 fence，enhanced选择不能提前释放尚未收到的fence；250ms原截止回收匹配前缀，不刷新普通Escape/paste/appearance的独立预算。颜色查询100ms初始等待与晚到快照分离，16色按位置合并、冻结且去重；theme lease拒绝停止或替换后的答案，显式主题与preview优先，AppearanceReports独占DEC997亮暗选择。Linux PTY为真实OS流加受控协议应答；宿主regular/fullscreen生命周期由实际InteractiveMode集成fixture验证，未声称物理终端或真实模型验证。

## Foreground message conversion (2026-11-15)

convertToLlm在prepareRequest之后执行，普通无custom历史保留原身份路径；应用转换捕获有界inert raw与provider结果，持久化/路由保留raw，工具/图片/预算/发送使用provider投影。system文本统一加入请求system字段并参与systemDigest，非文本system明确拒绝。转换路径禁用不成立的raw-index前缀与opening测量证据，whole-request仍绑定raw可投字段摘要及最终wire摘要；该摘要不宣称custom.data等价。重试逐次准备但同raw复用capture，raw变化重新转换并换requestId。reference决定是上下文准备后转换、display与model content独立；本实现复用原loop和request owner，不另建运行时。

输入数组先descriptor检查，输出在Promise解析前捕获。异步合同接受普通native Promise并允许Node附属async context符号；constructor/then覆盖与Promise子类在观察前拒绝，native constructor/species描述符复查。受支持pending工作取消后仍观察迟到拒绝；无法安全观察的拒绝Promise形状由调用方负责，不谎称所有thenable均可处理。SDK追加限于完整run/observer/durable settlement后的idle，写入复用SessionManager。

证据目录为`.omx/artifacts/upgrade-messages-2026-11-14/`；conversion-delivery包含12套件391项、六静态门与build `48bafd6fec4c`，conversion-functions保留结构计数，conversion-native-wire.log为当前构建实际配置模型三次bodySent及重开/取消/复用的通过回执；conversion-native.json保留早期失败诊断。首次取消断言用了shell专属lifecycle.cancelled，新增真实terminal stop_state反例后补早取消分类；旧loop已取消fixture改为接受tool calls后取消，保留配对目标。诊断中跨root配置触发正常重载、global fetch遗漏Undici发送及错误私有符号属于夹具问题，最终通过实际请求onBodySent观察，所有失败日志保留。压缩和声明不在本批验收范围。

## Summary request capture (2026-11-15)

摘要使用相同有界converter叶，先解析summary目标，再转换raw，捕获完整system/history/body/url/shape并纯preflight。分段仍以raw的合法工具关系切分，budget读候选转换tokens；accepted handle被保留，实际send不会再次转换。候选增大、裁剪、merge可分别转换，非单调converter只保证发送已获准候选，不保证找到所有可行投影。prefix/merge独立capture，previousSummary仅第0段；512消息/64段/128发送上限保持。

complete serialized UTF-8限额在handle返回前检查，使工具文本能进入已有clamp；派发再复检。身份只摘要显式非秘密字段和实际body/url，headers不入identity。原compaction ledger追加preparedIdentity；同operation未知派发阻止changed capture绕过，旧含headers的operation不可安全映射，因此legacy unknown/无材料墓碑拒绝新capture，保持原证据和格式。manual/automatic/prefix及branch接通converter，branch复用navigation与connection取消信号，失败转换保持回退可用。

summary-final-suites保留18套件326项，summary-reviewed-gates-build为六静态门/build `5e1c8ee4afbb`，summary-native.json及summary-native-final.log为当前编译SDK配置模型三次actual bodySent、manual verified publication、branch和取消零派发。首次native计数预期单段而实际两段，失败回执单独保留。主请求threshold、候选wire缩小及C.6仍未验收。


## Complete caller compaction preparation (2026-11-15)

CompactionPolicy复用现有owner，加入请求局部prepare、estimateContextTokens及admission；不建立新ledger或全局capture缓存。先惰性捕获caller与operation.source，再准备完整caller决定阈值。stored raw仍决定legal cuts与summary；按caller重建checkpoint、精确tail及offset后准备candidate，统一比较完整estimatedBefore/After，force也不能发布变大的转换。preparedPolicy返回供既有commit与progress使用；async policies不加入旧pending join。

完整standard/custom应用字段均在descriptor-first有界snapshot后比较，storage id/timestamp除外；opening保留既有环境content后缀特例。候选与authority准入同时传给原commit。original prepare可能被owner重复调用，因此生产接线必须按完整inert raw值复用已获准capture，不能按array identity命中。

独立隔离批次`policy-isolated-final.log`为8套件160项、六静态门及build `c0a48b5abd86`；`compaction-source-head-red.log`为15失败/3通过反例。无原生主请求或完整C.3完成声明。未匹配到的segments.test.ts并未被Vitest运行，实际套件数按回执8计。


## Complete request capture (2026-11-15)

turn/context复用原step与attempt owner，提取route、转换结果、动态system/tool声明、图片归一化、closing、完整budget与serialized body。初始loop conversion直接复用；candidate由raw重新route后转换一次。accepted capture直接送出。same raw动态system/schema漂移最多refresh一次且沿用route与conversion；converter引用或purpose改动明确拒发。最终budget重计必须同步清掉旧overflow refusal，input byte拒绝仍独立保留。

purpose、agentMode、active provider/model与auxiliary sink在请求捕获时绑定；发送后的onRequestSent/stream callbacks不得把已发送usage重分到新owner。preflight/callback发生在attempt reservation之前；dispatch内freshness拒绝沿用原confirmUnsent。无新runtime/global capture cache/ledger。

`context-extraction-reviewed.log`为5套件199项、六静态门与build `0a240477cfd4`；限定独立复审CLEAR。该接口不是主请求threshold与candidate durable publication的完成证据。

## Converted foreground compaction admission (2026-11-15)

loop提供有界raw capture与live request owner；临时prepareRequest替换和外部streamStep无durable准入。完整caller capture复用deep value而非array identity，candidate用原prepare owner转换一次，budget／byte refusal和增长都先拒绝，再由原compaction authority提交。stored raw仍是切分和摘要权威，候选获准后同时替换loop与AgentCore当前历史；未建立新ledger或全局缓存。

overflow在生成候选前按下一步allowTools／purpose重建完整合同，消费时按实际调用再次核对，均保留原route与conversion。live fence覆盖声明refresh、reframe、candidate prepare的前后，并固定于step内部HTTP及effort fallback重试。持久writer不保存stopReason/errorMessage，因此authority明确排除这些瞬时字段，application metadata/origin等继续严格比较；applyCompaction补齐存储reader已有contextSummary marker以允许第二次压缩。manual从foreground实际prompt/tools/skills/thinking组装完整request，保留已解析serviceTier。

`context-wiring-reviewed.log`记录17套件446项、六静态门、函数上限及build `fed3b0f8c0d2`。`context-native.json`/`context-native-second.log`记录该编译产物Linux SDK配置模型7次actual bodySent，automatic候选、manual verified commit、实际rewind后重开和取消零派发通过，隐藏raw未送出。storage首次夹具使用不存在的constructor参数并遗漏实际prompt barrier，native首次转换规则误将历史自动prompt视为当前主请求，修正夹具后通过，失败日志保留。普通无converter/custom路径仍为早期policy，须下一批接通，不扩大本批CLEAR或Linux证据范围。

## Ordinary request preparation (2026-11-15)

完整准备能力由原StepFunction声明，handoff与delegated wrappers传递能力；普通请求也等到实际路由、system、schemas和最终body捕获后才决定压缩。候选raw归属由原RequestContextOwner接纳，providerMessages是否存在独立决定转换路径与测量对齐；goal closing不能因为sourceMessages存在而用空provider数组覆盖原history。

一次性compaction prepare与每次有效capture通知分离。native effort fallback可能再次route，latest bare capture必须到session recovery；原request owner在step内仍限制native prepare/refresh/dispatch。恢复时failed assistant的追加正常退休旧owner，因此不可把其fenced wrapper存为新恢复的准备源。恢复继续按显式next closing合同reframe，不重做相同raw转换。

`ordinary-retry-red.log`为两补充反例，`ordinary-delivery.log`为六静态门、16套件356项和build `c7e760063e80`；限定独立复核CLEAR。`ordinary-native-fifth.log`/`ordinary-native.json`为当前编译SDK配置模型6次actual bodySent、普通automatic verified commit和重开。首次6k窗口无法容纳系统开销、55s多段摘要截止及错误内部字段均保留诊断，最终只调整fixture数据与时限。两个tool discovery夹具在独立HEAD相同失败，full模式夹具提交`dae1b97`单列。C.6和完整C.3联合验收继续保留。

## Request declaration storage (2026-11-15)

声明由core/agent/declarations拥有版本1中立合同，完整function schema、provider/model/endpoint及非秘密64hex replayBinding和实际mapped effort；消息本身拥有ID／timestamp／顺序。仅空文本system载体允许声明，custom和错误role拒绝。复用既有inert snapshot，4MiB／100k nodes／depth40／4096 tools，显式undefined、访问器、proxy、serialization hook、循环、稀疏数组、非法schema或重复名称拒绝。双向message codec显式列出声明；reader把损坏声明判unreadable，不能静默去掉新字段。

声明沿用custom的append→metadata→state→live顺序，不新增writer。公开encode在序列化前捕获message，两种append在创建header／open前完成一次编码；实际写入后unknown错误保留原磁盘事实。直接入口三场景反例确实失败于`declarations-write-counterexample.log`，错误npm启动另保留`declarations-write-red.log`，不计测试执行。首轮两失败是旧createNew对象不跟随loadSession重新投影的夹具问题；改为实际当前manager对象并保留独立reopen／fork／顺序断言。最终`declarations-data-delivery.log`为六静态门、5套件93项和build `cd08cabeb2bf`，限定独立复核CLEAR。实际请求发布、协议历史投影和compaction spine属于后续批次，C.6仍部分。实际L，额外依赖1（公开append边界），结构复用既有storage及snapshot；无原生provider完成声明。

## Historical declaration projection (2026-11-15)

协议前carrier保留完整声明与id，普通system文本仍进入system prompt，声明不被system filter删除。converter可以多对多改变普通内容，但须每个声明恰好一次、原id／payload／role／空content和声明顺序一致；不能凭raw索引事后补位置，也不声称该检查能证明普通prose未跨边界移动。raw、provider reuse和converter output都在通用snapshot前严格捕获，step入口在preparation try内先capture再spread，避免undefined先被抹掉或getter先执行。raw digest保留旧无声明历史哈希，新增声明内容纳入身份；local fallback计量包含schema，最终完整wire重新估算涵盖原生controls。

native协议使用最后连续provider/model/endpoint/replayBinding段中的首个声明为固定tools baseline，随后相邻完整快照产生schema替换／删除／恢复增量。每个marker的工具／effort更新合并，协议先暂存到下一实际非空assistant或尾部；真实toChatMessages仅在工具结果未齐时跨过silent assistant，保留旧独立empty消息合同。不支持native的protocol忽略carrier。closing仅撤下当前schemas和工具control，raw/runtime不记removal；空baseline不发送deferred placeholder。没有原生auto reset的证据，active auto不发thinking／effort；历史含auto且当前explicit时回退当前numeric thinking，tools仍native，该转场不承诺缓存前缀稳定。

定向参考采用raw声明边界及pending到实际assistant两项决定；参考assistant metadata／尾部effort临时marker不满足本项目durable要求，因此不直接采用。`declarations-protocol-red.log`为7failed/1passed，`declarations-carrier-red.log`为9failed/6passed，`declarations-projection-review-red.log`为两补充失败／一已有拒绝。最终`declarations-protocol-delivery.log`为六静态门、13套件337项、build `2a1feaebbaa4`和函数上限0超限，限定独立复核CLEAR。前两次夹具未知端点名／固定conversation计数失败已保留。发送前发布与压缩spine按独立owner拆为下一两批，减少未提交范围；C.6仍部分，无实际provider完成声明。

## Declaration dispatch admission (2026-11-15)

准备保留committed source，prospective追加完整runtime tools／实际mapped effort声明再转换，二者不混为compaction source。原生prepared wrappers延后loop转换；普通非原生保留原合同，相同完整raw与converter引用由请求wrapper复用capture。首个native-capable模型开启tracking；已有声明后非native目标也记录target转场以隔离A→B→A。工具allowTools／allowedTools只限制当前请求，不变成runtime removal。pending工厂返回与inert capture相同形态；变化后重新转换，不偷偷替换marker。

唯一发送边界仍是原attempt：窄append先descriptor-first验证完整prefix+单marker，原onMessage同步成功才更新live，随后取消／owner／schema检查再handoff。持久化失败report-safe unsent，原confirmUnsent释放；callback中取消保留已落盘live事实，callback替换live不能覆盖后继。同步primitive返回兼容既有void callback，Promise／thenable拒绝；安全native Promise迟到拒绝仍被观察。声明不经过普通message_end，防止先live后persist与重复写。HTTP重试已发布capture复用，effort fallback按实际新mapped状态记录一次。成功promotion通知bare capture，避免failed assistant退休旧owner后recovery无法使用。

goal-budget-summary排除未发布pending并用committed raw重新转换；已发布历史的closing复用原capture，临时撤权不写持久工具状态。published与未发布reframe对缺省选项使用同一清除合同；独立复审发现并修复保留旧mode／purpose／allowedTools差异。`declarations-send-reviewed.log`为最终六静态门、18套件346项、build `c29d540a73fa`和函数上限0超限。原两个发送红例及新增7个边界通过；中间cache空值／prototype复用／类型收窄失败均保留。真实provider与compaction spine尚未验收，C.3/C.6保持部分。


## Declaration retention across compaction (2026-11-15)

raw cut和既有keptMessages仍是权威；discard范围内的声明按原ID／顺序保留到新checkpoint前，未discard声明保持tail位置，不进入dialogue摘要。checkpoint查找跳过首个临时system与连续声明；source首ordinary system保留旧拒绝合同，不能把caller瞬时例外扩为持久丢失。声明ID必须与source对应，其他普通message仍保留已验证storage差异。split turn的previous checkpoint只进previousSummary，替换计数排除声明且不重复计checkpoint。只剩previousSummary时仍以空history进入同一prepare/preflight/segment budget/runStep/unknown ledger，禁止直接不计预算地发出或冒充已缩小。

transcript无声明路径复用原快速投影；首次声明迁移一次，之后arena登记各出现一次，spine为连续前缀，tail通过链表消息／声明区间表示。compaction只移动discard范围，不按receipt重扫既有spine；kept越过spine时把最后声明区间移回tail，最终只展开一次。时间按事件与输出摊还，空间为声明出现次数和当前tail节点，不声称任意调用方总内存有界。outer、首次迁移、discard及最终expand保持每256步取消检查；中断时head／range／计数同步，局部projection不发布。

六初始压缩反例、补充取消／计数／stored-system／split双模式／checkpoint-only准入反例先红后修。去重后progress三项恢复回归真实存在，已由empty请求准入修复；一次初始count期望及dispatch对象／函数夹具错误单列保留。最终13套件231项、六静态门、0函数超限和build c7857153d401通过，四项反转失败并逐字节恢复后三套件32项再绿；限定独立只读复审CLEAR。C.3/C.6仍需Linux已配置模型跨轮／重开／压缩实际请求联合验收，不从本地retention通过宣称provider支持。实际L，额外依赖2（局部取消／checkpoint-only准入），复用原publication和summary owner，无新存储权威。


## Joint message and request acceptance (2026-11-15)

实际30个owner套件502项与六静态门全部通过，日志`context-joint-final.log`；先前主联合19/253及补充5/122不是完整联合，且其中5个指定路径不存在。最终调用补入turn/history、runtime/compaction、core/query/compaction/summarize、schedule/state和manual context实际消费者，重叠计数不累加。

账户刷新用例首次失败并非可直接修改的reason断言：诊断证实TurnPreparationError在账户更新前发生，renewal0／dispatch0，原默认4096超过fixture前台main的100 ceiling。仅把该fixture前台目录改16000 window／8192 output并同步配置window，独立摘要模型32000／100不变。保留Configuration changed、一次renewal、两次fresh credential、精确凭据持久化及无历史追加全部断言；history使用detached snapshot消除同引用假绿。单用例与最终联合均通过，限定独立只读复核CLEAR，没有生产放宽。

当前编译build c7857153d401和source e4d27485两组配置模型各7次实际发送，由Undici bodySent观察；转换system／完整raw／自动和手动压缩／rewind／重开／取消零派发后复用通过，隐藏raw没有进入请求，声明ID／顺序与复用保持。context-joint-native-evidence.json绑定两源脚本摘要；仍需强调nativeHistoryProtocol=false，历史marker种子不证明Anthropic原生协议实际被服务器接受。C.3此范围本地验收完成，C.6继续部分。此交付批只有测试和证据文档，无需重建未改变的生产内容；总目标active，后续B.1继续。


## Terminal cluster width acceptance (2026-11-15)

共享text/width是lineCells、layout、editor/composer映射和两种painter唯一格宽来源。精确匹配可选FE0F的ASCII keycap；双窄成员ZWJ只在计算影子中为未指定presentation的pictograph补FE0F，由原RGI_Emoji验证后宽2，明确FE0E和modifier不覆盖。显示字节／source offsets不变，孤立dingbat和旧wide-member fallback保持。参考区域符intermediate/completed两格决定有回归；参考实现也缺无FE0F keycap，未复制其缺口。

初始counterexamples.log为21失败／187通过，两个flag窄frame期望和一个旧text-ZWJ宽度期望需分类为fixture错误；改为明确borderless2cells，保留旧显式selector合同，几何失败回执不算产品缺陷。最终accepted.log/restored.log各7套件306项，六静态门、0monoliths和build12c748aff97c通过，限定只读复核CLEAR。撤掉keycap／ZWJ补充分支分别3／1红，生产文件按SHA256逐字节恢复。

native.json绑定当前compiled CLI build，两种Linux实际PTY各五样本；检查cursor ANSI字节、regular八次grapheme移动、fullscreen第二cell真实SGR点击后的精确插入原文并exit0。原native-first.log漏算cue margin，修正观察geometry后native-second.log通过，无生产改动。PTY不测字体pixel/cell物理渲染，也不承诺Ansi在grapheme内部的既有支持缺口或全平台普遍兼容。B.1为本地验收完成，B.3和原生协议继续开项。


## Terminal image admission (2026-11-15)

实际user/tool共用原image owner准入，调用既有inspectImage校验16MiB source、base64 canonical、MIME与格式头。metadata改为完整PNG signature／IHDR及VP8/VP8L bitstream signature，显式未知MIME不再猜测；无MIME的尺寸估算仍允许sniff。终端单图estimated RGBA>64MiB回退文字。此为header／envelope准入，不宣称完整像素解码或终端总内存硬上限。

针对参考image component的PNG-only、unknown refusal、conversion不可用fallback三项决定：同意PNG-only和明确fallback；本批没有可复用的同步transcoder，不在paint内新增native进程、WASM或第二套解码器。真实read仍返回JPEG、provider数据和history原文不变；Kitty使用文字，iTerm按原协议显示JPEG／image-jpg。N行reservation、C=1与cell-size invalidation已确认缺口，明确留后续，不由这批green推定完成。

复审发现拒绝MIME原样显示可发送ESC[2J，两个原字节反例先红后复用core/text/safety修复；正常mime原显示保持。初admission-red.log为8failed／19passed，复审两红在admission-review-counterexample.log，npm12筛选启动错误单列setup。最终六门和6套件124项、函数上限0monoliths、build320e22d14438通过，限定只读复核CLEAR。Kitty format／explicit MIME两反转分别红，生产逐字节恢复后联合再绿。

admission-native.json绑定当前build，真实Linux compiled CLI两模式×两协议四格、完整PNG与原生ffmpeg read JPEG、unknown安全fallback和exit0通过。首次seed从root导入未公开core factory及fullscreen CSI2J假定为probe错误，仅改actual subpath和字节观察，失败回执保留。此PTY证据不测物理图片pixel。实际M／额外依赖1（拒绝标签安全），B.3继续部分／本地18项不变。


## Image row geometry and cell-size (2026-11-15)

复用imageDimensions的cell owner：合法positive safe整数先detach／freeze，equal值不换identity；imageCellSize同时限48columns／48rows，按两约束缩放并ceil，避免极端aspect ratio创建巨大row array或宽1却输出c4。原image wire owner返回N行，Kitty传输与placement保留C=1；iTerm先清N−1空行，最后row保存cursor／CUU／OSC／恢复，后续文本不接收decoder的cursor变化。用户背景先画后CR锚定col0再graphics，payload之后不打印padding。

finalized带images/protocol的cache按冻结cell identity重建，普通text/source memo保持；source cache要求原rows identity。cell重排同时推进现有pane selectionRevision，使同width/document/transcript/top下Pointer旧drag无法copy，未新增选择owner。参考同意N-row／C=1／cell invalidation决定，采用本项目局部cache身份；crop与text-first/image-last确认是必要下一批，不由当前green补记完成。

layout-red.log为7初始红例，复审背景printing两红及真实Pointercopy=true单红随后修复；切payload后BEL被stripAnsi当普通文本的assert属于fixture错误，改在protocol terminator后检查。原view QUJD不是有效PNG，fixture替换为完整PNG，原布局／decorator断言保留。protocols颜色查询timeout在imageDimensions还原HEAD时同样失败，增强reply不释放DA1 ownership到250ms；只在fixture等待原deadline，不改product input。layout-delivery.log为六门和8/313，函数上限0monoliths、buildf3c7f85fd552通过，限定只读复核CLEAR。

layout-native.json为Linux当前compiled CLI regular/fullscreen×Kitty/iTerm四格真实PNG，split cell回复9×18→18×18使r10→20、后继文本重排、C=1／iTerm保存恢复与exit0passed。最初probe仍调用旧seed及覆盖第一批receipt，修正seed路径／output文件，恢复原admission receipt，失败日志保留。cache／selection反转均红、生产逐字节恢复后8/313再绿。实际L／额外依赖2（选择代际和背景顺序），B.3继续部分，physicalpixels／crop／lastpaint／全缓存预算未完成。

## Terminal image viewport (2026-11-15)

原image owner识别完整Kitty chunk run／placement及iTerm cursor包装；局部image/viewport owner复用同一控件识别，pane仅检查viewport上下47行内的最大48行图片锚点。Kitty源像素起点floor、终点ceil，保留payload与ID并传y/h/r，顶部重锚到原列；iTerm不完整容纳时显示有界文字，整个cursor包装和附着CR／CSI C一并移除。完整document与原transcript/cache/source/owners不改写，regular native scrollback不在这一批强行截断。

浮层检查完整reserved extent，覆盖任一行就移除整条图片控制、保留background及scrollbar。独立复审找到移除图后遗留CR导致滚动条写回第一列并让EL擦掉浮层的实际反例；scrollbar消费者与iTerm末行fallback两红例均修复。选择样式可能插入CR与graphics之间的推断经真实highlightSelection两用例反证，撤回该推断且不添加不可达SGR清理。document-tail的锚点已在交给overlay前被slice掉仍是WATCH，必须由后续regular painter/lifecycle处理。

crop-gates-final.log六门通过，既有119docs advisory保留；crop-restored.log为8套件243项，crop-structure.log为0monoliths，限定只读复审CLEAR。crop-reversals.json记录恢复原slice和仅检查anchor两有效反转红及原文件逐字节恢复。build `2443a54998eb`冻结后，crop-native.json记录Linux实际编译CLI fullscreen Kitty/iTerm小屏、PageUp与扩屏恢复各exit0；仅协议与生命周期字节，physical pixels=false、realProvider=false。首次child经RTK proxy丢TTY、测试名改动触发build input保护、小屏intro使初始图片不在viewport均归probe/setup错误；失败日志保留，不算产品通过。iTerm相同文字fallback可被diff复用，第二PageUp不强制重复输出该标签。实际L／额外依赖1；B.3保持部分，下一批处理text-first/image-last、placement清退、regular scrollback与预算精确阈值。


## Fullscreen graphics paint and cache retirement (2026-11-15)

render/images owner将完整graphics/decoder cursor串从背景／选区／滚动条分开，保留实际row/column/extent；任何前后anchor或covered row变化重建图层，先d=a移除旧placement再EL2逐行文本，最后position＋graphics，cached uploads不经ED释放。非覆盖普通text仍走原diff。同data双图首帧只upload一次，随后a=p多p0placement；不同位置均显示，避免第二次同ID上传删除首placement。

Kitty驱逐从小写d=i改大写d=I，真正释放ID像素；正常退出／让出终端也按全部known ID逐个I释放，d=A只用于可见整体清理，不假定其释放无placement的offscreen上传。失败不把unknown上传当cached；保留proposed/current及previousUploads snapshot，cleanup和eviction构造／write再失败仍恢复ID，下一成功paint先I删除再新upload，stop也释放，保留原throw。仅device write接受证据；不宣称emulator decode ACK。

完整PNG精确count16（17th old释放）、独立32MiB wire（小1pixel大tEXt，3项预算内/4项预算外）与64MiB decoded（两个32MiB offscreen正好保留，下一pixel超限）均通过，visible排除、oldest-first保持。不是整个终端总内存上限，regular native scrollback缓存另有保留契约。paint-gates-final六门/0monoliths，paint-restored9套件261项；paint-reversals两有效red＋exact恢复，限定独立复核CLEAR。build `e240273b687f`冻结后paint-native.json Linux当前CLI fullscreen两协议双图及cell reflow/text-before-graphics/exit0通过，Kitty首帧单upload/两placement/退出按ID清退；physicalImageRendering=false。实际L／额外依赖2；B.3仍部分，regular最后绘制和document-tail后续。


## Native scrollback image placement (2026-11-15)

regular图片预清完整reserved rows后绘制，独立occurrence ID和p=1避免重复source重传及叠加placement；完整visible隐藏按pair撤图、替换释放无历史upload，partial placement交给native LF，document替换先保存crossing残余。同步输出throw保留原cause并退休painter，后续paint/start/外部移交拒绝，stop仅恢复mode/cursor，不伪造物理回滚。原reference预清extent决策采纳，但reference重绘/删除整个历史的策略不适用于本项目“原生history immutable”合同：Kitty的EL2不影响graphics，按ID/pair删除或同placement更新会删除/移动跨入history的整张图。这里不为partial追加裁剪副本，完整仍visible的named placement可更新；同source重复出现使用各自ID，旧history不再由应用缓存/清退。

六静态门、7套件248项、0monoliths和build `d3c1c005a1a5`通过；Linux编译CLI regular Kitty/iTerm完整extent预清、同源双图、typing不重传、保留history退出均exit0。两个反转红且逐字节恢复；限定独立复核CLEAR。真实Screen double增加Kitty upload/pair/delete、save/restore及native LF解释，证明完整可见重绘不累加、replacement不残图、crossing先保留、实际caret不漂移。失败重试原设计经反例推翻：bindings回滚不等于已接受字节与光标回滚，删除uncertain ID还可能误删跨document history。删除该恢复系统，用明确fail-stop；所有sync写入路径覆盖BoundedWriter append阶段，保存含undefined/null的原cause，不复活失败实例。失败stop不发送relative move或graphics deletion。完整partial history重排／同row多control不宣称支持；tail overlay及fullscreen真实stop放下一小批。

Linux `regular-native.json`绑定冻结build，兩协议双图预清、输入不重传与退出保留native图片通过；初probe错误期待启动全程无1049h，实际startup短借后已有1049l归还，按原native合同修正并保留`regular-native.log`。`regular-tests.log`的两个失败是write封装显式传undefined callback造成spy arity差异，字节和实图层均正确，精确callback断言修正后重验。`regular-reversals.json`两项反转均red且bytes exact恢复。physicalImageRendering=false，realProvider=false；Linux PTY只证明字节与生命周期。


## Document-tail overlays and active-screen retirement (2026-11-15)

document浮层复用已有1049借屏，用原文档有界tail裁剪后composite，原native history/placement不改；进出screenRevision使旧选择失效，背景pointer/composer/choice坐标退休，浮层保留自身bounds。fullscreen清ID在真实terminal.stop恢复主屏之前，继续尝试全部cleanup并保留首错。上游Kitty main/alternate各自独立graphics manager，命令操作active screen；因此相同image ID跨屏不会天然冲突，但真实Terminal.stop包含1049l，清退顺序若落在restore之后会删除主屏保留图片。采用cleanup先于driver restore，不新增全局ID系统；normal/borrrowed/failure路径复用原release列表和首错合同。

六静态门、8套件244项、0monoliths、build `f78d9a11fe0d`通过；实际Screen证明partial主图层/cursor/scrollback关闭后精确恢复及同ID跨屏清退隔离，限定独立复核CLEAR。Linux当前编译CLI两协议通过临时input hook触发实际OverlayStack借屏／抑图／还屏且exit0，两反转红且逐字节恢复。初新增stop1红、tail overlay3红、retained Pointer1红均真实产品反例；新Screen双屏/graphics测试从真实Surface→TUI借屏，并模拟真实stop归还，再检查主native图/光标/历史。原label21字宽20被截断以及height30图全部可见是fixture错误，改短label和height23保证partial，未修改生产边界。`lifecycle-reversals.json`记录两red且bytes exact恢复；`lifecycle-native.json`绑定冻结build和hook/driver源码hash。首次独立模块probe误以dist提供内部文件，实际分块build仅发布公开入口，ERR_MODULE_NOT_FOUND归probe错误；改当前compiled CLI入口，通过同代chunk临时捕获Surface/engine引用触发既有OverlayStack，不替代TUI/Terminal/painter。该hook不是产品新功能，也不是直接模块公共API验收。physicalImageRendering=false、realProvider=false；跨平台/其他兼容emulator仍无证据。


## Terminal image acceptance closure (2026-11-15)

原roadmap:23和full-audit:58必需范围为PNG/JPEG/GIF/WebP头、CSI16t测量和Kitty离屏16／32MiB wire／64MiB decoded预算。各既有图片、layout、viewport、render和surface owner已覆盖实际consumer；最终补完整320×160 lossless WebP经user/tool block的10行reservation、iTerm完整payload、Kitty文字fallback以及坏bitstream头、截断头、MIME错配、decoded超限拒绝。fixture由ffmpeg/libwebp独立编码与解码，不以合成尺寸头充当有效图。completion-gates.log六门通过，completion-tests.log三套件56项通过，completion-fixture.json记录fixture来源。无生产改动，此小批不额外build/native；此前各冻结build的native证据仍各自绑定原代际。

最终只读审计找到证据目的文件错位：lifecycle driver复用paint-native.json，导致paint canonical指向lifecycle成功回执，而lifecycle-native.json仍是失败模块probe。分别从paint-native-first.log和lifecycle-native-cli.log恢复原成功JSON，逐个核对归档源码hash；原失败JSON保留于lifecycle-native-probe-failed.json，receipt-repair.json保存前后摘要和原始来源。原始日志与已冻结探针source不重写；修正后的driver另存lifecycle-receipt-owner-fixed.py.txt，避免后续覆盖。恢复是证据指针修正，不是新native执行。

B.3标本地验收完成（实际S、额外生产依赖0，复用owner）。原规划没有native主屏history重排要求；其不可重排合同继续保留，物理终端像素、全平台和真实provider未证明。所有路线图任务保留，19/62项本地完成，接着执行B2.1，不关闭整体目标。


## Status reporting lifetime (2026-11-15)

KeyboardNegotiation.begin允许已拥有的7501 query插入原DA1前，status probe随对应DA或250ms到期；TerminalInputProtocol中央消费完整nonpaste report，用32项最多的startup/color fence绑定真实KeyboardNegotiation和PendingColorQuery，保留取消／早收齐owner直到自己的sentinel或deadline。满额不发送新query，不删除旧owner；旧sentinel不结束新probe。同chunk查询确认动态读取状态。deadline后的无标记迟到DA1不能区分，明确保持保守兼容限制，不声明任意迟到全隔离。

stop/drain/restoreSync撤销supported和pending状态、清进度timer；Terminal setter拒绝停止／排空／断连／非TTY，progress interval先建立再write，使同步stop能够清除它。start每次generation及各write/resume后重验，stop重入不继续挂listener或建timer；满额color取消后检查当前query identity，防止回调新query被旧路径清掉。读写使用原device/parser/status owner，没有第二输入扫描器。原13用例最终19项，生产红9/4、reentrant1/13、review3/14、capacity1/17、cancel1/18均保留。六门status-delivery-gates、8/210 delivery-tests、0monoliths、build `744017336148`通过。两反转真实红且exact恢复后status-restored5/93；限定只读复核CLEAR，不替代主线程验证。

status-native.json为当前冻结CLI Linux regular/fullscreen×支持/不支持的loaded return四格，完整sharedDA／fallback、keepalive、实际StdinBuffer原始paste、让出与重探测、stop后迟到setter全部通过，实际SIGTERM宿主exit0如实记录。hook只触发现有TUI.suspend／Terminal setter并观察paste，不替代protocol/render或新增产品入口。初要求slash command回显保持反斜杠不成立：命令参数tokenizer有既有escape语义，原始paste实际完整；改从原parser观察同时保留原命令消费者，失败日志保留。初suspend前已执行本地命令使进度清除，恢复active fixture再验，不放宽cleanup。

真实bootstrap query早期输出后，模块加载期间stdin到约966ms才处理，超过250ms窗口；所有最终native的bootstrapKeyboardConfirmed=false。这是尚未修复的生产初始化缺口，不能把loaded green提升为完整B2.1。初build尚运行时启动probe是主线程序列错误，status-native-build-overlap-failed.json保留，最终等待冻结build后四格再验。B2.1维持部分，本地19/62项不变；下批修startup并验收133语义导航和真实tmux。

## Startup protocol acquisition (2026-11-15)

启动入口在heavy imports前同时等待原首帧write和TerminalInputProtocol的原DA1／250ms等待；收到enhanced回复仍保留DA哨兵，stop、drain、restore和disconnect结束当前等待，重启独立Promise。与只读参考terminal:304-312的先装stdin消费者再发shared query决定一致；本项目额外等原边界，使同步初始化不能占住回复窗口，没有第二timer或查询入口。Terminal拆到同域terminal/input和output，保留UTF8、deferred输入、64MiB pending字节与成功callback合同，各模块不超过20个命名函数。

复核发现构造期bind固化write，后来spy／recording不能观察协议输出，现有7项消费者反例先红再恢复动态call。首次联合9/231仅same-chunk颜色fixture失败；原HEAD同样失败且两个生产文件逐字节恢复，原因是缺keyboard的独立DA1。fixture显式能力并补两个哨兵，仍要求较晚颜色优先，生产颜色合同未放宽。初startup四红、disconnect红、write七红与baseline失败原日志保留。

startup-delivery-gates六门、startup-accepted-tests9/231、0monoliths及build 220cdd055d01通过；两有效反转分别移除启动等待和断连清退，均实际失败且字节完全恢复，startup-restored-tests3/77通过。限定只读复核CLEAR。startup-native.json绑定该build及两source SHA256，Linux当前CLI regular/fullscreen×支持/不支持四格全部bootstrapKeyboardConfirmed=true，shared query、原始paste、keepalive、suspend再probe、停止迟到setter清退和exit0通过。hook只触发现有生命周期入口；physicalTerminal=false、realProvider=false。实际M／额外依赖1（断连清退），本地19/62不变，133导航／真实tmux与整体目标继续开项。
