---
title: "命令功能对齐：精选 20 组语义比较与 Phase 19 决定"
category: article
sources: [cheers-ts-shell-commands-registry, oh-my-pi-slash-commands-registry, pi-interactive-mode-source, 18-input-slash-startup-context, 21-session-recovery-and-undo-ux]
created: 2026-10-05
updated: 2026-10-05
tags: [features, slash-commands, parity, gap-analysis, tui]
summary: "审查精选 20 组命令及 4 个辅助命令，区分现有交互能力、真正缺口、不同业务对象与参考证据边界。记录模型、撤销和完整系统范围的已确认决定，为 Phase 19 提供可验收行为。"
confidence: high
---

# 命令功能对齐：精选 20 组语义比较与 Phase 19 决定

本轮为 Markdown 研究纠错和设计，未实现功能、未做运行验收。源码快照与可复算命令数量见 [22](22-command-inventory-alignment.md)：Cheers `28ff98cee8c4dd63e6752452f73a362ed3559ae3`，oh-my-pi `1c0993c3d12e70042169a951663bb2702e2c0a9e`，pi `b2b5c42f6138b73ec4b2f49ec0ca468800f88586`。不同参考项目分开标注，不能把其中一方的行为推广为双方所有版本的保证。

## 1. 范围与纠正后的现状

本文是**精选 20 组语义比较**，不是共有命令全集。`/agents` 在 Cheers 尚未注册，`/permissions` 与 `/security`、`/review` 与 `/plan-review` 操作不同对象。它们被放在同一研究中是为了辨明职责和新增系统的范围，不是可互换的名称。

| # | 比较对象 | 比较性质 |
|---|---|---|
| 01 | compact | 同名，交互/本地默认路径不同 |
| 02 | resume | 同名，恢复与导入能力比较 |
| 03 | model / switch | 模型选择与持久化作用域 |
| 04 | context | 上下文计量、估算与呈现 |
| 05 | mcp | 服务、协议与管理生命周期 |
| 06 | memory | 同名但对象/存储生命周期并不完全一致 |
| 07 | export / share / dump | 文件导出、复制、外发分开 |
| 08 | help / 动态命令目录 | 功能比较，参考不需要有同名命令 |
| 09 | init / setup | 项目规则与 Provider 设置是不同对象 |
| 10 | cost / usage / stats | 估算费用、额度权益与图表分开 |
| 11 | permissions / security | 审批策略与漏洞分析分开 |
| 12 | review / plan-review / advisor | 代码、计划和持续回合审查分开 |
| 13 | commit / git / CLI commit | 真实提交与完整 Git 工作台比较 |
| 14 | skill / skills | 本地技能发现与公共包管理比较 |
| 15 | agents / hub | 缺失的角色面板及实时任务总览 |
| 16 | settings | 已有面板的配置覆盖和生效时点 |
| 17 | statusline / footer | 已有动态状态与扩展投影 |
| 18 | undo / branch / retry | 文件撤销、对话导航、重试分开 |
| 19 | fork | 会话复制与历史节点分叉比较 |
| 20 | tree | 已有分支导航与摘要策略增强 |

Cheers 已有 [picker 注册器](../../packages/ts-shell/src/cli/interactive/picker/registry.ts)和[真实交互拦截](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts)。当前接通 **14 个 picker**：model、copy、resume、mcp、connect、permissions、plugin、marketplace、restore、skill、back、tree、statusline、settings。只读 `*CommandRuntime.ts` 的文本 fallback 会漏掉空参 TUI 路径；原稿“没有 Modal Selector Framework”“应新建 ModalHost”的结论撤销。Phase 19 复用并增强现有 `cli/interactive/picker` 与 presentation owner。

其他已存在基础：Plan/Build 及实际工具限制、忙时输入队列、`/clear` 新会话、会话列表 rename/delete、`/retry`、保留旧路径的分支导航及持久摘要。它们需要完善契约和体验，不是从零建设。

## 2. 核心会话与控制（01–05）

### 01. `/compact`

**现状**：[交互解析与呈现](../../packages/ts-shell/src/cli/interactive/compact.ts)将默认调用交给真实压缩，已有前后 token **估算**反馈；`preview/render/json` 明确保留给只读/产物形式。[本地 handler](../../packages/ts-shell/src/core/commands/compactCommandRuntime.ts)生成 handoff，自己不压缩历史。默认语义分裂属实，但“没有压缩反馈”和“所有形式都必须压缩”均不成立。

