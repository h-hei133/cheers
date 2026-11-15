# Task inventory

状态：**待核实**＝仍需查消费者；**已有待验收**＝代码与调用链存在，尚未完成本轮验证；**缺口**＝确认缺少必要行为；**部分**＝存在实现但缺契约或消费者；**研究结论不成立**＝有具体反证，记录裁定后仍需相关不回归证据；**原定暂缓**＝保留原研究条件，不计完成。

任务编号对应原规划，只用于文档。每项验收必须覆盖所述行为，不能仅靠 helper 单测。已勾选才表示所述范围本地验收完成；不代表提交、推送、远端 CI 或全路线图完成。

## T1: 工程基础（P0，先实施）

- [x] **T1.1** TypeScript 依赖归属：已裁定并验收。四个生产 AST／转译／诊断消费者需要 runtime 编译器，研究的直接移除建议不成立；隔离安装通过 TS 扩展和 SDK/worker。实际 S，结构检查通过，额外依赖 0。
- [x] **T1.2** 测试工具与下限：本地验收完成。Vitest 3.2.7、Vite 6.4.6、Undici 6.29.1，单 fork worker／文件串行；contract runner 使用真实 JSON reporter。当前运行时 11 套件83项、Node20.3 5套件65项通过。实际 M，额外依赖 1（原 Undici7 下限违约），未宣称全依赖穷尽平台支持。
- [x] **T1.3** 静态检查与格式工具：本地验收完成。Biome 2.3.5 直接依赖、非修改式门禁与 CI 接入；初始规则集和不纳入的两条规则记录于 design，重复键反例通过，未批量格式化。实际 M，额外依赖 0。
- [x] **T1.4** 构建拆分：本地验收完成。同一次 esbuild0.28.2 共享图，保留当前输入摘要／不可变发布／回滚；CLI、SDK、主题、懒加载、动态块、TS 扩展与 worker 验收。生产构建 `b57986b62aa3`，Linux exe及 Node20.3 原生 prompt通过。实际 L，额外依赖 2（入口事务与声明资源）。
- [x] **T1.5** SDK 发布契约：本地验收完成。15 个入口通过单一 current.js 共用代际；manifest v3 绑定导出和类型，journal v2 恢复所有公开文件并兼容旧日志。隔离 npm包只含一代、严格消费者类型检查、默认／live binding／单例与篡改恢复通过。实际 L，额外依赖 2（安装类型依赖与 pack 历史排除）；导出形状转场可拒绝链接、静态聚合会提前求值的限制保留。

## A: 工具与请求边界（P0）

- [x] **A.1** 单一 edit Schema、宽容参数归一化与有界匹配：本地验收完成。原生edit的平面Schema、参数归一化与拒绝场景、raw字节保持通过；ambiguous计数原1,109,013次比较的反例经0.45长度剪枝降至50,000门槛内，26项匹配测试通过。不宣称真实模型质量或速度收益。
- [x] **A.2** 去重复准备期序列化：本地验收完成。保留深快照身份、异步准备变更检测及单次消费；实际prepare→普通批准→hook→authorize→execute与15项准备测试通过，无删除内容/参数变更保护。
- [x] **A.3** read 2,000 行／50 KiB 与统一行字节预算：本地验收完成。消息创建时统一行/UTF-8字节预算，成功/失败/事件/后续上下文保留同一内容及归档提示；前台在spawn前绑定有界capture，原PID后台移交和取消等待原生结算，完整文本分块发布。独立暂存树14套件119项及read消费者2套件27项通过；Linux编译产物8MiB输出完整摘要及原生artifact读取通过。实际L，额外依赖2（退出flush与失败清理owner）；不宣称任意观察者总内存或portable发布强度。
- [x] **A.4** patch 写前判定：本地验收完成。绑定普通批准的确切选择与revision，完整effects包含write/delete/rename；支持写入和unsupported删除缺口共存，unknown/block优先。9项真实patch反例及原生hook消费者通过，独立只读复审CLEAR；unsupported仍是证据缺口，不代表删除规则已实现。

## B / B2: 终端（P0／P1）

