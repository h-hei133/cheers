---
title: "日常交互问题逐项核查"
category: article
created: 2026-10-25
updated: 2026-10-26
tags: [features, interaction, investigation]
summary: "结合用户补充观察定位 resume 渐进加载焦点、model 禁用行导航、启动首帧和上下文计量差异，记录面板对齐方向。"
confidence: mixed
---

# 日常交互问题逐项核查

初次定位确认：**resume 的渐进目录更新保留最初自动选中的旧会话；用户观察model上下键没有任何可见交互，仅一个模型配置、其余候选禁用是可能的原因；当时fullscreen首帧等运行时初始化，首轮上下文没有本地估算展示。** settings已有分类，两个面板向参考A看齐的方向明确。下文逐项结论保留初次调查基线；后续修补与当前剩余任务见文末和[补充规划](phase-20-addition.md)，不能把旧机制当作最新产品仍有同样故障。

核查日期为 2026-10-25，源码基线为 `4f0f282feb0bc608dc8e57026fbfa32521e5a685`，开始时当前分支 main、工作区干净。先读启动规则、根部 HANDOFF、开发日志、重构计划及 Phase 20 决策，再沿具体调用链检查实现与测试源码。23–37 研究是此前的证据与规划来源，不能把其中旧版本的行数限制、启动命令和工具数量当作当前事实。Phase 20 当前状态见[交付记录](phase-20-status.md)，延期的真实条件验收继续延期。

同日补充核查时 HEAD 为文档提交 `9e5db96e0829c078238a23d2ad037575cf4d6b04`，已有末尾汇总尚未提交，产品源码未变。新增用户观察是：resume 先选中两天前的会话，今天的三个会话随后出现但焦点不变；model 可以输入和 Esc，无法用上下键浏览未配置模型；参考启动后立即有约1.7k上下文，本项目先显示问号，对话后约4.9k。本次据此修正初轮“仅是当前会话聚焦设计”和“只能 Esc 的根因完全未知”的宽泛判断。

2026-10-26再次更正：用户观察是 model 上下键完全没有可见交互；用户推测只有一个模型配置，其他候选不能选中，造成了失灵的假象。本文此前把“跳过禁用行”写成已确认的现场根因过于确定，应保留观察与推测的区别。用户已明确要求未配置模型也能选中浏览、settings/model整体参照 oh-my-pi，并要求已提交用户消息顶格、编辑框恢复箭头，增加正文路径补全、多 skill 与部分可组合 slash。详细要求和验收已汇总到[Phase 20补充规划](phase-20-addition.md)，本轮仍只交付文档。

本文只交付调查结果，不修改产品。没有运行产品、测试、构建、远端 provider 或 PTY；仅有源码阅读、既有原始工件读回及静态检查。初轮两条委派研究均只读，补充轮未新增委派。未运行真实二进制加载 20,000 条消息的压测。

下文的“证实”表示当前源码或原始工件直接支持；“推断”表示能解释现象但尚未捕获你的实际运行；“未验证”表示缺少本轮运行证据。源码里有测试，不等于本轮测试通过。

## 逐项结论

| 原编号 | 当前结论 | 判断边界 |
|---|---|---|
| 第三 | resume 先发布当前会话，后台补充新会话；后续更新保留最初自动焦点 | 源码能解释“先旧后新且不改选中”；实际会话 ID 与加载时长未捕获 |
| 第八 | 用户观察上下键完全没有可见交互；要求允许选中未配置模型 | 源码存在跳过 disabled 行的机制，是解释单可用模型时假象的候选原因，尚未现场确认 |
| 第九 | model 没有分类导航 | 当前真实界面差距，高置信度 |
| 第十 | settings 已有七组加 All；settings、model 均需向参考面板看齐 | 分类事实与用户方向明确；具体覆盖范围仍按本项目配置能力选择 |
| 第十一 | 普通输入形态的箭头被明确移除；用户现已要求加回 | 本次新方向覆盖旧移除裁决，产品尚未修改 |
| 第十二 | 本项目对话后约4.9k来自 provider 用量，参考启动约1.7k可来自本地估算 | 计量来源确实不同；数值差的组成未对齐，不能只归因工具数或公式 |
| 第十三 | `npm start` 不自动编译；当前 fullscreen 在运行时初始化后才绘制 | 缺少参考式提前首帧是源码事实；当前机器各阶段耗时未实测 |
| 第十四 | 存在重复入口和功能交集，但不全是重复实现 | 逐项说明见下表，不能只按名字删除 |
| 第十五 | 配置文件存显式覆盖值；当前项目文件确实是空对象 | 不代表参数没实现；个人层与最终有效值未读取验证 |
| 第十六 | 默认输入和已提交用户消息仍有一格左侧留白；用户要求修正顶格 | 已提交消息正文从第一列开始；编辑框去掉额外留白并保留恢复后的提示箭头 |

## 第三：resume 是什么，为什么每次加载，为什么没选最新一条？

**它是保存会话的浏览与恢复面板，不是当前对话的实时历史窗口。** 它提供项目范围、时间分组、置顶、搜索、分页、摘要预览和恢复选择。打开以后，面板先进入 loading，异步获取这一轮目录；接受选择时还要重新检查会话身份、版本和当前项目。

每次打开创建新的浏览生命周期，会重新获取并核查来源。单次浏览的后续页面复用有界目录索引；重新打开才能把更早页面的变化纳入新快照。这解释了“每次像重新加载”。它与启动恢复摘要的持久缓存是两条已有用途不同的路径：前者供显式选择，后者加快启动时恢复候选的发现。不能由面板出现 loading 推出“启动缓存没有使用”，也不能把 loading 本身说成启动更快的证据。

**这次问题发生在渐进加载与默认焦点的组合上。** catalog 先读取当前会话并立即发布 scanning 快照，历史发现还没完成；listing 的 load 取这个首个快照便返回，overlay 随即按当前活动会话 ID 聚焦。历史会话再按批次加入、重新排序，订阅更新只替换 options；OptionModel 只要原 ID 仍可用就保留它，没有区分“首次自动选中”和“用户手动选中”。因此即使用户什么都没按，今天的会话随后出现也不会改变原来的旧会话焦点。这个链路与“两天前先选中，今天三个随后出现，选中不变”的观察吻合；未读取当时的实际 ID，不能声称已捕获完整运行。

**排序没有写反，但默认焦点确有体验问题。** 排序仍是置顶优先、更新时间倒序、相同时间按 ID 稳定排序；新会话可以排到前面，焦点却留在旧 ID 上。初轮只解释“当前会话聚焦符合设计”不够：你的补充明确要求处理未手动选择时的最新候选，不能用旧规则否定这个问题。

