---
title: "Phase 19 裁决：生产正确性、完整交互与自主协作能力"
category: article
sources: [14-user-experience-research, 15-deep-research-design, 16-tui-composer-and-theme, 17-tui-status-and-panels, 18-input-slash-startup-context, 19-tools-maturity-and-multifile-edit, 20-configuration-system, 21-session-recovery-and-undo-ux, 22-command-inventory-alignment, 23-command-argument-options, 24-shared-command-parity, verification-15-21]
created: 2026-10-05
updated: 2026-10-05
tags: [phase-19, decisions, production, tui, commands, research, goal, collaboration]
summary: "汇总 14–24 的纠错、维护者裁决、生产契约、分批任务及验收标准。包含完整自主目标、软件与论文深研、八种输入框形态、Git 工作台、顾问、安全分析、公共技能商店和远程协作。此文是待实施计划；文档审查完成不代表功能或生产验收完成。"
confidence: mixed
---

# Phase 19 决策与任务规划

## 1. 范围、基线与效力

本计划以 Cheers 的 28ff98cee8c4dd63e6752452f73a362ed3559ae3 为源码基线。输入为 [14 的问题与隔离探针](14-user-experience-research.md)、经本轮修订的 15–24，以及 [复核记录](verification-15-21.md)。当前用户要求高于早期研究的建议和 Phase 18 的延期决定；同一问题以本文和本轮明确用户答复为准。

**本轮交付是研究纠错与规划。下面的任务全部尚未实施、未验收。** 不修改产品源码、配置、依赖、脚本或构建，不因形成计划就宣布修复，也不据此发布或合并代码。

[Phase 18 验收表](phase-18-acceptance.md) 的 W7-33 仍沿用“认证前置失败、四端点真实 TLS/HTTP2 矩阵未完成”的历史状态；本轮未重跑。它不阻塞无关的本地设计与实现，却仍是涉及这些端点的发布验收缺口。不得把它改写成 Phase 19 已通过或已取消。

### 1.1 已确认的用户裁决

| 编号 | 最终决定 | 对计划的约束 |
|---|---|---|
| U01 | 恢复真正的 /deep-research，支持软件/项目与论文两类研究，对抗核验是必备环节 | /web-research 保留为有界收集器；新研究不能以搜索列表或一段 prompt 冒充完整能力 |
| U02 | 配色采用参考 dark 的精确对应值；八种 Composer Shape 全部提供；默认名称 default；产品标识符保持中性 | 共有、同义、无同义三类映射分清；支持参考的终端默认前景语义，不能擅自保留三个固定前景例外 |
| U03 | 输入左右各留 2 cells；复制排除布局装饰与留白 | 用户自己输入的缩进、尾空格、tab、逻辑换行必须原样保留 |
| U04 | resume 打开即聚焦并标识当前 session；以文件大小替代 turns | current 从运行时身份派生；大小口径见 §3.5 |
| U05 | 所有带参数命令提供可信的后续选项或语法提示，功能向参考对齐 | 先查真实行为，再接同一个语法与操作 owner；菜单里不能出现尚未实现的动作 |
| U06 | /goal 实现完整自主执行、暂停恢复及主代理/子代理统一预算 | 不接受只补 set/show/budget 的菜单和状态字段 |
| U07 | **未设置 /goal 预算时不设置总 token 上限**；只有显式预算才限额 | 不强制先配置预算、不暗设 100,000 上限；budget off 取消 token cap。单次请求与模型窗口限制不是总目标预算 |
| U08 | 完整 Git 分块暂存面板、实时顾问、安全分析、公共技能商店、远程协作全部纳入 Phase 19，可分更多批次 | 这些是本阶段正式交付项；不能在末尾改列“以后评估”，也不能用新增命令入口代替实现 |
| U09 | /undo 撤销最近一次已提交的编辑操作；一次多文件 patch 算一个操作 | 先预览确认并检查外部修改；不按整轮、全项目最新 authority 或任意 shell 副作用猜测 |
| U10 | /model 默认只改当前会话；显式 --global 才改全局默认 | 会话选择随会话持久化以供 resume；“会话范围”不等于“完全不落盘” |
| U11 | 三个无同义参考角色采用新映射：syntaxBuiltin #9CDCFE、scrollbarTrack #808080、scrollbarThumb #e5e5e5 | 这是用户批准的本产品映射，不能称参考仓唯一确定的值 |

### 1.2 技术裁决原则

1. 延续 [架构规则](../../agent-rules/architecture-boundaries.md)：TypeScript 单运行时、唯一执行服务；新领域使用明确 owner，入口只做适配；core 不反向依赖 feature。现有 loop、writer、picker、session store 能承担的职责不另造一套。
2. 默认保留现行命令、特殊调用形式、数据和可恢复历史。新增能力明确迁移；不按“参考缺少”删除 Cheers 功能，不按同名推定同义。
3. 生产契约必须包含输入校验、权限、资源边界、取消、并发、持久化、失败及未知结果。运行一个正常样例不等于这些契约成立。
4. 模型输出、快照存在、用户批准、写入开始、未发现反证，各自都不是最终成功证明。结果由相应 owner 的实际证据决定。
5. 没有业务理由的主观重命名不做。保持 /thinking、/cost、/skill、/plugin 等既有主名；参考名称可作为经过语义审查的兼容入口。/deep-research 按 U01 单独迁移。

## 2. 纠错后的事实基线

下表只列影响排期和方案的事实。完整错误、参考快照与证据边界见 [复核记录](verification-15-21.md)，不把静态检查称为运行验收。

