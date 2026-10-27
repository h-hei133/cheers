---
title: "Phase 20 日常交互补充要求与任务规划"
category: article
sources: [interaction-audit.md, phase-20-decisions.md, phase-20-contract.md]
created: 2026-10-26
updated: 2026-10-28
tags: [features, phase-20, additions, interaction, panels, completion]
summary: "汇总用户最新要求：settings/model看齐oh-my-pi，允许选中未配置模型，resume默认焦点修补，消息顶格及箭头恢复，提前TUI首帧、上下文估算、路径补全、多skill与部分slash组合。逐项记录实现方向、边界与验收。"
confidence: mixed
---

# Phase 20 日常交互补充要求与任务规划

## 1. 本文作用与优先关系

本文汇总2026-10-25至26日常使用反馈、[逐项核查](interaction-audit.md)及用户最新更正，作为实施的需求与验收依据。第1至14节保留初次定位与需求基线；后续已授权实施的当前证据见第15节，文末第16节汇总问题与最终体验，不能把需求条目或局部验证当作全部验收通过。

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

对用户“公式是否不同”的问题，源码支持**计数方式有差异**：本项目[本地估算](../../packages/ts-shell/src/context/request/estimate.ts)标明characters/3.5；oh-my-pi的`packages/agent/src/tokenizer.ts`支持模型对应的native tokenizer，未知模型默认可用bytes/4，模式与环境覆盖会影响选择。对同一ASCII内容仅比较÷3.5和÷4约差14%，远不足以解释4.9k/1.7k约2.9倍；中文、emoji、模型tokenizer、协议与实际输入集合也不能套用这个ASCII比例。参考启动数值来自本地计数，本项目用户反馈中的对话后数值来自provider用量，两种来源须先对齐才可比较。详见[计数口径研究](28-context-display-and-startup-budget.md)。不能把问号原因与数字差额合并为一个已解决的公式问题。

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

## 12. 补充任务总表与交付顺序

下表保留任务定义；当前实施和验证状态见第15节。P0/P1/P2是本规划的建议优先级，不表示用户逐项指定时限。

| 补充ID | 优先级 | 交付内容 | 现有任务映射与owner | 核心完成条件 |
|---|---|---|---|---|
| ADD-01 | P0 | model无可见按键交互定位、未配置模型可选中 | PAN-01、UI-03、PRV-01；picker/model与options/overlay | 单ready和全unconfigured场景真实上下键焦点移动，配置/启用分开 |
| ADD-02 | P0 | model分类/角色/连接/详情整体看齐 | PAN-01、PRV-02；model目录、预设与现panel | 完整导航路径、同名relay、刷新/返回/窄屏身份稳定 |
| ADD-03 | P0 | settings主分类、section及真实编辑路径看齐 | SET-01…03、UI-03；config/settings、picker/settings | 分类→编辑→Apply/Discard→重开读回，各scope真实 |
| ADD-04 | P0 | resume自动/手动焦点分界 | PAN-02、UI-03；session catalog/listing/picker | 先旧后三新未触摸选最新，手动选择后刷新不抢 |
| ADD-05 | P0 | 已提交用户消息顶格及源投影 | UI-04；transcript/blocks/source | 第1列正文、原缩进/选区/复制与折行正确，无黄侧条 |
| ADD-06 | P0 | 编辑框恢复箭头、消除额外左padding | UI-01、INPUT-01；composer/shapes/frame/row | 箭头贴左、续行对齐、caret/IME与各形态不越界 |
| ADD-07 | P1 | 提前TUI首帧与runtime交接 | START-01…03；entry/bootstrap/TUI owner | 首帧先于ready，输入一次移交，就绪前零派发，错误恢复终端 |
| ADD-08 | P1 | 启动上下文估算与实测衔接、差额调查 | CTX-01/04；context/request、sessionFacts、turn | 同身份estimated/measured/stale/unknown真实，差额证据独立 |
| ADD-09 | P1 | `/context`目录/请求估算口径修正 | CTX-04、PAN-08；context/report | 不再把完整目录称首请求下界，源尺寸与精确tokens区分 |
| ADD-10 | P1 | 按位置识别slash/正文路径并Tab补全 | CMD-01/02；completion/request/paths/keymap | 正文`/home`和连续目录补全，功能菜单只在首位，局部替换 |
| ADD-11 | P1 | 正文skill候选与同提交多skill注入 | 新输入组合能力，关联CMD/CTX；skill catalog/prompts/router | 两skill真实注入一任务，去重/失败/预算/原文保真 |
| ADD-12 | P1 | 准入slash组合，deep-research+skills | 新组合能力，关联CMD/CTX；command syntax/research owner | 真实研究绑定，多modifier一任务，功能/控制动作不误执行 |
| ADD-13 | P2 | 重叠入口与默认配置发现性 | CMD/SET/CFG；registry/settings/指南 | 入口有组织，默认/来源可查，兼容功能不被误删 |

