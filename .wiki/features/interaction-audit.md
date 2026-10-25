---
title: "日常交互问题逐项核查"
category: article
created: 2026-10-25
updated: 2026-10-25
tags: [features, interaction, investigation]
summary: "回答第三及第八至十六项反馈，区分当前源码事实、既有裁决、实际能力差距和未复现现象。"
confidence: mixed
---

# 日常交互问题逐项核查

你反馈的现象里，既有真实能力差距，也有当前实现与预期不同的地方。**最明确的差距是 model 缺少分类导航、首轮完整上下文估算没有进入状态栏，以及部分命令入口的职责不容易看懂。** settings 当前已有分类；resume 当前默认选中的是正在使用的会话；`npm start` 当前不自动编译。

核查日期为 2026-10-25，源码基线为 `4f0f282feb0bc608dc8e57026fbfa32521e5a685`，开始时当前分支 main、工作区干净。先读启动规则、根部 HANDOFF、开发日志、重构计划及 Phase 20 决策，再沿具体调用链检查实现与测试源码。23–37 研究是此前的证据与规划来源，不能把其中旧版本的行数限制、启动命令和工具数量当作当前事实。Phase 20 当前状态见[交付记录](phase-20-status.md)，延期的真实条件验收继续延期。

本文只交付调查结果，不修改产品。没有运行产品、测试、构建、远端 provider 或 PTY；仅有源码阅读、既有原始工件读回及静态检查。两条委派研究均只读，未执行验证。未运行真实二进制加载 20,000 条消息的压测。

下文的“证实”表示当前源码或原始工件直接支持；“推断”表示能解释现象但尚未捕获你的实际运行；“未验证”表示缺少本轮运行证据。源码里有测试，不等于本轮测试通过。

## 逐项结论

| 原编号 | 当前结论 | 判断边界 |
|---|---|---|
| 第三 | resume 是分页会话目录；每次打开重新取目录，默认聚焦当前会话 | 加载机制和焦点规则证实；本机加载时长未测 |
| 第八 | model 有键盘交互链，但“只能 Esc”根因未证实 | 不能宣布已修复，也不能从全部禁用直接推出键盘失灵 |
| 第九 | model 没有分类导航 | 当前真实界面差距，高置信度 |
| 第十 | settings 已有七组加 All；比参考的导航层次和覆盖范围少 | 无分类不符合当前源码，发现性不足是 UX 推断 |
| 第十一 | 普通输入形态的箭头被明确移除 | 当前源码及既有裁决一致；是否恢复属于新选择 |
| 第十二 | 问号源于仅显示身份匹配的 provider 实测；4.8k 与 1.7k 不具备直接比较条件 | 完整首轮估算展示缺失；工具目录报告还存在口径误导 |
| 第十三 | `npm start` 用已构建 JavaScript，执行字节校验，不自动编译 | 命令没用错；当前机器耗时和参考速度差未实测 |
| 第十四 | 存在重复入口和功能交集，但不全是重复实现 | 逐项说明见下表，不能只按名字删除 |
| 第十五 | 配置文件存显式覆盖值；当前项目文件确实是空对象 | 不代表参数没实现；个人层与最终有效值未读取验证 |
| 第十六 | 默认输入和已提交用户消息仍有一格左侧留白 | 现象成立；与既有 padding=1 裁决一致，并非漏掉缩进修复 |

## 第三：resume 是什么，为什么每次加载，为什么没选最新一条？

**它是保存会话的浏览与恢复面板，不是当前对话的实时历史窗口。** 它提供项目范围、时间分组、置顶、搜索、分页、摘要预览和恢复选择。打开以后，面板先进入 loading，异步获取这一轮目录；接受选择时还要重新检查会话身份、版本和当前项目。

每次打开创建新的浏览生命周期，会重新获取并核查来源。单次浏览的后续页面复用有界目录索引；重新打开才能把更早页面的变化纳入新快照。这解释了“每次像重新加载”。它与启动恢复摘要的持久缓存是两条已有用途不同的路径：前者供显式选择，后者加快启动时恢复候选的发现。不能由面板出现 loading 推出“启动缓存没有使用”，也不能把 loading 本身说成启动更快的证据。