- [x] **B.1** 国旗、ZWJ、无 FE0F 等显示宽度：本地验收完成。无selector keycap与双窄成员眼睛气泡ZWJ的真实反例先红后修；仅改共享width owner，资格化计算影子由RGI约束、不改source和显式selector，保留原dingbat／宽成员fallback。六静态门、7套件306项、函数上限及build `12c748aff97c`通过，限定只读复核CLEAR；Linux当前编译CLI两模式PTY共10格通过，regular按grapheme移动、fullscreen点击第二cell和精确原文编辑验证。keycap／ZWJ两反转确实红、生产逐字节恢复后7/306再绿。实际M，额外依赖0；证据不等于物理字体或其他平台显示普遍兼容。
- [x] **B.2** 1 MiB 分块 writer 与背压：本地验收完成。UTF-8字节预算、跨fragment surrogate保持；regular/fullscreen逐行进入同一writer，原pending-byte与shutdown owner保留。独立暂存树4套件107项及build通过；Linux实际受阻管道4MB文本摘要一致、全部写块<=1MiB，PTY约5.7MB输出完成；关闭输出exit1、SIGTERM exit143均完成清理且不报告写完。实际M，额外依赖0；不宣称物理终端或整进程总内存上限。
- [x] **B.3** 图片头、cell size、缓存数量／传输／64 MiB 解码预算：本地验收完成。第一批终端准入复用严格inspectImage，完整PNG／WebP bitstream头和显式MIME身份、单图64MiB RGBA估算限制；Kitty非PNG明确文字fallback，iTerm保留实际read JPEG／image-jpg。初8反例及复审MIME控制注入两红例先红后修；六静态门、6套件124项、函数上限和build `320e22d14438`通过，限定独立复核CLEAR。Linux编译CLI两模式×Kitty／iTerm2实际完整PNG与native read JPEG传输／拒绝通过；两反转红、逐字节恢复。头准入不证明像素完整性。第二子批imageCellSize同时限48列／48行并窄宽fits，N行reservation与C=1／iTerm cursor保存恢复共用原wire owner；finalized图片cache和Pointer选择代际按冻结cell-size失效。初7红例、背景绘制2红与实际Pointer旧copy红修复；8/313、六门、0monoliths、build `f3c7f85fd552`通过，Linux当前编译CLI两模式×两协议late split回复10→20行重排通过，两反转红／逐字节恢复。第三子批viewport源像素裁剪、iTerm部分图文字fallback、完整extent浮层抑制和附着reanchor清理已通过8/243、六门、0monoliths、build `2443a54998eb`及Linux编译CLI fullscreen两协议小屏/PageUp/扩屏恢复，两反转红且逐字节恢复。第四子批fullscreen文本/清行先完成、图片最后绘制；覆盖行变化重画、d=a撤placement、d=I释放像素、同图首帧单upload多placement与失败按ID清退均已验收。完整PNG证明精确16离屏count、独立32MiB wire、64MiB decoded阈值；六门9/261、0monoliths、build `e240273b687f`与Linux编译CLI两协议双placement/reflow/exit通过，两反转红且逐字节恢复。regular图片预清完整reserved rows后绘制，独立occurrence ID和p=1避免重复source重传及叠加placement；完整visible隐藏按pair撤图、替换释放无历史upload，partial placement交给native LF，document替换先保存crossing残余。同步输出throw保留原cause并退休painter，后续paint/start/外部移交拒绝，stop仅恢复mode/cursor，不伪造物理回滚。六静态门、7套件248项、0monoliths和build `d3c1c005a1a5`通过；Linux编译CLI regular Kitty/iTerm完整extent预清、同源双图、typing不重传、保留history退出均exit0。两个反转红且逐字节恢复；限定独立复核CLEAR。 document浮层复用已有1049借屏，用原文档有界tail裁剪后composite，原native history/placement不改；进出screenRevision使旧选择失效，背景pointer/composer/choice坐标退休，浮层保留自身bounds。fullscreen清ID在真实terminal.stop恢复主屏之前，继续尝试全部cleanup并保留首错。六静态门、8套件244项、0monoliths、build `f78d9a11fe0d`通过；实际Screen证明partial主图层/cursor/scrollback关闭后精确恢复及同ID跨屏清退隔离，限定独立复核CLEAR。Linux当前编译CLI两协议通过临时input hook触发实际OverlayStack借屏／抑图／还屏且exit0，两反转红且逐字节恢复。 最终资格审计补完整WebP的实际user/tool准入、iTerm占行／传输、Kitty回退和损坏头／decoded超限拒绝，3套件56项及六门通过；原paint/lifecycle回执从对应原始命令日志恢复，源码hash核对通过，失败回执保留。原规划未要求native history reflow，物理像素／其他平台／真实provider无证据；总体19/62项本地完成。
- [x] **B2.1** OSC 9;4／7501／133／16t／tmux 超链接：Linux本地验收完成。捕获超链接能力贯通实际regular/fullscreen宿主、transcript/source与reader，缓存复制并区分能力；独立暂存树8套件601项、六静态门、build `6a9bc408aeed`通过，限定复审CLEAR。状态子批共享7501／keyboard尾随DA1，32个有deadline的startup/color owner拒绝满额新query；stop/drain/restore退休状态，迟到setter不写，重入write／cancel保留后继身份。六门、8套件210项、0monoliths、build `744017336148`和Linux编译CLI loaded两模式×支持/不支持四格通过；两反转红／逐字节恢复后5/93通过，限定复核CLEAR。startup子批已修复模块加载阻塞首次回复：等待首帧write及原DA1／250ms，断连清退不挂起，input/output拆分保留动态write。六门、9/231、0monoliths、build `220cdd055d01`和Linux当前编译CLI四格首次协商确认通过；两个反转红、逐字节恢复后3/77通过，限定复核CLEAR。颜色fixture在HEAD同样缺keyboard哨兵，仅修fixture不改生产协议。实际M／额外依赖1；用户提示导航已接通原renderBlock→pane→keymap→host，Ctrl+Up/Down和原binding重绑可用；真实前导notice／释放报告两缺陷已修复。六门、9套件280项、恢复后3/131、0monoliths及build `3154882609b3`通过；Linux当前编译CLI regular/fullscreen和65条保留提示三格通过，原始draft／用户回复copy source保持、内部133不外发、exit0，限定只读复核CLEAR。两有效反转红并exact恢复；错误反转未退回原合同、两次错误Editor API、原生frameProvider封装与分页notice预期错误保留分类。助手消息边界亦已完成：message.finished传递实际hasToolCalls，live未知partial保持undefined，history从实际tool_calls恢复；确认结束且无调用的非空assistant加内部marker，pane再核对owner资格。六门9/233、恢复3/81、0monoliths、build `fbb35f5b6199`、Linux编译CLI regular/fullscreen/65旧页三格及三个有效反转通过，限定只读复核CLEAR。确认结束包括失败消息，不宣称业务成功。最终当前构建联合六门、15套件430项通过；`fbb35f5b6199`状态／cell-size各四格、导航三格及真实tmux两种client×两宿主均passed，receipt/source/build身份核验，限定独立审计CLEAR。tmux未配置hyperlinks时实际OSC8不输出，支持时regular/fullscreen真实输出，全部exit0；16t真实query和split回复走原parser，10/11/4仍为B2.2的完整palette消费者。实际S，新增生产依赖0；不宣称物理终端、其他平台、真实provider、deadline后无tag归属或远端CI。整体20/62项。
- [x] **B2.2** OSC 10／11／4 查询与完整调色板应用：本地验收完成。实际regular/fullscreen启动及adoption接入100ms查询、16色稀疏合并和晚到更新；显式主题、预览、DEC997与后继宿主优先级保持。同一StdinBuffer保护粘贴，键盘DA1 fence保留到250ms自身截止。独立暂存树11套件166项、五静态门、build `64e760e74bd1`通过；Linux实际PTY绑定及fallback两路径16色/拆分DA1/晚到更新/原始粘贴通过，独立复审限定CLEAR。实际L，额外依赖2（共享framing与query fence）；不宣称物理终端普遍兼容。
- [x] **B2.3** 可组合浮层与非捕获交互：本地验收完成。实际宿主选择／确认／单行／多行输入、叠层焦点和鼠标、短屏选择／光标、退出／撤权与composer恢复；widget/status复用chrome并限制总量。扩展对话录制遗漏两模式先红后修，真实cast排除输入、关闭后普通输出保留。独立暂存树6套件497项、六静态门、build `22b63f350222`及Linux编译CLI两种PTY选择／编辑取消／exit0通过，限定复审CLEAR。实际L，额外依赖1（recording消费者）；没有物理终端或其他平台证据。

## C: 循环、消息与缓存（P1，并包含深度审计 P0）