建议按依赖组织交付：

1. 先落实ADD-01/04及ADD-05/06，解决无法操作、默认选错与几何回退，保存修补前后的用户路径证据。
2. ADD-02/03沿已有容器一起整理导航与层次，共享浏览/操作状态但保留model/settings各自owner。
3. ADD-10统一token位置、候选类型和局部替换，再完成ADD-11的全量skill提交解析，最后接ADD-12动作准入和research集成。
4. ADD-07独立处理早期终端owner交接；ADD-08/09按实际请求snapshot衔接首帧状态，两者不能互相用UI占位冒充完成。
5. ADD-13收口发现入口与指南，最终按下述组合路径验收并记录每个ADD的代码/验证证据。

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

2026-10-26初次文档校验：当时14节和ADD-01…13齐全；本文39个本地链接目标及源码行号存在，关联调查/决策/两级索引的目标也已检查。`verify:docs-drift:strict`与`git diff --check`通过，保留既有118条未加根前缀引用advisory。当时仅改Markdown、未运行产品验证；实施后的源码位置与证据以下述owner和批次为准。

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

TypeScript构建及checkBuild当前新鲜度通过：build `a3a165c2470bf61d034d710dab7908dfbc3b681de8e1f18c6cc60833383535ef`、inputs `040df807bf1b6052f7f455cff906630639b6724c337e385134b872e7859f0f5c`、artifact `91a1ef6f57014dd2af2aaf10d6692ca7cd4940611f05001c2d9c0b2c846744b6`。本批未构建/验证exe。四静态门、strict docs drift及diff通过，118条既有来源advisory保留；317个本地链接/50个标题锚点/68个行锚点与ADD-01…13完整性核查通过。链接探针初轮把历史Markdown的`#L106/#L138`当标题误报，按实际行锚点校验后通过，没有修改旧链接掩盖失败。责任上限报告0 findings，当前打包validator以全新scratch提取，archive SHA256 `6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985`；正式CLI judge exit0/proven、三项结构义务satisfied，不等于独立产品审查。脚本、manifest、失败日志、反转及PTY收据归档`.omx/artifacts/phase20-addition-settings-fields/`，Git/当前CI另绑定实际提交。

ADD-03全部字段/scope基本操作链已有聚焦证据，来源冲突/无效值/失效、编辑窗口及真实桌面矩阵仍需补齐；model精确目标/能力/角色/真实认证，研究control/其他driver/child成本，原生tokenizer/动态来源累计I/O，真实1.7k/4.9k分解、冷缓存/修补前对照/真实项目启动收益继续未验。不运行全仓本地回归、并发重验证或真实20k消息PTY。原Phase20保持38 complete / 9 partial，ADD独立且整体active。

### 第三十九批：设置失败重试与保存范围的原始归属

