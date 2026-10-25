---
title: "Phase 20 日常交互补充要求与任务规划"
category: article
sources: [interaction-audit.md, phase-20-decisions.md, phase-20-contract.md]
created: 2026-10-26
updated: 2026-10-26
tags: [features, phase-20, additions, interaction, panels, completion]
summary: "汇总用户最新要求：settings/model看齐oh-my-pi，允许选中未配置模型，resume默认焦点修补，消息顶格及箭头恢复，提前TUI首帧、上下文估算、路径补全、多skill与部分slash组合。逐项记录实现方向、边界与验收。"
confidence: mixed
---

# Phase 20 日常交互补充要求与任务规划

## 1. 本文作用与优先关系

本文汇总2026-10-25至26日常使用反馈、[逐项核查](interaction-audit.md)及用户最新更正，作为实施的需求与验收依据。第1至14节保留初次定位与需求基线；后续已授权实施的当前证据见第15节，不能把需求条目或局部验证当作全部验收通过。

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

参考A使用Roles / All models /可用provider /锁定provider及model-kind tabs；settings使用Appearance、Model、Interaction、Context、Memory、Files、Shell、Tools、Tasks、Providers十类及各自section。**分类结构要看齐，内容必须对应本项目真实能力。** 参考特有的服务、插件、语言运行时或配置字段不能靠加一个空菜单宣称支持；暂不适用的分类应清晰省略，不能呈现似可设置的假选项。

### 3.2 model：允许选中未配置模型

