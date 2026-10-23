# Phase 20 交付状态

本文只记录有实际证据的状态，不把实现等同于交付。提交、推送与 CI 分别列出；未运行的真实 provider、PTY、跨平台与发布验收不算通过。

## 当前剩余工作（2026-10-23）

范围只来自 [Phase 20 决策](phase-20-decisions.md) 及其引用要求。机器矩阵当前为 35 `complete` / 12 `partial` / 0 `open`；这些标签记录各批证据，不证明全阶段完成。以下 12 项仍未闭合，本地缺口可以继续执行，不能统称为等待真实环境。

| ID | 尚缺内容 | 下一步或所需输入 |
|---|---|---|
| PRV-03 | 真实账户登录、刷新、失效、退出及跨连接隔离生命周期证据 | 需明确账户/provider、隔离 opt-in 运行条件；合成 token/audience 校验不替代实测 |
| PRV-05 | 可信远端结算/账单与本地 ledger 对照 | 需 provider 结算来源和可比较账期；本地成本、quota 不等同实付 |
| TOOL-02 | 同模型 full/dynamic 的实际执行、缓存/总成本、参数质量和四语言 tokenizer 校准 | 需模型、预算、真实评测输入；现有 paired harness 可先只读复核 |
| PAN-02 | tree/目录/管理动作已有批次证据，terminal 深树与摘要增长已修；仍缺全屏真实 consumer 的 heap/响应及目录累计 I/O 总界 | 20k真实panel键/render已量化并修复；继续完整byte-tier heap/展开响应及catalogue累计I/O |
| PAN-06 | history/copy/back、undo扫描/preview/locked target、restore catalogue/index/picker/准备及执行source准入已有批次证据；cleanse来源/目录总界、导航/query瞬态heap/时延及整体physical I/O仍缺 | 本地继续原cleanse consumer资源与身份边界、重复scan及完整交互测量；source cap不等于总heap/physical I/O保证 |
| PAN-07 | device-code 登录/退出端到端验收、完整认证生命周期；扩展总资源界及 unknown 跨重启保持 | 合成协议和扩展持久边界可本地继续；真实认证需账户/provider 条件 |
| PAN-08 | 剩余 report consumer 的行为/安全/资源审计，完整 catalog/projection 总界；真实 MCP 连接/认证 | 本地继续消费者与资源界；真实连接需 server/认证条件 |
| INPUT-01 | 完整五模式 Vim/IME 合同、字素与输入边界验收，平台真实 IME 证据 | 本地复核状态机和终端路径；实机输入法需平台/终端/IME 类型 |
| QA-01 | 47 项逐任务反转矩阵与跨任务集成仍未全部闭合 | 随上述实现逐项补证；本批panel新增六项有效反转 |
| QA-02 | Windows 交互 PTY、真实 IME、系统复制、非交互 profile 切换/审批生命周期 | 非交互合同可本地继续；Windows/IME/系统复制需适用机器和终端 |
| QA-03 | 真实 paired 执行、盲评、正式配对完成及启动/性能聚合 | 需模型/预算/评分者与正式运行条件；synthetic/dry-run 只证明 harness |
| QA-04 | 全任务最终结构复核、独立审查、完成文档和发布证据 | 各批精确 SHA CI 继续读回；只有全范围闭合后才能做最终交付声明 |

## 2026-10-23 PAN-06 原restore执行读取与完整控制（本地与独立审查通过；提交待取证）

- 原bridge完成preview后，one-use attempt共享128MiB fresh metadata/blob及独立384MiB locked target source预算，每file64MiB；原primitive preflight、commit before/current/after四次descriptor inspection分配/读取前计量，失败不退款。direct primitive默认同policy，原readAccess/abort/file-access与共享owner按单次调用组合，不双计同caller回调；原target locks/current equality/selected order/receipt-required/writer保持，无新schema/cache/commit实现。
- 独立实际复现并修复共享owner忽略原call controls/bytes、异步cancel未latch、current body取消误报unknown、final verification body取消仍verified、one-shot file-access拒绝不保留及workspace alias转向另目录。已有preview identity owner增加原词法路径至原canonical root绑定，贯穿command/preview/bridge/execute；执行owner捕获original workspace string，primitive输入提前复制。control在admit回调后、prep catch、locked current读后与commit返回后检查；writer-start前blocked，之后unknown，先前已接受verified结果及后续blocked各自保留。
- 最终15文件151项、准确Node20.3.0十文件96项、scripts157项通过；16有效AssertionError反转全部exit1且六source/test hash相等。原1541c1f源码19实际AssertionError/2pass，两个owner-only已有实现不计原product失败；初次构造budget后改mock limit、相对config路径setup失败、冗余prepared/initialcheck green反转等留存，不计有效。独立code APPROVE/architecture WATCH，综合COMMENT无BLOCK；code25探针在host与准确20.3.0均通过、83项/production typecheck，architecture25production/control探针、41项/AST/import/cycles，六hash两报告绑定、own fixtures清除。实际64MiB exact/+1/lockedgrowth、failedblob无退款和384MiB预算边界分别注明source admission与实际I/O证据。
- build`2c44d46db8eb91278978600772c0f055ad79373ae81ca471c4731d7953e59fea`，inputs`69cef82cc536f57440a021259e48e81a7ebb738182d32974f8b4dd7ef5979919`，artifact`b99aa407730a3464c4cc0e029d5c8d7f3da283bd5d60edb1bbf78b3079dd38e9`，exe SHA-256`434a210be9d7750f8108be5776ddddd2322c34c97dc24931aa44719eedc5e3b7`。最终双构建fresh、同准确build Node/exe regular/fullscreen四格PTY pass/exit0且before/after相等：205snapshot三页到最旧preview/search/cancel/stale/index拒绝、actual128MiB准备和64MiB+1 current拒绝零写、合法显式selected CRLF+emoji恢复，原record/blob及其他workspace bytes保持。专用PTY与报告/author-binding见`.omx/artifacts/phase20-restore-writer/`。中途旧build业务四格pass后的freshness拒绝及后续旧build启动拒绝分别保留，不算最终证据。
- source预算是本attempt累计读取准入，不等于总瞬态heap、physical write/store I/O、重复交互时延、其他平台或跨文件崩溃原子性。原conservative writerStarted unknown可能早于实际rename，不能改写为未执行。cleanse及完整测量仍本地后续，35complete/12partial保持。本批commit/push/newSHA CI分别取证。

## 2026-10-23 PAN-06 explicit restore准备与最终预览准入（`1541c1f6`已推送；CI/Watch success）

- 原preview读取链复用recovery descriptor/budget，单call累计128MiB index、重复prepared metadata、before blob及current source，单current file64MiB；opened size在body分配/读取前扣量，失败不退款。selected IDs在await前复制，`--all`首次index和后续准备共用原owner与预算。普通缺失/path/content mismatch继续原逐文件诊断；资源/control拒绝整call，不能在后续execute恢复先前eligible子集。
- 独立审查实际复现preview返回后准入撤销仍写文件、all首次读取未计量/捕获替换root及最外层command仍发布旧preview，均修复并保留失败探针。bridge在首次读取前捕获workspace/profile/signal/admission，after-await重验并传入原primitive file-access边界；runner/local command提前捕获原身份，只在preview返回前重验，原已执行/unknown结果完整保留。原selected顺序、显式execute、guarded writer及receipt-required语义保持，无新writer/schema/cache。
- 最终14文件115项在Node24与准确Node20.3.0均通过；原write-access12项、commit consumer24项、result-contract158项、scripts157项通过。11有效AssertionError反转全部exit1、九source/test hashes前后相等；原5c79d6bc源码11项实际AssertionError。独立code APPROVE/architecture WATCH，综合COMMENT无BLOCK，十个最终source/test哈希与两报告绑定；code独跑78项/18production探针、准确Node20.3.0另31项，architecture60项/18production探针及AST/import/cycles，作用域全部低于20函数。Node20目录关闭测试一行修正另经两lane复核，未弱化ERR_DIR_CLOSED断言。
- 上批index `5c79d6bc29f4533dc0f8fc78307e329fc2920815`已推送；精确CI`39967258892`/job`120460258412`于14:27:20Z failure，948文件/10133项通过、两项关闭目录测试失败，Watch`39967258922`success。本地准确20.3.0回放原断言同样两项ERR_DIR_CLOSED失败，修正Promise内调用以捕获同步throw后31项及完整受影响115项通过；属于测试跨版本捕获错误，不改production cleanup，也不将上批CI升为成功。
- 最终build`5b0aced4cac9aa1679a8f1af569748a7ed759e8deca6dad95afc40a544301fd2`，inputs`204a56a524dac28f2c80b7bb9ecf4ae567134db33305ca21b28bbc73a61febb5`，artifact`c22c860db4a9370ff8376f8839fcf2abdb18d08fb48c5c37cda98a73c8110234`，exe SHA-256`64a8e183cca473a8d674a9d2d9c23b856eb51b67ca24a9fe3759da65fda388c8`。双构建及同build Node/exe regular/fullscreen四格PTY pass/exit0、before/after身份相等；205snapshot三页/最旧exact preview/search/cancel/stale与index超限拒绝，actual两33MiB before/current pairs导致128MiB准备拒绝、actual64MiB+1 current拒绝且零写，合法显式execute恢复一个selected CRLF+emoji target。全部原record/blob及其余workspace bytes保持。最终结果与author-binding见`.omx/artifacts/phase20-restore-preparation/`。初次旧build四格浏览pass、测试变更后的freshness拒绝及首次增强探针等待未渲染Markdown标记超时分别保留，不算最终证据。
- WATCH/剩余：128MiB只约束preview准备，原primitive执行时再次metadata/blob、locked current/commit及physical write I/O不计入；JSON/hash/string瞬态heap、同步响应、重复scan、cleanse与跨文件崩溃原子性不据此保证。PAN-06及47项仍35complete/12partial；后续先原restore执行资源，再cleanse和完整测量。本批commit/push/newSHA CI分别取证。

- 代码批`1541c1f69034360a931da0b225224a06efeec27e`已commit/push并读回远端main；精确CI`39972785178`/job`120479542134`completed/success，14:48:31Z–15:05:57Z；Watch`39972785542`/job`120479543001`completed/success，14:48:32Z–14:48:57Z。修复了上批5c79d6bc的Node20测试捕获失败；此CI仅绑定1541c1f，不扩展到后续执行source批。

## 2026-10-23 PAN-06 原恢复索引累计准入（`5c79d6bc`已推送；CI测试失败，后续批修复）

- 原namespace/record index退出full readdir数组，owner内复用opendir32缓冲、Dir.read前后准入与finally close；每call32MiB metadata source、20k选中ID/接受names、50k全部实际direntries（含忽略项）。原显式ID先计数再复制，重复ID仍逐项计量，外部数组在异步metadata读取中追加不能扩大本次选集；完整排序、ID/filter/missing与filesystem区别、blob presence-only及原catalogue100页投影保持。
- Local budget与caller readAccess两signal/check/admit组成原descriptor reader准入；坏JSON/重复失败读取不退款，超限整call拒绝，不返回已保留page或missing-only空成功。namespace新增optional control并在inner返回至public列出前再次检查。首次拒绝在本call保留，directory或metadata close EIO不能盖掉control/limit；public直接重放原limit类别，ordinary cleanup错误仍blocked，不声明拒绝时close成功。
- 独立审查实际复现namespace publication、close吞拒绝及mutable selected ID绕过，均修复并保留失败证据。最终12文件93项、恢复20项、scripts157通过；13有效AssertionError反转exit1且四source/test hashes前后相同，原7e0b327d源码20项全部实际AssertionError。初次retained单保护因later explicit count兜底green、typed改动same-message green、latch改动后旧反转pattern setup失败及limit-check错误夹具均保留，不算有效；最终绑定actual retained/class、mutable selection等合同。cycles/config/declarations/Node floor/docs strict/47项矩阵/diff通过，packaged NormProof exit0/partial、0open/1failed advisory/10proof gaps，audit residue恢复。
- 独立code APPROVE/architecture WATCH，综合COMMENT无BLOCK；code独跑10文件91项/13actual boundary/control探针/typecheck，实际32MiB+128KiB重复malformed opened reads、20kID+1、20k有效namespace+1与50k忽略项+1及large append；architecture6文件58项/16探针/AST/import/cycles，32MiB实read及20k/50k synthetic Dir.read inventory接原bridge。四hash两报告/final-binding一致，own fixtures清除。public index7函数等于base7、read4/limits0，不增加中央行为。
- build`3a7c0d52d5545fc79d3f92a16f2b69e147e73e79ac10b9f106eef35bcd50cde9`，inputs`5f00d08720eea5c177b6a3ccbd6a74fb12cfbf2923909d1fd7ca1c3baaa256ea`，artifact`1c192883cd2035493c38ee8e84fa8a9052258fc1bd004e8b1ed552686a5e58c8`，exe SHA-256`95664d44000cfdd47fa2567132b7245ab2758d7504721a3a656bf2753359f482`。同准确build Node/exe regular/fullscreen四格PTY pass/exit0，build-before/after相等；205snapshot三页到最旧exact只读preview、全search/cancel/stale cursor/累计catalogue拒绝及原explicit `--all`来源超限明确拒绝，移除fixture可重开。全部原workspace/record/blob bytes保持。证据`.omx/artifacts/phase20-restore-index/`与author-binding。
- WATCH/剩余：单index call source/names计量不证明blob/current content准备、writer I/O、decode/hash瞬态heap或重复交互physicalI/O/响应；explicit restore内容准备与cleanse仍本地后续，35complete/12partial保持。目标已有catalogue/session Dir.read取消及descriptor计量方案沿原owner适配，参考selected checkpoint JSON/Git无相同多record累计policy，未复制代码。

## 2026-10-23 PAN-06 restore 选择来源与生命周期（`7e0b327d`已推送；CI/Watch success）

- opening在原registry绑定session/project上下文副本、canonical workspace身份、profile身份与原command admission/signal；same-owner准入拒绝可显示，changed-owner迟到结果沿原host抑制。账本路径在准入后延迟解析，目录内metadata读取通过原readAccess重验，没有新增reader/cache/writer/schema或写批准。
- 取消、有效选中和续页handoff一次消费旧page，abort浏览、失效generation并清offered/page/base/query；closed load/search拒绝，clear/apply不能复活。每call独立signal组合并finally移除listener，取消单个search可重试。界面先abort load再apply，接受动作因此只保留原opening access与选中metadata引用，沿原index fresh equality重读后产preview draft；多选同authority、quoted路径、hidden metadata digest、pending/invalid/mixed拒绝保持。
- 两lane独立复现内层read返回至外层load继续之间的取消竞态；补load closed与load/search原准入/signal publication检查。失败探针保留，修复后独跑通过。build首次TS2322发现lazy ledgerRoot未收窄，补保存page前明确root guard后build通过；初次workspace反转因已有assertWorkspaceRoot兜底green、signal反转只得到AbortError均保留，改为真实identity/resolves合同断言，最终12有效AssertionError反转均exit1且七source/test hashes前后相同。原e435261d源码11项实际AssertionError/1pass，两state-only项排除；原代码已支持单search取消/accepted信号分离，不虚报新增失败。
- 最终9文件258项、恢复14项、scripts157通过，cycles/config/declarations/Node floor/docs strict/47项矩阵/diff通过；packaged NormProof exit0/partial，0open/1failed advisory/10proof gaps，audit residue已恢复。独立code APPROVE/architecture WATCH，综合COMMENT无BLOCK；code137项/11探针/production typecheck，architecture50项/15production探针/3actual host项及AST/import/cycles，七hash与final-binding一致，各自fixtures清除。registry保持原37function-like names，restore16/state3/catalogue6，行为仍归本域。
- build`52b4bdeeec0d143baf8d55f4b77da68744d5594f80d26e8c6f67ea1f954bb828`，inputs`28621998e4d9988adcbda23654140cc67c7aa9844f4bf93354d002c96bc40885`，artifact`8adbc704bd37c9e7ffbdd9fe8eb5906ae5938f4ed98e9d54db4a5c1c110d9805`，exe SHA-256`d93932da9146089bb1fadef7a172484ca0f8885d149b44eafcb5274b320a3881`。同准确build Node/exe regular/fullscreen四格PTY pass/exit0，build-before/after相等；205snapshot三页到最旧exact preview、全search、cancel/reopen、hidden metadata stale续页拒绝及累计source拒绝。全部原workspace/record/blob bytes保持。证据`.omx/artifacts/phase20-restore-selection/`与author-binding。
- WATCH/剩余：每page/query仍fresh complete scan，source准入与释放引用不等于总heap/physical I/O/最长响应；explicit restore command准备与default index inventory、cleanse consumer仍本地待处理。registry已有超ceiling聚合未增加，不在本批扩展。PAN-06与47项保持35complete/12partial。

- 代码批`7e0b327de11235422c915d1037aff878a2092e2f`已commit/push并读回远端main；精确CI`39963636126`/job`120447709415`completed/success，13:43:54Z–13:56:15Z；Watch`39963636176`/job`120447709765`completed/success，13:43:54Z–13:44:22Z。仅绑定此SHA；原index后续批不扩大此CI证明范围。

## 2026-10-23 PAN-06 restore catalogue 来源与取消（`e435261d`已推送；CI/Watch success）

- 原streaming catalogue每complete call最多32MiB metadata source bytes、20,000record candidates与50,000ledger/records目录项（含无关名称），跨全部authority累计；metadata128KiB单项限制保持，validated opened descriptor在分配/读取前计量，坏JSON/失败read不退款。超限整call拒绝，不返回已保留的100record page或空成功；原complete100项分页、全文query、revision/cursor、unavailable/empty/no-match区别保持，blob presence只stat，不读blob/current body，无新scanner/writer。
- 原index加可选readAccess，effective signal进入已有metadata descriptor reader，在read/stat/readdir后重验，typed limit/control错误不被吞成missing。shared budget只新增可选limitMessage，catalogue错误不冒用undo文本；default index的full readdir数组和explicit consumer接受规则保持。目录buffer32及iterator/finally关闭保持；完整scan catch与root-open catch重验取消，EACCES/ENOENT或两层iterator EIO同时取消保留exact reason，无OS syscall cancellation deadline声明。
- 原`b11afed3`源码最终11实际AssertionError/1pass；rootENOENT取消原本能在后续end check检测，不虚报新失败。最终10文件67项、恢复12项通过，七有效AssertionError反转均exit1且五source/test hash前后相同；root-open保护因outer scan catch覆盖而单独反转green，原日志保留不计有效。最初六/七反转分别绑定当时源码，final sweep重新绑定。scripts157、静态门/diff通过，NormProof packaged judge exit0/partial、0open/1failed advisory/10proof gaps。
- build`bee73a658dbb955dd52cf10665646b5c1ff10161f9479342a55fb2879bea53f5`，inputs`6095f8578c7fca83d2f8ed7ec62b3e392264edf2dffe736b251e4c0d69bd1d64`，artifact`bdf8e9cd9e45688c0c3e5fcdc83c05873ca31856e203d1f1904bff33481196e5`，exe SHA-256`ddc7d9c2a97897ef927d3252fa17b7d8dd43f8064958de397c44f86458609979`。同准确build Node/exe regular/fullscreen四格PTY pass/exit0，build-before/after完全相等；205record三页到最旧exact read-only preview、全query找到另一页、取消不写、hidden metadata变化拒绝续页；300份120KiB坏JSON导致累计source拒绝，移除fixture后可重开。全部原205workspace/record及blob bytes保持。初次多选More漏space toggle超时留存，按原multiple语义修probe后中间build四格通过；最终control源码再次rebuild、四格重跑才绑定。证据`.omx/artifacts/phase20-restore-catalog/`及author-binding。
- 独立code APPROVE/architecture WATCH，综合COMMENT无BLOCK，最终四production/newtest五hash匹配两报告/反转/final-binding。审查实际发现并修复root-open及iterator失败遮盖取消来源，两级actual Dir handle关闭回归保持。code独跑8文件59项、14实际production policy探针和六final control探针，实文件exact32MiB、20k/50k边界/default接受/完整分页及错误保真；首次pre-format hash guard拒绝留存不算pass。架构独跑6文件50项/12production探针，实文件exact32MiB+1、跨authority和typed错误；20k/50k exact/+1使用synthetic inventory接原reader，证明政策而非实盘scale/时延。所有import独立解析/AST职责上限及cycles通过；各自fixture已清除，不以supplied67项/PTY替代独跑。
- WATCH/剩余：每page/query仍fresh complete scan，20krecord的200page可累计4,000,000metadata acquisition，32MiB/call不代表全过程heap/latency/physical I/O或cache正确性。fingerprint仍乐观mixed-epoch detector，选择沿原选中record fresh equality及preview draft，非原子snapshot。default index inventories及restore picker one-use/surface admission、cleanse资源仍待后续；参考选择器实际cancelLoads/late identity与本仓reader取消一致，checkpoint单JSON/Git不提供同类累计policy。35complete/12partial保持。

- 代码批`e435261d55aa6a0c3d87c43c125a8e806d848cc8`已commit/push并读回远端main；精确CI`39960212912`/job`120436029565`completed/success，13:19:16Z–13:36:44Z；Watch`39960212790`/job`120436029146`completed/success，13:19:16Z–13:19:37Z。仅绑定此SHA。上段picker缺口由后续selection批处理，不能据此关闭PAN-06。

## 2026-10-23 PAN-06 undo 锁内目标读取（`b11afed3`已推送；CI/Watch success）

- 原`operation/restore`在批准后refresh通过才建立384MiB累计target-source读取准入，每file64MiB，覆盖完整locked preflight与原`commitWorkspaceFile`的before/final-current/after三次检查。共享commit只加neutral可选admitBytes，默认调用保持原路径，maxBytes与opened-size分配前计量由原workspace inspector负责；失败不退款，absent零body。普通来源`current+blob+metadata<=128MiB`推出`3current+blob<=384MiB`，没有改变preview128MiB政策。
- pre-intent全部target预检查超限明确blocked、receipt/target不变；durable intent之后沿原逐文件blocked/partial/unknown，已发布但读取验证拒绝保持unknown，不能升级success或自动重放。已restored-verified file仍进完整preflight但不再写；原exact approval、fresh revision/latest receipt、target/store locks、final state/path/identity/mode/content与temporary cleanup保持，无第二writer。
- 新八项在原`e40da34c`源码七项真实AssertionError；修复后12文件144项、恢复后1文件8项、scripts157与静态门通过。六有效AssertionError反转/hash前后相等；首次单次refusal用例因少一次检查后更晚仍throw而green，保留后改用精确三次charge vector；首次growth夹具未sync ESM导出、未触发锁注入失败保留，syncBuiltinESMExports修正后原源码读1028bytes而当前仅3bytes。NormProof packaged judge exit0/partial，0open/1failed advisory/10proof gaps。
- build`9815ce293fe76f2e0767f183681bbe7414e124a976b51008faa5b369a87828ea`，inputs`52bf57ff61d93375a10a4e278173cd715a19fb3e7c3239a77858d76cf961cf4b`，artifact`d076bf901faeeef7ccbd8ccb23cc85782eee4f75818399b082ea3ced2b83c881`，exe SHA-256`7b3732de81c711497e98d931f34878d104e1bd13c3e29bfb284e9a2653474e76`。同准确build Node/exe regular/fullscreen四格PTY pass/exit0，before/after完全相等：85条初始picker三页/最旧ID/cancel/stale/oversized拒绝，原owner新增第86条commit，preview取消不写、fresh明确确认后exact CRLF+emoji与durable restored-verified，最终command三页40/40/6；原workspace文件与85receipt字节保持。证据`.omx/artifacts/phase20-undo-writer/`及author-binding。
- 独立code APPROVE/architecture WATCH，综合COMMENT，无BLOCK；最终三production和新test hash均匹配两报告/反转/final-binding。code独跑6文件101项与12实际source探针（准入growth/UTF8/absent/approval/locked stale/partial恢复/unknown重放）；architecture独跑3文件29项和八实际production探针（实际64MiB+1零read、完整verified target检查、仅剩余file重写、post-publication unknown），366,145整数MiB组合验证预算算式，cycles零及AST ceiling通过。两lane直接root Vitest重复安装问题/serialized undefined夹具失败分别保留分类，正常workspace runner及精确serialized比较后通过；各自清除synthetic fixture，不以supplied144项/PTY代替独跑。
- 384MiB只是本attempt四处target-source准入，未覆盖store rereads、physical I/O/write bytes、其他explicit恢复consumer；保留原/refresh preview、同步inspection/hash/temporary内容仍非heap或最长响应保证。参考selected checkpoint+Git恢复无同类exact receipt累计界，本仓复用原maxBytes/admission/approval/writer，非whole-workspace snapshot。继续restore/cleanse/catalogue/heap/响应/平台缺口，35complete/12partial保持。

