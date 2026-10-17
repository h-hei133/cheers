---
title: "模型配置与中转站：连接身份、凭据投影与配置契约"
category: article
sources: [repo-audit-2026-10-17, packages/ts-shell/src/config/fields.ts, packages/ts-shell/src/config/layers.ts, packages/ts-shell/src/core/shell/providerCredentials.ts, packages/ts-shell/src/core/commands/connectCommandRuntime.ts, packages/ts-shell/src/cli/interactive/picker/model.ts, 18-configuration-system.md]
created: 2026-10-15
updated: 2026-10-17
tags: [features, configuration, models, providers, gap-analysis]
summary: "复核撤销模型全禁用、登录不写连接及缺JSONC/模型补丁等误判。规划统一可用性与精确连接，并纳入完整profile、预设库、overlay、账号池和路径设置；保留信任、CAS保存、来源及请求归属。"
confidence: high
---

# 模型配置与多中转站

2026-10-17 源码复核。Cheers 为 `0d30d589ec9023ed24e0794c1215f70398bc418d`；此次仅修订文档，没有运行产品、访问真实账户或读取个人配置。旧稿的个人配置观察不作为本次证据。参考采用固定快照 oh-my-pi `c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4`；本机参考 HEAD 已到 `eb74cf84`，不能把工作树新行号绑定到旧快照。

本轮实施归口见 [Phase 20 决策](phase-20-decisions.md)。下文将现有能力、源码缺口和新增方向分开。

## 1. 配置表面与已有契约