- [x] **C.1** prepareNextTurn／prepareRequest／finishTurn 与虚拟路由：Linux本地验收完成。既有准备／结束／队列边界保留；当前逻辑选择独立保存，缺失注册拒绝fallback，实际physical target完整绑定auth／endpoint／transport／scope／budget／replay。原branch store按model-routing namespace同键CAS，含absent／unchanged结果，先接受再压缩；candidate／refresh复用同route。outer／effort重试使用最新实际failed目标，transport retry不重复路由；direct摘要不读写state，显式summary role优先，virtual选择不建cache warmer。CLI／SDK／命令／picker／completion／RPC／fork及VM callback数据边界接通。当前六门、39/840、十有效反转exact恢复、恢复5/79、补4/34与publication1/12、0monoliths、build `083b3d78d8bf`通过；同代2224文件安装strict类型，Linux公开SDK10／CLI2／自动摘要12／重试续轮8／限定RPC1个loopback POST及配置模型4个真实POST通过。配置模型用了隔离最小有效目录，原损坏目录未验收；D.1旧messages读取缺口单列。限定独立代码复审8个核心owner为APPROVE，架构CLEAR；证据`.omx/artifacts/upgrade-virtual-routing-2026-11-15/delivery.json`。
- [ ] **C.2** message_update 流式部分消息及 x-should-retry：已有待验收，部分响应不重放、内外重试一致。
- [x] **C.3** AgentMessage 与 provider Message 分离及 convertToLlm：本地验收完成。独立基础类型、custom持久化／显示、前台SDK、摘要和普通请求完整capture均已提交；同一raw路由／转换／system／工具／图片／budget／最终body经过统一准备owner，自动／手动／prefix／merge／branch／overflow／rewind／重开保持一致，取消后可复用。当前`e4d27485`联合30套件502项、六静态门通过，限定只读复核CLEAR；Linux编译build `c7857153d401`两组配置模型各7次actual bodySent通过，隐藏raw未送出，取消零派发及声明ID／顺序保持。账户刷新fixture因移除override后默认4096超过main旧100 ceiling而早拒绝，定向复现零renewal／零dispatch；仅修正fixture前台预算，原拒绝／一次刷新／两次新凭据／持久化和历史断言均通过。详细范围与首次失败见design及`context-joint-final.log`；不表示C.6原生协议、缓存收益、其他平台或远端CI完成。
- [ ] **C.4** 默认历史工具文本保留与一致测量：已有待验收，真实多轮请求前缀与压缩预算。
- [ ] **C.5** Anthropic 历史缓存标记、OpenAI／Responses affinity 与 TTL：已有待验收，真实最终 wire 和能力限制。
- [ ] **C.6** 动态工具／思考档位在原始消息位置声明：部分。数据／持久化`078d28f`为版本化完整tools／target／mapped effort、strict inert JSON及append-first，5套件93项和build `cd08cabeb2bf`通过。协议／转换边界实现相邻完整schema变化／删除／恢复、同target epoch固定baseline、A→B→A隔离；marker身份／顺序必须经converter保留，不按raw索引回插，实际协议延到下一非空assistant，工具结果不拆。closing撤权仅当前请求；空baseline不造placeholder；auto使用provider default或当前numeric fallback，不宣称auto转场前缀稳定。复核补capture前undefined、preparation复用及empty assistant真实链路，两红例修复；六静态门、13套件337项、build `2a1feaebbaa4`和函数上限通过，限定独立复核CLEAR。发送前发布已接通committed/prospective分离、raw路由后完整runtime schema／mapped effort捕获、变化重转、原dispatch同步persist→live→取消／current检查→attempt handoff。HTTP retry不重复写，effort fallback保留新实际声明；closing不写临时removal，goal summary排除未发布marker，promotion交付bare capture供recovery。六静态门、18套件346项、build `c29d540a73fa`和函数上限通过，提交`f43648cd`。压缩保留已实施：原声明ID／顺序、kept尾部位置、分支隔离和live/reopen一致；一次声明登记／区间移动避免重复复制，分段取消保持局部一致。13套件231项、六静态门、函数上限及build `c7857153d401`通过；四项反转红、逐字节恢复后3套件32项通过，限定只读复审CLEAR。Linux当前编译SDK跨轮工具Schema／档位变化、closing撤权、自动／手动压缩、rewind／重开及取消后复用两组各7次真实请求通过。当前配置目标`nativeHistoryProtocol=false`；Anthropic原生历史control仍只有本地协议证据，继续部分，不宣称原生服务或缓存收益完成。
- [ ] **C.7** 逐轮缓存未命中与成本归因：已有待验收，真实 usage 缺失保持未知，不能据假定缓存率宣称节省。
- [ ] **C.8** 六个核心工具、动态 prompt、BM25／词干／Schema 索引和单步激活：已有待验收，生产 search→execute 与失效代际。
- [ ] **C.9** stdout 保护：部分。JSON／RPC 已接入，普通 print 尚缺；外部日志不污染结果与有界重试队列。

## D: RPC 与导出（P1）

- [ ] **D.1** 会话／模型／树命令：部分。旧startup session.turns造成messages／count／stats／last-text过期已修：共用host/read读取当前stored session、复验selection／active binding／id／createdAt／root，缺失明确拒绝，不回写runtime binding；get_state的physical provider/model现来自同一resolved target。十一读反例与CLI resolver单红先复现，当前六门4/33、恢复1/21、三有效反转exact恢复、2635模块0monoliths、build `545e59e9f16a`和限定双lane复核通过。Linux同代CLI两进程logical／physical各一POST后消息／计数／统计／last-text、新会话／切回、删除后四读取拒绝及EOF exit0通过。后续fork子批已修仅返回可用user候选、accepted switch后返原文draft、原source version绑定及每个await后selection准入；五初红＋两复审微任务红后修，六门6/65、五有效反转exact恢复、build `8f67e032b1c9`与限定代码APPROVE／架构CLEAR通过。Linux实际JSONL矩阵已验rename／entries exclusive cursor／invalid cursor／tree current-invalid-stale／clone／fork／navigate往返保留history／switch／四busy拒绝／abort及missing读取，三loopback POST、EOF exit0。shell子批现接通bash／abort_bash生产host：原gate／command settlement、组合输出／结构化truncation和artifact、included custom／excluded report、原branch执行前准入与保存、独立native／hook／history结果语义。六门13/227、最终局部3/59／恢复5/68、五有效反转exact恢复、2641模块0monoliths、build `90499a5f654c`和限定代码APPROVE／架构CLEAR通过。Linux实际JSONL两loopback POST验普通／summary排除、196637字节归档精确比对、重开／fork／busy／cancel／EOF；配置模型一次actual bodySent返included标记、excluded仍可导出。原配置目录损坏仍使用隔离最小有效entry，未改用户凭据。settings／thinking／commands子批现按端点能力／输出预算和虚拟定义发现effort，保存后发布完整配置；返回自动设置的stored／requested／effective及来源，命令发现包括扩展／别名／named invocation和获准skill，snapshot复验贯通响应发布，读取可取消并在EOF结算。联合11/200、最终发现3/29、七有效反转exact恢复、六门、2646模块0monoliths、build `119bed2092d3`及限定APPROVE/CLEAR通过。Linux同代两loopback POST验真实effort／skill body、同会话重开和显式config覆盖；配置模型一次actual bodySent返回标记。abort_retry仍误用generic取消，compact仍阻塞后续JSONL控制且丢非compacted结构化结果，下一限定修复；整项继续部分，不勾选；设置证据`.omx/artifacts/upgrade-rpc-settings-2026-11-15/delivery.json`，shell证据`.omx/artifacts/upgrade-rpc-shell-2026-11-15/delivery.json`。历史失败见virtual-routing的rpc-classification与本批native-classification；证据`.omx/artifacts/upgrade-rpc-read-2026-11-15/delivery.json`。
- [x] **D.2** 队列清空和 steering／follow-up 模式实时更改：本地验收完成。清空实际两条活跃输入与submission，模式跨readiness传递并保存后更新捕获队列；配置或运行替换拒绝修改后继。真实runTurn和JSONL消费者通过，宿主按input/session/settings拆分且函数上限通过。
- [x] **D.3** UI 请求／响应和事件：本地验收完成。加载扩展通过真实JSONL的选择／确认／输入／编辑、取消、EOF前撤权和迟到响应隔离；配置／会话转换新增四项红例后修复，在成功且lease改变时先刷新owner再绑定，后继consumer与EOF不能复活。独立暂存树6套件47项、六静态门、build `16aec298a055`及Linux编译CLI三次选择／改配置／新会话／未答编辑EOF退出通过，限定复审CLEAR。实际M，额外依赖1（转换后的surface lease），结构复用原host；无真实服务或跨平台声明。
- [ ] **D.4** HTML 高亮、GFM／CJK、Thinking、Diff、灯箱：已有待验收，真实离线导出与转义安全。
- [x] **D.5** 导出 token／费用：本地验收完成。只读捕获并验证真实session state/账单身份，累计用量与请求覆盖率分开；不从message metadata或prompt measurement推造用量，不用当前目录价格回填旧记录。四套件66项和离线Linux Chromium实际HTML通过，未知output/price保持unavailable。实际M，额外依赖1（历史workspace消失后仍须读取保存state）；真实供应商账单比对未发生。