**参考**：oh-my-pi 的[模式声明](../../../oh-my-pi/packages/coding-agent/src/session/compact-modes.ts)提供 soft（当前模型生成摘要）、remote（服务端优先，失败回退摘要）、snapcompact（位图归档、无 LLM 摘要）。这是该参考的实现选择；位图是否适合 Cheers 的模型、成本和可恢复性尚需能力验证，不能写成无损压缩保证，也不能把估算说成精确 token。

**决定/验收**：统一交互与非交互的默认真实压缩 owner，保留显式 preview/render/json 的不压缩语义及 handoff 兼容入口。模式可用性按 Provider/模型验证，失败/跳过/仅生成产物分开。测试应证明预览不变更历史、默认成功后有效上下文变更、失败不冒充成功，前后值标 estimate。归 PAR-01。

### 02. `/resume`

**现状**：[恢复解析](../../packages/ts-shell/src/core/shell/recovery.ts)支持 exact ID、唯一前缀、title、`last`，歧义拒绝；[会话 picker](../../packages/ts-shell/src/cli/interactive/picker/session.ts)已有列表、重命名和删除。原稿“必须精确 ID”及“只差底层函数接线”撤销。当前选区和 session 大小问题仍按 [21](21-session-recovery-and-undo-ux.md)处理。

**参考**：oh-my-pi 的[生命周期命令](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts)有 `@claude/@codex` 导入选择与 pin；跨工作区发现和外部导入是额外能力，不能因为 ID 可解析就推导已有。

**决定/验收**：current 按真实 session ID 聚焦；保留匹配和歧义拒绝；加入 pin 与受控导入。导入需来源/版本/大小/路径/凭据处理、只读原记录、幂等新身份及不自动恢复写权限。跨根发现不能绕 trust。归 SES-01/02/04、PAR-01；外发部分归 REM-02。

### 03. `/model` 与 `/switch`

**现状**：空参已有[模型 picker](../../packages/ts-shell/src/cli/interactive/picker/model.ts)，文本路径支持 list/use 等，[模型 handler](../../packages/ts-shell/src/core/commands/modelCommandRuntime.ts)当前会保存用户配置。不是缺选择器，而是会话覆盖与全局默认边界需修正。

**参考**：oh-my-pi 的[命令](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts)顺次调用 setModel/setThinkingLevel，不是已证明的原子事务；[model-controls](../../../oh-my-pi/packages/coding-agent/src/session/model-controls.ts)只有 `options.persist` 才写 settings，temporary 也写 session 日志。因此“参考 /model 总改全局、/switch 完全不落盘”撤销。

**用户已决定**：默认仅当前 session，随 session 持久化供 resume；显式 `--global` 才改全局默认。模型与 effort 联合校验/生效，不能半更新。保留当前主名和兼容别名，switch 复用同一路径；模型不存在、能力不支持、保存失败、目录过期、跨 session 切换均有确定结果。归 CFG-05、PAR-03。

### 04. `/context`

**现状**：[context handler](../../packages/ts-shell/src/core/commands/contextCommandRuntime.ts)展示工具 schema、指令/对话、最后请求总量和窗口/预留信息，已经有上下文可观测性；细分来源和结构化交互仍可增强。

**参考**：oh-my-pi 的[context report](../../../oh-my-pi/packages/coding-agent/src/slash-commands/helpers/context-report.ts)也是估算报告，拆分 system、skills、tools、conversation、buffer/slack，并关联其压缩能力。原稿“精确切分”缺乏 tokenizer/Provider 分项证据。

**决定/验收**：按实际装配输入给出分项、剩余空间及阈值，用量/字符估算/tokenizer/Provider usage 分别标识；从实际 tool pool 取 schema。用量缺失不作零、无法分类不强行拟合。snapcompact 只在实现并证明模型能力后展示预估。归 UI-05/07、PAR-01。

### 05. `/mcp`

**现状**：[shell action](../../packages/ts-shell/src/core/commands/shellActionRuntime.ts)接受 status/tools/doctor/refresh；已有服务器 picker 和 refresh 恢复路径，不能叫“只有四项只读探测”。新生命周期操作需追到 MCP owner，不能仅从 Slash 缺词推断底层全无。

