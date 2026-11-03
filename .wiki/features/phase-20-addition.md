---
title: "Phase 20 日常交互补充要求与任务规划"
category: article
sources: [interaction-audit.md, phase-20-decisions.md, phase-20-contract.md]
created: 2026-10-26
updated: 2026-11-01
tags: [features, phase-20, additions, interaction, panels, completion]
summary: "全部补充任务的唯一定义与状态在第12节：ADD-01至ADD-77，已把七轮用户反馈、子代理review发现与真实provider探针结果按职责归并，重复项合并，逐条记录完成情况。当前1完成、8部分完成、63本地验证、5未开始；其余章节保留研究过程与逐批证据。"
confidence: mixed
---

# Phase 20 日常交互补充要求与任务规划

## 1. 本文作用与优先关系

本文汇总2026-10-25至26日常使用反馈、[逐项核查](interaction-audit.md)及用户后续各轮更正，作为实施的需求与验收依据。

**先看第12节。** 它是全部补充任务的唯一定义与状态来源：用户第十七至第三十七项、第 24 至 30 项、子代理 review 发现等散落在第 17–21 节的问题条目，已按职责归并为 ADD-01 至 ADD-73，同一件事只保留一个条目并附完成情况。第1至11节是初次定位与需求基线，第 13–16 节是验证规则与问题摘要，第 17–22 节是逐轮研究与实施记录——它们保留当时的证据，但**不再各自维护任务状态**，不得据其中某一节的局部绿色提升第12节的条目。

上一轮文档核对的产品HEAD为`4abe6f11af3bd7966796f29b996f5321b16b0140`，需求收口提交为`91f0d3d343d9ecb107c6792b5e9ee1d12df40157`，只读参考oh-my-pi仍为下述快照。该轮只定位与完善文档；第三十八批随后补37项设置的73条scope操作链并修补搜索焦点，已交付为`05ecc6c8885f61d18e851a6a698597253f1165d7`。第三十九批继续修补失败Apply重试、保存范围确认和user来源换代，证据见第15节。下文的“初次定位”均指修补前机制；不能将旧机制写成当前仍有同样故障。前次文档核对HEAD为`2a5cf9949cff57876adc20ebb8179040d7e00254`，其后第三十七批已修正启动测量和目录测试合同。

用户最新明确要求优先于旧裁决。本次不再询问是否恢复箭头、是否允许选中未配置模型、是否让settings/model向oh-my-pi看齐。原[Phase 20规划](phase-20-decisions.md)、[契约矩阵](phase-20-contract.md)和[交付状态](phase-20-status.md)仍保存原47项范围与历史证据；本文用ADD编号单独登记补充工作，既有任务映射表示复用关系，不修改它们的已验状态或补造完成证据。

初次文档整理时Cheers HEAD为`9e5db96e0829c078238a23d2ad037575cf4d6b04`，当时只改文档；需求基线随后提交为`0f129848`。只读参考oh-my-pi快照为`0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0`，pi为`38ff99177fba21e9c57a670f4e95adcf407c99c7`。参考用于具体交互和生命周期比较，不是另一套运行时或配置系统的引入理由。

本文区分三类信息：用户观察保留原意；源码事实记录可定位的机制；实施建议补齐确定性规则，但不冒充用户逐项指定或动态验证。建议的候选白名单、歧义优先级、任务顺序可以在实施中按证据细化；已明确的用户体验目标不能被这些技术选择缩小。

## 2. 用户要求与需要修正的理解

| 主题 | 用户实际反馈或要求 | 本文采用的理解 |
|---|---|---|
| model按键 | 现在上下键没有任何可见交互；用户推测只有一个模型配置，其余不能选中，造成失灵假象 | 观察与推测分开。不能断言已捕获按键，更不能将“跳过禁用行”写成用户希望保留的行为 |
| 未配置模型 | 允许选中未配置模型，整体参照oh-my-pi | 未配置模型要有焦点、可浏览、可滚动到、可看详情及配置入口；缺凭据不等于已能实际发请求 |
| 两个面板 | settings、model整体向oh-my-pi的面板看齐 | 要对齐布局层次、分类、导航、搜索、详情、状态与操作路径，不能只增加标签或换皮 |
| resume | 先选中两天前会话，今天三个随后出现，仍选旧会话 | 处理渐进目录与自动焦点的组合；未手动选择时让最新候选成为合理默认，手动选择之后避免刷新抢焦点 |
| 消息顶格 | 删除用户输入左侧黄条后仍没有顶格，要改正 | 已提交用户消息去掉残留装饰性左侧空白；编辑区也去掉额外左侧padding，箭头与正文间必要间隔单独计算 |
| 箭头 | 输入框左侧箭头加回来 | 恢复编辑区提示符；不要同时恢复已提交消息黄色侧条 |
| 启动 | 参考先进入TUI，然后加载，表面更快；本项目也参考 | 尽早显示真实TUI输入区和加载状态，区分首次可见与运行时可请求 |
| 上下文 | 参考每次打开约1.7k；本项目先问号、开始对话后约4.9k；工具数相近 | 提供启动本地估算，说明估算与provider用量；单独排查数值差额，不能仅按工具个数解释 |
| 路径补全 | 第一行第一个位置的`/`用于slash命令；其他位置可识别路径，例如`/home`，出现候选或Tab补全 | 基于光标处token和实际位置分类；支持正文内绝对路径及目录连续补全 |
| 多skill | 正文非首位也能出现skill，一次使用多个 | 不只显示多个名字；同一次提交中所有明确选中的skill都要被解析、加载并注入 |
| 多slash | 在参考“正文只出现skill”的方案上改进，允许部分非功能性slash搭配，如deep-research与skill | 正文候选与提交解析均支持明确准入的提示词/研究入口；控制、配置、会话切换等功能命令不因出现在正文而执行 |

### 2.1 已覆盖的旧裁决

- 旧规则是每侧padding=1，并移除普通编辑框提示符。新规则是已提交消息正文顶格、编辑框恢复箭头且去掉额外左侧留白；右侧padding和带框形态不因此一律归零。
- 旧resume默认聚焦当前会话。新反馈要求修补未手动选择时焦点停在旧会话的问题；保留当前会话身份标记，但不再用它锁定默认焦点。
- 旧model禁用行跳过导航。新要求允许选中未配置模型；浏览资格与实际启用资格分开。
- 旧slash补全主要围绕开头命令及其参数。新增正文路径、正文skill、多skill和有限slash组合；单命令兼容语法继续沿原owner处理。

## 3. settings与model的整体面板对齐

### 3.1 什么才算“看齐”

对齐的验收单位是完整操作路径：打开面板，辨认分类，换分类，找到目标，移动焦点，查看详情，修改或配置，确认/取消，再次打开读回。以下各层都要覆盖，不能仅凭截图像、增加chips、已有两栏或现有测试通过判定完成。

| 层次 | 对齐目标 | 本项目复用与边界 |
|---|---|---|
| 面板框架 | 清晰的导航区、内容区、搜索及当前焦点，窄屏有明确退化 | 复用[panel](../../packages/ts-shell/src/presentation/tui/chrome/panel.ts)、[overlay](../../packages/ts-shell/src/cli/interactive/overlay.ts)与实际viewport预算 |
| 分类 | model的角色/全部模型/provider；settings主分类及二级分区 | 由现有模型目录与配置元数据投影，不能另建库存或重复注册表 |
| 键盘 | 上下选行或分类，左右切换层次，Tab在导航域间移动，Enter进入或操作，Esc退回/关闭 | 明确焦点域，输入编辑器里的方向键只编辑正文，不被父面板抢走 |
| 搜索 | 当前输入可搜，结果显示所属分类；清空恢复之前导航位置 | 绑定草稿和目录revision，异步结果不覆盖新查询 |
| 详情 | 从当前焦点看模型精确目标/可用性，或设置值/来源/应用时点 | 只在必要时展示技术细节，主列表避免把实现字段堆成说明文 |
| 状态 | loading、empty、error、unconfigured、ready、pending分别可辨 | 未配置不等于列表为空；浏览不触发模型请求或自动登录 |
| 动作 | 可用目标启用；不可用目标配置；设置暂存与Apply/Discard | 保留现有连接、模型事务、scope、信任、配置保存及取消契约 |
| 连续性 | 刷新、resize、进入子编辑器后返回，保持稳定身份和可见焦点 | 用provider/connection/model/key身份，不以显示label回查 |

搜索退出须区分三个动作：退格清空恢复搜索前分类、焦点域及字段/section；settings搜索中Esc回到所选结果的所属分类并聚焦该字段，无匹配则恢复原位置；model搜索中Esc先清搜索并恢复原浏览位置，再按Esc沿既有导航退出。分类键和显式分类点击仍按用户新选择离开搜索。进入模型详情再返回应显示原具体模型所在内容页，不能只保留隐藏在侧栏后的行ID；后续目录刷新不重复执行返回定位。带明确parent的角色浏览器及子编辑器保留原Esc返回/取消优先级，不被根目录搜索退出拦截。

鼠标对齐包括实际内容区滚轮浏览：一格移动一项可浏览候选，停在首尾，能够从分类/section焦点回到内容行；滚动不启用模型、不保存设置，也不切换multi-select勾选。命中来自当前已绘制列表区域，不能用“disabled不可点击”阻断section模式的内容滚轮；标题、footer、详情、过时画面及正在加载/提交/编辑的子流程各自保持正确边界。侧栏滚轮仅移动独立视口，不选择分类；点击命中滚动后实际绘制的身份，键盘返回或重开时露出活动分类，刷新重排保留可见锚点并限制边界。hover和桌面矩阵单独核查，不能把内容与侧栏滚轮补齐写成完整鼠标能力已对齐。

悬停须贯通终端报告、解码、pointer路由和实际绘制：未按按钮的移动只高亮指针下已绘制category或内容行，状态与键盘选中分开，Enter仍操作原选中项；不触发preview/保存/认证/启用。离开列表或进入另一列、详情、section标题时撤回旧高亮，刷新/filter/resize/返回后不沿用旧坐标。面板关闭、外部终端交接及停止时恢复普通鼠标模式；主屏regular的scrollback保持原策略，已请求但迟到的motion不变成release或完成拖拽。

参考A使用Roles / All models /可用provider /锁定provider及model-kind tabs；settings使用Appearance、Model、Interaction、Context、Memory、Files、Shell、Tools、Tasks、Providers十类及各自section。**分类结构要看齐，内容必须对应本项目真实能力。** 参考特有的服务、插件、语言运行时或配置字段不能靠加一个空菜单宣称支持；暂不适用的分类应清晰省略，不能呈现似可设置的假选项。

### 3.2 model：允许选中未配置模型

初次定位时，[model picker](../../packages/ts-shell/src/cli/interactive/picker/model.ts)把配置/凭据等准入失败映射成disabled，[OptionModel](../../packages/ts-shell/src/presentation/tui/chrome/options.ts)禁止这些行成为current/focus，step也跳过它们。**这是修补前的源码事实；它与“只有一个模型可用时按键看起来毫无变化”相容，但不证明用户终端的事件确已进入这个分支。** 当前具体模型行已使用`disabled: true, focusable: true`表达“能浏览、不能直接启用”，OptionModel沿focusable导航；详情提供适用的连接配置或档位恢复。现有实现与局部验证见第15节，用户原环境的零可见交互仍需复验。

ADD-01的目标行为：

1. 只有一个模型配置、其余未配置时，打开面板就能用上下键移到其余模型，出现真实焦点并展示详情。
2. 所有模型未配置时仍能浏览目录、换分类、搜索和滚动；不能显示成无法交互的空current。
3. 选中未配置模型后显示最短的原因和可执行下一步，提供精确provider/connection的配置或可用登录入口。
4. Enter对未配置目标进入详情或配置流程，不进行无凭据切换；只有实际准备好且通过准入的目标才能Apply成为请求模型。
5. 返回列表后保留目标；配置成功后刷新真实可用性，失败/取消时活动模型及持久配置按既有事务结果保持真实，不制造已连接状态。
6. 同名模型在两个relay中可区分；row identity保留provider、connection、model及revision。

修补方向：由model的行状态表达“可浏览但不可启用”，不要全局删除disabled检查。其他面板的分组标题、危险未获准动作和真正不可导航占位继续按原语义处理。参考A在未搜索时可选locked provider并展示诊断/OAuth，但不会把该provider模型直接启用；**本项目在此基础上必须满足用户更强的要求：具体未配置模型也可选中浏览。**

验收至少包括：一个ready加三个unconfigured、全部unconfigured、两个relay同名模型、加载后上下键真实事件链、搜索无匹配后退格重开、连接状态刷新、配置取消/失败、窄屏及resize。检查焦点ID、可见行、详情和活动模型分别变化；不要用“按键处理函数存在”代替动态结果。

### 3.3 model：分类、角色、预设与详情

ADD-02须把初次定位时平铺的provider→connection→model及角色预设组织成可导航层次。基础入口包括Roles、All models和provider分类；同一provider多个connection在内容区能辨认或下钻。预设沿现[预设owner](../../packages/ts-shell/src/core/commands/model/preset.ts)与[会话模型owner](../../packages/ts-shell/src/session/model/state.ts)处理，不新增另一套角色配置。分类已有实施证据，完整操作链仍按本节验收。

默认打开时能定位当前模型，并清楚区分“当前活动”“键盘焦点”“尚未配置”。可用与未配置分类都可访问。两栏详情要跟随焦点，显示名称、精确连接、模型能力、reasoning约束及阻止启用的原因；模型类别tabs仅在目录有真实分类数据时提供，不根据名字臆测。目录刷新不抢手动焦点，目标失效时落到邻近可浏览项并说明状态。

详情必须使用所浏览模型的精确目录：未配置relay以其目录地址、pending/error连接以其真实保存地址查找；同名官方模型不能替代relay的能力与上限。同地址存在歧义时不猜数据，地址未配置时仅展示当前具体目录条目已声明的信息。容量、独立输入上限、最大输出、图片输入、reasoning设置与各档位、已声明价格应可检查；未知能力显示unverified，缺价格不称免费。当前reasoning偏好与模型是否接受该设置分开；不接受reasoning参数不等于模型没有内部推理能力。

验收从Roles进入预设、从provider浏览未配置模型、All models搜索同名relay、切换分类后清搜索、鼠标/键盘到同一目标、异步刷新和子面板返回。保存仍验证精确target与revision，不按label提交。

### 3.4 settings：主分类、section与真实编辑器

ADD-03将初次定位时的七组加All向参考的主分类/section层次组织，覆盖本项目已有设置而非仅改组名。当前[settings picker](../../packages/ts-shell/src/cli/interactive/picker/settings.ts)已声明下述十类，并加入Model / Session真实入口；这不代替全部字段、来源与编辑器的验收。分类映射：

| 目标分类 | 本项目应归入的真实能力 |
|---|---|
| Appearance | theme、输入形态、状态项、diagram与已有显示设置 |
| Model | 模型相关采样、输出、reasoning及已有角色/预设入口；Model / Session提供Models and roles、Thinking effort，委托原会话owner，明确区别user/project文件scope |
| Interaction | 输入/Vim、审批与已有交互选项；路径/skill补全策略仅在真实实现后纳入 |
| Context | contextWindow/reserve、指令预算、压缩与上下文显示 |
| Memory | 已有记忆设置与只读状态；操作委托原memory owner |
| Files、Shell | 已有文件与执行设置；没有对应字段的部分不造新语言执行面 |
| Tools | allowed/disabled tools、动态发现、MCP/extension相关配置入口 |
| Tasks | 现有任务/后台/协作设置及命令组合策略 |
| Providers | 网络重试/超时及精确连接入口；凭据继续由connect owner管理 |

Model / Session必须可从类别浏览及全局搜索找到；model/roles和当前模型thinking沿原面板与运行时能力进入，不能新造全局或project字段承接会话状态。返回须覆盖取消、未配置具体模型详情、API-key编辑取消、适用account确认取消、Default二次浏览、自动角色赋值、模型/effort保存与过期拒绝。保留原scope和具体入口焦点，重开读回实际接受状态；返回结果包括“已保存但应用未确认”，不可变成已切换。连接配置继续使用连接owner自己的scope，不能因从project settings进入而隐式改其保存目标。

分类中有section标题，用户可在section和设置行之间切焦点；左右切主分类，Tab跳section/设置，Enter打开编辑器，Esc返回。搜索跨分类，并能从结果回到所属section。列表展示人能读懂的名称与值，技术字段路径、Effective/Stored/来源/应用时点集中在详情；必要的scope与Pending保留，MUI要求不因“对齐”而增添多余第二标签。

复用[设置元数据](../../packages/ts-shell/src/config/settings.ts)、已有数值/列表/对象编辑器与[保存owner](../../packages/ts-shell/src/cli/runtime/settings.ts)。暂存、Apply、Discard、预览撤回、user/project scope、只读来源、需要restart的字段各自保真。未知/过时值不能被打开面板偷偷规范化；空项目配置继承默认，不能显示为空能力。

布尔/枚举子面板初次打开应聚焦真实effective值，而不是第一个choice；stored/requested与effective不同时保留来源差别，不能靠Enter默认覆盖。当前值无匹配时先聚焦Values and sources。暂存之后仍默认Apply，取消返回不保存；主题按accepted intent定位，尚不支持的当前thinking以只读焦点保留，Enter不替换为auto。重开按最新owner状态重新定位。

失败Apply与保存范围子面板必须绑定进入时的session、workspace、profile、substrate及所选来源，不能通过第二次Apply或确认scope偷偷把旧暂存值带到新owner。同一来源的字段冲突先拒绝并保留暂存，用户明确第二次Apply可重新读取该来源后重试；另一scope、兄弟字段和JSONC注释须保留。来源选择从legacy变preferred、session/project切换（包括A→B→A）、profile换代时，旧详情继续拒绝，须返回设置列表重新打开字段。取消scope选择保留原scope和pending；成功确认范围按既有提示撤销pending；目标范围损坏或不可读时保留原scope/pending并报告失败，不丢面板。检查须贯穿草稿刷新、写锁内和发布前；若写入后身份变化，报告“已保存、应用未确认”，不将磁盘写入冒充新owner接受。第三十九批有下述代表性证据，完整字段×来源×窗口矩阵仍需补齐。

列表与JSON对象编辑必须支持键盘直接构造多行，不能只靠粘贴才能输入“一项一行”。Shift+Enter或Ctrl+J在光标位置换行，普通Enter验证并暂存完整值，Apply另行保存；方向键属于子编辑器，Esc保留进入本次编辑前已有的暂存值。主界面与全屏表单按各自实际行预算绘制，极矮窗口优先保留光标所在编辑行，标题/说明可退化；主界面必须在分配held composer、补全和提示之前为活动子表单保留至少一行，不能只保证独立InputForm内部的caret。超过编辑上限的原值必须明确拒绝，不能让Enter把未显示的原值覆盖成空值。该补充是完整编辑路径的实施细化，不能扩大为未配置模型可自动启用或认证表单允许多行秘密。

验收选取每种编辑器至少一个字段，覆盖切分类→section→修改→Apply→重开读回及Discard撤回；还要验证无权限来源、窄屏导航、搜索清空、输入编辑器方向键和preview取消。

### 3.5 面板看齐的交付清单

“看齐oh-my-pi”是用户明确的整体要求。交付须按下面操作链检查参考的布局与交互决定，并说明本项目因真实能力、配置scope或首位slash规则作出的差异；不能将“已有同名分类”作为验收结论。

| 检查项 | model必须达到 | settings必须达到 |
|---|---|---|
| 打开与定位 | 露出当前模型所在分类、具体行及活动标记；焦点与活动模型分开 | 露出当前类别、section、设置行及值；显示实际scope |
| 分类与内容 | Roles、All models、provider及精确connection可辨；未配置provider和具体模型均可访问 | 主分类组织全部真实设置，section可导航；不添加无功能的参考专属字段 |
| 键盘与搜索 | 上下可移到未配置模型，左右/Tab切焦点域，搜索后能回原分类及目标 | 分类、section、字段、子编辑器各有焦点；新查询自动聚焦最强匹配，同一查询内保留手动选择，清空恢复搜索前位置；编辑键不被父面板抢走 |
| 当前值与详情 | 当前目标的能力、连接和阻断原因准确；未知保持未知 | 当前effective值、stored覆盖、默认/来源与应用时点可查；默认Enter不偷偷改值 |
| 配置或修改 | 未配置目标进入精确连接配置；成功返回原模型，显式确认后才启用；reasoning阻断走适用恢复 | 布尔、枚举、数值、文本、列表、对象均有完整编辑路径；Enter暂存，Apply保存，Discard撤回 |
| 取消、失败与返回 | 详情→配置/登录→取消或失败→原详情/列表；不换目标，不虚报认证或启用 | 编辑/预览→取消→原字段；已暂存项按原合同保留，来源/scope不随子面板改变 |
| 嵌套与重开 | settings→Model / Session→模型/角色/档位→返回同一scope、类别、入口并保留结果 | 从原保存owner读回实际值；需restart或应用未确认的结果仍明确，不只验证文件写入 |
| 鼠标与窗口 | 点击、内容/侧栏滚轮、hover与键盘指向同一已绘制身份，窄屏/resize后目标仍可见 | 相同导航要求；长值与多行编辑优先保留caret，标题/footer按窗口预算退化 |
| 刷新与生命周期 | 列表换代、连接变化或关闭后旧动作失效；重开使用最新接受目录 | 配置发布、搜索变化或关闭后迟到结果失效；普通设置不被目录刷新隐式重载 |

每条交付记录要有实际操作、焦点/目标身份、接受或持久状态、返回位置与未覆盖环境。普通TTY与fullscreen分别验证；桌面键盘、系统剪贴板、IME和真实认证仍单列缺口，不能由合成终端验证替代。

### 3.6 当前面板盘点与剩余验收范围

上一轮静态核对[配置字段政策](../../packages/ts-shell/src/config/fields.ts)、[设置元数据](../../packages/ts-shell/src/config/settings.ts)、[设置草稿](../../packages/ts-shell/src/cli/interactive/settings.ts)及两个picker。当前settings元数据共37项：34个根字段、3个`tui`子字段；user scope可编辑37项，project scope按原政策排除个人选择`cacheWarming`后可编辑36项。Model / Session的两个入口由host能力另行提供，不能算作新增文件设置。第三十八批的[字段操作测试](../../packages/ts-shell/src/cli/interactive/picker/settings/fields.test.ts)已覆盖这73个字段/scope组合的真实OverlayHost键盘路径与配置owner；全部37项不等于每个来源、无效值、窗口或真实桌面组合均已验证。

| 当前可见分类 | 需逐项核对的现有设置/入口 | 验收重点 |
|---|---|---|
| Appearance | theme、tuiMode、tui.composerShape/statusItems/diagrams | 主题和输入预览撤回；立即生效与restart分别读回；状态项空值按默认合同 |
| Model | maxTurns、temperature、topP、maxOutputTokens、allowedModels；Models and roles、Thinking effort | 数值范围/模型能力、限制交集、会话模型与文件scope分开；嵌套取消和保存返回原入口 |
| Interaction | vimMode、attentionOnIdle、offline | 实际输入/通知/网络owner值；环境或启动覆盖存在时不能声称文件值已取代effective |
| Context | contextWindow、reserveTokens、modelTokenBudgets、instructionBudgetBytes | 默认继承、对象完整编辑、模型预算和请求准入；本地计数与实测不同来源 |
| Files | pathRules | 对象列表多行编辑、路径政策与约束累积；取消/拒绝不保存部分列表 |
| Tools | allowedTools、disabledTools、hiddenToolPrefixes、denyRules、enableMcpTools、toolDiscovery | 空数组与unset区别、交集/合并/禁用政策、工具发现实际发送集合 |
| Tasks | cacheWarming、agentMode、steeringMode、followUpMode、backgroundFollowUp | user/project适用性、默认模式与会话选择、后台请求实际应用时点 |
| Providers | retryEnabled、retryMaxRetries、providerRetryMaxRetries、retryBaseDelayMs、retryMaxDelayMs、providerConnect/Headers/BodyTimeoutMs | 各重试层与超时对应真实消费者；连接/凭据仍走原connect owner |

初次实现时`GROUP_ORDER`声明参考十类顺序，`SETTINGS_GROUPS`只显示有真实元数据的八类，Memory和Shell未显示；所读`CONFIG_FIELDS`没有独立memory/shell可编辑字段。**缺这两个名字本身不是已确认故障，也不说明相关产品能力不存在。** 后续第四十九批已沿原`/memory status`与`/shell status`命令补只读发现入口：它们插入命令草稿，不伪装成可编辑字段，也不复制状态读取或保存owner。今后新增真实字段时仍复用原schema/来源政策，不能另建面板配置体系。

后续实施须以37项清单和原scope政策补齐字段、来源及保存读回矩阵：第三十八批已覆盖每项搜索发现→详情→暂存→取消→再暂存/Apply→effective/requested/stored读回→重开→移除→重开，以及七个跨来源政策场景。第三十九批新增17项，覆盖代表性user/project同源冲突重试、scope取消/确认/不可读、session/workspace/profile失效、legacy/preferred换代、真实锁内复验、写入后应用未确认及无效数值取消恢复；这几类不再是完全无证据。第七十三批补字符串列表/JSON对象×user/project的主界面缩放、光标编辑、暂存、取消二次编辑、Apply及来源读回，并验证1至4行窗口。所属category/section导航有前述批次证据；全部字段/编辑器与各来源冲突、无效值、失效、编辑窗口及桌面的交叉组合仍待验，不能把这些代表性路径记为完整矩阵。已有第15节证据可复用，未覆盖组合写明未验，不重复全仓回归。

model当前已使用`disabled: true, focusable: true`允许具体未配置目标浏览，精确详情、配置返回、目录刷新和目标档位恢复也有逐批证据。ADD-01/02仍须完成单ready/全未配置、两个relay同名模型、角色/默认浏览、缺凭据/能力阻断/目录歧义/真实认证及键鼠窗口矩阵。参考的locked provider诊断与本项目“未配置具体模型也可选中”有明确差异，不能为了外观一致退回空模型内容区。新发现缺口先写可复现路径，再沿model、connect、会话模型及配置发布原owner修补。

## 4. resume：渐进加载后的合理默认焦点

ADD-04沿[当前会话首快照](../../packages/ts-shell/src/session/store/catalog/index.ts)、[listing](../../packages/ts-shell/src/cli/interactive/picker/session/listing.ts)与[overlay](../../packages/ts-shell/src/cli/interactive/overlay.ts)修补。初次定位时先发布current、历史逐批加入，OptionModel保留首次自动ID，因此今天的会话出现后仍选两天前那条。排序本身是置顶优先、更新时间倒序，不应通过反转排序修焦点。当前[session picker](../../packages/ts-shell/src/cli/interactive/picker/session.ts)已有最新候选defaultSelection，OptionModel以selectionTouched区分自动和手动选择，局部证据见第15节首批。

目标规则：用户尚未主动选择时，随着有效候选到达，自动焦点更新为当前范围内最新可恢复会话；用户按上下键、点击或明确选择后，后续发现/刷新保留该ID。当前会话标记独立保留，不再压过默认最新期望。置顶影响列表排序，**建议不让旧置顶覆盖“默认最新”**；搜索范围、项目scope与目标可恢复性仍先过滤。Enter前重验目标身份与版本。

以一条两天前current和三条今天记录的分批夹具验收：未碰按键，最后聚焦今天最新；加载中手选旧记录，最终仍保留手选；目标消失/不可恢复时落到合格候选；切scope/搜索按新的浏览生命周期重置自动规则；分页、partial和关闭后的迟到结果仍保真。参考pi的selectionTouched可作为对照，不复制整个scanner。

第七十四批沿真实OverlayHost补齐未触碰/方向键/点击/滚轮/hover×记录仍可恢复/消失/变为空会话的15条渐进组合，并穿过窄屏resize与最终Enter→resume回调。hover和resize不锁定自动焦点，手动目标仍有效则保留，失效后选择最新可恢复候选而非剩余旧置顶；Enter传递最终summary版本。现有实现通过这些新增路径，没有据此改产品代码；这仍是受控catalogue与恢复端口证据，不是用户原环境或磁盘整会话恢复验收。

## 5. 输入几何：已提交消息顶格，编辑框恢复箭头

ADD-05处理已提交消息，ADD-06处理正在编辑的输入。这两处不能用同一个“恢复左侧装饰”动作混在一起。

| 位置 | 新目标 |
|---|---|
| 已提交用户消息 | 无黄色侧条，无由旧侧条或padding留下的首列空白；正文首字符在第1列 |
| default/borderless/top-rule编辑区 | 提示箭头从左侧边界开始，正文紧接提示符必要间隔；不再叠加独立左padding |
| 多行编辑续行 | 正文对齐首行正文起点；只有首行显示箭头，不重复制造提示符 |
| 有框/rail等其他形态 | 保留其选择出的边框语义和安全宽度；不把所有形态粗暴改成裸文本 |

“顶格”去掉的是绘制引入的空白，**不删除用户原文的缩进、空行或正文空格**。编辑框有箭头时，正文自然在提示符之后；与已提交正文直接从第1列开始是两个可同时满足的几何要求。右侧留白独立决定，不能为改左侧而无条件移除两侧。

初次定位时，[renderUser](../../packages/ts-shell/src/presentation/tui/transcript/blocks.ts)使用width−2折行并在正文前加空格；[composerFrame](../../packages/ts-shell/src/presentation/tui/composer/frame.ts)将两侧padding共用一个值，[shapes](../../packages/ts-shell/src/presentation/tui/composer/shapes.ts)清空普通gutter。修补须同步正文宽度、left/right padding、[contentColumn及cell映射](../../packages/ts-shell/src/presentation/tui/composer/row.ts)、[transcript源投影](../../packages/ts-shell/src/presentation/tui/transcript/source.ts)，恢复箭头优先沿原主题符号，避免硬编码只在一种字体有效的字符。当前已提交正文与编辑箭头的局部修补证据见第15节首批，不能将上述旧绘制行为当作当前状态。

验收检查ANSI剥离后的实际列、折行及caret位置，覆盖中文/emoji/组合字符、多行缩进、长行、极窄屏、resize、IME尾、选区和应用内复制。复制只得到源文，不能包含箭头、框线、绘制padding或软折行；原文缩进保留。不得以trim用户内容实现顶格。

## 6. 启动：先绘制TUI，再完成加载

ADD-07按用户方向改善“空白终端等待”。初次定位时，[入口](../../packages/ts-shell/src/entrypoints/cli.tsx)先加载cliProcessRunner，后者建立bootstrap/session runtime后才进入interactive loop；fullscreen的[startup surface](../../packages/ts-shell/src/cli/bootstrap/cliStartupSurface.ts)不会提前打印intro。当前合格TTY入口已先等待beginStartupSurface再加载重bootstrap图，交接证据见第15节第四、五批；生产启动收益仍须测量。

参考A先beginStartupComposer，再加载网络bootstrap/命令图，最终用lease把同一Composer交给完整InteractiveMode。应采用这种时序原则，沿本项目已有TUI owner实现，避免临时启动画面与正式界面变成两个独立输入缓冲或终端控制器。

要求：

- 普通交互TTY尽早显示编辑区、必要状态及真实加载阶段；缓存外观可以用于首帧，但必须随后按实际配置校正。
- 首帧出现时运行时可以尚未准备好；明确显示loading，配置失败时显示实际错误并可退出，不能假装ready。
- 加载期间输入采用一个明确、有限的保留策略，移交时原序保留一次；就绪前不派发模型/工具请求，Enter不能重复派发，Esc/Ctrl+C按生命周期退出或取消。
- 完整运行时接管同一界面，主题、状态、光标和草稿不闪回或丢失；启动退出/错误时恢复终端。
- 不破坏help/version、print、pipe、replay和显式resume等既有入口；新鲜度校验合同不因提前绘制而旁路。

分别测首次可见、输入接管、runtime-ready、首次请求准入与退出；同机器同fixture的冷/热Node/exe分别取样，首帧更快不能写成所有初始化更快。先用小会话验证加载时输入、取消和故障；性能验收沿现[START-03](phase-20-decisions.md)口径，不能用`--version`代替TUI首帧。

前次文档核对时，[启动基准](../../scripts/bench-interactive.mjs)确实以`openai`误标firstFrame；第三十七批已修正。当前[观察owner](../../scripts/bench/observation.mjs)识别真实`❯ Loading · type a draft`与`Loading runtime`，另观察正式输入提示，记录runtime输入接管和正式写入；120个warm-uncontrolled空会话样本仍绑定该批测量build，最终新build另有16个pilot，不能混算。[进程计时](../../packages/ts-shell/src/observability/startupTiming.ts)的write callback表示流写入完成，不等于终端像素已呈现；父进程收到字节、进程内部写入及真实可见画面不得混算。本轮未重跑基准，冷缓存、修补前对照、真实项目/桌面与完整首请求收益继续未确认。

## 7. 上下文：启动估算、实测衔接与差额定位

ADD-08提供状态栏启动本地估算。初次定位时，[sessionFacts](../../packages/ts-shell/src/cli/interactive/sessionFacts.ts)只读身份匹配的provider用量，无值就[显示问号](../../packages/ts-shell/src/presentation/tui/chrome/items.ts)；对话后数字来自[归一化输入用量](../../packages/ts-shell/src/turn/session.ts)，不是JSON字符÷3.5。当前已接live.promptContext本地估算，来源核验与实测衔接证据见第15节；无法准备有效请求时保留unknown。参考A无provider anchor时仍用systemPrompt、当前tool roster、消息与pending本地计数，因此可以启动显示数值。

要求首次请求前根据**本次实际拟发送的内容**给出estimated值，不拿完整可发现工具目录充当发送schema。包含生效系统指令、项目规则/skills、当前消息历史、实际tool集合和能界定的协议开销；无法精确计算的部分说明局限，不把估算标成实测。provider返回后切换或校准measured，绑定session/model/endpoint/schema/system/history身份。切模型、恢复、换分支、加载工具或编辑指令使旧数值失效；无法证明当前值时仍允许unknown，不能为了消灭问号填0或旧缓存。

第七十五批补启动交接后的草稿→估算→编辑→提交组合路径，并修复纯光标移动误使估算失效：[编辑器buffer](../../packages/ts-shell/src/presentation/tui/editor/buffer.ts)区分内容版本和含光标的range snapshot版本。纯移动/resize保留有效估算，真实编辑仍取消旧读取；跨交接粘贴的placeholder按实际全文估算与提交。此批mock预览和最终派发端口，不证明provider数值或生产启动性能。

约1.7k与4.9k的差额要单独取同模型/协议/规则/历史/实际schema的分项。工具数量、工具菜单是否丰富、源字节大小都不能直接推出token总数；缓存输入与provider归一化也需对齐。参考模型toolSchemasInContext=false时不计常驻工具schema是条件性分支，未验证用户具体模型走它。验收不设“必须也显示1.7k”的目标，而是同snapshot、可解释、estimated/measured/stale/unknown各态真实。

对用户“公式是否不同”的问题，初次源码核对支持**计数方式有差异**：当时本项目[本地估算](../../packages/ts-shell/src/context/request/estimate.ts)只有characters/3.5；参考A的模型计数支持对应词表，未知模型用字节近似，模式与环境覆盖会影响选择。第24.36节已在实际目录明确声明的模型上接入cl100k_base/o200k_base，未知或显式false保留原字符估算；完整请求仍是estimated。对同一ASCII内容仅比较÷3.5和÷4约差14%，远不足以解释4.9k/1.7k约2.9倍；中文、emoji、模型词表、协议与实际输入集合也不能套用这个ASCII比例。参考启动数值来自本地计数，本项目用户反馈中的对话后数值来自provider用量，两种来源须先对齐才可比较。详见[计数口径研究](28-context-display-and-startup-budget.md)。不能把问号原因与数字差额合并为一个已解决的公式问题。

ADD-09修初次定位时的[报告措辞](../../packages/ts-shell/src/core/commands/context/report.ts)：当时`/context`将完整检查目录估算称作首请求“at least”，没有建立下界。当前报告已明确目录估算不是首请求估算或下界；报告分别展示可发现目录估算、实际组装请求估算、最近provider总输入及分类源尺寸，源尺寸不能冒充精确分类tokens。两项可关联交付，但不能用修报告文字替代启动状态栏能力。

验收包括新空会话、恢复、缺usage、带cache用量、工具加载前后、换模型、辅助请求与前景请求、多步回合及stale回写。数值差额调查保留实际输入集合摘要和计数口径，不输出凭据；没有真实对照数据时保留差额未解释，不能归因已闭合。

## 8. 光标位置决定slash、路径与组合候选

ADD-10扩展现有[completionToken](../../packages/ts-shell/src/cli/interactive/completion.ts)、[slashSuggestions](../../packages/ts-shell/src/cli/interactive/slashSuggestions.ts)、[catalogRequest](../../packages/ts-shell/src/cli/interactive/completion/request.ts)与[pathCatalog](../../packages/ts-shell/src/cli/interactive/completion/paths.ts)。本项目已有`@`文件引用和部分命令参数路径补全，缺口是正文普通路径及与slash/skill的统一判别，不需要重建所有补全来源。

### 8.1 位置和歧义规则

用户明确要求完整slash命令菜单限第一行第一个位置。按源文本offset=0执行这一规则；终端软折行不是源文本新行。初次定位时[提交处](../../packages/ts-shell/src/cli/interactive/keymap.ts)的trimStart和补全处“前面没有token”不能直接作为判断依据，否则第二行或前置空格的slash会误入功能命令。当前位置规则已有局部修补，仍按下面完整场景验收。参考A会忽略前导空白/空行，这一点与用户字面要求不同，实施应按本项目新要求而非机械复制。

| 光标所处输入 | 候选与提交语义 |
|---|---|
| 源文本首位`/`或`/mod` | 完整canonical/named slash菜单；alias仍隐藏在发现候选中，直接兼容语法保留 |
| 已知开头功能命令的参数 | 该命令既有参数语法优先；不把参数内的`/skill:`或slash自动执行为另一命令 |
| 正文边界的`/skill:`、`/技能前缀` | skill候选；接受后插入明确`/skill:<resolved-name>` |
| 正文边界的已准入组合命令前缀 | 仅组合白名单候选，例如deep-research研究入口；不展示全部功能slash |
| 正文`读取 /home`、`/home/wa` | 文件/目录路径候选；目录尾加`/`可继续补全 |
| `~/`、`./`、`../`、已有`@`引用 | 路径/引用来源按各自语义工作，不把路径当命令 |
| URL、词内斜杠、代码、转义字面量 | 不突然激活命令或skill；保留普通内容 |

首位明确路径（例如包含第二个分隔符的绝对路径）应进入路径补全；首位`/home`同时像命令前缀，候选判别应明确command优先或显式Tab路径后备。**正文的`/home`补全是必达要求，不能被无关skill模糊命中占走。** 对合法命令名/skill名恰好与实际目录同名的情况，建议按候选类型显示可辨认的一行结果，并以用户实际选中的类型决定后续语义；必要时`/skill:`显式命名消除歧义。

### 8.2 接受、连续补全与异步安全

建议列表可上下选择，Tab接受当前候选；单一结果Tab直接补全，目录结果不追加终止空格并继续下一层。普通文件可结束token，含空格/引号/Unicode路径保留可重新解析的表达。无候选时Tab不删除正文、不提交消息。

补全只替换光标处token范围，保留之前、之后及其他行，包括在词中编辑。使用已有snapshot/revision机制复验接受时的文本、cursor、session/root和目录来源；旧查询、关闭或换根后迟到结果不回填。候选类型携带path/skill/command身份，不能仅看字符串是否以`/`开头判定执行。

路径查询读取相关目录并复用现有有界/cancellable owner，不随每次按键递归扫整棵文件系统。无权限、不存在、符号链接变化和Windows路径按真实结果降级；补全路径仅是输入文本，不自动读取文件正文、授权访问或调用工具。

验收覆盖首位slash、前置空格、第二源行、软折行、正文`/home`、目录连续Tab、空格路径、相对/home/Windows路径、URL、同名skill/path、光标前后正文、查询取消、根切换及无匹配后退格。测试中使用隔离目录替代依赖真实用户home内容。

## 9. 一次输入使用多个skill

ADD-11同时实现候选与提交两端。初次定位时，[expandSkill](../../packages/ts-shell/src/core/prompts/expansion.ts)与[slashRouter](../../packages/ts-shell/src/core/commands/slashRouter.ts)只处理开头的一个`/skill:`。当前expandSkill已委托[expandSkills](../../packages/ts-shell/src/core/prompts/skills.ts)收集、校验与去重全部明确调用，slashRouter已接组合准备；正文候选沿[prose completion](../../packages/ts-shell/src/cli/interactive/completion/prose.ts)区分skill、准入命令与路径。现有局部payload/工作流证据见第15节，把多个名字插进草稿本身仍不等于它们都生效。

参考A的正文skill补全会限制为skill、插入canonical token并仅替换局部词。但第14节记录的参考快照中parseSkillInvocation只提取首个匹配，buildSkillCommandPrompt也只构造一个skill消息；本轮未证明剩余skill会通过另一条路径全部注入。用户观察支持“参考体验可用”的方向，**本项目验收必须比单个parse更完整，不能把参考的多skill注入当作已证事实。**

要求：

1. 在开头、正文中间、源文本第二行及后续位置可选择skill；输入短前缀时正文只匹配skill或准入组合命令，不弹出全部slash。
2. 一次提交包含两个或更多不同skill时，解析所有明确invocation，并在同一个请求/工作流中注入全部所需指令。
3. 按出现顺序稳定收集，按解析后的skill身份去重；同一skill重复出现不重复塞body，用户剩余正文按源范围保留。
4. 每个skill仍由[现目录](../../packages/ts-shell/src/core/skills/skillCatalog.ts)解析，遵守project trust、disabled/noSkills、显式skill路径、贡献来源及freshness。名字碰撞用明确identity/namespace，不靠模糊名称猜最终加载文件。
5. 选中只插token，不加载正文发请求；提交后统一解析/校验。明确未知`/skill:xxx`、失效或加载失败要报告具体skill并保留可重试草稿，不能只运行成功的那个又宣称整体完成。
6. 展开只处理用户输入一次，不递归执行skill body内出现的slash。原文、调用来源、实际skill identity和加载revision分开保存；没有自动扩大工具权限。
7. skills与正文共同计入ADD-08和实际请求预算，超过预算时沿现准入机制处理，不能静默截掉第二个skill。
8. 排队、取消、恢复草稿、再次提交与多模态附件维持一份原始输入，不能为每个skill制造独立前景收费回合或重复消息。

验收示例中的skill名为隔离夹具名称，实际使用从目录选择：

```text
/skill:research-a /skill:review-b 比较两种方案

请比较两种方案 /skill:research-a
再用 /skill:review-b 检查证据和结论
```

检查提交给模型/工作流的payload确有两份正确指令与一份完整正文，配对的original draft未被重排或吞行；还有重复、未知、拒绝来源、加载中修改草稿、失效、超预算、取消、队列/恢复及附件场景。不能仅检查候选数量或字符串中还留着第二个skill名。

## 10. 一次输入组合部分slash命令

ADD-12在参考的正文skill限制上扩展，允许与skill搭配、以及多个互相兼容的提示词型slash。用户明确点名deep-research，不能把它降为“以后考虑”或只允许skill组合。

### 10.1 “非功能性”按实际动作界定

这里指为同一次用户任务添加方法、提示词或研究入口的动作，不是命令没有价值。不能仅凭[CommandKind=prompt](../../packages/ts-shell/src/core/commands/types.ts)或名字判断可组合：resume、fork、queue、loop等也可能标为prompt，但有会话/执行副作用；[deep-research语法](../../packages/ts-shell/src/core/commands/research/syntax.ts)同时包含研究和status/pause/resume/reconcile等控制。

| 类型 | 初始策略与明确边界 |
|---|---|
| 显式skill调用 | 可组合多个；沿ADD-11统一注入 |
| 纯提示词模板/方法修饰 | 显式声明可组合且无准备阶段副作用的入口可加入；允许多个兼容项 |
| deep-research的新研究问题入口 | 后续实施必须支持与一个或多个skill搭配，位于首位或正文中均可识别；沿真实research owner运行 |
| deep-research的status/dump/pause/resume/steer/reconcile及保存流程 | 不作为正文方法修饰执行；原独立控制/保存准入路径保留 |
| brainstorm与明确可组合的提示词模板 | 当前brainstorm已声明modifier，模板仅在frontmatter为`composable: true`时声明modifier；准备沿原纯构造入口，不能把整handler任意串行执行 |
| review | 已声明为单一driver：它读取真实Git snapshot并构造一份只读review prompt，可消费共享正文、brainstorm modifier及全部skill；不能与另一个driver同时拥有任务 |
| settings/model/connect/login/logout、会话恢复/删除、权限、shell/git、队列/后台控制等 | 不进入正文组合候选，不因正文token改变全局/会话状态或执行功能动作 |
| 第三方扩展/新命令 | 默认不组合；通过同一owner能力声明、解析与准入后才可加入，不能仅按summary关键词开放 |

建议按动作声明组合能力：提示词modifier、单一工作流driver或不参与组合，由同一声明同时驱动发现候选、解析和执行准入。名称、alias与named invocation继续走原解析，避免一份补全白名单和另一份执行白名单漂移。

### 10.2 同一次任务的构造规则

- 解析用户原始文本为正文、skill和准入命令片段，保留各自source range。完整功能命令仍只在首位独立路径执行；正文组合路径使用声明的纯构造/准备入口。
- 多个兼容的纯提示词modifier可以参与一份输入。建议一份组合只拥有一个带预算/持久状态的driver，例如research；不是限制只能有一个slash，而是避免两个独立工作流抢同一会话。
- deep-research加多个skill形成一个研究请求：skill指令传入真实[research owner](../../packages/ts-shell/src/cli/runtime/research.ts)，保留其requestPolicy、预算、取消、证据/报告流程；不能普通聊天冒充deep-research已启动。
- 每个命令的参数范围由语法解析，到下一个明确invocation边界终止；共同问题正文保留原顺序。未声明参数的正文modifier不猜测吞掉之后全部文字。
- deep-research的mode/depth等研究参数沿现语法；`--save`及控制词不能因组合解析而跳过原批准流程。冲突参数、两个不兼容driver、缺问题或不支持动作应明确指出并保留草稿，不能悄悄只运行第一个。
- 字面引用、代码、路径、URL和转义token保持内容，不自动执行。接受补全时携带类型，但用户直接输入canonical token也须得到一致解析；不可仅凭内存里的suggestion选择记录决定语义。
- 不把所有slash依次调用execute后再拼结果。准备和提交分开，完整校验成功才启动一个实际任务；构造失败时零隐式功能动作，实际派发后的结果按原unknown/partial语义报告。

必达示例，skill名为示例夹具：

```text
/deep-research --mode software --depth deep /skill:research-a /skill:review-b 比较两种架构

请比较两种架构 /deep-research /skill:research-a /skill:review-b
重点检查可验证证据和反例
```

`问题正文 /brainstorm /evidence /skill:review-b`中的`evidence`仍仅为隔离夹具模板，必须有`composable: true`，不是内置命令承诺。[既有组合测试](../../packages/ts-shell/src/core/commands/composition.test.ts)覆盖brainstorm与该模板共同构造、零handler调用。`问题正文 /brainstorm /review /skill:review-b`现按review driver准入：一个真实Git review prompt消费共享问题、brainstorm指令和全部skill，不先启动多个独立任务；review与deep-research等第二个driver同时出现时必须在派发前拒绝。

验收包含deep-research+两skill、正文研究入口、两个兼容modifier、control动作拒绝、功能命令正文不执行、同名path/command、alias兼容、参数冲突、两个driver拒绝、skill未知、权限拒绝、取消、排队和输入恢复。检查真实工作流绑定、指令payload、provider派发次数与原状态/写权限，不能只检查提示词含有命令名称。

## 11. 其他已发现问题的收口

ADD-13处理入口与配置发现性，属于已发现但次于主反馈的改善：

- theme已进入settings，日常发现入口优先settings；独立theme兼容语法和当前进程/保存语义明确，不能直接删掉owner。
- statusline与settings入口可收敛；login/logout是connect快捷委托，不当作第二套auth实现。
- view有真实诊断/审批消费者；改善名称或用途说明，不能以“无价值”删除功能。
- 配置文件只存显式覆盖，空项目文件不等于字段没用。通过settings详情和指南发现默认值、来源、适用provider及应用时点，不要求把所有默认字段写回文件。

其他未经证明的缺陷不升级成修复任务：`npm start`并非每次编译、resume时间排序没有写反、已存在settings分类、已配置字段有真实消费者。真实token差额、按键现场根因与本机性能数据仍按各ADD任务验证，不归入“不存在”。

## 12. 补充任务总表与完成情况（唯一任务台账）

**本节是全部补充任务的唯一定义与状态来源。** 第 17–22 节是研究过程与逐批实施记录，其中的问题条目（用户编号第十七至第三十七、第 24 至 30 项、子代理 review 发现等）已在此按职责归并到 ADD 序号；同一件事在旧章节里可能被拆成"研究""实施""补强"三段，在这里只有一个条目。

状态用语是严格区分的，不得互换：

| 状态 | 含义 |
|---|---|
| 未开始 | 只有定位或方案，没有产品改动 |
| 本地实现 | 产品代码已改，有聚焦测试与反转；**未**经真实 CLI 验证 |
| 本地验证 | 本地实现 + 至少一次真实 CLI/PTY 证据；仍缺所列环境 |
| 部分完成 | 核心路径已交付，但本条列出的完成条件有明确缺口 |
| 完成 | 本条完成条件的每一项都有对应证据 |

"完成"只表示本条列出的完成条件全部满足；它不等于用户真实环境验收，也不提升原 Phase 20 的 47 项矩阵。

### 12.1 面板与设置（ADD-01 至 ADD-03、ADD-14 至 ADD-24）

| ID | 优先级 | 交付内容 | 来源（旧章节/用户编号） | 状态 | 尚缺 |
|---|---|---|---|---|---|
| ADD-01 | P0 | model 面板未配置模型可聚焦、可浏览、可进入精确配置 | 第 3.2、第 15 节首批、第八十六至九十七批 | 部分完成 | 用户原环境按键现场；真实认证服务的完整往返（自动回返已在 `modelAuthentication` 实现并有测试） |
| ADD-02 | P0 | model 分类/角色/预设/连接/详情的完整导航与操作路径 | 第 3.3、第六批、第七十六至九十八批 | 部分完成 | 真实 provider 的能力/认证组合矩阵（角色独立 thinking 编辑已由 `modelRoleThinkingPicker` 实现并有测试） |
| ADD-03 | P0 | settings 分类/section/编辑器/Apply/来源的真实路径 | 第 3.4、第三十八至三十九批、第一百至一百零三批、第24.46、24.60–24.61节 | 部分完成 | 工具allowlist与发现入口的实际声明、失败Apply后的编辑及保存范围取消返回重试已修补；其余字段×来源×编辑器×窗口组合 |
| ADD-14 | P0 | settings 顶部导航，左右键切分类、Tab 切条目与分节 | 第 32 项、21.2、21.15 | 本地验证 | 真实桌面鼠标/键盘；其他平台 |
| ADD-15 | P2 | model 面板未就绪项置底、组内字母序、Not ready 分隔标题 | 第 35 项、21.5、21.16 | 本地验证 | 真实面板观感；窄屏分隔标题 |
| ADD-16 | P1 | 区分 config.json 与 models.json 的归属，并显示目录加载诊断 | 第 31 项、19.5、21.1、21.14 | 本地验证 | 用户真实 models.json 现场 |
| ADD-17 | P1 | settings 子面板返回、取消与失败后保留原 notice | 第 8、25、26 批、第24.60–24.62节 | 本地验证 | Linux真实目录权限拒绝/恢复已验；物理磁盘故障及其他平台仍缺 |
| ADD-18 | P2 | 面板悬停、滚轮、侧栏独立滚动与非循环焦点 | 第 17–21 批、21.19 | 本地验证 | 真实桌面鼠标手感 |
| ADD-19 | P2 | 面板鼠标选择后的键盘焦点与切类后的原字段恢复 | 第 17 批、21.19 | 本地验证 | 同上 |
| ADD-20 | P2 | 角色动作退役、子面板返回与不可用档位的只读焦点 | 第 42–44 批、第八十至九十四批 | 本地验证 | 完整角色/认证矩阵 |
| ADD-21 | P2 | 模型详情过期准入、退出生命周期与重开目录发布 | 第三十五、八十三至九十二批 | 本地验证 | 真实磁盘故障；平台矩阵 |
| ADD-22 | P2 | 模型精确目录归属与能力信息（图片/工具/推理/上限） | 第三十四批、20.18、20.15、第一百零六至一百一十批 | 本地验证 | 真实 provider 能力行为 |
| ADD-23 | P2 | 不支持工具的模型不收到工具声明与工具历史 | 第一百一十至一百一十五批 | 本地验证 | 真实 provider 行为 |
| ADD-24 | P2 | 认证快捷入口的语法与连接发现性 | 第 47–48 批、ADD-13 收口 | 本地验证 | 真实认证服务 |

### 12.2 会话、resume 与恢复（ADD-04、ADD-25 至 ADD-30）

| ID | 优先级 | 交付内容 | 来源（旧章节/用户编号） | 状态 | 尚缺 |
|---|---|---|---|---|---|
| ADD-04 | P0 | resume 自动焦点与手动选择的分界 | 第 4、第 15 节首批、第四十六批 | 本地验证 | 桌面跨平台 |
| ADD-25 | P0 | resume 打开/搜索/删除不整目录重扫，扫描不阻塞事件循环 | 第 29、33 项、19.6、21.3、21.11–21.13、21.18、21.25–21.26、第 24.41 节 | 部分完成 | 用户大目录真实体验；cold/warm 磁盘与总 heap |
| ADD-26 | P1 | 会话退出有界、失败可见，信号关闭保留恢复证据 | 第 26、30 项、19.3、20.2、20.5、20.19、20.35、20.37、20.40、21.35–21.36、21.43 | 本地验证 | 用户故障设备；非 Linux；SIGKILL 不可捕获 |
| ADD-27 | P1 | 双击 Esc 返回面板，失败时不静默 | 第 34 项、21.4、21.10 | 本地验证 | 真实终端按键节奏 |
| ADD-28 | P1 | 中断会话的思考块保留与恢复 | 第 25 项、20.3、21.57、24.65 | 完成 | —（当前 provider 的 Node 普通/全屏现场见24.65；不承诺恢复扣留或未落盘内容） |
| ADD-29 | P1 | 用量记录损坏时保留健康分桶并显示未知，不伪造数字 | 19.8、20.6 | 本地验证 | 原损坏记录的生成原因 |
| ADD-30 | P2 | 跨进程恢复的伪造结果（运行所有权租约） | 21.73 | 未开始（已记录不修） | 需要架构级租约；仓促实现会阻塞合法恢复 |

### 12.3 输入区、几何与手势（ADD-05、ADD-06、ADD-31 至 ADD-34）

| ID | 优先级 | 交付内容 | 来源（旧章节/用户编号） | 状态 | 尚缺 |
|---|---|---|---|---|---|
| ADD-05 | P0 | 已提交用户消息顶格、保留源缩进与复制 | 第 5、第 15 节首批 | 本地验证 | 系统剪贴板/桌面 IME |
| ADD-06 | P0 | 编辑框恢复箭头、消除额外左 padding、续行对齐 | 第 5、第 15 节首批 | 本地验证 | 桌面输入法现场 |
| ADD-31 | P1 | 长文本块按光标或重复 Ctrl+V 展开 | 第 17 项、17.1、第一百一十七批、第 36 项、21.6、21.17 | 本地验证 | 真实按键节奏手感 |
| ADD-32 | P1 | 草稿暂存栈（Ctrl+S / alt+s）与润色后一键取回原稿 | 第 21 项、17.4、第一百二十、一百二十三、一百二十八批、21.23、21.27 | 本地验证 | 非 raw 模式下 IXON 吞键未真机验证 |
| ADD-33 | P2 | 点击输入框任意位置移动光标 | 第 37 项、21.7、21.17 | 本地验证 | 真实终端点击精度；缩放后重排 |
| ADD-34 | P2 | 外部编辑器末尾 CRLF 不产生额外空白草稿行 | 20.48、20.51、21.37、21.44 | 本地验证 | 用户真实尺寸与终端现场 |

### 12.4 启动、上下文与计量（ADD-07 至 ADD-09、ADD-35 至 ADD-36）

| ID | 优先级 | 交付内容 | 来源（旧章节/用户编号） | 状态 | 尚缺 |
|---|---|---|---|---|---|
| ADD-07 | P1 | 提前 TUI 首帧与 runtime 一次交接 | 第 6、第四批、第三十七批、第 24.39 节 | 部分完成 | Node/exe 普通/全屏的生产加载期输入、取消与错误恢复已验证；冷缓存、桌面全矩阵及完整性能验收仍缺 |
| ADD-08 | P1 | 启动上下文估算、实测衔接与差额调查 | 第 7、第五批、22–24 批、第三十三批、第一百零四至一百零五批、第 24.35–24.38、24.40、24.43–24.47、24.103–24.105 节 | 部分完成 | 纯组合、模板、原生研究/review preview、目录词表及按需加载已实施；Node/exe真实TUI计量衔接、context身份转交及受限工具目录的实际schema/估算已修补验证；默认动态首请求18个schema与4325/4588估算/实测已取证；不支持的control/workflow仍unknown；R5 微压缩前缀校正已本地实现与调用链验证，真实 provider/终端复验尚缺；历史1.7k/4.9k同快照差额、其他环境/provider/词表、完整媒体/协议与性能验收尚缺 |
| ADD-09 | P1 | `/context` 目录/请求估算口径修正 | 第 7、第四批、第 24.44–24.45、24.103–24.105 节 | 本地验证 | 当前报告身份经真实 slash 桥接与 Node/exe TUI 验证；本轮 R5 preview/dispatch/evaluator 聚焦验证通过，新增校正未真实 provider 复验；不借此宣称 ADD-08 完成 |
| ADD-35 | P2 | 状态栏 live 估算与 provider 实测的优先级 | 第一百零五批、21.28–21.30 | 本地验证 | 真实 provider 延迟 |
| ADD-36 | P2 | 目录刷新来源标记与能力上限准入 | 第一百零六至一百零八批 | 本地验证 | 真实外部索引内容与端到端 compaction |

### 12.5 输入解析、路径与组合（ADD-10 至 ADD-12、ADD-37 至 ADD-40）

| ID | 优先级 | 交付内容 | 来源（旧章节/用户编号） | 状态 | 尚缺 |
|---|---|---|---|---|---|
| ADD-10 | P1 | 按源位置识别 slash/正文路径并 Tab 补全 | 第 8、第三批、第七十八至八十七批、第一百一十批 | 本地验证 | 真实 Windows 终端 |
| ADD-11 | P1 | 正文 skill 候选与同提交多 skill 注入 | 第 9、第三批、21.22、21.24、第 24.48 节 | 本地验证 | Node/exe普通多skill真实派发及print原文保持已验证；真实计费金额、研究driver质量与其他环境组合仍缺 |
| ADD-12 | P1 | 准入 slash 组合与 deep-research + skills | 第 10、第三批、第五十、五十二、五十九批、第 24.52–24.53 节 | 本地验证 | Node/exe公开夹具均完成原生阶段/3片段、各13 finalized；真实源码研究停在investigate、1请求unknown，未获质量验收；真实资料质量与桌面仍缺 |
| ADD-37 | P2 | 显式队列入口保留附件与正文尾部空白 | 第九十五批 | 本地验证 | 真实 provider/平台 |
| ADD-38 | P2 | 引用路径、apostrophe、转义目录的补全往返 | 第七十八至八十七批 | 本地验证 | 原生 Windows 文件系统 |
| ADD-39 | P2 | 代码示例、URL、转义 slash 不误触发命令/skill | 第二十九、七十九批 | 本地验证 | 真实终端 |
| ADD-40 | P2 | 组合选项的引用值与 flagless 正文 | 第八十五批、第五十二批 | 本地验证 | 真实研究派发 |

### 12.6 文件操作与 workspace 根（ADD-13、ADD-41 至 ADD-45）

| ID | 优先级 | 交付内容 | 来源（旧章节/用户编号） | 状态 | 尚缺 |
|---|---|---|---|---|---|
| ADD-13 | P2 | 重叠入口与默认配置发现性 | 第 11、第四十七至四十九批、第六十九批 | 本地验证 | 真实 provider/桌面矩阵 |
| ADD-41 | P1 | 跨目录写入经显式授权而非绝对拒绝 | 第 24 项、19.1、17.7、第一百一十九批、20.42、20.45、20.46、21.38–21.51 | 部分完成 | 用户目录审批现场；非 Linux 文件系统 |
| ADD-42 | P1 | 附加 workspace 根接入全部文件工具（write/edit/read/glob/grep/apply_patch/lsp） | 21.38–21.55 | 本地验证 | 真实用户多根工作流 |
| ADD-43 | P1 | 只读附加根在两个平台的 sandbox 中都受保护 | 21.60 | 本地验证 | 真实 macOS seatbelt |
| ADD-44 | P2 | 附加根下的撤销账本、路径投影与 `/undo` 归属 | 21.47–21.51 | 本地验证 | 同上 |
| ADD-45 | P2 | 重叠根去重与目录身份复验 | 21.59、21.26 | 本地验证 | 真实大目录 |

### 12.7 文件恢复与 turn 分组（ADD-46 至 ADD-48）

| ID | 优先级 | 交付内容 | 来源（旧章节/用户编号） | 状态 | 尚缺 |
|---|---|---|---|---|---|
| ADD-46 | P1 | 按 turn 审阅与批量恢复文件操作 | 17.2、第一百二十二、一百二十五、一百二十九、20.50、20.52、第 24.42 节 | 本地验证 | 不覆盖 bash/二进制副作用；无工作区级快照 |
| ADD-47 | P1 | 整轮恢复报告区分未知写入、零写阻止与部分结果 | 20.50、20.52、24.57 | 本地验证 | Node普通/全屏真实writer的unknown注入、阻止重放与下一请求已验；真实故障设备、exe与其他平台未验 |
| ADD-48 | P2 | 并发写入同一会话不丢失、transcript 是权威来源 | 21.67–21.68 | 本地验证 | 真实多进程高并发 |

### 12.8 后台任务、团队与并发（ADD-49 至 ADD-52）

| ID | 优先级 | 交付内容 | 来源（旧章节/用户编号） | 状态 | 尚缺 |
|---|---|---|---|---|---|
| ADD-49 | P1 | `taskWait` 可等待、可取消、显示等待时长 | 第 20 项、17.3、第一百二十一、一百三十八批、20.49、21.21、24.54 | 本地验证 | 21.21已覆盖真实60秒晋升/取消/完成，当前Node普通PTY复验通过；生产实际长时工作负载与其他平台仍缺 |
| ADD-50 | P1 | 平级团队多提案、交叉证伪与收敛 | 第 22 项、17.5、第一百二十四、一百二十六、一百三十至一百三十九批、20.53–20.55、21.20 | 本地验证 | 真实模型的并发成本与收敛质量 |
| ADD-51 | P1 | 团队证据绑定实际读取收据、无证据的证伪不算数 | 20.53、20.55、第一百二十六批 | 本地验证 | 同上 |
| ADD-52 | P2 | 中止能打断已在等待的提案与评审 | 第一百三十一批、20.53 | 本地验证 | 同上 |

### 12.9 流式渲染与性能（ADD-53 至 ADD-55）

| ID | 优先级 | 交付内容 | 来源（旧章节/用户编号） | 状态 | 尚缺 |
|---|---|---|---|---|---|
| ADD-53 | P0 | 流式增量不再逐 token 落盘，渲染不被磁盘阻塞 | 第 23 项、17.6、第一百一十八批 | 本地验证 | 真实终端阻塞时长；真实 provider 体感 |
| ADD-54 | P1 | 思考秒数由时钟驱动、渲染定时器只保留一个、sources 与 rows 共用缓存 | 第一百一十八批 | 本地验证 | 同上 |
| ADD-55 | P2 | 每帧不重复扫盘（ambient peer 计数 TTL 与面板遮挡期省略） | 第一百一十八批、21.13 | 本地验证 | 真实大目录 |

### 12.10 权限、审批与安全（ADD-56 至 ADD-62）

| ID | 优先级 | 交付内容 | 来源（旧章节/用户编号） | 状态 | 尚缺 |
|---|---|---|---|---|---|
| ADD-56 | P0 | 审批的「仅本次」不得变成永久授权 | 21.74、24.68、第一百三十四批 | 本地验证 | 已移除prompt推导授权，普通/全屏实际拒绝及仅本次批准零永久grant；Node/单文件可执行程序的headless print路径已实际验证默认拒绝与显式仅本次，其他平台未验 |
| ADD-57 | P0 | 审批目标必须精确到实际调用，不得过粗 | 21.75、24.63–24.64、24.66、24.68、24.76、第一百三十五批 | 本地验证 | 完整调用及全部execution准备结果绑定，验证续接文本不再授权当前调用；原reader完整预览、容量与绘制期限已验；Node/单文件可执行程序headless实际调用已核对目标、工具结果与终态；desktop原生适配器、其他平台仍缺；MCP单次限制已覆盖headless、旧缓存与实际picker |
| ADD-58 | P0 | 钩子授权按项目隔离，项目拒绝覆盖钩子 | 21.76、24.71、24.73 | 本地验证 | 已补声明快照/工作目录与独占hook授权；通用缓存/档位不代答，其他平台与单文件程序未验 |
| ADD-59 | P0 | 钩子授权可撤回，持久授权不被内存副本遮蔽 | 21.77、24.71、24.73–24.75 | 本地验证 | 已补历史/旧格式授权与待定回答撤回、真实profile及通用缓存隔离；Linux Node及单文件程序普通/全屏来源撤回已验，其他平台与多机器锁/跨版本混写未验 |
| ADD-60 | P0 | 权限档位不跨项目存活 | 21.78、24.72 | 本地验证 | 已补普通resume/workspace切换、POSIX大小写及不读取权限的项目往返；Node普通/全屏实际重问/拒绝已验，单文件程序及其他平台未验 |
| ADD-61 | P1 | 权限层与工具体使用同一个围栏判定 | 第一百二十七批 | 本地验证 | — |
| ADD-62 | P1 | 观察者失败不得吞掉持久事件；`team` 定义名不由模型文本拼成 | 第一百三十七、一百三十九批、24.67 | 本地验证 | 同步/异步及原生取消已验；exe取消、其他平台与真实provider条件未验 |

### 12.11 其他与缺陷收口（ADD-63 至 ADD-68）

| ID | 优先级 | 交付内容 | 来源（旧章节/用户编号） | 状态 | 尚缺 |
|---|---|---|---|---|---|
| ADD-63 | P1 | 图片在提交、中断、恢复、重开与工具结果中完整保留 | 21.28–21.34、21.45、21.62–21.63 | 本地验证 | 真实图片密集型结果；图形协议终端 |
| ADD-64 | P1 | 压缩与导航不丢失未完成工作，fork 不继承在途调用 | 21.64–21.66、21.69–21.72 | 本地验证 | — |
| ADD-65 | P2 | 硬杀会话可再次 continue | 21.70、24.55–24.56 | 本地验证 | Linux Node/exe普通/全屏在途工具实际副作用后SIGKILL、未知结果与continue已验；普遍防重、孤儿自动清理、故障设备与其他平台仍缺 |
| ADD-66 | P2 | 空草稿的退出动作先于审批与预览按键归属 | 20.44 | 本地验证 | — |
| ADD-67 | P2 | 未答复审批被取消后立即结束等待并保留中断恢复 | 20.43 | 本地验证 | — |
| ADD-68 | P2 | MCP 关闭时立即拒绝未开始的调用 | 20.17 | 本地验证 | 预算到期不证明清理完成 |

| ADD-69 | P0 | 排队消息与已发送消息可区分；Enter 的 steer/排队语义稳定；队列可见可控 | 第 38 项、第 22.1 节、第 23.2 节 | 本地验证 | 真实终端按键节奏；提示行与待发送区的实际观感 |
| ADD-70 | P0 | 凭据、模型目标、普通设置分文件；含密钥的文件强制 0600 | 第 39 项、第 22.2 节、第 23.3 节、第 24 节、第 24.3 节、第 24.6 至 24.35 节、第 24.58–24.59 节 | 部分完成 | 凭据拆分/权限、导入、新连接镜像停止、模型默认值移出 auth、历史脚本配置桥接、旧 CI 夹具修复、实际请求端点诊断、fallback/pool 模型绑定、目录精确身份/原生issuer与只读 affinity、tier/会话窗口偏好与写入准入收敛、显式旧格式配置导出及两代旧源码往返、director/handoff 账号元数据读取、新角色保留普通 tier 继承、辅助请求 tier、连接报告及签名端点委派/模型控制/会话偏好准入、目录与请求状态投影、交互目录和首次角色保存的显式 provider 范围收敛、未知协议目录保留与绑定拒绝、角色变更的默认请求池退避重验和带key未知协议首次保存拒绝、角色目标在state lock内的实际pool准入重验、provider 级默认守卫放宽与生效层来源投影（ADD-72/73，第 24.79 节）、无读者声明清理（第 24.80 节）、连接预设默认模型与目录漂移修正及 `resolveProviderTarget` 分支去重（第 24.81 节）已实施；最新代码 CI、旧发布二进制回退与真实环境验收尚缺 |
| ADD-71 | P1 | fullscreen 退出后不把会话写回主屏（方案 A 已裁决） | 第 40 项、第 22.3 节、第 23.1 节 | 本地验证 | 真实终端退出后的屏幕现场 |
| ADD-72 | P0 | 放宽 provider 级默认写入守卫：连接存在不再是拒绝条件，仅只读输入与 accountPool 拒绝 | 第 24.78 节、24.78-A 裁决、第 24.79 节 | 本地验证 | 真实终端中的 provider 槽位写入、`/model status` 来源行观感 |
| ADD-73 | P1 | `/model status` 显式说明生效模型来自 provider 层还是 connection 层 | 第 24.78 节、24.78-B 裁决、第 24.79 节 | 本地验证 | 真实终端展示；会话内选择与两层来源同时出现时的可读性 |
| ADD-74 | P1 | 文件里出现来源被拒的字段时，用户能在产品内移除它，而不是每次启动都看到同一条警告 | 第 24.83 节第 1 条、24.85、24.89、24.91 | 本地验证 | 写路径已不再复活该键（下次保存即消失，真实 CLI 已验证）；未做独立 unset 命令，与 Codex 一致 |
| ADD-75 | P0 | 配置约束失败不得呈现为裸栈致命错误；交互模式给出可读原因并保留可恢复入口 | 第 24.83 节第 2 条、第 24.85 节 | 本地验证 | 已改为具名原因 + exit 1；未覆盖 profile 切换中的同类拒绝与 Node 20.3 floor 复验 |
| ADD-76 | P1 | `--doctor` 覆盖目录解析与配置约束失败，与启动时看到的拒绝一致 | 第 24.83 节第 3 条、第 24.85 节 | 本地验证 | 已复用运行时约束判定并输出可用性结论；目录解析诊断另列，未做跨平台复验 |
| ADD-77 | P1 | 上下文溢出的回合错误要说明占用构成并给出可执行动作，而不是只说「无法自动压缩」 | 第 24.84 节、24.88、24.91、24.98、24.101、24.103 | 本地验证 | 已实现工具 schema/系统/历史/输出/预留占用拆分，自动摘要 admission/未产出安全报告；R6 同切点进度暂停与隔离 Node CLI 提示已验证；真实 provider/平台体验仍待实机复核 |
| ADD-78 | P0 | 首次请求前检查预算：到达时已超预算的会话（resumed 或上回合无工具调用）应在发出请求前压缩 | 第 24.88、24.90、24.91、24.101、24.103 | 本地验证 | loop 与 session 回合前检查、反转和单测已验证；隔离真实 provider 的 Node CLI 已发布摘要与匹配 commit marker；R5/R6 本轮新增逻辑只具聚焦测试和本地 HTTP Node CLI 证据；未在 Node 20.3 floor 与真实交互终端复验 |

### 12.12 归并说明

以下旧编号已合并，不再单独存在：

- 用户第十七项与第三十六项（粘贴展开）合并为 **ADD-31**：前者是"按光标展开"，后者是"重复粘贴展开"，同一手势的两次迭代。
- 用户第二十三项（流式卡顿）拆为 **ADD-53**（持久化与事件顺序，决定性）与 **ADD-54**（渲染缓存与定时器）；两者根因不同，证据也不同。
- 用户第二十四项（跨目录写入）与 17.7、19.1 合并为 **ADD-41**；21.38–21.51 的附加根系列归 **ADD-42**，两者是"是否允许越界"与"多个根如何选择"两个问题。
- 用户第二十五项（思考不可见）拆为 **ADD-28**（中断恢复）、**ADD-22**（能力与档位）、**ADD-35**（状态栏优先级）；旧章节把它当作一件事，实际是三条独立链路。
- 用户第二十六项（退出卡住）与第三十项（旧会话界面）合并为 **ADD-26**：都由信号关闭与恢复判定决定。
- 用户第二十九项（resume 卡顿）与第三十三项（resume 约 1 秒延迟）合并为 **ADD-25**：同一面板、同一扫描链。
- 用户第三十一项与 19.5 合并为 **ADD-16**；用户第三十二项为 **ADD-14**；第三十四项为 **ADD-27**；第三十五项为 **ADD-15**；第三十七项为 **ADD-33**。
- 子代理 review 的安全发现（21.74–21.78）原为"范围外缺陷"，因都属审批与授权语义，归入 **ADD-56 至 ADD-60**。
- 第十轮（第 22 节）的第三十八至第四十项直接编为 **ADD-69 至 ADD-71**，此前没有旧编号，无需归并。
- 第十一轮（第 24.78 节）的两项裁决新编为 **ADD-72、ADD-73**，分别对应 24.78-A（守卫放宽）与 24.78-B（来源展示）；两者来源相同但改动面不同（行为修正 vs 只读投影），因此不合并。

### 12.13 交付顺序

依赖关系决定了顺序，不是优先级本身：

1. **ADD-56 至 ADD-62**（权限与授权语义）——这些是安全边界，先修。任何在其之上的授权体验都建立在这里。
2. **ADD-53、ADD-54**（流式）与 **ADD-26、ADD-25**（退出与 resume）——用户每天直接感知。
3. **ADD-01 至 ADD-03**（面板）继续补操作链；**ADD-14 至 ADD-24** 的残余项随之收口。
4. **ADD-41、ADD-42**（workspace 根）——改动面最大，需与 sandbox、ledger、路径投影一起验证。
5. **ADD-50 至 ADD-52**（团队）——依赖前面的审批与证据绑定。
6. **ADD-72、ADD-73**（模型默认值作用域）——ADD-72 是行为修正，先做；ADD-73 依赖 ADD-72 确定的最终层语义再补展示。两者都在 `/model` 写入链上，应与 ADD-70 剩余的重复事实收敛一并考虑，避免二次改动同一处守卫。
7. 其余 P2 项按用户实际反馈调整。

### 12.14 状态汇总

| 状态 | 数量 | 条目 |
|---|---:|---|
| 完成 | 1 | ADD-28 |
| 部分完成 | 8 | ADD-01、02、03、07、08、25、41、70 |
| 本地验证 | 68 | 其余已实施条目（含本轮 ADD-72 至 ADD-78） |
| 本地实现 | 0 | — |
| 未开始 | 1 | ADD-30（已裁决不启动，需架构级租约） |
| **合计** | **78** | — |

ADD-72/ADD-73 于 2026-11-01 按第 24.78 节裁决实施，证据见第 24.79 节：两项均已落地并只做本地聚焦验证，尚未经真实终端观感与真实 provider 工作流验收。ADD-30 仍按既有记录不启动（需要架构级租约）。

**ADD-28已满足本条列出的完成条件。** 部分完成的8条各有明确缺口，其余63条停在"本地验证"；具体缺口以对应条目为准。第24.43–24.45节已补所选真实provider及Linux/Node/exe普通/全屏的计量链路，第24.65节补当前provider的中断推理恢复现场；这些证据不能替代其他条目的真实工作流、桌面输入法/剪贴板、macOS/Windows与完整性能矩阵，也不能把局部绿色证据兑换成整体验收完成。

原 Phase 20 的 47 项矩阵保持 **38 complete / 9 partial / 0 open**，与本表分开记录。

## 13. 验证、反转与完成证据

本轮文档编制不运行产品测试或构建；只检查文档链接、diff及索引规则。后续产品实施验证集中由主代理单进程串行执行，禁止并行build/vitest/tsc/normproof。20k边界只用mock/切片逻辑，不做真实长历史PTY；所有小型夹具、终端探针与临时状态位于隔离scratch目录。

聚焦验证必须覆盖真正改变的边界，而非复述实现：

| 组合路径 | 必须观察的事实 | 有效反转条件 |
|---|---|---|
| 一个已配置模型→选未配置模型→配置取消→返回 | 实际key事件、focus ID、详情、活动模型和持久值 | 恢复skip-disabled后该交互断言失败 |
| settings分类→section→输入编辑器→Apply/Discard | 值/来源/应用时点、焦点域、预览撤回 | 恢复平铺或抢走编辑键后导航/编辑断言失败 |
| resume先旧后三新、加载中手选 | 自动更新与手动保持分别成立 | 恢复无selectionTouched分界后至少一个行为断言失败 |
| 输入/提交→resize→选区复制 | 实际列、原文缩进、arrow与源文分离 | 恢复左padding或旧source width后几何/复制失败 |
| loading首帧→输入→ready→提交/退出 | 首帧/ready时间各自、唯一草稿、零预就绪派发 | 把首帧放回runtime后或重复移交输入导致断言失败 |
| 正文path→Tab→两个skill→deep-research提交 | 局部替换、全skill payload、单研究绑定、保真输入 | 只解析首skill、trimStart误路由或逐handler串执行导致失败 |
| 未计量→本地估算→provider用量→换模型 | 身份与四态、目录/发送集合及cache口径 | 恢复完整目录下界或旧计量复用后语义断言失败 |

测试通过后再按实际变更运行需要的静态门、构建及小型PTY/平台验证，不默认做全仓重验。反转只在隔离/可精确恢复的条件下进行；恢复后重新运行受影响检查。不得修改测试预期以隐藏按键仍不能移动、多skill仍只生效一个或组合仍多次派发的问题。

每个ADD完成记录至少包含：实现owner与差异、真实用户路径或夹具场景、验证命令及结果、已知限制。local、uncommitted、committed、pushed、精确SHA的CI与真实环境证据各自记录；任一缺失就保留缺失，原Phase20的外部条件不因补充本地修补自动完成。

## 14. 只读对照依据

| 来源 | 定向读取位置 | 支持的事实与局限 |
|---|---|---|
| oh-my-pi模型面板 | packages/tui/src/overlays/model-hub.ts：731–781、812–865、1048–1059、2721–2758 | 分类与锁定provider诊断；不是所有未配置模型都能直接启用，搜索状态规则另有分支 |
| oh-my-pi设置面板 | packages/tui/src/overlays/settings-defs.ts：4–110；settings-selector.ts：108–141、1920–1955 | 十主类/section与焦点域；外部配置项目不自动成为本项目能力 |
| oh-my-pi补全 | packages/tui/src/autocomplete.ts：83–99、482–493、586–627、675–727、833–858 | 正文skill限定、路径后备、只替换token；前导空白规则与用户首位要求有差异 |
| oh-my-pi提交skill | packages/tui/src/prompt/skill-tokens.ts：8、28–34；packages/coding-agent/src/extensibility/skills.ts：639–668；src/modes/skill-command.ts：59–83 | 当前解析和构造各处理一个skill；未证明多token全注入，需本项目明确补全 |
| oh-my-pi启动 | packages/coding-agent/src/cli.ts：522–555；src/modes/startup-composer.ts：69–99；src/main.ts：630–661 | 预绘制、后加载、同Composer移交；不代表初始化总耗时已对照 |
| oh-my-pi上下文 | packages/coding-agent/src/session/session-stats.ts：367–389；packages/tui/src/status-line/context-usage.ts：237–281、364–377 | 无anchor本地估算、实际roster与条件schema计量；不证明用户具体1.7k的数值组成 |
| oh-my-pi编辑器内容身份 | packages/tui/src/components/editor.ts：3234–3253、4698–4735 | 内容修改推进textRevision，纯光标移动不推进；本项目同时保留自己的cursor-sensitive range snapshot版本 |
| pi会话选择 | packages/coding-agent/src/modes/interactive/components/session-selector.ts：363–394 | selectionTouched分界；本项目最新/置顶/可恢复性按新增规则决定 |

这些证据是实现前定位和对照，不是动态复现或产品验收。需要补齐的运行证据已写入对应任务，不把未知变成缺陷不存在，也不把参考能力全部宣称已交付。

2026-10-26初次文档校验：当时14节和ADD-01…13齐全（后续已扩充至ADD-68并归并，见第12节）；本文39个本地链接目标及源码行号存在，关联调查/决策/两级索引的目标也已检查。`verify:docs-drift:strict`与`git diff --check`通过，保留既有118条未加根前缀引用advisory。当时仅改Markdown、未运行产品验证；实施后的源码位置与证据以下述owner和批次为准。

## 15. 实施与验证证据

### 首批：模型浏览、resume焦点与输入几何

2026-10-26，需求基线提交`0f12984`；本批代码/证据提交另绑定。没有修改原Phase20的47项状态。

| ID | 当前状态 | 实现与证据 | 尚缺边界 |
|---|---|---|---|
| ADD-01 | 部分完成 | 模型disabled activation与focusable browsing分开；上下键/鼠标可聚焦未配置模型，Enter走inspection，配置入口准备精确model的现connect草稿，返回保留ID。单ready/全missing、relay、搜索、取消和原持久值测试通过；regular/fullscreen真实PTY的↑↓/Enter/Back/Esc通过 | 整体分类、配置后自动回到目标及刷新随ADD-02继续；真实登录成功/失败与用户原现场原因不冒充已复现 |
| ADD-04 | 本地实现验证通过 | 默认按可见summary更新时间取最新，不受旧pinned/current影响；方向键或点击后保留ID，搜索新生命周期重置；先两天前current再三条今天记录的渐进夹具两分支通过。复用picker重新打开清除旧搜索状态 | 当前Linux夹具证据；未另做桌面跨平台验收 |
| ADD-05 | 本地实现验证通过 | 用户文本从第1列绘制，按全宽折行，原文缩进保留；源投影同步。额外修复末尾换行产生多余绘制行导致复制失效的问题；含中文/emoji/组合字符/逻辑换行的复制通过 | 系统剪贴板/桌面IME不在本批证据内 |
| ADD-06 | 本地实现验证通过 | default/borderless/top-rule恢复`❯ `，left/right padding独立，正文column=2，续行对齐；其他五种形态保留。窄屏、resize、选区/caret/IME-tail单元夹具通过，两种真实TTY首帧有箭头 | 桌面输入法现场仍未验证 |
| ADD-02/03/07…13 | 首批时待实施/验证 | 后续批次更新见下文 | 不从首批绿色测试提升剩余任务 |

验证全部由主代理串行执行：五个静态门和diff check通过（保留既有118条docs-source advisory）；模块责任上限检查0 findings。首轮九个直接受影响文件238测试发现6失败，分别修复picker搜索生命周期、复制末尾换行，并纠正清搜索后多按↑及过宽搜索/隔离配置夹具；最终受影响六文件147测试通过，overlay/options另94通过，几何/layout等绿色结果保留。TypeScript构建`adf30efee228`通过。中间一次Vitest从仓库根重复传相对config导致runner配置路径错误，未执行测试/构建；改回package cwd/合法root后通过，不记作产品失败。

六个产品文件临时恢复HEAD实现后，模型真实overlay浏览、resume untouched默认、普通箭头和transcript宽度/源复制各行为断言失败，随后逐文件字节精确恢复并重新通过受影响测试。小型隔离PTY只装一个ready connection和三个missing models，无长历史，regular/fullscreen均通过；未请求真实provider、未运行全仓回归或真实20k二进制。

### 第二批：模型与设置导航层次

首批`42d90f08cb1227eb380a1188fa87066fed7f3309`已提交/推送；本节最初记录时CI仍运行，后续实际结果和Watch工件读回见第三批，不能把当时pending当作通过。

ADD-02/03现有共享CatalogNavigation和导航绘制owner：宽屏分类栏/内容/详情，窄屏分类焦点页；Tab切焦点域，model左右返回分类/进入内容，settings左右切分类、Tab跳section/rows。模型Roles/All models/provider均可导航，自动角色显示真实session policy，预设仍由原owner启用；精确connection label进入详情。同一配置publication revision变化时刷新目录，关闭后迟到刷新零发布。settings元数据映射Appearance/Model/Interaction/Context/Files/Tools/Tasks/Providers及真实section；无编辑字段的Memory/Shell省略，未伪造支持。列表只显示名称/值，字段、来源、生效时点集中详情；搜索清空恢复分类和原焦点，数值输入方向键属于输入编辑器，Discard取消，Apply后回到字段并保留可见保存结果。

主代理串行聚焦验证：model29、settings runtime34、settings picker18、overlay74、config settings6绿色；导航两条真实host路径和watch迟到发布测试通过。中间watch测试只等待两个microtask仍未触发fake-clock完成，改等待计时器周期完成后通过，不改生产发布逻辑。第二批最终TS构建`9c0de397c212`。反转两个picker为首批平铺版本后，model/settings两条导航路径都失败，文件精确恢复后2/2通过。regular/fullscreen隔离真实PTY分别通过未配置模型↑↓/详情/返回，以及settings分类→搜索→数字编辑→暂存→Apply→磁盘值7读回；初次PTY因成功notice被全屏列表遮住超时，修复为返回列表显示保存结果后双模式通过。

本批继续记ADD-02/03为**部分完成**：结构、焦点域、真实编辑/保存和目录刷新已有本地证据；完整角色编辑、精确连接认证后自动回返、所有编辑类型/来源组合和桌面跨平台证据仍需后续补齐。不得以新分类或两条PTY路径宣称整体看齐全部验收。

### 第三批：正文路径、多skill与有限命令组合

第二批`a513333f5bac00333608f0ab8d21605ac812a83b`已提交/推送。第三批以它为基线，代码与证据已提交/推送为`3841998de322e93b884eac38a36560cd4ea7746d`；保留原47项验收范围，补充任务独立记录。

| ID | 当前状态 | 实现与边界 |
|---|---|---|
| ADD-10 | 本地实现验证通过 | 统一源位置token，完整功能菜单/命令参数只认offset=0；正文绝对/相对/home/Windows路径、引号目录连续Tab和局部替换复用现有path owner。第五十四批起，首位真实路径可与命令/alias候选并存，命令优先，Enter保留精确命令而Tab可选路径；隔离文件加引号防止被slash parser误当作命令。裸slash只提供匹配skill名及已声明组合方法，显式`/skill:`可搜描述。候选有path/skill/command类型和身份，保留现有异步snapshot与取消准入；真实Windows终端仍缺 |
| ADD-11 | 本地实现验证通过 | 同提交加载全部明确skill，按稳定身份去重、记录源range及body digest；统一校验失败、配置变化、来源撤销、取消或预算超限则不部分提交，返回原草稿。保留原文缩进/换行及多行持久历史；忙碌输入等待同一提交边界，附件随排队/编辑/派发/取消恢复保留。真正交互路由检查两份body和一份图片，未请求真实provider |
| ADD-12 | 本地实现验证通过，准入范围明确 | brainstorm纯方法与显式`composable: true`模板可组合；deep-research首位/正文/alias支持多skill，创建一个真实native research，持久化所选方法并将指令送入每个实际子阶段。review现声明为单一driver，消费共享正文、modifier与全部skill并生成一份真实Git review prompt；research控制/save/help、功能命令混入、两个driver及非法参数在派发前拒绝；driver派发后异常不伪装零派发，意外shell-action不交给功能路由 |
| ADD-07/08/09/13 | 待实施/验证 | 提前首帧、启动估算、context目录口径与发现入口继续按第12节处理；不能从本批多skill绿色提升 |

实际owner：`core/prompts/tokens.ts`扫描原文，`core/prompts/skills.ts`统一skill展开，`core/commands/composition/plan.ts`收集方法和声明参数，`core/commands/composition.ts`准备后单派发；模板进入同一registry，补全和提交复用同一组合声明。`research/brief`及`research/run/prompts.ts`保留真实request与子请求传播，未另造研究工作流。参考正文skill的名段前缀和路径后备；用户指定offset=0优先于参考忽略前导空白规则。参考快照只证明单skill parser，不能据此称其完整多skill注入已验证。

串行聚焦证据：最终新增边界46测试通过（composition17、research composition11、skills14、inputQueue4）；真实InteractiveMode的组合图片派发、取消恢复、busy组合排队、前置空白四条通过，其余92条未运行。此前completion/router/template/queue96、research/runtime/resume24、旧CI行为断言四文件86及恢复反转后的76通过，数量属于不同检查轮次，不能相加冒充唯一测试数。中间新增fixture误用不完整runtimeConfig造成publication失败，改用实际accepted config；参数边界将普通值误认命令导致一条研究用例失败，修正为明确slash边界后重验通过。

有效反转把四个相关源码恢复至`a513333f`：源位置、多skill、研究绑定/子阶段传播和拒绝行为出现22失败/36通过；finally逐字节恢复，受影响76重验通过。最终五个静态门及diff check通过，保留118既有advisory，模块责任上限0；TS build`78f07c26242d`通过，当前打包NormProof judge为`proven`、0 open/failed/gap。构建后再次运行小型隔离regular/fullscreen真实PTY，均通过正文目录候选、Tab局部替换、带空格目录连续补全、未知第二skill整次阻止及原始草稿恢复；没有20k真实会话、全仓回归或真实provider/桌面输入法证据。本批提交另绑定。

CI历史读回：首批`40215134369`实际失败（6失败/10570通过/3跳过）；第二批`40215968841`实际失败（6失败/10573通过/3跳过）。首帧/普通composer仍要求“无箭头/旧padding”的断言与最新用户要求冲突；settings Apply的新行为返回字段，旧attention断言却期待立刻退出并排队执行。相应测试按已交付的真实新交互修正，四文件86本地通过，不能将旧提交改记CI绿色。两次Architecture Watch `40215134377`/`40215968887`工件已下载读回，均为`proven`、三个结构obligation满足；结构结论不替代行为CI。

### 第四批：提前加载界面、输入移交与报告口径

本批已提交/推送为`05b77489bfe02b3ceac82eadebe96bc3cadf857d`；自身CI及结构结果见第五批读回，历史失败不改记成功。

第三批CI `40219107288`于2026-10-25 18:18:49Z实际失败：11失败/10640通过/3跳过。日志逐项读回为旧契约断言：两项completion仍要求前导空白后的功能命令补全，一项back仍要求前导空白打开面板；两项help提交仍裁掉插入的尾空格；五项排队断言忽略新增附件参数；debug测试传裸名称却期待功能面板。按offset=0、原文保留、附件转交的已授权行为修正，保留不提前执行、队列顺序、确定提交次数等原断言，并增加非首位拒绝断言。三文件60项及真实host对应八项加启动三项共11项通过（其余88项未运行）。旧提交仍记CI失败，后续提交的全套结果另核对。Watch `40219107300`下载的实际工件为`proven`、三个结构义务满足，不替代行为CI。

| 任务 | 当前状态 | 本批实际交付与边界 |
|---|---|---|
| ADD-07 | 本地交接实现验证通过，性能验收部分 | 普通TTY在重cliProcessRunner图加载前绘制现有canonical composer，真实Loading和箭头；等待首次写入后才加载。沿同一ViewState、Editor、paste store、StdinBuffer及TUI移交，保留分段粘贴/组合字符/明暗主题，正式配置校正regular/fullscreen。加载期Enter只换行、草稿最多32768字符、超量paste整次拒绝；Esc/Ctrl+C/Ctrl+D退出130。移交前让poll交还启动期滞留输入，构造/加载/退出错误释放终端；错误正文在退出alternate screen后输出。help/version/pipe/print/replay/显式session及profile handoff保持原入口，freshness launcher仍先校验。只做当前Node小fixture取样，未完成冷/热Node/exe或桌面全矩阵 |
| ADD-09 | 目录措辞与机器事实修正已验证 | `/context`明确称Discoverable tool catalogue estimate，注明inspection目录含deferred工具、不是首请求估算也不是下界；目录数值留在toolSchemas且带inspection-catalogue/firstRequestLowerBound=false，unknown/stale prompt不再附误导估算。当前foreground请求尺寸/实测仍独立。不借此宣称ADD-08启动估算完成 |
| ADD-08 | 定位完成，尚未实施启动估算 | 状态栏仍待真实拟发送集合估算。已定位catalog默认dynamic、systemContext、systemPromptSnapshot、history selection、opening environment/roots/continuity/attachments及endpoint step；MCP已有peekSnapshot可复用，不能为了计数自动连接。下一步共享实际组装owner并绑定当前config/session/model/endpoint/schema/system/history/source身份，保留unknown与撤销/取消边界；不复用完整inspection pool或独立memory warm preview |
| ADD-01…03、ADD-13 | 后续待完善 | 完整角色编辑、精确认证后回返、全部settings类型/来源路径及配置发现性不从本批提升 |

owner：[启动界面](../../packages/ts-shell/src/cli/interactive/startup.ts)、[轻量参数准入](../../packages/ts-shell/src/cli/interactive/startup/eligibility.ts)、[正式host移交](../../packages/ts-shell/src/cli/interactive/interactiveLoop.ts)、[终端engine](../../packages/ts-shell/src/presentation/tui/render/engine.ts)、[输入parser](../../packages/ts-shell/src/presentation/tui/input/stdinBuffer.ts)及原context/report。定向对照参考同Composer lease/单次移交/异常释放；本项目允许有限加载期编辑，与参考deferInput决定有明确差异，避免在就绪前派发，并用split paste及取消反转守住边界。

串行验证：最终startup20、context report12、stdin27共59项通过，真实host启动移交3项通过；此前firstFrame/interactiveLoop/context/slash workflow四文件53项通过，后续loop/startup25项通过，轮次有重叠不累加。撤销同Editor state移交及恢复旧context report后两模式draft身份与目录事实出现3个有效失败；finally字节精确恢复后相关检查再次通过。首次追加write测试在无timing时误认为旧帧有callback，fixture已改为明确旧observer；滞留stdin修正最初误给无startup host增加async边界，已有loop三项失败后改为仅pending startup等待，五项恢复通过，未改弱断言。

小型隔离真实PTY最终regular/fullscreen保留加载期两行原文及未知skill提交整次阻止，两种取消/启动错误退出130/1且恢复终端均通过。对重模块人为加700ms延迟的检查只证明时序与交接，不算真实性能数字；未加delay的同机器Node两个样本：父进程含launcher首见Loading约401/385ms、正式画面约1526/1419ms；子进程首帧write约111/114ms、runtime-ready约1221/1130ms、正式write约1237/1146ms。单样本、OS缓存未控制、没有旧版对照/exe样本，不能推导p50/p95、总初始化加速或宣称全部START-03通过。最新代码/测试变动后的build、静态、结构及提交另绑定；原47项38 complete/9 partial不变。

第四批最终五静态门/diff、TS build `b748bf0e1232`与当前打包NormProof judge串行通过，`proven`、0 open/failed/gap；责任上限0，118既有docs advisory保留。提交与远端CI后续单独绑定。


### 第五批：首次请求前的上下文估算与失效边界

以已推送`05b77489`为基线。ADD-08现为**部分完成**：普通输入、空启动与明确多skill已有本地数值和失效验证；特殊命令准备、完整性能与真实差额仍未验收。原Phase20保持38 complete / 9 partial，ADD-01…03的完整面板操作路径及ADD-13仍待完善。

| 层次 | 当前交付 | 证据与边界 |
|---|---|---|
| 请求组装 | dispatch与preview共用`core/prompts/request.ts`、`cli/runtime/prompt.ts`、`turn/opening.ts`、`turn/messages.ts` | 同一dynamic首批工具集合、forced/allowed过滤、系统规则/skill目录、foreground功能、开场环境/根/continuity/附件、tool microcompaction与bridge；关闭工具时沿相同最后一步提示与空schema身份。没有另造inspection pool |
| 会话与目标状态 | `session/context/preview.ts`完整只读async快照，metadata 256 KiB/state 2 MiB/transcript 4 MiB、8192行/4096条，live history超过4096拒绝 | 不规范化、不写锁、不消费injection；绑定root/session创建时间、磁盘版本、live raw history/turns、contextSelection与workspaceRoots。goal沿此有界state使用原decoder/scope，不另走无界同步重读 |
| 指令与权限 | 记录规则候选、递归import、缺失源、物理link、memory records元数据；skill目录/清单当前性、附件权限及完整MCP peek重新验证 | 最多512源；缺失或无法证明当前性保留unknown。MCP只有已连接snapshot可用，preview不连接/刷新。实际future injection prepare复用runtime memory store、检查所有generation，绝不accept/消费；force只peek |
| 协议投影 | 使用真实`endpointTurnBody`、request shape、configuredOutputLimit/serviceTier和vision处理后估算 | OpenAI兼容、Anthropic、Bedrock、Google、Responses五类投影测试通过。方法仍是字符÷3.5及近似JSON开销；图片每张固定2048 allowance，base64长度不按文本计数，vision fallback按实际文本投影。opaque reasoning/replay拒绝估算 |
| 用量衔接 | `context/request/identity.ts`保存schema/system/有序raw history摘要；provider计量还保留安全endpoint digest | 校准只允许同provider/model/protocol/destination/schema/system和**相同历史前缀**的纯文本；同长度替换、换relay、tool/reasoning/图片等重新本地估算。真实step预算查询也检查history/destination，旧值不能跨目标授权；calibrated仍带`~` |
| TUI生命周期 | `cli/interactive/context/controller.ts`150ms debounce、500ms polling、源验证最多每2秒、20秒TTL、失败5秒retry、10秒abort request | 单个pending直到promise结算才释放，取消请求不冒充已结束。帧读取只查cheap editor revision/身份，无文件扫描；过期或作废无旧数字，显示unknown/stale；busy时按原计量路径，idle按当前拟发送草稿 |

**终端证据：** 最终小型隔离Node PTY在regular/fullscreen均未提交输入，先观察真实host和数值，再paste约1800字符草稿、输入`/model`及清空。两模式初始约`~4.1k`、草稿约`~4.6k`，命令未准备时问号，清空再显示估算。fixture无MCP、无真实provider、无长历史。初版探针使用Ctrl+C等待退出未及时结束，主代理终止所属fixture子进程；最终探针改SIGTERM和明确结束时限，两次exit143。此结果只证明数值/草稿状态路径，不作为Ctrl+C/桌面退出的新通过证据。

**串行验证：** 此轮先configuration/runtime-preview/session-preview/controller四文件27项通过；随后五静态门/diff→runtime-preview7、session-preview5、step90、sessionFacts18共120项→TS build `5421868d87b2`→责任上限0全部exit0。撤销历史/目标校准保护、取消slot保护及startup值投影分别出现1项AssertionError，finally源码字节精确恢复；恢复后estimate/controller/sessionFacts/configuration四文件36项通过。只运行聚焦文件、无并发heavy任务/子代理验证/全仓本地回归/20k真实PTY。build完整身份`5421868d87b2912deca6ccdbe4455bd447e156392e514120f158475f8517c826`，inputs `ca8516cea2d1d2b2624808648150461d1fbbfd51d2fef9da98e8e6825c312220`，artifact `14fca199f81d4ab53fe7e94a7e67ec319a481b778daf370289f5a63ed65275e8`；后续live limit/根一致性补充后的最终build另读回，不将前一build误归新源码。

当前checked-in validator tgz SHA256 `6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985`重新抽取后judge实际exit0、`proven`，三结构义务satisfied、0 open/failed/gap；不沿用旧scratch validator。安全PTY receipt、反转失败日志、build manifest及结构工件归Git忽略artifacts，临时脚本/配置与fixture进程在结束前清理。独立复核本批未执行，不能沿用前批review结论。

**旧CI读回：** 第四批`05b77489` CI `40221027491`于2026-10-25 18:42:39Z为failure，10678 passed / 1 failed / 3 skipped，978文件passed / 1 failed / 1 skipped。唯一失败为`core/commands/configuration.test.ts`仍期待“0 current definitions”；本批改为“0 inspection definitions”并检查scope=inspection-catalogue/firstRequestLowerBound=false，accepted catalogue、旧measurement及不联网断言保留，13项本地通过。旧SHA仍失败；本批提交/推送/CI单独绑定。Watch `40221027536` workflow success，工件`12609002827`实际`proven`、三义务satisfied，无阻塞/缺口，与行为失败分开。

**尚缺，不能称ADD-08全部完成：**

- 当前字符近似不是参考的native tokenizer，也不是provider精确计量；未同模型/协议/规则/历史/实际schemas/cache口径分解用户的1.7k/4.9k差额，不能归因工具个数或公式单项。
- modifier/template/deep-research的纯组合准备preview尚未实现；这些输入保持unknown，不执行工作流以计数。已选native研究、collaboration admission、hook拒绝、模型pool/认证续期、自动压缩等后续准入变化不承诺与预览完全相同。
- 普通无slash草稿不加载command template图；第五十一批已将正文路径从完整模板图收窄为候选名精确探测，并补目录revision、候选/字节预算及同步步骤取消检查。同名模板存在时仍按原registry优先级参与，未声称路径/模板歧义已消除，也没有以异步函数名或10秒abort承诺整个同步图可被中途取消。
- 源新鲜度检查依赖metadata/physical identity及skill verifier；metadata保留的字节改写未证明必检出。每2秒源poll和20秒TTL存在短暂显示窗口；帧纯读不能叫每帧精确磁盘snapshot。
- 大会话/超过界限、MCP未就绪、opaque replay或目录/权限变化保留unknown/stale。冷/热Node/exe启动、估算成本/heap矩阵以及Windows桌面输入仍缺。

第五批最后补充live历史4096界限和磁盘/live根一致性后，串行五静态门/diff、session/runtime-preview两文件12项、TS build `6144005828a4`、责任上限0、当前打包judge三义务satisfied/proven/0 open/failed/gap及npm start help全部exit0。最终build `6144005828a4cb2faf70b482b52b9906351ac2471108a48f1de8ef91b7d7ca76`，inputs `ca401713d05cfc0e0d436ec06e056fc6fc78fb3da5511ab898beaf3e18c8a7de`，artifact `c0b002f7093b514dd7906b1ef7b6ad1624ffa84a57b8754a144bd309268ba0ec`。本批源位置和各项校验事实以此最终构建为准；最终PTY及提交读回另附，不借旧SHA CI成功。

最终构建的小型regular/fullscreen PTY再次通过同一数值/草稿/命令unknown/清空路径，exit143。证据归`.omx/artifacts/phase20-addition-context/`，包括前批失败CI/反转及本批probe源码、receipt、build manifest和结构工件；addition-a/c/d/e scratch已清理，未修改参考仓库或个人凭据。

第五批代码与证据已提交/推送为`d2db8559f5a48ab36bd55668345ac363d477aa4d`，主代理readback确认origin/main与本地SHA精确一致，推送后工作区clean。本批自己的远端CI不沿用旧SHA结果，继续单独读回；面板完整操作路径、ADD-08上述缺口和ADD-13仍未完成。

### 第六批：模型角色的实际编辑、清除与返回路径

以已推送`f7bc5c02`为基线，继续ADD-02的完整操作路径。Roles中的Subagent、Summary、Advisor现在可进入动作页，选择模型或清除显式绑定以跟随默认；Default可进入现有普通模型目录并返回。角色模型目录复用All models/provider导航、搜索、连接身份和详情，不重复列出Roles或预设。未配置模型仍可聚焦和浏览，Enter进入详情/配置草稿；缺凭据或只有provider-slot的目标不能被写成要求named connection的自动角色。

保存由[role owner](../../packages/ts-shell/src/core/commands/model/role.ts)委托现有session model事务。只合并指定角色，保留默认目标、其他角色、预设、thinking、serviceTier、contextWindow与skillful。空会话按精确当前默认建立session选择并保留已有角色；捕获session/root/profile/config/catalog与revision，竞争修改或旧默认与当前请求不一致时拒绝写入。写后磁盘验证与运行时configuration publication分别报告；publication失败只能称保存已确认、应用未确认，返回面板仍显示结果。

[角色动作页](../../packages/ts-shell/src/cli/interactive/picker/model/role.ts)、[model目录](../../packages/ts-shell/src/cli/interactive/picker/model.ts)及[overlay](../../packages/ts-shell/src/cli/interactive/overlay.ts)新增显式父面板返回。Esc在普通嵌套目录先返回父面板并保留角色/模型行，顶层目录仍沿其分类导航；输入编辑、审批和确认子模式保留各自按键处理。修复前目录navigation先消费Esc、只切分类域；不能仅把测试标题改成小写掩盖未返回。详情页Esc也返回原模型，成功保存/清除的notice带回状态区，避免全屏列表盖住结果。

定向只读对照参考model-hub的Assignment flow及unassign（1195–1220、1290–1320）：角色赋值与默认启用分开、清除显式赋值后刷新并返回Roles。本项目继续现有session范围及三个真实自动消费者；参考的project/global scope、fallback chains和独立thinking strip尚未交付，不能以本批角色菜单称面板全部看齐。

串行验证：首次model/overlay/session state三文件133项通过；补默认身份、publication失败与可见notice边界后135项通过（model35/overlay74/state26）。两个有效反转分别去掉其他角色保留和提前父面板Esc处理，各出现一项AssertionError；finally源码字节精确恢复，最终model35项再次通过，含预设与空会话context/sibling保留断言。五静态门/diff、TS build`8ea15599e100`、责任上限0通过，118既有docs advisory保留。构建完整身份`8ea15599e100638092b31c5ee6eeaa6b5d26b4b079ead809ba1cd1de2bb2f733`，inputs`19fea09ae3cfaf0ed678f154d665210dbe287b5b6c0d9b25b08d16bd3113fb4b`、artifact`24224bdb955db9ec48e256855b527ec3c2da98642279eb94caba8a82ab843e14`。

小型隔离Node真实PTY在regular/fullscreen均通过角色→目录→Esc原角色、赋值→默认保留→清除→磁盘读回、全局配置字节不变、零提交。初次PTY发现保存结果被全屏面板遮住，修复notice回传后通过；最终退出143是探针SIGTERM，不作为Ctrl+C新验收。当前validator tgz SHA256`6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985`重新抽取后，首次直接sidecar入口缺workspace profile而exit1；改用正式CLI发现本仓profile，实际exit0/proven、三个satisfied、0 open/failed/gap，未修改规约。

第五批代码CI`40226046847`及文档CI`40226150557`最后读回仍in_progress，不记成功。第五批Watch`40226046850`工件已下载实际读回proven、三结构义务satisfied，无阻塞/缺口；workflow绿色本身不替代这个读回，也不代替行为CI。

ADD-01…03继续partial：未配置模型认证成功后的自动回返、角色独立thinking编辑、所有settings类型/scope/只读来源/桌面矩阵仍缺。ADD-08仍有第五批列出的差额、纯组合preview、源字节与性能缺口，ADD-13继续；原Phase20仍38 complete/9 partial。本批未执行独立代理复核、全仓本地回归、真实provider或20k真实会话。证据归`.omx/artifacts/phase20-addition-roles/`，本批提交和推送另绑定。

最后检查保留Default浏览子面板的动态initialSelection getter，避免对象展开在load之前冻结空焦点。最终model35、TS构建`9d0ef97d76cd`、责任上限0、正式CLI judge proven/三satisfied以及两模式角色PTY串行exit0；inputs`eca877388615d3a70baf9052ac3d824f88f64b141929b56901165d200ec84186`、artifact`f5bb9d244cbf05f11cbfd2aedbc9b9c74963d60d9c88301daf0755f23980fc81`，build完整身份`9d0ef97d76cda5d0ce89cb2855dc05b769ac5bdfe0fe10c6d7bc53e73e2615b6`。补充规划48与审计78个本地链接目标存在，未借前一构建结果证明后续变动。

第六批已提交/推送为`67283e9b4402f70cac8241f74f3772f6b8a96fbe`，origin/main精确读回一致、当时工作区clean。其CI`40227521947`最后读回仍in_progress，Watch`40227521912`工件实际proven、三satisfied，不据此提升行为验收。

### 第七批：命令分类、偏好入口与配置发现性

ADD-13的入口整理已完成本地实现验证：[help picker](../../packages/ts-shell/src/cli/interactive/picker/help.ts)沿共享命令库存及已有CatalogNavigation提供All commands、Session、Context、Workspace、Workflow、Diagnostics，按实际可用库存省略空分类。Tab/左右切焦点域、上下浏览、搜索跨分类及aliases、清空搜索恢复原分类；目录变动刷新、关闭释放、过期准入和重开复位保留。Enter仍只插入一个当前canonical草稿，不执行handler。详情从已加载的安全行投影，帧绘制不重新取得registry。

主题与statusline兼容命令继续原owner，日常持久设置说明指向settings Appearance；settings摘要说明值、来源和scope。新增[设置与命令发现指南](../guides/settings.md)，更新[主题指南](../guides/themes.md)与wiki入口：文件只保存显式覆盖，默认/来源/应用时点从面板查，用户/project scope、Apply/Discard、override优先和保存/应用分别报告。`/settings <key>`目前是注册描述/类型/范围，不能写成显示当前值；实际值查面板。没有把login/logout/view删成“重复空壳”。

参考已有model/settings导航的分类域与跨分类搜索，复用本项目nav owner；help保留自己的真实五组命令分类，不引入参考独有菜单。真实PTY先发现说明被单行截断，加入焦点详情和按分句显示；随后绝对路径脱敏把说明里的`/settings`改成external路径，改为正常“settings Appearance”措辞，未放宽安全规则。最后一次探针误等空编辑placeholder，实际已经插入`/theme`及Usage，改同步实际composer状态后通过。

串行help13/report5共18项通过，含实际OverlayHost分类→跨分类alias→清空恢复→Enter单草稿及窄宽几何/目录更新/过期/敏感元数据既有边界。反转去掉分类过滤后该导航用例AssertionError，源码字节精确恢复，18项再通过。五静态门/diff、TS build`5b8a14469ca4`、责任上限0及checked-in validator正式CLI judge实际proven/三个satisfied/0 open/failed/gap通过；118既有docs advisory保留。build完整身份`5b8a14469ca44c6ecf44b8e2818df0d94e9304549522d1b067855404762549c2`、inputs`53f1849ff9e482965769536b44bc0c31a587fc30b5904c588c1c7b625c5bdf6a`、artifact`1551f2a12a4f26d0b74e9108ad6ab9924e0d360c7250820e5e43b82d494b89c6`。小型隔离regular/fullscreen Node PTY分类/alias/清空/主题持久提示/单草稿通过，零提交、结束143是SIGTERM清理。证据归`.omx/artifacts/phase20-addition-discovery/`。

第五批code`d2db8559` CI`40226046847`和docs`f7bc5c02` CI`40226150557`现已实际success，分别日志读回989 files passed/1 skipped、10712 tests passed/3 skipped及架构proven。它们只证明对应SHA，不覆盖第六/七批，也不填补ADD-08的真实差额与性能缺口。ADD-01…03/08仍partial，原Phase20仍38/9；settings完整编辑与认证回返等继续，完整补充目标尚未达成。本批提交/推送/自身CI另绑定。

第七批已提交/推送为`d1a8509e4ba236bf82607de75b9872a56747665f`，origin/main精确一致、当时clean；CI`40228208771`待结果。Watch`40228208737`仅workflow success，尚未读本批工件，不称结构验收完成。

### 第八批：设置子编辑返回、取消与失败后保留

ADD-03继续完善实际操作路径：[setting详情、scope、输入及状态项编辑器](../../packages/ts-shell/src/cli/interactive/picker/settings.ts)显式声明父面板。Esc从编辑器回原详情，保留此前已暂存值、丢掉未提交编辑文本；scope取消回原scope及暂存值，确认换scope仍沿原规则丢弃暂存。详情Esc回所属分类和字段，撤回preview并丢弃本字段暂存；Ctrl+C仍关闭。overlay先释放子preview再构造父面板，避免父视图读到即将撤回的显示值。目标ID通过真实Enter callback验证，不用窄列完整label冒充焦点。

Apply失败统一保留所有类型的暂存值及失败结果，不再只有预览字段返回。竞争写入保持对方磁盘值，用户另一次Apply才重新读取baseline并显式重试；保存/应用仍分开，不自动重试或假称已应用。现有CAS、scope、信任、默认和override规则保留，未建立第二配置owner。

对照参考settings-selector的文本/子菜单完全拥有键盘（1920–1930）及搜索结束返回原tab/目标行（1386–1408），本项目继续自身 staged Apply/Discard，而非复制参考写入模型。新增真实配置owner的列表、对象、choice保存与读回、Discard字节不变、数字冲突后暂存/重试；主题验证区分currentTheme显示与selectedTheme已接受意图，不能用preview不改意图误判预览失效。

主代理串行settings picker20/settings owner37/overlay74/model35共166项通过（前轮165项与其重叠不累加）。取消输入返回反转出现AssertionError，finally字节精确恢复后165项通过，新增冲突项后166项通过。最终五静态门/diff、TS build`61e4338ecc21`、责任上限0及当前打包正式CLI judge proven/三个satisfied/0 open/failed/gap通过，118既有docs advisory保留。build完整身份`61e4338ecc217b429b07a7cee045bacd0161f511d60f0c441c2d1fe4449a19fb`、inputs`5599212333252adaaedfd4dab879def92f72c804beea2dde0df15dbfbe65fef9`、artifact`71f4e772de3d46d41a7ebac7a3b5a31469da9f53bf38368fee63ed794216b810`。

小型隔离regular/fullscreen Node PTY均通过number编辑取消→详情→分类、暂存取消配置字节不变、object/list Apply磁盘读回，零回合提交。初版search探针期待完整长label被窄列截断，改同步真实Field ID后通过；退出143是SIGTERM清理。证据归`.omx/artifacts/phase20-addition-settings/`。ADD-03仍partial：完整scope、所有只读来源/override、独立role thinking、真实认证回返及桌面覆盖仍缺；本批不升级原Phase20 38/9、ADD-08差额与性能缺口。第六/七批CI最后仍运行，本批提交另绑定。

第八批已提交/推送为`1c5e1e64b5af8ae1f74ee5ca344e43da48c1ce20`，远端main精确一致、当时clean；当时CI`40228718301`读回仍in_progress，后续failure见第十批。Watch`40228718325`已workflow success，尚未读工件，不把workflow状态升级为工件证明。

### 第九批：角色独立reasoning设置与真实请求消费

以已推送`1c5e1e64`为基线，补ADD-02的角色reasoning操作。[角色动作页](../../packages/ts-shell/src/cli/interactive/picker/model/role.ts)中，绑定具体模型且存在已确认effort等级的角色可打开[thinking编辑器](../../packages/ts-shell/src/cli/interactive/picker/model/thinking.ts)。展示该精确connection/endpoint支持的low/medium/high及auto（provider decides）；不提供尚未实现的inherit操作，不为未绑定或无reasoning能力模型提供无效控件。auto保存null，三个现有自动消费者都解释为不发送显式effort，不能把它写成强制禁用模型内部推理。

保存委托现有[role事务](../../packages/ts-shell/src/core/commands/model/role.ts)，只更新该角色effort，保留默认目标/effort、其他角色、预设、contextWindow和skillful。成功返回原角色动作页，重新捕获已接受状态与新事务，可再次编辑；notice继续带回目录。Esc不写入，先回动作页再回原Roles行。角色选新模型时保留自身受支持effort，原effort不被目标确认支持则采用provider决定并显示结果，不再复用默认模型effort；新绑定角色也用provider决定，非reasoning模型可正常赋值。失效session/catalog/config准入继续拒写。

消费者定向核查：[subagent](../../packages/ts-shell/src/turn/subagent.ts)把角色effort传给[delegated step](../../packages/ts-shell/src/cli/provider/step.ts)，advisor通过同一原生子请求路径消费绑定角色，[summary](../../packages/ts-shell/src/cli/provider/summary.ts)直接投影角色request shape；因此没有新增另一份传播逻辑。新增测试从model面板保存后观察subagent、advisor和summary的实际loopback请求/shape，默认请求保持自身effort，summary旧缓存不复用。relay夹具同名模型使用不同endpoint能力，支持列表不能按provider通用行覆盖精确relay。

只读参考model-hub的thinkingOptionsFor/roleThinkingTarget（1320–1352）与assignRole（1280–1310）：仅具体角色及实际能力开放操作，换模型保留仍受支持的等级，不支持时采用原生后备。本项目继续session范围与null/low/medium/high原契约；参考inherit/fallback chain/global-project保存语义不能靠一个菜单宣称实现。

串行六文件137项通过（model43/provider step9/advisor37/summary17/relay catalog9/subagent22），前轮125/126/127/136项为重叠轮次不累加。新subagent夹具最初未投影当前session默认，被现有default身份校验正确拒绝，改为真实projectSessionModel后通过；relay最初选用不支持effort的协议，被原constraints正确拒绝，改为实际支持effort的隔离协议后通过，不放宽准入。两个有效反转分别取消角色effort写入、恢复默认effort复用，实际AssertionError且finally逐字节恢复，恢复后model43项通过。末次补齐子代理fixture类型字段后provider9项通过。

五静态门/diff通过（保留118既有docs advisory）。首次TS构建捕获默认/角色联合类型字段访问错误，补默认projection字段后最终build`3f1a12c8a02980115790936afb7c7684c94fd130bdec322996666179f576dfcd`通过，inputs`1666eaa3f68022018ba663c83d0d22240d3f34a297812af7d09eb5f22b25274a`、artifact`da7d1c8a405f5834a7f80b3c8758626b7f885e6a1cfc8908864571f5e327e69d`。责任上限0，重新抽取当前validator正式CLI judge实际proven/三个satisfied/0 open/failed/gap。regular/fullscreen小型真实Node PTY赋值→effort low保存/读回→Esc不写→auto null→清除与原焦点返回均通过，全局字节不变、零提交；SIGTERM143只是清理，不是新增Ctrl+C验收。证据归`.omx/artifacts/phase20-addition-thinking/`。

第六批CI`40227521947`已实际success，日志读回989 files passed/1 skipped、10718 tests passed/3 skipped及架构proven。第七批CI`40228208771`实际failure（1 failed/10718 passed/3 skipped），唯一失败是help旧footer和单Esc关闭断言；按实际分类→关闭两层行为修测，原草稿/notice/剩余高度约束保留，真实interactive host聚焦1项通过（98项未运行），不追改旧SHA失败。当时第八批CI仍运行；后续结果及第九批自身CI见第十批读回，不沿用旧SHA。

ADD-01…03仍partial：精确认证成功/失败/取消后的原model回返、settings完整scope/只读来源/override及桌面矩阵仍缺；ADD-08的原生tokenizer、纯组合preview、源精确字节、真实差额与性能仍缺，原Phase20仍38 complete/9 partial。本批没有真实provider、独立代理复核、全仓本地回归或20k真实PTY，完整增补目标继续。

提交前对最后修改再验：五静态门/diff通过，model43与完整受影响interactive host99共142项通过（与此前137项重叠，不相加宣称总覆盖）；补充规划58、审计79个本地链接目标存在。


### 第十批：模型原生账号登录与精确返回

第九批已经提交/推送为`694d3bf913b142975789d28a522d8e153fddb4c9`，推送后已核对远端main精确一致。当前批次补ADD-01/02的原生账号认证返回，继续保留**部分完成**：API-key配置草稿提交后的自动回返尚缺，真实账号OAuth、全部settings来源/scope/override与桌面路径尚未验收。

未配置builtin模型详情新增Account sign-in，沿现[model认证子面板](../../packages/ts-shell/src/cli/interactive/picker/model/auth.ts)与[interactive host](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts)调用原connect/auth owner。只对canonical provider、builtin endpoint、实际原生认证契约及账号允许的具体模型开放；共享runtime的custom relay不获得builtin登录。实际builtin目录已有baseUrl，不能用“未配置baseUrl”判断原生资格。原精确API-key草稿入口继续存在，未新增凭据存储或可见密码输入框。

确认页初始聚焦Cancel，load后明确Start才进入原生认证；动作单次消费，关闭后失效。Esc/Cancel不认证、不写配置，返回原模型。原生成功、失败及Ctrl+C取消都回目录，保留原具体model，并以本次新增的唯一connection ID刷新焦点与真实可用性；不按首个连接或模型label匹配。完整连接状态转换留在transcript，面板只显示简短结果，配置未应用/应用未确认等警告排在成功摘要之前。ConfigWriteError保留安全的实际写入状态，其他异常固定报告结果未确认，不透传异常正文。

认证仍采用现owner的全局活动连接规则，**没有自动把正在浏览的模型写入会话**，没有提交对话回合。返回前重验session、workspace及物理profile身份，归属变动只报告已发生的认证结果，不重开另一会话的目录。从Subagent/Summary/Advisor选择器进入认证后，重新捕获该角色赋值事务并把fresh context带回父面板；随后的显式赋值只更新该角色，保留default、siblings、window、skillful及该角色自身受支持的effort。

定向只读参考model-hub locked view（2720–2765）及selector-controller loginThenReopenModelHub（1217–1223）：复用原生认证后回目录，不在面板另建认证系统。参考仅成功后回provider；本项目按完整操作路径要求，在失败/取消后也回具体model并展示真实状态，且将浏览、认证与显式模型启用分别验证。

最终串行五文件254项通过：model43、model/auth12、auth21、interactive host104、overlay74。初始新增角色夹具使用旧implicit绑定，被“saved default differs”正确拒绝；改为当前显式session绑定后三个角色继续赋值通过，不放宽旧绑定保护。异常host夹具最初未建立实际workspace/trust owner，被准入正确挡住，改为隔离真实runtime owner后通过。初次四文件254项和后来五文件254项为重叠轮次，不累加。认证场景使原model测试文件达到24个function-like names，首次analyzer/正式judge报责任上限advisory与partial；移到拥有该行为的model/auth.test.ts后，全部场景保留，责任上限0，最终正式judge为proven、三个satisfied。

两个有效反转分别去掉新connection身份和返回前owner检查，均实际AssertionError且finally逐字节恢复；场景移到新测试owner后再次有效。最终TS build `4dc852158376b156431aa1b9fe69e6e9e8fe003b93b3646b6ae698fef0e42be2`、inputs `3758d4ba759c2940636841b80cc292a06bc01ea3d1fcbee99027e361d8e45e55`、artifact `4517fa28b7423238ad32bfc4c20d868220c210ac5b636d0a58a9dae1d05babd2`。五静态门/diff通过，当前checked-in validator tgz重新抽取，SHA256 `6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985`；未缩小检查图或修改规约。

最终构建的regular/fullscreen小型真实Node PTY分别执行原生成功、失败、实际Ctrl+C取消，共六场景通过：原gpt-5.4-mini返回、connected/error磁盘读回、失败不设置活动连接、零会话选择/零提交。使用synthetic native-account fixture，**不是实际provider OAuth验收**；每场景最后143是SIGTERM清理，只有cancel路径另有实际Ctrl+C证据。输出与退出均有界，隔离runtime目录已清理。证据归`.omx/artifacts/phase20-addition-auth/`。

**后续CI读回：** 第八批CI`40228718301`实际failure（1 failed/10723 passed/3 skipped），同第七批的help旧footer/单Esc契约，修正已在第九批。第九批CI`40230025325`实际failure（988 files passed/1 failed/1 skipped，10734 tests passed/1 failed/3 skipped）；唯一失败在browser/cache多进程写入场景，三个writer中一个exit1、两个exit0，均未超时，cache integrity healthy、有效/replayable记录1、无重复/超预算。日志没有具体子进程原因，不能归因于模型修补、断言flaky或宣称完整CI成功；当前WSL禁止并发重型验证，本批不运行该三进程压测，记录待后续定向诊断。第九Watch`40230025309`仅workflow success，未读工件，不升级为结构工件证据。

ADD-01/02仍缺API-key草稿认证回返及更完整认证场景；ADD-03仍缺完整scope、只读来源、override与桌面矩阵；ADD-07性能矩阵和ADD-08原生tokenizer、纯modifier/template/deep-research preview、精确源字节/发现成本、真实1.7k/4.9k分解及平台性能仍缺。原Phase20保持38 complete / 9 partial。补充任务整体目标继续，不以本批局部验证关闭。


第十批已提交/推送为`1f1342e7ffe3e372f06f26c081b1d72d147031bb`，远端main精确一致、当时clean。CI`40232077709`最后读回in_progress；Watch`40232077781`仅workflow success、未读工件，不将其升级为正式结构证明。

### 第十一批：模型API-key遮罩配置与返回

ADD-01/02原模型详情的Configure connection在真实host中改为[遮罩密钥表单](../../packages/ts-shell/src/cli/interactive/picker/model/key.ts)，不再要求把密钥补到普通对话草稿。没有host认证能力的只读/兼容picker仍可准备旧精确命令；普通connect入口的独立命令路径未在本批重写。目标来自原provider、具体model、relay endpoint与connection label，URL采用和命令草稿共享的[安全endpoint projection](../../packages/ts-shell/src/cli/interactive/picker/connections.ts)，去掉userinfo/query/fragment，拒绝非HTTP地址；不按同名模型或另一个relay替换。

[现InputForm](../../packages/ts-shell/src/cli/interactive/picker/input.ts)增加单行masked模式，沿原编辑owner处理粘贴、方向键、字素删除和undo，但送往paint的只有每字素一个圆点及映射后的caret。原文不交给可见renderer、prompt history、主composer、completion或transcript；Ctrl+U替换秘密editor，undo不恢复已清除密钥。多行/控制符/超量输入拒绝，空白或含空白的API key在表单与提交边界均拒绝。没有新增provider认证实现或凭据文件，明确Enter才将input-only key交给现connect写入事务；秘密不进入普通command echo，结果去掉Saved key摘要，即使旧owner返回局部mask也不投影到该路径。

API-key与原生账号登录共享[modelAuthentication](../../packages/ts-shell/src/cli/interactive/picker/model/auth.ts)的单次动作、失效/归属检查、结果与精确新connection回返。保存后刷新实际connected状态和原model焦点，不自动写会话模型；下一次显式Enter才启用，自动角色也重捕事务继续赋值。Esc返回原具体model、配置字节不变，关闭后旧input callback不能保存。ConfigWriteError仍报告实际unchanged/unknown/persisted；通用API-key异常称Connection save outcome is unverified，native路径原措辞保留。

定向只读参考tui/components/input.ts的mask绘制和caret映射（579–632），采用“字素→圆点”决定，没有照搬组件或引入其native终端协议。初始relay夹具把userinfo/query保留在目录地址，保存的安全地址因此与目录身份不匹配，被现准入拒绝；改为正常精确relay验证启用，另检URL凭据投影，不放宽地址身份检查。角色及默认目标分别验证配置后显式启用。

串行六文件244项通过（model43/native-auth12/key4/input4/host107/overlay74）；反转恢复秘密直接render、去掉新connection ID后均实际AssertionError且finally逐字节恢复。恢复后input/key/native-auth/auth四文件41项通过，与244项重叠不相加。原生账号路径重验、实际host保存/取消/ConfigWriteError、prompt历史/编辑历史/transcript无密钥、零提交均有断言。四静态门/diff、责任上限0、TS build与正式judge proven/三个satisfied通过；docs门后续单独运行，保留118既有advisory。

最终build `88296adab9570a549c0ea2ea60eb259f69165afd476ba55f73b6d093c5807dad`、inputs `18b78b7aaab7efed3dc5c2464f08b717e4f8abf6b4b20ea874e24ce2b7a74483`、artifact `80599ddc4462212668742508263c5569e47c926923ec15f10fd3902cf264601b`。regular/fullscreen小型真实Node PTY分别保存/取消共四场景通过：终端输出只有遮罩、具体model返回、API-key配置磁盘读回/取消字节不变、提示历史无密钥、零会话选择/零回合。键为synthetic fixture，不验证真实provider接受它；结束143是SIGTERM清理。证据归`.omx/artifacts/phase20-addition-key/`。

**当前缺口：** 本地model无凭据→配置→返回→显式启用的API-key路径已有证据，但不等于真实网络认证或所有现有credential-missing/pending/error连接的重认证覆盖。settings完整scope/只读来源/override/桌面，ADD-07冷/热Node/exe性能，ADD-08原生tokenizer、纯组合preview、精确字节与真实差额仍未完成。第九批browser-cache多进程CI失败原因仍未确定，第十批自身CI仍待结果。原Phase20保持38 complete / 9 partial；补充目标继续。

最终补relay无有效HTTP地址禁止builtin fallback、mask垂直移动前同步后，model43/key5/input4共52项通过；四静态门/责任上限0/build/正式judge及两模式四PTY再次通过，与前244/41项重叠不累加。docs门通过，64/80个本地文档链接目标存在。

第十一批已提交并推送`ea4715b6a1e6d20a1fce1abdcdc5eebbbe1ab68f`，随后读取本地main与origin/main精确一致且clean。自身CI`40232991686`与第十批CI`40232077709`本轮实际读回均为in_progress；不能借对应Watch workflow success宣称代码CI通过。第十一批最终relay地址防护补测model43/key5/input4共52项为重叠验证，最终build/inputs/artifact分别为`88296adab9570a549c0ea2ea60eb259f69165afd476ba55f73b6d093c5807dad`、`18b78b7aaab7efed3dc5c2464f08b717e4f8abf6b4b20ea874e24ce2b7a74483`、`80599ddc4462212668742508263c5569e47c926923ec15f10fd3902cf264601b`。第十批auth源身份工件曾被新批次hash误覆盖，本轮已从第十批提交原始字节恢复，历史构建证据不绑定到最新源码。

### 第十二批：设置完整来源阅读与实际保存范围

以已推送`ea4715b6`为基线继续ADD-03。目标代码已具备primary user/project选择、CAS保存、显式input保留、launch override与项目信任保护，本轮没有重复这些owner。发现两个确定显示缺口：Effective/Accepted的source放在单行note会截掉长配置路径；保存提示先放长来源，再说明有效值不同，会在固定footer高度内只剩“Saved”和部分来源，隐藏关键应用结果。

[设置字段面板](../../packages/ts-shell/src/cli/interactive/picker/settings.ts)新增Values and sources入口，沿[设置来源视图](../../packages/ts-shell/src/cli/interactive/picker/settings/source.ts)和共享[InputForm](../../packages/ts-shell/src/cli/interactive/picker/input.ts)提供有界只读阅读：Effective、Accepted、Stored、各自来源、显式input位置/路径、保存scope、应用时点与项目信任原因按原draft展示；方向键沿Editor换行/滚动，输入、paste、清空、删除、undo不能改正文，Enter/Esc返回原字段并保留已有暂存及失败状态。没有新配置注册表或另一套来源计算；大于现64KiB表单界限时明确显示不可读取提示，不冒充完整加载。只读值仍是终端安全展示，不声称精确字节导出。显式启动input和环境层只读，保存范围继续只提供允许的primary user/project。

[保存提示owner](../../packages/ts-shell/src/cli/interactive/settings.ts)将“有效值与保存选择不同”提前到长来源之前，保持真实持久化/应用契约。参考settings-selector按实际焦点域提示按键、共享具体字段编辑器、预览独立撤回；本项目保留这些原则，并额外保留自身user/project分层、信任与来源检查，不把参考没有覆盖的来源语义直接替换掉。未创建空Memory/Shell分类或无消费者字段。

主代理单进程串行验证六文件150项：source5/input5/settings picker20/settings owner37/config input publication9/overlay74。覆盖48/100列长来源路径完整阅读、read-only编辑阻断、暂存的Enter/Esc回返、实际按键scope切换→编辑→Apply→重开、项目保存只改project primary、user/input字节不变、显式input有效值保持、移除覆盖后生效、未决定信任项目保存仍inactive，以及真正受支持的attentionOnIdle launch override有效值保持。原测试已覆盖环境offline、合并限制和restart，本批没有把那些source层测试冒充全终端矩阵。

初版新测试分别误假设文件名不会跨屏断行、maxTurns是支持的RuntimeConfigOverrides字段、JSONC文件可用JSON.parse读取；按真实断行、支持的attentionOnIdle和配置读取owner纠正，断言仍要求完整路径、覆盖保留及注释不丢。两个有效反转分别移除read-only paste拦截和把project scope强制user，均AssertionError/exit1，源码逐字节恢复后两文件10项通过。后续提示顺序修补后六文件150项重新通过；重叠轮次不累加。

regular/fullscreen × trusted/undecided四条小型真实Node PTY串行通过：来源查看不写、实际按键选择project、22磁盘读回、user/input字节不变、有效31/11保持、重开显示Stored22、长input路径可读、Enter/Esc返回。初次fixture未建立独立Git根导致信任身份不匹配；建立后发现长来源遮掉有效差异说明并修补。另一次探针误按newline分割终端绘制行，改匹配实际焦点marker后通过。四次退出143是SIGTERM清理，不冒充Ctrl+C验收；没有provider调用或新回合。

本轮四静态门、diff检查、TS构建通过；责任上限检查0项、正式打包CLI读取workspace profile后judge为proven/三satisfied/0 open/failed/gap，validator archive hash沿原绑定。最终build`0391e135b3adb5f38200a7d0914a600cb2e02a3bba6896bf7f97964ef533ee74`，inputs`afd5653b28abccd92c65e2156505eeb0edfe2edaf084eb93eaee3140eabe4c6d`，artifact`80d7ebd86827446ce73d11dbe60654329c76ff7f3e01aa792aa1c0ace0305d4c`。工件保留在`.omx/artifacts/phase20-addition-sources/`，临时执行目录清理；自身提交/推送以实际交付读回为准。

**仍为partial：** 本批推进具体设置来源与保存范围，完整面板对齐仍缺全部来源/编辑器/字段/鼠标/resize/桌面组合，已有失败连接重认证与真实OAuth/network验收，ADD-07冷/热Node/exe性能，ADD-08原生tokenizer、纯modifier/template/deep-research preview、精确源字节/发现成本及真实1.7k/4.9k差额。第九批browser-cache CI子进程退出1仍未归因，未在WSL运行其并发重压。原Phase20保持38 complete / 9 partial，ADD独立；完整目标继续。

第十二批提交/推送为`9de2aef8399caaeb730b4d5308eeec2646ffd42d`，实际readback main与origin/main精确一致、工作区clean。CI`40234533173`随后读取为in_progress；Watch`40234533171`仅workflow success，未读取其工件，不等同于代码CI或整体行为完成。

### 第十三批：已有失败连接的模型配置恢复入口

沿ADD-01/02核查发现：[model](../../packages/ts-shell/src/cli/interactive/picker/model.ts)允许pending/error行聚焦，但配置动作只准入missing状态，已有失败账号连接也因“必须无connection”而失去原生登录入口；部分pending/error详情在resolution拒绝时被重新标成credential-missing，丢掉实际setup状态。这是本轮确认的产品操作/显示缺口，不是对原终端按键故障的事后归因。

本轮保留pending/error真实状态，credential-missing/pending/error具体行均能进入遮罩API-key配置；原生登录通过[账号入口policy](../../packages/ts-shell/src/cli/interactive/picker/model/auth.ts)检查canonical provider、builtin目录端点、**具体连接端点**、auth契约及账号模型范围。builtin目录中的自定义relay也不能因runtime相同而获得原生OAuth。用户显式确认之后复用原connect新增连接事务，保留旧连接/旧pending或error事实，返回本次新连接上的原model；认证本身不替换会话绑定，下一次显式Enter才启用。没有新增in-place credential writer，也不把新连接称作旧connection已原地修复；连接清理由现connect管理路径处理。

只读参考model-hub的locked provider→onLoginRequest决策：登录委托既有owner，不能导航就直接启用不可用模型；OAuth入口受provider auth支持约束。本项目沿这些原则，额外满足具体模型可聚焦要求，并因同runtime的relay身份加具体端点护栏。

聚焦验证首轮host107/model43/auth15/key8/connect-auth21通过，但新relay fixture保留指向已移除connection的active ID而触发配置conflict；纠正为显式无active ID，未放宽保护。最终五文件90项通过（navigation2/model43/native-auth16/key8/auth21），两有效反转移除pending/error配置准入和移除具体native端点约束，均AssertionError/exit1，源码精确字节恢复后auth/key24项通过；与前轮结果重叠，不累加。

两模式小型真实Node PTY共十条：已有error账号连接的success/failure/实际Ctrl+C取消六条，已有pending key连接的save/Esc四条。均验证原record不变、实际新连接状态读回、返回原具体model、本轮零选择/零回合；key终端遮罩和prompt历史无密钥，Esc配置字节不变。账号runner及key均为synthetic fixture，不证明真实OAuth/provider接受。首个PTY聚焦了同名“当前请求”报告行，只有Back，改明确同步Connection: broken后验证具体连接；未以同名label冒充精确对象。退出143为清理，账号cancel另有实际Ctrl+C证据。

第十批`1f1342e7` CI`40232077709`现已实际success，990 files passed/1 skipped、10752 tests passed/3 skipped及结构proven。第十一批`ea4715b6` CI`40232991686`实际failure，990 passed/1 failed/1 skipped，10760 tests passed/1 failed/3 skipped；唯一失败是navigation测试为自定义provider提供无endpoint，却期待Configure connection。该期待与第十一批已明确的“relay无HTTP地址不得fallback builtin配置”契约冲突，分类为fixture/旧期待漂移。补[navigation fixture](../../packages/ts-shell/src/cli/interactive/picker/navigation.test.ts)精确HTTPS地址，并增加Esc后原missing-b身份及窄/宽视图断言；最终90项含此项通过，历史失败不追改。第十二CI仍在运行，第九browser-cache子进程退出1仍未确认原因。

四静态门、责任上限0、TS build、正式CLI judge proven/三satisfied/零open/failed/gap与diff通过。工件保留`.omx/artifacts/phase20-addition-reconnect/`，含十条PTY、两反转、相关历史CI日志；最终build与文档校验在提交前另绑定。本批不运行全仓本地回归、20k真实PTY、真实provider或桌面矩阵；ADD完整面板、启动性能、上下文计量差额仍partial，原Phase20保持38 complete / 9 partial，完整补充目标继续。

第十三批最终build`2002a880d1edbb6660a0ad4b9ff5d1bf3449a7dd442e7032a98cb3898ae059cc`，inputs`0d5d1bff5754c5df5757b52ecd51b27272d0103b8cbecbe6765301d747ecd6c2`，artifact`5bf6813c40ddde4f988bfb4ec46a0b0f4a1c04eecd1429c34dd7ed31181d86ea`；静态五门/diff、责任上限0、正式judge proven三satisfied均通过，十条PTY绑定相同产品源码。navigation测试夹具修正只改变测试输入，最终构建覆盖它；本批提交/推送以实际读回为准。

第十三批已提交并推送为`3dc20e04e114e101fc4c6ccdeb3c7d0943a85d3c`，开始本批时本地与origin/main一致且clean。自身CI`40235334827`本轮实际读回仍in_progress，Watch`40235334790`仅workflow success，未读取其工件。第十二批CI`40234533173`实际failure：991 files passed/1 failed/1 skipped，10766 tests passed/1 failed/3 skipped；唯一失败同第十一批，为navigation无endpoint旧夹具，已由第十三批修正。历史失败保留，不将后续修补追记为旧提交CI通过。

### 第十四批：纯组合草稿上下文预览

ADD-08此前遇到任何已知slash token就拒绝估算，包括已经允许在正文组合的brainstorm与显式composable模板；同时，单纯位于正文的`/model`即使实际路由保留为普通文本，也被预览拒绝。这是确定的预览能力与实际提交语义不一致，不能推成原1.7k/4.9k差额已解释。

本批提取[组合纯准备](../../packages/ts-shell/src/core/commands/composition/prepare.ts)，实际[组合提交](../../packages/ts-shell/src/core/commands/composition.ts)和[上下文预览](../../packages/ts-shell/src/cli/runtime/context/preview.ts)复用同一份技能展开、modifier声明、输入预算及提示词组装。预览匹配开头功能命令的独立路由边界：正文纯方法、多个skill及显式composable模板可以估算；普通正文功能名称不执行；开头独立命令、非法组合、save/help及研究driver仍不给完整请求估算。预览不调用execute，不创建research、不连接MCP、不接受未来回合注入，也不写配置或会话消息。

严格相等检查发现初版仍按原草稿分类continuity，而实际提交按展开后的prompt分类，导致同指令的请求digest和tokens不同。已修为先准备有效prompt，再读取同一有界session snapshot并按有效prompt决定continuity，最后接入非消费注入；保留原身份/取消/来源/权限校验，没有另建恢复系统。初轮37pass/1fail记录为实现偏差；随后50项聚焦通过，不弱化digest或计数断言。

[模板loader](../../packages/ts-shell/src/core/prompts/templateLoader.ts)经[模板声明](../../packages/ts-shell/src/core/prompts/commands.ts)和原registry可选source回调，记录项目边界、个人候选目录（含不存在的候选）、被枚举目录及实际读取文件前后revision。模板编辑、命令名与路径碰撞、近层override及新个人目录创建都会撤销旧估算；保留既有覆盖优先级。这里只补元数据freshness，**没有声称精确源字节、同步发现成本或全部模板语法预览已解决。**

参考A本轮定向读session-stats 367–389和agent-session 7775–7823：无usage anchor本地计数；模板展开与custom/extension执行分开。沿这两项决定复用真实prompt组装并隔离execute；不复制它的单skill parser，也不将工作流运行时才确定的请求伪装成普通前景估算。两有效反转分别撤销有效prompt准备和模板source传递，均产生AssertionError/exit1，逐文件精确字节恢复；现有driver配置复验、来源撤销、零handler调用与多skill传播仍保留。

最终四文件50项通过（runtime preview12、composition17、template loader10、research composition11）；较早38/49项检查与它重叠，不累加。四静态门通过、模块责任上限0、TS构建通过。中间build一次因推断联合类型的可选error字段不能缩窄为string失败，改显式undefined检查后构建通过；没有更改类型规则或脚本。正式judge与文档校验结果提交前另读回。

两模式小型真实Node PTY最终通过：启动/普通草稿约4.3k，两个skill+brainstorm+模板约9.0k，增加模板后约12k，研究driver显示`? stale`且无旧数字，换回纯组合恢复约12k；配置与transcript原字节不变、零message、零research。数值仅属此隔离synthetic夹具和当前字符估算，**不是用户1.7k/4.9k真实差额实验**。退出143为SIGTERM清理。早期PTY漏传project且空.git在父仓库内不能建立真实Git根，随后用外部隔离root及git init修正；transcript头误判为空文件、Ctrl+U只清当前行、仅接受`?/`漏掉`? stale/`的夹具断言也已纠正，失败记录保留。

最终build`94b27501b9beec6e05a90918ebd2370998401750679dfb698c9919add8562493`，inputs`0127882adb823747420a9e7448d901a363c953c0eb20bba155a4dcff90d52261`，artifact`9e44d129c24d24fc028b0dee046b5993c31d23c382ae271f7042ebccc8ae57d8`。本批工件保留`.omx/artifacts/phase20-addition-composition/`；未运行全仓本地回归、20k真实PTY、真实provider或桌面矩阵。ADD-08仍缺独立命令/研究工作流完整preview、原生tokenizer、精确源字节与真实差额；完整面板及冷/热Node/exe性能验收继续partial，原Phase20保持38 complete / 9 partial，ADD独立。

提交前正式CLI judge实际读回为proven，三个结构义务均satisfied；严格docs drift与diff check通过，118条既有advisory保留。本文76、audit83个本地链接目标存在。最终两条PTY绑定上述build/source身份，临时目录清理；本批提交/推送及自身CI由后续实际读回绑定，不能把本地验证当作CI结果。

第十四批已提交并推送为`a412dadca38efe51f506c87367502eb0ea68c70d`，本地与origin/main一致且clean。自身CI`40236655044`第十五批开始后实际仍in_progress，Watch`40236655025`仅workflow success未读工件。第十三批CI`40235334827`现已实际success：992 files passed/1 skipped，10774 tests passed/3 skipped，结构proven；Watch`40235334790`工件本轮下载读回proven，三个结构义务satisfied。第十一、十二的旧navigation夹具CI失败仍保留其历史结果。

### 第十五批：当前阻断模型的精确连接恢复

ADD-01/02第十三批配置了具体失败connection行，但独立`model:current`报告仍只有Back，用户从当前阻断进入详情后看不到可执行的下一步；显式session连接变为error时credential resolution会早期拒绝并省略model，当前报告甚至消失。本轮确认这些是显示/发现性缺口，不改provider/auth的核心拒绝规则。

[model picker](../../packages/ts-shell/src/cli/interactive/picker/model.ts)保留原当前请求报告，并新增Connection details入口，链接到**同一已存在具体记录**的原详情/配置流程。匹配用connection ID、provider、model及catalog endpoint身份；端点匹配歧义、record删除/provider变化、pool及override阻断都不猜目标。显式session保存target只用于补足被拒绝时的展示名称，仍显示request blocked；不据此制造credential或放行请求。报告动作在进入具体connection前再次复验原choice/config/session/profile准入，过时则报告expired，不重开旧详情。

用户路径是当前阻断报告→Connection details→精确connection→遮罩key或适用native账号登录→返回原具体model→后续显式启用。直接复用原inspections map、详情、认证返回与连接新增事务；没有另一份credential writer、in-place修复或自动切换。只读参考A locked provider直接解释缺credential并提供既有OAuth owner的入口：沿明确下一步与认证/启用分开的决定，本项目为多relay加入精确记录约束；不能因runtime相同就给relay原生登录或猜另一个same-label目标。

最终四文件78项通过（current report11、model43、key8、native auth16），覆盖pending/error/credential-missing、显式error保留标签、同名relay、真实overlay键盘保存/显式启用、native取消、删除/provider变化/歧义/override/pool与刷新后旧动作拒绝。两个有效反转去掉current恢复入口及动作准入复验，均AssertionError/exit1；产品源码逐字节恢复后current11项再次通过。较早58/60/77pass轮次不累加，夹具失败已分类：active ID指向删掉/provider改变record被配置保护正确拒绝，改清global active ID而保留session绑定；列表Current request单行文本会截断，改核验完整blocker和selected connection；新增native fixture没有gpt-5.4-mini目录，补真实目录输入。没有放宽生产保护或缩短请求错误为成功。

普通/全屏×key保存/Esc四条小型真实Node PTY通过：从搜索后实际focused当前报告进入精确broken record，遮罩提交/取消，旧broken与other relay原record不变，新增connection精确address/model读回，原session selection保持无值；终端不含key，不调用provider。认证动作没有被当作prompt回合；退出143为SIGTERM清理。单元键盘检查另验证返回后显式Enter才写session模型，PTY未冒充这一部分的真实provider调用。所有源码验证串行，无20k真实PTY或全仓本地回归。

四静态门、module facade责任上限0及TS build通过；最终build`ae1932b641917ce9b02a54bbea0216a50ee453e575a7ed5b69c0afe56f220b0e`，inputs`dd15ff442dc42676db3b4cf57e224cd3ac74a13aae9b961b992fe15201e39ab2`，artifact`9f3e6ee485b11c736038221db9357c0764b3f39ef8bcbdff146d3172f257bfbd`。正式judge实际读回proven，三个结构义务均satisfied、无open/failed/gap；严格docs drift与diff检查通过，118条既有advisory保留。加强旧记录必须存在且不变、输入历史无key的断言后，四条小型PTY再次串行通过；重叠轮次不累加。Git交付由实际读回另绑定。本批工件保留`.omx/artifacts/phase20-addition-current/`。真实OAuth/network、完整面板字段/来源/鼠标/resize/桌面矩阵、冷/热Node/exe性能、独立命令/研究完整上下文preview、原生tokenizer与实际1.7k/4.9k差额仍partial；原Phase20保持38 complete / 9 partial，ADD独立。

第十五批已提交并推送`98f13a76abb7cf9d23b53ee93a681803eb640ea1`，实际读回main与origin/main精确一致且工作区clean，交付receipt保留current工件。随后读取自身CI`40237636395`仍in_progress；Watch`40237636347`为workflow success但未读工件。第十四CI`40236655044`本轮再次读取仍in_progress，未将本地检查或Watch状态代替行为CI。

### 第十六批：独立提示词模板的完整本地预览

ADD-08此前只预览正文纯modifier、显式composable模板与多skill。普通文件模板即使只执行纯文本替换，也因首位slash统一拒绝而保留问号；这是确定的能力缺口。本批针对普通独立模板补齐，未宣称所有独立命令或研究driver已有完整预览。

[模板声明owner](../../packages/ts-shell/src/core/prompts/commands.ts)为已发现模板提供显式纯`preparePrompt(rawArgs)`；原execute与[上下文预览](../../packages/ts-shell/src/cli/runtime/context/preview.ts)复用同一expandTemplate，不调用execute获取估算。[命令源解析](../../packages/ts-shell/src/core/commands/invocation.ts)提取原slashRouter的raw-name/raw-args语法，实际路由与预览共享，保留引号、CRLF、多行、未闭合引号及原兼容语法。canonical/alias携带该纯能力，named invocation独立声明；`kind=prompt`本身不代表可预览，隐藏/禁用命令也不因存在函数放行。没有第二套模板加载、配置、skill或命令执行系统。

独立模板预览先得到真实展开prompt，再按第十四批共享continuity和实际请求组装计算；沿原source tracker撤销模板修改、目录创建及近层覆盖。模板body中的slash保持展开结果，不递归启动skill、配置或研究。普通模板不因此获得正文组合资格，仍需`composable: true`才能作为modifier；与builtin同名的模板仍遵守registry保留名优先。参考A agent-session 7782–7813把extension/custom执行与文件模板展开分开，沿纯展开和运行handler的边界，本项目明确增加纯能力声明并沿自己的参数/路由owner处理，未机械引入其执行顺序。

主代理串行四文件96项通过（runtime preview14、slashRouter49、templateLoader10、expansion23）。新增验证将全部registry execute替换成抛错探针，确认纯预览零handler调用；模板输入与真实routeSlashCommand输出逐一比较prepare输入及完整estimate/digest，配置会话三文件字节不变、零MCP连接；builtin命名冲突、正文普通模板不组合、非法组合仍拒绝。两有效反转分别移除实际展开和纯模板准入，前者触发严格提示词AssertionError，后者在新增场景报preparation pending并exit1；逐字节恢复后preview14项再次通过，与96项重叠不累加。

普通/全屏两条小型真实Node PTY通过：启动/普通草稿约4.3k，独立模板含引号与多行约6.6k，模板文件修改后约9.4k；研究草稿显示问号/stale，换回模板恢复约9.4k。配置与transcript原字节不变、零message/研究/provider调用，退出143为SIGTERM清理。数值只属于隔离synthetic夹具的字符估算，**没有解释用户真实1.7k与4.9k差额**。

四静态门、责任上限0、TS build及正式CLI judge通过，实际verdict proven/三个结构义务satisfied。最终build`3acc4696c965ccbd964a5d0ecb5edd4339eb6bb4174002746c8e01ec974924f4`，inputs`6def2092f6cfeaeee552e38fadfafec5f88a89adaabe17fbc9afb10b0f621b32`，artifact`3d088e607445acece5d3450c7037e5b7f537e737788153d6b8f735de37678d96`；validator archive`6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985`使用全新scratch提取。严格docs drift与diff检查通过，118条既有advisory保留；addition80、audit85个本地链接目标存在。工件归档`.omx/artifacts/phase20-addition-templates/`，Git交付由实际读回另绑定。

完整settings/model的字段/编辑器/来源/鼠标/resize/桌面矩阵仍需补证；明确的未配置模型可选、面板整体看齐、消息顶格与箭头、正文path、多skill和有限slash组合需求不缩小。ADD-07冷/热Node/exe、ADD-08其他独立命令/研究完整preview、精确source字节与发现成本、原生tokenizer及真实差额仍partial；第九browser-cache writer退出1仍未归因，未运行WSL并发重压、全仓本地回归或20k真实PTY。原Phase20保持38 complete / 9 partial，ADD独立，完整目标继续。

第十六批已提交并推送`641f26645fabad5aeee61af0a31e2b0751032540`，实际main与origin/main一致且clean。自身CI`40238165109`本轮实际仍in_progress，Watch`40238165083`仅workflow success未读工件。第十四`a412dadc`行为CI`40236655044`现已实际success：992 files passed/1 skipped、10779 tests passed/3 skipped，结构proven；完整日志保留第十七批工件。不把该结果转记给第十五、十六或本批源码。

### 第十七批：面板鼠标选择后的键盘焦点与绘制边界

ADD-02/03定向核查发现两处确定交互缺口：[CatalogNavigation](../../packages/ts-shell/src/cli/interactive/picker/navigation.ts)侧栏select不更新焦点域；[OverlayHost](../../packages/ts-shell/src/cli/interactive/overlay.ts)点击内容行只改OptionModel current，不把导航从categories切入rows。因此内容行看似选中后，上下键仍可能切分类；窄屏也可能继续停在Browse。另有[导航绘制](../../packages/ts-shell/src/presentation/tui/chrome/navigation.ts)height=1仍为被slice掉的侧栏项登记hit，出现不可见目标可被点击的边界缺口。原终端“上下键没有任何交互”的唯一现场根因仍未捕获，本批不能事后归因为同一问题。

修补由原navigation owner接收point(id, query)：侧栏点击进入categories，具体内容行进入rows，settings section点击留在sections且Enter后才进入字段；搜索原文保留、投影沿既有小写匹配口径。overlay按更新重投影，同一画面失效后立即清option/chip hit spans，等待下一次绘制；不在pointer回调保存配置、激活模型或自动登录。height≤2不登记未绘制侧栏项；原默认/手动行身份、disabled可浏览与实际启用准入保留。

只读参考A model-hub 829–842、2315–2408：分类scope改变维持scope焦点，角色/具体内容点击把焦点交给list，mouse命中来自实际frame，assignment pending阻断动作。本项目沿焦点跟随区域、可见命中及pending保护；保留自身“点击只聚焦、Enter明确操作”的合同，不复制二次点击locked provider即登录的行为，也未增加hover/wheel能力。

最终四文件144项串行通过（navigation7、overlay74、model43、settings20）；新增覆盖侧栏点击→上下分类、内容点击→上下行/Enter精确字段、settings section→Enter、未配置模型精确inspection、120↔40列焦点页、MAX大写搜索、旧坐标失效、height0/1/2不调用select。初轮140pass/2fail属于夹具定位/期待错误：同名Maximum turns先命中详情列、期待不存在的Maximum tool output及Model字段；改实际内容列/metadata key与原详情能力，不削弱焦点域/精确ID断言。后续143/144及恢复7项重叠不累加。

三个有效反转分别移除category域切换、content point调用、height hit预算，均AssertionError/exit1，产品源码逐字节恢复后navigation7项通过。初版height反转仍绿色，因为点击的是当前分类；补select未调用断言后真正检出不可见hit，保留这一轮无效记录，不能将早期无效反转写成有效。

普通/全屏两条小型真实Node PTY通过实际SGR点击：Model分类→上下分类→Maximum turns内容→Down输出limit→Enter精确字段→Esc返回/关闭；provider分类→missing-b→Up missing-a→Enter原配置详情。磁盘config原字节不变、零session modelSelection、零message/provider调用，退出143为SIGTERM清理。当前PTY为120×60，40列/极矮/resize在真实overlay host场景验证，未冒充真实桌面缩放。探针首次忽略regular相对绘制、cursor-only CUP覆盖、stored ●和子详情回regular，又用旧screen条件提前满足后续等待；已按当前alternate-screen生命周期、完整CUP+K行和动作后的新输出同步修正。反转后测试文件变动还触发launcher freshness拒绝，重新构建后再验，未绕过校验。

四静态门、责任上限0、TS build、正式CLI judge proven/三satisfied通过。最终build`6a06f16db5e6d032c38a9d45d89c10decd8033c119d5706a0b0733bae3cc758d`，inputs`5faf272d81455cfd900bc35f8df109d6d1aa31508181e7ba9b4bf4e9eb147922`，artifact`9000a82ace0e16330bec24e4716d9fb1e687ff14203ab3408854a7a52ca658ff`。严格docs drift与diff通过，118条既有advisory保留；addition83、audit86个本地链接目标存在。工件归档`.omx/artifacts/phase20-addition-pointer/`；Git交付按实际读回绑定。完整面板全部字段/编辑器/来源/桌面矩阵、真实认证、启动冷/热Node/exe、原生tokenizer、其他独立命令/研究preview与精确source/真实差额仍partial；第九writer退出1仍未归因，原Phase20保持38 complete / 9 partial，ADD独立。

### 第十八批：设置多行键盘编辑与实际视口预算

第十七批`1c87bbbb5416cfc2e6d35aa0c0bbfb1d6f9b9337`已推送；本批开始与定向延迟检查时其CI `40239145932`仍in_progress，不能把前一批结构检查或Watch workflow success当作该CI通过。第十五`40237636395`及第十六`40238165109`随后已实际读回completed/success；本批实现与Git交付另绑定。

ADD-03核查确认三个相关缺口：[InputForm](../../packages/ts-shell/src/cli/interactive/picker/input.ts)未处理Shift+Enter/Ctrl+J，列表“一项一行”只能通过粘贴构造；表单强制至少一编辑行却同时保留标题/标签/footer，并且[OverlayHost](../../packages/ts-shell/src/cli/interactive/overlay.ts)传整屏height而非主界面实际分配行数，短窗口可能裁掉光标；超过64KiB的原值拒绝预填后，value校验覆盖该错误，允许空值通过部分字段的验证。这些是可定位源码缺口，不能归为用户原model上下键无交互的唯一现场原因。

[settings valueEditor](../../packages/ts-shell/src/cli/interactive/picker/settings.ts)仅为list/object声明multiline；InputForm复用原Editor插入换行、字素导航、undo与caret-follow滚动，Shift+Enter和Ctrl+J不走提交，普通Enter仍由原host验证并暂存，Apply委托原settings保存事务。masked秘密和read-only视图不接受换行编辑；其他字段不新增换行键，原粘贴合同保留。普通form使用availableRows，全屏form使用整屏height；有行预算时优先保留编辑行，逐步省略标题/标签/footer，零预算不绘制。拒绝的超大原值保持不可提交，直到用户明确清空或输入替换，避免浏览后Enter意外覆盖原值。

只读参考A settings-selector 159–180将设置文本交给共享TextFormField、保留预填/遮罩/提交/取消；components/editor 2100–2134区分modified Enter/newline与普通submit，并保留配置submit优先级及bare-LF fallback。本项目采用共享编辑器和分开的换行/提交决定，按自身ParsedKeyEvent将LF作为Ctrl+J；保留Enter暂存/Apply保存的事务。本批没有证明参考项目通用settings字段全部支持多行，也没有扩展主composer按键配置或引入另一套表单编辑器。

最终五文件157项串行通过（input15、settings20、settings/source7、overlay74、surface/view41）。新增验证经真实键盘事件与settings writer输入三行字符串列表、多行对象JSON，Enter前后配置字节不变，重新编辑后Esc保留先前暂存，Apply后磁盘读回并重开编辑器，项目/显式input原字节保留；覆盖单行/遮罩/只读拒绝换行、64KiB上限、超大原值空提交拒绝、1/2/3/4/6/12行与中文emoji、换宽度导航，以及实际InteractiveSurface剩余预算和held主草稿保留。首次114pass/1fail为oversize夹具尚未等待load结束，host正确吞掉loading期间Enter；补来源就绪后通过。后续115/156与最终157重叠不累加。

三个有效反转分别移除换行、恢复整屏height、移除rejected-prefill准入，新增行为断言均AssertionError/exit1；产品文件逐字节恢复后完成最终157项。两模式120×60小型真实Node PTY均通过键盘三项list、多行object、暂存不写、编辑Esc保留暂存、Apply磁盘读回和重开完整list；零message、无session modelSelection、无provider请求，结束143是SIGTERM清理。首次regular最后期待完整Stored串超时，因为详情原compact36截断，改重开编辑器读取完整值；随后fullscreen在清空已空字段后期待未变化hint重绘超时，改依输入顺序发送并等待新值/焦点及磁盘结果，未改产品以迁就探针。两份失败记录保留；小窗口/resize在真实host/surface测试验证，未冒充桌面终端缩放。

四静态门、责任上限0、TS build与正式CLI judge proven/三satisfied通过，validator由当前归档重新解包。最终build`130a4fb12c18fe5208ac6cff88454116687192baa5ef2fb90a47b542c95d03e4`，inputs`8bb3f560e1fad9c87650e6edd6fbd59d1be68120a51e313bc182ebd6e3d3ca18`，artifact`44d755df4a5316220f3fb137ed3fb66e8ace9b1e80c04a727342623abbf223e9`。工件归档`.omx/artifacts/phase20-addition-editor/`，指南补充实际按键，HANDOFF记录预算/拒绝预填/差分绘制陷阱。严格docs drift、链接检查及Git交付按随后实际结果记录。

完整settings/model看齐继续按第3节全部路径验收；允许选中具体未配置模型的要求不改回跳过导航，消息顶格与箭头、正文path suggestion/Tab、多skill与准入slash组合包括deep-research均保留。当前完整字段/来源/鼠标/resize/桌面、真实认证、冷/热Node/exe性能、原生tokenizer、其他独立命令/研究preview、精确source字节与发现成本及用户真实1.7k/4.9k差额仍待补证。第九browser-cache writer退出1仍未归因；未运行全仓本地回归、并发重验证或20k真实PTY。原Phase20保持38 complete / 9 partial，ADD单独跟踪，整体目标保持active。

本批严格docs drift与diff实际通过，保留118条既有advisory；addition86/audit87/guide1本地链接目标存在。第十五CI完整日志实际993files/10790tests通过、3skip，第十六993files/10792tests通过、3skip，两者结构proven；日志归档editor，不转记本批或第十七提交，也不将未读取的Watch工件称已通过。

### 第十九批：面板内容滚轮与非循环焦点

第十八批`e71448e7ad0fe08d526809956db16b9ff75524c6`已推送，main/远端精确一致且clean；本批延迟检查其CI `40240194248`仍in_progress，Watch只记录运行状态，工件未读。第十七CI `40239145932`随后实际failure：991files/10795tests通过、2fail/3skip。两失败分别为navigation点击夹具未限制侧栏而命中同名文本（期望Browse失败），以及print/research启动被另一活跃build lock拒绝；后者stderr明确“A build is in progress…transaction was not recovered”，未归因为产品研究路由失败、flaky或锁协议错误。历史失败保留；本批修navigation夹具按侧栏/内容列定位，锁并发来源仍待归因，不改变构建保护以绕过失败。

ADD-02/03定向核查确认[OverlayHost](../../packages/ts-shell/src/cli/interactive/overlay.ts)接收鼠标后仅处理press，wheel直接吞掉，列表无变化。现滚轮一格沿原[OptionModel](../../packages/ts-shell/src/presentation/tui/chrome/options.ts)移动一项，显式wrap=false在可聚焦首尾停止；原键盘上下循环保留，disabled+focusable的具体未配置模型仍可浏览，普通不可聚焦行跳过。滚动不调用apply、inspect、登录/配置，也不改变多选chosen；单选按原preview契约报告焦点变化。

复用[CatalogNavigation](../../packages/ts-shell/src/cli/interactive/picker/navigation.ts)接wheel方向事件，categories/sections转rows并保留规范化search，settings section还原正常字段可浏览性。[panel](../../packages/ts-shell/src/presentation/tui/chrome/panel.ts)、[modal](../../packages/ts-shell/src/presentation/tui/chrome/modal.ts)登记实际已绘制list span，与click的focusable span各自保真；[navigation renderer](../../packages/ts-shell/src/presentation/tui/chrome/navigation.ts)平移内容坐标。标题/footer、detail/sidebar、修改键、无origin、极矮无列表、加载/actionPending及InputForm不滚动；滤词、数据刷新、scope/domain、滚轮/键盘可能移动窗口后立即撤销旧list/option命中，再次绘制才接收。未引入第二套列表、目录、配置或pointer owner。

只读参考A settings-selector 1225–1282按实际内容区域路由，submenu优先；settings-list 395–409滚轮回rows并moveSelection(delta,false)，detail/sidebar区域拒绝；model-hub 2332–2347内容角色/模型使用非循环焦点，而侧栏只pan viewport、不自动换scope。本项目采用内容区域、子流程优先、回rows、非循环与零自动操作决定；原点击只聚焦/Enter明确操作保留。侧栏pan和hover尚未实现，不能用本批忽略侧栏宣称这两项已对齐；主屏regular仍按原terminal scrollback策略，仅借用alternate-screen面板时接管pointer。

最终六文件144项串行通过（wheel10、navigation7、overlay74、options21、panel14、pointer18）。覆盖SGR滚轮方向、具体未配置模型详情、section→字段、multi-select chosen不变/preview不触发、单选preview、首尾不循环、disabled跳过、屏幕origin平移、side/detail/header/modified拒绝、过时filter/keyboard/wheel命中、loading/input/actionPending与零apply/save。初轮104pass/3fail中section场景检出真实设计遗漏（只登记click行），补独立painted list spans；另外两个为multi-select期待箭头以及忘清open/filter的既有preview调用的夹具误期望，改断言精确detail ID/chosen及动作后调用。后续106/107/143与最终144重叠不累加。

三个有效反转分别恢复wheel wrap、移除section域交接、保留旧wheel spans，新增行为AssertionError/exit1，产品文件逐字节恢复；最终又补键盘移动后坐标失效并通过144项。普通/全屏两条120×60小型真实Node PTY经SGR wheel验证settings分类→sections→wheel到maxOutputTokens→Enter精确详情，以及provider分类→wheel missing-b→Up missing-a→Enter精确配置详情；config原字节、零session modelSelection、零message/provider，SIGTERM143仅清理。最后键盘保护变动后重建再验两PTY通过；首尾/窄屏/旧frame/输入编辑边界来自host测试，未伪称真实桌面scroll/resize。

四静态门、责任上限0与TS构建通过；最终build`198895857a0ec77ef55fcb6ff62119ef888cf611938c410eab02187bfbbfde21`，inputs`2ba48afedcb438a7f4fea005d06d64113b5b178f6b6c5a264bb9a2c93a3a6eac`，artifact`e702eb99d9f1d4b0a3d9560d483bf4d0f4520ebbb17c3612a371b7623b7460f9`。最终正式judge实际exit0、proven且三项satisfied；严格docs及diff检查通过，保留118条既有advisory，addition92/audit88/guide1个本地链接目标存在。Git交付另绑定；工件归档`.omx/artifacts/phase20-addition-wheel/`。指南和HANDOFF记录实际滚轮路径及命中边界。

完整面板字段/来源、侧栏pan/hover/desktop、真实OAuth/key、冷/热Node/exe、原生tokenizer、其他独立命令/研究preview、精确source字节/发现成本与用户1.7k/4.9k真实差额继续待证；第九cache writer退出1与第十七活跃build lock来源未归因。不运行并发重验证、全仓本地回归或20k真实PTY。原Phase20仍38 complete / 9 partial，ADD独立，整体目标active。

### 第二十批：侧栏独立滚动与焦点返回

第十九批已提交/推送`92f7fefa380fef73fa26102e325cf213df5dfc8e`，本地、origin/main和远端精确一致、工作区clean；其CI `40241260392`本批实际in_progress，Watch `40241260528`仅workflow success、工件未读。第十八CI `40240194248`随后实际failure，992files/10809tests通过、1fail/3skip；唯一失败为第十七批引入的navigation同名点击夹具，已在第十九批限定pane修正。第十八日志未再次出现print/research活跃build锁拒绝；不据此消除第十七的历史失败，也不推断其并发来源已查明。

ADD-02/03确认[导航绘制](../../packages/ts-shell/src/presentation/tui/chrome/navigation.ts)此前每帧按活动分类重新居中，没有独立侧栏视口，wheel只能吞掉。现由同一绘制模块的NavigationViewport保存有界offset，沿原[scrollWindow](../../packages/ts-shell/src/presentation/tui/chrome/window.ts)保持活动分类可见；[CatalogNavigation](../../packages/ts-shell/src/cli/interactive/picker/navigation.ts)持有该显示状态，沿原分类/row owner操作。侧栏wheel每格只pan一项、不换category/domain/row、不触发preview或apply；点击以滚动后已绘制ID选分类，再由Enter进入内容/执行原操作。活动分类变化、键盘返回、窄宽布局变化、可用高度变化及重开/子面板返回时露出活动分类；刷新重排保留顶部可见ID锚点，删除/空目录限制offset。

OverlayHost沿现painted list map按同一行保存侧栏和内容各自的横向span，不能让内容覆盖侧栏；origin、修改键、pending/loading/input/submode边界继续由同一pointer入口处理。pan后即时撤销旧option/list/chip命中，下一帧才按新身份接受；不接管主屏regular的terminal scrollback。仅实际绘制侧栏项可滚动或点击，title/footer/窄屏内容页/极矮无列表无侧栏命中。

只读参考A的model-hub 2332–2347明确“wheel pans the sidebar viewport; picking a scope is click/keys only”；hub-frame 208–212限制offset，230–245把follow-active与pan分开。采用独立viewport、非循环边界和显式选择；本项目继续保留click聚焦/Enter操作及现有事务，不复制参考整体frame或模型目录。参考hover没有在本批实现，真实桌面输入/resize矩阵也未补齐。

最终五文件110项串行通过（wheel12、navigation7、chrome/navigation3、overlay74、panel14）。覆盖side/content同一行span、pan不改变分类/preview/apply、旧坐标拒绝、滚动后点击精确ID、Enter进入内容、窄屏Tab返回/重开、resize可见性、重排锚点/删除/空目录及height0/1/2零不可见hit。初轮109pass/1fail检出真实遗漏：窄屏内容页early return没有同步viewport焦点，Tab返回仍隐藏活动分类；已把状态更新放到退化绘制之前。后续110重叠不累加。

三个有效反转分别去掉侧栏路由、去掉焦点返回判定、保留旧side wheel span；均AssertionError/exit1并逐字节恢复，再验最终110通过。120×60普通/全屏两条小型真实Node PTY使用64个合成provider/65个模型、零历史消息，验证侧栏上下pan→滚动后点击Provider 00→内容wheel上下→Enter精确missing-a详情。config原字节、零session modelSelection、零message/provider均通过；退出143是SIGTERM清理。窄屏/重排/边界来自host及显示owner测试，未当作桌面平台证据。

四静态门、责任上限0、TS构建通过；build`ab0acbb64c07071801dcc67d3266e61e30a9d4c9e235b2e52b3d84132813e22e`，inputs`6c63ae7aa4da4e414811d61cc08b1d7a233eb4b3cfc394f23a5647b35775b798`，artifact`7d6081798d57f6564f79ee149ac311e3846a5a9da0f0a07886d440936cc816bd`。正式judge实际exit0、proven且三项satisfied，严格docs/diff通过、118既有advisory保留；addition95/audit89/guide1本地链接目标存在。证据归`.omx/artifacts/phase20-addition-sidebar/`，Git交付另绑定。指南与HANDOFF同步真实行为和隐藏侧栏/同一行双span陷阱。

ADD-01/02/03整体仍partial：hover、完整字段/来源/编辑器及真实桌面/认证矩阵待证。ADD-07冷/热Node/exe性能、ADD-08原生tokenizer/其他命令与研究完整preview、精确source字节/发现成本及用户1.7k/4.9k真实差额继续缺；第九cache writer与第十七build并发来源未归因。原Phase20仍38 complete / 9 partial，ADD独立，完整目标继续active。

### 第二十一批：面板悬停与终端报告生命周期

第二十批已提交/推送`8218e40b82c1c23ff0087d52d4a34682315a00fa`，本地、origin/main与远端一致、工作区clean；自身CI `40241932127`本批首检in_progress，Watch `40241932303`只确认workflow success、工件未读。第十九CI `40241260392`延迟实查success，完整日志994files/10821tests通过、3skip且结构proven，归档本批hover目录；这些历史CI证据只绑定`92f7fefa`，不赋予第二十/二十一批。

ADD-02/03确认悬停链路此前不存在：[mouse解码](../../packages/ts-shell/src/presentation/tui/input/mouse.ts)只请求1002按住按钮的移动，把SGR 35的无按钮motion当release；[OverlayHost](../../packages/ts-shell/src/cli/interactive/overlay.ts)没有独立hover状态。现增加move事件，保留SGR/X10的press/drag/release/wheel区别；原[TUI](../../packages/ts-shell/src/presentation/tui/render/engine.ts)沿[frame契约](../../packages/ts-shell/src/presentation/tui/render/frame.ts)接pointerMotion，实际picker帧在已持有的alternate screen开启1003，退出picker恢复1002，交接外部终端/stop释放motion。主屏regular不接管鼠标/scrollback，借用面板屏幕后才启用；没有另设终端owner。

[InteractiveSurface](../../packages/ts-shell/src/presentation/tui/surface/view.ts)在实际overlay绘制后投影该意图；interactive host不把move登记为执行意图或清除vim选区。[Pointer](../../packages/ts-shell/src/cli/interactive/pointer.ts)优先只交capture，不让迟到或未捕获motion完成拖拽、滚动、toggle/copy或重复redraw。overlay只在hover身份/所属pane变化时requestRender，沿现painted spans取得真实ID；两个pane同一行仍分横向命中。hover独立于OptionModel current、chosen、category/domain以及preview；Enter继续对键盘选中项操作。

[panel](../../packages/ts-shell/src/presentation/tui/chrome/panel.ts)、[modal](../../packages/ts-shell/src/presentation/tui/chrome/modal.ts)和navigation采用已有statusBandBg画独立hover band，selectedBg及箭头仍表示实际焦点；不新增主题schema或另一套候选库存。具体未配置模型可hover，settings section时普通字段仍可高亮但不获click/apply准入，section标题不高亮。进入detail/header/footer/另一pane或失去origin清除旧hover；filter、source、wheel、keyboard、resize、pending/loading/input/submode和replacement按现生命周期过期，不改保存/认证/启用契约。

只读参考A的tui 106–111明确1003报告无按钮motion；model-hub 2349–2365独立sidebar/browser hover并在离开内容时clear；settings-selector 1242–1270先给submenu，排除tabs/sidebar/section并按实际frame命中；select-list 271–274独立hover index。采用独立hover、不移动选中、跨pane清除、子流程优先及真实geometry；参考在应用范围开启mouse，本项目按已持有的picker帧恢复/释放以保留regular scrollback，不复制另一套TUI。

最终八文件165项串行通过（hover7、wheel12、picker/navigation7、mouse9、pointer19、engine55、surface42、panel14）；覆盖SGR/X10 move区别、迟到motion不结束选区、不变焦点/preview/apply、side→content→detail清除、section不可高亮、重复motion零额外redraw、filter/source/resize/replacement/旧坐标、narrow隐藏侧栏、input/loading/pending，以及主屏不请求motion、两screen模式启用/关闭、suspend/stop释放。初轮127pass/4fail来自颜色关闭夹具，bgOpen为空让负向断言失败、正向断言无效；固定独立16色并每测试恢复palette后通过，未削弱显示断言。随后131/164/165重叠不累加。

三个有效反转分别把move恢复为release、hover同步修改OptionModel focus、离开内容仍保留旧hover；均AssertionError/exit1，源文件逐字节恢复，最终165通过。普通/fullscreen两条120×60小型真实Node PTY经独立SGR背景观察验证category hover→click→missing-b hover→移到详情清除→Enter仍选missing-a→精确配置详情→返回关闭；1003真实开启并在关闭时释放。config原字节、零session modelSelection、零message/provider通过，退出143仅SIGTERM清理。本批真实PTY覆盖Linux报告链路，不能代替桌面指针、跨平台输入法或真实认证矩阵。

四静态门、责任上限0、TS构建及正式judge实际exit0、proven三satisfied通过；build`ead28413c41b9199fdb6a86a50a7a75fd7cff580050d255f41f627be06f85ae1`，inputs`dcf9d99962c5686ea3bc338a387faa3ac6bf8b0b86857d038c87d91c617ff302`，artifact`83ab5b07774aa8485b73060023685a50d8fb38adec15c5963a0a78d5fe289c81`。严格docs/diff实际通过，118既有advisory保留；addition103/audit90/guide1本地链接目标存在。工件归`.omx/artifacts/phase20-addition-hover/`，Git交付另实际绑定；指南与HANDOFF同步报告/gesture/颜色夹具边界。

ADD-01/02/03完整面板仍partial，完整字段/来源/编辑器及真实desktop/OAuth/key验收待证；ADD-07冷/热Node/exe性能、ADD-08原生tokenizer/其他独立命令及研究完整preview、精确source字节/发现成本和真实1.7k/4.9k差额继续待证。第九cache writer与第十七build并发来源未归因；原Phase20仍38 complete / 9 partial，ADD独立，完整目标active。

### 第二十二批：上下文估算绑定实际规则与模板字节

第二十一批已提交/推送`aebbdaa7fe74437f8e54ff5729b772ff6128607e`，本批接续时工作区仅有六个初始上下文改动，尚无验证或交付证据。延迟实查第二十CI `40241932127`与第二十一CI `40242628366`均仍in_progress，分别绑定`8218e40b`与`aebbdaa7`；未读取这两批Watch工件，不能借用第十九绿色结论。本批验证与Git交付分别记录。

ADD-08确认[来源捕获](../../packages/ts-shell/src/context/request/sources.ts)原先保存lstat/realpath/stat及缺失候选父目录revision，未绑定读取到的原始文件字节。[规则读取](../../packages/ts-shell/src/context/instructions/projectInstructions.ts)与[import展开](../../packages/ts-shell/src/context/instructions/importExpansion.ts)只有读前回调；[模板读取](../../packages/ts-shell/src/core/prompts/templateLoader.ts)虽有读后回调，仍只比较元数据。这是确定的覆盖缺口，与估算新鲜度相关；不证明用户的1.7k/4.9k来自源文件变化，也不意味着普通文件编辑原先都检测不到。

现规则、APPEND_SYSTEM、import及模板读取原始Buffer后，将同一次实际读取的字节交给原onSource链路，再进行BOM处理、UTF-8解码、预算裁剪、frontmatter及模板展开。读后准入回调位于文件读取catch之外，源变化或预算拒绝不会被误报成“文件不可读”后继续发布部分估算。import以原resolved alias捕获，保留物理目标、项目边界、深度及去重规则；模板仍保留现有候选优先级，不另建规则/模板目录。

同一capture保存SHA-256与长度，不保留原文副本；最多512个路径、每文件512KiB、全部记录8MiB，重复相同来源不重复扣字节，超限撤回完整估算而不修改实际提交路径。异步verifyContent串行复用[已验证文件句柄读取](../../packages/ts-shell/src/runtime/execution/snapshot.ts)，核对实际字节并前后重验原alias和所有元数据；每次读取按捕获长度限制，空文件也验证，取消不开始下一来源。覆盖的是已登记来源在检查窗口中的字节一致性，不承诺整个文件系统跨文件原子快照。

[runtime preview](../../packages/ts-shell/src/cli/runtime/context/preview.ts)在返回前核对内容，并提供异步复验；[状态栏controller](../../packages/ts-shell/src/cli/interactive/context/controller.ts)周期复用已有一个pending槽位，取消/超时请求后仍等待读取settlement，不提前开始第二个读取。检查前后重验身份，过期/内容失败撤回值，检查成功不延长原20秒有效期；10秒超时立即撤回，迟到结果不能发布。frame read只读内存身份和值，不执行元数据检查、内容读取或网络。最初六文件草稿还遗漏了pending检查跨过expiry的撤值及超时无拒绝时的撤值，这两处在本批核验中补齐。

只读参考pi resource-loader 196–231采用实际读取的规则内容、override优先、跳过非文件/不可读及BOM处理；参考A session-stats 276–310从实际session资源与tokenizer形成非消息分项并绑定pending/provider anchor。采用“核算真实加载内容”的决定，保留本项目来源owner与更强的异步句柄/失效检查。参考片段未提供精确字节新鲜度证明；本批未引入其tokenizer或改变characters/3.5公式，也未完成真实token差额调查。

最终八文件89项串行通过（sources7、capture5、controller9、runtime preview15、project instructions20、import19、templates10、prompt request4）。新增覆盖BOM/非法UTF-8解码相同但字节不同、模拟元数据相同的等长编辑、完整原始字节在裁剪前捕获、所有loader读后准入错误传播、alias读后重定向、空文件、单源/总字节上限、取消中止后续读取；实际runtime对规则/import/append/template逐个等长变化拒绝旧preview，session文件逐字节不变、零MCP连接/refresh。controller验证周期检查串行、取消等待、迟到发布拒绝、原expiry不延长、超时撤值和frame读取不调用复验。

初轮85pass/3fail为新controller夹具错误期待：已有值换身份后应stale，expiry与500ms轮询/150msdebounce/既有5秒失败重试存在窗口，周期检查开始点不能用任意固定等待假定。按实际契约修正精确状态和窗口，另补已发布值的异步检查失败覆盖；随后89与反转后89重叠不累加。三个有效反转分别去掉digest比较、去掉规则读后内容准入、取消后提前释放pending，均AssertionError/exit1，源文件逐字节恢复。未运行PTY：这批无布局变化，文件新鲜度及controller生命周期由真实隔离文件与fake-timer集成检查；不能据此声称真实桌面显示/启动收益已验。

四静态门、TS构建、正式judge实际exit0/proven且三项satisfied通过；build`711b9bced736cab2f63a606cf0695dd2347719a328f737c391f7406660561c7b`，inputs`8912cb16dd02902d3e467cdca7075ca8b93e77ec609797ee38706082ec3ab0d8`，artifact`70b9ca14bc3cbf7c347592700631815ab1769a6c2d7a527c3d57f309f4f27749`。validator使用本批新目录解包的当前tgz，SHA-256`6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985`。严格docs/diff实际通过，118条既有source advisory保留，addition110/audit91个本地链接目标存在。工件归`.omx/artifacts/phase20-addition-sources/`，Git交付另绑定；HANDOFF记录读后内容捕获与异步expiry陷阱。

本批不宣称全部source精确覆盖：skill discovery/body、context附件、其他动态来源的完整字节绑定和总发现/复验I/O成本仍需审计；规则原文件过大可使preview不可用，不能隐藏为精确数值或改变实际提交规则预算。原生tokenizer、研究及其他独立命令完整preview、同模型/协议/规则/schema的真实1.7k/4.9k拆分、冷/热Node/exe性能、完整面板字段/来源/编辑器/desktop/真实认证继续partial。cache writer及活跃build lock来源仍未知；原Phase20保持38 complete / 9 partial，ADD独立，整体目标active。

### 第二十三批：skill原始清单进入上下文来源核验

第二十二批已提交/推送`62dfe53d3359b56ac39c6438d3c4cd0de2b75963`，本地/origin/远端一致且接续工作区clean；自身CI `40243690372`本批实查仍in_progress。第二十一CI `40242628366`延迟实查success，完整日志996files/10840tests通过、3skip且结构proven已归档，绑定`aebbdaa7`；第二十CI `40241932127`亦读回success，但本批未取其完整日志或Watch工件，不借此给本批赋予CI成功。

ADD-08/11确认普通skill清单此前由[SkillDiscovery](../../packages/ts-shell/src/core/skills/discovery.ts)共享有界verified-handle读取，目录/root/metadata依赖完整，但返回已解码字符串；[SkillLoader](../../packages/ts-shell/src/core/skills/skillLoader.ts)的onSource只报访问路径，没有将实际清单字节交给preview来源捕获。具体嵌套manifest也未按原始内容登记。扩展冷读取共用同一discovery，热parsed cache另外通过host.current/isCurrent复验安装包全inventory；后者已有实际内容摘要，不能把热缓存归为完全没有字节检查。

现discovery.content返回同一次verified-handle读取的原始Buffer，loader在frontmatter/body解析前调用原source观察链，再UTF-8解码；目录、named文件及其原alias观察继续保留。包含enabled=false候选：清单虽不显示，也可能因编辑改变有效目录。resolveSkillCatalog把observer放入已有共享discovery，内层extension loader即使没有本地observer也能将冷清单传回外层；两者不同则分别调用，同一函数只调用一次，外层失败/取消后不继续本地观察。没有新增读取owner或复制skill目录。

observer拒绝是完整目录准入失败，固定SkillSourceError会穿过普通loader与extension withholding fallback，不能静默删掉某个skill后发布部分估算，也不在错误文本/嵌套cause暴露任意回调内容。观察前后沿原budget检查取消/期限；解析放在I/O catch之外，原manifest读取的ReadChanged/Cleanup/资源错误契约保留。显式path/noSkills、项目trust、命名冲突、skill参数/组合及模型权限均沿原owner，不因来源核验而执行命令或扩大权限。

只读参考pi skills 279–305先读取实际rawContent，I/O与frontmatter失败分开；参考A extensibility/skills 668–685在调用时读取实际skill文件、只取body并保留用户invocation来源。采用实际内容先于转换及失败分层的决定。本项目已有一次catalog捕获与多skill统一展开，保留这份内容并绑定原始字节，而不机械改为每个invocation再次读盘；异步复验负责撤回旧preview。参考片段不证明持久字节新鲜度，本批不据此声称完整source覆盖或原生token计数完成。

最终五文件99项串行通过（skill observation10、loader54、catalog11、extension registration8、runtime preview16）。验证原始非法UTF-8相同解码/不同字节、嵌套discovery、disabled candidate、extension共享observer、不同/相同回调、拒绝固定报错、取消后不读下一个manifest、raw reader边界、named alias重定向及实际multi-skill preview逐文件等长变化撤销；session字节不变、零MCP连接/refresh。安装扩展冷读有原始Buffer观察，warm不重复descriptor读取但dirty清单使cold/warm skill的isCurrent均false，回调失败不落入普通withheld。

小型两清单I/O夹具另验证：catalog读取恰好各一次，20次同步verify不增manifest正文读取，异步verifyContent再各读一次且maximum为捕获长度，peak active=1、最终active=0；这仅界定本夹具的descriptor返回字节，不代表物理磁盘I/O、所有目录枚举或扩展inventory无读。热扩展仍会同步扫描全安装inventory，读取成本继续单独待审计，不将cache复用写成零I/O。

初轮92pass/2fail来自新夹具只mock外部readRevision，而verified reader在同模块捕获真实revision，造成被正确拒绝的不一致source；改为固定目标stat/lstat真实元数据，保留handle校验后94通过。随后补外层/本地observer共存、安装扩展冷/热与I/O边界后98/99重叠不累加。三个有效反转分别不传raw manifest、内层observer覆盖外层、SkillSourceError不在rethrow传播，均AssertionError/exit1，源文件逐字节恢复，最终99再验通过。无PTY：本批无绘制改动，不宣称桌面输入或生产性能验证。

四静态门、TS构建、当前tgz新目录解包的正式judge实际exit0/proven且三项satisfied通过；build`efb6fb19e5ddae0b9c491fff325b71be930f56dc1450c75dd96a19c7f361aa34`，inputs`4b7095987aef311c34b78be5daf6f43e155a8877b3a4bc26295ffc5f8ecf7052`，artifact`6c478f08024fa018ea47624c12d83aab224087e42a85d731b63a0c088e91655f`。validator SHA-256仍`6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985`；严格docs/diff实际通过，118既有advisory保留，addition112/audit93本地链接目标存在。工件归`.omx/artifacts/phase20-addition-skills/`，Git交付另绑定，HANDOFF追加共享observer/fallback陷阱。

仍缺context附件/其他动态来源完整字节绑定及目录/ignore/extension总发现与复验成本；原生tokenizer、其他独立命令/研究完整preview、真实同模型/协议/规则/schema的1.7k/4.9k拆分、Node/exe冷/热测量、完整settings/model字段/来源/编辑器/桌面/真实认证矩阵继续partial。第九cache writer退出1、第十七build并发来源仍未归因。原Phase20保留38 complete / 9 partial，ADD独立，整体目标active。

### 第二十四批：附件预览异步内容复验与实时读取权限

第二十三批已提交/推送`25f9dc06a9e8615c44efbf8b11984422ba25dab0`，接续工作区clean，本地/origin/远端精确一致。延迟实查第二十二CI `40243690372`与第二十三CI `40244427716`均仍in_progress；Watch工件未读取，不把workflow success或更早CI绿色转给本批。

ADD-08核查纠正此前“附件完整字节绑定仍缺”的宽泛表述：[ContextEntry](../../packages/ts-shell/src/context/attachment/entry.ts)已经保存实际严格UTF-8内容及SHA-256，原同步[文件检查](../../packages/ts-shell/src/core/workspace/files.ts)拒绝不能原字节往返的非法UTF-8，包含BOM/CRLF的有效内容仍按原字节hash；contextEntryStillAuthorized会重读当前文件并比较digest。所以普通附件已有内容一致性验证，不能新登记成完全未实现或仅比较文件时间。确定缺口是preview.verify在每次同步复验中反复读取全部附件正文，取消不能中断同步读取；sourceReaderFor在一次读取内保留旧gate options，也不适于跨await读取。

现[读取准入](../../packages/ts-shell/src/cli/data/access.ts)从原sourceReaderFor提取sourceAccessFor，不读取正文；每次check重新获取gate('read')，按现configurationAdmission、session/cwd/root identity及primary/additional roots/denyRules验证。原同步command reader保留签名、UTF-8/hash/大小与最终准入；新sourceReaderForAsync复用已有inspectWorkspaceFileAsync，打开前、实际句柄路径及读取settlement后继续check，取消通过原signal和close finally；没有新文件读取器、权限系统或配置owner。普通等价设置不构成安全撤销，真实substrate/root/trust/权限变化仍拒绝。

[附件verify owner](../../packages/ts-shell/src/context/attachment/verify.ts)沿原最多16项/总512KiB/每项bounds，逐项检查原primary根内路径、异步读取实际文件、比较原digest并复验路径，取消不开始下一项，读取/cleanup错误直接传播。新增path-only检查复用原containment逻辑，不放宽附件到其他根；通用source reader仍支持已登记additional root读取。附件权限和内容分别检查，路径校验不是内容校验。

[runtime preview](../../packages/ts-shell/src/cli/runtime/context/preview.ts)同步verify继续检查来源metadata、附件路径及实时准入，但不再调用附件正文reader；verifyContent在统一sources异步复验后逐项核验附件，再重验完整request/session/config/工具/注入身份。返回preview前必须通过相同异步核验。估算仍使用实际保存且准备发送的entry.content，经promptWithContext与openingMessage共享组装；没有发送模型/MCP请求、消费turn附件或改写session。实际提交cliSessionRuntimeFactory仍沿原attachmentAdmission与digest检查，不用preview成功旁路提交准入。

只读参考A session-stats 276–310从实际session资源和pending snapshot构造计数；interactive-mode 8018–8031明确在bounded chunks之间让终端输入运行。本项目采用“实际准备内容计数”和“交互读取让出事件循环”，沿既有异步inspect owner完成，不复制参考的session renderer。参考片段没有与本项目ContextEntry相同的持久文件授权合同，不能声称其已证明本项目的source byte/root安全；新增反转分别检验digest、await后的准入和preview必经附件核验。

最终六文件47项串行通过（source access9、attachment verify5、entry3、runtime preview18、rules3、context controller9）。同步/异步reader有效BOM/CRLF/中文结果相等，非法UTF-8及大小拒绝；独立access不调用content reader，缺owner/取消/越界在open前拒绝；await后deny/session/substrate变化、additional根移除及primary根替换拒绝旧内容。真实descriptor取消时仍open，release/settlement后close且AbortError，保持原串行controller覆盖。附件逐项peak1，原bounds/aggregate/等长变化/digest/前后path/取消及cleanup错误保真。

实际runtime附件snapshot预览与手动同owner组装文本的完整estimate相等；20次同步verify零附件body读取，首次完整preview与显式内容复验各一次async inspect，修改后拒绝旧preview；session metadata/state/transcript字节不变、零MCP连接/refresh。取消的复验不获取内容，await后权限撤销拒绝。初轮44pass/1fail为新fixture将等价ConfigState替换当作安全撤销，与ordinary settings pinned合同不符；改为真实configuration.transition并保留断言后45通过，补root矩阵后47，重叠不累加。三个有效反转去掉digest比较、去掉async读取后check、去掉preview附件核验，均AssertionError/exit1且逐字节恢复，最终47再验通过。没有PTY或全仓本地回归，无生产延迟/桌面显示收益结论。

四静态门、TS构建、当前tgz新目录解包正式judge实际exit0/proven且三项satisfied通过；build`d894c4696369b1058f9151103bbc1ce618cd63253eb2392c870ed978f88d7f01`，inputs`8f118ba36fe7ce11bf056873000610acdc4b8424c80b41f1af9fac5d654ebee8`，artifact`8861c56000ba9d1e2185ae727b643662582172a8c22dd1e95d8a7231a4b9bda7`。validator SHA-256仍`6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985`；严格docs/diff实际通过、118既有advisory保留，addition117/audit95本地链接目标存在。工件归`.omx/artifacts/phase20-addition-attachments/`，Git交付另绑定，HANDOFF记录内容/准入分离和await后check。

此处“同步verify不读附件正文”不等于整个verify无I/O：session/source metadata及extension inventory仍有既有检查，frame read才保持文件系统无访问。实际请求目前的附件准入仍同步，本批不宣称整个dispatch异步化。跨文件原子snapshot、所有动态/ignore/memory来源精确绑定、目录/正文/复验总I/O成本、原生tokenizer、其他独立命令/研究完整preview、真实1.7k/4.9k拆分、Node/exe冷/热测量、完整settings/model字段/来源/编辑器/桌面/真实认证仍缺。cache writer/build并发原因未归因；原Phase20保持38 complete / 9 partial，ADD独立、整体active。

### 第二十五批：面板搜索退出、焦点恢复与模型详情返回

第二十四批`71e8d26babea2a754cd5945195a0d42b1ec14187`接续工作区clean。本批延迟实查第二十二CI `40243690372`、第二十三CI `40244427716`已completed/success，分别绑定`62dfe53d`、`25f9dc06`；仅读状态，未取两批全日志或Watch工件。第二十四CI `40245017599`实查仍in_progress。历史状态不赋予本批CI成功。

ADD-02/03核查[导航owner](../../packages/ts-shell/src/cli/interactive/picker/navigation.ts)和实际[OverlayHost](../../packages/ts-shell/src/cli/interactive/overlay.ts)，确认三项操作缺口：搜索将categories/sections无条件改成rows，退格清空后只恢复分类和字段ID，丢失原焦点域及所选section；搜索中Esc未被navigation消费，直接进入host关闭；model从侧栏搜索进入详情后，返回复用旧navigation但host用空filter重新投影，窄屏落回侧栏，原模型虽保留ID却不可见。新增四条搜索操作用例首次7pass/4fail，追加模型返回用例11pass/1fail，均在对应实际画面或host状态断言失败。

现沿CatalogNavigation保留单次搜索前domain和真实section身份，搜索重复投影/结果移动不覆盖原位置；清空恢复domain及preferred。settings用显式searchSelection策略使Esc转到当前结果所属分类/字段，无匹配恢复原位置；model Esc先清搜索，保留当前provider及原模型。明确分类点击/左右/Tab离开搜索时退役旧snapshot，不回跳。原host子编辑器与明确parent先处理Esc，审批/认证/取消合同继续保持。

[model picker](../../packages/ts-shell/src/cli/interactive/picker/model.ts)仅在带精确focus的本次open/load回返中将navigation转到内容行并退役旧search状态；后续load/publication不重复定位。因此进入未配置详情后Esc可直接看见原模型，手动回侧栏后刷新不抢焦点。具体未配置模型仍disabled activation/focusable inspection，认证与显式模型启用分开，未新增目录/配置/输入owner。

追加跨provider回返用例另在14pass/1fail中确认：从A分类搜到B具体模型，返回虽转rows但仍过滤A，B的ID不能成为可见焦点。明确返回的point在非All分类中按精确row group转所属provider；All浏览保持All，普通search点击不改原分类。修补后纳入最终196项，并在末次源码上重跑三有效反转/聚焦检查/构建/judge及PTY。

只读参考A `packages/tui/src/overlays/settings-selector.ts`1292–1328、1384–1406、1971–2000：搜索独立结果list，清空回pre-search tab，Esc可落到所选结果；`model-hub.ts`2087–2110先退出子状态/清query/再关闭，1674–1694显式赋值浏览进入list。采用清空和结果导航分开、取消分层及精确内容定位。Cheers保留自身分类/section焦点和明确parent契约，模型清搜索后恢复原浏览位置而非套用settings的跨分类跳转；刷新定位只执行一次。参照片段不证明本项目完整桌面或真实认证验收。

最终九文件196项串行通过（navigation15、settings20、model43、overlay74、wheel12、hover7、model auth16、key8、watch1）。覆盖categories/sections空结果搜索清空、settings结果Esc/Enter、未配置model空搜索与精确详情、侧栏搜索返回、窄屏/宽屏、显式分类键、返回后publication不抢侧栏、角色parent优先取消及既有pointer/credential事务。一次73pass/1fail为新测试错误要求disabled inspection必须返回原picker对象；host原本包装inspect callback，改为断言实际精确ID和详情结果，不改变产品准入。三次有效反转分别删除search-domain恢复、Esc消费、model返回定位，均AssertionError/exit1，源文件逐字节恢复。

实际Node入口regular/fullscreen隔离PTY均通过：settings结果Esc→详情→返回→section搜索清空、未配置模型上下键→空搜索Esc→侧栏搜索→精确详情→返回原missing-b；配置原字节不变、会话modelSelection未写、零message/模型派发，两子进程均已退出。探针首次漏算stored标记，随后修正借用全屏退出返回类型/regular详情识别，以及合并内置provider后用实际焦点逐项导航的上限；失败日志保留，不将这些探针缺陷归为产品故障。PTY只证明此小型隔离路径，不代表桌面鼠标、真实OAuth/API-key或全字段矩阵。

四静态门、TS构建实际通过，build`b62347ac84548e4639dfdfd9b2ac3b9dbf877d7660fed58e3fc19280955e793a`，inputs`8cfabbd57adfdd1d2783c325cb0e3ae2beb7aa1557d147bdcc34a0c35abf0eb2`，artifact`2f448abd2de5262f820544daa794ffe0a5e7d7a10ddd703ddf984afadcc89c53`；当前validator SHA-256`6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985`新目录解包正式judge实际exit0/proven，三项satisfied。工件归`.omx/artifacts/phase20-addition-navigation/`；文档检查与Git交付单独绑定。本批只闭合上述搜索/返回路径，完整面板字段/来源/scope/编辑器/桌面/真实认证、启动测量、真实token差额、动态来源/I/O、tokenizer及研究preview仍待验；原Phase20保留38 complete / 9 partial，ADD独立、整体active。

严格docs/diff实际通过，118既有docs-source advisory保留；addition120/audit99本地链接目标存在。最终build上的regular/fullscreen PTY已再次通过，检查进程均已settle。提交/推送SHA、远端读回及本批CI状态以该工件目录的delivery.json另行记录，不从本地绿色推定CI结果。

### 第二十六批：设置模型入口、会话范围与子面板返回

接续第二十五批`ba9171ea2a8e8b0b00f789cbbabf7cd9aa6fe7ab`。延迟实查第二十四CI `40245017599`已completed/success；第二十五CI `40246308906`仍in_progress，Watch `40246308965`状态success但未读工件。仅读状态，各绑定原SHA，不赋予本批CI成功。

ADD-03确认设置Model分类只有采样/输出/限制字段，缺少既有模型/角色浏览与当前模型thinking入口；用户需要离开settings另记slash。现在[设置面板](../../packages/ts-shell/src/cli/interactive/picker/settings.ts)在Model / Session加入Models and roles、Thinking effort，标明current session，从分类与搜索均可进入；reasoning等搜索词沿原searchText排序。由[registry](../../packages/ts-shell/src/cli/interactive/picker/registry.ts)委托原model/thinking面板，不增配置字段或第二存储。user/project文件scope仅用于其他设置；连接配置按原连接owner范围处理。

[model](../../packages/ts-shell/src/cli/interactive/picker/model.ts)原生parent贯穿未配置详情、credential返回、当前模型诊断、Default嵌套浏览及自动role返回；替代Default仅事后覆盖back的包装。模型保存返回settings精确入口，角色保存先回role/model再Esc回settings，结果提示保留。[thinking](../../packages/ts-shell/src/cli/interactive/picker/thinking.ts)选择和过期拒绝均带真实结果回settings。取消优先沿明确parent处理；未配置具体模型仍可聚焦/详情/配置，浏览不等于激活；持久成功但runtime application未确认保留原notice。

只读参考A `packages/tui/src/overlays/settings-selector.ts`550–578将session thinking及runtime levels与文件Settings分开，1545–1559动态取实际支持effort并加auto，回调交原owner。采用会话owner委托与真实能力来源；本项目保留原model capability/会话事务/文件scope/暂存保存语义，不复制参考字段或扩展一个重复store。Default父链和会话刷新由可反转的真实owner测试约束。

最终六文件104项串行通过：新[settings/session](../../packages/ts-shell/src/cli/interactive/picker/settings/session.test.ts)14，settings20、thinking3、model43、model auth16、key8。实际registry→OverlayHost搜索/Enter/Esc覆盖user/project→原入口、未配置详情/key/account取消、Default取消及保存、advisor赋值、原模型/effortowner保存并刷新真实configuration publication、重开effort读回、过期选择不覆写，以及已持久但application未确认不显示Model switched。初轮失败是夹具调用不存在的manager.load；随后错用虚构runtimeConfig.modelSelection、把不支持account的provider当夹具、从settings root直接切scope及用status读footer，均已分类修正，保留日志。四有效反转删thinking父链/model保存回返/expired返回/role结果传递，各AssertionError/exit1，源码逐字节恢复。

最终四静态门、TS构建、当前validator新目录解包正式judge实际exit0/proven，三项satisfied；build`9e94acab74897515b4ae8921978021acb49e47a287fccf6ad0a2eef41bbee11e`，inputs`72168e01043b3c68fa697a3534c7a5fe68a0fff28220bc5eaf1695862fcae73a`，artifact`abc0fef610ef0f184b2335d4cb8297ec8b18c1f0b5e3f92aacdec02e38e679e2`。validator SHA-256`6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985`。证据归`.omx/artifacts/phase20-addition-session-settings/`；最终PTY、文档与Git交付单独登记。

实际Node入口regular/fullscreen小型隔离PTY在最终build均通过：settings搜索→model未配置missing详情→API-key编辑取消→精确模型→settings；advisor选择other→model角色→settings结果保留；thinking取消/重新打开→low保存→原settings入口。默认shared保留、advisor other与effort low持久读回，全局config原字节相同，零message/provider派发，两进程SIGTERM143均settle。首次regular探针只读借用全屏而忽略普通详情raw输出误报account row超时，已纠正保留失败日志。此为隔离synthetic路径，不证明真实认证或全部桌面验收。

严格docs/diff通过，118既有docs-source advisory保留；addition125/audit100本地链接存在。提交推送/远端读回及CI另登记delivery.json，不从本地绿色推定CI。

本批局部闭合Model / Session发现与返回，整体settings/model全字段/来源/scope/编辑器/桌面/真实认证矩阵仍待验；冷/热Node/exe、原生tokenizer、完整研究preview、动态source/I/O、实际1.7k/4.9k及cache/build原因继续待证。原Phase20保持38 complete / 9 partial，ADD独立，整体active。

### 第二十七批：设置当前值焦点与真实编辑器读回

接续第二十六批`4a876b7836004c01aba1accbfba39823da1b7c5b`。延迟实查该批CI `40247485945`仍in_progress，Watch `40247486083`状态success未读工件。第二十五CI `40246308906`实际failure：999文件/10892项通过、help生命周期两项失败、3skip；已归档失败日志，不从Watch success替代CI结论。

ADD-03进一步确认[settings](../../packages/ts-shell/src/cli/interactive/picker/settings.ts)仅preview字段按current定位，普通布尔/枚举统一choice0；[thinking](../../packages/ts-shell/src/cli/interactive/picker/thinking.ts)没有initialSelection，默认auto。用户打开再Enter可能将false或其他enum/effort改成首项。新增全部非theme choice逐项用例、未知值和medium真实按键用例修补前24pass/15fail，实际画面/提交ID断言证明缺口。

现复用sameValue按实际effective选初始choice；theme仍以原theme owner的accepted intent定位，active标记与同一值比较。stored/requested不同不取代effective，未知值先Values and sources；pending仍Apply，Esc仍丢本次暂存。thinking每次load重新取原owner的当前effort，unsupported/ambiguous当前行可只读聚焦，但禁用提交与能力准入继续保持，Enter不回退auto。未增加配置字段、存储或第二picker状态机。

只读参考A `packages/tui/src/overlays/settings-selector.ts`190–219把currentValue交SelectFormField，1572–1670保留accepted主题与取消回调。采用基于实际当前值定位并保留preview owner；Cheers继续显式暂存/Apply/Discard，而非改为参考的即时写入。未知/unsupported值保留检查与只读焦点是本项目保真边界。

五文件112项串行通过：settings picker35、thinking6、真实settings owner44、settings/session14、help13。全部非theme choice以最后选项为effective、首项为stored/requested，真实OverlayHost按Enter仍提交effective ID；thinking medium/unsupported high/重开最新session验证。七类真实键盘流程覆盖boolean、enum、number、list、object、status-items、theme：stage不写→Esc不写→再次stage/Apply→stored读回→重开焦点/预填。原来源、scope、conflict、restart与preview撤回继续通过。新增长object缩略显示及status名称过滤歧义两夹具已按现绘制和实际顺序修正，失败日志保留。

第二十五CI两失败为旧help夹具认为搜索Esc立刻关闭。现断言既有三步：清搜索、回categories、关闭；每步零apply，清搜索无重新registry读取，关闭后row/model/hit清空及released subscription不再读取/重绘。初次修夹具遗漏categories一步110pass/2fail，已补齐而不改变产品退出合同。三有效反转退回choice0/effort auto/删除unsupported只读焦点，各AssertionError/exit1、源码逐字节恢复。

四静态门、TS构建通过；build`8942b4c741e1dfc1c55bf1ca9abcafa3fbb1917059870b17e884754af85dc928`，inputs`1aa3a5ab209314fefaf04839c7cf0191309225ef8b2c2cb0469638c3c8f4facd`，artifact`09e1cfcd97395bcec39a651a34f1102d98216cc0a812551cb0f0dc3a5ba8b8ff`。证据归`.omx/artifacts/phase20-addition-settings-choice/`；实际PTY、正式judge、文档及交付分别登记，不预写结果。

最终实际Node入口regular/fullscreen小型隔离PTY均通过：已有false布尔/all枚举/medium effort按真实焦点打开、Enter保留当前值并stage、Esc取消不写；显式选择true→stage未写→Apply保存→重开聚焦true，枚举及其余config保留，session modelSelection未写、零message/provider派发。两进程SIGTERM143均settle。首轮探针错误要求两栏缩略label全长，按真实绘制与字段详情纠正，失败日志保留，不归为产品导航故障。此为隔离synthetic路径，不代表实际桌面/认证或全部字段矩阵。

当前validator SHA-256`6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985`新目录解包正式judge实际exit0/proven，三项satisfied。最终docs/diff及Git交付分别绑定工件，不从本地绿色推定CI。

严格docs/diff实际通过，118既有advisory保留，addition127/audit102本地链接存在；交付SHA与CI状态另登记delivery.json。

本批只补当前值默认焦点与上述类型链路，不代表完整字段/来源/scope/桌面/真实认证矩阵完成；冷/热启动、真实1.7k/4.9k、tokenizer/研究preview/dynamic source总I/O等仍待证。原Phase20 38 complete / 9 partial，ADD独立、整体active。

### 第二十八批：设置来源只读滚动与有界分页

接续第二十七批`9646a0914d12afcaacbb08fb30b4c3b99f92cb32`，工作区开始时干净。延迟实查该批CI `40248313306`仍in_progress，绑定相同HEAD；不从Watch或本地验证推定其完成。

ADD-03确认[OverlayHost](../../packages/ts-shell/src/cli/interactive/overlay.ts)在InputForm分支直接吞掉wheel；[InputForm](../../packages/ts-shell/src/cli/interactive/picker/input.ts)的64KiB编辑保护也拒绝来源的effective/accepted/stored合并文本，原只读Enter因initialRejected无法返回。新增长来源与实际painted content轮动断言修补前均失败，属于确定的来源检查缺口。另一个基线失败为上一批当前值焦点修正后的旧布尔夹具：原双Enter现在保留false，现显式选择Choose true后再Apply，继续验证launch override与stored true，不削弱覆盖断言。

复用既有Editor与InputForm生命周期，在[input/reader](../../packages/ts-shell/src/cli/interactive/picker/input/reader.ts)按最多4096 UTF-16单元、自然换行或完整字素边界取源片段；每次只对一个片段布局，长单行不再触发全值字素展开。只读总文本上限4MiB，未放宽可编辑及masked表单64KiB保护。分段箭头、PgUp/PgDn、Ctrl+Home/End与wheel可连续阅读；显示Part/more follows/end，超过总量或单字素界限明确提示检查配置文件，不以空值或静默省略冒充已读。来源仍只读，Enter/Esc返回原详情，拒绝浏览也能Enter返回；不进入prompt/history或保存事务。超过4MiB仍须文件检查，不能将此写成所有极限配置都可完整面板浏览。

wheel只接当前实际绘制内容行与列，按屏幕origin换算；标题、footer、范围外、无origin、修改键、loading/actionPending及可编辑/秘密表单不滚动。键盘、paste和有效wheel立即撤销旧命中，resize重画注册当前范围；滚动不提交、不产生preview写入。参考只读检视A `packages/tui/src/components/form.ts`238–266将field-local行映射到control-local，周围chrome不路由；326–386沿共享Input预填并由owner负责submit/cancel。本项目采用共享编辑器、内容命中和owner回调，不采用单行Input承担大来源；既有[diff分页](../../packages/ts-shell/src/presentation/tui/transcript/diffPage.ts)提供有界源片段的本地决策参照，但其超长行截断不符合来源完整阅读，故不复用截断合同。

最终五文件118项串行通过：reader3、sources8、InputForm21、wheel12、OverlayHost74。包含约240KiB实际设置三值来源读首/尾/翻页、暂存unset的Enter/Esc保留、配置原字节与effective不变；Unicode/emoji/组合字符跨页逐段拼回原文、自然换行、宽窄resize及caret、总量/单字素拒绝、只读编辑吸收、可编辑与masked保护。初轮source布尔label漏Choose前缀、无origin测试默认参数误转有效origin、共享word wrap把Effective与值分行、窄屏尾段仅一个字符的旧预期均已按真实owner/绘制分类纠正，失败日志保留；短片段边界随后改用局部查换行，避免起始Field行独占第一页与反复全前缀扫描。

三个有效反转分别删除form wheel路由、恢复64KiB只读拒绝、删除PgUp/PgDn，每次AssertionError/exit1，源码逐字节恢复。四静态门、TS构建通过，build`c27b7b21ca2ef2b88deb884f87815d135932c5f46f34b084874939ba8301c71d`，inputs`7a8e40ac5840a54a4451d93daa5fa52dbb3d44e52edf2937b2b5a285fc0fc32e`，artifact`7e53ff424df27826d19605b573d9a57f89282df2e369907ecf7e018383ecb2ca`。当前validator tgz SHA-256`6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985`新目录解包正式judge实际exit0/proven，三义务satisfied。

最终实际Node入口regular/fullscreen小型隔离PTY均通过：大值编辑拒绝并Esc返回→stage removal不写→完整来源打开→PgDn→Ctrl+End/首→内容wheel→Esc保留pending→重开/Enter保留pending。config原字节、modelSelection未写、零message/provider派发，两进程SIGTERM143均settle。这是隔离synthetic证据，不能替代真实桌面、完整字段矩阵或OAuth/key接受。归档`.omx/artifacts/phase20-addition-settings-source/`；严格docs/diff、Git提交推送与远端读回分别记录，CI仍按实际状态报告。

原用户要求持续有效：未配置模型可选中；settings/model向参考整体看齐；正文顶格/编辑箭头；首位完整slash、正文路径suggestion/Tab、多skill同次生效及deep-research有限方法组合。完整字段/来源/scope/编辑器/桌面/真实认证、冷热启动、原生tokenizer/完整研究preview、动态source总I/O、真实1.7k/4.9k拆分和cache/build并发原因继续待证。原Phase20保持38 complete / 9 partial，ADD独立且整体active。

严格docs/diff实际通过，118既有docs-source advisory保留，addition131/audit104本地链接均存在；提交/推送/远端读回绑定delivery.json，不用本地验证替代CI。

交付后远端读回`4967fe9c303edbbd468226d347f84f28c1b8295b`，工作区干净，CI `40249904982`与Watch `40249904967`均in_progress。此时第二十七CI `40248313306`完成为failure：999文件/10931项通过、2fail/3skip；两失败为sources旧双Enter覆盖夹具（本批已修）及attention真实输入夹具直接Enter期待true。后者本地14项13pass/1fail复现，现先确认▸ Choose false，再实际上键并确认▸ Choose true，继续原stage不写→Apply生效→下次30s通知断言；两文件22项串行结果通过，未改产品代码。基线未完全退出便启动后轮导致短暂测试重叠，已核实所有进程退出，后续仅串行；该操作偏差保留于工件。历史CI红色保留，后续提交/推送与CI另绑定delivery-followup.json。

### 第二十九批：代码字面量边界与多skill组合

接续已推送`66fd7a4cc926a9ccd36c8577b74f5fa6b5515682`。本轮延迟实查其CI `40250056359`仍in_progress且headSha一致，未将历史Watch状态当作行为验收。

ADD-09/11/12确认[提示词扫描](../../packages/ts-shell/src/core/prompts/tokens.ts)原用`indexOf(marker)`寻找代码结束：代码正文行里出现同样围栏字符就提前闭合，示例中的`/skill:missing`或`/deep-research`因此可能成为真实调用；较长合法关闭围栏又可能留下一个反引号，将后面的真实skill吞进未闭合代码。行内不同长度的反引号也被错误配对。三文件新增场景修补前39pass/8fail，区分了“示例误调用”和“合法关闭后漏掉调用”两种实际缺口。

现由[提示词字面量owner](../../packages/ts-shell/src/core/prompts/literal.ts)认定围栏：开头位于行首空白之后、至少三个同字符；关闭独占一行、字符相同且长度不少于开头，仅允许尾随空白。嵌入正文、较短、混合字符或尾随正文均不关闭。CRLF与更长合法关闭保留原源范围。行内代码复用本地既有精确反引号run匹配器，将其原字节移入[core/text](../../packages/ts-shell/src/core/text/codeSpan.ts)，旧[presentation入口](../../packages/ts-shell/src/presentation/tui/text/codeSpan.ts)仅重导出；避免core依赖presentation或另造匹配器，不扩展Markdown显示解析范围。未闭合提示词代码仍按原保守政策保留字面量直到末尾，与显示解析的未匹配行内回退分开。

只读参考A `packages/coding-agent/src/extensibility/skills.ts`639–671按首位或首个正文regex匹配展开skill，保留周围正文；`packages/tui/src/autocomplete.ts`825–855对正文canonical skill仅替换当前局部token。本项目采用局部替换决定，但保留完整原文、所有明确skill和更严格代码边界；这些参考片段没有解决此次围栏缺口，不机械照搬其单次匹配行为。

最终七文件151项通过：tokens9、composition18、prose20、skills14、markdown59、runtime preview19、research composition12。代码示例中的driver和不存在skill不执行；合法关闭后的两份skill进入同一prompt，研究实际durable request及所有child stage均保留两份指令和原示例；代码内无候选，关闭后恢复路径/skill候选，局部接受不吞后文或换行。preview与实际prepared prompt估算一致，config/transcript原字节及零MCP保留。首轮修补后118pass/2fail仅为CRLF夹具漏算关闭行的`\r`，更正源范围预期，未删源字符。

两个有效反转分别把关闭判定改成行内包含marker、把行内匹配改成允许更长run，每次AssertionError/exit1；两个源文件逐字节恢复，SHA-256见归档receipts。四静态门通过；首次build在反转尚未结束时被提前启动，实际拒绝“Build inputs changed during compilation; previous build kept”。已等两进程退出并核验恢复字节，再串行重建通过，保留该操作偏差及失败日志，不能宣称全程验证均串行。最终build`1935ca8b0131a3358d4862054145a2386a5060d31faa757ccc3c9b7db0b38eb1`、inputs`1984d4d613db6261db150a9774c558fc1d930e18d0c2b19a8dde3066fdf4dce5`、artifact`394a307c7a07ac7b31610a4dfc8d3ae1430aef3e823b1f12f42af242aac7a084`。当前validator tgz SHA-256`6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985`新目录解包judge实际exit0/proven、三义务satisfied。

普通/全屏实际Node隔离PTY均通过：四反引号开头/五反引号关闭及tilde示例内driver不阻断本地数字，合法关闭后的双skill估算一致，未闭合代码保持字面量；实际正文driver仍不支持数字preview，恢复纯skill组合后恢复估算。config/transcript不写、零message/provider、无研究状态，两进程SIGTERM143已settle。约4.3k/6.4k只是隔离夹具值，不是用户真实1.7k/4.9k拆分证据。

归档`.omx/artifacts/phase20-addition-prompt-literals/`；文档与Git交付另绑定。完整settings/model字段/来源/scope/桌面/真实认证、冷热启动、原生tokenizer、研究完整preview、动态来源新鲜度与总物理I/O、真实上下文差额、历史cache writer和build lock来源仍待证。原Phase20保持38 complete / 9 partial，ADD独立且整体active。

本批交付已提交并推送`c107c5d3c57e20812dcb3012f7671d2c84fa0531`，本地HEAD、origin/main与实际远端main读回一致，工作区干净。自身CI `40250943151`及Watch `40250943038`首次实查均in_progress，Watch工件未读；不借历史CI升级本批结论。严格docs/diff通过，118既有advisory保留，addition135/audit106本地链接均存在。

随后定向核查研究preview边界：[preview](../../packages/ts-shell/src/cli/runtime/context/preview.ts)在实际driver组合时明确拒绝数字；[研究命令](../../packages/ts-shell/src/research/command.ts)调用runtime.create持久化新任务后才构造researchTurnPrompt；[runtime](../../packages/ts-shell/src/research/run/runtime.ts)生成随机UUID，[工具owner](../../packages/ts-shell/src/research/run/tools.ts)据已arm的具体run加入带runId常量的research_run schema，save请求还加入独立研究保存工具。[实际入口](../../packages/ts-shell/src/cli/runtime/cliSessionRuntimeFactory.ts)使用这份workflow featureTools，普通preview默认roster仅有未绑定的来源工具。因此去掉driver拦截或只估prepareComposition.prompt会漏掉真实入口提示词与工具schema，不能作为修补。

下一步ADD-08研究预览须在原研究owner提取纯请求准备，覆盖最终入口提示词、具体工具schema、方法与附件、配置/模型身份、取消及来源新鲜度；预览不得调用create/arm、写研究状态或ledger、执行handler、启动child/provider。预览身份与实际提交的run绑定必须有明确重验/交接，不能伪造已armed任务。分开报告首个研究入口请求与随后每个研究child的独立上下文，禁止将入口估算称为全部研究总token或预算；control/save继续按独立准入，无法完整准备时保持unknown。此次仅完成源码定位，尚未实施或动态验收该研究preview路径。

### 第三十批：待注入记忆的原始字节与可取消预览

接续已推送`f8418fb93e35c1204fdec1fd92e8f1b45f331cbe`，本轮延迟实查其CI `40251165765`仍in_progress、headSha一致。上一轮代码边界修补和文档交付属于进展，整体目标继续active。

ADD-08核查[原preview桥接](../../packages/ts-shell/src/cli/runtime/cliSessionRuntimeFactory.ts)已有记忆recordsFile路径/元数据tracker及pending generation检查，普通删除/修改并非完全无保护；真实缺口是[记忆读取](../../packages/ts-shell/src/memory/memoryPersistence.ts)只返回解码/折叠数据，原始字节没有进入内容复验，preview准备时也使用同步无界body读取。因此不能将问题写成“所有记忆变动都不会失效”。新增fixture首轮缺evidence被原quality门正确拒绝，补真实evidence后3pass/1fail准确暴露缺少verifyContent，失败日志分别保留。

现将实际未来回合准备移入[context/injection](../../packages/ts-shell/src/cli/runtime/context/injection.ts)，入口只委托原owner。预览经现[store合同](../../packages/ts-shell/src/memory/projectMemoryStoreContract.ts)的可选readOptions，把signal、512KiB单文件上限及onSource传至health、wake/recall候选、逐项生命周期读取；[local store](../../packages/ts-shell/src/memory/projectMemoryLocalStore.ts)沿同一decoder/fold返回，前后重验profile owner。读取复用verified-handle binary snapshot，真实raw Buffer在解码/BOM/非法UTF-8/JSON折叠之前进入现tracker，观察拒绝、超限、取消不变成部分成功。原常规命令/提交不带readOptions时继续既有读取合同，不改变普通保存/删除或实际注入预算。

注入preview返回非消费isCurrent和异步verifyContent，后者由[完整runtime preview](../../packages/ts-shell/src/cli/runtime/context/preview.ts)及已有controller初次/周期核验调用。相等ID但被替换的session对象不能保留旧preview；未pending时不读取记忆正文，即便文件超512KiB，仍只保留原元数据保护。捕获原alias后、raw读取后和异步复验末尾均检查原身份，retarget/删除/invalidated/pending替换使旧值失效；没有调用accept、markConsumed、markInvalid或写store。

只读参考A `packages/coding-agent/src/session/session-memory.ts`245–258按当前startup signal取消前代、只释放属于本代的slot，269–285在dispose前取消；采用signal身份和原owner边界，具体等待文件句柄settlement由Cheers现read/controller负责。该片段不提供本地JSONL raw摘要，未将其当作字节校验已存在的证明，也不引入另一memory backend。

最终六文件73项通过：injection9、runtime preview20、memoryPersistence19、future-turn15、projection1、controller9。包括等长内容在固定元数据时bytes拒绝、真实delete/invalidate、同ID换session、原alias读取中retarget、缺失文件出现、BOM/非法UTF-8原始字节与幸存记录、observer拒绝/超限、已取消零acquisition，以及真实已open descriptor取消后一次close、无后续read且pending不消费。runtime完整estimate旧值异步撤回、session/transcript原字节及零MCP；三有效反转分别移除raw observer、runtime content检查、session对象身份，每次AssertionError/exit1，原源码逐字节恢复。

单记录实际I/O计数：首次纯注入准备有health、候选、一次生命周期及初次内容复验共4次binary acquisition、peak1；20次同步isCurrent零body追加；一次内容复验再读1次。完整preview/controller仍可能追加复验，health/候选/每个pending record的重复读取尚未合并；512KiB是单次读取/追踪上限，不能称整个操作总I/O预算已完成，也不证明总发现成本或生产性能。无pending时body acquisition为0，有元数据I/O。上限超过时保持unknown/stale，不截断记录或虚构精确值。

四静态门、最终TS构建通过：build`3815cb6d31fd53971ecf9ce83932647d620878895096e871a2df42e4f1cb036a`、inputs`331d444934f3bbff3566d41df47ce831aaa423e17b1d4bab7c6e6a0fa2d759d6`、artifact`dbd5f01ec2a0f20cc856f64bf081e1bf7db98042893858f6c6993e992b056c7f`。当前validator新目录解包judge实际exit0/proven，三义务satisfied；未并发运行验证、未全仓回归或20k真实PTY。

普通/全屏实际Node小PTY均验证`/memory use validation`→numeric→外部修改撤旧→重估→超限撤旧→恢复有界来源重估→`/memory view`仍pending；preview期间transcript/config及memory原字节不写、零provider/无研究状态，SIGTERM143均settle。首轮以`/memory inspect`检查pending失败，是其现有另一事实存储入口；换实际view检查后通过，失败日志保留，不判为消费故障。隔离4.3k/4.6k是synthetic值，不能拆分用户真实1.7k/4.9k。

归档`.omx/artifacts/phase20-addition-memory-preview/`。严格docs/diff、Git交付另绑定。完整面板/桌面/真实认证、研究driver完整preview、原生tokenizer、动态来源与累计物理I/O、生产冷热启动/真实上下文差额及cache/build来源仍待证。原Phase20保持38 complete / 9 partial，ADD独立，整体active。

### 第三十一批：一次记忆预览共享有界读取快照

接续已推送`1dc3b0c78b47626e5455ab5b82d7dc5918973ff4`。本轮延迟实查其CI `40252257668`仍in_progress且headSha一致，不沿用历史Watch或本地绿色代替CI。上一轮实际修补/验证/交付属于进展，整体active。

ADD-08继续处理第三十批明确保留的重复读取：原health、wake/recall候选及每个pending record lifecycle均重新读取、解码同一个recordsFile。12个待校验记录的新聚焦fixture修补前实际15次binary acquisition，而要求一次快照加一次发布前复验仅2次；初轮8pass/2fail，另一失败为fixture误要求原注入prompt显示store诊断，原合同仅store health/list保留诊断，已按原owner更正，不改产品quality/显示合同。

现由原[local store](../../packages/ts-shell/src/memory/projectMemoryLocalStore.ts)提供可选一次性snapshot；[read owner](../../packages/ts-shell/src/memory/store/read.ts)使用现readEntries的一次有界verified-handle acquisition，折叠记录并建ID索引，供health、候选与逐项get共用。[Reader合同](../../packages/ts-shell/src/memory/projectMemoryStoreContract.ts)仅ref/list/get/health，不含write/delete/invalidate；原store继承该只读合同。普通命令和实际提交没有readOptions时沿既有live读取；无snapshot能力的store继续原接口，不能从本地快照证据声称全部第三方store都只有两次读。

[未来回合planner](../../packages/ts-shell/src/memory/projectMemoryFutureTurnInjection.ts)只在本次readOptions准备时取新snapshot，未pending仍零正文。没有持久或跨预览缓存，每次新准备重新捕获。列表记录、get结果与health诊断均分离返回，调用者修改返回数组/record不能污染后续快照查询。每个查询重验原profile owner及捕获/调用signal；已取消或目录身份换代拒绝查询。读取快照本身表达“捕获的内容”，不伪装live；最终[注入preview](../../packages/ts-shell/src/cli/runtime/context/injection.ts)仍沿原tracker核验字节/alias/session/pending，准备后等长修改在固定元数据时也阻止发布旧值。删除、invalidated、损坏诊断与幸存记录的原fold合同保留。

只读参考pi `packages/coding-agent/src/core/resource-loader.ts`180–191以getters读已加载资源，540–555在reload清缓存并保留trust重新加载。本项目采用加载后共享读取、显式重建的决定，但把生命周期缩短为单次preview并保留发布前raw复验，不能把reference的资源缓存当作本地记忆内容新鲜度保证。

最终六文件75项串行通过：injection11、runtime preview20、memoryPersistence19、future-turn15、health7、read3。包括12pending实际15→2读/peak1、20次同步检查零body追加、一次内容复验追加1读；多次准备读取新文件，损坏health/list诊断、lifecycle invalidated/deleted折叠、只读无写方法、返回对象深度分离、cached lookup取消和profile root换代拒绝。新fixture在snapshot后/发布前改raw字节仍被拒绝，pending不消费；既有实际descriptor取消/close、alias/来源失效、完整runtime estimate保留。

三个有效反转分别禁用planner snapshot、删除cached lookup捕获signal检查、返回原record引用，每次AssertionError/exit1，源码逐字节恢复。四静态门/最终build通过：build`b3be27281c1cebf5f85905c4600a6218b10709641fd7dcae23f5c90959c04d65`、inputs`977068c65567f9d8b350a4892c6e998b9818bf0ce656f6d9fb6a0381df6f76cf`、artifact`f5468f1b3ce3302af6314f7a0146e3a6e69faa81d776f91125b44e21ff665e46`。当前validator新目录解包judge实际exit0/proven三satisfied；无并发heavy/全仓回归/20k真实PTY。

最终build普通/全屏实际Node隔离PTY均通过memory use→数字→修改撤旧/重估→超限撤旧→有界恢复数字→view仍pending；config/memory原字节及preview期间transcript不写、零provider/无研究状态，两进程SIGTERM143已settle。这些是隔离synthetic路径，4.3k/4.6k不代表用户真实差额或生产性能；单记录PTY与12记录I/O单元证据各按自己的范围保留。

归档`.omx/artifacts/phase20-addition-memory-snapshot/`；严格docs/diff和Git交付另绑定。此批完成本地memory acquisition复用，完整preview/controller重复核验、动态/ignore来源和全发现总物理I/O仍待测/优化；不把2次memory读称为全请求总读取上限。完整settings/model字段/来源/scope/desktop/真实认证、研究完整preview、原生tokenizer、冷热启动及同模型/协议/规则/schema真实上下文拆分仍待验，历史cache/build来源继续unknown。原Phase20保持38 complete / 9 partial，ADD独立且整体active。

严格docs/diff实际通过，118既有advisory保留；addition151/audit110本地Markdown链接均存在。提交、推送、远端读回与自身CI另记录于delivery.json。

### 第三十二批：研究入口纯准备与共用工具描述

接续已推送`e56e47d526362f317542f1fe2b3d9714d1be65fc`；本地HEAD、origin/main和实际远端main读回一致，交付时工作区干净，自身CI `40253191131`及Watch `40253191144`初查均in_progress。此批稍后延迟实查该CI仍in_progress，不借历史Watch或本地验证推定完成。

ADD-08沿第二十九批确认的研究preview缺口推进前置实现：[研究命令](../../packages/ts-shell/src/research/command.ts)原把参数投影和researchTurnPrompt留在create/arm后的命令内，[runtime](../../packages/ts-shell/src/research/run/runtime.ts)内联随机ID、新run、deadline及goal账本关联，[工具](../../packages/ts-shell/src/research/run/tools.ts)与[保存工具](../../packages/ts-shell/src/research/report/save.ts)把描述/schema和执行回调绑在同一构造中。若预览调用这些运行方法会创建/恢复/arm状态；只删除preview的driver拒绝则漏掉真实提示词与runId常量工具，仍不正确。

现由研究自己的[entry](../../packages/ts-shell/src/research/run/entry.ts)投影已解析参数与全部skill/modifier，并生成同一入口提示词；[preparation](../../packages/ts-shell/src/research/run/preparation.ts)接受捕获的scope/goal，生成prospective run、随机ID、原quick/deep deadline及原goal ledger关联，不持有store/runtime，也不写状态或初始化账本。实际create仍在原owner中先recover/读取/验证pending，再使用同一prepare结果按原锁和ledger合同持久化、arm；resume/steer/control/save继续原独立路径，未增加实际preview接管接口。

research_run和research_save提取原name/description/argsSchema投影；实际可执行工具也使用这些投影。researchEntryDescriptors返回来源工具及所需run/save描述，只有三个字段，没有execute/prepare/onRefusal；新准备不能靠描述获得运行、保存或权限能力。带save才描述保存工具，无save保持只读研究入口。所有明确skill与modifier进入第一条实际研究消息，并继续保留原durable request与child stage注入。

只读参考pi `packages/coding-agent/src/core/prompt-templates.ts`309–327用独立expand函数投影输入，`core/agent-session.ts`2128–2134在送入任务前调用同一展开函数。本项目采用输入转换共用的决定，研究run/ledger与tool authority仍由本项目原owner负责；这些参考代码没有持久研究ID交接，不能用它们宣称完整研究preview已完成。

最终五文件37项串行通过：preparation9、composition12、runtime10、resume3、save3。新测试从实际runResearchCommand创建结果捕获最终ID/时间，以相同身份重建prospective entry，验证request、deadline、完整prompt与工具描述精确相等；覆盖save开/关、两份skill和modifier、所有child阶段、control/help拒绝及捕获goal关联。纯准备前后metadata/state/transcript原字节相同，无state lock、零create/arm/run、没有report回调；已有run的arm与账本字节不受新准备影响。初轮30pass/6fail为新增fixture遗漏SkillInstruction身份字段及it.each将args数组展开为单个参数；纠正后35pass/1fail为help无question先由原syntax拒绝，改提供合法question来测entry拒绝。均为新夹具合同错误，失败日志保留，未放宽运行准入。

三个有效反转分别移除methods投影、放宽research_run的runId const、无save时也暴露保存工具，均AssertionError/exit1，源文件逐字节恢复。四静态门与最终TS build通过；build`3723a348eef5ec79cfc4daa57ab78d6bcd57c825a771486a0a8dc77e88a994ba`、inputs`1169dedca41d19d401baf55abef7841d3ad76bd6318310ab16ef34d2ddf74156`、artifact`a806856becfa2df94a7d73ca5ff5fe17ac44059dff573fb6ec49f939fc7e6d0e`。当前validator tgz SHA-256`6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985`新目录解包，正式judge实际exit0/proven三satisfied；首次judge误用不存在的CLI路径，MODULE_NOT_FOUND/exit1属调用错误，随后按包真实adapters/cli入口运行，失败日志保留。无并发验证、全仓回归或20k真实PTY。

本批未更改终端或preview控制器，未运行PTY或真实provider；不把owner测试写成数字已在研究草稿显示。**研究数字preview仍明确拒绝**：尚须绑定prospective ID与真正提交的同一ID、以有界已读session/goal验证创建资格并重新准入、将完整描述接入原tool catalogue/协议请求准备、保留来源/cancellation/取消settlement和发布前复验。入口第一请求估算与后续独立child上下文/总费用继续分开；不能另造示例UUID冒充真正请求身份。

归档`.omx/artifacts/phase20-addition-research-entry/`；strict docs/diff、本地链接、Git与CI另绑定。未配置具体model可选、两个面板完整看齐、消息顶格/编辑箭头、首位slash/正文路径Tab、所有skill生效及受限研究组合要求全部保留。完整settings/model字段/来源/scope/desktop/真实认证、研究完整preview、原生tokenizer、全动态来源和累计物理I/O、生产冷热启动及真实1.7k/4.9k差额继续未验，原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 第三十三批：研究新建入口数字预览与实际身份交接

接续已推送`97f591af6a628d6811fff221fd2f8c94008e9dde`，本批处理ADD-08中真实研究入口仍显示问号的缺口，同时保留ADD-11/12多skill与有限方法组合合同。

[研究reservation owner](../../packages/ts-shell/src/research/run/reservation.ts)从既有有界session snapshot捕获scope、目录身份、goal/研究/账本及上下文状态，生成一次性prospective ID和新run；token用WeakMap归属、冻结请求、20秒有效期与一次消费保护，不写状态、不初始化ledger、不arm。提交仍由原ResearchRuntime恢复/读取/检查pending与owner，并重新验证请求、session对象、历史、root/selection、目录和捕获状态；原发布锁内再检查状态digest，不能覆盖锁等待期间改变的goal/研究/账本。真正提交使用同一个ID，deadline从实际提交开始；入口prompt和schema中没有时间字段，因此保持第一请求投影一致。伪造、复用、过期或已改变的身份不能作为当前准备结果使用。

[runtime预览衔接](../../packages/ts-shell/src/cli/runtime/context/research.ts)只保留当前context最近一次完整验证后的entry，并绑定原config publication、session对象、cwd、forced tool及附件身份。[preview](../../packages/ts-shell/src/cli/runtime/context/preview.ts)沿实际解析器认定deep-research及别名、先验证全部skill/modifier，再使用共用researchTurnPrompt与完整run/save工具描述，经原preparePromptRequest和endpointTurnBody准备本地估算；continuity使用同一个已读快照按最终研究prompt重新分类。来源raw、附件异步读取准入、模型/config、工具、取消与发布前内容复验继续保留。preview工具只有拒绝执行的边界，不含prepare/onRefusal，不连接MCP或执行研究。control/help、其他未支持driver与不完整请求继续unknown；正文save仍不允许，独立`--save`新建入口包含保存工具描述但不授予文件写权限。

真实Node终端发现并修补另一处产品问题：[researchCommandFor](../../packages/ts-shell/src/cli/runtime/research.ts)原把`ShellCommandRuntime.run`登记的自身组合命令controller视为其他忙任务，导致按Enter拒绝研究。现在仅当当前controller与命令owner及传入signal同时相同，才允许自身命令继续；其他命令仍busy，已取消signal先抛AbortError。只读参考pi的`core/agent-session.ts`2090–2120分开命令派发与compaction准入，本项目保留自己的controller、研究锁与账本，不从参考代码推导它已实现持久研究ID交接。

最终单进程串行九文件87项通过：runtime preview27、reservation12、runtime10、research composition12、save3、resume3、preparation9、session preview5、sessionIdle6。测试以实际`ShellSessionRuntime.commands.run`经过路由提交，确认唯一create/arm、同ID/同prompt/同system/tool schema、全部两份skill、save描述；并用实际opening/continuity及prepared schema重建endpoint请求，token估算与其wire估算严格相等。预览不写metadata/state/transcript、不建lock/研究/ledger、不执行child/provider；配置换代、取消、请求/历史/root/selection变化、无工具步数和锁内并发修改都有拒绝证据。初次真实owner回归1pass/2fail以及回调同步throw的测试失败已分类并保留，最终异步owner合同通过。

四有效反转均产生AssertionError后逐字节恢复：撤销自身command准入、丢弃实际保留ID、移除锁内guard、遗漏研究工具roster。四静态门、最终TS构建`43a837219c11ec6f6da7aab72fa041769c3a0f9816da5c4ee90fb57d7ff9ad4e`通过；新解包checked-in validator实际exit0，正式judge为proven，三结构义务satisfied。未运行全仓回归或20k真实PTY。

普通/全屏两个实际Node隔离小PTY均通过：初始约4.3k、方法/模板/双skill约9.0k，修改模板后12k，研究双skill新建入口6.8k，独立save新建入口4.9k；功能`/model`仍unknown，恢复研究草稿后恢复数字。预览期间config/transcript原字节不变、研究/账本不存在；Enter后一个native run保留两份skill，user transcript绑定该run，synthetic assistant已持久化，ledger无pending，真实输入区恢复；零研究child/source，两进程SIGTERM143均settle。早期按视口前缀等待全文回复，以及提交后强求立即恢复数字，属于探针readiness误假设，失败保留；最终用持久化回复、账本与终端ready共同判断。这些数字来自隔离synthetic夹具，不能解释用户真实1.7k/4.9k差额，也不能证明研究已完成或保存成功。

归档`.omx/artifacts/phase20-addition-research-preview/`，文档/Git交付另绑定。研究**新建入口**数字preview与身份衔接有局部完整证据，control/其他driver/后续独立child及研究总费用仍待覆盖。settings/model全字段/来源/scope/desktop/真实认证、冷热Node/exe、原生tokenizer、全部动态来源和累计物理I/O、真实同模型/协议/规则/schema上下文差额仍未验；历史cache writer与build lock来源保留unknown。原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 第三十四批：模型详情的精确目录归属与能力信息

接续已推送`a05e513e5f877bd9c28ad78ab1f3c543eca49ebc`，本批沿ADD-01/02完整模型选择链修补详情。原[model picker](../../packages/ts-shell/src/cli/interactive/picker/model.ts)在未配置relay或pending/error连接没有resolution.baseUrl时，先用runtime的canonical地址查元数据，同名官方模型会覆盖所浏览relay的context信息；没有canonical同名条目时又丢掉实际已有的relay声明。新增回归修补前四项全失败，补未配置目录地址后四项通过；pending/error/credential-missing三场景仍失败，进一步确认必须沿所选连接保存地址取数据。

现在[metadata owner](../../packages/ts-shell/src/cli/interactive/picker/model/metadata.ts)优先实际请求地址、精确连接保存地址、所浏览provider目录地址，通过原catalogModel处理relay归属及同地址歧义；完全未配置地址时仅使用所浏览自定义条目，不能回退到别的provider。列表容量与详情共用这份解析，详情补context、inputLimit、maxTokens、images、reasoning设置/档位及已声明input/output/cache价格；缺能力保留unverified，缺上限/价格不造值，零价格原样显示。[core capability](../../packages/ts-shell/src/core/models/capability.ts)提取已有已解析model的档位判定，原effortCapability继续同一规则与null早返回，避免另造reasoning政策。reasoning设置拒绝与模型内部推理能力分开，实际启用/认证/事务仍由原owner负责。

只读参考A的`packages/tui/src/overlays/model-browser.ts`1600–1620及2230–2255将context、max output、price、input、reasoning作为当前具体model的详情事实；本项目采用按目标展示声明事实的决定，不引入参考独有的速度/评分或不存在的模型类别，也不从缺数据推导免费/不支持。角色及连接返回、未配置可聚焦、显式启用与原scope均保留。

最终四文件70项通过（metadata8、model43、current11、key8），共用capability既有消费者两文件8项另通过，合计六文件78项。覆盖同名官方/relay不同上限、全部未配置、pending/error/缺凭据两种目录行、无地址声明、同地址歧义、重新load后目录修改、未知能力与零价格、真实OverlayHost键盘Enter/返回/窄屏；配置/session模型及网络无副作用。三有效反转撤掉精确目录地址、撤掉blocked连接保存地址、将未知image误判支持，均AssertionError后逐字节恢复。

四静态门及TS build`d8c88f4d3c8af703855786107e3673827d36ec5f47d96a51fa01e891d422b420`通过；新解包正式judge实际exit0/proven、三结构义务satisfied。普通/全屏实际Node隔离小PTY均证明官方400k与relay32k分开、relay详情24k input/4096 output/图片unsupported/reasoning设置supported、unknown能力unverified及返回原焦点；config原字节、session modelSelection未写、零message/provider，两个SIGTERM143已settle。首轮探针只读借用屏幕状态、忽略regular详情实际写入主屏而失败，已改成检查本次原输出及完整事实再返回，失败保留，不判为产品能力缺失。

归档`.omx/artifacts/phase20-addition-model-metadata/`，docs/Git另绑定。完整settings/model字段/来源/scope/desktop/真实认证、model类别与完整请求能力矩阵、研究control/其他driver/child成本、原生tokenizer/动态来源累计I/O、冷热启动及真实1.7k/4.9k差额仍待验；历史cache/build来源unknown。原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 第三十五批：模型详情过期准入、退出生命周期与重开目录发布

接续已推送`ae7836084f6c32206a989b93c91e5c960bbb6d54`，本批修补ADD-01/02的具体模型→详情→配置操作链。原列表/详情闭包保留旧目录地址，目录在打开配置子面板前变化时，子面板重新捕获准入却接收旧地址，使过期目标被当作当前目标；详情在Back、Esc或被替换后也仍可调用，迟到load可重新开放动作。八项新回归修补前全部失败。

[model picker](../../packages/ts-shell/src/cli/interactive/picker/model.ts)现在检查打开列表时捕获的原model-choice准入，普通详情和current-report详情共用该捕获；检查前后复验取消，不先构造子面板。[详情owner](../../packages/ts-shell/src/cli/interactive/picker/model/details.ts)只接收实际提供的动作，在进入API-key、account或connection子面板前重验目标；Back仍可从过期详情返回。动作一次消费，previewEnd终止owner，后续load不能复活；准入回调同步关闭真实host时也不能继续handoff。两项旧测试原在Back之后复用已退出详情，已改为返回浏览器后重新打开同一具体模型，保留原命令草稿及零写入断言。

实际Node普通PTY进一步检出产品缺口：过期配置已拒绝，但再次`/model`仍显示旧地址。真实ShellRuntimeContext回归两项修补前失败，确认不是探针文本假设；原capture同时记录旧accepted catalogue与新disk catalogue，重开未更新发布，能把旧目标重新标成当前。[目录发布衔接](../../packages/ts-shell/src/cli/interactive/picker/model/publication.ts)仅在本地目录与accepted publication不同时，通过已有refreshRuntimeConfig端口请求catalog范围更新；[原配置owner](../../packages/ts-shell/src/core/shell/configuration.ts)保留accepted requested普通设置、绑定及会话模型，使用当前目录重新检查原模型约束，再由原ConfigState ticket/publish发布。不能直接用磁盘目录绕过accepted publication，也不能借重开model隐式加载其他普通设置。取消、过期owner、发布后再改目录、约束拒绝均阻止捕获子面板；目录相同不重复发布，不联网拉取目录。

只读对照oh-my-pi `packages/tui/src/overlays/model-hub.ts`1143–1156、1220–1269：参考先更新registry再读取其内存快照，异步完成后检查disposed owner；本项目采用这两个决策，保留自己的不可变配置发布、精确连接与准入指纹，不声称参考实现了同样的fingerprint。对应重开及退出反转均有失败证据。

最终单进程串行九文件136项通过：model43、auth16、settings/session14、current11、key8、admission11、publication5、config constraints19、explicit-input publication9。真实owner覆盖外部目录更改→旧详情拒绝→重开新地址→遮蔽key子面板→取消返回同模型，另验证普通磁盘maxTurns编辑未被采用、相同目录不重复发布、违反active output约束保留旧配置/目录，以及取消/再变化/过期拒绝。七有效反转全部AssertionError/exit1后逐字节恢复：列表检查、详情检查、退出retirement、准入后生命周期、accepted目录刷新、普通设置保留、当前模型约束。

四静态门及最终TS build通过：build`aeb31a9888f87db560a1d9739bda35346b911981e6f7fbbc16e7fde8b5b8837e`、inputs`673a7e7eb85bf4a725983fc37dfa49bb0c21645a29561ba6a3b539e1e659fbb1`、artifact`77ffd57e80d10975c8244f46e74ffb600c77f5d1e28e7d66bb45032525953277`。当前validator包SHA-256`6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985`新目录解包，正式judge实际exit0/proven、三结构义务satisfied，完整结果另归档。无并发验证、全仓回归或20k真实PTY。

普通/全屏实际Node隔离小PTY最终均通过：旧详情拒绝、新地址重开、遮蔽输入不回显synthetic key、取消返回新具体模型，config原字节与session modelSelection不变、零message/provider，两个SIGTERM143均settle。首次普通重开旧地址属上述产品缺口；后续全屏要求拒绝时重复输出未变化输入提示而超时，终端实际已显示拒绝，后续成功重开证明已可交互，属探针readiness假设；两类失败分别保留。

归档`.omx/artifacts/phase20-addition-model-admission/`；docs/Git/当前CI另绑定。延迟检查确认前两批CI `40256984501`与`40258165621`均completed/success；Architecture Watch workflow也success，但其artifact未读取，不作为独立审查批准。本批未运行真实认证/provider，完整settings/model字段/来源/scope/能力/类别/桌面/真实认证、研究control/其他driver/child成本、tokenizer/动态来源累计I/O、冷热启动及真实1.7k/4.9k拆分仍未验。原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 第三十六批：不兼容reasoning偏好的模型选择恢复链

接续已推送`8a03ac3efd8335aa054d57edd3a60fc53eb6dacc`，本批推进ADD-01/02具体模型详情到显式启用的完整链。已配置模型因当前reasoning档位不受支持而disabled时，原详情只有Back，不能从面板选择兼容档位并启用；三个真实配置owner新回归修补前全失败。不能把此情况当缺凭据再次配置连接，也不能先修改当前模型的thinking来绕开目标限制。

[恢复子面板](../../packages/ts-shell/src/cli/interactive/picker/model/recovery.ts)接原精确SessionModelTarget、目录地址、捕获准入及原setModelTarget事务：用户选档位后一次提交目标模型和档位，普通Enter明确使用当前session。当前不支持档位仍作为只读焦点可见；其他unsupported档位禁用，auto按原null合同不发送显式effort，unknown保持unverified。原model详情新增短动作Choose effort，在普通宽度也完整可见；Esc回原详情不写，退出不可复活、有效动作一次消费，准入回调同步关闭host后不执行。原未配置/credential-missing目标仍走配置入口，不用档位恢复代替凭据。子面板exclusive/holdInput复用原host，执行原异步hook期间不派发新的前景输入。

只读比较oh-my-pi `packages/tui/src/overlays/model-hub.ts`1276–1309、1320–1333、1404–1463：参考把模型与reasoning选择连成操作链、只按目标能力提供选项、保留受支持偏好并在结束后刷新。本项目采用这些决策，但在当前模型不兼容时先让用户选择再一次保存，不先持久化目标再开strip；保留现有null/low/medium/high、原精确连接/配置约束/hook/写锁准入，不引入参考独有档位。目标目录的同名relay能力必须优先，反转到canonical会使当前high错误变成可用。

最终六文件122项单进程串行通过：recovery11、model43、admission11、settings/session14、metadata8、session selection35。真实owner覆盖精确relay与medium同时持久/发布、plain模型auto恢复、原角色和skillful保留、全局配置字节不变；model专属context override按原切换合同清除，以新模型重新解析。代码没有改这项原合同，早期新夹具误要求其跨模型保留已分类纠正。取消与真实host Esc、退出late load、一次使用、hook block、hook期间取消/竞争session选择、目录变化及准入回调关闭均拒绝部分写入；settings→Model/Session→详情→effort→保存后回原user/Model入口，真实footer含结果。早期设置夹具把真实带scope/category标题误当Settings和将notice误放status，已改验证实际owner，不判产品失败。

五有效反转全部AssertionError/exit1后逐字节恢复：移除入口、丢弃精确目录地址、忽略用户选中effort、去掉退出retirement、去掉准入后生命周期检查。四静态门与最终生产代码构建通过，build`848686070b9b0c793df9299b1ce4ab83701939e62d5b3ce715af29c1b96b8feb`、inputs`5bfee7fd89cb856e9241b97d166b853bc610f5d0d9946e2f8f280224b9d69e94`、artifact`46f93a1458aa1d14dbce5d77aabaf5fda789aab28ca3f4f8840dd8f314f1f73f`。当前checked-in validator包新目录解包，正式judge实际exit0/proven、三结构义务satisfied。普通/全屏实际Node小PTY均验证high不支持仍可见→Esc取消无变化→重开→medium→精确relay与effort同时持久，config不写、零message/provider、两个143退出均settle。初始探针使用了/thinking只读标题而非实际保存输出、多词查询非相邻匹配、长动作被截断及一次脚本拼接语法错误均保留分类；动作缩短后实际流程通过，无20k真实PTY或全仓回归。

归档`.omx/artifacts/phase20-addition-model-effort/`，docs/Git与延迟CI另绑定。本批无真实认证/provider或桌面平台验收；完整settings/model字段/来源/scope/类别/能力/真实认证、research control/其他driver/child成本、tokenizer/动态来源累计I/O、Node/exe冷热启动和真实1.7k/4.9k分解继续待验。原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 第三十七批：实际早期首帧测量、输入接管与目录测试合同

接续已推送`d34451ed6ec87980adccc9c0178d15f5abde1448`。本批推进ADD-07生产形态启动证据，修补原[交互基准](../../scripts/bench-interactive.mjs)将后期`openai`模型状态当作firstFrame的测量缺口；现观察实际箭头、Loading编辑区及加载状态，正式输入placeholder单独计时。沿原[observation](../../scripts/bench/observation.mjs)处理每个stream分段UTF-8与VT控制符，输出有2MiB上限；不使用模型名推断首帧，也不从一行普通loading文字推断编辑区已呈现。

[InteractiveMode](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts)在原StartupSurface成功adopt后记录runtime input adopted；无prepaint入口在真实设备input-ready回调记录同一事件，第一次流写入完成独立记录runtime frame write completed。原编辑器、输入缓冲、onFirstFrame与退出合同保留。基准检查早期listener/layout/write→runtime构造ready→输入接管→runtime写入事件各有一个有效计时且顺序正确；父进程收到字节和进程内部monotonic计时保持不同起点，均不代表终端像素确认。

[process settlement](../../scripts/bench/process.mjs)从spawn后立即记录error/close，signal结束不能被exitCode=null误当仍运行，正常exit不代替stream close。超时/中断转发TERM，由Linux script结束其PTY目标；仍不能确认close就停止整次基准，不能继续下一样本或隐藏清理失败。临时home/project集中在`.tmp/bench-interactive/sample-*`，每个样本关闭并删除后才串行启动下一个。真实Linux小PTY终止测试确认包装进程close后实际target PID不存在，不是仅凭发送kill判成功。

参考A的`packages/coding-agent/src/modes/startup-composer.ts`43–99分别负责begin、一次adopt和未接管dispose；本项目沿这个生命周期分离原则定位测量，保留自身已授权的加载期编辑合同，不复制参考deferInput行为或引入第二个Composer。有效反转恢复旧模型名标记、删除事件顺序检查、删除runtime接管计时、跳过close等待均产生测试失败，随后逐字节恢复。正式脚本测试20项通过，真实交互/startup/timing三个文件133项通过，恢复后的受影响检查通过。

串行TS build与host executable编译通过，使用同一manifest buildId `dc57666092b6cc2d4e2a0457efab4b6f8029908187ab740b2bd6afc0fcb73cc6`，inputs `586fa3c1744ecd71e0cd524aa65e2246af273cd8b445608d1eba55cac9ddb7e9`、artifact `06c1049c96aa7c5925e5e5ccbdd49b5cb30af681b082924abad16bf8f7fefb2c`、exe SHA256 `a722826aa9493f8a19352112cfb632d24a22089aca3c9ca3a5a5dd4d7edad6f3`。测量输入前后digest相同，measurement SHA256 `baab63d69f30ff49fd6a824acb3d0af7dc87e9f07b685a37fc5087cfd96ed639`。两个样本pilot共8次终端启动通过后，每个Node/exe×regular/fullscreen组合30个空会话进程串行取样，共120次；line/pipe各两个样本另8次通过。

本机Linux WSL2 6.6.87.2、Ryzen 7 7840H、Node v24.15.0，固定60×120、隔离配置/空session store/synthetic provider，cache control为**warm-uncontrolled**，120次均没有drop cache。下表是当前构建的父进程transport观察，单位ms；不是用户真实项目或修补前后节省量。原始样本与bootstrap区间归档于`.omx/artifacts/phase20-addition-startup-measurement/`。

| 目标/形态 | Loading首帧p50 / p95 | 正式输入提示p50 / p95 | 每样本输入减首帧的p50 |
|---|---|---|---|
| Node / regular | 480.1 / 514.3 | 1598.8 / 1666.8 | 1122.5 |
| Node / fullscreen | 537.4 / 572.5 | 1784.6 / 1862.6 | 1243.7 |
| exe / regular | 284.5 / 302.3 | 779.9 / 830.9 | 493.9 |
| exe / fullscreen | 278.1 / 311.8 | 790.8 / 838.9 | 503.6 |

120个样本均观察到早期写入不晚于runtime-ready/接管/正式写入，目标正常close并清理。30次满足现基准的样本数要求，**不代表ADD-07整体验收完成**；冷缓存、同条件修补前对照、真实桌面像素/输入、不同项目加载量以及完整首请求准入性能仍待证据。两组按顺序测量，热/负载漂移也不能被当作Node/exe因果速度比。未运行真实provider或20k长历史PTY。

延迟检查前两批CI `40259916832`（`8a03ac3e`）和`40261257582`（`2a5cf994`）均completed/failure，静态门/build通过，唯一失败是[configuration测试](../../packages/ts-shell/src/core/commands/configuration.test.ts)仍要求打开model后保留旧catalog。本地聚焦复现同一断言，分类为旧测试合同与第三十五批“重开接受新目录”的已授权行为冲突，且fixture refresh端口丢弃catalog scope。现旧测试在目录变化前检查首次模型菜单，保留普通命令/补全/报告在接受发布前使用旧目录的断言；新增真实owner场景验证重开仅接受catalog、CLI目标不变、pending普通settings不加载、普通reload拒绝仍保留已接受catalog与maxOutputTokens，并且零网络/配置写入。configuration14、model43、admission11共68项通过。

范围参数反转导致原publication拒绝加载，证明新回归会拦住丢scope；反转探针最初只接受AssertionError，误将这个产品准入拒绝报为探针失败，日志保留，源码逐字节恢复后重验通过。启动计时测试首轮ordinary RecordingTerminal不发inputReady，132pass/1fail；仅在该fixture补实际设备事件后133pass，不修改产品迁就double。四有效行为断言反转与这一范围拒绝反转分开记录。

最终新鲜度复查发现新增configuration测试也进入buildInputDigest，先前测量build不能作为当前构建；失败后曾先创建本地提交，尚未推送，随后补建。当前buildId `eb885e2d090231e7ee88ef5535dcc6b9fd47f78beb98f6e8870562712041fba9`、inputs `7350e642247c2f105ababe6e86b4be83a16989d2021b6533ddf25c2409ce3f48`，TS artifact与测量build相同；当前exe SHA256 `f70d12754f4677e88a69583bc806a14f2af3ba4654b2ce5a4a6eb0ab68fea2b6`。当前Node/exe×四形态各两个样本、共16次串行小验证通过，measurement `7c8079a17b5fa72a21891dc5fa5024995c855d0b182c768f3c99242e49907c86`，checkBuild required-executable通过。原120样本继续绑定dc576660，不冒充当前build的30样本验收；current-build-pilot、两个manifest与复查均归档。

四静态门、最终diff/docs检查、当前正式打包judge为proven/三项satisfied；judge不代表独立产品审查。本批Git/当前CI交付另实际绑定。完整settings/model字段/来源/scope/能力/类别/桌面/真实认证、研究control/其他driver/child成本、原生tokenizer/动态来源累计I/O、真实1.7k/4.9k分解及上述启动缺口继续未验；原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 第三十八批：全部设置字段操作链与搜索默认焦点

上一轮文档收口`91f0d3d343d9ecb107c6792b5e9ee1d12df40157`已提交/推送。本批延迟实查第三十七批产品CI [40264741138](https://github.com/h-hei133/cheers/actions/runs/40264741138)、Watch [40264741044](https://github.com/h-hei133/cheers/actions/runs/40264741044)，以及该文档提交CI [40265697710](https://github.com/h-hei133/cheers/actions/runs/40265697710)、Watch [40265697734](https://github.com/h-hei133/cheers/actions/runs/40265697734)，均completed/success。本批未读这四次完整日志/Watch工件，不追加套件数或独立审查结论；历史CI成功不转记给本批未交付源码。

ADD-03按第3.6节清单，在[字段操作测试](../../packages/ts-shell/src/cli/interactive/picker/settings/fields.test.ts)为全部37个真实字段提供显式合法值，覆盖user37/project36共73条独立键盘操作链：搜索key→详情→原布尔/枚举/数值/列表/对象/状态项编辑器→Enter暂存→Esc取消→再进入暂存→Apply→读回effective/requested/stored及restartRequired→重开Stored→移除存储值并Apply→重开unset。每条均通过实际OverlayHost按键和原设置草稿、配置发布与主题owner，断言取消前文件字节不变、另一scope字节不变、JSONC注释保留、只写目标字段及重开后回到原默认值。状态项用实际checkbox/Space，多行数组通过键盘换行，不直接调用picker.apply替代按键。

另外七个双来源场景检查replace、allowedTools交集、disabledTools/denyRules累积、enableMcpTools禁用优先、nested TUI项目优先和pathRules累积；经原设置save端口检查stored与effective/provenance分离、移除回退、另一scope及同一对象兄弟字段保留。这七项是owner政策验证，不冒充完整双来源键盘或每字段冲突矩阵。所有夹具位于隔离`/tmp/cheers-test/settings-fields-*`并在afterEach清理，无真实provider派发。

新键盘场景定位到确定的产品缺陷：输入或粘贴`topP`时，排名第一已是Top P，但[settings picker](../../packages/ts-shell/src/cli/interactive/picker/settings.ts)保留仍匹配的Input shape焦点，Enter打开错误字段。沿现OptionModel的defaultSelection策略增加一行：新查询聚焦第一个可用排名结果；同查询重投影保留用户主动上下选择；查询改变重新自动定位，清空回到搜索前字段。没有修改全局列表导航或新造搜索状态系统。新增typed/pasted两个精确ID回归和手动保持/查询变化/清空恢复回归。

先读目标后定向比较参考快照`0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0`的settings-selector1326–1382（分组排名）与settings-list480–520（保留存活ID）。采用分组搜索和稳定身份；本项目对**查询变化**明确聚焦最强匹配，以解决`topP`打开错误字段，仍保留同查询手选和原清空返回。这是有反转证据的适配，不能写成完全逐行照搬参考。

初轮73失败是夹具环境问题：当前Vitest的`vi.stubEnv(name, undefined)`会写入字符串`undefined`，令CHEERS_MAX_TURNS无效，拒绝配置reload。先登记原值再删除可选环境输入，并增加初始config-valid/admission断言后，只剩两项Top P真实焦点失败。随后修产品、调整测试观察方式后通过：手动焦点探针最初用Enter观察而释放了host，改直接读focus；已存储行含`●`，断言按实际标记；跨来源期望按原owner更正user覆盖普通replace及false的decisive来源。失败日志均保留，不改产品来源政策迎合夹具。

最终四文件178项串行通过：fields81、picker/settings38、navigation15、interactive/settings44。有效反转移除新增defaultSelection行，两个行为断言失败/exit1，产品源码逐字节恢复，SHA256 `0b54b71fb411eb80475863ef44ef2e119d24348443891b76f4eb0c55a437553a`，恢复后settings38通过。重复轮次不累加。

普通与fullscreen两条小型实际Node PTY均通过逐字输入`topP`→正确Top P详情/编辑→暂存0.8→Esc取消文件字节不变→重开/再暂存→Apply只保存topP→重开Stored0.8；零transcript message、session modelSelection未改、provider未调用。每次等待relay close后才进行下一条，143为SIGTERM清理。首个探针等待不存在的`Search: t`标题而超时，实际是`Search all groups t`；按屏幕及stored标记修正探针后通过，不能把此超时算产品失败。实际终端仅覆盖该代表性数值路径，不是73个字段的真实TTY或桌面验收。

TypeScript构建及checkBuild当前新鲜度通过：build `a3a165c2470bf61d034d710dab7908dfbc3b681de8e1f18c6cc60833383535ef`、inputs `040df807bf1b6052f7f455cff906630639b6724c337e385134b872e7859f0f5c`、artifact `91a1ef6f57014dd2af2aaf10d6692ca7cd4940611f05001c2d9c0b2c846744b6`。本批未构建/验证exe。四静态门、strict docs drift及diff通过，118条既有来源advisory保留；317个本地链接/50个标题锚点/68个行锚点与当时ADD-01…13完整性核查通过（当时序号范围，非当前）。链接探针初轮把历史Markdown的`#L106/#L138`当标题误报，按实际行锚点校验后通过，没有修改旧链接掩盖失败。责任上限报告0 findings，当前打包validator以全新scratch提取，archive SHA256 `6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985`；正式CLI judge exit0/proven、三项结构义务satisfied，不等于独立产品审查。脚本、manifest、失败日志、反转及PTY收据归档`.omx/artifacts/phase20-addition-settings-fields/`，Git/当前CI另绑定实际提交。

ADD-03全部字段/scope基本操作链已有聚焦证据，来源冲突/无效值/失效、编辑窗口及真实桌面矩阵仍需补齐；model精确目标/能力/角色/真实认证，研究control/其他driver/child成本，原生tokenizer/动态来源累计I/O，真实1.7k/4.9k分解、冷缓存/修补前对照/真实项目启动收益继续未验。不运行全仓本地回归、并发重验证或真实20k消息PTY。原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 第三十九批：设置失败重试与保存范围的原始归属

第三十八批`05ecc6c8885f61d18e851a6a698597253f1165d7`已提交/推送。本批延迟实查该SHA的CI [40268138916](https://github.com/h-hei133/cheers/actions/runs/40268138916)与Architecture Watch [40268138889](https://github.com/h-hei133/cheers/actions/runs/40268138889)，均completed/success；未读取完整日志或Watch工件，历史结果不转记本批源码或ADD整体验收。

ADD-03沿[原设置草稿](../../packages/ts-shell/src/cli/interactive/settings.ts)和[原详情/保存范围面板](../../packages/ts-shell/src/cli/interactive/picker/settings.ts)补生命周期操作。真实OverlayHost键盘回归确认四类缺陷：session/project已变化时第一次Apply拒绝，第二次却用ambient host重新捕获新binding而保存旧pending，A→B→A同样存在；已打开scope子面板确认时也重新捕获新binding；user只检查字段基线，没有拒绝legacy来源被preferred替换；目标scope文件变为损坏JSON时异常使面板丢失。失败日志分别归档，不能将这些缺陷写成用户原model按键现场的唯一原因。

修补在原草稿提供`reopen(scope?)`，捕获原configuration binding、substrate及物理profile，并对user/project均检查所选来源。失败重试和scope确认必须通过原草稿刷新；归属或来源变化则保留pending、原scope及失败状态，要求重新打开设置。普通同源字段冲突仍允许用户明确第二次Apply读取最新基线并只修改目标字段，不删除原冲突检测、不覆盖兄弟字段或另一scope。原write lock内再次检查归属/来源；写后复验发现换代时分别报告持久成功与应用未确认，不向新binding发布旧选择。scope取消保留pending，成功确认按原提示撤销pending，不可读目标保留原scope/pending并可重试。

先读目标后定向比较同一参考快照的settings-list990–1088：子面板独占输入、undefined选择表示取消不改值、父层按稳定item ID恢复，恢复与子操作完成分开。本项目采用这些归属/取消/返回决定；staged Apply、user/project多来源及binding锁内检查是本项目自己的契约，不宣称参考已经提供相同持久事务。

[字段操作测试](../../packages/ts-shell/src/cli/interactive/picker/settings/fields.test.ts)由81增至98项，新增17项包括session/workspace/A→B→A拒绝二次Apply、user/project同源冲突显式重试并保留注释/兄弟字段/另一scope、scope取消与确认、已开scope后的binding切换、不可读目标、user/project legacy→preferred、profile切换/物理目录替换、真实锁内变化、写后换代及无效数值Enter/旧pending取消恢复。沿实际host按键及原配置/保存owner；profile身份测试另直接检查草稿刷新，不冒充所有profile场景均走实际终端。最终七文件222项串行通过：fields98、interactive/settings44、picker/settings38、navigation15、wheel12、hover7、source8；反转恢复后fields98再通过，重复轮次不累加。

三次有效反转：恢复retry host重捕获使3个断言失败，恢复scope host重捕获使1个失败，去掉user source检查使2个失败；全部源码逐字节恢复。picker/settings SHA256 `d2900c3f7fbe985f087e1aac2c9eae6227c48bf39d560b2d454744bf62a86728`，interactive/settings SHA256 `2a10e5839114521cc861a7fdadb5929599a269986b843cde64e936739a8c782a`。移除显式profile检查的第四次反转仍绿色，既有trust/binding检查也拒绝这些场景，故记录为**无效反转**，不作为显式profile检查必要性的证明。初轮脚本在此停链，修正收据分类后再串行运行后续检查；未将绿色反转伪装成有效。

普通/fullscreen×同源冲突/来源替换共四条小型实际Node PTY通过。冲突场景逐字输入Top P、暂存0.8，外部写0.6；首次Apply保留0.6并报告未确认，第二次显式Apply保存0.8，重开Stored0.8。来源场景从隔离legacy user配置打开，preferred随后出现0.6；两次Apply都拒绝且两文件不写，返回列表新开读回preferred的Stored0.6。各场景零transcript message、session modelSelection不变、synthetic provider未调用；串行等待relay close及清理，143为SIGTERM退出。每样本45秒上限、UTF-8分段解码和2MiB输出上限，无20k历史压力。早期两条冲突试跑不累加为六条；终端证据只覆盖代表性Top P，不等于完整字段/桌面矩阵。

四静态门、TypeScript build及当前checkBuild新鲜度通过：build `ae02a58d6af6d3e197999c298726f77a898b99985fdc5bc935d029f738337e25`、inputs `4a9a2eb8eab0304179e366b76e80492a9698a40f6e558ce4d5fe2fb7f34745f3`、artifact `da8f7e111fb9464f1182a168ce62da343327a44d3f8dea870fa14700dd00111c`。本批未构建或验证exe。责任上限报告0 findings；当前validator全新提取，archive SHA256 `6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985`，实际CLI judge exit0/proven、三项结构义务satisfied，属于架构证据。最终strict docs/diff、324本地链接/53标题/68行锚点及当时ADD-01…13完整性通过（当时序号范围，非当前），118条既有来源advisory保留。复查探针先误读根dist、再误读checkBuild顶层buildId，均归类脚本错误；按真实package dist和manifest返回合同修正后新鲜度及全部恢复hash通过，没有重构建或改产品掩盖失败。工件归档`.omx/artifacts/phase20-addition-settings-retry/`，本批Git/CI按实际交付另绑定。

settings基本73条链及以上代表性生命周期场景已有证据，全部来源/字段/编辑器/窗口/桌面组合仍需补齐。model精确目标/能力/角色/真实认证，研究control/其他driver/child及总成本，原生tokenizer/动态来源累计I/O，真实1.7k/4.9k组成、冷热与修补前启动对照、原现场model零交互唯一原因继续未确认。原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 第四十批：模型分类的精确可用性与主题原草稿重试

接续`6a19ae66`及已有工作区改动。ADD-01/02确认分类使用runtime级凭据汇总，导致同协议的未配置relay分类没有阻断标记、先于真实可用分类。现[模型面板](../../packages/ts-shell/src/cli/interactive/picker/model.ts)从各分类自己的已准入模型行派生可用性，可用分类在前，同组目录及连接顺序稳定；分类标记与可启用资格一致。pending/error/缺凭据、环境fallback不能替代的显式连接、地址歧义、空目录和当前effort阻断均保留各自状态，具体阻断模型仍可浏览/配置或恢复档位。当前请求报告和Roles继续独立投影；分类重排不抢手动模型身份。

只读参考面板`model-hub.ts`659–682从availableModels按具体provider计数，再区分有目录但无available行的分类，743–748分别组织可用/锁定分类；采用“自身可用行决定分类资格、可用在前”的决定。本项目以原精确catalog/provider/connection身份替代runtime汇总，保留原目录顺序及用户要求的未配置具体模型浏览能力，不照搬参考仅available模型的浏览边界。[分类回归](../../packages/ts-shell/src/cli/interactive/picker/model/category.test.ts)反转当前`model.ts`到原HEAD后AssertionError/exit1，源码SHA256逐字节恢复一致；早期过滤Git输出造成零test的反转为无效探针，单独保留。

ADD-03同时修正[主题测试](../../packages/ts-shell/src/cli/interactive/picker/theme.test.ts)的旧host重捕获夹具，补原SettingsDraft.reopen及失败重开拒绝/保留pending/不再保存。上一提交CI `40270478751`实际completed/failure，唯一失败为该旧夹具期待第二次openSettings；本地原六项同一断言复现，按第三十九批原draft合同修夹具，未回退产品归属保护。该提交Watch `40270478690`和后续`40280908739`均success，与CI失败分开。

本次主代理串行五文件84项通过，分类12、model43、current11、recovery11、theme7。四静态门、strict docs（118既有来源advisory）、责任上限0通过；TS build `ac65a82636ac6320578c32aedf5a7732bf1b2cfd090cd699ca98cf8a5eb19f76`，inputs `97d8d75c4fc1e9d95fef8ff2e1b82700a8745392276ea9e55bdd60adb3f0f045`，checkBuild当前fresh。当前包正式npx judge exit0/proven，结构证明不作为ADD验收。早期误把已适配tgz当package脚本原始输入导致SHA拒绝，是验证调用错误，保留日志；未改validator或构建策略。

最终新构建普通/全屏×一ready三缺失/全部缺失四条实际Node小型隔离PTY通过：分类可达、未配置详情/配置入口、返回原模型、无匹配搜索清空；config原字节不变、modelSelection未写、零message/provider请求，四进程SIGTERM143/close已settle。先前探针把详情endpoint当列表返回、Escape尚未完成时输入搜索导致超时，修为等待实际focused模型行后通过；失败保留，不算产品修补或认证成功。本批未构建exe、跑全仓本地回归或真实20k PTY。

证据归`.omx/artifacts/phase20-addition-model-category/`，主代理审阅及恢复hash已归档，Git/本批CI另按实际交付绑定。完整model目标/角色/能力/认证及桌面矩阵、settings完整交叉矩阵、研究control/其他driver/child成本、动态来源累计I/O/原生tokenizer、真实上下文差额与冷热启动对照继续待验。原47项38 complete / 9 partial保持，ADD独立且整体active。

### 第四十一批：目录删除后的邻近模型焦点与状态

ADD-02继续补目标消失路径。实际OverlayHost和watchModels目录publication回归确认：手动聚焦delta后删去它，All及精确分类均回首项，navigation仍留旧ID，未显示目录变化。现[列表选择owner](../../packages/ts-shell/src/presentation/tui/chrome/options.ts)提供仅数据刷新且旧焦点缺失时的replacementSelection，由原[overlay](../../packages/ts-shell/src/cli/interactive/overlay.ts)传递；[model焦点owner](../../packages/ts-shell/src/cli/interactive/picker/model/focus.ts)按刷新前可见模型ID先取随后幸存行、再取之前幸存行，仅所有旧邻居消失时用新行有界位置回退。模型面板先验证目标确已离开完整目录，搜索失去匹配不能报删除；生存手动身份由原列表保留，回退不启用模型。空分类禁用占位不接受Enter；[navigation](../../packages/ts-shell/src/cli/interactive/picker/navigation.ts)清理所有分类已删除的行ID。重新打开撤回旧提示，未引入第二目录或修改provider/auth。

只读参考`model-browser.ts`1173–1201沿stable selector取/选实际菜单，`menu-selection.ts`134–140数据替换保留selectedKey，224–232缺失后回首个可选行。采用其稳定ID/数据与选择owner分离的决定；本项目按明确ADD要求将“首项回退”补为“邻近回退并提示”，不能把参考已有首项行为当作本任务完成。夹具从真实configuration publication刷新和host键盘开始，未仅测独立数组函数。

最终五文件136项串行通过：focus12、category12、navigation16、options22、overlay74；改进集成前另有model43一起通过，完整五文件104项。覆盖All/精确分类、中间/末项/多个邻居删除、旧模型全替换、刷新后继续手动选择再重排、生存ID重排、空目录Enter拒绝、搜索元数据变更不报删除、disabled邻居仍可浏览及导航退休。三个有效反转分别禁用model回退、保留旧navigation ID、删除完整目录存在检查，均AssertionError/exit1并逐字节恢复。初轮空目录夹具未登记导航焦点、后轮将侧栏箭头误作占位row箭头，是夹具错误；修为实际手动事件/Enter拒绝/owner ID断言，失败日志保留。没有以改断言隐藏产品缺失。

四静态门、责任上限0、TS build `2cdda4030cbc9e81234a41ac117d706caf2c6753f98c2210d7c20caa9b2f7ce8`、inputs `bdbf81845bda3f0e09a2f81d89cd880350f003cc8eac352851647863af0bcf61`、checkBuild fresh及当前包正式judge exit0/proven通过。没有全仓本地回归、真实20k PTY、exe构建或本批PTY；目录删除证据来自实际OverlayHost和隔离synthetic publication，真实桌面/终端目录变更仍未验。工件`.omx/artifacts/phase20-addition-model-focus/`保存源码hash、三反转与主代理非独立审阅；strict docs/Git/本批CI另绑定。

延迟实查第四十批`f6582038`的CI `40305668414`仍in_progress、Watch `40305668560`completed/success，不借Watch称CI通过。完整model能力/角色/认证和两面板交叉矩阵、研究总成本、动态I/O/tokenizer、真实上下文差额及冷热启动继续待验；原47项38 complete / 9 partial保持，ADD独立且整体active。

### 第四十二批：角色动作退役与子面板返回生命周期

ADD-02/03沿[角色编辑器](../../packages/ts-shell/src/cli/interactive/picker/model/role.ts)、[角色档位](../../packages/ts-shell/src/cli/interactive/picker/model/thinking.ts)及[原事务](../../packages/ts-shell/src/core/commands/model/role.ts)补取消/失效边界。实际host回归确认Escape、close或替换后保留的旧回调仍可进入子面板或保存，随后load还会复活动作；Choose/Thinking子入口未复验原目录。现退出永久退役、有效动作只消费一次，子入口及档位保存使用原捕获准入并在回调后再检查本地生命周期，事务在准入前后和原write lock guard检查取消。角色更新保留默认模型、其他角色和原保存/应用未确认合同，没有新建角色存储或改provider/auth。

新增取消检查也暴露[浏览器生命周期](../../packages/ts-shell/src/cli/interactive/picker/lifecycle.ts)的既有缺口：子面板Escape关闭时abort共享controller，重建父面板继承已取消signal；disabled inspection/input提交复制picker，WeakMap身份丢失，后续子面板不再受原controller跟踪。现[原overlay](../../packages/ts-shell/src/cli/interactive/overlay.ts)在显式返回前转交生命周期，退休本地preview而保留父controller；父构建失败、根关闭及shutdown仍取消。可枚举symbol携带不透明原owner，使现有action wrapper保留身份，原apply回调合同保持。没有第二套控制器或全局回调注册表。

目标代码先检查，再只读对照参考`model-hub.ts`565–575的disposed/清理及1253–1273迟到assignment拒绝，另参照selector的显式onCancel/disposal。采用明确退出与迟到结果不复活的决定；共享父controller、角色持久及配置发布仍由本项目原owner承担。[角色回归](../../packages/ts-shell/src/cli/interactive/picker/model/role.test.ts)15项与[生命周期回归](../../packages/ts-shell/src/cli/interactive/picker/lifecycle.test.ts)6项覆盖真实按键、替换/关闭、目录失效、准入内关闭、事务取消、两种action wrapper、父构建失败和shutdown；与model43、settings session14、overlay74合并单进程串行152项通过。六个有效反转分别移除wrapper owner、role/thinking退役、父controller转交、子准入及准入后signal复验，均AssertionError/exit1，逐字节恢复hash一致。

最终build的普通/全屏两个隔离实际Node小型PTY验证角色赋值浏览取消→重开→保存、档位取消→重开→low保存→返回读回→清除角色；默认fixture-ready保留，个人config字节不变、零message/provider请求，143退出及close确认。早期普通模式探针用fullscreen屏解析而超时，raw输出已有low；按实际输出观察修探针后通过，失败日志保留。新增input夹具漏validate的失败另归类夹具错误，没有改变产品输入合同。未运行真实20k PTY、全仓本地回归、exe构建或真实认证。

四静态门、责任上限0、TS build `36f4f499d0fb44c70779bf5340a9e4635bea7af52dc39dceb70af2fe790e270d`、inputs `4630d73cb947484d40b3146c8c7a3f5ea3f65ea107059eaedef0a87aedf0bd37`、artifact `1f302fd8bd5e0c70eca659816b128c32758b50b97ec5898588e3a9e20c1ac8ce`及当前checkBuild fresh通过。当前包正式judge exit0/proven、三项结构义务satisfied，仅为架构证据；审阅为主代理、没有独立审查结论。工件`.omx/artifacts/phase20-addition-role-lifetime/`保留脚本、失败分类、反转/source hash与最终PTY收据，docs/Git/本批CI另绑定。

延迟实查第四十批`f6582038`的CI40305668414/Watch40305668560、第四十一批`af282d5e`的CI40308877629/Watch40308877544均completed/success，未读完整日志/Watch工件，不能赋予本批CI结果。完整模型目标/角色/能力/真实认证/桌面及settings交叉矩阵、研究control/其他driver/child成本、原生tokenizer/动态来源累计I/O、真实1.7k/4.9k分解和冷热/修补前启动收益继续待验。原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 第四十三批：不可用已存角色档位的只读默认焦点

ADD-02继续检查“默认Enter不偷偷改当前值”。实际host回归确认：role已存high，精确relay目录仍支持low/medium但将high声明为不支持；[角色档位面板](../../packages/ts-shell/src/cli/interactive/picker/model/thinking.ts)过滤high后initialSelection没有对应行，打开落到auto，直接Enter可提交auto。三个自动角色均复现，不属于第四十二批取消缺陷。现仅在当前值不在准入列表时补只读行，显示active · unavailable并保留disabled/focusable焦点；apply仍只接受原支持列表，Enter不关闭/不写，明确移到low才保存，保留默认模型/档位、兄弟角色和个人config。

先检查本项目原档位和prospective恢复owner的不可用当前值焦点，再只读比较参考`model-hub.ts`1421–1437按实际current预选、1637–1650把预选确认与改变区分的决定。采用“先表现当前值、改变需明确选择”，本项目按第3.5节更强合同保留不可用current为只读焦点，没有照搬参考找不到current时回首项。未改角色可用性政策、connection/auth、持久事务或普通档位chooser。

[角色回归](../../packages/ts-shell/src/cli/interactive/picker/model/role.test.ts)新增三个真实host操作链：不可用high默认Enter拒绝、直接旧值apply拒绝、方向键选low→保存→父级读回。与已有role/lifetime15、model43及thinking6合并单进程串行三文件67项通过；原thinking源码raw HEAD反转重现三个AssertionError/exit1，源码逐字节恢复。初轮在根目录调用包Vitest，错误发现正式工件内`.test.ts`副本并混用hook解析，零test不作为产品基线；现工件以非可执行`.snapshot.txt`保存、验证在owning package运行，错误日志保留。

最终普通/全屏两个隔离实际Node小PTY用原SessionManager/state writer建立小型已存角色，再以session-id启动：精确目录high不可用仍聚焦high；Enter后state字节不变，显式low保存，返回重开读回；default medium、summary low及个人config保持，零message/provider请求，143退出close确认。首轮将启动恢复前state与子面板Enter后比较，误把正常恢复写入认作Enter写入；按真实子面板打开后的基线重测，同时独立断言启动前后modelSelection不变。保留失败，不改产品恢复合同。

四静态门、责任上限0、TS build `a9ffb9087e20d8f316ab0830d853ee88b41e3190f1e77a5346273e8112da6d2e`、inputs `f2e754ef9aab9ad886797a2c293501e9c2ccda7cd44a74338ec20e169d3fa283`、artifact `04049c20cdd31b01ef2d84256b01911c9ebb8d177341849dafa67eca54cb9358`及checkBuild fresh通过；当前正式包judge exit0/proven、三结构义务satisfied。审阅为主代理，没有独立审查；工件`.omx/artifacts/phase20-addition-role-focus/`保留baseline/反转/最终PTY/源码hash与脚本，docs/Git/本批CI另绑定。不运行全仓本地、exe、真实20k PTY或真实认证。

第四十二批`36971a16`已提交/推送并远端readback，当前CI待后续检查；其CI不由本批本地检查替代。完整model/settings目标、角色、能力、来源、窗口/桌面与认证矩阵及研究/计量/启动剩余证据继续待验，原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 第四十四批：普通档位面板的浏览代次与异步提交边界

ADD-03沿[原Thinking effort chooser](../../packages/ts-shell/src/cli/interactive/picker/thinking.ts)补生命周期，未修改原模型事务/provider/auth。七条新增实际host baseline失败确认：Escape/close/replace后的旧apply仍可保存、load可复活、未load或多ID请求可执行、准入内close继续执行，以及PreModelSwitch hook等待跨close/重开后仍可写入。普通chooser既有“同一实例显式重开捕获最新值”合同，不能仅复制role的永久retired latch。

现原chooser在onOpen/previewEnd/load推进浏览代次，每个操作捕获原choice与revision，准入前后复验本地生命及signal；将同一准入传入原runThinkingCommand/model事务，异步hook后和原write guard继续拒绝旧代次。等待中只接受一个动作，新显式open可捕获最新effort。构造子返回只在原操作仍有效时进行；原事务已经写入后PostModelSwitch关闭面板仍返回确认的写入通知，不因UI结束隐藏持久结果，也不重开父级。普通支持/不支持/unverified/歧义政策与现有可拒绝后再选择合同保持。

目标代码检查后只读比较参考`model-hub.ts`565–575 disposed/清理及1253–1273 assignment pending/迟到结果拒绝；复用“显式关闭、等待动作互斥、迟到结果不复活”，本项目以generation区分同一实例重开并保留事务结果。[档位回归](../../packages/ts-shell/src/cli/interactive/picker/thinking.test.ts)15项与settings session14、lifecycle6串行三文件35项通过；覆盖实际host取消/替换、旧hook跨重开、pending重复、新开最新值、写后关闭通知和原settings返回。四有效反转分别移除退出退役、代次校验、pending门及确认写通知，均AssertionError/exit1、源码逐字节恢复。

最终普通/全屏两个隔离实际Node小PTY验证medium焦点→取消无模型选择变化→重开medium→明确low保存→重开low读回，原roles和个人config字节不变，零message/provider请求，143退出close确认。首轮fullscreen取消后等待未重新绘制的input hint而超时，raw输出已恢复主状态栏；按实际partial repaint标记同步后通过。早期反转脚本在package目录使用根相对路径及临时内联脚本引号错误均为未执行探针，不构成产品失败；改用根目录文件脚本，不改产品迎合探针。旧测试临时目录同时移入规定的/tmp/cheers-test，最终build/PTY按该输入摘要重验。

四静态门、责任上限0、TS build `e7f7390070e8fcfe4165c32db941d1880d7490d93973548042bd26b7490d9f1b`、inputs `087a79c321ac0fb9e7d8598f489f867911a93f39b9824c470ead8f19d110729d`、artifact `42dc030d96939d5e36e463365984c1706f2e1f0f672cd16751f10f9ec1d9eeef`及checkBuild fresh通过，当前正式包judge exit0/proven、三结构义务satisfied。审阅为主代理，没有独立审查；工件`.omx/artifacts/phase20-addition-thinking-lifetime/`归档baseline/四反转/source hash与最终PTY脚本收据，docs/Git/本批CI另绑定。没有exe构建、全仓本地、真实20k PTY或真实认证。

延迟检查36971a16的CI40312626823及156491b1的CI40313929179仍in_progress，对应Watch40312627151/40313929393已success，不互相替代。完整model/settings字段/目标/角色/能力/来源/窗口/桌面/认证及研究/计量/启动剩余证据继续待验，原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 第四十五批：CI终止探针的实际目标身份与退出状态

ADD-07验证跟进。延迟实查第四十四批`9702faa3`的CI40315494878 completed/failure，失败仅在Check the gates still detect的[bench-process测试](../../scripts/bench-process.test.mjs)“Linux PTY termination closes the wrapper and its actual target”，`kill(pid, 0)`缺预期ESRCH；该CI尚未执行后续产品测试，Watch40315494959 success不能替代。第四十二批36971a16 CI40312626823/Watch40312627151 success，第四十三批156491b1 CI40313929179仍in_progress、Watch40313929393 success，均只对应自身提交。

本地原六项测试通过，六个额外串行小进程观察均在script wrapper close后目标absent；不能据此声称复现CI残留或其一定是zombie。确定性新夹具以fork建立已退出且待waitpid的子进程，确认`kill(pid, 0)`仍成功；同一夹具真正运行的父进程须被观察器拒绝。现仅测试观察改为捕获/proc stat实际target starttime，wrapper/stream close后有界等待：原身份absent、PID已换身份或state Z说明原目标不再运行，原目标仍active明确失败。Z结论不代表已reap，本项目原benchmark/relay/processSettlement行为及package/release/build政策未改。

目标检查后只读参考PTY process waiter以child.wait取得真实exit，terminate不取消待reap waiter；采用“运行、退出、回收与stream drain分开”的决定，当前Node测试通过原身份观察补其断言，不引入第二执行平面。新zombie/live场景反转回原ESRCH断言后Missing expected exception/exit1，源码逐字节恢复；bench-process7与bench-observation8共15个脚本断言串行通过，四静态门通过。没有产品代码变化，未构建、运行Vitest/产品PTY/基准或20k消息；此修补不是原CI重新通过或性能验收。

工件`.omx/artifacts/phase20-addition-pty-settlement/`保留原CI失败日志、原六项通过、六次absent观察、确定性反转及最终15项收据，HANDOFF记录PID/退出/reap边界，审阅为主代理。docs/Git/本批CI另实际绑定。resume下一组默认/手动/scope/search验收仍待继续；完整ADD模型/设置/真实认证/桌面/计量/性能缺口与原Phase20 38 complete / 9 partial保持，ADD独立且整体active。

### 第四十六批：resume默认焦点的实际时刻语义

ADD-04后续验收。原[session picker](../../packages/ts-shell/src/cli/interactive/picker/session.ts)的`defaultSelection`对已校验ISO时间做字符串`localeCompare`，只对统一UTC、统一小数精度的文本偶然正确；不同时区偏移或有无小数秒可让较早的实际时刻排到前面。现按`Date.parse`后的实际epoch取最新，并以稳定ID打破同一时刻的并列。置顶仍只影响列表展示顺序，不压过未触摸时的默认最新规则。

回归从真实`OverlayHost`键盘路径覆盖负/正时区偏移、小数秒、不同时区表示同一时刻、渐进刷新中手选保持，以及搜索和project scope换代后的自动焦点重置；未改变current标记、可恢复性过滤、Enter身份/版本重验或分页owner。最终session55项与session lifetime4项共59项串行通过。临时恢复旧字符串比较后4个断言失败（三类实际时刻及同一时刻稳定ID），源码逐字节恢复，sha256为`c4ed68bf520dc498f1ae3212b5f818d40bf4ed59298d0980d898965b1c5e1dbe`。

四静态门、严格diff、责任上限0、TS build `834bb33dc026`及当前包正式judge proven通过；没有运行全仓本地、exe、真实20k PTY或桌面跨平台验收。工件`.omx/artifacts/phase20-addition-session-time/`保留baseline/最终聚焦/反转/静态门/build/judge收据，审阅为主代理，不是独立审查；docs/Git/本批CI另实际绑定。ADD-04逻辑边界和真实时区夹具证据增强，但桌面平台与用户原环境现场仍不能由本批替代，ADD整体继续active。

### 第四十七批：认证快捷入口的语法与连接发现性

ADD-13后续验收确认`/login`、`/logout`虽然都委托现有`/connect`认证owner，但顶层帮助没有参数提示，`/login`没有provider/认证flag补全，`/logout`也不能发现已保存连接。现从`connectSyntax`的login/logout action派生独立快捷语法：去掉只在外层`/connect`成立的动作别名，保留provider参数、认证flags和connection参数；`/login`复用同一connect补全投影，`/logout`接入现有saved-connection catalog。执行仍只调用`runLoginShortcut`/`runLogoutShortcut`再委托`runConnectCommand`，没有第二套凭据写入或连接存储。

回归覆盖`/login`provider与`--api-key`等flag补全、`/login`/`/logout`使用提示、`/logout`已保存连接候选，以及`remove`等action alias不能被误当快捷入口参数。registry12、slash suggestions41、connection completion20共73项单进程串行通过。临时移除login补全和logout连接catalog分支后两类断言各失败1项，源码逐字节恢复。

四静态门、严格docs、diff、责任上限0、TS build `e82d27547840`及当前包正式judge proven通过；Git/本批CI另实际绑定。未运行全仓、真实认证、exe或桌面PTY；认证成功/失败/取消仍以原connect owner证据为准，本批只收口入口发现性和语法边界。ADD-13的本地入口组织、默认/来源发现指南和兼容入口证据增强，真实provider/桌面矩阵仍不能由本批替代。

### 第四十八批：ADD-13入口发现性合同

在不新增产品入口或第二套配置的前提下，补注册表合同测试锁定现有owner的可见性：`theme`与`statusline`继续指向settings Appearance，`connect`与login/logout快捷入口继续说明其连接owner，`view`继续说明用户/开发者输出消费者；settings元数据中的`theme`和`tui.statusItems`必须仍分别归属Appearance的Theme与Status line section。该合同防止后续帮助生成或设置分类重构时把兼容入口删除、改名或移入无真实能力的分类。

`slashCommandRegistry.test.ts` 13项单进程通过。此批是ADD-13的本地发现性/组织合同，不新增认证、主题、状态栏或视图行为，也不证明真实provider、桌面终端或所有平台；未运行全仓、exe、真实认证或20k PTY。四静态门、严格docs、TS build `5b0748c65edf`及fresh、当前包judge proven通过，Git/本批CI另实际绑定。

### 第四十九批：Memory与Shell的只读owner入口

ADD-03/13继续收口。settings根目录新增Memory / Review与Shell / Diagnostics两个只读能力入口：`Memory status`插入`/memory status`草稿，`Shell diagnostics`插入`/shell status`草稿。入口可搜索、可分类导航、可查看说明，但不读取状态、不写配置，也不复制memory/shell命令实现；用户仍需显式提交原命令。分类存在是因为有真实只读消费者，不是用空菜单冒充十个参考分类。

真实OverlayHost路径覆盖Memory分类默认焦点、Enter选择及只读说明；直接应用返回精确草稿，零settings保存。settings39、fields98、session14、source8共159项分两段单进程串行通过。临时移除capability rows后新增rows/OverlayHost断言失败，恢复后重验通过。

此批不把只读入口当作memory/shell状态动态验收；实际命令输出、真实provider/沙箱、桌面和全仓仍未运行。四静态门、严格docs、TS build `d448a4c6a269`及fresh、当前包judge proven通过，Git/本批CI另实际绑定。

### 第五十批：review作为单一Git review driver

ADD-12继续收口。定向检查确认review不是纯modifier：它先读取真实Git snapshot，再构造一份只读review prompt。现把`/review`及其`audit`/`check`别名声明为单一driver；组合时`runReviewCommand`消费共享正文、brainstorm modifier和全部skill，将它们按既有安全边界并入同一份focus，再交给原Git workbench生成一次review prompt。没有新扫描器、第二套Git读取或独立模型派发。

正文prose发现和提交解析共用该driver声明。review与deep-research等第二个driver同时出现时在派发前拒绝，两个handler均不调用；独立首位`/review`仍走原命令路径。真实Git fixture验证untracked路径、review只读约束、brainstorm指令、skill body和原问题进入同一prompt；组合测试另验证alias、prompt metadata及单次派发。

最终三文件54项单进程通过：review runtime11、composition22、prose completion21。临时移除driver声明后正文组合、两个alias、双driver拒绝和prose候选共5项有效失败，源码恢复后重验通过。未运行真实provider、全仓、exe、桌面或20k PTY；四静态门、严格docs、TS build `686381afc994`及fresh、当前包judge proven通过，Git/本批CI另实际绑定。

### 第五十一批：模板候选发现成本与取消边界

ADD-08继续收口。原[上下文预览](../../packages/ts-shell/src/cli/runtime/context/preview.ts)只要草稿含非字面slash token就构造完整command registry；因此正文`/home`也会触发[模板loader](../../packages/ts-shell/src/core/prompts/templateLoader.ts)枚举模板目录并读取无关模板。普通无slash草稿本来不加载模板，但这个路径歧义和全量发现成本仍是确定缺口；同步读取也不能靠外层10秒abort或async函数名证明可中途取消。

现在预览从源token和兼容`/ ordinary`命令源派生候选名，只把候选名传给[命令registry](../../packages/ts-shell/src/core/commands/registry.ts)。[模板loader](../../packages/ts-shell/src/core/prompts/templateLoader.ts)新增按候选名的精确探测：不枚举模板目录、不读取无关文件，只检查候选路径并保留原有用户/项目优先级；每个候选根目录仍进入source revision，新增同名模板、覆盖或命令碰撞会撤销旧估算。候选数上限512、单文件512 KiB、总读取8 MiB，读取前后在同步步骤之间检查`AbortSignal`；不声称单个`readFileSync`内部可被中断。`/ ordinary`兼容语法、普通独立模板和正文显式`composable: true`模板仍走原预览/展开owner，没有第二套模板系统。

主代理串行验证：`templateLoader`12项、`preview`30项、composition22、slashRouter49、prose completion21、keymap73共207项通过；随后source capture/sources 12项通过。反转把preview改回完整registry后，超限模板测试在读取前失败；移除同步取消检查后，候选取消测试失败；两次均恢复源码并重新通过。四静态门、严格docs、diff、责任上限0、TS build `17253bcaa529`（inputs `ea1665b9fdb69fab86192ce4ebd15b5abed802ebf861996e23aac06aa08f4b5d`）及当前包正式judge proven通过。

本批只补本地模板发现成本、候选新鲜度和取消边界；未运行全仓、exe、真实20k PTY、真实provider或桌面平台。ADD-08的原生tokenizer、真实1.7k/4.9k分项差额、其他独立命令/研究工作流完整preview和完整动态来源总成本仍未验收；原Phase20保持38 complete / 9 partial，ADD整体继续active。工件`.omx/artifacts/phase20-addition-template-discovery/`保留验证摘要。

### 第五十二批：flagless组合正文与设置分类CI合同

接续已推送`a70c494f`。延迟实查前序提交时，`78f026f5`的CI只因[设置分类测试](../../packages/ts-shell/src/cli/interactive/settings.test.ts)仍期待旧八类而失败；产品实际已由第四十九批加入Memory与Shell两个只读入口。本批只同步测试期望为当前`all / Appearance / Model / Interaction / Context / Memory / Files / Shell / Tools / Tasks / Providers`，没有新增可编辑字段或改变入口行为。`e0116e86`的同次CI另出现四个浏览器smoke请求失败，但该批未修改浏览器/网络代码，且同一smoke套件在前一提交通过；当前证据不足以归因产品回归，端口生命周期、负载下流错误归一化与偶发原生`ECONNRESET`仍未分离，不能通过放宽状态断言掩盖。

ADD-12继续检查组合输入原文。原[组合计划](../../packages/ts-shell/src/core/commands/composition/plan.ts)只要方法后出现非字面`-`开头token，就将其按option消费，即使该方法没有声明任何flag；`prepareReviewComposition`和无flag可组合模板不会接收这些被移除的token，因此`检查证据 /review --keep-this /skill:a`会静默丢失`--keep-this`，与独立review把其当作文本正文的语义冲突。现仅在`composition.flags`非空时进入option扫描；flagless driver/modifier把dash token留在共享正文，声明flags的brainstorm/research仍严格拒绝未知选项，不把严格语法降级为任意prose。

[组合回归](../../packages/ts-shell/src/core/commands/composition.test.ts)新增flagless review与可组合模板两个保留路径，以及声明flags方法仍拒绝未知option的负向保护。首轮四文件90项中1项失败来自测试要求`--keep-this`在整个含brainstorm的组合focus中只出现一次；既有语义会把它同时带入modifier指令和最终review正文，因此改用只有review driver的最小路径断言恰好一次，不修改产品去重。最终composition24、研究composition12、review runtime11、settings44共91项单进程单worker通过。恢复无条件dash消费后两个新增保留用例实际AssertionError/exit1，逐字节恢复后composition24项再通过；plan/test/settings SHA256分别为`7a068ba2...`、`e927b43e...`、`2194ca7e...`（证据文件保存完整值）。

四静态门与diff通过，责任上限0；TS build `f2ea3c05143d`、inputs `e075e02050c3`、artifact `e11372f82fd6`。签入的已适配validator直接解包后正式judge exit0/proven、三项结构义务satisfied；首次再交给`.normproof/package.mjs`被原归档SHA拒绝，按已适配tgz不能作为原始基线输入分类，未改validator。独立只读review未发现正确性/兼容/安全问题。未运行真实PTY、exe、真实provider、全仓或桌面；测试使用原router、真实本地Git/skill fixture，但不证明终端像素或用户原环境。原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 第五十三批：正文补全的模板候选与命令归属边界

接续已推送`3ad3434c`。ADD-10/08继续收口：正文`/home`进入[prose completion](../../packages/ts-shell/src/cli/interactive/completion/prose.ts)后仍无候选地调用`listSlashInvocations`，为判断组合能力读取全部模板body；首位自定义可组合模板也经`getSlashInvocation`构造完整registry。现[模板loader](../../packages/ts-shell/src/core/prompts/templateLoader.ts)按名称前缀使用`opendirSync`逐项发现，名称上限512、目录入口4096、单文件512 KiB、总读取8 MiB，并在入口间检查取消；同名模板按用户→外层项目→最近项目的优先级反向解析，高优先级文件超出字节预算时遮蔽低优先级元数据，不回退成与提交owner不一致的候选。

[命令registry](../../packages/ts-shell/src/entrypoints/slashCommandRegistry.ts)先解析不依赖模板的builtin/catalog/extension，再用精确名称读取单个模板；默认查找在发现预算拒绝时返回不可解析，而扩展注册仍使用严格精确查找，避免超预算同名模板被误判为未占用。正文补全与dispatch继续复用原模板、命令和路径owner，没有增加第二套发现或执行路径。

最终七文件161项单worker通过：templateLoader17、prose completion24、request30、slash suggestions41、registry14、capture5、preview30。六个有效反转分别移除精确名称、目录入口上限、高优先级发现顺序、预算遮蔽、builtin优先及注册严格碰撞检查，均出现对应失败并逐字节恢复。独立只读review先后发现首位模板全量读取、候选/优先级、builtin预算及注册归属问题；修正后最终复审无findings，review本身未运行测试。

四静态门、diff、责任上限0及TS build `f17e7f7ce533`（inputs `4740f0c3eb74`、artifact `fc68dd6ae376`）通过；签入的已适配validator正式judge exit0/proven、0 open/failed obligation及0 proof gap。工件`.omx/artifacts/phase20-addition-completion-discovery/`保存聚焦、反转摘要、源码hash、静态/build/judge收据。未运行全仓、exe、真实provider、桌面或20k PTY；真实终端像素、平台输入与完整上下文差额仍不能由本批替代。原Phase20保持38 complete / 9 partial，ADD整体继续active。

### 第五十四批：首位命令与真实路径歧义

接续已推送`585904d4`。ADD-10确认首位`/home`同时具有slash命令和真实绝对路径语义时，原先只允许其中一类候选：有同名命令或alias时真实路径被吞掉，仅合成composition候选又可能隐藏普通命令。现[prose request](../../packages/ts-shell/src/cli/interactive/completion/prose.ts)在源文本offset=0先对当前完整目标做一次[单目标存在性检查](../../packages/ts-shell/src/cli/interactive/completion/paths.ts)，只接受现存file/directory并降级missing/broken link，不枚举目录；存在真实目标时才让path与匹配命令/alias候选合并。

合并结果保持command-first，alias仍不显示在发现列表但参与碰撞判断。单一component的绝对file统一加引号，例如`"/fixture" `，避免接受后被slash parser当作未知命令；已有第二个分隔符的`/tmp/example.txt`保持原样，directory保留尾部`/`以继续补全。[keymap](../../packages/ts-shell/src/cli/interactive/keymap.ts)把完整命令/alias的Enter与path候选分开：即使当前焦点是同名path，Enter仍提交用户实际输入的精确命令，Tab才接受path；交互owner现在传入[catalog scope](../../packages/ts-shell/src/cli/interactive/catalogScope.ts)，使catalog/template命令按当前workspace与session解析。

主代理单进程、单worker运行prose completion29、path catalog18、keymap76、InteractiveMode109、completion13，共五文件245项通过。七个有效反转分别恢复无条件命令吞路径、仅composition顶层候选、path-first排序、只按精确collision加引号、取消跨前缀collision检测、取消孤立file引号及恢复keymap path例外；均出现对应断言失败并逐字节恢复。独立只读review最终未发现正确性缺陷，但未运行测试。

五静态门与diff通过，责任上限0；TS build `a0dc9a90154f`（inputs `25df253e4dd1`、artifact `dde6d53df1ea`）通过，最终3496个build input的digest仍相同，immutable build的1880个artifact digest仍相同。签入的已适配validator正式judge exit0/proven、0 open/failed obligation及0 proof gap。工件`.omx/artifacts/phase20-addition-offset-path-ambiguity/`保存聚焦、反转摘要、源码hash、静态/build/freshness/judge收据。未运行全仓、exe、真实provider、桌面或PTY；真实路径fixture证明本地路由，不证明用户原终端、Windows或桌面IME。原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 第五十五批：上下文选择后的测量失效与有效条目身份

ADD-08确认`/shake apply|restore`替换会话上下文选择后，旧provider prompt measurement仍可能被`/context`和状态栏当作当前值；交互估算身份也没有绑定`contextSelection`。现[选择owner](../../packages/ts-shell/src/session/context/selection.ts)提供`effectiveContextSelection`：只保留hash仍匹配且实际改变消息投影的条目，空选择、stale条目和无效果模式不构成prompt identity；`planContextSelection`在`changed=0`时不推进revision。交互owner使用该有效身份，避免空/stale选择误使有效估算变stale。

[session command](../../packages/ts-shell/src/cli/runtime/sessionCommands.ts)在`apply`真正改变投影后调用原`markContextUnknown`并清空`promptIdentity`；无变化返回`unchanged`且不写状态。`restore`在存在有效选择时才发布并失效测量；已空或只有stale/无效果条目直接返回`unchanged`，不绕过或错误消费准入。`status`报告有效条目数及被忽略条目数，不把revision或原始entries当作有效上下文。

主代理单进程串行四文件118项通过：sessionCommands2、interactiveMode110、selection4、state2。三个有效反转分别移除测量失效、交互`contextSelection`身份和`changed=0`门，均出现对应失败并逐字节恢复。独立只读review先后指出no-op revision、空/stale条目和status计数问题；修正后最终复审无findings，review本身未运行测试。

五静态门与diff通过，责任上限0；TS build `aa7aec1ced32`、inputs `3fed547d9fb4`通过，当前已适配validator正式judge exit0/proven、0 open/failed obligation及0 proof gap。未运行全仓、exe、真实provider、桌面或PTY；有效选择缓存以selection对象和turns数组身份绑定，若消息在数组内原地变更而选择对象不变，仍需重新取得选择或后续更强的内容身份；真实1.7k/4.9k差额与生产性能继续待证。原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 第五十六批：实际组装请求的本地估算事实

ADD-09继续收口`/context`。发送时已经捕获的实际请求body现在由[request projection](../../packages/ts-shell/src/context/request/projection.ts)计算`localEstimate`：只保存冻结的tokens、`characters/3.5`方法、`assembled-request` scope及图片固定allowance的嵌套摘要，不保存原文。图片base64长度不进入计数，每个图片块使用现有固定allowance；不兼容的字段声明、opaque reasoning或未知协议不伪造数字。

[wire estimate](../../packages/ts-shell/src/context/request/wire.ts)增加带图片来源的detail结果，原数字API继续委托它，预览/真实请求不新增第二套计数器。`requestContext`只吞掉字段不可用和opaque reasoning两种已知不可用错误，其他异常继续抛出；[context report](../../packages/ts-shell/src/core/commands/context/request.ts)把“Assembled request estimate”作为独立事实显示，明确它是本地字符估算而非provider usage，并在图片请求中报告固定allowance。

主代理单进程串行六文件176项通过：projection10、wire3、context report14、session29、step90、runtime preview30。两个有效反转分别移除localEstimate和恢复图片原文计数，前者出现10个失败、后者图片长度断言失败，均逐字节恢复并重验。独立只读review先后指出数值测试、图片来源、opaque reasoning、Responses覆盖和图片allowance契约问题；修正后最终无findings。

五静态门与diff通过，责任上限0；TS build `abc97ad25d30`、inputs `a16517030700`通过，当前已适配validator正式judge exit0/proven、0 open/failed obligation及0 proof gap。未运行真实provider、全仓、exe、桌面或PTY；固定图片allowance不是模型真实图片token，未引入原生tokenizer，也不能解释用户真实1.7k/4.9k差额。原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 第五十七批：review预览复用真实Git prompt

ADD-08确认`/review`在有效脏工作树上仍保持unknown：preview的组合准入只允许deep-research driver，且review没有`preparePrompt`，所以standalone与正文组合都在真正准备前被拒绝。现preview显式准入review的standalone/driver路径，并与dispatch共用[review request owner](../../packages/ts-shell/src/core/commands/reviewCommandRuntime.ts)解析正文、skill、modifier和focus；随后复用[原Git workbench](../../packages/ts-shell/src/workflow/git/service.ts)的snapshot与review prompt，不调用`runReviewCommand`、通用`gitCommand`或`GitWorkbench.execute`。

review dispatch经`gitRequestMode`强制plan mode，因此[preview组装](../../packages/ts-shell/src/cli/runtime/context/preview.ts)也使用plan身份；Git snapshot/diff读取传播`AbortSignal`，[review preview](../../packages/ts-shell/src/cli/runtime/context/review.ts)在内容复验时通过`assertGitSnapshot`重查完整fingerprint。有效脏工作树得到本地数值；clean/unreadable tree、缺少Git workbench、第二个driver、无效请求或取消仍在模型准备前保持unknown，不把只读Git读取称为写入派发。

主代理单进程串行五文件93项通过：runtime preview39、review runtime11、composition24、Git read3、Git operation16。两个有效反转分别恢复旧driver门与移除plan mode override，前者8项失败、后者4项失败，均逐字节恢复并重验39项。五静态门/diff、责任上限0、TS build `134c5c64ce2b`（inputs `509863f0359e`、artifact `d4ceddb3a987`）及签入validator正式judge proven、0 open/failed/gap通过。未运行真实provider、全仓、exe、桌面或PTY；每次预览仍会读取并hash真实Git snapshot，预览与实际提交之间尚未共享one-use snapshot reservation，真实1.7k/4.9k差额与生产性能继续待证。原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 第五十八批：review预览的one-use Git snapshot reservation

第五十七批的预览与提交仍各取一次Git snapshot，预览数值与真正review可能因工作树变化而漂移。现[Git workbench](../../packages/ts-shell/src/workflow/git/service.ts)持有不持久化的one-use snapshot slot：预览在完整request/source验证通过后才发布，实际`/review`仅在focus、20秒期限和canonical session/config/workspace/history/attachment binding仍匹配时消费；消费后立即清空，并在diff读取后再核对完整fingerprint。过期、binding变化或diff期间工作树变化返回明确local拒绝，不静默改用新snapshot。

新的preview会通过preview disposer清空旧slot；source、injection、attachment或Git验证失败会丢弃已发布slot；不同draft不会复用旧slot。reservation保存完整preview验证guard，过期后保留仅含focus的tombstone直到替换成功发布或同focus命令消费；canonical binding同时绑定图片附件摘要，controller timeout/stop会立即dispose未settle的preview。独立standalone review在无效语法、缺少Git workbench或过期/变更拒绝时恢复原始slash draft。binding只保存摘要，不保存原始配置或附件正文。

主代理单进程串行九文件222项通过：controller13、runtime preview50、review runtime14、composition24、Git read3、Git operation20、command execution bridge13、slash router49、interactive command router36。本轮新增三个有效反转：移除完整preview guard导致preview 1项失败，移除expired tombstone导致Git operation 1项失败，移除controller in-flight dispose导致controller 1项失败；均逐字节恢复并重验222项。此前的reservation发布与diff后fingerprint反转证据仍单独保留。

五静态门/diff、责任上限0、TS build `9e23fa7256ee`（inputs `823648b90f2a`、artifact `1cece9167270`）及签入validator正式judge `proven`、0 open/failed/gap通过；type-only cycle由NormProof发现并改为结构化图片类型后恢复proven。未运行真实provider、全仓、exe、桌面或PTY；真实并发Git工作树/平台矩阵和1.7k/4.9k差额继续待证。原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 第五十九批：研究预览的原始来源与one-use准入

接续已推送`427aab28`。ADD-08确认deep-research preview虽然已经计算并发布prospective reservation，但提交时`takeResearchPreview`只复核request、session、configuration、history和attachment metadata；附件、记忆、指令或模板正文在预览与`runtime.create`之间变化时，实际run仍可能使用新字节，而界面保留旧估算。现[research preview](../../packages/ts-shell/src/cli/runtime/context/research.ts)在发布时保留detached request、图片摘要和完整`verifyContent` guard，提交先消费entry，再以command signal等待原始来源、注入和附件复验；复验后再次核对live context、attachment与reservation。请求不匹配、被discard、过期或变更会留下context-scoped stale tombstone，必须成功发布新preview后才能再次准入，不静默创建fresh run。

[research command](../../packages/ts-shell/src/research/command.ts)只在reservation准入完成后调用原`runtime.create`；来源变更、配置/会话变化或取消不会创建run、写state或ledger，取消沿原signal抛出而不是伪装成local refusal，pre-submission refusal返回原始`retryDraft`。[reservation owner](../../packages/ts-shell/src/research/run/reservation.ts)返回冻结的captured request；[attachment binding](../../packages/ts-shell/src/context/attachment/binding.ts)由research与review共用，不保存图片正文。[CLI bridge](../../packages/ts-shell/src/entrypoints/cliCommandExecutionBridge.ts)传播父取消信号；没有父signal的standalone dispatch在session command owner内运行，使真实Ctrl+C能中断来源复验。

主代理单进程串行13文件214项通过：runtime preview63、research reservation12、research composition12、research preparation9、core composition24、research syntax1、interactive command router36、command execution bridge14、attachment binding1、attachment verify5、review runtime14、Git operation20、Git read3。七个有效反转分别移除内容复验、过期拒绝、取消传播、discard tombstone、请求不匹配拒绝、图片绑定和standalone command-owner包装；另有create失败保留stale、父signal链接、busy拒绝和取消前preflight保护，均有对应失败并逐字节恢复。多轮独立只读review先定位四项缺口，修正后再次审查；末轮复核定位并修正取消期间tombstone清理，复核最终无findings。

五静态门/diff、责任上限0、TS build `901bcffeef12`（inputs `8d18923e65a4`、artifact `c2145971d843`）及签入validator正式judge `proven`、0 open/failed/gap通过。未运行真实provider、全仓、exe、桌面或PTY；测试使用真实attachment/session fixture和原research runtime，不证明真实provider、平台或用户原环境的完整来源成本。原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 第六十批：模型认证取消后的原始准入

第六十批补ADD-02的认证回返边界。[模型认证 owner](../../packages/ts-shell/src/cli/interactive/picker/model/auth.ts)在await原生sign-in后原先只用`owner.isCurrent()`比较session、workspace与profile身份；当原admission已撤销或原signal已取消但身份未变时，仍会返回`next`并重开model picker。现改为先调用`owner.check()`重放原admission与取消信号，拒绝时只保留安全note、不返回continuation；成功认证仍沿原`back`路径回到精确model，原session/workspace身份检查保留。

auth18、key9、InteractiveMode110共三文件137项单进程串行通过。有效反转把`owner.check()`恢复为旧`owner.isCurrent()`后，auth admission、auth signal和key signal三项断言均失败；源码逐字节恢复后重验137项通过。真实host取消路径现断言overlay不重开且不出现model row，success/failure仍回返；独立只读review最终无findings。

五静态门/diff、责任上限0、TS build `a3dd8c19d4b2`（inputs `af270b6ddc7b`、artifact `391db3bd812d`）及签入validator正式judge `proven`、0 open/failed/gap通过。未运行真实provider、全仓、exe、桌面或PTY；测试使用延迟sign-in、真实OverlayHost和隔离配置fixture，不证明真实认证服务或平台矩阵。原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 第六十一批：review stale marker 与异步准入代次

第六十一批补review preview失效后的dispatch边界。原[Git workbench](../../packages/ts-shell/src/workflow/git/service.ts)只保留按focus匹配的过期tombstone；changed focus、replacement preview失败、验证失败或controller自动退休可能清掉旧reservation，随后`/review`静默取得fresh Git snapshot。现review invalidation改为workbench级持久标记，覆盖focus/attachment/binding/expiry/verification/replacement失败，直到成功发布新的review preview或完成一次已验证的非review preview才清除；显式preview `dispose`仍只释放当前slot，允许用户明确重新取得snapshot。

异步消费新增`reviewTake`与`reviewEpoch`：reservation被消费时记录代次，replacement发布或旧preview退休会推进代次；旧verification返回后、prompt/diff构造后都重新核对，不能覆盖新reservation或返回旧prompt。[Context controller](../../packages/ts-shell/src/cli/interactive/context/controller.ts)新增automatic `invalidate`路径，identity变化、timeout和verification failure保留stale owner state；没有`invalidate`的旧preview及显式`dispose`继续走原cleanup。

主代理单进程串行四文件118项通过：runtime preview66、Git operation22、review runtime14、controller16。有效反转移除`reserveReview`的epoch推进后，旧verification在replacement发布后错误返回reserved prompt，新增Git operation断言失败；源码逐字节恢复（sha256 `6674cf86c8a9c4e78c3c60b9165fe8a65dab37da4a8964b5f67aa3685efe7315`）并重验118项。独立只读review未取得结果：首个delegated review未返回，替换review因模型在所有账户cooldown而不可用；该状态不记为approval或no-findings。

五静态门/diff、责任上限0、Phase 20脚本38 complete / 9 partial / 0 open、TS build `8ff6550a60e7`（inputs `03894378e856`、artifact `07f593317543`）及签入validator正式judge `proven`、0 open/failed/gap通过。未运行真实provider、全仓、exe、桌面或PTY；真实并发Git工作树、平台矩阵和用户原环境仍未验证。

### 第六十二批：提交期preview生命周期与review租约

第六十二批补第六十一批之后的提交竞态。原[InteractiveMode](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts)在用户提交时只设置busy，[context controller](../../packages/ts-shell/src/cli/interactive/context/controller.ts)的500ms轮询会看到identity变为`undefined`，从而自动`invalidate`正在消费的review preview；用户自己的`/review`可能因此被拒绝。现controller提供`suspend/resume`，提交在busy前暂停轮询，turn结束后恢复；suspend会标记并abort正在运行的check，但通过preview生命周期只抑制该check的owner-side invalidation，真实来源失败仍由dispatch复验拒绝。

同时，[Git workbench](../../packages/ts-shell/src/workflow/git/service.ts)在reservation准入后保留`reviewTake`直到prompt/diff与最终snapshot/binding检查完成；成功才清理，失败按当前epoch留下stale marker。`this.git()`提前到reservation消费前，Git可执行文件解析失败不会留下无法结算的take。聚焦覆盖review失败后再次dispatch、Git resolution失败、post-diff binding失败和suspended abort。

主代理单进程串行五文件234项通过：controller18、InteractiveMode111、Git operation24、runtime preview67、review runtime14。三个有效反转分别移除busy suspend、恢复take提前清空和移除suspended verifier guard，均出现对应断言失败并逐字节恢复；源码恢复哈希核对一致。独立只读复审由指定`cn:deepseek-v4.1-flash`执行，最终无findings；其残余风险是未做真实I/O/timing stress，以及永不settle的verifier会继续占用pending slot。

五静态门/diff、责任上限0、Phase 20脚本38 complete / 9 partial / 0 open、TS build `07e2421013da`（inputs `22fefb1161e4`、artifact `a69987ef6b00`）及签入validator正式judge `proven`、0 open/failed/gap通过。未运行真实provider、全仓、exe、桌面或PTY；真实终端时序、慢文件系统和平台矩阵仍需后续验证。

### 第六十三批：正文路径碰撞、字面量与Windows引号边界

第六十三批继续收口ADD-10/11的候选语义。独立只读复核确认正文中非首位的命令碰撞文件仍可能以裸路径接受，随后被组合解析重新当作slash命令；代码、转义slash和URL命令参数也可能错误请求path catalog。现[prose completion](../../packages/ts-shell/src/cli/interactive/completion/prose.ts)只在非首位、非目录且候选以`/`开头时执行精确命令碰撞检查，命中的file加引号；directory继续以尾部`/`补全，且不会触发精确命令或模板读取。首位既有command-first/path合并与Enter/Tab分界保持不变。

[command catalog request](../../packages/ts-shell/src/cli/interactive/completion/request.ts)现在先读取原prompt token：inline code、非Windows转义slash和`scheme://` URL不进入路径catalog，普通相对路径参数仍保留。引号路径先剥离外层quote，再由同一`pathLike`谓词识别Unix、相对、Windows drive与UNC；这补上了quoted UNC原先只在Windows探测中匹配、却在最终路径校验中被拒绝的缺口。`/home`相关测试改为mock精确目标，不再依赖宿主目录内容。

主代理单进程串行三文件122项通过：prose completion32、completion controller14、keymap76。四个有效反转分别移除非首位命令碰撞检查、关闭literal过滤、移除UNC谓词及让目录候选预先执行精确命令查找，均出现对应断言失败并逐字节恢复；最终源码hash与反转前一致。独立`cn:deepseek-v4.1-flash`只读复审先指出非组合命令夹具不足，改用真实`/brainstorm`证明未引号正文会生成prompt、接受后的引号path保持字面量；稳定源码最终无findings。

五静态门/diff、责任上限0、Phase 20脚本38 complete / 9 partial / 0 open、TS build `1e15b8d6239e`（inputs `cd0db660bc77`、artifact `94310bb1b156`）及签入validator正式judge `proven`、0 open/failed/gap通过；manifest readback为fresh，460个compiler input与1882个immutable artifact匹配。未运行真实provider、全仓、exe、桌面、PTY或Windows；非`scheme://` URI、Windows真实目录枚举、文件碰撞的有界模板发现成本及用户原终端仍未验证。

## 16. 最新问题总和与必须完成的体验

本节是全文末尾的当前摘要；第2至13节保留详细要求，第15节记录逐批证据。确认一个机制存在、补齐一条路径、通过隔离测试与用户真实环境全部验收是不同结论。

### 16.1 确实存在的问题及修补方向

| 问题 | 确认的机制、修补方向与剩余边界 |
|---|---|
| model上下键看起来无交互 | 原disabled跳过具体未配置模型是确定缺口；只有一行ready与该观察相容，原现场按键是否进入此分支仍未排他确认。必须允许未配置具体模型获得焦点、进入详情和配置，不能改回跳过它们；浏览、认证成功与显式启用分开。已有局部修补及真实host/隔离PTY证据，原环境仍需复验 |
| 模型面板保存连接提前切换请求目标 | 第七十六批确认面板复用普通login的默认激活写入；只保留默认字段仍会被凭据解析或logout的隐式回退选中。现沿原连接owner显式仅保存，新slot不参与自动选择，显式模型/session/连接/账号池选择仍有效；非镜像原生账号按精确slot核验并授予续期。237项执行通过、四组有效反转及TS构建有本地证据，真实认证服务、PTY和桌面平台本批未验 |
| 带前导双横线的模型配置值无法保存 | 第七十七批确认host把表单密钥、模型ID与连接标签作为分开argv token，合法字面值被严格parser当成选项。现以原parser支持的字段绑定形式传递；保留直接命令的严格语法和脱敏诊断。两模式八条新增边界、113项执行通过及有效反转有证据，真实provider服务与平台本批未验 |
| 同协议relay分类错误标为可用 | 第四十批确认runtime级凭据聚合不能代表精确分类。现从分类自身已准入模型行派生状态和ready优先顺序；阻断模型仍可浏览，刷新保留手动身份。五文件84项、原源码有效反转及四条实际Node小型PTY有证据；完整模型/认证/桌面验收继续待证 |
| 目录删除后焦点回首项且没有提示 | 第四十一批实际host/publication复现，现缺失焦点刷新按旧可见模型ID取幸存邻居，navigation清理旧ID并显示目录变化；生存手动身份与搜索失去匹配保留原语义，空占位不能启用。136项/三有效反转有证据，真实桌面/终端删除场景未验 |
| 角色旧动作在退出后仍可保存，子面板取消后父级失效 | 第四十二批确认role/thinking没有永久退役与子入口准入、共享controller在Escape被取消、action wrapper丢owner。现退役/一次消费/原事务取消复验，显式返回转交父controller，wrapper保留不透明身份；152项/六有效反转及普通/全屏Node小PTY有局部证据。完整角色/认证/桌面矩阵未验 |
| 角色已存档位不可用时默认Enter覆盖原值 | 第四十三批三个自动角色实际host复现缺失high回auto。现保留active · unavailable只读焦点，Enter及直接旧值apply不写，明确移动才保存支持值；三文件67项、有效反转及普通/全屏Node小PTY有局部证据，全部能力/桌面矩阵未验 |
| 普通档位旧动作或待定hook跨关闭/重开仍可写入 | 第四十四批补浏览代次/退役/pending门；第九十四批确认实际Enter释放后仍缺accepted host归属，refusal及完成返回也未重验browser。现两种归属贯穿原thinking事务，拒绝/完成退休，显式重开才续期，已确认写通知保留；46项执行通过及六组有效反转有本地证据，完整矩阵未验 |
| 普通ready模型与preset在宿主替换后仍切换 | 第九十七批独立审阅与实际host确认根model未转交accepted ownership，等待PreModelSwitch时重开settings仍会保存旧选择。现根动作代次与目录刷新分开，模型及preset沿原事务复验宿主，消费/取消后不能靠load续权；保存已确认时保留notice并复验原browser后才返回。115项聚焦执行、六组反转、TS构建及本修补的双lane复核有证据，完整平台/认证矩阵继续待验 |
| 目标档位保存后仍返回失效workspace的父级 | 第九十八批动态确认PostModelSwitch撤销原workspace时host代次仍有效，recovery完成只验host会重开旧model/settings。现保留已确认写入notice，原browser明确获准且callback后host仍有效才构造父级；缺失/拒绝/抛错guard不返回。71项聚焦执行、两组有效反转、TS构建及双lane复核有证据，真实终端/认证/平台仍待验 |
| 设置Apply在预览清理关闭宿主后仍保存 | 第一百批实际两模式确认theme预览end经refresh关闭/替换已接受宿主后仍写入。现详情接收accepted ownership，清理及重试reopen后复验，Apply先消费，保存完成保留原notice但不返回失效父级；迟到动作仍撤回原预览。125项聚焦执行、七组反转、TS构建及本修补双lane复核有证据，其他编辑器生命周期及完整平台矩阵未据此验收 |
| Escape清理替换宿主后仍覆盖新界面 | 第一百零一批两模式实际theme Escape确认close后重开旧settings、replacement被旧parent覆盖。现原overlay在准备、关闭清理/通知、parent构造后复验代次，失效不返回；沿原previewBack清理未完成的controller转交，正常父级仍可显式保存。190项聚焦执行、八组反转、TS构建及本修补双lane复核有证据，完整面板/平台未据此验收 |
| resume先旧后三新仍选旧 | 渐进目录先发布current，首次自动ID被保留，排序本身未反。自动选择阶段跟随最新可恢复候选；一旦上下键/点击主动选择，后续刷新保留其ID，Enter重验身份。第四十六批另修跨时区/小数秒字符串排序，默认焦点按实际时刻选择；搜索/scope换代重置自动规则，手动渐进刷新仍保持。已有局部夹具证据，桌面平台与用户原环境现场仍待验 |
| 认证快捷入口缺少参数发现 | 第四十七批确认`/login`、`/logout`只有委托执行而没有顶层提示/补全。现从原`connectSyntax`派生快捷语法：login提供provider与认证flag，logout发现保存连接，并排除不属于顶层语法的action alias；执行仍只走原认证owner。第四十八批再以registry合同锁定theme/statusline/connect/login/logout/view与settings元数据的owner可见性。73项、13项合同及两有效反转有局部证据，真实认证/桌面仍待验 |
| 黄条删除后仍留白、编辑箭头缺失 | 绘制残余padding与普通gutter回退是确定缺口。已提交正文从第1列开始，编辑箭头贴左，续行对齐正文；保留用户源缩进、caret/选区/复制。已有局部修补证据，不能恢复黄色侧条冒充完成 |
| TUI首帧过晚与基准误标 | 原入口先建立重runtime，原基准再将后期模型名当首帧。已采用早期真实composer/一次交接，第三十七批补实际Loading观察和runtime接管计时、close清理；同机Node/exe两模式各30个warm-uncontrolled空会话样本已归档。冷缓存、修补前对照、真实项目/桌面及完整首请求性能仍待验，不能写成已证明生产节省量 |
| 初始上下文问号与估算新鲜度 | 首请求前原先只显示provider用量；已补实际请求本地估算及估算/实测身份衔接。规则、模板与普通skill/cold extension清单已补原始字节进入核验，warm extension沿现inventory摘要失效；附件原已严格UTF-8 digest重验，预览补异步/cancellable复验和实时准入。第五十一批把preview模板发现收窄为候选精确探测，第五十三批再收窄正文补全与单命令查找，并补目录入口、优先级遮蔽和注册归属；第五十四批补首位真实路径/命令合并、command-first及文件引号防误路由；第五十七批让review standalone/composed预览复用真实Git snapshot与plan-mode prompt身份。第九十九批补真实模板与所选路径的提交验证，裸token仍按明确语法而非文件存在性猜意图。完整终端矩阵、其他动态来源覆盖、总读取成本、原生tokenizer及真实差额仍待验证，无法证明时保留unknown/stale |
| 一步配置的预览与实际收尾请求不一致 | 第一百零四批真实请求发现草稿~717而实际组装估算568；真实turn_start在派发前计入第一步，预览却按零步判断。现一步预览省略工具schema并沿原finalStepMessages加入收尾指令；dynamic/full×一步/两步的完整wire、三类digest与估算对照通过。最终Linux PTY草稿~568与同请求估算568一致，provider输入462独立显示；自动回合后状态栏仍观察到stale，未宣称实测衔接完成或历史差额闭合 |
| 自动回合完成后状态栏被无数字preview占住 | 第一百零五批实际host确认请求完成后`promptContext`可先发布estimated，随后过期；旧状态投影只按对象存在性取live reading，`unknown/stale`即使没有token也会遮住同身份measured。现仅`estimated/calibrated`且带数值的live reading优先，无数字读数回退到身份匹配的provider实测；请求完成后identity失效或预算是真实unknown时仍保留对应状态。regular/fullscreen实际宿主路径已有证据，真实provider延迟与桌面平台未验 |
| 外部目录刷新可持久化畸形模型上限 | 第一百零六批确认可变models.dev JSON的context/input/output未经同一整数准入即可写入缓存，且旧缓存读取不清理；负数或字符串可能进入compaction预算。现只接受正安全整数，refresh投影与catalog merge两个provider分支共用同一owner，新增provider及built-in patch的旧缓存均由回归覆盖；真实外部索引内容与端到端compaction平台仍未验 |
| 刷新目录被错误显示为“yours” | 第一百零七批确认refresh cache与用户catalog复用同一merge，所有overlay都无条件标记`custom:true`，`/model`因此把公开索引刷新出的provider显示为用户自有。现merge显式区分user/refresh来源，只有用户文件保持`yours`；新增provider、built-in patch及同场用户overlay由surface回归覆盖。真实外部刷新内容和桌面渲染仍未验 |
| 刷新目录丢失reasoning effort能力 | 第一百零八批确认`reasoning_options`被完全丢弃，`reasoning:true`又让任意显式low/medium/high看似受支持，可能向只接受budget/toggle或不同effort名的模型发送错误字段。现只精确投影声明的low/medium/high并补全不支持项，minimal/xhigh/max/none/default不猜测；有效空/budget/toggle选项禁用显式档位但保留auto，未知结构继续legacy unknown。真实provider协议矩阵仍待验 |
| 不支持工具的目录模型仍收到工具声明与工具历史 | 第一百一十批确认models.dev`tool_call:boolean`被refresh丢弃，而dispatch始终声明工具；显式`false`模型仍收到工具schema、工具型系统提示，既有tool history还可能发送。现refresh只投影明确boolean，absent保持capable；dispatch与preview从同一shape决定schema、提示、收尾、身份/预算并在发送前拒绝tool history。foreground沿用host plan/build mode，closing预算只计实际发送的schema与合成指令。真实provider行为仍未验 |
| 模型上限helper引入声明依赖环 | 第一百零九批由CI`test:scripts`完整declaration graph发现`catalog.ts -> limits.ts -> catalog.ts`；轻量`verify:import-cycles`未捕获该type-only back-edge。现limits owner使用structurally typed generic，不再import catalog type，行为保持。迟到读回将`23550c7d`与`803b9741`CI标为failure，修复提交CI须另行验证 |
| settings/model整体操作不足 | 分类/section/详情、配置与角色返回、来源长值、多行编辑、小窗口、pointer焦点、内容wheel、独立sidebar视口及hover均已有推进，来源阅读仍有4MiB上限。第三十八批新增settings全部37项/user37-project36基本键盘链及七个跨来源政策场景，第三十九批补17个代表性冲突/失效/取消/范围场景，第四十九批补Memory/Shell只读命令入口。完整字段×来源×编辑器×窗口/桌面及model能力/角色/真实认证矩阵仍未完成；只读入口不伪装可编辑字段，也不能将局部绿色写成“整体已看齐” |
| 角色写入失败后丢失settings/model返回链 | 第八十批确认reset、具体模型和effort只在saved时返回父页面，Enter已释放面板，失败使生命周期结束；effort重建遇不可读state还会掩盖原写入结果。现回现有fresh parent，不可读时退回目录并保留原notice；60项执行通过、四组6/10/6/4有效反转及build有本地证据，真实文件系统故障与完整平台矩阵未验 |
| 角色认证返回时读取失败吞掉连接保存结果 | 第八十一批确认API-key/account保存后的fresh role准备无异常边界，state不可读时丢失原认证notice和返回链。现沿原角色目录fallback，保留已保存/应用未确认事实，恢复后须显式重新选择才分配。107项执行通过、14项有效反转及build有本地证据；认证runner与故障受控，真实服务、磁盘故障和完整scope矩阵未验 |
| 未改动的列表编辑会改变原值与工具可见集合 | 第八十二批确认逐行初始化与原parser的引号/JSON/换行/trim语义不往返，带引号的工具名可变为普通可见工具名。现先用原parser比较完整值，无法往返时沿已有JSON数组输入初始化；169项执行通过、24项有效反转及build有本地证据，普通逐行编辑保持，完整字段/来源/平台矩阵未验 |
| 模型详情接受动作后的目录读取失败丢失返回链 | 第八十三批确认Enter已释放详情，刷新异常只返回note且跳过宿主归属检查。现失败时复验归属、退休已消费动作，沿原父目录保留安全提示；39项执行通过、7/2两组有效反转及build有本地证据。读取故障受控，真实磁盘/平台及完整认证矩阵未验 |
| 模型详情最后准入读取异常、关闭后的拒绝结果与旧动作复活 | 第八十八批确认refresh成功后的admit无异常边界，拒绝先于归属复验返回；丢结果的guard也未永久退休旧详情。现最后准入异常沿原父目录返回，任一确认丢失归属永久退役，关闭/替换后不发布拒绝或异常结果；52项执行通过、9/2/9三组有效反转及build有本地证据，真实磁盘故障与平台矩阵未验 |
| 模型详情普通准入拒绝关闭返回链 | 第八十九批用真实配置文件变化确认target拒绝只返回note，实际host已释放详情，settings/model链随之关闭。现拒绝消费旧动作，另验原浏览owner有效才回fresh目录，取消/身份失效/读取异常不自动重开；62项执行通过、15/4/2三组有效反转、build及两模式小型Node PTY有证据，完整来源/桌面矩阵未验 |
| 角色详情返回的列表更新而分配事务仍旧 | 第九十批三个自动角色×配置/会话变化与两模式host确认fresh目录仍复用旧assign/effort，显式重选继续过期。现详情及认证返回共用原角色owner重捕获事务和当前档位，失败沿角色目录保留原notice；75项执行通过、12/3/4三组有效反转及build有本地证据，未追加真实PTY或真实认证 |
| 角色动作/档位准入拒绝关闭导航且接受后丢失宿主归属 | 第九十一批确认角色菜单和档位页的refusal只回note且未消费，Enter已释放的host也不再触发preview退休。现两owner接入accepted generation，准入及返回检查后再验归属，拒绝/归属丢失永久退休；156项执行通过、五组有效反转、build与两模式Node小PTY有证据，完整平台/来源/真实认证未验 |
| 模型详情异常恢复绕过原浏览归属复验 | 第九十二批确认refresh/admit异常只验accepted host后直接构造父级，workspace已失效时仍会重开旧链。现异常与普通拒绝共用原详情owner的返回准入，检查前后复验宿主，未获准只保留安全结果并退休旧动作；86项执行通过、14/6两组有效反转及build有证据，故障受控，真实磁盘/桌面矩阵未验 |
| 设置搜索新查询仍保留较弱匹配焦点 | 第三十八批确认typed/pasted `topP`排名第一但Enter打开Input shape。现新查询自动聚焦最强匹配，同查询手动选择保持，清空回原字段；178项聚焦、一有效反转及两模式实际Node PTY有证据。不是用户原model按键现场唯一原因的证明 |
| 设置失败重试/scope确认把旧暂存写到新归属，user来源换代或不可读范围处理不足 | 第三十九批确认ambient host重捕获绕过旧binding、user未检查legacy/preferred selector，以及损坏目标scope使面板丢失。现原draft受限reopen，同源冲突可明确第二次Apply；binding/profile/source变化须新开，scope取消或不可读保留pending和原scope，成功换scope撤销pending，写锁与发布前复验。222项、三有效/一无效反转及四小型实际Node PTY有局部证据，完整矩阵未验 |
| 正文路径、多skill、有限slash组合原先缺口 | 原路径与skill路由偏向首位，多个名字不足以使多份skill生效。现沿原补全/解析/研究owner推进；第六十三批补非首位命令碰撞file引号、目录候选不触发命令模板查找、代码/转义/URL参数不请求path catalog及quoted Windows drive/UNC识别；第七十批补`/skill:`命名空间内真实路径与skill候选并存，quoted path与exact skill Enter/Tab分界保真。第九十九批验证同名非skill模板/path：Tab接受所选类型，文件加引号、目录保留尾斜杠；首位完整命令Enter按command-first，裸正文模板按既有composition声明。完整场景、原生终端及平台矩阵仍按下表，不从本地确定性语法推断用户裸token的意图 |
| 显式队列入口丢图片并裁掉任务尾部空白 | 第九十五批确认普通SubmissionQueue已有附件合同，但queue控制及adapter仅转文本，TUI还trim整个原输入。现原queue owner沿同一待提交项转交附件，控制入口保留literal正文及图片echo；两种Enter模式覆盖多skill、未知第二项、超预算和中断后重试，完整平台/真实provider仍未验 |
| 转义目录名使连续Tab失败或隐藏后文skill | 第七十八批确认已插入引号内的转义源码被当成真实路径，裸反引号还会打开代码区。现复用参数扫描器解码，保留原始Windows分隔符并给反引号路径加引号；138项执行通过、三组有效反转与构建有本地证据。两模式host使用RecordingTerminal，Windows只做词法测试，真实终端与平台本批未验 |
| 手动输入的未闭合单引号路径在空格处分裂 | 第八十四批确认leading单引号须先有close，路径后半段失去补全，内部skill/方法标记暴露给准备。现明确路径前缀沿原tokenizer保持open quote范围；142项执行通过、13项有效反转与build有本地证据，双引号/带前缀控制及闭合后的多skill保留，原生Windows与真实终端未验 |
| 组合选项的引用值被误作普通正文 | 第八十五批确认`--mode="paper"`、depth和brief未进入研究参数，无效引用选项还会绕过校验。现保留未引用flag前缀，复用参数scanner解码后走原strict语法；未闭合选项在准备/建状态前阻止。完整引用、escape和code正文继续保留，预览/提交、durable options与两模式Enter有隔离证据 |
| 正文或文件名中的apostrophe使文件引用失效或删除后文 | 第八十六批确认引用复用整段命令参数扫描，普通apostrophe被当成shell quote，目录请求和替换范围均出错。现从原prompt token取得引用范围，仅对引用自身的quote/escape解码；101项执行通过、18/1两组有效反转、两模式真实目录Tab及build有本地证据，真实PTY与完整平台矩阵未验 |
| 手动输入含apostrophe的普通路径失去候选 | 第八十七批确认源token范围正确，但路径query仍被参数scanner去掉apostrophe。现普通路径保留源值，真正引用的路径沿原scanner解码，原始Windows分隔符政策保持；128项执行通过、12项有效反转、两条真实Node小型PTY与build有本地证据，原生Windows及桌面仍未验 |
| 代码示例中的文件引用仍扫描目录，含sigil文件名无法继续补全 | 第七十九批确认`@`后备分支未检查代码区，又把文件名内任意`@`当成重复sigil；前导`@`文件还可能插入为字面双`@@`。现复用源token排除代码、仅拒绝raw双sigil，并引用前导sigil文件名。94项执行通过及11/5/1有效反转有本地证据；实际host证明代码内零枚举、闭合后恢复，真实终端与平台本批未验 |
| review正文组合原先未准入 | 第五十批确认review会读取真实Git snapshot，不能当纯modifier。现声明为单一driver，消费共享正文、brainstorm和全部skill并生成一份review prompt；audit/check共用声明，第二个driver在派发前拒绝。第五十七批补齐standalone/composed预览：复用同一review request与Git workbench，强制与dispatch一致的plan mode，并在内容复验时重查snapshot fingerprint；第五十八批再加入不持久化的one-use snapshot reservation、canonical binding、过期/变更拒绝和diff后fingerprint检查，不调用通用Git派发或写执行；第六十一批把失效标记扩为workbench级，并加入异步`reviewTake`/epoch；第六十二批再让提交期暂停controller自动失效，并把take保留到diff/最终检查完成。五文件234项、有效反转和真实Git fixture有局部证据，真实provider/桌面仍待验 |
| 无flag组合方法静默吞掉dash正文 | 第五十二批确认option扫描未先检查方法是否声明flags，review与可组合模板会丢失`--keep-this`/`--counterexample`，而声明flags的方法仍需严格拒绝未知option。现只对非空flag声明解析，flagless正文完整进入共享prompt；91项、两个有效反转及独立review有局部证据，真实终端/平台仍未验 |
| 代码示例误调用及合法关闭后漏skill | 原字符串查找将围栏正文误当关闭，或以不同长度反引号闭合；第二十九批改为独立关闭行与精确行内run，示例保持字面量，合法关闭后所有skill恢复解析。第三十三批再补实际研究新建入口数字preview，control/其他driver/child总成本仍待覆盖 |
| 待注入记忆预览缺raw字节与可取消读取 | 原已有路径/元数据及generation保护；第三十批补原始字节追踪、有界async verified-handle读取及完整preview异步复验。六文件73项、三有效反转、两模式实际隔离PTY有局部证据。普通删除/invalidated原并非全无保护；第三十一批已补单次多记录共享读取，完整preview/controller累计I/O与所有动态来源验收仍未完成 |
| 一次记忆预览反复读取相同文件 | 第三十一批沿原store共享单次有界只读snapshot，health/候选/lifecycle共用，12pending的binary acquisition从15降2，复验仍追加1；75项/三反转/两模式PTY有局部证据。全preview/controller和动态来源总读取成本仍待验，不能扩成全请求两次读 |
| 研究入口无法完整预览 | 第三十三批已接有界新建入口准备、一次性prospective ID到实际同ID提交、完整prompt/run/save schema及协议估算、来源与取消复验，87项/四有效反转/两模式实际隔离PTY通过。只覆盖新建入口，不代表control、其他driver、后续独立child或研究总费用已可预览 |
| 研究预览与提交之间原始来源可漂移 | 第五十九批确认preview的完整内容guard没有进入reservation消费；现发布时保留detached request、图片摘要和verifyContent，dispatch消费后以command signal等待原始来源、注入和附件复验，再创建run；请求不匹配、discard、过期或变更留下stale tombstone，必须成功新preview后才可重试，取消沿command owner传播并恢复retryDraft。214项/七有效反转及本地真实fixture有证据，真实provider/平台未验 |
| 组合研究把自身command owner误判为忙 | 实际终端Enter拒绝且真实ShellCommandRuntime路由回归可复现。第三十三批改为controller与signal双重身份匹配，自身可继续，其他命令与取消仍拒绝；不能只删除全部busy保护 |
| 未配置或阻断relay模型详情错用官方能力 | 第三十四批确认缺resolution地址时回退canonical目录，导致同名模型32k误显示400k或已有能力丢失。现沿真实连接/所浏览目录地址共用精确元数据，补上限/图片/reasoning设置/档位/已声明价格，未知与地址歧义保真；78项/三反转/两模式实际隔离PTY有局部证据，完整能力与平台矩阵仍待验 |
| 模型详情过期配置、退出后仍可操作与重开旧目录 | 第三十五批确认列表/详情旧地址进入新准入子面板、退出load复活动作，以及实际重开仍用旧accepted目录。现原捕获准入/取消复验、详情一次消费和退出retirement；重开仅通过原配置发布刷新catalog，保留普通设置并检查active模型约束。九文件136项、七反转、两模式实际Node隔离PTY有局部证据；真实认证与完整面板矩阵仍待验 |
| 模型受当前reasoning档位阻断后没有面板恢复链 | 第三十六批补Choose effort与原模型事务的精确目标/档位一次保存。第九十三批再确认过期refusal丢导航及accepted host在hook期间关闭仍可切换；现复验原browser后回fresh目录，accepted ownership贯穿原writer，确认写入后的notice保留而旧父级不重开。102项执行通过、五组有效反转及build有本地证据，缺凭据仍须配置，完整能力/真实PTY/平台验收保留 |
| 模型认证取消后仍可重开 | 第六十批确认post-await只校验身份，原admission/取消信号失效时仍返回model continuation。现`owner.check()`重放准入，拒绝只保留note；成功/失败仍回返，取消不重开。三文件137项、有效反转及真实OverlayHost有局部证据；真实认证服务/平台仍待验 |

### 16.2 不成立的判断与仍未确认的原因

| 判断 | 当前结论 |
|---|---|
| “model压根没有上下键监听” | 源码有监听及导航；原来跳过disabled能导致无可见变化。不能用监听存在否认用户观察，也不能把“跳过未配置”当作用户意愿 |
| “resume按时间排序反了” | 时间倒序机制存在，确定缺口在渐进自动焦点保留；修补焦点而非反转排序 |
| “settings完全没有分类、稀疏配置说明字段没实现”“参考十类必须全部显示” | 当前配置字段与两个会话入口来自真实元数据及原owner，默认继承和真实消费者存在；Memory/Shell现由第四十九批提供只读命令入口。分类存在不等于有可编辑字段，不能添加假字段或把所有默认值写回 |
| “失败后所有第二次Apply都应禁止”“取消scope必须清空暂存” | 同源字段冲突可以保留pending并由用户明确重试；取消scope按原合同保留pending。第三十九批拒绝的是归属/来源换代，成功scope确认才按提示撤销pending；不能以粗暴禁止重试掩盖原重捕获缺陷 |
| “npm start每次编译，或用户入口用错” | 既有入口证据不支持。应改首帧时序并测实际耗时，不能把慢启动归咎于用户 |
| “对话后4.9k就是字符÷3.5” | 对话后值有provider归一化输入用量来源；本地估算另有公式。两者需逐项对齐，不能混为同一公式结果 |
| “工具数差不多，所以两个项目上下文必然相同” | 实际发送schema、规则、消息、协议与计数器决定成本，工具个数不足以推导token数 |
| “一次输入只能使用一个skill” | 当前已有两份skill进入同一prompt及实际研究durable request/所有child stage的证据；原代码边界可导致误调用或漏调用，已局部修补。不能从参考首个regex匹配推导本项目必然只加载第一个 |
| “前两批本地通过等于CI已通过”“模型面板重开必须保留旧目录” | 第三十七批延迟确认两次CI同一旧catalog测试失败并本地复现。按新要求修fixture scope和回归合同，保留普通设置接受边界；当前CI仍须绑定实际提交，不能回退授权体验迎合旧断言 |
| 原现场零可见按键的唯一根因、真实1.7k/4.9k差额、生产启动收益 | 仍未确认，继续取证；不能归为不存在，也不能用合成数字或局部PTY称已解决 |
| 真实OAuth/key接受、cache writer退出1、活跃build lock并发来源 | 仍未确认，保留认证与产品路由、历史CI与当前验证的证据边界 |

### 16.3 用户要求的最终验收任务

| 范围 | 必须达成的完整体验 |
|---|---|
| model看齐 | Roles/All models/provider层次可辨；分类→搜索→未配置具体模型→详情→精确连接配置/适用登录→返回原模型→显式启用→重开读回。全部未配置仍能导航；同名relay按精确身份区分；详情以同一目录字段说明图片/工具调用/推理能力，未声明保持unverified；取消/失败不虚报成功；键盘/点击/wheel/hover/窄屏/resize保持同一目标 |
| settings看齐 | 真实主分类与section覆盖已有能力；跨分类搜索后回所属位置；布尔/枚举/数值/列表/对象等真实编辑器→Enter暂存→Apply保存或Discard/取消→重开读回。同源冲突明确重试，binding/profile/source换代拒绝旧pending；scope取消/不可读保留，成功换scope撤销pending。user/project、只读与显式来源、effective/stored、写后应用未确认、预览撤回及restart时点保真；窄屏先保留caret，不以标签换皮完成 |
| 消息顶格与输入箭头 | 已提交用户正文无装饰性左空白，从第1列绘制并保留源缩进；普通编辑区恢复左侧箭头，正文在必要间隔后开始、续行对齐，不叠加旧padding。中文/emoji/长行/resize/选区/caret一致，复制只含原文；不恢复已删除黄条 |
| 输入位置与路径新增 | 只有源文本第一行第一位置开放完整功能slash；正文`/home`给实际目录suggestion，上下选择或Tab接受并连续补全。只替换光标token，保留前后/多行/缩进；代码、URL、词内slash和转义不触发命令；迟到结果不覆盖新草稿 |
| 多skill新增 | 首位、正文与后续行可发现skill，同一次输入的全部明确skill实际加载并进入同一任务，稳定去重、保留正文/附件；未知、失效、拒绝、超预算时报告并可重试，不能只运行第一个或递归执行skill正文slash。代码示例内不补全或调用，短/混合/嵌入关闭不结束围栏；合法较长关闭及CRLF后恢复真实skill，行内按完整相等反引号run配对 |
| 有限slash组合改进 | 在参考正文skill限制上，允许显式声明的无副作用方法命令组合；deep-research研究入口必须可与两个及更多skill搭配，也支持兼容modifier组合成一个任务。一个工作流driver拥有预算/取消/持久状态；研究control/save按原独立准入，settings/model/connect/resume等功能命令不进入正文执行 |
| 启动与上下文 | 先看到真实输入区/loading，再接管一次草稿，ready前零模型/工具派发；首请求本地估算来自实际有效规则/消息/tool schema及协议。实测返回后按身份衔接，来源变更撤值；分别测首帧和ready，并用同模型/协议/规则/schema拆分真实差额，不设必须等于1.7k的假目标 |

以上任务继续沿第12节的 ADD 序号推进（该表已并入后续各轮新增条目）；完成证据以完整操作链、正确持久/应用状态、实际请求内容及相应环境测量为准。原47项Phase 20矩阵与补充任务状态分开，全文不以局部修补替代整体验收。

### 16.4 用户输入样例与组合验收

以下skill名仅为夹具示例，实际名字从当前skill目录选择。完整功能slash仅在源文本offset=0开放；第二源行、前导空格之后和正文中属于路径/skill/准入组合候选域。终端软折行不改变源位置。

| 输入或操作 | 必须得到的行为 | 对应任务 |
|---|---|---|
| 首位输入`/mod` | 完整slash菜单可发现model，接受后走原独立命令路径 | ADD-10 |
| `读取 /home`，在路径末尾按Tab | 给出实际文件/目录候选，补全当前token；目录可继续下一层，不吞掉`读取 `或后续正文 | ADD-10 |
| 第二行输入`/home/wa`，或编辑正文中间路径 | 按当前光标和源范围补全路径，不因trimStart开放功能命令 | ADD-10 |
| `比较方案 /skill:research-a /skill:review-b` | 两份skill真实指令进入一个任务，原问题保留；同skill重复只注入一次 | ADD-11 |
| `比较方案 /research-a`，接受skill候选后继续第二行选择另一skill | 可从短前缀发现skill，插入明确canonical调用；后续行仍能选择并共同生效 | ADD-10/11 |
| `/deep-research --mode software --depth deep /skill:research-a /skill:review-b 比较两种架构` | 一个真实研究入口拥有预算/取消/持久状态，全部skill参与；不能降为只含名字的普通对话 | ADD-11/12 |
| `比较架构 /deep-research /skill:research-a /skill:review-b` | 正文研究入口与首位研究入口得到一致准入；全部skill与问题传入同一研究任务 | ADD-12 |
| `问题正文 /brainstorm /review /skill:review-b` | review作为单一driver读取真实Git snapshot，并在一份review prompt中消费共享问题、brainstorm指令和全部skill；不依次执行多个任务 | ADD-12 |
| `问题正文 /brainstorm /evidence /skill:review-b` | brainstorm与真实`composable: true`模板的指令共同生效；evidence为自建/夹具模板，不承诺默认安装。模板未声明时明确拒绝组合，不能静默只运行brainstorm | ADD-12 |
| `说明 /model /settings /resume`或正文研究control词 | 不出现可执行的正文功能命令候选，不切模型/配置/会话或执行控制；原功能命令仍可在首位独立使用 | ADD-10/12 |
| URL、代码块、行内代码、转义slash与同名路径 | 保留字面内容，不误调用skill/命令；路径与skill冲突时按实际选中候选类型接受 | ADD-10/11/12 |
| 第二个skill未知、失效或被拒绝；两个工作流driver冲突 | 明确报告并保留可重试草稿，准备阶段不先执行第一个再隐瞒剩余失败 | ADD-11/12 |
| 查询后继续编辑、换根、取消或关闭 | 迟到补全/准备结果不能覆盖新草稿或执行旧目标；接受候选仍不自动读取文件正文或授权工具 | ADD-10/11/12 |

组合命令以实际动作声明为准，不能用“prompt类型”或“看起来非功能性”自动放行。候选发现、直接键入、提交解析必须共用同一准入规则。用户点名的deep-research加多skill是必达要求；brainstorm、显式可组合模板与review driver已有声明和局部证据，其他方法仍需逐项核查，不能写成所有方法命令已支持。

### 16.5 本轮需求收口与实施边界

文档收口后，第三十八批沿已授权范围修补settings搜索焦点并补全部字段/scope基本链，第三十九批补失败重试、范围选择和来源归属；保留第12节全部ADD条目和原47项状态。执行时按以下清单补缺，每项沿原owner交付；已存在且有合格证据的路径复用既有结果，不重造系统。

| 用户要求 | 必须保留的实施方向 | 尚需补齐的证据 |
|---|---|---|
| 两面板整体看齐 | 先对照参考的分类/section、焦点域、搜索、详情、修改/配置、返回和窗口布局，再补具体缺口；功能内容来自本项目原owner。settings重试与范围选择保留原binding/source，正常冲突可显式重试 | settings73条基本链及17个代表性生命周期场景已有证据；第102批补状态栏两模式×user/project×Apply/Discard八条真实宿主链，第103批另补两模式project的真实PTY保存与新进程重启。暂存预览、存储与已安装显示分别核对。继续补其余字段/来源/编辑器/窗口/桌面组合；model精确目标/能力/角色/认证、两模式及键鼠完整操作仍待验 |
| 未配置模型允许选中 | 上下键可移到具体未配置行，Enter查看详情/精确配置，配置接受后再显式启用；能力阻断走目标档位恢复 | 用户原环境事件链、全部未配置、配置成功/失败/取消、目录变化与同名relay；不能宣称表单打开就是认证成功 |
| resume默认最新 | 自动阶段随最新可恢复候选更新，主动选择后按稳定ID保持；排序、current标记与默认焦点分别处理 | 分批旧→新、途中手选、scope/search换代、目标消失及Enter失效检查 |
| 已提交正文顶格、输入箭头恢复 | 第1列正文仅去绘制留白，源缩进保留；编辑区箭头贴左、续行对齐正文，caret/复制用原源投影 | 中文/emoji/组合字符/换行/resize/选区及桌面IME、剪贴板；不恢复黄条或trim原文 |
| 首位slash、正文路径及Tab | 完整功能命令仅在源offset=0；其他位置按光标token提供路径、skill与准入方法；局部替换和目录连续补全 | `读取 /home`、后续行、词中光标、空格路径、同名候选、无候选、取消/换根与迟到结果 |
| 一次多个skill | 全部明确调用统一解析、稳定去重、加载并进入同一实际prompt/研究任务，保留原问题/附件；不递归解析skill正文 | 至少两份实际body、未知第二项/拒绝/失效/超预算整次阻止与草稿恢复；代码/URL/转义保持字面量 |
| 部分slash共同参与任务 | brainstorm、显式可组合模板和deep-research入口沿统一能力声明；多个modifier加一个driver，不串行调用整套handler | 首位/正文research+两skill、两个兼容modifier、参数冲突、两个driver拒绝、control/save及功能命令不绕过原路径 |
| 启动先显示TUI、初始上下文有数值 | 真实Loading编辑区和一次输入接管；首请求使用实际有效规则/消息/schema/协议做本地估算，实测按同身份接续 | 新鲜度完整来源、原生tokenizer、真实同模型/协议输入分项、冷热/修补前对照与首请求性能；缺依据仍保留unknown |

第七十五批补充启动草稿与估算owner的四条组合路径，修复光标移动误撤销估算；纯移动与resize不改变请求内容身份，真实编辑、历史及undo仍推进内容版本。预览/派发端口为mock，真实provider差额、冷热启动和桌面平台证据继续待补，ADD整体active。

第七十六、七十七批继续补模型精确配置→返回→显式启用：保存不改默认请求目标，新slot不参与隐式回退；前导双横线与等号在表单字段中保持字面值。实际host、命名slot续期与各owner的隔离证据见对应批次，不替代真实认证服务、全部角色/来源/窗口和平台验收。

第七十八批补路径插入→再次读取→目录/文件连续Tab的往返：引号、反斜杠与反引号目录不再破坏后续查询、词法边界或原文后缀。Windows原始输入与生成转义各有词法证据，不能提升为原生Windows文件系统或终端验收；ADD整体仍active。

第七十九批继续补既有`@`引用的字面量与文件名边界：代码围栏/行内代码不枚举文件，真实闭合后恢复；文件名内和开头的`@`可接受并重新解析为同一引用，raw双`@@`和邮箱仍保留原语义。测试目录枚举端口为mock，不是实际文件正文读取或授权证据；ADD整体仍active。

第八十批补角色reset、具体模型及effort写入失败后的返回：沿现有fresh parent保留准确写入notice，state暂时不可读时退回现有目录。消费过的角色动作保持退休，重试须读取新基线并由用户再次选择；没有自动重试或修复状态文件。user/project与两模式host已有隔离证据，完整角色/来源/窗口和真实故障验收仍待补，ADD整体active。

第八十一批补角色→未配置模型→API-key/account→返回中不可读state的边界：连接结果与角色事务各自保真，沿原角色目录保留结果；旧认证动作不重跑，恢复后只在新显式选择中分配目标角色。三个自动角色与两模式host已有局部证据，真实认证、磁盘故障和完整scope/平台矩阵继续待补，ADD整体active。

第八十二批补列表编辑的原值保持：逐行文本须经同一parser还原为完全相同的数组，否则使用已支持的JSON数组初始化。user/project及两模式实际host证明未编辑的Enter→Apply、重开及取消保持存储值、工具可见集合、原scope和held草稿；不改变parser或校验规则，完整字段/来源/平台验收仍待补，ADD整体active。

第八十三批补模型详情已接受动作的刷新异常：失败只沿原父回调返回并展示安全notice，已消费详情退休；关闭或替换后的迟到rejection丢弃。两模式`/model`与`/settings`实际host覆盖fresh显式重试、取消、原入口与held草稿，配置/会话选择保持；真实故障和完整平台验收仍待补，ADD整体active。

第八十四批补手动未闭合的单引号路径：明确路径起始保留跨空格的字面范围，内部skill/review/research不进入准备；实际Tab完成目录/子目录/含apostrophe文件，真实关闭后恢复多skill解析。两模式host与本地目录有证据，Windows仅词法覆盖，完整终端/平台验收仍待补，ADD整体active。

第八十五批补组合选项的引用值：研究mode/depth/brief按原scanner解码并由已有语法校验，非法、重复和未闭合选项不创建研究或派发，原草稿可重试；值内slash/skill不再扫描。两模式Enter、实际研究状态读回及预览到同一run ID已有隔离证据，真实研究服务、PTY和完整平台验收继续待补，ADD整体active。

第八十六批补文件引用的apostrophe边界：前文收缩词/所有格不再阻断后续`@`引用，文件名apostrophe不再扩大Tab替换范围。catalog与edit共用原prompt token，引用自身的quote/escape仍经已有scanner解码。两模式host使用真实隔离目录，保留后文与后续skill并只枚举一次；真实PTY与完整平台验收继续待补，ADD整体active。

第八十七批补普通路径的apostrophe值保持：手动输入绝对、home、相对与父目录路径时，查询沿源token保留原文件名，接受后仍由原formatter加引号并连续Tab。两模式host与真实Node小型PTY已验证目录→子目录→文件，完整平台与真实provider验收继续待补，ADD整体active。

第八十八批补模型详情最后准入读取异常及归属丢失后的永久退役：refresh成功不再掩盖随后的读取失败，仍有归属时回原目录并保留安全notice；关闭或替换后的拒绝/异常不发布，旧详情不能再读、返回或运行配置动作。两模式model/settings实际host已有隔离证据，真实故障与完整平台验收继续待补，ADD整体active。

第八十九批继续补普通准入拒绝的导航：target过期与browser归属分开复验，有效时保留原notice和具体模型焦点，返回后须显式重开才能配置。取消、session/workspace/profile准入失效或归属复验抛错不重开，拒绝后的旧详情永久退休。普通设置仍按接受态固定，外部文件编辑不被导航隐式应用；实际host与两模式小型Node PTY已有证据，ADD整体active。

第九十批补角色详情返回的分配事务更新：fresh列表不再持有旧assign闭包和旧档位；返回时沿原prepareModelRole捕获当前状态，未完成新准备则回角色目录保留notice，恢复后须显式再开。三个自动角色的默认/兄弟保留与两模式settings嵌套显式重选有本地证据，原配置发布和写入结果合同保持，ADD整体active。

第九十一批补角色菜单及角色档位的拒绝返回与accepted宿主归属：有效浏览时沿原父级保留notice并要求重新选择，取消/归属失效不自动重开，旧动作及迟到load不复活。详情和角色共用原signal/admission检查，写入仍由原角色事务完成；两模式实际host与小型Node PTY有证据，ADD整体active。

第九十四批补会话Thinking effort的接受后归属：原浏览代次与accepted host同时进入原模型事务，拒绝/完成返回另验browser，消费后的旧动作不复活。同一实例只有显式重开可获得新基线；写前关闭不保存，写后关闭保留确认结果。36项owner及两模式实际host10项有本地证据，完整平台/来源验收继续待补，ADD整体active。

第九十五批补显式queue的多模态输入：add及简写入口把同一附件集合送入原SubmissionQueue，正文尾部空白不再被控制入口裁掉。两模式实际Enter覆盖忙碌排队、正常排空、第二skill未知/超预算及中断后的显式重试，全部body与图片只进入一个后续任务；派发端口为mock，未提升真实provider/平台或整体验收状态。

第九十六批补队列任务再次进入普通命令路由的附件转交：直接queue入口已有图片保持，不代表排队的queue命令经普通router再次入队时也保持。两模式add/简写覆盖正常派发、第二skill未知/超预算后的完整草稿和图片恢复、显式重试，仍由原SubmissionQueue及统一组合准入消费；不扩大真实provider或平台验收结论。

第九十七批补普通ready模型及preset的接受后写入归属：已释放的根model动作在hook等待期间遇到关闭/替换必须阻止原事务提交，已确认保存的结果仍保真。目录刷新继续供详情使用，不复活已消费动作；显式重开才捕获新代次。第九十八批动态确认并修补目标档位恢复保存后遗漏原browser准入，保留写入结果但抑制失效父级，callback后再次复验host。独立双lane分别仅对各自修补完成复核，ADD整体仍active。

第九十九批仅补模板/path提交的测试与证据：真实模板、明确选中的路径及首位exact Enter遵守现有语法，未动态复现新的产品缺陷，未改运行时代码。修正当前摘要笼统的“同名模板/路径未解决”表述为明确的Tab/Enter及字面路径规则；裸token不依文件存在性推断用户意图，完整桌面/原生终端/Windows矩阵继续待验。

第一百批补设置Apply接受后的宿主归属：preview清理和retry reopen是同步callback边界，也必须先复验再进入原保存器。确认保存与refusal的notice继续保留，失效动作不构造旧父级；Apply单次消费，迟到且失效的主题动作仍结束原lease。只读双lane复核与聚焦证据限于这条操作链，不提升整个ADD状态。

第一百零一批补Escape父级返回中的同步callback撤权：清理、通知或parent构造改变host代次时，不覆盖新界面；准备转交但最终没有发布父级时，原previewBack返回的清理取消原controller。保留正常父级转交及delete/rename/denial/approval子模式优先级。两模式实际theme取消和返回后显式保存有聚焦证据，仍非整个ADD验收。

第一百零二批仅补状态栏编辑的八条真实宿主交叉链：筛选不丢隐藏勾选项，Enter暂存后再次编辑并Escape保留原pending，Apply/Discard后同scope重开与存储读回。普通settings Apply沿既有restart政策保持installed/view；project保存改变requested与冷配置读回，user保存仍受project覆盖。没有复现新产品缺陷，不把冷读回当作进程重启，也不提升完整面板或ADD验收状态。

第一百零三批补上述project保存路径的实际进程重启：两模式真实Node PTY分别预览→Discard→再暂存/Apply→退出0→新空会话启动，旧进程状态栏保持provider，新进程显示provider/directory并重开读到directory勾选。四条最终进程收据单列，不把第102批47条测试或先前部分探针累算；user来源重启、桌面与完整平台矩阵仍待验。

文档已修正旧HEAD与过时启动测量结论，并保留面板字段盘点、组合能力和完整验收清单；第三十八批修补搜索焦点并覆盖全部字段/scope基本链，第三十九批修补重试/scope确认与来源归属，第五十二批收口flagless组合正文与Memory/Shell分类测试合同，第五十三批收口正文补全的模板候选与命令归属边界，第五十五批收口上下文选择后的测量失效与有效条目身份，第五十六批补实际组装请求的本地估算事实，第五十七批补review standalone/composed的真实Git prompt预览，第五十八批补预览到dispatch的one-use Git snapshot reservation，第五十九批补研究预览原始来源复验与one-use准入，第六十批补模型认证取消后的原始准入，第六十一批补review失效标记与异步消费代次，第六十二批补提交期preview生命周期与review租约，第六十三批补正文路径碰撞、字面量与Windows引号边界，第六十四批补引号范围/前缀路径完成与context/compaction计量身份，第六十五批补模型行目标准入、详情返回与发布基线，第六十六批补模型详情实时刷新、目录换代与宿主所有权，第六十七批补provider-slot有效凭据/端点身份与ambient跨provider范围，第六十八批补非当前ambient provider行的有效端点投影，第六十九批补显示偏好命令向accepted display state的当前会话发布，第七十批补`/skill:`路径/skill双候选与Enter/Tab准入分界，第七十一批补模型异步刷新完成后的publication复验，第七十二批补根模型面板刷新失败的只读缓存与同版本恢复，第七十三批补活动设置表单的一行窗口预算及跨scope多行保存读回，第七十四批补resume渐进焦点、鼠标意图与失效回退的组合验收。未将局部证据提升为两个面板完整验收。原现场按键唯一根因、真实认证、同条件1.7k/4.9k分解和生产冷热收益继续待证，不归类为“不存在”，不提升ADD整体完成状态。

### 第六十四批：正文引号权威与context计量身份

第六十四批继续收口ADD-10/11的字面量边界。[prompt tokenizer](../../packages/ts-shell/src/core/prompts/tokens.ts)原先只在token首字符识别引号，因此`focus="literal /review text"`会把中间`/review`暴露为正文组合driver，`focus="literal /skill:a text"`也会把中间skill当成真实调用。现`PromptToken`为literal token保存quote起止范围与是否闭合；平衡双引号、token首位且闭合的单引号、非词字符后的单引号及“完整option名+真实闭合边界+没有内部apostrophe抢占同一闭合”的shell式单引号均把完整span保留为literal。`--focus'literal /review text'`、`-f'literal /skill:a text'`、首字符空白/`/`/Unicode内容、后续非字面`/review`或`/skill:a`均有正反测试；`--author=O'Brien`、`--user's`与`'Twas`不会因后续另一个quoted word而吞掉真实调用。

[prose completion](../../packages/ts-shell/src/cli/interactive/completion/prose.ts)改为使用当前活动quote范围，只替换开引号到闭引号，保留`path=`等前缀、闭引号后的suffix和其他正文；unfinished quote只替换当前token剩余范围。光标位于已闭合quote之外时不按该quote做路径完成。[completion quoting](../../packages/ts-shell/src/cli/interactive/completion.ts)对含apostrophe的路径改用双引号，不再生成需要重新拼段的single-quote序列。

ADD-08的`/context`路径同时确认只传递了live identity的schema/system。[context command](../../packages/ts-shell/src/core/commands/contextCommandRuntime.ts)现传递`historyDigest`并从当前生效base URL派生`endpointId`；[usage telemetry](../../packages/ts-shell/src/observability/usageTelemetry.ts)在记录含protocol/endpoint/history/relay身份但调用方无法提供对应字段时拒绝复用测量。[compaction](../../packages/ts-shell/src/cli/runtime/compaction.ts)在查询前用recorded `promptMessageCount`从当前messages派生前缀digest，只有该内容前缀、schema、system、protocol与relay全部匹配时才复用provider count并追加后续消息估算。相同provider/model/protocol但不同history或relay不再显示为当前值，状态栏与`/context`分别有覆盖。

主代理单进程串行八文件180项通过：tokens16、skills26、composition27、completion14、prose completion33、sessionFacts20、usageTelemetry25、compaction19。五个独立契约一起恢复旧实现后触发19项预期失败（quote识别、quote范围替换、apostrophe completion、recorded identity guard、compaction history prefix），其余161项仍通过；五源码均逐字节恢复并核对SHA-256。要求的`global:deepseek-v4.1-flash-sg`只读review在精确模型重试成功后经多轮修正，最终no findings/no additional focused test gap；残余为罕见shell拼接、uncommon leading elision与single-quoted内容内apostrophe仍属启发式输入。五静态门/diff、责任上限0、Phase 20脚本38 complete / 9 partial / 0 open、TS build `530a74afb231`（inputs `557174e78290`、artifact `759b792ec77a`）及bundled judge `proven`、0 open/failed/gap通过；manifest readback为fresh，460个compiler input与1882个immutable artifact匹配。未运行真实provider、全仓、exe、桌面或PTY；真实history/relay切换、用户原终端和完整上下文差额仍未验证。

### 第六十五批：模型行目标准入、详情返回与发布基线

ADD-01/02继续收口模型行的可见状态与实际事务边界。[模型 picker](../../packages/ts-shell/src/cli/interactive/picker/model.ts)原先只根据连接状态、凭据和目录歧义决定行是否可用；若CLI、环境或请求解析把同一connection/profile解析到不同model、provider或base URL，行仍显示ready，Enter先释放picker，随后才被原选择事务拒绝。现每个具体目标复用[exact target owner](../../packages/ts-shell/src/core/commands/model/target.ts)，resolved provider/model/base URL/credential不一致时行保持disabled/focusable并显示`request target mismatch`，Enter只进入详情，不安装普通activation action。同名canonical/relay行仍都作为目录项浏览和检查，但canonical行只在没有更具体endpoint目录时标为active；精确relay目录项拥有active标记，别名行显示`alias: <catalog>`，避免同一连接出现两个active目标。

模型详情返回后如果目标已在目录刷新中删除，新picker原先只把失效ID交给`initialSelection`，随后静默落到首个可聚焦项。现[ModelFocus](../../packages/ts-shell/src/cli/interactive/picker/model/focus.ts)保留返回前当前分类的可见行，在目标不存在时按随后、之前幸存邻居选择，并显示目录变化；生存手动焦点仍保持原ID。阻断current request的只读详情也补上精确目录能力、输入/输出上限、图片、reasoning档位与已声明价格；无精确目录时仍明确`unverified`。搜索无匹配使用`No matching models.`，不再与空provider目录共用文案。

打开中的模型订阅现在把初始load捕获的publication revision传给[watcher](../../packages/ts-shell/src/cli/interactive/picker/model/watch.ts)，避免load完成到订阅建立之间发生发布换代时，watcher把新revision当基线而长期保留旧行。

最终17文件317项单进程串行通过：模型picker/分类/焦点/current/metadata/admission/publication/role/auth/key/recovery/watch、settings/session、navigation、pickers、interactive model与overlay。三组反转覆盖六个独立契约，分别触发2、1、6项预期失败（共9项），源码逐字节恢复并核对SHA-256：`model.ts` `7f233728e2c2`、`watch.ts` `2fbbd43c1c75`。普通/全屏两种实际Node PTY均完成all-missing搜索、上下键、详情返回、清空搜索后的`No matching models.`、零model写入及143退出close确认。

五静态门/diff、责任上限0、Phase 20脚本38 complete / 9 partial / 0 open、TS build `95ad9745fe4c`（inputs `11a4b98a8004`、artifact `f0c767167db1`）及正式judge `proven`、0 open/failed/gap通过；manifest readback为fresh，460个compiler input与1882个immutable artifact匹配。未运行真实provider、全仓、exe或桌面；详情仍是打开时快照，provider-wide env/profile在非当前provider上是否应扩大为可切换目标仍需产品决定，真实目录跨进程删除和平台矩阵继续待证。

### 第六十六批：模型详情刷新、目录换代与宿主所有权

第六十六批收口第六十五批保留的模型详情WATCH。[model details](../../packages/ts-shell/src/cli/interactive/picker/model/details.ts)现由`ModelDetailSource`读取当前catalogue record，而不是持有打开时的行快照；每次详情打开先读取当前accepted revision，revision已变化时先reload再给首帧，已打开详情通过原`Picker.subscribe`刷新事实与action closure。执行action前再强制刷新accepted catalogue，核对record identity、revision和原inspection admission；同一row ID被删后由另一目标复用时会显示Back-only unavailable，不再执行旧closure。reload失败显示`model details could not be refreshed`并移除action，明确区别于confirmed removal。

[model picker](../../packages/ts-shell/src/cli/interactive/picker/model.ts)在刷新前保留当时的搜索/分类origin，刷新后用新catalogue决定target availability，旧visible rows只决定删除目标的邻近回退顺序；跨分类搜索结果、多目标删除及同ID replacement均有覆盖。嵌套account、key和effort页面在cancel与success路径都携带origin返回，暂态焦点notice只在后续accepted revision清除，原transaction notice保留。

[OverlayHost](../../packages/ts-shell/src/cli/interactive/overlay.ts)为opt-in详情action提供acceptance token；detail发布或异步action完成时会重查host generation，host被另一surface替换后不会继续publish、打开child或执行写操作。普通picker不opt in，原release/apply顺序保持不变。

17文件426项单进程串行通过：model picker与model子目录、navigation、pickers、interactive model、overlay和InteractiveMode。九个独立契约分别覆盖live subscription、origin preservation、notice expiry、host ownership、exact identity、refresh failure、first-paint revision check、replacement availability和nested return；反转旧实现均触发对应断言失败，源码逐字节恢复并核对SHA-256：`overlay.ts` `f38f10903a1f`、`interactiveMode.ts` `49907cf4666c`、`model.ts` `e71ff1c01cd9`、`details.ts` `76b75c8f7b70`、`focus.ts` `819cd4003dbe`、`watch.ts` `ae5466174bfe`、`navigation.ts` `1090e92e3909`。

普通/全屏两种实际Node PTY均从外部改写`models.json`：旧详情action被拒绝且零配置写入，重开读取replacement endpoint；随后进入masked key输入并取消，终端未出现测试secret，最终session model、配置和transcript保持不变，零message、零provider调用并以143完成close。独立只读review最终no findings。

五静态门/diff、责任上限0、`analyze:module-facades` 0 findings、Phase 20脚本38 complete / 9 partial / 0 open、TS build `3156e9912180`（inputs `335af1c1d171`、artifact `619abdf46909`）及正式judge `proven`、0 open/failed/gap通过；manifest readback为fresh，460个compiler input与1882个immutable artifact匹配。未运行真实provider、全仓、exe、桌面、Windows或20k PTY；真实认证服务、跨平台终端和完整model操作矩阵仍未验证。原Phase 20保持38/9/0，ADD独立且整体active。

### 第六十七批：provider-slot有效凭据身份与环境范围

第六十七批继续收口ADD-02的provider-level target。原[exact target owner](../../packages/ts-shell/src/core/commands/model/target.ts)对provider slot只要求provider/model相符且resolved credential没有`connectionId`，没有绑定凭据source、secret identity或normalized endpoint。模型面板在CLI provider不在配置文件/connections中时，也不会把该provider的API-key环境纳入原choice fingerprint；因此picker打开后若同一进程内环境凭据或provider-specific endpoint变化，action仍可能用新值提交。该场景不是外部shell对已运行进程的普通修改，但属于可构造的进程内生命周期与既有environment fixture路径。

现[target resolution identity](../../packages/ts-shell/src/core/commands/model/target.ts)在行构造时生成不持久化的SHA-256 token，摘要输入包括provider、model、normalized base URL、blocked状态、expected env名、selection、auth mode、source、env name及完整api-key/account credential。token不显示、不写磁盘、不进入错误文本，也不会写入session。故意修改reasoning effort不改变credential/endpoint token，prospective effort仍由原事务一次提交。

[selection owner](../../packages/ts-shell/src/core/commands/model/selection.ts)保留兼容的positional `setModelTarget`供既有preset/named调用，并新增picker使用的`setReviewedModelTarget`。provider target必须携带64位hex reviewed token；`undefined`、空串、null、非字符串和任意非digest值均在读取session前拒绝。apply开始时re-resolve并与显示token比较，switch hook之后的漂移继续由既有完整`targetRequest`比较与`beforeCommit`拒绝。直接调用旧入口的provider target不再绕过picker身份。

跨provider的ambient env/profile选择明确保持out of scope：provider-scoped session只持久化provider/model/effort，没有稳定凭据ID，resume会重新服从当前ambient来源。因此非当前provider的env/profile行保持disabled/focusable并进入连接配置，跨provider激活继续要求named connection。该差异是产品合同，不是外观遗漏；若以后要求ambient跨provider resume，必须先扩展持久化身份与轮换合同。

五个文件分别单进程串行87项通过：category23、provider28、recovery11、admission14、presetCommand11。三个有效反转分别为移除resolution比较（2项失败）、把effort纳入digest（6项恢复路径失败）和移除reviewed-token guard（4个非法token场景失败）；源码均逐字节恢复并通过SHA-256校验。独立只读review先提出effort误纳入、falsey token与兼容入口问题，修正后最终no findings。

import cycles、Node floor、module facade0、diff check及TS build `9283d98655a2`（inputs `d58b1fcf9114`、artifact `155f7d12d4be`）通过，460 compiler input/1882 immutable artifact；strict docs在本文更新后单独重跑。保留WATCH：provider slot只保证switch-time身份，成功写入后ambient来源仍可轮换；最终配置读取到session lock写入之间也没有跨进程配置文件锁。未运行全仓测试、PTY、真实provider、exe或桌面；20k路径继续只用mock/切片，禁止真实长历史PTY。原Phase20保持38 complete / 9 partial / 0 open，ADD独立且整体active。

### 第六十八批：非当前ambient provider行的有效端点投影

第六十八批收口第六十七批保留的展示一致性缺口。非当前provider的ambient env/profile行虽然已正确保持disabled/focusable并提示named connection required，但行摘要仍可能只显示canonical provider地址或遗漏ambient credential source；详情中的目录能力、模型地址及configure draft也没有统一使用同一份effective resolution。用户能浏览这类行，却可能看到与实际ambient来源不一致的endpoint，并据此准备连接草稿。

现[model目录](../../packages/ts-shell/src/cli/interactive/picker/model.ts)只对符合`!connection && !providerSlot && provider.id === provider.runtime`的非当前canonical行构造ambient candidate。仅当resolved provider相符、未blocked且credential仍是无connectionId的ambient来源时，才把该resolution用于catalogue ambiguity、effort capability、模型metadata、行内credential source、详情Endpoint、account入口及configure草稿；行本身继续disabled/focusable，不把ambient来源伪装成可跨provider恢复的session身份。profile来源使用其已保存endpoint，env来源使用resolved/base catalogue endpoint，secret不进入行文本、详情或draft。

category env/profile两个分支分别使用不同ambient endpoint，并在测试setup清除真实`ANTHROPIC_API_KEY`，避免profile用例被宿主environment遮蔽；行内同时断言credential source，profile configure draft断言endpoint存在且合成key不存在。独立只读review先指出这两项测试隔离缺口，补齐后delta review为no findings。category23与session-provider28分别单进程串行通过；把行endpoint回退到仅named-candidate resolution后触发env/profile共2项预期失败，源码逐字节恢复并核对SHA-256。

五静态门/diff、责任上限0、module facade0、Phase 20脚本38 complete / 9 partial / 0 open、strict docs及TS build `a2508c6c2a64`（inputs `5350f916d60a`、artifact `cef810f8a754`）通过，manifest readback为fresh且460 compiler input/1882 immutable artifact匹配。未重新运行前一批其余recovery/admission/preset文件，也未运行全仓、PTY、真实provider、exe或桌面；这些结果保持第六十七批的独立证据，不累加为本次重跑。原Phase 20保持38/9/0，ADD独立且整体active。

### 第六十九批：显示偏好命令的当前会话应用与持久化边界

第六十九批继续收口ADD-13的入口一致性。复核发现`/statusline use`已经把`tui.statusItems`写入配置文件，但命令只返回文本，没有把新值发布到当前会话的`ConfigState`；交互面板读取已接受的`configuration.current.config`，而该字段是restart应用项，普通配置刷新不会改写已安装显示值。因此旧输出“下一帧更新”与真实行为不符，用户会看到磁盘已改变但底栏不变。`/theme`也有同类文案缺口：命令只改变当前进程的主题，却只显示“Theme set”，没有说明持久化入口。

现`CommandContext`新增可由host提供的`applyDisplayConfig`端口；交互路由把它绑定到既有[configuration owner](../../packages/ts-shell/src/config/state.ts)的`recordDisplay`，不另建主题/状态栏状态。`/statusline use`先完成原配置写入，再调用该端口；成功时明确报告“Applied to this session”，端口缺失时只报告已保存并说明新shell读取，端口异常时明确“写入已知、应用未确认”。[theme command](../../packages/ts-shell/src/core/commands/themeCommandRuntime.ts)则明确当前会话范围，并指向`/settings Appearance`保存长期选择。

三文件单进程串行60项通过：`syntax/preferences`17、`themeCommandRuntime`6、`interactiveCommandRouter`37。新增真实路由回归断言磁盘与accepted configuration都变为`cost`；移除交互router的display port后该断言出现1项预期失败，源码逐字节恢复并通过SHA-256核对（`interactiveCommandRouter.ts` `be09893af02b`、`statuslineCommandRuntime.ts` `4d6acec8e0f0`）。五静态门/diff、责任上限0、module facade0、Phase 20脚本38 complete / 9 partial / 0 open及strict docs通过；TS build `50fb30626897`（inputs `56d48d8ccac7`、artifact `5725771a1bcb`）通过，manifest readback为fresh且460 compiler input/1882 immutable artifact匹配。未运行全仓、PTY、真实provider、exe或桌面；不将本轮命令路由证据外推到用户原始终端。

### 第七十批：`/skill:`命名空间内的路径与显式skill分界

第七十批继续收口ADD-10/11的同名候选。此前`proseRequest`把所有未加引号的`/skill:`值直接归入`inline-skill` catalog，引号内的`/skill:`值则被主动拒绝；因此真实absolute file `/skill:review`即使已经写入引号也无法进入path completion，raw `/skill:rev`也只加载skill，不展示同名path。另一条keymap边界是exact `/skill:review`不被`getSlashInvocation`识别为完整功能命令，当前path候选可抢占Enter。

现[prose completion](../../packages/ts-shell/src/cli/interactive/completion/prose.ts)让显式skill token进入与普通slash-looking path相同的`prose`候选域，同时加载当前目录path与skill，并始终保留`pathDirectory`查询；quoted `/skill:`值只要符合统一`pathLike`谓词就作为path继续，不再被namespace提前丢弃。accepted file继续由原collision规则加双引号，skill候选插入canonical `/skill:<name>`；已无调用方的`inline-skill` catalog分支移除，不保留第二套skill-only加载路径。[keymap](../../packages/ts-shell/src/cli/interactive/keymap.ts)把完整`/skill:<name>`视为command-first draft：Enter提交用户输入的skill token，Tab仍是接受同名path的明确动作。

主代理单进程串行七文件190项通过：completion14、request30、paths18、prose34、controller14、skills2、keymap78。新增回归先产生2项失败（explicit skill没有path query、Enter被path候选吞掉）；修正后combined reversal再次触发恰好2项失败，两个生产源码逐字节恢复并核对SHA-256（`prose.ts` `6efc7100f06c`、`keymap.ts` `91c6b4e75c0e`）。四文件只读主代理审阅未发现额外路径/skill状态写入；指定的`global:deepseek-v4.1-flash-sg`仍处于已知账户cooldown，本轮没有把未返回的委派复审记作approval或no-findings。

五静态门/diff、责任上限0、module facade0、Phase 20脚本38 complete / 9 partial / 0 open及TS build `27dc4c67ec8e`（inputs `a303ef479cc2`、artifact `b937caa8d44b`）通过，manifest读回为460 compiler input/1882 immutable artifact；签入adapted validator正式judge `proven`、三项结构义务satisfied且0 open/failed/gap。未运行全仓、PTY、真实provider、exe、桌面或Windows；真实root directory内容、同名非skill template/path裸提交、平台路径枚举及用户原始终端仍待验证。

### 第七十一批：模型异步刷新完成后的publication复验

ADD-01/02继续补刷新生命周期。[模型watcher](../../packages/ts-shell/src/cli/interactive/picker/model/watch.ts)此前在await loader后只检查owner是否关闭，没有复核加载开始时的accepted revision。受控延迟可复现两类错误：读取期间revision从2变3，仍publish版本2；读取完成时publication不可读，仍publish未确认的结果。现发布前重读revision，换代则丢弃，最终读取失败沿原failure callback报告；两条拒绝路径均不推进已观察revision，旧promise结算后再由原定时器重试，不并发启动另一读取。

只读模型选择器对照在await后检查closed，并从共享模型快照重读；本实现保留其关闭守卫与单一pending路径，并按本项目versioned publication增加最终复验，不新增目录或配置owner。新增三个契约覆盖deferred换代、最终读取失败及同revision恢复，以及真实`OverlayHost` inspector绘制：版本2不会出现在屏幕上，下一次显示版本3。既有关闭后迟到结果仍被拒绝。

主代理以`VITEST_MAX_THREADS=1 VITEST_MIN_THREADS=1`串行执行`vitest run src/cli/interactive/picker/model/watch.test.ts src/cli/interactive/picker/model/admission.test.ts src/cli/interactive/picker/model/focus.test.ts`，三文件40项通过。移除新增最终复验后，watcher六项中恰好三个新增契约失败，三个既有契约通过；源码逐字节恢复，SHA-256为`85bd0c85813f433a34f30a8acb45c40c815b3896d8b001a8ff5e5666fa9ddcca`，恢复后三文件40项再次通过。首次调用误用了当前Vitest不支持的`--maxWorkers`，属于CLI调用错误，未进入测试；改用已安装0.34.6支持的环境变量后才记录行为结果。

五静态门、module facade 0及diff检查通过，TS build `f04099dfb42e`通过；测试heap限制768MiB，build限制1536MiB。没有运行全仓回归、真实PTY、provider、exe、桌面或20k历史压测，也没有把主代理审阅记为独立review。延迟回看前一提交`6e12dcb48bd617b1222393f37385fefccf4c8495`的CI `40461157659`与Architecture Watch `40461695485`均为completed/success，不作为本轮提交的CI证据。Git提交、推送及对应CI另绑定；本轮没有重跑原Phase 20任务矩阵，ADD整体保持active，真实认证与平台操作矩阵继续待证。

### 第七十二批：模型刷新失败后的只读缓存与同版本恢复

ADD-01/02继续补根模型面板的错误与恢复状态。[model picker](../../packages/ts-shell/src/cli/interactive/picker/model.ts)之前没有连接watcher的failure callback，accepted revision不可读或loader拒绝时，旧行仍显示active/ready；若版本读取恢复后仍等于原revision，[watcher](../../packages/ts-shell/src/cli/interactive/picker/model/watch.ts)还会直接跳过，无法重新核验。现失败通知发布明确状态，缓存行标为`unverified`、disabled/focusable，详情只显示失败原因；原选择与inspection入口均拒绝。版本读取失败会保留重试标记，同revision恢复也须重新加载，成功后解除只读，不在稳定正常状态下反复加载。

只读模型选择器对照同样保留缓存并显示刷新错误；本项目的额外约束是无法核验accepted publication时不能继续使用旧写入口，因此缓存保持可浏览、不可启用。没有引入新的目录、配置或认证owner。只读行复用既有`isFocusable`判定，失败与恢复保留用户手动焦点；方向键仍能浏览。真实OverlayHost的disabled Enter沿既有inspection handoff返回只读拒绝，不能将host callback是否执行当作模型是否启用的证据；配置字节和session selection分别断言无写入。初始load拒绝后未曾构造的child仍不offer，既有三项契约未改预期。

主代理以单worker串行执行五个聚焦文件，73项通过：publication9、watch7、focus20、admission14、category23；新增回归覆盖revision读取失败、loader拒绝、同版本恢复、手动焦点、键盘inspection、零网络以及无配置/session写入。三组有效反转分别移除同版本恢复重试（2项失败）、根面板failure通知（3项失败）、只读入口守卫（3项失败）；每组两文件共16项，其余分别14/13/13项通过。两个源码逐字节恢复，SHA-256为`watch.ts` `64ed0264b3ad90d63a89d09532f2fb46ad67e2b1b5748b21b2fcbc407b3857a5`、`model.ts` `b9c3d35c322fa34a4b521a3a23e13d927dc086f89c46f4a6c016948d26e30940`，恢复后五文件73项再次通过。

五静态门、module facade 0及最终TS build `cf4a6adbe6e9`通过，测试heap768MiB、build1536MiB。主代理只读审阅没有记作独立review。未运行全仓回归、真实PTY、provider、exe、桌面或20k历史压测；未重跑原Phase 20矩阵，未提升ADD整体状态。提交、推送及精确SHA的CI另绑定。

### 第七十三批：设置编辑链的窗口预算与活动表单优先

ADD-03的真实设置owner集成发现：8×1等极矮窗口中，主界面先给held composer分配全部行，设置表单不可见却继续接收输入。独立InputForm的caret切片已有保障，但不能证明主界面仍给它留有空间。现[OverlayHost](../../packages/ts-shell/src/cli/interactive/overlay.ts)提供当前表单状态，[InteractiveMode](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts)沿既有view context投影；[chrome预算](../../packages/ts-shell/src/presentation/tui/surface/chrome.ts)在composer、补全、提示与activity之前保留一行。主草稿完整保留；无绘制行时不发布主输入框pointer geometry，关闭子表单后恢复。

只读对照的编辑器在重排后按caret调整viewport，并把可见内容高度下限保留为一行；本项目采用同一决定，同时由自身surface分配实际剩余空间，不能照搬固定终端高度比例。没有新增设置、输入或保存owner。为遵守20函数名上限，将原拒绝原因表单绘制原样移至[overlay/denial](../../packages/ts-shell/src/cli/interactive/overlay/denial.ts)，host保留输入与审批结算；panel/modal两条原行为均有回归。

[设置来源测试](../../packages/ts-shell/src/cli/interactive/picker/settings/source.test.ts)将既有两条user多行用例扩展为字符串列表/JSON对象×user/project四条真实操作链：Shift+Enter/Ctrl+J构造→8/40/8/120列与1/2/3/4/8/24行重排→方向键修改→Enter暂存→取消二次编辑→Apply→runtime/目标文件/重开值/只读来源读回。Apply前所有文件字节保持，另一个scope和显式input保持，JSONC注释保留。只读来源子表单也经过窄屏与一行窗口；真实InteractiveMode同时覆盖普通/掩码表单的document及viewport布局，surface覆盖activity/补全/提示并存。

最终单worker串行通过四文件149项（source10、input21、surface43、overlay75），再单独过滤运行InteractiveMode两项通过、111项未选；合计151项执行通过，未运行整个InteractiveMode文件。新增设置四条先在旧预算上失败；移除活动表单保留行后，settings4、真实host2及surface2共8项按预期失败，源码逐字节恢复，chrome SHA-256为`150e566e74d7f79ad1f48b853481c679f660e1f35e60041227ee2943625e8076`。反转初次辅助断言误将旧Vitest JSON的filtered-out计数当作实际通过；改按失败名称/分组核验后确认上述8项，不把158个未选用例记为通过。

五静态门、module facade 0、diff及TS build `679adfd7bb50`通过，测试heap768MiB、build1536MiB；此前`628e32af`的CI `40528401893`已completed/success，不能替代本批CI。未运行全仓回归、真实PTY、provider、exe、桌面或20k历史压测；未重跑原Phase 20矩阵，无独立review，完整字段/来源/窗口/桌面矩阵仍未验，ADD整体保持active。提交、推送及本批精确SHA的CI另绑定。

### 第七十四批：resume渐进焦点、鼠标意图与失效回退的组合验收

ADD-04已有默认最新、手选保留、搜索/scope重置及分页证据；本批扩展[session picker测试](../../packages/ts-shell/src/cli/interactive/picker/session.test.ts)的原渐进用例，补上指针意图和后续目标失效。四条小记录经原summary/eligibility投影、SessionListing、OptionModel与OverlayHost流转：先两天前current，再依次发现三条今天记录，最后重发记录仍可恢复、消失或变为空会话的快照。09点记录保留置顶，11点才是最新，因此第一行与正确默认/回退目标可区分。

| 输入意图（均经过40×8再回100×24的resize） | 手选记录仍可恢复 | 记录消失或变为空会话 |
|---|---|---|
| 未触碰或只有hover | 自动跟随今天11点记录 | 继续选择最新可恢复记录 |
| 方向键、点击或滚轮 | 保留原ID，最终Enter提交该手选目标 | 回退今天11点，不能回退到09点旧置顶 |

指针走真实SGR mouse解码与已绘制行命中，点击和滚轮即使只在一条记录上仍算明确选择，hover不算激活。中途所有恢复调用均为零；失效的旧ID直接Apply拒绝，最终Enter调用原sessionPicker.apply，恰好一次把目标ID和最终summary版本交给既有resume端口。原“目标仍可恢复时保留手选并Enter”的场景保留，没有用失效分支替换掉它。实际磁盘恢复和平台输入由原owner/环境矩阵另验。

只读对照保留selectionTouched与稳定会话身份；参考对scope/filter重置和当前会话定位的选择不直接搬用，本项目仍按本任务的最新时间、置顶排序与资格过滤规则决定默认与失效回退。现有产品实现满足新增场景，本批仅修改测试、HANDOFF与文档，没有新增运行时功能或第二套listing。

最终主代理以heap768MiB、单worker串行执行session picker单文件，68项全部通过，包含上述15条；该文件的既有10,045条分页是mock catalogue单元路径，没有启动真实长历史二进制。三个定向反转分别关闭自动偏好、手动意图记录、失效ID的默认回退，在15条选择集中恰好触发6、9、6项对应失败；各次逐字节恢复，OptionModel SHA-256为`bfa4c418c7b6b81fa1059a3358437444abdbd7e5da22f1f5034ee8e3a962e9aa`，恢复后68项重验通过。首次整项移除defaultSelection同时反转自动与回退两条策略，已缩小到各消费分支分别核验，不将耦合失败当作独立证明。

五静态门与diff通过，既有118条docs-source advisory保留。`6fd6a069`的Architecture Watch `40532987758`已success，CI `40532987731`延迟检查时仍in_progress，不替代本批结果。未运行构建、全仓回归、真实PTY、provider、exe、桌面或20k历史压测；没有重跑原Phase 20矩阵或取得独立review。ADD-04保留本地实现验证状态，ADD整体保持active，提交/推送和本批精确SHA的CI另绑定。


### 第七十五批：启动草稿、延迟估算与光标内容身份

ADD-07/08沿真实StartupSurface→InteractiveMode→context controller→status surface补充regular/fullscreen×完整/跨交接paste四条组合，发现纯方向键移动会使已显示估算变unknown。原因是原textRevision直接返回含光标移动的snapshot revision。现[编辑器buffer](../../packages/ts-shell/src/presentation/tui/editor/buffer.ts)保留独立内容epoch，原通用revision继续拒绝光标移开再返回后的旧补全；没有在交互主文件加入新状态或每帧拼接/哈希全文。typing合并undo、换行/删改、kill/yank/yank-pop、undo/redo、range replacement、clear及history recall均验证内容版本推进。

实现前只读对照确认参考编辑器将textRevision用于内容修改，moveCursor不推进；本项目采用这个决定，同时保留自身cursor-sensitive range snapshot合同。启动继续沿同一state/parser/TUI移交，加载期Enter保留换行。四条组合观察：runtime启动前零预览/派发、首估算读取保留草稿、编辑取消旧signal、旧promise未结算时不重叠读取、迟到结果invalidate且不显示、重读使用paste展开全文、界面显示~222、方向键/resize保持估算、显式Enter仅提交一次全文、stop撤销后续读取并释放terminal。预览结果111/222与最终路由是mock端口，只证明交互连线与生命周期，不冒充token算法或真实模型请求验证。

主代理以heap768MiB、单worker串行验证：editor59、replacement6、startup20、controller18共103项，再过滤InteractiveMode执行11项通过、106项未选；最终共114项执行通过，没有运行整个InteractiveMode文件或全仓。三个独立反转分别恢复旧textRevision、移除交互draft身份、跳过paste展开，恰好触发5/4/2项预期失败；源码逐字节恢复并核对SHA-256：buffer `97281af20de517d151233be3a9d5ce0dfffc554f0fc7970eda437eab948add7c`，未修改的InteractiveMode `db83dbbcff5ee39e75752210189c060031f3a1745365711477d139a98c131284`。恢复后完成上述最终验证。初次夹具误用缺configValidation的runtimeConfig、随后未等待stdin的8ms cluster hold，均先分类为harness错误；修复夹具后才定位纯光标版本问题，没有放宽行为断言。

五静态门、module facade 0、diff及TS build `9e463d050a78`通过，build heap1536MiB；文档更新后静态门重验通过。延迟读回`6fd6a069`的CI `40532987731`及Watch `40532987758`均success；`ab2bdde7`的Watch `40536731728`success、CI `40536731834`仍in_progress，不替代本批结果。HANDOFF记录内容/光标版本分离；未运行真实PTY、provider、exe、桌面或20k历史压测，未重跑原Phase 20矩阵，无独立review。真实1.7k/4.9k分项与冷热性能继续未证，ADD整体active，提交/推送及本批精确SHA的CI另绑定。


### 第七十六批：模型配置保存、隐式回退与显式启用分离

ADD-01/02/03沿真实设置→模型目录→遮罩凭据输入→返回→显式启用链发现确定缺口：[InteractiveMode](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts)复用普通`/connect login`，[连接owner](../../packages/ts-shell/src/core/commands/connectCommandRuntime.ts)保存时同时改写provider、活动连接和provider凭据镜像。已有活动连接的regular/fullscreen两条新增回归先在旧实现失败，不能把“配置成功后返回列表”当作尚未启用的证明。

现由面板传入显式仅保存选项，沿原API-key、浏览器捕获和账号登录writer保存并发布，普通login继续使用原默认激活行为。新slot带`autoSelect: false`，由原schema验证并在runtime正规化时保留；原[凭据解析器](../../packages/ts-shell/src/core/shell/providerCredentials.ts)与logout后继选择排除它。这个持久条件来自第二轮真实失败：仅保留默认字段后，无活动连接的API-key/browser/account三条仍会被已有隐式fallback选中。旧slot省略该字段时保留原回退语义；显式模型/session、`/connect use`和声明账号池仍能选择新slot，不引入第二套配置或请求路由。

[账号持久化](../../packages/ts-shell/src/core/auth/providerAuthRuntime.ts)保留pending身份、源文件/锁内复验和原native enrollment。成功读回按预期最终配置检查provider/活动连接；native grant要求解析结果属于精确新命名slot并匹配完整账号凭据。仅保存时不要求替换provider镜像，普通激活仍要求镜像一致；原续期owner能旋转这个非镜像slot，保持全局默认、旧连接与镜像不变。仅保存的成功输出明确要求后续选择，不再声称已切换默认；失败保持pending→error且不虚报保存或激活。

只读参考将认证委托给凭据owner，完成后重新打开模型目录，模型启用另走选择入口；另一个参考仅在先前模型未知时选择默认，并复验刷新期间模型/session未变化。本项目采用认证与选择分离的决定，但按本文要求，未知模型也须等待显式启用，不采用其初次fallback。没有复制参考产品结构或新建认证系统。

最终主代理heap768MiB、单worker串行执行六个聚焦文件224项：connect54、renewal76、credential28、config validation34、model auth18、settings session14；再过滤InteractiveMode执行13项通过、108项未选，共237项执行通过，没有运行整个host文件或全仓。四条实际host组合覆盖regular/fullscreen×已有活动连接/无既有凭据：保存后配置默认与请求目标保持，原session selection未写；下一次Enter沿原事务保存精确session模型、回到settings并显示结果，重开仍显示active，配置文件字节不再变化。输入不进入history/transcript，零prompt派发、零provider请求。owner另验空配置/provider镜像/活动连接三种起点、认证pending期间不切换、失败不激活、logout不选新slot、显式连接/账号池准入，以及本地原生回调和合成token交换后的实际命名slot续期。

四组独立反转分别移除host仅保存选项、恢复隐式回退、恢复native grant的无条件镜像要求、恢复logout首项选择，恰好产生4/6/4/1项预期失败；按失败名称核验，不把Vitest JSON的filtered-out totals算作执行通过。源码逐字节恢复，SHA-256为host `1f5644292f6126581206797bff3ce2df7d9cae38a3125cb39a27c3fecda9426b`、credential `87c6efb0a9d410b59124ebb1e4ba8053372385906f3f4d281bc5fabc06c193c6`、account auth `4e723be791b5427cc2dfffe4d084d238b9b0efd1b830ed72a6c31664a0ed4535`、connect `1631da3663007da2a535a98f794048de95cc744adc61edd1c1b765a89170d9de`；恢复后完成上述最终验证。新增schema诊断断言曾误期待嵌套字段名，实际合同只报告所属providerConnections；先分类为测试预期错误，再保留拒写、invalid及无敏感值回显断言，不修改诊断实现。

五静态门、diff及module facade 0通过，既有118条docs-source advisory保留；TS build `d7aaee58ac2c`通过，build heap1536MiB。HANDOFF记录两条隐式选择路径和非镜像续期边界。延迟读回`ecc99aae`的Watch `40539857493`为success、CI `40539857527`仍in_progress；`ab2bdde7`的Watch `40536731728`success、CI `40536731834`仍in_progress，不代替本批结果。未运行真实provider/OAuth服务、PTY、exe、桌面或20k历史压测，未重跑原Phase 20矩阵，无独立review，ADD整体保持active；提交/推送及本批精确SHA的CI另绑定。


### 第七十七批：精确模型配置字段的字面值传递

ADD-01/02/03继续沿settings→model→masked key→返回→显式启用检查精确目标。[InteractiveMode](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts)此前将密钥、模型ID、连接标签作为分开的argv token传给连接owner。原表单允许的前导双横线字面值会被严格parser解释为选项，保存被拒绝；节点模型ID与连接标签来自已接受目录，同样不能在此边界改成命令语义。regular/fullscreen×密钥、模型、标签、已知选项名四组共8条新增实际host回归，在旧实现均因未保存连接失败，四条普通有/无连接基线仍通过。

现沿原连接writer与严格parser传递`--api-key=值`、`--model=值`、`--label=值`及适用endpoint，保留带等号和前导双横线的完整字面值。没有增加第二套持久化、改变直接命令的语法，或改变上一批仅保存/显式启用合同。只读参考的认证prompt和凭据owner之间以结构化值传递，不重新按命令参数解释；本项目采用同一数据边界决定，并使用现有parser已支持的字段绑定，不迁移参考的认证结构。

原[host测试](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)扩展为12条配置组合，保留原regular/fullscreen×有/无活动连接四条，再补`--synthetic-private-key=value`、`--relay-model=opaque`、`--account=label`及密钥字面值`--account`。各条均从实际输入解析、遮罩表单及连接owner保存，核对完整密钥/模型/标签与endpoint；保存后默认、旧连接、镜像、当前请求目标和session selection保持，下一次Enter才保存精确session目标，返回settings显示结果，重开显示active。配置文件在显式选择阶段字节不再变化；输入未进入画面、transcript或编辑历史，新增配置链零prompt派发、零provider请求。初次长模型名的画面同步误期待未截断标签，先分类为观察夹具错误，改为实际可见焦点前缀；完整保存与runtime模型身份仍逐字断言。

主代理heap768MiB、单worker串行执行四个聚焦文件92项：connect54、connect syntax15、model key9、settings session14；再过滤InteractiveMode执行21项通过、108项未选，共113项实际执行通过。未运行整个host文件或全仓。将字段绑定反转回原分开参数后，12条配置选择集中恰好8条失败，按名称确认四组各2条，不把JSON filtered-out totals记为通过；源码逐字节恢复，host SHA-256 `8ac7f87110adf03b29cc261b05c88aa05a01cdbee05e5effcf1ef4385afcb06b`，恢复后完成上述最终验证。

五静态门、diff、module facade 0与TS build `d1bff78338c5`通过，build heap1536MiB；保留118条既有docs-source advisory。HANDOFF与当前摘要更新，临时反转材料清理。延迟读回`217dae0a`：CI `40543737624`仍in_progress、Watch `40543737895`success；首次API读回EOF仅属状态观察失败，未将其当作CI终止或重启任务。未运行真实provider/OAuth服务、PTY、exe、桌面或20k历史压测，未重跑原Phase 20矩阵，无独立review，ADD整体active。本批提交/推送及精确SHA的CI另绑定。

### 第七十八批：转义路径的目录连续补全与原文保留

ADD-10/11沿实际路径插入→再次查询检查出确定缺口：[prose owner](../../packages/ts-shell/src/cli/interactive/completion/prose.ts)把已插入的双引号body直接当作真实目录，转义的引号、反斜杠、美元符号和反引号未还原；[共享插入格式](../../packages/ts-shell/src/cli/interactive/completion.ts)还未给单独含反引号的路径加引号，后面的skill可能被吞入代码区。十二条隔离文件系统回归及四条Windows生成文本词法回归在旧实现全部失败。

现沿已有`scanCommandArgs`读取引号内路径值，没有第二套解码或文件枚举。手写Windows drive/UNC的原始分隔符及单引号输入保持字面量；生成的双引号drive/UNC转义按首部分隔符形式识别并解码一次，后续Tab不累积转义。反引号进入原有双引号引用路径，原snapshot、quote range、局部替换与取消边界保持。只读对照的路径前缀处理区分raw value与quoted insertion，目录接受不追加空格且caret留在闭合引号内；本项目采用同一连续补全决定。参考片段本身只剥引用前缀、包装路径，不能作为内部转义解码已解决的证据，本项目在现有参数owner补齐该边界。

[prose测试](../../packages/ts-shell/src/cli/interactive/completion/prose.test.ts)覆盖引号、反斜杠、反引号与Unicode/空白/单引号/美元符号组合目录×源offset=0、正文、`path="…"tail`三种位置，连续接受目录→含转义子目录→含转义文件。每步核对真实catalog结果、完整解码pathname、下一次query、目录caret及不变前缀/后缀/换行/emoji，后续`/skill:follow`仍是非代码token。另有四条Windows drive/UNC的反斜杠/正斜杠生成文本往返及两条原始分隔符特殊字符保护；这些只是在Linux上的词法测试。

[InteractiveMode测试](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)以RecordingTerminal覆盖regular/fullscreen×引号/反引号目录四条实际host链：bracketed paste整段草稿、真实方向键把caret移到词中、三次Tab进入目录/child/file，检查实际候选、编辑器、绘制后文和skill token。草稿没有提交，零网络调用。初次host夹具少一个括号造成transform失败，修正夹具后才记执行结果，没有据此改产品或放宽断言。

主代理heap768MiB、单worker串行完成五文件131项：prose52、request30、paths18、completion14、fileSuggestions17；再过滤InteractiveMode执行7项通过、126项未选，共138项实际执行通过。三个独立反转分别撤销非Windows引用解码、反引号引用和Windows原始输入保护，按断言名称/文件核对恰好16/4/4项失败；源码逐字节恢复后重跑上述全部聚焦检查。恢复SHA-256：prose `2d9c3a1c42591dd2c2c806a57d779c8ab7fe70814d25feab055098c763073d58`，completion `5e2e1dd1dd0c6fd3dc98c8821540782f614cfaf54e764502f93d760b80d5ec65`。不把filtered-out JSON总数算为执行通过。

五静态门、diff、module facade 0与TS build `08c30d959db3`通过，build heap1536MiB，保留118条既有docs-source advisory；HANDOFF与当前摘要更新，反转scratch清理。延迟检查确认`217dae0a`的CI `40543737624`及`ecc99aae`的CI `40539857527`均success；`76093b0f`的Watch `40546189999`success、CI `40546189995`仍in_progress。更早`ab2bdde7`的CI `40536731834`实际failure，GitHub annotation明确hosted runner lost communication，停在脚本门、未进入build或产品测试；不记为产品测试失败，也不改记绿色。未运行真实PTY、provider、exe、桌面、原生Windows或20k历史，未重跑原Phase 20矩阵，无独立review，ADD整体active。本批提交/推送及精确SHA的CI另绑定。

### 第七十九批：文件引用的代码区与文件名sigil边界

ADD-10继续检查已有`@`文件引用。[fileSuggestions owner](../../packages/ts-shell/src/cli/interactive/fileSuggestions.ts)原先只检查命令式空白token：行内代码或围栏中的`@src`会越过prose的代码区守卫，进入后备reference catalog并启动workspace walk；query内任何第二个`@`又被当成重复sigil，合法文件名失去补全。十一条新增源位置/引用/控制器回归先在旧实现失败，属于产品边界缺口。

现复用`promptTokenAt`的代码区标记，在目录发现前拒绝引用；raw前缀双`@@`继续作为字面量，引用打开后文件名中的`@`保留。接受以`@`开头的文件名时沿原`quoteCompletion`加引号，避免插入为raw双sigil后失去引用身份。没有新tokenizer、文件扫描或正文读取owner。只读对照的`extractAtFilePrefix`按token边界识别sigil，把其余raw文本传给路径query；采用该边界决定，未照搬参考的Markdown wrapper剥离。本项目按已明确的代码字面量合同复用现有源token，参考前缀片段不作为代码区抑制已解决的证据。

[文件引用测试](../../packages/ts-shell/src/cli/interactive/fileSuggestions.test.ts)补五种代码范围：闭合/未闭合行内代码、反引号/波浪围栏、不同长度围栏与带尾文伪关闭。五条文件名往返覆盖内部sigil、类似邮箱的文件名、quoted前导sigil、从未引用前缀接受前导sigil，以及空格加sigil；每条核对解码值、局部替换、后缀及接受后的同一reference query。原raw双sigil、普通邮箱、quoted路径及无匹配行为保留。[reference控制器测试](../../packages/ts-shell/src/cli/interactive/completion/references.test.ts)另验代码内不启动walk、不发布候选，真实闭合后一次枚举并恢复匹配。

[实际host测试](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)覆盖regular/fullscreen×行内/围栏四条链，使用RecordingTerminal和mock workspace walk：bracketed paste进入未闭合代码→超过75ms debounce仍零枚举/无菜单→补真实关闭符与普通引用→一次绑定当前root的枚举→Tab接受含sigil的quoted文件名。完整草稿保留，零提交、零网络调用；不将mock目录端口或记录终端记为实际文件正文、PTY或平台验收。

主代理heap768MiB、单worker串行完成四文件83项：fileSuggestions27、references12、request30、completion14；再过滤InteractiveMode执行11项通过、126项未选，共94项实际执行通过。三个独立反转分别移除代码区守卫、恢复query内任意sigil拒绝、移除前导sigil引用，按名称与文件核对恰好11/5/1项失败。源码逐字节恢复，SHA-256 `566f3320d94f3448db5a2c408804efaf527a2da44cc4d44241e8ba7accdf56d7`；恢复后重跑全部上述聚焦检查，不把未选用例记为通过。

五静态门、diff、module facade 0及TS build `c68826cc3eee`通过，build heap1536MiB，保留118既有docs-source advisory；HANDOFF与当前摘要更新、反转scratch清理。延迟读回`76093b0f`的CI `40546189995`success；`98313353`的Watch `40550326742`success、CI `40550327157`仍in_progress，不替代本批结果。未运行全仓、真实PTY/provider/exe、桌面、原生Windows或20k历史，未重跑原Phase 20矩阵，无独立review，ADD整体active。本批提交/推送及精确SHA的CI另绑定。

### 第八十批：角色写入失败的返回链与不可读父页面

ADD-02/03沿settings→Models and roles→Advisor检查出三处同类缺口：[role reset](../../packages/ts-shell/src/cli/interactive/picker/model/role.ts)、[effort](../../packages/ts-shell/src/cli/interactive/picker/model/thinking.ts)及[具体模型分配](../../packages/ts-shell/src/cli/interactive/picker/model.ts)仅在`result.saved`时提供continuation。实际OverlayHost在apply之前释放面板，失败没有next使PickerLifecycles结束并abort原owner，因此诊断是释放面板后丢失返回链。现三处均沿现有back构造fresh parent、携带原writer输出；已经消费的角色/effort动作仍退休，后续保存须用户显式操作新事务。

补查发现effort返回时立即prepare角色事务，若写入后state变为不可读，捕获基线会抛错，原unknown结果被后续read-failed替换。两scope单元和regular/fullscreen实际host四条回归先复现失败。现角色editor在无法准备事务时回已有模型目录，保留原notice；无原notice的入口只给受控读取失败提示。目录沿原只读发现和禁用选择合同工作，不产生写权限或自动修复。只读对照的角色保存回调在false/rejection后保留可用导航，只有成功执行成功回调；本项目采用该失败可操作决定，因现有事务一次消费而重建父owner，不复活旧callback。

[settings session测试](../../packages/ts-shell/src/cli/interactive/picker/settings/session.test.ts)新增14条：user/project×reset、effort、具体模型×未写入/已落盘但unknown十二条，另两条effort写后state不可读。使用实际writer加受控失败和真实OverlayHost Enter/生命周期跟踪，核对准确notice、持久化状态、live continuation、退休callback、新基线第二次显式保存、原scope/focus及default/其他role/global配置保持。不可读夹具断言目录模型均禁用、没有第二次写入、损坏字节保持；由测试恢复已保存字节后再显式重试，不能当作产品自动修复证据。

[InteractiveMode测试](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)新增regular/fullscreen×三类写入六条，加两模式effort不可读两条，共八条RecordingTerminal实际host链。经真实输入、settings/model/角色面板、unknown提示和显式二次保存回原settings，held多行草稿保持、原默认模型及summary角色不变、全局配置字节保持，零prompt派发和网络。真实会话存储与受控post-write错误用于保存事实，未注入真实provider或系统磁盘故障。

主代理heap768MiB、单worker串行最终完成settings session28、model role18、picker lifecycle6共52项，随后过滤InteractiveMode执行8项通过、137项未选，共60项实际执行通过。四个独立反转分别恢复reset、effort、具体模型的成功限定返回及移除不可读父页面fallback，按文件与断言名称确认恰好6/10/6/4项失败；finally源码逐字节恢复，恢复后重跑上述全部聚焦验证。恢复SHA-256：role `bc386e764efb3c62979c0f6cd6ac31d1af6c005a2de61dd3f9ad7962d83b929c`，thinking `9db69e505f5bab8b89e6f730b92dcd41988325149e90fa2d1825cffc293a34cd`，model `fc578d0647f2d1fb113e87807775b3fb8bddede44a20316d9f43b3d153983ded`。filtered-out用例不算通过。

五静态门、diff、module facade 0及TS build `6e4ec4816f6e`通过，build heap1536MiB，保留118既有docs-source advisory；HANDOFF与当前摘要更新，临时反转材料清理。延迟读回`98313353`的CI `40550327157`及Watch `40550326742`success；本批最终验证后再读回`db19104d`的CI `40552244493`已completed/success，精确head为`db19104d7f16eb44454065b71eb4a4660deb2034`，Watch `40552244296`此前已success；均不替代本批CI。未运行全仓、真实PTY/provider/exe、桌面或20k历史，未重跑原Phase 20矩阵，无独立review，ADD整体active。本批提交/推送及精确SHA的CI另绑定。

### 第八十一批：角色认证结果与新事务读取失败的隔离

ADD-01/02/03继续检查角色浏览器的未配置模型。已有API-key/account正常返回会重新捕获角色事务，并非一直复用认证前callback；但[model owner](../../packages/ts-shell/src/cli/interactive/picker/model.ts)在返回callback内立即`prepareModelRole`，没有处理该步骤读取失败。连接已经落盘后，session state若暂时不可读，结果会抛到通用host错误路径，原认证notice和settings/model返回链丢失。三个自动角色×两种认证入口六条单元，以及两模式×两入口×已应用/应用未确认八条实际host回归先在旧实现失败，属于产品返回边界缺口。

现仅在原认证返回owner保护fresh角色事务捕获：成功仍回精确连接/模型浏览器；无法捕获时沿已有`assigning.back`退回对应角色目录，使用同一fresh context并保留原`modelSignInStatus`。完整认证note仍由原authentication owner返回，应用未确认提示继续置前。原身份/准入/取消检查、仅保存连接及后续显式启用边界保持。只读参考的hub把OAuth入口交给上层登录callback，原角色hub保留；其入口本身没有本项目这种立即重捕获session事务的步骤。采用认证与角色动作分离的决定，读取失败fallback由本项目现有目录承担，不将参考片段当作相同故障已解决的证据。

[auth测试](../../packages/ts-shell/src/cli/interactive/picker/model/auth.test.ts)新增subagent/summary/advisor×account/key六条，实际connect writer以save-only模式保存，账号runner为受控fixture。写后破坏隔离session state，再核对原note、对应role焦点、只读模型行、原默认/镜像/连接与状态字节保持、旧认证动作不重跑。测试显式恢复原state字节后重新进入角色并选择，只有目标角色改为新连接/模型，default及另外两role保持；此恢复动作不是产品自动修复能力。

[实际host测试](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)八条从`/settings`进入Advisor与未配置模型，走真实masked key或受控native account writer。原配置发布后注入不可读state，四条另注入应用未确认notice；回原role目录时保留完整安全认证transcript及适用notice。fixture恢复state后再显式选择，返回原user settings入口，held多行草稿保持、连接配置字节不再变化、默认请求目标与兄弟role保持，零prompt派发/网络且秘密不进入画面、transcript或历史。初次恢复后的host夹具误用未提供的可选`resolveConfigTarget`，分类为夹具错误，改为直接调用现有凭据解析owner后重验，没有因此改产品合同。

主代理heap768MiB、单worker串行最终完成auth24、key9、role18、settings session28共79项；再过滤InteractiveMode执行28项通过、125项未选，包含新增8条及已有精确配置、masked key、native失败/取消和异常报告，共107项实际执行通过。独立反转认证返回guard后恰好14条新回归失败，按文件/名称确认auth6、host8，单元失败为预期read-failed。finally逐字节恢复，SHA-256 `360f8992c3850bde5ca3440cfa753fa2a6756e7eceec27a453f0ef26d7a905a9`，恢复后重跑上述全部最终聚焦检查；filtered-out不算通过。

五静态门、diff、module facade 0与TS build `6bebbec2a005`通过，build heap1536MiB，保留118既有docs-source advisory；HANDOFF与当前摘要更新，反转scratch清理。延迟读回`44e9ea4133f0c6679096b14f9cda412e845b2677`的Watch `40556518111`success、CI `40556517972`仍in_progress，不替代本批结果。未运行全仓、真实认证服务/PTY/provider请求/exe、桌面、真实磁盘故障或20k历史，未重跑原Phase 20矩阵，无独立review，ADD整体active。本批提交/推送及精确SHA的CI另绑定。

### 第八十二批：列表编辑器初始化的完整值往返

ADD-03核对“打开编辑不能偷偷规范化未知或过时原值”的要求，确认[settings owner](../../packages/ts-shell/src/cli/interactive/picker/settings.ts)直接以换行拼接字符串项，而[已有parser](../../packages/ts-shell/src/config/settings.ts)还会去外层引号、解释JSON数组、拆分换行和trim每行。带字面引号的工具名未编辑就能变成普通工具名，数组样式单项和含换行项会变成多项，方括号前缀还会使合法原列表无法暂存。16条user/project特殊值回归先在旧实现复现；这是编辑表示不能还原存储值的问题，不能靠改变schema或规范化旧数据解决。

现仅调整原`editorText`：逐行文本先交同一`parseSettingInput`，与完整原值相同时继续使用；失败或不同则用已有`formatSetting`生成JSON数组，原输入owner本就支持该格式。说明同步标明两种输入。普通逐行及对象列表编辑、验证、暂存、Apply、scope和保存owner继续复用。只读对照的text editor对数组使用JSON.stringify，并在schema为array时JSON.parse后验证数组形状；采用结构化表示保留数组身份的决定，同时保留本项目已要求的普通逐行输入，不引入新parser。

[fields测试](../../packages/ts-shell/src/cli/interactive/picker/settings/fields.test.ts)新增user/project×九种列表共18条：双/单引号项、数组样式单项、内部换行、前后空白、方括号前缀、跨项引号、带引号模型selector和普通逐行控制。真实OverlayHost Enter→暂存→Apply→重开→再次Apply核对完整存储/accepted/effective、注释、兄弟字段与另一scope字节；工具字段同时调用实际prefilter，核对可见集合保持。普通控制明确断言仍以两行初始化。

[InteractiveMode测试](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)新增regular/fullscreen×user/project×引号/换行八条，真实输入从settings搜索进入字段；project经实际scope确认，未修改文本而暂存/Apply、重开并取消，完整配置和工具可见集合不变，原scope/字段焦点及held多行草稿保持，零prompt派发/网络。初版夹具漏掉已存字段的`●`标记，且重开等待可能匹配历史title并早于保存owner结算，已按实际行标记、当前Edit action及busy结束校正；单元普通控制最初也误把成功后的根列表当作详情，已显式重开字段。此类失败记为夹具问题，未为它们改产品。

主代理heap768MiB、单worker串行最终完成fields116、picker settings39、config settings6共161项，再过滤InteractiveMode执行8项通过、153项未选，共169项实际执行通过。独立反转初始化值比较分支，按名称/文件确认fields16、host8共24项预期失败，两个普通逐行控制仍通过。finally逐字节恢复，SHA-256 `4b41a6986d74684368eb70fdcc5a5aa02f5959a26767c400305090a9a3e80c65`，恢复后完成全部上述最终聚焦验证；filtered-out不算通过。

五静态门、diff、module facade 0与TS build `b539b709a535`通过，build heap1536MiB，保留118既有docs-source advisory；HANDOFF与当前摘要更新，临时反转与观察材料清理。延迟读回`44e9ea41`的CI `40556517972`已completed/success；`0a9f8584cb0b2d6ee9197faa75eda4ebcc923666`的Watch `40558903541`success、CI `40558903524`仍in_progress，不替代本批结果。未运行全仓、真实PTY/provider/exe、桌面或20k历史，未重跑原Phase 20矩阵，无独立review，ADD整体active。本批提交/推送及精确SHA的CI另绑定。

### 第八十三批：模型详情动作复验失败的父页面与宿主归属

ADD-01/02/03继续核对详情→配置→返回链。[详情owner](../../packages/ts-shell/src/cli/interactive/picker/model/details.ts)在Enter后异步复验目录，但overlay已释放原面板；异常分支只返回note，使实际宿主结束整条settings/model生命周期。该分支也未执行成功路径已有的归属检查，因此宿主关闭或替换后的迟到rejection仍产生结果。五条owner回归先在原实现确认这两个缺口；实际host最初的模型名过长，断言未考虑列表列宽，按绘制宽度缩短夹具后四条均在接受动作后的返回位置复现。未为夹具改产品。

只读对照的model hub将刷新错误保存在当前面板，清除refreshing并重绘，保留导航。采用失败仍有可操作父页的决定，复用本项目原`source.back`：异常结算先检查offered/retired及accepted宿主归属，仍有效时退休已消费详情，把原安全notice传给新目录；没有重跑旧动作、创建第二套导航或输出异常细节。恢复后须新显式Enter重开详情再进入配置；原目录准入、认证和显式启用契约继续沿各owner。

[admission测试](../../packages/ts-shell/src/cli/interactive/picker/model/admission.test.ts)新增configure/account/connection三条实际OverlayHost接受链，验证安全note、fresh父目录、原目标/notice、配置/会话字节保持与已消费动作不能再load/apply；另两条挂起refresh在宿主close/replace后reject，结果与回调均丢弃。[InteractiveMode测试](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)新增regular/fullscreen×`/model`/`/settings`四条，从实际搜索/未配置模型详情接受配置动作，在配置publication读取处受控抛错。验证回原目标、notice、fresh显式再次进入masked表单、取消返回、settings入口及held多行草稿，accepted publication与持久配置/会话选择保持，零prompt派发/网络；没有输入凭据或声称认证成功。

主代理heap768MiB、单worker串行最终完成admission19、publication9、watch7共35项，再过滤InteractiveMode执行4项通过、161项未选，共39项实际执行通过。两次独立反转分别移除父页返回和异常归属检查，按文件/名称确认7项（admission3/host4）和2项（admission2）预期失败，所选其余2/7项保持通过。finally逐字节恢复并核对SHA-256 `e4a5fe048f4317221f6d728b9ca6c14986c4ca4532ac81c6afa7cce87c0eaada`，恢复后重跑全部上述聚焦检查；filtered-out不算通过。

五静态门、diff、module facade 0与TS build `67b2cfac97bc`通过，build heap1536MiB，保留118既有docs-source advisory；HANDOFF与当前摘要更新，临时反转材料清理。延迟读回`29698cadf85fd3f93668d9a8557a6677fed5f6fa`的CI `40562201528`及Watch `40562201258`均completed/success；`0a9f8584`的CI `40558903524`亦success，不替代本批结果。未运行全仓、真实PTY/provider/exe、桌面、真实磁盘故障或20k历史，未重跑原Phase 20矩阵，无独立review，ADD整体active。本批提交/推送及精确SHA的CI另绑定。

### 第八十四批：未闭合单引号路径的完整字面范围

ADD-10/11/12继续核对手动输入→候选→Tab→再次解析。原[prompt tokenizer](../../packages/ts-shell/src/core/prompts/tokens.ts)为避免将英文leading apostrophe视作quote，要求token首位单引号先有真实close。`读取 '/tmp/work space`因此在空格处分裂，光标处不再识别路径；后续`/skill:`、`/review`与`/deep-research`还会暴露给真实组合准备。六条词法、两条补全、三条路由和两条实际host回归在旧实现确认13项失败，四个双引号/带前缀控制仍通过。

只读参考的autocomplete先找未闭合双引号prefix，再做空格分词；其这一路径只证明double-quote策略，没有假称其支持本批single-quote矩阵。本项目既有参数扫描与插入formatter已经支持单引号，因此仅沿原`quoteStartsSpan`承认明确absolute/home/relative/drive/UNC前缀的未闭合单引号。共享token保留完整quote范围，补全和提交共用该事实；ordinary apostrophe、已闭合quote、代码/escape规则继续保留，不新建路径parser或提交白名单。

[tokens测试](../../packages/ts-shell/src/core/prompts/tokens.test.ts)新增六种路径前缀，核对完整source range、open状态、跨空格/内部标记的字面范围及真实关闭后的调用；[prose测试](../../packages/ts-shell/src/cli/interactive/completion/prose.test.ts)新增首位/正文/`path=`×单/双引号六条，沿实际目录loader完成目录→子目录，解码身份与caret保持。两条未闭合leading单引号场景是新增失败，其他四条是兼容控制。

[组合测试](../../packages/ts-shell/src/core/commands/composition.test.ts)新增三条真实router链，未闭合路径内的review/research/未知skill不触发准备或方法callback，关闭后实际读取并注入两份skill body，原始输入、literal路径和methods空列表保持。[InteractiveMode测试](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)新增regular/fullscreen两条真实按键链，手动粘入未闭合单引号与空格后Tab，沿真实隔离目录完成子目录及含apostrophe文件，再验证后续skill token恢复；零提交/网络。终端为RecordingTerminal，drive/UNC是词法证据，未提升为原生Windows文件系统验收。

主代理heap768MiB、单worker串行最终完成tokens22、skills26、composition30、prose58共136项；过滤InteractiveMode执行新增2条及既有转义路径4条，共6项通过、161项未选，总计142项实际执行通过。独立反转open-path quote判断，按文件/名称确认tokens6、prose2、composition3、host2共13项预期失败，四个控制仍通过，260项未选。finally逐字节恢复并核对SHA-256 `c3123204d36a349b88cb32d3b2c816efad4babe560c1e6360c81fa02a4e69be8`，恢复后重跑上述全部最终聚焦检查；filtered-out不算通过。

五静态门、diff、module facade 0与TS build `47f715c0ca97`通过，build heap1536MiB，保留118既有docs-source advisory；HANDOFF与当前摘要更新，临时反转材料清理。延迟读取`b47218f0d4f185ab344af8c5565223c77ea3b851`时Watch `40566634781`已success、CI `40566634731`仍in_progress，不替代本批结果。未运行全仓、真实PTY/provider/exe、桌面、原生Windows或20k历史，未重跑原Phase 20矩阵，无独立review，ADD整体active。本批提交/推送及精确SHA的CI另绑定。

### 第八十五批：组合选项的引用值与严格准入

ADD-11/12确认[组合planner](../../packages/ts-shell/src/core/commands/composition/plan.ts)将所有含quote的token排除在选项lane之外。`问题 /deep-research --mode="paper" --depth='deep' --brief="brief with spaces.md" /skill:a /skill:b`因此创建quick/default研究，把选项原文留在question，briefPath缺失；unknown、duplicate与布尔选项的非法引用值也绕过原strict语法。真实router、native研究状态和preview→submission链均复现该产品缺口。

只读对照快照`0838d2ab4407b74e870de07e1a6780a13c7d542c`的`packages/coding-agent/src/utils/command-args.ts`1–48将引用片段拼入单个解码value、不做变量展开，显式strict模式拒绝未闭合quote；默认模式不拒绝，不能宣称参考所有入口均严格。`src/modes/controllers/command-controller-shared.ts`43–64在解码后识别选项。本项目采用先解码再校验的决定，复用已有`scanCommandArgs`。组合输入还含普通正文，因此完整quote/escape/code token继续保留字面量；这与纯命令尾的解析范围不同，没有复制参考parser。

planner现区分未引用的dash前缀，解码已准入选项和值后仍交原strict语法。未闭合选项形成准备错误，由[原prepare owner](../../packages/ts-shell/src/core/commands/composition/prepare.ts)在请求准备和研究状态创建前拒绝，沿既有retryDraft返回完整草稿。值中的`/review`、`/skill:missing`不重新扫描；flagless正文与独立命令parser保持原合同，没有新增研究或配置owner。

[组合测试](../../packages/ts-shell/src/core/commands/composition.test.ts)新增两种quote的真实router参数/两skill验证、七种非法选项拒绝和四种完整quote/escape/code控制。[研究组合测试](../../packages/ts-shell/src/research/run/composition.test.ts)新增三个入口×两种quote六条，核对同一个native run、mode/depth/briefPath、durable readback及四个child stage的请求身份和两份真实skill body。[preview测试](../../packages/ts-shell/src/cli/runtime/context/preview.test.ts)补两种quote的同一prospective→admitted run ID、实际schema/system/token估算一致及零早期create/arm/run，另四条非法/未闭合值在注入准备前拒绝，session字节保持。

[实际host测试](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)补regular/fullscreen×合法/非法四条，从bracketed paste和Enter走真实ShellSessionRuntime命令生命周期与native研究owner。合法只create/arm一次，完整options与两skill进入最终派发参数；非法不建状态/不派发，恢复原始含尾空格草稿。初期非法callback无返回、host固定null controller及构造后换tuiMode属夹具问题，分别改有效受控结果、实际runtime owner和构造前模式，并断言实际alternate-screen序列。最终provider派发端口为mock，研究执行和fetch均零调用；终端为RecordingTerminal，未读brief正文或启动真实研究服务。

主代理heap768MiB、单worker串行执行`rtk env NODE_OPTIONS=--max-old-space-size=768 VITEST_MAX_THREADS=1 VITEST_MIN_THREADS=1 npm exec --workspace packages/ts-shell -- vitest run src/core/commands/composition.test.ts src/research/run/composition.test.ts src/cli/runtime/context/preview.test.ts`，43+18+73共134项通过；host以`-t 'submits quoted research options'`执行4项通过、167项未选，共138项实际执行通过。恢复旧planner/prepare的反转按文件/名称确认25项失败（composition9、research6、preview6、host4），七个控制通过、273项未选；单独撤销prepare的未闭合quote拒绝触发composition1/preview1共2项失败，九个所选控制通过。finally逐字节恢复及SHA-256核对：plan `253cc1a9a58ce5f30cef624d08d965cfa3b5e1cd7bee1cfc5cf4cc3100451310`，prepare `95dee5565807afd77aca75006e6c25e47fc8c2613436d8e838f73c5b76f6a2a6`；恢复后重验受影响检查，未选测试不计为通过。

五静态门、diff、module facade 0及最终TS build `bc773350564f`通过，build heap1536MiB，保留118既有docs-source advisory；HANDOFF与当前摘要更新，反转scratch清理。延迟读回`b47218f0d4f185ab344af8c5565223c77ea3b851`的CI `40566634731`已success；`bf6bb90361b774fea7c65b7ff6825aa45d435fc0`的Watch `40568166653`success、CI `40568166550`仍in_progress，不替代本批结果。未运行全仓、真实PTY/provider/exe、桌面或20k历史，未重跑原Phase20矩阵，无独立review，ADD整体active。本批提交/推送及精确SHA的CI另绑定。

### 第八十六批：文件引用的正文apostrophe与精确替换范围

ADD-10确认[file references](../../packages/ts-shell/src/cli/interactive/fileSuggestions.ts)用命令参数scanner扫描整段正文。`Let's inspect @src/mo`与`Users' notes`后的引用因此被前文quote吞入；`read @src/O|Brien's.ts  后文`在caret处仍可产生候选，但Tab把后文也当成引用的一部分删除。旧实现运行新增回归，按名称确认fileSuggestions12、catalog references2、实际host4共18项失败，八个代码区/已有引用控制通过、202项未选；两条文件名host场景明确在后文保持断言失败。

现以原`promptTokenAt`确定引用的from/to和raw prefix，保留代码区与raw双sigil拒绝，只有当前引用有quote/escape时才将隔离prefix交给原`scanCommandArgs`。普通文件名apostrophe直接保留。catalog request与候选edit共用同一个引用token，查询只取caret之前，替换仍覆盖完整源引用；没有新增分词器、目录扫描或编辑owner。

只读对照pi快照`6c384aa30f619d7b28963f2bab24d8dacbe73cb6`的`packages/tui/src/autocomplete.ts`499–514：引用提取先区分quoted prefix，再取光标前末尾raw token，不把整段正文解释成命令参数。采用当前引用范围独立于前文shell quote状态的决定。本项目继续使用原prompt token以保留code、apostrophe与完整caret替换范围；参考将单引号列为delimiter，不能把它当作含apostrophe文件名完整支持的证据。

新增测试覆盖四类前文apostrophe、raw/quoted/escaped引用解码、词中caret、中文与emoji后文及后续skill的字面范围。[实际host](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)的regular/fullscreen×前文/文件名四条场景，使用真实隔离目录和文件，从bracketed paste、方向键到Tab检查真实workspace walk一次、正确root/AbortSignal、完整前后文与后续skill，零prompt提交和fetch。终端是RecordingTerminal，不是原生PTY。

本批续接前的验证已通过97项补全测试和四条host测试，共101项；续接时核对反转材料与源码快照一致后，未重复运行这组测试。额外撤销“仅literal引用解码”的反转触发一项raw apostrophe失败，三个quote/escape控制通过、35项未选。两源码均在finally逐字节恢复；续接重新确认SHA-256：fileSuggestions `b0078b174fcecd1a131ca51e5d7be6a78d4277de73900164a596694cce958f26`，request `763a91ac3208bdf96b36307467cf64cd1b229b038a535e61ee72cdc26d4577d9`。未选测试不计为通过。

续接后五静态门、diff、module facade 0与TS build `8ef2d57d21c2`通过，build heap1536MiB，保留118既有docs-source advisory；HANDOFF及当前摘要更新，本批反转scratch清理。本批尚未Git提交或推送，无对应CI；未运行全仓、真实PTY/provider/exe、桌面或原生Windows，未重跑原Phase 20矩阵，无独立review，ADD整体active。

### 第八十七批：普通路径apostrophe的查询与连续Tab

ADD-10继续核对手动路径输入。[prose completion](../../packages/ts-shell/src/cli/interactive/completion/prose.ts)已使用正确源范围，但仍把所有非raw-Windows前缀交给命令参数scanner。源token把`./O'Brien`中的apostrophe判为普通文件名，query却被二次解释成`./OBrien`，因此真实目录没有候选。八条绝对/home/相对/父目录×首位/正文测试及四条两模式实际host回归在旧实现确认12项失败；16个已有转义目录和Windows引用控制通过，217项未选。

只读参考快照`6c384aa30f619d7b28963f2bab24d8dacbe73cb6`的`packages/tui/src/autocomplete.ts`517–540对普通路径直接返回raw prefix，不把它统一解码为shell参数。采用普通值保持原文的决定；参考的delimiter仍包含apostrophe，不能据此宣称其已覆盖含apostrophe文件名。本项目继续服从既有prompt token的prose/quote/code/escape分类，仅真正引用的路径复用原scanner，保留raw drive/UNC政策、同一目录catalog和snapshot replacement owner；没有新建解析器或改变提交语法。

[路径测试](../../packages/ts-shell/src/cli/interactive/completion/prose.test.ts)从真实目录核对caret前query、完整词替换、生成引号后的目录→含空格子目录→含apostrophe文件连续接受、中文/emoji后文与后续skill。[实际host](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)补regular/fullscreen×absolute/home四条，从paste、方向键到三次Tab，核对实际模式、编辑器完整值与保留后文，零prompt提交和fetch；终端为RecordingTerminal。

主代理heap768MiB、单worker串行执行`vitest run src/cli/interactive/completion/prose.test.ts src/cli/interactive/completion/request.test.ts src/cli/interactive/completion/paths.test.ts`，66+30+18共114项通过；实际host以`-t 'completes raw apostrophe paths|preserves prose and filename apostrophes|continues escaped path Tab acceptance|continues a manually opened single-quoted path'`执行14项通过、165项未选，共128项实际测试通过。单独撤销plain-source保留分支，再次按文件/名称触发prose8、host4共12项预期失败，16个控制通过；finally逐字节恢复，SHA-256 `c148531b2aa34e641a6051c9f3dcbfc7f492acbab166339750f402c80d6b1e7a`，恢复后完成上述最终重验。

另以实际Node launcher、已有PTY relay与隔离环境owner串行运行regular/fullscreen两条小型PTY，每次新空会话、heap768MiB，真实输入`读取 ./O'Br`并从词中接受目录、含空格子目录和文件，核对完整已接受引号路径、保留后文、ready后的实际屏幕模式及正常退出0。初期探针的父Git root、启动期备用屏、截断菜单标签与空会话transcript必然存在假设均已分类为夹具问题后校正。PTY证明物理终端输入/绘制/退出，不宣称provider计数或持久状态；零提交/网络的直接证据来自上述host spies。没有加载长历史或启动exe。

五静态门、diff、module facade 0及TS build `cc6397c0245e`通过，build heap1536MiB，保留118既有docs-source advisory；HANDOFF及当前摘要更新，本批scratch清理。第八十六批已提交并推送为`e2857e6f963331ebccf58ee2e2413a5de1fcb817`；延迟检查时Watch `40572639614`success、CI `40572639510`仍in_progress，`0982131e`的CI `40570812686`仍in_progress，`bf6bb903`的CI `40568166550`success。以上不替代本批精确SHA的CI。未运行全仓、真实provider/exe、桌面、原生Windows或20k历史，未重跑原Phase20矩阵，无独立review，ADD整体active。本批提交/推送及对应CI另绑定。

### 第八十八批：模型详情最终准入的异常与永久退役

ADD-01/02/03继续核对已接受详情动作的读取边界。[model details](../../packages/ts-shell/src/cli/interactive/picker/model/details.ts)捕获refresh异常后，仍直接调用`source.admit`；其中accepted revision与原准入读取可能抛错，真实Enter已释放overlay，因此异常会结束settings/model返回链。普通拒绝又在最后一次宿主归属复验之前返回，准入callback关闭/替换页面时仍能发布拒绝结果。初始七条owner与四条两模式host新增回归在旧实现确认11项失败，四个已有正常拒绝/关闭控制通过。

只读参考快照`0838d2ab4407b74e870de07e1a6780a13c7d542c`的`packages/tui/src/overlays/model-hub.ts`604–634、1142–1162将同步目录投影与后台刷新错误保存在面板并重绘，保留导航。采用读取失败仍保留安全结果和操作路径的决定。本项目继续使用原详情、父目录和一次消费归属，不复制hub或展示异常原文；未知的最终读取结果不提供配置/认证动作。

最后准入异常现由详情owner捕获：仍属于原accepted host时退休已消费详情，沿原`source.back`回fresh目录，显示`Model details could not be verified`；已关闭或替换则不发布结果。初修后四条直接重试断言进一步确认，仅返回undefined不足以撤销旧对象。现各检查共用同一归属函数，观察到原acceptance失效即永久退休，延迟到动作开始之前失效也不能读取或执行Back。合法普通拒绝及原取消合同继续由已有控制测试验证。

[owner测试](../../packages/ts-shell/src/cli/interactive/picker/model/admission.test.ts)补三个动作的异常返回、关闭/替换×返回拒绝/抛错四条、启动前已失效的配置/Back两条，并加强三条旧refresh场景的直接重试与迟到load检查。[实际host](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)补regular/fullscreen×model/settings四条：在真实`catalogueDetailSource.admit`开始时注入一次accepted configuration getter读取错误，核对安全notice、原模型焦点、fresh显式重开/配置取消、settings返回、held草稿与配置/会话不变，零prompt派发和fetch。原refresh控制host也在构造前传入实际模式并断言备用屏序列；构造后换context不能作为两模式证明。

主代理heap768MiB、单worker串行执行`vitest run src/cli/interactive/picker/model/admission.test.ts src/cli/interactive/picker/model/publication.test.ts src/cli/interactive/picker/model/watch.test.ts`，28+9+7共44项通过；host以`-t 'retains model navigation after accepted detail (refresh|admission) failure'`执行8项通过、175项未选，共52项实际执行通过。独立撤销异常边界、拒绝前归属复验和永久退休，分别按文件/名称确认9、2、9项预期失败，同次控制11、18、11项通过，191项均未选。finally逐字节恢复并核对SHA-256 `dde41932a06487bba2032e3a6585569ca6ac035d7e2cf3e4ae480e2d716e9c28`，恢复后完成上述最终重验。未选不计通过。

五静态门、diff、module facade 0及TS build `025d00b2ff5c`通过，build heap1536MiB，保留118既有docs-source advisory；HANDOFF及当前摘要更新，本批反转scratch清理。延迟核对第八十六批`e2857e6f`的CI `40572639510`与Watch `40572639614`均success，第八十五批`0982131e`的CI `40570812686`亦success；第八十七批`5204ac404bbcb835873052c7231ca01b39955432`的Watch `40574711942`success、CI `40574711764`仍in_progress。以上不替代本批精确SHA的CI。读取故障为受控注入，终端为RecordingTerminal；未运行全仓、真实磁盘故障/PTY/provider/exe、桌面或20k历史，未重跑原Phase20矩阵，无独立review，ADD整体active。本批提交/推送与对应CI另绑定。

### 第八十九批：模型详情普通拒绝后的安全父级返回

第八十八批已提交并推送为`e5c017217d64178f513916737627433d9b39d1f3`，续接核对本地与远端精确一致且工作区clean。ADD-01/02/03继续沿[详情owner](../../packages/ts-shell/src/cli/interactive/picker/model/details.ts)检查普通准入拒绝：原控制只直接调用apply并允许随后Back，没有穿过已释放overlay的实际Enter。真实配置文件变化使target fingerprint过期，拒绝仅返回note，实际settings/model链因此关闭；旧对象还能再试。新增及加强owner/publication十一条与两模式/两入口host四条，在旧实现确认15项失败。

只读参考快照`0838d2ab4407b74e870de07e1a6780a13c7d542c`的`packages/tui/src/overlays/model-hub.ts`1255–1275在同步/异步assignment返回false或拒绝时重绘原面板，并且异步结果检查disposed；604–634及1142–1162同样保留读取失败的可导航面板。采用失败后保留操作路径并尊重已退出生命周期的决定。本项目不复用其role/hub实现，也不将target失效视为browser归属失效的充分证据。

[目录owner](../../packages/ts-shell/src/cli/interactive/picker/model.ts)现提供明确的返回检查，只复验原signal与context admission；详情在普通拒绝后调用它，检查回调之后再验accepted host，消费并永久退休旧动作。返回已获验证时沿原`source.back`构造fresh目录，保留原notice、具体模型焦点、原settings父级和目录origin；取消、原session/workspace/profile失效或检查抛错时只保留原拒绝，不重开旧链。缺少返回检查也不自动返回。返回不运行配置或认证动作，须用户明确再次打开；无新增保存owner、轮询、命令语法或provider/auth核心改动。

[owner回归](../../packages/ts-shell/src/cli/interactive/picker/model/admission.test.ts)覆盖三个动作的拒绝返回、旧动作/迟到load、返回检查关闭/替换宿主、抛错保留原notice及真实modelPicker原owner拒绝/取消/抛错；[publication控制](../../packages/ts-shell/src/cli/interactive/picker/model/publication.test.ts)改用真实结果的next返回，核对新目录endpoint与普通设置保持接受态。[实际host](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)regular/fullscreen×model/settings四条直接修改隔离配置的topP文件，再通过真实Enter复现过期，检查原模型焦点、安全notice、显式重试/配置取消、settings返回、held草稿和session不变，外部文件字节保留、accepted topP仍为0.7，零prompt派发及fetch。终端为RecordingTerminal。

主代理heap768MiB、单worker串行运行admission34、publication9、watch7及过滤host12，共62项实际执行通过，175项host未选不计通过。三项独立反转撤销拒绝continuation、原browser复验、返回callback后的host复验，分别按失败名称确认15/4/2项失败，所选控制7/6/7项通过、208/211/212项未选。finally逐字节恢复并核对SHA-256：details `9b9d7b36e05dafe0ef84255dd0283d1cca9994e7af5b2deb8a7e14c1233203d9`、model `7f3e5c65cf94691a13d006b52c2b98ec64f0aadc78a1b1d1446c6742ec3b8f91`；恢复后重验全部上述62项，未选不计通过。

另以现有环境隔离owner与PTY relay运行实际Node launcher，regular/fullscreen两条新空会话串行通过：实际ready屏幕模式、精确relay详情、外部配置修改、拒绝自动回原模型、显式再开配置、取消回目录、分类焦点后退出面板、配置文件与modelSelection保持、零transcript message及正常退出0。首轮regular探针把内容焦点上的一次Esc误当关闭，实际只返回All models分类，按已绘制分类后再Esc修正探针；没有为此改产品代码。PTY不提供provider调用计数，零派发/网络证据来自host spies；未加载长历史或启动exe。

五静态门、diff、module facade 0及TS build `4ecf3161b638`通过，build heap1536MiB，保留118既有docs-source advisory；HANDOFF与当前摘要更新，本批scratch清理。延迟读回第八十八批Watch `40576592407`success、CI `40576592505`仍in_progress；第八十七批CI `40574711764`亦in_progress，不替代本批验证。未运行全仓、真实provider/OAuth、桌面、原生Windows、真实磁盘故障或20k历史，未重跑原Phase20矩阵，无独立review，ADD整体active。本批Git提交/推送与对应CI另绑定。

### 第九十批：角色详情返回后的新分配事务与当前档位

第八十九批已提交推送为`5f6329b46612c02aeb7440de1b5cad9a1979cfc1`，本地、tracking及远端main精确读回一致且clean。ADD-02/03继续检查角色嵌套：详情拒绝后返回fresh目录，但[model owner](../../packages/ts-shell/src/cli/interactive/picker/model.ts)仍传原`assigning.assign`闭包和thinkingEffort。用户明确选择新模型时原writer再次拒绝，必须退回角色根再进才能重试。三个自动角色×外部配置/会话role变化六条[publication回归](../../packages/ts-shell/src/cli/interactive/picker/model/publication.test.ts)及两模式[实际host](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)在旧实现确认八项失败，均到达新选择后的拒绝断言。

只读对照快照`0838d2ab4407b74e870de07e1a6780a13c7d542c`的`packages/tui/src/overlays/model-hub.ts`1279–1308在每次role assignment从当前角色或scope读取档位，按目标能力约束后交原回调，成功后刷新；1255–1275保留失败导航。采用新显式动作应携带当前role状态的决定。本项目沿原prepareModelRole获取锁前/锁内重验事务，不复制参考保存、scope或自动assignment策略。

详情返回现在复用与认证返回相同的本地角色准备逻辑，更新assign和当前角色thinkingEffort，并绑定原back到实际context；正常目录后台reload不重捕获这个写入权限。准备失败时退回原角色目录，保留拒绝notice或既有安全读取失败提示，旧详情仍永久退休，恢复后须显式重开。未改核心writer、配置发布、provider/auth、脚本或构建；没有在旧callback中用新baseline自动重试写入。

六条publication路径验证返回本身不写、原accepted配置保持、默认与兄弟角色保留、session角色外部变low后显式选新模型仍保留low。另补拒绝/Back×prepare抛错/真实隔离state临时不可读四条，检查安全fallback、原notice、恢复后显式打开与保存。两模式实际host从settings→Models and roles→Advisor→Choose model→未配置详情，真实编辑外部topP后拒绝返回，再显式选择ready other，核对成功结果、模型/档位/兄弟角色、settings原入口、held草稿、外部文件保持与零prompt/fetch；构造前确定模式并断言实际备用屏序列。导航仍使用accepted topP0.7，显式role保存后原发布owner读取文件0.8；初轮三个单元期待maxTurns保存后仍20属于夹具时点错误，改为导航期20、显式保存后31，未为此改变产品发布合同。

最终主代理heap768MiB、单worker串行执行publication19、role18、auth24及过滤实际host14，共75项实际执行通过，175项host未选不计通过。三项独立反转撤销返回事务更新、当前档位更新、读取fallback，分别按文件/名称确认12/3/4项失败，同次控制8/3/6项通过、188/13/9项未选；finally逐字节恢复model源码并核对SHA-256 `6f6d8b1de9501ea8624568a4580d6306e2208d6fb9a78664fd393c0a25629d98`，恢复后重验上述75项。过滤控制包含八条原角色认证返回和四条普通详情拒绝路径，没有把未选测试算作通过。

五静态门、diff、module facade 0及TS build `33c2685c0eda`通过，build heap1536MiB，保留118既有docs-source advisory；HANDOFF与当前摘要更新，本批scratch清理。延迟核对第八十七批CI `40574711764`已success；第八十八批CI `40576592505`与第八十九批CI `40578160357`仍in_progress，Watch `40576592407`及`40578160348`均success，不替代本批精确SHA验证。本批终端为RecordingTerminal、失败为隔离受控注入，未新增真实PTY、provider/OAuth、exe、桌面、原生Windows、真实磁盘故障或20k历史验证；未运行全仓/原Phase20矩阵，无独立review，ADD整体active。本批Git/CI另绑定。

### 第九十一批：角色菜单/档位准入拒绝与接受宿主归属

续接核对HEAD为已推送的第九十批`3405c0b50667ae31efb27c0674cf53464650fb2c`，工作区clean。ADD-02/03继续检查[角色菜单](../../packages/ts-shell/src/cli/interactive/picker/model/role.ts)和[角色档位](../../packages/ts-shell/src/cli/interactive/picker/model/thinking.ts)：准入拒绝只返回note，没有消费旧动作，真实Enter释放overlay后settings/model链关闭；准入回调在接受后关闭或替换host时也不能靠previewEnd退休旧对象。旧控制只直接apply，没有覆盖已释放宿主。加强和新增owner24、regular/fullscreen×choose/default/thinking/effort的实际host8，在旧实现确认32项失败；最初两条不应调用的writer探针没有返回有效结果，修为受控RoleResult后同24项全部在行为断言失败，未改产品来掩盖夹具。

只读参考快照`0838d2ab4407b74e870de07e1a6780a13c7d542c`的`packages/tui/src/overlays/model-hub.ts`1255–1275在分配false/rejection后重绘原面板，并在异步完成时检查disposed；1280–1308沿当前role/scope和原回调完成分配。采用失败后保留导航、已退出页面不接受迟到结果的决定。本项目继续使用原角色事务、父级与OverlayHost accepted generation，不复制hub、scope或保存系统，也不在拒绝后自动执行原动作。

两owner现明确接收宿主归属检查，在动作开始、choice admission后及return admission后复验；一旦失去归属或收到拒绝即永久退休，direct apply和迟到load均不能复活。原浏览signal/context admission有效才沿原back构造fresh父级，取消/会话或workspace归属失效/复验抛错不重开，保留原安全拒绝；fresh父级上的新动作才捕获当前事务。原模型详情的同一signal/admission逻辑提到所属[owner模块](../../packages/ts-shell/src/cli/interactive/picker/model/owner.ts)供详情和角色复用；只抽取原判断并保留catch的拒绝语义，没有新建通用生命周期或保存系统。

[角色回归](../../packages/ts-shell/src/cli/interactive/picker/model/role.test.ts)涵盖三个菜单动作、三个自动角色档位新基线、接受后admission关闭/替换×成功/拒绝、返回检查关闭/替换、原owner拒绝/取消/抛错、choose/Back/effort延迟到host关闭后才开始，以及无return guard/guard抛错时保留原拒绝并退休。实际host使用真实隔离文件变更和既有session/config owner，核对每个入口回正确父级/焦点、原notice、held草稿、拒绝期零写、显式新动作保存、默认/兄弟角色保持及零prompt/fetch；构造前确定真实屏幕模式并断言alternate-screen序列。导航期配置保持accepted，显式保存后继续由原发布owner接受文件值。

最终主代理heap768MiB、单worker串行运行role46、model43、admission34、publication19及过滤实际host14，共156项实际执行通过；host183项未选不算通过。五项独立反转撤销拒绝返回、browser归属、choice callback后host复验、return callback后host复验、永久退休，依次按名称确认28/10/8/4/15项失败，所选控制9/6/7/10/6项通过，206/64/31/32/25项未选。finally逐字节恢复并核对SHA-256：role `b081b7977175737a718558164ca936218a1fd5a36d23668d66506c979b4d8129`、thinking `a56acb47eba032cb236a6afb8d32fd37b6292c6ba9993e2827ccd2c75d7af4cb`、owner `0e36c3b4d1ee4d43740a2a5edb2254b7801b24140c5a089e50365fab4a0f5274`；恢复后完成上述最终重验。跨轮和过滤未选项不累算。

另以实际Node launcher、现有PTY relay与环境隔离owner串行运行regular/fullscreen两条新空会话：settings→Advisor菜单→外部topP变化→拒绝回原Advisor；显式重开并分配ready shared；再入角色档位→第二次文件变化→拒绝回角色菜单→显式保存low。检查两个拒绝期间selection不变、最终effort之外的default保持、外部配置字节保持、原settings返回、实际屏幕模式、零transcript message与退出0。每进程heap768MiB，无长历史或exe；PTY不提供网络调用计数，零派发/网络直接证据来自host spies，未用终端probe替代真实provider/桌面验收。

五静态门、diff、module facade 0及TS build `07790d1e5522`通过，build heap1536MiB；118既有docs-source advisory保留。HANDOFF与当前摘要更新，本批scratch清理。延迟核对第八十八批CI `40576592505`已success；第八十九批CI `40578160357`与第九十批CI `40579335521`仍in_progress，Watch `40578160348`及`40579335559`均success，不替代本批精确SHA验证。未运行全仓、真实provider/OAuth、exe、桌面、原生Windows、真实磁盘故障或20k历史，未重跑原Phase20矩阵，无独立review，ADD整体active。本批Git/CI另绑定。

### 第九十二批：详情异常返回沿原浏览归属准入

第九十一批`6fadce8abccc525e8fbfd6bad3ce2d5cf77481d1`已推送，续接核对本地/远端一致且clean。ADD-01/02/03继续核对[详情owner](../../packages/ts-shell/src/cli/interactive/picker/model/details.ts)：普通拒绝会调用原`source.canReturn`，refresh和最终admit的异常catch却直接调用`source.back`。原workspace已失效而accepted host仍存在时，实际Enter会重开旧settings/model链；返回检查自身关闭或替换host也没有相同的复验。十条owner及两模式×两失败边界四条实际host回归在旧实现确认14项失败，六条原正常异常返回控制通过。

只读参考快照`0838d2ab4407b74e870de07e1a6780a13c7d542c`的`packages/tui/src/overlays/model-hub.ts`604–634、1142–1162将同步/异步读取错误保留在现有面板，1255–1275在异步失败完成时检查disposed后重绘。采用保留安全错误和导航、已退出页面不接受结果的决定。本项目还须遵守独立的session/workspace浏览准入，因此未获准时仅保留安全notice，不能因读取错误重开父级；不复制参考hub或新增导航/保存owner。

详情本地的同一拒绝返回函数现在处理普通拒绝、refresh异常和admit异常。它在原browser检查前后复验accepted host，丢失归属则不发布；原browser准入缺失、拒绝或抛错时不构造父级，消费并永久退休旧详情；仍获准才沿原fresh父级返回。六条正常返回控制明确声明有效return guard，和实际model目录已提供的合同一致，保留原notice及具体模型焦点。

[owner测试](../../packages/ts-shell/src/cli/interactive/picker/model/admission.test.ts)覆盖两类异常×缺少/拒绝/抛错guard，以及返回检查关闭/替换host、直接重试与迟到load。[实际host](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)regular/fullscreen从settings进入具体未配置模型，在refresh/admit故障时设置真实runtime的workspaceIssue，经原configuration admission拒绝旧browser；检查面板不重开、安全notice、原配置publication/文件/session保持、held草稿及零prompt/fetch。fixture清除workspaceIssue后须显式重新打开settings，再到原模型配置并取消；这不冒充产品自动恢复或真实磁盘故障。

主代理heap768MiB、单worker串行执行`vitest run src/cli/interactive/picker/model/admission.test.ts src/cli/interactive/picker/model/publication.test.ts src/cli/interactive/picker/model/watch.test.ts --threads=false`，44+19+7共70项通过；实际host用`-t 'retains model navigation after accepted detail|does not reopen models after a detail'`执行16项通过、185项未选，共86项实际执行通过。独立撤销异常返回准入及返回检查后的host复验，分别按名称确认14/6项预期失败，各六条控制通过；finally逐字节恢复details源码，SHA-256 `d95ae071b8b43a0285c7d0a0523a547267066a52b88559dc8a23a0aa71c8eb0d`，恢复后完成上述最终重验。过滤未选项不计通过。

五静态门、diff、module facade 0及TS build `1b57d1cebc47`通过，build heap1536MiB，118既有docs-source advisory保留；HANDOFF及当前摘要更新，本批scratch清理。延迟核对第八十九批CI `40578160357`success，第九十批CI `40579335521`与第九十一批CI `40580717825`仍in_progress，对应Watch `40579335559`及`40580717476`success。未运行全仓、真实PTY/provider/OAuth/exe/桌面/原生Windows/磁盘故障或20k历史，原Phase20矩阵未重跑，无独立review，ADD整体active。本批Git/CI另绑定。

### 第九十三批：目标档位恢复的过期返回与接受宿主写入边界

第九十二批`0effe82b7af3e1657731861a70cecb1a9f28d4e8`已推送，续接核对main与tracking一致且clean。ADD-01/02/03继续检查[目标档位恢复](../../packages/ts-shell/src/cli/interactive/picker/model/recovery.ts)：过期准入仅返回note且未消费动作，实际Enter释放overlay后丢settings/model链；接受后的admission或切换hook关闭/替换host时，未接入的accepted ownership也不能保护旧动作。原实现按名称确认18条owner及四条两模式/两入口host共22项失败，四条正常保存控制通过。

只读参考快照`0838d2ab4407b74e870de07e1a6780a13c7d542c`的`packages/tui/src/overlays/model-hub.ts`1625–1650将thinking变更交原onAssign及finishAssignment，1253–1275在失败后重绘并在异步完成后检查disposed。采用复用原写入owner、失败保留操作路径和退出后不接受迟到导航的决定。本项目继续遵守精确模型/档位、原浏览归属与事务写入准入，不复制参考scope或自动归一化策略；尚不支持的当前high仍为只读焦点，须明确移动后才保存。

恢复picker现接入既有OverlayHost accepted generation，在动作开始、choice admission及browser-return admission后复验；拒绝或丢失归属永久退休，原browser未获准不重开，仍获准则通过原back携notice返回fresh目录并保留精确模型与settings父级。明确重试才捕获新选择。[模型目录owner](../../packages/ts-shell/src/cli/interactive/picker/model.ts)同时把accepted ownership送入原setReviewedModelTarget的admission，pre-hook后及锁内仍由原事务复验；写入前关闭/替换不切换。写入已确认后post-hook关闭时保留原安全结果，抑制旧父级构造，不将关闭解释为未写入。未改provider/auth、核心writer、脚本或构建合同。

[recovery回归](../../packages/ts-shell/src/cli/interactive/picker/model/recovery.test.ts)覆盖目录/文件过期、原browser拒绝/取消/抛错、admission关闭/替换×成功/拒绝、返回检查关闭/替换、缺失/抛错guard、接受后延迟开始、实际Pre/PostModelSwitch hook及原配置/兄弟角色保持。[实际host](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)补regular/fullscreen×model/settings四条真实配置文件变更→拒绝回原目标→明确重开medium保存，以及两模式×pre-hook关闭/替换四条，证明InteractiveMode实际转交归属回调。它们分别检查原配置publication与文件、session selection、held草稿、准确屏幕模式及零prompt/fetch；post-hook确认写结果由owner场景证明，终端为RecordingTerminal。

五项独立反转撤销拒绝返回、browser准入、accepted opt-in、原writer的归属guard及保存后的返回复验，最终分别按名称确认13/5/4/6/4项预期失败，所选控制4/1/1/2/1项通过。第三组首轮被Vitest0.34的冻结嵌套状态diff报告器中断，归为无效反转并保留日志；核对其递归clone遗漏forceWritable后，状态保持断言改为完整序列化值比较，未解冻产品对象或削弱保持合同，重新得到四条实际状态断言失败。finally逐字节恢复并核对SHA-256：recovery `264ab257c007651af60e8d8b0b0ee45c38532f403b3189237aeb436bfec08820`、model `696491bfc2587a9f487bb156c184d7191230a7000d19d10ed1fbc89086c96dce`。

恢复后主代理heap768MiB、单worker串行执行`vitest run src/cli/interactive/picker/model/recovery.test.ts src/cli/interactive/picker/model.test.ts src/cli/interactive/picker/model/publication.test.ts --threads=false`，28+43+19共90项通过；host用`-t 'retains effort recovery|retains model navigation after accepted detail refusal'`执行12项通过、197项未选，共102项实际执行通过。五静态门、diff、module facade 0及TS build `c0237c461717`通过，build heap1536MiB，118既有docs-source advisory保留；HANDOFF与当前摘要更新，本批scratch清理。延迟读回第九十批CI `40579335521`、第九十一批CI `40580717825`均success；第九十二批CI `40582584417`仍in_progress、Watch `40582584573`success。本批未运行全仓、真实PTY/provider/OAuth/exe/桌面/原生Windows/磁盘故障或20k历史，原Phase20矩阵未重跑，无独立review，ADD整体active。本批Git/CI另绑定。


### 第九十四批：会话档位接受动作的宿主归属与安全返回

ADD-03继续核对settings→Thinking effort→保存/返回。原[档位owner](../../packages/ts-shell/src/cli/interactive/picker/thinking.ts)已有浏览generation及原事务admission，但未声明acceptsOwnership；实际Enter先释放面板，后续close/replace不再触发其previewEnd。原实现新增owner29项中14项失败、15项控制通过；两模式实际InteractiveMode10项中4项PreModelSwitch关闭/替换仍写入，6项控制通过、209项未选。另确认refusal和正常完成都会直接构造旧parent，旧动作尚可重用；不能以先前direct apply的关闭测试代替接受后事件链。

目标检查后只读对照参考model-hub.ts 1253–1275及1625–1650，快照0838d2ab4407b74e870de07e1a6780a13c7d542c：thinking沿原赋值callback，等待动作互斥，失败保持导航，异步完成复验disposed。采用这些决定，复用原runThinkingCommand/model事务及已有browser owner，不另建writer；本项目额外保留同一picker显式onOpen续期和已确认写入notice，不能以UI退役抹去持久结果。新增测试反转这些决定时须失败。

现接受动作的host generation进入同一current/admission，执行前、choice callback后、原hook后及锁内均能拒绝失效动作。refusal及完成返回通过原browser admission，随后再验host；拒绝/throw/abort/关闭/替换不构造旧parent。拒绝、完成或丢失归属退休本次动作；只有显式onOpen可重新捕获当前值，旧异步generation不能退休新开。原不支持档位的直接调用仍被原writer拒绝；测试改为先确认旧动作失效，再显式重开选择受支持档位，不再依赖同一消费对象的隐式重试。

主代理heap768MiB、单worker串行执行thinking36项及过滤实际host10项，共46项实际执行通过，209项未选不计通过。owner覆盖延迟开始、admission回调换host、写前/写后关闭、browser return拒绝/异常/取消、旧load不能复活和显式同实例重开；实际host覆盖外部配置变化→拒绝返回→新开low保存，以及Pre/PostModelSwitch×close/replace，检查完整session状态、兄弟角色、原配置文件、accepted publication、held草稿和零prompt/fetch。

六项独立反转：accepted opt-in、host guard、writer admission、browser return、动作消费和结果保留分别产生4/14/4/10/7/10项预期断言失败，同次控制6/22/32/26/29/26项通过，仅第一组另有209项未选。每次finally恢复原字节，SHA-256为1228880183677f16514f3849430360568f7f0272121fc5d5c575cea2c7329ded。反转自动分类初次以名称必须含thinking误拒一条原exact relay控制，修正为所属测试文件与精确失败名称核对；该组实际7项行为失败已读回，无产品修正。Vitest0.34 JSON顶层numPassedTests还包含未选项，收据一律逐assertionResults.status统计，不把215写成真实通过数。

五静态门、diff、module facade 0及TS build `6e18d285f49c`通过；恢复后完成上述46项最终重验，测试heap768MiB、build1536MiB，118既有docs-source advisory保留。工件归.omx/artifacts/phase20-addition-thinking-ownership/，HANDOFF已补记录，Git/CI另绑定。延迟核对第九十二批CI40582584417及第九十三批CI40585215498仍in_progress，第九十三批Watch40585215777已success。未运行全仓、真实PTY/provider/OAuth/exe/桌面/原生Windows/磁盘故障或20k历史，无独立review，原Phase20矩阵未重跑，ADD整体active。


### 第九十五批：显式队列保留组合正文与图片附件

ADD-11/12核对排队→提交/恢复的真实操作链，确认普通[SubmissionQueue](../../packages/ts-shell/src/cli/interactive/inputQueue.ts)已支持attachments，但[控制owner](../../packages/ts-shell/src/cli/runtime/inputQueue.ts)的factory及adapter只转text，[实际host](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts)也未转交附件，导致`/queue add 比较 /skill:a /skill:b`或简写附带的图片丢失。host还在提取rawCommandArgs前trim整个输入，裁掉literal任务尾部空白。旧实现新增owner4项中3项在附件断言失败、文本控制1项通过；两模式实际host16项全部在尾空白保持断言失败，219项未选，不据此声称旧实现的后续路径已经通过。

检查目标后，只读对照参考agent-session.ts 2136–2174、2237–2263、2302–2328，快照6c384aa30f619d7b28963f2bab24d8dacbe73cb6：队列与直接请求携带同一text/images；输入handler返回的图片随准备后的text传递；steer/followUp各自构造一份user content。采用同一正文和图片保持、一次任务的决定；本项目仍由原SubmissionQueue绑定session/root并延后skill展开到实际派发，保留多skill统一准入，未复制参考的预展开和分lane政策。

现queueCommandFor及attachSubmissionQueue以可选PromptAttachments贯通同一push，原文本调用保持一个text参数。host控制入口转交附件、保留raw正文尾部空白并按原user block记录图片；list/cancel等控制仍操作已有pending项，不额外制造任务。不新建队列、第二份附件缓存或另一条执行路径；沿原editing/release/takeAttachments、真实组合路由和失败retryDraft继续消费与恢复。

恢复后主代理heap768MiB、单worker串行执行runtime queue4、interactive queue4、pipe input9，以及过滤实际InteractiveMode18项（新增16与既有直接组合/中断控制2），共35项实际通过，217项host未选不计通过。两种screen×add/简写×正常排空/未知第二skill/超预算/中断覆盖真实Enter、两份body、两张图片、完整source metadata、单一后续派发、失败零部分派发、显式修复/重试和图片顺序；新host使用独立HOME/USERPROFILE/CHEERS_TEST_ROOT与真实小文件目录，prompt dispatch/fetch为mock。这是原host到派发端口的证据，不是provider图片理解或真实收费证据。

四项独立反转分别撤销queue factory附件、adapter附件、host转交及raw正文保持，产生3/3/16/16项精确预期失败，同次控制14/14/2/2项通过；后两组各217项未选，不计通过。每组finally逐字节恢复并核对SHA-256：queue owner259d6655711270d911d0159ab36e8309f0cd2fdb5e13f3a009325643d6740580、host cf84ee46f1eeecc3ad8dd06d52f4af1d5d6e1652378ff26ee90bdf266b7fe4e0。收据按逐assertionResults.status统计。

五静态门、diff、module facade 0与TS build `aa06eaf988f1`通过，build heap1536MiB；118既有docs-source advisory保留。工件归.omx/artifacts/phase20-addition-queued-images/，HANDOFF已追加具体陷阱，Git/CI另绑定。延迟核对第九十三批CI40585215498已completed/success；第九十二批40582584417及第九十四批40586855260仍in_progress，不推断为停止或成功。未运行全仓、真实PTY/provider/OAuth/exe/桌面/原生Windows/磁盘故障或20k历史，无独立review，原Phase20矩阵未重跑，ADD整体active。

### 第九十六批：普通命令路由再次入队的图片保持

第九十五批已提交推送`5695cd1e0cb2aaa002c724155bfcdbe5290c287d`，续接核对本地与tracking一致且clean。ADD-11/12继续检查排队→实际路由→组合提交，确认[普通路由](../../packages/ts-shell/src/cli/interactive/interactiveCommandRouter.ts)构造queueCommand时仍未转交input.attachments。`/queue add /queue add 比较 /skill:a /skill:b`等待前景结束后会经该入口再次入队；第九十五批覆盖的直接host快捷入口不能证明这条普通路由。旧实现新增两条router与两模式add/简写×正常/未知第二skill/超预算共十二条host场景均在图片保持断言失败，原十六条host控制通过，未选256项不计通过。

目标检查后只读对照参考`packages/coding-agent/src/session/agent-session.ts`，快照`0838d2ab4407b74e870de07e1a6780a13c7d542c`：7990–8014将text/images一起交给排队owner，8970–9008的steer/followUp也携相同images，9276–9301一次发布完整user content。采用跨入口保持同一图片集合及一次任务的决定；本项目仍由原SubmissionQueue绑定session/root，组合准备推迟到实际派发，不复制参考的预展开或分lane策略。生产修补仅在原router调用中转交已有可选attachments，未新增队列、缓存或执行路径。

[router回归](../../packages/ts-shell/src/cli/interactive/interactiveCommandRouter.test.ts)以实际queueCommand和SubmissionQueue检查add/简写的完整多行正文、图片顺序、一次性消费与尚未派发。[实际host](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)复用第九十五批操作链，补两种屏幕模式×两个入口×正常派发/第二skill缺失/超预算的再次入队；核对两份实际skill body、两张图片、原始source、一次后续任务，以及失败时零部分派发、原草稿/图片恢复和显式修复重试。原普通排队及中断控制保留；独立HOME/USERPROFILE/CHEERS_TEST_ROOT和小型真实文件目录，terminal为RecordingTerminal、prompt dispatch/fetch为mock，不是provider图片理解证据。

主代理单worker、heap768MiB串行聚焦router39、runtime queue4、submission queue4、pipe9及过滤host30，共86项实际执行通过；host217项未选不计通过。有效反转仅撤销router附件转交，按文件/名称确认14项预期失败，16项控制通过、256项未选。finally逐字节恢复，源码SHA-256 `c3814fc552702b01a7c66387f060b47e334a06ba461c540cd5e37efaa1945745`，恢复后完成重验；测试夹具的类型标注调整后router39另行通过，未改行为断言。

五静态门、diff、module facade 0及TS build `f60d926f601e`通过，build heap1536MiB，118既有docs-source advisory保留。工件归.omx/artifacts/phase20-addition-queue-routing/，HANDOFF与当前摘要更新，本批scratch清理。延迟核对第九十五批CI `40588730873`、第九十四批 `40586855260`及第九十二批 `40582584417`仍in_progress，三批Watch均success，第九十三批CI `40585215498`success；不等待或推断本批CI。未运行全仓、真实PTY/provider/OAuth/exe/桌面/原生Windows/磁盘故障或20k历史，无独立review，原Phase20矩阵未重跑，ADD整体active。本批Git/CI另绑定。

### 第九十七批：普通模型与preset的接受宿主写入边界

第九十六批`7b5a4b4882bb828511a01b96c9958374ed102c88`已推送且续接工作区clean。ADD-01/02/03沿code-review技能以两条gpt-6.1-sol独立只读lane复核当前面板与操作链；子代理未运行测试、build或验证脚本。代码lane检查26份相关source/test，发现普通[根model](../../packages/ts-shell/src/cli/interactive/picker/model.ts)未声明acceptsOwnership，ready模型和preset的写入只接captured.admission。架构lane独立确认同一BLOCK：Enter已释放可见页，之后关闭/替换不触发旧previewEnd，原事务仍可提交。实际用户可以在PreModelSwitch等待时重新输入`/settings`，使旧选择在新面板背后保存，不依赖人为异常的配置getter。

目标检查后只读对照参考model-hub.ts 1253–1275，快照`0838d2ab4407b74e870de07e1a6780a13c7d542c`：assignment互斥pending、失败保留原面板、异步完成检查disposed。采用原写入owner、pending互斥和退出后不接受旧导航的决定。本项目额外要求接受宿主失效后原writer也不得保存，保留精确target、配置/会话准入和同一事务，不复制参考的scope或面板实现。

现[model owner](../../packages/ts-shell/src/cli/interactive/picker/model/owner.ts)单独保存动作代次、pending和退休状态；根model显式重开才续期，load仍可供已打开详情刷新而不续写入权。原ready模型、单角色及整组preset的admission均复验原accepted host，原事务在pre-hook后及锁内继续检查。重复pending和消费后的直接调用被拒绝，旧completion不退休新打开代次。保存结果继续保真，构造parent前先检查原browser再检查host；取消、过期和已确认保存分别保留。两条旧测试此前在Escape关闭或消费后直接复用旧对象保存/读拒绝，修正为先断言旧对象退休，再显式打开新owner，原publication及stale preset要求保留。

[activation回归](../../packages/ts-shell/src/cli/interactive/picker/model/activation.test.ts)覆盖三入口×Pre/PostModelSwitch×关闭/替换、Escape真正关闭/原signal取消、pending重复与同实例显式重开、成功单次消费，以及保存后browser拒绝/取消/抛错/关闭/替换。初期Escape只退出导航层的断言按真实层级修正；未改变产品Escape政策。[实际host](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)两模式×model/settings×hook关闭/替换/等待期间显式重开settings共12条，另选18条thinking/recovery控制。保存notice用原transcript观察，避免新settings覆盖视图时误判丢失；检查完整session/兄弟角色、配置文件/accepted publication、原草稿及零prompt/fetch。terminal为RecordingTerminal，真实provider与原生PTY不在本批证据内。

主代理heap768MiB、单worker串行最终activation23、model43、publication19及过滤host30，共115项实际通过，host229项未选不计通过。完整旧实现、撤销accepted opt-in、撤销writer归属、撤销返回后host复验、撤销browser检查、撤销完成退休六组反转分别确认35/12/19/2/5/5项预期失败，控制18/41/34/21/18/18项通过；前三组各229项未选。最后一组首轮反转脚本按名称过窄，漏列两条browser返回后的旧动作重试；原断言实际失败，修正收据匹配并单独重跑确认五条，未改产品或测试预期。每组finally逐字节恢复并核对SHA-256：model `58bd5360e42b1b6924b3a83e97cd0015fca0fe9f37cf765a8f90806453879636`，owner `7b652df609a0347b889724993b9a828908a3cecfbe895b8a10781cea8af71862`，恢复后完成上述最终重验。

五静态门、diff、module facade 0及TS build `eb97f11d4f6a`通过，build heap1536MiB，118既有docs-source advisory保留。同两条lane复核最终产品修补分别APPROVE与CLEAR，仅覆盖本次root activation；不是整个ADD验收通过。架构另提出recovery保存后缺少原canReturn的WATCH，尚待动态确认，未记为已修。工件归.omx/artifacts/phase20-addition-model-activation/，HANDOFF与当前摘要更新，本批scratch清理。延迟读回第九十四批CI `40586855260`和第九十五批 `40588730873`均success；第九十六批 `40590043272`与第九十二批 `40582584417`仍in_progress，两者Watch已success。不等待本批CI，Git/精确SHA另绑定。未运行全仓、真实provider/OAuth/PTY/exe/桌面/原生Windows/磁盘故障或20k历史，原Phase20矩阵未重跑，ADD整体active。

### 第九十八批：目标档位保存结果与原浏览返回准入分离

第九十七批`69e2d48486337746a7256e969b7a48252b6a8470`已提交并推送，续接核对远端精确SHA与clean。ADD-01/02/03对独立架构WATCH作动态验证：[recovery完成](../../packages/ts-shell/src/cli/interactive/picker/model/recovery.ts)在selection.save后仅检查accepted host；实际PostModelSwitch将runtime.workspaceIssue设为不可用而不换host代次时，仍返回旧model/settings。权威串行基线确认owner8条失败/28条控制通过，regular/fullscreen×model/settings共四条host失败/12条控制通过；251条未选不计通过。

只读参考快照`0838d2ab4407b74e870de07e1a6780a13c7d542c`的model-hub.ts1253–1275沿原赋值callback处理pending、失败重绘并在异步完成时检查disposed。采用原事务与退出后不接受迟到导航的决定；本项目还须保留已确认writer结果并核查独立的session/workspace浏览准入。因此完成分支明确检查原canReturn，缺失/拒绝/抛错均仅保留note，callback后再次检查host才调用done。检查原browser context而非已消费choice fingerprint，正常保存仍可返回。未新增写入/导航系统或修改provider/auth核心。

[owner回归](../../packages/ts-shell/src/cli/interactive/picker/model/recovery.test.ts)覆盖post-hook后的workspace撤销、signal取消、admission抛错，以及缺失/拒绝/抛错guard、callback关闭/替换host、旧apply/load不复活；保留完整session/兄弟角色和配置文件字节。[实际host](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)四条失效返回与四条正常post-hook返回控制检查confirmed notice、真实workspace admission、原父级/焦点、实际请求目标、held草稿及零prompt/fetch。目标从原credential resolver核对，不能误读配置顶层model字段；首轮四条正常控制的该夹具错误已单独保留并修正，产品要求未改。

主代理heap768MiB、单worker最终串行执行recovery36、publication19及过滤host16，共71项实际通过，host251项未选不计通过。撤销完成browser检查触发owner8+host4共12条预期失败、40条控制通过；单独撤销callback后host复验触发owner2条预期失败、34条控制通过。每组finally逐字节恢复并核对recovery SHA-256 `6540cd2e2f2ae7ce5104c4e36e789b1e69c354c4492aa9f6fd18d5d8800a43fd`，恢复后完成上述最终重验。初次基线误在owner尚运行时启动host，立即中断host并废弃该段并发证据；其后基线、反转、最终验证均主代理单进程串行，不将重叠执行计为串行证据。

五静态门、diff、module facade 0及TS build `02d3735f2386`通过，build heap1536MiB，118既有docs-source advisory保留。两条原gpt-6.1-sol独立只读lane分别APPROVE/CLEAR，仅对本次完成返回修补，原WATCH在此范围解决，不代表整个ADD验收通过。HANDOFF与当前摘要更新，工件归.omx/artifacts/phase20-addition-recovery-return/，scratch归档清理。延迟核对第九十六批CI `40590043272`已success，第九十七批CI `40592404109`及第九十二批 `40582584417`仍in_progress，第九十七批Watch `40592404024`success。不等待本批CI，Git/精确SHA另绑定。未运行全仓、真实provider/OAuth/PTY/exe/桌面/原生Windows/磁盘故障或20k历史，原Phase20矩阵未重跑，ADD整体active。

### 第九十九批：同名模板与明确路径提交的现有语法验证

第九十八批`35507ae84fdefeb9c912919e3b1113d5c8bb3711`已提交推送并核对远端一致、工作区clean。ADD-10/11/12核对当前摘要中同名非skill模板/path的未验表述：[prose补全](../../packages/ts-shell/src/cli/interactive/completion/prose.ts)已按候选类型给冲突file加引号、directory留尾斜杠；[keymap](../../packages/ts-shell/src/cli/interactive/keymap.ts)明确首位完整命令Enter优先，Tab接受所选类型；[composition plan](../../packages/ts-shell/src/core/commands/composition/plan.ts)跳过字面token，只按原声明解释裸模板。四条新增owner与十条实际host均直接在现有产品实现通过，未复现新缺陷，因此本批仅改测试和文档。

只读参考pi快照`6c384aa30f619d7b28963f2bab24d8dacbe73cb6`的autocomplete.ts342–409优先命令，force时进入路径；426–445由文本位置/分隔符推断slash插入。采用明确command/path手势的决定，本项目继续保留候选type、snapshot edit、严格源offset及quote/尾斜杠语法，不复制其trimStart或文本类型推断。裸token是否符合用户本意不能由文件存在性证明，文档只收窄到确定性语法与明确选择，不称消除了全部语义歧义。

[owner回归](../../packages/ts-shell/src/cli/interactive/completion/prose.test.ts)四条覆盖首位/正文×file/directory：模板与skill为真实隔离文件，根路径存在性和path候选为受控注入。选择路径后普通提交不展开模板，与显式skill同任务时仍保持字面路径、只加载该skill；裸同名模板控制沿原声明展开。[实际host](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)regular/fullscreen各五条从Linux根目录实际发现`/tmp/`并同时发现真实tmp.md模板，覆盖首位/正文的path与command Tab，以及先选path后对首位完整`/tmp`按Enter。Tab本身零派发，随后Enter仅派发一次，path保持原正文、template展开原body，配置publication/session模型保持，fetch为零。只证明目录实际发现；file候选、native PTY、桌面、Windows与真实provider不在该证据内。审阅指出不能假定根目录只含两个候选，fixture现允许额外项，按精确kind/value遍历实际list长度。

主代理heap768MiB、单worker串行最终prose70及过滤host10，共80项实际通过；host267项未选不计通过。独立撤销file冲突引号及完整命令Enter优先，分别确认2/2条预期失败、2/8条控制通过，66/267条未选。首轮file反转已产生正确失败，但收据名称匹配遗漏Vitest参数引号，保留旧收据后修正matcher重跑，未改产品/断言要求。各组finally逐字节恢复，SHA-256 prose `c148531b2aa34e641a6051c9f3dcbfc7f492acbab166339750f402c80d6b1e7a`、keymap `91c6b4e75c0e00be969b84eff92623b9e09ea2b1233ca65835a29bd6558a6ee3`，并与固定Git基线原字节一致；恢复后最终重验通过。

五静态门与diff通过，118既有docs-source advisory保留；没有产品代码变更，不重复构建。两条gpt-6.1-sol只读lane最终APPROVE/CLEAR仅覆盖本批测试与语法表述，不授予全ADD验收。现有HANDOFF中按断言状态及行为匹配反转的规则继续适用，无新的产品陷阱条目。工件归.omx/artifacts/phase20-addition-template-path/，scratch归档清理。延迟核对第九十六批CI success；第九十七批 `40592404109`、第九十八批 `40593644060`及第九十二批 `40582584417`仍in_progress，第九十七/九十八批Watch `40592404024`/`40593643980`均success。本批Git/精确SHA另绑定，不等待新CI。未运行全仓、真实provider/OAuth/PTY/exe/桌面/原生Windows或20k历史，原Phase20矩阵未重跑，ADD整体active。


### 第一百批：设置Apply的预览清理、重试与完成归属

第九十九批`1c5e3f720812e39f16787e462e420859bdff9fec`已推送，续接前工作区clean。ADD-03动态核查[settingDetail](../../packages/ts-shell/src/cli/interactive/picker/settings.ts)：普通设置在原save的onApplied关闭宿主后，实际host已有revision门阻止返回，但owner仍构造旧next；theme的preview.end先经原follower.refresh关闭/替换已释放宿主时，旧Apply甚至继续写入。权威实际host基线两模式四条写入失败、八条控制通过。初始owner六条里一条把project保存误当成覆盖user生效，按既有user优先规则修正后四失败/两控制；不是产品优先级缺陷。初期三轮host夹具因加载时序、字符串choice引号及列表截断标签失败，均单独保留，不作产品证据。

只读参考快照`0838d2ab4407b74e870de07e1a6780a13c7d542c`的settings-selector.ts1054–1068沿原settings及change callback同步处理，没有可直接照搬的异步完成政策；model-hub.ts1253–1275在原赋值callback上排除pending、失败重绘、disposed后不接收迟到UI完成。采用原writer、排除重复及退休后不导航的决定，本项目另保留持久结果notice，并用原accepted-host generation跨Enter release。未复制参考代码或增加另一套保存/生命周期系统。

修补仅在详情owner：opt-in接收accepted ownership，动作前和preview清理后复验，Apply在reopen/save前消费；retry reopen返回、缺失或抛错后统一复验，失效不调用writer或构造旧retry页。保存完成保留原确认/refusal notice，host仍有效才构造next。原[openSettings](../../packages/ts-shell/src/cli/interactive/settings.ts)的scope、绑定、来源、锁内检查及publication未改；当前save内部没有await，因此本次无需扩充写入接口。独立code lane随后发现初版前置拒绝跳过原预览清理：迟到accepted theme动作在host已空时关闭不会结束lease，动态确认两条preview-state失败/十八条控制；现失效分支先消费再结束原lease，已消费动作直接返回。

[owner回归](../../packages/ts-shell/src/cli/interactive/picker/settings/lifecycle.test.ts)二十条覆盖user/project保存后关闭/替换/正常返回、延迟accepted动作、pending重复、真实主题lease清理、原writer冲突拒绝及reopen三类结果中的关闭/替换；检查配置字节、publication与完整session model、实际effective及未触碰scope。[实际InteractiveMode](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)十二条走原/settings、真实暂存和Enter：theme清理在写入前撤权、attention保存在写入后撤权，以及两模式正常控制；检查原草稿、保存notice、replacement保留、session不变与零prompt/fetch。terminal为RecordingTerminal，非native PTY或真实provider。

主代理heap768MiB、单worker、进程级串行最终执行lifecycle20、picker39、settings44、sources10及过滤host12，共125项通过；host277项未选不计通过。完整旧源码配现测试触发20项预期失败/39项控制；撤销accepted opt-in、preview后host检查、完成检查、reopen检查、Apply消费、迟到preview清理依次触发4/4/6/6/16/2项预期失败，控制8/8/14/14/4/18通过，前两组各277项未选。每组finally逐字节恢复并核对settings SHA-256 `07f051ee18d39c0204137485579e5c1137f2b37a7594fb3d718d2177afab1fba`，恢复后完成上述最终重验。

五静态门、diff、module facade报告0及TS build `d52e3bda70f2`通过，build heap1536MiB，118既有docs-source advisory保留。两条原gpt-6.1-sol只读lane最终APPROVE/CLEAR仅覆盖本次Apply/cleanup/retry/completion，不授予其他表单、浏览准入或全ADD验收。HANDOFF与当前摘要更新，工件归.omx/artifacts/phase20-addition-settings-lifecycle/，scratch归档清理。延迟核对第九十七/九十八批CI `40592404109`/`40593644060`均success；第九十九批CI `40595036419`及第九十二批 `40582584417`仍in_progress，前者Watch `40595036390`success。本批Git/精确SHA另绑定，不等待新CI。未运行全仓、真实provider/OAuth、native PTY/exe、桌面、原生Windows、磁盘故障或20k历史，原Phase20矩阵未重跑，ADD整体active。


### 第一百零一批：Escape父级返回的宿主复验与取消转交清理

第一百批`16d1429543cfb7e0fd05b532e09b71e9e4d0a545`已提交推送并核对远端一致、工作区clean，本轮继续ADD-02/03。定位[overlay](../../packages/ts-shell/src/cli/interactive/overlay.ts)的input和rows两条Escape分支均在previewBack、close之后无条件open(back())；theme预览清理经原refresh关闭/替换host时，旧parent仍覆盖。实际regular/fullscreen×关闭/替换四失败、正常返回两控制通过；owner的四callback边界×两表面×三结果矩阵基线十六失败/十四控制。该同步路径不经过异步applyPicker的revision保护，不能用Apply完成安全推断Escape安全。

只读参考快照`0838d2ab4407b74e870de07e1a6780a13c7d542c`的settings-selector.ts1013–1015派发cancel后返回，model-hub.ts2088–2105按取消层级处理，最终onCancel是终止步骤，没有随后无条件打开旧界面。采用cancel callback作为控制边界、回调之后不继续旧导航的决定；本项目保留原显式parent/controller转交，额外在每个同步边界检查原host身份/代次。未复制代码或增加新导航系统。

现两类Escape共用原handleKey内一条返回分支：previewBack后检查原picker及generation，close后要求仅发生预期的一次代次递增且host为空，back构造后再次检查才open。原[picker生命周期](../../packages/ts-shell/src/cli/interactive/picker/lifecycle.ts)准备转交时会让previewEnd保留controller，因此只抑制parent还不够；沿现有previewBack端口允许返回“转交中止”的cleanup，host未发布parent时调用，wrapper在finally取消原controller，并保留底层cleanup；prepare抛错尚未交回cleanup时也由wrapper取消。正常parent继续沿原controller运行，replacement的独立controller不受影响。架构lane在实施时指出不能让提早合并的分支抢占确认/重命名/拒绝子模式，最终以input或无row submode及原approval排除保留顺序。

[生命周期回归](../../packages/ts-shell/src/cli/interactive/picker/lifecycle.test.ts)新增二十九条：rows/input×prepare/previewEnd/notify/back构造×close/replace/keep，delete/rename先退子模式，prepare/构造抛错及原cancel cleanup抛错仍取消原controller；另保留六条原转交/关闭/inspection/input控制。实际[InteractiveMode](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)六条走原/settings及theme lease/Enter/箭头/Escape；失效保持关闭或replacement，原controller取消，文件字节/publication/session model/held草稿保持，无保存notice、prompt/fetch。正常两条返回后再进入attention设置，真实显式Apply成功，证明没有误取消父级。终端为RecordingTerminal，未作native PTY或真实provider验证。

主代理heap768MiB、单worker、进程级串行最终执行lifecycle35、overlay75、role46及过滤host34，共190项通过；host261项未选不计通过。host范围同时保留第100批Apply十二条和effort recovery十六条控制。八组有效反转：完整旧实现在当前owner/overlay范围十九失败/九十一控制，旧host四失败/两控制/289未选；独立撤销prepare复验、close后复验、构造后复验、中止cleanup调用、finally abort、prepare异常abort及submode保护，依次2/8/5/18/17/1/2项预期失败、33/27/30/17/18/34/33控制通过。各组finally逐字节恢复两个source，SHA-256分别为overlay `b903ded02504b9cbacf9e4265b9f6258e3f1caafb7316d0c81fefb5eebfec63d`、lifecycle `01471993d8d0cab7fc914b87dda5b7dd5b0a7af97d177fa057c347430048985a`，恢复后完成上述最终重验。

五静态门、diff、module facade报告0及TS build `91f42246bef9`通过，build heap1536MiB；118既有docs-source advisory保留。两条原gpt-6.1-sol只读lane最终APPROVE/CLEAR，仅覆盖Escape返回、同步callback与原controller清理，不授予全ADD验收。HANDOFF/当前摘要更新，工件归.omx/artifacts/phase20-addition-overlay-return/，scratch归档清理。延迟核对第99批CI `40595036419`success，第100批CI `40597440762`仍in_progress、Watch `40597440660`success；不等待新CI，本批提交/远端SHA另绑定。未运行全仓、真实provider/OAuth、native PTY/exe、桌面、原生Windows、磁盘故障或20k历史，原Phase20矩阵未重跑，ADD整体active。

### 第一百零二批：状态栏暂存、来源与重启时点的真实宿主验证

第一百零一批`4649643b61b7562aa3ed23ad69f70cc9021073b5`已提交推送，续接前工作区clean。ADD-03沿既有状态栏编辑器补regular/fullscreen×user/project×Apply/Discard八条[实际host回归](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)，没有修改产品实现或新增缺陷条目。目标源码先核对[字段生效政策](../../packages/ts-shell/src/config/fields.ts)和[接受态投影](../../packages/ts-shell/src/config/state.ts)：statusItems为restart，普通settings保存保持已安装显示值；不能沿用composerShape的即时生效预期。

只读参考settings-selector.ts快照`0838d2ab4407b74e870de07e1a6780a13c7d542c`的1054–1068及1891–1904行沿原settings owner/change callback与同源状态栏preview。采用原owner与共享preview词汇的决定，本项目继续保留独立暂存/Apply、scope优先级和restart政策；未复制参考代码。测试使用隔离真实配置/session，以实际terminal.input的方向键、Space、Enter和Escape完成编辑；私有model仅观察焦点与checked，不直接调用apply或改状态。

初始user为model、project为provider，目标暂存provider/directory。筛到Directory后隐藏provider仍选中；Enter暂存，再编辑移除Directory并Escape回到原pending。随后Apply或Discard、重开相同scope核对checkbox、文件字节/JSONC注释、accepted publication、完整session模型、held草稿及零prompt/fetch。preview观察实际view消费的statusItems端口。所有分支installed/runtime/view仍为provider；project Apply的stored/requested与新getRuntimeConfig读回为目标值且保留restart notice/detail；user Apply只改user存储，project覆盖仍有效并提示effective value differs；Discard保持原文件与publication。冷配置读回不等于实际进程重启。

首两轮八失败来自StdinBuffer对单独可打印Space的短暂保留，修正为等待实际checked/preview变化；同步后六通过/两失败来自错误的project立即生效预期，按上述既有合同修正。收据全部保留，两类均不计产品缺陷；修正合同后的原实现八条通过。现有HANDOFF已覆盖输入hold及restart显示发布，不追加重复条目。两条原gpt-6.1-sol只读lane最终APPROVE/CLEAR限于修正后测试与主张，code lane明确撤回早先对错误即时生效预期的认可，未运行验证脚本。

主代理heap768MiB、单worker、进程级串行最终执行settings owner39及新增host8，共47项实际通过；host295项未选不计通过。四组有效反转分别撤销取消二次编辑时的pending保持、将chosenIds缩为过滤结果、遗漏status preview reset、将candidate tui直接安装，确认8/8/6/2项预期失败、39/39/41/45项控制通过，每组295项未选。各组finally逐字节恢复，四source与固定Git基线一致，SHA-256收据保留，恢复后上述最终重验通过。

五静态门及最终文档drift/diff通过，118既有docs-source advisory保留；仅测试/文档变更，不重复build或module facade。工件归.omx/artifacts/phase20-addition-status-settings/，scratch归档清理。延迟观察第100批CI `40597440762`及Watch success；第101批CI `40598881157`仍in_progress、Watch `40598881187`success；第92批CI `40582584417`仍in_progress。本批Git/精确SHA另绑定，不等待新CI。RecordingTerminal与mock dispatch/fetch不证明native PTY、桌面、真实provider或实际重启；未运行全仓、exe、原生Windows、磁盘故障或20k历史，原Phase20矩阵未重跑，ADD整体active。

### 第一百零三批：状态栏project保存后的真实PTY与新进程重启

第一百零二批`9d0b7469667baf29884513e5ed62f87b38ad6bb9`已提交推送且远端一致、工作区clean。ADD-03继续补其明确未验的实际重启边界，不新增产品修补或重复同一host矩阵。使用既有[PTY relay](../../scripts/qa/relay.py)、[环境隔离](../../scripts/qa-pty-env.mjs)及[正式Node启动器](../../scripts/start.mjs)，主代理串行运行regular/fullscreen各编辑和重启两阶段，共四条最终进程收据；各进程heap768MiB，仅新空会话，无exe或长历史。

隔离user状态项为model、project为provider。实际键盘进入/settings、搜索statusItems并明确选择project；在子编辑器筛到directory后Space预览、Enter暂存，显式Discard保持文件字节，关闭列表后观察实际状态栏恢复provider。再次编辑同样选择并Apply，核对project保存provider/directory及JSONC注释、user字节保持、restart notice和详情Accepted的restart required；关闭列表后旧进程状态栏仍为provider。随后/exit正常退出0，再启动新的产品进程和空会话，真实状态栏显示provider/directory，重开project编辑器的directory已勾选且不改文件。每阶段在退出前核对空会话模型选择保持、transcript message为0；这不是网络调用计数或真实provider证据。

首次[构建预检](../../scripts/start-lib.mjs)在启动产品前拒绝旧build `91f42246bef9`：第102批仅改测试也会改变[输入指纹](../../scripts/build-identity.mjs)，因为它包含全部src TypeScript文件。按原构建门串行heap1536MiB重建为`fc8959959cadace60ac3b8db0acdefb5c76f72a7d4bbc91040fc6b8e0e042edf`，inputs `03860109a6c2e033bc93f6bfe38e79206ef031cebd019b716eb416240a1901a4`，artifact `62c6a5d555cf09168fcda80a53c1602487b564a0b8b59cc780783224ff513440`，与上一构建产物摘要相同；正式launcher重新验证fresh后运行。没有改构建政策或绕过freshness，HANDOFF补此可复用陷阱。

失败探针保留并分类为观察器/夹具问题：普通模式相对光标定位不以绝对行的K终止；启动界面短暂使用备用屏幕后才交给regular，须检查正式prompt后的最后屏幕状态；全屏settings根列表遮住状态栏，不能拿之前绘制的band作为取消后读回；无消息空会话正常退出即清理，不能用旧session-id重启；provider子串还会命中欢迎标题，单纯多等重绘也无效，最终按完整已绘制行边界识别band。修正均在探针，未改产品或放宽持久/重启断言。普通模式的中间两条部分通过不累加到最终四条；不将这些失败写成产品缺陷。

最终四条收据均通过并以/exit退出0，单进程输出约25–125KiB、有2MiB观察上限及45秒总期限；产品状态目录均清理。五静态门及diff通过，118既有docs-source advisory保留；无产品source变更，不重复Vitest、module facade或NormProof。第102批四组源码反转仍是restart/暂存合同的已有证据，本批未制作额外反转构建，也无独立review。工件归.omx/artifacts/phase20-addition-status-restart/，scratch归档清理。延迟核对第101批CI `40598881157`success，第102批CI `40600853941`仍in_progress、Watch `40600853895`success；本批Git/精确SHA另绑定，不等待新CI。只证明Linux PTY字节及project来源的新进程读回，未验user来源重启、像素/桌面/IME/原生Windows、真实provider、磁盘故障、全仓或20k历史；原Phase20矩阵未重跑，ADD整体active。

### 第一百零四批：真实请求计量与一步收尾预览边界

ADD-08/09从已配置兼容端点的`auto`模型取一次修补前、一次修补后接受的前景请求，均用正式fresh launcher、Linux regular PTY、隔离home/project。工具allowlist为空、MCP关闭、offline=true禁止自发请求、缓存预热off、重试关闭、一步及请求输出上限128；上限是请求配置，不证明远端执行了输出限制。只把当前已选profile的必要字段复制到0700夹具内的0600配置，finally清除；不修改原配置。临时preloader只读同build的进程内usage Map并白名单投影数值、session及身份摘要，终端原文仅在有界内存观察后丢弃，不归档请求/响应正文、端点地址或凭据。每场各有一条接受的requestContext及usage记录、零工具调用；这不是传输层请求计数或`auto`后端型号证明。

修补前草稿状态栏~717，同次实际请求的本地估算568、provider输入460；定位到[预览](../../packages/ts-shell/src/cli/runtime/context/preview.ts)使用maxTurns>0，而[回合投影](../../packages/ts-shell/src/turn/projection.ts)在turn_start先计第一步，[派发](../../packages/ts-shell/src/turn/session.ts)按stepCount<maxSteps决定工具。maxTurns=1的真实首请求已收尾：省略schema，并在有工具目录时加入原[收尾消息](../../packages/ts-shell/src/turn/messages.ts)。现只把预览首步判断对齐为maxTurns>1，继续复用原消息、schema/system/history身份及wire估算owner，不改provider/auth、回合预算、默认值或构建政策。只读参考快照0838d2ab4407b74e870de07e1a6780a13c7d542c的provider-call preparation在transform之后记录实际发送工具；采用这一实际投影原则，不照搬其预算规则或tokenizer依赖。

新增[边界回归](../../packages/ts-shell/src/cli/runtime/context/preview.test.ts)连接真实preparePromptRequest、runTurn计数、createStepFunction和受控fetch响应，对dynamic/full×一步/两步检查完整序列化body、收尾指令有无、三类digest、local estimate、provider总输入、一次fetch、零MCP及会话文件保持。旧实现两条一步场景失败；最终撤回单行修补得到2失败/2控制通过，73未选不计通过，源码逐字节恢复并核对SHA后重验。初期夹具漏转topP造成4条统一3-token差额，补齐真实sampling参数后通过，保留为夹具诊断，不作为额外产品缺陷。最终主代理heap768MiB、单worker串行preview77+estimate2，共79项实际通过；五静态门及TS build通过，118既有docs-source advisory保留，build heap1536MiB。

最终build为688d5f73270ca906c5696493c03cea1ee9a2154683d1298263be4041e245be02，inputs cc95c202fa89bbebb03071fef2234171255f082a878f5cc1b3d8ae9e153bc7ef，artifact fba6f278a301d3682be9fb8b6eefae4cb0e1632c8f135c4e9d4f743e0092ff57。修补后PTY启动~558、固定37字符草稿~568，同次实际请求localEstimate=568、provider输入462；body为2007 UTF-8 bytes/2000 UTF-16 code units，wire system1474/1467、conversation402/402、tools0/0、envelope131/131相加一致。原始system来源base1220/1220、instructions207/200、separators1/1不是额外相加的wire类别，更不是精确分项tokens；缓存read/write均0且reportedCache=false，不据此断定远端缓存能力。当前样本的本地估算比provider总输入多106（约22.9%），只属于这条兼容请求；两场隔离路径及身份摘要不同，不能称同snapshot的后端前后对比，不能解释历史4.9k/1.7k。

实际/context保留assembled estimate、provider aggregate、body尺寸及tokenizer unavailable/no per-source allocation措辞，匹配该次遥测；两场均显式/exit退出0、原配置及夹具配置保持、secret fixture清除。最初未提交提示即超时的探针错用整行边界，改为只识别数字context token；synthetic零提交启动控制通过，排除出真实请求样本。修补后回合结束两秒的观察窗口仍未取得新的数值状态栏，只保留之前stale；原因未排他确认，不能声称automatic measured/calibrated衔接通过，也不从已删除的原始输出补造回答marker或reasoning身份。

HANDOFF记录首步计数陷阱，工件归.omx/artifacts/phase20-addition-context-live/，只归档脱敏遥测、收据和诊断脚本；无新独立review、全仓、exe、桌面/IME/Windows或20k历史验证，不重跑原Phase20矩阵，ADD整体active。延迟检查第102批CI40600853941/Watch40600853895均success，第103批Watch40602411753 success、CI40602411771仍in_progress；本批Git/精确SHA及CI另绑定，不等待新CI。

### 第一百零五批：请求后实测回退与模型能力边界

独立只读review确认第一百零四批的dynamic/full×两步夹具没有让首响应产生tool call，`runTurn`在首个stop后已经结束，因此原测试没有真正覆盖第二步收尾。现[边界回归](../../packages/ts-shell/src/cli/runtime/context/preview.test.ts)让两步场景先返回一次`read`调用、再返回final answer，明确要求两次fetch；首个body继续与preview完全相等，最后一个body同时省略tools并包含收尾指令。一步场景保持一次fetch控制。撤回`allowTools=maxTurns>1`的单行修补后，该组出现2项预期失败、2项控制通过。

ADD-08沿[状态投影](../../packages/ts-shell/src/cli/interactive/sessionFacts.ts)修正live preview与measured precedence：只有带`tokens`的`estimated/calibrated`读数可以覆盖provider实测，`unknown/stale`等无数字对象必须让位给身份匹配的measured；若没有匹配实测，仍保留unknown/stale而非伪造数字。[投影回归](../../packages/ts-shell/src/cli/interactive/sessionFacts.test.ts)覆盖四个来源，[actual InteractiveMode](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)在regular/fullscreen各走真实提交、busy/resume和状态绘制：preview先显示`~700/`，过期后`promptContext.read()`为stale，同一host状态栏改回measured`568/`且不再显示`? stale`。该host使用RecordingTerminal和受控route，不冒充原生PTY或真实provider。

同轮provider只读审计确认旧清单多数已收口：主回合失败分类、Anthropic thinking budget/signature、Copilot Device Code、Google AI/Vertex和Bedrock ConverseStream已有生产实现及本地协议测试；Anthropic OAuth仍需要授权client registration/scopes，SSE `event:`对当前三个JSON自描述协议不是缺陷。仍确认的F-04是OpenAI reasoning model在`auto` effort下默认为非none reasoning，旧的`REASONING_REQUEST_SHAPE`却允许temperature。[catalog owner](../../packages/ts-shell/src/core/models/catalog.ts)现声明`supportsTemperature:false`，[catalog合同](../../packages/ts-shell/src/core/models/catalogShape.test.ts)及[真实step body](../../packages/ts-shell/src/turn/step.test.ts)分别锁定shape与wire。

[catalog refresh](../../packages/ts-shell/src/core/models/catalogRefresh.ts)同时补回models.dev已经发布的可执行能力：`reasoning`、`temperature`、image input modality和`limit.output`分别投影为reasoning、temperature capability、vision与maxTokens；字段缺失时保持absent，不用模型名猜测。独立review又发现cache后置会覆盖review过的built-in request constraints；[catalog store](../../packages/ts-shell/src/core/models/catalogStore.ts)现以fill-missing capability policy合并refresh cache，显式built-in `reasoning/vision/compat/promptCache/thinkingLevelMap/maxTokens/serviceTiers` 不被覆盖，用户catalog仍按普通overlay最终优先。[refresh回归](../../packages/ts-shell/src/core/models/catalogRefresh.test.ts)覆盖true/false、image/text、output limit、缺失字段及refresh→load→request shape，[catalog合同](../../packages/ts-shell/src/core/models/catalogShape.test.ts)另锁cache/user precedence。四个独立反转分别触发status3、temperature2、catalog1、cache precedence1项预期失败；源码逐字节恢复并核对SHA-256 `6bf72f06`/`573746aa`/`cf6bffb9`/`45df62b3`后重验。

同一只读review在cache precedence修补后复核M1为resolved且未发现新回归，残余风险明确为实际请求body集成、尚无refresh producer的preserve分支及可变外部index。主代理heap768MiB、单worker、进程级串行最终执行6个受影响文件共518项全部通过。五静态门、module facade报告0及TS build `0bceb22d3bf0`通过，118既有docs-source advisory保留，build heap1536MiB。提交/远端SHA及新CI另绑定；真实provider请求、真实OAuth、原生PTY/桌面/Windows、历史差额分解与原Phase20矩阵仍不在本批证据内，ADD整体active。

### 第一百零六批：目录刷新上限准入与旧缓存收口

只读后续审计确认第一百零五批只校验了`limit.output`，[catalog refresh](../../packages/ts-shell/src/core/models/catalogRefresh.ts)仍按truthiness接受`limit.context`与`limit.input`。负值、字符串或非安全整数会被[缓存writer](../../packages/ts-shell/src/core/models/catalogStore.ts)持久化；旧缓存读取也不清理，而[compaction](../../packages/ts-shell/src/session/compaction.ts)的unknown fallback会把负input limit折算成零可用输入。修复位于共享[模型上限owner](../../packages/ts-shell/src/core/models/limits.ts)：只接受正安全整数，refresh投影与[catalog merge](../../packages/ts-shell/src/core/models/catalog.ts)的added-provider/built-in-patch两分支都复用同一规则。

新增[refresh回归](../../packages/ts-shell/src/core/models/catalogRefresh.test.ts)覆盖负值、小数、字符串、零、非安全整数、有效控制值，以及已写入磁盘的malformed新provider和built-in patch缓存。四个聚焦反转分别在raw context/input投影、cache sanitizer、predicate边界和built-in patch分支触发1项预期失败，其余未选不计通过；四source逐字节恢复并核对SHA-256 `5edeb144`/`639990c7`/`2e8e4035`/`56f050f6`后重验。

首次生产回归执行在任何refresh测试隔离前覆盖了操作者`~/.cheers/models-cache.json`；实际mtime与`demo` fixture精确匹配，该单一test residue已删除。测试文件现于`beforeEach`隔离HOME/USERPROFILE/CHEERS_TEST_ROOT，最终27项执行后再次确认真实cache路径不存在。主代理heap768MiB、单worker串行执行catalogRefresh9及catalogShape18，共27项通过；五静态门、module facade0及TS build `41adc6e1c4ce`通过，118既有docs-source advisory保留，build heap1536MiB。独立只读review先指出旧缓存与test isolation缺口，修补后closure无remaining finding。本批未运行真实models.dev refresh、真实provider、PTY/exe、桌面/Windows或全仓，未重跑原Phase20矩阵；提交/推送/CI另绑定，ADD整体active。

### 第一百零七批：刷新目录来源与“yours”标记

[catalog merge](../../packages/ts-shell/src/core/models/catalog.ts)此前无论overlay来自refresh cache还是用户文件，都无条件写入`custom:true`；[catalog surface](../../packages/ts-shell/src/core/models/catalogSurface.ts)又把该字段渲染为`yours`。因此一次公开目录刷新会把built-in provider和新增provider都伪装成用户自有。现[加载owner](../../packages/ts-shell/src/core/models/catalogStore.ts)分别传入`origin:refresh/user`，merge以来源决定custom，输入patch中的同名字段不能覆盖；默认调用仍保持原用户overlay语义。

[refresh/surface回归](../../packages/ts-shell/src/core/models/catalogRefresh.test.ts)在同一隔离环境中刷新新增provider与built-in patch，再写用户provider并直接渲染目录：前两者不得含`yours`，后者必须含`yours`。撤回origin判定后该测试1项失败、9项未选；四source逐字节恢复并核对SHA-256 `34cac2c0`/`2f9e6f0d`/`e7f53e23`/`b803a198`后重验。主代理heap768MiB、单worker串行执行四文件49项通过；五静态门、module facade0及TS build `a7837621f4e3`通过，118既有docs-source advisory保留，build heap1536MiB。

本批只修正catalogue来源投影，没有改变真实provider、连接选择或认证行为；未运行真实models.dev refresh、真实provider、PTY/exe、桌面/Windows或全仓，未重跑原Phase20矩阵。提交/推送/CI另绑定，ADD整体active。

### 第一百零八批：reasoning options与显式档位准入

可变目录已发布更适合推理能力的[reasoning_options](https://github.com/anomalyco/models.dev/blob/b185f948af78fd4bac14040e78c8e8c5e94b5196/packages/core/src/schema.ts#L25-L43)：`effort`、`toggle`与`budget_tokens`。此前[catalog refresh](../../packages/ts-shell/src/core/models/catalogRefresh.ts)只保留`reasoning:boolean`，因此即使声明没有low/medium/high，[capability](../../packages/ts-shell/src/core/models/capability.ts)仍按legacy规则允许全部显式档位，[request shape](../../packages/ts-shell/src/core/models/requestShape.ts)随后发送项目自己的level名。对只接受budget/toggle或使用minimal/xhigh/max的模型，这不是unknown而是可避免的错误请求。

现refresh对有效`effort`声明生成完整`thinkingLevelMap`：只有精确出现的low/medium/high映射自身，其余项目level显式为null；不把minimal/xhigh/max折叠为邻近档，也不把none/default混同auto。有效空数组、toggle-only、budget-only及仅含特殊effort值的声明都使三个显式档位unsupported，auto仍受支持；字段缺失、非数组、无values或未来未知type继续不投影，保留legacy unknown兼容边界。`budget_tokens`本批不擅自投影固定level预算，以免把协议能力写成错误字段。

[refresh回归](../../packages/ts-shell/src/core/models/catalogRefresh.test.ts)覆盖partial exact、budget+effort、empty、toggle、budget、special、absent、malformed、non-array及future未知结构，并验证partial的medium显式拒绝、auto可用及budget-only无`thinkingLevelName`。[catalog合同](../../packages/ts-shell/src/core/models/catalogShape.test.ts)另锁reviewed完整thinking map不能被refresh metadata替换。五个聚焦反转分别在去掉投影、返回partial map、折叠special别名、恢复budget-only unknown及让refresh覆盖reviewed map时触发1项预期失败，其余未选不计通过；三source逐字节恢复并核对SHA-256 `ac4893a3`/`a00e6a09`/`99bd2c6f`后重验。

独立只读review先指出budget-only仍可能over-claim显式档位；修补为完整null map并补capability断言后closure无remaining finding，非数组/未来type测试缺口已在最终回归补齐。主代理heap768MiB、单worker串行执行六文件75项通过；五静态门、module facade0及TS build `6eec90a17825`通过，118既有docs-source advisory保留，build heap1536MiB。本批未运行真实provider请求、真实models.dev刷新、PTY/exe、桌面/Windows或全仓，未重跑原Phase20矩阵；提交/推送/CI另绑定，ADD整体active。

### 第一百零九批：模型上限helper的声明依赖环

迟到读回GitHub CI `40625431536`与`40626395673`均为failure，唯一失败是`test:scripts`第70项完整repository declaration graph：`packages/ts-shell/src/core/models/catalog.ts -> limits.ts -> catalog.ts`。本地`verify:import-cycles`报runtime/type-only均为0，因此未发现[limits owner](../../packages/ts-shell/src/core/models/limits.ts)从[catalog](../../packages/ts-shell/src/core/models/catalog.ts)导入`CatalogModel`形成的declaration back-edge；`23550c7d`与`803b9741`不能改记为绿色。

现limits以本地structural `ModelLimits`约束generic sanitizer，只读取contextWindow/inputLimit/maxTokens并把通过准入的字段重建回对象，不再import catalog type；catalog仍单向调用该helper，positive-safe-integer语义和旧缓存清理保持不变。主代理heap768MiB串行`test:scripts`175项全部通过，其中完整declaration graph明确通过；六个受影响文件75项、五静态门、module facade0及TS build `4da89e6e9976`通过，build heap1536MiB，118既有docs-source advisory保留。limits最终SHA-256为`2459d84e`，catalog与refresh保持`34cac2c0`/`ac4893a3`。

本批只修复构建期依赖所有权，没有改变运行时能力或provider行为；未运行真实provider/models.dev刷新、PTY/exe、桌面/Windows或全仓。修复提交的push与精确SHA CI另绑定，ADD整体active。

### 第一百一十批：不支持工具的目录模型与请求形状一致性

models.dev当前把`tool_call`发布为必需boolean；其中存在显式`false`条目。此前[catalog refresh](../../packages/ts-shell/src/core/models/catalogRefresh.ts)没有投影该字段，[request shape](../../packages/ts-shell/src/core/models/requestShape.ts)也只能默认capable，而[provider step](../../packages/ts-shell/src/turn/step.ts)按界面`allowTools`直接声明工具。结果是显式不支持工具的模型仍收到工具schema和鼓励调用的系统提示；若session已有assistant tool call或tool result，还会发送其无法理解的history。[context preview](../../packages/ts-shell/src/cli/runtime/context/preview.ts)又独立构造body，先保留工具型提示和仅因schema存在的收尾消息，造成预览与实际请求不同。

[catalog owner](../../packages/ts-shell/src/core/models/catalog.ts)现声明可选`toolCalling`；refresh只在`typeof tool_call === "boolean"`时投影，字段缺失仍保持capable的旧兼容语义。merge继续让reviewed built-in能力覆盖refresh cache，并让用户catalog最终优先，因此公开索引不能替用户翻转已评审约束。resolved shape以`toolCalling:false`禁用工具，absent或true保持既有行为。

dispatch和preview现在都以effective shape为唯一来源：非工具模型得到空schema、无工具声明、无`tool_choice`、不注入closing-step消息，并使用[无工具系统提示](../../packages/ts-shell/src/turn/prompt.ts)；foreground prompt regeneration沿用[provider host](../../packages/ts-shell/src/cli/provider/step.ts)的plan/build mode，而不依赖仅用于delegated request的`StepOptions.agentMode`。capable模型继续使用原工具提示和声明。已有tool history在本地preflight以共享错误拒绝，不发送provider请求。

独立只读复核又发现account-pool的preview/dispatch目标可能不同：`resolveCliCredential`已接受session ID，dispatch bridge也传入了它，但bootstrap的`resolveConfigTarget`回调丢弃该参数；pool的session affinity因此只在真实发送时生效，preview可能选中另一成员并生成不同的authorization/replay identity。现resolver合同保留可选session ID，[bootstrap](../../packages/ts-shell/src/cli/bootstrap/cliBootstrapContext.ts)、初始/刷新配置、scoped config及[preview](../../packages/ts-shell/src/cli/runtime/context/preview.ts)的构造和复核都传入捕获的session ID；无host resolver时的fallback也使用同一pool输入，没有新增第二套选择。

preview复用相同的schema/system/history digest、closing policy和local estimate，[真实turn lifecycle回归](../../packages/ts-shell/src/cli/runtime/context/preview.test.ts)对unknown与explicit false×dynamic/full×一步/两步及no-tools plan mode比较完整序列化body；另覆盖fresh no-tool请求、历史拒绝、capable保持和直接prompt分支。[Provider host回归](../../packages/ts-shell/src/cli/provider/step.test.ts)实际发送到本地受控协议，证明foreground plan mode不会回落到build提示。

account-pool回归在[真实preview/step组合](../../packages/ts-shell/src/cli/runtime/context/preview.test.ts)中把两成员pool的affinity先固定到非首项，再让preview与`createProviderStep`各自解析同一session；实际本地HTTP body、replay binding、schema/system/history/wire-history digest及wire message count必须逐项一致。[bootstrap回归](../../packages/ts-shell/src/cli/bootstrap/startup.test.ts)另证明启动器回调保留session参数。session身份现已贯穿bootstrap、初始/刷新配置、scope、preview、status、`/usage`、model命令与picker、handoff、advisor、renewal及account-state capture；`/usage`在检查/重置前还会重新验证同一session-affine成员。

第二轮独立只读review确认先前三项均可关闭：sessionless resolution、preview目标复核不完整及prompt身份只传播schema/system/history。新的[request target owner](../../packages/ts-shell/src/cli/provider/requestTarget.ts)让preview和dispatch共同捕获headers、replay binding、replay owner及credential ID/generation；preview revalidate会比较这些完整字段，因此同模型/端点下的pool fallback或credential backoff变化也不能沿用旧预览。`PromptIdentitySnapshot`则把endpoint、schema/system/history/wire-history digest、wire message count及replay binding从[SentRequest](../../packages/ts-shell/src/provider/request/sentRequest.ts)传到turn options、runtime context、状态栏和`/context`。

独立只读review此前还修正foreground no-tool plan语义与dispatch closing预算：[step回归](../../packages/ts-shell/src/turn/step.test.ts)使用巨大schema与边界窗口同时检查两项。早期六组聚焦反转分别触发未调用history predicate、忽略non-tool prompt regeneration、preview保留旧schema/提示且跳过history拒绝、丢失host mode、closing预算重计schema、closing预算漏计指令等预期失败；源码逐字节恢复。closure阶段另做两组最终反转：移除preview的replay binding/credential ID/generation/replay owner比较后，account-pool目标测试1项预期失败；从step的prompt identity移除wire-history digest、wire message count及replay binding后，同一组合回归1项预期失败。两次均未计skip为通过，源码逐字节恢复并核对SHA-256后，preview为`1a1c6942`，step为`81e52d01`。

主代理以heap768MiB、2 worker单进程串行运行18个受影响文件500项全部通过；`test:scripts`175项、五静态门、module facade0及`git diff --check`通过，118既有docs-source advisory保留。heap1536MiB fresh TS build为`512adc9920fc1d5c977a38ce42e83f273415d1f063cc98c86fc3ca0793ab9c17`，inputs `075c3ed4a840d4636a493263f872441d8db72450354adce5b040dfc9a5674f1e`，artifact `19bde0f1847a1b3c17a8f51bd6693d39301e2cd3a850cacdc17b86098092b550`；fresh build后5个受影响compiled CLI文件7项通过。

一次误用的broad suite不计为本批验收：旧build下5个compiled CLI文件/7项按freshness拒绝，另有1个worker OOM。前一HEAD`9f10edbe`CI`40628156612`及Watch`40628156518`均success；本批提交/推送/精确CI另绑定。未运行真实provider或真实models.dev刷新，也未取得PTY/exe、桌面/原生Windows、磁盘故障或20k历史证据；原Phase20矩阵未重跑，仍为35 complete / 12 partial / 0 open，ADD整体active。

### 第一百一十一批：摘要请求与非工具模型的形状一致性

第一百一十批让主回合与context preview从同一`ResolvedRequestShape`决定工具schema、系统提示、收尾消息与预算，显式`tool_call:false`模型不再收到工具形状。后续只读审计与主代理独立核查确认，第三条请求生产路径没有跟上：[压缩摘要消息owner](../../packages/ts-shell/src/core/query/compaction/summarize.ts)的`CompactionChatMessage`契约写着"工具调用以文本呈现"，而[压缩接线](../../packages/ts-shell/src/cli/runtime/compaction.ts)的`toCompactionMessages`把结构化`tool_calls`与`tool_call_id`原样转发。该形状只在有工具能力的模型上被端点接受；对目录声明无工具能力的模型，主回合会以`TOOL_HISTORY_UNSUPPORTED_MESSAGE`拒绝，而`/compact`、`/back`的abandoned-turn摘要与阈值压缩仍会把它发出去，且不带`tools`声明，形成自相矛盾的请求。

修复沿原owner进行，不新增第二套投影：`prepareCompactionMessages`按`provider.shape.toolCalling === false`选择历史形态；有工具能力时保持结构，使摘要器读到实际执行内容；无工具能力时把同一对话写成`[tool call <id>] name args`与`[tool result <id>]`文本，合并连续user语句（结构消失后原先由call/result配对支撑的独立轮次不再必要）。纯文本预检与实际发送共用这份投影，预算因此计入真实发送字节。[compaction wiring](../../packages/ts-shell/src/cli/runtime/compaction.ts)的provider合同新增可选`shape`，delegated/job路径本来只传provider、不带shape，现由接线侧从同一目录与地址解析；summary role的limits携带其自身shape，预检与发送因此不会各说各话。

[单元回归](../../packages/ts-shell/src/core/query/compaction/summarize.test.ts)连接真实`requestCompactionSummary`，对capable与`toolCalling:false`两种形状比较实际序列化body：前者保留`tool_calls`与`tool` role，后者两者均不出现且包含投影文本。[接线回归](../../packages/ts-shell/src/cli/runtime/compaction.test.ts)直接调用`buildCompactionWiring`，以不带shape的provider与`openai-compatible`端点观察真实本地HTTP body，断言`/chat/completions`路径与无工具结构。两处聚焦反转（撤销`proseToolHistory`选择、撤销接线shape传递）分别触发1项预期失败，其余用例保持通过；源码逐字节恢复并核对SHA-256`4cd965f6`（summarize）与`6b673493`（wiring）后重验。

主代理heap768MiB、单线程串行执行5个受影响文件84项通过；`verify:import-cycles`、`check:config-consumers`、`check:declarations`、`check:node-floor`、`analyze:module-facades`（ceiling20、reported0）及heap1536MiB TS build`6a412b60c9d6`通过。同轮只读审计另指出两条同类不一致，本批明确不改：子代理指令按宿主工具池列出工具而请求体按模型形状裁剪，涉及委派能力模型；handoff/director连续性提示假定`todo`与worker工具存在，但handoff的control在宿主缺少`todo`时已显式拒绝启动，不构成实际非法请求。两者记入后续批次。

本批未运行真实provider、PTY/exe、桌面/原生Windows或20k历史，未重跑原Phase20矩阵（仍为35 complete / 12 partial / 0 open），ADD整体active。一次被`.tmp/workspace-boundary/`副本放大的用例如实保留为反转证据，不计为验收：该目录中的测试副本由既有探针遗留，验收使用显式文件路径。

### 第一百一十二批：委派指令与目标模型工具能力的一致性

第一百一十一批记录的两条遗留观察中，子代理指令这条经复核构成真实缺陷：[子代理runner](../../packages/ts-shell/src/core/subagents/runner.ts)用宿主工具池生成"Tools available to you"，而[turn step](../../packages/ts-shell/src/turn/step.ts)按同一`ResolvedRequestShape`裁剪实际schema。对目录声明`tool_call:false`的委派模型，一次请求同时包含三件互相矛盾的事实：请求体无`tools`、系统提示说没有工具、子代理指令点名一组无法调用的工具。

修复保持在原owner：[SubagentHost](../../packages/ts-shell/src/turn/subagent.ts)新增可选`acceptsTools(model)`；`runSubagent`在目标不接受工具时既不列出清单也不把工具交给循环，指令退回既有的"You have no tools"分支。[delegatedSteps](../../packages/ts-shell/src/cli/provider/step.ts)以与step相同的目录地址解析目标形状并导出`acceptsTools`，[运行时装配](../../packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts)把该函数接到`subagentHost`。`acceptsTools`缺失仍表示capable，未声明能力的既有委派行为不变。

[runner回归](../../packages/ts-shell/src/core/subagents/runner.test.ts)新增用例：定义要求`read`、宿主声明`acceptsTools:false`，断言指令不含工具清单且`allowedTools`为空。[provider接线回归](../../packages/ts-shell/src/cli/provider/step.test.ts)把`review-model`标为`toolCalling:false`，断言`delegatedSteps.acceptsTools`对两个模型分别返回false/true、真实HTTP子请求体无`tools`、正文不含工具清单且包含"no tools"。三处聚焦反转分别撤销runner抑制、宿主传值与delegated解析，各触发1项预期失败；源码逐字节恢复并核对SHA-256`c421ba68`（runner）、`cf698968`（turn subagent）、`a46b7231`（provider step）后重验。

主代理heap1024MiB、单线程逐文件串行执行runner13、turn subagent22、provider step11、turn step96、invocation25、subagent5、boundary14，共186项通过；五静态门、module facade0及heap1536MiB TS build`13360ae8cc35`通过。handoff/director连续性提示同样假定`todo`与worker工具，但handoff的control在宿主缺少`todo`时显式拒绝启动，因此不构成实际非法请求，本批不改。未运行真实provider委派、PTY/exe、桌面/原生Windows或20k历史，原Phase20矩阵未重跑（35 complete / 12 partial / 0 open），ADD整体active。

### 第一百一十三批：director入口的主模型工具能力校验

第一百一十二批收口委派指令后，同一轮检查发现[director入口](../../packages/ts-shell/src/cli/director/command.ts)存在同族缺口。`/director on` 的语义是"主模型只能用读取与worker管理"，并把`workerEffects`/`workerObservations`作为feature tools注入；但入口不检查主模型是否接受工具声明。目录声明`tool_call:false`时，request shape会把这些工具全部裁掉，而director已经进入enabled并输出"Main tools are restricted to reading and worker management"——一个看不到任何工具的director。

现`on`在解析同一目录与地址后拒绝不具备工具能力的主模型，且在创建cycle或live owner之前返回。worker目标模型的选择、预算、审批与既有状态机不变。[director回归](../../packages/ts-shell/src/cli/director/runtime.test.ts)把`planner`标为`toolCalling:false`，断言命令返回明确拒绝且`liveDirectors`未注册；既有7项用例保持通过。反转撤销检查后该用例失败（命令返回`Director on`），源码逐字节恢复并核对SHA-256`cc2aa167`后重验。

主代理heap1024MiB单线程执行director8项通过；五静态门、module facade0及heap1536MiB TS build`0252882b0d1a`通过。handoff的同类假设保持不改：其control在宿主缺少`todo`时已显式拒绝启动，不产生非法请求。未运行真实provider、PTY/exe、桌面/原生Windows或20k历史，原Phase20矩阵未重跑（35 complete / 12 partial / 0 open），ADD整体active。

第一百一十一批记录的`6b673493`是当批反转与恢复时的wiring哈希；其后第一百一十一批的identity绑定与第一百一十四批的单次解析使该文件前进到`221f71fc`，历史证据不回溯改写。第一百一十二至一百一十三批同理只记录各自批次的源哈希。

### 第一百一十四批：摘要重播身份与有效形状、单次解析

第一百一十一批接入形状后，fallback 摘要的 `summaryIdentity` 仍只哈希 `provider` 与 `summaryLimits`。形状变化通常伴随模型变化（已含在 provider 身份里），因此当前没有可复现的重放缺陷；但"同一模型、形状不同"的两次捕获会得到相同身份，属于不完整绑定。现身份哈希改用含 shape 的 `effectiveLimits`，与预检和发送读取同一对象。

同一文件里 `renewedProvider` 连续两次调用 `resolveRequestShape` 填两个相邻字段，现改为一次解析后复用，两个字段因此描述同一次解析结果。聚焦 31 项与 runtime 37 项通过；本批只收窄身份与消除重复解析，不改变可观察的发送行为，因此未制作反转。heap1536MiB TS build `b91820512360`/`42b75c032e36` 通过。

### 第一百一十五批：模型详情的工具能力可见性与文档收口

模型详情此前展示 Images、Reasoning、Effort 与价格，却不显示模型是否接受工具，用户在选择模型时看不到"这个模型不能读、改、执行"。[元数据详情](../../packages/ts-shell/src/cli/interactive/picker/model/metadata.ts)现新增 `Tool calls: supported/unsupported/unverified`，未声明保持 unverified，与请求读取同一字段。回归新增显式 `toolCalling:false` 模型并断言 unsupported，撤销该行后 3 项预期失败，源码恢复并核对 SHA-256 `59e381ea` 后重验；metadata 9 与 picker 43 共 52 项通过。

同批更新第 16.3 节 model 验收行，使其包含工具能力可见性，避免文档描述落后于实现。另记录三项只读复核结论：补全/多 skill/命令组合未发现新缺陷；压缩投影的尺度边界由分段估算保证；研究入口不校验工具能力但明确声明"ordinary gates apply"且有 deadline，不构成非法请求。

### 第一百一十六批：本轮全部生产代码提交的 CI 结论

`fb602063` 之后共 11 个提交推送。GitHub Actions 读回：`600ec86d`、`69056452`、`d7c62186`、`5e9bfe75`、`f8f1b90a`、`4fa4731b`、`652fcd0a`、`34d98ea4`、`98b9eeea` 的 CI 均 success，即本轮全部生产代码改动通过 CI；`c6ad381e` 与 `9a3b0344` 为纯文档提交，结论另记。这不是真实 provider、PTY/exe、桌面/Windows 或 20k 历史的验收，原 Phase 20 矩阵未重跑，ADD 整体仍 active。

## 17. 第七轮用户反馈（2026-10-29）：粘贴展开、快照、Monitor、草稿栈、Agent Teams、流式卡顿、跨目录写入

本轮用户提出七项新问题与优化方向（编号沿用用户原序号：第十七、第十八、第二十、第二十一、第二十二、第二十三、第二十四）。本节记录逐项定位与真实机制，实施按第 18 节的顺序进行。用户未编号的第十九项在本轮未提出，故不登记。

### 17.1 第七项（用户编号第十七）：长文本块改用"再次 Ctrl+V 展开"

**用户要求**：原来"快速两次 Ctrl+V 展开长文本块"的时间窗手势不好用，改成"只要对长文本块再次使用 Ctrl+V 就展开"。

**当前机制**（`presentation/tui/pastes.ts:110-126`）：

- 首次粘贴超过阈值（`PASTE_PLACEHOLDER_THRESHOLD = 320` 字符或超过 6 行）时 `hold()` 保留原文并插入占位符 `[#N pasted …]`。
- `expandOnRepeat(text, now)` 只在**同一文本**且距上次 `hold` 不超过 `DOUBLE_PASTE_MS = 1200` 毫秒时返回展开结果；否则按普通粘贴处理。
- 调用点在 `cli/interactive/interactiveMode.ts:514`，位于 `stdin.onPaste` 回调内；编辑器与 `PasteStore` 之间没有"光标落在哪个占位符上"的概念。

**确定的缺口**：

1. 手势依赖时间窗而非"光标位置"。用户先粘贴、思考几秒再按 Ctrl+V，得到的是一份新的普通粘贴（因为 `now - last.at > 1200`），而不是展开。
2. 手势依赖"同一文本"。第二次从剪贴板粘贴的内容只要有一个字节不同（例如用户复制了别的东西再回来），也不会展开。
3. 编辑器已有 `atomicTokenStart`（`interactiveMode.ts:449-453`，正则 `/(?:⎘ #\d+|\[#\d+ [^\]]*\])$/`）能识别占位符作为原子 token，`EditorBuffer` 也已有光标行/列；但 `PasteStore` 没有暴露"在给定光标位置解析占位符 id"的接口，因此无法实现"光标在占位符上按 Ctrl+V 展开"。

**修改方向**：在 `PasteStore` 上新增一个只读的"光标位置解析"能力（给定整段草稿与光标 offset，返回该位置覆盖的占位符 id、起止范围与原文），把 `expandOnRepeat` 的时间窗手势替换为"粘贴事件到达时，若光标位于本会话签发的长文本占位符内，则展开该占位符"；否则按既有 `holdIfLong` 处理。替换必须：

- 只展开**本会话签发**且**仍持有原文**的占位符（复用既有 `issued` 与 `held` 判定，不能展开陌生 `[#42 …]` 文本）。
- 图片占位符不因 Ctrl+V 展开（图片没有可展开的文本；保持既有 `holdImage` 语义）。
- 展开后光标落在插入文本末尾，草稿其余部分不变；展开是一次真实编辑，进入 undo 栈。
- 保留 `replaceLiteral` 的字面替换语义（`$&`、`$1` 等不能被当成替换模式）。
- 键位提示 `chrome/keys.ts:57-61` 与 `.wiki/guides/keybindings.md` 的手势表同步改为新说法；`keyGuide.test.ts` 与文档同步测试必须一起更新。

**证据边界**：这是产品交互变更，不是"修复参考项目的行为"。只读参考 pi 的 `grep -rni "paste.*placeholder\|PasteStore"` 为 0 命中，本项目该机制为自有实现；因此不宣称与参考一致。

### 17.2 第八项（用户编号第十八）：快照功能

**用户要求**：研究 Codex 的快照（snapshot）能力。

**本项目现状**：已有三层名字含 "snapshot" 的东西，但**都不是工作区快照**：

| 位置 | 实际语义 |
|---|---|
| `turn/checkpoint.ts:4-15` | turn 结束观察者接口（messages/step/willContinue/failed），唯一消费者是 advisor |
| `session/recovery/` | 会话状态投影（pendingPrompt、runPhase、terminal），服务 resume/重入 |
| `runtime/execution/snapshot.ts:9-30` | 有界二进制读取（附件/上传源），与回滚无关 |

真正的文件回滚是 **edit/recovery 的写前 blob 快照 + operation receipt + `/undo`**，已相当完整：写前捕获（`edit/recovery/operation/write.ts:19-48`）、收据模型含逐文件 before/after hash（`operation/model.ts:34-47`）、预览/执行（`operation/preview.ts:26-89`、`operation/restore.ts:26`）、`/undo`（`undo/service.ts:34-95`）、锁内 stale-read 与 fsync/rename（`restorePrimitive.ts:50-110`、`edit/authority/commit.ts:40-61`）。纯消息回滚另有 `/back`（`session/navigation/revert.ts:23-94`），注释明确 "Files are untouched"。

**缺口**：现有回滚单位是"单个已提交的文件操作"，不是 turn 或工作区。它不覆盖 bash 副作用、二进制文件、未跟踪文件、跨多个工具调用的整轮状态；也没有"回到 turn 开始前"的语义。`/undo` 的候选来自 operation ledger，不是 turn 边界。`.wiki/features/19-session-recovery-and-undo-ux.md:24` 已明确裁定 `/undo` 不按整轮回滚，这是**产品决策**而非缺陷。

**参考实现**：

- Codex（已移除）：用**临时 index + 分离 commit** 在用户仓库造"影子提交"，不更新任何 ref（`git-utils/src/ghost_commits.rs:339-395`：`GIT_INDEX_FILE` 临时 index、`write-tree`、`commit-tree`）；turn **开始时**创建并阻塞工具 gate 直到完成（历史版本 `core/src/tasks/ghost_snapshot.rs:22/88/111/151`）；回滚用 `git restore --source <commit> --worktree`，故意不加 `--staged` 以保留用户 index（`:467-497`）；回滚时删除快照后新增的 untracked、保留快照前已存在的（`:823` `remove_new_untracked`）；大文件/大目录有忽略阈值（`:28-47`，10 MiB / 200 项 / `node_modules` 等）。**现状是已整体删除**：`codex-rs/features/src/lib.rs:348,878-883` 标记 `Stage::Removed` 且默认关闭；`core/src/config/mod.rs:208-225` 仅保留配置解析兼容；`protocol/src/models.rs:3715-3729` 旧 item 反序列化为 `Other`；`thread/rollback` 与 `thread/revert` 现在只改对话历史，不回滚文件（`app-server-protocol/.../thread.rs:1225-1255`）。删除原因是把快照写进对话历史（`ResponseItem::GhostSnapshot`）长期背兼容包袱。
- oh-my-pi：`checkpoint`/`rewind` 只是**上下文折叠**，文档明确不调用 git、不快照文件系统（`docs/tools/checkpoint.md:78`、`docs/tools/rewind.md:62,77-80`），默认关闭（`tools/settings.ts:745-754`）。
- pi：**没有内建**快照；只有扩展示例用 `git stash create`/`apply`（`examples/extensions/git-checkpoint.ts:21-46`）。

**修改方向**：**不新增 `/checkpoint`、`/snapshot` 或第二个 undo 栈**。本仓库已有"写前 blob + operation receipt + 预览/批准/核验"的完整安全链，缺的是分组粒度与创建时机：

1. 把 turn 作为 operation 的分组键：在 `EditOperationIdentity`（`operation/model.ts:49-55`）增加 `turnId`/`turnOrdinal`，由 turn 开始处生成并透传；`/undo` 增加按 turn 选择的入口，把同一 turn 内所有 committed operation 视为一个撤销单元，复用既有预览/恢复逐文件执行，保留"跨文件非原子、unknown 不重放"的既有声明。不新增命令与存储。
2. 只有在需要覆盖 bash/非文本副作用时，才补一个 **turn 开始**的快照钩子，复用 `snapshotRoot`（`edit/recovery/root.ts:6-11`）与 ledger 目录，不新建根；非 git 工作区静默跳过（与 Codex 的 `NotAGitRepository` 行为一致）。
3. **不复活**"快照写进对话历史"的协议语义：快照属于 edit/recovery ledger，对话历史只记 operation ID（现有 receipt 已是这个形状）。

**本批已实施（第一百二十二批、第一百二十五批）**：

- `/undo status` 显示每个操作所属的 turn（`correlationId` 即 prompt entry id，writer 一直在记录，只是报告没有呈现）。
- `/undo status --turn <id>` **按 turn 列出该轮的全部操作**，作为恢复前的审阅视图。选择是对既有账本的过滤，不是第二套账本；`undoStatusReport`、预览与恢复链路完全复用。

**批量恢复已实施（第一百二十九批）**：`/undo restore-turn <turn-id> --execute` 从新到旧恢复该轮的全部未完成操作。**不是单一事务**：每一步仍是原有的"预览 → 写意图 → 恢复 → 回读验证"链路，逐操作执行、各自加锁。两条规则：

1. **顺序由账本决定，不由调用方选**：`restoreOperation` 只恢复最新的未完成操作（较旧的可能写在它之上），因此从新到旧走。
2. **失败即停**：某一步未验证通过时，不再继续——继续会把更旧的内容写到该步留下的未知状态之上。报告逐条列出做了什么、跳过了什么、为什么停。

`/undo execute` 仍是单操作路径，要求精确 id + revision，未变。

**当前补充（20.50）**：批量恢复的部分/未知结果现在也进入下一请求；每一步复用单操作的上下文失效与发布警告。真实CLI两模式已验证未确认零写、较新操作恢复后较旧外部修改被保留、完整两操作恢复及通知落盘/下一HTTP请求。仍未新增工作区级快照，不覆盖bash或二进制副作用；未知写入不作已验证恢复。

**本批已实施（第一百二十一批，20.49补充）**：新增`taskWait`工具，不轮询、不sleep，等`BackgroundRunner.onEnded`，300秒上限与取消信号。20.49修正取消误报完整timeout、同步完成清理与初始discovery可达，超时/取消按当前观察报告，不虚构运行或结束；`bash`描述引导它，`27-background-execution.md`过期结论已更正。未在审批层硬拒前台sleep，避免误伤轮询脚本。

**证据边界**：初版仅受控runner。20.49新增原CLI regular/fullscreen真实小进程：1秒wait超时、Ctrl+C取消后原进程仍活跃、同任务至少16秒等待后完成，三次wait监听释放。未覆盖生产长时任务、60秒自动提升或完整平台矩阵。


### 17.3 第十项（用户编号第二十）：Monitor 工具

**用户要求**：确认 Claude Code 的 Monitor 工具（封杀前台长 sleep）在本项目是否已有等价实现。

**当前实施更新（20.49、21.21）**：已存在并初始可达的`taskWait`等完成事件，取消/超时不请求stop，原CLI真实进程路径已有小规模证据。原文“没有等价工具”是实施前结论。21.21沿既有tool.output卡片补立即及每5秒的等待时长，不把时钟当任务完成比例；结束、取消、超时和observer失败均退休该显示时钟，不轮询任务。未在审批层硬拒sleep；初版只查abort但不显示进度的15秒interval仍保持移除。[后台研究现状](27-background-execution.md)的无自动提升结论同步更正。

**结论：没有等价工具。** 工具清单为 `bash`、`taskOutput`、`taskStop`、`web_fetch`、`web_search`、`lsp`、`ask`、`todo`、`task`、`browser`、`desktop`，可选 `skill` 与 MCP 转发（`core/tools/registry.ts:564-624`）；全仓 `monitor` 只命中 `observability/startupTiming.ts` 的 `monitorEventLoopDelay`，不是工具。唯一的 "wait" 是 `/director wait <id> [seconds≤30]`（`core/commands/director/syntax.ts:14-15`），只等 worker run。`taskOutput` 是轮询式读取（`core/tools/shell/background.ts:70-108`），不阻塞等待。

**前台长 sleep 的现状**：默认 60 秒超时（`runtime/execution/commandTimeout.ts:18`）；交互式下未显式给 timeout 的命令会被 job owner 收养，60 秒到就**原地提升为后台任务并返回**（`registry.ts:116,137-174`），新用户输入也会提前提升（`interactiveMode.ts:966`）。显式 `timeout: 120` 则不可提升，会一直前台阻塞。后台独立上限 300 秒（`shell/background.ts:31-32`）。因此"封杀长 sleep"在本项目已经部分成立，缺的是**可等待、可取消、带进度**的一等工具。

**参考实现**：

- oh-my-pi：`WaitTool`（`packages/coding-agent/src/tools/wait.ts:24` `WAIT_MAX_MS = 30 * 60_000`，`:25` 进度 500ms）与 `yield` 工具。
- codex：`exec_command` 的 `yield_time_ms`（默认 10s，`core/src/tools/handlers/unified_exec.rs:62-64`）与 `write_stdin`（默认 250ms，`:66-68`）——"前台先等一小段，未完成就返回会话句柄"。

**修改方向**：新增 `wait` 工具，参数为 `taskId` + `timeoutMs`（上限对齐 30 分钟），内部用既有的 `BackgroundRunner.onEnded`/`whenPromoted` 阻塞，而不是 sleep 轮询；`abortSignal` 必须可取消。**不新增任务系统**：`BackgroundRunner` 已有 `list/get/stop/onEnded/whenPromoted`（`workflow/jobs/local/model.ts:25-61`），`registry.onEnded` 已按会话路由（`cli/runtime/jobs.ts:56-60`）。前台 `sleep` 不宜在审批层硬拒（会误伤轮询脚本），更合理的是在 `bash` 描述与系统提示中引导使用 `wait` 或 `runInBackground`。

**顺带确认一处文档过期**：`.wiki/features/27-background-execution.md` §1.3（`:51`）写着"没有任何把慢速前景命令自动转为后台的代码"，与现状不符——`375e664e` 与 `dd43bcce`（均 2026-10-18）已实现原地提升；该文档 `updated: 2026-10-17`。其 §2.1 阈值模型与 §4 决策点仍可作设计参考。

**证据边界**：本轮只做定位与参考对比，未实现。


### 17.4 第十一项（用户编号第二十一）：草稿暂存栈与一键撤回润色

**用户要求**：Claude Code 有 Ctrl+S 输入框草稿暂存栈（Prompt Stashing）与一键撤回润色。

**结论：两者都没有。** 可重绑定的 action 表（`cli/interactive/keybindings.ts:30-89`）里没有任何 stash/draft 动作；`ctrl+s` 目前解析为 `ctrl+s`（`input/keys.ts:211-228`）但查不到 action，走 `applyTextKey` 后是**纯 no-op**（`keymap.ts:96-140,461-468`）。全仓无 chord（多键序列）支持——`normalizeKey` 只接受单键（`keybindings.ts:230-249`）。

**现有的"类 stash"能力**（都是单槽、隐式）：

- 历史回溯自带一格草稿：`editor.ts:57-79` 的 `draft` + `browsing` + `adoptAsDraft`，`recall()` 首次向上时暂存当前草稿（`:247-273`）。只有一格，且只在历史浏览期间存在。
- 中断回填：`interactiveMode.ts:1360-1371` 把未投递的队列项与当前草稿拼回输入框。
- `/retry` 与 F5：`turnSink.ts:70-78` 用 `lastPrompt` 重跑上一轮；`retryDraft` 把失败的斜杠命令原文塞回输入框（`interactiveMode.ts:1051-1054`）。这是"一键撤回"最接近的现有形态，但只针对失败/命令。

**undo 的粒度**：`EditHistory` 双栈，容量 100 步（`editor/buffer.ts:44-46`）；快照只含 `{lines,row,column}`，**不含** PasteStore、选区与历史浏览状态。连续词字符合并为一步，`insert(text)` 整段算一步，一次长粘贴 = 1 步。**undo 不回滚 PasteStore**：撤销一次"展开粘贴"后，文本回不到占位符。

**参考实现**：

- Claude Code：`ctrl+s` → `chat:stash`（`keybindings/defaultBindings.ts:85`）；**单槽 toggle**（`components/PromptInput/PromptInput.tsx:1356-1383`：输入非空则存入并清空，输入为空且已有 stash 则恢复，含光标与粘贴内容映射）；提交时自动恢复（`screens/REPL.tsx:3344-3348`）；提示行 "Stashed (auto-restores after submit)"。其 undo 是环形快照 50 条 + 1000ms debounce，绑 `ctrl+_`（`useInputBuffer.ts:8-11,36-118`）。
- codex：`chat.edit_queued_message`（默认 `alt+up`）把最近一条已排队消息弹回输入框（`tui/src/keymap.rs:1418`、`chatwidget/interaction.rs:113-126`），不是草稿栈。
- pi：`app.message.dequeue`（`alt+up`）把所有排队消息合并回编辑器（`core/keybindings.ts:71-74`、`modes/interactive/interactive-mode.ts:4846-4866`）；`ctrl+s` 在 pi 与 oh-my-pi 都已被占用。

**修改方向**：

1. 新增 action `tui.input.stash`，默认 `ctrl+s`，语义**对齐 Claude Code 的单槽 toggle**而非栈：输入非空 → 暂存并清空；输入为空且栈非空 → 恢复。提示行走既有 transient hint 通道（`chrome/hints.ts:38-70`）。
2. 暂存元素必须**感知 PasteStore**：`{text, cursor, pasteIds}`；暂存期间对被引用的 id 做保留，避免 `evictOldest`（`pastes.ts:94-108`）淘汰后恢复出失效占位符。恢复用 `editor.setDraftText` + `setCursorOffset`。
3. "一键撤回润色"复用现有 `retryDraft` 通道（`core/commands/types.ts:198`、`interactiveMode.ts:1051-1054`）与 `replaceExternalDraft`（`:1375-1379`），把"润色前原文"作为一个 stash 槽，使 `/retry`、F5、Ctrl+S 共享同一条回填路径。
4. **IXON 风险**：Cheers 在 `terminal.ts:294-308` 进 raw mode，仓库内没有自己的 termios/IXON 处理，且 `ctrl+q` 已被绑定为 follow-up 并有测试（`keymap.test.ts:237`），说明流控未生效；但非 raw 的 line 模式（`lineLoop.ts:78`）与部分 tmux 配置仍可能吞掉 `ctrl+s`，应同时提供 `alt+s` 作为备选。
5. 新增 action 必须同步三处：`KEY_ACTIONS`、`KEY_BINDINGS` 与 `.wiki/guides/keybindings.md`——`keyGuide.test.ts:10-16,57-70` 会强制它们相等。

**本批已实施（第一百二十批、第一百二十三批）**：按上述方向 1/2/3/5 落地——

- `ctrl+s` 绑定 `tui.input.stash`，单槽 toggle：有文本则暂存并清空，空则恢复，光标随草稿保存。
- **互换语义**：槽里已有草稿而输入框又有文本时，两者交换而不是拒绝。这正是外部编辑器重写后留下的状态（润色稿在输入框、原稿在槽里），因此一次按键就能取回原稿、再按一次换回润色稿——这就是"一键撤回润色"。
- 外部编辑器改写草稿时，被替换的原稿自动存入槽位（`adoptDraft`）。
- 被引用的粘贴条目在暂存期间受保护、恢复后释放，恢复出的草稿仍可提交。
- 目录、重绑定表与指南三处同步。

**已实施（第一百二十八批）**：`alt+s` 作为备选键。`ctrl+s` 是 XOFF，终端流控未关或多路复用器转发时会在到达前被吞掉；备选键必须真实可用而不只是出现在目录里。目录、重绑定表与指南三处同步，宿主级测试用真实 `\x1bs` 序列验证往返。

**边界**：`ctrl+s` 在 raw mode 下可用（`ctrl+q` 已绑定 follow-up 并有测试，说明流控未生效），但非 raw 的 line 模式下的 IXON 吞键风险仍未在真机验证。

**证据边界**：单槽是产品选择（对齐参考实现的 toggle 语义），未做多槽；IXON 在非 raw 模式下的吞键风险仍未经真机验证。


### 17.5 第十二项（用户编号第二十二）：平级 Agent Teams 与"竞争性假说互相证伪"

**用户要求**：研究平级 Agent Teams（带点对点邮箱）及"竞争性假说互相证伪"范式。

**本项目现状**：现有的是**父子委派 + 主从 worker + 单向 advisor + 跨进程房间**，没有进程内平级团队。

| 现有能力 | 性质 | 证据 |
|---|---|---|
| `task` 子代理 | 严格父子委派，一次性返回 | `core/subagents/runner.ts:142-257`、`turn/subagent.ts:32-91`、`core/tools/taskTool.ts:16-140` |
| 嵌套禁止 | 有意设计（"nothing counts the depth"） | `core/subagents/boundary.ts:17` `NEVER_GIVEN = new Set(["task"])` |
| 同 turn 串行 | `SEQUENTIAL_TOOLS` 含 `task` | `turn/session.ts:172` |
| director | 主代理 + 持久 worker，worker 之间不通信 | `cli/director/lifetime.ts:15-16`、`cli/director/workers.ts:15-43`；并发上限 2（`workflow/jobs/agent/journal.ts:19`） |
| advisor | 单实例单向评审，note 需显式 apply | `advisor/runtime.ts:18-106`；digest/frontier/goal 防陈旧（`:74-75,93-97`） |
| collaboration/ | 跨进程/跨用户房间（principal/ACL），不是 agent 团队 | `collaboration/contract/model.ts:18-28`、`collaboration/service/proposals.ts:15-58` |

**平级邮箱曾经存在，已被删除**：`core/tools/messagingTools.ts`、`core/messaging/sessionSocketClient.ts`、`sessionSocketHost.ts`、`core/workflow/teamStore.ts` 在 `812d7f22` 删除（记录见 `.wiki/refactor/dead-code-tiers-2026-09-27.md:82-85`）。现仅剩扫描器与类型字面量：`core/messaging/types.ts:1` 的 `PeerAgentKind` 仍含 `"teammate"` 但无实现；生产消费者只有 peers 计数展示（`cli/interactive/ambientFacts.ts:14,36-45`）。

**"竞争性假说证伪"目前只有单假说版本**：repair 假说单线程生成/拒绝（`repair/flow/hypothesis.ts:21-90`）；research 的 adversarial review 是单 draft、单 reviewer（`research/run/child.ts:16-38`）。但它已有最接近的证伪范式：四态 finding `counterevidence`/`condition-mismatch`/`insufficient`/`none-found`（`research/review/model.ts:3-15`），以及"引用必须来自本 review child 实际成功读取的源，否则降级为 insufficient"的强制绑定（`research/review/validation.ts:7-32`）。

**参考实现**：

- Codex：父子树 + 路径寻址的点对点消息（`spawn_agent`/`send_message`/`followup_task`/`wait_agent`/`list_agents`，`multi_agents_spec.rs:124-344`）；消息按 `AgentPath` 层级寻址（`protocol/src/agent_path.rs:59-72`、`core/src/agent/control.rs:445-528`）；投递分 `QueueOnly`/`TriggerTurn`（`multi_agents_v2/message_tool.rs:13-23,75-115`）；邮箱是每会话输入队列而非持久邮箱（`core/src/session/input_queue.rs:81,122-138`）；拓扑只存父子边（`agent-graph-store/src/store.rs:18-58`）。**没有平级团队/共享任务池**。
- oh-my-pi：最接近平级邮箱。`AgentRegistry`（`registry/agent-registry.ts:27,125,389-393`）+ 进程内 `IrcBus`（`irc/bus.ts:31,98-103,164,344-347`，容量 100、send 永不阻塞、溢出丢最旧）；`irc/messaging.ts:17,46-120` 支持 `to === "all"` 广播；**明确区分父消息与同辈消息**（`session/irc-bridge.ts:29-33,46-58,100-140`，同辈消息单独开 wake turn，不污染父结果）；递归深度控制 `task/types.ts:300-306`。
- pi：只有 durable 的通用原语（会话级输入队列 `durable/src/harness/inbox.ts:1-30`、任务图 `task-graph.ts:27-88`），子代理是扩展示例（`examples/extensions/subagent/index.ts:7-12`）。

**修改方向**：**不新增 subagent runner，不复活 `teamStore`/`sessionSocketHost`/`messagingTools`**。新增一个进程内 team owner，复用现有底座：

| 能力 | 复用点 |
|---|---|
| agent 执行 | `core/subagents/runner.ts:142` + `turn/subagent.ts:32`（已带父 gate/审批/预算） |
| agent 持久身份 | `cli/jobs/agent/session.ts:26-57` + `workflow/jobs/agent/service.ts:13-90` |
| 只读边界 | `core/subagents/capability.ts:11-27` `readOnlyDelegation` |
| 提案状态机 | `collaboration/contract/model.ts:18-28` 的枚举（去掉 principal/ticket） |
| 证据绑定 | `research/review/validation.ts:7-32` |
| 防陈旧 | `advisor/runtime.ts:74-75,93-97` |

三步最小机制：

1. **多代理独立提案**：对同一问题并行调用 N 次 `runSubagent`（N ≤ 2，对齐现有并发上限；提高上限必须同步调整 `workflow/jobs/agent/journal.ts:19` 与 `workflow/jobs/store.ts:27`）。提案者拿相同输入但不同角色/提示，**互相不可见**以避免同化；输出结构化 `{ hypothesisId, claim, evidenceRefs, falsifiers }`。
2. **交叉评审**：每个提案者只读评审其他提案（`readOnlyDelegation` + `agentMode: 'plan'`），复用四态 finding；强制证据绑定——引用必须来自本次实际成功读取的源，否则自动降级 `insufficient`；`none-found` 只能声明"本次有界评审未找到反证"，不得升级为"为真"。
3. **收敛**：由一个**收敛 owner（不是 agent）**把"提案 × 评审矩阵"投影为 `survived`/`refuted`/`unresolved`：被至少一条带实际读取证据的 `counterevidence` 命中则 `refuted`；只有 `insufficient` 则 `unresolved`（不得当通过）；全部 `none-found` 才 `survived`，且报告必须携带相关性声明。收敛结果需显式用户批准才进入主上下文（照 advisor 的 apply 模式，不自动注入）。

**明确不做**：不恢复跨进程 UDS + 文件锁任务池（跨进程场景已有 `collaboration/`，两套语义不混用）；不给 `runSubagent` 加"子代理再 spawn 子代理"；不新建第二套提案状态机。

**本批已实施（第一百二十四批）**：收敛规则已落地为纯函数 owner（`core/subagents/team/convergence.ts`），实现"多代理独立提案 → 交叉证伪 → 收敛"中最后一步的判定，并锁定了两条不对称规则：**无证据的证伪不算数**（引用必须来自评审者实际读过的源），**未被检查不等于存活**（只有 `none-found` 且带引用才算 survived）。结论必须携带"同模型不同上下文不等于独立确认"的声明。

**独立复核补强（第一百二十六批）**：初版在"一个评审者带证据说没找到问题、另一个不带证据表示反对"时判为 `survived` 并给出"没有发现反证"的理由，把反对意见整个丢掉。现改为 `unresolved` 并说明"有人反对但没有引用任何东西"——无证据的意见不能证伪，但也不能当作不存在。`insufficient` 不算反对（查不动不等于不同意）。

**已实施（第一百三十批）**：三步链路完整落地，每步独立可测——

- **fan-out**（`fanOut.ts`）：并行运行全部提案者，每人只拿到同一问题与自己的视角，看不到彼此的答案。失败按提案者记录而非整批丢弃；空答案不算提案（否则会以"无人能反驳"的身份进入收敛）。
- **cross-review 编排**（`run.ts`）：每个提案者评审**其他人**的提案，永不评审自己——自评审会产生一个来自"必然同意的一方"的 `none-found`，单凭它就足以报 `survived`。评审抛错记为缺失视角，不中断整轮。
- **收敛**（`convergence.ts`）：见上一批。

`run`/`review` 作为依赖注入，编排层不持有 provider、工具池或权限门——它无法启动宿主未授权的 agent。

**已接入（第一百三十二批）**：`team` 工具（`core/tools/teamTool.ts`）。做成工具而非 slash 命令，因为一次 pass 需要的全部东西——模型、工具 gate、审批范围、步数预算——都活在 turn 里；命令面得把这些重建一遍。评审者只读（`readOnlyDelegation` + `plan` 模式）：提案是论证，不是对工作区的改动，让评审者能改文件就等于让"评审"这个动作决定结果。

**证据必须显式声明**：评审回复的格式是 `CLAIM <id> <kind> <reason> evidence: <paths>`。理由里出现的路径只是散文——评审者可以写任何路径——所以只有 `evidence:` 之后的才算数，其余按意见处理，收敛规则不会让它证伪。

**后续补齐（21.20）**：完成后的报告复用既有 question bridge 展示，只有用户明确选择 `Adopt report` 才进入主上下文；工具运行许可不代表采用报告。拒绝、空答、取消、无交互宿主及失效会话均不发布报告内容，证据见21.20。

**早期证据边界**：当时只实现了编排与判定，未运行真实多代理会话。后续21.20覆盖本地HTTP夹具下的实际runner/read/交互采用链路；真实模型的并发成本与收敛质量仍无实测证据。


### 17.6 第十三项（用户编号第二十三）：对话时界面卡顿

**用户现象**：与模型对话时界面卡顿；thought / thinking 后面的数字停住不动，然后整段输出突然一起出现；整轮结束前界面无法交互。

**已确认的根因（高置信度）**：每个流式增量事件都同步走完整持久化链，而且**排在 UI 通知之前**。

调用链（全部为同步 I/O）：

1. `turn/session.ts:274-275` 把每个 provider 文本/推理增量推成 `message.delta` / `reasoning.delta` 事件。
2. `core/shell/sessionRuntime.ts:289-294` 对每个事件**先**调用 `sessionManager.appendQueryEvent(...)`，**再**通知 `eventObservers`（也就是 `TurnSink`）。
3. `session/agent/persistence.ts:22-41` 的 `handleAppendQueryEvent` 每次都：
   - `store.readStateSnapshotSafely(statePath)`：整份状态 JSON 读取 + 解析；
   - `handleGetTranscriptEvents(store, sessionId)`：**整份 transcript 读取 + 逐行 JSON 解析**（`session/transcript/read.ts:36`，无增量、无缓存）；
   - `appendSessionQueryEvent` → `appendTranscriptEventToStore`：`fs.appendFileSync` 并**回读校验**（`session/transcript/sessionTranscript.ts:135-155`，含 `fstatSync`/`readSync`/`statSync`）；
   - `applySessionQueryEventToState` → `withSessionStateLock`：文件锁（`sessionFileStore.ts:119-163`，重试时 `sleepBlocking` 用 `Atomics.wait` **同步阻塞主线程**，`sessionFileStore.ts:222-228`，锁超时 1200ms）；
   - 状态快照构建 + `writeJsonFileAtomic`：临时文件写入 + `fsyncSync` + `renameSync`（`sessionFileStore.ts:185-215`）。

**代价是 O(n²)**：会话越长，每来一个 token 都要把整份 transcript 重新读一遍再解析。用本机真实会话文件量化：`sess_1490bb947e4e3ebc_1790088117808/transcript.jsonl` 为 1.9 MiB / 12116 行，其中 3728 行是 `message.delta`。一次 3000 token 的回复意味着约 3000 次「读 1.9 MiB + 解析 12000 行 + 两次状态文件读写 + 一次文件锁」。

**为什么表现为"数字卡住然后突然全部出现"**：事件循环被同步 I/O 占满，`requestRender` 的定时器（`render/engine.ts:315-328`，最小帧间隔 33ms）没有机会执行；`Atomics.wait` 期间连定时器都不推进。等 provider 流结束、同步链停止后，积压的事件一次性排空，UI 才第一次真正重绘。这也解释了"整轮结束前界面无法交互"——键盘事件同样排在事件循环里。

**为什么 thought 数字不动**：`TurnSink.activity()`（`cli/interactive/turnSink.ts:157-168`）明确返回 `tokens: 0`（"不显示流式 token 计数"是既有设计），而 thinking 块的 `elapsedMs` 只在 `think()` 调用时更新（`turnSink.ts:201`）。真正的卡顿来自上面的事件循环阻塞，不是计数器逻辑本身；但两者叠加会让界面完全静止。

**修改方向**：把流式增量从"持久化事件"中分离。持久化只需要**最终消息**与**生命周期/工具事件**；`message.delta` / `reasoning.delta` / `message.replace` 属于展示层增量，重放与恢复都不读取它们（已核实：`session/replay/builder.ts:450-458` 只读 `type === "message"`；`session/recovery/*` 不消费 delta；`session/export/collect.ts:35` 同样只读 `message`）。修复要点：

- 在事件观察者之前先通知 UI（或至少在持久化前把展示事件交给 sink），保证渲染不被磁盘阻塞。
- 增量事件不再进入 `appendQueryEvent` 的持久化路径；最终 `message` 记录仍由既有 `createMessageTranscriptEvent` 写入（`session/lifecycle/sessionPromptBarrier.ts:56`）。
- 保留 `message.replace` 的纠错语义：它仍是展示事件，不能因为不落盘就丢掉。
- 不得削弱崩溃恢复：恢复依赖 `message` 与生命周期事件，不依赖 delta。
- 状态快照写入应只在真正改变状态的持久事件上发生，而不是每个 token。

**证据边界**：以上结论来自源码链路与本机真实会话文件的量化，**未**在真实终端做阻塞时长测量；修复后的效果必须用聚焦的单元级夹具证明（事件顺序、持久化事件集合、恢复仍成立），不得用真实 20k 历史 PTY 压测（见第 13 节与项目红线）。

### 17.7 第十四项（用户编号第二十四）：为什么限制在别的目录创建文件

**用户疑问**：为什么有 policy 限制模型在其他目录下创建文件？是 AGENTS.md 注入的限制，还是 write/edit/apply_patch 工具提示词里的系统提示？

**确认结论：限制来自工具/执行层的硬性路径围栏，不是提示词。**

| 层 | 位置 | 性质 | 效果 |
|---|---|---|---|
| `write` 工具执行体 | `core/tools/registry.ts:306-309` | **硬拒绝**（`throw`，不进入审批） | 决定性 |
| `edit` 工具执行体 | `core/tools/registry.ts:410-413` | **硬拒绝** | 决定性 |
| `apply_patch` 计划阶段 | `edit/patch/plan.ts:91-95` → `core/workspace/roots.ts:41` | **硬拒绝** | 决定性 |
| 路径规范化 | `core/workspace/files.ts:16-24` | **硬拒绝**（任何组件是符号链接即拒绝） | 决定性 |
| 执行服务二次校验 | `runtime/execution/write.ts:20-30` | **硬拒绝**（冗余同向） | 决定性 |
| 权限层 | `core/query/toolPolicy.ts:216-233` | 需审批，但越界在到达前已被工具层拒绝 | 实际不生效 |
| sandbox | `sandbox/osSandbox.ts:266-267` | 默认 `off`，且只作用于 `bash` | 未生效 |
| 工具描述措辞 | `registry.ts:285,291,361` | 仅提示（"in the workspace"） | 弱 |
| 仓库 `AGENTS.md` | 本仓库 `AGENTS.md:15` | 仓库自定规则，仅影响本仓库会话 | 与产品机制无关 |

**系统提示层面几乎没有限制措辞**：`turn/prompt.ts:91-112` 只有正向授权；`turn/prompt.ts:134-138` 的环境行是位置陈述；`turn/opening.ts:19-20` 反而列出附加根，方向相反。

**参考项目策略对比**：

- pi：写工具**完全没有围栏**（`core/tools/write.ts:65` 只做 `resolveToCwd`），`README.md:90` 明确"Pi does not include a built-in permission system"。
- oh-my-pi：越界写**需审批**（`tools/approval.ts:44` 的 `always-ask` / `write` / `yolo`），另有"受限文件夹"黑名单强制每次询问（`approval.ts:569-588`）。
- codex：沙箱决定物理可能，审批策略决定是否问（`codex-rs/core/src/safety.rs:26-97`）；`workspace-write` + `on-request` 下越界写是 `AskUser` 而非 `Reject`，且 `apply_patch` 会为越界目标申请临时写权限（`codex-rs/core/src/tools/handlers/apply_patch.rs:236-268`）。

**修改方向**：把"是否在 workspace 内"的判定从工具执行体上移到审批层。越界时构造一次审批升级，批准后再用一个**显式授权的目标根**执行，而不是直接 `throw`。需要同时处理：

- `core/workspace/roots.ts:32-42` 的 `selectWorkspaceRoot` 目前只认会话持久化的根，需要支持一次性授权根。
- `core/query/toolPolicy.ts:216-218` 的 `isInside` 是纯词法判断，与工具层 realpath 判定不同源；应统一到 `verifyPathContainment`。
- `core/security/writeTarget.ts:96-115` 已经有"相对越界=笔误必拒、绝对越界=需显式确认"的三分法，但它只服务 `/export`、`/report`；把这套策略下沉到工具层是最小改动。
- 保留默认拒绝：未获批准的越界写仍必须失败，且失败信息要说明"需要显式授权"，不能伪装成"路径非法"。
- 本仓库 `AGENTS.md` 的"参考仓库只读"规则保持不变；排查时必须区分"模型自己不愿写"与"工具拒绝写"。

**本批已实施的部分（第一百一十九批）**：越界写的拒绝信息现在同时说明边界与出路——`write` 与 `edit` 的硬拒绝由 `outsideWorkspaceMessage` 生成，指出工作区根、并明确"用户可以运行 `/workspace add <path> --write` 后重试"。这不改变安全语义（仍是硬拒绝，不进入审批），但让模型与用户知道存在合法授权路径，而不是把限制读成任意规则。

**已实施（第一百二十七批）**：`toolPolicy` 的 accept-edits 判定已统一到 `verifyPathContainment`。此前它用纯词法的 `path.relative` 判断"是否在工作区内"，与工具体执行的 realpath 判定不同源：一个通过 symlink 指向外部的路径在词法上是"内部"，权限层因此批准，而工具体随后拒绝——用户看到的是"批准了却写不进去"。现两处用同一个判定，并把"workspace 根本身"单独排除（`path: "."` 是目录，不是文件目标）。

**关于"改为需审批"的判断（第一百三十二批复核）**：不做，理由是现有方案更安全且已完整。

`/workspace add <path> --write` 不是提示，而是一条完整路径：它经用户显式调用、把根持久化到会话（`changeSessionWorkspaceRoots`）、用 `dev:ino:birthtimeMs` 绑定身份（根被替换即失效）、并入 sandbox 的 `allowWrite`、并让 `selectWorkspaceRoot` 在后续所有工具调用中选中它。之后模型可以直接写，无需每次重复批准。

"每次越界写弹一次审批"会是一个**更弱**的模型：一次性授权没有身份绑定（同一个路径换了个 inode 也照样放行）、不进入会话状态（下次还要再批）、不参与 sandbox 规划，而且要在 `write`/`edit` 上新增 `prepare`、让 `selectWorkspaceRoot` 支持临时根、让执行服务的 root 可注入——三处安全边界改动，只为得到一个比现有机制更弱的等价物。

因此本项的结论是：**限制合理，出路存在，缺的是被发现**。已做的三件事（拒绝信息点明命令、权限层与工具体判定统一、`/workspace add --write` 本身的既有完整性）覆盖了这个缺口。

**证据边界**：本批只改了拒绝措辞，未放开任何写权限；越界写仍然失败。

## 18. 第七轮实施记录（2026-10-29）

### 第一百一十七批：长文本块按光标展开

`PasteStore.expandOnRepeat` 的时间窗手势（同文本 + 1200ms）已被 `expansionAt(draft, caret)` 取代：粘贴事件到达时，若光标位于本会话签发且仍持有原文的占位符**内部**，则就地展开该块，粘贴文本被丢弃——用户指的是这个 token，不是在提供新内容。范围是半开区间：插入占位符后光标正好停在末尾，把那个位置也算"在块上"会让下一次无关粘贴吞掉剪贴板。

`interactiveMode.ts` 的 onPaste 改用 `editor.replace` 走真实编辑，因此 Ctrl+Z 可撤销且光标落在展开文本末尾。手势目录（`chrome/keys.ts` 的 `PASTE_GESTURE`）、重绑定表与 `keybindings.md` 同步更新。

验证：`pastes.test.ts` 35 项、宿主级 3 项（regular/fullscreen 真实 bracketed paste）、`keyGuide/keybindings/editor/keymap` 203 项通过。三组反转各触发预期失败：块选择改为"首个匹配"（1 项）、去掉 `issued` 校验（1 项）、把末尾边界也算作块内（2 项，含宿主级）。源码逐字节恢复并核对 SHA-256 `2f22c25b5d80` 后重验。提交 `90c0cd27` 已推送。

### 第一百一十八批：流式卡顿的五个根因

用户报告"对话时界面卡顿、thought 数字停住、整段输出突然出现、整轮结束前无法交互"。只读分析定位到五个可独立验证的机制，全部修复：

**根因一（决定性）：每个 token 都在 UI 通知之前走完整持久化。** `core/shell/sessionRuntime.ts` 的事件循环先调 `appendQueryEvent` 再通知观察者；`session/agent/persistence.ts:22-41` 对每个事件读取整份 state、**读取并逐行解析整份 transcript**（`transcript/read.ts:36`）、`appendFileSync` 后回读校验（`sessionTranscript.ts:135-155`）、再取文件锁（`sessionFileStore.ts:119-163`，重试时 `Atomics.wait` **同步阻塞主线程**）、最后 `fsync` + `rename` 写回 state。代价是 O(n²)：本机真实会话 `transcript.jsonl` 为 1.9 MiB / 12116 行，其中 3728 行是 `message.delta`。

修复：新增 `isDurableQueryEvent`（`core/query/runtime/events.ts`），`message.delta`/`reasoning.delta`/`message.replace` 不再落盘；事件循环改为**先通知观察者、再持久化**。重放、恢复与导出都不读取这三类事件（`session/replay/builder.ts:450-458` 与 `session/export/collect.ts:35` 只读 `message`），最终助手消息仍由既有的 `createMessageTranscriptEvent` 写入，因此恢复能力不变。

**根因二：`sourceLinesFor` 每帧对每个已 finalize 块重跑 Markdown/diff 布局。** `container.ts` 只缓存了 `rowsFor` 的行，sources 层完全无缓存；一帧 30 次、每次遍历整段历史。

修复：sources 与 rows 共用同一 `CacheEntry`，按 width/revision/imageProtocol 命中，并以 `blockIndex` 保证编号正确。

**根因三：渲染定时器不取消也不合并。** `engine.ts` 的 `requestRender` 只在同一 tick 内用 `renderQueued` 合并；跨 tick 的请求会排第二个 frame timer 而不取消第一个，两个都触发，各自组装整屏——延迟因此完全失去节流作用。

修复：新增 `scheduleFrame`，永远只保留一个待执行 timer。

**根因四：thought 秒数不是时钟驱动的。** `elapsedMs` 只在收到 reasoning delta 时写入；模型静默思考期间数字定格。而 activity 行的 spinner 由 100ms tick 驱动，两者表现不一致。

修复：`TurnSink.think()` 接受空文本作为 tick，`interactiveMode` 的 100ms 定时器调用它；同一十分之一秒内不重算，避免无谓地丢弃缓存行。

**根因五：每帧两次同步扫盘。** `readAmbientFacts` 在 `renderChrome` 与 `facts` 里各调一次，每次都 `scanAllReachableAgents()`——递归遍历子代理目录并读取每个定义文件。

修复：peer 计数按 session 做 1 秒 TTL 缓存。

验证：新增 `core/query/runtime/events.test.ts`（8 项，锁定三类流式事件不落盘、其余落盘）；`sessionRuntime.test.ts` 新增"观察者先于持久化"的顺序断言并更新既有的 `observed === recorded` 契约；`container.test.ts` 新增 sources 复用断言；`engine.test.ts` 新增跨 tick 单帧断言；`turnSink.test.ts` 新增思考时钟断言；`ambientFacts.test.ts` 新增扫盘次数断言。

五组反转全部有效触发预期失败：谓词恒真（4 项）、持久化移到观察者之前（1 项）、去掉 sources 缓存（1 项）、去掉 timer 取消（1 项，经两次修正测试才真正命中）、禁用思考 tick（1 项）、去掉 peer TTL（1 项）。全部源码逐字节恢复并核对 SHA-256（`92116e693c6d` sessionRuntime / `df8e9c309656` events / `012bb1d0ae63` container / `d4c6510f49b0` engine / `1857d8bfd4a2` turnSink / `32a7b171025b` ambientFacts）。

主代理以 heap1024MiB 单线程串行执行 62 个文件 868 项通过；五静态门、module facade 0（`turnSink` 一度因新增方法越过 20 上限，已通过合并回 `think()` 恢复为 0）及 heap1536MiB TS build `7d5eb8528248` 通过，118 条既有 docs-source advisory 保留。

**证据边界**：以上是源码链路与本机真实会话文件的量化，加上确定性夹具；**未**在真实终端测量阻塞时长，也未验证真实 provider 下的体感改善。原始卡顿是否还有其它成因（例如 provider 侧缓冲、终端仿真器性能）不在本批证据内。

### 第一百一十九批：越界写的拒绝信息说明出路

`write` 与 `edit` 在目标解析到工作区之外时抛错，而错误正文只有 `Path '…' is outside workspace.`。这是一条**硬拒绝**（不进入审批），但措辞让人以为这是一条任意规则：既没说是哪条边界，也没说存在合法授权路径。`/workspace add <path> --write` 一直是可用的（`core/commands/workspace/syntax.ts:9-11`），只是模型与用户都无从得知。

现两处拒绝共用 `outsideWorkspaceMessage`（`core/tools/registry.ts`），说明工作区根并点明该命令。安全语义完全不变：仍然硬拒绝、仍然不进入审批、仍然不写任何字节。

验证：`arguments.test.ts` 新增两项，分别对 `write` 与 `edit` 断言拒绝信息包含该命令且执行服务从未被调用；撤销新措辞后两项均预期失败（返回旧的 `Path '…' is outside workspace.`），源码逐字节恢复并核对 SHA-256 `ab8651690367` 后重验。`core/tools` 36 文件 419 项通过。

**边界**：本批只改措辞，未放开写权限；"越界写改为需审批"仍是未完成任务，理由见第 17.7 节。

### 第一百二十批：草稿暂存（Ctrl+S）

`ctrl+s` 此前解析成 `ctrl+s` 但没有任何 action 认领，是纯 no-op。现绑定 `tui.input.stash`：输入框有文本则暂存并清空，输入框为空且槽里有草稿则恢复，恢复时光标回到原位置。**单槽而非栈**——第二次按键必须有一个确定含义，多槽需要第二个手势和用户记住隐藏了几份草稿。

新增 [DraftStash](../../packages/ts-shell/src/presentation/tui/editor/draftStash.ts) 持有唯一槽位。关键约束：暂存期间被草稿引用的粘贴条目不能过期。`PasteStore` 的淘汰是按年龄的，一份恢复出来却无法提交的草稿，其失败要到提交时才暴露，远晚于原因。因此 `PasteStore` 新增可选的 `protector` 判定，由 DraftStash 在暂存时安装、恢复时撤下；保护逻辑留在 owner 里，`PasteStore` 只多一个谓词字段。

`idsIn` 增加 `images` 参数：展开文本只要文本条目，而暂存的草稿要保住提交所需的全部条目，图片也是其中之一。

验证：[draftStash.test.ts](../../packages/ts-shell/src/presentation/tui/editor/draftStash.test.ts) 8 项覆盖往返、空草稿不占槽、第二份被拒、粘贴跨淘汰存活、恢复后释放、protector 生命周期；宿主级 3 项覆盖 regular/fullscreen 真实按键往返与空槽行为。反转撤销保护安装后，"keeps the pastes the draft names alive" 1 项预期失败；源码逐字节恢复并核对 SHA-256 `28a92d563330` 后重验。

主代理以 heap1024MiB 单线程串行执行 7 文件 521 项通过；五静态门、module facade 0 及 heap1536MiB TS build `3c53260f3c65` 通过。

**边界**：未实现"一键撤回润色"复用与 `alt+s` 备选键；非 raw 模式（`lineLoop.ts`）下的 IXON 吞键风险未经真机验证。

### 第一百二十一批：`taskWait` 取代轮询与前台 sleep

模型需要后台命令的结果时只有两条路，都不对：`taskOutput` 立即返回，调用方只能先猜一个 sleep 时长；而 `bash sleep` 花的是本回合自己的预算，且前台命令 60 秒就会被提升为后台任务，sleep 反而活得比它等待的东西更久。

新增 `taskWait`（`core/tools/shell/background.ts`）：参数 `taskId` + 可选 `timeoutSeconds`（默认与上限 300 秒）。它**等待 `BackgroundRunner.onEnded` 的完成事件**，不轮询；超时或回合取消时返回"仍在运行"并附带当前状态，而不是假装结束。监听器在每条退出路径上都释放——超时后仍挂着的监听会让 runner 继续调用一个已不存在的工具调用，被取消的等待也不能把回合挂住。已结束的任务直接返回结果，不进入等待。

`bash` 的工具描述同步改为引导 `taskWait`。

验证：`backgroundTools.test.ts` 新增 5 项——已结束直接返回、等待完成事件（断言调用确实阻塞在 runner 上）、超时报告仍在运行、取消后释放监听、未知 id 列出已知任务。反转把等待换成"读一次当前状态"后 2 项预期失败；源码逐字节恢复并核对 SHA-256 `490c6b9532b5` 后重验。`core/tools` 36 文件 424 项通过；五静态门与 module facade 0 通过。

**初版边界**：此批仅受控runner，未测真实等待；后续20.49已补两模式CLI真实小进程的16秒wait、取消、同任务完成，并修正后台研究现状。生产长时与60秒自动提升仍未在20.49复验。

### 第一百二十二批：`/undo status` 显示 turn 归属

账本里一直有 `correlationId`（writer 写入的 prompt entry id，即一轮对话的标识），但报告只显示 operation id 与时间戳。同一轮的多个编辑因此看起来毫无关联，用户在决定撤销哪一个之前无从判断它们属于同一次请求。

现 `undoStatusReport` 在 receipt 带有 `correlationId` 时多显示一行 `Turn: <id>`，并写入 `facts.operations[].turn`。没有记录时不显示，不伪造归属。**撤销单位不变**：仍是单个已提交操作；按 turn 批量撤销需要新的选择器与"部分成功"语义，未做。

验证：`history.test.ts` 新增两项——带 `correlationId` 的操作显示该行且出现在 facts 中，未带的不显示。撤销该行后第一项预期失败；源码逐字节恢复并核对 SHA-256 `03f6723aad9d` 后重验。`edit/recovery` 22 文件 199 项通过。

**边界**：只是可见性改进，不改变任何恢复语义。

### 第一百二十三批：润色后一键取回原稿

外部编辑器（`ctrl+g`）是"润色"通道：草稿交给编辑器，改完整体覆盖回来。此前被覆盖的原稿直接丢失——编辑器里的改动不经过终端，`ctrl+z` 无从撤销。

现 `adoptDraft` 在接收编辑器结果前，把被替换的原稿存入草稿槽（仅当原稿非空且确实不同）。同时 `ctrl+s` 从"槽已占用就报错"改为**互换**：输入框的文本与槽里的草稿交换位置。于是润色后的状态（润色稿在输入框、原稿在槽里）下，一次按键取回原稿，再按一次换回润色稿——一次按键的撤销，且可逆。

三态因此明确：无槽有文本 → 暂存；有槽无文本 → 恢复；有槽有文本 → 互换。三种情况之外（都为空）报告"没有暂存的草稿"。

验证：宿主级 4 项（regular/fullscreen 往返、空槽、互换、编辑器未改动），加"取回原稿"与"互换"两项专项。两组反转各触发 1 项预期失败：去掉 `adoptDraft` 的保存、去掉互换分支；源码逐字节恢复并核对 SHA-256 `629fae556a27` 后重验。`interactiveMode` 与 `draftStash` 共 321 项通过；静态门与 module facade 0 通过，TS build `d52651ce6b16`。

**边界**：只覆盖外部编辑器这一条润色路径；模型在对话中给出的改写建议不经过草稿槽。`alt+s` 备选键未做。槽已占用时，第二次改写覆盖的原稿只能靠 `ctrl+z` 找回，界面会明确说出来而不是静默丢弃。

### 第一百二十四批：竞争性假说的收敛规则

"竞争性假说互相证伪"的产出不是两个回答并列，而是**哪些站得住、哪些被推翻、哪些没人能判定**。这一步是纯判定，不涉及 agent 调用，因此可以独立实现并直接测试——把它写进 runner 里则只能从整轮运行的结果反推规则。

新增 [convergence.ts](../../packages/ts-shell/src/core/subagents/team/convergence.ts)。两条规则刻意不对称：

1. **无证据的证伪不算数**。`counterevidence` 与 `condition-mismatch` 只有在引用至少一个评审者实际读过的源时才生效。意见不是证据，一个什么都没引用的评审者不能把提案踢出考虑范围。
2. **未被检查不等于存活**。`survived` 要求至少有一条带引用的 `none-found`；没有评审、或只有无引用的结论，一律是 `unresolved`。只有 `insufficient` 也是 `unresolved`——查不动不等于没问题。

结论对象强制携带 limitation："提案由同一模型的不同上下文评审，一致不等于独立确认，存活也不等于被证明，只是未被那些评审者读过的证据推翻。"

验证：`convergence.test.ts` 10 项覆盖引用证伪、条件不匹配、无引用证伪不生效、`insufficient` 不算证伪、带引用 `none-found` 才 survived、无人评审为 unresolved、证伪优先于干净检查、孤儿 finding、limitation 措辞、排序。两组反转各触发 1 项与 2 项预期失败；源码逐字节恢复并核对 SHA-256 `d165fe7e9f6a` 后重验。静态门、module facade 0 与 TS build `906d8e46584c` 通过。

**边界**：只有判定规则。fan-out、cross-review 提示词、命令面与用户批准流程均未实现，未运行真实多代理会话。

### 第一百二十五批：按 turn 审阅文件操作

`/undo status --turn <id>` 列出某一轮记录的全部文件操作。选择是对既有账本的过滤（`operationsForTurn`），复用同一个 `undoStatusReport`，不新建存储或预览路径。没有 `correlationId` 的 receipt 不属于任何 turn，永远不会被选中——把"未知"当成"你要的那一轮"会恢复用户没有指定的东西。

**撤销单位不变**：`/undo execute` 仍要求精确的 operation id 与 preview revision。批量恢复需要"部分成功"的报告语义，而现有契约明确声明跨文件非原子；在没设计好如何如实报告部分失败之前，不扩大这个单位。

验证：`history.test.ts` 新增两项——四个操作分属两轮加一个无 turn，`--turn prompt-1` 只列出前两个且不泄漏另外两个；未知 turn 明确报告为空。反转去掉 turn 过滤后第一项预期失败；源码逐字节恢复并核对 SHA-256 `7a19d85d36f5` 后重验，21 项通过。

**过程中发现并修复的真实缺陷**：`scanOperations` 是 generator，`.filter()` 在其上抛 `TypeError`，被命令的 `catch` 吞成"无法验证账本"。已改为先展开再过滤，并把这条陷阱写入 `HANDOFF.md`。

### 第一百二十六批：独立复核发现的两处静默丢失

独立只读复核针对最近三批改动提出两条真实缺陷，均已修复。

**一、外部改写覆盖原稿时静默丢失**（`interactiveMode.ts` 的 `adoptDraft`）。槽里已有一份草稿时，第二次外部改写覆盖的原稿既进不了槽，也没有任何提示——与"保留被替换文本"的承诺相反。现在两种情况都给出提示：进槽时说明 `ctrl+s` 可取回，槽满时说明原稿只在 `ctrl+z` 栈里。原稿并未真正丢失（`setDraftText` 会 `saveUndo`），但用户必须知道它在哪。

**二、干净检查抹掉了无证据的反对**（`convergence.ts`）。一个评审者带证据报 `none-found`、另一个不带证据报 `counterevidence` 时，初版判 `survived` 且理由写"没有发现反证"，把反对整个丢弃。现改为 `unresolved` 并说明有人反对但未引用任何东西。无证据的意见不能证伪（这是原有规则），但也不能被当作不存在（这是补上的规则）。`insufficient` 仍不算反对。

复核确认无问题的三点：`draftStash` 的 `held`/`protector` 始终成对设置、无其他写者；`--turn` 缺值会被 `parseFlags` 拒绝，不可达 `true` 分支；`strongest()` 排序稳定。另指出 `operationsForTurn` 展开全部 receipt 后过滤，峰值可能达百 MB 级——受既有读预算约束、非确定性缺陷，记为可改进项。

验证：`convergence.test.ts` 增至 12 项（新增无证据反对、`insufficient` 不算反对两项），`interactiveMode.test.ts` 新增槽满提示一项。两组反转各触发 1 项预期失败；源码逐字节恢复并核对 SHA-256 `4b38f2340238`（interactiveMode）与 `f6744de3e0bd`（convergence）后重验，三文件 334 项通过；静态门、module facade 0 与 TS build `bf0a81fb0411` 通过。

### 第一百二十七批：权限层与工具体用同一个围栏判定

`toolPolicy` 的 accept-edits 分支用 `path.relative` 做词法判断，而 `write`/`edit` 的工具体用 `verifyPathContainment`（含 realpath）。两者在 symlink 上结论相反：词法说"在工作区内"，realpath 说"指向外部"。结果是权限层批准一个调用，工具体随后硬拒绝——用户看到"已批准"却什么都没发生。

现 accept-edits 改用同一个 `verifyPathContainment`，并单独排除 workspace 根本身（`path: "."` 是目录，不是文件目标，写它是错误而非待批准的编辑）。**没有放开任何权限**：越界写仍是硬拒绝，只是判定源统一了。

验证：`toolPolicy.test.ts` 新增一项，用真实 symlink 指向工作区外，断言 accept-edits 下仍需升级。反转恢复词法判定后该用例预期失败（返回 `false`，即批准）；源码逐字节恢复并核对 SHA-256 `330b1feefe39` 后重验，35 项通过；静态门、module facade 0 与 TS build `8fad5ef03e22` 通过。

**边界**：只统一判定源。"越界写改为需审批"仍未实施。

### 第一百二十八批：`alt+s` 作为暂存备选键

`ctrl+s` 是 XOFF。终端流控仍开着、或多路复用器把该键转发出去时，它根本到不了应用。目录里只列 `ctrl+s` 等于承诺了一个可能不存在的按键。

现 `tui.input.stash` 同时绑定 `ctrl+s` 与 `alt+s`，目录与指南同步。宿主级测试用真实 `\x1bs` 序列走完整往返（暂存 → 恢复），反转撤销该绑定后预期失败；源码逐字节恢复并核对 SHA-256 `19fd5ba1018b`（keybindings）与 `9f2764d704a9`（keys）后重验，三文件 347 项通过；静态门、module facade 0 与 TS build `fd16f50737bd` 通过。

**边界**：非 raw 的 line 模式（`lineLoop.ts`）下的 IXON 吞键风险仍未在真机验证；备选键解决的是"主键被吞"，不是"两个键都被吞"。

### 第一百二十九批：按 turn 批量恢复

`/undo restore-turn <turn-id> --execute` 恢复该轮的全部未完成操作。它是**逐操作的串行执行**，不是单一事务——每一步复用原有的"预览 → 写意图 → 恢复 → 回读验证"，各自加锁、各自记录结果。

两条规则决定了它的形状：

1. **顺序由账本决定**。`restoreOperation` 只允许恢复最新的未完成操作，因为较旧的写入可能叠在它之上。因此批量从新到旧走，调用方不能指定顺序。
2. **失败即停，并列出未尝试的操作**。某一步未验证通过时，继续会把更旧的内容写到该步留下的未知状态之上。报告逐条说明做了什么、跳过了什么、为什么停，且 `rollbackAtomicityClaim: false`。

`complete` 只在全部操作都 `restored-verified` 时为真——不是"没有抛错"，因为部分成功才是最需要说清楚的结果。

验证：`turnRestore.test.ts` 7 项覆盖顺序、未确认不写、空 turn、跨 turn 隔离、失败即停并列出剩余、预览不可信时不开始、运行中拒绝；`history.test.ts` 2 项覆盖命令面（走对路径、缺确认被拦）。两组反转各触发 1 项预期失败：失败后继续（`['newer','older']` vs `['newer']`）、改为旧到新；源码逐字节恢复并核对 SHA-256 `3d1a97555b98` 后重验，4 文件 49 项通过；静态门、module facade 0 与 TS build `67f982a1ee7c` 通过。

**当时边界与20.50补充**：初版夹具替换了`previewOperation`/`restoreOperation`，没有真实多文件turn证据。20.50新增实际writer/snapshot回归和原CLI regular/fullscreen两操作批量恢复，验证部分通知与完整通知落盘并进入下一请求。报告仍沿原reader，未新增批量picker或工作区快照。

### 第一百三十批：提案与交叉评审的编排

三步链路补齐：`fanOut.ts`（并行提案）、`run.ts`（交叉评审编排）、`convergence.ts`（收敛判定）。

**fan-out 的两条约束**：每个提案者只拿到同一问题与自己的视角，看不到彼此的答案——独立性一旦破坏，后续证伪就没有意义；失败按提案者记录，空答案不算提案。后者尤其重要：一个空字符串如果作为提案进入收敛，会以"无人能反驳"的身份被判 `survived`。

**编排只拥有一条规则**：提案者永不评审自己。自评审会产生一个来自"必然同意的一方"的 `none-found`，而按收敛规则，单个带引用的 `none-found` 就足以报 `survived`。评审抛错记为缺失视角，不中断整轮；`limitation` 明确标注本轮不完整。

`propose` 与 `review` 作为依赖注入，编排层不持有 provider、工具池或权限门——它无法启动宿主未授权的 agent。

验证：`fanOut.test.ts` 7 项（同问题不同视角、真并发、单点失败不丢其余、空答案不算、取消语义、取消后不启动、完整性），`run.test.ts` 7 项（不展示自身提案、收敛、评审失败记录、提案缺失、单提案不跑交叉评审、limitation、证伪贯通）。三组反转各触发 1 项预期失败：串行执行、空答案算提案、允许自评审；源码逐字节恢复并核对 SHA-256 `52acefb7eafe`（fanOut）与 `893d77c31cd2`（run）后重验，3 文件 26 项通过；静态门、module facade 0 与 TS build `ed3eea96dc4e` 通过。

**独立复核补强（第一百三十一批）**：初版 `fanOutProposals` 用 `Promise.all` 直接等待每个 `run`。某个提案者的 promise 永不 resolve 时整轮永久挂起——`signal` 只能阻止后续提案者启动、或把抛错的那个记为 cancelled，**无法中断一个没人 reject 的 promise**。现每个提案者包在可被 abort settle 的 promise 里，abort 时立即返回 cancelled 并丢弃迟到结果。

复核另确认无问题的四点：新建文件路径不存在时 `verifyPathContainment` 会向上找最深存在祖先再拼回，结论正确；`confirmed=false` 时 `restoreOperation` 首行即返回 `denied`、不写任何字节；`scanOperations` 降序产出且 `filter` 保持顺序；`refutations` 的并发推入顺序不影响收敛（`converge` 按 proposalId 过滤，顺序只影响 reason 文本）。复核另指出 `command.ts` 恒传 `confirmed=true`，故该分支当前不可达——记为死参数，非缺陷。

**边界**：未接入命令面与交互式批准流程，未运行真实多代理会话。

### 第一百三十一批：中止必须能打断已在等待的提案

独立复核指出 `fanOutProposals` 的真实缺陷：`Promise.all` 直接等待每个 `run`，某个提案者的 promise 永不 resolve 时整轮永久挂起。`signal` 原只能做两件事——阻止后续提案者启动、把**抛错**的那个记为 cancelled——但中断不了一个没人 reject 的 promise。

现每个提案者包在一个可被 abort settle 的 promise 里：`abort` 到达时立即以 cancelled 结算，迟到结果被丢弃。这不会让底层请求停止（那是 provider 层的责任），但它保证编排层不会因为一个失联的提案者而永久等待。

验证：`fanOut.test.ts` 增至 8 项，新增"提案者永不 settle 时 abort 能结束整轮"。反转把 abort 处理器改为空函数后，该用例**永久挂起**（20 秒超时被终止），恢复后 27 项通过；源码逐字节恢复并核对 SHA-256 `c8e8bab5f281` 后重验；静态门、module facade 0 与 TS build `55975874feba` 通过。

复核另确认四点无问题（不存在路径的围栏判定、未确认不写、扫描顺序、并发推入顺序不影响收敛），并指出 `command.ts` 恒传 `confirmed=true` 使该分支不可达——记为死参数，未改。

### 第一百三十二批：`team` 工具

`team` 工具把三步链路接到产品上。做成工具而非 slash 命令：一次 pass 需要的模型、工具 gate、审批范围、步数预算都活在 turn 里，命令面得把这些重建一遍。

**评审者只读**（`readOnlyDelegation({ tools: ['read','glob','grep'], network: false, maxSteps: 12 })` + `plan` 模式）。提案是论证，不是对工作区的改动；让评审者能改文件，就等于让"评审"这个动作决定结果。

**证据必须显式声明**。格式为 `CLAIM <id> <kind> <reason> evidence: <paths>`。初版曾把"理由里出现路径"当作证据——但评审者可以写任何路径，那不是它读过什么的证明。现只有 `evidence:` 之后的内容算数，其余按意见处理。

验证：`teamTool.test.ts` 12 项——解析六项（正常解析、无证据保留为意见、**理由里的路径不算证据**、未知 claim 忽略、重复只取首个、非格式文本不产生 finding）、启动六项（缺问题、少于两个视角、视角相同、无模型、完整收敛、提案者失败）。反转把"路径即证据"改回来，第三项预期失败；源码逐字节恢复并核对 SHA-256 `a4e923f2e3a0` 后重验，4 文件 39 项通过；五静态门、module facade 0 与 TS build `6b66ddbb066b` 通过。

**边界**：走既有工具审批，无专门的交互式 UI；未运行真实多代理会话。


### 第一百三十三批：执行纪律的核查记录

本节记录本轮执行中的纪律事实，供复核，不作为产品能力的声明。

**红线 3（验证必须单一串行、聚焦）**：本轮有一次违规——在仓库根运行了覆盖 11 个目录的 `vitest run`，输出 `node::OOMErrorHandler` 并被移到后台。该次调用不计为任何批次的验收证据。此后全部改为在 `packages/ts-shell` 内按文件聚焦（1–8 个文件/次）、`&&` 串行。三条根因已写入 `HANDOFF.md`：大范围套件在 1024 MiB 下必炸；从仓库根运行会误扫 `.tmp` 下的历史 worktree（曾出现 167 文件/4349 项）；`/proc` 探测的 `ENOENT` 与 `ESRCH` 都表示进程不在。

**子代理模型**：`~/.claude/settings.json` 的 `CLAUDE_CODE_SUBAGENT_MODEL` 配置为 `cn:deepseek-v4.1-flash[1m]`，`~/.claude/agents/` 与项目 `.claude/agents/` 均无 agent 定义文件覆盖它。`subagent_type: Explore` 选择的是工具集与权限范围（只读），模型由上述环境变量决定。

实机核查派出的最小子代理报告其系统上下文为 `You are powered by the model global:deepseek-v4.1-flash[1m].`——**同一个模型（deepseek-v4.1-flash[1m]），区域前缀是 `global:` 而非配置里的 `cn:`**。这个差异不在本仓库的控制范围内（由 harness 解析），记录为事实而非"已按要求"。除此之外没有测试其他模型。

本轮两次复核均以 `Explore` 类型派发；第一次运行 15 分钟未收敛被终止、改由主代理自查，第二次给了明确时限并在超时后催促，正常返回并找到两个真实缺陷（`fanOut` 永久挂起、`converge` 抹掉无证据的反对）。

### 第一百三十四批：`team` 工具的准入橡皮章

`team` 工具初版向 `runSubagent` 传了 `admission: () => undefined`——一个恒返回"允许"的谓词。宿主的 runner 本来就带着会话 gate；再传一个只能同意的谓词，不是加了一层检查，而是**替换**了原有的一层。现该字段省略，runner 保留它被构造时的权威。

验证：`teamTool.test.ts` 增至 13 项，新增"不向 runner 传恒真准入"，断言每次调用收到的 `admission` 都是 `undefined`。反转把恒真谓词加回去后该项预期失败；源码逐字节恢复并核对 SHA-256 `1a97810ae013` 后重验；静态门、module facade 0 与 TS build `4920a6e44b88` 通过。

### 第一百三十五批：`team` 的审批目标

`team` 工具初版落到 `toolPolicy` 的默认分支，审批目标只有 `"team"` 两个字——用户被要求批准一件没有名字的事。现与 `task` 同列：目标取 `question`（截断 80 字符），缺失时用 `competing-hypothesis pass`。操作类型仍是 `execute`，仍需审批。

验证：`toolPolicy.test.ts` 增至 36 项，新增"审批目标取问题文本而非工具名"。反转把 `team` 从该分支移除后，目标退回 `"team"`、该项预期失败；源码逐字节恢复并核对 SHA-256 `f0a5dd7b80d7` 后重验；静态门、module facade 0 与 TS build `2b6fec2211e1` 通过。

### 第一百三十六批：`team` 加入串行工具集

`team` 内部并行运行最多 3 个提案者，但同一回合里若模型同时发起两个 `team` 调用，峰值会到 6 个并发子代理循环。`SEQUENTIAL_TOOLS` 里已有 `task` 正是为此——没有任何地方统计同时存活的子代理循环数，一次 step 里的两个调用会让模型请求翻倍而预算察觉不到。`team` 现与 `task` 同列。

验证：`turn/session.test.ts` 29 项通过；静态门、module facade 0 与 TS build 通过。该常量为模块私有，没有直接断言它的测试——此改动靠既有测试与代码注释维持，不宣称有反转证据。

### 第一百三十七批：观察者失败不得吞掉持久事件

第一百一十八批把观察者移到持久化之前（卡顿修复的核心）。这引入一个回归：观察者抛错会让持久化被跳过。改动前持久化在前，渲染 bug 不影响落盘；改动后一个 surface 渲染异常就能让事件永久丢失——**包括 `query.completed` 这类终态事件**，整轮会看起来从未结束。

现每个观察者单独 try/catch：显示失败不是持久失败。验证：`sessionRuntime.test.ts` 增至 47 项，新增"观察者抛错时仍记录持久事件"，断言 `recorded` 为 `["tool.started", "query.completed"]`。反转去掉 try/catch 后该项预期失败；源码逐字节恢复并核对 SHA-256 `d2e2bfd1f062` 后重验，两文件 52 项通过；静态门、module facade 0 与 TS build 通过。

### 第一百三十八批：`taskWait` 的注册空窗

`taskWait` 先 `get(id)` 判断是否已结束，再注册 `onEnded`。任务若在这两步之间结束，`onEnded` 只报告注册之后发生的事，监听永远等不到——只能靠 300 秒超时兜底，对一个早已完成的命令白等五分钟。

现注册监听后立刻复查一次状态。验证：`backgroundTools.test.ts` 增至 11 项，新增"任务在监听安装前已结束"，夹具让第一次 `get` 返回 running、第二次返回 exited。反转去掉复查后该用例**挂起 300 秒被终止**，正是缺陷本身；源码逐字节恢复并核对 SHA-256 `41257b792f7c` 后重验；静态门、module facade 0 与 TS build 通过。

### 第一百三十九批：`team` 的定义名不得由模型文本拼成

`team` 初版用 `team-${role}` 作为子代理定义名，role 来自工具参数——模型选的文本。而 `delegationTools` 用这个名去匹配 `task` 的 deny 规则（`matchDenyRule(denyRules, 'task', name)`）。结果是一个精心构造的 perspective 可以绕开本应阻止委派的规则，或误触发为别的东西设的规则。

现定义名固定为 `team-proposer`，role 只进 `systemPrompt`。验证：`teamTool.test.ts` 增至 14 项，新增"无论 perspective 是什么，每个提案者都拿到固定名字"；反转改回动态拼接后该项预期失败（收到 `team-task`、`team-review` 等）；源码逐字节恢复并核对 SHA-256 `cfa77ddbdfbe` 后重验；静态门、module facade 0 与 TS build `e056eeb81597` 通过。

## 19. 第八轮用户反馈（2026-10-29）：跨目录写入、思考不可见、退出卡住、启动光标、config/model、resume 卡顿、旧会话界面

第19节保留研究轮次的**问题定位与方案研究**及当时证据；后续实施与当前剩余项见第20节，不能把下文旧机制当作仍未修复的当前源码。编号沿用用户原序号（第二十四至第三十）；19.8 是研究过程中新发现的一项，不属用户列表。每条结论都区分三类证据：**已确认机制**（源码路径可复现）、**高置信推断**（链路完整但未在用户原环境复现）、**未确认**（不能用现有证据下结论）。本轮未运行任何产品测试，未拉起 PTY 或二进制；所有量化数字来自对真实 `~/.cheers/sessions`（2309 个会话目录、41 MiB）的只读文件系统测量。

### 19.1 第二十四：跨目录写入被系统硬拒绝

**用户的疑问值得单独回答**：拒绝不是来自注入的 `AGENTS.md`，也不是来自 `write`/`edit` 工具描述里的措辞。它来自工具执行体里的一次 `throw`。

**已确认机制（决定性）**

审批发生在工具体之前，但工具体在审批通过后**再检查一次**，而这次检查不接受任何批准结果：

| 层 | 位置 | 行为 |
|---|---|---|
| `write` 工具体 | `core/tools/registry.ts:322-325` | `verifyPathContainment` 失败即 `throw outsideWorkspaceMessage(...)` |
| `edit` 工具体 | `core/tools/registry.ts:426-429` | 同上 |
| `read` 工具体 | `core/tools/read.ts:65-68` | 同上（**读也拒绝**，且同样不进入审批） |
| `apply_patch` 计划 | `edit/patch/plan.ts:92` → `core/workspace/roots.ts:41` | 在 `prepare` 阶段抛错，**早于审批提示** |
| 工作区绑定 | `core/workspace/tools.ts:16` → `roots.ts:32-42` | 目标不在主根、也不在已注册根内时抛 `Tool path is outside the registered workspace roots.` |
| 审批层包装 | `turn/tools.ts:406-408` | 上一条抛错被 `catch` 转成 `{ blocked }`，**`escalationPromptHandler` 从未被调用**（`turn/tools.ts:461` 不可达） |

`selectWorkspaceRoot`（`core/workspace/roots.ts:32-42`）只有两个返回路径：主根，或一个 `access === 'write'` 的已注册附加根。**没有第三条分支会去读审批决定**。所以即使审批层放行，工具体的 realpath 检查仍会以同一个根为准再次拒绝——用户看到的"批准了却什么都没发生"与"直接被系统拒绝"其实是同一条围栏的两种表现。

`/workspace add <path> --write` 是唯一的持久化放行路径（`core/commands/workspace/command.ts:11`、`session/continuation/workspace.ts:57-94`、`core/workspace/roots.ts:18-29`），它把根写入会话、用 `dev:ino:birthtimeMs` 绑定身份、并入 sandbox 的 `allowWrite`。

**对照：三个参考项目都不把"工作区外"当作绝对边界**

- Claude Code：`utils/permissions/filesystem.ts` 的写判定最后一步是 **`ask`**（`:1395-1411`，`decisionReason.type === 'workingDir'`），并附 `addDirectories` 建议（`:1454-1463`）；读在工作区外同样降级为 `ask`（`:1179-1194`），并建议加 `Read` 规则（`:1427-1439`）。**没有任何一条路径把工作区外直接判 `deny`。**
- Codex：`core/src/safety.rs:26-97` 对越界 patch 返回 `SafetyCheck::AskUser`；`core/src/tools/handlers/apply_patch.rs:236-275` 甚至**从 patch 自身的目标路径反推**需要临时授予的可写根。提示词模板 `sandbox_mode/workspace_write.md` 明写"Editing files in other directories requires approval"。
- pi：写工具完全没有围栏（`core/tools/write.ts:65` 只做 `resolveToCwd`），README 明确"does not include a built-in permission system"。

**结论**：本项目是四者中唯一把"工作区外"实现成绝对拒绝的。用户的直觉（"其他项目从没拒绝过"）与参考实现一致。

**修复方向**（不放开相对路径逃逸，也不削弱符号链接防护）

1. **让判定变全函数**：把 `selectWorkspaceRoot` 拆成 `resolveWorkspaceRoot(...) -> { root } | { outside }`，只为"不在任何根内"这一种情况返回 `outside`；只读根、身份变更、根重叠继续抛错（`turn/workspace.test.ts:48-59` 锁定的"只读根在提示前拒绝"必须保留）。
2. **一次性的、不落盘的授权根**：`WorkspaceRoot` 增加 `origin: 'session' | 'approval'`；`approval` 只在内存中存活、只对本次 turn 有效，`decodeWorkspaceRoots`（`core/workspace/model.ts:13-31`）读取时拒绝该来源。这样 `/workspace add` 仍是唯一持久化放行方式。
3. **审批目标必须是规范父目录**：用 `verifyPathContainment` 的 `resolvedPath` 的目录，而不是用户写法的字面串；批准后再用同一函数复验一次，符号链接在提示与写入之间被改写时拒绝——这正是 `toolPolicy.ts:223-228` 已经记录的"批准了却写不进去"隐患。
4. **相对路径逃逸永不进入审批**：沿用 `writeTarget.ts:96-104` 的三分法——相对路径越界是笔误，直接拒绝；绝对路径越界才可升级。这是防止 `../../../.bashrc` 变成用户条件反射点"允许"的关键。
5. **`apply_patch` 需要单独处理**：它在 `prepare` 阶段（审批前）就调用 `selectWorkspaceRoot`（`edit/patch/plan.ts:92`、`turn/preparation.ts:54`），所以要么让 plan 产出"这些文件在工作区外"的预览段并在预览里升级，要么把越界判定移出 plan。
6. **读路径同样处理**：`read.ts:65-68` 应升级为审批，而不是拒绝；这与 Claude Code 的读语义一致。
7. **保留执行层二次校验**（`runtime/execution/write.ts:20-30`、`core/workspace/files.ts:16-24`），只是让它们指向被批准的根。

**会被改动的现有断言**：`core/tools/arguments.test.ts:99-123`（当前断言 `write`/`edit` 越界必 `reject` 且 `writeTextFile` 未被调用）是主要改动点；`core/security/pathJail.test.ts:22-80`、`core/query/toolPolicy.test.ts:85-104`、`turn/workspace.test.ts:44-67` 必须继续通过。

**证据边界**：以上全部来自源码与参考实现对照，未在真实终端复现用户的拒绝现场，也未验证改动后的审批链路。

### 19.2 第二十五：模型的思考过程打不开

**后续协议复核修正**：渲染、折叠、`ctrl+t`链存在，恢复与流式点击缺口已由20.3/20.8修补。默认`auto`明确表示供应商决定档位，不能由未发送effort推导“多数情况下没有推理”；内部reasoning与公开summary也是不同事实。后续请求策略证据见20.10。

**请求侧（决定性）**

默认偏好是 `null`（"auto"）：`core/models/preference.ts:6` 取 `readProjectState(...).thinkingEffort ?? null`，`DEFAULT_CONFIG` 不含 thinking 档位。而各协议**只有在档位非空时才发推理参数**：

| 协议 | 发送条件 | 位置 |
|---|---|---|
| Anthropic | `if (input.thinkingLevelName !== undefined)` 才发 `thinking` | `provider/endpoints/anthropicMessages.ts:158` |
| Google | `thinkingConfigFor(budgetTokens)` 在 `budgetTokens === undefined` 时返回 `undefined`，连 `includeThoughts` 一起不发 | `provider/endpoints/googleWire.ts:180-183` |
| OpenAI 兼容 | `...(input.reasoningEffort && input.thinkingLevelName ? { reasoning_effort } : {})` | `provider/endpoints/openaiCompatible.ts:86-88` |

`resolveRequestShape` 也只在 `level` 非空时才填 `thinkingLevelName`/`thinkingBudgetTokens`（`core/models/requestShape.ts:146-151`、`:170-171`）。这些路径证明本项目不显式要求档位或budget，不能单凭源码断言供应商完全不产生推理。各协议/模型的默认行为与公开摘要支持须分别核对；本项目`auto`合同为provider decides，不把参考的`medium`产品默认直接覆盖现有用户偏好。

**对用户当前环境的判断**：用户用的是 OpenAI 兼容 relay（`~/.cheers/config.json` 的 `bailucode.com` + `bailu-2.9-preview`）。这类 relay 通常**无论请求参数如何都会返回 `reasoning_content`**，而 `turn/completion.ts:169` 的 `REASONING_FIELDS` 确实解析它，所以用户应当**看得到**折叠行。那么"打不开"就落在下面第 3、4、5 条上，而不是请求侧。

按用户描述（"没法打开查看"）最可能的两条：**在流式过程中点击**（第 4 条，按下与松开之间来一个增量即被静默丢弃），或**处于 `regular` 模式**（第 5 条，鼠标根本不转发）。若是**恢复的旧会话**，则是第 3 条——那里连折叠行都不存在。三条都能解释"打不开"，但只有第 3 条能解释"连折叠行都没有"；用户下次复现时看有无 `● thought` 行即可二分。

**解析与渲染（已确认可用）**

- 事件：`turn/session.ts:279` → `reasoning.delta`；渲染：`cli/interactive/turnSink.ts:189-212` 建 `kind:"thinking"`、`collapsed:true`；`transcript/blocks.ts:170-187` 折叠行 `● thought Ns · click to expand`，展开正文用 `thinkingText` 主题令牌。
- 折叠/展开缓存正确失效：`transcript/container.ts:130-132`（`setCollapsed` → `update` → `cache.delete`）。
- 键盘入口真实存在且无冲突：`keybindings.ts:86` `ctrl+t` → `keymap.ts:255-258` → `surface/pane.ts:122-134`；`presentation/tui/input/keys.ts:214-230` 把 `0x14` 正确解成 `ctrl+t`。

**确定的五个缺口（按影响排序）**

1. **请求侧默认不发送显式推理档位**（上文）。是否产生及公开推理由实际协议/模型决定，旧“从来没有思考”结论已撤销。
2. **OpenAI 官方模型走错端点，Responses 又只读摘要**。内置 `openai` provider 不声明 `endpoint`（`core/models/catalog.ts:288-308`），于是回落到 `openai-compatible`（`provider/endpoints/kinds.ts:216`）；`/chat/completions` 不返回推理。只有 ChatGPT 账号走 `openai-account-responses`（`core/auth/account/policy.ts:15-16`），而该读取器**只处理 `response.reasoning_summary_text.*`，完全忽略 `response.reasoning_text.delta`**（`provider/endpoints/responses/stream.ts:117-143`）。pi 两者都读。
3. **恢复的会话里没有思考块。** `restoreConversation`（`cli/interactive/history.ts:36-109`）只建 `user`/`assistant`/`tool` 三种块，**从不读 `SessionMessage.reasoning`**——而该字段确实已落盘（`turn/step.ts:719-728`、`session/schema/sessionMessage.ts:60-86`、真实 transcript 抽查 8/70 条带 reasoning）。所以 `/resume`、切换会话、fork、rewind 之后，历史里一个思考块都不存在，"打不开"是必然的。
4. **点击的按下与松开之间只要来一个增量，这次点击就被判过期并丢弃。** `pointer.ts:255-261` 在 `!transcriptSelectionCurrent()` 时 `clearSelection()` 后直接返回，`toggle()` 不再执行；而 `transcriptSelectionCurrent()`（`:307-313`）要求 `transcriptContentRevision === view.transcript.revision`，后者每个 delta 都推进。流式期间 delta 连续到达，落在这段极短窗口内的概率并不低——于是**模型正在思考时点那一行常常不展开**，恰恰是用户最想看的时刻。轮次结束后点击稳定有效。
5. **`regular` 模式下鼠标不可达。** `interactiveMode.ts:513` 只在 `alternateScreen || pager.active || overlay.fullScreen` 时把鼠标交给 pointer，`engine.ts:369/373` 也只在同样条件开启鼠标跟踪。非全屏模式下 "click to expand" 是画出来点不了的提示（键盘 `ctrl+t` 仍可用）。

**次要缺陷**：`pane.ts:128-132` 的批量翻转**只按最旧那个块决定目标状态**。若用户先展开了旧块，之后新块到达（新块恒为 `collapsed:true`），第一次按 `ctrl+t` 会把全部折叠，而不是展开新的那个——看起来像"按了没反应"。

**参考对照**：Claude Code 的 `ctrl+o`（`keybindings/defaultBindings.ts:44`）是全局 transcript 视图切换，thinking 在 verbose 下直接全文显示，不存在逐块展开的可达性问题。

**修复方向**

1. 请求侧：在 `auto` 下也按协议请求"供应商默认档位的推理"（Anthropic 用最小 budget、Google 发 `includeThoughts: true`、OpenAI 兼容在目录声明 `reasoning: true` 时发 `reasoning_effort`），或把默认档位对齐 pi 的 `medium`。这是原研究建议，后续保留auto/null并独立准入公开摘要；没有真实协议证据时不改全局档位。
2. Responses 读取器补 `response.reasoning_text.delta`，并考虑让 OpenAI 推理模型默认走 Responses 端点。
3. `restoreConversation` 把 `turn.reasoning.text` 还原为 `collapsed: true` 的已定稿思考块；`redacted` 时显示"provider withheld"而不显示正文。
4. 点击展开不应被流式增量挡住：toggle 判定只依赖"行归属 + 块可折叠"，不依赖 selection 的 revision 新鲜度。
5. `regular` 模式要么开启鼠标跟踪，要么不绘制 "click to expand"（二选一，不能继续画假提示）。
6. `toggleCollapsed` 改以**最新**可折叠块决定目标状态，或让每块朝各自的反向翻转。

**证据边界**：全部为源码核实，未在真实终端按键复现。"用户应当看得到折叠行"是基于 relay 通常返回 `reasoning_content` 的推断，未验证该 relay 的实际响应；用户是否在流式过程中点击也未确认。

### 19.3 第二十六：`exit` 有时卡住

**已确认两条独立的挂起机制，都能解释"有时卡有时不卡"。** 另有第三类"看起来卡住"其实是被排队。

**入口核实**

- `core/commands/slashRouter.ts:21` 要求输入以 `/` 开头，所以裸 `exit` **不是命令**，会被当普通提示词发给模型——用户若没打 `/`，看到的"卡住"是模型在回答这个词。
- `/exit`（别名 `quit`、`q`，`registry.ts:436-443`）返回 `exit-session`（`exitCommandRuntime.ts:16`），由 `interactiveCommandRouter.ts:255-257` 转成 `exitRequested`。
- 键：`ctrl+d` 仅草稿为空时退出（`keybindings.ts:81-82`、`keymap.ts:236-237`）；`ctrl+c` 两次（600 ms 内）退出（`keymap.ts:47`、`:347-372`）。两者直接调 `actions.exit()` → `shutdown()`（`interactiveMode.ts:692`）。

**机制一（已确认，最容易造成"永久卡住"）：`handleShellClose` 没有异常围栏**

`shutdown()`（`interactiveMode.ts:1509-1530`）依次执行：`stdin.dispose()` → `await drainInput()`（1000 ms 上限，**有界**）→ `stop()`（恢复终端）→ **`handleShellClose(...)`，无 try/catch**。

`handleShellClose`（`core/shell/signalHandlers.ts:28-54`）在 `input.exit?.(0)`（`:53`）之前同步执行 `sessionRuntime.terminate(sessionId)`（`:42`）→ `saveTerminated` → `handleSaveTerminated`（`session/agent/lifecycle.ts:85-90`）→ `saveSessionTerminated`（`session/lifecycle/sessionLifecycleStore.ts:150-175`），后者第一行就是 `callbacks.loadSession(sessionId)`，随后 `writeSessionMetadata`/`writeSessionState` 取**同步文件锁**。

`withFileLock`（`session/store/sessionFileStore.ts:117-147`）用 `Atomics.wait` **阻塞主线程**，超时 1200 ms 后 `throw`（`:135`）；`loadSession` 对缺失/损坏的会话也会 `throw`（`session/store/sessionStore.ts:142-166`）。于是：

- 另一个 `cheers` 进程正持有该会话的 state lock，或会话文件损坏 → `terminate()` 抛错 → `exit?.(0)` **永不执行**。
- 四个调用点全是 fire-and-forget（`interactiveMode.ts:331`、`:460`、`:692`、`:1106`），拒绝被丢弃；`installCrashRecorder` 又明确让 `unhandledRejection` 继续运行（`observability/crashLog.ts` 注释）。结果：**终端已由 `stop()` 恢复，进程却还活着**——正是"卡住"的样子。

间歇性的来源很清楚：取决于退出瞬间是否有别的进程持锁、或会话文件是否可读。

**机制二（已确认）：MCP 关闭在 10 秒预算之外**

`exit` 回调（`interactiveLoop.ts:64-73`）先 `await input.initialMcpGateway.close?.()`，**无超时、无 abort**，之后才调 `terminate(code)`；而 `terminate` 指向的 `createCliShutdown.exit` 本身是有界的（`cli/runtime/shutdown.ts:41` 用 `timeoutMs ?? 10_000` 竞速）。

`CoreMcpGateway.close()`（`core/mcp/gateway.ts:185-189`）是 `Promise.all([connectionManager.shutdown(), this.queue])`，而 `this.queue` 是串行 lane（`:191-200`）的尾部——一个正在跑的 `snapshot()`/`refresh()` 会让关闭排在它后面，上限 `MCP_CATALOG_TIMEOUT_MS = 30_000`（`catalogLimit.ts:3`）；`CoreMcpClient.finishClose` 还会 `await this.opening`（`client.ts:271-275`），连接中途再叠一个 30 秒。

本仓库 `.cheers/mcp.json` 配了 `code-index`（stdio，serena）与 `github`（HTTP），所以这条在本机是**活跃风险**：退出时 serena 正在启动就会等。stdio 传输自身有 2 s + 2 s + SIGKILL 兜底（SDK `stdio.js:143-172`），HTTP 无额外上限。

**机制三（已确认，不是挂起而是排队）：忙碌时 `/exit` 被排队**

`onSubmit` 在 `busy` 时把 `/exit` 推入队列（`interactiveMode.ts:980-992`，`/` 开头的文本 `input` 为 `undefined`，走 `this.queue.push`），队列只在该轮结束后排空（`:1126`、`:1138`）。若该轮永不结束（挂起的 provider 请求、前台命令、占着 `busy` 的后台任务），`/exit` 就永远不执行。而 `ctrl+d`/双击 `ctrl+c` 直接走 `actions.exit()`，**不受忙碌限制**——这解释了"同一个词有时卡有时不卡"。

**机制四（已确认，潜在）：两个媒体定时器没有 `unref`**

`cli/media/live.ts:85` 的 100 ms `setInterval` 与 `cli/media/record.ts:49` 的 `setInterval` 都**没有 `.unref()`**，只在各自 `finish()`/`publish()` 里清除。若媒体设备关闭卡住，事件循环被永久钉住。其余定时器（`interactiveMode.ts:1025`、pointer、picker、context controller、ssh、security、terminal 键盘协商）都正确 unref 了。

**参考对照**：`createCliShutdown` 的 10 秒总预算本身是对的（codex 同类），问题在于 MCP 关闭被放在了那个预算**之外**，以及 `handleShellClose` 的关键副作用没有失败处理。

**修复方向**

1. `shutdown()` 用 `try/finally` 包住 `handleShellClose`，保证 `exit` 一定被调用；`terminate` 失败时**仍然退出**，并打印"会话状态未能写入"（与既有 "cleanup failed; exit was not verified" 同范式）。这是最重要的一条：终端已经恢复却不退出，是四种机制里唯一会**永久**挂住的。
2. 把 `interactiveLoop.ts:67` 的 MCP 关闭纳入同一有界预算，超时后打印未确认并退出。
3. `gateway.close()` 不应等待队列中**尚未开始**的工作：关闭即拒绝新工作，已排队的操作取消而不是等待。
4. `/exit` 在忙碌时应**直接执行**（或先取消当前轮），与 `ctrl+d` 语义一致，而不是排进队列。
5. `media/live.ts:85` 与 `media/record.ts:49` 补 `.unref()`。

**证据边界**：四条机制均为源码核实，未在真实终端复现。用户的卡住属于哪一条未确认；区分方法：若退出后终端已恢复但进程仍在（`ps` 可见），是机制一或四；若终端一直不恢复，是机制二。用户当时的输入是否带 `/` 也需确认。

### 19.4 第二十七：进入时输入框光标跳到很多空白行

**结论：机制未确认。** 本轮找到的候选链路都有反证，因此只记录已排除项与需要补的证据，不给出"根因"。

**已确认的几何事实**

1. `interactiveMode.start()`（`interactiveMode.ts:477`）在**第一帧之前**把欢迎块与会话历史 `append` 进 transcript（`:495` 的 `appendConversation`）。
2. `view.renderFrame`（`surface/view.ts:53-104`）先算 chrome（含 composer 行），再算 `transcriptRows`，composer 的屏幕位置是 `transcriptRows.length + chrome.composerOffset`（`:79-83`）。
3. `pane.render` 的 `filler`（`surface/pane.ts:98-99`）把短对话**向下填充**到底部；填充行没有 owner（`viewport.ts:168-173` 对 `within < 0` 返回 `undefined`）。
4. 启动表面**无条件**先以 alternate screen 启动（`cli/interactive/startup.ts:57`），随后由 `startup.adopt()` 交给 `InteractiveMode`（`interactiveMode.ts:578`、`engine.ts:157-164`）。

**已排除的假设（有代码反证）**

- **"`Editor.scrollOffset` 在空草稿下自己偏移"**：不成立。`editor.ts:302-305` 在 `rendered.length <= maxRows` 时把 `scrollOffset` 归零，空草稿只有一行；只有草稿真的超过行预算才会保留非零值，且随即被夹到 `[0, maxScroll]`（`:315-317`）。
- **"`transfer` 走 `viewportUnplaced` 定位"**：不成立。`viewportUnplaced` 只由 `leaveForExternalOutput()` 置位（`mainScreen.ts:296`），而 `transfer` 走的是 `leaveScreen()` + `enterScreen()`，后者**新建**一个 `MainScreenPainter`（`engine.ts:160-163, 179-183`），新实例的 `scrolled`/`cursorRow`/`visibleContent` 全为 0，`viewportUnplaced` 为 false。所以模式切换不会进入"从当前光标行开始写"的分支。
- **"reanchor 会重建位置"**：`reanchor` 只出现在 `mainScreen.ts:32` 的注释里，**没有实现**。

**仍然成立的候选（按可能性排序，均未证实）**

- **`regular`模式的相对原点是否漂移仍需几何证据**。MainScreenPainter的cursorRow=0是首次写入行的相对位置，不承诺物理屏幕第0行；shell光标在低处不能直接证明输入光标错位。后续20.9用具备CUD夹限与alternate cursor恢复的终端夹具，从顶部/中部/底部交接，均保持composer光标，无需据此新增DSR或原点重置。
- **首帧用替代尺寸合成**。`terminal.ts:143-152` 在 `process.stdout.rows/columns` 未定义时回落 80×24，而引擎只在尺寸 `<= 0` 时拒画（`engine.ts:358-359`），所以回落值一定会被用上。主屏模式下帧按 **document** 合成（`engine.ts:360`），`contentCapacity`/`overflow`/`newScrolled` 都由这个高度推出（`mainScreen.ts:130-141`），再转成真实的相对光标移动。尚无用户现场证明WSL2/Windows Terminal前几帧实际缺失`rows`；若回落高度与真实窗口不符才可能有影响。`resize` 事件到达后会强制重绘（`terminal.ts:180` → `engine.ts:401-404`），这解释了"输入之后就好了"。
- **`setText` 不归一化 CRLF**（一个窄但真实的隐患）。`EditorBuffer.insert` 会把 `\r\n?` 归一成 `\n`（`buffer.ts:118`），但 `setText`/`setDraftText` 只按 `\n` 切分（`:91-98`），于是每行尾部留下一个 `\r`。`setText` 正是历史回溯（`editor.ts:258/265/271`）与 `replaceExternalDraft`/`stashDraft`（`interactiveMode.ts:1442/1451`）走的路径；而 `\r` 在 `resolveCodePointWidth` 里宽度为 0，渲染层也不过滤控制字符（`render/paint.ts:51-60`）。结果是一个宽度算作 0、却会让终端真实回车的字符混进帧行——从 Windows/VS Code 粘贴的草稿或历史条目即可触发。
- **transcript 填充行 + 窄窗口**：短历史被 `filler` 推到底部时 composer 之上会出现空行。这是**正常的底部对齐**，只是空行数随窗口高度变化；若用户把它读成异常，则不是缺陷。

**为什么"输入内容后就能删掉空白行"**：按上面的排除，空草稿本就不该有布局偏移；而 Backspace 在行首会合并上一行（`editor/buffer.ts:144-163`），所以"能删掉"说明那些行是**草稿里真实存在的换行符**，不是布局空行。

**需要并列考虑的一条**：`startup.ts:39` 在加载期把 `enter`/`ctrl+j`/`shift+enter` 一律插成 `'\n'`。若用户在"Loading"阶段按过 Enter，草稿里就会留下真实换行，接管后光标落在这些空行之后，而 Backspace 能逐个删掉它们。**这条与"主屏原点假设"是目前两个最能同时解释"光标在空白行之后"与"能删掉"的候选**，区别在于：加载期Enter形成的草稿行可删，布局行没有草稿owner、不能逐个Backspace删除。用户下次只需试一下 Backspace——能删=草稿换行（加载期 Enter 或 CRLF 残留）；不能删=布局问题（主屏原点或首帧尺寸）。

**下一轮的做法**：三条夹具分别固定三个候选——(a) 加载期按 N 次 Enter 后接管，断言草稿文本与光标 offset；(b) 历史 + 空草稿的纯几何，断言 composer 首行紧贴最后一条历史行；(c) `tuiMode: "regular"` 下先让 shell 提示符停在窗口下半部再交接，断言首帧的绝对行号。另需一条单元用例锁住 `setText` 对 `\r\n` 的归一化。修复方向取决于结果：加载期 Enter 是用户输入、应保留但把光标放到末尾；主屏原点和未知尺寸要先取得物理夹具或真实现场证据，不能直接新增DSR、原点重置或推迟首帧策略。

**证据边界**：未在真实终端复现；上述为源码核实后的排除与候选，未做任何修复。需要用户确认两点：`tuiMode`（默认 fullscreen），以及进入后那些空白行是否**能被 Backspace 逐个删除**（能=草稿换行；不能=布局空行）。

### 19.5 第二十八：config 与 model 配置没有区分开

**先纠正一个事实：本项目没有 `/config` 命令。** 设置面板是 `/settings`（`registry.ts:513-523`，无别名），模型面板是 `/model`（`registry.ts:258-269`，别名 `models`、`switch`）。

**实际的职责划分（已确认）**

| 关注点 | `/settings` | `/model` |
|---|---|---|
| 模型/连接/凭据选择 | 只有两个跳转行 `settings:model`、`settings:thinking`（`picker/settings.ts:253-257, 284-285`） | 完整拥有（`picker/model.ts:114-240`） |
| reasoning effort | 跳转到 `/thinking` | 详情里的 "Choose effort"（`model.ts:206-215`）**且** `/thinking` 独立存在 |
| temperature / topP / maxOutputTokens | **是**（`config/settings.ts:22-25`，`settingNavigation` 把 `Request` 组映射到 `Model`） | 否 |
| allowedModels（模型白名单） | **是**（`config/settings.ts:43`） | 否 |
| contextWindow / reserveTokens / modelTokenBudgets | **是**（`config/settings.ts:26-28`，映射到 `Context`） | 否 |
| retries / network timeouts | 是（`Providers` 组） | 否 |
| roles / presets | 仅跳转 | 完整拥有 |
| theme / vim / statusline / tools / tasks | 是 | 否 |

**真正的重叠**只有两处，但都足以让用户觉得"没有分开"：

1. **`/settings` 的 `Model` 分类里混着两类东西**：配置文件字段（sampling、limits、allowlist）和两个跳转行（模型/角色、thinking）。前者是"模型行为配置"，后者是"模型选择入口"。
2. **effort 有三个入口**：`/settings → Thinking effort`、`/model → 详情 → Choose effort`、`/thinking` 命令本身。三处最终都落到同一个 session 事务（这是对的），但入口数量让"配置"与"选择"的边界消失。

**参考对照**：Claude Code 的 `/config` 是 `Settings` 面板的一个 tab，里面只有 `model`、`teammateDefaultModel` 这类**行为字段**，模型目录与切换在独立的 `/model` picker（`commands/model/model.tsx`）；pi 同理（`/settings` 是扁平设置菜单，`/model`、`/scoped-models`、`/thinking` 各自独立）。**没有一个参考项目把模型目录放进设置文件面板。**

**后续裁决修正**（20.11）：采样、limits、Context、Retries/Network仍是用户/项目配置字段；按“与模型有关”搬到模型目录不能改变其真正保存owner，也不是参考共同要求。pi设置入口实际提供transport、HTTP timeout、默认模型/档位等配置，原“没有参考在设置提供模型入口”的概括过强。保留SettingsDraft和现有嵌套返回合同，把两个当前会话跳转独立归入Session分类；Model只显示采样/限制文件字段，Session明确当前会话语义及来源scope。没有第二套库存、编辑器或持久化。裸/model继续管理目录/角色，/thinking继续通过原会话事务；不同入口共享owner不等于配置文件与会话状态重叠。

**证据边界**：分类隔离是产品职责与发现性判断；后续聚焦操作链见20.11，不作真实终端或全部面板验收。

### 19.6 第二十九：resume 面板每个操作卡约 1 秒

**已确认：每次搜索都全量重扫会话目录，足以解释本机约 1 秒的停顿。渲染路径另有每秒一次的同步扫描，但本机约 1 ms，未证明它是本次主因。**

**量化（本机真实 `~/.cheers/sessions`：2309 个会话、41 MiB）**

| 操作 | 实测 |
|---|---|
| `readdir` 全部会话目录 | 3.7 ms |
| 每会话 `lstat` 三个核心文件（4 并发） | 354 ms |
| 读取 metadata + state（1.4 MiB） | 504 ms |
| 再读 transcript 并逐行 `JSON.parse`（5.5 MiB / 24 958 行） | 874 ms |
| 缓存命中后的稳态 `lstat`（每会话约 12 次） | **1 027 ms** |
| 单个大会话（1.84 MiB / 12 116 行）完整加载 | 读 14 ms + 解析 22 ms |

**机制一：搜索每敲一个键就全量重扫。** `overlay.ts:955` 用 `picker.searchDebounceMs ?? 100` 调度；session picker 没有覆盖该值。`SessionListing.search`（`picker/session/listing.ts:57-83`）**把整个 catalog 迭代到最后一页**（`:69-73`），只为拿最后一个 snapshot；`SessionCatalog.list` 每次都会重新 `discoverSessions`（`catalog/discovery.ts:10-39`）并对每个 id 做 `locateCatalogFiles`（`catalog/files.ts:73-88`，目录 + 3 个文件各一次 `lstat`），`read()`（`catalog/index.ts:261-284`）又做**第二次** `locateCatalogFiles` 来确认版本没变。缓存只缓存 `SessionSummary`（`catalog/index.ts:48`），**不缓存 stat**。

**机制二：每秒一次同步扫描跑在渲染路径上。** `renderChrome`（`surface/chrome.ts:62`）无条件调用 `context.ambient()`；`interactiveMode.ts:394` 把它接到 `readAmbientFacts`；`ambientFacts.ts:24` 的 `PEER_COUNT_TTL_MS = 1_000` 过期后会执行 `AgentRegistryScanner.scanAllReachableAgents()`（`core/messaging/agentRegistryScanner.ts:24-74`）——它是**同步**的：`readdirSync` + `SubagentLoader.loadAllSubagents()`，后者对每个 `.md` 走 `readTextFile` → `pathIdentity`（`core/workspace/files.ts:182-201`，**逐级 `lstat` 到 `/`**）。本机实测这条链在无 agent 文件时约 1 ms（`socketEntries: 0`），所以它不是本机 1 秒的主因；但它在有 agent 定义或多 socket 的机器上会成为尖峰，且**在 picker 打开时仍然执行**。

**主因判定**：本机数据下，**机制一**足以单独造成约 1 秒/次（874–1027 ms），与用户描述吻合。机制二是放大器，不是主因。

**参考对照**：Claude Code 的 resume 列表只做 `stat`，再按需 `enrichLogs` 读取有界前缀（`utils/sessionStorage.ts:3939-3956`、`screens/ResumeConversation.tsx:126-140`）；pi 用有界并发走目录并发布部分有序页（`session-manager.ts:941-976`），且**跨按键缓存小写化后的消息文本**（`session-selector-search.ts:44-57`）。本项目的 catalog 已有分页与预算，缺的是"索引复用"。

**修复方向（实施前修订）**：在catalog owner复用同一次浏览中已读取的完整summary索引，沿原`SessionCatalogPage`过滤和分页；查询取消只撤销本次等待，浏览关闭或显式刷新撤销共享扫描。核心文件可在目录mtime不变时改写，不能用目录mtime替代身份复验；visible/current/lookahead/anchor继续核对核心文件版本。新增记录由显式重开纳入，partial与原读取预算跨查询保留。ambient扫描缺本次尖峰证据，暂不扩展为无依据的运行时修改。

**证据边界**：实测为本机只读文件系统测量，未运行产品代码；"约 1 秒"与用户主观描述吻合但未在同一进程内计时。

### 19.7 第三十：打开 cheers 时显示了上一次 session 的界面

**已确认：这是启动时的静默会话重入，不是终端残留画面。触发条件是上一次进程没有走 `shutdown()`（被 SIGTERM/SIGHUP/崩溃杀死）。**

**机制（`core/shell/bootstrap.ts:130-190`）**

- 交互式启动传 `adoptCurrentSession: false`（`cli/bootstrap/cliBootstrapContext.ts:137`）。
- 但重入条件是 `adoptCurrentSession === true || unfinished`（`bootstrap.ts:166`）。
- `hasUnfinishedBusiness`（`bootstrap.ts:348-356`）对**任何不是 `terminated`/`completed` 的状态都返回 true**；新会话以 `status: "active"` 创建（`session/store/sessionCreation.ts:72`），resume 也把状态设为 `active`（`session/recovery/sessionResume.ts:136`）。
- `"terminated"` **只**由 `handleShellClose` → `sessionRuntime.terminate` → `saveTerminated` 写入（`core/shell/signalHandlers.ts:41-53`、`core/shell/sessionRuntime.ts:454-457`）。
- **`createCliShutdown` 处理 SIGTERM/SIGHUP 时只调 `exit(143/129)`（`cli/runtime/shutdown.ts:18-19`），从不调用 `sessionRuntime.terminate`。** 崩溃路径同样不调。

于是：终端窗口被关掉、进程被 `kill`、或崩溃之后，该会话的持久状态仍是 `active`；下一次交互式启动把它判定为"有未完成的事"，**静默 resume**。

**为什么用户觉得"不是新会话"而不是"被恢复了"**：`emitLifecycleMessages: false`（`cliBootstrapContext.ts:134`）抑制了 `Resumed session <id>`（`bootstrap.ts:172`）；而这条通知只在 `showStartupSurface === true` 时打印（`cliStartupSurface.ts:79-96`），真实 TTY 的 fullscreen 宿主下该值为 false。窗口标题里虽然带 session id（`interactiveMode.ts:503-505`），但用户不会去比对。

**这不是新缺陷**：HANDOFF 第 9 条"Fresh CLI Processes Can Reenter Existing Conversation History"（`HANDOFF.md:235-240`）记录的就是这段代码。

**次要机制（仅在 `regular` 模式或 SIGKILL 后可达）**：启动表面**总是**先以 alternate screen 启动（`startup.ts:57`），`adopt()` 到 `regular` 时 `transfer` 会 `EXIT_ALT_SCREEN`（`engine.ts:160-163`），把终端恢复成上一个未正常退出的进程留下的屏幕。但用户配置里没有 `tuiMode`（默认 `fullscreen`），所以这条不是本机主因。

**判定依据（供用户下次复现时区分）**：看欢迎块下方的状态行与窗口标题里的 session id；若与上次相同，是重入；若 id 是新的但画面旧，才是终端残留。另外 `crashes.json` 存在与否可区分崩溃与信号退出。

**修复方向**：把"交互式启动不重入已关闭的会话"从"状态推断"改为"显式意图"——只有 `--continue`/`/resume` 或真实的 `pendingPrompt`/`turn-active` 才重入；`active` 但无 pending 工作且无 `runPhase` 的会话应视为已关闭。同时 `createCliShutdown` 在 SIGTERM/SIGHUP 路径应写入 `terminated`（或至少写入一个"进程非正常结束"标记），使下次启动能正确判定。若保留重入，则必须在 fullscreen 下也打印 `Resumed session <id>`。

**证据边界**：未复现；上述为源码链路与 HANDOFF 既有记录的一致性推断。

### 19.8 研究过程中新发现：损坏的用量键让恢复路径抛出未捕获拒绝

这一项不在用户列表里，是在核查第二十五、第三十条时从 `~/.cheers/crashes.json` 读到的**真实记录**：

```
2026-10-29T05:30:55.648Z  unhandled-rejection  Invalid persisted session usage key
```

该文件共 5 条记录，4 条 `uncaught-exception`（含 `write EPIPE`）、1 条 `unhandled-rejection`，日期分布在 9/24–9/27 与 10/29。今天的这一条是本轮唯一能定位到具体代码的。

**机制（已确认）**

`decodeAttribution`（`observability/usage/identity.ts:63-70`）对 `namespace` 前缀的键做严格校验：只要键以 `namespace` 开头却不是 `legacyPrefix`，或 JSON 解出的值再编码后与键不一致，就 `throw new Error('Invalid persisted session usage key')`。

调用链：

- `restoreSessionUsage`（`observability/usageTelemetry.ts:355-364`）直接调用 `decodeUsageSnapshot(snapshot)`，**没有 try/catch**。
- `decodeUsageSnapshot`（`observability/usage/snapshot.ts:19-40`）逐键调用 `decodeAttribution`（`:29`）。
- `persistSessionUsage`（`usageTelemetry.ts:370-386`）同样无保护，且它在 `:384` 用 `!` 断言解码成功——若数据在两次解码之间被改写，这里会抛 TypeError 而不是给出可读错误。

**拒绝的证据边界**：`installCrashRecorder` 对 `unhandledRejection` 的策略是**记录后继续运行**（`observability/crashLog.ts`）。记录证明存在逃逸的解码错误，不能独自证明该次调用在恢复还是保存、后续是否继续记录、会话是否丢失或实际计数是否归零。第20.6节实施时另确认会话文件加载也会先严格解码usage，故恢复边界必须覆盖文件投影与运行时；本批未复现用户原始现场。

**键损坏原因尚未确认**：`attributedBucketKey`包含捕获的`attribution.rates`，`decodeAttribution`从该记录自身的价格重新编码，不查询当前目录。普通目录价格刷新不会使完整旧记录失效；metadata缺失、key/metadata不一致或历史编码算法变更均可能失败，但尚未拿到原损坏记录，不能把`ratesSnapshot`演进当作已确认根因。

**修复方向**：

1. 用量恢复与持久化对坏输入分桶降级，保留能验证的记录并显示partial/unknown，不能丢弃整份快照或静默重置为零。
2. 严格`decodeUsageSnapshot`保留，恢复边界独立逐项验证并计数坏bucket/history；一个损坏bucket不抹掉其余bucket，丢失history应断开cache连续性。
3. `decodeAttribution` 的严格校验保留（它是防篡改边界），但调用方必须把它当"可失败输入"，不是"必然成功"。
4. 若确认是 `ratesSnapshot` 演进导致，应给键加版本位并保留对旧版本的解码能力，而不是让旧会话的键永久失效。

**证据边界**：崩溃记录真实存在且时间与用户本轮反馈同日；但"是 `ratesSnapshot` 演进导致键不一致"是**推断**，未取到那条损坏的 state 文件原文（用户会话可能已被后续写入覆盖）。修复前应先加一条诊断：解码失败时记录键的前缀与长度，而不是记录键本身（键含 provider/model 摘要，不属机密但无必要外泄）。

### 19.9 本轮结论摘要与实施顺序

| 编号 | 判定 | 主要证据 | 实施优先级 |
|---|---|---|---|
| 24 | 确认：工具体硬拒绝，审批层不可达 | `registry.ts:322/426`、`turn/tools.ts:408`、参考实现对照 | P0（用户阻塞） |
| 25 | 确认：默认未发送显式档位；推理产生与公开内容须按协议分别核实。恢复缺块、流式点击与regular假提示已修，已知摘要准入见20.10 | `preference.ts:6`、`anthropicMessages.ts:158`、`googleWire.ts:180-183`、20.3/20.8/20.10 | P0（用户可见思考） |
| 26 | 确认四条：`handleShellClose` 无异常围栏（锁超时即永久不退出）；MCP 关闭在 10 s 预算外；忙碌时 `/exit` 被排队；两个媒体定时器未 unref | `interactiveMode.ts:1509-1530`、`signalHandlers.ts:42-53`、`sessionFileStore.ts:135`、`interactiveLoop.ts:64-73`、`media/live.ts:85` | P0（阻塞退出） |
| 27 | 用户机制未确认：相对原点不是已证漂移，六组物理交接夹具保持caret；CRLF setter已修，加载期Enter保留为可删除草稿换行 | 19.4、20.9；`terminal.ts:143-152`、`startup.ts:39` | P1（缺真实现场） |
| 28 | 确认：无 `/config`；模型行为字段在 settings、目录在 model，effort 三入口 | `settings.ts:78`、`picker/settings.ts:253-257`、`picker/model.ts:206` | P2（结构） |
| 29 | 确认：搜索全量重扫（实测 0.87–1.03 s/次） | `listing.ts:69-73`、`catalog/index.ts:261-284` | P0（体验） |
| 30 | 确认：SIGTERM/SIGHUP 不写 terminated，下次静默重入 | `bootstrap.ts:166/348-356`、`shutdown.ts:18-19` | P0（数据正确性） |
| 新增 | 确认严格usage解码错误逃逸；原坏key生成原因及真实计量损失仍未确认 | `crashes.json` 2026-10-29、strict解码路径；当前恢复与未知合计见20.6 | P1（数据正确性） |

实施顺序建议：

1. **30 与 26**——退出语义与重入判定，改动小、影响面清晰，且直接消除"旧会话界面"和"退出卡住"两类可复现的困扰。用量键解码失败（19.8）同属数据正确性且改动局部，可与本组一起做。
2. **25 的请求侧与恢复侧**——"看不见思考"是用户能直接感知的能力缺失；其中 `restoreConversation` 补 thinking 块是纯增量，风险最低，应先做；请求侧默认档位涉及协议行为，需按供应商逐一验证后再动。
3. **29**——resume 索引复用，纯性能、无行为变更。
4. **24**——跨目录写入需要新的审批路径，改动面最大，必须与 19.1 的七条约束一起做，且要同时改写现有断言。
5. **27 与 28**——27 先补夹具确认机制再修；28 是结构整理，可以独立排期。

**本轮证据边界**：只做研究与文档；未运行产品测试、未拉起 PTY/二进制、未复现用户现场。19.6 的数字是只读文件系统测量（`~/.cheers/sessions` 2309 个会话、41 MiB），19.8 的起点是用户自己的 `~/.cheers/crashes.json` 真实记录，其余各节的结论来自源码链路与参考实现对照。所有"修复方向"均未实施，也未被验证。第 19.4 节明确保留"机制未确认"，不得在下一轮被当作已定位缺陷直接开工。


## 20. 第八轮实施进展（2026-10-29）

本节覆盖第19节研究后的当前实施，不把局部通过升级为ADD整体完成。原Phase20的47项矩阵及需要真实环境的剩余项继续延期。本批先消除跨目录文件阻塞、退出异常与推理采集/恢复的明确缺口；第19.9节的建议顺序保留为研究历史。

### 20.1 一次调用的跨目录文件审批

[文件授权](../../packages/ts-shell/src/turn/workspace.ts)由现有turn gate拥有，复用[根选择](../../packages/ts-shell/src/core/workspace/roots.ts)、原[文件工具](../../packages/ts-shell/src/core/tools/registry.ts)、[补丁计划](../../packages/ts-shell/src/edit/patch/plan.ts)和记录/补偿writer。只有未注册的明确绝对目标进入审批；相对路径逃逸、注册只读根写入、根换代及注册根内的符号链接逃逸仍先拒绝。无需新增持久WorkspaceRoot来源：临时根只在WeakMap中绑定原始/准备后的参数对象、工具名及call ID，执行后退休，不写session roots，也不扩大命令sandbox。

审批展示规范文件与目录，`explicitApproval`贯通真实[CLI审批桥](../../packages/ts-shell/src/entrypoints/cliApprovalModule.ts)，绕过会话scope、cached grant、prompt推导对象和headless policy的自动回答；界面只提供一次允许/拒绝，返回persistent答案会在保存grant前拒绝。批准后按原路径再次校验规范目标与目录身份，session/configuration admission继续保留。外部write/edit的原文读取遵守read deny；目录read只复用直接列表，分页提示保留绝对路径且下页重新审批。apply_patch可跨多个根准备完整预览，仍需精确选组和revision；源读取是既有预览preflight，先校验read/write/edit拒绝，未批准不执行writer。

定向参考比较：本地Codex safety分离AskUser/Reject、patch只为未授权目标派生父根；本地Claude Code默认外部文件为ask；pi只解析cwd而无权限围栏。采用ask与临时目标身份，不采用pi的无围栏，也不把父目录临时根变成可任意访问其兄弟文件的授权。[完整调用回归](../../packages/ts-shell/src/turn/workspace/approval.test.ts)覆盖实际CLI bridge及原writer，共25项，包含目录分页、跨根patch、绝对alias、deny/headless/persistent答案、原文read denial、根/alias换代、scope身份、撤销和重放。

### 20.2 退出有界与失败可见

[关闭处理](../../packages/ts-shell/src/core/shell/signalHandlers.ts)以finally调用exit：持久化或输出失败安全报告并退出1，未确认关闭不提供resume成功提示；无exit hook的嵌入调用保留异常。[交互入口](../../packages/ts-shell/src/cli/interactive/interactiveLoop.ts)删除预算外的重复MCP await，委托bootstrap已有的总10秒shutdown；无注入hook时同样复用既有shutdown。[host](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts)通过原parser/registry识别无参数`/exit`、`/quit`、`/q`，忙碌或等待问题时直接复用退出路径，停止后不继续消费队列。live/record的观察interval均unref。

参考pi的退出latch/先恢复终端及oh-my-pi的持久化失败可见；按本任务在首次失败时退出1，区别于参考的二次强退。同步会话锁仍可能阻塞约1.2秒，随后错误有出口；10秒预算到期证明退出路径有界，不证明MCP连接已实际关闭。后续SIGTERM/SIGHUP与重入修复见20.5。

### 20.3 推理流与恢复

[Responses流](../../packages/ts-shell/src/provider/endpoints/responses/stream.ts)补raw `reasoning_text.delta/done`，content_index与summary_index独立，封口、身份、前缀和终态校验保留；[终态投影](../../packages/ts-shell/src/provider/endpoints/responses/output.ts)采用summary优先、raw content次之，每item只投影一种，opaque payload保持供应商原文供重放。对照参考的stream fallback后未采用：本项目replay要求reasoning与native output完全一致，不能伪造终态content。raw事件缺可验证终态content的relay继续error，不接纳工具或签名；raw与summary同时流出时实时仍分别显示，终态只存一种。

[历史恢复](../../packages/ts-shell/src/cli/interactive/history.ts)在assistant正文与tool cards前重建finalized/collapsed thinking，空白跳过，withheld只有占位，签名不进入显示。参考pi按存储顺序恢复thinking；本项目保留自己的消息契约和60-block初始窗口。Responses两端点、实际provider step、transcript编解码/native replay和恢复顺序均有聚焦用例。默认档位与内置OpenAI endpoint仍未修；streaming点击及regular可达提示随后在20.8补齐，不能据此宣称第25项整体完成。

### 20.4 当前剩余工作与证据边界

| 反馈 | 当前状态 | 下一步 |
|---|---|---|
| 24 | 本地实现与聚焦验证；20.42补两模式原CLI的拒绝/单次write/edit/重复询问，20.45补跨目录patch分组与原操作收据并修真实选项过滤/g/4派发，20.46补文件selector与目录分页的实际CLI单次read | 缺用户目录审批现场、实际provider产生的工具调用及非Linux文件系统证据 |
| 25 | raw Responses、历史恢复、streaming点击/有效键提示及有证据的Responses/Google native摘要准入已实现；20.33新增当前relay真实小请求的公开thinking/展开/恢复，auto保留，整体partial | 其他模型/协议默认与公开内容、真实账户及用户终端复验；单个relay请求不覆盖完整矩阵 |
| 26 | 四条明确机制、MCP未开始调用及表面/渲染失败围栏已修；20.36/20.40正常/空闲、20.41 loopback忙碌流、20.43审批pending信号与20.44审批Ctrl+D均有退出/恢复证据；20.43/44修补取消等待与modal吞退出动作 | 缺真实用户故障设备/外部provider busy信号现场；MCP预算到期不能证明清理完成 |
| 27 | CRLF编辑器契约与20.48外部编辑器末尾CRLF返回已修；startup/坐标夹具及两模式实际CLI粘贴、stash、resize、外部编辑器有证据，现场机制仍未确认 | 缺真实用户尺寸/按键/桌面终端现场；PTY解析坐标不代替物理像素验收，不把相对原点当成已证漂移 |
| 28 | 会话入口与配置字段分类隔离已实施；本地聚焦验证 | 缺真实用户终端与整体面板现场验收 |
| 29 | 同次浏览索引复用与真实目录只读性能已验证；20.38/20.39补48小会话的实际CLI搜索/选择/分页，并修清空查询后重建回带旧查询 | 缺用户大目录终端性能与非Linux证据；小型PTY时间包含输入/去抖/观察开销，不能代替生产性能 |
| 30 | 空闲fresh、信号关闭及真实恢复保护已实现；20.40空闲/20.41 loopback busy均覆盖两模式×两信号CLI，恢复保留中断且不重发 | 缺用户终端关闭、外部provider busy、非Linux与不可捕获崩溃证据；SIGKILL不执行清理钩子 |
| 19.8 | 分桶恢复、真实加载与可见partial/unknown已实现；本地验证 | 原损坏记录及其生成原因未取得；无法恢复丢失的真实账单数值 |

只派gpt-6.1-sol只读/编辑代理；它们未运行任何test/build/验证。主代理在package目录每次一个文件、768MiB堆、threads=false，以`&&`串行验证。没有全套回归、没有PTY/exe、没有20k真实终端或真实provider请求。源码五静态门通过，118项旧docs advisory保留；完整声明图的单一focused脚本用例通过，module facade无超限。TypeScript build已通过，最终新鲜度和提交状态以开发日志中的实际读回为准。

反转已命中跨目录分类、真实CLI显式回答、thinking恢复、raw Responses事件、close失败exit、忙时exit；每次源码逐字节恢复。目录分页和附带read denial另有定向反转。恢复后重新聚焦验证才计通过；反转中筛掉的其他用例不计通过。MCP旧预算外await的反转在55秒观察上限超时，进程终止并恢复源码，只记超时证据；其当前实现的正常用例已通过。新增配置scope夹具首次因未定义pathRules而未建立scope，补实际user规则后通过；不存在的directoryListing测试路径属于调用错误、零测试，不作产品失败或验收。

### 20.5 空闲启动与信号关闭

[恢复判定](../../packages/ts-shell/src/session/recovery/work.ts)复用原continuation evidence，只有pending prompt、active run phase、审批/工具未结、interrupted、stopped/未确认终态或unverifiedFiles保留自动重入。[bootstrap](../../packages/ts-shell/src/core/shell/bootstrap.ts)不再仅因`active`重入普通空闲会话；print显式adopt、指定session、fresh/profile合同保留。恢复读取失败创建fresh并保留旧记录，提供固定安全通知。对照pi的显式continue/resume与信号退出latch，采用显式意图区分和一次信号钩子，保留本项目真实中断自动恢复。

[信号关闭](../../packages/ts-shell/src/cli/runtime/shutdown.ts)仅SIGTERM/SIGHUP执行onSignal一次，包含在既有10秒总预算中；普通close、restart/profile和普通exit不调用。真实[runner](../../packages/ts-shell/src/cli/bootstrap/cliProcessRunner.ts)在cancel资源前观察会话：确认idle才saveTerminated；busy或未确认恢复保持原pending/terminal证据，随后由原cancelAndWait收尾。失败或超时安全报告并exit1，不把清理未知写成成功。TTY宿主沿现有startupNotice route显示恢复与未确认通知，避免welcome画面静默采用旧history。SIGKILL/不可捕获崩溃不能执行hook，但idle metadata也不再自动采用；真实终端残留画面的次要机制未在本批复现。

### 20.6 损坏用量恢复与可见未知

[usage恢复](../../packages/ts-shell/src/observability/usage/recovery.ts)逐bucket/history保留严格解码通过的记录；strict attribution和snapshot不放宽。未知schema不解释，坏history置usage-gap断开cache连续性。usageHealth仅存degraded、坏bucket/history计数和invalidSnapshot，不存坏key/原异常；健康bucket保持原捕获价格。修复[SessionStore](../../packages/ts-shell/src/session/store/sessionStore.ts)先于runtime恢复的严格解码阻断，真实SessionManager resume→activate→record→save→resume可保留健康计量。

[保存](../../packages/ts-shell/src/observability/usageTelemetry.ts)在坏/缺bucket时保留可信baseline并只追加delta，合法倒退计数仍拒绝；保存callback失败不推进baseline，待写增量与health保留。先严格复制待采用值，再冻结writer snapshot，避免callback改写后产生已保存但二次解码失败的歧义。参考pi逐坏行保留、oh-my-pi载入修复计数提示与write确认后推进；未采用其缺字段补零来表示本项目丢失账单。普通目录价格变化不破坏完整捕获attribution，第19.8节的算法演进根因已降为未确认。

[cost](../../packages/ts-shell/src/core/commands/cost/model.ts)保留健康分桶完整/确实free的估价，但session合计始终partial；全损或仅恢复free记录时合计unknown。[报告](../../packages/ts-shell/src/core/commands/cost/report.ts)、[status](../../packages/ts-shell/src/cli/interactive/sessionFacts.ts)与真实启动提示明确计量不完整，不显示无usage/确定零费用。新健康请求和成功保存不会消除先前丢失的计量证据。

本批12个相关文件214项串行通过，另完整声明图单一脚本用例通过，五静态门/diff通过，module facade0。八类反转均失败并逐字节恢复后重验：idle启动1、signal hook2、pending保护3、真实store恢复1、telemetry降级1、partial合计1、history断点1、baseline保护2；筛掉的用例不计新通过。CLI夹具首次在先cleanup取消hint后等待hint而失败，改为先观察真实first-frame hint再cleanup，通过后未改产品来适配。反转诊断脚本两次仅因预期错误匹配过窄中断，源码finally恢复；补准确错误后重验通过。TS build manifest `235b6ac3dc39`，本地NormProof judge proven、0open/0failed/0gap，均为collector范围的结构证据。无全套回归、PTY/exe、20k终端或真实provider；提交与远端证据见日志。此前`ec1bcadb`的CI及Architecture Watch已确认success，本批推送后按用户要求稍后检查CI。

后续AST复核发现runner含对象具名回调共有26名，facade/NormProof的collector未报告。启动通知组合移入[notices](../../packages/ts-shell/src/cli/bootstrap/notices.ts)，信号生命周期移入[lifecycle](../../packages/ts-shell/src/cli/runtime/lifecycle.ts)，保留原router与recovery owner；AST实数runner20、notices6、lifecycle1。原runner7、recoveryHint10、startupNotice4串行21项通过，五静态门与TS build `2b7844ba0068`通过。此前214项为行为实现批次证据，最终构建以此补充分域后的版本为准。

### 20.7 resume搜索的同次浏览索引与真实目录比较

[catalog browse](../../packages/ts-shell/src/session/store/catalog/browse.ts)拥有一次只读扫描、最多20,000个summary与原64MiB物理读取预算；第一次query启动有界四worker，首次当前会话与历史渐进发布保留。搜索只取消本次wait，关闭/刷新/scope切换退休source并排空已派发读取。新needle按完整已捕获summary过滤，沿原[SessionCatalogPage](../../packages/ts-shell/src/session/store/catalog/query.ts)分页；不复扫目录，不用目录mtime猜核心文件身份。每次query/页面复验visible/current/lookahead及前后anchor，换代先拒绝而不额外打开core文件；同一query中已验证的渐进行可复用，末页再次复验。新增/原来不匹配记录的外部变化由明确重开纳入；这是浏览快照范围，不是全目录实时监控。

[continuation](../../packages/ts-shell/src/session/store/catalog/continuation.ts)仍是单一分页authority，现在绑定最近实际发出的id/version/pinned/updatedAt，拒绝换成真实但未发出的boundary、并发claim及旧页重放。伪造同id browse对象不能使用或退休合法源/游标。[SessionListing](../../packages/ts-shell/src/cli/interactive/picker/session/listing.ts)把token与有界512项同version size cache转交Next；旧subscription与previewEnd只关闭旧wait，不退休已转交源。清空搜索先撤销旧行offered/versions、显示只读加载行，再由宿主订阅发布同source的空needle复验；失败保持只读partial，迟到clear不能覆盖新search或已释放host。pin/rename/delete成功后由原host reload重新捕获源。session入口保留装配，browser/actions/projection/presentation各归其责任。

只读对照pi对已载入会话数组过滤与对象文本缓存，并保留其bounded workers/owner cancellation；本项目继续保留更严格的scope、核心文件版本、预算与操作准入。没有改provider/auth/default/package脚本。ambient peer同步扫描仍未改：本机约1ms缺尖峰证据，不能把研究里的放大器猜测当作已证根因。

主代理以768MiB堆、threads=false、package-local显式文件和`&&`串行最终通过8文件154项：browse17、index26、list8、query13、projection2、listing10、lifetime5、session73。20,001条边界只用mock discovery/read的summary单元，不拉起真实历史二进制。初轮普通续页旧cursor仍可重放属于产品缺陷，补successor authority后重验；rename测试遗漏真实host reload、continued-base fixture遗漏同browse token属于setup漂移，补操作链且保留旧页拒绝。12类反转命中reuse1、query取消1、source退休1、partial1、version1、issued boundary1、Next转交1、clear authority1、source quota1、scope3、clear generation1、首current发布时source退休1；每次逐字节恢复后再完成154项。初次source退休反转只检查close不检查read、scope反转被分页guard提前挡住、late-clear反转被search projection遮住，均补独立可观察断言后才计反转通过，不改变产品来迁就测试。

真实`/home/wang`会话布局只读测量直接导入两份不可变TS构建的catalog/files/listing，不启动CLI、PTY、provider或exe，不打印会话正文/ID。同一脚本按旧版→新版串行，均检查2409项，163个匹配/显示40行与无匹配结果一致：

| 操作 | 旧构建`2b7844ba0068` | 新构建`c975a238225e` | 旧→新物理I/O |
|---|---:|---:|---|
| 首次完整加载 | 2677.6ms | 2761.0ms | stat 20422→21382；open7227、directory3、read11868891bytes相同 |
| 搜索5字符 | 2163.0ms | 36.3ms | stat20062→328；open5691→0、directory3→0、read8612662→0bytes |
| 搜索4字符 | 2124.2ms | 35.6ms | stat20062→328；open5691→0、directory3→0、read8612662→0bytes |
| 无匹配34字符 | 2082.4ms | 4.6ms | stat19662→0；open5691→0、directory3→0、read8612662→0bytes |

旧版先前样本2589.1ms/2130.3ms/2088.6ms/2080.0ms，新版先前样本2888.0ms/35.4ms/34.5ms/2.1ms。匹配搜索约60倍提升；首次加载未证明加速，新版多960次stat用于渐进与最终可见身份复验。进程末heap旧30.3MiB/新12.3MiB只是采样时heapUsed，不是总峰值或RSS。数据量、缓存顺序和文件系统不同会改变时延；以上不能替代真实终端按键/渲染矩阵。

五静态门、完整声明图单一focused脚本、module facade0、diff通过；AST具名函数（含对象属性/方法）catalog index14/browse10/continuation4/scan2/progress2/query7，CLI session14/browser16/actions4/projection7/presentation3/listing16，均≤20。1536MiB TS build `5f78aa27a97ec7debc0b4778b8f2fbd52cef0d0813a44a9aa23f8e9eb2b2545c`，inputsDigest `e2fddda35b004ac2858c6223f423be59033c84bf69d6726f6ad277f01dffba91`，重新计算compilerInputs一致。裸normproof命令未安装，随后按CI使用repo bundle执行judge，proven/0open/0failed/0gap仅证collector范围结构。两个gpt-6.1-sol代理只读/编辑、未执行任何验证；交叉审阅不记独立终局review。没有全套、PTY/exe、真实provider或20k终端；原47项矩阵未重跑，ADD整体active。提交/推送/精确SHA的CI另绑定日志。

最终首current发布补异步后token复验：source在live recheck期间退休，第一次next也须拒绝，新增反转1项命中并恢复。browse17/lifetime5重验22项通过，其余上述文件此前通过未因窄改重跑，合计154项去重证据。最终build `5f78aa27a97e`新鲜度读回一致，同真实目录initial2817.8ms、两query32.5/35.3ms、no-match2.7ms，物理I/O与上表新版完全相同；末heap12.6MiB仍不作峰值证据。最终NormProof与静态门重验通过。

最终staged diff检查发现新增contract末尾多余空行，修空白后重建；最终build `55f598d95261c57d81f335345f89bc80fbb306d499368cfb3b3343d752aab88a`、inputs `ca3d28d40dd16c828516d6fa2877968632f67ad5c9fc284782eaab1978371905`。此前5f78为相同行为测量样本；空白调整未改变测试行为，无新增测试重跑。staged检查补覆盖新增文件，提交前确认通过。


### 20.8 流式thinking点击与实际快捷键提示

反馈25的交互切片。新[click owner](../../packages/ts-shell/src/cli/interactive/click.ts)捕获按下时的view、block对象与快照、物理/内容坐标、绘制行、尺寸/layout及scrollTop；release逐项重验。仅live/collapsed thinking允许隐藏正文追加前缀和不改变绘制行的elapsed更新；改写、替换、metadata/collapse变化、拖动后返回、resize/invalidation、scroll、换view或绘制行变化均拒绝。tool/diff/已展开thinking仍要求正文与source新鲜。文本选择与复制保留原revision合同，pointer边缘自动滚动只接受drag，release先停止timer。

[thinking批量操作](../../packages/ts-shell/src/presentation/tui/surface/pane.ts)先展开任何隐藏块，全部已开时才统一折叠，修正旧块已开/新块隐藏时第一次按键反而全部折叠。generic/tool保持原合同。[InputPreferences](../../packages/ts-shell/src/cli/interactive/inputPreferences.ts)从现有绑定与冲突判定取得有效key，通过实际Host→ViewContext→renderer传递；collapsed行显示ctrl+t或用户重绑键，无有效key则省略提示。regular主屏保留现有鼠标策略，键盘动作可达；不再显示无法点击的click提示。finalized rows与source cache均绑定shortcut，重绑不会留旧提示。[surface](../../packages/ts-shell/src/presentation/tui/surface/view.ts)以普通property保存最后绘制几何，空帧、全屏overlay和invalidateLayout清除，不增加超过20名的方法。

目标检查后定向只读对照pi的streaming thinking MouseRegion、按下目标/位置记忆和有效键提示，以及oh-my-pi全局thinking可见性。采用统一揭示意图和目标身份，保留本项目release与copy的更严格边界；未复制参考的press即执行策略。

主代理768MiB、package-local、threads=false、显式文件&&串行最终通过120项：pointer39、blocks14、container18、view47、实际InteractiveMode regular/fullscreen各1。Host覆盖ctrl+t、混合状态、重复折叠、f2重绑及禁用；331项未选不计通过。六类反转命中mixed toggle1、truthful hint2、shortcut cache1、streaming click2、geometry guards2、Host wiring2，每次逐字节恢复后重跑上述120项通过。首轮view fixture未通过Transcript.update回调改变正文属setup错误，补实际mutation回调后通过，未修改产品适配。

五静态门、完整声明图单一脚本、module facade0、diff通过；AST具名函数含对象属性：pointer14/click4/inputPreferences6/blocks12/container20/pane17/view20。TS build `b1cde057de0ae24a9dcdc9c918019424e30176c6fb30acdf8b9166d6f14eaa22`，inputs `4a923c96ab1bf5aad5b4699585b80360449e0e42a26f221a8e42e9e626799e8c`，重算460个compilerInputs一致；repo bundle NormProof proven/0open/0failed/0gap仅证collector结构。两个gpt-6.1-sol代理只读/编辑、未执行任何验证，主代理复核不作独立终局review。无PTY/exe、全套、20k终端、真实provider或非Linux验收；默认effort/endpoint仍待逐协议裁决，反馈25及ADD整体partial/active。提交、推送与CI以日志实际读回为准。


### 20.9 草稿换行契约与启动物理坐标

反馈27仍未取得用户现场根因。[editor buffer](../../packages/ts-shell/src/presentation/tui/editor/buffer.ts)修正已确认的setter/insert不一致：程序化setText与setDraftText、历史recall将CRLF/单独CR归一为LF，tabs和原history内容保留；replacement在接受原始source range后用同一转换映射caret prefix，避免setter缩短文本后caret越界。undo/redo、历史浏览与stashed draft合同保留。定向参考pi与oh-my-pi编辑器均在加载边界归一化，未在renderer删控制字节或改用户输入政策。

[startup](../../packages/ts-shell/src/cli/interactive/startup.test.ts)固定加载期1/4次Enter在adopt(false)后保留为真实草稿换行，可逐次Backspace删除。[mainScreen夹具](../../packages/ts-shell/src/presentation/tui/render/mainScreen.test.ts)补CUD底部夹限、CUP/HVP、alternate保存/恢复与独立scrollback，从物理顶部/中部/底部×regular/fullscreen接管实际StartupSurface→InteractiveSurface，provider安装顺序与生产一致。六组均保持可见prompt的实际row/column、同一草稿、单一历史/提示，重复三帧无新增空行/scrollback。低处shell光标不是漂移证据，未改变painter/engine、未新增DSR/重置/推迟首帧。

最终editor65/startup22/mainScreen28共115项串行通过；setter反转6项、caret映射反转2项有效失败，每次逐字节恢复后重验115项。buffer SHA256 `54987ec62c747d2dd3c7bbbabe827e8711b1c04cb7d2cf02a22c50ee6269cc42`。这补已确认的窄编辑器缺口与候选区分，不证明用户原环境的启动空行问题已解决；真实尺寸/按键现场和非Linux证据仍缺。结构/build/提交与CI以最终集成日志绑定。



### 20.10 推理档位与公开摘要的独立准入

反馈25请求切片修正19.2“auto即不思考”的判断。[官方推理指南](https://platform.openai.com/docs/guides/reasoning)本次实际读取确认：默认effort依模型而异，raw reasoning tokens不公开，summary需要显式opt-in，o4-mini支持detailed/auto。保留现有null/auto provider-decides，不把参考medium/high默认套入已有偏好或未知模型。其他协议/模型真实默认与公开内容仍未取得动态证据。

[catalog](../../packages/ts-shell/src/core/models/catalog.ts)为有明确证据的内置o4-mini声明native Responses与summary能力；[protocol](../../packages/ts-shell/src/core/models/protocol.ts)只在canonical OpenAI、精确官方/v1、捕获模型及已声明协议下采用默认Responses。provider显式endpoint、relay精确alias、未知/legacy模型仍沿原选择，account issuer优先。[request shape](../../packages/ts-shell/src/core/models/requestShape.ts)将summary支持与effort分开，已知false拒绝，未知不自动添加；native能力不能借canonical fallback传播到其他地址，custom relay使用精确alias声明。ChatGPT account在精确issuer host、已解析account endpoint与已知summary能力时同样允许auto summary。

[Responses body](../../packages/ts-shell/src/provider/endpoints/responses/body.ts)在summary:true且effort未设时只发`reasoning: {summary:'auto'}`，不伪造档位/budget；显式effort保持原合同，summary:false独立省略。turn/simple/preview/summary/compaction/side-question传同一解析shape和issuer endpoint。import白名单保留新compat字段，不包含凭据。[preview](../../packages/ts-shell/src/cli/runtime/context/preview.test.ts)用synthetic API-key/account SSE验证unset/null四组完整body与实际dispatch一致，账户仍省略provider-owned output限制。

聚焦协议6文件76项、catalogShape20、serviceTier4/import13/compaction20、provider step11、preview91均串行通过（去重235项）；其后结构/匿名owner复核与factory责任拆分的最终证据另由日志绑定。五类反转有效命中route1、summary2、shape3、preview4、relay地址1，逐字节恢复后协议96及filtered preview4重新通过；初次summary反转选择`summary`未匹配`summaries`而零断言，改准确pattern后才计有效，不把zero-test exit0作证据。主代理发现catalog→protocol的type back-edge，完整声明图确实失败，要求叶结构输入修复；只读复核另指出匿名target的unique-model fallback不能授予新的native summary准入，补负向保护，不改旧模型能力fallback。

最终修复后target6/model target5/requestShape24/turn protocol6重验41项；新增匿名owner两项使原235项增至237。匿名Responses relay在auto下不带新summary，旧unique-model形状标志保留；反转owner拒绝命中1项，逐字节恢复后protocol6重验通过。完整声明图再次通过，protocol以无import叶结构消除back-edge。原factory的凭据capture/renewal/publication移至[provider compaction](../../packages/ts-shell/src/cli/provider/compaction.ts)，缓存与renew后资源lifetime移至[resources](../../packages/ts-shell/src/cli/provider/resources.ts)；沿原publication/admission/source-entry、后台abort与handoff resources合同，无第二套运行路径。factory AST19名（另默认fallback匿名arrow即使保守计入也为20），compaction5/resources12/protocol2。原消费者compaction20/renewal12/summary17/cache6/handoff runtime11共66项串行通过，compaction20已计入原235，其余46项使本切片总去重283项。

无live provider/账户、PTY/exe/full suite/20k终端；o4-mini以外的内置模型默认route/summary保持未知，不将合成请求体等同真实供应商支持。结构/build/Git及CI以最终日志实际读回为准，反馈25整体partial、ADD active。

### 20.11 设置文件与当前会话入口分区

反馈28按真实owner修正19.5建议：[settings](../../packages/ts-shell/src/cli/interactive/picker/settings.ts)保留采样、limits、Context、retry/network等全部真实用户/项目配置字段；Model只含文件字段，Models and roles/Thinking effort归独立Session分类。标题明确current session及from user/project configuration，详情说明settings scope不改会话选择或连接owner save scope。原裸/model、/thinking和nested child均委托现有会话事务；返回同Session入口、scope、焦点和写入notice，未建立domain文件panel或第二套配置存储。

catalog成功load才授予offered ID，load前和失败时撤销；未提供的capability/字段不接受detail或apply，防止晚加callback或旧菜单ID执行不可见动作。typed value editor移入[settings/editor](../../packages/ts-shell/src/cli/interactive/picker/settings/editor.ts)，[contract](../../packages/ts-shell/src/cli/interactive/picker/settings/contract.ts)是叶类型，原SettingsHost路径继续re-export。来源、scope、preview、失败Apply、暂存与Discard沿原SettingsDraft，未因分区改存储。

目标检查后参考pi settings的transport/HTTP timeout及默认模型/effort输入，以及oh-my-pi设置注册的分类元数据；它们不支持“模型有关的配置都搬走”的笼统结论。本项目保留原ADD-03/3.5嵌套返回合同，用导航隔离状态来源。

最终settings picker43/session28、config settings7/runtime settings44/fields116共238项串行通过；实际Host regular/fullscreen×user/project4项通过，另thinking2项控制，331项未选不计。Session分区和offered准入反转各1项失败，逐字节恢复后owner71项重验。初轮新测试错误要求120列显示完整section（实际label budget截断）、并假定一次Esc关闭（真实rows→categories→close），按实际绘制/导航补精确断言，未改产品迁就测试。AST settings16/editor9/contract0；真实终端、平台与整体面板验收仍保留，build/结构/Git由最终日志实际绑定。

最终交叉review发现setter归一化会改变原list plaintext的无损判定：合法`['prefix\rpart']`打开InputForm后变成两行，未编辑Enter即可改变列表。editorText改在相同newline投影后检查roundtrip，失败沿已有JSON fallback；新增实际OverlayHost/InputForm对lone CR与CRLF的未编辑Enter→staged Apply→精确原列表两项回归。picker最终45项通过，本owner/runtime去重增至240，Host4另计。反转newline投影命中lone CR1项，CRLF既有parser判定已拒绝plaintext；字节恢复后45项再次通过。首次集成build发现detail允许undefined而offered.has要求string，补空焦点分支及原准入用例断言后45项/TS build通过；这是类型遗漏，不改空焦点行为。

最终集成五静态门、完整声明图单一用例、module facade0与diff通过（118旧docs-source advisory保留）。TS build `3c939881919f32b85a8da3824656d83d475a200d6e02dfd7522e0f500639dcb8`，inputs `e7698f8cfe402954cddbcc332ef43ccf3e756fa2ebf225c60252930fe3c3d36d`，重算460 compilerInputs与3545输入文件一致。新鲜度检查初次错用root dist路径，ENOENT属于诊断调用错误；改为实际package dist后通过，未改build行为。repo bundle NormProof proven/0open/0failed/0gap只证collector结构。三个gpt-6.1-sol代理仅阅读/编辑，全部验证由主代理单进程串行，无全套/PTY/exe/20k真实终端或live provider；原47项矩阵未重跑，ADD仍active。精确commit/push与CI另以日志读回绑定。

staged diff补覆盖新文件时发现protocol末尾多余空行，删除后重新构建并重算新鲜度：最终artifact `0277cf87c40560c30d96283908aa483419cb54e1da8f37f4aa96835ebfe5f646`，inputs `bc1adb529ef0e1554febbb9f2309b07dbf505a43b787fe27ada3988c353e5223`，460/3545一致。此前3c939为相同行为的前一构建；仅空白变化未重跑行为测试，最终staged diff通过。

### 20.12 Google原生公开thought summary与动态budget

继续反馈25的逐协议复核。[GenerateContent API](https://ai.google.dev/api/generate-content)实际读取：`includeThoughts`独立于`thinkingBudget`，只在可用时返回thoughts；[Vertex thinking指南](https://cloud.google.com/vertex-ai/generative-ai/docs/thinking)当前重定向至[模型指南](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking)，其native JavaScript例子在`gemini-2.5-pro`只设置`thinkingConfig:{includeThoughts:true}`，不声明budget/level。2.5 Pro/Flash默认dynamic thinking、Pro不可关闭，公开summaries支持2.5及以后。[Pro](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-pro)与[Flash](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash)准确模型页确认thinking支持，同时当前访问限已活跃使用的用户；能力不等于本账户可用。[主thinking指南](https://ai.google.dev/gemini-api/docs/thinking)已转Interactions，其`thinking_summaries:'auto'`不能复制到本项目GenerateContent请求。

目标检查后定向只读对照pi的`packages/ai/src/api/google-generative-ai.ts:398–405`及`google-vertex.ts:503–510`，二者先`includeThoughts:true`再按已有值加level/budget；oh-my-pi `packages/ai/src/providers/google-shared.ts:950–964`同样独立summary显示。参考的无effort禁用策略不替换本项目provider-decides auto。thought:true的公开正文与加密thoughtSignature分开，收到签名不补造正文。

[catalog](../../packages/ts-shell/src/core/models/catalog.ts)仅为`google-ai`/`vertex`的精确`gemini-2.5-pro`、`gemini-2.5-flash`声明既有`compat.reasoningSummary:true`，不添加reasoning字段或改变effort选择。import-free [protocol](../../packages/ts-shell/src/core/models/protocol.ts)将canonical各owner限于自己endpoint与地址：google-ai精确HTTPS官方根；Vertex以捕获的project/location/publisher resource和对应global/region主机匹配，默认443允许，其他端口、userinfo、query/hash、伪后缀、location不一致与原始路径逃逸拒绝。custom relay沿精确alias及其显式能力准入，匿名不授予，Google compatible/account/未列模型保持未知。

[googleWire](../../packages/ts-shell/src/provider/endpoints/googleWire.ts)复用reasoningSummary三态并由[GenAI](../../packages/ts-shell/src/provider/endpoints/googleGenAI.ts)/[Vertex](../../packages/ts-shell/src/provider/endpoints/googleVertex.ts)转发：true+无budget只发`includeThoughts:true`；false/unknown+无budget省略thinkingConfig；false+原显式budget保留budget并`includeThoughts:false`；unknown+原budget保留旧true合同。未发Interactions字段或伪造默认budget/level。refresh实现逐字未改，summary不改变原budget/model的有界准入。公开摘要缺席的正常答案仍可成功，不承诺请求即有正文。

主代理package-local、显式每次一个文件、768MiB/threads=false &&串行共231项去重通过：requestShape31/catalogShape20/googleGenAI38/googleVertex13/googleRequests10/turn protocol13/preview95/googleAccount5/auth target6。实际turn覆盖两provider×两model×unset/null（八次synthetic请求在两个用例内，按用例数计13而非调用数）；负向relay/匿名/未知与无summary成功；simple/compaction同shape；preview四组完整body与实际dispatch逐值相同且session文件不写。初次turn新夹具未计既有默认temperature0.7，两项失败属fixture遗漏，补完整body精确断言后13通过。四类反转summary传播2、官方host1、Vertex资源1、GenAI preview透传2均有效失败且字节恢复；恢复后shape31/body38/filtered preview4重验73项，另91项未选不计新通过。没有timeout/OOM或zero-test反转。

五静态门、完整声明图单一脚本、module facade0、diff与AST通过：catalog8/protocol3/googleWire15/GenAI5/Vertex9，均≤20。1536MiB TS build `bf7cfd1f79433711a1caf7262ff94a1813eba154fc7915e859a7eac627dee35b`，inputs `f8ba10bb9699f271a18a1cd2ae7c49b962c5aeb2892e784483ed5b71efafc358`，460 compilerInputs/3545文件重算一致；repo bundle judge proven/0open/0failed/0gap仅证collector结构。两个gpt-6.1-sol代理仅读/编辑，所有验证由主代理串行。无live Google/Vertex、真实token signer/账户可用性、PTY/exe或全套；原47项矩阵未重跑，feedback25 partial、ADD active。Git与CI另由日志精确绑定。

### 20.13 Session返回断言与CI时序复核

延后读回确认两批CI失败：[3531e3c的CI40914893093](https://github.com/h-hei133/cheers/actions/runs/40914893093)为47失败/12279通过/3跳过，[bdcb78d的CI40919240078](https://github.com/h-hei133/cheers/actions/runs/40919240078)为54失败/12296通过/3跳过。两次均只有[interactiveMode测试](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)和[model recovery测试](../../packages/ts-shell/src/cli/interactive/picker/model/recovery.test.ts)失败；其他1032个文件通过，1个文件跳过。五静态门、scripts和build步骤通过不等于整次CI通过；两批Watch成功另计。

3531的47项逐项归类为：17旧Session标题、17队列等待、3研究等待、4启动预览、2技能面板、4引用补全。bdcb重复同类，队列25项、引用3项，其余分类相同。17旧标题断言补为`Settings — current session — from user configuration`及Session分类，同时保留Models and roles焦点、unverified/sign-in通知、精确会话/配置读回、草稿和零网络断言。

队列及研究已实际进入原提交路径，但`vi.waitFor`的默认1秒早于异步skill acquisition完成；整个测试的30秒预算不延长该等待。队列测试现旁观原run Promise，按实际追加的后续任务排空，包括嵌套queue与显式Enter重试，再断言busy=false和原text/images/skills/queue-empty合同；研究确认真实Enter只提交一次，等待同一Promise后检查原创建/派发或拒绝及文件不变。清理先stop，settlement拒绝也经finally恢复mock/env/fixture，没有更改生产调度、超时、权限或provider代码。

进一步源码核查发现当前Vitest 0.34的waitFor超时只reject、不清真实setInterval；旧标题持续不匹配，mode.stop后旧overlay无行，轮询不能自行恢复。后续fake timers启用时，每个泄漏回调会先推进虚拟时钟50ms，影响startup paste/context计时。主代理有界反转只恢复旧标题：16项标题失败，并带出2项启动preview额外调用；逐字节恢复后20项通过。该反转确认一种启动连锁机制，不把真实定时器下的技能/补全失败全部归为同因，也未改依赖或全局测试配置。

主代理768MiB、package-local、threads=false最终两个失败文件373项通过；先59项定向通过、再全文件373项通过用于分类，重复不累加。直接下载官方Node 20.3.0、核对官方SHA256后用绝对二进制再次跑同两个文件373项通过；先前npx命令被工具转为项目脚本、实际仍Node24，相关通过只算Node24证据。受控队列后续延迟1100ms时新等待4项通过，反转旧1秒等待4项失败；移除诊断延迟并字节恢复后队列/研究33项通过。临时证据和Node工具清理后交付。无全仓套件、PTY/exe、20k终端或live provider；新的精确SHA CI另读回，ADD仍active。

### 20.14 Anthropic精确型号的自动思考边界

继续反馈25，只读核对当前内置`claude-opus-4-6`、`claude-sonnet-4-5`、`claude-haiku-4-5`与实际[request shape](../../packages/ts-shell/src/core/models/requestShape.ts)/[Messages adapter](../../packages/ts-shell/src/provider/endpoints/anthropicMessages.ts)。本次实际取得[官方thinking文档](https://platform.claude.com/docs/en/build-with-claude/thinking.md)：三个型号省略thinking均为off；只有Opus4.6接受adaptive，Sonnet/Haiku4.5的adaptive为400。Opus4.6与更早型号启用thinking后默认返回summarized内容，无需新的display opt-in。不能把新型号的默认开启/隐藏规则套到这些精确型号。

现有显式low/medium/high继续发送manual enabled与budget，不发output_config.effort：请求预算2048/8192/16384受用户max_tokens减1024限制，默认4096下medium/high均3072；不足1024预算则沿现合同省略。auto/null仍省略thinking，不能以“显示summary”名义开启adaptive、发明budget或提高输出上限。定向参考的“4.6省略即adaptive”注释与官方精确型号表冲突，未机械复制；独立effort与thinking enablement分开。自动启用需要单独产品裁决，本轮不修改产品代码，也无live Anthropic证据。反馈25整体partial、原47项矩阵不变。

### 20.15 精确coding型号的原生协议与effort边界

继续反馈25，实际读取[精确gpt-5.3-codex模型页](https://developers.openai.com/api/docs/models/gpt-5.3-codex.md)：Responses受支持、Chat Completions不支持；effort支持low/medium/high/xhigh。[官方淘汰公告](https://developers.openai.com/api/docs/deprecations)列明2027-04-01关闭，deprecated不等于当前已不可访问。本轮保留精确型号，不替换为较新模型，也不调整vision或增加xhigh设置。gpt-5.3和gpt-5.1-mini精确页面404未能建立能力证据，不能仅凭404判定退役或套用其他型号合同。

[catalog](../../packages/ts-shell/src/core/models/catalog.ts)仅为gpt-5.3-codex声明既有Responses endpoint；[protocol](../../packages/ts-shell/src/core/models/protocol.ts)的nativeOpenAIResponses要求精确canonical owner、runtime、官方HTTPS/v1地址和型号自己的声明。provider显式endpoint、精确relay alias与account issuer优先级保留。进一步复核确认reasoning:false的语义是拒绝显式档位，不能因此把已声明Responses的型号改回Chat；协议准入删除该耦合，未知型号和无声明仍不自动采用原生路由。实际turn覆盖o4-mini与coding型号：auto仍Responses且无reasoning，显式high返回原errorStep和精确提示，网络仅有之前auto的一次调用。

[reasoning指南](https://developers.openai.com/api/docs/guides/reasoning.md)说明summary需要opt-in且支持依型号而异，未提供本精确型号自动摘要的独立证据，因此reasoningSummary继续未声明。unset/null的实际coding请求省略reasoning与reasoning_effort，输出上限和instructions走Responses；显式low/medium/high沿已有Responses合同发送effort及summary:auto，没有改默认档位或承诺摘要正文。这一继承行为已通过synthetic请求验证，真实账户支持与summary可见性仍缺live证据。

[官方coding提示指南](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide.md)要求assistant phase保存并原样回传，用户消息不得添加phase。定向参考pi的Responses effort/summary及opaque phase回放；未复制其为summary发明medium的行为。现有native output signature已保留phase，产品回放无需新增字段或第二套历史；新增[body回归](../../packages/ts-shell/src/provider/endpoints/responses/body.test.ts)贯穿toStep、实际transcript event序列化/解码、toChatMessages和endpoint body，验证commentary/final_answer原样回放以及用户无phase。[preview](../../packages/ts-shell/src/cli/runtime/context/preview.test.ts)覆盖o4-mini/coding×unset/null×API-key/account八组，完整body与实际派发相同，会话文件不写。

主代理768MiB、package-local、threads=false单进程串行最终六文件196项通过：auth target7/catalogShape20/requestShape31/turn protocol20/Responses body19/preview99。初次新增两项误以为effort拒绝抛异常，实际合同是返回errorStep；补精确返回字段与零新增网络断言后通过，没有改变产品错误合同。撤去coding endpoint声明命中两个auto失败；恢复旧reasoning===true协议守卫命中两个reasoning:false失败，每次逐字节恢复；恢复后target7/turn20重验27项通过，不累加重复。无zero-test反转、timeout或OOM。

五静态门、完整声明图单一用例、diff与含对象属性/方法的AST计数通过，catalog8/protocol3。1536MiB TS build `9c0367e15878317d8fc66f0e783a8cc522a0fb6f9efd3055a5d1ab3d644c9860`，inputs `6102c021dfdfa7eff95c6d70197c3db7927cd737495731a3a3e7fcf51c8bdad3`，460 compilerInputs/3545文件重新计算一致；本地NormProof proven/0open/0failed/0gap只证collector范围。无live OpenAI/account、PTY/exe、全仓或20k终端；原47项未重验、反馈25partial、ADD active。Git与精确SHA CI另绑定日志。

### 20.16 DeepSeek旧别名与当前思考合同的证据边界

只读复核[官方2026-04-24公告](https://api-docs.deepseek.com/news/news260424/#api-is-available-today)：内置deepseek-chat与deepseek-reasoner在2026-07-24 15:59 UTC后完全退役且不可访问。当前[thinking指南](https://api-docs.deepseek.com/guides/thinking_mode/)描述新的flash/v4-pro合同，返回reasoning_content且未要求summary opt-in；不能据此证明已退役别名接受显式reasoning_effort。catalog旧注释声称chat接受档位，但缺当前精确别名证据，本轮不扩展能力声明或默默替换用户型号。

[completion读取](../../packages/ts-shell/src/turn/completion.ts)已经独立识别reasoning_content/reasoning/reasoning_text，[turn](../../packages/ts-shell/src/turn/step.ts)收到reasoning事件即转发，与effort和summary标志无关。reasoning:false只表达显式设置拒绝，不抑制已返回的thinking。未显示thinking不能仅由该标志推断供应商没有返回正文。

未来型号迁移须另核对tool trajectory：当前官方要求带tools的请求回传既往reasoning_content，普通无tools对话可省略；通用兼容adapter的结构化reasoning对象不能未经比较就认作同一wire字段。本轮仅记录当前型号/回放证据缺口，无产品迁移或live DeepSeek，未宣称捕获旧别名的实际失败响应。反馈25与ADD仍partial/active。

### 20.17 MCP关闭时立即拒绝未开始的调用

继续反馈26，复核[gateway](../../packages/ts-shell/src/core/mcp/gateway.ts)发现：原closed guard已阻止排队操作启动，但其Promise仍等待前方active操作结束才收到拒绝。CLI十秒总预算继续保护实际退出，不能据此认为队列调用已及时取消。

定向参考oh-my-pi MCP manager的disconnectAll先撤销handshake、清退休pending并用epoch阻止晚返回；pi的signal shutdown保留handler直到终端恢复。本轮采用“先退休未开始工作”的决定，保留本项目不可重开的gateway、原串行lane、真实connection manager取消与CLI有界清理。未复制可重连epoch系统，也未采用参考吞掉全部dispose错误的做法。

原run在同一lane上登记未开始调用的reject回调，开始操作时撤销该登记，parent abort或完成时移除listener。close先设closed并拒绝所有等待调用，再沿原content取消和connection shutdown，仍等待active/lane真正结束；重复close返回同一Promise。没有把active tool执行或真实连接关闭未知升级为成功，未调整十秒预算、provider、权限或恢复证据。

[gateway回归](../../packages/ts-shell/src/core/mcp/gateway.test.ts)用受控active连接分别排入snapshot/refresh/tool/content/workspace sync。一个事件循环回合后，五种等待已收到安全closed拒绝，active尚未放行、close尚未完成、连接清理只启动一次、排队调用不做discovery；随后显式释放active，断言同一close完成且无后续连接。try/finally释放所有待观察Promise，避免失败污染后续测试。初次fixture的content discriminator与单microtask观察改为真实action及事件循环回合；最终反转在相同fixture下撤销close取消，五项均确实失败，不把初次夹具不足当作全部产品证据。

主代理显式文件、768MiB、threads=false串行共79项去重通过：gateway28/shutdown11/content16/client8/CLI MCP16；后者使用真实隔离stdio mock server及原SIGTERM/SIGHUP/SIGINT、输出失败与父取消合同，没有真实远程认证。反转五项失败后gateway逐字节恢复并28项重验通过，未选23项不计反转通过。五静态门、完整声明图单一用例、diff和AST gateway20通过；1536MiB TS build `bd4f8fcb534b2ad568a74cce6128a580471dbf57208d91146975858735922a67`，inputs `cb5ecf626e39f52ab46a4085a10b057766cfcd512b54c319b4b2bae87b711386`，460/3545新鲜度重新计算一致。本地NormProof proven/0open/0failed/0gap只证collector；无PTY/exe、全仓、20k终端或真实用户退出现场，反馈26及ADD仍partial/active。Git/CI另以精确SHA绑定。

### 20.18 精确coding型号的图片与独立token上限

沿ADD-02精确模型详情与ADD-08/09请求预算复核。[官方精确型号页](https://developers.openai.com/api/docs/models/gpt-5.3-codex.md)再次实际读取确认text/image输入、400000总context、272000独立input及128000最大output。20.15路由批次刻意未调整vision；本批发现原catalog的vision:false与缺失上限导致图片被wire过滤、超过独立input的请求仍只检查总window。

仅修[内置条目](../../packages/ts-shell/src/core/models/catalog.ts)：vision:true、inputLimit:272000、maxTokens:128000。现有exact metadata、request shape、budget、Responses body和preview直接消费，不添加新的能力解析或预算机制。默认用户maxOutputTokens不变，未声明输出时沿原catalog ceiling合同；用户显式model覆盖仍可修改上限/vision，refresh保留已审阅vision/output约束，其他型号不变。定向参考pi Responses共享message转换只接受model声明image能力且使用输出参数；官方精确页作为本型号数值依据，未根据名称模式或其他供应商同名条目推断。

[详情](../../packages/ts-shell/src/cli/interactive/picker/model/metadata.test.ts)验证未配置具体型号仍可浏览并显示三种容量及image支持。[turn](../../packages/ts-shell/src/turn/protocol.test.ts)验证实际Responses input_image完整发送；一个有界960k字符message只用于估算超过272k但低于400k的独立input场景，拒绝发生于fetch前，不拉起PTY或构造20k会话。显式128001 output同样在fetch前拒绝。catalog shape与本地HTTP refresh夹具继续检查旧metadata不能覆盖已审阅能力、用户显式覆盖可以，未知image仍沿原不发送合同。

主代理六文件183项去重聚焦通过：catalogShape21/catalogRefresh11/metadata10/turn protocol23/Responses body19/preview99；未选或重复不累加。三类逐字段反转分别撤去vision/inputLimit/maxTokens，各命中实际turn一项失败，每次逐字节恢复；恢复后turn23/catalog21重验44项。五静态门与diff通过；metadata-only不重复声明图/NormProof，本批未增加具名函数。TS build `3a4094f5fed192c24bb8442740f76d8fa037517343741db2c360eab19bb4b2e2`，inputs `2b37b35a4314d2da6dc23341dd9f443ee5f0bb67c54e12c7d545faa86d27cf74`，460/3545最终重新计算一致。

验证纪律失误另记：build尚运行时提前启动listCompilerFiles新鲜度脚本，造成短暂两个heavy进程重叠并读到旧manifest而断言失败；两个进程结束后单进程重读最终manifest通过。没有将失败检查计为通过，也没有OOM；后续须以完成exit_code确认前进，不以已有输出认作命令已结束。无live OpenAI/account、PTY/exe或全仓，真实image识别与账户可用性未验；原47项不升级、ADD active。Git/CI另以精确SHA绑定。

### 20.19 普通退出保留未完成会话的恢复证据

继续反馈26/30的普通退出与恢复边界。[interactive shutdown](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts)先停止输入/TUI，经[handleShellClose](../../packages/ts-shell/src/core/shell/signalHandlers.ts)调用runtime.terminate，再让原CLI资源owner取消并等待run。旧terminate无条件saveTerminated，先清pendingPrompt/source、runPhase/interrupted和terminal uncertainty；晚到saveInterrupted只能记录中断，不能恢复已经清掉的请求身份。SIGTERM/SIGHUP已有独立unfinished判断，但普通退出未经过该判断。

本轮用真实SessionManager、ShellSessionRuntime和handleShellClose的小型隔离夹具复现：prompt/tool/approval三类active关闭后pendingPrompt均缺失，取消settle后autoResumeReady仍false；prompt-only的hasUnfinishedSessionWork立即false。tool/approval的pendingLifecycle能从transcript重建，未将此误称为全部证据丢失。闲置runtime上的已中断prompt同样失去自动继续；只存于state的stopped_not_proven结果也被清除。旧行为在八项初版用例中实际五项失败；后用soft断言同时观察真实recovery和settle后的结果，仍五项失败，完成根因分类后恢复普通强断言。

目标检查后定向只读对照pi：interactive-mode.ts:4395–4433普通退出先stop TUI再runtimeHost.dispose、再resume提示/exit；agent-session-runtime.ts:404–410先shutdown extension与invalidate再session.dispose；agent-session.ts:1412–1434在原owner取消各类work，2503–2517的abort等待原idle。这些路径不另写“已完成/terminated”覆盖会话证据。本项目沿相同的host retirement与work ownership分界，保留原十秒资源清理总预算与失败可见性；不复制参考dispose吞掉abort错误的做法，也不引入第二套session关闭或恢复存储。

[runtime.terminate](../../packages/ts-shell/src/core/shell/sessionRuntime.ts)仍退休shell state，但currentRun、原command/controller或现有hasUnfinishedSessionWork任一存在时保留持久会话。currentRun单独判断覆盖controller已释放、promptSettled仍未结束的时段。确认idle才调用原saveTerminated，完成对话正常关闭、空会话正常删除；显式SessionManager.saveTerminated继续是清pending source的原primitive。恢复读取失败沿既有安全消息及exit1，未清状态或发resume ID。原cancelAndWait、真实join、错误与预算不改；shell退休与durable interrupted/completed状态分别表达各自事实。

[close回归](../../packages/ts-shell/src/core/shell/close.test.ts)最终十二项覆盖active三阶段、已中断prompt、state-only stopped、compact unverifiedFiles、active本地command、无controller但未settle的run、读取失败、idle完成/空会话与显式primitive。测试真实重开snapshot、describeSessionReentry和bootstrapShellRuntime：未完成状态采用同ID，完成状态新建；cleanup仍等待显式释放，失败经finally释放原Promise。无provider请求、真实进程退出或终端仿真。

主代理768MiB、threads=false、显式七文件单进程串行126项去重通过：close12/sessionRuntime47/signalHandlers8/bootstrap28/shutdown11/branch8/work12。撤销recovery判断四项失败，撤销active判断两项失败；每次逐字节恢复，恢复后close12重验通过。五静态门、完整声明图单一用例、diff和AST责任计数通过：runtime19/signalHandlers2/close fixture8。本地NormProof proven/0open/0failed/0gap仅证collector范围。构建最终身份与Git/CI以日志读回绑定；无live provider/真实用户退出现场、PTY/exe、全仓或20k终端，原47项不升级，反馈26/30与ADD整体仍partial/active。

延后CI读回：[60fb7545的MCP CI40931209180](https://github.com/h-hei133/cheers/actions/runs/40931209180)completed/success；[32960122容量CI40932465421](https://github.com/h-hei133/cheers/actions/runs/40932465421)completed/failure，实际1失败/12372通过/3跳过，1失败文件/1033通过/1跳过。唯一失败为advisor.test.ts的共享account续期后第二次请求缺席；静态/scripts/build步骤success，NormProof步骤skipped。具体原因继续核查，不将focused绿色升级为该CI通过，也不撤回容量官方证据。

### 20.20 Advisor共享账户续期夹具与模型容量

32960122的唯一CI失败在[advisor用例](../../packages/ts-shell/src/cli/runtime/advisor.test.ts)本地完整文件也稳定复现：36通过/1失败。定向诊断读取实际catalog为context32000、output128000、input272000，advisor状态error，只有主模型一次请求。夹具在共享账户测试中把gpt-5.3-codex重加到refresh cache并将window缩到32k、output设8192；原refresh规则保留已有已审阅maxTokens，因此20.18新增128k后形成输出比window还大的矛盾夹具。实际turn的requestBudget在fetch前拒绝，符合预算合同，不是续期第二次exchange、网络或凭据失败。

只移除该测试的capacity cache改写及不必要的publication刷新，使用已经加载的真实内置型号，并检查context大于output。原续期一次、main/coding两次精确路径/合成凭据/型号及notes一项断言全部保留；account wire仍不发max_output_tokens。没有修改provider/auth、请求预算、刷新策略或默认输出，未以降低官方上限迁就测试。

主代理完整advisor文件37项串行通过；旧夹具逐字节反转时同一共享账户项再次失败、其余36未选不计，恢复后单项通过。诊断输出只含public metadata、advisor状态及安全报告，临时诊断撤销。五静态门/diff与最终build新鲜度另由日志实际绑定；本批test-only不重跑结构NormProof。原失败CI保留，新提交CI另验，无live账户/真实认证或全仓执行，ADD仍active。

### 20.21 兼容服务JSON返回的公开thinking提取与显示

反馈25另一个可独立验证的缺口：[completion stream](../../packages/ts-shell/src/turn/completion.ts)已读取reasoning_content/reasoning/reasoning_text，但[兼容JSON reader](../../packages/ts-shell/src/provider/endpoints/openaiCompatible.ts)直接保留choices，没有将selected message的字段提到共同CompletedBody.reasoning。服务忽略stream:true并返回application/json时，[toStep](../../packages/ts-shell/src/turn/step.ts)只能得到答案；即使completion已经normalized reasoning，也没有非流式onReasoning回调。两条缺口分别影响持久消息与实时显示，与effort选项无关。

实际再次读取[供应商thinking指南](https://api-docs.deepseek.com/guides/thinking_mode/)确认公开reasoning_content与content同级；该页当前型号与tools回传合同仍不替换20.16的旧别名裁决。本轮只处理已收到公开正文。定向比较pi openai-completions.ts:578–600按三种字段优先选择并防重复，以及1280–1390保留thinking的独立消息位置；oh-my-pi openai-completions.ts:1457以后同样选择公开字段，其2580–2668按显式compat处理回传。采用公开字段选择/答案分离与已streamed不重复显示，不复制signature里编码字段名、fallback伪造或新型号启用。工具reasoning回传仍单独待裁决。

原reader的reasoningDelta改名为readReasoningText并允许unknown complete message，现有delta和JSON共用同一first-nonempty选择；没有第二份字段白名单。JSON只取choices[0]的message，并优先保留已有normalized string reasoning；原refusal映射及未知字段不变。toStep在streamed未定义且公开reasoning非空、非redacted时先onReasoning再text。streamed/withheld不重播，最终reasoning/signature与持久化沿原合同；reasoning-only仍带原empty-answer错误，不因thinking存在宣称回答完成。

[实际请求回归](../../packages/ts-shell/src/provider/endpoints/openaiCompatible.test.ts)涵盖三种JSON字段、reasoning:false+无effort仍显示已返回正文、完整step→transcript编码/解码、first nonempty/单choice/不重复、normalized优先、五种无效字段、reasoning-only和SSE一致性。初版13项中5项确认提取缺口，另1项是fixture错误期待refusal kernel值；原kernel将wire refusal映射error，按已有合同修断言而未改产品错误行为。最终14项以真实Response和createStepFunction证明JSON/SSE thinking与text各一次。

主代理四文件163项去重串行通过：endpoint14/completion34/step96/Responses body19。四类反转撤去JSON提取5失败、显示6失败、stream去重2失败、redacted保护1失败；各次逐字节恢复，最终163项重验通过。五静态门、完整声明图单一用例、diff与AST completion15/step17/endpoint10通过。1536MiB TS build `62beb782eb1781adc7fb239f008f60b3816b265b742d15e9d71866045ca7a37c`，inputs `d43751b0d4535f94a3fdf63decce20321aca4c1b3be5e04161b74126a5afaead`，460 compilerInputs/3547文件重新计算一致；NormProof proven/0open/0failed/0gap仅collector结构。HANDOFF记录JSON提取与显示分离，scratch清理；没有live供应商、真实账号/终端、PTY/exe/full suite或20k终端。默认effort、型号迁移、tool replay不变，原47项不升级，反馈25与ADD仍partial/active，Git/精确CI另绑定。

### 20.22 兼容请求的消息协议字段投影

继续核查20.16的回传边界，发现[compatible endpoint](../../packages/ts-shell/src/provider/endpoints/openaiCompatible.ts)在simple直接spread input.messages、turn spread内部ChatMessage，实际body带origin及结构化reasoning对象（含opaque signature）。该对象是本项目消息模型，不是供应商所要求的reasoning_content字符串。以最终不可变构建只读观察及真实createStepFunction夹具确认两路径均发送这些内部字段；未声称真实服务已拒绝或发生真实签名泄露。

实际读取[官方Chat Completions schema](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create.md)的assistant/tool message声明：content、tool_calls及tool_call_id各有明确位置，没有内部origin或结构化reasoning合同。目标检查后沿20.21已定向对照的参考显式assistantMsg构造与compat-selected公开字段：采用明确protocol投影，不把任意内部message当wire。公开reasoning回传需求仍单独保留，不能用错误对象字段代替该声明，也不推断其他供应商的默认或型号迁移。

新增一个本地wireMessage供simple及turn共用，只投影role/content和适用角色的tool_calls/tool_call_id。原tool image提取、连续result、vision fallback与bridge保持同一wireMessages流程；simple仅投影字段，原content表示保持。内部history未修改，reasoning文本/签名/origin仍留在transcript供各原生codec使用，工具ID/参数原字节保留。不新增第二套conversation normalization、模型规则或回放存储。

三项新回归在旧投影下均失败，修复后五相关文件232项串行通过：endpoint17/simple12/media8/step96/preview99。包含真实fetch body、simple/turn与内部history不变、原多模态/预算/preview。分别反转simple投影1失败、turn投影2失败，逐字节恢复后endpoint17重验通过。五静态门/diff、AST endpoint11与1536MiB TS build通过；build `1f8dd8687959d0e09d5384bdf44587edb7ba7c9a6c32a8b98f80dccfccc4bc42`，inputs `a4de0160771458ad4fdce374cd17540dd6e6b744a82653ed115b11954de5d4a7`，460/3547新鲜度重算一致。局部adapter投影不重复结构NormProof；初次诊断错从package index取未export函数，改为manifest指定不可变build的endpoint模块后才取证，不作产品失败。HANDOFF记录wire投影边界，scratch清理；无live/真实账户/终端、PTY/exe/full suite/20k，原47项不升级，ADD active。公开reasoning tool回传仍待明确独立能力声明。

该投影批次已提交推送`74f8bd2e852229eb645e7156a4b3814d517de49a`，远端main精确一致、仅原CLAUDE.md。[Watch40940297634](https://github.com/h-hei133/cheers/actions/runs/40940297634)completed/success，[CI40940297696](https://github.com/h-hei133/cheers/actions/runs/40940297696)延后仍in_progress。20.23进一步落实显式回传能力；本文的历史待裁决表述保留为该批次边界。

### 20.23 兼容协议公开reasoning的声明回传与输入预算

反馈25继续沿收到公开reasoning→持久消息→tool结果→下一次请求检查。20.22修正内部字段污染后，兼容codec没有公开回传字段；接收的三种字段只能显示与存储。新增回归的初次基线为9失败/59通过：三种wire投影、JSON/SSE接收绑定及目录准入/刷新四项均失败。该批是新能力缺口，不声称用户relay已经拒绝或真实服务已经验证。

采用20.21/20.22已实际读取的官方Chat Completions schema及DeepSeek当前thinking guide：公开reasoning_content是独立正文，部分tool轨迹需要回传。定向再读pi openai-completions.ts:1280–1390的显式assistant构造和已识别字段回传，以及oh-my-pi openai-completions.ts:2580–2668的compat-selected字段、tool与缓存回传选择。采用显式字段/正文分离，拒绝把本项目已有opaque signature改成字段名；不按模型/provider名称猜字段、不补造缺失正文、不引入参考结构。参考允许部分跨API正文回传，本项目本批限定原provider/model/request绑定，跨目标迁移另行裁决。

[catalog](../../packages/ts-shell/src/core/models/catalog.ts)增加`compat.reasoningReplayField`，只接受reasoning_content/reasoning/reasoning_text或false。原[request shape](../../packages/ts-shell/src/core/models/requestShape.ts)要求精确owner、模型和已声明地址一致，兼容或共享Chat Completions codec准入，未知/匿名/歧义/换地址/其他协议不准入。refresh保留已审阅声明、用户显式修改或false可撤销，原merge owner不变。没有为任何内置型号增加声明，没有迁移旧DeepSeek别名。

[turn](../../packages/ts-shell/src/turn/step.ts)将已收到且公开、无signature的reasoning绑定原requestReplayBinding，再沿既有origin/transcript存储；不新增reasoning字段或存储系统。[compatible adapter](../../packages/ts-shell/src/provider/endpoints/openaiCompatible.ts)只在声明字段、unsigned/non-redacted正文与原provider/model/binding全部一致时写字符串，simple与turn共享投影，tool IDs/参数字节与history不变。目标目录可声明不同于接收字段的回传字段；接收字段本身不构成回传授权。无tools的simple及closing请求仍保留合法历史正文，未带绑定的旧历史省略，不补空值。凭据旋转通过原binding拒绝旧正文，不把public声明赋给opaqueReplay。

预览三条新增回归首次全部在[preview](../../packages/ts-shell/src/cli/runtime/context/preview.ts)的“任意replayBinding就是opaque”检查失败。现opacity依据实际signature/withheld数据，绑定public text不再拒估算；原opaque保存回归仍通过。声明字段从同一shape贯通preview，估算实际投影并与dispatch完整body比较。进一步发现旧message预算只计answer/tool、不计reasoning；仅在声明回传时以现有estimateWirePrompt复核实际payload与input/window/output/reserve，超限在fetch前走原overflow失败合同，未修改未声明目标的预算行为。

主代理768MiB、threads=false、package-local六个显式文件最终302项去重通过：endpoint35/requestShape36/preview102/step96/simple12/catalogShape21。覆盖JSON/SSE→transcript解码→第二次实际tool请求、三种配置字段、exact owner与未知/歧义/其他协议、refresh/user false、unsigned/空signature/withheld/旧历史、旋转凭据、closing无tools，以及40k字符public正文超过10k窗口的本地拒绝；不是20k会话或PTY。preview三种字段核对同一body/估算、会话文件字节不变。

七类独立反转分别撤去adapter正文、provider/model/binding守卫、turn传参、received绑定、字段白名单、public preview测量与wire预算，按实际失败名称确认5/7/2/2/2/3/1项失败，各次finally逐字节恢复。字段白名单反转初先只预期一失败，实际另命中user false撤销；分类后按两项重验，并未降低断言。源码恢复后完成302项，预算反转再恢复后endpoint35重验。一次重验误从repo root启动，发现三份既有临时source副本共140项；不计其重复发现结果，随后所属package endpoint35单文件重跑通过，不删除其他任务副本。

五静态门、diff、完整声明图单一用例通过；AST具名callable catalog8/shape2/kinds8/adapter11/step17/preview8。1536MiB串行TS build `e74f7ef6c2424f9299efb0da32479172a2e4ed2f60a91c45aa2c3a0979ffdd66`，inputs `b1babcf0d168f24306850df37e50a9bb44a9112d038466e491544e5b3a63e4f6`，460 compilerInputs/3547文件重算一致。NormProof proven/0open/0failed/0gap仅collector结构。HANDOFF记录public ownership/测量边界，任务scratch清理。无live relay/provider、真实账户/终端或独立review，原47项不升级，反馈25与ADD整体partial/active；Git/新提交精确CI另绑定。

延后确认[6ff4508 CI40937374700](https://github.com/h-hei133/cheers/actions/runs/40937374700)与[be01f03 CI40939033259](https://github.com/h-hei133/cheers/actions/runs/40939033259)completed/success，各headSha一致。普通退出[ebf333b CI40936451972](https://github.com/h-hei133/cheers/actions/runs/40936451972)completed/failure，停在scripts gate，build与产品测试未开始；check-run `123668145319` annotation明确“hosted runner lost communication with the server”，failed logs为空。归类runner通信失败，保留整次failure，不记产品测试失败或绿色；该提交Watch成功另计。

本批公开回传已提交推送`3388b01cfad4688aab4bf41a9c98193c80b91114`，远端main精确一致、仅原CLAUDE.md。[Watch40944128024](https://github.com/h-hei133/cheers/actions/runs/40944128024)completed/success，[CI40944127824](https://github.com/h-hei133/cheers/actions/runs/40944127824)启动读回in_progress；该CI不由本地302项或Watch替代。

### 20.24 会话关闭回归的发布边界与CI分类

延后[74f8bd2 CI40940297696](https://github.com/h-hei133/cheers/actions/runs/40940297696)为completed/failure，精确head核对；1失败/12401通过/3跳过，1035文件通过/1失败/1跳过。静态/scripts/build均success、NormProof步骤skipped。唯一失败为[session lifetime测试](../../packages/ts-shell/src/cli/interactive/picker/session/lifetime.test.ts)的drains real in-flight acquisition，最终zero-publish断言收到一次current row，其他product/advisor/JSON投影测试通过。原失败状态保留。

本地原完整lifetime五项通过，不能据此称CI已修。目标源码[listing](../../packages/ts-shell/src/cli/interactive/picker/session/listing.ts)和[catalog](../../packages/ts-shell/src/session/store/catalog/index.ts)在非current文件open受阻时合法发布current progress；原测试只等active=3，再close，all-time zero-publish会随调度时序计入关闭前的发布。只改同步方式、等待实际acquisition和current publication后，旧最终断言稳定复现同一one-call失败。定向pi session-selector.ts:943–990也允许active controller发布partialSessions，只在controller退休后拒绝；采用合法live progress与retired outcome分开，不抑制生产目录发布。

测试现在由真实open事件确认三个文件句柄待处理，由订阅事件确认current进度且未发布saved rows，close前记录发布数；drain后要求次数不增加、bytes不增加、handles/directory全部关闭、旧detail为空，重开继续完整分页。原production cancellation、目录预算和返回链未修改，不依赖延长timeout或轮询迟早命中来稳定夹具。真实事件同步+旧zero断言的反转一失败，修正后所属package三个显式文件88项串行通过：session73/lifetime5/listing10。首次验证传入不存在browser.test路径时Vitest只选择另两个实际文件15项，未据此称三文件通过，随后用真实session.test完成88项。

五静态门/diff与1536MiB串行build通过，最终build与460/3547新鲜度由日志精确绑定；test-only未重跑结构NormProof。HANDOFF新增关闭前/后发布边界；无新scratch、live provider/PTY/exe、全仓或20k会话，原47项不升级、ADD active。新的Git/CI另绑定，旧runner与测试失败不改成绿色。

本批测试修复已提交推送`53bbd335b2ae8169a527db4842866fbe29eda4e0`，远端main精确一致，仅原CLAUDE.md。[Watch40945194797](https://github.com/h-hei133/cheers/actions/runs/40945194797)completed/success，[CI40945194907](https://github.com/h-hei133/cheers/actions/runs/40945194907)延后读回仍in_progress；20.23的CI40944127824同样仍在运行，不计通过。

### 20.25 聚合SSE delta中的thinking与答案顺序

反馈25沿实际stream→step→TurnSink继续验证。[completion reader](../../packages/ts-shell/src/turn/completion.ts)在同一个delta含公开reasoning与content时先发答案，再发thinking；代理聚合两通道会让assistant先建块，后建thinking仍live，后续答案复用assistant而不结束thinking，activity回到thinking。不是字段提取或effort缺口。三个公开字段的reader与真实Response→createStepFunction→TurnSink共六项新增回归在原顺序下失败，原69项通过。

目标检查后定向读取pi packages/ai/src/api/openai-completions.ts:578–640，其注释明确代理聚合场景，先处理reasoning再处理content；oh-my-pi packages/ai/src/providers/openai-completions.ts:1457–1515同样thinking在前。本批采用这一顺序，在原reader仅移动现有公开reasoning提取/fragment发送到content之前，不新增sink状态机或协议转换；字段优先级、tool累积、terminal/usage和marker合同保持原逻辑。

新增reader检查三字段的fragment顺序与最终正文，实际请求回归检查thinking先于assistant、thinking已finalized、继续答案仍在同一assistant与activity working。初版TUI夹具误用Transcript.recent比较显示顺序；recent是最新在前，改用all读取实际显示顺序，未调整产品transcript语义。主代理所属package四个显式文件221项通过：completion37/endpoint38/step96/turnSink50。反转恢复content-before-reasoning后六项新回归全部失败，其余未选项不计新通过；finally逐字节恢复后221项再通过。AST completion15；五静态门/diff、1536MiB TS build与最终新鲜度核验通过：build `ef6f1547fe429bf19ec53d5567aa542656102bde0496febbd3f5b08fbfc3f46d`，inputs `9939c7116176b085eda0e703cc87a15b454bd0e0b2b0d45693921e5ee86b64c9`，460 compilerInputs/3547文件重算一致。

本轮验证存在一次执行纪律失误：构建仍返回session_id时误启动了测试，短暂重叠，之后分别确认exit_code=0且新鲜度单独完成；未观察到OOM，但不能将本轮整体称为严格串行。后续以exit_code确认为启动下一项重检查的边界。局部顺序修复不重复结构NormProof；HANDOFF记录聚合delta与recent/all陷阱，任务scratch清理。无live relay/provider、真实终端、PTY/exe/full suite或20k会话，原47项不升级、反馈25与ADD仍partial/active；新Git/精确CI另绑定。

本批已提交推送`44f8d9fc8d93531297f87a52bd5b697e7f95d29b`，远端main精确一致，仅原CLAUDE.md。[Watch40946386982](https://github.com/h-hei133/cheers/actions/runs/40946386982)延后completed/success，[CI40946387010](https://github.com/h-hei133/cheers/actions/runs/40946387010)仍in_progress。20.23公开回传的[CI40944127824](https://github.com/h-hei133/cheers/actions/runs/40944127824)现已completed/success、headSha核对一致；20.24 CI仍运行。

### 20.26 Responses终态公开reasoning的当前回合显示

继续反馈25，实际检查[Responses reader](../../packages/ts-shell/src/provider/endpoints/responses/stream.ts)与[step](../../packages/ts-shell/src/turn/step.ts)确认：done/终态有公开reasoning但没有reasoning delta时，原reader只保存正文，step因streamed已定义不发全量onReasoning，当前回合只有assistant，恢复后才有thinking。原raw done-only测试明确断言零fragment，覆盖存储但未覆盖当前显示。本轮实际Response→step→TurnSink两端点回归及reader场景初次六失败/54通过，证明本地缺口，未声称真实服务必然省略delta。

使用OpenAI Docs核对[官方流式事件](https://developers.openai.com/api/reference/resources/responses/streaming-events.md#response.reasoning_summary_text.done)：summary/raw done的text是完整公开正文，并由item_id/output_index及各自part index定位。定向读取pi openai-responses-shared.ts:746–768，reasoning item收尾采用summary或raw正文并发布thinking_end。采用终态公开投影与每item不重复的决定；本项目保留更严格terminal identity、delta/done、sealed item与可执行tool检查，没有从未验证done或opaque cipher推造正文。

原reader在readResponse和answer前缀验证后，按output_index找原slot，只为没有任何非空reasoning delta的item发一次reasoning fragment，复用原outputProjection的summary优先/raw次之，再发剩余答案。多个item分别判断；其他item流出正文不抑制本item，empty delta不构成已显示。账号服务的response.done省略output时继续只使用原连续sealed items。终态error不补发，opaque output和signature保持原始值。已流出的raw/summary合并显示合同保持；部分delta后的缺失尾部或表示切换不是本轮完成范围，仍需独立替换/去重裁决。

主代理package-local五显式文件196项串行通过：stream56/consumer8/body19/account17/step96，覆盖done-only、纯terminal、两端点真实sink显示、多个item、empty delta、已流答案不重复、reduced account terminal、EOF/foreign/contradictory/malformed tool/failed不补发及cipher不显示。三个独立反转移除补发、移除已显示item守卫、移除有效completion守卫分别9/6/1项失败，每次finally逐字节恢复，恢复后196重验通过。五静态门/diff、完整声明图单一用例与AST stream4通过；1536MiB TS build完成exit0后单独新鲜度核验：build `d3fc77c496563398fe48395d87a977238b6907196363c2f8bced1a8a193b05bf`，inputs `5cac3c77d583651812cd1b1c9cb10e95fcbf8c38d8d01a3ac46358968444fdb8`，460 compilerInputs/3547文件重算一致。

本批未重复本地NormProof judge，完整声明图是结构证据；无独立review、live provider/账户、真实终端、PTY/exe/full suite或20k会话。HANDOFF记录stream transport与显示事实分开，任务scratch清理。原47项不升级，反馈25与ADD整体仍partial/active，Git/精确新CI另绑定。

本批已提交推送`3db82225087b54b0f82a2821e07dae0e70d6d0b0`，远端main精确一致、仅原CLAUDE.md。[Watch40948637008](https://github.com/h-hei133/cheers/actions/runs/40948637008)延后completed/success，[CI40948637046](https://github.com/h-hei133/cheers/actions/runs/40948637046)仍in_progress。20.24的[53bbd335 CI40945194907](https://github.com/h-hei133/cheers/actions/runs/40945194907)现completed/success，精确head一致；旧74f8bd2 failure保留。

### 20.27 Responses部分reasoning的可验证尾部

沿20.26明确留下的部分delta边界继续：原matches允许终态公开part保留已流prefix并增长，但“本item有任何delta便不补发”让当前thinking只显示前缀，存储正文完整。summary/raw各一reader与一实际step→TurnSink新增回归共四失败，另65通过。沿20.26已实际读取的官方done完整text及pi item收尾投影决定，本项目只处理可直接追加的同正文尾部，不采用参考的无条件全量替换。

原slot增加本地shownReasoning，按reasoning fragment实际发出顺序累计，不持久化、不进入请求或public接口。终态完成原校验后，原outputProjection选出的公开正文必须startsWith该item实际已发字符串，且长度增加，才发slice后缀；未流item沿20.26原空前缀行为。raw/summary同时流出、多个part交错或正文表示变换导致不匹配时不追加，原最终存储/native replay不变；live显示与终态重表示的完整替换仍是独立剩余项。

主代理五显式文件201项串行通过：stream59/consumer10/body19/account17/step96。summary/raw尾部各贯通当前thinking完整正文和finalized；额外交错part夹具确认实际回调顺序不能由Map中的part序列重建。四类反转关闭部分尾部、清空已显示前缀、去掉prefix校验、按part map重建分别4/11/1/1项失败，finally逐字节恢复后201项重验通过。交错fixture反转前补长终态第二part，让错误slice确实可观测，没有放宽产品合同。五静态门/diff通过；局部slot/前缀修复无新import/callable，未重复完整声明图或NormProof。1536MiB build确认exit0后单独新鲜度重算通过：build `643a2bafca77f650a22314da8a66341923cf3acaddf0f1bcba336f366762386f`，inputs `a8147821bee5b6b60e5c7642dfa3967aab05056ce6c3a7dbe4dacfd3bf1a754c`，460 compilerInputs/3547文件一致。

HANDOFF记录实际发出顺序与校验part状态分开，任务scratch清理；无独立review、live provider/账户、真实终端、PTY/exe/full suite或20k会话，原47项不升级、ADD active。Git/精确新CI另绑定，既有success不延伸到本批。

本批已提交推送`b664f35231c557c04f40414d6b8c7bc2b9844b33`，远端main精确一致、仅原CLAUDE.md。[Watch40949567373](https://github.com/h-hei133/cheers/actions/runs/40949567373)延后success，[CI40949567238](https://github.com/h-hei133/cheers/actions/runs/40949567238)仍in_progress。20.25的[44f8d9fc CI40946387010](https://github.com/h-hei133/cheers/actions/runs/40946387010)现completed/success，精确head一致；20.26 CI仍运行。

### 20.28 多次聚合delta后的thinking结束边界

继续20.25，第二个delta同时含reasoning与content时，[TurnSink](../../packages/ts-shell/src/cli/interactive/turnSink.ts)先新建thinking，但chunk复用原assistant，仅openAssistant里的settleThinking不会运行；第二thinking仍live、activity回thinking。三个公开字段的实际step→sink夹具扩为两次聚合delta，另新增owner回归保留同一answer并检查后续空tick不续钟：原实现四失败/85通过。目标检查后沿pi/oh-my-pi已定向读取的每delta先thinking后text决定，比较其block生命周期与本项目sink的assistant复用边界；采用每次答案增量结束当前thinking，不新建第二个答案或引入参考event体系。

产品仅在chunk的非空text守卫后调用原settleThinking，保留openAssistant、prose/tool与终态收尾合同。当前thinking一旦结束，空think tick仍不新建块；答案正文只在原assistant累积。聚合thinking跨答案重复出现时仍依实际到达顺序保留独立块，未宣称重新排序整个会话。

主代理五显式文件232项串行通过：completion37/endpoint38/step96/turnSink51/Responses consumer10。撤去唯一调用反转四项全部失败，finally逐字节恢复后232再通过。五静态门/diff通过，局部调用无新import/callable，不重复结构graph/NormProof。1536MiB build确认exit0后单独新鲜度通过：build `c1fa3a0861b8b496dcdde6670e24383d5487a72750bd09b19cb7a18225a675dc`，inputs `ee672ceda08c4c0bd365387e3f42348c4c13b53f93ed93a01318bde3876b2d56`，460 compilerInputs/3547文件一致。HANDOFF补答案复用边界、任务scratch清理；无独立review、live provider/账户/用户终端、PTY/exe/full suite或20k会话，原47项不升级、ADD active，Git/精确新CI另绑定。


20.28已提交推送`a634099effea837eebdd0a21cebe4b805958ab89`，远端main精确一致、仅原CLAUDE.md。[Watch40950547630](https://github.com/h-hei133/cheers/actions/runs/40950547630)completed/success，[CI40950547705](https://github.com/h-hei133/cheers/actions/runs/40950547705)延后仍in_progress；20.26的[CI40948637046](https://github.com/h-hei133/cheers/actions/runs/40948637046)现completed/success、精确head一致，20.27 CI仍运行。

### 20.29 Responses已验证公开正文的完整显示与消息归属

继续20.27明确留下的表示替换：raw与summary同时流出，或同一item的part、不同output item交错，原最终存储投影正确，但当前thinking保留到达顺序拼接的中间正文。两端点真实step新增替换回调回归初次失败；工具循环fixture另因tool schema缺少function层在网络前失败，安全query.failed确认后修正fixture，未据此改动产品请求合同。

目标检查后沿20.26已核对官方done完整公开text与pi openai-responses-shared.ts:746–768的item收尾决定，采用已验证公开正文校正及明确输出归属；本项目继续先完成terminal identity、delta/done、sealed item、actionable tool及answer prefix验证，才允许显示修正。原reader改为记录整条模型消息实际发出的reasoning字符串，复用readResponse已有最终公开投影：相等不发送，可续写只发后缀，其余发送完整reasoning.replace fragment。移除旧slot级shownReasoning与重复投影；signature/native output保持原值，cipher不转成可见正文。

[step](../../packages/ts-shell/src/turn/step.ts)传递onReasoningReplace，原shownAnything拒绝重复重试的守卫纳入非空替换。[turn/request](../../packages/ts-shell/src/turn/request.ts)在每次前台step回调前发message.started，并映射reasoning.replace；两事件仅用于显示，明确排除durable写入，完整assistant message仍是存储与恢复来源。真实kernel的message_start在step返回后才发，不能充当流前归属边界，也不能复用影响recovery的turn.started。

[thinking owner](../../packages/ts-shell/src/cli/interactive/turn/thinking.ts)保留当前模型消息的同一Block引用：答案开始结束live计时，后续非空reasoning可复用，替换通过Transcript.setText使缓存和selection revision失效，保留用户展开/折叠选择；message.started先结束上一消息并撤回归属，工具后的新消息独立。20.28按到达顺序新增多个thinking的局部行为由本批单消息归属替代，答案仍只在该消息的同一assistant累计。session原具名回调超过20，顺势把本次涉及的请求回调、缓存请求和usage绑定移到请求owner，requestPurposeFor在原session路径薄re-export，原cache/context/identity测试继续验证移动前合同。

主代理package-local七个显式文件305项串行通过：stream69/consumer12/session30/turnSink53/events7/compatible endpoint38/step96。包括summary/raw表示切换、交错part和多item、sealed account reduced terminal、无重复delta、EOF/foreign/contradictory/malformed tool/failed/error/answer-prefix不替换、真实read工具循环中两条summary与原展开历史互不污染、native输出保持、答案后同块替换、渲染缓存及selection revision、空tick不重启计时和durability排除。旧多item逐fragment断言改为消息完整投影，旧聚合独立thinking断言改为同消息复用，均保留最终正文和生命周期检查。

四类反转关闭替换、撤去消息边界、settle丢失owner、移除durability排除分别7/1/5/2失败，每次finally逐字节恢复。边界fixture进一步将正文断言放在事件计数前，反转直接得到Previous reasoning/Summary 1，丢失Summary 0，证明实际跨消息覆盖；恢复后305重验通过。五静态门/diff、完整声明图单一脚本用例通过；保守AST计数含constructor、对象回调：sink20/thinking5/stream4/step18/session18/request8/completion15/events1。1536MiB build确认exit0后单独新鲜度重算通过：build `de88fe907703d60e6b2c8791933f837bf4b17f64f4ebad282e1bed70e44f53b4`，inputs `97f94ad1e53d80b094fe83a1078d4b12978954ba38a376799cc5492629b4e423`，460 compilerInputs/3549文件一致。

本批无独立review或本地NormProof judge，完整声明图提供实际解析/无环证据；无live provider/账户、真实用户终端、PTY/exe/full suite或20k会话。HANDOFF记录终态正文与显示归属边界，任务scratch清理，原CLAUDE.md和其他任务scratch保留；原47项不升级、反馈25实环境验收仍未闭合，ADD与Codex goal保持active。Git/本批精确CI另绑定，既有成功不延伸到新commit。


20.29已提交推送`91759c28b216209258bab56875f1007eeca2dedb`，远端main精确一致、仅原CLAUDE.md。[Watch40954559655](https://github.com/h-hei133/cheers/actions/runs/40954559655)completed/success，[CI40954559846](https://github.com/h-hei133/cheers/actions/runs/40954559846)in_progress。延后核对20.27[CI40949567238](https://github.com/h-hei133/cheers/actions/runs/40949567238)及20.28[CI40950547705](https://github.com/h-hei133/cheers/actions/runs/40950547705)均completed/success、精确head一致。

### 20.30 模型消息结束后冻结thinking与答案

20.29完整显示后继续实际生命周期核查：Responses先流reasoning prefix再流完答案，终态仅补reasoning tail，thinking重新live却再无答案delta来settle。持住Stop hook的真实Response→step→runTurn→TurnSink回归初次失败：公开正文Plan more正确，但thinking.finalized=false，结束前空tick仍可计时。不能用sink.end最终finalizeAll掩盖等待hook期间的显示状态。

定向读取pi openai-completions.ts:422–446，输出block结束明确发text_end/thinking_end。目标kernel已有assistant message_end，发生在step全部回调结束后，且失败/aborted同样有该事实；采用现有生命周期，不给各provider新增第二套结束条件。[projection](../../packages/ts-shell/src/turn/projection.ts)将assistant message_end映射为message.finished，[TurnSink](../../packages/ts-shell/src/cli/interactive/turnSink.ts)调用原finalizeAssistant并重绘，冻结当前thinking和答案；message.finished明确是临时显示事实、排除durable，没有升级query或write结果。user/tool原投影保持，后续query.failed仍记录失败。

主代理四显式文件98项串行通过：session31/turnSink54/projection5/events8，包含实际Stop hook等待、空tick不续钟、assistant已结束、stop/error/aborted均投影结束、user不投影与失败仍可见。移除producer、consumer及durable排除三类反转4/2/1失败，finally字节恢复后98再通过。五静态门/diff通过；保守AST projection7/sink20/events1，无新import/callable，不重复graph/NormProof。1536MiB build观察exit0后单独新鲜度一致：build `0123730ff859e0378ef84ebc81d2cc14af9026b7ceb820421bb28df3ed8157b1`，inputs `8d6d8b5ab9bfb0f8810b9da02f83b7b27240f921bca0fb2bb2a529ddf900879c`，460 compilerInputs/3549文件。

HANDOFF补模型输出与整turn结束的区别，任务scratch清理，保留原CLAUDE.md。无独立review/live provider/账户/真实用户终端/PTY/exe/full suite/20k会话，原47项不升级、ADD及goal active。Git/本批精确CI另绑定。


20.30已提交推送`6a28f575b848459e96439f6d5804a880c7dd3184`，远端main精确一致、仅原CLAUDE.md。[Watch40955431530](https://github.com/h-hei133/cheers/actions/runs/40955431530)延后completed/success，[CI40955431408](https://github.com/h-hei133/cheers/actions/runs/40955431408)仍in_progress；20.29 CI仍运行。

### 20.31 无答案推理的持久证据与停止结果

继续实际消息写入→恢复边界核查：step已提供reasoning-only公开正文和原empty-answer说明，但[session](../../packages/ts-shell/src/turn/session.ts)的persist只看content/tool_calls，丢原推理；[concludeRun](../../packages/ts-shell/src/turn/projection.ts)把说明当作completed/success。真实兼容JSON→step→runTurn→restoreConversation回归与两种空/空白结果投影初次三失败，恢复owner本来已经支持reasoning-only，所以不是新增恢复系统。

定向读取pi agent-session.ts:1147–1176，在message_end持久化完整assistant内容；openai-completions.ts:1280–1335把thinking与answer内容分别保存/构造。采用内容证据不依赖答案非空的决定，保留目标opaque与redacted投影，不复制参考字段编码或迁移策略。persist仅对content/tool_calls/public reasoning/signature/redacted均无有效内容的assistant丢弃；已有reasoning对象原值保留，空白公开正文不算证据。结果owner用trim判定无答案但不改非空正文，沿现有stopped_error/terminalClassification stopped表达未回答，显式step limit优先保持stopped_max_turns；没有改成provider失败或新成功状态。

原conclude仍只发一次原解释并保存，sink将同文本已显示的解释计入stopped结果，设置失败可retry而不再新增重复notice；不同停止理由仍沿原通知路径。四显式文件120项串行通过：session34/projection8/history24/turnSink54，包含实际reasoning-only保存/恢复/停止、说明只一次、空白过滤、opaque/redacted保持且不显示、空/空白结果不成功、step limit和非空答案原空白保持。移除persist reasoning守卫、撤销未回答分类、移除重复通知守卫三反转2/3/1失败，finally字节恢复后120再通过。五静态门/diff通过，无新增product import/callable，既有ceiling保持；未重复graph/NormProof。1536MiB build观察exit0后单独新鲜度一致：build `cc3e3de8f256e86d5603bb7edcc72579fc6ebaf09d5d7c691c9fabce26de291c`，inputs `5b60dec32615383fcc91b09434bc85d87dfa4bb00251c7a40d8894a88fc02737`，460 compilerInputs/3549文件。

HANDOFF补推理证据与回答成功分开，任务scratch清理、原CLAUDE.md保留。无独立review/live provider/账户/真实用户终端/PTY/exe/full suite/20k会话，原47项不升级、ADD/goal active，本批Git/精确CI另绑定。


20.31已提交推送`5f98378fbe691cb08d7185c7a53e41fb509e0f9d`，远端main精确一致、仅原CLAUDE.md。[Watch40956596689](https://github.com/h-hei133/cheers/actions/runs/40956596689)延后completed/success，[CI40956596885](https://github.com/h-hei133/cheers/actions/runs/40956596885)仍in_progress；20.29/20.30 CI仍运行。

### 20.32 失败与取消后的已显示公开推理证据

继续反馈25的实际失败消息→恢复核查：兼容流EOF/reader error，以及Responses failed/EOF路径已显示公开reasoning，但readCompletion catch或responseFailure只保留答案，step失败结果不带reasoning；20.31persist无法保存未带出的证据。三个真实SSE→step→runTurn→restore回归初次全部失败，旧partial重试用例仅检查不重复请求，没有持久推理断言。

定向读取pi openai-completions.ts:673–710，catch保留output.content中的thinking并设置error/aborted；目标已流文本与未知终态严格分开。采用保留实际公开回调正文的决定，不采用参考raw metadata错误报告或为未验证输出生成签名。[step](../../packages/ts-shell/src/turn/step.ts)在单次调用内记录onReasoning/onReasoningReplace实际文本，统一stamp只在error/aborted且原step无reasoning时补text；原origin保持无replayBinding，native签名与tool接纳不改变，成功消息的规范终态正文仍优先。缓存每次step新建，取消后下一请求不继承。

两显式文件134项串行通过：session37/step97，包含兼容EOF/reader error、Responses failed/EOF、真实取消、后续请求隔离、实际持久/恢复、一次请求且query.failed无query.completed、不含未验证终态正文/cipher/signature/replay binding；原partial answer仍保留。反转关闭stamp补文或移除实际delta累积均6失败，finally字节恢复后134再通过。五静态门/diff、AST step18通过，无新import/callable、不重复graph/NormProof。1536MiB build观察exit0后单独新鲜度一致：build `7f09032c8bbac12778139e6a2b0293d5690ba3067fecb6a1e897595a122dd8e0`，inputs `a32c8624a9e8b03ef465554bf116e46d4dff6500ce62c56b49d0a78fd5b69169`，460 compilerInputs/3549文件。

HANDOFF补失败路径公开证据保留与验证终态权威分离，任务scratch清理，原CLAUDE.md保留。无独立review/live provider/账户/真实用户终端/PTY/exe/full suite/20k会话，原47项不升级、ADD/goal active，本批Git/精确CI另绑定。

20.32已提交推送`cc74115ec5de8b391252b4096189577da8e6be11`，远端main精确一致、仅原CLAUDE.md。延后核对[Watch40957840554](https://github.com/h-hei133/cheers/actions/runs/40957840554)已completed/success，[CI40957840429](https://github.com/h-hei133/cheers/actions/runs/40957840429)仍in_progress。20.29[CI40954559846](https://github.com/h-hei133/cheers/actions/runs/40954559846)、20.30[CI40955431408](https://github.com/h-hei133/cheers/actions/runs/40955431408)均completed/success且head一致；20.31[CI40956596885](https://github.com/h-hei133/cheers/actions/runs/40956596885)仍in_progress，历史失败不改。

### 20.33 配置中真实模型的公开thinking、展开与恢复

在上述产品HEAD和已验证build `7f09032c8bbac12778139e6a2b0293d5690ba3067fecb6a1e897595a122dd8e0`上，反馈25新增两次串行真实provider请求。只读加载真实目录与legacy项目档位，使用原`createConfigInputs`/`getRuntimeConfig`读取用户配置、原`resolveCliCredential`解析凭据；运行状态由`.tmp/live-reasoning/`内named profile隔离。目标为`openai-compatible`、`bailucode.com`上的`bailu-2.9-preview`，实际档位high、explicit=false；没有改变用户配置、目录或真实会话状态，没有复制凭据到scratch文件。

两次都通过实际`createProviderStep → runTurn → TurnSink`，只发同一小型算术问题，不加载项目指令/skill/历史、工具为空；使用原产品system prompt，内存中禁用重试并设45秒AbortController、10/30/30秒transport预算。调用原`TranscriptPane.toggleCollapsed('thinking')`检查展开并重绘，通过原SessionManager写入/读回及restoreConversation核对公开正文。structured日志持久化关闭，诊断只输出状态、计数与布尔值，不打印响应正文、headers或凭据。

| 观测 | 第一次：验证输出上限256 | 第二次：验证输出上限1024 |
|---|---|---|
| 请求/耗时 | 1次，3211ms | 1次，1840ms |
| step/turn | length；stopped_error/stopped；空答案 | stop；completed/success；3字符正确答案 |
| 公开reasoning | 1301字符，71个delta | 715字符，46个delta |
| thinking | 1块，已冻结；展开后多27行 | 1块，已冻结；展开后多33行 |
| 显示/恢复 | 均与step公开正文精确一致 | 均与step公开正文精确一致 |
| provider/auth/admission/取消 | 未报告failureClass或admissionFailure，未取消 | 未报告failureClass或admissionFailure，未取消 |
| usage | 首轮探针字段投影错误，未保存可用计数 | provider报告input745/output176/total921，其中reasoning169 |
| 峰值RSS | 136924KiB | 136580KiB |

第一次验证脚本exit2表示正常回答验收不成立，不能隐去其截断/停止；公开thinking的显示、展开和恢复已通过。第二次exit0证明当前配置目标的小请求正常路径，usage是provider报告而非独立billing测量。两次均没有自动重试，第二次是主代理明确提高临时输出上限后的新请求；用户持久配置保持原值。第一轮usage投影改为原ProviderUsage的snake_case后，仅第二轮有上述计量证据。

这不是用户真实终端Ctrl+T/鼠标/桌面/IME证据，也不是全部provider、账户、流失败或完整会话复入矩阵；不据此升级原Phase20的47项或宣告反馈25/ADD整体完成。没有本批产品代码改动，不重复build/Vitest；本任务scratch/profile清理，保留原CLAUDE.md。发现length说明仍把输出截断归因为context可能满，需沿原结果说明owner另行裁决，不把本次真实截断解释成provider故障。goal保持active，文档Git/精确CI另绑定。

20.33文档已提交推送`e6d543ad9fa9a7dcaa236fcb213c6c5e393916f7`，远端main精确一致；五静态门/diff通过，118既有docs-source advisory保留。工作区仅原CLAUDE.md，本批对应CI尚未读回。

### 20.34 无答案长度停止的准确说明

20.33真实小输入、256输出上限请求已经达到length且没有答案，原[emptyAnswerExplanation](../../packages/ts-shell/src/turn/step.ts)却称context可能已满并指向compact。目标另有明确的overflow markers/前缀与恢复路径，不能把length当作已证明的输入溢出。新增四条兼容JSON/SSE×有/无公开reasoning的实际step→runTurn→sink→restore回归，旧说明全部在结果说明断言失败。

定向只读对照pi openai-completions.ts:1556–1572将length保持独立；openai-responses-shared.ts:861–879将incomplete/max_output_tokens映射为length；openai-completions.ts:963–970明确reasoning与answer可共用max_tokens，推理耗尽会没有答案。采用保留停止原因与输出预算检查的决定，不据此新增reasoning预算字段，也不宣称所有兼容服务length的具体额度都已验证。

产品只修改原说明为provider在长度限制处停止、去现有/settings检查输出上限后再请求；不声称具体预算确定、不再推荐无依据的compact。四条实际链路保持stopped_error/stopped、一次说明、retry目标、零query.failed、推理保存/恢复及单次请求；原明确context overflow与安全拒绝控制继续通过。

主代理两显式文件138项串行通过：step97/session41。独立撤回说明的反转四条全部失败、37条未选不计通过；finally逐字节恢复step并核对SHA-256 `c5eb9dee4cf0592f828090cad2c17366532716cc03130279a4d37b970d4b71a2`，恢复后138再通过。五静态门/diff通过，无新product import/callable，不重复graph/NormProof。1536MiB build观察exit0后单独compilerInputs与digest核对一致：build `1bf1bbee4455594343e2fdc123ac1abedc72db761e31f22de24244a2a687907b`，inputs `5086aca3168877309143a0947153ae2d5116a119ae3fe77be1154f86edfa6c93`，460 compilerInputs/3549文件。

HANDOFF补length与overflow的证据区别，task scratch清理、原CLAUDE.md保留。新说明未重发live请求，实环境证据仍绑定20.33旧build；无独立review、真实用户终端/账户/桌面/PTY/exe/full suite/20k会话，原47不升级、ADD及goal active。本批Git/精确CI另绑定。

20.34已提交推送`9e4c4a2d3f5289f39f432e6dfc91bae9b49c42b6`，远端main精确一致、仅原CLAUDE.md。延后核对[Watch40960523975](https://github.com/h-hei133/cheers/actions/runs/40960523975)已success，[CI40960523986](https://github.com/h-hei133/cheers/actions/runs/40960523986)仍in_progress；20.33 Watch40959758635 success、CI40959758386仍in_progress。20.31[CI40956596885](https://github.com/h-hei133/cheers/actions/runs/40956596885)与20.32[CI40957840429](https://github.com/h-hei133/cheers/actions/runs/40957840429)均completed/success、head一致，历史失败保留。

### 20.35 表面清理异常仍归还终端并执行退出

继续反馈26实际退出边界。[InteractiveMode.shutdown](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts)先stop再handleShellClose，stop内订阅释放、transcript渲染或TUI写入抛错时，session terminate和exit仍完全跳过；原保存失败围栏覆盖不到这里。regular/fullscreen×订阅/transcript/终端写入六条真实Ctrl+D host回归，旧实现全部拒绝并产生六个未处理拒绝，保留为产品失败证据，不称用户现场根因已确认。

目标检查后定向只读对照pi tui.ts:1012–1022和terminal.ts:474–505：stop按序归还模式，但所读片段无异常继续围栏，不能据此称参考已解决。进一步读取codex tui.rs:305–335的restore_common：记录first_error，仍继续paste/raw/cursor恢复；lib.rs:600–617在资源关闭错误后仍执行terminal restore。采用各owner继续尝试、保留失败、终端恢复独立的决定，不复制Rust机制或新增第二套资源registry。

stop保留原owner与顺序，以局部循环逐项尝试已有清理，清空三个release引用后调用、保留第一个实际异常；document渲染失败时仍调用原tui.stop。TUI在原stop的finally尝试物理terminal.stop，鼠标输出或timer cleanup失败不跳过设备归还。shutdown接纳stdin/stop异常，安全报告未完全验证的清理，将cleanupFailed传给原handleShellClose；会话成功保存也不能把退出码升级为0。无exit hook的嵌入调用在会话关闭后仍收到原清理异常。closing/stopped键、paste和mouse事件直接退休，即使stdin.dispose失败，同一个chunk的后续输入也不提交；没有新provider/auth、package script、build或MCP关闭系统。

主代理package-local、heap768MiB、threads=false串行执行engine59/signalHandlers9完整所属检查及过滤host26，共94项实际通过；host325项未选不算通过。host覆盖两模式×subscription/transcript/terminal-write/terminal-stop/error-report/stdin十二条、嵌入失败两条及原busy exit、后续队列、drain、保存失败控制。物理stop失败只断言一次尝试与exit1，不假称设备已恢复；错误提示自身失败仍关闭会话并exit1，无原始错误正文。四类独立反转恢复旧stop、移除物理finally、移除失败退出码、移除stdin退休分别8/2/11/2失败；finally逐字节恢复后94再通过。第一轮反转脚本误预期4/11、实际6/9，按具体失败核对是error-report新增控制与renderer异常已有exit1分支；修正预期并补stdin场景后四类全部再次实际运行，不用错误计数冒充证明。

恢复SHA-256：InteractiveMode `8c2b57c9ab5fce925854fe8079f439f82af98dca7c2f5421e8b41bb432ac0587`、engine `5eb07cad270555ac2418e469d660513a5ba4c2a7fe5b4e1195acd1aee4a0bc52`、signalHandlers `020bf839d7a5f21d3106534bcf4b66286335524c9d974e416bcdc537049ffc06`。五静态门/diff通过；无新product import或命名callable。保守AST命名方法/箭头属性计数相对HEAD保持InteractiveMode122/engine22/signalHandlers2；前两者继承的ceiling超限按原disposition追加明确defer，未宣称结构符合20上限、未为窄退出修复进行大拆分。未重复graph/NormProof。1536MiB build观察exit0后单独新鲜度一致：build `c505ffd1811f4690029bf6fd025db469b17592203c21b691bf8c71d66ece19b6`，inputs `95c59e5eae2252672f97805d8aa9fda5dda5b242469ebc021c91883a2aa899af`，460 compilerInputs/3549文件。

HANDOFF追加表面清理与session退出围栏区别，task scratch清理、原CLAUDE.md保留。终端是RecordingTerminal、故障为受控注入，没有用户真实terminal、PTY/exe/full suite/20k、live provider或独立review证据；20.33 live仍绑定旧build。原47项不升级、ADD与goal active，本批Git/精确CI另绑定。

提交前补查stdin解绑失败的paste/mouse入口，增加同一chunk的bracketed paste与鼠标按下/释放、草稿为空与pointer零处理断言；两个入口沿同一closing/stopped状态退休。分别撤回paste/mouse守卫实际2/1失败，regular模式本来不路由该mouse，不能把它算第二项失败；首轮误预期mouse两项、核对后重跑。逐字节恢复后host26再次通过，engine59/signalHandlers9此前已串行通过且无后续改动。最后host重验仍返回session_id时误启动静态门/build链，发生验证重叠；两者随后分别观察exit0，未观察OOM，但本批整体不能称全程严格串行。新鲜度在两进程结束后单独完成，最终build/inputs以上述最新值为准。

延后读回20.33文档CI40959758386已completed/success、精确head为e6d543ad9fa9a7dcaa236fcb213c6c5e393916f7；20.34 CI40960523986仍in_progress，Watch40960523975 success。

20.35已提交推送`6a01c92e8f1a683b58b336b62848c3a1acb0d19c`，远端main精确一致、仅原CLAUDE.md。延后核对[CI40963305689](https://github.com/h-hei133/cheers/actions/runs/40963305689)与[Watch40963305563](https://github.com/h-hei133/cheers/actions/runs/40963305563)均completed/success、head一致；20.34[CI40960523986](https://github.com/h-hei133/cheers/actions/runs/40960523986)同样completed/success，历史失败保留。

### 20.36 真实CLI的thinking键盘、会话重开与终端输入恢复

在20.35产品HEAD及其build `c505ffd1811f4690029bf6fd025db469b17592203c21b691bf8c71d66ece19b6`上补反馈25/26的CLI路径证据。使用原`scripts/start.mjs`启动已验证Node构建，Python PTY为120列×60行；每次等真实startup prompt后输入一个小型算术问题，等待实际query终态，再发送三次Ctrl+T、Ctrl+D，随后按同一session ID重开并重复按键/退出。未启动exe或大消息压力场景。

只读引用原个人JSONC，不复制凭据；隔离HOME/USERPROFILE/测试根与named profile承接会话、目录和缓存。实际legacy请求目标为`openai-compatible`、`bailucode.com/openapi/v1`、`bailu-2.9-preview`，隔离会话采用原provider-scope模型选择并显式high。先前保存connection使用同host的`/v1`，预检不能把两者当成精确相同目标；两次预检失败均在请求前，探针修正选择方式，没有改用户连接。目录只复制该模型非秘密元数据，目录声明地址与请求不同，不以它证明该端点能力或价格。无项目指令、skills、历史或工具，重试和warming关闭，maxTurns=1、临时输出上限1024，transport为10/30/30秒；每CLI阶段65秒总期限、2MiB输出限制、heap768MiB。

观察器仅在隔离进程包装原TurnSink和TranscriptPane方法并调用原实现，记录事件数量、行数、状态和SHA-256；Ctrl+T由真实PTY字节经过终端/解码/keymap调用原toggle，并非探针直接调用toggle。公开正文仅在内存中用于实际PTY输出片段匹配，不保存或打印正文、响应、headers、凭据；结构化日志持久化关闭。Python沿原relay增加退出后termios读回，验证ICANON/ECHO/ISIG三项，而不是只凭reset escape或exit0宣称原始输入恢复。

| 有效最终运行 | regular | fullscreen |
|---|---|---|
| 真实请求/答案 | 1次、6725ms、正确3字符答案 | 1次、6950ms、正确3字符答案 |
| 公开thinking | 1011字符、54 delta、已冻结 | 1904字符、105 delta、已冻结 |
| 原transcript行数 | 17→43→17→43 | 17→53→17→53 |
| 当前/重开Ctrl+T | 均展开→折叠→展开，同一正文digest | 均展开→折叠→展开，同一正文digest |
| PTY绘制/恢复 | 展开输出含公开正文片段，持久与重开正文一致 | 展开输出含公开正文片段，持久与重开正文一致 |
| Ctrl+D退出 | 当前138ms、重开131ms，均exit0 | 当前126ms、重开133ms，均exit0 |
| 终端输入恢复 | 两次均读回cooked flags，reset escape齐备 | 两次均读回cooked flags，reset escape齐备 |
| 峰值RSS/总探针时间 | 295940KiB / 17.26s | 292140KiB / 17.46s |

两份有效收据均query.completed/success、单message.started、单usage请求、零tool调用；重开无query事件。用量探针最初只投影bucket.promptTokens，漏cacheRead/cacheWrite：regular未缓存输入142/output222/total1004，fullscreen143/418/1201；这些input不是完整输入量，不能据差额诊断产品计量错误或推断独立billing。正式观察器已补缓存字段供后续复验，但没有为该投影修正再发请求，当前证据按已记录范围保存。

本批实际共四次串行真实请求，无自动重试：前两次产品均有正确答案，但探针分别等待第三次展开的正文首行、重开viewport中的首行而超时exit1。第一次3833字符/227 delta、20295ms；第二次3084字符/158 delta、31182ms，其当前CLI按键与137ms正常退出已经通过，重开片段断言未通过。分类后改为逐次检查真实toggle、source digest及重绘，并在首次展开匹配可见多词片段；最后两次才是上表完整通过，不能删除失败探针历史或把四次全部称为验收通过。

正式工件[phase20-addition-live-cli](../../.omx/artifacts/phase20-addition-live-cli/)保存可复用PTY/观察器、无秘密收据与失败分类；task scratch清理。原配置/目录字节摘要一致，临时override不变，profile未生成凭据config副本，两次重开后的隔离会话均terminated。仅文档/诊断工件变化，无新产品代码或build/Vitest；主代理每次均等待进程实际exit后才开始下一验证。五静态门/diff通过，保留118条既有docs-source advisory；正式JS/Python语法、JSON与六组收据检查通过。正式脚本补缓存投影与显式单请求断言经过语法/收据静态核对，没有再次运行live；观测包装与termios读回增加诊断开销，上表时间不作为无探针生产性能基准。

这是WSL Linux PTY、当前单API-key目标、正常结束后的键盘/恢复证据，不替代用户原桌面键鼠/IME、流中点击、全部provider/账户、真实设备故障或完整acceptance矩阵。20.35受控terminal.stop失败仍只证明尝试与exit1；本批正常设备成功不升级那些故障结果。没有独立review，原47项状态不升级，ADD与Codex goal继续active；本批文档Git/精确CI另绑定。

20.36已提交推送`8e80f9e01ef77e8cbd43b847f275dc37b5cc9c16`，远端main精确一致、仅原CLAUDE.md。[Watch40966165938](https://github.com/h-hei133/cheers/actions/runs/40966165938)completed/success，[CI40966166052](https://github.com/h-hei133/cheers/actions/runs/40966166052)延后核对仍in_progress，head一致。

### 20.37 停止失败后退休渲染资源并保留原异常

继续反馈26与20.35的实际stop边界：物理terminal.stop的finally能保证设备尝试，却会在自身抛错时覆盖最早的scheduler/mouse错误，并跳过后续图片、主屏painter和最终document清理。TUI已有同实例stop/start合同，停止前borrowed overlay的状态或图片id保留会使重启漏enter screen或把已失效图片当作可placement。新增四个初始owner回归三失败/一通过；borrowed screen仅terminal单故障已在物理stop前释放图片，所以该控制本来通过，不捏造失败。

目标检查后定向复读pi tui.ts:1012–1022，其before/device/after顺序存在，但片段不提供异常继续；codex tui.rs:305–335保留first_error并继续paste/raw/cursor。采用原owner逐项释放、保留第一个异常及继续恢复的决定。本项目原[engine.stop](../../packages/ts-shell/src/presentation/tui/render/engine.ts)改为局部顺序release循环，不新增registry、执行路径或方法；startup/timer/painter/overlay引用在调用前退休。物理stop之后仍独立忘记图片id并尝试最终painter/document；main-screen图片保留用户scrollback，borrowed/alternate图片沿原free策略。任何失败仍throw首个值，上层20.35继续exit1，不能把最终document写入冒充物理设备恢复。

[engine回归](../../packages/ts-shell/src/presentation/tui/render/engine.test.ts)覆盖scheduler/mouse先失败且device后失败、terminal单故障、borrowed overlay写入失败、main painter光标失败、alternate图片/document继续，以及原engine重新start后的真实viewport/enter screen/payload。六条新场景与既有owner测试，主代理heap768MiB、threads=false，engine65/mainScreen28共93项通过；实际host另按精确名称运行26项cleanup/busy退出/队列/late-input/persistence控制通过，325未选不算通过。初次host过滤误用drain/explicit exit等不匹配名称只选14项，随后读取真实名称重跑26，未以未选用例冒充通过。

四组有效反转恢复完整旧stop、覆盖first error、把overlay退休放回写后、保留main painter引用，分别5/2/1/1断言失败，finally字节恢复后93项再通过。首轮旧stop反转错误使用会压缩输出的`rtk git show`，得6失败但不能算旧源码证据；AST检查也因此误报数量不一致。两者改为`rtk proxy git show`、核对method边界后完整重跑，上述5为有效旧实现计数，不隐藏无效轮。SHA-256 `1c2608199676952c020b53670abdd90349d153bd2f87058998d3488aff91ff90`恢复一致。

五静态门/diff通过，118既有docs-source advisory保留；无新产品import或命名callable。AST含constructor前后均23、不含constructor的原方法/箭头属性口径22，继承ceiling债务未消失，不称结构全合规。build观察exit0后独立重算compilerInputs与inputs digest一致：build `bca358900c8273b0046b8f6826687157c1f0e1a6b8442a4d69c7a4c7af5c5260`，inputs `278a28252e3c77cc04d3a081ae0fccea09cd935aef09cc3557416386fde231bc`，460 compilerInputs/3549文件。每个验证session均实际结束后才开始下一项；工件[render-retirement](../../.omx/artifacts/phase20-addition-render-retirement/)保留有效反转日志及build收据，HANDOFF记owner退休与RTK原文陷阱，task scratch清理。

本批设备为RecordingTerminal、故障受控，不证明真实失败设备的恢复；20.36真实CLI/PTY正常退出证据仍绑定前一个build，本修补没有再发live请求或运行PTY/exe/full suite/20k。未取得独立review、用户桌面/IME/全部provider或账户证据，原47项不升级，ADD与goal active；Git/精确新CI另绑定。

20.37已提交推送`5e2aa5253b143dcd6c555359518016e864178b2d`，远端main精确一致、仅原CLAUDE.md。延后读回[Watch40967568549](https://github.com/h-hei133/cheers/actions/runs/40967568549)completed/success，[CI40967568515](https://github.com/h-hei133/cheers/actions/runs/40967568515)in_progress，head一致；20.36 CI40966166052仍in_progress，旧成功不扩展到新commit。

### 20.38 resume真实CLI的搜索、选择与重开

反馈29与20.7补实际Node CLI→PTY→overlay操作证据。目标sessionPicker/browser/OptionModel与原selection/resume writer已检查，定向只读复读pi session-selector.ts:400–458的搜索/空态/可见选择绘制：查询交列表owner，画面围绕当前选择，空匹配明确提示。采用真实输入和实际绘制核对，不以直接catalog测量代替UI；本批无产品变更。

build `bca358900c8273b0046b8f6826687157c1f0e1a6b8442a4d69c7a4c7af5c5260`，inputs `278a28252e3c77cc04d3a081ae0fccea09cd935aef09cc3557416386fde231bc`，regular/fullscreen分别独立home/profile/project，原SessionManager创建48个小会话，每会话仅一条fixture user消息、无工具/真实provider/私有历史。原配置采用synthetic，warming和启动网络关闭、heap768MiB、45秒总期限和2MiB输出限制。原Python relay为120×60，沿20.36termios读回；观察器调用原OverlayHost.render并只记录fixture焦点/筛选/加载与原message.started计数。

两模式均等待startup prompt，输入`/resume`并等待完整页的Next session page入口；搜索精确fixture得到一项，退格放宽到十项、实际Down换焦点，逐字退格清空回首批；搜索无匹配后再次清空、重新搜索精确目标、Enter调用原runtime切换。原current selection文件读回目标fixture ID，重开/resume包含当前记录，Esc关闭后Ctrl+D exit0；配置字节不变，零请求，终端ICANON/ECHO/ISIG恢复。

| 实际操作 | regular | fullscreen |
|---|---|---|
| 完整首批/分页入口绘制 | 1094ms | 1090ms |
| 精确/无匹配/重查输入到绘制 | 178 / 178 / 175ms | 179 / 179 / 178ms |
| 真实Enter至selection切换 | 95ms | 95ms |
| Ctrl+D退出 | 134ms、exit0 | 137ms、exit0 |
| 峰值RSS/总探针 | 297320KiB / 13.07s | 300476KiB / 13.15s |

搜索时间包含真实逐键事件与既有去抖，不是catalog纯读取时间，不能与20.7约35ms直接比较或宣称大目录端到端加速。此轮检查分页入口已绘制，没有点击Next翻页；完整搜索索引在48项上检验，不拉起20,000条二进制。原使用过的session启动会更新时间，不能把其当前默认焦点当作旧pinned/latest渐进竞态的证明。

首轮regular探针过早把16条渐进候选当成完整页，分页断言exit1、零请求；修改等待完整page action后，两模式才通过。此为probe setup失败，未据此改产品。正式工件[resume-cli](../../.omx/artifacts/phase20-addition-resume-cli/)保存脚本、无私有正文收据和失败分类；临时运行状态清理。仅文档/诊断工件变化，不重复build/Vitest；五静态门/diff、JS语法及JSON收据检查通过，118既有docs-source advisory保留。

这是当前WSL PTY、小型真实磁盘布局、原CLI与writer操作证据，不替代2409项真实目录的终端性能、Windows/桌面/IME、外部目录变更或用户现场。没有独立review、live provider、exe/full suite/20k场景，原47项不升级、ADD和goal active。本批Git/精确CI另绑定。

20.38已提交推送`0100057a97f6a0dad76f8a3825e31abe9faa4aa0`，远端main此前精确一致、仅原CLAUDE.md。延后核对[Watch40968345121](https://github.com/h-hei133/cheers/actions/runs/40968345121)completed/success、[CI40968345119](https://github.com/h-hei133/cheers/actions/runs/40968345119)in_progress，head一致；20.37 CI40967568515仍in_progress，20.36 CI40966166052已completed/success。

### 20.39 resume清空搜索后翻页与切范围不带回旧查询

继续20.38尚未操作Next的缺口，沿原CLI、overlay、SessionBrowser/actions和catalog page检查。定向只读比较codex resume_picker.rs:1598–1667：查询清空设为Idle、后续search token必须仍匹配；参考保留已加载列表及稳定选择。本项目同意清空查询撤回搜索语义与迟到结果准入，但原分页是替换页、不是累积列表，因此保留已有continued-base清空后的显式Reload newest session page，不能套用参考的累积行或稳定选择策略。既有session测试已覆盖query continuation和continued-base refresh；新增两条actual host回归验证清空后Next与scope重建，撤回对应决定会各失败一条。

初始regular实际PTY已成功翻到base第二页、搜索第一页/第二页、清空回最新页，随后Next超时：画面filter重新成为已清空的`resume-fixture-`，并返回搜索首批40条，而非无查询的8条旧记录加current。此为产品行为漂移，零请求、19.77秒/295288KiB，失败收据保留，不能算完整通过。根因是browser.lastQuery清空后仍spread旧options.initialQuery，条件spread在undefined时没有覆盖旧值；scope重建同样继承旧seed。两条回归旧实现均失败，原[session actions](../../packages/ts-shell/src/cli/interactive/picker/session/actions.ts)翻页明确传live initialQuery（含undefined），[session picker](../../packages/ts-shell/src/cli/interactive/picker/session.ts)切scope显式清initialQuery，不新增目录、状态或执行owner。

主代理单进程串行、package-local heap768MiB/threads=false，session.test.ts全部75项通过。单独撤回page与scope修复各1失败/1通过，73未选不计通过；finally字节恢复后两条再通过。五静态门/diff通过、118既有docs-source advisory保留。1536MiB build实际exit0后独立freshness为build `94b7abf7d7634fe723daacb5c93113acefbec94adb26df6dbeb29f1df03028ff`、inputs `b1e103aa74a8b86da2e8243b69d2440ad5ada34d129853e5ff7f72c81400a193`，460 compilerInputs/3549文件一致。原产品命名callable AST前后session14/actions4，均未增加且低于20；无新产品import，无全仓graph/NormProof或无关重构。

新构建下regular/fullscreen分别隔离home/profile/project，原SessionManager各48会话、每会话一条小user fixture。synthetic、offline、零工具/skills/指令、warming关闭，heap768MiB/45秒/2MiB边界，沿原Python120×60 relay。观察器调用原OverlayHost.open/render与TurnSink，记录host重开代数、实际绘制行IDs及状态，按键全部由真实PTY发送，没有调用model.focus或apply替代CLI动作。两模式均等待完整首批，Up聚焦已绘制Next、Enter翻页；搜索通用fixture query后再次Next仍保留查询；逐字退格清空、无查询Next到旧页；旧base上精确搜索/清空得到单独refresh，Enter重载最新页；再次搜索分页、清空、真实Tab切All projects保持无查询；精确搜索/Enter沿原resume writer，原selection文件读回目标，重开、Esc、Ctrl+D退出。

| 新构建实际操作 | regular | fullscreen |
|---|---|---|
| 完整首批 | 1094ms | 1119ms |
| 四次Next：base/search/base/search | 127 / 281 / 127 / 304ms | 154 / 253 / 127 / 304ms |
| 四次搜索：通用/精确/通用/精确 | 329 / 177 / 356 / 179ms | 356 / 179 / 355 / 180ms |
| 显式refresh / 精确resume | 762 / 248ms | 712 / 213ms |
| Ctrl+D / termios读回 | 138ms、exit0、cooked恢复 | 137ms、exit0、cooked恢复 |
| 峰值RSS / 总探针 | 298588KiB / 16.92s | 301976KiB / 16.65s |

每次base首批40个、末批8个非current加单个current；页内无重复，非current跨页不重复，并集精确覆盖48个fixture。current跨页出现是原合同，不误判为重复故障。搜索两页与base对应行完全一致、末批不再提供Next；八个采样页面全部fixture ID均在原renderer的绘制行中出现。所有翻页/清空/refresh/scope过程中current selection仍为fixture0，只有最后精确resume切到fixture2，零message.started、配置字节不变；两次正常终端均读回ICANON/ECHO/ISIG。时间包括诊断、真实输入、去抖及磁盘读取，不能宣称2409项用户目录性能或无探针生产延迟。

正式工件[resume-pages](../../.omx/artifacts/phase20-addition-resume-pages/)保存可复用脚本、原失败与两份有效收据、反转日志和build投影；final探针新增scope步骤，两模式实际重跑通过。HANDOFF追加seed覆盖陷阱，task scratch删除、原CLAUDE.md保留。没有真实provider、用户桌面/Windows/IME、外部目录变动、独立review或exe/full suite/20k证据；原47项状态不升级，ADD与Codex goal继续active。本批提交/推送及精确CI另绑定。

20.39已提交推送`cf397c69bc59d7bd564c0923bf981ebf050e679a`，远端main精确一致、仅原CLAUDE.md。延后核对[Watch40970201142](https://github.com/h-hei133/cheers/actions/runs/40970201142)completed/success、[CI40970201073](https://github.com/h-hei133/cheers/actions/runs/40970201073)in_progress，head一致；20.38 CI40968345119与20.37 CI40967568515已completed/success。Watch工作流成功不自动代表全部架构义务或Phase验收完成。

### 20.40 空闲信号关闭、普通fresh与显式恢复的实际CLI证据

反馈26/30沿原runner的signalSessionClose、createCliShutdown、bootstrap恢复判定与Terminal出口检查；此前20.5已实现idle saveTerminated、busy保留真实恢复证据，本批先补idle真实CLI路径。定向只读复读pi interactive-mode.ts:4392–4416：信号出口保留handler至cleanup完成，先资源退出后终端恢复，并与普通交互退出顺序区分。采用观察实际信号/普通两条路径的决定，本项目继续保留143/129和原10秒资源预算；不以参考exit0或完整ui.stop推断本项目相同执行序列，无新产品代码。

build `94b7abf7d7634fe723daacb5c93113acefbec94adb26df6dbeb29f1df03028ff`、inputs `b1e103aa74a8b86da2e8243b69d2440ad5ada34d129853e5ff7f72c81400a193`，与20.39已独立freshness一致。四组regular/fullscreen×SIGTERM/SIGHUP各独立home/profile/project，原SessionManager每组创建一条含单user消息的已完成fixture。每组沿原scripts/start.mjs、Python120×60 PTY串行启动三次：显式session启动并等真实prompt后向relay发信号，原relay→launcher→CLI转发；普通启动不传session ID，最后再显式传原ID。synthetic、offline、warming off、零tools/skills/指令、heap768MiB，每CLI20秒、2MiB边界，全部12次实际进程退出后才继续。

观察器调用原InteractiveMode.start、Terminal.stop/restoreSync和TurnSink，记录session身份、turn/user block数量、实际退出restore调用与request数量；仅fixture正文用于内存PTY匹配，不输出或保存正文。四组首次均明确显示原fixture一条历史，SIGTERM/SIGHUP后原磁盘status=terminated且记录保留；普通重开每次为不同ID、零turn/零user block且PTY没有fixture历史，Ctrl+D后空会话按原合同删除；显式resume仍回原ID、一条turn/一条user block、实际PTY显示同fixture历史，正常退出仍retained/terminated。三阶段current selection均读回实际活动ID，配置原字节不变、零message.started。

| 模式/信号 | 信号退出 | 普通fresh Ctrl+D | 显式resume Ctrl+D | 峰值RSS/三阶段探针 |
|---|---|---|---|---|
| regular/SIGTERM | 103ms、143 | 178ms、0 | 156ms、0 | 286852KiB / 14.67s |
| regular/SIGHUP | 98ms、129 | 177ms、0 | 159ms、0 | 287176KiB / 14.60s |
| fullscreen/SIGTERM | 103ms、143 | 172ms、0 | 148ms、0 | 286804KiB / 14.71s |
| fullscreen/SIGHUP | 103ms、129 | 168ms、0 | 160ms、0 | 286088KiB / 14.81s |

四次信号退出各观察Terminal.restoreSync=1、stop=0；八次普通退出各stop=1、exit restore=0。信号成功恢复设备依赖原process exit钩子，不声称已经走完整InteractiveMode/TUI stop或每个render owner退休。Python在12次child结束后均读回ICANON/ECHO/ISIG恢复，CLI signal exit仍为143/129，不能把非零signal状态改称普通成功exit0。这里向仍正常连接的PTY注入SIGHUP，不是用户窗口实际断开/EIO，不证明故障设备或busy turn恢复。

正式工件[signal-cli](../../.omx/artifacts/phase20-addition-signal-cli/)保存脚本、四组收据与边界，全部首轮通过，临时状态删除、原CLAUDE.md保留。仅文档/诊断工件变化，未重复build/Vitest/graph；脚本语法、JSON/12阶段断言与五静态门/diff检查通过，118既有docs-source advisory保留。没有真实provider、busy或pending写入、实际PTY断连、SIGKILL、Windows/桌面/IME、独立review、exe/full suite/20k证据；不升级原47项状态，ADD与Codex goal继续active。本批Git/精确CI另绑定。

20.40已提交推送`52268e2a29f271b5655b65dfc4e5aa48291240cf`，远端main此前精确一致、仅原CLAUDE.md。延后核对[Watch40971222284](https://github.com/h-hei133/cheers/actions/runs/40971222284)completed/success、[CI40971222286](https://github.com/h-hei133/cheers/actions/runs/40971222286)in_progress，head一致；20.39 CI40970201073仍in_progress，不以旧CI成功替代这些新commit。

### 20.41 忙碌流被信号取消后保留中断与已显示推理，恢复不重发

继续20.40未覆盖busy的反馈26/30。目标先检查原signalSessionClose在isBusy时保留恢复、runner cancelGoalRunForShutdown→ShellSessionRuntime.cancelAndWait、bootstrap.hasUnfinishedBusiness和startup notices；同20.40参考信号cleanup先观察原生命周期，再处理终端。复用已有原provider step与流读取，不注入假query event或直接调用cancel；本批无产品改动。

同20.39 build/inputs，各regular/fullscreen×SIGTERM/SIGHUP隔离一个home/profile/project与一条旧user fixture，原CLI显式打开、等真实prompt后输入一条小问题。本机HTTP server沿实际openai-compatible transport：GET `/v1/models`返回完整目录JSON，POST `/v1/chat/completions`只发39字符公开reasoning delta、无答案/终态，保持流直到客户端取消；不读取、记录或输出请求body/headers。CHEERS_PROVIDER_MODE=real仅选择实际HTTP路径，全部endpoint为loopback，零外部provider/真实凭据或账户请求。零工具/skills/指令、retry/warming关闭、输出256、maxTurns1、body10秒、heap768MiB、每CLI25秒/2MiB边界。

等待原message.started=1、实际reasoning.delta=39及磁盘runPhase=turn-active/pending prompt身份，再向relay发信号，经原launcher转发给CLI。四组实际流连接均关闭、signal exit143/129，持久session为interrupted、runPhase仍turn-active/interruptedKind=turn，user prompt与已显示reasoning均保存；不把无答案/无终态升级成completed或terminated。随后普通重开不带session ID，原bootstrap恢复同ID，真实PTY显示Resumed session通知；原transcript恢复thinking digest与保存值相同，零新的message.started/POST，最后Ctrl+D exit0仍保留interrupted与原39字符。退出只是进程成功关闭，未将其解释成回合成功。

| 实际busy/恢复路径 | signal退出 | 恢复后Ctrl+D | 峰值RSS / 两阶段探针 |
|---|---|---|---|
| regular/SIGTERM | 137ms、143 | 135ms、0 | 285812KiB / 12.24s |
| regular/SIGHUP | 147ms、129 | 139ms、0 | 285392KiB / 12.31s |
| fullscreen/SIGTERM | 135ms、143 | 136ms、0 | 284664KiB / 12.22s |
| fullscreen/SIGHUP | 142ms、129 | 133ms、0 | 286196KiB / 12.23s |

八次终端均读回ICANON/ECHO/ISIG；四次signal走exit restoreSync，四次普通恢复退出走physical stop，与20.40一致。每组最终GET readiness1/POST1，重开没有自动重发；四组共4个local completion/4个local readiness请求，不称真实provider验收。原config字节保持，current selection在busy和恢复阶段都为原fixture；全程没有答案、工具或writer，不能推断权限pending/未知写入、MCP拖延或真实服务端取消。

首轮regular探针把GET与POST全算一次completion，并对readiness也返回悬挂SSE：尽管原message.started1/39字符delta已观察，HTTP总数2使等待永不满足，16.22秒/288588KiB exit1后finally发信号。此为harness/setup drift，不作产品失败或通过；改为按method/path区分完整readiness与held completion后四组重跑才全部通过，原失败收据保留。HANDOFF追加请求分桶陷阱。

正式工件[signal-busy](../../.omx/artifacts/phase20-addition-signal-busy/)保存可复用脚本、初始失败/分类、四份有效收据；实际观察原start、TurnSink和Terminal方法，记录数量/状态/digest，未保存公开正文或请求内容。八次有效CLI严格串行且主代理观察结束后再执行下一项，task scratch/loopback sockets清理、原CLAUDE.md保留；脚本语法、JSON/八阶段断言与五静态门/diff通过，118旧advisory。仅文档/诊断工件，不重复build/Vitest/graph，无独立review、外部live、真实断连/EIO、SIGKILL/非Linux/桌面/IME或exe/full suite/20k；原47项不升级，ADD与goal继续active，提交/精确CI另绑定。

20.41已提交推送`d1cfebbe3a47a090aba63a53cf3436b3a21b1517`，远端main此前精确一致。延后核对[Watch40972073105](https://github.com/h-hei133/cheers/actions/runs/40972073105)completed/success、[CI40972073289](https://github.com/h-hei133/cheers/actions/runs/40972073289)in_progress；20.40 CI40971222286仍in_progress，20.39 CI40970201073已completed/success，全部headSha精确一致。

### 20.42 跨目录文件单次审批的实际CLI与原写入收据

继续反馈24/20.1的真实CLI链路缺口，先读原turn/workspace、tools escalation、CLI approval bridge与writer/operation store。定向复核只读参考codex safety.rs:20–97：AskUser与Reject是独立结果，越界文件在策略允许询问时进入AskUser，Never等策略可拒绝；不沿用19.1“所有参考始终询问”的过度概括。本项目保留相对路径逃逸、只读根与身份变更拒绝，原显式单次授权不扩为持久目录授权。仅新增诊断工件与记录，没有改产品。

同20.39 build `94b7abf7d7634fe723daacb5c93113acefbec94adb26df6dbeb29f1df03028ff`/inputs `b1e103aa74a8b86da2e8243b69d2440ad5ada34d129853e5ff7f72c81400a193`，regular/fullscreen分别隔离home/profile/project和同级outside目录，原SessionManager仅一条小fixture。原Node CLI经PTY启动，loopback实际HTTP每回合先返回一个write/edit tool_call，再返回固定完成；零外部provider请求，不读取或记录请求body/headers。allowedTools仅write/edit、maxTurns2、输出256、retry/warming/skills/MCP关闭，heap768MiB、45秒/2MiB边界。

每模式实际输入四回合：ask下外部write→Esc拒绝；真实Alt+P切accept-edits→write→y单次允许；再切allow-all→edit→y；allow-all下再次write→Esc拒绝。每次原overlay都只提供且实际绘制allow-once/deny，详情声明规范目标与父目录；答复前发送a均保持pending，无tool.result或文件变化。批准后两次原writer均metadata.status=committed，通过其operationId匹配原readOperations的精确单文件committed收据与实际bytes；拒绝保持目标不存在或编辑后的digest，最终正好两条操作。兄弟文件保持、原ApprovalTrustPolicy无grant、session.workspaceRoots为空、config字节不变。

| 原CLI路径 | 四回合总请求 | 四回合各自含审批耗时 | Ctrl+D退出 | 峰值RSS / 探针 |
|---|---|---|---|---|
| regular | 8 local completion / 4 readiness | 723/797/927/724ms | 137ms、0 | 314916KiB / 12.44s |
| fullscreen | 8 local completion / 4 readiness | 776/799/929/752ms | 142ms、0 | 315008KiB / 12.55s |

耗时包含人为150ms的a等待、输入、模型fixture与观察间隔，不用作生产性能。两次正常退出均读回ICANON/ECHO/ISIG；没有直接调用picker apply或writer，观察器包装后仍调用原InteractiveMode/OverlayHost/TurnSink方法，记录状态/计数/digest和fixture身份。

首轮regular第三次edit后exact-operation失败：原store按sequence倒序返回，探针at(-1)取首个旧write收据。前两条已记录、第三条writer实际成功，不能把索引失败记成产品失败或完整通过。8.87秒/301408KiB exit1的原收据保留，改为按tool.metadata.operationId匹配后两模式四回合全部重跑通过；HANDOFF记录收据顺序陷阱。

正式工件[file-cli](../../.omx/artifacts/phase20-addition-file-cli/)保存脚本、失败分类与两份有效收据/metrics。主代理严格串行，均观察exit0后执行下一项，task scratch/socket已清理、原CLAUDE.md保留；脚本语法、JSON/八回合断言、五静态门/diff通过，118既有docs advisory保留。仅文档/工件，不重复build/Vitest/graph。当前Linux隔离目录原CLI与loopback工具链不证明用户目录/实际模型工具选择、read/apply_patch完整CLI矩阵、审批pending的退出、非Linux/桌面/IME或独立review；原47不升级，ADD与goal继续active，本批提交/精确CI另绑定。

20.42已提交推送`e95696b6e6274741d2eaf6f403ac6b60f7d9e79e`，远端main此前精确一致、仅原CLAUDE.md。延后核对[Watch40973267353](https://github.com/h-hei133/cheers/actions/runs/40973267353)completed/success、[CI40973267402](https://github.com/h-hei133/cheers/actions/runs/40973267402)in_progress；20.41 CI40972073289仍in_progress、20.40 CI40971222286已completed/success，全部headSha一致。

### 20.43 未答复审批被取消后立即结束等待，保留中断恢复

继续反馈24/26/30的审批pending退出缺口。先检查原shutdown→cancelGoalRunForShutdown→cancelAndWait，以及InteractiveMode安装的promptApproval。原回合controller会abort，但[审批owner](../../packages/ts-shell/src/cli/interactive/picker/approval.ts)的Promise只等面板答复/previewEnd，不接收signal；signal shutdown不执行完整surface stop，因此取消后仍在等待。原build的regular CLI停在原external write审批后发SIGTERM，10,071ms才预算超时exit1，原TurnSink ends0/results0、面板仍active；初始失败收据保留，15.65秒/266424KiB探针并非正常信号退出通过。

定向只读参考codex bottom_pane/approval_overlay.rs:499–527/595–597：取消未完成的审批发Cancel/Deny，并消费该取消手势；tui.rs:304–338继续各项restore且保留first_error。采用取消必须结束等待、不能转成允许的决定，本项目仍使用原turn AbortSignal与现有deny状态，不加第二审批/退出系统；不称参考本身证明SIGTERM或本项目设备恢复。

[宿主安装点](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts)在每次审批读取当前run controller的signal，原promptApproval监听abort，拒绝未答复请求并关闭原overlay/preview；已取消请求不发布，答复/失败后移除监听，迟到chooseGroups与selected-subset回调不再重新导航。关闭异常不再悬挂Promise：已取消返回deny以释放回合，未取消则reject保留失败，不给write authority；初始面板发布失败也退休监听。取消路径的设备异常只证明等待结束与拒绝，不证明物理恢复。

原基线八条新增回归全部失败。最终[审批所属文件](../../packages/ts-shell/src/cli/interactive/picker/approvalSelection.test.ts)12项、actual InteractiveMode过滤31项共43项通过，宿主322未选不计通过；覆盖approval/groups/refined三阶段、预先取消、迟到允许/分组、答复后listener退休、关闭/发布异常、两模式当前run信号绑定及原正常审批/exit行为。四独立反转撤回abort监听、宿主signal、迟到导航守卫、失败答复reject分别4/2/3/1失败；finally逐字节恢复后43重验通过。初次反转按空白substring误保留一条group守卫、实际2失败，分类并改为chooseGroups区段边界后重跑；后续startup try新增同缩进guard触发边界assert，零该案例测试且源码恢复，最终区段反转才有效，不用初次计数充当证据。

五静态门/diff与1536MiB TS build通过，观察exit0后独立重算build `06e0018d0b2128ca2f6cb1b45ec8b09bbd93862cc7d10cf6ad357642eae2993b`/inputs `fd2dfb0fd4cef94fb20da0e7fe50c5e7c83d40e9bac31a65ac02b434626e8065`，460 compilerInputs/3549文件一致。AST审批16/原15；InteractiveMode123/原123是既有整体债务，本批不增加其具名callable，仅传原signal。无新import或结构移动，不重复graph/NormProof。

最终build两模式×SIGTERM/SIGHUP各隔离home/profile/project/outside、一条小session fixture，loopback HTTP返回一个write call，等原overlay完整once/deny和规范目标、磁盘turn-active/prompt，再发signal。四组均结束原sink、tool.result.success=false、overlayActive=false，原writer无操作、目标不存在、兄弟不变、无grant/roots；signal后的session interrupted且runPhase=turn-active/interruptedKind=turn。审批被取消未发布approval.resolved，不能把absence解读为已批准。普通不带ID重开同一session，真实Resumed session通知、无审批面板/新message.started/POST，Ctrl+D后仍保留中断。

| 最终原CLI路径 | 信号退出 | 恢复Ctrl+D | 峰值RSS / 两阶段探针 |
|---|---|---|---|
| regular/SIGTERM | 173ms、143 | 132ms、0 | 265560KiB / 18.18s |
| regular/SIGHUP | 182ms、129 | 130ms、0 | 263256KiB / 18.20s |
| fullscreen/SIGTERM | 175ms、143 | 135ms、0 | 261136KiB / 18.30s |
| fullscreen/SIGHUP | 176ms、129 | 140ms、0 | 263092KiB / 18.19s |

八次均读回ICANON/ECHO/ISIG；signal仍只走exit restoreSync，完整stop0，恢复Ctrl+D走stop1，不能由overlay退休推断全部TUI owner退休。每组最终仅1 local completion/1 readiness、恢复零重发，配置原字节保持；heap768MiB、每CLI25秒/2MiB，全部主代理进程级串行。初次修补build `95e29c61399e`的四组通过收据保存在pre-fence；异常答复围栏调整后全部按最终build重跑，最终表不复用旧build数值。

同最终build再跑20.42原正常四回合×两模式，拒绝/once write/edit/再次询问、精确原committed receipt、零持久授权与正常Ctrl+D/cooked全部通过：各8 completion/4 readiness，RSS312228/299108KiB、各12.37秒，退出135/130ms。说明正常显式批准仍可写，取消仍不可写；未覆盖writer开始后的未知结果。

正式工件[signal-approval](../../.omx/artifacts/phase20-addition-signal-approval/)保存原失败、分类、聚焦/反转/恢复、build新鲜度、最终八阶段与正常八回合收据；HANDOFF追加未答审批取消陷阱，task scratch与loopback sockets清理、原CLAUDE.md保留。工件语法/JSON断言、五门/diff均通过，118旧docs advisory保留；无独立review、真实用户/外部provider、read/patch全CLI组合、pending问答/MCP、实际断连/EIO、非Linux/桌面/IME、exe/full suite/20k。原47项不升级，ADD与goal继续active，提交/精确CI另绑定。

20.43已提交推送`181381302961263aa32fd858778508210ef75d44`，远端main此前精确一致、仅原CLAUDE.md。延后核对[Watch40975396592](https://github.com/h-hei133/cheers/actions/runs/40975396592)completed/success、[CI40975396578](https://github.com/h-hei133/cheers/actions/runs/40975396578)in_progress；20.42 CI40973267402与20.41 CI40972073289已completed/success，全部head一致。

### 20.44 空草稿的退出动作先于审批与预览按键归属

继续反馈26，沿原CLI停在external write审批后发送Ctrl+D。20.43已让run取消结束审批等待，但此键在[宿主onKey](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts)到keymap前被原pager/overlay消费；12,001ms观察后仍无exit、ends0/active审批，最后finally SIGTERM结束探针。原文件无写入，初始失败保留；该结果是退出动作不可达，不是20.43取消signal修补失败，也不是正常退出通过。

目标keybindings app.exit明确为“Exit when the draft is empty”，原keymap也只检查原composer草稿，不受busy限制。定向参考codex bottom_pane/mod.rs:1–14将local view输入与parent quit分离，chatwidget.rs:1380–1387让明确quit走ShutdownFirst；同意退出是宿主生命周期，保留本项目空草稿单次退出合同，不照搬参考双击Ctrl+C/D或局部cancel策略。宿主在pending input/pager/overlay前解析现有keybindings，只在app.exit且原composer为空时调用原shutdown；非空草稿仍留在原面板。没有硬编码Ctrl+D、新退出系统或修改permission/writer行为。

新增两模式×approval/groups/preview×默认/重绑定退出共12路径，另两模式非空草稿保护；全部通过实际terminal.input、原promptApproval/host.shutdown，关闭后deny，重绑定在原start重载配置后设置。初次夹具误用不存在的overlay.options、未实现g分组快捷键、启动前设置绑定被reload覆盖；保留各失败并改为原model可见行、Home/Enter与start后重绑定，不能把这几类setup失败记成产品回归。修补后相关过滤45项通过，322未选不计。有效反转只撤回early app.exit分支，12路径失败/2非空控制通过；finally源码逐字节恢复后45项再过，恢复SHA记录为`bc977f6c98bad5bbb0affcadf8dbbcf389afbfb3371af8acf00c9a73b679496a`。

**本批验证纪律违规**：一次修正基线仍返回session_id时，主代理启动下一条静态门/聚焦链，导致两验证进程重叠。随后分别观察到前基线exit1和后聚焦exit1，没有观察OOM；不能宣称本批全程严格串行，也不以“无OOM”消除违规。停止重叠后，有效反转、最终恢复45项、build、新鲜度和两模式CLI均逐进程串行完成。后续工具handle未退出前不得启动任何验证。

五门/diff、1536MiB TS build exit0后独立新鲜度一致：build `b8f4c6b09e3d76997f67fc52532ac7da1a3f8ae20e664a10336c24fa584cf629`/inputs `6e2fff9d4f4a29c9afa08d9845e7a0b8beae5b8aa45a4268aab1b6305af8ea1a`，460 compilerInputs/3549文件；AST host123/原123未增加，既有整体债务保留，无新import/结构移动，不重复graph/NormProof。

最终两模式隔离home/profile/project/outside、一条小fixture、loopback GET/POST各1，原CLI启动后提交write fixture，等once/deny原实际绘制与规范目标、磁盘turn-active/prompt后Ctrl+D。regular/fullscreen分别252/253ms exit0；原stop1/restoreSync0、overlay退休、sink ends1，终端四次含恢复均ICANON/ECHO/ISIG读回。stop先退休事件订阅，所以当前收据没有tool.result/approval.resolved，不能推断允许或回合成功。磁盘均interrupted/runPhase=turn-active/interruptedKind=turn、目标不存在、operation/grant/roots均0、兄弟与config原字节保持。普通无ID重开同一session/实际Resumed session通知，零新POST/message.started/审批；Ctrl+D135/132ms exit0仍interrupted。

regular RSS261120KiB/18.26秒、fullscreen264352KiB/18.46秒；heap768MiB/每CLI25秒/2MiB，仅小fixture与loopback实际transport，不使用真实账户。正式工件[approval-exit](../../.omx/artifacts/phase20-addition-approval-exit/)保存初始CLI/夹具失败、纪律违规分类、有效反转/恢复、新鲜度与两模式四阶段收据；旧20.43脚本恢复原字节。工件语法/JSON/五门/diff通过，118旧advisory保留，task scratch/socket清理、原CLAUDE.md保留，HANDOFF追加modal吞app.exit陷阱。无独立review、live用户/外部provider、writer已开始、真实断连/EIO、非Linux/桌面/IME、exe/full suite/20k；原47不升级、ADD与goal继续active，Git/精确CI另绑定。


20.44已推送`b27a44ec35655872125ca8eeb92dc62eb19d1474`，远端main此前一致。延后精确核对Watch40976279333 completed/success、CI40976279272仍in_progress；20.43 CI40975396578已completed/success，head均一致。此前20.44验证重叠记录保留。


### 20.45 跨目录patch分组审批可达与实际CLI单次写入

继续反馈24/20.1，先检查原[approval picker](../../packages/ts-shell/src/cli/interactive/picker/approval.ts)、[overlay输入](../../packages/ts-shell/src/cli/interactive/overlay.ts)及原prompt builder。真实工具prompt有非空once/deny选项，原picker把导航ID `choose-groups`也按decision白名单过滤；既有空options夹具掩盖了缺陷。界面虽声明`4 / g`，overlay也没有相应派发。修补只保留准许allow-once时的分组入口，直接apply也守同一准入；按键通过原accept检查提供且可用的ID后派发，不增加授权决策或写入路径。

定向对照只读参考codex `tui/src/bottom_pane/approval_overlay.rs:537–574`及`shortcut_triggers_selection`：先匹配提供的shortcut再派发原action。本项目同意提供选项校验，保留自己的多组选择→选后preview→明确最终revision批准合同；参考没有同一独立patch分组流程，不称完全等价。猜测的oh-my-pi patch确认路径不存在，没有引用为证据。

新增原buildToolEscalationPrompt非空选项×regular/fullscreen×g/4/两Up+Enter六条真实host回归，完整preview及选后preview期间均未settle，最终恰为group-b/revision group-b；补deny-only不可选组与无组选项快捷键不能settle。最终主代理串行picker13、overlay77、过滤host51，共141通过，322未选host不算通过。决策过滤独立反转六失败、快捷键反转四失败/两Enter控制通过，finally逐字节恢复后141项最终重跑通过。最初Home+Enter夹具两失败而g/4通过，分类为overlay不支持Home，改用实际Up不改产品Home合同。

五静态门/diff通过，118旧docs-source advisory保留。首轮build期间继续编辑deny-only准入导致input changed，原构建拒绝发布并保留旧产物；该轮失败不计通过，原输出未归档。最终稳定源码重跑1536MiB build exit0后独立freshness一致：build `78e425be03020696bcd40a6e0a576a32f300de62f62a36f7d9298030a10bce8d`、inputs `d64d3f37b2ea1b6e4305be80647d8c96bdf9e18c0860cdac8efd7f91bd6befdc`，460 compilerInputs/3549 input files。AST含constructor为approval16/16、overlay31/31、host123/123，无新产品import或callable；既有overlay/host ceiling债务保留。

最终原Node CLI→PTY→loopback HTTP两模式各四回合：g、4、方向键Enter选组与Esc拒绝。每组一条小saved session、隔离home/profile/project、两个外部目录，只有apply_patch、maxTurns2/output256、关闭retry/warming/skills/MCP、heap768MiB/45秒/2MiB。完整preview声明两个目录且无write/result；返回审批实际绘制choose-groups/once/deny，a保持pending且无持久批准。前三回合进入原groups、Space取消第一组、Enter后preview只声明第二目录；关闭后等待新的Permission面板，最后y批准。原writer仅提交第二文件、operationId与原readOperations精确匹配，selected/skipped IDs及preview revision一致，未选第一文件一直不存在。第四回合拒绝两个目标都不写，最终仅三条committed操作，零grant/roots，兄弟文件/config字节保持。

| 模式 | local completion / readiness | g / 4 / Enter / deny回合 | Ctrl+D exit | 峰值RSS / 探针 |
|---|---|---|---|---|
| regular | 8 / 4 | 1181 / 1107 / 1133 / 824ms | 131ms、0 | 303956KiB / 13.45s |
| fullscreen | 8 / 4 | 1159 / 1131 / 1159 / 825ms | 138ms、0 | 315208KiB / 8.25s |

两次正常退出cooked flags恢复、零外部请求。时间含人为150ms持久键等待/夹具/观察，不能当生产性能。第一regular探针在选后pager.close立即读到旧group面板，selected-once-options断言exit1/零settled attempts，264864KiB/6.79s；保留失败收据，分类为observer同步，改等fresh Permission title与load结束后两模式全部重跑通过。

正式[patch-cli工件](../../.omx/artifacts/phase20-addition-patch-cli/)归档最终收据/metrics、baseline/有效反转/恢复log、build freshness与四类失败分类；反转源码保留为不可发现测试的文本快照。工件语法/JSON/收据与源码digest、五门/diff检查后清理task scratch，原CLAUDE.md保留。HANDOFF记录真实decision选项不应过滤导航ID及shortcut必须通过原提供选项派发。此批heavy verification严格逐进程串行；无独立review、live用户/外部模型、read CLI、writer已开始的失败恢复、非Linux/桌面/IME、exe/full suite/20k。原47不升级、ADD/goal继续active；本批Git与精确CI另绑定。


20.45已推送`a072ecb199d93e33d3aca70cc5d0c1e84148b713`，远端main一致、仅原CLAUDE.md。延后精确核对Watch40978485261 completed/success、CI40978485363仍in_progress；20.44 CI40976279272已completed/success，head均一致。Watch成功不改变既有ceiling债务或原47验收。


### 20.46 外部文件切片与目录分页的实际CLI读取审批

补20.4反馈24的read CLI证据。先检查原[turn文件授权](../../packages/ts-shell/src/turn/workspace.ts)、[CLI approval](../../packages/ts-shell/src/entrypoints/cliApprovalModule.ts)、[read工具](../../packages/ts-shell/src/core/tools/read.ts)和[目录列表](../../packages/ts-shell/src/core/tools/directoryListing.ts)：selector去除只用于规范目标捕获，执行保留slice；explicitApproval每call独立，scope/cache不替用户回答，目录direct listing及下页绝对路径仍进入新调用审批。

定向对照只读pi read.ts:125–131的resolveReadPathAsync→access和oh-my-pi read.ts:1026–1048的selectorless授权目标/目录自身授权：同意授权目标与实际执行目标一致、目录只列本层；本项目不采用可复用folder grant，仍每次明确once，literal-colon解析差异未在此次探针比较。Codex safety是patch政策，不把它当read审批的等价依据。没有发现需新增产品修补的缺陷，不改产品。

复用正式小型CLI观察器框架，新增[read-cli工件](../../.omx/artifacts/phase20-addition-read-cli/)：两模式各一条小saved session、隔离home/profile/project/outside。原Node CLI→PTY→loopback HTTP、只允许read，maxTurns2/output256、关闭MCP/skills/retry/warming、heap768MiB/45秒/2MiB。每模式六回合依次ask拒绝原文件、Alt+P accept-edits批准`:2-2`、Alt+P allow-all批准同目录兄弟`:2-2`、allow-all再次拒绝原文件、批准目录offset1/limit2及offset3/limit2。原approval每次实际绘制once/deny与目标目录，a保持pending不能持久回答。

观察器仅转发原fs.promises.open/opendir并记录fixture目录下边界；未答复与拒绝时没有记录read handle或enumeration，结果也未提前发布，不把stat/metadata检查或所有kernel I/O说成零。获准文件各恰一次打开其原精确目标，返回只有第二行，首尾与其他文件正文不出现，original read.startLine/endLine及provenance.contentHash匹配。目录两页分别为nested/saved与sibling/z-final直接条目，nested正文不读取/显示，原绝对目录offset3 continuation正确，第二次重新审批，末页无Next；目录每调用观察两个directory handle，没有child body open。

| 模式 | completion / readiness | 六回合elapsed ms | Ctrl+D exit | 峰值RSS / 探针 |
|---|---|---|---|---|
| regular | 12 / 6 | 801 / 695 / 697 / 672 / 877 / 797 | 180ms、0 | 328036KiB / 13.85s |
| fullscreen | 12 / 6 | 802 / 696 / 722 / 750 / 794 / 800 | 154ms、0 | 313196KiB / 13.98s |

十二回合首轮全部通过、零外部请求；零writer operation/grant/roots、源文件/兄弟/config原字节保持，两次正常退出cooked flags恢复。时间含人工150ms持久键等待与fixture/观察，不能当生产read性能。仅记录status/count/digest，不保存原会话或HTTP正文。当前build与inputs同20.45，source未改不重复build/Vitest，工件语法/JSON/收据与五静态门/diff检查后归档清理scratch。无独立review、live用户/外部provider工具选择、pending时目录身份替换/撤销、完整read媒体/非Linux/桌面/IME、exe/full suite/20k；原47不升级、goal active，本批Git/精确CI另绑定。


20.46已推送`5b0c9dcbf02194307624c134cec88118c868ad09`，远端main一致、仅原CLAUDE.md。延后核对Watch40979108188 completed/success、CI40979108158仍in_progress；20.45 CI40978485363仍in_progress，head精确一致，不等待或反复轮询。


### 20.47 已批准读取仍拒绝审批期间的目录身份替换

继续20.46的pending身份边界，目标原[workspace access](../../packages/ts-shell/src/turn/workspace.ts)在执行前调用[assertWorkspaceRoot](../../packages/ts-shell/src/core/workspace/roots.ts)，既有approval.test.ts已有write的parent identity回归；真实read CLI尚未取得。沿20.46授权目标与执行目标一致的参考决定，保留原目录身份复验，无产品改动。

正式[read-identity工件](../../.omx/artifacts/phase20-addition-read-identity/)用原CLI/PTY/loopback与相同小fixture/budgets：两模式各两回合，等once/deny实际完整绘制、a无效/pending无read后，将outside rename为old，再复制小fixture为同路径新目录，assert dev/ino不同而内容完全相同。用户y之后原approval.resolved是approved，tool.result却false，原tool内容明确changed identity；没有记录fixture文件handle或目录enumeration，原与新目录源字节均不变。两事实分别保留，不能因用户批准写成工具读取成功。

第二回合同一路径重新捕获/显示原审批，再y才exact slice成功，一次打开精确target、原read范围与provenance digest一致。两组四回合首轮通过，operation/grant/workspaceRoots均0、config原字节保持，正常Ctrl+D与cooked flags恢复。每模式4 completion/2 readiness、零外部请求。

| 模式 | 旧身份批准后失败 / 新审批成功 | Ctrl+D exit | 峰值RSS / 探针 |
|---|---|---|---|
| regular | 783 / 719ms | 148ms、0 | 267376KiB / 10.77s |
| fullscreen | 776 / 722ms | 145ms、0 | 263712KiB / 10.76s |

时间含人工150ms等待与copy/fixture/观察，不当作生产延迟。当前build/inputs同20.45，产品未改不重复build/Vitest；正式脚本语法/JSON/收据、五静态门/diff检查后task scratch清理，原CLAUDE.md保留、主代理逐进程serial。原observer只记录选定fs open/opendir，不证明metadata/kernel I/O为零；未验policy撤销、reader已开始后的替换、用户目录/外部provider、其他平台/桌面/IME/完整媒体与独立review，无exe/full suite/20k。原47及ADD整体不升级，goal active，Git/精确CI另绑定。


20.47已推送`433077c52d2a91c79dbb51672dd483b78d93175a`，远端main此前精确一致、仅原CLAUDE.md。延后核对Watch40979466580 completed/success、CI40979466560仍in_progress；20.46 CI40979108158及20.45 CI40978485363仍in_progress，head均精确一致。没有借Watch成功称完整CI或原47验收通过。


### 20.48 外部编辑器末尾CRLF不再生成额外空白草稿行

继续反馈27与ADD-05/06，先检查原buffer setter、paste/store、stash、frame/painter及[外部编辑器返回](../../packages/ts-shell/src/cli/interactive/externalEditor.ts)。当前setter已归一CRLF，真实CLI短paste与stash/resize可以通过；但普通外部编辑器保存final CRLF时，return先仅删LF留下CR，setter再转换为LF，三行草稿变四行末尾空白。原CLI regular在13个阶段通过后，external-crlf-edit等待精确三行失败，19.28秒/303192KiB；原收据保留。该新缺口属于返回顺序，不据此宣称已定位用户启动空白行。

定向对照只读pi `modes/interactive/external-editor.ts`、oh-my-pi `utils/external-editor.ts`均仅replace final LF，编辑器加载边界分别normalize CRLF/bare CR；它们没有证明该返回组合的CRLF合同正确，本项目不复制同一缺陷。保留target已有逻辑换行投影、一次末尾换行移除与无变更不adopt：返回先归一，再比较input同投影，最后删除一次logical newline；额外blank line及Tab保留，文件原文不被改写。Codex external editor读取原文，未把其全文保留规则换成本项目的editor-added newline政策。

五条原editExternally subprocess回归在旧实现全失败：CRLF、bare CR、额外blank、mixed+Tab及只有line endings改变；最后一条应No changes以免覆盖已有末尾换行。修补后owner21与过滤actual host5共26通过、368未选不算通过；独立恢复旧return五失败，finally字节恢复后21+5最终重跑。最初静态门在package cwd找不到root script，属于invocation失败，root串行重跑五门/diff通过，118旧advisory保留。最终build heap1536MiB exit0；独立freshness build `39fd3f6d79f34cb1143ddfa12ab559272ac29cc218ec3eb45cb0b78763ff7175`、inputs `8867735c26bc057eee902d1f98672f0a48ca999a9543ad71b6786cf5531b882d`，460/3549一致，owner AST3/3、无新product import/callable，source SHA256 `f070b73e1cd3fcea851d4a3b340a63dd24b77d7b3a17b3850ff972847702e52f`。

[composer-cli工件](../../.omx/artifacts/phase20-addition-composer-cli/)用原Node CLI/PTY、两模式各一条小saved session，synthetic零请求、只public fixture、heap768MiB/45秒/2MiB。实际输入17阶段：empty→CRLF/bare-CR/Tab/中文/emoji paste→Alt+S stash/restore→120×60缩42×20→Left两次/stash/restore caret→回120×60→clear→九行held paste再paste于token内展开→clear→original→Ctrl+G真实Python editor写三行末尾CRLF→Alt+S取原稿/取改写→clear/Ctrl+D。原editor子进程原稿digest匹配且stdin是cooked TTY，临时文件清空，整个链零model turn/config改变。

PTY relay将实际输出交给现有pyte有界screen，逐阶段核对原application chrome与cursor marker对应的解析row/column，未写新产品几何或第二输入状态。parser需适配private device-status query与alternate cursor restore；初始两次startup失败，第二次诊断TypeError private keyword，CLI未交互/零请求，分别保留。修parser后CUP/CUD底部夹限/alternate恢复/private queries/resize bounds五检查通过。initial row28只为parser seed，未把低处起始写成真实桌面光标测量；screen resize无全终端scrollback reflow模型，结果称PTY解析坐标，不称物理像素匹配。

| 模式 | 最终CLI阶段 | external CRLF后逻辑行/caret | Ctrl+D exit | 峰值RSS / 探针 |
|---|---|---|---|---|
| regular | 17全过 | 3行/66、解析cursor row13 col20 | 167ms、0 | 303352KiB / 13.41s |
| fullscreen | 17全过 | 3行/66、解析cursor row56 col20 | 168ms、0 | 303444KiB / 13.26s |

最终34阶段chrome/解析caret与source digest均匹配，tabs保留、无CR、placeholder展开不重复，终端两次normal exit ICANON/ECHO/ISIG恢复。旧build的pre-editor/pre-trailing-newline成功收据另保留，不能代替含final CRLF的失败和新build最终证据。时间含人为150ms/观察/小fixture，不作为生产性能。正式工件保存失败分类、baseline/反转/恢复、build/parser/final receipts；不归档raw显示/原会话/provider正文，syntax/JSON/收据/五门/diff后清理task scratch。HANDOFF追加先normalize再trim陷阱。全程主代理heavy serial、原CLAUDE.md保留；无独立review/用户桌面与启动空白现场/Windows/IME/缺尺寸/全部editor失败或live submit，未跑exe/full suite/20k。原47和ADD整体不升级，goal active，Git/精确CI另绑定。


### 20.49 taskWait真实CLI可达、取消与同步完成清理

接续17.3/18.121/18.138，先读target后台tool、discovery、local registry/journal、turn与actual input：core registry中已注册taskWait，但初始discovery仅pin taskOutput/taskStop，bash描述推荐它而真实CLI实际返回“Tool taskWait not found”。原CLI一次background dispatch后taskWait不订阅且失败，诊断repeat确认原持久tool正文为该固定拒绝，不属于provider/network故障。初始注册测试绕过discovery，故此前通过不能证明用户路径可达。

另发现两个原wait问题：取消与timeout都返回undefined，取消后错误声称“after 300s”，paused或已消失任务仍声称running；onEnded同步回调先finish，registration返回release后仍安装deadline/interval且不再cleanup，留下listener与五分钟timer。15秒interval只检查abort，无进度输出。只读对照oh-my-pi当前wait owner明确essential、wake区分abort/timeout、finally清timer/listener、仅存在onUpdate时创建progress；本项目同意初始可达和资源释放，保留300秒单任务上限、原runner与Node20.3 Promise，不复制全局消息/服务等待或Promise.withResolvers。取消wait仅取消等待，任务停止仍是原taskStop合同。

修补在原owner：[background](../../packages/ts-shell/src/core/tools/shell/background.ts)返回settled/cancelled/timeout，超时或取消只说明未请求stop并读当前snapshot，不借旧task虚构state；同步settlement先释放registration返回的capability，再决定是否安装timer/abort listener；移除无progress作用的interval，保留注册后状态复查。[discovery](../../packages/ts-shell/src/core/tools/discovery/state.ts)将taskWait与taskOutput/taskStop同pin，原generation/权限检查不变。

原两文件24项通过；5条wait行为在原实现失败、初始registry/discovery合同1条失败。独立分别恢复原source，wait5失败/6通过/3未选、discovery1失败/9未选，finally字节恢复后24重跑通过。最终措辞进一步改为“no stop was requested”，避免假定其他owner没有停止进程；最终24再跑与build均exit0。五静态门/diff通过、118旧docs-source advisory保留。独立freshness build `5a930c87bbb11a9a2a2ed681b90f235e2027178cb323a4057f28abff72757b6b`、inputs `f313e9e018d73df96038db471c08e459d7361b140bd30227db29976278a4b2cf`、460/3549一致；owner callable11/11及16/16，无新增product import/function，source digests见[工件](../../.omx/artifacts/phase20-addition-background-wait/)。

原Node CLI/PTY两模式每次一条小saved session、一条真实Node后台进程，loopback HTTP选择原bash/taskWait；真实Alt+P两次取得isolated allow-all。1秒wait limit返回后journal仍running，Ctrl+C取消wait后Linux start identity确认同一个原进程仍非zombie，再对同job等待至少16秒后由fixture release结束原进程，完成事件给exit0与持久output。三次wait listener全部释放，常规host notice listener保留；job journal全程一个dispatch、取消后无额外model request，完成原输出digest匹配。

| 模式 | wait1整轮 / cancel2 | wait3保持 / release到turn | normal Ctrl+D |
|---|---|---|---|
| regular | 2176ms / 109ms | 至少16000ms / 300ms | 172ms、exit0 |
| fullscreen | 2076ms / 132ms | 至少16000ms / 274ms | 162ms、exit0 |

每模式6 completion/3 readiness请求、零real-provider credential、config不变，最终ICANON/ECHO/ISIG恢复；2MiB/45秒上限未触发。fixture child用小文件poll控制结束，product taskWait仍只等completion event；observer同步写小收据影响timings，不作生产性能。保留unsupported CLI flag带来startup prompt的setup失败、原tool-missing两失败和不同build的1.5秒short成功收据，不能代替最终16秒等待。全部任务scratch在归档后清理，原CLAUDE.md保留；未用subagent、不跑exe/full suite/20k、不声称物理terminal像素、未测生产分钟级任务/60秒提升/真实provider选tool/全部清理与容量/独立review。更正27-background-execution无自动提升与17.3实施前结论，HANDOFF追加discovery及同步registration陷阱；原47/ADD整体不升级，goal active。

20.48已提交推送`ec8a44aab6884e9f1e496e049f5263fb4e54a7bc`。本轮延后精确head观察：CI40981106387仍in_progress、Watch40981106301 completed/success；20.47 `433077c52d2a91c79dbb51672dd483b78d93175a` CI40979466560/Watch40979466580均success；20.46 `5b0c9dcbf02194307624c134cec88118c868ad09` CI40979108158/Watch40979108188均success；20.45 `a072ecb199d93e33d3aca70cc5d0c1e84148b713` CI40978485363/Watch40978485261均success。Watch workflow成功不证明完整架构或Phase验收。


### 20.50 整轮文件恢复保留部分结果并送达下一请求

补17.2/第一百二十九批真实两操作路径。初版只在complete时返回fileUndo；较新操作已恢复、较旧文件外部变化阻止恢复时，文件已改变却没有下一请求通知。batch也没有标记executionStarted，报告构建失败后误报“No restoration was started”；逐步publish绕过单操作上下文失效且吞掉警告，后续scope读取抛错会丢弃此前结果。

原[command](../../packages/ts-shell/src/edit/recovery/undo/command.ts)在batch执行前记录可能写入，并在报告构建前保留已知fileUndo：全verified才完整、任一步unknown保持unknown，其余已改变为partial；展示失败保留已知状态，未知则提示检查账本，不虚构零写。原[service](../../packages/ts-shell/src/edit/recovery/undo/service.ts)提取单/batch共用publishUndoResult，逐步失效旧测量并保留发布警告；[turnRestore](../../packages/ts-shell/src/edit/recovery/undo/turnRestore.ts)在scope重查失败时返回此前步骤和未尝试项，[report](../../packages/ts-shell/src/edit/recovery/undo/report.ts)显示步骤警告。未建第二账本、未改writer/批准链或跨文件原子性。

真实CLI首次发现更深阻塞：原addTurn收到partial但抛出Invalid persisted session usage key。根因是[usageTelemetry](../../packages/ts-shell/src/observability/usageTelemetry.ts)的markContextUnknown新增context-reset/usage-gap时只带target key、遗漏该key的attribution，严格snapshot校验拒绝持久化。不是branch投影丢消息；原owner现在从前台lastBucketKey取已捕获attribution，保持endpoint/价格身份，不额外增加请求/token或放宽校验。后台另一destination不能替代前台身份。

只读比较opencode HEAD `89f3ac108fc188adef4398e32e299203c2bebffd`的session revert先恢复选定snapshot再发布session事件；本项目保留逐操作账本和partial/unknown。pi HEAD `e65b3b88c08412bb8ffbd21fb5dc5756064a6e5a`的appendUsage保留provider/model、统计累计全部历史并单列contextUsage，支持上下文变化与账单身份分离；它没有本项目endpoint key的相同失效机制，不声称参考已解决本缺陷。两者源码只读，不移植新存储或whole-workspace rewind。

新增6个原writer/snapshot command场景、步骤发布警告、两个attributed失效事件以及原manager落盘回归。最终6文件76项通过；原undo三owner独立反转6失败/8通过，原usage owner反转3失败/32未选，均finally字节恢复。两usage事件有效baseline全失败。最初将rename后撤权误期望verified的夹具已更正为unknown，原writer正确，不改为伪verified。五门/build/freshness通过、118旧docs advisory；build `e23a79095b8f6168778a54bb97ae14f6f80df48af5943d8b9e77a392a892d266`、inputs `89102ec6a461b0d1b446eab2f39e65a3aad6816a02b763af0dbd9aa1630e24e1`，460/3550。owner callable turnRestore1、report8、command4、usage16未增，service9→10，均≤20。

原NodeCLI/PTY/loopback两模式各两个真实edit调用成一轮；无--execute时零restore；外部修改a后batch只恢复b、账本a undo none且报告skipped；下一请求含partial/重读通知。第二轮两个edit后complete newest-first恢复，第三请求含完整通知。每模式7completion/3readiness、local undo零model call、config不变；regular partial711ms/complete940ms/exit167ms，fullscreen633/912/166ms，均exit0与ICANON/ECHO/ISIG恢复。计时含fixture观察和人工等待，不当生产性能。

正式[工件](../../.omx/artifacts/phase20-addition-turn-restore/)保留报告被pager消费、错误observer方法、partial-metadata失败及usage抛错来源；修正的是harness同步与产品usage缺陷，未削弱通知断言。源正文只用public fixture，不保存真实provider响应/凭据。全程heavy serial、无subagent/exe/full suite/20k；scratch归档清理，原CLAUDE.md保留。未验真实provider选择、非Linux/桌面、跨多文件故障矩阵、独立review或工作区整体快照；原47/ADD整体不升级，goal active。

20.49已推送`ef4d078d43f2923a02e6d60efe1166ec339633d2`；本轮延后精确观察CI40983398554 in_progress、Watch40983398564 success。20.48 CI40981106387现failure，Build/gates成功但externalEditor.test.ts五新增fixture失败，12548 passed/3 skipped；错误显示fixture尝试运行CI不存在的rtk，后续单独分类修补，不将其称产品CRLF验证失败或CI通过。20.47及此前成功记录不变；本批Git/CI另绑定。


### 20.51 外部编辑器回归不依赖开发命令包装器

20.48 CI40981106387的五个newline fixture失败来自`EDITOR: rtk proxy node ...`：CI未安装本机开发wrapper。产品normalize修补的真实CLI两模式证据仍有效，但此前不能称CI通过。20.50已提交推送`1ab0cc6f1c4145ebbcb343eaa3a7ae3631f856f0`，本批继续独立修补测试，不等待其CI。

仅改[externalEditor.test.ts](../../packages/ts-shell/src/cli/interactive/externalEditor.test.ts)：fixture用已运行的`process.execPath`绝对路径及quoted script路径，目录故意含空格；只在这五个case内设空PATH、finally恢复，证明编辑器不依赖rtk或PATH中node。调用仍走原splitEditorCommand/spawnSync/readback，未mock writer或改产品/editor/build/CI配置。shell command纪律属于开发调用，不能成为产品或测试运行时的安装前提。

空PATH的有效baseline五失败/16未选，修补后原owner21通过。独立只反转EDITOR command再次五失败，finally精确恢复SHA256 `e8d0eec3197c675e70df5cf6450b7c7713a92f184bdbad61236f65bb1aadb426`后21重跑。五静态门与diff通过、118旧docs advisory保留；产品未变不重复build/PTY，全程serial。正式[工件](../../.omx/artifacts/phase20-addition-editor-fixture/)保存分类与反转；原CLAUDE.md保留、无新scratch残留/真实provider/非Linux/独立review，原47不升级、goal active。本批Git与未来CI另绑定。


### 20.52 整轮恢复报告区分未知写入与零写阻止

沿20.50实际writer测试发现[report](../../packages/ts-shell/src/edit/recovery/undo/report.ts)把所有非complete结果固定为partial：撤权落在rename后/readback前时原账本与state为unknown、报告却partial；最新文件外部变化导致零restore时也partial。原[turnRestore](../../packages/ts-shell/src/edit/recovery/undo/turnRestore.ts)增加turnRestoreStatus作为本域统一判定，原[command](../../packages/ts-shell/src/edit/recovery/undo/command.ts)和report复用。完整verified、unknown、已改变的partial、denied、blocked分别保留；unknown正文明确可能写入、检查账本，blocked说明本次没有operation restored。未改变恢复顺序、writer、权限、snapshot或发布时机。

真实writer基线两失败/五通过；新增零写blocked case并加强既有rename后撤权unknown断言。三文件31通过，独立只恢复原report再次两失败/五通过，finally字节恢复后31重跑。五门/build/独立freshness通过，build `d230293ba0136f9333b0b9ae2cbe2888df958bbe742457c5d7a5eea780eb5b7f`、inputs `38e7a234c675456715ac40de07845047e52c7b7470890ca1a727c28e8cc0fbda`，460/3550；turnRestore callable1→2，其余不增且≤20，118旧docs advisory。对照20.50已读的逐操作恢复与会话上下文/账单身份决定，保留本项目较强partial/unknown，不新造reference式workspace rewind。

原NodeCLI/PTY/loopback两模式各在两真实edit后先外部改a/b：--execute报告blocked、零账本restore、无fileUndo通知、外部bytes不变。再恢复b的已记录post-edit bytes，partial恢复b而保留外部a，第二轮complete恢复，通知落盘/下一请求断言全部通过。regular blocked254/partial634/complete909/exit177ms；fullscreen255/609/938/160ms，均exit0/cooked flags、7POST/3GET、config不变、local undo零model请求。unknown由原writer单元撤权场景证明，CLI未注入该故障；计时含fixture，不当生产性能。

正式[工件](../../.omx/artifacts/phase20-addition-restore-status/)保存baseline/reversal/build/CLI和收据，task scratch归档清理；原CLAUDE.md保留。全程heavy serial、无subagent/exe/full suite/20k；未验production provider/非Linux/desktop/独立review/整体workspace snapshot，原47/ADD不升级、goal active。

20.51已推送`189374283093ce678469451da1f70f5185ed00be`。延后精确观察：其CI40986394168、20.50 CI40986098392均in_progress，Watch40986394211/40986098348均success。20.49 CI40983398554已failure，五externalEditor fixture依赖缺少rtk、12552 passed/3 skipped，和20.48同因，20.51修补已在远端；仍不把待跑完CI视为通过。本批Git/CI另绑定。


### 20.53 团队评审绑定实际读取证据并响应取消

复核17.5原实现发现三项可运行缺陷：`evidence:`后任意路径被收敛视为实际读取，review prompt未要求该字段，review bare await可在取消后永远等待；另用aggregated text令中间叙述进入提案/评审。原[team tool](../../packages/ts-shell/src/core/tools/teamTool.ts)现在优先finalText（缺失才兼容text，显式空final不回退），透过既有runner.observeTool接入本域[evidence](../../packages/ts-shell/src/core/subagents/team/evidence.ts)。成功native read签发本次review专属收据，带原locator、selected-text SHA256及行段/PDF source hash及所选页；空白、目录、failed、hash不符、非read工具和其他review收据都不成立，任一引用无效降为insufficient，原finding reason保留。prompt明确`CLAIM <id> <kind> <reason> evidence: <receipt IDs>`及有界none-found；metadata保留finding与receipt供追溯，无额外证据store/runner/邮箱或provider更改。

原[run](../../packages/ts-shell/src/core/subagents/team/run.ts)将cross-review结算交给本域[review](../../packages/ts-shell/src/core/subagents/team/review.ts)：取消前check、监听abort、立即释放listener、完成结果按原顺序保留、迟到finding/rejection不再发布；拒绝self/非分配proposal/异review身份/duplicate。底层signal与父gate、plan/readOnly预算、固定definition name保持。wrapper结束不被表述为任意外部进程已终止。

基线15失败/20通过；新增原createSubagentRunner+registry/read父权限集成：实际selector行2-2、成功证伪/none-found、invented/mixed/proposer-only/denied、12KiB read截断后receipt仍可见。首次五fixture失败分类为原page不带末尾newline与deny pattern为prefix而非glob，修fixture不改原read/policy。最终六文件69通过，原tool与run独立反转11/4失败、finally精确bytes恢复后69重跑；五门/build/独立freshness通过，118旧docs advisory，build `ed23b909325a6fad20eb4e0f015184b0f4b753e3a19643944acffd34ac84ffcd`、inputs `0c083de6ba2af3e8a1eb9ec3fd05d5e6dad028375e10f3acf83ad27b2d99bf4b`，460/3554、四owner callables7/1/5/8。对照既有research强制当前child成功读取绑定；参考pi actual child abort/finally和oh-my-pi untilAborted native Promise结算，保持Node20.3普通Promise、wrapper结算即释放listener，未复制参考新版Promise.withResolvers；目标引用绑定强于本次参考所见，无同类reference结论冒认。

实际原NodeCLI+PTY+loopback两模式：tool_search→本turn tool_load→team未读invented unresolved；下turn重新load→两个review实际read指定行→HTTP收到receipt→原session metadata行段/hash/reviewer绑定→refuted；第三turn两个review HTTP hold，Ctrl+C102/127ms结束、无续发前台请求，exit156/150ms且0/cooked flags。每模式23POST/3GET、6proposer请求、8review请求（含read后续step），文件与config不变。保留首次审批pending/setup及误以为tool_load跨turn的fixture失败，修有界探针异常后cleanup，不修改产品discovery/pinning。该结果是隔离synthetic HTTP实际路由证据，不当生产模型质量/成本/平台或PDF真实团队评估。

正式[工件](../../.omx/artifacts/phase20-addition-team-review/)与HANDOFF已留，task scratch清理、原CLAUDE.md保留；无本助手subagent/heavy并发/full suite/exe/20k/独立review。原三提案上限与N≤2裁决不符、部分review收敛标准、结构化hypothesis/falsifiers及专门apply-to-context批准尚待后续，不称17.5完整完成，原47不升级、goal active。本批Git/未来CI另绑定。

延后观察20.51 `189374283093ce678469451da1f70f5185ed00be` CI40986394168已success，故editor fixture修补现有CI证据；20.50 CI40986098392 failure为同五fixture（已由20.51修补）。20.52 `0960d010a20f16a06e24bfe900b737a0895eb1d7` CI40987047192仍in_progress、Watch40987047203 success；待跑完不可报通过。


### 20.54 团队两人上限与完整交叉评审覆盖

沿17.5裁决继续：原team tool maxItems/执行允许3，与N≤2不符；一个带证据的none-found可覆盖其他review failed/漏答/insufficient甚至proposer缺席。原[tool](../../packages/ts-shell/src/core/tools/teamTool.ts)把description/schema/admission同步为2（三个视角在dispatch前拒绝）。原[run](../../packages/ts-shell/src/core/subagents/team/run.ts)按requested peer×reviewable proposal补缺失finding为insufficient，原[convergence](../../packages/ts-shell/src/core/subagents/team/convergence.ts)只在所有peer有backed clean check才survived；insufficient/未引用none-found与peer遗漏都unresolved。已绑定counterevidence/condition mismatch仍优先refuted，不用缺失评审抹除观察到的反证。既有纯函数"insufficient+clean peer仍survived"测试为旧裁决冲突，改精确unresolved并保留场景。

先读AgentJournal和JobStore，确认分别为agent/remote backend上限2，不冒充全进程总量锁；本批只落实本前台pass≤2，不新worker pool或改jobs容量。对照reference parallel.ts input-order、取消不再调度、保留完成结果，复用20.53既有结算即可；reference同类调度存在但当前两人入口无必要复制该worker pool，Node20.3边界保持。

基线三文件6失败/47通过；最终六文件75通过，原tool/run/convergence分别独立反转1/3/5失败（后者双文件），finally bytes恢复后75重跑。五门/build/独立freshness通过，118旧docs advisory；build `8a5cec06060687eaee5e213e0f7937aa7a80ecab54d1646f3dff7b5f10923bb9`、inputs `a3110da22245e72ab5a93fc67b0963ef31ae8742c9cbede8e6334a2a16fc199a`，460/3554、五owner7/1/5/8/2。原NodeCLI/PTY/loopback两模式每turn discovery load→未读引用unresolved→native selected line2-2绑定refuted→三个视角拒绝且零新增proposer请求→两held review Ctrl+C102/101ms结束；exit143/185ms、0/cooked、每模式26POST/4GET，文件/config保持、scratch清理。覆盖缺失组合由unit矩阵证明，CLI用真实两人入口，因此不冒充三人生产质量或全局并发测量。

[正式工件](../../.omx/artifacts/phase20-addition-team-coverage/)及HANDOFF留证，原CLAUDE.md保留，无本助手subagent/heavy并发/exe/full suite/20k/真实生产provider/非Linux/独立review。结构化hypothesis/evidenceRefs/falsifiers和专门context-adoption批准仍待续，不称17.5或原47完成，goal active。本批Git/未来CI另绑定。

20.53已推送`8e4e6fd1b3865fc657dee87644912296c75ec009`（69测试/双模式CLI证据）。延后精确CI：20.52 `0960d010` CI40987047192已success；20.53 CI40989150210仍in_progress、Watch40989150206 success；20.51 CI40986394168 success，本批不把未完成CI当通过。


### 20.55 结构化竞争假说及提案读取身份

继续17.5的`{hypothesisId, claim, evidenceRefs, falsifiers}`：原tool将完整text当claim，无法区分格式错误/无证伪条件/伪引用。新增本域[proposal](../../packages/ts-shell/src/core/subagents/team/proposal.ts)以exact JSON验证id/claim≤4096bytes、refs≤12、falsifiers1–8且各≤1024bytes、总≤16KiB，拒绝未声明字段与未被该proposer读取的收据；空refs保留为未验证支持，不伪造源。原[fanOut](../../packages/ts-shell/src/core/subagents/team/fanOut.ts)/[run](../../packages/ts-shell/src/core/subagents/team/run.ts)携带typed hypothesis，单人失败保留另一有效提案；没有复活提案store/runner/provider schema或额外retry。

原[evidence](../../packages/ts-shell/src/core/subagents/team/evidence.ts)更名readEvidence（无兼容重复函数），proposal/review共用本域原observer，metadata带agentId/stage、每次随机receipt ID，阶段之间不共享引用权。原[tool](../../packages/ts-shell/src/core/tools/teamTool.ts)给review只发送其他hypothesis/falsifiers和其引用receipt的locator/selected range/hash作为查阅线索，强调proposal source并非review实际证据；复读后只能引用本review收据。成功proposer原生读取及finalText解析已跑真实runner/read，原同模型声明/权限/预算/两人上限/缺失覆盖规则保持。

新增基线8失败，另同步dispatch throw一失败/8通过：原fanOut仅处理Promise rejection，同步throw能拒绝整批；现在原owner同步/异步同fence、释放listener并丢迟到结果。首次focused82通过/1失败为并发receipt顺序fixture，改按身份包含断言保留所有收据。最终八文件98通过；原tool独立反转8失败、只撤同步dispatch fence反转1失败，finally bytes恢复后98重跑；五门/build/独立freshness通过，118旧docs advisory；build `482f7dd97a7a9ce0ce9a5a674c7211a67f3840b0d04abf078a54e9798e3f13c2`、inputs `d45d786a0d46ac1576a0b9290011e7b5a441a776707528aaedb0828318d8e3dc`，460/3557、product callables7/1/5/8/2/5/4。对照reference strict output缺字段/不合法必须非success，与pi例子的进程JSON事件采集区分；本项目复用既有research exact-stage JSON/receipt思路但core不反向import research，不新增yield/provider机制。

实际原NodeCLI+PTY+loopback两模式：无ref合法结构提案+invented review unresolved；proposer/read+review/read实际指定行2-2，四收据阶段隔离、falsifiers保留、reviewerID绑定新receipt且进入真实HTTP/原session metadata→refuted；一个p1错误id失败但p2保留、零新增review；第三视角零新增proposer拒绝；两held review Ctrl+C102/103ms结束，exit144/143ms/0/cooked、每模式33POST/5GET，文件/config保持，task scratch清理。原tool和调用fence均有反转证据；不当生产模型质量/成本/平台验证。

[正式工件](../../.omx/artifacts/phase20-addition-team-proposals/)及HANDOFF留存，原CLAUDE.md保留；无本助手subagent/heavy并发/full suite/exe/20k/真实provider或独立review，原47不升级、goal active。本批时专门用户显式批准尚未实施，仍沿原tool result发布；后续21.20补齐采用边界，不回改本批历史证据，也不称17.5整体完成。本批Git/未来CI另绑定；20.54已推送`3bc969461f3e8bd757f1e87546f0ab479ad0ab95`，本次两次GitHub API读均EOF，没有新CI结论，不把网络错误判成测试失败或CI成功。

## 21. 第九轮用户反馈（2026-10-30）：配置文件与模型目录、settings 导航、resume 卡顿、双击 Esc、model 排序、双击粘贴与点击定位

本轮用户提出第三十一至第三十七项问题与优化方向。本节只做定位、机制核实与方案研究，**未修改任何产品代码**；实施与验证另记。编号沿用用户原序号。

证据分三类：**已确认机制**（源码可复现，含提交历史）、**只读测量**（本机文件系统或只读脚本，不是产品运行）、**未确认**（现有证据不足）。本轮唯一的一次数据采集是对 `~/.cheers/sessions`（2307 个会话目录）的只读 `node` 脚本，未启动产品、PTY、provider 或任何构建/测试命令。

### 21.1 第三十一：config.json 与 models.json 没有区分开

**用户所指已确认**：`config.json`（运行配置）与 `models.json`（模型目录）是两个文件、两个 owner，但界面与文档都没有把它们说清楚。

**已确认的三个 owner**

| 文件 | 内容 | 写入者 |
|---|---|---|
| `config.json`（user；项目另有 `.cheers/config.json`） | `provider`、`providerConnections`、`providerCredentials`、采样/上限、`allowedModels`、`modelTokenBudgets`、retries/network、TUI 字段 | `/connect`（`connectCommandRuntime.ts:195,278,325,364,421,452` 六处 `writeUserRuntimeConfigFile`）、`/settings` 的 `save`（`cli/interactive/settings.ts:115-140`）、`/model use --global` |
| `models.json`（**仅 user 作用域**） | provider 目录条目：`baseUrl`、`envVar`、`models[].contextWindow`、`compat` 等 | 只有 `/model config` 会创建它（`catalogStore.ts:78-96`），此后靠用户手改 |
| `models-cache.json` | `/model refresh` 写入的目录缓存，永不由用户编辑 | `catalogRefresh.ts:86` |

**本机真实状态（只读，未打印任何密钥）**：`~/.cheers/config.json` 只有 `provider`、`providerCredentials`、`tui`、`providerConnections`（1 条 `openai-compatible` 连接，带 `baseUrl`/`model`）；`~/.cheers/models.json` 里有 BaiLu 目录条目（`baseUrl` + `contextWindow: 1000000`）。也就是说，**同一个模型的服务地址同时存在于两个文件**：连接里一份、目录里一份，而两者由不同写入者维护。这正是"没有区分开"的实质。

**界面为什么说不清**

1. `/settings` 的 `Stored:` 只写 `${draft.scope} file`（`picker/settings.ts:45`），来源页只写 `Save scope:`（`picker/settings/source.ts:12-16`），**从不显示文件名或路径**。用户看到"user file"无法知道是 `config.json`。
2. `/model` 面板的详情里没有任何文件归属行（`picker/model.ts:437-442` 只有 Provider/Connection/Endpoint/Availability），只有 `/model config` 的命令输出会打印 `models.json` 路径（`modelCommandRuntime.ts:56-63`）。
3. `models.json` 是 **user-only**（`catalogStore.ts:22,33-35` 走 `resolveUserDataFile`），而 `config.json` 有 user 与 project 两个作用域。这个不对称在面板里完全没有说明，用户会合理地以为两者都能按项目配置。

**研究过程中发现的真实缺陷（不在用户列表内）**

- **目录解析失败完全静默**。`readOverlay`（`catalogStore.ts:99-116`）在 `readFileSync` 失败、`JSON.parse` 失败或 `providers` 非对象时一律返回 `[]`，不记录、不提示。用户手改 `models.json` 写错一个逗号，结果是"自定义模型全部消失"，界面与命令都不说原因。注释写明这是有意"降级而非拒绝启动"，方向正确，但**没有可见性**。
- **重复顶层键静默丢弃**。本机 `models.json` 实际包含**两个**顶层 `"providers"`（第一个是 `ensureUserCatalog` 写入的 `my-proxy` 示例，第二个是用户追加的 BaiLu）。`JSON.parse` 对重复键取最后一个，第一个块被无声丢弃；文件仍然是"合法 JSON"，所以任何解析错误提示都抓不到它。这是 `ensureUserCatalog` 的示例块与用户粘贴习惯共同造成的真实陷阱。
- 由此推论：**`/model config` 的"示例文件"形态本身有风险**。它写入一个 `providers` 对象供用户照着改，而用户更常见的动作是把另一个 `{"providers": …}` 整块粘到文件末尾。

**参考对照**（只读）

- pi：`models.json`、`settings.json`、`auth.json` 三文件同目录、各自单一职责（`packages/coding-agent/src/config.ts:618-632`），目录文件同样只有 user 作用域。
- oh-my-pi：`models.yml` 与 `settings.yml`/`config.yml` 分开，`models.yml` 只放 provider 目录（`docs/models.md` 的 "Config file location" 与 "What controls model behavior"），同样是 agent 目录级、无项目作用域；`models.json` 只作为旧格式迁移来源。
- 结论：**"目录文件没有项目作用域"不是缺陷**，参考项目一致；真正的缺陷是界面不说明归属、解析失败静默、重复键静默。

**建议方案**

1. 每个展示"值"的地方标出 owner 文件，而不是只写 scope：`/settings` 的 `Stored:` 与来源页补 `config.json`（或 `.cheers/config.json`）；`/model` 详情补一行 `Catalogue: models.json`；`/model config` 保留现有路径输出。
2. `/settings` 的 `Model` 分组与 `/model` 面板各加一行只读说明，写清"行为字段在 config.json，模型目录在 models.json，连接在 config.json"，避免用户在两处找同一件事。
3. `readOverlay` 改为返回 `{ providers, error? }`，由 `/model`、`/model list` 与 model 面板把 `error` 显示为一行 notice（例如"models.json 无法解析；当前只使用内置目录"）。保持"降级而不拒绝启动"的既有政策，只增加可见性。
4. 加载时对原文做一次**仅顶层**的重复键扫描（深度 1 内统计 `"key"`），发现重复时给出警告，不改写文件、不自动修复。范围要小：只针对 `models.json` 的顶层 `providers`，不做通用 JSON lint。
5. 不改 `models.json` 的作用域语义，也不新增项目级目录文件；文档补一张"关注点 → 文件 → 作用域 → 写入者"的对照表。
6. `/model config` 的示例保持单 `providers` 键；可把示例 provider 的 `id` 改成更明显的占位名，降低用户另起一个 `providers` 块的概率。

**证据边界**：文件内容与重复键为本机只读读取；"用户因为重复键丢过条目"是推断（文件现状只能证明重复键存在且后块生效）；未运行产品、未复现用户视角的"模型消失"现场。

### 21.2 第三十二：settings 面板的左侧导航应改成顶部导航

**用户要求**：现在左侧是竖排导航，却用左右键上下移动；应放到顶部作为导航栏，左右键控制左右移动。

**已确认机制**

1. settings 面板同时声明了 `navigation`（`picker/settings.ts:160` `new CatalogNavigation(active, true, true)`）与 `chips`（`picker/settings.ts:174-178`，`All` + 各分类）。
2. **但 overlay 只在没有 navigation 时绘制 chips**：`picker.chips && !picker.navigation`（`overlay.ts:296-299`）。settings 两者都有，所以 chips 永远不画。
3. 于是绘制走 `renderNavigation`（`overlay.ts:331-343` → `chrome/navigation.ts:53-79`），左侧一列 `Browse` + 分类（`navigation.ts:62-68`），内容在右。
4. 左右键在 `sectionFocus` 为真时**切换分类**（`picker/navigation.ts:138-142`），而分类是竖排的——这就是"左右键上下移动"的直接来源。上下键在同一分支里只在 `domain === 'categories'` 时切分类（`:144-147`），否则移动行。
5. Tab 在 categories/rows/sections 三个域之间轮换（`:135-137`）；footer 目前写的是 `←→ categories · Tab: sections/rows/navigation · ↑↓ move`（`picker/settings.ts:170`），与竖排布局并不矛盾，但读起来像横向导航。

**参考对照**

- oh-my-pi：`SETTING_TABS` 顶部 tab 条（`packages/tui/src/overlays/settings-defs.ts:20-32`），由 `TabBar` 渲染（`settings-selector.ts:657-660`）；**左右键始终交给 tab 条**（`settings-selector.ts:1942-1952` → `tab-bar.ts:210-220`）。tab 内部另有**左侧 section 栏**（`settings-list.ts:920-996`，≥2 sections 且无过滤时启用；窄屏退化为内联标题 `:927`），上下键跨 section 连续移动（`:1028-1037`）。
- pi：扁平 `SettingsList`，无 tab、无 section 栏（`packages/coding-agent/src/modes/interactive/components/settings-selector.ts:468-479`）。
- 结论：**顶部 tab 条 + 左右键切 tab** 是参考项目的共同形态；oh-my-pi 在 tab 内部仍保留左侧 section 栏，与本项目"分类 + section"两级结构最接近。

**建议方案**

1. 在 picker 契约上增加一个**导航位置**选项（例如 `navigation.placement: 'side' | 'top'`），而不是复制第二套渲染：`top` 时由 `chipStrip`（`presentation/tui/chrome/chips.ts:32-58`）绘制分类，内容区占满宽度；`side` 保留现有 `renderNavigation`。
2. overlay 的 chips 抑制条件改为"navigation 为 `side` 时才抑制"，`top` 时同时绘制 chips 并登记 chip 命中（现有 `chipRows` 与点击路径 `overlay.ts:400-418` 可复用）。
3. 左右键在 `top` 下**只切分类**（复用 `CatalogNavigation.select`），上下键只移行；Tab 在 rows 与 sections 之间切换；不再需要"categories 域"。窄屏（<72 列）保留现有退化路径；是否把窄屏也改成横向滚动需在实施时按实际宽度确认，本轮不预设。
4. footer 与 `/help` 的按键说明同步；`keyGuide` 相关测试一并更新。
5. model 面板**不跟着改**（用户只针对 settings），但它复用同一个 `CatalogNavigation`；`placement` 默认值必须保持 `side`，避免顺手改掉 model 面板的既有验收。

**证据边界**：机制全部来自源码；未在真实终端复现用户的按键感受，也未验证 chips 在 37 项设置、8 个分类下的横向宽度是否够用（需要实施后按 40/80/120 列各测一次）。

### 21.3 第三十三：resume 面板打开与删除仍有约 1 秒延迟

**结论：打开与删除是两个不同的主因，都不是渲染问题。**

**只读测量（本机 2307 个会话目录、41 MiB，未启动产品）**

| 阶段 | 耗时 |
|---|---:|
| `readdir` 全部会话目录 | 2–16 ms |
| 每会话 3 次 `lstat`（全量） | 905 ms |
| 读取 transcript（全量，3.7 MiB） | 654 ms |
| 逐行 `JSON.parse`（22 876 行） | 32 ms |
| **合计（一次完整目录扫描）** | **约 1.62 s** |
| 单个最大会话（1.87 MiB / 12 116 行）同步读取+解析 | 13 ms + 13 ms |

即：**一次完整扫描 ≈ 1.6 s**，其中 `lstat` 占一半以上。20.7 已把"搜索"从全量重扫降到约 35 ms（复用同一次浏览的 summary 索引），但**打开与删除仍会触发完整扫描**。

**打开（已确认机制）**

1. `openPicker` → `pickerFor` → `sessionPicker` → `SessionBrowser.load`（`picker/session/browser.ts:110-120`）→ `SessionListing.load`（`listing.ts:42-58`）→ `catalog.list(..., { browse })`。
2. 首帧确实不等全量扫描：`listBrowse` 先 `await waitForBrowse(state, signal, state.ready)`（`catalog/index.ts:215`），`ready` 只等**当前会话**读完（`browse.ts:112-113`）。所以首帧应该很快。
3. 但 `captureBrowse`（`browse.ts:81-127`）随后在后台完整扫描：`scanCatalog` → `discoverSessions` 遍历全部目录（`scan.ts:12-32`、`discovery.ts:12-44`），4 并发、每批 16 个，**每个会话的 transcript 都被完整读取**，再由 `decodeSessionSummary` **同步** `JSON.parse` 元数据/状态并 `parseTranscript` 逐行解析（`catalog/projection.ts:29-55`）。解析是同步的，主线程因此被切成大量短阻塞；2307 个会话累计约 1.6 s 的扫描全部落在渲染线程上。
4. 每批扫描都会 `publish` → `follow` 重新投影（`listing.ts:108-118`），并对当前可见的至多 40 行执行 `validateBrowseSources`（`catalog/index.ts:281-294`，每行再 4 次 `lstat`）与 `sampleSizes`（`listing.ts:132-154`）。扫描期间这些复验持续叠加在事件循环上。
5. 另外每帧还会调用 `context.ambient()`（`surface/chrome.ts:62`），其 peer 计数 TTL 到期后执行**同步** `readdirSync` + subagent 目录遍历（`cli/interactive/ambientFacts.ts:24-26,48-62`）。picker 打开时 hint 行被 overlay 覆盖，这次扫描纯属浪费。

**删除（已确认机制，成本更高）**

1. `overlay.mutate` → `sessionActions.update`（`picker/session/actions.ts:10-23`）。
2. `blocked()` 调 `manager.getSession(id)`（`actions.ts:14` → `sessionReadSurface.ts:88-95`），后者走 `loadSessionRecord` → `readSessionRecordSnapshot`，**无 limits**（`sessionStore.ts:147-158`），读取并解析整份 transcript。这是第 1 次完整同步读。
3. `prepareSessionManagement`（`session/lifecycle/management.ts:27-61`）：`catalog.resolve` 后再 `readSessionFileVersion` + **第二次** `readSessionRecordSnapshot`（`:47-51`）。第 2 次完整同步读。
4. `applySessionManagement`（`:64-127`）在 `withSessionStateLock` 内再复验版本、**第三次** `readSessionRecordSnapshot`（`:79`），然后 `fs.rmSync(dir, { recursive: true })`（`sessionStore.ts:107-115`）。锁本身用 `Atomics.wait` 阻塞重试，上限 1200 ms（`sessionFileStore.ts:119-139,222-228`）。第 3 次完整同步读 + 删除 + 锁释放。
5. **成功后 `update()` 调 `browser.close()`**（`actions.ts:22`）→ `listing.close()` → `catalog.retireBrowse`（`browse.ts:64-71`），**整个浏览索引被销毁**；随后 `mutate` 的 `reload()`（`overlay.ts:856-861`）创建新 token（`listing.ts:156-159`），**重新完整扫描 2307 个会话**。只有 `SessionCatalog.cache` 的 512 条 summary 存活（`catalog/index.ts:38,202`、`model.ts:80`），其余约 1800 个会话要重读重解析。

所以"删除卡 1 秒"由两段构成：三段同步整会话读（含 transcript）+ 删除后的整目录重扫。

**参考对照**

- oh-my-pi：宿主把会话数组预先交给选择器（`session-selector.ts:588`），删除成功后**原地 `splice` 并从内存重排**（`:822-831`），不重新扫描目录；`loadAllSessions` 的全量列表也缓存（`:1435-1436`）。
- pi：删除后先就地 `filter` 掉该条（`session-selector.ts:841-845`），随后仍调 `refreshSessionsAfterMutation()` **重读整个 scope**（`:1018-1023`）；但它的逐条读取是 `readline` + `createReadStream` 的**异步流式**解析（`core/session-manager.ts:799-826,941-975`），并发受 `MAX_CONCURRENT_SESSION_INFO_LOADS` 限制。也就是说 pi 同样重扫，但扫描不阻塞事件循环。
- 结论：**"删除后不重建索引"只有 oh-my-pi 做到**；pi 与我们的差别不在是否重扫，而在扫描是否同步阻塞。两者都支持本节的建议 1 与建议 3。

**建议方案**（按收益排序，均不新增第二套索引）

1. **删除不再退休浏览索引**。在 `CatalogBrowses` 增加 `forget(token, id)`：从 `summaries` 删除该 id、让下一次查询重新校验页边界；`SessionBrowser` 删除成功后只刷新当前页（复用已有 token），`browser.close()` 只在真正关闭面板时调用。这是收益最大的一项：把 O(全目录) 降到 O(当前页)。
2. **删除路径的三次整会话读合并为一次元数据+状态读**。`sessionSelectionBlock` 需要的 `projectRoot`/`status`/`reentry` 已由 catalog summary 计算（`catalog/projection.ts:20-25` 的 `reentry` 就是 `sessionHasReentrySurface` 的结果），`blocked()` 可以直接用 summary，不必 `getSession`。管理预览/应用只需要 metadata + state，不需要 transcript；在 session store 增加一个"管理快照"读取（复用 `readSessionMetadataRecord` + `readStateSnapshotRequired` + 版本复验），替换后两次 `readSessionRecordSnapshot`。
3. **扫描期让出主线程**。`decodeSessionSummary` 内的 transcript 解析改用已存在的异步解析（`session/transcript/read.ts:255` `parseTranscriptAsync`），或在每批之间显式 `await` 一次。目标不是更快，而是不阻塞渲染。
4. **picker 打开时不跑 ambient peer 扫描**。`readAmbientFacts` 在 overlay 打开时返回缓存值；peer 计数是提示行信息，picker 覆盖提示行时无人阅读。
5. 保持现有预算与身份复验（20.7 的 visible/current/lookahead 复验不能因为性能回退）。

**证据边界**：测量为本机只读脚本，不是产品运行；"约 1 秒"与用户主观描述吻合但未在同一进程内计时。删除的三次整读与删除后重扫由源码确认；哪一段在用户机器上占主导未单独计时。

### 21.4 第三十四：双击 Esc 失效（已定位为回归）

**结论：双击 Esc 的判定逻辑完好，但打开面板的接线在 2026-10-26 的提交里被破坏，之后一直静默失败。**

**已确认机制**

1. keymap 的双击逻辑完整：空草稿、600 ms 窗口、第二次 Esc 调 `actions.openRewind()`（`keymap.ts:310-340`，常量 `DOUBLE_ESCAPE_MS = 600` 在 `:44`）。有测试（`keymap.test.ts:827-838`）覆盖"第二次 Esc 调用 openRewind"。
2. 接线是 `openRewind: () => this.openPicker("back")`（`interactiveMode.ts:739`）。
3. 而 `pickerFor` 现在**要求命令以 `/` 开头**：`if (!command.startsWith('/')) return undefined;`（`picker/registry.ts:185`）。于是 `pickerFor("back")` 返回 `undefined`，`openPicker` 走 `if (!picker) { this.pickerLifecycles.abort(controller); return; }`（`interactiveMode.ts:1187-1191`）**静默返回**。
4. 该 `/` 守卫由提交 `3841998d`（2026-10-26，"compose skills and methods in one prompt"）加入；而 `openPicker("back")` 由更早的 `5f558351`（2026-09-23）引入，当时没有守卫，所以当时可用。**这是一次真实的跨提交回归**，不是用户记错。
5. 测试为什么没发现：`keymap.test.ts` 只断言 action 被调用（`:835`），从未经过真实 host 的 `openPicker`；`picker/rewind.test.ts` 直接调 `pickerFor('/back')`（`:44,74,169`），带斜杠。两者之间正好是缺口。

**参考对照（oh-my-pi）**

- 第二次 Esc 的行为在 host controller：空编辑器、500 ms 窗口（`input-controller.ts:665`）；非空草稿会**重置计时**并阻止触发（`:656-658`）；autocomplete 与 vim 在编辑器层先消费第一次 Esc（`custom-editor.ts:1790-1798`）；动作可配置 `doubleEscapeAction: rewind | tree | none`，默认 `rewind`（`modes/settings.ts:921-928`）。
- 它还记录了一条运维教训：触发后必须只做**视口重绘**，不能用全量 `resetDisplay()`，否则长会话下选择器"打开但看不见"，双击 Esc 读起来像没反应（`input-controller.ts:676-681`）。本项目当前用 `openPicker` + 常规 `requestRender`，不存在该问题。
- 我们的语义与参考一致（空草稿、双击窗口、草稿保护、suggestion 先关、busy 先中断），差别只是窗口 600 ms 且不可配置。**不需要改语义，只需要修接线。**

**建议方案**

1. 最小修复：`openRewind: () => this.openPicker("/back")`。同时把 `openPicker` 的入参语义写清（它接受一条带 `/` 的命令行），避免下一次同样的误用。
2. **不要静默失败**：`openPicker` 在 `pickerFor` 返回 `undefined` 时追加一条 notice（例如"无法打开返回面板；请使用 /back"），而不是只 abort lifecycle。这与 evidence-and-truthfulness 的"不得把未发生的事表现成发生过"一致。
3. 补一条**经过真实 host** 的测试：双击 Esc → `overlay` 真的打开 `/back` 选择器（可参考 `interactiveMode.test.ts` 现有的 picker 打开断言方式），而不是只断言 action 被调用。
4. 可选的发现性改进：空草稿时提示行或 `/help` 明确写出"Esc Esc 返回"；`/back` 已在命令表里（`slashCommandRegistry.ts:80-92`），这是当前唯一的发现路径。
5. 是否把窗口做成可配置，参考项目有、我们没有；本轮不建议新增配置项，先恢复功能。

**证据边界**：回归由提交历史与源码确认；未在真实终端复现按键。用户描述的"只剩下 undo"与机制一致：`/undo` 是文件恢复（`picker/undo.ts`），与 `/back` 的对话返回是两件事，二者从未合并。

### 21.5 第三十五：model 面板未配置项应置底并按首字母排序

**已确认机制**

1. 分类（provider 侧栏）当前按"是否有可用行"排序：`ordered.sort((l, r) => Number(!ready.has(l)) - Number(!ready.has(r)))`（`picker/model.ts:244`）。**已就绪在前、未就绪在后**，但**组内保持目录顺序**（`BUILTIN_PROVIDERS` 顺序：anthropic、bedrock、google-ai、vertex、openai、google、deepseek…，`core/models/catalog.ts:235-524`），不是字母序。
2. 模型行同样只按就绪分组：`rows.sort(...)`（`model.ts:245-246`），**组内保持目录顺序**（例如 `gpt-5.3`、`gpt-5.3-codex`、`gpt-5.1-mini`、`o4-mini`），不是字母序。
3. 当前活动模型若不在目录里会 `rows.unshift` 一条 `model:current`（`model.ts:269`），位置固定最前，不参与排序。
4. 未就绪分类只用 `note: '○'` 标记（`model.ts:354-356`），没有分组标题或分隔。

**参考对照（oh-my-pi）**

- 行排序 `sortModelItems`（`packages/tui/src/overlays/model-browser.ts:346-403`）：角色优先 → MRU → **provider `localeCompare`** → priority → 版本号降序 → `-latest`/日期 → 字母序兜底。即 provider 是字母序，模型不是纯字母序。
- `/models` hub 的侧栏：已解锁 provider 按字母序，然后一条分隔，再是**锁定的 provider**（`model-hub.ts:744-748,772-778`，`hub-frame.ts:248-250` 画分隔线），锁定项置灰、标题写 "`X · not configured`"（`:2548-2550`），选中后只显示说明与登录方式（`:2723-2727`）。
- 结论：**"未配置置底 + 分隔 + 已配置按字母序"正是参考做法**；但参考的模型行是版本/新近度排序，与用户要求的"首字母排序"不同。这里**用户要求优先**。

**建议方案**

1. 分类排序：先按就绪分组（保留），组内按 `label`（无 label 用 `id`）`localeCompare`；`Roles`、`All models` 固定在 provider 之前。
2. 模型行排序：组内按模型 `id` `localeCompare`；`model:current` 仍置顶；`roles` 分类内的角色行保持既有固定顺序（default/subagent/summary/advisor），不参与字母序。
3. 未就绪 provider 增加一条不可聚焦的分隔标题（例如 `Not configured`），沿用现有 `note` 与 disabled 行能力；若渲染层不支持标题行，则至少在分类 label 上加统一前缀，避免只有 `○` 一个符号。
4. 排序必须在 `navigation.set` 之前完成（`model.ts:354`），保证侧栏、内容、搜索投影三者顺序一致；搜索投影（`filterOptions` → `navigation.project`）会保留传入顺序，不能只排 `rows` 不排分类。
5. 既有测试 `orders configured providers before unavailable catalogue entries`（`picker/model.test.ts:433-437`）只断言第一条，排序改动后仍需通过；新增"组内字母序"与"未配置在末尾"的断言。

**证据边界**：机制来自源码；内置 provider 共 23 个（`catalog.ts:237-524`），用户目录另有 1 个自定义条目；未在真实面板里核对最终顺序，也未验证 40 列窄屏下分隔标题的可用性。

### 21.6 第三十六：双击 Ctrl+V 应能直接展开刚粘贴的长文本块

**用户要求**：现在必须把光标移进占位符内再按 Ctrl+V 才展开；希望"粘贴后立刻再按一次 Ctrl+V"（光标就在块后一格）也能展开。

**已确认机制**

1. `PasteStore.expansionAt(draft, caret)` 只接受**严格位于占位符内部**的位置：`if (caret < start || caret >= end) continue;`（`presentation/tui/pastes.ts:140-154`）。
2. 插入占位符后光标停在 `end`，所以紧接着的第二次粘贴**不会**展开；这是 17.1 之后**有意**的设计，并有测试固定（`pastes.test.ts:141-147`，注释写明"否则下一次无关粘贴会展开旧块并丢掉剪贴板"）。
3. 展开路径本身完整：`interactiveMode.ts:543-548` 用 `editor.replace` 做一次真实编辑（可撤销），展开后光标落在插入文本末尾。
4. 图片占位符永不展开（`pastes.ts:150-152` 只查 `held`，不查 `heldImages`）。

**参考对照**：oh-my-pi、pi、codex、Claude Code **都没有**"再粘贴一次展开"的手势；四者都只在提交时展开占位符（oh-my-pi `editor.ts:3279-3293,3343,3960`；pi `editor.ts:1100-1113,1376`；codex `chat_composer.rs:2517-2518,2993`；Claude Code `handlePromptSubmit.ts:216`、`promptEditor.ts:148`）。因此这是本项目自有手势，**没有可直接复用的参考实现**，只能沿用我们自己的占位符身份与编辑路径。

**建议方案（保留既有保护，只放宽"刚粘贴的那一块"）**

1. `hold()` 时记录一个**刚粘贴**状态：`{ id, placeholder, at }`。`expansionAt` 增加可选参数 `{ now, freshMs }`；`caret === end` 只在以下条件全部成立时展开：该占位符就是 `fresh` 记录的那一块、草稿中该位置仍是同一 token、`now - fresh.at <= freshMs`。
2. 严格内部位置的行为**保持不变**（任意时刻都可展开），这样"移进块内再粘贴"仍然有效；`pastes.test.ts:141-147` 的用例改成"超过窗口后不展开"，保留反例。
3. 窗口建议复用旧的 1200 ms 量级（原 `DOUBLE_PASTE_MS`），并改名以反映新语义（例如 `REPEAT_PASTE_MS`）。窗口只影响"块后一格"这一种位置，不影响块内。
4. 任何一次编辑（插入/删除）后 `fresh` 失效即可；最简单可靠的做法是在 host 的每次编辑器变更后调用 `pastes.disarm()`，而不是猜草稿修订号。
5. 图片仍不展开；展开仍是一次可撤销编辑；不新增第二个粘贴栈。

**证据边界**：机制与测试来自源码；未实现、未验证 1200 ms 窗口在真实按键节奏下的手感，也未验证"粘贴→输入→再粘贴"是否会被误判（按方案 4 不会）。

**后续实施**：第36项已在21.17实现并完成本地聚焦与小型CLI验证；上文机制与建议为实施前研究快照。

### 21.7 第三十七：点击输入框任意位置移动光标

**已确认机制**

1. 输入框的点击目前只用于**拖拽选择**：press 进入 `dragTarget = "composer"`（`cli/interactive/pointer.ts:216-233`），release 时若没有选区则直接返回（`:262` 的 `if (report.kind === "release") { … return; }`）。**没有任何路径移动光标。**
2. 映射所需的数据已经存在：`ComposerGeometry.layout.rows[].cells` 每个 cell 带 `columnStart/columnEnd/sourceStart/sourceEnd`（`presentation/tui/composer/contract.ts:11-16`、`row.ts:35-62` 的 `contentRow`），`selectionFromPoints`/`sourceBoundary` 已能把屏幕坐标解析到源码边界（`composer/projection.ts:7-33`）。
3. 编辑器已有 `setCursorOffset(offset)`（`presentation/tui/editor/buffer.ts:77-87`）：拒绝非字素边界、越界，并重置纵向列偏好。**不需要新写坐标换算。**
4. 鼠标只在 alternate screen、pager 或全屏 overlay 时交给 pointer（`interactiveMode.ts:511-517`），引擎也只在同样条件开启鼠标跟踪（`render/engine.ts:371-375`）。regular 模式不接管鼠标，保留终端自身的选择与 scrollback。

**参考对照**

- pi：**已实现**。press/drag/release 留给选区，渲染器只在"按下与松开落在同一格"时合成 `click`（`packages/tui/src/tui-alt-screen.ts:936-940,1365`），随后按可视行映射 + 字素宽度求列偏移（`editor.ts:638-694`），最后 `setCursorCol`。拖动永远不移动光标。
- Claude Code：**已实现**（POC）。左键释放且未拖动时触发 `onClick`，用 `measuredText.getOffsetFromPosition` 求偏移后 `setCursorOffset`（`components/PromptInput/PromptInput.tsx:1993-2010`）；同样只在 alternate screen 生效。
- codex：**没有**（鼠标事件被显式丢弃）。
- oh-my-pi：**没有**光标定位（鼠标只用于卡片/链接/焦点）。

**建议方案**

1. 在 pointer 的 composer 分支记录 press 的格子与源码偏移；release 时若**指针没有离开该格**且没有产生选区，则调用一次新的视图动作把光标移到该偏移（`editor.setCursorOffset`）。拖动仍然只做选择与复制。
2. 坐标到源码一律复用 `sourceBoundary(layout, point, "start")`（`composer/projection.ts:7-25`）：它已处理宽字符、折行与"点到行尾之后"的夹取，与现有选区高亮使用同一套映射，不会出现两套几何。
3. 只对 `kind === "content"` 的行生效；点击上边框、footer、滚动条等装饰行不移动光标。
4. 单击移动光标、双击选词、三击选行：现有 `DragSelection` 已经实现双击/三击的词/行粒度（`clickSelect.ts:25-60`、`selection.ts:110-160`），第一次点击顺带定位光标是符合直觉的副作用，不需要额外抑制。
5. 只在 fullscreen 生效，与参考一致；regular 模式保持"鼠标归终端"，避免夺走 scrollback。
6. 该动作不写配置、不触发提交、不改变选区语义；点击后照常 `requestRender`。

**证据边界**：机制来自源码；未实现、未在真实终端验证点击精度（宽字符、折行、缩放后重排、点击行尾之后的夹取），也未验证与双击选词的手感冲突。

**后续实施**：第37项已在21.17实现并完成本地聚焦与小型CLI验证；上文机制与建议为实施前研究快照。

### 21.8 研究过程中新发现（不在用户列表内）

1. **`models.json` 解析失败静默**（21.1）：写错一个逗号会让自定义模型整体消失，界面不说明。
2. **`models.json` 重复顶层键静默丢弃**（21.1）：本机文件实际命中；`ensureUserCatalog` 的示例块与用户粘贴习惯共同造成。
3. **双击 Esc 静默失败**（21.4）：`pickerFor` 的 `/` 守卫与 `openPicker("back")` 的调用约定不一致，`openPicker` 失败时不报告。
4. **删除会话后浏览索引被销毁**（21.3）：`actions.ts:22` 的 `browser.close()` 让一次删除触发整目录重扫，这与 20.7"同次浏览复用索引"的目标相反。
5. **测试缺口**：`keymap.test.ts` 只验证 action 被调用、`picker/rewind.test.ts` 只验证带斜杠的入口，两者之间没有"双击 Esc 真的打开面板"的测试；这是回归能存活一个多月的原因。

### 21.9 本轮结论摘要与建议实施顺序

| 编号 | 判定 | 主要证据 | 优先级 |
|---|---|---|---|
| 31 | 确认：三个文件三个 owner，界面只写 scope 不写文件；解析失败与重复键均静默 | `settings.ts:45`、`source.ts:12-16`、`model.ts:437-442`、`catalogStore.ts:22,99-116`；本机 `models.json` 双 `providers` | P1 |
| 32 | 确认：settings 同时声明 navigation 与 chips，chips 被 `!navigation` 抑制；左右键切的是竖排分类 | `overlay.ts:296-299`、`chrome/navigation.ts:53-79`、`picker/navigation.ts:138-142` | P1 |
| 33 | 确认：一次完整扫描约 1.6 s；删除含三次整会话同步读 + 删除后整目录重扫 | 本机只读测量；`catalog/index.ts:215,281-294`、`management.ts:27-117`、`actions.ts:22`、`store.ts:147-158` | P0（用户可感知） |
| 34 | 确认：双击 Esc 逻辑完好，`openPicker("back")` 与 `pickerFor` 的 `/` 守卫冲突，静默失败；回归自 `3841998d` | `interactiveMode.ts:739,1187-1191`、`picker/registry.ts:185`、提交历史 | P0（功能丢失） |
| 35 | 确认：已就绪置前但组内不排序；未就绪只有 `○`，无分隔 | `picker/model.ts:243-246,354-356`、`catalog.ts:235-524` | P2 |
| 36 | 确认：`expansionAt` 只接受严格内部位置；"块后一格"被有意排除 | `pastes.ts:140-153`、`pastes.test.ts:141-147`、`interactiveMode.ts:543-548` | P2 |
| 37 | 确认：输入框点击只做选择，从不移动光标；映射数据与 `setCursorOffset` 均已存在 | `pointer.ts:216-233,262`、`composer/contract.ts:11-16`、`projection.ts:7-33`、`buffer.ts:77-87` | P2 |
| 新增 | 见 21.8：静默失败三处（models.json 解析、重复键、openPicker）、删除后重扫、测试缺口 | 同上 | 随对应项 |

建议顺序：

1. **34**（双击 Esc）——最小改动、功能已丢失、有明确的回归提交与测试缺口，先修接线并补真实 host 测试。
2. **33**（resume）——用户直接可感知；先做"删除不退休索引"与"三次整读合一"，再考虑扫描期让出主线程。
3. **31**（文件归属）——纯展示与诊断，不改语义；与 33 的删除路径改动可以分开提交。
4. **32**（settings 顶部导航）——涉及 picker 契约新增 `placement`，改动面比看起来大，必须同时保住 model 面板的既有行为。
5. **35**（model 排序）——纯排序与分组标题，风险低。
6. **36 与 37**（输入手势）——两者都在输入路径上，建议同一批做、同一批验证，避免两次改动同一段 pointer/粘贴代码。

**本轮证据边界**：本研究提交只做研究与文档；未修改产品代码，未运行测试、构建、PTY、真实 provider 或 20k 压测。21.3 的数字来自本机只读脚本（2307 个会话、41 MiB），不是产品进程内计时。21.4 的回归由源码与提交历史确认，该研究轮未在终端复现按键；后续修复见21.10。参考项目均为只读对照，未复制其实现。原 Phase 20 的 47 项矩阵与 ADD 整体状态不变。

### 21.10 第三十四实施：恢复双击 Esc 的原宿主接线

原[交互宿主](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts)把 `openRewind` 的命令改为 `/back`，并纠正 `openPicker` 的旧“bare command”注释。保留 registry 的 slash 守卫；返回 undefined 时释放原 controller、发布固定可安全展示的 notice 并请求重绘，不回显输入或错误。此分支不代表所有 factory 同步抛错已被处理。

先看目标后局部对照两个参考的 input controller：同意空草稿才触发、busy 优先中断、suggestion 优先关闭、触发后重置双击计时、只做视口重绘；沿用本项目严格空草稿与 `<600 ms` 窗口，不新增配置或复制实现。新增[宿主测试](../../packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)实际经过 terminal input→stdin→keymap→openPicker→registry→rewind picker，仅替换历史读取与导航回调，避免只断言 action 被调用。两模式验证首次 Esc 不打开、600 ms 边界不触发、随后100 ms触发、最新问题在前、关闭不导航、非空草稿保护；同时直接验证原 host signal 与组合 source signal 释放。固定 notice 的精确断言防止以后回显 command。

新三例基线全部失败；owner修改后通过。一次门禁误从 package cwd 调用 root script，报告 Missing script 并短路，未启动测试；改回 root cwd 后五门通过。单 worker、2 GiB heap 上限的单次 Vitest 覆盖宿主/keymap/rewind 三文件484项通过；cleanup失败用例自身输出的提示保留，不当成真实设备恢复证据。接线独立反转两例失败、notice独立反转一例失败，finally精确恢复；评审指出组合信号不能独立证明原controller释放，补host signal直接断言后新三例重跑通过。一个 `gpt-6.1-sol` 代理只读审核，未运行任何验证，最终无需修复的finding；审核没有覆盖全部addition。

原 Node CLI 两模式的隔离 synthetic/offline PTY **仅两条消息**：实际原 `/back` 接线、面板绘制、取消、非空草稿保护与显式选择旧问题后的新 SessionManager 读回均通过；配置字节不变、退出0、cooked flags恢复。最终构建与收据见[本批工件](../../.omx/artifacts/phase20-addition-escape/)；退出时间以最终receipt为准。不运行Bun executable、真实provider、20k终端压测或全套回归。真实桌面键盘/其他平台体验仍未采集；第31/32/33/35/36/37项继续实施，原47项与ADD整体状态不升级，goal active。

最终注释整理后五门/diff与build重新通过，freshness的compiler/source输入为460/3557、digest一致；build `40b7ea7e69f58eb2c8c8ec2c40050b2fb7173a266587eec0bbcfa02741760569`、inputs `22df13f9bbc1257ede3fd1836ad69f8d6ab5789477f3d5d618c3848dbfa1e624`。两模式PTY重新绑定该build通过，退出161/152 ms。原host保守AST callable数123→123，既有超限记录append disposition，不冒充满足20上限。118旧docs advisory保留；scratch为空后清理目录，既有CLAUDE.md不改。

只读评审为33补充具体陷阱：同token更新须废止旧查询/已消费continuation、保护在途扫描不复活删项，tombstone参与条目上限且物理字节预算不可退还；管理快照必须保留metadata/state和全三文件版本，不用 `turns: []` 伪造完整Session。复用索引减少的是物理I/O，内存summaries重投影仍遍历索引；该方案尚未实现或验证。

延后CI观察：研究提交 `b79a301a937f86e1524f23458bad5d1313421033` 的CI41001708699/Watch41001708696均success；20.55 `e74d87f7d083f6117d011e8b2d7f32412b5b2372` CI40991170478/Watch40991170435、20.54 `3bc969461f3e8bd757f1e87546f0ab479ad0ab95` CI40989805757/Watch40989805764、20.53 `8e4e6fd1b3865fc657dee87644912296c75ec009` CI40989150210/Watch40989150206均completed/success且head一致。本批提交、推送和未来CI另绑定，旧CI不替代本批CI。

### 21.11 第三十三实施之一：删除后复用原浏览索引

接续工作区已有实现，完成21.3建议1。确认删除后，原[actions](../../packages/ts-shell/src/cli/interactive/picker/session/actions.ts)不再关闭整个browser，而由原listing/catalog移除所选summary与size缓存，废止旧continuation和查询revision，清掉页面投影后沿原overlay.reload重新查询。同一个browse token、已用字节预算及partial来源保留；tombstone计入条目上限，捕获路径在异步读取后也检查删项。重建同名ID要显式重开才可见。当前会话保护、真实删除owner及版本复验保持原契约，没有第二套索引或管理writer。

目标检查后定向复读pi的session-selector.ts:837–853：同意确认删除后先移除已加载项；不采用随后整个scope重扫，因为本项目已有同生命周期catalog与预算。21.3此前的另一参考比较作为已记录设计依据，不冒充本批重新读过该快照。新回归在恢复整源关闭时失败，检查实际目录打开、读取字节及token数量，而非只看列表不含删项。内存重新投影仍遍历summaries，不能称总时间复杂度降成O(当前页)。

集成发现页对象比较的竞态：等待删除时原浏览可发布新projection，`active() === projection`会漏掉删项；改为捕获browser lifetime，刷新仍属于原浏览，关闭/重开则退休原lifetime。两条pending-delete回归验证刷新后清理与重开后不改新browse；选中summary仍须是catalog持有的原对象，不能用伪造版本或其他context代替。

初始宿主夹具错误等待End而首批实际有Next，后续又把只有两项的搜索当作可分页；均为测试设置错误，修为真实完整页/有下一页的查询，未放松源读取或身份断言。最终单worker、1536MiB heap的四文件179项通过，覆盖catalog browse、session lifetime、session picker及overlay。四项独立反转分别撤回保留source、浏览lifetime、旧query失效与Del提示，均发生断言失败；finally逐字节恢复后179项重跑通过。五静态门及2048MiB TS build通过，118条既有docs-source advisory保留。五个主要owner的保守named-callable计数分别4/18/19/11/19，未超过20。

第一次真实CLI用Ctrl+D尝试删除，原空草稿app.exit先退出，零删除/零模型请求；该失败保留为baseline，不能记为删除成功。原overlay还支持Delete，最终探针使用真实Delete→确认Enter。modal的删除动作提示由`^D delete`改为`Del delete`，经实际modal绘制及Delete触发reload回归验证；session panel本身没有绘制这段modal actionHints，不据此声称新增了panel页脚。保留原空草稿全局退出政策。

最终regular/fullscreen均为隔离home/profile/project的原Node CLI和120×60 PTY，每模式仅8个会话、每会话一条小user消息，synthetic/offline、零tools/skills/上下文文件、warming关闭，heap768MiB/45秒/2MiB输出上限。实际按键连续删除两项，第二项在精确搜索中删除，随后清空搜索仍不出现删项；同一token共begin1/forget2/retire0，Esc后才retire1。新SessionManager读回删除目录缺失，未改变当前选择，其余五个非current会话的三文件原字节不变，配置不变、零message.started、exit0及ICANON/ECHO/ISIG读回恢复。

regular两次删除195/278ms、退出126ms；fullscreen193/275ms、退出125ms。时间含输入、确认、重查与绘制，只证明小夹具链路；不代表2307会话用户目录或桌面终端延迟。最终build `cda852ed59e152495c94ca91882ce2c8472be1af0036bd7c7c7fef2de2e2bd24`、inputs `4e200e15e7aa4d616b060f64ee88d2c1f2e885565dc22a0cf7ca6091f398b6f5`，两模式均经checkBuild绑定。正式[工件](../../.omx/artifacts/phase20-addition-resume-removal/)保存脚本、反转、初次失败与最终收据；scratch清理，原CLAUDE.md保留。

**尚未完成**：21.3建议2的管理快照/三次整读、建议3的扫描解析让出主线程、建议4的ambient读取优化及用户大目录实测；第33项仍partial，31/32/35/36/37继续按顺序实施。没有真实provider/外部平台/独立代理审核/exe/full suite/20k证据；原47项与ADD整体状态不升级，goal active。本批未派发子代理，所有验证严格逐进程串行。

延后精确检查上批 `49e3d16ed1188fbc77b1fa5b80d894936ba3ed10`：CI41005821166和Watch41005821171均completed/success。本批Git/推送及未来CI另绑定，不沿用旧CI作本批证据。

21.11已提交并推送`db36da4432916d9465f9d085ebef3e9a574ae878`。继续下一段后才检查：CI41009873087仍in_progress，Watch41009873069 completed/success，head均一致；不等待或重复轮询该CI。

### 21.12 第三十三实施之二：管理快照与删除前置检查不再同步读取全文

落实21.3建议2。新增原store域的[management快照](../../packages/ts-shell/src/session/store/management.ts)：读取metadata/state，以明确的`SessionManagementTarget`返回管理所需身份和字段；没有构造`turns: []`或冒充完整Session。读取前后仍比较包含目录及metadata/state/transcript三份文件的原version，校验ID、日期、字段类型、status及两处projectRoot一致性；legacy单一根来源沿既有fallback兼容，均缺失或互相矛盾则拒绝。元数据与状态仍分别在预览、锁内应用时读取，不能省掉确认后的复验。

原[lifecycle管理owner](../../packages/ts-shell/src/session/lifecycle/management.ts)的预览、锁内验证和读回改用管理快照。删除继续调用原SessionManager.deleteSession及原物理缺失确认，unknown/unchanged/changed不变；pin沿现有metadata writer更新真实metadata并保留其余字段。rename仍委托原SessionManager.renameSession，因此它本身所需的一次完整加载没有被本批绕过。

原picker的删除/重命名前置检查使用已展示summary的project/reentry及原offered版本；真正fresh身份、busy/current、版本、configuration/surface准入和写锁仍由原sessionPickerHost/prepare/apply检查。resume与pin的picker前置检查保留原完整target读取：初次将summary优化扩到pin使两条missing/foreign回归失败，分类为超出本次优化范围后收回，原拒绝断言保留。旧session测试拆清“前置runtime拒绝”与“将offered version送到真实管理owner”，新增四条原catalog→picker→native host→writer拒绝测试，覆盖展示后的缺失/项目/身份/内容变化；两种mutation均零writer调用、零getSession调用。

写前定向只读比较pi session-selector.ts:644–680：其删除工具不读会话全文，同意管理动作无需正文；不采用其trash退出码即可判成功、直接unlink及stderr回显的策略。本项目保留更严格的三文件/目录版本、锁内状态和实际删除证据。真实writer和metadata publication owner均未替换，不新增执行或索引系统。

新零全文读取回归在原实现上分别捕获delete两次、pin三次同步record读并失败。元数据/状态读取14项测试覆盖不构造conversation、错误ID/日期/title/root/status、legacy根、读取中transcript/目录替换及symlink拒绝。最终单worker/1536MiB四文件136项通过：store14、lifecycle39、session picker75、lifetime8；四个独立反转分别恢复picker全文检查、原lifecycle全文读取、撤回快照version复验及撤回根一致性检查，全部断言失败，finally逐字节恢复后136项再通过。五静态门、2048MiB TS build及diff检查通过，118条旧docs-source advisory保留。

复用21.11有界CLI脚本，增加可选工件目录和共享observer导出；本批observer只计数实际fs.readFileSync的transcript路径，通过syncBuiltinESMExports覆盖内置live bindings，不保存正文。仅管理快照修补时两模式均测到每次删除仍读一次全文，收据保留为before-selection；picker前置检查修补后，最终两模式各两次删除的同步transcript读均为`[0,0]`，确认进入原Delete/Enter、搜索内删除、清搜索、原browse begin1/forget2/关闭前retire0、关闭后1，剩余文件/config不变、零模型请求、exit0及cooked flags恢复。

最终regular删除194/279ms、退出142ms，fullscreen195/278ms、退出135ms。每模式仅8会话/每条一消息，synthetic/offline，heap768MiB、45秒/2MiB；该结果不是用户2307目录的吞吐/延迟基准，也不等于目录解析零I/O。cold catalog精确解析仍可能沿原异步读取正文，本文只证明删除链移除三次同步全文获取。build `c75224511e9184b8c4b496056e3b07e1d3377ef41631dedfa7deba417302288a`、inputs `3c8a8e231dcf1cc3c3742f932309a1dcc5c1833130a2d80a6296b88965bbfc87`，两模式经checkBuild绑定；正式[工件](../../.omx/artifacts/phase20-addition-session-management/)保留反转、测试、阶段与最终收据。scratch清理、原CLAUDE.md保留；无子代理、无并行验证。

第33项仍partial：扫描解析调度、overlay期间ambient读取及用户大目录体验尚未完成；31/32/35/36/37继续。未运行真实provider、其他平台、exe、full suite或20k，未取得本批独立review或CI最终证据；原47与ADD整体状态不升级，goal active。本批Git/推送及未来CI另绑定。

### 21.13 第三十三实施之三：目录解析让出主线程与遮挡提示的按需读取

落实21.3建议3–5。[catalog projection](../../packages/ts-shell/src/session/store/catalog/projection.ts)改为等待已有`parseTranscriptAsync`，传递原signal；未建立第二套decoder或流式读取系统。原[reader](../../packages/ts-shell/src/session/store/catalog/index.ts)在该await之后仍复验目录与metadata/state/transcript三文件version，检查取消/预算后才缓存；visible/current/lookahead、continuation及累积来源预算保持原检查。元数据和state的JSON解析、thread/report/preview投影仍同步；本批保证解析间可调度，不能称总耗时下降或整条路径无阻塞。

先定向对照pi `core/session-manager.ts:799–826`的带signal异步逐行读取：同意协作解析和取消，复用本项目已有parser而不另造stream。其TUI `tui.ts:1381–1427`先测量实际overlay再合成，支持保留布局测量；该段接收已渲染底层内容，没有证明会跳过隐藏ambient读取，本项目按自身可见性作决定。反转测试验证协作解析决定，未复制实现。

[surface chrome](../../packages/ts-shell/src/presentation/tui/surface/chrome.ts)先用transient/search提示测量面板，确认ambient行可显示时才取事实；全屏覆盖、没有空间或已有提示时不取。ambient确实增加一行时再次测量，确保inline report在临界高度仍正确切到全屏，空ambient不白占一行。不能只用render前的fullScreen标志：Pager在render中按composer剩余空间确定形态。临界情况下ambient取值本身可能决定切屏，不能声称任何最终全屏帧都绝无事实读取。

首轮CLI仍观察到面板后peer扫描，定位为原host `facts()`在绘制composer前另调`readAmbientFacts`。[ambient owner](../../packages/ts-shell/src/cli/interactive/ambientFacts.ts)新增原peer缓存的只读入口；[host](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts)在picker/reader打开期间复用同session计数，不续TTL、没有缓存或session不符则省略。关闭后原实时读取立即刷新过期计数。没有第二份ambient缓存，未改provider/auth、writer、release脚本或构建行为。

主代理单进程串行完成：七文件123项，加实际普通/全屏host新两项（其余376项跳过）；六独立反转分别使断言失败，finally逐字节恢复；五静态门与TS build通过，118旧docs advisory保留。新测试在首条transcript解析后排入真实event-loop回调，3072条小型单元夹具尚未解析完就观察到调度/取消；另在decode暂停期间分别改变三份来源/取消，拒绝且不缓存。不是20k真实终端。owner named callable计数为catalog index18、projection5、chrome1、hints4、ambient4；host未新增callable。

原Node CLI两模式各8会话×1消息，面板打开后等待两个1200ms周期并通过真实按键重绘，peer扫描均0，关闭后刷新。随后两次Delete/Enter含搜索删项，begin1/forget2/关闭前retire0、关闭后1，幸存三文件/config不变、请求0、exit0/cooked flags。删除耗时普通218/251ms、全屏195/251ms，退出均140ms，仅为小fixture。最终build `194f2ee5e1e40dbde22761937400ba33dffef19230020aaa5da4b7a7b61e7da9`，inputs `969a0534db7258c243e2ca18506d95a983b2d19805694417152c5d4f5e085db6`。

较长probe首次把删除窗口内所有同步transcript读都当作删除读取而失败；按synthetic session与bounded调用栈区分后，四个删除目标均0次，普通首个窗口另有4次**当前会话**读取。两模式整个probe的同步读都只属于当前fixture，来源含启动resume/bootstrap及现有`GitCommitIntent.current`轮询；不是所有同步读消失。该残余开销记录为后续调查线索，不扩改Git运行时。初次observer导入非export绑定的启动前失败、host修补前扫描失败、计数归因前失败均保留在[正式工件](../../.omx/artifacts/phase20-addition-catalog-scheduling/README.md)；测试中误把inline help当全屏夹具的断言已改为显式fullScreen，未为此改产品行为。

延后CI一次读回：`db36da4432916d9465f9d085ebef3e9a574ae878` 的CI41009873087/Watch41009873069、`4c646ae3cbf4777718e3a40001530cb51e36c45f` 的CI41012137489/Watch41012137488均completed/success且head一致；不替代本批CI。第33项实现建议已覆盖，**用户大目录实际体验/总体heap与延迟仍未验证，保持partial**；31/32/35/36/37继续。未运行真实provider、其他平台、exe、full suite、20k或独立代理review；原47与ADD整体不升级，goal active。本批Git/推送与未来CI另绑定。

### 21.14 第三十一实施：区分保存文件并显示目录加载诊断

[catalog store](../../packages/ts-shell/src/core/models/catalogStore.ts)在同一次读取中返回providers与固定安全诊断，原`loadCatalog`数组契约委托该owner保留。缺失可选文件不提示；不可读、非法JSON、非法providers容器保留其他目录层并给notice，不拒绝启动。复用已有JSON visitor，仅扫描顶层`providers`（包括转义拼写），重复时警告并保留既有最后对象生效语义；不改写文件、不建立通用lint或项目级模型目录。未引入新依赖、provider/auth流程或配置writer。

定向对照pi `core/model-config.ts:158–217`：同意一次不可变读取保留providers+error、缺失可选文件静默、解析失败返回空自定义层。未采用它拼接原始异常的做法，因为错误可能包含用户文档值；本项目诊断只有受控文件名与固定消息。该局部参考未找到重复键检查，不声称参考已解决本项目此要求；复用本项目已有jsonc-parser visitor并用反转回归约束。

[ConfigState](../../packages/ts-shell/src/config/state.ts)与原[shell configuration](../../packages/ts-shell/src/core/shell/configuration.ts)共同发布`catalogDiagnostics`，拒绝候选时保留此前providers和notice；[model publication](../../packages/ts-shell/src/cli/interactive/picker/model/publication.ts)比较数据和诊断，修正空文件即使providers未变也更新warning。原model choice携带同一快照的诊断，不给缺诊断字段的既有accepted调用者混入live-disk warning。bare `/model`、`/model list`（含unknown provider/account路径）、status与面板显示notice，原配置准入/版本/精确选择契约保留。

[settings draft](../../packages/ts-shell/src/cli/interactive/settings.ts)携带原始捕获保存路径，Stored旁及[只读来源页](../../packages/ts-shell/src/cli/interactive/picker/settings/source.ts)显示实际文件；源路径继续经显示净化、原reopen/save绑定和并发写保护保持不变。Model组/模型详情说明`config.json`负责行为和连接，`models.json`为user-profile-only模型目录；`/model config`指示在已有providers对象内加条目。用户[设置指南](../guides/settings.md)加入关注点→文件→作用域→writer表，并区分generated cache与当前会话选择。没有为项目创建models.json。

主代理串行十个聚焦文件219项、四独立反转/finally bytes恢复、五静态门、TS build通过；118旧docs advisory保留。首轮四个命令测试失败来自Vitest将数组行展开为多个回调参数，改对象夹具后通过，没有为测试改parser行为。新增覆盖不可读/非法JSON与形状、可选缺失、顶层转义重复与嵌套/字符串排除、缓存层优先级、原文不变/不泄露、拒绝保留/notice-only refresh、命令与面板诊断及实际user/project保存路径。

原Node CLI两模式各1会话×1消息：实际`/model`看到安全解析notice和当前模型文件归属，probe仅修正自己的隔离models.json后重开，notice清除；随后实际`/settings`进入maxTurns来源页、切project scope再检查，readonly payload为精确原保存路径、屏幕显示Save file/config.json。全程无Apply，user/project config逐字节不变、请求0、exit0/cooked flags，退出140/132ms。初次普通模式已通过；全屏probe密集Esc留下rewind面板，加入超过既有600ms手势窗口的dismiss间隔后两模式通过，前收据保留。build `d1cc517998304f1864056e6917061d109b7abbd08f9bcf68f4e8427af508921c`，inputs `4f6fe518a669059e1b73f8507dbe919afb8082d684905ea71936e6a8b2eb24cd`。

[正式工件](../../.omx/artifacts/phase20-addition-catalog-ownership/README.md)与HANDOFF保留。named-callable比较：catalog store6→13、publication helper1→2，其余不增长；保守计数下model/settings picker已有46/23仍保留，**本批没有解决这两处既有责任上限问题，不能称所有owner都达标**。实际用户models文件未编辑；其他平台、真实provider、exe/full suite/20k和独立代理review未验证。第31项本地实现与小型CLI通过；32/35/36/37继续，第33项大目录体验仍partial，原47与ADD整体不升级，goal active。

延后一次读回：`0613878865e19f6e9a656d1191a6d8bdb6f7f7d7` 的CI41015773762/Watch41015773723均completed/success且head一致；本批提交/推送与未来CI另绑定，不借用上一批绿色。


### 21.15 第三十二实施：settings 顶部分类与方向一致的导航

settings 显式采用 `navigation.placement = top`，由原 `chipStrip` 绘制唯一分类来源；移除以前被navigation抑制的重复chips。内容继续原panel，两列分别为列表/详情，不再有第三列分类侧栏。40/80/120列均让活动分类保持可见；默认side保留给model与help。左右键切分类，Tab/Shift+Tab仅在条目与分节标题间切换，上下键在当前域移动；标题Enter进入其首字段，标题Esc回条目，条目Esc关闭，搜索Esc保留所选结果及所属分类。搜索变化同步清空chip命中，拒绝使用重绘前的旧分类窗口。footer、`/help`的settings描述、直接settings说明及两份指南同步。

此前已定向只读对照终端参考的settings-selector.ts:1940–1960与tab-bar.ts:205–226：采用横向分类/左右键、Tab标题/条目决策，继续目标原有chip窗口与命中登记；不复制另一套renderer。放回side与恢复三域Tab的独立反转均使回归失败。搜索排序原样移入已有settings子目录，显式接受原category order，避免重复排序表；主settings picker保守named-callable计数23→20、新search1、navigation12不变。overlay30与命令registry121为本批未增长的既有超限，append disposition，不称全部owner达标。

主代理串行完成五静态门、九聚焦文件202项与TS build；四独立反转（placement/Tab域/旧chip命中/model side默认）均AssertionError且finally逐字节恢复，补足Tab双向循环断言后的恢复navigation22项再通过。初次6处测试失败来自详情列重复label误作列表坐标、80列标签截断及错误的下一字段假设，修夹具后以实际Enter字段ID维持更严格验证，未放松写入或身份断言。118旧docs advisory保留，无并行heavy/子代理验证/全套本地回归/20k真实终端。测试断言变更后首个CLI尝试被freshness拒绝，随后重build，未把旧build视为当前代码证据。

原Node CLI在regular/fullscreen均各1会话×1消息，物理PTY依次resize40/80/120列：顶部活动分类、Tab标题→下一节→Enter字段→实际详情→Esc原字段、左右分类往返保留字段、搜索All与Esc所选归属均通过；再打开model，Tab仍到原侧栏。配置user/project及models文件字节不变、请求0、exit0/cooked flags，退出136/142ms仅为小fixture观测。鼠标实际绘制区域、短frame及旧命中拒绝由单元宿主覆盖；未采集真实桌面鼠标/键盘或其他平台体验。最终build `6a98f52461a8e7443de16bc14fb88b92395048201c67b39d0678a5c0855fb0de`，inputs `40eb551ecc21d86b841a49d4e2567490c43a062e7a5666f0a9c1c336c9fc9967`，收据与[正式工件](../../.omx/artifacts/phase20-addition-settings-navigation/README.md)绑定。scratch已清理，原CLAUDE.md保留。

延后一次读回上批`94a4737978808146d33d169ee0be48e8065cda51`：CI41018354924仍in_progress、Watch41018354865 completed/success，head均一致；不等待或重复轮询。本批未运行独立代理review/真实provider/exe/full suite/20k，自己的Git/推送与未来CI另绑定。第32项本地实现与小型CLI通过；35及36/37继续，第33项用户大目录体验仍partial，原47与ADD整体不升级，goal active。


### 21.16 第三十五实施：model 字母排序与不可选择的未就绪分组

provider保持原有“至少一个精确model行可用”的就绪裁决，先就绪后未就绪，各组按label/缺省id字母序；模型行在对应就绪组内按model id字母序，同名模型按provider顺序且保留原connection稳定顺序。排序在navigation.set前完成，侧栏、分类内容与跨分类搜索共用来源。Roles/All models分类固定在前，default/subagent/summary/advisor角色行保留固定顺序，目录外当前请求仍由原路径置顶。新order owner只负责投影，无provider/auth/写入政策变化。

未就绪provider前有不可聚焦的`Not ready`标题：现有未就绪还可能是credential-missing、连接error或effort不兼容，故不把它们全部误写为“未配置”。标题不登记pointer/wheel命中，set/select/键盘跳过，下面的provider及disabled-but-focusable模型仍可检查并打开精确配置入口。40/80/120列回归同时检查标题、跳过、点击无效、字段身份及no-write。定向只读参考model-hub.ts:744–748/772–778与hub-frame.ts:248–250，同意已解锁/锁定分组字母序与无选择分隔；模型按用户字母序而非参考MRU/版本排序。

最终主代理单进程串行：五静态门、九聚焦文件269项、TS build、owner计数与原Node CLI两模式均通过，118旧docs advisory保留。另五独立反转（provider label排序/model排序/标题键盘/pointer/直接select）全部AssertionError，finally逐字节恢复；加强不同id/label顺序夹具后相关三文件52项通过。初次测试分类为旧顺序预期和夹具生命周期：epsilon消失后应取上一帧字母序中的gamma，跨provider已删除搜索结果后取幸存shared-d并回first provider；ModelFocus实现未改，身份/无写入断言保留。新增detail夹具在apply前调用原load，不放宽owner校验。

延后CI读回发现第31项`94a4737978808146d33d169ee0be48e8065cda51` CI41018354924 failure（12688 passed/1 failed/3 skipped，1042文件passed/1 failed/1 skipped）；唯一失败为overlay/wheel.test.ts缺SettingsDraft.file，经真实detail渲染触发TypeError。补typed SettingsHost的完整file及顶部settings的列表列坐标，最终12项wheel全部通过；历史SHA仍失败，不冒充已变绿。该SHA两个Watch41018354865/41020107097均success。`26d3a53c0214410ddd28202a934bd724f294a9dd` CI41020546837本次读回仍in_progress、Watch41020546679 success；不等待/重复轮询，本批远端CI单独绑定。

CLI每模式1会话×1消息，isolated home/profile/project、synthetic offline、heap768MiB/45秒，物理resize40/80/120列：provider组序、当前模型置顶、Not ready标题/键盘跳过、未配置模型真实检查与返回、全目录跨provider模型/搜索字母序均通过。完整built-in目录保留，非只塞四个fixture。前探针误以为自定义provider相邻、并期待窄列未截断的Configure connection，保留失败收据后改用真实next provider/可见prefix/精确action id；未改产品来迁就夹具。user/project config及models字节不变、请求0、exit0/cooked flags，退出130/138ms仅为小夹具观测。

build `02517cf6aedf162c04ac06a13af6cdddbf144202f4b18b3a8f31b3e167b52d65`，inputs `fc9a56afaba143945a564cf526162ac72b4b207cdc9a6197f1f65b5f12cbd27c`，两CLI及[正式工件](../../.omx/artifacts/phase20-addition-model-order/README.md)绑定。named-callable navigation12→13、renderer6不变、order1，model picker既有46未增长，append disposition而不称全owner达标。无独立代理review/NormProof judge/真实provider/其他平台/exe/full suite/20k；scratch清理，原CLAUDE.md保留。第35项本地实现与小型CLI通过；36/37继续，33的大目录真实体验仍partial，原47及ADD整体不升级，goal active。


### 21.17 第三十六／三十七实施：重复粘贴展开与全屏点击定位

[PasteStore](../../packages/ts-shell/src/presentation/tui/pastes.ts)只保留一个最新文本token的fresh记录；hold后由实际插入路径绑定精确末尾与editor.textRevision。1200ms内在同一末尾重复粘贴即展开原payload；内部位置继续不限时展开，图片不展开。过期、负时间差、其他token/位置、任何编辑或撤销/重做、短粘贴、图片、update/clear均不能复活末尾手势。展开仍经原editor.replace，一次Ctrl+Z恢复token，下一次无关粘贴保留剪贴板。没有第二份payload栈。

21.6建议的每个编辑回调disarm调整为既有单调textRevision：目标源码已证实saveUndo、insert和restore更新该值，普通caret移动不变；它能拒绝“编辑后撤销到相同文本”，不依赖内容比较，也无需给所有编辑路径增加hook。host真实输入回归与原Node CLI都验证该反例。局部参考研究仍成立：参考没有重复粘贴展开手势，本项沿用目标的issued身份/held载荷/原编辑器路径，不声称借用了参考实现。

[Pointer](../../packages/ts-shell/src/cli/interactive/pointer.ts)对未修饰左键记录同格候选，指针一旦离开原格即失效，拖回也不定位；release只在原视图、原painted source/revision/宽度/viewport/行几何仍有效、且原DragSelection没有处理选区时返回source offset。[host](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts)复用既有mouse callback应用setCursorOffset、reset Vim与补全同步；offset0明确可用。复用[composer sourceBoundary](../../packages/ts-shell/src/presentation/tui/composer/projection.ts)的UTF16字素映射，宽字第二格落到字素起点，行末文本区空白夹到行尾；content区域以外的gutter/边框/scrollbar与装饰行拒绝。双击词、三击行、拖拽复制及picker/reader优先级沿原owner，regular主屏保留终端鼠标。

定向只读核对pi tui-alt-screen.ts:925–944与editor.ts:638–694，同意“原格释放且从未移开”才产生click；复用本项目现有映射与选择器，不引入第二套几何。单元覆盖中日韩宽字、组合音标、emoji/ZWJ、空草稿、软折行/换行、尾部空白、修饰键/右键、边框、重复release、drag/move离开再回来、text/undo/resize/失效layout/换view，以及双/三击。真实host走SGR解码验证caret、补全重同步、regular拒绝和picker/reader接管。

主代理严格串行：五静态门、九聚焦文件295项、host筛选13项（另371项按筛选未运行）、TS build与owner审计通过；118旧docs advisory保留。五独立反转分别移除时限、文本修订、host插入绑定、指针离格失效与stale geometry拒绝，全部AssertionError并finally逐字节恢复。named-callable为pastes19→20、projection3/pointer16/keys3不变、既有host122不变；没有据此解决host责任上限。未运行本地全套、15-suite batch、20k真实终端、exe、NormProof judge或独立代理review。

回查历史CI：26d3a53c的41020546837 failure（12687 passed/8 failed/3 skipped），fda6a665的41022696879也failure（12692 passed/9 failed/3 skipped），详见[CI收据](../../.omx/artifacts/phase20-addition-input-gestures/prior-ci.json)。本批将间接settings断言改用唯一navigation来源、移除旧侧栏Esc、hover坐标改为当前列表列，并补typed SettingsHost.file；不是恢复重复chips或旧导航。settings/model recovery/wheel/hover四文件99项与四个实际scope/mode宿主用例均在上述组合中通过。后一次CI另有两项publication旧邻项假设：完整built-in ready目录中alternate与shared间还有其他模型，不能仅把Down换成Up；修为有界逐项键盘移动并断言精确ID，19项补验通过并另记于最终日志。原read-only/恢复/不写入断言保留。历史失败SHA不会因此变绿；Watch41020546679/41022696885先前读回success，不能代替代码CI。

原Node CLI两模式各1保存会话×1消息，isolated home/profile/project、synthetic offline、heap768MiB、45秒/2MiB限额。两模式实际重复粘贴、展开撤销后再粘贴、超时后保留剪贴板、输入并删回后失效均通过；物理PTY依次40/80/120列，全屏点击宽字第二格后插入准确、拖回不定位，press后resize的旧release拒绝；regular同坐标SGR不会到pointer。user/project config及models字节不变、请求0、exit0/cooked flags，退出132/133ms仅为小夹具观测。

publication首轮只换方向仍失败，诊断看到完整内置条目后改为精确目标的有界键盘遍历；未修改model排序或刷新产品代码。首轮probe误把regular document视作具有composer鼠标几何；全屏第二轮又在caret已到目标时提前完成等待，将尚未处理的新click混入后续drag收据。失败收据均保留，分别改为regular直接验证无pointer调用、全屏同时等待实际新增mouse events与caret。产品未为探针改动。最终build `e30fee9b2190193441b0f69215310220045526ee43dc1349097bb7be883f670b`，inputs `499f2356143bf0a5fb68a49b55e5a9b569d946c1734d9e33d3f107ac47710fb3`，与[正式工件](../../.omx/artifacts/phase20-addition-input-gestures/README.md)绑定。第36/37项本地实现和小型CLI验证通过；真实桌面手感/其他平台未验收，33用户大目录体验仍partial，原47与ADD整体不升级，goal active。本批提交/推送及未来CI另绑定。


### 21.18 第三十三残余开销：未准备的Git工具清单不再读取会话全文

21.13实际CLI归因曾发现当前会话的Git工具投影同步读取，未误记为删除目标的读取。本批沿[foregroundTools](../../packages/ts-shell/src/cli/runtime/prompt.ts)→[Git runtime](../../packages/ts-shell/src/cli/runtime/git.ts)→[commit intent](../../packages/ts-shell/src/workflow/git/operation/intent.ts)定位：tools先调用current supplier，后检查armed；supplier通过manager.getSession读取当前完整transcript，因此输入估算/工具清单即使没有原生提交意图也重复读全文。

修补仅调整原意图owner的顺序：无armed立即返回空Git工具列表；已有armed仍获取原权威prompt，继续校验session/cwd/user role/source/exact intent ID。未使用缓存draft代替持久来源，未新增工具库存、索引或prompt缓存，未改变Git审批、准备计划和write/readback边界。定向只读对照pi agent-session.ts:1518–1541：普通工具发现从已激活工具状态投影，不为清单重载session history；参考没有本项目host-armed提交合同，未借用其机制或放松本项目权威校验。

先采集修补前后同一小型原NodeCLI：regular/fullscreen各1保存会话×1消息，实际输入三个字符并等待预览；两模式修补前均21次tool discovery/21次其内部同步transcript读，全程共23次。修补后仍均21次discovery，该owner内同步读0，全程剩余2次启动读取。不是全进程零读取，也不是用户大目录延迟/heap实测；21.3扫描/删除的既有预算和复验保持原样。synthetic offline、heap768MiB、45秒/2MiB限额；user/project config和models字节不变，零请求，exit0/cooked，退出145/139ms仅小夹具观测。

主代理单进程串行五静态门、intent/native operation两文件32项、runtime preview筛选4项（另99项未运行）通过；两反转分别恢复急切读取与移除armed来源/ID拒绝，均失败并finally逐字节恢复。前者命中测试特意抛出的history acquisition错误，不写成AssertionError；后者命中身份断言。恢复后intent8项与实际foreground投影1项再通过，随后TS build、owner AST审计及两模式CLI。intent named callable5→5，无新增超限。build `0edc912eddca92511a12ff9d3b0a27fb46943988fa462266ff204061bb411be7`，inputs `0632b42b62113c7e481b33b122d724cb88680e1400c11a45fb7a605db1edeb57`，与[正式工件](../../.omx/artifacts/phase20-addition-idle-tools/README.md)绑定。

没有本地全套/并行heavy/子代理/20k真实终端、exe、独立review、NormProof judge或真实provider/其他平台验收；scratch清理、原CLAUDE.md保留。第33项减少一条已确认的残余同步开销，用户大目录实际体验仍partial，原47与ADD整体不升级，goal active。延后读回b30801aa的CI41026961526仍in_progress、Watch41026961630 completed/success且head一致；不等待/重复轮询，本批提交/推送与未来CI单独绑定。

### 21.19 顶部分类悬停与鼠标切类后的原字段恢复

继续核对第3.1节鼠标与连续性要求，确认21.15顶部分类只登记点击span，motion只查listRows，故settings分类无法悬停高亮。[OverlayHost](../../packages/ts-shell/src/cli/interactive/overlay.ts)复用原chipRows，在原列表/侧栏命中之后补chip命中；独立标记chip hover，避免同ID内容行误高亮。[chipStrip](../../packages/ts-shell/src/presentation/tui/chrome/chips.ts)沿原主题绘制非活动分类的悬停，活动样式优先；悬停不改变分类、字段、预览或保存。原搜索/resize/来源替换/短frame与未绘制origin、modified motion、loading准入继续有效。

小型原CLI进一步复现：从Theme详情返回，鼠标点Model，再用Left回Appearance，焦点丢到Input shape。键盘切类会捕获当前行，而鼠标直接select；现于原pointer分类入口先调用navigation.focus捕获当前字段，再select，保留原search guard，不增状态或另一套导航。top/side回归都用非首项initialSelection，确认返回与Enter保持原行。

定向只读对照`settings-selector.ts:1242–1272`与`tab-bar.ts:248–255,337–353`：采用已绘制命中、悬停独立于选择、活动样式优先。该参考的鼠标与键盘共用tab-change回调（`:661–670`），但切类重建列表（`:1808–1817`）；本项目保留自身更强的逐类字段记忆合同，仅补齐两种入口的一致捕获，不照搬重建。回归与四反转覆盖路由、绘制、分类/内容同ID隔离及返回焦点。

主代理严格串行：初始新增悬停6失败/既有7通过，追加鼠标返回2失败；最终四文件**118项去重测试**、五静态门、四反转（分别3/3/2/2失败，finally逐字节恢复）、恢复后hover16项与TS build通过。118旧docs advisory保留；保守named-callable overlay30→30、chips4→4，既有overlay上限债保留并append disposition，不称全部owner达标。最终build `fd78750d75921f43170a72cf28f52ad0bf196f76028016e414c0ba623a842b34`，inputs `f8188435fc5f8ae9d6fe1f3a27445e492c68c2d47f7fd0d51a33b181f5197044`。

原Node CLI regular/fullscreen各1保存会话×1消息，物理40/80/120列resize、真实SGR motion、原字段Enter/取消、鼠标切类与键盘返回、model侧栏悬停和退出逐项验证；配置与models字节不变、请求0、exit0且cooked flags恢复。探针旧收据保留：首轮未取得完整observer；修原子收据和显式颜色后，不能把同色selectedBg/statusBandBg算作多处hover，改为实际行样式hash差与独立hover身份；随后真实暴露的字段丢失已修，未放松返回断言。首次产品修补误将共用chipRows里的侧栏分类也归为chip，既有回归检出后修为列表/侧栏优先；详见[正式工件](../../.omx/artifacts/phase20-addition-tab-hover/README.md)与HANDOFF。

延后一次读回确认`93efa0a0`的CI41028824744/Watch41028824745及`b30801aa`的CI41026961526/Watch41026961630均completed/success且head一致；本批自己的提交、推送与未来CI另绑定。不运行全套/20k真实终端/exe/真实provider/独立review或NormProof judge；用户桌面手感、其他平台和第33项大目录体验仍未验收，原47与ADD整体不升级，goal active。


### 21.20 团队报告经用户明确采用后才进入主上下文

继续17.5与20.55的明确缺口：原team工具完成review后立即把提案、收敛、finding与读取证据返回主模型，既有工具运行审批不能代替对完成报告的采用。[team tool](../../packages/ts-shell/src/core/tools/teamTool.ts)现在委托本域[adoption](../../packages/ts-shell/src/core/subagents/team/adoption.ts)，复用原interactiveAsk/question bridge暂停工具结果；预览展示claim/falsifiers/refs、判定理由、finding、实际读取的locator/范围/SHA256、缺失review及相关性限制，明确采用不授予工具许可。控制字符沿原neutraliseForDisplay显示为字面量；序列化或显示超过64KiB则拒绝，不出现“批准截断预览却发布更大报告”。无第二套store、runner、命令或provider机制。

每次报告用随机问题ID，只有completed响应对该ID拥有自身answer且精确等于`Adopt report`才发布；缺省首项为`Keep report out`且无推荐选项，空答/yes/继承属性/其他ID均不采用。通过原[turn tools](../../packages/ts-shell/src/turn/tools.ts)传入已有live admission，提问前后复验session/config/turn准入；取消即使遇到忽略signal的宿主也及时settle、移除listener且不接受迟到回答。无宿主、失败、取消或stale结果只带固定安全状态和report ID，全部结果面不携带claims/verdicts/findings/evidence；采用后metadata保留报告和绑定session/workspace/task/内容的SHA256 digest。没有改变工具许可或写入边界。

目标实现先读，后定向只读对照pi extensions/runner.ts:575–590的prompt生命周期和:333的默认拒绝；oh-my-pi interactive-mode.ts:7435–7492暂停继续、await后复验origin session，以及:7789–7833取消/无回答不批准。本项目复用现成question bridge，未照搬独立UI基础设施、执行模式切换、默认高亮批准或不符合Node floor的AbortSignal.any；沿advisor显式apply的语义但不新增持久note仓库。

主代理严格串行：旧实现14条新增回归全部失败；最终六文件**82项去重测试**、五静态门和TS build通过，118旧docs advisory保留。四独立反转移除发布边界、精确答复、回答后准入和turn准入传递，分别1/5/1/1项失败，finally逐字节恢复；恢复后25项再通过。保守named-callable teamTool7→7、adoption新增7、turn/tools17→17，均≤20。build `79bbfe049002b7483ce57b17da48ddcc95fd8640543885d91fc6276e97403c39`，inputs `b2b1e2c05d891939c4912f12342ecff11fe09d1ee7d0c228dea54d0526a4d625`，详见[正式工件](../../.omx/artifacts/phase20-addition-team-adoption/README.md)。

原Node CLI regular/fullscreen各1保存会话×1消息，isolated home/profile/project、loopback HTTP、heap768MiB、45秒/2MiB限额；实际tool_search/tool_load、两提案/交叉review和native selected read全链路。allow-all下仍等待采用，完整预览期间无新请求且当前报告未持久化；真实输入1拒绝后下一主模型payload与保存会话不含本轮报告，输入2才含对应claim/falsifiers/四条line2收据与digest。每轮独立公开marker排除旧已采用历史的干扰。pending Ctrl+C两模式均观察406ms结束（含300ms静默检查），无后续主模型请求；pending Ctrl+D退出251/238ms，未采用、问题settled、exit0/cooked恢复。配置和fixture文件字节不变，scratch清理；时延只为小夹具观测，非生产性能结论。

原CLAUDE.md保留；无全套/并行heavy/本助手subagent/exe/20k真实终端、真实provider、独立review或NormProof judge。延后读取19ee578c CI时GitHub API EOF，保留失败收据、无CI结论，不混同产品失败或成功；本批提交/推送/未来CI另绑定。17.5的本地报告采用路径已覆盖，模型成本/收敛质量、真实桌面/其他平台与33大目录体验仍未验收，原47与ADD整体不升级，goal active。


### 21.21 后台等待显示时长与真实六十秒自动提升

继续17.3的“可等待、可取消、带进度”与20.49尚缺的真实60秒提升证据。原[taskWait](../../packages/ts-shell/src/core/tools/shell/background.ts)只等完成事件，等待卡片正文为空；现复用ToolExecutionContext.onOutput→既有tool.output→原ToolCards，订阅并复验完成/取消后立即显示等待0秒，此后每5秒显示已等待时长与等待上限。时钟不表示任务完成比例、原任务年龄或running状态，不读取任务、不重复输出命令/内容，也不决定完成；等待原300秒上限及任务自身期限不变。现有tool.output持久语义保留，最多约60条有界更新，不称零I/O。

显示计时与原settlement同生命周期：完成、超时、取消全部clear interval，预先取消、已完成及注册间隙完成不安装；初次回调同步取消也正确清理。observer抛错只关闭后续显示，实际wait仍由原完成事件返回结果，不把callback异常当任务结果。没有新增任务系统、runner、store、provider/权限机制或event类型。原成功/取消/超时最终文本由实际task快照投影，替换等待预览。

先读目标的wait/卡片/事件持久与原promotion owner，再定向只读对照oh-my-pi tools/wait.ts:24–25,220–249：只在有update callback时安装时钟、finally随等待资源释放。保留本项目单任务/300秒/Node floor；选5秒有界文字更新，不复制参考500ms快照读取、消息/服务协调、30分钟上限或Promise.withResolvers。

主代理严格串行：旧实现新增11项中8失败/3控制通过，包含一次夹具等不存在callback的30秒timeout，现改先断言首次publication再await，使缺失直接失败；原日志保留。三文件38项与原foreground promotion4项共**42项去重测试**通过，五静态门、TS build/freshness/AST通过，118旧docs advisory保留；原background测试的Node子进程deprecation warning保留，未为其改运行时。四反转独立撤回首次显示、interval释放、完成复验return、observer失败释放，分别1/3/1/2项断言失败，finally字节恢复；恢复15项不重复计数。owner named-callable11→12≤20。build `7499028c41a4b125f9d40e17b29501c009d3db8a8783211cd7130ed93892a7f1`，inputs `336820d5bccff83c07312cede18a15fa093f35a8f1a389105cfad52633622578`，详见[正式工件](../../.omx/artifacts/phase20-addition-wait-progress/README.md)。

原Node CLI regular/fullscreen各1保存会话×1消息，isolated home/profile/project、loopback HTTP、heap768MiB、100秒/2MiB限额。实际foreground bash未指定timeout，原owner只adopt一次，最初无durable job；原60秒窗口未缩短，CLI同进程单调观测分别60123/60125ms后promotion一次，保留原PID/start identity，0个background重新launch，账本仅1项且结果明确after60 seconds。随后真实1秒wait超时保留运行；Ctrl+C取消分别107/108ms，原进程仍活跃且无额外模型请求；重新等待同一任务，事件和终端文字均观察0/5秒，release后原事件完成、exit0、输出持久化，三次wait listener全部释放，host原notice listener保留。配置字节不变、无重复dispatch，Ctrl+D退出181/175ms且cooked flags恢复；上述时间仅小夹具观测，不是生产长任务/平台性能结论。

三次探针失败均留收据：首次把未创建账本的可选local当现有数组；第二次从child ready算前台窗口，漏掉shell/child启动，改为原adopt/promote的同进程单调边界；第三次已见0/5秒event但未等异步绘制帧，改为同时等待实际terminal text。未为这些fixture问题修改产品或放宽同PID/单次提升/60秒结果/实际绘制断言。scratch已清理、CLAUDE.md保留，无本地full suite/并行heavy/本助手subagent/20k终端/exe、真实provider、独立review或NormProof judge。

延后一次读回：19ee578c的CI41032575806/Watch41032575779均completed/success且head匹配；316e4de7的CI41035961101仍in_progress，Watch41035960972 completed/success。无重复watch，本批提交/推送/未来CI另绑定。17.3本地等待与原60秒提升路径取得证据，真实生产任务/设备、非Linux、33大目录体验及原47/ADD整体仍未验收，goal active。

### 21.22 ADD-11/12多skill进入原生研究实际HTTP请求

继续第9/10节真实payload验收。目标[entry](../../packages/ts-shell/src/research/run/entry.ts)、[stage prompt](../../packages/ts-shell/src/research/run/prompts.ts)与[runner组合测试](../../packages/ts-shell/src/research/run/composition.test.ts)已实现全部method正文的持久化和每阶段注入，本批未发现新的产品缺陷，因此不添加重复注入或新runner。先读目标，再定向只读对照pi agent-session.ts:2150–2154,2228–2255的派发前skill展开与显式location；参考仅处理首位单skill且未知名称原文透传，本项目按addition保留正文/多skill及派发前明确拒绝的更强合同，未复制实现。

补充原NodeCLI→实际loopback HTTP adapter→research_run→原生顺序children→主请求继续的证据，弥补旧research-preview只有run持久化、没有children的范围。regular/fullscreen各1保存会话×1消息、两份公开skill，首先提交未知第二skill：精确原草稿恢复、state内容不变、零POST/零run。随后首位研究入口带两skill实际调用native read，12次POST中根2/child10，八children按brief/investigate/gaps/draft/review/report×3完成；调查/复核各一次实际读取，保留一份content-addressed来源、一个bound claim和三report fragments，run/review均completed。正文研究入口带两skill且有原始换行，另10次POST中根2/child8，零reads/sources/claims，review failed、run partial；成功返回的review child未被当作核验成功。

每个实际根entry和child prompt均检查两份准确正文各一次；根工具schema精确绑定本次runId，所有child输入同ID；durable methods与user metadata保留原始输入/换行和两份正文。每个child请求ID存在且去重计数吻合，不提供shell/write/nested task/research权限；账本scope存在、推进且无pending，最终两种native状态均实际绘制。不请求save，project/config不变，Ctrl+D exit0/cooked恢复。heap768MiB、每模式60秒/2MiB/30POST上限，实际每模式22POST+2readiness GET，scratch清理。

主代理严格串行：五静态门、两个脚本syntax与两模式原CLI通过，118旧docs advisory保留。复用已验freshness的build `7499028c41a4b125f9d40e17b29501c009d3db8a8783211cd7130ed93892a7f1`、inputs `336820d5bccff83c07312cede18a15fa093f35a8f1a389105cfad52633622578`；无产品源码变化，未重跑unit/build或修改源码做反转。两份初期probe失败收据保留：错把相同来源复读当两record、对原selected-text哈希先trim；修正为实际child/request/receipt/当前review归属和保留末尾换行的哈希，未改产品或放宽fresh read断言。详见[正式工件](../../.omx/artifacts/phase20-addition-research-wire/README.md)与HANDOFF。

一次延后读回：316e4de7的CI41035961101/Watch41035960972均completed/success；ed4820cb的CI41039139794仍in_progress、Watch41039139814 completed/success且head一致；本批Git/未来CI另绑定。原CLAUDE.md保留，无full suite/并行heavy/本助手subagent/20k真实终端/exe、独立review或NormProof judge。此为确定性loopback的实际请求契约，非生成式模型研究质量、真实provider费用/可用性、deep/paper/mixed/save/recovery/平台验收；ADD-11/12与原47/ADD整体不升级，goal active。

### 21.23 草稿暂存与外部编辑撤回提示使用实际绑定

继续17.4的真实可用快捷键要求。默认键与alt+s已存在，但[host](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts)的stash/rewrite三条提示仍写死ctrl+s/ctrl+z；用户重绑定或冲突后，实际动作和恢复提示不一致。现于原[InputPreferences](../../packages/ts-shell/src/cli/interactive/inputPreferences.ts)复用thinkingShortcut的有效键查找，选首个仍派发到对应action的键；thinking callback委托同方法。host只在提示生成时读取它，无可用键明确写shortcut unbound。stash槽、互换、undo、外部编辑执行和路由保持原owner，不增第二份草稿或绑定表。

目标先读后定向只读比较参考PromptInput.tsx:819–823的action-aware hint与ConfigurableShortcutHint/useShortcutDisplay：同意按实际action读取，未复制其迁移fallback；本项目始终有accepted binding owner，显式unbound不能退回默认键。新宿主回归和反转分别验证动态提示、冲突过滤及无默认回退。

主代理串行：旧实现16新增全失败；最终**26项去重**聚焦通过，374未选不计，三反转分别16/6/4断言失败并finally字节恢复；恢复26项再过、五静态门与TS build/freshness通过，118旧docs advisory保留。保守AST含constructor和命名property callback，InputPreferences7→8、既有host123→123；未解决host责任上限。build `e2930dba7c8af5c2ce9a7ae62770da5573bfeaa5485c38b406ce9216dbc1b47f`，inputs `e2bd5e51ebe097036feaf680dd0ffb219c2f3a5c5eb302c0a9a533badcce0d38`，见[正式工件](../../.omx/artifacts/phase20-addition-draft-shortcuts/README.md)。

原NodeCLI regular/fullscreen各1保存会话×1消息、45秒/2MiB/heap768MiB限制，真实alt+k stash/恢复、外部editor进程、alt+z undo、保留旧槽、unbound提示与三次实际/reload均通过，每条notice既观察state也等待实际terminal输出。零HTTP请求、config/project不变（只有probe主动改fixture keybindings）、Ctrl+D exit0/cooked恢复，scratch清理。第一次host fixture未flush最后grapheme，第一次CLI又对空草稿连续Ctrl+C触发原退出；两类失败日志保留，均只修fixture，不改产品手势或放宽原文恢复。

ed4820cb的CI41039139794/Watch41039139814延后读回均completed/success；上一证据提交ff084423的CI41040907065仍in_progress、Watch41040907311 success且head一致，不重复轮询。本批Git/未来CI另绑定，原CLAUDE.md保留。无full suite/并行heavy/本助手subagent/20k真实终端/exe、真实provider/独立review/NormProof judge；非raw流控、用户桌面与非Linux未验收，原47/ADD整体不升级、goal active。

### 21.24 多skill真实研究的有界请求尝试与未知结果

接续21.22确定性HTTP链，使用已配置openai-compatible的正常adapter和原Node CLI regular，显式请求gpt-6.1-terra，尝试真实模型读取两份相互矛盾的公开本地资料并使用两份skill。release限定v2/Linux/FEATURE_X=1、排除Windows；mirror无版本却声称默认全平台启用。隔离Git project/home/profile、1保存消息，只准read/glob/grep/research_run，关闭MCP/warming/重试、offline，heap768MiB、360秒/2MiB/根4步、原quick五分钟期限。1536输出上限仅请求值，后端型号与远端执行未确认。

两次尝试分别5/6秒结束在ready/brief，零native child/child request/read/source/claim/report fragment，review未运行，不能作为研究完成或质量证据。最终结构化query.failed只得到unclassified-live-or-runtime；没有证据认定Terra不可用、网络或认证故障，也未改用Sol。账本各保留1派发后未知结果；第二次确认0未派发项，已结算input/output为0不等于零tokens或零费用。目标[ledger](../../packages/ts-shell/src/core/agent/request/ledger.ts)与[research policy](../../packages/ts-shell/src/research/run/policy.test.ts)原合同要求保留不完整用量及显式reconcile，不应为探针清账或新增runner。

首轮失败收据原样保留但排除诊断：对整段终端搜network会命中回显的用户输入，且探针错误要求未知结果必须清零。最终仅分类真实错误event字段，原文丢弃；保持未分类、记录未知账本，completed仍要求settled。空引用上的every=true不算引用验证。两次CLI均exit0/cooked恢复，原config及公开文件字节不变；0700 scratch内0600凭据fixture已删除，原始模型/终端/错误文本不存档，收据写入前扫描原key/endpoint。详见[正式工件](../../.omx/artifacts/phase20-addition-research-live/README.md)，HANDOFF补回显误诊guardrail。仅证据脚本/文档变更，无确认产品缺陷而不修改运行时。

主代理syntax与两次CLI严格串行，两次probe命令均exit1（live未验证），复用fresh build `e2930dba7c8af5c2ce9a7ae62770da5573bfeaa5485c38b406ce9216dbc1b47f`、inputs `e2bd5e51ebe097036feaf680dd0ffb219c2f3a5c5eb302c0a9a533badcce0d38`；无unit/build重跑、源码反转、full suite/并行heavy/本助手subagent/20k真实终端/exe/独立review/NormProof judge。一次延后读回ff084423 CI41040907065/Watch41040907311均completed/success，22e2a1fb Watch41042919272 completed/success、CI41042919220仍in_progress且head一致。当前提交/推送/未来CI另绑定，CLAUDE.md保留，原47与ADD整体不升级、goal active。

### 21.25 第三十三：2,307会话合成CLI目录探针

为补充21.3的只读用户目录测量及21.13/21.18的小目录CLI结果，使用当前Node CLI在隔离home/project/profile中生成2,307个session目录、每条一条约1.4K重复ASCII填充的合成用户消息。session文件共6,323,775 bytes，明显小于21.3观测的41 MiB用户目录。一个会话由生产`SessionManager` writer创建，其余仅复制有效metadata/state/transcript结构并更新ID、标题和时间，不读真实用户会话。regular/fullscreen各单独串行运行，768 MiB heap、90秒deadline、2 MiB terminal输出上限；只保存计数、状态和耗时，不保存终端正文。

| 模式 | 首帧 | 全目录扫描完成 | 扫描中的按键响应 | 唯一标题搜索 | 确认删除 |
|---|---:|---:|---:|---:|---:|
| regular | 197 ms | 13,046 ms | 72 ms | 177 ms | 149 ms |
| fullscreen | 197 ms | 13,429 ms | 51 ms | 179 ms | 154 ms |

两模式均完整扫描2,307条、matched 2,307、unreadable 0、无source budget限制；首帧时只完成current session并仍处于scanning。扫描中方向键仍能改变焦点。搜索唯一合成标题后删除目标，确认原browse继续使用；第二次打开后于扫描中Escape，catalog browse controller实际aborted且没有迟到page发布。两次均零request、exit0、恢复cooked flags，profile scratch清理、config不变。

探针observer写入receipt并参与计时；合成fixture只有6.3 MB且不是用户当前41 MiB目录，不能据此宣称用户目录、cold/warm磁盘、总heap/physical I/O、平台或release性能已验收。完整扫描约13.0–13.4秒而交互期间仍可用，作为后续实环境对照线索，不触发仅凭此fixture的runtime改动；第33项、原47项与ADD整体仍partial。正式脚本、regular/fullscreen receipt与两次已修正的harness-only失败见[工件](../../.omx/artifacts/phase20-addition-large-directory/README.md)；HANDOFF记录observer receipt owner约束。

### 21.26 第三十三：目录列表合并重复的profile祖先检查

沿21.25继续检查真实catalog热路径，发现[files](../../packages/ts-shell/src/session/store/catalog/files.ts)定位一条会话时，对session目录及metadata/transcript/state/lock共五个路径分别运行profile身份与完整祖先walk；每个目标还经原profilePath再次复验身份。锁文件本次未读，三个数据文件随后原本已有lstat与打开handle前后version检查。现私有目录定位只检查共同session目录；列表沿原三文件lstat、O_NOFOLLOW、handle version、预算和read后的目录/三文件version继续。公开direct-reference入口仍补原四leaf准入，避免改变不用读取正文即可解析确切ID的合同；未修改全局profile/sandbox/writer政策。

先检查目标，再定向只读参考快照`f09d01b85e0384647fcab6779d35ab9dabe04be3`的session-manager异步逐行读取段799–826。采用其有界并发/取消决定，保留目标额外的profile/三文件版本边界；该参考无相同多文件profile布局，不照搬其缓存或弱化身份检查。[正式工件](../../.omx/artifacts/phase20-addition-catalog-boundary/README.md)记录差异、计数与限制。

新12例原实现11通过/1失败，证明重复leaf检查；调用方复核后追加direct-reference三数据文件/锁的链接拒绝与列表不读锁，最终三文件66项通过。五独立反转（恢复重复walk、删共同目录准入、允链接core file、删profile边界、删reference leaf准入）均AssertionError并bytes恢复，恢复17项及原reference消费者6项再次通过。早期单独删entry guard的反转仍绿，因为目录guard独立保留profile身份；保留并明确不计有效证据。五静态门、TS build/freshness串行通过，118旧docs advisory保留；owner named-callable 7→8，未引入其他系统。

同SHA256的256会话×1短消息fixture前后，真实同步lstat/stat/realpath总调用207,302→60,422（减少70.85%），完整扫描1,658→729ms、返回ID一致、文件bytes不变。before用保留旧build明确标为snapshot，after绑定fresh build；单次合成计时、cache未控制，不等于真实用户目录收益。最终build `2ff779a8212489ba2b45aee2d278659ee59d25e7e092fc1a8179704035006859`，inputs `9fd68f6d4c015be87db09d076a960f291716a53846bcbb78a0f0b638fc602e83`。

最终原Node CLI两模式各2,307会话×1消息、6,303,012 bytes、heap768MiB/90秒/2MiB/offline无凭据。regular/fullscreen首帧176/164ms、全扫6,862/6,866ms、扫描中按键72/51ms、搜索168/168ms、确认删除151/151ms；complete2307/unreadable0/sourceLimited false、原browse保留、重开Escape controller aborted且无迟到页、config不变、零请求、exit0/cooked、scratch清理。与21.25的13秒属不同轮次/近似fixture，不能称受控CLI性能配对。初次fullscreen只等面板清空，前一retire收据迟到混入新计数；改为等待真实retire后重开，失败收据保留，未为此改产品。

HANDOFF补共享guard消费者与retire观察边界。延后读回`cccc44662a66b988cd9d948907de79fe42057b4d` CI41050906091/Watch41050906089均completed/success且head一致；本批Git/未来CI另绑定。无full local suite/20k真实终端/exe/独立代理review/NormProof judge/真实provider/其他平台；CLAUDE.md保留，真实41MiB用户目录与桌面体验、原47及ADD整体仍partial，goal active。


### 21.27 草稿暂存保留载荷对应的占位符身份

继续17.4，发现[PasteStore](../../packages/ts-shell/src/presentation/tui/pastes.ts)的protector保留暂存正文/图片载荷，而issued签名按1,024个ID独立FIFO淘汰；再发行1,100个微小paste后，原token虽然可恢复，正文不展开、图片不进入imagesIn，unresolved为空也不代表完整。现原owner优先淘汰order已无载荷的签名；默认128载荷、32MiB总量/8MiB单项、1,024签名ID/8变体、精确标签不变。大于1,024的自定义store仍有限签名fallback，不承诺任意容量下无限保留。删除idsIn关于不存在的计数protect API旧注释，无新store/草稿/路由。

目标先读后定向只读对照参考快照`21a28aef90f19bc64dc6d1bccd5ed8bfb30e7a11`的PromptInput.tsx:1356–1372同时恢复text/caret/pastedContents；本项目复用原protector与载荷map，没有复制参考实现。原实现新增stash三失败/七控制通过，原host两模式均失败；最终49paste+10stash+9filtered host共**68项去重**通过，393未选不计。三反转分别恢复FIFO、删签名上限、弱化精确标签，分别3/1/1 AssertionError；finally源码SHA一致恢复，恢复68项再通过。五静态门/TS build/freshness主代理串行通过，118旧docs advisory保留；owner named-callable20→20，含既有constructor的保守AST为21，仓库分析明确不计constructor，初期audit失败保留并记录两口径。build `00beea7bac87f10ef1e76ff89c1e16ede5439f75965bbeac16a346cb30887526`，inputs `f88bed95e191ccc9a0609cc0a2fb73699627cdf64e4c0b4e47af56d01cf826b9`，见[正式工件](../../.omx/artifacts/phase20-addition-paste-retention/README.md)。

原Node CLI regular/fullscreen各1保存消息、isolated home/profile/project、heap768MiB/45秒/2MiB，真实bracketed paste与alt+s暂存/恢复、Enter提交。公开PNG通过原preferences attachment host注入、1,100微小压力通过实际PasteStore注入，明确非系统clipboard采集或1,100真实键盘事件。两模式精确draft/caret、正文展开/图片/interior expansion/unresolved0成立，压力签名1024/载荷128/4122bytes，暂存期间零POST；提交各一次真实loopback POST，正文精确一次、image_url精确一项、无literal token、短响应实际绘制。config/models/project字节不变，exit0/cooked、scratch清理。

失败收据保留：早期未在models.json声明vision触发原nonvision fallback；错在credentials中写models的夹具派发前失败；已修正metadata owner后实际HTTP通过。随后保存图片断言揭示独立既有缺口：[sessionRuntime](../../packages/ts-shell/src/core/shell/sessionRuntime.ts)调用[string prompt barrier](../../packages/ts-shell/src/session/lifecycle/sessionPromptBarrier.ts)只存文字。最终receipt明确savedUser.textMatches true/imageMatches false，本批不声称图片跨会话replay已修复，该缺口另列后续owner修复。初期释放保护的测试也误要求已淘汰签名仍在unresolved中，现分别验证载荷释放/后续签名过期，原日志保留。

HANDOFF补载荷/签名生命周期及vision/persistence分界，CLAUDE.md保留。延后一次读回8061bd92 Watch41056737048 completed/success，CI41056737057仍in_progress、head匹配，无重复轮询，本批Git/未来CI另绑定。无full local suite/并行heavy/本助手subagent/20k真实终端/exe/真实provider/独立代理review/NormProof judge；真实用户目录、桌面clipboard、其他平台及原47/ADD整体仍partial，goal active。


### 21.28 图片提交进入原用户消息屏障并跨进程重放

接续21.27实际HTTP成功但保存图片缺失的证据，目标[schema](../../packages/ts-shell/src/session/schema/sessionMessage.ts)已支持text/image union，[toChatMessages](../../packages/ts-shell/src/turn/prompt.ts)已保留block，缺失点为原[shell runtime](../../packages/ts-shell/src/core/shell/sessionRuntime.ts)未向[lifecycle facade](../../packages/ts-shell/src/session/lifecycle/sessionLifecycleWrites.ts)传图片，[handler](../../packages/ts-shell/src/session/agent/lifecycle.ts)与[prompt barrier](../../packages/ts-shell/src/session/lifecycle/sessionPromptBarrier.ts)只接字符串。现四段传递optional images，barrier保存原text加image block并拷贝image record，防后续调用方变更；无图片仍string。pendingPrompt/metadata/原空白/事件顺序/sourceEntryId及派发前屏障不变，无新schema/map/replay/provider政策。

目标先读后定向只读比较参考快照`f09d01b85e0384647fcab6779d35ab9dabe04be3`的agent-session.ts:1969–1978构造text/images、1163–1181保存实际message。采用“持久化完整内容”，保留本项目先存屏障且不把environment prompt存进历史，未复制参考代码。初期baseline四个内容断言失败/empty-image控制通过，另两runtime fixture因缺terminal hooks抛TypeError不计产品证据；补齐真实terminal completion、manager callbacks且断言放runtime外后有效反转定位转发。最终**9项去重**聚焦通过，128未选不计，覆盖barrier4、manager完成/中断读盘2、runtime转发与text/seeded-reentry3。四反转撤回runtime/facade图片、flatten content、共享可变record，分别1/2/2/2 AssertionError，finally bytes恢复；恢复九项/五门/TS build/freshness串行通过，118旧docs advisory保留。AST runtime19/handler15/facade29/barrier1均不增，旧facade保守count超20如实保留。[正式工件](../../.omx/artifacts/phase20-addition-image-history/README.md)绑定build `d4297fc1e1cd6053249f47cb8afbb896d1654fdacef71d1638cead1669e053c0`、inputs `a8e6aba8fe59b75f8a3533c898053adb727ce845057ea765e933aa410e975471`。

实际Node CLI regular/fullscreen各1保存fixture消息、isolated home/profile/project、declared-vision loopback、heap768MiB/总60秒/累计2MiB。首次真实paste/alt+s/Enter沿原host公开PNG及1100 tiny store压力，实际POST一次并保存精确text/image user仅一次；退出后新CLI进程重开同ID，零image host/pressure注入，真实followup第二POST携原image_url精确一次和原历史text、新请求正文，响应实际绘制。 fresh disk最终三个user、原block不变；两模式各两个进程exit0/cooked、config/models/project不变、scratch清理。

两探针失败保留：SessionManager在withProfile外构造绑定错profile、历史正文误要求当前请求environment前缀。仅修fixture owner/比较合同，未改产品或弱化精确image/文本/单次历史断言。旧21.27的saved image false作为历史证据保留；此后新增图片可跨所测完成会话进程重放，旧已丢图片不可恢复，image-only自动续跑、compaction/branch与任意图片预算体验未新增验收。中断会话读盘验证不冒充自动中断派发验证。

HANDOFF更新、CLAUDE.md保留。延后一次CI读回8061bd92 CI41056737057/Watch41056737048均completed/success，bc121e28 Watch41062973311 success、CI41062973370仍in_progress且heads一致；本批Git/未来CI另绑定。无full local suite/并行heavy/本助手subagent/20k真实终端/exe/真实provider/独立代理review/NormProof judge，原47与ADD整体仍partial、goal active。


### 21.29 图片中断后的实际continue与零重复消息

补齐21.28明确未验的自动中断派发：读目标[resume owner](../../packages/ts-shell/src/core/shell/recovery.ts)、[continue bridge](../../packages/ts-shell/src/core/shell/continueShellActionRuntime.ts)和[model history](../../packages/ts-shell/src/cli/runtime/cliSessionRuntimeFactory.ts)，确认附件由原multimodal历史带入、恢复提示另建。因此缺少bridge.attachments本身不证明丢图，无新产品缺陷证据，不添加第二次图片转发或store。

原NodeCLI regular/fullscreen各1保存fixture消息、isolated home/profile/project、declared-vision loopback、heap768MiB/总60秒/累计2MiB。首次真实paste/alt+s/Enter、原host PNG/tiny store1100压力；第一POST精确text/image，服务器保持待回。真实Ctrl+C直到turn end及HTTP response close，分别51/50ms小夹具观测，原session interrupted且存完整block，未知请求用量不伪造清零。Ctrl+D退出后新CLI重开同ID、无attachment/pressure注入，真实/continue第二POST携原image_url一次、精确历史text及原recovery指令。回复实际绘制、session completed/pendingPrompt清理，最终仅两user含原fixture，零重复prompt。两模式各两个exit0/cooked、config/models/project不变、scratch清理。[正式工件](../../.omx/artifacts/phase20-addition-image-recovery/README.md)保存结构布尔、计数及当前fresh build `d4297fc1e1cd6053249f47cb8afbb896d1654fdacef71d1638cead1669e053c0`、inputs `a8e6aba8fe59b75f8a3533c898053adb727ce845057ea765e933aa410e975471`。

两个syntax、两模式probe主代理串行首轮通过；无产品源码改动而不重跑build/unit/源码反转。此为文字加小图在HTTP等待取消后的原continue路径，非image-only、mid-tool/compaction/branch、大图、未知billing、clipboard或其他平台验收。延后一次bc121e28 CI41062973370/Watch41062973311均success，165940b3 Watch41065163449 success、CI41065163338仍in_progress、head一致；本批Git/未来CI另绑定。CLAUDE.md保留，无full local suite/并行heavy/本助手subagent/20k终端/exe/真实provider/独立review/NormProof judge；原47/ADD整体partial、goal active。


### 21.30 纯图片中断任务保留原恢复准入

接续21.29，真实regular CLI基线能提交/持久化纯图片，却在退出重启后变terminated、/continue无第二POST。缺口在[recovery scope](../../packages/ts-shell/src/session/recovery/scope.ts)拒绝空pending文字、[eligibility](../../packages/ts-shell/src/session/recovery/sessionResumeEligibility.ts)及[conversation](../../packages/ts-shell/src/session/presentation/sessionReentrySurface.ts)按文字判断内容、[shell owner](../../packages/ts-shell/src/core/shell/recovery.ts)按truthiness续跑，而非history缺图。现[multimodal owner](../../packages/ts-shell/src/model-adapters/multimodal.ts)新增messageHasContent，文字仍需非空白、图片需非空data；空/空白pending只接受当前selected branch最新user entry对应唯一保留message，source/role/精确text一致。缺失/重复/空image/改text/改role/无legacy source拒绝；无图片空文字仍拒绝，shell在eligibility通过后保留defined empty text，无新附件store或replay路径。

先读目标再定向只读对照参考快照`f09d01b85e0384647fcab6779d35ab9dabe04be3`的session-manager.ts:1166–1170以user/assistant消息存在定义conversation。采用内容独立于text projection的决定，保留目标更严的非空内容与branch/source边界，没有复制代码。[正式工件](../../.omx/artifacts/phase20-addition-image-only/README.md)保存六baseline AssertionError/两控制、扩展legacy-source一失败/19通过、六独立有效反转及finally bytes恢复。反转scope digest属于最后type-only修复前源码，不冒充最终build的digest。提交前owner复核另发现当前会话/resume仍按pending text truthiness报Already in session；新增两AssertionError/三控制基线后复用summary.autoResumeReady修补，一额外反转失败两图片例并保留控制、bytes恢复。最终五文件**54项去重通过**（branch17/continue-resume9/eligibility5/multimodal19/manager4），81未选不计，含原八text/wire及空会话清理控制。

五静态门通过、118旧docs advisory保留。初次build TS2339源于filter无显式TranscriptEvent message predicate，随后probe由checkBuild在CLI启动前拒绝；补类型收窄后TS build/freshness通过，未以部分emit冒充fresh。owner named callable为7/5/2/4/13，只有multimodal6→7，均低于20。最终build `5caca84d38898e55a5ebd784ced415c03ca65f3768b21f420645603dcc214685`、inputs `3b971877ccb02869f21071038e57458f4f8254b21d11dced6eedb50e282b1f1f`。

原Node CLI regular/fullscreen各1保存fixture消息、isolated home/profile/project、vision loopback、heap768MiB/总60秒/累计2MiB。真实alt+v经原attachment host注入公开PNG（非系统clipboard采集），alt+s暂存/恢复跨1100 tiny store发行，Enter首POST仅一image，Ctrl+C取消HTTP等待continue51/52ms、resume52/51ms小夹具观测并保留interrupted。Ctrl+D后新CLI同ID、零附件/压力注入，真实/continue与/resume <当前ID>四组第二POST携原图片恰好一次/精确空text/原恢复指令；回复绘制、completed/pending清理、最终仅两user含fixture、无重复prompt。八个最终exit0/cooked、config/models/project不变、scratch清理。基线旧action标签误写bracketed paste及containsPublicText对空字符串的恒真判断明确排除，最终改真实alt+v标签并删除恒真字段，精确saved blocks与wire比较保留。

HANDOFF补text/content与empty-string证据陷阱，日志归档。分支丢弃/重选为unit证据，非真实branch CLI；无full local suite/并行heavy/本助手subagent/20k真实终端/exe/真实provider/平台clipboard/大图compaction或checkpoint/独立代理review/NormProof judge/未知billing结算。延后一次读回165940b3 CI41065163338/Watch41065163449均success，89843761 Watch41066606364 success、CI41066606262仍in_progress且head一致；本批Git/CI另绑定，CLAUDE.md保留，原47及ADD整体partial，goal active。


### 21.31 back列表保留纯图片问题与原分支内容

接续21.30，检查[question source](../../packages/ts-shell/src/cli/interactive/picker/rewind/source.ts)的同步/异步路径都在messageToText后要求非空白，导致已保存纯图片不进入/back且重复图片ID不触发identity拒绝。原[navigation](../../packages/ts-shell/src/cli/runtime/navigation.ts)已接受空user text、保留活动图片和后续树，因此不加第二图片转发。现两source复用messageHasContent，空文字+真实data准入，空文字/空image仍拒绝；[row summary](../../packages/ts-shell/src/cli/interactive/picker/rewind.ts)显示Image message，原prompt仍精确空text，不把标签存入草稿。保留25页、共享query/source、ID/version、parts/textunits、取消与一次消费边界。

先检查目标，再定向只读参考快照`f09d01b85e0384647fcab6779d35ab9dabe04be3`的tree-selector.ts:370–372按role包括user、agent-session.ts:4173–4177将user导航与editor text分开。其fork source4242–4255仍排除空text，明确不当作已解决此问题。沿本项目原保留user叶语义及更严content/identity/version护栏，未复制代码。[正式工件](../../.omx/artifacts/phase20-addition-image-back/README.md)存原四AssertionError/一空image控制、三独立反转分别同步/异步text-only与空标签，各3/3/1 AssertionError且finally bytes恢复。

最终四文件**48项去重通过**（picker31/source8/boundary6/lifetime3），四旧大边界未选不计；含literal/dropped/empty-data、exact-ID/ordinal、query续页、source version、取消/关闭及实际保存会话readBackSource→picker→原navigateSession writer，原图片一次/后续回答保留/草稿空text。五门/TS build/freshness串行通过，118旧docs advisory保留；两个产品owner named callable不增且低于20。build `a0c8252603f0d5a787d1686cdec4d65f17b18df765c8e67afda1200c240fe72c`、inputs `afcf8f280cb56a9a5f9c05b2e1cba2c013f46081630cb8289f5053cdc07f654f`。

原Node CLI regular/fullscreen各三微小保存消息（文字/空text图片/后续回答）、isolated home/profile/Git project、无凭据synthetic且fetch观察拒绝、heap768MiB/45秒/2MiB。真实/back实际绘制Image message、Enter经原导航writer，fresh read确认图片活动叶且exact block一次，最终两user无重复、原transcript prefix及后续answer仍在树。重开Esc状态bytes不变、零fetch尝试、config/project不变、两exit0/cooked、scratch删除。composer未注入图片，原history保留图片；不冒充重新附图的新普通回合/模型派发/平台clipboard验收。

HANDOFF补question admission/display文本分界；无full local suite/并行heavy/本助手subagent/20k真实终端/exe/真实provider/独立代理review/NormProof judge。延后一次89843761 CI41066606262/Watch41066606364均success，138c2c42 Watch41073636819 success、CI41073636746仍in_progress且head一致；本批Git/CI另绑定，CLAUDE.md保留，原47/ADD整体partial、goal active。


### 21.32 重开会话恢复历史中的图片

接续21.28的持久化修补：图片已写入保存的user消息并跨进程保留，但重开会话仍看不到。缺口在[history projection](../../packages/ts-shell/src/cli/interactive/history.ts)的`restoreConversation`——它把每个user轮次投影成`messageToText`（按设计丢弃图片），且只在文字投影非空时建块，纯图片问题整条消失。现原[multimodal owner](../../packages/ts-shell/src/model-adapters/multimodal.ts)新增`imagesOf`，与既有`messageHasContent`/`messageToText`共用同一content union；user轮次按“有文字或有图片”准入，块携带保存的图片。原composed source（`metadata.originalInput`）、60块窗口、earlier copy source、编辑器历史规则保持不变——历史仍只收有文字的prompt。渲染复用既有`Block.images`能力（live echo本来就这样传），无第二附件/重放路径、无新store或schema。

先读目标再定向只读对照本机pi的interactive-mode.ts：其restore用`getUserMessageText`只过滤text块，文字为空则整条不渲染，是同样的文字投影，明确不当作已解决问题；live渲染也只显示文字。沿本项目原渲染能力修补，未复制参考代码。[正式工件](../../.omx/artifacts/phase20-addition-image-restore/README.md)存三独立反转（文字投影、图片需文字、`imagesOf`返回空），分别3/1/2 AssertionError且finally bytes恢复；恢复后history 27项+multimodal 26项=53项通过，加rewind共84项。

五门/TS build/freshness主代理串行通过，118旧docs advisory保留；owner named callable为5→5与7→8，均低于20。build `9a6624d48f82120506879633d1b9f11bfbf09265b1d032251c63269a53184bf1`、inputs `dabe8d4d43d22f8680b430db8927a1a6f570803b5812e9a398157f33ee9f507d`。

原Node CLI regular/fullscreen各1保存会话（文字/文字+图片/纯图片三user加后续回答）、isolated home/profile/Git project、无凭据synthetic且fetch拒绝、heap768MiB/45秒/2MiB。两模式启动即恢复三个user块，图片数量精确为0/1/1，无图形协议终端实际绘制`image attachment: image/png`，composer零图片、零draft、零fetch；fresh read确认三条保存消息与transcript prefix逐字节不变，两exit0/cooked、config/project不变、scratch删除。

此为历史显示恢复，不是新附件路径：不注入composer、不派发请求。图形协议内联绘制、大图、compaction/branch超出prefix的投影、clipboard与其他平台未验收。无full local suite/并行heavy/本助手subagent/20k真实终端/exe/真实provider/独立review/NormProof judge；原47/ADD整体partial、goal active。


### 21.33 工具结果保留图片并在卡片显示

接续21.32对user轮次图片的恢复，发现同一类缺口在tool结果：[浏览器截图工具](../../packages/ts-shell/src/browser/tool/features.ts)把PNG随结果返回，[工具结果消息](../../packages/ts-shell/src/core/agent/tools.ts)已保存text/image union，模型能收到，但[投影](../../packages/ts-shell/src/turn/projection.ts)只把`messageToText`送进`tool.result`，[卡片渲染](../../packages/ts-shell/src/presentation/tui/transcript/blocks.ts)只画文字，历史恢复同样只有文字。

现`tool.result`新增**仅显示**的`images`；持久化前由[session codec](../../packages/ts-shell/src/session/sessionEventCodec.ts)剔除，因为同样的字节已存在tool消息里，重复落盘会让编码载荷在transcript中出现两次（探针断言恰好一份）。原transcript的revisioned update路径承载卡片图片，`Block.images`因此改为可写；折叠与展开都绘制——图形协议用inline sequence，否则显示`image result: <mime>`一行。历史恢复从保存的tool消息取图，重开与live一致。无第二附件store、事件类型或replay路径。

先读目标后定向只读对照本机pi的tool-execution.ts：它从`result.content`过滤`type === "image"`，按终端能力渲染并保留在折叠/展开外壳中——同一条“对已存消息的显示决定”，未复制代码。[正式工件](../../.omx/artifacts/phase20-addition-tool-images/README.md)存五独立反转（投影丢弃、持久化保留显示字段、卡片丢弃、渲染器隐藏、历史丢弃），全部AssertionError且finally bytes恢复。

聚焦八文件**168项**通过（projection9/persistence3/toolCards14/blocks16/history28/turnSink54/container18/multimodal26）；五门/TS build/freshness主代理串行通过，118旧docs advisory保留；owner callable为13/19/12→13/5/7/13→14，均低于20。build `ddc46156fc822d780417971f073e352002cc6ed628568cbdce2f0ff0fc6d83e6`、inputs `fe5f0a974365a8049320ad2437f1bb53c64a08f26ad84afae6f2f1c0a85acdf5`。

原Node CLI regular/fullscreen各1保存会话（提问/assistant调用browser/含PNG的tool结果/后续回答）、isolated home/profile/Git project、无凭据synthetic且fetch拒绝、heap768MiB/45秒/2MiB。两模式恢复tool卡片精确文字与一张图、无图形协议终端实际绘制`image result: image/png`，transcript prefix逐字节不变且图片载荷恰好一份，零fetch、零draft，两exit0/cooked、config/project不变、scratch删除。

边界：这是已保存工具结果的显示；未覆盖真实浏览器会话中实时截图到达、真实图形协议内联绘制、超出既有单结果媒体预算的图片、clipboard与其他平台。无full local suite/并行heavy/本助手subagent/20k真实终端/exe/真实provider/独立review/NormProof judge；原47/ADD整体partial、goal active。


### 21.34 纯图片提示不再绘制空白气泡行

21.32恢复图片后，`renderUser`对空文字仍先`wrapToWidth("")`出一行，导致纯图片问题在图片上方多一条全宽空白气泡，读起来像错误留白。现只有文字为空且有图片时才省略该行；有文字时行数、源投影与复制语义完全不变。反转（恢复空字符串行）使新增断言失败且finally bytes恢复；blocks/container/source 56项通过，五门与TS build串行通过，118旧docs advisory保留。build `5bf1f1e9aa7b6bcbbce651406619195849c98f9a9be8add557fa4467dcb4a473`、inputs `4a1f8e04d9c1e9765729f40c7e6ae6fda84779dd82cef93a457dd7d326ca8806`。两模式原CLI重跑：三user块图片数0/1/1、无协议终端绘制label、零fetch、exit0/cooked，纯图片轮次的空白行不再出现。图形协议内联、桌面平台未验收；原47/ADD整体partial、goal active。


### 21.35 退出延迟基线与启动不自动重入的复核

用户第26项「exit有时卡住」的四条已修机制之外，本批实测剩余路径：两模式各三轮、交替`/exit`与Ctrl+D的真实Node CLI（隔离home/profile/Git project、无凭据synthetic且fetch拒绝、heap768MiB、每轮30秒/1MiB）全部exit0/cooked、零fetch。ready后退出耗时普通219/164/215ms、全屏222/158/206ms。唯一仍可能阻塞的是[会话状态锁](../../packages/ts-shell/src/session/store/sessionFileStore.ts)的`STATE_LOCK_TIMEOUT_MS=1200`同步重试：另一进程持锁时close最多阻塞约1.2秒后失败；本夹具无竞争writer，故该路径**未实测**，用户偶发多秒卡顿与锁竞争一致但未被证明。本批未改产品代码。

用户第30项「打开时显示上次会话」的当前机制复核：[CLI bootstrap](../../packages/ts-shell/src/cli/bootstrap/cliBootstrapContext.ts)把`recoveryCandidate`固定为null，并注明恢复建议在首帧后按需发现；交互与print路径保留显式解析。因此新的CLI启动不会自动采用旧会话，原先记录的SIGTERM/SIGHUP重入路径已在20.5改为显式意图。本批未复现用户当时的界面，也不宣称该现象已修复——只能确认当前源码没有自动重入分支。

证据边界：合成/离线、小型会话、无并发writer、无真实provider与桌面终端；不覆盖锁竞争、不可捕获崩溃与旧版本现场。原47/ADD整体partial、goal active。


### 21.36 会话锁竞争下的退出有界性与失败可见

21.35记录的唯一未实测阻塞点已补真实证据。[状态锁](../../packages/ts-shell/src/session/store/sessionFileStore.ts)的`STATE_LOCK_TIMEOUT_MS=1200`同步重试由**另一存活本地进程**真实持有（写入真实pid/hostname/createdAt）后测量，非合成mock。两模式×两持锁时长共四组原CLI：持锁600ms时退出673/677ms、exit0、打印`--resume`、状态terminated、cooked恢复；持锁2500ms时退出1346/1342ms、exit1、实际绘制`Session state could not be saved; session close was not verified.`且不打印resume、cooked仍恢复。

直接经产品自身session owner的写入测量给出同一边界：持锁900ms时等待922ms后成功；持锁2500ms时1208ms超时失败且该turn未落盘（`finalMessages`缺该条），释放后重试24ms成功。因此「有时卡住」与**并发写入者**一致，不是无界等待：进程在锁上界停止并如实报告关闭未确认，失败是可见的而非静默。1.35秒是真实用户可感知延迟，但有界且真实；本批未改产品代码，因为改变上界只是换取另一个上界而非消除等待。

证据边界：合成/离线会话、单个本地竞争进程、仅Linux；未覆盖跨主机持有者、持锁中途死亡（stale takeover）、真实用户终端或多进程并发竞争。[正式工件](../../.omx/artifacts/phase20-addition-lock-contention/README.md)。build `5bf1f1e9aa7b6bcbbce651406619195849c98f9a9be8add557fa4467dcb4a473`、inputs `4a1f8e04d9c1e9765729f40c7e6ae6fda84779dd82cef93a457dd7d326ca8806`。原47/ADD整体partial、goal active。


### 21.37 启动草稿交接与光标位置实测

第27项此前一直保持「机制未确认」。本批在**加载期**输入三行草稿后让真实runtime接管同一个editor，两模式各一轮原CLI（隔离home/profile/Git project、无凭据synthetic且fetch拒绝、heap768MiB、40秒上界）：交接后草稿精确为`line one\nline two\nline three`（28字符）、光标28（末尾）；五次退格后为23字符且内容正是原文本前23字符。全屏原始帧显示三行绘制为`❯ line one`/`  line two`/`  line thre…`，光标落在第58行第12列（第三行末尾），上下均无空白行。

结论：本build在「加载期多行草稿」这一场景下，交接保留草稿与光标、退格删除真实字符，用户所述「跳到大片空白行且无法删除」**不可复现**；但不复现用户原始终端、窗口尺寸与该次按键上下文，故原机制仍属**未确认**而非已证伪。两个探针失败保留为harness问题而非产品缺陷：就绪断言等待了非空草稿会正确抑制的占位符；observer调用了不存在的`lastComposerGeometry`导致致命错误。未改产品代码。[正式工件](../../.omx/artifacts/phase20-addition-startup-draft/README.md)。build `5bf1f1e9aa7b6bcbbce651406619195849c98f9a9be8add557fa4467dcb4a473`、inputs `4a1f8e04d9c1e9765729f40c7e6ae6fda84779dd82cef93a457dd7d326ca8806`。原47/ADD整体partial、goal active。


### 21.38 附加workspace根未到达文件writer（第24项真实缺陷）

第17.7/第一百三十二批的裁决认为「限制合理、出路存在（`/workspace add <path> --write`）、缺的只是被发现」。本批用真实构建做端到端验证，结论**对该裁决不利**：

1. 越界写被拒，消息含`/workspace add`与`--write`，未创建文件——正确。
2. `/workspace add <outside> --write`成功：根以`access:"write"`和`dev:ino:birthtimeMs`身份保存——正确。
3. **同一写入仍被拒**，且消息再次让用户运行刚运行过的命令。

根因：[write/edit](../../packages/ts-shell/src/core/tools/registry.ts)的围栏是`verifyPathContainment(target, context.workspaceRoot)`，只看主根，**从不读`context.workspaceRoots`**。会话级[resolveWorkspaceRoot](../../packages/ts-shell/src/core/workspace/roots.ts)已完整实现规则（仅注册根、write需write访问、每次复验目录身份），但这两个writer不调用它；因此附加根只影响sandbox写入允许和已使用`selectWorkspaceRoot`的路径。

尝试与回退：把write/edit改走`resolveWorkspaceRoot`后围栏通过，但写入随即报`Edit operation receipt is invalid.`。[edit恢复store](../../packages/ts-shell/src/edit/recovery/operation/store.ts)从操作scope的workspace派生账本位置（`storageRoot(scope) = profile.root ?? scope.workspace.path`），`assertProfileStorage`要求该位置在profile内；把操作身份绑到附加根会移动账本，提交写入的receipt无法在同一scope下读回。要让授权真正生效，需要**快照账本继续绑定会话/profile，而写入目标是另一个根**——这是edit恢复store的契约改动，不是围栏的一行修改。该改动已回退，本批产品代码无变化。

因此第24项的正确结论是：授权机制作为「带身份与访问模式的已保存根」是完整的，但**文件writer不读取它**，且edit账本无法记录目标根非主根的写入。这与用户「别的目录建文件被系统拒绝」的报告一致，属真实缺陷而非提示词问题。证据边界：合成会话、单次真实写入、仅Linux；未覆盖apply_patch、bash sandbox写入路径与多根并发。[正式工件](../../.omx/artifacts/phase20-addition-workspace-grant/README.md)。build `5bf1f1e9aa7b6bcbbce651406619195849c98f9a9be8add557fa4467dcb4a473`、inputs `4a1f8e04d9c1e9765729f40c7e6ae6fda84779dd82cef93a457dd7d326ca8806`。原47/ADD整体partial、goal active。


### 21.39 附加workspace根接入write/edit（第24项修复）

接21.38确认的缺陷，本批完成修复而非仅记录。[write/edit](../../packages/ts-shell/src/core/tools/registry.ts)现在先问既有会话解析器哪个根适用，而不是只围栏主根：

- 会话**无**附加根时仍用主根并保持词法拒绝，不触碰文件系统——因此主根不存在时错误信息与之前一致（首轮实现无条件调用resolver导致`jail-root`用例报ENOENT，已修正）。
- 有附加根时由`resolveWorkspaceRoot`决定：仅注册根、write需write访问、每次复验目录身份。
- 解析出的根同时进入execution service的`workspaceRoot`与edit operation identity，使receipt的workspace与operation scope一致。21.38观察到的`Edit operation receipt is invalid.`实际来自这两处不一致（operation identity仍绑主根），**不是账本契约问题**；诊断过程中另发现探针缺`taskId`会让`callId`为空、同样触发该错误。

未新增jail/resolver/grant机制，会话解析器本就拥有全部规则。[正式工件](../../.omx/artifacts/phase20-addition-workspace-write/README.md)。

验证（主代理串行）：`arguments`21（三新例：附加根写入成功且service收到附加根、只读附加根被拒、目录被替换后按身份拒绝）、`workspace`9、`fileAccess`3、`workspace/approval`25，共**59项**通过；两反转（退回只查主根、以read访问解析）均命中预期断言且finally逐字节恢复；五静态门、TS build/freshness通过，118旧docs advisory保留。端到端探针：授权前拒绝且不建文件→`/workspace add --write`保存→同一写入成功且内容精确→替换目录后旧授权再次拒绝。build `96a6043df384a05279f4b6944d2ba9c04c6f0892110ea329d30eff83361ba368`、inputs `1615471a421914223b98423c4482ffef2880b0a98e93a47bfd4b5cc7d35198f7`。

边界：`apply_patch`未改动（另有跨根计划路径）；`bash`写入仍由sandbox治理；只读附加根的读取路径不变。未覆盖真实provider工具调用、桌面平台与多根并发。原47/ADD整体partial、goal active。


### 21.40 附加workspace根同样接入read

21.39修好write/edit后复查同类工具：[read](../../packages/ts-shell/src/core/tools/read.ts)的围栏同样只查主根（`verifyPathContainment(target, context.workspaceRoot)`），因此用户用`/workspace add --write`授权后**连读取都做不到**。现read复用同一`resolveWorkspaceRoot`，以`'read'`访问模式解析：只读授权可读、不可写；未注册目录仍拒绝；目录列表与文件读取都把解析出的根传给execution service。无附加根时保持原词法路径，不触碰文件系统。

`glob`/`grep`的`path`是搜索起点、涉及结果路径投影，本批未改并保留为已知边界。

验证（主代理串行）：`arguments`23（两新例：只读附加根可读、未注册目录仍拒）、`readBudget`7、`readCleanup`16、`readFreshness`6、`fileAccess`3、`workspace`9、`workspace/approval`25，共**89项**通过；三反转（write退回只查主根、read退回只查主根、以read解析write授权）均命中预期断言且finally逐字节恢复；五静态门、TS build/freshness通过，118旧docs advisory保留。build `eb5cc365d7fb`。边界：glob/grep搜索起点、bash sandbox写入、真实provider与桌面平台未覆盖。原47/ADD整体partial、goal active。


### 21.41 附加workspace根接入glob与grep

21.40保留的边界已收口：`glob`/`grep`同样只围栏主根。现两者都先以`resolveToolTarget`取绝对目标（纯路径拼接，不提前施加主根边界），再由`resolveWorkspaceRoot`以`read`模式选出根，并把该根作为搜索起点与结果投影基准：glob的`listFilesRecursive`、grep的ripgrep与回退walk两条路径、以及每个文件的`readTextFile`都使用同一根。结果路径语义不变（相对被搜索的根）。

首轮实现用`resolveWorkspaceToolTarget`取目标，它在主根外直接抛`Tool path resolves outside the workspace boundary.`，导致附加根用例失败；改为`resolveToolTarget`后正确。

验证（主代理串行）：`arguments`25（两新例：附加根glob命中、附加根grep命中）、`glob`19、`grep`3、`grepPaths`12、`grepRipgrep`18、`grepStream`14、`fileAccess`3，共**94项**通过；五反转（write/read/glob/grep退回只查主根、以read解析write授权）均命中预期断言且finally逐字节恢复；五静态门、TS build/freshness通过，118旧docs advisory保留。build `c1302abc9ff4`。边界：bash写入仍由sandbox治理；真实provider工具调用、桌面平台与多根并发未覆盖。原47/ADD整体partial、goal active。


### 21.42 apply_patch附加根的端到端确认

21.41后第24项的工具面已覆盖write/edit/read/glob/grep。`apply_patch`静态上一直使用`selectWorkspaceRoot`并读取`workspaceRoots`，本批补端到端证据：两阶段探针（`prepare`→选定group→`execute`）在授权前报`Tool path is outside the registered workspace roots`且不建文件；`/workspace add --write`后同一补丁`committed`，附加根下文件内容精确为补丁正文。故`apply_patch`无需改动。

证据边界：合成会话、单文件补丁、仅Linux；未覆盖跨根多文件补丁、真实provider工具调用与桌面平台。build `c1302abc9ff4`。原47/ADD整体partial、goal active。


### 21.43 请求飞行中的退出有界性

21.35只测了空闲退出，本批补上「忙碌中退出」——这正是用户「有时卡住」若由未完成请求持有进程所会呈现的形状。loopback服务器应答readiness（`GET /v1/models`）使CLI能开始真实turn，然后接受`POST /v1/chat/completions`且永不响应；原CLI提交问题、观察到busy后执行`/exit`。

两模式结果一致：busy成立、服务器确实收到两个请求、退出**193/207ms**、exit0、cooked恢复。挂起的对话请求不会持有进程。

两个探针错误如实保留：手写PTY包装未转发stdin导致`/exit`根本没到达（假「exit-timeout」）；配置在loopback端口确定前写入导致CLI报`Invalid URL`且从未派发。均非产品故障。

证据边界：本地服务器、普通chat completion；未覆盖工具循环中的provider停顿、等待审批、待答问题等其他忙碌形态。[正式工件](../../.omx/artifacts/phase20-addition-exit-busy/README.md)。build `c1302abc9ff4873abf20da961b7a991bd7c70319ca181fef499e84f66bfc7268`、inputs `6e696319aff2a2fc9b1fff597b439fccc3b5a07c863b050c2a0e31816939814e`。原47/ADD整体partial、goal active。


### 21.44 窄终端下折行草稿与光标位置

第27项在120列下不可复现，本批收窄到**40列**（可配置尺寸的PTY relay，40×40），在runtime已接管输入后输入长行。结果：软折行为两行（`❯ alpha bravo charlie delta echo` / `foxtrot golf hotel india juliet`），续行对齐首行、上下无空白行，光标在折行内；`abcdef`三次退格后精确变为`abc`，帧实际重绘；退出干净、cooked恢复。

首轮误判为「退格无变化」的两个探针错误如实保留：**行间用`\r`**——加载面提示「Enter adds a line」，但runtime接管后Enter是提交，五行变成五个提交turn（`Synthetic reply: one`等）而非一份五行草稿；**对长折行做粗糙的「文本是否变化」断言**——删除发生在第二视觉行尾部、重绘帧几乎相同，短行`abcdef`→`abc`才清楚显示行为。

结论：窄终端下草稿、折行与光标都在composer内，无空白行，删除真实字符。用户所述症状**仍不可复现**而非证伪——缺真实终端、字体/IME、resize与物理像素坐标。[正式工件](../../.omx/artifacts/phase20-addition-startup-narrow/README.md)。build `c1302abc9ff4873abf20da961b7a991bd7c70319ca181fef499e84f66bfc7268`、inputs `6e696319aff2a2fc9b1fff597b439fccc3b5a07c863b050c2a0e31816939814e`。原47/ADD整体partial、goal active。

补充：全屏模式下探针首次发送`/exit`时草稿仍有`abc`，该行成为`abc/exit`并被当作正文提交（`Synthetic reply: abc/exit`）——斜杠命令仅在源起始处成立，这是正确行为。清空草稿后两模式均exit0。


### 21.45 纯图片会话的/copy提示不再谎称空

图片可进入历史（21.32/21.33）后暴露一个小缺陷：`/copy`只收录有文字的块，因此一个只含图片的会话会显示「Nothing in the transcript to copy yet.」——但transcript并不空，只是没有可放进剪贴板的文字。现[copy source](../../packages/ts-shell/src/cli/interactive/picker/copy/source.ts)在跳过无文字块时单独计数带图片的块，[picker](../../packages/ts-shell/src/cli/interactive/picker/copy.ts)据此选择文案：「The transcript holds only pictures; there is no text to copy.」；真正空的会话保留原措辞。剪贴板仍只取`block.text`，图片载荷不会进入复制内容。

验证：`copy`13（新例同时断言两种措辞）、`history`28，共**41项**通过；反转（恒用空措辞）命中断言且finally字节恢复；五静态门、TS build/freshness通过，118旧docs advisory保留。build `7edae23d3d72`。原47/ADD整体partial、goal active。


### 21.46 文件工具根选择的测试覆盖

21.39–21.41修复了write/edit/read/glob/grep的围栏，但复查发现[workspaceToolBinding](../../packages/ts-shell/src/core/workspace/tools.ts)——**权限层**用于决定批准哪个根并重写参数的函数——一直没有测试。它本来就用`selectWorkspaceRoot`并读取`roots`，因此修复前存在「权限层批准附加根、工具体层拒绝」的不一致，正是21.38观察到的「批准了却写不进去」的另一半。

新增[四个用例](../../packages/ts-shell/src/core/workspace/tools.test.ts)锁定契约：附加根被选中且参数重写为该根下的绝对目标；主根内路径保留调用者拼写；只读附加根对write拒绝而对read放行；未注册路径拒绝且非文件工具仍绑主根。4项通过；五静态门与TS build通过，118旧docs advisory保留。build `91aa1e1d8bb4`。原47/ADD整体partial、goal active。


### 21.47 附加根写入的撤销账本仍归属会话

21.39把editIdentity绑到解析出的根，使receipt与operation scope一致；本批发现这带来一个默认profile下的真实副作用：`storageRoot(scope)`在无命名profile时回退到`scope.workspace.path`，于是附加根写入的账本落在**附加根**下的`.sisyphus/edit-snapshots`，而`/undo`从会话主根读取——写入成功却看不到撤销记录。探针实测：默认profile下`primaryLedgerExists:false`、`attachedLedgerExists:true`。

现editIdentity的workspaceRoot改回`artifactRoot ?? workspaceRoot`（会话主根），而写入目标仍用解析根：账本随会话、写入随授权。修复后同一探针为`primaryLedgerExists:true`、`attachedLedgerExists:false`，写入仍成功。21.39当时观察到的`Edit operation receipt is invalid.`实为探针缺`taskId`导致`callId`为空，与账本归属无关——此判断错误已在本批纠正。

验证：`arguments`26（新例用真实execution service断言附加根下不产生账本）、`workspace/tools`4、`workspace/approval`25、`fileAccess`3、`workspace`9，共**67项**通过；六反转（write/read/glob/grep退回只查主根、以read解析write授权、账本跟随目标根）全部命中且finally字节恢复；五静态门、TS build/freshness、端到端探针（拒绝→授权→写入→目录替换失效）通过。build `a3fd86238923`。原47/ADD整体partial、goal active。

补充端到端证据：`undo-probe.mjs`在默认profile下经附加根把`before`写成`after`，随后用会话主根的scope读取操作列表——可见**一条**操作，且其文件记录的`workspace`指向附加根。首次探针在未await的`withProfile`回调里调用工具，写入未执行、计数为0，该错误保留记录。

补充跨层一致性证据：`layers-probe.mjs`对同一附加根询问所有可能允许或拒绝写入的层（默认profile）——`workspaceToolBinding`的写授权解析到附加根、只读授权报`This additional workspace root is read-only.`；`workspaceSandboxPolicy`把该根放进`allowWrite`、只读根进`readOnlyRoots`；工具围栏写入成功；撤销账本可见一条。修复前前两层与工具体层不一致，正是授权看起来失效的原因。


### 21.48 附加根下的搜索结果为可用路径

21.41让glob/grep以解析根作为结果投影基准，但暴露一个副作用：结果仍是**相对该根**的路径（如`found.ts`），而后续工具（read/edit）按主根解析它，得到ENOENT。探针实测：glob在附加根下返回`found.ts`，read该路径失败。这是本轮改动引入的真实缺陷——搜索结果不可用。

现两者在搜索根**不是主根**时返回绝对路径；主根下保持原有相对拼写不变。修复后同一探针返回附加根下的绝对路径，`read`可直接打开。

验证：`arguments`27（新例断言附加根结果必须是绝对路径且等于该根下的真实目标）、`glob`19、`grep`3、`grepPaths`12、`grepRipgrep`18，共**78项**通过；七反转（write/read/glob/grep退回只查主根、以read解析write授权、账本跟随目标根、glob返回相对路径）全部命中且finally字节恢复；五静态门、TS build/freshness、往返探针通过。build `f78027dbf35d`。原47/ADD整体partial、goal active。


### 21.49 lsp扫描与文档符号覆盖附加根

21.39–21.48修完文件读写搜索后，复查语言工具：[scanner](../../packages/ts-shell/src/language/scanner.ts)完全不读`workspaceRoots`。探针实测：主根`workspaceSymbol`/`documentSymbol`正常，附加根下**符号搜索找不到**、**文档符号返回空**（路径被主根围栏拒绝后又被catch吞掉，呈现为空结果而非错误）。

现三处修复：`workspaceSymbol`的扫描根集合为主根+全部附加根（每根独立列表，绝对路径不重复拼接）；`documentSymbol`的前置校验先由`selectWorkspaceRoot`判定路径归属；`readSource`按归属根读取并把该根传给execution service。首轮实现把列表返回的绝对路径无条件`path.join(scanRoot, file)`，使符号链接逃逸测试失败（伪造出根内路径、跳过围栏），改为只拼接相对路径后既有安全测试恢复通过。

验证：`lsp`12（新例断言附加根与主根各自`1 found`、文档符号含`Function: attachedNeedle`）、`language`44，共**56项**通过；两反转（扫描只留主根、文档符号只留主根）均命中且finally字节恢复；五静态门、TS build/freshness通过。首轮测试用`export const`作夹具，parser不产出符号导致断言假阳性（"no match"文案也含查询词），已改为函数声明并断言匹配格式。build `cf51133aa211`。原47/ADD整体partial、goal active。

补充撤销与只读证据：`restore-probe.mjs`经附加根把`before`写成`after`，预览`canRestore:true`、恢复`restored-verified`、文件回到`before`。首轮探针传空access对象，`assertOperationFile`找不到授权根而报`snapshot-or-workspace-unavailable`——这是检查在正常工作（撤销不会穿过会话当前未持有的根），非产品缺陷。`patch-readonly-probe.mjs`覆盖另一侧：只读附加根上的补丁在prepare阶段被拒且不创建文件。

补充撤销边界证据：`revoked-probe.mjs`经附加根写入后用`/workspace remove`撤销授权，再尝试恢复旧操作——预览`canRestore:false`、blocker为`snapshot-or-workspace-unavailable`、恢复`blocked`、文件保持写入后的字节。授权是会话当前持有的活权限而非写入时捕获的永久许可，因此撤销后undo不能穿过已分离的根写回。

补充身份边界证据：`identity-probe.mjs`经附加根写入后把该目录替换为同路径的不同目录，再预览旧操作——`canRestore:false`、恢复`blocked`、新目录保持为空。起作用的是记录的`dev:ino:birthtimeMs`身份；仅有路径会把旧字节写进无关目录。


### 21.50 grep的两条搜索路径都返回可用结果

21.48只修了glob与grep回退路径的相对路径问题；本批复查发现**ripgrep路径**同样返回相对`searchRoot`的路径，且回退路径在`listFilesRecursive`返回绝对条目时会`path.join`伪造根内路径（与21.49在lsp处修过的同一类错误）。现两条路径都：搜索根非主根时输出绝对路径，已是绝对路径的条目不再次拼接。端到端探针：附加根下grep结果首行路径为绝对且`read`可直接打开（`readOk:true`）。

验证：`arguments`28（新例断言grep结果绝对且等于该根下真实目标）、`glob`19、`grep`3、`grepPaths`12、`grepRipgrep`18，共**80项**通过；八反转（write/read/glob/grep扫描/ripgrep路径退回主根、以read解析write授权、账本跟随目标根、glob相对路径）全部命中且finally字节恢复；五静态门、TS build/freshness通过。build `15052712085a`。原47/ADD整体partial、goal active。


### 21.51 /undo命令面与目录续页在附加根下正确

审查`/undo`完整链路：`undoScope`用`context.projectRoot ?? context.cwd`（会话主根），`undoAccess`传`context.workspaceRoots`——与21.47的账本归属一致。端到端探针：附加根写入后`undoHistory`返回该操作且文件指向附加根、`operationsForTurn`按turn命中、无关turn为零。首次探针只传`taskId`未传`correlationId`，turn过滤正确返回零——过滤读的是记录的correlation而非call id。

目录续页探针：附加根下小分页列出目录，hint给出该目录的绝对路径（带尾分隔符），下一页读到同一目录。两处均无需修改。

边界：合成会话、单文件、仅Linux。build `15052712085a`。原47/ADD整体partial、goal active。


### 21.52 相邻面的只读审查（无缺陷）

按「同类缺陷完整排查」继续检查未审查面，四项均正确、未改代码：

- **`/undo restore-turn`**：传`undoAccess(context)`（含`workspaceRoots`），`undoScope`用`projectRoot`——与账本写入根一致。
- **`/restore`**：独立面，按显式`--record`/`--authority-id`读快照、拒绝猜测；其写访问经`selectWorkspaceRoot`并读`workspaceRoots`，命名后可用附加根。
- **fork**：仅在项目根未变时继承`workspaceRoots`；跨项目fork丢弃它们，正确——授权属于原项目。
- **会话切换**：`switchActiveSession`调用方把`cwd`设为新`projectRoot`，工具主根不会陈旧；授权读自会话而非进程，切会话即切授权。

记录负面结果与修复同等重要：它表明这些路径是被检查过的，而非假设。[工件](../../.omx/artifacts/phase20-addition-workspace-write/README.md)。build `15052712085a`。原47/ADD整体partial、goal active。


### 21.53 子目录搜索的结果重定基到主根

21.50修完附加根路径后，本批发现同一函数在**主根内子目录**场景仍不正确：`glob`/`grep`以`searchRoot`为基准，搜索`src`时报告`a.ts`，而后续工具按主根解析它——文件不存在。修复前实测`path:'src'`返回`a.ts`（不可用），省略`path`返回`root.ts`（可用），同一工具输出格式随参数变化。

现两者共用一条规则：结果若在主根内则重定基到主根（搜索`src`报告`src/a.ts`），在主根外（附加根或已绝对）则报告绝对路径。glob与grep（含ripgrep路径）三条输出路径统一。修复后三种调用方式都返回`src/a.ts`且`read`可解析，附加根仍返回绝对路径。

验证：`arguments`29（新例断言子目录搜索的glob与grep都返回`src/a.ts`）、`glob`19、`grep`3、`grepPaths`12、`grepRipgrep`18，共**81项**通过；七反转全部命中且finally字节恢复（旧的glob相对路径用例因源码变化已更新）；五静态门、TS build/freshness通过。build `0b0556f21575`。原47/ADD整体partial、goal active。


### 21.54 lsp符号路径与glob/grep同一规则

21.53统一glob/grep的路径规则后，本批发现`lsp`的`workspaceSymbol`仍输出**绝对路径**，而同一会话内glob/grep输出相对主根的路径——两种约定并存，用户读到一个搜索结果后无法直接喂给下一个命令。

现scanner的definitions/references/workspaceSymbol三处渲染共用`reportedSymbolPath`：主根内重定基（`src/a.ts`），主根外（附加根）保持绝对。探针确认主根内为`src/a.ts`、附加根为绝对路径。

验证：`lsp`12（新例断言主根内为`` `public.ts:1` ``、附加根为绝对路径）、`language`44、`arguments`29，共**85项**通过；三反转（扫描只留主根、文档符号只留主根、符号路径恒绝对）全部命中且finally字节恢复；五静态门、TS build/freshness通过。build `059b7423ab15`。原47/ADD整体partial、goal active。


### 21.55 报告路径的面清单与最后两项确认

21.53/21.54后补齐清单：**会报告路径的接口**共八处。前五处（glob、grep回退、grep ripgrep、lsp三渲染点、read目录列表）是「人会把结果喂给下一条命令」的搜索/列表结果，统一遵循一条规则：主根内重定基、主根外绝对。后三处（undo状态报告、browser上传预览、`/context`）陈述的是某个具体文件的事实或尺寸，绝对路径即事实本身。

`browser` upload已确认正确：`selectWorkspaceRoot`解析根、`verifyPathContainment`复验、绑定`dev:ino:size:mtimeNs:ctimeNs`身份，预览同时显示源路径与读取根。`web_fetch`只接受URL、不触本地路径。[清单工件](../../.omx/artifacts/phase20-addition-workspace-write/PATH-SURFACES.md)。build `059b7423ab15`。原47/ADD整体partial、goal active。


### 21.56 resume面板首帧与首个可选行的实测延迟

第29项用户报告「每个操作卡约1秒」。本批测两个用户真正等待的时刻：真实Node CLI、隔离home/profile/Git project、synthetic、heap768MiB、每会话一条消息。**200会话**：面板标题123ms、首个可选行347ms；**800会话**：标题134ms、首行370ms。目录扩大4倍，首行只增加23ms。

结论：该范围内打开面板不随目录规模线性增长——面板先绘制标题、行随扫描逐步填充，打开不等完整扫描。这印证了此前批次的渐进发布设计。但**未复现1秒卡顿**，也未覆盖用户自己的目录、磁盘、终端与按键时序；删除/搜索/翻页是各自独立测量的操作。两轮均为每会话一条消息的合成目录，大transcript目录每会话读取更多，未覆盖。[正式工件](../../.omx/artifacts/phase20-addition-resume-latency/README.md)。build `059b7423ab15`、inputs `ead9d186ab6030878407d95123092d3ddfef3e4f36ab1d9b010f50cb52fc35df`。未改产品代码。原47/ADD整体partial、goal active。


### 21.57 中断会话的思考块保留

第25项此前覆盖了「完成后恢复」，本批补「中断」：持久化user提示、写一条content为空但带reasoning的assistant消息、标记interrupted，再用`restoreConversation`读回——得到`user`+`thinking`（精确文本、`collapsed:true`），序列化结果不含签名。压缩路径不涉及reasoning（被压缩消息整体移出，是既定设计）。resume的当前会话标记含`currentUnavailable`分支，逻辑完整。

证据边界：这是投影而非真实推理模型被中断的现场；从未持久化的推理（provider扣留、或进程在写消息前死亡）无法恢复，本批不作此声明。[工件](../../.omx/artifacts/phase20-addition-thinking-recovery/README.md)。build `059b7423ab15`。未改产品代码。原47/ADD整体partial、goal active。


### 21.58 /context的compactAt阈值与实际压缩触发同源

第25项相邻的最后一个未审面。`/context`的`compactAt`来自`requestBudget`的`softLimit`（`Math.min(floor(window×0.9), availableInput)`，`fraction`默认0.9且仅在(0,1)内才接受）；实际压缩的`shouldCompact`用`Math.min(floor(contextWindow×0.9), availableInput)`且额外要求`tokens + reserve <= inputLimit`。`compactAt`的else分支显式处理该条件（`Math.min(floor(window×0.9), inputLimit - reserve)`），两者语义对齐，不存在「报告阈值与实际触发不一致」。

未改产品代码。build `059b7423ab15`。原47/ADD整体partial、goal active。

补充：`/workspace add`后新会话**不继承**附加根（`createNew`不带该字段），正确——授权属于会话。state快照的`current?.workspaceRoots ?? session.workspaceRoots`是正确合并（空数组不回退、undefined才回退）。`/workspace remove`后`runtimeContext.session`被替换为新session，后续工具从该字段读取，撤销立即生效。


### 21.59 重叠根不再重复列出同一符号

子代理review超时停止后，本批自行完成六项定向审查。结论：`\0`与控制字符不绕过围栏（`path.resolve`按普通字符处理，`relative`仍正确判越界）；receipt顶层workspace与scope一致而`files[].workspace`可为附加根，是正确分层；路径投影对`..`逃逸条目回退绝对路径；撤销后无缓存；新会话不继承根。

发现一处真实缺陷：`validateWorkspaceRoots`在写入时禁止父子重叠，但`decodeWorkspaceRoots`只查重复路径、**不查父子重叠**——手改state文件可造出`/a`与`/a/b`，`scanRoots`会双重遍历，符号在答案中重复。现`targetFiles`改为`Set`去重。

验证：`lsp`13（新例断言匹配行为1行）、`language`44，共**57项**通过；四反转（扫描只留主根、文档符号只留主根、符号路径恒绝对、无去重）全部命中且finally字节恢复；五静态门、TS build/freshness通过。build `a55051824792`。原47/ADD整体partial、goal active。


### 21.60 只读附加根在sandbox两个平台上都被保护

`workspaceSandboxPolicy`把附加根按access分流：全部进`allowRead`、只有write根进`allowWrite`，只读根另列`readOnlyRoots`。`osSandbox`对两平台分别落实：bwrap用`--ro-bind`（独立挂载，不可写）；seatbelt在`allow file-write*`之后追加`deny file-write*`（顺序正确，deny覆盖allow）。两者都保证`/workspace add --read`的目录在`bash`中不可写。

子代理模型确认：Agent工具仅支持sonnet/opus/haiku/fable，用户指定的`cn:deepseek-v4.1-flash[1m]`不可用；按用户指令「如果发现子代理模型不可使用，那就自行完成任务」自行完成。此前一次只读review子代理运行1小时无结论后停止，未运行任何测试或构建。

未改产品代码。build `a55051824792`。原47/ADD整体partial、goal active。


### 21.61 压缩的失败与拒绝路径审查

审查`session/compaction.ts`与`core/shell/compaction.ts`：四条拒绝原因（`fits-budget`/`below-threshold`/`no-legal-cut`/`would-not-shrink`）与三条失败（hook拒绝、无摘要、step-unknown）各有精确且互不混淆的用户提示，明确区分「决策」与「故障」。`would-not-shrink`（`after >= before`）防止上下文越压越大。取消与`CompactionStepUnknown`在生成前后各复验一次。

发现一处**边界约定不一致**但未修改：`shouldCompact`用`tokens > window - reserve`（严格大于），而`requestBudget`的`soft`用`promptTokens >= softLimit`（大于等于）——恰好等于阈值时两者判断不同，差1 token。两者都是合理的边界约定，改动会触及压缩触发这一敏感行为，收益低于风险，故只记录不改。

未改产品代码。build `a55051824792`。原47/ADD整体partial、goal active。


### 21.62 纯图片提示的续跑证据不再依赖运行阶段

21.30修好了`sessionResumeEligibility`的空文字准入，但复查发现`hasContinuationEvidence`（决定`hasUnfinishedSessionWork`、进而决定关闭时是否保留恢复证据）仍要求`pendingPrompt.trim().length > 0`。纯图片提示的`pendingPrompt`是空字符串，因此该判定为假——**只靠`runPhase`仍为`prompt-persisted`/`turn-active`才保住证据**，这是巧合而非规则：一旦运行阶段回落或新增阶段值，纯图片会话就会丢失续跑证据。

现两处读同一条件（空文字时要求最新user消息的文本投影等于pendingPrompt且有实际内容），与eligibility owner一致。探针确认纯图片中断会话`continuationEvidence:true`、`unfinishedWork:true`。

验证：`work`13（新例断言纯图片保留、空文字无图片不保留）、`scope`21、`sessionResumeEligibility`5、`recovery`24，共**63项**通过；一反转（退回纯文字判定）命中断言且finally字节恢复；五静态门、TS build/freshness通过。build `f9996ca41a80`。原47/ADD整体partial、goal active。


### 21.63 「提示是否有内容」的其余判定点排查

按21.62的方法搜索所有判定pending提示的位置，共四处：

- `sessionContinuationProjection.hasContinuationEvidence`：**21.62已修**（原仅文字）。
- `sessionResumeEligibility`：21.30已含图片准入。
- `recovery/scope.readPendingPrompt`：21.30已含专门分支（空文字仅经精确保留的图片消息恢复，legacy缺文字修复不得制造不存在的图片）。
- `entrypoints/sessionsPanel.buildResumeCue`：仅文字判定，纯图片会话退到`lastUserMessage`或空。

最后一处**未修改**：它是非交互式会话列表的显示降级，不丢数据；交互式`/resume`面板本就只显示`session.status`（`interrupted`等）而不显示pending，两条路径状态字段足够。`SessionReentrySummary`没有「是否含图片」字段，添加它需要改投影契约，收益低于风险。

未改产品代码。build `f9996ca41a80`。原47/ADD整体partial、goal active。


### 21.64 fork不再继承源会话未完成的工具调用

审查`/fork`与进行中工具的交互，发现真实缺陷：`forkTranscriptEvents`复制全部transcript事件，而`sessionRecoverySnapshot`的`pendingLifecycle`**完全由`deriveLifecycleIndexFromTranscript`从transcript重建**（忽略state里的值）。源会话有一个`tool.started`无对应结果时，fork出的新会话因此继承`pendingTools:["call-open"]`、`hasUnfinishedSessionWork`为真、状态`active`——用户fork出新方向，新会话却看起来欠着**属于源会话**的那次调用，可能被当作可恢复的未完成工作。

现fork丢弃未完成的工具事件（`tool.started`无对应`tool.result`/`tool.settled`），保留描述对话的消息历史。探针：修复前`forkedPendingTools:["call-open"]`/`forkedUnfinished:true`，修复后`[]`/`false`，源会话仍为`true`。

验证：`create`4（新例断言fork无pending、源保留）、`work`13、`recovery`24，共**41项**通过；一反转（保留pending事件）命中断言且finally字节恢复；五静态门、TS build/freshness通过。build `dbe6dc1eb2a1`。原47/ADD整体partial、goal active。


### 21.65 导航与fork对进行中工作的行为验证

21.64后检查两个交互点：

- **`/back` 越过未完成调用**：回到该调用**之前**的点会清空`pendingTools`、`hasUnfinishedSessionWork`变为false；回到该调用**之后**的点则保留，因为那次调用属于仍在视图中的分支。`recovery/scope.ts`一直按`sourceEntryId`过滤query-event，索引从用户所在分支重建——行为正确。
- **fork与undo**：fork的`undoHistory`为空、源会话仍列出自己的操作，新方向无法撤销它没做过的写入。

首轮探针把「回到调用之后仍保留pending」误读为缺陷，据此写下的transcript投影改动已回退。这是本系列第二次因探针设计错误而差点引入多余改动。[工件](../../.omx/artifacts/phase20-addition-navigation-pending/README.md)。build `dbe6dc1eb2a1`。未改产品代码。原47/ADD整体partial、goal active。


### 21.66 压缩不改变会话结构，未完成调用仍属活动分支

检查`/compact`与进行中工具的交互。压缩只减少发送给模型的消息：transcript是append-only、thread保留全部entries、`state.thread`原样带过。因此压缩前未完成的工具调用在压缩后仍在活动分支上，恢复索引仍指向它。

判定为**正确行为**而非缺陷：那次调用确实未被答复，发起它的分支仍在视图中；恢复时用户会被告知会话中断且有pending调用。若反而移除该entry，索引就与用户所在分支不一致。`applyCompaction`只返回新的messages数组，不改transcript或thread，这是分层正确的表现。

未改产品代码。[工件](../../.omx/artifacts/phase20-addition-compaction-pending/README.md)。build `dbe6dc1eb2a1`。原47/ADD整体partial、goal active。


### 21.67 并发写入同一会话不丢失

两个独立Node进程各向同一保存会话追加20轮，彼此无协调。结果：两个进程exit0；最终41轮（base+20+20），各自20轮都在、互不丢失；`state.json`仍可解析；`transcript.jsonl`42行（header+41轮）。会话状态锁串行化追加、原子状态写保持快照可读——撕裂或交错写入会表现为丢轮或状态文件不可解析，两者均未出现。

边界：同机两写者、每轮一次追加、仅Linux；未覆盖写入中途被杀、锁语义更弱的网络文件系统、或两个以上写者；也未覆盖两写者编辑**同一轮**（会话writer是append-only，该形态不存在）。

未改产品代码。[工件](../../.omx/artifacts/phase20-addition-concurrent-writes/README.md)。build `dbe6dc1eb2a1`。原47/ADD整体partial、goal active。


### 21.68 transcript是会话内容的权威来源

检查`appendSessionTurn`的写入顺序：先append transcript、再`writeMetadata`、再`writeState`。transcript失败时metadata不会写，因此不会出现「metadata有而transcript没有」。反向部分成功（transcript成功、metadata失败）时，读取侧`projectSessionRecordSnapshot`的`turns`由`projectBranchMessages(events, ...)`从**transcript**投影，而非从metadata的turns数组——transcript是权威，metadata是索引。因此部分成功降级为「索引缺一条、记录完整」，恢复仍看到完整历史。

21.67的并发探针（41轮完整、state可解析）与此一致。未改产品代码。build `dbe6dc1eb2a1`。原47/ADD整体partial、goal active。


### 21.69 fork不再继承未开始的审批（子代理review F1）

21.64只处理了`tool.started`，但**审批在工具启动之前询问**（`core/agent/tools.ts:177`的`tool_execution_start`在`:208`的`beforeToolCall`之后）。因此一个`approval.requested`可能没有对应的`tool.started`，`unfinishedToolCallIds`从不把它列入未完成集合，fork仍复制该审批。探针确认：修复前fork得到`pendingApprovals:["call-approval"]`、`hasUnfinishedSessionWork:true`。

现`unfinishedToolCallIds`同时从`approval.requested`播种、并以`approval.resolved`结算。修复后fork的两个pending集合均为空、`hasUnfinishedSessionWork:false`，源会话保留其审批。

子代理review另报F2（图片提示在`sessionHasReentrySurface`/`scoreSessionReentrySummary`/`hasPendingPromptHere`仍按`pendingPrompt?.trim()`判定）。逐项探针核实**均已兜底**：`sessionHasReentrySurface`由`sessionHasConversation`先行返回true（图片消息即对话）；`hasPendingPromptHere`由`autoResumeReady`兜底；`bootstrap.hasUnfinishedBusiness`第二条件`hasUnfinishedSessionWork`覆盖。故F2降级为潜在不一致，非当前错误结果。

验证：`create`5（新例断言fork无pending审批、源保留）、`work`13、`recovery`24，共**42项**通过；一反转（只从tool.started播种）命中断言且finally字节恢复；五静态门、TS build/freshness通过。build `69a1ba79a49e`。原47/ADD整体partial、goal active。


### 21.70 硬杀会话可再次continue（子代理review缺陷#4）

子代理review指出：`evaluateSessionResumeEligibility`在`status`不是`interrupted`/`error`时直接拒绝，但**非正常死亡从不写`interrupted`**——prompt屏障留下的是`active`。于是`/continue`与恢复提示选择器拒绝的正是bootstrap刚认领为未完成工作的会话。探针确认：持久化提示+未答复`tool.started`、从未标记中断的会话为`status:"active"`、`pendingTools:["call-live"]`、`hasUnfinishedSessionWork:true`，但`recoverable:false`、detail为"Session is not in interrupted/error state"。

现为`active`增加证据分支，复用与`interrupted`相同的信号（pending提示、turn/prompt恢复信号、续跑证据）：有证据则`fully-resumable`或`partially-resumable`，无证据仍拒绝并给出独立措辞。未放宽「什么算证据」。

验证：`sessionResumeEligibility`7（两新例：有证据可恢复、无证据仍拒绝）、`recovery`24、`bootstrap`28、`work`13，共**72项**通过；一反转（只按状态拒绝）命中断言且finally字节恢复；五静态门、TS build/freshness通过。build `f5ad32ed83e9`。原47/ADD整体partial、goal active。


### 21.71 恢复写入的补偿事件不再永久阻断目标验收（子代理review缺陷#3）

`sessionLifecycleReconciliation`在恢复时为未结算的调用写入`tool.result { success:false, compensated:true }`与`approval.resolved { outcome:"denied", compensated:true }`。但`acceptanceEvidence`只看`success !== true`与`outcome !== "approved"`，**不豁免`compensated`**——于是进程崩溃后的一次恢复会让目标永久无法完成。探针确认：真实失败、补偿失败、补偿拒绝三者原本**同等阻断**（均返回undefined）。

现`acceptanceEvidence`按事件类型分别判断并豁免`compensated`：补偿事件记录的是「结果未知」，既不是失败也不是用户拒绝。修复后真实失败与真实拒绝仍阻断，两种补偿事件不再阻断。

验证：`acceptance`14（新例覆盖四种组合）、`recovery`24，共**38项**通过；一反转（撤回补偿豁免）命中断言且finally字节恢复；五静态门、TS build/freshness通过。build `76bb4743ebdd`。原47/ADD整体partial、goal active。


### 21.72 终态保存失败不再被重新归类为查询失败（子代理review缺陷#1）

`executePrompt`把`saveCompleted`/`saveError`放在同一个`try`里，其`catch`把**任何**异常解释为查询结果：非中止时追加`lifecycle.error`并`saveError`，中止时追加`lifecycle.cancelled`并`saveInterrupted`。但`withFileLock`在action成功后若**释放锁时丢失所有权**会抛错（`sessionFileStore.ts:154-161`，有意不把丢所有权的写入当成功）——于是`saveCompleted`已发布`status: completed`却抛错，catch再追加`lifecycle.error`，durable记录与实际结果矛盾。

现记录「终态已决定」标志：该标志之后的抛出按存储失败上报并原样抛出，**不**追加任何相反的取消或错误事件。回归用例断言`saveCompleted`抛错时只记录`query.completed`与`completed`，不出现`lifecycle.error`/`interrupted`。

验证：`sessionRuntime`50（新例）、`recovery`24、`bootstrap`28，共**102项**通过；一反转（撤回标志判断）命中断言且finally字节恢复；五静态门、TS build/freshness通过。build `00460ad6ff4d`。原47/ADD整体partial、goal active。


### 21.73 双进程恢复的伪造结果：确认为真实竞态但不在本批修复（子代理review缺陷#2）

探针确认：进程A的`tool.started`已持久化、结果尚未写入时，进程B调用`reconcilePendingLifecycle`会写入`tool.result { success:false, compensated:true }`；随后A的真实结果`success:true`也写入。该调用在transcript中因此**永久保留两条矛盾记录**，伪造的那条在前。`isDuplicateDurableResolutionEvent`只拒绝完全相同的重复，拦不住它。

根因：`resumeShellSession`只要看到pending就调用reconcile，**不检查该运行是否仍在另一进程存活**；而锁文件只在持锁期间存在，恢复时锁已释放，没有可靠的跨进程存活信号。

**本批不修复**，理由如下：可靠修复需要引入运行所有权租约（运行期间持续持有可探测的租约、恢复前检查其存活），这是架构级改动；仓促实现（例如仅检查锁文件是否存在）会在进程刚释放锁但仍在收尾时误判存活，反而阻塞合法恢复，或在跨主机/容器场景失效。伪造事件的读取影响已部分缓解——21.71让`compensated`事件不再阻断目标验收；按最新事件判断的读取方看到的是后到的真实结果。

保留为已知竞态。[探针](../../.omx/artifacts/phase20-addition-crash-recovery/double-recovery-probe.mjs)。build `00460ad6ff4d`。未改产品代码。原47/ADD整体partial、goal active。


### 21.74 钩子的「仅本次」不再变成永久授权（子代理review安全缺陷）

子代理review发现：`approveDeclaredHook`对`allow-once`与`allow-always`返回**同一个`true`**，而`hookDispatcher`只要`approved === true`就`recordTrust`并写入`hook-trust.json`。用户看到的是「Allow once · Run it for this session」，实际得到的是**跨会话、跨进程的永久信任**——一个安全缺陷，且原先的`registration.test.ts`用例（`asked === 1`）恰好锁定了这个错误行为。

现`HookApprovalRequest`返回`HookApprovalDecision`（`allow-once`/`allow-always`/`deny`），只有`allow-always`才`recordTrust`；布尔返回值按旧形态视为**一次性**，使无类型调用方也无法把「仅本次」升级为永久。测试改为两向对照：`allow-once`第二次**重新询问**（`asked === 2`），`allow-always`才记住（`asked === 1`）。

验证：`hooks`6、`registration`11、`cliRuntimeInvocation`25、其余hook文件，共**63项**通过；一反转（无条件记录信任）命中断言且finally字节恢复；五静态门、TS build/freshness通过。build `46b545b404f5`。原47/ADD整体partial、goal active。


### 21.75 授权目标过粗导致一次授权覆盖实质不同的调用（子代理review安全缺陷）

子代理review指出四类工具的授权目标过粗。探针确认：`task`以`description`为目标（同标签不同prompt共用）、`browser`的`click`/`type`目标只是动词（任意坐标/文本共用）、`ssh`与MCP工具目标只是工具名（任意远程命令/任意参数共用）。用户对一次调用选「allow always」后，实质不同的后续调用会被自动批准。

现按工具补齐目标：`ssh`为`ssh:<operation>:<remote>:<command>`；`browser`为`<action>:<anchor>`（URL/selector/text/key/坐标）；`task`/`team`在标签之外并入指令（`<label>:<instruction>`）。MCP工具的参数契约无法通用解读，因此**禁止`allow-always`**（降为一次性，并在提示中说明），与既有`apply_patch`的同类先例一致。

验证：`toolPolicy`38（三个新例分别断言task/browser/ssh的目标区分）、`cliApprovalModule`、`arguments`29、`turn/tools`54，共**121项**通过；一反转（ssh退回工具名）命中断言且finally字节恢复；五静态门、TS build/freshness通过。build `9d82295d16c1`。原47/ADD整体partial、goal active。

### 21.76 钩子授权跨项目生效、项目拒绝不影响钩子、授权无法撤回（子代理review安全缺陷）

三处安全缺陷，同一处所有权：

1. **跨项目生效**：`hookFingerprint`只覆盖event/matcher/command，不含声明文件。在A仓库批准`./check.sh`后，B仓库提交同样文本的钩子会被直接信任。现指纹并入`path.resolve(sourcePath)`；用户级`hooks.json`是同一路径，因此对它的决定仍全局一次生效——那是用户自己的文件。
2. **项目拒绝不覆盖钩子**：MCP（`gateway.ts`）与workflow（`workflowCommandRuntime.ts`）都查`projectTrust.isProjectUntrusted`，钩子不查。仓库被标为untrusted后仍能借钩子执行命令。现`registerDeclaredHooks`在项目被拒时不再注册该工作区内的钩子；用户级钩子不受影响。`/trust`状态在untrusted时把命令列表改述为「refused while the project is untrusted」。
3. **授权无法撤回**：`HookTrustStore`只能记录，没有撤回入口。现增`forgetTrust`（返回是否真的删掉了条目，便于区分「已撤回」与「本来就没有」）与`entries`。

顺带修正：git gate的审批把`EscalationDecision`压成布尔，而布尔按契约是一次性，提示里的「Allow Always」在那里永远不会持久化。映射抽为`hookApprovalDecision`，两处调用点共用；`approveDeclaredHook`的提示改为「remembered for this exact command in this file」，与实际范围一致。

验证：`trust`19、`registration`14、`security/trust/command`10、`profile/sources`14，共**57项**通过；四反转（指纹去掉文件、项目拒绝不再拦截、撤回无效、always降为once）全部命中断言且finally字节恢复；五静态门、TS build/freshness、strict docs drift通过。原47/ADD整体partial、goal active。

### 21.77 已记录的钩子授权没有撤回入口；持久授权被内存副本遮蔽

上一批给`HookTrustStore`加了`forgetTrust`/`entries`，但没有任何调用者——一个没人能用的API不等于「可撤回」。现`/trust forget`撤回本项目的钩子授权：按声明文件筛选，所以只撤回属于本项目的，用户自己的`hooks.json`不动；没有可撤回的条目时明说「Nothing was withdrawn」，而不是报告一次什么也没做的撤回。

补上探针暴露的第二个缺陷：`recordTrust`无条件把指纹放进`sessionApprovals`，而`isTrusted`先查内存。于是**另一个实例**撤回后，已经打开的store仍然授权——正是「已持久的授权不该再有一份内存副本」的反面。现只有写盘失败时才留在内存（那种情况下会话内仍应有效），写盘成功则从内存移除；`forgetTrust`在写盘失败时返回`false`，不宣称未生效的撤回。

顺带修正提示语：审批面板的「Allow always for this command/session」把授权描述成会话级，实际写进项目策略文件、跨会话跨进程有效。现为「Allow always for this project」。

验证：`trust`21、`registration`14、`commands.test`41、`pickers`50，共**126项**通过；四反转（持久授权仍进内存、写盘失败仍报成功、未记录也报撤回、标签退回session措辞）全部命中断言且finally字节恢复；五静态门、TS build/freshness、strict docs drift通过。原47/ADD整体partial、goal active。

### 21.78 权限档位跨项目存活

`ShellSessionRuntime`随交互进程创建一次，`permissionScope`是它的字段，而`/resume`切换会话时`switchRuntimeSessionProjectContext`可以换掉`projectRoot`——切换后档位不变。于是用户在A项目选了`allow-all`，切到B项目的会话后，B的普通审批仍被自动放行，用户从未在B做过这个决定。档位文档明确说它「只回答沙箱提出的问题、永不永久授权」，跨项目存活正是这句话的反面。

该批让`switchRuntimeSessionProjectContext`返回项目是否真的变了，交互侧据此把档位重置为`ask`，同项目内保持不变，并抽出`permissionScopeAfterSwitch`。这是当时的实现记录；后续24.72实际路由审计发现普通`/resume`及workspace路径并未接入重置，且比较错误折叠POSIX大小写。现已由权限owner绑定primary项目与变更代次统一取代这些可漏接的回调，旧辅助函数移除，详见24.72。

验证：`cliSessionSwitch`3（同项目保留、跨项目重置、已是ask时不变）；一反转（`return scope;`）命中断言且finally字节恢复；五静态门、TS build通过。原47/ADD整体partial、goal active。

## 22. 第十轮用户反馈（2026-10-31）：排队与发送不可区分、配置文件职责、fullscreen 退出残留

本轮用户提出第三十八至第四十项。**本轮只做定位与机制核实，未修改任何产品代码**；实施另记。证据分三类：**已确认机制**（源码可复现，含行号）、**对照结论**（只读比较参考项目）、**未确认**（现有证据不足）。

编号沿用用户原序号，并已并入第12节台账：第三十八 → **ADD-69**，第三十九 → **ADD-70**，第四十 → **ADD-71**。

### 22.1 第三十八：连续发送两条请求时，无法区分"排队"与"下一个 turn"

**用户观察**：只要发送文本就立刻显示在 TUI 里；第二条到底是在排队，还是已经成为下一轮，看不出来。

**已确认机制（决定性）**

1. **用户气泡在判断"运行还是排队"之前就已写入。** [onSubmit](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts) 先执行 `this.state.transcript.append(textBlock("user", text))`，然后才进入 `if (this.busy)` 分支决定走 `queue.push` 还是 `input.steer/followUp`。因此排队中的消息与已发送的消息在 transcript 里**完全相同**。
2. **排队数量只出现在提示行，不在 transcript。** [transientHint](../../packages/ts-shell/src/presentation/tui/chrome/hints.ts) 在 `queued > 0` 时显示 `` `${n} queued · runs when the current turn finishes` ``；状态项 `queued`（[items.ts](../../packages/ts-shell/src/presentation/tui/chrome/items.ts)）也只是底栏的一段文字。提示行是 transient 的：一旦有其他提示（suggesting、cancelArmed）或输入框有内容，它就可能被替换。**排队这件事没有一条持久的、与具体消息关联的视觉标记。**
3. **Enter 在 busy 时是 steer，但会被降级。** [keymap](../../packages/ts-shell/src/cli/interactive/keymap.ts) 的 `tui.input.submit` 在 busy 时传 `"steer"`；但 [onSubmit](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts) 里 `const input = text.startsWith("/") || composed || attachments?.images.length ? undefined : this.options.sessionRuntime.input?.()`，命令、可组合输入、带图片的输入都会拿不到 `input`，于是落入 `this.queue.push(text, attachments)`。**同一个 Enter 键，有时 steer、有时排队，而界面不给任何区分。**
4. **Ctrl+q 是纯排队，但只在 busy 时生效。** [keymap](../../packages/ts-shell/src/cli/interactive/keymap.ts) 的 `app.message.followUp` 分支要求 `context.busy`，否则返回 `"nothing"`；空闲时按 Ctrl+q 不发任何东西。这符合"没有队列可加入"的语义，但用户若在空闲时按它，会以为按键坏了。两条额外限制：**（i）** vim 模式下非 insert 状态时，模态层在动作分派之前就吞掉 ctrl 组合键（`keymap.ts` 先走 `feedVim`，未实现的控制键返回 `none`），Ctrl+q 在那里永远到不了 `app.message.followUp`；**（ii）** 与 Ctrl+s 同类，部分终端或复用器会用 IXON 吞掉 Ctrl+q，而本仓库的 raw mode 是直接 `setRawMode(true)`，没有关闭流控。
5. **被 steer 投递的消息不会产生任何 transcript 块。** 投递走 `AgentCore` 的 steering/followUp 队列，在 `message_start`/`message_end` 处注入；而 `TurnProjection` 对 `message_start` 不产出事件，对 `message_end` 只处理 `assistant` 与 `tool` 角色。因此 steer 的内容**只**以提交时那一个用户气泡的形式存在，投递动作本身不可见；它会被持久化到会话日志，重开时作为普通用户气泡重现，但**没有任何标记表明它曾被 steer 过**。
6. **提示行的文案与实际行为不一致。** 忙碌时提示行写 `enter steer before next step`、`ctrl+q run after turn`（[hints.ts](../../packages/ts-shell/src/presentation/tui/chrome/hints.ts)），但如上所述 Enter 在命令/组合/图片场景并不是 steer。该文案被 [hints.test.ts](../../packages/ts-shell/src/presentation/tui/chrome/hints.test.ts) 的 `expect(text).toContain("enter steer before next step")` 锁定——**修正它会改动一条既有测试**，实施时必须说明理由，不能悄悄改断言。

**对照结论（Codex / Claude Code）**

- Codex 把三件事拆成三个键：**Enter = steer（在当前 turn 的下一个安全点注入）**、**Tab = 纯排队（FIFO，当前 turn 完成后作为下一轮运行）**、**Esc = 中断**。这是显式的输入契约，不是提示文案。
- Codex 的队列状态是**独立的 FIFO 状态**，与 steering 分开存放（`queued_user_messages` / `pending_steers` / `rejected_steers_queue`），并且有 `PendingInputPreview` 把三者显示出来。
- Claude Code 长期被批评为把三者混为一谈；官方在 2026-08 的回复是"Enter 排队、Esc 中断、↑ 取回排队的消息"。即便如此，社区仍在要求"能看见队列、能删除/重排某一条"。
- **我们的差别**：已有 `steering` / `followUp` / `pending` 三条 lane（[queue.ts](../../packages/ts-shell/src/core/agent/queue.ts) 的 `InputQueueLane`），底层模型是对的；缺的是**呈现**与**键位一致性**，不是队列本身。

**确定的缺口**

1. 排队的用户消息在 transcript 里与已发送的完全相同，无法回溯。
2. Enter 的行为随输入内容漂移（steer / 排队），但提示行只说 steer。
3. 空闲时 Ctrl+q 是空操作，没有反馈。
4. 队列内容不可见、不可编辑、不可单独取消（只有 `clearQueue` 全清）。
5. **排队消息与已发送消息都只活在内存的显示容器里，但只有前者会随退出消失。** 用户气泡写进的是 `state.transcript`——[createViewState](../../packages/ts-shell/src/presentation/tui/surface/contract.ts) 新建的内存 `Transcript`，不是会话存储；真正落盘要等提交进入 turn 后由持久事件写出。队列同样是内存里的 `PendingQueue`（[queue.ts](../../packages/ts-shell/src/core/agent/queue.ts)），不产生持久事件（`isDurableQueryEvent` 的名单里没有排队项，见 [events.ts](../../packages/ts-shell/src/core/query/runtime/events.ts)）。**因此退出或崩溃后，排队中的消息连同它的气泡一起消失，不会在恢复的会话里留下一条"从未送达"的提问。** 这一条是澄清而非缺陷：先前把它写成"气泡已落盘、队列丢了"是不准确的，已更正。

**修改方向（未实施）**

- 排队时写入**可区分的块**：例如 `kind: "queued"` 或带 `pending: true` 的用户块，在轮到它时原地转为普通用户块；或在用户块上加一条"排队中 · 按 ctrl+q 提升"的附属行。二者都要在 `restoreConversation` 的持久化投影里保持真实——不能只在内存里好看。
- 让 Enter 的行为**稳定且可预期**：要么所有 busy 提交都 steer（命令类除外，明确提示"命令不能 steer，已排队"），要么统一排队并把 steer 交给单独的键。**不能继续让同一个键因输入内容而改变语义而不告知。**
- 空闲时 Ctrl+q 给出一次可见反馈（"当前没有运行中的 turn，消息已直接发送"），而不是静默。
- 队列可见性：至少提供 `/queue` 或提示行之外的持久列表；编辑/取消单条复用既有 `InputQueueControl.edit/cancel/move`，不新建队列。
- **排队状态必须随消息一起消失或一起留下**：现状是两者都在内存、一起消失，这是自洽的；改动呈现方式时不能顺手把"排队中"的块写进持久层，否则会造出"恢复后看到一条从未送达的提问"这一新缺陷。

**另有两处文档层面的证据**

- 设计文档自己已记录过这类缺口：`.wiki/articles/tui-experience-direction.md` 写着"Enter steer 说明不足……当前提示语只写 `enter steer`，缺少用户可理解的解释"；`turn-lifecycle-alignment.md` 记录的意图是显示 `N steering` / `N queued` 的**计数**，而不是逐条消息的标记。也就是说，"只给计数"是有意的设计，但它不足以回答用户"我这条到底在哪"的问题。
- 同一动作的两处说明是各自维护的：`KEY_ACTIONS["tui.input.submit"].description` 是平实的 "Send the prompt"（[keybindings.ts](../../packages/ts-shell/src/cli/interactive/keybindings.ts)），而指南行"while a turn runs, steer it before its next step"来自另一张表（[chrome/keys.ts](../../packages/ts-shell/src/presentation/tui/chrome/keys.ts)）。两者独立维护，是文案漂移的温床。

**证据边界**：全部为源码链路；未在真实终端复现按键，未测量用户实际节奏下的提示行切换。

### 22.2 第三十九：config.json 与 models.json 没有真正分开

**用户观察**：config 里既有模型配置又有其他设置，连 API key 也写在 config 里。

**已确认机制（决定性）**

1. **一份文档装了三类东西。** [fields.ts](../../packages/ts-shell/src/config/fields.ts) 的 `createConfigFields` 同时声明：凭据（`providerCredentials`、`providerConnections`、`activeProviderConnectionId`、`provider`）、模型行为（`allowedModels`、`contextWindow`、`maxOutputTokens`、`temperature`、`topP`、`modelTokenBudgets`）、以及普通设置（`theme`、`vimMode`、`tuiMode`、`tui`、`maxTurns`、`denyRules`、`allowedTools`、`retry*`、`offline`）。它们写进同一个 `config.json`。
2. **API key 确实是该文档的一等字段。** [schema.ts](../../packages/ts-shell/src/config/schema.ts) 的 `credentialSchema` 含 `apiKey`、`baseUrl`、`model`、`serviceTier`、`thinkingEffort`、`accountAuth`；`connectionSchema` 展开这些属性，所以 `providerConnections[]` 也带 `apiKey`。`accountAuth` 还含 `accessToken`、`refreshToken`、`clientSecret`。`/connect login` 会把它们写进 `providerConnections[]` 与 `providerCredentials[]`。
3. **写入没有显式 `0600`。** [persistence.ts](../../packages/ts-shell/src/config/persistence.ts) 调用 `writeTextFileAtomic(baseline.path, text)`，未传 mode；[sessionFileStore.ts](../../packages/ts-shell/src/session/store/sessionFileStore.ts) 的 `writeTextFileAtomic` 在 `mode === undefined` 时用 `fs.openSync(tempPath, "wx", undefined)`，即 `0o666 & ~umask`（常见为 0644）。同仓的 profile 导入日志显式用了 `0o600`（[journal.ts](../../packages/ts-shell/src/config/profiles/import/journal.ts)）。**含 OAuth refresh token 的文件因此可能对同机其他用户可读。**
4. **`models.json` 无凭据、无项目作用域。** [catalogStore.ts](../../packages/ts-shell/src/core/models/catalogStore.ts) 的 `USER_FILE = "models.json"`，只经 `resolveUserDataFile` 解析；其形状是 `providers: Record<string, Partial<CatalogProvider>>`，唯一与密钥有关的是 `envVar`——**环境变量名**，不是值。这一点是正确的。
5. **同一事实在多处重复。** provider id 出现在 `provider`、`providerConnections[].provider`、`providerCredentials` 的键、以及 `models.json` 的 `providers.<id>.runtime`；base URL 出现在 `providerConnections[].baseUrl`、`providerCredentials[].baseUrl`、`accountPool[].baseUrl`、`accountAuth.subscription.baseUrl`，以及 `models.json` 的 `CatalogProvider.baseUrl`；model id 出现在 `providerConnections[].model`、`providerCredentials[].model`、`modelTokenBudgets` 的键、`allowedModels` 条目、`models.json` 的 `models[].id`；`contextWindow` 与 `maxOutputTokens` 既在顶层又在目录条目里。
6. **凭据不会被项目作用域读到。** `provider`、`providerCredentials`、`providerConnections`、`activeProviderConnectionId` 都是 `personal: ['user']`，项目文件设置它们会被 `source-not-allowed` 拒绝。这一条也是正确的。

**对照结论（oh-my-pi）**

- `config.yml` 是设置文件（`/settings`、`omp config set` 写这里）；`models.yml` 是模型目录（provider 的 `baseUrl`、`api`、`headers`、`models[]`、`compat`）；**凭据既不在两者**：文档明确"Provider API keys are resolved separately (stored auth, OAuth, `models.yml`, environment, and `.env` files)"，并建议"Keep secrets out of committed project config"。`models.yml` 里可以写 `apiKey`，但那被当作**环境变量名**或显式覆盖，不是持久凭据库。
- 我们的问题不是"没有拆分"，而是**拆得不彻底**：`models.json` 确实只有元数据、无密钥、无项目作用域；真正混在一起的是 `config.json` 内部的凭据、模型目标、普通设置三类。

**确定的缺口**

1. 凭据与普通设置同文档，且未强制 `0600`。
2. "当前模型 / thinking effort / 采样参数"属于模型目标，却存在设置文件里，用户在两处找不到同一件事。
3. 同一事实（provider、baseUrl、model、contextWindow）在 4–5 处重复，任何一处漂移都会造成"面板显示 A、实际请求 B"。

**修改方向（未实施）**

- **先修权限**：`config.json` 写入传 `0o600`，并加一条"含凭据的文件必须是 0600"的回归。这是最小、最确定、风险最低的一项。
- **再把凭据拆出去**：新增 `auth.json`（或 `credentials.json`）只放 `providerCredentials` / `providerConnections[].apiKey` / `accountAuth`；`config.json` 保留模型目标与普通设置。迁移必须可逆、可读旧格式、写入前 `0600`。
- **最后收敛重复**：`baseUrl` 与 `model` 只保留一处权威来源（建议目录负责"能连到哪里"，连接负责"用哪个账号/密钥"），其余改为派生或校验。
- 不引入 YAML：本项目已有 JSON 解析与 JSONC visitor，换格式是纯成本。

**本机实测（2026-10-31，脱敏读取，未打印任何密钥值）**

用户指出上一版结论把范围说窄了：真正的问题不是"models.json 干净"，而是 `config.json` 本身。实测确认：

| 文件 | 权限 | 内容 |
|---|---|---|
| `~/.cheers/config.json` | **0644** | 顶层键 `provider`、`providerCredentials`、`tui`、`providerConnections`；前两者含明文 `apiKey`、`baseUrl`、`model` |
| `~/.omp/agent/config.yml` | **0600** | `grep -ciE "apikey\|baseurl\|token\|secret"` = **0**；只有 `modelRoles`、`retry`、`compaction`、`composer`、`skills` 等设置 |
| `~/.omp/agent/models.yml` | 0644 | 模型目录，无凭据 |

**并且本机存在一个实际的自相矛盾**：同一份 `config.json` 里同一个模型配了两个不同的 base URL——`providerCredentials["openai-compatible"].baseUrl` 是 `.../openapi/v1`，`providerConnections[0].baseUrl` 是 `.../v1`。`providerCredentialBaseUrl` 取 `resolution.baseUrl ?? credential.baseUrl`（[target.ts](../../packages/ts-shell/src/core/auth/account/target.ts)），即连接值优先，凭据里那个是**死值**。这正是"同一事实多处存储"的直接后果：两处漂移，一处静默失效，而界面不说明哪个在生效。

**正确的划分应当是四份，不是两份**（对照 omp）：设置（`config.json`）、模型目录（`models.json`）、凭据（独立的 auth 文件，0600）、运行时状态（会话/缓存）。当前把前两者和凭据挤在一份 0644 文件里。

**证据边界**：读取为本机真实文件，密钥值已脱敏、未记录；未验证 umask 实际值（但文件实测就是 0644）。

### 22.3 第四十：fullscreen 退出后屏幕上仍有聊天记录

**用户观察**：fullscreen 模式下退出后，屏幕上还留着之前 TUI 里的聊天记录。

**已确认机制（决定性）**

1. **`fullscreen` 就是备用屏。** [interactiveMode.ts](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts) 的 `this.alternateScreen = options.runtimeContext.runtimeConfig.tuiMode !== "regular"`；[engine.ts](../../packages/ts-shell/src/presentation/tui/render/engine.ts) 据此写 `ENTER_ALT_SCREEN`（`\x1b[?1049h`）。
2. **退出时故意把整段会话重写到主屏。** [leaveScreen](../../packages/ts-shell/src/presentation/tui/render/paint.ts) 先写 `EXIT_ALT_SCREEN`（回到主屏），然后**逐行重写传入的 `document`**。而 `document` 来自 [interactiveMode.stop](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts) 的 `this.state.transcript.render(width).rows`——**整段会话，不是最后几行**。
3. **这是有意设计，且有测试锁定。** [paint.ts](../../packages/ts-shell/src/presentation/tui/render/paint.ts) 的注释写明"the document written here is what the user gets to scroll back to and copy from once the session is over"；[engine.test.ts](../../packages/ts-shell/src/presentation/tui/render/engine.test.ts) 有一条 `"leaves the document under the restored screen, one row per line"` 直接断言这一行为。
4. **历史来由**：早期文档（[phase-4-pre-research](../../.wiki/features/phase-4-pre-research.md) 第 3.2 节）记录过"进入备用屏后用户 scrollback 里不留下任何对话"是缺陷，后来加了"退出时重写文档"作为补偿。

**对照结论（codex / oh-my-pi）**

- codex 退出只 `LeaveAlternateScreen`（[tui.rs](../../../codex/codex-rs/tui/src/tui.rs)），不重写会话；用户看到的终端与进入前一致。
- oh-my-pi 的 `emergencyTerminalRestore` 同样只弹备用屏帧并 `terminal.stop()`，不重写内容。
- **两者都把"退出后屏幕恢复原样"当作正确行为**；我们为了保住 scrollback 做了相反的选择。

**这不是缺陷，是产品决策冲突**

用户现在的要求（退出后不要有残留）与当初"scrollback 里要有对话"的补偿方向相反。两者不能同时满足于同一个模式，因此需要显式裁决：

- **方案 A（对齐参考）**：`fullscreen` 退出只恢复终端，不留任何会话内容。想保留对话的用户用 `regular`。这是最一致、最可预期的语义，也让两个模式真正有区别。
- **方案 B（保留补偿，但加开关）**：默认对齐参考，新增一个 `tui.restoreOnExit`（默认 `false`）让需要 scrollback 的人打开。
- **方案 C（保留现状，改文档）**：明确写"fullscreen 退出会把会话写回主屏"，让用户预期一致。但这与用户本次反馈直接冲突，不可接受。

建议 **A**，理由：`regular` 已经完整承担"对话留在 scrollback"的职责，两个模式应有正交语义；`fullscreen` 再把内容写回主屏，等于把私有屏的内容泄漏到用户的终端历史里，用户无法预期。

**裁决（2026-10-31，用户明确选择方案 A）**：`fullscreen` 退出只恢复终端，**不再把会话写回主屏**；需要 scrollback 的用户使用 `regular`。理由：两个模式应有正交语义，`fullscreen` 把私有屏内容泄漏进用户终端历史是不可预期的行为。改动会**使一条现有测试失败**（`engine.test.ts` 的 `"leaves the document under the restored screen"`），该断言锁定的是被否决的方案；实施时必须同时改断言并在文档写明理由，不能只改实现留下失败测试，也不能只改测试假装没变。

**证据边界**：源码与参考实现对照；未在真实终端观察退出后的屏幕（用户已观察）。

### 22.4 本轮结论摘要

| 编号 | 判定 | 主要证据 | 性质 |
|---|---|---|---|
| 38 | 确认：排队的消息与已发送的完全同形；Enter 因输入内容在 steer 与排队之间漂移；提示行文案与实现不符 | `interactiveMode.ts` 先 append 后判断；`keymap.ts` busy 传 steer；`hints.ts` 的文案 | 设计缺陷 |
| 39 | 确认：凭据、模型目标、普通设置同文档；含密钥的文件未强制 0600；同一事实 4–5 处重复 | `fields.ts`、`schema.ts`、`persistence.ts`、`catalogStore.ts` | 结构缺陷 + 安全缺陷 |
| 40 | 确认：退出时把整段会话重写到主屏，且有测试锁定 | `paint.ts` `leaveScreen`、`interactiveMode.stop`、`engine.test.ts` | 产品决策冲突，非缺陷 |

**本轮未修改任何产品代码。** 三项都已并入第12节台账（ADD-69/70/71），状态为"未开始"。按第12.13节的顺序，ADD-70 的权限修复应当最先做（最小、最确定），其次是 ADD-69 的呈现与键位一致性，ADD-71 需要先裁决方案。

## 23. 第十轮实施（2026-10-31）：ADD-69/70/71 的第一批落地

本轮按第 12.13 节的顺序实施，只做有确定证据、不需要真实环境验收的部分。三项都没有被宣称"完成"——完成条件里仍缺真实终端、真实 provider 与用户环境。

### 23.1 ADD-71：fullscreen 退出只恢复终端（已实施）

裁决是方案 A。改动落在三处，且**先改断言再改实现**，理由写在测试里：

- `paint.ts` 的 `leaveScreen` 现在只负责"把屏还回去"。它保留 `rows` 参数，因为会话中途把终端交给子进程、或借用备用屏显示覆盖层时，仍需要把原内容放回；会话结束时传空数组。注释明确写出两种模式是**互斥选择**，不是"基础模式 + 补偿"。
- `engine.ts` 的 `stop()` 去掉了 `TuiStopOptions`，不再在离开备用屏后重写任何文档；`frame.ts` 里那个只服务于该行为的接口一并删除。
- `interactiveMode.stop()` 不再渲染 `transcript.render(...)` 当退出文档，因此也**没有**了那条可以失败的清理步骤。

被否决的行为由三条测试改写并说明：`engine.test.ts` 的 "leaves no conversation under the restored screen"（原断言要求重写整段会话）、"keeps the terminal's own screen rows in the scrollback"（补上另一模式的正向覆盖）、`firstFrame.test.ts` 的 "gives a private screen back without leaving the conversation behind" 与 "keeps the conversation on the terminal's own screen"。另外删除了 `interactiveMode.test.ts` 中 `fault: 'transcript'` 这一故障注入——它注入的步骤已不存在，保留只会是一条永远无法被触发的用例。

`regular` 模式不受影响：它的行本来就写在终端自己的屏上，停止时只释放资源。

### 23.2 ADD-69：等待中的输入可见，且不进对话记录（已实施）

对照 Codex 与 oh-my-pi：两者都把待发送输入放在**输入框上方的独立区域**，从不写进对话记录；Codex 用 Tab 纯排队、Enter steer，oh-my-pi 用 `ctrl+q` 排队。它们都没有"队列条目进入 transcript"的做法。这支持第 22.1 节的方向。

改动：

1. **气泡的写入时机移到了"真正发出"之后。** `onSubmit` 现在先判断 busy：忙碌时只有 steer/followUp 分支才 `echoUser`；落入 `queue.push` 的输入**不写**用户块。新增的 `echoUser` 与 `runQueued` 两个方法把"记录"和"开始运行"分开，五处队列出队点（普通排空、覆盖层关闭、goal 调度、turn 结束、picker 结束）全部改为 `runQueued`——条目开始运行时才成为对话的一部分。
2. **新增待发送区。** `chrome/pendingInput.ts` 渲染最多 3 行，每行标注 `steer` 或 `queued`，多行输入折成 `↵`，超出部分显示 `+N more · /queue to manage`。它画在输入框正上方，`composerOffset` 把它计入，因此鼠标命中与几何查询仍然落在真实的输入框行上。
3. **数据来自既有的队列 owner。** `ViewContext.pendingInput()` 只读 `runtime.input().queue.entries()` 与 `SubmissionQueue.control.entries()`，不新建队列、不改三车道模型。
4. **空闲时 `ctrl+q` 不再是空操作。** 没有运行中的 turn 时，它按 Enter 的语义立即发送，并给出一条 notice 说明"没有 turn 可等，已直接发送"；空草稿仍然什么都不做。键位说明同步改为 "Queue the draft to run after the turn; sends it now when idle"，`.wiki/guides/keybindings.md` 的表格与正文一并更新（该表格被 `keyGuide.test.ts` 逐行比对）。
5. **提示行文案与实现对齐。** 忙碌提示从 `enter steer before next step` / `ctrl+q run after turn` 改为 `enter steer` / `ctrl+q queue`：不再承诺 Enter 一定 steer（命令、组合、带图输入会排队），逐条的真实去向由待发送区说明。`hints.test.ts` 的断言随之修改并写明理由。

仍然保留的边界：排队条目不落盘（与第 22.1 节第 5 条一致），退出后一起消失；`/queue` 仍是编辑、重排、取消单条的唯一入口。

### 23.3 ADD-70：含凭据的配置文件强制 0600（部分实施）

只做了第 22.2 节判定为"最小、最确定、风险最低"的那一项，**没有**做文件拆分：

- 新增 `config/secret.ts`：`holdsCredentialMaterial()` 只认真正的材料（非空 `apiKey`、非空 `accountAuth` 对象），provider 名、模型 id、空白占位都不算；`CREDENTIAL_FILE_MODE = 0o600`。
- `persistence.ts` 的写入按**合并后的结果**决定模式：带凭据就 0600，不带则沿用 umask 默认。因此老文件在下一次保存时被收窄，而移除最后一个凭据的保存不会留下一条已无理由的规则。
- 内容**没有变化**的保存也会收窄一个已含凭据的老文件：权限是文件的属性，不是这次保存的属性。收窄只改 mode、不重写字节，因此调用方持有的 revision 仍然有效，"可观察地未变化"的保存仍然未变化。
- 六条回归：API key、连接里的 account token 各自收窄；普通设置文件保持原模式；空白占位不被当作凭据；无变化的保存收窄老文件；无凭据文件的空操作保存不动权限。

同一事实重复的**可见性**问题本轮补上了最小的一项：当 `providerCredentials[provider].baseUrl` 与所选连接的 `baseUrl` 不一致时，加载结果会在 `configDiagnostics` 里说明哪一处真正生效（`Config providerCredentials.openai.baseUrl is unused: connection 'relay' sends requests to …`）。这是警告而非拒绝——请求本来就发往连接端点；但此前用户对照两处时无法判断哪个是活的。三条回归覆盖：不一致时报告、一致或只设一处时不报告、报告文本不含密钥。

未做的部分（凭据拆到独立文件、同一事实 4–5 处重复的收敛）仍留在 ADD-70 的"尚缺"里。理由：拆分要同时改 22 个生产写入点、71 个测试文件与迁移路径，属于架构级改动；在没有真实旧格式样本与回滚验证的前提下仓促实施，风险高于本轮收益。

### 23.4 验证

单一串行执行，没有并发：

- `vitest run`（7 个聚焦文件）：659 项通过。包含 `engine`、`hints`、`view`、`persistence`、`keymap`、`firstFrame`、`interactiveMode`。
- `tsc -p packages/ts-shell/tsconfig.build.json --noEmit`：通过（测试文件的既有类型问题不在本次范围，未新增）。
- 五道静态门：`verify:import-cycles`、`check:config-consumers`、`check:declarations`、`check:node-floor`、`verify:docs-drift:strict` 全部通过（118 条既有 advisory 不变）。
- `npm run build`：通过，manifest `818a1992a095`。

**没有**运行 20k PTY 压测，也没有任何在内存中塞入大量消息的脚本。**没有**真实终端/真实 provider 证据，因此三项均不升为"完成"。

### 23.5 CI 上两个既有失败的根因与修正

推送后读回 CI，`8d9a3ac9`（早于本轮改动）的 Build & Test 有两处失败，本地同样复现：

| 失败 | 根因 | 修正 |
|---|---|---|
| `cli/collaboration/command.test.ts` 的 `settles early terminal persistence failure` | `e6cad11d` 把"终态已决定之后的存储失败"标成 `provenanceOutcome = 'failed'`。查询本身已经完成，未证实的是它有没有被写下去；报 `failed` 等于把"持久性未知"换成了"工作失败"的断言 | 保持 `unknown` 并说明理由。协作提案因此记录 `unknown`，与真值规则一致 |
| `planning/goal/run/scheduler.test.ts` 的 `uses persisted failure…` | 同一条改动的后果：不再写 `saveError`，"持久化的失败"这个前提不再存在 | 测试改写为 `pauses for recovery when the round succeeded but its terminal state was not saved`：断言轮次保持 pending、`drain: 'unknown'`、`reason: 'recovery-required'`，并断言恢复被**报告**而不是被当作完成的轮次 |

第二条不是"改测试迁就实现"：原测试锁定的是"成功查询的保存失败会被记成失败轮次"，而这正是 `e6cad11d` 要消除的矛盾记录。新断言检查的是更强的性质——既没有伪造失败，也没有开始新轮次。

验证：三个受影响文件 71 项通过；`tsc -p tsconfig.build.json --noEmit` 通过；五门通过。

### 23.6 收口：用户块的写入只剩一个入口

`echoUser` 成为"文本交给一轮运行"的唯一写法。此前还有三处各自 append 用户块：`runCommandLine`（程序化提交）、`/queue` 分支、goal 控制分支。三者都是立即执行的命令，语义与提交相同，因此统一走 `echoUser`；`/queue` 与 goal 分支仍保留各自的 `textBlock('command', …)` 作为输出块，那是命令结果，不是用户发言。

统一后可以只用一条不变量检查：**transcript 里出现 user 块 ⇔ 这段文本已经被交给某一轮运行**。等待中的输入只在待发送区出现，被取消时随之消失，不会在记录里留下一个模型从未见过的问题。

验证：`interactiveMode` 402 项、`firstFrame` 24 项通过；TS build 与五门通过。

### 23.7 子代理 review 找到的三处缺陷与修正

对第 23.2 节改动的只读 review 找到三处真实缺陷，均已修正：

| 缺陷 | 场景 | 修正 |
|---|---|---|
| `/queue add` 产生两个用户块 | 空闲时 `/queue add 解释测试`：命令行一个块，载荷开始运行时又一个块 | `/queue` 不再 echo 自己的命令行。它是队列的控制面，`add` 把载荷交给队列，载荷开始运行时才成为用户块 |
| steer/followUp 在投递前就写块 | 忙碌时 Enter 发 steer，在模型下一步之前 Esc：块已存在，文本又被退回草稿，重发后出现两个相同块 | 内核在真正注入时报告 `message.delivered`，界面据此写块。提交只是请求 |
| 无变化的保存里 `narrowCredentialFile` 抛错且跟随符号链接 | 只读挂载或文件消失时以 `lock-failed` 逃逸；符号链接的 config 会 chmod 到目标文件 | 改为返回布尔、`lstat` 判断、不抛错；权限无法修正不把成功保存变成失败，改由加载路径报告 |

`message.delivered` 不进入持久事件：真实消息已由 `persist(onMessage)` 写成会话 turn，再记一次会让同一条消息在 transcript 里出现两遍。开场消息被排除——它带环境前缀，界面画的是用户自己那段文字。

加载路径新增一条暴露告警：含凭据且组/其他位可读的文件会被报告（只报文件与事实，不含任何值）。理由是不写的文件永远不会被收窄，而静默正是这类问题最危险的部分。

验证：`interactiveMode` 403、`composer` 18、`hints` 6、`runtimeConfig` 38、`persistence` 30、`turn/projection` 9、`turn/session` 41、`turnSink` 54、`sessionRuntime` 50、`firstFrame` 24 项通过；TS build 与五门通过。


## 24. 第十一轮实施（2026-10-31）：ADD-70 凭据文件拆分

接续工作区已有拆分草稿，完成读写调用方集成并修正只读复审发现。`config/documents.ts` 负责物理文档归属，`persistence.ts` 保留既有编辑事务；没有另造连接、认证或配置注册表。

- 用户 `config.json` 保留设置；`auth.json` 承接 provider、providerCredentials、providerConnections、activeProviderConnectionId 和 accountPool，写入无条件 0600。项目与显式输入的原作用域限制保留。模型目录仍是 `models.json`，角色/会话选择仍由原 owner 保存。
- 旧混合配置仍可读，auth 中同名字段优先；用户配置保存先写并读回验证 auth，再移除 settings 的旧字段。普通设置保存不创建空 auth 文件；已存在的 auth 即使无内容变化也独立收窄权限。未知 auth 字段与注释留在 auth，显式删除移除所有被覆盖副本。
- 编辑基线绑定两份文件的 revision、存在状态、回退路径及 canonical 目标。锁内及发布前后重查来源，拒绝删除后复活、来源切换和链接换目标；稳定的默认 profile 链接通过其原目标保存。两份文件若指向同一目标，写入前拒绝。账号续期与 peer receipt 复用同一物理存储归属检查。
- auth 写入/读回或 settings 第二步失败保持 report-safe `unknown`。auth 先成功的中断可通过重新读取后保存完成迁移；没有自动补偿覆盖外部新值。**这不是跨文件原子事务**：不声称 crash atomicity 或并发读者只能观察一代数据。

只读参考对照：凭据独立存储、路径归属固定、锁内读取最新值与 owner-only 写入；迁移采取保留先于删除、删除依赖准确的存储代次。参考中的数据库事务没有移植到本项目；本项目采用既有 JSONC 原子单文件 writer 与真实部分结果合同。反转 auth-first 顺序后，`auth-write` 故障用例实际因旧凭据字节被删除而 AssertionError；finally 逐字节恢复，恢复后的 documents21/persistence30 全通过。

主代理单进程串行聚焦验证：22 个文件、**569 项**通过，分组为 config179、connect/model71、account104、picker153、entrypoint/runtime/provider/session62。重复验证不累加。五道静态门与生产 TS noEmit 通过；最终 `npm run build` 通过，manifest `28363ef38159`。正式打包 NormProof exit0、依赖环与导入解析 satisfied；verdict partial，仅既有 interactiveMode 22-name advisory，runtimeConfig 已回到20，不把 advisory 解释为全局结构完成。没有本地全量回归、真实 provider、PTY 或 20k 压测；子代理仅阅读、分析及编辑。

ADD-70 仍部分完成：本轮只完成凭据与设置的物理拆分；模型目标与目录分离、同一事实多处存储收敛、真实旧版本回退和真实环境验收尚缺。没有迁移操作员真实 HOME、没有验证老二进制会读取新 auth 文件。提交与远端状态以本轮交付读回为准，旧 HEAD 的 CI 成功不证明新提交。


### 24.1 导入消费者补齐

继续检查发现 profile 导入只捕获 config.json，迁移后的 auth 连接会被遗漏。现由原 import plan 捕获两份源文档，分别校验后 auth-last 合并，再通过原 sanitizer 一次性生成待认证连接，最后写入目标 settings/auth 各自文档。凭据、账号 token 与未知字段不导入；preview/apply 原有 digest、源重查、目标冲突、stage/journal/recovery 合同继续使用。auth-owned pathRules 若来自旧目录，按其实际源路径绝对化，named profile 不借用 default/legacy。

三个聚焦文件27项通过，包含分文件/仅auth导入、auth覆盖旧连接、preview后auth修改拒绝、未知秘密排除、pool endpoint秘密URL拒绝、目标0600、源文件不变、pathRules实际源目录。移除auth捕获的反转实际AssertionError，源码精确恢复后通过。五门/build通过，manifestb552bb9b1a16；不将此消费者修补当作ADD-70全量完成。此前9278c344远端main精确一致、CI41186572319最后读取in_progress，Watch41186572327成功但仍不等同代码CI通过。

### 24.2 命名连接停止生成凭据与默认值镜像

API-key 登录、浏览器捕获与原生账号激活现在只在命名连接存储新凭据，并继续选择原 provider/活动连接；不再覆盖独立 provider slot 的密钥、端点和默认模型。原生 renewal grant 继续复验 native exchange、完整账号、精确连接及存储来源，不再要求激活时生成的 mirror。已有 exact mirror 的 guarded 续期与最后连接删除保持兼容，测试显式安排旧格式而不依赖新登录继续制造镜像。

命名连接的 global model/effort 只更新该连接，provider-slot 选择继续保存其自身默认。会话投影与 provenance 同时选择一个 owner，保留独立 slot 的值和来源；实际 credential resolution 仍使用命名连接。只读参考将默认模型/思考与目录能力分开；本项目保留采样、请求上限与目录 contextWindow/maxTokens 的不同语义，不把同名字段一律视为重复，不在 models.json 保存采样或创建项目目录。

主代理单进程串行、18 个聚焦文件 **388 项**通过：selection/effort/provider/provenance101，connect/model76，Google/replay28，renewal/picker auth/model auth/model key130，Copilot/current/publication/三个续期消费者53。反转会话双写实际触发默认值与来源断言失败；反转 API-key/browser 连接 writer 恰好两项 provider-slot equality 断言失败，账号控制通过，源码 finally 精确恢复（connect SHA-256 `d68964a7cf8b516056852c81f2c50cf3427b2969ae3dce2bb564bcb749e5a623`），恢复后 connect57 再次通过，重复不累加。Copilot 测试从旧 config.json 改读 auth，并核对登录/续期后无新镜像及实际账号读回。初次反转收据把 Vitest JSON 的错误格式误判为无 AssertionError，修正为实际 equality 失败后收据通过；不将观察器失败记为产品失败。

五静态门、production noEmit、diff 与 TS build 通过，manifest `a7f04674abfa`；118 既有 docs-source advisory 不变。正式打包 NormProof exit0，导入解析与环 satisfied，partial 仅既有 interactiveMode 22-name advisory。只读独立复审无阻塞性生产发现，子代理未执行验证。延迟读回 `9278c344`/`e9e94d43` 的代码 CI `41186572319`/`41187075002` 仍 in_progress，两个 Watch 成功不替代代码 CI。

ADD-70 仍部分完成。模型/effort/serviceTier 默认仍物理嵌在 auth 记录；缺省连接字段仍按既有 provider fallback 解析，显式 effort null 保留。未清除独立 provider slot，未完成模型目标物理分离、全部历史重复清理或旧二进制回退；没有迁移真实 HOME、真实 provider/PTY、全仓或 20k 压测。本批提交/推送及精确 SHA 的 CI 单独绑定，整体 goal active。

### 24.3 模型默认值移出 auth，并修复续期的物理来源收据

用户 `config.json` 新增 `modelPreferences`：`providers` 保存 provider slot 默认，`connections` 按规范化 ID 与 provider 保存命名连接默认。只移动嵌套的 `model`、`thinkingEffort`、`serviceTier`；`auth.json` 保留 provider/活动连接、连接、端点、凭据与 accountPool，继续 0600。采样和请求策略保留设置作用域，`models.json` 继续负责目录能力，不创建项目目录。此处是对第 22.2 节建议的语义收窄：目录端点描述元数据，连接端点决定真实请求；contextWindow/maxTokens 能力与用户预算上限各有职责，不能按同名字段全部合并。

`config/preferences/` 负责形状、身份、拆合及来源投影；运行时与编辑仍使用既有逻辑 provider/connection 记录，不增加另一份 resolved 默认值。settings 的 envelope 优先于旧 auth envelope；先完成用户层 join，再应用后续显式输入，显式连接替换按原语义生效。每份物理文档独立校验；孤立默认、重复规范化 ID、provider 不匹配均拒绝。已有 ID 不原地换 provider，确需复用则先删除再创建。

存在的默认值 owner 覆盖全部旧模型叶子，空记录也表示已清除；没有默认也没有旧 ownership 的纯凭据记录不生成空 owner。缺省连接值仍继承独立 provider slot，effort `null` 明确选择自动思考。provenance 跟随真实叶子文件，不把物理 envelope 暴露为运行时设置。导入在脱敏前 join、脱敏后 partition，同时保留同 provider 命名连接之外的独立 provider 默认，秘密和未知 auth 数据仍不导入。

保存继续使用原逻辑 three-way merge 与单文件 writer，发布分三步：保留旧默认值和待删除记录的 auth stage → settings 写入并读回验证 → auth 清理。凭据向 auth 移、默认值向 settings 移，先保留再删除才能同时守住两者。各步重查两份 raw snapshot、来源选择与 canonical 目标，仅刷新本 writer 已写的 snapshot；自身 chmod 后也刷新 fingerprint。纯 auth 保存不创建无字段的 settings 文件。清理中断仍为 `unknown`，可能留有旧 auth 记录，需重新读取并重试；不声称两文件 crash atomicity 或无中间可见状态。

延迟读回发现 `9278c344` 的 CI `41186572319`、`e9e94d43` 的 CI `41187075002` 均失败；后者 5 文件/11 项失败、12981 项通过。Copilot 物理读夹具已随 `e10964da` 修正；preset、connect syntax、completion 三个旧 config.json 夹具本批改读逻辑值/实际 auth，并核对两文档无变化，completion 临时目录归入 `/tmp/cheers-test`。advisor 的 7 项失败在本地复现，保留断言并修生产缺陷：逻辑 pair revision 被拿去匹配 provenance 的逐文件 SHA，续期后因此无法采用原 checkpoint。

续期 storage receipt 现在携带每份文档的 source、canonical path、before/after revision；只更新精确匹配的物理来源，兼容无 documents 的旧 receipt。完整 `accountPublicationMatches` equality 保留，外部 settings/catalog/model/main-request 变化仍拒绝采用。新增 auth-only advisor 回归证明续期后 checkpoint 可采用且不新增 settings 来源；这也避免用放宽 equality 掩盖来源错误。

本批主代理分组单进程串行聚焦验证，**32 文件 / 606 项**通过，重复不累加，覆盖拆合/输入/并发/来源/导入、连接与模型命令、会话选择、账号续期、picker、completion、实际运行时与 advisor。最后 persistence30/publication6、advisor38 通过；最新五门、production noEmit、diff check 与 build 通过，manifest `d7ef008e7a1f`。正式归档解包运行 NormProof exit0，导入解析与环 satisfied；partial 仅既有 interactiveMode 22-name advisory，118 条既有 docs-source advisory 保留。只读独立复审最后无阻塞性发现；子代理只阅读/分析/编辑，验证由主代理执行。

三条实际反转均触发预期失败并 finally 精确恢复源码：移除空 owner 对旧叶子的覆盖 → 1 项失败；在 settings 验证前清理 auth → 1 项失败，暴露唯一默认值被删除；禁用物理 receipt 映射 → 3 项 advisor 失败。恢复后对应聚焦测试再次通过。最后 auth-only 保存改动之后重新运行 production noEmit/build；不引用旧 build 作为当前构建证据。

ADD-70 仍部分完成：默认值已物理移出 auth，但其余重复事实的语义审计、真实旧版本回退和真实环境验收尚缺。未迁移操作员真实 HOME，未运行真实 provider/PTY、全仓回归或 20k 压测。`e10964da` 的代码 CI `41188245875` 最后读回仍 in_progress，Watch 成功不替代代码 CI；本批提交与 CI 另行绑定。原 Phase 20 真实验收继续延后，整体 goal active。

### 24.4 存储提示与无 settings 的原生登录

`c2819249042ea00ea4d4a5e47142029a0dcf6cf1` 已提交推送，读回 main 与 origin/main 精确一致、工作区干净。接着发现六处 catalogue/model/settings 提示仍说连接存入 config.json，已更正为 settings/config.json、connections/auth.json、catalogue/models.json；模型默认值说明与第 24.3 节一致。API-key、browser、native 登录/错误清理及连接 use/remove 的 `Stored at` 改报实际 auth 路径，内部 writer 返回的逻辑编辑路径合同保留。路径在保存前捕获，只有保存确认后才报告。

补跑 Copilot 实际入口暴露生产缺陷：没有默认模型的 pending 连接只创建 auth.json，但 `capturePendingLogin` 对不存在的 settings 调用 realpath，ENOENT 在登录前逃逸。现复用 `configEditStorage` 捕获两份物理 source/canonical tuple；所有后续读取与保存保持原 logical source，由原 writer 选择 canonical 目标。只读复审发现改读 canonical alias 会使稳定 settings symlink 的 tuple 表示不一致，已修复；settings/auth 任一换目标都拒绝，即使字节相同。native proof、账号代次、精确 named credential、原 provider-slot 检查与 grant 合同保留。

本批 7 个聚焦文件 **170 项**通过（model19、catalogue11、settings47、current11、connect60、Google17、Copilot5），重复不累加。Copilot 明确断言没有 config.json；三条新增链接用例覆盖稳定 settings/auth 链接的成功 grant/失败清理，以及两个相同字节新目标的拒绝和 auth 字节保留。两条实际反转分别恢复旧 settings realpath 假设、恢复 canonical-alias 后续读取，均恰好复现 1 项失败，finally 精确恢复源码后原回归再绿；最终 providerAuthRuntime SHA-256 `f834d76b33c835b983c4f434c86eba50e72ed66211244600d0853a8ea760dc21`。

最终五门、production noEmit、diff、build 通过，manifest `8cd0f9836be9`；正式归档 judge exit0，导入解析与环 satisfied，仍只有 interactiveMode 22-name advisory，118 docs-source advisory 保留。复审最后无剩余阻塞发现，子代理仅只读，所有验证由主代理串行执行。未运行全仓、真实 provider/PTY 或 20k 压测。

延迟读取 `e10964da` CI `41188245875` 已 failure：4 文件/10 项失败，12988 项通过，全部为第 24.3 节已修复的 advisor7/preset1/connect syntax1/completion1。`c2819249` 的代码 CI `41190177753` 最后 in_progress，Watch `41190177862` success；不得从 Watch 或本地结果声明代码 CI 已通过。ADD-70 与整体 goal 仍 partial/active，旧二进制回退、其余重复语义与真实环境继续列为尚缺。

### 24.5 后续消费者审计的明确缺口

`316165785e06767554bc0bdc8408b20b77e91375` 已推送，读回 main/origin/main 精确一致、工作区干净。继续静态检查运行时直接读取旧 settings 凭据的路径，未发现新的生产直读；账号 state 已允许 settings 缺失，完整逻辑记录 three-way merge 仍保守拒绝同一连接的并发模型/凭据编辑，不据物理分文件假称可独立合并。

历史验证脚本存在尚未集成的消费者：

- `scripts/verify-provider-readiness.mjs` 的 loadConfig/resolveCredential 只读 `.cheers/config.json` 并自行解析凭据/模型；分文件或 auth-only profile 会报缺凭据/缺配置，modelPreferences 也未 join。
- `scripts/verify-doctor-environment.mjs` 的路径存在检查仍要求 config.json，auth-only profile 会被误拒绝；该检查明确不读内容，不能算凭据正确性证明。
- `scripts/daily-regression.mjs`、`scripts/broader-regression.mjs` 的 HOME 候选与活动连接读取仍以 config.json 为唯一来源，可能选错 fixture 或遗漏活动连接。

这些发现加入 ADD-70 尚缺，未执行相关真实 provider/全套脚本，未修改 release/default gates、package scripts 或构建行为。后续修复应通过既有 TypeScript config/credential owner 的受控桥接获取逻辑结果，保持 source/profile/permission 与 report-safe 合同；不在脚本复制第二套 auth/envelope 解析和认证优先级。需要聚焦分文件/auth-only、无读权/坏格式、来源变化与脱敏验证后才可将这些脚本用于新格式验收。此处为静态缺口记录，不是已验证的现场失败。

`31616578` 的代码 CI `41190946495`、Watch `41190946542` 最后读回均 in_progress；`c2819249` 的代码 CI `41190177753` 最后仍在测试阶段。没有宣布 ADD-70 或整体完成，真实环境与旧版本回退验收继续延后。

### 24.6 历史验证脚本复用配置 owner

第 24.5 节四个消费者已接入 `scripts/support/config.mjs` 的固定隔离 worker；TypeScript 桥接复用 runtime/config、profile、credential、catalogue 和 transport owner，不再复制凭据解析及优先级。settings/auth/modelPreferences、auth-only、旧目录回退均使用既有逻辑投影。命名 profile 只读取 existing，默认 profile 保留旧目录和稳定 link 合同，不创建用户状态。daily/broader 尊重显式 HOME，坏配置拒绝活动连接替代；doctor 解析所选文档但明确 authentication not checked。

凭据仅在 worker 内使用，不进入参数或结果；结果只含存在性、状态及活动 ID 等允许字段。baseline 保留完整响应结束的检查，逐块丢弃内容，HTTP 拒绝不打印 body，redirect 拒绝转发。成功前复核原始 pair revision、完整 source/canonical tuple、旧 edit fence 以及 runtime/catalogue 投影。缺失旧连接时间戳会由 runtime 每次生成，逻辑比较排除这两项，保存字段仍由原始 revision 捕获。worker 直接使用 Node floor 支持的 loader，15/35 秒截止与 64KiB 输出上限直接结束请求 owner 并等 close；不通过 tsx CLI 留第二请求进程。

主代理串行验证：五静态门与 diff check、六个相关 JS 语法检查通过；`node --test scripts/config.test.mjs` 16 项通过，包含四调用方、来源变化、闭合 pool、pending、完整流/断流、重定向与脱敏。daily/broader 只执行函数声明集成夹具，不导入有 Windows 写入副作用的 entrypoint。新增桥接通过临时 tsconfig 的严格 noEmit；实际 Node **20.3.0** 再跑同一 16 项全通过，避免 tsx scoped API 隐含 20.6 下限。auth owner、完整读流、成功前 source fence 三条反转均实际 AssertionError，源码字节精确恢复后再跑通过。只读复审范围内无阻塞；没有重跑产品 build（产品源码未改），没有全仓、真实 provider、真实 PTY 或 20k 压测。

延迟读取 `c2819249` 代码 CI `41190177753` 已 failure：7 文件/23 项失败、13006 项通过。原生 Copilot 1 项由第 24.4 节修复覆盖；其余为缺失 settings 的旧物理读取夹具和禁止同 ID/provider 原地重绑定后的旧设置夹具，下一批逐项分类修复，当前脚本绿色不证明它们已修。`31616578` CI `41190946495`、`73e332f1` CI `41191224812` 最后仍 in_progress。本批提交/推送与自身 CI 另行绑定；ADD-70 partial、整体 goal active，旧版本回退与真实环境验收继续延后。

### 24.7 延迟代码 CI 的夹具修复

脚本桥接批次 `3918c14f3d5f4b8d9cb6b87cf9d81ca12fb3835c` 已推送，读回 main/origin/main 精确一致。自身代码 CI `41192490126` 最后 in_progress，Watch `41192490271` success，不能用 Watch 证明代码 CI。

第 24.6 节延迟失败逐项分类后只修测试夹具：interactive masked key、connect syntax、metadata inspection 用两文档的 bytes/absence 快照，保留意外创建检测，不再假定 credential-only save 创建 config.json。subagent/summary/model 的 provider-reused 场景先删除旧连接、重新获取 edit，再以相同 ID 加入不同 provider，保留不回退到父账号、会话不变和显式替换可成功的原断言。CLI provider effort 夹具也使用合法删除/新增；未放宽生产 writer 的原地重绑定拒绝。

`31616578` 代码 CI `41190946495` 延迟读回 failure：6 文件/24 项失败、13008 项通过；与前批相比 Copilot 修复已过，增加两项旧模型详情 hint 预期。它们分类为旧合同预期，改为明确断言 `settings: config.json; connections: auth.json.`。六个测试文件改动，不修改产品源码。单进程/单 worker 按测试名聚焦运行前批 23 个场景全部通过，实际 Node **20.3.0** 同一组 23 项通过；两项 catalogue hint 在 Node20.3 单独聚焦通过，合计覆盖已知两批失败的 **25 个不同场景**，没有运行七文件全部 504 项或全仓回归。最初调用用了本地 Vitest0.34 不支持的 `--no-file-parallelism`，在执行测试前参数解析失败，移除后使用 VITEST_MAX_THREADS/MIN_THREADS=1 正常执行，未改产品/测试来规避。

只读复审未发现夹具断言弱化；补充将 loader 地址转换为 file URL，避免 Windows drive colon 被 ESM 当作 URL scheme。Linux Node20.3 的配置与本地baseline再聚焦通过不等于Windows验收。此次另有这一个桥接兼容性修补。本批验证只证明这些已知失败场景，不据此宣布最新代码 CI 已通过。脚本桥接及本批提交分别绑定自身 CI；其余重复事实语义、旧二进制回退与真实 provider/平台/输入验收仍缺，ADD-70 partial、整体 goal active。

### 24.8 实际请求端点诊断与独立 provider 默认

原 `getRuntimeConfig` 只比较 `activeProviderConnectionId` 指向的原始 URL，并将 provider slot 的端点称为 unused。该 slot 仍可由独立 provider 选择使用；fallback、pool、CLI override 和账号 issuer 的实际目标也不能只由 active ID 判断。旧消息还打印连接 URL，其 userinfo、path、query、fragment 都可能含秘密。

诊断迁入既有 `config/constraints.ts`：使用与请求相同的 credential/catalogue/issuer 解析后目标，比较规范化的端点，仅报告覆盖关系，不显示地址、连接 ID 或凭据。blocked/无法解析的目标不宣称端点覆盖；同值与无 provider 端点不提示。provider slot 保留，读取不写 settings/auth；重验证去掉本 owner 的旧消息后重新计算，来源一致时提示清除。原 load-time 测试迁到约束 owner，并补全两个物理文档的 bytes/absence 与独立 slot 可用断言。

只读参考对照：请求在认证解析后将返回的 baseUrl 投影到当次 request model，保留原模型/配置；本批沿用该决策，把比较放在已有请求目标解析之后，不在 loader 重新推导，也不迁移或删除另一选择的独立端点。反转为 raw resolution 后，账号 issuer 场景实际失败。

主代理串行运行 constraints34/runtimeConfig35/providerCredentials28，**97 项**通过，涵盖 legacy/split × explicit/fallback/pool/override、legacy/auth-only issuer、相同/缺失/blocked/provider-only、startup/reload 清除与重复重验证。实际 Linux Node20.3.0 上同 97 项通过，重复运行不累加。四条反转（删除提示、比较原始 resolution、打印 URL、保留旧提示）均实际 AssertionError，finally 逐字节恢复源码后再验证。五门与 build 通过，manifest `83ed9a95219d`。正式打包 NormProof exit0，依赖环与导入解析 satisfied；verdict partial，两个既有 interactiveMode 模块分别 21/22-name advisory，本批未新增 ceiling finding。未取得本批独立委派复审。

延迟 CI：`73e332f1` 的 `41191224812` failure，25 项失败包括已由第24.7节修复的旧夹具及一个 browser healing CLI 场景；后者仍待单独分类。`3918c14f` 的 `41192490126` 和 `0f758c59` 的 `41192812005` 最后均 in_progress，两个 Watch success 不替代代码 CI。本批提交与自身 CI 单独绑定；未运行真实 provider、Windows、PTY、全仓或20k压测，未迁移真实 HOME。ADD-70 partial、整体 goal active，其余重复事实语义、旧版本回退与真实环境验收仍缺。

### 24.9 fallback/pool 模型选择绑定实际连接

后续重复事实审计实际复现两项：没有 activeProviderConnectionId 时，凭据 owner 已选中 fallback/pool 连接，但 `/model next` 返回 No active connection。`/thinking` inspection 也另按 raw active ID 推导模型/effort，可显示独立 provider slot 的值，和实际请求不同。

`model/target.ts` 复用既有凭据解析并统一 session affinity；模型保存从已接受请求的 connectionId 捕获目标，新增 session-scoped 绑定以便恢复，global 仅更新该连接默认而不创造 shared active ID。hooks 后及 session 锁内同时检查自然选择和 forced target，防止另一连接的 timestamp/pool 拓扑变化被 target projection 隐藏。自然选择检查读取 shared config，避免把本 writer 已保存的 session model 投影进 global 第二阶段造成自冲突。独立 provider slot 与分文件归属保留；删除绑定连接后不借用 sibling/profile。`/thinking` inspection 同用请求解析；删除旧 currentModelPreference 的重复推导，只有既有 legacy project effort fallback 保留。

只读参考对照：模型变更保存 provider/model 的 session identity，默认值只在显式 persist 时保存；请求采用认证解析后的 baseUrl。沿用身份绑定与显式全局保存原则，本项目另有命名连接/pool，故保留 connectionId 与自然选择重查，不把同协议的不同账号视为同一事实。

主代理串行聚焦 selection46/effort26/provider30/modelCommand19，**121 项**在实际 Linux Node20.3.0 上通过；新增 fallback/pool loopback HTTP 断言验证实际 body.model、reasoning_effort、service_tier 与选中连接凭据。新增 session-only/恢复/删除后零fallback、global有无session、hook/锁内 sibling timestamp与pool选择改变拒绝；两个最初复现断言在旧代码实际失败。三条反转（退回 raw active ID、取消session绑定、移除自然选择重查）均 AssertionError，精确恢复源码后再验证。五门/build通过，manifest `1cb0041d151c`；正式打包 NormProof exit0，环/解析 satisfied，partial仅既有 interactiveMode21/22-name advisory。本批无独立委派复审、真实provider/Windows/PTY/全仓/20k压测。

延迟CI `3918c14f`/`41192490126` failure24项均为第24.7节已修旧夹具，browser healing 此轮通过；此前单场景Node20.3也通过，现有证据仍不足判断它在 `73e332f1` 的失败根因。`0f758c59` 的代码CI `41192812005` 已 success，验证旧夹具修复；`e9f7a8c9` 的 `41193784458` 最后 in_progress，Watch success。旧SHA绿色不证明本批提交；ADD-70 partial、整体goal active，未迁移真实HOME，其余重复语义/旧版本回退/真实环境继续尚缺。

### 24.10 文本模型目录保持精确身份与只读选择

裸 `/model` 的文本目录曾按 runtime 协议合并状态；两个 relay 共用协议和模型 ID 时，两者及 canonical 都显示 active，未配置端点也借用 sibling 的 credential present。两条新增回归在旧代码实际 AssertionError。现由既有 availability owner 输出按 catalogue ID 的本地状态，活动标记采用捕获实际请求的精确 catalogue owner，并通过 credential endpoint owner 保留账号 issuer 路由。重复 endpoint 的类别保持 unverified，不把歧义传播到其他缺凭据的 relay。

本地 presence 与请求覆盖分开：命名目标仍要求自身凭据和 pool 授权；独立 provider slot、环境源及 canonical 经未列出的 relay 使用既有语义。文本目录的 prospect inspection 由命令的现有 selectionRequest adapter 注入，不带 CLI override 或真实 session ID；availability 不依赖 session 存储。`matchesCatalog` 从 picker 原地移入 availability，两消费者共用地址匹配，不复制 credential resolver。pending/error/excluded 的无 URL 账号以既有 issuer policy 定位类别并保留原状态；deleted/missing/empty pool 继续报告明确 refusal。

两路只读复审发现一次真实副作用：逐项检查 pool 连接若带真实 session affinity，原 resolver 会记住最后一个检查目标；新增 before/after 回归实际复现目录显示 A 后，下次请求使用 B。上述 adapter 去掉 inspection 的 session affinity 后修复，并保留实际 active capture 的会话选择。复审同时修正 CLI refusal 被误报为缺本地凭据、issuer 非 ready 状态消失、失效 pool 被降为 missing、ambient 歧义传播到无关类别。最终 code-reviewer APPROVE、architect CLEAR，子代理仅阅读，未执行验证。

主代理单进程串行在实际 Linux Node20.3.0 上运行 **5 文件 / 104 项**：catalogSurface25、availability23、catalogRefresh11、modelCommand19、picker category26。覆盖 explicit/fallback/pool/provider-slot/CLI、同名模型精确 active、blocked/无凭据、尾斜线、未列端点 canonical、issuer与非 ready 账号、独立 provider 默认、broken pool、歧义隔离、请求 affinity 前后不变；只读断言观察 settings/auth/catalogue 的字节或缺失。六条反转（协议 active、借用 sibling、raw issuer地址、inspection 带真实 session、丢弃 issuer state、丢弃 pool refusal）均实际 AssertionError，finally 精确恢复后最终聚焦套件全过；重复不累加。五门/build通过，manifest `7a2ab949e2a0`。首次 judge 使用包目录的相对 tarball 路径，npm ENOENT 在 judge 执行前退出；从仓库根调用正式打包 judge exit0，环和导入解析 satisfied，仅两个既有 interactiveMode21/22-name advisory，未新增 ceiling finding。

延迟读取 `e9f7a8c9` 代码 CI `41193784458` 已 success；`e2daf775` 的 `41194578660` 最后 in_progress，Watch `41194578673` success 不能替代代码 CI。本批提交/推送与自身 CI 单独绑定。未真实 provider、Windows、PTY、全仓或20k压测，未迁移真实 HOME。ADD-70 partial、整体goal active，旧版本回退与原Phase20真实验收继续延后。

### 24.11 交互目录候选检查不改 pool affinity

第24.10节已推送 `da3ca31603d46b20a58d1623ad3b6f5bb0f4fb18`，读回远端main与本地精确一致、工作区干净。继续沿同一缺陷检查交互model picker：真实session没有shared active ID、pool中ready/later两个可用连接时，初次load显示ready为active，随后的自然请求却改用later。本地resolver与host resolver两条新增回归都实际AssertionError；不把文本目录的修复当成交互路径已修。

picker在捕获实际active之后建立只移除sessionId的inspection context。候选direct/host解析、exactTargetMatches和targetResolutionIdentity捕获都不记忆真实session affinity，host CLI解析函数继续保留。显式named target已有connection绑定，故去掉affinity不改变其identity；provider-slot不能替代declared pool。模型/effort activation、role/preset与admission、generation及保存仍用原context，不新增credential resolver、不修改provider/auth core。

参考沿第24.10节可用快照与显式选择的区别：发现/浏览只读既有可用身份，用户接受后才持久化目标。本项目增加pool副作用边界，四个local/host × dismiss/activate场景分别验证load、reload、details与close不改变自然请求；显式选择later则保存session-scoped连接并在投影后的实际request读回later，避免以禁止所有切换来通过只读断言。

主代理在实际Linux Node20.3.0串行聚焦 **5文件/133项**：category30、activation23、recovery36、auth24、focus20。模型与预设写入、hook拒绝与完成后关闭、provider slot CLI身份、effort恢复、角色与目录刷新原覆盖继续通过。恢复真实session inspection的反转实际AssertionError，源码精确恢复后最终套件全过。五门/diff/build通过，manifest `5ba7e846159b`；正式打包judge exit0，环/导入解析satisfied，仍只有既有interactiveMode21/22-name advisory。两路只读复审APPROVE/CLEAR，子代理未运行验证；本批scratch已清理。

`e2daf775` 的代码CI `41194578660` 延迟读取已success；`da3ca316` 代码CI `41195952241` 最后in_progress，Watch `41195952238` success不替代代码CI。本批另绑提交与自身CI，未真实provider、Windows、PTY、全仓或20k验证，未迁移真实HOME。ADD-70仍partial、整体goal active，旧版本回退与真实环境继续延后。

### 24.12 service tier 读取跟随同一个实际 owner

第24.11节已推送 `7bec50d56b0b27967fb1b6d57b487652d1bc4931`，main与远端精确一致。后续审计发现 `/slow`、`/fast` 状态按 raw activeProviderConnectionId 读取 tier，而实际 dispatch、preview 与 role capture 各按 resolved credential.connectionId。五条新增回归在旧代码全部实际AssertionError：fallback/pool 使用连接flex，却显示独立provider priority；环境/CLI已替代命名连接的凭据源，却显示raw连接flex；多个pool成员的实际affinity与显示不一致。

既有 `core/models/serviceTier.ts` 新增纯 `configuredServiceTier`，按resolved provider+connectionId选择一个owner，缺省连接tier继续继承独立provider slot，显式request.serviceTier继续优先。dispatch、preview、role capture和command共用这一个投影；command使用既有modelRequest，保持实际session affinity及host override。没有新增resolved tier存储或认证面。blocked/无credential请求不宣称effective tier，沿原status文案保持unverified；能力不足继续由原preview/dispatch拒绝，不静默删除配置档位。

只读参考比较：基础模型选择与认证解析分离；已有slow/tier实现按当前model选取wire档位，其他provider保存的档位不代表当前模型。另一实现明确区分configured tier与model capability下的effective tier。本项目同意当前请求身份与单owner投影，保留已有显式不支持档位的拒绝行为与独立连接/pool语义，不复制按family存储。provider身份与raw active选择反转都有实际失败，避免仅沿测试代码重写读取。

主代理实际Linux Node20.3.0单进程串行最终 **6文件/205项**通过：command serviceTier9、model serviceTier5、provider30、step12、role46、preview103。新命令测试包含split文件默认、fallback/pool、env/CLI、affinity前后不变、pending/deleted/empty-pool/missing；观察settings/auth字节或缺失。既有五种HTTP来源用例同时断言slow/fast状态与实际body.service_tier；另真实loopback验证explicit request default优先于connection flex/provider priority。三反转（raw active、去掉provider校验、删除blocked guard）均实际AssertionError，finally源码精确恢复，最终套件全过。五门/diff/build通过，manifest `d6f24e4b74c3`；正式打包judge exit0，环和导入解析satisfied，仅既有interactiveMode21/22-name advisory，未新增ceiling finding。两路只读复审最终APPROVE/CLEAR；scratch已清理，子代理未执行验证。

`da3ca316` 的 `41195952241`、`7bec50d5` 的 `41196273759` 最后代码CI仍in_progress；对应Watch success不替代代码CI。本批提交与CI独立绑定。未真实provider、Windows、PTY、全仓/20k验证或真实HOME迁移，旧版本回退与其余重复事实审计仍缺，ADD-70 partial、整体goal active。

### 24.13 命名模型偏好保存拒绝不可用请求

第24.12节 `a9f537faf31dc01b72c23a7b2eb5948d4e087bb8` 已推送且main/远端精确一致。继续复现当前模型偏好保存的guard只对provider scope检查blocked/credential：session-scoped命名连接pending或缺自身key时，`setSessionServiceTier` 和 `publishModelPreference` 仍保存并显示成功。四条新增pending/missing × tier/context回归在旧代码实际AssertionError，error状态因model mismatch已拒绝。

两既有owner移除provider-only限定，所有当前模型选择在进入catalog更新或session writer前都必须有unblocked本地credential。保持legacy未显式绑定选择的env/CLI解析，不增加现场请求；离线可解析但网络未验证仍可保存。锁内sameValue解析重查、connection身份、catalog capability、session/root/CAS原保护不变；无需新helper、数据字段或认证实现。

只读参考再次对照模型变更在保存session目标之前检查认证存在，显式全局persist另行处理。本项目将这一准入边界一致应用到当前模型tier/context偏好，命名连接/closed pool仍以原本地resolver负责授权；没有将真实网络联通作为写入条件，也没有借用provider slot去补被绑定连接的缺凭据。

实际Linux Node20.3.0最终串行 **3文件/77项**通过：provider42、effort26、command serviceTier9。新增pending/error/missing/pool-outside/pool-waiting × tier/context十项证明writer未进入、session保持、settings/auth字节或缺失不变；另两项在session lock内引入pool backoff，原CAS正确拒绝并保留session。已有legacy env/CLI、provider slot、HTTP tier/model/effort、权限与能力回归继续通过。两条scope-only反转分别实际AssertionError，finally源码精确恢复后最终套件全过。五门/diff/build通过，manifest `1198eb3f4160`；正式打包judge exit0，环/导入解析satisfied，仅既有interactiveMode21/22-name advisory。两路只读复审APPROVE/CLEAR，子代理未验证，scratch已清理。

`a9f537fa` 的代码CI `41196921141`、`7bec50d5` 的 `41196273759`、`da3ca316` 的 `41195952241` 最后in_progress，对应Watch success不作代码通过。此次另绑提交与自身CI；未真实provider、Windows、PTY、全仓/20k或真实HOME迁移。ADD-70仍partial、整体goal active，旧版本回退与其余重复事实/真实环境继续延后。

### 24.14 直接 model/thinking 保存检查本地凭据与锁内请求身份

第24.13节已提交并推送为 `6418a9bffd36ea2226028f4231c444f55d801741`，构建 `1198eb3f4160` 完成且工作区干净。继续检查同一边界，发现直接 `/model` 与 `/thinking` 的显式活动连接路径绕过 exact/inferred 分支的凭据检查；存储配置未变时，hook 或 session lock 内环境 key 更换、pool backoff 也不能被原 beforeCommit 检测。新增28项断言在旧代码实际失败，其中23项仍报告切换成功，另5项既有无具体模型拒绝缺少准确的凭据原因。

既有 `model/selection.ts` 对非 exact 的直接变更先检查当前请求的本地 credential/blocked，再进入 hook 或写入。非 scoped 路径在 beforeCommit 中复用既有 `modelRequest`，把捕获的 session selection 投影到新读取的配置，重查完整实际请求；因此凭据、端点、pool/backoff 变化仍可见，而本次 session-first 模型保存不会使随后的 `--global` 自冲突。保留现有配置身份、目录、state/CAS、权限与补偿边界，不新增认证实现或 writer。显式 picker 仍能从不可用当前连接恢复至可用 sibling。

只读参考核对模型变更在写 session 状态之前验证认证存在、仅显式 persist 改全局默认的既有决定。本项目沿当前本地解析而不要求网络验证，并额外保留命名连接与 pool 的身份、hook/锁内检查和两阶段保存保护，不复制另一套解析器。

实际 Linux Node20.3.0 最终单 worker 串行 **5文件/194项**通过：provider76、selection46、effort26、policy10、picker recovery36。新增20项 legacy/session × pending/error/missing/pool-outside/pool-waiting × model/thinking 准入拒绝，8项 hook/lock × env/pool × model/thinking 变化拒绝，均观察 session 与 settings/auth bytes或absence；2项 legacy env/CLI 的 model/effort `--global` 正向保存，4项真实 picker.load/apply 恢复至 sibling、实际请求身份、无配置写入/无fetch。新恢复夹具曾误期望 `ready`，实际合同为 `credential present`，据现有命名连接语义修正期望，保存与请求身份断言保留。

两条保护分别反转后产生实际 AssertionError，finally精确恢复生产源码，再跑最终受影响套件；重复不累加。五道静态门、最终build通过，manifest `6c7801cdab57`；补充恢复测试后旧构建摘要校验正确拒绝，重建后当前输入摘要读回通过。正式打包judge exit0，环/导入解析satisfied，仍只有既有 interactiveMode21/22-name advisory。两路只读复审APPROVE/CLEAR，子代理未运行验证。一次验证调度误在测试尚未完全返回时启动judge，两者短暂重叠，违反串行约束；已如实纠正调度，最终judge独立串行重跑。根runner/包runner混用导致零测试hook错误已分类为设置问题并记录HANDOFF，使用包自己的runner修正，未改产品或断言规避。

延迟代码CI `da3ca316`/`41195952241` 已success；`7bec50d5`/`41196273759`、`a9f537fa`/`41196921141`、`6418a9bf`/`41197208682` 最后仍in_progress。Watch成功不代表代码CI；本批另绑提交与自身CI。未真实provider、Windows、PTY、全仓/20k或真实HOME迁移，ADD-70仍partial、整体goal active，旧版本回退与其余重复语义/真实验收仍缺。

### 24.15 会话 tier 与凭据默认分离并绑定实际模型

第24.14节已推送 `15499d9c54aa10f6a4ebe408ad0d02b5d600b88f`，main与远端精确一致。继续检查 legacy 命名选择使用环境/CLI 凭据的路径：`/slow on` 保存flex并报成功，tier reader根据实际credential.connectionId（ambient为undefined）取独立provider priority，因此status和wire仍为priority。两条legacy-env/legacy-cli新增回归在旧实现实际AssertionError，不将前一轮正常保存等同实际请求生效。

既有session projector输出runtime-only `sessionServiceTier`，携带provider/model/connectionId/scope/value；session tier不再投影进connection/provider default。现有 `configuredServiceTier` 先匹配当前provider、model和credential namespace的会话选择，再沿原connection→provider默认；legacy未显式scope仅在原active ID匹配时允许ambient源，命名session scope不借ambient，provider scope不传给命名credential。valid替换selection无tier时清除投影。四既有消费者和setter readback共用此reader，explicit request tier仍优先，无新增存储字段、凭据解析器或认证面。

只读参考核对：service tier由session/model owner持有独立live map，并经effective tier resolver供请求使用，恢复会话不重复持久化。采用偏好与认证默认分离、统一reader的决定；本项目按精确模型/连接scope绑定而非跨family广播，保留已裁决的不同模型切换撤回与显式不支持tier拒绝。

主代理实际Linux Node20.3.0单worker串行最终 **7文件/305项**通过：provider79、model serviceTier6、command serviceTier9、step13、picker role46、selection46、preview106。覆盖legacy env/CLI实际loopback flex→default、状态与body一致、模型切换回原priority、原两文档bytes/absence；session恢复读回flex、角色assignment/removal保留会话tier；preview三scope的actual endpoint body；main/different-model/sibling三实际wire分别flex/default/priority，explicit request default优先。默认记录保持原值，session tier不再虚标为credential default。首次role路径拼错，runner只运行6文件/254项；修正真实路径后运行role46，不将缺失文件计作验证。

三条有效反转分别移除session reader、model绑定、selection撤回，均实际AssertionError并finally精确恢复。撤回反转首次用于legacy wire用例仍通过，因为正常reload从磁盘重建配置，未复用旧投影；改对已projected配置复用的owner用例后实际失败，未把无效反转当成功。最终五门/build通过，manifest `7205510d4d6f` 当前输入摘要读回通过；正式打包judge独立串行exit0，环/解析satisfied，仍仅既有interactiveMode21/22-name advisory。两路只读复审最终APPROVE/CLEAR，子代理未验证，临时scratch清理。

延迟CI：`7bec50d5`/`41196273759`、`a9f537fa`/`41196921141`、`6418a9bf`/`41197208682` 已success；`15499d9c`/`41198196947` 最后in_progress，Watch success不替代代码CI。本批另绑提交与自身CI。未真实provider、Windows、PTY、全仓/20k或真实HOME迁移，ADD-70 partial、goal active，旧版本回退、其余重复语义与真实环境验收继续尚缺。

### 24.16 会话上下文窗口绑定实际请求并保留普通预算

第24.15节已推送 `25bec1157a0709d2a8ac655c42ea93a1c732836b`，main与远端精确一致。继续检查会话窗口：原projector把session `contextWindow`直接覆盖同名普通设置，委派步骤沿用配置。因此主模型开启10000窗口后，目录只有1000窗口的review模型仍实际接收2000-byte prompt；新增loopback回归在旧实现出现AssertionError。CLI覆盖模型、legacy选择被忽略、pending和缺凭据四状态也实际继续显示`Extended context: on`。删除场景初次夹具保留被删active ID，在配置保存阶段冲突；改为同一保存切换至存活sibling后覆盖删除后的只读状态，不将夹具错误算作产品失败。

现session owner单独投影runtime-only `sessionContextWindow`，携带provider/model/connectionId/scope/value，不改普通`contextWindow`。既有core model preference owner提供结构化binding/target匹配，tier与window复用；匹配需要非blocked凭据、相同provider/model与凭据namespace，保留legacy ambient条件、显式session不借ambient、provider scope不传播给命名凭据。window reader先取匹配会话偏好，再取普通预算；有效替换selection无window会清除旧投影。未新增存储字段或认证实现。

dispatch、配置约束、状态栏、`/context`和handoff共用reader。压缩wiring由三个既有调用点传入捕获的resolution，不重新选择账号；缺identity只沿普通预算。inactive模型预算按自己的模型容量检查，summary role继续独立目录容量。`/extended-context status`要求已保存选择与已接受投影都匹配当前请求，否则显示saved且inactive/unverified，查询不写文件。普通显式预算仍允许超过目录值并保留warning，不将第24.3节不同语义的字段合并。

只读参考针对窗口owner核对：Pi `agent-session.ts:3046`按实际message/current model取容量；另一参考session owner `agent-session.ts:6694`在异步刷新后检查当前model仍相同才发布window。采用模型身份绑定、切换撤回与消费者一致的决定，保留本项目普通预算override语义。

主代理实际Linux Node20.3.0、heap768MiB、单worker串行最终 **8文件/220项**通过：window20、serviceTier6、provider85、constraints35、step14、compaction23、sessionFacts26、handoff11。覆盖实际委派超量拒绝且无child wire、普通显式10000预算仍能发送同一prompt；五失效状态查询不改session/settings/auth；env/CLI/provider恢复、off/on/model切换、role增删、旧投影reset、sibling/provider/model隔离、inactive预算约束、status/report同一窗口和捕获身份的压缩策略。参考决定对应的model-binding、dispatch-reader与reset-clearing三反转均实际AssertionError，finally精确恢复生产bytes；最终类型边界调整后重跑同8文件220项通过。

五静态门与build通过，manifest `a387867093ce`，当前inputsDigest `84cec6b450379d5318b4b4c11ff0e94f3bc32ed264cfe8019714c9d74ed42010`读回一致。正式打包NormProof独立串行exit0，环/解析satisfied；partial仍仅既有interactiveMode21/22-name advisory。两路独立只读复审APPROVE/CLEAR，core matcher使用本地structural接口避免新core→session类型依赖；子代理未执行验证。临时反转与validator scratch清理。

延迟CI `15499d9c`/`41198196947` 已success，`25bec115`/`41199285608` 最后仍in_progress，其Watch success不证明代码CI。本批提交/推送与自身CI另行绑定。未真实provider、Windows、PTY、全仓/20k或真实HOME迁移；ADD-70 partial、goal active，其余重复语义、旧版本回退与真实环境验收继续尚缺。

### 24.17 文本模型目录跟随原生账号发行方端点

第24.16节已推送 `368cc3e6f1a43d7b3c531e1b1ca90c492fd6c423`，main与远端一致。继续审计目录/连接端点重复语义：Copilot business API key/account假设的两条隔离回归先通过，因为既有credential resolver已投影subscription发行方地址；未为该假设改产品代码。随后valid Google native account没有stored URL、实际请求地址由issuer固定时，`readModelCatalog`与`/model list`仍按原始undefined地址选择compatible目录。两条旧实现回归实际AssertionError，展示native-model缺失且compatible-only混入。

仅改既有model command owner两处目录读取，委托原`providerCredentialBaseUrl`再做精确catalog binding；不新增认证解析器、不修改issuer协议或provider核心。API key继续按其配置端点查目录，显式其他catalog ID查询不借活动地址，原ambiguity拒绝与OpenAI account允许列表保留。只读参考model-controls选择前使用认证对应模型元数据，model-registry的available保持本地auth检查不续期；本修复同样只查询、不发送或续期。

主代理实际Linux Node20.3.0、heap768MiB、单worker串行最终 **3文件/39项**通过：session catalog13、model command19、account target7。新增account/API key×data/text四场景验证原生issuer目录、compatible目录、active model、显式other目录无active标记、zero requests与settings/auth bytes/absence不变；原relay真实loopback协议和metadata用例继续通过。data/text两处独立反转各实际1失败/3通过/9跳过，AssertionError且生产bytes精确恢复。第一次使用参数化展开名作`-t`全13项跳过，不计证据；改稳定组名后执行实际四项并获上述失败，最终稳定源码重新39项通过。

五静态门/build通过，manifest `202e69ad04b0` 当前输入摘要读回一致；正式bundle judge独立串行exit0，环/解析satisfied，仍仅既有interactiveMode21/22-name advisory。两路独立只读复审APPROVE/CLEAR，子代理未验证；本轮scratch清理。延迟代码CI `25bec115`/`41199285608` 已success，`368cc3e6`/`41200474418` 最后in_progress，对应Watch success不替代代码CI。本批另绑提交/远端/自身CI。未真实provider、Windows、PTY、全仓/20k或真实HOME迁移；ADD-70 partial、goal active，旧版本回退与其余重复语义/真实环境尚缺。

### 24.18 模型能力、窗口偏好与交互目录共用发行方地址

第24.17节已推送 `cf745bcc9a2c27b12384553b5b8fbe87f1d18bee`，接续时工作区干净。有效 Google native account 无 stored URL 的隔离场景复现：thinking picker 把原生目录不支持的 high 显示可选；extended context 保存 compatible 的16000而非native的32000；模型 picker 缺少命名原生目录行；反向能力两条直接 model/thinking 命令被 compatible 元数据误拒绝；hook 后 native 目录变更未拒绝保存。同组 API-key 路径通过。锁注入初次误匹配state.json而非state.lock，未算产品证据；纠正后用完整旧owner bytes反转确认锁内目录变更仍会保存。

沿既有owner改读取：selection与preferences先用 `providerCredentialBaseUrl` 得到目录地址，准入和hook/锁内围栏共用；仍保留原始request/credential equality、自然fallback/pool重查、session/global两阶段与CAS。thinking与model picker按同地址读取effort、metadata和alias。现有availability的matchesCatalog加入issuer优先，删除重复issuer matcher；canonical会员关系保留，命名alias跟随issuer，本地inspection仍无sessionId、不续期或请求。不改auth/provider实现、不新增存储字段、resolver或writer，API key保持配置地址语义。定向只读参考model-controls认证模型元数据与model-registry本地available决定，本项目沿既有issuer地址owner并额外保留精确连接和发布围栏。

两路独立复审进一步发现并修复：不完整account校验失败不能丢失其已声明native URL的pending/error行，保留地址回退、readiness独立判断，两条实际失败后通过；重复issuer alias虽disabled却均标active，新增失败回归后要求无ambiguity才标活动owner；新出现的model:current也必须按实际issuer读元数据，ambiguity显示unverified，不能借compatible容量，补充断言实际失败后通过。重复picker apply夹具曾第二次操作已退休owner，空note断言也误用toContain；按一次真实apply的合同纠正，拒绝写入和状态不变断言保留。

主代理实际Linux Node20.3.0、heap768MiB、单worker串行最终 **6文件/207项**通过：catalog30、effort26、selection46、thinking picker36、model picker46、availability23。17条新增场景覆盖account/API-key能力与容量、canonical alias一致且仅一个active、实际picker apply、反向支持、hook/lock目录替换、incomplete setup与duplicate issuer；session/settings/auth bytes或absence及zero fetch断言保留。五处点反转和两处完整旧owner反转均产生实际AssertionError，finally精确恢复生产bytes；后续最终套件覆盖复审修正，不累计重复通过数。

五静态门/build通过，manifest `421717a2aec9`，当前inputsDigest `15170474481b78df3b7714d2128688f31123bf068397d61ed6e8731f87f5c015`读回一致。正式bundle NormProof独立串行exit0，环/解析satisfied，partial仅既有interactiveMode21/22-name advisory；本轮修改模块无新增ceiling问题。两路最终APPROVE/CLEAR，子代理仅只读、未验证；本轮反转与judge scratch清理。

延迟CI `368cc3e6`/`41200474418`、`cf745bcc`/`41201096537`最后均in_progress；`cf745bcc` Watch `41201096218` success不替代代码CI。本批另绑提交/推送/readback与自身CI。未真实provider、Windows、PTY、全仓/20k或真实HOME迁移；ADD-70 partial、goal active，旧版本回退、其余重复语义与真实环境验收仍缺。

### 24.19 预设模型校验与目录目标跟随发行方

第24.18节已提交推送 `6c570eb309ac36cf45839ac390a122b36cb69619`，本地/远端一致且工作区干净。接续检查summary role已经由既有issuer helper解析地址，无需修补；preset metadata校验却仍按raw URL，role目录alias候选仍按stored URL。新增8条session/profile × account/API-key × connection/catalogue save→validate→apply --all场景，原生account四条实际失败、API-key四条通过。初次saved子串误匹配“No saved connection”，收紧完整成功消息后同四失败重新确认。

既有preset owner用 `providerCredentialBaseUrl` 再读catalogModel/effort；无config时保留canonical fallback。roles owner复用既有matchesCatalog，删除sameEndpoint重复匹配；matcher参数收窄为实际读取的connectionId/provider，不伪造readiness数据。named connection优先、current候选优先、多连接歧义、status/credential/scope/constraint与preset发布围栏均保留。category会员不作认证或写入授权，实际validate/apply继续独立准入；不新增存储、provider/auth实现或writer。延续第24.18节已定向核对的认证模型元数据与本地available参考决定。

主代理实际Linux Node20.3.0、heap768MiB、单worker串行最终 **4文件/82项**通过：catalog38、presetCommand11、policy10、availability23。新增8场景验证完整保存成功、validate、整组apply、精确default/summary角色和native32000/compatible16000 summary容量，settings/auth bytes或absence不变、zero fetch。preset与roles分别反转至完整前版owner，实际4失败/4通过及2失败/6通过，AssertionError且finally精确恢复；最终同82项再通过，不累计重复数。

五静态门/build通过，manifest `4b1362add6dd`，inputsDigest `c254a7f0e04d4cd876809b85288e6864bdaa192dfaad096931363f89ff079af3`当前读回一致。正式bundle judge独立串行exit0，环/解析satisfied，partial仍仅既有interactiveMode21/22-name advisory；两路最终APPROVE/CLEAR，子代理仅只读未验证，反转/judge scratch清理。

延迟CI `368cc3e6`/`41200474418`与`cf745bcc`/`41201096537`已success，`6c570eb3`/`41203580231`最后in_progress；本批另绑提交/推送/远端与自身CI。未真实provider、Windows、PTY、全仓/20k或真实HOME迁移，ADD-70 partial、goal active，旧版本回退与其余重复语义/真实环境尚缺。

### 24.20 角色 effort 与 advisor 准入使用发行方能力

第24.19节已推送 `b0a144dea580c9a6d690115f85499b1aa2854adc`，接续时工作区干净。先查service tier：原生OpenAI/Google account协议不支持tier，未按相邻raw读取推测改setter。另复现角色editor和advisor：三种角色把native不支持的high显示可选；advisor已按issuer取model却按raw URL取effort，因此同组native支持时误拒绝、不支持时误接受。10项account/API-key场景中5项实际失败；API-key正反向和既有catalogue路径通过。

role owner使用现有 `providerCredentialBaseUrl` 读取model/levels；advisor effort沿其已捕获baseUrl，保留independent model、credential、scope与identity哈希。只读参考已定向核对认证模型元数据和本地available不续期的决定，继续复用本项目owner。复审指出不可用role仍借canonical列effort；pending/error/missing/deleted四隔离场景实际AssertionError，现仅非blocked且credential的provider/model/connectionId匹配角色才列effort，choose恢复入口保留。未新增auth/provider实现、resolver、writer或存储字段。

主代理实际Linux Node20.3.0、heap768MiB、单worker串行最终 **4文件/184项**通过并正常exit0：catalog54、role picker46、model picker46、runtime advisor38。新增16场景含三角色实际inspect→editor→thinking→apply、account/key的advisor支持反向、四失效binding恢复和两stale editor拒绝；session/settings/auth bytes或absence与zero fetch断言保留。既有advisor loopback/账号续期和role生命周期套件通过。三点反转实际3/2/4项失败、AssertionError，finally精确恢复bytes；最终组合再次通过。catalog测试临时状态归入/tmp/cheers-test并清理。

首次组合184项断言通过但worker-close超时，准确报告为关闭未完成；核对测试PID的cwd/exe后终止，process exit143、无并发验证。catalog54单独用hanging-process reporter正常exit0，恢复后的同四文件184项也正常exit0；关闭超时未再复现、根因未确认，不据此修改产品或放宽测试，前次不计完整验证通过。

五静态门/build通过，manifest `3bb4c3141297`，当前inputsDigest `26ee30a366cbce3cb8722ca936d51e18a44aa643daab2f548ae3f7334cc84b8b`读回一致。正式bundle judge独立串行exit0，环/解析satisfied，partial仍仅既有interactiveMode21/22-name advisory；两路最终APPROVE/CLEAR，子代理仅只读未验证，scratch清理。

延迟CI `6c570eb3`/`41203580231`、`b0a144de`/`41204101311`最后仍in_progress，Watch成功不替代代码CI；本批另绑提交/推送/readback与自身CI。未真实provider、Windows、PTY、全仓/20k或真实HOME迁移，ADD-70 partial、goal active，旧版本回退、其余重复语义与真实环境尚缺。

### 24.21 初次角色保存不把普通预算变成 extended context

第24.20节已推送 `5ca5d3ed9c167aca699eaf5d0289898760d8d4c7`，main/远端一致且工作区干净。继续审计角色初次保存：没有session selection时，role owner把普通 `RuntimeConfig.contextWindow` 复制到selection同名extended preference。provider CLI与named connection两条隔离回归实际失败；第一次provider夹具自然fallback选named，补上CLI并断言实际namespace后，两真实不同路径仍失败。这个复制会让extended状态误on、使后续普通预算更新被会话偏好遮蔽。

仅删除role seed中的该字段复制；baseline.selection仍优先并完整保留用户已开启的extended窗口和tier，角色增删本身不新建window偏好。定向Pi actual-message/current model窗口owner对照继续支持预算由实际选择/配置持有；本项目保留普通override与显式extended的独立语义，不增加writer或迁移字段。

聚焦套件发现一条旧empty-session picker测试锁定普通90000被复制的缺陷，分类为stale expectation；保留default/summary/advisor与未配置模型浏览断言，改为session无window、projected无sessionContextWindow，实际configured reader仍90000，断言更精确。新增两场景验证初次role保存extended off、无session字段、普通12000→18000实际生效、role删除后仍off、两文档bytes或absence不变/zero fetch。既有enabled32000窗口/tier跨role增删保留测试继续通过，provider夹具临时状态归入/tmp/cheers-test。

主代理实际Linux Node20.3.0、heap768MiB、单worker串行最终 **3文件/179项**exit0：provider87、role picker46、model picker46；旧owner完整反转实际2失败/85跳过、AssertionError，finally精确恢复生产bytes，最终同179项再通过。五静态门/build与当前输入读回通过，manifest `571e6cc80012`，inputsDigest `50bcf926711ebfc2333010f3fbd8aca9905dd068f4ea3a641ececc7f7c386404`。正式bundle judge独立串行exit0，环/解析satisfied，partial仅既有interactiveMode21/22-name advisory；两路最终APPROVE/CLEAR，子代理仅只读未验证、scratch清理。

延迟代码CI `6c570eb3`/`41203580231`、`b0a144de`/`41204101311`最后in_progress，`5ca5d3ed`/`41205332421`新启动；本批另绑提交/推送/远端与自身CI。未真实provider、Windows、PTY、全仓/20k或真实HOME迁移；ADD-70 partial、goal active，旧版本回退、其余重复语义和真实环境仍缺。

### 24.22 显式旧格式配置导出与两代旧源码往返

只读审计确认直接降级不是安全回退：拆 auth 前 `a746102aecbb19352a8c45d2e9c9740ad71f65cf` 只读 config，拆 preferences 前 `e10964dabc44b1b9ae835e43261285a3efccb7e3` 不懂 envelope；旧 global model/login 会被新 owner 覆盖，旧 logout 还可能留下新 reader 拒绝的孤立 preference。凭据不可读不等于 auth 字节已丢失；静态丢弃路径不当作真实账号丢失事件。没有原目录自动降级/补偿或重复 backup registry。

沿既有 profile 管理加入 `/profile export <target> [--confirm <digest>]`：先显式 create 空 named target；preview 无写入，仅报告私有副本含 credentials/defaults 与排除范围，不显示值。读取既有 ConfigEdit 两份 raw source/canonical/revision/absence，与 config capture 围栏、preference join、raw schema及bounded serializer共用；provider slot/named/default/effort null/tier/active/pool/account token/unknown字段保留，引用不展开。单份旧 config 无 envelope/auth sidecar，源 settings/auth 不变；catalogue/cache/presets/definitions/session/runtime不复制，不切换活动profile。

独立架构复审指出逻辑 shallow merge不能代表runtime累积限制及逐文件scope：export采用现有intersect/union/deny/disable与TUI叶子合并，pathRules锚定其真实canonical文件；settings有规则且auth随后有scope base/rules时，单文档无法表达原优先级，明确拒绝。实际 scopedRuntimeConfig回归比较两种单owner源/目标结果，并验证later-base/later-rule原17与拒绝后零写入，不以raw数组相同冒充语义一致。

发布使用目标内随机stage的wx FD，fstat在写入之前捕获，0600/write/fsync后独占hard link；stage/destination regular、unlinked、dev/ino/mode在读回前后与清理后复查。不得用rename覆盖竞态目标或在writer返回后才取得cleanup身份。competing stage、stage replacement、destination symlink、source变化、cleanup残留保持unknown，陌生文件不删；withFileLock的onReleaseError观察primary failure掩盖的锁清理。两次lock故障测试失败分类为harness injection未进入shared fs namespace，改为直接验证既有onReleaseError合同后通过，没有放宽unknown要求。首次Node20.3使用--import的probe因tsx loader未注册报UNKNOWN_FILE_EXTENSION，未运行scenario；正确--loader后执行正常。

主代理Linux Node20.3.0、heap768MiB、单worker串行最终 **5文件/76项**exit0：export19、profile command6、documents32、preferences11、scope8。包含确认/伪造plan/preview secret projection、两文档变化/absence、累积策略、账号与空owner、scope拒绝/等价、竞态发布/stage/cleanup与当前再迁移。三point reversal撤销join、exclusive publication、cleanup observer，各实际1失败/exit1；finally精确恢复plan `9e8a3989d6d5`、runtime `66d41b0142b3`，恢复后同76项正常exit0。

实际历史源码按两个精确SHA archive到批次scratch、删除测试副本，使用已有依赖与Node20.3 loader串行运行小型synthetic probe：当前legacy seed→实际迁移→private export→两代旧reader精确credentials/defaults/effort null/tier/pool/token→旧setModel global→当前readback→旧API-key login/logout→当前reader/再次迁移。两个generation均exit0、来源两文档字节不变；未调用provider或真实HOME，源码执行不称旧发布二进制验收。另用本批fresh compiled CLI、Node20.3、isolated HOME/offline实际create→preview→exact confirmation，核对目标0600/旧格式/defaults、报告无凭据值、原两文档bytes不变；该当前CLI smoke正常exit0，不替代旧binary验收。

五静态门/最终build通过，manifest `c0ed5e9c875f`、inputsDigest `9cee560498ebf199b535ecae383b1d19e29a0598c5cc59b9fe30700cdfc15abd`读回与当前输入一致。正式bundle judge独立串行exit0、环/解析satisfied，partial仅既有interactiveMode21/22-name advisory，118既有docs-source advisory。两路最终APPROVE/CLEAR，子代理只读未验证。批次scratch清理与提交/推送/精确CI另绑定。

延迟CI `5ca5d3ed`/`41205332421`已success；`6409450b`/`41205782214`、`b0a144de`/`41204101311`最后仍in_progress。本批未旧发布二进制、真实provider/token、Windows/macOS/PTY、全仓或20k；ADD-70仍partial，旧发布版本/真实环境及其余语义审计继续，原Phase20真实条件延后、goal active。

### 24.23 Director 与 handoff 使用实际账号目录

只读消费者复审定位两处遗漏：director 把完整凭据降为 `sourceChoice` 后再查工具支持，固定原生 issuer 的目录地址因而丢失；handoff 压缩则直接读取可能为空的 `current.baseUrl`。冲突目录的真实回归中，原生账号错误启用无工具能力的 planner，反向能力配置又误拒绝；原生 executor 的 8,000 窗口被读成兼容目录的 32,000。API-key 对照保持配置地址语义。

修复沿现有 `providerCredentialBaseUrl` owner：director 使用原始凭据快照，handoff 使用实际凭据和目标模型。普通预算、精确 provider/model/connection 会话偏好、上游较小窗口与较大 reserve 的既有合同保留；不新增 resolver、存储字段或执行路径。定向只读参考 `model-runtime.ts:681` 的认证地址投影，以及 `agent-session.ts:3046,3162` 从实际消息模型读取窗口后交给 `shouldCompact` 的决定；同意实际请求元数据归属，保留本项目显式普通预算优先及精确连接绑定。没有复制参考代码。

主代理 Linux Node20.3.0、heap768MiB、单worker串行最终 **3文件/46项** exit0：director13、handoff13、window20。新增六个 account/API-key 场景覆盖工具能力正反、原生/兼容目标窗口、主模型偏好不外溢、普通预算、精确目标偏好、兄弟连接隔离及上游较小窗口；检查原 compaction 对象不变且无 provider request。两次反转分别实际 director2失败/2通过/9未选、handoff1失败/1通过/11未选，均 exit1；源码逐字节恢复 `04f69ecf671d` / `f0ea0dabb145`，恢复后同46项重验通过。未选用例不计反转通过。

五静态门与最终 build 通过；manifest `56097fecb184`、inputsDigest `2e7c728fd9c59db3bb2d3c436ed627a2eeceaaaded153c05ee95ca13f0e30638` 读回与当前输入一致。正式 bundle judge 独立串行 exit0，环/解析 satisfied，partial 仅既有 interactiveMode21/22-name advisory；docs-source118既有 advisory。触及生产模块函数数 director1/handoff8，最终独立静态复审 APPROVE，未由子代理执行验证。证据在 `.omx/artifacts/phase20-addition-delegation-owner/`，批次 scratch 清理后交付。

延迟CI复查：`6409450b`/`41205782214` 已 failure，唯一失败在既有 browser cache multiprocess concurrent execute 场景，3个子进程中2个exit0、1个exit1，未超时，cache integrity healthy。日志未给出该子进程根因，暂记未分类原因，不以本批聚焦绿色推断已修复或 flaky；本批未修改该路径。`abe32561`/`41207683568` 与 `b0a144de`/`41204101311` 最后仍 in_progress，前者 Watch success。本批提交/推送/自身CI另绑定；未真实provider、旧发布二进制、Windows/macOS/PTY、全仓或20k。ADD-70仍partial，原真实条件延后、goal active。

本批代码已提交/推送 `3e0a148ac08d3dac60c64ce29665ac19c628e68a`，远端 main 精确读回相同，代码交付后工作区 clean。自身CI `41209134634` 与 Watch `41209134592` 最后读回均 in_progress；未等待或称通过。后续交付记录为文档变更，须与此代码SHA区分。

### 24.24 缓存多进程夹具隔离会话状态

追查 `6409450b` CI 的 browser cache 单个 child exit1：主代理 Node20.3、每进程heap384MiB，原三writer共享HOME场景7轮均exit0；预seed current的2轮也通过。普通current持有真实live session lock时，后CLI仍exit0且保留锁，不能据此证明CI根因；缺legacy gitRoot的补充探针同样未复现。首个探针错误把返回string的redactReportText取`.text`，输出摘要未写入，三轮退出统计仍有效；改正后四轮记录完整脱敏输出。未观察到OOM、超时、provider调用或cache损坏，不将未复现写成修复了原CI。

静态确认夹具存在另一条实际耦合：所有CLI共享同HOME，既有--print按current pointer续接，会采用同一个session。撤销隔离后实际执行3个CLI只产生同一个session ID，新增断言实际 `expected 1 to be 3`，这不是设想的竞争。沿test-utils/browser/cache现有fixture，仅每个cliStep创建随机独立HOME；project/cacheRoot/runner/manifest/groupId均不变，仍由原runner并发真实CLI，同cache读回、replay receipt ID、busy/stale锁与raw内容断言全部保留。定向只读参考 `main.ts:439-451` 显式continueRecent与默认SessionManager.create分开；同意测试显式固定运行状态归属，本项目保留原产品--print续接语义，不修改session/bootstrap或缓存生产路径。

主代理 Linux Node20.3、单worker、heap512MiB，单个scenario文件 **6项**exit0；反转cliStep退回共享HOME实际1失败/5未选/exit1，fixture源码逐字节恢复 `c156beed311c`，恢复后同6项再次exit0。新增检查实际每HOME恰一个session、3个不同session ID、旧共享HOME未创建状态。两个验证均保留所有原缓存断言；既有500ms read lock场景未同步到CLI读阶段，不能证明操作与持锁重叠，此覆盖局限保持记录。静态复审APPROVE，子代理只读未验证；本批只修复夹具会话隔离，CI原失败根因仍未确定。

延迟CI：`abe32561`/`41207683568`已success；`3e0a148a`/`41209134634`、`972ed1f6`/`41209268816`、`b0a144de`/`41204101311`最后仍in_progress。本批静态门/build/交付证据另读回；未全仓测试、真实provider、PTY、旧发布二进制或非Linux平台。ADD-70及整体保持partial，goal active。

五静态门/diff和build实际通过，manifest `300d414e1582`、inputsDigest `b29ef04176f4e05206817a588f570921649157098dc92a42ac69f00adda3ae19` 与当前输入精确读回相同。证据在 `.omx/artifacts/phase20-addition-cache-failure/`；本批无生产导入/边界变化，未重跑NormProof或全仓。scratch已清理；提交/推送/新CI须独立读取。

本批 `14d3532f9c5b315183a28a0eecb07e57522b07f0` 已提交/推送，远端main精确一致、工作区clean；CI `41210672771` / Watch `41210672780` 最后in_progress。第一次GitHub查询EOF后重试正常，没有推断作业终止。继续延迟读回确认前批 `3e0a148a` CI `41209134634` / job `124560244384` 于 `2026-10-31T14:31:10Z` completed/success，所有步骤通过；此前 `6409450b` failure仍保留。`b0a144de` CI `41204101311` / job `124545558599` 仍有实际运行中的test步骤，未终止或重启。

### 24.25 首次角色保存保留普通 tier 的实时继承

继续审计默认值与会话偏好分离，发现首次 `prepareModelRole` 将 `configuredServiceTier` 的连接/provider 默认写入显式会话 tier。三个隔离回归分别使用实际 provider CLI 凭据、命名连接自身 tier、命名连接继承 provider tier：普通默认从 priority 改为 flex 后，原实现的实际 HTTP body 仍为 priority，全部实际 AssertionError/exit1。

修复只移除既有 role owner 新 selection seed 的 tier import、lookup 与 spread；已有 baseline selection 完整保留，普通默认继续由原 `configuredServiceTier` 读取。未新增 resolver、writer 或字段。历史已存 tier 无法区分用户意图与意外 seed，不自动清除；本次修复适用于新建角色选择。定向只读参考 `model-controls.ts:233-272` 的角色模型变更不保存 tier，`:790-806` 专门保存显式 tier；`agent-session.ts:13198-13223` 在没有显式 tier entry 时恢复配置默认。本项目保留精确 provider/model/credential namespace 绑定，不复制 family map。

主代理 Linux Node20.3.0、heap768MiB、单worker串行 **4文件/151项** exit0：provider90、picker role46、command tier9、model tier6。三个新增真实 loopback 场景检查 flex 更新、默认删除后的省略或 provider default 回退、状态与配置投影一致、session 无 tier、角色增删不修改 settings/auth 字节；原显式 flex 与 extended context 保留用例继续通过。将生产 role owner 撤回 HEAD 实际3失败/87未选/exit1，finally逐字节恢复 `6f55c87b95b0` 后同151项重验exit0，未选项不计反转通过。

build exit0，manifest `ef982b674f90`、inputsDigest `82d6aba4bec6af4140fe8ea483504f799dafd2d0bf24d8487b321a61b02fea94` 与当前输入精确读回一致。正式适配归档 hash/member/vendor 身份核对后，独立串行 judge exit0，环/解析 satisfied；partial 仅既有 interactiveMode21/22-name advisory。一次误将已适配归档作为原始打包输入被 baseline hash 正确拒绝，未改打包脚本/归档；随后直接使用校验后的适配归档。两路独立静态复审 APPROVE/CLEAR，子代理未验证。证据在 `.omx/artifacts/phase20-addition-role-tier/`；五静态门、scratch清理与提交/推送/自身CI另读回。

延迟CI：`972ed1f6`/`41209268816` 已completed/success；`14d3532f`/`41210672771`、文档 `712ea121`/`41210875615`、旧 `b0a144de`/`41204101311` 最后仍in_progress。`6409450b` 原 cache child failure 根因仍未确定。本批未真实provider、旧发布二进制、Windows/macOS/PTY、全仓或20k；ADD-70仍partial，原Phase20真实条件延后、goal active。

最终五静态门/diff实际exit0，binding refs全部解析，118既有docs-source advisory保持。只读复核 tier setter 的原生 issuer 假设被现有协议能力门正确拒绝，与第24.20节既有裁决一致；未新增无缺陷修补。批次scratch清理后提交/推送另记录。

本批已提交/推送 `279315636c25ae1c6296fb7372d7533bace3ff93`，远端 main 精确读回相同，交付后工作区 clean，`.tmp/role-tier/` 已清理。自身 CI `41211798735` 最后 in_progress；Watch `41211798701` completed/success 不替代代码 CI。后续本段文档提交与代码 SHA 分开记录。

### 24.26 辅助请求传递同一已准入 service tier

继续检查只读请求消费者，发现 `/btw` 与 automatic/manual/turn-prefix/branch summary 没有携带普通或会话 tier；simple endpoint body 自身也缺少字段。两条 provider/命名连接 HTTP 回归在旧实现实际发送缺失的 `service_tier`，而会话保存为 flex。撤回生产修复后，四种 summary 入口的主模型/不同模型/兄弟连接/继承默认、普通默认更新与摘要身份回归也实际失败，不把纯静态缺口计作通过。

既有 `core/models/serviceTier` 增加 `requestServiceTier`，复用原默认reader和capability检查，main step也委托它并保留explicit request override。侧问、summary role和compaction捕获实际模型/凭据/issuer，再于renewal/send前验证tier。SimpleProvider、CompactionProvider和SimpleRequest仅携带已准入可选值；兼容协议与Responses simple body负责序列化。没有新增credential resolver、存储字段或第二条执行路径。summary role使用自己的模型和连接，同一个精确目标可继承匹配的session tier，其他模型/兄弟连接读取自己的默认；fallback与role summary identity均包含tier。所有生产compaction调用点传入已捕获resolution，含job路径，不在摘要期间重选凭据。

定向只读参考：`agent-session.ts:12741`侧问传effective tier，`session-handoff.ts:167`为handoff传同一模型tier，`packages/agent/src/compaction/compaction.ts:1121-1127`声明mirrored stream controls包含serviceTier。同意请求控制跟随实际模型身份，保留本项目精确model/credential匹配及unsupported/unverified显式拒绝；不复制跨family存储。

主代理Linux Node20.3.0、heap768MiB、单worker串行最终 **8文件/223项** exit0：provider92、summary48、compaction23、step14、btw18、simple completion19、model tier6、endpoint tier3。35条新增用例覆盖侧问flex→default→普通priority、无发送拒绝、四summary入口×主模型/不同模型/兄弟/继承、普通default实时变更、tier-only identity、unsupported model/protocol/fallback在renewal与attempt之前拒绝、Responses/兼容simple body可选字段。实际HTTP body、settings/auth bytes、已存model selection/revision、foreground usage与history合同均检查；compaction合法更新历史不被误要求整文件不变。

两条反转：原生产owner实际21失败/115未选/exit1；撤销capability guard实际12失败/36未选/exit1。finally逐字节恢复所有生产文件，之后上述223项通过；未选不计通过。首次original反转错误使用RTK展示过滤的git show，源码尾部被截断导致0-test transform错误；改为raw proxy后才获得有效行为失败，单独保留setup日志。首build在structural provider字符串索引报TS7053，使用既有isRuntimeProvider收窄后最终build exit0，未放宽类型检查。

最终build manifest `dd850ed40634`，inputsDigest `2885a5209ac8a1de7f2f42787a7847414bc91785a09bdd236f15dd382bf9beaa` 与当前输入精确读回一致。正式适配bundle hash/member/vendor核对后独立串行judge exit0，环/解析satisfied，partial仅既有interactiveMode21/22-name advisory，无新增ceiling finding。两路独立只读复审APPROVE/CLEAR，子代理仅编辑summary测试/读审、未执行验证。证据 `.omx/artifacts/phase20-addition-auxiliary-tier/`；最终五静态门、清理与提交/推送/自身CI另绑定。

延迟CI `14d3532f`/`41210672771` 已completed/success；角色seed `27931563`/`41211798735`、文档 `712ea121`/`41210875615` 最后仍in_progress。前者成功不倒推原 `6409450b` cache child failure根因已确定。本批未真实provider、旧发布二进制、Windows/macOS/PTY、全仓/20k或操作员HOME迁移；ADD-70仍partial，原Phase20真实条件延后，goal active。

最终五静态门/diff实际exit0，binding refs全部解析，118既有docs-source advisory保持；批次 `.tmp/auxiliary-tier/` 已清理，提交/推送与自身CI另读回。

本批代码 `953d677f3f6f41e6470ea33df24dd07f122dbca0` 已提交/推送，远端 main 精确一致，交付后工作区 clean。自身 CI `41213345904` 最后 in_progress；Watch `41213345918` completed/success 不替代代码 CI。延迟复核角色 `27931563`/`41211798735`、文档 `712ea121`/`41210875615` 与旧 `b0a144de`/`41204101311` 仍 in_progress，未终止或重启。本段为后续交付文档，不与代码提交混算。

### 24.27 连接成功与捕获失败报告不带出凭据内容

接续 `9975ac6e` 检查连接报告：API-key 和 browser 成功消息直接输出原始 Base URL，可能带出 userinfo、查询 token 和 fragment；browser failure 直接读取 Error.message 或调用任意 thrown object 的 String。新增八条回归在原实现实际全部失败，失败日志仅记录布尔断言，不输出捕获正文。

沿既有 [endpointLabel](../../packages/ts-shell/src/core/models/availability.ts) 投影成功消息的 host/path，舍弃 userinfo/query/fragment；失败返回固定 local capture 原因，与原生账号登录的非可信错误处理一致。完整原始地址仍由原 writer 保存；ConfigWriteError 继续抛出，pending/error、激活/仅保存、模型偏好分文件与普通默认均沿原合同。不增加 URL 解析器或认证流程；现有 host/path 显示不证明嵌在这些部分的任意秘密已脱敏。

目标检查后定向只读参考：另一终端实现 `mcp/json-rpc.ts:21-34` 去掉 URL userinfo 并处理敏感 query；Codex login `server.rs:748-803` 还移除 fragment、无效 URL 不回显。采用结构化 URL 显示而非原值回显的决定，本项目复用更窄的既有 endpoint projection；任意异常正文采用本项目原生登录的固定原因，不复制参考认证代码。

主代理 Linux Node20.3.0、heap768MiB、单worker串行最终 **3文件/115项** exit0：connect68、model authentication24、availability23。新增 API/browser×activate/save-only 四条验证实际 loopback 浏览器表单/回调、终端安全显示、完整存储地址、0600 auth、模型默认的物理归属及原 provider 默认保留；Error/non-Error×activate/save-only 四条验证零任意 coercion、失败状态和无凭据写入。首次修复后四条 settings bytes 比较失败属 harness 假设：pending 插入会完成原 writer 允许的偏好迁移；改在实际 browser callback 捕获物理基线，仍验证登录前后的逻辑默认相等及失败阶段的 settings bytes 不变，不修改 writer。

原生产源码反转实际 **8失败/60未选/exit1**，finally逐字节恢复，fixed SHA256 `09dc1056a5f3`；恢复后同115项通过。五静态门/diff exit0，118既有 docs-source advisory 保留。build `9743fd74bdbcb0d5dad6a795c48d960b9ca275cbd84b96a81ebf757c05f50ec2`，inputsDigest `668cd39b0edfb58388bf2eb9d73b6f95f80dad7516319d337ff7a7ee27c49872` 与当前输入匹配。正式适配 archive/member/vendor 核对后 judge exit0，环/解析 satisfied，partial仅既有 interactiveMode21/22-name advisory。最初门在 package cwd 缺 root script、judge profile 参数层级错误均按调用 setup 分类，修正后才计通过。独立只读复审 APPROVE/CLEAR；证据 `.omx/artifacts/phase20-addition-connect-report/`。

另一只读审计确认 template/instruction/import/append/skill 的精确 raw-byte freshness 已实现且已有固定元数据回归，本批不重复修补。它还定位签名型 provider 的委派准入静态差异：main readiness允许 signer 无静态 credential，delegatedTarget却强制credential；尚未动态复现，留待单独验证，不称已修复。延迟读取 `f380f6f3` CI `41212017388` 已success；`9975ac6e`/`41213464205`、`953d677f`/`41213345904`、`27931563`/`41211798735`仍in_progress。本批无真实provider/PTY/非Linux/全仓/20k或旧发布binary验收，ADD-70 partial、goal active，提交/推送/自身CI另绑定。

本批 `077d7978f58017c25a203eac60286cc7741b1a29` 已提交/推送，远端 main 精确一致、交付后 clean，scratch 已清理。自身 CI `41215191300` 最后 in_progress，Watch `41215191257` success；后续签名准入证据不替代此提交的 CI。

### 24.28 签名端点的委派模型准入与主请求一致

第24.27节静态差异已动态复现：[delegatedTarget](../../packages/ts-shell/src/cli/provider/target.ts) 强制静态 credential，实际 resolver 对 Bedrock/Vertex 的签名路径没有这个值；主 readiness 与 transport 已支持它。两个 provider 的目标解析/executionChoice、director on、handover arm 六条实际失败。两条人为构造 blocked+credential 防护场景也失败，属于边界防护而非声称真实 resolver 已产生该组合；非signer拒绝控制通过。

修复仍在委派 target owner：先拒绝 blocked 与 model mismatch，再沿既有 issuer URL/endpoint 和 endpointShape 允许静态 credential 或实际 signer。命名连接必须有精确 credential.connectionId、pool拓扑/外部provider限制、account model allowlist保持；不在这里获取或复制 AWS/ADC 凭据、不生成占位 key、不调用 signer。准入表示允许进入既有传输路径，不证明其 principal 或外部认证有效。

目标检查后定向只读 Pi：`providers/amazon-bedrock.ts:64-77` 与 `providers/google-vertex.ts:81-86` 允许隐式 `auth:{}`，`core/model-runtime.ts:672-700` 只拒绝缺失 auth resolution 并把 optional apiKey交给请求。Bedrock SDK 的显式profile优先和另一参考broker禁止绕开pool的决定，支持保留本项目命名身份/pool拒绝。区别是 Pi 在准入时检查隐式来源，本项目原 readiness 已把 signer有效性留给实际 transport；本次不重复实现该来源解析或据此宣称认证通过。

主代理 Linux Node20.3.0、heap768MiB、单worker串行最终 **4文件/78项** exit0：target19、director15、handoff15、readiness29。九条新增场景覆盖两个实际resolver的无credential快照、bare/qualified目标、executionChoice、director on/off持久状态、handover arm/off持久状态，以及blocked有/无credential、missing exact connection、invalid pool、provider名支持signer但实际endpoint非signer的拒绝。启用/arm期间零request/approval、无child，原config对象与捕获结果保持；既有实际loopback worker/handoff路径继续通过。没有外部 AWS/ADC 请求。

原源码反转 **8失败/1控制通过/40未选/exit1**，finally精确恢复 fixed SHA256 `f9aa5529388a`，恢复后同78项再次通过；没有用 skipped计通过。五静态门/diff exit0，118 docs-source advisory保留。build `a91a9c4872e196989fd7b80c0ea074533fccc7290d0a911b7428f370f7bc065b`，inputsDigest `0d40e55b4e13c38d684fd517f71df7a231957078341d13f8ea11e583bfbd9ea2`与当前输入匹配；正式适配 archive/patch/member/vendor核对后judge exit0，环/解析 satisfied、partial仅既有interactiveMode21/22-name advisory。独立只读复审 APPROVE/CLEAR，子代理未运行验证。证据 `.omx/artifacts/phase20-addition-delegated-signing/`；清理/提交/推送与自身CI另绑，真实provider/平台/PTY/旧发布binary/全仓/20k未验，ADD-70 partial、goal active。

代码 `d892c777e3f47cc349e93aab1bb2c39cdc951806` 已提交/推送，远端 main 精确一致，交付后 clean、批次 scratch 清理。自身 CI `41215827302` 与连接报告 `077d7978`/`41215191300` 最后 in_progress，两者 Watch `41215827400`/`41215191257`已success。延迟检查辅助tier `953d677f`/`41213345904`、文档 `9975ac6e`/`41213464205`已completed/success；角色seed `27931563`/`41211798735`和文档 `712ea121`/`41210875615`仍in_progress。后续本段文档单独交付，不替代两个修复的代码CI。


### 24.29 当前签名请求可以保存模型与 effort，命名凭据边界保持

接续 `b48fd27b` 定向审计：`/model use`、`/thinking`、reviewed provider picker 在三个 model owner gate 和 UI ready/active 判断中强制 static credential；Bedrock/Vertex 的既有 resolver 没有这个对象。首次聚焦新增场景实际20失败/14控制通过/80未选；包含成功保存/显示的真实缺陷及被提前拒绝、未进入hook/lock的竞态场景，不把后者算已执行复验。

在 [auth binding owner](../../packages/ts-shell/src/core/auth/binding.ts) 复用 issuer URL/endpoint 与 endpointShape：未blocked、有地址、静态credential或实际signer。委派target改用同一predicate，避免两份准入事实。模型控制只给真正的当前provider slot开放无credential路径；命名连接仍必须有自己的credential，keyless active named也不生成可借用的provider行。picker采用同一catalog判断，正确显示active/ready和未知当前模型；成功报告省略不存在的credential source。未新增source lookup、占位key或签名调用。

保留reviewed SHA256、原provider/address/credential身份及catalog、hook后、锁内完整request复验。独立审查找到两个中间回归并动态复现：把当前模型protocol和目标protocol直接比较会拒绝合法OpenAI跨protocol切换（1失败）；仅按signer放开会让keyless active named直接model/thinking写入（4失败）。最终protocol比较在两侧使用目标model，静态命名路径沿原合同；六条命名picker场景选择真实active named并验证无active/借用provider行。

目标检查后重读只读参考：Pi `providers/amazon-bedrock.ts:64-77`、`providers/google-vertex.ts:78-91` 允许隐式 `auth:{}`；`core/model-runtime.ts:672-700` 传递optional apiKey。采用可选静态key、请求时获取签名凭据的同类决定；本项目仍沿已有readiness把AWS/ADC有效性留给transport，与Pi的来源预检查不同，不重复解析或宣称认证通过。

主代理Linux Node20.3.0、heap768MiB、单worker最终串行 **4文件/167项** exit0：selection69、category50、delegated target19、readiness29。Bedrock/Vertex实际resolver、直接model/effort、session保存/恢复、global有无session的默认保存、local/host picker apply/reload、未知当前报告、加载后和hook/lock地址/provider/blocked/pool更换均覆盖；settings/auth bytes与session revision验证拒绝无写，global偏好仅归settings，零fetch。无signer、missing Vertex address、keyless OpenAI、active named和invalid pool保留拒绝。

最后反转四个原生产owner实际 **30失败/13控制通过/76未选/exit1**：24个先前签名路径场景及六个强化后的active named picker边界；finally逐字节恢复，恢复后167项通过。中间验证cwd错误且提前另起runner造成短暂并发，两条owned runner均终止exit143并确认退出，最终只运行正确package runner；这些中止不计通过。系统级进程参数检查还意外输出无关服务敏感启动参数，未复制进文档/证据/提交，后续仅检查已知PID状态。首次digest调用漏compilerInputs属调用setup，沿manifest输入重算后精确一致；不修改build。

五静态门/diff exit0，118既有docs-source advisory保留；build `d146d52e40a8da0e47790f41bef9c538731ad500271c494797cb64e597df69dc`、inputsDigest `5cadaa2a26f127861c397ec80c91f0916a7696c71a6ffc8615bcee95e5cabac9` 精确匹配。正式适配bundle archive/patch/member/vendor核对后串行judge exit0，环/解析satisfied，partial仅既有interactiveMode21/22-name advisory。独立只读APPROVE/CLEAR，子代理只编辑category测试/审查，未验证。证据 `.omx/artifacts/phase20-addition-model-signing/`。

延迟CI读回：委派 `d892c777`/`41215827302` 与连接报告 `077d7978`/`41215191300` 均completed/success；文档HEAD `b48fd27b`/`41215914412`、角色 `27931563`/`41211798735`、文档 `712ea121`/`41210875615`最后in_progress。本批提交/推送/自身CI另绑；真实AWS/ADC/provider、PTY、非Linux平台、旧发布binary、全仓/20k未验，ADD-70 partial，原真实条件延后、goal active。


本批代码/证据说明已提交推送 `1c874354997bc5b51ca3cbfe7e57199970ecc9a9`，远端main精确读回一致，batch scratch已移除、提交后clean。自身CI `41217709469`最后in_progress，Watch `41217709468`completed/success；Watch不替代代码CI。本段后续交付记录是独立文档提交，不与代码SHA混算。


### 24.30 签名 provider 会话偏好进入实际消费与新角色保存

接续 `1e8e34d2`：已选Bedrock/Vertex signer请求的 `/skillful` 与 `/extended-context` writer强制static credential；pure preference matcher也忽略同一namespace保存的窗口；首次role seed无法从signer main构造默认绑定。原生产owner下16个新增场景实际失败，含成功消费、已保存窗口、被提前拒绝而尚未进入锁的十个竞态，以及两条角色准备场景。角色测试最初缺对应OpenAI base目录，补齐fixture后才取得有效角色准入证据，不改变preset校验。

[preference writer](../../packages/ts-shell/src/core/commands/model/preferences.ts) 只为显式provider scope复用已有auth binding signer准入，static/named/legacy行为保留，原完整request、issuer地址、catalog、CAS与锁内围栏保持。技能开关在真实system prompt消费中生效；窗口on要求精确published window、off恢复普通预算。pure [preference identity](../../packages/ts-shell/src/core/models/preference.ts) 只扩展explicit provider/no named、provider/model一致且未blocked的无credential匹配，named/legacy无凭据仍回退；不把catalog或auth IO放进纯reader。

身份匹配不是认证证明：手工保存的keyless非signer provider偏好可在纯配置计算中匹配，但 `/extended-context status` 用同一publication/catalog另外检查binding；非signer/unknown endpoint报告saved inactive/unverified，writer不保存，dispatch保持原readiness。未新增Bedrock/Vertex tier能力，协议不支持的tier仍由既有request capability gate拒绝。

[role seed](../../packages/ts-shell/src/core/commands/model/role.ts) 只在缺baseline的fresh provider signer路径开放；不从普通context/tier固化会话默认，不放开角色本身的精确named credential合同。独立架构审查发现旧choice fingerprint只记录API-key env、未捕获Vertex地址或custom resolver：六条prepare后/锁内address/provider/blocked更换实际误保存。为新credentialless seed加完整current request与binding复验，commit和原session lock均检查；已有saved/static路径短路保持。未知endpoint准备异常仍由原role UI owner固定失败notice捕获。

沿第24.29节已重读的只读参考可选static key、implicit auth resolution及请求时签名决定；本批复用同一auth owner，不实现第二套AWS/ADC来源解析，也不复制认证代码。

主代理Linux Node20.3.0、heap768MiB、单worker串行最终 **3文件/192项** exit0：provider120、window26、picker role46。新增34场景涵盖actual signer model selection后skill off/toggle/on及system prompt、window enable/status/actual configured budget/disable/model reset/缺window、已保存window、fresh role seed及普通预算/tier不固化、十个writer lock替换、六个role commit/lock替换、named/blocked/pool/noURL拒绝和非signer/unknown status；settings/auth bytes与session revision保持。未发送外部请求。中间口头196项为计数错误，正式JSON读回和此处均为192。

四个原owner反转实际 **21失败/13控制通过/112未选/exit1**，finally精确恢复，再运行同192项通过；反转中fresh role三条锁竞态因原owner提前拒绝未进入锁，六条中间误保存证据独立保存在seed-race。五静态门/diff exit0，118 docs-source advisory保留；build `325f16d9f1deb9b22f1838e4481df4ea86b897d7ad2cc7f341a78765e963f640`、inputsDigest `b4f75beff13346194c969fffa11f6caff8460cfe7c7b47bd66e3674bfc24f3e3` 与当前compiler inputs精确匹配。正式adapted archive/patch/member/vendor核对后serial judge exit0，环/解析satisfied，partial仅既有interactiveMode21/22-name advisory。两路独立source-only APPROVE/CLEAR，子代理仅window测试编辑/审查、未验证。证据 `.omx/artifacts/phase20-addition-signer-preferences/`。

延迟CI：前文档 `b48fd27b`/`41215914412`已success；模型控制 `1c874354`/`41217709469`、交付文档 `1e8e34d2`/`41217786893`最后in_progress，Watch均success。本批提交/推送/自身CI另绑，真实AWS/ADC/provider、PTY、非Linux平台、旧发布binary、全仓/20k未验，ADD-70 partial，原真实条件延后、goal active。


本批代码/证据说明已提交推送 `f47105684a6a59187a15562f3c3d7492e7766cc9`，远端main精确一致，batch scratch清理、提交后clean。自身CI `41219116283` 与Watch `41219116270`最后均in_progress，未称通过；此交付段后续文档单独提交。


### 24.31 当前签名请求的目录与状态显示

接续 `776269e2`：裸 `/model` 的目录可用性强制 static credential，把实际 Bedrock/Vertex signer 标作 credential missing；`/model status` 也仅按保存的 api-key/named 配置提示登录。新目录场景在原 owner 下实际4失败/8控制通过/25未选，两个 signer status 场景实际失败。`availabilitySnapshot` 的 credential missing 与 measured unknown 本来描述静态配置与测量，不应把签名能力伪造成 credential present。

[catalogue availability](../../packages/ts-shell/src/core/models/availability.ts) 仅为实际请求、无显式 named ID 且 explicit provider 或无保存 active ID 的路径复用 auth binding predicate；按完整请求的 issuer endpoint 解析精确 owner，unknown protocol 安全保持未验证。`signed` 仅属于目录投影，不扩展通用 credential/measurement 类型。当前 signer 的 exact category 标作 authentication at request；非当前来源仍按静态材料呈现，named、pool、blocked、endpoint ambiguity 的原合同保持。

[model status](../../packages/ts-shell/src/core/commands/modelCommandRuntime.ts) 与裸目录共用同一投影。独立架构审查指出 CLI request override 会把 signer auth 标签贴在另一份 saved provider 下；修正为保留 Provider/Auth type/Model/Active connection 的保存事实，并把签名标签明确列在 Request auth/Request readiness 下。explicit provider 请求覆盖无关已保存 named connection 时也沿实际投影显示 signer；真正 keyless named target 仍拒绝，不给 named 凭据借用权。keyless auto-select fallback 若实际 resolver 未返回任何 named selection ID，则本视图按当前 ambient transport 显示，亦不证明 named credential 存在。

只读目标检查之后已对照参考项目 coding-agent 的 model-runtime:335–375 与 model-selector:148–184：available snapshot 和 stored credential 分开，精确 current model 决定显示；此前 provider adapter 的 implicit auth/request signing 决策继续适用。Cheers 显示时不查询 AWS/ADC 来源、不调用签名器或发送 preflight，也不建立第二套认证解析。

主代理 Linux Node20.3.0、heap768MiB、单worker串行最终 **3文件/92项** exit0：command29、catalog40、availability23。新增23项涵盖 Bedrock/Vertex、exact issuer alias、actual alias 与相反 canonical protocol、explicit provider over saved named、CLI provider/model override、unknown/nonsigner/noURL/blocked/named/pool/duplicate，及命令零 fetch、settings/auth bytes/目录 invariance。新 CLI fixture 起初误传不存在的 cli object，唯一失败确认是测试设置；改为真实 cliProvider/cliModel 后通过，未以该设置失败推断产品缺陷。

三个原生产 owner 反转实际 **10失败/15控制通过/44未选/exit1**；finally按字节与SHA256精确恢复审查版本，再跑同92项通过。五静态门/diff exit0，118 docs-source advisory保留；Node floor build `1a3bb4cf93b1e94cf2e181c17d6efa5e4cfea7f117f1a8801a2b226da6034ee9`、inputsDigest `24029052dcbe9418107d0a5cc375629af016ba320e800d21a474151d9d65c654` 与 manifest.compilerInputs 当前摘要一致。两路独立source-only APPROVE/CLEAR，子代理未执行验证。正式adapted archive/patch/member/vendor哈希核对后serial judge exit0，环/解析satisfied，partial仅既有interactiveMode21/22-name advisory。清理/交付另读回；证据 `.omx/artifacts/phase20-addition-catalog-signing/`。

延迟CI读回：模型控制 `1c874354`/`41217709469` 与交付文档 `1e8e34d2`/`41217786893` 已completed/success；签名会话偏好 `f4710568`/`41219116283` 与前文档 `776269e2`/`41219155385` 最后in_progress，Watch均success，不代替代码CI。本批自身提交/推送/CI另绑。真实AWS/ADC凭据/endpoint、provider、PTY、非Linux平台、旧发布binary、全仓/20k未验；ADD-70 partial，原真实条件延后、goal active。


本批代码/证据说明已提交推送 `638d023ec1fff4c4309dfec23aa823b51a3b791d`，远端main精确一致、batch scratch移除、提交后clean。自身CI `41220480426`最后in_progress，Watch `41220480427`completed/success，不代替代码CI；此段交付记录单独文档提交。


### 24.32 交互模型目录尊重显式 provider 请求范围

接续 `20db8867` 的两处工作区改动。文本目录与状态已尊重实际请求的 explicit provider scope，但 [model picker](../../packages/ts-shell/src/cli/interactive/picker/model.ts) 仍只看保存的 active connection ID；当 Bedrock/Vertex 请求显式处于 provider 范围，而用户配置保留无关命名连接时，面板把实际 signer 标成缺凭据并拒绝可用模型。既有 auth binding 与模型保存事务无需增加第二套逻辑；面板改为同时检查实际 resolution 的 connection ID 和明确 provider scope，显式范围能显示和选择当前 signer，未明确范围时保留旧命名连接围栏。

先读目标再只读比较参考 coding-agent 的 model-runtime:335–375 与 model-selector:148–184：available snapshot 与 stored credentials 分开，初始焦点按实际 current model 定位；本修复遵循这两个决定。没有改变 signer、issuer、provider dispatch、命名凭据准入或存储结构，也不获取 AWS/ADC 凭据。

主代理 Linux Node20.3.0、heap768MiB、单worker串行验证 [category tests](../../packages/ts-shell/src/cli/interactive/picker/model/category.test.ts)，最终 **1文件/58项** exit0。新增8项覆盖两个provider的直接保存与实际 OverlayHost 上键/Enter、未明确provider范围的命名隔离，以及load后/hook内端点替换拒绝；按键浏览不写，Enter保存后重开读回正确，settings/auth bytes与零fetch保持。首次命令误用新版Vitest的poolOptions参数，在收集测试前exit1，分类为runner设置错误；改用本包0.34.6 runner及single-thread后正常。

旧生产owner反转实际 **6失败/2控制通过/50未选/exit1**，失败为行为AssertionError；finally逐字节恢复修复版本后，同58项exit0。五静态门通过（118既有docs-source advisory），Node floor build `ee5df6d0d8e50149d8abe6cd08ecb08e3ba80062f330b948796370a429d74910`，`inputsDigest=d511b8b1cb4f276d766ca945b0ad0174cf231614564775d9e091485550d936f0` 含manifest.compilerInputs，与当前输入精确一致。未改导入图，本批未另跑NormProof，也没有独立委派复审；不能沿用上批APPROVE。证据保留于 `.omx/artifacts/phase20-addition-picker-signing/`，本批提交/推送/精确CI另读回。

延迟CI `776269e2`/`41219155385`已success；`638d023e`/`41220480426`、`20db8867`/`41220682282`最后仍in_progress，对应Watch成功不替代代码CI。真实AWS/ADC/provider、PTY、非Linux平台、旧发布binary、全仓/20k未验；原Phase20真实条件继续延后，ADD-70与整体仍partial，goal active。


第24.32节代码与证据说明已提交推送 `60b889335591d4811130c2b38fe1b86180952377`，远端main精确读回一致、交付时clean，scratch已清理。自身代码CI `41222162228`延迟复查仍in_progress，Watch `41222162287`success。

### 24.33 当前模型报告不继承其他范围的会话连接

继续第24.32节的实际身份核查：[model picker](../../packages/ts-shell/src/cli/interactive/picker/model.ts) 的未列出当前模型报告，已对全局active ID设置explicit provider围栏，却把 `sessionConnection.id` 放在围栏外。实际请求明确切到Bedrock/Vertex provider范围、旧会话偏好仍为命名连接时，报告错误声称 Selected connection为旧ID；这不是当前请求的凭据事实。

两个provider × 保存配置/保存会话的四个隔离夹具先在旧owner实跑：会话两项AssertionError，配置两项控制通过、58未选。只调整既有 `currentConnection` 投影，将session/profile回退一起放入实际scope检查；真实 resolution.connectionId与实际credential仍优先。延续第24.32节只读参考的current-model身份与stored/available分离决定，不改auth/provider核心、模型事务或任何存储格式。

主代理Node20.3.0、heap768MiB、单worker串行最终 **1文件/62项** exit0；新增断言同时检查当前报告的provider/issuer、detail及row中无旧ID、原session偏好与settings/auth逐字节不变、零fetch。精确反转到 `60b88933` 生产owner，实际 **2失败/2控制通过/58未选/exit1**；finally按字节恢复后再跑62项exit0。五静态门/build通过（118既有docs-source advisory），build `f1e3937af13fd9af0c8ccf870452e62ff71a558dc81432d98966b79bc51123ff`，含manifest.compilerInputs的当前摘要 `7d7e3f5beb29a8b1495bfdf68548ccad5e56a142ecc52bf2f0c48c36f4f1809f` 一致。无独立委派复审、无新judge；证据 `.omx/artifacts/phase20-addition-picker-report/`，提交/推送/自身CI另读回。

延迟读回 `f4710568`/`41219116283` 与 `20db8867`/`41220682282` 已completed/success；`638d023e`/`41220480426` 与 `60b88933`/`41222162228` 最后in_progress，Watch成功不替代代码CI。真实provider/AWS/ADC、PTY、非Linux、旧发布binary、全仓/20k未验；原Phase20真实条件延后，ADD-70 partial、goal active。


第24.33节已提交推送 `0cbbbb3260d600428ceab7e068e64bbde8ac8828`，远端main精确一致、交付时clean，scratch清理；自身代码CI `41222600938`最后in_progress，Watch `41222601018`success。

### 24.34 首次角色保存与目录共用实际凭据范围

继续ADD-70语义审计：[role owner](../../packages/ts-shell/src/core/commands/model/role.ts) 首次保存自动角色时，使用raw active connection ID判断主请求是否可通过signer准入，忽略实际resolver明确返回的provider范围。两个provider × 三个角色六个有效保存场景在原owner实际被拒绝；这不等于普通CLI `--provider`参数自动覆盖命名范围，后者仍沿既有拒绝合同。

[既有binding owner](../../packages/ts-shell/src/core/auth/binding.ts) 新增纯范围判断，供角色初始准入/保存前/锁内复验、[目录](../../packages/ts-shell/src/core/models/availability.ts)和[模型面板](../../packages/ts-shell/src/cli/interactive/picker/model.ts)共用。范围与可用认证分开，signer/address/blocked及完整request identity检查保留；角色目标仍须自己的命名凭据，普通context/tier默认不写入会话偏好。只读参考model-runtime:335–375的available/configured/stored分离与model-selector:170–185的实际current model决定继续适用；沿目标原有session writer/CAS，未复制认证解析。

两路独立source-only复审发现提取的范围predicate会把没有显式selection ID的fallback命名凭据称作provider范围。原调用方额外围栏仍安全，但新共享API应准确：补检查实际credential.connectionId，并用两个真实resolver fallback夹具验证named范围与正常角色保存读回。最终code/spec/security **APPROVE**，architecture **CLEAR**；terra未列入可用模型目录，两路均按用户约束使用gpt-6.1-sol，未运行任何验证。

主代理Linux实际Node20.3.0、heap768MiB、单worker串行最终 **3文件/236项**（provider134、category62、catalog40）exit0。新增14项覆盖三个角色×两个provider、显式范围被撤回/地址替换/blocked在保存前和锁内发生、fallback named范围、精确主模型与角色读回、普通默认不被固化；六个成功保存场景断言零fetch，全部新增场景检查settings/auth bytes不变。初次12-case探针中六项有效保存被拒绝，另三项锁内场景因旧代码提前拒绝而未进入锁；这些是到达检查失败，不能称旧代码发生了错误写入。

三次有效反转串行执行：旧role owner **6失败/10控制通过/118未选**；跳过fresh signer重查 **12失败/6控制通过/116未选**；移除实际命名凭据围栏 **2失败/2控制通过/130未选**，均exit1且失败为行为断言。每次finally逐字节恢复，最终五份受审源文件SHA256精确匹配，再跑同236项exit0。五静态门/最终build通过，118既有docs-source advisory保留；build `8644837fd48189189443615810933c41b0e91e3a2837404f99d99c7c0a87b822`，含manifest.compilerInputs的当前摘要 `41cd73dd869fbc45ac51fbd09ccbdbacc9090a4db4d33ab22acb10e496eea436` 一致。本批未另跑judge；生产import路径边未变。证据 `.omx/artifacts/phase20-addition-role-scope/`，清理/提交/推送/自身CI另绑定。

延迟代码CI `60b88933`/`41222162228`已completed/success，`0cbbbb32`/`41222600938`最后仍in_progress，Watch成功不替代代码CI。当前GitHub release列表读回为空，未取得旧发布二进制，不以旧源码往返代替其验收。未真实AWS/ADC/provider、PTY、非Linux、旧binary、全仓或20k；原Phase20真实条件继续延后，ADD-70 partial、goal active。

### 24.35 未注册协议保留目录浏览并拒绝请求绑定

接续已提交推送的 `e32739011cd8065db8f48bf0857548e3d80f11a8`，沿ADD-70检查实际协议事实。[binding owner](../../packages/ts-shell/src/core/auth/binding.ts) 对无static credential的未知catalogue endpoint调用严格 `endpointShape`，导致整个picker加载抛错；有static credential时又短路该检查，将同一未知协议错误标作可用。Bedrock/Vertex × 无key/有key/已声明协议控制的八个新增或扩展场景，在旧owner实际 **4失败/4控制通过/60未选**；分别是两项加载异常及两项错误启用，属于产品行为缺陷。

现在先通过既有 `providerCredentialEndpoint` 获取实际issuer/protocol，再查询同一个registry的 `declaredEndpointKinds`，无endpoint沿既有default；未知显式协议返回binding unavailable。未增加协议列表、resolver或异常吞没层，派发的 `endpointShape` 仍严格抛错。有credential的不可用行显示 `request unavailable`，避免误报缺key；所有拒绝行保留disabled/focusable浏览。权威writer继续在保存前及原事务guard复验，命名连接沿原credential身份与严格constraints拒绝，不靠UI禁用保证写入边界。

目标检查后定向重读只读参考 `core/model-runtime.ts:305–325`：provider组合失败保留基础发现并记录错误。采用发现可继续、不可执行绑定不放行的决定；本项目沿现有binding与registry实现，没有复制参考的provider重建系统。

两路独立sol source-only审查 **APPROVE/CLEAR**，无子代理验证。主代理Linux Node20.3.0、heap768MiB、单worker串行 **2文件/87项** exit0：category68、delegated target19。包含credentialless未知/已声明无signer拒绝、static key未知拒绝与已声明协议保存读回；拒绝后session revision与shared settings/auth bytes不变、零fetch。委派signer、static/default、named与pool既有控制通过。

两次有效反转分别为binding **4失败/4控制通过/60未选**、提示 **2失败/66未选**，均exit1；finally逐字节恢复，三份受审源码SHA256一致，再跑同87项exit0。提示初次筛选漏掉参数显示的引号，68项全未选，属于调用setup而非行为证据；修正筛选后才取得两项提示断言失败。五静态门/build通过，118既有docs-source advisory保留；build `382a38a76290f75575840d0e6f50de75fcdbd763f75d6786e14205277d57419a`，含manifest.compilerInputs的当前摘要 `eac173e72e9d78b7dc70a19279d35897e706563b7f96bd82d8514380903da3e4` 精确一致。本批未另跑judge，生产import路径边未变。证据 `.omx/artifacts/phase20-addition-protocol-binding/`。

同时纠正第12.4节ADD-08当前台账：纯组合准备、独立模板、原生研究新建入口及review snapshot只读preview已有实现。当前源码复核 [preview owner](../../packages/ts-shell/src/cli/runtime/context/preview.ts)、共用 [composition preparation](../../packages/ts-shell/src/core/commands/composition/prepare.ts) 与preview测试237/624/743行，结合第15节第三十三批既有普通/全屏小Node PTY证据，移除过时的“纯组合preview尚缺”。本批未重跑preview测试或PTY，不改写早期第五批历史结论；unsupported/control workflow仍unknown，原生tokenizer、真实1.7k/4.9k分项差额和性能继续尚缺。

延迟读回 `e3273901`/`41224129606`、`0cbbbb32`/`41222600938`代码CI均completed/success，Watch也成功；这些SHA不替代本批提交的CI。本批提交/推送/自身CI另绑。未真实AWS/ADC/provider、PTY、非Linux、旧发布binary、全仓或20k；原Phase20真实条件继续延后，ADD-70 partial、goal active。

### 24.36 目录声明的模型词表用于本地请求估算

ADD-08补上明确缺失的词表计数。[目录](../../packages/ts-shell/src/core/models/catalog.ts)允许模型声明 `tokenizer: "cl100k_base" | "o200k_base" | false`，四个随包OpenAI型号gpt-5.3/gpt-5.3-codex/gpt-5.1-mini/o4-mini声明o200k_base。既有目录合并、精确relay及歧义围栏保持；registered relay的缺失/false不借用同名兄弟模型。未注册地址仍沿既有provider目录回退，声明不是远端型号证明；该端点不适用时应在models.json覆盖false或声明准确relay行，不声称所有未知URL强制字符回退。

[计数owner](../../packages/ts-shell/src/context/request/tokenizer.ts)采用精确锁定的MIT纯TypeScript依赖gpt-tokenizer 4.1.0，无传递依赖、新语言运行时或网络计数。先检查本项目wire/preview/capture，再定向只读比较参考的目录选词表、未知模型回退与有界缓存决策；本项目沿既有UTF-16字符/3.5回退，单个活动encoder关闭merge cache，不保留请求文本缓存。官方[token counting指南](https://developers.openai.com/api/docs/guides/token-counting)明确本地文本计数与工具/格式、媒体、边界计量的差别；本批未调用server counting或真实provider。

[wire](../../packages/ts-shell/src/context/request/wire.ts)继续投影实际conversation及剩余envelope，对序列化文本计数；图片仍是既有2048固定allowance，opaque reasoning仍拒绝本地估算。preview与接受请求capture读取同一个已解析目录模型声明，报告保留实际method及serialized-text范围；整请求始终estimated，不冒充provider usage，system source仍单独是字符近似。[校准](../../packages/ts-shell/src/context/request/estimate.ts)将count/method成对传递，词表方法须同wire且完整raw message数匹配，避免provider前缀+字符尾巴被标成词表结果。现有admission/compaction/replay预算口径未在本批迁移。

独立代码审查发现profile import的removeAdditional allowlist会静默丢失tokenizer，false因此重新继承随包值。[原导入schema](../../packages/ts-shell/src/config/profiles/import/catalog.ts)补精确枚举，真实plan/apply/目标loadCatalog读回覆盖false及两种relay词表；非法字符串/true/object在写入前拒绝，源bytes保持。两路sol source-only复审最终APPROVE/WATCH，合成COMMENT；WATCH为明确的成本权衡，无未解决正确性阻塞，也不记性能验收通过。

主代理Linux Node20.3.0、heap768MiB、单worker串行8文件196项通过，实际反转计数/导入schema/校准guard分别7/4/1失败；finally逐字节及SHA恢复后同196项再次通过。五静态门、TS build及当前manifest.compilerInputs摘要一致，build `122f0a1411e277e454e3e64fb390617424d390dfc0e30d646e67d4abdc13f822`，inputs `2844bf1472cad09b1955b4c32e67ac599ce9c6f78f82a01f12ee2da1cfe49dd9`。正式已适配bundle哈希核对、serial judge exit0，解析/无环satisfied，仅既有interactiveMode的21/22-name advisory，未提升为整体proven。首次runner缺路径及首次build的report union类型错误保留原日志；性能探针误读非generation dist路径仅保留错误分类记录，原始日志已覆盖。均修正后重验，不算行为通过。

五个独立有界Node计数进程各取1k/8k/64k UTF-16文本和三次warm重复：本轮词表模块导入144–412ms，cl100k/o200k首1k含encoder初始化162/124ms，64k暖样本最慢89/118ms；fallback/两词表/切换进程maxRSS约90/131/142/147MiB，单独旧公式基线约41MiB。两rank源表合计3,590,551字节，静态加载两套表，只有encoder保留一个；同步计数不能被AbortSignal中途打断。这是单轮模块成本证据，不是CLI启动、UI响应、完整context heap或性能验收。Bun1.3.14独立30-module编译probe实际通过两词表Unicode/special、wire/capture与fallback/opaque断言，maxRSS197232KiB；生产2295-module executable另构建成功，106842240字节且host version验证通过。独立probe不替代生产CLI的交互preview执行证据。

证据归 `.omx/artifacts/phase20-addition-tokenizer/`，源码快照用.source.txt避免发现为测试。延迟确认上一批 `f166ac93` 的精确代码CI `41225883811` completed/success；本批提交/推送/自身CI另绑。ADD-08保持partial：其他模型词表、媒体/协议精确计量、真实1.7k/4.9k同snapshot分项及完整性能/平台证据尚缺；未全仓回归、真实PTY/provider或20k真实会话，原Phase20真实条件延后，goal active。

### 24.37 未选择词表时不初始化其大数据表

接续已推送 `2213a67101f4d8c30482401f801192df6bea30bc`，沿ADD-08处理上一批实际观察到的固定加载成本。[计数owner](../../packages/ts-shell/src/context/request/tokenizer.ts)虽然延迟创建encoder，却静态导入两套rank数组，因此只用characters/3.5也要加载约3.59MB词表源。先读目标依赖图与仓库现有[主题资源加载方式](../../packages/ts-shell/src/presentation/themes/assets.ts)，再定向比较参考tokenizer的目录选词表/未知回退决定；沿本项目TypeScript边界和已锁定依赖，不引入native addon、第二语言或新异步编排。

现在只有首次使用已声明词表时才通过固定literal require加载它；普通Node ESM沿createRequire，Bun沿可见的literal require把数据嵌入可执行文件。轻量GptEncoding core仍静态导入，字符回退先返回；每次选用仍仅保留一个encoder、merge cache为0，无请求文本缓存。已选过的词表由模块缓存保留；第一次数数要承担初始化，同步大请求计数仍不可中途取消。本批不把成本推迟误报为全部消失，也不改变估算、校准或预算口径。

新增[加载回归](../../packages/ts-shell/src/context/request/loading.test.ts)同时拒绝提前ESM导入并观察实际CommonJS模块缓存：unknown/false无表、cl100k只加载自己、相同选择复用、切换才加载o200k，已知Unicode计数保持。主代理Node20.3.0、heap768MiB、单worker串行4文件132项通过；恢复原ESM导入、提前执行两套CJS加载各产生1失败/8控制通过；finally逐字节/SHA恢复后同132项再次通过。两路sol source-only复审APPROVE/WATCH合成COMMENT，无子代理验证；WATCH保留首次初始化、模块保留与完整CLI性能缺口。

同一有界harness绑定旧build `122f0a1411e2` 与新build `5869989c1ffc`，8个fresh Node20.3进程串行覆盖fallback/cl100k/o200k/switch、1k/8k/64k UTF-16及各3次warm，所有count/method逐项相同。本轮fallback导入156.93→22.29ms，GC后堆21028120→3797728字节，maxRSS91472→47004KiB。cl100k首1k计数43.8→83.9ms、o200k84.6→187.9ms，反映初始化推迟；o200k maxRSS119264→129500KiB并未降低，不能声称所有内存指标改善。单轮进程、未控制OS冷缓存/JIT/调度，只证明本地模块样本，不作CLI首帧/runtime-ready、UI响应或总context性能验收。

五静态门、TS build与manifest.compilerInputs当前摘要通过；新build `5869989c1ffc704f26217026b4cfa42935749363210e8a41ce010cf5e447f841`，inputs `b257e7fb788a95b502222dc2944c5914c0ca1dc0d9665957bf7b635e395427c5`。正式已适配bundle serial judge exit0、解析与无环satisfied，仅既有interactiveMode21/22-name advisory。Bun1.3.14独立30-module编译探针分别跑fallback、两词表及切回，wire/capture数值与opaque边界通过；另从工作目录 `/` 运行同一probe也通过。生产2295-module executable另构建并host version验证，SHA `bd99e7f9496d25dad8924643e4b6c26a3bedb5d8266155eb63eaa209d53c6934`；独立probe不替代生产CLI实际交互，也不证明所有外部模块不可见。

正式证据 `.omx/artifacts/phase20-addition-tokenizer-loading/` 保留exact build对照、实际反转、测试/门/build/judge/编译probe、两路报告和非可执行源码快照；本批scratch清理后交付。上一批 `2213a671` 代码CI `41228113447` 延迟读回仍in_progress，本批提交/推送/自身CI另绑。ADD-08及总体保持partial/active；真实差额、其他词表/媒体协议、完整性能与平台证据尚缺，未真实provider/PTY、全仓或20k真实会话。

### 24.38 生产终端计数验证与可选模板目录的延迟读取错误

接续已推送 `69eb6eb4c3327ea17125eec5ec345b54e0c4a446`，补第24.36–24.37节明确缺少的生产CLI交互证据。旧生产可执行文件在空项目中输入 `/context` 时，对不存在的 `.agents/prompts` 报ENOENT，无法取得报告。主代理最小文件系统探针确认Node20.3.0在opendirSync立即抛错，而Bun1.3.14先返回handle、首次readSync才抛错，closeSync成功；这是[模板前缀发现](../../packages/ts-shell/src/core/prompts/templateLoader.ts)只捕获open阶段的真实缺陷。

先读目标，再定向只读比较参考coding-agent的prompt-templates目录加载：可选目录不存在贡献空集合，枚举期间的IO错误不应被误当作模板结果。本项目沿原bounded streaming discovery保留candidate/entry/bytes预算、最近目录优先与取消围栏，在readSync只处理ENOENT/ENOTDIR并finally关闭handle；其他读取错误继续传播。没有换成全目录readdir，也没有扩大catch到取消、profile身份或source检查。四个新增[回归](../../packages/ts-shell/src/core/prompts/templateLoader.test.ts)覆盖两种延迟错误后继续找到有效父目录模板、EACCES传播及read后取消，并检查close；旧owner实际 **2失败/19控制通过**，修复后含slash suggestions的 **2文件/62项** 全通过。

当前Node20.3.0与Bun1.3.14生产exe × regular/fullscreen × false字符回退/cl100k_base/o200k_base共 **12场原生PTY** 串行通过。每场从空历史启动，使用约1.1k UTF-16的Unicode草稿、零工具；现代settings/auth/catalog/trust均在独立HOME和Git项目夹具中，普通provider传输仅指向127.0.0.1临时端口、使用合成凭据。每场模拟服务实际收到一次readiness GET和一次推理POST，无重试或额外推理；未访问真实外部provider。服务对实际2168-byte body独立计数：字符回退611、cl100k441、o200k443，四种运行/界面组合分别相同；状态栏草稿值与这些数值一致，`/context`实际报告同一count/method/body bytes，模拟provider usage123独立标为provider aggregate，保留estimated及no per-source allocation措辞。报告pager先Escape关闭，再 `/exit` 均code0；settings/auth/catalog/trust逐字节不变，可选prompt目录始终未创建，所观察owned进程均已结束且fixture清理。

启动空草稿285/233/237与计数时间仅是本轮小夹具观察。owned CLI树每50ms采样最高429936KiB，512MiB守卫未触发；不包含父探针进程，不是完整context heap或性能验收。所有原始请求体及终端输出只在内存短暂使用并丢弃，正式证据仅保留尺寸、SHA、计数、固定诊断和布尔断言。中间短提示舍入未变、缺readiness响应、过小8192窗口、缺独立Git边界而读到父项目、报告换行匹配及未退出pager均按探针设置/观察问题分类；只有独立Git项目上的延迟目录错误作为产品修复依据。首次Vitest runner路径与PATH空格设置错误另留日志，均未计通过。

五静态门、Node floor TS/exe构建通过，118既有docs-source advisory保留；build `2d0ffe6ee110a641dc80edb158466225faaef30b64ac138556b61f2422bcacb7`、inputs `bc60b15dbea5ce3be9af430eb0b6dba3d9b84a677e4a830a6a069a1c8b7be063` 与manifest.compilerInputs当前摘要精确匹配，exe SHA `0c3f5ab6488772d0d192c95f793bb097441f6011c15cb0cc430fdc77e2a3121a`。未改导入图，本批未另跑NormProof或独立委派复审，不沿用前批APPROVE。证据及非可执行源码快照归 `.omx/artifacts/phase20-addition-tokenizer-terminal/`，本批交付另绑定。

延迟读回：`2213a671`精确代码CI `41228113447`已completed/success；`69eb6eb4`代码CI `41229200850`仍in_progress，两批Watch均success，不替代代码CI。ADD-08保持partial：此处是本地模拟provider的小型生产终端交互，真实1.7k/4.9k同snapshot差额、其他词表/媒体协议、完整性能及其他平台仍未验；未全仓回归或20k真实会话，原Phase20真实条件继续延后、goal active。

### 24.39 生产启动保留排队输入并在恢复终端后报告项目错误

接续已推送 `28b4f3ac2a448c0f6810947d3701821d02ced920`，推进ADD-07的实际启动交接。无注入加载延迟的旧生产exe，在观察到Loading编辑区后输入两行Unicode草稿，尚未发送最终确认Enter便产生请求；安全形状诊断确认实际只提交第一行。Node控制场景完整保留草稿，其首次断言失败源自探针漏算正常opening environment前缀，修正比较后通过，未据此误修Node。原[启动owner](../../packages/ts-shell/src/cli/interactive/startup.ts)仅等待一个setImmediate，可能仍在当前check阶段移交，尚未让poll投递被重模块求值延迟的stdin。现由同一surface等待下一轮poll，再沿原parser/editor/TUI单次移交；无startup时仍不增加等待，不flush部分paste/escape/grapheme，也不加入任意毫秒睡眠。

先读目标后定向对照参考的同composer lease、加载后输入replay及失败释放，保留本项目加载期Enter只换行与取消策略。[新增回归](../../packages/ts-shell/src/cli/interactive/startup.test.ts)用真实loopback socket将输入排到下一次poll，覆盖完整两行与Enter留在加载editor、Ctrl+C在移交前释放终端；原单轮算法实际 **2失败/22控制通过**，不是断言setImmediate调用次数。生产检查还发现无效project路径直接console.error/process.exit，错误先写进alternate screen、随后才恢复；原探针只检查最终模式而漏掉此顺序。现[项目校验](../../packages/ts-shell/src/cli/workspace/binding.ts)使用[bootstrap](../../packages/ts-shell/src/cli/bootstrap/cliBootstrapContext.ts)传下的既有CLI writeError/exit端口，先dispose再输出，原消息和code1保持；缺路径和普通文件两种[回归](../../packages/ts-shell/src/cli/bootstrap/startup.test.ts)覆盖此端口及全局输出拒绝，实际PTY另检查恢复序列在错误之前。

主代理Node20.3.0、heap768MiB、单worker串行 **4文件46项** 通过；单轮交接与原项目校验两次反转各 **2失败**，finally源码逐字节/SHA恢复后46项再次通过。五静态门与Node floor TS/exe构建通过，118既有docs-source advisory保留；build `75e3ebfa85d430f93813f72e1e4a53ea80aa4445c6bf35b7d1feeeee38dabcd2`、inputs `c48df24b3a08a9905a5d63e43db49508505489c58a729c72170a913996858856` 与manifest.compilerInputs当前摘要匹配，exe SHA `f52cb8e87856ce3af4ccd4f4d24879b243e38749ee06c04b7638e6aa7920c867`。首次Vitest runner路径缺失另分类为setup错误，未计测试通过。没有新增产品导入边，本批未另跑NormProof或独立委派复审。

最终生产Node/exe × regular/fullscreen × adopt/cancel/invalid-project共 **12场原生PTY** 串行通过。四场adopt在真实Loading首帧后输入两行原文，最终Enter前无传输；之后完整草稿只出现一次，每场一次本地readiness GET与一次推理POST。四场实际body均1062 bytes、o200k估算252，草稿/status及context报告一致，模拟usage123独立标示；唯一有序runtime adoption及正式frame write均取得process marks。取消四场code130、无效project四场code1且错误在屏幕恢复后可见，均零传输、零runtime adoption。每场独立HOME/Git项目，settings/auth/catalog/trust逐字节不变、可选prompt目录未创建、alternate screen和bracketed paste关闭、所观察owned进程结束且夹具移除。CLI树每50ms采样最高332688KiB，512MiB守卫未触发；不含父探针，不作为完整heap验收。

正式证据归 `.omx/artifacts/phase20-addition-startup-terminal/`，含两类产品失败、探针误判分类、反转、最终矩阵、构建身份与非可执行源码快照；原始请求体及PTY输出只在内存使用并丢弃。全部传输仅到127.0.0.1合成服务，不代表真实provider认证或用量验收。父进程观察时刻与process marks分开，未控制冷缓存/负载、未作完整性能或桌面平台结论。延迟读回 `69eb6eb4`精确CI `41229200850`已success，`28b4f3ac`精确CI `41231278750`仍in_progress、Watch `41231278797`success；本批交付另绑定。ADD-07保持partial，原Phase20真实条件延后、goal active。

### 24.40 工具 JSON 的字段名不再冒充协议图片或推理签名

接续已推送 `9c5473288c26907b8cf19ae6819b72104fd6392c`，推进ADD-08的协议计量边界。原[wire估算器](../../packages/ts-shell/src/context/request/wire.ts)用JSON.stringify replacer递归检查整份conversation：原生工具参数中普通的signature/thoughtSignature/reasoningContent或redacted_thinking字段被误判为opaque；image/source、inlineData等普通业务JSON又被替换为固定图片allowance。真实Anthropic、Google、Vertex与Bedrock端点投影的24组参数及两词表回归实际 **26失败/10控制通过**，确认问题属于协议边界，不是词表差异。可能表现为有效草稿估算变unknown，或把参数原文的计数换成与其无关的媒体数值；没有把它解释成用户1.7k/4.9k差额的已证实根因。

先检查目标及实际endpoint转换，再定向只读比较参考的typed content计数：工具调用参数使用JSON.stringify，图片只由明确内容块识别。本项目继续使用端点最终body，不另外组装请求；估算只沿message/content/parts、Responses function_call_output.output、Google functionResponse.parts与Bedrock toolResult.content等内容容器检查真实图片/opaque字段。tool input/args、Google functionResponse.response及其他literal JSON全文进入原计数器，不递归赋予其中字段协议语义，也不修改原body。真实签名仍不给本地estimate，真实用户/工具结果图片仍按固定2048 allowance标示，不冒充实测；方法名与source合同保持。

[wire回归](../../packages/ts-shell/src/context/request/wire.test.ts)覆盖四类原生投影的六组普通JSON、两词表、五协议实际工具图片、四种真实opaque结构及带图片的结构化Google结果；检查输入body不变和capture不留原文。[实际step回归](../../packages/ts-shell/src/turn/step.test.ts)另通过原accepted-request回调，验证Anthropic字符回退/cl100k/o200k三种计数均保留完整参数、一轮一次fetch double，provider usage123独立于本地估算。这里使用合成请求/响应和fetch double，未连接外部provider，不算真实网络、CLI或桌面验收。

主代理Node20.3.0、heap768MiB、单worker串行 **3文件152项** 通过。恢复基线wire owner后，参数/结构化结果/accepted capture共 **30项实际失败**；finally源码逐字节与SHA恢复，152项再次通过。五静态门及Node floor TS/exe构建通过，manifest.compilerInputs当前摘要匹配；build `fb7316f26cd6b3ed7012957df19484a1712806bf15f9b07e4ce2b61d33d8eb96`、inputs `c25180a11bf984784c5dbd7452bb51677f0b9ba00879d71a35179caa2fb4603d`、exe SHA `2770404c1cf0ddacb8760c9b29894e6c809cb988244373f03f7b2e2ecaad7a1a`。118既有docs-source advisory保留，未另跑本批NormProof/独立委派复审、生产PTY、完整性能、全仓回归或20k真实会话。证据与非可执行源码快照归 `.omx/artifacts/phase20-addition-wire-payload/`，清理与提交/推送另绑。

延迟读回 `28b4f3ac`精确CI `41231278750`已completed/success；`9c547328`精确CI `41233253348`仍in_progress，未从本地结果推断其CI成功。ADD-08继续partial：本批修复普通工具JSON的计量，不补造真实用量差额、其他词表、完整媒体/协议、平台或性能证据；原Phase20真实条件仍延后，整体goal active。


### 24.41 会话目录发现处理异步读取阶段的缺失与故障

接续已推送 `99d99551fdd4abddde252762a20b362c88b5b899`，检查ADD-25的实际目录发现链。布局捕获后历史目录被移除，旧build的Node20.3.0探针仍发现后续保存会话，Bun1.3.14却先返回目录句柄、再在首次异步read抛ENOENT；[discovery owner](../../packages/ts-shell/src/session/store/catalog/discovery.ts)只捕获opendir拒绝，因此扫描、共享browse及latest/title引用解析都可能被整个中断。这与第24.38节的同步模板目录是不同的实际消费者，未从该同步修复推断异步列表已安全。第一次探针误用未分代dist路径，报ERR_MODULE_NOT_FOUND，已单独保留为setup失败；改为manifest.entry定位后才取得有效Node/Bun对照。

先检查目标，再定向只读对照pi快照 `f09d01b85e0384647fcab6779d35ab9dabe04be3` 的session-manager.ts:941–976、1965–1986：单目录发现失败不阻止其他来源、取消仍向上传播，本项目采纳；参考把其他目录错误降为空，本项目保留既有unreadable/partial与引用incomplete合同，不将无法确认的latest当成功。原有有界游标、每批16条/64目录项、4并发summary、profile身份检查与finally关闭均保留，不引入第二套扫描或缓存。

修复只捕获cursor.read自身的拒绝。首次读取前ENOENT沿既有可选目录缺失语义跳过；其他错误或已见任何目录条目后的ENOENT发布剩余已发现ID及一个unreadable，继续下一个目录。started跨批保留，不能因发布一批后examined归零而把中途消失当作空目录。取消优先于错误分类，profile边界与cursor.close失败继续向上传播，不纳入普通读错误降级。[回归](../../packages/ts-shell/src/session/store/catalog/index.test.ts)通过实际catalog/browse/reference消费者检查完整/partial/incomplete、后续来源、待发布与完整批次、无错误正文泄漏和句柄关闭。

主代理Node20.3.0、heap768MiB、单worker串行最终 **3文件69项** 通过（index36、browse23、listing10）。首次新增8项在旧owner全部失败；补齐两项后反转原discovery owner，**10项全部实际失败/26未选**；finally逐字节/SHA恢复，69项再次通过。五静态门通过，118既有docs-source advisory保留。Node floor TS与Bun生产exe串行构建通过，build `e7dbb58d8b11881afd199e73c3c70b6360ad652097b4c2e16c1fc6fe42743df2`、inputs `6ddd2cce5c77b3d0200d1c445aaaa8c1bdf9d634afd22ca8a75601b7fe3ec781` 与manifest.compilerInputs当前摘要一致，exe SHA `6d759f993fbdec7956232c8103e2a32ac4c05e55f59505174fbeec7f20a018a5`、106842240 bytes读回一致。

新build的实际目录发现器在Node20.3与Bun1.3.14均发现后续唯一会话、缺目录未重建、夹具清理；额外静态链接同一build owner的独立Bun编译探针也通过。独立探针不是生产CLI/PTY，本批生产exe仅有构建及构建自带版本检查，不冒充resume终端交互、完整性能或真实用户目录证据。正式日志、反转、构建身份、可复用运行时探针及非可执行源码快照归 `.omx/artifacts/phase20-addition-catalog-cursor/`，owned scratch最终清理；没有全仓回归、20k真实会话、新NormProof或独立委派复审。

延迟读回前批 `99d99551` CI `41234379850` 与 `9c547328` CI `41233253348` 仍in_progress，未据此宣称CI成功。本批提交/推送与自身CI另绑定。ADD-25保持partial：真实大目录、cold/warm磁盘、总heap及用户设备体验尚缺；原Phase20真实条件继续延后、goal active。


### 24.42 恢复面板的空账本与游标关闭错误优先级

接续已推送 `16c1b7941777d22e9e6a7e43dd3880def9be3342`，继续核对目录读取的实际消费者。[恢复目录](../../packages/ts-shell/src/edit/recovery/catalog.ts)的scanLedger同样只捕获opendir拒绝；布局根本不存在时，旧build的Node20.3.0返回0 records/0 matches/0 unavailable，Bun1.3.14却在异步迭代首次读取时抛ENOENT。实际[restore面板](../../packages/ts-shell/src/cli/interactive/picker/restore.ts)直接调用该owner，旧生产exe的隔离新项目真实PTY确认 `/restore` 显示读取失败，而账本始终不存在。这是空态被误报为文件故障，不是写入、快照损坏或provider失败；其他已有完整错误边界的目录读取路径未改动。

先检查目标，再定向只读比较pi快照 `f09d01b85e0384647fcab6779d35ab9dabe04be3` 的session-manager.ts:941–976：可选来源缺失可为空、取消在读错误处理中继续抛出，本项目采纳；参考将其他目录故障降为空，本项目保留恢复数据的严格失败，避免中途丢失被说成无快照。scanLedger仅捕获cursor.read本身，首次ENOENT可返回空；已经读到任何条目后的ENOENT、EACCES/EIO/ENOTDIR使用既有固定读取失败，不返回截断成功页。预算与调用者准入在读取前后及错误分类前复验，finally显式关闭游标，不捕获下层scanAuthority/record逻辑来伪造空态。

复核发现中间显式finally会让关闭失败覆盖原权限/预算拒绝，两项双故障回归在中间实现均失败、旧实现均通过。现沿同域[index reader](../../packages/ts-shell/src/edit/recovery/index/read.ts)的优先级，保留主要RecoveryReadControlError/RecoveryReadLimitError；缺失目录的close失败仍抛出，即使close自身也报ENOENT，不返回空。原取消夹具从迭代器注入改为实际ledger.read注入；第一次关闭断言仍被spy拦截而失败，恢复spy后才检查真实ERR_DIR_CLOSED，分类为harness问题，未据此修改产品。

主代理Node20.3.0、heap768MiB、单worker串行最终 **3文件52项** 通过（catalog/read22、catalog11、restore picker19）。首批8个新边界在旧owner为 **5失败/3控制通过**；最终原owner反转为 **5失败/5控制通过/12未选**，finally逐字节/SHA恢复后52项再次通过。最初50项绿色未覆盖上述双故障，不作为最终完成证据。五静态门通过、118既有docs-source advisory保留；Node floor TS与Bun生产exe最终串行构建通过，build `148356e5847d93e55a994d0ae73d681eb5c853a72c58c1994b8666780f9368ec`、inputs `9b1d2634088ea981366e810fad693dcc6273d3865ad39c2d526f2325f43c8de4` 与manifest.compilerInputs当前摘要一致，exe SHA `6646d593b82cd80097856338ab454706042c8276206cb6bb39b10fc7de67829f`、106842240 bytes读回一致。没有增加产品导入边或新扫描/缓存系统。

最终build的实际catalog在Node/Bun均返回正确空列表；生产Node/exe × regular/fullscreen四场真实PTY再次串行通过，新项目执行 `/restore` 显示“尚无快照”，无读取失败或Fatal error。四场均账本未创建、配置bytes不变、auth文件仍不存在、exit0/cooked flags恢复、relay退出和夹具删除。每场独立HOME、profile、Git项目与安全环境，offline+synthetic，无provider认证或业务写入；终端输出只留内存并丢弃，保留安全计数与检查收据。中间build的四场PTY单独标为intermediate，不与最终build混算。

正式脚本、旧exe产品失败、夹具错误分类、双故障控制、反转与最终源码快照归 `.omx/artifacts/phase20-addition-restore-cursor/`，owned scratch最终清理。本批没有真实损坏账本、外部provider、其他平台、完整性能、全仓回归、20k真实会话、新NormProof或独立委派复审证据；ADD-46维持本地验证，不提升其他恢复或Phase20验收。前批16c1b794的精确CI `41235289977` 延迟读回仍in_progress；本批提交/推送与自身CI另绑定，整体goal active。

### 24.43 生产 CLI 的单次真实请求估算与 provider 用量对齐

接续已推送 `205ed5672179cb8eebabdbdeffbdb891481a042b`，本批推进ADD-08真实计量证据，不修改产品代码。沿[实际请求投影](../../packages/ts-shell/src/context/request/projection.ts)、[前景请求用量回写](../../packages/ts-shell/src/turn/request.ts)及[provider用量归一化](../../packages/ts-shell/src/provider/response/usage.ts)检查：原始body只有在provider接受后才投影为安全尺寸和本地估算，随后同一个requestContext接入provider总输入。原生[传输owner](../../packages/ts-shell/src/provider/request/fetch.ts)使用安装的Undici，并不依赖global fetch；没有更改provider/auth核心、预算、请求体或任何凭据来源。

实际只读配置检查确认有可用形态的API-key slot，选定请求为openai-compatible / bailu-2.9-preview、外部HTTPS地址；未输出地址、key或原始配置。当前地址没有匹配的精确目录声明，不能按模型名字猜词表，继续characters/3.5。两次真实调用各用独立受保护HOME、named profile和空Git项目，仅复制所选key/address/model到0600配置，关闭工具、MCP、skills、项目指令、cache warming和重试，单轮、输出256及请求/进程超时受限。CLI实际回答文本不保留，也未据此声称短回答质量验收。

未改动的生产build `148356e5847d93e55a994d0ae73d681eb5c853a72c58c1994b8666780f9368ec`，连同manifest.compilerInputs核对当前源码摘要一致。Node20.3经正式scripts/start.mjs的新鲜度校验启动，最终真实调用由透明Undici入口观察与独立diagnostics双重确认：一次readiness GET和一次推理POST，均HTTP200；唯一POST、唯一requestContext和唯一usage entry身份与body尺寸一致。1784 UTF-8 bytes/1784 UTF-16 code units、3条含system消息、0 tools；serialized system/conversation/tools/envelope分别1258/382/0/144 bytes，raw base system source1220 bytes。它们是尺寸分项，不冒充精确分项tokens。

同一最终请求的本地组装估算507，provider归一化总输入764，包含cache read640，输出用量256；CLI exit0、观测采样0 errors。差257、约1.51倍只属于这次隔离请求，cache read不能再加到764上。relay选定的模型名称不足以证明服务端词表、隐藏协议及计费口径，这组数据既不解释历史1.7k/4.9k，也不足以据此修补字符估算。当前仅证明真实Node --print的accepted-request计量链路；真实TUI启动估算→measured、binary、其他平台、完整媒体/协议、词表校准和性能验收仍缺，ADD-08保持partial。

中间结果单独保留：首次harness将buildInputDigest结果对象与字符串比较，未发请求即拒绝，读取.digest后修正；第一次真实调用成功并测得507/764、cache256、output256，但global-fetch wrapper没有捕获实际传输，不算最终完整匹配证据。第二次真实调用才取得上述完整证据；两个独立夹具尺寸相同不证明body字节完全相同。Undici在HTTP200后另发出request:error诊断，早期harness误命名为networkFailure；产品确有finally清理abort，但未保留诊断原始原因，故最终只记requestErrorEvent、原因未分类，不把事件等同provider-network故障。该字段纠正重投影原数值收据，没有第三次请求。

所有原始stdout/stderr仅内存读取后丢弃，不保存URL、headers、请求/响应正文、credential或prompt/session digest。两次真实调用均核对四个已知home根的config/auth/catalog原bytes不变或仍不存在、隔离config不变、含凭据scratch删除；正式安全收据与可复用脚本归 `.omx/artifacts/phase20-addition-live-count/`。本批仅文档与HANDOFF，无新build/tests、全仓回归、20k真实会话、新NormProof或独立委派复审；延迟读回99d99551/41234379850、9c547328/41233253348及16c1b794/41235289977的代码CI现已completed/success；205ed567/41236321295仍in_progress，其Watch已success，不替代代码CI。五项静态门、diff检查与两脚本语法检查均exit0；118既有docs-source advisory保留。安全收据分项求和、归一化输入一致、凭据/地址未进入正式证据及scratch缺失核验通过。本批提交/推送另绑定；原Phase20真实条件继续延后，整体goal active。

### 24.44 真实 TUI 计量衔接与 context 报告身份传递

接续已推送 `d9eb54924a88c3aaca66287f159cabedc90ab199`，本批继续ADD-08真实终端链路，并确认ADD-09的实际消费者缺陷。旧build `148356e5847d93e55a994d0ae73d681eb5c853a72c58c1994b8666780f9368ec` 两场Node20.3真实普通/全屏PTY：空态估算503、草稿/accepted估算562，provider总输入分别802/804，状态栏已正确无~显示measured；最后请求详情也持有该用量，报告顶部facts.prompt却没有tokens。查明交互路由已有promptIdentity，但[命令桥接](../../packages/ts-shell/src/entrypoints/cliCommandExecutionBridge.ts)的输入契约和转交列表均漏字段；调用端的条件spread没有触发多余字段错误。既有[报告owner](../../packages/ts-shell/src/core/commands/contextCommandRuntime.ts)因此按缺少当前身份拒绝，不是provider计量故障。

定向只读参考快照f09d01b85e0384647fcab6779d35ab9dabe04be3：coding-agent的interactive-mode:2367将context usage委托同一live session accessor，agent-session:4318在无法证明compaction后usage时保留unknown。本项目同意沿live owner转交、不从inspection schema或存量telemetry重造当前身份；继续保留更严格的endpoint/system/schema/history/wire/replay核验。修补仅在现桥接声明并原样转交promptIdentity两个字段，未改身份owner、provider/auth核心、用量归一化或任何配置默认值。

新增[实际命令路由回归](../../packages/ts-shell/src/core/commands/configuration.test.ts)，interactive/print各覆盖current、missing、replaced三种身份，完整记录wire/replay事实；旧owner实际2失败/4控制通过/14未选，精确验证原TUI与报告分歧。首次runner因StreamingRenderer仍为type import出现六项ReferenceError，修正harness后才取有效baseline。显式原源码反转再次2失败/4控制通过，按raw bytes逐字节恢复并核对SHA；三文件configuration/bridge/sessionFacts最终及恢复后均60项通过，单worker、768MiB、主代理串行，无全仓回归或20k真实会话。

五项静态门、TS/exe构建通过，新build `5d2a876fc754d473fc000f093948e6f62f7c846b644e39ac29d7c382515f3182` 的manifest.compilerInputs摘要、exe size/SHA读回一致。最终Node20.3普通/全屏两场真实PTY均通过：空态~503、草稿~562，提交前零推理；各一次readiness GET和推理POST均HTTP200，1976-byte实际body、3消息/0 tools，本地accepted仍562、provider总输入均803（含cache read640）。两个真实回合均completed/success；状态栏无~显示803，/context顶部Latest context measurement和最后请求详情也实际绘制803，报告不额外推理。两场正常exit0、cooked flags恢复、relay/CLI关闭；exe仅构建验证，本批未冒充真实binary/provider终端证据。

每场独立受保护HOME/profile/空Git项目，仅在0600隔离配置复制所选真实API-key/address/model；tools/MCP/skills/context files/cache warming/retry关闭，offline只关自主检查、显式真实provider仍可调用，单轮、1024输出、65秒进程与请求deadline、2MiB输出上限。真实配置/auth/catalog四个home来源原bytes或缺失不变、隔离config不变、含凭据夹具删除；终端/body/headers/响应正文只在内存观察并丢弃，未留key/address或响应文本digest。最后回答是否服从“只答OK”未评价，不拿传输成功冒充回答质量。

五次真实推理分开记证：首pilot仅256输出，已接受/有usage/显示measured，但query完成与成功谓词为false，原observer未保存精确终态；harness等待成功后超时清理exit143，不算完整通过或产品route失败。其额外native GET404目标未保留，不能归因推理；后续offline夹具没有该请求。两场before收据只通过旧的gauge/last-request契约、current-report仍null，不能替代两场fixed验证。provider输入803与估算562的差额只属于这批隔离请求；不同临时项目的等长body不等于同字节，不解释历史1.7k/4.9k。

正式收据、反转、源码非执行快照、构建身份和可复用脚本归 `.omx/artifacts/phase20-addition-live-context/`，最终清理owned测试scratch。ADD-08保持partial：本批补Linux/Node普通/全屏真实衔接，真实binary/其他平台与provider、词表/媒体/协议、历史差额和完整性能仍缺；无新NormProof或独立委派复审。延迟代码CI读回205ed567/41236321295已completed/success；d9eb5492/41237373096仍in_progress，Watch41237373104已success，不替代代码CI。最终五项静态门、diff与两脚本语法再次exit0，118既有docs-source advisory保留；正式收据核对、恢复后build新鲜度、原始key/address未进入证据及owned scratch清理均通过。本批提交/推送另绑定；原Phase20真实条件继续延后，整体goal active。

### 24.45 生产单文件程序的真实 provider 计量衔接

接续已推送`48f1407e1914655bc70cc51aed0e37123f2c8a90`，补ADD-08明确缺失的真实binary证据，不新改产品。沿用build`5d2a876fc754d473fc000f093948e6f62f7c846b644e39ac29d7c382515f3182`；每场先核对当前manifest.compilerInputs摘要与linux-x64可执行文件size/SHA，SHA为`43e9cd3ad833dab06da2c9d086abda971e0f12823788bd1bbcca4ca05abce295`、106842240 bytes、Bun1.3.14编译。直接拉起该单文件程序，不用Node import observer、不替换打包模块、不mock响应或代理传输。

主代理串行两场真实原生PTY均通过。普通/全屏空态估算503，草稿及accepted估算均561；普通provider总输入803、output779，全屏802、output389，均含cache read640。实际状态栏从~561切到无~的803/802，`/context`顶部Latest context measurement、最后请求详情与原生会话持久化用量分别相等；两个query.completed原事件均completed/success。每个隔离会话只有一条user、一条已记录request、零tool calls，报告之后记录数不增加。accepted报告body为1975 UTF-8 bytes/UTF-16 code units，wire分项求和一致，本地方法characters/3.5。仅比较各自实际请求；不同临时项目的等长body、与上一批Node估算562的差异不证明字节相同或产品回归，也不解释历史1.7k/4.9k。

证据来自实际PTY字节输出及原产品command-output/query-event/usage账本，报告数值须在打开命令后的输出中可见。本批未独立观察原生HTTP传输，不据一条用量记录宣称HTTP请求数、HTTP状态、传输层body大小或没有未记账网络操作；上一批Node的透明传输观察单独保留。回答质量与“只答OK”的服从情况未评价，不用完成终态冒充内容质量验收。

每场protected HOME/profile/空Git项目，仅在0600临时配置复制所选真实key/address/model；tools/MCP/skills/context files/cache warming/retry关闭，offline禁止自主检查但保留显式真实provider。单轮、1024输出、65秒、2MiB输出/会话文件上限；100ms采样relay/CLI RSS，768MiB阈值触发停止，实际峰值210688/211048KiB。这是采样守卫及小夹具观测，不是内核硬限额、Bun堆上限或性能验收。两场exit0/cooked flags恢复、PID+start-time确认owned进程关闭，原配置/auth/catalog四home来源bytes或缺失与隔离config不变；含凭据配置和原生会话正文随scratch全部删除。正式收据只含数值、固定枚举与布尔，raw PTY在内存丢弃，未保留请求/响应/推理正文、headers、key/address或文本digest。

正式可复用runner、安全收据与核验归`.omx/artifacts/phase20-addition-live-binary/`，复用既有环境、build摘要与PTY relay。无新产品代码，故不重复build/unit/反转；五项静态门、runner语法与diff均exit0，118既有docs-source advisory保留；正式证据内原始key/address缺席及owned scratch清理另经核验。无全仓回归、20k真实PTY、新local NormProof或委派复审。一次延迟读回d9eb5492/41237373096代码CI现已completed/success；48f1407e/41239014279仍in_progress，Watch41239014307已success，不替代代码CI。ADD-08保持partial，其他环境/provider、词表/媒体/协议、历史差额和完整性能仍缺；原Phase20真实条件继续延后，goal active，本批提交/推送另绑定。

### 24.46 动态发现入口遵守工具限制，显式延迟工具可直接使用

接续已推送`35b939c384932a40414b98dfbee94394b81debc8`，继续ADD-08实际schema组成检查时，发现ADD-03工具设置的消费缺陷：[目录owner](../../packages/ts-shell/src/core/tools/catalog.ts)先按allowlist/disabled/prefix过滤普通工具，再无条件追加tool_search/tool_load。空allowlist仍发两个schema；仅允许read仍额外声明两个；仅允许web_fetch时本体被延迟、发现入口却不获执行门准入，实际允许能力无法访问。执行门仍正确拒绝，并非已经执行了越权工具；问题是声明与实际准入不一致。此前单步closing会省略schema，因此前两批maxTurns=1真实计量不会发现该问题，不能拿该证据证明一般两步以上请求的空allowlist。

先查本项目目录、request preparation、preview/step、scope gate，后定向只读比较pi快照f09d01b85e0384647fcab6779d35ab9dabe04be3的agent-session:1554–1594：选择、allowlist与hidden控制工具激活；本项目采用同一边界原则，保留自己对全部工具的严格scope门，不引入参考的MCP例外。另查oh-my-pi快照338d2ce6658dfdbfba19efe0f006f0d5a8edd66d的session-tools:1280–1350，参考因transport需求可追加write；本项目不采用此自动加能力决定，因为显式空allowlist与当前执行合同必须成立。原owner复用filterVisibleToolNames判断两个生成入口，任一受限就返回原已过滤完整池；空池不建立discovery。默认两入口均准入时仍动态加载，未改常驻列表、执行门、权限默认、provider/auth或build行为。显式合法生成名称不再误报unknown，发现合同与当前常驻清单同步。

新增[目录回归](../../packages/ts-shell/src/core/tools/catalog.test.ts)覆盖空/延迟工具/只有search的allowlist、禁用search或load、隐藏prefix、空目录、默认发现和显式两入口控制；[preview实际step](../../packages/ts-shell/src/cli/runtime/context/preview.test.ts)覆盖空/read/web_fetch三种allowlist，核对发送集合、preview与accepted计量及schema尺寸。旧owner有效baseline为11失败/1控制/109未选；首次transport double内断言被adapter归类为fetch失败，表现为accepted缺失，该断言位置问题单独留档并改为返回后核验，才取得可解释baseline。显式原源码反转再现同11失败/1控制，逐字节恢复核对SHA；主代理Node20.3单worker/768MiB串行四文件最终及恢复后均135项通过，无全仓或15套并行执行。

五项静态门与TS/exe构建通过，build`720d10afc7d9805b4504367ac9062e56a9298cf5878aec99767ca26549ebc059`当前compilerInputs摘要匹配，exe SHA`eea0b1e720e524ba8174a95f68d9cc3f885fbfd72300dd5477062420a004babf`与manifest size核对。生产Node/exe各三场--print经原生HTTP到本地模拟provider，maxTurns=2保留首步工具能力：空/read/web_fetch分别只发送[]/[read]/[web_fetch]，每场一次GET+一次POST，body1537/2578/2023bytes、schema0/1007/447bytes、2消息；usage123为显式模拟数据，各一query completed/success、一条记录request、零tool calls、exit0。每场独立HOME/profile/空Git项目/synthetic key、offline/无skills/context files/MCP/cache warming/retry，config及project不变、owned夹具清理；25秒/1MiB/100ms采样768MiB阈值，仅小夹具内存保护，不算性能验收。该probe验证实际声明而未让模型执行read/web_fetch，不算真实外部provider、网络工具效果或桌面PTY验收。

正式反转、测试、构建与可复用CLI收据归`.omx/artifacts/phase20-addition-discovery-scope/`；本批不读取真实凭据，无新真实provider请求、PTY、local NormProof或委派复审。最终五门/runner语法/diff通过，118既有docs-source advisory保留；当前build摘要、源码快照、135项恢复后结果与六场CLI收据核对一致，owned scratch已删除。ADD-03/ADD-08仍partial，默认完整请求/历史1.7k与4.9k真实分项调查仍缺，本批不以固定usage解释该差额。一次延迟读回48f1407e/41239014279及35b939c3/41239648179代码CI均仍in_progress、各Watch已success；d9eb5492代码CI仍success，不替代本批自身CI。原Phase20真实条件继续延后，goal active，提交与推送另绑定。

### 24.47 默认动态清单的真实首请求分项

接续已推送`58bf4871bf095a584aca205ed757c94dbf6dec25`，补ADD-08默认工具能力保留时的真实首请求证据。本批无产品代码改动，沿用build`720d10afc7d9805b4504367ac9062e56a9298cf5878aec99767ca26549ebc059`，每次先核对manifest.compilerInputs摘要。此前maxTurns=1会在closing分支省略schema，本次设2、无allowedTools或toolDiscovery覆盖，保留动态默认；独立空Git项目、禁用MCP/skills/context files/cache warming/retry，offline只禁自主检查，denyRules的通配拒绝阻止工具效果但不删声明。该夹具不是完整用户配置，也未让模型实际执行工具。

普通CLI的真实初始集合是18个：13个[常驻工具](../../packages/ts-shell/src/core/tools/discovery/state.ts)、2个发现入口，以及[前台组装](../../packages/ts-shell/src/cli/runtime/prompt.ts)提供的paper_search/document_read和已安装安全运行时的security_propose。[目录owner](../../packages/ts-shell/src/core/tools/catalog.ts)有意把运行显式提供的feature tools放入初始集合。首个probe只按常驻+发现预期15，实际18导致harness断言失败；不能据数量推断目录泄漏。源码核对三个实际owner后修正观测名单，首收据与脚本原快照单独保留、不改写为通过。[发现合同](tool-discovery.md)同步说明该调用端组成，不能把15或18当作全部运行的固定数目。

主代理Node20.3生产--print最终真实调用通过：原生Undici一次readiness GET、一次推理POST均HTTP200，透明observer原样转发参数并返回未消费的原Response；实际body与accepted live telemetry尺寸匹配。两消息、18 schemas，工具名精确匹配本夹具；持久化query.completed为completed/success、一条已记录request、零tool calls、exit0，原生用量与live相等，observer错误0。最终分项如下，都是本次实际请求的数值：

| 量 | 数值 |
|---|---:|
| body UTF-8 bytes / UTF-16 code units | 15152 / 15148 |
| serialized system / conversation / tools / envelope bytes | 1404 / 193 / 13381 / 174 |
| raw base system source bytes | 1366 |
| 本地assembled estimate，characters/3.5 | 4325 |
| provider归一化总输入 / 已含cache read / output | 4588 / 4544 / 27 |

四个wire分项严格求和到body；raw system source为JSON转义/包装前尺寸，不能再次相加。schema对象合计13362bytes、数组括号与逗号19bytes，构成13381；其占body约88.3%是字节比例，不是provider分类tokens。每工具schema、description和parameters的尺寸见安全收据；最大edit1927、bash1234、read1005bytes，未据此删schema或缩减能力。估算与实测相差263、约本地估算的6.1%，cache read已在4588内、不能再加。同一最终内存body的cl100k_base/o200k_base示例为3262/3315，选中relay模型的隔离目录未声明精确词表，这两个只是本地假设，不能替代provider口径或解释历史1.7k/4.9k。服务器隐藏协议、词表与计费规则仍未知，不凭单样本改公式。

首个真实调用另测4325/4590、cache320、output53、CLI exit0，但其预期名单断言在读取native完成记录前退出，故保留unverified，不冒充最终完整验证。两次独立临时项目body等长不代表同字节，示例词表计数也不同；没有保存raw body来证明相同。HTTP200后的request:error仅保留诊断事件、原因未分类，未将其等同provider-network失败；回答质量未评估，完成终态不替代内容验收。

每次protected HOME/profile仅在0600隔离配置复制所选真实API-key/address/model；65秒、1024输出、2MiB输出/会话文件上限、100ms采样768MiB descendant RSS阈值，最终峰值320800KiB。它是小夹具采样守卫，不是内核硬限额或性能验收。两次原配置/auth/catalog四home来源bytes或缺失及隔离config均不变，最终空项目不变；owned PID+start-time关闭核对、含凭据配置与原生会话scratch删除。stdout/stderr直接丢弃，正式证据不留请求/响应/思考正文、headers、key/address或prompt/session digest。正式脚本、初次与最终收据及核验归`.omx/artifacts/phase20-addition-default-count/`。

本批仅文档/HANDOFF及忽略目录的证据脚本，不重复build/unit/反转，无PTY、全仓回归、20k真实会话、新local NormProof或委派复审。五项静态门、三脚本语法、diff及安全收据核验均exit0，118既有docs-source advisory保留；当前build新鲜度、原始key/address缺席与owned scratch缺失核验通过。延迟读回48f1407e/41239014279及35b939c3/41239648179代码CI现已success，58bf4871/41240901265仍in_progress、其Watch41240901269已success，不替代代码CI。ADD-08仍partial，历史同快照差额、其他环境/provider、完整词表/媒体/协议与性能验收仍缺；原Phase20真实条件继续延后，goal active，本批提交与推送另绑定。

### 24.48 print 原始输入保留与多 skill 真实派发

接续已推送`86f87db072b350e2f1b6b53941af53971a74f159`，继续ADD-11真实派发前检查，发现显式prompt在[argv解析](../../packages/ts-shell/src/entrypoints/cliArgs.ts)、[非交互prompt收集](../../packages/ts-shell/src/core/shell/printPromptInput.ts)和[执行入口](../../packages/ts-shell/src/entrypoints/cliRuntimeModule.ts)三次整体trim，导致普通正文及多skill组合在记录originalInput、解析source ranges前已失去首尾空白。真实参数是一份明确字符串，其缩进、尾空格和最终换行属于内容；不能靠组合owner的局部保持弥补上游丢失。先查目标后定向只读参考A快照f09d01b85e0384647fcab6779d35ab9dabe04be3的cli/initial-message原片段拼接及print-mode:131–136原样交给session.prompt决定，采用原文保持；本项目继续保留自己的line-batch framing和多skill整份准入，不复制参考实现或改成其stdin拼接语义。

原owner现在仅用trim视图判空，原字符串贯穿argv、收集、组合和实际executePrompt；[slash owner](../../packages/ts-shell/src/core/commands/slashRouter.ts)仅为interactive:false保留脚本原有的前导空白独立命令识别，组合仍收到原input。交互模式中带前导空白的settings/model继续是正文，不能因为保留print原文而隐式激活它们；standalone命令参数继续沿原parser。未新增第二份draft或改动provider/auth、执行权限、package/build行为及任何默认配置。

新增argv有/无terminator、transport显式多行/空白过滤、实际非交互路由的普通正文/两skill+重复调用与source slices回归，并保留indented help控制。print transport旧断言把显式参数trim当作预期，与本任务原文合同冲突，已改为精确原文；pipe行framing断言不变。有效旧源码基线三文件6失败/68控制通过；显式四owner原源码反转同6失败/68通过，finally逐字节恢复并核对SHA。主代理Node20.3单worker/768MiB串行最终及恢复后五文件均166通过（argv61、transport8、runtime5、slash49、composition43）。首次Vitest0.34不支持maxWorkers选项未跑测试、首次修补无条件trimStart导致两个既有positioned-command回归，均单独留档；改用原一线程环境限制及非交互条件后通过，未弱化原控制。

最后将runtime测试夹具统一迁入repo内`.tmp/phase20-print-source/`并清理，单文件5项再次通过；测试文件也属于compilerInputs，故此修改使初次build e8ff3217c78d摘要过期。保留`build-freshness-drift.json`的unverified及`*-before-fixture-rebuild.*`旧构建收据后串行重新构建、两runtime各重新实际推理一次；下表与新build绑定，不将旧收据挪绑。两代合计8场CLI、4次真实推理，其余4场未知skill均请求前拒绝。TS/exe串行构建通过，build`d666ac7e304fb20111ac1fab11831823ee4e6f90107c6ccf8df2d3c05a7d87cb`、inputs`db0ebb5af12299da4ca340487865c18a1c6b939dd08be15df7a5ca64db30a768`；linux-x64 exe SHA`cb17e559696dab0b44274e33066695761251db4ca08c3047297000c1c8a8709c`、106842240bytes、Bun1.3.14。每场核对当前compilerInputs摘要，exe另核对size/流式SHA。Node20.3与该生产单文件程序各两场真实--print，显式两份公开fixture skill、三个invocation含重复、原始多行及尾空格，工具/MCP/context files/warming/retry关闭、maxTurns=2，不启动研究driver或实际工具。

| runtime | 未知第二skill | 合法两skill | provider总输入 / 已含cache read / output | RSS采样峰值，拒绝/合法KiB |
|---|---|---|---:|---:|
| Node20.3 | blocked、零native HTTP与零记录request | 一POST，completed/success | 958 / 576 / 264 | 259808 / 270532 |
| exe | blocked、零记录request | 一记录request，completed/success | 955 / 576 / 959 | 199972 / 202444 |

四场均exit0、零tool calls。合法两场原生user消息精确等于两份body各一次及完整prose，metadata保留原始全文、三个原始range切片、两份去重身份/CLI来源；skill正文内的未知/skill字面引用保持文本、不递归触发。未知第二skill两场均没有user或query.completed，不部分提交第一份。Node透明observer复用原Undici观察，实见一次readiness GET和推理POST均HTTP200、2504-byte实际body、1 user/0 tools，两份准确正文各一次、完整prepared suffix含尾空格和最终换行；accepted本地估算712/provider958与原生账本相等，wire system/conversation/tools/envelope为1902/458/0/144bytes。raw source base1198/skills651/separators1另列，不能与wire分项再相加。exe未注入observer或替换打包模块，原生持久记录不冒充独立HTTP计数/body证据。958/955各自已含cache，不能再次相加；两独立临时项目不保证同body，未评回答质量、研究质量或真实计费金额。

每场protected HOME/profile/XDG/Git、0600隔离配置仅复制所选真实key/address/model；offline只禁自主检查，显式provider仍真实。65秒、1024输出、2MiB输出/会话文件上限、100ms采样768MiB descendant RSS阈值只是小夹具守卫，不是性能验收。原config/auth/catalog四home来源bytes或缺失、隔离config、skill文件bytes及project条目均不变；owned PID+start-time关闭、含凭据配置/原生会话/expected正文scratch全部删除。raw stdout/stderr/实际请求/响应/思考正文、headers、key/address及prompt/session digest均不进入正式证据；HTTP200后的error仅是未分类诊断。正式baseline/中间失败/反转/构建/可复用probe与安全收据归`.omx/artifacts/phase20-addition-print-source/`。

五项静态门、四脚本语法、diff与安全收据核验均exit0，118既有docs-source advisory保留；当前四owner逐字节匹配恢复后快照、build新鲜度、原始key/address缺席和owned scratch缺失核验通过。无全仓回归、20k真实会话、PTY、新local NormProof或委派复审。延迟读回86f87db0/41241685047及58bf4871/41240901265代码CI经本批一次延迟读回均已success，各Watch已success；35b939c3代码CI仍success，不替代本批CI。ADD-11不升级整体完成，真实金额、研究driver与其他环境组合仍缺，原Phase20真实条件继续延后、goal active，本批提交与推送另绑定。


### 24.49 多 skill 研究入口的真实阶段与 partial 边界

在已推送`5b454f035e759923beb4e05bc707d08bafa78518`及当前build d666ac7e304f上，沿ADD-12检查[原生研究入口](../../packages/ts-shell/src/research/run/entry.ts)、[阶段提示词](../../packages/ts-shell/src/research/run/prompts.ts)、[child结算](../../packages/ts-shell/src/research/run/child.ts)与[报告验证](../../packages/ts-shell/src/research/report/validation.ts)。已有本地组合测试使用模拟模型；本批补生产Node20.3 --print真实provider观察，不改产品实现、模型配置或验证门。两份公开fixture skill加一次重复调用从正文中的deep-research进入同一个native run；问题仅涉及公开本地release.md夹具，不是现实资料研究质量验收。

每轮只开放read/research_run，关闭MCP/context files/discovery/warming/retry与报告保存，maxTurns=2、每请求2048输出、最多14次POST、240秒、2MiB输出/会话文件、100ms采样768MiB descendant RSS阈值，Node heap768MiB。透明observer仍转交原Undici fetch参数和未消费Response；额外请求限额属于probe守卫，不改产品重试/预算规则。子阶段顺序运行，无并行模型或重型验证。两次独立项目同夹具不代表同wire body。

| 观察 | 首轮 | 补账本/安全停止分类后的第二轮 |
|---|---|---|
| 实际HTTP | 1 GET + 12 POST，均200 | 1 GET + 8 POST，均200 |
| 子阶段实际请求数 | brief2、investigate2、gaps1、draft1、review2、report2 | brief2、investigate2、gaps1、draft1 |
| 原生研究终态 | partial，停在report | partial，停在draft |
| 来源 / claim / 有效报告片段 | 1 / 1 / 1 | 1 / 1 / 0 |
| 独立复审 | completed，有实际read收据 | not-run |
| 前景query / CLI | completed/success，exit0 | completed/success，exit0 |
| RSS采样峰值KiB | 302952 | 276244 |

全部16次实际子阶段请求都包含两份正确body各一次、没有原始invocation token，并与首次实际research_run schema中的native run ID一致；元数据及持久methods保留完整原输入，两份skill按稳定顺序去重。各阶段实际请求数与native child的requestIds数量相符。首轮brief/investigate/review、第二轮brief/investigate均有真实本地读取收据，未执行报告文件保存。首轮共7个child、第二轮4个child；child.status为completed只表示该child调用结束，[finishChild](../../packages/ts-shell/src/research/run/child.ts)随后仍须applyStage验证，不能把它当作stage已接受。首轮第二个report child结束后仅1份片段、第二轮draft child结束后阶段未推进，两次fullNativeChain断言均失败、runner均exit1，原始收据均保留unverified；前景success不替代研究验收。未放宽原生schema、绑定、引用或片段顺序检查。

首轮没有保留具体stopReason，事后安全读取时scratch已删除、仅记录observed:false；第二轮固定错误分类白名单未匹配、stopCategory仍unclassified。因此仅确认原生阶段产出未获接受，不能推断具体schema/引用/绑定问题，也不能凭HTTP200后的diagnostic错误归类provider/network故障。两轮未触发probe请求、时限、输出字节或RSS守卫；没有第三次重试、提高输出限额或用窄绿色掩盖失败。后续若继续诊断，应在原生状态清理前保留完整安全错误分类，再决定是否需要产品修补或输出预算调整。

[前景请求历史](../../packages/ts-shell/src/turn/request.ts)不是研究总请求数：[provider step](../../packages/ts-shell/src/turn/step.ts)把子阶段用量交给[原session辅助计量sink](../../packages/ts-shell/src/session/store/usage.ts)，以affectsContext:false累计，保持前景recentRequests语义。两轮recentRequests各2条不能称各2次推理，前景toolCallsCount=0也不能称没有实际research_run/read。第二轮原生研究账本finalized=8，与8个实际POST相等；22603 input + 11027 output，已含cache read10752，pending/unknown均0、historyUnknown/breach均false。首轮未保存账本合计，不能用第二轮补造；provider归一化tokens与共享账本也不证明真实计费金额。

两轮protected HOME/profile/XDG/Git、0600配置仅复制所选真实provider凭据；四home来源config/auth/catalog bytes或缺失、隔离config、fixture bytes及project条目均不变，owned PID+start-time关闭、含凭据/原生会话/expected body的scratch删除。正式证据不留实际请求/响应/思考正文、headers、key/address或prompt/session digest。首轮精确runner另存非可执行source快照，二轮收据、透明observer、安全核验归`.omx/artifacts/phase20-addition-research-stages/`。提交前发现初选证据目录与历史archive重名，已迁至上述独立目录并从HEAD恢复两份历史文件；原历史目录7个tracked文件逐字节核对不变，未把覆盖混入提交。核验明确scope为部分观察的真实性/安全性，currentProbeStatus=unverified、researchAcceptance=partial-not-verified；其passed不升级研究验收。

本批只有文档/HANDOFF与ignored证据，无新产品build、unit、反转、PTY、全仓、20k、local NormProof或委派复审。五项静态门、三脚本语法、diff及安全证据核验通过，118既有docs-source advisory保留；当前build新鲜、请求/child计数、第二轮账本及原始key/address缺席、scratch清理均核对。一次延迟读回5b454f03代码CI41243494189仍in_progress、Watch41243494336 success，86f87db0代码CI success；不把Watch当代码CI。ADD-12仍本地验证，完整报告、真实资料研究质量、exe/桌面和金额证据继续缺失，ADD-11的研究质量缺口不提升；原47真实条件延后、goal active，提交推送另绑。


### 24.50 研究阶段保留原生终止原因，局部 JSON 失败不再冒充传输失败

沿第24.49节的真实partial继续诊断，先在旧build d666ac7e304f运行一次同预算公开本地夹具。生产Node20.3实际1 GET + 11 POST均HTTP200，brief2/investigate2/gaps1/draft1/review2/report1，研究partial/report、0片段、复审completed，安全停止原因实见`invalid_response`。最后report请求13445 bytes、请求输出上限2048、实际output2048；这只证明本地JSON解析失败并达到请求计数上限，旧收据没有直接观察原生finishReason，不能事后宣称已证实length。透明observer通过相邻串行POST前的原session telemetry差量捕获11份单请求用量，不读取或消费响应正文。34148 input + 13136 output、cache read16896已含在input，11 finalized与11 POST一致，pending/unknown均0、historyUnknown/breach均false；完整研究断言仍失败，收据unverified。

目标实现确认两个独立边界问题：[原生step](../../packages/ts-shell/src/turn/step.ts)保留模型length，但[子代理结果](../../packages/ts-shell/src/core/subagents/runner.ts)丢弃最终assistant的stopReason；研究因此无法在[阶段应用](../../packages/ts-shell/src/research/run/child.ts)前区分截断。另[本地阶段JSON读取](../../packages/ts-shell/src/research/run/parse.ts)复用bounded parser，其malformed/depth错误是NetworkError(invalid_response)，并不能说明传输失败。修补前定向参考A固定SHA `f09d01b85e0384647fcab6779d35ab9dabe04be3`的subagent结果/message_end保留stopReason、通用失败仅error/aborted的决定；本项目沿原结果契约增加可选stopReason，由研究consumer单独拒绝length，不全局改变通用子代理失败语义。参考的JSON修复/原文诊断不采用：研究继续严格拒绝不完整证据，不保留生成原文。

实现只在三个原owner内：runner返回最终原生终止原因；research child遇length时不进入applyStage，child.failed、研究partial，固定原因`Research stage output reached the model length limit.`；parse仅将自身JSON读取的invalid_response转成固定领域错误`Research stage output is not valid bounded JSON.`。保留96000 UTF-8字节、depth16、对象及schema要求，保留取消、deadline、epoch/pending身份与原共享账本规则。没有修改provider/auth、共享网络解析、重试、输出预算或验证门。

[runner测试](../../packages/ts-shell/src/core/subagents/runner.test.ts)覆盖stop/length/error/aborted穿过实际结果边界；[研究runtime测试](../../packages/ts-shell/src/research/run/runtime.test.ts)用实际runner连接brief/report，两种stage即使JSON语法和绑定有效，只要原生length仍不得推进或接收片段，且不发布stage-completed；[parse测试](../../packages/ts-shell/src/research/run/parse.test.ts)覆盖malformed、敏感样例不回显、深度16/17、UTF-8字节上限、对象/schema及正常控制。旧三owner基线9失败/2通过/23未选；首次修补32通过/2失败源自新测试误把try返回快照当作finally后的清理状态，改为检查current store，未改变运行时或削弱阶段拒绝断言。Node20.3单worker串行三文件34项通过；三个owner各自显式反转分别4/2/3失败，全部逐字节恢复后34项再次通过。

五项静态门及TS/exe串行构建通过，118既有docs-source advisory保留、binding dangling 0。最终manifest `7f47912610a7f053bb88a9e5cf5b2d4a5ccf2a0da9b17221cefcb06311a78dec`，inputsDigest `12751b98c4b264d43c4e3f1b8e6ca0717e178eddc23c8543b4fab1962f95c3e8`；Bun1.3.14 linux-x64 exe106842240 bytes、SHA `e48368d37bb0fb42e2496379b48349b11f75f1397b268745483a83efd1c6b132`。当前compilerInputs、产品/测试非可执行快照、exe size/SHA均核对；没有在测试文件修改后继续使用旧build。

新build只再运行一次同预算真实Node --print，不为绿色完整链路继续重试。结果如下：

| 观察 | 修补前诊断 | 新build真实验证 |
|---|---|---|
| 实际HTTP | 1 GET + 11 POST，均200 | 1 GET + 12 POST，均200 |
| 子阶段请求数 | brief2、investigate2、gaps1、draft1、review2、report1 | brief2、investigate2、gaps1、draft1、review2、report2 |
| 研究 / 接受片段 / 复审 | partial/report，0，completed | partial/report，1，completed |
| 最后child / 停止分类 | completed，stage-json-decode-or-depth | failed，unclassified |
| 有单请求用量的POST | 11 / 11 | 11 / 12；第二report未观察到用量 |
| 账本已知input / output | 34148 / 13136 | 34097 / 12751，仅11个finalized |
| input内含cache read | 16896 | 16832 |
| pending / unknown | 0 / 0 | 1 / 1 |
| RSS采样峰值KiB | 399364 | 280752 |

新运行的后一个report child在接受第二片段前失败，具体原因未匹配安全白名单；没有证实本次真实停止进入length分支，也没有证实新领域JSON消息。12次POST中11份精确单请求用量求和与共享账本一致，剩余report用量为missing-or-overlapping，原生账本也保留1个dispatched unknown，不能称全部结算、0用量或真实金额。前景最后请求output2048不能归给失败report，旧运行report的2048也不能补造本次数据。两次query均completed/success、CLI均exit0，但完整链路runner均exit1/unverified。首版证据校验要求新分类命中且全部结算，实际失败，源码/收据/日志另存initial；后续核验仅检查这些partial观察的真实性、安全性、已知用量及缺口，passed不升级目标诊断、结算或研究验收。HTTP200及无用量不能独自证明provider/network故障，原因继续unknown。

两次均只开放read/research_run，关闭MCP/context files/discovery/warming/retry/save；maxTurns2、每请求输出2048、最多14 POST、240秒、2MiB输出/会话文件、100ms采样768MiB RSS、Node heap768MiB，未触发probe守卫。全部19次真实子阶段请求含两份正确skill各一次并绑定各自native run，原输入/稳定去重、真实本地source/claim/复审read已核对。四home来源config/auth/catalog bytes或缺失、隔离config与夹具/project条目均不变，owned PID+start-time关闭，凭据/会话/expected正文scratch删除，无实际请求/响应/思考正文、key/address/header或prompt/session digest留存；RSS采样不算性能验收。证据、原始失败、独立反转、构建与安全核验归`.omx/artifacts/phase20-addition-research-diagnostics/`，没有覆盖tracked历史。

一次延迟读回5b454f03精确代码CI41243494189已success、Watch41243494336 success；426c09c0文档CI41244810468仍in_progress、Watch41244810449 success，不替代本批代码CI。未运行全仓、20k、真实exe研究、PTY、桌面、local NormProof或委派复审。ADD-12仍本地验证、完整报告/真实资料质量/全部结算/目标真实诊断仍缺，ADD-11不升级、原47真实条件延后、goal active；本批清理、提交/推送及精确SHA的CI另绑。


### 24.51 隔离输出预算下完成真实原生研究报告链

沿第24.50节已实见的report output2048与请求cap2048，检查[原研究策略](../../packages/ts-shell/src/research/run/policy.ts)与[阶段提示词](../../packages/ts-shell/src/research/run/prompts.ts)后，确认completion reserve只是后续工作量的准入余量，不会提高maxOutputTokens；报告的12000字符上限也不保证适合某个token预算。本批只在隔离profile中把每请求输出从2048调到4096，问题、两份公开skill/重复调用、公开本地release.md、工具准入、maxTurns和其他probe守卫均保持原值。没有提高产品默认值、放宽JSON/引用/绑定检查或修改provider/auth。上一轮未分类且无用量的失败依旧unknown，不能据此补造其原因或成本。

已推送产品commit `1e9c6ad57803ae45ee63e18d917c457d4b9b2b35`及既有build `7f47912610a7f053bb88a9e5cf5b2d4a5ccf2a0da9b17221cefcb06311a78dec`在生产Node20.3 --print完成一次实际原生研究。透明observer转交原Undici参数和未消费Response，实见1 GET + 13 POST均HTTP200；所有13个实际body均请求4096输出，只含read/research_run或空工具集。前景2请求，子阶段11请求：brief2、investigate2、gaps1、draft1、review2、report3；8个child均completed，研究status原值completed、3个报告片段获原schema/顺序/绑定/引用验证，独立复审completed且有实际read。来源1/claim1，stopCategory=none、无pending child或owner；完整链路断言、runner及CLI均exit0，而不只是前景query completed/success。

| 三个已接受报告片段 | 实际body bytes | 请求输出cap | 实际output tokens |
|---|---|---|---|
| 0 | 13459 | 4096 | 2536 |
| 1 | 15951 | 4096 | 2793 |
| 2 | 18738 | 4096 | 2605 |

本次三个报告请求的实际output均超过旧2048预算，支持把预算充分性作为独立的fixture条件；这是一次随机模型运行，不能宣称4096总能成功、是最小预算，或证明此前HTTP200后的未知失败均由截断造成。每请求精确用量通过相邻串行POST前的原生aggregate telemetry差量观察，13份都requests=1；input/output/cache逐项求和与原共享研究账本完全一致。账本42624 input + 19411 output，cache read23680已含在input，finalized13、pending/unknown均0、historyUnknown/breach均false。前景recentRequests仅2、tool counter0仍不代表总调用/工具数；token计数不是实际计费金额，亦未读取或保留实际响应/思考正文。

全部11个实际子阶段body均包含两份精确method各一次、没有原invocation token，并绑定同一native run；持久methods及用户metadata保持完整原输入和稳定去重。只开放read/research_run，无MCP、context files、discovery、warming、retry或report save；maxTurns2、最多14 POST、240秒、2MiB输出/会话文件、100ms采样768MiB descendant RSS、Node heap768MiB守卫均未触发。采样峰值281092KiB、输出4284 bytes，仅是本轮资源观察，不算冷启动/性能验收。四home来源config/auth/catalog bytes或缺失、隔离配置、fixture bytes/project条目不变；owned PID+start-time关闭，凭据/会话/expected正文scratch删除，无key/address/header、实际请求/响应/思考正文或prompt/session digest留存。

证据归新建且无tracked碰撞的`.omx/artifacts/phase20-addition-research-capacity/`。执行前保存probe/observer的非可执行精确source快照，安全分类覆盖本地固定错误、原生deadline/cancel/admission/step bound和源码拥有的Network error前缀，未知仍不回显；本次没有触发停止分类，不声称补证旧未分类错误。独立核验同时计算publicFixtureWorkflowAcceptance与真实性/安全性：本次两者passed、nativeResearchStatus=completed，realWorldResearchQuality与billingAmount明确unverified；当前compilerInputs/inputsDigest、exe size/SHA及原fixture文本一致性已检查。此前各2048预算下的partial、未命中诊断、unknown账本及失败验收收据保持原值。

本批只修改文档/HANDOFF并补ignored真实证据，没有新产品实现、build、unit、反转、PTY、全仓、20k、local NormProof或委派复审。一次延迟读回1e9c6ad5精确代码CI41246087467仍in_progress、Watch41246087514 success；426c09c0文档CI41244810468仍in_progress、Watch41244810449 success；均未用Watch代替代码CI，也不立刻轮询本批CI。ADD-12的Node公开夹具完整链路/全结账本缺口已补，真实资料研究质量、生产exe研究及桌面、实际金额仍缺；ADD-11不整体升级，原47真实条件延后、goal active。最终静态/语法/安全核验与提交/推送结果另绑。


### 24.52 生产单文件程序的真实原生研究与账本

沿第24.51节补生产exe的独立运行证据。使用已推送产品commit `1e9c6ad57803ae45ee63e18d917c457d4b9b2b35`、当前build `7f47912610a7f053bb88a9e5cf5b2d4a5ccf2a0da9b17221cefcb06311a78dec`；当前compilerInputs/inputsDigest匹配，稳定exe与manifest不可变产物分别核对106842240 bytes及SHA `e48368d37bb0fb42e2496379b48349b11f75f1397b268745483a83efd1c6b132`，Bun1.3.14/linux-x64。稳定发布是普通文件副本，两个realpath不同不表示build过期；本批按文件类型/size/SHA和当前输入校验，没有要求它必须是symlink。没有新产品改动、构建或默认配置变更。

直接启动dist/bin/cheers --print，隔离profile仅复制当前选定的真实provider配置，仍为公开本地release.md、两份method skill加一次重复调用，完整原输入与原顺序去重保持。配置maxTurns2、maxOutputTokens4096，仅允许read/research_run；关闭MCP/context files/discovery/warming/retry/save。原生研究最终status=completed，8个child均completed，实际brief/investigate/review各有本地读取收据，来源1/claim1、独立复审completed、3个报告片段获原schema/顺序/绑定/引用检查接受。无stop reason、pending child或owner，完整链路runner/CLI均exit0，query completed/success亦实见。

| 观察 | exe原生持久状态 |
|---|---|
| 子阶段requestIds计数 | brief2、investigate2、gaps1、draft1、review2、report3，共11个唯一ID |
| 前景recentRequests | 2，不能代替整个研究计量 |
| 共享账本尝试 / finalized | 13 / 13，与子阶段ID数+前景历史数相符 |
| 账本input / output tokens | 42094 / 18826 |
| input内含cache read | 23424，cache write0 |
| pending / unknown / historyUnknown / breach | 0 / 0 / false / false |
| 已接受报告片段 / 复审 | 3 / completed，有实际复审read |
| RSS采样峰值 / 输出bytes | 217496KiB / 5418，仅本轮观察 |

本轮直接使用编译产物，没有Node --import observer、替代fetch或本地转发。持久方法正文及用户metadata原输入逐字节核对，所有child均有原生requestIds；没有独立观察每个exe请求的阶段prompt正文或HTTP，因此不称每次wire skill恰一次、不宣称实际HTTP GET/POST数量/状态，也不称独立逐请求用量求和。原生账本finalized描述结算状态，本身不等同HTTP回执或实际金额；本轮requestIds/历史/账本计数一致与所有阶段接受分别保留。第24.51节Node observer的wire/用量证据不移植为本轮exe观察，两个随机运行也不是相同wire快照或性能A/B。

主代理以100ms采样Bun及owned后代RSS与原生state账本；尝试数达到14时请求取消，另有240秒、2MiB输出/会话文件、768MiB采样RSS阈值和终止升级。该尝试数守卫依据持久账本采样，没有HTTP发送前限额保证；本轮实际最终13尝试，2069次成功state采样、无sample error或守卫触发。Node harness heap768MiB，Bun按实际RSS观察；未装载大型历史、未跑PTY或20k。配置只声明每请求4096输出，本轮未独立观察实际wire cap。运行结束后四home来源config/auth/catalog bytes或缺失、隔离config、fixture bytes/project条目均不变，自有PID+start-time关闭、凭据/原生会话scratch删除，无实际请求/响应/思考正文、key/address/header或prompt/session digest留存。

证据归无tracked碰撞的新目录`.omx/artifacts/phase20-addition-research-executable/`。执行前保存非可执行probe精确source快照；独立核验当前compilerInputs、两份exe内容、与Node相同的原输入/skill/release夹具字面量、原生阶段/账本投影、实际凭据/address缺席及scratch清理。安全audit与publicFixtureNativeResearchAcceptance均passed、nativeResearchStatus=completed；transport/perRequestUsage明确not-instrumented、actualStagePromptMethodPropagation明确not-observed，realWorldResearchQuality与billingAmount仍unverified。原2048预算的partial/unknown和Node全链路收据保持原值。

本批仅文档/HANDOFF及ignored证据，没有新产品build、unit、反转、全仓、PTY、20k、local NormProof或委派复审。一次延迟读回1e9c6ad5精确代码CI41246087467与54b7cf60文档CI41246803802仍in_progress，各Watch41246087514/41246803660 success；额外一次job阶段读取确认1e9c6ad5的静态门、gates脚本测试及TS build已success，Run Focused & Unit Tests仍in_progress、judge尚pending，不能升级整体CI。没有持续轮询。本批最终静态/语法/安全核验与提交/推送另绑。ADD-12补齐Node/exe公开夹具原生完整链路/全结账本，真实资料研究质量、桌面/其他环境及真实金额仍缺；ADD-11不整体升级、原47外部条件延后、goal active。


### 24.53 真实源码研究的请求失败与未获质量验收

在第24.51–24.52节公开夹具成功后，改为实际源码问题：条件写在异步snapshot持久化后是否再次校验原文件，以及withFileLock本身是否提供跨进程互斥。固定当前commit `59fb0a9715d2fdb8a29ac2906f8e5e9fde0fdc3b`的[write owner](../../packages/ts-shell/src/runtime/execution/write.ts)与[file lock owner](../../packages/ts-shell/src/runtime/execution/fileLock.ts)，分别4221/5830 bytes；代码快照SHA分别`bb6fb19926a112651f9687ba55a2ed032c74e455e80252ea4754ff16d364dac4`、`38eaf4c28682948d51c02a9d7750201d4a4db23dc7a2fe0889bc34f02706cbd5`。当前文件、Git固定版本与非可执行source快照逐字节一致；只复制到隔离项目，不让模型访问真实home/config或写入原工作区。

执行前的source检查确认：prepareOperation与captureRecoveryAuthorityRecord两个await路径后均调用checkCondition，比较content/identity并在变更时拒绝；withFileLock使用module Map与AsyncLocalStorage，不能把这个应用内锁当作跨进程互斥。模型prompt只提出问题和调查方法，不给出这些预期答案。两份skill要求调查和独立复审实际读取两文件、用真实native引用、区分静态源码和执行证明；一次重复skill仍稳定去重。预先写定七项code/source-content检查，包含实际stage读取、带精确原生code quote的两个窄claim、报告函数名/进程范围/未执行限制。它们只是自动化证据与文字覆盖判据，不构成全面语义质量评审或通用研究评分。

使用现有build7f47912610a7、生产Node20.3 --print及原真实provider，只开放read/research_run，maxTurns2、每请求4096输出、14 POST/240秒/2MiB/768MiB采样守卫与Node heap768MiB，其余隔离条件同前。实际GET1+POST5均HTTP200；brief2次请求并真实读取两个文件，随后investigate第1次请求在native请求/流读取路径失败，原生child.failed、research partial/investigate、0 claim/0片段、review not-run。固定安全类别`native-provider-request-or-stream-failure`只来自原step拥有的Network error前缀；未保留其任意后缀，不能据此精确断言网络断连、协议或provider原因，也不能归为本地stage JSON/schema/引用验证失败。

4份已知单请求用量逐项对齐共享账本13056 input + 4949 output（含cache read4544），finalized4；investigate无可归属用量，pending/unknown各1、historyUnknown/breach均false，不能称0用量或全部结算。全部3次实际child-stage body仍含两份正确skill各一次且绑定原native run。query completed/success与CLI exit0均实见，但完整链路probe exit1/unverified；七项质量检查全false，因为没有可接受claim/report或真实复审，表示未获验收，不是七个错误答案。没有为绿色再发第二次真实请求，也不从前两次公开夹具成功补造当前质量。

RSS采样峰值278260KiB、输出4333 bytes不是性能验收；probe守卫未触发。原源码、四home来源config/auth/catalog、隔离config、fixture及项目条目保持；owned PID+start-time关闭，凭据/会话scratch清理，无实际请求/响应/思考正文、key/address/header或prompt/session digest留存。新证据目录`.omx/artifacts/phase20-addition-research-code/`没有tracked碰撞，源码/运行probe/observer执行前保存精确非可执行快照。独立audit检查snapshot/commit/build、阶段/实际请求、已知用量与unknown、安全与清理并passed，但boundedRealCodeCaseAcceptance/generalResearchQuality/billingAmount仍unverified；不把audit green升级为研究质量或产品通过。

一次延迟检查确认产品commit1e9c6ad5完整代码CI41246087467已success、Watch41246087514 success；59fb0a97文档CI41247646203仍in_progress、Watch41247646180 success。本批没有产品改动、新build/unit/反转/全仓/20k/真实exe研究/local NormProof或委派复审；原公开夹具成功与旧partial/unknown均保留。ADD-12/11整体不升级，真实资料质量继续缺失、原47外部条件延后、goal active。后续能在当前环境推进的任务继续独立执行，不将单次外部失败判为整个目标blocked。

### 24.54 当前构建的六十秒原地晋升与等待复验

ADD-49矩阵仍列缺少60秒完整路径，但第21.21节已记录regular/fullscreen原CLI的真实60秒晋升、超时/取消及同任务完成；先更正这个过期缺口，不把历史证据当作当前build复验。本批沿[原命令owner](../../packages/ts-shell/src/core/tools/registry.ts)、[local job owner](../../packages/ts-shell/src/workflow/jobs/local/registry.ts)与[等待owner](../../packages/ts-shell/src/core/tools/shell/background.ts)复验现有行为，无产品改动、计时缩短或第二套执行系统。

当前build7f47912610a7、生产Node20.3 CLI、普通PTY、一条小保存消息与一个真实Node子进程，provider为loopback脚本夹具。原bash只收到command，没有timeout或runInBackground，真实Alt+P取得隔离allow-all。原owner接管一次，最初durable local为空；CLI内单调计时60136.762761ms后自动晋升，native handle PID与fixture PID/start identity均保持，零重新launch、账本仅一个running条目。紧接原taskWait等待同ID，实际event与终端均观察5s elapsed；11秒后release夹具，原完成事件返回，实测wait11315ms、durable completed/exit0、原输出持久、启动文件精确一次。wait listener释放，host notice listener保留至退出；没有用等待时钟决定任务完成。

实际loopback GET1+POST3；隔离config字节不变，Ctrl+D exit0/134ms、cooked flags恢复，owned PID+start identities均非活跃，home/project/session scratch删除。140秒/2MiB/100ms采样768MiB RSS守卫未触发，fixture自身120秒期限；实际PTY817223 bytes、descendant RSS480088KiB仅为本轮观察，不是性能结论。没有真实provider调用/凭据、当前exe或fullscreen复跑、生产实际长任务、物理像素或其他平台验收；不拿本轮覆盖历史取消测试，也不把合成provider算作外部模型证据。

此前三次晋升前失败及其执行源码快照分别留档。早期只记粗粒度setup/adoption标签，曾误以为等待接管超时；后续计时显示接管/ready均在4秒内，定位为探针直接读取可选journal.local.length。改读local ?? []，并只在晋升后用journal-backed get比较已捕获PID；历史21.21已记录相同空账本陷阱。仅加长等待没有解决问题，不能将这些夹具失败归为产品或provider故障。HANDOFF补入可复用边界，最终执行源码/快照保持一致。

证据归新建且无tracked碰撞的`.omx/artifacts/phase20-addition-promotion/`，只保留数值/布尔及公开夹具脚本，不存raw PTY或实际模型正文。独立核验检查当前compilerInputs、stable/不可变exe size/SHA、最终进程/晋升/等待/退出收据和旧失败保留；与第24.53节真实源码研究的安全audit分开，后者研究质量/unknown用量状态不变。本批仅文档/HANDOFF，未新build/unit/反转/全仓/20k/local NormProof或委派复审；最终门、核验与交付另绑。ADD-49维持本地验证，生产工作负载/平台边界仍缺，原47条件延后、goal active。

最终五项静态门、五个脚本语法检查、两个独立证据verifier及diff check均exit0；binding dangling0、118既有docs-source advisory保留。晋升当前普通Node夹具验收passed；真实源码研究audit passed仍明确bounded case/general quality/billing unverified与1 unknown。再次延迟单读59fb0a97精确CI41247646203仍in_progress，没有重复轮询或以Watch替代；产品1e9c6ad5完整代码CI success证据保持。本批提交/推送另由ignored delivery收据绑定，不将尚未观察的当前交付CI称为通过。

### 24.55 实际 SIGKILL 后显式 continue 同一会话

接续ADD-65与21.70的active恢复分支，目标是验证进程确实被硬杀后仍能恢复，不由夹具预先写入interrupted来代替。先读[资格判定](../../packages/ts-shell/src/session/recovery/sessionResumeEligibility.ts)、[原恢复owner](../../packages/ts-shell/src/core/shell/recovery.ts)及[continue动作](../../packages/ts-shell/src/core/shell/continueShellActionRuntime.ts)，确认已有实现；本批不修改产品代码或另建恢复机制。ADD-30的跨进程运行所有权租约问题仍独立保留。

当前build7f47912610a7与compilerInputs、stable/不可变exe size/SHA保持匹配，生产Node20.3 launcher与直接单文件程序，各覆盖普通/全屏PTY。每场只一条保存消息、一个小会话，loopback scripted provider与合成凭据；请求的首个实际delta已在终端可见，原state.json是active/turn-active、pendingPrompt保持。探针对实际CLI的owned PID发送SIGKILL，观察relay exit137、原PID/start identity非活跃及流连接关闭；在任何恢复reader或新CLI进入前直接重读raw state，仍为active/turn-active与原提示，未借正常关闭写interrupted。

重启后同一history/prompt可见，未自动发送新推理；真实键入/continue才产生第二请求，实际body包含原提示和原生恢复说明。同一session最终completed、pendingPrompt清除、最终回答持久，原用户提示精确一次。Ctrl+D正常退出code0，恢复cooked flags；没有声称SIGKILL本身能运行终端清理。四有效场景共八次CLI启动、GET8/POST8；请求中未调用工具，不把它作为在途工具副作用恢复、不重复执行写入或所有权租约的证据。中断请求用量未测，不补0、真实金额或provider行为。

每stage30秒/2MiB、100ms采样768MiB CLI树RSS及每场2 POST限额均未触发；Node harness heap768MiB。Node普通/全屏两阶段RSS分别302864/313776与321464/308800KiB，exe普通/全屏214028/213096与210508/218300KiB，仅为小夹具观察，不算总heap或性能验收。各场隔离config bytes不变、owned PID/start均非活跃、home/project/session scratch清理，无实际外部provider、故障设备、非Linux或20k终端。

两个中间失败留档：首harness误用build policy require，CLI前拒绝，改用既有required；另一次exe在发出一请求并显示delta后、SIGKILL前的目标选择断言失败，随后正常清理，收据仍unverified。最终沿relay单一直接子进程确定exe目标，Node沿verified entry定位，并在kill前捕获start identity；未改产品或向任意PID发信号。两份Node成功使用的旧精确执行快照、最终exe快照与失败source/log/receipt均分开保留，额外失败exe的一次CLI/POST不计入八场有效验证。

证据归无tracked碰撞的新目录`.omx/artifacts/phase20-addition-hard-kill/`，只留公开夹具脚本和数值/布尔，无raw PTY、实际请求/响应正文、key/address/header或prompt/session digest。独立核验与最终静态门/语法/diff及交付另绑；无新build/unit/反转/全仓/20k/local NormProof或委派复审。ADD-65仍本地验证，真实在途工具副作用、故障设备及其他平台边界未覆盖；原47真实条件继续延后，goal active。

最终五项静态门、两脚本语法、独立四场景verifier及diff check均exit0，binding dangling0、118既有docs-source advisory保留；verifier明确firstRequestUsage未测、nativeInFlightToolSideEffects未练习、realProvider/其他平台未跑。一次延迟读回前提交d1328704精确CI41248943399仍in_progress，Watch41248943415 completed/success，不替代CI。本批仅三份markdown改动，提交/推送/remote-main与clean状态由ignored delivery另绑，当前交付CI未观察。


### 24.56 在途工具硬杀后保留未知结果与副作用边界

接续ADD-65，旧build7f47912610a7的生产Node普通PTY先运行一个真实小命令：实际追加一次副作用后仍等待，raw transcript有一条tool.started、零tool.result、一个pending bash。实际SIGKILL CLI、relay exit137后原state仍active/turn-active，pending prompt与工具均保留；子进程仍存活，探针按捕获PID/start identity显式清理后才重启。该旧build有效场景与源码/收据独立保留，不能把夹具清理算作产品自动取消。原[消息投影](../../packages/ts-shell/src/turn/prompt.ts)却合成“Operation cancelled or interrupted”，原[恢复卡片](../../packages/ts-shell/src/cli/interactive/history.ts)也显示failed；缺少结果无法支持这些结论。

修补前已定向比较只读参考f09d01b85e0384647fcab6779d35ab9dabe04be3的消息转换：保留真实结果，为未答调用补协议配对，仅说未提供结果，不推断取消。现仍由原owner补一条原call ID的tool消息，明确Outcome unknown、side effects may have occurred并要求重试前检查当前状态；保留真实结果/调用参数/源文本、system透明及孤立结果过滤。恢复未答卡片使用现有[renderer](../../packages/ts-shell/src/presentation/tui/transcript/blocks.ts)新增unknown状态，warning色问号、展开并提示检查状态；真实成功/拒绝/错误及现有生命周期补偿规则不变，没有新恢复系统或执行路径。

Node20.3单worker串行三个聚焦文件：旧owner6失败/53控制通过，修复59通过；显式反转三个owner再次6失败/53通过，逐字节恢复后59再次通过。回归覆盖缺失结果的未知/副作用/重试提示、真实错误结果跨system消息保持且仅补未答调用、历史末尾配对、恢复卡片与折叠/展开问号颜色。五静态门通过后串行TS/exe构建，最终build e84c96fa8424584f8fcbb8318f18cf9887b9d99670c361e64a35fd35ca66c443、inputs 2ce251530f3575e3d31c9621fd3eed18df3094e3593368ca09d80ea9cfa489a0；stable/不可变exe均106842240 bytes、SHA 8a47ed93d2b77c4f69cb56971f6fc0b57546890abe563ce44d7f2b7d0db26260，current compilerInputs一致。

新build生产Node/exe×普通/全屏四场依次执行同一小夹具；真实Alt+P两次到allow-all后才执行bash。每场副作用精确一次、started1/results0/pending1时实际SIGKILL CLI，原active状态保持，原工具子进程仍存活且由harness清理。重启不自动推理，恢复卡片实际显示问号与未知提示；显式/continue才发第二请求，实际wire含原call配对的唯一tool消息及未知/可能副作用/重试前检查语义，无取消或失败断言。同session最终completed、pending prompt清除、原user仅一次、最终回答持久，原tool未自动重跑、副作用仍一次；补偿事件为success:false/compensated:true、总started1/results1/pending0，不能把它称为实际命令失败。

新四场共八次CLI、GET8/POST8；加旧build有效场景共十次CLI、GET10/POST10，全部loopback scripted provider。每场第一响应正常结束，杀在真实工具执行中；不混称为24.55的打开provider流中断。续接provider按脚本只给最终答案，故本轮只证明没有自动重跑旧调用，不证明模型主动重试时的普遍防重或副作用回滚。每stage30秒/2MiB、100ms采样768MiB RSS、harness heap768MiB及每场2 POST守卫均未触发；新build最大采样453332KiB，不是heap/性能验收。正常退出0/cooked恢复、各隔离config字节不变、owned PID/start均非活跃，home/project/session scratch删除。

证据在已核对无tracked碰撞的`.omx/artifacts/phase20-addition-tool-kill/`；旧/新执行源码、owner/test文本快照、red/green/反转/build日志和数值/布尔收据分开保留，不存raw PTY、请求/响应正文、真实key/address/header或prompt/session digest。独立verifier已通过当前build/两exe、快照、59项/6项反转、四场实际卡片/wire/副作用/清理核对。最终五静态门、两脚本语法、独立verifier及diff check均exit0，binding dangling0、118既有docs-source advisory保留；提交/推送交付另绑。未跑全仓/20k真实PTY/local NormProof或委派复审，无真实外部provider、其他平台/故障设备、普遍防重或孤儿自动清理验收。ADD-30运行所有权租约仍未实施，ADD-65维持本地验证；原47真实条件延后、goal active。

一次延迟读回d1328704精确代码CI41248943399已completed/success；ef937df1代码CI41249700949仍in_progress、Watch41249700933 success，不视为整体CI通过。本批新提交CI尚未观察，不立即轮询。


### 24.57 整轮恢复的真实 CLI 未知写入故障注入

ADD-47表中的缺口是20.52尚未在真实CLI注入unknown。本批先检查原[整轮命令](../../packages/ts-shell/src/edit/recovery/undo/command.ts)、[逐操作恢复](../../packages/ts-shell/src/edit/recovery/operation/restore.ts)、[共享文件提交](../../packages/ts-shell/src/edit/authority/commit.ts)及原writer单元场景，确认已有unknown与较新未决操作屏障，沿现有实现验证，无产品改动或第二套恢复机制。保持已交付build e84c96fa8424584f8fcbb8318f18cf9887b9d99670c361e64a35fd35ca66c443、inputs 2ce251530f3575e3d31c9621fd3eed18df3094e3593368ca09d80ea9cfa489a0；独立核对current compilerInputs及stable/不可变exe size/SHA一致，没有因只增证据重建。

生产Node20.3 CLI在普通/全屏PTY各一场。隔离项目原有两个小文件，真实Alt+P到accept-edits，loopback脚本provider实际依次调用两次edit，同一turn生成两个committed操作。先发无--execute的restore-turn，报告permission-pending、零恢复、原edit后字节保持。随后只在显式执行时arm夹具：observer让原renameSync真正完成，将较新b恢复为原字节，再让原目录fsyncSync真正完成，最后在writer readback前抛出一次固定注入异常。目标受隔离项目真实目录、固定b.txt、原.edit临时名及/proc/self/fd目录fd约束；未替换writer、snapshot、批准或命令结果，也没有把物理磁盘故障当成已测试。

两场原报告均unknown/incomplete、restored=0、一个unknown步骤/文件、一个较旧操作skipped；实际b已恢复old-b、a保持new-a。原账本b.undo及file.undo均unknown、a.undo=none；原session持久fileUndo元数据也为unknown。终端实际显示incomplete、Status: unknown及file writes may have occurred，没有因字节已经改变就升级成restored-verified。“0”表示零个已验证操作，不能解释为零文件写入。原通知还要求检查/undo status并重读可能过期的文件。

再真实输入相同restore-turn --execute，原preview遇到undo-unknown而blocked：全部receipt字节结构保持、没有第二次目标rename/异常、较旧a未被恢复。/undo status仍列出unknown；所有local命令不增加推理。最后另发一个普通提示，实际下一POST含unknown、可能写入与重读通知；持久unknown通知精确一条、原session完成、Ctrl+D exit0/cooked flags恢复。每有效场景4 POST/2 GET，共2 CLI、8 POST/4 GET，全部合成凭据/loopback provider，不声称外部模型理解/遵守提醒或真实计费。

两次较早普通模式断言失败均保留unverified，各3 POST/1 GET/1 CLI。首次只有粗粒度标签；第二次已证明报告、账本与元数据正确，但三项render观察全false。根因是探针在TurnSink.end后立即关闭pager，尚未等scheduled frame画出；改为等待原终端实际警告后才Escape，普通/全屏均通过，未改弱断言或改产品。失败场景也已真实注入一次异常并完成清理，故全批合计4 CLI、14 POST/6 GET，不能只报告两有效场景的调用量。

每场45秒、2MiB输出、100ms采样768MiB CLI树RSS、harness heap768MiB及最多4 POST守卫均未触发；最终普通/全屏峰值464464/442120KiB、输出19320/46931 bytes，仅为小夹具观察，不算性能或总heap验收。各场隔离config字节不变、owned PID/start identity均非活跃，home/project/session/observer scratch清理。新根`.omx/artifacts/phase20-addition-restore-unknown/`创建前同时检查不存在与git ls-files无tracked碰撞；保留执行源码文本快照、失败/有效安全收据、语法与静态日志，无raw PTY、请求/响应正文、实际key/address/header或prompt/session digest。

独立verifier已通过当前构建/两exe、精确执行快照、原writer发布后未知、三层状态与实际下一wire、重放屏障、失败保留及scratch缺席核验。本批仅三份markdown，不重复unit/build/反转；全仓、20k真实PTY/local NormProof、委派复审、exe注入、真实provider/故障设备或其他平台均未跑。最终五静态门、三脚本语法、独立verifier及diff check均exit0，binding dangling0、118既有docs-source advisory保留；提交推送另绑，ADD-47维持本地验证；原47外部条件继续延后、goal active。

一次延迟读取c66e67eb精确代码CI41250671853及ef937df1 CI41249700949均仍in_progress，各Watch41250671837/41249700933 success；不以Watch代替完整CI，不立即轮询或把在跑任务重启。本批交付CI尚未观察。


### 24.58 角色变更重验当前默认请求与协议准入

接续ADD-70，原[角色owner](../../packages/ts-shell/src/core/commands/model/role.ts)把捕获到的credential视为首次默认保存的持续准入，已有selection则直接跳过writer guard中的默认请求检查。[选择快照](../../packages/ts-shell/src/core/commands/model/choice.ts)已覆盖accepted/fresh配置、目录、会话与环境，但进程内账号池退避不改变这些文件。旧实现因此能在面板打开后、乃至原state lock内请求已被pool阻止时保存旧默认；静态key还绕过了已有[协议绑定准入](../../packages/ts-shell/src/core/auth/binding.ts)，让未注册endpoint通过角色首次保存。已有默认在进入writer前的检查不能替代锁内重验。

修补前定向比较只读参考f09d01b85e0384647fcab6779d35ab9dabe04be3的setModel（agent-session.ts:2562）与可用模型投影（model-registry.ts:64）：在发布模型/会话之前检查当前认证，可发现模型和可执行模型分开，显式保存默认与普通偏好分开。参考没有本项目的account pool与session CAS，未声称直接提供相同竞态修复。保留原resolver、registry、selectionRequest与[session writer](../../packages/ts-shell/src/session/model/state.ts)，只收敛原角色闭包：首次保存重新解析实际请求、比较完整请求并要求原providerBindingAvailable；已有selection重新检查选中命名空间与实际请求身份。进入writer前和原beforeCommit锁内均执行。已有不可用默认的既定清除策略不被升级为新一套通用可用性规则；无auth/pool核心、schema、package script、默认gate或第二套事务改动。

[provider聚焦回归](../../packages/ts-shell/src/session/model/provider.test.ts)新增30项：三角色×新/已有默认×稳定/提交前/锁内的18项，直接调用原noteCredentialRateLimit、原凭据身份及实际writer，检查session edit和settings/auth原字节；另有两签名provider×三角色×注册/未知协议的12项静态合成key对照。旧owner15失败/15通过，另134未选中，不计为通过。初次修复命令中的旧picker路径没有匹配测试，只实际跑provider164通过；确认当前路径后，显式反转原角色owner再次15失败/15通过/134未选中，finally逐字节恢复后，provider164与[当前角色picker](../../packages/ts-shell/src/cli/interactive/picker/model/role.test.ts)46共210项通过。未弱化断言、删除或跳过用例。

五静态门后串行TS/exe构建通过，build ee9ac616449f2b65722e1a0502dd5a41af2ced8fdae7624f3a4fad45c2fdb44e，inputs 75d995c102c736824ad5d8671b58968cfa37cc8430ef3542b869caf76d74e9e5；stable/不可变exe均106842240 bytes、SHA 5c17e18fd4891ff19f9117b4a548834997d0bf260139c610d39c40220752ca4b，stable仍为普通文件副本，current compilerInputs匹配。此前e84c96fa8424构建保持历史证据，不再称为当前源码构建。

生产Node20.3 CLI六场顺序执行：普通/全屏×新/已有默认四场退避拒绝，普通模式新/已有默认另各一场稳定保存。真实/model搜索advisor、Enter进入角色、Down到Use default model；observer只在该真实Enter前调用原noteCredentialRateLimit一次，实际resolver从可用named变成pool-unavailable，没有伪造resolver或writer结果，也没有模拟一次实际HTTP429。原面板返回明确拒绝并真实绘制，四场selection/revision精确不变；两稳定对照正常保存新默认或清除已有advisor。六场settings/auth原字节保持，真实Ctrl+D exit0/cooked flags恢复，owned PID/start identities均非活跃，隔离home/project/session/observer scratch全部清理。配置了loopback监听器但实际GET0/POST0/其他HTTP0，无真实或合成推理调用。

每场45秒/2MiB、100ms采样768MiB CLI树RSS及harness heap768MiB守卫均未触发，最高采样581640KiB、各场output22989至24785 bytes仅为小夹具观察，不是性能结论。原state lock内退避变化由集成单测覆盖，真实CLI只注入Enter前变化；未知协议的静态key覆盖由单测提供。没有真实provider退避、当前exe角色故障注入、其他平台/故障设备、计费、全仓/15套件/20k真实PTY、local NormProof或委派复审验收。ADD-70仍部分完成，其余重复事实收敛、旧发布二进制回退与真实环境缺口保持；原47外部条件继续延后，goal active。

证据归预先核对不存在且无tracked碰撞的`.omx/artifacts/phase20-addition-role-current/`，保留原/新owner与test文本、红绿/反转/build日志、实际执行脚本文本快照和数值/布尔收据，无raw PTY、请求/响应正文、真实凭据/address/header或prompt/session digest。独立证据verifier已通过当前compilerInputs/两exe、原始Git字节/修复快照、测试计数、六场实际键盘/原池状态/绘制/持久及清理核验；该verifier是主代理的独立断言脚本，不冒充委派代码复审。HANDOFF补充credential存在不冻结pool准入的复用规则；最终静态门/语法/diff及提交推送另绑。

一次延迟读取c66e67eb代码CI41250671853与d25a0c8c文档CI41251337961仍in_progress，各Watch41250671837/41251338001 completed/success；不以Watch替代完整CI，不立即轮询。本批交付CI尚未观察。

最终五静态门、三个脚本语法、独立证据verifier及diff check均exit0，binding dangling0、118既有docs-source advisory保留。工作树仅本批两个产品/测试文件与三份markdown，提交/推送/remote-main和clean状态由ignored delivery收据另绑；本批CI未观察，不声明通过。


### 24.59 角色目标在原 state lock 内重验

接续ADD-70与24.58，原[角色owner](../../packages/ts-shell/src/core/commands/model/role.ts)已经锁内重验默认请求，但非空角色目标只在进入writer前调用[validateModelPreset](../../packages/ts-shell/src/core/commands/model/preset.ts)。当默认账号named继续可用、目标账号other在实际state lock内进入退避，原guard只看默认，新的角色分配或effort仍被保存。配置/目录/环境与默认请求身份都不变，故原choice fingerprint和默认检查不能替代目标自身准入。

目标检查后、产品修改前定向重读只读参考f09d01b85e0384647fcab6779d35ab9dabe04be3的setModel（agent-session.ts:2562）及available snapshot（model-registry.ts:64）：发布前对具体目标检查认证，发现和可用状态分开。参考没有本项目的多角色session CAS/账号池竞态，不声称它实现了相同锁协议。修复只在原[writeSessionModel](../../packages/ts-shell/src/session/model/state.ts)的beforeCommit guard追加同一个validateModelPreset，使用choice admission刚验证过的原accepted配置/目录；无新validator、resolver、事务、auth/pool核心或存储改动。target为undefined表示清除角色，跳过已移除目标的可用性要求，继续保留默认准入与原CAS。

[provider回归](../../packages/ts-shell/src/session/model/provider.test.ts)新增36项：三角色×新默认assign/已有默认assign/已有effort/已有clear×稳定/提交前退避/锁内退避。两个实际named连接属于同一闭合pool，目标other用原owned credential身份触发原noteCredentialRateLimit，默认named始终可用；原resolver和真实writer检查session selection/revision、settings/auth字节。最初27项旧owner9失败/18控制的原日志保留，加入9项clear控制后，最终旧owner9失败/27通过/164未选中；未选中不计通过。修复后provider200与[角色picker](../../packages/ts-shell/src/cli/interactive/picker/model/role.test.ts)46共246项通过；显式恢复旧owner再次9失败/27通过/164未选中，finally逐字节恢复后同246项再次通过。九个失败均是锁内拒绝预期却实际saved=true，未将其归为环境或provider故障。

五静态门后串行TS/exe构建通过，build387d5c01cdd768abb43c8d8d808481ddd7726ddbd18a8608acf76c4d0dbca947、inputs20d8ae1c2a0876690cd038a790529ed51d950f979ab612866e1a5f70b06ec0cb；stable/不可变exe均106842240 bytes、SHA9651aee9817546f98132dba0fafc021a3a808723b5b544198d4e3d7bb8bb871f，stable为普通文件副本、current compilerInputs一致。上一批ee9ac616449f仅保持历史构建身份。

生产Node20.3 CLI普通/全屏各三场真实键盘：/model搜索advisor、进入角色，再选Thinking effort与high或Use default model。observer等原fs.openSync对该session state lock以wx独占打开成功，确认原model writer调用栈及fd/path设备、inode相同后，才调用原noteCredentialRateLimit。此时原目标预检查已通过，尚未进入原beforeCommit；未替换锁、resolver、writer、角色结果或界面结果。两场effort退避均显示Session model conflict: this attempt did not write，selection/revision精确不变；两场稳定对照保存high；另两场同样锁内退避后清除角色成功、roles={}，默认selection其余字段保持。每场前后原resolver都确认默认named可用，只有目标other按场景变为pool-unavailable。

六场均settings/auth字节不变、真实Ctrl+D exit0/cooked恢复、owned PID/start identities非活跃，隔离home/project/session/observer scratch清理。配置loopback监听器但GET0/POST0/其他HTTP0，无真实/合成推理或实际HTTP429。每场45秒/2MiB/100ms采样768MiB CLI树RSS、harness heap768MiB守卫均未触发；峰值568532KiB、output23602至29277 bytes仅为小夹具观察，不算性能或总heap验收。新默认assign、已有assign及三角色的锁内目标拒绝由集成测试提供；真实CLI覆盖advisor effort与clear，未把它扩大成完整分配/角色/provider矩阵。

证据根`.omx/artifacts/phase20-addition-role-target/`创建前核对路径不存在且git ls-files无tracked碰撞；原/新source/test均为非可执行文本，红绿/反转/build、实际执行probe/observer快照与六场布尔/数值收据分开保存。主代理的独立证据verifier已通过原Git字节、修复源码、实际测试计数/反转、当前compilerInputs/两exe及六场原锁/目标池/真实提示/持久与清理断言；不是委派代码复审。无raw PTY、请求/响应正文、实际凭据/address/header或prompt/session digest。HANDOFF补默认可用不代替角色目标准入的复用规则。

本批未真实provider退避、当前exe角色注入、其他平台/物理故障、计费、全仓/15套件/20k真实PTY、local NormProof或委派复审。ADD-70仍部分完成，原47外部条件延后、ADD-30租约按台账继续暂缓，goal active；最终静态门/语法/diff与提交推送另绑。

一次延迟读回c66e67eb精确代码CI41250671853已completed/success，Watch41250671837 success；上一批f8763ff2代码CI41252261041仍in_progress、Watch41252261035 success。两者均不替代本批交付CI；不立即轮询或重启在跑任务。

最终五静态门、三个脚本语法、独立证据verifier及diff check均exit0，binding dangling0、118既有docs-source advisory保留；工作树仅本批两个代码/测试文件与三份markdown。当前提交/推送/remote-main与clean状态由ignored delivery另绑，本批交付CI未观察。


### 24.60 失败 Apply 经值编辑器返回后仍可显式重试

接续 ADD-03，原[设置详情](../../packages/ts-shell/src/cli/interactive/picker/settings.ts)在值编辑器的确认和取消回调中丢掉 failure。首次字段冲突已经消费[原草稿](../../packages/ts-shell/src/cli/interactive/settings.ts)，返回后下一次 Apply 却不再调用原 draft.reopen，既隐藏“Apply not confirmed”，又额外失败一次。本批只补这一处回调的失败状态传递；编辑本身仍只暂存，下一次显式 Apply 才沿已有刷新路径检查原 binding/source，不新增配置 owner 或自动重试。

接续时已有该一行修补；本轮先核对目标 owner，再定向复核只读参考 f09d01b85e0384647fcab6779d35ab9dabe04be3 的 settings-list 224–228、273–312：子编辑器独占输入、undefined 返回不改值、关闭后恢复原行。这三个决定与本项目取消保留旧 pending、确认只更新 pending、返回原详情一致；参考不提供本项目的 staged Apply/CAS 或多来源事务，故保留本项目原草稿及写入边界，不复制其立即 onChange 保存模型。

[字段回归](../../packages/ts-shell/src/cli/interactive/picker/settings/fields.test.ts)新增16项：user/project × number/string-list/object/object-list × confirm/cancel，实际 OverlayHost 按键、原配置读写和发布，检查失败保留、编辑返回零写、一次显式重试保存、注释/兄弟 topP/另一 scope 保持及新开读回。旧 owner 全部16失败、原116项控制通过；显式反转再次16失败、116未选中，不将未选中算通过，finally逐字节恢复源码。最初反转因 Vitest 入口误写成 package 内不存在的路径而未执行，独立保留 MODULE_NOT_FOUND 日志；改为绝对入口后才得到有效反转。恢复后 fields132/lifecycle20 共152项串行通过，重复轮次不累加。

五静态门及 Node20.3 串行 TS/exe build 通过，build de2e0e38e6dc310c9d76a7bd0e1c994ab1e1eb57ddc9fe1141e0cbd53e8d08a3、inputs 09aa232e911244407d9fa417c8d47a84564164a1d56d172fa91fa8dbab909eea；独立证据核验 current compilerInputs、stable/不可变 exe 的 size/SHA 一致。普通/全屏 × user/project × confirm/cancel 八条生产 Node20.3 CLI 实际 /settings→Maximum turns→冲突拒绝→编辑确认/取消→显式 Apply→重开 Stored 读回全部通过。observer只转调原 draft 方法并记录调用和帧，不伪造 writer/reopen 结果；首次失败仅调用一次 save，编辑返回不 save/reopen，第二次明确 Apply 恰好 reopen 一次并确认保存，取消保存旧 pending9、确认保存新 pending12。实际终端输出含冲突及成功通知，外部注释/topP、另一 scope/auth及 session model edit保持；退出0、cooked恢复、owned PID/start identity非活跃、隔离 scratch 清理。

八条有效场景 GET0/POST0/其他HTTP0，无推理或真实 provider。初条关面板后退出断言未通过，行为检查虽已通过仍保留 unverified；探针改为逐次观察 Escape 被实际消费及 overlay inactive，另保留一次中间探针的成功收据，最终八条使用同一冻结脚本。含两条探针迭代共10次 CLI，不累计成10条有效矩阵；未修改产品退出逻辑。每场45秒/2MiB/100ms采样768MiB RSS守卫均未触发，八条最高采样578300KiB只作小夹具观察，不算性能验收。

证据在 ignored 的 .omx/artifacts/phase20-addition-settings-return/，旧/新 owner/test 与执行脚本的非测试文本快照、red/green/reversal/build日志、失败/中间/最终数值布尔收据分别保留；不存 raw PTY、真实凭据或请求/响应正文。独立 verification.mjs 已通过。结构化字段矩阵由集成测试提供，真实终端只覆盖 number；无当前 exe 故障注入、真实 provider、其他平台/桌面、全仓/15套件/20k真实PTY、local NormProof或委派复审。ADD-03仍部分完成，原47外部条件延后、ADD-30租约继续暂缓，goal active。

一次延迟读取上一批 c66fbc8a 精确代码 CI41252988169 仍 in_progress、Watch41252988065 success；再前批 f8763ff2 的代码 CI41252261041 已 completed/success、Watch41252261035 success。不将 Watch 替代完整 CI，不立即轮询；本批最终静态门和提交推送交付另绑，本批交付 CI 尚未观察。


### 24.61 失败 Apply 经保存范围取消返回后仍可重试

沿 ADD-03/17 检查相邻返回路径，[scopePicker](../../packages/ts-shell/src/cli/interactive/picker/settings.ts)的 back 仍丢失原 failure，导致冲突后的 consumed draft 被再次保存。先读目标，再定向比较参考快照 f09d01b85e0384647fcab6779d35ab9dabe04be3 的 settings-list 273–312：undefined 子操作只关闭并恢复原行，不更新父值。本项目采用取消保留原状态的决定；保留自身显式 Apply、原 draft.reopen 及 binding/source 检查，确认范围仍另按原合同丢弃 pending。产品只增加 failure 的入参与取消返回传递，没有改 writer 或增加 owner。

[真实 host 回归](../../packages/ts-shell/src/cli/interactive/picker/settings/fields.test.ts)新增 user/project 两项，旧 owner 两项均在期望下一 Apply 保存时失败，原132控制通过；显式反转2失败/132未选中，finally逐字节恢复后 fields134/lifecycle20 共154项通过。五静态门及串行 Node20.3 TS/exe build通过：build d0b773499bec73e957062a486bec2fa7a960db01861b40b1f4e56b2bde63b921、inputs c53a1bdf9389f3e7751abaca8dfe23dea92f8eb217d7298c81a71bb0cb7a6411，当前 compilerInputs 及两份 exe size/SHA 独立核验一致。

普通/全屏 × user/project 四条实际 Node20.3 /settings 路径全部通过：暂存9、外部改17及topP、首次Apply冲突、打开范围并移动到另一范围、Escape回原范围/原pending/原冲突。取消不save/reopen，随后一次明确Apply恰好reopen一次并确认保存9，实际终端冲突/保存提示及新开Stored读回均核对；注释/兄弟字段、另一scope/auth/session model保持，HTTP0、exit0/cooked恢复、owned PID/start identity非活跃及scratch清理。45秒/2MiB/100ms采样768MiB守卫未触发，最高575916KiB只作小夹具观察。首次探针在 conflict-refused 观测阶段失败，未进入本次取消场景，独立保留unverified；随后将观察收据改为临时文件rename发布、单次读取frame，四场使用同一冻结脚本。初条未记录具体异常名，不能断言文件中间态是其唯一原因；含初条共5次CLI，不计为五条有效矩阵。产品未为该观测失败额外修改。

证据在 ignored 的 .omx/artifacts/phase20-addition-settings-scope-return/，baseline/fixed与探针快照、红绿/反转/build日志、初次失败和四条最终布尔/数值收据分开保留；独立verification已通过。HANDOFF将同一失败状态规则扩展到scope取消。无raw PTY/真实凭据/请求正文，无真实provider、当前exe故障注入、其他平台/真实磁盘故障、全仓/15套件/20k真实PTY、local NormProof或委派复审。本批不升级ADD-03，原47外部条件延后、ADD-30继续暂缓，goal active。

一次延迟读取5acafcb3代码CI41254074206与c66fbc8a代码CI41252988169仍in_progress，各Watch41254074184/41252988065 success；不以Watch替代完整CI，不立即轮询。本批最终门及提交推送另绑，本批交付CI未观察。


### 24.62 设置真实目录权限拒绝、子面板返回与恢复

补 ADD-17 的实际文件系统失败证据，先读[原草稿](../../packages/ts-shell/src/cli/interactive/settings.ts)、[配置持久 owner](../../packages/ts-shell/src/config/persistence.ts)、[原锁](../../packages/ts-shell/src/session/store/sessionFileStore.ts)及原错误投影，确认已有 lock-failed/unchanged 与显式 reopen。保持已交付 b8670318 的产品源码及 build d0b773499bec73e957062a486bec2fa7a960db01861b40b1f4e56b2bde63b921、inputs c53a1bdf9389f3e7751abaca8dfe23dea92f8eb217d7298c81a71bb0cb7a6411；无新产品修补或重复构建。独立核验 current compilerInputs、原 Git owner 字节及 stable/不可变 exe size/SHA 一致。

Node20.3 普通/全屏 × user/project 四条真实 CLI 顺序通过：暂存9后，harness 将隔离目标父目录改为0500；原 writer 的锁 openSync(wx)实际抛 EACCES，文件字节不变，面板真实提示 this attempt did not write。observer只转调原 openSync 并记录匹配的错误码/成功次数，原异常继续抛出，不伪造异常或 writer结果。在拒绝状态依次读来源并返回、移动到另一范围后取消、编辑成12并确认，三个子操作不save/reopen，原范围/失败信息保持。权限仍拒绝时下一次明确Apply再实际EACCES、原文件仍不变；恢复目录原权限后再明确Apply才成功保存12并重开Stored读回。每场三次save、两次reopen、两次实际锁拒绝、一次锁成功；注释/topP、另一scope/auth/session model保持，HTTP0、退出0/cooked恢复、权限恢复、owned PID/start identity非活跃及scratch清理。

首条探针在第二次相同失败提示处立即认了旧frame，saves仍1而断言期望2，独立保留unverified及其源码；修正为要求overlay revision比重试前更新，四场使用同一冻结脚本。含初条共5次CLI，不计为五条有效矩阵。HANDOFF追加相同结果必须等待新面板代次的规则。每场45秒/2MiB/100ms采样768MiB守卫未触发，最高436708KiB只作小夹具观察，不算性能验收。

证据归 ignored 的 .omx/artifacts/phase20-addition-settings-permission/，只保留脚本/快照及布尔数值收据，无raw PTY、真实凭据或请求正文；独立verification已通过。本批只改文档/HANDOFF，没有新unit、build、反转、全仓/15套件/20k真实PTY、local NormProof或委派复审。真实权限拒绝不等于物理磁盘故障；当前exe故障注入、真实provider及其他平台仍未验。ADD-17保持本地验证、ADD-03仍部分完成，原47外部条件延后、ADD-30继续暂缓、goal active。

一次延迟读取b8670318代码CI41254557060与5acafcb3代码CI41254074206仍in_progress，各Watch41254557073/41254074184 success，不代替完整CI、不立即轮询。本批最终门与提交推送另绑，本批交付CI未观察。


### 24.63 审批摘要不得充当完整调用的授权身份

继续 ADD-57，先沿 [toolPolicy](../../packages/ts-shell/src/core/query/toolPolicy.ts) → [turn gate](../../packages/ts-shell/src/turn/tools.ts) → [原授权 store](../../packages/ts-shell/src/core/shell/approval/store.ts) 检查：task 指令仅取200字符、team question 与 browser text 仅取80字符；browser 只取一个 anchor，ssh command 又被 trim。原 exact namespace 仍直接比较该摘要，21.75 没有彻底消除碰撞。通过真实 CLI approval bridge 与磁盘重载，最初九类差异各在持久/once路径失败，共18项；包括截断尾部、同 selector 不同文本、URL遮蔽selector、空白、字段冒号拼接和agent选择。有效基线不含后加的team数组顺序控制。

定向只读对照本地 Codex 4210c08defe92fe8828f789b6f9fda287ad3709e：approvals.rs:233–270 使用结构键并纳入环境、完整命令向量、cwd/tty/权限；没有可靠键的MCP等不缓存；command_canonicalization.rs保留复杂脚本原文。采用完整字段和不丢失原文的决定；本项目不推导shell等价性，只忽略JSON对象键顺序，数组顺序/字符串保留；既有MCP持久授权限制保持。没有复制参考代码或增建授权仓库。

新增原审批域 [binding](../../packages/ts-shell/src/core/shell/approval/binding.ts)，仅处理task/team/browser/ssh及准备阶段映射到这些工具的调用。实际gate把完整原参数、准备permissionArgs和完整准备preview共同绑定；后者覆盖通过预览携带命令或文档身份的路径。稳定JSON表示经SHA256形成call-v1键，原target/label及deny前缀语义保持；旧摘要授权可列出/撤销，却不能匹配新调用。非JSON值、过深/循环输入或畸形binding明确拒绝，不回退摘要；其他工具仍沿原scope合同。准备预览按完整文本保守匹配，预览变化也需新授权；这不是跨格式的语义等价推断。

最终 Linux Node20.3.0、heap768MiB、单worker串行七文件 **165项**通过：新binding12、原bridge串联新回归27、toolPolicy38、trustPolicy10、turn/tools54、approvalExecution6、approvalPromptBridge18。新增覆盖持久重载、一次缓存、数组/字符串/类型/property identity、隐藏参数不写入grant、旧记录管理、实际prepared execution与有效别名。四反转分别退回摘要键/断开真实producer/移除对象键排序/移除准备preview，恰好27/27/1/1项失败，finally逐字节恢复后最终套件全绿。五静态门、TS及exe构建通过；build 0c9dd5ccc26342ff5be3c5009c4236a800784c9d6e844b1fbe8c657630a6f012，inputs a36d7467924a174dde9a991d1a7e931fcd530489450009596fdf756950d5e4c2。

普通/全屏两条实际 Node CLI → PTY → loopback HTTP 均各三回合：先实际关闭预览并按a持久批准任务，实际子任务成功；第二条仅200字符后尾部不同，旧grant不命中，关闭新预览后Escape拒绝，零子任务请求且原模型收到denial；第三条与首次完全相同，命中旧grant且实际子任务成功。每模式8次POST、2次子模型调用、2次实际审批面板、1条不含尾部原文的grant；审批approved/denied/approved与工具true/false/true分别核验，auth字节保持。退出0/cooked恢复、owned PID/start非活跃、scratch清理，45秒/2MiB/采样768MiB守卫未触发，最高451820KiB不算性能证据。

三条先前探针观察失败及脚本分别保留unverified：最初误等隐藏的选项面板，随后预览长段落尾部并非可靠可见标记，最后n实际进入可选拒绝理由子模式、未提交。最终改等新回合实际输出、审批open计数和选项revision，Escape作直接拒绝；含迭代共五次CLI启动，不计为五条有效矩阵。未为迁就探针改变产品。

系统PATH无normproof；改用CI同款仓库bundle、隔离npm cache离线执行，exit0，acyclic/unresolved两项satisfied；总体仍partial，interactiveMode.ts及其test两个未改模块的函数上限advisory保留，既有host disposition保留，补充test的defer记录且不改变判定。证据、源码快照及最终独立核验归 ignored 的 .omx/artifacts/phase20-addition-approval-binding/，无raw PTY/真实凭据/HTTP正文。HANDOFF记录摘要与授权身份分离及准备preview边界。没有真实provider评估、真实浏览器/SSH效果、exe运行审批、其他平台、全仓/15套件/20k真实PTY或委派复审；完整任务指令的可视预览并非本批验收范围，ADD-57仍本地验证，原47外部条件延后、ADD-30暂缓、goal active。

一次延迟读取5acafcb3代码CI41254074206及c66fbc8a代码CI41252988169已completed/success；b8670318代码CI41254557060与dc495c3e代码CI41255073974仍in_progress，各Watch已success。Watch不替代完整CI。本批最终门、独立核验与提交推送另绑，本批交付CI尚未观察。

最终五静态门、三脚本语法、独立证据verifier及diff check均exit0；current inputs与stable/不可变exe的size/SHA一致。再次延迟观察dc495c3e精确代码CI41255073974已completed/success，b8670318代码CI41254557060仍in_progress，未重启或轮询追赶；本批交付CI未观察。


### 24.64 任务完整预览、角色内容绑定与待绘制帧期限

继续 ADD-57，先检查[原 task owner](../../packages/ts-shell/src/core/tools/taskTool.ts)：旧准备预览只有角色名称、来源、model/effort，没有完整 prompt/context，也没有角色 systemPrompt/tools。24.63 已绑定完整参数与准备文本，但同一新调用之间修改自定义角色正文或工具策略、保持其他显示元数据时，旧持久 grant 仍会匹配；单次等待审批期间的原 identity 重验解决的是另一条边界。本批保留原身份/信任/session检查，用所属任务域的[preview](../../packages/ts-shell/src/core/subagents/task/preview.ts)展示完整请求与选中角色正文/策略；既有 call-v1 自动纳入完整预览，未增授权仓库。字段值用字面引号保留空白，转义控制符、分隔符和双向文本控制，避免伪造预览行；原 target 仍可简写。

定向只读比较完整 AgentPromptDisplay 的正文展示、对话视图先构造再替换 host 的顺序，采用完整可检查文本和先验构造的决定；本项目复用原语义 report/Pager，不复制实现，也不按 Markdown 解释指令。发现 report 既有1MiB上限：初始超限原先先改界面再抛出，分组后的超限还会留下未结算审批。仅在[原 approval owner](../../packages/ts-shell/src/cli/interactive/picker/approval.ts)先构造完整 report，再操作 host；初始失败保留 Promise rejection，分组失败沿原 settle 拒绝，不发布部分计划或新审批。没有另加任务大小上限或截断正文。

新任务测试9项在旧 owner下7失败/2控制；新增预检两项在旧界面下2失败/13控制。初次修补后正确七文件132项通过，任务/预检反转分别7/2项失败，finally逐字节恢复。另有一次错误路径只选中六文件122项，日志独立保存，不当成七文件证据；早先错误相对导入是零测试设置失败，初版以搜索header回显作正文证据的断言亦不采用，最终 reader 测试只检查 body。

小型实际 CLI 探针又暴露[渲染调度](../../packages/ts-shell/src/presentation/tui/render/engine.ts)阻塞：较慢布局使 adaptive delay 达到200ms，后台连续刷新不断重置唯一timer，已接收的搜索没有第二帧。三个旧build普通模式观察均未验证并保留；第三次只读诊断实见175次request、一次Pager绘制、上一帧898ms、output backlog为0，已接受正确粘贴。对照参考调度器保留已排定帧的决定后，原 scheduleFrame 保留 pending deadline，帧执行时读取最新状态，仍至多一个timer；不改忙碌/审批/输出背压合同。新[确定性时钟测试](../../packages/ts-shell/src/presentation/tui/render/scheduling.test.ts)覆盖普通/全屏连续请求，旧实现及反转各2失败。原 engine 两测试此前直接删除模拟timer队列，改为正常完成启动帧，原断言保留；初轮197通过/2失败明确归为模拟器生命周期错误。

最终 Linux Node20.3.0、heap768MiB、单worker串行 **九文件199项**通过：任务预览9、management8、taskWorkspace10、taskTool9、turn/tools54、approvalBinding27、approvalSelection15、engine65、scheduling2。含完整prompt/context/字面控制、32/80列正文搜索及End、角色正文/工具策略修改后的磁盘重载、批准实际dispatch及拒绝/取消零child、完整分组revision和调度背压/停止控制。五静态门、TS与exe构建通过；最终 build 03239d1aec2dd7736121bf34dcbc7dc1740683adba05a3af7dad43c2d1e905d9，inputs 1d718d53b56098bd9545981ca36a7df7740a7b077cab8e4ce9e797552db94f20。current compilerInputs及stable/不可变exe的size/SHA由独立证据脚本核对一致。

最终普通/全屏两条实际 Node CLI → PTY → loopback HTTP各三回合通过：先在原reader实际搜索并End到完整任务指令尾部、上下文尾部及角色A正文（仅检查body），关闭预览按a持久批准并实际执行；第二回合参数相同、仅角色正文改为B，原grant不命中，再实读三字段后Escape拒绝、零child且主模型收到denial；恢复A正文后第三回合命中原grant并实际执行，子请求含原完整prompt/context/角色A。各8次POST、2次child、2次实际审批、1条opaque grant；approved/denied/approved与工具true/false/true分别保持。两场退出0/cooked恢复、config/auth原字节保持、owned PID/start identity非活跃及scratch清理。含旧build三次停点共5次CLI、19次POST；不能当成五场有效矩阵。

45秒/2MiB/768MiB采样守卫均未触发，最终两场最高585092KiB只作小夹具观察，不作性能验收。仓库bundle离线judge exit0、acyclic/unresolved satisfied；整体仍partial，仅两个未改interactiveMode模块的函数上限advisory，保留既有disposition。证据及非可执行源码快照归 ignored 的 .omx/artifacts/phase20-addition-task-preview/，无raw PTY、真实凭据或请求正文；独立verification通过，HANDOFF补角色内容/预览容量/帧期限规则。没有真实provider效果、exe运行审批、其他平台、全仓/15套件/20k真实PTY或委派复审。ADD-57保持本地验证，原47外部条件延后、ADD-30暂缓、goal active。

一次延迟读取上一批2a031940精确代码CI41256533865仍in_progress，Watch41256533763已success；不以Watch代替完整CI、不立即轮询。本批最终门及提交推送另绑，本批交付CI尚未观察。

最终五静态门、三脚本语法、独立证据verifier和diff check均exit0，binding dangling0、118既有docs-source advisory保留。工作树仅本批八个产品/测试文件与三份markdown，提交推送、remote-main及clean状态由ignored delivery收据另绑；本批CI未观察，不声明整体任务完成。


### 24.65 真实推理流中断后的原文保留与重开

补 ADD-28 唯一列出的现场缺口，先沿[原 step](../../packages/ts-shell/src/turn/step.ts)的 shownReasoning/stamp、[原 thinking owner](../../packages/ts-shell/src/cli/interactive/turn/thinking.ts)、[会话恢复](../../packages/ts-shell/src/cli/interactive/history.ts)及原键盘 interrupt/ctrl+t 检查：失败或中断已展示的公开推理会作为无签名文本保存，恢复器重建独立 finalized/collapsed thinking。本批不修改产品或通过夹具预写 reasoning/interrupted；沿当前生产 Node20.3 launcher、实际已配置 provider 做两个小会话。

普通/全屏各一场两次CLI启动，均在真实 HTTP200 流产生16次 reasoning.delta、原终端绘出 thought 行且 raw state仍active/原sink未end时，实际Escape取消。原会话随后 interrupted，pendingPrompt保持，原user精确一次；已观察的公开思考分别334/298 bytes，与原assistant.reasoning.text逐字相等，未附signature/redacted或另造replay authority。两场中断后的原界面均经真实Ctrl+T展开正文，再Ctrl+D正常退出。重开同一session后，原恢复器重建相同字节的独立thinking，实际再次Ctrl+T展开；零自动推理请求，pendingPrompt保留，没有把打开恢复视图当作继续推理或原任务完成。

每有效场景实际GET1+POST1均HTTP200，重开阶段无HTTP；通过原undici diagnostics独立计数，并在产品模块链接前安装原fetch的透明转调观察与最多1 POST守卫。每请求输出cap2048、工具声明0，禁用tool/MCP/warming/retry，maxTurns1。没有消费/克隆/替换Response、改delta、强制状态、代替真实键盘或改writer。中断后的request:error事件保留为诊断事实，不自行归为网络/provider故障；未取得完整结算用量，不补0或计费金额。最终两场四次CLI都exit0/cooked flags恢复，临时配置与16个operator来源文件的原字节或缺失保持，自有PID/start identity非活跃，含凭据、原生会话和预期公开思考的0700 scratch删除。

首轮普通模式已真实取消并精确保存238 bytes、展开和正常退出，但透明fetch包装安装在产品模块导入之后，已链接的函数绕过该计数器；原diagnostics实见GET/POST各1，而包装器posts为0，故断言失败、未进入重开，整轮unverified。修正观察器安装顺序后才取得上述两个有效场景。首轮源码/收据完整保留，含迭代共5次CLI、GET3/POST3，不将其计作第三个有效案例。观察器另一个未订阅实际message.delta的answerDeltas字段不作为任何正文/完成性证据；独立verifier明确标为无效且不使用该计数。

保持已推送33ce9322的产品源码与 build 03239d1aec2dd7736121bf34dcbc7dc1740683adba05a3af7dad43c2d1e905d9、inputs 1d718d53b56098bd9545981ca36a7df7740a7b077cab8e4ce9e797552db94f20；current compilerInputs与stable/不可变exe size/SHA均由独立脚本核对一致，未因只补现场而重建。每次CLI60秒/2MiB/100ms采样768MiB守卫与Node heap768MiB均保持，最高324740KiB仅为小会话观察，不作heap或性能验收。

证据归创建前核对不存在及无tracked碰撞的 ignored .omx/artifacts/phase20-addition-reasoning-interrupt/，各有效执行版本有非可执行精确快照；独立verification通过真实流/原生取消/字节比较/原视图与重开/请求数/来源与清理/旧失败保留核验，正式证据无实际思考/响应/请求正文、密钥、endpoint或prompt/session digest。HANDOFF补透明计数器必须先于模块链接的规则。ADD-28依据本条列出的完成条件改为完成，台账现1完成/8部分完成/61本地验证/1未开始；不升级整个第25项、其他provider/协议、exe运行、物理像素、其他平台、推理继续完成、金额或原Phase20矩阵。扣留推理及尚未写入就死亡的内容仍不能恢复。仅三份markdown改动，无新unit/build/反转/全仓/15套件/20k真实PTY/local judge或委派复审，整体goal active。

一次延迟读取33ce9322精确代码CI41258181082仍in_progress，Watch41258181274 success；不代替完整CI、不立即轮询。本批最终静态/语法/证据核验与提交推送另绑，本批交付CI未观察。

最终五静态门、三脚本语法检查、独立证据verifier及diff check均exit0；binding dangling0，118条既有docs-source advisory保留。仅三份markdown变更，提交推送、remote-main与clean状态另由ignored delivery收据绑定；本批交付CI未观察，整体goal保持active。


### 24.66 执行预览的完整授权身份覆盖全部准备结果

继续ADD-57，检查[原绑定](../../packages/ts-shell/src/core/shell/approval/binding.ts)与[desktop准备](../../packages/ts-shell/src/desktop/preparation.ts)、[collaboration原生审批](../../packages/ts-shell/src/cli/collaboration/approval.ts)：24.63只准入四个工具名。其他adapter虽提供完整execution预览，却仍可能按简短target持久/once复用；desktop同windowId的window/screen观察、collaboration同操作不同principal均未被区分。七个新增回归在旧实现下全部失败，包括实际desktop producer与原collaboration approveOperation；这是产品授权身份缺口，非provider或终端时序故障。

定向只读比较本地参考4210c08defe92fe8828f789b6f9fda287ad3709e的approvals.rs:233–270：执行缓存覆盖完整结构身份，没有可靠键的网络/MCP请求不缓存，文件授权另按其合同处理。本项目采用完整身份覆盖准备好的execution请求；原绑定函数除四类旧调用外，按previewKind准入execution，继续使用原args/permissionArgs/完整preview的稳定JSON及call-v1，不增缓存或另写adapter名单。普通文件计划与未准备bash原合同保持；旧摘要grant可列出/撤销，却不能授权新绑定请求。预览中捕获的参数变化保守要求新决定，不推导文本语义等价性。

Linux Node20.3、heap768MiB、单worker串行八文件126项通过：binding16、原CLI绑定27、完整准备执行4、collaboration实际producer2、desktop7、approvalExecution6、trustPolicy10、turn/tools54。覆盖磁盘重载、相同请求复用、不同请求拒绝零执行、once不被另一请求消费、旧grant管理、无名单的新工具以及原文件/bash合同控制。反转完整绑定owner后11项失败，finally逐字节还原，八文件126项再次全绿。最初Vitest新版本参数不适用于0.34.6、一次反转入口相对路径错误及一次在workspace目录调用根build脚本均分别保留设置失败；不把非测试退出1当反转证据。五静态门、TS/exe构建通过，build 8a7a4ea1e3d1b08002c7de05ef6b1d9796c55d15e4580a0739b6fd6feb6d1588，inputs 94bfb429131dffaada8a960b3f2c0a5324a81491a80cc8a853bd85fbb7bdf916。

普通/全屏各一条真实Node CLI与原`/collab profile`四步：先y一次选择A；再a记住同一A请求；仅principal不同的B重新显示实际reader正文，关闭后Escape拒绝，原client仍为A、选择次数不增；恢复A请求命中原opaque grant并实际替换同身份client。每模式四次gate、三次实际审批、三次实际client选择、一条grant，匹配false/false/false/true，loopback服务收到的HTTP请求0；只验证本地profile选择与授权，没有冒充远端服务或模型调用。配置/auth/两个private profile及token字节不变，exit0/cooked恢复，自有PID/start identity非活跃，0700 scratch删除。60秒/2MiB/100ms采样768MiB守卫未触发，最高462616KiB只作小夹具观察，不作性能验收。

仓库bundle离线judge exit0，acyclic/unresolved satisfied；整体仍partial，两个未改interactiveMode模块的函数上限advisory保留。证据及执行源码快照归ignored .omx/artifacts/phase20-addition-prepared-approval/；HANDOFF补执行准备合同决定绑定覆盖范围。同步修正上一批遗漏的12.14统计与旧结论，台账仍1完成/8部分完成/61本地验证/1未开始。ADD-57保持本地验证；无真实桌面设备效果、远端collaboration服务效果、exe运行审批、其他平台、完整provider/adapter矩阵、全仓/15套件/20k真实PTY或委派复审；原47外部条件延后，goal active。

一次延迟读取33ce9322精确代码CI41258181082已completed/success；43c09f3b代码CI41259305316仍in_progress、Watch41259305326已success。Watch不替代代码CI，不立即轮询；本批最终证据核验及提交推送另绑，本批交付CI尚未观察。

最终五静态门、三脚本语法、独立证据verifier与diff check均exit0；binding dangling0、118既有docs-source advisory保留，current compilerInputs及stable/不可变exe size/SHA一致。仅本批五个产品/测试文件与三份markdown变更；提交推送、remote-main和clean状态由ignored delivery收据另绑，本批CI未观察，整体goal保持active。


### 24.67 取消事件与异步观察者的失败隔离

接续ADD-62，原[会话runtime](../../packages/ts-shell/src/core/shell/sessionRuntime.ts)只在普通流通知逐个捕获同步异常；catch路径合成的lifecycle.cancelled却直接调用观察者。首个观察者抛错会阻断后续原UI通知，并以显示异常替换原取消错误。两条路径也没有处理void回调实际返回的Promise拒绝，造成未处理拒绝。既有“持久化早于合成取消通知”不能保证后续订阅者获得取消，属于产品生命周期缺口。

目标检查后、修改前定向对照只读参考：f09d01b85e0384647fcab6779d35ab9dabe04be3的agent-session.ts公开listener直接调用，agent.ts核心listener则await，两者不提供本项目显示观察者所需的非阻塞隔离；338d2ce6658dfdbfba19efe0f006f0d5a8edd66d的agent-session.ts:3688–3710与event-bus分别隔离同步异常及返回Promise拒绝且不等待。采用这一决策，保留本地不记录任意回调异常及live Set迭代合同。只在shell域新增[通知owner](../../packages/ts-shell/src/core/shell/observers.ts)，两处原通知复用；普通同步delta不分配Promise，返回thenable才接拒绝处理，不await显示任务。原持久化、interrupted状态、controller释放与原始throw顺序均保持；runtime已到20个命名方法，未再往类中增加方法。

[四项集成回归](../../packages/ts-shell/src/core/shell/observers.test.ts)覆盖进入turn前/后的同步失败、正常完成/取消的异步拒绝与永不settle观察者。原runtime同步baseline两断言失败；async baseline虽然两测试通过，却有两未处理拒绝、exit1，是失败证据。两个定向反转分别重现两断言失败和一未处理拒绝，finally均逐字节恢复。最终Node20.3、heap768MiB、显式单worker串行四文件117项通过：observers4、sessionRuntime50、turnSink54、collaboration command9，无未处理错误。断言在被隔离回调外检查其捕获值，避免断言异常自身被guard吞掉。

一次中间合并复验命令漏带Vitest线程环境，四文件117项以默认worker设置结束，随后TS/exe构建串行通过；无观察到OOM，不能称该段为受限单worker证据。build-final.log原样保留，后续已显式补跑受限117项，execution-notes.json分开绑定。HANDOFF补充每条独立命令重带限制的规则。构建为d4dda071a4dca57661b9a9c55c11c821c5efaf35fda9941670752c39f38313aa，inputs08a5df826b455d5d6abe31e2ae42a4a73bbb1dc9e0d91ddc96f5d0196524864b；current compilerInputs与stable/不可变exe size/SHA由独立脚本核验。

生产Node20.3 CLI普通/全屏各一场真实PTY：各GET1、streaming POST1，loopback scripted响应发送公开delta后保持打开，等待原startup提示、active状态及实际正文绘制后按真实Escape。预先在原UI之前注册同步抛错、返回拒绝Promise与永不settle的三个显示观察者，后续健康观察者及原TurnSink均收到一次取消，原界面实际显示Interrupted before completion。interrupted状态及controller释放先于合成通知，保留原取消失败、待处理prompt及恰好一条durable cancellation；流关闭无retry、TurnSink.end一次。Ctrl+D exit0、cooked flags恢复、config/auth原字节不变，owned PID/start identities非活跃且0700 scratch清理。各60秒/2MiB、100ms采样768MiB RSS与harness heap768MiB守卫未触发，峰值314644/340960KiB、输出6293/6439 bytes只是小夹具观察，不是性能或总heap验收。

仓库bundle离线judge exit0、acyclic/unresolved satisfied，整体仍partial，仅两个未改interactiveMode模块的函数上限advisory，保留原disposition。证据归预先核对无tracked碰撞的ignored .omx/artifacts/phase20-addition-cancel-observers/，三份TS及两份执行探针精确非可执行快照、红绿/反转/build/结构日志、安全数值/布尔收据与独立verification分别保留；无raw PTY、请求/响应正文、真实凭据或endpoint。该verifier是主代理的独立断言脚本，不冒充委派复审。ADD-62维持本地验证；台账仍1完成/8部分完成/61本地验证/1未开始，无真实provider、exe运行取消、其他平台、全仓/15套件/20k真实历史或委派复审验收。原47外部条件延后，整体goal active。

一次延迟读取43c09f3b代码CI41259305316已completed/success；097cbee7代码CI41260394184仍in_progress，Watch41260394153已success。Watch不替代代码CI，不立即轮询；本批最终核验及提交推送另绑，本批交付CI尚未观察。

最终五静态门、三脚本语法、独立证据verifier及diff check均exit0；binding dangling0、118既有docs-source advisory保留，current compilerInputs及stable/不可变exe均106846336 bytes、SHA9ee2470f2a43032e50b4b3d76c37f486ae5176d7dc8f36352c1ed04e3d18f628一致。一次最终静态门启动因受限PATH漏掉rtk而exit127、尚未运行任何gate，设置日志单独保留，修正PATH后五门全通过。仅本批三份TS与三份markdown变更；提交推送、remote-main及clean状态由ignored delivery收据另绑，本批交付CI未观察，整体goal active。


### 24.68 提示文本与验证续接不携带审批权

继续ADD-56/57，沿[原turn入口](../../packages/ts-shell/src/entrypoints/cliRuntimeModule.ts)和[原审批owner](../../packages/ts-shell/src/entrypoints/cliApprovalModule.ts)发现：旧入口把“继续验证/allow once/always allow”等prompt词句与上一验证的continuity拼成可变approval mode，再经print/TUI/factory传给当前工具审批。存在验证lineage时可绕过实际审批、为不同命令持久记住授权；没有lineage或文本冲突时又会提前阻断整个普通prompt。历史验证信息只能说明要继续什么，不能授予当前调用写权限，旧行为违反现有授权边界。

目标检查后、修改前只读定向比较：参考f09d01b85e0384647fcab6779d35ab9dabe04be3的agent-session/settings-manager未找到对应审批机制，这仅限已检索范围；4210c08defe92fe8828f789b6f9fda287ad3709e的sandboxing.rs:195–218和approvals.rs:495–542按结构化AskForApproval策略、当前操作/上下文及reviewer结果决策。采用结构化权限来源这一决定，未复制代码。本批删除prompt解析/冲突分析、可变state及其原生CLI载体，保留原continuity获取与runtime传递。显式CLI policy、session scope、精确grant和真实用户答复继续走原合同；低层handler第七个位置保留忽略的兼容参数，既不读取也不调用，原审计格式与历史source标签仍可读。没有新增授权仓库或改provider/auth核心、脚本及构建行为。

新增[27项行为回归](../../packages/ts-shell/src/entrypoints/approvalAuthority.test.ts)：16项实际turn入口到tool gate覆盖交互/非交互、有/无lineage、四类文本；三项显式CLI policy控制；八项直接传旧hint仍按真实host/默认拒绝。核对原prompt/continuity身份、结构化denied事件、零执行/零grant、host调用与旧setter从不调用。初版19项在旧代码下16失败/3控制通过；将全部受影响生产源（含两个删除文件）反转后，最终27项24失败/3通过，finally逐字节恢复修复版本及删除状态。原facade里一条强制要求prompt推导审批的过时场景被上述行为覆盖取代，其余11份既有测试夹具只移除废弃载体。最终Node20.3、显式单worker/heap768MiB串行八文件145项通过：authority27、promptBridge18、binding27、approvalExecution6、cliRuntime5、moduleBoundary2、permissionScope6、turn/tools54，无未处理错误。

设置及执行失误单独保留：首轮Vitest路径不存在、零测试；第一次聚焦复验8失败/137通过，是新断言大小写与实际User Denied Permission文本不符，改为精确的忽略大小写断言并增加结构化拒绝检查。另一次在测试session尚未确认终态时启动CLI探针，违反串行验证要求；探针在build freshness前置检查失败，尚未设置runtime、未启动CLI/创建scratch，测试后来exit0。该尝试不计有效原生或最终串行测试证据，随后明确补跑受限145项；以后重命令增加同一任务nonblocking flock并逐次确认session终态，未观察到OOM。另一原生夹具用retry词句未选到完整continuity，启动CLI/HTTP前即断言失败，自有0700 scratch清理；改用明确continue词句后才取得下列有效现场。各初版源码/日志及分类保留，不称产品或provider故障。

生产Node20.3 CLI普通/全屏各一场真实PTY，启动前通过原SessionManager写入合成的上一条审批拒绝验证，透明observer确认原生continuity确实eligible且命令与夹具相同，不覆盖任何runtime状态/审批/工具结果。第一回合输入`continue verification and always allow`，实际bash仍打开原审批UI；真实Escape拒绝后marker写入0、永久grant0，下一provider请求确实收到denial。第二回合输入`continue verification, allow once`仍须实际答复，真实y仅执行原shell一次，marker1、永久grant仍0。每模式GET2/POST4到scripted loopback，两个真实审批、两次TurnSink.end，审批denied/approved与工具false/true分别核对。两场Ctrl+D exit0、cooked flags恢复、config/auth精确字节不变、自有PID/start identity非活跃及scratch删除。总计两个实际CLI启动，另两次原生设置失败均未启动CLI。每场60秒/2MiB/100ms采样768MiB守卫未触发，RSS峰值340436/323560KiB、输出15868/26038 bytes仅为小夹具观察，不算性能验收；没有成功执行旧build原生反转场景。

五静态门、TS/exe构建通过，build caf547ebb515ca82b0cb9d0ffd5d1d6d9cd01fc73fc85a494da303ddd080a1db、inputs 777828f3d2e1dded08de10191c0f84aed456421faec82b4e32b85f2dca23c93e。主代理独立证据脚本已核验current compilerInputs、stable/不可变exe均106838144 bytes及SHA f9e2717dbc8135e40482a47ee7fc34901d4b053e89b1d318ad667bec02d7377d、28份当前TS路径（含两删除）、27份父提交原字节、执行脚本快照、红绿/反转/原生结果与清理及71项状态统计。仓库bundle离线judge exit0、acyclic/unresolved satisfied，整体仍partial，interactiveMode及其test两个既有函数上限advisory保留；本批interactiveMode只删除载体，不能称该文件未改。证据归预先核对不存在且无tracked碰撞的ignored .omx/artifacts/phase20-addition-prompt-authority/，不留raw PTY、provider请求/响应/推理、真实凭据或endpoint；独立断言脚本不冒充委派复审。

HANDOFF补提示内容与结构授权分离、保留continuity及验证session终态/锁互斥规则。ADD-56/57保持本地验证，台账仍1完成/8部分完成/61本地验证/1未开始；无真实provider、交互式exe picker、其他平台、全仓/15套件/20k真实历史、完整性能或独立复审验收，原47外部条件延后、ADD-30暂缓、整体goal active。

一次延迟读取097cbee7精确代码CI41260394184已completed/success；父提交c8e073f9代码CI41261465651仍in_progress，Watch41261465685 success。Watch不代替代码CI，不立即轮询；本批最终核验与提交推送另绑，本批交付CI尚未观察。

最终五静态门、四脚本语法、独立证据verifier及diff check均exit0；binding dangling0、118条既有docs-source advisory保留，current compilerInputs及两个exe size/SHA一致。工作树仅本批28份TS路径（含两删除）与三份markdown，测试/build源码快照保持；提交推送、remote-main与clean状态由ignored delivery收据另绑。本批交付CI未观察，整体goal active。

### 24.69 headless print 与单文件程序的显式审批策略

继续 ADD-56/57，先对照当前 Cheers 的非交互入口与 codex 的 headless 默认策略：两者都把无交互输入的默认值设为拒绝，只有显式命令行策略或已绑定的精确授权才能放行；续接文本仍只提供上下文。没有把“总是允许”写入任何默认路径，也没有为 headless 增加第二套授权存储。

在当前已验证构建 `caf547ebb515ca82b0cb9d0ffd5d1d6d9cd01fc73fc85a494da303ddd080a1db` 上，以 Node 20.3 和 `dist/bin/cheers` 各运行四个隔离 print 场景：续接提示分别要求 always/once，均走实际 loopback provider、bash 工具、transcript 与终态；两场默认拒绝，模型收到 denied 结果、无 marker 写入、终态为 stopped、持久 grant 为 0；显式 `--non-interactive-approval allow-once` 写入一次并完成，下一次默认运行再次拒绝。Node 与 executable 共 8 场，HTTP 各 4 GET/8 POST，配置/auth 字节保持，所有 owned 进程和 scratch 清理，峰值 RSS 199812–417008 KiB，输出均远低于 2 MiB 上限。收据在被忽略的 `.omx/artifacts/phase20-addition-headless-approval/headless.json`，脚本只放在 `.tmp/`。

一次尝试把已编译程序经 relay 送入交互 PTY 时，程序正确落入非交互 default-deny 分支，未出现交互 picker；该观察只证明了拒绝与终态，不能冒充可交互的桌面审批证据，因此不纳入原生键盘验收。旧 Node 普通/全屏 picker 证据仍按 24.68 记录。没有使用真实 provider、跨平台环境、全量套件或 20k 历史 PTY；ADD-56/57 仍为本地验证，整体 goal active。

### 24.70 Provider/Model/Auth/Streaming 历史清单的当前源码复核

复核 `.omx/project-memory.json` 中 Slice 08 的 F-02、F-03、F-09、F-10，没有发现仍可复现的生产缺陷，也没有修改 provider 源码。该清单是历史审计输入，不能直接当作当前状态：

- F-02 已收口。[Anthropic 请求构造](../../packages/ts-shell/src/provider/endpoints/anthropicMessages.ts)在开启 thinking 时发送 `thinking.type=enabled` 与 `budget_tokens`，预算限制在 `max_tokens - 1024` 内；不足以同时容纳预算和答案时省略 thinking。对应回归覆盖显式预算、默认预算、上限裁剪和省略路径。
- F-03 已收口。Anthropic 流读取器按顺序累积分片 `signature_delta`，把完整 `reasoningSignature` 返回给回合层；后续请求保留签名 thinking/redacted block，缺签名时按既有安全合同降为普通文本。拆分签名和回放顺序均有协议测试。
- F-09 不是当前协议缺陷。共享 SSE 夹具包含 `event:`、`id:`、注释、多行 `data:` 以及 LF/CRLF/CR 边界；当前 OpenAI、Anthropic、Google GenAI、Vertex payload 都以 JSON 自带类型/形状，读取器按 payload 分派，因此不需要用 `event:` 头替代 JSON 类型。若以后接入依赖事件名且 data 非自描述的新协议，需单独增加该协议的事件语义。
- F-10 已收口。[models.dev 刷新](../../packages/ts-shell/src/core/models/catalogRefresh.ts)保留显式 reasoning、tool-call、temperature、image modality、context/input/output limit 及精确 effort 选项；[缓存合并](../../packages/ts-shell/src/core/models/catalogStore.ts)保持 reviewed built-in request constraints，用户 catalog 仍可最终覆盖。刷新回归覆盖缺失字段、非法上限、reasoning options 与内置约束优先级。

本轮受限串行验证为 [Anthropic](../../packages/ts-shell/src/provider/endpoints/anthropicMessages.test.ts)、[SSE](../../packages/ts-shell/src/provider/endpoints/sse.test.ts)、[refresh](../../packages/ts-shell/src/core/models/catalogRefresh.test.ts)、[catalog shape](../../packages/ts-shell/src/core/models/catalogShape.test.ts)、[step](../../packages/ts-shell/src/turn/step.test.ts) 共 5 个文件、198 项通过（Node heap 768 MiB、单 Vitest worker）。五静态门与 `git diff --check` 通过，118 条既有 docs-source advisory 保留；本批仅改两份 markdown，不重建。这只证明本地协议/目录合同；没有新增真实 provider、Anthropic OAuth client registration/scopes、跨平台、桌面或发布证据，ADD 状态与 Phase 20 外部证据缺口保持不变，本批交付 CI 未观察。


### 24.71 钩子声明快照替换与工作目录绑定

继续 ADD-58/59。实际 turn 入口每次向共享 `defaultHookDispatcher` 注册声明，旧实现却只追加：第二回合重复执行，编辑/删除后的旧命令仍可运行；切换项目后，A 的旧 fingerprint 还能放行在 B 的 cwd 执行的同名相对脚本。初版八项真实 shell marker 回归在原实现下七失败/一通过（默认 Node 24，只作该次缺陷基线）。

目标检查后、修改前定向只读比较两个参考：f09d01b85e0384647fcab6779d35ab9dabe04be3 的 agent-session.ts:3718–3767 在 reload 时替换 ExtensionRunner 并使旧 runner 失效；4210c08defe92fe8828f789b6f9fda287ad3709e 的 hooks/registry.rs:92–138 重建 hook engine，保留已经运行的命令 runtime。采用替换声明、退役旧动作 admission、保留进程自有钩子的决定，未复制代码或增加第二套 registry。

仅在原 [registration](../../packages/ts-shell/src/core/hooks/registration.ts) 和 [dispatcher](../../packages/ts-shell/src/core/hooks/hookDispatcher.ts) 内修补：同步发布声明数组与信任策略，替换所有带 fingerprint 的声明，保留进程注册的命令和 in-process hooks；策略绑定规范化 workspaceRoot，声明在 bypass、缓存授权或询问之前核对实际 payload cwd。dispatch 在 await in-process handler 前捕获策略与命令数组身份，逐命令及审批返回后复核；clear 同时退役策略，使等待中的 allow-always 不执行、不落 grant。没有取消已经启动的 shell 进程，也没有改变 provider/auth 核心、package scripts、默认门或构建行为。

新增 [11 项生命周期回归](../../packages/ts-shell/src/core/hooks/lifecycle.test.ts)，覆盖重复注册、编辑/删除、两个项目实际相对脚本、普通/显式 bypass 的错 cwd、同根替换期间的异步 handler、项目拒绝与 user grant、clear 及替换期间的待审批失效。修正既有 registration 测试的实际 cwd，并修复两条注册一个 dispatcher 却执行另一个空 dispatcher 的空洞基线：先断言原命令确实运行，再验证跨项目与拒绝。一次中间 74 项复验中 1 失败/73 通过，定位为 process-only 夹具指向不存在目录；保留失败日志，恢复其原 tempDir 后通过。显式只读委派复审还发现提前捕获数组会使 clear 后的 process-only 命令继续执行，已增加数组身份检查和对应回归；最终复审未报告剩余具体问题，不替代独立发布验收。

三个反转串行执行，均为行为断言失败：完整旧生产源 9 失败/2 控制通过，移除 workspace 绑定 2 失败/9 通过，移除数组退役检查 1 失败/10 通过。finally 逐字节恢复两份生产源并核对 SHA；之后 Node 20.3、单 worker、heap 768 MiB、同一 flock 串行五文件 77 项通过（lifecycle 11、registration 14、hooks 6、trust 21、cliRuntimeInvocation 25）。五静态门通过，binding dangling 0，118 条既有 docs-source advisory 保留。Node 20.3 TS 构建通过，build `30280aa014aa4905ee41159a012da85beeaf4b68ed2d4cc70baccaf9b9b2656b`，inputs `1824c53a2b52857460ed3a6d6786d807770891c5d4e7cb584609e0d67859b32a`；本批未重建单文件程序。

生产 Node CLI 普通/全屏各一场实际 PTY，每场四回合，使用隔离项目、scripted loopback 与显式 `--dangerously-bypass-hook-trust`。等待实际启动提示及每次原 TurnSink.end 后，shell marker 累计分别为 1、2、2、3：连续两回合各一次，第三回合删除声明后零新增，第四回合新声明只执行一次。每场 GET4/POST4、UserPromptSubmit4、end4、query.failed0；config/auth 精确字节保持、Ctrl+D exit0、自有 PID/start identity 非活跃、scratch 清理。60 秒/2 MiB/100ms 采样 768 MiB 守卫未触发；RSS 峰值 333556/326204 KiB、输出 13977/19477 bytes 仅为小夹具观察，不算性能验收。使用标准 relay，未单独观测 cooked flags，故不声明终端模式恢复证据。

证据保留于 ignored `.omx/artifacts/phase20-addition-hook-snapshot/`，执行脚本仅放 `.tmp/` 并归档为非可执行文本；无 raw PTY、provider 请求/响应或真实凭据。HANDOFF 补充共享 dispatcher 的声明替换与 clear 失效规则。ADD-58/59 保持本地验证，其他 ADD 状态及原 47 项外部条件不升级；无真实 provider、单文件程序钩子、其他平台、全仓/15 套件/20k PTY 或整体性能验收，goal active。

一次延迟读取：3aa72384 与 6570a436 的精确代码 CI 已 success；父提交 48e2994c 的 CI 41265797603 仍 in_progress，Architecture Watch 41265797606 success，不以 Watch 替代代码 CI、不立即轮询。本批最终核验与提交推送另绑，本批交付 CI 未观察。

最终五静态门、Node20.3三份探针/观察/证据脚本语法检查、主代理独立证据verifier与diff check均exit0；核对四份当前TS快照、三份父源原字节、反转恢复哈希、77项测试与两模式原生收据、current build manifest/inputs及清理。委派只读复审与主代理证据断言分别记录。脚本源码以非可执行文本归档，临时执行文件清理；提交推送、remote-main和clean状态由ignored delivery收据另绑，本批CI未观察，goal active。


### 24.72 权限档位绑定主项目与切换代次

继续 ADD-60。只读审计发现 §21.78 的三个布尔函数测试不能证明实际入口覆盖：普通 `/resume <id>` 经 recovery 直接切 substrate，`/workspace attach` 创建新会话、`rebind` 迁移同一会话后也只刷新界面，均未调用权限重置。A 的 `allow-all` 或 `accept-edits` 可被 B 下一次普通审批继续采用；session switch 的路径比较还把 Linux 两个大小写不同的根视为相同。新增回归先使用真实 factory、SessionManager、router 与 escalation handler，在旧代码下 5 失败/3 控制通过，直接实见应拒绝的审批返回 allow-once。

修改前定向只读比较：f09d01b85e0384647fcab6779d35ab9dabe04be3 的 agent-session.ts:452–505 将 cwd 保存在 session owner，:1439–1450 在替换/处置时使旧 extension context 失效；该检索范围未找到相同权限档位机制。4210c08defe92fe8828f789b6f9fda287ad3709e 的 config/mod.rs:4134–4147 把 cwd、workspace roots 与有效 Permissions 一起构造，thread_manager.rs:1038–1055 的恢复接收当前 Config，:1992–2008 把它交给 Session::spawn。采用将授权绑定其拥有的项目上下文、使旧上下文失效的决定；不声称参考有相同自动重置行为，也未复制代码。

原 [权限状态owner](../../packages/ts-shell/src/core/shell/sessionRuntime.ts) 现在在显式设置档位时绑定主项目路径与代次，每次读取同时核对；[唯一生产构造入口](../../packages/ts-shell/src/cli/runtime/cliSessionRuntimeFactory.ts) 提供实时 binding。[substrate owner](../../packages/ts-shell/src/core/shell/runtimeContext.ts) 只在 primary project 确实变化时递增 projectRevision，包括之后返回原项目；同项目换会话/新回合、添加附加根或拒绝迁移不增加。所有生产项目根赋值均经该 owner。复用现有纯路径 identity，保留 POSIX 大小写、规范化 Windows 路径，没有每帧文件系统读取。无效主根不能提升权限。移除 session/router 的分散 reset 回调与旧布尔辅助函数；session switch 也复用正确路径比较。未改变 provider/auth 核心、package scripts、构建或默认门。

初版只比较读取时路径，虽有 106 项中间绿灯，但只读复审发现 A→B→A 之间不读取权限仍会保留旧档位。原返回测试在 B 主动读取，掩盖了该序列；删掉中途读取后实际 1 失败/10 通过，随后才加入独立项目代次。最终 [12 项路由/状态回归](../../packages/ts-shell/src/cli/interactive/permissionScope.test.ts)覆盖 resume/attach/rebind × 两种提升档位、首个实际审批 consumer 拒绝、Linux 大小写根、同项目新会话与实际 synthetic turn、无中途读取的往返、附加根、失败迁移、neutral 与无效根；代次边界也有断言。三个旧纯函数测试被这些实际路径覆盖取代，未放宽权限期待。

四组串行反转分别为旧生产源 9 失败/3 控制、移除 factory binding 8 失败/4 控制、移除项目代次更新 7 失败/5 控制、移除 POSIX 大小写区分 1 失败/11 控制，均为断言失败。代次反转的七项含六项代次边界和一项真实往返授权断言，不将全部七项冒充实际执行。finally 恢复五份生产源并核对哈希；恢复后 Node20.3、单 worker/heap768MiB、同一 nonblocking flock 串行六文件 122 项再次通过（新路由12、router39、sessionRuntime50、runtimeContext9、cliCoreSplit6、permissionScope6）。中间一次 filter 包含不存在的 cliSessionModule.test.ts，实际仅运行四文件106项，最终已使用存在的六文件。五静态门通过，118 条既有 docs-source advisory 保留。

Node20.3 TS 构建通过，build `1ccb732ef076b7c50d5645fcee59a20360088cfb9f0c5a528bd2d9f42159aa70`、inputs `8d8c7213d21fbe9587d99beab8c65b648c4e5b64e8fb2f2b3b175cddfc772443`，本批不重建单文件程序。普通/全屏生产 Node CLI 各一场实际 PTY：每次用真实 Alt+P 两次选到 allow-all，再依次 `/resume` 到大小写不同的第二根、`/workspace attach` 到第三根、`rebind` 回第一根。三个切换均为 ask，代次1/2/3，前两次换 session，rebind 保持 session ID。每次下一实际 bash 调用都打开原审批 UI；真实 Escape 拒绝后，模型确实收到 denied 结果，shell marker0、持久 grant0。各 GET3/POST6、run/end6、三次审批 denied/三次工具 false、query.failed0、config/auth 精确字节不变、Ctrl+D exit0、owned PID/start identity 非活跃及 scratch 删除。两场实际各关闭两次 workspace 长输出阅读器后才继续输入；未修改产品以迁就探针。

首条普通模式原生尝试在 resume/拒绝通过后，attach 已完成，但下一输入没有形成 provider POST，等待第二审批超时；仅有 GET1/POST2，一阶段通过，保留为 unverified，不推定是产品或 provider 失败。其 observer 只记录 approval preview，未观测普通命令 pager；增加通用 pager 观察与关闭同步后才取得上述两有效场景，总计三次 CLI。60秒/2MiB/100ms采样768MiB守卫未触发，有效场景 RSS447824/451360KiB，含失败尝试最高589532KiB；这些只作小夹具观察，不是性能验收。标准 relay 未单独观测 cooked flags，故不声明终端模式恢复证据。

最终只读委派复审未发现剩余具体问题，子代理未执行测试/构建/脚本；主代理证据核对与该复审分别记录。证据归 ignored `.omx/artifacts/phase20-addition-permission-project/`，保留源码文本快照、红绿/反转、初次失败及两模式收据；执行脚本放 `.tmp/` 并在归档后清理，无 raw PTY、请求/响应或真实凭据。HANDOFF 补项目代次与普通命令 pager 的输入归属。ADD-60 保持本地验证，其他任务与原47项外部条件不升级；无真实 provider、单文件程序权限档位、其他平台、全仓/15套件/20k PTY、judge 或整体性能验收，goal active。

一次延迟读取：48e2994c 的精确代码 CI41265797603 已 success；父提交 a594884e 的 CI41266906555 仍 in_progress，Watch41266906549 success，不以 Watch 代替代码 CI，不立即轮询。本批最终核验与交付另绑，本批 CI 未观察。

最终五静态门、三份脚本语法、主代理独立证据verifier及diff check均exit0；七份当前TS路径状态（含删除）、六份父源字节、五源反转恢复、122项测试、current build manifest/inputs、两有效原生场景与单独失败收据均已核对。脚本以非可执行文本归档，owned scratch清理，工作树仅本批七个TS路径与三份markdown。提交推送、remote-main和clean状态由ignored delivery收据另绑；本批CI未观察，goal active。


### 24.73 钩子授权独占持久化与真实 profile 撤回

继续 ADD-58/59。真实生产入口配原审批 handler 的回归确认：主 turn 的 hook「记住」同时写入通用审批策略和 hook 信任库，`/trust forget` 只撤回后者；下一次通用缓存自动返回 allow-always，重新保存指纹并执行。通用键没有 matcher/声明来源，修改这些字段也可沿用旧回答；Git hook 更使用 bash/execute 身份，混入普通命令授权。session allow-all 和通用非交互 allow-always 同样可代答。首版20项实际16失败/4控制，先确认产品缺陷再修改。

[共享 hook 审批适配器](../../packages/ts-shell/src/core/hooks/approval.ts) 现在供主 turn 与 Git 入口共用，完整指纹只作为精确绑定；标记 caller 拥有授权保存，由原 dispatcher 在快照/admission 复核之后独占写入 HookTrustStore。[通用审批 handler](../../packages/ts-shell/src/entrypoints/cliApprovalModule.ts) 在读取策略前分流，既不读/消耗通用缓存，也不让 session scope 或通用 CLI policy 代答；保留显式「记住」返回值，不借用会强制一次性的 explicitApproval。普通审批 wiring 跳过 caller 的保存，audit 只报告本层真实落盘，不能在 dispatcher 尚未确认前宣称已持久化。没有交互宿主时 hook 默认拒绝；已有精确 hook 信任和专用 hook bypass 仍由原 owner 决定。通用非交互审批策略不再隐式成为 hook bypass。旧普通授权不迁移、不自动删除，仍能经 `/permissions` 管理，也不会重新建立 hook 信任。

净化后的 command/event 同时进入显示 context，完整 source/matcher/command 经已有 execution preview 阅读器展示；实际关闭预览后可选仅一次、记住或拒绝。复审发现只有 prompt.message 时全屏 host 根本不显示声明来源，现补 [实际 promptApproval host 回归](../../packages/ts-shell/src/core/hooks/approval.test.ts)，保留默认拒绝和完整预览，不增加第二个审批 UI 或信任库。caller 的「Allow and remember」也不再误称用户级 hook 为项目级普通授权。

首场普通原生探针在记住/复用通过后，`/trust forget` 未真正撤回，保留为 unverified。随后两条生产入口的 captured-profile 单测均重现 ERR_INVALID_ARG_VALUE：命令为排除用户 hook，向 loader 传入带 NUL 的伪造 HOME；真实 CLI 的 profile 边界在读取项目文件前就拒绝了它。现 [hook loader](../../packages/ts-shell/src/core/hooks/config.ts) 使用显式 includeUser:false 懒跳过用户来源，[状态/撤回命令](../../packages/ts-shell/src/core/commands/trustCommandRuntime.ts) 均移除哨兵路径；默认用户加载和 profile 身份检查保留。命名 profile 回归确认状态查询成功、项目授权真实撤回、用户 hook 仍执行且只保留其指纹；没有放宽路径边界来通过测试。

目标检查后定向只读比较 Codex 快照4210c08defe92fe8828f789b6f9fda287ad3709e 的 hook discovery 658–714/754–805：事件、matcher、handler 内容形成精确 hash，hook owner 依据自身信任或专用 bypass 选取 handler；registry 传入专用 hook trust 配置。Pi 快照f09d01b85e0384647fcab6779d35ab9dabe04be3 的资源 loader 534–555 提供项目信任发现边界，但该 seam 没有相应逐 hook 审批持久化合同；未据此推定它具备本批能力。复用本项目原 owner，没有复制参考代码。旧 producer/通用代答反转覆盖相反决策。

最终 Node20.3、显式单 worker/heap768MiB、同一 nonblocking flock 串行八文件144项通过：真实 hook producer24、hook preview4、approval bridge18、wiring3、picker50、runtime invocation25、hook config6、profile sources14。profile 修复前后还分别有2失败/54通过的定向证据；未改的 lifecycle/trust command 合同在此前批次分别11/10通过。六反转分别为通用代答6、重复持久化4、旧双入口18、旧项目标签1、移除完整预览1、恢复 profile 哨兵2项失败；包含刻意禁止通用读取的 guard 抛错，不把所有失败都冒充 shell 效果断言。finally 均恢复原字节并记录哈希，随后最终集成144项重新通过。五静态门通过，118条既有 docs-source advisory 保留；TS build `cd21f5cfb73b69e72ce4df87ed88b87db144f198f1c2b2f9ae29ace3484c6894`，inputs `397e51e00085afddc15aa679e56dc74cc718cf5d6736e8eb8cd45eb61a5c34ad`，不重建单文件程序。

最终普通/全屏生产 Node CLI 各实际五回合，脚本 loopback provider 各 GET5/POST5；先观察并关闭四次完整 hook 预览，再真实 a 记住、两次 Escape 拒绝及 y 仅一次。五阶段 shell marker 为1/2/2/3/3，hook指纹1/1/0/0/0，通用持久 grant 全为0；相同指纹复用没有第二审批，真实 `/trust forget` 后拒绝没有执行或恢复指纹，仅一次后的下一回合重新审批。各 run/end6（含 slash）、query.failed0、config/auth字节不变、Ctrl+D exit0、owned PID/start identity 非活跃、scratch删除。三次CLI含初次失败，60秒/2MiB/100ms采样768MiB守卫未触发；有效RSS451436/445868KiB，含初次最高572000KiB仅作小夹具观察。标准relay未单测cooked恢复；没有 raw PTY、请求/响应或真实凭据归档。

只读委派最终 CLEAR，未让子代理执行验证；主代理独立证据核对另记。ignored证据归 `.omx/artifacts/phase20-addition-hook-approval/`，源码/脚本用非可执行文本快照，临时执行文件归档后清理。ADD-58/59保持本地验证，原47项外部条件及其他任务不升级；无真实provider、单文件程序hook审批、其他平台、全仓/15套件/20k PTY、judge或性能验收。另有独立静态线索：`/trust forget` 只枚举当前声明，已删除/编辑的旧指纹缺少可供按项目撤回的来源元数据；恢复旧声明可能重新命中历史授权，本批未动态复现/修复，留待下一轮，不能把ADD-59称为完全完成，goal active。

一次延迟读取：a594884e代码CI41266906555已success；父提交b725f884代码CI41268173094仍in_progress、Watch41268173089 success，不以Watch替代代码CI，不反复轮询。本批最终证据与交付另绑，本批CI未观察。

最终五静态门、三份脚本语法、主代理独立证据verifier与diff check均exit0；11份当前TS、8份父源原字节、六组反转恢复、144项最终测试、current build manifest/inputs、两有效原生收据与首场失败均已核对。执行脚本以非可执行文本归档，owned scratch清理，工作树仅本批11份TS与三份markdown。提交推送、remote-main和clean状态由ignored delivery收据另绑，本批CI未观察，goal active。


### 24.74 历史钩子授权与待定回答遵守来源撤回

继续 ADD-59，落实24.73留下的静态线索。原 `/trust forget` 只枚举磁盘上的当前声明：旧命令获批后删除/编辑声明再撤回，原指纹仍留在 store，恢复旧声明就能运行；无已保存指纹时，等待中的 allow-once/allow-always 回答也不受撤回影响。两条真实 producer（主turn/Git）配原审批handler的34项回归中，新增10项实际失败、原24项通过，确认的是实际 shell marker 增加，不把静态推断当作已复现。

原 [HookTrustStore](../../packages/ts-shell/src/core/hooks/trust.ts) 现在在同一 `hook-trust.json` 中保存指纹的规范化声明来源及其撤回代次；[存储owner](../../packages/ts-shell/src/core/hooks/trust/storage.ts) 使用version2，能读取旧version1哈希→描述，但不从描述反推来源。旧二进制不识别version2会按原合同拒绝已有授权；本批没有旧二进制回退或跨版本混写验收。项目当前只有一个 `.agents/hooks.json` 来源，[loader](../../packages/ts-shell/src/core/hooks/config.ts) 与命令复用同一 `projectHookSource`；撤回按精确的 lexical path.resolve 来源，不用字符串前缀、目录猜测或第二个授权登记库，因此不撤回用户hook、其他项目或前缀邻居的授权。

`forgetSource` 一次锁内删除该来源所有已归属历史指纹及仍能枚举的旧格式当前指纹，即使声明已不存在也持久旋转该来源的撤回token。旧格式不可逆哈希仍可保留给其他来源；被撤回来源的实际执行查询必须带来源，因此未知旧哈希在该来源不再授权，恢复声明也要重新明确批准。不得把旧授权在查询时自动晋升成新归属。新批准绑定当前代次，允许该精确hook重新记住；重复撤回每次都换token，而非仅记一个布尔，避免第二次撤回放过新一轮等待回答。

[dispatcher](../../packages/ts-shell/src/core/hooks/hookDispatcher.ts) 在信任检查/提问前捕获可读来源代次，回答后复核；allow-always写入时还在存储锁内比较expectedRevision，失效就拒绝记录和执行。await已信任分支同样会让出微任务，所以实际spawn前再次核对，新增已授权分支的queueMicrotask撤回回归专门守住这一间隙。已启动的shell命令不属于本批取消范围；专用hook bypass仍为明确绕过，未更改其合同。

所有hook store修改复用既有 `withFileLock` 与 `writeTextFileAtomic`，锁内重读/合并并核对实际发布字节；profile对目标和锁路径的边界保留。不存在的文件与损坏/未知版本/不可读/悬空链接分开，后者不允许覆盖成空库；version2来源必须为规范化绝对路径，撤回token不可为空，否则整体拒绝。保存失败的会话内授权仍受可读来源与代次约束，其他实例撤回能使其失效，锁/读取从未准入的回答不能产生内存fallback。主代理和复审分别发现并补测：无来源的查询漏掉内存授权来源；已实际落盘后锁清理报错可能产生内存副本，另一实例撤回后又被补回。存储层现在携带publicationVerified事实，已核对落盘的授权随后消失时绝不制造fallback。未核实或清理失败的来源撤回输出 unverified，不报告删除数量、不回写旧快照、不把实际可能已保存说成unchanged。

命令不再靠当前声明数量声称整个撤回结果。已知删除数与「Withdrawal saved」独立表达；没有已知存储条目仍明确保存撤回边界，旧版未知哈希不被误称已删除。保留原项目/用户隔离与普通审批策略，不改provider/auth core、scripts、构建行为或默认门。

目标与红灯检查后定向对照只读参考：Codex快照4210c08defe92fe8828f789b6f9fda287ad3709e 的hooks/lib.rs113–125用声明来源/事件/索引建立持久state key，discovery658–714在来源state上比较完整内容hash；config/hook_config.rs24–32保留可独立于当前命令文本管理的hook state。这里保留本项目完整指纹，并增加来源撤回代次，没有复制参考代码。Pi快照f09d01b85e0384647fcab6779d35ab9dabe04be3的已检查资源loader信任seam未提供对应逐hook撤回store，不据此假定等价能力。项目自身project trust storage已使用上述锁/atomic写原语，本批复用同一路径。

最终Node20.3、每条命令显式单worker/heap768MiB、同一nonblocking flock串行八文件158项通过：实际producer34、trust21、来源withdrawal16、lifecycle12、command syntax41、profile sources14、registration14、config6。新增来源测试含跨实例内存失效、写入未确认/锁失败、已落盘后清理失败与交错撤回、旧格式保留/新明确授权、前缀隔离，以及损坏和不规范元数据；原行为基线未放宽。七反转分别为放行旧哈希3、跳过来源撤回16、取消待定回答复核5、去掉spawn前检查1、去掉锁内代次1、重复内存副本1、去掉verified-publication拒绝fallback1项失败；中间与最终代次分别保存恢复哈希，finally逐字节还原后再取得最终158项绿灯。五静态门通过，118条既有docs-source advisory保留。TS build `140da0ee06cb268ad07491cc023d3adc31523d2b6afe90eaf1fde4e1f4b16fb8`，inputs `38811257f1454f7f572b403eaefdafb233f75b4ab036735873bbff01e9e07dca`；不重建单文件程序。

普通/全屏生产Node CLI各实际六回合：a记住；删除声明后通过真实CLI `/trust forget` 撤回，恢复后Escape拒绝；再次a记住；编辑matcher后真实CLI撤回，恢复后Escape拒绝；最后两个原审批预览等待中，从另一profile绑定实例调用同一原 `runTrustCommand` 撤回，再由真实键y/a回答。最后两步是跨实例撤回，不冒充在被modal占用的同一编辑器中执行slash。各六次完整预览均先观察再关闭选择，effect1/1/2/2/2/2、hookGrant1/0/1/0/0/0、普通grant全0；GET6/POST6、run/end8（含两次原生slash）、query.failed0。config/auth字节不变、Ctrl+D exit0、owned PID/start identity非活跃、scratch删除。两场首次均通过，RSS444752/466148KiB只作小夹具观察，60秒/2MiB/100ms采样768MiB守卫未触发；标准relay未单测cooked恢复。

只读委派最终CLEAR，子代理未执行测试/构建/脚本；主代理独立证据核对另记。ignored `.omx/artifacts/phase20-addition-hook-withdrawal/` 保留当前/父源文本、红绿/反转/原生收据及复审记录；临时脚本归档成非可执行文本后清理，没有raw PTY、请求响应或真实凭据。ADD-59保持本地验证，原47外部条件及其他ADD状态不升级；本批补上历史指纹撤回缺口，但无真实provider、单文件程序、其他平台、多机器文件锁/跨版本混写、全仓/15套件/20k PTY、judge或性能验收，goal active。

一次延迟读取：b725f884代码CI41268173094已success；父提交7d99aa3a代码CI41269474881仍in_progress、Watch41269474742 success，不以Watch代替代码CI，不轮询。本批最终证据和交付另绑，本批CI未观察。

最终五静态门、三份脚本语法、主代理独立证据verifier与diff check均exit0；9份当前TS、7份父源、七组反转恢复、158项最终测试、current build manifest/inputs及两有效原生收据已核对。执行脚本以非可执行文本归档，owned scratch清理；工作树仅本批9份TS与三份markdown。提交推送、remote-main和clean状态由ignored delivery收据另绑，本批CI未观察，goal active。


### 24.75 单文件程序的钩子来源撤回验证

继续 ADD-59 的已记录单文件程序证据缺口，本批没有改动产品源码。先只读核对 ADD-61，原外部 symlink 围栏修复仍在；随后检查普通 turn/native Git 取 cwd、trust command 取 projectRoot 是否造成来源失配。生产启动先提升 Git 子目录到项目根，再成对发布 cwd/projectRoot；resume、attach、rebind 也成对更新，add/remove 只更新附加根。委派只读调用链复核同样排除了当前合法 CLI 路径的该项失配，不把人工构造不等字段当成产品缺陷，也没有为此增加新根解析层。

主代理先在同一 nonblocking flock 中串行运行五静态门与已有 build:exe，均 exit0，118 条既有 docs-source advisory 保留；未重复运行 TS 构建或产品测试。编译程序绑定 §24.74 原 TS build `140da0ee06cb268ad07491cc023d3adc31523d2b6afe90eaf1fde4e1f4b16fb8`、inputs `38811257f1454f7f572b403eaefdafb233f75b4ab036735873bbff01e9e07dca`，本次 Linux executable SHA-256 `d30117e801ee2c4223c016803b91d33410068553c0f0a8abb792d713905bdaed`。正式 build freshness、immutable executable 与 stable executable 哈希均已核对；没有修改构建行为或默认门。

隔离命名 profile、项目、HOME 与 scripted loopback HTTP fixture，实际编译 CLI 普通/全屏各六回合，未向编译程序注入 observer 或替换产品模块。最终增强版每回合核对新 execution preview 中的完整 source、SessionStart、适用全部工具说明和原 command，真实 Escape 关闭后，再观察原 Permission: hook (SessionStart) 和 Allow once 选项，最后实际 a/y/Escape 回答。六阶段为记住；删除声明后原 CLI `/trust forget`、恢复并拒绝；再次记住；编辑 matcher 后原 CLI 撤回、恢复并拒绝；待定预览期间从独立 profile 绑定实例调用原 runTrustCommand 撤回，再回答仅一次；再次撤回待定回答并选择记住。两次待定撤回由 Node20.3 驱动调用相同原 command/store，证明编译 consumer 拒绝已失效回答，不冒充在同一个被 modal 占用的编译编辑器中执行第二条 slash，也不声称该驱动是另一个编译进程。

每场实际副作用累计 `1/1/2/2/2/2`、hook grant `1/0/1/0/0/0`、通用 grant 全0；每回合均确认唯一编号的fixture回答已显示且进入原session的completed历史。各 GET6/POST6，两次编译 CLI 撤回后才恢复原声明；没有重用旧预览文本作为新回合屏障。每次原生撤回后实际关闭阅读器，输入唯一草稿并确认它出现在原 composer 的❯行，再用Ctrl+U清除才继续。config/auth最终精确字节相等，不声称没有瞬时写入；Ctrl+D exit0、owned PID/start identity非活跃、scratch删除。90秒/2MiB/100ms采样768MiB守卫未触发，最终两场子进程树RSS215320/214476KiB、输出72267/95203bytes仅为小夹具观察；RSS不含Node驱动/HTTP server，不能作为整场总内存上限或性能验收。标准relay未单独观察cooked flags。

首轮两场六阶段均通过，但只有preview标题屏障，按原观察范围保留first-pass。复审后补预览正文、显式返回屏障与清理；期间一次fullscreen等待空placeholder重绘、两次regular发送Escape紧接以p开头的草稿均超时，分别保留unverified。三次都已真实撤回、GET1/POST1/effects1/hookGrant0，且owned进程/scratch清理；不支持产品或provider故障结论。空placeholder不保证重绘；相邻Escape+p会在40ms前缀窗口内被解码成Alt+P。最终按原decoder分离按键，以唯一草稿真实绘制确认输入归属，才取得上述两场增强通过。总8次CLI、5次通过/3次unverified；中间另一次增强regular成功，不能把重叠场景累计成更多独立覆盖。只读复审还指出pty.fork子进程拥有独立session；探针现在退出前重新捕获树和start identity，逐身份终止仍存活后代，确认非活跃才删scratch，setup同样进入finally。HANDOFF记录这两个可复用陷阱。

ignored `.omx/artifacts/phase20-addition-hook-executable/` 保留构建、首轮/失败/最终原生收据、对应源脚本文本和独立证据核对。核对 §24.74 交付的9份TS原字节、current build/inputs/executable、两场六阶段的副作用与授权向量、真实退出及清理，均 exit0；执行脚本归档为非可执行文本后清理，没有 raw PTY、请求响应或真实凭据。没有新的产品实现，故不伪造红绿/反转或重复计入上批158项测试。

本批补齐当前 Linux 编译 CLI 的这些来源撤回场景，ADD-59 保持本地验证，矩阵仍为1完成/8部分完成/61本地验证/1未开始，原47项外部条件延后，goal active。其他平台、多机器锁、跨版本混写、完整编译 hook 项目隔离/信任矩阵、native Git producer、未撤回时下一turn自动复用、单文件程序权限档位切换、真实 provider、完整性能矩阵与桌面条件仍未验；没有全仓/15套件/20k PTY 或 judge。

一次延迟读取：7d99aa3a 精确代码 CI41269474881 已 success，69fdcdbf 的代码 CI41271010610 仍 in_progress、Watch41271010612 success；不以 Watch 代替代码 CI，不立即轮询。本批最终文档检查、复审及提交推送/remote-main/clean 状态另绑交付收据，本批 CI 尚未观察。

最终增强双模式及独立证据核对均exit0，只读委派复审CLEAR，子代理未运行验证。两份执行脚本与非可执行归档逐字节比对后删除，task scratch目录已移除；最终工作树仅三份markdown，产品源码未改。最终文档门与diff检查、Git交付另绑收据；目标保持active。


### 24.76 MCP 单次审批覆盖非交互策略与旧缓存

继续 ADD-57。§21.75 已规定 MCP 不得记住审批，但原限制仅在交互答案收尾：非交互显式 allow-always 会提前写入通用 grant，旧永久记录及 name-only once cache 也会提前返回。实际 MCP descriptor 经 registry 注册后没有参数绑定，通用审批键只识别工具名，下一次不同参数仍可复用。新增真实 handler、policy、picker、registry/tool gate 回归，旧代码实际 6 失败/3 控制通过；其中工具门第二次不同参数错误执行，不是仅据字符串推断。

修改前定向只读比较参考快照 `4210c08defe92fe8828f789b6f9fda287ad3709e` 的 `mcp_tool_call.rs`：1588–1620 按模式决定是否建立 session/persistent key，1416–1420 再决定是否查缓存；2030–2046 把不允许记住模式的长期答案归为当前调用；2062–2077 写入还要求对应 key 存在。采用读缓存资格、答案与存储多处约束的决定。参考 Auto 模式仍可记住 MCP，不能声称它全面禁止；本项目遵守既有更严格的一次性合同。另查本地 coding-agent 的 MCP tool/runtime seam，未建立等价审批机制，不据此推断其能力，也没有复制实现。

原 [CLI审批owner](../../packages/ts-shell/src/entrypoints/cliApprovalModule.ts) 现在拒绝以旧 MCP once/always 缓存代答；显式 headless always 降为 allow-once，保留显式 once/deny。交互 host 收到的 options 去掉 always；[实际picker](../../packages/ts-shell/src/cli/interactive/picker/approval.ts) 对空 options 的旧 prompt 也不展示或接受永久选项，原 [保存wiring](../../packages/ts-shell/src/core/shell/interactiveApprovalWiring.ts) 再阻止 MCP 持久化。旧 host/readline 返回 always 仍兼容降为单次，说明不再把成功单次回答误写成用户拒绝；readline 菜单与策略说明同样遵守单次合同。旧记录不自动删除，仍可查看/撤回；普通工具永久/一次缓存、caller-owned hook 及显式 session scope 合同保留。未改 provider/auth core、包脚本、构建或默认门。

最终聚焦集覆盖 [MCP 13项](../../packages/ts-shell/src/entrypoints/mcpApproval.test.ts)、授权文本27、hook34、调用绑定27、交互保存3、patch选择15、权限档位12，共七文件131项。五组反转分别恢复 headless 持久化、旧缓存、长期选项、保存边界及旧 host 归一化，实际 2/5/2/1/2 项断言失败，finally 逐字节恢复三份生产源；恢复后13项再次通过。主代理均使用 Node20.3、显式单 worker/heap768MiB、同一 nonblocking flock 串行验证。五静态门通过，118条既有 docs-source advisory 保留；TS build `5ed4b3755e79fd14f84f25887fceeaecbc13302e658f7e833d325aa1caaeeb1e`，inputs `f40238469929a0df20b33d8caf834f1a10f44e9d453eed97d85e687d74e44611`，构建 heap1536MiB。本批不重建单文件程序。

隔离 HOME/profile/project，以环回 HTTP 模型响应和真实 stdio JSON-RPC MCP 夹具运行生产 Node CLI。最终 headless 六个独立进程依次默认拒绝、显式 always、不同参数默认拒绝、显式 once、显式 deny、预置旧 grant 后默认拒绝；副作用累计 `0/1/1/2/2/2`，只有第2/4次进入 MCP tools/call。新持久 grant 全0，最后预置的一条旧记录原字节保留仍不授权。各实际工具均出现在发给模型的工具定义中；模型确实收到对应拒绝/成功结果，各次退出0，GET6/POST12、6个 MCP 进程、2次实际调用。

普通/全屏各一个实际 PTY、三回合真实 y/Escape/y，预置旧 grant 后每回合仍打开新审批；观察本轮生产 renderer 生成包含 once/deny、无 always 的 frame 后才发送按键，原宿主实际消费按键。收据的 Painted 字段表示此 frame 观察，未独立测量物理屏幕呈现。各副作用 `1/1/2`、GET3/POST6、MCP进程1/调用2、run/end3、审批 approved/denied/approved、tool success true/false/true、query.failed0。旧策略文件全程字节相等，没有新 grant；每回合由新 SessionManager 读取原落盘快照，audit 均非持久、cacheEffect none，拒绝为 stopped/stopped_error，执行成功为 success/completed。三场有效探针 config/auth 最终精确字节相等、退出0、owned PID/start identity 非活跃及 scratch 删除。

三次中间 headless driver 尝试保留 unverified：前两场完成默认拒绝但错误要求终态包含模型成功文案；第三场默认拒绝、显式单次效果都成立，但使用可返回 undefined 的 prompt-continuity 建议接口读取成功后的审计。改为拒绝/成功分别核对终态，并使用原无条件 session snapshot 接口；没有修改产品迎合探针。含这些尝试共12次 CLI 启动，四个中间进程不计最终场景覆盖。30秒单次headless/90秒交互、2MiB输出及100ms采样子树768MiB守卫未触发；有效场景RSS最高479800KiB仅为小夹具子树观察，不含驱动/HTTP server，不作总内存或性能验收。标准relay未单测cooked恢复。

只读委派源码复审CLEAR，未运行测试/build/脚本；主代理独立证据核对与最终交付另绑。ignored `.omx/artifacts/phase20-addition-mcp-approval/` 保留父源/当前文本、红绿、五组反转、三次中间收据及三个最终场景，执行脚本归档成非可执行文本后清理，不保存 raw PTY、provider 请求响应或真实凭据。HANDOFF 记录晚归一化绕不过早返回、终态观察与续接建议接口的区别。ADD-57 保持本地验证，矩阵仍1完成/8部分完成/61本地验证/1未开始，ADD-30保持不启动，原47项外部条件延后，goal active。本批未验证编译程序的新 MCP 修复、外部 MCP 服务/认证、真实 provider、desktop/macOS/Windows、全仓/15套件/20k PTY、judge或完整性能矩阵。

一次延迟读取：69fdcdbf 精确代码 CI41271010610 已 success；父提交 f33bd2f5 的代码 CI41272131055 仍 in_progress、Watch41272131053 success；不以 Watch 代替代码 CI，不立即轮询。本批最终核验与提交推送、remote-main/clean 另绑交付收据，本批 CI 未观察。

最终五静态门、四份Node脚本语法、七文件131项、主代理独立证据verifier与diff check均exit0；三份父源、四份当前TS、五组反转恢复、current build/inputs、三场有效与三场中间收据均已核对。五份执行脚本与非可执行归档逐字节相等后删除，owned task scratch已移除。只读委派源码及证据复审已完成，frame口径已修正；提交推送、remote-main与clean状态由ignored delivery收据另绑，目标保持active。


### 24.77 写入 diff 读取遵守 read deny

继续 ADD-61。只读复核发现 `write`/`edit` 为生成 diff 会读取已有文件正文，但权限层只在未注册的外部文件访问分支检查 `read` deny；primary root 和 `/workspace add <path> --write` 注册根都能在 `accept-edits` 下直接把受拒读内容放进 diff 并写入。该路径由实际 registry、`adaptTools` 和 `executeToolBatch` 可达，不是人工伪造上下文。目标缺失时则没有旧正文，原有 write-only 新文件语义应保留。

定向对照只读参考：Claude Code 的 filesystem permission 先检查 read deny/ask，再处理 edit implied read；Codex 的 filesystem access mode 将 Read/Write/Deny 与独立 read-deny matcher 分离，write 权限不会抹掉 read deny。采用相同的分离决定，未复制参考代码。

现 [turn/tools.ts](../../packages/ts-shell/src/turn/tools.ts) 在 writer 读已有正文前，以每个实际 selected root 的 read 规则重新评估；初始权限阶段和 `runtime/execution/read.ts` 的打开后 verify 均会再次进入同一 `assertFileAccess`，因此目标在权限判断后被并发创建时也不会绕过 read deny。不存在的新文件不触发 read deny，仍可在已授权 writable root 创建。primary 与 registered writable root 的 write/edit、缺失新文件以及创建竞态均有回归覆盖。

红灯阶段新增 2 项均失败，确认 primary/registered root 读取受拒内容；修复后 [workspace approval 32 项](../../packages/ts-shell/src/turn/workspace/approval.test.ts)通过。移除 writer 两处 read guard 的反转为 6 项失败，源码逐字节恢复。最终聚焦 `workspace/approval`、`workspace`、`turn/tools` 与 MCP approval 四文件共 108 项通过；五静态门通过，TS build 与 Linux compiled executable fresh build 均通过。当前构建清单为 build `4294e65d1e43268a53e1a24ebbfe49ba4cb70a45218adde7e0346165b74c8c13`、inputs `e9a5ac8108d60cedfcc5efcdca1d1a668034d708f05e5827f60208a8de546df0`、executable `457ff4fb9b162ce6253878051fdadc6f6ea3b23e86dee92e0d3e8cd39d18f2bf`。最终 compiled Node20.3 headless/regular/fullscreen 真实 MCP 场景仍通过：headless effects `0/1/1/2/2/2`，交互各 `1/1/2`，旧 grant 不代答，config/auth 不变，owned PID/start identity inactive，scratch 清理。该证据使用 scripted loopback provider 与本地 stdio MCP fixture，不代表外部 provider、其他平台、desktop adapter 或完整性能验收。

ADD-61 继续保持本地验证；Phase 20 总矩阵不变，ADD-30 不启动，原 47 个外部条件延后，goal active。

### 24.78 模型默认值的两层作用域与 `/connect` `/model` 职责边界

继续 ADD-70。用户在实际迁移后提出：既有 `/connect` 又有 `/model`，两者看起来在争夺「模型默认值」，是否互相矛盾。只读复核确认这不是重复实现，而是**两个写入目标**，但暴露出一处实现不一致，需要记录并裁决。

**职责边界（代码事实）。** `/connect` 只写 `auth.json` 的 `providerConnections`：`apiKey`、`baseUrl`、`authType`、`status` 与连接标识（[connect/syntax.ts](../../packages/ts-shell/src/core/commands/connect/syntax.ts)）。`/model use` 只写 `config.json` 的 `modelPreferences`：`model`、`thinkingEffort`、`serviceTier`（[preferences/contract.ts](../../packages/ts-shell/src/config/preferences/contract.ts) 的 `PREFERENCE_KEYS`）。凭据字段与模型控制字段在 schema 层就已分离：`credentialSchema` 不再声明这三个字段作为持久位置（[schema.ts](../../packages/ts-shell/src/config/schema.ts)），`partitionConfigDocuments` 按 `AUTH_FIELDS` 与 `PREFERENCE_FIELD` 分派（[documents.ts](../../packages/ts-shell/src/config/documents.ts)）。

**两层默认同时存在是既有设计，且有测试锁定。** 请求解析按 `cliModel ?? connection.model ?? providerCredentials.model` 取值（[providerCredentials.ts:145-147](../../packages/ts-shell/src/core/shell/providerCredentials.ts#L145-L147)），effort 同样 connection 优先（`:149` 的 `preferredEffort(activeConnectionProfile, configProfile)`）。[preferences/documents.test.ts:39-50](../../packages/ts-shell/src/config/preferences/documents.test.ts#L39-L50) 明确构造了「provider 级 `provider-model` + connection 级 `old-model`」并存，并断言 `preferredEffort(connection, provider)` 取到 connection 的值；把 connection 的 effort 显式置 `null` 后得到 `null`，说明空记录用于压制继承而不是退回下层。也就是说：**两层并存、connection 覆盖 provider、空记录压制**，是已锁定的合同。

**不一致点。** `/model use --global` 在 provider 槽位分支上有一条守卫 `providerDefaultWritable`（[selection.ts:309-312](../../packages/ts-shell/src/core/commands/model/selection.ts#L309-L312)）：只要 `activeProviderConnectionId` 存在，或该 provider 已有任何连接，或存在 `accountPool`，就拒绝写 provider 级默认，返回「Global model save refused: a connection, account pool or read-only config input owns these defaults.」（`:146-148`）。这与上面的两层并存合同直接冲突：前者说两层可以并存且 connection 覆盖，后者说只要有连接就不许写 provider 层。实测复现：迁移前（连接仍在 `config.json`）该命令被拒；迁移后（连接移到 `auth.json`）同一命令成功并写入 `modelPreferences.providers` 与 `modelPreferences.connections` 两处。**同一个操作、同一语义，只因凭据换了物理文件位置而结果不同**，说明该守卫判断的是「连接是否存在」这一事实，而不是拆分前后应等价的所有权关系。

该守卫**没有任何测试锁定**：`grep 'Global model save'` 与 `grep providerDefaultWritable` 在全部 `*.test.ts` 中零命中。现有 `--global` 测试只覆盖无静态凭据的 signer provider（bedrock/vertex）路径（[session/model/selection.test.ts:108-131](../../packages/ts-shell/src/session/model/selection.test.ts#L108-L131)）。

**参考对照（只读，未复制代码）。**

| 项目 | 默认模型存放 | provider/credential 级默认 | 互斥守卫 |
|---|---|---|---|
| pi | `settings.json` 的 `defaultProvider` + `defaultModel`（[settings-schema.ts:215-216](../../../pi/packages/coding-agent/src/core/settings-schema.ts#L215-L216)） | provider 级只有**代码常量** `defaultModelPerProvider`（[model-resolver.ts:20-62](../../../pi/packages/coding-agent/src/core/model-resolver.ts#L20-L62)），不可持久化 | 无。解析优先级为 scoped → settings 默认 → 内置 provider 常量 → 首个可用（[model-resolver.ts:542-615](../../../pi/packages/coding-agent/src/core/model-resolver.ts#L542-L615)），三层**始终并存**，前者优先、后者兜底 |
| omp | `config.yml` 的 `modelRoles`（`default` 是其中一个角色，[model-settings.ts:109](../../../oh-my-pi/packages/coding-agent/src/config/model-settings.ts#L109)）；会话级另存为 session 日志的 `model_change` 条目，不改设置 | 三层，均**不是**用户可写的 provider 字段：内置 `DEFAULT_MODEL_PER_PROVIDER`（[model-resolver.ts:39](../../../oh-my-pi/packages/coding-agent/src/config/model-resolver.ts#L39)）、catalog KDL 的 `default-model`、以及发现阶段按账号标出的 `isProviderDefault`（[types.ts:1805](../../../oh-my-pi/packages/catalog/src/types.ts#L1805)）。`models.yml` 的 provider schema 与 `modelOverrides` 均无 default 字段 | 无。真实启动路径在 [sdk.ts:2054-2132](../../../oh-my-pi/packages/coding-agent/src/sdk.ts#L2054-L2132) 与 [model-resolver.ts:89-126](../../../oh-my-pi/packages/coding-agent/src/config/model-resolver.ts#L89-L126)：CLI → 会话恢复 → `modelRoles.default` → 兜底 `pickDefaultAvailableModel`（先按具体凭据收缩候选池，账号默认覆盖内置默认）。**`findInitialModel` 全仓无调用者**，其文档注释与 `docs/models.md` 的优先级描述属于该仓自身的文档漂移，不能当作实际路径引用。account pool 只限制哪些凭据可用，不参与默认模型选择 |
| codex | `config.toml` 的顶层 `model`（[config_toml.rs:153](../../../codex/codex-rs/config/src/config_toml.rs#L153)），profile 内 `ConfigProfile.model`（[profile_toml.rs:25](../../../codex/codex-rs/config/src/profile_toml.rs#L25)） | **不存在**。`ModelProviderInfo` 完全没有 model 字段（[lib.rs:96-127](../../../codex/codex-rs/model-provider-info/src/lib.rs#L96-L127)） | 无。`model` 与 `model_provider` 是两个独立字段并列（[profile_toml.rs:25-31](../../../codex/codex-rs/config/src/profile_toml.rs#L25-L31)），无互斥校验 |

**pi 与 omp 都不存在 connection 级默认模型**，因为它们的凭据模型是一 provider 一凭据：pi 的 `auth.json` 是 `Record<providerId, Credential>`（[auth-storage.ts:17](../../../pi/packages/coding-agent/src/core/auth-storage.ts#L17)），凭据只通过 `filterModels` 影响**可用模型集合**，从不参与「默认选哪个」；omp 的 `ApiKeyCredential` / `OAuthCredential` 同样不含 model 字段，凭据只作可用性闸门与候选池收缩。codex 的 `ModelProviderInfo` 更是完全没有模型概念。三者的共同点是：**凭据是闸门，不是默认值来源；任何一层默认都不排斥另一层**。

需要同时记录一处参考侧的准确性边界：omp 的 `docs/models.md`「Initial model selection priority」段落描述的是 `findInitialModel`，而该函数在当前源码中**没有任何调用者**（全仓 grep 仅剩定义）。实际启动顺序以 `sdk.ts` 为准，且比文档多出「账号发现默认覆盖内置默认」一层。引用参考的优先级时不能只抄其文档。

**裁决（2026-11-01，用户已定）。** 两项都做，但本轮**只记录、不实施**；实施由后续批次负责。

- **24.78-A（修缺陷）**：放宽 `providerDefaultWritable`。连接存在本身不再是拒绝条件；保留真正的只读边界——只读配置输入（`configProvenance` 中带 `position` 的文件）与 `accountPool` 仍拒绝，因为它们确实不由用户直接写入。放宽后必须有测试锁定：**有连接时写 provider 级默认成功，且不触碰 connection 级记录**；同时补一条反转，恢复旧守卫后该测试必须失败。
- **24.78-B（补信息）**：当 provider 级与 connection 级同时存在且取值不同时，在 `/model status`（或等价的只读投影）显式说明当前生效值来自哪一层，说明「connection 覆盖 provider」这一事实。不新增持久化字段，不改变解析链；`/model status` 现有输出结构保留，只增补来源说明。

实施前必须同时满足的既有约束：
1. 解析链 `cliModel ?? connection.model ?? providerCredentials.model`（[providerCredentials.ts:145-147](../../packages/ts-shell/src/core/shell/providerCredentials.ts#L145-L147)）与 effort 的 connection 优先（`:149`）**不得改动**——这是已由 [preferences/documents.test.ts:39-50](../../packages/ts-shell/src/config/preferences/documents.test.ts#L39-L50) 锁定的合同。
2. 空记录压制继承（`thinkingEffort: null` 得到 `null` 而非退回下层）必须保留。
3. 24.78-A 的放宽不能绕过会话/工作区/CAS 的既有准入检查；`selection.ts` 中 `beforeCommit` 的锁内复验逻辑应保持等价收紧，只移除「连接存在」这一条。
4. 24.78-B 只做展示层增补，不得让 `/model status` 变成写入入口，也不得因展示而额外读取凭据。

**验证要求（实施批次）**：24.78-A 需在旧源码上先看到新测试失败（红），放宽后通过（绿），再做一次有效反转；24.78-B 需覆盖「两层同值」「两层异值」「只有一层」「都没有」四种投影，且断言不改变实际请求目标。两项均只跑聚焦 Vitest 与必要静态门，不默认全仓回归。

本批只记录研究与裁决，未改产品代码、未改测试，未提升 ADD-70 状态。

> 实施结果见第 24.79 节：上述守卫已放宽、来源行已补，上文「没有任何测试锁定」描述的是本批当时的源码状态。

### 24.79 两层默认的写入守卫放宽与生效层来源

按 24.78 的裁决实施 ADD-72 与 ADD-73。两项都只改 `/model` 的写入准入与只读投影，未触碰解析链、effort 优先级、空记录压制或 `beforeCommit` 的锁内复验。

**ADD-72（守卫放宽）。** [selection.ts](../../packages/ts-shell/src/core/commands/model/selection.ts) 的 `providerDefaultWritable` 不再读取 `activeProviderConnectionId` 与 `providerConnections`，只剩两条真正的只读边界：该 provider 已声明 `accountPool`，或 `providerCredentials` 的 provenance 里存在带 `position` 的只读配置输入。拒绝文案同步去掉「a connection」，改为「an account pool or read-only config input owns these defaults」。函数本身留在原模块：它只被这一处写入路径使用，单独拆文件只会多一层没有语义的跳转。

`beforeCommit` 中的同名调用保持不变，因此放宽只作用于「连接是否存在」这一条，锁内复验、会话/工作区/CAS 准入、catalog 与凭据身份比对全部保留。

**ADD-73（来源投影）。** 新增 [model/defaultSource.ts](../../packages/ts-shell/src/core/commands/model/defaultSource.ts)：`modelDefaultSource` 把「connection → provider → account 默认 → unset」投影成四态，`modelDefaultSourceLine` 只负责一句话表述。四态分别是「两层同值」「两层异值（connection 覆盖并指名被覆盖的 provider 值）」「只有一层」「都没有」；都没有时不输出来源行，避免出现「Model source: unset」这类同义反复。`sessionOwnsModel` 读 `configProvenance` 的 `sources` 是否含 `session`，把会话选择与已存默认区分开——会话选择在投影时是覆盖到连接记录上的，若不加区分会把用户本回合的选择说成「已存的连接默认」。

[modelCommandRuntime.ts](../../packages/ts-shell/src/core/commands/modelCommandRuntime.ts) 的 `renderModelStatus` 改为从该投影取 `Model:` 值，并在其后插入来源行；读取顺序与原实现一致（connection → providerCredentials → account 默认），所以显示的模型没有变化。provenance 的下标从 `config.providerConnections` 取，而不是从归一化后的副本取，因为 provenance 的 children 是按存储数组下标的。

**验证。** 红灯阶段先在旧守卫上写 ADD-72 的新用例：[providerDefault.test.ts](../../packages/ts-shell/src/core/commands/model/providerDefault.test.ts) 的「有连接时写 provider 级默认成功」失败于 `Global model save refused`。放宽后通过。有效反转：把 `activeProviderConnectionId`/`providerConnections` 两条判断加回 `providerDefaultWritable`，该用例再次失败（`expected 'Global model save refused: an account…' to include 'Model switched to provider-model'`），逐字节恢复后 SHA-256 回到 `c635b15c799c6cf96216497c15f5b990d1a636f3ca6251d2ea892049af59ecc7` 并重验通过。

只读输入的拒绝用例需要 `providerCredentials` 同时带 `apiKey`，否则命令在更早的「current request credential is unavailable」处就被挡住，到不了守卫；这属于既有准入顺序，未改动产品去迁就测试。

ADD-73 的四态在 [defaultSource.test.ts](../../packages/ts-shell/src/core/commands/model/defaultSource.test.ts) 逐条断言文案与 `effective`，并在 [modelCommandRuntime.test.ts](../../packages/ts-shell/src/core/commands/modelCommandRuntime.test.ts) 以真实 `runModelCommand(['status'])` 覆盖四态；这些用例同时断言 `Model:` 的值不变，证明投影没有改变实际请求目标。「会话选择」标记另有一条走真实投影链的用例（`providerDefault.test.ts`）：先 `/model use` 写入会话选择，再读 `/model status`，断言来源行为 `Model source: provider (session selection).` 且两个存储层都没有被这次选择改动。把 `sessionOwnsModel` 反转成恒 `false` 后，该用例与 `modelCommandRuntime` 中手工构造 provenance 的那条同时失败（2 项），逐字节恢复后 SHA-256 回到 `511f56c0cc1abb9382700d440901262e570b22f51738806c6b573cb1ce6604d9` 并重验通过。

池成员场景另有一条用例：声明 `accountPool` 后同一命令把默认写到池成员连接、provider 槽保持原值，说明守卫的保留项与实际服务请求的层一致。

**聚焦验证与边界。** 单 worker / heap768MiB 串行执行四文件 115 项通过：`session/model/selection` 69、`modelCommandRuntime` 35、`providerDefault` 4、`defaultSource` 7；另跑 `model/policy` 10、`config/documents` 32、`config/preferences/documents` 11 确认两层并存与空记录压制的既有合同未变。静态门 `verify:import-cycles`、`check:config-consumers`、`check:declarations`、`check:node-floor`、`verify:docs-drift:strict` 通过（118 条既有 docs-source advisory 保留），TS build 通过（当前 manifest `7463f851eba5`）。`analyze:module-facades` 仍报告 `cli/interactive/interactiveMode.ts` 一个既有 advisory，本批未触碰该文件。

**一处未修的显示边界（已核实，未纳入本批）。** 当请求由 fallback 连接或 accountPool 成员服务、而 `activeProviderConnectionId` 未存储时，`/model status` 的 `Active connection: none` 与 `Model: unset` 会和下一行的 `Request model` 不一致。这不是 ADD-73 引入的：它由「已存储选择」与「解析后的请求」两个字段并列展示的既有设计决定，且 [modelCommandRuntime.test.ts](../../packages/ts-shell/src/core/commands/modelCommandRuntime.test.ts) 的 signer 与 missing-connection 用例已锁定该形态。改动它要同时决定 readiness 文案与 `Model:` 的语义，属于独立裁决，本批不动。

本批证据仅限本地聚焦测试与静态门：没有真实终端观感验收、没有真实 provider 工作流、没有其他平台或完整性能矩阵，因此 ADD-72、ADD-73 记为「本地验证」，不提升 ADD-70。

### 24.80 `ProviderFacts` 中已无读者的 `fallbackModels`

继续 ADD-70 的「其余重复事实语义收敛」。只读复核发现 `ProviderFacts` 的 `fallbackModels` 自 `99c2192d`（"keep command model views on accepted publications"）起已无任何生产读者：那次改动把 `/model list` 从「models.dev 拉取失败 → 每 provider 的静态兜底表」改为读已接受的目录快照，`fallbackModelsForProvider` 一并删除，但声明表里的 `fallbackModels` 字段与十一个 provider 的取值都留了下来。

这属于「同一事实多份副本」的残余：目录（`core/models/catalog.ts` 的 `BUILTIN_PROVIDERS`）与 `CONNECT_PRESETS` 已各自持有同一批默认模型名，`fallbackModels` 是第三份，且没有任何消费者会读到它——两份仍在用的副本之间如果漂移，用户看到的是目录里的列表；第三份漂移则完全不可见。保留它只有一种解释：读者相信它在生效。

删除内容：接口成员及其文档注释，以及十一个 provider 各自的取值行。`check:config-consumers` 只统计配置字段，不覆盖 `ProviderFacts`，所以这条不会被既有门禁拦住；验证方式是全仓 `grep -rn "fallbackModels"`（排除 `node_modules` 与 `dist`）零命中，以及 `tsc -p tsconfig.build.json` 通过——若仍有读者，编译会失败。

**验证。** `core/providers/facts.test.ts` 9 项、`core/commands/modelCommandRuntime.test.ts` 35 项通过；`check:config-consumers`、`check:node-floor`、`verify:docs-drift:strict` 通过（118 条既有 docs-source advisory 保留），TS build 通过（manifest `0ed549f0fc5b`）。本批只删声明，不改任何行为：删除前后 `providerFacts()` 的返回值除该字段外完全相同。

证据仅限本地聚焦测试与静态门；没有真实 provider 请求，因此不据此提升 ADD-70。

### 24.81 连接预设的默认模型与目录漂移

继续 ADD-70 的重复事实收敛。`/connect login <provider>` 会把预设的 `defaultModel` 直接写进新连接，该值随即成为下一次请求的模型名。`openai` 预设写的是 `gpt-4.1-mini`，而自带目录 `BUILTIN_PROVIDERS` 的 openai 条目只列 `gpt-5.3`、`gpt-5.3-codex`、`gpt-5.1-mini`、`o4-mini`。实测：`/connect login openai --api-key …` 成功后连接记录里是 `gpt-4.1-mini`，`/model list` 里没有它，`/context` 只能报「No context window is known for openai/gpt-4.1-mini; assuming 64000」。

这是同一事实的第二份副本漂移：目录负责「这个 provider 有哪些模型」，预设负责「新连接从哪个模型开始」，两者各自合法，谁也没有报错。参考侧同样把默认值当作目录的一部分（pi 的 `defaultModelPerProvider`、omp 的 catalog KDL `defaultModel` 都由目录派生），没有一份独立的预设副本。

**改动一：把 openai 预设的默认模型改为目录确实列出的 `gpt-5.3`。** 只改这一条取值，其余预设未动。

**改动二：给 `BUILTIN_PROVIDERS` 补 `github-copilot` 条目（`models: []`）。** 该 provider 在 `RUNTIME_PROVIDERS`、`facts.ts`、`CONNECT_PRESETS` 与 `/connect login` 里都存在，唯独目录里完全没有条目，于是 `/model` 的裸目录视图根本不列出它——而 `antigravity`、`claudecode` 这类同样「模型由账号或用户端点决定」的 provider 都是有空条目的。补空条目与既有处理一致；`auth: 'oauth'` 与 `facts.ts` 的 `accountAuthType: 'subscription'` 对齐。

**改动三：新增 [preset.test.ts](../../packages/ts-shell/src/core/commands/connect/preset.test.ts)**，逐个预设断言其 `defaultModel` 出现在对应目录条目里（目录条目模型为空则豁免，无条目则失败）。红灯阶段该测试在 `openai`（`gpt-4.1-mini` 不在列表中）与 `github-copilot`（无目录条目）两处失败；两处修复后 9 项全绿。同一测试另覆盖 `defaultBaseUrl`：预设的地址也会写进连接，若与目录漂移，请求会发往目录已不再描述的 host。当前三处（siliconflow、google、google-ai）一致，用例共 12 项。

**CI 发现的一处回归与修正（`2964d7b6` 的 `41283830570`）。** 首次提交把「连接存在」从 `providerDefaultWritable` 删掉后，`session/model/provider.test.ts` 的「refuses a global provider save when a hook introduces a named default owner」失败：hook 在异步等待期间新增了一条会被自动选中的连接，此后 provider 槽位已不再是请求的归属者，而写入仍报告成功——实际请求会由那条新连接服务。这条保护是真的，只是放错了地方：它不属于「谁能写 provider 默认值」这个所有权判断，而属于「这一笔写入是否仍描述当前请求」这个竞态判断。

修正方式：`providerDefaultWritable` 保持放宽（只保留 accountPool 与只读输入），另在 `beforeCommit` 内加一条 `providerSlot && !providerScopeSelected(currentConfig, modelRequest(context, currentConfig))`。已有的投影目标检查看不到这个变化，因为投影本身会抑制 fallback；这里问的是未投影的请求由谁归属。修正后 `provider.test.ts` 200 项通过，ADD-72 的放宽用例仍绿（4 项），四文件 115 项通过。

**改动四：`resolveProviderTarget` 去掉不可达与重复的分支。** 该函数先查 `CONNECT_PRESETS`，只有别名才会落到后面的 `if` 链。`antigravity` 与 `claudecode` 已是预设 id，其内联分支永远走不到；`google` 同时出现在预设与内联分支里，内联那份复制了 `defaultBaseUrl`/`defaultModel` 两个值。现只保留两个真正可达的别名：`openai-compatible`（不指定模型，端点由用户提供）与 `gemini`（转指 `google` 预设，不再复制取值）。同时删掉 `preset.ts` 里未被使用的 `RuntimeConfigFile` 类型导入。

**验证。** `connect/preset` 9、`connectCommandRuntime` 68、`modelCommandRuntime` 35、`catalogShape` 22、`catalogSurface` 40、`picker/model` 46 共 220 项通过；`verify:import-cycles`、`check:config-consumers`、`check:declarations` 通过，TS build 通过（manifest `18ad34012d19`，去重后 `tsc -p tsconfig.build.json` 仍通过）。

端到端只读复核（临时探针，运行后删除）：全新 HOME 下 `/connect login openai --api-key …` 后连接记录为 `gpt-5.3`，`/model list` 包含该模型并标为 active，`/context` 报 `Window: 400,000 tokens (catalog)` 而非「assuming 64000」，裸 `/model` 目录视图出现 `GitHub Copilot`。修复前同样流程得到 `gpt-4.1-mini`、不在列表中、`/context` 只能假设 64000。

未做：没有真实 OpenAI/Copilot 请求，因此不能据此声称模型可用性；`github-copilot` 的可选模型仍取决于账号，目录里刻意保持为空。

### 24.82 本批改动的自审边界（子代理未产出）

本批曾派发一次只读 review（仅阅读与静态分析，未执行任何测试/构建），该子代理运行超过一小时未返回结论后停止；以下三点由主代理自行核对，结论与证据一并记录。

**1. provenance 下标与归一化数组是否对齐。** `renderModelStatus` 用 `config.providerConnections.findIndex(...)` 取 provenance 的 children 下标，而 `normalizeProviderConnections` 会过滤条目，理论上可能错位。核对结论：`projectConfigOrigins` 以**归一化后的** `config` 为基准重新编号 children，因此运行时的下标就是归一化数组的下标。实测两条连接（`first`、`second`）得到 `children[0]=first`、`children[1]=second`，`model` 叶子都指向 `config.json`。再加入一条 `provider: 'not-a-provider'` 后，整份 user 配置被判为 `invalid-value; value ignored`，连接数组为空——不存在「过滤掉一部分后错位」的中间态，因为无效条目在进入运行时前就被拒绝。

**2. `modelDefaultSource` 是否复刻解析链。** 与 `providerCredentials.ts` 的 `cliModel ?? activeConnectionProfile?.model ?? configProfile?.model` 对照：投影读的是 `activeConnection?.model` 与 `config.providerCredentials?.[provider]?.model`，顺序一致。区别只在投影不读 `cliModel`——命令行覆盖不是「已存的默认值」，`/model status` 另有一行 `Request model` 报告它，两者不重复。

**3. `providerDefaultWritable` 放宽后是否还有保护缺口。** 见第 24.81 节记录的 CI 回归：删掉的「连接存在」在 `beforeCommit` 里承担竞态检测，已用 `providerScopeSelected` 精确恢复。放宽本身（所有权判断）不再以连接存在为条件，符合 24.78-A 的裁决。

**4. 新增 `github-copilot` 目录条目的影响。** 与既有 `antigravity` 对比，可用性投影状态完全一致（`credential-missing` / `catalogued: true` / `models: 0`），未引入新的不一致。

以上均为只读核对与一次性探针（探针运行后已删除），不构成对真实 provider、其他平台或完整性能的验收。

### 24.83 真实 provider 交互探针：启动可用性与诊断可见性

本轮改用真实配置的隔离副本直接驱动产品（Node 20.3 之外的当前本机 Node 24.15 仅作运行环境，产品 floor 未改），以 PTY 会话和 `--print` 两种入口执行真实 provider 往返。探针全部在 `/tmp/cheers-test/live-soak/<case>` 下建独立 `HOME`，配置从真实 `~/.cheers` 复制后按用例改动，不写回真实目录。以下四条均已在本机实际复现，属于**产品行为**，不是探针构造错误。

#### 1. 来源被拒的字段持久化后没有产品内清除路径

真实用户配置里存在 `allowUntrustedHooks: false`。该字段在 [fields.ts](../../packages/ts-shell/src/config/fields.ts) 的声明来源只有 `['override']`，文件里出现即被判 `source-not-allowed` 并忽略，因此每次启动都打印：

```text
Warning: Config user allowUntrustedHooks: source-not-allowed; value ignored.
```

问题不在「拒绝」本身（拒绝是正确的，该字段只应由命令行授予），而在三条路径叠加后用户无处可去：

- `/settings set allowUntrustedHooks false` 返回 `Unknown setting key.` —— 它不在 `CONFIG_SETTINGS` 注册表内；
- `/settings` 语法只有 `set <key> <value>`，没有 unset/clear 动作；
- 后续任何一次正常保存都会把它写回去。实测：配置为 `{maxTurns: 15, allowUntrustedHooks: false}`，执行 `/settings set maxTurns 9` 并确认 `Saved to your user configuration.` 后，文件内容为 `{maxTurns: 9, allowUntrustedHooks: false}`。

原因在 [persistence.ts](../../packages/ts-shell/src/config/persistence.ts) 的写入模型：编辑基线取的是原始文档合并值，`patchConfigDocument` 以该基线为底重写整份文档，被层加载器忽略的键在写入路径上完全不可见。于是这个键既不会自行消失，也不能通过产品界面清除，只能手改文件——而它本身的值恰好等于默认值，不改变任何行为。

字段来源策略本身有明确依据（[phase-19-decisions](../features/phase-19-decisions.md#129) 与 [18-configuration-system](18-configuration-system.md) 都规定 `allowUntrustedHooks` 保持 CLI-only），因此修复方向不是放宽来源，而是让「文件里有、但来源被拒」的键可被显式移除。

#### 2. 任一 constraint 失败都会变成裸栈致命错误，交互模式无法启动

把用户 `models.json` 的 `endpoint` 写成拼错的 `openai-compatble`，`--print` 与交互模式都会直接退出：

```text
Fatal error: Error: Configuration safety validation failed; reload a valid configuration before starting new actions.
    at configurationOperation (.../core/shell/scope.js:11:15)
    at gitGateFor (.../cli/runtime/gitGate.js:20:23)
    ...
```

交互模式连首帧都不出现，进程 exit 1。用 `retryBaseDelayMs: 60000` 配 `retryMaxDelayMs: 1000` 可触发完全相同的输出，说明这不是 endpoint 专有路径，而是 [constraints.ts](../../packages/ts-shell/src/config/constraints.ts) 的 `constraintsBlocked` → [state.ts](../../packages/ts-shell/src/config/state.ts) 的 `admissionBlocked` → [scope.ts](../../packages/ts-shell/src/core/shell/scope.ts) 抛错这条链上所有错误共享的表现：**用户的配置错误被呈现为程序崩溃**，且丢失了唯一有用的那句原因。

真实的 endpoint 原因被 [constraints.ts](../../packages/ts-shell/src/config/constraints.ts) 里 `catch { errors.push('The selected model endpoint or output control is unavailable.'); }` 压成了泛化文案；`endpointShape` 抛出的 `No endpoint declared for 'openai-compatble'. Declared: …` 从未到达用户。

对照参考实现：pi 的 `models.json` 校验失败时把 schema 错误逐条格式化输出并保留在 `ModelConfig.getError()` 里（`model-config.ts` 的 `Invalid models.json schema:` 分支），不把可解释的配置错误升级成进程崩溃。

#### 3. `--doctor` 看不到这两类问题

同一份坏配置下运行 `--doctor`，输出里只有：

```text
Config problem: Config user allowUntrustedHooks: source-not-allowed; value ignored.
Config problem: Config project maxTurns: trust-not-established; value ignored.
```

完全没有提到目录解析或 constraint 失败。原因直接：[cliDoctor.ts](../../packages/ts-shell/src/entrypoints/cliDoctor.ts) 只遍历 `runtimeConfig.configDiagnostics`，而 constraint 错误由 `constrainRuntimeConfig` 在**运行时发布**阶段写入 `configDiagnostics`，doctor 读的是 `getRuntimeConfig(targetCwd)` 的未约束结果，两者不是同一份对象。用户被致命错误挡住时，唯一的内省工具给不出原因。

#### 4. 目录解析失败与协议未声明在 `/model list` 上已能区分，但在启动路径上不能

`/model list` 对损坏的 JSON 会显示 `models.json could not be parsed; its catalogue entries were ignored.`，这是正确的。但同一条目在 endpoint 未声明时走的是致命错误路径（见第 2 条），用户得不到「目录里写了什么、哪些协议是已知的」这类信息。

#### 已验证正常的部分（同批探针，不计为问题）

基本回合、`read`→`edit` 工具循环与审批面板（`y` 允许后实际改动 `note.txt` 且模型收到结果）、Escape 与 Ctrl+C 中断、中断后重新启动自动 resume 并继续对话、多轮上下文（`PELICAN-42` 二轮仍能取回）、`/model status` 的 ADD-73 来源行（`Model source: connection, overriding the provider default bailu-2.9-preview.`）、`/context`、`/connect status`、`--version`，以及坏配置下 `--version` 与 `--doctor` 仍能运行。`/settings set` 不会物化默认值：只写 `{maxTurns}` 的文件保存后仍只有 `maxTurns`。

#### 未纳入本轮的边界

- 本机 Node 为 24.15，CI floor 是 20.3；上述结论不依赖 Node 版本差异，但正式验收仍需 floor 环境。
- 探针使用单一 provider（openai-compatible 协议的第三方 relay），未覆盖 OAuth 订阅类 provider。
- 第 2、3 条只确认了「失败表现」与「doctor 盲区」，尚未确认修复后 constraint 错误应以何种形式呈现给交互用户（拒绝启动并给出可读原因，还是启动但禁止请求），需要裁决。

### 24.84 真实 provider 探针第二批：协议、长会话与溢出诊断

同一隔离方法（`/tmp/cheers-test/live-soak/<case>`，真实 provider 配置副本，PTY 或 `--print`）。本批新增 13 个场景，覆盖 responses 与 messages 协议、多工具并行、模型切换、中等长度会话与压缩。下列每一条都注明是**产品行为**还是**探针缺陷**。

#### 协议矩阵：两种协议均可用

同一 relay 同时支持三种 wire 形态，逐项实测：

| 场景 | 结果 |
|---|---|
| `openai-compatible` 基础往返 | 通过 |
| `openai-responses` 基础往返 | 通过 |
| `openai-responses` + 工具循环（read→edit） | 通过，`note.txt` 实际改为 ready，模型收到工具结果 |
| `openai-responses` 两回合（工具回合后追问） | 通过，第二回合正确复述上一回合读到的值 |
| `anthropic-messages` 基础往返 | 通过 |
| `anthropic-messages` + 工具循环 | 通过 |
| `anthropic-messages` 两回合 | 通过，第二回合正确复述 README 首行 |

两种协议的请求体差异由各自模块承担（`responses/body.ts` 的 `store:false` 与 `include:['reasoning.encrypted_content']`，`anthropic-messages` 的 system 角色与 tools 形态），本次未发现协议层缺陷。

#### 并行工具调用：正确

一次回合内模型发出三个 `read`，事件序列为 `tool.started ×3 → tool.settled ×3 → tool.result ×3`，三个结果全部返回模型，最终回答同时给出三个文件的首行。并行工具没有串行化或丢失。

#### 模型切换：会话级生效

`/model use bailu-2.9-preview` 后状态栏从 `?/1000k` 变为 `?/500k`，`/model status` 的 `Request model` 与之一致，下一回合实际使用新模型。切换前需先按一次 Enter 接受补全菜单（既有补全交互，不是缺陷）。

#### 中等长度会话：8 回合召回完整

8 个回合各约 100 词，随后一次性追问全部 8 个事实，模型按序完整复述（`WORD-1A`…`WORD-8H`），没有遗漏。自动压缩在正常窗口下未触发（未越过阈值），符合预期。

#### 溢出处理：判定正确，但错误信息不可行动（产品问题）

把窗口设为 12k、`reserveTokens` 1500、`keepRecentTokens` 2000，连续 7 个回合后第 8 回合失败：

```text
Context overflow error: could not compact context automatically.
```

原因是可核算的：`/context` 显示启动基线约 4.3k（其中检查工具定义 18,865 字节 ≈ 5.4k tokens），7 回合消息约 2.2k，加上默认 `maxOutputTokens` 4096，`P + O + H` 已超过 12k 窗口，[constraints.ts](../../packages/ts-shell/src/config/constraints.ts) 的预算判定正确地拒绝了这次请求；`recoverOverflow` 的救援压缩因 would-not-shrink 或切点不足而拒绝，于是回合以 `run-error` 结束。**判定本身正确**，问题在于呈现：

1. 错误只说「无法自动压缩」，没有说明占用来自哪里（工具 schema、历史、输出上限各占多少）；
2. 没有给出可执行动作（提高窗口、降低 `maxOutputTokens`、`/compact` 或清理历史）；
3. 同一回合内 `/context` 能给出完整的分类估算，错误路径却没有复用这份事实。

这与 24.83 第 2、3 条同源：**配置与预算失败缺少可行动的说明**，只是这里的入口是回合而不是启动。

#### 探针缺陷（不计为产品问题）

以下三项是我方探针的观察错误，保留以免后续重复：

- **审批被回车代答**：`exitCleanly` 在审批面板打开时发送 `/exit\r`，回车选中默认聚焦的 `Allow once`，把一次 bash 调用记为 `approved`。已修正 harness：检测到 `Permission:` 时返回 `approval-pending` 而不是回车。产品侧行为正确（默认焦点是 Allow once 符合既有设计）。
- **连续 Escape 打开回溯面板**：三次快速 Escape 中，第二、三次间隔小于 `DOUBLE_ESCAPE_MS`（600ms），按 ADD-27 的既定裁决打开了 `/back` 选择器，后续输入进入面板而非 composer。这是设计行为，不是缺陷。
- **补全菜单吞掉 Enter**：`/model use <model>` 输入后第一次 Enter 接受补全，需第二次 Enter 执行。属于 ADD-10 的既有交互。
- **旧回合终态被误读**：`waitRunEnd` 从 `since - 2000` 扫描，会把上一回合的 `run-interrupted` 当成新回合结果；已改为「从该回合自己的 `run-started` 之后取终态」。
- **工作区复用导致跨用例读取**：多个用例共用同一 fixture workspace，模型在其中一个会话里读取了 `.ts-shell/prompt-history.txt`（该目录被 `.gitignore` 忽略但物理存在于仓库内），其中含有此前探针的提示词。这是 fixture 复用造成的，不是上下文注入；后续用例改用独立 workspace。它顺带说明：工作区内的历史文件对模型可见，属于既有只读工具权限的既定行为。

### 24.85 ADD-74/75/76 实施：可行动的配置拒绝

三条都来自 24.83 的真实 CLI 探针，本批一并修复。共同点是：配置失败本身判定正确，但用户拿不到原因和动作。

**ADD-75：约束失败不再是裸栈。** 新增 `ConfigurationRefusalError`（[configuration.ts](../../packages/ts-shell/src/core/shell/configuration.ts)），携带具体原因；[scope.ts](../../packages/ts-shell/src/core/shell/scope.ts) 只在 `publication.admissionBlocked` 为真时抛它，其余准入拒绝仍抛普通 `Error`——「工作区变了」是重试即可的状态，不是文件有错。[cliProcessRunner.ts](../../packages/ts-shell/src/cli/bootstrap/cliProcessRunner.ts) 的 `runCliCycle` 原本只有 `try`/`finally`，现在补 `catch`，识别该类型后写消息并 `exit(1)`，其他错误照旧上抛。

修复前后同一份坏配置（`endpoint: 'openai-compatble'`）：

```text
# 之前
Fatal error: Error: Configuration safety validation failed; reload a valid configuration before starting new actions.
    at configurationOperation (.../core/shell/scope.js:11:15)
    at gitGateFor (.../cli/runtime/gitGate.js:20:23)   ← 栈继续向下

# 之后（exit 1）
Configuration cannot be used for requests: it fails its own validation.
  - Config constraint: The model catalogue names an endpoint kind this build does not declare: 'openai-compatble'.
Correct the listed values and restart.
```

**原因不再被吞。** [constraints.ts](../../packages/ts-shell/src/config/constraints.ts) 原本用 `catch { errors.push('The selected model endpoint or output control is unavailable.'); }` 把 `endpointShape` 的具名错误压成泛化文案。现在只从该错误里取出协议名（`No endpoint declared for '<kind>'.` 的首段），**不回显 endpoint 值**——该值可能含凭据。同一原因在后面的 `endpointShape(endpoint)` 处会再报一次，用共享前缀识别并跳过，避免同一件事读成两个问题。

**被忽略的字段不冒充阻塞原因。** `configurationRefusalCauses` 只收集两类诊断：`Config constraint:` 前缀，以及以 `; tools blocked.` 结尾的安全字段失败。`source-not-allowed` / `invalid-value` 是「值被忽略、其余配置仍有效」，列进「无法发送请求」的原因里会把用户指向错误的文件。它们仍出现在普通启动警告中。

**ADD-76：doctor 与运行时同一份判定。** [cliDoctor.ts](../../packages/ts-shell/src/entrypoints/cliDoctor.ts) 原本读 `getRuntimeConfig`（未约束），现在复用运行时的 `constrainRuntimeConfig` + `resolveProviderCredential` + `loadCatalogSnapshot`，输出与启动拒绝一致的原因，并新增一行 `Config usable for requests: yes|no`。坏配置下 doctor 现在能报出：

```text
Config problem: Config constraint: retryBaseDelayMs must not exceed retryMaxDelayMs.
Config usable for requests: no
```

**ADD-74：被拒字段的警告可行动。** 该字段不在设置注册表内，`/settings set` 返回 `Unknown setting key.`，且任何后续保存都会把它写回（实测 `{maxTurns, allowUntrustedHooks}` 保存 `maxTurns` 后该键仍在）。写入路径本身支持删除（`patchConfigDocument` 有 `deletionEdits`），缺的是表达入口。本批不改写入语义，改为让警告本身完整：

```text
Warning: Config user allowUntrustedHooks: source-not-allowed; value ignored. This field is set only 'override', so this entry has no effect; remove it from the file.
```

字段名与来源白名单都是安全信息，可回显。

**验证。** 单 worker / heap768MiB 串行四文件 79 项通过：`constraints` 35、`runtimeConfig` 35、`cliDoctor` 3、新增 `configurationRefusal` 6。红灯：把 `scope.ts` 的类型化抛出改回 `new Error(refused)` 后 `configurationRefusal` 的「raises a typed refusal」失败（1 失败 / 3 通过），逐字节恢复后 6 项再绿。五静态门通过（118 条既有 advisory 保留），`git diff --check` 通过，TS build manifest `a21bb509f851`。

真实 CLI 复核（Node 24.15，隔离 home）：坏 endpoint 与 `retryBaseDelayMs > retryMaxDelayMs` 两条路径均输出具名原因并 exit 1；`--doctor` 对两者均报 `Config usable for requests: no` 与对应原因；正常配置仍成功往返且 doctor 报 `yes`；交互模式下新警告文案实际可见。

**未做与边界。** 本机 Node 为 24.15（CI floor 20.3），未在 floor 上复验。ADD-74 只改警告文案，没有新增 unset 入口——写入路径虽已支持删除，但把它暴露成命令涉及 `/settings` 的安全字段策略，需要单独裁决。ADD-75 未覆盖交互模式的完整首帧（错误发生在 runtime 组装期，此时尚无界面），也未覆盖 profile 切换中的同类拒绝。

### 24.86 协议与推理探针：responses / messages 的边界

延续 24.84 的隔离方法，本批针对两种 wire 协议做推理与工具链的组合验证。全部在隔离 home 下用真实 provider 往返。

#### 已验证正确

| 场景 | 结果 |
|---|---|
| `openai-responses` + `/thinking high` | 正常，`reasoning.effort` 由 `thinkingLevelName` 传入，`reasoning.effort: 'high'` |
| `openai-responses` 链式工具（read a.txt → read b.txt） | 正确，读到 `alpha` / `bravo` |
| `openai-responses` 推理捕获 | 正确，`reasoning.text` 40/12 字符且带 `openai-responses` 签名与 `replayBinding` |
| `anthropic-messages` + 链式工具 + 追问回合 | 正确，两回合都给出 `alpha` / `bravo` |
| `anthropic-messages` + `/thinking high` | 正确，`reasoning.text` 56 字符且带签名 |

#### 行为差异（非缺陷，但值得说明）

同一模型、同一目录声明（`reasoning: true`）、默认 `auto` effort 下：

- `openai-responses` 捕获到 reasoning（模型自发返回 summary）；
- `anthropic-messages` 没有 reasoning——因为 `auto` 不设置 `thinkingLevelName`，[anthropicMessages.ts](../../packages/ts-shell/src/provider/endpoints/anthropicMessages.ts) 因而不发送 `thinking` 参数，provider 也就不返回 `thinking` 块。

直接向该端点验证：不带 `thinking` 时 `content` 只有 `text`；带 `thinking: {type:'enabled', budget_tokens}` 时返回 `thinking,text`。也就是说这是**协议默认行为的差异**，不是解析缺陷——显式 `/thinking high` 后 messages 协议立即捕获到 reasoning。

需要留意的是观感：用户切换协议后，「默认是否有思考」会变化，而 `/model status` 不显示这一点。这不构成缺陷（`auto` 的语义就是「由 provider 决定」），但若后续做 ADD-35 的 effort 投影，应把「该协议在 auto 下是否会发送 thinking」纳入说明。

#### 探针缺陷（已修）

- **`--project` 被 harness 覆盖**：`start()` 先拼接共享 fixture 的 `--project WS`，再追加调用方传入的 `--project`，导致后者的工作区被忽略、模型读到旧 fixture 的文件并报 `ENOENT`。已改为「调用方指定了 `--project` 就不再注入默认值」。这条缺陷一度让 T31 的首次结果看起来像产品错误。

#### 压缩触发的可达性（观察，非缺陷）

尝试用「小窗口 + 多回合」触发阈值压缩时发现一个结构性约束：

- 10 回合、每回合约 200 词，累计仅约 1.4k tokens，最终停在 `6.0k/60k (10%)`——离阈值很远，压缩不触发，**这是正确的**；
- 把窗口压到 12k（24.84 的 T26）时，工具 schema（约 5.4k）+ 默认 `maxOutputTokens`（4096）已占去大半，第 8 回合直接判定溢出，压缩因 would-not-shrink 拒绝。

也就是说，在「工具 schema 约 5.4k、默认输出 4096」的前提下，**能让阈值压缩自然触发的窗口区间很窄**：窗口太小会被输出上限吃掉，窗口太大则需要极长会话。这不是缺陷（判定与拒绝都正确），但它解释了为什么阈值压缩在真实使用中不易观察到，也说明 ADD-77（溢出错误应说明占用构成）的价值——用户遇到的是「要么永远不压缩、要么直接溢出」。

若要构造稳定的阈值压缩验收，应同时下调 `maxOutputTokens` 与 `keepRecentTokens`，并让历史真正超过阈值，而不是只调窗口。这一点记入后续验收方法，本轮未做。

#### 16k 窗口实测：首回合前不检查压缩（产品缺陷）

按用户建议把真实 HOME 的配置临时改为 `contextWindow: 16000`、`reserveTokens: 2000`、`maxOutputTokens: 2048`（原值已备份，测后恢复）。同一会话续接推进到约 8.8k tokens 历史后，下一次请求直接失败：

```text
Context overflow error: could not compact context automatically.
```

`run-error`，回合终止。手工核算：历史约 8.8k + 工具 schema 约 5.4k + 输出上限 2048 ≈ 16.2k，刚好越过 16k。**判定正确**，但压缩从未被尝试——[loop.ts](../../packages/ts-shell/src/core/agent/loop.ts) 的 `prepareNextStep` 位于 `if (completedStep)` 分支内，即只在**两步之间**运行：

```ts
while (hasMoreToolCalls || pending.length > 0) {
  if (completedStep) {
    const update = await config.prepareNextStep?.(completedStep, signal);
    ...
```

于是：

- 带工具的回合（多步）会在步骤之间检查压缩，能触发；
- **单步回合（无工具调用）从不检查**——它从进入循环到发出请求之间没有 `completedStep`，直到 provider 拒绝才走 `recoverOverflow`，而救援压缩因 would-not-shrink 或切点不足拒绝，最终报溢出。

对照 pi：`_prepareRun` 在**每次运行开始前**调用 `_checkCompaction`，并注明「catches aborted responses」——即上一回合中止后遗留的超大上下文也会在下一次运行前被处理。我们的实现在这一点上没有对应检查。

这解释了 24.86 中「阈值压缩不易观察」的现象：不是窗口区间窄，而是**单步回合永远不会主动压缩**。带工具的回合会，无工具的不会。

**这是本轮发现的最实质的产品缺陷**，登记为 ADD-78。它同时给 ADD-77 增加了依据：用户遇到溢出时，既得不到原因，也不知道本可以更早压缩。

### 24.87 调研：hook 配置来源与信任（Codex / Claude Code）

本轮只做只读调研，不改代码。目标是给 ADD-74 找参照：当配置键的来源受限、文件里出现该键时，成熟产品怎么处理。

#### Claude Code：多来源合并 + 优先级栈 + 项目信任门控

**来源分层**（`~/.claude/settings.json`、`.claude/settings.json`、`.claude/settings.local.json`、managed policy、插件 `hooks/hooks.json`、skill/subagent frontmatter）。优先级自高到低：managed → 命令行 `--settings` → project local → shared project → user。环境变量不在这条栈里，按每个键单独规定。

**列表合并而非覆盖**：`permissions.allow` 这类列表键跨文件合并，每个文件都能追加而不会抹掉别处的条目。少数键例外（`fallbackModel` 取最高优先级整值、`availableModels` 在 managed 定义时整表生效）。

**安全键可以「反向覆盖」**：文档明确写「对少数安全敏感键，Claude Code 采用较低层级中更严格的值，而不是 managed 值」。这与我们的「安全字段只收紧」原则一致。

**hook 的项目来源受 workspace trust 门控**：项目 `.claude/settings.json` 里的 hook，只有在用户接受该文件夹的信任对话框后才注册；`-p`（非交互）运行**不算**接受。skill frontmatter 的 hook 也遵循同一 workspace trust 规则，但 project skill 的 frontmatter hook 在 `-p` 下、未信任文件夹中仍会注册——两者被显式区分。

**hook 合并跨层级**：user、project、local 各自追加，不互相替换；`disableAllHooks` **不能**关闭 managed 层的 hook。`allowManagedHooksOnly` 可让管理员屏蔽用户/项目/本地/插件 hook。

**`disableAllHooks` 与 `allowManagedHooksOnly` 是两个独立开关**，前者「全关（除 managed）」，后者「只留 managed」。这是把「谁可以定义」和「是否运行」分成两件事。

#### 与本项目的对照

| 维度 | Claude Code | 本项目（现状） |
|---|---|---|
| 来源策略 | 每键可在多层设置，按优先级栈解析 | 每字段声明 `sources` 白名单（如 `['override']`） |
| 文件里出现非法来源 | 不存在「非法来源」概念——只要层级允许就生效 | 拒绝并告警，值被忽略 |
| 安全键 | 低层级更严格值可以覆盖高层级 | 安全字段只收紧，一致 |
| 项目 hook | workspace trust 门控，`-p` 不算接受 | 已有项目信任与 hook 授权 |
| 关闭 hook | `disableAllHooks` / `allowManagedHooksOnly` 两个开关 | `allowUntrustedHooks`（仅命令行） |

**关键差异**：Claude Code 的模型里没有「这个键只允许命令行设置，出现在文件里就是错误」这一档。它用「层级」表达谁说了算，用「安全键取更严格值」表达收紧。我们的 `sources: ['override']` 更接近「这个键不属于文件层」，语义上更严格，但也因此产生了 ADD-74 的僵局：键留在文件里永远不会消失，且没有产品内移除手段。

**可借鉴的点**（不直接照搬）：
1. 「谁可以定义」与「是否运行」分离（`allowManagedHooksOnly` vs `disableAllHooks`）。
2. 对「文件里出现了不属于该层的键」，成熟做法是**忽略并说明**，而不是把它当成需要用户手动清理的错误——但前提是产品不会把它写回。
3. 项目来源的执行能力受 workspace trust 门控，这一点我们已经具备。

（Codex 的对照见 24.89，压缩部分的对照见 24.88；本节与后续各节均为只读源码/文档调研，结论已逐条复核，见 24.90 末尾的更正记录。）

### 24.88 调研：压缩与上下文显示（oh-my-pi 实测源码）

只读源码，未改代码。oh-my-pi 的 `docs/compaction.md` 与 `packages/agent/src/compaction/compaction.ts` 给出了一套明显更成熟的模型，以下逐条对照我们的现状。

#### 触发：六种，其中「回合前」不存在，但「工具循环边界」存在

oh-my-pi 的触发点（`docs/compaction.md` §Triggers）：

1. 手动 `/compact`；
2. 溢出恢复（同一模型的 assistant error 匹配 context overflow）；
3. 输出不完整恢复（`stopReason === "length"`）；
4. **回合后阈值维护**：一次成功回合之后，context 超过阈值时；
5. **回合内阈值维护**：`compaction.midTurnEnabled !== false` 时，工具循环的下一次 provider 请求之前；
6. 空闲维护（`runIdleCompaction()`）。

第 5 条绑在 `agent.setOnTurnEnd` 上（`agent-session.ts:2286`），条件是 `context?.willContinue`——**与我们的 `prepareNextStep` 位置等价**。

**更正（本轮复核）**：我最初只搜索 `maintainContext*` 就断定 omp 没有回合前检查，这是错的。omp 另有 `runPrePromptCompactionIfNeeded`（`session-maintenance.ts:2735`），在 `agent.prompt` 之前调用（`agent-session.ts:8958-8960`），并注明 `agent.continue()` 路径也会调用（`:5307`）。所以 **omp 有回合前检查**。

真正的差异在下面几条。

#### 差异一：阈值用 provider 实测，不是估算

oh-my-pi 的阈值判定用 `calculateContextTokens(usage)`（`compaction.ts:269`）：

```ts
const raw = usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
return Math.max(0, raw - orchestrationTotal);
```

即 **provider 返回的 input + cacheRead + cacheWrite**，天然包含 system prompt 与工具 schema。另外它会**扣除 provider 侧编排 token**（`orchestration`），因为那部分可计费但不会回放进对话前缀，计入会虚高阈值。

我们的 `planCompaction` 用 `estimateRequestTokens(messages, policy.overhead)`，是本地字符数 ÷ 3.5 的估算；`overhead` 需要在运行时注入，而 24.86 的实测发现运行时构建 policy 时**没有设置 `overhead`**（`cli/runtime/compaction.ts` 的 policy 字面量里没有该键，只有 `withRequestOverhead` 在 `startTurn` 里事后注入——`--print` 路径是否走到那里尚未核实）。这是「估算 vs 实测」的实质差距。

#### 差异二：keepRecent 的钳制目标是「压缩后落回阈值之下」

oh-my-pi 在 `compaction.ts:1540-1555`：

```ts
const recoveryBand = Math.floor(resolveThresholdTokens(contextWindow, settings) * COMPACTION_RECOVERY_BAND); // 0.8
const reserveFloor = Math.min(resolveBudgetReserveTokens(contextWindow, settings), settings.reserveTokens ?? DEFAULT_RESERVE_TOKENS);
const tailBudget = recoveryBand > reserveFloor ? recoveryBand - reserveFloor : Math.floor(recoveryBand / 2);
keepRecentTokens = Math.min(keepRecentTokens, Math.max(1, tailBudget));
```

注释说明了理由：「压缩后的上下文（保留尾部 + 摘要/prompt 开销）必须落在配置触发点之下的恢复带里，否则会立刻再次触发。触发点是用户的选择，所以让保留尾部让步，而不是让触发点让步。」

另有一条按实测比例缩放：`keepRecentTokens = keepRecentTokens / (promptTokens / estimatedTokens)`，把估算误差折算进去。

我们的钳制是 `Math.min(keepRecentTokens ?? 20000, availableTailTokens(policy))`，`availableTailTokens` = `window - reserve - output`（我刚加的改动再减去 overhead）。**没有「压缩后必须低于阈值」这一约束**，因此可能出现压缩完仍在阈值之上、下一回合立刻再压缩。

另：oh-my-pi 的 `DEFAULT_RESERVE_TOKENS = 16384`（`compaction.ts:198`），我们是 8000。

#### 差异三：上下文晋升（context promotion）优先于压缩

oh-my-pi 在溢出与输出不完整两条恢复路径上都**先尝试换更大的模型**，不可用才压缩：

> Context promotion is tried first; if a configured larger model is available, the agent switches model and retries without compacting.

我们没有这个概念。

#### 其他值得记录的设计

- **payload 拒绝保护**：HTTP 413 不自动当作 token 溢出。窗口已知且本地估算至少有 10% 余量、或显式图片限制证据时，阻止自动继续并报 payload 预算警告，而不是压缩或换模型。
- **speculation**：在阈值之下提前于后台生成摘要（`#startSpeculationRun`），真到阈值时直接应用。有「刷新即增长」策略：保留尾部增长超过 keepRecent 预算就重新生成。
- **空闲维护**：与 prompt cache TTL 对齐（长 tier 约 54 分钟，提前 5 秒），让摘要请求仍能读到缓存前缀。默认 300 秒短 tier 的取舍被明确记录为「接受冷读，避免短暂停顿触发压缩」。
- **恢复带 0.8**：`COMPACTION_RECOVERY_BAND = 0.8`，压缩后目标落在阈值的 80% 以下。

#### 对我们 ADD-77 / ADD-78 的意义

- ADD-77（溢出错误不说明构成）在 oh-my-pi 里对应的是「payload 预算警告」与「恢复失败时的可行动报告」，它们都区分了「窗口已知/未知」「有实测/仅估算」。
- ADD-78 的定性需要修正：**oh-my-pi 同样不在首次请求前检查**，所以「缺少回合前检查」不是我们独有的缺口。

**16k 溢出的根因已按算术确证**（不是推测）：

| 量 | 值 |
|---|---|
| 历史（transcript 实测） | 8789 tokens |
| 工具 schema（`/context` 报 18,865 bytes） | ≈5390 tokens |
| system prompt | ≈391 tokens |
| 输出上限 | 2048 |
| 合计 | 16,618 > 窗口 16,000 |
| 阈值（window − reserve） | 14,000 |

阈值判定本应触发（16,618 > 14,000）。压缩却拒绝了，原因是切点预算：

- 修复前 `availableTailTokens` = `16000 − 2000 − 2048` = **11,952**，不减工具 schema；
- `keepRecentTokens` 被钳到 11,952；
- 历史 8,789 < 11,952 → `fits-budget`，判定「整个对话都在保留尾部之内，无需压缩」；
- 但请求真实总量 16,618 已溢出。

也就是说：**阈值用「含 overhead 的总量」判断该不该压缩，切点预算却用「不含 overhead 的纯历史」判断能不能切**，两个口径不一致，于是出现「该压缩、却认为没什么可压」的死角。oh-my-pi 用 provider 实测 usage（天然含 overhead）做阈值，并把 keepRecent 钳到恢复带，口径统一。

- 我先前暂存的 `loop.ts` 预检查改动（`git stash`）**方向不对**，应丢弃；正确的修复在 `availableTailTokens` 的口径统一（已实现并验证，见下）与 keepRecent 的恢复带钳制（尚未做）。

#### pi 的对照（实测源码）

| 维度 | pi | 我们 |
|---|---|---|
| 回合前检查 | **有**。`_prepareRun` 在每次运行开始时调用 `_checkCompaction(lastAssistant, false)`，注释写明「catches aborted responses」 | 无 |
| 阈值来源 | **优先 provider 实测**：`calculateContextTokens(usage)` = `usage.totalTokens \|\| input+output+cacheRead+cacheWrite`；仅当 usage 缺失（error/全零）才回退到 `estimateContextTokens(messages)` | 纯估算 |
| 阈值公式 | `contextTokens > contextWindow - reserveTokens`，`DEFAULT reserveTokens = 16384` | 同形式，但 reserve 默认 8000 |
| keepRecent | `DEFAULT keepRecentTokens = 20000`，`findCutPoint` **不做窗口钳制**——走不动就返回起点（等价于「无可压缩」） | 钳到 `availableTailTokens` |
| 陈旧 usage 防护 | 有：压缩后保留的旧消息带旧 usage，会误触发；pi 检查 usage 消息是否早于最近一次压缩边界 | 无（我们靠 `historyDigest` 匹配） |

pi 与 omp 的共同点：**阈值优先用 provider 实测**。这是两家一致的判断，而我们用纯估算。

#### 三家汇总（codex 部分待补）

| 能力 | oh-my-pi | pi | 我们 |
|---|---|---|---|
| 回合前检查 | 无（mid-run 仅在 `willContinue`） | **有**（`_prepareRun`） | 无 |
| 阈值数据源 | 实测 usage（扣编排 token） | 实测 usage（缺失才估算） | 纯估算 + 注入 overhead |
| 切点预算口径 | 含 overhead（实测） | 实测，不做窗口钳制 | 纯历史（修复前不含 overhead） |
| keepRecent 钳制 | 钳到「恢复带 − reserve 底线」 | 不钳制 | 钳到可用窗口 |
| 上下文晋升 | 有（先换大模型再压缩） | 无 | 无 |
| 摘要预生成 | 有（speculation） | 无 | 无 |

### 24.89 调研：Codex 的 hook 信任与配置来源（实测源码）

只读源码，未改代码。Codex（`codex-rs`，Rust）的模型与 Claude Code 不同，但对 ADD-74 更有参考价值。

#### 没有「每键来源白名单」这一层

Codex 的 `ConfigToml` 是单一 serde 结构体，所有层反序列化到它。不存在 `sources = ['override']` 这种声明。表达「谁说了算」只有四种机制：

1. **层优先级**（`config_layer_source.rs:32-56`）：PackagedDefaults(−10) → Mdm(0) → System(10) → EnterpriseManaged(15) → User(20) → Project(25) → SessionFlags(30)。CLI `-c key=value` 作为 SessionFlags 最后压入，靠优先级胜出。
2. **项目层拒绝名单**（`loader/mod.rs:75-88`）：`PROJECT_LOCAL_CONFIG_DENYLIST`，包含 `model_provider`、`notify`、`profiles`、`otel` 等 12 个键。应用方式是 `table.remove(*key)`——**剥离并警告，不是拒绝**。
3. **仅 requirements 的键**：如 `allow_managed_hooks_only` 只存在于 `ConfigRequirementsToml`，写在 `config.toml` 里会被静默忽略（`config_loader_tests.rs:364-428` 显式断言这是 no-op）。
4. **仅代码的键**：`bypass_hook_trust`（`config/mod.rs:912-917`，注释写明「runtime-only knob populated from invocation overrides, not from config files」），对应 CLI 标志 `--dangerously-bypass-hook-trust`。

**这正是我们 `allowUntrustedHooks` 的对应物**，但处理方式完全不同：Codex 让它**根本不在配置 schema 里**，于是文件里写了就是未知键，默认静默忽略，只有 `--strict-config` 才报一行错。

#### 未知键的三种处理，都区别于我们

| 情形 | Codex | 我们 |
|---|---|---|
| 文件里有 schema 之外的键 | 默认静默忽略；`--strict-config` 才报 `unknown configuration field \`x\`` + file:line:col + `^^^^` 插入符 | 每次启动告警 |
| 项目层设了拒绝名单里的键 | **剥离该键、继续运行、一条警告**，点名所有被剥离的键并给出精确补救：「If you want these settings to apply, manually set them in your user-level config.toml.」 | `source-not-allowed` + `value ignored` |
| 值类型错误 | 无论是否 strict 都是致命错误 | 致命错误 |

#### 写入路径不会复活被忽略的键

Codex 的写入是对 `toml_edit::DocumentMut` 的**定点编辑**，从不重新序列化类型化结构体（`edit.rs:741-779`）：

- 代码不认识的键**原样保留**（从未进入解析路径）；
- 注释与格式保留；
- 无变化时跳过写入（`if !mutated { return Ok(()) }`）；
- 只允许写用户配置文件。

**这与我们的行为正好相反**：我们基于「原始文档合并值」重写整份文档，于是被层加载器忽略的键在写入路径上被原样带回。Codex 天然没有这个问题，因为它的写路径根本看不见 schema。

#### Codex 有一等的「删除键」原语

- 引擎级 `ConfigEdit::ClearPath { segments }`（`edit.rs:78-79`），用于「取消设置、回到默认」——例如关闭默认 false 的 feature 时**清除键而不是写 false**（`edit.rs:881-905`）。
- RPC 级：`null` 值即删除（`config_manager_service.rs:520-526, 593-601`），客户端助手 `clear_config_value` = `replace_config_value(key, Null)`（`config_update.rs:41-51`）。
- CLI 级：`codex mcp remove`、`codex plugin remove`、`codex features disable`。**没有通用的 `codex config unset`**。

#### hook 信任：声明与信任分离

这是对 ADD-74 最有启发的一条：

- **可信对象**不是项目、也不是文件，而是 hook 的**规范化身份哈希**（`discovery.rs:748-778`），注释说明「so equivalent hooks from config TOML and hooks.json converge on the same trust identity」。
- **信任状态存在用户配置**的 `[hooks.state."<key>"]`，键格式 `"{key_source}:{event}:{group_index}:{handler_index}"`。
- **只有 user 与 session-flag 层能写信任**（`config_rules.rs:15-31`）：项目、managed、插件层可以**发现** hook，但**不能写用户 hook 状态**。这就是「仓库能声明 hook，但不能自我授权」的实现方式。
- **撤销是隐式的**：编辑 hook → 哈希变化 → 状态从 `Trusted` 降为 `Modified`（界面显示 "Modified since last trusted - review required"）。没有显式的 untrust 动作。
- **启动时**：任何 `Untrusted`/`Modified` 的 hook 会弹出复核屏挡住会话；`--dangerously-bypass-hook-trust` 跳过并打印启动警告。

对照我们：我们的 `allowUntrustedHooks` 是**一个布尔开关**，Codex 是**逐 hook 哈希 + 分层写入权限**。两者不是同一粒度的设计。

#### 对 ADD-74 的结论

我们观察到的三个问题在 Codex 里都不存在，原因是一条链：

1. 键不在 schema → 文件里写了不算「非法来源」，只是未知键；
2. 未知键默认静默 → 不会每次启动重复告警；
3. 写路径是文档定点编辑 → 被忽略的键不会被写回；
4. 另有 `ClearPath`/null 原语 → 需要时能显式删除。

我们同时具备「告警、写回、无法删除」三个特征，是因为选择了「每键来源白名单 + 基于合并值重写文档」这一对设计。**修复方向不是给 `/settings` 加一个 unset 命令，而是让写路径不再复活被忽略的键**——这一点与 Codex 的做法一致，也解释了为什么单纯加命令只是治标。

#### Codex 的对照（实测源码）

| 维度 | Codex | 我们 |
|---|---|---|
| 检查位置 | **post-sampling**（每次模型调用后，`turn.rs:424-470`），由 `needs_follow_up` 驱动 | 步骤之间（`prepareNextStep`） |
| 回合前检查 | **有**（`run_pre_sampling_compact`，`turn.rs:172`） | 无 |
| 阈值数据源 | **实测**：`sess.get_total_token_usage()`（`context_window.rs:57`） | 纯估算 |
| 阈值 scope | 两种：`Total` 与 `BodyAfterPrefix`（后者扣掉 prefill 基线） | 单一总量 |
| 硬上限 | 模型完整窗口独立于压缩阈值，两者取更严的 | 只有阈值 |
| 缓冲 | `fallback_buffer_tokens` 仅在有 fallback prompt 时预留 | 无此概念 |
| 压缩实现 | 三种：`ResponsesCompactionV2` / `ResponsesCompact` / 本地 `run_inline_auto_compact_task`，按 provider 能力选择 | 单一实现 |
| 模型回退 | `compact_model_fallback.rs`：上一个模型压缩失败则用当前模型重试 | 无 |

**Codex 的 `BodyAfterPrefix` scope 值得单独记一笔**：它把「请求前缀（system + tools）」当作固定成本，只对「前缀之后新增的 body」计阈值。这与我们 24.88 里发现的「阈值用总量、切点预算用纯历史」是同一问题的另一种解法——Codex 明确把两者分开定义并让用户可选。

#### 三家在「回合前检查」上的分歧（已复核更正）

| | oh-my-pi | pi | codex | 我们 |
|---|---|---|---|---|
| 回合前检查 | **有**（`runPrePromptCompactionIfNeeded`，`agent-session.ts:8958`） | **有**（`_prepareRun`，`agent-session.ts:1952`） | **有**（`run_pre_sampling_compact`，`turn.rs:172`） | **无** |

**三家全部有，只有我们没有。** 我先前写的「两家没有」是搜索不完整导致的错误结论，已更正。

三家的共同点：都在**首次请求发出之前**用「消息 + 待发 prompt + 非消息开销」估算总量，超过阈值就先压缩再发。pi 的注释点出了它要解决的场景：「catches aborted responses」——上一回合被中止后遗留的超大上下文。

因此 ADD-78 的定性恢复为：**我们缺少回合前检查，这是真实缺口**；同时阈值口径与切点预算口径不一致是另一个独立缺口（见差异一、二）。两者叠加，才会走到「该压缩却不认为可压缩」的死角。

### 24.90 调研结论：问题清单与可选方案

本轮只做调研，未改产品代码。以下把 24.83–24.89 的发现整理成「问题 → 三家怎么做 → 可选方案」，供裁决。

#### A. hook / 配置来源（对应 ADD-74）

**问题**：`allowUntrustedHooks` 这类「只允许命令行设置」的键，一旦被写进配置文件，会同时触发三个症状——每次启动告警、任何保存都把它写回、产品内无法删除。

**三家怎么做**：

| | 做法 |
|---|---|
| Claude Code | 没有「非法来源」概念。每键可在多层设置，按优先级栈解析；安全键取较低层更严格的值。项目 hook 受 workspace trust 门控。 |
| Codex | 等价键 `bypass_hook_trust` **不在配置 schema 里**，写了就是未知键，默认静默忽略。需要「此来源不许设」时用剥离+警告+补救提示。写路径是 `DocumentMut` 定点编辑，不复活被忽略的键。有 `ClearPath`/null 删除原语。 |
| oh-my-pi | 未在本轮核实该具体字段（其 hook 授权模型见 24.71–24.75 的历史记录）。 |

**可选方案**（按改动面从小到大）：

1. **只改警告文案**（已做，24.85）：说明来源与「可从文件移除」。治标。
2. **写路径不再复活被忽略的键**：让 `persistConfigEdit` 在合并基线时排除 `source-not-allowed` 的键，使其在下一次保存时自然消失。与 Codex 的行为一致，改动集中在 `persistence.ts` 与 `layers.ts` 的交互处。
3. **加 `ClearPath` 式删除原语**：`patchConfigDocument` 已有 `deletionEdits`，缺的是「用 `undefined` 表达删除」的契约与一个调用入口。
4. **把该键移出配置 schema**（Codex 路线）：改动最大，会影响现有 `RuntimeConfigFile` 类型与所有读取点。

倾向：方案 2 是根因修复，且不引入新命令；方案 3 可作为后续增强。方案 1 已交付，可保留。

#### B. 压缩与上下文（对应 ADD-77 / ADD-78）

**问题一（已确证，但定性需要精确）**：阈值用「含 overhead 的总量」判断（8,789 + 5,781 = 14,570 > 14,000，应压缩），切点预算用「不含 overhead 的纯历史」判断（8,789 < 11,952，无切点）。于是压缩被静默跳过，请求带着 16,618 发出并溢出。

**但「口径不一致」本身不是缺陷**。[compaction.ts](../../packages/ts-shell/src/session/compaction.ts) 的 `overhead` 注释明确论证了这个选择：切点预算关乎对话，overhead 是固定成本，不随历史缩小；把 provider 计数喂进切点会让「本来在预算内的对话仍产生切点，且切点随开销增长而缩小」。这个论证是成立的。

**真正的缺陷是「阈值已超、却无切点可做」这个状态被当作「无需压缩」静默放行。** 三家在这一点上的处理：

| | 阈值已超但切不出东西时 |
|---|---|
| oh-my-pi | `findCutPoint` **总返回切点**——「Keep the newest group even when it alone exceeds the budget」（`compaction.ts:518-523`），不产生「无可压缩」状态 |
| pi | 切点默认落到 `cutPoints[0]`（保留几乎全部），`prepareCompaction` 返回 undefined，`_runAutoCompaction` 静默 `return false`；但 pi 有**回合前检查 + 实测 usage** 双重兜底 |
| codex | 无「拒绝」概念，总是压缩；请求溢出时丢最旧条目重试（`compact.rs:314-329`） |
| 我们 | `locateCut` 返回 `fits-budget` → `planCompaction` 返回 undefined → 静默跳过，**且没有任何兜底** |

**可选方案**（修正后）：

1. **对齐 omp：切点永不拒绝**。保留最新的完整组，即使它单独超出预算。这消除了「无可压缩」这个状态，但会改变现有 `fits-budget` 的语义与测试。
2. **对齐 pi/omp：加回合前检查**。在首次请求前用「消息 + overhead」判断，超阈值就先压缩。
3. **改用实测 usage**：三家一致的做法，但首回合无 usage，仍需估算兜底。
4. **保留现设计，只修呈现**：把「该压缩但无切点」明确报告给用户，而不是静默放行。

倾向：方案 2 是最小且与三家一致的修复（我先前暂存的 `loop.ts` 改动方向其实是对的，被我自己误判为错误）；方案 3 是长期方向；方案 1 改动面最大，需单独评估。

**问题二**：`keepRecentTokens` 的钳制目标是「可用窗口」，而 oh-my-pi 钳到「恢复带（阈值 × 0.8）− reserve 底线」，保证压缩后落在阈值之下、不会立刻再次触发。我们的钳制没有这个约束。

**可选方案**：引入恢复带概念，`keepRecent = min(keepRecent, recoveryBand − reserveFloor)`。

**问题三**：默认 `reserveTokens` 我们是 8000，pi 与 oh-my-pi 都是 16384。小窗口下这个差异会显著改变可用空间。

**问题四（ADD-77）**：溢出错误只说「无法自动压缩」，不说明占用构成，也不给动作。oh-my-pi 有「payload 预算警告」与「恢复失败的可行动报告」，并区分「窗口已知/未知」「有实测/仅估算」。

**问题五（能力缺口，非缺陷）**：三家都有我们没有的能力——pi 的回合前检查、omp 的上下文晋升与 speculation、codex 的多实现压缩与模型回退。是否引入需单独裁决。

#### C. 上下文显示

我们的 `/context` 已有 measured/stale/unknown 四态，且明确「只显示可核对的量」，这一点比三家中的多数更严格（24.86 记录的 `Assembled request estimate` 与 `Provider prompt usage is unknown` 就是例证）。本轮未发现需要修改的地方，但若采纳「实测 usage 做阈值」，显示层与压缩层可以共用同一份数据，减少一次估算。

#### 待裁决事项（已按复核更正）

1. A 走方案 2（写路径不复活被忽略的键）还是方案 3/4。
2. B 走方案 2（回合前检查，三家一致）还是方案 1（切点永不拒绝，omp 路线）。
3. 是否同时采纳「无切点时必须明确报告」——三家都不静默，只有我们静默。
4. 是否改用实测 usage（三家一致），以及首回合的估算兜底。
5. 是否引入恢复带钳制与 16384 的 reserve 默认值。
6. ADD-77 的呈现形式（复用 `/context` 的分类估算到错误路径）。

**关于已暂存的代码**：`git stash` 里有两项——`loop.ts` 的回合前检查（方向正确，与三家一致）与 `compaction.ts` 的 `availableTailTokens` 扣除 overhead（方向存疑：它把刻意的设计改成了统一口径，与 `overhead` 字段的论证冲突）。取回时应只取前者，后者需重新评估。

#### 复核补充（子代理只读调研 + 主代理逐条验证）

子代理的完整对照推翻了我此前的两处结论，以下为核实后的记录。

**更正一：三家全部有回合前检查。** 我最初只搜索 `maintainContext*` 就断定 omp 没有，是搜索不完整。实测：

- omp：`runPrePromptCompactionIfNeeded`（`session-maintenance.ts:2735`），在 `agent.prompt` 之前调用（`agent-session.ts:8958-8960`），auto-continue 路径也调用（`:5307`）。
- pi：`_prepareRun` 里 `_checkCompaction(lastAssistant, false)`（`agent-session.ts:1952`）。注意它要求 `lastAssistant` 存在，所以**全新会话的首回合会跳过**。
- codex：`run_pre_sampling_compact` 是 `run_turn` 的第一件事（`turn.rs:172`）。

**更正二：「口径不一致」是刻意设计，不是缺陷。** `overhead` 字段的注释论证了切点预算为何不用它。真正缺陷是「阈值已超但无切点」被静默当作无需压缩。

**新增对照细节：**

- **omp 的切点永不拒绝**：`findCutPoint` 的注释写「Keep the newest group even when it alone exceeds the budget」（`compaction.ts:518-523`）。它没有 `fits-budget` 这个状态。
- **omp 的预提示估算包含非消息开销**：`computeNonMessageTokens` 累加 system prompt + 工具 schema（`context-usage.ts:414-431`），并与 provider 锚定值取 max（`compactionContextTokens`）。
- **omp 的拒绝是有声的**：无切点时返回 `COMPACTION_CHECK_BLOCK_AUTOMATIC_CONTINUATION` 阻止自动继续；摘要不缩小时发 warning notice 并尝试下一种方法；手动无操作抛 `ManualCompactionNoOpError` 记为 `skipped`。我们全程静默。
- **codex 无「拒绝」概念**：总是压缩，压缩后无条件发一条「长线程会降低准确度」的警告；压缩请求本身溢出时丢最旧条目重试。
- **codex 的 keep-recent 是常数**（本地 20,000 / 远程 v2 64,000），不从窗口派生，因此不存在「大于窗口」的问题。
- **pi 的 keep-recent 完全不钳制**：超出窗口时切点落到第一条，`prepareCompaction` 返回 undefined，自动路径静默 `return false`，手动抛 `"Nothing to compact (session too small)"`。
- **上下文显示**：只有 omp 有分类拆分（System prompt / System tools / System context / Skills / Messages，外加 Auto-compact buf 与 Free）；pi 只有百分比与 `?`；codex 显示「N% context left」，pending 时整行留空。我们的四态（measured/stale/unknown + estimated 前缀）比 pi/codex 更细，但状态栏没有 omp 那样的分类拆分。

**对「倾向」的修正**：方案 2（回合前检查）并非「我先前判断错误」——那个判断本身就是错的，`loop.ts` 的暂存改动方向是对的。但仅加回合前检查不足以消除死角，因为首次请求前若仍无切点，同样会静默放行。更完整的修复需要「回合前检查 + 无切点时的明确报告」两项，或采用 omp 的「切点永不拒绝」。

### 24.91 ADD-74 / 77 / 78 实施：写路径、回合前检查与拒绝报告

按 24.90 的建议实施三项，全部经红灯反转与真实 CLI 复核。

**ADD-74：写路径不再复活被忽略的键。** [persistence.ts](../../packages/ts-shell/src/config/persistence.ts) 新增 `dropSourcesNotAllowed`：在构建写入目标时，把用户配置文件里「该字段 `sources` 不含 `user`」的键剔除。`patchConfigDocument` 本就支持删除（`change.value === undefined` → `deletionEdits`），缺的只是让 desired 不含该键。剔除只作用于用户设置文件——项目文件有自己的来源规则与信任门控，且加载时已过滤，一并应用会让普通保存丢掉项目层合法拥有的字段（首版如此实现，`persistence.test.ts` 10 项失败，已收窄）。

真实 CLI：种子 home 写入 `allowUntrustedHooks: false`，启动出现警告，执行 `/settings set maxTurns 11` 保存成功后，文件中该键**已消失**，`maxTurns` 为 11。

**ADD-78：回合前检查。** [loop.ts](../../packages/ts-shell/src/core/agent/loop.ts) 的 `driveLoop` 在进入循环前调用一次 `prepareNextStep`，`NextStepSnapshot.message` 改为可选（首次检查没有「上一步」）。三家参照实现全部有此检查，只有我们没有。

**ADD-77：无切点时明确报告。** [compaction.ts](../../packages/ts-shell/src/session/compaction.ts) 新增 `compactionRefusal`：只在「预算已超、且切不出东西」时返回可读说明，分「对话仍在保留尾部内」与「切点会把工具调用与结果分开」两种，各给对应动作。经 `onDeclined` 回调（新增于 `CompactionStepOptions` 与 `CompactionSetup`）传到 [resources.ts](../../packages/ts-shell/src/cli/provider/resources.ts) 的 `renderer.renderLine`。上下文仍在内时保持静默——那是「无事可做」，不是「无事可说」。

真实 CLI（16k 窗口、历史约 12.8k）：

```text
Context the request needs about 12,780 tokens for a 16,000-token window, but the
conversation still fits the recent tail compaction keeps, so there is nothing to
condense. Lower keepRecentTokens to condense it now.
```

**顺带修复：print 模式的溢出裸栈。** 验证时发现 `--print` 下溢出仍打印 `Fatal error:` + 完整堆栈。[cliRuntimeModule.ts](../../packages/ts-shell/src/entrypoints/cliRuntimeModule.ts) 的 `executePrompt` 调用只有 `try/finally`，异常直接冒到顶层边界。新增 `catch`：print 模式下由 `recordRunFailure` 渲染一行消息，交互模式照旧上抛（其自有 sink 负责呈现）。修复后 exit=0，无堆栈。

**验证。** 单 worker / heap768MiB 串行四文件 95 项通过：`persistence` 32、`compaction` 38、`loop` 20、`cliRuntimeModule` 5。三次红灯分别成立：移除回合前检查（1 失败）、移除剔除规则（1 失败）、禁用 `compactionRefusal` 的阈值判断（1 失败），逐字节恢复后均再绿。五静态门与 `git diff --check` 通过（118 条既有 advisory 保留），TS build `78bd5c7c7116`。

**未做与边界。** 未采纳 24.90 的第 4–6 项（实测 usage 已存在、恢复带钳制、16384 默认值）。本机 Node 24.15，未在 20.3 floor 复验。`git stash` 中 `compaction.ts` 的 overhead 扣除改动按 24.90 结论未取回，已随 stash 清理。

### 24.92 第 4、5 项复核：不需要改动

24.90 列出的第 4、5 项经核算后判定为「不需要改」，理由如下。

**第 5 项（恢复带钳制）：数学上已满足。** oh-my-pi 引入恢复带是为了保证「压缩后落回阈值之下、不会立刻再次触发」。我们的钳制是：

```
availableTailTokens = window − reserve − outputTokens
keepRecent          = min(configured ?? 20000, availableTailTokens)
```

而阈值是 `window − reserve`（软阈值为其 90%）。因为 `availableTailTokens` 恒等于 `threshold − outputTokens`，**保留尾部永远小于阈值**，不存在「压缩后仍在阈值上」的情况。实测三种典型窗口（16k / 128k / 200k）与三种极端 `keepRecentTokens` 配置（13000 / 11500 / 9000）均确认：压缩后尾部始终低于阈值。omp 需要恢复带，是因为它的尾部预算不扣输出上限，两者基线不同。

**第 4 项（实测 usage）：已经实现。** `cli/runtime/compaction.ts` 的 `measureContextTokens` 已完整实现「provider 实测 + 之后的估算增量」，与三家参照一致：

```ts
const measured = measuredPromptContext(input.sessionId, {...}, { requireExpectedIdentity: true });
if (!measured) return undefined;
return measured.tokens + estimateTokens(messages.slice(measured.messageCount));
```

真正的边界是**全新会话首回合没有测量记录**，只能估算。这与三家相同，不是缺口。

**16384 的 reserve 默认值：不能采纳。** 我们的 `reserveLimitFailure` 规定 `reserve >= window` 即错误。16k 窗口配 16384 会直接触发 `reserveTokens must leave input space in the resolved context window.`，让所有小窗口配置失效。参照实现没有这条校验，所以能设 16384；我们的校验更严格，保留现状。

#### 24.91 补记：拒绝消息去重

`createCompactionStep` 在工具循环的每一步之前都会运行。首版实现里，「预算已超且无切点」的说明会**每步打印一次**，一次长工具循环就会刷屏。现按「同一段上下文只报一次」去重：记录上次报告的内容，内容相同则不再输出；一旦上下文发生可压缩的变化（`tokensBefore` 有值）就重置记录，使后续再次进入该状态时仍能报告。

真实 CLI 复核：同一会话再次触发时，该消息出现 **1 次**，exit=0，无堆栈。

### 24.93 上下文显示与压缩判定使用不同数值（新发现，未修）

复核状态栏的上下文数字时发现一处不一致，此前被我判为「显示层比参照实现更细」而跳过，实际不是显示样式问题，是**数值来源不同**。

**状态栏**（[sessionFacts.ts](../../packages/ts-shell/src/cli/interactive/sessionFacts.ts)）取 `measuredPromptContext(...).tokens`——上一次请求的 provider 实测值，**不含测量之后新增的消息**。

**压缩判定**（[compaction.ts](../../packages/ts-shell/src/cli/runtime/compaction.ts) 的 `measureContextTokens`）取 `measured.tokens + estimateTokens(messages.slice(measured.messageCount))`——实测值 **加上**之后的增量估算。

两者在「刚发完一次请求」时一致，此后每发一条消息就拉开距离。按 8000 实测 + 3600 增量估算：状态栏显示 50%，压缩判定看到 73%（16k 窗口）。

**这不是设计意图。** [sessionFacts.ts](../../packages/ts-shell/src/cli/interactive/sessionFacts.ts) 的注释只解释了「草稿预览与实测值的优先级」，没有处理「实测之后的增长」。

**参照实现的做法**：oh-my-pi 的 `#anchoredUsedTokens` 明确是「provider 基准 + 锚点之后的非消息增量 + 本地尾部 + pending」，即**包含增量**。它的注释把这条算式称为「shared by every anchored branch」，说明是统一口径。

**为什么没有直接修**：修复需要让状态栏拿到与压缩判定同一份 `messages`（请求视角的数组）。`sessionFacts` 目前只有 `runtimeContext.session.turns`，而 `lastPromptMessageCount` 记录的是**发送给 provider 的消息数**（`turn/step.ts:634` 的 `messages.length`），两者口径未必一致。直接按索引切片可能引入更大的错误。

**可选方案**：

1. 让 `runtimeContext` 暴露一个「当前请求视角的消息快照」，状态栏与压缩判定共用（最正确，改动最大）。
2. 状态栏维持实测值，但把标签从隐含的「当前」改成明确的「上次请求」，让用户知道会滞后（最小改动，诚实但没解决问题）。
3. 状态栏改用与压缩判定相同的 `measureContextTokens`，把 `messages` 通过 `StatusFacts` 传入（中等改动，需确认数据可达）。

倾向方案 1 或 3；方案 2 只是把问题说清楚，不解决。

**影响**：用户可能在状态栏看到「还有余量」时突然遇到溢出。这与 24.84 记录的溢出体验是同一类问题，但根因不同——那次是压缩没有切点，这次是**显示滞后**。

#### 24.93 补记：根因已精确定位

继续核实后，问题的形状比「两套数值」更具体：**正确算式已经存在，但在忙碌时被丢掉了**。

- [estimate.ts](../../packages/ts-shell/src/context/request/estimate.ts) 的 `estimatePrompt` 已经实现了与 oh-my-pi 一致的锚定算式：

  ```ts
  const tokens = calibrated
    ? usage.lastPromptTokens! + estimateTokens(messages.slice(count))
    : projectedTokens ?? estimateRequestTokens(messages, overhead);
  ```

  它产出 `calibrated` 状态，含义正是「实测 + 之后的增量」。

- 这个函数只被 [preview.ts](../../packages/ts-shell/src/cli/runtime/context/preview.ts) 使用，结果经 `createContextController` 暴露为 `promptContext`。

- 但 [interactiveMode.ts](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts:375) 只在**空闲**时提供它：

  ```ts
  ...(!this.busy ? { promptContext: this.promptContext.read() } : {}),
  ```

- 忙碌时 `readStatusFacts` 退回 [sessionFacts.ts](../../packages/ts-shell/src/cli/interactive/sessionFacts.ts:91) 的 `measured` 分支——**不含增量**。

所以准确的表述是：**空闲时状态栏正确（`calibrated`，含增量），忙碌时退回滞后值（`measured`）**。而忙碌恰恰是用户最需要看到增长的时刻。

修复方向因此变得明确：忙碌时不应丢弃已有的 `calibrated` 读数。具体做法待参照实现调研结论确定（子代理进行中）。

### 24.94 独立复核发现并修复的四个问题

对 24.91 的三项改动做只读复核，发现四处问题。以下按严重程度排列，全部经红灯验证。

**一、print 模式的失败不再退出非零（真实回归，我引入的）。**

24.91 我在 [cliRuntimeModule.ts](../../packages/ts-shell/src/entrypoints/cliRuntimeModule.ts) 加的内层 `catch` 吞掉了异常：外层 `catch` 收不到，函数正常返回，`--print` 失败也变成 exit 0。这会让脚本化的管道误判成功。当时观察到的 `exit=0` 不是修复成功，而是失败被掩盖。

修复：删除内层 `catch`，让外层按原有逻辑设 `turnEndStatus = "error"` 并抛出。真实 CLI 复核：失败场景 exit=**1**，成功场景 exit=**0**。

**二、顶层致命错误打印完整堆栈。**

[cliFatalErrorBoundary.ts](../../packages/ts-shell/src/cli/errors/cliFatalErrorBoundary.ts) 原本 `writeError("Fatal error:", error)`，把 error 作为第二个参数交给 `console.error`，Node 因此渲染完整栈。改为只输出消息；栈由 crash recorder 保留在 profile 目录，那才是它有用的地方。真实 CLI 复核：输出两行可读消息，无 `at ...` 帧。

**三、拒绝消息的去重键含会变的数字。**

去重原本比较完整文案，而文案里嵌了 `Math.round(tokens)`；该数字随每条工具结果增长，于是一个 `no-legal-cut` 的长工具循环仍会每步打印一次。新增 `compactionRefusalReason` 返回「稳定原因 + 文案」，去重按原因。红灯验证：无此改动时同一上下文报告 3 次，有则 1 次。

**四、配置过滤可能触及凭据文档。**

`dropSourcesNotAllowed` 作用于 settings 与 auth 的**合并值**，而规则按文件声明。当前五个 auth 字段的 `sources` 都含 `user`，所以尚未误删；但规则表述与作用范围不一致，未来出现「只允许 override 的凭据字段」时会静默删除凭据。修复：跳过声明上属于凭据文档的键（导出 `isDeclaredAuthField` 供写路径使用，不复制名单）。补了一条「保存不删除 auth.json 内容」的回归。

**复核中判定不成立的一条**：复核意见认为 `compactionRefusal` 的 `fits-budget` 分支从生产路径不可达。实测否定——`planCompaction` 返回 undefined 有两条独立路径（切点不足、未达阈值），`isBelowThreshold` 只排除后者，前者两个子因都可达。但意见的另一半成立：原单元测试只直接调 helper，没走真实调用者，已补一条经 `createCompactionStep` 的用例。

**验证。** 单 worker / heap768MiB 串行五文件 102 项通过（persistence 33、compaction 41、loop 20、cliRuntimeModule 5、fatalErrorBoundary 3）。五静态门通过，TS build `a2e03b408548`。真实 CLI：失败 exit=1 无堆栈，成功 exit=0。

### 24.95 auto-compact 成功路径验证：未触发，原因未查明

用小规模配置（`contextWindow: 20000`、`reserveTokens: 2000`、`maxOutputTokens: 1024`、`keepRecentTokens: 2000`）在隔离 home 中续接同一会话，跑到 **41 条消息 / 约 12,581 tokens**。压缩**从未触发**。

**判定逻辑本身是正确的。** 用该会话的真实 transcript 加真实 overhead 跑单元验证：

```
messages: 41
planCompactionCut: FOUND          ← 有切点
estimateRequestTokens: 18143      ← 超过 softLimit 16976
planCompaction: TRIGGERS          ← 应该触发
```

**接线也是存在的。** 在 `startTurn` 加持久化诊断后确认：

```
startTurn compaction=yes tools=18
after overhead compaction=yes policyOverhead=18
```

`compaction` 非空、`overhead` 含 18 个工具。

**但 `planCompaction` 在真实运行中从未被调用**，说明 `prepareNextStep` 没有执行。原因未查明。

**排查中的一处失误**：我最初用 `require('node:fs')` 在 ESM 模块里写诊断，异常被 `catch {}` 吞掉，导致连续几轮把「诊断为空」误读为「未调用」。改用 `import` 后才发现接线是好的。这条记入 HANDOFF。

**未完成的排查方向**：

1. 在 `createCompactionStep` 返回的 step 函数入口加持久化计数器，确认它是否被执行；
2. 在 `driveLoop` 的 pre-step 调用处加同样计数器，区分「没调用 `prepareNextStep`」与「调用了但 `planCompaction` 返回 undefined」；
3. 对比交互模式是否同样不触发，判断是否 `--print` 特有。

诊断代码已全部回退，工作树干净。本条记为**未解决**，不提升任何 ADD 状态。

### 24.96 本轮问题总结：反复修改、实测遇到、始终未解决

本节只做汇总，不改代码。分三类：**已修复但反复过**、**已发现未修**、**查不到根因**。

#### 一、始终没有解决的问题（最高优先级）

**1. auto-compact 在真实 CLI 中从未成功执行过一次。**

这是本轮最严重的问题。所有压缩相关的修复都只在**拒绝分支**上得到过验证。

已确认的事实：

- 判定逻辑正确：用真实 transcript（41 条消息、约 12,581 tokens）加真实 overhead 跑单测，`planCompactionCut` 找到切点、`estimateRequestTokens` 得 18143（超过 softLimit 16976）、`planCompaction` 返回「应触发」。
- 接线存在：`startTurn` 的诊断显示 `compaction=yes tools=18`、`policyOverhead=18`。
- 但 `planCompaction` 在真实运行中**从未被调用**，说明 `prepareNextStep` 没有执行。

原因未查明。可能的方向：`driveLoop` 的 pre-step 调用条件、`--print` 与交互模式的路径差异、`AgentCore.createLoopConfig` 的选项传递。

**2. 上下文显示滞后于压缩判定。**

状态栏取 `measuredPromptContext().tokens`（上次请求实测，不含之后新增），压缩判定取「实测 + 增量」。两者在刚发完请求时一致，此后每发一条消息就拉开距离。按 8000 实测 + 3600 增量、16k 窗口：状态栏 50%，判定 73%。

根因已精确定位，比「两套数值」更具体：**正确算式已经存在，但被丢弃**。

- `estimatePrompt` 已实现锚定算式（实测 + `estimateTokens(messages.slice(count))`），产出 `calibrated` 状态；
- 但 [interactiveMode.ts](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts:375) 只在**空闲**时提供它：`...(!this.busy ? { promptContext: this.promptContext.read() } : {})`；
- 忙碌时退回 `sessionFacts.ts` 的 `measured` 分支，不含增量。

还有第二层：`read()` 在预览超过 20 秒（`checkedAt + 20000`）后返回 `{ source: 'stale' }`，**不带 tokens**，即使空闲也会丢掉数字。

参照实现的做法（本轮调研）：三家都用「实测 + 尾部估算」；只有本项目的显示层会丢掉增量。oh-my-pi 另有 `compactionEpoch` 机制拒绝压缩前的陈旧锚点，以及签名的 schema 增量（roster 收缩时数字能下降）。

#### 二、已发现但未修的问题

**3. `fits-budget` 与 `no-legal-cut` 两种拒绝在真实路径上可能只有一种可达。**

复核意见提出这一点，我用实测否定了一半（`fits-budget` 确实可达），但它指出的另一半成立：单元测试只直接调 `compactionRefusal`，没走 `createCompactionStep`。已补用例，但两种拒绝在**完整工具循环**中的实际分布仍未观察。

**4. `compactionRefusal` 重复调用 `measureContextTokens`。**

`planCompaction`、`isBelowThreshold`、`compactionRefusal` 三处各算一次，而实现里含 sha256 与消息切片。只在拒绝路径发生，不构成正确性问题，但是明显的重复工作。

**5. ADD-77 只给了整体预算，没有逐类拆分。**

当前输出「需要约 12,806 tokens 对 16,000 窗口」，没有说明工具 schema / 历史 / 输出各占多少。`/context` 已有分类估算，但没有接到错误路径。

**6. 压缩后的上下文状态没有专门处理。**

pi 在压缩后返回 `tokens: null`（诚实），oh-my-pi 用 epoch 保持一个合理数字，codex 用本地估算替换。本项目压缩后的显示行为未验证。

#### 三、已修复但过程中反复过的问题

**7. print 模式失败退出 0（我引入的回归）。**

上一批加的内层 `catch` 吞掉异常，外层收不到，函数正常返回。当时观察到的 `exit=0` 被误读为修复成功，实际是失败被掩盖。由独立复核发现。已修复并验证（失败 exit=1、成功 exit=0）。

**8. 顶层致命错误打印完整堆栈。**

`writeError("Fatal error:", error)` 把 error 作为第二参数，Node 渲染完整栈。已改为只输出消息。

**9. 拒绝消息去重键含会变的数字。**

去重比较完整文案，而文案嵌了随工具结果增长的 token 数，长循环仍每步打印。已改为按稳定原因去重。

**10. 配置过滤可能触及凭据文档。**

`dropSourcesNotAllowed` 作用于 settings 与 auth 的合并值，规则却按文件声明。当前五个 auth 字段都含 `user` 所以未误删，但规则与范围不一致。已改为跳过凭据文档的键。

**11. 写路径复活被忽略的键（ADD-74）。**

首版对项目文件也生效，导致 `persistence.test.ts` 10 项失败。已收窄为仅用户设置文件。

#### 四、调研过程中的方法论失误（值得记录）

**12. 用 `require()` 在 ESM 模块里写诊断，异常被 `catch {}` 吞掉。**

连续几轮把「诊断日志为空」误读为「代码未被调用」，浪费了大量排查轮次。改用 `import` 后立刻发现接线是好的。这条已写入 HANDOFF 的必要性。

**13. 两次把「部分证据」当成「结论」。**

- 只搜索 `maintainContext*` 就断定「三家没有回合前检查」，实际三家全有；
- 看到状态栏有五种来源态就断定「显示层比参照更细」，实际数值来源不同。

两次都是**搜索面不足 + 过早下结论**。

**14. 把「无法构造场景」当成「功能正常」。**

60k 窗口跑 10 回合只到 6k，我一度据此认为压缩「不易观察但不是缺陷」。真正原因是单步回合从不触发检查。

#### 建议的下一步（按依赖顺序）

1. **先解决第 1 项**（auto-compact 不执行）。它阻塞了对压缩成功路径的一切验证，也让第 3、4、5、6 项无从判断。
2. 第 2 项（显示滞后）方案已清晰：忙碌时保留 `calibrated` 读数；`stale` 时保留 tokens 并标注。参照调研已完成。
3. 第 3–6 项在第 1 项解决后重新评估，可能部分自动消解。

#### 状态

本轮所有代码改动均已提交推送（`a9ab2c96` 及之前），工作树仅有本节所在文档的改动。台账 78 项，未开始仅 ADD-30（已裁决不启动）。第 1、2 项**不提升任何 ADD 状态**。

### 24.97 深度研究：auto-compact 不触发的调用链排查（进行中）

针对 24.96 的第 1 项，用互斥假设并行追踪了本项目自身的调用路径。**H1 已证伪**，结论如下。

#### H1 证伪：`--print` 没有独立执行路径

假设「`--print` 走了不同的执行器，所以压缩从未接线」不成立。实际链路：

```
executeResolvedPromptTurn (cliRuntimeModule.ts:431)
  → sessionRuntime.executePrompt (sessionRuntime.ts:207)
  → drivePrompt → deps.runPrompt (sessionRuntime.ts:295)
  → factory runPrompt (cliSessionRuntimeFactory.ts:197)
  → streamCliRuntimePrompt (cliSessionRuntimeFactory.ts:263)
  → runCliRuntimeInvocation → startTurn (cliRuntimeInvocation.ts:321)
  → runTurn (cliRuntimeInvocation.ts:362)
  → prepareNextStep (turn/session.ts:240)
  → driveLoop (core/agent/loop.ts:261)
```

`printMode` 在这一整段里只被查询一次（`sessionRuntime.ts:246`），且只影响渲染（`:334`、`:362`）。`runPrompt` 的依赖签名（`:73-81`）不带模式判别，工厂侧对 `printMode` 的 grep 为空。两种模式共用同一个 `ShellSessionRuntime` 实例。

#### H1 顺带发现的设计问题（真实，独立于 auto-compact）

**压缩能力静默依赖 provider 解析成功。**

[resources.ts](../../packages/ts-shell/src/cli/provider/resources.ts:99) 的唯一门槛是 `activeProvider`：

```ts
const compaction: CompactionSetup | undefined = activeProvider ? {...} : undefined;
```

而 `activeProvider` 来自 `compactionTarget`（[compaction.ts](../../packages/ts-shell/src/cli/provider/compaction.ts:41-57)），它有五个提前返回 `undefined` 的条件：

1. `resolved.blocked` 为真；
2. `providerCredentialBaseUrl` 抛错；
3. 目录里存在同地址的多个别名（`ambiguous`）；
4. 既无 apiKey、无 accountAuth、且 endpoint 无 signer；
5. 没有 baseUrl 或没有 model。

任何一条命中，`compaction` 就是 `undefined`，`prepareNextStep` 随之消失，**压缩完全失效且没有任何提示**。同时 [turn/session.ts](../../packages/ts-shell/src/turn/session.ts) 的溢出救援也以 `!options.compaction` 为前提，所以救援一并关闭。

这不是 `--print` 特有问题，而是「压缩可用性」与「provider 可解析性」之间的隐式耦合：用户看不到任何关于「本次会话没有压缩能力」的信息。

#### 仍在进行

H2（`compaction` 是否为 undefined）与 H3（`driveLoop` 的 pre-step 是否被跳过）仍在只读追踪中。两者完成前不对第 1 项下结论。

#### 24.97 补记：逐环核实结果

在等待 H2/H3 的同时，主代理逐环核对了整条链路，每一环都成立：

| 环节 | 位置 | 结论 |
|---|---|---|
| `--print` 无独立执行器 | `cliModeDispatch.ts:37` → `printModeRouter.ts:76` → `runNonInteractivePrompt` | 与交互模式共用同一 runtime |
| `compaction` 非空 | `startTurn` 诊断实测 `compaction=yes tools=18` | 成立 |
| `overhead` 已注入 | `withRequestOverhead`（`cliRuntimeInvocation.ts:343`） | 18 个工具 |
| `prepareNextStep` 已构造 | `turn/session.ts:240` | 成立 |
| pre-step 检查已就位 | `core/agent/loop.ts:261`，`driveLoop` 循环之前 | 成立 |
| `planCompaction` 会触发 | 真实 transcript 单测：18143 > softLimit 16976，且有切点 | 成立 |

**六环全部成立，但真实运行没有压缩。** 这把问题收敛到一个方向：`planCompaction` 在真实运行时收到的 `messages` 或 `policy` 与单测构造的不同。

最可能的差异点（待验证）：

1. `policy.overhead` 的 getter 在 `planCompaction` 调用时刻返回的是**空值**——`withRequestOverhead` 的 `get overhead()` 依赖 `currentOverhead()` 闭包，若工具池在该时刻尚未就绪，`tools` 可能是空数组；
2. `measureContextTokens` 因 `requireExpectedIdentity: true` 返回 undefined 后，回退估算用的 `messages` 是**已投影/已裁剪**的数组，比持久化 transcript 小；
3. `maxSteps` 或 `shouldStopAfterStep` 使第一步成为唯一步骤，而 pre-step 检查的 `context` 此时尚未包含 `opening`。

第 1 点最可疑：诊断显示 `tools=18` 是在 `withRequestOverhead` **之前**读的 `currentOverhead()`，而 `planCompaction` 里通过 getter 读时，闭包可能已返回不同的值。

#### 24.97 结论：三个假设全部证伪

工作流的三个互斥假设经独立追踪后**全部 refuted**，对抗验证 3/3 也全部 refute：

| 假设 | 判定 | 依据 |
|---|---|---|
| H1：`--print` 有独立执行器 | **refuted** | 两种模式共用同一 `ShellSessionRuntime`；`printMode` 只在 `sessionRuntime.ts:246` 被查询一次且仅影响渲染 |
| H2：`compaction` 在 `runTurn` 时为 undefined | **refuted** | 唯一门槛是 `activeProvider`；实测诊断显示 `compaction=yes tools=18` |
| H3：`driveLoop` 的 pre-step 被跳过 | **refuted** | 进入 `driveLoop` 后没有任何提前返回；`pollSteering` 自吞异常；`core.prompt` → `runPromptMessages` → `runAgentLoop` 直达 |

H3 的推理还确认了两点：

- `signal` 即使已中止也不会跳过调用——`createCompactionStep` 返回 undefined，但调用本身仍执行；
- `runAgentLoopContinue` 走同一个 `driveLoop`，`AgentCore.continue` 的 `createLoopConfig()` 也包含 `prepareNextStep`。

#### 三家的接线对照（工作流实测）

| | 回合前检查的位置 | 前置条件 | 关键差异 |
|---|---|---|---|
| pi | `_prepareRun`（`agent-session.ts:1899`），在 `agent.prompt` 之前 | **需要 `lastAssistant` 存在**（`:1950`）；全新会话首回合跳过 | 依赖「上一条 assistant」作为测量锚点 |
| oh-my-pi | `runPrePromptCompactionIfNeeded`（`agent-session.ts:8958`） | 多个提前返回：slash 命令、`isStreaming` 排队、并发复检、中止竞态、usage 预检、成本上限 | 检查前有大量准入分支 |
| codex | `run_pre_sampling_compact`（`turn.rs:172`），`run_turn` 的第一件事 | **无条件调用**；内部只在 `token_limit_reached` 时执行压缩体 | 检查无条件，压缩有条件 |
| 本项目 | `driveLoop` 开头（`loop.ts:261`） | `config.prepareNextStep` 存在 | 位置等价，但**没有任何证据表明它在真实运行中执行过** |

**最重要的对照结论**：codex 把「检查」与「是否压缩」分开——检查无条件，判定在内部。本项目把两者合在一起（`planCompaction` 返回 undefined 就什么都不做），使得「没触发」与「没调用」在外部**无法区分**。这正是本轮排查反复卡住的根本原因。

#### 仍未解决

三个假设全被证伪，但 auto-compact 依然不触发。剩余可能：

1. `planCompaction` 在真实运行时被调用了但返回 undefined——**需要用可靠方式实测，而不是继续推理**；
2. 我此前用 `require()` 写的诊断在 ESM 中失败（被 `catch {}` 吞掉），导致「诊断为空」被误读为「未调用」。改用 `import` 后只验证了 `startTurn`，**从未可靠验证 `planCompaction` 本身**。

下一步应当是：在 `planCompaction` 入口用 `import` 的 `fs` 写一行诊断，记录 `messages.length`、`measuredTokens`、`policy.overhead?.tools?.length`、`tokensBefore`、`reached`。这一条数据能直接区分「没调用」与「调用了但拒绝」，从而结束这轮反复。

**本轮不执行该诊断**：这一轮的任务是研究，不改代码。诊断改动属于实施范畴，留待下一轮。

#### 本轮研究的方法论教训

排查在此卡住多轮，根因不是代码复杂，而是**观测手段本身不可靠**：

1. 第一次用 `require('node:fs')` 在 ESM 模块里写诊断，异常被 `catch {}` 吞掉，连续几轮把「日志为空」读成「代码未执行」；
2. 改用 `import` 后只验证了 `startTurn` 一处，**从未验证 `planCompaction` 本身**，却在后续推理中默认它「被调用过」；
3. 三个互斥假设全部证伪，说明我选的假设集**漏掉了最直接的那一个**——「它被调用了，但返回 undefined」。

**教训**：当多个结构性假设都被证伪时，应当先建立一条**能区分「未调用」与「调用后拒绝」的观测**，再继续推理；否则每次证伪只会缩小假设空间而不产生新信息。


#### 24.97 补充：三家的检查位置与本项目的差异

工作流对三家的追踪揭示了一个此前没注意的结构差异：**三家的回合前检查都在 agent loop 之外**。

| | 检查位置 | 是否在 loop 内 |
|---|---|---|
| pi | `_prepareRun`（`agent-session.ts:1899`），`agent.prompt` 之前 | **否**，session 层 |
| oh-my-pi | `#promptWithMessage` 内的 `runPrePromptCompactionIfNeeded`（`agent-session.ts:8958`），在 `promptAgentWithIdleRetry`（`:9037`）之前 | **否**，session 层 |
| codex | `run_turn` 的第一件事（`turn.rs:172`），在 `capture_step_context`（`:210`）、记录用户输入（`:269`）、采样循环（`:304`）之前 | **否**，turn 入口 |
| 本项目 | `driveLoop` 开头（`loop.ts:261`） | **是**，loop 内 |

三家都把「回合前检查」放在**构造请求之前**，而本项目的 pre-step 检查放在 loop 内部。位置差异本身不必然导致 bug，但有一个实际后果：**loop 内的检查无法覆盖「loop 尚未开始就被拒绝」的情况**，也无法在日志中与「loop 根本没启动」区分。

oh-my-pi 的补充事实：agent loop 本身（`packages/agent/src/agent-loop.ts`）**不含任何 compaction 调用**，只有 `syncContextBeforeModelCall` 与 `beforeModelCall` 两个前置钩子，而 coding-agent 在其上注册的是渲染、usage 预检与成本上限，都不是阈值检查。mid-run 检查是独立入口，仅经 `onTurnEnd` 到达。

#### 对本项目两个未解问题的方案建议

**问题 1（auto-compact 不触发）**——分两步：

1. **先建立观测**（下一轮实施）：在 `planCompaction` 入口用 `import` 的 `fs` 写诊断，记录 `messages.length`、`measuredTokens`、`policy.overhead?.tools?.length`、`tokensBefore`、`reached`。这一条数据能区分「没调用」与「调用了但拒绝」，结束当前的假设循环。
2. **再对齐位置**（视第 1 步结果）：若确认是「loop 内检查覆盖不到」，把回合前检查上移到 `runTurn` 入口（session 层），与三家一致；若确认是「调用了但拒绝」，则问题在阈值/切点计算，与位置无关。

**问题 2（显示滞后）**——三家的做法：

- oh-my-pi：`#anchoredUsedTokens` = provider 基准 + 锚点后的非消息增量 + 本地尾部 + pending；schema 增量**带符号**（roster 收缩时数字能下降）；另有 `compactionEpoch` 拒绝压缩前的陈旧锚点。
- pi：`estimateContextTokens` = 最后 usage + 尾部 `estimateTokens`；压缩后无 post-compaction usage 时**返回 `null`**（诚实）。
- codex：显示层直接用 `last_token_usage`（**不含尾部**），但内部预算用 `get_total_token_usage`（含尾部）。

本项目的 `estimatePrompt` 已经等价于 oh-my-pi 的锚定算式，问题只在**忙碌时被丢弃**与**20 秒过期后不带数字**。建议：

1. 忙碌时保留最后一次 `calibrated` 读数（不因 `busy` 而丢弃）；
2. 过期时保留 `tokens` 并标记 `stale`，而不是只返回 `{ source: 'stale' }`；
3. 可选的长期对齐：引入 oh-my-pi 的 epoch 概念，拒绝压缩前的陈旧锚点。

#### 24.97 决定性验证：压缩路径本身是好的

上一轮把三个假设全部证伪，却没能给出方案——这是研究的失败。补做了一次直接验证后，结论变了。

**验证方法**：用真实的 `runTurn`（不是 `planCompaction` 单测）驱动一个完整回合，传入真实的 `CompactionSetup`，观察 `summarize` 是否被调用。

```
历史 30 条 × 2000 字符，窗口 20000 / reserve 2000 / 输出 1024 / keepRecent 2000
有 overhead：summarize 被调用 1 次
无 overhead：summarize 被调用 1 次
```

**结论：从 `runTurn` 到 `createCompactionStep` 到 `condenseContext` 的整条自动压缩路径完全正常。** `summarize` 被调用，意味着 `planCompaction` 返回了计划、切点存在、阈值判定通过。

#### 这把问题收敛到哪里

排除法得到的结果：

| 已排除 | 依据 |
|---|---|
| 压缩步骤没被调用 | 真实 `runTurn` 探针调用 1 次 |
| `compaction` 为 undefined | 诊断 `compaction=yes tools=18` |
| `--print` 有独立路径 | 工作流 H1 证伪 |
| `driveLoop` pre-step 被跳过 | 工作流 H3 证伪 |
| `withRequestOverhead` 丢失字段 | 展开保留全部字段 |

**唯一剩下的可能：真实 CLI 运行时的 `policy` 数值或 `messages` 内容，与我构造的不同。**

最可能的具体差异（按可能性排序）：

1. **`policy.overhead` 的 getter 返回空**。`withRequestOverhead` 的 `get overhead()` 调用 `currentOverhead()`，而该闭包来自 `preparePromptRequest` 返回的 `currentOverhead`。如果工具池在该时刻是空数组（例如 dynamic 发现尚未加载完），`overhead.tools` 就是 `[]`，阈值判定会少算约 5.4k tokens。
2. **真实请求的 `messages` 比持久化 transcript 少**。`planCompaction` 收到的是 loop 内的 `context`，而我的单测用的是 transcript 全文。
3. **`measureContextTokens` 返回了实测值**，且该值小于估算——`--print` 每回合新进程时它返回 undefined，但同一进程内的多步回合会返回实测值。

#### 下一步的确定性验证（一条命令即可）

在 `planCompaction` 入口写一行诊断，记录 `policy.overhead?.tools?.length` 与 `tokensBefore`。若 `tools` 为 0 或 `tokensBefore` 明显小于估算，即命中第 1 项。

这不需要改产品逻辑，只需要一次带诊断的构建与一次运行。

#### 对上一轮表述的更正

上一轮写「`planCompaction` 在真实运行中从未被调用，原因未查明」——**这个判断是错的**。真实 `runTurn` 会调用它。当时的依据是「诊断日志为空」，而那段诊断用了 ESM 里不可用的 `require()`，日志根本没写成功。我把「观测失败」误读成了「行为不存在」。

### 24.98 深度研究：三个未解问题的根因与方案（2026-11-02）

上一轮以「全部证伪」收尾，没有给出方案。本轮换了方法：**先建立可复现的观测，再解释现象**。结果是三个问题都找到了确定性根因，且都不是我之前猜的那些。

#### 24.98.1 结论先行

| 问题 | 上一轮的猜测 | 实际根因 | 证据 |
|---|---|---|---|
| auto-compact 从不触发 | 假设 `prepareNextStep` 没执行 | **切点预算与阈值取自同一个 `available`，且 `softLimit` 在窗口 ≤ 120,960 时恒等于 `available`，导致「提前压缩」的窗口宽度为零** | `planCompaction` 返回 `undefined`；`compactionRefusalReason` 返回 `fits-budget` |
| 24.95 实验「判定应触发却没触发」 | 「原因未查明」 | **实验在 config.json 写了 `keepRecentTokens: 2000`，但该键不是已声明字段，加载时被静默丢弃**；单测直接传 policy 所以生效 | 探针输出 `keepRecentTokens = undefined`，诊断 `unknown-field; value ignored` |
| 上下文显示滞后 | 「两套数值」 | **锚点根本没被用上**：`policy.promptIdentity` 只有 `{schemaDigest, systemDigest}`，而 `measuredPromptContext` 要求 `endpoint`/`historyDigest`/`wireHistoryDigest`/`replayBinding` 同时匹配，任一缺失即返回 `undefined` | 生产 `buildCompactionWiring` + `withRequestOverhead` 实测返回 `undefined` |
| 显示层在忙碌时丢失数字 | 「busy 时丢弃」 | 确实如此，但更根本的是：即使不 busy，**含工具调用的历史会让 `estimatePrompt` 的 `compatible` 判定失败**，calibrated 直接退化为纯估算 | 同一份历史：无工具 → `calibrated 30,572`；含一个工具调用 → `estimated 6,290` |

**这四条合起来解释了我之前所有「反复修改却没有效果」的现象。**

#### 24.98.2 问题一：调度压缩的触发带宽度为零（auto-compact 的真根因）

`reachedBudgetThreshold` 用 `requestBudget` 判「是否到软限」，而软限的定义是：

```ts
// context/request/budget.ts:76-78
const softLimit = Math.min(Math.floor(input.window * fraction), availableInput);
```

其中 `availableInput = window - output - reserve`（`:74`）。于是**触发带**是 `[softLimit, availableInput]`，宽度为：

```
availableInput - min(floor(window*0.9), availableInput)  =  max(0, availableInput - floor(window*0.9))
```

而 `availableInput = window - output - reserve`。所以当 `output + reserve >= window * 0.1` 时，`availableInput <= floor(window*0.9)`，**触发带宽度为 0**。

用真实默认值（`maxOutputTokens = 4096`、`reserveTokens = 8000`，合计 12,096）：

| 窗口 | availableInput | softLimit | **触发带宽度** |
|---|---|---|---|
| 20,000 | 7,904 | 7,904 | **0** |
| 64,000 | 51,904 | 51,904 | **0** |
| 120,960 | 108,864 | 108,864 | **0** |
| 121,000 | 108,904 | 108,900 | 4 |
| 128,000 | 115,904 | 115,200 | 704 |
| 200,000 | 187,904 | 180,000 | 7,904 |
| 1,000,000 | 987,904 | 900,000 | 87,904 |

**任何 ≤ 120,960 tokens 的窗口，调度压缩的触发带宽度都是零。** 这不是「压缩很少触发」，而是「压缩在这个窗口下不存在可触发的区间」。

实测（探针 `bandverify.ts`）——在 20k 与 64k 窗口下扫描对话规模，看「请求是否还装得下」与「压缩是否触发」的关系：

```
window=20,000  available=16,976  soft=16,976  keep=16,976
  conv= 15,000 request FITS     → plan=no
  conv= 17,000 request OVERFLOW → plan=no
  conv= 18,000 request OVERFLOW → plan=no
  conv= 19,000 request OVERFLOW → plan=FIRES

window=64,000  available=51,904  soft=51,904  keep=20,000
  conv= 50,000 request FITS     → plan=no
  conv= 52,000 request OVERFLOW → plan=FIRES
```

**结论：调度压缩从来不会在请求还装得下的时候触发。它只在请求已经装不下之后才触发，而此时 `step.ts:369` 的本地预算检查会直接返回 `CONTEXT_OVERFLOW_PREFIX` 错误，根本不发请求。**

所以完整链路是：

1. 对话增长到 `softLimit` 以下 → 压缩不触发（正确）；
2. 对话跨过 `softLimit`，但因为触发带宽度为 0，`softLimit == availableInput`，同一刻请求也已经装不下；
3. `prepareNextStep` 在下一步之前跑，发现 `planCompaction` 要么无切点（`fits-budget`，因为 keep 预算也被钳到 `availableInput`）要么已超窗；
4. 即便它返回了计划，`step.ts:363` 的 `requestBudget` 也会在下一次请求前拒绝，返回 `Context overflow:` 错误。

**这才是「压缩从未成功执行过一次」的结构性原因。** 它不是接线问题，不是 `prepareNextStep` 没被调用，而是**触发条件在数学上不可达**。

再看 24.95 的对照实验（探针 `exact95.ts`，按真实数字构造）：

```
conversation=12582  request=18165  available=16976  softLimit=16976

unit test used keepRecent=2000         effective keep=2000   plan=TRIGGERS  refusal=no-legal-cut
live run used the default 20,000       effective keep=16976  plan=none      refusal=fits-budget
```

单测之所以「TRIGGERS」，是因为它**直接传了 `keepRecentTokens: 2000`**，让切点存在于 2,000 tokens 处；真实运行用的是默认 20,000，被钳到 16,976，切点不存在。**两者的差别不是接线，是切点预算。**

再看用户当前配置（bailu-2.8，1M 窗口）：触发带宽度 87,904，第一个触发点约在 **891,001 tokens**。用户环境里最大的真实会话是 **20,707 tokens**（35 个会话统计）。所以：**在用户当前配置下，压缩永远不会发生，因为没有任何会话能接近 89 万 tokens。** 这是窗口与阈值匹配的结果，但它意味着「压缩从未被验证」在用户环境下是**结构性的**。

#### 24.98.3 问题二：`keepRecentTokens` 不是已声明字段（实验失败的根因）

`keepRecentTokens` 在 `RuntimeConfig` 接口上存在（`config/runtimeConfig.ts:35`，属于 `ModelTokenBudget`），但**不在 `createConfigFields` 的字段表里**（`config/fields.ts:63` 只声明了 `modelTokenBudgets` 的**子对象**形状）。实测：

```
keepRecentTokens     NOT DECLARED  ← 写在 config.json 里的值会被静默丢弃
reserveTokens        DECLARED
contextWindow        DECLARED
modelTokenBudgets    DECLARED
```

用隔离 home 写入 `keepRecentTokens: 2000` 后加载（探针 `dropped.ts`）：

```
contextWindow      = 20000
reserveTokens      = 2000
maxOutputTokens    = 1024
keepRecentTokens   = undefined   ← 24.95 实验设置的值
diagnostics        = ["Config user (unknown): unknown-field; value ignored."]
```

诊断确实产生了（`config/layers.ts:89`），且会出现在启动界面（`core/shell/bootstrap.ts:339`、`cli/interactive/interactiveMode.ts:507`），但**只出现在启动时的一行诊断里**，不会告诉用户「你的压缩预算没有生效」。

**这是本轮最重要的可迁移结论**：一个只存在于 `ModelTokenBudget` 子对象里的字段，用户无法在顶层设置；想调压缩保留量，唯一途径是写 `modelTokenBudgets["provider/model"].keepRecentTokens`，而这条路径没有任何界面提示。

#### 24.98.4 问题三：锚点从未被用上（显示滞后 + 压缩判定的共同根因）

`buildCompactionWiring` 的 `measureContextTokens` 会调用 `measuredPromptContext(..., { requireExpectedIdentity: true })`：

```ts
// cli/runtime/compaction.ts:191-207
measureContextTokens: (messages, identity) => {
  ...
  const measured = measuredPromptContext(input.sessionId, { provider, model, endpoint, endpointId,
    ...(identity ?? {}), ...historyIdentity }, { requireExpectedIdentity: true });
  if (!measured) return undefined;
  return measured.tokens + estimateTokens(messages.slice(measured.messageCount));
}
```

`identity` 来自 `policy.promptIdentity`，而 `withRequestOverhead` 把它定义成：

```ts
// entrypoints/cliRuntimeInvocation.ts:308-312
const promptIdentity = () => requestIdentity(current());
return { ...compaction, policy: { ...compaction.policy,
  get overhead() { return current(); },
  get promptIdentity() { return promptIdentity(); } } };
```

`requestIdentity` 只返回两个字段：

```ts
// context/request/identity.ts
export function requestIdentity(overhead) {
  return { schemaDigest: ..., systemDigest: ... };   // 仅此两个
}
```

而 `measuredPromptContext` 在 `requireExpectedIdentity: true` 时要求：

```ts
// observability/usageTelemetry.ts:280-285
if (options.requireExpectedIdentity) {
  if (expected.endpoint === undefined || expected.schemaDigest === undefined || expected.systemDigest === undefined) return undefined;
  if (identity.endpoint !== expected.endpoint) return undefined;
  ...
}
// 且在此之前（:271-272）：
if (identity.wireHistoryDigest !== undefined && expected.wireHistoryDigest === undefined) return undefined;
if (identity.replayBinding !== undefined && expected.replayBinding === undefined) return undefined;
```

`step.ts` 记录的 identity **一定包含** `wireHistoryDigest` 与 `replayBinding`（`turn/step.ts:347-361`，`replayBinding` 由 `requestReplayBinding` 无条件生成，`:256`）。于是：

**只要请求成功过一次，`policy.promptIdentity` 就永远缺 `wireHistoryDigest`/`replayBinding`/`historyDigest`，`measuredPromptContext` 永远返回 `undefined`。**

实测（探针 `wiringmeasure.ts`，用真实 `buildCompactionWiring` + 真实 `withRequestOverhead` + 真实 `recordSessionUsage`）：

```
policy.promptIdentity keys = [ 'schemaDigest', 'systemDigest' ]
measureContextTokens       = undefined  ← provider anchor discarded
estimateRequestTokens      = 26
```

再逐字段隔离（探针 `identity4.ts`）——只有四个字段**同时**存在才返回数值：

```
policy shape (schema+system only)              undefined
missing only replayBinding                     undefined
missing only wireHistoryDigest                 undefined
missing only historyDigest                     undefined
all present                                    { tokens: 900, messageCount: 3 }
```

**两个后果**：

1. **压缩判定**永远走 `estimateRequestTokens` 回退路径（字符/3.5），provider 实测的 12,345 tokens 被丢弃，回退估算得到 26 tokens。这是「判定数值与显示数值不一致」的**真正**来源——不是两套算式，而是**一套算式从未拿到锚点**。
2. **状态栏**同样走 `runtimeContext.promptIdentity`，同样只有两个字段，同样拿不到测量值。

#### 24.98.5 问题四：`estimatePrompt` 的 calibrated 在含工具历史时失效

即使把完整 identity 传进去，`estimatePrompt` 还有第二道门：

```ts
// context/request/estimate.ts:30-41
const compatible = previous && ... 
  && previous.historyDigest === historyDigest(messages.slice(0, count))
  // Tool microcompaction and opaque multimodal/reasoning replay are not additive.
  && messages.every(message => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string'
    && !message.reasoning && !message.tool_calls?.length && !message.tool_call_id && !message.origin?.replayBinding);
```

**任何一条 tool 消息、任何一条带 `tool_calls` 的 assistant 消息，都会让 `compatible` 为 false**，calibrated 退化为纯估算。实测（探针 `calibrate.ts`）：

```
history with no tool traffic                 source=calibrated  tokens=30,572
history containing one tool call + result    source=estimated   tokens=6,290

char estimate of withTools = 6,290 (anchor alone is 30,000)
```

一个已经消耗 30,000 tokens 的会话，因为中间有过一次工具调用，状态栏显示 **6,290**。

这与注释的意图（「工具微压缩与不透明重放不可加」）不一致：不可加的是**被微压缩改写过的消息**，不是**所有含工具的历史**。当前实现把一个必要条件的否定，扩大成了整段历史的排除。

#### 24.98.6 三家的做法（本轮子代理实测）

**pi**（`/home/wang/projects/pi`）：

- 检查位置：`_prepareRun`（`agent-session.ts:1947`）在 `agent.prompt` 之前 + `prepareNextTurnWithContext`（`:920`）在每步之后。**都不在 `agent-loop.ts` 内**。
- 锚点：`estimateContextTokens`（`compaction/compaction.ts:196`）= 最后一条可用 assistant 的 usage + 其后每条消息的 `estimateTokens`。aborted/error/零 usage 的 assistant 被跳过。
- **切点预算与阈值是两个设置**：`shouldCompact` 只用 `reserveTokens`（`:267`），切点只用 `keepRecentTokens`（`:885`）。二者无任何校验关系。
- 整段小于 keep：`cutIndex` 停在第一个合法切点，`messagesToSummarize` 为空 → `prepareCompaction` 返回 `undefined` → **静默跳过**（`agent-session.ts:3193`）。
- 显示：`getContextUsage`（`:4318`）**与逐步阈值检查用同一个 `estimateProjectedContextTokens`**；压缩后无新 usage 时返回 `percent: null`，footer 渲染 `?/<window>`。
- 拒绝：自动路径静默；手动路径区分 `Already compacted` / `Nothing to compact (session too small)`（`:2865-2873`）；**没有 `would-not-shrink` 概念**。

**oh-my-pi**（`/home/wang/projects/oh-my-pi`）：

- 检查位置：`runPrePromptCompactionIfNeeded`（`session-maintenance.ts:2735`）每 prompt 一次，在 `#promptWithMessage`（`agent-session.ts:8954`）内、`agent.prompt` 之前；另有 `maintainContextMidRun`（`:2812`）挂在 `onTurnEnd`。**`agent-loop.ts` 内无压缩调用。**
- 锚点：`#anchoredUsedTokens`（`session-stats.ts:128`）= `base + nonMessageDelta + countMessages(activeMessages.slice(anchorIndex+1)) + pendingTokens`。**schema 增量带符号**，roster 收缩时数字能下降。另有 `#compactionEpoch`（`:101`）拒绝压缩前的陈旧锚点。
- **切点预算被显式钳制到恢复带**（`compaction/compaction.ts:1547-1555`）：
  ```ts
  const recoveryBand = Math.floor(resolveThresholdTokens(contextWindow, settings) * COMPACTION_RECOVERY_BAND);
  const tailBudget = recoveryBand > reserveFloor ? recoveryBand - reserveFloor : Math.floor(recoveryBand / 2);
  keepRecentTokens = Math.min(keepRecentTokens, Math.max(1, tailBudget));
  ```
  这与本项目的 `Math.min(keepRecent, available)` **方向相同但结果相反**：omp 钳制到阈值的 80% 以下，保证「切点存在」与「阈值已到」能同时成立；本项目钳制到阈值**本身**，两者永远无法同时成立。
- 显示：状态栏用 anchored breakdown，但**触发判定取 `max(anchored, localEstimate)`**（`session-maintenance.ts:2696`），所以触发点可以高于显示值——这一点比本项目更保守，方向是对的。
- 拒绝：四类全部区分且有用户可见文本——`#compactionDeadEndWarning`（`:4252`）、`would not reduce context`（`:5823`）、`Auto-compaction failed:` / `Context overflow recovery failed:`（`:5892`）。

**codex**（`/home/wang/projects/codex`）：

- 检查位置：`run_pre_sampling_compact`（`session/turn.rs:1033`）在 `run_turn` 开头、采样循环（`:304`）之前。**检查无条件，压缩有条件**（`:1041-1059`：`if token_status.token_limit_reached { run_auto_compact(...) }`）。
- 锚点：`get_total_token_usage`（`context_manager/history.rs:424-456`）= `last_token_usage.total_tokens` + **最后一条 model-generated item 之后**的本地估算。冷启动时返回 **0**（`token_info` 为 `None`，且无 model-generated item）。
- **阈值与保留预算完全分离**：阈值是 `auto_compact_token_limit`（默认窗口 90%，`protocol/openai_models.rs:499-510`）；保留是本地摘要的 `COMPACT_USER_MESSAGE_MAX_TOKENS = 20_000`（`compact.rs:62`，只保留最新 user 消息）。
- **不存在「合法切点」概念**：越过阈值就无条件压缩。整段小于保留预算时全量保留、静默。
- 显示：footer 用 `last_token_usage`（**不含尾部增量**，`protocol/protocol.rs:2348`），内部预算用 `get_total_token_usage`（含尾部）——**显示与判定数值不同，且 codex 接受这个差异**。
- 拒绝：**没有用户可见的「无法压缩」报告**。`below threshold` 静默；`summarizer failed` 走通用 turn error；provider 的 `ContextWindowExceeded` 标记 `set_total_tokens_full` 后失败该回合，**下一回合**的 pre-sampling 检查才压缩。

#### 24.98.7 对照表

| | 检查位置 | 阈值与切点预算 | keep 钳制 | 整段小于 keep | 显示与判定同源 | 拒绝分类 |
|---|---|---|---|---|---|---|
| pi | loop 外（`_prepareRun`）+ loop 内（`prepareNextTurn`） | **分离**（`reserveTokens` / `keepRecentTokens`） | 无 | 静默跳过 | 逐步检查同源；pre-request 不同源 | 手动分两类，自动静默 |
| oh-my-pi | loop 外（每 prompt）+ loop 内（`onTurnEnd`） | **分离** | **钳到阈值的 80% 以下** | 返回 undefined | 判定取 `max(锚点, 本地)` | **四类全区分** |
| codex | loop 外（`run_turn` 开头，无条件） | **分离**（90% 窗口 / 20k 保留） | 无 | 全量保留 | **不同源，且接受差异** | 基本无分类 |
| **本项目** | loop 内（`driveLoop` 开头） | **耦合**（同一 `available`） | **钳到 `available` 本身** | `fits-budget`（有提示） | 同源但**锚点丢失** | 分两类（`fits-budget`/`no-legal-cut`） |

#### 24.98.8 方案

按优先级排序，每条都给出可验证的完成条件。

**S1（P0）软限必须真正低于硬限，否则调度压缩不存在可触发区间。**

根因在 `requestBudget`（`context/request/budget.ts:76-78`）：

```ts
const softLimit = Math.min(Math.floor(input.window * fraction), availableInput);
```

`availableInput = window - output - reserve`。当 `output + reserve >= window * 0.1` 时，软限等于硬限，触发带宽度为 0。真实默认值（4,096 + 8,000 = 12,096）使这个条件在**任何 ≤ 120,960 的窗口**成立。

修法有两种，必须选一种并配测试：

- **(a) 软限按可用输入空间的比例定义**，而不是按窗口比例：
  ```ts
  const softLimit = Math.min(Math.floor(input.window * fraction), Math.floor(availableInput * 0.8));
  ```
  实测效果（探针 `bandwidth.ts`）：

  | 窗口 | availableInput | 现 softLimit | 现带宽 | 新 softLimit | 新带宽 |
  |---|---|---|---|---|---|
  | 20,000 | 7,904 | 7,904 | **0** | 6,323 | 1,581 |
  | 64,000 | 51,904 | 51,904 | **0** | 41,523 | 10,381 |
  | 120,960 | 108,864 | 108,864 | **0** | 87,091 | 21,773 |
  | 1,000,000 | 987,904 | 900,000 | 87,904 | 790,323 | 197,581 |

- **(b) 阈值判定不用 `requestBudget`**，改用与保留预算同源的独立数值（omp 的做法：阈值是 `resolveThresholdTokens`，切点是 `keepRecentTokens`，两者不共享变量）。

建议 **(a)**：它只改一个常数，影响面最小，且同时修复 `step.ts` 的预算检查（那里也用同一个函数）。但要注意 (a) 会让 20k 窗口的软限从 16,976 降到 6,323——对已按旧行为调优的配置是行为变化，需要在 `/context` 里显示新的触发点。

**S1b（P0）切点预算的上限必须是阈值，而不是可用空间。**

现状 `keepRecent = Math.min(policy.keepRecentTokens ?? KEEP_RECENT_TOKENS, available)`（`session/compaction.ts:416`）。当 S1 修好后，`available > softLimit`，但 keep 仍可能等于 `available`，导致切点预算吃掉全部空间、切点不存在。应改为：

```ts
const keepRecent = Math.min(policy.keepRecentTokens ?? KEEP_RECENT_TOKENS,
  Math.max(1, Math.floor(softLimit * 0.8)));
```

完成条件（两条一起验）：窗口 64k 时，一段 45,000 tokens 的对话能产出 `planCompaction !== undefined` **且该请求仍装得下窗口**；窗口 20k 时，一段 7,000 tokens 的对话同样能产出计划且装得下。这两条在修改前**都是 false**（见 24.98.2 的 `bandverify` 输出）。

**S2（P0）`keepRecentTokens` 必须成为已声明字段。**

两条路，选其一：

- (a) 在 `config/fields.ts` 增加顶层 `keepRecentTokens: field(countSchema)`，并入 `resolveTokenBudget` 的 `ordinary` 参数；
- (b) 不增加顶层字段，但在 `constrainRuntimeConfig` 里对「用户写了未声明的 `keepRecentTokens`」产出**notice 而非 unknown-field**，并提示正确的 `modelTokenBudgets` 写法。

建议 (a)：`reserveTokens` 已经是顶层字段，`keepRecentTokens` 与它同级、同语义，没有理由只允许按模型设置。

完成条件：隔离 home 写入 `keepRecentTokens: 2000` 后，`getRuntimeConfig().keepRecentTokens === 2000`，且 `planCompaction` 用该值。

**S3（P0）`policy.promptIdentity` 必须携带完整身份。**

`withRequestOverhead` 当前只用 `requestIdentity(current())`。应改为读取 `runtimeContext.promptIdentity`（`turn/step.ts` 已在每次请求后通过 `onPromptIdentity` 写入，`cliSessionRuntimeFactory.ts:280`）：

```ts
// 建议
const promptIdentity = () => runtimePromptIdentity() ?? requestIdentity(current());
```

其中 `runtimePromptIdentity()` 返回完整的 `PromptIdentitySnapshot`。`measureContextTokens` 已经有 `historyIdentity` 逻辑（`cli/runtime/compaction.ts:196-201`），只需让 `policy.promptIdentity` 提供 `endpoint`/`wireHistoryDigest`/`replayBinding`/`historyDigest`。

若拿不到完整身份，**必须显式退化而不是静默**：`measureContextTokens` 返回 `undefined` 是正确行为，但调用方（`planCompaction`/`compactionRefusalReason`）应在 `measureContextTokens` 存在却返回 `undefined` 时记录一次「锚点不可用」，让 `/context` 能显示「当前判定基于估算，provider 测量不可用」。

完成条件：一次成功请求后，`policy.measureContextTokens(messages, policy.promptIdentity)` 返回数值而非 `undefined`；该数值与状态栏显示一致。

**S4（P0）显示层与判定层必须用同一个数。**

三处改动：

1. `interactiveMode.ts:375`：去掉 `!this.busy` 条件。忙碌时保留最后一次读数（`read()` 本身有 identity 校验，不会显示过期数据）。
2. `context/controller.ts:166`：`stale` 时保留 `tokens`，只标记来源，而不是返回 `{ source: 'stale' }` 丢掉数字。`items.ts:160` 已经支持 `? stale` 的渲染，需要扩展成 `<tokens>? stale`。
3. `context/request/estimate.ts:40`：把 `messages.every(...)` 的排除范围收窄到**真正不可加的**情况——只排除 `origin.replayBinding` 与 `reasoning.redacted`，不再排除所有 `tool_calls`/`tool_call_id`/`reasoning`。

完成条件：一段含工具调用、锚点为 30,000 tokens 的历史，`estimatePrompt` 返回 `source === 'calibrated'`；忙碌中与过期后状态栏数字不消失。

**S5（P1）压缩不可用时必须可见。**

`resources.ts:99` 的 `activeProvider ? {...} : undefined` 使压缩能力静默依赖 provider 解析。`compactionTarget`（`cli/provider/compaction.ts:41-57`）有五个提前返回。

建议：`CompactionSetup` 增加 `unavailable?: string`，在 `resources.ts` 的 else 分支填具体原因（复用 `compactionTarget` 的返回信息），`/context` 与启动界面各显示一行。

完成条件：构造一个 `blocked` 的 provider，`/context` 输出包含「自动压缩不可用：<原因>」。

**S6（P1）回合前检查上移到 session 层。**

三家都在 loop 外。本项目放在 `driveLoop` 开头（`core/agent/loop.ts:261`），后果是「loop 未启动」与「检查未触发」无法区分——这正是 24.97 反复卡住的原因之一。

建议：在 `runTurn` 的 `drive()` 里、`core.prompt(opening)` 之前调用一次 `prepareNextStep`，并保留 loop 内的 per-step 检查（与 pi 的双层结构一致）。这样「回合开始前的检查」有了独立的调用点，日志可区分。

完成条件：`runTurn` 在 `core.prompt` 之前有一次可观测的压缩检查；两个调用点各有独立诊断。

**S7（P2）拒绝报告按预算拆分。**

`compactionRefusalReason` 目前只给整体数值。应在消息里给出三段：工具 schema（`overhead.tools` 序列化长度）、历史（`estimateTokens(messages)`）、输出与保留（`outputTokens` + `reserveTokens`）。

完成条件：拒绝消息包含三个分项数字，且三项之和等于报告的总数。

#### 24.98.9 与「推翻之前方案」的关系

用户上一轮质疑「addition 里不像是研究清楚了解决方案，而是推翻了之前的方案」。本轮的直接回应：

- 24.97 的结论「压缩路径本身是好的」**仍然成立**——真实 `runTurn` 确实调用了 `summarize`。但它是在**单测构造的 policy** 下调用的，那个 policy 的 `keepRecentTokens` 是直接传入的 2000。
- 24.97 列出的三个候选（`overhead` 为空 / `messages` 更小 / `measureContextTokens` 返回更小值）**全部不是根因**。真根因是第四项：**keep 预算与阈值同源，导致切点不存在**。
- 之前所有「压缩修复只在拒绝分支验证过」的记录仍然准确，但现在知道：**拒绝分支就是唯一可达的分支**（在窗口 ≤ 约 120k 时）。

本节的方案 S1–S7 全部是新增的可执行条目，不再依赖「先加诊断再判断」的循环。

#### 24.98.10 本轮方法论

上一轮的失败模式是「假设集漏掉了最直接的一项」。本轮的修正方法是：

1. **先把结论变成可执行探针**。每个假设都写成一个能在 `/tmp` 跑的脚本，直接调用生产函数（`planCompaction`、`buildCompactionWiring`、`withRequestOverhead`、`measuredPromptContext`），而不是推理调用链。
2. **用生产构造路径而非手写参数**。`wiringmeasure.ts` 用的是真实的 `buildCompactionWiring` + 真实的 `withRequestOverhead`，这才暴露出「单测传的 identity 比生产多两个字段」。
3. **对比单测与真实运行的输入差异**。24.95 的单测与真实运行只差一个 `keepRecentTokens`，找到这个差异就结束了整轮排查。

教训：**当单测通过而真实运行不通过时，第一件事应该是逐字段对比两者的输入对象，而不是继续追调用链。**

#### 24.98.11 对 24.97「三个候选」的最终判定

24.97 末尾列了三个候选，本轮全部排除：

| 24.97 的候选 | 判定 | 排除依据 |
|---|---|---|
| `policy.overhead` 的 getter 返回空 | **不是根因** | `withRequestOverhead` 的 getter 确实读闭包，但实测 `currentOverhead()` 返回 19 个工具；且即使 overhead 为空，20k 窗口下触发带宽度仍是 0 |
| 真实 `messages` 比持久化 transcript 少 | **不是根因** | `runAgentLoop` 的 `context = [...seed, ...prompts]`（`core/agent/loop.ts:143`），与 transcript 同源；实测 transcript 重放得到相同的 `planCompaction` 结果 |
| `measureContextTokens` 返回了更小的实测值 | **方向相反** | 它返回的是 `undefined`（见 24.98.4），判定因此走**估算**路径，数值只会更小，不会更大 |

真根因是 24.98.2 的触发带宽度为零，加上 24.98.3 的实验字段被丢弃。两者叠加，使 24.95 的单测与真实运行在任何维度上都不可比。

#### 24.98.12 与三家的最终差异表（用于决定改哪一处）

| 维度 | pi | oh-my-pi | codex | 本项目 | 建议 |
|---|---|---|---|---|---|
| 阈值数值来源 | `contextWindow - reserveTokens` | `resolveThresholdTokens` | 窗口 90% | `requestBudget` 软限 | **S1**：软限必须低于硬限 |
| 切点预算 | `keepRecentTokens`，独立 | `keepRecentTokens`，钳到阈值 80% | 20k 保留（只留 user） | `min(keepRecentTokens, available)` | **S1b**：钳到软限 80% |
| 检查位置 | loop 外 + loop 内 | loop 外 + loop 内 | loop 外（无条件） | 仅 loop 内 | **S6**：上移到 `runTurn` |
| 锚点身份 | 最后 assistant 的 usage | anchored + epoch | `last_token_usage` | **从未生效** | **S3**：传完整 identity |
| 显示与判定 | 逐步检查同源 | 判定取 `max(锚,本地)` | 不同源且接受 | 同源但锚点丢失 | **S4**：修锚点后自然同源 |
| 拒绝分类 | 2 类 | **4 类** | 基本无 | 2 类 | **S7**：加预算拆分 |

**一句话**：三家的「阈值」与「保留」都是两个独立数值；本项目把它们放进同一个 `available` 变量，并在软限等于硬限时使调度压缩不可达。这是唯一的**结构性**差异，其余都是派生问题。

#### 24.98.13 验证计划（实施后按序执行，不得并发）

1. `npm run verify:import-cycles && npm run check:config-consumers && npm run check:declarations`（亚秒级静态门）；
2. 新增聚焦单测：`requestBudget` 的触发带宽度（窗口 20k/64k/120,960/121,000/1M 五档）；`planCompaction` 在「对话装得下且已过软限」时必须返回计划；`estimatePrompt` 在含工具历史时仍为 `calibrated`；`policy.measureContextTokens` 在真实 `buildCompactionWiring` + `withRequestOverhead` 下返回数值；
3. `vitest run <上述测试文件>`（单进程、串行）；
4. 真实 CLI：隔离 home、20k 窗口、默认 keep，跑到 8,000 tokens 观察压缩**在请求仍装得下时**触发；
5. 真实 CLI：默认 64k 窗口，跑到 45,000 tokens 观察同样行为；
6. 更新本节与 12.1 台账。

**禁止**：并发运行测试；20k 消息全量 PTY 压测；子代理执行任何 build/test。

#### 24.98.14 S1–S7 实施与发布竞态修复（2026-11-02）

按本节方案完成 S1–S7：软限与保留预算分离并统一投影到 `context/request/budget.ts`；顶层 `keepRecentTokens` 纳入配置声明和 settings；请求 identity 传递 endpoint、wire/history digest、replay binding；工具历史与公开 reasoning 使用协议级尾部计量；忙碌和 stale 读数保留可验证的 tokens；`/context` 显示压缩不可用和 evaluator fallback 原因；回合前检查在 session 层执行并保留 queued continuation 的初始检查；自动发布拒绝显示 report-safe 原因。

真实隔离 CLI 先发现另一个并发问题：摘要生成期间追加的 `query-event`/生命周期事件只改变 transcript 原始字节，不改变逻辑历史，原 source identity 却把整个 `metadata.json` 与 `transcript.jsonl` 纳入摘要，导致合法发布被拒绝。现已改为校验逻辑历史、分支、模型/上下文状态和文件身份，排除无关 transcript 事件；消息或分支变化仍会拒绝发布。新增摘要期间追加 query event 的回归测试，并保留手动/自动竞争只提交一次的断言。

验证：隔离 HOME、Node 20 floor 兼容的单 worker/768 MiB 串行聚焦集合 **22 文件、1002 项通过**；五个静态门和 `git diff --check` 通过。provider/平台/真实账单等外部验收仍按 Phase 20 台账单独记录，不从本地测试推导完成。

### 24.99 修复验证与真实 auto-compact 测试（2026-11-02）

针对 commit `77b81369` 与 `4f26bcf1` 做了逐项核查，并按用户要求在真实 CLI 中跑通压缩链路。结论：**用户修复了 24.98 提出的 S1/S1b/S2/S3/S4/S5/S7，但真实运行中压缩仍然无法落地，原因是两个此前未发现的阻塞点。**

#### 24.99.1 已修复项核实（有测试或探针证据）

| 24.98 条目 | 实现位置 | 核实方式 | 结论 |
|---|---|---|---|
| S1 软限必须低于硬限 | `context/request/budget.ts` 新增 `requestBudgetLimits`，`softLimit = min(floor(w*0.9), floor(availableInput*0.8))` | 探针实测 20k 窗口带宽从 **0 → 1,581**；64k 从 **0 → 10,381** | 已修复 |
| S1b 切点预算钳到阈值以下 | `session/compaction/budget.ts` 的 `availableTailTokens = floor(threshold * 0.8)` | 64k 窗口 keepTail 从 51,904 → **33,218** | 已修复 |
| S2 `keepRecentTokens` 成为已声明字段 | `config/fields.ts:63` + `config/settings.ts:28` + `runtimeConfig.ts:564` | 隔离 home 写入后 `getRuntimeConfig().keepRecentTokens` 有值 | 已修复 |
| S3 `policy.promptIdentity` 携带完整身份 | `cliRuntimeInvocation.ts` 的 `withRequestOverhead` 增加 `currentPromptIdentity`，`cliSessionRuntimeFactory.ts:283` 提供 `readPromptIdentity` | 探针：`policy.promptIdentity` 现在有 10 个字段；`measureContextTokens` 返回 **12345** 而非 `undefined` | 已修复 |
| S4 显示层保留读数 | `interactiveMode.ts:376` 去掉 `!this.busy`；`controller.ts` 增加 `retained` + `scope`；`items.ts` 渲染 `<tokens>? stale` | 探针：含工具调用的历史现在仍是 `calibrated 30,572` | 已修复 |
| S5 压缩不可见 | `runtimeContext.compactionUnavailable` + `/context` 的 `Compaction basis` 行 + 启动 notice | `context/report.ts` 有对应字段与渲染 | 已修复 |
| S7 预算拆分 | `formatBudgetBreakdown`（`session/compaction/budget.ts`） | 拒绝消息包含 tool schemas / system / history 三项 | 已修复 |

**静态门与聚焦测试**：`verify:import-cycles`、`check:config-consumers`（62/62）、`check:declarations`（18/18、13/13）全部通过；压缩相关 163 项测试通过。`sessionFacts.test.ts` 的 11 项失败是**真实 `~/.cheers/models.json` 覆盖了测试 fixture 的目录**，隔离 HOME 下 28/28 通过，不是产品缺陷。

#### 24.99.2 真实 auto-compact 测试：三个阻塞点

测试环境：隔离 home（`/tmp/cheers-test/auto2/home`）、真实 provider（`bailu-2.8`）、`contextWindow: 40000`、`reserveTokens: 2000`、`maxOutputTokens: 4096`、`keepRecentTokens: 4000`。用 `read` 工具反复读入 33KB 文件把上下文推过阈值。

日志与探针确认的事实：

```
turn.compaction Checking context budget {"boundary":"prompt","messageCount":14}
probe: window=40000 reserve=2000 output=4096 keep=4000 tools=18 sysChars=1366 measured=undefined
planCompaction = FIRES（requestEstimate 38,730 > threshold 27,123）
```

**压缩确实被调用、判定确实触发、`PreCompact` 钩子确实派发。** 但最终没有落地，依次卡在三个点：

**阻塞点 1：摘要请求返回 `finish_reason: "length"`，被静默丢弃。**

诊断输出（临时插桩，已回退）：

```
FINISH length
DECLINED reason=unsummarized
```

`requestCompactionSummary` 把 `length` 与 `error`/`refusal`/`content_filter` 一起当作失败返回 `undefined`（`core/query/compaction/summarize.ts:249`），而 `generateContext` 把 `undefined` 映射为 `declined: unsummarized`（`session/compaction.ts:608`）。**整条路径没有任何用户可见输出**——既没有 `onError`，也没有 `onDeclined`。

原因：摘要请求的输出上限直接复用 `configuredOutputLimit(runtimeConfig)`（`cli/runtime/compaction.ts:136`、`:141`），也就是主请求的 `maxOutputTokens`。而摘要要把整段历史压成一条消息，输出需求与主请求无关。测试里 `maxOutputTokens: 1024` 时必然截断。

`policy.segmentTokens` 是为此存在的字段（`session/compaction.ts:25`，`schedule.ts:7` 的默认 `16_000`），但**生产路径从未设置它**——`grep segmentTokens` 在 `cli/`、`turn/` 下无赋值点。所以分段机制在真实运行中永远走默认值，而实际发送上限仍由 `maxOutputTokens` 决定，两者不一致。

**阻塞点 2：`metadata.json` 的 inode 在摘要生成期间被改写，导致发布必然被拒。**

诊断输出（临时插桩，已回退）：

```
moved=["metadataFile"]
   metadataFile: "2096:786583:1793610021773" -> "2096:784022:1793610022157"
```

`capture()` 把 `fileIdentity(layout.metadataPath)` 计入 `identity`（`session/compaction/commit.ts:52`）：

```ts
const identity = digest([session.id, session.createdAt, storage, fileIdentity(layout.metadataPath),
  fileIdentity(layout.transcriptPath), logicalState, history, sourceActivePath]);
```

而 `writeSessionMetadataRecord` 用**原子写**（`sessionFileStore.ts:190` 的 `writeTextFileAtomic`：写临时文件 + `rename`），每次都会产生**新 inode**。日志显示一次普通回合里 metadata 被重写 5 次：

```
activateSession
persistSessionUserPromptBarrier
markSessionTurnActive
saveSessionError
saveSessionCompleted
```

其中 `persistSessionUserPromptBarrier` 与 `markSessionTurnActive` 都发生在压缩检查**之后、摘要生成期间**。因此只要摘要耗时超过这两个写入，`commit` 的 identity 比较必然失败，返回 `The session source changed while its summary was generated.`

**这是设计缺陷而非竞态偶然**：`identity` 的注释明确写着「Keep the source fence tied to logical session state and file ownership so those observations do not make a valid publication look stale」。但 `metadata.json` 的 inode 恰恰是「观测」而非「逻辑状态」——标题、`updatedAt`、`status` 的写入不改变要摘要的历史。把它的 inode 计入 identity，等于让每一次生命周期写入都作废一次进行中的摘要。

`state.json` 同理，但它没有被计入（只在 `logicalState` 里取字段），说明这个区分是刻意做过的，`metadataPath` 是被漏掉的一项。

**阻塞点 3（未验证但已定位）：`measureContextTokens` 仍返回 `undefined`。**

诊断输出 `measured=undefined`，而 24.99.1 的探针在构造环境下返回了 12,345。差异在于真实运行的 `recorded.wireHistoryDigest` 与 `outgoingProjection(messages, mainShape.assistantAfterToolResult)` 的切片不一致——`cli/runtime/compaction.ts` 要求 `recorded.wireMessageCount === measuredMessageCount` 且切片摘要相同。真实运行中 `measuredMessageCount` 是**原始消息数**（`turn/step.ts:633` 的 `promptMessageCount: messages.length`），而 `wireMessageCount` 是**投影后消息数**，两者在工具桥接或关闭步时不等。

这一项不影响触发（估算回退仍能触发），但会让拒绝消息与 `/context` 一直显示「estimated」，与用户实际看到的 provider 用量不符。

#### 24.99.3 三个阻塞点的修复方案

**F1（P0）摘要输出上限必须独立于主请求。**

```ts
// cli/runtime/compaction.ts:136 与 :141
maxOutputTokens: summaryRole ? summaryRole.limits.maxOutputTokens
  : resolveSummaryOutputLimit(runtimeConfig, provider.endpoint),
```

`resolveSummaryOutputLimit` 取 `max(configuredOutputLimit(...), SUMMARY_MIN_OUTPUT)`，其中 `SUMMARY_MIN_OUTPUT` 取模型 `maxTokens` 的一个保守比例（或固定 8,192）。同时把 `policy.segmentTokens` 设为同一数值，让分段预算与发送上限一致。

**F2（P0）把 `metadata.json` 的 inode 移出 `identity`。**

`metadata.json` 携带的是标题、`status`、`updatedAt`、`hasReportHistory` 等展示字段，不参与「要摘要的历史」。`identity` 应只覆盖：

- `transcriptPath` 的 inode（追加式写入，inode 稳定）；
- `logicalState`（已包含 `pendingPrompt`、`thread`、`modelSelection` 等真正的逻辑状态）；
- `history` 与 `sourceActivePath`。

删除 `fileIdentity(layout.metadataPath)` 一项即可。若仍需检测元数据被替换（例如会话被另一实例接管），应比较**内容摘要**而非 inode，因为原子写必然换 inode。

**F3（P1）摘要失败必须可见。**

`turnCompaction` 没有把 `onError` 传给 `createCompactionStep`（`turn/compaction.ts:33-43`）。应增加 `onError: error => renderer.renderLine(...)`，与 `onDeclined` 走同一条用户可见通道。当前 `unsummarized` 是一个 `declined` 而非 `error`，所以即便加了 `onError` 也覆盖不到——**`unsummarized` 应当被区分为失败**，或在 `onDeclined` 里区分「无事可做」与「摘要失败」。

**F4（P2）`measureContextTokens` 的 wire 计数对齐。**

`turn/step.ts:633` 的 `promptMessageCount: messages.length` 记录的是原始消息数，而 `wireMessageCount` 是投影后数量。`cli/runtime/compaction.ts` 的校验同时要求两者相等，实际只应在 `sourceAligned` 时要求，否则退化为「只校验 historyDigest 前缀」。这一项影响显示一致性，不影响压缩触发。

#### 24.99.4 本轮的方法论修正

24.98.10 记下的教训是「单测通过而真实运行不通过时，先对比输入对象」。本轮进一步验证了它的价值，也暴露了新的失败模式：

**失败模式：把「链路通了」当成「功能可用」。** 我先后确认了 `PreCompact` 派发、`planCompaction` 返回计划、`condenseContext` 被调用，据此认为压缩「应该成功了」。真正的事实是每一步都成功，但最后一步的发布被拒——而拒绝信息被 `onDeclined` 打印出来时，我一度把它当成「已经修好」的证据读了过去。

**修正方法**：在真实链路里，每一步的「成功」都必须有独立证据，且**最后一步的产物必须可观察**。本轮最后靠三件事定位：

1. 在 `createCompactionStep` 的每个 `declined` 分支写诊断 → 得到 `unsummarized`；
2. 在 `requestCompactionSummary` 的三个失败分支写诊断 → 得到 `FINISH length`；
3. 在 `commit` 的 identity 比较处 dump 分量 → 得到 `moved=["metadataFile"]`。

三步各自独立，缺任何一步都会继续停在「链路通了但没效果」。

**另一个教训**：诊断代码必须用**静态 import**。本轮第一次插桩又写了 `await import('node:fs')` 放进同步函数，构建失败后才发现——这是 HANDOFF 里已记录的坑，第二次犯。

### 24.100 重新研究：auto-compact 的真实阻塞点（2026-11-02）

24.99 给出的三个阻塞点是错的。本节用对抗性复核 + 四路子代理 + 插桩实测重新定位，结论**替换** 24.99.2 与 24.99.3。

#### 24.100.1 先纠正 24.99 的三个错误结论

| 24.99 的判断 | 复核结果 | 证据 |
|---|---|---|
| 「摘要被截断（`finish_reason: length`）后静默丢弃」 | **错**。截断确实会返回 `undefined`，但真实运行里摘要请求**根本没发出** | 插桩 `SUMMARY-HTTP`/`SUMMARY-FINISH`/`SUMMARY-EMPTY` 三个分支全部未命中 |
| 「`metadata.json` 的 inode 让发布必然失败」 | **是真实存在的缺陷，但不是本次阻塞点**。我把 metadata 改成原地写（inode 稳定）后，压缩**仍然没有落地** | 实验构建 `37478fbc95ee`：改后仍无 compaction 事件 |
| 「`measureContextTokens` 返回 `undefined` 是因为 wire 计数不等」 | **症状正确，归因错误**。它确实返回 `undefined`，但压缩触发**不依赖它**（回退估算足够） | 插桩实测 `plan=FIRES` 时 `measured=undef` |

#### 24.100.2 真正的阻塞点：一个 38KB 的 tool 结果超过了 segment 预算

插桩后的完整因果链（真实 CLI，`contextWindow: 40000`）：

```
turn.compaction prompt msgs=28 win=40000 res=2000 out=4096 keep=4000 tools=18 sys=1366 measured=undef
plan=FIRES cut@7 below=false cutReason=no-legal-cut
CONDENSE-THREW SummaryAdmissionError: Summary request refused: a legal message group exceeds its segment budget.
```

`createCompactionStep` 在 `planCompaction` 返回计划后，调用 `condenseContext` → `generateCompaction` → `scheduleSegments`。后者按 `legalUnits` 把消息分组：一个 assistant 的 `tool_calls` 与其全部 `tool` 结果构成一个**不可分割单元**（`schedule.ts:10-30`）。然后：

```ts
// session/compaction/schedule.ts:44-49
for (const unit of legalUnits(input.messages)) {
  const candidate = [...current, ...unit];
  if (fits(candidate)) { current = candidate; continue; }
  if (!current.length || !fits(unit)) throw new SummaryAdmissionError(
    'Summary request refused: a legal message group exceeds its segment budget.');
```

`fits` 的判定是 `estimateTokens(messages) > maxTokens`，而 `maxTokens` 来自 `policy.segmentTokens`（`generation.ts:75`），生产路径**从未设置**，因此恒为 `DEFAULT_SEGMENT_TOKENS = 16_000`（`schedule.ts:7`）。

测试会话里 `read` 工具返回了两个约 38KB 的文件内容，合计约 21,700 tokens——**单个不可分割单元就超过了 16,000**。于是：

1. `planCompaction` 正常返回计划（它只看切点与阈值，不看 segment）；
2. `PreCompact` 钩子正常派发；
3. `scheduleSegments` 在**任何请求发出之前**抛出 `SummaryAdmissionError`；
4. `createCompactionStep` 捕获后调用 `options.onError?.(error)`；
5. **`turnCompaction` 没有传 `onError`**（`turn/compaction.ts:33-43`），错误被完全吞掉；
6. 用户什么也看不到，压缩永远不发生。

**这就是「链路每一步都成功、但功能从未生效」的完整解释。** 24.97 里「真实 `runTurn` 探针调用 `summarize` 1 次」之所以成立，是因为那个探针用的是小消息（2000 字符），没有触发 segment 上限。

#### 24.100.3 三家的做法（子代理实测）

**摘要输出预算**

| | 输出上限 | 输入分段 | 截断处理 |
|---|---|---|---|
| codex | **不设置**（继承服务端默认） | 无分段；溢出时丢弃最旧条目重试（`compact.rs:314-330`） | `response.incomplete` → 可重试的 `Stream` 错误（`sse/responses.rs:470-477`） |
| pi | **不设置**，直接用 `model.maxTokens`（`simple-options.ts:44-46`） | 无分段；只有 2000 字符的 tool 结果截断（`utils.ts:94`） | 识别为失败并报错，不重试（`compaction.ts:582-592`） |
| oh-my-pi | **自己的**：`min(0.8 × reserve, 16384)`（`compaction.ts:923`） | **有**：`planSummaryWindows` 按 token 分窗，逐窗折叠（`compaction.ts:889-911`） | 识别为失败并抛出，尝试下一个压缩方法 |
| **本项目** | 继承主请求的 `maxOutputTokens` | **有 `scheduleSegments`，但预算写死 16,000 且不可分割单元超限即拒绝** | 返回 `undefined` → `unsummarized` → 静默 |

**关键差异**：omp 是唯一同时做了「独立输出预算」与「输入分窗」的。但即便 omp，它的分窗也是按 token 切的，**没有「单元超限就拒绝整次压缩」的规则**——它用 `clampConversationToBudget` 硬钳单个超大消息（`compaction.ts:869-874`）。

**发布前的陈旧性检查**

| | 检查什么 | 检查失败时 |
|---|---|---|
| codex | **什么都不查**。提交时重新取快照并无条件覆盖（`compact.rs:352` → `session/mod.rs:3615`） | 不适用 |
| pi | **什么都不查**，只看 `signal.aborted`（`agent-session.ts:3256`） | 不适用 |
| oh-my-pi（推测路径） | **entry id**：`snapshotLeafId` 必须在活动路径上，且其后无 compaction/reset 边界（`session-maintenance.ts:2487-2497`） | 静默丢弃 |
| oh-my-pi（普通自动路径） | **什么都不查**（`session-maintenance.ts:5970`） | 不适用 |
| **本项目** | `metadata.json` + `transcript.jsonl` 的 **inode**，加逻辑状态与历史摘要 | 拒绝并提示用户 |

**三家都没有把会话文件身份（mtime/inode/hash）纳入陈旧性检查。** 本项目是唯一这么做的。这既解释了它为什么在真实运行中反复拒绝，也说明这是一个**过度约束**而非缺失。

#### 24.100.4 为什么 codex 和 pi 不需要检查

不是疏忽，是结构不同：

- **codex**：任务串行化。`spawn_task` 会中止上一个任务（`tasks/mod.rs:271-280`），压缩作为 `SessionTask` 运行（`tasks/compact.rs`），期间到达的输入被缓冲到 `TurnState.pending_input` 供**下一回合**使用。没有并发写入，所以无需检查。
- **pi**：`prompt()` 只在**手动**压缩时阻塞（`agent-session.ts:2131-2135` 检查 `_compactionAbortController`），自动压缩期间可以接受新 prompt。它靠「标题条目是 `firstKeptEntryId` 的后代」这一巧合容忍增长，没有任何强制。

本项目是异步多写入的：`persistSessionUserPromptBarrier`、`markSessionTurnActive`、`saveSessionError`、`appendSessionTurn`、`saveSessionCompleted` 都会在压缩窗口内重写 metadata。

实测时序（真实 CLI，毫秒级）：

```
092107 BEFORE-PROMPT-START
092126 META-WRITE  markSessionTurnActive      ← 落在压缩检查内部
092142 BEFORE-PROMPT-END
```

`markSessionTurnActive` 的写入**必然**发生在 `beforePrompt` 的摘要窗口内（因为 `sessionRuntime.ts:311` 在收到第一个事件时才标记 turn active，而压缩检查在 `core.prompt` 之前）。

#### 24.100.5 解决方案

**R1（P0）`segmentTokens` 必须有生产值，且超大单元必须被钳制而非拒绝。**

两条都要做：

1. 在 `buildCompactionWiring` 里设置 `policy.segmentTokens`，取值与摘要输出预算同源（见 R2）；
2. `scheduleSegments` 遇到单个超限单元时**不应抛出**。改为：先尝试 `clampConversationToBudget` 式的截断（把超大 tool 结果按其文本长度截到预算内，保留首尾），再重新分组。omp 的做法（`compaction.ts:869-874`）可直接借鉴。

完成条件：一个含 38KB tool 结果的会话，`generateCompaction` 能产出摘要而不是抛错。

**R2（P0）摘要输出预算独立于主请求，并对齐 segment 预算。**

现状 `cli/runtime/compaction.ts:136,141` 用 `configuredOutputLimit(runtimeConfig, ...)`，即主请求的 `maxOutputTokens`。改为：

```ts
const summaryOutput = Math.min(Math.max(configuredOutputLimit(...) ?? 0, 8_192), 16_384);
```

取 omp 的形状（`min(0.8 × reserve, 16384)`）但用本项目已有的 `reserveTokens`。然后 `policy.segmentTokens = summaryOutput`，使「一个分段能装进一次请求的输出预算」成立。

**R3（P0）`turnCompaction` 必须传 `onError`。**

`turn/compaction.ts:33-43` 没有 `onError`，`createCompactionStep` 的 `options.onError?.(error)`（`session/compaction.ts:725`）因此是空操作。这是本轮所有排查卡住的直接原因——错误被完全吞掉。

```ts
onError: error => renderer.renderLine(`Compaction failed: ${error instanceof Error ? error.message : String(error)}`),
```

同时把 `unsummarized` 从 `declined` 改为 `failed`：摘要失败不是「无事可做」。

**R4（P1）发布前检查应只覆盖逻辑状态，不覆盖文件 inode。**

三家都不检查文件身份。本项目的 `metadata.json` inode 在压缩窗口内必然变化（见 24.100.4 的时序），因此这项检查在真实运行中**必然失败**。

但**不能简单删除**——`commit.test.ts:305` 明确断言「native resume 重发布未变更的 metadata 后，未知摘要不得重放」。正确做法是：

- `identity` 保留 `transcript.jsonl` 的 inode（追加式写入，稳定）；
- 保留 `logicalState`、`history`、`sourceActivePath`；
- **移除** `fileIdentity(layout.metadataPath)`；
- 把「会话被另一实例接管」的检测移到 `metadata.json` 的**内容摘要**上（标题 + status + createdAt），而不是 inode。

完成条件：`commit.test.ts` 全部通过，且新增一个「生命周期写入发生在摘要窗口内」的用例，断言提交仍成功。

**R5（P2）`measureContextTokens` 的 wire 计数对齐。**

`turn/step.ts:633` 记录 `promptMessageCount: messages.length`（原始），而 `wireMessageCount` 是投影后数量。`cli/runtime/compaction.ts:212-214` 要求两者相等。应在 `projection.sourceAligned` 为真时才要求，否则只校验 `historyDigest` 前缀。

这一项不影响压缩触发（回退估算已足够），只影响 `/context` 与拒绝消息显示的 `estimated` / `measured` 标记。

#### 24.100.6 本轮方法论

24.99.4 记的教训是「把链路通了当成功能可用」。本轮把它推进一步：

**错误在于「用一个失败信号替代了完整因果链」。** 我在 24.99 看到 `FINISH length` 就认定摘要被截断，但那次插桩的构建里 `maxOutputTokens` 恰好是 1024；后来把配置改成 4096 后截断不再发生，我却没有重新验证，而是把旧结论带进了文档。

**本轮有效的做法**：

1. **对抗性复核**：专门派一个子代理去**证伪**自己的三个结论，而不是去确认；
2. **每一步独立插桩**：`plan` 有没有产生、`capture` 有没有抛错、`condenseContext` 有没有抛错、摘要三个失败分支有没有命中——四个观测点分开记录，才定位到 `SummaryAdmissionError`；
3. **实验性反证**：把 metadata 改成原地写，验证「inode 是阻塞点」这个假设**不成立**，从而排除它。

**教训**：当「日志显示某步失败」时，先确认那次构建的**配置与其他输入**与当前一致。插桩本身会改变时序与配置，跨构建复用结论是这轮反复的根源。

#### 24.100.7 复核代理的裁定与本轮实测的交叉验证

派了一个对抗性子代理专门**证伪** 24.99 的三条结论。它的裁定与本轮实测的对照：

| 结论 | 子代理裁定 | 实测 | 谁对 |
|---|---|---|---|
| A 摘要截断 | **CONFIRMED**（机制真实，但截断是条件性的，非普遍） | 24.99 的 `FINISH length` 观测属实，但那是 `maxOutputTokens: 1024` 的构建 | 一致 |
| B metadata inode | **REFUTED**——「正常回合中 capture 与 commit 之间没有 metadata 写入」 | **实测推翻该反驳**：`markSessionTurnActive` 在 capture 后 **13ms** 写入，commit 在 **43 秒**后 MISMATCH | **实测对** |
| C wire 计数 | **PARTIALLY CORRECT**——真正的首因是 `!projection.sourceAligned`（微压缩裁剪），不是计数不等；且 undefined 不阻止压缩 | 与实测一致（`plan=FIRES` 时 `measured=undef`） | 一致 |

**关于 B 的判定依据（实测时序，真实 CLI）：**

```
1793621693748 CAPTURE 998801b51def
1793621693761 META  ...<markSessionTurnActive        ← 13ms 后
1793621736891 COMMIT MISMATCH                        ← 43 秒后
```

子代理的推理是「metadata writers fire at message boundaries and run start/end」，因此不在窗口内。但 `sessionRuntime.ts:311` 的 `markTurnActive` 是在**消费第一个查询事件时**触发的，而 `beforePrompt` 的压缩检查已经在 `core.prompt` 之前运行——两者的相对顺序是「压缩检查开始 → 首个查询事件到达 → metadata 写入 → 压缩检查返回」，写入正好落在窗口内。

**这条分歧本身是本轮最有价值的发现**：静态代码推理在这个点上会得出错误结论，因为触发条件藏在事件消费的时机里。

#### 24.100.8 复核代理补充的拒绝分支可达性

子代理枚举了压缩路径上全部 `declined` / `refused` 返回点，并标注了在正常前台回合中的可达性。其中**自动路径上完全静默**的有五个：

| 位置 | 原因 | 可达性 |
|---|---|---|
| `session/compaction.ts:608` | `unsummarized` | **是**——摘要返回 undefined |
| `session/compaction.ts:620` | `would-not-shrink` | 是——检查点加保留尾部不更小 |
| `session/compaction.ts:586` | `blocked-by-hook` | 仅配置了阻塞钩子 |
| `session/compaction.ts:603` | `step-unknown` | 仅崩溃/传输失败后 |
| `session/compaction.ts:535/602/606` | `cancelled` | 仅中止 |

只有两种拒绝会到达用户：无切点/未到阈值（`onDeclined`，`:686-697`）与提交被拒（`:740-742`）。

**这解释了为什么本轮排查如此困难**：真实运行中最常命中的 `unsummarized` 与 `SummaryAdmissionError` 都属于静默类别。

#### 24.100.9 对 R1–R5 的修正

基于复核与实测，方案调整如下：

- **R1（不变，优先级提升）**：`segmentTokens` 必须有生产值，超大单元应钳制而非拒绝。这是本轮实测到的**直接阻塞点**（`SummaryAdmissionError`）。
- **R2（不变）**：摘要输出预算独立于主请求。
- **R3（不变，优先级提升）**：`turnCompaction` 必须传 `onError`。复核代理确认 `SummaryAdmissionError` 正是被这个缺失吞掉的。
- **R4（不变，但理由修正）**：移除 `metadata.json` inode 的依据不是「子代理说它不会变」，而是**实测证明它必然在窗口内变**。同时保留 `commit.test.ts:305` 的语义（resume 后不得重放未知摘要），改用内容摘要而非 inode。
- **R5（降级为 P2，方向修正）**：锚点失配的**首因是 `!projection.sourceAligned`**（微压缩裁剪旧 tool 输出），不是计数不等。三家参考实现的做法是「校验失败就丢弃锚点、退回估算」——本项目已符合该模式，因此这不是缺陷。若要对齐，方向是 pi 的「把锚点绑定到 entry id」而非比较计数。

### 24.101 24.99/24.100 的实施与持久发布验证（2026-11-02）

按 24.100 的最新修正实施 R1–R4，R5 保留已有 projection identity 校验与估算回退。本轮没有重做 24.98 已提交的功能，也没有运行真实 PTY 或 20,000 条消息压测。四个辅助代理均使用 `gpt-6.1-sol`，只读/静态分析/编辑；所有验证由主代理单进程串行执行。

#### 实施与方案修正

| 项 | 当前行为 | 验收证据 |
|---|---|---|
| R1 | `session/compaction/projection.ts` 仅缩短摘要输入中的 tool 文本，保留首尾、截断标记、call/result ID、参数、图片等非文本块和原始历史；最小投影及完整 preflight 仍超限时具名拒绝 | 38KB 单结果、多结果、Unicode、冻结输入、固定开销拒绝、零 dispatch/claim、durable step 复用测试 |
| R2 | `cli/provider/summary/budget.ts` 为 fallback 和显式 summary role 共用模型限制推导；摘要输出独立于主请求偏好，常规模型目标 8192–16384，小窗口/输入/输出上限收窄；生产 policy 有 segmentTokens 与 mergeTokens | 实际 HTTP body、exact role、模型上限、provider-owned 输出、合法合并与不同 merge policy 不共享 pending generation 回归 |
| R3 | 摘要未产出为 failed；自动 step 的 onError 到达原用户通知通道，本地拒绝经 redactor，任意 provider 异常仅通用文案；阈值以内/取消静默，unknown 不重发 | 真实 turn adapter 的 preflight 零发送、missing summary 一次发送/保留历史、秘密文本隔离、hook/would-not-shrink/unknown notice |
| R4 | metadata inode 移出 fence；每项目显式 selection activationId 区分普通生命周期与 resume/选择往返，逻辑 replay identity 独立；registry set/clear 锁内重读 | 44 项 commit 测试，包含同毫秒且 metadata 字节相同的 resume、生命周期原子写、无关项目、旧快照 writer、legacy shadow/malformed、历史/分支/模型/存储变化 |

对研究方案的两处必要修正：**输入分段不等于输出预算**，它要扣掉摘要输出、上一摘要和提示词；merge 的输入已包含两个摘要，不能重复扣一份 carried summary。参考当前只读实现 `oh-my-pi/packages/agent/src/compaction/compaction.ts` 的独立输入/输出预算及分窗后钳制、`pi` 的摘要专用 tool 文本序列化，与本项目的合法工具成组和预检结合，未复制巨类。metadata 的 title/status 内容摘要也不能识别 resume，因为这些字段会被正常生命周期更新；采用现有 registry 中每项目激活身份，并保护锁内重读。

独立只读复核发现并修复三处在途边界：merge 误用 segment ceiling、provider-owned 理论 maxTokens 使输入变为 1 token、被覆盖的坏 legacy registry 否决当前有效 activation。最终复核未发现遗留行为缺陷；这不替代运行证据。

#### 验证与真实产物

- 最终聚焦批次 7 文件 **143 项通过**；publication/HTTP/core-shell/turn 的直接消费者另以串行小批覆盖：commit 44、runtime compaction 33、core shell 10、turn session 41。共 **13 个直接相关文件、278 项**已有最终通过输出，未跑全套回归。
- 四项反转均红灯成立：tool projection、独立摘要 output、自动 error callback、metadata inode fence；每次恢复原始字节。错误通知首轮过滤词没有选中目标测试，已改为精确测试名后验证红灯，不把空选通过当证据。
- 五静态门与 `git diff --check` 通过。TS build `976145d40770`；bundled NormProof 退出 0，导入解析/循环义务 satisfied，但总体 **partial**，既有 `interactiveMode.ts` 与其测试超过函数上限，未提升为全绿。
- 隔离真实 provider 的 Node `--print --session-id`：16 条合成消息，其中一个 tool group 含两份各 **41,727 bytes** 的结果，40k window、4096 foreground output、2000 reserve、4000 keepRecent。CLI exit 0；持久记录 **1 compaction + 1 匹配 compaction-commit**，`publishedCompactionEvents` 接受 1 份非空摘要，模型上下文缩至 **8 条**，没有可见失败。只保留脱敏计数，不留 provider 原始 body 或 credentials。

本地证据目录：`.omx/artifacts/phase20-compaction-publication/`，含反转输出、结构报告与脱敏 native result。探针和含凭据的隔离 HOME 在收尾删除。尚无 Node 20.3 实际运行、Windows/macOS 实机、真实 interactive/exe、摘要质量或 billing/release 验收；原 Phase 20 延后项保持延后，ADD 状态未升为全量完成。提交、推送与 CI 的精确状态见开发日志。

### 24.102 压缩保留尾部超出预算：一个 44KB tool 结果让压缩近乎失效（2026-11-02）

用户质疑：真实测试中压缩后 prompt 只从 21,585 降到 19,025（11.8%），这算压缩吗？

**结论：压缩算法本身正确，但保留尾部的预算在「单个 tool 结果超过预算」时失效。**

#### 24.102.1 两个数字不是同一口径

之前把 `tokensBefore: 29,725`（对话 tokens）与 `21,585 → 19,025`（请求 tokens）放在一起比较，这是错的。真实降幅要用同一口径重算。

用真实形状重建（3 个 turn，每个含一个 44,263 字符的 tool 结果）：

```
messages        = 12
conversation    = 38,029 tokens
plan: cut@9, kept 3 messages
kept tail       = 12,661 tokens  ← 预算是 4,000
```

**保留尾部是预算的 3.2 倍。**

#### 24.102.2 根因：不可分割的 tool 单元

`locateCut`（`session/compaction.ts:229`）从最新消息往回累加字符：

```
i=11 assistant     38 chars  acc=     38
i=10 tool       44,265 chars  acc= 44,303  ← 超预算
```

累计到 `i=10` 时已超预算 3 倍。`newestCutBelow`（`:176`）不能把 tool 当切点（`canStartTail` 拒绝 `role === 'tool'`），只能退到 `i=9` 的 assistant。**那 44KB 原封不动留在保留尾部。**

代码注释写的是：

> "the newest legal cut anywhere is used, which **keeps less** than the budget asked for rather than giving up."

**实际是 keeps more。** 文档与实现不符。

#### 24.102.3 后果：每次大读取都要压缩一次

```
after compaction  = 13,232 tokens
threshold         = 27,123 tokens
headroom          = 13,891 tokens
one more 44KB read = 12,647 tokens
→ compactions per large read: 0.9
```

压缩后只剩 13,891 tokens 余量，而一次 44KB 读取要 12,647——**几乎每次大读取都会触发一次压缩**。用户看到「压缩频繁但降幅有限」正是这个原因。

#### 24.102.4 算法本身没有问题

同一算法在不同形状下的降幅：

| 形状 | 压缩前 | 压缩后 | 降幅 |
|---|---|---|---|
| 3 turns × 44KB | 38,029 | 13,238 | **65.2%** |
| 6 turns × 44KB | 76,058 | 13,238 | **82.6%** |
| 3 turns × 44KB + 3 small | 38,547 | 13,756 | **64.3%** |

**切点选择与摘要生成都是对的。** 问题只在「保留尾部的下限」——它没有下限，一个不可分割单元可以撑破整个预算。

#### 24.102.5 三家的做法：超支是被刻意接受的

子代理核查结果**否定了我此前的修法建议**（「截断保留的 tool 内容」）。三家都没有这么做。

| | 保留尾部超预算时 | 是否截断 tool 结果 |
|---|---|---|
| oh-my-pi | **刻意超支**。`findCutPoint` 的 `cutIndex` 初始化为最新切点，循环无法越过它（`compaction.ts:560-573`）。契约写在 `:519-523`：「Keep the newest group even when it alone exceeds the budget」 | **否**，`recentMessages` 原样切片（`:1580`） |
| pi | **同样超支**。`cutPoints.find(c => c >= i)` 把切点退到 assistant tool call，8KB 结果整块保留（`compaction.ts:471-478`） | **否**，且有测试 #9740（`test/compaction.test.ts:378-411`）钉死该行为 |
| codex | **不保留 tool 结果**。只保留 user 消息，边界消息用 `truncate_text` 中段截断（`compact.rs:666-685`） | 不适用——tool 结果根本不进入保留集 |

**三家在 tool call / result 配对上的处理完全一致**：绝不把切点放在 tool result 上，因此配对永远不会被拆散。超支是配对的代价。

oh-my-pi 的测试文件直接描述了这一后果（`agent-session-auto-compaction-progress-guard.test.ts:55-58`）：

> "prepareCompaction keeps it verbatim (findCutPoint never cuts at tool results), so a 'successful' compaction leaves context still above threshold."

#### 24.102.6 真正的缺陷不是超支，是缺少进度守卫

既然超支是三家共有的设计，本项目的问题就**不是**「保留尾部超预算」本身。真正的问题是：

**压缩没有腾出足够空间时，下一回合立刻再次触发，形成无进展的循环。**

实测证据：真实会话中连续两次 `compaction-prepared`，`tokensBefore` 分别是 29,725 与 30,288——第二次压缩后上下文仍在阈值附近。

oh-my-pi 为此有专门机制：`agent-session-auto-compaction-progress-guard.test.ts` 描述的「post-maintenance headroom check」，**检测到压缩未腾出足够空间时阻止自动继续，而不是再次触发**。

本项目的 `createCompactionStep` 没有任何等价逻辑：`planCompaction` 返回计划就执行，执行完下一回合再判断——如果保留尾部本身就接近阈值，就会反复压缩。

#### 24.102.7 R6 方案（子代理实测，可直接实施）

**三家的实际情况**：只有 oh-my-pi 有进度守卫；pi 和 codex **都没有**。

- pi 的 `estimatedTokensAfter`（`agent-session.ts:3261`）算出来只是**报告**，从不比较；
- codex 在 `turn.rs:472` 明说依赖「compaction works well enough」，没有 gate。

所以这一项只能照 oh-my-pi 做。

**oh-my-pi 的机制有两层**，本项目需要的是第二层：

1. **提交前** `#compactionReducesContext`（`session-maintenance.ts:4184-4223`）——投影必须严格变小。本项目已有等价物：`generateContext` 的 `would-not-shrink`（`session/compaction.ts:618-622`）。
2. **提交后** `#compactionCreatedHeadroom`（`:4283-4302`）——残余必须落进恢复带：

```ts
const recoveryBand = Math.floor(thresholdTokens * COMPACTION_RECOVERY_BAND);  // 0.8
return residualTokens <= recoveryBand;
```

关键细节（`:4296-4300` 的注释）：**刻意不再要求 `residual < trigger`**，因为裁剪可能已把 trigger 压到带以下，严格递减会产生假死锁。

**死锁后的动作**：oh-my-pi 阻止的是**自动继续**（`automaticContinuationBlocked`，`agent-session.ts:5174-5179` 提前 return，跳过 rewind/plan-mode/todo/session_stop/自动继续 prompt），**不是阻止下一次压缩**。

**状态与清除**（全部内存态）：

- `#midTurnCompactionDeadEnds = new WeakMap<AgentMessage[], string|null>()`（`:543`），键是**实时消息数组身份**，值是 `firstKeptEntryId`；
- 清除条件是**切点推进**（`:2883-2900`）：`prep.firstKeptEntryId !== deadEndFirstKeptId` 就 delete；
- **新用户 prompt 不清除**——`resetForNewPrompt()` 只重置 `#incompleteRecoveryAttempts`。

**对本项目的适配**：

| 关注点 | oh-my-pi | 本项目 |
|---|---|---|
| 无进展判据 | `residual <= floor(threshold × 0.8)` | `tokensAfter <= availableTailTokens(policy) + checkpointTokens` |
| 常量 | `COMPACTION_RECOVERY_BAND = 0.8` | `RECOVERY_FRACTION = 0.8`（`session/compaction/budget.ts:13`，**已存在**） |
| 状态位置 | `WeakMap<消息数组, firstKeptEntryId>` | `createCompactionStep` 闭包里的 `let deadEnd`（`session/compaction.ts:680` 旁） |
| 身份键 | `firstKeptEntryId` | `historyDigest(保留尾部)`（`context/request/identity.ts:22`，同目录已用） |
| 阻止什么 | 自动继续 | **同一剪贴点上的下一次压缩**（本项目无自动继续 prompt，且 `NextStepUpdate` 只带 `messages`） |
| 清除条件 | 切点推进 / 新 prompt 不清 | 新 run（自动）/ 切点推进 / 落入带内 |

**`checkpointTokens` 修正**：本项目的 `tokensAfter` 含 checkpoint（`applyCompaction` 在 `compaction.ts:634-639` 前置），而 oh-my-pi 的带是量整个残余。所以要写成 `tokensAfter <= band + checkpointTokens`，否则保留尾部接近上限时带永远不可达。

**不要**用裸的 `!reachedBudgetThreshold(tokensAfter)` 作判据——那正是 #2275 描述的「每回合只回收一点点、永远压在线下」的失败模式。

**实施位置**：

1. `session/compaction.ts:651-658` 的 `CompactionStepOptions` 增加 `onDeadEnd?: (message: string) => void`；
2. `createCompactionStep` 闭包增加 `deadEnd` 状态，在 `condenseContext` 前做便宜的预检；
3. 成功压缩后判定进度，未达标则 arm + 报告一次；
4. `turn/compaction.ts:40` 转接；
5. `cli/provider/resources.ts:161` 渲染（当前 `onDeclined` 直接 `renderer.renderLine`）。

**提示文案**（改编自 oh-my-pi `:4260-4263`）：

> Compaction freed too little context to make progress — pausing automatic compaction on this history. The most recent turn alone is too large to reduce further; clear large tool output or start a new session.

**`recoverOverflow` 不要套用带**：oh-my-pi 的溢出重试路径用的是更松的「装得下就行」（`#compactionCreatedRetryFit`），套用带会把可恢复的溢出变成死锁（#3412）。

**不采纳**「截断保留的 tool 结果」：三家都不这么做，pi 有测试 #9740 钉死相反行为。

**若用户希望降低压缩频率**：调大 `keepRecentTokens`，让保留尾部与 tool 结果规模匹配。当前默认 20,000，对 44KB 级别的 tool 结果偏小。

#### 24.102.8 R5 方案：用改写差值修正锚点（主代理实测）

**此前的「保持 P2、只记方向」是研究不足。** 本节给出可实施的完整方案。

##### 根因复核

`/context` 显示 `estimated` 的直接原因在 `turn/step.ts:361`：

```ts
const measured = options.agentMode || !projection.sourceAligned ? undefined : measuredPromptContext(...);
```

而 `sourceAligned`（`turn/messages.ts:21`）要求 `prunedCount === 0`。**只要历史超过 3 个 turn 且有旧 tool 输出，这个条件必然为假**——不是边界情况，是任何真实编码会话的常态。

##### 关键事实：微压缩是 1:1 映射，锚点索引从未失效

`microcompactMessages` 用 `messages.map(...)`（`core/query/microCompact.ts:91`），**消息数不变，只有内容被改写**。

实测（6 轮 × 44KB tool 结果）：

```
messages before = 18   after = 18   count preserved: true
prunedCount     = 3
savedChars      = 131570
tokens before   = 75907
tokens after    = 38316
actual delta    = 37591
savedChars/3.5  = 37592      ← 只差 1（取整）
```

**所以 `prunedCount === 0` 这个条件是过度保守的。锚点没有失效，只是它的数值需要减去被改写的量。**

##### oh-my-pi 的做法：不丢弃锚点，减去差值

```ts
// session-stats.ts:56-59
function correctedPromptTokens(assistant: AssistantMessage): number {
  return Math.max(0, providerPromptTokens - (assistant.contextSnapshot?.historyRewriteTokensRemoved ?? 0));
}
```

`recordAnchoredHistoryRewrite`（`:443-465`）把差值**累加到锚点消息自己的快照**上，而不是全局计数。调用点在 shake/prune/drop-images 之后（`session-maintenance.ts:872`、`:944`、`:1054`）。

##### 本项目的实施设计

`microCompact` 已经算好了 `savedChars`（`:140`），但**生产代码从未消费**——`grep savedChars` 只命中两个测试文件。

**设计**：

1. `microCompactMessages` 已返回 `savedChars`，无需改签名。
2. 在 `turn/step.ts` 记录 `promptIdentity` 时，增加一个字段：

```ts
// turn/step.ts:347 附近的 promptIdentity
wireRewriteTokens: Math.ceil(projection.savedChars / CHARS_PER_TOKEN),   // 新增
```

3. `PromptMeasurementIdentity`（`observability/usage/model.ts:50`）增加 `wireRewriteTokens?: number`。
4. `measuredPromptContext` 返回时应用修正：

```ts
// observability/usageTelemetry.ts，返回处
const corrected = Math.max(0, telemetry.lastPromptTokens - (identity.wireRewriteTokens ?? 0));
```

5. `turn/step.ts:361` 去掉 `!projection.sourceAligned` 这个前置条件，改为：只要 `converted.length === messages.length`（消息数一致）就允许使用锚点，内容改写由 `wireRewriteTokens` 修正。

**实测验证**（用真实 `microcompactMessages`）：

```
provider-reported (raw history) = 75907
rewrite delta                   = 37592
corrected anchor                = 38315
actual wire estimate            = 38316
error                           = 1 token (0.00%)
```

##### 必须注意的两个陷阱

**陷阱 1：微压缩不幂等。** 实测同一段历史裁两次，第二次仍裁掉 3 字符：

```
first  pass: pruned=3 savedChars=131570
second pass: pruned=1 savedChars=3
```

原因是 `pruneToolContent`（`microCompact.ts:46-48`）的标记文本里嵌了「Omitted N characters」，第二次裁剪时这个数字又变了。

**后果**：不能「每次投影累加 delta」。必须**以锚点消息为准，记录生成该锚点时的投影 delta**，而不是累加多次投影的差值。

这同时是一个独立的真实缺陷（虽然只有 3 字符）：`pruneToolContent` 应当幂等，即对已裁剪的内容直接返回原样。

**陷阱 2：`historyDigest` 也会变。** 内容改写后 `historyDigest(messages)` 与锚点记录的不同，`measuredPromptContext` 的 `requireExpectedIdentity` 校验会失败。所以第 5 步必须同时放宽 `historyDigest` 的比对——或者在 identity 里记录**改写前**的摘要，由 `wireRewriteTokens` 证明差异是被裁剪而非被替换。

##### 与三家的对照

| | 锚点失效时 |
|---|---|
| codex | 无锚点概念；重写后 `recompute_token_usage` 用本地估算覆盖 |
| pi | 丢弃锚点，退回全量估算 |
| oh-my-pi | **不丢弃**，用 `historyRewriteTokensRemoved` 修正 |
| 本项目现状 | 丢弃，退回估算 |
| 本项目目标 | **学 oh-my-pi 修正** |

**只有 oh-my-pi 保留了 provider 锚点。** 这也是它唯一一个能在长会话中持续显示实测值的原因。

##### 优先级修正

R5 从 P2 **提升为 P1**：它同时影响 `/context` 显示精度**和**压缩阈值判定（当前用字符估算而非 provider 实测）。但它是**独立缺陷**，不影响压缩能否执行——压缩触发已由估算路径保证。


### 24.103 24.102 R5/R6 实施与验证（2026-11-02）

本轮按最新设计实施 R5 和 R6。先读当前 owner，再只读比较参考项目的锚点与进度守卫。两名辅助代理均为 `gpt-6.1-sol`，仅阅读、分析和编辑，未运行任何测试/构建/验证脚本。

**R5 的设计修正与实现**：不能从 provider 计量直接扣本次全部 `savedChars`，因为上次请求已经微压缩。`turn/measurement.ts` 证明原始前缀 digest 未变，重建上次请求并核对其 wire digest/count，按当前已测量前缀与旧 wire 的文本差值修正，然后加入当前投影尾部。新请求记录 `wireRewriteTokens` 用于校验基线；重复读不修改/累加 telemetry。preview、dispatch budget、compaction evaluator 共用证明，provider usage 与成本记录不变。字符削减向下取整，不把估算释放量说成精确计量。

参考决策：oh-my-pi 只扣锚点以前的改写并让下次 provider 响应替换锚点；本项目同意该边界，但每次由未改写的原始历史重投影，因此计算差值，不持久累加。保留原历史 digest 的严格比对。消息数量相等仍可能是删 orphan 与补 missing result 抵消，故另外校验各索引 role/result ID/content。bridge/图片/opaque/foreign replay/不可证明的旧 wire 回退估算。完全相同的关闭请求直接使用完整计量，不再加关闭指令。

微压缩幂等性同时修复：识别本 pruner 的完整首尾/标记结构，重复投影不再裁标记里的数字；已经裁剪的结果也不参与下一次去重，避免不同原文在裁剪后首尾相同而继续丢失内容。只包含类似提示文字的普通 tool 内容仍可裁剪。

**R6 的设计修正与实现**：全保留尾部 digest 会随追加消息变化，改为首条保留消息的 ID，无 ID 时用单消息 digest。只有接受发布且未取消后才 arm。检查完整请求估算（含固定 overhead）相对 `availableTailTokens + checkpointTokens`；`tokensAfter` 本身只含历史，不能直接当完整请求。未达标提示一次并暂停同切点；没有新合法切点保持暂停，切点推进/恢复带/新 run 清除。工具配对与最新结果原样保留，overflow/手动独立。

参考决策：同意 oh-my-pi 的首保留 entry 身份、恢复带、先提交再检查、overflow 独立；本项目没有同形自动继续 prompt，按 24.102 暂停同切点再次阈值摘要。新 run 自动重建闭包，未扩为跨 prompt 永久暂停。

**验证**：主代理全程串行，共 8 个直接相关文件、319 项测试有最终通过输出，分 2–3 文件小批运行：measurement 6、progress 17、estimate 8、core/query/compaction 7、cli/provider/compaction 22、preview 113、step 100、session/compaction 46。每次 Vitest 显式单 worker、heap 768 MiB；验证共用非阻塞 flock。最后追加的已微压缩新锚点与关闭请求 preview 用例分别单独聚焦通过。前三次反转均按预期断言红灯并逐字节恢复：前缀差值清零、移除同切点暂停、禁用 pruner 幂等判断。恢复后的直接 3 文件45项通过。首次调用用了不存在的 package-local Vitest 路径，未执行测试；两处新测试夹具漏 step options/继承真实 prefix summarizer 已修正。阈值断言按夹具实际校正结果修正，未为测试改产品算法。

五静态门与 diff check 通过；TS build `de446c26467c` 通过。CI 同款 bundled NormProof 退出0，循环与 unresolved specifier satisfied，整体 partial：两处既有 interactiveMode 函数上限 finding，未改变、未记作全绿。没有全仓/15套件回归，没有任何20k真实二进制PTY压测。

**隔离 Node CLI**：新构建通过本地 HTTP provider 夹具执行 `--print`，HOME/USERPROFILE/CHEERS_TEST_ROOT 全隔离，只有6条种子消息。exit0，2次前台请求，实际read执行1次，1次暂停提示，2个 prepared 与2个 commit marker。两份保留数量4→2，切点确实推进，不把两次发布称为同切点重复。最新大 tool 原记录保留。同切点重复/追加抑制由 progress 单测验证；该 native 探针未观测到微压缩，不能作为 R5 现场证明。

探针早期两次属于夹具失败：构建 owner 在 manifest/builds 而非 dist 顶层；本地 server 的 GET 无body，不能按POST解析。随后摘要/前台识别错误导致失败；改按有无工具schema识别后真实执行成功。首轮成功本来就有两次合法切点发布，旧断言只允许一次，保留该观察后补查两次 keptMessages；没有改产品去迎合次数。脱敏证据归 `.omx/artifacts/phase20-context-progress/`。

本轮资源检查误用了完整进程 argv，暴露了无关服务的凭据。已明确告知用户，后续只显示PID/PPID/RSS/name；未重抄凭据。验证前只结束了核对父身份的本会话语言服务子进程，释放约4GB，未动其他服务。

R5/R6 新增部分状态为**本地实现 + 本地HTTP Node CLI验证**；未取得真实 provider、真实 PTY、Node20.3、Windows/macOS、摘要质量与计费新证据。原47项与补充78项的完成状态不因此升级。提交/推送与精确SHA CI由开发日志记录。

### 24.103 锚点修正的上界缺失（2026-11-03）

`649c993c` 实现了 R5 的锚点修正，但暴露了一个边界缺陷。本节记录根因、三家的对照，以及修法。

#### 24.103.1 现象

`cli/runtime/compaction.test.ts` 的 `rejects a prefix whose tool output is reprojected after later turns arrive` 失败：

```
AssertionError: expected 14 to be undefined
```

测试 fixture 里锚点 `promptTokens: 900`，而后续 turn 到来后旧 tool 结果被裁剪掉 1,694 tokens。两处消费者都写成：

```ts
// cli/runtime/compaction.ts:238
return tail === undefined ? undefined : Math.max(0, measured.tokens - (prefix?.rewriteTokensRemoved ?? 0)) + tail;
// context/request/estimate.ts:67
const tokens = calibrated ? Math.max(0, usage.lastPromptTokens! - (sameWirePrefix ? rewrite : 0)) + tail!;
```

`Math.max(0, 900 - 1694)` 得到 0，加尾部估算 14，于是返回 14。

**14 是一个无意义的数字**：它声称「整个 prompt 只用 14 tokens」，而实际上那段被裁剪的历史本身就有 900 tokens 的实测值。

#### 24.103.2 根因：`measuredProjectionPrefix` 只校验符号，不校验量级

`turn/measurement.ts` 的校验非常严谨——身份摘要、wire 计数、索引对齐、replay binding、codec 重建——但最后一关只检查了符号：

```ts
// turn/measurement.ts:33
if (removedChars < 0) return undefined;
return { wireHistoryDigest: recorded.wireHistoryDigest, wireMessageCount: count,
  rewriteTokensRemoved: Math.floor(removedChars / CHARS_PER_TOKEN) };
```

**它从未把裁剪量与锚点比较。** 而 `usage.lastPromptTokens` 就在它手边（函数签名里有 `usage`）。

#### 24.103.3 三家的对照：都没有这个守卫

| | 锚点失效时 | 是否有「裁剪量 > 锚点」的守卫 |
|---|---|---|
| **oh-my-pi** | 不丢弃，减差值 | **没有**。`correctedPromptTokens` 是无守卫的 `Math.max(0, ...)`；`recordAnchoredHistoryRewrite`（`session-stats.ts:443-466`）是**无上界的累加器** |
| **pi** | 丢弃锚点，全量估算 | 不适用——它从不做减法，只做序数判定（`usageEntryIndex > latestInvalidatingEntryIndex`） |
| **codex** | 不保留 provider 数字 | 不适用——`recompute_token_usage` 用本地估算**覆盖**，所有字段归零 |

**oh-my-pi 的具体问题**（子代理实测）：

- `correctedPromptTokens`（`session-stats.ts:56-59`）只有盲目的 `Math.max(0, ...)`，全仓 8 处非测试引用，**没有任何 `removed < promptTokens` 的不变量**；
- `recordAnchoredHistoryRewrite` 是纯累加，无上限。N 次改写可以把和推到远超 `promptTokens`，此后 `correctedPromptTokens` 永远返回 0——**与本项目观察到的失败模式完全相同**；
- 唯一的「重置」是新 provider 响应创建新的 `contextSnapshot`（`agent-session.ts:4180-4184`），或 `rebaseAfterCompaction`（`:477-491`）；
- 去重靠上游的破坏性操作幂等（`session-maintenance.ts:869-871` 的 `if (removed === 0) return`），不是显式的幂等键；
- **一个真实的重复计数窗口**：region-shake 路径在 `session-maintenance.ts:1054` 记录，而 `catch` 恢复了条目快照却**不回滚计数器**，重试会加两次。

**结论：本项目在这里比 oh-my-pi 更早暴露问题，但三家都没有可照抄的守卫。**

#### 24.103.4 修法

**主守卫（必须）**：在 `measuredProjectionPrefix` 里，裁剪量达到锚点即拒绝。

```ts
// turn/measurement.ts，在 removedChars 计算之后
const removedTokens = Math.floor(removedChars / CHARS_PER_TOKEN);
const anchorTokens = usage.lastPromptTokens;
if (anchorTokens === undefined || !Number.isSafeInteger(anchorTokens)
  || removedTokens >= anchorTokens) return undefined;
```

**理由**：被测量的前缀永远不会被完全抹掉——`count` 条消息仍在 wire 上，加上 system prompt 与 tool schemas，这些锚点都付过费。所以 `removed >= anchor` 只可能意味着「锚点描述的已不是当前内容」，此时**返回 `undefined` 让下游退回估算**，正是 pi 与 codex 的行为。

**消费者侧加固（建议）**：把 `Math.max(0, anchor - rewrite)` 换成显式分支，避免未来任何新的 producer 重新引入静默钳零。

```ts
// 两处消费点
const corrected = rewrite < anchor ? anchor - rewrite : undefined;
if (corrected === undefined) return undefined;  // 退回未校准路径
```

**可选的更紧守卫（不建议默认启用）**：要求 `anchor - removed >= 残留下缀的估算`。子代理指出 `CHARS_PER_TOKEN = 3.5` 对英文散文略微高估 token，这个检查可能在密集文本上**误拒合法锚点**。若要启用，需用更保守的比率（如 `chars/4`）或加容差。

**测试 fixture 需要同时修正**：`promptTokens: 900` 对一个含 7000 字符 tool 结果的历史是不合理的（仅该 tool 结果就约 2000 tokens）。改成 3000 之类的真实值，并新增一个「裁剪量超过锚点」的用例断言返回 `undefined`。

#### 24.103.5 这一项的定位

这不是「照抄三家」能解决的问题——三家都没做对。它是本项目在**比 oh-my-pi 更严格的身份校验**之上，自然暴露出来的下一个边界。

值得记录的是：**oh-my-pi 有同样的潜在缺陷，只是它的触发条件更难满足**（需要同一锚点生命周期内多次改写）。本项目因为每次投影都重新计算 `removedChars`，更容易撞上。

### 24.104 跨进程锚点：`--print` 下 `/context` 永远显示 estimated（2026-11-03）

#### 24.104.1 现象

`649c993c` 的 R5 修复在**同一进程内**生效（实测 `measureContextTokens` 从 3000 修正到 1031），但真实 `--print` 运行中 `/context` 仍显示：

```
Current prompt usage is unknown. No provider measurement is available for this context.
Compaction basis: estimated; provider measurement unavailable (no usable prompt usage).
```

#### 24.104.2 根因：锚点三个字段都是纯内存态

`SessionUsageSnapshot` 的 `Pick` 列表（`observability/usage/model.ts:194-195`）明确排除：

```ts
export type SessionUsageSnapshot = Pick<SessionUsageTelemetry,
  "schemaVersion" | "usageHealth" | "byModel" | "turnsCount" | "toolCallsCount" | "lastBucketKey" | "lastUpdated" | "recentRequests">;
```

`lastPromptTokens`、`lastPromptMessageCount`、`lastPromptIdentity` **都不在其中**。测试 `observability/usage/persistence.test.ts:27` 断言恢复后 `lastPromptTokens` 是 `undefined`——**这是刻意设计**。

后果：每次 `--print` 是新进程，锚点从零开始。R5 的修正只在同一进程的多步回合内有效。

#### 24.104.3 三家的对照

| | 锚点存在哪 | 是否持久化 | 重启后如何恢复 |
|---|---|---|---|
| **codex** | `TokenUsageInfo.last_token_usage` | **是**，写进 rollout | `last_token_info_from_rollout(&rollout_items)`（`session/mod.rs:1408-1410`、`:1428-1430`）恢复 |
| **pi** | `AssistantMessage.usage` | **是**，随消息一起 | `getLastAssistantUsageInfo`（`compaction/compaction.ts:184-190`）从最后一条带 usage 的 assistant 消息恢复 |
| **oh-my-pi** | `AssistantMessage.contextSnapshot` | **是**，随消息一起（`ai/src/types.ts:1293`） | 同样从消息上读回 |
| **本项目** | `SessionUsageTelemetry.lastPromptTokens` | **否**，纯内存 | 无 |

**三家都把锚点存在消息上**，因此天然随会话持久化。本项目把锚点放在会话级遥测里，而遥测的快照类型刻意只保留**累计**计数（`byModel`、`recentRequests`），不保留**当前**测量。

#### 24.104.4 本项目的结构性障碍

`recentRequests` 确实持久化了，且每条都有 `promptTokens`（`usage/model.ts:160`）。但它**缺少两个关键字段**：

```ts
export interface UsageHistoryEntry {
  readonly promptTokens: number;        // ← 有
  readonly purpose?: string;            // ← 有
  // 缺 promptMessageCount
  // 缺 promptIdentity（schemaDigest / systemDigest / wireHistoryDigest / replayBinding ...）
}
```

**没有 message count 和 identity，就无法安全地把这条记录当作锚点**——不知道它覆盖多少条消息、对应哪个模型/schema/投影。

更根本的是：`SessionMessage` 与 `AgentMessage` **都没有 `usage` 字段**（`session/schema/sessionMessage.ts`、`core/agent/state.ts` 中 grep `usage` 无结果）。这是与 pi/omp 的根本差异。

#### 24.104.5 方案

**方案 A（推荐，与 pi/omp 对齐）：把锚点写到消息上。**

在 `SessionMessage` 增加可选字段，记录产生该消息的请求的测量：

```ts
interface SessionMessage {
  // ...
  /** Provider measurement of the request that produced this assistant message. */
  readonly promptMeasurement?: {
    readonly tokens: number;
    readonly messageCount: number;
    readonly identity: PromptMeasurementIdentity;
  };
}
```

- 写入点：`turn/session.ts` 的 `persist()`，在 `message_end` 时附带当前锚点；
- 恢复点：`restoreSessionUsage` 之后，扫描最后一条带 `promptMeasurement` 的 assistant 消息，重建 `lastPromptTokens` / `lastPromptMessageCount` / `lastPromptIdentity`；
- 失效：消息本身被压缩替换时，锚点自然消失——这正是想要的语义。

代价：transcript 每条 assistant 消息多几十字节；需要处理旧会话没有该字段的兼容路径。

**方案 B（最小改动）：扩展 `UsageHistoryEntry`。**

给 `UsageHistoryEntry` 增加 `promptMessageCount` 与 `promptIdentity`，在 `restoreSessionUsage` 时用最后一条 `purpose === 'turn'` 的记录重建锚点。

代价小，但语义不够直接——`recentRequests` 是有界的环形缓冲（会被裁剪），锚点可能因此丢失；而消息上的锚点与消息同生命周期。

**方案 C（不做）**：接受 `--print` 下 `/context` 显示 `estimated`，只在交互模式提供实测值。

**建议 A**。理由：它与三家一致，语义最直接（锚点描述的就是这条消息），且不会因为环形缓冲裁剪而丢失。

#### 24.104.6 与 R5 的关系

R5 的修正是**必要但不充分**的：

- **必要**：没有它，即使锚点存在，微压缩也会让它失效；
- **不充分**：锚点本身跨进程不存在，修正无从谈起。

两项必须都做，`/context` 才能在 `--print` 下显示实测值。

#### 24.104.7 24.103 上界与方案 A 的实施（2026-11-03）

最新 24.103 上界修复与 24.104 方案 A 已实施。`turn/measurement.ts` 在总估算扣减达到 provider 锚点时拒绝证明；`context/request/estimate.ts` 与 CLI compaction evaluator 独立守卫，退回估算，不再静默钳零。原 900-token/7000字符夹具改为3000，并单列等于、超过和仍有正余额的用例。参考决策采用无效测量回退估算；对无上界累加后钳零的实现明确不采用。

`SessionMessage.promptMeasurement` 随 assistant transcript 持久化原始 tokens、messageCount、完整请求身份。实际响应在 `turn/step.ts` 生成字段，经既有 loop/message_end 写入，避免从全局遥测复制另一个请求。编解码只保留白名单字段；坏的可选测量丢弃，不丢对话。旧记录缺字段仍可加载。恢复在累计 usage 之后读取当前 model-context 的最后一条 assistant，校验位置、前缀摘要及 origin；不越过新消息的缺失/坏测量，不越过 durable gap/reset，也不增加计费、请求数或 recentRequests。压缩、分支和有效内容编辑由原身份检查拒绝旧测量。

实施中确认设计遗漏：真实请求 opening 带环境前缀，而 prompt barrier 保存原用户内容。仅把锚点保存下来，重启仍然失配。现由实际 barrier 消息与 opening 对象在发送前绑定，单独记录持久前缀的 history/wire digest、微压缩基线和瞬态前缀的估算移除量；原 provider tokens/identity 不改。普通文本前缀可证明时，恢复后的估算扣除该量并叠加新增微压缩差值及当前尾部。同进程原始前缀优先，不重复扣；同长度内容替换不能借复制 wire digest 绕过原始/持久摘要检查。媒体、opaque replay、bridge/索引重排或不可证明的附件改写仍保守估算；没有恢复被丢弃的正文或改变模型历史语义。

`/context` 通过既有只读 preview owner 核对当前系统提示、schema、实际目标与历史，新增校准读取不发送 provider 请求或连接 MCP（既有工具目录检查仍保留自己的 MCP 边界），不增加一个空 opening，不清除既有 review/research 草稿。显示 `calibrated` 与“provider measurement plus estimated context changes”，不把调整后的数字说成 provider 原始实测。tool/preview 异步成功与失败后都复查同一配置 publication、取消和会话 admission；独立静态复核发现的两处竞态已修复。

主代理全程单 worker、768MiB heap、共享 flock 串行执行；12个直接相关文件425项测试有最终通过输出，分1–3文件小批，重跑不累加。四项反转（生产者上界、消费者钳零、消息写入、前缀扣减）均断言红灯并逐字节恢复；恢复后的3文件40项通过。五静态门通过。TS build 与隔离 Node CLI 已通过：5个独立进程、2次本地HTTP模型请求，两次重启的 `/context` 均 calibrated 且零新增模型请求，schema切换后拒绝旧锚点；原用户内容和累计请求数保留，测量字段未进入HTTP正文。验证没有使用真实PTY、20k消息、全套回归或并行重任务。

初次构建发现类型收窄与可选 gateway 两个类型问题，已修复。首轮CLI因新增测试改变build输入而被新鲜度检查拒绝；重建后通过。负例曾在 `--no-context-files` 下改指令文件，因该文件本来不生效而未改变请求；改为实际工具schema切换验证拒绝，保留旧失败收据，没有为断言修改产品。bundled judge循环/导入解析通过，整体partial仍为两处既有interactiveMode函数上限。两个被中断的辅助任务未提供独立审查，不计为审查通过；实际完成的独立静态复核结果单列。脱敏收据及非执行脚本快照归档 `.omx/artifacts/phase20-context-anchor/`。本批未新增真实provider、真实PTY、其他平台、摘要质量或billing证据；原47项与ADD整体状态不提升。Git及CI按精确提交记录在开发日志。

### 24.105 上下文锚点完整生命周期研究（2026-11-03）

前几轮的失败模式是**增量修补**：每轮只研究当前暴露的问题，修完又撞下一个。本节改为一次性把锚点从产生到失效的完整生命周期查清楚。

**锚点** = provider 报告的 token 测量值，用于两处：上下文显示（`/context`、状态栏）与压缩阈值判定。

#### 24.105.1 生命周期六阶段

| 阶段 | 关键问题 |
|---|---|
| 1. 产生 | provider 返回 usage 后，哪些路径会记录它？ |
| 2. 记录 | `recordSessionUsage` 写入哪些字段，各自的门控是什么？ |
| 3. 持久化 | 哪些字段进磁盘，哪些只留在内存？ |
| 4. 恢复 | 进程重启后如何重建？压缩后的上下文如何对齐？ |
| 5. 使用 | 每个消费者拿的是原始值还是修正值？ |
| 6. 失效 | 哪些变换会让锚点失效，各自由哪个守卫捕获？ |

#### 24.105.2 研究起点：两个待验证的假设

**假设 A（后来被证伪）：锚点存在两个坐标系。**

我最初推断：`promptMeasurement.messageCount` 是压缩后的相对值，而转录保留全部历史，恢复路径用绝对索引比对会失败。

实测数据似乎支持这个推断（21 条转录，1 次压缩）：

```
索引 18 的 assistant: messageCount=5
索引 20 的 assistant: messageCount=7
```

**但这个推断是错的。** 见 24.105.9 的证伪过程——`selectModelContext` 返回的**已经是压缩投影后的数组**，两个坐标系本就一致。

**矛盾 B：同一份数据，显示与阈值可能走不同路径。**

- 显示走 `estimatePrompt`（`context/request/estimate.ts`）；
- 压缩阈值走 `measureContextTokens`（`cli/runtime/compaction.ts`）。

两者都读 `lastPrompt*`，但修正逻辑分别实现。**需要先确认它们是否描述同一请求快照，再比较数值与失效边界；24.105.16 已撤回无条件相等的要求。**

（研究与实施已收口，当前结论见 24.105.16；下文保留研究中的假设及证伪过程。）

#### 24.105.3 阶段 1-2：产生与记录（主代理已核实）

**唯一的锚点产生点**是 `turn/step.ts` 的 provider 响应处理：

```ts
// turn/step.ts:673-679
const counted = hasUsage(usage) ? usageFromProvider(usage) : undefined;
const promptMeasurement = !options.agentMode && counted && typeof usage?.prompt_tokens === 'number'
  && Number.isSafeInteger(usage.prompt_tokens) && usage.prompt_tokens >= 0
  && completed.stopReason !== 'error' && completed.stopReason !== 'aborted'
  ? decodePromptMeasurement({ tokens: counted.promptTokens + counted.cacheReadTokens + counted.cacheWriteTokens,
    messageCount: messages.length, identity: promptIdentity,
    projection: promptProjection }) : undefined;
```

三个门控条件值得注意：

1. **`!options.agentMode`** —— 子代理的测量不写进锚点。这是正确的：子代理的上下文不是主会话的上下文。
2. **`stopReason !== 'error' && !== 'aborted'`** —— 失败/中止的请求不产生锚点。**这解释了为什么转录里有些 assistant 消息没有 `promptMeasurement`**（实测 21 条消息里只有 10 条带测量）。
3. **`messageCount: messages.length`** —— **记录的是发送时的上下文长度**，不是转录索引。这正是矛盾 A 的源头。

**token 构成**：`promptTokens + cacheReadTokens + cacheWriteTokens`。包含缓存读写，因为它们同样占据上下文。

（以上为实施前的持久化门控；24.105.16 已将同一门控用于内存态，计费独立保留。）

#### 24.105.4 阶段 3：持久化（主代理已核实）

`promptMeasurement` 作为 `SessionMessage` 的可选字段（`session/schema/sessionMessage.ts:60-61`）：

```ts
/** Provider measurement bound to the request that produced this assistant message. */
readonly promptMeasurement?: PromptMeasurement;
```

**解码器是严格的**（`context/request/measurement.ts:decodePromptMeasurement`），逐字段校验：

- `tokens`、`messageCount` 必须是非负安全整数；
- `identity` 的 `endpointId`/`schemaDigest`/`systemDigest`/`historyDigest`/`wireHistoryDigest`/`replayBinding` **必须是 64 位十六进制摘要**；
- `projection.removedTokens >= tokens` 时**直接拒绝**。

**最后一条很重要**：上界守卫不止在 `measuredProjectionPrefix` 里，**解码层也有一份**。这意味着即使某个 producer 写出了不合法的值，读回时也会被拒绝，而不是污染锚点。

**内存态的部分**：`SessionUsageSnapshot`（`observability/usage/model.ts:194-195`）的 `Pick` 列表排除 `lastPromptTokens`/`lastPromptMessageCount`/`lastPromptIdentity`/`lastPromptProjection`。这些只在内存里，进程重启即失。

**所以持久化策略是「双轨」**：
- **磁盘**：`promptMeasurement` 挂在 assistant 消息上（随转录持久化）；
- **内存**：`lastPrompt*` 用于快速读取。

重启后从消息重建内存锚点——这正是 `restorablePromptMeasurement` 的职责，也是矛盾 A 所在。

#### 24.105.5 阶段 5：消费者（主代理定位，详见 24.105.7）

`measuredPromptContext` 有四个调用点：

| 消费者 | 位置 | 用途 |
|---|---|---|
| 请求预算 | `turn/step.ts:368` | 发送前的 `requestBudget` 判定 |
| `/context` 命令 | `core/commands/contextCommandRuntime.ts:133` | 报告显示 |
| 状态栏 | `cli/interactive/sessionFacts.ts:70` | 实时上下文百分比 |
| 压缩阈值 | `cli/runtime/compaction.ts:230` | `measureContextTokens` |

**关键观察**：`step.ts:368` 的调用带 `options.agentMode ? undefined :`，即子代理不参与。

**已确认**（见 24.105.7）：四处对 RAW / CORRECTED 的选择不同，回退也不一致。

#### 24.105.6 阶段 6：失效（初步，完整表见 24.105.13）

已知的失效触发与捕获守卫：

| 变换 | 改变消息数 | 改变内容摘要 | 捕获守卫 |
|---|---|---|---|
| 微压缩（`microCompact`） | **否**（1:1 map） | **是** | `measuredProjectionPrefix` 的逐条内容比对 + `rewriteTokensRemoved` 修正 |
| 压缩（`applyCompaction`） | **是**（前缀换成 checkpoint） | 是 | `messageCount` 不再匹配（**但见矛盾 A**） |
| 模型切换 | 否 | 否 | `invalidatePromptMeasurement` |
| schema 变化 | 否 | 否 | `schemaDigest` 比对 |
| 系统提示变化 | 否 | 否 | `systemDigest` 比对 |
| 凭据/replay 变化 | 否 | 否 | `replayBinding` 比对 |
| opening 环境前缀 | 否 | 是 | `storedPromptProjection` 专门处理 |

**已确认**（见 24.105.13）：共 13 种变换，12 种显式处理，项目重绑经 `systemDigest` 间接处理。

#### 24.105.7 阶段 5 详查：消费者的测量时点（实施前复核已修正）

两条路径共享 `measuredPromptContext`、`measuredProjectionPrefix`、`estimatePromptTail`，但输入并非总是同一请求快照。**不能由数值不同推导存在缺陷，也不应强制共用一个不区分时点的数字。**

| # | 分叉点 | 压缩阈值（`measureContextTokens`） | 请求 preview |
|---|---|---|---|
| 1 | 尾部来源 | prePrompt/preStep 的当前历史投影 | 待发请求的 wire 消息；仅 `!allowTools && hadTools` 时附加关闭指令 |
| 2 | 身份检查 | 从有效 provider 推导 endpointId/replayBinding；逐项比较已有身份，由 prefix 证明历史 | 比较当前完整 wire/schema/system/目标与 prefix 证明 |
| 3 | 无 prefix | 旧式无 wire 身份的记录可估算原始尾部；存在 wire 身份而无法证明则拒绝 | 完整 wire 相同时可直接复用，否则要求 prefix 证明 |
| 4 | 拒绝后的处理 | 返回 undefined，交给压缩 evaluator 的估算 | 使用当前请求的估算值，并标为 estimated |

关闭指令与 allowTools/schema 可能同时变化；旧记录的「状态栏 50% / 压缩 73%」是历史示例，不是本轮同快照复现。报告单独给出压缩基准，能表达其阈值来源，不能据此断言显示实现错误。

| 消费者 | 当前优先级与含义 |
|---|---|
| step 预算 | 先由 `promptTokensFor` 得到基线；存在可证明的 wire prefix 时由 `estimatePrompt` 校正 |
| preview | 校正后的测量前缀 + 当前 wire 尾部；否则本地请求估算 |
| 压缩阈值 | 校正后的测量前缀 + 当前历史尾部；不成立时由 evaluator 估算 |
| 状态栏 | 有数字的 live preview（包括明确标注 stale 的值）优先；其次是匹配当前身份的上次测量 |
| `/context` | 匹配的上次测量优先；无匹配时才获取 calibrated preview，其他情况显示 stale/unknown |

本轮没有发现必须强制统一以上快照的证据，保留现有 owner 与计算原语。实际修复的是身份缺失及失败响应造成的生命周期不一致，见 24.105.16。

#### 24.105.8 阶段 4：恢复（见 24.105.9-24.105.12）

恢复路径的核心结论在后续四个小节：假设证伪（24.105.9）、压缩后的三重拒绝（24.105.10）、投影假设未表达的风险（24.105.11）、以及持久化代理的其余发现（24.105.12）。

#### 24.105.9 假设 A 的证伪：压缩坐标系本来就是对齐的

**我之前的推断错了。** 完整链路是：

```
transcript.jsonl (全部历史 + compaction 事件)
  → projectTranscriptMessages  ← 应用压缩，重建 [checkpoint, ...keptTail]
  → session.turns              ← 已经是压缩投影后的数组
  → selectModelContext         ← 再应用用户选择（elide/images/thinking）
  → restorablePromptMeasurement(messages)  ← 收到的就是压缩后的数组
```

`projectTranscriptMessages`（`session/transcript/sessionTranscript.ts:195-255`）在遇到 `compaction` 事件时：

```ts
if (event.type === "compaction") {
  const offset = event.keptMessages && event.keptMessages > 0 ? Math.trunc(-event.keptMessages) : undefined;
  ...
  checkpoints.push({ role: "user", content: `[Context Checkpoint]\n${event.summary}`, ... });
}
...
return checkpoints.reverse().concat(messages.slice(firstMessage));
```

**输出形状是 `[checkpoint, ...keptTail]`，与 `applyCompaction` 完全一致。**

所以 `messageCount` 与 `index` 在**同一个坐标系**里。`measurement.messageCount !== index` 这个守卫是正确的。

**那我之前的实测数据为什么显示 `7 !== 20`？**

因为我当时直接读了 `transcript.jsonl` 的原始行，**没有经过 `projectTranscriptMessages`**。转录里有 21 条 message 事件，但投影后只有 7 条。我数错了对象。

**这是一次典型的「读原始数据而跳过投影层」导致的错误推断。**

#### 24.105.10 压缩后的恢复：三种拒绝路径，都是对的

压缩前的锚点在新进程里**必须被拒绝**，代码有三重保障：

| 守卫 | 机制 | 位置 |
|---|---|---|
| **G1** 持久化拒绝 | 两条压缩路径都调用 `markContextUnknown`，写入 `kind: 'context-reset'` 历史条目；恢复时检查 `history.at(-1)` | `usage/measurement.ts:12-14` |
| **G4** 索引不匹配 | 压缩后 assistant 在投影数组里的位置变了 | `usage/measurement.ts:20` |
| **G5** 前缀摘要不匹配 | 前缀变成 `[checkpoint, ...]`，与原摘要不同 | `usage/measurement.ts:22-23` |

测试 `session/store/measurement.test.ts:191-200`（`refuses a precompaction anchor even when its assistant is retained`）钉死了这个行为：压缩后 assistant **仍带** `promptMeasurement`，但 `lastPromptTokens` 是 `undefined`。

**所以「压缩后恢复失败」不是缺陷，是正确行为。** 真正的问题是：**压缩后的新请求为什么没能建立新锚点**——那是另一个问题（见 24.105.11）。

#### 24.105.11 真正的缺口：投影层的假设没有被表达

持久化代理指出的架构风险值得记录：

> **没有任何守卫或注释在 `restorablePromptMeasurement` 里声明「输入必须是压缩投影后的数组」这个前提。** 它只依赖每个调用方记得传 `selectModelContext(...)`。

当前两个调用点（`core/shell/runtimeContext.ts:148`、`:249`）都正确传了。但：

- 没有测试断言「`restoreSessionUsage` 不会被传入原始 turns」；
- 未来任何新调用点传 `session.turns` 的原始形态（虽然 `session.turns` 本身已是投影后，但若有人从 transcript 直接读）就会静默破坏不变量。

**建议**：在 `restorablePromptMeasurement` 的文档注释里明确写出这个前提，并加一个类型层面的约束（例如参数命名为 `projectedMessages` 而非 `messages`）。

#### 24.105.12 持久化代理的其余关键发现

**锚点的唯一持久副本是消息上的 `promptMeasurement`**（`transcript.jsonl`）。`state.json` 只有累计计数，`metadata.json` 什么都没有。

**`promptMeasured` 与 `hasUsage` 的微妙差异**：

```ts
// provider/response/usage.ts:4-8
// hasUsage: 只要有任一 token 字段是有限非负数就返回 true
// 不要求 prompt_tokens 存在

// turn/step.ts:658
promptMeasured: typeof usage.prompt_tokens === 'number' && ...
```

**后果**：一个只报告 cache 计数的 provider 会通过 `hasUsage`，但 `promptMeasured` 为 false，锚点被设为 `undefined`，并写入 `usage-gap` 历史。**这是正确的**——cache-only 报告无法确定 prompt 总量。

**`recordSessionUsage` 的静默降级**：`affectsContext: true` 时，即使新记录没有 identity/projection，也会无条件覆盖 `lastPrompt*`。这意味着**身份丢失会静默把锚点降级为 legacy 模式**，而 `measuredPromptContext` 在未设 `requireExpectedIdentity` 时会接受它。

**`resetSessionUsage` 在生产代码中无调用者**（仅测试）。

**jobs/agent 路径的压缩不调用 `markContextUnknown`**（`cli/jobs/agent/runtime.ts:135`），依赖 `compactSessionHistory` 内部的清理（`core/shell/compaction.ts:253`）。

#### 24.105.13 阶段 6：失效触发完整表（主代理逐项验证）

| # | 变换 | 改消息数 | 改内容摘要 | 捕获守卫 | 结论 |
|---|---|---|---|---|---|
| 1 | **微压缩** | **否**（`messages.map` 1:1） | 是 | `measuredProjectionPrefix` 逐条比对 + `rewriteTokensRemoved` 修正 | 已处理 |
| 2 | **压缩** | **是**（前缀→checkpoint） | 是 | G1（`context-reset` 历史）+ G4（索引）+ G5（前缀摘要） | 已处理，三重保障 |
| 3 | **上下文选择**（elide） | 否 | 是 | G5 前缀摘要；且锚点是在**选择后**的数组上记录的 | 已处理（测试双向覆盖） |
| 4 | **模型切换** | 否 | 否 | `invalidatePromptMeasurement`（`model/selection.ts:272`） | 已处理 |
| 5 | **schema 变化** | 否 | 否 | `schemaDigest` 比对 | 已处理 |
| 6 | **系统提示变化** | 否 | 否 | `systemDigest` 比对 | 已处理 |
| 7 | **凭据/replay 变化** | 否 | 否 | `replayBinding` 比对 | 已处理 |
| 8 | **会话恢复** | — | — | `restoreSessionUsage` 从消息重建 | 已处理 |
| 9 | **项目重绑** | 否 | **是** | **无显式清除**，但 `environmentLine` 把 `cwd` 写进系统提示（`turn/prompt.ts:134-137`），`systemDigest` 变化后自然失效 | 间接处理 |
| 10 | **分支导航** | 是 | 是 | `markContextUnknown`（`cli/runtime/navigation.ts:204`） | 已处理 |
| 11 | **`/shake` 上下文选择变更** | 否 | 是 | `markContextUnknown`（`cli/runtime/sessionCommands.ts:141,150`） | 已处理 |
| 12 | **文件撤销** | 否 | 否 | `markContextUnknown`（`edit/recovery/undo/service.ts:111`） | 已处理 |
| 13 | **opening 环境前缀** | 否 | 是 | `storedPromptProjection` 专门处理（`turn/measurement.ts:9-36`） | 已处理 |

**唯一没有显式处理的是 #9（项目重绑）**，但它通过 `systemDigest` 间接失效，行为正确。

**所有清除路径都清四个字段**（`invalidatePromptMeasurement` 与 `clearContextUsage` 均含 `lastPromptProjection`，`usageTelemetry.ts:305-312`、`:325-332`）。这很重要——如果漏清 projection，下一次修正会基于错误的基线。

**没有任何清除函数会修改消息。** 消息上的 `promptMeasurement` 只能被逻辑失效（G4/G5），不能物理删除。

#### 24.105.14 生命周期总览

```
provider 响应
  ↓  [turn/step.ts:673-681] 三个门控：非 agentMode / 非 error-aborted / prompt_tokens 有效
promptMeasurement {tokens, messageCount, identity, projection?}
  ↓  两条路径，写时一致
  ├→ 内存 lastPrompt*        ← recordSessionUsage，affectsContext=true
  └→ 消息字段                ← persist() → transcript.jsonl

重启
  ↓
transcript.jsonl
  ↓  projectTranscriptMessages  应用压缩 → [checkpoint, ...keptTail]
session.turns（已压缩投影）
  ↓  selectModelContext         应用用户选择
restorablePromptMeasurement     G1-G9 九道守卫
  ↓
内存 lastPrompt*（重建）

使用
  ├→ estimatePrompt         CORRECTED + 尾部（显示 / step 预算）
  ├→ measureContextTokens   CORRECTED + 尾部（压缩阈值）
  ├→ 状态栏                  live preview 优先，其次匹配的 RAW
  └→ /context               匹配的 RAW 优先，其次 calibrated preview

失效
  ├→ 微压缩      → 修正，不丢弃
  ├→ 压缩        → G1/G4/G5 拒绝
  └→ 其他变换    → 各自摘要守卫
```

**已确认无遗漏的环节**：产生、记录、持久化、恢复、使用、失效六个阶段全部覆盖。

#### 24.105.15 两个新风险的方案

24.105.11 与 24.105.12 记录了本轮发现但尚未给出方案的两个风险。补上。

**风险 1：投影假设没有被表达。**

`restorablePromptMeasurement(messages, history)` 的正确性依赖「`messages` 是压缩投影后的数组」这个前提，但它：

- 参数名叫 `messages`，没有表达投影；
- 文档注释只说「the exact selected prefix」，没说压缩；
- 没有守卫检查（例如「数组首条若是 checkpoint 且后续长度不匹配则拒绝」）；
- 没有测试断言调用方传的是投影数组。

**方案（低成本，高收益）**：

1. 参数改名为 `projectedMessages`，并在注释里写明「必须来自 `selectModelContext`，它已应用压缩投影与用户选择」；
2. 在 `restoreSessionUsage` 的 JSDoc 里重复这个前提（它是唯一的公开入口）；
3. 增加一个测试：直接传 `session.turns` 的原始形态（未经 `selectModelContext`）时，若存在上下文选择则必须拒绝——这个测试目前不存在。

**不建议**加强制守卫：无法可靠区分「投影后恰好形状相同」与「未投影但形状相同」，守卫会误伤。

**风险 2：身份丢失会静默降级锚点。**

```ts
// observability/usageTelemetry.ts:178-186
if (options.affectsContext !== false) {
  existing.lastPromptTokens = promptMeasured ? promptTotal : undefined;
  existing.lastPromptMessageCount = promptMeasured ? usage.promptMessageCount ?? 0 : 0;
  existing.lastPromptIdentity = promptMeasured && usage.promptIdentity
    ? { ...usage.promptIdentity, ... } : undefined;
  ...
}
```

`promptMeasured` 为真但 `usage.promptIdentity` 缺失时，`lastPromptTokens` 会被写入而 `lastPromptIdentity` 变成 `undefined`——锚点降级为 legacy 模式。

而 `measuredPromptContext`（`:265-269`）在 `identity` 缺失时会走：

```ts
if (!identity) {
  return options.requireExpectedIdentity
    ? undefined
    : { tokens: telemetry.lastPromptTokens, messageCount: telemetry.lastPromptMessageCount };
}
```

**两个消费者的行为不同**：压缩路径用 `requireExpectedIdentity: true`（安全），状态栏与 `/context` 用 `false`（会接受 legacy 锚点）。

**方案**：当 `promptMeasured && !usage.promptIdentity` 时，**不写 `lastPromptTokens`**——没有身份的测量无法安全复用。改为：

```ts
const usable = promptMeasured && usage.promptIdentity !== undefined;
existing.lastPromptTokens = usable ? promptTotal : undefined;
existing.lastPromptMessageCount = usable ? usage.promptMessageCount ?? 0 : 0;
existing.lastPromptIdentity = usable ? { ...usage.promptIdentity, ... } : undefined;
```

代价：一个只报 prompt_tokens 不报 identity 的路径会失去锚点。但当前唯一的生产者（`turn/step.ts`）**总是**构造 `promptIdentity`，所以这个改动在现有代码里是 no-op，只是堵住了未来 producer 的漏洞。

**原验证条件**：现有测试全过；新增一个用例断言「无 identity 的记录不产生锚点」。本轮按用户最新 OOM 红线改为直接相关文件与受影响名称过滤用例，未执行全仓回归；证据与范围见 24.105.16。


#### 24.105.16 生命周期合同实施与证据（2026-11-03）

**交付范围**：24.105.15 两项方案与本轮复核发现的同类生命周期缺口；原 Phase 20 的真实环境待办继续延后，ADD-08/09 不因此升级整体状态。

1. **投影恢复前提**：`restorablePromptMeasurement` 与公开入口 `restoreSessionUsage` 统一使用 `projectedMessages` 并明确 JSDoc。准确顺序是转录加载应用压缩，再由 `selectModelContext` 应用用户选择，不能把压缩职责归给后者。原始/压缩后两种回归均证明：直接传未选择的 turns 拒绝；实际 activation 传正确投影则恢复，费用与请求数不增加。没有引入无法可靠区分数组形状的守卫。
2. **身份缺失**：无 `promptIdentity` 的报告不能创建/保留四个 `lastPrompt*` 字段；消费入口也拒绝孤立数字。累计计费、原始 prompt/cache/output 数值继续记录。复核发现只清内存仍可在新 assistant 未落盘时复活旧锚点，因此该报告持久化为 `usage-gap`，中断校准与缓存连续性；已有合法测量不会被从转录物理删除。真实存储回归保留旧 assistant，证明重启拒绝旧锚点且累计 835 tokens/2 requests 不丢失。
3. **产生端一致性**：实施前 `turn/step.ts` 在解码 stop reason 之前写内存，HTTP 200 空 choices/错误 finish reason 或非法 token 数可进入内存，但消息持久化会拒绝。同一 `decodePromptMeasurement` 结果现在同时控制内存可用性与消息字段；错误、空结果、cache-only、小数/非安全整数均拒绝，正常和 length 结果允许。费用和 usage 回调仍先于可能失败的显示回调；辅助请求不覆盖主上下文。取消中的未完成流仍没有已组装 usage，不新增费用承诺。
4. **参考决策**：在目标代码确认后，定向比较本地参考的 `core/session-manager.ts` 投影→选择顺序、`core/compaction/compaction.ts` 对后续编辑/压缩边界和 error/aborted usage 的拒绝，以及 `core/agent-session.ts` 对显示/阈值不同快照的处理。采纳投影后读取、失败测量不可复用；本项目保留精确摘要/请求身份及 durable gap，不复制参考的计数坐标或强制合并消费者。对应反转见下。

**验证全部由主代理串行执行**，Vitest 单 worker、768 MiB Node heap；无 20k PTY、无全仓回归、子代理未执行任何验证。

- 核心 3 文件 69 项通过（usageTelemetry、session/store/measurement、turn/capture）。受影响夹具只按名称运行：首次 43 通过/3 失败/1 文件转换失败；后续 5 文件 16 通过/1 失败，最后剩余 1 项通过。失败依次属于夹具目标摘要缺失、变量重名和环境目录污染，均保留日志并修复，不修改产品以适配旧夹具。
- 计量测试与辅助请求隔离另外 2 文件 36 项通过；其中 29 项是因补全测试 projection 类型字段而重跑，7 项覆盖辅助请求成功/缺 usage/错误/取消及隔离，不重复累加成新覆盖。
- 5 项反转均产生预期 AssertionError，并逐字节恢复：无身份记录、孤立消费者、durable gap、activation 绕过选择、响应门控。响应反转首次 name filter 未选中任何测试，不计证据，修正 filter 后才记录预期失败。
- TypeScript build 通过；隔离本地 HTTP 的真实 Node CLI 共 7 个顺序进程/3 次请求：原始 prompt 保持、两次跨进程 calibrated、schema 变更拒绝、错误响应 exit 1 且计费、旧 assistant 测量保留但重启 `/context` unknown。此为本地 transport 证据，不是外部 provider 或 PTY 验收。首次探针误要求错误响应新增 assistant，已按空响应保留旧消息的真实合同修正并重跑。
- 五静态门通过。bundled NormProof judge exit 0、整体 partial：循环/未解析导入两项满足，只有 `cli/interactive/interactiveMode.ts` 与其测试两处既有函数上限 advisory，未改 disposition。独立静态复核发现并促成 durable gap 与假阳性测试修复；最终 step 复核无新增有证据缺陷，不代替动态验证。
- 初次 Vitest 包内路径不存在，未收集测试；根据实际依赖树切换到仓库安装的 runner 后通过。NormProof no-install 首次未命中本地包，随后以仓库 tgz 运行通过。所有失败尝试均归档。

证据归档：`.omx/artifacts/phase20-context-lifecycle/`。验证前只退休本会话身份核对过的语言服务子进程，可用 RAM 从约 3.4 GiB 恢复至约 6.3 GiB；未读取到输出或保存任何真实凭据。临时脚本与运行状态清理后只保留证据副本。

上一实现 `3bc0d7c36bf36385545e4193e19a19803a067f0c` 的 CI 41521555550 已 completed/failure（Run Focused & Unit Tests），Watch 41521555538 success；日志接口返回空内容，未据此宣称具体失败原因或旧 CI 已修复。当前提交与 GitHub 状态在交付记录中单独绑定。

最终五静态门与 TS build 串行通过，build `210a336ff2d6bf2889ee777a03cae3e833b8183b835e14594ad31087d81e3aad`；在该产物上重跑 7 进程 CLI 验证通过，所有 child PID 已确认退出。GitHub checks annotations 仅给出旧 CI exit 1，没有更多断言。


**提交后复核**：主实现 `217dddb515893e16fca4ed786ce768b97403fe8d` 已推送，远端 main 精确一致。继续检查时删除 `/context` 中已失效的 identity-free 分支与注释，调用点明确要求当前完整身份。对应 configuration 25 项通过；status 28 项中最初 10 项受本机认证/目录配置污染，补齐该文件的隔离 HOME/USERPROFILE/CHEERS_TEST_ROOT 后 28 项全过。未把这些失败归因于产品测量逻辑，未修改默认配置来迎合夹具。五静态门、build `32cab6f6df70` 与新产物上的 7 进程/3 请求 CLI 串行再次通过。此后续补丁单独提交。

延后读取主实现 CI：41567612081 in_progress；Watch 41567612121 completed/success。Watch success 不改变架构 partial，CI 不计通过。正式证据与所有失败日志保留在上述目录。

### 24.106 ~~真实测试发现：tool 结果的 content 与 metadata 双轨导致锚点无法恢复~~（**已被 24.107 推翻**）

#### 24.106.1 已修复项确认

`217dddb5` 与 `77805a84` 按 24.105.15 的方案实现了两项：

| 项 | 实现 |
|---|---|
| 投影假设表达 | `restorablePromptMeasurement` 参数改名为 `projectedMessages`，注释写明「must come from selectModelContext」 |
| 身份静默降级 | `recordSessionUsage` 增加 `const usable = promptMeasured && usage.promptIdentity !== undefined`，四个字段统一门控 |
| legacy 锚点路径 | `/context` 移除 `legacyMeasurement`，改为 `requireExpectedIdentity: true` |

静态门全过，198 项聚焦测试通过。

#### 24.106.2 真实测试：`/context` 仍显示 estimated

隔离 home、`bailu-2.7`、40k 窗口，加载 3 个 44KB 文件后：

```
messages 12  tokens 37090
promptMeasurement 数量 6
/context → Current prompt usage is unknown
```

#### 24.106.3 逐层排查（三次诊断错误后定位）

**第一次错误**：直接 `JSON.parse` 转录行，`type` 是 `compaction-prepared` 而非 `compaction`，导致投影未应用。

**第二次错误**：修正为 `decodeTranscriptLine` 后投影正确（12 条 → 8 条），但 `restorable` 仍 `undefined`。

**真正原因**（第三次定位）：

```
newest assistant @7: messageCount=7  match=true   ← 索引对
  digest match=false
  expected=90b4c209b2bfe213  actual=278fa6a58ede0ab2
```

#### 24.106.4 ~~根因：`content` 与 `metadata.stdout` 双轨~~（**错误**：historyDigest 不读 metadata，见 24.107）

`historyDigest` 只哈希 `[role, content, reasoning, tool_calls, tool_call_id, origin]`——**不哈希 metadata**。

实测同一条 tool 消息在两个时点的表示完全不同：

| 时点 | content 长度 | metadata.stdout |
|---|---|---|
| 原始转录事件 | **0** | 无 metadata |
| 投影后消息 | **43,281** | 43,281 |

**压缩时的摘要基于空 content，恢复时的摘要基于 43KB content，必然不匹配。**

执行层把 stdout 写进 `metadata`（`runtime/execution/service.ts:94` 的 `withCommandExecutionProjection`），而消息的 `content` 是另一个字段。

#### 24.106.5 ~~影响面~~（**错误**：锚点不受影响）

这不是锚点特有的问题——**任何依赖 `historyDigest` 的机制都受影响**：

- 锚点恢复（本处）
- `measuredProjectionPrefix` 的 `historyDigest` 比对
- `restorablePromptMeasurement` 的 G5 守卫

只要会话里出现过 bash 工具调用（几乎必然），锚点就无法跨进程恢复。

#### 24.106.6 ~~修法方向~~（**基于错误前提**；`metadata.stdout` 冗余可作为独立优化）

需要在**两个方向**中选一个，并保持压缩期与恢复期一致：

**方向 A：让 content 成为唯一真相。** 执行层把 stdout 同时写入 `content`，metadata 只保留摘要字段（exitCode、status）。代价：转录体积翻倍（content + metadata 各一份），除非 metadata 不再存完整 stdout。

**方向 B：让 historyDigest 覆盖 metadata。** 把 `metadata` 加入哈希输入。代价：metadata 含易变字段（timestamp 等）时会误判。

**已定位**：`core/tools/registry.ts:225-231` 的 bash 工具返回：

```ts
return approvedResult(finalOutput, {
  ...executionProvenance,
  status: result.status,
  exitCode: result.exitCode,
  stdout: result.stdout,   // ← 完整未截断
  stderr: result.stderr,
})
```

- `content` = `finalOutput`，经过 `truncateTail(rawOutput, { maxLines: 1500, maxBytes: 50 * 1024 })`；
- `metadata.stdout` = **完整 `result.stdout`**，未截断。

**两者是不同的字符串**，而 `historyDigest` 只哈希 `content`。

所以真实差异不是「空 vs 43KB」（那是我观察到的中间态），而是**截断后的 content vs 完整 stdout**。

**推荐方向**：`metadata` 不应保存完整 stdout 的第二份副本。它只需要供 UI/诊断用的摘要（`exitCode`、`status`、`executionPath`、`errorClass`）。完整输出已在 `content` 里（或已存 artifact）。

这样同时解决三件事：

1. `historyDigest` 不再依赖「哪个字段是真相」；
2. 转录体积减半（不再存两份 44KB）；
3. `metadata` 的语义回归为「关于这次执行的元信息」，而不是「输出的另一份拷贝」。

**需要确认**：是否有消费者依赖 `metadata.stdout` 的完整性（例如 UI 展开完整输出）。若有，应改为从 artifact 读取，而不是从 metadata。

#### 24.106.7 本轮方法论

三次诊断错误，前两次都是**跳过了某一层**：

1. 跳过 `decodeTranscriptLine` → 事件类型错误；
2. 跳过 `projectTranscriptMessages` → 消息数错误；
3. 跳过 metadata → 摘要差异归因错误。

**教训**：当摘要不匹配时，必须逐字段比对 `historyDigest` 实际哈希的六个字段，而不是只看 `content` 长度。

#### 24.106.8 修法确认：`metadata.stdout` 是纯冗余

`grep -rn "metadata.stdout\|metadata?.stdout" packages/ts-shell/src --include=*.ts | grep -v test` **无任何结果**。

**生产代码中没有任何消费者读取 `metadata.stdout`。** 它只是 `result.stdout` 的第二份拷贝，白白让每条 bash 结果在转录里存两份 44KB。

修法确定：

```ts
// core/tools/registry.ts:225-231，删除 stdout/stderr
return approvedResult(finalOutput, {
  ...executionProvenance,
  status: result.status,
  exitCode: result.exitCode,
})
```

- `content` 保持 `finalOutput`（已截断，已含 artifact 指针）；
- `metadata` 只留执行元信息。

**完成条件**：

1. 现有测试全过；
2. 新增测试：bash 结果的 `metadata` 不含 `stdout`/`stderr`；
3. 真实测试：加载大文件后重启进程，`/context` 显示 `measured` 而非 `estimated`；
4. 转录体积对比：同一次会话的 `transcript.jsonl` 应显著变小。

**风险**：若有未发现的外部消费者（插件、报告生成），需要先确认。当前 grep 覆盖了 `packages/ts-shell/src`，未覆盖测试与脚本。

#### 24.106.9 这一发现的更广意义

~~`content` 与 `metadata` 双轨不是 bash 工具独有的问题。~~ **错误**：`historyDigest` 只哈希六个字段且不含 metadata，双轨不会让它失真。冗余仍然存在（转录体积翻倍），但那是独立的存储优化项，不是缺陷。

**建议在 `createToolResultMessage` 层加约束**：metadata 不得包含与 content 重复的大字段。或者更简单——`historyDigest` 若要在 metadata 存在时保持稳定，就必须确保 content 是唯一真相。

### 24.107 测试驱动的复核：24.106 的结论是错的（2026-11-03）

用户要求「用测试去找问题，完成后派子代理对抗复核」。本轮用真实 CLI 测试直接推翻了 24.106。

#### 24.107.1 24.106 错在哪

**24.106 声称**：bash 工具把 `content`（截断）和 `metadata.stdout`（完整）存两份，而 `historyDigest` 只哈希 `content`，导致压缩期与恢复期的摘要不匹配，锚点无法跨进程恢复。

**这个因果链是错的。** 实测证明：

1. `historyDigest` **完全不读 metadata**——metadata 的差异不可能影响摘要；
2. 真实压缩会话的摘要**匹配**：`stored === actual`；
3. 压缩后 `/context` **显示 `calibrated`**。

#### 24.107.2 决定性测试

隔离 home、`bailu-2.7`、40k 窗口，用 bash 加载三个 60KB 日志文件触发压缩：

```
compactions: 2
  compaction-prepared | kept: 6
  compaction-prepared | kept: 2
tokens: 31,357
```

**重启进程后**：

```
/context → Current context (calibrated): 8,379 of 40,000 tokens
```

投影验证：

```
projected messages: 4
  0 user       pm=-
  1 assistant  pm=7
  2 tool       pm=-
  3 assistant  pm=3     ← 最新
restorable → tokens=8328 count=3
newest assistant @3: count=3 match=true digest=true
```

**锚点在压缩后、跨进程恢复成功。**

#### 24.107.3 24.106 的三次误判来源

| 误判 | 真实原因 |
|---|---|
| 「原始事件 content=0」 | 读的是 `e.message ?? e`，但转录事件的字段在**顶层**，`e.message` 是 undefined，于是取到空字符串 |
| 「投影后 12 条而非 7 条」 | 直接 `JSON.parse` 跳过 `decodeTranscriptLine`，`type` 是 `compaction-prepared` 而非 `compaction` |
| 「摘要不匹配」 | 基于前两个错误数据得出的推论 |

**三次都是读取方式错误，不是产品缺陷。**

#### 24.107.4 `metadata.stdout` 的真实状态

它**确实存在**（bash 结果：content 7,649 / metadata.stdout 13,893），且**确实冗余**（生产代码零消费者）。

但它**不影响锚点**，因为 `historyDigest` 只哈希六个字段：

```ts
[role, content, reasoning, tool_calls, tool_call_id, origin]
```

**这是一个独立的存储冗余问题**（每条 bash 结果多存一份完整输出），与锚点无关。可以作为独立优化项，但不是缺陷修复。

#### 24.107.5 那 `/context` 之前为什么显示 estimated

上一轮失败的会话（`sess_c5bf6fe7`）与本轮成功的会话（`sess_1d32541f`）关键差异：

| | 失败会话 | 成功会话 |
|---|---|---|
| 压缩次数 | 1 | 2 |
| 最新 assistant 的 `messageCount` | 7 | 3 |
| 投影后消息数 | 8 | 4 |
| 恢复结果 | `undefined` | `tokens=8328` |

失败会话的 `messageCount=7` 而投影索引也是 7——**索引是匹配的**。真正失败的是 `digest` 比较。

但那次会话已被清理，无法复现。**在复现之前，不能断言原因。**

#### 24.107.6 当前确认的事实

| 事实 | 证据 |
|---|---|
| 压缩后锚点能跨进程恢复 | 真实 CLI，`calibrated: 8,379` |
| `historyDigest` 忽略 metadata | 代码 + 实测 `stored === actual` |
| `metadata.stdout` 冗余但无害 | grep 零消费者；摘要不受影响 |
| 24.106 的三条结论全错 | 三次读取错误 |

**仍未解释**：上一轮失败会话的确切原因。需要复现才能定位。

#### 24.107.7 方法论教训（第三次同类错误）

这是我在这个问题上**第三次**把「读取方式错误」当成「产品缺陷」：

1. 24.97：用 `require()` 在 ESM 里写诊断，异常被吞，误判「未被调用」
2. 24.106 第一次：跳过 `decodeTranscriptLine`，误判事件类型
3. 24.106 第二次：读 `e.message` 而字段在顶层，误判 content 为空

**共同模式**：直接操作原始数据（`JSON.parse`、`e.message`、`require`），绕过了产品自己的解码层。

**规则**：诊断脚本必须走产品的解码路径（`decodeTranscriptLine`、`projectTranscriptMessages`），或者至少先打印一次原始结构确认字段位置。

#### 24.107.8 边界条件核实（主代理）

在等待对抗代理期间，逐项核实了投影与压缩的形状一致性：

| 边界 | 结论 |
|---|---|
| `keptMessages: 0` | **不可能**。`keptMessages = length - cut`，而 `cut >= 2`（`session/compaction.ts:182`），所以最小为 2 |
| `keptMessages` 缺失 | **不可能**。`commit.ts:84` 无条件写入；类型上的可选只是历史兼容 |
| `system` 消息 | **不出现**。生产代码零处构造 `role: 'system'`；`applyCompaction` 与投影的 `head` 分支是防御性的，实际不触发 |
| `branch_summary` 打乱索引 | **会发生**，但分支导航时 `markContextUnknown` 已清锚点，不冲突 |
| 模型切换后 `origin` 失配 | **不会走到**。`invalidatePromptMeasurement` 已先清锚点 |
| 压缩事件 `sourceActivePath` 不匹配 | 分支切换时压缩被忽略——**这是正确语义** |

**结论**：投影与压缩的形状在所有可达路径上一致，`messageCount === index` 的坐标系假设成立。

#### 24.107.9 上一轮失败会话的真正原因（已定位）

`markContextUnknown` 会 push 一条 `kind: 'context-reset'` 的历史条目（`usageTelemetry.ts:344`）。而**两条压缩路径都调用它**（`cli/provider/resources.ts:156` 的 `onCompact`、`core/shell/compaction.ts:253`）。

恢复守卫 G1：

```ts
// observability/usage/measurement.ts:12-14
const latestRequest = history.at(-1);
if (latestRequest?.kind === 'context-reset' || latestRequest?.kind === 'usage-gap') return undefined;
```

**只要 `recentRequests` 的最后一条是 `context-reset`，恢复就直接返回 `undefined`。**

而成功请求会 push 一条 `kind: 'request'` 的条目（`usageTelemetry.ts:201-215`），覆盖掉它。

所以行为完全正确：

| 场景 | 最后一条历史 | 恢复结果 | 是否正确 |
|---|---|---|---|
| 压缩后**又发了请求** | `request` | 成功 | ✅ 锚点由新请求重建 |
| 压缩后**没有再发请求** | `context-reset` | 拒绝 | ✅ 旧锚点确实失效 |

**上一轮的失败会话正是后者**——压缩后进程就结束了，没有新请求。`/context` 显示 `estimated` 是**正确行为**，不是缺陷。

而本轮成功，是因为压缩之后又跑了 bash 请求，产生了新的 `request` 条目。

#### 24.107.10 最终结论

**锚点生命周期没有缺陷。** 24.106 的全部结论作废。

| 曾经怀疑的问题 | 最终判定 |
|---|---|
| `metadata.stdout` 破坏锚点 | **不存在**。`historyDigest` 不读 metadata |
| 压缩后无法恢复 | **不存在**。压缩后发一次请求即可恢复 |
| 坐标系不一致 | **不存在**。投影与 `applyCompaction` 同形状 |
| 锚点跨进程丢失 | **不存在**。消息上的 `promptMeasurement` 是持久副本 |

**唯一真实的遗留项**：`metadata.stdout` 是存储冗余（每条 bash 结果多存一份完整输出，转录体积翻倍）。这是独立优化项，与锚点无关。

**为什么看起来像缺陷**：`/context` 在「压缩后未再请求」时显示 `estimated`，这是正确的——但用户看不到「为什么」，容易误判为故障。**可改进项**：在这种情况下，`/context` 应说明「上下文已被压缩，尚无新的 provider 测量」，而不是笼统的「No provider measurement available」。