## E / T2 / T3: 编程与扩展（P1／P2）

- [ ] **E.1** 沙箱组合、嵌套权限／hook／过滤结果：已有待验收，真实一轮多工具、不污染中间历史。
- [x] **E.2** codemode 分支持久化：本地验收完成。删除失败后全局Map退路，真实会话捕获scope/原始前缀/分支，锁内重读与写键CAS/当前预算，同FD校验、fsync和回读后报告persisted；疑似已落盘失败为unknown。损坏持久分支先拒绝再catch-up，多级fork根映射。C.1前置批将存储提升为session owner，codemode保留wire/worker ABI；版本与tombstone补ABA，空结果复验，独立内部namespace不向worker泄漏。六门8/247、build `7bcb4574ea2a`和Linux三独立进程重开/分叉/真实worker隔离通过，五断言反转exact恢复，限定复核CLEAR。E.4确定性重放仍未实现。
- [ ] **E.3** TS 声明／namespace／image／models API：已有待验收，真实脚本调用与输出预算。
- [ ] **E.4** 确定性重放：待核实。已有 worker 不等于声明中的可恢复确定性执行；先明确记录和副作用边界再实现。
- [ ] **E.5** TS 文件／异步工厂及共享宿主：部分验收。异步原子发布、旧代际撤权、SDK/shared host和在途reload确认取消通过独立暂存树8/46及turn4/114、五静态门/build；安装产物最终验收、SDK配置发布后的UI重绑定WATCH仍待核实。
- [ ] **E.6** 扩展完整生命周期事件：部分，逐事件找 dispatch 和结果消费者；声明未消费者不得算完成。
- [ ] **E.7** registerProvider／virtual model／MCP／renderer 与运行时 setters：部分。注册`356b996b`后，当前CLI／SDK生产逻辑选择与router已接通，callback-free目录、nested effort、独立分支状态、重开／fork、取消／reload后继保留和direct摘要经公开入口验证。VM callback收到有界复制冻结JSON与realm-local signal／UI／error，保留原调用lifetime；不宣称通用VM安全沙箱。当前六门39/840、十反转、build `083b3d78d8bf`与2224文件安装strict类型通过，Linux公开SDK／CLI／配置模型证据见C.1。worker virtual注册明确不支持，provider／MCP／renderer和其余setters仍缺；限定独立代码复审APPROVE、架构CLEAR；E.7其余范围继续开项。
- [ ] **E.8** shortcuts／flags：部分。目前收集但 CLI／SDK 未消费；冲突、默认值、实际参数与按键生命周期。
- [ ] **E.9** 包安装来源和 CLI 入口：部分。已有签名 marketplace 安装，npm／git／local adapter 和顶层安装入口尚缺；保留显式批准、完整性、精确版本与写入边界。
- [ ] **T2.1** CLI 参数集合、单遍解析与早期启动判断：部分，主循环已存在；测试完整启动矩阵并处理早期多遍语义。
- [x] **T3.1** createAgentSession／DefaultResourceLoader：本地验收完成。loader／dispose子批`c8d14775`保留原代际claim、失败绑定回退、消费代际撤权和并发dispose同等待／首错。compact复用原command settlement，prompt／command／compaction互斥；取消回调失败仍取消并等待原操作，回调创建的后继不受影响，dispose开始即拒绝compact。goal scheduler以完整isRunning等待prompt结算。六静态门、16套件236项、0monoliths和build `d9acacbc4260`通过，限定独立复核CLEAR；四项实际断言反转红且逐字节恢复。当前同代隔离npm安装2203入口文件／15公开子路径导入和严格类型（skipLibCheck=false）通过；Linux Node24.15配置模型四次actual请求覆盖prompt／compact／复用／同ID重开，取消零派发和零compact commit、迟到失败处理、inline／TS扩展撤权及后继资源保留均通过。实际L，额外依赖2；仅本地Linux证据，无push／CI或全平台声明。证据在`.omx/artifacts/upgrade-sdk-2026-11-15/compaction-delivery.json`。

## F1 / F2: 协议、目录和遥测（P2）

- [ ] **F1.1** 增量工具 JSON 与实际预览消费者：部分。严格最终原始字节已保留，预览支线因无消费者被删；实现预览需真实 UI／事件，不能重新添加孤立 parser。
- [ ] **F1.2** Azure／Mistral／Responses WebSocket：已有待验收；已有本地协议证据，真实配置模型、连接复用／取消／代理／TLS 需当前证据。
- [ ] **F1.3** 请求 zstd：缺口。helper 无调用者；明确 endpoint 支持，在最终 body 准入和签名之后由传输 owner 压缩，拒绝重放未知派发。
- [ ] **F1.4** OAuth 提供方及设备登录／更新：部分。原生 OpenAI／Google／Copilot 与设备兑换存在，其他提供方不能仅加按钮；复用凭据 proof 与更新 owner，真实同意缺失单列。
- [ ] **F1.5** MCP PKCE／loopback／renewal 和懒加载：已有待验收。CLI 鉴权已向 gateway 注入 provider，旧“仅 Bearer”判断不成立；实际 OAuth fixture／撤权与 tools readiness。
- [ ] **F2.1** 图片／分类器模型类别和媒体能力：部分，逐端点确认消费者、预算与真实 Linux 输入；不把目录字段当功能。
- [ ] **F2.2** 远程目录 ETag 增量更新：已有待验收，缓存身份、304、无效内容、配置变更。
- [ ] **F2.3** 无 eval Schema 校验：缺口。当前 AJV 运行时 compile；替换原校验 owner，覆盖 dialect／ref／format、无 coercion、unknown 拒绝及安全错误。
- [ ] **F2.4** 阶梯计价：缺口。当前只有平费率；按单次请求含缓存输入的严格阈值选择完整费率并持久化，不用会话累计重新选档。
- [ ] **F2.5** Span／Event／Link／检索／作用域：部分验收。真实runTurn/session/request/tool及普通日志接通，11个新增反例先红后修，独立暂存树9套件70项、五静态门、build `2c8cce9867b8`通过。独立Linux进程验证异步observer/span拒绝不崩溃、custom recorder捕获sink；缺ID持久读保留并标missing。dashboard的profile/session检索来源一致性仍待核实，未勾选；F2.6另列。
- [ ] **F2.6** 有界直方图及跨进程传播：缺口。进程全局 metrics 与无产品 extract 消费者需接入真实运行边界，保留调用身份和失败隔离。

## T4: 领域包与配置脚本收敛（P2，功能批次稳定后独立实施）