依据：[先发布当前会话](../../packages/ts-shell/src/session/store/catalog/index.ts#L117)、[逐批加入历史](../../packages/ts-shell/src/session/store/catalog/index.ts#L183)、[首个快照返回](../../packages/ts-shell/src/cli/interactive/picker/session/listing.ts#L30)、[初始 ID 与后续订阅](../../packages/ts-shell/src/cli/interactive/picker/session.ts#L140)、[首次加载设置焦点](../../packages/ts-shell/src/cli/interactive/overlay.ts#L712)、[保留已有焦点](../../packages/ts-shell/src/presentation/tui/chrome/options.ts#L140)、[排序](../../packages/ts-shell/src/session/navigation/selection.ts#L43)、[启动恢复缓存](../../packages/ts-shell/src/session/recovery/reentry.ts#L68)。已有[测试](../../packages/ts-shell/src/cli/interactive/picker/session.test.ts#L43)覆盖当前会话超过最近40条仍聚焦，说明旧规则是有意实现，不代表当前期望已经满足。

参考 B 区分 selectionTouched：用户尚未动过选择，候选更新后回到首项；手动选过，才按稳定路径保留。可参考这个分界，同时明确置顶与“最新”的关系，并保留当前会话标记。Phase 20 的[消费者映射](phase-20-decisions.md)仍记录旧“当前会话聚焦”规则；后续实施应同步新默认焦点裁决，本轮只记录差异与用户期望。

## 第八：model 为什么可以输入，却不能用上下键浏览其他模型？

**你的实测是上下键完全没有可见交互；只有一个模型配置是你的根因推测。** 当前源码将上下键交给 OptionModel.step；未配置模型被标为 disabled，step 会跳过这些行。如果只有一个模型可用，上下键会绕回它，视觉上没有移动；若全都禁用，遍历一圈后回到原 cursor，current 仍为空。这个机制支持你的推测，但本轮未捕获实际按键、overlay 状态及候选资格，不能宣称已经排除按键路由或输入焦点方面的其他问题。

**问题是浏览焦点与模型启用资格绑在一起。** 凭据或连接缺失应该阻止实际切换，但仍应提供浏览原因和进入配置的路径；目前连聚焦查看都被同一 disabled 标志挡住。不能把缺少配置本身视为可以直接切换，也不能只补一个上下键监听就解决，因为监听已经存在。后续应在 model 的导航投影中区分可浏览与可接受，避免把其他面板的禁用标题一并变成可选项。

用户要求已明确：**允许上下键选中未配置模型，并整体参照参考面板。** 这里的选中包括可见焦点、滚动和详情查看；没有凭据时的实际模型启用继续受原准入约束，Enter 可导向配置/登录。验收必须覆盖“恰好一个模型配置、其余未配置”的面板打开及真实按键链，不能仅以 OptionModel 单元检查宣布现场问题解决。

模型行被禁用的条件包括没有匹配连接、连接 pending/error、账号池不可用、凭据不可用、目录 endpoint 歧义、reasoning effort 不受支持、没有可保存的活动会话 baseline。依据：[行准入](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L71)、[当前请求只读行](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L97)、[上下键路由](../../packages/ts-shell/src/cli/interactive/overlay.ts#L648)、[跳过禁用行](../../packages/ts-shell/src/presentation/tui/chrome/options.ts#L113)、[禁用行不能聚焦或作为 current](../../packages/ts-shell/src/presentation/tui/chrome/options.ts#L78)。当前请求 active 说明行也是 disabled，active 标签不能当作实际选择光标。

另一个真实限制：即使另一 provider 有环境凭据，当前活动 provider 不是它且没有命名连接时，该行仍可能显示 configure a connection。provider 的“凭据已发现”与 picker 的“这个精确目标可切换”不是同一条件，见[providerSlot](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L47)。本轮没有擅自扩大凭据切换范围。

参考 A 在未搜索时允许导航到 locked provider 分类，展示凭据缺失原因、配置指引及可用时的 OAuth 登录入口；这些模型并不会因此自动成为可启用候选，搜索期间还会跳过锁定分类。可借鉴的是分类浏览、诊断和实际启用分开。当前 model 主要显示原因，连接操作另在 `/connect`。loading/actionPending 是否也出现在你的那次运行仍未捕获，但不再妨碍确认上述禁用行浏览缺口；现有[model 测试](../../packages/ts-shell/src/cli/interactive/picker/model.test.ts#L248)也未在本轮运行。

## 第九：model 为什么仍然没有分类？

**你的判断符合当前代码。** 它把 ready providers 排在前面，随后按 provider → connection → model 展开平铺行；预设和角色也追加到同一列表。两栏中的 detail 虽然写了 provider 和 connection，但没有 provider/role 分类标签或侧栏，文字说明不能算分类导航。

依据：[model 面板定义](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L25)、[候选展开](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L42)、[预设追加](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L106)。Phase 20 PAN-01 已实现精确连接、角色预设、搜索和两栏等部分，不能由这些能力推出参考式分类导航已经交付。

参考 A 的具体做法是：左侧 Roles / All models / 可用 provider / 锁定 provider，主体保留模型列表及 detail；另有 model-kind tabs。首次打开先用当前 registry 快照使候选可选，再后台刷新，刷新后协调稳定身份。分类和搜索都是已有目录的投影，不应复制一套模型库存或另造选择事务。当前核查的固定入口没有 Recent，不能照着旧概述虚构已经存在的参考能力。

本次用户已明确希望 model 向参考 A 看齐。后续方向是分类导航、列表与详情、未配置目标的诊断/连接入口及稳定的刷新焦点；实际切换继续沿现有精确连接与模型选择事务处理。本轮记录这个方向，尚未实现面板改动。

## 第十：settings 太简略，没有分类？

**当前已经有分类，但导航方式和覆盖范围比参考简单。** 七组为 Session、Request、Context、Retries、Network、Tools、Display，另有 All。默认打开 All，Tab/Shift+Tab 切换组；可以点击分类，输入搜索跨全部组，清空后恢复原组。窄窗口或可用行数很小时，panel 会按预算省略 chips；因此“看不到分类”仍可能来自实际布局、默认 All 或旧产物，尚未捕获你当时是哪种情况。

当前编辑元数据白名单有37项：请求采样与输出限制、上下文与指令预算、重试、网络超时、工具限制与发现、theme、Vim、输入形态、状态项等。实际面板还按保存scope和public policy筛选，并非每种scope都显示37项。详情区包含 Effective / Accepted / Stored / trust / Pending，先暂存再 Apply，可选 user/project scope，部分外观有预览。凭据和连接归 `/connect`，不在普通 settings 编辑白名单中。

依据：[分类及搜索](../../packages/ts-shell/src/cli/interactive/picker/settings.ts#L161)、[37项编辑元数据](../../packages/ts-shell/src/config/settings.ts#L18)、[详情与暂存](../../packages/ts-shell/src/cli/interactive/picker/settings.ts#L84)、[保存](../../packages/ts-shell/src/cli/interactive/picker/settings.ts#L147)、[按真实行数分配面板](../../packages/ts-shell/src/presentation/tui/chrome/panel.ts#L46)。旧研究的 MAX_OPTIONS=8 已不是当前 panel 的限制。

参考 A 有十个主分类、二级 section、Plugins 页及动态 provider/model 等来源。其方向键、Tab 和左右键分别承担不同导航层次；本项目主要用 Tab 换分类，层次少。**“比参考简略”有客观依据；“各种设置都没实现”没有依据。** 默认 All 降低分类发现性是合理 UX 推断，需要实际终端确认。

本次用户再次明确希望 settings 与 model 一起向参考 A 面板看齐，不再把分类层次当作待确认偏好。后续应对齐清晰的主分类、分区及键盘导航，把本项目已有设置映射进去，并保留 scope、来源、暂存/Apply 和连接 owner 的真实边界；参考独有的配置能力不能仅靠增加菜单名称宣称已实现。

## 第十一：输入框左侧箭头怎么没了？

**当前是明确移除，不是字体无法显示。** default、borderless、top-rule 的 gutter 都是空字符串，绘制层不会凭空生成箭头。band 仍有自己的 `╰─ ` 装饰，框线形态另计算边界。

依据：[形态定义](../../packages/ts-shell/src/presentation/tui/composer/shapes.ts#L18)、[gutter绘制及内容列](../../packages/ts-shell/src/presentation/tui/composer/row.ts#L44)。[2026-10-25 返工裁决](phase-20-decisions.md#2026-10-25-日常交互返工裁决)明确记录“移除输入提示符及已提交用户消息的黄色侧标”。这条后续裁决比原研究中带箭头的截图和几何优先。

箭头确实被删了，旧实现符合当时裁决。**2026-10-26用户已明确要求恢复编辑框左侧箭头；这是新裁决，不再待确认。** 已提交消息的黄色侧标继续去掉，箭头和消息侧标分别处理。具体几何与验收见[补充规划](phase-20-addition.md#5-输入几何已提交消息顶格编辑框恢复箭头)。

## 第十二：参考启动显示1.7k，我们先是问号、对话后约4.9k，是公式不同吗？

**计量来源确实不同，但不能把数值差全部归因于公式。** 你指的是启动状态栏与对话后的状态栏，不是旧研究的工具目录估算。本项目只显示身份匹配的最近前景请求 provider 输入用量；参考在还没有 provider 用量时就计算本地上下文估算。因此参考可以在发起对话前有具体数值，本项目此时没有这条估算回退路径。

| 显示位置 | 当前数据来源与计算方式 | 能说明什么 |
|---|---|---|
| 本项目启动的 `?` | 没有匹配的 provider 输入计量，contextUsed 未定义 | 还没有实测；不是上下文为0，也不是算错了一个已有数值 |
| 本项目对话后约4.9k | 归一化 provider 用量中的 promptTokens + cacheReadTokens + cacheWriteTokens | 最近匹配请求的总输入，包含缓存输入；多步回合不保证它只代表第一步的初始上下文 |
| 参考 A 完整会话启动后的具体数值 | 无实测 anchor 时，nonMessageTokens + tokenizer.countMessages(activeMessages) + pendingTokens | 本地估算能在首次请求前显示；有 anchor 后再结合实测和本地变化校准 |
| 参考 A 最早的预绘制占位 | percent=null，此时只显示窗口容量；还可能使用缓存的 UI/status 快照 | 临时占位不显示问号；这与完整会话里的1.7k估算是不同阶段 |

依据：[状态栏读取匹配计量](../../packages/ts-shell/src/cli/interactive/sessionFacts.ts#L68)、[问号绘制](../../packages/ts-shell/src/presentation/tui/chrome/items.ts#L154)、[请求输入用量](../../packages/ts-shell/src/turn/session.ts#L304)、[计量身份与失效](../../packages/ts-shell/src/observability/usageTelemetry.ts#L244)。参考 A 的 session-stats 在没有 anchor 时仍返回 tokens 和 percent，启动占位只是更早的阶段；不能用“参考也有占位”解释你进入后每次都看到的具体数值，也不能把它称作已经获得 provider 实测。

参考的 nonMessageTokens 来自当前 systemPrompt 与 session.agent.state.tools：工具估算取 name、description、provider 规范化后的参数 schema 和 examples，再交给 tokenizer。已知编码可用 native tokenizer，否则可回退到 UTF-8 bytes/4；若具体模型明确 toolSchemasInContext=false，则这部分常驻 schema 估算为0。**这是条件分支，未验证你的模型是否走它。** Gemini 描述转移策略也不能推到所有模型上。工具菜单里有多少名字，不等于当次发送多少 schema，更不等于描述、参数及示例有多少 tokens。

本项目实际普通回合默认 dynamic，从 pinned、显式能力和已加载工具构造发送集合；pinned 名单有12个名字，另有搜索/加载元工具。请求还包含系统提示词、项目规则、skills、用户消息、历史及协议开销。参考工具不少这一点并不矛盾，但没有同模型、同项目规则和同一份请求的分项数据，无法判断约4.9k与1.7k的差额分别来自哪些部分，也不能断言本项目实际浪费约3.2k。依据：[默认dynamic](../../packages/ts-shell/src/config/runtimeConfig.ts#L413)、[真实回合组装](../../packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts#L390)、[初始工具集合](../../packages/ts-shell/src/core/tools/catalog.ts#L73)、[pinned名单](../../packages/ts-shell/src/core/tools/discovery/state.ts#L13)。

**另有一处独立的 `/context` 报告缺陷仍然成立。** 旧研究的4,952来自20个工具声明的 JSON 字符估算；当前目录估算也仍按 UTF-16 code units ÷3.5计算。这不是产生你对话后状态栏约4.9k的公式。未计量时 `/context` 将完整检查工具池估算称作 “First request estimate: at least …”，但它与 dynamic 实际发送集不同，没有建立首请求下界。应区分可发现目录估算与已组装请求估算，见[目录估算](../../packages/ts-shell/src/core/commands/contextCommandRuntime.ts#L93)、[检查工具池](../../packages/ts-shell/src/cli/runtime/tools.ts#L16)、[报告措辞](../../packages/ts-shell/src/core/commands/context/report.ts#L59)。

后续方向是首次请求前按实际组装内容显示本地估算，provider 返回后按身份切换或校准实测，模型/连接/上下文变化时使旧值失效。若要解释具体差额，应对齐同模型与同请求的本地分项和 provider 总输入；现有 `/context` 的 wire 分类与源字节可辅助排查，不能当作各类精确 tokens。本轮没有请求抓取或数值复测。

## 第十三：启动很慢，每次重新编译吗，npm start用错了吗？

**当前根目录的 `npm start` 没用错，也不会自动编译。** 当前命令入口是 `node scripts/start.mjs`，校验成功后再用Node启动manifest指定的不可变JavaScript入口。缺失、过期或字节不一致时直接报错，提示手动构建；源码开发入口才是 start:dev/dev。

依据：[启动脚本](../../scripts/start.mjs#L10)、[校验入口](../../scripts/start-lib.mjs#L147)、[输入摘要](../../scripts/build-identity.mjs#L96)、[项目指南](../../PROJECT_GUIDE.md#L106)。根部 `node dist/cli.js` 也进入同一启动脚本，不能把它当作跳过校验的捷径。

但“不编译”不等于“没有启动成本”：每次检查源码/JSON、编译器声明、依赖声明、必需构建输入、全部产物及已登记可执行文件的字节；之后还有Node模块加载、配置和运行时初始化。当前本地manifest登记1835个产物及102,869,120字节的可执行文件，这是读回的规模事实，**并未在本轮证明manifest新鲜度，更没有测出校验占你当前启动时间的比例。** `listCompilerFiles`中的tsc仅用于构建侧枚举，当前start调用的摘要计算使用已登记名单，不会执行它。

**你指出的“先进入 TUI，再等待加载”确有可参考的实现，当前存在首帧时序差距。** 本项目入口先动态导入完整 cliProcessRunner，随后建立 bootstrap runtime、应用主题、处理输入和启动投影，再创建 sessionRuntime，最后才进入 interactive loop。fullscreen 路径的 startup surface 也刻意不打印控制台 intro，由完整 host 绘制。因此这里没有运行时就绪前的轻量 TUI 首帧。已有恢复提示扫描延后到 onFirstFrame，是一部分工作后移，不能等同于主启动链已提前绘制。依据：[入口导入](../../packages/ts-shell/src/entrypoints/cli.tsx#L24)、[bootstrap 初始化](../../packages/ts-shell/src/cli/bootstrap/cliProcessRunner.ts#L140)、[fullscreen 启动投影](../../packages/ts-shell/src/cli/bootstrap/cliStartupSurface.ts#L43)、[首帧后恢复提示](../../packages/ts-shell/src/cli/bootstrap/cliProcessRunner.ts#L284)、[runtime ready 与进入交互](../../packages/ts-shell/src/cli/bootstrap/cliProcessRunner.ts#L313)。

参考 A 在符合条件的交互 TTY 入口先调用 beginStartupComposer，再加载网络 bootstrap 和完整命令图。这个 Composer 可用缓存外观和状态绘制，加载期间暂缓正式输入接管；配置就绪后更新外观并接管输入，完整 InteractiveMode 再通过 lease 接收同一个 Composer。它减少的是用户看见空白终端的等待，并不证明全部初始化更快。启动源码已支持这种差异，双方本机耗时没有实测。

后续可沿本项目已有 TUI owner提前绘制输入区和明确加载状态，再完成初始化及交接；应分别计量“首次可见”和“可以派发请求”，就绪前不派发，并明确加载期间的输入保留与退出行为。print/help/replay 等入口继续按各自生命周期处理。这个方向已按你的补充记入文档，本轮没有修改启动或构建行为。

已有原始工件能说明这组样本中分发形态对应不同启动速度。下表是2026-10-23隔离Linux runner、Node20.3.0/Bun1.3.14、空会话库、120×60、每格30次的fullscreen首帧数据，build ID为 `91c1045a9d1ad20a59d64780b6aada71419e6d53ef54b9050e32c92627c3bcc2`。它是历史版本的同机观测，不是当前WSL或当前HEAD复测，也没有包含npm父启动器。

| 入口 | warm p50 / p95 | 受控cold p50 / p95 |
|---|---|---|
| Node发布入口 | 1861.2 / 1879.8 ms | 3534.4 / 5567.9 ms |
| 单文件可执行入口 | 747.7 / 762.7 ms | 997.9 / 1071.6 ms |

本轮读回两份原JSON并核对hash，见[既有性能记录](phase-20-status.md#2026-10-23-start-03-受控冷热启动基准代码批-2c55ec8b-已推送performanceciwatch-success)。`--version`的几百毫秒不能替代这个交互首帧口径。参考 B 当前CLI分发入口也是预先bundle的文件，说明比较时必须先统一启动形态；本轮没有做双方同机速度排名。

现在的用法是：源码或构建输入变化后执行一次 `npm run build:ts`，日常用 `npm start`；需要单文件形态时再串行执行 `npm run build:exe`，实际入口在manifest的 executable.path中。**有单文件产物不代表 `npm start` 自动选择它：该命令仍启动Node。** 这部分本轮没有实际运行任何命令或新基准。

## 第十四：theme、view等slash是不是重复或没价值？

**存在入口交集，但不能把入口交集都当作重复功能。** 当前候选已过滤alias，别名仍可直接执行；因此别名数量不能当作独立实现数量。以下是沿实际owner核查的几组：

| 入口 | 当前职责与交集 | 判断 |
|---|---|---|
| `/theme` 与 settings里的Theme | 前者列目录或切当前进程palette；后者选scope、暂存并Apply保存 | 展示入口可收敛，但保存语义不同；当前theme仍是独立主候选 |
| `/statusline` 与 settings里的Status items | 都能选择状态项；独立命令另有脚本入口及其保存层选择 | 入口交集成立，适合统一发现入口，保留脚本语法 |
| `/view` | 在user/compact与developer/verbose间切换，影响运行时诊断、审批细节及结束摘要 | 有实际消费者，不是空命令；名字不容易解释用途，且不是输入框/fullscreen布局设置 |
| `/login`、`/logout` 与 `/connect login/logout` | shortcut直接委托同一连接owner | 明确重复入口，属于便利快捷方式，不是第二套auth实现 |
| `/cost` 与 `/usage` | 前者计量及估算费用，后者另有account quota/reset预览与receipt | 统计有交集，后者不能整体删除 |
| `/tree`、`/history`、`/entries tree` | 前者可继续分支，history浏览/导出，entries支持稳定cursor的外部读取 | 同源多投影，有不同动作和消费者 |
| `/back`、`/restore`、`/undo` | 重问/会话历史选择/文件操作恢复分别作用于不同状态 | 不应因“回退”同义就合并或删掉 |
| `/jobs`、`/hub` | 同一job owner的控制列表和父子/共享计量概览 | 有交集，尚无证据说明hub全无价值 |

依据：[theme/view声明](../../packages/ts-shell/src/core/commands/registry.ts#L505)、[theme当前进程提交](../../packages/ts-shell/src/presentation/theme/selection.ts#L58)、[settings保存](../../packages/ts-shell/src/cli/interactive/picker/settings.ts#L147)、[view命令](../../packages/ts-shell/src/core/commands/view/command.ts#L6)、[view运行时消费者](../../packages/ts-shell/src/core/shell/sessionEventSurface.ts#L73)、[auth快捷方式](../../packages/ts-shell/src/core/commands/authShortcuts.ts#L5)、[usage](../../packages/ts-shell/src/core/commands/usageCommandRuntime.ts#L7)、[导航语法](../../packages/ts-shell/src/core/commands/navigation/operations.ts#L13)、[entries cursor](../../packages/ts-shell/src/core/commands/entriesCommandRuntime.ts#L14)、[jobs/hub](../../packages/ts-shell/src/core/commands/jobs/registration.ts#L5)、[alias过滤](../../packages/ts-shell/src/cli/interactive/slashSuggestions.ts#L27)。

你指出theme已进settings是对的；当前仍展示独立/theme，需要决定“主题统一从settings发现，直接/theme作为兼容快捷语法”还是继续显示两入口。view确有用途，但用途是诊断详略，当前命名和其他UI设置容易混淆。至于哪些命令完全没有价值，本轮没有逐动作使用数据或全目录动态审计，不能给出删完就安全的清单。历史102个声明入口统计也不是当前每个scope的可见数量。

## 第十五：配置文件很简略，是没使用还是参数没实现？

**配置文件是显式覆盖集合，不是把全部默认值展开的表。** 本轮安全读取当前项目 `.cheers/config.json`，确实是空对象；根部旧 `.cheers.json` 不存在。没有读取或输出个人凭据，没有把空项目文件解释成个人配置也为空。

有效配置来自字段注册表、默认值、用户/profile配置、项目配置、有序显式overlay、声明的环境输入及CLI override。来源许可、信任和合并方式因字段而异；不能用“最后一个文件一律获胜”解释所有设置。TUI叶子、allowlist交集、deny集合等有各自规则。空对象只是不添加项目覆盖。

| 配置族 | 当前例子 | 使用边界 |
|---|---|---|
| 请求与预算 | maxTurns、temperature、topP、maxOutputTokens、contextWindow、reserveTokens | 有默认/目录/模型约束，设置值不意味着provider支持所有参数 |
| 上下文与发现 | instructionBudgetBytes、modelTokenBudgets、toolDiscovery | 真实回合接入预算和动态工具目录 |
| 限制与来源 | allowedTools、allowedModels、disabledTools、denyRules、pathRules | 合并安全限制；来源与信任检查先于生效 |
| 重试与网络 | retryEnabled、retryMaxRetries、providerRetryMaxRetries、各超时 | 回合和provider层分开，不能相加成一项重试 |
| 外观与交互 | theme、vimMode、tuiMode、tui.composerShape/statusItems/diagrams | immediate、next operation、restart分别说明 |
| 连接与账号 | providerCredentials、providerConnections、activeProviderConnectionId、accountPool | 普通settings不编辑，个人/profile来源及专门连接owner管理 |

依据：[字段schema/来源/应用策略](../../packages/ts-shell/src/config/fields.ts#L34)、[默认值](../../packages/ts-shell/src/config/runtimeConfig.ts#L405)、[有效投影](../../packages/ts-shell/src/config/runtimeConfig.ts#L481)、[来源验证及合并](../../packages/ts-shell/src/config/layers.ts#L62)、[实际回合接线](../../packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts#L390)、[设置变化与重启要求](../../packages/ts-shell/src/config/application.ts#L16)。37项是settings编辑白名单，不能当整个配置系统只有37个输入。

现在可以从 `/settings` 看生效值/存储值/来源，`/settings <字段名>`看schema、scope和应用时点；保存需暂存后Apply或显式set。用户默认文件、命名profile文件和项目目录说明见[指南](../../PROJECT_GUIDE.md#L138)。未知字段会报告unknown-field，错误来源或值会被拒绝；往文件里添加一个任意参数不会自动创造能力。

因此“文件少，所以参数没实现”的归因不成立。当前确实存在配置发现性不足：只有显式值，没有一份在文件旁展示全部默认、来源和provider适用性的说明；但本轮不能把已接线的字段全称为已做真实provider验收，也没有证明你个人层当前最终有效值。

## 第十六：用户输入为什么没有顶格？

**目前有留白，且是明确几何。** 普通default输入没有gutter和侧框，但正常宽度frame.padding仍为1，所以内容从终端第二列开始。field/rail/box另有一列侧框，band有自己的gutter；“padding一格”不代表所有形态距终端左缘都只有一格。

已提交用户消息同样有一格开头空白：renderUser使用宽度−2折行，然后在正文前加一个空格并铺满背景。移除黄色侧标只减少了装饰列，没有把padding置0。

依据：[frame几何](../../packages/ts-shell/src/presentation/tui/composer/frame.ts#L29)、[正文起点](../../packages/ts-shell/src/presentation/tui/composer/row.ts#L47)、[用户消息绘制](../../packages/ts-shell/src/presentation/tui/transcript/blocks.ts#L132)、[对应源码断言](../../packages/ts-shell/src/presentation/tui/transcript/blocks.test.ts#L16)。源复制按正文映射，不把绘制padding当作用户原文；真实正文自带的空白不能被trim掉。

参考 A 将prompt gutter与padding按形态分别配置，说明符号、边框、空白应独立决定。旧[返工裁决](phase-20-decisions.md#2026-10-25-日常交互返工裁决)要求每侧1cell。**2026-10-26用户已要求修正删除黄色侧标后仍不顶格的问题，并恢复编辑框箭头。** 新要求覆盖旧几何：已提交消息去掉装饰性左侧留白，正文从第一列开始；编辑框提示箭头贴左，正文紧接必要的提示间隔，不再增加独立左侧 padding。正文自己输入的空白不得删除，右侧留白与有框形态不随此要求一律归零。

## 对照来源、边界与后续选择

参考 A 是本次用户指定的 oh-my-pi，参考 B 是 pi；下表用 A/B 标识只读快照。项目名称只用于说明对照来源，没有复制外部代码或引入产品运行时标签。

| 快照 | 本轮实际读取的关键位置 | 使用目的 |
|---|---|---|
| A：`0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0` | packages/tui/src/overlays/model-hub.ts：532–556、731–781、890–900、2721–2758 | 模型分类、首个快照、锁定provider解释/连接 |
| A：同上 | packages/tui/src/overlays/settings-defs.ts：4–44、66起；settings-selector.ts：108–141、546–578 | 主分类、section、动态设置来源 |
| A：同上 | packages/tui/src/status-line/startup.ts：74–75；segments.ts：864–869；context-usage.ts：364–417 | 未知表现及分类估算 |
| A：同上 | packages/tui/src/status-line/context-usage.ts：237–281；packages/coding-agent/src/session/session-stats.ts：367–389 | 实际 roster、条件性 schema 计量、首次请求前本地估算 |
| A：同上 | packages/coding-agent/src/session/session-stats.ts：367–389；packages/agent/src/tokenizer.ts：268–273；packages/coding-agent/src/session/settings.ts：347–359 | 计量anchor、本地尾巴、tokenizer及描述策略 |
| A：同上 | packages/coding-agent/src/cli.ts：522–555；src/modes/startup-composer.ts：69–99；src/main.ts：630–661 | 先绘制 Composer、后加载完整命令、交接同一终端界面 |
| A：同上 | packages/tui/src/overlays/model-hub.ts：812–865、1048–1059、2721–2758 | 未搜索时锁定 provider 可导航；诊断/登录与模型启用分开 |
| A：同上 | packages/tui/src/components/editor.ts：1138–1153 | gutter与padding分开决定 |
| B：`38ff99177fba21e9c57a670f4e95adcf407c99c7` | packages/coding-agent/src/modes/interactive/components/session-selector.ts：363–394；src/core/session-manager.ts：920–921 | 默认首项、手动焦点保留、活动时间排序 |
| B：同上 | packages/coding-agent/package.json：bin与build脚本 | 预构建bundle分发形态 |

原始启动工件目录为 `.omx/artifacts/phase20-performance-39817293051/performance-39817293051/`。本轮读回 interactive-warm.json / interactive-cold.json，两者SHA256分别为 `69a047a08bbfc535e59de75817b3fcc5c617822aea228015eb77d3e7e3950e35` / `f0671f10deaa923365b0fa5c34d745952216dae13cfdd7dda52555d57a6ce1e1`，与已有交付记录一致。它们只支持自己的机器、版本和口径。

补充观察明确了model上下键没有任何可见交互，单可用候选导致视觉假象是待验证推测；resume的现象与渐进发现后自动焦点不更新的机制吻合。仍未捕获真实会话 ID、终端按键事件、约4.9k/1.7k对应的请求内容与具体模型分支，以及本机各启动阶段耗时。源码支持候选机制，不能由本文变成“已动态复现”“现场根因已排他确认”或“已修复”。

已记录的后续方向是：settings/model 向参考 A 面板看齐，model 允许选中未配置目标；resume 区分自动焦点和手动选择；启动先给出 TUI 再完成加载；上下文首次请求前提供本地估算，之后接入实测。2026-10-26新增消息顶格、编辑框恢复箭头、正文路径补全、多 skill 与部分可组合 slash，见[补充任务](phase-20-addition.md)。若继续实施，应复用现有目录、TUI owner、配置保存和模型选择事务，使用小会话聚焦验证；20k边界只做mock/切片逻辑验证，验证由主代理单进程串行完成。本轮授权范围仍是定位和文档更新。

初轮文档验证：全部十项编号齐全，当时66个本地链接的目标文件存在。主代理在同一串行链运行import cycles、config consumers、declarations、Node floor、严格docs drift及diff check，均exit0；既有118条未加根前缀文档引用advisory仍保留，不称全仓文档零漂移。初轮两条只读复核确认面板与上下文结论，并精化scope筛选、发现元工具和计量失效的表述。补充轮只修改本文，验证记录与初轮分开；没有改变Phase 20任务状态，也没有把调查当作产品修复验收。

补充轮文档验证：十项编号齐全，73个本地链接的目标文件存在，`git diff --check` 通过。未修改规则或索引，未运行测试、构建或新的启动基准；文档修改尚未提交。

2026-10-26更正轮：本文77个本地链接目标存在，关联补充规划/决策/索引已校验，严格docs drift与diff check通过；118条既有advisory保留。未改产品，文档尚未提交。

## 最后汇总：哪些问题确实存在，哪些并不存在？

以下判断已吸收同日补充观察，替代初轮较宽泛的归因。“现象存在”“能力不足”和“实现违反现有裁决”分别说明；尚未捕获的运行细节不归入不存在。

### 我认为确实存在的问题

| 对应反馈 | 确实存在的问题 | 问题性质 |
|---|---|---|
| 第三 | resume 首次自动聚焦旧会话，渐进加入新会话后仍保留它，未区分用户是否手动选择 | 源码证实的焦点规则，能解释用户观察；与当前希望默认最新的期望有差距 |
| 第八 | model 上下键没有可见交互是用户观察；源码另证实未配置候选不能聚焦浏览 | 前者未现场复现，后者是确定的能力缺口；单可用候选造成假象是待验证归因，允许选中未配置模型已明确 |
| 第九 | model 缺少 provider、连接、角色等分类导航，模型与预设平铺在同一列表 | 源码证实的界面能力缺口 |
| 第八、九 | model 对不可选目标主要给禁用原因，缺少从该位置进入连接配置或登录的操作；另一个provider有环境凭据也不保证能直接切换 | 源码证实的操作路径限制；是否扩大切换范围需要产品选择 |
| 第十二 | 首轮上下文没有本地估算回退，provider用量返回前只有问号；参考完整会话可提前显示估算 | 源码证实的显示能力缺口；问号诚实表达未知，但信息不足 |
| 第十二 | `/context` 将完整检查工具目录估算称作“首请求至少需要”，但实际dynamic发送集合不同，没有建立这个下界 | 明确的报告语义缺陷，容易让人误判初始开销 |
| 第十三 | fullscreen 在完整 runtime 初始化后才绘制，缺少参考式轻量首帧与后续加载交接 | 源码证实的启动时序差距；实际延迟和收益尚未测量 |
| 第十四 | theme、statusline与settings有重复发现入口，login/logout与connect有快捷入口重叠；view名称不容易说明诊断详略用途 | 入口交集是事实；我认为应改善入口组织和命名说明，不代表可以直接删除实现 |
| 第十、十五 | settings分类层次和覆盖范围比参考少；稀疏配置文件本身无法展示完整默认值、来源及适用条件 | 能力范围差异是事实；用户已明确要求 settings/model 面板看齐参考，具体新增配置仍须有真实消费者 |
| 第十一、十六 | 消息侧标移除后仍保留左侧空白，编辑框箭头也被移除 | 用户已要求消息顶格与恢复箭头；旧裁决解释历史实现，不能阻止这次修补 |

后续优先处理 resume 的自动/手动焦点规则与 model 的浏览/启用分界，同时按已确认方向组织 settings/model；首帧提前绘制和上下文估算分别处理。命令发现入口与稀疏配置说明可随后改善。本轮这些都是定位与方向记录，尚未产品实施。

### 我认为当前并不存在的实现缺陷

| 原判断或归因 | 当前结论 |
|---|---|
| 源码完全没写 model 上下键处理 | 不成立：监听已存在；但不能因此否定上下键在真实终端没有任何可见交互，也未确认当时监听真的收到输入 |
| settings完全没有分类 | 不成立：已有七组加All，以及切组和跨组搜索。你当时看不到分类的具体原因仍未确认 |
| `npm start` 每次都会自动重新编译 | 不成立：当前只校验并启动已构建JavaScript，缺失或过期时要求手动构建 |
| 使用 `npm start` 是命令用错了 | 不成立：这是当前支持的日常入口；它仍用Node，不会自动选择单文件二进制 |
| 配置文件很少或为空，说明配置没有使用、参数都没实现 | 不成立：文件只存显式覆盖，字段注册、默认值、分层加载和运行时消费者均存在；不等于所有参数已做真实环境验收 |
| `/view` 完全没有作用，重复命令都只是空壳 | 不成立：view有诊断与审批等实际消费者；快捷入口也可以委托同一owner，不是重复实现 |
| resume没选最新，说明更新时间排序写反了 | 不成立：排序是置顶优先、更新时间倒序；问题是首个快照自动焦点被后续更新保留，不能由正确排序否认这个体验问题 |
| resume每次loading，说明启动缓存没有工作 | 这个推断不成立：显式目录浏览和启动恢复摘要有不同生命周期；本机是否异常慢仍需测量 |
| 对话后约4.9k就是 JSON 字符数÷3.5，参考1.7k证明工具更少 | 不成立：前者来自匹配的 provider 输入用量，后者启动时可来自本地估算；工具数量无法证明 schema token 数与请求内容相同 |
| 箭头消失是字体故障、左侧留白没有源码来源 | 不成立：箭头被明确移除、padding及消息正文前空格都有明确来源；两者现已按用户新要求列入修补 |

### 仍不能判定为存在或不存在的问题

- **第三、八：当时的具体运行身份与状态。** 未捕获两天前会话的 ID、实际构建身份、loading/actionPending 状态和终端事件；渐进焦点与禁用行导航是源码支持的机制，不能据此排除现场按键路由或焦点故障。
- **第十二：约4.9k与1.7k的差额究竟来自哪里。** 本地估算与 provider 用量的来源不同已确认，但模型、协议、规则、历史、实际工具 schema 和缓存口径未对齐，不能把约3.2k全归因于工具或 tokenizer。
- **第十三：当前机器启动是否异常慢、主要耗时在哪里。** 校验和初始化有成本，历史Node入口也确实慢于单文件入口；当前WSL与参考的同条件耗时尚未测量。

settings/model 对齐参考、resume 默认焦点、启动提前进入 TUI、首轮上下文估算，以及2026-10-26新增的几何与输入组合要求，都已进入[Phase 20补充规划](phase-20-addition.md)。恢复箭头和消息顶格不再待确认；以上结论保留初次定位口径，后续已授权修补的当前代码、局部验证、CI失败及未完成项统一见补充规划第15节，不能据本文宣称所有问题已修复。


### 2026-10-26实现后补充：上下文显示

首次请求前始终问号的普通输入路径已补本地估算，小型regular/fullscreen PTY观察到`~4.1k`→编辑后`~4.6k`；其数值为字符近似、不是provider实测或用户现场差额。命令准备、未就绪MCP、opaque replay及不能证明当前身份时仍保留问号/stale；这些未知状态不归入“实现缺陷不存在”。完整计量差额、性能和面板剩余路径继续见[补充规划第15节](phase-20-addition.md#15-实施与验证证据)。第四批行为CI失败已读回，结构proven不替代它；本批修正旧inspection措辞测试并单独绑定后续交付。

### 2026-10-26实现后补充：模型角色操作

模型的未配置行继续允许上下键聚焦、查看详情和进入配置草稿；Roles已补三个自动角色的实际赋值/清除、默认模型保留、保存与应用分别报告、Esc返回原角色行及可见notice。两种TUI的隔离真实PTY和model/overlay/state聚焦135项通过；不能据此称原终端根因已捕获或两个面板全部看齐。认证成功后回返、独立role thinking、settings全部编辑类型与桌面路径继续partial，详见补充规划第15节第六批。

### 2026-10-26实现后补充：入口与配置发现性

`/help`已有真实五组分类、跨分类别名搜索、焦点详情和单草稿插入；主题/状态栏说明归向settings持久偏好，新增[设置指南](../guides/settings.md)。目录/指南改善不等于两个面板全操作路径验收。第五批上下文代码与文档的各自CI已读回success（10712通过/3跳过），第六批角色CI仍待结果；各SHA及补充任务的边界见第15节。

设置面板已补子编辑Esc逐层返回、scope取消保留之前暂存、详情取消撤回及失败后所有类型保留待重试。两模式小型PTY的取消不写、列表/对象Apply读回及166项聚焦检查通过；完整scope/只读来源/桌面与认证路径仍未完成，不能把局部验证等同于面板整体看齐。

### 2026-10-26实现后补充：角色reasoning与CI读回

绑定具体模型的自动角色已有独立effort编辑，按精确relay能力提供等级及provider决定；保存、重新编辑、取消和返回原角色均沿现session事务，不改默认模型或其他角色。角色换模型保留受支持的自身effort，新角色和不支持原effort的目标采用provider决定。六文件137项、有效反转及regular/fullscreen小型PTY通过，并观察面板保存后三个消费者的实际请求/shape；仍不能宣称面板整体看齐，认证回返、settings来源/scope及桌面证据继续partial。第六批CI已success，第七批CI实际一项help旧契约失败；修测保留两层Esc和草稿不变，历史失败不追改。当时第八批仍pending；后续CI失败、认证回返与剩余缺口见补充规划第15节第十批。


### 2026-10-26实现后补充：原生账号认证返回

未配置builtin模型可浏览、进入原生账号登录并返回原具体模型，成功/失败/实际Ctrl+C取消均刷新真实connection状态；三个自动角色可在返回后沿新事务继续显式赋值，默认模型保持原会话绑定。配置未应用或应用未确认优先显示，custom relay没有builtin登录入口。五文件254项、有效反转及两模式六条小型真实Node PTY通过；原生认证使用synthetic fixture，API-key草稿提交回返、真实OAuth及面板全部来源/scope/桌面路径仍缺，因此“未配置行不能聚焦”的确定缺口已有修补证据，但“原终端故障根因已完全捕获”“两个面板已全部看齐”仍不能成立。

第八批CI实际一项help旧契约失败；第九批CI实际一项browser cache多进程writer退出1，cache完整性健康、未超时，具体原因未由日志确定。不能把聚焦绿色或Watch workflow success升级为全量CI成功。最新实现、交付与未完成边界统一见[补充规划第15节第十批](phase-20-addition.md#15-实施与验证证据)。


### 2026-10-26实现后补充：模型API-key配置

模型详情的Configure connection已补单行遮罩输入，明确Enter沿原connect事务保存，返回原具体model与本次connection，随后显式启用；Esc取消配置字节不变。真实host与两模式四条小型Node PTY验证密钥不进入terminal明文、主composer、prompt历史或transcript，角色配置后也可继续赋值。六文件244项及两个有效反转通过，仍无真实provider认证证据；现有失败连接重认证、settings全来源/scope/桌面及上下文性能缺口保留。第十批代码已推送1f1342e7，其CI仍pending，不能借局部绿色宣称面板整体看齐。详细边界见补充规划第15节第十一批。

### 当前汇总：确实存在的问题、不成立的判断与未确认项

| 类别 | 当前判断与处理方向 |
|---|---|
| 确实存在，已有修补证据 | resume渐进目录的自动焦点停在旧会话；未配置具体模型不能聚焦；消息装饰空白与输入箭头回退；普通首请求前没有本地上下文估算；完整目录被误称首请求下界；重初始化后才出现TUI。这些已沿各自owner修补并有局部验证，用户原终端现场根因及完整性能矩阵仍未捕获 |
| 确实存在，持续完善 | model/settings的完整导航、配置、角色和来源操作路径未全部达到对照验收。角色与账号/API-key回返已推进，settings本轮新增可滚动只读值/来源，修补长input路径截断和长来源挤掉“有效值不同”结果；六文件150项与两模式四条真实PTY通过，仍保留完整来源/桌面等缺口 |
| 明确新增需求 | 开头slash命令、正文路径 suggestion/Tab连续补全、正文多个skill、deep-research等准入命令与skill一次组合，共同遵循位置和显式组合契约；提交解析须实际加载全部选中方法，功能命令不因正文提及自动执行。任务与局部实现证据见补充规划，不能把需求表等同于全场景验收 |
| 不成立 | “上下键完全没有监听”“settings完全没有分类”“npm start每次自动编译或用户入口用错”“稀疏配置说明没有实现”“resume排序反了”“4.9k就是字符÷3.5”“工具个数相近足以解释相同上下文”。源码及当前来源链不支持这些判断；未配置行应可浏览的用户要求仍然明确 |
| 尚未确认 | 用户原现场无按键交互的精确原因；相同模型/协议/规则/工具schema下1.7k与4.9k差额；真实冷/热Node/exe和桌面启动收益；真实OAuth/key provider接受；第九批browser-cache多进程writer退出1的具体原因。无证据时既不写成已修复，也不写成不存在 |

“允许选中未配置模型”始终指具体候选可获得焦点并进入配置流程；不能改回跳过它们。两个面板整体向oh-my-pi看齐的要求保留，验收仍按完整操作路径而非外观标签。第十一批`ea4715b6`已推送；第十/十一批CI本轮实际读回仍in_progress。当前实现、历史失败、验证边界与后续修补统一见[补充规划第15节第十二批](phase-20-addition.md#15-实施与验证证据)。

已有pending/error连接无法再次配置的确定缺口本轮已补：具体行保留setup状态并可进入key配置或适用的native登录；新增连接返回原model，旧连接不被虚报修复，会话仍需显式启用。两模式十条小型真实Node PTY及最终五文件90项通过，OAuth/key使用synthetic fixture；原现场精确按键故障、真实provider和整体面板/性能验收仍未完成。第十CI实际success，第十一CI实际navigation无endpoint旧fixture期待失败，已补精确地址与返回身份断言，历史失败保留；第十二CI仍pending。细节与剩余边界见[补充规划第15节第十三批](phase-20-addition.md#15-实施与验证证据)。

当前追加核查：纯modifier/composable模板草稿的预览拒绝，以及按原草稿而非展开prompt分类continuity的偏差已修；同一输入预览与实际提交的完整估算/digest相等检查通过，模板源变化撤销旧值。正文普通功能名称按实际路由保留文本；独立开头命令和研究driver仍不提供完整预览。50项聚焦和两模式小型PTY通过，后者约4.3k→9.0k→12k只说明隔离夹具的组成变化，不能解释用户现场1.7k/4.9k。精确源字节、原生tokenizer、真实差额及完整面板/性能证据仍缺。第十二CI已实际failure10766pass/1fail/3skip，同已在第十三修补的navigation旧夹具；第十三自身CI仍运行。详见[第十四批](phase-20-addition.md#15-实施与验证证据)。

本轮当前汇总更新：当前阻断报告只有Back、显式失败session target标签丢失的缺口已修，报告可进入原精确connection详情及配置；删除/provider变更/端点歧义/pool/override不猜其他relay，过时动作再次准入拒绝。78项聚焦、两有效反转/精确恢复及两模式保存/取消四条小PTY通过；配置恢复不自动启用session模型。第十三自身CI现已实际success10774pass/3skip，Watch工件proven/三satisfied；第十四a412dadc已推送，自身CI仍运行。真实认证、整体面板/性能与精确token差额仍缺；本轮不能据此宣称原按键现场原因已排他确认或全部补充验收完成，见[第十五批](phase-20-addition.md#15-实施与验证证据)。

### 最新总括（第十六批后的证据范围）

| 判断 | 总结 |
|---|---|
| 确认存在且已有局部修补证据 | 未配置模型无法聚焦浏览、resume渐进加载默认停旧会话、黄条删除后的残余留白与箭头缺失、正文路径补全与同提交多skill/有限slash组合缺口、普通输入启动问号、目录估算措辞、失败连接/当前阻断配置入口。普通独立模板原先仍问号的缺口本批补齐：96项聚焦、两反转/精确恢复及两模式小PTY通过，预览复用真实展开且零execute/写入；各自交付与边界见补充规划，不能等同于全部验收通过 |
| 确认仍需完善 | settings/model整体看齐要求已落实结构与部分操作，完整字段、编辑器、来源、鼠标/resize/桌面组合仍缺；其他独立命令及研究流程完整preview、精确source字节与发现成本、原生tokenizer、冷/热Node/exe性能仍需按ADD逐项补证 |
| 不成立的判断 | 没有model上下键监听、settings完全无分类、npm start每次重编译或用户入口用错、空项目配置说明字段未实现、resume时间排序写反、对话后4.9k就是本地字符公式。当前源码与来源证据不支持这些解释，不能据此否认用户观察 |
| 尚未确认 | 原现场上下键完全无可见交互的唯一根因；同模型/协议/规则/实际工具schema下1.7k与4.9k的真实差额；真实性能收益与当前恢复入口的真实OAuth/key接受；第九browser-cache writer退出1原因。这些既不归为不存在，也不虚报已解决 |

第十五`98f13a76`已推送且本地/远端精确一致，自身CI仍in_progress；第十四行为CI也仍in_progress。本批模板PTY约4.3k→6.6k→9.4k只证明隔离夹具的组成变化，完整需求与当前证据统一见[补充规划第15节第十六批](phase-20-addition.md#15-实施与验证证据)。

最新追加核查确认：settings/model鼠标选择后导航焦点域与可见current不一致，以及极矮面板登记未绘制侧栏hit的缺口已修。144项聚焦、三有效反转/精确恢复、两模式SGR实际点击→上下键→精确详情的小PTY通过；不自动保存、激活或认证，真实桌面resize/hover/wheel及完整面板矩阵仍缺。第十六641f2664已推送；第十四行为CI现已实际success10779pass/3skip/结构proven，第十六CI仍运行。既不能以此排他解释原现场按键失灵，也不能将局部路径验证称整体看齐完成，见[第十七批](phase-20-addition.md#15-实施与验证证据)。

### 最新问题总和（第十八批后的证据范围）

| 判断 | 已核实结论与后续方向 |
|---|---|
| 确实存在，已有局部修补证据 | resume渐进加载默认停旧会话；未配置具体model被跳过而无法聚焦；删除黄条后的消息留白、编辑箭头缺失；首请求前无本地上下文估算、TUI首帧过晚；正文path与多skill/有限slash组合、独立模板预览和失败模型配置入口缺口。第十七批另补鼠标→键盘焦点域，第十八批确认并修补list/object无法键盘换行、form忽略剩余行预算而裁光标、超大原值预填拒绝后仍能提交空值。源码、157项聚焦、三个有效反转及两模式小PTY支持本批结论；不能扩大为所有现场问题均已复现或全部验收通过 |
| 确实仍需完善 | settings/model按完整分类→导航→搜索→详情→编辑/配置→确认/取消→重开验收，而非仅外观相似；字段/来源/鼠标/resize/桌面及真实认证矩阵未齐。冷/热Node/exe性能、其他命令/研究完整预览、精确source字节/发现成本和原生tokenizer仍需证据 |
| 不成立或缺乏支持的解释 | model完全没有上下键监听、settings完全无分类、npm start每次编译或用户入口用错、稀疏配置表示未实现、resume更新时间排序反了、provider实测4.9k就是字符÷3.5、仅凭工具数量判断上下文相同。现有机制与来源链不支持这些解释；尤其不能把“已有监听”作为否认用户没有可见交互的理由 |
| 新增需求，不能当作故障根因 | 具体未配置模型也可选中浏览和进入配置，settings/model整体向oh-my-pi看齐，消息顶格并恢复编辑箭头；首位slash命令与正文path分流、路径suggestion/Tab连续补全、同次任务所有选中skill生效，以及deep-research等明确准入方法命令与skill组合。完整要求和准入边界保留在补充规划第2至13节 |
| 未确认，不能写成不存在或已解决 | 原现场model上下键零可见交互的唯一根因；用户同模型/协议/规则/实际工具schema下1.7k与4.9k真实差额；实际冷/热启动收益、真实OAuth/key接受，以及第九browser-cache writer退出1原因。合成夹具的估算数字、结构检查或局部PTY不能替代这些数据 |

第十八批设置支持Shift+Enter/Ctrl+J换行，Enter暂存、Apply保存、Esc保留本次编辑前暂存；普通form按主界面剩余预算，全屏form按整屏预算。两模式小PTY零对话/零切模型，SIGTERM143仅属清理；小窗口/resize证据来自host/surface测试。第十五/十六CI本轮已读回success，第十七CI仍在运行，本批交付另绑定。当前任务与证据详见[补充规划第15节第十八批](phase-20-addition.md#15-实施与验证证据)，整体看齐与真实上下文差额继续待验。

第十九批追加确认并修补：面板wheel直接吞掉、settings section时只用click命中导致内容不能滚动，以及键盘移动窗口后的旧wheel坐标。现按当前painted内容区域一格移动一可浏览项，首尾停止，section/category回rows，未配置模型保留焦点；零自动保存/启用/多选勾选。144项聚焦、三有效反转及两模式SGR小PTY通过。侧栏独立pan、hover、桌面和完整面板仍缺，不能写为全部看齐。

最新证据边界：第十七CI实际2fail/10795pass/3skip，navigation同名点击夹具已按pane定位；print/research被活跃build lock拒绝，其并发来源尚未归因，不改构建拒绝协议。第十八CI仍运行。仍不成立的判断保留“没有上下键监听、排序反了、4.9k是本地字符公式”等；仍未知的包括原现场唯一按键原因、真实token差额/性能/认证及cache writer/活跃build来源，详见[补充规划第15节第十九批](phase-20-addition.md#15-实施与验证证据)。

第二十批追加修补侧栏缺少独立滚动视口，以及窄屏返回后活动分类仍被隐藏的实际边界。现wheel只pan显示窗口，点击/键盘才选分类；110项聚焦、三个有效反转和普通/全屏两小PTY支持滚动→新画面精确点击→未配置模型详情，零自动保存/切模型/请求。hover、完整面板和真实桌面/认证仍缺。第十九`92f7fefa`已推送、自身CI仍运行；第十八CI实际10809pass/1fail/3skip，同名点击夹具失败已由第十九修正，历史红色记录保留。第十七活跃build来源仍未知，不因第十八未复发而称其已解决；详见[第二十批](phase-20-addition.md#15-实施与验证证据)。

第二十一批确认并补齐面板hover报告/显示链路：无按钮motion独立move，picker帧1003与关闭/交接时恢复，独立band不改变键盘选中或触发preview，进入detail/另一pane及旧frame清除。165项聚焦、三有效反转和两模式实际SGR背景观察小PTY通过，hover missing-b后Enter仍打开missing-a精确详情，零保存/启用/对话。第十九CI现实际success10821pass/3skip/结构proven；第二十自身CI首检仍运行，未读Watch工件。完整面板/desktop/真实认证、原现场按键唯一原因、实际token差额/性能及cache writer/build并发来源仍待证，详见[第二十一批](phase-20-addition.md#15-实施与验证证据)。

### 文末当前结论（第二十二批）

| 分类 | 确认结论 |
|---|---|
| 确实存在，已有局部修补 | 具体未配置模型被disabled导航跳过、resume渐进目录停旧自动焦点、黄条删除后的留白与编辑箭头回退、首请求前无估算及TUI首帧过晚、正文路径/多skill/有限slash组合缺口。面板配置/角色回返、真实多行编辑、小窗口、pointer焦点、wheel/sidebar/hover亦已有局部证据，整体面板继续partial |
| 本批确认并修补 | 规则/import/APPEND_SYSTEM与模板只绑定元数据、未绑定实际读取字节；规则/import缺少读后准入。现在转换/裁剪前捕获原始Buffer摘要，异步串行复用已验证句柄读；controller取消等待settlement，过期/超时撤值，周期检查不延长有效期，frame读取不做文件I/O。八文件89项、三个有效反转/逐字节恢复、构建与结构proven通过；本批未运行PTY，不能声称桌面或生产性能已验 |
| 确实仍需完善 | settings/model按分类→导航→搜索→详情→编辑/配置→确认/取消→重开读回整体看齐；全字段/来源/scope/编辑器/桌面/真实认证矩阵未齐。全部上下文来源字节覆盖/复验成本、原生tokenizer、研究及其他独立命令完整preview、冷/热Node/exe测量仍缺 |
| 不成立的判断 | model没有上下键监听、resume时间排序反了、settings完全无分类、稀疏配置等于未实现、npm start每次编译或用户入口用错、对话后4.9k就是本地字符公式、工具数相近足以保证相同上下文。这些解释无当前证据支持；不能据此否认用户无可见交互的观察 |
| 用户明确要求，必须保留 | 未配置具体模型也可聚焦/详情/配置，浏览与启用分开；两个面板整体向oh-my-pi看齐；已提交正文顶格且编辑箭头恢复；首位功能slash、正文路径suggestion/连续Tab、同提交全部skill生效，以及deep-research等明确准入方法命令与skill组合，正文控制/配置命令不执行 |
| 尚未确认 | 原现场model无可见交互的唯一根因、真实同模型/协议/规则/实际schema下1.7k/4.9k差额、生产冷/热启动收益、真实provider认证接受、cache writer退出1及活跃build lock并发来源。不能写为不存在或已解决 |

第二十/二十一CI本批实查仍in_progress，各自绑定原SHA，未读Watch工件。当前详细需求、修补证据和验收任务集中在[补充规划文末总和](phase-20-addition.md#16-最新问题总和与必须完成的体验)；第二十二批只补规则/模板字节核验，不扩大为全部上下文精确计算或所有ADD完成。

### 文末当前结论（第二十三批）

本批另确认并修补普通skill清单没有将实际读取字节传入preview摘要，以及内层extension loader缺少外层observer链路。现在同一verified-handle读取返回raw Buffer，解析前观察，外层/本地回调分别保留并去重；固定准入拒绝穿过fallback，不能静默发布少一个skill的估算。五文件99项、三有效反转/逐字节恢复、构建及结构proven通过；无PTY。冷extension清单有字节观察，warm仍按实际全inventory/isCurrent撤值，不把缓存写成零I/O。两小清单夹具证明首次/复验各一次descriptor读取、20次同步verify不增正文读、peak1；不能代替全部source或物理I/O证据。

仍成立的缺口与用户要求保持：两个面板整体分类/导航/搜索/详情/修改配置/取消确认/重开读回、未配置具体模型可选、顶格与箭头、正文路径Tab、多skill及deep-research有限组合。原始skill核验的局部修补不代表这些整体已验收。不成立的解释仍是“没有上下键监听、resume排序反了、空配置等于未实现、npm start每次编译、4.9k就是本地公式、工具个数决定token数”。原现场唯一按键原因、真实token差额/启动收益/认证及cache writer/build并发来源继续未知。

第二十一CI实际success996files/10840tests pass/3skip/结构proven已归档，第二十CI状态success但未读全日志/Watch工件；第二十二CI本批仍in_progress，各自只绑定原SHA。当前source附件/动态来源及总成本、tokenizer/研究preview、完整面板/桌面与真实provider证据继续待补，详见[第二十三批](phase-20-addition.md#15-实施与验证证据)及[文末完整任务](phase-20-addition.md#16-最新问题总和与必须完成的体验)。

### 文末当前结论（第二十四批）

核查更正：附件已经保存严格UTF-8正文digest并在准入重读，不能归为完全缺少字节校验。本批确认并修补的是preview同步verify反复读取附件正文与不能异步取消的缺口。现复用异步inspect owner逐项比对原digest，同步verify仅检查路径/身份/实时grant；sourceAccess每次刷新read gate，await后再准入，取消等待句柄关闭settlement。六文件47项、三有效反转/逐字节恢复、构建和结构proven通过；真实runtime附件与共享组装文本estimate相等、20次同步verify零附件body读、session文件不变/零MCP连接，无PTY或生产性能结论。

确定修补的其他问题与不成立解释沿上节保留，settings/model整体看齐和正文路径/多skill/有限slash完整体验仍按[文末验收](phase-20-addition.md#16-最新问题总和与必须完成的体验)，不因本批局部绿色升级。仍未知：原现场唯一按键原因、真实token差额/冷热启动/认证接受、cache writer/build并发来源。第二十二/二十三CI本批实查仍运行，各自绑定SHA；动态/ignore/memory来源和总I/O、原生tokenizer/研究preview、面板完整字段/来源/桌面等继续待验，详见[第二十四批](phase-20-addition.md#15-实施与验证证据)。

### 文末当前结论（第二十五批）

本批确认并修补三项面板操作问题：搜索清空丢失原分类/section焦点域；搜索Esc直接关闭；从model侧栏搜索进入详情再返回，窄屏只显示侧栏而隐藏原模型行。沿[原导航](../../packages/ts-shell/src/cli/interactive/picker/navigation.ts)保存搜索前焦点域/section，settings Esc转到所选结果所属分类，model Esc先清搜索；[模型返回](../../packages/ts-shell/src/cli/interactive/picker/model.ts)在本次open精确定位内容行，后续publication不抢手动侧栏焦点。明确parent/子编辑器取消继续优先，未配置具体model仍可选中详情/配置，认证与启用分开。

跨provider返回追加用例修补前实际14pass/1fail：A分类搜到B模型再从详情返回仍过滤A。明确回返现按精确row group定位B，All范围保持All；已纳入最终聚焦与反转验证。

九文件196项、三有效反转/逐字节恢复、四静态门/构建/正式judge proven三satisfied通过；regular/fullscreen真实Node入口隔离PTY均证明settings搜索退出/section恢复和未配置model上下键/清搜索/详情返回，配置不写、活动模型不变、零message派发，两进程已退出。探针stored标记/regular详情识别/内置provider排序错误已修正并保留失败证据，不归为产品缺陷。详情见[第二十五批](phase-20-addition.md#15-实施与验证证据)。

| 分类 | 当前结论 |
|---|---|
| 确实存在且已有局部修补 | 未配置模型原先不能聚焦；resume渐进加载锁住旧自动焦点；黄条删除后残留绘制空白、编辑箭头缺失；启动先重初始化后首帧；初始context缺本地估算；原正文路径/多skill/有限方法组合缺口；本批搜索退出与模型详情返回缺口。不能将历史存在写成当前从未修补，也不能以局部验证宣称用户环境全部通过 |
| 确实仍需完善 | settings/model完整分类→导航→搜索→详情→编辑/配置→取消/确认→重开读回，全部字段/来源/scope/编辑器/桌面/真实认证矩阵；动态来源新鲜度/总I/O、原生tokenizer、研究完整preview、冷/热Node/exe及真实上下文差额 |
| 不成立的判断 | “model没有上下键监听”“resume时间排序反了”“settings完全没有分类”“稀疏配置等于功能没实现”“npm start每次编译或用户入口用错”“对话后4.9k就是本地字符公式”“工具数相近必然上下文相同”。原路径证据不支持这些解释；新探针失败也不能代替产品故障证据 |
| 尚未确认 | 原现场零可见按键的唯一根因、同模型/协议/规则/schema下真实1.7k/4.9k差额、生产冷热启动收益、真实认证接受、cache writer退出1和活跃build lock并发来源。不能写为不存在或已解决 |

用户明确要求继续保留：未配置具体模型可选、两个面板向oh-my-pi整体看齐、已提交正文顶格且编辑箭头恢复、源首位完整slash、正文路径suggestion/连续Tab、同提交所有明确skill生效，以及deep-research等有限方法命令与多skill组合，正文功能命令不执行。[完整要求](phase-20-addition.md#16-最新问题总和与必须完成的体验)及ADD任务状态独立于原Phase20的38 complete / 9 partial。

第二十二/二十三CI延迟实查已success，各绑定原SHA，仅读状态、未读全日志/Watch工件；第二十四CI实查仍运行。本批严格docs/diff通过，118既有advisory保留，addition120/audit99本地链接存在；提交推送和CI结果以phase20-addition-navigation的delivery.json另行登记，搜索/返回局部绿色不代表全部补充任务完成。

### 文末当前结论（第二十六批）

本批确认设置Model分类缺少模型/角色和当前thinking的真实入口，补Model / Session→原model/thinking owner→取消/保存/过期拒绝→settings原scope/具体入口，结果包括角色保存与已保存但应用未确认。未配置具体模型的详情、key/account取消和Default嵌套浏览均保留父链；不是通过新增配置字段模拟session状态。六文件104项、四有效反转/逐字节恢复、静态门/构建/正式judge proven三satisfied通过，详见[第二十六批](phase-20-addition.md#15-实施与验证证据)。

| 分类 | 当前结论 |
|---|---|
| 确实存在且有局部修补 | 原未配置model不能聚焦、resume渐进自动焦点停旧会话、去黄条后的留白与箭头缺失、首帧/初始估算缺口、正文路径/多skill/有限slash组合，以及面板搜索/返回和设置缺少会话模型入口。保留历史与当前修补区别，不能称全现场已解决 |
| 确实仍需完善 | settings/model完整分类→导航→搜索→详情→编辑配置→取消确认→重开读回；全部字段/来源/scope/桌面/真实认证矩阵。动态source新鲜度和总I/O、原生tokenizer、研究完整preview、冷/热Node/exe和实际上下文差额 |
| 不成立的解释 | model完全无上下键监听、resume时间排序反了、settings完全无分类、稀疏配置等于功能未实现、npm start每次编译或用户入口用错、实测4.9k就是本地字符公式、工具数相近必然同token成本。源码不支持这些解释；监听存在不否认用户无可见交互 |
| 未确认 | 原现场唯一按键根因、同模型/协议/规则/schema下真实1.7k/4.9k、生产冷热启动收益、真实OAuth/API-key接受、历史cache writer退出1及活跃build lock来源。保留unknown，不能归为不存在 |

用户要求继续完整保留：未配置具体model可选、两个面板向oh-my-pi整体看齐、正文顶格与编辑箭头、首位完整slash/正文实际路径suggestion与Tab、多skill同次生效及deep-research有限方法组合。第二十四CI状态success，第二十五CI仍运行，Watch仅状态success；本批交付以对应delivery工件绑定，不从历史CI推定。原Phase20 38 complete / 9 partial与ADD独立。

最终regular/fullscreen实际Node隔离PTY通过上述Model / Session链路：未配置详情/key取消、advisor保存后结果回settings、thinking取消/low保存；全局配置原字节不变、默认shared/角色other/effort low读回、零message/provider，两进程SIGTERM143已settle。严格docs/diff通过，118既有advisory保留。本批仍只是局部路径验收。

### 文末当前结论（第二十七批）

本批确认并修补普通布尔/枚举settings默认choice0及thinking默认auto，打开再Enter会偏离当前effective的缺口。现在按原owner当前值聚焦；未知enum先来源检查，unsupported effort只读焦点且不能提交，pending继续Apply。五文件112项、三有效反转/精确恢复、静态门/构建通过；七类真实键盘stage→discard→save→reopen有证据，仍不代表全部字段/来源/scope/desktop/认证已看齐。详情见[第二十七批](phase-20-addition.md#15-实施与验证证据)。

第二十五CI实际help生命周期两失败/10892pass/3skip，旧夹具与已批准的搜索→分类→关闭合同不符，现更正且保留订阅释放检查；第二十六CI仍运行。其余确定问题和用户要求沿[文末总和](phase-20-addition.md#16-最新问题总和与必须完成的体验)继续保留。没有上下键监听、resume排序反了、空配置等于没实现、每次编译、4.9k就是字符公式、工具数决定token数等解释仍不成立；现场唯一按键根因、真实token差额/启动收益/认证及cache-build来源继续未知。原Phase38/9与ADD独立。

最终实际Node入口regular/fullscreen小型隔离PTY均通过：已有false布尔/all枚举/medium effort按真实焦点打开、Enter保留当前值并stage、Esc取消不写；显式选择true→stage未写→Apply保存→重开聚焦true，枚举及其余config保留，session modelSelection未写、零message/provider派发。两进程SIGTERM143均settle。首轮探针错误要求两栏缩略label全长，按真实绘制与字段详情纠正，失败日志保留，不归为产品导航故障。此为隔离synthetic路径，不代表实际桌面/认证或全部字段矩阵。 正式judge实际exit0/proven、三satisfied。生产启动收益/真实token差额/认证及完整面板验收边界不变。

### 文末当前结论（第二十八批）

本批确认设置来源表单吞掉wheel，64KiB可编辑保护同时拒绝较大的只读三值来源，并阻止Enter返回。现只对绘制内容路由滚轮，复用共享Editor按4096单元/完整字素边界分页；PgUp/PgDn、Ctrl+Home/End与Enter/Esc回原详情保留暂存。只读总量上限4MiB，超限明确提示检查文件，编辑与密钥64KiB保护保留。五文件118项、三有效反转/字节恢复、四静态门/构建及正式judge proven三satisfied通过；普通/全屏实际Node隔离PTY验证大值编辑拒绝、来源wheel/翻页/首尾、两种返回及config原字节、零message/provider。详见[第二十八批](phase-20-addition.md#15-实施与验证证据)。

本批未证明完整面板已看齐或极限大配置全部可在面板检查。未配置模型可选、输入顶格与箭头、正文路径、多skill及有限方法slash组合继续依[文末总和](phase-20-addition.md#16-最新问题总和与必须完成的体验)验收；没有上下键监听、resume排序反了、每次编译、4.9k等于字符公式、工具数决定token数等解释仍不成立。现场唯一根因、真实token差额/启动收益/认证、cache-build来源继续未知。第二十七CI延迟检查仍in_progress，原Phase38/9与ADD独立、整体active。

交付后的延迟实查：第二十七CI `40248313306`实际failure，999文件/10931pass/2fail/3skip；source与attention旧焦点夹具均默认Enter期待true。source已在`4967fe9c`修正，attention现用真实上键显式选true，本地基线13pass/1fail后两文件22pass；不修改当前值焦点产品合同。`4967fe9c`远端相同/工作区干净，CI `40249904982`仍in_progress；补充提交交付另绑定，不借历史Watch success替代测试。

### 文末当前结论（第二十九批）

本批确认并局部修补代码围栏提前闭合、较长合法关闭遗留反引号及行内run误配对，避免示例斜杠误调用或代码后的真实skill被吞掉。复用core共享精确run匹配器，提示词围栏按独立关闭行判断，保留完整源范围及未闭合保守规则。七文件151项、两有效反转/字节恢复、四静态门、最终构建及正式judge proven三satisfied通过；普通/全屏实际Node隔离PTY保持配置/transcript不写、零message/provider、143退出已settle。首次build提前与反转重叠，构建正确拒绝输入变更；退出并恢复后重建通过，操作偏差与失败保留。详情见[第二十九批](phase-20-addition.md#15-实施与验证证据)。

| 分类 | 当前结论 |
|---|---|
| 确实存在且有局部修补 | 未配置具体model原不能聚焦，resume渐进自动焦点停旧记录，去黄条后的留白和箭头缺失，首帧/初始估算缺口，面板导航/搜索/返回/真实编辑器与来源阅读不足，正文路径/多skill/有限方法组合及代码边界误调用、漏skill。保留原缺口、修补证据和现场待复验的区别 |
| 确实仍需完善 | settings/model完整字段、来源、scope、编辑器、桌面和真实认证矩阵；冷热Node/exe、原生tokenizer、完整研究preview、全部动态来源与累计物理I/O、真实1.7k/4.9k差额 |
| 不成立的判断 | model完全无上下键监听、resume时间排序反了、settings完全无分类、空配置等于没实现、npm start每次编译或用户入口用错、实测4.9k必然来自字符公式、工具数相近必然同token成本，以及当前只能加载一个skill。监听存在不否认原无可见交互；双skill已有实际prompt/研究请求及所有child stage证据 |
| 尚未确认 | 原现场唯一按键根因、生产启动收益、同模型/协议/规则/schema真实上下文差额、真实OAuth/API-key接受、历史cache writer退出1及活跃build lock来源；这些不能归为不存在 |

完整用户要求继续见[文末任务总和](phase-20-addition.md#16-最新问题总和与必须完成的体验)：未配置模型可选、两个面板整体看齐、正文顶格与编辑箭头、首位完整slash和正文真实路径suggestion/Tab、同次全部明确skill及deep-research有限方法组合；正文功能命令不执行。代码示例内的driver保持字面量，实际研究driver完整数字preview仍待实现。隔离约4.3k/6.4k不替代用户真实数值拆分。本轮延迟实查`66fd7a4c`自身CI `40250056359`仍in_progress，Git另绑定，原Phase38/9与ADD独立/整体active。

第二十九批实际交付`c107c5d3c57e20812dcb3012f7671d2c84fa0531`已推送且远端精确一致、工作区干净；自身CI `40250943151`与Watch `40250943038`首次实查仍运行，工件未读。研究数字preview仍未知的具体缺口已定位：真实提交先create/arm新UUID，再加入绑定runId的研究工具及入口提示词；普通组合preview没有这些请求输入。修补须沿研究owner纯准备并重验最终请求，不能单删拦截以生成偏小数字；此次只定位，尚未实施，详见addition第二十九批。

### 文末当前结论（第三十批）

ADD-08确认待注入记忆原已有recordsFile元数据与generation检查，普通删除/修改并非全无保护；本批真实缺口是raw字节未进入复验及preview同步无界正文读取。现沿原memory store可选readOptions、verified-handle snapshot及来源tracker，512KiB单文件有界/可取消原始字节读取与runtime异步内容核验，同ID换session也撤值，不消费pending。六文件73项、三有效反转、四静态门/最终build/正式judge proven三satisfied通过；两模式实际Node小PTY修改/超限撤旧→恢复数字→view仍pending，配置/记忆及preview transcript不写、零provider，143退出已settle。首轮inspect查错事实owner的探针失败保留。详见[第三十批](phase-20-addition.md#15-实施与验证证据)。

| 分类 | 当前结论 |
|---|---|
| 确实存在、有局部修补 | 未配置model焦点、resume渐进自动焦点、输入留白/箭头、首帧与初始估算、面板完整操作不足、正文路径/多skill/有限方法及代码边界；本批补记忆raw字节和取消读取。局部证据不等于全部原现场验收 |
| 确实仍需完善 | 完整settings/model字段/来源/scope/桌面/认证，完整研究preview、原生tokenizer、动态来源/累计物理I/O和生产启动/真实上下文差额。单记录注入首次4次读、周期1次追加仍非整体成本已优化 |
| 不成立的判断 | model无按键监听、resume倒序反了、settings没分类、空配置没功能、每次start编译/入口用错、4.9k等于字符公式、工具数决定token数、当前只能加载一skill，以及原记忆所有变动全无失效保护 |
| 尚未确认 | 原现场唯一按键根因、真实同模型/协议/规则/schema1.7k/4.9k、生产冷热收益、真实OAuth/API-key接受、历史cache writer与build lock来源。继续保留unknown |

用户完整验收方向仍见[全文末尾任务](phase-20-addition.md#16-最新问题总和与必须完成的体验)：未配置具体模型可选、两个面板整体看齐、正文顶格/编辑箭头、首位完整slash/正文路径Tab、多skill实际生效及有限研究组合。隔离4.3k/4.6k不是用户真实成本证据。本轮延迟实查f8418fb9自身CI40251165765仍运行，本批Git另绑定；原Phase38/9与ADD独立且active。

### 文末当前结论（第三十一批）

本批确认并修补一次memory preview的重复body acquisition，原12pending health/候选/lifecycle共15读，现原store一次有界snapshot加发布前raw复验共2读，后续内容复验追加1。只读接口不含变更方法，每次准备新捕获，返回record/诊断分离、cached lookup取消/profile重验、发布前raw变化拒绝，pending不消费。六文件75项/三有效反转、四静态门/最终build/正式judge proven三satisfied通过；两模式实际Node隔离PTY修改/超限撤旧→恢复数字→view仍pending，preview期间config/memory/transcript不写、零provider、143退出settle。详见[第三十一批](phase-20-addition.md#15-实施与验证证据)。

| 分类 | 当前结论 |
|---|---|
| 确实存在、有局部修补 | 未配置model焦点、resume渐进默认焦点、输入留白/箭头、首帧/初始估算、面板完整操作不足、正文路径/多skill/有限组合/代码边界，以及记忆raw与重复读。局部修补及隔离证据不替代原现场全验收 |
| 确实仍需完善 | 全settings/model字段/来源/scope/desktop/真实认证、完整研究preview、tokenizer、全部动态来源及全请求/controller累计物理I/O、生产冷热启动与真实上下文拆分；本地memory两次读只覆盖本次单域 |
| 不成立的判断 | model没有上下键监听、resume排序反了、settings全无分类、空配置没功能、start每次编译/用户入口用错、4.9k就是字符公式、工具数决定token数、当前只加载一skill、原记忆全无变更保护；这些解释不支持，但不否认用户原观察 |
| 尚未确认 | 原现场唯一按键根因、同模型/协议/规则/schema真实1.7k/4.9k、生产冷热收益、真实OAuth/API-key接受、历史cache writer及build lock来源，保留unknown |

用户未配置具体model可选、两面板整体看齐、正文顶格与编辑箭头、首位完整slash/正文实际路径suggestion与Tab、多skill实际生效/有限研究组合要求继续保留于[文末总和](phase-20-addition.md#16-最新问题总和与必须完成的体验)。本轮延迟实查1dc3b0c7自身CI40252257668仍运行，Git另绑定，原Phase38/9与ADD独立/active。

### 文末当前结论（第三十二批）

ADD-08研究entry现共用参数/全部方法投影、prospective run及完整工具描述；实际create/prompt/run/save使用同一投影，纯准备不含store/runtime/执行回调，不写research或ledger、不arm、不派发。五文件37项、三有效反转、四静态门/最终build/正式judge proven三satisfied通过。研究数字preview仍拒绝，完整ID交接和实际协议/tool catalogue接入尚未完成；本批无终端改动，未运行PTY或真实provider，不能从准备层测试宣称原现场上下文已显示。详见[第三十二批](phase-20-addition.md#15-实施与验证证据)。

| 分类 | 当前结论 |
|---|---|
| 确实存在、有局部修补 | 未配置model焦点、resume渐进默认焦点、输入留白/箭头、首帧/初始估算、面板操作不足、正文路径/多skill/有限组合/代码边界与memory raw/重复读。研究入口纯准备已补，但尚无完整数字preview |
| 确实仍需完善 | 两面板完整字段/来源/scope/desktop/真实认证、研究preview身份交接及完整请求准备、原生tokenizer、全动态来源/累计物理I/O、生产冷热收益与真实上下文差额 |
| 不成立的判断 | model没有上下键监听、resume排序反了、settings全无分类/空配置没功能、start每次编译/用户入口用错、4.9k就是字符公式、工具数决定token数、当前只生效一skill、原memory全无变更保护；纯描述也不等于已获得研究执行/保存权限 |
| 尚未确认 | 原现场唯一按键根因、同模型/协议/规则/schema真实1.7k/4.9k、真实OAuth/API-key接受、历史cache writer与build lock来源，保留unknown |

用户全部交互要求与整体验收仍见[文末任务总和](phase-20-addition.md#16-最新问题总和与必须完成的体验)。本轮延迟实查e56e47d5自身CI40253191131仍运行；当前Git另绑定，不升级ADD整体完成或原Phase38/9。

### 文末当前结论（第三十三批）

本批补齐研究新建入口的本地数字preview：有界捕获、一用20秒prospective ID、实际同ID提交、完整入口prompt/run/save schema、原协议准备及来源/取消复验。预览不写研究/账本、不arm、不执行child/provider。实际终端还确认组合命令将自身command controller当成其他忙任务，已按controller与signal双重身份修补，其他任务与取消保护保留。最终九文件87项、四有效反转/逐字节恢复、四静态门/最终构建和正式judge proven三satisfied通过；普通/全屏实际Node小PTY均证明数字、零提前写入、唯一run/双skill、绑定transcript、assistant持久化、无pending及终端ready，143退出均settle。详见[第三十三批](phase-20-addition.md#15-实施与验证证据)。

| 分类 | 当前结论 |
|---|---|
| 确实存在、有局部修补 | 原未配置model焦点、resume渐进默认焦点、输入留白/箭头、首帧/初始估算、面板操作不足、正文路径/多skill/有限组合/代码边界、memory raw/重复读，以及研究新建入口缺完整preview和自身command忙误判。局部隔离证据不替代原现场全验收 |
| 确实仍需完善 | 两面板完整字段/来源/scope/desktop/真实认证、研究control/其他driver/child独立成本、原生tokenizer、全部动态来源/累计物理I/O、生产冷热启动及真实上下文拆分 |
| 不成立的判断 | model没有上下键监听、resume排序反了、settings无分类/空配置无功能、start每次编译/用户入口用错、4.9k就是字符公式、工具数决定token数、当前只有一skill生效、原memory全无变更保护；现在“研究新建入口一律不能显示数字”也不再成立。描述、数字及armed仍不能作为执行完毕或文件保存权限证据 |
| 尚未确认 | 原现场唯一按键根因、真实同模型/协议/规则/schema1.7k/4.9k、生产冷热收益、真实OAuth/API-key接受、历史cache writer及活跃build lock来源。不能将这些unknown写成不存在 |

用户的未配置模型可选、两个面板整体参照、正文顶格/编辑箭头、首位完整slash/正文真实路径suggestion与Tab、同次全部明确skill和deep-research有限方法组合要求全部保留于[文末任务总和](phase-20-addition.md#16-最新问题总和与必须完成的体验)。隔离6.8k研究/4.9k save入口不是用户真实差额，也不是研究总token；初轮回复前缀滚出视口和提交后强求立即数字属于探针readiness错误，保留失败分类。Git及延迟CI另实际绑定，原Phase38/9、ADD独立且整体active。

### 文末当前结论（第三十四批）

确认未配置/pending/error relay模型缺请求地址时，详情元数据错误回退官方同名模型，32k可误显示400k；不是排序或键盘故障。现沿所浏览目录/真实保存连接地址解析，同地址歧义不猜，无地址仅保留当前条目声明；补容量/输入输出上限/图片/reasoning设置档位及声明价格，未知保真。六文件78项、三有效反转/字节恢复、四静态门/最终构建及正式judge proven三satisfied通过；普通/全屏实际Node小PTY详情与返回通过，配置/会话模型未写、零消息/provider、143退出settle。regular探针借用屏幕与主屏输出误判已纠正且失败保留。详见[第三十四批](phase-20-addition.md#15-实施与验证证据)。

| 分类 | 当前结论 |
|---|---|
| 确实存在、有局部修补 | 未配置模型焦点、resume渐进焦点、留白/箭头、首帧/估算、面板操作、正文路径/多skill/有限组合/代码边界、memory raw/重复读、研究entry preview/自身command忙误判，以及本批relay详情错误归属与能力发现不足 |
| 确实仍需完善 | 完整settings/model字段/来源/scope/能力/类别/桌面/真实认证，研究control/其他driver/child成本，tokenizer/动态来源累计I/O、生产冷热启动及真实上下文差额 |
| 不成立的解释 | model无按键监听、resume排序反了、settings无分类/空配置无功能、start每次编译/入口用错、4.9k等于字符公式、工具数决定token成本、当前只能生效一skill、原memory全无变更保护、研究新建入口一律无数字；缺模型价格也不等于免费，不接受reasoning设置不等于没有内部推理 |
| 未确认 | 原现场唯一按键根因、同模型/协议/规则/schema真实1.7k/4.9k、冷热收益、真实认证接受及历史cache writer/build lock来源，继续unknown |

全部用户要求继续见[文末任务总和](phase-20-addition.md#16-最新问题总和与必须完成的体验)，完整面板不能从本批详情修补宣布已看齐。当前Git/CI另绑定，原Phase38/9与ADD独立且active。

### 文末当前结论（第三十五批）

确认模型列表/详情旧地址可进入新捕获准入的配置子面板，详情退出后还可操作；实际终端另确认重开仍显示旧accepted目录。这三项均为产品问题。现列表与详情保留原目标准入、取消前后复验，详情动作一次消费并在退出时终止；重开沿原配置发布只刷新catalog，保留普通设置、检查active模型约束。九文件136项、七有效反转/字节恢复、四静态门/最终构建、正式judge proven和普通/全屏实际Node隔离小PTY通过。config/session selection未写、零消息/provider、退出均settle。全屏等待未变化输入提示的探针超时单独分类，不能与实际旧目录缺口混淆；见[第三十五批](phase-20-addition.md#15-实施与验证证据)。

| 分类 | 当前结论 |
|---|---|
| 确实存在、有局部修补 | 原未配置焦点、resume渐进焦点、正文留白/箭头、首帧/估算、面板操作、路径/多skill/有限组合/代码边界、memory读取与研究入口问题；新增模型详情旧目标准入、退出复活和重开旧目录 |
| 确实仍需完善 | 完整settings/model字段/来源/scope/能力/类别/桌面/真实认证，研究control/其他driver/child成本，tokenizer/全部动态来源累计I/O、生产冷热启动及真实上下文差额 |
| 不成立的解释 | model无按键监听、resume排序反了、settings无分类/稀疏配置无功能、start每次编译/入口用错、4.9k就是字符公式、工具数决定token成本、当前只能生效一个skill；过期检查存在也不能证明重开目录已新鲜，API-key表单打开不能证明认证接受或模型启用 |
| 未确认 | 原现场唯一按键根因、真实同模型/协议/规则/schema1.7k/4.9k、冷热收益、真实认证接受、历史cache writer/build lock来源，继续unknown |

全部用户要求仍见[文末任务总和](phase-20-addition.md#16-最新问题总和与必须完成的体验)，完整面板不能从局部修补宣布已看齐。前两批CI延迟确认success，本批Git/CI另绑定；原Phase38/9、ADD独立且整体active。

### 文末当前结论（第三十六批）

确实存在：已配置模型因当前reasoning档位不兼容而被阻断时，详情只有Back，缺从面板选择兼容档位并显式启用的操作链。现Choose effort按精确relay目录展示当前不支持值及兼容选项，通过原模型事务一次保存模型和档位；取消/失效/hook拒绝不部分修改当前effort。六文件122项、五有效反转、四静态门、构建、正式judge proven及普通/全屏实际Node小PTY通过。零message/provider，全局config不写，真实settings返回与notice有owner证据，见[第三十六批](phase-20-addition.md#15-实施与验证证据)。

不成立：此类阻断一定是缺凭据、必须先修改当前模型的thinking、同名官方能力可代替relay、打开档位面板即已启用、取消后再load可以复活旧动作。原上下键监听缺失、resume排序反、工具数决定token数等解释仍不成立；用户原现场唯一原因及真实上下文差额仍未确认。

仍需完善：完整settings/model字段/来源/scope/能力/类别/桌面/真实认证，研究control/其他driver/child成本，tokenizer/全部动态源累计I/O、冷热启动及真实同条件上下文拆分。全部明确用户体验继续见[文末任务总和](phase-20-addition.md#16-最新问题总和与必须完成的体验)，不从本批局部链宣布整体已看齐；原Phase38/9、ADD独立且active。

### 文末问题总和与用户要求更正

本轮只读核对HEAD为`2a5cf9949cff57876adc20ebb8179040d7e00254`，仅补充文档。以下“原问题”指初次定位确认的修补前机制，当前已有实施证据归属前述批次；本轮没有重新运行产品测试、PTY或真实provider验证。

| 分类 | 问题或判断 | 当前结论与后续方向 |
|---|---|---|
| 确实存在的原问题 | 未配置模型被跳过，只有一个ready时方向键可无可见变化 | 用户要求是**允许聚焦具体未配置模型**。当前focusable已与disabled activation分开；还须完整验收浏览→详情→精确连接配置→返回→显式启用，不能把“继续跳过未配置行”当作修补目标 |
| 确实存在的原问题 | resume先发布旧current，今天会话到达后仍保留首次自动焦点 | 修自动/手动选择分界：未操作跟随最新可恢复候选，手动操作后刷新保留其ID。当前已有defaultSelection/selectionTouched，排序无需反转 |
| 确实存在的原问题 | 黄条移除后保留绘制空白，普通输入箭头消失 | 已提交正文从第1列开始，编辑箭头贴左且正文/续行对齐；保留用户缩进、caret与复制，不恢复黄条。局部修补仍需桌面/IME等环境验收 |
| 确实存在的原问题及未完任务 | settings/model完整导航和操作路径不足 | 已有分类、section、详情与子流程推进；完整字段/来源/scope、取消返回、保存重开、键鼠/窄屏/桌面、真实认证仍按清单验收，不能宣布整体已看齐 |
| 确实存在的原问题及未完任务 | 首帧较晚、初始上下文无本地读数、正文路径/多skill/组合缺口 | 当前已有早期输入区、本地估算及补全/组合owner；生产收益、计量新鲜度与完整输入场景另取证。多skill须检查全部body进入同一实际任务，deep-research须是真实研究入口 |
| 本轮确认的测量缺口 | 启动基准regular/fullscreen仍以`openai`作为firstFrame标记 | [基准](../../scripts/bench-interactive.mjs)测到后期模型状态，不能代表早期Loading编辑区；先区分早期首帧、输入接管与ready，再做Node/exe冷热对照。write callback也不代表终端像素呈现 |
| 不成立的源码判断 | “model没有方向键处理”“resume时间排序反了”“settings完全无分类” | 当前源码有导航、倒序机制与分类。它们不能否认用户无可见交互的观察，只能排除这些笼统源码解释 |
| 不成立的推导 | “工具数相近就应相同tokens”“问号与4.9k由同一个公式直接造成”“当前仍只能注入一个skill” | 工具实际schema、规则/消息/协议和计数来源不同；无有效计数才显示unknown；当前已有全skill解析与逐批payload证据。参考多skill内部全链不能只凭首个regex证明 |
| 仍未确认 | 原现场按键唯一根因、真实1.7k/4.9k组成、生产冷热收益、真实认证与桌面体验 | 继续取证，不能列为“不存在”或用合成数字与局部终端结果宣布已解决 |

最新需求详细清单见[补充规划第3.5节](phase-20-addition.md#35-面板看齐的交付清单)与[文末验收样例](phase-20-addition.md#164-用户输入样例与组合验收)：两个面板整体参照oh-my-pi；允许未配置具体模型选中；正文顶格并恢复编辑箭头；首位完整slash、正文实际路径suggestion和Tab；首位/正文/后续行使用多个skill；在正文skill限制上开放明确声明可组合的方法命令，deep-research与多个skill形成一个任务，功能/控制命令保持原独立路径。

### 文末当前结论（第三十七批）

确认原交互基准用后期模型名误标firstFrame，现按真实Loading编辑区/状态与正式输入提示分开观察，增加runtime接管/正式写入事件；逐sample等待close与清理，Linux实际PTY终止确认target退出。20项脚本、133项交互/startup/timing、四有效反转/字节恢复通过。Node/exe×regular/fullscreen各30个warm-uncontrolled空会话样本完成，父进程首帧p50分别480.1/537.4/284.5/278.1ms，正式输入提示1598.8/1784.6/779.9/790.8ms；冷缓存、前后节省量、真实桌面像素与项目加载量仍未证明。

延迟确认前两批CI在同一configuration旧catalog断言失败，本地复现；不是本地通过即可称CI成功，也不能为旧测试回退“重开刷新目录”要求。fixture保留catalog scope，新回归验证仅更新catalog而不接受普通settings编辑；三个相关文件68项通过，丢scope反转拒绝/恢复重验。ordinary终端double未发inputReady及反转探针过窄错误分开分类并保留失败日志。build/exe、静态门/docs与正式judge proven已通过，当前Git/CI另绑定。

所有用户明确要求继续保留；完整面板/桌面/真实认证、研究control/其他driver/child成本、原生tokenizer/全部动态来源累计I/O、真实上下文差额及生产冷热收益仍需完善。原现场按键唯一根因仍未确认；原Phase38/9、ADD独立且整体active。

### 文末最终需求汇总与问题判断（本轮文档核对）

本轮只读核对产品HEAD `4abe6f11af3bd7966796f29b996f5321b16b0140`，参考oh-my-pi仍为`0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0`。仅更新需求和调查文档，未重跑产品测试、构建、PTY、启动基准或真实认证。以下“存在”指已确认的原机制或明确剩余任务；已修补项的验证归属前述批次，不宣称本轮再次复现。

| 分类 | 问题或判断 | 当前证据与修补方向 |
|---|---|---|
| 确实存在的原问题，有局部修补 | 未配置模型不能聚焦，单ready可导致上下键无可见变化 | 当前具体未配置行已有focusable；用户要求是**允许选中未配置模型**。保持浏览→详情→精确连接配置→返回→显式启用，不能退回跳过未配置模型；原现场唯一原因仍未确认 |
| 确实存在的原问题，有局部修补 | resume先显示旧current，新会话到达仍保留首次自动焦点 | 原缺自动/手动选择分界，排序未反；未操作随最新可恢复候选更新，主动选择后刷新保持其ID |
| 确实存在的原问题，有局部修补 | 黄条删除后残留绘制空白，普通编辑箭头消失 | 已提交正文第1列绘制，编辑箭头贴左、续行对齐正文；保留用户缩进、caret/选区和原文复制，桌面IME等仍待验 |
| 确实存在的原问题，有局部修补 | 首帧过晚、初始无本地数值、旧基准误标首帧 | 已采用早期真实composer及本地估算；第三十七批已修旧`openai`标记，当前观察实际Loading编辑区及runtime接管。120个warm-uncontrolled样本绑定原测量build，最终build另有16个pilot；旧“基准仍误标”的本轮结论已过时 |
| 确实存在的原问题，有局部修补 | 正文路径、多skill、有限slash组合及代码边界缺口 | 当前补全与统一组合owner已有推进。多skill检查全部body进入一份任务；deep-research保持真实driver，brainstorm和显式可组合模板作为modifier，控制/保存/功能动作沿原独立准入 |
| 确实存在的后续缺口，有局部修补 | 预览来源/raw字节、重复记忆读取、研究新建入口准备、模型精确能力/旧详情/重开目录及档位恢复 | 前述批次各有聚焦与隔离证据；继续复用原读取、研究、模型事务和配置发布owner。不能以局部修补推导全动态来源、所有研究动作或真实认证已验收 |
| 明确仍需完善 | settings/model完整操作链与场景覆盖 | 当前settings37项、真实配置分类、两个Model / Session入口及Memory/Shell只读命令入口；按全部字段/来源/scope及model精确目标/角色/能力/配置/返回清单验收，覆盖普通/全屏、键鼠/窗口及真实环境，不以截图或同名分类作为整体完成 |
| 不成立的源码解释 | “model没有上下键监听”“resume排序反了”“settings完全没有分类” | 源码有相应导航、时间倒序和分类。排除这些笼统解释不等于否认用户观察；真正缺口在可聚焦性、自动焦点和完整操作链 |
| 不成立的能力推断 | “少Memory/Shell两个分类就是故障”“稀疏配置表示字段没有实现” | 当前元数据没有这两个分类的独立可编辑字段；原schema、默认继承和消费者存在。第四十九批已提供只读命令入口，仍不能用假编辑字段补齐十个名称 |
| 不成立的计量或启动推导 | “工具数相近就该同tokens”“1.7k/4.9k仅因字符公式”“npm start每次编译/用户入口用错” | 本地计数方式有差异，但工具schema、规则/历史/协议、provider/cache口径和实际输入集合须对齐；公式不足以独自解释真实差额。已有入口证据也不支持每次编译或用户误用 |
| 不成立的当前功能判断 | “只会生效第一个skill”“所有prompt类slash都能组合”“所有方法命令已经支持组合” | 当前有两份及更多skill的逐批payload证据。组合由实际能力声明准入，brainstorm、review driver、deep-research入口及`composable: true`模板已有声明；其他方法仍不因名字或prompt类型自动获得资格 |
| 仍未确认 | 原现场唯一按键根因、真实1.7k/4.9k组成、生产冷热收益、桌面输入与认证接受 | 缺证据就继续未确认，不能写成“不存在”或“已解决”；真实provider失败与产品路由故障仍分开 |

用户最终要求已集中到[面板盘点与剩余验收](phase-20-addition.md#36-当前面板盘点与剩余验收范围)、[输入样例](phase-20-addition.md#164-用户输入样例与组合验收)和[本轮需求收口](phase-20-addition.md#165-本轮需求收口与实施边界)：两个面板整体参照oh-my-pi；未配置具体模型允许聚焦；resume默认最新且不抢手动焦点；已提交正文顶格、编辑箭头恢复；完整功能slash仅在源首位，正文路径suggestion/Tab；同一输入的多skill实际共同生效；多个兼容方法与一个研究入口组成一份任务。启动先显示真实TUI/loading，初始上下文按实际请求本地估算并与实测正确接续。

本轮延迟读取`4abe6f11`自身CI：CI [40264741138](https://github.com/h-hei133/cheers/actions/runs/40264741138)仍in_progress，Architecture Watch [40264741044](https://github.com/h-hei133/cheers/actions/runs/40264741044)已success。两者不等于ADD整体验收；原Phase20保持38 complete / 9 partial，补充任务独立且整体active。

### 文末当前问题判断（第三十八批）

新增确认并修补的缺陷是**settings搜索焦点**：逐字输入或粘贴`topP`已将Top P排第一，但旧焦点仍留在同样模糊匹配的Input shape，Enter打开错误设置。沿原OptionModel默认选择政策让新查询聚焦最强结果，同查询用户手选保留，清空回搜索前字段；未改model可浏览性，也不能把这个缺陷认定为原现场model上下键失灵的唯一原因。

第三十八批四文件178项通过：全部37个设置/user37-project36共73条实际OverlayHost键盘链，涵盖搜索、编辑、暂存取消、Apply、effective/requested/stored读回、移除和重开；七个跨来源政策场景另走原save owner验证。有效反转使两个断言失败并逐字节恢复。普通/全屏实际Node PTY代表性Top P路径取消不写、Apply仅存0.8、重开读回、零message/model切换/provider调用通过。初轮Vitest环境字符串导致配置拒绝、stored标记和来源预期、PTY标题不符分别按夹具/探针错误分类；没有为这些失败修改产品来源政策。

构建新鲜度、责任上限0及打包judge proven/三satisfied通过。两面板完整来源/失效/窗口/桌面和模型能力/角色/真实认证仍待验；全部基本字段链不代表整体验收。已明确要求继续保留：未配置模型可选、resume自动最新/手动不抢、正文顶格/编辑箭头、正文路径/Tab、多skill实际共同生效及有限slash组合。

本批延迟实查`4abe6f11`自身CI40264741138/Watch40264741044、文档`91f0d3d3`自身CI40265697710/Watch40265697734均completed/success，覆盖对应历史提交，未读完整日志/Watch工件，也不赋予本批源码CI结果。真实1.7k/4.9k分解、原现场唯一按键根因及生产冷热收益依然**未确认**；“model没有上下键监听”“resume排序反了”“稀疏配置说明字段没实现”“工具数相近就应相同tokens”等笼统解释仍不成立。证据及剩余矩阵见[第三十八批](phase-20-addition.md#第三十八批全部设置字段操作链与搜索默认焦点)，原Phase38/9与ADD独立/active不变。

### 文末当前问题判断（第三十九批）

本批新增确认的settings缺陷是**失败Apply和保存范围确认重新捕获了新归属**：旧pending在session/project变化后第一次被拒绝，第二次Apply却写入；A→B→A仍可复现，已打开scope子面板的确认同样绕过旧binding。另确认user legacy→preferred来源变化未被拒绝、目标scope损坏时丢失面板。现沿原draft的受限reopen及原write lock修补，保留同源冲突的明确重试；取消或不可读scope保留原scope/pending，成功换scope按提示撤销pending，写后换代报告已保存/应用未确认。证据见[第三十九批](phase-20-addition.md#第三十九批设置失败重试与保存范围的原始归属)和[设置指南](../guides/settings.md)。

七文件222项通过，含原73条字段/scope基本链及17个新增生命周期场景；三有效反转/源码字节恢复、一profile无效反转如实保留。四条实际Node小型PTY覆盖普通/全屏的Top P同源冲突和user来源替换，分别验证首次拒绝/显式二次保存与连续拒绝/新开读回；零message/model变更/provider调用。TS构建新鲜、责任上限0、当前打包judge proven三satisfied已归档，不代表exe、完整面板或桌面接受。延迟实查第三十八批`05ecc6c8`的CI40268138916和Watch40268138889均success，未读完整日志/Watch工件；本批源码CI另绑定。

以下为文末最新汇总，保留用户观察与源码解释的区别：

| 判断类别 | 当前问题或结论 |
|---|---|
| 确实存在，已有局部修补 | 原model禁用行不可聚焦，只有一行ready可表现为上下键无可见变化；要求始终是**允许选中未配置具体模型**，浏览详情/配置与实际启用分开。resume原渐进加载保留首次自动焦点；自动阶段随最新会话，手动选择后不抢焦点。已提交消息残留左padding、普通编辑箭头缺失也有局部修补 |
| 确实存在，继续完善 | settings/model整体分类、section、搜索、详情、配置/编辑、返回、保存读回及窗口体验须向oh-my-pi看齐。settings全部37项基本链和代表性重试/scope/source生命周期已有证据，完整字段×来源×编辑器×窗口/桌面和model精确目标/能力/角色/真实认证仍待验 |
| 确实存在，已有局部修补 | 首帧过晚、初始只读provider用量而出现问号、正文路径/Tab、多skill共同生效、有限slash组合及代码边界缺口。已沿真实TUI交接、请求本地估算、原补全/组合/研究owner推进；完整功能slash仅限源首位，正文开放路径、skill和明确准入方法，deep-research加多skill构造一份真实任务 |
| 本批确定并修补 | settings失败重试/scope确认把旧pending带到新binding、user来源selector未保护、不可读scope丢面板。修补不禁止普通同源冲突重试，不将磁盘写入称为运行时已接受 |
| 不成立的笼统解释 | “没有上下键监听”“resume排序反了”“settings无分类或稀疏配置说明无实现”“Memory/Shell菜单名缺失就一定是故障”“每次npm start都编译/用户入口用错”，当前源码与既有证据不支持；排除这些解释不否认用户观察 |
| 不成立的计量或功能推导 | 工具数量相近不能推出token相同；对话后4.9k不能直接归因于本地字符公式。当前已有多skill实际payload证据，不再是只能加载首个；但prompt类型或“非功能性”标签不自动赋予组合资格，未声明的其他方法仍不构成支持承诺 |
| 仍未确认 | 用户原终端按键无交互的唯一原因、真实1.7k/4.9k分项差额、同条件冷热/修补前启动收益、真实桌面IME/剪贴板与认证接受。不能列为“不存在”或“已经解决”，不由合成PTY、结构judge或历史CI补造证据 |

详细需求与验收仍集中在[phase-20-addition文末](phase-20-addition.md#16-最新问题总和与必须完成的体验)：未配置模型可选；两个面板整体看齐；已提交正文顶格、编辑箭头贴左且续行对齐；正文`/home` suggestion/Tab；首位与正文多skill真实共同生效；兼容modifier与deep-research入口组合为同一任务；启动先显示真实TUI/loading、上下文按实际请求本地估算再衔接实测。原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 文末当前问题判断（第四十批）

新增确认同协议relay分类使用runtime级凭据聚合，错误把未配置分类标为可用并排在真实ready分类之前。现分类从自身精确已准入模型行派生状态、ready优先且组内稳定；具体未配置/阻断行仍可浏览，刷新保持手动身份。分类12项及相关五文件84项、原源码有效反转/恢复、普通/全屏×有ready/全部缺失四条实际Node小型PTY通过；配置/模型不写、零message/provider请求、进程close已确认。见[第四十批](phase-20-addition.md#第四十批模型分类的精确可用性与主题原草稿重试)。

上一提交CI实际因主题测试旧host重捕获夹具失败，本地同断言复现；按原draft.reopen合同修夹具，补拒绝重开不保存并保留pending，未回退产品归属保护。TS build当前fresh与结构judge proven只作为各自证据。完整model/roles/能力/认证/桌面及settings交叉矩阵、上下文真实差额和性能仍未验收，原Phase38/9、ADD独立且整体active。

### 文末当前问题判断（第四十一批）

新增确认目录删除手动焦点后回首项、navigation保留旧ID且无提示。现实际host数据刷新仅在旧焦点失去浏览资格时调用model owner；确认离开完整目录后按旧可见精确ID选幸存邻居并提示，搜索失去匹配不能报删除，生存身份/手选继续保留，禁用空占位Enter拒绝。最终五文件136项、三个有效反转/恢复、TS构建fresh及结构judge proven通过；本批没有真实桌面/终端目录删除PTY或认证证据。见[第四十一批](phase-20-addition.md#第四十一批目录删除后的邻近模型焦点与状态)。完整追加体验及真实环境缺口保留，原Phase38/9、ADD独立且整体active。

### 文末当前问题判断（第四十二批）

新增确认role/thinking在Escape、close或替换后仍接受旧动作、load复活，子入口未复验原目录；原事务未检查signal。现永久退役/一次消费，子入口与writer沿原准入检查取消和失效。实际跟踪链另确认子Escape取消父共享controller、disabled inspection和input action复制丢WeakMap身份；现显式返回转交父生命周期、本地preview退休，根关闭/构建失败/shutdown取消，action wrapper携带不透明owner。角色保存继续保留默认模型、其他角色和个人配置，见[第四十二批](phase-20-addition.md#第四十二批角色动作退役与子面板返回生命周期)。

单进程串行五文件152项、六有效反转/字节恢复、最终TS fresh及结构judge proven通过。最终普通/全屏实际Node小型PTY覆盖赋值取消/重开保存、档位取消/重开low保存/返回读回及清除，零message/provider请求、个人config不变、143退出close确认。初轮regular屏解析超时及input夹具漏validate分别归类探针/夹具错误；没有真实认证、exe或桌面结论。延迟查f6582038及af282d5e自身CI/Watch均success，未读完整日志/Watch工件，本批CI另绑定。完整两个面板交叉矩阵及计量、性能、真实环境缺口保留，原Phase38/9、ADD独立且整体active。

### 文末当前问题判断（第四十三批）

新增确认已存角色high在目录仍支持low/medium但禁用high时被chooser漏掉，default Enter落到auto并可覆盖原值。现保留active · unavailable只读焦点，Enter/直接旧值apply拒绝，用户明确移动到支持档位才写；三个自动角色host操作及普通/全屏实际Node小PTY均保留默认档位、兄弟角色和个人config。三文件67项与原源码有效反转/字节恢复、TS fresh和结构judge proven通过，见[第四十三批](phase-20-addition.md#第四十三批不可用已存角色档位的只读默认焦点)。零test invocation及启动前state基线误判分别分类，不修改产品政策或恢复合同迎合探针。完整模型/设置/认证/桌面及计量性能矩阵仍待验；第四十二批36971a16已远端确认，CI待后续实查。原Phase38/9、ADD独立且整体active。

### 文末当前问题判断（第四十四批）

普通Thinking chooser新增七条host baseline失败确认退出旧apply/load、未load/多ID、准入内close及待定hook跨close/同实例重开没有边界。现原choice/浏览代次捕获并传原事务准入，等待动作互斥；显式新开可获最新值，旧动作不能写入或重开父级。保留写后关闭的确认通知，不把UI生命周期当持久结果。三文件35项、四有效反转/源码恢复、最终两模式Node小PTY取消/重开medium/明确low保存/重开读回、TS fresh与结构judge proven通过；roles/config保留、零请求。fullscreen未重绘hint超时为探针同步错误，根相对脚本路径/内联引号错误为未执行探针，均不改变产品政策。见[第四十四批](phase-20-addition.md#第四十四批普通档位面板的浏览代次与异步提交边界)。36971a16/156491b1的CI仍运行、各Watch成功，本批CI另绑定；完整交叉矩阵/真实认证/桌面与计量性能未验，原Phase38/9、ADD独立且整体active。

### 文末当前问题判断（第四十五批）

9702faa3 CI40315494878实际失败在脚本终止断言，未到后续产品测试。原kill(pid,0)将PID存在当作目标仍运行；新确定性zombie夹具证明退出但未reap时也成功。测试改为原starttime身份及/proc state有界检查，并用live父进程验证仍能拒绝活目标；原CI那次残留状态仍未知，本地原测试和六次小观察均absent，不称已复现它。15脚本断言/有效反转/字节恢复通过，没有改变benchmark/relay/product执行或重跑产品验收。见[第四十五批](phase-20-addition.md#第四十五批ci终止探针的实际目标身份与退出状态)。36971a16 CI/Watch已success，156491b1 CI仍运行、Watch成功；当前修补CI另绑定。ADD整体及真实环境缺口继续active。

### 文末当前问题判断（第四十六批）

新增确认resume默认焦点仍有一个实际时刻排序缺口：有效ISO时间被当作字符串比较，不同时区偏移或小数秒可让较早会话排到最新。现沿原session picker按`Date.parse`的epoch取最新并以稳定ID处理同刻；置顶继续只影响列表顺序。真实OverlayHost路径覆盖渐进刷新自动/手动、搜索与project scope换代；session55项加lifetime4项通过，恢复旧比较器后4个断言失败并逐字节恢复。四静态门、责任上限0、TS build与结构judge通过，未运行全仓、exe、真实20k PTY或桌面平台。见[第四十六批](phase-20-addition.md#第四十六批resume默认焦点的实际时刻语义)。ADD-04逻辑边界增强，但整体及真实环境验收继续active。

### 文末当前问题判断（第四十七批）

新增确认认证快捷入口的发现性缺口：`/login`、`/logout`虽委托现有连接owner，却没有provider/flag提示或saved-connection补全，且不能把`/connect logout`的动作别名直接泄漏到顶层语法。现从`connectSyntax`派生login/logout快捷语法，登录补全provider与认证flags，登出复用连接目录，执行仍只走原认证路径。registry/suggestions/connection三文件73项通过，移除两处投影后各有1项有效失败并逐字节恢复。四静态门、构建、结构judge与严格docs另绑定；真实认证、全仓、exe和桌面PTY未验。见[第四十七批](phase-20-addition.md#第四十七批认证快捷入口的语法与连接发现性)。ADD-13入口发现性增强，真实环境矩阵继续active。

### 文末当前问题判断（第四十八批）

补ADD-13注册表合同，锁定theme/statusline继续从settings Appearance发现，connect与login/logout继续说明原连接owner，view继续说明用户/开发者输出消费者，`theme`与`tui.statusItems`仍归属正确settings section。该合同不新增第二套主题、状态栏、认证或视图实现，也不把菜单存在冒充真实provider/桌面通过。registry13项通过，见[第四十八批](phase-20-addition.md#第四十八批add-13入口发现性合同)。ADD-13本地组织与兼容入口合同已收口，完整ADD及真实环境证据继续保持active。

### 文末当前问题判断（第四十九批）

settings根目录现补Memory / Review与Shell / Diagnostics两个只读入口，分别插入`/memory status`和`/shell status`草稿。入口可搜索、分类导航并说明真实owner，但不读取状态、不保存配置，也不是新增可编辑字段；实际输出仍需用户提交原命令。真实OverlayHost分类/Enter/零保存路径及settings39、fields98、session14、source8共159项通过，移除capability rows可触发有效失败并恢复。见[第四十九批](phase-20-addition.md#第四十九批memory与shell的只读owner入口)。四静态门、构建、judge和docs另绑定；完整面板及真实命令/桌面环境继续active。

### 文末当前问题判断（第五十批）

review被确认不是纯modifier：它读取真实Git snapshot并生成一份只读review prompt。现`/review`及audit/check别名声明为单一driver，正文组合时消费共享问题、brainstorm指令和全部skill，再由原Git workbench生成一次prompt；第二个driver在派发前拒绝，独立首位命令不变。真实Git fixture验证untracked证据、skill/modifier/prose进入同一review，review runtime/composition/prose三文件54项通过；移除driver声明后5项有效失败并恢复。见[第五十批](phase-20-addition.md#第五十批review作为单一git-review-driver)。未运行真实provider、全仓、exe或桌面PTY；ADD-12局部边界增强，整体及真实环境验收继续active。

### 文末当前问题判断（第五十一批）

ADD-08确认正文`/home`仍会让preview构造完整command registry，从而枚举模板目录并读取无关模板；普通无slash草稿不加载模板这一点不能掩盖该成本缺口。现preview从源token及兼容`/ ordinary`命令源派生候选名，[命令registry](../../packages/ts-shell/src/core/commands/registry.ts)只按候选名调用原模板loader；精确探测不枚举无关文件，跟踪候选根目录revision，并限制512候选、单文件512 KiB、总读取8 MiB。`AbortSignal`在同步步骤之间检查，不声称`readFileSync`内部可中断。

`templateLoader`12项、`preview`30项及其相关组合/路由/补全/keymap共207项通过，另source capture/sources 12项通过。把preview恢复为完整registry后超限模板测试失败，移除同步取消检查后候选取消测试失败，均恢复源码并重验。见[第五十一批](phase-20-addition.md#第五十一批模板候选发现成本与取消边界)。同名路径与可组合模板的提交歧义仍保留，原生tokenizer、真实差额、其他driver完整preview和完整动态来源总成本仍未验收；ADD整体及真实环境证据继续active。

### 文末当前问题判断（第五十二批）

组合解析确认一个会静默改写用户输入的确定缺口：方法没有声明任何flags时，紧随其后的`-`开头正文仍被当成option移除；review与可组合模板因此丢失`--keep-this`/`--counterexample`。现只有声明flags的方法进入严格option扫描，flagless driver/modifier保留共享prose；brainstorm/research未知flag仍拒绝。91项聚焦、两个有效反转/字节恢复和独立只读review有局部证据，真实终端未另跑。

同一轮把settings测试从旧八类同步到Memory/Shell只读入口后的当前十一类，解决`78f026f5`的CI唯一设置失败；没有改产品分类或增加可编辑字段。`e0116e86`另四个浏览器smoke失败在未改浏览器代码的提交出现、前一提交同套件通过，仍归类证据不足的负载/夹具/潜在流边界问题，不将`ECONNRESET`直接重分类为unsafe output，也不称产品回归或已修复。见[第五十二批](phase-20-addition.md#第五十二批flagless组合正文与设置分类ci合同)。ADD整体及真实环境验收继续active。

### 文末当前问题判断（第五十三批）

ADD-10/08新增确认正文`/home`补全和首位自定义可组合模板查找都仍会构建完整command registry并读取无关模板body。现只对当前命令做精确模板查找；前缀补全使用有界目录迭代，512名称/4096入口/512 KiB单文件/8 MiB总读取上限，入口间检查取消。高优先级同名模板超预算时遮蔽低优先级元数据，builtin先于模板解析；扩展注册继续严格精确碰撞查找，避免预算拒绝释放已有名称。七文件161项、六个有效反转/逐字节恢复及独立复审no findings有局部证据。

四静态门、责任上限0、TS build `f17e7f7ce533`和正式judge proven另绑定；未运行真实provider、全仓、exe、桌面或20k PTY。正文路径/Tab、多skill和组合的完整真实终端矩阵仍未完成，原Phase38/9、ADD独立且整体active。见[第五十三批](phase-20-addition.md#第五十三批正文补全的模板候选与命令归属边界)。

### 文末当前问题判断（第五十四批）

ADD-10确认首位`/home`同时存在命令与真实路径时，原先不是吞掉path，就是只保留composition命令，无法在同一菜单中安全选择。现只对当前完整目标执行一次file/directory存在性检查；真实目标存在时合并command与path，命令优先，alias隐藏但参与碰撞。Enter仍提交精确命令，Tab接受path。孤立绝对file加引号，带第二分隔符的路径与directory保持原表达式，避免接受后误触发slash路由。

五文件245项、七个有效反转/逐字节恢复及最终独立只读review无findings有局部证据；五静态门、责任上限0、TS build `a0dc9a90154f`、inputs/artifact freshness和正式judge proven另绑定。未运行全仓、exe、真实provider、桌面、PTY或Windows；见[第五十四批](phase-20-addition.md#第五十四批首位命令与真实路径歧义)。原Phase38/9、ADD独立且整体active。

### 文末当前问题判断（第五十五批）

ADD-08新增确认`/shake apply|restore`改变派生上下文后，旧provider prompt measurement仍可被`/context`和状态栏当作当前值，交互估算身份也未绑定`contextSelection`。现选择owner只承认hash有效且实际改变投影的条目；空/stale/无效果选择不构成prompt identity。`apply`只在真实变化后`markContextUnknown`并清除`promptIdentity`，无变化不写状态；`restore`在无有效选择时直接返回`unchanged`，不消费准入；`status`分别报告有效与被忽略条目。

四文件118项、三个有效反转/逐字节恢复及最终独立只读review无findings有局部证据；五静态门、责任上限0、TS build `aa7aec1ced32`和正式judge proven另绑定。缓存仍以selection对象与turns数组身份绑定，原地改消息的极端路径未覆盖；未运行全仓、exe、真实provider、桌面或PTY。见[第五十五批](phase-20-addition.md#第五十五批上下文选择后的测量失效与有效条目身份)。原Phase38/9、ADD独立且整体active。

### 文末当前问题判断（第五十六批）

ADD-09确认`/context`虽能显示目录估算、请求字节和provider用量，却没有实际组装请求的独立本地token估算。现发送时的request projection只保留冻结的数字摘要，按协议字段计算`assembled-request`估算；图片使用固定allowance且不按base64长度计数，opaque reasoning/不兼容字段保持unavailable。报告将目录、实际请求和provider用量分成独立事实，不把本地字符估算冒充provider测量。

六文件176项、两个有效反转/逐字节恢复及最终独立只读review无findings有局部证据；五静态门、责任上限0、TS build `abc97ad25d30`、inputs `a16517030700`和正式judge proven另绑定。固定图片allowance和字符估算仍不是原生tokenizer，真实1.7k/4.9k差额、真实provider及生产性能未验。见[第五十六批](phase-20-addition.md#第五十六批实际组装请求的本地估算事实)。原Phase38/9、ADD独立且整体active。

### 文末当前问题判断（第五十七批）

ADD-08确认有效脏工作树上的standalone与正文review仍显示unknown：preview只放行deep-research driver，且review不是`preparePrompt`模板。现preview显式准入review driver/standalone，与dispatch共用review request focus准备；从原Git workbench取一次snapshot和review prompt，强制与`gitRequestMode`一致的plan mode，传播取消信号，并在内容复验时用原`assertGitSnapshot`核对完整fingerprint。clean/unreadable、缺少workbench、第二driver和取消仍在模型准备前拒绝；不调用通用`gitCommand`、`runReviewCommand`或`execute`。

五文件93项、两个有效反转/逐字节恢复及独立只读review有局部证据；旧driver门反转出现8项失败，移除plan override出现4项失败。五静态门、责任上限0、TS build `134c5c64ce2b`、inputs `509863f0359e`和正式judge proven另绑定。预览与提交仍各取一次Git snapshot，未共享one-use reservation；真实provider、全仓、exe、桌面和PTY未验。见[第五十七批](phase-20-addition.md#第五十七批review预览复用真实git-prompt)。原Phase38/9、ADD独立且整体active。

### 文末当前问题判断（第五十八批）

review preview与dispatch原先各取一次Git snapshot，预览数值可能对应旧工作树。现Git workbench持有不持久化的one-use slot；完整预览验证通过后才发布，dispatch只在focus、20秒期限和canonical session/config/workspace/history/attachment binding仍匹配时消费。过期、binding变化或diff期间工作树变化明确拒绝，不静默换snapshot；完整preview guard在消费时重跑，source/injection/attachment或Git验证失败都会丢弃slot，controller timeout/stop也会dispose未settle的preview。过期tombstone会保留到成功替换或同focus消费，图片附件纳入摘要，standalone review失败恢复原始draft。

九文件222项、三个新增有效反转/逐字节恢复及最终独立只读review无findings有局部证据；移除完整preview guard触发preview 1项失败，移除expired tombstone触发Git operation 1项失败，移除controller in-flight dispose触发controller 1项失败。五静态门、责任上限0、TS build `9e23fa7256ee`、inputs `823648b90f2a`和正式judge proven另绑定。未运行真实provider、全仓、exe、桌面或PTY，真实并发Git工作树与平台矩阵仍待验。见[第五十八批](phase-20-addition.md#第五十八批review预览的one-use-git-snapshot-reservation)。原Phase38/9、ADD独立且整体active。

### 文末当前问题判断（第五十九批）

ADD-08确认deep-research preview的reservation消费只复核metadata，未执行预览已经捕获的原始来源、注入和附件guard；工作树之外的动态来源可在预览与`runtime.create`之间变化，导致显示估算与实际run输入漂移。现发布时保留detached request、图片摘要和完整`verifyContent`，提交先消费entry，再以command signal等待复验；请求不匹配、discard、过期、来源变更、配置/会话变化和取消明确拒绝，不静默创建fresh run，也不写state或ledger。CLI bridge传播父signal，standalone dispatch在session command owner内运行，pre-submission refusal恢复原始draft。

13文件214项、七个有效反转/逐字节恢复及多轮独立只读review有局部证据；五静态门、责任上限0、TS build `901bcffeef12`、inputs `8d18923e65a4`、artifact `c2145971d843`和正式judge proven另绑定。末轮复核修正取消期间tombstone保留，最终无findings。未运行真实provider、全仓、exe、桌面或PTY；见[第五十九批](phase-20-addition.md#第五十九批研究预览的原始来源与one-use准入)。原Phase38/9、ADD独立且整体active。

### 文末当前问题判断（第六十批）

ADD-02确认模型认证await后只调用`owner.isCurrent()`，因此原admission撤销或原signal取消而session/workspace身份不变时，仍可能返回model continuation并重开picker。现[模型认证 owner](../../packages/ts-shell/src/cli/interactive/picker/model/auth.ts)在sign-in返回后调用`owner.check()`，拒绝只保留安全note、不返回next；成功/失败认证仍沿原回返路径，真实host取消不重开。三文件137项、有效反转/逐字节恢复及独立只读review无findings有局部证据；五静态门、责任上限0、TS build `a3dd8c19d4b2`、inputs `af270b6ddc7b`、artifact `391db3bd812d`和正式judge proven另绑定。未运行真实provider、全仓、exe、桌面或PTY；见[第六十批](phase-20-addition.md#第六十批模型认证取消后的原始准入)。原Phase38/9、ADD独立且整体active。

### 文末当前问题判断（第六十一批）

ADD-08确认review preview失效标记仍按focus/expiry分散保存，changed focus、replacement preview失败、verification失败或controller自动退休可能让后续`/review`静默取得fresh Git snapshot；旧异步verification也可能覆盖replacement reservation。现[Git workbench](../../packages/ts-shell/src/workflow/git/service.ts)使用workbench级invalidation，并以`reviewTake`/`reviewEpoch`贯穿reservation消费、完整preview复验和prompt/diff构造；成功review或已验证非review preview才清除，显式`dispose`仍释放slot。controller automatic retirement调用`invalidate`，保留stale owner state；显式cleanup保持原路径。

四文件118项、有效反转/源码逐字节恢复有局部证据；五静态门、责任上限0、TS build `8ff6550a60e7`、inputs `03894378e856`、artifact `07f593317543`和正式judge proven另绑定。首个delegated review未返回，替换review因模型账户cooldown不可用，不能记为review approval或no-findings。未运行真实provider、全仓、exe、桌面或PTY；见[第六十一批](phase-20-addition.md#第六十一批review-stale-marker-与异步准入代次)。原Phase38/9、ADD独立且整体active。

### 文末当前问题判断（第六十二批）

ADD-08继续确认提交竞态：用户提交已发布的review preview后，busy身份变化可能让context controller在500ms轮询中自动invalidate reservation；同时reviewTake在diff前提前清空会让post-admission失败回落fresh snapshot。现controller支持suspend/resume，preview verifier在suspended abort时不把取消误记为来源失败；Git workbench保留reviewTake到prompt/diff与最终检查完成，失败按epoch留下stale marker，Git resolution失败在消费前返回。

五文件234项、三个有效反转/源码恢复及最终独立只读复审无findings有局部证据；五静态门、责任上限0、TS build `07e2421013da`、inputs `22fefb1161e4`、artifact `a69987ef6b00`和正式judge proven另绑定。真实I/O/timing stress、真实provider、全仓、exe、桌面或PTY未验；见[第六十二批](phase-20-addition.md#第六十二批提交期preview生命周期与review租约)。原Phase38/9、ADD独立且整体active。

### 文末当前问题判断（第六十三批）

ADD-10/11新增确认正文非首位file与slash命令同名时仍可能以裸路径接受，随后被组合解析当作命令；代码、转义slash和URL命令参数也可能请求路径目录。现非目录file只在非首位执行精确命令碰撞并加引号，directory不触发精确命令/模板读取；literal过滤在path catalog前生效，quoted Unix/相对/Windows drive/UNC路径共用同一谓词。`/home`测试不再读取宿主目录。

三文件122项、四个有效反转/逐字节恢复及最终稳定只读review无findings有局部证据；非组合命令夹具的复审缺口已改为真实`/brainstorm`正反对照。五静态门、责任上限0、Phase 20脚本38 complete / 9 partial / 0 open、TS build `1e15b8d6239e`、inputs `cd0db660bc77`、artifact `94310bb1b156`、manifest fresh 460/1882和正式judge proven另绑定。非`scheme://` URI、Windows真实目录枚举、有界模板发现成本和用户原终端未验；见[第六十三批](phase-20-addition.md#第六十三批正文路径碰撞字面量与windows引号边界)。原Phase38/9、ADD独立且整体active。

### 文末当前问题判断（第六十四批）

ADD-10/11确认正文引号从token前缀之后开始时，当前tokenizer只在token首字符识别quote；`focus="literal /review text"`会把中间的`/review`暴露成组合driver，`focus="literal /skill:a text"`也会错误注入skill。现`promptTokens`保存quote范围/闭合状态，并把整个含空白span保留为literal token；shell式单引号、首字符空白或Unicode、内部apostrophe、后续非字面调用以及解引用后的prefixed path都有正反覆盖。prose完成只替换quote范围，保留`path=`前缀和闭引号后的suffix；含apostrophe的路径改用双引号完成。

ADD-08同时确认`/context`只把live identity的schema/system传给`measuredPromptContext`，漏掉history和relay地址，因此另一history或同协议relay的旧测量可能显示为当前值。现`/context`传递live `historyDigest`并从生效base URL派生`endpointId`；测量owner在记录含protocol/endpoint/history/relay身份但调用方无法提供时拒绝复用，compaction还从当前消息prefix派生history digest后才复用provider count。八文件180项单进程通过；五个独立契约恢复旧实现后触发19项预期失败，源码逐字节恢复。五静态门、责任上限0、Phase 20脚本38 complete / 9 partial / 0 open、TS build `530a74afb231`、inputs `557174e78290`、artifact `759b792ec77a`、manifest fresh 460/1882和正式judge proven另绑定。见[第六十四批](phase-20-addition.md#第六十四批正文引号权威与context计量身份)。未运行真实provider、全仓、exe、桌面或PTY；真实history/relay切换与用户原环境仍待验。

### 文末当前问题判断（第六十五批）

ADD-01/02新增确认三类可复现偏差：解析后的请求target可能与行标签不同，但行仍显示为可激活；从详情返回时被删除目标没有previous-visible fallback而静默回首项；同一connection在canonical与更具体relay目录中可同时显示active。现模型行先经原`exactTargetMatches`准入，mismatch行保持disabled并只进入详情；详情返回带原分类previous rows做邻近回退和notice；canonical/relay别名均可浏览，但只有精确目录项标active，canonical显示alias。阻断current详情补精确metadata，搜索空态与空目录分开，watcher以初次load的revision为基线。

17文件317项、六个契约的三组反转（9项预期失败）及普通/全屏实际Node PTY有局部证据；五静态门、责任上限0、TS build `95ad9745fe4c`、inputs `11a4b98a8004`、artifact `f0c767167db1`、manifest fresh 460/1882和正式judge proven另绑定。架构复审为WATCH：详情仍是静态快照、焦点notice不会在后续成功刷新时自动清除、provider-slot exactness弱于named connection；非当前provider的env/profile切换仍是已记录的产品范围选择。见[第六十五批](phase-20-addition.md#第六十五批模型行目标准入详情返回与发布基线)。未运行真实provider、全仓、exe或桌面，原Phase38/9、ADD独立且整体active。

### 文末当前问题判断（第六十六批）

ADD-01/02收口模型详情的目录换代边界。详情现绑定当前accepted revision与exact record identity，首帧前、action前及异步边界后都复核；同ID replacement与删除都进入Back-only unavailable，reload失败则明确提示无法刷新而不是伪装删除。搜索/分类origin贯穿刷新与嵌套account/key/effort返回，暂态notice在下一accepted revision清除，原transaction notice保留。`OverlayHost` acceptance token阻止详情在host被替换后继续publish/apply，普通picker路径不变。

17文件426项、九个独立契约反转与源码逐字节恢复、独立只读review no findings，以及普通/全屏实际Node PTY有局部证据；PTY拒绝stale action、重开读取replacement endpoint、masked key取消无泄露，并保持零model写、零message、零provider调用和143 close。五静态门、责任上限0、module facade 0、Phase 20 38/9/0、TS build `3156e9912180`（inputs `335af1c1d171`、artifact `619abdf46909`）、manifest fresh 460/1882及正式judge proven另绑定。见[第六十六批](phase-20-addition.md#第六十六批模型详情刷新目录换代与宿主所有权)。未运行真实provider、全仓、exe、桌面、Windows或20k PTY，原Phase38/9、ADD独立且整体active。
