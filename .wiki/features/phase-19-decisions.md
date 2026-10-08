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

**规划形成时，下面的任务全部尚未实施、未验收。** 随后按用户授权进入实施；当前进展与验证边界见 §8，未列为已实施的任务仍待完成，不能因形成计划就宣布功能完成。

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


### 8.7 SAFE-02 — 目录输出与遍历策略接线（2026-10-06，进行中）

- [遍历 owner](../../packages/ts-shell/src/runtime/execution/fileWalk.ts) 接收逐路径拒绝与取消信号。显式目录在 readdir 前后核验范围与策略；候选输出核验 canonical 目标及祖先目录，外部符号链接和拒绝目录后代不输出。walk 进入子目录前检查，在读取本地忽略文件前检查；[ignore owner](../../packages/ts-shell/src/runtime/execution/ignoreRules.ts) 的目录 matcher 也接收相同过滤。
- [执行服务](../../packages/ts-shell/src/runtime/execution/service.ts) 拒绝工作区外枚举根并返回拒绝的 Promise；glob、LSP、grep 回退传入检查与取消，read 目录列表接入相同选项。[目录呈现](../../packages/ts-shell/src/core/tools/directoryListing.ts) 将省略原因写为 ignore 或 access rules，避免将权限隐藏误报为纯忽略规则。保留缺失目录返回空列表的既有约定，其他错误不据此伪装为缺失；..notes 等合法名称不再按父目录前缀排除。
- 定向比较沿 [19 号研究](19-tools-maturity-and-multifile-edit.md) 检查参考目录工具的路径解析、存在/类型检查、readdir 与逐条 stat；保留本项目共享遍历/忽略 owner，未新增平行列表系统。参考没有本批逐路径 deny 契约，不能把其直接 readdir 当作权限围栏。本批继续保留原生 Git 的忽略与 tracked 语义，对结果再检查，不退回一个不同语义的枚举器。
- 验证：Linux、Node 20.3、仓内隔离环境下 execution/core-tools/turn-tools 共 40 文件/393 项通过，build:ts 通过。新增 8 项覆盖有/无 Git 的拒绝文件、拒绝目录后代、内外部链接、外部枚举根、预取消/拒绝零 readdir、walk 不进入拒绝目录或读拒绝忽略文件、read/glob 实际接线及双点文件名。最初 fixture 位于父仓库内，被父 Git 忽略规则覆盖，移至隔离 TMPDIR 后验证两条真实分支；未改产品忽略语义来适应 fixture。
- 反转移除实际路径拒绝回调时 6 失败/2 通过，精确恢复后上述组合套件通过。编译模块探针分别在非 Git 与 Git 合成工作区运行真实 read/glob，均隐藏拒绝目录及其内容并保留公开文件；模型请求为零。import-cycles/config-consumers/declarations/node-floor 通过；NormProof 无阻断项，整体 partial 仍来自 6 项既有函数数量 advisory。
- `81fe8dcc` 的 CI `37338065230` 已核实成功；快照提交 `30c26b7a` 的 Architecture Watch `37338755126` 成功，CI `37338755092` 最近查询仍 in_progress。未取得本批独立审查、PTY 或跨平台运行证据。
- SAFE-02 仍未完成：原生 Git 内部读取忽略配置尚不受逐文件回调控制，同步子进程不能即时响应取消；原生 grep 内容搜索仍缺逐文件 deny。目录及忽略文件目前依赖路径复查，不能承诺实际打开目录身份在竞态中不变；创建副作用与非 Linux 描述符问题继续保留。当前证据证明稳定目标下的权限接线，不是完整文件系统隔离证明。


### 8.8 SAFE-02 — 原生搜索逐文件准入（2026-10-06，进行中）

- [原生 grep](../../packages/ts-shell/src/core/tools/grepRipgrep.ts) 在调用上下文携带文件策略时，先通过原生 --files/--null 枚举候选，再交给 [候选 owner](../../packages/ts-shell/src/core/tools/searchFiles.ts) 核验常规文件、canonical containment、目标及祖先目录拒绝规则。正文搜索仅传入允许的明确文件列表；全部拒绝时不启动正文搜索。未提供文件策略的兼容直接调用保留原路径搜索，不能把它们宣称为已受额外 deny 约束。
- 使用现有执行 owner 流式收集 NUL 分隔名称，处理跨块 UTF-8，候选输出上限 16 MiB，超限停止并返回 output-limit，残缺记录返回失败。允许列表按保守的 16,000 字节 argv 大小分批，枚举与后续搜索共用总 deadline；每批启动前再核验，保留结果前及返回前重新核验，策略撤回后的正文不输出。仅缺失二进制仍允许原有 walk 回退。
- 定向比较沿 [19 号研究](19-tools-maturity-and-multifile-edit.md) 实读参考 grep 的参数构造和流式 JSON 读取：保留原生 --hidden/glob、-- 分隔模式/路径及 JSON 行处理；参考直接以目录启动搜索，没有同等逐文件回调契约，本批扩展为原生候选加明确文件搜索，不重写匹配器或换成逐文件 JavaScript 正则。枚举和匹配共用同一个参数 owner，避免两处 glob/大小语义漂移。
- 验证：Linux、Node 20.3、仓内隔离环境下 execution/core-tools/turn-tools 共 41 文件/400 项通过，build:ts 通过。7 项新增测试检查正文进程 argv 不含拒绝文件、全拒绝零正文进程、点目录和原生忽略、输出到达时撤回策略、长列表分批无丢失、超大枚举终止和残缺枚举失败。移除目标/祖先拒绝检查时 4 失败/3 通过，精确恢复后最终组合套件通过。
- 编译模块探针经实际内置 grep 与原生程序验证公开内容可搜索、拒绝目录内容不输出、回退 walk 次数为零；模型请求为零。import-cycles/config-consumers/declarations/node-floor 通过；NormProof 无阻断项，6 项既有函数上限 advisory 保持，整体 partial。未取得本批独立审查、PTY 或非 Linux 运行证据。
- 上批 `6e339370` 的 Architecture Watch `37339975289` 已成功，CI `37339974843` 最近查询仍 in_progress。SAFE-02 仍未完成：本批是稳定目标下的原生逐文件准入，候选检查与子进程打开之间尚存在竞态，原生内部忽略配置读取仍不受回调约束；输出复查不能证明子进程从未读取随后被替换的拒绝对象。目录/创建竞态及非 Linux 文件身份边界仍待完成。


### 8.9 SAFE-02 — 原生搜索隐式配置隔离（2026-10-06，进行中）

- [原生搜索参数](../../packages/ts-shell/src/core/tools/grepRipgrep.ts) 的版本探测、候选枚举和正文搜索统一传入 --no-config。继承的 RIPGREP_CONFIG_PATH 不再改变工具行为或启用逐文件预处理命令；工作区忽略文件语义仍保留，此项不等于禁止原生内部读取忽略文件。
- 定向核实当前原生工具 --help：--no-config 明确忽略 RIPGREP_CONFIG_PATH；--pre 会为每个输入文件启动指定程序。已检查的参考 grep 参数构造没有该隔离选项，本项目不继承这项隐式进程配置行为，依据是工具授权只覆盖声明的搜索，不包含配置隐藏的预处理执行。
- Node 20.3、隔离环境下原生 grep 路径/流式/参数/候选共 4 文件/47 项通过，build:ts 通过。两项新增真实原生进程测试分别覆盖有/无文件策略，合成配置指定仅向 fixture 写标记的预处理器；正常搜索保留原文且零标记文件。移除 --no-config 时两项均因标记文件实际生成失败（2 失败/7 通过），精确恢复后 47 项通过。最初无扩展名 fixture 受模块格式影响，改为明确 .cjs，确保反转证明真实执行而非仅启动错误。
- import-cycles/config-consumers/declarations/node-floor 通过。此次未改模块依赖关系或引入新依赖；未取得本批独立审查、PTY 或跨平台证据。
- 后续隔离条件实测：本机 /usr/bin/bwrap 存在，最小只读 bind、网络隔离及 true 命令 exit 0。当前 [sandbox owner](../../packages/ts-shell/src/sandbox/osSandbox.ts) 将工作区可写挂载，面向 shell，不能直接当作只读候选文件隔离；需要在该 owner 内明确候选文件及实际打开对象边界后再接线。仅 launcher 可运行不构成 SAFE-02 完成证据，目录/创建竞态和非 Linux 文件身份支持继续待完成。


### 8.10 SAFE-02 — Linux 原生搜索绑定已核验句柄（2026-10-06，进行中）

- [读取 owner](../../packages/ts-shell/src/runtime/execution/read.ts) 将既有核验与句柄生命周期抽成可消费回调，文本读取仍从同一已核验句柄读出。新增批量读取消费入口在打开后续文件后，再核验较早句柄的实际位置、身份、artifact 收窄范围和拒绝策略；任一步失败或消费者结束，已打开句柄均关闭。该批量入口明确仅支持 Linux，其他平台不伪装支持。
- [本地执行器](../../packages/ts-shell/src/runtime/execution/local.ts) 可将已核验只读描述符作为子进程 fd 3 起继承，保持原有输出、取消、进程树清理及结果路径。Linux 上启用文件策略的 [原生搜索](../../packages/ts-shell/src/core/tools/grepRipgrep.ts) 通过 /proc/self/fd/N 搜索实际打开对象，而非重新打开候选路径；输出 fd 路径映射回用户文件路径，未知 fd 记录不输出。候选已匹配 glob，正文阶段不再用用户 glob 错配描述符名称，同时禁用正文阶段忽略文件读取和 mmap。
- 每批最多 64 个打开句柄，保持 argv 长度上限及共享总 deadline，打开文件耗时也扣除后再启动进程。没有引入第二执行平面或逐文件重写正则。现有 sandbox 是 shell 的可写挂载方案，直接包裹无法替代文件对象绑定，故本批先在既有读取/执行 owner 消除正文按路径重开，而未改 sandbox 默认行为。
- 定向比较：参考 grep 的 spawn 只配置标准输入/输出管道并传文件路径，未提供同等句柄绑定；沿此前 canonical 读取比较，保留“实际使用已核验对象”的决定，使用当前 Node stdio 描述符继承能力完成。只读原生探针先证实 fd 路径可被当前搜索工具消费，未依赖假想平台支持。
- 验证：Linux、Node 20.3、隔离环境下 execution/core-tools/turn-tools 共 41 文件/406 项通过，build:ts 通过。新增打开后、spawn 前替换同名路径的真实原生测试，返回原核验文件内容而非替换标记；移除绑定时 2 失败/8 通过。新增生命周期测试覆盖后续打开失败、消费者失败及打开后续输入期间将早先文件移出工作区，均不消费未核验对象并关闭所有句柄。源码精确恢复后最终组合套件通过。
- 编译模块探针经实际工具→读取 owner→执行器→原生程序，确认 fd 继承和同名替换内容未读入，模型请求为零。import-cycles/config-consumers/declarations/node-floor 通过；NormProof 无阻断项，函数上限仍为 6 项既有 advisory。上一提交 `f34dad31` 的 CI `37342093096` 已核实成功。
- SAFE-02 仍进行中：句柄固定对象不提供内容不可变快照，也不撤销子进程已经继承的对象能力；文件内容的并发原地修改仍可影响读取。候选枚举的内部忽略文件访问、目录/创建竞态、未带文件策略的兼容直接调用及非 Linux 正文搜索仍未获得同等保证。未取得独立审查、PTY 或非 Linux 运行证据。


### 8.11 SAFE-02 — Linux 目录描述符枚举（2026-10-06，进行中）

- [读取 owner](../../packages/ts-shell/src/runtime/execution/read.ts) 共用文件/目录的 containment、类型、bigint 身份、拒绝、取消及句柄关闭机制，向消费者提供再次核验入口。[目录 owner](../../packages/ts-shell/src/runtime/execution/directory.ts) 在 Linux 打开目录描述符，通过 /proc/self/fd 枚举，返回名称前再次核验；[共享遍历](../../packages/ts-shell/src/runtime/execution/fileWalk.ts) 的 walk 和直接目录列表消费此入口，未新增平行遍历系统。
- 其他平台保留 canonical 路径、类型、前后身份与策略检查分支，不要求它们通过 /proc 或打开目录句柄；该分支不声称具备 Linux 的实际枚举对象保证。遍历选项类型移到现有 [执行契约](../../packages/ts-shell/src/runtime/execution/types.ts)，fileWalk 原导出保持兼容，避免实现依赖经类型文件回到自身。
- 对照前述目录工具的路径/类型预检与 readdir 流程，保留单层列表和共享忽略语义；直接按路径枚举不能解决检查后替换，本批复用已建立的描述符策略，未将参考的普通路径调用当作竞态保证。
- Linux、Node 20.3、隔离环境下 execution/core-tools/turn-tools 共 42 文件/412 项通过，build:ts 通过。6 项新增覆盖内部/外部链接、打开后目录移出、枚举前同名路径替换、枚举后取消、常规文件拒绝，以及非 Linux 路径分支的模拟接线。平台分支模拟不是实际 macOS/Windows 验收。
- 反转为按原路径 readdir 时，原本只枚举 public.txt 的测试读到替换目录 PRIVATE_NAME，1 失败/4 通过；源码精确恢复后组合套件通过。编译模块探针也核实实际枚举来自已打开目录，目录变动后拒绝返回过期列表；模型请求为零。import-cycles/config-consumers/declarations/node-floor 通过，NormProof 无阻断项，整体 partial 仍为 6 项既有函数数量 advisory。
- SAFE-02 仍未完成：walk 在目录枚举之外读取忽略文件的路径、原生候选枚举内部访问、创建目录/文件的副作用竞态，以及其他平台的实际对象保证仍待处理。Linux 描述符枚举不提供整棵目录树的事务快照。未取得独立审查、PTY 或非 Linux 实机证据。


### 8.12 SAFE-02 — 运行时忽略文件读取（2026-10-06，进行中）

- [忽略规则 owner](../../packages/ts-shell/src/runtime/execution/ignoreRules.ts) 增加运行时句柄读取入口，复用 [读取 owner](../../packages/ts-shell/src/runtime/execution/read.ts) 的实际目标核验、拒绝、取消及关闭机制，读取后再次核验，只有有效内容才加入 matcher。[遍历 owner](../../packages/ts-shell/src/runtime/execution/fileWalk.ts) 的 walk 与非 Git 目录 matcher 接入此入口，不再直接按路径 readFileSync 忽略文件。
- 同步 discovery 接口保留，两个入口共用原有规则解析与祖先来源序列，不复制匹配器或改变 negation/prefix 规则；此前目录分段前缀误把 ..notes 当作父目录的问题在共享来源序列中按完整路径段处理。本批不宣称保留的同步 discovery 路径也具备描述符核验。
- 设计沿前述 canonical 读取对照的“实际使用已核验对象”决定：忽略文件内容同样是读取操作，不能因它影响过滤而绕过文件权限。沿用现有 ignore 库和规则重写，不另造规则系统；原生 Git/ripgrep 自行读取规则的行为仍与本批 TypeScript loader 分开验收。
- Linux、Node 20.3、隔离环境下 execution/core-tools/turn-tools 共 43 文件/418 项通过，build:ts 通过；强化接线断言后 focused 6 项再次通过。新增覆盖打开后替换零读取、读前路径替换仍读原句柄且拒绝应用过期规则、嵌套否定规则、目录列表句柄接线、取消传播及外部忽略文件链接。反转回直接路径读取时 4 失败/2 通过，源码精确恢复后 focused suite 通过。
- 编译工具探针通过实际 read 目录路径验证外部 .ignore 链接不能隐藏公开文件；模型请求为零。import-cycles/config-consumers/declarations/node-floor 通过，NormProof 无阻断项，整体 partial 仍来自 6 项既有函数上限 advisory。上一提交 `692b3faa` 的 Architecture Watch `37345053846` 已成功，CI `37345053821` 最近查询仍 in_progress。
- SAFE-02 仍进行中：原生候选枚举与 Git 内部忽略配置读取、创建副作用竞态及跨平台实际对象保证尚未解决。忽略文件缺失、不可读或拒绝时不应用该文件规则，取消仍传播；此行为不能替代对候选文件本身的 deny 检查。未取得独立审查、PTY 或其他平台实机证据。


### 8.13 SAFE-02 — Git 只读查询禁用文件监视程序（2026-10-06，进行中）

- [忽略规则 owner](../../packages/ts-shell/src/runtime/execution/ignoreRules.ts) 的 ls-files 与 check-ignore 调用显式设置 core.fsmonitor=false，避免读取文件列表/忽略规则时执行仓库配置的监视程序；保留 tracked 与 ignored 结果语义。
- 合成仓库原生探针证实默认查询会执行配置的程序，显式禁用后不执行且查询成功。已检查的参考工具相关目录未找到 fsmonitor 隔离先例，不宣称参考已经解决该问题；本批依据原生行为证据收窄隐式执行权限。
- Linux、Node 20.3、隔离 HOME/USERPROFILE/TMPDIR/CHEERS_TEST_ROOT/GIT_CEILING_DIRECTORIES 下 ignoreRules、fileWalk、listAccess 与 skill 共 4 文件/38 项通过，build:ts 通过。两条真实 Git 回归测试分别覆盖列表和忽略查询，核对结果及零执行标记；移除两处禁用参数时 2 失败/6 通过，均实际生成标记，源码精确恢复后上述组合套件通过。
- import-cycles/config-consumers/declarations/node-floor 通过。没有新增模块依赖；未取得本批独立审查、CLI/PTY 或非 Linux 运行证据。
- SAFE-02 仍进行中：另一个隔离原生探针确认搜索工具会跟随工作区外的 .ignore 符号链接，其内部忽略配置访问尚未解决；Git 内部元数据读取、创建副作用竞态及跨平台实际对象保证也不由本批覆盖。


### 8.14 SAFE-03 — 问答来源与终态（2026-10-06，本地实现与验证）

- [ask 工具](../../packages/ts-shell/src/core/tools/ask.ts) 与 [结果投影](../../packages/ts-shell/src/core/tools/ask/result.ts) 为每题保留 user/none 来源，仅接受本题自有且非空的明确答案；原文空白保留，不把缺答填成推荐项。汇总 answered、partial、unanswered、cancelled、unavailable、error，只有完整回答标记 success；已有答案在部分回答、取消或界面错误时仍返回。推荐项只在提问 UI 展示，问答不授予后续执行权限。
- 新 [回调契约](../../packages/ts-shell/src/core/tools/ask/contract.ts) 携带响应状态、答案记录与取消信号，贯通现有 session/turn/CLI 适配；旧 AskQuestion/AskOption 导出保留。内部回调现在返回结构化响应，裸答案映射不再满足契约。直接工具入口复用 schema 验证，并拒绝重复/空 ID、空问题和不存在的推荐索引；不静默丢弃无效题目。
- [交互适配](../../packages/ts-shell/src/cli/interactive/interactiveAskBridge.ts) 不再将空输入自动选为推荐项，数字选项要求完整十进制字符串，1junk/1.5 保留为自由文本；问题 ID 不 trim，原型名称使用自有字段记录。[终端桥](../../packages/ts-shell/src/cli/interactive/questionBridge.ts) 支持 readline 的 signal 参数与关闭/中断事件，取消移除待答 UI 和监听器，不继续下一题；用 parent-abort/user-cancelled/input-closed 安全原因码区分父信号、用户中断和输入关闭，不输出任意异常或信号原文；既有无 signal 确认调用仍在放弃时收到拒绝。新提问不能覆盖已存在的待答确认。
- 定向对照参考的交互 selector/input：取消与关闭返回无选择，显式 signal 监听负责退出并移除界面；采用这一决定，沿本项目 readline/全屏桥完成，不引入第二交互引擎。原有测试把自动选择推荐项视为正确，按本阶段裁决分类为 stale expectation，替换为明确来源及取消反例，未以旧测试定义产品契约。
- Linux、Node 20.3、隔离环境下 ask、交互桥、终端宿主、信号、调用适配、工具 gate、参数校验与权限共 9 文件/131 项通过，build:ts 通过。六种状态经真实工具适配器验证，后续 write 在没有执行审批时仍被拒绝。反转答案兜底 5 失败/16 通过；反转空输入推荐 1 失败/16 通过；反转中断为 n 时 3 失败/14 通过，包含不能结束后续问题的超时反例。每组源码精确恢复后最终组合套件通过。
- 编译模块经真实 PTY/readline 提问：先显式选择第二项，再留空或 Ctrl-C，分别得到 partial/cancelled，均保留第一项用户答案且第二项 source=none；子进程 exit 0，模型请求为零。这是工具与终端适配探针，不是完整模型驱动 CLI 会话验收。import-cycles/config-consumers/declarations/node-floor 通过；NormProof 无阻断项，两项图义务 satisfied，整体 partial 仍来自 6 项既有函数数量 advisory。未取得独立审查或非 Linux 实机证据。
- SAFE-02 继续保留原生内部访问、创建竞态与跨平台缺口；本批推进同一 W1 的独立问答任务，没有将这些缺口改称完成。其余 Phase 19 批次仍待执行。


### 8.15 SAFE-05 — 网络期限、正文消费与错误投影（2026-10-06，进行中）

- [请求 owner](../../packages/ts-shell/src/core/network/request.ts) 将父取消与本地期限同时接入，检查预取消并在 finally 清理定时器/监听器；同一期限覆盖网页重定向、正文与解析前后，不因收到父 signal 而取消本地超时。[正文 owner](../../packages/ts-shell/src/core/network/response.ts) 复用此前抓取限额职责，按声明长度及 fetch 交付的解码字节限制，使用有界增长缓冲区，超限或中断取消正文并释放 reader，不等待可能停滞的清理 Promise。
- [网页工具](../../packages/ts-shell/src/core/tools/webFetch.ts) 删除旧内联正文读取实现，错误/重定向体不消费且请求取消；每跳继续检查 URL，拒绝 URL credentials，不回显 URL、Location、statusText 或异常正文。[搜索工具](../../packages/ts-shell/src/core/tools/webSearch.ts) 三条后端路径共用读取限额 2 MiB，网页保留 5 MiB；非成功响应只投影固定来源、HTTP status 与稳定错误码，区分 cancelled、timeout、rate_limited、denied、http_error、network_error、response_limit、invalid_response 和 redirect_limit。错误体不进入模型消息或 hook 记录，不靠先读再脱敏。
- [搜索响应](../../packages/ts-shell/src/core/tools/web/search.ts) 在 JSON.parse 前限制结构深度至 32，再复用现有 schema 校验；结果数不超过请求数，标题/URL/摘要分别限制 512/2048/1000 字符，裁剪状态同时进入正文和 metadata。保留配置选择顺序与正常 HTML/JSON 结果；说明没有自动重试/failover，未把配置级选择改称请求容灾。
- 定向对照参考 HTTP 管理请求的总期限/父信号组合、重试前取消废弃正文，以及搜索共享 reader 的字节限额与取消决定；采用相同资源生命周期原则。参考仍会有界读取部分错误体，本项目按本阶段契约完全不消费错误体。未调整模型 provider/auth 实现或包依赖，没有复制另一个传输系统。
- Linux、Node 20.3、隔离环境下网络 owner、工具、研究 collector 和 turn gate 共 6 文件/120 项通过，build:ts 通过。新增真实本地 HTTP 测试确认停滞正文超时后连接关闭、gzip 解码超限拒绝、持续 429 正文取消及秘密标记不进入模型/hook、正常文本保留。测试只将 transport 目的地导向合成服务，未修改产品公共 URL 策略，不构成真实公网/DNS/TLS 验收。初轮一个新测试的语法错误按 harness/setup 修正后通过。
- 反转本地 deadline 时 4 项失败；取消错误体保护反转时 12 项失败；恢复任意原始异常消息投影时 4 项失败。使用测试名称过滤，其他场景未运行而非被豁免；每次源码精确恢复后最终组合套件通过。import-cycles/config-consumers/declarations/node-floor 通过；NormProof 两项图义务 satisfied、无阻断项，整体 partial 仍来自 6 项既有函数数量 advisory。没有独立审查、PTY、真实 provider 或非 Linux 证据。
- SAFE-05 尚未完整完成：当前 fetch 对正文自动解压，已限制声明长度与实际解码字节，但没有独立观测无 Content-Length 时的压缩传输字节；同步解析只在前后检查取消，不能声称可在同步解析中抢占。连接级计量与 SAFE-06 的 DNS 审核绑定、搜索重定向目标/凭据策略需在网络连接 owner 继续落实；SAFE-02 的既有边界亦保留。


### 8.16 SAFE-05/06 — 公共网络连接与压缩计量（2026-10-06，本地实现与验证）

- [地址准入](../../packages/ts-shell/src/core/network/address.ts) 在任何连接前解析并审核全部 A/AAAA 返回值，拒绝混合公私地址、空结果、错误 family、URL credentials 及非公共字面地址；socket lookup 只返回该次审核的副本，不重新解析。[连接 owner](../../packages/ts-shell/src/core/network/connection.ts) 使用 Node HTTP/HTTPS，禁用池复用与隐式代理/重定向，保留原 URL 的 Host 与 TLS servername，显式保持证书校验，响应头限制 16 KiB。工具不再各自直接 fetch，没有新增第二个模型 provider 或命令执行路径。
- [共享地址策略](../../packages/ts-shell/src/core/security/egressGuard.ts) 保留现有 hostname 分类，新增严格公共地址准入，复用 Node BlockList 拒绝文档、基准测试、多播、保留段与 IPv6 转换地址；IPv6 仅准入当前全局单播前缀中的非特殊地址，IPv4-mapped 目标继续按 IPv4 审核。浏览器已有的 localhost 类别政策不受此新公共连接准入改变。
- [正文流](../../packages/ts-shell/src/core/network/body.ts) 在解压前计算传输字节，并限制每层解压输出；支持 gzip、deflate、br 和最多三层声明编码，未知或损坏编码失败。通过字节背压、pipeline 销毁与既有 [响应消费](../../packages/ts-shell/src/core/network/response.ts) 完成取消和文本限额，补齐 §8.15 无 Content-Length 时压缩字节不可见的问题。错误/重定向响应在 headers 阶段终止，不进入解压器或正文消费者。
- [重定向 owner](../../packages/ts-shell/src/core/network/redirect.ts) 共用五跳上限与原始总期限，每跳重新准入并绑定地址。网页允许无凭据的公共跳转；搜索限定配置来源的同一 origin，禁止凭据/query body 跨域或降级发送。301/302 POST 与 303 切换 GET 时清除正文及正文相关头，307/308 保持方法和正文。DNS 系统调用本身可能继续，但取消会立即停止等待、移除监听，迟到解析不能启动连接。
- 定向对照参考 HTTP hook 的 guarded lookup：全部 DNS 结果审核后，直接作为连接 lookup 的返回值，避免检查后再次解析；采纳此绑定决定。本项目公共 web 拒绝 loopback，与允许本地 hook 的参考策略不同；另一个参考的预检注明连接时再次解析，未采用其作为安全终点。继续使用成熟 Node HTTP/TLS/压缩流，不复制自定义网络栈或引入新的 IP 解析依赖。
- Linux、Node 20.3、隔离环境下网络 owner、web 工具、研究 collector、工具 gate 和原 hostname 策略共 10 文件/217 项通过，build:ts 通过。真实本地 HTTP/TLS/IPv6 测试覆盖 Host/SNI、主机名不符和不受信任证书拒绝、压缩流、socket lookup 与取消；独立 DNS 测试覆盖公私混合、审核后不重查、预取消零 DNS 和迟到结果零连接。TLS 证书/私钥是提交在 [测试资源](../../packages/ts-shell/src/test-utils/network/README.md) 中的公开合成 fixture，仅测试 adapter 注入信任与本地地址，不改产品信任/公共地址政策。
- 五组反转分别造成 2/1/2/1/3 项失败：只看首个地址、审核后再次解析、关闭 TLS 验证、移除原始传输限额、放开搜索跨域。源码精确恢复后最终 217 项通过。初轮 DNS 表驱动测试因数组被 it.each 展开而未正确传递空集，按 harness/setup 改为具名字段，保留全部反例。import-cycles/config-consumers/declarations/node-floor 通过，NormProof 两项图义务 satisfied、无阻断项，整体 partial 仍为 6 项既有函数数量 advisory。
- 前两次提交 `255c618f`、`e85623ca` 的 CI 均已确认失败，原因是 highValueTools 遗漏的两条旧 ask 预期；它们不是网络失败。修订后的问答测试与原 ask 套件 48 项通过，修复单独提交 `c077169`。本批尚无新提交的远端成功结果、独立审查、完整模型驱动 CLI、真实公网或非 Linux 运行证据；不能用本地网络证明关闭 Phase 19 整体任务。SAFE-02 剩余边界与后续任务继续。

### 8.17 SAFE-07：浏览器动作取消与清理证据

- 所属路径为 `browser/session/` 的动作作用域和清理器、现有 session manager 与 browser 工具适配。整个 open→observe 共用父信号、30 秒总期限及 taskId；经理公开 run 上下文也接受绝对 deadline。工具预取消零启动/导航/输入/关闭；启动每个异步阶段结束后重新检查取消，迟到句柄仍回收。
- 同一会话串行动作。取消立即关闭已获得资源，再等待底层调用并回收迟到资源；调用方最多等待 4 秒清理确认，底层未结束时返回 unknown 并继续占用序列。排队调用独立取消，不关闭前一调用的页面。显式 close 可越过动作序列请求停止，保留清理重试入口。
- 清理按资源保留进行中的 close promise；每个资源最多观察 1 秒，超时不是关闭证明，仍尝试剩余 context/browser。失败可重试、挂起不重复发起 close、迟到完成可在重试时确认。初始化未结束的 close 也有界，并继续负责迟到句柄。不添加新的浏览器进程实现或 PID 强杀路径。
- 结果分别报告 activity=not-started/started/completed、effect=none/possible/confirmed、state=completed/cancelled/error、cleanup=not-needed/complete/failed/unknown。effect 的 confirmed 表示浏览器 API 已确认该动作，不代表远端业务事务完成；取消从不宣称外部副作用回滚。观察失败携带明确失败，不再伪装为空元素成功。失败清理阻止继续使用残留页面；旧页面事件只能清空自身句柄。
- 对照只读参考的浏览器启动/关闭实现：启动取消仍负责已获得资源、关闭共享进行中请求、观察真实结束且保留清理错误。参考拥有原生子进程可升级终止，本项目通过现有浏览器接口关闭，无法证明终止时保留 unknown；不照搬第二执行实现。三个反转（取消检查、主动关闭、超时伪装关闭）均触发失败，原文件逐字节恢复。
- 本地证据：浏览器域与 highValueTools 等 344 项通过（当时真实浏览器 9 项因缺失所需版本跳过）；随后在仓库内隔离安装对应 Chromium，最终 7 文件 60 项通过且无跳过，包括真实挂起导航断连和服务器已收到提交后取消。包含显式 close 失败元数据断言。真实提交测试允许驱动确认点击或拒绝导航等待两种结束方式，但必须保留可能/已确认副作用与服务端请求计数。
- Node 20.3 构建、import cycles/config consumers/declarations/node floor 通过；NormProof 阻断义务通过，仍有 6 个既有函数数目 advisory。未执行独立审查、真实模型驱动交互或非 Linux 验证；SAFE-02 缺口、TOOL-04 上传下载与其余批次不因此关闭。上一提交 ee520741 的 CI 有两项失败，研究夹具已另以 0436d974 修正，缓存多进程超时仍待远端复核。

### 8.18 SAFE-08：工具正文、审批与终稿分离

- `turn/tools.ts` 删除成功审批装饰前缀，将原 operation/decision 放入结果 metadata.approval；审批 requested/resolved 事件继续存在，必要的拒绝、失败与验证反馈仍送模型。`core/agent/tools.ts` 合并后置 hook 更新时保留已有 metadata，hook 异常保留已执行结果和 artifact 证据，后置 hook 不可把已失败结果改为成功。
- 工具只有流式输出而缺少终稿时，适配层保留有界流内容作为模型结果；显式空字符串是有效终稿，不再替换成 Success。执行异常仍保留已收到的流和失败原因。使用既有模型输出字符限额，不新增结果传输系统。
- ToolCards 的审批状态独立于正文，终稿存在时替换 preview、重复 finish 不追加第二份；缺失终稿保留流，显式空终稿清空正文。chunk 按原始片段拼接，不擅自插入换行或删除空白。UI preview 保留末尾 40 行/16000 字符并显式标记截断；完整终稿到达后清除 preview 截断标记。
- failureReason 与正文分开保留，最终失败展开，artifact 与 fenced diff 继续呈现。未解决审批随动作结束标为 interrupted，不保留伪等待状态；批准只表示审批事实，动作状态仍由实际结果驱动。
- 已针对只读参考检查最终结果替换、审批独立渲染以及 hook 更新保留结果字段的具体决策；参考代码本身不能证明其所有模型路径都没有审批文字。本项目额外选择保留 hook 异常前的副作用证据。反转批准前缀、终稿替换、metadata 合并、缺失终稿流兜底均触发失败。首次仅移除对象展开未破坏后续显式 metadata 合并，因此不是有效反转；改为撤销实际 metadata 保留后测试失败。源文件逐字节恢复。
- 本地 13 文件 258 项通过，覆盖 turn session、工具内核、审批、TUI 正文/失败/截断/差异块；Node 20.3 构建通过。真实构建 CLI 接合成本地 provider，执行一次无害 bash 输出并发送下一次模型请求：2 次请求、1 条纯工具消息，无批准前缀，审批事件保留；独立真实 PTY 渲染检查终稿只出现一次且审批状态独立。两者不是外部 provider 或完整交互模式验收。
- import cycles/config consumers/declarations/node floor 与 docs strict 通过；docs 保留 120 个既有非阻断 source-reference advisory。NormProof 阻断义务通过，6 个既有函数数目 advisory 未消失。当前新提交的远端结果尚待验证；SAFE-07 的 5a3e4f9b 架构检查 37357237700 已成功，CI 37357237670 也已成功。SAFE-02 和后续 Phase 19 批次继续，不称全阶段完成。

### 8.19 CMD-01：命令调用身份与目录一致性

- 保留调度 registry 为事实源，`core/commands/invocation.ts` 生成统一调用描述：name、commandName、invocation、kind、group、summary、参数提示与候选。现有 58 个调度命令加交互 `/back` 为 59 个主项；56 个真实同义 alias 与 2 个独立 named invocation 合计仍为 117 个可解析名称。
- `/recall`、`/retain` 从同义 alias 列表移到同一 memory owner 的 invocations，分别展示 `<query>`/`<statement>`，不继承 `/memory` 的动作候选。调度保留 resolved.name 作为 rawCommandName；同义 alias 的实际拼写也保留，包括既有历史来源字段。
- display registry、CLI 参数识别、补全、未知命令提示和 picker 查找共用调用描述。同义 `/models`、`/sessions`、`/providers`、`/skills` 等打开对应 picker；带参数时仍走原命令。空查询展示主项与独立调用，不列重复 alias；非空查询仍可找到并插入原 alias，`/?` 也可补全。文本帮助包含独立调用。
- 扩展注册检查全部主名、alias 和独立调用的冲突与名称合法性；保存不可变快照，调用方修改原 aliases 不会改写已注册事实。注册/移除同时失效 CLI 名称与默认/过滤补全缓存。这里验证既有动态注册 API 的目录行为，不把尚未实现的扩展执行器或技能/模板异步枚举称为完成；后者仍按 CMD-04/ECO owner 接线。
- 定向读取参考命令 popup 的空查询隐藏同义 alias、非空保留调用方式决策；本项目不将独立 memory 调用隐藏成同义名称。反转 raw invocation、picker alias 映射、全名称冲突校验、缓存失效四组均使对应测试失败，源文件逐字节恢复。
- Node 20.3 下 10 文件 222 项与构建通过。真实 CLI PTY 在 regular/fullscreen 两种模式均验证 `/model` 与 `/models` 打开同一 Model chooser，`/recall`、`/retain` 保持各自 Usage，正常退出，无模型调用。首次全屏探针等待已存在提示的重复绘制而超时；按增量帧重新同步后两种模式均通过，没有为测试改变产品行为。
- import cycles/config consumers/declarations/node floor 通过；call reachability 保留 7 个既有 advisory，NormProof 阻断义务通过且保留 6 个既有函数数目 advisory。新提交远端结果待核对；SAFE-08 的 f0eb595c 两项检查 37359462720/37359595760 已成功。CMD-02/03/04、SAFE-02 与其余批次继续。


### 8.20 CMD-02：原草稿范围补全与接受语义

- 补全候选携带原始 UTF-16 `[from,to)`、草稿全文、光标和单调 revision。编辑器在应用前核对快照与 grapheme 边界，保留前后缀、Tab、多空格、换行和 CJK；移动后返回原位、编辑后撤销也使旧候选失效。单次替换是一项撤销操作，光标落在插入文本末端，历史条目只作为新草稿采用。
- [editor/buffer](../../packages/ts-shell/src/presentation/tui/editor/buffer.ts) 承接已有文本修改与撤销职责，[replacement](../../packages/ts-shell/src/presentation/tui/editor/replacement.ts) 负责快照/范围验证；原 editor 保留移动、历史、剪切和渲染。复用现有 grapheme 分段且每次边界检查仅扫描一次，移除原 editor 超过函数上限的问题，未建立第二套编辑器。
- 命令与文件补全仅查询光标之前的 token 内容，替换完整当前 token；共用原命令参数 scanner 的位置结果，执行侧旧 tokenize 接口保持不变。引号文件和参数编码后保持单个解码值，不重复闭合引号；只有原文结尾才补一个分隔空格，已有分隔符不重写。
- Tab 只接受候选；Enter 接受未完成候选而不提交，完整 `/help`（含大小写变体）保留单次 Enter 提交。接受后重新计算参数列表，未绑定/过期候选不修改草稿。目录、workspace/session 身份及异步结果失效属于 CMD-04，完整参数合法性/词表修正属于 CMD-03，不能由本批局部输入检查代替。
- 定向对照参考终端补全：同意保留后缀、单独返回光标、避免重复闭合引号和单步撤销；不采用其 slash 补全后继续提交的分支，原因是本项目明确要求 `/res` 的候选接受不得执行 `/reset`。前缀/后缀、revision、grapheme、Enter 四类反转均实际触发失败，源码逐字节恢复。
- Linux、Node 20.3、隔离环境组合测试 10 文件/268 项通过；边界扫描调整后 66 项再次通过，构建通过。真实 regular/fullscreen PTY 验证 `/thinking l` 第一次 Enter 仅补全、第二次才执行，完整 `/help` 一次打开帮助，两模式 exit 0、无模型请求。首轮 PTY 等待了不存在的 Commands 标题，实际帮助已打开；改为等待实际 chooser 标记后通过。没有真实 Windows Terminal 像素验收。
- import cycles/config consumers/declarations/node floor 通过；call reachability 保留 7 个既有 advisory，NormProof 阻断义务通过，函数数量 advisory 从 6 降至 5。前批 c23570b5 的 CI 37361881459 与 Architecture Watch 37361881308 已成功。本批远端结果仍需按新提交核验；SAFE-02 和其余阶段任务仍未完成。


### 8.21 CMD-03：trust/todo/thinking 首批共享语法与写入边界

- 新增 [syntax model](../../packages/ts-shell/src/core/commands/syntax/model.ts)、[parse](../../packages/ts-shell/src/core/commands/syntax/parse.ts)、[projection](../../packages/ts-shell/src/core/commands/syntax/projection.ts)，由 trust/todo/thinking 各自的 syntax 定义提供动作、真实别名、说明及位置参数约束。handler 在读取/修改状态之前消费同一语法；registry 仅投影 hint 和候选，帮助不再手写这些命令的动作列表。删除旧 argumentCompletions 内 todo/thinking 词表。
- trust 动作通过明确数组匹配，不再查询普通对象的继承属性。constructor、__proto__、未知动作及任意多余参数拒绝，不调用 setter；[存储入口](../../packages/ts-shell/src/core/security/projectTrust.ts) 再独立验证实际字符串枚举，非法 JS 值不能绕过 TypeScript 声明覆盖原 untrusted 记录。此批没有宣称修复损坏信任文件处理、跨进程锁或持久化失败报告。
- todo start/done/complete 必须接收一个正的安全整数 ID；1junk、小数、指数、符号、越界整数及额外参数均拒绝，检查单不变。complete 保留为真实 done 别名。add 的自由文本不被当成 flag，语法解析器不改写原参数数组；handler 保留原有文本拼接语义。
- thinking 拒绝未知动作与多余参数，off/auto/none 共用同一“移除 effort 偏好”动作；不宣称禁止 provider 推理。旧测试要求回显非法 level 文案，按新的安全错误契约改为约束类别与合法 usage，继续断言状态未改变。
- 对照参考声明式 subcommand 的单源描述和候选派生，采用这一决定并把运行时校验也接入；其候选构造只处理一级动作，后续多级参数合法性仍需由本项目解析器逐项实现。对照参考信任模块的字符串枚举验证，采用显式值比较；另外在本项目 setter 直接设边界，不能仅依赖调用端类型声明。参考对损坏配置拒绝保存的决定已注意到，属于后续存储完整性工作，未以本批枚举守卫冒充完成。
- Linux、Node 20.3、隔离环境下 8 文件/177 项通过，build:ts 通过。恢复旧 trust handler、移除 setter 枚举守卫、恢复 parseInt 接受、删除额外参数拒绝四组反转均失败；逐字节恢复后组合套件再次通过。真实 regular/fullscreen CLI 先记录 untrusted，再输入 constructor/__proto__/on extra/session extra/status extra，文件内容与 mtime 均不变，两模式 exit 0、无模型请求。
- import cycles/config consumers/declarations/node floor 通过；call reachability 7 个既有 advisory，NormProof 阻断义务通过且保留 5 个既有函数数量 advisory。前批 3fe750c7 的 CI 37364227880 最近为 in_progress、Architecture Watch 37364227869 为 queued，不计成功。
- **CMD-03 尚未完成**：本批只迁移上述三条命令；23 号全量表其余命令、flags、多级语法、动态实体及 model/export/memory/restore 的语义仍待处理。CMD-04、SAFE-02 和其余 Phase 19 任务继续。


### 8.22 CMD-03：export/restore 严格 flags 与确认隔离

- [flags](../../packages/ts-shell/src/core/commands/syntax/flags.ts) 复用 Node 原生严格 parseArgs，按领域定义识别 boolean/text、inline 值、别名、重复和冲突选项；支持显式 `--` 结束选项解析且不修改输入数组。原生错误包含 argv，返回时仅报告错误类别。没有 flags 定义的自由文本命令保留原参数路径，不把 prose 中的 `--word` 当选项。
- [export syntax](../../packages/ts-shell/src/core/commands/export/syntax.ts) 统一 markdown/md、jsonl、html、可选文件路径及 --outside。删除独立 format parser 与旧 jsonl-only 词表；未知选项、boolean 赋值、重复 flag、额外路径在读取会话或写目标之前拒绝。`md -- --outside` 明确表示工作区中的文件名，未授予外部写权限。
- [restore syntax](../../packages/ts-shell/src/core/commands/restore/syntax.ts) 声明 preview/execute、record/records、all、ledger/workspace/authority 的兼容别名及执行/确认/dry-run flags。替换跳过未知项的旧 parser；缺值、重复别名、all 与 record 冲突、非法确认值、空/重复 record ID 拒绝且不调用恢复 runner。保留默认 preview 与显式执行确认两层条件，dry-run 仍禁止写入。
- 帮助与候选来自同一语法；已用/冲突选项不再建议。确认 flags --execute/--confirm 及其确认值不由补全提供。新增 flags 候选暴露了空参数位置 Enter 会接受默认高亮项的问题：现仅有已输入的未完成 token 才隐式接受，空位置直接提交当前命令；Tab 和主动选择仍只编辑草稿。回归明确断言 `/export markdown ` 不被添入 --outside。
- 对照参考 CLI 的“复制输入、支持 --key=value、-- 之后为字面参数、boolean 不吞后续值”决定，采用相同语义；本项目交由 Node 原生 parser 实现严格类型/未知项拒绝，再增加重复及互斥校验。未复制其入口解析器或扩大执行授权。
- Linux、Node 20.3、隔离环境 11 文件/240 项通过，build:ts 通过。恢复旧 export parser、恢复旧 restore parser、开放确认候选、去掉空参数 Enter 守卫四组反转均失败；源码逐字节恢复后组合测试通过。真实 regular/fullscreen CLI 的非法 export/restore 参数保持目标文件字节与 mtime 不变；`/restore execute ` 明确报告 explicit-execute-intent-required，未创建 ledger，两模式 exit 0、无模型请求。
- import cycles/config consumers/declarations/node floor 通过；call reachability 7 个、NormProof 函数数量 5 个既有 advisory 不变，阻断义务通过。CMD-02 的 3fe750c7 CI 37364227880 成功；Architecture Watch 37364227869 失败的 annotation 明确为 hosted runner 多次未领取任务（runner_id=0、steps=[]），属于基础设施未执行，不计通过。b456a484 Architecture Watch 37365764084 成功，CI 37365764189 最近为 in_progress。
- CMD-03 仍未完成：累计迁移 trust/todo/thinking/export/restore，model/memory 及全量表其余语法、动态实体目录仍待实施。SAFE-02 与其余 Phase 19 任务继续；本批未替代 EDIT-03 的完整 undo/恢复产品流程。


### 8.23 CMD-03：memory 动作目录、契约与筛选校验

- [memory/commands/syntax](../../packages/ts-shell/src/memory/commands/syntax.ts) 由 memory owner 声明 inspect/stats、add/retain、list/review、approve/reject、recall/search、wake、use、invalidate、delete、save/status；既有五组契约解析器与 registry/help/completion 消费同一组定义，删除旧独立 memory 词表。共享语法支持动作专属 flags 及其与位置参数的互斥关系，approve 不接受 reject 的 --unsafe，指定 candidate 后不再建议 --all-safe。
- 顶层 `/recall`、`/retain` 在解释子动作之前保留独立 free-text 路径；`/memory add` 文本中的 flag 形状不被通用解析器改写。review 的 --all-safe/--unsafe 及既有 bare selector 保留；混用 candidate 与批量 selector 拒绝。wake/save/status/list/inspect 的多余参数、未知 flags 和非法 selector 不再被忽略；入口和直接调用的契约解析器均验证。
- delete 与 invalidate 继续进入各自 runner 操作；approve 只改变 review 状态，save 才执行批准候选持久化；use 继续为下一正常 turn 暂存，未改成即时注入或 record-ID 激活。复用既有执行器、审查状态与存储，没有新增 memory 系统。
- recall 的 kind/retention/source 校验共用 [candidate 枚举](../../packages/ts-shell/src/memory/projectMemoryCandidate.ts)，[存储记录校验](../../packages/ts-shell/src/memory/memoryPersistence.ts) 也消费这些值；保留对继承名称和未知值的拒绝。limit 必须为 1–20 的整数，拒绝截断、默认化或静默夹取非法值，重复筛选拒绝；普通含冒号的 query 不作为未知 flag 误拆。
- 定向对照参考 CLI 的参数值校验与 end-of-options，以及参考 memory 的独立按 ID 更新/删除、未找到记录时显式失败：采用明确动作/参数与失败边界，本项目额外保留失效标记、审批和暂存等现有独立语义。行为由既有 lifecycle/save/use runner 测试与新增入口测试共同验证，不以菜单名称代替运行时证据。
- Linux、Node 20.3、隔离环境 20 文件/286 项通过（含 memory 并发、持久化、review/save/recall/delete/use 与交互接线），build:ts 通过。恢复旧入口、save/review/recall 契约四组反转均失败；源码逐字节恢复后组合测试通过。真实 regular/fullscreen CLI 返回非法输入 blocked / Memory written: no；无记录的 use 明确无自动注入，两模式 exit 0、无模型请求。use 的长结果打开阅读面板，初始探针错误等待输入框/未变化标题；按实际面板关闭后重绘的输入框同步后通过，未改产品来迁就探针。
- import cycles/config consumers/declarations/node floor 通过；call reachability 7 个既有 advisory、NormProof 5 个既有函数数量 advisory，阻断义务通过。b456a484 两项远端检查 37365764189/37365764084 已成功；9d709ef4 两项 37367388417/37367388611 均因 hosted runner 多次未领取而没有运行步骤，不计通过。
- CMD-03 与阶段整体仍未完成：candidate/record 动态实体、筛选值补全属于后续目录接线；model 默认仍写全局配置，必须与会话覆盖/恢复一起实改；其余全量表、CMD-04、SAFE-02 与其他批次继续。


### 8.24 CMD-03：model 会话选择、恢复与严格语法

- [model syntax](../../packages/ts-shell/src/core/commands/model/syntax.ts) 声明 status/refresh/config/list/ls/use/set/help 及兼容帮助别名，直接 ID 规范化为 use。动作专属 --refresh/--global、额外参数、重复选项和 boolean 赋值在读写/网络动作之前校验；未知 list provider 拒绝。帮助、registry hint 与 [completion](../../packages/ts-shell/src/core/commands/model/completion.ts) 消费相同语法，删除原一级词表与按第一个空格猜测模型位置的逻辑。status/help/config/refresh 后不建议模型，list 只建议可识别 provider，use/set 与直接目标位置使用本地 catalog。
- 默认模型切换写入现有 session state 的 modelSelection，仅存 connectionId/provider/model，无凭据。[state](../../packages/ts-shell/src/session/model/state.ts) 复用已有锁与原子写入，锁内读取现存快照并保留其他字段；snapshot builder 保留选择。不存在或损坏的会话不得借此重建，全局配置不随默认切换写入。
- [projection](../../packages/ts-shell/src/session/model/projection.ts) 只覆盖匹配连接与 provider 的模型。请求 bridge 动态读取当前会话身份；正常请求、压缩等既有 bridge 消费者及独立 btw 路径采用会话模型。启动、会话切换、配置刷新、模型状态与 chooser 使用同一投影，不更改其他会话，也不把凭据复制到会话。连接切换后原模型偏好保留但不套到不同连接上。
- 显式 --global 先保存当前会话（如果存在），再调用既有全局配置写入；第二步失败报告“会话已切换、全局写入未验证”，不伪称双文件原子提交。全局配置既有多进程 lost-update 窗口未在此批解决。会话写入失败不尝试全局保存；没有会话的调用必须显式 --global 才允许改默认。
- 真实退出/重启探针发现只执行 model 命令的会话被空会话清理删除。现 [lifecycle](../../packages/ts-shell/src/session/lifecycle/sessionLifecycleWrites.ts) 保留具有显式模型选择的会话，普通空会话仍清理。切换/刷新同时保留启动时传入的 allowedTools、offline、instructionBudgetBytes 与显式 hook opt-in；这些覆盖沿用既有配置解析语义。
- 定向对照参考实现的“会话模型持久化、只有显式 persist 才更新全局默认”决定，采用相同范围分离。本项目偏好属于会话状态，不引入第二套会话事件存储；分支历史回退到过去模型不是本批承诺。默认全局写入、请求 bridge、snapshot 保留、候选位置四组反转实际失败，另补退出清理与启动限制两组反转；源码逐字节恢复。
- Linux、Node 20.3、隔离环境组合 23 文件/337 项通过，含 session manager、runtime/request bridge、交互与 print 接线；build:ts 通过。真实 regular/fullscreen CLI 验证默认切换的全局文件字节与 mtime 不变、非法 --global=false 拒绝、显式全局写入；退出后改全局默认并以 --session-id 重启，原会话模型仍恢复，两模式 exit 0，无模型请求。初始探针把短 status 误当 viewer，并在 fullscreen 等待未重绘的输入提示；修正探针等待实际结果，未改产品迁就同步。初次真实退出失败则是产品清理缺陷，已用上述修复和回归验证。
- import cycles/config consumers/declarations/node floor 通过；NormProof 阻断义务通过，保留 5 个既有函数数量 advisory。上一批 f66cf4c4 的 CI 37370095444 与 Architecture Watch 37370095429 已成功。本批远端结果须按新提交核验。
- **CMD-03 与 Phase 19 仍未完成**：其余命令全量表、memory 动态实体/筛选目录、CMD-04 目录身份和异步失效、SAFE-02 等继续。此批未宣称覆盖真实 provider 调用、真实 Windows Terminal 像素验收或跨文件崩溃原子性。


### 8.25 CMD-03：shell/statusline/settings/fast 参数与候选

- 四条命令分别由 [shell](../../packages/ts-shell/src/core/commands/shell/syntax.ts)、[statusline](../../packages/ts-shell/src/core/commands/statusline/syntax.ts)、[settings](../../packages/ts-shell/src/core/commands/settings/syntax.ts)、[fast](../../packages/ts-shell/src/core/commands/fast/syntax.ts) owner 定义合法动作、别名与参数，handler/help/registry 消费同源定义，删除对应独立补全词表和 shell 的首空格启发式。
- 共享参数增加有限 values 约束，[parameters](../../packages/ts-shell/src/core/commands/syntax/parameters.ts) 在验证已完成参数后仅为下一个合法位置生成枚举候选；补全使用允许缺失尾部必选参数的前缀验证，执行仍要求完整参数。动作比较兼容大小写，但输出保留 attentionOnIdle 的规范拼写。hint 保持短参数名，完整帮助可展开有限值。
- shell 的 backend 类型与语法共用领域 SHELL_BACKENDS，保留 diag/info、set、reset 以及大小写兼容。未知 backend、额外参数或 flags 在调用 ShellManager 前拒绝；status/auto 后不再建议 backend。真实后端可用性仍由既有 manager 判断，枚举候选不代表机器已安装该 backend。
- statusline 从现有 STATUS_ITEMS 取得合法 ID，保留空格/逗号选择、目录顺序与去重；空列表成员、未知 ID、list 多余参数拒绝且不写配置。补全支持当前 token 中 model,co，候选保留 model, 前缀并排除已选项。引号参数经 router 仍以一个 argv 值送入 owner 校验，不通过回显非法文本来证明这一点。
- settings 只枚举并解释 attentionOnIdle/offline，拒绝其他键和附加值，不冒充通用设置写入器。fast 保留 on/off/toggle、enable/disable/1/0；拒绝多余输入，注册说明改为温度偏好，不再承诺模型服务等级或低延迟。存储失败明确写入未验证，不再声称已启用且仅在进程内生效；本批未改写既有 project state 存储机制。
- 定向对照参考补全的声明式动作定义、仅在合法 server-name 动作之后枚举实体的决定，采用同样的位置约束；本项目进一步共用执行参数枚举与前缀验证。四个旧 handler 分别反转均使新增测试失败，源码逐字节恢复。
- Linux、Node 20.3、隔离环境组合 14 文件/258 项通过，build:ts 通过；真实 regular/fullscreen CLI 验证非法 shell/settings/fast/statusline 输入拒绝，已有 fast 与状态栏配置的字节/mtime 不变，合法 model,cost 保存，两模式 exit 0、无模型请求。旧错误文案断言按安全错误类别更新；新增 co 前缀测试初始漏写合法 context 候选，修正为同时验证 context/cost，未缩减产品候选。
- import cycles/config consumers/declarations/node floor 通过；call reachability 7 个与 NormProof 函数数量 5 个既有 advisory 不变，阻断义务通过。49e688c2 Architecture Watch 37372368971 已成功，CI 37372368967 最近为 queued，未计通过。
- CMD-03 仍未完成：其余命令语法及动态目录继续，CMD-04、SAFE-02 和 Phase 19 后续批次继续；没有以本批四条命令的验证覆盖全量表。


### 8.26 CMD-03：会话导航动作校验与同源帮助

- [navigation/syntax](../../packages/ts-shell/src/core/commands/navigation/syntax.ts) 声明 resume/fork/tree/entries 的动作、别名与位置参数。resume 的普通对象模式表已删除，constructor/__proto__/toString 仅作为普通会话引用进入既有解析器，不再变成继承来的 sessionAction。多余参数、未知 flags 与缺失 fork 目标返回本地错误，不生成切换/复制动作。
- resume/switch 保留实际执行器支持的 ID、前缀、标题与 last/latest 引用，带空格的标题须为单个引号参数。fork 则保持直接 session ID 或 here 的语义，对路径分隔符、点目录等非法 ID 在动作生成前拒绝。不能把两种引用模型统一为只允许 ID：初步校验曾过窄，经执行层对照后已修正并补标题回归。
- tree 的合法单个 entry-id 仍由既有导航器处理；entries 的独占 cursor、tree 子树与 unknown-cursor 行为不变，但所有参数先校验，再读取 transcript/thread。帮助可在没有活跃会话时读取。对应 registry 候选、hint 和会话命令地图消费同一语法，增加 fork 与 here 候选；未伪造动态 session/entry IDs。
- 共享帮助支持默认动作的位置参数，确保 `/fork <session-id|here>` 等输出包含命令与参数间隔。短 hint 也包含直接引用形式；删除原 resume 补全词表及手写会话动作地图，保留关于标题引号和 fork/tree 差异的语义说明。
- 定向对照参考交互入口：裸 resume/fork/tree 分别打开明确选择器，没有把任意后缀自动视为同一动作。本项目保留已有显式 ID/title 接口，以严格参数校验和明确 shell-action handoff 达成同样的动作边界，不照搬其只支持裸命令的接口。
- Linux、Node 20.3、隔离环境组合 13 文件/257 项通过，build:ts 通过。旧 resume/entries/tree handler 三组反转均失败，源码逐字节恢复后组合测试再次通过。真实 regular/fullscreen CLI 验证非法 fork 不创建新 session，非法 resume/tree/entries 参数不改变当前会话指针，两模式 exit 0、无模型请求。
- import cycles/config consumers/declarations/node floor 通过；call reachability 与 NormProof 既有 advisory 不作为完成证据。49e688c2 的 CI 37372368967 失败但 steps=[]，annotation 明确为 hosted runner 多次未领取任务；其 Architecture Watch 37372368971 成功。b05da528 的 Architecture Watch 37373559916 成功，CI 37373559892 最近 queued，未计通过。
- CMD-03 尚未完成：动态 session/entry、memory 实体/筛选目录及其余命令表继续；CMD-04、SAFE-02 与阶段后续批次仍开放。本批不改变会话恢复安全边界、文件恢复或真实模型调用流程。


### 8.27 CMD-03：workspace/MCP/permissions/view 动作边界

- workspace/cd、mcp、permissions、view 分别由 core/commands 下的领域 syntax/command 模块拥有；原 shellActionRuntime 保留兼容导出，registry 提示与固定候选消费同一语法，删除独立词表。未知动作、flags、多余参数在 shell action 交接前拒绝。路径、server 与 grant label 保留大小写及引号中的空格；多词目标必须引用，`--` 后允许字面 dash-leading 路径。
- permissions 的 reset/clear 只接受省略或显式 all。直接 CLI runner 也先校验，修复 reset typo 静默清除当前项目授权的问题；默认项目范围和显式全部范围各自保留，revoke 仍消费既有稳定 scope/label/index 选择器，没有新增授权或确认语义。
- MCP 保留 tools、doctor/diagnose、refresh/reconnect 及可选单 server；view 保留 user/compact、developer/verbose/dev。定向对照参考命令补全先识别合法 MCP 动作再查询目录的决定，本批只接入合法语法和固定候选，动态 server/path/grant 目录另续。
- Linux、Node 20.3 隔离环境 11 文件/213 项通过，构建通过。恢复旧 shell handlers 和旧权限 runner 两组反转均产生对应行为断言失败，源码恢复后组合套件通过。真实 regular/fullscreen CLI 的非法输入保持授权文件字节和 mtime 不变，默认 reset 保留另一个项目，显式 reset all 清空剩余，两模式 exit 0、无模型请求。
- import cycles/config consumers/declarations/node floor 通过；call reachability 7 个既有 advisory，NormProof 阻断义务通过且保留 5 个既有函数数量 advisory。上一提交 0b76ddb4 的 Architecture Watch 37375146977 成功，CI 37375146972 最近仍在测试步骤，尚不计通过。
- CMD-03 全量表、动态目录、CMD-04、SAFE-02 与其余 Phase 19 任务仍未完成。


### 8.28 CMD-03：诊断命令参数与归档零写校验

- log/metrics/report/crash 各自拥有 syntax 定义；执行、registry 提示与候选消费同源参数，删除 log 独立词表。log 保留默认 tail 30、纯数字简写、path/export/clear/help；metrics 默认聚合最近 2000 条 metric 记录，参数命名为 records，避免暗示原始日志行数。两者只接受正的安全整数，拒绝小数、指数、Infinity、NaN、零、负数及尾随垃圾，不再默认化或截断。
- report 对未知/重复/boolean 赋值 flags 与额外目标先拒绝，再读取诊断数据或写归档；支持 `--` 后字面 dash-leading 路径。保留既有用户数据目录默认目标、外部绝对路径策略、共享脱敏器与 ZIP 内容，不引入另一套归档或写策略。log 的目标与当前日志族保护仍由既有 sink 执行；本批没有改变其外部路径策略。
- crash 只接受一次 boolean --stack；额外参数拒绝。原测试要求 extra 与 --stack 共存，归类为旧预期，改为验证合法 flag 的真实 stack 输出，并增加 extra/unknown/重复/赋值拒绝。首轮另发现 log help 被误拒绝，属于本批回归，已恢复明确 help 动作与同源帮助，未放宽未知动作。
- 共享 parser 自动识别唯一无名动作的直接参数形式；补全在合法直接路径后提供 flags，拒绝多余路径后候选且不越过 --。无名且无参数动作不再生成空方括号提示。定向对照参考 CLI 的缺值/枚举显式错误决定，继续使用本项目已有严格 parser，不复制入口解析器。
- Linux、Node 20.3 隔离环境 12 文件/231 项通过，build:ts 通过。四组恢复旧 handler 的反转均为行为断言失败，源码逐字节恢复后组合套件通过。真实 regular/fullscreen CLI 的非法 report 输入保持目标字节与 mtime 不变且不写默认归档，合法字面路径写出 ZIP，两模式 exit 0、无模型请求。
- import cycles/config consumers/declarations/node floor 通过；call reachability 7 个既有 advisory，NormProof 0 个阻断义务未满足、5 个既有函数数量 advisory。1863db35 的 Architecture Watch 37376481017 成功，CI 37376481131 最近为 in_progress；0b76ddb4 的 CI 37375146972 最近仍在测试，均未计通过。
- CMD-03 其余全量表与动态目录、CMD-04、SAFE-02 和阶段其余任务继续，未标记整体完成。


### 8.29 CMD-03：workflow/warmup/sidebar 同源契约

- workflow 的 list/templates、run/start、status 由 core/workflow/syntax 定义；未知动作/flags/多余参数在信任读取与定义执行之前拒绝。有效 run 仍由既有工作流 runner 执行，保留项目信任限制及实际步骤结果，不以补全接受替代执行证据。
- startup owner 的 warmup status/rebuild 与 sidebar owner 的 panel/compact/detail/snapshot/watch/live 接入现有 parser；共享定义驱动 registry 提示/候选与错误帮助，移除三份独立词表。兼容别名 watch/live 明确描述为单次快照，不暗示持续监听；panel 密度与 snapshot 单帧契约保持。动作采用共享大小写规则，空字符串非法输入不再被当成默认 status。
- 对照参考命令目录从 subcommand 定义生成候选/描述/usage 的决定，本项目进一步让执行 parser 消费同一声明；没有移植其他项目的工作流执行器或增加第二套 sidebar 状态。
- Linux、Node 20.3 隔离环境 20 文件/236 项通过，build:ts 通过。恢复旧 workflow handler 后，非法额外参数实际执行了夹具中的写文件步骤；warmup/sidebar 旧契约也各使对应共享动作断言失败。逐字节恢复后组合测试通过。真实 regular/fullscreen CLI 非法 workflow 无标记文件，合法 start 执行同一定义并写出标记；warmup/sidebar 多余参数 blocked，两模式 exit 0、无模型请求。
- import cycles/config consumers/declarations/node floor 通过；call reachability 7 个既有 advisory，NormProof 阻断义务通过、5 个既有函数数量 advisory。3d1b6fec Architecture Watch 37377064741 成功，其 CI 尚待终态。
- 0b76ddb4 CI 37375146972 失败：5861 项通过、1 项失败、1 项跳过。唯一失败是 CLI baseline 仍用未引用的多词会话标题，与 §8.26 单参数标题契约不一致；按旧测试输入更新为引用标题，保留切换目标、摘要和无歧义断言，更新后隔离环境 CLI baseline 全部 40 项通过（调用参数被 npm 消费而实际运行了整个 baseline 文件，故按实际范围记录）。CMD-03 全量表、动态目录、CMD-04、SAFE-02 和阶段其余任务仍继续。


### 8.30 CMD-03：生态命令语法与注册表持久化结果

- plugin/marketplace 各自由领域 syntax 声明动作、真实别名和必选参数，registry 提示与固定候选同源；额外参数、未知 flags 在登记/删除/启停之前拒绝。plugin install/uninstall/find、marketplace ls/rm/delete 保留，search 的自由文本 query 继续返回目录服务尚不可用的解释，不虚构搜索结果。
- 检查发现旧 plugin 保存吞掉错误、修改模块级缓存后仍报成功。现 plugin/store 拥有类型、读取、锁和原子发布，兼容入口只 re-export；每次读取当前文件，所有修改在既有文件锁中读取并写入，删除模块级缓存与静默保存失败。不存在文件是空注册表，损坏 JSON/结构拒绝而不覆盖；manifest 字段先校验字符串。失败报告 requested change not confirmed saved，不返回 registered/marked 成功。
- 对照参考设置存储的锁内重读再更新决定，复用本项目已有 withFileLock/writeJsonFileAtomic，而非新增锁或缓存系统。注册仍仅记录地址/manifest；没有下载、加载代码或实现目录搜索，生态运行能力仍由后续批次负责。
- Linux、Node 20.3 隔离环境 14 文件/248 项通过（含 picker 接线），build:ts 通过。恢复旧 plugin/marketplace handler 两组反转使额外参数、失败写入和外部状态读取断言失败。初次 fs.renameSync 故障 mock 没有命中模块，归为测试注入边界问题；改为既有原子写入函数注入，验证每种修改失败后文件与后续读取均不变。
- 真实 regular/fullscreen CLI 验证非法禁用/删除零写，合法 disable 持久化，损坏注册表不会被下一次 add 覆盖；两模式 exit 0、无模型请求。import cycles/config consumers/declarations/node floor 通过；7 个 call reachability 与 5 个 NormProof 函数数量既有 advisory 保留，阻断义务通过。
- 1863db35 CI 37376481131 失败（5882 通过、1 失败、1 跳过），唯一失败仍为 §8.29 已修正的多词标题测试输入；43db5468 Architecture Watch 37377909807 成功，CI 37377909797 尚待终态。CMD-03 其余语法/动态目录、CMD-04、SAFE-02 与阶段其余任务仍未完成。


### 8.31 CMD-03：goal 自由文本与 brainstorm flags

- goal 的 pause/resume/complete/done/clear 与自由文本声明同源；只有单个保留 token 才是状态动作，以 pause 等词开头的多词目标仍为正文，正文中的 --word 不被解释为选项。registry 提示与别名候选来自语法，原提示测试改为检查目标文本及真实动作，不再要求仅有必填目标的旧提示。
- goal 保存失败原文错误声称目标已设定且会在进程结束后丢失，但实现没有对应内存状态。现报告 change not confirmed persisted，不以成功标题掩盖失败；项目状态存储的非原子写与并发问题未在本批解决，不能据失败文案宣称跨进程原子性。
- brainstorm 采用共享严格 flags；支持 interactive/i、save/s、help/h，拒绝未知、重复、boolean 赋值及 interactive/save 冲突。两模式此前混用会静默丢弃保存意图，现明确拒绝。`--` 后保留字面 flag 形状正文，save 仍只是带写入要求的模型 prompt，未创建文件或声称写入成功。
- CommandFlag 增加显式 short 字段，原生 parseArgs 处理短选项；候选从相同定义生成短/长形式并遵守重复与冲突限制。定向对照参考 CLI 的 -- 后字面参数与短帮助选项决定，复用既有 parser，不增加独立 flags 系统。
- Linux、Node 20.3 隔离环境 14 文件/242 项通过，build:ts 通过。恢复旧 goal/brainstorm handler 两组反转使失败结果、未知/冲突 flags 和字面正文断言失败；逐字节恢复后组合套件通过。真实 regular/fullscreen CLI 验证多词目标、done、非法 brainstorm 零模型请求和真实失败写入报告，两模式 exit 0。
- import cycles/config consumers/declarations/node floor 通过；7 个 call reachability 与 5 个 NormProof 函数数量既有 advisory 保留，阻断义务通过。a30053cc Architecture Watch 37378532495 成功，CI 37378532481 尚待终态；43db5468 CI 37377909797 也尚未完成。CMD-03 的 loop 原始命令/预算、connect/browser/compact、其余命令及动态目录继续；CMD-04、SAFE-02 与阶段整体未完成。


### 8.32 CMD-03：loop 次数与原始 gate 参数

- loop owner 定义次数范围、默认值与示例候选，registry 提示和入口共用；共享 integer 参数支持 maximum。次数只接受 1–10 的安全整数，拒绝 parseInt 截断、小数、指数、非有限值、负数及越界，旧静默夹取 99 到 10 的测试改为明确拒绝。3/5/10 只是建议值，7 等其他合法值仍接受。
- 只有次数而没有 gate 时拒绝，删除隐式 npm test；非法输入在 preflight 之前返回 local，不执行用户未明确提供的命令。仅解读原始文本的第一个 token，余下交给 shell 语法，保留引用参数、注释与 here-document，不重新 tokenize shell 正文。带数字开头的 token 属于次数位置；需要以此开头的 shell gate 可显式先给合法次数。
- 通知说明次数是请求给模型的修复次数，实际强制边界仍为运行时 turn budget。此批未实现 AUTO 共享预算/自主调度，也没有把原有 preflight child_process.exec 或 workflow runner 接到统一 execution service；这两处既有执行路径偏差需在后续执行接线中修正，不能把参数范围校验计作执行预算完成。
- 沿用此前参考 CLI 的原始参数/-- 语义比较，本命令有 shell 独立语法，故只解析前导次数，不把 gate 的 flags 送入普通选项 parser。Linux、Node 20.3 隔离环境 14 文件/245 项通过，build:ts 通过；恢复旧 handler 的反转使非法数字、缺失 gate 与通知断言失败，逐字节恢复后组合套件通过。
- 真实 regular/fullscreen CLI 输入非法次数和仅次数时未生成执行标记；带引用参数的合法 gate 通过，两模式 exit 0、无模型请求。import cycles/config consumers/declarations/node floor 通过；7 个 call reachability 与 5 个 NormProof 函数数量既有 advisory 保留，阻断义务通过。
- 43db5468 的 CI 37377909797 与 Architecture Watch 37377909807 均成功，标题测试修正取得远端证据。300ea7a4 Architecture Watch 37379100679 成功，CI 37379100643 尚待终态。CMD-03 剩余语法/动态目录、CMD-04、SAFE-02 和 Phase 19 整体继续。


### 8.33 CMD-03：connect 登录与连接动作校验

- connect owner 声明 help/status/list/presets/login/set/use/activate/logout/remove/rm、参数和动作专属 flags；入口、四个直接导出的写入函数、帮助、registry 提示与固定候选消费同一语法。删除宽松 parseArgsWithFlags 与独立词表，未知/重复/boolean 赋值/额外参数在认证或配置写入之前拒绝。
- API key、account、browser 登录方式互斥；account/browser 不再静默忽略 base-url/model，label 仍允许。key 与 api-key 归为同一选项，重复别名拒绝；支持 inline 值。set 兼容路径转发 key 使用 inline 形式以保留 dash-leading 值；use/logout/set 消费解析后的字面参数，支持 -- 边界。错误只返回参数类别，不回显输入凭据。
- provider/preset 候选来自现有 CONNECT_PRESETS 与真实兼容别名，仅在 login/set 的 provider 位置生成；凭据值不提供候选，认证方式与覆盖选项互斥后不再建议。实际 auth 支持与状态仍由既有认证 owner 判断；本批未改 provider/auth 核心，也未访问真实配置。
- 对照参考 CLI 的缺值/枚举诊断与 -- 字面参数决定，复用本项目严格 parser；没有复制认证流程。Linux、Node 20.3 隔离环境 14 文件/264 项通过，build:ts 通过。恢复旧 handler 与其 parser 的反转产生认证流程被调用、非法输入写成功及直接调用校验的行为断言失败；逐字节恢复后组合套件通过。
- 真实 regular/fullscreen CLI 的非法组合与额外参数保持配置字节及 mtime 不变，合法 inline 合成 key 保存成功，两模式 exit 0、无模型请求。新增测试曾错写既有激活成功文案，按实际 Active connection switched 修正，未改产品输出或弱化状态断言。
- import cycles/config consumers/declarations/node floor 通过；7 个 call reachability 与 5 个 NormProof 函数数量既有 advisory 保留，阻断义务通过。a30053cc 的 CI 37378532481 与 Architecture Watch 37378532495 均成功；0bb9d3ed Architecture Watch 37379835823 成功，CI 37379835922 尚待终态。CMD-03 其余命令/动态连接 ID、CMD-04、SAFE-02 与 Phase 19 整体仍未完成。


### 8.34 CMD-03：browser 分层语法与确认隔离

- browser/command/syntax 按顶层、action、replay/cache、repair 的既有 owner 分支定义语法；四组契约 parser、registry 提示与分层补全消费同源定义，删除独立 browser 词表和 actionKind 私有字符串判定。smoke/runtime/status、cache status/compact/repair 的多余参数及 navigate 多 URL 不再被忽略。
- replay receipt 与 repair proposal/manifest 保留完整输入，不再把多个参数拼成 ID 或截断长 ID/路径到另一个目标。repair 严格识别 manifest/confirm，缺值、重复、boolean 赋值和额外 proposal 参数拒绝；userConfirmed 只由实际 confirm 输入产生，候选永不提供 --confirm。执行审批、能力阻断与缺目标风险仍由既有 policy/runner 负责。
- 补全沿 preview/dry-run/execute action、replay cache、repair apply 分层；runtime 的 status 值来自定义。原有受策略阻断的 action 仍可检查，其候选说明明确为 policy-blocked，不暗示拥有执行能力。对照参考声明式子命令生成候选/描述的决定，复用共享机制并按本项目分层组合，没有新建浏览器执行器。
- Linux、Node 20.3 隔离环境 68 文件/377 项通过，1 文件/9 项既有集成测试跳过，build:ts 通过。分别恢复旧顶层/action/replay/repair parser 的四组反转均产生解析或精确目标断言失败；逐字节恢复后组合套件通过。套件曾输出 exit listener 数量警告，本批未改变监听器生命周期或据此宣称已修复。
- 真实 regular/fullscreen CLI 对非法 smoke/runtime/cache/repair/navigate 输入报告 blocked，指定 manifest 字节与 mtime 不变，两模式 exit 0、无模型请求。未据此声称覆盖额外环境下的真实浏览器集成。import cycles/config consumers/declarations/node floor 通过；7 个 call reachability 与 5 个 NormProof 函数数量既有 advisory 保留，阻断义务通过。
- 462b2b92 Architecture Watch 37380581074 成功，CI 37380581115 尚待终态。CMD-03 的 compact、多项零参数与自由文本/实体目录、CMD-04、SAFE-02 以及阶段整体仍未完成。

- §8.34 补充：1ce014d1 的 NormProof 阻断义务通过，但详细报告另有全依赖图环 advisory（actionContract → command/syntax → syntax/projection → commands/types → browser 类型）。常规 import-cycles 未报告此混合类型依赖环。已把 browser 补全投影移至 command/completion，纯 syntax 不依赖投影；重跑 NormProof 明确 source_graph_is_acyclic 与 imports resolve 均 satisfied，保留原 5 个函数数量 advisory。该发现不能当作原提交无环证据。


### 8.35 CMD-03：compact 语法与真实压缩入口守卫

- compact owner 的 syntax 统一声明 preview/render/json、自由指令和元数据 flags，契约、交互路由与 registry 提示/候选共享定义；删除最后一份固定动作词表 argumentCompletions。补全投影独立于纯语法，避免通过 commands/types 引入混合类型依赖环。
- 修复 /compact --preview=false、--json=false、--render=false 或未知 flags 被静默丢弃后进入 compactHistory 的风险。交互路径只有合法的裸命令/自由指令进入真实压缩；元数据和只读形式交给 artifact 路径，非法输入报告 blocked。旧 --verbose 静默丢弃测试归类为 stale expectation，改为无压缩调用断言；显式 -- 后的内容作为字面指令保留。
- 共享 flags 支持显式 repeatable，其他选项仍拒绝重复及重复别名；constraint 按输入顺序保留，模式冲突、boolean 赋值、未知/缺值和无效 source 拒绝。元数据值不再冒充位置模式或 Custom instructions，例如 --goal json 不会选择 JSON 输出。已选择位置模式后不再补入冲突的模式 flags。
- 对照参考 CLI 的 -- 字面余参、缺值与枚举拒绝决定，复用本项目 parser；重复值是 compact 既有契约，未把多个约束压成最后一个值。既有 preview/render/json 不生成 checkpoint、不暂存下一轮注入的行为保持。
- Linux、Node 20.3 隔离环境 30 文件/284 项通过，build:ts 通过；恢复旧交互 parser 和旧 artifact 契约的两组反转分别触发无压缩调用/非法参数拒绝断言失败，逐字节恢复后组合套件及构建通过。regular/fullscreen 真实 CLI 拒绝六组非法参数、接受重复 constraint 预览，未输出 Condensed，工作区标记字节及 mtime 不变，两模式 exit 0；历史压缩未调用的直接证据来自路由测试。
- import cycles/config consumers/declarations/node floor 通过。NormProof 详细报告 source_graph_is_acyclic 与 imports resolve 均 satisfied，既有 5 个函数数量和 7 个 call reachability advisory 保留。
- 300ea7a4 的 CI 37379100643、0bb9d3ed 的 CI 37379835922、462b2b92 的 CI 37380581115 均成功，对应 Architecture Watch 亦成功。dfb81fce 的 Architecture Watch 37381706985 成功，CI 37381706966 在本次查询时仍运行；不把它计为通过。
- 本批未统一非交互默认真实压缩（PAR-01），也未完成 CMD-03 的剩余零参数/自由文本/实体目录、CMD-04、SAFE-02 或 Phase 19 整体。


### 8.36 CMD-03：无参数命令的动作边界

- diagnose/cancel/pwd/help/exit/clear/reload/init/cost/undo/retry/hotkey/context/timings 共 14 个入口复用 syntax/empty 的无参数契约校验。未知 flags、boolean 赋值、位置参数及 -- 后的额外参数被拒绝，不再静默忽略后读取状态或发出动作。裸命令保持现有能力，单独 -- 仅结束选项且不添加动作参数。
- clear/retry/exit/cancel 的直接入口拒绝非法参数后返回 local 诊断，不发出清空、重试、退出或取消动作；reload 在 refreshRuntimeConfig 之前拒绝。registry 将 exit/diagnose 的完整参数传入 owner，不在中央注册表积累安全判断。undo 的 --hard/--discard 既有退役迁移说明继续保留，其余无效参数不读取恢复记录。
- 结合先前参考 CLI 明确拒绝非法选项/保留 -- 字面边界和声明驱动候选的比较，复用共享 parser；无参数命令不凭空生成参数候选，也不添加新的确认流程。本批只修复输入边界，不扩展 init 写入或 undo 执行能力。
- Linux、Node 20.3 隔离环境 17 文件/292 项与 build:ts 通过。测试用禁止属性读取的 context 验证拒绝发生在状态读取之前，并直接验证动作入口和 reload 零调用。取消共享守卫的反转使动作/刷新/交互结果断言失败；逐字节恢复后 292 项再次通过。
- 真实 regular/fullscreen CLI 输入 10 组非法命令，均报告 Invalid，会话指针字节、工作区标记字节及 mtime 不变，进程继续运行，最终合法 exit 退出码为 0。import cycles/config consumers/declarations/node floor 通过；NormProof 详细报告无环与导入可解析均 satisfied，既有 5 个函数数量、7 个 call reachability advisory 保留。
- f1109ed9 的 Architecture Watch 37382653798 成功，CI 37382653783 在本次查询时仍运行。CMD-03 剩余自由文本/实体目录、CMD-04、PAR-01、SAFE-02 与 Phase 19 整体继续，不以无参数入口验证覆盖后续能力。


### 8.37 CMD-03：theme/skill/tools 的单实体参数

- 三个命令 owner 声明并消费共享 entitySyntax，registry 从相同定义生成参数提示。多余名称、未知 flags、空名称在目录读取/工具池请求/主题选择之前拒绝；不再只取首参数后忽略其余输入。带空格的引用名称和 -- 后的 dash-leading 名称保持完整；实际名称查找继续由原目录负责。
- 新边界测试发现共享 parseSyntax 把显式空字符串误认作内部默认动作标记，导致空名称执行列表读取。归类为 product behavior drift，单默认动作现在始终在内部添加标记，唯一手动添加的 cd 调用点改传原始 args；多动作 goal/compact/replay 的显式分派保持。单默认动作的提示去除重复外层方括号，实体提示恢复为 [name]。
- 对照参考声明驱动参数提示、合法位置先于目录访问的决定，复用现有 parser 与目录 owner；未增加每键磁盘扫描或独立实体缓存。动态 theme/skill/tools 候选仍需 CMD-04 的会话/项目/启用状态快照，不能以本批语法修复宣称完成。
- Linux、Node 20.3 隔离环境 17 文件/283 项和 build:ts 通过。将主题输入退回只取首项的反转导致未切主题断言失败，恢复后组合套件再次通过。regular/fullscreen 真实 CLI 拒绝非法实体输入，dark 仍为活动主题，会话指针及工作区标记不变，退出码为 0。探针首次误匹配已被 renderer 去掉的 Markdown 反引号，按实际渲染文本修正后通过，未改产品输出。
- import cycles/config consumers/declarations/node floor 通过，NormProof 详细报告无环/导入可解析均 satisfied；既有 5 个函数数量、7 个 call reachability advisory 保留。
- dfb81fce 的 CI 37381706966 已失败：唯一失败是 browser cache multiprocess concurrent execute writes 中 1 个子进程超时（2 passed/1 blocked/1 timedOut）。当前隔离环境独立复跑 scenarios.test.ts 的 6 项通过，但尚不能确认远端超时根因，未将原失败计作成功。b0829c90 的 Architecture Watch 37383202296 成功，CI 37383202315 查询时仍运行。
- CMD-03 其余自由文本声明/动态实体，CMD-04、PAR-01、SAFE-02 及阶段整体继续。


### 8.38 CMD-04：首批动态目录与候选请求生命周期

- interactive/completion 分离 request、catalog、controller：仅 theme/skill/tools 的合法实体位置读取动态目录，支持 skills 别名，普通文本及额外参数不触发。原静态 slashSuggestions 保持同步；当前输入层接收动态结果后主动重绘，不要求再按一次键。
- 目录复用 themes、resolveSkillCatalog 与实际 toolPoolFor owner，保留外部主题路径、noSkills/skillPaths/信任过滤、MCP 和 allowed/disabled/hidden 工具过滤。MCP 不可用时报告目录 unavailable，不把缺少 MCP 的核心工具列表冒充完整成功；异常正文不进入候选状态。候选读取不触发选择、安装、认证或写入。
- 每个表面持有缓存，身份包括 cwd/project/session、技能选项、主题路径、工具启用/可见性以及会话权限/模式；每次输入取消旧发布，命令提交/返回、选择器完成、权限/模式改变和退出失效缓存。显式刷新也断开刷新前的进行中读取复用。75ms 防抖、1500ms 等待上限、5000 目录候选上限与 100 个显示候选；成功缓存 15 秒、失败缓存 3 秒，查询变化复用目录，慢工具快照读取在相同身份下复用。
- 发布同时校验请求 epoch、上下文身份、草稿 revision/文本/光标，迟到结果和超时后的成功不安装。状态分开显示 loading/no matching entries/unavailable/timed out。接受沿用 snapshot-bound edit，空格名称自动引用，dash-leading 名称必要时插入 --；Tab 只接受不执行。
- 对照参考 autocomplete 的 Awaitable 回调和 signal 传播，以及合法动作位置先于实体查询的决定；本项目用每表面 controller 承接现有同步键盘路径，没有让每键等待远端目录。取消当前候选等待/发布已有直接测试；底层 MCP owner 暂无 AbortSignal 读取接口，不能据此声称物理终止了其底层工作。
- Linux、Node 20.3 隔离环境 8 文件/139 项与 build:ts 通过，覆盖迟到结果、光标/项目切换、取消/超时、上限、失效、禁用技能、工具可见性、进行中读取复用、实际输入层主动重绘及 Tab 不执行。移除版本守卫的反转触发迟到发布断言失败，恢复后组合通过。真实 regular/fullscreen CLI 自动展示外部 Night Harbor 主题和用户技能，Tab 保留引用名称且未执行，Enter 才选择/读取，工作区标记不变、退出码 0。
- import cycles/config consumers/declarations/node floor 通过；NormProof 全图无环及导入解析 satisfied，既有 5 个函数数量、7 个 call reachability advisory 保留。
- b0829c90 的 CI 37383202315 与 Architecture Watch 37383202296 均成功。f1109ed9 的 CI 37382653783 失败于相同 browser cache concurrent CLI 场景（1 passed/2 blocked/2 timedOut）；原 dfb81fce 的超时根因仍未确认，后续绿灯不覆盖此前失败。41af8323 Architecture Watch 37384091517 成功，CI 37384091556 查询时仍运行。
- CMD-04 仍未完成：session/entry、memory record/candidate、grants、MCP servers、连接及文件/目录位置等尚未接入本生命周期，外部目录变动目前通过显式操作失效或 TTL 刷新而非完整版本事件；底层 MCP 可取消读取亦待处理。CMD-03 自由文本提示及其余 Phase 19 任务继续。


### 8.39 验证修复：浏览器缓存并发源码 CLI 期限

- 对 §8.37/38 两次远端失败进一步定位：test-utils/browser/cache 夹具把完整 Node/TSX 源码 CLI 启动与执行限制为 8 秒，包含冷转译。单 CPU、TSX_DISABLE_CACHE=1、隔离 HOME/USERPROFILE 的三进程相同场景中，放宽探针期限后源码进程均成功但各耗时 13.08–13.15 秒；已构建 CLI 为 4.25–4.30 秒。恢复 8 秒则三进程全部在约 8.24 秒 timedOut、无输出且缓存为空，复现同类失败。这是源码测试启动期限不足的直接证据，不是缓存写入失败的证据。
- 仅把该缓存夹具默认进程期限调到 20 秒，三条包含多进程/多阶段的场景外层期限调整到 45 秒；显式 timeoutMs 仍可覆盖。浏览器 external runner 原有至少 1200ms 动作期限、缓存锁、安全断言与产品默认均未修改。修复后同一单 CPU 冷源码实验三进程分别 12.73/12.77/12.91 秒正常退出，无 timeout；重复同键记录仍报告既有 integrity warning，不伪称全健康。
- 测试进程 owner 原先只发 SIGTERM，忽略信号的子进程会一直等待。对照参考子进程超时强制终止与关闭管道的决定，harness 现在先终止、250ms 后升级 SIGKILL；POSIX 仅向新建的子进程组发信号，Windows 仍针对直接子进程，未宣称覆盖 Windows 子孙树清理。处理 stdin 提前关闭错误，并区分直接命令/TSX 执行证据。
- 缓存失败报告新增每进程 durationMs/deadlineMs/exit/signal/timedOut，继续不输出原始进程内容。Linux、Node 20.3 下 5 文件/20 项通过，build:ts 通过；忽略 SIGTERM 的独立真实进程被升级终止，仍报告 timedOut 且非成功退出。移除强制升级的反转触发失败，测试夹具自行结束以避免残留进程，恢复后组合通过。
- import cycles/config consumers/declarations/node floor 与 docs drift 阻断门通过，NormProof 无环/导入可解析 satisfied；既有 5 个函数数量及 7 个 call reachability advisory 保留。没有改 CI 工作流、package scripts 或通过跳过并发场景绕过失败。此轮是本地重现与修复证据，远端是否解决仍以新提交 CI 为准；dfb81fce/f1109ed9 原失败不改写。
- 41af8323 两项远端检查成功；e64f75ab Architecture Watch 37385544101 成功，CI 37385544106 查询时仍运行。Phase 19 其余 CMD-03/04 与后续批次继续。

### 8.40 CMD-04：会话与条目动态目录

- resume/session/sessions、fork、tree 与 entries 的合法目标位置从导航 owner 语法识别；list/current/help 等固定动作及多余参数不触发目录读取。保留静态动作候选，加载目录时不会暂时丢掉 switch/here/help 等已有入口。
- session 复用 SessionManager 的近期会话读取，标题用于匹配、完整 ID 用于接受；entries 使用真实 transcript event ID，entries tree 使用线程节点 ID，tree 仅提供现有只读导航查询认为可导航的节点。没有新增切换、恢复或持久化路径。
- 复用 §8.38 的每表面缓存、草稿/上下文身份守卫与主动重绘；实际输入层把当前 SessionManager 传入目录 owner。候选读取前后持久化会话元数据、线程状态与转录的字节及 mtime 保持不变。参考声明驱动合法位置和异步候选的决定继续沿用。
- Linux、Node 20.3 隔离环境 8 文件/98 项及 build:ts 通过。把会话 ID 截断并移除不可导航过滤的反转使两条具体断言失败，逐字节恢复后组合 98 项再次通过。真实 regular/fullscreen CLI 按标题补全完整会话 ID，Tab 后当前会话指针不变，Enter 后切换到目标；随后 tree 接受该会话的完整条目 ID，退出码均为 0。
- fullscreen 探针首次用通用文本匹配到了会话摘要，导致过早发送 Tab；改为等待菜单专属文本后两模式通过，没有改变产品等待时序来迎合探针。import cycles/config consumers/declarations/node floor 通过；NormProof 无环与导入解析 satisfied，既有 5 个函数数量 advisory 保留。
- e64f75ab 的 CI 37385544106 和 Architecture Watch 37385544101 均成功。708c3ceb 的 Architecture Watch 37386714984 成功，CI 37386715107 查询时仍运行，缓存期限修复尚不计远端成功。
- CMD-04 的 memory/grants/MCP/连接/文件目录等其余目录、外部目录版本事件与底层取消继续；CMD-03 其余声明及 Phase 19 整体未完成。

### 8.41 CMD-04：MCP 名称与授权稳定键目录

- mcp tools/doctor/diagnose/refresh/reconnect 的合法 server 位置接入配置 owner；读取当前 cwd 的用户/项目合并目录，沿用项目显式不信任过滤与项目覆盖优先级。候选只包含完整名称、作用域和 configured/disabled 状态，不展示 command/args/url，也不把 configured 表示成 connected。
- 名称补全不调用 gateway.snapshot/refresh，因为 snapshot 会尝试连接服务；本批使用 loadMcpConfigs 的只读结果。对照参考按合法子命令读取配置名称并按能力筛选的决定，本项目保留 disabled 名称用于 tools/doctor/refresh 的既有诊断语义，没有新增连接、认证或执行路径。
- permissions revoke/remove 复用当前 ApprovalTrustPolicy 的项目授权读取，候选接受 grant.key 而非易变序号。沿用现有权限选择器相同的标签、范围和稳定 selector；Tab 不撤销，实际 Enter 仍交给原命令 owner。候选展示后加入另一条授权，原 selector 仍只移除原目标，其他项目记录保留。
- 修复动态实体在带 action 位置接受 dash-leading 名称时缺少 -- 的边界；现在无已有 -- 才插入，引用空格名称完整保留。非法 action、多余目标和错误 flags 不读取目录。
- Linux、Node 20.3 隔离环境 10 文件/101 项和 build:ts 通过。撤掉项目不信任过滤、把稳定键改为序号的反转分别触发断言失败，逐字节恢复后组合 101 项再次通过。真实 regular/fullscreen CLI 显示禁用服务名称和授权候选，Tab 前后 MCP 配置与授权文件字节保持、授权 mtime 不变，Enter 才撤销目标，退出码均为 0。探针最初等待旧 cmd 键格式，修正为实际 owner 生成的键后通过。
- import cycles/config consumers/declarations/node floor 通过；NormProof 全图无环与导入解析 satisfied，既有 5 个函数数量 advisory 保留。7db76ae1 Architecture Watch 37387926527 成功，CI 37387926802 查询时仍运行；708c3ceb CI 37386715107 与 Architecture Watch 37386714984 均已成功，源码缓存期限修复获得该 SHA 的远端通过证据，原两次失败不改写。
- CMD-04 仍有 memory、连接、路径及其余目录接线、完整外部版本事件和底层取消。§8.38 tools 目录仍使用会建立连接的 gateway.snapshot，不应把该路径描述为纯配置读取或据此宣称完整副作用边界已验收；后续应复用当前工具池快照并核查冷目录读取。Phase 19 整体继续。

### 8.42 CMD-04：工具补全复用已加载 MCP 目录

- 修正 §8.38 的 tools 补全直接调用 gateway.snapshot 而建立 MCP 连接的问题。client 在完整 tools/list 成功后保存工具描述副本，peekTools 只返回尚存活、未关闭且完整读取的目录；重新连接或开始重新读取时清除旧副本。返回克隆结果，调用方无法修改 owner 的已加载目录。
- connectionManager 只检查现有 client 与当前配置一致性；gateway.peekSnapshot 校验当前 workspace、关闭状态并沿用配置/信任读取。冷目录、配置变化、连接断开与项目切换返回 unavailable，不隐式连接、刷新或关闭进程；真实空配置返回空快照。配置损坏仍是读取失败，未冒充成功空目录。
- tools 候选通过 peekSnapshot 交给既有 toolPoolFor 的可见性过滤，不把无目录时的 core-only 列表冒充完整成功。显式 /mcp refresh 或实际请求可以加载目录，下一次补全复用它。对照参考从当前已加载工具定义投影名称与描述的决定，没有引入另一套连接生命周期。
- Linux、Node 20.3 下 16 文件/137 项及 build:ts 通过，包含实际 MCP 子进程、断连不重连、配置/信任/项目变化、克隆隔离、工具过滤与转发。恢复补全调用连接式 snapshot 的反转失败，逐字节恢复后组合套件通过。首次组合命令包含不存在的 catalog.test.ts，实际运行 123 项；随后明确加入现存 prefilter/mcpForwarding 测试，最终为上述 137 项，不把未找到的路径当作覆盖。
- regular/fullscreen 真实 CLI 冷补全报告 unavailable 且无服务进程日志；显式 refresh 后有真实目录，候选和 Tab 前后协议日志字节不变，两模式 exit 0。探针首次等待的完整候选名被菜单截断，改等待菜单中的描述后通过，接受完整工具名仍单独验证。
- import cycles/config consumers/declarations/node floor 通过；NormProof 无环与导入解析 satisfied，既有 5 个函数数量 advisory 保留。3eca2fd0 Architecture Watch 37388577673 成功，CI 37388578273 查询时仍运行；7db76ae1 CI 37387926802 仍待终态。
- 本批消除了候选读取触发 MCP 握手/tools-list 的路径；菜单已有 15 秒成功缓存与显式失效机制，完整外部目录/连接事件版本化仍待实现，不能将 client 活跃性检查等同于实时菜单刷新。CMD-04 其余目录、CMD-03 其余声明及 Phase 19 后续批次继续。

### 8.43 CMD-04：连接 ID 动态目录

- connect use/activate/logout/remove/rm 的合法目标位置读取同一用户级配置 owner，并复用 normalizeConnections。候选按标签匹配、接受完整连接 ID；同 provider 多条连接不会被压成 provider 名而选中第一条。登录/set 的 provider 固定候选继续由原 syntax 提供，密钥/端点位置不触发连接目录。
- 菜单仅投影 ID、标签、provider 和 saved 状态，不携带 apiKey、baseUrl、accountAuth 等字段，也不把已保存 connected 状态当作实时连通验证。底层读取仍解析用户配置文件，未声称完全不接触配置中的凭据字段；本轮所有验证使用隔离合成配置，未读取真实 provider 目录。
- 沿用此前参考中合法动作位置先于目录查询、已加载/已保存身份元数据投影的决定，复用共享生命周期和现有连接 owner，没有新增认证或 provider 切换路径。候选读取不写配置、不登录、不切换、不删除。
- Linux、Node 20.3 隔离环境 10 文件/135 项及 build:ts 通过，覆盖同 provider 精确选择/删除、标签与带空格 ID、凭据字段不进入候选、配置字节/mtime 不变、缺配置与损坏配置区分。把候选 ID 退为 provider 的反转导致断言失败，逐字节恢复后组合套件通过。
- 首次测试假设 /auth 是当前别名，但实际 registry 未注册；归类为测试假设错误，改为未知命令不读取目录，未新增兼容入口。旧帮助仍有历史 /auth set 提示，本批未据此扩大产品语法。
- regular/fullscreen 真实 CLI 都按标签接受完整引用 ID，Tab 后配置字节与 mtime 不变，Enter 才切换指定连接，合成 key 未出现在终端输出，两模式 exit 0。import cycles/config consumers/declarations/node floor 通过；NormProof 无环/导入解析 satisfied，既有 5 个函数数量 advisory 保留。
- 7db76ae1 的 CI 37387926802 与 Architecture Watch 37387926527 均成功。3eca2fd0、52dae49c 的 Architecture Watch 均成功，CI 37388578273、37389139511 查询时仍运行。CMD-04 记忆/文件目录及外部版本事件、CMD-03 其余声明与阶段后续批次继续。

### 8.44 CMD-04：记忆记录与审批候选目录

- memory delete/invalidate 接入项目本地 store 的只读列表，删除可选择失效记录、invalidate 只列活动记录；缺文件返回空目录且不创建目录，损坏记录诊断返回 unavailable。候选只显示稳定 ID、种类和状态，没有展开记忆正文。
- approve/reject/save 从当前会话最新 compact checkpoint 复用原提取器，并只读默认 review store。复用 review owner 的初始决定规则，批准位置不列 unsafe；保存位置只列与最新候选逐字段一致的现有 approved 条目，旧 ID 对应的内容/证据变化不能复用旧批准。保留显式 save approved 固定候选。
- 目录不调用会 updateCandidates 的 review runner，不批准、拒绝、持久化或暂存未来注入。recall/use/add 与顶层 recall/retain 保持查询/自由文本位置，不把它们转换为实体 ID。候选接受仍走同一草稿快照编辑边界；具体保存资格、store 写权限继续由原 save owner 决定。
- 沿用参考项目声明驱动合法参数位置、已加载状态只读投影的决定；本项目的记录/候选生命周期仍由现有 memory owner 承担，没有创建第二套审批或存储系统。
- Linux、Node 20.3 隔离环境 13 文件/173 项和 build:ts 通过。反转去掉审批内容一致性、让 invalidate 列出失效记录后断言失败，逐字节恢复后组合通过。测试直接验证审批对象身份不变、updateCandidates 零调用、记录文件字节及 mtime 不变。
- regular/fullscreen 真实 CLI 以进程内合成检查点和隔离记录文件验证 approve/save/delete 的完整 ID 接受；显式 Enter 仅批准，保存和删除位置 Tab 后未写记忆文件，两模式 exit 0。检查点由测试预加载器使用真实 packet/提取器建立，不把该探针计作压缩请求生成检查点的完整验收。
- import cycles/config consumers/declarations/node floor 通过；NormProof 无环及导入解析 satisfied，既有 5 个函数数量 advisory 保留。3eca2fd0 与 52dae49c 的 CI/Architecture Watch 均成功；3308f1c5 Architecture Watch 37389522694 成功，CI 37389522700 查询时仍运行。
- CMD-04 文件/目录位置、model/workflow 统一生命周期与完整外部版本事件尚待完成；CMD-03 其余声明及 Phase 19 后续批次继续。

### 8.45 CMD-04：文件与目录路径补全

- cd/workspace attach/switch/use 仅提供目录；report 与 export markdown/md/jsonl/html 的 path 位置提供文件及用于继续输入的目录。路径位置通过原 owner syntax 加占位目标验证，保留前后 flags，不在未知动作、多目标或非法 flag 位置查询。
- 路径读取使用异步 opendir，只枚举输入所指的一级目录，最多检查 5000 项；在条目间响应取消并关闭迭代句柄，不递归遍历工作区。目录符号链接按真实类型判断，坏链接及非普通文件不进入候选。相对路径基准与命令相同为 cwd；文件目标的 ~/ 扩展沿用写目标语义，cd 未新增 home 扩展语法。
- 复用现有请求 controller 的防抖/超时/迟到拒绝，并让缓存键包含路径父目录，相同目录内不同 basename 前缀复用，切目录重新读取；缓存限制 64 个目录/实体键。没有把既有 @ 文件递归索引复制成另一套目录浏览器，也不因补全自动加入 --outside 或写入目标。
- DraftEdit 新增可选插入内光标位置，校验整数范围及 grapheme 边界。目录接受不添加空格，引用路径把光标留在闭合引号前，可以继续输入下一层；文件接受保留原分隔符或添加末尾空格。对照参考实现目录无空格后缀、光标留在引号内、符号链接类型检查的决定。
- Linux、Node 20.3 隔离环境 14 文件/235 项及 build:ts 通过，涵盖编辑器、@ 文件补全、路径/权限 flags、分目录缓存与 cwd/projectRoot 不同的路径基准。取消插入内光标、缓存退回仅按实体种类的反转触发三处断言失败，逐字节恢复后组合通过。
- regular/fullscreen 真实 CLI 从带空格目录连续接受到 child 目录，report 文件目标 Tab 后已有文件字节和 mtime 不变，两模式 exit 0。探针首次未剥离光标控制标记，修正终端清理后通过，未改产品行为来迎合等待条件。
- import cycles/config consumers/declarations/node floor 通过；NormProof 全图无环与导入解析 satisfied，既有 5 个函数数量 advisory 保留。3308f1c5 与 712eaa73 的 CI/Architecture Watch 均成功。
- CMD-04 仍需 model/workflow 统一生命周期及完整外部版本事件，其他路径型参数按各 owner 语义继续审计；本批没有宣称全命令目录与 Phase 19 整体完成。

### 8.46 CMD-04：model/workflow 统一目录生命周期

- model 的同步 owner 补全仅保留动作/别名/flags；移除同步 loadCatalog 与前缀扫描，模型 ID 和 list provider 进入同一每表面 controller。直接 ID、use/set、list/ls 位置沿 parseModelArgs 校验，status/help/config/refresh、多余目标与非法 flags 不触发目录读取。
- 模型目录继续复用 shipped/cache/user 三层合并，不刷新网络、不创建用户文件；provider 列表保留命令支持的 runtime providers。原 owner 对损坏 overlay 的 shipped fallback 行为未改，未声称候选独立报告这类错误。目录展示不意味着已认证或可立即切换，实际连接/会话持久化仍由 setModel 负责。
- workflow run/start 候选复用当前 cwd 的 listWorkflowNames/readWorkflow 与 DAGResolver，只提供解析通过、依赖图有效的文件名；显示名称可匹配但接受真实文件名，避免显示 title 与文件 stem 不同导致无法运行。显式不信任项目报告目录 unavailable，不执行步骤或创建 run 记录；读取上限为 5000 个定义名称。
- 沿用参考项目从当前工具/目录定义投影候选、合法参数位置先于读取的决定，统一缓存/失效/草稿校验与主动重绘；没有新增模型刷新器或 workflow 执行器。现有 workflow 底层执行边界的后续工作仍按阶段计划推进。
- Linux、Node 20.3 隔离环境最终 18 文件/258 项与 build:ts 通过，覆盖会话模型选择、目录形状/可达性、workflow runner、输入层与候选生命周期。初次命令包含三个旧测试路径，实际仅运行 192 项；随后明确加入现存 workflow/catalog/selection 测试得到最终数字。循环依赖过滤反转触发目录断言失败，逐字节恢复后组合通过。
- regular/fullscreen 真实 CLI 读取用户模型 overlay、Tab 后无刷新，Enter 选择会话模型；workflow 按显示标题接受带空格的文件名，Tab 后定义不变且执行标记不存在，两模式 exit 0。初次探针缺少活动连接，实际命令拒绝；补齐隔离合成连接后通过，未更改产品认证要求。
- import cycles/config consumers/declarations/node floor 通过；NormProof 全图无环/导入解析 satisfied，既有 5 个函数数量 advisory 保留。01425cae Architecture Watch 37391742802 成功，CI 37391742312 查询时仍运行。
- CMD-04 仍需完整目录/连接版本事件及剩余参数审计。目录 owner 的同步解析不能被 AbortSignal 物理打断，本轮不以取消发布测试声称全部底层读取可中止。CMD-03 与 Phase 19 其余批次未完成。

### 8.47 CMD-04：首批外部目录变更事件

- controller 为已查询目录持有最多 64 组可释放监听，路径目录、model/provider 的用户与刷新缓存文件、workflow 定义目录和信任文件接入变更失效。事件只清对应缓存；当前仍在补全同一来源、身份与草稿一致时取消旧请求并重读，其他来源只失效缓存，不抢占输入。
- 取消清理 active 发布资格，Esc 后的事件不能重开菜单。项目/会话切换、显式 invalidate 与退出关闭监听；被释放观察者通过代次与 disposed 守卫拒绝迟到事件。缓存暂未展示时仍可失效，避免下次使用旧目录。
- 文件监听从目标及其父目录处理条目变化与目录替换，目标不存在时监听最近现存父目录，创建后重新绑定；单文件的原子替换同样重新读取。监听不递归遍历工作区，句柄 persistent=false，读取路径解析与路径目录查询共用一个函数。
- 对照参考文件事件处理只刷新已加载目录、增删使父目录失效的决定，复用本项目 controller，没有增加全工作区索引。监听不可用/出错时关闭句柄并保留既有 TTL/显式刷新退路；不声称所有平台和挂载都支持即时文件事件。
- Linux、Node 20.3 隔离环境 12 文件/158 项与 build:ts 通过，覆盖不存在目标创建、目录替换、模型文件原子替换、取消不重开、释放后迟到事件拒绝。移除取消时 active 清理的反转失败，逐字节恢复后组合通过。
- regular/fullscreen 真实 CLI 在没有新增按键时响应目录增删、用户模型目录创建和原子替换；Esc 后继续外部写入未重新打开候选，两模式 exit 0。探针的文件变更仅用于隔离合成工作区与 HOME，没有模型请求。
- import cycles/config consumers/declarations/node floor 通过；NormProof 无环/导入解析 satisfied，既有 5 个函数数量 advisory 保留。01425cae 两项远端检查均成功；086fe2c5 Architecture Watch 37392574377 成功，CI 37392574729 查询时仍运行。
- CMD-04 全部来源事件尚未完成：theme/skill 的嵌套目录、会话/记忆/授权/连接 owner 版本与 MCP 连接状态仍需接线，底层同步读取取消限制保留；其余参数与 Phase 19 后续任务继续。

### 8.48 CMD-04：连接配置事件与用户文件来源优先级

- connect 的已保存连接目录接入用户配置文件监听，外部编辑或原子替换使当前候选重读；Tab 仍只接受完整 ID，不切换连接、不写配置。菜单仅投影身份字段，底层解析配置的原有行为未改。
- 来源路径选择独立在 completion/sources 内，沿用户数据 owner 的候选目录顺序监听，包括尚未存在的高优先级文件及删除后可生效的回退文件。同步修正 model/provider 和 workflow 信任文件只监听当前解析路径、漏掉新来源覆盖的问题；没有改变文件读取优先级、认证或信任裁决。
- 沿用参考事件处理仅刷新已查询来源的决定，不递归扫描用户目录。监听仍受 controller 的 64 组上限和释放代次约束，每组只覆盖固定数量的候选文件；不支持文件事件的环境继续使用 TTL/显式失效退路。
- Linux、Node 20.3 隔离环境 13 文件/161 项和 build:ts 通过；将监听退回仅当前解析文件后，连接与模型的新来源创建断言失败，逐字节恢复后组合重跑通过。测试覆盖原子替换、优先级覆盖、删除回退与 stop 后不通知。
- regular/fullscreen 真实 CLI 在不新增按键时响应外部连接替换、模型当前文件覆盖旧来源与删除回退；Tab 后配置字节及 mtime 不变，合成 key 未出现在终端，Esc 后事件未重开菜单，两模式 exit 0。
- import cycles/config consumers/declarations/node floor 与 docs drift 阻断规则通过；NormProof 全图无环及导入解析 satisfied，既有 5 个函数数量 advisory 保留。086fe2c5 的 CI 37392574729 与 Architecture Watch 37392574377 均成功；b40344b5 Architecture Watch 37393613204 成功，CI 37393613562 查询时仍运行。
- CMD-04 的 theme/skill 嵌套目录、会话/记忆/授权 owner 与 MCP 状态事件仍未完成，其余参数审计和 Phase 19 后续批次继续。

### 8.49 CMD-04：主题发现来源事件

- theme owner 导出同一发现目录序列，原 discovery 直接复用；补全监听用户目录、项目目录链与命令行额外文件/目录。保留既有加载顺序和错误主题诊断，不复制主题扫描或改变主题选择。
- 监听覆盖缺失目录逐层创建、JSON 内容名称修改、原子替换、删除和重建；候选路径去重，沿共享 controller 的缓存、草稿/身份校验和退出释放。参考主题发现中单层 JSON 文件与显式来源路径的做法；既有当前主题热重载仍负责实际外观应用，候选读取不应用主题。
- Linux、Node 20.3 隔离环境 18 文件/205 项与 build:ts 通过，覆盖四类来源和已有主题加载/热重载测试。移除主题来源监听后四组事件断言失败；反转还暴露测试 cleanup 对缺失 stop 的假设，修正清理并删除隔离夹具残留，恢复产品代码后组合通过。
- regular/fullscreen 真实 CLI 在无新按键时响应主题创建、名称编辑、删除、重建，Esc 后外部修改不重开菜单，两模式 exit 0。测试另核对只读查询前后的主题选择、配置字节和 mtime 不变。
- import cycles/config consumers/declarations/node floor 通过，NormProof 无环/导入解析 satisfied，既有 5 个函数数量 advisory 保留。32598f7e Architecture Watch 37394082553 成功，CI 37394082538 查询时仍运行；b40344b5 CI 37393613562 亦待终态。
- 技能目录检查确认存在递归分组、manifest 停止下探、ignore 与信任语义，后续事件路径应由同一发现过程提供，不另造递归扫描器。技能及会话/记忆/授权/MCP 状态事件、剩余参数与 Phase 19 后续任务继续；不把本批主题单层监听计为递归技能完成。

### 8.50 CMD-04：技能发现路径观察

- SkillLoader 在读取根路径及递归目录前，通过可选回调报告实际访问路径；补全沿同一发现过程建立监听，没有创建第二套技能递归扫描器。用户候选根包含尚未存在的目录，因此外部创建后可使空目录缓存失效；缺失根的读取仍返回空。
- 沿用参考技能发现的 manifest 停止下探、分组递归和命名路径优先规则；技能候选仍由原 catalog 应用信任过滤。noSkills 不观察被禁用的发现目录，显式 skillPaths 仍可读取；新一轮发现会移除不再访问的路径监听。
- 每个技能目录观察器最多保留 256 个目标，换树时先释放旧目标再接入新目标，峰值也受限；目标去重，停止后关闭全部句柄。超出上限和不支持文件事件的来源保留既有 TTL/显式刷新退路，没有声称任意规模都即时刷新。项目目录链 ignore 文件及用户信任候选文件纳入来源；完整 Git 外部 excludes/index 与其他间接配置事件仍需后续审计。
- Linux、Node 20.3 隔离环境 18 文件/207 项与 build:ts 通过，包括原技能解析/信任测试、嵌套新增和编辑、manifest 下参考文件不作为独立技能、禁用后释放、显式文件原子替换、只读字节/mtime 与监听峰值。首轮夹具把 HOME 放进工作区触发仓库 ignore，归类为夹具边界错误，改为独立工作目录，未更改产品 ignore 决策。
- 移除递归目录报告后，深层 manifest 编辑的事件断言失败；逐字节恢复后组合通过。regular/fullscreen 真实 CLI 在无新按键时响应深层技能创建、manifest 原子替换、删除及重建，Esc 后事件不重开菜单，两模式 exit 0。
- import cycles/config consumers/declarations/node floor 通过，NormProof 无环/导入解析 satisfied，既有 5 个函数数量 advisory 保留。ce228211 Architecture Watch 37394466969 成功，CI 37394466624 查询时仍运行；32598f7e 与 b40344b5 的 CI 亦待终态。
- CMD-04 的会话/记忆/授权 owner 与 MCP 状态、间接配置事件仍未完成；底层同步技能解析无法被 AbortSignal 物理中断的限制继续保留，剩余参数审计与 Phase 19 后续批次继续。

### 8.51 CMD-04：授权策略与记忆记录文件事件

- grant 候选观察实际 ApprovalTrustPolicy 实例的只读 sourcePath，支持自定义位置及构造时固定的回退文件，不在补全侧重新推算默认路径。新增 accessor 不改变授权匹配、授予、撤销或写入行为；只有列表接口的替代 policy 仍可使用既有 TTL。
- record/invalidatable 复用同一记忆 store 工厂的规范化 recordsFile，使用会话 projectRoot 而非 cwd。没有猜测记录文件名或另建存储；缺失目录的监听不创建 store，外部创建、原子替换和删除都使缓存失效。候选/审批决定/压缩检查点仍属于内存 owner，未用磁盘事件冒充其状态通知。
- 沿用此前参考文件事件仅刷新已查询来源、删除使其失效的决定，共享 controller 继续负责防抖、当前草稿校验、Esc 后不重开与退出释放。菜单不读取到正文展示层、不改变授权或记忆记录，实际命令仍由 owner 执行。
- Linux、Node 20.3 隔离环境最终 20 文件/203 项及 build:ts 通过，覆盖自定义 policy、cwd/projectRoot 分离、创建/原子替换/删除/释放、字节及 mtime 不变，含现存授权与记忆持久化/删除测试。首轮选择了不存在的旧 local-store 测试路径，随后改为现存测试补跑并以最终实际数字记录。
- 移除 grant/record/invalidatable 来源监听后三组事件断言均失败，逐字节恢复后组合通过。regular/fullscreen 真实 CLI 无新按键响应外部授权和记录变化，授权 Tab 不写文件、记忆正文未进入终端、Esc 后不重开，两模式 exit 0。
- import cycles/config consumers/declarations/node floor 通过；NormProof 全图无环与导入解析 satisfied，既有 5 个函数数量 advisory 保留。32598f7e CI 37394082538 与 Architecture Watch 37394082553、b40344b5 CI 37393613562 与 Architecture Watch 37393613204 均成功；4a86f8af Architecture Watch 37394996510 成功，CI 37394996509 仍运行。
- CMD-04 会话目录、内存审批/检查点、MCP 连接状态和间接配置事件尚未全部完成；剩余参数审计及 Phase 19 后续批次继续。

### 8.52 CMD-04：内存审批与检查点状态通知

- checkpoint 与 memory review store 提供可释放的会话范围订阅；owner 完成写入后派发失效信号，补全 candidate/approvable/approved 接入同一 controller。没有增加轮询、持久化事件日志或第二份审批状态，读取仍使用原 store。
- core/state 的共享通知器仅保留有订阅的待通知范围，微任务合并同一范围重复更新；释放取消待派发回调，重复释放不会删除后来的订阅。观察者异常不改变已经完成的 owner 写入结果。对照参考会话事件的订阅/释放决定，并针对本项目同步 store 的批量变更使用写后合并通知。
- checkpoint 新建、跨会话复用 ID、容量淘汰、清除与 supersede 通知所有受影响范围；审批更新/批准/拒绝和会话淘汰通知对应 review scope。特别覆盖旧会话候选消失，不能只通知新写入会话而留下已淘汰批准的菜单缓存。
- Linux、Node 20.3 隔离环境 25 文件/198 项与 build:ts 通过，含 owner 保留策略、scope 隔离、释放、观察者异常与真实 loader 的批准/清除投影。移除审批通知及 checkpoint 的旧会话通知后三组断言失败，逐字节恢复后组合通过。
- regular/fullscreen 真实 CLI 在无新按键时响应内存批准/拒绝、检查点清除，Esc 后不重开，持久化记录字节及 mtime 不变，两模式 exit 0。探针用隔离预加载器建立真实 packet/checkpoint，通过测试控制文件触发进程内 owner 调用；控制文件轮询仅在夹具中，不作为产品实现，也不将其计作真实 provider 压缩验收。
- import cycles/config consumers/declarations/node floor 通过；NormProof 全图无环/导入解析 satisfied，既有 5 个函数数量 advisory 保留。4a86f8af CI 37394996509 与 Architecture Watch 37394996510、ce228211 CI 37394466624 与 Architecture Watch 37394466969 均成功；60908649 Architecture Watch 37395620099 成功，CI 37395619977 查询时仍运行。
- CMD-04 会话导航、MCP 连接状态及间接配置事件仍待完成；剩余参数审计和 Phase 19 后续任务继续。

### 8.53 CMD-04：会话与导航读取来源事件

- SessionReadSurface/list store 接受可选来源回调，由原有目录遍历报告存储根及会话子目录；补全不用额外扫描。回调发生在最近会话截断前，因此监听上限内未展示会话的标题/更新时间变化也能使列表失效；新目录创建后重新读取并绑定其元数据。
- entry 通过 manager 的真实存储布局观察所有已知候选会话目录；tree/thread 沿原导航 query 的布局报告来源，捕获 metadata、state 与 transcript 变化。覆盖当前目录副本优先于旧目录会话的情况，没有改变 owner 的来源选择或会话恢复行为。manager 构造时固定的搜索目录语义保留。
- 将技能目录已验证的有界路径监听管理提取为共享 observation，技能与四类会话目录各自保留订阅和最多 256 个目标，换树/释放逻辑继续复用。沿用参考文件事件只刷新已查询来源的决定，超限或平台不支持时保留 TTL/显式失效，没有建立后台全会话索引。
- Linux、Node 20.3 隔离环境最终 22 文件/260 项与 build:ts 通过，包含完整 SessionManager 78 项、列表/导航 query、技能回归和观察上限测试。初次提取遗漏 path import 导致构建失败，补齐后构建通过；没有将失败运行计作通过。
- 移除列表子目录来源回调后，已有会话标题和新会话后续标题刷新两组断言失败，逐字节恢复后组合通过。新增专项验证旧目录转录被当前目录副本覆盖后候选更新。regular/fullscreen 真实 CLI 无新按键响应跨进程标题修改、会话删除和当前导航树追加消息，Esc 后不重开，两模式 exit 0。
- import cycles/config consumers/declarations/node floor 通过；NormProof 无环/导入解析 satisfied，最终报告为 4 个函数数量 advisory；SessionStoreAccess 在新增回调参数后不再被报告，但其方法未减少，本批不据此宣称历史超限已修复，计数差异留作检查器边界。60908649 CI 37395619977 与 Architecture Watch 37395620099 均成功；980fca15 Architecture Watch 37396452028 成功，CI 37396451943 查询时仍运行。一次 GitHub 查询 EOF 后原查询重试成功，未重启 CI。
- CMD-04 的 MCP 连接状态和间接配置事件仍需完成；全参数审计、同步读取取消限制与 Phase 19 后续任务继续。

### 8.54 CMD-04：MCP 工具目录与连接状态事件

- MCP client 在连接重建、列表读取开始/完成、关闭及服务端 tools/list_changed 时通知 connection manager；gateway 提供可释放订阅，工具补全沿共享 controller 失效。MCP 用户/项目配置和信任候选文件同步接入来源监听，包含用户目录优先级变化。
- 服务端列表变更先清除已加载快照和后续调用目录，不在补全或通知回调内自动连接或 tools/list。显式 refresh、snapshot 或实际工具调用仍负责发现；菜单在没有新目录时报告 unavailable。对照参考连接关闭时清目录、旧 client 身份守卫、工具列表变更事件的决定；本项目采用失效后显式发现，保持补全只读边界。
- 列表读取带目录版本检查，通知或关闭先于响应时不重新发布过期工具。已发起工具调用持有发起时的目录对象验证响应，避免通知清空共享目录后丢失输出契约。初轮真实协议测试暴露该并发验证错误，修正后通过；未通过吞掉结果验证或重放工具调用来处理。
- Linux、Node 20.3 隔离环境 26 文件/215 项与 build:ts 通过，包括真实 stdio 协议、冷目录不连接、配置变更、关闭/取消生命周期、通知与列表响应交错。移除版本检查及调用目录捕获后两处断言失败，逐字节恢复后组合通过。
- regular/fullscreen 真实 CLI 接收合成服务端变更通知和进程退出后无需新按键即使工具候选失效；通知和后续 peek 的协议日志字节不变，证明没有新增 tools/list 或重连。外部配置刷新服务器名称，Esc 后不重开，两模式 exit 0。第一次等待完整工具名因菜单正常截断而超时，改等稳定描述后通过；控制文件观察仅在服务端夹具中。
- import cycles/config consumers/declarations/node floor 通过；NormProof 无环/导入解析 satisfied，最终 4 个函数数量 advisory，保留 §8.53 的计数器边界说明。980fca15 两项远端检查均成功；d6ca32f4 Architecture Watch 37397590916 成功，CI 37397591431 查询时仍运行。
- CMD-04 主要来源已接入事件，仍需按全量参数表核对遗漏位置及间接配置边界；同步 owner 读取取消限制、CMD-03 剩余声明与 Phase 19 后续任务继续，未宣称本批完成整个命令系统或阶段。

### 8.55 CMD-03：自由文本参数、usage 与端到端原文保留

- continue/review/copy/commit/btw/web-research 及现有别名接入共享文本语法；注册目录、调用身份和输入层传递 raw 模式。命令后只消费一个分隔空白（CRLF 作为一个分隔），余下正文不做 shell 解码或首尾裁剪；continue 只识别开头可带引号的 sess_ 选择器，其余内容保持自由文本。必填问题/主题为空时不请求、不采集；copy 的空正文回退与显式空白拒绝保持区分。
- 没有实体候选时显示同源 usage，说明不进入候选列表，Tab 不执行命令。短粘贴与折叠长粘贴先展开，再根据调用元数据提交；原有编辑器 CRLF 到 LF 规则保留，Tab 作为一个源字符保存、删除和撤销。
- 修复 Tab 展开后被拆到两个视觉行、上下键可能回到原行的问题：复用文本域的同一换行边界计算，Tab 在显示时作为完整两格单元；一格窗口与宽字符遵循完整单元规则。选择词边界后重新检查续行宽度，避免宽字符使续行越界。没有新增第二套编辑器或命令执行通路。
- 真实 HTTP 探针发现 continue 正文在 turn/prompt 的消息转换中仍被裁掉末尾空白，现仅用 trim 判空，传给 provider 的正文保留原值，环境上下文前缀继续存在。对照参考实现的正文透传、结构选择器局部解码、元数据提示和按 grapheme 换行决定；明确不采用其破坏源文的 Tab 展开，因为本项目需要保留复制与提交内容。
- Linux、Node 20.3 的 146 文件/2001 项组合与 build:ts 通过，覆盖命令、交互、完整 TUI 和 turn；43 项脚本测试通过。串行组合出现 process exit listener 数量警告，未抑制或据此改动无关运行时。最初交互失败暴露 Tab 归一化丢失；随后两项窄窗回归及请求正文回归均先复现再修复，未弱化内容断言。
- 六组反转分别恢复 shell 参数分词、破坏性 Tab 归一化、展开后换行、漏检续行宽度、continue 裁剪和请求正文裁剪，均产生断言失败；所有源文件逐字节恢复后 6 文件/115 项通过。首次路由反转没有失败，因为已有样本仍通过 raw 上下文保留正文；补入末尾反斜杠这一真实输入后才得到有效反转证据。
- regular/fullscreen 真实 CLI 均 exit 0；短文本 57 bytes 与折叠长文本 449 bytes 到达隔离剪贴板适配器，OSC52 内容也一致。每模式本地合成 HTTP 服务收到 4 次请求，side/review/commit/continue 正文精确匹配；Tab、空 btw/web-research 零请求，Git index/HEAD 不变。夹具使用独立 HOME、合成凭据和本地服务，不作为外部真实 provider 或真实 Git 提交成功证据。
- import cycles/config consumers/declarations/node floor 通过；NormProof 无环及导入解析 satisfied，保留原有 4 个函数数量 advisory。本批变更模块未新增超限。code-reviewer 与 architect 两条独立审查首次及重试均返回 HTTP 503，状态为 independent review unavailable，不记作批准或 merge-ready。提交 4ef138db 的 CI 37398722776 与 Architecture Watch 37398722778 已成功；本批远端证据需对应新提交另查。
- CMD-03/04 的全量参数位置、间接来源与取消边界仍需复核；本批不代表 UI-02 完整源文选择和所有输入形态完成，Phase 19 的 16 批/76 项整体目标继续。
- 续接核验：七个反转源文件与恢复时 SHA256 全部一致；Node 20.3 隔离环境重跑 56 文件/713 项与构建通过，regular/fullscreen 本地 HTTP/剪贴板探针再次通过。五项静态门禁通过；NormProof 阻断义务全部满足，仍有四个既有函数数量 advisory。串行测试仍有 exit listener 数量警告。预设独立审查通道分别返回模型不支持与服务繁忙，改用继承当前会话设置的独立审查通道继续；未将服务错误记为通过。
- 两条继承设置的独立审查随后完成：代码审查覆盖 35 个 TypeScript 文件，结论 APPROVE；架构审查 CLEAR。代码审查额外枚举 6,144 个 ASCII/空格/Tab/CJK 窄窗布局，显示原文和相邻行导航均通过。审查方明确没有重复执行父任务的构建、组合测试与 PTY，证据来源分别保留。

### 8.56 CMD-03：独立记忆调用的文本语法

- `/recall`、`/retain` 是不同于 `/memory recall` 的独立调用，现各自声明 raw 参数模式，共享 textSyntax/parseTextArgs 生成的校验和 usage；普通 `/memory` 仍解析领域动作。删除两个手写 usage 与重复判空分支。空正文不读取或记录事实；执行失败继续传播，不生成成功输出。
- 定向对照参考命令派发器只切分命令名、原样向 handler 交付余下正文，以及声明元数据生成 inlineHint 的决定。采用单分隔符和正文透传，并用共享语法补齐实际校验；没有复制参考代码，也没有将两种记忆调用合并到同一个操作。
- Linux、Node 20.3 隔离环境 7 文件/199 项及 build:ts 通过。最初 13 项中 7 项复现引号/空白/尾反斜杠或 raw 上下文损坏，4 项是迁移至同源 usage 的预期差异，2 项原行为通过；据此修复解析并更新旧提示断言，未放松正文断言。移除 recall 的 raw 模式与恢复 handler 首尾裁剪分别导致测试失败，逐字节恢复后 13 项再次通过。
- regular/fullscreen 真实 CLI 均 exit 0，Tab 和空正文没有触发记录或搜索。退出时由隔离观察夹具读取实际进程内 fact store，确认仅增加一条事实，内部引号、反斜杠、Tab、多空格与换行保持；尾反斜杠查询正常显示并找到该事实，工作区标记文件不变。夹具观察文件只属于测试，不是新增产品存储。
- **既有存储边界**：core/memory 的 MemoryStore 是进程内 Map，FactArbiter 按事实语义裁剪首尾空白。本批保证调用边界正文不被 shell 解码，未改变该存储归一化，也不把退出观察快照当作持久化或跨项目隔离证据。其持久化/隔离与现有 project memory owner 的一致性需要专项核查，不能再建立重复存储实现。
- import cycles/config consumers/declarations/node floor 通过。`8b6d8dbe` 已推送，Architecture Watch `37410873846` 成功，CI `37410873853` 查询时仍执行；本批远端结果需对应新提交另查。CMD-03/04 全量动态位置、取消边界、SAFE-02 缺口与后续 Phase 19 任务继续。
- docs drift strict 与 diff 检查通过；NormProof 阻断义务满足，四个既有函数数量 advisory 保留。两条独立审查分别给出代码 APPROVE、架构 CLEAR，均明确验收的是命令到 owner 的正文交付，不是存储逐字节保真或重启持久化。

### 8.57 CMD-03/04：实体位置复用完整领域语法

- 动态候选按 invocation 身份区分真正别名和独立调用，修复 `/mem` 丢失记忆记录/审批候选的问题；`/recall`、`/retain` 保留自己的文本语义，不进入项目记忆动作目录。
- 补全 position 适配器使用唯一占位值调用 owner parser，验证光标前后完整参数并确认正在编辑首个实体参数；记忆、MCP、连接、授权、workflow、会话导航、路径与模型共用。删除导航和动作目录的手写参数数量限制；已有合法 reason 后缀不再阻断 ID 补全。占位值与已有输入不相同，避免把正文中的同名字符串误判成当前实体位置。
- 定向比较参考按命令注册对象委派参数候选、按动作语义筛选实体来源的决定；保持该职责分工，以本项目 parser 处理别名、完整后缀及 `--`，不复制参考的前缀切分/词数判断。模型和会话仍使用各自的解析适配，完整动作名继续优先于实体查询。
- Linux、Node 20.3 隔离环境 24 文件/290 项及 build:ts 通过，涵盖完整 completion 目录、输入替换与领域语法。初次 26 项新增测试中 15 项复现缺陷；组合测试暴露 fork 单动作语法接错解析适配，修正后通过。`/mcp -- tools` 的旧“不补全”断言与运行时合法语法不符，改为接受；未知 flags、冲突批量审批、额外目标和 reason 位置仍拒绝实体查询。
- 恢复别名过滤、后缀数量拒绝、占位值碰撞三组反转均产生断言失败，所有源文件逐字节恢复后 30 项通过。regular/fullscreen 实际 CLI 验证别名与 ID 后已有原因，Tab 零保存/删除；明确提交审批后实际 review state 的 reason 为原说明，记录文件字节及 mtime 不变，两模式 exit 0。初次探针退出失败是夹具在光标位于中间时只用 Ctrl+U、留下后缀，改为先移行尾再清空后通过，没有改产品删除行为。
- import cycles/config consumers/declarations/node floor 通过。前两批 `8b6d8dbe`、`ba2a983a` 的 Architecture Watch 均成功，CI `37410873853`、`37411329520` 查询时仍在测试阶段；本批远端结果需对应新提交另查。同步目录读取的抢占取消、间接来源变更、SAFE-02 与其余阶段任务仍需推进。
- docs drift strict 与 diff 检查通过；NormProof 图无环/导入解析满足，四个既有函数数量 advisory 保留。独立代码审查 APPROVE、架构 CLEAR；适配器仅面向当前接受非空文本的首个实体参数，后续若引入严格 ID 或改写参数的 parser，需重新验证位置契约，不能靠特殊占位值绕过校验。

### 8.58 SAFE-02：Git 枚举与忽略判断保留文件名原义

- 共享忽略 owner 的 ls-files 改用 NUL 输出，check-ignore 使用 NUL 输入/输出，消除 Git 引号转义及换行拆分导致的错误路径。中文、引号、Tab、换行和反斜杠到达遍历和 deny 检查时保留原名，core.quotePath 设置不再改变结果。
- 定向对照参考快照 owner 的 NUL 路径协议和冒号前缀保护决定：以 `./` 保护 check-ignore 的冒号开头文件名，并按输入映射回原名，同时保留调用方本来提供的 `./`。不采用参考的忽略 index 选项，本项目已跟踪文件继续可见；原有 fsmonitor 禁用、超时、输出上限与失败回退保留。
- 真实 Git 新增用例先复现 5 失败/8 通过；修复后 Linux、Node 20.3 隔离环境 6 文件/79 项及 build:ts 通过。覆盖 tracked/untracked、嵌套目录作用域、quotePath 两种设置、带换行的非忽略名字、冒号/pathspec 字面量、目录遗漏计数及精确目标 deny。列表分隔、忽略分隔、冒号保护三组反转均产生断言失败，源码逐字节恢复后 13 项通过。
- 编译工具注册表探针通过 glob、目录 read 和六种特殊文件名的直接 read，拒绝目标仍被拒绝，模型请求为零。首次探针把直接 owner 抛出的拒绝误当作结构化结果，按真实入口契约改为断言拒绝异常后通过，未改产品行为。本批不涉及终端交互，未重复 PTY，也没有非 Linux 实机证据。
- import cycles/config consumers/declarations/node floor 通过；NormProof 两项图义务满足，四个既有函数数量 advisory 保留。`8b6d8dbe` 与 `ba2a983a` 的 CI/Architecture Watch 均已成功；`779948d6` Architecture Watch 成功，CI `37412100764` 查询时仍在运行。本批远端结果另按新提交核对。
- SAFE-02 仍开放：原生 Git/搜索内部配置读取、创建副作用竞态和跨平台实际对象保证尚未解决；本批修复路径传输，不把候选过滤等同于原生读取隔离。CMD-03/04 复核与其余 Phase 19 任务继续。
- 两条独立审查给出代码 APPROVE、架构 CLEAR，核对恢复后的源文件 SHA256；均明确未重复父任务的测试与构建，没有把隐式读取缺口计为已解决。

### 8.59 SAFE-02：运行时 Git 查询取消与执行失败归因

- 文件枚举和目录忽略查询接入现有执行 owner 的异步子进程路径，传递父取消，保持 10 秒期限及 64 MiB 输出限额。取消在返回路径列表/启动回退前传播；成功结果使用完整字节流解码，跨块 UTF-8 不损坏。同步技能发现仍使用兼容查询，两种路径共用 argv、NUL 文件名规则和结果映射。
- 执行 owner 增加字面 stdin 与显式 EOF 支持，空输入也关闭管道；子进程提前退出的 EPIPE 由退出状态归因，其他输入失败和进程清理失败保留 execution_failure。清理失败关闭 stdin/stdout/stderr，保留待后续清理的 PID。Git 查询先识别此类失败，再处理取消或回退，不以空忽略集合、普通取消或文件遍历成功隐藏未确认的执行结果；错误不携带原始 stderr。
- 定向对照参考搜索工具的流式子进程与取消后停止流程，复用本项目既有进程树终止实现；没有新增 spawn 路径。同步 discovery 仍可能阻塞，原生 Git 内部读取权限也仍未解决，异步化不构成文件系统隔离。
- 新用例首次复现 5 失败/5 通过。独立审查随后指出执行失败被取消/回退覆盖、失败清理留下 stdin 待写，以及相对目录被 cwd 与 -C 重复解析；新增或强化反例产生 6 失败/29 通过。修正失败优先级、管道释放与单次绝对路径解析后，Linux、Node 20.3 隔离环境 25 文件/215 项和 build:ts 通过。串行组合仍报告 SIGINT/SIGTERM/SIGHUP/exit listener 数量警告，未抑制或改动无关行为。
- EOF、父取消转发、输出上限、执行失败优先级、失败清理 stdin、相对目录六组反转均产生断言失败，源码逐字节恢复后 39 项通过。首次扩大 EOF 反转用例使多个真实 Git stdin 查询逐次等待期限，夹具超时；源码恢复后改为每组只跑受影响用例，再取得上述有效反转证据，未将夹具超时替代断言失败。
- 最终编译产物在 regular/fullscreen 真实 CLI 中通过本地合成 HTTP 工具调用，glob 的 ls-files 与目录 read 的 check-ignore 均在 Ctrl-C 后约 55–65 ms 回收子进程，取消后下一次请求成功，每模式 3 次本地请求、exit 0，工作区标记不变。首次探针在回复文字出现后立即退出未在期限内结束；增加回合结束后的等待后，两模式通过，移除诊断计时器探针后也通过，未据此修改产品退出代码。该证据不代表外部真实提供方或非 Linux 实机验收。
- 原生配置读取、创建竞态和非 Linux 实际对象保证仍属 SAFE-02 未完成范围；同步技能发现的阻塞与 CMD-03/04 剩余复核也继续保留。`779948d6` 的 CI/Architecture Watch 均已成功；文件名修复 `c62e574b` 已推送、Architecture Watch 成功，CI `37412730106` 最近查询仍在执行，本批远端结果另按新提交核对。
- 修正后独立代码复审 APPROVE、架构复审 CLEAR，前述三项 findings 均关闭。五项静态门禁通过；NormProof 阻断义务满足，四个既有函数数量 advisory 与 docs drift 的 120 个非阻断来源路径 advisory 保留。

### 8.60 SAFE-02：实际枚举目标拒绝与工具权限名称校验

- glob 的实际枚举目标由 turn 适配器以显式 path 传入共享文件策略；补上 glob 的路径归一化，使含空格、Tab 的绝对文件名也能匹配相对拒绝前缀。pattern 继续按模式处理，不冒充文件路径。此前手写的文件遍历拒绝回调未覆盖这条生产接线，新回归通过真实注册表、hooks 和适配器验证原生与回退枚举、三个 permission scope。
- 工具和 browser 动作的只读表按自有属性判定，防止 constructor、__proto__ 等继承名称被当作只读而绕过 ask/accept-edits 审批。注册为 constructor 的扩展通过真实 turn hook 仍需审批，被拒绝后不执行。定向对照参考工具目录的显式名称集合与动作分派决定，保留本项目共享 evaluator 和既有计划模式语义，不新增策略系统。
- 初次回归 9 项失败/36 项通过；修复后 Linux、Node 20.3 隔离环境 8 文件/143 项及 build:ts 通过。glob 目标归一化、工具名成员判断、browser 动作成员判断三组反转均产生断言失败，源码逐字节恢复后 45 项通过。独立代码审查 APPROVE、架构 CLEAR，核对恢复后的源文件哈希，无待修 findings。
- regular/fullscreen 实际 CLI 使用本地合成 HTTP，各两次请求；拒绝目录中的普通、空格与 Tab 文件名均未出现在 provider 的工具消息中，工具正文精确为 public.txt，原文件字节不变，最终两模式 exit 0。
- PTY 夹具一度报告 fullscreen 未退出。退出链追踪未发现挂起；10 轮插桩和 15 轮无插桩的双模式诊断均退出成功。对夹具独立复现了两次 poll 之间进程结束时仍报失败的竞态（报告 missing CLI exit，但 exit=0）；复查退出后谓词即可消除该反例，最终未插桩双模式再通过。早先失败未记录退出码，不能据此确认其历史根因，也不能把增加等待称为产品退出修复；本批未改产品退出链。
- 四项代码静态门禁、diff 检查通过；NormProof 阻断义务满足，仍保留四个既有函数数量 advisory。`c62e574b` 的 CI/Architecture Watch 已成功；`3803c83b` Architecture Watch 成功，CI `37413770269` 最近查询仍在执行。本批远端结果另按新提交核对。
- SAFE-02 继续开放：原生 Git/搜索隐式配置读取、创建副作用竞态和跨平台实际对象保证未由本批解决；同步发现、CMD-03/04 剩余复核及 Phase 19 其他任务继续。

### 8.61 SAFE-02/04：搜索保留未确认的执行失败

- 原生搜索的版本探测、候选枚举和正文流先检查执行 owner 的 execution_failure，再判断父取消、输出/匹配限额、期限与 exit 1。明确的执行失败不再被转换为普通取消、无匹配或部分结果成功；工具入口保留安全的清理未确认消息，不启动回退遍历，也不转发原始 stderr。失败探测不写入“可用/缺失”缓存。
- 定向比较参考搜索工具在 close 后才汇总结果、区分 no-match exit 1、用户取消和限额终止的决定；保留该区分，同时采用本项目执行 owner 提供的更强清理失败证据。未复制直接 child.kill 或原始错误输出，也未新增执行器或进程追踪系统。
- 12 个新增回归首次全部失败，覆盖三个阶段、父取消、限额、exit 1、工具正文与缓存恢复。修复后 Linux、Node 20.3 隔离环境 8 文件/74 项及 build:ts 通过。探测、候选、正文、工具边界四组反转均产生断言失败，三个源文件逐字节恢复后 12 项通过。独立代码审查 APPROVE、架构 CLEAR。
- regular/fullscreen 真实 CLI 经本地合成 HTTP 调用搜索，向真实执行子进程注入第一次终止失败；provider 工具消息包含安全失败提示且不含合成诊断标记。失败返回后子进程确实仍存活，退出路径重试并回收已追踪子进程，两模式各两次请求、exit 0，输入文件字节不变。首次夹具启动失败来自扩展名为空的合成 rg 继承仓库 ESM package 类型，单独复现后在夹具 bin 内声明 CommonJS；未改产品模块加载或构建行为。
- 此修复保证已知执行失败不被搜索结果覆盖，不宣称解决不可捕获退出、逃离进程组的后代、原生隐式读取或非 Linux 实际对象保证。SAFE-02 与 Phase 19 其余任务继续。`3803c83b` CI/Architecture Watch 已确认成功；`f525b059` 已推送，Architecture Watch `37414807631` 成功，CI `37414807622` 最近查询仍在执行，本批远端另查。
- 五项静态门禁和 diff 检查通过；NormProof 阻断义务满足，四个既有函数数量 advisory 保留，docs strict 仍有 120 个既有非阻断来源路径 advisory。

### 8.62 SAFE-02：回退忽略规则保留字面语义

- 共用忽略解析器保留原始规则正文和根级 `/` 锚定；嵌套目录专用规则如 cache/ 在任意下层目录生效。声明目录前缀按字面转义并从根锚定，目录名中的方括号、星号、反斜杠、开头 #/! 与换行不被当作模式或注释。同步发现与已核验句柄读取继续共用同一解析器，没有新增 matcher，也没有改动原生 Git 的默认语义。
- 对照现有匹配库的原始文本输入、仅裁剪 ASCII 空格及原生 Git 对照原则，保留显著前导空格、转义尾空格、Tab 和 Unicode 空白。文件开头 BOM 在注释、否定和锚定分类前移除一次；正文其余字面内容保留。参考枚举实现区分仓库/非仓库忽略行为，本批保持该区分，不用回退匹配器替换原生查询。
- 最初 8 个回归全部失败，随后补充根锚定反例也复现失败。独立审查指出 Tab/Unicode 裁剪和 BOM 位移问题，修正前追加用例复现三项 BOM 失败；另一个 Tab 组合夹具被自身的 basename 规则覆盖，先通过真实 Git 确认，再拆成独立正反例。最终 Linux、Node 20.3 隔离环境 7 文件/70 项及 build:ts 通过，含 14 项精确 Git 对照、同步/异步 matcher 和回退遍历。复审代码 APPROVE、架构 CLEAR，先前 findings 已关闭。
- 正文空白、字面前缀、嵌套目录、根锚定、BOM、ASCII 空格六组反转均产生断言失败，源文件逐字节恢复后 14 项通过。regular/fullscreen 实际 CLI 隔离 PATH 使 Git 缺失，强制走回退枚举；本地合成 provider 收到的 glob 正文只包含 public.txt 与深层 anchored.txt，所有应隐藏名字均排除，原文件字节不变，两模式各两次请求、exit 0。
- 本批修正回退规则语义，为后续原生读取隔离提供可信基础；未宣称完整重现 Git 的全局/祖先配置、index 已跟踪例外或跨平台原生保证。SAFE-02 的原生隐式读取、创建副作用竞态以及同步发现阻塞仍待处理，Phase 19 整体继续。`f525b059`、`b856d602` 的 Architecture Watch 均成功，对应 CI `37414807622`、`37415257556` 最近查询仍在执行，本批远端另查。
- 五项静态门禁与 diff 检查通过；NormProof 阻断义务满足，四个既有函数数量 advisory 和 docs strict 的 120 个既有非阻断来源路径 advisory 保留。


### 8.63 TOOL-01：文本与 artifact 有界分页

- `read` 文本及 session artifact 改用 execution owner 的 readTextPage；registry 委派独立 read 工具定义，不再先读完整文件或在输出截断后保存整份源文 artifact。write/edit 的原文比较仍保留完整 readTextFile，不把分页内容误用于写前检查。
- 同一个已核验句柄上按 16KiB 块扫描，固定扫描上限 8MiB、文本输出与单行上限各 50KiB、默认 500 行/最多 1000 行；内部调用只可收紧预算。跳过的行不保留内容；选中行严格 UTF-8 解码，NUL 明确拒绝，保留 CRLF 和末尾换行，仅第一行去 BOM。总行数仅在实际观察 EOF 后提供，达到扫描上限即使恰好等于文件大小也不推测 EOF。
- 读取前后检查父取消与协作式 5 秒期限，结束后复核实际对象并释放句柄。工具元数据保留 bytesRead、stopReason 与确有意义的 nextOffset。独立架构审查发现固定扫描上限和巨型行后的续页提示不能推进；修正后这些分支不给 nextOffset，说明从头扫描的限制并建议按字节范围检查。此类限制不能通过增加行数绕过。
- 定向比较参考 read 的 offset/limit、输出限额和续页语义：保留有界输出与末尾未换行内容；拒绝先全量缓冲的方案，也不扫描剩余全文只为统计总行数。流式方案沿用本项目已核验句柄，不复制先检测后二次路径打开的方式。相应分页、单行/输出预算和 EOF 反转均有效。
- Linux、Node 20.3 隔离环境最终组合 14 文件/187 项及 build:ts 通过。早期三项旧总行数/巨型行精确大小文案按契约变化更新，一项 freshness 注入从完整读取改到真实分页入口；两项新边界测试发现第一行 BOM 余量和 deadline 后字节计数问题，已修复。单页预算测试通过真实注册表断言没有完整读取，不以输出长度代替读取量证据。
- 页数、扫描上限、单行上限、输出上限、EOF 真实性、最终对象校验、不可推进续页和 consumer 全量读取八组反转均触发断言失败，源码逐字节恢复后 30 项通过。第一次最终校验反转未失败，原因是夹具走到下一块前复核；将用例限定为本次读取即结束的单页后，反转确实失败。代码最终 APPROVE、架构 CLEAR，保留该测试缺口的修正记录。
- regular/fullscreen 构建 CLI 通过本地合成 HTTP 各五次请求，provider 收到两页正确正文、巨型行和扫描上限提示；实际文件句柄读量分别为 16KiB、16KiB、64KiB、8MiB，没有 readFile，全数关闭，两模式 exit 0。合成配置及 runtime home 均隔离，未使用真实凭据。
- TOOL-01 仍待目录/glob 遍历预算与取消的完整验收；SAFE-02 的原生隐式读取、创建竞态与非 Linux 实际对象保证仍开放。协作式期限不承诺抢占挂起的内核/NFS 调用，也不承诺并发修改下的一致快照。Phase 19 的 16 批/76 项总体目标继续。此前 f525b059 与 b856d602 的 CI/Architecture Watch 已成功；56afcb32 Architecture Watch 已成功，其 CI 最近已取得的状态仍为 in_progress，后续一次查询遇到网络 EOF，不计通过。本批远端结果另按新提交核对。
- 五项静态门禁与 diff 检查通过；NormProof 阻断义务满足，仍保留四个既有函数数量 advisory 和 docs strict 的 120 个既有非阻断来源路径 advisory。


### 8.64 TOOL-01：单目录增量枚举与资源上限

- directory owner 从一次性 readdir 改为 opendir 增量读取，原生预取固定 32 项，保留最多一万条名称和 1MiB UTF-8 名称字节，使用协作式 5 秒期限。达到上限时先观察必要的一个额外条目以区别精确边界与超限；返回显式不完整错误，不把部分名称数组当作完整列表。
- Linux 目录流通过已核验 FileHandle 的 proc 路径打开，定期及结束前复核目标，目录流和外层句柄分别释放；其他平台仍保留路径/身份复查，不声称同等描述符隔离。opendir 的文件系统顺序在返回前按 UTF-8 字节排序，保留原 readdir 的 libuv 顺序，以及 listing owner 原有目录优先排序、忽略与权限规则。
- 比较参考目录读取的排序、目录后缀和输出截断决策，保留这些呈现语义；参考方案仍一次性收集名称，不满足本任务内存界，因此使用本项目目录 owner 的增量读取。没有新增遍历平面或改动原生 Git 查询语义。预算和新目录流清理失败用显式类型穿过回退遍历，不能变为“没有匹配”。
- 独立审查发现取消先于 typed cleanup 传播会隐藏关闭失败，修正优先级后，取消与关闭失败同时发生的真实 registry/glob 回归要求保留 cleanup。复审代码 APPROVE、架构 CLEAR。另发现外层 verified FileHandle.close() 的既有未分类异常仍可能被旧回退 catch 吞掉或覆盖内层异常；此项留给读取 owner 的下一批修复，本批不宣称全链清理失败已闭合。
- Linux、Node 20.3 隔离环境最终 13 文件/147 项及 build:ts 通过，包含目录权限/替换、忽略、read/glob/grep、执行服务和启动文件补全。模拟百万条来源验证只调用 Dir.read 10001 次；真实目录流取消后 ERR_DIR_CLOSED。新增关闭断言最初将同步抛错误当 Promise 拒绝，按 Node API 修正捕获方式，保留精确错误码断言；组合测试出现 exit listener 数量警告，未改产品监听器或放宽阈值，尚未定位其来源。
- 条目数、名称字节、期限、关闭、字节排序、上层传播、清理优先级、最终身份校验八组反转均产生断言失败，源文件逐字节恢复后 19 项通过。最后一次身份校验用读取中途替换路径且本页立即结束的场景验证，不能由下一轮周期校验代替。
- regular/fullscreen 构建 CLI 各四次本地合成 HTTP 请求。包含 10020 项的真实目录由启动预热、read、回退 glob 分别触及，每个目录流只调用 Dir.read 10001 次并关闭；provider 收到明确限额错误，随后小文件仍正确返回，两模式 exit 0。夹具起初只预计两个工具读取，栈定位额外调用来自 warmWorkspaceFiles 后改为明确断言三类调用；没有将额外工作静默忽略。
- 本批只完成单目录资源界；整棵目录树的累计数量/深度/期限、忽略文件读量、原生隐式读取和外层句柄失败仍需推进，TOOL-01、SAFE-02 与 Phase 19 整体继续。56afcb32 的 CI/Architecture Watch 已成功；fe5e5978 Architecture Watch 成功，CI 37417292877 最近仍在执行，本批远端结果另按新提交核对。
- 五项静态门禁及 diff 检查通过；NormProof 阻断义务满足，四个既有函数数量 advisory 和 docs strict 的 120 个既有非阻断来源路径 advisory 保留。


### 8.65 SAFE-02：读取句柄清理失败保留到工具结果

- 已核验文件句柄和目录流共用 read owner 的 closeReadHandle 与 ReadCleanupError，移除上一批目录流单独的 cleanup 分支。关闭失败统一为安全的“句柄清理未确认”，不转发底层诊断；嵌套 finally 仍尝试释放每个句柄，不以抛出错误代替实际关闭尝试。
- 遍历、忽略规则、回退 grep 和 workspace symbol scanner 保留该错误，优先于取消与 best-effort 跳过。write/edit 的原文读取关闭失败继续阻止后续 writer，回归断言目标原文不变且 writer 未调用。直接 read/page/directory 也不能把结果改成完整成功或披露合成诊断。
- 原生搜索区分文件句柄清理失败与执行器的进程清理失败。复审发现两者同时发生时，后抛出的文件错误会覆盖已有 execution-failure；修正为搜索适配层记录已观察到的原生结果，保留 execution-failure 并附加 readCleanupFailed，工具同时呈现两项不确定性。共享关闭函数不依赖搜索结果类型。
- 定向比较参考搜索中 no-match、失败退出和取消的分离决定，保留失败分类；对本项目已观察到的额外清理失败采用更严格的保留规则，不因取消或另一类清理失败丢弃它。不引入第二执行器、资源追踪系统或自动关闭重试。
- 最初 12 个读取 owner 反例全部失败，确认旧路径的原始诊断、空数组/空 matcher 与取消覆盖。最终 Linux、Node 20.3 隔离环境 14 文件/171 项及 build:ts 通过，覆盖普通/分页/目录/忽略/嵌套句柄、回退与原生搜索、符号扫描、取消及 write/edit 零写。双重清理故障在适配器和真实工具层分别覆盖有/无取消。
- 关闭分类、目录复用、遍历、忽略、回退 grep、符号扫描、原生分类、双重故障和工具双事实九组反转均触发断言失败，七个源文件逐字节恢复后 40 项通过。两条独立审查在双重故障修正后分别 APPROVE/CLEAR。
- regular/fullscreen 构建 CLI 经本地合成 HTTP 各两次请求，实际子进程首次终止失败与父进程文件关闭失败同时注入。provider 工具消息保留两项失败且不含合成诊断；退出路径重试并回收已追踪子进程，两模式 exit 0，输入字节不变。插桩确认失败的文件句柄在进程退出前仍打开，故本批只证明失败传播与真实归因，不声称自动恢复、清理已完成或跨平台零残留。
- 这一批解决 §8.64 记录的外层关闭错误被回退吞掉的问题；整树累计预算、忽略文件读量、原生隐式读取、创建副作用竞态和非 Linux 实际对象保证仍未完成，Phase 19 总体目标继续。fe5e5978 的 CI/Architecture Watch 已成功；c247e32f Architecture Watch 成功，CI 37417994960 最近已取得的状态仍为 in_progress，本批远端结果另按新提交核对。
- 五项静态门禁和 diff 检查通过；NormProof 阻断义务满足，四个既有函数数量 advisory 与 docs strict 的 120 个既有非阻断来源路径 advisory 保留。

### 8.66 TOOL-01：累计遍历与忽略规则资源预算

- 每次 workspace walk/direct listing 持有一个预算，原生查询失败后继续使用剩余额度。固定上限为十万条枚举记录、一万个显式访问目录、16MiB 路径字节、1MiB 忽略文件原始字节、一万条规则、4MiB 展开规则字节、128 层和协作式 30 秒；内部调用只可收紧。目录 owner 在收集每项之前计费，忽略/权限过滤不能使已消耗工作不计入预算；单目录原有更紧的上限继续有效。
- 原生 ls-files 在保留输出块之前累计字节和 NUL 记录，超限取消子进程，待执行器结束后抛出明确的不完整错误，不重启回退遍历。单次 Git 期限取其既有十秒与累计剩余时间的较小值；已观察到的执行清理失败仍优先于限额。原生内部访问的目录、index、配置和忽略文件不可由这些 TypeScript 计数器观察，本批只界定输出及执行时间，不声称其内部工作被同样计费。
- 异步忽略规则读取在已核验句柄上使用 16KiB 块，跨目录累计实际读取量；只允许多读一个字节以区别精确 EOF 和超限，不应用部分文件规则。规则数量与转义/前缀展开后的字节在 matcher.add 之前检查。同步 discovery 兼容路径保持现有行为，尚未获得同等读取界与抢占取消。
- 深度界约束递归遍历、原生返回路径深度和回退祖先规则加载；直接列举且无需加载祖先规则时，不把目标路径的绝对/根相对深度当作额外拒绝理由。期限为协作检查，不能抢占挂起的内核操作，也不构成并发内容快照。
- 定向比较参考 find 工具的原生结果上限、取消后停止，以及仓库/非仓库忽略语义区分；同意停止已超额工作，保留本项目 Git/index 与回退 owner 的语义差异，不以弱化忽略语义代替安全边界。预算不新增执行器，失败清理事实继续穿过原有错误边界。
- 初次组合 99 通过/2 失败：一个旧夹具仍拦截 readFile，改为真实 handle.read 并保留原字节/旧路径拒绝断言；另一个期待超大 Git 输出重新回退，按本批契约改为断言 pathBytes 错误且无 opendir。独立代码审查另发现缺失/被拒绝的忽略文件可跳过期限检查；新增回归复现 1 失败/23 通过，修复入口、普通错误出口及祖先循环检查，继续保留 cleanup 优先级。补上精确 EOF 和原生已消耗计数传给回退的用例后，最终 Linux、Node 20.3 隔离环境 15 文件/199 项及 build:ts 通过。复审 APPROVE/CLEAR。
- 条目数、目录数、路径字节、深度、共享期限、忽略读量、规则数、展开字节、原生停止、回退计数、失败忽略期限、清理优先级十二组反转均产生断言失败；三个源文件逐字节恢复后 24 项通过。
- regular/fullscreen 构建 CLI 各运行回退与原生两个场景，每场景三次本地合成 HTTP 请求。回退场景的启动预热与 glob 均只读 1048577 字节、65 次 handle.read、零 readFile，随后关闭句柄；合成原生进程输出超过十万条时明确失败、已回收，零 opendir 回退。provider 工具消息保留限额错误，后续 small.txt 读取成功，四次 CLI 均 exit 0。配置和运行目录隔离，未使用真实凭据。
- 五项静态门禁与 diff 检查通过；NormProof 阻断义务满足，四个既有函数数量 advisory 与 docs strict 的 120 个既有非阻断来源路径 advisory 保留。本批不宣称 TOOL-01、SAFE-02 或 Phase 19 整体完成，原生隐式读取、创建竞态、跨平台实际对象和同步发现边界继续。c247e32f 的 CI/Architecture Watch 已成功；d046e142 Architecture Watch 成功，CI 37418686703 最近查询仍在执行，新提交远端结果另行核对。


### 8.67 CMD-04：文件引用复用异步补全生命周期

- `@文件` 请求接入已有 CatalogController，直接把其 AbortSignal 传给 listWorkspaceFiles；75ms 防抖、1.5 秒请求期限、界面/会话/工作区身份、草稿 revision/cursor 与迟到结果检查共用。有效命令实体位置仍优先，正文中的文件引用沿用原排名和精确替换，Tab 不提交。
- 删除 fileSuggestions 的进程级 Map、失效代数和独立 warmWorkspaceFiles 路径；input preferences 不再在启动或重载时无条件枚举工作区。成功空列表也缓存，多个界面不共享另一界面的缓存身份。候选保留最多 5000 个路径、展示最多 50 项，底层读取继续使用 §8.66 的资源预算。失败显示不可用/超时，未转发原始文件系统诊断。
- 对照参考自动补全的按需异步枚举、原生结果界、AbortSignal 和取消后停止的决定；同意将取消送到底层工作，复用本项目执行 owner 回收，不引入另一个直接 spawn/kill 路径。继续保留现有 Git 与回退忽略语义、字面文件名和已有候选替换规则。
- 首次冷查询现在等待异步结果并自动重绘，较大工作区可能显示超时。成功目录缓存十五秒、失败三秒，期限到期后的下一次更新才重读；本批没有增加整个目录树的递归文件变更监听，不声称闲置菜单会自动刷新。同步技能等 owner 的抢占取消与 CMD-04 其余边界继续。
- 九个新生命周期回归在接线前全部失败；随后补充独立界面缓存和真实 InteractiveMode 输入/Tab/Esc/stop 用例。首次扩大组合 282 通过/1 失败：测试在 lone-Esc 分序列等待结束前立即断言取消。按已核实的 StdinBuffer 语义等待实际派发，保持原 abort 断言，受影响 33 项复跑通过；未修改产品输入缓冲器。最终 Linux、Node 20.3 隔离环境 26 文件/283 项及 build:ts 通过。组合有既有 exit listener 数量警告，未放宽阈值或改动无关监听器。
- 引用请求接线、取消转发、迟到拒绝、空列表缓存、带引号替换和实际界面接线六组反转均产生断言失败；五个源文件逐字节恢复后 50 项通过。五项静态门禁及 diff 检查通过；NormProof 阻断义务满足，四个既有函数数量 advisory 与 docs strict 的 120 个既有非阻断来源路径 advisory 保留。
- regular/fullscreen 构建 CLI 各验证四次合成 Git 枚举：启动零枚举；Esc、期限和退出时真实子进程均被回收；成功查询不依赖下一次按键即显示含空格名称，Tab 形成正确带引号草稿。两模式 exit 0，工作区标记字节不变，使用隔离配置和 synthetic provider，无真实提供方调用。
- 独立代码审查 APPROVE、架构 CLEAR；架构提出的通用 loader 注释已改明路径/文件读取会传播取消。d046e142 的 CI/Architecture Watch 已成功；29c1edba Architecture Watch 成功，CI 37419991717 最近查询仍在执行，本批远端按新提交另核。Phase 19 的十六批/七十六项总体目标继续。


### 8.68 CFG-01：首批配置验证、来源与安全合并边界

- config owner 新增 fields/schema/layers/document/references，复用既有 Ajv，不增加依赖或通用深合并。所有当前 RuntimeConfigFile 字段与 CLI-only hook override 有 schema/source/merge 定义，类型覆盖检查随构建执行；这只是 CFG-01 的首批边界，不代表 provenance、trust 与 apply policy 全部接通。
- 普通字段保持 default → project → user，非法高层值保留已验证下层。CHEERS_MAX_TURNS 与已有 overrides 也校验。计数为安全整数；Node 计时值限定于其定时器可表示范围；温度仅检查有限数，模型能力交叉校验仍由后续工作补齐，不引入研究示例中的任意模型 token 上限。
- 项目 provider、连接、凭据、活动连接选择及 cacheWarming 不进入有效配置。先过滤来源，再验证与插值；仅用户凭据/连接 schema 明示的字符串叶子可解析 `$VAR`/`${VAR}`，`$$` 表示字面 dollar。替换文本不再次扫描，缺变量诊断且忽略该字段；键名、未知结构与项目字符串不读取环境。个人连接对象不跨来源拼接，自定义主题、browser-oauth 和缺失连接时间戳沿用既有归一化。
- 工具 allowlist 逐层取交集，disabled/prefix/deny 累积，MCP false 不被后层 true 放宽。语法损坏、无法读取、结构/资源异常、未知版本或非法安全字段在 overrides 之后投影为空 allowlist、通配 deny、MCP false 及 hook exemption false。真实工具门禁在 allow-all 下仍拒绝；这里只声明工具边界，不宣称 agentMode 初始化或完整网络隔离已修复。
- 文件读量最多 1MiB 加一个 EOF 探测字节，嵌套深度 32、节点数 50000；实际句柄必须是普通文件，只有 ENOENT 为缺失。任何层级的危险键被拒绝。环境展开另有每层累计 1MiB 界限。诊断只用受控字段/来源/code，不保留原始 JSON、未知键名、Ajv paths 或异常文本。
- 无版本标记继续作为现有格式；显式 `schemaVersion: 1` 标记同一格式，不自动给旧文件加标记。其他显式版本阻断加载并拒绝旧客户端写回。raw 读写保留顶层未知字段与占位符，已知嵌套形状非法时拒绝，尚无 JSONC 注释保留、重复键检测、版本迁移或跨进程字段 CAS。
- tuiSettings 的状态项/diagram 读取委托有效配置；两个叶子独立校验并保持 project-first，项目空状态数组仍回退用户选择，保存保留同层兄弟字段。状态项合法 ID 的声明尚由展示 owner 归一化，未宣称完整 registry UI/来源展示已完成。
- 独立代码与架构审查发现紧凑 JSON 大小校验与缩进落盘不一致：临界文档可能保存成功后超过读取上限。已在活动指针协调后序列化最终文本，按实际字节检查，再把同一文本交给原子写入 owner；回归证明拒绝时原文件字节不变。修正后的两路独立复审返回 APPROVE/CLEAR；审查者检查源码/测试/文档，未将主代理提供的运行结果冒充独立执行。
- Linux、Node 20.3 隔离环境 15 文件/258 项及 build:ts 通过。新边界最初 27 项在旧实现上有 26 项失败；后来增加实际 deny gate、格式化大小、当前版本、展开累计及 TUI 保存覆盖。四处历史断言依赖项目个人凭据/原值诊断，按新契约改为用户来源与安全诊断；连接补全夹具原本只有 accountId 的不完整 accountAuth 补全为合法合成认证形状，保留隐私和精确 ID 断言。
- 十二组有效反转覆盖来源、标量验证、allow/deny 合并、最终阻断、raw 写前验证、TUI 来源、单次展开、准确序列化、读字节/深度及未来版本。首次标量反转仅撤掉展开前验证，展开后验证仍挡住错误，因此该次未作为有效反转；随后撤掉两处才失败。逐字节恢复后 config/连接补全 79 项通过。
- regular/fullscreen 实际 CLI 各跑 deny/损坏 JSON/未来版本三场景，每场景两次本地合成 HTTP 请求。合法项目 deny 保留 read/write 声明但实际 write 被拒绝；损坏及未来版本没有工具声明，provider 越权发来的 write 仍失败。CLI --tools 无法放宽阻断，工作区 marker 与两份配置字节不变，合成凭据/环境秘密/损坏文本标记不进入终端，六场景均 exit 0。初次夹具只接受 denied 等词，真实返回为 Blocked/Refused；补齐拒绝文案断言后通过，未改产品行为。
- import cycles/config consumers/declarations/node floor/docs strict 通过；NormProof 阻断义务满足，保留既有四个函数数量 advisory 和 120 个 docs source-reference advisory。前批 29c1edba、fb659b65 的 CI/Architecture Watch 均已成功；本批新提交远端另核对。
- CFG-01 剩余 provenance、信任条件、生效边界及跨字段能力验证继续；CFG-02 的 JSONC/重复键/定位、CFG-03 锁与 revision reload、CFG-04 attentionOnIdle/settings 和 CFG-05 仍在计划内。SAFE-02 原生内部读取/创建竞态/跨平台保证与 CMD-03/04 剩余审计仍开放，Phase 19 整体继续。


### 8.69 CFG-02：有界 JSONC 解析与保留原文的配置编辑

- 现有 config.json/.cheers.json 路径直接支持注释和尾逗号，不新增更高优先级文件或重命名旧文件。新增精确依赖 jsonc-parser 3.3.1（MIT，无运行时依赖，发布包解压 212821 字节），使用成熟 visitor/parser/AST/scanner/edit API；未采用手写去注释、拼接数字或修补尾逗号正则。
- 有界文件读取保留 1MiB 加一字节 EOF 探测，严格 UTF-8 解码保留 BOM，非法编码拒绝且不改原字节。visitor 在构建值对象之前按 32 层/50000 节点阻断，并在首个语法错误、重复解码键、危险键或非有限数字立即抛受控错误，不接受容错 parser 的部分结果。空文件和仅注释的现存文件仍为无效文档，和不存在文件不同。
- BOM 在解析输入中替换成等宽空格，原文保持不变。解析错误内部保留 offset，报告增加一基 line/column，不输出原文或键名；位置按 parser 的 UTF-16 字符计数，不冒充 UTF-8 字节列。非法裸换行、未闭合注释、1/*x*/2、转义后重复键和一万层输入均有反例。
- 配置写入在现有 raw 快照上计算语义差异，仅编辑变化路径，保留未编辑原文、占位符、BOM/CRLF、数值字面量和注释。新文件仍使用受字节上限约束的缩进 JSON；已有紧凑文件不因一次小编辑被整体格式化，无变化时不写盘、mtime 不变。嵌套删除和显式空对象按旧顶层合并/字段替换契约处理。
- 每个补丁最多 128 个语义变更路径；逐次编辑按候选文本大小累计计费，限额 8MiB。删除一个属性可产生两个文本范围编辑；初始/最终解析和扫描器工作不计入此计数，另受单文档字节、深度与节点界限约束。所有中间结果和最终结果仍受 1MiB 界限。超限只发生在内存候选上，不落入部分写入。最终重新解析并按 JSON 值语义比对预期 raw 文档，防止语法有效但落到错误字段；再将同一文本交给既有原子写入 owner。
- 两路审查发现三个原文保留问题并已修复：上游首字段删除会带走头部/邻近注释；无 ID 记录数组重排会让注释对应错条目；JSON 往返与严格比较会把未编辑的 -0 改为 0。删除改为 AST 属性范围加 scanner 确认的一个相邻逗号，保留周围 trivia；变化数组仅在每个位置具有相同、唯一字符串 ID 时递归，否则整个变化数组替换（内部注释不承诺保留）；差异和最终核验统一按 JSON 数值语义视 ±0 等价，保留已有 token。精确字节、mtime、首/末/唯一含尾逗号字段、deny 重排和混合数组回归覆盖，复审返回 APPROVE/CLEAR。
- 对照本地参考中的成熟 JSONC parser、逐叶编辑与语法树装饰保留决策；没有采用参考中的原文错误回显、扩展名决定是否保留格式或无累计限额的逐叶重新解析。当前 writer 仍接受 raw snapshot，跨进程锁/CAS、冲突检测、提交后核验与 revision reload 继续由 CFG-03 完成，不把原子 rename 当作并发补丁保证。
- Node 20.3/Linux 下 16 文件/287 项及 build:ts 通过。新语法套件首轮 14 项在旧实现上失败 9 项；最终扩至 29 项。上一批临界大小回归按新行为细化为小补丁不扩展整份原文、超限最终补丁零写、新建超限缩进文档零创建，保留原有大小保护。十二组反转覆盖重复键、首错停止、提前深度、有限数、UTF-8、语义核验、操作/累计工作、删除注释、数组身份、负零和 no-op；逐字节恢复后 config 92 项通过。
- regular/fullscreen 构建 CLI 各使用本地合成 HTTP 完成受拒绝的 write，再实际执行 connect use second。配置包含 BOM、CRLF、注释、尾逗号、环境占位符、1e2 和 -0；逐字节比较证明只改变活动连接 ID 与第二条连接 updatedAt，其余原文保留。项目配置和工作区 marker 不变，合成秘密不进入终端，两模式 exit 0；未访问真实提供方配置。
- 单次本机成本探针（Node 20.3、276903 字节/36002 节点、10 次均值）中，原 JSON.parse 加结构检查约 5.52ms，JSONC 完整预检/解析/检查约 13.91ms，首次导入 syntax 模块约 14.80ms。这只刻画该进程与夹具，不代表完整 CLI 冷启动或跨平台性能；固定输入/编辑预算仍是工作上界。
- 安装依赖时出现既有 undici 7.18.2 的 engines >=20.18.1 与当前 Node 20.3 不一致警告；本批未改该依赖、Node floor 或构建脚本，当前 Node 20.3 实测结果如上，不宣称解决依赖声明差异。import cycles/config consumers/declarations/node floor/docs strict 通过；NormProof 阻断义务满足，既有四个函数数量 advisory 和 120 个文档来源 advisory 不变。前批 d93c7a60 的 CI 37423264223 与 Architecture Watch 37423264273 均已成功；本批提交另查。CFG-01 的完整来源/信任/生效 policy、CFG-03/04/05、SAFE-02 与其余 Phase 19 任务继续。


### 8.70 CFG-03：基线字段补丁、跨进程锁与保存结果

- [persistence](../../packages/ts-shell/src/config/persistence.ts) 持有显式、深冻结的 raw 编辑基线，记录目标路径、原文字节摘要或缺失状态；所有配置 writer 必须携带同一目标的基线。调用方给出的顶层局部值先覆盖基线，再推导真正变化，旧完整快照中的未改字段不再覆盖其他终端的值或复活其删除。未经确认的基线和错目标在 writer 前拒绝，不通过对象 spread 暗带版本。
- [conflict](../../packages/ts-shell/src/config/conflict.ts) 在锁内重读当前文档后做三方合并：普通对象叶子可独立变化，父对象的创建、删除或类型替换发生冲突时不复活旧结构；普通数组整体比较。每个 provider 凭据对象与每条连接记录整体保护，避免混合不同凭据代际；连接数组只有三方均为相同顺序的唯一 ID 时允许不同记录合并，并发成员增删或重排保守拒绝。已经完全等于所请求值的变化允许无操作重试。
- 活动连接同时检查引用与 provider 一致性，不再静默清掉第三方的新选择。连接/凭据修改依赖活动选择时，外部切换使旧请求冲突；选择另一条已有连接时，其整条记录必须仍等于基线或完整请求值。ID 比较复用运行时去空白语义，空 ID 按未选择处理，未编辑的原始拼写保留。
- 复用 [withFileLock](../../packages/ts-shell/src/session/store/sessionFileStore.ts) 与原子文本 writer；配置指定 local-dead 恢复策略，仅同机 PID 明确不存在时接管。读取与接管复查均遵循该策略，活进程、未知/异机 owner 和未完整写入的锁不能仅凭年龄被移除。既有会话消费者保留原默认恢复规则；清理观察者不会覆盖原始动作错误。
- 锁内完成 raw/schema 校验、三方合并和 JSONC 原文编辑，再检查当前精确文本/不存在状态；writer 返回后重新读取并核对最终字节。无变化保持 mtime。安全错误只携带受控代码：[outcome](../../packages/ts-shell/src/config/outcome.ts) 区分 unchanged（本次未调用配置 writer）、unknown（writer 已开始但最终内容未核验）和 persisted（内容已核验但锁清理失败），同时保留清理失败事实。成功返回仍兼容既有配置路径接口。
- connect、账户认证持久化、model、TUI 设置调用点均显式传递基线。model 在异步 PreModelSwitch 前捕获基线，hook 期间不丢失其他设置，也不把活动连接变化后的保存报告成成功；已有会话保存成功/全局失败仍分别报告。两种登录流程遇到配置保存异常时不再补写 error 状态；状态栏仅在保存成功后更新正式显示值。
- 定向对照参考设置管理器“记录修改字段、锁内读取当前文件后更新”的决定；没有复制其缺失文件先读后锁、直接覆盖文本与忙等待。这里保留已有有界 JSONC 编辑/原子 writer，并增加显式冲突及核验状态；字段差异、strict owner、前后核验、异步基线和登录补偿相关反转均触发行为失败。
- 独立审查发现并修复三项问题：模型 hook 期间切换同 provider 的活动连接导致成功报告失真；重复的已落盘选择被误判冲突；带空白/空 ID 的既有合法配置无法保存无关设置。修复后两路复审返回 APPROVE/CLEAR；代码审查者另外执行六个只读值探针，未将主代理组合测试作为独立执行证据。
- Linux、Node 20.3 隔离环境最终 19 文件/317 项与 build:ts 通过；包含真实双进程不同字段、缺失文件创建和同字段互斥、strict owner、精确原文及登录异常测试。13 组有效反转后源码逐字节恢复，恢复后 7 文件/142 项通过。首轮组合失败为旧夹具依赖隐式清除悬空指针，改为明确清除；首轮反转探针只接受 AssertionError 而拒绝预期配置异常，修正的是探针判定规则。
- regular/fullscreen 实际 CLI 使用独立 HOME 与本地合成 HTTP：受限写入被拒绝；本机活锁使 /connect use 超时且报告本次未写入，配置字节不变；释放锁后重试仅修改活动 ID 与所选连接时间。BOM/CRLF/注释/尾逗号/占位符/1e2/-0 保留，秘密未输出，项目与目标标记不变，两模式 exit 0。
- 保证限于参与同一路径锁协议的 writer。检查与 rename 之间仍存在非参与编辑器窗口，未宣称原子 CAS；父路径别名、多机文件系统和目录 fsync/断电持久性没有新增保证。未知/残缺锁可能持续阻断，需要确认 owner 后人工处理；不会冒险自动回收。账户 token 刷新仍沿用 provider 范围与网络返回后读取的基线，旧网络响应覆盖新登录的身份问题未由本批解决。
- CFG-03 的 last-good revision reload、候选发布与立即/下一轮/重启应用边界继续；CFG-01 的完整来源/信任 policy、CFG-04/05、SAFE-02 与其余 Phase 19 任务仍开放。import cycles/config consumers/declarations/node floor/docs strict 与 43 项脚本测试通过；NormProof 阻断义务满足，既有四项函数数量 advisory 与 120 项文档来源 advisory 不变。此前 76d4a7d7 的 Architecture Watch 37425003854 与 CI 37425003674 均已成功；本批提交与 CI 另查，不能据本地验证宣布整项或阶段完成。


### 8.71 CFG-03：不可变配置发布与副作用准入

- [state](../../packages/ts-shell/src/config/state.ts) 保存不可变有效配置、已接受偏好、递增 revision 和 workspace/session/trust/启动 overrides 绑定。候选 ticket 绑定 owner、代数和实际身份，只能消费一次；较旧、重复以及 A→B→A 前的候选不能应用资源。绑定转换先失效旧操作、保留设置并阻断准入，再按新绑定验证发布；不再用 raw reset 绕过主题准备。
- [configuration](../../packages/ts-shell/src/core/shell/configuration.ts) 从 projectRoot 读取，保留冻结的显式启动参数并投影会话模型。结构化 valid/securityBlocked 区分普通警告、普通非法候选和安全错误，不解析诊断文案来决定成功。普通拒绝保留整份 last-good；安全字段、语法、无法读取或结构失败额外锁住后续副作用，只有完整有效发布能清除。主题先准备再提交；准备失败保留旧设置和 palette，意外提交异常为 application-unverified，不声称资源已恢复。
- [application](../../packages/ts-shell/src/config/application.ts) 对现有文件字段完整声明生效时机，只显示字段名。主题立即应用；provider、工具池、上下文、重试等普通值在下一操作捕获。tui/tuiMode 保留当前实际安装值，requested 保存待重启偏好；重复 reload 仍显示待重启项。启动主题和显式状态栏保存由展示 owner 回报实际安装状态。
- 普通运行快照固定不等于授权固定。工具在审批后、PreToolUse 后、执行前及最终文件访问检查准入；声明 hook 在异步授权返回后、真实进程启动前重查；provider transport 在签名准备之前和异步签名之后的实际 HTTP 派发前重查。MCP 将同一 admission 传入队列、连接、目录发现、调用和 stdio 启动，命令入口与工具目录读取也接入。信任 revision 包含进程内 epoch 与文件对象元数据，只作失效标记，不替代授权或改变既有信任存储语义。
- provider bridge 读取已接受配置，主请求、自动压缩和缓存资源在账户刷新后使用同一最终解析结果；手动压缩、遗留摘要与 /btw 各自捕获操作快照。配置 agentMode 成为默认，显式会话选择仍优先。任何发布、拒绝、绑定转换或实际显示记录都会终止旧预热；成功 token 刷新也会保守停止该轮旧预热，可能到下一操作才恢复。账户刷新仍按 provider 范围写入、网络返回后取得基线，旧响应覆盖新登录的身份竞态未解决，不宣称凭据代际安全。
- /reload 明确区分 applied/rejected/superseded/application-unverified，键绑定仅在配置接受后重载；后续键绑定失败单独报告未核验。connect 通过成功持久化回调决定是否刷新，查帮助、无效选择和未保存操作不应用其他磁盘修改；model/connect 分别报告保存与发布结果。文本状态、模型/连接选择器及 TUI 初始化读取已接受配置，避免未经 reload 的文件编辑被展示成正在运行的设置。
- 定向比较参考设置管理器的重读和会话资源重建顺序，保留“设置与使用它的资源需要共同确定”的决定；未把分阶段重建当作跨资源原子事务。独立审查发现主题转换绕过准备、hook 授权后窗口、MCP 发现、异步签名窗口、磁盘状态读取、未保存 connect 刷新和待重启值混淆，均修正并加入回归；最终代码 APPROVE、架构 CLEAR。两个审查者接受预热的保守停止边界，并保留账户刷新持久化问题。
- Linux、Node 20.3 隔离环境最终 50 文件/742 项与 build:ts 通过。前轮失败主要为旧 raw runtime 夹具未构造新配置 owner；最后一个失败为新测试通过 guarded writer 写入悬空活动连接，改成合法但尚未接受的模型变更后，保留状态快照断言。未给生产路径增加缺配置时的放行分支。组合存在既有 exit listener 警告，未修改无关监听器。
- 十五组反转覆盖候选验证、安全锁定、代数、projectRoot、启动 overrides、主题提交、实际重启值、hook 授权后检查、签名后 HTTP、最终文件准入、MCP 连接后检查、provider 快照、两个选择器和确认保存后刷新，全部产生断言失败。十份源文件逐字节恢复并核对摘要，恢复后 8 文件/174 项通过；旧持久化批的反转没有充作本批证据。
- regular/fullscreen 构建 CLI 各发五次本地合成 HTTP 请求：直接编辑文件仍用旧模型；普通非法值和缺失主题拒绝后仍用旧模型；有效 reload 使用新模型、temperature 0.2 和仅 read 工具池；报告待重启模式；损坏配置在 HTTP 前阻断，合法恢复后继续请求。两模式 exit 0，合成秘密不进入终端，未使用真实提供方配置。
- import cycles、config consumers（40/40）、declarations（18 hooks/11 factories）、Node floor 与 docs strict 通过，43 项脚本测试通过。NormProof 阻断义务满足，整体 verdict 仍为 partial；既有四项函数数量 advisory 与 120 项文档来源 advisory 保留，没有把 advisory 当作全量架构通过。
- CFG-03 的并发字段保存与版本 reload 验收已覆盖；完整来源/trust policy、模型能力交叉检查、CFG-04 settings/attentionOnIdle、CFG-05、SAFE-02 和其余 Phase 19 任务继续。前批 aabd4c1e 的 CI 37427035177 与 Architecture Watch 37427035249 均已成功；本批提交与远端结果另核，阶段总目标保持进行中。
- 随后核对 e044f2b3：Architecture Watch 37430924121 成功，CI 37430924138 完整套件为 6539 通过、7 失败、1 跳过并有 1 个关联未处理错误，不能视为通过。五个漏入本地组合的测试文件仍手写旧上下文或调用旧 provider bridge 接口；已改用真实配置/context 工厂、publication 和模型保存后的刷新回调，保留原有历史、用量、恢复、会话模型与工具目录断言。修正后五文件/82 项通过，独立代码复审 APPROVE；新提交远端结果继续按 SHA 核对。


### 8.72 CFG-04：现有设置开关保存应用与终端提醒

- attentionOnIdle 补齐 RuntimeConfigFile、字段 schema、默认 false、project/user/显式 override 投影与 next-operation 生效定义。CLI 参数没有新增开关；现有 settings 和配置文件可设置，启动 override 接口保留明确优先级。非法类型使 reload 拒绝并保留 last-good，未用 truthy 字符串开启通知。
- [settings](../../packages/ts-shell/src/cli/interactive/settings.ts) 将既有持久化与发布 owner 适配给面板：打开时捕获用户文件不可变编辑基线；浏览、过滤和取消不写入；Enter 只接受一个精确合法选项，消费一次；会话/工作区转换后旧菜单失效。保存只提交所选字段，保留无关并发编辑和 JSONC 原文，不另建存储或锁。
- 面板固定显示“保存到用户配置”，同时显示当前实际值与用户文件值，当前行的选择光标不冒充已生效标记。两项状态使用已有右侧固定 note，真实 OverlayHost 在 80/120 列验证不被长说明挤掉。offline 复用网络 owner 的 isOffline，包含 CHEERS_OFFLINE 双向覆盖；本批没有改变环境优先级或 offline 的网络语义。
- 保存结果与应用分开。writer 的 unchanged/unknown/persisted-cleanup-failed 结果保留；成功返回后另读所选字段核验，随后才发布。若用户选中的值等于打开时基线，writer 可能保留其他终端的新值，这时报告所选值未确认且不刷新，不谎称保存成功。只有实际环境/冻结启动 override 能解释差异时才显示覆盖原因；其他差异提示配置已变化。发布拒绝或资源应用未知继续明确报告，不声称回滚。
- 交互宿主在每次操作开始捕获通知偏好，进行中的操作不会因 token 刷新等配置发布改变本次提醒决定。至少 30000ms、无等待队列、无待确认阻塞且终端未停止时，复用既有 BEL 与 OSC 777；默认关闭。保留“操作结束”语义和已有 editor 草稿规则，不把错误、中断或序列输出称为任务成功/桌面已展示。
- 定向对照参考的通知 registry/领域消费和 schema→设置面板适配，采用“当前消费事实与可写文件值分开、通知由生命周期 owner 决定”的决定；保留本项目默认 false、30 秒阈值与队列条件。未移植默认开启、额外通知协议或另一套设置/终端宿主。
- 两路独立审查发现并修复基线相同选择误报保存、把环境覆盖遗漏为有效值和常见宽度截断状态三项问题。对应回归包括并发选择保留、无法核验的读取错误、环境覆盖两方向和真实面板渲染；最终代码 APPROVE、架构 CLEAR。代码审查者独立执行了 80/120 列渲染探针，未把主代理测试当作其独立运行。
- 十三组反转覆盖文件输入/投影、菜单基线、所选字段核验、真实网络策略、发布接线、旧绑定、有效显示、状态可见性、操作快照、30 秒、队列和终端生命周期，均产生断言失败。五份源码逐字节恢复并核对摘要后，3 文件/30 项通过。初次选择器参数化用例错误地展开数组，修正为对象夹具，未添加容错放行。
- regular/fullscreen 构建 CLI 各使用隔离目录与本地合成 HTTP：从实际 /settings 开启；短请求零提醒；30.5 秒响应产生一次提醒序列；关闭后另一 30.5 秒响应不提醒。均为三次请求、exit 0，配置注释保留，合成秘密不输出。regular 首次探针未接受 80 列真实换行，确认落盘和输出后修正空白匹配并单独复跑通过，未修改产品。只证明序列发送，没有 OS 通知展示证据。
- Linux、Node 20.3 隔离环境最终 15 文件/265 项通过，包含前批 CI 暴露的五个夹具文件；build:ts 通过。import cycles、config consumers、declarations、Node floor、docs strict 与 diff 检查通过；NormProof 阻断义务满足但整体仍为 partial，既有四项函数数量及 120 项文档来源 advisory 保留。夹具修正单独提交为 75c27c1a，本批代码与远端 CI 另按实际 SHA 核对。
- CFG-04 的高级参数搜索/分组、完整 provenance、可选 project 保存范围与 pending/restart 展示继续，两个现有开关不代表完整设置系统。CFG-01 完整信任/模型能力 policy、CFG-05、账户刷新身份竞态和其余 Phase 19 任务保持开放。


### 8.73 CFG-01/04：随有效快照发布的配置来源基础

- config/provenance 按 schema 构造无值来源树，覆盖固定对象叶子、数组条目与开放 map 的位置条目。来源标签包含 default/project/user/environment/override、derived、session、runtime 和 safety；不保存原值、动态模型键、连接 ID、endpoint、环境变量名或凭据。环境插值仅记布尔标记，转义美元符号不误报为环境来源。
- 普通字段保持 user-first；TUI 按叶子保持 project-first，空 project statusItems 仍回退。安全 allow 交集、deny 累积、禁用集合与 false 限制记录合并贡献和遮蔽；非法值/禁止来源记受控原因，安全阻断产生独立 safety 来源。来源投影不决定值，不能绕过原验证和合并规则。
- 领域归一化后的值与来源一起投影；自动补出的连接认证类型、状态和时间记 derived，保留的输入归一化记 normalized。模型会话覆盖只标记匹配连接与 provider 的 model 叶子，凭据仍保持原来源。开放 map 位置仅对应同一份快照，不能当作跨 revision 的稳定 ID。
- ConfigState 将来源和数据一并冻结/发布；磁盘编辑与拒绝候选不会改写 last-good 来源。tui/tuiMode 待重启偏好的来源与当前安装配置分离，显式安装的显示变化标记 runtime 并保留未变叶子。这里描述配置输入及安装记录，不冒充渲染器归一化后的全部视觉默认值。
- 字段生效时机和敏感级别并入现有字段 registry；删除重复的生效时机表。个人来源约束与敏感级别分别声明，个人专属的 cacheWarming 不因来源限制被误分类为秘密。现有设置面板显示有效来源，offline 继续按实际网络 policy 展示环境覆盖，保存范围仍明确为 user。
- 对照参考中 runtime/overlay/project/global 来源查询、有效环境值与可编辑文件值分离的决策；保留本产品不同字段的既有优先级，不采用单一最高层查询冒充安全集合和嵌套来源。值合并与来源合并需要同步演进，本批用同一加载路径和反转回归保护这一维护边界。
- 验证：来源/配置/保存/会话覆盖/恢复/启动及面板组合 15 文件/243 项通过；初轮 22 项失败来自三个旧 shell 测试文件缺少新配置元数据的手造对象，改为复用真实 loader，保留原行为断言。Node 20.3 构建、import cycles/config consumers/declarations/node floor/docs strict 通过；NormProof 阻断义务满足，整体 verdict 仍为 partial，既有函数和文档 advisory 未被宣称解决。
- 11 组有效反转覆盖普通遮蔽、TUI、限制贡献、开放 map 隐私、derived、会话覆盖、安装来源、环境引用、安全来源和面板来源；七个产品文件逐字节恢复，恢复后 2 文件/18 项通过。两个初始反转先触发测试解引用错误，不计为有效证据；调整断言顺序/可选访问后全部由行为断言检出。
- regular/fullscreen 构建 CLI 在隔离 home/workspace 和本地合成 endpoint 下验证：打开面板不发 provider 请求；编辑磁盘后仍显示已接受来源，/reload 后显示新来源，环境覆盖可见，合成凭据未显示，退出均为 0。独立审查 APPROVE/CLEAR；高级字段编辑、分组搜索、可选 project 目标、pending/restart 详情面板仍继续，不能把本来源基础称作完整 CFG-04。完整 trust/模型能力校验、凭据刷新代际竞态、CFG-05 与 Phase 19 其他任务保持开放。


### 8.74 CFG-04：高级设置编辑、明确范围与显式应用

- config/settings 将 31 个可编辑条目的分组、说明和输入形状接到已有字段 schema/source/merge/application policy；TUI 展开为叶子，不纳入个人连接、凭据、元数据和 CLI-only hook override。搜索、命令说明和补全使用同一 registry，命令形式只提供说明。
- 面板依次展示字段、详情、暂存选择/输入和显式 Apply。浏览、选择、编辑、切换 scope 与取消不写盘；详情区分 effective/source、accepted preference、stored target、pending 和 restart。user/project 目标明确且选择器从当前 scope 开始，换范围丢弃暂存并重取目标基线。
- 复用配置 owner 的基线字段补丁，保存前后核验所选叶子，保留并发修改的其他字段和 JSONC 原文；显式 unset 删除该字段。只有核验保存后才刷新并报告实际应用，保留覆盖、拒绝与未核验状态。状态项和 diagram 的实际默认值来自渲染 owner，主题展示当前安装主题；会话 mode 优先于默认 mode 的事实单独说明。
- 在现有 overlay 增加步骤续接及输入表单，复用 Editor 的字素移动、换行、撤销和删除，输入上限 64KiB，拒绝粘贴终端控制字符。每次打开使用新选择模型，reload 保留当前模型；不可过滤面板不消费过滤键或显示过滤提示。异步续接检查 overlay revision 和退出状态，下一设置步骤存在时不释放排队任务。
- 独立审查发现并修复：状态项可保存未知 ID（改为 owner 合法集合和原状态项选择器，仅暂存、无实时写入）；合并限制误提示移除启动 override（仅 replace policy 使用该建议）；Enter 与粘贴同块时输入逸出（所有 Settings 步骤独立持有输入）。后者首次修复扩大到所有 exclusive 操作，已缩为 Settings 的 holdInput 计数并在 finally 释放，普通独占操作期间仍允许对话输入与排队。DEL/C1 显示转义保持 JSON 往返值。
- 对照参考配置编辑器的有效值/目标文件分离与设置元数据复用，保留本项目字段级优先级、限制合并和显式 Apply；未另建持久化系统或执行器。两路独立审查最终 APPROVE/CLEAR，代码复审另确认控制字符转义。
- 验证：较早扩大组合 75 文件/1085 项通过，其后 holdInput 收窄的受影响组合 4 文件/85 项通过，控制字符用例 1 文件/3 项通过。旧命令补全断言只列两个设置，按 registry 更新期望并保留非法参数拒绝；未用旧扩大组合代替最终增量验证。16 组有效反转均由断言检出，五个产品文件逐字节恢复后 5 文件/89 项通过。最终 Node 20.3 构建通过。
- 最终 regular/fullscreen 构建 CLI 各发一次本地合成 HTTP 请求：暂存/取消配置字节不变；Apply temperature 0.3 后真实下一请求携带 0.3；明确 project 目标只改项目 diagram，用户配置不变且显示重启要求；注释保留、合成秘密未输出、退出 0。同块连续键入/粘贴哨兵未逸出菜单，过渡期零请求。
- import cycles/config consumers/declarations/node floor/docs strict/diff 检查通过；最终 NormProof 阻断义务满足、整体仍为 partial，既有四个函数数量与 120 个文档来源 advisory 不视为已修复。此前 056a2ffa 与 0b6fec59 的 CI/Architecture Watch 均已成功，本批远端结果按新提交另核对。完整 CFG-01 trust/模型能力 policy、账户刷新代际竞态、CFG-05 和 Phase 19 十六批/七十六项总体目标继续。

§8.74 CI 补充：f9b008a6 的 Architecture Watch 37437275427 成功，CI 37437275426 失败。完整套件 647 文件/6597 项通过、1 项跳过，唯一失败文件为 btwCommandRuntime.test.ts 的模块加载：旧整模块 mock 只导出 getRuntimeConfig，共享命令目录经 settings 新增的 CONFIG_FIELDS 读取缺失。改为保留真实导出的局部 mock，原 side-question 参数、隐私和失败归因断言不变，隔离 Node 20.3 下该文件 13 项通过，独立代码复审 APPROVE。原远端失败仍保留，新提交另核对。


### 8.75 CFG-05：会话模型选择基线、准入与持久化核验

- session/model 在异步选择前捕获不可变基线，锁内校验选择、modelRevision 和项目绑定；每次真实变化写入新的选择 revision，生命周期保存保留它，A→B→A 也使旧请求失效。同值选择不写文件或更换 revision；并发新增的提示、usage 等状态按锁内重读保留，不从旧完整快照覆盖。
- 复用既有原子 writer 和文件锁，采用仅恢复明确死亡本机 owner 的规则；写前再读当前快照，写后重新读取完整结果。拒绝缺失、损坏和非法状态，不重建已删除会话。受控错误区分 unchanged、unknown、persisted 与独立 cleanupFailed，原始 I/O/状态内容不进入命令输出；未核验会话保存不继续写全局默认或发布成功 hook。
- 模型修改行为从兼容命令文件移入 model/selection owner。选择使用已接受的 fromModel；对照当前 loader 归一化后的活动连接和 provider credential 身份，允许会话 model 覆盖及派生时间变化，但拒绝相同 ID 的认证、端点或凭据替换。项目绑定与命令明确提供的 projectRoot 不一致也拒绝。
- PreModelSwitch 后复核准入；会话 writer 接受同步 boolean guard，在实际取得锁后、包括 no-op 分支之前复核准入、raw 活动连接和凭据，避免锁等待扩大竞态窗口。裸 /model 菜单从实际 InteractiveMode host 捕获同一 configurationAdmission 和 projectRoot；会话切换、信任变化或工作区变化不能由菜单遗漏参数绕过。
- 定向比较参考模型切换的可用性先验、显式默认保存、模型选择后处理 reasoning 的决定。采用变更前检查与显式范围，不照搬先修改内存再追加独立记录的次序。本批加强现有 model-only 路径，尚未接入 model/effort 一致候选；也不宣称两个文件的崩溃原子性、远端模型一定可用或完整 CFG-05。
- 独立审查依次发现菜单未传准入、相同 ID 身份替换、锁等待期间复核缺失，均补实测回归。归一化修复又暴露仅含 model 的会话凭据槽与不存在槽不等价，连续选择回归在第二次选择明确失败；现已将空身份统一为空，连续选择和同值重选可用。两路最终复审 APPROVE/CLEAR。
- 验证：第一次三文件组合 42 通过/3 失败，分别为 null 被既有必需读取器归类 read-failed 的预期差异，以及两个未命中的清理故障注入；调整夹具为真实锁 token 替换，保留状态/隐私断言后通过。较早扩大组合 13 文件/132 项通过，最终归一化修复后 4 文件/55 项与 Node 20.3 构建通过。声明 gate 只匹配双引号 eventName，恢复原写法后通过，未改门禁脚本。
- 13 组反转均由行为断言检出，覆盖选择版本/绑定、完整核验、生命周期保留、清理失败、锁内 guard、异步基线、连接身份、菜单准入及空身份等；四个产品文件逐字节恢复后 3 文件/45 项通过。首次生命周期反转引入 undefined，先被完整序列化核验挡住，未计为有效断言反转；改为合法 JSON null 后由保留提示的断言检出。
- regular/fullscreen 构建 CLI 各经本地合成 HTTP 两次请求：在实际 session writer 调用点注入“返回但未保存”后，/model --global 报 verification-failed，用户配置与会话选择不变，下一请求仍为 base-model；移除故障后 session-only 保存成功，下一请求为 session-model，退出保留 modelRevision，合成凭据不在终端或会话选择中。首轮合成服务漏 GET 就绪接口，产生 HTTP 501；补齐夹具接口后通过，未改产品 readiness。
- 本批 import cycles/config consumers/declarations/node floor/docs strict/diff 检查通过，NormProof 阻断义务满足、整体 partial，四项既有函数数量和 120 项文档来源 advisory 保留。原 f9b008a6 CI 失败及独立夹具修复见 §8.74 补充；107126aa 的 Architecture Watch 37438947968 成功，CI 37438947980 最近取得的状态仍为 in_progress。--global 的会话与配置写入仍是分步操作，其后半失败可能留下已保存会话选择，现有部分结果报告继续保留；后续需要与 effort/capability 一起完成 CFG-05，CFG-01 信任/能力 policy、账户刷新代际安全与 Phase 19 其余目标继续。


### 8.76 CFG-05：模型与 effort 联合选择、请求快照与全局失败补偿

- [effort 声明](../../packages/ts-shell/src/core/models/effort.ts)、[能力 policy](../../packages/ts-shell/src/core/models/capability.ts)与现有 selection owner 共用 low/medium/high/null。`/model use <model> --effort <level|auto>` 和 `/thinking <level|off|auto|none>` 联合校验并保存完整 model/effort，会话默认、显式 `--global` 才修改用户默认。auto/off/none 表示 provider 决定，不代表关闭推理。没有具体模型时 effort-only 操作明确拒绝，不把显示占位词保存为模型 ID；旧空白连接 ID 经真实 loader 归一化。
- 可选 effort 进入连接、provider profile、session record 的 schema/normalizer/projection/provenance。同一记录中的 null 阻止下层继承，只有缺值继续读取连接、profile 和旧项目 effort。旧项目状态仅作操作开始时捕获的兼容后备，新命令不再写项目状态；恢复和切换会话保持独立。凭据身份比较排除 model/effort 偏好，完整凭据不进入会话选择。
- 已知 reasoning:false、compat 拒绝或 level map 的 null 在写前拒绝；不同 wire 名称仍是合法映射。目录没有模型只能说明未验证，不能证明不存在，因此保留自定义 ID 并显示目录刷新/配置提示；包括 provider-decides 选择与未立即应用的结果。异步 hook 后、状态锁内复核模型元数据、endpoint、输出上限与原有连接/准入依赖，迟到候选不能覆盖新选择。
- 协议声明自己的最小 reasoning 输出需求，[预算校验](../../packages/ts-shell/src/provider/endpoints/effort.ts)在选择和实际请求前共用。预算型 endpoint 的未知模型也得到预算；输出 cap 无法容纳预算时拒绝显式 effort，不抬高 cap、不静默删除 thinking。预算仍可在合法 cap 内收窄，不宣称某个 level 必然消耗固定 token。选择校验使用即将重新加载发布的 cap；已接受 4096/磁盘 1500 与反向变化均有回归，支持的启动 overrides 保留。
- invocation 在 readiness/异步续期之前捕获 effort；主请求、重试、后续 step 和命令环境使用同一捕获。显式 effort 遭 provider 拒绝时保留偏好并给受控失败，不删除 effort 重发；旧项目后备保留既有兼容重试。委派复用同一 step，预热使用实际捕获 payload；旁路问答与压缩保持已有 provider-decides 的简单请求语义，不额外继承主会话 effort。
- [会话写入 receipt](../../packages/ts-shell/src/session/model/state.ts)区分已核验实际变更和 no-op。global 明确未写时，按当前 revision/root/完整 pair 检查后恢复本次会话变更，合并无关生命周期字段并生成新 revision；no-op 无补偿权限。较新选择、ABA、重绑和删除阻止恢复；global 未知或已核验但清理失败不猜测回滚，也不刷新发布 unresolved 状态。两个文件之间仍不具备崩溃原子性，部分/未知结果保持可见。
- 定向比较参考模型控制中的 auth/capability 先验、显式全局保存与 auto 独立状态。采用其范围与配置状态区分；本契约对已知不支持的 level 明确拒绝，不采用静默选择邻近 level。参考中的顺序保存不作为跨文件原子性的证据。
- 验证：扩大组合 24 文件/526 项通过；最后 publication-cap 修复后 2 文件/55 项通过，最终 Node 20.3 构建通过；19 组有效反转全部触发断言，8 个产品文件逐字节恢复，恢复后 4 文件/142 项通过。反转覆盖 null、投影、能力、目录、捕获、拒绝、输出 cap、未知模型预算/提示、具体模型、receipt revision/no-op/ABA 与 global 补偿。初版 fresh-revision 反转制造 undefined 被保存核验提前拦截，不计有效；改为合法旧 revision 后由断言检测。no-op 反转初次是未包裹的受控异常，增加明确“不抛异常”契约断言后才计入。
- 测试过程分类：新增临时 workspace 缺 .agents 根标记导致隔离 home 内项目后备污染，已补标记并换新隔离 home；重试参数与新增参数表展开错误属于夹具问题，修正后保留原行为断言。独立审查修复未知模型+null 漏提示、effort-only 占位模型、预算型未知模型遗漏、过小 cap 遗漏与 accepted/publication cap 混用，最终 APPROVE/CLEAR。
- regular/fullscreen 构建 CLI 各五次实际本地 HTTP：模拟 session writer 返回但未保存，下一请求仍使用原模型；成功 session high 发 xhigh；服务端拒绝后没有删除 effort 重发；auto 请求省略 effort；显式 global low 同时进入默认记录和下一请求。已知不支持组合保持两份保存状态，revision 退出后保留，终端与会话不含合成凭据，受控失败不输出合成响应详情。初版探针误把 session 路径限定在测试 data 目录，改为隔离根实际 session 布局后通过，未修改产品路径。
- 先前 ffcbf09c 的 CI 37439272856 与 Architecture Watch 37439272847 均成功；107126aa 的 CI 37438947980 与 Architecture Watch 37438947968 也均成功。原 f9b008a6 CI 失败记录仍保留。本批远端按新提交核对；CFG-01 完整信任/能力 policy、账户刷新身份竞态及 Phase 19 十六批/七十六项总体目标继续。

§8.76 门禁补充：最终 import cycles/config consumers/declarations/node floor/docs strict/diff 检查通过；NormProof 阻断义务满足、整体 partial，四项既有函数数量 advisory 与 120 项文档来源 advisory 保留。

### 8.77 CFG-01 前置：统一项目信任判定与可核验保存

- 信任行为移到 [trust owner](../../packages/ts-shell/src/core/security/trust/store.ts)，旧 projectTrust 仅兼容导出。单一 decision 区分 trusted/untrusted/undecided/unavailable；缺失不创建文件，损坏、未来版本、超大、非普通或不可访问文件均 unavailable，现有资源拒绝谓词在 unavailable 时关闭。undecided 保持既有资源兼容行为，本批没有把启动过程描述为已经建立肯定信任。
- 持久父目录拒绝优先于子目录允许；临时授权只覆盖同一规范路径的持久拒绝，其他覆盖拒绝仍有效。session-only 明确为当前进程，不跨恢复/新进程；持久保存（含 no-op）、所选文件路径或对象版本变化使临时授权失效。读错误导致授权清除时也增加 revision。
- 保存的允许保留批准时路径身份，不跟随后来替换的符号链接扩大到新目标。拒绝保留原路径和旧别名的保守边界；显式选择别名可迁移该条记录，仅选择新目标不会删除其他已保存路径的拒绝。路径范围使用真实边界，合法的 ..cache 子目录不被误判为向上逃逸。
- [来源解析](../../packages/ts-shell/src/core/security/trust/source.ts)每次按既有当前/旧版目录顺序查找，只有确认缺失且祖先目录可访问才后退。悬空文件/目录链接、权限错误不能落到旧允许。revision 同时包含来源路径、链接条目及目标文件元数据，缺失与不可用不同；新建悬空链接在任何 decision 读取之前就会使配置准入失效。
- [持久化](../../packages/ts-shell/src/core/security/trust/storage.ts)复用有界配置读取、现有严格本机锁与原子文本 writer。锁内重读保留无关记录，写前复核来源/精确文本，写后核验完整文本和当前权威路径。只有当前用户目录接收写入，旧目录只读；受控错误区分 unchanged/unknown/persisted 及 cleanupFailed，不输出原始文件内容或 I/O 错误。
- /trust 使用 projectRoot，保存结果和实际生效判定分别显示；记录子目录允许时仍可明确显示父目录拒绝。只有核验成功才刷新现有配置发布，未知/失败不声称 Recorded。准入同时检查已接受 publication 的 trust revision，捕获一个新操作不能绕过未重载的旧配置；成功本地刷新终止旧后台信号。没有新增文件 watcher，不宣称外部编辑立即取消所有运行中的资源。
- 定向对照参考的单一信任决定、明确拒绝与缺失区分、信任变化重读项目设置。保留本项目覆盖拒绝优先，不改成一般最长前缀允许；参考默认 trusted 参数不作为启动授权证据。当前锁协议仍不保证非参与 writer 的原子 CAS、跨文件崩溃事务或目录断电持久性。
- 两路独立审查发现并修复允许随链接迁移、不可访问来源回退、读失败清除授权未改代数、别名保存误删旧拒绝、缺失到悬空状态未改 revision。最终代码 APPROVE、架构 CLEAR；两位审查者仅静态审查，没有将主代理测试当作其独立运行。
- 验证：较早消费者组合 23 文件/247 项通过；最后路径与 revision 修正后定向 7 文件/113 项通过。16 组反转均触发行为断言，5 个产品文件逐字节恢复，恢复后 2 文件/35 项通过。最终 Node 20.3 构建、五项静态 gate、43 项 gate 脚本测试及 diff 检查通过；NormProof 阻断义务满足，整体 partial，四项既有函数数量与 120 项文档来源 advisory 保留。
- regular/fullscreen 实际构建 CLI 各发两次本地合成 HTTP：writer 返回但未写时不报 Recorded 且文件不变；临时授权生效而另一个真实进程仍读取持久拒绝；/trust off 刷新后模型保存和请求可用；另一个进程改变信任后请求在 reload 前被阻断，重载后恢复；损坏内容和合成凭据不进入终端，两模式退出 0。
- 上一 07ac99fd 的 Architecture Watch 37442106195 成功，但完整 CI 37442105264 失败：648 文件/6682 项通过、1 项跳过，3 文件/7 项失败集中在旧 thinking 持久化接口、显示文本及新增 effort/global 补全预期；此失败不由本地窄测试改写。修正与新提交远端结果单独记录。CFG-01 逐字段信任 policy、账户刷新身份竞态和 Phase 19 十六批/七十六项整体继续。

§8.76 CI 修正补充：07ac99fd 的三文件/七项失败均为模型/effort 契约更新遗漏的测试迁移：newCommands 仍导入已移除的 getThinkingEffort、无 session 上下文却预期项目级保存，并预期 provider 静默忽略；两个补全文件仍期待旧 flags。改用真实隔离配置和 SessionManager，断言保存后恢复、同项目另一会话不变、全局字节不变、null provider-decides 与非法输入零保存；精确补全文本增加 global/effort，并检查 effort 值和已完成位置无候选。6 文件/120 项组合（含模型与新信任用例）通过，独立代码复审 APPROVE。没有修改产品行为或将原远端失败改写成通过，新提交 CI 另行核对。

### 8.78 CFG-01：字段信任过滤与配置身份绑定

- [fields](../../packages/ts-shell/src/config/fields.ts)为所有输入声明 projectTrust，默认 required；safe 仅含 schema 元数据、已有单调工具限制、提醒开关、受控 TUI 值。预算、采样、上下文、队列、超时和主题选择需要肯定信任；保留 instructionBudgetBytes:0、offline:true、agentMode:plan、retryEnabled:false 与两层 retry count:0 的禁用/收紧语义，不能因过滤回到更宽默认。个人 provider/连接/cacheWarming 与 CLI-only hook override 的来源禁令继续优先，不因 trusted 放开。
- [layers](../../packages/ts-shell/src/config/layers.ts)接收显式信任决定，没有默认 trusted 分支；合法来源先校验，再执行字段信任过滤，用户/environment/冻结启动 override 保持原规则。信任拒绝只忽略项目值，不把其余有效用户/默认配置判为无效；非法安全输入仍在 overrides 后阻断工具。普通 user-first、限制交并/deny/disable、TUI 叶子 project-first 与空列表后备保持不变。
- TUI 子字段各自消费 policy，拒绝原因跟随对应 provenance 叶子，即使最终来自用户后备也不丢失。受控诊断区分 trust-not-established、trust-denied、trust-unavailable，不回显原值、未知键或信任文件内容。未建立信任的项目现在不会自动提供上述 required 字段；可通过 /trust 查看并明确选择持久或本进程信任。保存项目偏好不自动建立信任。
- [trust 绑定](../../packages/ts-shell/src/config/trust.ts)在读取时保存 canonical workspace、信任 revision 与决定。解析一次项目根后，判断和项目配置路径共用该根；不分别通过可变别名取得身份、授权和配置。首次 context 遇到旧信任或最终恢复目录不同会重新加载，并使用候选捕获的身份绑定，不能把较新的 revision 贴到旧值上。
- 重载在资源准备前及发布前核对候选自身绑定，ticket/live 身份检查继续保留。别名在开始/读取/结束之间发生 B→A→B 也不能将 A 的配置发布给 B；已接受目录身份变化会阻断旧操作和新操作，直到有效重载。启动诊断来自最终发布 context，信任授予/撤销和 child→parent 恢复都不再输出被丢弃输入快照的提示。
- Settings 保留明确 user/project 范围和可核验原文保存；信任过滤后报告“已保存、项目值未启用”，即使值恰好等于当前默认、模式或主题也不称已应用。详情显示项目值未启用及原因；后续肯定信任+有效 reload 才转为项目来源。
- 定向对照成熟参考的未信任项目设置排除与信任变化重读，采用明确项目权威和重新构造快照的决定；保留本项目字段级安全例外及既有合并顺序。首次读取、选择器保存和重载均使用现有配置/会话 owner，没有另造存储或执行路径。
- 独立审查发现并修复：初始快照被标上后来的身份、保存值等于默认时误报启用、TUI 叶子 policy 未消费、重载候选别名 ABA、启动旧诊断、loader 内别名解析不一致。最终代码 APPROVE、架构 CLEAR；审查为静态检查，没有将主代理测试描述为独立运行。
- 验证：扩大组合 55 文件/790 项通过；最后 canonical/绑定修正后 5 文件/81 项通过。首次组合 18 项失败是旧合并/来源夹具未建立项目授权，已仅在对应场景显式授予进程信任，原预期不削弱，未批量默认信任所有测试。16 组有效反转覆盖肯定信任、默认 required、安全例外、缺失区分、loader 接线、TUI policy/来源、初始绑定/目录/revision、已接受目录、重载候选、启动诊断、保存反馈及 canonical 判断/读取；8 个产品文件逐字节恢复，恢复后 3 文件/62 项通过。
- 最终 Node 20.3 构建及五项静态 gate/diff 检查通过；NormProof 阻断义务满足，整体 partial，四项既有函数数量和 120 项文档来源 advisory 保留。最终 regular/fullscreen 构建 CLI 各三次本地合成 HTTP：未授权→授权→撤销的 temperature 为 0.7→0.2→0.7，输出 cap 为 4096→2222→4096；零指令预算始终阻止夹具正文进入请求，工具始终只提供 read，用户配置字节不变、合成凭据不输出，退出 0。
- 边界：这批约束项目配置值，未把其他资源的 undecided 兼容规则改成肯定信任门槛。已识别 [主题发现](../../packages/ts-shell/src/presentation/themes/index.ts)仍允许项目主题文件覆盖同名内置/用户主题，因此过滤 config.theme 不等于隔离所有项目主题资产；该资源 owner 问题留待独立修复。不宣称目录/文件系统原子快照、外部文件编辑即时取消或跨文件事务。账户刷新身份竞态、剩余能力交叉验证及 Phase 19 十六批/七十六项总体继续。
- 信任前置 cefce882 与上一 CI 修正 0d4e51c1 已推送；0d4e51c1 的 Architecture Watch 37444445554 成功，CI 37444445566 最后查询仍 in_progress。07ac99fd 的原 CI 失败记录保留；本批新提交和远端结果另按实际 SHA 核对。

### 8.79 CFG-01：项目主题资源的肯定信任与观察路径

- [主题发现](../../packages/ts-shell/src/presentation/themes/index.ts)对自动项目目录及实际主题文件分别检查 canonical 路径的肯定信任。undecided/untrusted/unavailable 均不读取这些主题正文，也不把其名称或解析错误加入列表；默认 dark 不再被未授权项目文件覆盖。子目录授权不延伸到祖先主题，项目根授权不随 .agents/themes、.agents 或工作区链接转移到外部目标。
- 用户主题目录和 CLI 明确指定的文件/目录保持用户输入权限与最后覆盖语义。主题所在目录被授权后，读取使用已解析路径；逐文件检查处理目录枚举后的链接替换，整轮自动结果在所有自动及显式路径读取结束后核对 trust revision。变化时丢弃自动结果，保留用户与显式结果；不承诺对非参与文件系统修改的原子快照。
- load/list/source/watch 继续共用主题 owner。成功 /trust 配置刷新重装调色板，现有交互路由按 colorRevision 重绑 follower；待执行的文件重载重新发现资源，不安装已撤销来源的新颜色。若用户明确选择的名字只由被撤销项目提供，配置准备仍按既有契约拒绝候选、保留上次调色板和设置，并因信任绑定变化阻止新操作，不能称为已应用。没有新增信任文件的即时调色板撤销承诺。
- [补全观察](../../packages/ts-shell/src/cli/interactive/completion/catalog.ts)跟踪全部信任来源，并在事件后重新计算目标。元数据观察同时覆盖 lexical/canonical 项目目录链的 root/.agents/themes 路径和获准实际目录；观察目录变化不授予正文读取权限。覆盖工作区别名指向项目子目录、资源来自 canonical 祖先的情况，链接替换后继续跟踪新目标，停止后不再回调。
- 定向对照参考的肯定信任自动资源门槛与单独 CLI 路径，复用现有信任、配置发布和观察机制。现有项目目录与用户目录的历史合并顺序保持不变；已确认它们与“近目录/当前用户目录优先”的文字说明不一致，作为独立优先级问题继续，不把这次安全修复混同为顺序调整。
- 独立审查修复：最终 revision 校验早于显式路径 I/O、外部授权后未重绑观察、canonical 路径遗漏 lexical 链接事件，以及链接工作区遗漏 canonical 祖先资源路径。最终 APPROVE/CLEAR，两路为静态审查，未冒充独立运行主代理的验证。
- 扩大组合 36 文件/427 项通过；最后观察目录链修正后 2 文件/24 项通过。初轮 35 文件出现 4 项失败：主题补全项目夹具缺明确授权，三个工具列表模式改 root 却保留旧 ConfigState 绑定；仅修正对应夹具，原列表、调用次数、文件变化及无应用断言保留。9 组有效反转均由行为断言检出，2 个产品文件逐字节恢复，恢复后 2 文件/24 项通过。
- regular/fullscreen 最终构建 CLI 验证：未授权时主题名称/正文不出现，授权后安装项目颜色，编辑文件触发重绘，撤销后恢复后备颜色，后续被撤销文件编辑不生效；用户配置字节不变、合成凭据未显示、零 provider 请求、退出均为 0。最终 Node 20.3 构建、import cycles/config consumers/declarations/node floor/docs strict/diff 检查通过；NormProof 阻断义务满足、整体 partial，四项既有函数数量与 120 项文档来源 advisory 保留，新提交远端另按实际结果核对。
- 0d4e51c1 的 CI 37444445566 与 Architecture Watch 37444445554 已成功；89928a66 的 Architecture Watch 37446385293 成功，CI 37446385274 在本次查询时仍进行中。原 07ac99fd/f9b008a6 CI 失败历史保留。剩余能力交叉验证、账户刷新身份竞态及 Phase 19 十六批/七十六项总体目标继续。

§8.78 CI 补充：89928a66 的 CI 37446385274 最终失败，完整套件 653 文件/6741 项通过、1 项跳过，唯一失败文件的三项均为 interactiveCommandRouter 的工具列表夹具改项目目录却未重绑 ConfigState。该问题已在 f12c4c57 的主题消费者扩大验证中发现并修正，25 项路由测试及 427 项组合通过；原失败保留。f12c4c57 的 Architecture Watch 37448147983 已成功，CI 37448147913 在本次查询时仍进行中。


§8.79 CI 补充：f12c4c5775192f60ea647fd9ffe16edadeb9d105 的 CI 37448147913 与 Architecture Watch 37448147983 均成功；上一 89928a66 的失败记录保留。

### 8.80 CFG-03：账户续期身份、条件保存与可见失败

- [账户 owner](../../packages/ts-shell/src/core/auth/account/renewal.ts)在交换令牌前捕获不可变原文基线、实际连接 ID 或配置槽、原始 CLI provider/baseUrl 选择意图及当前权威文件。删除旧 provider 范围批量保存 helper；主请求、手动压缩、遗留摘要与缓存续期共用协调器。未到期的既有凭据保留原使用语义，不把本批描述为每次请求都重新加载账户。
- [保存状态](../../packages/ts-shell/src/core/auth/account/state.ts)仅修改所选连接/配置槽；只有原规范化身份完全一致的 provider 后备才作为镜像更新。其他账户、连接排序时间戳、原始 accountId/clientId/accountEmail 引用及空白保留，轮换只替换 accessToken/refreshToken/expiresAt。规范化 ID 重复的选择在网络前拒绝，避免一个 ID 命中多个账户。
- 复用现有配置锁、三方字段合并与原子 writer；可选锁内 precondition 同时校验权威路径、完整连接 ID/provider 顺序和同 provider 的选择依赖。跨 provider 的活动 ID 抢占、悬空 ID 后来被满足、后备排序、重新登录/删除/端点改变均不能通过仅单记录合并。普通无关设置继续合并；凭据记录内并发模型/标签等编辑仍可保守冲突，不声称严格 CAS。
- 写后既核验保存内容，也按原 CLI 意图重新解析当前实际凭据；环境引用变化、来源切换或身份失配时不返回新令牌。失败保留 unchanged/unknown/persisted 与 lock cleanup failed，输出受控原因，不输出原始 provider/I/O 错误或凭据。主请求阻止 readiness/资源准备/step；手动压缩返回失败原因，遗留摘要和缓存显示受控状态，没有将未核验保存隐藏成成功。
- 进程内交换仍按 provider+refresh token 共享；每个等待者都独立匹配完整非令牌身份并保存/核验，不能因 renewed:false 依赖 leader 的保存结果。leader 写失败后 follower 可完成同一轮换；不接受来自另一账户或客户端的共享元数据。锁内已保存的相同结果按 unchanged 处理，保留其他设置。
- 已开始的交换可能消耗 refresh token，因此操作取消后仍尝试条件保存，后续请求另查取消与准入。若取消同时遇到 unknown/persisted 保存失败，先保留写入事实，不能让取消错误遮住它。成功保存后的配置发布继续停止旧预热，旧捕获请求不跨 publication 发送。
- 定向对照参考的锁内重读、先保存再使用、开始轮换后保留凭据决定；本项目复用同步配置锁与显式基线，不宣称跨进程只交换一次、非参与 writer 的原子 CAS、文件系统原子快照或跨文件崩溃事务。
- 独立审查发现并修复重复连接 ID 批量覆盖、非令牌引用被改成字面值、跨 provider 锁内选择遗漏、压缩/缓存丢失写入事实、手动错误重复显示以及取消遮住保存失败。最终代码 APPROVE、架构 CLEAR；两路均为静态审查，主代理验证不冒充独立运行。
- 验证：扩大组合 17 文件/243 项通过；最后取消/失败顺序修正后 2 文件/29 项通过；Node 20.3 构建通过。17 次反转尝试中 16 次由行为断言有效检出，5 个产品文件逐字节恢复，恢复后 3 文件/56 项通过。移除手动压缩外层取消检查仍被下游 signal guard 保护，这次未检出不计有效反转，未修改测试以强造失败。
- 测试分类：早期 token 子串断言误把旧 refresh-a 匹配成 fresh-a，改为精确 JSON token；调用工厂附加参数和摘要包装文字属于夹具预期错误。初版 Google 元数据夹具含 schema 未声明字段，未进入续期，不能作为覆盖；已改为合法 clientId/accountEmail，强制断言交换调用及明确失败，并增加真实共享交换和成功保留引用用例。
- 最终 regular/fullscreen 构建 CLI 各四种场景：正常、交换期间重新登录、writer 返回但未写、交换期间取消。每场仅一次本地合成 OAuth 交换；仅正常场景发送模型 HTTP，且服务端确认先保存新令牌；取消场景保存轮换但零模型请求，重新登录/unknown 场景不覆盖当前账户也零模型请求。其他账户不变，终端不含合成凭据，八场退出均为 0。探针只将 OAuth URL 改到隔离本地服务，并按场景注入未写故障，不使用真实 provider 配置。
- import cycles/config consumers/declarations/node floor 与 43 项 gate 脚本测试通过；NormProof 阻断义务满足、整体 partial，四个既有函数数量 advisory 保留。本批新提交/远端结果另按实际 SHA 核对。此项关闭 §8.70/8.71 所述迟到续期响应按 provider 覆盖新身份的缺口；完整跨字段能力、主题历史优先级、其余资源策略及 Phase 19 十六批/七十六项总体目标继续。

§8.80 门禁补充：最终五项静态 gate 与 diff 检查通过；strict docs 仍报告 120 项既有文档来源 advisory，不视为已修复。

### 8.81 CFG-01：跨字段预算校验与模型目录共同发布

- [配置约束](../../packages/ts-shell/src/config/constraints.ts)在会话模型投影后检查重试延迟关系、模型输出上限、解析后的上下文空间、provider/model 预算键与已知非活动模型的预留、显式 effort 能力和 endpoint 最小输出预算。首次约束失败阻断请求；普通 reload 失败保留已接受配置与目录，修正后可重新发布。
- 复用既有窗口和预算解析顺序：模型覆盖优先于全局值，零预留有效；输出上限与压缩预留分别校验，不相加、不强制相等，也不增加任意全局输出上限。显式 contextWindow 高于目录值仍允许并提示远端支持未核实；keepRecentTokens 继续在消费时裁剪，设置原值不被改写。未知容量、无效预算键与不支持的采样诊断不回显模型标识或配置值。
- [模型限制](../../packages/ts-shell/src/core/models/limits.ts)同时用于候选配置和主请求；超过已声明输出上限的请求在 headers/body/network 前拒绝。模型选择在任何持久化前检查同一约束，异步 hook 后重读配置及一次目录并重验全部预算模型，避免非活动模型容量变化绕过保存检查。
- 配置验证和 CLI dispatch 共用实际凭据选择顺序，包括显式 provider、CLI key、环境与账户模型规范化；CLI secret 不进入发布绑定。配置与不可变目录由 [ConfigState](../../packages/ts-shell/src/config/state.ts)共同发布。主请求 readiness/step、自动与手动压缩、prefix/遗留摘要及对应缓存续期捕获当次已接受目录，成功 reload 后的新操作使用新目录，旧操作保持其快照。
- 定向对照本地参考的 provider/model 预算命名空间、模型覆盖优先级、输出与压缩预留分离以及模型输出 ceiling；保留本项目显式窗口覆盖与近期历史裁剪契约。参考基于估算的上下文裁剪不作为精确序列化请求或精确 token 保证。
- 独立审查修复 endpoint effort 最小预算遗漏、hook 后非活动模型遗漏、CLI/env 身份选择差异及压缩目录寿命不一致。最终代码 APPROVE；架构 WATCH，无本批新增阻断。代码审查独立运行 effort 探针与 diff 检查，架构审查独立运行 import-cycle gate；以下套件、构建和 PTY 是主代理证据。
- 验证：Node 20.3 扩大组合 27 文件/494 项通过，构建通过。9 组反向验证在隔离源码副本中均触发行为断言，7 个产品文件逐字节及 SHA-256 恢复，工作区源码未临时修改；恢复后 4 文件/126 项通过。初版 DEFAULT_CONFIG 未导出、provenance 属性名称与 stop reason 预期错误已分别修正，未通过弱化断言隐藏失败。
- 最终 NormProof 发现普通 runtime/type-only 分图门禁未报告的混合依赖环。将不变的 ConfigReloadResult 移到既有 application owner，保留原导出，命令类型不再依赖 ConfigState；修复后两项图义务均满足、整体 partial 仅剩四个既有函数数量 advisory。类型调整后的 10 文件/173 项与 Node 20.3 构建通过，代码复审 APPROVE、架构复审 WATCH（仅既有 provider 选择限制）。五项静态 gate、43 项 gate 脚本测试和 diff 检查通过；120 项既有文档来源 advisory 保留。
- regular/fullscreen 实际构建 CLI 各三种场景，共 18 次本地合成 HTTP：明确 Allow once 前文件不存在，批准后真实工具写入；无效 reload/目录变化保留旧请求限制；会话模型切换与预留生效；无效启动零请求、修正 reload 后恢复；显式 provider 覆盖按实际目标校验。六场退出均为 0，终端无合成凭据；这些是隔离本地适配器证据，不是外部 provider 验证。
- 本批暂不关闭 CFG-05 既有 `/model` 与不同 CLI `--provider` 的选择/会话投影不一致：命令仍依据原活动连接，不能仅替换 provider 字符串。需把实际连接目标贯穿命令及会话投影，或在保存前明确拒绝。`/btw`、`/context` 与模型浏览也仍独立读取目录，本批快照保证只覆盖上述请求和压缩路径。主题历史优先级、其他资源策略和 Phase 19 十六批/七十六项总体目标继续。
- 前批 8a56ed01 的 CI 37452056597、Architecture Watch 37452056622，以及 f12c4c57 的 CI 37448147913、Architecture Watch 37448147983 均已按完整 SHA 核实成功；本批远端结果另按新提交查询。


### 8.82 CFG-05：请求 provider 与模型保存目标一致；启动诊断不覆盖恢复通知

- [模型选择](../../packages/ts-shell/src/core/commands/model/selection.ts)通过既有 host resolver 同时核对存储配置和已接受配置。CLI provider 与保存的活动连接不一致时，`/model`、`/thinking` 在 hook 和写入之前明确拒绝；异步 hook 后在提交前再次核对。regular/fullscreen 的命令及 picker、非交互入口共用接线，不复制凭据解析逻辑。选择匹配连接后可正常保存会话覆盖及显式全局默认。
- 保留活动连接作用域：该修复不使 `/model` 隐式切换 provider/账户；先 `/connect use <connection-id>` 或移除启动 provider override。定向对照成熟参考的“验证目标认证后再改模型、会话与显式全局保存分开”，采用本项目已有连接与会话 owner，没有新存储。
- 上一提交 c81b1a7860a985b33f1a396524e939da7bc877cb 的 CI 37459846993 为失败：658 文件/6844 项通过、1 项跳过，唯一失败是 resume 连续性提示；Architecture Watch 37459847146 成功。本地复现同一文件 39 通过/1 失败，确认为产品展示回归：配置警告追加到生命周期列表，使只取末条的启动界面丢失恢复提示。
- [bootstrap](../../packages/ts-shell/src/core/shell/bootstrap.ts)保留纯生命周期通知；诊断继续来自最终接受的配置，在对应输出 host 单独显示。[启动界面](../../packages/ts-shell/src/core/shell/startupSurfaceRenderer.ts)同时保留恢复通知和全部诊断，终端 host 将诊断加入现有 transcript。capture-batch 仍按既有规则抑制启动界面，不宣称每次 print 都显示警告。定向比较参考的诊断独立展示，未改变会话恢复逻辑。
- 验证：Node 20.3 相关组合 10 文件/201 项通过；原 CI resume 用例单独通过（其余 39 项由命令选择器排除，没有修改或跳过源码测试）。5 组有效反转分别覆盖请求目标、hook 后重验、命令接线、生命周期污染和诊断显示；隔离副本 4 个产品文件逐字节恢复，恢复后 2 文件/56 项通过。扩大验证的 22 项初始失败属于两处旧 UI 夹具缺少必需 configDiagnostics，补齐数组后通过，未增加产品兜底或削弱断言。
- Node 20.3 构建通过；NormProof 图与解析义务满足，整体 partial 保留四项既有函数数量 advisory。独立代码最终 APPROVE、架构 CLEAR；专用角色启动失败未视为批准，随后两名独立通用代理分别完成代码和架构审查。代码审查独立复现夹具失败并查 diff，架构审查独立运行环和函数数量分析，其余执行证据来自主代理。
- 最终构建 CLI 的 regular/fullscreen 各拒绝三次不匹配模型/effort 操作，拒绝时配置与会话 state 原文不变、零请求；切换匹配连接后按 base-model→session-model→global-model 各发送三次本地合成 HTTP，另一连接不变。两种模式均显示启动配置警告；两个非交互调用也在零网络、零配置改动下拒绝。退出均为 0，终端不含合成凭据。regular 首轮诊断探针误用贪婪 OSC 清除规则，吞掉窗口标题之后的输出；只修正探针解析，原始终端字节已包含诊断，重跑通过。
- 最终五项静态 gate、43 项门禁脚本测试及 diff 检查通过；strict docs 的 120 项既有来源 advisory 保留。本批远端状态按新提交另行查询，不能用上一 Architecture Watch 的绿灯覆盖。
- 本批关闭上述错误保存与恢复通知缺口。`/btw`、`/context`、模型浏览的目录发布一致性，主题历史优先级、其他资源策略及 Phase 19 十六批/七十六项整体交付继续；没有据本批窄范围验证宣布整个阶段完成。

§8.82 CI 补充：4653b2283cc84b48c8882aac7c5528f1bb386683 的 CI 37485449059 失败，658 文件/6850 项通过、1 项跳过，唯一失败是 interactiveLoop 的两个部分夹具仍缺少必需 configDiagnostics；Architecture Watch 37485449167 成功。本批补齐夹具数组并纳入扩大组合，没有增加产品兜底或删除断言。原提交的失败状态保留，新提交另按实际 SHA 验证。

### 8.83 CFG-01/05：命令与模型菜单共用已接受目录

- 命令 host 传入完整的实际凭据 resolver 和一次性配置/目录读取接口。[侧问](../../packages/ts-shell/src/core/commands/btwCommandRuntime.ts)使用实际 CLI provider、key、模型及当次已接受输出限制；[上下文报告](../../packages/ts-shell/src/core/commands/contextCommandRuntime.ts)使用同一目录与模型预算覆盖，保留零预留，读取实际工具池并在异步等待后复查准入。当前工具 schema 标为字符估算，不再从上次 provider usage 中相减、编造历史指令与对话分项。
- [模型命令](../../packages/ts-shell/src/core/commands/modelCommandRuntime.ts)、模型 picker 和补全共用发布目录；列表默认本地读取，移除命令内第二套远程获取。显式 refresh 复用既有目录 owner，先保存缓存再请求配置发布，分别显示保存、应用拒绝和应用成功；无效 provider 在刷新前拒绝。精确目录 ID 优先于兼容别名，保留自定义 ID 的大小写；合法但无目录项的 runtime provider 显示空列表。状态同时标示保存连接和实际请求目标。
- 补全 identity 包含 publication revision，成功 reload 后旧异步结果及缓存失效；磁盘目录修改和失败 reload 不提前改变菜单。现有来源 watcher 的测试明确验证“来源变化后仍为旧目录，发布后才更新”，其他来源观察契约不变。兼容数据读取 API 保留，无会话 host 的调用继续读取本地目录。
- 定向对照本地参考的显式 awaited refresh 与运行时模型快照读取，复用本项目 ConfigState 与目录刷新 owner，没有新增存储或第二执行路径。独立架构审查发现分开的 runtime/type-only 图门禁遗漏混合环；[prompt](../../packages/ts-shell/src/turn/prompt.ts)直接读取 projectState owner，保持相同 goal 语义与命令公开 API，消除 prompt 对命令实现的依赖。
- 验证：Node 20.3 扩大组合 36 文件/474 项和构建通过。初轮 34 项失败属于旧部分 UI 夹具缺少 configuration publication，使用真实 ConfigState 的共享测试夹具补齐；没有修改生产读取契约。4 组有效反转覆盖菜单快照、侧问实际目标、零预留和补全 revision，隔离源码副本触发行为断言、逐字节及 SHA-256 恢复，恢复后 4 项通过。
- 最终构建 CLI 在 regular/fullscreen 各完成三次侧问与一次非交互侧问，共 8 次本地合成 HTTP；服务端核验 CLI key 和实际模型，失败 reload 后继续 1024 输出限制，成功 reload 后改为 512，窗口及模型列表也只在成功后更新。本地服务收到零目录 GET，命令测试另验证默认列表零 fetch；全部退出为 0，终端无合成凭据。首轮探针错误期待未配置的 temperature 出现在请求，并把 fullscreen 的旧重绘文字当作新命令结果；修正为当前命令回显后同步及既有无 temperature 契约后通过，未据探针错误改产品。
- 两条独立审查最终代码 APPROVE、架构 CLEAR。代码审查独立执行三项 provider 列表探针、原失败 UI 测试和 diff 检查；架构审查独立验证混合图零环及函数数量，组合套件/构建/PTY 来自主代理。五项静态 gate、43 项 gate 脚本测试和 diff 检查通过；NormProof 图与解析义务满足、阻断项为零，整体 partial 仍保留四项既有函数数量 advisory，strict docs 的 120 项既有来源 advisory 未在本批修复。
- 此项关闭上述命令、模型 picker 和补全的目录消费缺口；状态栏 sessionFacts 与连接 picker 的目录读取仍独立，主题历史优先级、其他资源策略以及完整 Phase 19 十六批/七十六项继续。当前证据不覆盖外部 provider 服务或目录持久化 owner 的所有网络/存储边界。

### 8.84 CFG-01/UI-05：状态栏与连接选择器消费已接受目录

- [状态事实](../../packages/ts-shell/src/cli/interactive/sessionFacts.ts)一次捕获已接受配置和目录，复用 host 的实际 provider/model 解析；欢迎界面、状态模型、窗口分母和按历史 provider/model 估算的费用使用该状态。删除每次绘制中的两次目录重读，磁盘编辑或失败 reload 不再提前改变窗口/费率。Shift+Tab 的实时模式仍优先于已接受默认值，没有用最近模型的价格重算其他模型的用量。
- [连接 picker](../../packages/ts-shell/src/cli/interactive/picker/connections.ts)的列表和登录草稿读取已接受目录。提交时重新读取当前 publication，生成可编辑草稿；激活连接仍委派原命令 owner，选中目录项不直接登录或保存凭据。定向参考运行时模型注册表及 footer 从实际会话模型取得窗口的决策，保留本项目已有 usage 与连接持久化边界。
- 扩展既有跨 reload 集成用例，核对实际 CLI 目标、窗口、费用 0.016→0.024、连接目录及草稿；87 项相关测试和另行运行的 interactiveLoop 2 项均通过。审查独立复现 fullscreen 退出时旧夹具缺少 publication 的未处理异常，使用既有真实 ConfigState 测试 helper 修复，原命令重跑退出 0。新增夹具初版把模型名误当 provider 摘要字段、把远程费率字段误当内部字段，均按已有契约修正并保留精确断言。
- Node 20.3 构建通过；3 组有效反转分别覆盖状态目标、状态目录和连接草稿，隔离副本逐字节/SHA-256 恢复，恢复后 4 项通过。第一轮反转因替换标记匹配两处，在变异前拒绝执行，不计有效证据。独立代码最终 APPROVE、架构 CLEAR；架构独立检查混合图零环和函数上限，代码独立重跑 loop 两项并确认无未处理异常。
- regular/fullscreen 实际构建 CLI 各发送一次本地合成模型请求和一次既有 readiness GET。VT 屏幕状态确认欢迎界面显示实际模型，已记录 1000 prompt tokens 时为 1.0k/16k 6%；目录编辑和拒绝 reload 后保持原窗口，成功后改为 1.0k/24k 4%。退出均为 0、终端不含合成凭据。探针先修正 readiness GET 的错误零请求预期，再用屏幕状态处理 fullscreen 不重绘未变化行，并仅过滤模拟器不支持的设备状态查询；未修改产品渲染路径。
- 五项静态 gate、43 项脚本测试与 diff 检查通过；NormProof 图和解析义务满足、阻断项为零，四项既有函数数量 advisory 与 120 项文档来源 advisory 保留。前批 99c2192d 的 Architecture Watch 37492493447 已成功，CI 37492493436 在记录时仍运行；本批远端状态按新 SHA 另查，不能以本地或前批绿灯代替。
- 此项取代 §8.83 中状态栏和连接 picker 目录尚未统一的状态。费用仍为目录费率估算，不是账单；完整 UI-05 的压缩后 usage 未知性/费用标识、主题历史优先级、其他资源策略及整个 Phase 19 继续。

### 8.85 CFG-01/UI-04：个人主题的历史目录优先级

- [主题目录](../../packages/ts-shell/src/presentation/themes/index.ts)改用公共用户路径 owner，并将其 current-first 搜索顺序反向用于 last-entry-wins 的主题 map。当前目录的同名主题现在覆盖历史副本，历史独有主题仍可发现；空 USERPROFILE 按公共规则回退 HOME，不再误用工作目录。已授权项目主题和显式路径继续拥有原来的后置覆盖优先级。
- 获胜的当前主题无效时继续报告该文件错误，不悄悄使用历史副本；删除当前文件后允许按历史顺序回退。列表、加载和 watcher 的路径解析共用同一顺序，没有改动信任授权或其他配置字段的 user/project 合并。定向比较参考的“CLI 路径优先、first-wins 去重”，采用等价的明确优先级原则，未照搬其加载策略或全局反转配置层。
- Node 20.3 定向 5 文件/53 项及构建通过；2 组反转分别撤回目录顺序和公共 HOME 解析，都触发对应行为断言，隔离源码逐字节/SHA-256 恢复，恢复后 16 项通过。代码独立 APPROVE、架构 CLEAR，后者独立检查普通及混合图均零环、模块 14 个 function-like names。五项静态 gate、43 项脚本测试和 diff 检查通过；NormProof 阻断项为零，四项函数数量及 120 项文档来源既有 advisory 保留。
- regular/fullscreen 构建 CLI 均验证当前主题颜色、编辑后 follower 重载、历史文件编辑不覆盖当前主题、无效当前文件 reload 拒绝并保留调色板、删除后 reload 切到历史颜色；两场均使用空 USERPROFILE 与隔离 HOME，退出 0，配置原文不变，没有发起模型操作。首轮 regular 探针只检查最后一段同名命令回显，遗漏了随后历史重绘前已经输出的成功结果；改为匹配本次语义结果后通过。该重绘序列仍作为 UI-01 待查案例，不据原始颜色字节宣称整个终端画面连续性已验证。
- 此项关闭前述“主题历史优先级”缺口。完整 UI-04 的调色板/默认色/角色、UI-01 的重绘与 marker、其他资源策略及 Phase 19 全部交付仍继续。上一 6e53eb4e 的 Architecture Watch 37494932214 已成功，CI 37494932207 在记录时仍运行；新提交的远端状态另按 SHA 核实。


### 8.86 UI-01：regular 内部 marker 消费与相对 caret 账本

- [主屏 painter](../../packages/ts-shell/src/presentation/tui/render/mainScreen.ts)复用共享行准备与帧控制：移除全部内部 marker、裁剪宽度、关闭样式和 hyperlink，绘制期间隐藏光标并禁用 autowrap，结束后恢复 autowrap。仅从可见内容与高度裁剪后的 chrome 定位 caret，通过原相对移动账本保存实际光标行，后续追加、重绘和外部程序交接沿用该行。没有把全屏绝对寻址移入 regular。
- 定向比较本地参考的可见 viewport marker 查找与视觉列宽计算，保留本项目终端 scrollback owner。独立代码审查发现首版每次按键解析全部历史行，万行样式文本无 I/O 探针约 236 ms/帧；修正为仅准备新增与可见行后，同一独立探针约 0.61 ms/帧（旧 HEAD 约 0.15 ms），性能阻断解除。这些数字不代表完整 UI/终端端到端延迟。
- 组合 8 文件/234 项通过；最终性能修正后独立重跑两份 renderer 套件 67 项通过。3 组反转覆盖 marker 剥除、caret 定位和最终行账本，全部触发行为断言；隔离源码副本逐字节/SHA-256 恢复，恢复后 19 项通过。原有屏幕替身不完整模拟 autowrap/reflow，因此另用实际 CLI VT 屏幕验证，未把字节断言当作实机像素证据。
- 最终 Node 20.3 构建 CLI 的 regular/fullscreen 均通过普通输入、光标左移、中间粘贴、分片中文粘贴、宽字素位置、100×30→60×12→100×30、满行末列和历史追加后的草稿定位，终端无内部 marker。两种模式的主题重绘后成功 reload 结果仍在 VT 屏幕，继续输入 caret 正确，补足 §8.85 原始输出序列的屏幕观察。overlay/恢复与外部输出交接由 renderer 测试覆盖，没有声称已运行外部编辑器实机矩阵。
- 首轮 fullscreen 完成 caret 检查及终端退出序列后，进程等待超过 15 秒；未确认原因。随后相同流程和满行补充流程各次均约 0.09 秒退出、状态 0，未为该偶发超时修改产品退出路径。探针均为隔离 HOME、synthetic provider，未访问真实 provider 配置。
- 独立代码最终 APPROVE、架构 CLEAR；代码独立运行基准与 renderer 套件，架构独立验证普通/混合依赖图及函数数量。最终构建、五项静态 gate、43 项门禁脚本测试与 diff 检查通过；NormProof 阻断项为零，四项既有函数数量 advisory 和 120 项文档来源 advisory 保留。
- UI-01 的确定性 marker/caret 缺陷已修复；Windows Terminal 逐帧录制、真实 IME 及用户现场残影归因仍缺证据。终端历史 reflow、其余 W4 与全部 Phase 19 继续，不据本批宣布完整 UI-01 或阶段验收完成。
- 前两批 99c2192d 的 CI 37492493436/Architecture Watch 37492493447、6e53eb4e 的 CI 37494932207/Architecture Watch 37494932214 已按 SHA 核实成功。0ef70a34 的 Architecture Watch 37497039715 成功，CI 37497040158 在本次记录时仍运行；本批提交另按新 SHA 跟踪。


### 8.87 UI-02：共享源文布局、输入留白与精确应用选择

- 新增 [composer 契约](../../packages/ts-shell/src/presentation/tui/composer/contract.ts)、[布局](../../packages/ts-shell/src/presentation/tui/composer/layout.ts)与[选择投影](../../packages/ts-shell/src/presentation/tui/composer/projection.ts)。editor 的同一 wrapSegments 路径输出字素/tab cells、全局 UTF-16 source 边界、逻辑/软换行、revision 和 viewport；render 保留原入口并委派共同 layout，未创建第二套换行或编辑器。
- 当前 band 输入左右各保留 2 cells，续行对齐；窄窗按真实空间减少装饰和对称 padding，零宽不产生输入行。单列容不下完整宽字素时显示单 cell 占位，tab 显示一格，复制仍返回完整原字素/tab，不把显示退化写回 source。chrome/composer 只保留薄入口，八形态和默认形态配置属于后续 UI-03。
- Pointer 复用 DragSelection 手势，增加 owner 提取策略并删除 cue 正则清洗；composer 复制直接截取 source 区间，保留缩进、尾空白、tab、连续空行与用户输入的 cue 字符，软折行不新增换行。高亮从同一范围映射回真实 source cells，不高亮布局 padding；源文/revision/几何变化会取消旧拖选。
- surface 使用真实宽高和输入实际行数，候选列表按可用高度保住所选身份与点击映射。独立审查发现 resize 到排队重绘之间旧几何仍可命中，以及 regular 一行窗口省略 document 导致恢复后重复追加历史；前者通过 engine 同步 invalidateLayout 修复，后者保留完整 document，并在零物理尺寸时跳过绘制。两个实际 TUI+Surface 回归分别断言过期 release 零复制和历史不重新追加。
- 定向参考文本区与 gutter/reserve 分开布局及统一 band 几何，复制保证由本项目 source 映射实现。regular 不开启应用鼠标捕获，document 不暴露输入命中几何，意外鼠标报告被忽略；普通终端原生选择仍归终端控制，不能据 fullscreen 应用复制测试宣称 regular 原生拖选已去掉布局字符。
- 最终 Node 20.3 扩大组合 14 文件/362 项通过，构建通过。4 组有效反转分别撤回源文提取、保留空白、resize 失效和 document 保留，全部触发行为断言；隔离源码副本逐字节/SHA-256 恢复，恢复后 42 项通过。初版新增候选测试误把 void selectRow 当 boolean，改为核对实际选中身份后通过；未改变产品 API 或放松身份断言。
- 实际构建 CLI 的 regular/fullscreen 均通过普通输入、中间与分片中文粘贴、宽字素 caret、resize 和历史后输入，终端无 marker，退出均为 0。fullscreen 正向拖选及 20→40 列后的反向拖选，OSC 52 解码和隔离 wl-copy stdin 均严格等于同一 45 字节源文；未触及真实桌面剪贴板。探针首轮局部函数名遮蔽 Python select 模块，在启动等待前失败，仅修正探针名字后完成验证。
- 独立代码 APPROVE、架构 CLEAR；代码独立运行 109 项相关测试及最终 surface/engine 75 项并复验历史，架构独立运行两项 resize/history 回归和普通/混合图检查。最终五项静态 gate、43 项门禁脚本测试、diff 检查通过；NormProof 图与解析义务满足、阻断项为零，四项既有函数数量及 120 项文档来源 advisory 保留。
- 本批完成当前 band 的 source/cell/viewport 主链，UI-03 八形态、共享 IME 尾、真实预览与持久选择继续；Windows 前端像素/真实 IME 证据未取得，完整 UI/Phase 19 验收继续。前批 475de67a 的 CI 37499480267 和 Architecture Watch 37499480342、0ef70a34 的 CI 37497040158 和 Architecture Watch 37497039715 均已按 SHA 核实成功；本批远端状态另按新提交跟踪。


### 8.88 UI-03：八形态、真实预览与持久选择

- composer 的纯 metadata 统一注册 `default`、`band`、`borderless`、`top-rule`、`padded-rules`、`field`、`rail`、`box`；frame/row/layout 复用同一 editor/source/cell/viewport。未设置时使用 default，配置不写伪默认来源；现有 TUI 合并规则保持项目形态优先于用户形态。八形态均保留左右 2 cells，装饰、底栏和 gap 按真实总高度计费，窄到单列时退化而不修改源文。
- 状态事实继续来自现有 items；形态决定顶带、右 chip、框内状态或左/完整底栏。field/rail/box 共用 EOL 不绘制右尾的保守 IME 策略；box 末行可并底框，EOL 时独立底框。侧边滚动条使用真实总行数和 caret-follow viewport，不创建另一份输入或滚动状态。
- `/settings` 的 Input shape 使用真实 surface 预览，初始聚焦已接受值；键盘与指针聚焦改变形态，Enter 仅暂存，Apply 才写文件并发布。Esc 恢复已接受形态，草稿保持不变。保存返回结构化确认标志和原有准确结果文本；失败或未确认时保留待选值并恢复已接受形态，下一次明确 Apply 才读取新 baseline。配置暂时不可读也保留选择与安全说明，不用旧 baseline 写入或暴露读取异常。
- `tui.composerShape` 独立即时发布；其他 TUI 叶子的 restart 行为、已安装值及来源保持。旧形态 geometry 在预览、resize、源文修改及已接受配置换形态后均失效，重绘前 release 不复制旧坐标。chrome 入口仅重导出 owner 契约并委托渲染。
- 对照既有参考的共享形态接口、实际预览、状态挂载、侧框尾与滚动条决定；本产品保留自己的两格 padding、配置来源和 editor viewport。独立评审发现全形态重复折行，已改为只有 box/rail 做只读预算；5000 行基线约 58 ms，修复后约 56 ms，撤回曾约 103 ms 的回归。六种非自适应形态的一次布局断言保护此决定。box 的重复帧抖动由先预留可选底框、只读预算、一次提交消除。
- 验证：Node 20.3 隔离环境最终 17 文件/388 项通过，构建通过；import cycles、config consumers、declarations、Node floor、strict docs 与 43 项 script tests 通过。NormProof 0 blocking，保留四个既有 function-count advisory；strict docs 保留 120 个既有 source advisory。五组反转（形态 geometry fence、IME 尾、只读 viewport 预算、菜单焦点预览、真实滚动条分母）均实际触发断言失败，隔离副本逐字节/SHA-256 恢复后 77 项通过。代码独立 APPROVE、架构 CLEAR；额外窄窗穷举均由独立 lane 运行，不代替实际终端证据。
- 两模式实际 CLI 逐项预览全部八形态、暂存零写入、Apply box、取消后恢复、CJK/插入/resize caret、重启读取 box，均退出 0；fullscreen box 正向与缩窗反向选择的 OSC 52 和隔离 clipboard stdin 均严格等于 45 字节源文。最初 PTY 两次失败分别等待了已滚出菜单视口的 Pending 行、把保留的命令标题误当仍打开的菜单；按实际可见 Apply/菜单行同步后通过，未改产品来迁就探针。
- 本批交付八形态实现与隔离终端主链；真实输入法、Windows Terminal 像素和全部 UI/Phase 19 验收继续。UI-02 提交 `c261472c` 的 CI 37503608913、Architecture Watch 37503608896 已按 SHA 核实成功；本批远端状态另按新提交核实。


### 8.89 UI-04：精确调色板、终端默认与语义 fallback

- dark 按研究文档 §10 更新：原 48 项中 24 项语义变化、24 项保留，新增六个实际消费的角色；schema 与四套内建主题均为 54 项。新增 status model/path/git-clean/git-dirty/context 由状态 items 消费，未知 Git 状态仍用中性色，不推测干净；50/70/90 阈值保持。mdCodeBlock 用于未标语言、未知语言、过大或高亮失败的代码块，逐行闭色并保留源文；none 模式仍不着色。
- JSON 与变量链支持显式 `default`；低层编码使用标准 SGR 39/49，不假定终端默认 RGB。现有字符串样式接口无法区分内层默认开启与普通颜色关闭，因此 scope 开启使用等效的标准重复 SGR 39;39/49;49，嵌套恢复保留这些完整组；颜色关闭仍恢复外层。中间布局不归并 SGR，只有最终 paint 归并；前景/背景独立、全 reset、软折行、截断再包色和最终归并均有有效终端色槽断言。
- 对照参考的默认前景/背景编码和简单样式包装；后者没有解决本产品较强的嵌套恢复契约。避免引入终端专属样式栈或跨所有字符串消费者的新渲染系统，显式记录“最终绘制前保留 scope 开启组”的约束。
- 新角色按依赖顺序继承旧主题自身的 accent/dim/success/warning/syntaxText；syntaxText 又可继承 text。完整旧 light/custom 不借新 dark 配色；显式 default 与缺省继承保持区别，现有 hex/ANSI 色名不变，未知值和空串仍被主题解析拒绝。其余三套预设新增角色沿用各自明暗/高对比语义。
- Node 20.3 隔离组合 29 文件/442 项、构建、静态门、43 项 script tests 通过。NormProof 0 blocking，四个既有函数数 advisory 保持；strict docs 120 个既有 source advisory 保持。四组反转撤回默认 scope 区分、旧代码角色继承、fallback 新角色及 model 新角色，均触发断言失败并逐字节恢复；恢复后 66 项通过。独立代码 APPROVE（113 项与 3645 个组合色槽探针），架构 CLEAR（105 项、依赖与责任上限检查）。
- 实际构建 CLI 使用隔离 HOME、受控本地 provider 和每场一次请求，分别运行 regular/truecolor 及 fullscreen/truecolor、256、16、none。四套主题切换后，历史 unknown fence 的颜色状态按主题变化并回到 dark，配置文件原文不变，五场均退出 0。truecolor 的代码颜色依次为 9cdcfe/111827/ffffff/000000/9cdcfe；低色模式按既有降色规则，none 始终默认。此证据是 VT 色槽与输出状态，不等于任意用户终端对比度认证。首轮 PTY 的 light-contrast 预期误写为 111111，核对内建既有 000000 后修正探针；无产品修补。
- 本批完成 palette/default/inheritance/fallback 主链。主题在 Settings 内的实际预览、取消与 Apply 一致性继续，真实 IME/Windows 像素和完整 Phase 19 保持进行中。UI-03 `3297c375` 的 Architecture Watch 37509026666 已成功，CI 37509026653 记录时仍在运行；本批远端状态另按 SHA 核实。

### 8.90 UI-04：Settings 主题预览与可撤销生命周期

- Settings 的 Theme 现在列出 auto、内建和可发现的自定义主题，初始聚焦已接受选择；沿用现有主题发现、项目信任、个人历史目录与显式 themePaths 顺序。键盘/指针聚焦改变共享调色板，历史消息也随真实 surface 重绘。Enter 仅暂存，Apply 才进入既有配置保存/确认路径；失败保留待选值和准确说明，重试才重取 baseline，不新增主题配置存储。
- `presentation/theme/selection` 持有已接受 intent 与单调 generation，preview lease 只占用显示状态。每次成功接受选择都同步撤销 lease，包括同名选择；菜单创建时捕获的 revision 也阻止尚未开始预览的旧回调复活。准备失败不变更已接受值或当前颜色，取消从内存快照恢复 colors/name/mode 并增加 colorRevision，不重读可能已删除/损坏的文件。
- 外观报告始终被记住：显式预览保持固定，auto 预览跟随报告；从已接受 auto 取消时解析最新外观。预览开始暂停 follower，refresh/目标解析与排队 reload 都受活动预览约束；取消/新接受选择恢复适当监听。独立双线审查共同发现 shutdown 残留，现已在最终 follower.stop 前关闭 overlay；退出后旧回调不会重新启动监听。
- 对照既有参考的当前主题聚焦、selection-change 预览以及确认/取消分离；本产品保留明确的暂存/Apply、信任与配置优先级，并增加文件失效、同名新确认和异步生命周期保护。Theme 和 InteractiveMode 均保持 20 个函数名上限，控制器通过注入 follower/redraw 接入，不把生命周期逻辑继续堆入主交互类。
- Node 20.3 隔离组合 16 文件/247 项及构建通过；shutdown 修复后相关 4 文件/67 项与最终构建通过。import cycles、config consumers、declarations、Node floor、strict docs 和 43 项 script tests 通过；NormProof 0 blocking、四个既有函数数 advisory，strict docs 保留 120 个既有 source advisory。代码独立 APPROVE、架构 CLEAR。四组有效反转覆盖快照恢复、接受代际、排队 reload 和初始聚焦，副本逐字节/SHA-256 恢复后 13 项通过。首轮代际反转发现测试只在 end 后断言、可能漏掉短暂旧预览；补上 end 前颜色断言后有效检出，无产品变更。
- 实际构建 CLI 在 regular/fullscreen、隔离 HOME 与受控本地 provider 下各一次请求，验证历史代码颜色 dark→light 预览/暂存→取消 dark、再次 Apply light、预览 dark→取消 light；逐阶段文件原文比较证明预览与暂存零写，Apply 后文件为 light，两场退出 0。该证据不替代真实 IME/Windows 像素。验收记录：`.tmp/preview-validation-cw344pef`、`.tmp/preview-final-ax3dqih7`、`.tmp/phase19-config/theme-preview-reversals/1791312313394797980`、`.tmp/phase19-config/theme-preview-pty-1791312131253884979`。
- UI-03 `3297c375` 的 CI 37509026653、Watch 37509026666，以及 palette `d7814f61` 的 CI 37511212735、Watch 37511212854 均已按提交核实成功。本批远端证据另按新 SHA 核实；UI-05 状态事实/费用标签及其余 Phase 19 交付继续，完整目标未完成。


### 8.91 UI-05：状态窗口、用量与费用的事实边界

- sessionFacts 始终从已接受配置/目录及实际 provider 解析窗口，独立投影 source/warning。状态未知显示 `?/64k`，配置/假定分别标 `config`/`assumed`，配置 warning 提供 `! /context`；详情保留完整来源/警告。已报告计量继续使用 50/70/90 风险阈值，未改默认状态项。
- usage owner 以 `undefined` 区分未知与明确报告的 0；fresh/reset/resume 不保留旧当前计量，但保留累计账目。前台响应接受后立即清除 gauge，缺失/空/null/仅输出报告和读取失败不能留用旧 prompt。有效计量与后台 `affectsContext:false` 维持各自边界；新 `usage-gap` 断开 cache 对比而不伪称压缩，不给缺失报告增加空账目。
- 共享 raw usage presence 判断与 Google/Bedrock 映射保留字段缺失，避免 adapter 提前补零；accounting normalization 仍归原 owner。费用状态显式 `est`，不完整公开费率标 `assumed rates`，仅承诺已记录用量估算。公开零费率只有在实际 token 有完整分类时支持零费用；total-only 计量不能伪装零账单。模型价格 fallback 统计所有同名 claimant，未定价 provider 不借另一个 provider 的费率。
- 定向对照参考 footer 的独立窗口、压缩后 unknown 及 provider-scoped 价格查询，保留本项目已接受目录、费用分类和累计账目。独立审查发现空 usage 计数、total-only 零费用和 null 读取风险，已修复并强化成功结果断言。代码最终 APPROVE、架构 CLEAR；runtime factory 的宽口径 AST 计数仍为既有 28（基线同为 28），本批仅改未知判断、未增函数，不声称所有 touched module 在任何口径下均低于 20。
- Node 20.3 隔离扩大组合 21 文件/386 项通过；最终实现修复后 8 文件/228 项、独立架构最终 11 文件/255 项通过，最后 null/success 夹具另获独立 82 项与 5 项定向验证。最终构建、import cycles、config consumers、declarations、Node floor、strict docs 和 43 项 script tests 通过；NormProof 0 blocking，四个既有函数数及 120 项文档来源 advisory 保留。六组反转覆盖窗口独立、接受后清除、wire 缺失、空 usage、零费用分类和价格身份，全部实际触发断言；隔离副本逐字节/SHA-256 恢复，恢复后 164 项通过。
- regular/fullscreen 实际构建 CLI 使用隔离 HOME 和本地受控 provider，逐阶段 VT 屏幕核对 fresh `?/64k` → `9.0k/64k 14%` → 缺失 unknown → `0/64k 0%` → 压缩 unknown → `2.0k/64k 3%` → session overlay 关闭恢复 → 退出并重启同一真实 session 后 unknown。每场 4 次前台请求、2 次辅助请求，累计费用保留，配置逐字节不变，两次进程均退出 0。初轮夹具先后误用不存在的 session-id 创建、超出模型预算以及错误面板标题；修正夹具后通过，未改产品迁就预期。证据：`.tmp/status-reviewed-18s2080j`、`.tmp/ui05-architecture-final-yfgDN0`、`.tmp/status-gates-t1_g8g3e`、`.tmp/phase19-config/status-reversals/1791314734778917743`、`.tmp/phase19-config/status-pty-1791314874430689256`。
- UI-04 `c7f8bda1` 的 CI 37514125290、Architecture Watch 37514125323 均按 SHA 核实成功；本批远端证据另按新提交核实。UI-06 报告/面板及其余 Phase 19 继续；Windows 前端像素与真实 IME 证据仍缺，完整目标保持进行中。


### 8.92 UI-06：结构化报告基础与 context 首个消费者

- [命令报告契约](../../packages/ts-shell/src/core/commands/report/contract.ts)承载 version、spans、columns 和独立 facts；[projection](../../packages/ts-shell/src/core/commands/report/projection.ts)创建脱离原对象的不可变快照，移除完整终端序列并转义其余控制字符。兼容 output 从同一模型生成，JSON 序列化保留稳定数值、来源和 unknown/reported/estimate 标签；本批没有新增或宣称完成 CLI JSON 输出开关。
- `/context` 的事实采集仍归现有 runtime，[context/report](../../packages/ts-shell/src/core/commands/context/report.ts)负责语义投影；没有从 Markdown 或普通对话正则猜角色。工具估算不从上次 provider 总量中相减，未知与显式零继续分开，窗口 source/warning 和累计账目保持。共享 [context pressure](../../packages/ts-shell/src/core/models/pressure.ts)让 status 与报告百分比同用既有 rounded 50/70/90 阈值；bar 按指定 used/accent、reserve/dim、free/muted，200k/64k/17k 算例为 10/3/19 cells。
- StreamingRenderer → TurnSink → transcript/pager 传递结构而不提前着色；[报告 renderer](../../packages/ts-shell/src/presentation/tui/report/renderer.ts)在当前主题下处理 spans 和 columns，窄屏堆叠带标签字段，长字段折行而不裁掉来源。print/plain sink 使用同一纯文本，报告数据和复制文本不含 ANSI。bridge 只转交，不引入第二套命令执行。
- 复用现有 Pager；语义报告分页后仅折叠转录视图，原全文与报告仍保留，可展开且复制不退化为摘要。其缓存加入 theme revision，过滤先去样式再匹配，跨不同角色的可见连续文字可搜索。定向比较参考报告 body 与 host 分工，本批遵守研究文档 §6.7 的“先数据/转录、再自适应 host”顺序；现有 18 行分页阈值尚未改成实际几何决策。
- 首轮 Node 20.3 隔离 12 文件/143 项通过；bar 修正和搜索断言后 8 项与最终构建通过。独立代码 APPROVE（116 项后复跑 19 项），架构 CLEAR（125 项后复跑 19 项）；普通/混合依赖图通过。TurnSink 函数数保持既有 22→22，未增函数，新模块低于上限。五项静态 gate、43 项 script tests 与 NormProof 0 blocking 通过，四个既有函数数与 120 项文档来源 advisory 保留。最初误向 npm 请求不存在的 checker 包而 404，改用 CI 指定的仓库 bundle 后实际执行成功，没有将下载失败计作 gate 通过。
- 五组反转分别撤回结构转交、窄屏堆叠、主题代际、跨样式搜索与 bar 角色，均触发行为断言，隔离源码副本逐字节/SHA-256 恢复后 20 项通过。首轮主题反转未被整页变化断言捕获，因为 footer 已换色；测试改为直接断言正文百分比的新色槽后有效检出，无产品改动。证据：`.tmp/report-tests-ohylrk87`、`.tmp/report-final-0rhokklt`、`.tmp/ui06-architecture-TmqlUO`、`.tmp/report-gates-np7ulh0v`、`.tmp/phase19-config/report-reversals/1791315904011793348`。
- actual CLI regular/fullscreen 各一次本地受控 provider 请求，报告数字 dark `b5cea8` → light `b45309`，100→40 列后字段及来源完整，关闭命令后继续编辑，配置原文不变、退出 0。两次 print 在强制彩色下仍无 ANSI，并保留 catalog/unknown；报告 Pager 的换色/搜索/复制由组件集成测试验证，本次 CLI 报告长度未触发分页，不补称实际弹出验证。PTY 首轮缺少驱动 SIGWINCH，第二轮断言未等待完整重绘且忽略折行；修正夹具同步后通过，未修改产品。证据：`.tmp/phase19-config/report-pty-1791315991438707940`。
- UI-05 `4a73f0f8` 的 CI 37519416015、Architecture Watch 37519415850 均按提交核实成功。本批远端状态另按新 SHA 跟踪。自适应只读 host、滚轮/resize 阅读定位、help 两步填入、cost/tools 等迁移与版本化语义持久化仍继续；本批不代表完整 UI-06 或 Phase 19 完成。


### 8.93 UI-06：实际容量下的只读报告与输入归属

- 结构化报告不再受旧 18 行阈值门控，短报告也进入既有 Pager；Surface 先布局真实 composer、hints、activity 和最小转录行，再把剩余容量交给 reader。完整未过滤正文加实际三行 chrome 放得下时内嵌，否则全屏；过滤不在输入过程中切换展示方式。legacy 纯文本保留旧分页阈值，未另造报告宿主或虚构 apply。
- 报告 renderer 同时输出每个视觉行的原始条目身份；宽度变化后保留当前源条目，主题变化不会把同一段内的阅读位置重置。过滤按整条目匹配，跨软折行和不同样式的关键词仍可命中，标签/数值/来源一起保留。箭头、PageUp/PageDown、Home/End 与 wheel 共用实际 viewport；窄屏优先保留关闭提示，无可滚动余量时不显示滚轮提示。
- 粘贴归 reader 过滤器，移除终端序列与控制字符，不能落进隐藏 composer 或提交；关闭后原草稿恢复。reader 在下个请求、运行时提问、权限提示和 shutdown 前关闭，避免覆盖需要用户响应的状态。无色、复制和原纯文本数据契约继续沿用上一批。
- 独立代码审查发现 regular 借用全屏只发 alternate-screen 序列、未请求鼠标报告；旧注入 SGR 测试无法发现真实终端不会发滚轮事件。现由 engine 在借用/归还时同步获取/释放鼠标，stop/suspend/resume 复用相同生命周期。内嵌报告的未过滤正文完整可见，没有应用滚动区，regular 继续保留原生鼠标/scrollback；fullscreen reader 才消费应用滚轮。
- Node 20.3 首轮 73 项、扩大 7 文件/177 项通过；鼠标/提示让位修复后 74 项、最终布局/提示 52 项及最终构建通过。独立代码 APPROVE（177 项后复跑 74 项）、架构 CLEAR（199 项后最终 87 项）。Surface 保留显式 render-before-form-query 约束；stock InteractiveMode 20、Surface 19，宽口径对象 callback 计数 InteractiveMode 83→83，未增名字，不宣称既有债务已消失。
- 六组反转覆盖自适应形式、源条目锚点、粘贴归属、鼠标协商、真实容量和权限提示让位，全部触发行为断言；隔离源码副本逐字节/SHA-256 恢复后 123 项通过。import cycles、config consumers、declarations、Node floor、strict docs、43 项 script tests 通过；NormProof 0 blocking，既有 advisory 保留。证据：`.tmp/reader-tests-hcy8y7pz`、`.tmp/reader-reviewed-931m85z5`、`.tmp/reader-final-idfxt6rr`、`.tmp/ui06-reader-architecture-zTW2fe`、`.tmp/reader-gates-st6zji61`、`.tmp/phase19-config/reader-reversals/1791317381926702874`。
- actual CLI regular/fullscreen 各两次本地受控 provider 请求，验证 100×60 内嵌 → 40×12 全屏 → PageDown/wheel → 粘贴过滤完整条目 → 100×60 恢复内嵌 → Esc → 新请求。regular 明确观察鼠标 enable/disable，过滤词未进入后续请求，配置原文不变、退出 0。首轮最后的夹具断言忽略了请求既有的 Environment/continuity 前缀；改为精确用户后缀加过滤词零泄漏后通过，无产品修补。证据：`.tmp/phase19-config/reader-pty-1791317627870718666`。
- 上批 `aacd66cf` 的 CI 37521788268、Architecture Watch 37521788204 均已按 SHA 核实成功；本批远端状态另按新提交跟踪。UI-06 的 help 两步填入、cost/tools 等报告迁移与语义持久化继续，UI-07 和全部 Phase 19 仍未完成。


### 8.94 UI-06：可搜索帮助与两步命令提交

- [help picker](../../packages/ts-shell/src/cli/interactive/picker/help.ts)接入现有 overlay，裸 `/help`、`/?` 共用入口；从共享 slash registry 投影 canonical、独立命名入口、分组、摘要、参数提示和适用范围，包括 picker-only `back` 与动态扩展。别名仅做搜索词，命中 `/models` 填 `/model `；`/recall` 仍填自身入口。MCP 可见性沿用 registry gate，扩展未声明 print 能力时仅显示 registered。选择前重新核对当前集合，不能插入已移除条目。
- 复用 `PickerOutcome.draft`，选择只填入 composer；参数语法显示在既有 Usage 提示，不进入提交内容，不为插入加载可能联网的候选目录。再次 Enter 才执行，包括 `/exit`。异步填入受 overlay 代际和 shutdown 约束，粘贴先去终端序列后进入过滤器，取消保持原草稿。带参/print 沿用现有执行路径。
- [panel](../../packages/ts-shell/src/presentation/tui/chrome/panel.ts)最多 8 个选项，标题/footer/溢出单独扣除，消费真实 composer、提示、activity 后的容量；0–3 行极短预算也不越界。footer 使用 `Enter to insert · Esc to close`，更窄时保留关闭提示。命令取既有 command 色槽，分类/适用范围保留文本。定向参考 [弹出列表行数](../../../codex/codex-rs/tui/src/bottom_pane/popup_consts.rs)的 8 行上限与 [命令输入组件](../../../codex/codex-rs/tui/src/bottom_pane/chat_composer.rs)的规范命令身份；本项目遵守已裁决的两步提交，不沿用参考的直接 dispatch 行为。
- 动态选项订阅归 Overlay。独立代码审查复现同一 picker 实例关闭重开、两个旧 load 先后完成时遗留监听器；现以打开 generation 检查 load/publication/清理赋值，选择/取消/替换均释放订阅。新回归覆盖旧 load、旧 publish、关闭与选择释放。
- Node 20.3 首轮 114 项中 3 个新断言误用了提交签名及尾空格语义；按既有 token/raw 契约精确修正测试，无产品迁就。扩大 9 文件/222 项通过，订阅修复后 223 项及构建通过。六组有效反转覆盖打开代际、共享清单、动态订阅、两步提交、8 项上限和真实容量，隔离源码逐字节/SHA-256 恢复后 87 项通过。容量反转前两轮未检出，因为无 hint 或仅一个匹配项时固定预算同样容纳；补足真实多行草稿+提示+溢出场景后触发断言，没有以修改产品制造失败。
- 两模式 actual CLI regular/fullscreen 均通过 `/help`/`/?`、100×60→40×12、别名过滤、canonical 填入、命名入口 usage、第二次提交 `/context`、`/quit` 搜索后再次提交 `/exit`。全过程 0 provider 请求、配置原文不变、退出 0。证据：`.tmp/help-check-ll90mzhw`、`.tmp/help-check-xknilp4k`、`.tmp/phase19-config/help-reversals/1791318527878725493`、`.tmp/phase19-config/help-pty-1791318265957407901`。静态 gates、43 项 script tests 与 NormProof 0 blocking 通过，四项既有函数数和 120 条文档来源 advisory 保留，见 `.tmp/help-gates-a5fgxet3`。
- 独立代码 APPROVE（修复后 198 项/9 文件）、架构 CLEAR（192 项/9 文件后补跑增强几何测试，证据 `.tmp/ui06-help-architecture-FndK85`）。普通/混合依赖图通过；InteractiveMode 宽口径 callback 数 83→83，其余触及模块不新增超限。对应 SHA 远端状态按提交后实际结果跟踪。前批 `c8fe6f1c` 已推送，Architecture Watch 37525200284 成功，CI 37525199873 当前仍运行。cost/tools 等报告迁移、CLI JSON 和持久语义重放继续；完整 UI-06、UI-07 及 Phase 19 尚未完成。


### 8.95 UI-06：费用与快捷键的语义报告

- [cost runtime](../../packages/ts-shell/src/core/commands/costCommandRuntime.ts)先读取一次 `readConfiguration().catalog`，无 host publication 才回退原 catalog loader；[cost model](../../packages/ts-shell/src/core/commands/cost/model.ts)复用共享计费器、bucket 身份与 cache 分析，报告显式按当前已接受费率估算已记录用量，不把新模型价格套给其他 provider 的历史 bucket，也不声称是历史账单。参考 [累计使用统计](../../../pi/packages/coding-agent/src/core/agent-session.ts)对全会话计量与当前 context 的分离，以及 [usage display](../../../oh-my-pi/packages/tui/src/overlays/usage-row.ts)对小额非零费用的显示边界；没有移植第二套账目或当前请求 gauge。
- [report](../../packages/ts-shell/src/core/commands/cost/report.ts)提供不可变 version 1 columns/spans/facts。共享估算器仅增加已有 allocation 判断的只读输出，不改计费公式。total-only、cache 缺价的零算术结果显示 unknown；有已计价 subtotal 则保留金额、明确 partial 与未计价数量，完整分类/完整公开适用零费率仍支持零。数字、费率来源、provider/model 身份和警告独立保留，窄列堆叠不丢失价格或来源。
- [cache report](../../packages/ts-shell/src/core/commands/cost/cache.ts)只在 cache-read 费率已知时比较成本，不把缺价当免费；重叠和差价明示估算，模型切换不能缓存的解释保持。窗口内 measured requests 和包含 reset/gap 的总 entries 分开。[format](../../packages/ts-shell/src/core/commands/cost/format.ts)统一 bucket/session/cache 金额精度；独立代码审查发现旧 cache 小额仍可能显示 `$0.0000`，已改为正数 `<$0.0001` 并补回归。
- `/hotkey` 的 [keyReport](../../packages/ts-shell/src/presentation/tui/chrome/keys.ts)替代同 owner 的旧 Markdown generator，继续消费有效键位表；逐键协议标记、unbound、冲突赢家和模式说明进入语义报告。初稿将新 producer 放入 core 会多出指向 presentation 的类型依赖，独立架构提出 WATCH；移回原有键位 owner 后转为 CLEAR，无重复契约或新通用目录。bridge 测试改用真实 renderer/sink/transcript 验证语义转交，参数提示与键值不靠 Markdown 字符串推断。
- 最终隔离 Node 20.3 的 10 文件/147 项和构建通过。初轮 101 项通过后的构建发现 cache facts 接口不满足 JSON 索引类型，已明确复制嵌套 totals/misses；小额浮点精确比较及旧 bridge renderer/方法名预期均修正为现有契约的精确断言，未改产品迁就测试。独立代码 APPROVE（最终 34 项），架构 CLEAR（81 项稳定快照后 owner 修正 36 项），两类依赖图无环、触及模块无新增函数超限。证据：`.tmp/usage-reports-a8qx4j4m`、`.tmp/cost-hotkey-architecture-final-nOQKpH`、`.tmp/hotkey-owner-architecture-ps4Bou`。
- 六组反转撤回 accepted catalog、unknown/zero、缺失 cache rate、极小正数、逐键 warning 和报告转交，全部触发行为断言；隔离源码逐字节/SHA-256 恢复后 34 项通过，见 `.tmp/phase19-config/usage-report-reversals/1791320222892234107`。五项静态 gates、43 项 script tests 与 NormProof 0 blocking 通过，四项原有函数数与 120 项文档来源 advisory 保留，见 `.tmp/usage-report-gates-j60h27zv`。两次真实 print 在 FORCE_COLOR=3 下仍无 ANSI，见 `.tmp/usage-report-print-7nz7ei1s`。
- actual CLI regular/fullscreen 各两次本地受控 provider 请求，验证 `/cost` 已接受费率/金额、100×60→40×12 堆叠 Total、`/hotkey` 搜索中的逐键协议警告、关闭后的无过滤词后续请求；配置原文不变、退出 0。regular 首轮等待完整响应标记，但 terminal 增量绘制没有重发完整标记；改为已接收请求+完成后的 gauge/composer 判断，随后又发现进程在两次 poll 之间正常退出的夹具竞态，补查谓词后通过，无产品修补。fullscreen 证据 `.tmp/phase19-config/usage-reports-pty-1791320265240927261/fullscreen-truecolor`，最终 regular 证据 `.tmp/phase19-config/usage-reports-pty-1791320381227688801/regular-truecolor`。本批远端状态按新 SHA 跟踪。前批 `7d1be040` 的 CI 37527593247、Architecture Watch 37527593240 均已按 SHA 核实成功。其余报告迁移、结构化报告 JSON 与持久语义重放继续，UI-06 和完整 Phase 19 仍未完成。


### 8.96 UI-06：工具列表到只读详情

- 裸 `/tools` 进入既有 [tools picker](../../packages/ts-shell/src/cli/interactive/picker/tools.ts)，搜索与选择复用 overlay。picker host 与直接命令均注入 `toolPoolFor`，读取当前配置过滤后的 core/skill/MCP 工具池；不再由 picker 回退到未过滤的 core 清单。打开及确认详情时复查目录，确认仅按精确名称查找；已移除的大小写敏感工具不会回退成另一个小写工具。显式目录检查沿用已有 MCP 发现边界，不将其描述成纯缓存读取。
- [工具报告](../../packages/ts-shell/src/core/commands/tools/report.ts)替换旧 Markdown 拼接，list/detail 的纯文本与不可变 version 1 facts 同源。列表保留缩写感知的首句摘要；详情保留完整说明、顶层参数类型/必填/描述，并明确没有顶层字段不等于 schema 无约束。沿用 `toolPlanMode`，资格与 permissions/approval 分开，机器字段标记 `permission: not-evaluated`。不会调用工具 execute、填入执行草稿或授予权限。
- `PickerOutcome.report` 将结果追加到已有 transcript 并交给 Pager，折叠后仍保留报告与可复制全文；没有启动或覆盖 TurnSink。带参及 print 命令沿原 parser/router，混合大小写、引号名称和 `--` 位置语义保留。定向参考 [只读报告宿主](../../../oh-my-pi/packages/tui/src/overlays/report-panel.ts)与 [工具元数据投影](../../../oh-my-pi/packages/coding-agent/src/session/session-tools.ts)，采用“读取元数据后展示”的职责边界，不移植其执行或注册系统。
- 异步报告发布受 overlay 代际和 shutdown 约束，新请求/问题关闭旧 overlay。架构审查发现旧全局 input hold 会在问题接管后继续吞掉答案；现按 overlay revision 计数，旧任务只释放自己的记录，运行时问题可立即接收键盘和粘贴。代码审查另复现排队 picker 的对象展开提前读取动态 empty getter，误把目录失败显示成空列表；已移除 getter，由 Overlay 拥有 loadFailed 状态和安全的 `loadError` 文本，失败不泄露异常正文，重试成功为空仍保持空结果。
- Node 20.3 最终隔离 10 文件/182 项与构建通过，见 `.tmp/tools-reports-vsxtrvej`。初轮两项失败分别是旧 Markdown 正则及最小 presentation fixture 的虚构 trust revision，测试改为语义事实/真实配置 binding 后通过，没有放宽产品 admission。独立代码 APPROVE（最终 77 项，先前 123 项），架构 CLEAR（最终 114 项，先前稳定 192 项），见 `.tmp/tools-overlay-final-iAAi8c`、`.tmp/tools-architecture-final-h9RHwQ`。普通与混合类型依赖图均无环；InteractiveMode 的 AST callable 计数保持 94→94，stock 20→21 中新增的 `pending` 是算术局部变量被正则误判，未新增函数，其余修改模块低于 20。
- 六组有效反转覆盖共享工具池、精确身份、报告交接、过期发布、失败状态和输入归属；隔离源码副本逐字节/SHA-256 恢复，恢复后 39 项通过，见 `.tmp/phase19-config/tools-report-reversals/1791321533538164368`。架构还独立反转 input hold 并检出问题回答丢失，见 `.tmp/tools-question-reversal-yd6yIl`。
- actual CLI regular/fullscreen 均验证过滤后的单工具列表、确认进入详情、100×60→40×12 的参数堆叠/搜索/滚动、关闭、带参直接详情和列表取消；两模式分别完成 list/detail print，FORCE_COLOR=3 下仍无 ANSI。全程 0 provider 请求、配置逐字节不变、退出 0，见 `.tmp/phase19-config/tools-reports-pty-1791321707667018694`。初轮过滤 path 同时命中说明正文，参数在屏幕下方；夹具补上 End 阅读后通过，没有修改产品迎合定位断言。
- 五项静态 gates、43 项 script tests 与 NormProof 0 blocking 均通过，见 `.tmp/tools-report-gates-ah8y4t_5`。NormProof 保留四项既有函数数 advisory，并新增上述 `pending` 算术变量误判；strict docs 的 120 项来源 advisory 不变。
- 前批 `0d2f78a2` 的 CI 37531001730 与 Architecture Watch 37531001756 均已按 SHA 核实成功。本批远端证据按新 SHA 跟踪；diagnose/sidebar/metrics、CLI 结构化报告 JSON 与持久语义重放继续，UI-06 和完整 Phase 19 尚未完成。

### 8.97 UI-06：诊断、指标与侧栏状态报告

- `/diagnose` 的语义 producer 放在 [workflow/diagnose](../../packages/ts-shell/src/workflow/diagnose/report.ts)，只检查连接配置的存在及状态，readiness 始终明确为未检查，凭据和端点内容不进入 facts。Git 检测或 status 失败显示 unavailable，计数与 clean 使用 null；`/workflow status` 同样不把失败伪装为干净工作区。参考 [Git status](../../../codex/codex-rs/git-utils/src/status.rs)仅成功后产生状态，以及 [Git overview](../../../oh-my-pi/packages/coding-agent/src/commit/agentic/tools/git-overview.ts)的数据/展示分离。
- [Git context](../../packages/ts-shell/src/workflow/gitContext.ts)使用原生 porcelain v1 NUL 协议，先统计完整 inventory 再截取展示样本；重命名保留目标路径、消费源路径，空格、箭头、Unicode、换行与 Tab 均不被 trim。独立复核发现全局过滤 `## ` 会误删同此前缀的源文件并吞掉下一项，现仅消费首个 branch header。hotspot 明确只基于展示样本，不冒充完整目录统计。
- `/metrics` 保留原跨进程/会话结构化日志来源，[reader](../../packages/ts-shell/src/observability/metrics/reader.ts)从最新文件/尾部读取，最多每文件 512KiB 和请求样本数；坏行、primitive/null 与不完整计量不导致解析崩溃。writer/reader 共用名称、单位、排序 tags 的 JSON tuple 身份，避免同名 count/ms 合并或分隔符碰撞，并复制调用者 tags。count 求总量，timing 求加权平均/max，溢出保留 unknown。参考 [runtime metrics](../../../codex/codex-rs/otel/src/metrics/runtime_metrics.rs)的 counter/histogram/unit 分离。
- 独立审查发现枚举/stat 故障会丢掉仍可读分片；现 logs owner 提供受控 unavailable 回调，metrics 对每文件严格读取，保留 healthy shards 和 partial/unavailable 状态。原 export/删除等 strict 行为不变。报告标注实际范围、读取量与不可读文件数，不以空表代表整段日志无计量。
- `/sidebar` 及 snapshot/manual refresh 复用既有有界、脱敏模型，由 [sidebar report](../../packages/ts-shell/src/presentation/sidebar/report.ts)保留逻辑行、severity、来源与 facts，runner 同时返回兼容文本和报告。窄屏交给既有 Pager 换行，不再用旧 box 的三行物理裁剪。快照只 tick 一次，仍明确按请求捕获；禁止内容检查覆盖完整序列化报告，源 ID 同样脱敏。旧 box renderer 继续服务其原直接消费者，没有新增状态采集器或宿主。
- 最终隔离 Node 20.3 的 19 文件/173 项及构建通过，见 `.tmp/state-reports-cew1a1b2`。独立代码 APPROVE、架构 CLEAR；架构最终 58 项、普通及混合类型图无环，新增 owner 1–7 个命名函数。六组反转覆盖 Git 可用性、完整计数、源路径消费、单位身份、部分枚举与 sidebar 报告交接，全部检出行为回归；隔离源码逐字节/SHA-256 恢复后 21 项通过，见 `.tmp/phase19-config/state-report-reversals/1791324402029725562`。
- actual CLI regular/fullscreen 均验证完整 17 文件 inventory、100×60→40×12 过滤、损坏隔离 Git index 后 unavailable、同名不同单位的 total 2/avg 6ms、窄屏滚动及 sidebar snapshot。六次 print 在 FORCE_COLOR=3 下无 ANSI，配置原文不变、0 provider 请求、退出 0。证据 `.tmp/phase19-config/state-reports-pty-1791324988153841133`。早期探针漏算 CLI 历史文件、在 resize 布局完成前发送 End；分别在夹具 exclude 历史目录并等待实际布局后修正，无产品迎合。
- 上批 `0bf26920` 的 Architecture Watch 37533912603 成功，CI 37533912579 失败：三个文件/五项未迁移的文本及 renderer 测试夹具。现 `turn/tools` 从 facts 检查真实 plan gate，print 保留精确工具池/零执行断言，router 使用单参数 renderReport 并验证 interactive/print 分流；独立补充复审 77 项通过。一次组合运行加载了修正前的双参数 mock，172/173 通过；上述最终 173 项已完整重跑。旧 CI 失败保留，本批远端证据按新 SHA 跟踪。
- CLI 结构化报告 JSON、持久语义重放、UI-07 及完整 Phase 19 继续；Windows 像素与真实 IME 仍未验证。
- 五项静态 gates、43 项 script tests 和 NormProof 0 blocking 通过，见 `.tmp/state-report-gates-noy2pk7d`；既有五项函数计数 advisory（含算术变量误判）及 120 项文档来源 advisory 保留。

### 8.98 UI-06：既有 JSON 事件流保留报告语义

- [JSON output](../../packages/ts-shell/src/presentation/terminal/jsonEvents.ts)在现有 `cli.output` 增加可选 `report`，保留 `run-event-stream.v1`、连续 order、兼容 text 和 observation-only/非成功声明。报告自己的 version 为 1；原无报告事件不新增空字段，也不改 query-event。未新增 CLI 开关、第二个 writer 或输出协议。
- [command bridge](../../packages/ts-shell/src/entrypoints/cliCommandExecutionBridge.ts)在 interactive、piped、print 均交付语义报告，普通 sink/终端仍收到同一纯文本。[bootstrap sink](../../packages/ts-shell/src/cli/bootstrap/cliBootstrapContext.ts)将可选 report 交给原 JSON writer；writer 从受控不可变快照重新生成文本和事实，避免调用者的旧文本或原始控制序列污染 JSON。数字、null、单位、来源与状态无需解析 TTY 行；ANSI/OSC 清理不受 FORCE_COLOR 影响。
- 定向比较 [print event 输出](../../../pi/packages/coding-agent/src/modes/print-mode.ts)与 [JSON event projection](../../../pi/packages/coding-agent/src/modes/json-event.ts)，采用输出边界投影语义事件的职责安排，保留本项目兼容文本和单一事件序号。模型回合期间仍抑制重复 prose，恢复后命令继续同一个流。
- Node 20.3 构建及 8 文件/64 项通过，包含编译 CLI 的 stdin/显式 `--print --json`、模型回合前后七类报告、完整事实/文本等价、连续序号与 FORCE_COLOR=3 无 ANSI；原工具零执行、结果与取消回归也通过，见 `.tmp/report-json-nr_1vs8p`。此前首轮 63 项通过，增补显式 print 场景后完整重跑。
- 两组反转撤回非交互报告交接与安全快照，均触发行为断言；隔离源码副本逐字节/SHA-256 恢复后 20 项通过，见 `.tmp/phase19-config/report-json-reversals/1791325412082291649`。本批不新增报告持久化或伪称语义重放完成；该任务、UI-07 与完整 Phase 19 继续。
- 独立代码 APPROVE（53 项及编译 CLI 的 plain/JSON print/JSON piped 精确文本比对），架构 CLEAR（52 项、稳定源码 hash、普通及混合依赖图无环、函数数未增），见 `.tmp/json-handoff-architecture-8R5GzA`。五项静态 gates、43 项 script tests 与 NormProof 0 blocking 通过，既有 advisory 保留，见 `.tmp/report-json-gates-95es7n9w`。上批 `94b09ca2` 的 Architecture Watch 37539820770 已成功，CI 37539820676 当前仍运行；本批远端按新 SHA 跟踪。

### 8.99 UI-06：持久报告、分支注释与启动恢复

- 既有 transcript 增加 `command-output` 观察记录，保留报告 version、兼容 text、时间和 `sourceEntryId`；报告是当前祖先节点上的带时间注释，后代继承，不是分支每次访问的新模型回合。[报告 codec](../../packages/ts-shell/src/core/commands/report/codec.ts)检查结构、角色、有限 JSON、深度/节点数以及语义和投影文本的 1MiB 上限。未知版本或坏语义降级为安全文本，时间戳规范化；原始及清理后 fallback 都有尺寸上限，列标题重复不能放大为无界文本。
- [持久化 owner](../../packages/ts-shell/src/session/reports/persistence.ts)在异步工作前捕获 cursor，锁内复查 leaf/branch，以既有 session 锁和 transcript 追加，不改元数据/state。保存区分 `saved`、`not-saved`、`unverified`，CLI 仅显示受控失败提示；缺少文件或删除目录不会被重建。追加通过同一文件句柄核验内容和 inode/device；不完整尾行保留原文并以换行隔开。没有承诺所有既有无锁删除的排他性或跨文件 crash 原子事务。
- session 读取一次事件流，选择当前 ancestry 的报告；`hasReportHistory` 独立记录隐藏分支的历史，避免报告会话被当作空会话丢弃。裸恢复候选包含仅报告会话。模型消息/context replay 仍只读取 message 事件；[history](../../packages/ts-shell/src/cli/interactive/history.ts)将报告置于源消息之后，已压缩源节点的注释放在可见回合之前，沿用合计 60 个 block 的恢复上限，保留语义以当前主题重绘。
- 修复 fork 原先只复制事件、保留新 root-only thread 的遗漏：[fork projection](../../packages/ts-shell/src/session/branch/fork.ts)重映射根节点、保留消息/分支/压缩身份并加载实际 fork。export 将报告作为 command 注释挂到真实源节点，源 ID 同样脱敏；HTML 默认展开选定祖先的报告，报告不会拆散 assistant/tool 配对。定向参考会话 custom entry 与 model context 分离、fork 保持事件 ancestry 的决定，未引入第二个消息日志。
- actual CLI 重启探针发现启动入口只画 welcome、没有恢复历史；现在启动和 `/resume` 共用恢复投影，welcome/配置诊断保留，并去掉重复的 prompt history 装载。参考启动入口显式渲染已加载会话的安排。regular/fullscreen 均完成 `/tools read`→退出→同 session 重启→100×60 到 45×18，报告只落盘一次、模型 message 为零、provider 请求为零、配置逐字节不变、进程退出 0，见 `.tmp/phase19-config/report-replay-pty-1791328593023289899`。早期不存在的标题断言属夹具错误；随后空首帧是真实产品遗漏，已按上述链路修复。
- Node 20.3 扩大组合 16 文件/297 项及构建通过，补充 store/layout 6 文件/40 项通过；最终启动修复后构建通过，7 文件/120 项通过，见 `.tmp/report-replay-l4tvzaff`、`.tmp/report-replay-store-x57wycv2`、`.tmp/report-replay-final-l9p5nur5`、`.tmp/report-replay-final-la5r5y3y`。最后组合首轮 119/120 的失败是旧 checklist 夹具缺少必需 session ID；补足真实 ID 后完整重跑，没有弱化 checklist 断言。六组有效反转覆盖尺寸、祖先选择、删除、半行、语义重绘、export，恢复后 16 项；启动遗漏另反转检出两类首帧失败，恢复后 37 项，隔离源码均逐字节/SHA-256 恢复，见 `.tmp/phase19-config/report-replay-reversals/1791327897582437955` 和 `1791328639083480564`。
- `94b09ca2` 的 CI 37539820676 和 `557a12cc` 的 CI 37540968921 均失败于同两项旧 sidebar 文本断言，各自 Watch 37539820770/37540968922 成功。现 router 夹具检查语义 headings/facts 和真实 section/item 上限，保留脱敏及隐藏事件断言；旧 SHA 不改称 CI 通过。本批远端按新 SHA 跟踪，UI-07、Windows 像素、真实 IME 与完整 Phase 19 继续。

- 五项静态 gates、43 项 script tests 与 NormProof 0 blocking 通过，见 `.tmp/report-replay-gates-misb452s`。既有五项函数计数 advisory（含算术变量误判）及 120 项文档来源 advisory 保留。
- 独立代码 APPROVE，启动修复后追加 37+5+16 项通过；架构 CLEAR，独立 14 文件/215 项、最终 delta 5 文件/69 项及导出/恶意时间/删除探针通过，见 `.tmp/report-architecture-5tV1CP`。普通及混合依赖图均无环，新增模块未超函数上限；既有 SessionManager 21、SessionStoreAccess 23 保留，不将已有超限描述为全库合规。

### 8.100 UI-07：启动计时的实际事件边界

- [startupTiming](../../packages/ts-shell/src/observability/startupTiming.ts)使用运行时 `performance.now()` 单调起点，首个间隔覆盖模块导入前的启动时间；报告保留 delta/elapsed，明确间隔并非独占耗时、父 launcher 不在进程计时内。原 startup-surface 标记改为 prepared，避免将非 TUI 启动投影说成首帧已画出。参考计时模块的 opt-in gate/命名空间组织，但不沿用首个 mark 才 reset 导致漏掉最早区间的决定。
- TUI 提供可选 input-ready/first-layout/first-write 观察，真实输入 listener 安装和 deferred enable、有效布局、stdout 成功 callback 分别发出。两个 painter 都传递写入回调；[FrameStartup](../../packages/ts-shell/src/presentation/tui/render/startup.ts)拥有一次性回调及 stop/restart 撤销，不让旧写入污染新启动。未启用计时不安装这些观察。没有将 stream callback 当作像素确认或性能提升证明。
- 最终 Node 20.3 构建和 7 文件/122 项通过，见 `.tmp/startup-check-ax4w0yv0`；既有 build:exe 成功生成本机产物，见 `.tmp/startup-exe-final-wsdbxctx`，未更改 package scripts/build 行为。三组有效反转覆盖进程起点、写入时机和 deferred input，恢复后 60 项；抽取 owner 后再反转最终写入回调，恢复后 51 项，见 `.tmp/phase19-config/report-replay-reversals/1791329364359423483`、`1791329559311131575`。源码副本均逐字节/SHA-256 恢复。
- 独立代码 APPROVE（116 项，owner 抽取后 51 项），架构 CLEAR（79 项/4 文件与 import-cycle gate），见 `.tmp/timing-architecture-CryAID`。审查识别条件表达式内 callback 导致 engine 超过 20；职责移入 render/startup 后 engine 保持 20→20，terminal 既有字段箭头计数未增长。
- 两模式实际 npm/tsx/JS/exe 各五次，以及关闭计时 JS 各五次，共 50 场全部通过，见 `.tmp/sm-642699446`。每次从外部启动前到 VT prompt、再到 composer 输入回显分别计时；内部 listener/layout/write 顺序正确，配置不变、零模型 message。重复四场的提示符中位数 regular/fullscreen：npm 2121/2088ms、tsx 1550/1552ms、JS 894/882ms、exe 410/411ms。关闭计时 JS 为 898/915ms，不能宣称零开销；冷/暖应用缓存、未控制 OS 缓存、P95 与早期夹具失败详见 [研究18 §5.5](18-input-slash-startup-context.md#55-ui-07-启动事件与入口矩阵2026-10-07)。没有声称本批比旧提交更快。
- 上批 `a8774cfa` 已推送，Architecture Watch 37546372288 成功；CI 37546372317 当前仍运行。本批远端按新 SHA 核实。UI-07 的实际请求上下文账目及完整 Phase 19 继续，Windows 像素/真实 IME 仍未验证。
- 五项静态 gates、43 项 script tests 与 NormProof 0 blocking 通过，见 `.tmp/startup-gates-zjry1oxl`；既有五项函数计数 advisory 和 120 项文档来源 advisory 保留。


### 8.101 UI-07：实际请求与上下文来源账目

- [request projection](../../packages/ts-shell/src/context/request/projection.ts)只保留最后已接受前台请求的精确 UTF-8 body bytes、UTF-16 code units、身份和时间；step 在 fetch 前只序列化一次，接受后从同一字符串测量。五种已有 endpoint 在声明处拥有字段归属，system/conversation/tools 序列化值和 JSON/settings envelope 合计等于 body；未知或重叠/不兼容字段不伪造分项。测量不含 headers、传输帧及压缩，也不将多媒体 bytes 叫作 tokens。
- [system prompt](../../packages/ts-shell/src/turn/prompt.ts)保留原组装文本，同时输出 base/instructions/appended/skills/separators 的尺寸；原始来源合计等于组装文本，但不再与 wire 分项相加。`/context` 使用实际有效工具池的 JSON 尺寸与 code units / 3.5 估算，当前工具池和捕获请求保持独立；缺少 tokenizer 明确 unavailable，聚合 provider usage 不按估算比例分摊。
- [foreground session](../../packages/ts-shell/src/turn/session.ts)发布收据并用身份匹配关联该次归一化 input usage；显式零有效、缺失未知、reset 后迟到 usage 不能重挂旧收据。既有 telemetry owner 管生命周期，context-reset 清除、usage-gap 保留观察，共享子代理 step 不覆盖前台；累计 snapshot 不存收据。显式命令报告沿用已有持久报告通道，只含尺寸与公开身份，无原始指令、headers、端点 URL 或凭据。
- 定向比较参考会话压缩后用量新鲜度与 host 收集实际状态/纯 report 分工，保留现有协议声明和 usage map，未新增平行请求构造器。Node 20.3 构建及 9 文件/180 项通过，见 `.tmp/ledger-check-beiwo3ah`；首轮 171/172 是新增夹具误把既有 3.5 除数写成 4，已纠正并完整重跑。三组有效反转撤回 UTF-8 测量、前台发布与 reset 清除，均触发行为失败；源码副本逐字节/SHA-256 恢复后 33 项通过，见 `.tmp/phase19-config/ledger-reversals/1791331184383581060`。
- actual CLI regular/fullscreen 各两次受控本地 HTTP 请求，最终报告与服务端原始 body 的 bytes/code units、四分项合计及 system 原文来源合计一致；第一请求 reported 9000、第二缺失 usage 显示 unknown；实际工具池恰为 read 一项，100×60→40×18 reader 可用，配置原文不变、退出 0，见 `.tmp/phase19-config/ledger-pty-1791331127879284147`。没有使用真实 provider 或作精确 tokenizer 声明。
- 上批 `9488179f` 的 CI 37547821878 与 Architecture Watch 37547821911 均成功；更早 `a8774cfa` 的 CI 37546372317 与 Watch 37546372288 均成功。当前批次独立代码 APPROVE、架构 CLEAR。后续 W5、Windows 像素、真实 IME 及完整 Phase 19 继续。

- 架构审查指出旧顶栏 “Last request” 可能来自共享子代理计量，与前台收据不同；现标题及 JSON facts 明确 foreground，顶栏改为 context measurement 并说明 delegated 用量。最终 Node 20.3 构建与 180 项、两模式实际 HTTP/PTY 全部重跑通过，见 `.tmp/ledger-check-s2scysev` 与 `.tmp/phase19-config/ledger-pty-1791331554487863324`；代码审查对最后展示修正独立 10 项通过并保留 APPROVE。
- 五项静态 gates、43 项 script tests 与 NormProof 0 blocking 通过，见 `.tmp/ledger-gates-dsdvwpro`；既有五项函数计数 advisory 和 120 项文档来源 advisory 保留。

- 独立架构最后 6 文件/139 项通过，普通及混合类型图 1751 文件均无环、无未解析相对导入；函数计数 telemetry 15→16、prompt 4→5、context command 2→1、新 projection 4，未新增超限，见 `.tmp/ledger-architecture-iDlVeb`。尺寸投影按请求体长度线性处理，本批未测独立吞吐性能。


### 8.102 SES-01：选择器加载与异步操作生命周期

- [OverlayHost](../../packages/ts-shell/src/cli/interactive/overlay.ts)将首加载和 reload 合为一条受控路径，picker 对象、open generation 与 request controller 同时匹配才发布；关闭、接受、新加载撤销旧 signal，旧成功/失败及 live subscription 不进入新实例。保留已有 staged apply revision 契约，没有另建 picker manager。
- rename/delete 绑定确认时目标，执行期间拒绝重复操作输入；完成只刷新原打开实例，返回 note 显示，异常显示结果未确认且不回显错误正文。关闭不会倒退已接受的实际写入，也不宣称底层不可取消工作已停。加载失败与空列表分开，预览结束；过滤/live replacement 的预览跟随当前身份。
- [OptionModel](../../packages/ts-shell/src/presentation/tui/chrome/options.ts)按 ID 保留过滤/排序焦点，目标离开时选择首个 enabled。多选 reload 保留用户明确取消的选择，移除消失或 disabled ID；全 disabled、空列表和不在有效集合中的快捷键不触发 apply。参考列表组件按稳定 session path 保持已触及选择、与初始化分开的安排，未复制参考实现或用索引夹取替代身份。
- 隔离 Node 20.3 构建和 8 文件/172 项通过，见 `.tmp/picker-check-2jn77ptk`；首次构建发现 void note 的类型未收窄，已修正。第一轮 170/171 的旧夹具在 load 尚未完成时接受空列表，现分开断言加载中不提交、加载后结束预览，未放松原断言。三组有效反转覆盖 reload 代际、mutation settlement 与 ID 焦点，全部检出行为失败；源码副本逐字节/SHA-256 恢复后 64 项通过，见 `.tmp/phase19-config/picker-reversals/1791332315906079355`。
- actual CLI regular/fullscreen 均完成报告会话→resume→重命名刷新→取消删除→关闭重开→100×60 到 40×18；真实 metadata title 已保存，配置原文不变、0 provider 请求、退出 0，见 `.tmp/phase19-config/picker-pty-1791332260970391936`。本批尚未完成 current 标记/初始焦点、截断外纳入、会话范围与 action owner 复验；SES-01 余项、SES-02 与完整阶段继续。
- 上批 `d28f379d` 已推送，CI 37550526553 和 Watch 37550526511 均在零步骤时失败；GitHub annotation 明确为账户付款/spending limit 导致 job 未启动。该 SHA 没有远端测试证据，不能将本地通过说成 CI 成功；账户侧恢复前后续提交同样需单独追踪。本批独立代码 APPROVE、架构 CLEAR。

- 五项静态 gates、43 项 script tests 与 NormProof 0 blocking 通过，见 `.tmp/picker-gates-v47psh2k`，既有 advisory 保留。独立代码最终 overlay/options 64 项及 disabled approval 快捷键探针通过；架构 7 文件/135 项及最终文案后的 overlay 45 项通过，见 `.tmp/picker-architecture-_tgadb3y`。普通/混合类型图无环，JSON asset 检查后无未解析相对导入；计入 accessors 的 overlay 为 19→20、options 17→17，后续增加职责需要抽出模块。

### 8.103 SES-01：current 身份、范围与动作复验

- [selection owner](../../packages/ts-shell/src/session/navigation/selection.ts)使用实时运行时 session ID 和项目路径身份；同项目已有 reentry surface 才可进入列表，正常 completed 会话可重开，不误用异常恢复 eligibility。按 updatedAt 降序和精确 ID 稳定排序，最近 40 条外的 current 可额外纳入，但不绕过范围/内容过滤。磁盘 current 指针不参与判断；缺失/不可读、跨项目、无保存内容及被搜索隐藏各有说明。
- [session picker](../../packages/ts-shell/src/cli/interactive/picker/session.ts)每次 load 捕获上下文，按 current ID 初始聚焦；resume/rename/delete 前检查 offered ID、实时 session/project/忙碌状态、fresh target 的存在/内容/范围，以及 requested ID 与 metadata ID 相同。当前删除保护直接比较 requested ID，堵住加载后伪造 metadata.id 的绕过路径；普通有效完成会话仍能恢复/重命名/删除。复用现有 action owner，不宣称跨进程租约或跨文件原子提交。
- [modal](../../packages/ts-shell/src/presentation/tui/chrome/modal.ts)为右侧 note 保留空间，100 字符标题在 40 列仍显示 current；状态单独换行，pending/action notice 优先于过滤说明，加载失败不误报 current 被过滤。真实窄屏探针发现删除拒绝最初挤在静态 footer 后被裁剪，现统一到状态行并补实际 OverlayHost 确认回归。宿主回调抽入 session/host，InteractiveMode AST 函数数 94→93，modal 10、overlay 含 accessors 20 均未增长。
- 定向参考列表按稳定身份保持焦点以及拒绝删除当前会话的决定，保留目标自身的 reentry/path owner。最终隔离 Node 20.3 构建与 9 文件/188 项通过，见 `.tmp/current-check-uszyrchs`。三组有效反转撤回截断外 current、metadata/requested ID 一致性和当前删除保护，均触发行为失败；隔离源码逐字节/SHA-256 恢复后 16 项通过，见 `.tmp/phase19-config/current-reversals/1791334277492316963`。
- actual CLI regular/fullscreen 均在运行后另建 45 条较新会话和一条外项目会话，磁盘指针改变仍聚焦运行时 current；41 项列表排除外项目，拒绝删除 current，100 字符重命名后 40×18 仍显示标记、拒绝和过滤说明，重开保持焦点，再恢复 Recent 44 并验证 current 更新。47 个 metadata 保留，配置原文不变、0 provider 请求、退出 0，见 `.tmp/phase19-config/current-pty-1791334713760133426`。
- 独立代码最终 APPROVE（5 文件/151 项），架构 CLEAR（最终 3 文件/77 项、1754 文件图无环/未解析相对导入），见 `.tmp/session-picker-architecture-se7te1me`。SES-01 功能验收已完成；同步全列表扫描仍在，41 项展示不能冒充有界 I/O，SES-02 与完整 Phase 19 继续。
- 上批 `eba69f51` 已推送，CI 37551797587 和 Watch 37551797576 均零步骤失败，GitHub annotation 仍明确账户付款/spending limit 阻止 job 启动；与前批 `d28f379d` 一样没有远端测试执行证据。本批远端按新 SHA 单独追踪。
- 五项静态 gates、43 项 script tests 和 NormProof 0 blocking 通过，见 `.tmp/current-gates-5gislqe9`；既有五项函数数量及 120 项文档来源 advisory 保留。

### 8.104 SES-02：核心文件逻辑大小采样

- [store/files](../../packages/ts-shell/src/session/store/files.ts)复用实际目录投影和优先级进行异步定位，每批最多 41 个 ID、4 个 worker，每个 worker 顺序采样 metadata/transcript/state；不扫描目录、读取内容或计入锁/artifact。当前 loader 在历史目录中同样要求这三个核心文件，未凭目录年代虚构 state 可选规则。readonly files 服务经既有 store/read surface 字段暴露，没有增加其方法或新 facade。
- 核心文件采样两次，只有普通文件身份/大小/mtime/ctime 一致才累加；复核目录身份和最终目录优先级。部分稳定文件为 partial，全未知、目录消失/替换或权威布局改变为 unknown/null；真实零是 complete/0。保留 sampledAt，无缓存，不持写锁，不宣称跨文件快照。取消前检查、派发间检查和完成后检查配合 allSettled 排空在途 stat；取消不伪装空列表或 unknown 大小。
- [大小展示](../../packages/ts-shell/src/session/presentation/size.ts)替换消息条目数，使用二进制单位；partial 明确为已采样部分，不宣称并发截断后仍是当前大小下界。picker 在 size await 后先验 signal 再提交 context/offered ID。代码与架构独立审查均发现原 modal 不消费 picker.footer，现通过既有换行状态行回退展示逻辑字节及附件排除说明，保持动作/current 状态优先级，未扩大行预算。
- 定向比较参考 async stat、受限 worker 与取消传播决定，采用相同读取资源边界；其列表仍全量枚举/解析 transcript，不满足下一步目录和字节预算，未复制这一方案。两轮构建均通过；第一轮 273/279 的六个失败是新夹具对不可重定义 ESM namespace 做 spy，改为模块 mock 后最终 Node 20.3 构建及 12 文件/279 项通过，见 `.tmp/size-check-itajam9h`，未修改产品迎合夹具。
- 四组有效反转撤回两次稳定性、历史目录搜索、取消与 modal scope，均触发行为断言；隔离源码逐字节/SHA-256 恢复后 24 项通过，见 `.tmp/phase19-config/size-reversals/1791335335834624290`。actual CLI regular/fullscreen 分别统计核心文件 4982/5000 bytes 并验证 `4.9 KiB` 展示，额外 lock/artifact 不计入，40 列 current/拒绝/过滤、重开和切换继续通过；配置原文不变、47 个 metadata 保留、0 provider 请求、退出 0，见 `.tmp/phase19-config/size-pty-1791335335878474310`。
- 独立代码 APPROVE（最终 5 文件/122 项及真实目录删除/替换探针）；完整列表仍同步加载所有 transcript，仅后置 size 采样有界，SES-02 的目录/摘要索引尚未完成。
- 上批 `891bfd72f65c5cb43a02e3c3536be8c4f1a75e5b` 已推送；CI 37554930370、Watch 37554930469 均零步骤失败，两个 annotation 均核实为付款/spending limit 阻止启动，没有远端测试执行证据。本批远端按新 SHA 跟踪，完整 Phase 19 继续。
- 独立架构 CLEAR（5 文件/90 项及真实交叠加载取消探针），1757 文件普通/混合图无环、无未解析相对导入；新 owner 7/1 函数，既有 read surface 23→23、store access 27→27、overlay 含 accessors 20→20，见 `.tmp/session-size-architecture-5mmat2ld`。五项静态 gates、43 项 script tests 与 NormProof 0 blocking 通过，见 `.tmp/size-gates-ou4tvgg1`；既有 advisory 保留。

### 8.105 SES-02：增量会话目录与可见的部分结果

- [session/store/catalog](../../packages/ts-shell/src/session/store/catalog/index.ts)为默认 resume picker 和会话参数补全提供增量摘要：先返回运行时 current，再以异步目录游标发现历史，每次更新最多检查 64 项目录记录、读取 16 个摘要，4 路并发。metadata/state/transcript 正文分别限制为 64 KiB/1 MiB/2 MiB，读取块为 64 KiB；超大状态/转录保留 limited/unknown reentry，损坏或不可读来源显式计数。结果为最近 40 条加同范围 current；完整 action owner 仍在动作前重新加载并验证保存的会话。
- 摘要复用既有分支/报告投影和提取后的共享 transcript parser，保留 JSON BOM 读取兼容。实际文件打开前后检查身份/版本，读取完成后复核核心文件与目录优先级；512 项进程内版本缓存避免重复解析，扫描未命中不驱逐已有项，current/最终可见项显式保留。独立架构审查发现并修复顺序扫描淘汰问题，522 会话重复扫描的正文打开数从 1,566 降至 30，见 `.tmp/catalog-architecture-final-nrqnhli4/probe.log`。
- [picker/session/listing](../../packages/ts-shell/src/cli/interactive/picker/session/listing.ts)承担订阅、取消和摘要版本变化后的大小补充；既有代际和 workspace/session 身份检查继续生效。补全支持有界增量发布，失败或 1500 ms 期限到达时保留已知候选并显示 incomplete。真实 PTY 发现候选存在时状态被隐藏，现通过一次 hintStatus 快照保留独立提示行；取消/退出提示优先。显式选择按候选值及完整草稿编辑快照保留，换草稿不会沿用旧选择。
- 定向比较参考的异步读取、受限 worker、取消及进度发布决定；采用这些资源与生命周期约束，额外限制目录页和正文大小，没有复制全量 readdir/完整 transcript 方案。完成全局发现仍枚举历史，缓存仍检查文件版本；旧完整查询、恢复诊断及导出 API 保留，不宣称所有会话读取均已增量化或总 I/O 恒定。
- 最新源码 Node 20.3 构建及 10 文件/212 项通过，见 `.tmp/catalog-check-6jwu7olk`；此前扩展组合 15 文件/281 项通过，见 `.tmp/catalog-check-rn_uwfgu`。独立代码审查发现的 BOM 兼容回归已修复，最终代码 APPROVE，另行 6 文件/112 项通过，见 `.tmp/catalog-check-xksutx7k`；不可用的早期审查请求未计作通过。
- 四组目录/缓存/读取后复验/取消反转均检出行为失败，源码副本逐字节/SHA-256 恢复后 10 项通过，见 `.tmp/phase19-config/catalog-reversals/1791340343059269782`。三组状态显示/选择身份/期限保留反转同样有效，恢复后 64 项通过，见 `.tmp/phase19-config/catalog-ui-reversals/1791340743149884233`。
- actual CLI regular/fullscreen 的最终扩展探针均通过：渐进加载中取消重开、损坏外项目来源下仍显示有效补全及 incomplete、最近 40 条外 current、40 列状态/拒绝/过滤、重命名、切换与 4.9 KiB 逻辑大小，附件排除；47 个 metadata 保留、配置原文不变、0 provider 请求、退出 0，见 `.tmp/phase19-config/catalog-pty-1791340882748521394`。较早探针的状态隐藏失败保留为已修复的产品缺陷，没有改写为原先通过。
- 上批 `a1df2e846007f6ef780bba3b1d0f12ca959e489b` 已推送；CI 37556140158、Watch 37556140209 均零步骤失败，annotation 核实为账户付款/spending limit 阻止启动，不是远端测试执行失败或通过。本批远端按新 SHA 跟踪；SES-03 及 W5 其余任务、完整 Phase 19 继续。
- 独立架构最终 CLEAR；1,765 文件普通/混合依赖图均无环。最终 UI 增量复核确认 InteractiveMode 仅替换既有 callback，AST function-like 节点 126→126，既有数量 advisory 不增长；view 19、suggestions 14、hints 4，未新增超限 owner。代码 APPROVE 与架构 CLEAR 均有独立返回证据。
- 五项静态 gates、43 项 script tests 通过，NormProof 阻断义务全部满足、0 blocking，见 `.tmp/catalog-gates-gv5waz_1`；原有函数数量与 120 项文档来源 advisory 保留。产品验证使用 Node 20.3；NormProof 首次出现其工具要求 Node 24 的 engine 提醒，随后在本机 Node 24.15 重新执行并核验阻断结果，未修改产品 Node floor。

### 8.106 SES-03：分支导航真值与视图一致性

- [revert owner](../../packages/ts-shell/src/session/navigation/revert.ts)从 SessionManager 提取实际导航，保留 `Promise<number>` 兼容面；摘要准备失败、leaf 写入与 branch note 追加分别处理。锁内重验预期 thread/project，提交前复查会话 ID、创建时间、项目和目录身份，只改 thread 并保留最新无关状态。写后 note 失败携带安全 warning，由 [CLI owner](../../packages/ts-shell/src/cli/runtime/navigation.ts)重读发布 unchanged、changed、changed-with-warning、unknown；异常不再等同完全未变，错误原文不进入提示。
- [共享 snapshot](../../packages/ts-shell/src/session/store/sessionStore.ts)一次取得 session/state/events，导航的活动投影与候选 prompt 不再分别读取；[文件版本](../../packages/ts-shell/src/session/store/version.ts)与目录优先级在前后复核，catalog 复用原版本函数，删除重复定义。检查是乐观一致性，不宣称跨文件快照、跨进程事务或崩溃原子性。摘要期间 runtime 身份、忙碌状态或磁盘绑定改变时，不覆盖新回合/新项目的视图与状态。
- rewind/tree picker 只传递 owner 确认的 draft，保留原问题空白，不用缓存的 current 提前返回；磁盘已在目标而运行时仍旧时只刷新视图。`status` 描述保存的导航结果，`changed` 只触发已确认的运行时视图替换，两者明确区分。转录复建直接消费已确认 snapshot，不再第三次读磁盘；旧分支可重入，消息计数排除上下文注释，文件不变。
- [regular painter](../../packages/ts-shell/src/presentation/tui/render/mainScreen.ts)按 transcript 集合替换重置拥有的可见行账本，保留先前原生 scrollback；fullscreen 同步复位滚动位置，普通 append 不改变集合身份。定向比较只读参考快照 `5b6c792b4` 的 `agent-session.ts:navigateTree`、`session-manager.ts:branchWithSummary` 与交互重建：采用保留分支、从 canonical session 重建和 owner 返回编辑文本的决定；本项目仍按已裁决语义保留所选 user entry 为 active leaf，没有改成其 parent 语义，也没有复制其他存储方案。
- 独立审查复现并修复读取混合/项目变化后，又补齐“已在目标但界面旧”“摘要时启动新回合”“tree current 缓存绕过 owner”三个反例。最终代码 APPROVE（另行 22 项及四场独立探针）、架构 CLEAR（1767 文件包含混合类型/值及 re-export 的图无环），现有入口函数数量 advisory 未增加。早期专用审查 503 与一次速率限制均未计作批准；后续独立返回才作为证据。
- 最终 Node 20.3 构建及 13 文件/308 项通过，见 `.tmp/catalog-check-ewgz5x1n`。10 组关键决定反转均检出行为断言，源码副本逐字节/SHA-256 恢复后 4 文件/93 项通过，见 `.tmp/phase19-config/navigation-reversals/1791371887573419034`。早期一次恢复复跑因同文件时间 tick 的 ABA 夹具失败、一次因夹具保留空 runtime session 失败，分别改为明确版本变化及真实已加载会话，原断言未弱化；失败记录保留。
- 最终 actual CLI regular/fullscreen 均通过长历史回退、单次说明、完整问题回填、40 列 resize、取消、旧末尾恢复、note 追加失败后的 changed-with-warning、重读失败的 unknown，以及通过 tree 当前项刷新旧视图、同 session 重启。各执行两场进程、3 次合成本地摘要请求，没有提交用户问题，配置和工作文件原文不变、退出 0，见 `.tmp/phase19-config/navigation-pty-1791372053934295414`。终端屏幕模型与磁盘断言不替代 Windows 像素/字体/IME 证据。
- 上批 `4adb7ee09a28f81898c1548efdc33501ffe5b898` 已推送；CI 37563819193、Watch 37563819203 均零步骤失败，两个 annotation 均核实为账户付款/spending limit 阻止启动，没有远端测试执行证据。本批远端按新 SHA 跟踪；SES-04、W5 其余项与完整 Phase 19 继续。
- 当前结果契约 gate 实跑 6 文件/149 项通过，见 `.tmp/result-contract-KeR2a4`；五项静态 gates、43 项 scripts 及 NormProof 0 blocking 通过，见 `.tmp/navigation-gates-inj7qzhl`。产品构建/测试使用 Node 20.3，独立架构工具使用其要求的 Node 24；既有 5 项函数数量与 120 项文档来源 advisory 保留。

### 8.107 SES-04：会话直达管理与完整目录匹配

- `/new` 与 `/session new` 复用既有 `/clear` 的新会话边界；有会话内容或保存报告的旧记录保留，空会话仍按原规则清理。`/rename [title...]` 管当前会话，裸调用进入标题编辑器；`/delete <id|prefix|title|last>`、`/session rename <reference> [title...]`、`/session delete <reference>` 管已保存记录。语法、帮助、固定及动态候选共用当前命令系统，没有新增平行生命周期。
- [reference owner](../../packages/ts-shell/src/session/store/catalog/reference.ts)先定位精确 ID，再有界读取完整历史以解析 prefix/title/last；不从最近 40 条截断页选唯一结果。歧义、发现不完整、标题或新近性证据不足、跨项目管理均拒绝；选中摘要重新核验版本。普通恢复保留当前项目优先及损坏精确记录后续恢复路径，等待期间 runtime 身份改变不切换。定向比较参考的 exact-first 与复用会话管理决定；没有采用其首个 prefix 即成功的规则。
- [lifecycle owner](../../packages/ts-shell/src/session/lifecycle/management.ts)准备时绑定 session/project、实际目录及核心文件版本，批准后在既有 state lock 内重验身份、版本、busy、项目和当前删除保护，再调用现有 rename/delete。标题限制为非空、4096 bytes 内且无控制字符；预览剥离终端控制。changed/unchanged/unknown 分开，writer 开始后的异常保留 unknown；仅删除已核验成功且其目录锁清理返回 ENOENT 的窄情形重验为 changed。没有承诺跨文件崩溃事务或跨进程执行租约。
- 直达和列表动作复用该 owner，列表绑定首次提供的版本。删除默认选 Cancel；非交互删除只预览，显式脚本重命名走同一 owner。现有独占 overlay 与输入 hold 覆盖预览及后继标题编辑器，修复队列交接提前放行的问题。独立审查最终 APPROVED，另行 Node 20.3 的 3 文件/83 项通过，见 `.tmp/catalog-check-9thq02m4`；依赖方向检查通过，新增 owner callable 数最多 7，既有 InteractiveMode 计数未增长。
- Node 20.3 构建及 14 文件/353 项通过，见 `.tmp/catalog-check-0jsvkiug`；随后新增队列回归，最终该文件 38 项通过，见 `.tmp/catalog-check-we4kcnj5`，未声称合并跑过 354 项。结果契约门禁实际 6 文件/149 项通过，见 `.tmp/result-contract-l7wXcr`。七组 exact/歧义/incomplete/stale/current-delete/unknown/队列反转均检出行为失败，隔离源码逐字节/SHA-256 恢复后 74 项通过，见 `.tmp/phase19-config/management-reversals/1791446380140805673`。首轮删除锁清理失败已修复，原失败未改写为通过。
- actual CLI regular/fullscreen 均通过旧标题碰撞、当前/外项目删除拒绝、目标及裸当前 rename、默认取消、批准前 metadata 外改拒绝、新批准删除、保存报告后 `/new` 保留旧记录及窄屏；配置/工作文件原文不变、零 provider 请求、退出 0，见 `.tmp/phase19-config/management-pty-1791446416062799200`。早期探针的隔离 store 定位及空会话保留假设分别归为夹具错误，未修改产品语义迎合。
- 五项静态 gates 与 43 项 script tests 通过，见 `.tmp/catalog-gates-gbextaoi`；NormProof 使用 Node 24.15 重跑，见 `.tmp/management-judge-m55rxjnb`，实际 enforcement 确认 0 blocking、所有阻断义务 satisfied，五项既有函数数量 advisory 保留。上一 `0ab9fbd042064f10a750b836fff8edfd3f4060c2` 的 CI 37614306355 与 Watch 37614306273 均零步骤失败，两个 annotation 核实账户付款/spending limit 阻止启动；本批远端按新 SHA 跟踪。SES-05、W5 其余项和完整 Phase 19 继续。

### 8.108 SES-05：持久多根授权与同会话工作区迁移

- `/workspace add <path>` 默认增加附加读根，显式 `--write` 授予文件编辑范围；`remove` 只撤销授权，不删文件；`rebind` 迁移保存会话主根并保留 ID。主根与最多 16 个附加根互不重叠，捕获 canonical path 和目录 identity；symlink 别名、目录替换、忙碌和保存状态变化均拒绝。失效、缺失或被 symlink 替换的根优先按登记路径移除。重复添加相同授权不重排或递增 revision。
- [session owner](../../packages/ts-shell/src/session/continuation/workspace.ts)在既有 state lock 内复验，附加授权只保存到 state.json；写后重读确认，writer 开始后的 unknown 阻止后续动作。`/new`、同项目 fork 与重启保留授权，跨项目 attach/fork 不携带；空会话沿用退出清理。配置、技能、hooks、MCP 的发现归主根，附加根只提供文件范围。[file-root owner](../../packages/ts-shell/src/core/workspace/tools.ts)在 turn adapter 选择单个 authority root，复用原读写 service、jail、审批与原始/根相对 deny rules；read selector、grep、glob 与显式文件 LSP 可访问登记根，默认相对路径及 artifact 存储仍归主根。同 workspace 子代理继承附加范围，独立 worktree 不自动继承。
- [migration owner](../../packages/ts-shell/src/cli/workspace/migration.ts)复用 state-first rebase 与 guarded compensation，更新实际 binding、移除成为新主根的附加项，再从核实记录切换 runtime；配置、技能、MCP 与 UI cache 随确认切换刷新。restored/unchanged 不冒充成功，committed 跟随失败显示 warning，partial 或无法核实的保存/切换阻止动作。跨项目 attach 创建保存会话后失败也区分已创建/未确认。共享 admission 每次检查持久 metadata/state 和根授权，不读取 transcript 正文；另一进程 remove、降为只读或同 ID rebind 后，旧请求、hooks、MCP 与文件效果边界拒绝旧授权。`/new` 拒绝从失效内存复制权限，交互保留对话并显示错误，不抛出未处理异常。检查点不等于跨进程执行租约，不能撤回已启动 shell，也不承诺跨文件崩溃原子性。
- shell 沿用可选 OS isolation。Linux 在可写 grants 后重施附加只读挂载，denyRead 最后覆盖；macOS profile 对附加读根明确 deny file-write，路径字符串转义。未启用默认 isolation；关闭/不可用时保持原 unisolated 报告策略，文件工具范围与 shell 的 OS containment 分开。实际 Linux `bwrap` 在可写父目录下通过读根可读/不可写、隐藏子目录不可读、主根可写，见 `.tmp/phase19-config/workspace-sandbox-1791448699437556047`；macOS 证据限于生成 profile。定向比较参考的持久根、fork/resume、主根 re-filter、权限配置分离及保护挂载顺序，采用这些决定并保留反转回归，没有另造 writer。
- 最终 Node 20.3 构建及 13 文件/263 项通过，见 `.tmp/catalog-check-audivm06`；结果契约实跑 6 文件/149 项通过，见 `.tmp/result-contract-p44SjQ`。八组只读写入/fork/re-filter/沙箱优先级/持久撤权/替换根移除/unknown/终端拒绝反转全部检出 AssertionError，源码逐字节与 SHA-256 恢复后 4 文件/58 项通过，见 `.tmp/phase19-config/workspace-reversals/1791448880509935631`。独立最终 APPROVED，另行 5 文件/67 项及最终 `/new` 编译复验通过；owner callable 增长低于 20。actual CLI regular/fullscreen 各两场进程、14 次本地合成 HTTP 请求，通过附加读/拒写/批准写、移除撤权、`/new`/重启、同 ID rebind、primary-only 技能/MCP 切换及窄屏 overlap 拒绝；配置和原工作文件原文不变、退出 0，见 `.tmp/phase19-config/workspace-pty-1791449029064748594`。早期报告面板/alternate-buffer 同步、GET readiness、session flag 和空会话退出清理假设归为夹具错误，未修改产品契约迎合探针。
- 上一 `52f87bba916c08157dd757f450190e9fde7cbbdc` 的 CI 37747816337、Watch 37747816308 均零步骤失败，两个 annotation 核实账户付款/spending limit 阻止启动，不计远端测试通过。本批远端按新 SHA 跟踪；EDIT-01/02/03、W5 余项和完整 Phase 19 继续。
- 五项静态 gates 与 43 项 script tests 通过，见 `.tmp/navigation-gates-t6ntkgxd`；NormProof 使用 Node 24.15，enforcement 确认 0 blocking、所有阻断义务 satisfied，五项既有函数数量与 120 项文档来源 advisory 保留。新增 `core/workspace` 的共享职责已登记到架构规则，entrypoint 保持薄 re-export。

### 8.109 EDIT-01：已提交操作收据与安全恢复底座

- [operation owner](../../packages/ts-shell/src/edit/recovery/operation/write.ts) 接入实际会话 `write`/`edit`，绑定 session、canonical 主根及文件授权根 identity、实际 tool-call/correlation、单调 sequence、精确前后 hash 和 snapshot 引用。写前快照及 intent 必须保存，只有逐文件写后核验与收据确认才发布 committed；无变化不新增撤销项。附加根内容仍保存到主根 ledger。无归属旧快照不自动认领，带归属快照不能从旧 primitive 绕过 operation 恢复。
- [store](../../packages/ts-shell/src/edit/recovery/operation/store.ts) 复用既有文件锁持久 receipt/index，拒绝缺 index、未登记 receipt、重复序列、消失或旧 revision 收据。正常候选只读当前 session/workspace；较新 intent/partial/unknown 是 barrier，不回退到更旧操作。审批绑定 operation/session/root/full-preview revision；准备后稳定锁住完整目标集，锁内重读当前版本、receipt 和最新 barrier，持久 undo intent 后逐文件核验及保存恢复结果。中断意图与 unknown 可重启查看，不能自动重放。本批提供真实域消费者，`apply_patch` 与 `/undo` 面板继续归 EDIT-02/03。
- [共同 committer](../../packages/ts-shell/src/edit/authority/commit.ts) 与 [inspection](../../packages/ts-shell/src/edit/authority/state.ts) 取代旧 workspace facade 中的重复 writer，复用于普通编辑、快照、receipt 和恢复；拒绝 symlink、非普通文件、无效 UTF-8、外改与根替换。Linux 固定目录 descriptor，临时文件 fsync、更新 rename、创建 exclusive link、写后重读，保留 BOM/CRLF 与普通权限位。store lock 与目录创建也固定到实际目录；应用锁结束时清除 AsyncLocalStorage 的嵌套持有计数。macOS 路径 fallback 尚无原生运行证据；无通用文件系统 CAS、跨文件崩溃原子性或同用户篡改不可抵赖承诺。
- legacy restore 先准备并验证 schema/blob/hash/size，再共享锁与最后 stale-read，capture/read 的 before-content 上限统一为 64 MiB；会话编辑超限在写前拒绝。dry-run 保持 preview；writer 后未核验结果在 bridge/command 显示 unknown/partial，不再伪装未执行。interactive/print 转发附加根，复验 admission 及 read/write/edit deny rules。定向比较只读参考 `packages/durable/src/tools/edit.ts` 的完整 mutation queue 和原始文本保留，以及 `snapshot/index.ts` 的范围/存储串行化；采纳相应决定，未采用会覆盖外改的 force-checkout 恢复方案，反转回归保护采用的决定。
- 最终生产代码 Node 20.3 构建及 9 文件/64 项通过，见 `.tmp/catalog-check-xxg7g4f5`；随后补一项独立复核发现的固定 lock-dir 回归并修正嵌套锁测试同步点，最终隔离副本 3 文件/28 项通过。九组 blob/root/approval/stale/unknown/barrier/index/lock-cleanup/pinned-lock 反转全部检出行为 AssertionError，源码逐字节/SHA-256 恢复，见 `.tmp/phase19-config/edit-reversals/1791451874950073591`。首轮嵌套锁反转未检出，已分类为测试未等待真实路径解析完成，修正后重新检出；原失败记录保留。此前扩大组合 17 文件/178 项、结果契约实际 6 文件/149 项通过，分别见 `.tmp/catalog-check-eu8wvvgl`、`.tmp/result-contract-3zdaqN`，不把分次执行合成新套件数字。独立最终 APPROVED，另行隔离 Node 20.3 安全探针 14 项通过。
- actual CLI regular/fullscreen 各两场进程、14 次本地合成 HTTP 请求，批准的附加根 write 生成唯一 committed receipt，实际 session/call ID、主 ledger、附加文件根及 after hash 均核实；只读拒写不产生额外收据。移除撤权、new/restart、同 ID rebind、技能/MCP 刷新和窄屏拒绝仍通过，配置/原工作文件不变、退出 0，见 `.tmp/phase19-config/edit-receipt-pty-1791451767205171523`。这证明实际编辑收据接线，没有宣称 `/undo` 面板完成。
- 上一 `693eabc876e9f3fbcccf781b780a3c0d701aaa07` 的 CI 37752192116/job 113227863615、Watch 37752192235/job 113227863793 均零步骤失败；两个 annotation 核实账户付款/spending limit 阻止启动，未计远端测试通过。本批远端按新 SHA 跟踪；EDIT-02/03 与完整 Phase 19 继续。
- 五项静态 gates、43 项 scripts 通过，1799 文件的 runtime/type import 图无环；Node 24.15 的 NormProof enforcement 确认 0 blocking、所有阻断义务 satisfied，artifact 固定保存于 `.tmp/navigation-gates-2l_plaa_`。新增/实质拆分 owner 的 function-like names 最多 15，既有入口 advisory 保留；架构规则已登记共用 committer 与 receipt owner。
