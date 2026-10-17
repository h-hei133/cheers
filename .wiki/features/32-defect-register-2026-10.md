---
title: "23–37 研究复核登记与修订索引"
category: article
sources: [repo-audit-2026-10-17, 23-input-surface-geometry.md, 24-slash-completion-defects.md, 25-model-configuration-and-relays.md, 26-compaction-trigger-design.md, 27-background-execution.md, 28-context-display-and-startup-budget.md, 29-startup-time.md, 30-panels-and-model-picker.md, 31-tui-capability-matrix.md, 33-omp-panel-mapping.md, 34-panel-conversion-plan.md, 35-panel-inventory-full.md, 36-outstanding-work.md, 37-command-implementation-audit.md, phase-20-decisions.md]
created: 2026-10-15
updated: 2026-10-17
tags: [features, register, research-review, evidence]
summary: "全部15篇研究的复核登记。撤销模型全禁用、工具描述策略、确定启动收益、17新面板及命令完成率等误判；保留原N/R/A议题去向，区分源码证据、历史样本、设计决定与未验运行行为。实现归Phase20。"
confidence: high
---

# 23–37 研究复核登记

本轮按用户要求复核并直接修订15篇研究，随后形成[Phase 20决策与任务规划](phase-20-decisions.md)。**研究修订不等于产品修复或动态验收。** 本轮没有修改产品、测试、依赖或package scripts，没有运行provider/PTY实验或读取真实provider配置。

Cheers基线为`0d30d589ec9023ed24e0794c1215f70398bc418d`。参考关键断言绑定oh-my-pi `c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4`、Codex `4210c08defe92fe8828f789b6f9fda287ad3709e`；pi的旧研究与当前版本分别标记。旧稿计数、个人配置观察、不同HOME启动样本不能升级为本轮运行结论。

## 1. 全部文档的复核结果

| 文档 | 本轮修订重点 | Phase 20归口 |
|---|---|---|
| [23 输入几何](23-input-surface-geometry.md) | gutter与padding算术、正文/装饰/总viewport分离；应用内复制不能证明系统原生复制 | UI-01 |
| [24 Slash与参数](24-slash-completion-defects.md) | 动态目录已有、实际4条补全路径；Enter状态、语法与handler漂移；不造第二语法源 | CMD-01/02 |
| [25 配置与中转站](25-model-configuration-and-relays.md) | 普通模型未disabled、登录双写、JSONC/模型补丁/预设已有；补profile/overlay/路径/账号身份 | CFG-01…05、PRV-01…05 |
| [26 压缩](26-compaction-trigger-design.md) | 已有后续step检查；首请求与完整请求预算、usage覆盖范围、摘要预算及revision幂等 | CTX-01…04 |
| [27 后台执行](27-background-execution.md) | owner和UI完成通知已有；同进程提升、deadline冲突、取消、可选模型跟进 | JOB-01/02 |
| [28 上下文与工具预算](28-context-display-and-startup-budget.md) | 描述策略方向、非同条件token比较、tokenizer误差；默认动态发现的真实工具与generation | CTX-01/04、TOOL-01/02 |
| [29 启动](29-startup-time.md) | HOME样本有混杂；首帧/可输入/ready分开，reentry失效、fallback与构建新鲜度 | START-01…03 |
| [30 面板与设置](30-panels-and-model-picker.md) | panel/modal范围、实际可用矩形、19个通用JSON路径、目录去重及保存/预览契约 | UI-02/03、SET-01…03、PAN-01 |
| [31 TUI能力](31-tui-capability-matrix.md) | 恢复已有表格/折叠/长粘贴等；五项交互扩展的源投影、参考分歧和精确hunk授权 | UI-04、INPUT-01、RENDER-01…03、EDIT-01 |
| 32 本登记 | 清除旧编号、同口径错误与“源码存在即完成”；保留N/R/A审计议题 | 研究修订；QA-04 |
| [33 面板参考映射](33-omp-panel-mapping.md) | 固定版本与真实消费者，纠正85命令/65直属overlay/2个HubFrame消费者，归并旧ID | UI、SET、PAN、JOB、START |
| [34 面板改造](34-panel-conversion-plan.md) | 依赖先后、二维命中及实际viewport验收，不以单个调用点论低风险 | UI-02/03、全部PAN |
| [35 全量面板规格](35-panel-inventory-full.md) | 有效13入口补面板加jobs共14；plugin增强/extensions别名，theme进settings、排除omfg | PAN-01…08、SET/PRV |
| [36 未完成索引](36-outstanding-work.md) | 裁决全部入计划、实现未开始；Phase19留存并非全属环境不足 | 统一入口 |
| [37 命令审计](37-command-implementation-audit.md) | 102声明主入口逐名闭合；撤销69/25/4/0/4与92%，核实真实extension委托 | CMD-02、PAN、QA |