- 代码批`b11afed37ce6326a73e0e74932ce67318d19ceac`已commit/push并读回远端main；精确CI`39958229805`/job`120429334772`completed/success，13:04:35Z–13:21:39Z；Watch`39958229704`/job`120429334471`completed/success，13:04:35Z–13:05:00Z。仅绑定此SHA。

## 2026-10-23 PAN-06 undo preview 准备读取（`e40da34c`已推送；CI/Watch success）

- 原recovery record/prepare/blob链承载read access，每次preview累计128MiB来源bytes，包含snapshot JSON、blob和current file；JSON仍128KiB、blob/current各64MiB。按已验证opened descriptor size在分配/读取前扣量，失败不退款；累计拒绝清除此前prepared/current bodies，完整receipt文件均显示`preview-source-limit`且不能恢复，不回退older receipt。原workspace inspector只加可选admitBytes，启用时读取恰好已准入的原size，后续growth由原final stat拒绝；其他调用保持原读取路径。
- 原text reader改为exact validated size分配、64KiB异步分块，在metadata/blob操作及块之间检查signal/admission，前后验证path/inode/final stats并finally关闭。显式read-control错误穿过原metadata/blob catch，readAccess-only signal使用同一effective signal；原OperationAccess两次file assertion均经过同一typed admission，单次拒绝也不能被后续允许吞掉。preview revision按原`{receipt,files}`完整JSON字节增量hash，full current FileState身份/hash/mode/content绑定保持；原审批、refresh、target/store locks、receipt compensation与逐文件结果保持，无新writer/schema/executor。
- 原`eca77e90`源码七项实际AssertionError；最终16文件227项、恢复后2文件16项通过。12有效AssertionError反转均exit1且九份source/test hash前后相等；初次green/syntax-error反转尝试留存，不计有效证据。scripts157、cycles/config/declarations/Node floor/docs strict/diff通过；NormProof packaged judge exit0/partial，0open/1failed advisory/10proof gaps，裸CLI不可用不假报通过。证据`.omx/artifacts/phase20-undo-preview/`及final-binding。
- build`25029c0492bebb678a5f9739498c8f3cdaec392215b299f85e4a83120c1aa268`，inputs`1fbbd653b89546dc9b587ac7f5a0f18c71e8b798e0cd99955c987f33f5f9999e`，artifact`4ae99ec1e06034e036bd9e418026df97f501c4d6324251a303d01ecad6989749`，exe SHA-256`f1443622f813122620586905b88b70f672a56d25457d6763f0a5d3dfa752cab0`。同准确build Node/exe regular/fullscreen四格PTY pass/exit0，build-before/after相等；初始85receipt三页/最旧ID、cancel、stale/oversized拒绝，随后原compiled owner实际创建第86条committed operation，preview取消保留after内容/undo none，fresh明确确认后恢复exact CRLF+emoji并持久`restored-verified`。最终direct command完整86条三页40/40/6；original workspace file及85份original receipt bytes保持，新增target和receipt的显式恢复分别断言。result旧字段receipts85仅指初始浏览，final-binding另记commandReceipts86。最初preview/confirmation同步和index85→86夹具失败原日志保留，修正后四格重跑。
- 独立code APPROVE/architecture WATCH，综合COMMENT，无BLOCK；最终七production owner hash均匹配两报告，九source/test hash匹配反转与final-binding。code独跑十个exact limit/growth/approval/cancel/单次准入探针及3文件32项；architecture独跑growth实际回归、7文件49项、最终2文件16项及cycle/AST检查，全部owner不超过20声明。两lane实际发现并修复未计量growth、alternate signal吞取消、单次metadata及workspace admission吞拒绝；supplied与独跑证据分开记录。
- WATCH/剩余：128MiB只是该call已准入source bytes，decode/reencode/per-file JSON仍有临时内存，approved和refreshed preview可共存；current inspection/hash同步，块间取消不保证OS I/O deadline。后续锁内target/commit inspection未有maxBytes，legacy explicit restore/cleanse未加入累计policy，不能宣称完整writer I/O、heap/latency或跨文件崩溃原子性。目标catalog reader已采用stat-size/64KiB/final-version机制，本批在recovery owner适配；参考checkpoint/Git restore未发现同类exact receipt累计政策。继续这些本地缺口，35complete/12partial保持。

- 代码批`e40da34ce8ad15b076f85e6b7e158dce867a865e`已commit/push并读回远端main；精确CI`39956460655`/job`120423407252`completed/success，12:51:08Z–13:02:36Z；Watch`39956460529`/job`120423407196`completed/success，12:51:08Z–12:51:29Z。锁内target缺口由后续批处理，仍不升级全PAN-06。

## 2026-10-23 PAN-06 undo receipt 扫描与一次页面（`eca77e90`已推送；CI进行中/Watch success）

- 原operation store复用descriptor-bound `inspectWorkspaceFile`，index/receipt的8MiB限制移到读取前；每次完整scoped scan最多32MiB已准入UTF-8 JSON（含index）、50,000 receipt file entries和20,000目录项（含无关名称，opendir buffer32）。超限整份拒绝，不截断、不空成功；file数在单份最多256条的receipt解析后计入，允许检查一份超出累计条目预算的receipt才拒绝。目录cap只用于readOperations，allocateOperation沿原目录接受规则；直接readOperation仍可读合法单项。保留索引全receipt核对、顺序、profile/session/workspace及unknown/partial barrier和原写入器。
- 完整receipt值增量JSON hash与原`JSON.stringify({scope,receipts})`字节相同，游标兼容；每次page/action仍 fresh full read/hash，避免额外整份序列化字符串，未增加失效不完整的cache。root/history/confirmation关闭、选中和handoff一次消费并释放引用，迟到preview不能复活；registry接原surface准入，原scope/config/surface检查跟随既有OperationAccess进入恢复owner。same-owner拒绝可显示，换owner迟到结果不回填；取消后Restore必须重开确认。
- 原`cdce79a2`源码六项真实AssertionError，最终9文件246项通过；11有效AssertionError反转均exit1且11份source/test hash前后相等，初次10组另保留。scripts157、cycles/config/declarations/Node floor/docs strict/diff通过；NormProof本机裸命令不可用记录保留，仓库packaged judge exit0/partial、0open/1failed advisory/10proof gaps。原UI夹具不存在的workspace已明确mock其持久owner并publish匹配configuration，保留实际preview/Cancel/Restore检查；首次state文案夹具失败留存。
- build`acd77c67f3c9c064d94c79af92f8849cabd19d64a2e34939560311ebe0048405`，inputs`8866c32bb5f1ab6917748146cf1dc341cb5ee609299ffd4fac706b806bb0ad47`，artifact`07df074af53bd20469b617d2b4df8474ee63c47d000a2241ba1c2ad9624a0995`，exe SHA-256`37dbc0851968a2d208bfb379fc9d6e8b3dd89ae4cf0ca1eddf45ea2ebbce1e03`。同准确build Node/exe regular/fullscreen四格PTY pass/exit0，85条三页及最旧ID、cancel、外改receipt stale拒绝、8MiB+1 receipt拒绝，workspace及receipt字节保持；直接print三页有序完整。首次四格业务通过后因新增test输入freshness拒绝整份证据，日志保留；重建后build-before/after相等。证据`.omx/artifacts/phase20-undo-boundary/`与final-binding。
- 独立code APPROVE/architecture WATCH，综合COMMENT，无BLOCK；两报告绑定最终七owner hash。code独跑18个精确边界/身份/取消race探针、最终6文件124项；architecture独跑50 owner项、最终146 UI项、四probe组（100 cursor等价、reader-only cap与allocation分离、mixed epoch、生命周期）。归属清晰，不以supplied命令代替独立验证。实际owner最多15函数；registry既有37 property callbacks未新增，本批只改原薄delegate参数。
- WATCH/剩余：32MiB是已准入source JSON bytes，不是decoded/临时heap、总物理I/O/最长响应；同步full read/hash不能在事件循环中途响应Esc。现undo preview还保留snapshot/body及current content并序列化revision，单blob64MiB/最多256文件未建立累计预算；恢复accept后的取消沿原owner。跨receipt可mixed-epoch，fresh hash是乐观重验，原restore locks/approval/逐文件验证继续保证写入准入，非原子账本/跨文件崩溃快照。继续preview/restore/cleanse/平台与完整资源验证，35complete/12partial保持。

- 代码批`eca77e90a2bc8c0f25605709ebb9c43a831f8538`已commit/push并读回远端main；精确CI`39953749814`/job`120414346135`于12:29:56Z开始，最后读回in_progress（前13步success，tests运行中）；Watch`39953749731`/job`120414346195`completed/success，12:29:56Z–12:30:16Z。不升级CI状态；上段preview累计准备缺口由后续本地批处理，仍不等于PAN-06完成。

## 2026-10-23 PAN-06 back 持久来源与版本（`cdce79a2`已推送；CI/Watch success）

- 真实host的sessionTurns复用原`readSessionNavigation`，经已有metadata256KiB/state8MiB/transcript16MiB、50k物理行/20k tree entry限制取得active turns与version；原`getSession`吞异常后空数组路径退出该consumer。读失败、错误project root、损坏父链及活跃路径缺失消息均拒绝为unavailable；不把缺失的活动消息筛成成功，非活跃无关分支缺失仍不阻断back。
- opening version在同一source的每个RewindPoint保持，经分页选择传原`navigateSession`预读取检查及原revertTo/state-lock重验；已变化的来源不导航、不写文件、不回填draft；取消零导航。保留直接array picker API兼容，不加入第二套持久读取器/执行器。阅读参考active-branch/entry-ID/disposal决策后，本仓沿已有owner增加明确stat版本准入，实际draft仍来自原导航成功回读。
- 修正真实trust夹具后，两条host回归在原`4dccf94a`源码均实际AssertionError，原始fixture失败另存；独立审查实际复现并修复active-path缺失消息漏项，该回归先失败后通过。最终8文件223项、six effective AssertionError反转/hash前后一致、scripts157和静态门通过；NormProof exit0/partial、0open/1failed advisory/10proof gaps。反转期间review修复使初次sweep source-change拒绝，日志保留，最终六组重跑绑定。
- build`b9f4ce3848c0e5f3ded5fbfecad0dba201be306d036ff8ed450ff129beb89c55`，inputs`50a677650be71981020ba3f9a5a37974b6f29ec665589e31684773eca034fbbb`，artifact`65a9f00e03c8f4827ae2b5e0b47f383714d552ff067e1b17aae962f4c605e786`，exe SHA-256`8de4964af9783109f230a058d83b7628df55dc129769b7b46a34c474c29a354f`。同build Node/exe regular/fullscreen四格60题PTY全部pass/exit0：无效state明确unavailable、不改坏源；外部新增消息后选择拒绝且leaf保持；重新打开后确认原branch/draft，分页、取消与全部原消息/文件保持。build/源/hash前后相等；原构建中途测试改动freshness拒绝及exe stale拒绝留存后准确重建。证据`.omx/artifacts/phase20-back-binding/`。
- 独立代码APPROVE/架构WATCH，综合COMMENT（无BLOCK）；两报告绑定最终五份生产owner hash。审查lane分别独立编译probe验证不可读/合法空/活跃消息缺失/无关分支容忍、三页原version及exact选择；supplied223项/PTY与reviewer自跑检查分开记录。
- 完整已有navigation还构造所有branch投影，byte/record cap不证明瞬态heap或最长UI响应；stat version是乐观源身份，不是内容hash/跨文件原子快照。本批无新的性能改善声明；source/page性能只属于上批build。剩余undo/restore/cleanse及完整资源/平台/质量验收继续，不关闭PAN-06/47项，35complete/12partial保持。

- 代码批`cdce79a2bccbda032c8d2256ae309584f2da0355`已commit/push并读回远端main；精确CI`39951053368`/job`120405317114`completed/success，12:08:09Z–12:25:47Z，Watch`39951053367`success。仅绑定该SHA。

## 2026-10-23 PAN-06 back 来源与页面生命周期（`4dccf94a`已推送；CI/Watch success）

- 原`/back` opening捕获问题、原branch/navigation owner、完整raw prompt/ID/dropped、25项分页和全文搜索保持；新增source owner在构造候选及多模态join前计量：50,000来源turn、20,000候选、50,000 recorded non-context user content parts（有ID）、32Mi UTF-16 code units含ID/文本/分隔符。超限整份列表明确拒绝；同query匹配引用缓存跨页共享，取消/确认/交接释放原source/offered引用且旧页面一次消费。numeric literal ID先于ordinal，重复候选ID拒绝。
- registry在原session/config admission及signal许可后才调用既有sessionTurns；picker枚举及load/apply重验原准入。无新导航writer、模型消息或文件撤销路径，成功草稿仍来自原owner的实际持久回读。source限额是访问候选的边界，不是heap或原getSession整个文件读取的边界。
- 新六组用例在原代码均实际断言失败；最终7文件201项通过，11隔离反转均exit1/AssertionError且生产/测试hash恢复相等，恢复后12项通过；scripts157及cycles/config/declarations/Node-floor/docs严格门通过。NormProof exit0/partial、0open/1failed advisory/10proof gaps；source与rewind均在职责上限内，registry既有property callbacks未增加，advisory工具仅识别3个顶层声明。
- 固定2,500问题/10,240,000文本units/每题820逻辑行/30同Node warm调用，历史不可变build`3a6e68d86cda…`与本批`286e04001d95…`：99次续页总p95 708.70→1.33ms，构造加load p95 1.71→0.64ms，完整search p95 5.62→5.46ms；process peakRSS207,500/120,684KiB含fixture/imports/全操作，非瞬态heap。脚本/source/artifact前后hash相等；不声明max cap/fresh-process/exe统计性能。
- build`286e04001d95674d83a24b0a4ebacac971d9d544f53775fd751b9949152fd8da`，inputs`8ab79e0bc0ebae082f578ad9c1176cb156572e6c1ae26bdec5e215820d8894e7`，artifact`e803a55811e4eb36feeadd99c2457c261a994189640a1de35bfdddcab760987d`，exe SHA-256`6a779af96426236c6b59cb09f27250a8a2986988ee9076a074ddb323faaa0c1e`。同build Node/exe regular/fullscreen四格60题PTY全部pass/exit0：三页到头、取消保持leaf、exact/numeric focus、确认才原branch+draft、全部原消息/工作区字节保持。首轮exe/fullscreen等待重复footer超时保留；raw输出含目标页，probe改为等待title/question并保留最终leaf/draft断言后四格重跑通过。证据`.omx/artifacts/phase20-rewind-boundary/`。
- 独立代码APPROVE/架构WATCH，综合COMMENT（无BLOCK）；两份报告逐一绑定三份最终owner hash。reviewer独立真实Overlay关闭/捕获分页/一次消费/准入/多模态界通过，并以300个混合role/context/multimodal用例逐项对照原构建；supplied测试/PTY与独立probe分开记录。
- 剩余边界：原sessionTurns的getSession失败仍可映射空列表；构造前完整会话读取、打开时持久文件version、完整query同步/临时case-folding和heap仍待下一批。不以本批关闭PAN-06或47项；35complete/12partial保持。

- 代码批`4dccf94afe71d5bcf38710cd507ae0fcdf6aaf50`已commit/push并读回远端main；CI`39949109526`/job`120398929588`completed/success、11:52:04Z–12:19:19Z；Watch`39949109534`/job`120398929821`completed/success，11:52:04Z–11:52:24Z。仅绑定该SHA。

## 2026-10-23 PAN-06 复制来源与取消后派发（`c4cb2834`已推送；CI/Watch success）

- `/copy` 使用原 `Transcript` 来源和原剪贴板命令；打开只捕获 revision，admitted load 才枚举来源。每 opening 最多20,000个块及32 Mi UTF-16 code units（原文与label合计；不是heap bytes），超限明确拒绝，不截成成功。保留earlier来源、全文搜索、精确ID和原文；续页共享一个完整源快照及一个query匹配引用缓存，关闭/成功/交接使旧页不可复用并释放引用。摘要与复制行计数不再split全文成数组。
- picker 的load/apply检查原session/config admission及signal；原文revision拒绝在同owner的真实 `InteractiveMode` 仍显示，换owner的迟到结果不回填。原剪贴板owner在终端offer前、每个fresh native fallback前和最后失败后重验；已经派发的成功仍为copied，终端offer保持offered，取消/blocked不能授权下一次程序派发。双系统单候选回归覆盖最后失败，不声称已派发动作可撤回。
- 最终8文件205项通过；result-contract 6套158项、scripts157及静态门通过。11组实际AssertionError反转绑定最终四份生产源码hash并保持字节不变；首次新增取消/准入用例在原代码3项失败。独立代码APPROVE/架构WATCH；复核发现并修复同owner拒绝提示被吞、异步fallback取消后继续派发及单候选末尾状态遗漏。反转首次扫描期间源码因这些修复变化，hash guard拒绝计为最终证据；最终重跑已绑定。
- 固定2,500块、10,240,000源码units、每块820逻辑行，历史不可变build `de428d7ffd2d…` 与最终同机同Node各30次warm调用：24次续页总p95由222.66ms降至0.76ms，load p95由4.04ms降至0.88ms；最终search p95 6.59ms。无冷盘/fresh-process/exe分布声明；process peakRSS213,252/113,348KiB包含导入/fixture/全部调用，非瞬态heap峰值。脚本/生产源码/compiled artifacts前后hash相等。
- build `3a6e68d86cda3b90d0f0ea0a48adacc0c81ad030ff5d8dbcd04d82d621e434a9`，inputs `4a1ed9fe8734fd78c10a2d574025ca47e741e813ce34031a2a005bbd899e5b0c`，artifact `35fe5e1b744fd64992c68108cc6b202217ed80f347510244b7353f267c5a6f6f`；exe SHA-256 `d051a88ec2db59d9048487370944edfc48c08c1e300bf4ad6d3acbaf5872abd4`。同build Node/exe × regular/fullscreen四格copy专用PTY pass/exit0，205原block完整三页及全文到最旧源、取消零clipboard、精确原文OSC52、原branch/工作区/205原消息保持；不声称真实系统剪贴板接受。证据 `.omx/artifacts/phase20-copy-boundary/`。NormProof exit0/partial，0 open、1 failed advisory、10 proof gaps。
- WATCH：参考选择器的dispose和一次完整history成本边界已作只读比较；本仓保留完整分页可达及原copied/offered/unavailable状态。完整query仍同步扫描admitted text，临时大小写字符串/clipboard encoding和宿主已有transcript内存不是该source cap的heap保证；copy本批不扩大为全PAN-06闭合。矩阵仍35 complete/12 partial；其他导航消费者、真实系统复制与全阶段交付继续原范围。

- 代码批 `c4cb28347313178f140849812139113ac78bb2ff` 已提交、推送并读回远端 main。CI `39946998111`/job `120391995287` completed/success，11:34:20Z–11:51:42Z；Watch `39946998109` completed/success，11:34:16Z–11:34:39Z。状态只绑定该SHA。

## 2026-10-23 PAN-02/PAN-06 树面板重复渲染（`3eed364f`已推送；CI/Watch success）

- 原 `renderPanel` 每次焦点按键重新测量完整候选label。现 `OptionModel` 在候选/过滤应用时递增revision，panel以WeakMap保留三个数字（revision/longest/measured），焦点移动复用；饱和后停止扫描，扩大窗口后继续，same-array刷新也失效。保留原全局详情列对齐，未改成随viewport漂移。参考的visible-window渲染决策用于避免每帧catalogue工作；当前初次/过滤/展开仍单独评估。
- 恢复后7文件203项、scripts157、静态门、build/exe、diff check通过。六有效AssertionError反转（复用、候选revision、filter revision、饱和、resize续测、详情列位置）均恢复原hash；详情非空、明确列起点和fresh filtered oracle防止伪等价。独立代码APPROVE/架构CLEAR，综合APPROVE；审查另60,000次width公式随机对照通过。
- 固定20,000节点saved chain的实际 `treePicker+OverlayHost`，120×40、同Node进程30次交替Up/Down加render。历史build `8e2c15e28017…` p50/p95/max为172.12/203.02/287.96ms；最终build `de428d7ffd2d959f38a913bd8770dec99ab1c7c97cbf201e7f4b965623c3be7f` 为3.34/8.38/18.16ms。load210.86ms、完整尾部search24.69ms、close0.28ms均仅一个observed call；processPeakRSS207,032KiB含导入/全部调用，非瞬态heap。每份script/source/artifact前后hash相等；未声明冷盘/fresh-process/exe性能分布或完整byte-tier资源完成。报告 `.omx/artifacts/phase20-resource-measurements/panel-{baseline,final}.json`。
- 最终inputs `e1a86ca2ee2a2a7d31ca07277981f8fd34e174ac76a96833801a46f99775e3a2`、artifact `95d807819c210aa05fe7af93fe899e3186ab6123efc6c4ef57d574d3ad054e1e`、exe SHA-256 `a9caef548956536606a0260a882c61ca69ac0077828f4c797006733fb2cfbca2`；Node/exe regular/fullscreen四格全部pass/exit0。证据 `.omx/artifacts/phase20-panel-de428d-{node,exe}-{regular,fullscreen}/`。补测试后首次两格build freshness拒绝保留，重建后通过。NormProof exit0/partial，0 open/1 failed advisory/10 proof gaps；矩阵仍35 complete/12 partial，PAN-02/PAN-06不因本批完成。

- 上批 `3eed364f04fb9b82f45d17f0fe2b94aba827b15b` 已从GitHub读回：CI `39938115685`/job `120362573820` completed/success，10:18:07Z–10:29:07Z；Watch `39938115906` completed/success。仅绑定该SHA。

## 2026-10-23 PAN-02/PAN-06 深树终端与摘要资源增长（代码批 `47b4f300` 已推送；CI/Watch success）

- `/tree` fallback 与 `/history` 共用 `cli/output/navigation.ts`：最多20,000条body行、16 MiB UTF-8 body，显示缩进最多10层加明确深层标记；完整entry ID/label/current/unavailable保留，持久树depth/parent不变。嵌入CR/LF/U+2028/U+2029行字段拒绝为unavailable，不截断成成功；实际20,000链与multiline保存ID同时验证两个caller及保存字节保持。
- 原 branch_summary 每次spread累计messages，长尾compaction每次slice/spread；现在branch直接append，compaction使用顺序消息tail窗口与反向checkpoint前缀，最后一次flatten。丢弃前缀至少占buffer一半才copyWithin回收；累计移动可归于已丢弃消息，不重复复制长尾。undefined/空summary、timestamp、kept/reset及旧fractional/Infinity兼容保持；180递增参考前缀及独立37,500随机前缀一致。源准入夹具20,000节点+30,000 branch/compaction记录、50,000物理行均保持原文件。
- 反转恢复后10文件155项通过（projection5），scripts157、静态门及build/exe通过；七有效AssertionError反转并恢复hash：indent、rows、bytes、line boundary、branch copy、compaction copy、reclaim。首次indent反转只触发预算Error，追加明确not.toThrow assertion后才计有效。独立代码APPROVE、架构CLEAR，综合APPROVE；此前discarded-prefix retention WATCH已由回收及40批/400移动引用回归解决。
- build `8e2c15e28017f75a95134dfe458dbd3406e221529ea7fb239c8dc7abab040f9b`，inputs `bc7d8bc81e8294db2e1860f7339a838e7c405fb85ad6fd4e4ec9d1c1a26294d9`，artifact `267fc962f917a2627871b6a9edb8972aa8739d9fe50993e756f69e6fbd927520`，exe SHA-256 `42867873e0511a6ac06a4f83d7a1eff4f86605a737f135c160e27fd7abc5dcaa`。同build Node/exe regular/fullscreen四格pass/exit0，tree/catalogue/管理/stale-choice业务链通过。首次exe fullscreen保留query前第二行焦点导致first=00假设超时，harness读实际identity逐步Up至00再逐Down验证；失败保留，未改产品焦点。证据`.omx/artifacts/phase20-resource-synchronized-{node,exe}-{regular,fullscreen}/`。
- 资源测量绑定同build compiled Node模块，固定isolated fixture在child外准备；parent/child脚本、所有源文件与compiled artifacts前后hash相等。9组每组30次同进程调用/强制GC，普通链、30k branch与30k保全tail checkpoint分别测acquisition/tree/history。body输出由历史400,597,883/873 B降至1,097,729/719 B；最终acquisition p95为212.73/245.53/255.59ms，tree/history p95范围227.04–394.59ms，整个30-call child peakRSS范围236,704–307,676KiB。每次6个descriptor read、实际源bytes4,164,940/7,772,728/7,862,732。peakRSS含imports/全部调用，heap只是阶段保留值；并非瞬态peak heap、冷盘、fresh-process分布或exe性能证明。
- 历史build `1420dbb8c480…`仅9组各一个observed call，branch/checkpoint acquisition为20,303.92/27,709.43ms；无baseline p95/统计内存改善声明。早期未绑定脚本及夹具重写/脚本中途修改被version/hash保护拒绝的尝试保留，最终frozen baseline与reclaimed报告前后hash均相等。证据`.omx/artifacts/phase20-resource-measurements/{baseline,reclaimed}-summary.json`。9非文档输入冻结读回在resource-delivery；真实全屏interaction/search/render峰值、取消响应、完整catalogue累计I/O和其余PAN-06消费者仍缺，PAN-02/PAN-06与47项矩阵保持partial。