| 表面 | 当前事实 | 证据 |
|---|---|---|
| 字段注册 | 36 个顶层字段，另有3个TUI叶子；每项声明schema、sources、merge、security、application、sensitivity、projectTrust | [fields.ts:29](../../packages/ts-shell/src/config/fields.ts#L29) |
| 设置编辑 | 32个可编辑路径；其中29个顶层路径、3个TUI叶子。不能以32/36计算覆盖率：分子分母粒度不同 | [settings.ts:18](../../packages/ts-shell/src/config/settings.ts#L18) |
| 不进普通设置的顶层字段 | `schemaVersion`、`provider`、`providerCredentials`、`providerConnections`、`activeProviderConnectionId`、`allowUntrustedHooks`，以及仅作为叶子容器的`tui` | 同上；[fields.ts:34](../../packages/ts-shell/src/config/fields.ts#L34) |
| 文件 | 项目`.cheers.json`、用户`~/.cheers/config.json`；均已支持JSONC，保存保留原文结构 | [runtimeConfig.ts:492](../../packages/ts-shell/src/config/runtimeConfig.ts#L492)、[syntax.ts:75](../../packages/ts-shell/src/config/syntax.ts#L75) |
| 文件优先级 | 普通字段project→user，之后environment→override；安全字段合并只收紧，TUI叶子另有project优先规则 | [layers.ts:24](../../packages/ts-shell/src/config/layers.ts#L24)、[layers.ts:110](../../packages/ts-shell/src/config/layers.ts#L110) |
| 项目信任 | 项目层实际读取；required字段未受信任时被拒，safe/允许值白名单按字段放行；拒绝保留provenance与diagnostic | [layers.ts:83](../../packages/ts-shell/src/config/layers.ts#L83)、[trust.ts](../../packages/ts-shell/src/config/trust.ts) |
| 项目写入口 | `/settings`可选择project作用域，`openSettings`按作用域过滤后写对应文件 | [settings.ts:76](../../packages/ts-shell/src/cli/interactive/settings.ts#L76) |
| 值内环境引用 | JSONC解析后按schema展开，缺变量报错，替换结果不重扫；不是文本替换 | [references.ts:29](../../packages/ts-shell/src/config/references.ts#L29) |
| 直接环境读取 | 普通字段目前显式接入`CHEERS_MAX_TURNS`；provider凭据另有`OPENAI_API_KEY`等映射，已可纯环境供钥 | [layers.ts:124](../../packages/ts-shell/src/config/layers.ts#L124)、[providerCredentials.ts:147](../../packages/ts-shell/src/core/shell/providerCredentials.ts#L147)、[facts.ts:82](../../packages/ts-shell/src/core/providers/facts.ts#L82) |

因此，“项目配置不可用”“没有项目写入口”“仅纯JSON”“用户必须写配置才能使用环境凭据”均撤销。`configValidation.valid`表示形状/解析有效，不承诺每个项目值被接受；不应把信任拒绝改成语法无效来掩盖来源语义。

### 1.1 保存、应用与预览

`openSettings`已有scope/public筛选、schema校验、substrate revision、一次性保存、字段patch、原始编辑基线、写后读取确认与refresh结果。保存成功、当前生效、下回合生效、重启生效、未确认各有不同输出（[settings.ts:78](../../packages/ts-shell/src/cli/interactive/settings.ts#L78)）。新增tab、搜索、候选描述及编辑器必须保留整链。

Theme已有动态候选和可撤销预览，不能再列为“只可输入JSON”（[picker/settings.ts:73](../../packages/ts-shell/src/cli/interactive/picker/settings.ts#L73)）。设置体验的具体任务见 [30](30-panels-and-model-picker.md)，不在本文重建第二套UI定义。

## 2. 两类配置不是两套执行系统

| 字段 | 角色 | 已核实写入者 |
|---|---|---|
| `providerCredentials` | 每runtime provider的兼容凭据/偏好配置 | API-key登录、账户登录等 |
| `providerConnections` | 带稳定id的具名连接，可容纳同provider多个endpoint | 同一API-key登录、账户登录、pending路径等 |

**API-key登录会同时写两者**：`runLogin`先构造具名connection，再把`activeProviderConnectionId`、connections和provider profile作为一次配置更新写入（[connectCommandRuntime.ts:149](../../packages/ts-shell/src/core/commands/connectCommandRuntime.ts#L149)、[connectCommandRuntime.ts:168](../../packages/ts-shell/src/core/commands/connectCommandRuntime.ts#L168)）。旧稿“只有pending/account路径写连接”错误。

`getRuntimeConfig`将缺省connections/credentials规范化为空集合（[runtimeConfig.ts:529](../../packages/ts-shell/src/config/runtimeConfig.ts#L529)）。把未规范化的`RuntimeConfigFile`强行传给要求`RuntimeConfig`的resolver并观察TypeError，不能证明正常启动会崩溃。实际需要守住原始文件与已接受运行配置的边界。

### 2.1 模型选择器的真实缺陷

`modelPicker.load`仅将`normalizeConnections(config)`的provider放进connected集合；它没有复用实际凭据解析的可用性判断（[model.ts:30](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L30)）。因此仅有兼容凭据/环境凭据时，普通模型行会误标`not connected`、排序也可能错误。

**普通模型行没有`disabled`字段**。只有“该provider没有model”的占位行设置`disabled: !ready`（[model.ts:38](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L38)、[model.ts:51](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L51)）。所以“51/51全部禁用、100%不可用”撤销；静态目录行数也不是所有用户恒定的产品指标。

反方向同样有问题：connected集合不排除pending/error，也只按provider归并。一个具名连接存在，不能证明该provider全部模型、所有endpoint都可请求；可选择、配置完整、已认证、当前可用也不是同一事实。

### 2.2 同provider多中转站的身份

选择器当前发送`<provider>/<model>`，没有把行绑定到具名connection id（[model.ts:72](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L72)）。修标签还不足以完成“多中转站可用”：必须能区分同provider同model的不同连接，并与实际请求、effort、窗口和保存范围绑定。

现有session模型状态已经包含`connectionId/provider/model`，有锁内CAS和条件恢复；delegated target也可显式解析connection id（[state.ts:98](../../packages/ts-shell/src/session/model/state.ts#L98)、[target.ts:6](../../packages/ts-shell/src/cli/provider/target.ts#L6)）。应扩展这些owner，不能靠改变列表排序来改变请求目标。

## 3. 目录与凭据解析：保留已有能力

`loadCatalog`依次合并shipped、刷新cache、用户overlay；`mergeProviders`和`mergeModelEntry`已经支持稀疏覆写及保留未指定能力（[catalogStore.ts:46](../../packages/ts-shell/src/core/models/catalogStore.ts#L46)、[catalog.ts:560](../../packages/ts-shell/src/core/models/catalog.ts#L560)、[catalog.ts:615](../../packages/ts-shell/src/core/models/catalog.ts#L615)）。旧差距表“无模型补丁”错误。用户目录与刷新缓存的职责也不能互换。

现有凭据级联已经覆盖CLI、选中连接账户凭据、环境、连接API key/账户、provider兼容账户/API key等分支（[providerCredentials.ts:49](../../packages/ts-shell/src/core/shell/providerCredentials.ts#L49)）。本轮不凭参考的级联顺序全局反转既有优先级；UI应复用相同的选择事实并返回脱敏投影。

## 4. 参考决策比较（固定版本）

采用[oh-my-pi固定快照](https://github.com/can1357/oh-my-pi/tree/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4)。下列是源码比较，不是新运行实测。

| 参考具体决策 | Cheers状态与裁定 | 反转时必须失败的验收 |
|---|---|---|
| `models-config.ts/validateProviderConfiguration`区分完整自定义provider与稀疏override，并校验协议/模型kind | 同意“明确区分定义和补丁”；复用现有catalog merge，不复制配置系统 | 只改baseUrl不能丢失compat/vision/模型；自定义协议错误不得发请求 |
| `models-config-schema-bundle.ts/ModelDefinitionSchema`允许能力、窗口、费用和稀疏override | 当前已有部分能力元数据，缺项按真实consumer引入；不以字段数量作为差距结论 | 未声明支持的能力不得因UI可选就发送；错误/未知费用不填0 |
| `auth/cascade.ts/#resolve`配置代理key优先于池OAuth；restricted池遇到代理override拒绝混用 | 同意凭据与endpoint绑定；Cheers未有同种账号池，不能照抄该条件或直接宣布已存在泄漏 | 同provider两endpoint不互换凭据；显式connection不回落别的账号；无凭据零发送 |
| `settings.ts/getProvenance`区分runtime/overlay/project/global/default，null视为unset | 保留Cheers更细的accepted/rejected来源；不引入无consumer的通用墓碑协议 | 清除user override后显露合法下层；null、缺失、显式空值不混淆 |
| profile通过目录根隔离会话、配置、凭据和多类cache | 用户已纳入Phase 20；完整隔离需要逐类路径验证，不能只加modelPreset字段 | 不同profile会话/凭据不串用，切换失败不产生半迁移 |

### 4.1 参考schema清单（保留研究资产）

固定快照的`ProviderConfigSchema`有17个顶层键；`ModelDefinitionSchema`有24个顶层键，旧稿“27个”及model级`transport`不符合该定义。`transport`存在于provider级，不应凭继承叙述计入model schema。

| schema | 字段（嵌套子键不另算） |
|---|---|
| Provider身份/传输 | baseUrl、apiKey、api、headers、compat、authHeader、auth、transport |
| Provider目录/压缩 | models、modelOverrides、discovery、remoteCompaction、disableStrictTools |
| Provider Bedrock | guardrailIdentifier、guardrailVersion、guardrailTrace、requestMetadata |
| Model身份/传输 | id、name、api、kind、baseUrl、headers、compat |
| Model能力 | reasoning、thinking、input、imageInputDecoder、supportsTools、preferWebsockets |
| Model计量 | tokenizer、cost、promptCache、premiumMultiplier |
| Model窗口/压缩 | contextWindow、maxContextWindow、maxTokens、omitMaxOutputTokens、contextPromotionTarget、compactionModel、remoteCompaction |

旧稿设置546/408、env36、profile“15类路径”等数字来自声明扫描或抽查；没有逐项动态证明，不再用来判定UI覆盖率、可靠性或项目优劣。是否采用某个字段取决于它的consumer、信任、保存与应用契约。

## 5. Phase 20 技术裁定与任务

| 任务 | 设计决定 | 验收 |
|---|---|---|
| 连接可用性投影 | 在provider/selection既有owner产出脱敏投影，供model/connect/status/CLI列表复用；状态区分configured、pending/error、missing credential、unsupported、unknown | legacy-only、env-only、同provider两个连接、pending/error、已失效账户各有独立fixture；显示与实际selection一致，零网络探测 |
| 精确模型选择 | 选项绑定connection identity、model及effort；用现有session模型事务；兼容无连接的已有凭据输入 | 同名模型不串endpoint；目录/凭据revision变化拒绝旧选择；失败不改半个模型/全局默认 |
| 配置来源与UI | 保留required信任和source白名单；UI metadata留在展示owner，增加结构化候选与类型化编辑器 | user/project/override、存储未生效、重启、信任拒绝和保存unknown均可见 |
| 环境字段声明 | 普通字段需要时把现有`CHEERS_MAX_TURNS`迁入统一声明，首批只加有明确需求的非秘密项；provider环境变量继续由provider facts负责 | 缺失/空/非法/超界值、优先级、来源诊断；不把所有字段自动开放给env |
| 凭据目标绑定 | 明确选择及最终请求准备共用identity；诊断不含key/header/秘密URL | A连接的账户token不得因B的baseUrl而发送；迟到refresh不能覆盖新连接 |

生产实现不为修UI强制迁移两类持久配置。若以后删除兼容表，须另有版本化迁移、冲突优先级、可回退副本及并发保存设计。

## 6. 原决策表去重与去向

旧合并稿多次使用C-01等编号；引用必须加分节命名空间。以下保留全部议题，不把重复行当独立任务。

| 原ID（25/分节） | 处置 |
|---|---|
| 主文/C-01、主文/C-06 | 共享投影并保持已接受RuntimeConfig边界；不强制迁移、不扩大resolver输入类型 |
| 主文/C-02 | 连接凭据由/connect拥有，settings可导航至连接管理，不把秘密塞进普通JSON编辑器 |
| 主文/C-03、模型/C-03 | 保留现有项目信任及按字段收紧语义，已裁定 |
| 主文/C-05、模型/C-04 | JSONC已实现；无迁移YAML需求，保留JSONC |
| 模型/C-05 | 接受endpoint/credential绑定与反例验证，不以没有账号池为由跳过 |
| 模型/C-06、配置/F-01 | 按字段声明已有env与明确首批需求；不声称目前完全没有环境读取 |
| 配置/F-02、F-03、F-08 | 结构化候选及说明；metadata保持分离；类型完整性与行为测试验证，不写仅“字符串非空”测试冒充语义质量 |
| 配置/F-07 | 保留valid与trust/provenance的正交语义，消费者展示拒绝原因 |
| 配置/F-05 | 不引入通用null墓碑；清除特定override使用既有unset/字段patch契约 |
| 主文/C-04 | 命名模型/角色预设：用户已纳入Phase 20；现有会话级命名预设须原位兼容，扩展profile预设库 |
| 模型/C-01、配置/F-06 | 完整profile隔离：用户已纳入Phase 20 |
| 模型/C-02、配置/F-04 | 多文件overlay：用户已纳入Phase 20；不能借机反转user/project安全优先级 |
| 配置/F-09 | 路径作用域设置：用户已纳入Phase 20；先定义canonical workspace与信任继承 |
| 参考账号池 | 账号池：用户已纳入Phase 20；需配额/退避、OAuth受众、亲和性及不重复未知请求，不能只轮换key |

## 7. 已纳入的四类配置扩展

2026-10-17用户明确：完整profile隔离、命名模型/角色预设、多配置overlay、账号池**全部纳入Phase 20**，随后也将按路径作用域设置纳入。下面按当前实现与固定参考补齐设计，任务归口CFG-01…05、PRV-01…05。

### 7.1 Profile身份与路径

当前路径owner的legacy回退（[userHome.ts:70](../../packages/ts-shell/src/core/paths/userHome.ts#L70)、[sessionFileLayout.ts:31](../../packages/ts-shell/src/session/store/sessionFileLayout.ts#L31)）必须只服务default profile。named profile从独立空根开始，禁止缺文件时回退default或旧产品目录；切profile使用受控重启，启动后冻结`profileId/root/rootIdentity`并传入consumer，不能热改`HOME`或进程env让在途请求换根。

建立逐类consumer清单：config、catalog、credential/MCP auth、session/reentry、trust/approval、usage/ledger、jobs、extensions、memory、logs、cache及artifact。可变项目memory目前有直接workspace写入（[agentMemoryManager.ts:35](../../packages/ts-shell/src/core/subagents/agentMemoryManager.ts#L35)），不能漏过；将profile私有状态按profile+canonicalWorkspace命名空间隔离，有意共享的项目规则/skills仍是项目输入。若共享daemon/通知通道，认证、session索引、每次路由都携带profile身份。

参考[dirs.ts:63](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/utils/src/dirs.ts#L63)拒绝非法名称和Windows保留名；同意此决定。其[共享daemon根](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/utils/src/dirs.ts#L387)说明“参考所有路径完全隔离”不成立。Cheers采用冻结context而非参考的全局env切换，这是为保护在途任务归属的有理由分歧。

迁移/导入是显式、版本化、可重入的操作，绑定源revision与目标冲突，源数据默认保留。**首版不复制live rotating OAuth凭据到named profile**：可导入非秘密连接/账号引用，但目标标记需独立登录；复制文件不创造独立refresh授权。源保留与目标可发送是两件事。中断只留下可恢复状态，不将半导入标成功；跨文件不承诺崩溃原子性。测试必须让A/B在同workspace使用相同session/connection名字仍互不可见，覆盖旧根回退、symlink换根、Windows名称/大小写别名和迟到任务写入；同一旋转token不能通过导入变成两个获准自动refresh的副本。

### 7.2 预设库与精确事务

Cheers已有真正具名预设：`presets[name].roles`保存到session并可恢复（[preset.ts:37](../../packages/ts-shell/src/core/commands/model/preset.ts#L37)、[state.ts:26](../../packages/ts-shell/src/session/model/state.ts#L26)）。本阶段扩展profile库、来源/遮盖显示、保存/提升/删除以及完整角色应用；不是从零做“预设”或暗中把session预设提升全局。

参考[model-presets.ts:59](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/config/model-presets.ts#L59)按同名整项取owner；同意，禁止跨层拼出没人保存过的role组合。删除某层后若另层仍有定义，输出剩余来源。不同于参考先保存global再切live的次序，默认应用经现session CAS一次更新connection/model/effort及role策略，不修改全局active connection；跨连接也必须在这一事务中完成。不存在的model/account/connection、旧revision及中途失败均不留下半更新。

角色记录只存非秘密引用；逐角色consumer清单必须覆盖真实用途，当前显式`apply <name> <role>`不能被写成所有后台请求都已自动消费角色。测试含同名model不同endpoint、overlay遮盖、并发删除预设、全局保存冲突及恢复。

### 7.3 多配置Overlay

保留JSONC与已有字段registry。普通值顺序为现有project/user合并结果→CLI显式overlay顺序→environment→runtime override；TUI及安全字段按其既有merge政策而非通用deep merge处理。每文件保存canonical来源、权限类别和raw revision；项目引用文件不能自动取得user来源权力。凭据overlay进入专门的个人授权边界，设置预览不展示秘密。

参考[settings.ts:2485](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/config/settings.ts#L2485)显式路径有序加载、缺失/坏文件硬失败；同意。与其通用深合并不同，Cheers保留intersect/union/deny/disable，不能用后层解除前层安全限制。多文件reload先构造完整候选再一次发布；出错保留上个accepted snapshot和可见诊断/准入结果，不能暴露混合代次。

overlay默认只读输入；显式编辑目标沿用[persistence.ts:35](../../packages/ts-shell/src/config/persistence.ts#L35)的字段patch、锁内重读、基线比较及写后确认，不把effective整份写回user。验收含参数顺序、相对路径/CWD、重复路径、失效文件、source allowlist、信任撤销、并发修改与清除后显露下层；不为全部字段引入null墓碑。

### 7.4 账号池与请求归属

账号池是显式授权集合，限定profile、provider、connection endpoint/协议、OAuth受众/tenant/region。稳定credentialId和generation不等于数组下标/email；空集合代表零授权，限制无效必须拒绝，不能回退env或默认账号。主请求、compact、advisor、subagent、标题及cache warming都继承同一限制，子作用域只可收紧。

沿用现[account/state.ts:69](../../packages/ts-shell/src/core/auth/account/state.ts#L69)精确归属与条件保存，在[authorization.ts:203](../../packages/ts-shell/src/provider/request/authorization.ts#L203)的进程内single-flight之上增加跨进程refresh lease、锁内重读、CAS与owner fencing。存储owner的profile+credentialId+generation与可消费refresh lineage分别建模：互斥须覆盖同一lineage，不能靠换profile/id制造第二次授权。首版用§7.1的独立重登录避免跨profile live-token克隆；不暗中共享default的refresh authority。迟到refresh不得覆盖删除/重新登录，不能先花token再争lease。

lease/CAS不能保证网络副作用恰好一次。当前[exchange后返回](../../packages/ts-shell/src/provider/request/authorization.ts#L258)与[后置保存](../../packages/ts-shell/src/core/auth/account/renewal.ts#L31)之间仍有故障窗口。新增refresh持久状态prepared→dispatched→rotated-persisted，以及unknown；dispatch前记录归属，服务器可能已旋转而响应丢失、取消或落盘前退出时保留unknown。lease过期不证明未发送，接管者不能重放同一旧token；仅provider明确支持可安全重用/幂等时按其契约恢复，否则要求重新登录。迟到成功响应仍按原owner/generation条件保存，取消等待不应直接丢弃唯一新token。

现[PreparedRequest](../../packages/ts-shell/src/core/agent/request/model.ts#L34)尚无完整profile/connection/account身份，需要给现attempt链增加非秘密绑定。A请求迟到429时按A的captured credential generation记退避，不能惩罚当前已切到B的会话。401、模型授权、quota、429、timeout、5xx分别归因；未知或已输出部分流不因轮换而重播。每个合法重试有独立账目与统一budget；跨账号幂等性不能凭同一个key假定成立。

参考[cascade.ts:334](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/ai/src/auth/cascade.ts#L334)的受限池禁止代理key混用、[rotation.ts:373](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/ai/src/auth/rotation.ts#L373)按实际credential归因、[refresh.ts:97](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/ai/src/auth/refresh.ts#L97)的跨进程lease均同意，并补profile/connection命名空间及durable unknown。反转这些决定时，空池fallback、relay接收错误OAuth、A错误禁B、健康并发重复refresh、旋转后响应丢失/退出/lease接管时重播旧token、跨profile导入可消费副本、旧generation覆盖新登录各必须实际触发失败。

服务端quota与本地session cap分别显示as-of/measured/stale/unknown。换账号不能清空session累计账本；无usage不填0，无可信quota不能显示无限余额。请求是否能重试仍归现provider request owner，不为池另造执行/账本系统。

### 7.5 按路径作用域设置

路径规则是配置派生机制，不是新的workspace授权。当前已有[canonical workspace与trust revision](../../packages/ts-shell/src/config/trust.ts#L12)、[一次性generation ticket与不可变publication](../../packages/ts-shell/src/config/state.ts#L73)、[普通快照与安全撤销分离](../../packages/ts-shell/src/core/shell/configuration.ts#L49)，以及[实际执行cwd绑定](../../packages/ts-shell/src/runtime/execution/binding.ts#L13)。CFG-04复用这些边界；不能在settings面板内匹配、修改全局cwd或共享“当前scope”。

固定参考的实际范围比旧稿所暗示的窄：

| 固定参考决策 | Cheers取舍 |
|---|---|
| [model-settings.ts:63](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/config/model-settings.ts#L63)仅enabledModels、enabledProviders、disabledProviders三项标记pathScoped | 不称为任意字段overlay；每个可作用域字段必须声明schema、合并、scope basis、合法来源和真实consumer |
| [settings.ts:371](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/config/settings.ts#L371)用resolve/relative匹配；[493](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/config/settings.ts#L493)将所有命中列表按声明顺序追加 | 不是最长前缀胜出，也未做realpath。Cheers使用canonical目录组件边界和明确的逐字段合并；不复制startsWith('..')对合法子名..cache的误排 |
| [model-resolver.ts:1920](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/config/model-resolver.ts#L1920)对已配置但无模型匹配返回空列表 | 同意不偷偷回退全局默认；区分无规则、命中后空集、模式无目录匹配，空集不自动等于无限制 |
| [capability/index.ts:357](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/capability/index.ts#L357)的enabledProviders用于外部工具用户配置源opt-in | 不能把三个字段混称LLM provider白名单；模型连接策略与capability source仍归各自owner |
| [cloneForCwd](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/config/settings.ts#L1285)建立独立实例，[withActiveSettings](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/config/settings.ts#L3960)用async scope处理同cwd不同session | 同意并行身份隔离。Cheers主路径优先显式参数；扩展兼容ambient API时用async scope，不用“最近构造的同cwd实例”猜owner |

实现契约：拟新增`config/scope/{contract,path,resolution}`，只拥有typed rule、匹配与不可变派生值；fields/layers/provenance/state保留校验和发布责任，路径权限继续由workspace、pathJail及execution authority承担。

1. **规则与路径。** 项目规则相对声明项目的canonical workspace；user/overlay相对路径必须有固定声明基准，不在消费时读取process.cwd()。首版使用目录prefix，按组件匹配；不另加未定义的glob语义。现存目标解析真实路径，未创建目标复用最深存在父目录的containment；目录identity用于变更检测。Windows drive/UNC及大小写按实际文件系统处理，不能统一lower-case。
2. **字段与优先级。** 首版登记公开且有操作级consumer的字段，以及现安全列表/开关的收紧规则；即时/重启TUI字段不因访问文件而切换。普通scalar在同一合法来源内部按宽→窄应用，等价prefix按声明顺序并给诊断；层间继续原source/trust顺序，列表按字段政策。安全限制累积，不因更深规则撤掉父级deny。provider endpoint、credentials和账号池授权不作为路径值开放；预设等非秘密引用也只能由其合法、已授权来源解析。
3. **操作基准。** 对话、摘要、标题等模型请求使用session/子代理绑定的工作scope；shell用实际启动canonical cwd，文件工具用实际目标路径。最近编辑文件和另一个shell的目录不能改模型身份。多文件逐目标求策略，权限取共同限制；普通设置冲突显式拆分或拒绝。shell内部cd不重解释已批准操作的配置，真实限制仍由sandbox/authority执行。
4. **快照与失效。** 捕获profile/session/workspaceIdentity/configPublication/trustRevision/scopePath/ruleRevision。await、重试和后台完成使用捕获身份，安全撤销仍实时准入；root rebind、trust或规则变更通过现ConfigState.transition失效旧ticket。A→B→A也不能复用旧准入。源文件保存走所属owner的patch/CAS，不把effective派生值写回。

反转验收覆盖：`/repo/a`不匹配`/repo/ab`但匹配`/repo/a/..cache`；symlink别名结果一致、换目标/换目录identity拒绝旧批准；Linux大小写及Windows drive/UNC；受控barrier交错A/B session/cwd/扩展回调/重试/后台完成；同cwd不同profile/override不串值；root A→B→A及trust撤销；父deny与子allow不扩权；已配置模型无匹配不fallback、allowedTools空集零授权；跨scope多文件及未存在目标逐项校验。settings检查指定scope只展示命中规则、来源和实际值，不改变任何操作的scope。

## 8. 证据边界

此轮完成上述源码事实与固定参考机制的复核；未运行settings交互、真实provider、profile隔离或参考项目。文档中的验收均为实施要求，不是已通过证据。UI字段质量、跨进程并发、实际多中转站请求绑定和跨平台行为必须由相应实现批次验证。
