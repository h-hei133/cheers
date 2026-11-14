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
- [ ] **A.3** read 2,000 行／50 KiB 与统一行字节预算：已有待验收。成功／失败／事件／后续上下文一致、归档提示不丢；沿用前台有界 capture。
- [x] **A.4** patch 写前判定：本地验收完成。绑定普通批准的确切选择与revision，完整effects包含write/delete/rename；支持写入和unsupported删除缺口共存，unknown/block优先。9项真实patch反例及原生hook消费者通过，独立只读复审CLEAR；unsupported仍是证据缺口，不代表删除规则已实现。

## B / B2: 终端（P0／P1）

- [ ] **B.1** 国旗、ZWJ、无 FE0F 等显示宽度：已有待验收，真实渲染／截断／命中一致。
- [ ] **B.2** 1 MiB 分块 writer 与背压：已有待验收，受阻管道、关闭与取消不丢终态。
- [ ] **B.3** 图片头、cell size、缓存数量／传输／64 MiB 解码预算：已有待验收，真实 Linux 图片和未知格式拒绝。
- [ ] **B2.1** OSC 9;4／7501／133／16t／tmux 超链接：已有待验收，实际生命周期和输入隔离。
- [ ] **B2.2** OSC 10／11／4 查询与完整调色板应用：部分。查询 API 尚未由产品生命周期调用；接入现有主题选择／预览，不让迟到响应改变后继宿主或覆盖显式选择。
- [ ] **B2.3** 可组合浮层与非捕获交互：已有待验收，叠层焦点、短屏、关闭／恢复、真实 PTY。

## C: 循环、消息与缓存（P1，并包含深度审计 P0）

- [ ] **C.1** prepareNextTurn／prepareRequest／finishTurn 与虚拟路由：已有待验收，调用顺序、follow-up 优先级与真实配置模型。
- [ ] **C.2** message_update 流式部分消息及 x-should-retry：已有待验收，部分响应不重放、内外重试一致。
- [ ] **C.3** AgentMessage 与 provider Message 分离及 convertToLlm：缺口。目前 AgentMessage extends SessionMessage；需实际自定义消息、投影／持久化／SDK 消费者，不能只新增类型。
- [ ] **C.4** 默认历史工具文本保留与一致测量：已有待验收，真实多轮请求前缀与压缩预算。
- [ ] **C.5** Anthropic 历史缓存标记、OpenAI／Responses affinity 与 TTL：已有待验收，真实最终 wire 和能力限制。
- [ ] **C.6** 动态工具／思考档位在原始消息位置声明：部分。当前请求末尾临时追加增量，后续消息会移动旧块；需跨轮／续接后前缀稳定的实际 wire 证据。
- [ ] **C.7** 逐轮缓存未命中与成本归因：已有待验收，真实 usage 缺失保持未知，不能据假定缓存率宣称节省。
- [ ] **C.8** 六个核心工具、动态 prompt、BM25／词干／Schema 索引和单步激活：已有待验收，生产 search→execute 与失效代际。
- [ ] **C.9** stdout 保护：部分。JSON／RPC 已接入，普通 print 尚缺；外部日志不污染结果与有界重试队列。

## D: RPC 与导出（P1）

- [ ] **D.1** 会话／模型／树命令：已有待验收，真实 JSONL 与错误分类。
- [ ] **D.2** 队列清空和 steering／follow-up 模式实时更改：部分。clearQueue 未清活跃输入队列；模式只写配置未改活跃队列，需实际进行中消费者。
- [ ] **D.3** UI 请求／响应和事件：已有待验收，取消、撤权、EOF、迟到响应。
- [ ] **D.4** HTML 高亮、GFM／CJK、Thinking、Diff、灯箱：已有待验收，真实离线导出与转义安全。
- [ ] **D.5** 导出 token／费用：已有待验收，身份与覆盖率、缺失／部分计量不伪造。

## E / T2 / T3: 编程与扩展（P1／P2）