## 2026-10-23 PAN-02/PAN-06 保存管理动作准入（代码批 `4942064c` 已推送；CI running/Watch success）

- rename/delete/pin 复用原 lifecycle owner：准备前、异步目录解析后和原锁内写入前重验实际 surface/configuration 权限；带参数的 `/pin` 与 scripted rename 也捕获同一配置准入。已关闭、pending stop、停机或权限撤销拒绝迟到动作，保留保存字节和当前身份。
- direct delete/rename 的 preview 仅消费一次；取消使旧 preview 和 title editor 失效，合法 parent→editor 交接保留准入。参考选择器的取消清除目标与 disposed 后拒绝迟到结果决策；本仓库继续使用现 writer/lock，不另建持久状态。
- 受影响6文件196项通过，六有效反转均实际 AssertionError 并恢复 SHA-256：surface、locked admission、delete cancel、editor cancel、scripted rename、scripted pin。反转恢复后3文件51项通过；scripts157、syntax、cycles/config/declarations/Node floor及要求矩阵通过；NormProof exit0/partial，0 open/1 failed advisory/10 proof gaps。独立代码 APPROVE、架构 CLEAR，综合 APPROVE，只覆盖本批管理动作。
- build `1420dbb8c4801999484096de9c11a9bcfbdc60a56df9e6499a6a52e9ce1d42e1`，inputs `2c325e9677ca10c0ff9d8f73c5030c75bdd81f101666d791707d9bb9ddafd39e`，artifact `b2f2a4e426ad6861b7d2f05ad158476a7096341486a356cc6b9d8d59a98b1239`，exe SHA-256 `cc3165dc2acf2e66694f5f2f5ae6f54d3f03b0865dfdcc4d06a5835783ff8f60`。同 build Node/exe × regular/fullscreen 四格 pass/exit0，删除取消 hash 不变、改名 editor 交接/写后 title 读回及对话/当前会话字节保持；tree、45匹配/固定40行目录续页及四种 stale choice 回归通过。证据 `.omx/artifacts/phase20-management-complete-{node,exe}-{regular,fullscreen}/`。
- 首次 exe regular 批量方向键检查超时，改为逐行等待实际 Identity 与 next-page 焦点；rename probe 等待可选择动作行和 target ID 后再确认。最后一次 build 后缺 verified exe 的两项 preflight refusal 保留，重建 exe 后四格通过。scripts 首次旧 PTY relay 重复输入造成 EPIPE，未改该测试，原套件重跑157通过；保留失败分类。交付输入冻结及读回在 `.omx/artifacts/phase20-management-delivery/`，PAN-02/PAN-06 和47项总矩阵仍 partial。
- 代码批`4942064c3129ae9c48b2cb0ad4b8cac39f04aa74`已推送，远端main精确读回；CI`39931286844`/job`120339906621`最后读回in_progress，2026-10-23T09:21:40Z开始，前13步success、tests运行中；Watch`39931286854`completed/success。间歇GitHub API EOF不升级CI状态，两项只绑定此SHA。

## 2026-10-23 PAN-02 完整授权目录与固定页（代码批 `d5e18253` 已推送；CI/Watch success）

- 原 search 在 newest 10k 之后过滤，完整 scan 仍可能将旧匹配报告为不存在；More 累加到10k即停止。现在原 catalogue 在scope/reentry/query过滤后保留最多41个排序候选，另保留matching current；输出最多40条普通行加current，cache512、diagnostic samples32、discovery16/64、concurrency4不随目录条数累加。
- 固定页续接绑定session、normalized project、allProjects、query、page size以及原pinned/time/ID边界与exact source version；仅scan结束且anchor后二验后发布。下一页前后二验原anchor，变化/丢失要求reopen。每页是live rescan，不能证明冻结目录；新增/重排行落在前页范围时需刷新。complete表示扫描结束，partial源不宣称no-match或已到头。
- query-clear停止continued base并推进generation，迟到订阅不能恢复旧页；scope/query/local pin重新从首批获取；原previewEnd释放，accepted选择先捕获target/version再释放请求/maps。action:more/action:refresh位于合法saved ID字母表之外，实际saved IDs more/refresh仍可恢复。current首帧/原writer/锁/版本准入保持；排序提取后保留原invalid-date回退语义。
- 受影响8文件128项与原consumer6文件195项通过，scripts157、静态门与build通过；五有效反转均实际AssertionError并恢复hash：过滤前置、final-only cursor、anchor、query-clear subscription、action ID。独立代码APPROVE/架构WATCH，W6整体仍partial。
- 最终排序兼容集合3文件80项通过；13个非文档输入hash读回相等。build `eec8d50d5356ec02122c00c9a565f620d30cc82131e391bb9315d33d287f388a`，inputs `05b61ddae181911b4c13df3b0a08edf1e233f00b6d81a5ee92a4aac739f7ac4a`，artifact `a8742320eca8be94d329c025078145c92be19c876f38bed61713b518264dcd0e`，exe SHA-256 `498d4a2caff7dd32b3eaafb25d9e52a67022eeba153a6833403691c4e20f5b5f`。Node/exe regular/fullscreen四格在同一build重验pass/exit0：45条真实chooser查询、40条首批、第二页和取消保存hash不变，同时回归四种stale choice、tree与既有业务链；证据`.omx/artifacts/phase20-catalog-order-{node,exe}-{regular,fullscreen}/`。首次旧narrow footer断言失败已分类为explicit end状态覆盖footer的旧预期并保留log，未改renderer。代码批 `d5e18253081fa59a513f422ba621dc5d122485b6` 已推送并精确读回；CI `39923165586`/job `120313029789` completed/success，08:13:41Z–08:31:01Z，937文件/9,986项通过、3项跳过、949.74s；Watch `39923165752`/job `120313030605` completed/success。两项只绑定该SHA。

## 2026-10-23 PAN-02 tree 表单与有界获取（代码批 `a0a38886` 已推送；CI/Watch success）

- /tree 复用现 full-screen panel 的宽屏详情列与窄屏 Preview；TreeModel 只持有显示展开态和 parent/end 索引，Left 为 collapse/parent、Right 为 expand/child。搜索完整 admitted 节点文本，临时穿透折叠而不清除展开态；稳定 current focus、未展示节点不 apply、取消和已接受选择释放保存投影，重复 pending 选择零动作。fork/history 保留原动作表面。
- 每次打开上限先冻结再实现：metadata 256 KiB、state 8 MiB、transcript 16 MiB，合计24.25 MiB源文本；20,000个树节点、50,000物理transcript行、1,200字符详情摘录。原 descriptor reader 在 open 后再次校验字节/UTF-8/identity；catch-up 在构建前比较既有与缺失节点总数，context summary 不算新节点。上限不代表已测heap或时延，超限报告 unavailable。
- bounded acquisition 拒绝损坏/未知provenance transcript、重复event ID、重复树ID及catch-up之前缺失的named active leaf；修复display edge的cycle/orphan仍显示disabled。原普通replay兼容与writer/lock保持。path改为push/reverse，深20,000节点验证不调用unshift。
- 聚焦11文件261项、脚本157项、cycles2,777文件零runtime/type、config53/53、declarations18/18+11/11、Node floor、strict docs/diff check通过；NormProof exit0/partial，0 open/1 failed advisory/10 proof gaps。独立代码APPROVE/架构WATCH，synthesis COMMENT；source bounds不是性能完成证据，既有overlay callable count23未增加。
- 七组有效反转均实际assertion failure并恢复字节：collapse、full search、preflight size、descriptor size、damage warning、catch-up cap、accepted-choice cleanup。首次pending cleanup反转只触发timeout，不算有效，追加accepted-choice assertion反转后七项闭合。
- build `2e2164f27b2d607cd1ebd6ec79e7b3d0820bb7ffcd0bbdd00054b74a69c988b8`，inputs `a93860d273b99e8552874a7d6fff2a214a15386cbd9fecbc52a4560214cd8abf`，artifact `1fa6c1f273594c629992f39d374a958978aa9c6b13a15f2361bc623101ee5521`，exe SHA-256 `cf40e424983d55b82f1629d77a85b2771faf7d0ac877f994a6616e9736591b61`。Node/exe × regular/fullscreen四格pass/exit0，tree details/keys/search/cancel与四种stale selection均取证，保存文件hash相等。证据 `.omx/artifacts/phase20-tree-2e2164-{node,exe}-{regular,fullscreen}/`；node regular成功retry另在后缀`-retry`目录。旧失败保留：两次harness误将collapse/parent和expand/child合一步；一次源码反转中运行导致build freshness拒绝；一次Node启动读取build transaction失败，单格retry通过。
- 最终完整 `test:ts` exit0，935文件通过/1跳过，9,955项通过/10跳过，825.94s；采用现有Vitest环境变量限制为两worker，测试后17个非文档输入SHA-256全部与冻结快照相等。代码批 `a0a3888697dc669c32807bc9cbe0bd4c05728651` 已推送，远端main精确读回；CI `39919466867`/job `120300924977` completed/success，07:41:36Z–07:58:43Z，935文件/9,962项通过、3项跳过、939.96s；全部步骤success。Watch `39919466951`/job `120300925354` completed/success，两项只绑定该SHA。PAN-02保持partial：上述admission是源/记录上限，累计同步I/O、peak heap、交互响应与全部目录/动作合同未闭合。

## 2026-10-23 PAN-02/PAN-06 保存选择边界（代码批 `2e68fd54` 已推送；CI/Watch success）

- resume/tree/fork/history 绑定实际展示时的 session ID、完整保存版本和原 admission；resume 在异步解析后及原 state lock 内重验，fork 在创建新目录前重验，tree 导航在 summary 后的原 writer 边界重验。分支 A→B→A 也使旧选择失效。
- 导航比较 metadata/transcript 版本及除 usage/requestLedger 外的完整 state；实际 summary usage sink 的记账保留且不误拒绝自身计量，外部 transcript/state 修改仍拒绝。
- 原 interactive owner 将 stop/closing、取消 revision、aborted controller 传入选择 admission，自身 command busy 不使合法选择失效。激活开始后的 writer/lock-cleanup 错误分开报告：精确文件版本与只读 registry 读回一致时采用目标并显示警告；无法验证时保留旧 runtime 并阻止继续操作。两者均不自动执行恢复任务，不暴露原异常正文。
- 独立代码审查 APPROVE，架构 WATCH，无剩余阻断；WATCH 为既有职责上限及本批不闭合的 tree/资源范围。已有 drag/copy 的 42 项测试按 HEAD 原字节恢复，新生命周期用例独立放置。
- 受影响集合 24 文件/398 项通过，新增 registry 三分支只读/普通修复合同 3 项通过；result-contract 6 套/158 项、脚本门 157 项通过。六组有效反转均实际断言失败并恢复原字节：resume offered version、tree stale、summary fence、surface lifetime、read-only registry、publication-start。
- TypeScript build `e76a93d26bea083712065ebc14af837f8508b67bd5e6aef7d04d1e4f336e05d2`，inputs digest `cbc141ffb6843cc105a2fefd8f5ac210b3f69df36d1fe5461bbc88cbe5aa05f5`，artifact digest `5ccaf5f041fd7129e547b4ec66578925fbbc2d47cf955eb3a28e8fa49385b4c8`，exe SHA-256 `efaed6e1c5a5d86ff6f62043c3fbe823d0cd4f8f1712a6371b0f7ecd1414e7a9`。Node/exe × regular/fullscreen 四格全部 pass/exit 0，每格拒绝四种过期选择并记录注入后 metadata/state/transcript/current pointer 的 SHA-256 不变，同时保留合法恢复、数学源复制/导出及既有业务链。证据目录 `.omx/artifacts/phase20-selection-e76a93-{node,exe}-{regular,fullscreen}/`。
- cycles 2,773 文件/零 runtime/type cycles、config 53/53、declarations 18/18与11/11、Node floor、strict docs 与 diff check 通过；NormProof exit 0/partial，零 open obligation、一个 failed advisory obligation及10个 proof gap，既有 ceiling 不改写为通过。首次误写不存在的 tgz 版本导致 ENOENT，改用仓库实际 `normproof-0.1.0.tgz` 后运行通过，未修改门禁。
- Node/exe × line/pipe 另四格全部 pass/exit 0，仅回归既有命令、工具发现、任务与审批链，合计 Linux 八格通过。旧失败保留并分类：并发 executable build 的启动拒绝是构建调度；误将 `/resume panel` 报告面当选择器导致两格超时是 harness 入口错误，改用裸 `/resume` 后上述四格通过。
- 首次完整 `test:ts` 实际失败：930文件通过/3失败/1跳过，9,931项通过/5失败/10跳过，535.64s。五项均位于三个浏览器CLI scenario文件，超时或缺预期输出；隔离重跑结果见下一项，不能将此轮记为通过。
- 上述三个失败文件保持代码/断言不变，以 `--threads=false` 单独重跑3文件22项全部通过，163.95s；定位为并发负载下CLI子进程/超时失败。最终全量用 Vitest 现有 `VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=2` 控制执行并发，未修改 package scripts/build/测试超时或断言；最终全量 exit 0，933 文件通过/1 跳过，9,936 项通过/10 跳过，877.36s。
- 本批不将 PAN-02/PAN-06 改为 complete。最终完整测试已通过。代码批 `2e68fd54e2552121e41cf3044a06a2476146c086` 已推送，远端 main 精确读回；CI `39914569820` completed/success，933 文件/9,943 项通过（3 项跳过，917.30s），静态/脚本/构建/完整测试/NormProof 步骤均 success；Watch `39914569843`/job `120285089017` completed/success。CI job `120285088911` 后续读回 completed/success，06:56:18Z–07:13:00Z；先前 job 字段延迟现已同步。

## 2026-10-23 RENDER-01 数学 token、显示边界与打包导出（代码批 `5150a635` 已推送；CI/Watch success）

- `presentation/tui/transcript/math.ts` 现在拥有有界 math finder：代码 span、escaped dollar 和金额优先，未知/缺参数命令使整个公式回原文；`equation*`/`align*`/`gather*`/`multline*`/`cases` 与五种矩阵环境按行投影，nested 环境、12 行/12 列/64 cell/24 行/64 KiB 超限均保留完整源码。
- `presentation/tui/text/inline.ts` 在 code span 之后、link/emphasis 之前把数学作为 opaque token 处理；`$a*b*c$` 不会被当成强调，公式内 Markdown link 不会生成 OSC8。`markdown.ts` 与 `session/export/htmlRender.ts` 共用同一 finder，HTML 对投影文本再次转义，`template.ts` 以 `white-space: pre-wrap` 保留矩阵行。
- 裸 `\begin{...}` 由共享 scanner 识别为一个 math node，完整环境保留给投影和源复制；未闭合 opener 在逐字 stream 中立即显示，闭合后才投影。完整 matrix node 的 selection 通过 `block.raw` 返回原始 LaTeX。
- 聚焦 6 文件/158 项通过：math 8、markdown 59、source 20、HTML 40、template 10、export runtime 21。三组有效反转均实际失败并恢复：移除 opaque math token；HTML 改回 scalar conversion；恢复 partial unknown-command projection。
- 完整 `test:ts` 为 931 文件通过/1 跳过、9,905 项通过/10 跳过、359.32s。`test:scripts` 157/157；Node/exe × regular/fullscreen 四格打包 PTY 全部 pass/exit 0，验证 math 投影、`/copy` 原始 LaTeX、`/export html` payload，fullscreen 还验证矩阵行和旧/新 diff 源复制；Node/exe × line/pipe 另外四格 pass/exit 0，只回归既有业务链。
- TypeScript build `99e27b71db4bd5f9bf17edceec5e433bda2a058a9b836fd173a04e38f38e41f4`，inputs digest `616922d083cfdb4aab69b2f2c95467ec1332e3c4ea7f05f6b26d1a9661d08b87`，artifact digest `f30da6af85545cf13a7915e064679aa0d84ce95e25d3bd7bf2ad78798599cac8`，executable SHA-256 `506d47a52a7572a5e2589f0a4271bf6b43c26cfd5c4d899c9228341e816d7a49`。证据目录 `.omx/artifacts/phase20-render-math-pty-99e27b71db4b/`。
- 当前矩阵为 35 `complete`/12 `partial`/0 `open`。代码批 `5150a63590275f76ff497e1b40a88fd928201d4a` 已推送；CI `39905250082`/job `120255608099` completed/success，全部步骤 success，05:20:55Z–05:32:36Z。Architecture Watch `39905249968`/job `120255607874` completed/success；两项结果仅绑定该 SHA。本次重新从 GitHub 读回结果，修正此前未提交/CI pending 的过期文字。

## 2026-10-23 RENDER-03 大 diff 完整查看与 RENDER-02 CI 稳定化（代码批 `9250632d` 已推送；CI/Watch success）

- `presentation/tui/transcript/diffPage.ts` 现在拥有 400 行/64 KiB 的源页预算、精确 UTF-8 边界和跨页 old/new 行号状态；`diff.ts` 在 `split` 前先按双预算扫描源，左右源选择的分界改为两内容 cell 之间的 divider，`diffLines.ts` 承接 header、EOL、byte 和终端安全显示辅助。
- `chrome/pager.ts` 对超出 inline 预算的 diff 打开有界完整阅读器，支持 PgUp/PgDn、滚轮、Home/End 和分页续行；`surface/pane.ts` 将 pointer 的 content 坐标映射回 screen 行，修复填充行/滚动窗口下的源复制。`source.test.ts` 与 `paneDiffSource.test.ts` 已改为只通过 `screenToContent()` 传入 selection。
- `markdown.test.ts` 的超链接断言现在先快照并固定 `defaultTheme` 为无颜色模式。该 CI 失败已用 `FORCE_COLOR=3` 本地复现：颜色 SGR 位于 OSC8 label 内，旧断言错误地要求 open/label/close 连续。
- 聚焦 9 文件/199 项通过。三组真实反转均取得断言失败并恢复：移除有界源扫描使零宽超预算 diff 不再出现截断标记；恢复旧内容分界使左右源复制返回 `new line`；移除 content-to-screen 映射使两侧源复制返回 `undefined`。产品文件 SHA-256 已逐项读回恢复值。
- 完整 `test:ts` 为 931 文件通过/1 跳过、9,893 项通过/10 跳过。`test:scripts` 157/157、cycles 2,771 文件/0 runtime/0 type、config consumers 53/53、declarations 18/18 + 11/11、Node floor、strict docs/rules 与 `git diff --check` 通过；NormProof exit 0/partial，0 open obligations、1 failed advisory obligation、10 proof gaps。
- TypeScript build `69952ded38bf2b30096cb18b8d3470972aea0d7f8e6682ea1ac3865b92d7c6f2`，executable SHA-256 `09e49dd189a22a2b1e2bd263c3f0339df54747122962a99a11be572a8e518c54`。Node/exe × regular/fullscreen 四格打包 PTY 全部 pass/exit 0；两份 fullscreen raw output 的 OSC52 payload 解码后均精确为 `qa-old-side-source` 与 `qa-new-side-source`。证据目录 `.omx/artifacts/phase20-render-diff-pty-69952ded38bf/`。
- RENDER-02 的精确提交 CI `39894148326`/job `120220534823` 为 completed/failure：929 文件通过/1 失败/1 跳过，9,889 项通过/1 失败/3 跳过；失败项就是上述 hyperlink 断言，并非 viewport 行为。该失败 run 保留。
- 代码批 `9250632d9946295d55215dc9941959174abb3af3` 已推送，远端 `main` 精确读回同 SHA。CI `39898564931`/job `120234580498` 为 completed/success，耗时 17m06s；完整测试 931 文件通过/1 跳过、9,900 项通过/3 跳过，静态门、脚本门、构建、Chromium 安装、完整测试与 NormProof 步骤均 success。Architecture Watch `39898564927`/job `120234580519` 为 completed/success。两项只绑定该代码 SHA。`verify:phase20-requirements` 更新为 34 `complete`/13 `partial`/0 `open`，RENDER-02/03 闭合，Phase 20 整体仍为 `partial`。

## 2026-10-23 RENDER-02 OSC8 与打包源复制（前序本地代码批；后续结果见顶部）

- `presentation/tui/text/link.ts` 现在由单一策略校验 terminal/HTML 共用链接目标：只允许 `http`、`https`、`mailto` 和无 scheme 相对目标，剥离 C0/C1 控制符，拒绝 `javascript:`、`data:`、`file:` 等可执行或本地文件 scheme。可见 URL 与 OSC8 目标都先经过该策略，恶意 BEL/ESC 不能闭合或改写终端超链接。
- Markdown link label 通过 OSC8 投影；ANSI-aware 软换行会在每个物理行末关闭仍打开的 hyperlink，下一行由原 escape prefix 重新打开。表格 cell 在填充前再次封闭未完成 hyperlink，因此边框、padding 和后续列不会被链接污染。
- `session/export/htmlRender.ts` 改为复用同一 URL 策略，不再维护第二套允许列表。源复制仍绑定原始 Markdown source：表格 row 显示 OSC8，但完整 source selection 返回原始 `[label](url)` 字节。
- 聚焦 6 文件/144 项通过。两项隔离反转取得实际失败：移除 scheme guard 使 unsafe 用例把 `javascript:` 写入 OSC8；移除逐行关闭后，长 label 的首个换行行不再包含 hyperlink close。产品源码已恢复。
- 最终完整 `test:ts` 为 930 文件通过/1 跳过、9,883 项通过/10 跳过、382.96s。`test:scripts` 157/157、cycles 2,768 文件/0 runtime/0 type、config consumers 53/53、declarations 18/18 + 11/11、Node floor、strict docs/rules、`git diff --check` 与仓库 tgz NormProof exit 0/partial（0 blocking、11 项既有 ceiling advisory）通过。
- TypeScript build `bebadefb62b754b0f8d3aed2ada99271c2de536c615bfb519e0178d816050cfb`，executable SHA-256 `a260a038354d02c91df0d15afec50f6ef9af664707550bdbc7f8a683cfd80722`。Node/exe × regular/fullscreen 四格打包 PTY 均 pass/exit 0；四份 raw output 都含目标 OSC8，`/copy` 的 OSC52 payload 解码后均为 49-byte 原始 Markdown source。证据目录 `.omx/artifacts/phase20-render-link-pty-bebadefb62b7/`。
- 本批当时只把 RENDER-02 的本地、完整测试、构建与打包证据闭合；后续 `9250632d` 批修复 CI 断言并完成矩阵更新，最终状态见顶部。

## 2026-10-23 浏览器响应预算错误优先级修复（代码批 `7262c80f` 已推送；CI/Watch success）