| 事实 | 对 Phase 19 的影响 | 证据 |
|---|---|---|
| 通用注册表 58 个主命令、58 个别名、26 个补全 provider；额外交互 /back 使静态交互入口为 59 | 不能以 58 宣称已覆盖全部 TUI 入口；扩展命令继续动态加入 | [registry](../../packages/ts-shell/src/core/commands/registry.ts#L71)、[交互目录](../../packages/ts-shell/src/entrypoints/slashCommandRegistry.ts#L62)、[22](22-command-inventory-alignment.md) |
| 43 个 argumentHint 不等于参数命令数；按 23 的行为分类为 44 个参数命令，其中 18 个无 provider | hint/provider/handler 三种口径分别维护；自由文本用 usage 提示，不伪造动作 | [23](23-command-argument-options.md) |
| 参考 85 顶层、138 展开子项合计 223 个声明；不是 212 个去重动作 | 词法计数不能作为功能覆盖率或交付目标 | [22](22-command-inventory-alignment.md) |
| 14 个 picker、plan 执行约束、会话新建、rename/delete、branch summary、retry、输入队列已经接线 | 扩展和修复现有 owner；不重建“缺失的 ModalHost/Plan/Session 引擎” | [picker 注册](../../packages/ts-shell/src/cli/interactive/picker/registry.ts#L63)、[工具策略](../../packages/ts-shell/src/core/query/toolPolicy.ts#L51)、[24](24-shared-command-parity.md) |
| /clear 已建立新会话边界并保留非空旧会话；/reset、/cls 为其别名 | /new 是兼容直达入口；前缀 /res 的候选接受绝不能直接执行 /reset | [clear](../../packages/ts-shell/src/core/commands/clearCommandRuntime.ts#L4)、[history](../../packages/ts-shell/src/cli/interactive/history.ts#L159) |
| /model list/use 已存在；/fast 当前只改温度；/commit 会委派真实提交 | 分别修补全、设计真实 service-tier 能力、保留提交的写入边界，不能套用错误命令说明 | [model](../../packages/ts-shell/src/core/commands/modelCommandRuntime.ts#L42)、[fast](../../packages/ts-shell/src/core/commands/fastCommandRuntime.ts#L5)、[commit](../../packages/ts-shell/src/core/commands/commitCommandRuntime.ts#L95) |
| executionService.readTextFile 本身不做路径 jail；LSP 不止 hover 存在直接 filePath 入口 | SAFE-02 检查所有读取入口及最终目标，不能仅换一个读取函数 | [service](../../packages/ts-shell/src/runtime/execution/service.ts#L41)、[lsp readSource](../../packages/ts-shell/src/core/tools/lsp.ts#L238) |
| 内存预检、进程内锁、逐文件 atomic rename 都不等于跨文件事务 | 多文件与 undo 必须显示部分提交、条件补偿和未知结果 | [service](../../packages/ts-shell/src/runtime/execution/service.ts#L74)、[恢复桥](../../packages/ts-shell/src/edit/recovery/restoreExecutionBridge.ts#L54)、[19](19-tools-maturity-and-multifile-edit.md) |
| 配置已有局部 parser/normalizer，但缺完整 schema；个人连接优先有明确设计原因 | 不全字段 project-first，不将 CLI-only 豁免搬进文件，不用原值诊断泄露凭据 | [runtimeConfig](../../packages/ts-shell/src/config/runtimeConfig.ts#L477)、[20](20-configuration-system.md) |
| 默认 TUI 是 fullscreen；regular 路径存在 marker/caret 问题，但用户现场残影尚未归因 | 修确定缺陷，再以真实终端画面验证；不能把修代码当成现场根因已证实 | [默认配置](../../packages/ts-shell/src/config/runtimeConfig.ts#L425)、[render](../../packages/ts-shell/src/presentation/tui/render/engine.ts#L321)、[18](18-input-slash-startup-context.md) |
| 输入已有 caret-follow viewport；回退已有 note/draft 链路 | 保留并补边界，不重新实现已经存在的滚动和回填 | [editor](../../packages/ts-shell/src/presentation/tui/editor.ts#L447)、[rewind](../../packages/ts-shell/src/cli/interactive/picker/rewind.ts#L64)、[21](21-session-recovery-and-undo-ux.md) |
| 5.4k 是用户首条消息后的用量显示；历史 fixture 的工具粗估 3,063、完整 system 3,334，不能据此拟合真实分项 | 区分 wire bytes、tokenizer 计数、字符估算与 provider usage | [14 §7](14-user-experience-research.md)、[usage](../../packages/ts-shell/src/observability/usageTelemetry.ts#L139) |
| 当前 /goal 按项目保存 objective/phase/updatedAt，主要作用是提示词注入 | 新增真正的会话目标运行状态、共享计量、调度和恢复；旧目标迁移不能自动开始执行 | [projectState](../../packages/ts-shell/src/core/state/projectState.ts#L26)、[prompt](../../packages/ts-shell/src/turn/prompt.ts#L111) |
| 相同 loop 不意味着子任务已有完整轨迹、压缩与可恢复研究阶段 | AUTO/RSC 显式接线子任务事件、预算和恢复；不能只写一份研究 prompt | [runner](../../packages/ts-shell/src/core/subagents/runner.ts#L166)、[15](15-deep-research-design.md) |

## 3. 贯穿各批次的生产契约

### 3.1 命令、输入与报告

命令目录区分显示身份、实际 invocation、参数语法与副作用。真实同义 alias 共用 picker 和参数机制；/recall、/retain 等按 rawCommandName 有专门语义的入口必须保留区别。/memory delete 与 invalidate、wake 与 recall 都不是可互换的别名。

补全使用原草稿的 UTF-16 半开区间 [from,to)，并携带 cursor、draft revision、workspace/session/catalog identity。替换必须保留前缀和后缀、原空白及转义；异步结果过期即丢弃。补全接受只改变草稿；完整合法命令才通过明确提交执行。未知参数、缺值、非法数值不得静默映射为写操作；自由文本和 shell 参数不能被通用词表误拆。

同一个声明式语法同时供 help、completion、parser、validation 消费，动态模型/技能/工具/路径从有效目录查询。迁移完删除旧静态字典；不能长期维护双份事实源。/help 选择默认填入 composer，保留参数提示，不用“浏览帮助”隐式执行操作。

安全命令与存储双重校验实际枚举，不用普通对象原型链查表接受动作。当前 [trust 解析](../../packages/ts-shell/src/core/commands/trustCommandRuntime.ts#L30) 与 [trust 存储](../../packages/ts-shell/src/core/security/projectTrust.ts#L85) 需要纳入 CMD-03：constructor/__proto__、未知动作及多余参数必须零写，保留已有 untrusted 决定；completion 白名单不能替代运行时边界。

命令结果使用纯文本兜底及结构化 spans/columns/status。presentation 才生成颜色；不得把 ANSI 写进新增持久化、JSON 或模型正文。只读 report 与执行 picker 分别建模；theme/shape 可临时预览，修改执行语义或持久配置的设置只在 Apply 生效。

### 3.2 自主目标、预算与顾问

目标实例绑定 goal ID、session、canonical workspace、版本及单一运行 owner。旧项目目标保留为可导入的目标描述；迁移或 resume 不能自行认定用户授权启动一个新目标。/goal set、show、pause、resume、drop、budget 为规范入口，保留 complete/done/clear 等兼容调用并明确各自动作。drop/clear 是放弃；用户手动 complete 记录为用户声明完成；自动完成另需目标验收证据，不能以停止循环或用完预算代替。

**预算缺省为未设上限。** 未给 budget 且未有显式设置时，不设置目标总 token cap；显式 N 约束该目标下主代理、子代理、顾问及重试的总消耗；off 清除该 cap。显示“未设置”而非 0。降低预算低于已用量时阻止新的请求，不改写历史消耗。费用按可得费率估算，不能充当实际账单。

统一 token 口径为每次实际模型请求的完整输入与生成输出之和：输入包含缓存命中/写入部分，输出包含 reasoning；provider 已包含的子项不得重复相加。不同协议先归一化为互不重叠的计量项，记录计量版本；不按价格给缓存 token 打折，也不以字符估算替代实际 usage。重试是新 attempt，父代理不得再累加已经在子请求账本结算的汇总值。工具服务的非模型费用另列，不混充 token。

**显式 budget N 就要求严格准入，不另设默认宽松模式。** 所有相关模型请求在统一边界以 request/attempt ID 持久预留；仅当“已结算用量 + 未结算预留 + 本次可证明的上界 ≤ N”才可发送。上界须覆盖实际序列化的输入、工具/媒体内容及可强制的全部输出上限。协议/模型无法提供可靠上界时返回 admission unsupported，暂停该能力并说明原因；不能以任意保守估计宣称已保证 cap。无 cap 时仍可使用该能力，但明确 usage 的已知与未知部分。

已发送请求取消、断流、缺 usage 时保留原预留，直到可信对账；只有确认未发送才能全部释放。重启不得丢失在途账目或重复结算；降低 cap 后已用量与预留超出新限额时停止新准入，不抹去记录。provider 违反声明上界或回报超额时保留实际值、阻断后续请求并报告 breach，不能截断计数伪装达标。此契约控制客户端请求准入，不承诺外部服务账单正确或在途远端计算可撤销。

从无 cap 或 budget off 切到 N 时，历史用量与未知项继续保留；先形成可信累计值或有限上界，不能把历史 unknown 记作 0 后开启“严格预算”。不能完成对账/上界证明时保留该设置并阻止新准入，显示未满足的条件；取消 cap 不删除账目。

无总预算上限仍保留单次模型窗口/输出限制、单请求超时、并发上限、权限与可响应的取消。不得另加一个未公开的固定“目标最多 N 轮”代替用户的无上限决定；单轮 step 上限可作为调度切点，未完成目标可继续下一轮。连续不可恢复错误、授权拒绝、资源不可用和完成判据分别有可解释的暂停/停止状态。

本地 oh-my-pi 1c0993c3d12e70042169a951663bb2702e2c0a9e 的定向核查支持这一默认语义：[创建目标](../../../oh-my-pi/packages/coding-agent/src/modes/interactive-mode.ts#L5101) 不填写 tokenBudget，[budget off](../../../oh-my-pi/packages/coding-agent/src/modes/interactive-mode.ts#L6015) 传入 undefined，[运行状态](../../../oh-my-pi/packages/coding-agent/src/goals/runtime.ts#L285) 保留已用量。其计量排除 cacheRead，且阈值主要由事后检查/提示推进；不能据此声称已有严格父子共享预留。Cheers 采纳“未设即无 cap”的产品语义，显式 cap 采用上述统一口径与准入契约，并保留反转测试。

pause 立即停止新派发并传播取消，在有界收尾后持久标记调度 paused。调度暂停、在途执行收尾和用量对账分开显示：缺 usage 可以继续保留 unknown/预留，不无限等待对账才响应暂停；远端终止未确认时不得宣称全部已停止或无消耗。重启先对账，再恢复调度；未知写入不自动重放。会话锁、调度 owner、请求去重不得被普通进程内 Map 冒充跨进程保证。

顾问复用同一工具/模型/预算边界，默认按用户启用后的研究或执行检查点运行，有并发与频率限制。意见不自动改文件、不自带批准权，也不把“顾问未返回”当批准。模型路由与 prompt 配置分开验证，不能因配置存在 model 字段就宣称多模型已接通。

### 3.3 深度研究与证据

/deep-research 及 research/deep aliases 在同一发布归入新研究流程；从 /web-research 移除这些 alias，帮助说明语义变化。收集器继续提供原能力；同一个词不能同时表示收费模型研究与无模型收集。

新研究领域负责 brief、子问题、阶段、来源、声明、反证、覆盖及产物；复用现有 agent loop，不建第二 provider/执行路径。最小证据记录由实际 search/read/fetch 产生，包含稳定 ID、版本或论文 ID、原始/最终地址、获取时间、读取状态和可定位摘录。模型引用未取得的来源必须被产物校验拒绝。

软件研究锚定版本、平台和配置；论文研究区分元数据、摘要、全文、页/节定位、引用关系、实验条件、撤稿/修订。PDF/全文获取与解析纳入 TOOL-02 和 RSC-02；不可得的全文明确标记受限，不输出未经核查的方法结论，不绕过访问权限。

研究者与反驳者使用受控的只读能力；需要在 plan 模式委派时通过通用 capability 契约明确准入，不自动切 build、开 shell 绕过 deny。并发只对已经审查过的只读任务开放，不全局移除 task 的串行约束。

支持程度、review 状态、冲突、覆盖分别记录。多个转载不等于独立支持，红队未发现反证不等于事实证明，来源打不开或审查超时不等于通过。报告与校验器消费这些记录；不恢复 Jaccard 投票、固定模板式“已验证”或无消费者的大型证据体系。

长报告可分段生成并形成有序产物；write 工具参数仍受模型输出预算限制。只有选择保存时才按文件写入授权执行；保存失败不能把预期路径列为已交付文件。

### 3.4 配置与外部输入

维持现有路径和 JSON 读取兼容，增量支持 JSONC 时使用成熟、完整的 parser；禁止正则去注释/去尾逗号，不首次保存就迁移扩展名。字段 registry 声明 allowed sources、敏感度、校验、合并、消费者和应用时点。普通字段先兼容既有 user-over-project，TUI 特定字段的 project 优先单列；不把“统一”实现成全局反转。

个人身份、provider/endpoint 选择不能被项目文件静默替换；项目规则只能收紧安全约束，allowUntrustedHooks 保持 CLI-only。项目内引用环境变量并不天然安全，凭据与发送目标要绑定审核。诊断仅含安全的键、来源、错误码和类型说明，不带秘密原值或插值结果。

普通错误保留已验证层并给诊断；安全字段错误阻断相关能力，不能回退成更宽权限。reload 构造完整候选快照后原子发布，保留启动 overrides；失败保留旧有效快照。保存采用字段 patch、锁内重读/CAS 和原子落盘，避免丢失并发改动。未来 schema 不破坏性写回，数组/map/凭据对象分别有合并规则，阻止原型污染与无界嵌套。

/model 选择与 effort/capability 校验作为一个会话更新；失败不产生半更新。--global 必须显式，成功保存不等于当前所有会话已改配置。所有 UI 显示 persisted、effective、pending-next-turn、restart-required 中的实际状态。

### 3.5 会话、布局、文件修改与恢复

current 是当前 session ID 的投影，每次打开按稳定身份聚焦；过滤、删除或权限限制导致不可选时说明原因，不能为了 current 越过 workspace/trust。列表每次 open/load/reload 使用 generation，清理上一个 picker 的多选和焦点状态；迟到结果不能覆盖新面板。

大小定义为实际会话核心文件 metadata/transcript/state 的逻辑 bytes 之和，包含保留分支，排除 lock、artifact 和外部附件。沿实际 layout 支持历史目录；异常显示 partial/unknown，不是 0；不宣称与普通 du 磁盘占用一致。统计由 session read/store owner 有界异步执行。

输入形态共享逐行布局及源文映射：装饰、左右 padding、内容区、软折行、逻辑位置、viewport、IME 尾和 caret 坐标各有明确字段。复制取 editor 原文范围，不 trim/dedent，不把软折行变成真实换行。窄窗使用实际剩余 cells，不以最小宽度常量制造越界。field/rail/box 共享 IME 尾部规则，box 的状态附着包含 top-border。

受管多文件编辑只有一条新增 apply_patch 入口，解析成 edit 领域批次计划，复用现有 writer。首版覆盖文本 add/update/delete 和受约束的 rename；不以新解析器再造 writer，不同时增设另一套 multi_edit 事务系统。二进制、越界路径和未知补丁格式明确拒绝。

整批预检失败时零目标写入；实际提交仍逐文件进行。批次按 canonical identity 去重并稳定排序加锁；批准绑定完整计划、版本、目标、前后状态。快照失败阻止新的受管批次写入。每次写入前在正确边界重新验证原文/不存在状态，写后取得证据，持久化逐文件 outcome。

已写 A、写 B 失败时允许条件补偿；如果 A 又被用户修改，不能覆盖。结果可能为 committed、restored、partial、blocked、failed 或 unknown；**不承诺跨文件崩溃原子性**。本地可改 JSON/hash 是可追踪记录，不自动具有不可抵赖性。

/undo 只选择当前会话、当前工作区中已确认提交且未撤销的最新 operation。历史无归属记录不自动认领；未知/部分批次进入专门恢复预览，不冒充完整可撤销操作。恢复前校验记录、blob、目标、符号链接、审批与最终 stale-read，恢复后核验并留结果。对话回退不撤销文件；bash/Git/网络/浏览器副作用不在普通文件 undo 的承诺内。

### 3.6 扩展系统的边界

完整 Git 工作台用原生 Git 完成读、stage/unstage、commit、分支和 worktree 操作，绑定读取时的 index/工作树状态。审查、暂存、提交、推送分别有操作与结果；模型建议不自动获得全部权限。/wt 的脏文件迁移与 session rebind 单独实现，不把子代理 worktree 分配器当成现成迁移工具。

安全分析调用成熟分析器并规范化 SARIF/诊断结果；缺分析器、超时、解析失败、覆盖不全与“没有发现”分开。finding 的修复需要真实 patch 与复测。/permissions 管执行审批、trust 管项目内容信任、/security 管代码分析，不互相冒充。

商店的发现、下载、安装、启用、更新、执行分离；固定版本与内容完整性、来源、权限声明、卸载残留和失败回退均可见。哈希只能证明内容相同，签名只有绑定可信身份才提供来源证明；禁止把下载即执行或搜索结果当授权。沿现有 marketplace 管源、plugin/skill 管包生命周期的边界扩展。

远程协作提供可自托管服务与客户端，不预设公共 SaaS 账户或默认外发。分享只读数据、实时观察、会话控制和远程写执行使用不同权限。身份认证、会话 ACL、短期 token、吊销、重连游标、重放去重、背压、脱敏与审计纳入首个可发布版本。secret/unlisted URL 不是访问控制。

SSH 是现有执行接口的一种显式远端适配能力，仍由 TypeScript owner 调度和映射结果；不是另立一套 agent runtime。host identity、凭据获取、工作区、断连、取消、未知远端结果和重试策略必须明确。新消息到达不等于用户批准远端写入，断线后不得自动重放未知副作用。

## 4. 分批任务与依赖

本计划共 **16 批、76 个交付任务**。每个 ID 是可独立验收的交付单元；具体文件拆分服从 owner 与 20 个 function-like names 上限，不把本表 ID 放进产品文件名。每项先锁定契约与反例，再实施、验证和复核。相同 owner 的相关任务可组成一个可审查变更，但不能用一个变更的绿灯代替其他任务证据。

表内现存目录均位于 packages/ts-shell/src；拟新增领域只表示规划位置。详细源码入口由对应研究文档提供。依赖表示必须满足的契约，不要求无关工作串行。

### W1 — 先修现存正确性与边界

| ID | 交付与 owner | 关键验收 |
|---|---|---|
| SAFE-01 | 工具参数在审批/执行前做真实 schema 校验；tools 与 core/agent 的通用边界，write/edit 入口薄适配 | content=7/缺字段不能到 writer；显式空字符串允许清空；不把 provider schema 或 TS 类型当运行时校验 |
| SAFE-02 | 所有文件工具入口的路径提取、deny、canonical containment 与实际打开对象一致；core/tools、core/security、runtime/execution | lsp hover/documentSymbol 都拒绝外部绝对路径、../、symlink 逃逸；授权 artifact 读取仍有单独明确边界 |
| SAFE-03 | ask 决定来源与状态契约；core/tools/ask 与交互 callback | 未回答、部分回答、取消、无 UI、异常不填成推荐答案或“User Decision”；显式答案逐项保留 |
| SAFE-04 | grep 保留路径原义；core/tools/grep 与既有 file walk | .hidden 和 hidden 命中不同 fixture；越界路径拒绝，不能剥点改指；仅 rg 不存在才 fallback |
| SAFE-05 | 网络请求父取消与本地 deadline 组合、响应字节限额与安全错误投影；webSearch/webFetch 及网络 owner | 预取消零请求；超大成功/错误体及时停止；429/超时/拒绝分开；正文秘密标记不出工具、日志和报告 |
| SAFE-06 | Public-web egress 校验 DNS/重定向与实际连接目标；security policy + 网络连接 owner | IPv4/IPv6、重绑定、混合地址、每跳跳转、URL credentials；审核后不再次解析未审核地址，TLS hostname 校验保留 |
| SAFE-07 | browser 动作取消及真实结果；browser/sessionManager 与工具适配 | 预取消零动作；中途取消不继续下一动作；已发生外部副作用不称回滚；关闭失败/未知如实保留 |
| SAFE-08 | 工具正文、流式预览、审批状态、审计分离；turn/tools、toolCards、turnSink | 模型消息无批准前缀；同一终稿不重复追加；无终稿时保留有效 stream；拒绝/取消/partial 不变成功 |

### W2 — 命令事实源与可靠输入

| ID | 交付与 owner | 依赖与关键验收 |
|---|---|---|
| CMD-01 | 完整命令目录与 invocation 元数据；core/commands、交互目录 | 58+back+动态扩展可枚举；真实同义 alias 同体验，特殊 rawName 不丢；注册/移除立即失效缓存 |
| CMD-02 | `[from,to)` 补全与 Enter/Tab 提交规则；slashSuggestions、keymap、editor | /res 不误执行 reset；/help 保留合法一次提交；中间光标、Tab/多空格、引号路径、CJK、后缀均不丢 |
| CMD-03 | 固定动作、flags、动态实体、自由文本的共享语法；command owner 与安全状态存储 | 按 23 全量表迁移；model/export/memory 动作真实；todo 1junk 拒绝；trust 仅接受自有枚举，constructor/__proto__/额外参数零写且保留untrusted；restore 不附送执行确认 |
| CMD-04 | 动态补全异步生命周期；有效 catalog/session/workspace projection | 不每键扫磁盘；可取消、有界候选；迟到结果、切项目、禁用技能/工具、离线均有明确状态 |

### W3 — 配置闭环与模型作用域

| ID | 交付与 owner | 依赖与关键验收 |
|---|---|---|
| CFG-01 | 字段 registry/schema/source/merge/apply policy；config | 对照全部当前字段与真实消费者；个人连接、CLI-only、安全收紧不被通用合并破坏；未知未来版本不损坏 |
| CFG-02 | JSON/JSONC parser、分级诊断与受控插值；config | 字符串内逗号/注释标记不变、未闭合注释拒绝、位置准确；无原型污染；秘密/插值值不回显；保留当前文件路径 |
| CFG-03 | 字段 patch 持久化与 revision reload；config、runtime 配置发布接口 | 两进程修改不同字段不丢失；失败保留旧有效值和 CLI overrides；立即/下一轮/重启的实际行为分别证明 |
| CFG-04 | /settings 高级参数、来源展示及 attentionOnIdle 全链路；picker/settings、通知 owner | 保存值→有效快照→实际消费闭环；错误不得显示已生效；通知发序列与操作系统是否展示分开报告 |
| CFG-05 | /model 会话覆盖、--global 及 model/effort 原子更新；session 与模型配置 owner | 两会话不互相污染；resume 恢复选择；持久化/模型不可用失败不半更新；凭据不进入会话日志 |

### W4 — TUI、主题与可观测性

| ID | 交付与 owner | 依赖与关键验收 |
|---|---|---|
| UI-01 | regular marker 剥除和 caret/scrollback 坐标账本；presentation/tui/render | 普通/完整/分片粘贴、暂停外部程序、overlay、满行、resize；源码修复与 Windows 前端逐帧证据分别记录 |
| UI-02 | 共同 composer layout/source selection；拟新增 presentation/tui/composer | 左右 2 cells、逐行映射、软折行、viewport、框行、反向拖选；复制严格等于用户源文选区，含缩进/尾空白 |
| UI-03 | 八形态 registry/renderer、真实预览与持久选择；同 composer owner | default、band、borderless、top-rule、padded-rules、field、rail、box 全部可选；field/rail/box IME；宽 80/40/20/8 及更窄有序退化 |
| UI-04 | 精确 palette、终端 default、6 个新增角色及 legacy 主题继承；presentation/theme 与 themes | 54 个最终 token；逐值/同义映射、用户三色、未知语言 code fallback 真消费；4 预设及旧 light/custom；truecolor/256/16/none |
| UI-05 | 状态事实来源与统一风险阈值；sessionFacts、models/window、chrome/items | fresh/resume/compact、用量未知、分母 fallback、估算费用区分；沿用 context 50/70/90；overlay 关闭后恢复 |
| UI-06 | 结构化 report 与现有 picker 扩展；command result、presentation、overlay | 纯文本/JSON等价、spans/columns、分页/搜索/滚轮/resize、取消恢复焦点；不得全局正则猜语义或预览即写配置 |
| UI-07 | 启动分段计时与真实请求上下文账目；observability/startup、bootstrap、context | 外部进程启动→实际首帧/可输入分开；固定环境比较 npm/tsx/JS/exe；工具目录取实际 pool，bytes/估算/tokenizer/usage 各有标签 |

### W5 — 会话恢复与文件操作

| ID | 交付与 owner | 依赖与关键验收 |
|---|---|---|
| SES-01 | Picker generation、全状态重置、current 按 ID 聚焦；overlay、session picker | 同实例重开、跨 picker、多选残留、旧 load/reload 迟到、current 被筛选/删除/截断；Enter 作用于正确身份 |
| SES-02 | 会话核心文件大小查询与列表索引；session read/store | stat 逻辑 bytes、legacy layout、并发追加、权限/缺失、取消、有界 I/O；不以只 stat 40 条掩盖此前全量扫描 |
| SES-03 | 分支导航失败真值与可见性；session/navigation 与 TUI history | active leaf 已变但摘要失败时报告 changed-with-warning；草稿/说明不重复；旧分支仍可访问；两模式超过一屏后的回退 |
| SES-04 | session rename/delete/new 直达与匹配；既有 lifecycle owner | 复用 /clear 新会话语义；exact/prefix/title/last 歧义拒绝；删除当前/忙碌会话不误删其他记录；旧数据可恢复；fresh 的连接状态重置另归 PAR-03 |
| SES-05 | workspace 多根及会话迁移契约；workspace/session continuation | 主根、附加读根、可写根分权；attach/remove/rebind 后工具/技能/MCP/cache 同步；忙碌、路径冲突、迁移失败不假成功 |
| EDIT-01 | 已提交 operation receipt 与安全恢复写入；edit/recovery、统一 writer | session/workspace/call ID、前后 hash、真实 commit/undo 状态；篡改 blob、外部改写、symlink、崩溃重启拒绝不安全重放 |
| EDIT-02 | 单一 apply_patch 多文件契约与持久批次；edit 域薄工具入口 | 依赖 SAFE-01/02、EDIT-01；预检零写、稳定锁序、重复目标、add/update/delete/rename；A成功B失败且A被外改时保留partial不覆盖 |
| EDIT-03 | /undo 预览确认与结果面板；restore owner + picker | 最近已提交 operation；多文件一组；取消零写；批准后 stale-read；已恢复/部分/未知可重启查看；不扫描认领全局历史 |

### W6 — 工具能力的实质补齐

| ID | 交付与 owner | 依赖与关键验收 |
|---|---|---|
| TOOL-01 | read 分页/大行内存界、glob 遍历界与取消；runtime/execution 文件 owner | 输出上限与读取内存分别测试；巨型文件/目录、权限失败、符号链接环、取消后句柄释放；不得再先全量读取再声称有界 |
| TOOL-02 | 图片视觉内容与 PDF/文档分页读取；tools 媒体适配与 artifact owner | 真正进入 provider 支持的内容结构；不支持时明确；尺寸/页数/解压/输出预算、格式伪装、取消、页/节出处；原文件不修改 |
| TOOL-03 | 真正的 LSP 客户端与语言服务生命周期；明确语言服务 owner | 初始化/能力协商、document version、诊断/引用/定义/rename、超时/取消/重启；按项目许可启动，编辑仍走批次审批；旧 scanner 明确兼容 |
| TOOL-04 | Browser 截图、标签页、上传/下载；browser/adapters | 每能力有权限/输入/结果契约；下载/上传路径受边界限制；截图遮蔽敏感值；不可观察动作或断连保持unknown，依赖 SAFE-07 |
| TOOL-05 | 原生桌面/屏幕/窗口的受控交互；独立 desktop owner，经现有工具与执行接口装配 | 明确平台与适配能力；屏幕/窗口范围、焦点与坐标快照版本绑定；敏感输入与动作逐项授权，焦点变化后重验；截图/剪贴板脱敏；取消后停止新动作，已发生副作用及未知结果保留；无系统权限/适配器显示 unavailable，不以 browser 完成代替 |

### W7 — 完整自主目标与顾问

| ID | 交付与 owner | 依赖与关键验收 |
|---|---|---|
| AUTO-01 | 会话 goal 实体、版本、旧项目目标导入和状态机；planning/goal（拟新增）与 session store | set/show/pause/resume/drop/complete 语义明确；旧目标不自动启动；不同会话/工作区无串用；完成有来源和证据 |
| AUTO-02 | 通用请求 admission、共享预算与幂等用量账本；core/agent 基元、turn/provider 实际 attempt 接线、usage owner，feature 注入 policy | 缺省无 cap；显式 cap 按 §3.2 跨主子顾问及所有内层重发，无法给上界则 unsupported；缓存/推理计量不漏不重；仅够一次余额时重试/降级/空流重发的第二次请求零发送；并发预留、unknown、取消、重启及降低cap不能绕过准入 |
| AUTO-03 | 自主轮间调度、owner、暂停取消、崩溃恢复；既有 session runtime 与 goal owner | 超过单轮 step 仍可继续无cap目标；暂停响应且不新派发；进程中断恢复不重复副作用；预算耗尽/失败/完成状态不同 |
| AUTO-04 | /goal、/guided-goal、/plan、/plan-review、/queue 及计划执行 UX；既有 plan/input queue 接口 | guided-goal 把澄清答案形成可审核目标，不把未答项变批准；不建第二 mode；plan 只读限制有效；计划预览与批准分开；队列列表/调整/取消与实际执行顺序一致 |
| AUTO-05 | 实时 advisor 路由、检查点及结果应用；通用 subagent runner + advisor 领域 | 用户启用后按配置运行；不同模型实际发送可验证；共享预算；超时/失败可见；意见不是授权，主流程/审核策略明确 |

### W8 — 软件与论文深度研究

| ID | 交付与 owner | 依赖与关键验收 |
|---|---|---|
| RSC-01 | 研究 run/brief/阶段/来源契约及命令迁移；拟新增 research owner | 依赖 AUTO-02/03 与 SAFE 网络修复；collector/new research 路由唯一；真正模型分解、检索、缺口再调查，非固定查询模板 |
| RSC-02 | 软件版本锚定、学术检索与全文/PDF获取；research/sources + TOOL-02 | API 按实际授权/速率/分页限制；429/取消/无key明确；DOI/arXiv版本/转载去重；摘要和全文状态分开 |
| RSC-03 | 实际来源记录、声明绑定与结构化报告；research evidence/report | 幻觉来源ID拒绝、页/节位置可核查；多源冲突保留；长报告分段一致；保存失败不冒充工件完成 |
| RSC-04 | 隔离反驳者与核验协议；research review + core/subagents capability | 父/定义/请求权限交集；只读准入；独立任务/同模型相关性可见；未发现反证、review失败、source支持分开 |
| RSC-05 | 研究进度、恢复与综合验收；研究 owner + 现有 TUI/session | 中途取消/重启/来源变更后可对账续研；预算不足保留已知发现和未覆盖项；软件与论文各跑含冲突/受限全文的端到端场景 |

### W9 — 完整 Git 工作台与工作区迁移

| ID | 交付与 owner | 依赖与关键验收 |
|---|---|---|
| GIT-01 | /git 文件/分支/index/diff 工作台；Git workflow owner + 现有 panel | staged/unstaged/untracked、无HEAD、rename/binary/冲突/超大diff真实；读失败不显示干净；按hunk定位有原始版本 |
| GIT-02 | 分块 stage/unstage、commit、分支操作；原生 Git 经执行边界 | 审批绑定命令/目标与index快照；选择后外改拒绝；部分失败可见；commit读回hash；不自动stage其他文件/amend/push |
| GIT-03 | /wt 创建/切换/迁移/删除；已有 worktree + session rebind | dirty/staged/untracked保真；目标冲突/子模块/取消/失败补偿；保留源改动；清理失败不删用户工作区 |
| GIT-04 | review/commit/worktree/goal 联动与显式远端 Git 操作 | 审查仅建议，合并/推送有独立操作；未知网络结果先查询不盲重试；所有快捷入口复用同一 owner 与权限 |

### W10 — 安全分析与可验证修复

| ID | 交付与 owner | 依赖与关键验收 |
|---|---|---|
| SEC-01 | /security 分析器适配与有界执行；独立安全分析领域 | 调成熟工具、不重写扫描引擎；记录工具/规则/版本/范围；SARIF解析/格式错误/超时/缺工具/部分覆盖与零发现区分 |
| SEC-02 | finding 查询、排序、研判与 baseline；security store/report | 稳定fingerprint/位置/状态；误报或接受风险有理由与记录；配置不允许项目隐藏全部结果冒充干净；导出脱敏 |
| SEC-03 | finding→patch→审批→复测闭环；security + EDIT owner | 修复只改授权目标；复测同规则同范围；未复测不标fixed；顾问意见/扫描0项都不等于全仓无漏洞 |

### W11 — 技能商店、插件、代理与 MCP

| ID | 交付与 owner | 依赖与关键验收 |
|---|---|---|
| ECO-01 | 商店源/搜索/详情/版本/安装清单；marketplace 领域 | 真实检索/分页/离线错误；源可信度与包权限可见；没有下载/启用时不显示installed |
| ECO-02 | skill/plugin 安装、升级、卸载、回退；现有生命周期 owner | 固定版本/完整性、归档路径穿越/符号链接/炸弹限制；中断安装不留假成功；更新权限扩大重新决定；卸载不删用户数据 |
| ECO-03 | 扩展启用/执行隔离、权限和审计；policy + plugin/skill runtime | 安装不等于允许运行；脚本/tool/prompt权限分别检查；来源签名信任链可验证；动态命令/工具注销无残留能力 |
| ECO-04 | /agents 发现/编辑/启用及每代理模型路由；subagent owner + 配置面 | 现有用户/项目prompt覆盖保留；model字段真正影响请求；父权限不可扩大；实际tool pool、budget、轨迹、取消一致 |
| ECO-05 | MCP 服务配置增删改查、enable/disable/test/reconnect/reload；resources/prompts/notifications、认证及诊断；现有 core/mcp owner | 配置保存→有效连接→能力目录全链路；capability negotiation、分页、长连接/重连、认证回调与凭据存储边界；禁用/删除注销资源且不重放副作用；通知有界，schema/来源/权限一致，扩展不旁路审批 |

### W12 — 远程协作、共享与 SSH

| ID | 交付与 owner | 依赖与关键验收 |
|---|---|---|
| REM-01 | 可自托管协作服务、客户端及版本协议；TypeScript 协作领域 | 身份认证/session ACL/短期token/吊销；默认无公网外发；跨用户/session/project访问拒绝；TLS与部署配置可检查 |
| REM-02 | /share、/dump 等安全导出与只读共享；session/export + collaboration | 默认脱敏、目的地/权限/过期明确；private链接不是ACL；UTF-8/大附件/删除与撤销访问；未经共享不发网络 |
| REM-03 | collab/join/leave 及协作 relay 的实时事件与控制 | 单调事件序列、重连游标、去重/背压、慢客户端、断线恢复；观察权不含控制权，控制权不含自动写批准；语音/live与终端/record分别归MEDIA，不能以relay替代 |
| REM-04 | SSH 会话/远端工作区/作业与取消；既有 execution interface 的显式适配 | host key核验、无凭据日志；断连前后状态/进程/输出有界；未知远端写不自动重放；本地和远端路径/权限不混用 |
| REM-05 | 协作控制、远端作业、目标/顾问的身份与用量归属 | 依赖 AUTO/REM-01/03/04；单一执行owner、撤权及时生效、双客户端冲突、重启重连账目一致；禁止接收消息即提升权限 |

### W13 — 后台任务与可评估工作流

| ID | 交付与 owner | 依赖与关键验收 |
|---|---|---|
| FLOW-01 | tan 类持久后台任务、jobs操作与hub看板；统一运行调度与任务领域 | 复用AUTO请求/预算、REM身份及已有后台进程能力；queued/running/paused/completed/failed/unknown真实；查看/取消/恢复/重连、父子归属、清理失败与输出分页均可验证；看板状态来自事件和存储而非前端自造 |
| FLOW-02 | 一次性模型交接与持久worker编排预设；编排领域，分别对应prewalk/vibe类能力 | 明确规划→执行的触发、接管与失败回退；模型/effort/工具覆盖退出后恢复；director可见工具收窄，worker按会话授权与显式委派执行，含写操作仍需审批，不能把director菜单当授权来源；交接保留来源/约束/输入顺序；退出/取消释放资源，不改全局模型配置 |
| FLOW-03 | 固定evaluator的迭代改进工作流；eval/workflow与goal/patch接口 | 固定基线、指标、样本和保留集；评测失败/不可比较不能称进步；修改经授权隔离、达标后复核合并；失败保留/恢复真实，不能通过改评测器或仅优化训练样本作弊 |

### W14 — 实时语音与终端录制

| ID | 交付与 owner | 依赖与关键验收 |
|---|---|---|
| MEDIA-01 | /live类实时语音输入输出、设备与provider适配；独立媒体owner，复用会话/权限/预算 | 录音前有明确启用状态；设备缺失/占用、回声、打断、取消、断流重连、音频缓冲上限可验证；转写不等于已授权命令，音频与文字保持正确turn身份；不支持协议明确提示；未启用不采集或发送 |
| MEDIA-02 | /record类本地终端录制、停止、回放及导出；终端记录owner | 捕获的是实际会话输出/时序/尺寸变更，不假装等于协作事件；默认排除秘密输入，显式目的地与保留策略；截断/磁盘满/取消可见；回放ANSI受控、不执行终端控制注入或原命令；不默认上传 |

### W15 — 其余命令的完整能力对齐

| ID | 交付与 owner | 依赖与关键验收 |
|---|---|---|
| PAR-01 | session/history 的 pin/branch/open/history export 等操作、上下文诊断/选择 | 以 22/24 的逐项处置表为清单；open按已有记录/明确目标打开而非猜路径；复用 session/query/compaction，旧分支不丢；上下文清理与原始记录删除分别表示 |
| PAR-02 | todo/记忆的编辑、导入导出、审批及来源展示 | 不把todo勾选当目标完成；import有schema与大小限制；memory delete/invalidate/wake/use/save各自正确；审批与写入不可合并成同义词 |
| PAR-03 | 模型预设、switch、effort、fast/slow、skillful、extended-context、usage/cost；connect/login/logout及fresh状态控制 | 模型能力与服务等级真实；上下文扩展须有provider支持；临时覆盖退出/失败后恢复；旧fast温度语义显式迁移；费率/usage未知不造数。认证直达复用现有auth owner，明确账户/provider/作用域与外部失败；fresh只重置可控制的连接/游标/缓存，不改转录，无状态provider明确无需重置；不把本地清429或断连接称为账户权益/远端缓存重置 |
| PAR-04 | debug/trace/log/report/timings、reload/restart、changelog 与包状态 | 复用已有observability；report-safe；重启恢复/退出原因真实；动态扩展reload需清理生命周期；不以新增菜单冒充指标采集 |
| PAR-05 | 初始化、恢复/修复、规则改进提案及额外上下文入口 | 逐项对照22处置；/force只约束选择不授执行权；/init与omfg类规则建议生成变更预览，明确批准后才写；自动修复走现有goal/patch/verification；差异公开，不复制宣传式名字 |

### W16 — 集成与发布证据

| ID | 交付 | 关键验收 |
|---|---|---|
| QA-01 | 跨域隔离验收矩阵与独立审查 | 工具→命令→TUI→session→恢复/预算/协作的实际闭环；反转关键决定时测试必须失败；失败的审查工具不算批准 |
| QA-02 | 明确平台/协议范围、迁移/回退和最终发布证据 | 精确源码commit、构建、Node floor、静态门、相关套件、PTY及适用真实外部验收逐项记录；本地/提交/推送/CI/发布分开；W7-33不被历史绿灯覆盖 |

## 5. 执行顺序与并行边界

第一批先完成 SAFE-01/02/03/04/05/08，阻止数据与决定真实性问题进入新增系统。CMD-01/02、CFG-01、UI-01/02、SES-01 可在边界明确后分别推进。

AUTO-02 的共享请求计量先于任何新顾问、研究或远端代理；EDIT-01 先于 apply_patch、undo、安全自动修复和 Git/worktree 迁移的相关恢复承诺。UI-06 复用现有 overlay 并依赖 SES-01 的生命周期修复，不平行建设另一个面板宿主。

预算钩子必须位于实际发送之前：当前 [turn/step](../../packages/ts-shell/src/turn/step.ts#L160) 内含 provider 重试、reasoning 降级重发和空流重试，逻辑 step 不能替代 attempt。现有 [onRequestSent](../../packages/ts-shell/src/turn/step.ts#L390) 在 HTTP 成功响应后触发，不能直接当作 admission。各 attempt 独立 ID/预留、关联同一逻辑请求；失败也按发送事实结算。

AUTO-02 必须登记所有模型发送点，包含 goal 下自动/手动压缩、分支摘要、其他辅助摘要、顾问和分段报告。当前 [requestCompactionSummary](../../packages/ts-shell/src/core/query/compaction/summarize.ts#L122) 可直接通过注入的 fetch 发送，需接相同 attempt 准入、完整输出上界与 usage/unknown 结算；不能仅覆盖主循环。验收余额不足时压缩及辅助请求零发送，可准入时逐项计入同一账本。

AUTO-01/03/04 完成后形成完整自主目标闭环，再接 AUTO-05、RSC 全链路。GIT、SEC、ECO、REM 可以各自按 owner 分支开发，但在公共权限、配置、预算、事件协议不稳定时只能提交适配契约与隔离验收，不先行复制基础设施。

跨域更改由接口 owner 合并：工具结果和 request budget 不由 TUI 定义，文件恢复不由 command runtime 实现，来源与研究状态不塞进 core/research 的历史收集器，安全扫描不塞进 permissions，商店下载不隐式扩大插件执行权。新 feature 的命令/工具 handler 由 feature owner 提供，经 CLI composition 注入 core 的中性接口；即使是薄适配，也不能新增 core→research/goal/security 等反向依赖。

## 6. 输入文档到交付项的覆盖

| 输入 | 必须保留的问题/要求 | 对应任务 |
|---|---|---|
| 14 | write/lsp/ask/grep/network/browser正确性；工具成熟度、输入、启动、上下文、resume/undo/回退 | SAFE 全部、TOOL 全部、CMD-01/02、UI-01/07、SES/EDIT |
| 15 | 真研究、双领域、论文全文、对抗核验、命名兼容、预算/恢复 | AUTO-02/03、RSC 全部、TOOL-02 |
| 16 | 精确配色、8形态、default、中性命名、左右留白、源文复制 | UI-02/03/04 |
| 17 | 状态事实、命令面板、结构化语义颜色、窄窗/纯文本 | UI-05/06、CMD-01、SES-01 |
| 18 | marker/caret、Enter/Tab/alias、启动/首帧、上下文、参数 | UI-01/07、CMD 全部 |
| 19 | 所有默认工具生产边界、能力对齐、单调用多文件、审批正文分离 | SAFE/TOOL/EDIT 全部 |
| 20 | 完整配置schema、来源、合并、持久化、reload、设置UI和attention | CFG 全部 |
| 21 | current、大小、会话作用域undo、导航视觉与失败真值 | SES-01/02/03、EDIT-01/03 |
| 22 | 全量清单、真实名称/语义关系、缺失命令逐项处置、大型系统 | CMD-01/03、AUTO/GIT/SEC/ECO/REM/FLOW/MEDIA/PAR |
| 23 | 44参数命令全量语法、动态值、描述、范围、兼容与严格拒绝 | CMD 全部、CFG-05、AUTO-04 |
| 24 | 精选比较命令的实际功能补齐；compact/model/undo/权限/生态差异 | SES/EDIT、CFG-05、AUTO/GIT/SEC/ECO/REM/FLOW/MEDIA/PAR |

其中 /compact 默认跨交互/非交互统一真实压缩路径，归 PAR-01；preview/render/json 等原有只读产物形式继续明确保留，禁止因统一默认而触发压缩。估算前后 tokens 标明 estimate；失败、跳过、仅工件生成不能报压缩成功。

22 的 53 项无词法交集是入口映射检查表，不是 53 个缺失能力。每项须在该文标为复用已有能力、新能力或语义不同，并映射上述任务；不可只用汇总数字宣布对齐。没有对应实现和验收的入口仍然算未完成。

## 7. 验收与证据规则

### 7.1 每项完成必须提供

- 契约：正常输入、非法输入、权限/取消、失败/未知与持久化语义，以及当前源码与参考的具体决策比较。
- 变更：owner、迁移、兼容路径及已删除的重复/废弃机制；新能力必须有真实消费者。
- 验证：与变更直接对应的单元/集成/进程或PTY证据；关键参考决定至少一个反转失败的回归场景。不为纯展示文案写镜像实现测试。
- 结果：未运行、不可用、外部前置失败、partial、known limitation 单列；不能以窄套件通过宣称整体生产就绪。

### 7.2 必须覆盖的跨域反例

1. 用户未答 ask；取消/预算耗尽后模型仍建议“继续写”——不得获得批准或完成状态。
2. 两批按相反路径顺序修改同两文件；A已提交后B失败且第三方改A——不死锁，不覆盖外改，重启显示真实partial。
3. 当前会话切换时旧 picker、旧补全、旧MCP/模型目录响应到达——不改变新会话选择/配置/工具能力。
4. 无cap目标跨过一轮限制仍持续；有cap时父子顾问同时请求，触发内层重试/自动压缩/辅助摘要或缺usage——统一准入、不重复或漏记；off→N 不丢未知历史；pause 有界响应且保留在途未知与预留。
5. 两篇转载与一篇相反一手证据；编造来源ID；仅摘要可读；红队超时——研究不能出现“已证实/核验通过”的替代结果。
6. Share、store包、远端消息、SARIF文本包含命令注入/凭据/超大内容——按数据处理，不能提升为系统指令、授权或未受限输出。
7. Git index在面板打开后改变，远端写后断线，恢复blob篡改——执行前重验或明确unknown，不自动覆盖、重试或清理用户改动。
8. 八形态在两TUI模式、窄窗、中文/emoji/组合字符/满行/软折行、IME、鼠标选择和主题切换时，光标与复制源范围一致。

### 7.3 门禁与平台

纯文档轮只做文档漂移、链接、数字/映射和 diff 检查，不运行构建/测试。实施轮按 [验证规则](../../agent-rules/testing-and-validation.md) 选择 focused checks；涉及公共边界或最终集成时再扩大。

推送前运行 import-cycles、config-consumers、declarations、node-floor、docs-drift strict；改相关脚本时运行 scripts 套件。NormProof 的 unresolved-specifier 是阻断项；function ceiling 即便仅 advisory 也必须在新增/实质改动模块中遵守。TS 本地 import 保持 .js。

TUI 必须覆盖 regular/fullscreen 的真实 PTY；用户 WSL/Windows 前端的像素/字体/IME问题另取同前端证据，不以字节搜索代替。进程、SSH、浏览器、协作测试使用合成项目和隔离 HOME。真实 provider/公共服务测试只经明确安全入口与脱敏配置，不读取真实私密配置文件。

新 parser/LSP/media/analyzer 的选择需给版本、许可证、维护与执行成本证据；优先调用成熟原生工具或成熟库，不因“零依赖”自造不完整实现，也不因性能猜测添加第二语言产品运行时。

### 7.4 本轮实际证据

本轮已直接修订 15–24 与 verification，更新 14 的下游表、features 索引和开发日志，形成本文 **16 批、76 项**计划。全部实现任务仍为未开始；文档批准不改变其状态。

修订后计划复核与研究复核均返回批准，先前不可用的专用审查路由和未返回的命令专项复核均未计为通过。主要补正包含实际 request attempt/辅助摘要准入、未知用量与暂停、fresh/桌面职责、trust 原型继承值与命令事实；详见复核记录 §6。

实际运行 docs-drift strict 与 git diff --check，均 exit 0；strict 保留 120 条既有非阻断源码路径 advisory。另对 13 份文档核对 788 个本地链接、292 个行号锚点、3 个标题锚点及表格/围栏/空白；53 项命令映射全部指向有效任务。没有运行 build/产品测试、真实 provider、commit、push 或新 CI。

## 8. 实施证据

### 8.1 SAFE-01 — 工具参数实际校验（2026-10-05）

SAFE-01 已实现并完成本地验证；其余 75 项仍未完成。§7.4 为规划轮历史证据，不代表本节之后的施工状态。计划基线已提交为 `25d891d2`；本批功能提交及远端检查另行核对，不将本地通过当作 CI 或 Phase 19 整体验收。

- Owner：[参数校验](../../packages/ts-shell/src/core/tools/arguments.ts) 使用 Ajv 8.20.0 与 ajv-formats 3.0.1（MIT，已有依赖树中的库，现声明为直接依赖）；校验 draft-07/2019-09/2020-12 的类型、必填、成员、范围、格式与组合。未知/无效 schema、未解析引用、异步 schema 拒绝执行；不远程加载引用、不强转、不填默认值、不删除参数。按 schema 内容缓存，动态 schema 改变后重新编译。
- 顺序：[turn 适配](../../packages/ts-shell/src/turn/tools.ts) 在 kernel 的 prepareArguments 阶段校验，先于审批及 PreToolUse；实际调用前再次校验。write/edit 直接入口共用同一校验器，在文件锁/读取/writer 之前拒绝。显式 `content: ""` 仍有效；edit 三种形式的互斥及非空 edits 数组纳入声明 schema，删除重复的手写形状与互斥检查。
- 定向对照：按 [19 号研究 §3.1](19-tools-maturity-and-multifile-edit.md#31-write运行时-schema-与精确前置状态) 所指工具验证链，实读参考验证函数与循环的准备阶段。同意“声明 schema 实际校验且先于 before-tool hook”；不采用其参数强转与错误回显原始参数的行为，理由是本阶段明确禁止非字符串文件内容被替换成其他内容，且诊断不得泄露输入。错误只报告约束类别，不回显输入值。
- 验证：Node 20.3.0、仓内隔离 HOME/USERPROFILE/TMPDIR/CHEERS_TEST_ROOT 下 `npm run test:ts -- src/core/tools src/core/agent src/turn`，40 文件/574 项通过；同版本 `npm run build:ts` 通过。初轮非隔离环境有一条既有 sampling 测试失败（temperature 字段缺失），隔离环境原样通过，未修改 provider 实现或该测试。五条原有 edit 报错文案断言按 schema 错误更新，拒绝和文件不变断言保留。
- 反转：[新增回归](../../packages/ts-shell/src/core/tools/arguments.test.ts) 在移除 prepare 校验时 1 失败/15 通过；移除 write/edit 直接校验时 11 失败/5 通过。测试服务已替换为无副作用实现；每次反转后校验精确字节恢复，最终重建并重跑上述 574 项通过。
- 编译产物：仓内隔离探针经实际 kernel→审批→内置 writer 调用，5 类非法 write 内容均零审批、零 pre-use hook、BOM/CRLF 文件字节不变；合法空字符串经一次批准写成空文件。探针使用编译模块，不称 CLI/PTY 或真实模型验收；无真实 provider 请求。
- 门禁：import-cycles、config-consumers、declarations、node-floor、docs-drift strict 均 exit 0；docs 保留 120 项既有 advisory。模块上限检查没有新增越界；NormProof unresolved-specifier 与 cycle 义务 satisfied，整体 partial 来自 6 个既有函数数量 advisory。未取得本批独立审查、PTY、真实外部服务或发布证据；W7-33 保留原状态。

### 8.2 SAFE-02 — LSP 路径与文件拒绝规则（2026-10-05，进行中）

本批仅完成 SAFE-02 的 LSP 入口与共享路径策略修复，**不将 SAFE-02 标为完成**。尚需核实并修复 grep、目录枚举、artifact 读取及实际打开对象在路径变化下的边界；当前路径预检不等于消除打开时竞态。SAFE-01 功能提交 `673e6cde` 已推送，其 Architecture Watch `37327553038` 已成功，CI `37327553032` 本轮查询仍在执行测试，未计为通过。

- [LSP](../../packages/ts-shell/src/core/tools/lsp.ts) 的全部五种操作对显式 filePath 先做 workspace containment；hover 删除直接同步读盘，所有读取经同一个 readSource 与执行服务；工作区扫描对每个返回路径再次检查，外部绝对路径、父目录逃逸和稳定的外部符号链接均在服务读取前拒绝。文件名空白保留，不再 trim 后改指另一个文件。
- [路径策略](../../packages/ts-shell/src/core/tools/permissionContext.ts) 派生请求原文、read selector 去除后的文件路径、规范化绝对/相对路径和 canonical 路径供 deny 匹配。保留原始规则匹配，增加 LSP filePath 与内部符号链接最终目标匹配；artifact URI 不伪装成工作区路径。turn 向工具提供逐文件拒绝检查，LSP 扫描消费它，不能用一次 workspaceSymbol 调用绕过指定文件的拒绝规则。
- 定向比较基于 [19 号研究 §3.2](19-tools-maturity-and-multifile-edit.md)：实读参考只读目标的 realpath 校验与读取接线。同意先校验 canonical containment、以通过检查的 canonical 路径打开、执行阶段重新核验，保留用户请求名称用于展示；本批实现前两项和 LSP 每次读取前的重新核验，打开后的身份校验仍未完成。路径边界采用完整 `..` 路径段比较，修正 `..notes` 被误当父目录的缺陷；不按字符串前缀猜父目录。
- 新回归覆盖全部五操作的三类逃逸、hover 真实服务接线、空白文件名、显式/扫描路径的 canonical deny、read selector 和 artifact 规则独立性、合法双点开头文件。Node 20.3、仓内隔离 HOME/USERPROFILE/TMPDIR/CHEERS_TEST_ROOT 下 32 文件/419 项通过，`build:ts` 通过。移除 workspace target 围栏时 7 失败/11 通过；移除 LSP 逐文件拒绝检查时 1 失败/17 通过；精确字节恢复后重建并复跑 419 项通过。
- import-cycles、config-consumers、declarations、node-floor 通过；NormProof 两项图义务 satisfied，整体仍为 6 项既有函数上限 advisory 导致 partial。未取得新增独立审查、PTY、真实提供方或跨平台文件句柄证据，后续批次不得以本节替代这些验收。

### 8.3 SAFE-02 — 文本读取句柄与 artifact 范围（2026-10-05，进行中）

SAFE-02 继续推进，尚未完成。`f1b01f84` 的 CI `37329604006` 和 Architecture Watch `37329603966` 本轮均已核实成功；`673e6cde` 自己的旧 CI 查询仍为 in_progress，不能伪填其结果。本批未用旧提交的通过替代新改动证据。

- [执行服务](../../packages/ts-shell/src/runtime/execution/service.ts) 的文本读取委派给同域 [read](../../packages/ts-shell/src/runtime/execution/read.ts)：核验 workspace/canonical 目标、常规文件和精确 bigint 文件身份，以 no-follow/nonblocking 标志打开，再核对已打开对象及拒绝策略，最后从同一个句柄读出内容并始终关闭。Linux 通过描述符实际路径核验父目录替换；没有重新按路径打开来取字节。预取消零打开，打开后取消/身份变化/拒绝均停止内容读取。BOM/CRLF 原样保留。
- read/LSP 及 write/edit 的预读均传递取消和逐文件拒绝检查。write/edit 仅对文件不存在保留创建路径；其他预读拒绝、取消和错误不再被吞掉后继续写入。已打开文件消失与最初文件不存在分开，前者不得成为创建分支的依据。
- [artifact 存储](../../packages/ts-shell/src/core/session/artifactManager.ts) 删除全局单实例，按 canonical workspace 与 session ID 复用；read、bash、glob、grep、目录输出与后台任务的既有产物目录接线传入会话身份。仅解析数字 ID，暂存文件、歧义 ID、越界符号链接或被替换的目录不解析为产物。读取请求显式携带 artifact 目录，但它只能收窄 workspace 范围，不能授予外部文件访问。
- 存储构造不再创建目录，保存前检查目录边界；恢复实例扫描已有编号，发布使用排他链接而不覆盖同名历史文件。删除失败后直写与伪成功回退，实际发布失败即失败；暂存文件清理为 best effort，不能声称磁盘故障时一定无残留。工具标签仅用于有界安全文件名，会话 ID 必须是单段有效身份。
- 兼容：没有 session ID 的调用仍使用原 default 目录；现有产物文件保留。具备明确 session ID 的调用不自动回退到无归属的旧 default 产物，以免相同数字 ID 读错来源；旧数据仍可经明确的工作区文件路径访问。产物 ID 不是内容签名或跨进程写入所有权证明，本批不增加这类保证。
- 定向对照：沿 [19 号研究](19-tools-maturity-and-multifile-edit.md) 读取参考的 canonical 读取与 artifact 协议/存储实现。同意“按已检查的真实目标读取”“优先绑定调用会话”“数字 ID 与发布失败真实呈现”；不采用跨其他活动会话目录继续查找的回退，以保持本任务的会话范围。参考的暂存发布与保留旧文件决策在本实现中使用现有 TypeScript 文件系统能力完成，没有新增执行平面。
- 验证：Linux、Node 20.3、仓内隔离 HOME/USERPROFILE/TMPDIR/CHEERS_TEST_ROOT 下，execution、core/tools、artifact 与 turn/tools 共 38 文件/371 项通过，`build:ts` 通过。服务退回按路径直接读取时 7 失败/2 通过；artifact 缓存去掉 session 身份时 2 失败/6 通过；恢复吞掉 write/edit 预读错误时 2 失败/4 通过。每次恢复精确字节，最终重新构建并复跑 371 项通过。
- 编译模块隔离探针经实际 kernel→工具适配→执行服务验证同 ID 的两会话各读自身产物、缺失会话拒绝，以及打开后文件移出工作区时零内容读取并关闭句柄；模型请求为零。此为编译模块证据，不称 CLI/PTY 或真实 provider 验收。
- import-cycles、config-consumers、declarations、node-floor 通过；NormProof 图义务 satisfied、函数数量仍为 6 项既有 advisory，整体 partial。尚未取得本批独立审查或非 Linux 文件句柄证据：其他平台当前只有文件身份/路径复查，不承诺同等的描述符路径保证。SAFE-02 的 grep 原生/回退、目录枚举、写入最终对象的拒绝检查及剩余竞态仍待核实和收口，不能由本批文本读取证据代替。


### 8.4 SAFE-04 — grep 路径原义与缺失二进制回退（2026-10-05）

SAFE-04 已实现并完成 Linux 本地验证；SAFE-02 仍未完成。上一批 `45558cb5` 的 CI `37333505937` 已核实 completed/success，Architecture Watch `37333505919` 已成功，本批提交的远端结果另行核对。

- [grep](../../packages/ts-shell/src/core/tools/grep.ts) 保留路径原文，包括点开头和首尾空白；统一 canonical containment、拒绝规则与文件类型检查，支持工作区内部绝对路径、内部符号链接和单文件目标。回退匹配完整路径或目录边界，搜索 src 不再包含 src-other；读取经现有执行服务的已核验句柄，传入逐文件拒绝与取消信号。
- [原生搜索](../../packages/ts-shell/src/core/tools/grepRipgrep.ts) 在探测二进制前检查目标，并在异步探测后复查。仅可执行文件确实不存在时回退；启动权限错误、非零退出、缺失脚本解释器均返回失败。执行 owner 保留 spawnErrorCode，与进程退出码分开，不按错误文案猜测。使用 which 4.0.0（ISC，Node ^16.13.0 || >=18.0.0）解析 PATH/PATHEXT，开发类型 @types/which 3.0.4，避免重写平台可执行文件查找。
- 定向比较沿 [19 号研究 §3.4](19-tools-maturity-and-multifile-edit.md#34-grep保持路径原义) 检查参考的搜索入口、路径包装与 normalize/resolve 实现：认同先解析和检查目标、保留点前缀、不默认 trim；不引入其 Unicode 空白或 @ 前缀改写。参考缺失二进制时下载或报错，本项目保留既有本地 walk 回退。研究中的“trim 后输入”裁决修正为原样输入，避免改指另一个合法文件。
- 验证：Node 20.3、仓内隔离 HOME/USERPROFILE/TMPDIR/CHEERS_TEST_ROOT 下，execution、core/tools、artifact 与 turn/tools 共 39 文件/381 项通过，build:ts 通过。新增 10 项路径与启动错误回归；恢复前导字符剥离时 4 失败/6 通过，恢复宽泛目录前缀匹配时 1 失败/9 通过，恢复所有探测失败都回退时 3 失败/7 通过；精确字节恢复后重建并复跑 381 项通过。
- 编译模块隔离探针核实原生路径零 walk、缺失二进制恰一次 walk，二者均搜索 .hidden 而不混入 hidden，并拒绝损坏的原生程序；模型请求为零。此证据不等于 CLI/PTY、Windows 或真实 provider 验收。
- import-cycles、config-consumers、declarations、node-floor 通过；NormProof 两项图义务 satisfied，整体 partial 仍来自 6 项既有函数上限 advisory。原生搜索尚未提供逐文件 deny 与完整竞态防护；目录枚举、最终写入对象及非 Linux 句柄保证继续归 SAFE-02，未取得独立审查或跨平台运行证据。


### 8.5 SAFE-02 — 最终写入拒绝与取消检查（2026-10-06，进行中）

本批补齐 write/edit 到写入执行服务及文件 authority 的拒绝与取消接线，不将 SAFE-02 标为完成。上一批 grep 提交 `b57b0052` 已推送，Architecture Watch `37336646995` 已成功，CI `37336646967` 最近查询仍 in_progress，未计为通过。

- [写入服务](../../packages/ts-shell/src/runtime/execution/service.ts) 在创建父目录前检查 canonical containment、逐文件拒绝及预取消；目录创建和快照持久化返回后再次检查。已有文件在 [文件 authority](../../packages/ts-shell/src/edit/authority/workspace.ts) 打开并核验描述符后，以实际对象路径检查策略，再截断与写入，拒绝时始终关闭句柄。创建路径在排他打开前及打开后分别检查，不再只依赖工具预读时的检查。
- [工具接线](../../packages/ts-shell/src/core/tools/registry.ts) 将 assertFileAccess 与 abortSignal 传到最终写入请求；保留现有锁、精确 expectedContent 比较及快照机制。authority 使用核验后的 canonical workspace，支持符号链接工作区根；完整父目录段判断允许 ..notes 等普通文件名，不将其当作目录逃逸。
- 定向比较：按 [19 号研究](19-tools-maturity-and-multifile-edit.md) 实读参考写工具的 mutation queue、目录创建和写入流程；采用“异步操作完成后检查取消，未结束前不释放锁”的决定。参考的可注入 mkdir/writeFile 没有本项目的最终对象拒绝契约，本批保留现有描述符 authority 并接入策略，不复制直接按路径写入实现。
- 验证：Linux、Node 20.3、仓内隔离 HOME/USERPROFILE/TMPDIR/CHEERS_TEST_ROOT，execution、core/tools、edit、turn/tools、sandbox 和工具策略共 53 文件/455 项通过，build:ts 通过。新增 10 项覆盖创建前拒绝/取消、外部父目录链接零新建目录、快照后取消/拒绝、打开后目标改名到拒绝路径、write/edit 接线、双点文件名与链接工作区。初轮 mock 未保留快照模块辅助导出，修正测试 setup；并行环境中 fd 可被其他线程复用，关闭断言改为核对实际 close 调用，保留内容不变与拒绝断言。
- 反转：移除快照后及最终写入策略接线时 2 失败/8 通过；移除描述符路径拒绝时 1 失败/9 通过。反转后源码精确字节恢复，最终组合套件通过。编译模块隔离探针验证拒绝写入保留原文、预取消零目录创建、edit 预读后拒绝最终写入、合法嵌套文件写入；模型请求为零，不称 CLI/PTY 验收。
- import-cycles、config-consumers、declarations、node-floor 通过；NormProof 图义务 satisfied，整体 partial 仍为 6 项既有函数上限 advisory。旧 workspace-safety 脚本引用的 sandbox/runtime 测试路径与场景已不存在，未把该旧门禁当作通过；本批运行当前 sandbox 套件及真实编译工具拒绝探针，旧综合 CLI 门禁迁移仍待处理。
- 限制：目录创建仍为按路径操作，不能承诺父目录替换竞态下零副作用；排他创建后才发生拒绝时可能留下空文件，不盲目 unlink 以免删除第三方替换目标。快照读取的最终对象策略、原生 grep 的逐文件拒绝、目录遍历及非 Linux 描述符支持仍需收口。新增检查缩小了风险窗口，不构成跨进程原子授权或 SAFE-02 完成证据。未取得独立审查、PTY 或非 Linux 运行证据。


### 8.6 SAFE-02 — 写前快照实际读取对象（2026-10-06，进行中）

- [文件 authority](../../packages/ts-shell/src/edit/authority/workspace.ts) 的 readVerifiedFile 接收可选实际路径检查；打开并核验句柄后，在读取正文前调用，检查失败直接传播并关闭句柄。只把原有正文 IO 错误保留为 undefined，拒绝/取消不被 catch 转成“没有旧内容”。[写入服务](../../packages/ts-shell/src/runtime/execution/service.ts) 的首次快照读取和持久化后的 expectedContent 复查均传入同一检查。
- 沿 [19 号研究](19-tools-maturity-and-multifile-edit.md) 再次定向检查参考只读目标解析：授权评估与执行之间可能发生符号链接替换，执行必须重新解析并验证。同意实际使用前复验；本项目在已有句柄 authority 内完成，不增加另一个快照读取系统。保留未传检查参数的其他 authority 调用兼容性，不将它们也宣称为已接入逐文件策略。
- Linux、Node 20.3、仓内隔离环境下 execution/core-tools/edit/turn-tools 共 51 文件/426 项通过，build:ts 通过。新增两项在首次快照读取和条件复查打开后，将文件改名到拒绝路径，验证拒绝、零正文读取、关闭句柄与正确的快照调用次数。移除两处策略接线时 2 失败/10 通过，精确恢复后组合套件通过。
- 编译模块探针经真实写入服务与 authority 验证打开后改名到拒绝目标时零正文读取、无快照产物、原文不变；模型请求为零。import-cycles/config-consumers/declarations/node-floor 通过，NormProof 无阻断项，仍有 6 项既有函数数量 advisory。未运行独立审查、PTY、跨平台验收。
- 上批 `81fe8dcc` 已推送，Architecture Watch `37338065442` 成功，CI `37338065230` 最近查询仍 in_progress。SAFE-02 仍进行中：目录枚举、原生搜索逐文件拒绝、创建竞态及非 Linux 描述符边界未由本批解决。
