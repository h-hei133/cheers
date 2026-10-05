---
title: "15：深度研究命令的真实形态设计与差距研究"
category: article
sources: [14-user-experience-research, deep-research-command-architecture, phase-18-decisions, openai-deep-research-guide, anthropic-multi-agent-research, langchain-open-deep-research, gpt-researcher-docs, dzhng-deep-research, jina-deepsearch-guide, storm-paper, smolagents-open-deep-research, openalex-api, arxiv-api, pi, oh-my-pi]
created: 2026-10-05
updated: 2026-10-05
tags: [research, deep-research, agent-loop, subagents, slash-commands, design, adversarial-verification, literature-review]
summary: "复审并统一深度研究的现行决定：/deep-research 承担软件与论文双域、迭代研究、全文读取和对抗核验，/web-research 保留有界收集器。新研究 owner 复用既有 TypeScript loop、工具与主子共享预算/持久恢复，补齐可消费的来源与声明证据。保留原研究的开源材料、星数快照及旧实现历史，修正纯 prompt 即生产就绪、摘要即全文、红队未反驳即证真等过度承诺。本轮为文档修订，未实现运行时能力。"
confidence: mixed
---

# 15：深度研究命令的真实形态设计与差距研究

## 1. 范围与结论口径

本篇基于 [14 号研究](14-user-experience-research.md) §6、Phase 18 裁决及后续用户要求，复审新增研究中的事实、可执行性与内部矛盾。基线为 Cheers `28ff98cee8c4dd63e6752452f73a362ed3559ae3`；本地参考快照为 pi `b2b5c42f`、oh-my-pi `1c0993c3`。本文中的未来 owner、接口和流程均为 **Phase 19 待实施设计**。

**现行结论**：深度研究必须具备模型驱动的分解、迭代检索与阅读、缺口检测、声明级证据、对抗核验和综合报告，覆盖软件与论文。命令 prompt 是研究简报入口；可执行的权限、预算、来源真实性、恢复与结果保证必须由运行时承担。会话持久化不等于研究阶段可恢复，步数上限不等于主子代理总预算，来源列表不等于声明已被证据支持。

本次修订保留原研究的历史和来源，但不继续保留被否决的建议作为现行方案。源码核查、公开材料阅读、原研究报告的探针结果和设计推断分别标识；星数、归档与 API 响应属于日期快照，不能据此外推当前生产可用性。本次未运行真实研究回合、构建或测试，未修改运行时代码、配置、package scripts 或 provider/auth 核心。

## 1.5 已确认的用户裁决

1. 主命令为 **`/deep-research`**，`/research` 与 `/deep` 只作为新研究命令别名。`/web-research` 继续提供无模型的有界收集能力。新命令发布时同时从收集器移除这三个旧别名，不保留同名双语义。
2. 软件项目研究与论文研究都在范围内；开源实现比较、对抗性核验和全文获取/解析是必要能力，不能将目标缩成网页摘录或摘要搜索。
3. Phase 19 的 `/goal` 提供真实持续执行、暂停恢复；未填写预算时不设总 token cap，也不要求先填写预算。`budget N` 才建立主代理、子代理、顾问与重试共享的显式总 cap；`budget off` 取消该 cap。深度研究复用同一运行/预算/恢复基础，不建立独立 provider 调用循环或第二执行平面。
4. 产品采用 TypeScript；命令和标识符使用中性命名。成熟解析器或原生工具通过现有执行边界接入，不新增第二产品 runtime。
5. 公共技能商店、远程协作、完整 Git 面板、实时顾问与安全分析等大型系统也纳入 Phase 19，并可分批实施；本篇只定义研究与相关工具边界，不能自行用“太大”将它们排除。

上述是本轮用户确认。具体 provider、解析器、数值预算预设和验收样本是待实现的工程选择，不冒称用户已经逐项选定。

## 2. 当前实现与所需能力

| 维度 | 当前实现：源码事实 | Phase 19 目标 |
|---|---|---|
| 入口 | `/web-research` 是 local 命令，调用 collector 后直接渲染文本 | `/deep-research` 创建研究简报与 run；通过既有回合机制执行 |
| 分解与迭代 | 两条固定查询模板，每条取至多三个 URL；单次抓取摘录 | 模型生成子问题，按证据调整检索，受共享预算和停止条件约束 |
| 来源去重 | `resultUrls` 使用 URL 解析/规范化、去 fragment、拒绝凭证后去重 | 保留规范 URL；另记录内容/转载关系，不能把多个 URL 算成独立证据 |
| 阅读 | web_search/web_fetch 提供文本，尚无研究全文解析契约 | 网页、源码、论文 HTML/PDF 的实际获取、解析状态与定位 |
| 声明与报告 | renderer 按来源列原文摘录，无声明→证据图 | 有真实 fetch/read 生产者、报告与校验消费者的最小证据记录 |
| 核验 | 无模型核验；旧 Jaccard 聚类已删除 | 独立审查尝试、反证检索、冲突保留；核验状态与证据支持分开 |
| 预算 | collector 固定次数；普通回合与子代理各有局部 steps | 显式 token cap 共享 admission；请求/工具计量、单请求及明确研究阶段期限分别控制，见 §6.6 |
| 持久与恢复 | local collector 输出不构成普通研究回合；已有会话存储/恢复 | 研究阶段、来源、声明、子任务、预算及未完成动作可恢复 |
| 权限 | 工具已有 gate；未知工具在 plan 被拒；task 在 plan 也非自动允许 | 新学术工具和受限只读委派显式纳入 capability；权限只求交 |
| 取消 | collector 调用点未传 signal；网络工具存在已登记缺口 | 父/子/网络/解析全链路取消，取消后停止新请求并保留部分结果 |
| 进度 | 普通工具卡和流式正文已存在 | 复用事件通道，新增真实 research 阶段/覆盖/预算投影 |

