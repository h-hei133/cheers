---
title: "verification-15-21：历史自检与 15–24 本轮复审"
category: article
sources: [14-user-experience-research, research-15-24, current-source-28ff98ce, pi, oh-my-pi, codex, phase-19-decisions]
created: 2026-10-05
updated: 2026-10-05
tags: [verification, research, phase-19, evidence]
summary: "保留早期父代理抽查的边界，记录本轮对15–24的分域源码复核、统计重算、实质纠错和最终裁决。修正文档不代表产品缺陷已修复或生产验收已完成。"
confidence: mixed
---

# 研究文档复核：15–24

## 1. 范围与证据规则

文件名保留 verification-15-21.md 以维持现有链接；本轮复核范围扩展到 **15–24 全部新增研究**，并对照 14 的原问题、历史探针与用户最新答复。统一实施决定见 [Phase 19 决策](phase-19-decisions.md)。

Cheers 源码基线为 28ff98cee8c4dd63e6752452f73a362ed3559ae3。工作开始时研究文件未被 Git 跟踪，索引、日志和 .gitignore 已有本地改动；本轮保留既有工作，不修改产品源码。当前参考快照为 pi b2b5c42f6138b73ec4b2f49ec0ca468800f88586、oh-my-pi 1c0993c3d12e70042169a951663bb2702e2c0a9e、Codex 4210c08defe92fe8828f789b6f9fda287ad3709e。14 的旧参考 HEAD 仍是其当时的历史证据，不覆盖成新快照。

本轮由五个范围明确的只读审查上下文分别核对研究/工具、主题/面板、输入/参数、配置/会话、命令清单/语义，再由分文件编辑上下文修订正文，主代理统一用户裁决和 Phase 19 计划。这是分域复核，不宣称第三方认证或所有结论都获得不同模型的独立验证。修改后的最终审查另记在 §6，未返回的审查不算通过。

| 标记 | 含义 |
|---|---|
| VERIFIED-SOURCE | 本轮阅读到实现分支或公开材料，支持限定主张；不表示实际运行通过 |
| RECOUNTED | 本轮直接对 AST、JSON 或算术重算；口径必须写清 |
| WRONG | 与当前实现、原始材料或算术矛盾 |
| OVERCLAIM | 有一部分依据，但结论强度、覆盖范围或因果超出证据 |
| DESIGN-GAP | 提案缺少必要权限、资源、并发、持久化、失败或兼容契约 |
| UNVERIFIED | 未做足以支持该结论的观察；保留为验收事项 |

本轮未运行 build、产品测试、真实模型研究、真实 provider 或用户终端像素探针。14 的隔离实验仍标为历史；本轮新增证据是源码/历史对象阅读、只读静态统计、主题算术、定向公开材料及文档检查。

## 2. 早期自检的更正

原文标题为“独立复核”，正文却已说明当时子代理上游不可用、由父代理自行核查。应称**父代理抽查**，不是独立对抗审查。其检查范围只有每文少数断言，不能将“抽查未发现 WRONG”升级成整篇方案正确。

以下是必须改写的早期结论：

