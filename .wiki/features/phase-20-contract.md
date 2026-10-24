# Phase 20 契约矩阵

每一行把任务绑定到所有者、当前测试与一个反转条件。测试通过只证明该行；没有真实 provider、PTY、跨平台或发布证据的行仍保持开放。

2026-10-23 的机器可检查复核矩阵为 [scripts/phase20-requirements.json](../../scripts/phase20-requirements.json)，由 `npm run verify:phase20-requirements` 对照本规划逐 ID 校验：47 项中 35 项 `complete`、12 项 `partial`、0 项 `open`，整体仍为 `partial`。`complete` 只表示该行已取得当前约定的本地/构建/CI 证据，不替代 QA-02 的真实平台格、QA-03 的真实质量或 Phase 20 总完成。

2026-10-18 返工复核发现旧表有状态漂移：实现存在或测试数量不能替代完整裁决。当前复核范围及未闭合项见 [交付状态](phase-20-status.md#返工复核2026-10-18)；以下未重新验收的行均是历史证据索引。

## W1 配置

| 任务 | 所有者 | 证据 | 反转 |
|---|---|---|---|
| CFG-01/02 | `config/runtimeConfig.ts`、`config/identity` | `runtimeConfig.test.ts`、`config/*` | 去掉显式输入次序后 `config` 断言失败 |
| CFG-02/04 导入路径规则 | `config/profiles/import/{config,plan,source}.ts` | `import/scope.test.ts`（4）；验证导入后真实工具 scope 的空 allowlist 仍拒绝 read，源变化拒绝发布 | 恢复直接复制相对路径后 default/named/legacy 三例失败 |
| CFG-03 | `config/layers.ts` | `layers.test.ts` | 显式输入不再遮盖文件值时失败 |
| CFG-04 | `config/scope/*` | `scope/*.test.ts`（20） | 目录身份/安全字段不再累积时失败 |
| CFG-05 | `config/fields.ts`、`layers.ts` | `environment.test.ts` | 空环境值不再忽略时失败 |

## W2 provider/认证

| 任务 | 所有者 | 证据 | 反转 |
|---|---|---|---|
| PRV-01 具名连接选择 | `core/commands/model/{choice,selection}.ts`、`session/model/`、`core/shell/providerCredentials.ts` | `picker/model.test.ts`、session/model、providerCredentials；合成 relay 请求及恢复 | 删除 revision 检查、丢失连接后退回默认或使用 CLI/env 的另一账号时失败 |
| PRV-02 具名角色应用 | `core/commands/model/preset*` | presetCommand、presetStore、picker/model；空 session 应用 profile 角色、明确 connection 解析、旧 provider 身份不能消歧 | 跨连接改回拒绝、同名跨层合并或任一无效角色仍写入时失败；自动角色 consumer 另行复核 |
| PRV-03 | `core/auth/account/{pool,presence}.ts`、`core/auth/oauth/copilot/policy.ts` | `account-pool`、subscription、account/readiness/authorization 测试；opaque token tenant/audience 绑定 | 池外发送回退到 env/profile 时失败；同一 provider 的两个 Copilot origin 交换 token 时失败 |
| PRV-04 | `core/auth/account/lease.ts` | `lease.test.ts`（7）、renewal（38） | dispatched/unknown 被提前清理时失败 |
| PRV-05 | `provider/request/backoff.ts`、`core/agent/request/` | backoff（5）、ledger、main/delegated/side/summary/cache identity；advisor/jobs 共享预算 | A 的 429 阻塞 B 时失败；移除 auxiliary policy/credential attribution 时失败 |
| PRV-05 历史费用 | `observability/usage/`、`turn/step.ts`、`cli/runtime/cache.ts`、`core/commands/cost/` | attribution、turn/usage、store/usage、cache、sessionFacts；本机 HTTP 晚到响应及多进程真实落盘 | 移除发送前捕获、按当前目录重算、取消旧键转义、缓存类型命名空间或 partial 状态标记时失败；完整 PRV-05 仍开放 |

## W3 上下文与工具

| 任务 | 所有者 | 证据 | 反转 |
|---|---|---|---|
| CTX-01 | `context/request/budget.ts`、telemetry | budget（6）、telemetry（22） | `P+O+H>W` 仍发送时失败 |
| CTX-02 | `context/request/budget.ts`、`session/compaction`、turn | budget（6）；等号、软触发、独立 input limit、measured prefix 均按同一预算；`cli/provider/step.test.ts` 以实际 HTTP 证明动态加载 schema 后第二请求重新计量 | 去掉软触发边界、允许超界 reserve/output、把 measured prefix 之前内容重复计量或移除动态 tools overhead 时失败 |
| CTX-03 | `session/compactionOperation.ts` | 操作测试（7） | unknown 步骤被重播时失败 |
| CTX-04 | `context/report` | report（6）、sessionFacts（9） | stale 被当作当前值报告时失败 |
| TOOL-01 | `core/tools/discovery/*`、`core/tools/catalog.ts` | discovery（10）、handoff/director；动态 load 后 schema digest 改变并在下一请求预算中生效，超限零发送 | `todo` 或 run feature tool 不在首请求时失败；移除 `toolSnapshot` 或 provider discovery 接线后跨 owner 集成测试失败 |
| TOOL-02（部分） | `core/tools/discovery/evaluation.ts`、`provider/endpoints/toolSurface.ts`、`observability/usage/*`、`turn/{session,step}.ts`、`scripts/qa-quality*` | endpoint-specific declaration bytes、code-unit estimate、quality status、bounded request purpose/history；正式 20 项 paired harness 已测固定 `temperature=0`/`maxOutputTokens=4096` 下的 turns/tool calls/argument errors/missed discovery/cache/cost coverage，并用四语言 paired first-request delta 校准 tokenizer；157 项脚本测试及 20/20 fixture validation 通过 | 去掉真实 load 后 quality 不得为 `preserved`；把 UTF-8 bytes 当 code units、忽略 endpoint 协议、丢失 discovery purpose 或删除固定采样值/manifest 校验时失败；真实模型总请求/成本、参数质量与 tokenizer 数值仍待真实 opt-in 运行 |

## W4 布局

| 任务 | 所有者 | 证据 | 反转 |
|---|---|---|---|
| UI-01 | `composer/frame.ts`、`surface/budget.ts` | `geometry.test.ts`（8） | padding 改回 2 或正文超过 16 行时失败 |
| UI-02 | `chrome/panel.ts`、`chrome/modal.ts`、`overlay.ts` | panel（9）、picker（16）、surface/view（40）；20–200 列、8–80 行，长草稿和 51 候选 | 固定八项上限、按候选数截短详情或窄屏越界时失败 |
| UI-03 | `chrome/{progress,chips}.ts` | progress（4）、chips（3） | unknown 输出百分比时失败 |
| UI-03 分组输入 | `overlay.ts`、`keybindings.ts`、`chrome/{panel,modal}.ts` | overlay（57）、keybindings（25）；Node/exe 两模式 PTY 的 settings/resume 切组 | 每行只保留最后一个 hit、删除键盘切组或复用已关闭面板 hit 时失败 |
| UI-04 | `transcript/source.ts`、`surface/pane.ts` | `source.test.ts`（4） | 软换行插入 `\n` 或装饰行参与复制时失败 |

## W5 命令与设置

| 任务 | 所有者 | 证据 | 反转 |
|---|---|---|---|
| CMD-01 | `chrome/suggestions.ts`、`keymap.ts` | suggestions（13）、keymap（54） | `/m` 首选 `/mcp` 或完整命令接受旧候选时失败 |
| CMD-02 | `syntax/*`、`37` 审计 | syntax 套件、actions/commands | 未知参数被接受时失败 |
| SET-01 | `config/settings.ts`、`picker/settings.ts` | `settings.test.ts`（6）、picker（11） | 数值/列表落回 JSON 时失败 |
| SET-02 | `picker/settings.ts`、`chrome/options.ts`、`text/search.ts` | settings（31）、picker/settings（15）、原 slash 排序测试；四格 PTY 从 Session 搜索 `mxtrns` 找到 Request 的 Maximum turns | 先按当前分组裁剪搜索全集时，真实 overlay 输入/粘贴用例失败；清空查询未回原组、Back 未聚焦所属组或已存值无标记时失败 |
| SET-03 | `picker/preview.ts`、`picker/settings.ts`、`tuiSettings.ts` | settings preview、theme selection（2）；composer/status 在真实 `refreshShellRuntimeConfig` 后撤销，theme 外部 generation 仍受 lease 保护；受影响 9 文件/313 项 | 删除 revision guard、composer lazy invalidation 或 status publication check 时对应断言失败；预览关闭后仍覆盖显示时失败 |

## W6 面板

| 任务 | 所有者 | 证据 | 反转 |
|---|---|---|---|
| PAN-01 连接/具名角色选择 | `picker/model.ts` | picker/model（26）、model host（1）、pickers（47）；真实 overlay 按 relay 与 role 搜索，选择后分别改变 publication revision 和 preset owner，旧行均被拒绝且会话字节不变 | 移除 relay 身份后搜索失败；移除 preset owner 比较后改名的 role 会替换原显示目标并失败 |
| PAN-02（部分） | `picker/session.ts`、`picker/session/{preview,listing,host}.ts`、`picker/tree.ts`、`session/{navigation,recovery,store}` | 分组/完整目录搜索/分页/current focus 保留；真实 catalog offered version 经 host/router 到原 resume owner，解析后/加载后/state lock 内重验；tree/fork/history opening version，branch round trip 与 summary 外部修改拒绝；surface stop/closing/cancel 拒绝，合法自身 busy 保留；激活故障只读 readback，verified warning/unknown 均阻止后续动作；受影响24文件398项，registry三分支只读额外3项，六组反转及四格 hostile PTY 取证 | 移除 resume/tree version、summary fence、lifetime、readOnly或 publication-start 均实际断言失败。TreeModel展开/完整搜索/panel详情与20k节点/24.25MiB源/50k行准入，261项/七反转/四格PTY通过。catalogue在授权scope/reentry/query过滤后只保留40+1 lookahead/current；完整scan后提供原排序/version边界，前后二验、query-clear迟到订阅拒绝、action ID不碰撞saved ID；后续页绑定一次browse attempt的20k boundary index，只读当前页并继承partial状态，不再逐页discovery；一次attempt的metadata/state/transcript body累计读取≤64MiB，续页共享预算，超限返回sourceLimited partial且不再发行continuation；同一cursor并发重放拒绝；受影响323项/五有效反转，固定页到10,045条、超过10k非匹配后的旧目标可达。该有界process-local索引不承诺冻结目录；64MiB是逻辑源字节准入，整体physical I/O/heap/时延与其余动作审计仍partial |
| PAN-03 | `picker/hub.ts`、`picker/agents.ts`、`jobs/agent/projection.ts` | pickers；`/agents` stale/detached、liveness、session rebind 与 `agentPage` 脱敏分页；hub/agents 在 session/workspace rebind 后停止订阅并拒绝旧 apply；command/note/directory/output 先经共享报告脱敏；Node/exe × regular/fullscreen PTY 打开/关闭且不取消任务、不追加模型消息 | `/hub` 在无 composition 时仍打开、旧 session 仍发布/apply、stored running 仍显示 running 或未脱敏元数据进入面板时失败 |
| PAN-04 | `picker/thinking.ts`、`cli/usage/service.ts`、`core/models/capability.ts`、`core/auth/account/usage/remote.ts` | usage（34）、thinking picker（3）、effort（26）、progress（4）及 model shape（24）共 8 文件/149 项；exact relay supported/unsupported、unlisted model unverified、ambiguous endpoint disabled、unknown quota 与 measured `0%` 分开 | 移除 exact `baseUrl` 时 supported level 变成 unverified；unknown model 改成 unsupported 时 unverified 用例失败；`null` quota window 改成 `0%` 时 unknown 用例失败 |
| PAN-05 | `picker/advisor.ts`、`picker/plan.ts`、`picker/btw.ts`、`core/commands/report/projection.ts`、`btwCommandRuntime` | advisor 只读 checkpoint/note 面板；plan-review 与 btw 结构化报告；advisor load/apply 重验精确 state，plan 绑定 version，btw 绑定 transcript revision；advisor/btw metadata 先脱敏；Node/exe × regular/fullscreen PTY 打开/关闭且 assistant message 数不变 | 面板打开触发模型、旧 state/plan/transcript 串入新面板、metadata 未脱敏或 plan/btw 越权写入主会话时失败 |
| PAN-06（部分） | `picker/copy.ts`、`picker/rewind.ts`、`picker/restore.ts`、`picker/undo.ts`、`edit/recovery/undo/`、`edit/recovery/{catalog,recoveryAuthorityIndex}.ts`、`transcript/container.ts` | undo saved-results面板/直接命令40条分页及明确end、scope/完整receipt revision游标、按ID完整查询；85条三页/变化拒绝/无写取消回归及四格打包PTY；原精确确认与partial/unknown持久结果继续通过；pin裸入口复用sessionPicker与原metadata CAS、offered version、query刷新/取消/stale回归；copy（9）；完整Block.text搜索后100项分页、continuation/end、query保留、精确offered-ID、source revision/stale拒绝及取消/clipboard失败；history保留早期重建源且clear释放，四格205条打包PTY到最旧源；back完整候选、25项展示续页、exact-ID优先/数字全局定位、完整prompt搜索/查询保留及共享捕获快照；21项picker回归和四格60题打包PTY，只调用既有分支/草稿回退；restore（15）、catalog（9）及 recovery index（5），后续页使用attempt-local page index并复验cursor revision、精确position、目录版本/页内digest，不再整ledger重扫；初始metadata扫描≤32MiB，所有续页metadata读取共享不超过初始扫描字节的累计预算，超限整页拒绝，因此单attempt主动metadata读取≤64MiB；同一restore cursor并发重放拒绝；选择仅生成可解析preview draft，复合身份/digest重验；目录buffer32、最多101条排序记录/每页100条，205条跨三页无遗漏/重复、完整搜索、变化拒绝和取消关闭句柄；加载中输入及普通/排队no-match渲染均有回归；Linux八格预览核对文件/记录/blob字节 | dash-leading参数、单record identity、40项截断或移除digest有实际失败；放宽100项页、移除cursor revision/position、关闭完整搜索或移除search generation亦有反转失败；back的continuation、完整保留、exact-ID和完整查询四项隔离反转均实际失败。restore每页重置累计预算、移除continuation readAccess、篡改cursor revision/position、移除claim或移除内层caller check时，累计/续页测试失败；back完整候选/同步搜索随源大小增长；restore续页不再整ledger重扫，但仍不承诺搜索延迟上界/原子目录快照；undo移除continuation/完整读取/游标revision/选前复核四项均实际失败；undo每次全量读取/hash不承诺总I/O或延迟上界，copy续页/完整查询/revision/精确ID/end/earlier源六项反转实际失败；overlay关闭/确认已释放filter模型/baseOptions/input，续页与迟到结果有回归；copy完整源同步过滤/保留成本仍无上界证据，history及其余边界不据此闭合 |
| PAN-06 copy（本批部分） | `picker/copy.ts`、`picker/copy/source.ts`、`transcript/container.ts`、原 `copyCommandRuntime.ts` | lazy admitted source、20k块/32Mi UTF-16 units含label、全文单query缓存共享续页、one-use release、earlier源/精确ID/raw revision、原准入和取消、fresh fallback前重验及已派发copied/offered分别保留；真实host拒绝提示、205项聚焦、11有效反转及四格205块PTY通过 | remove release/admission/块数/units/cache/无split摘要/earlier/fallback/initial/final/LF计数均实际断言失败并恢复hash；完整query同步及临时heap/真实system clipboard仍缺，不关闭PAN-06 |
| PAN-06 back（本批部分） | `picker/rewind.ts`及其原分支owner | 一次opening最多50,000来源turn、20,000候选问题、50,000有ID且非context的用户content块及32Mi UTF-16 units（候选ID/文字/拼接分隔符）；在拼接前计量，超限明确拒绝整份列表。共享一个捕获源和一个完整query缓存；关闭/选择/交接一次消费并释放，原准入在枚举与动作前重验；原text/ID/dropped及25项分页完整保留 | 原代码六组断言失败，最终201项、11有效反转和准确build四格60题PTY通过；原getSession失败/版本、同步query/瞬态heap继续缺，不把来源units当heap bytes或原session读取总界 |
| PAN-06 back持久绑定（本批部分） | 原`cli/runtime/navigation.ts`、`picker/rewind.ts`及`interactiveMode`组合 | opening复用已有有界`readSessionNavigation`取得active turns及version；保存根/身份不匹配、活跃path损坏/消息缺失或读取失败显示unavailable，不能显示空列表；每页保留原version，选择交原`navigateSession`fresh acquisition后写前version比较及原state lock的content/conversation/identity校验，变化拒绝、取消零导航 | 真实host原代码两项失败；缺失活跃消息审查回归先失败，最终223项、六有效反转及准确build四格hostile PTY通过；全graph投影/瞬态heap仍缺，不把stat版本冒充hash/原子快照 |
| PAN-06 history / UI-03 底栏 | `picker/tree.ts`、`session/query/navigation.ts`、`interactive/ambientFacts.ts`、`chrome/hints.ts` | history完整持久树含废弃分支、全文问题搜索、current焦点、精确草稿和原字节不变；queued空历史/无匹配/安全读取失败；293项受影响集合，206条原消息的双构建四格故障PTY；底栏读取失败为unavailable，恢复后重新计算 | history入口/草稿边界/完整保留/搜索源/安全失败/无匹配六项隔离反转实际失败；底栏异常逃逸/unknown改0/renderer改0三项实际失败。全树同步读取/搜索/保留仍无总量上界，不能据此关闭PAN-06或资源合同 |
| PAN-06 cleanse（部分） | `security/view/inspection.ts`、`security/service.ts`、`security/findings/publication.ts`、`cli/runtime/security.ts`、`picker/cleanse.ts` | 结构化身份/内容版本、原owner发布订阅与打开期间外部观察；保留live/orphan/unknown/durability，unavailable/stale/empty/no-match；确认仅精确quoted诊断草稿；同绑定元数据更新保留未知receipt，换根旧面板拒绝且重开恢复；203项受影响测试和96记录双构建四格PTY，浏览/取消原字节不变 | 入口/草稿/版本/orphan/durability/新鲜源/释放/unavailable/busy/safe-status/safe-target/rebind/retention共13项隔离反转实际失败。持久payload的32扫描/64修复/4MiB与20项finding预览不等于总资源界；未知影子证据可超过持久限制，每秒全量同步会话读取/解码/hash仍WATCH，PAN-06不闭合 |
| PAN-07（部分） | `picker/auth.ts`、`connect/selection.ts`、`connectCommandRuntime.ts`、`interactiveMode.ts`、`registry.ts` | login provider/method/explicit account confirmation经原cancellable host；API key仅草稿；logout只列primary保存连接，safe projection与opaque key，cancel缺省逐项确认、原ConfigEdit交原writer；253项受影响测试、四格双构建PTY；原生取消pending→error合成回归，relay重复及literal ID修复；extensions alias历史11项 | 入口/owner版本/基线/cancel缺省/取消重用/offered单选/literal ID七项反转有真实断言失败；打开/取消零写、外部变化拒绝、只删精确连接。全配置同步读取/hash/availability仍WATCH，无总资源界；debug/plugin与完整认证生命周期不据此关闭 |
| PAN-07 debug（部分） | `picker/{debug,current}.ts`、`debug/{syntax,report}.ts`、`debugCommandRuntime.ts`、`observability/{crashLog,diagnostics}.ts`、原metrics/tools报告owner | 裸入口静态六视图，显式选择才读取；原参数/非交互路径保留；真实来源status与unknown/null、崩溃诊断1MiB读取界及legacy保留、指标分组/工具字节测量后安全投影；原绑定在读前/await后/host发布三处检查；运行中可打开且等待catalog不阻止Ctrl+C；269项受影响测试和9项报告持久化/codec回归、四格双构建专用PTY及八格smoke | 入口/取消/offered单选/缺工具池/崩溃unknown/字节界/实际inspected/崩溃脱敏/指标脱敏/工具先脱敏后截短/原admission/迟到结果/host发布/input共14项隔离反转实际失败。菜单取消无写；查看只新增安全command-output、无模型消息，配置/工作区/state/metadata不变。全目录同步枚举、逐文件tail及完整catalog成本仍WATCH，无全局I/O/延迟界；不关闭PAN-07或全部47项 |
| PAN-07 plugin/extensions（部分） | `extensions/view/{model,actions,text,projection,manager}.ts`、`picker/plugins.ts`、`runtime/extensions.ts`、原service/lifecycle、pickerHost | 真实绑定原安装state/source；单package inspect与精确版本install/update、rollback、enable/disable、独立grant/revoke及uninstall经cancel缺省确认和原prepared审批；208项受影响测试、strict production TS/双构建、四格专用PTY及八格smoke | 12项隔离反转实际断言失败；原snapshot与source在prepare/confirm/writer重验、一次消费、原command取消；卸载实际cleanup unknown由service保留，同store重开阻止fresh mutation；取消零写，批准后恰4条原权限/工具事件，无model消息、无附带grants。全量同步处理无总资源界、unknown仅store实例内存仍WATCH；不关闭PAN-07或47项 |
| PAN-07 原生浏览器认证（部分） | `core/auth/oauth/{flow,callback,lifetime}.ts`、`providerAuthRuntime.ts`、原connect命令host | 修复上层signal/onProgress未被原生共享flow消费：单一期限贯穿localhost bind、浏览器等待、回调、token headers/body；pre-abort零pending写，取消/超时拒绝迟到凭据；URL先安全校验再展示，缺launcher仍可手动打开；回调页只确认收到授权。175项受影响测试、strict production TS、双构建；四格专用PTY、八格smoke与19入口通过 | progress/preadmission/receipt/token/url/deadline/parent/bind/cleanup九项有效反转均实际AssertionError；原writer/native proof/refresh enrollment与unknown合同保留。PTY在面板和参数两路径证实取消pending→error、端口释放、无凭据，取消阶段session字节不变；正常exit只追加原run-terminated并更新终止状态/元数据。独立代码APPROVE/架构CLEAR；不证明真实provider、外部浏览器终止、已派发服务端撤销或完整PAN-07/47项闭合 |
| PAN-07 扩展获取（部分） | `extensions/store/state.ts`、`registry/sources.ts`、`core/workspace/files.ts` | 原reader获取前state8MiB/source1MiB，原2Mi/256Ki字符界保留；普通UTF-8/无链接存储；filesystem root保留原路径拒绝父目录替换；去重19文件222项、strict TS/双构建、四格超大故障/恢复与原审批PTY、八格smoke | state/source获取及字符界、错误冒充缺失、UTF-8、身份、父根与同inode描述符共10项有效AssertionError反转；来源unknown保留包，state unavailable可恢复。代码APPROVE/架构WATCH，初始BLOCK已修；累计同步处理、总内存/延迟和跨restart unknown不据此保证，PAN-07/47项仍继续复验 |
| PAN-08 MCP 定义向导（部分） | `picker/mcpAdd.ts`、`picker/mcp/definition.ts`、`cli/runtime/mcp.ts`、`cli/mcp/config.ts`、真实 pickerHost | scope/name/transport/executable/JSON argv/review；输入标题显示实际阶段；typed definition复用原parser/普通审批/精确字节writer，无临时定义文件；默认取消、offered单选、一次消费、原session/root/substrate admission与取消；6文件178项、strict TS/双构建、Node/exe四格专用PTY及八格smoke | 默认取消、offered、输入校验、一次提交、迟到结果、URL query投影、typed原路由、原admission、普通文件source授权、可见阶段及精确argv共11项隔离反转实际AssertionError；取消零写，保存不启动连接、不造模型消息。代码APPROVE/架构CLEAR；仅覆盖定义保存，真实连接/认证、其他report消费者及全部47项仍继续复核 |
| PAN-08 tools 报告（部分） | `core/commands/tools/report.ts`、`toolsCommandRuntime.ts`、`picker/tools.ts` | 原terminal canonicalizer后原redactor，再截短/构造report；列表/detail/facts安全，raw ID/required membership/plan policy及原字节成本保留；原context admission在读取前后重核，旧note/report拒绝。受影响10文件146项、strict TS/双构建、四格专用PTY/八格smoke | 脱敏、ANSI拼接、summary截短顺序、raw成本、原admission前后、迟到note、CRLF、safe label及raw ID共10项反转实际AssertionError。取消零写，显式查看仅存安全command-output，无模型消息/selected tool callback；原catalog仍可发现/连接/启动已配置server，全量获取/sort/schema序列化无总资源界，代码APPROVE/架构WATCH |
| PAN-08 skills 元数据与选择（部分） | `core/commands/skill/report.ts`、`skillCommandRuntime.ts`、`picker/skills.ts`；共享 `report/metadata.ts` 与tools原owner | 列表为body-free CommandReport；name/description仅安全投影，选中正文保留原loader解析值；raw ID、单offered/一次消费、精确重新解析，安全名称才插入原parser可读草稿；原trust/flags/contribution/admission保留，overlay load取消透传；10文件276项、strict生产TS/双构建、四格PTY/八格smoke | 14项有效反转；独立复现并修复原overlay信号遗漏及file URL解码C1后重组密钥，两次plain夹住一次path投影后scrub/cap，tools共用。取消零写，显式正文只本地显示，只有列表报告持久化，不造model消息。代码APPROVE/架构WATCH：accepted apply无新取消owner，任意贡献Promise无强制抢占/总时延保证；不闭合PAN-08/47项 |
| PAN-08 context/cost 报告（部分） | `core/commands/context/{request,report}.ts`、`cost/report.ts`及原command runtime | 仅报告metadata投影；原请求/ledger精确身份、分组与captured价格不变；真实cwd、读前/await后原准入；parent10文件97项、strict TS/双构建、四格PTY/八格smoke | 11项有效反转；真实组合标题路径泄露由PTY复现并回归修复。累计用量不当foreground捕获，安全报告仅原command-output，无新模型消息。脱敏key/label非全局injective、attribution非ledger输入；全量生成/发现无总资源界，PAN-08/47项继续复核 |
| PAN-08 其他report消费者（历史索引，继续复核） | `picker/help.ts`、context/cost及原CommandReport消费者 | 既有回归保留；打开列表不造模型消息，不从报告获得执行授权 | 其余消费者仍须复核；旧MCP临时文件合同已被typed原owner替代，不以本批闭合PAN-08/全部47项 |

## W7 输入与渲染

| 任务 | 所有者 | 证据 | 反转 |
|---|---|---|---|
| RENDER-01 | `transcript/{math,markdownScan}.ts`、`text/{codeSpan,inline}.ts`、`session/export/{htmlRender,template}.ts` | math（8）、markdown（59）、source（20）、html（40）、template（10）、export runtime（21）；code span 后的 math token 保持 opaque，未知/缺参数命令整段回原文；金额/escaped dollar/code span 优先；whitelisted equation/align/gather/multline/cases 与矩阵按行布局，nested/12 行/12 列/64 cell/24 行/64 KiB 超限回原文；TUI 与 HTML 共用 finder/projection，HTML 保留行；stream 未闭合公式即时可见；packaged Node/exe × regular/fullscreen 验证视觉、原始 `/copy` 与 HTML export；line/pipe 只回归既有业务链 | 移除 opaque math token 后 `$a*b*c$`/math-link/强调边界断言失败；HTML 改回 scalar conversion 后环境/矩阵投影失败；恢复 partial unknown-command projection 后整段原公式断言失败；escaped/multi-run/unmatched backtick、超预算改写原文或嵌套 anchor 时失败 |
| RENDER-02 | `transcript/{markdown,table}.ts`、`session/export/htmlRender.ts`、`text/{codeSpan,inline}.ts` | markdown/table/html 回归；cell 先完成 inline 语义投影再按 ANSI-aware 宽度换行，链接跨软换行不留下 `](` 字面语法；OSC8 label 在每行关闭，packaged Node/exe × regular/fullscreen PTY 验证 OSC8 与 exact `/copy` source；raw fallback 以最终 `rows.join("\n")` 的 UTF-8 字节计预算 | 多反引号 code span pipe 被拆 cell、未闭合 run 吞掉后续 pipe、链接/样式跨软换行被拆坏、ANSI/行分隔符绕过预算或窄屏截断长尾时失败 |
| RENDER-03 | `transcript/diff.ts`、`transcript/diffPage.ts`、`chrome/pager.ts`、`surface/pane.ts` | diff 回归；400 行/64 KiB 双预算与精确 UTF-8 边界，side-by-side 行号跨页、完整阅读器 PgUp/PgDn/滚轮/Home/End，左右源复制；packaged Node/exe × regular/fullscreen PTY 验证两侧 exact copy；CRLF terminator 不输出裸 `\r`，嵌入 ESC/C0/C1 以可读文本显示 | 零宽内容绕过字节预算、截断标记突破 rows、边界输入误截断、header 被当改动、facts 被吞掉或终端控制符进入渲染行时失败 |
| INPUT-01（部分） | `editor/modal/state.ts`、`input/{terminal,stdinBuffer}.ts`、`cli/interactive/keymap.ts` | state（12）、keymap（63）、stdinBuffer（25）、terminal（7）；跨 UTF-8 chunk、fused/cross-chunk 字素、combining mark、keycap、paste/escape 后文本与纵向边界 | UTF-8 半码点产生替换字符、`f/F/t/T` 只收到首个 scalar、纵向移动落到 surrogate 中间或字素跨 chunk 被拆时失败；完整 IME/五模式合同仍待复核 |

## W8/W9

2026-10-20 复核撤回了本表此前的“完成”标签；后续聚焦反转、跨平台 CI 与受控性能证据分别闭合了 `JOB-01/02`、`EDIT-01`、`START-01/02` 和 `START-03`。以下各行保留当前实际证据，不能用本表存在替代 Phase 20 整体完成。

| 任务 | 证据 | 反转/未闭合 |
|---|---|---|
| JOB-01 | `LocalExecutionHandle`、一次 spawn 的 `adopt/promote`、原 PID 晋升、容量拒绝与重启 unknown 路径；`local.handle`（4）、`journal`（19）、`service`（8）、`promotion`（4）覆盖 detach 后保留生命周期 deadline、adopted settlement、kill gate、撤权、容量拒绝和重启不重播。 | 撤销 `stop` 的 settlement 等待、timeout 传播或在 `detach()` 清除 timer 时，对应真实子进程/服务用例失败。 |
| JOB-02 | 本地 notice、opt-in follow-up、去重/预算/截断、配置 reload 重新读取 enable 策略，以及命令/输出两侧脱敏；`backgroundNotice.test.ts` 6 项通过。 | 将函数型 enable 策略退化为构造时布尔值后，reload 用例实际失败。 |
| EDIT-01 | 稳定 group id、源基线、hunk indexes/content 与 add content 身份绑定、依赖组、同文件双 hunk 选集、重规划 revision 检查、显式 `selected`/`selectionRevision` 跨 CLI bridge、scope/policy/cache 绕过、无 picker 拒绝，以及 requested/selected/skipped receipt；`batch.test.ts` 45 项、CLI/approval 聚焦集 133 项通过。 | 移除 bridge 字段、恢复 turn/tool 单组 fallback、恢复 scope 自动回答或删除直接执行的重复/非法 ID 校验后，对应聚焦用例实际失败或拒绝。 |
| START-01（本地证据闭合） | build manifest 已绑定 lockfile、构建配置、编译器/标准库、全部 emit 字节、五个运行资产和受控 entry；`start.test` 覆盖 journal 恢复、活动/stale build lock fail-closed、恢复期间竞争者拒绝、越界/未登记入口、篡改产物与 launcher/package-main 回滚。`--version`/`--help` 现在由轻量入口在加载 runtime 图前处理；组合参数、坏配置准入与 fresh packaged gate 均已通过。 | stale lock 仍需人工确认后清理；本地 packaged gate 不等于新提交的 CI，精确 SHA CI 另行取证。 |
| START-02（本地证据闭合） | 10k catalog 首屏、持久 reentry 索引、0/100/1k/10k 不枚举探针；recovery hint 由实际 TUI `onFirstWrite`、line prompt write callback 或 non-TTY live first frame 启动；routing sink 与 transcript ownership 分离，line mode 保留 turn boundary 且 `/sessions` 仍走非交互 overview；用户键盘、鼠标、粘贴、picker 与 line 输入只推进一次 fence；teardown 在 sink 恢复前完成，失败路径不调用 `exit(0)`，cleanup 自身抛错或 logger 抛错也保证 sink 恢复；line prompt callback 与 stdout `error` 的异步失败均进入同一 rejection，不再静默挂起；真实 `GoalScheduler` drain 超时结算 captured host，line sink 在 goal dispatch 真正完成前保持 discard fence；MCP snapshot/refresh 在队列等待阶段即可取消，collaboration ticket/poll/propose 继承关闭 signal；`runCliProcess` 集成测试证明 fullscreen hint 经 transcript 且不直写 stdout；non-TTY live stream 现在把 first-frame/user-intent 接到同一 recovery lifecycle，取消 hint 时仍发布已发现的可读性诊断；Node/exe × regular/fullscreen seeded PTY 连续通过并匹配精确 current session。 | Linux/macOS TUI 与 Windows line/pipe 的平台矩阵已由 QA-02 `Platform QA` `39834842595` 覆盖；Windows 交互 PTY、真实 IME 与系统复制仍归 QA-02。 |
| START-03（性能证据闭合） | `bench:interactive` 分别记录 Node/exe × regular/fullscreen/line/pipe 的首字节、首帧/输入提示、TUI listener/layout/write 进程观察点、渲染字符键响应、批处理首答和命令退出；`bench:responsiveness` 记录 1000 项列表同步键路径及 math/table/diff 单次阻塞。`Performance` run `39817293051` 在同一 runner/fixture 上完成 warm/cold 各 30 样本，process 60/60 与 interactive 240/240 次 cache drop，保存 p50/p95、机器与构建摘要。 | responsiveness 仍是 Node 宿主同步模块探针，不覆盖完整键盘/输入路径或 exe-specific 行为；line/pipe 无 TUI listener 标记，null 不兑换 ready，进程采样 delay 不证明最初同步加载或单操作阻塞上界。 |

## W10

| 任务 | 证据 |
|---|---|
| QA-01 | 本矩阵 + `scripts/phase20-requirements.json` + 各反转测试；47 个规划 ID 与决策表逐项相等，complete 行必须无缺失证据、partial 行必须写明缺口；新增 `CTX-02 × TOOL-01` 实际 HTTP 集成，动态 schema 计入下一请求预算并零发送，三个保护点均有真实反转；但行存在不等于任务完成，剩余逐任务反转和跨任务组合仍按各行状态累积。 |
| QA-02 | Linux/macOS 各 Node/exe × regular/fullscreen/line/pipe 八格与 Windows Node/exe × line/pipe 四格均通过 `Platform QA` `39834842595`（completed/success）；20 个 JSON 已审计 pass/exit 0、平台/架构/target/mode 与完整 build identity，20 个 transcript 均有成功 bash/task/tool_search/tool_load/skill result、审批 resolution 和 `qa-skill-body`。TUI覆盖会话fork/切换/确认删除、panel关闭、任务、发现/search/load/skill、审批、settings保存和profile创建/切换/受控重启；line/pipe覆盖任务、发现、显式allow-once、settings保存、命名profile创建及重启读回；restore preview 全部支持格验证文件/记录/blob字节不变。 | Windows 交互 PTY、真实 IME、系统复制仍未闭合；settings面板不由非TTY伪造。 |
| QA-03 | `scripts/qa-quality.mjs` + `qa-quality-lib` + `qa-quality-manifest` + 正式 20 项 corpus 覆盖 pair 顺序、隔离 MCP/extension、跨进程续接、JSONL 边界、确定性/双盲分支、脱敏 candidate/private mapping、固定采样、revisioned artifact manifest、无 provider 的 resume 评分、build identity、policy zero-tolerance、四语言 tokenizer 与 10,000 次 bootstrap；dry-run 固定 `inconclusive`，fixture validation 20/20，100 个合成 pair 的 manifest revision 1→2 与 resume 只证明 harness 合同。真实模型执行、100 个真实 pair 与双盲评分仍未完成，mock 不替代。 |
| QA-04 | 本地门禁与精确提交；CI 以 run 结果为准 |

| PAN-08 help（部分） | `core/commands/help/report.ts`、`picker/help.ts`、原slash registry/print owner、`slashSuggestions.ts` | immutable安全report与共享rows；raw ID本地保留、安全name才能插draft；alias搜索/named独立、单current selection；原admission读前/通知前/apply/真实host发布检查；精确cwd/session及builtin root；选中后usage安全；12文件189项、strict TS/双构建、四格合成扩展PTY/八格smoke | metadata/name/alias/single/before/apply/current/subscription/notification/root/print/removed/hint共13项有效反转；取消/查看/草稿不改session/源文件，不执行script或模型、不新增command-output。原完整registry/配置读取无总资源界，live config不等于accepted snapshot；独立codeAPPROVE/architectureWATCH，原hint泄露已实际复现修复；其余picker/PAN-08/47项继续 |