- [ ] **T4.1** 共享契约和组合方向：缺口。先消除 core↔browser／workflow、session/provider↔planning 的包级反向依赖。
- [ ] **T4.2** browser、desktop、media 包边界：缺口。可选域不可用时核心仍启动，既有 API／权限／执行器不分裂。
- [ ] **T4.3** workflow、research、planning、collaboration、advisor 包边界：缺口。真正独立编译／依赖与公开接口，禁止跨包源码相对引用。
- [ ] **T4.4** config／scripts 收敛：待核实。按实际职责合并重复实现，保留配置来源、信任／profile 和可复现门禁；不依据文件数机械删除。

## T5: 会话与恢复（P3，高风险独立批次）

- [ ] **T5.1** 统一追加事务日志与提交／未知契约：缺口。已有分支树、加锁 CAS 和任务日志；仍存在 transcript／metadata／state 分步写入。
- [ ] **T5.2** 旧格式迁移与单一读写权威：缺口。保留原文件、版本／身份绑定、失败恢复和显式可回退性，不能双写两套权威。
- [ ] **T5.3** ContextEdit／Label 追加事件与 UI／RPC：缺口。已有 context selection 不能替代编辑／书签历史；签名推理保护和分叉可见性。
- [ ] **T5.4** DAG 重启安全续调度：部分。已有日志和派发栅栏，必须只恢复有明确续点或未派发的节点，未知副作用不重放。

## T6: 协作与远程（P3，原计划按需项，保留核实）

- [ ] **T6.1** 增量 reducer／持久 outbox／快照重置：缺口。复用现有 cursor／epoch／gap 与撤权；丢失确认、重复消息、背压验证。
- [ ] **T6.2** 协作流式传输：缺口。替换普通轮询，断线续接不绕过权限或覆盖后继 owner。
- [ ] **T6.3** 常驻远程多路连接与文件能力：缺口。复用唯一 ExecutionService 和既有远端 durable jobs；连接绑定句柄、请求取消／deadline、EOF 与未知派发不重放。

## 原定暂缓，不计完成

- **P3-NATIVE** 多平台原生键盘／剪贴板插件：原文待产品定位；现有外部原生工具策略与 TypeScript 边界优先，仅有必要性证据后实施。
- **P3-DESKTOP** 独立 Web／桌面产品矩阵：原文暂缓；不把 Linux 桌面自动化工具称作桌面产品。

## Validation ledger

2026-11-15 D.1 settings／thinking／commands：shell已提交`c10c5291`。初8断言红包含后来反证的project优先级推断；publication、callback binding、endpoint budget及发现／撤权／最终响应反例分别红后修。联合11套件200项在最后skill predicate修复前通过，最终发现3/29、设置反转恢复3/62通过；七个有效AssertionError反转均逐字节恢复。六门、2646模块0monoliths、build `119bed2092d3`通过，旧`770a85964afc`／`6acc9fe09805`仅历史。Linux当前CLI两loopback POST与配置模型一次bodySent全部passed，后者body不可检查，不宣称真实wire effort；原连接／凭据未改。独立代码APPROVE／架构CLEAR，停滞实现lane未计review。归档upgrade-rpc-settings-2026-11-15；D.1仍部分，22/62保持，继续retry与compact。

2026-11-15 D.1 shell子批：fork已提交`b1d46c3`。最初10缺宿主反例、两invoke失败及output反例保留；审查三实际反例（pre-hook换branch仍执行、navigate_tree遗漏busy、started部分写入）与8个limit反例／1个catch-up反例修复。当前六门、联合13/227、最终3/59和恢复5/68、五有效反转exact恢复、0monoliths、build `90499a5f654c`及限定复核APPROVE/CLEAR。Linux编译CLI最终两loopback POST全矩阵passed，真实配置模型1次请求passed；所有setup／observer失败保留分类。旧event/message writer未整体有界、无跨进程原子追加承诺；D.1部分／22/62保持，不push。

2026-11-15 D.1 fork／命令矩阵子批：当前六门6/65、五反转exact恢复、2635模块0monoliths、build `8f67e032b1c9`和Linux编译CLI三loopback POST矩阵passed。原native发现root／assistant错误候选和fork漏draft，五反例红；双lane指出helper resolve后的微任务窗口，两精确反例红后传原assertCurrent到consumer。最终限定代码APPROVE／架构CLEAR，bash／abort_bash宿主缺口仍在，D.1部分／22/62保持。read子批已提交`5ded288`；本批证据`.omx/artifacts/upgrade-rpc-commands-2026-11-15/delivery.json`，未push。

2026-11-15 D.1当前会话读取子批：十一实际读反例先红；初native logical通过，但physical发现get_state错误provider/model配对，真实CLI resolver反例再红后修。最终六门4/33、三反转exact恢复、恢复1/21、0monoliths及build `545e59e9f16a`通过；Linux两进程各一loopback POST，当前read／switch／missing拒绝／EOF全部passed，限定代码APPROVE／架构CLEAR。旧build `d3ab676d5081`失败原回执保留；D.1转部分，22/62保持，继续完整tree／session／error消费者验收。C.1已提交`d8189ac`，未push。

2026-11-15 C.1逻辑选择／生产路由：当前build `083b3d78d8bf`绑定39/840、六门、0monoliths、十有效反转和同代Linux原生矩阵，限定独立代码复审8个核心owner为APPROVE、架构CLEAR；C.1本地完成，22/62。首次missing lint script、UI reversal TypeError、abort fixture死锁、test-input旧build拒绝、retry fixture配置和错误RPC transcript假设均保留分类。原用户catalog JSON损坏，配置连接／凭据未改，隔离最小model entry后4次真实POST通过；另两次connection refusal零POST、一个auth failure一POST仍是失败。限定RPC逻辑选择通过但普通physical对照复现get_messages旧快照，D.1由已有待验收转确认缺口。完整回执与source hashes见`.omx/artifacts/upgrade-virtual-routing-2026-11-15/delivery.json`；未push／CI。

2026-11-15 C.1/E.7会话虚拟注册前置：inline／async file扩展registerVirtualModel经原contribution发布，SDK目录分离physical/virtual并剥离callback；不向配置合成runtime/auth。元数据与返回state捕获、collision/cap、原signal／options身份及generation撤权已补。原9红、复核6红、observer1红；最终六门18套件178项、0monoliths、build `047e196c6597`和六断言反转exact恢复通过，独立复核CLEAR。同代2214文件／2524053bytes npm安装及strict skipLibCheck=false类型通过；Linux安装SDK inline/file目录、VM state、reload pending拒绝、旧dispose保留后继以及CLI异步注册／重复exit1通过，provider调用0。最初测试占位host和取消cause预期错误、首build两处隐式any、旧consumer测试路径未匹配（随后改真实context/codec纳入18套件）、npm pack返回object而非array、原生slash被识别为project路径均分类保留。证据`.omx/artifacts/upgrade-virtual-registration-2026-11-15/delivery.json`。C.1仍缺逻辑选择、caller-owned branch CAS、retry/direct/previous/failed、摘要direct和缓存归属；输入VM隔离仍需在生产派发前审视，E.7部分，合计21/62不变。