- 证据文档提交 `eedd737028f139c587670ded008717c8eeecc000` 的 CI `39889803714`/job `120206584567` 在完整测试第 634 秒失败：`src/browser/smoke/request.test.ts` 的 gzip 解压预算用例期望 `unsafe-output`，实际得到 `request-failed`；其余 927 文件通过/1 跳过、9,882 项通过/3 跳过。该提交的 Architecture Watch `39889803712`/job `120206584691` 为 completed/success。失败 run 保留，不记为通过。
- 同一代码 SHA 的上一轮 CI `39888154616` 已成功，说明该失败不是稳定功能回归；但新增 `core/network/body.test.ts` 用解压后超预算并伴随 decoder cleanup error 的确定性场景复现了真实竞态：原实现会把 `response_limit` 覆盖为 `invalid_response`，最终投影为 `request-failed`。
- `responseBody()` 现在记录预算已越界这一终态事实；decoder cleanup 与 `pipeline` 收尾不得把该终态降级为通用解析错误。未越界时仍按原合同把损坏压缩流归一为 `invalid_response`，且不泄露 decoder 诊断。
- 聚焦验证 44 项通过：body 回归 1、connection/response 20、browser smoke 23。`npm run build` 通过，build ID `2899cba44e0c`；`test:scripts` 157/157、import cycles 2,766 文件/0 runtime/0 type、config consumers 53/53、declarations 18/18 + 11/11、Node floor、strict docs/rules 与 `git diff --check` 通过；docs-source 118 项仍为 advisory。仓库 tgz NormProof exit 0/partial，0 blocking，保留 11 项既有 function-ceiling advisory。
- 失败 run 的 rerun 已完成：CI `39889803714`/job `120210780809` 为 completed/success，但只绑定旧证据 SHA `eedd7370`，不证明修复代码。修复批 `7262c80f9386e8d74fe6ddece21d8615b2931ad7` 已推送且远端 `main` 精确读回；CI `39891648409`/job `120212557672` 为 completed/success，929 文件通过/1 跳过、9,884 项通过/3 跳过、947.35s；Architecture Watch `39891648398` 为 completed/success。两项只绑定该修复 SHA。

## 2026-10-23 PAN-03/PAN-05 and RENDER-02/03 rework（代码批 `cd28d8ca` 已推送；CI/Watch success）

- `hubPicker` now rejects old-session applies, stops publishing after a same-id session/workspace rebind, exposes a stale status, and sends command/note/directory/output metadata through the existing report redactor before display. The agents subscriber applies the same rebind fence.
- `advisorPicker` revalidates the exact advisor state on load/apply without doing filesystem reads during render, reports stale state, and redacts checkpoint/note metadata. `btwPicker` redacts retained question/failure metadata. Plan review continues to bind the exact plan version and side questions continue to bind transcript revision.
- Table cells now finish inline Markdown rendering before ANSI-aware soft wrapping. Links and styles that cross a cell wrap no longer leak raw `](` syntax, and line-count budgets use the rendered cell.
- Diff rendering strips CRLF terminators from display and spells embedded C0/C1/ESC controls as text while retaining the original UTF-8 byte accounting. A malicious carriage return or terminal escape cannot execute inside the rendered diff.
- Focused panel tests passed 3 files/65 tests; renderer tests passed 5 files/115 tests; `test:scripts` passed 157 tests. Seven isolated product reversals produced the intended failures: raw hub command text, stale hub apply, stale advisor apply, raw advisor metadata, raw side-question metadata, raw table wrap, and raw diff controls. All source reversals were restored.
- The final source passed the full TypeScript suite: 928 files passed, 1 skipped; 9,876 tests passed, 10 skipped. Import cycles, config consumers, declarations, Node floor, strict docs/rules, `git diff --check`, and repository-tgz NormProof (exit 0/partial, 11 existing ceiling advisories) passed.
- TypeScript build `6e0b5dec32e306689aa3e314ca456f53da5e85fec779859cf85a90306fa16a02` and executable build passed; executable SHA-256 is `0db726b3513d2c20fb7504ae57af04f11d2481d32ccc287703d9757055be21f5`.
- The isolated PTY harness now opens/closes `/hub`, `/agents`, `/plan-review`, `/btw`, and `/advisor` after enabling it, then disables it before the existing synthetic turn fixture. Node/exe × regular/fullscreen all passed 4/4, exit 0, on the build above; the sequence asserts the assistant message count did not change. Evidence is `.omx/artifacts/phase20-panel-pty-final-6e0b5dec32e3/`; intermediate failed runs are retained separately.
- `verify:phase20-requirements` moves to 32 `complete`/15 `partial`/0 `open`. PAN-03 and PAN-05 are now complete; RENDER-02/03 remain partial for OSC8, packaged visual/source-copy, and full-view resource edges.
- Three required `cn:deepseek-v4.1-flash` subagent audits all failed with HTTP 429 after retry exhaustion. No independent approval was obtained, and no substitute model was used.
- Code batch `cd28d8ca662706137f34c281330d455d46eba772` is pushed and remote `main` reads back the same SHA. CI `39888154616`/job `120201145121` completed/success in 16m46s; the CI test run passed 928 files/1 skipped and 9,883 tests/3 skipped in 916.72s. Architecture Watch `39888154776`/job `120201145625` completed/success. Both results bind only this code SHA.

## 2026-10-23 PAN-04 effort and quota acceptance（代码批 `2147cb6d` 已推送；CI/Watch success）

- `picker/thinking.test.ts` now drives the capability-aware effort panel against an exact relay address. The relay's `high: null` mapping disables only `high`; directly applying that disabled level is refused, while `low` goes through the ordinary `/thinking` path and persists only the session preference.
- An unlisted custom model keeps its effort rows actionable but reports every level as `unverified`; applying `medium` preserves the explicit warning instead of claiming support. Duplicate catalogue owners for the same endpoint disable every row as ambiguous and refuse `auto` without writing a session model.
- `cli/runtime/usage.test.ts` now distinguishes a quota payload with no windows (`Account quota windows: unknown.`) from a measured `used_percent: 0`. The unknown case emits no percentage, while the measured zero remains a real `0%` observation.
- The broader acceptance set passed 8 files/149 tests: thinking picker, usage, effort, progress, model target/request shape, panels and pickers. Three isolated reversals produced real failures: dropping endpoint binding changed supported to unverified; mapping an unknown model to unsupported disabled the unlisted rows; mapping a null quota window to zero removed the unknown text. All product reversals were restored; no product source changed.
- `verify:phase20-requirements` now reports 30 `complete`/17 `partial`/0 `open`, with Phase 20 still `partial`. TypeScript build `fae9161112d0`, `test:scripts` (157), import cycles, config consumers, declarations, Node floor and `git diff --check` passed.
- 代码批 `2147cb6d5957441c9295cb5574d45167fee15911` 已提交并推送，远端 `main` 精确读回同 SHA。CI `39878549205`/job `120170060403` 为 completed/success，耗时 12m13s；928 文件通过/1 跳过、9876 项通过/3 项跳过，测试耗时 664.51s，静态门、脚本门、构建、Chromium 安装与 NormProof 步骤均 success。Architecture Watch `39878549170`/job `120170060130` 为 completed/success。两项只绑定该验收 SHA；后续证据文档不扩大产品范围。

## 2026-10-23 PRV-03 Copilot opaque token audience binding（代码批 `0e21c3f2` 已推送；CI/Watch success）

- `core/auth/oauth/copilot/policy.ts` now parses the opaque session token's `tid` and `proxy-ep` metadata. Missing `tid`, duplicate fields, malformed fields, hostile hosts, and explicit empty audiences are refused; a token without `proxy-ep` may use only the native individual default, while business and enterprise accounts require an explicit audience.
- `assertCopilotAccount` binds the parsed audience to the stored connection address before a request can use the credential. The pool's owned-credential path therefore marks a mismatched Copilot member unavailable instead of falling back to a sibling, environment key, or profile key.
- The subscription flow now rejects invalid or untrusted token metadata before persisting a credential, and all Copilot request/readiness fixtures use the native opaque-token shape.
- Added a pool-level reversal test with individual and business origins: swapping either token to the other connection yields `pool-unavailable` with no credential. Disabling the audience guard makes that test fail; restoring it passes.
- Focused PRV-03 set: 8 files/165 tests passed. Broader auth/config/provider/shell set: 72 files/1,054 tests passed on the final rerun; an earlier unrelated `fetch.test.ts` deadline assertion failed under parallel load and passed 29/29 in isolation.
- `verify:import-cycles` (2,764 files, 0 runtime/type cycles), `check:config-consumers` (53/53), `check:declarations` (18/18 hooks, 11/11 factories), `check:node-floor`, `test:scripts` (157), `verify:docs-drift:strict` (118 existing source advisories), `git diff --check`, TypeScript build, executable build, and NormProof exit 0/partial with the existing 11 function-ceiling advisories passed.
- TypeScript build ID `a58dfcd24f10f6ce1bcaf439429c6a74a56f751dd0ed22338b81cefd85057344`, inputs digest `78897a48c56602798fedf02697fed1a08ee384eb3713f0eba5cf641d1687c397`; executable SHA-256 `c60eee11c3750a1adde1a5dd2b03a963674962025b7aa92436764927cb2aa003`.
- 代码批 `0e21c3f2c6d470dc05ab4ce19e3bdd3cbd25c4fa` 已提交并推送，远端 `main` 精确读回同 SHA。CI `39858979177`/job `120104440105` 为 completed/success，耗时 23m25s；完整测试 927 文件通过/1 跳过、9861 项通过/3 跳过，测试耗时 692.18s，静态门、脚本门、构建与 NormProof 均 success。Architecture Watch `39858979216`/job `120104440365` 为 completed/success。PRV-03 remains `partial` because no real account lifecycle evidence was obtained.

## 2026-10-23 PRV-05 auxiliary request attribution（代码批 `9a7e3869` 已推送；CI/Watch success）

- Existing request-ledger and backoff coverage already proves per-credential generation waits, late 429 isolation, pre-reserve and pre-handoff checks, unknown retention, cap enforcement, and no replay of partial/unknown streams.
- `cli/provider/identity.test.ts` now exercises main, delegated, side-question, compaction-summary, and cache-refresh sends against real local HTTP. Each reservation retains its non-secret `credentialId`, rotation-sensitive generation, and purpose; summary/cache tests also verify the committed ledger totals and empty pending set.
- Advisor uses the subagent request path and jobs use the shared parent policy; their existing native HTTP and budget tests remain part of this matrix. Session titles are derived locally from the first prompt and do not create a provider request.
- The auxiliary matrix passed 10 files/208 tests. A loading-time reversal that removed the cache-refresh policy from `sendSentRequest` made the new identity assertion fail with zero reservations; restoring the policy passed 5/5 identity tests.
- TypeScript build ID `7deb2f1e19bbb943a4be88ed67100a4a5989a5eb5a5cb146d00a332d2f97dcb3`, inputs digest `57d8a7007d314082fa7273ee14872560561fda8f6a10eed7b4fd399b3dc56616`; executable SHA-256 `bb2bdc3a82706a044c1ea735a510daaac4ea6b0f5bbf1a84661efb435d3654c1`.
- The required independent reviewer using `cn:deepseek-v4.1-flash` returned `503 Service Unavailable`; no independent approval was obtained.
- 代码批 `9a7e386982577d64c84e970ad3e661d9f329c5bc` 已提交并推送，远端 `main` 精确读回同 SHA。CI `39862167681`/job `120115317655` 为 completed/success，耗时 22m19s；完整测试 927 文件通过/1 跳过、9863 项通过/3 项跳过，测试耗时 673.80s，静态门、脚本门、构建、Chromium 安装与 NormProof 步骤均 success。Architecture Watch `39862167651`/job `120115317662` 为 completed/success。两项只绑定该代码 SHA。
- 证据文档提交 `43454907625facdab29b1683b69371601eff12c5` 已推送，远端 `main` 精确读回同 SHA。CI `39865094007`/job `120125167416` 为 completed/success，耗时 24m09s；完整测试 927 文件通过/1 跳过、9863 项通过/3 项跳过，测试耗时 766.63s。Architecture Watch `39865094080`/job `120125167788` 为 completed/success。该提交只补文档，不扩大产品行为证据。
- PRV-05 remains `partial`: no trusted remote settlement or billing evidence was obtained. The local ledger and quota projection are not a substitute for provider-side accounting.

## 2026-10-23 SET-03 settings preview external invalidation（代码批 `286c961c` → `cbde43e0` 已推送；最终 CI/Watch success）

- `picker/preview.ts` now captures the active configuration publication revision for composer and status previews; a later publication invalidates the preview before it can be shown again. Theme preview keeps its existing generation-bound lease and refuses a superseded selection.
- `ComposerPreference.read()` drops a staged composer preview when the configuration revision changes, and `InteractiveMode` drops status preview state when a publication advances. Both paths therefore return the newly accepted value rather than the old display proposal.
- The settings picker tests cover composer and status previews, the real `refreshShellRuntimeConfig` publication path, and theme revision protection. The final affected set is 10 files/319 tests; the initial pre-fix run failed the composer and status revision assertions, and three isolated reversals failed the preview guard, composer invalidation, and status publication checks respectively. CI then exposed one theme-specific stale-preview message assertion that the first commit had generalized; the follow-up preserves `Theme preview` while composer/status retain `Display preview`.
- The final TypeScript build is `124883cf2cf00ed6efa79089ec83cf929c662b3846b6f45862cb3c3ff2dcd301`, inputs digest `5ace5cd64a6026d6df7028b3713917ba7383c72c047b66118a06098982a04695`, artifact digest `a69a74836ff5f57bbf3044ceb9f51d801bdb70c6db1f3317c646b77ec8459b82`; executable SHA-256 `19e1c4965ac7dc697228bab42dd34332a4a92ed0e282db433160d9fe7717cbe8`.
- `verify:import-cycles` (2,764 files, 0 runtime/type cycles), `check:config-consumers` (53/53), `check:declarations` (18/18 hooks, 11/11 factories), `check:node-floor`, `test:scripts` (157), `verify:cli-entry` (19), TypeScript build, executable build, `git diff --check`, Node/exe × regular/fullscreen/line/pipe synthetic PTY smoke (8/8), and repository NormProof exit 0/partial with 11 existing function-ceiling advisories passed. SET-03 is now `complete`; Phase 20 remains `partial` because the other matrix rows retain their stated gaps.
- 代码批 `286c961c3fcf319d95054c12cac69ae2cb281706` 已推送；CI `39867401287`/job `120132949473` 为 completed/failure，测试 9868 项通过、1 项失败、3 项跳过，耗时 766.52s；Architecture Watch `39867401240`/job `120132949040` 为 success。失败项是 theme stale-preview 文案被泛化，未把该 run 记成成功。
- 修复批 `cbde43e0a7f9e1a34ade16b2487363351ad0d5e1` 已推送，远端 `main` 精确读回同 SHA。CI `39869615352`/job `120140442661` 为 completed/success，耗时 25m23s；完整测试 927 文件通过/1 跳过、9869 项通过/3 项跳过，测试耗时 819.25s，静态门、脚本门、构建、Chromium 安装与 NormProof 步骤均 success。Architecture Watch `39869615369`/job `120140443173` 为 completed/success。两项只绑定该修复 SHA。
- 证据文档提交 `9678a3bb6d75b29d9507917bd25ed1406acb85a1` 已推送，远端 `main` 精确读回同 SHA。CI `39872599463`/job `120150383303` 为 completed/success，耗时 17m29s；完整测试 927 文件通过/1 跳过、9869 项通过/3 项跳过，测试耗时 966.52s。Architecture Watch `39872599468`/job `120150383395` 为 completed/success。该提交只补文档，不扩大产品行为证据。

## 2026-10-23 PAN-01 revision-bound model search（代码批 `aee2a1ab` 已推送；CI/Watch success）

- `picker/model.test.ts` now drives the real `OverlayHost`: pasting `relay b` leaves only the relay-B model row, and pasting `review` leaves the named profile-role row. The displayed row is accepted through the ordinary Enter path rather than a synthetic direct apply.
- After relay search, the test advances the accepted publication revision before Enter and requires `Model selection expired`; session model bytes remain unchanged. After role search, it replaces the same profile role with a different model, then requires `Model preset changed` instead of silently applying the new target; session model bytes remain unchanged.
- Focused picker/model host set: 3 files/74 tests passed. Two isolated reversals failed as expected: removing connection ID/label from the row made relay search fail, and removing the preset-owner comparison made the changed role apply instead of being rejected. Both source reversals were restored.
- No product source changed in this batch; it closes the previously missing PAN-01 search/revision acceptance. The matrix moves to 29 `complete`/18 `partial`/0 `open`; Phase 20 remains `partial` because the other rows retain their stated gaps.
- 代码批 `aee2a1ab59f418d85d019656dfd14695543d7627` 已推送，远端 `main` 精确读回同 SHA。CI `39873115272`/job `120152093788` 为 completed/success，耗时 26m24s；完整测试 927 文件通过/1 跳过、9871 项通过/3 项跳过，测试耗时 868.04s，静态门、脚本门、构建、Chromium 安装与 NormProof 步骤均 success。Architecture Watch `39873115198`/job `120152093747` 为 completed/success。两项只绑定该验收 SHA。
- 证据文档提交 `74c250a0477d3895350addb1f34e8ce5dba75a0e` 已推送，远端 `main` 精确读回同 SHA。CI `39876052475`/job `120161797308` 为 completed/success，耗时 17m30s；完整测试 927 文件通过/1 跳过、9871 项通过/3 项跳过，测试耗时 962.01s。Architecture Watch `39876052380`/job `120161797289` 为 completed/success。该提交只补文档，不扩大产品行为证据。

## 2026-10-23 全 47 项复核与 QA-03/TOOL-02 harness 返工（代码批 `6ed28019` 已推送；CI/Watch success；真实模型项仍 partial）

- `scripts/phase20-requirements.json` 现在逐项记录决策表全部 47 个唯一 ID：29 项 `complete`、18 项 `partial`、0 项 `open`，整体仍为 `partial`。`scripts/phase20-requirements.mjs` 与 4 项回归强制矩阵 ID 和决策表完全相等，complete 行不得保留缺失证据，partial 行不得隐藏缺口。该矩阵明确保留 PRV-03/05、PAN-02…08、INPUT-01、RENDER-01…03、TOOL-02、QA-01…04 的开放验收，不再把“未闭合”简化为 QA-03/TOOL-02 两项。
- 默认 `npm run qa:quality` 改用 `scripts/qa-quality-formal.json` 的 20 项 qualifying corpus：12 项发现/执行、4 项摘要、4 项渲染；decoder 强制分类下限，starter corpus 只留作回归。`--validate-fixtures` 在不发 provider 请求的情况下准备 20 个隔离 home/project 并调用本地 `/tools`，实际 20/20 通过；固定 allowlist 下 MCP fixture 完整池 18 项、extension fixture 完整池 18 项，其余 18 个任务各 17 项。
- harness 现在逐 arm 记录 turns、tool calls、argument errors、missed discovery、批准结果、成功工具、cache read/write、实际 usage 与捕获价格成本 coverage；任务支持批准拒绝、文件必须不存在、任一编辑工具成功、隔离 MCP、受原 state/inventory 校验的 Linux extension，以及同一 session 的跨进程 follow-up。缺失 session、换 session、无 measured request、未知 tokenizer 或未定价 cache token 均 fail closed。blind-human 输出写入独立 mode `0600` candidate，arm 映射单独保存；`--resume --ratings` 可在不重复 provider 请求的情况下重投影报告。两臂统一使用 `temperature=0`、`topP=1`、`maxOutputTokens=4096`，报告缺少数值时不能判为 complete。
- 每个真实 run 在 `run-meta.json` 与 `tokenizer.json` 之后生成 revisioned `run-manifest.json`，绑定 run metadata、tokenizer evidence、全部 pair/raw arm、脱敏 candidate、review map 与评分文件。resume 先验证精确文件集合和每个 SHA-256；已有 artifact 变更、未登记 artifact、重复/缺失 pair 或非法评分都会在重投影前失败。评分文件只在解析与双评分校验通过后复制到 private 目录，再以 revision+1 追加到 manifest。
- `scripts/qa-tokenizer-corpus.json` 固定英文、中文、代码、混合 CJK/emoji 四层。真实运行对每层发送同 project、同完整工具池的两组首次请求，以 provider prompt-token 差值计算实测值；样本文本不写入报告，只保存 SHA-256 与字符数。dry-run 仍为 `inconclusive`/exit 2，明确没有真实质量结果。
- 用当前构建生成 100 个合成 pair 后，`--resume --ratings` 在不调用 provider 的情况下重投影为 `complete`，manifest 从 revision 1 扩展到 revision 2、绑定 344 个 artifact，并把评分文件复制到 run private 目录。证据目录为 `.omx/artifacts/quality-runs/synthetic-manifest-validation/`，扩展后 manifest SHA-256 为 `9cffc2606b06331e2945a85e794df9f39a0ea3bdfb81ede525191ce10e252cc8`，绑定 exe SHA-256 `4fdfcb0836c7339e86ab0e3edab1699a9b1600eeb9f12df2466417542f3ba342`。该运行只证明 resume/评分/报告合同，不是模型质量证据。
- `npm run test:scripts` 实际 157 项通过；`node --test scripts/qa-quality.test.mjs` 22 项、`node --test scripts/qa-quality-manifest.test.mjs` 3 项、`node --test scripts/phase20-requirements.test.mjs` 4 项、`node scripts/phase20-requirements.mjs` 均通过。dry-run 实际输出 `inconclusive`/exit 2，fixture validation 为 20/20。尚未执行真实 provider、双人盲评、100 个真实 pair、真实成本或四语言 tokenizer 数值，因此 QA-03/TOOL-02 仍为 partial。
- 本轮重新核对 `complete` 行时，对最容易受历史状态漂移影响的任务补跑当前源码聚焦集：JOB 相关 47 项、EDIT-01 相关 67 项、START 相关 9 项均通过；其余 complete 行仍以其绑定测试、构建或精确 SHA CI 证据为准。指定 `cn:deepseek-v4.1-flash` 的独立 reviewer 再次返回 `503 Service Unavailable`，因此没有独立批准，不能把本矩阵当作 QA-04 或 Phase 20 完成。
- 代码批 `6ed28019162c87260a32df251f1c2456bc595583` 已提交并推送，远端 `main` 精确读回同 SHA。CI `39850665748`/job `120075621131` 为 completed/success，耗时 16m45s；完整测试实际 927 文件通过、1 文件跳过，9857 项通过、3 项跳过、921.47s，静态门、脚本门、构建、Chromium 安装与 NormProof 步骤均 success。Architecture Watch `39850665653`/job `120075621701` 为 completed/success。两项只绑定该代码 SHA；真实 provider、盲评、真实成本/cache 与 tokenizer 数值仍未运行，QA-03/TOOL-02 不因 CI success 转为 complete。

## 2026-10-23 QA-02 跨平台 CLI 矩阵（代码批 `fa493e2e` 已推送；Platform QA/CI/Watch success）

- `.github/workflows/platform.yml` 在 GitHub `ubuntu-24.04` x64、`macos-14` arm64 与 `windows-2022` x64 上使用 Node `20.3.0`、Bun `1.3.14`，覆盖 Linux/macOS Node/exe × regular/fullscreen/line/pipe 各八格，以及 Windows Node/exe × line/pipe 四格；Windows regular/fullscreen 明确标记为不支持的交互 PTY 路径，不伪装成跳过后的通过。
- 首轮 Windows 失败不是断言放水：先暴露 `/tools` 在平台不兼容的原生读取前失败，修复后又暴露项目 skill 的 `Read target is outside the authorized directory`。根因是 Windows 8.3 短名 `RUNNER~1` 与 `realpathSync.native` 返回的 `runneradmin` 长名在 read root、containment 和 catalog 复核中混用；最终由 path owner 统一既有路径的 canonical spelling，并让 containment 在词法前缀不匹配时仍先尝试 native 解析。失败 run `39830583247`、`39831629803`、`39832079951`、`39832441907`、`39834065300`、`39834360782` 保留为反转证据，不覆盖为成功。
- 最终手动 `Platform QA` run `39834842595` 为 completed/success；jobs 为 Linux `120020320612`、macOS `120020320517`、Windows `120020319978`。20 个 JSON 全部 `status=pass`、`exitCode=0`、bytes 为正，平台/架构/target/mode 与预期逐项一致；20 个 transcript 均包含成功的 `bash`、`task`、`tool_search`、`tool_load`、`skill` result、审批 resolution 和 `qa-skill-body` payload。
- Linux/macOS 共享 TS build ID `58cca24b15858754afd2b576b5d7ac28c058b8aff40a476db756672308f14d24`、inputs digest `b0d80fb795665149129c17af6410f2faa46b8cbc0adfe4b220fcac60c532c660`、artifact digest `a16dab3c00554ed3712e8b6f1fc400530446a92125b938be9e565bc283a7e320`；Linux/macOS exe SHA-256 分别为 `31cdf84fcfc1fa46f7308c141e8407e8c7776f2bd22e985e0eaac25787876eb1`、`c0bd5072fc21454b184b8c69221d0ae80bd4efdc4579f220864eeb4a995e2146`。Windows build ID `da633dea4e9f70a9fd3d0596a753f5094811f60e59aa5429e57b850e8eea5c56`、inputs digest `1b84c7c343c2dce36b537a1e05abc93c1b259de137367247b551d6821ef42ecb`、artifact digest `ce7667041ce10b94984261048a404062ce812c7b3e85a9deecbfb12ab81be4fc`、exe SHA-256 `ac518a05f0e2c85d1125ce7dc3aa7ed9059e4b08c24339db9b694e53d78c9c02`。证据目录为 `.omx/artifacts/platform-39834842595/`。
- 代码批 `fa493e2e8c6608e768ccb312204553c722467522` 已提交并推送，远端 `main` 精确读回同 SHA。CI `39834842366`/job `120020311437` 为 completed/success，耗时 16m41s；完整测试实际 927 文件通过、1 文件跳过，9857 项通过、3 项跳过，测试耗时 918.53s，静态门、脚本门、构建、Chromium 安装与 NormProof 步骤均 success。Architecture Watch `39834842316`/job `120020311060` 为 completed/success。
- 本矩阵闭合 QA-02 的跨平台合成 CLI 线/管道与 Linux/macOS TUI 路径，并验证 restore preview、settings 保存、命名 profile 创建/重启读回、任务、发现、审批和 skill payload。仍不闭合 Windows 交互 PTY、真实 IME 行为、系统复制，也不证明真实模型质量；Phase 20 其余开放项保持原范围。