**选中项与列表排序是两件事。** 排序为置顶优先，再按更新时间从新到旧，相同时间按 ID 稳定排序；初始焦点则明确取当前活动会话 ID。当前会话比其他会话旧时，打开后滚动到它符合现在的设计。若当前会话不在可选结果中，OptionModel 才保留或选择第一个可选项。因而“没有选最新”是可成立的观察，但当前证据支持的是预期差异，不是时间排序写反。

依据：[session picker](../../packages/ts-shell/src/cli/interactive/picker/session.ts#L140)、[目录加载](../../packages/ts-shell/src/cli/interactive/picker/session.ts#L182)、[排序](../../packages/ts-shell/src/session/navigation/selection.ts#L43)、[首次加载设置焦点](../../packages/ts-shell/src/cli/interactive/overlay.ts#L712)、[分页投影](../../packages/ts-shell/src/session/store/catalog/query.ts#L34)、[启动恢复缓存](../../packages/ts-shell/src/session/recovery/reentry.ts#L68)。已有测试源码特意覆盖“当前会话超过最近40条仍聚焦它”，见[对应测试](../../packages/ts-shell/src/cli/interactive/picker/session.test.ts#L43)。

参考 B 把当前会话标记与默认选择分开：更新候选时，用户尚未动过选择则回到首项，手动选过才按稳定路径保留。这是与本项目不同的具体选择，不是必须复制的规则。Phase 20 的[消费者映射](phase-20-decisions.md)当前明确写了“当前会话聚焦”；改成默认最新应记录新裁决。

## 第八：model 为什么只能按 Esc？

**本轮没有复现你的真实终端，因此不能给出“键盘已修好”或单一根因结论。** 当前链路是 picker 注册 → OverlayHost 打开 → 异步加载 → overlay 优先接管输入；上下键、文字搜索、粘贴搜索及 Enter 接受都有实现。现有[model 测试源码](../../packages/ts-shell/src/cli/interactive/picker/model.test.ts#L248)也会打开真实 OverlayHost、搜索并按 Enter，但没有在本轮运行。

需要区分这几个具体状态：

| 状态 | 当前行为 | 能否解释原现象 |
|---|---|---|
| loading 尚未完成 | Enter 和部分操作键被忽略，Esc 可关闭 | 能解释一部分，尚未证明你停在这里 |
| 全部候选 disabled | 上下移动跳过禁用项，没有可操作 current | 能解释没有选择光标；加载完成后的 Enter 实际会关闭面板，不能完整解释“严格只能 Esc” |
| actionPending | 仅 Esc/Ctrl+C 关闭，其他键被吞掉 | 是源码事实，但尚未证明普通 model 打开进入此状态 |
| 行标记 active | 可能只是顶端的 disabled 当前请求说明 | active 标签不等于选中光标 |

模型行被禁用的明确条件包括没有匹配连接、连接 pending/error、账号池不可用、凭据不可用、目录 endpoint 歧义、reasoning effort 不受支持、没有可保存的活动会话 baseline。依据：[行准入](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L71)、[当前请求只读行](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L97)、[键盘状态分支](../../packages/ts-shell/src/cli/interactive/overlay.ts#L430)、[正常导航](../../packages/ts-shell/src/cli/interactive/overlay.ts#L645)、[接受与关闭](../../packages/ts-shell/src/cli/interactive/overlay.ts#L768)、[禁用行处理](../../packages/ts-shell/src/presentation/tui/chrome/options.ts#L78)。

另一个真实限制：即使另一 provider 有环境凭据，当前活动 provider 不是它且没有命名连接时，该行仍可能显示 configure a connection。provider 的“凭据已发现”与 picker 的“这个精确目标可切换”不是同一条件，见[providerSlot](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L47)。本轮没有擅自扩大凭据切换范围。

下一次判别只需要小会话：捕获当前构建身份、面板状态、第一条可用行及按键后的选中 ID。无需真实模型请求，更不需要长历史压测。参考 A 允许进入 locked provider 浏览原因，并提供连接或登录入口，能减少“整页不可选却不知道怎么办”的体验；当前 model 主要显示原因，连接操作另在 `/connect`。

## 第九：model 为什么仍然没有分类？

**你的判断符合当前代码。** 它把 ready providers 排在前面，随后按 provider → connection → model 展开平铺行；预设和角色也追加到同一列表。两栏中的 detail 虽然写了 provider 和 connection，但没有 provider/role 分类标签或侧栏，文字说明不能算分类导航。

依据：[model 面板定义](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L25)、[候选展开](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L42)、[预设追加](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L106)。Phase 20 PAN-01 已实现精确连接、角色预设、搜索和两栏等部分，不能由这些能力推出参考式分类导航已经交付。

参考 A 的具体做法是：左侧 Roles / All models / 可用 provider / 锁定 provider，主体保留模型列表及 detail；另有 model-kind tabs。首次打开先用当前 registry 快照使候选可选，再后台刷新，刷新后协调稳定身份。分类和搜索都是已有目录的投影，不应复制一套模型库存或另造选择事务。当前核查的固定入口没有 Recent，不能照着旧概述虚构已经存在的参考能力。

## 第十：settings 太简略，没有分类？

**当前已经有分类，但导航方式和覆盖范围比参考简单。** 七组为 Session、Request、Context、Retries、Network、Tools、Display，另有 All。默认打开 All，Tab/Shift+Tab 切换组；可以点击分类，输入搜索跨全部组，清空后恢复原组。窄窗口或可用行数很小时，panel 会按预算省略 chips；因此“看不到分类”仍可能来自实际布局、默认 All 或旧产物，尚未捕获你当时是哪种情况。

当前编辑元数据白名单有37项：请求采样与输出限制、上下文与指令预算、重试、网络超时、工具限制与发现、theme、Vim、输入形态、状态项等。实际面板还按保存scope和public policy筛选，并非每种scope都显示37项。详情区包含 Effective / Accepted / Stored / trust / Pending，先暂存再 Apply，可选 user/project scope，部分外观有预览。凭据和连接归 `/connect`，不在普通 settings 编辑白名单中。

依据：[分类及搜索](../../packages/ts-shell/src/cli/interactive/picker/settings.ts#L161)、[37项编辑元数据](../../packages/ts-shell/src/config/settings.ts#L18)、[详情与暂存](../../packages/ts-shell/src/cli/interactive/picker/settings.ts#L84)、[保存](../../packages/ts-shell/src/cli/interactive/picker/settings.ts#L147)、[按真实行数分配面板](../../packages/ts-shell/src/presentation/tui/chrome/panel.ts#L46)。旧研究的 MAX_OPTIONS=8 已不是当前 panel 的限制。

参考 A 有十个主分类、二级 section、Plugins 页及动态 provider/model 等来源。其方向键、Tab 和左右键分别承担不同导航层次；本项目主要用 Tab 换分类，层次少。**“比参考简略”有客观依据；“各种设置都没实现”没有依据。** 默认 All 降低分类发现性是合理 UX 推断，需要实际终端确认。

## 第十一：输入框左侧箭头怎么没了？

**当前是明确移除，不是字体无法显示。** default、borderless、top-rule 的 gutter 都是空字符串，绘制层不会凭空生成箭头。band 仍有自己的 `╰─ ` 装饰，框线形态另计算边界。

依据：[形态定义](../../packages/ts-shell/src/presentation/tui/composer/shapes.ts#L18)、[gutter绘制及内容列](../../packages/ts-shell/src/presentation/tui/composer/row.ts#L44)。[2026-10-25 返工裁决](phase-20-decisions.md#2026-10-25-日常交互返工裁决)明确记录“移除输入提示符及已提交用户消息的黄色侧标”。这条后续裁决比原研究中带箭头的截图和几何优先。

所以当前回答是：箭头确实被删了，而且实现符合现有裁决。若你希望保留输入提示符、仅移除已提交消息侧标，可以重新区分这两个位置；本文没有把你的疑问当作已批准恢复箭头。

## 第十二：初始上下文4.8k，参考1.7k，正式对话前为什么是问号？

**问号表示当前输入用量未知。** 状态栏只显示身份匹配的 provider 输入计量；新会话没有计量，便渲染 `?/窗口`。模型、endpoint、schema或系统提示词身份不匹配时，旧计量不能继续显示为当前值；恢复或替换上下文另有清除计量的路径。它不是会话累计消耗，也不是每敲一个字都会更新的实时估算。

依据：[读取匹配计量](../../packages/ts-shell/src/cli/interactive/sessionFacts.ts#L68)、[问号绘制](../../packages/ts-shell/src/presentation/tui/chrome/items.ts#L154)、[计量身份与失效](../../packages/ts-shell/src/observability/usageTelemetry.ts#L244)。参考 A 启动占位同样给 percent=null，只是渲染窗口容量而不显示问号；进入完整会话后会用本地消息和非消息项估算。**没有问号不证明它已经获得 provider 实测。**

**4.8k 与1.7k目前不能直接相减。** 旧研究的4,952来自20个工具声明的 JSON 字符估算，既不是 provider 的精确 tokenizer，也不是完整初始请求。当前 `/context` 仍取完整检查工具池，按 UTF-16 code units ÷3.5估算；真实普通回合默认 dynamic，从 pinned 工具、显式能力和已加载工具构造当前发送集。实际输入还包含系统提示词、项目规则、skills、历史及协议开销。

依据：[目录估算](../../packages/ts-shell/src/core/commands/contextCommandRuntime.ts#L93)、[检查工具池](../../packages/ts-shell/src/cli/runtime/tools.ts#L16)、[默认dynamic](../../packages/ts-shell/src/config/runtimeConfig.ts#L413)、[实际回合工具及prompt](../../packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts#L390)、[初始集合](../../packages/ts-shell/src/core/tools/catalog.ts#L73)、[pinned名单](../../packages/ts-shell/src/core/tools/discovery/state.ts#L13)。dynamic不保证消除全部固定成本：当前 pinned 名单本身有12个名字，另加搜索/加载元工具；实际集合还取决于允许列表和具体调用。

**这里有一处可以确认的报告缺陷：** 未计量时 `/context` 把完整检查目录估算写成 “First request estimate: at least …”。实际dynamic发送固定和已加载项，另加发现元工具，两边不是同一schema集合，因此目录估算没有建立首请求下界。这不证明你的真实总输入必然低于报告值，却会强化“我还没聊就占了4.8k”的误解，见[报告措辞](../../packages/ts-shell/src/core/commands/context/report.ts#L59)。正确的语义应区分“可发现工具目录估算”与“已组装请求估算”，本轮仅记录，不改实现。

参考 A 按当前 roster、系统文本、skills、消息和 tokenizer revision缓存分类估计；已知模型可用 native tokenizer，未知模型有 bytes/4 fallback。其把工具描述移入prompt并剥离schema描述的自动策略主要针对Gemini，不能据此对所有模型删除描述。参考的1.7k究竟是哪类值、是否同模型和同项目，在本轮仍未知。

因此目前有两个独立结论：完整首轮估算没有进入状态栏是实际能力差距；“真实请求比参考多消耗3.1k”尚无证据。当前 `/context` 已有最后接受的前景请求 wire 分类、源尺寸和provider总输入usage，但源字节不能相加成provider各类精确tokens。后续比较应绑定同模型、协议、指令、skills、历史及实际工具集合，保留估算与实测各自口径。

## 第十三：启动很慢，每次重新编译吗，npm start用错了吗？

**当前根目录的 `npm start` 没用错，也不会自动编译。** 当前命令入口是 `node scripts/start.mjs`，校验成功后再用Node启动manifest指定的不可变JavaScript入口。缺失、过期或字节不一致时直接报错，提示手动构建；源码开发入口才是 start:dev/dev。

依据：[启动脚本](../../scripts/start.mjs#L10)、[校验入口](../../scripts/start-lib.mjs#L147)、[输入摘要](../../scripts/build-identity.mjs#L96)、[项目指南](../../PROJECT_GUIDE.md#L106)。根部 `node dist/cli.js` 也进入同一启动脚本，不能把它当作跳过校验的捷径。

但“不编译”不等于“没有启动成本”：每次检查源码/JSON、编译器声明、依赖声明、必需构建输入、全部产物及已登记可执行文件的字节；之后还有Node模块加载、配置和运行时初始化。当前本地manifest登记1835个产物及102,869,120字节的可执行文件，这是读回的规模事实，**并未在本轮证明manifest新鲜度，更没有测出校验占你当前启动时间的比例。** `listCompilerFiles`中的tsc仅用于构建侧枚举，当前start调用的摘要计算使用已登记名单，不会执行它。

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

参考 A 将prompt gutter与padding按形态分别配置，说明符号、边框、空白应独立决定。当前[返工裁决](phase-20-decisions.md#2026-10-25-日常交互返工裁决)仍要求每侧1cell。因此若“顶格”指正文从第一列开始，现实现与这个新预期有差异，但与既有规则一致；改成0需明确涵盖正在编辑的输入、已提交消息或两者。

## 对照来源、边界与后续选择

为保持新文档名称和产品用语干净，下面只以参考A/B标识此次只读快照；没有复制外部代码或引入外部产品标签。

| 快照 | 本轮实际读取的关键位置 | 使用目的 |
|---|---|---|
| A：`0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0` | packages/tui/src/overlays/model-hub.ts：532–556、731–781、890–900、2721–2758 | 模型分类、首个快照、锁定provider解释/连接 |
| A：同上 | packages/tui/src/overlays/settings-defs.ts：4–44、66起；settings-selector.ts：108–141、546–578 | 主分类、section、动态设置来源 |
| A：同上 | packages/tui/src/status-line/startup.ts：74–75；segments.ts：864–869；context-usage.ts：364–417 | 未知表现及分类估算 |
| A：同上 | packages/coding-agent/src/session/session-stats.ts：367–389；packages/agent/src/tokenizer.ts：268–273；packages/coding-agent/src/session/settings.ts：347–359 | 计量anchor、本地尾巴、tokenizer及描述策略 |
| A：同上 | packages/tui/src/components/editor.ts：1138–1153 | gutter与padding分开决定 |
| B：`38ff99177fba21e9c57a670f4e95adcf407c99c7` | packages/coding-agent/src/modes/interactive/components/session-selector.ts：363–394；src/core/session-manager.ts：920–921 | 默认首项、手动焦点保留、活动时间排序 |
| B：同上 | packages/coding-agent/package.json：bin与build脚本 | 预构建bundle分发形态 |

原始启动工件目录为 `.omx/artifacts/phase20-performance-39817293051/performance-39817293051/`。本轮读回 interactive-warm.json / interactive-cold.json，两者SHA256分别为 `69a047a08bbfc535e59de75817b3fcc5c617822aea228015eb77d3e7e3950e35` / `f0671f10deaa923365b0fa5c34d745952216dae13cfdd7dda52555d57a6ce1e1`，与已有交付记录一致。它们只支持自己的机器、版本和口径。

尚未验证的三件事实保留为未知：你当时model停在哪个状态；两边4.8k/1.7k是否同一请求口径；当前机器npm启动各阶段到底耗时多少。它们不妨碍说明源码规则，也不能由本文变成“已修复”。

供你审阅的选择可以分开处理：先修model的可操作性和分类、工具目录报告口径；再决定resume默认当前还是最新、箭头与两处padding；命令发现入口收敛和settings分类层次则按日常使用范围裁决。若继续实施，应复用现有目录、OptionModel、配置保存和模型选择事务，使用小会话聚焦验证；20k边界只做mock/切片逻辑验证，验证由主代理单进程串行完成。

本轮文档验证：全部十项编号齐全，66个本地链接的目标文件存在。主代理在同一串行链运行import cycles、config consumers、declarations、Node floor、严格docs drift及diff check，均exit0；既有118条未加根前缀文档引用advisory仍保留，不称全仓文档零漂移。两条只读复核确认面板与上下文结论，并精化scope筛选、发现元工具和计量失效的表述。没有改变Phase 20任务状态，也没有把调查当作产品修复验收。