2026-11-15 C.1分支store前置：原codemode owner提升至session/branch/store，保留旧discriminator/JSON字符串ABI；内部事件明确namespace和source anchor，旧worker只读codemode。原before-await lease、锁、prefix/inode/fsync/readback复用，per-key revision/tombstone拒绝ABA，read-key和empty复验，内部16,384键／1Mi键字符上限。基线8真实断言红后实现；复核再现准入吞掉同handle重入失败却继续append，2红后加事务重入退休与逐callback后检查。最终六门8/247、0monoliths、build `7bcb4574ea2a`、五断言反转exact恢复，限定复审CLEAR；Linux三fresh process seed/reopen/fork、实际codemode worker隔离、ABA/空lease拒绝passed。初命令workspace Vitest不存在为setup失败，首联合包含不存在writer路径实际仅7套件，最终改真实create消费者八套件。实际L／复用10/10／额外依赖2，证据`.omx/artifacts/upgrade-branch-store-2026-11-15/delivery.json`。router consumer尚未接入，C.1/E.7和21/62保持；不同锁的read-check/commit不是原子publication。

2026-11-15 C.1摘要目标子批：自动／overflow摘要继承prepared physical endpoint、headers、credential/replay、fetch/transport、shape与预算，显式角色仍优先；原compaction progress和connection lifetime不重建。消费者准入达到renewal/dispatch，同时保留已派发rotation的条件持久化；shared pending只缓存host-owned成功，逐消费者拒绝不污染后继。六门、15/246、0monoliths、build `9e91decd500a`与五真实断言反转通过，exact恢复，限定复核CLEAR。Linux同代内部compiled三场景实际两loopback全通过，每格route一次；公开SDK配置模型prompt／compact共两次actual bodySent。两次原生夹具threshold先行导致overflow未覆盖，失败receipt/source保留，最终扩大该场景physical窗口并断言首POST拒绝。实际L、复用10/10、额外依赖2；证据`.omx/artifacts/upgrade-summary-target-2026-11-15/delivery.json`。manual/branch direct、生产注册及持久路由状态另批，C.1/E.7和21/62不变。

2026-11-15 C.1物理目标捕获子批：原target/resolver/transport/replay与CLI authority反例已修复，跨provider只能解析完整物理绑定；实际目标不存在、非chat、scope拒绝或route/converter撤销凭据均不能派发。candidate压缩、声明refresh和closing reframe沿用同一路由；最终六门、15套件297项、0monoliths、build `3ff7e7c3ad7b`通过，限定只读复核CLEAR。六反转实际AssertionError红、生产文件逐字节恢复；首个candidate普通拒绝日志另留，不当有效断言反证。Linux当前compiled内部invocation实际两loopback覆盖URL／auth／origin及拒绝零POST，公开SDK用配置模型一次bodySent通过；该内部注入不表示公共virtual注册已有。证据见`.omx/artifacts/upgrade-routing-2026-11-15/delivery.json`。实际L、复用检查10/10、额外依赖2（reasoning replay归属、router前authority捕获）；当时summary fallback实际目标仍缺，现由上述子批补齐；session/branch状态、retry/direct与生产注册仍开，21/62不变。

2026-11-15 暂停收尾：T3.1 loader／dispose子批`c8d14775`完成，证据在`.omx/artifacts/upgrade-sdk-2026-11-15/lifecycle-closing-delivery.json`。实际六门、6套件34项、函数上限0超限、build `1787d90736d1`及Linux当前编译SDK inline／TS文件消费撤权与后继保留通过；使用synthetic provider，没有新增真实服务调用。`lifecycle-closing-reversals.json`两项实际AssertionError失败且逐字节恢复，最终只读复核限定CLEAR。补齐半绑定排序和异步cleanup拒绝两WATCH；早期重复匹配的mutation脚本拒绝、一次相对config/root启动失败和未写resolves断言的反转诊断不计有效验证。用户要求完成在手子批后暂停，未开始compact或虚拟路由后续修改；整体20完成／42未完成，详见[暂停总结](summary.md)。

2026-11-14 初次核实：真实 Node import 中14个非根入口全部 ERR_MODULE_NOT_FOUND，作为 T1 的修复前反例。

2026-11-14 T1：六静态门通过（docs保留119条既有advisory）、完整scripts210/210；测试批次重叠不累加为唯一总数。Node24定向11/83、Node20.3定向5/65通过。隔离安装2,166项、2,465,935字节压缩包，只含一代；本地安装的TypeScript严格解析全部15入口，不依赖仓库ambient types；主题4项、TS扩展、SDK prompt、codemode worker通过。Linux Node20.3和单文件exe原生prompt通过，exe有host version回执。独立T1只读复审CLEAR，限制见design；记录 `.omx/artifacts/upgrade-toolchain-2026-11-14/`。首次npm12 JSON形状和缺失临时HOME属夹具失败，均修复重验。无真实服务/Windows/commit/push/CI；总目标仍active。

2026-11-14 T1提交前：单独导出暂存树，在独立依赖路径以六静态门、生产build `fa4c37d23706`及55项相关脚本验证该提交不依赖其余未暂存修复。新lint同时要求删除已有测试中的不可达yield，随该批提交。初次夹具仅复制根node_modules、遗漏workspace-local Undici，修正夹具后build通过。以上新增证据仅覆盖首批暂存内容，无推送或CI声明。

2026-11-14 A提交前：独立暂存树9套件255项通过（edit32、matching26、patch9、translation45/native25、preparation15、batch45、turn54/approval4），五静态门和生产build `b217b2736927`通过。此前patch9项中6失败/3通过，修复后全通过，独立review CLEAR。匹配反例修复前1,109,013次比较失败。T1本地提交为`a8ffe683`；A证据不等于A.3输出或整条路线图已完成。一次独立命令误用workspace-local Vitest路径，修正root依赖入口后重验，不是产品失败。

2026-11-14 E.2提交前：最初11红/3通过，修复后75项通过；独立复审补充“坏leaf被新消息补齐掩盖”“同inode删旧前缀”两反例均红，修复后实际工作区与独立暂存树5套件80项通过。五静态门、生产build `d3279f86c0e7`、编译产物两次独立Linux进程验证持久写/重启读/两代fork独立值通过。独立复核CLEAR，只承诺现有锁和身份/前缀重验，不承诺任意不守锁外部改写原子性、所有未await嵌套调用结算或E.4重放。A本地提交`e58d8786`。

2026-11-14 D.2提交前：12红/5通过反例后，独立暂存树6套件117项、五静态门、生产build `0d399d72cbe2`通过，含真实runTurn、JSONL及95项SessionManager。修正拒绝callback前已激活、新会话parentSession丢失、同项目projectChanged误作接受；新候选以activate:false创建，接受后再选择。宿主拆分后命名函数数runtimeHost3/runtimeOps20/input10/session13/settings11，独立复核CLEAR。E.2本地提交`43edd014`；D.1其他RPC验收与bash入口仍未完成。

2026-11-14 A.3提交前：独立暂存树14套件119项、read端到端消费者2套件27项、五静态门、生产build `961a0cc7dfe6`通过。原生bash输出8,388,608字节，工具返回51,356字节（含notice；模型消息另受50KiB统一界限）；保存文件大小与逐块SHA256一致，read原生artifact页成功。首次夹具错误要求未声明的outputComplete=true、随后错误要求单行8MiB能被read完整返回，均按契约修正为普通多行及有界摘要验证；未修改读取限制。已清除独立导出目录中被索引删除的旧测试。独立输出复审CLEAR沿用前轮报告，不冒充新增审查。D.2本地提交`9c683208`；无push/CI或完整路线图完成声明。