## 2026-10-23 START-03 受控冷/热启动基准（代码批 `2c55ec8b` 已推送；Performance/CI/Watch success）

- 新增 `global-cold` 缓存控制：每个样本先执行 `sync`，再由 `sudo -n tee /proc/sys/vm/drop_caches` 写入 `3`；默认仍为 `warm-uncontrolled`。非 Linux、未知模式、缺少免密 sudo 或任一命令失败都会在启动样本前 fail-closed。`scripts/bench-cache.test.mjs` 6 项通过，`test:scripts` 135 项通过。
- 手动 `Performance` 运行 `39817293051`/job `119959021646` 为 completed/success，耗时 18m30s，使用 GitHub `ubuntu-24.04`、Node `20.3.0`、Bun `1.3.14`、4 vCPU Xeon。它先跑 warm，再跑 cold；四份 JSON 使用同一 build ID `91c1045a9d1ad20a59d64780b6aada71419e6d53ef54b9050e32c92627c3bcc2`、inputs digest `663c429db5ebcd854cb53348c77763f2ab0f9120d551c94cf29695fd9ce58fa1`、artifact digest `aa25ff526e0ae405c011c1b91c7707907b5fa3f716fb596c66c7c378bc793db2` 和 exe SHA-256 `a3170741780421323d9e9677bfdae11fe6ba3cf200e69ac2a53993aefa2156dd`。
- 进程启动各 30 次，Node warm p50/p95 `400.0/414.6ms`、cold `1869.3/1912.6ms`；exe warm `273.6/282.4ms`、cold `481.4/488.6ms`。cold 运行记录 60/60 次 cache drop，warm 为 0/60。
- 交互启动各 target × 四模式各 30 次。regular/fullscreen 的首帧 p50/p95 如下；line/pipe 没有首帧或键响应，分别保留 first-byte、runtime-ready、exit 等独立字段，不混报为 TUI 指标。

| target | mode | warm first frame | cold first frame | warm key response | cold key response |
|---|---|---:|---:|---:|---:|
| node | regular | 1857.9/1887.0ms | 3526.6/3591.5ms | 52.2/60.3ms | 54.0/62.3ms |
| node | fullscreen | 1861.2/1879.8ms | 3534.4/5567.9ms | 50.7/67.3ms | 50.9/63.0ms |
| exe | regular | 749.6/794.1ms | 996.1/1020.0ms | 48.8/49.8ms | 49.5/51.1ms |
| exe | fullscreen | 747.7/762.7ms | 997.9/1071.6ms | 48.8/50.1ms | 50.1/52.6ms |

- line first-byte p50/p95：Node warm `1766.4/1808.4ms`、cold `3435.3/3498.9ms`；exe warm `664.4/683.2ms`、cold `902.3/928.0ms`。pipe first-byte p50/p95：Node warm `1858.0/1885.6ms`、cold `3507.5/5476.6ms`；exe warm `760.2/788.3ms`、cold `999.2/1028.2ms`。interactive cold 记录 240/240 次 cache drop，warm 为 0/240。
- 证据目录为 `.omx/artifacts/phase20-performance-39817293051/performance-39817293051/`；SHA-256 分别为 start-warm `acace637cf224b0a279cec7eb2aa5ce1683e77a49928c2354407b32e90c935d3`、start-cold `2ea259acaa501474a0b783e121331c3b98bdd28fbb3fd55af80eccbadb683fbc`、interactive-warm `69a047a08bbfc535e59de75817b3fcc5c617822aea228015eb77d3e7e3950e35`、interactive-cold `f0671f10deaa923365b0fa5c34d745952216dae13cfdd7dda52555d57a6ce1e1`。该运行闭合 START-03；此前 WSL warm 数据只保留为另一台机器的观测，不替代本 run 的同机 warm/cold 对照。

## 2026-10-23 Phase 20 本地返工与全量复核（代码批已推送；CI/Watch success；延期项保留）

- 续接上一轮未提交工作树，完成 `/review` 空 focus、output-aware `/context` 与 runtime protocol facts、动态发现 generation/subscription、transcript pointer source revision、Vim operator motion、Markdown source/diff/math/table、bounded usage attribution、provider fallback/profile scope 和 executable manifest 绑定返工。自审又修复了 pointer 自动滚动被自身 revision 误失效、同一毫秒相同 usage 请求可能丢失、非法右花括号数学被静默截断，以及 host-verified executable 版本可与 build 不同的四个真实缺陷；均有修前回归或等价断言。
- QA harness 现在要求 qualifying corpus 至少 20 项、确定性任务至少一个可观察检查、文件字节与 mode policy 证据、事件流 observation-only、每臂一致的 provider/model/endpoint、完整 protocol 探针、双独立盲评与明确裁决；`complete` 还要求 100 个正式 pair、唯一 ID、无执行失败、零 policy violation 和无限制项。starter corpus 保持 `qualifying:false` 的 6 项，dry-run 固定 `inconclusive`。
- 最终聚焦复跑包括 129 项脚本测试、253 项 pointer/usage/renderer/turn 测试和 67 项 Git 集成测试；默认并行 `npm run test:ts` 实际为 927 文件通过、1 文件跳过，9845 项通过、10 项跳过，360.71s，无失败。`test:scripts`、`verify:result-contract` 6 套/158 项、golden main path、`verify:cli-entry` 19 项、cycles/config-consumers/declarations/Node-floor、strict docs/rules、`git diff --check` 均通过；docs-source 118 项与 module facade 11 项保留 advisory。
- 最终 TS build ID `2ac423b5a8dac7aa1992bf6645a4aa3b000b83df3ea8cd20bc67f523c14ad8bb`，inputs digest `6a3ddbb67f142b5ca01126d5a8c595c957cdf235a96b655cb15a13de50fe3736`，artifact digest `aa25ff526e0ae405c011c1b91c7707907b5fa3f716fb596c66c7c378bc793db2`；immutable exe 102,758,528 bytes、mode 755、SHA-256 `2b9c04625b3b15c96a224d2f2bd0bdd7505bc9fb29a8ebd83033a894c78b868f`。`npm start -- --version`、stable exe 和 immutable exe 均输出 `0.1.0`。
- 同 build 的 Linux Node/exe × regular/fullscreen/line/pipe 八格 PTY 全部 pass/exit 0，覆盖 settings 保存、命名 profile 创建与重启读回、任务、发现、逐次审批、会话和 restore 字节对照；所有 JSON 均绑定上述 build/artifact/exe。QA quality dry-run 为 `inconclusive`/exit 2，明确表示没有真实模型质量结果。
- 同 build 的 START-03 补充证据：`bench:start` 各 30 次，Node p50/p95 `405.6/415.8ms`、exe `214.5/231.9ms`；`bench:interactive` 保存 Node/exe × 四模式共 240 个样本，regular/fullscreen 均取得 runtime-ready、首帧和完整 UTF-8 键响应；`bench:responsiveness` 30 次通过 1000 项列表 p95 `<50ms` 与 math/table/diff 单次阻塞 `<100ms` 阈值。全部为 warm/uncontrolled 缓存，不能替代受控冷缓存。
- NormProof 实际 exit 0/partial：blocking unresolved-specifier 与 cycle obligations satisfied，0 blocking；11 项 function-ceiling advisory 保留。委派 reviewer 使用指定模型多次遇到 429/503，不可用不等于批准；本轮结论来自本地自审和实际门禁，不声称独立 review approval。
- 代码批 `0d42697d3aa6130412d57afdf76cf2ae15d0a539` 已提交并推送，远端 `main` 精确读回同 SHA。CI `39810323144`/job `119934502881` 为 completed/success，耗时 17m35s；静态门、脚本门、构建、Chromium 安装、完整测试与 NormProof 均 success，CI 测试实际为 927 文件通过、1 文件跳过，9852 项通过、3 项跳过，967.66s。Architecture Watch `39810323104`/job `119934501742` 为 completed/success。两项只绑定上述代码 SHA；本段后续文档证据补记另提交，不扩大产品范围。
- START-03 已由上方受控冷/热运行闭合；QA-02 的 Linux/macOS/Windows 支持矩阵随后由 2026-10-23 `Platform QA` 闭合，但 Windows 交互 PTY、真实 IME 与系统复制仍未闭合；QA-03 正式 20 项 corpus、真实模型执行和双盲评分；TOOL-02 同模型总成本/cache/参数质量/多语言 tokenizer 校准。Phase 20 不因本批本地返工而宣称全部 47 项完成。

## 2026-10-22 面板、源投影与 W2/W3 本地返工（代码批 `152d9ecc` 已推送；CI/Watch success）

- 补齐 `/jobs`、`/agents`、`/usage`、`/plan-review`、`/btw` 的既有 picker consumer。`/agents` 通过 jobs owner 的 `agentProjection` 投影 live owner、detached、stored/running→unknown 与保留运行，通过 `agentPage` 提供脱敏、截断的文本页；同时展示 `SubagentLoader` 的有效定义和经安全投影的 discovery diagnostics，不借用 jobs 的本地任务身份；`/usage` 打开时只读本地账本，账户读取必须显式选行并在配置 revision 变化后丢弃迟到结果；`/plan-review` 绑定已加载版本，`/btw` 只读 transcript 中的保留报告。
- `/settings set <key> <value> [--project]` 已沿交互、line、pipe/print 与 command bridge 接入同一 CAS writer；用户范围、显式项目范围、非法值、未知键和 session 变更拒绝均有回归。Linux Node/exe × regular/fullscreen/line/pipe 八格隔离 smoke 通过，line/pipe 覆盖 profile 创建、切换的显式非交互拒绝和 `maxTurns=7` 文件读回。
- UI-04 保留 Markdown 原始行偏移并为表格、fence、标题、列表、引用、数学与分隔线生成 source mapping；换行后的标题、段落、列表和代码行保留逻辑换行，结构化行必须完整覆盖一个逻辑节点才能复制，fence 内空白源行也保留可复制身份，表格预算截断行不再产生可复制来源。
- W3 将 compaction 阈值接到共享 `requestBudget()` 软带，`buildCompactionWiring` 传入实际 output ceiling；`enabled: false` 阻止软带触发，retained tail 也扣除 output headroom。step 记录实际发送的消息数与有效 wire schema/system 指纹；compaction 的测量身份在 schema/system 不完整时拒绝。读取时 schema identity 与回退 `overhead` 都从当前 discovery snapshot 和实际工具过滤重新计算，system identity 则固定为主 turn 实际发送的 system prompt，避免 tool_load 后把未发送的提示误当请求身份。`/context` 不重建请求身份，而是使用最后一次请求保留的 `lastPromptIdentity`；`CommandContext.promptIdentity` 仅作显式 host override。严格测量（`/context` 与 compaction）要求 endpoint/schema/system 完整且逐项相等，无身份或部分身份记录均 fail closed；只有非严格 legacy caller 保留无身份测量兼容。这样动态工具发现快照与嵌套 `cwd` 都对照实际请求，而非命令侧重建出的另一套配置；状态栏至少要求可解析 endpoint。opaque subscription token 的 issuer/audience 证明仍未闭合，不能据此宣称完整 PRV-03。
- 独立复核先确认生产命令上下文缺少 system digest 会把正常测量误报为 stale；后续又证明按命令侧完整工具池重建在默认动态发现下错误，使用 `projectRoot` 重建也在请求采用 `runtimeContext.cwd` 时错误。最终修复保留请求侧共享 `core/prompts/systemContext.ts`，但 `/context` 只消费精确请求身份；动态 schema、回退 overhead 与嵌套目录正向回归、部分身份拒绝和显式冲突 override 回归均通过。另一轮独立复核发现严格 helper 仍接受无身份/同等部分身份、`/usage` picker 缺少 interactive binding、compaction identity 在 tool_load 后冻结、fence 空白行丢失来源、`/agents` 未满足 live view/diagnostics；这些均已修复并由对应回归覆盖，`/agents` 现在复用 jobs owner 的 liveness/output projection。
- 最终聚焦 23 文件/430 项通过。最终字节的完整 `test:ts` 使用仓库外临时配置以 2 worker、1 次 retry 运行，实际 926 文件通过、1 文件跳过，9781 项通过、10 项跳过，804.69s，无失败或 retry 标记；这不等同于默认 8-worker 结果。此前默认并行下的 browser/CLI 负载型失败保留原分类，未用低并发结果冒充默认并行通过。旧提交 `5576b1d3` 的 CI `39717903140` 仍只证明旧 SHA。
- `test:scripts` 106 项、`verify:result-contract` 6 套/154 项、golden main path、`verify:cli-entry` 19 项、cycles/config-consumers/declarations/Node-floor、strict docs/rules 与 `git diff --check` 通过；module facade 仍为既有 8 项 advisory，docs-source 仍为 118 项 advisory。NormProof 实际 exit 0/partial，blocking import/cycle 义务 satisfied、0 blocking，既有 8 项 function-ceiling advisory 保留。
- 最终 TS build ID `faeb78a44674365c5490409b013b6eb7dfe9c7f71b9fbb23ab4dcadf3fc65e5e`，inputs digest `70aedc13fda716d9778be5460ef2e985ffb1a44aa4a1714e8f9e8199cef1a513`，artifact digest `813a2891a181c948e6e6b57a727c784008e59020406db2491d40f2b4c94d8c96`；exe 102,742,144 bytes、mode 755、SHA-256 `355d84e9e1d9c5f731fd82a76243670f629a52114d0d19cf333d8fca1eb6274f`。该产物 Node/exe × regular/fullscreen/line/pipe 八格隔离 PTY 全部 exit 0；最终 exe 上的 19 项 CLI hard gate 也全部通过。
- CLI hard gate 的单 hunk 检查现在证明非交互无 group-selection host 时拒绝且零写入；正向单 hunk 应用仍由 patch/turn 聚焦回归覆盖，未把无选择宿主伪装成成功路径。已执行并恢复的最终反转包括 wrapped-node 逻辑换行、JSON list 设置、no-tools wire schema、compaction 身份与 opt-out、compaction 回退 overhead live getter、output-aware retained tail、context/status 身份、retained identity fallback、部分身份严格拒绝、interactive usage binding、live discovery compaction identity、fence blank-line source、agents live binding 与 owner projection、agents continuation syntax、UTF-8 分页、panel 控制字节、jobs workspace identity 和 `/btw` retained report。所有反转均取得真实失败，恢复后源码 SHA256 与反转前一致。代码批 `152d9ecc7d55ff8ced88a338ff1db7eb153aa4f7` 已提交并推送；CI `39753892764`/job `119740926577` 与 Architecture Watch `39753892815`/job `119740927033` 均 completed/success，只绑定该代码 SHA。该历史批次当时保留 START-03、QA-02/03、TOOL-02；START-03 已于 2026-10-23 后续受控冷/热运行闭合。

## 2026-10-22 MCP 服务器刷新与安全报告返工（PAN-08 部分）