- [ ] **E.1** 沙箱组合、嵌套权限／hook／过滤结果：已有待验收，真实一轮多工具、不污染中间历史。
- [x] **E.2** codemode 分支持久化：本地验收完成。删除失败后全局Map退路，真实会话捕获scope/原始前缀/分支，锁内重读与写键CAS/当前预算，同FD校验、fsync和回读后报告persisted；疑似已落盘失败为unknown。损坏持久分支先拒绝再catch-up，多级fork根映射；Linux编译产物独立进程重启读取/分叉通过。E.4确定性重放仍未实现。
- [ ] **E.3** TS 声明／namespace／image／models API：已有待验收，真实脚本调用与输出预算。
- [ ] **E.4** 确定性重放：待核实。已有 worker 不等于声明中的可恢复确定性执行；先明确记录和副作用边界再实现。
- [ ] **E.5** TS 文件／异步工厂及共享宿主：已有待验收，延迟初始化／reload／取消、安装产物。
- [ ] **E.6** 扩展完整生命周期事件：部分，逐事件找 dispatch 和结果消费者；声明未消费者不得算完成。
- [ ] **E.7** registerProvider／virtual model／MCP／renderer 与运行时 setters：缺口；通过已有目录、路由、权限和渲染 owner 注册、撤销及失效，避免第二运行时。
- [ ] **E.8** shortcuts／flags：部分。目前收集但 CLI／SDK 未消费；冲突、默认值、实际参数与按键生命周期。
- [ ] **E.9** 包安装来源和 CLI 入口：部分。已有签名 marketplace 安装，npm／git／local adapter 和顶层安装入口尚缺；保留显式批准、完整性、精确版本与写入边界。
- [ ] **T2.1** CLI 参数集合、单遍解析与早期启动判断：部分，主循环已存在；测试完整启动矩阵并处理早期多遍语义。
- [ ] **T3.1** createAgentSession／DefaultResourceLoader：已有待验收，公开类型／包安装、真实模型调用、取消后复用及 dispose。

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
- [ ] **F2.5** Span／Event／Link／检索／作用域：已有待验收，记录器失败不夺取产品完成权。
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

2026-11-14 初次核实：真实 Node import 中14个非根入口全部 ERR_MODULE_NOT_FOUND，作为 T1 的修复前反例。

2026-11-14 T1：六静态门通过（docs保留119条既有advisory）、完整scripts210/210；测试批次重叠不累加为唯一总数。Node24定向11/83、Node20.3定向5/65通过。隔离安装2,166项、2,465,935字节压缩包，只含一代；本地安装的TypeScript严格解析全部15入口，不依赖仓库ambient types；主题4项、TS扩展、SDK prompt、codemode worker通过。Linux Node20.3和单文件exe原生prompt通过，exe有host version回执。独立T1只读复审CLEAR，限制见design；记录 `.omx/artifacts/upgrade-toolchain-2026-11-14/`。首次npm12 JSON形状和缺失临时HOME属夹具失败，均修复重验。无真实服务/Windows/commit/push/CI；总目标仍active。

2026-11-14 T1提交前：单独导出暂存树，在独立依赖路径以六静态门、生产build `fa4c37d23706`及55项相关脚本验证该提交不依赖其余未暂存修复。新lint同时要求删除已有测试中的不可达yield，随该批提交。初次夹具仅复制根node_modules、遗漏workspace-local Undici，修正夹具后build通过。以上新增证据仅覆盖首批暂存内容，无推送或CI声明。

2026-11-14 A提交前：独立暂存树9套件255项通过（edit32、matching26、patch9、translation45/native25、preparation15、batch45、turn54/approval4），五静态门和生产build `b217b2736927`通过。此前patch9项中6失败/3通过，修复后全通过，独立review CLEAR。匹配反例修复前1,109,013次比较失败。T1本地提交为`a8ffe683`；A证据不等于A.3输出或整条路线图已完成。一次独立命令误用workspace-local Vitest路径，修正root依赖入口后重验，不是产品失败。

2026-11-14 E.2提交前：最初11红/3通过，修复后75项通过；独立复审补充“坏leaf被新消息补齐掩盖”“同inode删旧前缀”两反例均红，修复后实际工作区与独立暂存树5套件80项通过。五静态门、生产build `d3279f86c0e7`、编译产物两次独立Linux进程验证持久写/重启读/两代fork独立值通过。独立复核CLEAR，只承诺现有锁和身份/前缀重验，不承诺任意不守锁外部改写原子性、所有未await嵌套调用结算或E.4重放。A本地提交`e58d8786`。
