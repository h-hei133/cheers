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

你补充的现象让问题更明确了。**resume 的渐进目录更新会保留最初自动选中的旧会话；model 的实测是上下键没有任何可见交互，仅一个模型配置、其余候选禁用是可能的原因；fullscreen 首帧仍等运行时初始化，首轮上下文也没有本地估算展示。** settings 已有分类，但它和 model 的面板层次仍与参考有差距；两者向参考 A 面板看齐的方向已经明确。`npm start` 当前不自动编译。

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