表中“修订”指文档论断已按源码/固定参考调整；各任务的运行、质量、跨平台和交付证据仍须后续取得。

## 2. 原11项用户报告的重新判定

| # | 报告主题 | 当前可支持的结论 |
|---|---|---|
| 1 | 输入左右留白太大 | 正常宽度padding每侧2 cell，小窗可能缩减；gutter另算。用户已选每侧1 cell |
| 2 | 可视正文希望16行 | 当前10行预算及窄窗约束与目标不符；16指正文，外框/提示另占实际屏幕预算 |
| 3 | Slash下拉别名碍事 | 候选只隐藏kind=alias，command/named各自保留语法与说明；alias执行继续兼容 |
| 4 | 配置和模型选择粗糙 | 真实问题是脱敏可用性与connection身份不统一；项目配置读写、JSONC、稀疏模型补丁均已有 |
| 5 | resume等参数过多 | 语法树被投影成长hint；简洁位置usage与完整help分开，不因短hint删除实际动作 |
| 6 | 继续输入未回最佳候选 | query/显式选择重置和异步snapshot需统一；不能把moved清除直接解释为Enter不再接受候选 |
| 7 | 自动压缩策略死板 | 首请求前准入、完整请求/摘要预算及软策略应补；“完全无mid-turn检查”撤销 |
| 8 | 长命令自动后台 | Cheers已有显式后台及owner通知，缺同进程自动提升；60秒与现60秒默认timeout必须分开 |
| 9 | npm start慢 | 历史version与HOME样本提示静态导入和会话扫描问题，不能证明正常首帧确定收益；新入口做构建digest校验 |
| 10 | 首次请求前无占用数 | 当前缺少可复用完整估算快照；补estimated/measured/stale/unknown，不拿估算冒充实测 |
| 11 | 初始约5k对参考约1.5k | 未取得同条件最终wire对照；4952是schema估算，25%是描述字符候选量，不能确认同任务净收益 |

## 3. 原N-01…05的去向

| ID | 原结论的修正 | 处置 |
|---|---|---|
| N-01 | 普通model行未disabled；legacy/env-only会误标not connected，pending/error反而可能误标connected。同provider多relay缺精确选项身份 | PRV-01、PAN-01；不再用51/51不可用作为严重度证据 |
| N-02 | 固定8项属于panel，不横切全部picker；resume为modal，最终高度受surface预算 | UI-02；兼容panel与modal分别验收 |
| N-03 | reentry同步扫描在历史样本有显著成本，但880ms/93%差值混入HOME、配置、凭据初始化与缓存因素 | START-02/03；固定fixture重新测，不承诺旧差值 |
| N-04 | query后清选择会影响提交状态，但未完成词仍可接受候选；“Enter不再接受”错误 | CMD-01；Enter状态表覆盖不完整词、完整词与显式选择 |
| N-05 | resume子动作与其他入口部分重叠，不能据参考入口数量判定应删功能 | CMD-02、PAN-02/06；保留兼容，由共享语法与精简显示解决 |

## 4. 已撤销或收窄的研究断言

| 断言 | 复核后的边界 |
|---|---|
| API-key登录不写connections、无JSONC/项目写入/模型patch/session命名预设 | 当前都有，见[25](25-model-configuration-and-relays.md)；新扩展复用现owner |
| 32/36是UI覆盖率；21字段都须变成枚举 | 顶层/叶子粒度混用；32路径中theme动态注入、statusItems专用picker，通用JSON输入是19路径；数值/对象/自由列表需要适当编辑器 |
| CatalogKind仅16且通用缓存持久；choices只有一处使用 | 16直接加5种Memory为21；通用层仅in-flight去重。一个消费模块内有多处值比较、索引、暂存和应用 |
| omp所有provider默认描述移进prompt、剥描述是无损收益 | auto仅对Gemini走该策略，其他provider保留schema；必须看最终wire与额外发现轮次 |
| tokenizer可以否决 | bytes/chars/模型token误差不能凭一个ASCII比例裁决；准确度研究保留于TOOL-02 |
| Codex提供并排diff和逐hunk授权 | 固定源码只证实unified、字节/行预算及整request批准；并排与精确选集是Cheers独立设计 |
| 102命令STUB=0、92%完成、plugin/marketplace只有记录 | 旧分桶名单不闭合；已存在真实extension registry/install/grants/execute，须按路由优先级判定，不能采信legacy注释 |
| 17个新面板、66个参考overlay、3个HubFrame消费者 | 有效范围见35；参考固定版本为65直属.ts文件、2个消费者，第三命中是定义 |
| 一个renderPanel调用点意味着只改一个文件 | 调用者共享多picker，model/layout/pointer/preview/listener均有风险；按consumer验收 |
| 输入源映射已证明终端原生复制正确 | 当前证明应用内composer选择；transcript仍取渲染行，系统IME/鼠标复制需真机 |