**参考**：[builtin-session](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts)声明 **17** 子项：add/list/remove/test/reauth/unauth/enable/disable/smithery-search/smithery-login/smithery-logout/reconnect/reload/resources/prompts/notifications/help。原稿“16 项”与自己列出的 17 项不一致。Smithery 是参考选用的外部服务，不是 MCP 协议强制要求。

**决定/验收**：完整配置管理、启停/重连、认证状态、resources/prompts/notifications 及来源/权限展示纳入 ECO-05。协商能力、分页、连接终止、过期认证、并发刷新与取消必须正确；外部注册表经源适配接入，不把服务品牌写死成协议。批准配置变更不自动批准新工具执行。

## 3. 生态、记忆与度量（06–10）

### 06. `/memory`

**现状**：[memory handler](../../packages/ts-shell/src/core/commands/memoryCommandRuntime.ts)已支持事实/候选相关操作及真实 store health；`/recall`、`/retain` 等 raw 调用有专门语义。不能称“只有 stats”或“没有长期项目知识”。

**参考**：oh-my-pi [memory 声明](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts)覆盖 view/stats/diagnose/queue/sync/clear/reset/enqueue/rebuild 和 mm 系列。它的维护队列及 Mental Models 是特定数据模型，缺同名表不等于 Cheers 缺所有长期记忆。

**决定/验收**：真实注入来源、持久化健康、候选审批、维护队列/操作及版本化知识视图按本产品存储 owner 对齐。delete/invalidate/use/save 等对象不能强行合并；保留原始别名语义。写入与审批分开、禁用/降级/不可读如实报告，导入限制大小/schema，变更可审计。归 PAR-02；通用健康投影继续复用。

### 07. `/export`、`/share`、`/dump`

**现状**：[export handler](../../packages/ts-shell/src/core/commands/exportCommandRuntime.ts)支持 Markdown/JSONL/HTML 和路径边界。JSONL 明示为原始记录，可能含凭据；不能称全格式已脱敏。格式化导出也不能代替外发前审查。

**参考**：oh-my-pi [export/share/dump](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-collaboration.ts)支持 HTML 及主题形式，**拒绝** `/export --copy` 并引导 `/dump`。原稿“支持 --copy”撤销；pi `/import` 的原稿引用未证明该命令存在，不能以它建立“参考已全支持”的结论。Secret Gist 的不可枚举性不等于身份访问控制，链接加密与接收者授权也需分别说明。

**决定/验收**：本地导出/剪贴板/远程分享分为独立动作；新增导入以 schema/版本/内容验证为契约。分享默认脱敏预览，显式目的地、访问者、有效期和撤销，自托管能力必须交付，不能默认送公网。原始格式保持明确告知和受控路径，不静默外发。归 PAR-01、REM-01/02。

### 08. `/help` 与动态命令目录

**现状**：[renderUserHelp/allCommands](../../packages/ts-shell/src/entrypoints/slashCommandRegistry.ts)可纳入运行时注册扩展，不是硬编码 58 项；[welcome state](../../packages/ts-shell/src/cli/interactive/sessionFacts.ts)已有引导信息。技能、MCP prompt、文件等来源是否完整汇聚要逐一检查，不能反过来说全部已支持。

**参考**：oh-my-pi 的[available-commands](../../../oh-my-pi/packages/coding-agent/src/slash-commands/available-commands.ts)按来源汇聚命令，来源/可用性是值得采用的决定，而不是要求 Cheers 改名或复制全部加载机制。

**决定/验收**：共享 metadata/help/completion/parser；展示来源、作用域、模式、参数和不可用原因；动态注册/注销使缓存失效。别名折叠但仍匹配，选择帮助默认填入草稿而不执行。键位显示来自真实绑定与终端能力。归 CMD-01/03、UI-06。

### 09. `/init` 与 Provider `/setup`

**现状**：[init handler](../../packages/ts-shell/src/core/commands/initCommandRuntime.ts)检查项目并提供 AGENTS.md 建议，当前不创建文件。

**参考**：oh-my-pi 的 `/setup` 是 Provider 向导；其 [task commands](../../../oh-my-pi/packages/coding-agent/src/task/commands.ts)加载 init 提示词进入工作流，不足以证明原稿声称的成熟多语言脚手架、dry-run 和模板库。