第三十八批`05ecc6c8885f61d18e851a6a698597253f1165d7`已提交/推送。本批延迟实查该SHA的CI [40268138916](https://github.com/h-hei133/cheers/actions/runs/40268138916)与Architecture Watch [40268138889](https://github.com/h-hei133/cheers/actions/runs/40268138889)，均completed/success；未读取完整日志或Watch工件，历史结果不转记本批源码或ADD整体验收。

ADD-03沿[原设置草稿](../../packages/ts-shell/src/cli/interactive/settings.ts)和[原详情/保存范围面板](../../packages/ts-shell/src/cli/interactive/picker/settings.ts)补生命周期操作。真实OverlayHost键盘回归确认四类缺陷：session/project已变化时第一次Apply拒绝，第二次却用ambient host重新捕获新binding而保存旧pending，A→B→A同样存在；已打开scope子面板确认时也重新捕获新binding；user只检查字段基线，没有拒绝legacy来源被preferred替换；目标scope文件变为损坏JSON时异常使面板丢失。失败日志分别归档，不能将这些缺陷写成用户原model按键现场的唯一原因。

修补在原草稿提供`reopen(scope?)`，捕获原configuration binding、substrate及物理profile，并对user/project均检查所选来源。失败重试和scope确认必须通过原草稿刷新；归属或来源变化则保留pending、原scope及失败状态，要求重新打开设置。普通同源字段冲突仍允许用户明确第二次Apply读取最新基线并只修改目标字段，不删除原冲突检测、不覆盖兄弟字段或另一scope。原write lock内再次检查归属/来源；写后复验发现换代时分别报告持久成功与应用未确认，不向新binding发布旧选择。scope取消保留pending，成功确认按原提示撤销pending，不可读目标保留原scope/pending并可重试。

先读目标后定向比较同一参考快照的settings-list990–1088：子面板独占输入、undefined选择表示取消不改值、父层按稳定item ID恢复，恢复与子操作完成分开。本项目采用这些归属/取消/返回决定；staged Apply、user/project多来源及binding锁内检查是本项目自己的契约，不宣称参考已经提供相同持久事务。

[字段操作测试](../../packages/ts-shell/src/cli/interactive/picker/settings/fields.test.ts)由81增至98项，新增17项包括session/workspace/A→B→A拒绝二次Apply、user/project同源冲突显式重试并保留注释/兄弟字段/另一scope、scope取消与确认、已开scope后的binding切换、不可读目标、user/project legacy→preferred、profile切换/物理目录替换、真实锁内变化、写后换代及无效数值Enter/旧pending取消恢复。沿实际host按键及原配置/保存owner；profile身份测试另直接检查草稿刷新，不冒充所有profile场景均走实际终端。最终七文件222项串行通过：fields98、interactive/settings44、picker/settings38、navigation15、wheel12、hover7、source8；反转恢复后fields98再通过，重复轮次不累加。

三次有效反转：恢复retry host重捕获使3个断言失败，恢复scope host重捕获使1个失败，去掉user source检查使2个失败；全部源码逐字节恢复。picker/settings SHA256 `d2900c3f7fbe985f087e1aac2c9eae6227c48bf39d560b2d454744bf62a86728`，interactive/settings SHA256 `2a10e5839114521cc861a7fdadb5929599a269986b843cde64e936739a8c782a`。移除显式profile检查的第四次反转仍绿色，既有trust/binding检查也拒绝这些场景，故记录为**无效反转**，不作为显式profile检查必要性的证明。初轮脚本在此停链，修正收据分类后再串行运行后续检查；未将绿色反转伪装成有效。

普通/fullscreen×同源冲突/来源替换共四条小型实际Node PTY通过。冲突场景逐字输入Top P、暂存0.8，外部写0.6；首次Apply保留0.6并报告未确认，第二次显式Apply保存0.8，重开Stored0.8。来源场景从隔离legacy user配置打开，preferred随后出现0.6；两次Apply都拒绝且两文件不写，返回列表新开读回preferred的Stored0.6。各场景零transcript message、session modelSelection不变、synthetic provider未调用；串行等待relay close及清理，143为SIGTERM退出。每样本45秒上限、UTF-8分段解码和2MiB输出上限，无20k历史压力。早期两条冲突试跑不累加为六条；终端证据只覆盖代表性Top P，不等于完整字段/桌面矩阵。

四静态门、TypeScript build及当前checkBuild新鲜度通过：build `ae02a58d6af6d3e197999c298726f77a898b99985fdc5bc935d029f738337e25`、inputs `4a9a2eb8eab0304179e366b76e80492a9698a40f6e558ce4d5fe2fb7f34745f3`、artifact `da8f7e111fb9464f1182a168ce62da343327a44d3f8dea870fa14700dd00111c`。本批未构建或验证exe。责任上限报告0 findings；当前validator全新提取，archive SHA256 `6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985`，实际CLI judge exit0/proven、三项结构义务satisfied，属于架构证据。最终strict docs/diff、324本地链接/53标题/68行锚点及ADD-01…13完整性通过，118条既有来源advisory保留。复查探针先误读根dist、再误读checkBuild顶层buildId，均归类脚本错误；按真实package dist和manifest返回合同修正后新鲜度及全部恢复hash通过，没有重构建或改产品掩盖失败。工件归档`.omx/artifacts/phase20-addition-settings-retry/`，本批Git/CI按实际交付另绑定。

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
| resume先旧后三新仍选旧 | 渐进目录先发布current，首次自动ID被保留，排序本身未反。自动选择阶段跟随最新可恢复候选；一旦上下键/点击主动选择，后续刷新保留其ID，Enter重验身份。第四十六批另修跨时区/小数秒字符串排序，默认焦点按实际时刻选择；搜索/scope换代重置自动规则，手动渐进刷新仍保持。已有局部夹具证据，桌面平台与用户原环境现场仍待验 |
| 认证快捷入口缺少参数发现 | 第四十七批确认`/login`、`/logout`只有委托执行而没有顶层提示/补全。现从原`connectSyntax`派生快捷语法：login提供provider与认证flag，logout发现保存连接，并排除不属于顶层语法的action alias；执行仍只走原认证owner。第四十八批再以registry合同锁定theme/statusline/connect/login/logout/view与settings元数据的owner可见性。73项、13项合同及两有效反转有局部证据，真实认证/桌面仍待验 |
| 黄条删除后仍留白、编辑箭头缺失 | 绘制残余padding与普通gutter回退是确定缺口。已提交正文从第1列开始，编辑箭头贴左，续行对齐正文；保留用户源缩进、caret/选区/复制。已有局部修补证据，不能恢复黄色侧条冒充完成 |
| TUI首帧过晚与基准误标 | 原入口先建立重runtime，原基准再将后期模型名当首帧。已采用早期真实composer/一次交接，第三十七批补实际Loading观察和runtime接管计时、close清理；同机Node/exe两模式各30个warm-uncontrolled空会话样本已归档。冷缓存、修补前对照、真实项目/桌面及完整首请求性能仍待验，不能写成已证明生产节省量 |
| 初始上下文问号与估算新鲜度 | 首请求前原先只显示provider用量；已补实际请求本地估算及估算/实测身份衔接。规则、模板与普通skill/cold extension清单已补原始字节进入核验，warm extension沿现inventory摘要失效；附件原已严格UTF-8 digest重验，预览补异步/cancellable复验和实时准入。第五十一批把preview模板发现收窄为候选精确探测，第五十三批再收窄正文补全与单命令查找，并补目录入口、优先级遮蔽和注册归属；第五十四批补首位真实路径/命令合并、command-first及文件引号防误路由；第五十七批让review standalone/composed预览复用真实Git snapshot与plan-mode prompt身份。同名模板/路径提交歧义和完整终端矩阵仍未消除。其他动态来源完整覆盖、总读取成本、原生tokenizer及真实差额仍待验证，无法证明时保留unknown/stale |
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
| 正文路径、多skill、有限slash组合原先缺口 | 原路径与skill路由偏向首位，多个名字不足以使多份skill生效。现沿原补全/解析/研究owner推进；第六十三批补非首位命令碰撞file引号、目录候选不触发命令模板查找、代码/转义/URL参数不请求path catalog及quoted Windows drive/UNC识别；第七十批补`/skill:`命名空间内真实路径与skill候选并存，quoted path与exact skill Enter/Tab分界保真。完整场景验收仍按下表，非skill同名template/path的裸提交歧义及正文功能命令执行边界不因此消失 |
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
| model看齐 | Roles/All models/provider层次可辨；分类→搜索→未配置具体模型→详情→精确连接配置/适用登录→返回原模型→显式启用→重开读回。全部未配置仍能导航；同名relay按精确身份区分；取消/失败不虚报成功；键盘/点击/wheel/hover/窄屏/resize保持同一目标 |
| settings看齐 | 真实主分类与section覆盖已有能力；跨分类搜索后回所属位置；布尔/枚举/数值/列表/对象等真实编辑器→Enter暂存→Apply保存或Discard/取消→重开读回。同源冲突明确重试，binding/profile/source换代拒绝旧pending；scope取消/不可读保留，成功换scope撤销pending。user/project、只读与显式来源、effective/stored、写后应用未确认、预览撤回及restart时点保真；窄屏先保留caret，不以标签换皮完成 |
| 消息顶格与输入箭头 | 已提交用户正文无装饰性左空白，从第1列绘制并保留源缩进；普通编辑区恢复左侧箭头，正文在必要间隔后开始、续行对齐，不叠加旧padding。中文/emoji/长行/resize/选区/caret一致，复制只含原文；不恢复已删除黄条 |
| 输入位置与路径新增 | 只有源文本第一行第一位置开放完整功能slash；正文`/home`给实际目录suggestion，上下选择或Tab接受并连续补全。只替换光标token，保留前后/多行/缩进；代码、URL、词内slash和转义不触发命令；迟到结果不覆盖新草稿 |
| 多skill新增 | 首位、正文与后续行可发现skill，同一次输入的全部明确skill实际加载并进入同一任务，稳定去重、保留正文/附件；未知、失效、拒绝、超预算时报告并可重试，不能只运行第一个或递归执行skill正文slash。代码示例内不补全或调用，短/混合/嵌入关闭不结束围栏；合法较长关闭及CRLF后恢复真实skill，行内按完整相等反引号run配对 |
| 有限slash组合改进 | 在参考正文skill限制上，允许显式声明的无副作用方法命令组合；deep-research研究入口必须可与两个及更多skill搭配，也支持兼容modifier组合成一个任务。一个工作流driver拥有预算/取消/持久状态；研究control/save按原独立准入，settings/model/connect/resume等功能命令不进入正文执行 |
| 启动与上下文 | 先看到真实输入区/loading，再接管一次草稿，ready前零模型/工具派发；首请求本地估算来自实际有效规则/消息/tool schema及协议。实测返回后按身份衔接，来源变更撤值；分别测首帧和ready，并用同模型/协议/规则/schema拆分真实差额，不设必须等于1.7k的假目标 |

以上任务继续沿ADD-01至13推进；完成证据以完整操作链、正确持久/应用状态、实际请求内容及相应环境测量为准。原47项Phase 20矩阵与补充任务状态分开，全文不以局部修补替代整体验收。

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

文档收口后，第三十八批沿已授权范围修补settings搜索焦点并补全部字段/scope基本链，第三十九批补失败重试、范围选择和来源归属；保留ADD-01至13和原47项状态。执行时按以下清单补缺，每项沿原owner交付；已存在且有合格证据的路径复用既有结果，不重造系统。

| 用户要求 | 必须保留的实施方向 | 尚需补齐的证据 |
|---|---|---|
| 两面板整体看齐 | 先对照参考的分类/section、焦点域、搜索、详情、修改/配置、返回和窗口布局，再补具体缺口；功能内容来自本项目原owner。settings重试与范围选择保留原binding/source，正常冲突可显式重试 | settings73条基本链及17个代表性生命周期场景已有证据，继续补字段/来源/编辑器/窗口/桌面的交叉矩阵；model精确目标/能力/角色/认证、两模式及键鼠完整操作仍待验 |
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