早期六项反证仍保留其边界：browser无页面返回失败（[definition.ts:15](../../packages/ts-shell/src/browser/tool/definition.ts#L15)）；Google SSE参数已有（[googleGenAI.ts:24](../../packages/ts-shell/src/provider/endpoints/googleGenAI.ts#L24)、[googleVertex.ts:80](../../packages/ts-shell/src/provider/endpoints/googleVertex.ts#L80)）；键位重映射已有（[keybindings.ts:33](../../packages/ts-shell/src/cli/interactive/keybindings.ts#L33)）；前景缺省timeout为60秒（[commandTimeout.ts:17](../../packages/ts-shell/src/runtime/execution/commandTimeout.ts#L17)）；version业务早返已有但静态import仍重（[cliProcessRunner.ts:87](../../packages/ts-shell/src/cli/bootstrap/cliProcessRunner.ts#L87)）；会话锁有stale恢复但该锁无fencing token（[lockStaleness.ts:12](../../packages/ts-shell/src/session/store/lockStaleness.ts#L12)）。这些是源码边界，不是本轮新增动态通过。

## 5. 研究质量与原R/A任务

继续使用S1目录/声明代替行为证据、S2只查一侧、S3假阻塞、S4规模代替结论四类问题。增加同条件、版本与consumer核查：行号数量不是可信度分数，非import业务模块也不能推出“没有业务决策”。历史测量保留fixture和局限，未复测不得改称本轮实测。

### R-01 TUI能力矩阵

已就地修订[31](31-tui-capability-matrix.md)：表格、状态度量、块折叠、滚动数学和长粘贴已有。树/表单/tab/进度的公共能力按真实面板consumer提炼；不按组件文件大小或“8项编辑器全缺”立项。五项扩展均已获用户裁决；共享源投影先于新渲染。

### R-02 面板规模与生命周期

[30](30-panels-and-model-picker.md)、[33](33-omp-panel-mapping.md)、[35](35-panel-inventory-full.md)已补端口、焦点、预览、取消、异步generation及unknown语义。134方法或无coding-agent导入不能证明面板代码都不含业务策略；Cheers按owner端口分离，不复制巨类。

### R-03 配置语义

[25](25-model-configuration-and-relays.md)已从字段计数转为schema、来源、信任、CAS、connection与请求归属。参考Provider顶层17键、Model顶层24键，旧27键及model transport撤销。四扩展和路径设置全部纳入，路径规则不是任意字段overlay或LLM provider统一白名单。

### R-04 参数与实现

[24](24-slash-completion-defects.md)保留85 hint与82派生的声明范围；声明投影一致不证明handler无漂移。实际补continue目录和usage/git/wt动作四路径，theme/skill/tools已有动态能力；102入口逐名定位见[37](37-command-implementation-audit.md)，不恢复旧完成率。

### R-05 后台结果交付

[27](27-background-execution.md)保留参考owner-routed follow-up/generation证据，也记录Cheers现有jobs owner和UI通知。新增同进程提升与显式模型跟进，不能宣称从零建后台交付。

| 原ID | 本轮处置 |
|---|---|
| A-01 专项复核 | 已对全部23–37复核并就地修订；不等于相关产品行为已验证 |
| A-02 产物形式 | 采用修订原文加统一Phase20，不再继续派生同题编号文档 |
| A-03 01–22是否同样全审 | 本轮仅在被依赖契约处查验；不宣称已完成历史全集复核，不恢复已结束阶段 |

## 6. 验证与留存边界

本轮仅做Markdown与引用验证，具体命令结果记录在[开发日志](../log.md)本轮条目。大部分23–37为未跟踪文件，不能用空的git diff代替逐文件内容检查。

未运行产品build/tests、provider、参考项目或真机PTY；性能提升、动态发现成功率、账号并发及跨平台交互均是后续验收要求。Phase19的A01/A03/A12/A13/A25继续按[验收§27](phase-19-acceptance.md#27-阶段收尾与未完成项)保留；其中A01有实现缺口，A12账单状态仅是历史证据，不可都写成“只差环境”。本次未提交、推送或发布。