**决定/验收**：保留 `/init` 的项目规则职责与 `setup` 兼容别名；新增规则生成应先给实际内容/diff，再按路径、审批、stale-content 写入并读回。Provider 登录体验归 `/connect`。项目已有规则保留用户内容，未知技术栈不编造测试命令。归 PAR-05、CFG/ECO 对应配置入口。

### 10. `/cost`、`/usage`、`/stats`

**现状**：[cost handler](../../packages/ts-shell/src/core/commands/costCommandRuntime.ts)按 Provider 报告用量乘 published/fallback 费率计算**估算费用**，不是账单真值；已有多模型分桶和缓存分析。

**参考**：oh-my-pi [usage/stats](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts)分别呈现额度与本地仪表盘。`usage reset` 校验特定账号可兑换权益，再调用 `redeemResetCredit` **消耗外部权益**；不是清本地限流标志，也不能任意消除 429。

**决定/验收**：保留 `/cost` 与 stats alias 现有意义，以明确子入口增加仪表盘，不能静默把 alias 改成启动服务器。额度能力单独显示账号、来源、更新时间和未知值；权益兑换明确确认、幂等及外部失败状态。图表默认 loopback、脱敏，费用标估算。归 PAR-03/04、UI-05/07。

## 4. 安全、审查、Git 与技能（11–15）

### 11. `/permissions`、`/trust` 与新 `/security`

**现状**：[permissions handler](../../packages/ts-shell/src/core/commands/shellActionRuntime.ts)管理工具审批；[trust handler](../../packages/ts-shell/src/core/commands/trustCommandRuntime.ts)管理项目内容信任，二者已有 owner 和不同作用域。

**参考**：oh-my-pi [security](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts)是漏洞分析，声明 plan/scan/status/cancel/scans/show/import/export/validate/compare/disposition 共 11 项。它没有可替代 permissions 的 settings 子项。

**用户范围已确认**：安全分析系统完整纳入 Phase 19，保持独立领域。交付扫描计划、成熟分析器适配、版本/规则/范围、SARIF、安全历史、finding 证据/对比/处置和批准后的修复复验。缺工具、超时、部分覆盖不等于零漏洞；处置不会删除证据。复用统一执行/权限/patch owner，不造第二运行时。归 SEC-01/02/03。

### 12. `/review`、`/plan-review` 与实时 `/advisor`

**现状**：[review handler](../../packages/ts-shell/src/core/commands/reviewCommandRuntime.ts)收集 Git 变更构造审查任务；[工具策略](../../packages/ts-shell/src/core/query/toolPolicy.ts)已限制 Plan 模式，不能称所有规划门禁缺失。

**参考**：oh-my-pi [plan-review](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts)重新打开计划审查，[advisor](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-collaboration.ts)让第二模型审查回合并注入 notes。声明及 handler 不证明审查一定减少错误，更不授予顾问自动写入权。

**决定/验收**：代码 findings、计划版本/批准、顾问意见保留不同对象。Plan 显式入口复用现有状态；实时 Advisor 全部纳入，独立上下文/模型、快照、频率、取消、失败和来源均可见，共享真实预算。未返回不算批准，意见应用要经过主流程及既有写权限。归 AUTO-04/05、GIT-04。

### 13. `/commit` 与完整 `/git`

**现状**：[commit handler](../../packages/ts-shell/src/core/commands/commitCommandRuntime.ts)检查 staged diff，委派模型调用 bash 提交并读回哈希；禁止擅自 stage/amend/push。其注册摘要“draft”不完整，但这不是“只写草稿”。

**参考**：oh-my-pi [Git 入口](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts)开启 split diff/staging/composer；独立 [CLI commit](../../../oh-my-pi/packages/coding-agent/src/commands/commit.ts)有参数和降级路径。其 mechanical fallback 即使形成 commit，也以 nonzero 表达 degraded，不能写成模型失败后始终成功。CLI flags 也不能不经审查直接移成 Slash flags。

**用户范围已确认**：完整文件/hunk stage/unstage、分屏差异、提交编辑及读回、分支操作和工作区迁移均纳入。选中 hunk 绑定 index/worktree 版本，后续外改拒绝；binary/rename/untracked/conflict/no-HEAD/大 diff 有实际处理。stage、commit、push 各自有授权与证据；未知网络结果先查询，不盲重试。`/wt` 另需 staged/unstaged/untracked 保真与失败补偿，不是现有子任务 worktree 的几行接线。归 GIT-01/02/03/04。