当前[model picker](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L71)把配置/凭据等准入失败映射成disabled；[OptionModel](../../packages/ts-shell/src/presentation/tui/chrome/options.ts#L78)禁止disabled成为current/focus，step也跳过它们。**这是源码事实；它与“只有一个模型可用时按键看起来毫无变化”相容，但不证明用户终端的事件确已进入这个分支。**

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

ADD-02须把目前平铺的provider→connection→model及角色预设组织成可导航层次。基础入口包括Roles、All models和provider分类；同一provider多个connection在内容区能辨认或下钻。预设沿现[预设owner](../../packages/ts-shell/src/core/commands/model/preset.ts)与[会话模型owner](../../packages/ts-shell/src/session/model/state.ts)处理，不新增另一套角色配置。

默认打开时能定位当前模型，并清楚区分“当前活动”“键盘焦点”“尚未配置”。可用与未配置分类都可访问。两栏详情要跟随焦点，显示名称、精确连接、模型能力、reasoning约束及阻止启用的原因；模型类别tabs仅在目录有真实分类数据时提供，不根据名字臆测。目录刷新不抢手动焦点，目标失效时落到邻近可浏览项并说明状态。

验收从Roles进入预设、从provider浏览未配置模型、All models搜索同名relay、切换分类后清搜索、鼠标/键盘到同一目标、异步刷新和子面板返回。保存仍验证精确target与revision，不按label提交。

### 3.4 settings：主分类、section与真实编辑器

ADD-03将现[七组加All](../../packages/ts-shell/src/cli/interactive/picker/settings.ts#L161)向参考的主分类/section层次组织，覆盖本项目已有设置而非仅改组名。建议映射：

| 目标分类 | 本项目应归入的真实能力 |
|---|---|
| Appearance | theme、输入形态、状态项、diagram与已有显示设置 |
| Model | 模型相关采样、输出、reasoning及已有角色/预设入口 |
| Interaction | 输入/Vim、审批与已有交互选项；路径/skill补全策略仅在真实实现后纳入 |
| Context | contextWindow/reserve、指令预算、压缩与上下文显示 |
| Memory | 已有记忆设置与只读状态；操作委托原memory owner |
| Files、Shell | 已有文件与执行设置；没有对应字段的部分不造新语言执行面 |
| Tools | allowed/disabled tools、动态发现、MCP/extension相关配置入口 |
| Tasks | 现有任务/后台/协作设置及命令组合策略 |
| Providers | 网络重试/超时及精确连接入口；凭据继续由connect owner管理 |

分类中有section标题，用户可在section和设置行之间切焦点；左右切主分类，Tab跳section/设置，Enter打开编辑器，Esc返回。搜索跨分类，并能从结果回到所属section。列表展示人能读懂的名称与值，技术字段路径、Effective/Stored/来源/应用时点集中在详情；必要的scope与Pending保留，MUI要求不因“对齐”而增添多余第二标签。

复用[设置元数据](../../packages/ts-shell/src/config/settings.ts)、已有数值/列表/对象编辑器与[保存owner](../../packages/ts-shell/src/cli/runtime/settings.ts)。暂存、Apply、Discard、预览撤回、user/project scope、只读来源、需要restart的字段各自保真。未知/过时值不能被打开面板偷偷规范化；空项目配置继承默认，不能显示为空能力。

验收选取每种编辑器至少一个字段，覆盖切分类→section→修改→Apply→重开读回及Discard撤回；还要验证无权限来源、窄屏导航、搜索清空、输入编辑器方向键和preview取消。

## 4. resume：渐进加载后的合理默认焦点

ADD-04沿[当前会话首快照](../../packages/ts-shell/src/session/store/catalog/index.ts#L117)、[listing](../../packages/ts-shell/src/cli/interactive/picker/session/listing.ts#L30)与[overlay](../../packages/ts-shell/src/cli/interactive/overlay.ts#L712)修补。当前机制先发布current，历史逐批加入；OptionModel保留首次自动ID，因此今天的会话出现后仍选两天前那条。排序本身是置顶优先、更新时间倒序，不应通过反转排序修焦点。

目标规则：用户尚未主动选择时，随着有效候选到达，自动焦点更新为当前范围内最新可恢复会话；用户按上下键、点击或明确选择后，后续发现/刷新保留该ID。当前会话标记独立保留，不再压过默认最新期望。置顶影响列表排序，**建议不让旧置顶覆盖“默认最新”**；搜索范围、项目scope与目标可恢复性仍先过滤。Enter前重验目标身份与版本。

以一条两天前current和三条今天记录的分批夹具验收：未碰按键，最后聚焦今天最新；加载中手选旧记录，最终仍保留手选；目标消失/不可恢复时落到合格候选；切scope/搜索按新的浏览生命周期重置自动规则；分页、partial和关闭后的迟到结果仍保真。参考pi的selectionTouched可作为对照，不复制整个scanner。

## 5. 输入几何：已提交消息顶格，编辑框恢复箭头

ADD-05处理已提交消息，ADD-06处理正在编辑的输入。这两处不能用同一个“恢复左侧装饰”动作混在一起。

| 位置 | 新目标 |
|---|---|
| 已提交用户消息 | 无黄色侧条，无由旧侧条或padding留下的首列空白；正文首字符在第1列 |
| default/borderless/top-rule编辑区 | 提示箭头从左侧边界开始，正文紧接提示符必要间隔；不再叠加独立左padding |
| 多行编辑续行 | 正文对齐首行正文起点；只有首行显示箭头，不重复制造提示符 |
| 有框/rail等其他形态 | 保留其选择出的边框语义和安全宽度；不把所有形态粗暴改成裸文本 |

“顶格”去掉的是绘制引入的空白，**不删除用户原文的缩进、空行或正文空格**。编辑框有箭头时，正文自然在提示符之后；与已提交正文直接从第1列开始是两个可同时满足的几何要求。右侧留白独立决定，不能为改左侧而无条件移除两侧。

现[renderUser](../../packages/ts-shell/src/presentation/tui/transcript/blocks.ts#L132)使用width−2折行并在正文前加空格；[composerFrame](../../packages/ts-shell/src/presentation/tui/composer/frame.ts#L29)将两侧padding共用一个值，[shapes](../../packages/ts-shell/src/presentation/tui/composer/shapes.ts#L18)清空普通gutter。修补须同步正文宽度、left/right padding、[contentColumn及cell映射](../../packages/ts-shell/src/presentation/tui/composer/row.ts#L44)、[transcript源投影](../../packages/ts-shell/src/presentation/tui/transcript/source.ts#L48)，恢复箭头优先沿原主题符号，避免硬编码只在一种字体有效的字符。

验收检查ANSI剥离后的实际列、折行及caret位置，覆盖中文/emoji/组合字符、多行缩进、长行、极窄屏、resize、IME尾、选区和应用内复制。复制只得到源文，不能包含箭头、框线、绘制padding或软折行；原文缩进保留。不得以trim用户内容实现顶格。

## 6. 启动：先绘制TUI，再完成加载

ADD-07按用户方向改善“空白终端等待”。现[入口](../../packages/ts-shell/src/entrypoints/cli.tsx#L24)先加载cliProcessRunner，后者建立bootstrap/session runtime后才进入interactive loop；fullscreen的[startup surface](../../packages/ts-shell/src/cli/bootstrap/cliStartupSurface.ts#L43)不会提前打印intro。恢复提示延后至first-frame只是一部分任务后移，不能替代更早的TUI。

参考A先beginStartupComposer，再加载网络bootstrap/命令图，最终用lease把同一Composer交给完整InteractiveMode。应采用这种时序原则，沿本项目已有TUI owner实现，避免临时启动画面与正式界面变成两个独立输入缓冲或终端控制器。

要求：

- 普通交互TTY尽早显示编辑区、必要状态及真实加载阶段；缓存外观可以用于首帧，但必须随后按实际配置校正。
- 首帧出现时运行时可以尚未准备好；明确显示loading，配置失败时显示实际错误并可退出，不能假装ready。
- 加载期间输入采用一个明确、有限的保留策略，移交时原序保留一次；就绪前不派发模型/工具请求，Enter不能重复派发，Esc/Ctrl+C按生命周期退出或取消。
- 完整运行时接管同一界面，主题、状态、光标和草稿不闪回或丢失；启动退出/错误时恢复终端。
- 不破坏help/version、print、pipe、replay和显式resume等既有入口；新鲜度校验合同不因提前绘制而旁路。

分别测首次可见、输入接管、runtime-ready、首次请求准入与退出；同机器同fixture的冷/热Node/exe分别取样，首帧更快不能写成所有初始化更快。先用小会话验证加载时输入、取消和故障；性能验收沿现[START-03](phase-20-decisions.md)口径，不能用`--version`代替TUI首帧。

## 7. 上下文：启动估算、实测衔接与差额定位

ADD-08提供状态栏启动本地估算。现[sessionFacts](../../packages/ts-shell/src/cli/interactive/sessionFacts.ts#L68)只读身份匹配的provider用量，无值就[显示问号](../../packages/ts-shell/src/presentation/tui/chrome/items.ts#L154)；对话后数字来自[归一化输入用量](../../packages/ts-shell/src/turn/session.ts#L304)，不是JSON字符÷3.5。参考A无provider anchor时仍用systemPrompt、当前tool roster、消息与pending本地计数，因此可以启动显示数值。

要求首次请求前根据**本次实际拟发送的内容**给出estimated值，不拿完整可发现工具目录充当发送schema。包含生效系统指令、项目规则/skills、当前消息历史、实际tool集合和能界定的协议开销；无法精确计算的部分说明局限，不把估算标成实测。provider返回后切换或校准measured，绑定session/model/endpoint/schema/system/history身份。切模型、恢复、换分支、加载工具或编辑指令使旧数值失效；无法证明当前值时仍允许unknown，不能为了消灭问号填0或旧缓存。

约1.7k与4.9k的差额要单独取同模型/协议/规则/历史/实际schema的分项。工具数量、工具菜单是否丰富、源字节大小都不能直接推出token总数；缓存输入与provider归一化也需对齐。参考模型toolSchemasInContext=false时不计常驻工具schema是条件性分支，未验证用户具体模型走它。验收不设“必须也显示1.7k”的目标，而是同snapshot、可解释、estimated/measured/stale/unknown各态真实。

ADD-09修[报告措辞](../../packages/ts-shell/src/core/commands/context/report.ts#L59)：`/context`将完整检查目录估算称作首请求“at least”没有建立下界。报告分别展示可发现目录估算、实际组装请求估算、最近provider总输入及分类源尺寸；源尺寸不能冒充精确分类tokens。两项可关联交付，但不能用修报告文字替代启动状态栏能力。

验收包括新空会话、恢复、缺usage、带cache用量、工具加载前后、换模型、辅助请求与前景请求、多步回合及stale回写。数值差额调查保留实际输入集合摘要和计数口径，不输出凭据；没有真实对照数据时保留差额未解释，不能归因已闭合。

## 8. 光标位置决定slash、路径与组合候选

ADD-10扩展现有[completionToken](../../packages/ts-shell/src/cli/interactive/completion.ts)、[slashSuggestions](../../packages/ts-shell/src/cli/interactive/slashSuggestions.ts)、[catalogRequest](../../packages/ts-shell/src/cli/interactive/completion/request.ts)与[pathCatalog](../../packages/ts-shell/src/cli/interactive/completion/paths.ts)。本项目已有`@`文件引用和部分命令参数路径补全，缺口是正文普通路径及与slash/skill的统一判别，不需要重建所有补全来源。

### 8.1 位置和歧义规则

用户明确要求完整slash命令菜单限第一行第一个位置。建议按源文本offset=0执行这一规则；终端软折行不是源文本新行。已有提交处[trimStart](../../packages/ts-shell/src/cli/interactive/keymap.ts#L517)和补全处“前面没有token”不能直接作为判断依据，否则第二行或前置空格的slash会误入功能命令。参考A会忽略前导空白/空行，这一点与用户字面要求不同，实施应按本项目新要求而非机械复制。

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

ADD-11同时实现候选与提交两端。当前[expandSkill](../../packages/ts-shell/src/core/prompts/expansion.ts#L114)只识别开头的一个`/skill:`，现[slashRouter](../../packages/ts-shell/src/core/commands/slashRouter.ts#L38)也只在开头解析它；把多个名字插进草稿并不等于它们都生效。

参考A的正文skill补全会限制为skill、插入canonical token并仅替换局部词。但当前快照的parseSkillInvocation只提取首个匹配，buildSkillCommandPrompt也只构造一个skill消息；本轮未证明剩余skill会通过另一条路径全部注入。用户观察支持“参考体验可用”的方向，**本项目验收必须比单个parse更完整，不能把参考的多skill注入当作已证事实。**

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
| brainstorm、review等既有提示词入口 | 作为首批候选逐动作审计；提取纯提示词构造与必要只读准备后才能纳入，不把整handler任意串行执行 |
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

多个非skill提示词组合的示例，在相应动作进入白名单后验收：`问题正文 /brainstorm /review /skill:review-b`。不得把它变成先启动一次brainstorm、再启动一次review、最后另开一次skill对话；若该组合的实际语义不能纯构造，应明确不准入并提供可用替代，而不是默默降为普通文本。

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
| ADD-10 | 本地实现验证通过 | 统一源位置token，完整功能菜单/命令参数只认offset=0；正文绝对/相对/home/Windows路径、引号目录连续Tab和局部替换复用现有path owner。裸slash只提供匹配skill名及已声明组合方法，路径优先，显式`/skill:`可搜描述。候选有path/skill/command类型和身份，保留现有异步snapshot与取消准入；真实Windows终端仍缺 |
| ADD-11 | 本地实现验证通过 | 同提交加载全部明确skill，按稳定身份去重、记录源range及body digest；统一校验失败、配置变化、来源撤销、取消或预算超限则不部分提交，返回原草稿。保留原文缩进/换行及多行持久历史；忙碌输入等待同一提交边界，附件随排队/编辑/派发/取消恢复保留。真正交互路由检查两份body和一份图片，未请求真实provider |
| ADD-12 | 本地实现验证通过，准入范围明确 | brainstorm纯方法与显式`composable: true`模板可组合；deep-research首位/正文/alias支持多skill，创建一个真实native research，持久化所选方法并将指令送入每个实际子阶段。research控制/save/help、功能命令混入、两个driver及非法参数在派发前拒绝；driver派发后异常不伪装零派发，意外shell-action不交给功能路由。review尚未声明组合，明确拒绝，不能宣称示例中的review组合已支持 |
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
- 普通无slash草稿不加载command template图；正文路径判别仍会经实际registry/template discovery，模板目录/文件读取尚未增加本preview专用成本界限，需复用其owner补齐。没有以异步函数名或10秒abort承诺整个同步图可被中途取消。
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
