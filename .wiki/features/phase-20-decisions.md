---
title: "Phase 20 决策与任务规划"
category: article
sources: [repo-audit-2026-10-17, 23-input-surface-geometry.md, 24-slash-completion-defects.md, 25-model-configuration-and-relays.md, 26-compaction-trigger-design.md, 27-background-execution.md, 28-context-display-and-startup-budget.md, 29-startup-time.md, 30-panels-and-model-picker.md, 31-tui-capability-matrix.md, 32-defect-register-2026-10.md, 33-omp-panel-mapping.md, 34-panel-conversion-plan.md, 35-panel-inventory-full.md, 36-outstanding-work.md, 37-command-implementation-audit.md, phase-19-acceptance.md]
created: 2026-10-17
updated: 2026-10-17
tags: [features, phase-20, decisions, implementation-plan]
summary: "研究23–37复核后的统一规划。范围包括完整profile、overlay、路径设置、预设、账号池、动态工具发现默认开启、压缩/计量、后台提升、启动、面板与设置，以及Vim/数学/多行表格/并排diff/精确hunk审批。保留单一TS执行面与已有信任/事务/账本；本文不是实现或验收完成声明。"
confidence: high
---

# Phase 20 决策与任务规划

## 1. 范围与证据基线

本阶段改善日常交互，并把新纳入的配置、工具发现、渲染和授权能力做成可交付的产品路径。**CFG-01/02 已通过精确 SHA CI；CFG-03 的本地实现、CLI/PTY、Node floor 回归与独立复核已完成，正在提交与验证交付；CFG-04 正在定位操作级 consumer 与路径边界。** 当前 consumer 清单及合同见 [profile 身份与存储边界](profiles.md)和[显式配置输入](config-inputs.md)。任务表的验收是交付要求，不代表已经通过；提交、推送及 CI 结果以开发日志中的实际证据为准。