- “只发现一处 token 措辞过度，其余没有错误”不成立。本轮在原方案的事实、统计和可实施性中发现多类实质问题，见 §3。
- “attentionOnIdle 生产读者只有 settings/picker”错误：真正通知消费在 [interactiveMode](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts#L674)。缺口是文件/有效配置投影断链。
- “配置没有运行时校验”过强：[runtimeConfig](../../packages/ts-shell/src/config/runtimeConfig.ts#L529) 已有 denyRules parser 及连接/凭据 normalizer；缺的是完整统一 schema 和普通字段校验。
- “状态带每帧无条件可见、用户现场只是内容稀疏”过强：[surface/view](../../packages/ts-shell/src/presentation/tui/surface/view.ts#L62) 的全屏 overlay 会接管画面。正常会话表面构建状态带不能证明现场缺失原因。
- regular 的 marker/caret 分支问题仍成立，但没有证明 Windows 前端的短粘贴残影由它造成。默认模式为 fullscreen，不能写成“默认 regular 已找到根因”。
- 作者写的“待修正”不是实际修正证据。本轮直接修订原正文，并在下表列出处理结果。

## 3. 逐文发现与修订

### 3.1 15：深度研究

| 原主张或漏洞 | 判定 | 本轮处置与证据 |
|---|---|---|
| 新 /deep-research 与旧收集器同名 alias 共存 | WRONG | 同一发布唯一分配；research/deep 随新命令迁移，collector 保留 web-research。见 [15 §6](15-deep-research-design.md)、[slashRouter](../../packages/ts-shell/src/core/commands/slashRouter.ts) |
| 纯 prompt 与既有 loop 已足够提供预算、完整子任务轨迹和研究恢复 | OVERCLAIM / DESIGN-GAP | 新 run/evidence/共享计量与恢复 owner；[runner](../../packages/ts-shell/src/core/subagents/runner.ts#L166) 当前不足以提供这些保证 |
| 多来源/红队未驳倒即可标强验证；摘要足够完成方法综述 | DESIGN-GAP | support、review、conflict、coverage 分开；全文状态/页节定位与实际引用校验；不得虚构来源 |
| STORM 是唯一认真做学术模式、只有 Jina 有核验、Semantic Scholar 必须 key | WRONG / OVERCLAIM | STORM 的百科文章定位、GPT Researcher reviewer、Semantic Scholar 匿名端点及限流分别如实记录；具体外部材料见 [15 §12](15-deep-research-design.md) |
| 一次 API 成功、星数或作者 benchmark 可证明生产可用性 | OVERCLAIM | 保留日期快照和作者报告，取消选型/质量保证推断；接口仍需授权、限流、分页、取消与失败契约 |

### 3.2 16、17：主题、输入形态与面板

| 原主张或漏洞 | 判定 | 本轮处置与证据 |
|---|---|---|
| palette 共有16不变/12修改/独有18，精确对齐却保留三个固定前景 | RECOUNTED / WRONG | 48/67 总集合；共有29=15相同+11 RGB差异+3终端default；独有19/38。按用户裁决落实default语义及三项派生颜色，见 [16](16-tui-composer-and-theme.md) |
| input 只截断不滚动；只有box需要IME尾 | WRONG | 保留 [editor caret-follow viewport](../../packages/ts-shell/src/presentation/tui/editor.ts#L447)；field/rail/box 共用尾部规则 |
| 单一 offset 减 gutter 后切带 gutter 的整行；trim/dedent 验证“无空白” | WRONG / DESIGN-GAP | 改为逐行源文映射；保留用户真实空白与逻辑换行；box top-border、实际行高与窄窗预算齐全 |
| TERM=dumb 自动 none，NO_COLOR 或重定向即无 ANSI | WRONG | 当前 [color 检测](../../packages/ts-shell/src/presentation/theme/color.ts#L17) 无该 TERM 分支；颜色禁用与无控制序列输出分别定义，撤回旧探针过度结论 |
| 58项完整分类、零数据层改动即可面板化、可全局正则上色 | OVERCLAIM / DESIGN-GAP | 用共同目录，复用已有picker；结构化spans/columns、presentation着色、纯文本保存；report/picker/预览/Apply分离 |
| 64,000/200,000=3.2%，借quota50/80当context阈值 | WRONG | 改32.0%；32格为10已用+3预留+19空余；context复用50/70/90。WCAG仅证明指定sRGB颜色对的算术，不能宣布终端整体达标 |

### 3.3 18、23：输入、启动、上下文与全部参数

| 原主张或漏洞 | 判定 | 本轮处置与证据 |
|---|---|---|
| Windows字体/DirectWrite/双缓冲已归因；启动成本可精确分摊 | OVERCLAIM | 只保留regular确定分支问题和历史启动样本；首帧以真实写入/可输入事件计时，未做旧版本对照仍未知 |
| tools 10,721 chars / 3.5 为2,200–2,500，可拟合真实5.4k | WRONG | 为3,063；完整system约3,334；总22,391 chars按同一除数四舍五入为约6,397（各分项先取整相加为6,398），fixture粗估不是实际token分项。见 [14 §7](14-user-experience-research.md) |
| /trust 严格接受枚举、/help 已是帮助浮层 | WRONG / DESIGN-GAP | trust 普通对象查表可接受 constructor/__proto__ 继承值；[命令解析](../../packages/ts-shell/src/core/commands/trustCommandRuntime.ts#L30)与[存储](../../packages/ts-shell/src/core/security/projectTrust.ts#L85)都需枚举验证，非法动作零写并保留原拒绝记录；help 当前输出清单。已修 23 并纳入 CMD-03，未执行真实 trust 写入 |
| from单起点、trim比较足以接受候选，统一alias可丢rawName | DESIGN-GAP | UTF-16 [from,to)、cursor/revision、保留后缀/空白、多级语法及特殊invocation；补全不执行 /reset |
| /model use/list废弃、/export仅jsonl、/thinking off保证关闭推理 | WRONG | 修为真实handler语义；[model](../../packages/ts-shell/src/core/commands/modelCommandRuntime.ts#L42)、[export](../../packages/ts-shell/src/core/commands/exportCommandRuntime.ts)、[thinking](../../packages/ts-shell/src/core/commands/thinkingCommandRuntime.ts) |
| memory delete/invalidate、wake/recall为别名，use接ID、save无需审批目标 | WRONG | 保留不同动作/授权与暂存语义；use接query，save需candidate-id或approved，list/review/approve/reject等完整列出 |
| 静态虚构theme、tools补全重建默认registry、todo使用位置index | WRONG | 主题真实四预设及发现目录，工具读当前pool；todo稳定ID且非法数字拒绝；全58行重新对照，见 [23](23-command-argument-options.md) |
| 43参数、19缺provider、64%语义脱节 | RECOUNTED / OVERCLAIM | 43是hint；44有效参数命令、26 provider、18缺provider。区分错误候选、缺动作、缺flags/二级值、别名搜索和文案，不制造综合覆盖率 |

### 3.4 19：工具与多文件

| 原主张或漏洞 | 判定 | 本轮处置与证据 |
|---|---|---|
| 内存预检即可真正/完美跨文件原子性 | WRONG | 预检失败零目标写入；提交持久逐文件结果与条件补偿，明确partial/unknown；[writer](../../packages/ts-shell/src/runtime/execution/service.ts#L74)、[restore](../../packages/ts-shell/src/edit/recovery/restoreExecutionBridge.ts#L54) |
| LSP hover改调service即受jail，其他入口安全 | WRONG | service读取不自动授权；documentSymbol/readSource也检查，见 [readSource](../../packages/ts-shell/src/core/tools/lsp.ts#L238) |
| 读错误体再slice/去HTML即安全，输出截断等于内存有界 | WRONG / DESIGN-GAP | 错误不读取/输出原文，成功有流式字节/解析预算；read/glob/search分别有资源工作项 |
| grep借用glob已存在的剥前缀修法 | WRONG | glob当前仅trim；保持路径原义后resolve/containment，不能剥绝对路径改指 |
| taskStop混淆停止，pi bash为PTY，参考fetch已证明DNS防护 | WRONG / UNVERIFIED | taskStop已有Stop requested；pi实际pipe；参考页面抓取不足以证明peer校验。移除不实比较，DNS/连接绑定单列自研 |
| browser取消、真LSP、图片/PDF、工具参数与ask真实性没有完整交付 | DESIGN-GAP | 按 [19](19-tools-maturity-and-multifile-edit.md) 补齐正式任务与反例，文件编辑只采用一条apply_patch批次入口 |

AbortSignal.any 自 Node 20.3.0 可用，满足本仓 floor；审查过程一度将其误判为新增API，复核官方版本后撤回，没有把该误判写入修订结论。

### 3.5 20、21：配置、会话与恢复

| 原主张或漏洞 | 判定 | 本轮处置与证据 |
|---|---|---|
| 全字段Project>User、CLI-only字段也强求File parity | DESIGN-GAP | 字段来源/信任/合并policy，保留个人连接与CLI-only约束；安全只能收紧 |
| 正则JSONC、通用递归merge、错误原值诊断、非法安全字段回默认 | WRONG / DESIGN-GAP | 成熟parser、schema驱动合并、原型/深度边界、安全投影、风险分级失败；见 [20](20-configuration-system.md) |
| 保存或reload即生效，atomic rename可防并发丢失 | OVERCLAIM | 字段patch+锁内重读/CAS，candidate revision原子发布，保留overrides；persisted/effective/pending/restart分开 |
| current裁决与前文全局归零共存；同步stat即无阻塞 | DESIGN-GAP | picker generation及稳定ID焦点；session owner异步有界查询；核心逻辑bytes、legacy/partial/unknown明示 |
| session过滤加确认框足以安全undo | DESIGN-GAP | 实际提交operation receipt、审批/锁内最终stale-read/写后核验/崩溃对账先于开放执行；[restorePrimitive](../../packages/ts-shell/src/edit/recovery/restorePrimitive.ts#L72) 原路径不能自动满足 |
| 双Esc需新接draft/note、已找到默认regular现场根因 | WRONG / OVERCLAIM | 既有回填保留，补active-leaf已变而摘要失败的真值；现场视觉仍待验收。见 [21](21-session-recovery-and-undo-ux.md) |

### 3.6 22、24：命令清单与语义比较

| 原主张或漏洞 | 判定 | 本轮处置与证据 |
|---|---|---|
| 23 exact/15 renamed/20 ours、缺51、参考212动作 | RECOUNTED / WRONG | 原表自数即23/19/16，原缺失表仅46；改用词法22同主名/8仅alias相交/28无交集；反向53无交集不是功能缺失；参考223是声明 |
| /clear保留同session，新建要重启；Plan/ModalHost/queue不存在 | WRONG | 已有新会话、14picker、plan门禁和队列；复用其owner补UX/直达入口 |
| /permissions=security、/undo=branch、/review=plan-review等可重命名 | WRONG | 分开不同对象/权限与动作，不建立错误重定向；24改称精选比较而非共有全集 |
| /wt只需半小时接线，/commit只是草稿，费用是账单 | OVERCLAIM / WRONG | worktree迁移独立验收；commit实际委派写入；费用是用量×费率估算 |
| 参考/model总写全局、临时模型绝不落盘、usage reset可清本地429 | WRONG | 根据真实persist选项/会话日志/账户权益表述；本产品作用域由用户U10决定 |
| 大型系统仅建议延期 | 被新用户裁决取代 | Git/Advisor/security/商店/远程协作全部正式进入Phase19；[22](22-command-inventory-alignment.md)逐项映射，不以入口数量宣布完成 |

## 4. /goal 无默认预算的专项核查

用户明确要求：未填写预算即不设目标总token上限，显式budget才限额。本轮随后定向核查本地 oh-my-pi 当前快照，结果支持用户观察：

- [interactive-mode 创建](../../../oh-my-pi/packages/coding-agent/src/modes/interactive-mode.ts#L5101) 只传objective；[budget off](../../../oh-my-pi/packages/coding-agent/src/modes/interactive-mode.ts#L6015) 传undefined；不存在默认100k或先补预算的门槛。
- [goals/runtime](../../../oh-my-pi/packages/coding-agent/src/goals/runtime.ts#L285) 修改预算先结算并保留tokensUsed；[pause/resume](../../../oh-my-pi/packages/coding-agent/src/goals/runtime.ts#L420) 保留目标身份与计数。
- 参考统计包含主回合及已返回task用量，仍不是实时共享额度预留。其公式和缓存口径也不能直接称为全部计费token；不机械复制成Cheers的硬上限证明。
- 无目标累计cap仍有单请求、上下文、超时、并发、取消及无进展保护。它们不得被描述成一个隐藏固定总轮数或总token cap。

Phase19采用同样的缺省语义，并新增显式N的主/子/顾问/重试共享admission、预留、结算与重启去重，见 [AUTO任务](phase-19-decisions.md)。

## 5. 本轮已完成的裁决

全部用户偏好与最终约束集中在 [Phase19 §1.1](phase-19-decisions.md)：完整自主goal；不填预算无总上限；五类大型系统全纳入；undo以最近提交operation为单位；model默认session且--global才写全局；三个派生颜色采用用户所选值。既有八形态/default/2-cell/current/论文与软件双域要求继续有效。

技术上决定使用共同命令语法、现有picker、字段policy、源文选择映射、一条apply_patch→edit计划→统一writer路径、持久逐文件结果、最小可消费研究证据及明确的权限边界。错误示例从正文移除；没有把未实现方案改标为运行成功。

## 6. 修订后检查与剩余证据边界

### 6.1 实际返回的修订后复核

- `plan_independent_review`：**APPROVED，仅文档计划**。阅读 Phase 19 全文、22/24 的完整处置及 15/19/20/21 核心契约，定向核查实际请求重发与摘要发送点。修订补齐统一 token 口径、显式 N 的严格准入、辅助请求、off→N 未知历史、暂停与对账分离，修正 fresh 归属并独立列出桌面任务；最终窄复核确认这些发现已处理。
- `research_postedit_review`：先返回需修订，处理后**批准本轮文档范围**。阅读 15–24 与本文，并独立用 AST/JSON 重算命令与配色；发现 /trust 的继承属性接纳遗漏，以及 help 现状、总量舍入、旧基线/过度措辞残留。最终定点复核确认修正；纯 JavaScript 对象语义检查不是产品 /trust 写入测试。
- 专用 critic/verifier 路由先前返回 503、未能提供审查；随后改由上述独立上下文复核。另一个命令专项复核未返回，未计为通过。这是上下文独立复核，不宣称跨模型一致意见或第三方认证。

### 6.2 已运行的文档检查

| 检查 | 实际结果与边界 |
|---|---|
| `rtk npm run verify:docs-drift:strict` | exit 0；rules_dangling=0、docs_dangling=0；仍有 120 条既有 unprefixed source path advisory，门禁不因它们失败 |
| `rtk proxy git diff --check` | exit 0；只覆盖 Git 已跟踪差异，因此另查未跟踪研究文档 |
| 13 份研究/复核/裁决文档全文检查 | 788 个本地文件链接、292 个行号锚点、3 个标题锚点有效；110 张表列数、代码围栏与尾空白检查通过；索引/日志本轮入口另行核对 |
| 计划与命令映射 | 76 个唯一任务、16 批；22 的 53 个唯一名称全部有有效任务 ID。AST 与配色数量复算见上文；这些是文档完整性证据，不是功能覆盖率 |

首次表格检查发现 15 的历史 Jaccard 表中未转义的 `||` 造成错列，修正后重查通过。全部研究、裁决及复核文件仍处于本地工作区；本轮没有提交、推送或 CI 结果。

### 6.3 尚未取得的运行证据

仍未获得的新证据：用户终端短粘贴/双Esc像素复现、同条件旧版本启动对照、真实首轮token分项、全部工具/新功能生产验收、真实四端点矩阵。这些是未来实现/验收事项，不能以本轮纠正文档关闭。

本轮未修改运行时代码、配置、依赖、package scripts 或构建行为；按仓库 Markdown-only 规则未运行 build/产品测试，未调用真实 provider，保留开始时的 .gitignore 修改与既有索引/日志内容。