### 14. `/skill` 与公共技能商店

**现状**：[skill handler](../../packages/ts-shell/src/core/commands/skillCommandRuntime.ts)和 picker 提供本地发现/查看；公共检索、版本安装和升级是额外能力。当前不执行公共安装脚本，不能以缺安装审批就断言现状正在无保护执行这些脚本。

**参考**：oh-my-pi [skills](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-skills.ts)连接其注册表，支持 search/install/installed/update 和脚本确认。这证明一种工作流，不证明该服务所有包都有可信签名或天然安全。

**用户范围已确认**：完整公共商店纳入。真实源和包详情、固定版本、完整性和可验证签名信任链、安装清单、权限预览、隔离脚本执行、升级/回滚/卸载均交付；源、安装、启用、执行分别授权。归档路径穿越、符号链接、压缩炸弹、安装中断、更新扩大权限均需验收。保留本地技能覆盖，不能把安装成功当运行授权。归 ECO-01/02/03。

### 15. `/agents` 与 `/hub`

**现状**：registry 尚无 `/agents`；但 [subagentLoader](../../packages/ts-shell/src/core/subagents/subagentLoader.ts)已允许用户/项目 Markdown 覆盖角色 prompt，不是锁在编译包中。[类型](../../packages/ts-shell/src/core/subagents/types.ts)有 model 字段，[turn/subagent](../../packages/ts-shell/src/turn/subagent.ts)仍走 host.step，逐代理模型路由属于“声明未接全”，不能算已有完整支持。

**参考**：oh-my-pi [agents/hub](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts)分别暴露角色配置和 live Agent Hub，[agents CLI](../../../oh-my-pi/packages/coding-agent/src/commands/agents.ts)还支持 unpack。模板导出不能代替真实运行看板。

**决定/验收**：ECO-04 复用角色覆盖并接模型/effort/来源/权限到真实请求；后台任务总览另交付 ID、依赖、状态、输出、预算和取消，不能只画配置卡片。子代理、顾问和旁路任务计费进入 AUTO-02，父权限不可扩大。运行总览与 tan/jobs 归 FLOW-01，模型交接/director 与持久 worker 协作归 FLOW-02；对应逐项范围见 [22 第 5 节](22-command-inventory-alignment.md)。

## 5. 配置、导航及辅助操作（16–20）

### 16. `/settings`

**现状**：[settings picker](../../packages/ts-shell/src/cli/interactive/picker/settings.ts)已有 attentionOnIdle/offline 两项的持久化编辑，并明确 restart/reload 生效，不是要求用户手动改 JSON。

**参考**：pi 的[交互设置](../../../pi/packages/coding-agent/src/modes/interactive/interactive-mode.ts)和 oh-my-pi 的配置集合不同。原稿“35+ 项且全部热生效”没有逐项分类证据，撤销固定数量与全热生效保证。

**决定/验收**：按 [20](20-configuration-system.md) 的字段 schema 覆盖设置，明确 session/project/user、敏感度、校验、消费者和生效时点；显示 persisted/effective/next-turn/restart-required。预览不是保存，Apply 前整体验证，失败保留有效配置，并发保存不覆盖别人。归 CFG 全部、UI-06。

### 17. `/statusline`

**现状**：[sessionFacts](../../packages/ts-shell/src/cli/interactive/sessionFacts.ts)已读取 model/provider/branch/context/cost/todos/queued/peers；[chrome items](../../packages/ts-shell/src/presentation/tui/chrome/items.ts)已有 15 项。[statusline picker](../../packages/ts-shell/src/cli/interactive/picker/registry.ts)可预览/保存。原稿“只有静态枚举、没有运行态”撤销。

**参考**：pi 的[footer](../../../pi/packages/coding-agent/src/modes/interactive/components/footer.ts)展示事件驱动状态；这里比较投影策略，不把别的项目所有指标说成 Cheers 都缺。

**决定/验收**：以真实事实源增强长任务/共享预算/顾问/远端状态，未知值不造零，估算费用有标签；当前事实跨模型、压缩、resume 后刷新，窄窗裁剪不丢关键风险。配置与底部状态渲染统一来源。归 UI-05/06、AUTO/FLOW/REM 对应事件 owner。