Cheers源码基线为`0d30d589ec9023ed24e0794c1215f70398bc418d`。本轮按`AGENTS.md`、[重构规则与现状](../refactor/plan.md)、[开发日志](../log.md)及[Phase 19收尾](phase-19-acceptance.md#27-阶段收尾与未完成项)定位后，复核全部23–37。历史01–22及Phase 19是能力与契约来源，不因本次规划重新开放已结束阶段。

参考采用本地只读源码的固定版本：oh-my-pi `c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4`、Codex `4210c08defe92fe8828f789b6f9fda287ad3709e`；pi的原研究快照`4a5d3729`与当前`8efd314fa`分别标记。参考工作树变动不自动改变旧证据。关键取舍、同意/分歧和反转要求见各研究文档及§8。

本规划的研究编制轮次未改产品、依赖、脚本、构建或真实配置，也未做真实provider调用。用户原有`.gitignore`、文档重排与其他既有变更保留。当前进入后续实现；package scripts/构建、provider/auth、持久化迁移及审批的修改范围已由本规划明确列出，仍须按实际变更验证。

## 2. 用户已裁决的产品方向

以下来自本会话2026-10-17的明确答复，以及本轮研究保存的先前裁决；不再重复提请用户确认。

| 编号 | 裁决 | 设计含义 |
|---|---|---|
| U-01 | 完整profile隔离、命名模型预设、多配置overlay、账号池全部纳入 | 四类均有正式任务、迁移与故障验收；不能缩成仅修选择器标签 |
| U-02 | 按路径作用域设置也纳入 | 追加匹配、来源、信任及请求快照契约，不能依赖可变全局cwd |
| U-03 | 动态工具发现默认开启 | 真实工具可发现、完整schema可加载、执行仍走原权限边界；质量验收是交付条件 |
| U-04 | 交互式命令默认60秒转后台；普通新消息可提前提升 | 同一进程与执行identity；非交互保持显式；取消仍停止 |
| U-05 | 后台完成默认UI通知，模型自动跟进显式开启 | 不能由完成通知默认制造收费请求；可选跟进仍受session/goal/预算准入 |
| U-06 | Vim、数学、多行表格、并排diff、逐hunk审批全部纳入 | 五项分别验收；显示diff不能代替精确选集授权 |
| U-07 | 增强`/plugin`，`/extensions`为同一命令/面板别名 | 复用已有extension runtime、安装状态和信任，不建第二套注册表 |
| U-08 | `npm start`采用校验新鲜度的构建产物，保留源码开发模式 | 缺失/过期明确提示build，不能默默运行旧代码；构建manifest纳入实现 |
| U-09 | 输入每侧留白1 cell、最多16正文行；面板全补、settings改造 | 16不含装饰，仍受实际屏幕预算限制；保留八形态和源文复制 |
| U-10 | P-06扩展现有`panel.ts`；theme入settings；不做`/omfg` | 不新造平行容器；已有theme候选/预览复用；保留`/report`原导出语义 |

后续若改变这些方向，需记录新裁决。纯算法、模块拆分、候选顺序、预算守卫、幂等和失效控制由实施者按本文件技术契约决定，不再把普通实现选择当方向阻塞。

## 3. 复核结论及计划影响

完整索引见[32复核登记](32-defect-register-2026-10.md)。以下错误已就地修订，不能再据旧结论增减任务。

| 被撤销或收窄的结论 | 当前证据与影响 |
|---|---|
| “51/51模型全禁用” | 普通model行只有`not connected`标签；真正要修的是可用性投影和精确connection选择，见[25](25-model-configuration-and-relays.md) |
| “API-key不写连接、没有JSONC/模型补丁/命名预设” | 这些能力已有；完整profile、profile预设库与账号池是扩展，不重复造系统 |
| “所有picker均8项、11行” | 上限在panel；resume的modal另有预算。真实availableRows由surface分配，见[30](30-panels-and-model-picker.md)、[34](34-panel-conversion-plan.md) |
| “7个补全缺口、只有3个手写hint会漂移” | theme/skill/tools已有动态目录；实际补4条路径，仍须验证语法与handler一致，见[24](24-slash-completion-defects.md) |
| “没有mid-turn压缩、没有后台owner和交付” | 后续step前检查、session-bound任务与UI notice已有；补首请求守卫、同进程提升及可选模型跟进 |
| “工具描述重复，删25%无风险；tokenizer应否决” | 参考描述策略曾读反；字符删除量不是无损总请求收益，tokenizer保留准确度研究，见[28](28-context-display-and-startup-budget.md) |
| “会话扫描优化确定节省880ms；一个调用点风险只涉及一文件” | HOME对照有混杂、共享renderer有多消费者；性能收益和行为影响必须另验 |
| “102命令STUB=0，真缺口只有plugin/marketplace” | 旧分类缺少可追溯名单且漏extension委托；现102主入口结构闭合，不等于动态完成，见[37](37-command-implementation-audit.md) |
| “17个新命令面板” | 去除误列report/theme/omfg并合并extensions；现有13入口补面板，加遗漏jobs为14，另增强plugin。完整清单见[35](35-panel-inventory-full.md) |

## 4. 技术决策与不变量

### 4.1 现有owner承担事实，界面只投影

保留TypeScript单语言、唯一`runtime/execution`执行面、原sandbox、工具schema校验、prepared capability及session锁/请求ledger。CLI负责端口组装，renderer不直接读写凭据、调用provider或启动进程。新模块遵守20个function-like names上限及短责任命名；不复制参考巨类或建立名为Phase20的产品模块。

首批取舍：在既有owner扩展，而非重写配置/provider/TUI；profile context是贯穿边界的显式身份，不是第二套runtime。字段安全合并、个人凭据来源与原兼容语法保留，迁移仅在明确的版本化操作中执行。

### 4.2 Profile、Overlay与路径作用域

profile在启动冻结id、canonical root及root identity，default保持旧目录兼容，named禁止回退default/legacy。按路径分类覆盖config/catalog/auth/session/ledger/trust/approval/jobs/extension/MCP/memory/log/artifact/cache；共享机器资源必须显式标注并带访问路由。切换受控重启，旧异步结果只回原profile。

普通值按“原project/user结果→显式overlay次序→env→override”解析；安全值仍按字段收紧，TUI保留专门优先级。显式overlay缺失或坏文档启动失败；reload保留上一accepted状态并报告失败/准入结果。来源记录精确到文件及rule，不能把effective整份写回用户文件。

路径规则首版采用canonical目录prefix及组件边界；项目规则相对声明workspace，个人/overlay相对路径需固定基准。同一合法来源的scalar按宽→窄、等价prefix声明顺序处理，层间仍保留source/trust顺序；列表依字段合并，安全限制只收紧。匹配不扩大workspace grants，不开放provider endpoint、credentials或账号池授权；预设引用仍需合法来源。

模型请求用session/子代理工作scope，命令用实际canonical cwd，文件用实际目标；多文件逐目标求策略，普通设置冲突拆分或拒绝。每操作捕获profile/session/workspace identity、config publication、trust/rule revision与scope path，await/重试/后台结果不换owner。root rebind和trust撤销使旧ticket失效，A→B→A也不可复用；不以热改cwd模拟隔离。完整字段登记、symlink/未存在目标和参考分歧见[25 §7.5](25-model-configuration-and-relays.md#75-按路径作用域设置)。通用null墓碑和格式改YAML不在本阶段，清除值采用已有unset/字段patch。

### 4.3 连接、预设与账号池

model、connect、status和实际request使用相同的脱敏可用性投影。configured、credential-present、pending/error、unsupported、measured-ready、unknown分开；仅打开选择器不发认证探针。选择绑定profile、connection、provider/model、effort及catalog/config revisions，沿现session事务提交，默认不改global。

已有session预设原位兼容；profile库新增明确提升/保存/删除，同名整项按合法owner遮盖，禁止跨层拼角色。应用前验证全部选定角色及consumer，单个角色或全套应用都进入一次精确session事务。

账号池限定profile/provider/协议/endpoint/OAuth受众，显式选择不回退池外。稳定credentialId+generation、session affinity、跨进程refresh lease及CAS、迟到失败按attempt归属。存储owner与refresh消费lineage分开：首版profile导入不复制live rotating OAuth，目标独立登录，不以复制文件生成第二份消费授权。refresh持久记录prepared/dispatched/rotated-persisted/unknown；服务端已旋转但响应丢失或本地未存时，lease过期不能授权重放旧token，除非provider证实可安全恢复，否则需重新登录。所有辅助请求继承父限制；unknown/部分流不轮换重播，账号切换不能清空session cap。服务端quota、本地估算、真实计费和累计budget分开。

### 4.4 计量、压缩与发现

共用请求快照：模型/协议、profile/连接、配置与工具generation、system/schema指纹、历史revision、usage覆盖消息范围。预算与状态栏区分estimated、provider-measured、stale、unknown；费用不能采用保守估计冒充真实结算。

预算owner对首个sampling、后续step、恢复/缩窗、schema加载、compact/overflow同样准入。输入输出共享窗口的协议要求`P + O + H <= W`，且满足独立input limit；P为完整请求，O为实际输出上限，H为安全余量。启发式无法证明真实token上界时明确保留估算/远端拒绝处理，不声称绝不overflow。

软策略默认总量；保留显式reserve/keepRecent覆盖，未显式覆盖时以90%作为初始软阈值候选并钳至本次可用输入预算，投产默认经小窗口和质量评测确认。body-after-prefix仅影响软提醒/触发，不扣掉硬预算的真实前缀。无合法切点、would-not-shrink、取消或摘要失败保留原历史；保留一次有界overflow救援。

摘要以非秘密logical operation绑定profile/session/workspace/branch、history revision、policy、摘要角色/模型/config publication、指令与切点plan digest；history/prefix/segment/merge各有稳定step ID并连接现attempt链。同操作并发合并，已完成step可校验复用；dispatched/unknown step恢复不自动重播。合法分段每真实send独立计量，不能承诺同revision只收费一次或远端恰好结算一次。最终摘要在session锁内CAS原history/branch/owner revision；迟到结果可记成本或保留可复用材料，不能覆盖新历史。

发现采用显式search/load元工具，复用完整工具schema与原execute映射；不新增`xd://`读文件即执行的权限捷径。默认pinned起点及真实ID见[28](28-context-display-and-startup-budget.md#动态发现默认开启的具体交接)，执行前仍重核；模式/权限不可见项在搜索建库前过滤。目录generation使loaded set、下次预算及prompt cache失效；MCP/插件同名必须稳定命名空间。恢复不把旧schema当作当前授权。

### 4.5 布局、输入与面板

surface统一给实际可用矩形，overlay内分配header/tabs/body/footer，0尺寸/窄窗有明确降级，不能把16行composer和全屏panel重复计入预算。panel支持任意内容容器、列表和按需两栏；保留modal兼容。两栏目标为model/resume/settings/tree及agents；jobs、hub按事实需要使用主从视图，不把参考所有overlay误称同种布局。

二维命中随帧/viewport重建，稳定id、row/column及source mapping一起输出；resize/过滤/异步刷新后旧命中失效。tab与焦点在overlay model，纯renderer不做副作用。长列表分页/虚拟窗口、有界缓存；不把全部session内容同步加载到首帧。

Slash候选只排除`kind=alias`，保留alias解析；`command`与`named`各自保留候选、语法和summary，`/reload-plugins`、`/recall`、`/retain`等named入口不折叠为owner主命令。新query回最佳匹配并清除旧显式选择，异步同snapshot更新按稳定id处理。Enter仍区分未完成词/显式选择/完整命令，Tab只补草稿。CommandSyntax作为唯一语法事实，生成简洁位置usage、完整help和动作补全，不建第二份subcommands。

settings沿现7组起步做tab/有序分区和跨tab搜索。选项有稳定值、label/detail；数值/列表/对象用适当编辑器，不强行枚举化。warning/condition为展示层类型化元数据，拒绝/存储的值不被隐藏；Effective/Accepted/Stored、scope、trust、restart、pending和save unknown始终可查。预览租约可撤销、不写盘、不中途升级为Applied。

### 4.6 新渲染、Vim与精确Hunk授权

当前composer有源单元映射，transcript选择仍取渲染文本；数学/表格/diff要先补transcript语义源范围，保留raw revision、soft/logical break和装饰区，不能从Unicode/框线反推原文。

Vim使用独立有界状态机，调用现EditorBuffer修改和undo，覆盖Insert/Normal/Visual/Visual-Line/Replace；paste与IME先走文字通道，焦点给pager/overlay/question时不消费composer模式键。Normal/Visual的Enter不意外提交；显式submit action可提交。不执行`:!`、脚本或外部宏。

数学先tokenize再Markdown escape/emphasis；行内Unicode、显示公式二维布局，未知/超限保留原文；不运行TeX/shell/网络/宏。多行表格指单元格折行和显式换行，正确解析escaped/code pipe；按cell最大行高对齐，窄屏完整降级。两者与HTML/export共享语义token并严格限制字节/嵌套/面积/缓存。

Diff建立file/hunk/old-new行源模型后输出unified/side-by-side，显示按实际宽度退化，字节和行数双预算，完整查看仍有界。Codex所读快照是unified与整request审批，**未证明它已有并排或逐hunk授权范例**；这两项是Cheers自身设计。

Hunk以基线内容/身份、稳定ID、上下文和结构依赖标识；rename/add/delete/overlap/EOF约束组成显式组，不能静默附带未选hunk。选择后重新构造精确子集plan及完整preview，再准入、签发一次性capability并锁内stale-read。任何选集/内容/revision改变使旧批准失效；不能从UI diff文本生成权威补丁。请求/选中/实际应用/跳过及partial/unknown分别入receipt；不承诺跨文件崩溃原子性或自动理解业务依赖。

### 4.7 后台与启动

前景执行先捕获可提升handle，同一spawn/operation、sandbox、输出sink、timeout和settlement只有一份。60秒仅释放等待，不重启命令；新消息提升不吞掉消息，cancel停止。当前缺省前景timeout也为60秒，自动路径在dispatch前采用明示的有界总deadline（初始沿后台300秒），显式timeout原样保留；帮助/schema/审批显示真实值。终端交互任务不悄然丢失PTY。

容量满时在spawn前明确回退前景或拒绝；不能spawn后失去owner。提升/完成/取消竞争只发布一次；权限/配置/profile/session/root/goal失效保留真实停止或unknown。宿主退出按现registry清理，不承诺跨Cheers退出存活；重启恢复journal事实，未知副作用不重放。可选模型跟进空闲批量投递、delivery去重并入统一请求账本。

启动分launch解析→最小首帧→runtime ready；loading首帧不能宣称可执行，输入排队有界且ready前零派发。建议性reentry异步且可取消，不覆盖用户已选择/已输入的新会话；显式resume与原fallback消费者保持一致。`Promise.resolve(syncScan)`不等于搬离事件循环，需真正有界异步I/O/索引和generation fencing。

构建manifest绑定影响产物的源/配置/依赖锁/编译器与构建模式digest，以及最终入口、executable和运行资产的字节digest。产物集在staging完成后才发布同一buildID的不可变目录及一次原子入口指针；失败不发布半套文件。`start`同时检查输入新鲜度和实际产物完整性，捕获并使用同一buildID，避免检查后被另一次构建原地替换；mtime不够。缺失/过期/截断/错配产物均拒绝并提示build，开发入口仍走源码；不默认postinstall下载/构建或静默fallback。Node与executable分别测首字节/首帧/可接收输入/ready，不能用`--version`时间代替交互启动。

## 5. 分批任务与依赖

以下10批共47个唯一ID，是可独立验收的交付单元，文件拆分仍服从owner。表内路径均相对`packages/ts-shell/src/`；拟新增目录是计划位置，现有源码链接在对应研究与§7。先定义契约和反例，再实现；同owner任务可合成一个可审查变更，但各自证据不能互相替代。

### W1 身份与配置基础

| ID | 交付与owner | 依赖与关键验收 |
|---|---|---|
| CFG-01 | profile context、全路径consumer清单与命名空间；`core/paths/`及各域 | default兼容；A/B同名session/connection在同workspace互不可见；legacy回退/项目可变memory/共享路由不能旁路；迟到任务只写旧root |
| CFG-02 | profile创建、显式导入/迁移、受控切换与恢复；`config/`、`session/store/` | CFG-01；中断导入可重入、源不丢、冲突不覆盖；live rotating OAuth不复制、目标需独立登录；坏name/symlink/root identity拒绝；未知结果不报完成 |
| CFG-03 | ordered overlays、source权限与完整reload；`config/layers.ts`、`provenance/`及CLI参数 | CFG-01；重复/相对路径次序确定；显式缺文件硬失败；坏reload不发布混合快照；overlay不解除deny或扩大allowlist |
| CFG-04 | 路径规则与不可变scope解析；拟增`config/scope/`，复用workspace/信任owner | CFG-03；按25 §7.5逐字段登记；组件边界/..cache/symlink/Windows/未存在目标；同cwd不同profile、交错await、A→B→A及trust撤销；空集零授权、跨scope逐目标，零provider/secret覆盖 |
| CFG-05 | 按字段env声明与来源说明；`config/fields.ts`、`layers.ts` | CFG-03/04；首批迁入maxTurns并为本阶段新设置声明来源/应用时点；非法/空/超界、env优先级与redaction；无consumer不新增字段 |

### W2 精确连接、预设与账号池

| ID | 交付与owner | 依赖与关键验收 |
|---|---|---|
| PRV-01 | 共享脱敏可用性投影、connection/model/effort精确选择；provider、models、session/model | CFG-01；legacy/env-only、pending/error、同provider两relay、无模型占位；显示与真实目标一致，失败不半更新，不因打开UI发网络 |
| PRV-02 | session预设兼容、profile预设库及角色应用；`core/commands/model/`、`session/model/` | CFG-03/04、PRV-01；同名整项遮盖；删除反馈真实；每个角色有consumer；跨connection session事务，无默认global写入 |
| PRV-03 | 显式账号池、稳定credential identity、受众/限制与亲和性；auth/account/pool | CFG-01/03/04、PRV-01；空池零发送；子请求不扩大；同provider两origin不混key/OAuth；重登录/删除使旧pin失效 |
| PRV-04 | refresh消费lineage、跨进程lease、持久阶段及CAS/fencing；account state、request authorization | PRV-03、CFG-02；健康并发互斥；旋转后响应丢失/保存前退出/lease接管保持unknown且不重播；profile复制不产生新授权；迟到响应不覆盖新generation，取消与条件保存分开 |
| PRV-05 | 全请求账号归属、quota/退避与统一ledger；provider/request、core/agent/request | PRV-03/04；主/摘要/advisor/subagent/title/cache全覆盖；A迟到429不禁B；unknown/部分流不重播；轮换不重置cap，每真实send独立attempt |

### W3 请求预算与默认动态发现

| ID | 交付与owner | 依赖与关键验收 |
|---|---|---|
| CTX-01 | 同身份完整请求计量、有效usage范围与失效；`context/request/`、telemetry、turn | CFG-01、PRV-01；最新assistant/tool args不漏算；cache不重复；model/schema/history变化使旧量失效；bytes不冒充token |
| CTX-02 | 首请求/后续step/缩窗/加载的统一预算与软触发；session/compaction、turn | CTX-01；等号/小窗口/超界reserve/output/前缀scope均有反例；无合法请求不盲发；估算限制清楚 |
| CTX-03 | 摘要预算、logical operation/step、分段/合并及overflow；现compaction owner | CTX-02、PRV-05；同operation/step不自动重复派发，合法分段各自计量；manual/auto竞争及分段unknown后重启；新增turn/换branch/改指令拒绝旧提交；would-not-shrink/取消不覆盖，tool配对及有界救援保留 |
| CTX-04 | 首轮估算、当前/上次请求与分类报告；sessionFacts/context报告 | CTX-01；unknown/estimated/measured/stale四态；分类同snapshot；计量不触发隐藏读网；首次/重启/缺usage/恢复一致 |
| TOOL-01 | discovery/search/load、pinned与完整schema、generation原子发布；工具registry/turn adapter | CFG-01、CTX-01/02；默认开启；发现前可见性过滤、schema撤销、MCP同名/断连、旧generation零执行；最终调用仍走原prepared权限 |
| TOOL-02 | 描述精简、tokenizer校准与质量/缓存评测；prompt/schema/context owner | TOOL-01；同模型/任务/工具权限比较总请求及发现额外成本；关键参数质量不退化；tokenizer/未知模型/多语言有误差报告，不宣称恒上界 |

### W4 布局与交互公共前置

| ID | 交付与owner | 依赖与关键验收 |
|---|---|---|
| UI-01 | padding1、16正文行、实际viewport；composer/frame/layout/projection | 原八形态；24/40/60/80行和极窄屏不越界；IME尾/emoji/caret/选区源文保持；装饰不吃正文目标但总高受屏幕钳制 |
| UI-02 | P-01/P-02/P-06预算容器与二维命中；panel/modal/overlay/surface | UI-01；只在传入矩形内渲染，0/小容量降级；两栏窄屏退化且焦点保留；resize后旧hit无效；兼容现modal |
| UI-03 | tabs/chips/统一行/搜索/滚动及有界进度投影；options/panel/overlay model | UI-02；loading/empty/error/unavailable分开；已知分母与indeterminate/unknown不混报；过滤及异步更新稳定id；关闭/换session卸载watcher与preview；鼠标键盘等价 |
| UI-04 | transcript语义源投影与选区；transcript/selection/layout | UI-02；数学/表格/diff的原文与装饰分开；stream/resize后revision规则；复制无框线/soft-wrap，逻辑换行不丢 |

### W5 Slash与Settings闭环

| ID | 交付与owner | 依赖与关键验收 |
|---|---|---|
| CMD-01 | command/named候选显示、alias兼容、查询/焦点/Enter状态；slash/completion/keymap | UI-03；只隐藏kind=alias，named语法/summary不折叠；/m→/model最优；alias执行及alias参数继续可用；取消/迟到目录/stale草稿不替换原文；完整词不误执行旧选择 |
| CMD-02 | CommandSyntax投影usage/help/动作、4条补全路径及102入口契约审计 | CMD-01；continue目录和usage/git/wt动作有正负例；theme/skill/tools保持现动态能力；hint长度不作终端宽度；handler拒绝未知参数 |
| SET-01 | typed choices、候选说明、数值/列表/对象编辑器与动态目录 | CFG-05、UI-03；32路径逐项指定编辑器；unknown/obsolete值保留；hidden prefixes可自由表达；不能拿可见工具当disabled工具全集 |
| SET-02 | 7组tabs、分区、跨tab fuzzy、changed/source渲染；settings picker | SET-01；查询排序稳定、tab回跳/空态；stored/accepted/effective/trust不被dirty颜色代替 |
| SET-03 | theme/composer/status预览、scope/保存/应用；settings及preview owner | SET-02、CFG-03/04；preview lease移焦/关闭/外部更新可撤销；Apply前不写；CAS/写后确认/unknown与restart全部保留 |

### W6 现有及缺失的面板消费者

| ID | 交付与owner | 依赖与关键验收 |
|---|---|---|
| PAN-01 | model两栏、连接/role/预设与搜索 | UI-03、PRV-01/02/03；同名model不同relay可区分；不可用给原因；选择绑定revision，不按label推身份 |
| PAN-02 | resume时间分组/目录搜索/分页/预览/置顶与tree真实树形 | UI-03、CFG-01/02；当前workspace默认、完整授权目录搜索，partial/complete与未找到分开；10000会话后页目标可达；query/scope generation及取消不回填；current聚焦、分叉/恢复/删除确认 |
| PAN-03 | jobs、hub、agents的实时主从视图 | UI-03、JOB-01/02；单一job/agent owner，输出分页/脱敏；关闭不取消或写对话；cancel/action另准入；unknown不变success |
| PAN-04 | usage/dashboard、quota进度投影及thinking选择 | UI-03、PRV-05、CTX-04；本地费用/远端quota分开、fetchedAt；已知/未知分母与纯文本降级；effort/model联合约束，unknown非0，unsupported不可兑换 |
| PAN-05 | advisor、plan-review、btw的结构化/流式面板 | UI-03、CTX-01；绑定原会话/checkpoint/revision；只读查看不启模型；启用/重试/应用分别授权；旧流不串新面板 |
| PAN-06 | history/copy/pin/cleanse及back/undo/restore改造 | UI-03/04、PAN-02；history保留完整持久树/分支；copy超recent30可继续分页，源block/revision及到头/失败/取消保真；back仅分支/草稿、undo精确receipt补偿、restore只产preview draft；pin同元数据，cleanse零隐式删除 |
| PAN-07 | login/logout、debug及plugin/extensions管理 | UI-03、CFG-01、PRV-03；复用connect/extension真runtime；设备码/URL安全显示，取消登录不假成功；卸载/注销/启用逐项确认；别名同状态 |
| PAN-08 | 通用report、help/tools/skill/context/cost及其他既有picker统一 | UI-03、CTX-04、CMD-02；复用CommandReport；`/report`继续zip导出，theme在settings、omfg不做；reports只读不造模型消息；mcp向导逐步确认、阶段进度只投影真实状态 |

具体14个有效补面板入口与已有picker映射在[35](35-panel-inventory-full.md)，不得用这里的任务包数当面板数量。`/extensions`为`/plugin`别名，不另计一个实现；`/pin`作为原pin动作的薄入口，沿同一语法与权限，而不是平行持久状态。19个现有picker在§5.2逐名归口，不能只验证model就称全部面板完成。

### W7 新输入、渲染与Hunk审批

| ID | 交付与owner | 依赖与关键验收 |
|---|---|---|
| INPUT-01 | 五模式Vim、计数/operator/文本对象及undo；editor/modal+现buffer | UI-01/03；paste dd不执行删除；IME/字素/长粘贴placeholder/Visual源选区/外编返回；高计数有界；模式不吞approval键 |
| RENDER-01 | math语义token、inline/display布局及export | UI-04；金额/代码/escape优先、未知保原文、nested/矩阵超限可读降级；源LaTeX复制；逐字stream不阻塞 |
| RENDER-02 | 多行cell、ANSI/OSC8整体折行与export | UI-04；escaped/code pipe、br、CJK、跨newline/soft-wrap的cell链接与样式边界、长尾不截丢；复用并回归现text carry/行末关闭，不称全局缺失；窄屏/超限可看原文，report字段不丢 |
| RENDER-03 | 并排diff、unified降级及有界完整查看 | UI-04；old/new行号、rename/BOM/EOL/EOF事实、替换行数不齐；resize与左右源复制；bytes/rows双上限 |
| EDIT-01 | 结构化hunk选集/依赖plan与精确审批；edit/patch、preparation、approval | RENDER-03、UI-03；选集/内容/基线改变即撤销旧capability；依赖不偷加；重放/取消/跨session/部分写/补偿unknown均保真，headless缺选集不默认写 |

### W8 同进程后台提升与结果交付

| ID | 交付与owner | 依赖与关键验收 |
|---|---|---|
| JOB-01 | foreground-backed handle、60秒/新消息提升与生命周期；execution+现jobs | CFG-01、CTX-01；spawn一次/PID连续；deadline独立；finish/promote/cancel竞争唯一；容量满零孤儿；撤权/关机/清理unknown保留 |
| JOB-02 | UI通知、可选模型follow-up、journal及恢复；jobs/inputQueue/goal | JOB-01、PRV-05；默认零模型请求，opt-in有epoch/去重/预算；原session交付、不自动写新prompt；重启不重播未知进程，cancel不转后台 |

### W9 启动与交互响应

| ID | 交付与owner | 依赖与关键验收 |
|---|---|---|
| START-01 | launch早路、lazy runtime、输入/产物manifest和新start/dev；bootstrap及scripts | CFG-01/03；version/help不加载无关运行图；坏配置相关准入仍生效；缺/旧/截断/错配产物拒绝；失败构建不发布，验证后使用同buildID；Node floor保持 |
| START-02 | 首帧后reentry、session摘要索引、渐进取消加载 | CFG-01/02、UI-03；0/100/1000/10000会话，启动首帧不随历史内容扫描增长；显式resume/fallback不变，用户选会话后旧结果不覆盖 |
| START-03 | phase timings、事件循环与真实ready基准 | START-01/02、UI-01/03；同机器同fixture冷/热分别≥30次，p50/p95；Node/exe/regular/fullscreen/pipe独立；首帧、键响应和ready不混报 |

### W10 综合验收与交付

| ID | 交付 | 依赖与关键验收 |
|---|---|---|
| QA-01 | 全任务契约矩阵、关键反转和故障注入 | 各批；精准绑定源码/fixture，撤销保护必失败；不能写镜像实现或仅字段存在测试充数 |
| QA-02 | 合成provider实际CLI/PTY及平台矩阵 | 集成任务；两构建、regular/fullscreen/line/pipe；profile切换/任务/发现/审批/保存端到端；Windows/macOS/IME/系统复制按实际环境标记，缺环境不算通过 |
| QA-03 | 动态发现/摘要/渲染质量及启动性能评估 | TOOL-02、CTX-03、INPUT/RENDER、START-03；§6预注册指标和任务集；安全回归零容忍，真实质量缺证据不以mock替代 |
| QA-04 | 结构门禁、独立复核、文档与交付状态 | 全任务；引用、cycles、unresolved specifiers、function ceiling及config消费者；本地/提交/推送/CI/发布分离，精确SHA证据可读回 |

### 5.1 顺序与并行约束

先W1的profile/配置身份与W4的几何/容器两个独立基础，再W2/W3和W5；真正面板消费者在其事实端口和公共原语都到位后施工。W7的源投影先于math/table/diff，完整hunk plan先于新批准。W8可先定义handle但集成要等profile/账本；W9先固化测量边界，最终测量包含新profile/overlay成本。W10随各批累积、末尾做组合验收。

不得“先做model依赖两栏，下一批才建两栏”，也不得用placeholder数据先宣称面板可用。相关任务可以成组PR（配置/请求身份，预算/发现，TUI基础，settings/slash，面板族，渲染/审批，后台，启动，验收）；不按每份研究机械拆15个PR。共享owner同一时刻只有一个编辑责任人。

### 5.2 全部19个现有picker的消费归口

本表按[picker registry](../../packages/ts-shell/src/cli/interactive/picker/registry.ts#L70)逐名列出，不混入文本命令或拟新增面板；每项都须有现有动作及失败/取消回归。

| 现有picker | 任务归口与必须保留的行为 |
|---|---|
| help、tools、skill | PAN-08、CMD-02；结构化只读投影、选择技能的现语义及权限可见性，不由打开列表产生执行 |
| model | PAN-01、PRV-01/02；精确connection/model/effort和原子session事务 |
| resume、tree、fork | PAN-02；完整授权目录/树、当前会话聚焦、显式分叉及分页generation |
| copy | PAN-06、UI-04；源block/revision、多页完整可达，不只包装recent30 |
| back、undo、restore | PAN-06、QA-01/02；[back](../../packages/ts-shell/src/cli/interactive/picker/rewind.ts#L16)只移动对话分支并恢复草稿、不改文件；[undo](../../packages/ts-shell/src/cli/interactive/picker/undo.ts#L27)沿精确receipt补偿；[restore](../../packages/ts-shell/src/cli/interactive/picker/restore.ts#L17)选择只生成preview draft，不能变成文件写批准 |
| mcp | PAN-08、UI-03；原gateway刷新、分步向导、明确提交/取消；阶段条投影实际状态 |
| connect、plugin、marketplace | PAN-07、PRV；复用真实连接/extension runtime与写入/执行授权，不靠legacy回退重建能力 |
| permissions | UI-03、QA-01/02；现grant/revoke与安全即时失效；关闭面板不能升级权限 |
| statusline、settings | SET-01…03；status预览正确接线、scope与CAS保存，未保存/未生效状态保留 |
| git | RENDER-03及Git owner回归；[现stage/unstage hunk动作](../../packages/ts-shell/src/cli/interactive/picker/git.ts#L44)保留index fingerprint/operation plan审批。EDIT-01新增的是edit/patch选集，两种authority不互认 |

resume搜索默认查询完整授权目录，可渐进返回并标partial/complete，只有complete无匹配才能说未找到。取消或query/scope变化不回填旧页；后续页、错误重试和到头状态可见，10000会话中后页目标仍可找到。copy同样支持继续分页及有界完整block下钻，分页cursor绑定源revision，不能把截断当完成。

## 6. 验收方法与量化目标

本节要求后续实现执行；本次Markdown修订不运行build/产品测试。

1. **正确性与资源界。** 每交付项至少一个真实成功路径、一个拒绝/取消路径和一个失效/竞态反例。锁/CAS、请求预算、一次性审批、profile隔离及unknown必须各有反转失败证据。上限在实现前写入契约：列表/输出/缓存、公式深度/面积、表格列/行、Vim计数、diff字节、任务/交付队列；不得由随机机器上“没卡住”替代。
2. **输入与布局。** 终端尺寸至少20/40/80/120/200列×8/24/40/80行，覆盖组合字符/ZWJ/宽字/粘贴/stream。每帧宽高不超传入矩形、caret在正文边界、命中只落当前稳定ID、关闭撤销预览；系统IME/原生鼠标复制另需实际平台证明。
3. **请求与账号。** 合成wire覆盖API-key/OAuth、同provider两relay、迟到429、refresh竞争、断流/缺usage、全部辅助purpose、限制空集、quota unknown及cap耗尽。未知send零自动重播；换账号不减累计预留；显示脱敏与实际endpoint/credentialId一致。
4. **动态发现质量。** 使用预注册成对任务集，覆盖本地读改、多步骤委派、浏览/检索、LSP、MCP/插件、权限拒绝、恢复与未知工具需求。同模型/协议/版本/权限/初始状态对比全量和动态默认；记录任务成功、漏发现、参数错误、违规、轮次、latency、总输入输出和cache hit。安全违规不得增加；成功率差的成对95%置信区间下界须≥−5个百分点，样本不足继续采集，不以单个成功示例通过。成本/延迟报告总量及分位数，发现额外请求全部计入。未有真实质量环境时保持未验，不改变用户默认方向来规避验收。
5. **性能。** START-03先固定fixture、机器、计时点及构建digest，冷/热分开≥30次，保留原始样本和分位数不确定性。候选工程目标为：首帧p95改善≥30%、ready不回退，100→10000会话首帧p95增量≤100ms，1000项列表键响应p95≤50ms，复杂流式math/table/diff单次事件循环阻塞≤100ms。这些数值尚无本轮同条件基线支持，不能当作已证明收益或既定完成承诺；在优化实现前根据基线/测量噪声校准并冻结可解释目标，后续变更记录证据和理由，不靠改计时点/fixture制造通过。首帧不读取全部历史正文、解析/绘制/队列有界和超限可读降级是必须满足的结构约束。
6. **验证入口。** 实现按owner先跑聚焦Vitest和需要的`build:ts`；权限/result变化加`verify:result-contract`、写入变化加workspace/write gate。包脚本变化加`test:scripts`；每批静态`verify:import-cycles`、`check:config-consumers`、`check:declarations`、`check:node-floor`、`verify:docs-drift:strict`；结构变化加NormProof，未解析import为阻断，函数上限虽advisory仍必须遵守。最终跨域集成运行`test:ts`和两种构建，不重复全套替代已充分的聚焦证据。
7. **交付。** 保留失败分类、实际命令/退出码、源码/构建绑定、基线与反转恢复、PTY transcript及独立复核意见。不可用reviewer不算批准；真实provider只用既有显式opt-in gate并保留隔离/脱敏，本规划不授权手工读取真实材料。CI账单限制若仍在，写未启动及精确SHA，不声称通过或发布。

## 7. 23–37全部议题的去向

同文档内重复ID必须以“文档/分节/ID”引用；下表覆盖原任务、待定表与推翻项，防止合并后静默漏任务。历史纯证据/计数核验不另造产品模块。

| 文档与原ID | 本阶段去向 |
|---|---|
| 23 G-01…05 | UI-01；1 cell/16正文落实，装饰/viewport技术裁定 |
| 24 S-01…06、参数附录P-01…05、D-01…06、ADD/FIX行 | CMD-01/02；复用CommandSyntax，保留兼容语法；ghost提示由现usage层承载，不增第二输入缓冲或顶层命令族 |
| 25 主文C、模型附录C、配置F及账号池 | CFG-01…05、PRV-01…05；四扩展及pathScoped已纳入；JSONC/稀疏补丁/session命名预设为已有资产；墓碑/YAML不引入 |
| 26 M-01…09、K-01…06 | CTX-01…04；首请求/硬预算、软阈值、scope、提醒、模型/角色覆盖、UI预览和max策略分别落实；复用已有mid-turn，不另造循环 |
| 27 B-01…07 | JOB-01/02、PRV-05、CFG-05；60秒/新消息/显式跟进已决；PTY、容量、deadline和Node floor技术合同 |
| 28 T-01…06、G-01…05、X-01…03 | CTX-01/04、TOOL-01/02；动态默认开启；恢复tokenizer研究，描述与schema减量不代替质量 |
| 29 正文P/S、深挖S/T、实机S，稳定START-01…06 | START-01…03、PAN-02、CFG-01；session索引/渐进加载/lazy import/build新鲜度/测量边界全归入 |
| 30 主文P-01…06、SE-01/01b…06、J-01…05 | UI-02/03、PRV-01、PAN-01、SET-01…03；choices多处消费、既有theme及19通用JSON路径按真实编辑器处理 |
| 31 正文D-01…05、附录D-01…07 | UI-02/03/04、PAN-02、INPUT-01、RENDER-01…03、EDIT-01；tree/form按真实consumer实现，wrap缓存以benchmark驱动 |
| 31 附录Markdown差距#3、进度§3.4；33 J-04/J-09 | RENDER-02补多行cell的OSC8集成，现text carry/行末关闭回归；UI-03/PAN-04及PAN-08的真实quota/向导consumer采用有界进度与unknown文本降级，不复制参考原生node系统 |
| 31 附录Markdown差距#4、编辑器#3/#4 | Gemini孤立围栏自动修复未有Cheers复现且会改变源码解释，本阶段保留原文/正常未闭合围栏，待fixture证明再立项；文本续写ghost与拼写自动纠正未列为任务，不从参考差异推导新隐式请求/字典/改字契约。24的usage ghost仍由CMD-02覆盖，二者不能混同 |
| 32 N-01…05、审计R-01…05、A-01…03 | 本次就地复核并归上述任务；01–22仅在被依赖契约处查验，不从旧缺口表推导第二个全集 |
| 33 主文M、框架C/F、模型M/D、会话S/R、任务J/W | UI-02/03、PAN-01…08、SET/CMD、JOB及START；resume搜索/时间分组/预览与树、copy下钻、MCP向导、jobs提示均有consumer |
| 34 P-01…05、Q-01…08、A-01…04 | UI-02/03及全部PAN；已纠正原语依赖顺序与二维命中验收，不以参考是否HubFrame决定本仓范围 |
| 35 N/H/T/SE、原17面板规格 | PAN-01…08、SET与PRV；有效范围见该文表；T-01/02主题机制已存在，作为复用/回归；不新增omfg或冒用report |
| 36 未完成汇总 | 本文件与其索引互链；不保留约60/67行“待裁决”假阻塞；产品方向已逐项答复 |
| 37 全102主入口与23宿主端口 | CMD-02、PAN/QA；可追溯入口/端口/运行路径/动态证据四层，不能用结构覆盖率宣布全部功能完成 |

### 7.1 未编号参考能力的明确处置

这些是能力对照或优化线索，不自动等于新增产品任务；这里补齐去向，避免只映射D-ID而漏掉实际论点。

| 研究能力 | 本阶段处置与原因 |
|---|---|
| 31/report列priority收缩 | 保留字段完整堆叠降级；不另加列收缩算法，先保证窄屏无字段丢失 |
| 31/任意组件Disclosure | 回归现thought/tool折叠；真实PAN consumer需要时在UI-03提炼包装，不承诺复制参考通用wrapper |
| 31/ScrollView、revealRange及滚动键 | UI-03落实焦点项可见、可访问分页及键位域，复用现scroll owner，不造第二套滚动状态 |
| 31/稳定前缀、尾缓存、流式高亮及wrap cache | QA-03和START-03按基准决定缓存优化；保留现transcript工作量不变量，key覆盖source revision/几何，不因参考层数多就复制 |
| 31/一般OSC8与Markdown链接 | 回归现escape carry/行末关闭；本期不自动新增Markdown OSC8生成/URL规范化，保留label与可读URL，未复现不称全局缺失 |
| 31/全量CommonMark/GFM、平衡删除线、caret提及 | 记为参考观察；本期扩已决math/table/diff，不把差异表扩大成解析器整体替换或新提及协议 |

源码证据入口：[provider resolver](../../packages/ts-shell/src/core/shell/providerCredentials.ts#L49)、[model preset](../../packages/ts-shell/src/core/commands/model/preset.ts#L37)、[config persistence](../../packages/ts-shell/src/config/persistence.ts#L35)、[request ledger](../../packages/ts-shell/src/core/agent/request/ledger.ts#L70)、[prepared tool capability](../../packages/ts-shell/src/tools/preparation.ts#L12)、[patch plan](../../packages/ts-shell/src/edit/patch/plan.ts#L17)、[composer contract](../../packages/ts-shell/src/presentation/tui/composer/contract.ts#L10)、[transcript selection](../../packages/ts-shell/src/presentation/tui/transcript/selection.ts#L55)、[jobs host](../../packages/ts-shell/src/cli/runtime/jobs.ts#L29)。

## 8. 关键参考决定、替代方案与风险

| 决定 | 采用/分歧、替代方案与原因 | 风险与反转验收 |
|---|---|---|
| 扩展现owner与事务 | 选择显式profile context+现writer/ledger；拒绝热改HOME、迁移所有数据再修UI或平行runtime，这些会扩大身份/并发风险 | 漏consumer造成串profile；逐类盘点+同名A/B+迟到结果反转 |
| 多overlay保留字段安全合并 | 同意参考有序加载/显式坏文件失败；不同于通用deep merge | 来源洗白/解除deny；overlay来源与安全合并反转 |
| 账号池受众与实际attempt归属 | 同意参考cascade restricted、rotation credentialId、refresh lease；拒绝provider名轮询与unknown重试 | 凭据泄漏/重复计费；relay错配、迟到429与token竞争反转 |
| 一次session预设提交 | 同意参考同名整项owner；不同于先写global再live switch，避免默认污染其他session | 半套角色和不可恢复global修改；中途失败与并发修改反转 |
| 默认动态发现 | 用户选默认开启；可替代的全量默认未采用；保留完整模式用于故障诊断与成对评测 | 工具丢失/少schema却更贵；generation撤销与真实任务非劣门 |
| 统一预算与soft policy | 参考9/10、buffer、body scope只作软策略；拒绝从UI数字或cache hit推硬适配 | 重复摘要/真实overflow；首请求、latest assistant及摘要预算反转 |
| 容器与二维命中 | 扩展panel+原modal；拒绝复制HubFrame巨类或用调用点数判低风险 | 焦点/点击越界、listener泄漏；小窗口/旧hit/关闭反转 |
| Vim/Markdown显示与源文分离 | 同意参考纯Vim状态机、paste优先、math优先token、整体cell wrap；分歧是未知LaTeX保原文与更严格资源界 | 丢原文/执行输入；dd粘贴、escape顺序与面积超限反转 |
| 并排diff与hunk选集 | Codex实际参考只有unified、双预算、整request审批；采用预算与“显示和批准一致”，自主设计选集plan | 视觉批准扩大权限；选集/内容/依赖/基线变更和二次消费反转 |
| 同进程后台提升 | 同意参考foreground等待与command deadline分离；保留现jobs owner | 双spawn、cancel变running、deadline丢失；一次副作用与竞态反转 |
| 最小首帧和artifact新鲜度 | 同意参考启动lazy边界；不以loading冒充ready或用mtime当完整新鲜 | 首帧快但输入挂住、旧build运行；ready前零派发/旧digest拒绝 |

更细固定版本链接和比较位于[25配置扩展](25-model-configuration-and-relays.md#7-已纳入的四类配置扩展)、[26](26-compaction-trigger-design.md)、[27](27-background-execution.md)、[28](28-context-display-and-startup-budget.md)、[29](29-startup-time.md)、[31](31-tui-capability-matrix.md)、[33](33-omp-panel-mapping.md)。没有用文件大小、声明计数或参考源码存在证明本仓生产质量。

## 9. Phase 19保留边界与本阶段完成定义

A01非Linux实际对象绑定、A03真实环境/质量、A13真实账户及可信远端结算、A12远端CI、A25整树一致性/成本/未知拒绝继续按[Phase 19验收§27](phase-19-acceptance.md#27-阶段收尾与未完成项)记录。A01是实现缺口，不能写成只差一台机器跑测试；A12所记账单状态是历史证据，后续须读回当前job。本阶段触及的平台/账户能力需取得自己的适用证据，不能用保留项豁免新实现的验收。

Phase 20完成需要：表内所有交付单元及§7全部来源都有可追溯结果；新默认/输入/账号/发现/授权合同有成功、拒绝、竞态和恢复证据；适用平台及真实质量格完成或由用户明确决定阶段保留。失败、blocked、unverified和unknown均不能升级为success。文档已修、代码已提交、已推送、CI已运行、发布是独立事实，不互相替代。

本规划编制时的交付仅为研究修订；当前实施状态见§1及[开发日志](../log.md)。各任务仍按本表依次交付，不以规划和研究完成代替产品验收。