来源：[collector.ts](../../packages/ts-shell/src/core/research/collector.ts)、[renderer.ts](../../packages/ts-shell/src/core/research/renderer.ts)、[deepResearchCommandRuntime.ts](../../packages/ts-shell/src/core/commands/deepResearchCommandRuntime.ts)、[toolPolicy.ts](../../packages/ts-shell/src/core/query/toolPolicy.ts)。不能把“当前 collector 没有模型调用”推广成“所有 local 命令都不调用模型”：`/btw` 即反例。

## 3. 目标实现与历史证据

### 3.1 当前收集器的资产与边界

`collectSources` 使用两个固定查询、URL 去重、并发上限 2 与每页少量摘录。其报告如实标为 untrusted source text，未宣称模型综合或事实核验；这份诚实的 collector 应保留。

它复用了现有网络工具，但这些工具尚有预取消、期限、响应读取及 DNS/连接边界风险，见 [19 号研究](19-tools-maturity-and-multifile-edit.md) §3。复用已有工具不等于继承了尚未存在的生产保证。

### 3.2 旧实现的确定事实

历史提交 `89c1dd18` 把旧 deep-research 呈现改为有界收集器，并删除 `deepResearcher.ts`、`claimVoter.ts`、`reportGenerator.ts` 与对应测试。父提交中的查询生成是固定后缀拼接，learning 是标点切句；所谓投票依据词元重叠和不同 URL 数量判 verified，没有模型核验。详细 git 证据保留于 §12.0。

`a06c617d` 的拓扑文档描述了研究与矛盾审查意图，代码未兑现；不能把文档里的意图写成旧代码已具有对抗能力，也不能据此断言用户的记忆或心理来源。Phase 18 去掉不实宣称是正确的；Phase 19 补齐用户要求的能力。

### 3.3 可复用的资产与新增工作

| 已有 owner/入口 | 可复用部分 | 不能直接推得的保证 |
|---|---|---|
| [agent/loop.ts](../../packages/ts-shell/src/core/agent/loop.ts)、[agent.ts](../../packages/ts-shell/src/core/agent/agent.ts) | 工具循环、steering/follow-up、abort | 不自动提供研究状态机和主子共享总预算 |
| [commands/types.ts](../../packages/ts-shell/src/core/commands/types.ts) 的 PromptCommandResult | prompt/notice 进入模型回合 | 当前只有 prompt/notice，研究 run 元数据与 budget 接线需要扩展 |
| [taskTool.ts](../../packages/ts-shell/src/core/tools/taskTool.ts)、[subagents/runner.ts](../../packages/ts-shell/src/core/subagents/runner.ts) | 子上下文、权限交集、递归限制 | 子代理不自动继承父 compaction；当前事件 sink 与返回字段不构成完整研究轨迹 |
| [session/](../../packages/ts-shell/src/session/) | 会话存储、回放、压缩、恢复设施 | resume 会话不是恢复研究阶段、子任务和预算预留 |
| [toolCards.ts](../../packages/ts-shell/src/cli/interactive/toolCards.ts) | web_search/web_fetch/task 卡片、真实工具事件 | 未发生的核验/完成不能由进度文案合成 |
| [todoTool.ts](../../packages/ts-shell/src/core/tools/todoTool.ts) | 可见计划清单 | todo done 不证明研究问题已有支持证据 |
| [runtimeConfig.ts](../../packages/ts-shell/src/config/runtimeConfig.ts) | maxTurns/contextWindow/maxOutputTokens 等配置 | maxTurns 不限制子代理总消耗；maxOutputTokens 仍限制 write 工具参数生成 |

## 4. 外部设计：具体决策与证据限度

### 4.1 官方材料可支持的结构