2026-11-14 流式参数修复提交前：A.3提交`28ffb9e7`。删除没有预览消费者的修补解析器，SSE原始参数片段保持原字节并只在最终完整对象准入；多个工具中任意参数损坏则全部拒绝执行。独立暂存树五静态门、completion/step两套件172项及build `cc6f429b3e71`通过；确认被删除源码未残留于导出树。F1.1真实增量预览仍未实现，不勾选。首次从workspace子目录调用根门禁脚本失败，改根目录执行后通过，属命令位置错误。

2026-11-14 端点路由修复提交前：流式参数提交`24a23997`。内建Mistral目录选择专用chat端点，兼容旧配置名；清除非协议字段并规范call ID/affinity。Azure由端点统一解析完整base URL、资源和api-version，保留relay前缀和query。独立暂存树五静态门、2套件26项、build `3a0b1baf2323`通过。F1.2完整WebSocket及真实服务验收仍开项；没有把fixture应答称为真实提供方证据。

2026-11-14 B.2提交前：端点路由提交`a410eab2`。writer原3项红及fullscreen追加反例均已修复；独立暂存树五静态门、4套件107项、build `85c4ef80b41d`通过。实际Node进程加载暂存源码：OS管道先积压4,000,000字节后延迟150ms读取，全文SHA256一致；regular画面累计5,695,129字节，最大write1,048,576字节，回调时pending0。Linux PTY5,697,415字节完成；实际断管与SIGTERM通过原CLI shutdown分别exit1/143，closed=true、completed=false。记录`.omx/artifacts/upgrade-writer-2026-11-14/`；原生探针使用暂存源码tsx，不冒称公开编译导出。

2026-11-14 D.5提交前：B.2提交`6e1e3eb4`。独立暂存树五静态门、4套件66项、build `9ad07e84b0db`通过。Linux真实存储owner写入130tokens与1项部分未知派发，gatherExport只读state，编译公开HTML入口生成文件；离线Chromium显示100in/30out、记录估价、12in/unknown out，0网络请求/0页面错误。D.4完整Markdown功能未借此勾选。B2新增11项边界中10红/1通过，正修复键盘/paste/截止和换代语义。

2026-11-14 账户归一化清理提交前：D.5提交`46b80eec`。删除无人消费的凭据codec，保留现有canonical normalizer；真实持久配置先拒绝prototype键，安全归一化后的extras经普通credential resolution读取。独立暂存树五静态门、19项account测试和build `3a18c732b2d1`通过；不等于F1.4所有OAuth提供方已实现。

2026-11-14 设备登录修复提交前：账户清理提交`1d5ee319`。显式device选择贯通instruction/poll/私有exchange/proof/pending owner及refresh enrollment；首次独立暂存树6/190与build通过，独立复审发现exchange仅body限时。默认15分钟login下30秒headers未超时的反例确实失败；改为fetch前创建共享30秒scope，修复后独立暂存树6套件191项、五静态门、build `810b9a19a4c4`通过，包含晚response取消/无proof。F1.4其他提供方、真人同意和实际续期仍缺证据，未勾选。

2026-11-14 B2.2提交前：设备登录提交`d81e4f86`；实际宿主及共享输入边界11套件166项、五静态门、build `64e760e74bd1`通过。两条Linux PTY路径16色/拆分DA1/晚到更新/粘贴保持通过；探针首次期待旧kitty状态而非公开enhanced值，修正后通过，产品未改。独立复审限定CLEAR。提交前仅去除新增文件尾空行，build证据对应行为相同的暂存树。

2026-11-14 图片输入修复提交前：终端提交`b607fd6`；初次暂存树7/232与补充wire/capture/sent/compaction4/94通过，独立复审另发现既有image/jpg别名被新准入拒绝。simple/turn两反例均红后统一MIME投影，保留原history；最终独立暂存树11套件315项、五静态门及build `6d1d1be8347f`通过，含Linux实际inline缩放与PDF/read消费者。限定复核CLEAR；目录classifier/生成模型类别和B.3完整终端预算验收仍未完成，不勾选F2.1或B.3。

2026-11-14 连接生命周期修复提交前：图片提交`260e549`。独立复审发现SSE fallback未继承owner取消；真实loopback进程两格handshake/cached均因owner不能取消打开的body而失败。绑定caller/owner同一signal后，独立暂存树五静态门、6套件75项及build `b4e5995ee59a`通过，含实际TLS/CONNECT/超时和SSE socket关闭。独立限定复核CLEAR；F1.2真实配置提供方兼容证据仍开项。

2026-11-14 tracing修复提交前：连接提交`df99ff0`。6个carrier/真实turn红、2个native observer/sink红、2个async-method/missing-ID红、1个持久读缺ID丢记录红均已修复。首次8/64通过后build暴露日志类型仍必填，补真实reader反例而非断言绕过；最终独立暂存树9/70、五静态门、build `2c8cce9867b8`通过。异步side-channel拒绝均被观察且不等待，未知身份不借旧logger；日志保留仍partial。初次误列不存在tools.batch.test未当已运行证据，最终用实际tools.test 32项。dashboard来源剩余核实保持F2.5开项。

2026-11-14 包元数据命名提交前：tracing提交`783c2836`。资源清单统一使用cheers字段和本地manifest owner，旧项目标签未继续作为新配置入口；独立暂存树五静态门、loader3项及build `55f4520a8ef4`通过。仅此来源字段/命名修正，不代表E.9 npm/git/local安装adapter完成。

2026-11-14 扩展基础修复提交前：包元数据提交`16baff4`。复审新增真实loader active-tool确认反例先红（reload后host signal未abort），合并generation/caller信号后绿；最终独立暂存树8套件46项、turn/session/approval/pending4套件114项、五静态门、build `63c53a330913`通过。限定复审CLEAR。首次附加路径tools.approval.test不存在，未当运行证据，实际approval/tools消费者在后续4套件验证。SDK配置发布UI重绑定留WATCH；T3真实配置模型和扩展其余任务不因此勾选。

2026-11-15 C.6压缩保留：`declarations-compaction-accepted.log`为最终13/231与六静态门／函数上限／build，`declarations-compaction-reversal.{log,json}`记录四有效反转和三文件逐字节恢复，`declarations-compaction-restored.log`为恢复后3/32。初六反例及补取消／计数／authority／split／empty反例保留；一次错误计数期望和一次dispatch类型夹具错误已分类修正，progress三项真实回归已修复。仅本地实现／验证，C.3/C.6与总目标仍active，本地验收任务数16。


2026-11-15 C.3联合验收：六静态门通过，实际30套件502项全部通过，明确删除主联合命令中5个不存在的测试路径并补入实际history／summary／schedule／state消费者。账户刷新首次失败归类harness/setup drift：默认4096超过main100而在renewal前拒绝；fixture合法化后原全部断言通过。限定只读复核CLEAR。`context-joint-native-evidence.json`绑定同一`e4d27485`和build `c7857153d401`、两源脚本SHA256及每组7次actual请求；C.3本地验收数增至17，C.6因Anthropic原生协议无真实证据保持部分。仅测试／文档变更，沿用未改的生产构建，不重跑build。