### 18. `/undo`、对话回退与 `/retry`

**现状**：[undo handler](../../packages/ts-shell/src/core/commands/undoCommandRuntime.ts)当前给恢复建议；`/back` 和双 Esc 是对话导航；`/retry` 已注册并由[交互路由](../../packages/ts-shell/src/cli/interactive/interactiveCommandRouter.ts)执行。原稿“retry 缺失”撤销。

**参考**：oh-my-pi 的 branch/retry/cleanse 分别是对话分支、重试和诊断修复，不能把任一能力当作安全文件撤销的证明。

**用户已决定**：`/undo` 默认最近一次**已提交编辑操作**，多文件 patch 算一个操作。先预览文件与 diff、确认，再通过已有 restore owner 执行；session/workspace/call 身份、before/after hash、权限、路径和最后 stale-read 都需有效。后续手工改动拒绝覆盖；跨文件恢复失败保留 partial/unknown，并可重启查看，不承诺跨文件崩溃原子性。任意 shell 副作用不自动归为可撤销 edit。归 EDIT-01/03、SES-03。

### 19. `/fork`

**现状**：[resume handler](../../packages/ts-shell/src/core/commands/resumeCommandRuntime.ts)的 fork 支持 here 或指定会话，主要是以另一个 session 延续对话；不能把“有 fork”直接认定为任意历史用户节点分叉。

**参考**：pi 的[用户消息选择](../../../pi/packages/coding-agent/src/modes/interactive/interactive-mode.ts)与 oh-my-pi [fork 声明](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-session.ts)提供历史消息选择语义。

**决定/验收**：扩展既有导航/picker，从稳定 entry ID 选历史节点，保留父会话/旧分支及必要元数据；当前草稿、选中消息回填、引用和权限按 session 规则处理。不能复制未决写授权或自动恢复旧副作用。归 PAR-01、SES-01/03。

### 20. `/tree`

**现状**：已有 [tree picker](../../packages/ts-shell/src/cli/interactive/picker/tree.ts)。[SessionManager](../../packages/ts-shell/src/session/SessionManager.ts)用 activeLeaf 保留旧分支并落盘 branch-summary；[导航 owner](../../packages/ts-shell/src/cli/runtime/navigation.ts)接摘要和读回校验。原稿“切换即丢分支”“没有摘要引擎”“仅简单文本”均撤销。

**参考**：pi [树导航](../../../pi/packages/coding-agent/src/modes/interactive/interactive-mode.ts)提供是否总结及自定义重点等交互；这是可增强的策略 UX，不是重建 core/session。

**决定/验收**：复用 `session/` owner，提供摘要策略/自定义重点、分支定位和持久结果。active leaf 已变而摘要失败时显示 changed-with-warning，不能报整个切换未发生；旧分支仍可访问，返回草稿不重复。归 SES-03、PAR-01、UI-06。

### 4 个辅助命令

| 命令 | 已核对现状与参考 | Phase 19 处理 |
|---|---|---|
| copy | [现有 picker](../../packages/ts-shell/src/cli/interactive/picker/copy.ts)能选近期文本块；oh-my-pi [copy](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-collaboration.ts)还有 code/cmd/link 定向提取。 | 增加实体选择和空结果反馈，复制原内容而非布局/ANSI；保留默认行为。归 UI-06、PAR-01。 |
| tools | [handler](../../packages/ts-shell/src/core/commands/toolsCommandRuntime.ts)读 `getToolPool()`，不是只有静态内置表。参考展示激活/禁用及其专属 `xd://` 挂载。 | 展示实际 pool 的来源、启用状态和限制理由；不把参考私有协议设为产品必需。归 UI-07、ECO-03/05。 |
| thinking | [handler](../../packages/ts-shell/src/core/commands/thinkingCommandRuntime.ts)有 low/medium/high/off；参考 effort 提供更多模型能力约束选项。 | 与模型能力、session 作用域及事件同源，unsupported 不悄悄接受；不占用已用于 Plan/Build 的 Shift+Tab。归 CFG-05、PAR-03。 |
| hotkey | [handler](../../packages/ts-shell/src/core/commands/hotkeyCommandRuntime.ts)已有当前键位/终端能力说明；参考有独立查看界面。 | 可检索速查面板复用真实 keymap，终端收不到的键明确标记，避免静态文案与绑定漂移。归 UI-06、CMD-03。 |