[OpenAI Deep Research 指南](https://developers.openai.com/api/docs/guides/deep-research) 描述多步工具研究、引用 annotations、工具调用限制和后台执行；[Anthropic 工程文章](https://www.anthropic.com/engineering/multi-agent-research-system) 描述 orchestrator-worker、独立上下文、压缩发现与 CitationAgent。这些支持“循环研究、来源绑定、上下文隔离与专门引用阶段”的设计，不能证明每次研究固定多少调用、每个模型训练方式或整个系统已进行反证核验。

Anthropic 文中的工作量、token 成本和耗时比例属于其系统/评估条件，不直接作为 Cheers 默认并发量、性能或费用承诺。外部 MCP 的审批设置也不能覆盖 Cheers 的权限策略；只读内容仍受 deny、网络及数据边界约束。

[LangChain 文章](https://www.langchain.com/blog/open-deep-research) 将流程分为 scope/research/write，并在子任务结束后压缩研究轨迹。借鉴阶段和数据契约；并发限制、预算与恢复必须落实为运行时行为，不能全部“写进 prompt”就视为完成。

### 4.2 本地参考的具体决策

pi experimental 的 [durable/subagent.ts](../../../pi/packages/coding-agent/src/experimental/durable/subagent.ts) 展示任务所有的子会话与防递归委派；[vacation.ts](../../../pi/packages/coding-agent/src/experimental/vacation/vacation.ts) 展示后台任务分阶段与结果回投。它们是实验样例，不是 Cheers 已有能力。

后台调度并不必然成为第二执行平面。将持久调度、完成投递和恢复控制放在现有 TypeScript runtime 并复用同一 loop/工具执行，是可行方向；真正禁止的是另一套 provider/工具/权限旁路。本轮依据已确认的完整 `/goal` 目标复用通用长任务基础，不再以“后台违反架构”为理由排除。

oh-my-pi 的 [web/search/](../../../oh-my-pi/packages/coding-agent/src/web/search/) 与 [fetch.ts](../../../oh-my-pi/packages/coding-agent/src/tools/fetch.ts) 提供搜索、多格式读取的定向参考；格式数量不证明研究质量或网络边界安全。

### 4.3 深度研究验收要素

1. 真实模型生成的研究简报与问题分解。
2. 基于已读证据调整查询的多轮检索/阅读。
3. 可复查的覆盖与缺口，停止时列出未覆盖项。
4. 来源 provenance、版本/论文标识、转载关系与获取状态。
5. 声明级引用及其报告/校验消费者。
6. 显式预算的主子共享硬限制、无预算时无隐藏总 cap，以及取消、暂停恢复和自然停止。
7. 综合报告与真实轨迹，保留部分/失败/未核验状态。
8. 软件和论文双域，包括论文全文获取/解析及访问受限时的诚实降级。
9. 对抗核验必备，记录独立审查与反证检索的实际完成情况。

软件报告不强制无关的论文检索；论文报告不能仅靠通用搜索摘录满足全文研究要求。九项是能力契约，不是每个简单问题机械执行相同数量的步骤。

## 5. 当前差距与关键依赖

核心缺口包括新的研究语义 owner、可消费的证据数据、真实共享预算、阶段持久化、学术来源/全文读取与受限只读委派。它不是“一个 prompt 加两三处接线”，也不需要重建第二研究执行引擎。

依赖顺序为：网络/文件工具安全与资源边界 → 通用主子预算和可恢复运行 → 研究来源/声明状态 → 双域与全文解析 → 独立核验/报告 → 交互投影。可分批开放已验证的能力，但单代理自反思或仅摘要路径交付不能称完整深度研究完成。

## 6. 命令、产物与预算契约

### 6.1 命名与迁移

| 命令 | 目标语义 | 别名 |
|---|---|---|
| `/deep-research` | 软件/论文深度研究 run | `research`、`deep` |
| `/web-research` | 现有无模型有界摘录 collector | 不保留 deep-research/research/deep |

[slashRouter.ts](../../packages/ts-shell/src/core/commands/slashRouter.ts) 主名先于 alias 匹配不构成允许双重登记的理由。发布在同一变更中更新 registry、补全、帮助、文档与 [collector.test.ts](../../packages/ts-shell/src/core/research/collector.test.ts)；迁移提示解释行为变化，不使 `/deep-research` 有时落 collector。保留明确 `/web-research` 调用供需要原始摘录的脚本使用。

### 6.2 参数形态（设计，非现有实现）

```text
/deep-research <question>
/deep-research --mode software <question>
/deep-research --mode paper <question>
/deep-research --depth quick <question>
/deep-research --depth deep <question>
/deep-research --brief <file> <question>
/deep-research --save <question>
/web-research <topic>
```

沿用 [arguments.ts](../../packages/ts-shell/src/core/commands/arguments.ts) 的引号/连字符契约；未知、冲突或缺值参数显式报错。模式由显式参数或简报分类决定，结果可见、可 steering 更正；混合问题使用一个 run 的双域来源，不复制两套引擎。`--brief` 文件先经正常 read 权限、containment 与字节预算，不照搬不受限模板展开。

`--depth` 选择研究范围及阶段步骤、工具调用、时间等工作量配置，不隐式创建 goal 总 token cap；不再将 quick=8/deep=40 等未经校准数字写成保证。quick 可以缩小范围，但必须披露核验覆盖；阶段限制或显式预算耗尽时报告 partial，不以“快速”掩盖未做的必备阶段。非交互模式使用同一契约，缺必要答案/权限/来源能力时明确停在对应状态。

### 6.3 报告与保存

报告包含结论、按子问题组织的论证、引用来源、冲突与未知、检索轨迹、核验轨迹；论文报告还包含相关工作与方法/评测/结论，软件报告锚定版本、源码或发布说明。引用直接消费 §14 的证据记录，模型不能凭空生成 source id。

未指定 `--save` 时不因报告过长擅自向 workspace 写报告。常规会话/run 状态仍按已声明持久化策略保存；它与用户工作区报告是不同产物。`--save` 经过既有 writer/审批，候选路径如 `docs/research/<slug>.md` 必须验证、展示并拒绝静默覆盖。只有 write 返回真实成功后报告保存路径。

write 的 content 也占模型输出预算，保存不是绕过 maxOutputTokens。长报告需有界分段生成、内容/引用校验、按顺序累计和最终完整性检查；分段中断保留 partial。无保存授权则在会话内输出可用部分与未完成说明，不自动落盘。artifact 累计与最终文件写入复用已有安全存储/编辑边界，不创建另一 writer。

### 6.4 进度与取消

复用工具卡与 run 事件，呈现分解、检索、阅读、核验、综合、暂停、预算耗尽及恢复情况；仅显示实际发生的事件。取消传递给主子循环、DNS、fetch、正文读取、解析和尚未开始的任务，停止新请求并持久化可确认结果。异步动作未确认结束时保留未知，不显示“已停止全部工作”。

### 6.5 暂停、恢复与 steering

研究 state 至少保存 run id、简报版本、阶段、来源/声明、子任务归属、预算使用/预留、待办与最后可确认事件。暂停阻止新 admission 并收拢在途动作；恢复先核对状态、权限、来源缓存版本和剩余预算，明确哪些请求完成、未开始或结果未知。deadline 与总预算不能因重启重置。

普通会话 `/resume` 只证明会话恢复。研究 resume 必须据持久状态继续未完成阶段，不能重复提交已完成动作或把未知请求当成功。steering 变更范围产生简报新版本，旧证据保留 provenance，覆盖判定重新计算。

### 6.6 主子共享的真实预算

复用 Phase 19 `/goal` 的通用 admission 与计量。**默认没有总 token cap**，不默认 100k，不以缺少预算为由拒绝开始。用户设置 `budget N` 后，主代理、子代理、顾问、重试、报告分段与核验消耗同一 token 余额；`budget off` 移除显式总 cap，但继续记录实际用量。研究继承所属 goal 的该状态，不额外虚构另一份总 cap。

单请求模型窗口/输出上限、timeout、并发、安全取消，以及研究自身阶段步骤/工具调用/覆盖停止条件继续有效，它们不是总 token budget。父一个 step 可以包含多个 tool call，子代理 maxTurns 也不是父总 token 限额。有显式 cap 时，每次相关模型请求启动前共享预留、完成后按实际 usage 对账，子代理自己的 steps 不能绕过余额；无 cap 时不得用隐藏总额度提前终止 goal。

显式 `budget N` 本身即要求严格准入；计量口径统一为每次请求的完整输入（含缓存读写部分）与生成输出（含 reasoning）之和，provider 已包含的子项不重复累加。按 [Phase 19 §3.2](phase-19-decisions.md) 以可靠输入上界和可强制输出上限预留；无法给出上界的协议在 admission 阶段明确 unsupported，不能悄悄退成估算后继续发送。只有确认未发送才释放全部预留；取消、缺 usage、重启保留未结算部分，provider 回报超额须如实记录并停止后续准入。费用仅在费率来源/版本明确时显示估算，否则为 unknown；本期命令的硬限制是 token，不把费用估算承诺成外部账单上限。

有显式总 cap 时，为核验与报告预留份额，研究检索不得吞掉全部余额；无总 cap 时仍按研究阶段/期限安排收束，不凭空预扣一个总量。受限阶段无法继续时保留 uncovered/review not-run 状态；显式 cap 不自动扩额。实际超额或未知 usage 必须进入结果，不能由估算覆盖。

## 7. owner 与依赖方向

拟新增 `packages/ts-shell/src/research/` 为高层研究 owner，以职责分为 run/brief/evidence/state/projection/sources/report 等模块（**拟新增路径**）。它依赖既有 core loop、通用 subagent、工具 contract、session 与 execution 接口。研究角色、来源策略和报告协议归 research，不写进中心 orchestration 或 core registry。

core 命令/工具只保留参数与结果薄适配；高层装配通过注册/injection 提供研究服务，**core 不反向 import research feature**。现有 `core/commands/deepResearchCommandRuntime.ts` 是 collector 的历史入口，不把新研究编排继续堆进这个文件。`paper_search` 等新工具也通过契约注册，source 获取和解析行为归 research/document owner。

通用预算、持久调度、子任务权限与生命周期归 runtime/session/agent 所有，研究消费而非复制。新增状态对象必须有生产者、持久规则和报告/验证消费者；旧 AtomicLearning 无消费者的教训不构成拒绝必要证据建模的理由。

当前 `task` 在 [turn/session.ts](../../packages/ts-shell/src/turn/session.ts) 的 sequential 集合中；初始集成按有界串行委派描述。并行只读研究是显式 capability 下的通用调度增量，需要子代理策略一致、共享预算和取消验证；不能全局移除 task 的顺序约束或仅在 prompt 中要求“并行”。

## 8. 分阶段实施轮廓

| 批次 | 内容与依赖 | 完成条件 |
|---|---|---|
| R0 | 19 号工具安全/资源修复；通用主子 admission、持久 run 与恢复 | 网络/解析预取消、预算总量、重启不重置额度、部分结果契约通过故障验证 |
| R1 | research owner、brief/run/evidence 与命令迁移 | 单一命名路由；实际 fetch/read 产生证据；报告和校验消费者拒绝伪造引用 |
| R2 | 软件来源与学术元数据/全文获取解析 | 版本/论文 id 锚定；真实全文与页/节定位；受限/失败不伪装完整阅读 |
| R3 | 受限研究员与独立反证审查 | plan/deny 不绕过；共享预算；反证、来源独立性、核验状态独立入报告 |
| R4 | 综合、分段、save、暂停恢复、交互进度 | 保存证据、取消与部分报告真实；已完成动作不重复；混合域报告可追溯 |
| R5 | 双域真实任务与对抗验收 | 真实质量评估加合成故障/引用验证，分别报告覆盖、错误与未完成 |

R1 可以先产生可审查的中间价值，但不称完整深度研究交付。完整范围需 R0–R5 与 §4.3 全部满足；详细编号、依赖与验收归 Phase 19 决策文档统一。

## 9. 风险登记

| 编号 | 风险 | 控制与残余 |
|---|---|---|
| R1 | 模型无限查询、错误覆盖自报 | 硬 admission/重复调用控制与证据覆盖检查；耗尽时 partial |
| R2 | 大量来源冲垮上下文/内存 | 获取与解析预算、分段证据、子上下文；压缩摘要不替代可定位原证据 |
| R3 | 编造来源或引错内容 | fetch/read 生产的 source id、定位/hash、声明绑定验证；人工/模型语义核验仍会漏判 |
| R4 | 子任务绕过父预算或计划权限 | 通用共享计量、允许能力交集且任一 deny 优先、只读 delegation capability，不能自动升 build |
| R5 | 网络错误泄漏或 SSRF/取消缺口 | 19 号网络任务前置；错误无 raw body，连接级 IP/redirect/TLS 边界 |
| R6 | 金额/usage 不可确定仍宣称硬预算 | 缺可信计量时 unknown/unsupported；严格模式 fail closed |
| R7 | alias 冲突与文档漂移 | 同次移除 collector 旧别名，全入口迁移测试 |
| R8 | 学术 API 限流、权限或字段变更 | capability/provider 配置、总期限、Retry-After、分页/字节上限与稳定错误分类 |
| R9 | 长报告保存被当作输出逃生口 | 分段生成及校验；无 save 不擅自写 workspace；部分工件不报完成 |
| R10 | 文档/模型叙述被当实现证据 | 当前/拟新增/历史分离；每个完成声明都有实际消费者和验证 |
| R11 | 红队复述、同模型偏差或失败 | 独立上下文与反证任务，review 状态显式；未发现反证不是正确性证明 |
| R12 | 摘要冒充全文、指标不可比 | 全文获取/解析/定位；缺方法或评测证据则 unknown，不生成结论 |
| R13 | 重启重放导致重复计费或伪完成 | 请求/子任务幂等标识、预算预留与未知状态对账 |
| R14 | 同源转载与厂商利益偏差 | 来源关系和适用范围记录；不计票、不按 URL 数自动升置信 |
| R15 | 软件版本/论文撤稿等变化 | 获取时间、版本、发表/修订/撤稿等事件锚定，恢复时按任务要求复核 |

## 10. 证据与验证边界

原稿两轮报告了路径核查、git 历史读取、公开网页、GitHub API 星数及学术 API 探针；本次保留为原研究的日期记录，不把这些动作重新署为当前修订的实测。新复审对目标源码与定向参考、公开 API 文档进行核查，未运行外部项目、真实模型研究或性能 benchmark。

“没有在所查文件找到反证 evaluator”只限定所查范围；不推出整个项目没有核验。“官方 README 描述能力”不等于已运行验收。LLM-as-judge 可以辅助检查相关性、引用、覆盖与可读性，但不能替代确定性的来源 ID/状态/预算检查或人工抽核。

研究产物内若有未验证的关键声明、未完成的全文阅读或失败的独立核验，最终状态不得升级为完整成功。提供部分报告有价值，必须同时保留未完成项。

## 11. 来源索引

仓内依据：

- [14 号研究](14-user-experience-research.md)、[19 号工具研究](19-tools-maturity-and-multifile-edit.md)、[21 号恢复研究](21-session-recovery-and-undo-ux.md)。
- [Phase 18 裁决](phase-18-decisions.md) 第 43 项 CMD-09、[13 号登记册](13-feature-and-defect-register.md) 与 [旧研究专题](../wiki/theses/deep-research-command-architecture.md)。
- 当前 collector、命令、loop、subagent、toolPolicy、session 和 execution 路径见 §2、§3、§7。
- 历史对象 `89c1dd18`、`22671e5a`、`a06c617d`，命令与事实见 §12.0。

公开设计和开源材料：

- [OpenAI API 指南](https://developers.openai.com/api/docs/guides/deep-research)、[Introducing deep research](https://openai.com/index/introducing-deep-research/)。
- [Anthropic multi-agent research](https://www.anthropic.com/engineering/multi-agent-research-system)、[LangChain Open Deep Research](https://www.langchain.com/blog/open-deep-research)、[GPT Researcher 文档](https://docs.gptr.dev/docs/gpt-researcher/getting-started/introduction)。
- [dzhng 核心源码](https://raw.githubusercontent.com/dzhng/deep-research/master/src/deep-research.ts)、[GPT Researcher deep 模式 README](https://raw.githubusercontent.com/assafelovic/gpt-researcher/master/backend/report_type/deep_research/README.md)、[ReviewerAgent](https://raw.githubusercontent.com/assafelovic/gpt-researcher/master/multi_agents/agents/reviewer.py)。
- [LangChain deep_researcher.py](https://raw.githubusercontent.com/langchain-ai/open_deep_research/main/src/open_deep_research/deep_researcher.py)、[STORM README](https://raw.githubusercontent.com/stanford-oval/storm/main/README.md)、[STORM 论文](https://arxiv.org/abs/2402.14207)、[Co-STORM 论文](https://arxiv.org/abs/2408.15232)。
- [smolagents 示例 README](https://raw.githubusercontent.com/huggingface/smolagents/main/examples/open_deep_research/README.md)、[run.py](https://raw.githubusercontent.com/huggingface/smolagents/main/examples/open_deep_research/run.py)。
- [jina evaluator](https://raw.githubusercontent.com/jina-ai/node-DeepResearch/main/src/tools/evaluator.ts)、[research-planner](https://raw.githubusercontent.com/jina-ai/node-DeepResearch/main/src/tools/research-planner.ts)、[实现指南](https://jina.ai/news/a-practical-guide-to-implementing-deepsearch-deepresearch)。
- [Semantic Scholar API 说明](https://www.semanticscholar.org/product/api)、[OpenAlex 限流/auth 文档仓镜像](https://raw.githubusercontent.com/ourresearch/openalex-docs/main/how-to-use-the-api/rate-limits-and-authentication.md)、[arXiv API 手册](https://info.arxiv.org/help/api/user-manual.html)。

OpenAlex 官方文档站在复审抓取时返回 403，文档仓镜像可能是历史版本；不能凭镜像承诺当前永久 keyless。上线前按实际 provider 契约重新核查认证、配额和字段，不冒称本轮已验证全部生产端点。

## 12. 历史与开源比较

### 12.0 旧实现的 git 证据链

下表保留原研究报告的命令与所见内容。本次源码/历史复核支持“旧实现没有模型核验”的判断；这些已删除路径是 git 对象内的历史文件，不是当前 workspace 文件。

| 原研究记录的 git 命令 | 读到的事实 |
|---|---|
| `git show 22671e5a --stat` | 提交 `22671e5a`（2026-08-30，"feat(research): implement /deep-research engine with recursive tree search, cross-source claim voting, and cited markdown report generation"）创建 `deepResearcher.ts`（172 行）、`claimVoter.ts`（87 行）、`reportGenerator.ts`（75 行）、`deepResearch.test.ts`（111 行）、`types.ts`、`deepResearchCommandRuntime.ts`、注册表两处——**提交标题就带着过度宣称**（"claim voting" 名不副实，见下） |
| `git show 89c1dd18 --stat` | 提交 `89c1dd18`（2026-10-05，"fix: present web research as bounded source collection"）删除上述四个研究文件共 460 行（claimVoter 85 + deepResearcher 189 + deepResearch.test 109 + reportGenerator 77）、新增 `collector.ts`+`renderer.ts`+`collector.test.ts`、把 `registry.ts` 的 `deep-research` 改名 `web-research`（别名 `["deep-research","research","deep"]` 全保留，summary 改为 "collect public web source excerpts with fixed search queries"） |
| `git show 89c1dd18^:packages/ts-shell/src/core/research/deepResearcher.ts` | **确定性递归搜索，无一处模型调用**：`generateSerpQueries` 三段固定后缀拼接主题；递归的"子主题"= `allLearnings.slice(-nextBreadth).map(l => l.statement)`（拿摘录句子当查询）；`extractLearningsFromContent` 按标点切句；工具调用用 `mockContext: ToolExecutionContext = { taskId: "deep-research-task", workspaceRoot: process.cwd() }` 直接调 `execute` |
| `git show 89c1dd18^:packages/ts-shell/src/core/research/claimVoter.ts` | 所谓"claim voting"= **Jaccard 词元重叠聚类**：`jaccard >= 0.25 \|\| overlap >= 0.45` 归簇；簇内去重 URL 数 ≥ 2 判 "verified"、否则 "unverified"。**这是词面相似度，不是核验**：两页互相抄袭的同一句话会被判"verified"，措辞不同但真值一致的声明反而分开；它无法反驳任何声明，只会按"看起来像"分组 |
| `git show 89c1dd18^:packages/ts-shell/src/core/research/reportGenerator.ts` | 报告是**字符串模板**：`"Cross-source consistency voting was conducted across ${sources.length} independent technical documents"` 这句"共识投票"宣称写在模板文本里，机制上没有任何投票语义支撑它 |
| `git show a06c617d:.wiki/wiki/theses/deep-research-command-architecture.md` | 这份论文式专题（提交 `a06c617d`，2026-08-30，是 `22671e5a` 的**直接父提交**——先写拓扑论文、再写代码）**确实描述了**多智能体对抗拓扑：引用 `dzhng/deep-research (19.6k⭐)`、`assafelovic/gpt-researcher (29.2k⭐)`、`langchain-ai/open_deep_research (12.6k⭐)`，画了"跨源共识投票与矛盾审查（Claim Voting & Cross-Source Verification）"的 mermaid 图，并列了"`claimVoter.ts` 对多个信源中的 AtomicLearning 进行**词法重叠聚类**"的落地条款——注意：论文自己也只承诺"词法重叠聚类"，"对抗性审查"只存在于标题修辞 |


拓扑论文先于代码，但文档的“对抗/共识”修辞不是实现证据。不能复活按词面相似度、URL 数量或硬编码置信度生成 verified 的机制。

### 12.1 六个开源实现的限定比较

原研究日期为 2026-10-05，记录六项目材料，四个项目另读关键源码；GPT Researcher 与 STORM 原轮主要为 README，复审额外核对 GPT Researcher ReviewerAgent 和 STORM 自述边界。未运行任何项目。下表星数和归档信息均为**原研究记录的历史快照，本次未重新测量**，不参与选型优劣判定。

| 项目 | 原研究星数快照 | 已读机制与范围 | Cheers 采纳/不采纳的决定 |
|---|---|---|---|
| [dzhng/deep-research](https://github.com/dzhng/deep-research) | 19,756 | 核心源码中 generateObject 生成查询与 learnings/follow-up，递归扩展并生成报告；所查路径的来源列表没有强制逐声明绑定 | 采纳真实模型迭代；补运行时来源绑定和核验，不能复制无绑定报告 |
| [gpt-researcher](https://github.com/assafelovic/gpt-researcher) | 29,920 | deep README 描述递归探索与来源跟踪；复审 ReviewerAgent 存在按 guidelines 的模型反馈循环 | 采纳来源跟踪/评审反馈；不能因原轮只读 README 断言全项目无核验；ReviewerAgent 本身也不证明事实正确 |
| [open_deep_research](https://github.com/langchain-ai/open_deep_research) | 12,688；原研究记录 2026-08-21 归档 | 所查 LangGraph 源码有澄清、简报、supervisor、researcher、压缩、报告阶段和并发/调用限制 | 采纳分阶段与清理输出；限制落实到 runtime，不靠 prompt；原始材料截断不能冒充完整研究 |
| [STORM](https://github.com/stanford-oval/storm) | 31,573 | README 定位为互联网检索生成 Wikipedia-like articles，视角提问、模拟对话、大纲和带引用写作；自述不能直接产出 publication-ready 文稿 | 采纳视角与大纲；不把 STORM 当论文 API/引用图/系统综述或全文验证的证明 |
| [smolagents open_deep_research](https://github.com/huggingface/smolagents/tree/main/examples/open_deep_research) | 29,677（smolagents 全仓） | 示例有 manager/search agent、周期规划与浏览器工具；README 报告 GAIA validation 55% pass@1 对照 67% | 采纳受限委派与周期重规划；基准数字是项目报告，非本轮测试或通用质量结论 |
| [node-DeepResearch](https://github.com/jina-ai/node-DeepResearch) | 5,235 | evaluator prompt 明确先用最强论证反对，再辩护/改进；planner 的 <20% overlap、>90% coverage 与 freshness 表都是 prompt 启发式 | 采纳反证任务结构；不把 prompt 比例写成计算指标或科学阈值，不称它是所有开源项目中唯一真实核验 |

附属教学仓 [deep_research_from_scratch](https://github.com/langchain-ai/deep_research_from_scratch) 原研究记录 793 星，仅作教学索引。

### 12.2 比较结论与限制

已查材料支持模型驱动分解、检索/阅读迭代、来源跟踪、阶段化报告和部分显式评审模式。jina 的先反对协议是直接反证参考；STORM 的视角/大纲是写作组织参考。不能推出“仅 jina 有核验”“只有 STORM 认真做学术研究”或闭源系统的未公开能力。

对外部训练、通用质量、成本和耗时不作超出材料的推论。每个采纳的生产决定在 §17 有反向用例，避免比较停留在项目名罗列。

## 13. 软件与论文双域

### 13.1 同一研究运行、不同来源与报告规则

| 维度 | 软件研究 | 论文研究 |
|---|---|---|
| 来源 | 官方文档、版本化源码、release notes、issue/benchmark、许可证 | 论文元数据、实际论文全文、补充材料、数据/代码、引用关系 |
| 分解 | 行为契约、边界、兼容、性能条件、迁移成本与风险 | 研究问题、方法、假设、数据集、评测设定、限制、相关工作与复现 |
| 锚定 | 版本/tag/commit、环境、测量条件与获取时间 | DOI/arXiv/version、发表/修订时间、页/节、评测条件与获取时间 |
| 冲突 | 不同版本/配置结果并列，区分厂商自述与实际证据 | 不同数据集/设定结果不直接比较；撤稿/更正/后续反证单列 |
| 输出 | 有来源的方案比较与决策理由 | 方法—评测—结论及相关工作；缺全文证据的项目标 unknown |

来源优先级不是固定的真假排序：厂商文档可证明其承诺，但不能独立证明效果优于竞品；高被引数不证明结论正确。时效由版本更新、发表/修订/撤稿、安全事件与任务要求决定，不能套“科学发现 60 天”等 prompt 启发式作统一标准。

### 13.2 学术来源工具与 provider 契约

拟新增 `paper_search` 等薄工具适配，能力由 research/sources 承载：query、identifier lookup、引用关系、全文位置发现。结构化结果含来源 provider、论文标识、版本、元数据字段来源及是否完整；缺失字段不能用模型补成事实。

原研究探针记录：OpenAlex 一次 keyless search 成功；arXiv id 查询成功、search 发生限流；Semantic Scholar 多次 keyless 429。它们证明那几次请求的结果，不能证明 OpenAlex 无限流/永久免费，或 Semantic Scholar 所有端点必需 key。Semantic Scholar 官方说明多数端点可无认证访问、部分需 key，共享匿名池可能进一步限流。

provider 按能力、认证、配额和可用性选择，不把单次成功当永久主服务保证。所有适配都要总 deadline、父取消、Retry-After/有界退避、分页/结果/正文上限、去重、schema 校验与稳定错误分类；失败/限流保持可见。arXiv 按其公开使用规则节流，并对并行 run 共享限速；切换 provider 不能绕开任务预算或 deny。

### 13.3 全文获取与解析是必要能力

元数据、摘要和引用图用于文献发现，不能支持完整的方法/实验/优越性结论。工具必须尝试可获授权的全文来源：可用 HTML、公开 PDF、已授权本地文件及补充材料。获取后记录 MIME、字节、hash、版本、解析器及页/节定位；正文截断、解析失败、扫描件/OCR 不足、访问受限和仅摘要分别标识。

采用成熟解析器；需要外部进程时走现有 TypeScript execution/sandbox 边界。限定大小、页数、解压、CPU/内存/时间与取消，拒绝损坏/恶意输入。解析文本是数据，不提升为指令。全文确实不可获取时给出已读摘要可支持的结论与未核验部分；不能继续补造实验参数，也不能因此宣布论文模式完整验收通过。

### 13.4 capability、plan 与权限

[toolPolicy.ts](../../packages/ts-shell/src/core/query/toolPolicy.ts) 当前没有 `paper_search`，未知工具在 plan 被阻止；task 在父 plan 也不自动允许。新增只读学术工具与只读 research delegation 要显式注册 capability：允许的目标、工具集合、是否联网、是否可创建子任务、数量/深度和预算都在 admission 校验。

研究员与反证审查员只获 read/search/fetch/解析及必要只读查询；父/角色/请求的允许能力取交集，任一 deny 都优先。不因为要研究而自动切 build，不通过 bash 或自定义工具绕过拒绝。报告保存单独经过 writer 权限。浏览器扩展属于 Phase 19 工具范围，是否可用于当前研究由该 run 的 capability 决定，不是“加浏览器就新增执行平面”。

## 14. 证据与对抗核验

### 14.1 最小证据记录与真实消费者

拟新增的 evidence record 至少包含：

- source id、来源类型/provider、原始与最终 URL 或授权文件定位、版本/论文 id、获取时间。
- 实际 fetch/read 的 call/run id，读取状态（成功/失败/受限/仅摘要/截断等）、内容 hash，以及页/节/行等可定位摘录；必要时链接受控内容 artifact。
- claim id、声明文本与适用范围、支持/反对的 source id 和定位、转载/同源关系。
- 核验角色、输入版本、执行状态、反证查询与实际读取、结论理由、未覆盖项。

来源记录由真实工具执行生产，模型只能引用已有记录，不能写一句“已读”创建成功来源。报告投影消费这些记录，校验器拒绝缺失/失败来源引用与无定位的强声明；语义支持仍需审查与人工抽核。fetch 成功只证明获取内容，不证明内容为真。

### 14.2 核验流程与独立性

先形成有来源绑定的草稿，再在独立子上下文中尝试反驳关键结论：检查最弱证据、相反来源、版本/评测条件不匹配、利益偏差与转载。子任务拿到有界草稿、claim/source 清单和可回读定位，复用同一 loop/gate/预算。研究角色归 research owner，不将长研究 prompt 塞入通用 subagentLoader。

同上下文自反思可用于草稿阶段，但记录为 self-review，不能替代用户要求的独立反证审查。初始委派按当前有界串行能力实现；并行仅在通用只读调度条件满足后开启。

### 14.3 状态维度分别记录

| 维度 | 含义 | 不得混淆 |
|---|---|---|
| evidence support | 当前证据是否直接支持声明、是否间接/不足/相反，并说明适用条件 | 多 URL、一手来源或红队意见不自动变“强” |
| review status | not-run/running/completed/failed/cancelled/timeout 等实际执行状态，以及 self/independent 角色 | completed 只表示审查过程完成，不表示声明正确 |
| conflict | 哪些来源/条件/结论冲突，是否已有解释 | 不按 2:1 计票或让父代理静默压掉不同意见 |
| coverage | 哪些子问题/关键声明/全文部分已读与未读 | 不能从报告章节齐全推断研究覆盖齐全 |

删除原稿 `holds` 与“多源一手+未找到反证=强”自动升级规则。未发现反证的准确说法是“本次审查未发现反证”，不意味着证真；failed/timeout/not-run 必须在终稿保留。相同模型独立上下文仍可能有共享偏差，文档不承诺概率正确性。

### 14.4 报告收束与防伪完成

核验结果进入报告与 run 终态：证据不足的声明收窄/移入未知，冲突保留，未查项列出。额外核验或修订消耗同一共享预算；次数与资源上限由 runtime 控制。没有资源或权限继续时返回部分报告，不能用“无法反驳”填充完成。

模型的声称不是最终证据。校验器可确定引用存在、读取状态、定位与阶段完成性；它不能仅凭字符串相似度证明语义蕴含。真值判断的残余风险必须表达为证据限制，而非编一个数值置信度。

### 14.5 现有资产与新增项映射

| 需求 | 复用 | 拟新增 |
|---|---|---|
| 独立研究/审查上下文 | task/runner、同一 agent loop | 只读角色注册、完整事件/轨迹投影、父子共享 admission |
| 来源读取 | web/search/fetch/read 与 execution | 学术元数据/全文解析、真实来源记录与定位 |
| 状态持久化 | session 存储及通用 goal run | 研究阶段/brief/claim/source/coverage state 与版本迁移 |
| 引用/核验结果 | 现有最终消息与工具结果通道 | 报告投影和引用/完成性校验消费者 |
| 取消与预算 | 现有 abort、steps/config | 父子总预算/期限、在途请求对账、暂停恢复 |

### 14.6 残余风险

反证搜索不穷尽现实，来源本身可能错误，独立角色也可能共享偏差；全文提取可能丢图表、公式或上下文。保留内容定位、解析限制、冲突和未核验状态供复查。生产能力的目标是让这些限制可控且可见，不是宣称自动研究永不出错。

## 15. 现行决策核对表

| 决策 | 本文落点 |
|---|---|
| /deep-research 主名；research/deep 只属新命令；collector 独立 | §6.1 |
| 双域、开源比较、全文与对抗核验必备 | §4.3、§12–§14 |
| 一套 TypeScript runtime，新增高层 owner、不反向依赖 | §7 |
| 主子真实共享预算、持续执行/暂停恢复 | §6.5–§6.6 |
| 只读角色 capability 与 plan 准入、不自动升权 | §13.4 |
| 保存走 writer，不绕输出上限、不无授权写 workspace | §6.3 |
| 来源工具生产证据、报告和校验实际消费 | §14.1 |
| 审查状态、证据支持、冲突、覆盖分别呈现 | §14.3 |

早期 /research 主名、collector 临时保留 deep-research alias、纯 prompt 即完整实现、后台必然第二平面、论文首版只看摘要等方案均已由以上正文取代，不再作为待裁决项。

## 16. Phase 19 交付差距归属

| 差距 | owning domain | 与其他研究的依赖 |
|---|---|---|
| 网络/读取安全和资源上限 | tools/network/document/execution | 19 |
| 全局预算、继续运行、暂停恢复 | runtime/agent/session | 21、22、24 的 goal/会话契约 |
| 简报、来源、声明与核验 | 拟新增 research | 本文 |
| command schema、别名与参数 UI | commands/CLI 装配 | 18、22、23、24 |
| 研究进度、未核验/部分状态展示 | research projection + CLI | 16、17 |
| 保存、长报告及撤销 | research report + edit/writer | 19、21 |

这里的 owner 是职责约束；未存在的模块须标拟新增，真实路径由实施前的目标导航确认。不得为了凑表制造无消费者的 contracts 或重建平行工具体系。

## 17. 验收与修订记录

### 17.1 必须保留的反向用例

1. 两个转载支持同一错误、一手材料相反：报告保留冲突，不按 2:1 判真。
2. fetch 失败后模型生成不存在的 [3]：来源绑定拒绝该引用，不能标独立核验完成。
3. 只有摘要却输出具体实验参数/优越性：对应方法/评测结论为未核验或 unknown。
4. 父只剩两次请求却派 maxTurns=20 子代理：共享 admission 阻止超额，保留核验与报告未完成状态。
5. paper_search 被 deny 或父 plan 不准委派：不切 build、不走 shell 绕过、不报 review passed。
6. 恢复时存在未知模型请求或预算预留：不重置预算，不默认为请求成功，也不无条件重复发起。
7. 来源中嵌有“忽略用户限制”或合成 Bearer 字样：作为不可信文本处理；错误正文不进入输出/日志；读取和解析预算有效。
8. 长报告超限、save 拒绝、写入失败或分段中断：不擅自落盘，不报保存成功，部分工件与未完成项可见。
9. 独立审查 timeout/failed 或没有找到反证：分别保留状态，不升级 evidence support。
10. 命令路由、补全和非交互入口：新 alias 只到 research，web-research 仍到 collector。
11. 可用 PDF 确实完成解析并回指页/节；扫描件/损坏/访问受限/资源超限明确，不能用 abs 页代替全文。
12. 多任务只读并行关闭/开启时：权限、预算和取消等价，未允许的任意 task 不获得并行或写权限。
13. 未设 budget 的 goal 累计超过 100k token 仍不因隐藏总 cap 停止；显式 `budget N` 汇总主/子/顾问/重试，`budget off` 后只移除总 cap，模型窗口/输出/timeout/并发/安全取消仍有效。

### 17.2 真实质量验收

在隔离 provider 环境与明确授权下，分别运行软件版本比较、论文方法/评测综述、混合域问题与有意冲突的来源集，检查声明支持、来源独立性、引用准确性、全文覆盖与研究效率。真实模型结果与确定性 contract/故障测试分别报告，不能由格式完整的报告替代功能验收。

本轮未运行这些验收；不访问真实 provider 配置。后续是否通过、使用哪个 commit、是否推送/CI 必须以当时证据记录。

### 17.3 本次修订的证据范围

- 沿用并核对 14/15/19 的目标源码与历史判断，具体路径在正文；历史原命令清单保留于 §12.0。
- 复审开源材料补充 GPT Researcher ReviewerAgent 与 STORM 定位，收窄“唯一/全部/无核验”等全称断言；星数及归档日期仅保留原研究快照。
- 修正 Semantic Scholar 认证事实、OpenAlex 单次成功外推，以及 prompt 百分比/时效表被当客观指标的问题。
- 统一命令、owner、共享预算、恢复、全文、证据消费者与核验状态；删除不满足类型/权限边界的伪实现片段。
- 本轮产物为文档修订；未运行 build/tests/模型请求，未实现产品功能。