- 当前未提交批次的 21 个源码/测试 SHA256 与两份独立审查和最终构建绑定逐项相符，本次实际重跑 `mcp-picker/bind.mjs` 通过。原精确服务器身份、单次选择、原准入、host 取消、client 目录发布与 report-safe 投影已有最终证据；具体合同见 [MCP 交互式服务器选择与刷新](mcp.md#交互式服务器选择与刷新)。
- 最终本地受影响 18 文件/247 项及补充 4 文件/24 项通过；18 项加载时反转取得真实断言失败。两构建、Node/exe × regular/fullscreen 四格专用 MCP PTY 和 Linux 八格通用 smoke 通过。专用 PTY 验证精确 `all`/空格名称、取消后最终清理与重新打开、安全展示及持久化，无 tools/call 或模型消息。以上是与当前哈希相符的既有运行证据，不声称本次全部重跑。
- 既有两路独立代码 APPROVE、架构 WATCH，综合 COMMENT；本次重新核对审查哈希。源值修改后还原、实际清理时限、未支持编码、总资源界和继承函数上限仍有边界，未将 WATCH 当作完整架构批准。
- 本次四项 cycles/config-consumers/declarations/Node-floor 实际重跑 exit 0。既有 result-contract 6 套/154 项通过；两个 MCP 门禁仍因删除前测试路径返回 exit 1，属于验证脚本漂移，原失败日志保留，单独修复。strict docs/diff、提交、推送和新 SHA CI 按后续实际证据记录。
- 前批 help 精确 SHA `eeeb9268c5f879c457a43c3cdee96f43d2965173` 的 CI `39614206610` 和 Watch `39614206887` 已 completed/success，只证明前批。完整 PAN-08、其余既有 picker 与全部 47 项继续原范围复核；用户允许延期的四类环境/真实模型验收范围不扩大。

## 2026-10-22 MCP 验证门返工与 EDIT-01 显式选集

- 三个 MCP 验证门已从删除前的固定文件/场景清单迁回当前 owner 测试，并把关键成功、报告安全、取消、拒绝和 stale 场景作为必需断言逐项校验。共享 contract gate 现保留 `0=pass`、`1=product-regression`、`2=execution-inconclusive`、`3=config-failure`，release-core 使用归一化退出码；成功运行清理隔离产物，失败保留 `runner.log`/`tests.json`。`test:scripts` 106 项、MCP routing 92 项、local execution 26 项、error taxonomy 28 项及 result-contract 154 项通过。
- EDIT-01 修复了单组 patch 的隐式选集：交互选择器和 CLI bridge 必须原样传递非空、去重、已知组 ID 与精确 `selectionRevision`；即使 `accept-edits`/`allow-all`、approval-mode、allow-once cache 或 allow-always grant 已存在，选择必需提示仍绕过这些权限自动回答。无 group picker 时明确 deny，apply_patch 的 allow-always 在持久化前降级为 deny。patch owner 再次拒绝无选集、重复/空白/非字符串 ID 和 stale revision，不能从单组数量推导授权。
- 本地六个聚焦文件/133 项通过，生产 TypeScript 构建通过；七项有效反转分别移除 bridge 字段、恢复 turn/tool 单组 fallback、恢复 scope 自动回答、删除直接执行的重复/非法 ID 校验、删除 apply_patch allow-always 降级或恢复 approval-mode 二次读取，均取得真实失败。`result-contract` 154 项、`test:scripts` 106 项、cycles/config-consumers/declarations/Node-floor 通过，module facade 仍为既有 8 项 advisory。
- 最终 TS build `ad9988c1ee596bfe76481547521acefea43dfc293a543dd738c3ea96c48e312e`，inputs digest `461d3a63c0a656a811f67446f2d8a79c1b9d9c1722f3b88c9f2ed1352ede8368`，artifact digest `7329d1bdbf4d98dc194132d5dc930a5502c78dbc68a6154bf3158708dfad461d`；exe 102,725,760 bytes、SHA-256 `4875859d1f893c0390d3941d075e156eea07237ffbdd1e1d7f9ca669161f42ad`。Node/exe × regular/fullscreen/line/pipe 八格隔离 PTY 全部 exit 0。
- 独立 MCP verifier 复核 APPROVE；EDIT-01 代码复核 APPROVE、架构 CLEAR。以上只证明本轮门禁与精确 patch 选集，不闭合 PAN-08、EDIT-01 的跨平台/真实模型项或其余 47 项。commit、push 与精确 SHA CI 尚未执行，后续按实际结果补记。

## 返工复核（2026-10-18）

复核基线为 `12a7d4e0`。先前“只剩四项未闭合”的结论撤回：下方旧记录包含部分实现、未完成验收及重复任务，不能证明全部裁决兑现。保留历史提交证据，逐批按决策文档重新验收；不以本轮少量回归通过重判整个任务完成。

| 批次 | 当前复核结果 | 后续范围 |
|---|---|---|
| W1 CFG-01…05 | CFG-02/04 发现并修复导入相对路径规则改变目标的问题；default、named、legacy、preview 后源变化回归通过 | 继续核查全部身份 consumer、配置快照及失效合同 |
| W4 UI-01…04 | UI-02/03 修复固定八项上限、详情被候选数裁短、tab 点击区域覆盖、缺键盘切组及 modal 不显示分组；可用矩形和旧命中失效回归通过 | 其余公共原语、源选区及各消费者仍按合同复核 |
| W2 | 连接/角色/目录、委派续期、主/cache/辅助费用及池限制/退避已有逐批证据；只读可用性现共用完整池拓扑、自身凭据与当前代次等待，active 不可用和无目录成员保真 | 本批提交/远端按日志记录；完整 consumer/publication 与 provider/endpoint/受众复核仍开放 |
| W3 | CTX-03 有界分段/合并、永久重播证据、原生 source CAS 与精确发布证明已有本地及独立验收；自动/overflow 未验证发布停止 turn | 两项架构 WATCH 为容量拒绝和锁内同步 I/O，已记录取舍；本批提交/远端按日志；CTX-01/02/04、TOOL-01 继续复核 |
| W5 | SET-02 已修复选中分组后无法搜索其他组的问题；复用文字匹配排序，跨组按最佳得分和固定组序展示；清空搜索回原组，从详情 Back 回字段所属组并聚焦 | CMD-01/02、SET-01/03 全部验收；SET-02 其余来源/状态细节继续按合同核查 |
| W6 | modal 的项目范围切组现已可达；不能由此证明完整目录分页/搜索 | PAN-02、PAN-03、PAN-05…08 各动作、只读边界、分页和 revision；PAN-01 已由后续搜索/revision 验收闭合，PAN-04 已由 effort/quota 验收闭合 |
| W7/W8/W9 | 2026-10-20 返工已补上同文件 hunk 的 baseline/content identity、detach 后保留晋升总期限、adopted settlement、follow-up 脱敏/reload、轻量 `--help`/`--version`、首帧 bootstrap 扫描探针，以及最终 Markdown/HTML code-span、diff rows/bytes/rename 与 copy 反例；START-02 现有 packaged 首帧恢复提示与用户意图 fence，START-01 fresh packaged gate 已在本工作树通过 | 其余 INPUT/RENDER consumer 仍按合同复核；START-01/02 的新提交 CI 与跨平台验收另行取证 |
| W10 | 本批 135 文件/1813 测试通过；修改前实现使 20 项回归失败；两路独立复核通过；Node/exe × regular/fullscreen 的 settings/resume 切组、关闭与退出 PTY 通过 | QA-01/02/04 随后续返工累积；本批不等于全阶段交付 |

本批静态检查、构建、提交和 CI 的精确状态见开发日志。本轮 PTY 鼠标只验证 fullscreen；regular 仍由终端负责鼠标滚动与选择。

基础批已提交并推送为 `d622d491`；CI run `39094520395`、Architecture Watch `39094520337` 均 success。搜索批 `425e290b` 的 CI `39095154347`、Architecture Watch `39095154368` 均 success；另经 114 文件/1563 测试、分组限制反转失败、两构建与四格搜索 PTY 验证；交付结果以开发日志和精确 SHA 的 GitHub run 为准。

具名连接批 `aecc4bcb`、命令角色批 `9bb899ce` 均已推送，Architecture Watch success；各自 CI `39096940454`、`39097452989` 仅两个旧模型菜单测试失败。修复批 `d40f3fdcbadd603924cce44373a59e99a40a43ec` 已推送，CI `39098179492` 与 Architecture Watch `39098179387` 均 success：测试消费真实菜单快照，按实际请求显示当前连接/凭据来源/effort。此前本地受影响集遗漏这两个跨目录测试，未被表述为 CI 通过。

整套预设/subagent 批已推送为 `94122f3f7c97beab3eae8b0bf8e7f29f28e436e5`，Architecture Watch `39099444862` 与 CI `39099444888` 均 success。默认目标和策略一次保存；整套替换清除缺席角色，个别选择保留策略；显式子代理模型/effort 的原优先级保留。

PRV-02 已补齐 `summary`：手动/自动/前缀/分支摘要消费精确角色，主模型阈值与摘要请求预算分离，步骤复用包含摘要身份，预算预检先于 claim。本批已推送为 `c901a58fd9376e3fbc76ecee9cf9303e6c09f666`，Architecture Watch `39101028311` 与 CI `39101028310` 均 success。

当前补齐 `advisor` 的显式启用与自动角色消费、配置/模型 revision 失效，以及主请求/委派/btw 的 credential generation 映射。独立委派账号续期、CTX-03 完整生命周期/分段和其余全部 47 项继续按原范围推进。详细验证与交付边界见开发日志。

advisor 批已推送为 `a7e32d44bcebcbb043760c1d390e7011ed3acf38`，Architecture Watch `39102165544`、CI `39102165549` 均 success。随后 provider-only 模型选择返工的本地验证与提交边界见开发日志；这批不构成完整 W2 或 Phase 20 完成声明。

provider-only 批已推送为 `c6206819db11c88984f95d0dee2c59eed4d9c23a`，Architecture Watch `39103714478`、CI `39103714477` 均 success。精确 endpoint 目录批已有本地受影响 40 文件/555 项、三项有效反转、双构建、八格隔离 PTY 与独立代码/架构复核；其提交与 CI 按开发日志后续证据记录，不把当前通过扩大为全部 47 项完成。

目录批已推送为 `760b078855a4c08ab980dbd85c254e6a343bb5fe`，Architecture Watch `39106440957` success；CI `39106440859` 有一项既有 `grepStream` 夹具 `spawn ETXTBSY` 失败（8652 通过、2 跳过），不能记为 CI success。后续续期前置返工修复 peer 错账号读回和刷新发送标记漏调用，独立顾问/子代理续期接入仍未闭合；细节及验证见日志。

续期前置批已推送为 `30c838271d6c0673e7740f7b1375301731174a5a`，Architecture Watch `39107413351` 与 CI `39107413330` 均 success。后续委派续期、精确 token publication、scope 指纹与可执行文件传输返工的验证/交付边界继续按日志记录；此处不把本地修复视为新 SHA CI 成功，也不收窄全部 47 项范围。

委派续期/传输批 `788b0d3ca4d9dbad0b5e04583c32d2ab0fdd3c50` 已推送，实际读回 Architecture Watch `39111926775` 与 CI `39111926771` 均 success。本批历史费用返工的独立复核与验证见日志；不据此闭合 PRV-05、W2 或其余任务。

历史费用批 `ea770c7be9d6bf826054b15d3384bb45fdaedcd8` 已推送，实际读回 Architecture Watch `39124441199` 与 CI `39124441229` 均 success。辅助费用返工已通过受影响 70 文件/865 项、六项有效反转、双构建、四格隔离 PTY、两进程增量与独立复核；原目录删除/替换的响应只能报告未能持久化，不能归入新会话。此处记录本地证据，提交/远端结果继续按日志及实际 SHA 核对，全部 47 项仍按原范围推进。

辅助费用批已推送为 `6b1eab75cfa089f8f7424e25746fee296ef6bc26`，Architecture Watch `39131315169` success；本轮实际查询 CI `39131315102` 及 job `117686908263` 仍为 in_progress，不能记为通过。主请求续期 checkpoint 批的受影响 32 文件/518 项、六项有效反转、双构建、四格隔离 PTY 与独立 7 文件/138 项复核均通过。缺回执或未确认发布即失效，已保存的凭据仍恰好发布一次；完整 PRV-03…05、CTX-03 与其余任务继续原范围，交付状态以日志和实际 SHA 为准。

checkpoint 批已推送为 `c0f065385597e6cb3a5138b22a5fb7ba65360ad6`，Architecture Watch `39133444455` success；CI `39133444370` 仍为 in_progress。随后 PRV-04 复核发现按年龄删除 dispatched/unknown 使旧 token 重新获准的缺口，修复后受影响 7 文件/147 项、有效反转和两个独立进程重启场景通过，实际续期零 HTTP。该证据只覆盖年龄重播窗口；lineage/旧键迁移、rotated-persisted、完整账号限制与请求账本继续开放，独立复核和新 SHA 交付按开发日志记录。

后续实际终态核对：辅助费用批 CI `39131315102` 为 failure，GitHub 注释 hosted runner lost communication；原始日志为空，没有测试失败断言证据，不能记为通过。checkpoint 批 CI `39133444370` 为 success；年龄保留批 `e4ae423de3a931b82b09a5dde137cc87565663f8` 的 CI `39134059372` 与 Architecture Watch `39134059381` 均 success。完整 SHA、时间与分类见日志。PRV-04 两独立进程的复制槽位复现仍发送两次刷新，新的谱系/grant/attempt/原生响应证据返工正在实施，尚未验收或交付。

用户曾允许后续验证的环境/真实模型项：START-03 受控冷缓存及剩余响应测量、QA-02 跨平台/IME/系统复制、QA-03 真实质量、TOOL-02 成本与 tokenizer 校准。**START-03 已于 2026-10-23 通过同机 warm/cold 运行闭合；QA-02 的跨平台支持矩阵已由 `Platform QA` `39834842595` 闭合；IME、系统复制与 Windows 交互 PTY 仍保留，且该保留不覆盖可在本地完成的缺失实现和合成端到端验收。**

2026-10-21 PAN-02 再次复现真实排队 `/tree` 的焦点错误：exclusive 包装的对象展开在 load 前读掉 `initialSelection` getter，Enter 因而选中旧节点。现在保留属性描述符及 prototype；真实 `InteractiveMode.run('/tree')` 回归先失败后通过，对象展开反转再次失败。受影响 4 文件/129 项、生产类型检查、双构建、打包入口 gate、静态门和 Linux 八格隔离 QA 通过；独立 code APPROVE、architecture CLEAR。该批提交与精确 SHA CI 仍按日志实际结果记录，不据此闭合全阶段。

该 SHA 的 CI `39534315600` 已完成但因 `catalog.test.ts` 在 Node 20.3 关闭目录句柄后同步抛错、测试直接把调用结果交给 `.rejects` 而失败；905 文件/9378 项通过，失败仅此测试。将断言包在 microtask 中同时覆盖同步 throw 与 rejected promise，保留 `ERR_DIR_CLOSED` 精确检查；catalog 4/4、上述 PAN-02 组合 133/133 及生产类型检查通过，代码 APPROVE、架构 CLEAR。修复另行提交，旧 CI 失败保留，不记作新 SHA 证据。

修复提交 `ec09693ee50ca1f05d0c5c656ec6d05ee5f0c9a0` 已推送，远端 main 精确读回；Architecture Watch `39536881716` success，CI `39536881715` 于 `2026-10-21T03:27:30Z` completed/success。CI 9382 项测试（9378 passed、3 skipped、1 skipped file）及 NormProof 均通过；该证据只绑定此测试兼容修复，Phase 20 继续 active。

PRV-04 谱系批本地验收通过：38 文件/682 项、14 项有效反转、两构建、跨进程复制槽位/五组恢复/三组 V1 迁移/default 与 named profile 替换拒绝、Linux Node/exe × regular/fullscreen 四格 PTY。最终独立复核 APPROVED、5 文件/178 项及原生探针通过，计数与本地集重叠不相加。完整 TypeScript 诊断相对 `e4ae423d` 为 149/149、无新增，不能记为全项目 tsc 通过。该批提交/推送/新 SHA CI 按日志及实际查询记录；PRV-03/05 已复现的池外授权与乱序退避、CTX-03 和其余全部 47 项继续原范围。

谱系批已推送为 `87a55c5f0b4fcbdab5a063e0b74a6d399c0f0692`；Architecture Watch `39140810147` success，CI `39140810129` failure，7 项入口续期测试失败、8808 项通过。失败来自旧夹具伪造续期 payload，未提供新的原生响应凭证；当前夹具改走实际原生解码、验证 HTTP 前 dispatched，并补伪造结果拒绝，8 项通过。此失败记录保留，不当作旧 SHA CI 通过。

PRV-03/05 池限制与退避返工本地验收：最终受影响 23 文件/439 项、19 项有效加载时反转、两构建、实际 CLI 子请求/本机 HTTP/账本与独立进程读回、Linux 四格隔离 PTY均通过；最终 L3 APPROVED、6 文件/105 项和实际 HTTP 竞争探针通过，计数重叠不相加。新 SHA 提交/推送/CI 仍按开发日志与实际查询记录。完整辅助 consumer/publication、可用性投影、provider/endpoint/受众绑定、CTX-03 和其余任务继续，不增加用户推迟项。

池限制/退避批已推送为 `2e0ffe09af81b7d0aa0619658ca9e0f7bba5cf56`；Architecture Watch `39144013465` success。CI `39144013469`/job `117724050073` 于 `2026-10-18T16:24:28Z` completed/failure，前十三步 success，8860 项通过、3 跳过；唯一失败为既有 `grepStream` 测试探测新写脚本时的 `spawn ETXTBSY`，入口续期用例已通过，NormProof skipped。原始日志及精确 SHA JSON 已保存，不重写旧 run 的失败结果。后续可用性投影/测试夹具和 CTX-03 正在本地实施，尚未交付。

可用性/CTX-03 本地返工验收：最终受影响51文件/520项、双构建、9编译HTTP/restart场景、Linux四格PTY、14摘要及9可用性有效反转、脚本59项和五项静态门禁均通过。类型反向环已按owner contract修复，独立delta确认接口与运行emit一致。可用性综合APPROVED/CLEAR；CTX code APPROVE/architecture WATCH，按规则综合COMMENT，容量8192与锁内同步I/O取舍见compaction-operations。产品/测试manifest和当前构建绑定已读回；提交/推送/精确SHA CI按日志后续记录，不宣称整个W3或Phase20完成。

可用性/CTX-03 批 `da01dd609797100d6077c15331b86c500452986b` 已推送，Architecture Watch success；CI `39154482779` completed/failure，唯一旧未知 transcript 类型期待失败、8925项通过、3跳过。当前测试保留未知拒绝并补已知legacy兼容和malformed拒绝；root29项、独立36项、两项实际反转失败及独立APPROVE/CLEAR已有证据。仅测试/文档修正，提交及新SHA CI按日志后续记录。PRV-03 endpoint/账号受众、subscription consumer与CTX-01/02/04、TOOL-01及其余任务仍开放。

decoder 批已推送为 `e6311a1415b0fa1cc3ee9c090edad99b84065b17`，实际读回 CI `39248899708`/job `118047529763` 于 `2026-10-19T12:14:43Z` completed/success，Architecture Watch `39248899786` success。

账号地址/subscription 批最终本地验收：受影响24文件/426项、五组有效反转、双构建、外站覆盖零HTTP及Linux四格隔离PTY通过。主readiness保留账号存储地址，后续真实AccountEdit不再产生缺省地址冲突；配置账号owner降至20函数且全源图无回边。独立code APPROVE/architecture WATCH，按规则综合COMMENT：内置默认仍归模型目录，完整issuer/受众、原生Responses/Google/subscription协议与subscription续期继续开放。最终产品/测试manifest和构建指纹已匹配；该批提交/推送/精确SHA CI按开发日志后续记录，全部47项范围不变。

账号地址/subscription 批已提交推送为 `e83e596ef72a9e89096f209d05349e163d2c780d`；CI `39255262496`/job `118068837295` 于 `2026-10-19T13:06:28Z` completed/success，Architecture Watch `39255262491` success。公开 Responses 协议基座本地受影响18文件/280项、十组有效反转、双构建、编译本机HTTP与Linux四格PTY通过；完整有序加密回放和捕获地址/凭据代次 binding 沿现消息链保留。独立审查和精确交付见开发日志。该基座仍不闭合账户issuer/stream-only/cap、Google、subscription及其余全部任务。

公开 Responses 批 `5fbede8ca57bb8ad3b83e989802b3768b57e0513` 已推送；CI `39261638484`/job `118090503736` 于 `2026-10-19T13:52:27Z` completed/success，883 文件通过、1 跳过，9009 项通过、3 跳过；Architecture Watch `39261638354` success。

原生 OpenAI 账户返工本地受影响46文件/797项、后续 consumed-predecessor 修复11项与账户能力断言17项通过（集合重叠不相加），双构建、12项有效反转、Linux Node/exe × regular/fullscreen 四格隔离 TLS PTY通过。issuer 固定协议、辅助 SSE、显式 cap/tier 拒绝、精确 access 账户声明及原生 grant 跨续期回放均有反例；实际登录/续期/旧前代/profile复制和目录替换验证保持原 owner。独立 code APPROVE/architecture CLEAR；能力断言版 manifest `996e289a…211a203`，随后仅修新文件EOF空行，最终59文件 manifest `471a047b…ac39a650`。类型诊断149/149无新增，仍非全项目tsc通过；静态门与脚本59项通过，NormProof blocking义务通过、8项旧ceiling advisory。提交/推送/精确SHA CI按日志后续证据记录。Google、subscription及其余47项范围继续，仅用户原环境/真实质量项推迟。

交付前已因最后测试断言刷新双构建，TS manifest `37313fcfbdfc`、源码摘要fresh匹配；刷新产物四格TLS PTY和编译模块原生grant/身份/SSE/redirect探针均通过。EOF空行修正后TS manifest `590a46e60240`再次fresh，2013非测试emit与exe均未变化；前述PTY/编译探针发生在修正前，产品编译字节一致。两路最终独立评审均重新精确绑定59文件manifest `471a047b…ac39a650`，综合APPROVE限本批。当前本地提交待修订，尚未推送与新SHA CI。

原生账户批 `09e141c8ea7a885693cff221db7bb23cfd4dc632` 已推送，Architecture Watch `39273753281` success；CI `39273753508`/job `118132587473` 于 `2026-10-19T15:14:05Z` completed/failure，9019通过、30失败、3跳过。失败均为usage/reset旧夹具绑定外站，被新issuer规则拒绝；当前仅修账户夹具并保留API-key外站、增加账户外站零HTTP回归，最终本地/独立评审及新SHA交付以日志后续证据为准。整个Phase20继续active。

usage夹具最终1文件/32项通过，独立code实际另跑相同32项并APPROVE，architecture原始字节验证CLEAR；重叠不累加。测试SHA256 `336f85e0…71afe920`，两路报告已独立保存。仅usage测试/两份文档单独交付，Google批仍未提交；新SHA CI尚待实际读取。

usage修正 `61ec1bc0a15282c56792086176d87a7e4a18a0c9` 已推送、远端SHA读回；CI `39279497980`当前in_progress，Watch `39279497944` success。Google批最终37文件/674项、14项有效反转、双构建、编译HTTP/存储探针和四格隔离TLS PTY通过；实际scope/project/secret、issuer/原生codec、unknown零重播和有序签名回放沿既有owner。29文件manifest `77a547ed…7bb8663`、类型149/149零新增；静态门/脚本59通过，NormProof0blocking/8旧advisory。独立codeAPPROVE及architecture最终绑定按日志后续记录；Google尚未提交推送或CI。subscription身份/续期及其余全部47项继续，真实环境/质量仅按用户原推迟范围。

usage修正CI `39279497980` 后续读回completed/success，Watch success。Google最终双路独立codeAPPROVE/architectureCLEAR精确绑定manifest `77a547ed…7bb8663`，严格docs门通过；综合APPROVE限本批，提交/推送及新SHA CI按开发日志后续查询记录。

## 历史实现与交付记录（不代表本次复核通过）

| 任务 | 提交 | 证据 |
|---|---|---|
| CFG-01…05 | `c7b2ec91` 等 | 配置身份/作用域/环境字段；`src/config` 测试通过 |
| PRV-01…05 | `15abda70`…`61a517ea` | 可用性、预设、账号池、刷新租约、429 backoff |
| CTX-01…04 | `46d5be7d`…`744449b6` | 消息计数、测量身份、请求预算、压缩操作幂等、四态报告 |
| TOOL-01 | `dda58393` | 动态发现、pinned/search/load、generation |
| UI-01…04 | `466f28c6`、`56594d08` | 输入区预算、两栏面板、二维命中、进度/chip、transcript 源投影 |
| CMD-01/02 | `0345b44f`、`a4deb45e` | 前缀排序、完整命令提交；102 入口审计沿用既有契约 |
| SET-01/02 | `734f51a4`、`9ce49b16` | 34 项编辑器、7 组 tab、changed 标记 |
| SET-03（预览） | `6736f402` | status/theme 预览撤销；Apply 前不写、CAS 保持 |
| PAN-02（部分） | `6736f402`、本次 | 时间分组、`Ctrl+P` pin、tree 连接线与 current focus、全屏事实/对话预览、窄屏 stacked preview、完整授权目录搜索、10k 分页批处理、pin 持久化 |
| PAN-03（部分） | 本次 | `/hub` 只读主从面板、1s journal 轮询、详情列 |
| PAN-05（部分） | 本次 | `/advisor` 只读 checkpoint/note 主从面板；`/plan-review` 增加结构化 `CommandReport`（版本/阶段/验收项/绑定状态），`/btw` 增加问题/是否送达/答案报告；两者仍只读或独立授权 |
| INPUT-01（部分） | 本次 | 五模式状态机、vimMode、Normal/Visual Enter 不提交、粘贴优先 |
| RENDER-03（补强） | 本次 | 并排 diff、配对行号、严格 rows/bytes 双预算、精确 UTF-8 边界、窄屏 unified 回退、resize 锚点、左右源复制、纯 rename 与 rename/BOM/EOL/EOF facts |
| RENDER-02（部分） | 本次 | 多行 cell、escaped/code pipe、`<br>`、最终 Markdown/HTML code-span 一致性、窄屏源码回退与预算 |
| RENDER-01（部分） | 本次 | 内联数学投影、金额/代码保护、escaped/multi-run/unmatched backtick、未知命令与超预算保原文 |
| PAN-04 | `6736f402`、`2147cb6d` | `/usage account` quota 进度投影、`/thinking` effort 选择器；exact relay/unknown/ambiguous effort 与 unknown-vs-zero quota 验收 |
| PAN-06（部分） | `6736f402`、本次 | copy 移除 recent-30 窗口；restore 生成可解析的 preview draft，绑定项目及复合快照身份，提交前重读元数据，明确失败/部分目录与取消 |
| PAN-07（部分） | 本次 | `/extensions` 为 `/plugin` 别名 |
| START-01（补强） | `0afab79a`、本次 | build manifest、五种拒绝状态、`start`/`start:dev`；轻量 `--version`/`--help`、组合参数和坏配置准入；fresh packaged gate 通过 |
| JOB-01（补强） | `dd43bcce`、本次 | 单次 spawn、detach/kill、adopt/promote、60s/新消息晋升、撤权 kill、重启 unknown 不重播；detach 后保留 settlement 与 300s 总期限 |
| JOB-02（补强） | `7da6e6d4`、`8c7f949f`、本次 | 本地 notice、opt-in follow-up（去重/预算/截断）、脱敏/reload、取消不转后台 |
| EDIT-01（补强） | `57e1ffb3`、`8c7f949f`、本次 | 稳定且绑定 baseline/hunk content/add content 的 group id、依赖分组、同文件 hunk 选集、无选集拒绝、重规划 revision、requested/selected/skipped receipt |
| START-02（本地证据闭合） | `3de906fe`、本次 | 10k 首帧不扫描；持久摘要索引；0/100/1k/10k bootstrap 不枚举探针；TUI/line 首帧 write completion 后 recovery hint；routing sink 与 transcript ownership 分离；键盘/鼠标/粘贴/picker/line 用户意图 fence；line close/stop 主动取消 MCP/SSH/collaboration/current run 并释放 goal scheduler；真实 scheduler drain 超时结算 captured host，sink 对迟到 goal dispatch 保持 discard fence；teardown sink 顺序、`runCliProcess` fullscreen 集成与 Node/exe × regular/fullscreen 两次 seeded PTY |
| PAN-05 | `2a4bafe5`、本次 | advisor 只读面板 + enable/review/apply 分别授权；plan-review 结构化报告与版本化 approve/reject/execute；btw 结构化报告、带外；面板查看不启模型，模型工作只走显式命令/普通 turn |
| PAN-03（部分） | `070f1405` | hub 本地作业输出页（脱敏/截断）、后续页指引 |
| PAN-08（历史部分实现） | `93302750` | 旧MCP逐项向导及临时定义机制；2026-10-21返工发现临时文件不在source授权范围，现已由typed原owner替代，当前证据见下文 |
| START-03（部分） | `a6ba2665` | Node/exe 与 regular/fullscreen/pipe 各 30 次首帧、命令→退出基准 |

## 部分完成（有实现，验收未闭合）

| 任务 | 已做 | 缺 |
|---|---|---|
| PAN-02 | 时间分组、pin、树形、跨项目完整授权目录搜索、10k 分页批处理、全屏事实/对话预览、窄屏 stacked preview、current tree focus、pin 持久化；Linux TUI fork/切换/确认删除组合通过 | 其余动作身份/revision 边界继续复核；restore preview 另归 PAN-06 |
| PAN-06 | copy 全量、pin；copy 100 项分页、continuation、源 revision 与 stale 拒绝；restore 100项分页/续页、全目录搜索、有界目录缓冲与记录保留、复合身份消歧、元数据digest重验、特殊路径参数及preview-only业务链；back 保留完整候选、25项展示续页、numeric/exact-ID定位、完整prompt搜索和共享捕获快照，沿既有草稿/分支回退；四格打包PTY核对60题全可达与文件不变 | history完整持久树沿既有query owner；undo saved-results已补40条续页/明确到头、scope和完整receipt revision重验，精确补偿沿原owner；copy已补完整block搜索/续页/到头/失败/取消及恢复会话早期源；其余identity/revision及资源边界继续复核；back完整候选保留/同步搜索随源大小增长，restore每页/搜索仍线性扫描目录，不宣称搜索延迟上界或原子目录快照 |
| PAN-06 history | 裸 `/history` 复用完整持久树及废弃分支，选择只生成精确 `/tree -- <entry-id>` 草稿；空历史/无匹配/读取失败分开；真实排队焦点、禁用身份与取消无写回归；底栏任务存储读取失败显示 unavailable，恢复后重新读取 | 完整树/全文搜索仍同步且未设总字节/工作量界，10k模拟节点不证明真实大历史响应界；cleanse 面板、其余 identity/revision 及资源合同继续开放；本批293项、专用故障PTY与交付证据见开发日志 |
| PAN-03 | hub 主从视图、本地作业输出页（脱敏/截断、后续页指引）、watcher 注销与 unknown status 回归；`/agents` 复用 jobs owner 的 `agentProjection`/`agentPage`，覆盖 stale/detached 与脱敏输出页 | agents 控制操作仍归 `/jobs`；其余 journal/revision 边界继续复核 |
| PAN-07 | alias、逐项确认 | login/logout 设备码安全显示的端到端验收 |
## 未闭合

START-03 已由 2026-10-23 的受控冷/热基准闭合；以下只列仍开放项。

- QA-02：Linux/macOS 各 Node/exe × regular/fullscreen/line/pipe 八格与 Windows Node/exe × line/pipe 四格在 `Platform QA` `39834842595` 全部 pass/exit 0；20 个 JSON/transcript 已完成平台、架构、target/mode、构建摘要、工具 result 与 skill payload 审计。Windows 交互 PTY、真实 IME 和系统复制仍缺环境，不把 line/pipe 结果外推为完整 Windows TUI。
- QA-03：`npm run qa:quality` 已提供 fail-closed harness、正式 20 项 corpus、隔离 MCP/extension、跨进程续接、build-bound JSON、确定性/双盲评分和 10,000 次 paired bootstrap；真实 100 pair、双盲评分和启动/性能聚合仍缺。
- TOOL-02：`/tools` 已按当前 endpoint 序列化协议声明，报告 description/schema payload、UTF-8 bytes 与 code-unit token estimate；有界 `recentRequests` 持久化 discovery purpose/input/output attribution。正式 harness 已能测同模型 turns/tool calls/argument errors/missed discovery/cache/cost coverage 与四语言 tokenizer 误差，但真实数值尚未运行。
- QA-02 的 restore preview 已在 Linux/macOS 全部 16 格及 Windows line/pipe 4 格通过，并验证文件/记录/blob 字节不变；line/pipe 已覆盖 settings 保存、命名 profile 创建和重启读回，但非交互 profile switch/approval 与 Windows TUI 的完整生命周期仍需按平台实际验证。QA-01 矩阵已补齐独立任务行，但仍不能作为 47 项全闭合证明。

## CI

- `9c8104a6`（copy 测试改为 clipboard sink）：CI success，12m28s。
- 其后的 docs/advisor/resume 提交在写本文时仍在队列中；以 GitHub run 结果为准，不能把本地通过当成 CI 通过。
- 更早的失败提交均已被后续修复覆盖：handoff 的 `todo` pin、director feature tools、settings 标签、firstFrame padding、MCP 启动超时、copy 的环境依赖。
- `57e1ffb3`、`7da6e6d4`、`f0f2f2d2` 的 CI 均因同一对取消测试超时失败（`director/runtime.test.ts`、`jobs/agent/command.test.ts`）：bash 工具改走 `startCommand` 后，测试仍 mock `executeLocally`。`0b8dcdb4` 改为 mock `startStreamed` 并让 `startCommand` 同样报告 settlement；本地全量 8473 通过，CI success（run 39061415399）。`c5da8107`（启动基准脚本与 `bench:start`）CI success（run 39062680340）。`070f1405` CI success（run 39066438514）；`93302750`、`a6ba2665`、`4631ea3a`、`8802e496` CI success。`2bdebf5a` 仅 `browser.test.ts` 的 “blocked without a manifest” 失败（本地 5/5 通过，且其后含同改动的 `4631ea3a` CI success），归为 CI 浏览器环境抖动。`ea0078ab`（索引清理）、`cd881d25`（双构建 PTY）、`df23d812`（并排源复制）、`0ea1c2fa`（预派发取消）、`a8b07008`（浏览器场景超时）、`e3217a14`（CLI 场景超时）CI success；`768903b0`（external 场景超时）CI success（run 39076664306）。`bde00a5e` 再次命中同一 baseline 管道抖动；已改为等待 `- ID:` 行，本地 40/40，后续 SHA 验证。
- `8c7f949f`、`3de906fe`、`2a4bafe5`、`b913c50e` CI success；`dd43bcce` 的 CI 仅 `cli-baseline.test.ts` 的 pipe-spawn smoke 失败（期望 `- ID:`），本地单跑 40/40 通过，且其后的 SHA 同代码 CI success，归为负载下的 spawn 抖动。
- `8ee42201` 的 CI `39460132672`/job `118757136751` completed/failure：9306 项通过、2 失败、3 跳过；两项都在 `cli-baseline.test.ts` 的 non-TTY health/golden 路径，实际原因是 `runPromptInputStream` 绕过 `runLineLoop` 后未接 first-frame/user-intent，导致 recovery hint 与聚合诊断不发布，不是单纯超时。当前工作树已接同一 lifecycle，并将 golden fixture 改为先等待 health 结果再发首个 prompt；本批新 SHA CI 待提交后实际读回。
- `921425a8` 的 CI `39470238485`/job `118792058672` completed/failure：9342 项通过、1 失败、3 跳过；失败是 `picker.test.ts` 的窄宽 footer 契约，因合并 footer 换行只保留 `Enter to …`。后续 `20e6ee61` 为窄宽 footer 增加 `Esc to close` 紧凑回退并保留 capacity 3+ 的 focused row；该失败未被改写为通过。
- `20e6ee614b4e27a3c2bb04e840a76b24d36ef540` 已提交/推送，远端 `main` 读回同 SHA；CI `39473768928`/job `118804307316` 与 Architecture Watch `39473768919`/job `118804307045` 均 completed/success。

## 启动基准（2026-10-18，WSL2，Node 20）

`npm run bench:start`：每个样本一个新进程，测 spawn 到退出的墙钟时间；首样本单列，因为无特权无法清页缓存，不能称为受控冷启动。

| target | runs | first | p50 | p95 | min | max |
|---|---|---|---|---|---|---|
| node `dist/cli.js --version` | 30 | 1991.5ms | 1030.4ms | 1074.6ms | 995.8ms | 1991.5ms |
| exe `dist/bin/cheers --version` | 30 | 492.7ms | 497.5ms | 526.1ms | 469.7ms | 528.2ms |

交互（`npm run bench:interactive`，`script` 提供 PTY 或 pipe，每模式 30 次，`/exit` 在 1200ms 注入）：

| mode | first frame first | first frame p50 | first frame p95 | `/exit` 后退出 p50 | p95 | 命令→退出 p50 | p95 |
|---|---|---|---|---|---|---|---|
| regular | 1041.4ms | 1054.6ms | 1086.0ms | 1361.4ms | 1395.5ms | 157.5ms | 190.5ms |
| fullscreen | 1055.6ms | 1061.0ms | 1139.0ms | 1365.3ms | 1391.1ms | 161.1ms | 187.1ms |
| pipe | 1081.5ms | 1035.7ms | 1082.0ms | 1402.3ms | 1682.6ms | 198.8ms | 480.6ms |

此处旧基准未测受控冷缓存；2026-10-23 的 GitHub `Performance` 运行已另行补齐同机 warm/cold 证据，不能把本表旧 warm 数据与那次 cold 数据混在一起。

## 本地全量

- `0b8dcdb4`：850 文件、8473 通过、1 跳过（`npm run test:ts`，410s）。

- 最新 `test:ts`：8459/8459 通过（fresh dist，含 INPUT-01 与 receipt 去重修复）。
- `test:scripts` 59 项、`verify:import-cycles`、`check:config-consumers`、`check:declarations`、`check:node-floor` 通过；`verify:docs-drift:strict` 只有既有 advisory。
- 全量套件曾暴露的真实缺陷均已修复：`todo`/feature tool 未进首请求、settings 标签、firstFrame padding、MCP 启动超时、copy 环境依赖、并发 receipt 重复。

## 当前门禁

`verify:import-cycles`、`check:declarations`、`check:config-consumers`、`check:node-floor` 通过；`verify:docs-drift:strict` 只有既有 advisory。全量 `test:ts` 结果以运行日志为准。

Google批 `311573ca63f7cbd6e8e4b8d8f417ebc34d83a7a7` 已推送、远端读回；Watch `39284913470` success。CI `39284913496`/job `118168018187` completed/failure：9107通过、2失败、3跳过，失败仅Google畸形JSON SSE旧stop期待。新合同拒绝工具/签名权威，测试/文档单独校正；新SHA结果以日志实际证据为准。Copilot身份/续期与全部47项继续，Anthropic订阅方向按官方第三方应用限制和项目身份边界修正为API-key路径，尚未交付。

### 2026-10-20 返工审计与 Copilot 修复

- Copilot 未提交批次发现并修复：Messages 路由应为 `/v1/messages`；account-auth 头必须按大小写不敏感合并，避免重复 `Content-Type`；Copilot readiness 必须携带 gateway identity 头；省略 endpoint 时允许 native default；设备码流缺 progress 回调不再抛错；Copilot 403 不再被误报为 API-key 失效。
- Copilot 原生登录到持久化 grant、再到 `renewStoredAccount` 的合成链路已加入回归；wire 解析、redirect、proof、base URL 与 issuer 校验仍保持拒绝路径。
- 本地 Copilot 聚焦集 8 文件/113 项通过；renewal/connect/provider 相关集 7 文件/185 项通过；Node/exe 双构建、脚本 59 项、四项静态门禁和 strict docs drift 通过（118 条既有 advisory）。
- Linux PTY smoke 四格通过：Node/exe × regular/fullscreen 均完成 `/tools`、`/sessions current`、`/exit` 并退出 0。
- 全量 `test:ts` 运行 9,120 通过、1 跳过、5 失败；五个失败均为 browser scenario 负载下失败，逐一隔离复跑全部通过，因此本轮不能记作全量绿。相关测试文件为 receipt、cache、skills、healing 和 external handoff。
- 当前批次尚未提交/推送，不能把本地证据当作新 SHA CI；`ec658966` 的 CI `39289335200` 与 Watch `39289335408` 已读回 success。

### 2026-10-20 W7/W8/W9 与 TUI 输入/渲染返工

- 当前基线为 `10f4b579`。本批修复 build manifest 输入/emit/资产绑定、不可变构建、原子 pointer、lock-owner 事务恢复、CLI 硬门禁、同文件多 hunk 选集、后台任务结算/脱敏/reload、首帧 session catalog 扫描，以及 TUI 多反引号表格、raw fallback 字节预算、UTF-8 chunk、字素保持和 Vim 纵向边界。
- build lock 现在由恢复与发布共用：恢复先原子取得锁；active、stale、malformed lock 均 fail-closed；发布必须提供自己的 owner，编译期间 lock 被替换时拒绝发布且不删除替代 lock。stale lock 需人工确认后清理。
- `StdinBuffer` 对跨 chunk 的完整字素使用 8 ms hold，覆盖 ASCII 标点、combining mark、keycap、ZWJ、escape/paste 后文本；控制键不延迟。`InteractiveMode` 复用注入 scheduler，避免测试与生产出现两套时间源。
- JSON CLI 硬门禁验证真实 read 输出、stdin 加 prompt、单 hunk `apply_patch`、default-deny、失败后续、session migration 和 packaged entry；负例覆盖 `success:false`、approval/result 乱序及顶层 `toolCallId` 错配。
- 聚焦 TUI/input/editor/render/HTML/InteractiveMode 套件 11 文件/266 项通过；`scripts/start.test.mjs` 30 项、`scripts/verify-cli-entry.test.mjs` 4 项及其余脚本合计 91 项通过。
- browser/CLI 场景串行 34 文件/214 项通过、1 跳过。非 browser/CLI 完整车道 860 文件/8,983 项通过、1 项失败；唯一失败为既有 `grepPaths` 夹具 `spawn ETXTBSY`，该文件单独复跑 12/12 通过，不能记作该车道全绿。
- 当前源码双构建通过：TS manifest `0ca9903c8a39c2771befc377c316d1f93a1e41eed51e7883b2ca954b62b50094`，1754 个 emit 文件；exe 102,574,208 bytes、SHA-256 `c516f9f1c6c61e036a4ab41b02de2353ac092ef79dda885a28624fe72d253fd6`。Node CLI、exe、`start` 均输出 `0.1.0`。
- `verify:cli-entry` 全项通过；Linux Node/exe × regular/fullscreen PTY 四格通过。严格 docs drift 通过并保留 118 条既有 advisory；NormProof blocking unresolved-specifier 义务 satisfied，仍为 8 项既有函数上限 advisory。
- 首推 `96fae26d877a6d162c0f9909d3726969ca6c635d` 的 Architecture Watch `39397906660` success；CI `39397906657`/job `118545101287` 在 `test:scripts` 唯一失败：Node 20.3 下假 `tsc` fixture 被 `type:module` 当作 extensionless ESM，退出 1。夹具改为显式 CommonJS 后提交 `116639111a491b063904eb502c55f2b749f7df32`，远端 main 已读回。
- 修复 SHA 的 CI `39398373664`/job `118546643247` completed/success，耗时 16m49s，893 个测试文件通过、1 跳过；Architecture Watch `39398373370`/job `118546640910` success。旧 SHA 失败保留，不改写为通过。
- 全部 47 项 Phase 20 范围继续 active。

### 2026-10-20 二次返工：启动、任务、编辑、渲染与 copy

- 独立只读审计确认旧“只剩 4 项”仍不成立，并给出可复现反例。本批没有把实现存在当成验收通过；下列结果均为当前工作树实际运行。
- START-01 入口已拆分：`--version`/`--help` 在加载 `cliProcessRunner` 与 runtime 图前返回；`--profile default --help`、`--help --print` 也按 help 处理，`--` 后的同名文本仍按普通输入。`startup.test` 新增 0/100/1k/10k bootstrap 不调用 `listSessions`，并覆盖缺失显式配置仍在 bootstrap 前拒绝。
- JOB-01 现在把晋升后的总期限传到 `startCommand`/`startStreamed`，`detach()` 只释放前台 abort 绑定而保留 deadline，`stop` 等待 adopted settlement；JOB-02 每次 completion 重新读取 enable 策略，命令与输出均先脱敏。JOB 聚焦测试为 `local.handle` 4 项、`journal` 19 项、`backgroundNotice` 6 项，另 `service` 8 项与 `promotion` 4 项通过。
- EDIT-01 现在把源基线、hunk indexes/content 与 add content 纳入 group identity，选集重建时校验基线，并在 receipt 中同时记录 requested/selected/skipped IDs；同文件双 hunk、依赖组、源变化、同基线内容变化和 stale revision 均由 `batch` 38 项覆盖。
- RENDER 侧修复：diff rows/bytes 均严格受限，ASCII/UTF-8/CRLF/尾换行精确边界不误截断，文件头与 removed/added 分离，side-by-side sources 与 rows 对齐，纯 rename 和 rename/BOM/EOL/EOF facts 可见；数学、表格、Markdown 与 HTML 共用有界 inline token 解析，区分 escaped/multi-run/unmatched，link label 内 code 可达，强调可跨 token 闭合，64 KiB 边界内 64k backtick/escaped-math run 线性处理，超 1 byte 原样保留，80k bracket/60k private-use run 受预算保护，label 内不生成嵌套链接，code 内不解析公式、链接或强调。math/table/diff/markdown/html 合计 122 项通过。
- PAN-06 copy 首屏改为 100 项有界页，提供明确 continuation、source revision 和 stale selection 拒绝；1001-block、下一页与 revision 变化均有回归，`copy` 3 项通过。
- 多轮定向反转分别产生 10、4、3、2 个实际失败：撤销 `stop` settlement、timeout 传播或 detach deadline 后 JOB 用例失败；把函数型 follow-up policy 退化为布尔值后 reload 用例失败；合并同文件 hunk、移除 hunk/add content identity 后 identity 用例失败；恢复 escaped/multi-run 误解析、link label 不递归、固定多计换行字节、纯 rename 早退或把 `---`/`+++` header 当改动后，最终 renderer 与 diff 边界用例失败；强制 bootstrap 调用 `listSessions` 后 0 会话探针失败。反转源码已恢复，`git diff --check` 通过。
- 最终受影响 14 文件/303 项通过；fresh TS 构建 `fae6df0de84b`、exe 102,615,168 bytes/SHA-256 `a2ad338ad80429db850e5c98e930d19d8b63d9167ed87aaae0dcd3400a7de70d`，`verify:cli-entry` 全项与 Linux Node/exe × regular/fullscreen 四格 PTY 通过。`test:scripts` 91 项、TypeScript、import cycles、config consumers、declarations、Node floor、strict docs drift 与 `git diff --check` 通过；docs drift 保留 118 条既有 advisory。
- 本批提交 `a425420aafdc46140075e4b4560c53727f929212` 已推送、远端 main 完整 SHA 读回。CI `39413554234`/job `118596969632` completed/success（16m12s）；Architecture Watch `39413554208`/job `118596969793` completed/success。该证据绑定上述精确 SHA，不改写此前任何失败记录。
- 该历史节点仍未闭合：START-01/02 的新提交/推送/精确 SHA CI；RENDER/PAN 其余消费者仍按原合同复核。START-03、QA-02/03、TOOL-02 当时按用户允许的环境/真实模型项继续延期，不把本轮合成测试替代它们；START-03 已于 2026-10-23 后续闭合。

### 2026-10-20 START-02 首帧恢复提示与用户意图 fence

- `createStartupRecoveryHint` 是 one-shot lifecycle：TUI 只在 `onFirstWrite` 后启动，line 模式只在 prompt write callback 后启动；键盘、鼠标、粘贴、picker apply 与 line 原始输入只推进一次 interaction revision，最终 publish 前再次校验 session/project/config/interaction generation。line close/stop 也推进 fence，delayed callback/result 被显式失效；recovery/startup logger 抛错不会再形成 rejected promise。
- `StreamingRenderer` 区分 `captured`（输出已路由）与 `transcriptOwned`（host 自己绘制 turn chrome）：line mode 为 `captured=true`、`transcriptOwned=false`，因此 turn boundary 保留且 `/sessions` 仍走非交互 overview。line close/stop 主动 abort MCP signal、取消 SSH/collaboration pending、取消 current run 并 detach goal scheduler；真实 scheduler drain 超时只结算一次 captured host。若 goal dispatch 尚未真正 settle，line sink 保持安装并在 `goalOutputActive=false` 时丢弃迟到输出，dispatch settle 后才恢复旧 sink。
- line close/fail 的同步/异步错误统一进入 `failLineLoop`：关闭前 rejection 会让 loop reject 并撤销 signal close handler，正常 EOF 后的迟到 rejection 只记录、不把成功关闭改成失败；cleanup 各阶段与 logger 自身异常均不能阻断 sink 恢复。
- MCP `snapshot/refresh` 将 signal 贯穿到 client connect/listTools；collaboration 的 inspect/test/receipt/start/join/ACL/stop/share/propose 以及 expired-ticket refresh/poll 都继承 host pending signal，claim/dispatch/ACL 保持 mutation 语义。
- `runCliProcess` 集成测试覆盖 fullscreen 与 line visibility、startup notice router、first-frame 触发和真实 recovery hint wiring；hint 进入 interactive transcript，且不直接写 `process.stdout`。
- 聚焦回归 14 文件/157 项通过：streaming 7、cliStartupSurface 3、startupNotice 4、recoveryHint 10、startup 5、cliProcessRunner 2、firstFrame 22、interactiveLoop 5、lineLoop 28、lineLoopGoal 2、interactiveMode 43、cliCommandExecutionBridge 12、cliMcpModule 5、collaboration/command 9。另有真实 gateway abort、真实 scheduler captured-host/drain 和 guest expired-ticket abort 定向测试通过。
- 8 项定向反转均取得实际失败：sink gate、scheduler drain settle、guest parent signal、MCP signal forwarding、collaboration signal forwarding、recovery logger isolation、close-handler settle、line-handler failure cleanup 与失败路径 signal release；源码均已恢复并复跑通过。
- 本轮较早一次全量 `npm run test:ts` 实际为 9213 passed / 49 failed，耗时 605s；失败集中在整套并发下 20–45s 子进程超时及 CLI baseline 争用，不计为全量绿。最终修复后未重跑全量，交付前仍以精确 SHA CI 为准。
- fresh TS build `bd5cc4951f3938e316dcbc7fb3b46e829d49a93ce7a684d88ad121406bbf5448`，inputs digest `a2bd5f4a4e3b166b719c839b52776b415f44d6ae3c7065e084103288300d0d2c`，artifact digest `25044855dbdd183cdfd8ac5476f8afde2261bf9e72b3af2088fa15be08d43568`；exe 102,668,416 bytes、SHA-256 `b8060dd8a4ca6d6a56a380f766ed44b0aa072c59c6626b05218d3dc2356778f4`。`verify:cli-entry` 全项通过。
- `qa:pty` 连续两次通过 Node/exe × regular/fullscreen 四格：等待首帧与 seeded `Recovery hint`，`/sessions current` 输出与 startup 标题匹配精确 current id，`/tools` picker 打开后 Esc 关闭，再 `/exit` 并以 exit 0 证明输入已回到 prompt。
- `test:scripts` 91 项、import cycles、config consumers、declarations、Node floor、strict docs drift 与 `git diff --check` 通过；docs drift 保留 118 条既有 advisory。`normproof` 命令在当前环境不可用，未记为通过。

### 2026-10-21 START-02 独立复核返工与 PTY 隔离

- 独立复核复现了三个产品缺陷并已修复：line prompt write callback / stdout `error` 的异步失败原先只记录 warning，可能让循环永久挂起；MCP gateway 在队列等待阶段忽略 abort，关闭会被前序请求拖住；PTY smoke 继承 `CHEERS_HOME_OVERRIDE`、provider 凭据和 XDG/Git 配置，可能绕过临时 HOME。line 失败现在统一进入 rejection；MCP `run` 让排队请求与 signal 竞速且不会在取消后启动发现；PTY 子进程使用隔离的 home、test root、XDG、TMPDIR、Git 配置与 provider 环境。
- 新增的异步写失败、stream error、MCP queued abort、PTY 环境隔离和 sink 恢复 marker 回归均通过；聚焦集 4 文件/50 项、脚本 92 项通过。`qa:pty` 在隔离环境下 Node/exe × regular/fullscreen 四格通过。
- `/tools` 报告现在把 description/schema UTF-8 字节列和汇总写进普通文本，而非只藏在 `facts`；token 仍明确为 `not-measured`，真实模型质量/缓存/tokenizer 项保持未验。
- 全量 `npm run test:ts` 本轮实际出现 20 项失败，全部集中在 browser CLI 子进程场景的 exit-code/输出缺失；将同一组 11 个失败文件以 `--single-thread` 串行复跑得到 85 项通过、1 项跳过，说明并发负载下的场景夹具失败仍需在 CI/串行车道单独观察，不能记为全量绿。
- fresh TS build `c80b84f0d7af`，inputs digest `9c5cafc1dd17`，artifact digest `4bb084c80969`；exe 102,668,416 bytes、SHA-256 `9420876813f3`。`verify:cli-entry`、`start --version`、import cycles、config consumers、declarations、Node floor、strict docs drift、`git diff --check` 均通过；docs drift 保留 118 条既有 advisory，module facade 保持 8 项既有 advisory（本批触及的 lineLoop 未新增越界）。仓库 tgz 的 NormProof 实际退出 0、verdict partial，blocking unresolved-specifier 义务 satisfied，仍为 8 项既有函数上限 advisory。
- 本批尚未提交/推送；新 SHA CI、最终独立复核和远端结果仍待实际读回，不把工作树结果写成交付完成。

### 2026-10-21 PAN-02 搜索/预览与 non-TTY recovery 修复

- `/resume` 现在使用 full-screen panel；`Picker.fullScreen` 允许 panel 保留两栏并占满帧。session picker 从 catalog summary 渲染当前/选中会话的项目、状态、时间、文件大小、pin、首问和末答摘录，摘录各限制 1200 个 code point；窄于 60 列时使用 stacked preview，footer 先折行而不是丢弃状态。
- 本地过滤不再只搜索已加载的 40 项：picker 的 debounce search port 由 `OverlayHost` 统一持有 generation/AbortController/timer，旧 query 或 scope 的 late result 不能回填；session listing 扫描完整授权目录后分页匹配结果，文件大小按 41 项 batch 采样，显式区分 searching/partial/complete/no-match/failure。search 结果保留首屏外 identity，`more` 可继续搜索分页并携带 query。
- tree picker 以当前健康 entry 为 initial focus，unavailable entry 仍 disabled；pin/unpin 经既有 metadata owner 原子写入、读回确认，并验证 transcript/state 字节不变。
- non-TTY live stdin 不再绕过 recovery lifecycle：`runPromptInputStream` 在启动输出后报告 first frame，在首行输入时推进 user intent；`printModeRouter`/`cliRuntimeModule`/`cliProcessRunner` 传递同一 hooks。取消 recovery hint 不再吞掉已发现的 unreadable-directory 诊断；golden fixture 在首个 prompt 前等待 health 结果，避免把 fence 误当成产品成功。
- 聚焦 13 文件/186 项、完整 `cli-baseline.test.ts` 41/41、`test:scripts` 92 项通过；import cycles、config consumers、declarations、Node floor、strict docs drift、`git diff --check` 通过，docs drift 保留 118 条既有 advisory，module facade 保持 8 项既有 advisory。fresh TS manifest `6c1e9a7232ce`，exe SHA-256 `687d4c069b0e0c1496fdccd883a166d29f6a9733cc2d1c067e09818c22c7aaa8`；Node/exe × regular/fullscreen PTY 四格、`verify:cli-entry` 19/19 通过。仓库 tgz NormProof 退出 0/partial，open obligations 为 0，保留 8 项 proof gap/既有 ceiling advisory。
- 该历史节点仍未闭合：fork/restore/delete 的组合 PTY 验收；START-03 的真实 ready/key/event-loop/raw sample/受控冷缓存当时仍缺，QA-02 的 line/pipe 五条业务链和跨平台/IME 仍缺，QA-03/TOOL-02 真实质量与 tokenizer 仍未验。本批 `20e6ee61` 已提交/推送，CI 与 Watch 已按精确 SHA 读回 success；START-03 已于 2026-10-23 后续闭合。


### 2026-10-21 QA-02 业务链与 START-03 测量返工

- `qa:pty` 已扩至 Linux Node/exe × regular/fullscreen/line/pipe。TUI 合成链覆盖 seed recovery、fork、新旧会话切换、显式确认删除、resume/tools 关闭、bash、task、tool_search/tool_load/skill、逐次审批、settings 写后读回和 profile 重启后命名目录 session 读回；line/pipe 覆盖任务/发现/显式 allow-once 与 settings 文件字节不变。最终八格 exit 0，持久 transcript 按工具名、call ID、success 和实际 payload 关联。
- 修复合成驱动跨轮次复用 call ID，以及旧 outstanding call 在新实例中被重新派发、无关 tool result 推进计划的问题。意图解析归 `turn/intents.ts`，入口只组装；持久 tool call 使用既有 function 形状，不新增执行路径。
- 新 benchmark 区分首帧/输入提示/TUI listener/write/批处理首答/命令退出，键响应关闭 PTY echo 并等待完整 UTF-8 字符。原来首 chunk 命中、字段误读和旧构建拒绝的失败记录保留。最终基准保存8组各30次共240个原始样本与机器/构建摘要；runtime-ready、1000项列表和复杂stream阻塞、分位数不确定性当时仍未验。受控冷缓存随后由 2026-10-23 `Performance` 运行补齐，不改变本条历史状态。
- 聚焦 7 文件/86 项通过；脚本 96 项通过，两种构建通过；静态 cycles/config/declarations/Node floor 通过。独立 code APPROVE、architecture WATCH，WATCH 为仍缺的验收指标、采样 histogram 与构建前后摘要的证据边界。本批提交/推送/CI 状态以日志中精确 SHA 读回为准；全部47项仍保持原范围复核。
- 全量 TypeScript 实际为 9348 passed / 1 failed / 10 skipped（412.74s、exit 1）；唯一失败是 MCP 畸形配置四次 CLI 启动在并发下超过25秒。相同用例隔离 `--single-thread` 复跑 1 passed（16.63s），原失败日志保留，暂归并发负载夹具超时，不记为全量绿。

## 2026-10-21 `/back` 最终修正与交付边界

- 修正已推送初版的 selector/filter 缺口：exact stable ID 优先于 prompt 子串；数字按全局 newest-first 位置定位；文本查询扫描完整 prompt/ID 后再分页，改变查询回首页，续页保留查询。所有页共享捕获候选，continuation 避让真实 ID，apply 仅接收当前提供的单项。
- 最终受影响6文件/153项、生产TypeScript、TS/exe双构建、四项有效反转、四格专用打包PTY、八格smoke、97项脚本和19项入口检查通过；独立代码APPROVE、架构CLEAR，三文件hash绑定一致。PTY验证取消保持原分支、确认持久化目标leaf/草稿、60条原消息保留及工作区文件字节不变。
- 初版 `163b1607` 的 Watch `39542097301` success；CI `39542097297` 在Ubuntu 26.04安装Chromium失败，TS测试与NormProof未运行。独立提交 `5b885bce` 固定Ubuntu 24.04并保留Node 20.3及全部步骤；`/back`最终修正已推送为 `16b030ec727a47f92f595d5ff1ce2b7b59ec51d8`，Watch `39543032753` success；CI `39543032739`于`2026-10-21T04:27:15Z` completed/success，9387项通过、3跳过、1文件跳过，NormProof步骤通过。PAN-06及全部47项范围继续active。

## 2026-10-21 `/undo` saved-results 完整可达

- 面板与直接命令共用recovery undo域的40条分页；`/undo status --cursor=…`和More saved results可到旧记录，末页明确结束。游标绑定profile/session/workspace及完整receipt值；翻页/选择前复核，变化明确stale，不回填旧会话。按operation ID直接查询继续覆盖完整账本。浏览/取消不调用restore；精确预览、显式确认与逐文件partial/unknown结果沿现有owner。
- 本地10文件/271项（分三条受影响命令）、四项有效反转、生产TypeScript和TS/exe构建通过；四格Node/exe TUI及直接print命令均验证85条/三页完整有序可达、最旧单项可读、取消及工作区/receipt字节不变。新SHA交付按日志实际更新。40条仅约束展示页，账本仍全量同步读/hash；不承诺总I/O或延迟上界，PAN-06继续部分。
- 最终19项入口与八格smoke通过；独立代码APPROVE、架构WATCH，综合COMMENT，七文件hash绑定一致。WATCH保留全账本同步读/hash及receipt内文件数成本；没有总资源/延迟承诺。

## 2026-10-21 `/copy` 完整恢复源与边界

- 完整block文本先搜索再分页，每页最多100个block；查询变化回首页、续页保留查询，所有页共享捕获源及revision。单选只接受当前提供的精确ID，末页拒绝继续；复制清除旧raw argv并沿既有native/OSC52 owner报告实际结果。取消无复制，native失败且仅发出OSC52仍只报告offered。
- 打包205条恢复会话探针先复现真实缺陷：history owner仅保留最后60个重建block，copy分页无法到达早期源。现由相同history投影保留earlier blocks交给Transcript，copy显式读取完整重建源，显示窗口仍60；clear释放两部分并推进revision。未新增磁盘reader。历史源是现有重建Block.text，不能冒充SessionMessage字节级原文或独立diff字段导出。
- 最终受影响8文件197项、生产TypeScript、fresh TS/exe、六项有效反转通过；四格专用PTY现均可搜索205条、跨三页到头、取消零OSC52，确认最旧源仅offered，文件/分支/205条持久消息不变。完整源保留、同步搜索和关闭后overlay callback持有源的成本仍未给上界；独立复核/交付按日志最终证据记录，PAN-06与47项仍active。
- 最终五文件独立代码APPROVE、架构WATCH，综合COMMENT；hash匹配。八格smoke及NormProof blocking gates通过（整体partial/8旧advisory），最终新SHA交付另记；页面行数不代表资源保证。

## 2026-10-21 浮层关闭后释放源快照

- OverlayHost取消与普通/快捷键/表单确认共用本域释放：丢弃OptionModel及筛选闭包、baseOptions、输入表单与行映射，abort加载/搜索并注销订阅。接受前捕获已验证ID和空多选语义；保留accept revision以交接下一页，取消仍推进revision并撤销预览。
- 本地9文件241项、四项有效反转、strict TS/exe双构建、静态门、NormProof blocking门通过。隔离compiled模块4路径/24对象WeakRef+GC核对不再由host持有；这不等于进程总内存/搜索延迟上界。四格205源专用PTY通过，完整源与query继续可达，取消零clipboard、原文件/分支/消息不变。最终smoke/入口/独立复核和交付按日志实际更新。
- `/undo`提交`9dfdaf2513d9e11f0983a20372174402025818c6`的CI`39543768435` / job`119037205415`于`2026-10-21T04:36:47Z` completed/success，Watch`39543768378` success。`/copy`已推送`588efa2bfa06a27030494b55cb70e488fd23f15c`并读回remote main，Watch`39544701897` success；CI`39544701974`仍运行，不借用其他SHA结果。PAN-06和47项继续active。

- 浮层批最终独立代码APPROVE、架构CLEAR，综合APPROVE；三源hash一致。最终19项入口和八格smoke全PASS，strict docs drift及diffcheck通过；完整源常驻/同步搜索成本仍WATCH，未据此闭合PAN-06。

## 2026-10-21 `/pin` 独立入口返工

- 源码复核发现旧状态中的“pin已做”只覆盖resume里的Ctrl+P，`/pin`没有picker映射；新增裸命令薄入口，复用sessionPicker目录/预览/完整授权搜索与现有元数据CAS。Enter只调用pinSession并携带offered version，确认改变后重新读回同一面板/query；失败保留owner原note，取消零写，参数形式保留原直接命令。
- 本地最终6文件251项及生产strict TS/静态门通过，真实元数据集成验证pin/unpin、外部更新拒绝、活动身份与state/transcript不变。初次夹具误把目录首个增量当最终结果，后一次误断言unpinned序列化为false；现分别按真实订阅与省略false的既有codec精确验证。双构建/打包/独立复核/交付依最终日志，不借用旧证据。history和cleanse仍缺独立面板入口，PAN-06不闭合。

- pin最终四项有效反转、fresh TS/exe、四格专用PTY、八格smoke和19项入口全通过；独立代码APPROVE、架构CLEAR，综合APPROVE，五文件hash绑定。四格验证真实pin/unpin、取消不写、stale拒绝、直接参数，以及活动会话/state/transcript/工作区不变。copy提交`588efa2b`的CI`39544701974`于`2026-10-21T04:46:39Z` completed/success，9398项通过/3跳过；其Watch亦success。pin新SHA交付继续按实际更新。

## 2026-10-21 `/cleanse` 保留诊断面板

- 裸命令现沿原security owner的结构化快照和发布事件，浏览保留扫描/修复证据；诊断参数形式仍走原命令，选择只生成带引号的精确诊断草稿。打开/搜索/关闭不启动分析或修复、不取消执行、不写会话或文件；运行中无待处理overlay时可打开只读面板，审批/排队控制继续保留。
- 身份与内容hash在选择前复核；live、无owner的pending→unknown、durability unknown分别保留；外部更新/存储不可用/恢复由视图订阅观察，关闭释放计时器和原owner监听。普通同绑定session对象刷新保留process-only未知receipt；同ID换根使旧视图stale，重开绑定新owner。
- 独立复核发现并修复任意保留remediation status的控制符/凭据泄露、草稿target的C1/凭据绕过，以及缓存换根恢复和同绑定未知证据丢失。最终8文件203项、13项有效反转、生产strict TS、双构建通过；四格Node/exe × regular/fullscreen验证96条记录、全文细节搜索、确认仅草稿、取消零写、实时故障恢复和外部更新。完整日志、独立复核和最终交付按开发日志实际结果记录。
- 资源合同仍WATCH：每秒同步读取完整session、解码/hash再去重；4MiB/32/64是持久owner限制，保留durability unknown影子证据可超过它们。没有进程总内存、累计I/O或响应上界证据，不据此关闭PAN-06或收窄全部47项范围。


## 2026-10-21 `/login` 与 `/logout` 面板入口（PAN-07 部分）

- 裸login经provider/实际支持的account method及cancel缺省确认复用原可取消命令host；API key只产原命令草稿。logout逐条列primary saved connections，完整身份不按label/provider推导；安全投影不含凭据，精确确认带原ConfigEdit进既有writer。打开/取消不写，配置/publication/owner变化拒绝，原writer保留并发冲突与unknown语义。参数与非交互路径继续原路由。
- 独立复核发现的compatible relay重复行与flag-shaped saved ID拒绝均已修复。最终6文件253项、strict TS、fresh双构建、七项有效反转、四格专用PTY通过；真实删除只影响选定连接，state/transcript/metadata/工作区原字节保持。原生账户取消合成测试为pending→error，不声称真实登录已验收。证据与精确交付见日志。
- 代码APPROVE/架构WATCH，综合COMMENT：全配置同步读取/哈希/availability投影尚无资源上界；没有据此关闭PAN-07、其他面板或全部47项。debug/plugin与完整认证生命周期仍按原裁决复核。上批cleanse的精确SHA CI/Watch均success，本批提交/推送/新SHA结果分别取证。

## 2026-10-21 `/debug` 只读诊断入口（PAN-07 部分）

- 裸入口从唯一CommandSyntax生成summary/logs/crashes/metrics/timings/tools静态菜单；打开/取消不读取诊断源、不写入。显式选择复用原观测及报告owner，参数与非交互形式保留。崩溃诊断在解析前限制1MiB，区分missing/invalid/over-limit/unreadable与混合无效记录；原崩溃兼容读取仍保留全部记录。缺工具池、不可读日志/指标/崩溃在UI及facts保持unknown/null及来源status，计数不冒充历史总量。
- 独立评审查实并修正原始指标/工具元数据泄露和先截短后脱敏的key前缀泄露；分组、策略和字节成本仍由原始身份计算，再生成安全报告。原admission在选择前/读取后重验，host按原绑定、overlay revision及stopped状态拒绝迟到发布；读取目录时不持有输入锁，Ctrl+C仍可取消正在进行的任务。
- 最终269项受影响测试、9项报告持久化/codec回归、14项有效反转及生产strict TS通过。四格Node/exe专用PTY覆盖菜单/no-match/取消、六视图及直接不可读来源；显式查看只增安全command-output，无模型消息，配置/工作区/state/metadata原字节保持；Linux八格通用smoke和19项CLI入口通过。中间stale build及探针选择/分页断言问题保留失败证据，最终结果见日志。
- 代码APPROVE、架构WATCH，综合COMMENT；两报告21文件hash与最终双构建已读回绑定。全目录同步枚举/逐文件tail和完整catalog仍无全局资源或延迟界，不据此关闭PAN-07。前批认证SHA的CI已success；本批commit/push/新SHA CI各自取证。plugin/extensions及其余47项继续原范围复核。


## 2026-10-21 `/plugin` 与 `/extensions` 原运行时管理（PAN-07 部分）

- 修复真实pickerHost漏接运行时而走legacy的问题；结构化view只读原ExtensionService/store/source，两个alias同状态。单package inspect、精确release安装/更新、retained rollback、workspace启停、独立grant/revoke、uninstall逐条cancel缺省确认，继续使用原签名/lifecycle/普通审批与command cancellation；提交及审批后的writer前复核原snapshot/source/config/session/workspace，不改非交互与参数路由。
- package/source/activation/grant/durability分别投影，source unavailable不抹掉package，state unreadable不冒充空集。原service保留实际卸载cleanup unknown，同store实例重开仍可见并拒绝fresh mutation；不声称跨restart/rebind持久化。修复多行预览neutralise丢布局；安全投影不改精确执行身份。
- 最终受影响6文件208项、strict production TS、TS/exe双构建、12项实际断言反转、四格专用PTY与八格通用smoke、19入口、97脚本及静态门通过。专用PTY取消无写，真实enable审批只新增4条原权限/工具事件，无model消息且grants仍空；不以审批后状态逐字节不变为合同。原错误探针与测试失败独立保留在log。
- 独立代码APPROVE/架构WATCH，14文件hash与构建实际绑定。全量同步获取/解码/hash/projection在dedup前、post-read大小检查无总资源/延迟上界；未知receipt仅原store实例内存。完整面板生命周期、真实registry/平台与全部47项仍须继续复验；前批debug精确SHA CI/Watch成功，本批交付另取新SHA证据。

## 2026-10-21 原生浏览器登录取消与进度（PAN-07 部分）

- 复核真实命令→provider contract→共享OAuth flow，发现OpenAI/Google wrapper虽透传options，但原flow既不消费signal也不调用onProgress。现由原OAuth owner统一控制整次期限与取消，覆盖localhost bind、浏览器等待、回调及token headers/body，迟到结果不能成为已连接凭据；pre-abort在pending配置写入前拒绝。原条件写、native proof、refresh enrollment与保存unknown不换owner。
- 授权URL先校验安全HTTPS/无userinfo、fragment或原始控制符再展示，launcher缺失不产生未处理错误；手动URL仍可用。回调页仅报告收到授权，后续token交换及保存由终端结算。独立复核发现并修复DNS bind阶段的取消延迟，实际延迟lookup探针证实取消立即结算、无fallback/迟到监听。
- 最终175项受影响测试、strict production TS、TS/exe构建、九项有效反转通过；四格专用PTY覆盖面板和参数原生取消，取消缺省确认零写，已启动取消pending→error、不保存凭据、回调端口释放、peer连接及session原字节不变。正常exit按原owner终止state并只追加run-terminated；八格通用smoke及19入口通过。探针与负例失败分类及构建/源码绑定见log。
- 独立代码APPROVE、架构CLEAR，六文件hash均读回一致。这里只证明合成本机认证生命周期；真实授权、系统浏览器关闭、已派发服务端token撤销及完整PAN-07/其余47项仍未闭合。前批插件精确SHA已commit/push且CI/Watch成功，本批新SHA另取证。

## 2026-10-21 扩展注册有界获取与父路径竞态（PAN-07 部分）

- 状态/来源从整文件读取后检查字符数，改为复用原 `core/workspace/files.ts` 有界描述符读取；获取前分别限制8MiB/1MiB，解码后仍检查原2Mi/256Ki UTF-16限额，合法Unicode范围保留。来源明确拒绝叶/祖先链接、非普通文件和非法UTF-8；原state早已拒绝链接。缺失仍无写空集，不可读state为unavailable，来源不可读保留包并显示trust unknown，恢复重新读取。
- 独立架构复核实际复现共享reader在检查后把被替换父目录canonicalize为新根；现从原绝对路径的filesystem root检查，保持原词法路径直到描述符比对。同inode父目录链接替换仍拒绝；普通文件在首次权威观察前被替换不属于普遍竞态拒绝保证。初始BLOCK和修复后报告保留，未用旧四文件批准替代最终六文件复核。
- 受影响集合去重19文件222项通过（主集合108、直接consumer84、补充30；共享16项只计一次），strict production TS、双构建、10项有效反转、四格专用PTY、八格通用smoke及19入口通过。四格证实超大来源unknown/超大state unavailable/恢复、取消无写及原普通审批；精确构建、hash与命令证据见log。
- 独立代码APPROVE/架构WATCH，综合COMMENT；两份报告的六文件hash均读回匹配。每秒全量解码/hash/projection与累计成本、unknown仅实例内存仍WATCH，未据此关闭PAN-07或47项。原生认证已提交推送`4a7b656267b631c43a703c55d6046a93f3d5cbe8`，Watch success；11:59Z前最近读回的精确SHA CI仍in_progress，本批交付及新SHA另取证。

## 2026-10-21 MCP 添加向导原审批链（PAN-08 部分）

- 复核发现旧向导把整行命令放进executable、默认确认添加，且host在系统临时目录生成定义文件，随后被原source授权拒绝。现单独采集executable与有界JSON字符串argv，typed definition进入原MCP配置owner；普通文件命令保留source授权/身份与文本重查，scope/trust/普通审批/精确字节发布及unknown语义仍由原路径承担。
- 每步要求offered、有效单项及一次消费；review默认取消，提交前消耗，原session/root/substrate admission贯穿等待审批及writer，取消仍走原pending owner，迟到note不发布。review省略argv值和URL query，明确Connection: not tested；保存仅失效原连接，不自动执行或发现。独立架构实际render发现输入footer不可见，现将真实阶段放入输入标题并复验，不伪造认证/连接进度。
- 最终6文件178项、strict production TS、双构建、11项有效反转全部通过。Node/exe × regular/fullscreen四格专用PTY验证完整分步输入、默认取消原字节不变、原文件计划/普通审批、精确命令和argv、无临时定义/连接/模型消息；仅目标配置新增，metadata/全局config/工作区不变。Linux八格通用smoke与19项入口通过；失败测试及探针分类、构建hash见开发日志。
- 两路独立代码APPROVE/架构CLEAR，九文件hash与最终构建读回绑定。仅证明本机合成定义保存；真实MCP连接/认证、env/headers交互编辑、其他report消费者及全部47项继续复核，不恢复“只剩四项”。此前原生认证精确SHA的CI `39594034576` 已completed/success（12:01:51Z）；扩展读取已commit/push `d4b5c89343a984540136b001aecb5c681a1c48c3`，CI `39596352846`（12:13:18Z）和Watch `39596352847`均success。本批commit/push/新SHA CI分别取证。

## 2026-10-21 `/tools` 报告投影与原读取准入（PAN-08 部分）

- 新增回归先复现原详情title/description/schema文档及facts含敏感元数据、列表截短留下密钥前缀、异步目录后旧绑定仍返回report/note。现由原工具报告owner先规范terminal文本、再复用既有redactor、最后截短；原始工具ID、required判定、plan policy和完整description/schema字节计量保留，safe facts不作执行schema或权限证明。两种命令入口共用原context admission的读前/读后重验，picker和真实host拒绝旧结果。
- 补充回归复现ANSI先脱敏后移除会重新拼接密钥；修复规范化顺序后，独立架构又找到CRLF显示字面回车的兼容回归，现于本域规范CRLF，保留两行及原byte成本。generic report codec的facts LF转义合同不改；测试误期待literal LF的中间失败单独保留并纠正。最终主集5文件133项、直接consumer5文件13项、strict TS、双构建、10项有效反转通过。
- Node/exe × regular/fullscreen四格专用PTY验证本地MCP不可信metadata在列表/详情/直接命令及持久报告均安全；取消零写，显式查看仅新增2条command-output，无新model消息，state/metadata/config/工作区原字节不变，原catalog discovery仍发生但tools/call为0。八格通用smoke及19入口通过。独立代码APPROVE/架构WATCH，五文件hash绑定；全目录获取/排序/完整schema序列化无总资源/延迟界，不能称检查不启动进程或网络，也不闭合PAN-08及47项。
- 前批MCP添加已commit/push `d69fea2fba8733430624a8c202230b33fca7e567`，远端main同SHA，CI `39599867617`于12:44:21Z completed/success、Watch `39599867653` success。本批新SHA交付分别取证；其他help/skills/context/cost消费者继续复核。

## 2026-10-21 技能只读列表与精确选择（PAN-08 部分）

- 原列表直接展示敏感metadata、重新解析可把移除的大小写技能替换为另一个，特殊名称草稿无法由原parser读回；旧admission/失败与重复选择也未拒绝。现原skill command共用原catalog读取，列表为body-free CommandReport，单offered/一次消费/精确选择，metadata安全投影与原始正文明确分开；可原样安全展示的名称才插入精确quoted草稿。原loader保持不规范名称的诊断及保留语义、trust/noSkills/显式路径与contribution仍生效。
- 两条独立复核补出真实缺口：overlay的load取消未透传；file URL路径解码在plain之后引入C1，后续renderer移除时重组未脱敏密钥。现load合并原signal/overlay signal，accepted apply不复用已释放的load signal；共享report metadata原语在一次path投影两侧plain，最后原scrub/cap，tools同类路径一起修复。正文仍为原loader解析后的指令，只本地显示，不冒充安全报告。
- 本地10文件276项、strict生产TS、双构建、14项有效反转通过；四格Node/exe专用PTY验证安全列表/header/facts、特殊名称草稿、明确读取原正文，取消与选择不增持久消息，原参数列表仅新增1条body-free command-output，无model调用，state/metadata/config/workspace原字节不变。八格smoke与97脚本通过；19入口与严格docs门最终结果见log。
- 独立代码APPROVE/架构WATCH，两报告七文件hash已逐项绑定最终产物；accepted apply尚无独立取消owner、holdInput等待不可强制中断任意贡献Promise，合作式发现预算不证明总延迟/资源界。不闭合PAN-08或47项。前批tools精确SHA `f46e6c97c92497c35b6e4496f930a1124ae42f73` CI `39602459208` / job `119230129576`于13:01:35Z completed/success，Watch `39602459194` success。本批提交/推送/新SHA CI另取证。


## 2026-10-21 context/cost 安全只读报告（PAN-08 部分）

- context请求身份/警告、cost字段与facts仅在报告投影脱敏；原capture/ledger身份、分组、captured/current价格、body/parts/source维度和unknown合同保留。两命令读前原admission，context保留await后检查，均用真实cwd；cost组合标题用分别安全的身份和suffix构造，修复PTY发现的带provider前缀绝对路径漏投影。
- Parent最终10文件97项、strict生产TS/双构建、11项有效反转、四格专用PTY、八格smoke、19入口和97脚本通过。PTY保留三原captured组USD1/2/3及总USD6，只有两安全command-output，无模型消息或原state/config/metadata/workspace变更；累计用量不冒充当前prompt/foreground capture。中途legacy夹具错误、组合标题产品失败、trim分隔符失败与无效反转按日志分类保留。
- WATCH：脱敏key不是全局唯一账本身份，脱敏attribution不能回灌原ledger validator；原array保留组数/精确数值。全量catalog/bucket处理及MCP发现无总资源或延迟界，不闭合PAN-08/47项。前批技能`77700f4f`精确CI`39606383097`于13:28:27Z success、Watch`39606383042`success；本批独立最终绑定/交付及新SHA CI以日志实际读回为准。

- 最终独立代码APPROVE/架构WATCH，综合COMMENT；两报告八文件SHA与双构建已逐项读回绑定。组合标题为各组件分别受限，无单一4096合成界；旧报告绑定拒绝与新字节复验均保留。strict docs/diff通过，本批commit/push/精确CI尚须分别读回。


2026-10-21 help返工本地验收：安全共享CommandReport/rows、精确root/session、原admission与真正通知前检查、原draft-only/alias/named语义、选中后usage提示均已修复；最终12文件189项、13项有效反转、strict生产TS/双构建、四格合成扩展PTY与八格smoke、19入口/97脚本及静态门通过。代码APPROVE/架构WATCH，最终十一文件/两报告/双构建hash已读回绑定；直接help仍原shell-action/pager，不新增报告持久化。完整registry成本及原配置live读无总资源/accepted-publication保证，global completion metadata不据此闭合。accounting提交`972a9ff5`已推送、Watch success，精确CI`39609907792`本次仍in_progress；本批提交/新SHA CI另记。其余picker与全部47项继续原范围，原用户环境/真实模型推迟项不扩大。