2026-11-15 B.1：初21项失败中3项是窄frame仍保留3cells和旧text-ZWJ宽度的夹具错误，原日志保留；几何确认后使用真实borderless2cells，不改生产frame。最终7/306、六静态门、函数上限0monoliths和build `12c748aff97c`通过，独立复核CLEAR。Linux当前编译CLI regular/fullscreen各5种source原文、硬件cursor字节和按键/鼠标编辑结果通过；第一次native未计入cue margin的观察错误保留。keycap与ZWJ反转为3红／1红，逐字节恢复后7/306再绿。本地验收数18，继续B.3；无physical glyph/provider/push/CI声明。

2026-11-15 B.3准入首批：admission-red.log初8failed／19passed；admission-review-counterexample.log为两个实际MIME原字节反例，先前npm12 -t解析拒绝只算setup失败。六门和6/124绿；native首次seed误从root导入core tools及fullscreen清屏观察错误均保留，最终仅改probe导入／观察后四格passed。实际M，额外依赖1（拒绝MIME显示安全）；相同metadata／wire owner复用，无新增循环或解码器。本地18项计数不变，B.3仍部分。

2026-11-15 B.3布局子批：第一准入已提交`20a37ae`。layout-red.log为7failed／57passed；后旧QUJD宽布局夹具及protocols颜色timeout单列。颜色用例在imageDimensions还原HEAD后同样失败，键盘DA1 ownership在250ms截止后释放；fixture等待原deadline，生产协议不改。layout-review-red.log背景后printing两红、layout-pointer-red.log实际旧drag copy true与layout-selection-red.log generation红修复；最后8/313＋六门／build通过。native首次seed路径／输出文件重用为probe错误，修正fixture后四格passed。实际L，额外依赖2（选择代际和共享背景顺序），原owner复用，18项计数不变。

2026-11-15 B.3裁剪子批：布局已提交`ef052794`。crop-red.log为8failed／10passed，真实pane顶部／底部源像素裁剪及浮层非anchor行遮挡先红；复审实际scrollbar＋CR与iTerm visible anchor fallback两反例各红后修复。选择SGR interposition推断经实际两green用例反证，复审撤回，不增加不可达分支。六门、8套件243项及build `2443a54998eb`通过，限定独立复核CLEAR；两反转确实红、逐字节恢复后8/243再绿。native首RTK child非TTY、构建后测试改动及小屏底部intro错观察分开保留，最终编译CLI fullscreen两协议小屏/PageUp/扩屏恢复、exit0 passed。iTerm第二次PageUp可重用原fallback行，观察改为实际diff输出而非重复标签。实际L／额外依赖1（控制移除须撤销附着reanchor），18项不变；lastpaint／placement／regular scrollback／预算仍待完成。

2026-11-15 B.3fullscreen图层／预算子批：裁剪已提交`cf3b504`；paint-red.log6failed/87passed，图最后绘制／覆盖行重画／placement删除／d=I先红。复审duplicate-first首帧两upload单红、live failed-upload单红、unknown pixels文本retry/stop两红和按ID加强两红已修复；失败snapshot恢复已隐藏及eviction候选身份，cleanup再失败保留ID。首duplicate测试错误要求非覆盖between行重画属fixture期待错误，修正covered行后green，不修改该生产合同。6门9/261、0monoliths、build `e240273b687f`、限定复核CLEAR及Linux compiled CLI fullscreen两协议同图双placement、reflow图最后和exit通过。完整PNG独立16/32MiB/64MiB边界通过；两个反转红且exact恢复。实际L／额外依赖2（同帧duplicate与失败ID清退），18项不变，regular和document-tail不在此子批验收。

2026-11-15 regular子批提交前：fullscreen已提交`33ed26a`。regular图片预清完整reserved rows后绘制，独立occurrence ID和p=1避免重复source重传及叠加placement；完整visible隐藏按pair撤图、替换释放无历史upload，partial placement交给native LF，document替换先保存crossing残余。同步输出throw保留原cause并退休painter，后续paint/start/外部移交拒绝，stop仅恢复mode/cursor，不伪造物理回滚。六静态门、7套件248项、0monoliths和build `d3c1c005a1a5`通过；Linux编译CLI regular Kitty/iTerm完整extent预清、同源双图、typing不重传、保留history退出均exit0。两个反转红且逐字节恢复；限定独立复核CLEAR。 `regular-*`保留初反例、失败分类和native receipt；仅painter fail-stop，未称整个TUI零输出或物理像素验收。

2026-11-15 lifecycle子批提交前：regular已提交`ea0af2c`。document浮层复用已有1049借屏，用原文档有界tail裁剪后composite，原native history/placement不改；进出screenRevision使旧选择失效，背景pointer/composer/choice坐标退休，浮层保留自身bounds。fullscreen清ID在真实terminal.stop恢复主屏之前，继续尝试全部cleanup并保留首错。六静态门、8套件244项、0monoliths、build `f78d9a11fe0d`通过；实际Screen证明partial主图层/cursor/scrollback关闭后精确恢复及同ID跨屏清退隔离，限定独立复核CLEAR。Linux当前编译CLI两协议通过临时input hook触发实际OverlayStack借屏／抑图／还屏且exit0，两反转红且逐字节恢复。 只读复核未执行验证；native hook只触发生产浮层入口，不替代渲染与清理。未测physical pixels／未push或CI，18项不变。

2026-11-15 B.3最终资格：document-tail已提交`63c0aba`；独立只读审计确认原roadmap:23/full-audit:58要求已由各actual owner覆盖，剩余完整WebP消费者证据补于blocks.test。测试3套件56项、六静态门通过，无生产代码变更，不重做此前已通过的build/native。原paint成功回执被lifecycle driver写入同目的文件；从paint-native-first.log和lifecycle-native-cli.log精确恢复两个canonical receipt，保留失败probe于lifecycle-native-probe-failed.json及receipt-repair.json哈希，全部归档source hashes验证通过。实际S，结构复用原owner，无新增生产依赖；本地验收由18增为19/62。Linux字节／生命周期和模型／平台边界保留，整体goal继续active。

2026-11-15 B2.1状态子批：初测试9failed/4passed为实际顺序／stop／reentry反例；初未显式capability和key字段错误另存分类。独立复审old-color/startup sentinel与start重入三红、capacity单红、cancel后继单红均修复。六门、8/210、0monoliths、build `744017336148`通过，Linux当前CLI loaded四格shared DA／fallback／keepalive／原始paste／suspend再probe／stop后迟到调用通过；startup确认均false，明确bootstrap输入饥饿仍未修，两反转红且exact恢复5/93。实际L／额外依赖2（所有query fence及start/cancel重入），原owner复用、无新循环，19/62项不变。B2.1仍部分，不扩大本批为整个终端完成。


2026-11-15 恢复后SDK联合收尾：原9红例、取消hook异常1红及goal scheduler实际入口1红先复现后修。最终六门16/236、0monoliths、build `d9acacbc4260`，四有效反转red/exact恢复及同代安装严格类型／15入口／四真实请求passed，限定独立复核CLEAR。旧`92cfbc5c5b63`、`57574fd63403`回执保留原代际，不当最新源码验证；初Vitest错误路径和npm12 pack对象读取错误仅setup记录。T3.1勾选，总21/62；C.1缺实际目标完整重绑定和会话注册／状态，继续实施。