## 6. 生产契约与已完成的范围裁决

### 6.1 复用边界

| 能力 | 现有 owner / 新责任 | 不接受的替代交付 |
|---|---|---|
| 选择器/面板 | 复用 14 个 picker 与现有 overlay；新增分页、过滤、来源、错误状态 | 重建另一套 ModalHost；只给静态截图或菜单 |
| session/恢复 | 现有 session store/navigation/restore；补节点分叉、作用域和结果证据 | 声称原来无分支/无摘要；把确认当作覆盖外部修改的许可 |
| goal/Advisor | 复用 loop/执行/usage，新增会话目标、调度和共享账本 | 只补状态字段或借参考的事后阈值冒充硬预算 |
| Git/安全分析 | 原生 Git/分析器经执行边界，结果/写入/复验分层 | 顾问或模型说成功就记成功；以 permissions 菜单代替漏洞系统 |
| 公共商店/远端 | 独立来源/版本/身份/权限，默认自托管能力 | 安装即运行授权、共享即写权限、secret gist 即私密 ACL |

### 6.2 完整目标与预算

用户已选择完整自治：持续执行、暂停恢复、主子统一预算。**未设预算就是没有目标累计 token cap**，不默认 100k，不要求用户先选；显式 N 则实现共享 reservation/admission/settlement，含主任务、子任务、顾问和重试，暂停/恢复保留身份和已用量。上下文窗口、输出上限、请求超时和并发约束始终生效。

参考 [goal runtime](../../../oh-my-pi/packages/coding-agent/src/goals/runtime.ts)默认 unbounded，预算主要在 usage flush 后判阈值；[session stats](../../../oh-my-pi/packages/coding-agent/src/session/session-stats.ts)会纳入已返回子任务用量。既不能说它完全不计子代理，也不能据此声称实时共享硬限已解决。Cheers 须明确定义 token 口径，缺失 usage 不作零、重启重放不漏不重、显式预算不足不再派发，并以目标验收证据区别完成/放弃/失败/预算耗尽。归 AUTO-01/02/03。

### 6.3 大型系统与任务追踪

完整 Git hunk 暂存面板、实时 Advisor、安全分析、公共技能商店和远端协作/执行均由用户明确纳入 Phase 19，可以分更多批次。本文不存在仍待确认的范围收缩选项。/model 作用域和 /undo 单位也已裁定，不再重复提问。

其余参考无词法交集的 53 项按 [22 第 5 节](22-command-inventory-alignment.md)逐条落实，含 MEDIA-01 语音、MEDIA-02 录制、FLOW-01 后台任务/实时代理总览、FLOW-02 模型交接/持久 worker、FLOW-03 评测优化等独立能力。不能把 voice 解释成 relay、把配置面板解释成任务调度、把一个 PAR 总标题当作已有验收。正式任务 ID 与依赖以 [Phase 19 决策](phase-19-decisions.md)为准。

## 7. 文档与实施验收边界

本轮只做源码事实、引用路径、数量、映射及文档差异核对，没有运行 build/tests、PTY、外部账户操作或真实 Provider。文档修正不等于功能已修复。

实施后每组必须具备正常/非法输入、交互与非交互、busy/cancel、持久化/恢复、并发/过期状态和真实失败结果证据。关键参考决定需要反转测试：如 preview 不压缩、session model 不改全局、raw alias 不变义、过期 hunk 不暂存、undo 不覆盖后续编辑、共享会话不自动授写权限、显式 cap 不被并发请求突破。按 owner 做 focused 验证，再按跨域风险扩展，不能以单个正常样例宣称生产就绪。


## 8. 模型与 thinking 实施补充

[Phase 19 §8.76](phase-19-decisions.md#876-cfg-05模型与-effort-联合选择请求快照与全局失败补偿)已将 model/effort 接入同一会话记录与能力校验，`/thinking` 默认保存到会话，`--global` 显式修改默认；auto/off/none 均表示 provider 决定。已知不支持明确拒绝，目录缺项视为能力未验证并保留自定义 ID，不能把本地目录缺失当作远端不存在。保存与生效分开报告，global 明确未写可按 revision 补偿，未知结果仍需检查并 reload。该进展不代表本研究的其他 parity 项已全部完成。
