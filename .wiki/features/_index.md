---
title: "功能开发：pi 对照总索引"
category: article
sources: [repo-audit-2026-10-17, phase-19-decisions.md, phase-19-acceptance.md, phase-20-decisions.md, 32-defect-register-2026-10.md, verification-15-21.md]
created: 2026-09-20
updated: 2026-10-17
tags: [features, gap-analysis, pi, index]
summary: "功能研究与阶段规划总入口。23–37于2026-10-17完成源码及固定参考复核，修订登记见32，统一实施范围和验收见Phase20；本轮仅文档，未实现产品。01–22及旧阶段记录保留历史上下文，Phase19结束但仍有明确未完成项。"
confidence: high
---

# 功能开发：pi 对照总索引

> **2026-10-15：Phase19已结束，保留未完成项。** 用户授权停止继续扩展；16批76项的审核、已修问题和未完成原因见[裁决§11](phase-19-decisions.md#11-阶段收尾2026-10-15)。最终源码本地全套804文件/8173项通过、1项显式跳过；非Linux对象绑定、真实环境/账户与研究质量、远端CI、整树一致性/成本和原枚举拒绝继续保留，见[验收§27](phase-19-acceptance.md#27-阶段收尾与未完成项)。阶段结束不等于全部验收通过。
>
> Phase19归档依据：[决策与任务规划](phase-19-decisions.md)，共 **16批76个交付任务**；历史研究复核见[复核记录](verification-15-21.md)（沿用文件名，覆盖15–24）。后续未完成项须另行确定范围，不自动恢复本阶段。

## 0. 当前研究与Phase 20规划（2026-10-17复核）

23–37是本轮复核的15篇研究。**源码事实与固定参考已修订，CFG-01 本地验收完成、交付中，其余任务待依次实施。** 主入口为[Phase 20决策与任务规划](phase-20-decisions.md)，当前合同和 consumer 清单见 [profile 身份与存储边界](profiles.md)，修订登记见[32](32-defect-register-2026-10.md)，待实现索引见[36](36-outstanding-work.md)。旧“模型全禁用”“确定节省880ms”“17个新面板”“102命令92%完成”等结论已撤销，不能据此施工。

| 文档 | 当前内容与边界 |
|---|---|
| [23 输入几何](23-input-surface-geometry.md) | padding1、16正文行的目标；gutter/viewport与应用内复制边界 |
| [24 Slash与参数](24-slash-completion-defects.md) | canonical/alias、选择状态、共享语法与真实4路径补全 |
| [25 配置与中转站](25-model-configuration-and-relays.md) | availability/connection身份；profile、预设、overlay、账号池、路径设置全纳入 |
| [26 压缩](26-compaction-trigger-design.md) | 首请求及完整请求/摘要预算、软策略、计量身份与幂等 |
| [27 后台执行](27-background-execution.md) | 60秒/新消息提升同进程，取消停止；默认通知、模型跟进显式开 |
| [28 上下文与工具预算](28-context-display-and-startup-budget.md) | 首轮估算、最终wire证据边界；动态发现默认开、schema/generation/质量 |
| [29 启动](29-startup-time.md) | 撤销混杂样本因果收益；首帧/ready、reentry、构建新鲜度与同条件测量 |
| [30 面板与设置](30-panels-and-model-picker.md) | panel/modal真实预算、typed编辑器、来源/信任/保存/预览 |
| [31 TUI能力](31-tui-capability-matrix.md) | 双侧能力对照；Vim/数学/多行表格/并排diff/精确hunk及源投影 |
| [32 复核登记](32-defect-register-2026-10.md) | 全15篇修订、原11报告与N/R/A去向，区分源码和动态证据 |
| [33 面板参考映射](33-omp-panel-mapping.md) | 固定版本命令/组件消费者及四面板族端口、生命周期与原ID |
| [34 面板改造](34-panel-conversion-plan.md) | 公共原语、依赖顺序、二维命中与实际viewport验收 |
| [35 面板规格](35-panel-inventory-full.md) | 有效14补面板入口；plugin/extensions同面板、theme进settings、排除omfg |
| [36 未完成索引](36-outstanding-work.md) | 已决待实现、技术取舍、Phase19留存及证据条件 |
| [37 命令审计](37-command-implementation-audit.md) | 102声明入口逐名闭合、23宿主端口；接线不等于行为完成 |
| [Phase 20 决策](phase-20-decisions.md) | 用户裁决、owner/依赖、任务批次、来源映射及验收要求；CFG-01 本地验收完成、交付中 |
| [Profile 身份与存储](profiles.md) | CFG-01 consumer 清单、启动身份、共享输入、迟到结果与验证边界 |
| [显式配置输入](config-inputs.md) | CFG-03 有序只读输入、来源权限、完整重载与保存边界 |
| [按路径作用域设置](config-scopes.md) | CFG-04 规则声明、canonical 匹配、逐字段合并、操作快照与失效 |
| [模型可用性投影](model-availability.md) | PRV-01 本地可证明状态、脱敏 endpoint、选择器一致行为 |
| [模型角色预设](model-presets.md) | PRV-02 会话兼容、profile 库、整项遮盖与单次事务应用 |
| [显式账号池](account-pool.md) | PRV-03 封闭成员集合、受众/endpoint 约束、空池零发送与会话亲和 |
| [请求归属与凭据退避](request-attribution.md) | PRV-05 全发送路径的 credential 身份与按代际 429 退避 |
| [请求计量与预算](request-budget.md) | CTX-01/02 usage 身份、消息范围与 P+O+H≤W 发送前准入 |
| [压缩操作与步骤幂等](compaction-operations.md) | CTX-03 逻辑操作/步骤、完成复用、未知不重播与并发互斥 |
| [动态工具发现](tool-discovery.md) | TOOL-01 默认 pinned + search/load、权限不变与 generation |
| [UI 容器几何与状态投影](ui-containers.md) | UI-01/02/03 输入区预算、两栏面板、二维命中、进度与 chip 状态 |
| [启动产物与构建校验](launch-and-build.md) | START-01 构建 manifest、五种拒绝状态与 `start`/`start:dev` |
| [Phase 20 交付状态](phase-20-status.md) | 已完成/部分/未开始与精确提交证据 |

### 0.2 本轮之前的历史文档（01–22）

01–07 是七个能力切片的对照研究；08–13 是缺口盘点与登记；14–22 是各功能域的专项研究。**这些是历史记录**，其中的判定多数已在后续 Phase 中被施工或修正——引用时先看该文档自己的「更正」段落。

---

| 文档 | 现行内容 |
|---|---|
| [09 缺口续研设计](09-gap-followup-design.md) | 08 的条目编号沿用；路由期命名残留与新协议（历史文档） |
| [10 缺口与债务研究 2](10-gap-and-debt-research-2.md) | 第二轮缺口盘点（历史文档） |
| [11 功能与缺陷登记](11-feature-and-defect-register.md) | 100+ 条历史登记项 |
| [12 用户体验与工具研究](12-user-experience-research.md) | 原始问题、源码与隔离探针；§11 指向修订方案 |
| [13 深度研究](13-deep-research-design.md) | `/deep-research` 主名，软件/论文双域、全文读取、真实来源与对抗核验 |
| [14 Composer 与主题](14-tui-composer-and-theme.md) | 八形态全部提供、默认 `default`；精确配色与终端默认前景 |
| [15 状态与面板](15-tui-status-and-panels.md) | 区分正常表面与 overlay，复用现有 picker；状态事实与结构化着色 |
| [16 输入与上下文](16-input-slash-startup-context.md) | marker/caret、原草稿区间补全、Enter/Tab、启动首帧、字符估算与 usage 区别 |
| [17 工具成熟度](17-tools-maturity-and-multifile-edit.md) | 运行校验、路径/网络/取消/资源边界；单一 apply_patch 复用 writer |
| [18 配置系统](18-configuration-system.md) | 字段 schema/来源/安全合并、JSONC、并发保存、revision reload |
| [19 会话与恢复](19-session-recovery-and-undo-ux.md) | 打开聚焦 current；撤销最新已提交 operation；分支与失败真值 |
| [20 命令清单](20-command-inventory-alignment.md) | 58 主命令/58 别名；参考 85 顶层/138 子项是声明数；53 个无词法交集项逐项映射 |
| [21 参数选项](21-command-argument-options.md) | 44 个参数命令、18 个无 provider；共享语法、动态实体、兼容与实际副作用校验 |
| [22 命令语义对齐](22-shared-command-parity.md) | 20 组精选比较；区分同名异义与现有能力 |
| [实时语音与本地终端录制](media.md) | W14公开Live协议、明确设备批准、秒数用量、转写选择、本地隐私过滤和安全文本回放；范围及验证边界 |
| [会话与运行时命令控制](command-controls.md) | W15历史/附件、记忆、模型服务层、规则批准、同进程重入与真实清理；能力与验收边界 |
| [Phase 19 集成验收](phase-19-acceptance.md) | 76 项证据索引、完整结构与契约门禁、跨域反例、迁移回退和未完成条件 |

用户已明确：`/goal` 提供持续自主执行、暂停恢复；未填预算就无累计 token cap，显式预算才要求主子代理、顾问、重试与辅助模型请求统一准入。Git 分块工作台、实时顾问、安全分析、公共技能商店和远程协作全部纳入 Phase 19；相关后台工作流、语音、录制与桌面能力也有正式任务。八形态、三项派生颜色、undo/model 作用域均已裁定。

以下保留自 2026-09-20 起的早期探索分类与阶段记录，供追溯。早期“只研究不排期”及“pi 没有则暂缓”的范围不覆盖后续用户已明确要求的 Phase 19；当前范围、依赖和验收以上述决策文档为准。

## 1. 分类口径

每条发现归入**恰好一类**：

| 判定 | 含义 | 本轮是否提议开发 |
|---|---|---|
| **DEFICIENT** | 我们有这个能力，但更弱／不完整／未接线／已损坏 | ✅ 提议 |
| **MISSING** | pi 有，我们没有等价物 | ✅ 提议 |
| **OURS-ONLY** | 我们有 pi 没有 | ❌ **仅记录**（维护者将结合其他项目另行开发） |
| **平手** | 两侧都有，形态不同 | ❌ 仅记录，避免误报为差距 |

早期探索指示：**pi 没有但我们有的功能，先暂缓**，当时 `OURS-ONLY` 只记录不提议；后续用户裁决与 Phase 19 范围已单独列明。

## 2. 七份切片报告

> **Phase 0 裁决已完成**：见 [`phase-0-disposition.md`](phase-0-disposition.md)（2026-09-20）。
> 四项决策全部通过，执行顺序为 **决策 4 → 决策 1 → 决策 3 → 决策 2**。
> **Phase 1 施工已完成**：见 [`phase-1-execution.md`](phase-1-execution.md)。
> 执行中发现 **5 处与裁决不符**（含 `thinkingLevel` 双源、multimodal 实为缺陷、
> 事件流模块非事件流），均已在执行记录中逐条更正。
> **Phase 2 执行状态**：**已闭环完成**（见 [`phase-2-execution.md`](phase-2-execution.md) §4）。
> 自动与手动压缩已统一到同一引擎（`session/compaction.ts`），`core/shell/compaction.ts`
> 的私有切分与 `KEEP_RECENT_MESSAGES = 4` 已删除；新增防膨胀保护
> （摘要不小于被替换内容时拒绝压缩）；连续压缩改为识别并修订上一条 checkpoint。
> 对应 `07-*` 的 DEFICIENT #1/#2/#3 与 pre-research §3 的 guard 缺口全部收口。
> 收口后另修两处**同类缺陷**（预算被当作测量值缩放切点、`/context` 读幻影环境变量），见同文 §5。
>
> **Phase 3 前置研究已完成**：见 [`phase-3-pre-research.md`](phase-3-pre-research.md)（2026-09-21）。
> 从七份文档中**扣除 Phase 1/2 已收口项**后重新排序，给出 6 个候选任务与执行顺序。
> 三项核心发现：①三处配置字段「声明了但消费方为零」，其中两个应**删**而非接；
> ②文件遍历是全仓最大缺陷（**56.2% 白遍历** + 三份不一致的硬编码忽略列表 + `.gitignore` 零支持）；
> ③`AGENTS.md` 与技能对模型**完全不可见**。
>
> **Phase 3 施工已闭环**：见 [`phase-3-execution.md`](phase-3-execution.md)（7 项任务全部完工）。
> 收口核验（`a419d8fa`，该文件随后被删除以避免「两处描述同一事实」）的结论是：
> **79 项差距中已实现 8 项、部分实现 30 项、仍未实现 41 项**——即 **Phase 3 本身已完成，
> 但 01–07 的路线图远未完成**，这两件事不同。
>
> **Phase 4 前置研究与裁决已完成**：见 [`phase-4-pre-research.md`](phase-4-pre-research.md) 与
> [`phase-4-decisions.md`](phase-4-decisions.md)（2026-09-22）。本轮把剩余 41 项**按缺陷类别**
> （而非「大小」）重新分组，给出 8 个候选任务、35 项补充裁决与执行顺序。
> 四项核心发现：①「声明了但消费方为零」在 Phase 3 之后**又长出一批**——共 12 项，
> 含 `runtime/events/` **整个目录（5,124 行，零生产消费者）**，因为 T7 门禁**只管配置字段**；
> ②bash 工具的 `timeout` 与 `env` 是**每天都会踩到**的缺口（60 秒硬编码杀掉 `npm install` 与构建）；
> ③**`light` 主题会让正文变成白底白字**（`light.json` 缺 16 个令牌含 `text`，回退是纯白——实测）；
> ④`/cost` 的费率是写死的常量且没有 cache 维度、`/reload` **报告**主题变化却从不应用。
>
> **Phase 4 施工已闭环**：见 [`phase-4-execution.md`](phase-4-execution.md)（8 项任务全部完工，
> 提交 `86739806` → `02a20d21`）。
> 八项任务各自都做了「还原实现 → 确认测试失败 → 恢复」的反向验证，清单见该文 §9.2。
> 执行中**偏离裁决两处**（均在正文说明）：T5-2 的接线点改到 state snapshot 构建处，
> 并因此**删除**了裁决里要接的那个函数（覆盖更全的一处胜过一个调用点）；
> T7 的 `editor.ts` 未回到 28 名（继续拆需搬走整个 prompt history，改动面大于收益）。
另**推翻三处既有文档记录**（`pi` 无 CPR、catalog `modelOverrides` 本来生效 ×2），见该文 §11。
>
> **后续**：`parentId` / 分支导航（裁决 §5.4 列为「产品设计」而本轮未做）已在后续会话完成，
> 起因是**用户报告 rewind 用起来有问题** —— 实测发现它坏了两次：截断写进了不含 turns 的
> metadata（从未落盘），且设计上就是破坏性的。已改为非破坏性分支切换，见同文 §12。
> 随后又修了**回退入口的三个可用性缺陷**：`/undo` 冒用 `rewind` 别名且摘要谎称会回退对话、
> 选项把「会回到输入框的那个提问」算进了丢弃数（每项多报 1）且措辞像没事发生、
> 回退记录依赖 LLM 摘要成功才写（否则零痕迹 = 静默数据丢失）；并新增 `/back` 命令解决
> 「入口只有双击 Esc 且被键位注册表硬编码屏蔽」。见同文 §13。
>
> **Phase 5 前置研究与裁决已完成**：见 [`phase-5-pre-research.md`](phase-5-pre-research.md) 与
> [`phase-5-decisions.md`](phase-5-decisions.md)（2026-09-23）。本轮把 Phase 4 收口后的剩余项
> 重新盘点并按缺陷类别分组，给出 8 个候选任务（T1–T8）、22 项补充裁决与执行顺序。
> 三项核心发现：①**一整个「报告投影族」共 32 文件 / 8,330 行零活消费者**——
> `tools/dispatch/` 全族、`turn/` 七个投影模块、`provider/request|response` 八个包装模块
> 加 6 个连带闭包，活轨的承担者分别是 `core/agent/tools.ts:184` 的 `executeToolBatch`、
> `runtime/execution/fileLock.ts:85` 的 `withFileLock`、`turn/step.ts:97` 的 `createStepFunction`
> （与 Phase 4 删掉的 `runtime/events/` 同型）；②**重试只有「资格判定」没有「执行」**——
> `provider/request/invocation.ts:328` 会算 `retry_eligible`，而活轨 `turn/step.ts` 的
> 三处失败路径全部直接 `return errorStep`，**一次 429 或 502 直接终止整个回合**；
> ③**`steeringMode`/`followUpMode` 的消费链断在内核边界**——`AgentCore` 支持两种投递模式，
> 但 `turn/session.ts:112` 构造时从不传入，配置里也没有这两个字段。
> 另有 `CatalogModel` 只有 3 字段而 `compat` 的 11 个标志**只用来生成说明字符串**
> （类型说谎）、配置错误抛异常导致 CLI 起不来、压缩文件足迹不跨压缩累积等项。
> **同时更正 4 条既有记录**：`ls` 与 `powershell` 更正为「平手」、
> 主题死令牌数从 18 更正为 14、`/export jsonl` 的原始缺陷已由 Phase 4 T5 收口。
>
> **Phase 5 裁决经五个独立复核者证伪式复核**：`RvRetry`（T1）、`RvProvider`（T3）、
> `RvDecisions`（T4–T8 + §9.1）三份**零发现**；`RvSweep2` 发现 1 处数字不一致；
> **`RvDeadCode` 判定 overall `incorrect` 并推翻主代理 4 项错误**——其中最重要的是
> **T2 的闭包方向算错**（把有外部引用者的 10 个文件误列为闭包，同时漏了 6 个会悬空的
> 类型导入者），数字从「36 文件 / 10,008 行」更正为 **32 文件 / 8,330 行**。
> 若不复核就施工，`tsc` 会在删到一半时报出 6 个悬空 import。全过程见 `phase-5-decisions.md` §11。
>
> **Phase 5 施工已闭环**：见 [`phase-5-execution.md`](phase-5-execution.md)（7 项任务全部完工，
> 提交 `f7edc840` → `f3eb60b8`）。净变化 **93 文件，+3,983 / −12,191**。
> 三项执行中**偏离裁决**（均在执行记录里说明）：
> ①**T2 的删除让一个绑定规则与一份 active 文档悬空**（`verify:docs-drift:strict` 报出），
> 按该文自己已有的先例修复引用；
> ②**T4 有一条路径必须保持抛异常**——`readUserRuntimeConfigFile` 服务于读-改-写，
> 若它也降级，下一次写入会把用户整个配置替换成那一个字段；
> ③**T6 找到一条比裁决更省的路径**——足迹本来就已持久化在 checkpoint 文本里，
> 解析并合并即可，**不新增字段、不需要迁移**。
> 另**撤销裁决的一半**：T8 的 `find` 工具不新建，因为其前提（`glob` 返回文件内容）
> 经实测证伪——`glob` 只拼接路径、已匹配模式、已读 `.gitignore`，新建即重复。
> **T3 执行中修正了自己两处默认值**：`reasoning` 未声明时的默认、以及未知模型的 level，
> 初版都会**静默关掉 `/thinking`**（快照里没有一个条目声明过 `reasoning`），已改为保持原行为。
>
> **Phase 5 复核轮已闭环**：见 [`phase-5-execution.md`](phase-5-execution.md) §11（提交 `3ba4abf8`）。
> 对 8 个实质提交做对抗式复核（5 个子代理并行 + 主代理独立审计），**发现 8 处缺陷，全部已修并反向验证**。
> 最重的一处：**注册 `uncaughtException` 监听器会取代 Node 的默认终止行为**，而崩溃记录器只写文件、
> 从不重抛，于是**每个致命崩溃都变成进程带病继续运行**——实测无监听器 exit 1、加监听器 exit 99，
> 修复后 exit 7 且记录先落盘（构建产物实机验证）。另有 3 处**「参数被接受、从不读取、却返回成功」**
> 的静默丢弃（`edits`×`oldText/newText`、`content`×`oldText/newText`、`replaceAll`×`edits`），
> 1 处排序把「最近 200 条」变成「字典序最后 200 条」，以及 **T3 接线后所有内置模型零 `compat`**
> 导致对开箱模型完全无效——其中 OpenAI 推理模型**拒绝 `max_tokens`**，而我们的输出上限
> 默认 4096 且总是发送，**修复前每一个这类请求都会被拒**。
> `input` 字段因**无任何消费者**被删除（图片输入在 `04-*` 已判「独立立项」）。
> 共发现 **8 处「测试固化缺陷 / 测试看不到缺陷」**，与 `phase-4-execution.md` §15.6 同型。
> `RvDeletion`/`RvDeletion2` 两次被上游 `content_filter` 中断，T2 删除审计由主代理完成并判定**闭合**。
> 复核轮后全量套件 **504 文件 / 3219 通过 / 0 失败**。
>
> **Phase 6 前置研究与裁决已完成**：见 [`phase-6-pre-research.md`](phase-6-pre-research.md) 与
> [`phase-6-decisions.md`](phase-6-decisions.md)（2026-09-23，**零代码改动**）。
> 重新盘点 01–07 后最重要的单一发现是：**表格严重滞后**——44 个看似开放的条目里
> **25 个已实现但未标注**（`edits[]`、工具白名单、会话环境变量、消息队列、`--json` 事件流、
> 主题磁盘发现、per-model thinking 映射、模型目录三层叠加、compat 请求整形、崩溃日志、
> 配置诊断、启动计时、文件足迹、压缩切点等）。真正仍开放的是 **10 项**，其中 **3 项是行为缺口**：
> ①**HTTP 超时**——`provider/request/fetch.ts` 有完整可配实现（30s/120s/120s）却
> **只被启动预检使用**，活轨 `turn/step.ts:134` 用裸 `fetch`，挂起的连接让回合无限等待且重试救不了；
> ②**metrics 采集面**——sink 在但全仓只有 1 个调用点；
> ③**按模型分桶的用量**——`usageTelemetry` 单条扁平记录、`model` 后写覆盖，
> 换模型后先前 token 按最新费率计价（`/cost` 会报出一个没人会被收取的金额）。
> **两个对抗式复核者各覆盖一半，都判 `overall: incorrect`，共推翻主代理 9 处**
> （4 处推理错 + 3 处证据不实 + 2 处引用漂移），其中两处**改变设计**：
> sink 是 `appendFileSync` **同步写**（不是初稿说的非阻塞），且 `/log tail` **丢弃 `fields`**
> （所以 `/metrics` 不是锦上添花而是必要组成）；另有一处**引擎下限缺陷**——
> 声明 `>=20.0.0` 而 `AbortSignal.any` 需 ≥20.3.0，CI 用最新 20.x 不会抓到。**2026-09-24 复核进一步发现**：真正致命的是 `Promise.withResolvers`（需 Node 22）让 **CI 26/26 全红**——本地 Node 24 所以一直没暴露。
> 明确不做：扩展宿主、RPC/SDK、HTML 导出、更新检查，逐项附理由。
>
> **Phase 6 施工已闭环**：见 [`phase-6-execution.md`](phase-6-execution.md)（提交 `a5858658` → `dfcccc71`）。
> 顺序 **T5a → T1 → T2 → T3 → T4 → T5b**，四项代码任务**全部有反向验证与实机验证**。
> **T5a 先做**：25 行滞后描述的是 Phase 1–5 早已实现的能力，压到最后等于让施工者继续被错表误导。
> **T1**：把 `provider/request/fetch.ts` 的既有超时实现**接进活轨**（step + 压缩两条路径），
> 补 3 个配置字段；**实机对照**证明全局 `fetch` 4 秒仍在等待、接线后 2.5 秒抛出。
> **T2**：5 类采集点 + **按回合批量写**（sink 是同步 `appendFileSync`）+ `/metrics`（**跨进程读日志**）。
> **T3**：用量按模型分桶，`/cost` 与 TUI 状态栏**都**按模型取费率——
> 只改一处会让同一会话出现两个金额。**T4**：`/report` + 手写 zip（零新依赖），
> 测试**解压后**扫描归档内容确认密钥不外泄（**2026-09-24 更正**：初版扫描压缩字节，**在泄漏的归档上也会通过**）；`engines` 一度提到 `>=20.15.0`，**复核后回退为 `>=20.3.0`**——那才是真实下限（`AbortSignal.any`），且 `Promise.withResolvers` 与 `zlib.crc32` 已不再被使用。
> 三处执行中偏离裁决（`summarize.ts` 一并接线、跨进程读日志、提高引擎下限）均在执行记录里说明。
> `config-consumers` **32 → 35 字段**，全部有生产读取者；`analyze:module-facades` 仍是原有 5 个 monolith。

> **Phase 6 复核轮（2026-09-24）**：5 个对抗式复核者逐任务复核后**发现 12 处**，其中 **3 处严重**：
> ① **报告归档再次泄漏密钥**——把 `stack` **逐行**脱敏会绕过跨行规则（`<html>…</html>`、`oldText:…newText:`），
> 消息被脱敏而 stack 保留原块（实机复现）；② **CI 从未通过（26/26 红）**——`Promise.withResolvers` 需要 Node 22，
> 而 CI 跑 Node 20，本地是 Node 24 所以看不到；③ **`/metrics` 读不到自己写的数据**（限流作用在原始行、
> 旋转分片被过滤、旧格式行读成 `total 0`、`sessionId` 标签被丢弃）。
> 另有 **生产 941 个文件中有一处原型污染**（模型名 `__proto__` 会写进 `Object.prototype`）、
> 按模型分桶**漏了 provider 维度**（切 provider 仍会重新计价历史 token）、
> 三个 compaction 调用点**漏接一个**（`/back` 的摘要无超时）。
> 全部已修并**逐项反向验证**；详见 `phase-6-execution.md` §7.1 与 §8。

> **Phase 7 前置研究与裁决已完成（2026-09-24，零代码改动）**：
> `phase-7-pre-research.md` + `phase-7-decisions.md`。
> **本轮最重要的发现与 Phase 6 相反——表格这次不是滞后，而是错的**：
> 四条「仍开放」的判定经代码核实**已经不成立**（重复压缩边界、rewind 分支摘要、
> 鼠标选择与复制、Undo/redo），其中两条**还有测试在钉住**它们已实现的行为
> （`compaction.test.ts:543` 的标题就是「revises the checkpoint it finds instead of
> summarizing it again」）。
> **真正仍开放 17 项**，纳入任务 8 项、明确不做 8 项。
> **三项有明确证据的行为缺口**：①**OAuth 登录是完整的死路**——登录/刷新/解析/预检
> 四段全在且有测试，但**请求路径只读 `apiKey`**，而 account-auth 凭据没有该字段，
> 所以 `/connect login … --account` 之后**每个请求发空 `Bearer`**（8 项链路经独立复核者
> 逐项验证）；②**`/skill:name` 实机直接报错**（`Unknown slash command: /skill:demo`），
> 且提示词模板引擎不存在；③**转录内搜索**缺失。
> **Phase 7 施工已闭环（2026-09-24，6 项任务）**：见 [`phase-7-execution.md`](phase-7-execution.md)。
> 净变化见该文件的提交表。**施工后又关闭 5 行判定**（技能斜杠命令、提示词模板、
> `since` 游标/`get_tree`、订阅式 OAuth 接线、转录内搜索），另**删除一个死字段**
> （`firstRetainedEntryId`：声明且被读、**从不被写**，无门禁覆盖）。
> **合计从 13/19/16/10 降到 4/15/16/10。**

> **自我更正 3 处**（§0.3 与 §4.1），其中一处**推翻既有裁决的理由是错的**——
> 我把 `firstKeptEntryId`（压缩记录字段）与 `get_tree`（树条目 `parentId`）当成同一个，
> 经复核者证伪后**维持 Phase 5 原裁决**。

> **Phase 8 前置研究、裁决与施工已完成（2026-09-24）**：
> `phase-8-pre-research.md` + `phase-8-decisions.md` + 同文 §7 施工记录。
> **小修轮**：候选池经五子代理逐行重验后**没有**「已承诺但失效」的重缺陷
> （与 Phase 6/7 的关键差异）。T1（sameModel 守卫）**施工中实测发现不可达**
> ——失败步骤被 `persist()` 空消息闸挡在下一轮 history 外，pi 需要它只因
> pi 的日志保留失败条目；按裁决降级纪律记录，落地的是 **origin 消息来源链**
> （step→loop→transcript，谁写的每条回答从此可查）。
> T2 `--skill`/`--no-skills`（含顺手修的值型 flag 混入 positional 缺陷）、
> T3 glob Windows 分隔归一化（降级条款触发，边界如实入档）+ 技能名边界诊断。
> **散落积压至此清零**：phase-3-review 的 B-1..B-4 全部收口或裁决关闭。
> 13 项大工程维持不做，理由经双侧实测收紧（扩展宿主是写进代码的防御立场、
> RPC/CBOR 在 pi 侧也是实验层、cache warmer 无可算经济学）。
> **判定列不变仍是 4/15/16/10**——Phase 8 收的是散落积压，不是表行。
>
> **B 类与 C 类已收口（2026-09-25，见 `phase-8-decisions.md` §10）**：
> 先建两项 B 共同的**前置**——对外请求的同意与离线开关（`core/network/policy.ts`，
> `offline` 设置 + `--offline` 旗标，只约束自发请求）。
> **B1 更新检查**：`core/update/check.ts`（一次 GET、5 秒超时、失败静默、
> 交互式会话启动时**不 await**）。顺手修掉 `--version` 硬编码的问题。
> **B2 cache 保活**：判定改为算术（`core/models/cacheEconomics.ts`，照 `pi` 的公式）。
> 两个前置都已补：`catalogRefresh` 此前**丢掉索引里已有的价格**（实测 1244/1306 有），
> 以及新增 `CatalogModel.promptCache` 声明窗口。默认 `streaming`，受 `offline` 约束。
> **C 第二个端点**：唯一一处「从没被决定过」的余量，决定做——Anthropic Messages
> （`provider/endpoints/anthropicMessages.ts`）。此前 `isRealProviderSupported`
> **显式拒绝 anthropic**，而目录里躺着 3 个 Claude 模型。端点由 catalog 声明而非由 id 推断；
> 三处请求构造改走共用构造。其余 8 种端点不做（约 8,000 行，无需求证据）。
> **判定列相应更新**：03 的「Prompt cache 保活」MISSING→已收口、「传输选择」维持不做、
> 「自定义 provider」余量收窄；06 的「更新检查」MISSING→已收口，并新增一行「对外请求的同意与离线开关」。
>
> **Phase 9 前置研究已完成（2026-09-25，见 `phase-9-pre-research.md`）**：
> D 类重分类后，用户指定四项「可做」——扩展宿主（01×5 + 自定义 UI）、HTML 导出（02）、
> 图片输入（04）、Mermaid（04）。四个只读子代理深探参考实现，三个复核子代理证伪式复核。
> **结论：本轮不推进施工。** ①**Mermaid 与 HTML 导出**形状已明、可独立验证
> （前者 89 行 + 508KB 零传递依赖；后者参考 3,736 行、我方约 700 行、零新依赖）；
> ②**图片输入**的真实迁移面是 18 个文件，且既有转换器**签名不兼容**（非「接上即可」）；
> ③**扩展宿主是推翻架构立场**——`lifecycle.ts` 把 `execute-plugin-code` 列入禁止集并有测试钉住，
> 参考实现 4,456 行 + `jiti`，须维护者裁决；
> ④**安全复核抓出三项既有缺陷**（与本计划无关但会被放大）：`/export` 写入无路径围栏
> （已实测复现可覆盖工作区外文件）、工具权限契约是死代码、升级审批按工具名判定
> （叠加后扩展顶名可免提示自动批准）。**教训新增：被继承的前提必须被验证。**
>
> **Phase 9 裁决已完成（2026-09-25，见 `phase-9-decisions.md`）**：用户裁定
> **扩展只做路径 1（声明式）+ 路径 2（进程外），不做路径 3（进程内代码执行）**；
> 图片输入加宽 `content` + `messageToText`；Mermaid 默认 `streaming`；HTML 导出首版做等价交互；
> 修 S1、同意 S4。**六行扩展的最终归类**：行 1/4 → 路径 1；行 2 → 路径 2；
> 行 3 → 路径 1（受限）；**行 5/6 → 永久不做**（进程边界与同步终端渲染不兼容，非偏好问题）。
> **本轮另查出 4 项既有缺陷**，最高优先级是 **N1：MCP 非 stdio 传输的 `invokeTool`
> 返回假的成功消息**（已实测复现；违反 `AGENTS.md:25`）。另：`/report` 与 `/export`
> 同有无围栏写入缺陷、导出只读 transcript 因而拿不到树、MCP resources/prompts 只有 mock。
> **顺序**：N1+写入策略 → Mermaid → 扩展路径 1 → HTML 导出 → 图片输入 → 扩展路径 2。
>
> **第 1 步已完成（2026-09-25，见 `phase-9-step1-design.md`）**：
> **N1** MCP 非 stdio 传输不再报告假成功——`connect` 判为 `failed`、`invokeTool` 抛 `config` 类错误；
> 参考研究证实**五家实现无一返回成功桩**。**S1/N3** `/export` 与 `/report` 的写入目标改为经
> `core/security/writeTarget.ts` 单一判定：工作区内直写、**相对路径逃逸一律拒绝（旗标也不能授权）**、
> 工作区外绝对路径需 `--outside`；`/report` 因默认目标本就在工作区外而引入 `defaultOutside`。
>
> **第 2 步已完成（2026-09-25，见 `phase-9-step2-design.md`）**：
> `mermaid` 围栏渲染为 Unicode 制表字符画（依赖 `grok-mermaid`，Apache-2.0、零传递依赖）。
> 加两条保护：**按源文本缓存**（抵消我方「每 delta 全量重解析」的既有成本）与**体积上限**。
> 只做 `off`/`streaming` 两档（`final` 是为参考侧「未闭合围栏」问题而设，我方已用 `trimPartialFence` 解决）。
> **连带修掉** `cli-baseline.test.ts` 5 个失败用例——它们用假传输夹具钉住了第 1 步刚修掉的假连接。
>
> **第 3 步已完成（2026-09-25，见 `phase-9-step3-design.md`）**：
> 技能 frontmatter 与主题令牌，两处都是「声明了没接线」。
> **技能**：修掉块标量把字面量 `|-` 当描述的缺陷（下游不报错，只是文本错）；
> 决定不引入 YAML 依赖（五家参考用它是因为要读嵌套结构，我方只读扁平标量）；
> 规范字段被读取而不生效**要报告**，未知字段不告警（跟随生态）。
> **主题**：**39 → 32 个令牌**（删 10 个无消费者、增 3 个来自被硬编码绕过的表面），
> 接线 8 处。**推翻 `phase-4 §15.3`「不删死令牌」的理由**——实测删令牌不影响用户主题。
> 新增不变量测试「每个声明令牌都有读者」，让清理成为可执行规则。
>
> **第 4 步已完成（2026-09-25，见 `phase-9-step4-design.md`）**：
> `/export html` 写出**单文件、可离线打开**的会话页（侧栏树 + 过滤 + 深链）。
> **三项前置发现**：①**脱敏不能照搬报告规则**——那 10 条里有 5 条**删除内容**
> （diff/隐藏推理/`<html>`），导出恰要看这些，故拆出只含秘密类的 `redactExportText`；
> ②**树必须联接两处**（transcript 无 `parentId`，树在 `state.json`）；
> ③**按参考架构重构**：抽出共用块分类器，终端与导出各用一个渲染器
> （**既有 23 项 markdown 测试全绿且未改一行**，即等价性证据）。
> **未知格式改为报错**（此前静默降级 markdown，使 `/export html out.html` 产出
> 「`.html` 扩展名、markdown 内容」的文件，浏览器会执行其中的脚本形状内容）。
> **实机**：headless 浏览器打开真实导出页——301 行树 / 300 turn / 209ms / 无溢出 /
> 过滤与深链均正确 / **注入节点 0、`javascript:` 链接 0、凭据已去而 `<html>` 保留**。
>
> **第 5 步已完成（2026-09-25，见 `phase-9-step5-design.md`）**：
> 消息 `content` 加宽为「文本 or 文本+图片」，`messageToText` 供文本读者使用。
> **迁移面由编译器枚举**（20 个文件，比事先估的 19 更可靠）。
> **最关键的一条**：运行时守卫必须与类型**同批改**——否则带图片的消息
> **重载后静默消失**（守卫失败不报错、只是丢数据），故有经**校验过的**解码器的往返测试。
> **`vision` 按模型声明且缺省为否**：发图给读不了图的模型会整个请求失败并丢掉旁边的文字。
> **剪贴板**三路（Wayland/X11/WSL），本机 WSL 实测从 Windows 剪贴板读到**有效 PNG**。
> **补（复核发现的缺口）**：读取器/图片通道/按键**全都就位却无调用方**，
> 从编辑器一侧看等价于「没有这个能力」。已补齐 `alt+v` → 8 跳链路 → 开消息
> **有图时**才建成块数组；并修掉 `expand()` 把图片占位符**原样留在句子里**的缺陷。
>
> **第 6 步已完成（2026-09-25，见 `phase-9-step6-design.md`）**：MCP 诚实化收尾。
> 第 1 步已修掉「非 stdio 传输报告假成功」；本步处理余下两条。
> **不再宣称支持取不到的东西**：快照去掉 `resources`/`prompts`（实测**无任何消费者**、
> 也无 stdio action 可取其值），并删掉零使用的 `mockResources`/`mockPrompts` 与两个描述符类型。
> **类文档纠正**：原写「full JSON-RPC lifecycle」**不实**——信封是自有形状，
> **无法接第三方服务器**；已改为如实说明能力边界与改造方向。
> **至此 Phase 9 六步全部完成。**
>
> **Phase 9 复核轮已完成（2026-09-25，见各步文档「复核轮」小节）**：5 个只读子代理 + 主代理亲验，
> 覆盖 13 个有实质代码改动的 commit。**7 条真缺陷，6 条已修，1 条判定为非缺陷**：
> ①**静默丢数据**——父链成环导致**整条会话从树里消失**；
> ②**安全**——符号链接下写**新文件**绕过 containment，`/export escape/new.html` 写到工作区外仍报成功；
> ③**图片无大小上限**——6.7MB 剪贴板图会被送出并被 provider 拒绝，**连旁边文字一起丢**；
> ④**导出列表不合并**——三项列表成三个 `<ul>`，编号列表**每段从 1 重来**；
> ⑤⑥⑦ 三条**同型于本轮正在修的缺陷**：`|2-` 解析出字面量、披露清单只列 4/25 个字段、
> 令牌不变量测试**看不见它本该抓的情况**（三者均以**复现盲区**验证，非读码判断）。
> 另修两处同型：图形缓存 key 不含主题、编辑器占位符硬编码颜色（**上一轮扫硬编码的 grep 模式漏了这个形状**）。
> 更正一处**不实注释**（未闭合围栏的论证）与一处**过度声称**（「23 项测试 = 等价性证明」）。
> 全量 **537 文件 3665 项通过**；门禁全过；导出注入在**真实浏览器**中复核为零执行。
>
> **Phase 8 复核轮已完成（2026-09-24，同文 §8）**：4 个只读子代理（skills/glob/
> provider/TUI）+ 主代理亲验 origin 链与跨轮可达性。**3 项施工结论需更正**：
> ①§7.1 对 sameModel 守卫「不可达」的**原因写错了**——实测同轮内救援**确实触发**
> （`onCompact=1`），真正原因是「一次 run 只与一个模型对话」+「`persist()` 丢弃
> 空失败步骤」，结论维持、原因已更正；②`--skill`/`--no-skills` **只到达提示词路径**，
> `/skill`、`/skill:`、选择器各自建 loader → 命名技能模型看得见而用户调不动
> （实机复现）；③**未信任项目的技能可经 `/skill:<name>` 展开进提示词**（实机复现
> `IGNORE ALL PRIOR INSTRUCTIONS` 原样注入）。后两项已由新的
> `core/skills/skillCatalog.ts`（flag + 信任门的唯一解析点，四个读者共用）修复。
> 另修：单飞刷新按 provider 键会跨账号串 token、`.\a.ts` 与 `./a.ts` 行为不一致、
> 命名路径读不到时静默、两处死代码。**PTY 实机确认**三条（选择器列出 `cli` 来源
> 的命名技能、`/skill <name>` 打出正文、未信任项目被拒）。
> 147 文件 1240 项全绿；门禁全过；`monoliths=5` 无新增。

| # | 报告 | 覆盖范围 | DEFICIENT | MISSING | OURS-ONLY | 平手 |
|---|---|---|---:|---:|---:|---:|
| 01 | [可扩展性与定制化](01-extensibility-and-customization.md) | 扩展宿主、技能、提示词模板、包分发、主题、上下文文件 | 3 | 5 | 1 | 0 |
| 02 | [程序化集成与会话数据](02-programmatic-integration-and-session-data.md) | JSON 事件流、RPC、SDK、session 格式、导出与分享 | 0 | 5 | 2 | 0 |
| 03 | [Provider 与模型层](03-provider-and-model-layer.md) | 订阅登录、模型目录、per-model 覆盖、兼容性开关、传输与缓存 | 0 | 2 | 1 | 0 |
| 04 | [终端交互与呈现](04-terminal-interaction-and-presentation.md) | 编辑器、补全、主题、快捷键、消息队列、转录渲染 | 1 | 2 | 2 | 0 |
| 05 | [工具与执行安全](05-tools-and-execution-safety.md) | 工具集、截断、bash、编辑并发、钩子派发、沙箱与审批 | 0 | 0 | 4 | 7 |
| 06 | [可观测性、配置与生命周期](06-observability-config-and-lifecycle.md) | 配置系统、诊断、崩溃日志、遥测、用量统计 | 0 | 1 | 5 | 1 |
| 07 | [上下文管理与压缩](07-context-management-and-compaction.md) | 触发阈值、切点与超大 turn、重复压缩、分支摘要、文件追踪、压缩钩子 | 0 | 0 | 1 | 2 |
| | **合计（2026-09-24 Phase 7 后重数）** | | **4** | **15** | **16** | **10** |
| | ~~合计（2026-09-24 重数）~~ | | ~~13~~ | ~~19~~ | ~~16~~ | ~~10~~ |
| | ~~合计（2026-09-23 重数）~~ | | ~~16~~ | ~~21~~ | ~~16~~ | ~~10~~ |
| | ~~合计（各文初稿时）~~ | | ~~40~~ | ~~38~~ | ~~16~~ | ~~7~~ |

> ⚠️ **两行合计的差别就是 Phase 6 前置研究的核心发现**：初稿数字是各文档**写作当时**的状态，
> 而 Phase 3/4/5 随后收口了大量条目却**没有同步判定列**。
> 上表是 2026-09-24 按**当前代码**重数的结果，逐行证据在各文档的「2026-09-23 更正」标记里。
> 重数方法：解析每份文档覆盖清单的**判定列**，跳过已划删除线（`~~`）的行。
> **仍然开放的行**见 `phase-6-pre-research.md` §2。
>
> **2026-09-24 第二次重数**：上一版（16/21/16/10）在 Phase 6 施工后就已经过期——`e9476687`（HTTP 超时）、
> `db576061`/`dfcccc71`（按模型拆分、Metrics、Bug report）、`6b24eae6`（per-model token 预算）
> 又各收口了一行，而合计行没有跟着改。当前数字是重跑上面这个方法得到的，`03`/`06`/`07` 各低一到两格。
> **教训**：合计行是**派生值**，改判定列就必须同时改它——这也是复核者逐份解析表格才发现的。

> 注：`03` 与 `06` 是**同一轮由主代理自行完成**的切片（子代理两次因上游故障失败），
> 其中 `03` 的核心结论经**实机执行验证**（见 §4）。

## 3. 按严重度排序的优先项

### 3.1 硬缺陷（有明确证据、影响真实行为、修复路径清晰）

| # | 缺陷 | 位置 | 影响 | 出处 |
|---|---|---|---|---|
| **P1** | **`getRuntimeConfig` 丢弃全部可选字段** | `config/runtimeConfig.ts:196-213` | 用户在 `config.json` 里写的 `contextWindow`/`reserveTokens`/`thinkingLevel`/`temperature`/`theme` 等 15 个字段**静默失效**；自动压缩恒按 64k 触发 | `03-*` §2.1 |
| **P2** | **两套并行配置系统，其中一套完全无效** | `config/settingsLoader.ts`（`loadCascadingSettings` 零调用者） | `.agents/settings.json` 与 `~/.cheers/settings.json` 里的 `permissions`/`skills`/`model` 配置**从不生效**；`denyRules` 形同虚设 | `06-*` §2.1 |
| **P3** | **`glob`/`grep` 全树遍历不剪枝、不读 `.gitignore`** | `runtime/execution/service.ts:112-123` | 一次文件查找走 **14,023** 个文件，其中 **7,874（56%）** 注定被丢弃 | `05-*` §2.1 |
| **P4** | **22 个声明的钩子事件中 11 个从未派发** | `core/hooks/types.ts:5-27` | `PermissionDenied`/`PreCompact`/`SessionStart` 等**外部集成最需要的钩子**不可用；声明的契约大于实现的契约 | `05-*` §2.8 |
| **P5** | **技能与 `AGENTS.md` 都不进入模型上下文** | `turn/prompt.ts:26`（纯字面量） | 技能对模型完全不可见；本仓库自己的 `AGENTS.md` 规则对运行中的 agent 不可见 | `01-*` §3.1/§3.3 |
| **P6** | **`light` 主题在生产不可达** | `presentation/theme/theme.ts:168`（`setTheme` 零调用者） | 浅色终端用户拿到深色配色；`light.json` 与 39 个令牌是维护负担而非功能 | `04-*` §2.1 |
| **P7** | **Metrics 有 API 无 sink** | `observability/metrics.ts:11`（`metricSink?.()`） | 唯一的生产调用 `recordCount("cli.prompts")` 从未被任何人看到 | `06-*` §2.3 |
| **P8** | **压缩触发用字符估算而非 provider usage** | `session/context.ts:7`（`CHARS_PER_TOKEN = 3.5`）+ `cliSessionRuntimeFactory.ts:84`（`?? 64_000`） | 128k 窗口的模型会**早约 55,616 tokens** 触发压缩；大 JSON／非英文内容则相反地过晚 | `07-*` §2.1 |

### 3.2 高价值 MISSING（pi 有、我们没有、成本低）

| # | 缺口 | 出处 | 成本判断 |
|---|---|---|---|
| M1 | bash 不注入会话环境变量（`PI_SESSION_ID`/`PI_MODEL` 等 5 个） | `05-*` §3.2 | **最低**——`ToolExecutionContext` 已有全部数据 |
| M2 | 崩溃日志（`crashes.json`，保留 5 条） | `06-*` §3.1 | **低**——一个处理器 + 一个 JSON 文件 |
| M3 | 启动分段计时（`PI_TIMING=1`） | `06-*` §3.3 | **低**——约 30 行 |
| M4 | `ls` 工具 | `05-*` §3.1 | **低**——复用修好后的目录遍历 |
| M5 | `@` 文件引用 + Tab 路径补全 | `04-*` §3.2 | 中——补全排序已实现，缺候选源 |
| M6 | 快捷键自定义（`keybindings.json`） | `04-*` §3.1 | 中——`MOTIONS`/`KILLS` 已是数据表 |
| M7 | 提示词模板（磁盘参数化 `.md`） | `01-*` §3.2 | 中 |
| M8 | HTML 导出 / session 分享 | `02-*` §3.3 | 高——需先定隐私边界 |
| M9 | stdin/stdout RPC 协议 | `02-*` §3.1 | 高——需独立定义 framing |
| M10 | 订阅式 OAuth（Claude Pro/Max、GitHub Copilot） | `03-*` §2.2 | 中——OAuth flow 已是声明式，加两条配置 |
| M11 | ~~rewind 时摘要被放弃的分支~~ | `07-*` §3.1 | ✅ **2026-09-23 已收口**：回退改为非破坏性分支切换，每次回退必写 `branch_summary`（摘要可选）；`sessionDagEngine.ts` 已删除（重复实现），由 `sessionThread.ts` + `store/threadState.ts` 承担。**复核修正**：摘要的**归属**曾错——会投影到每条分支；现按 `abandonedEntryIds` 只投影到适用的那条（`phase-4-execution.md` §15.1） |
| M12 | 压缩前可取消/自定义的钩子 | `07-*` §3.2 | 低——类型与 dispatcher 都在，只缺派发点 |

## 4. 验证纪律（本轮执行情况）

按 `plan.md` §2.4 与 §9.2 的既有纪律：

| 要求 | 执行情况 |
|---|---|
| 每条发现附 `file:line`（双侧） | ✅ 全部 |
| 缺失类结论附检索命令 + 结果 | ✅ 全部 |
| 子代理并发上限 2 | ✅ 全程未超过 2 |
| 子代理回报**必须经主代理逐条核验** | ✅ 见下 |
| 零代码改动 | ✅ `git status` 无源码改动 |

### 4.1 主代理核验并**更正**的子代理结论

| 报告 | 子代理原判 | 主代理核验后 | 处置 |
|---|---|---|---|
| `05-*` | bash 截断丢弃全量输出 | **错误**：`registry.ts:141` 已落盘为 `artifact://` | 已更正为「平手」 |
| `05-*` | registry 层 edit/write 未串行化 | **错误**：串行化在 `tools/dispatch/executor.ts:90-99` | 已更正为「平手」 |
| `02-*` | `runtime/events/stream.ts` 是一项能力 | **需限定**：生产消费者为 0（仅测试） | 已补「已写好但未接线」限定 |
| `04-*` | —（主代理自查） | 消息队列初判「单一队列」**错误** | 已更正为「两种投递语义完整实现，仅模式不可配」 |

### 4.2 主代理自身的错误（方法记录）

本轮主代理**自己写错 3 条**，全部由直接证据反驳后更正，**保留原判与更正过程**，不静默覆盖：

| # | 主代理原判 | 实际 | 误报原因 |
|---|---|---|---|
| 1 | bash 截断后丢弃原始输出 | `registry.ts:141` 已落盘 | `sed -n '81,140p'` 读函数，落盘分支在 **141 行**——读窗口差一行 |
| 2 | registry 层 edit/write 未串行化 | 串行化在 dispatch 层，**位置更好** | 只查 import 消费者，未追调用链下一层 |
| 3 | 消息队列是单一队列、无投递时机区分 | `core/agent/queue.ts` + `agent.ts` 完整实现两种语义并接线 | 只看了 `interactiveMode` 的 `queue: string[]`，未追到 `AgentCore` |

**共同模式**：**证据搜索停在第一层**——读窗口截断，或检索范围未扩展到调用链下一层。
与 `plan.md` §5 记录的既有教训同源（自制截断读取替代完整读取）。

### 4.3 本轮实机执行的验证

仅一处，用于确认 P1（唯一一次执行）：

```bash
# 写入含 contextWindow: 200000 的用户 config.json，读回
npx tsx /tmp/probe.mts
# → returned keys 只含 10 个字段；contextWindow/reserveTokens/thinkingLevel/temperature 等全部 undefined
```

其余全部为**静态代码分析**。**未运行** build、测试套件或产品 CLI。
因此所有**视觉/交互类**结论（`04-*`）均以代码结构为据，**未经实机视觉确认**。

## 5. 本轮未覆盖的范围

以下范围**本轮明确未做**，如需应另开一轮：

- **运行时行为验证**：未实跑产品观察 `glob` 延迟、TUI 渲染、工具输出等实际表现。
- **pi 的实机对照**：pi 的 `node_modules` 不存在，无法启动其 CLI/TUI；所有 pi 侧结论来自**其文档与源码**。
- **`OURS-ONLY` 项的深化**：按维护者指示暂缓，仅登记位置与「pi 是否真的没有」的检索证据。
- **性能基准**：只量化了文件数量级（P3），未做端到端延迟测量。
- **多语言/多平台细节**：Windows 路径、IME、非 UTF-8 终端等未系统检查。

## 6. D 类台账（**2026-09-25 建立**）

> **为什么要有这一节**：`log.md` 的 2026-09-25 audit 记录「D 类重分类」时，
> 只写了五个子类的**计数**（D-1 八项 / D-2 两项 / D-3 一项 / D-4 四项 / D-5 三项），
> **从未落盘「具体是哪几项」**，且这五个数相加（18）与同一条目自称的「24 项开放」**对不上**。
> 于是「D 类还剩什么」这个问题在文档里**没有可查的答案**——只能重算。
> 本节是那份缺失的清单，每项**逐条对着代码核过**，不是转述旧记录。

**权威来源**：`phase-8-decisions.md` §5 的 13 项「维持不做」清单（该表有裁决编号，
且经 `Rv-P8-Maintain` 子代理复核「correct、零发现」）。本节的分类是对它的**现状重判**。

### 6.1 已完成（**13 项**，→ 应从「不做」移除）

**Phase 10 又收口 6 项**（2026-09-25）：

| 项 | 收口于 | 证据 |
|---|---|---|
| Session 版本头（02:50） | Phase 10 T1 | transcript 首行 header + `TRANSCRIPT_FORMAT_VERSION`；老文件读为版本 0，不重写 |
| Session 导出 header（02:51） | Phase 10 T1 | `/export jsonl` 首行 header，版本取自 transcript 本身 |
| 崩溃日志时效（06:54） | Phase 10 T2 | `MAX_CRASH_AGE_MS` + `readRecentCrashes()`；**只过滤不删除** |
| 主题热重载（04:61） | Phase 10 T3 | `presentation/themes/watch.ts`；实机验证改文件后同会话变色 |
| Cache 浪费分析（06:62） | Phase 10 T4 | `observability/cacheWaste.ts` 的 `findCacheWaste()` |
| 协议自注册（03:53 部分） | Phase 10 T5 | `provider/endpoints/` 注册表；**加协议不改编任何调用方** |

**Phase 9 与 Phase 8 收口的 7 项**（下表）：

| 项 | 收口于 | 证据 |
|---|---|---|
| HTML 导出（02） | Phase 9 第 4 步 | `session/export/{collect,htmlRender,template,html}.ts` 存在；文档判定行已改 ✅ |
| Mermaid（04） | Phase 9 第 2 步 | `presentation/tui/transcript/mermaid.ts`；`grok-mermaid@^0.2.3` |
| 图片输入（04） | Phase 9 第 5 步 | `presentation/tui/clipboardImage.ts` + `PromptAttachments` 全链 |
| 主题死令牌清理（04） | Phase 9 第 3 步 | 39 → 32 令牌，8 处接线，0 个无读者 |
| 更新检查（06） | Phase 8 §10.2 | `core/update/check.ts` |
| cache 保活（03） | Phase 8 §10.3 | `turn/cacheWarm.ts` + `core/models/cacheEconomics.ts` |
| 同意/离线开关（前置） | Phase 8 §10.1 | `core/network/policy.ts`（两项 B 的共同前置） |

### 6.1bis 结构性收敛（非「收口」，余量仍在）

**Phase 10 T6**（`03:49` 认证 provider）：把散在 **7 个文件、54 个分支点**的逐家硬编码
收敛为**一张 provider 声明表**（`core/providers/facts.ts`），降到 **30 个**。
**余量不变**：支持的家数仍是 2，真实端点验证仍缺（无订阅账号）。
**`03:49` 的判定仍是部分收口**——收敛的是结构，不是家数。

### 6.2 仍然不做，理由经复核仍成立（6 项）

| 项 | 理由 |
|---|---|
| 扩展宿主（01×5 行） | `lifecycle.ts` 是**写进代码的显式防御立场**（`supported:false`/`executable:false` 硬编码）；推翻需维护者明示。**行 5/6 已升为「永久不做」**——进程边界与同步渲染不兼容，是架构而非偏好 |
| 包分发（01） | 扩展宿主的下游（装了没东西执行）；宿主不做则无意义 |
| RPC / CBOR protocol／client／server（02×3） | pi 的这几个包与其核心**生产零耦合**（仅 experimental 引用），pi 自己当实验层；协议是长期承诺，用户面为零时发出是 premature commitment |
| SDK（02） | `ShellSessionRuntime` 依赖注入面未稳定到可承诺兼容 |
| 传输选择（SSE／WebSocket）（03） | WebSocket 特化于某家网关，我方无该接入。复核维持：新增的第二个端点走**同一套** SSE 读取，**没有产生传输层的第二个需求** |
| opencode 式全局输出拦截层 | 与 pi 平手 + 已有 `boundText` 批次层兜底；再叠一层是防御过度 |

### 6.3 长尾／收益不明（1 项）

| 项 | 状态 |
|---|---|
| Markdown 高级语法（04） | LaTeX / 嵌套列表 / 删除线。pi 靠 Marked 1,015 行定制；我方自研 190 行覆盖日常。**等语法高亮立项时一并评估**（第 3 步刚删掉 6 个 `syntax*` 死令牌，此处不重新引入） |

### 6.4 仍标 `MISSING`/`DEFICIENT` 的行（**9 行**，按归属分三类）

以下在 01–07 判定列里仍标 `MISSING`/`DEFICIENT`，且**确实未实现**（已逐条 grep 核实）。
**注意它们不是同一类**——分属下面三个不同的处置：

**① 扩展宿主族（4 行，Phase 10 排除）**

| 项 | 文档 | 核实方式 |
|---|---|---|
| 扩展自动发现（磁盘目录） | 01 | 无 `.agents/extensions` 清单加载路径 |
| 扩展 API：注册工具 | 01 | `grep registerTool` → 0 |
| 扩展 API：注册命令 | 01 | `grep registerCommand` → 0 |
| 扩展 API：事件订阅 | 01 | 只有配置驱动的内置钩子，无第三方注册 API |

**② 宿主的下游／同族（4 行，Phase 10 排除）**

| 项 | 文档 | 核实方式 |
|---|---|---|
| 包分发（npm/git、manifest） | 01 | 无 manifest 实现 |
| stdin/stdout JSONL RPC | 02 | 无 |
| Node/TypeScript SDK | 02 | 无 |
| CBOR protocol／client／server | 02 | 无 |

**③ 独立立项（1 行，Phase 10 不纳入，理由已更正）**

| 项 | 文档 | 已核实的性质 |
|---|---|---|
| Session 分享／发布链接 | 02 | **不是**扩展宿主下游（Phase 10 §9.3 更正了原归因）：它依赖**会话导出 + 网络发布**，需独立决策发布目标、授权、链接失效 |

**注**：扩展的 4 行（自动发现/注册工具/注册命令/事件订阅）**同属「扩展宿主」一个根**，
Phase 9 裁决已定其边界（路径 1 声明式 + 路径 2 进程外），但**宿主本身未建**。
**这是一块整缺口，不是四件小事。**

### 6.5 判定列现状（本次重算，非读合计行）

剔除划删除线项、按表头命名的「判定」列取值、只计列数完整的行：

| 状态 | 行数 |
|---|---:|
| 已收口 | 47 |
| 部分收口（含明确余量） | 10 |
| `OURS-ONLY`／平手（仅记录） | 27 |
| **仍开放（MISSING/DEFICIENT）** | **9** |
| 永久不做／维持不做 | 3 |
| 其他（表格格式差异，非判定行） | 5 |

**与旧记录的关系**：`log.md` 那条 audit 说「29 剩余 → 24 开放」，本次重算得**9 行开放**。
差额来自三处：①Phase 9 第 2/4/5 步与 Phase 8 §10 的**七项已完成但文档未回写**——
**本次已补**（02 的 HTML 导出行、04 的 Mermaid 与粘贴图片行）；②部分行在审计后由裁决
改为「永久不做」；③旧条目的「开放」口径包含 `部分收口` 的余量，本节把两者分开计。

### 6.6 文档损坏台账（**累计 10 处**）

**表格结构损坏（8 处，全部已修）**——这一类会让行**对解析器不可见**，从而**影响计数**：

| 位置 | 损坏 | 后果 |
|---|---|---|
| `01-*` 自定义 UI 行（`01:204`） | **单元格残片粘在行尾**（`ctx\.ui" ... → 0 \|`），且**一个 code span 被拦腰截断** | 该行被判为 4 列（表头 3 列） |
| `05-*` bash 超时行（`05:54`） | `§2 \|.2` —— 竖线把章节号劈成两格 | 该行多一列 |
| `04-*` 主题磁盘发现行（`04:63`） | **行首缺 `\|`**（Phase 10 规划期由复核发现） | 整行**不被当作表格行**，**判表少一行**（101 → 102） |
| `03-*:54`、`03-*:56`、`04-*:63`、`06-*:63`（4 行） | **行尾缺 `\|`**（Phase 10 施工后复核发现） | 行仍被解析（宽容解析器可恢复），但**违反格式规则**，且与同类损坏同源 |
| `phase-3-execution.md:592` | 单元格内 code span 有**未转义的 `\|`**（`/trust [status\|on\|off\|session]`） | 该行被劈成 5 列（表头 2 列） |
| `interaction-issues.md:283` | 行尾一个**孤立的 `**`**（引入时即被截断，本应是 `**锁**——…`） | **会把其后所有文字加粗**；已补回完整句意 |
| **`.wiki/refactor/` 4 份文档共 9 行**（`block-findings-2026-09-19.md`、`singletons-core.md`、`t10-t11-t12-disposition.md`、`t14-t17-disposition.md`、`unreachable-clusters-disposition.md`、`wiki/theses/claude-code-*.md`） | 同一类：**code span 内未转义的 `\|`**（多为 `git grep -nE 'a\|b\|c'` 这类命令串），另有两行**缺行尾 `\|`** | 这些是**历史文档**、**计数不依赖它们**，但同为该缺陷类；**Phase 10 施工后复核一并修好** |

> **修复后全库复扫**：`.wiki/**/*.md` 共 **8710** 行表格，**列数不一致 0 行、缺行尾竖线 0 行**。
> 其中 `block-findings-2026-09-19.md:2187` 一行**自引入起就被截断**（第四列末尾与第五列都缺失），
> **原文不可还原**——已按「补齐列数、标明此处原文缺失、不虚构内容」处理。

**判定列过时（2 处，全部已修）**：

| 位置 | 损坏 |
|---|---|
| `02-*` HTML 导出行、`04-*` Mermaid 行、`04-*` 粘贴图片行 | 判定列为**过时**的 `MISSING`（模块早已存在，见 6.1） |
| `01-*:97` 技能发现注记 | 声称三项余量，**实测三项全已过时**（Phase 10 §9.2 已更正） |

**流程性观察（Phase 10 复核两轮反复指出）**：
「判定列」与「同一行的正文/注记」出现过**互相矛盾**（`01:57` 行内写「余量：无」而注记仍列三项余量；
`06:60` 判定列写「已收口」而 `:169` 正文仍记着未收口的余量）。
**这是同源更新缺失**：改一处忘改另一处。**处置**：Phase 10 施工完成后**逐行核对这两处**，
**不新建设流程工具**（超出该阶段范围）。

## 7. 建议的下一步

> **下面第 1–4 条是 Phase 0 时代写的**（P1–P3／M1–M4 是那套编号），
> 其所指的项目**均已收口**。原文保留以存当时的判断，**当前状态以 §6 台账为准**。
> **2026-09-25 更新**：Phase 10 已施工完毕（T1–T6 + 两项文档修复，见 §6.1）。
> 现状是：**剩下 9 行仍标开放**，其中 8 行同属「扩展宿主族」（宿主本体 + 下游），
> 1 行（`02:53` Session 分享）是**独立立项**。

1. **扩展宿主是否立项**（01 的 4 行同根：自动发现／注册工具／注册命令／事件订阅）。
   Phase 9 裁决已定边界——**路径 1（声明式）+ 路径 2（进程外），不做路径 3（进程内执行）**——
   但宿主本身未建。**这是唯一一块整缺口**，需要你决定做不做。
2. **02 的 3 行**（JSONL RPC／Node SDK／Session 分享）与扩展宿主同源：
   都是「对外程序化接口」这一族。§5 的结论是「用户面为零时发出是 premature commitment」,
   若扩展宿主立项，它们应一并重估。
3. **包分发（01）** 是扩展宿主的下游，宿主不做则它无意义——跟随第 1 条。
4. `OURS-ONLY`／平手的 27 行按维护者指示暂缓，待结合其他参考项目另行开发。

## 8. Phase 11 前置研究：差距、债务、死代码与三语言架构裁决（**2026-09-26**）

> **见 [`08-gap-and-debt-research.md`](08-gap-and-debt-research.md)。**
> **合并版**：原 08/09/10 三份文档已于 2026-09-26 合并为该文件（§1 差距与债务、§2 语言裁决、§3 热路径续研）。
> 索引的 §8.6 / §8.7 对应原 §9 / §10。
>
> 维护者指示：对照 `~/projects/` 下的顶尖项目，探索**差距 / 架构债务 / 死代码**，
> 报告写入 features 的新文档（从 `08` 起），完成后更新本索引。
> **本文件是 Phase 11 的前置研究**——文件名按维护者指示用 `08-`，
> 阶段序号是 Phase 11（`01-*`～`07-*` 是能力切片，`phase-N-*` 是执行阶段，Phase 10 已收尾）。
>
> **执行方式**：5 路只读子代理（并发上限 5）覆盖内核循环、工具执行、provider/模型、
> 上下文/记忆、架构债务五个切片；其中债务总扫 `S5DebtDeadCode` **被上游 `content_filter`
> 拦截**（第 4 次记录，拦截点与前三次一致：session 编解码／凭据遮蔽／认证分派），
> 处置照既有结论——**该阅读面由主代理亲验**，并重派两个避开该面的窄切片（**重派成功**）。
> 所有头条数字由主代理**自写脚本独立重算**，不采信子代理。
>
> ### 8.1 头条：三项「开箱即坏 / 静默降级」P0 缺陷
>
> 这三项**不是相比 pi 的差距**，而是我方自身的既有缺陷，前 10 个阶段都没覆盖——
> 因为它们不在 `01-*`～`07-*` 的七份切片范围内。
>
> | # | 缺陷 | 性质 | 证据 |
> |---|---|---|---|
> | **P0-A** | `daemonEnabled` **默认 `true`**，而 Rust 执行面在 cargo 缺失时**直接判失败、不落回本地** | **全新安装开箱即坏**：bash 工具 100% 失败 | `runtimeConfig.ts:349` 默认 true；`service.ts:135-146` 每条失败路径都 `return`，`executeLocally` 在 `if` 之后不可达。**实机复现**（`HOME=/tmp/fresh`、无配置、PATH 去掉 cargo）：`success:false, "Cargo executable not available"`；加回 cargo 则成功（127ms）。本机被 `~/.private-agents/config.json` 的 `daemonEnabled:false` **掩盖**——与「CI 用 Node 20、本地 Node 24」同型。**违反 `AGENTS.md`**「Rust … is not the default execution plane」 |
> | **P0-B** | `cheers.json`（**git 跟踪**、含 `maxTurns:30`、`allowRules`）**从不被读取** | 静默失效的配置契约 | 候选路径只有 `resolveUserDataFile("config.json")` 与 `<root>/.cheers.json`（`runtimeConfig.ts:555-561`）。**实机**：CLI 首屏报 `max-turns=15`，文件写 `30`。`log.md:2751` 当时**记录了它却没立项** |
> | **P0-C** | `/model refresh` **抹掉**内置模型的 `compat`/`promptCache`/`vision` | **已修复缺陷的静默回滚** | `catalogRefresh.ts:79-100` 只投影 6 个字段；`mergeProviders` 的 `dedupeModels` 是 `Map.set` **整体替换**而非深合并。**实机复现**：`gpt-5.3` 的 `compat.systemRole: "developer"` → `"system"`、`maxTokensField` → `max_tokens`、`vision: true` → `false`。即刷新后**推理模型会拒绝 `max_tokens`（400）**、**图片请求会整个失败**——两者都是 Phase 5 / Phase 9 已修好的缺陷 |
>
> ### 8.2 差距清单
>
> **10 项 MISSING**：数据驱动权限规则（`allowRules` 声明但零读者，**与 P0-B 同根**）、
> 后台命令执行、OAuth Device Code、Bedrock、Google GenAI/Vertex、
> Copilot/Anthropic OAuth、未变更文件去重、压缩后文件恢复、指令 `@import`、动态工具装载增量。
>
> **14 项 DEFICIENT**，其中最重的三项：
> ① **编辑不检查 `oldText` 唯一性**——`editEngine.ts:198-206` 取**首个**匹配，
> **实机复现**：`success: true` 且只改第一处；pi 有 `countOccurrences` + 「The text must be unique」；
> ② **子代理 `task` 工具不是 agent**——`taskTool.ts:142` 是一次裸 `fetch`，
> `grep AgentCore|createStepFunction|runTurn` → **0**，`subagentDef.tools` 被忽略、worktree 无人执行；
> ③ **`classifyProviderFailure` 是死代码**（生产 0 引用），活轨改用临时代码串匹配。
>
> ### 8.3 架构债务与死代码（三层口径，逐层收紧）
>
> | 口径 | 文件 | LOC |
> |---|---:|---:|
> | `analyze-boundaries.py` 的 `cliOpaque` | 129 | — |
> | CLI 不可达（排除 harness/test-utils/eval） | **90** | **21,247** |
> | **真死**（不可达 **且** 零生产导入者） | **35** | **6,650** |
>
> **seam 校验**：对 90 个不可达文件扫描非测试、非 harness 导入者 → **0 条**。
> 90 个文件构成 **36 个连通簇**（并集 == 全集），最大三簇
> `planning/runtime/engine.ts`(33/9,283)、`context/acquisition/projection.ts`(28/7,756)、
> `edit/multifile/model.ts`(12/3,831)。
>
> **结构性死代码**：`core/workflow/` 的 6 个「管线」模块
> （`builderValidator`/`adversarialRefuter`/`contextInjector`/`pipelineExecutor`/`cacheStaggering`/`teamStore`，
> 共 508 行）**零生产导入者**，活轨 `/workflow` 走的是 `runner`+`dagResolver`+`parallelDispatcher`。
> `log.md` 2026-08-30 曾把它们记为「Delivered」——**与 phase-5 的「报告投影族」完全同型**。
> 另有 `tools/policy/interception.ts`（411 行）与整条工具结果投影链（`ToolReportSafeProjection`、
> `MVP_TOOL_ALLOWLIST`）**零消费者**。
>
> **⚠️ 删除授权**：`plan.md` §2.1 明文「**可达性只用于分析，不授权删除**」，
> §9.18 的 T16a 已对其中一簇裁决「暂不删除」。**本轮同样只登记不删除**，处置需明示授权。
>
> ### 8.4 子代理结论中被主代理**推翻**的项
>
> | 原判 | 核验 | 处置 |
> |---|---|---|
> | S4：「memory 子系统未接入活轨」 | **错误**：`core/shell/sessionRuntime.ts:268` → `buildPromptWithFutureTurnInjections` → `memory/projectMemoryFutureTurnInjection.ts`，可达性 **REACHABLE** | 已推翻，不登记 |
> | S4：「`context/acquisition/` 与 `context/graph/` 是 100% 未接线」 | **部分错误**：前者 10 中 6 可达、后者 12 中 7 可达，**未接线的是子集**（4+5） | 已更正 |
> | S1：「retry 已完整接线」 | **成立但缺 jitter**（`retry.ts:127` 无 `Math.random`；pi 有 `* (1 - Math.random()*0.25)`） | 部分保留 |
>
> **方法论教训**（与 §4.2 同源）：子代理的**可达性结论**必须用同一张图重算——
> S4 两处错误都是「把**子集**说成**整个域**」。
>
> ### 8.5 建议顺序
>
> **第 1 梯队（P0，不需等裁决即可确认是缺陷）**：T1 `daemonEnabled` 不降级 →
> T2 `cheers.json` 不生效 → T3 刷新抹掉 compat。
> **T1 的具体形态需裁决**：默认改 `false`，还是 cargo 缺失时**落回本地**（本文件推荐后者，
> 它同时覆盖「cargo 存在但冷编译超 30s」等同类情形）。
> **第 2 梯队**：编辑唯一性、子代理不是 agent、死分类器接线、重试 jitter、Doom Loop 交替检测、
> temperature 按模型条件化。**第 3 梯队**：文件去重、`@import`、工具装载增量、权限规则集。
> **第 4 梯队（需独立裁决）**：后台命令、Device Code、**死代码处置（需明示授权）**、
> 路由期命名残留、新协议（无账号可验，`phase-10-decisions.md` §1.1 已有先例）。
>
> **未验证项如实记录**：Anthropic `thinking` 缺 `budget_tokens`、OpenAI 推理模型 temperature、
> OAuth 登录成功路径、SSE 事件头——**均无账号或未独立复现**，见该文 §5。

> ### 8.6 三语言架构裁决（原 §9，2026-09-26 已施工）
>
> 回答维护者的直接提问：「三门语言写 agent 是否有价值，还是噱头？是否应全部转写 TS？」
> **Python 层与 Rust 执行面均已按裁决删除并实机验证。**


> **2026-09-26 已按裁决施工：Python 层与 Rust 执行面均已删除，实机验证通过（§9.5）。**
>
> 回答维护者的直接提问：「三门语言写 agent 是否有价值，还是噱头？是否应全部转写 TS？」
>
> ### 8.6.1 结论
>
> | 层 | 现状（实测） | 裁决 |
> |---|---|---|
> | **TypeScript** | 975 生产文件 / ~165k 行，承载**全部**产品行为 | **保留**——它就是产品 |
> | **Python** | **30 行**（一个冒烟测试）；`src/` **不存在**；`test:python` 在本机**硬失败**（`D:\conda-envs\...`） | **删除** |
> | **Rust** | **1,112 行**，且比 TS 侧**已有实现更弱** | **删除当前实现**，保留方向 |
>
> ### 8.6.2 Rust 是负资产的七条实测证据
>
> | # | 证据 |
> |---|---|
> | 1 | **沙箱是字符串匹配**——`executor.rs:205-238` 判 `joined.contains("http://") \|\| joined.contains("curl ")`；而 TS 侧 `sandbox/osSandbox.ts:237-256` 是**真的 `bwrap --ro-bind/--bind/--tmpfs/--unshare-net`**（本机 `bwrap` 已装）。**Rust 的隔离弱于 TS 已有的** |
> | 2 | **静默丢失流式输出**——实测同一命令：Rust 路径 `onOutput callbacks: []`（零回调），TS 路径 `[[5,"1"],[307,"2"],[609,"3"]]`。`service.ts:150-163` 的 daemon 分支**没传 `onOutput`**，而 `daemon/client.ts:137-142` 的注释承诺「forwarded as it arrives」——**代码在说谎** |
> | 3 | **延迟净增**——热路径 **60ms vs 4ms**；首次 **923ms vs 16ms**；冷编译 **15.1s** |
> | 4 | **契约是测试专用**——`contracts/rust/mod.rs`（293 行）只被 `#[cfg(test)]` 引用（`executor.rs:287-290`）；`schema_version_is_valid` 唯一调用者是自己的测试 |
> | 5 | **跨层 `schemaVersion` 从未发送**——`WORKSPACE.md:170` 声称「MUST include」，`grep schemaVersion` 在 `daemon/*.ts` 与 `daemon.rs` 均为 **0** |
> | 6 | **预编译二进制无人引用**——`target/release/daemon`（1.1MB）存在，`grep -rn 'target/release' daemon/` → **0**；代码永远走 `cargo run` |
> | 7 | **默认值让产品开箱即坏**——`daemonEnabled: true` + 缺 cargo 不降级（§1 P0-A）。**这是 Rust 层净负价值的直接后果** |
>
> ### 8.6.3 参考项目普查（14 仓，主代理自测；排除 vendor/test）
>
> **11/14 是纯单语言。** 两个多语言反例的机制都与我们不同：
> - **codex**：**Rust 是产品本身**（1,540,578 行 Rust vs 9,221 行 TS——TS 只是 SDK 客户端）
> - **oh-my-pi**：TS 主体 + Rust **进程内 napi 绑定**（`crates/pi-natives/src/` 50 个模块，**10 个 TS 包依赖**）
>
> **我们是「TS 主体 + Rust 独立守护进程」——两边都不像**：没有 oh-my-pi 的零 IPC，也没有 codex 的 Rust 主体地位。
>
> ### 8.6.4 网络研究（TinyFish）的三条关键证据
>
> 1. **Claude Code = 1,884 个 TS 文件 / 512,664 行纯 TypeScript**，且**刻意把 Yoga 重写为纯 TS**，注释写明目标是「**zero native dependencies, enabling single-binary deployment**」；分发靠 **Bun `--compile` 出单二进制**。**即：「要单二进制分发」不构成用 Rust 的理由。**
> 2. Red Hat 那篇「Python→Rust」的核心论点是 **Python 的 GIL**，**不是** Node——Node 的事件循环处理 I/O 密集的 agent 编排无同类瓶颈。
> 3. Rust 在 agent 领域**唯一被反复验证的硬价值是系统级沙箱**（`seccomp-BPF`/`user namespaces`/`Seatbelt`），不是「跑命令」。
>
> **方法论警告**：搜索结果中 `ossinsight.io` 一篇（声称 Q1 2026 有 7 个 Rust agent 仓、597 stars/day）数字形态可疑且无法从一手来源核实，**本文件明确不采信**。
>
> ### 8.6.5 裁决与执行结果（**2026-09-26，已施工**）
>
> 维护者裁定：**「将 Python 和 Rust 都删除」**。已执行完毕并实机验证。
>
> **删除清单**：`packages/rust-core/`（含 603MB `target/`）、`packages/python-eval/`、
> `packages/ts-shell/src/daemon/`（6 文件）、`core/tools/registry-rust-bridge.test.ts`（414 行）、
> `contracts/{rust,python}/`、5 个脚本（`run-rust-command`/`run-python-command`/`run-python-tests`/`verify-rust-execution`/`toolchain` 的对应部分）、
> `RuntimeConfig.daemonEnabled` + `DAEMON_ENABLED` 分支、根 `package.json` 的 6 条脚本与 `rust-core` workspace。
> **新增** `runtime/execution/local.ts`（原 daemon client 的本地实现，去掉 daemon 部分）。
>
> **`service.ts` 的 `if (isRustDaemonEnabled())` 整段删除** → `runCommand` 只剩一条路径。
> **副作用：`onOutput` 不再被丢弃**——它以前只传给 `executeLocally`，而 daemon 分支在它之前 `return`，
> 所以 daemon 开启时实时输出**永远到不了调用方**。
> `ExecutionPath` 收窄为 `'ts-local'`；`CommandExecutionResult` 删掉 4 个 `daemon*` 字段。
>
> **验证（全部实机）**：`tsc` **0 错误**；`validate` PASS；`verify:docs-drift:strict`
> **rules 0 / docs 0 dangling**（修掉 3 处绑定规则引用 + 3 处当前态文档引用）；
> `verify:import-cycles` 0 环；`check:config-consumers`/`check:declarations`/`check:node-floor` 全 pass。
> **P0-A 场景复测**（`HOME=/tmp/fresh2`、PATH 去掉 cargo、无配置）：
> `daemonEnabled` 字段已不存在，bash 命令 **`completed`/exit 0/`ts-local`**（修复前 `success:false, "Cargo executable not available"`）。
> **流式复测**：`[[4,"1"],[308,"2"],[610,"3"]]` 实时到达（修复前 daemon 路径 0 回调）。
> **§1 的 P0-A 因此自动消失**——没有 daemon 就没有 daemon 默认值。
>
> ### 8.6.6 Bun `--compile` 有什么好处（D3 答复）
>
> **有，且正好命中 Rust 被引入时的两个理由**——但是否值得取决于**是否要对外分发**。
>
> | 好处 | 说明 |
> |---|---|
> | **用户不需装 Node** | 单文件可执行含 Bun 运行时——**这正是「用 Rust 出单二进制」原本想要的，用零新语言拿到** |
> | **启动更快、内存更省** | 编译把「读盘+解析+转译」从运行时移到构建时；`--bytecode` 再省一截（官方示例：大型 CLI 冷启动 1.0s→0.53s，启动内存 −40MB） |
> | **交叉编译现成** | `--target=bun-{linux,darwin,windows}-{x64,arm64}[-musl]` 八个目标一条命令 |
> | **可嵌入资源** | `with { type: "file" }` / `--asset` 把主题、技能模板、默认配置打进二进制 |
>
> | 代价 | 说明 |
> |---|---|
> | **产物很大** | Claude Code 的二进制 **224–280MB**；Bun 官方也承认「二进制还是太大」 |
> | **新增构建依赖** | 需在 CI/发布装 Bun（不是运行时依赖） |
> | **运行时加载默认关闭** | `tsconfig.json`/`package.json` 运行时加载默认关；`.env`/`bunfig.toml` 默认开 |
> | **动态入口需显式声明** | 动态 `import()`、`new Worker(path)`、相对路径读文件都要列为入口或 `--asset` |
> | **兼容性未实测** | 我们大量用 `node:` 内建与 `.js` 后缀导入，**没有跑过一次真实构建** |
>
> **建议**：**要对外分发 → 值得做**，作为独立任务（第一步是验证 Bun 能否打包我们的代码）；
> **只在本机/团队内用 → 收益低**（成员已有 Node，多一个 200MB+ 产物与一条新构建链）。
> **无论做不做：不要因为「要单二进制」而重新引入 Rust**——这条理由已被 Claude Code 的实践证伪
> （它 51 万行纯 TS，刻意把 Yoga 重写为纯 TS 以避免原生依赖，然后 Bun 编译成单二进制）。
>
> **未验证项**：Bun `--compile` 在本项目的兼容性、产物实际体积、`--bytecode` 可用性——**均未实测**，
> 是 D3 落地前必须做的第一步。
>
> **与 §1 的关系**：本文件是 §1 的直接延伸。**删除 Rust 执行面后 §1 的 P0-A 自动消失**。
>
> **未验证项**：Rust 沙箱的绕过用例（`[INFERENCE]`，未实构造）、Node 高并发 spawn 上限、
> Bun `--compile` 在本项目的兼容性、产物实际体积、codex/oh-my-pi 的实跑。

> ### 8.7 热路径续研：优化 Rust/Python 能否超过纯 TS（原 §10，2026-09-26 已施工第 1+3 项）
>
> 回答维护者的追问：「不是直接删掉，而是把这两部分**优化**成有价值的资产，这条策略成立吗？」
> **本轮补上了原 §2 缺失的关键证据——实测热路径与实测 Bun 编译。**


>
> 维护者追问：「**不是直接删除，而是优化这两部分，让他们不再是负担而是有价值的一部分**，
> 这条策略成立吗？还是就算优化，价值也不如直接用 TS 重写？」
>
> **先承认 §9 的论证缺口**：§2 证明的是「**现有 1,112 行是负资产**」，
> 不是「Rust 优化后仍不如 TS」。§9 里写了「需先有基准证明 `bwrap` 不够」，
> **但那一轮自己没做基准，也没量化时间花在哪里**。§10 补上。
>
> ### 8.7.1 实测热路径（本仓 2,830 文件 / 28.9MB）
>
> | 路径 | 耗时 | 评价 |
> |---|---|---|
> | **CLI 冷启动（`tsx`）** | **1,370–1,580 ms** | 最大单项 |
> | **`grep` 罕见模式**（`registerTool`） | **1,294 ms** | **真瓶颈**——`grep.ts:104-134` 逐文件串行 stat+read+逐行正则，无早退 |
> | `grep` 宽模式（`function`） | 206 ms | 尚可 |
> | `glob` / `fileWalk` / AST 解析 | 17 / 15 / 163 ms | 快 |
>
> **对照 `ripgrep` 同查询**：`registerTool` **1,294ms vs 10–30ms = 43–130×**。
> **把同一算法改成有界并发 32（仍是 TS）**：**1,211ms → 454ms（2.7×）**。
> **即：先拿 2.7× 是 TS 实现缺陷；剩下的 15–45× 来自 ripgrep 的成熟工程，不是「Rust 比 JS 快」。**
>
> ### 8.7.2 核心发现：参考项目**没有一家自己写搜索算法**
>
> | 参考 | 做法 | 证据 |
> |---|---|---|
> | **Claude Code** | **内嵌 ripgrep 二进制** | `utils/ripgrep.ts:47`「ripgrep is **statically compiled into** bun-internal」 |
> | **pi** | **`spawn(rgPath, args)`**，缺失时**自动下载 rg** | `tools/grep.ts:168`；`:121` |
> | **oh-my-pi** | Rust napi，**但链接的是 ripgrep 的库** | `crates/pi-natives/Cargo.toml`：`grep-searcher`/`grep-regex`/`grep-pcre2`/`ignore`/`globset` |
>
> **oh-my-pi 那行是决定性的**：它的 Rust 价值是**「用 napi 把 ripgrep 的现成库链进进程」**，
> **不是「用 Rust 写更快的搜索」**。**Rust 在这里是原生库的粘合层。**
> AST 同理：Claude Code 用 **tree-sitter NAPI + 优雅降级**（`bash/parser.ts:41` `tree-sitter: unavailable`），
> oh-my-pi 用 `tree-sitter` + `ast-grep-core`。**我们用的 `ts.createSourceFile` 是官方编译器，精度更高，这一项不差。**
>
> ### 8.7.3 Bun `--compile` 实测（§2 的未验证项，本轮跑了）
>
> ```
> bun build …/cli.tsx --compile  →  bundle 750 modules / compile 464ms / 产物 106MB
> 启动: tsx 1,370–1,580ms  |  bun run 270–850ms  |  Bun 编译产物 200ms
> 实机: /tmp/cheers-test-bin --print "run echo BUN_BINARY_OK" → Outcome: success
> ```
>
> **发现一个真实缺陷（仅记录未修）**：编译产物 `--version` 输出 **`version unknown`**。
> 根因：`core/version/current.ts:26-35` 的 `manifestPath()` 从 `import.meta.url` 上溯 6 层找
> `package.json`，而编译产物里它指向 Bun 虚拟 FS（`/$bunfs/...`）。**`--compile-autoload-package-json` 实测无效**。
>
> ### 8.7.4 直接回答维护者的问题（三层）
>
> **① Rust 优化技术上成立**，参考项目正是这么做的。
> **② 但本项目的收益来自「接入既有工具」，不是「用 Rust 写代码」**——
> 三家参考的 Rust/原生价值**全部是「把已存在的成熟实现接进来」**。
> **③ Rust 唯一 TS 拿不到的位置是系统级沙箱**（`seccomp`/namespaces 细粒度策略），
> **但零需求证据**——`bwrap` 能做的已做且工作正常（`sandbox/osSandbox.ts:237`）。
>
> **所以「优化 Rust」在本项目会退化成二选一**：
>
> | 选择 | 拿到的东西 | 成本 |
> |---|---|---|
> | **A. `spawn(rg)`（纯 TS）** | 与 Rust 方案**完全相同的速度** | 低——一个子进程 |
> | **B. Rust + napi 链接 ripgrep** | 同上 | 高——第二门语言、napi 工具链、多平台产物、加载失败处理 |
>
> **A 与 B 终点相同，A 成本低一个数量级。** 这就是答案：
> **不是「TS 写得更快」，而是「TS 可以直接调用那个更快的原生工具，不必自己成为它」。**
>
> ### 8.7.5 建议路线（先便宜后昂贵）
>
> | # | 动作 | 语言 | 收益 |
> |---|---|---|---|
> | 1 | `grep` 改 **`spawn(rg)`**，保留 TS 实现作回退 | **纯 TS** | **1,294ms → ~30ms（43×）** |
> | 2 | 退路：`grep` 加有界并发 | 纯 TS | 1,294 → ~450ms（2.7×） |
> | 3 | Bun `--compile` 单二进制（修 `--version`） | 纯 TS + Bun | 启动 **1,370 → 200ms（7×）**，用户免装 Node |
> | 4 | **条件性候选**：将来需 `seccomp` 级策略时再引 Rust/napi | Rust | 未量化 |
>
> **1 + 3 合起来，用零新语言拿到**：快 43× 的搜索 + 快 7× 的启动 + 免装 Node。
>
> ### 8.7.6 Python：**连优化对象都不存在**
>
> 30 行冒烟测试、`src/` 不存在；评测需求**已被 TS 覆盖**
> （`src/eval/browser/` + `real-shape-coverage.mjs`/`broader-regression.mjs`/`comprehensive-regression.mjs`）；
> Python 的独占优势（numpy/pandas/torch/Jupyter）**本产品一项都不用**。
> 若真要做对标 `inspect_ai` 的评测框架，那是**独立项目**，不是「本产品的一层」。
>
> ### 8.7.7 施工结果（**2026-09-26，第 1 与第 3 项已执行**）
>
> 维护者裁定「执行 1+3」，两项均已落地并实机验证：
>
> | 项 | 修复前 | 现在 |
> |---|---|---|
> | `grep` 罕见模式（`registerTool`） | **1,294 ms** | **53 ms（24×）** |
> | `grep` 宽模式（`function`） | 206 ms | 57 ms |
> | CLI 启动 | 1.91–1.97 s（`tsx`） | **0.18 s**（编译产物，≈10×） |
> | `--version` | — | **`0.1.0`**（编译产物修复前是 `version unknown`） |
> | 需装 Node | 是 | **否** |
>
> **回退路径返回完全相同的行数**（13 / 100），即行为等价的降级而非功能缺失。
> 新增 `core/tools/grepRipgrep.ts`（12 项测试）、`scripts/build-cli-executable.mjs` + `npm run build:exe`、
> `core/version/current.test.ts`（4 项）。
> **施工中发现两处实测事实**：① 必须加 `--hidden`——`rg` 默认跳隐藏目录而我们的 walk 不跳，
> 不加会让两条路径搜索**不同文件集**（实测 2 vs 13 处命中）；② 必须用 `--json`——
> `path:line:text` 无法可靠切分（文件名可含冒号、单文件搜索时 `rg` 省略文件名）。
> 验证：`tsc` 0 错、五道门禁全 pass、聚焦 179 项通过、全量 3715 项 3 failed（**均为既有负载抖动**：
> 隔离复跑全绿、不引用本轮模块、启动时间 A/B 无回归、`log.md` 已记录）。
>
> **未验证**：编译产物的交互式 TUI/Playwright/MCP 功能面、95MB 产物的分发接受度、
> 大仓库（10×/100×）表现、更早 `rg` 版本的标志兼容性（本机 `rg 15.1.0` 无 `--files-from`）。

> ### 8.7.8 复核轮（2026-09-26）：Rust/Python 删除 + TS 重写
>
> 3 个 review 子代理按互不重叠切片并行，其中 2 个在**序列化报告时崩溃**（`JSON Parse error` / `http2 force closed`），
> 探索过程留在 transcript 中并逐条复核；补派 2 个完成覆盖。
>
> **修复 24 项**，其中 **2 个 P0**（CI 执行已删除的 `build:rust`/`cargo build` 步骤 → 每次 push 必红；
> `.cheers.example.json` 仍设已移除的 `daemonEnabled`）与 **6 个 P1**：
>
> | 问题 | 实测证据 |
> |---|---|
> | `runCommand` 不转发 `abortSignal`，Ctrl+C 取消不了命令 | abort 后仍跑满 **5012ms** 并报 `completed`；修复后 404ms 报 `cancelled` |
> | `current.ts` 抛 `ReferenceError`（`typeof` 只保护**直接操作数**，传参即求值） | 独立复现 `__CHEERS_BUILD_VERSION__ is not defined` |
> | **工作区逃逸**：`path="foo/../../outside"` 读到工作区外文件 | `secret.txt:1: SECRET_NEEDLE outside`，`success:true`；**回退路径反而拒绝了它** |
> | 外部 SIGTERM 被误报为 `timeout` | 改为只认自己置的 `timedOut` 标记 |
> | glob 大小写分歧（walk `nocase` vs `rg --glob` 默认敏感） | 同一过滤器两条路径返回不同文件集；加 `--glob-case-insensitive` |
> | `contracts/package.json` 的 `files` 列出已删除的 rust/python 目录 | 发布清单指向不存在的目录 |
> | **文件大小上限分歧**：walk 跳过 >10MB，`rg` 默认照搜 | 11MB 文件 rg 命中 / walk 跳过；加 `--max-filesize` 后两条路径**输出完全一致** |
> | `package-lock.json` 仍声明 `packages/rust-core` 为 workspace 成员 | `npm ci` 会解析已删除目录；已重新生成 |
> | `OWNERSHIP.md` 整章描述已删除的 rust-core / python-eval 所有权 | 已重写为单运行时文档 |
>
> **证伪 1 项**：子代理称信号判断会匹配任意信号名——`===` 是严格相等，实测外部 SIGKILL → `failed`，不成立
> （但同一线索挖出上表第 4 行更窄的真实缺陷）。
>
> **如实记录的未改项**：命令输出无上限累积（200MB 输出 → 堆增长 399MB）。与已删除的 `daemon/client.ts` **逐字相同**，
> 非本改动引入；对照参考实现的滚动缓冲 + 超限转写临时文件是正确做法，但需要改动输出所有权与 artifact 契约，未仓促重构。
>
> 验证：`tsc` 0 错、六道门禁全 pass、`test:scripts` 27/27、契约 7 PASS/6 REJECT、
> 聚焦 **26 文件 / 220 项通过**、编译产物 `--version` 正确且真实 bash/grep 调用成功。
> 每个新增回归测试都验证过「去掉修复即失败」。
>
> **两条路径最终等价性**（实测，行数完全一致）：`registerTool` 52ms vs 1398ms（18/18）、
> `function` 58ms vs 199ms（100/100）、`glob=*.ts` 16ms vs 740ms（12/12）。
>
> **全量套件 540 文件 / 3726 项 / 3 failed**——3 项全在 `cli-baseline.test.ts`，
> **隔离运行 40/40 全绿**且该文件对本次改动模块引用数为 0（已记录的负载敏感子进程用例）。

## 9. Phase 11 续研：08 待办项的深入设计与新发现（**2026-09-26**）

> **见 [`09-gap-followup-design.md`](09-gap-followup-design.md)。零代码改动。**
>
> 08 是**盘点**（哪些缺口存在），本文是**深化**（每项具体怎么改）。沿用 08 的条目编号，不重复登记。
>
> ### 9.1 三项 P0 的当前状态
>
> | # | 状态 |
> |---|---|
> | **P0-A** `daemonEnabled` | **已消除**——随 Rust 执行面整条删除（不是 08 建议的「落回本地」）。实测：全新 HOME、无配置、PATH 无 cargo → `completed` / `ts-local` |
> | **P0-B** `cheers.json` 不被读取 | **确认，但 08 的描述需更正**：它不是「运行时配置放错文件名」，而是**另一套 schema**（`settings.v1.json`，含 `mcpServers`/`skills`/`tui`）。`maxTurns` 嵌在 `model` 下、顶层不存在。**同型第二例**：`.agents/settings.json` 与之**逐字节相同**，同样零读者。故这**不是 3 行修复**，需裁决它该是什么 |
> | **P0-C** 刷新抹掉能力声明 | **确认**，实测：`developer`→`system`、`max_completion_tokens`→`max_tokens`、`vision:true`→`false`，模型 7 字段只剩 4 |
>
> ### 9.2 provider 层（切片 C 完成 + 主代理复验）
>
> - **D1** 死分类器接线：实测它能区分 **auth / 安全拦截 / 限流 / 端点故障** 四类，而活轨把 401/403/400/429/500 **全压成同一句** `Provider HTTP <n>`。pi 的做法是**分类与策略分离**（配额耗尽快速失败、传输抖动才重试）。
> - **D2** Anthropic 缺 `budget_tokens`：pi 发 `{type:"enabled", budget_tokens: …||1024, display}`，且对新模型走 `adaptive`+`effort` 分支。**无账号，400 属 `[INFERENCE]`**。
> - **D3** `thinkingSignature` 被丢弃：pi 是**两半设计**——有签名发 `thinking` 块、**无签名降级为 `text` 块**（流中断时签名会缺）。我们两半都没有。
> - **D4** 无条件 `temperature`：pi 用 `supportsTemperature` **且**在开启思考时也省略。
> - **D7/D9'** token 估算：实测**对内容形态完全不敏感**（拉丁/CJK/JSON 三者同为 `chars/3.5`）。CJK 低估 65–79%、JSON 35–52%。
> - **M1** 权限规则：`allowRules` **0 生产读取者**；Claude Code 的优先级是 `deny > ask > allow > 默认 ask`。
>
> ### 9.3 本轮新增 3 项（08 未记录）
>
> 1. **Anthropic 流内 `error` 事件被静默丢弃**——`applyEvent` 无 `error` 分支，provider 侧错误表现为**「零 token 的正常结束」**。与 `AGENTS.md`「不得把失败伪装成成功态」直接冲突。**成本低**。
> 2. **工具 schema 与系统提示不计入上下文估算**——实测 13 个工具 schema = **8,933 字符 ≈ 2,552 token**、系统提示 ≈ **301 token**，冷启动**漏算约 2,850 token**（两者在 `openaiCompatible.ts:47` 是独立参数，`estimateTokens` 只看 `messages`）。
> 3. **`lsp` 声明但从不读取 `line`/`character`**——实测带位置与不带位置**输出逐字节相同**。系统性扫描 `core/tools/` 全部工具，**此为孤例**。
>
> ### 9.4 证伪与更正
>
> | 项 | 08 原判 | 本轮 |
> |---|---|---|
> | **D6** SSE 事件头被丢弃 | 会破坏帧解析 | **证伪**：OpenAI 不发 `event:` 头；Anthropic 的 `data:` JSON 自带 `type` 且我们按它分派。**该项应撤回**（但同一处发现 §9.3 第 1 条） |
> | **D12** 编辑唯一性 | 泛指编辑路径 | **收窄**：实测**只有单段默认路径**静默改错位置；`replaceAll` 可替换全部，**多段路径已会拒绝**（`edits[0] and edits[1] overlap`）。参考实现（pi 与 Claude Code）**都拒绝任何重复** |
> | **P0-B** 的文件结构 | 顶层 `maxTurns`/`allowRules` | **更正**：嵌在 `model`/`permissions` 下，且是另一套 schema |
>
> ### 9.5 D10 子代理：参考机制已确定
>
> pi 的子代理**把自己的 CLI 作为子进程拉起**（`spawn(execPath, [script, "--mode","json","-p","--no-session","--model",…,"--thinking",…,"--tools",…])`），
> 因此**每个声明字段都流向真实 agent 循环**。我们则读 12 个字段中的 6 个，其余（`tools`/`disallowedTools`/`maxTurns`/`skills`/`effort`/`background`）**从不读取**。
> **建议照 pi 的形状**：子进程跑自己的 CLI——工具集/循环/权限/压缩/记忆全部自动继承，worktree 隔离天然成立，已有 hook 无需改动。
>
> ### 9.6 更新后的建议顺序
>
> 前四项都是**低成本的静默错误**（不报错，只让用户拿到错误结果或错误结论）：
> ① P0-C 刷新抹能力 → ② Anthropic 流内 error 被吞 → ③ D12 单段编辑唯一性 →
> ④ D1 接线死分类器 → ⑤ D4 temperature 门控 → ⑥ D2 `budget_tokens` →
> ⑦ D8 jitter（**存疑，见下**）→ ⑧ token 估算 → ⑨ D10 子代理 → ⑩ P0-B（**需裁决**）。
>
> **存疑**：**D8 的 jitter 是否真需要**——我们的策略是 provider 层 `maxRetries: 0`（**刻意**，模块头有解释）+ turn 层 3 次。
> 若一个回合只发一个请求、无并发扇出，**惊群不可能发生**，jitter 就是照搬。**本轮未查清**，故列 P2。
>
> **未验证**：Anthropic/OpenAI 的 400（**无账号**）、CJK 误差幅度（**本机无分词器**）、
> pi 子代理输出如何流回父级、opencode 39 个服务器的注册细节。
>
> **事故**：`vsllm/gemini-3.8-flash-api` 端点本次 **6 次派遣中 5 次 TLS 失败**
> （`unknown certificate verification error`），与任务无关。A/B 两路结论由主代理亲自完成。

## 10. Phase 11 规划：收口 08 与 11 的未完成项（**2026-09-26**）

> **见 [`phase-11-pre-research.md`](phase-11-pre-research.md) 与 [`phase-11-decisions.md`](phase-11-decisions.md)。零代码改动。**
>
> 08 是**盘点**，11 是**深化**，本阶段是**施工前的定案**。范围 = 08 §6 的 T1–T18
> 与 11 §5 的 14 项**去重**（11 已证伪的 D6、已完成的 P0-A 移出）。
> **13 项施工 + 5 项待维护者裁决。**
>
> ### 10.1 本阶段最重要的产出：推翻 5 处旧记录对参考实现的引用
>
> | # | 旧记录 | 实测 |
> |---|---|---|
> | **C1** | 11 §4.3 建议「照 pi 的形状——子进程跑自己的 CLI」 | pi 的子代理**不在核心**（`core/tools/` 只有 bash/edit/find/grep/ls/read/write），在 `examples/extensions/`；**Claude Code 与 opencode 都是进程内** |
> | **C2** | 08 `M2` 把 pi 的 `detached` 当后台执行的对照 | 它是**进程组管理**（`setsid` + `kill(-pid)`），**从不 `unref()`**，执行仍同步阻塞；真参考是 Claude Code |
> | **C3** | 08 `M9` 说 `@import` 的参考是 pi `resource-loader` | pi **根本没有 import 展开**；真参考是 **gemini-cli** |
> | **C4** | 08 `D9` 未给 Doom Loop 参考 | **pi 没有此检测器**；真参考是 **gemini-cli** 的循环长度 k=1..5 检测 |
> | **C5** | 08 `D7` 把「CJK 低估」列为相对缺口 | **pi 也不特判 CJK**（同样是扁平 `chars/4`）；真缺口是**系统提示与工具 schema 完全不计入** |
>
> **5 处里有 3 处是同一个错误**：把参考项目里**非产品层**的东西（示例扩展、进程组管理）
> 当成了产品设计。据此立本阶段纪律：引用参考时必须写明**它在哪一层**。
>
> ### 10.2 13 项施工（按「静默错误 → 响亮失败 → 能力补齐」排序）
>
> | 序 | 任务 | 类型 |
> |---|---|---|
> | 1 | **T1** `/model refresh` 抹掉能力声明（P0-C） | 静默 |
> | 2 | **T2** Anthropic 流内 `error` 被吞（**实为三处入口**：`error` 事件、`message_stop` 前中断、迭代器异常被吞） | 静默 |
> | 3 | **T3** 编辑唯一性（单段路径静默改错位置，已复现） | 静默 |
> | 4 | **T7** `thinkingSignature`（**11 原列 P2，本轮提前**：它会静默污染对话内容） | 静默 |
> | 5 | **T9** 冷启动漏算（实测工具 schema 8,933 字符 ≈ 2,553 token 不计入） | 静默 |
> | 6–8 | **T4** 接线死分类器、**T5** temperature 门控、**T6** `budget_tokens` | 响亮 |
> | 9–13 | **T8** 重试抖动、**T10** Doom Loop、**T11** 文件去重、**T12** `@import`、**T13** `lsp` 删参数 | 能力 |
>
> ### 10.3 5 项待维护者裁决
>
> **D2 权限规则**（我们**完全没有 deny 概念**，用户无法表达「永远不许用」；
> 但 pi 的立场是「进程边界才是安全边界」——**倾向只补 deny，不做完整规则表**）、
> **D3 `cheers.json`/`.agents/settings.json`**（两份**逐字节相同**、**零读者**、
> **含外部项目名 `.codex/skills`** 且该路径不存在——**倾向删除**）、
> **D4 动态工具装载增量**（pi 的机制是**重放确定性**，前提是工具集**会变**；
> **我们的工具集固定**，照抄是空转——**倾向只处理 `maxSteps` 那一处**）、
> **D5 后台命令执行**（与既有立场冲突；**倾向先查 `processTree.ts` 是否漏了孤儿清理**）、
> **D7 死代码处置**（`plan.md` §2.1「可达性不授权删除」）。
>
> ### 10.4 裁决复核（维护者要求）
>
> `V1Corrections`（5 处更正**全部 CONFIRMED**，0 findings）、
> `V2Provider`（3 项）、`V3Tools`（3 项）——**全部完成**。
> 后两者判 `overall_correctness: incorrect`，核对后**确有 5 处实质错误**，全部已改：
> T10 对 gemini-cli 的描述不实、T10 统一阈值会误报正常节奏、
> T12 包含性语义有偏差、T4 混淆 pi 的两层重试、D1 的理由含范畴错误。
> **期间端点出现 402「账户暂无生效套餐」，`W*`/`X*` 两轮重派 6 次全部失败**，维护者补足额度后恢复。

## 11. Phase 11 施工：13 项落地（**2026-09-26**）

> **裁决见 [`phase-11-decisions.md`](phase-11-decisions.md) §18 的顺序；本段记录施工结果。**
> **5 项待裁决（D2/D3/D4/D5/D7）未动**——需维护者拍板。
>
> ### 11.1 静默错误（不报错却给错结果）
>
> - **T1** 刷新不再抹掉模型能力声明：`dedupeModels` 由「整体替换」改为**按 id 逐字段合并**。
> - **T2** Anthropic 流的三处静默成功全部堵住：流内 `error` 事件、`message_stop` 前中断、
>   以及**迭代器异常被吞掉后正常返回**（最严重的一处——截断的回答看起来像正常结束）。
>   已产出的文本仍保留，但**同时标记为失败**。
> - **T3** 编辑文本出现多次且未设 `replaceAll` 时**拒绝**，并给出两条出路
>   （照 Claude Code 的文案形状，因为我们已有 `replaceAll` 参数）。
> - **T7** `thinkingSignature` 捕获、回传、**无签名降级为 `text`**，外加 `allowEmptySignature` 开关。
>   实测确认我们**会**发送 `thinking:{type:"enabled"}`，所以这是**真实的 400**而非外观问题。
> - **T9** 上下文阈值补上系统提示与工具 schema（实测 8,933 字符 ≈ 2,553 token）；
>   **provider 已报计数时不重复计**，且**不影响切点**（切点只关乎对话）。
>
> ### 11.2 响亮失败与能力补齐
>
> - **T4** 死分类器接线：类别记在失败**旁边**，provider 原话保留。
> - **T5** temperature 在**模型不支持**或**开启思考**时省略。
> - **T6** 每档一个 `budget_tokens`，上限不足时抬高以留出答案空间。
> - **T8** 本地退避**向下**抖 25%；**服务端 `Retry-After` 不抖**（那是指令不是猜测）。
> - **T10** 按循环长度检测交替：k=1 保持阈值 3，k≥2 用 5——
>   `read edit` ×3（正常节奏）不触发，×5 触发。
> - **T11** 未变更文件重复读取返回**指针**而非内容；部分视图不缓存。
> - **T12** 指令文件 `@import` 展开：手扫（跳过代码块）+ **解析符号链接后的包含性校验**。
> - **T13** 删掉 `lsp` 从不读取的 `line`/`character`，描述改为「符号扫描器」。
>
> ### 11.3 每项都有「修复前失败」的回归测试
>
> 13 项共 21 个回归断言组，**逐一撤销修复验证过会失败**。
> 其中 T12 的包含性测试**含符号链接逃逸**用例——那是安全边界，不是可选优化。

## 12. Phase 11 复核轮（**2026-09-26**）

> **剩余 features 清单已并入 [`phase-12-pre-research.md`](phase-12-pre-research.md) §1。**
> 本节只记录复核轮本身。

### 12.1 复核找出的 6 个真缺陷（**施工轮自己没看见**）

| # | 缺陷 | 为什么施工轮漏了 |
|---|---|---|
| **R1** | `compat` 等嵌套对象被整体替换 | T1 只修了**顶层**合并，嵌套那层同型问题没看见 |
| **R2** | 编辑唯一性只在精确路径计数 | T3 修了精确路径，**模糊路径**同型问题没看见 |
| **R3** | `budget_tokens` 抬高 `max_tokens` 覆盖用户上限 | T6 方向对，但**谁优先**判断反了 |
| **R4** | `thinkingSignature` 写进 transcript 却读不回来 | T7 只测**写入**没测**读回**，恢复路径漏字段 |
| **R5** | `~~~` 围栏与四反引号套三反引号未被识别 | T12 的手扫只认反引号且要求等长配对 |
| **R6** | `SimpleRequest` 无法表达「模型不接受 temperature」 | T5 只给完整请求加了门控，**无工具路径**没有开关 |

**共性**：**「修了同型问题的一处，漏了它的兄弟」**。
这是复核最有价值的产出类型——施工轮的测试全绿，因为测的都是修过的那条路。

### 12.2 子代理事故与处置

首轮 3 个 reviewer **全部失败**：各烧掉 30–33 次工具调用后撞上端点 **429 限流**，**零产出**。
重派时**收紧到「最多读 6 个文件、读完立刻 yield」**，两个成功。
Phase 12 的探索同样撞上 429（20–23 次调用后），**处置相同**。

**教训**：子代理任务书必须**限定读取预算**并**要求提前 yield**，
否则额度全花在阅读上，写结论前就耗尽。


## 13. Phase 12 规划（**2026-09-26**）

> **裁决见 [`phase-12-decisions.md`](phase-12-decisions.md)；证据见
> [`phase-12-pre-research.md`](phase-12-pre-research.md)。**

### 13.1 范围

Phase 11 完成的是「已登记为任务的 13 项」，**不是 08/11 的全部缺口**。
`08-*` §4 登记 24 项，只有 16 项被登记为任务，**8 项从未登记**。
剩余 12 项分三类：**可做 4、无环境可验 4、需裁决 6**（详见前置 §1）。

### 13.2 头条发现：`task` 工具的三条坏路径

旧记录说「子代理 `task` 工具不是 agent，是一次 `fetch` 补全调用」——
**正确但不完整**。它是**三条各自独立、各自可修的坏路径**：

| 路径 | 事实 | 性质 |
|---|---|---|
| **一：结构上无法跑工具循环** | `ToolExecutionContext`（`tools/types.ts:7-12`）**没有 `tools` 字段**，所以 `task` 在**类型层面**就拿不到工具集 | 接口缺失 |
| **二：声明的工具边界不生效** | `Explore` 声明 `disallowedTools: ["write","edit"]`，`grep` 显示**只有 loader 内部引用，无执行点** | **安全相关** |
| **三：绕过 provider 层** | 硬编码 `SILICONFLOW_API_KEY` 等环境变量直接 `fetch`；Phase 11 修的 T2/T4/T5/T6 **在这条路径上全部失效** | **回归** |

**且 worktree 是纯仪式**：分配 → 没有任何 agent 在里面执行 → `squashMerge` 合并**空分支** → 删除。

### 13.3 更正的两处旧记录

| # | 旧记录 | 更正 |
|---|---|---|
| **C1** | Phase 11 §15.3 称「无变更则删、有变更则留」是 Claude Code 语义，且「方案 A 是把它接上」 | **我们的实现是「总是合并后删」，与参考语义相反**。参考**不自动合并**：有改动则保留并回报路径（`AgentTool.tsx:667-687`） |
| **C2** | Phase 11 §0 把 D1 记为「做」 | 实际**方向已定、形状待裁决**，未施工 |

### 13.4 复核结果（**2 个子代理**）

`V7Claims` 实测 10 条**事实**断言 → **10/10 成立**；
`V8Decisions` 挑战 6 个**裁决点推理** → **5 条有效**。

**改变了两处结论**：
① **T1 不能独立做**——`taskTool.ts` 的请求体**无 `tools` 字段**，
   子代理本来就没有工具，限制工具是**过滤空集**。**T1 必须与 D1 捆绑**，T2 成为第一项；
② **D2 保留 pattern**——opencode 的 `Rule` 确有 `pattern` 字段，粗粒度 deny 满足不了真实需求。

**教训**：**事实类与推理类复核要分开派**。只验事实会漏掉「事实都对但推论错了」。

### 13.5 裁决结果（**全部已裁定，2026-09-26**）

**维护者裁定**：**D1、D2、D3、D6、D7 全部采纳建议**；**D5 不做**；
**D4 经网上调研后改为「做」**。

**网上调研的结论**：本地 Claude Code 副本（v2.1.88）**确实过时**，官方文档已到 v2.1.198。
最重要的发现是——**我们不需要做参考做的一半**：
指令文件与技能进的是**系统提示**，而系统提示**每次请求重建**，所以它们**天然不受压缩影响**。
**唯一真实缺口是「读过/改过的文件」**，而参考对大文件**就是只回路径**，
所以最小版本**有参考依据**，成本也低（`readCache` 已有大部分状态）。

> 以上为当时的方案依据；Phase18 W7-32已删除read指针去重，当前不再存在该缓存状态，路径恢复机制不依赖它。

顺带发现两个未登记缺口：**plan 恢复**（T6）、**工具结果去重范围**（T7，T11 只覆盖 `read`）。

### 13.6 裁决结果（**全部已定**）

| # | 裁决点 | 裁定 |
|---|---|---|
| **D1** | 子代理改为真 agent | ✅ **做**（与 T1 捆绑） |
| **D2** | 权限规则（含 deny） | ✅ **做**——最小 deny + **可选 pattern**，绕过免疫 |
| **D3** | `cheers.json` / `.agents/settings.json` | ✅ **删除两份** |
| **D4** | 压缩后恢复读过/改过的文件 | ✅ **做**（路径清单，按网上调研改写） |
| **D5** | 中途换模型（= 08 `D11`） | ❌ **不做**（维护者裁定，见 `phase-12-decisions.md` §2.5） |
| **D6** | 后台命令执行 | ✅ **采纳「本轮不做」** |
| **D7** | 死代码处置 | ✅ **采纳「逐簇检查后删」**，从 `core/workflow/` 开始 |

### 13.7 本阶段任务集合（**12 项**）

**P0（3）**：T2 走 provider 层、T3 worktree 语义、D1+T1 真 agent + 边界生效
**P1（2）**：D4 压缩后路径恢复、D2 最小 deny
**P2（4）**：T4 工具消失告知、T5 统一 `allowTools`、D3 删除草稿
**P3（1）**：D7 死代码逐簇处置
**登记（2）**：T6 plan 恢复、T7 去重扩到 `read` 以外

**执行顺序**见 `phase-12-decisions.md` §5。

### 13.8 施工结果（**2026-09-26**）

**9 项全部落地**（T2/T3/D1+T1/D4/D2/T4/T5/D3/D7），另移除子代理三个死字段。

**施工轮推翻了自己计划的两处**：

| # | 计划说的 | 实机核实 | 处置 |
|---|---|---|---|
| **D4** | 「压缩后恢复文件」是缺口，要新建 | **大部分已实现**——检查点已写入读过/改过的文件、跨压缩累积、有上限（200）、能从自身文本读回，13 个测试覆盖 | **真正缺的只有一句话**：`<read-files>` 标签无人解释，模型会误以为自己记得内容。**已补** |
| **D3** | `.agents/workflows/verify.json` 无读者 | **有读者**——`definition.ts:38-47` 读该目录，`/workflow list` 实测列出 | **不删**，更正记录 |

**死代码第一簇**（D7）：按 `plan.md` §2.2 **六项检查**处置 `core/workflow/`，
删除 **5 个模块 / 295 行**（3 个是纯声明、零实现）。
`teamStore` **不在本簇**——它与**活的** messaging 模块一起被测试，不满足「零消费者」。

### 13.9 复核轮（**2026-09-26**）

对 Phase 12 的 8 个实质改动提交做了复核（3 个只读子代理 + 主代理亲验），
**找到并修复 6 个缺陷**，全部复现、全部有「撤销即失败」的测试。
详见 `phase-12-decisions.md` §12。

**其中最重的一个是本轮自己引入的**：子代理的工具调用**不经过任何门禁**
（plan 模式、审批 scope、doom-loop、**用户的 deny 规则**全都不生效），
根因是**两份手写的 gate 选项列表**漂移。修复方式是**消除重复**——
`gateOptionsFor()` 成为唯一来源，子代理的 runner 由 turn 自己组装。

---

### 13.10 08 / 11 的 feature 完成情况总表（**2026-09-26 实测**）

> **编号提示**：本文档有两套 `D` 编号，**含义不同**。
> 上表 §13.6 的 `D1–D7` 是 **Phase 12 的裁决点**；
> 本表的 `D1–D14` 是 **`08-*` §4.3 的缺陷编号**。
> 例：**Phase 12 `D5` = 中途换模型**（= 08 `D11`），
> 而 **08 `D5` = 目录刷新抹掉能力声明**。引用时须带出处。

口径：`08-*` §4 的 **MISSING(10) + DEFICIENT(14) = 24 项**，
逐条**实机核实**当前状态（命令见下）。

#### 已完成（**16 项**）

| 08 编号 | 项 | 核实 |
|---|---|---|
| M1 | 权限规则集 | ✅ **Phase 12 D2**——`denyRules` 可配、绕过免疫、可选 pattern |
| M7 | 未变更文件去重 | **Phase18 W7-32退役**：mtime与session不足以证明内容和可见性，每次read返回当前受限正文 |
| M8 | 压缩后恢复工作文件 | ✅ **Phase 11 T9 / 12 D4**——`fileFootprint.ts`（跨压缩累积 + 说明） |
| M9 | 指令 `@import` | ✅ **Phase 11 T12**——`importExpansion.ts` |
| M10 | 动态工具装载增量 | ✅ **按 `phase-11-decisions.md` §16.3 裁决 (a) 处置**，即 **Phase 12 T4**（末步撤回时告知模型）。**完整机制 (b) 已否决**——它依赖被排除的扩展宿主，`toolsAdded`/`toolsRemoved` 至今为 0 是**裁决的结果，不是遗漏** |
| D1 | `classifyProviderFailure` 接线 | ✅ **Phase 11 T4**——`turn/step.ts` 生产引用 |
| D2 | Anthropic `budget_tokens` | ✅ **Phase 11 T6**——含 `min(ceiling - MIN_ANSWER)` 上限 |
| D3 | `thinkingSignature` | ✅ **Phase 11 T7**——**双向**往返（codec 也带） |
| D4 | `temperature` 条件化 | ✅ **Phase 11 T6 / R6**——`supportsTemperature` 进 `requestShape` |
| D5 | 目录刷新抹掉能力 | ✅ **Phase 11 T1**——`mergeModelEntries` 深合并 |
| D8 | 重试 jitter | ✅ **Phase 11 T8**——`JITTER_FRACTION = 0.25`（只向下） |
| D9 | Doom Loop 交替检测 | ✅ **Phase 11 T10**——`findRepeatingCycle()` |
| D7 | CJK token 低估 | ✅ **与 D9 同根**（08 §4.3 注：D7/D9' 合并为一个修复项）——`RequestOverhead` 计入系统提示与工具 schema |
| D10 | 子代理不是 agent | ✅ **Phase 12 D1+T1**——真循环 + 边界 + **门禁**（复核后补） |
| D12 | 编辑唯一性 | ✅ **Phase 11 T3 / R2**——`countStrategyMatches` |
| D13 | `lsp` 不是 LSP | ✅ **Phase 11 T13**——schema 去掉 `line`/`character` |
| D14 | `grep` 用 ripgrep | ✅ **Phase 11 项 1**——有 `rg` 用 `rg --json`，无则 TS 回退 |

#### 未完成（**7 项**）——**维护者裁定：全部要做，只是推迟**

> **2026-09-26 维护者裁定，推翻此前的「不纳入」**：
> 「为什么 M3 / M4 / M5 / M6 不做？就算没有登陆，你直接照搬 pi 项目或者什么项目的实现方案
> 不就好了吗？」「M2 这是什么判据？pi 项目有我们就做啊」
> 详见 `phase-12-decisions.md` §13。

| 08 编号 | 项 | 状态 | 参考实现（已核实存在） |
|---|---|---|---|
| **M2** | 后台命令执行（detach） | **要做**（推迟） | `pi/packages/coding-agent/src/core/tools/bash.ts` `detached` |
| **M3** | OAuth Device Code | **要做**（推迟） | `pi/packages/ai/src/oauth.ts`、`bun-oauth.ts`；**RFC 8628** |
| **M4** | Bedrock 协议 | **要做**（推迟） | `pi/packages/ai/src/api/bedrock-converse-stream.ts`、`providers/amazon-bedrock.ts` |
| **M5** | Google GenAI / Vertex | **要做**（推迟） | `pi/packages/ai/src/providers/` |
| **M6** | Copilot / Anthropic 订阅 OAuth | **要做**（推迟） | `pi/packages/ai/src/oauth.ts` |
| **D11** | 中途换模型/推理档 | ❌ **不做**（维护者裁定） | `phase-12-decisions.md` §2.5 |
| **D6** | SSE 事件头 | ❌ **08 判断不成立**（已证伪） | `phase-11-decisions.md` §17 |

**验证标准（维护者裁定后）**：**协议/流程层面的单测覆盖**
（请求形状、状态机转换、错误分支），**而不是**「必须拿真账号跑通」。
**「无法端到端验证」不等于「无法正确实现」**——协议翻译是机械工作，
错误恰恰都在形状与状态机上，单测足以覆盖。

#### 结论

**M/D 24 项里完成 17 项，剩 7 项**：

| 类别 | 项数 | 项 |
|---|---|---|
| 完成 | **17** | 见上表 |
| **要做**（推迟，参照 pi 实现） | **5** | M2 / M3 / M4 / M5 / M6 |
| 维护者裁定不做 | 1 | D11 |
| 08 原始判断不成立 | 1 | D6 |

（另：08 §6 的 **T17** 是梯队编号、**不在 24 项之内**，已裁决不做。）

另外，`08-*` §5 的**死代码**还剩两簇未处置：
~~`tools/policy/interception.ts`（411 行）~~（**Phase 14 已删**）与真死文件（35 个 / 6,650 行，**Phase 14 又删 85 文件 / 13,164 行**）。
`core/workflow/` 那一簇**已在 Phase 12 D7 处置**（删 5 模块 / 295 行）。

---

## 14. Phase 13 规划（**2026-09-26**）

**范围**：`08-*` 里维护者裁定**要做**的 5 项（M2/M3/M4/M5/M6），
加 `phase-12-decisions.md` §8 的两个登记项与递归深度。

**文档**：`phase-13-pre-research.md`（4 子代理深探 + 主代理逐条核实）、
`phase-13-decisions.md`（7 个任务 + 5 个裁决点）。

### 14.1 裁决结果

| # | 裁决点 | 裁定 |
|---|---|---|
| **Q1** | M4/M5 用裸 HTTP 还是引入 SDK | **裸 HTTP，且全量实现**（维护者驳回「收窄」后重写）——**本地 `~/projects/oh-my-pi` 就是零 SDK 走通的**，含 AWS 官方测试向量 |
| **Q2** | T6 plan 恢复 | **不做**——**前提不成立**：活轨无 plan 内容概念，`planState` 在死代码簇 |
| **Q3** | T7 去重扩范围 | **不做**——**与参考不符**：参考的 `FILE_UNCHANGED_STUB` 就在 `FileReadTool` 内 |
| **Q4** | R1 子代理递归 | **不改**——**与参考一致**：参考对外硬限深度 1（`USER_TYPE === 'ant'` 才放开） |
| ~~**Q5**~~ | ~~只做简单认证~~ | ❌ **作废**——维护者驳回：「我要的是生产企业级别的项目，不要老是做一些 demo 模块」 |

### 14.2 主代理自查发现的两处

**这是本轮最重要的产出**——我的初稿有两处估算错误，自查后更正：

**更正一：Q1 的成本估算过低。**
我最初写「SigV4 + 事件流解码约 400–600 行」。核实：pi 的 Bedrock **1,345 行**、
Vertex **1,540 行**，**且这还是「用了 SDK 之后」的数字**——
`grep SigV4` 在 pi 的 bedrock 文件里**零实现**，二进制事件流解码
（`bedrock-converse-stream.ts:296`）也全由 SDK 完成，**pi 没有可抄的手写实现**。

**更正二：但有一条显著降低成本的路径。**
Bedrock 支持 **Bearer token 绕过 SigV4**（`:104-108`），
Vertex 支持 **API key**（`google-vertex.ts:27-32`）。
**两个协议都收窄到简单认证路径**，把最贵且最难验证的部分留作后续增量。

### 14.3 待维护者确认

| # | 问题 |
|---|---|
| **死代码** | 两簇（`interception.ts` 411 行、真死 35 文件 6,650 行）是否授权按 §2.2 六项检查逐簇处置？ |

**注**：`interception.ts` 的类型被活文件引用，**不能整文件删**——
这正是 §2.2「删除单元取连通分量整簇」要防的那种「看着像死代码、其实是编译契约」。


---

## 15. Phase 13 施工结果（**2026-09-26**）

**10 项全部落地，零新增依赖**（仍是 6 个）。详见 `phase-13-decisions.md` §9。

| 任务 | 模块 |
|---|---|
| **T4** 契约 | `path` 动态化 + 传输层签名装饰器 + 端点自声明 `signer` |
| **T6a** | `provider/aws/signature.ts`、`eventStream.ts` |
| **T6b** | `provider/aws/credentials.ts`、`profile.ts` |
| **T6** | `provider/endpoints/bedrockConverse.ts` |
| **T5** | `provider/endpoints/googleGenAI.ts`、`googleWire.ts` |
| **T5b** | `provider/google/auth.ts`、`endpoints/googleVertex.ts` |
| **T7** | `providers.ts` 列表派生 |
| **T2** | `core/auth/oauth/deviceCode.ts` |
| **T3** | `core/auth/oauth/subscription.ts` |
| **T1** | `core/shell/background/tasks.ts` + `runInBackground`/`taskOutput`/`taskStop` |

### 15.1 集成（否则就是 demo 模块）

协议写完**不等于可用**，必须接线：catalog 三条 provider 条目、
端点自声明签名器、传输层应用签名、授权层接受「有签名器无 key」、
UI 计数器接真实来源。

**实机验证**：三条 provider 在 catalog 且端点正确；两个新工具在 registry；
后台命令完整生命周期走通。

### 15.2 一个真实约束与一个被推翻的注释

**Node 地板**：`node:zlib` 的 `crc32` 需要 20.15/22.2，**我们地板 20.3** —— 自己写 CRC32。
**一个特性不值得抬高整个包的地板。**

**旧注释变成假话**：`ambientFacts.ts` 说「没有后台命令计数器，因为 shell 没有
detached 执行模式」。**后台执行落地后这是假的** —— 已删并接上真实来源。

## 16. Phase 15：六个缺口收口与两轮复核（**2026-09-28**）

> **裁决见 [`phase-15-decisions.md`](phase-15-decisions.md)；预研究见
> [`phase-15-pre-research.md`](phase-15-pre-research.md)。本段记录施工与复核结果。**
>
> 方法：3 只读子代理分域扫描（TUI 表面 / agent 功能 / 会话生命周期），对照
> `pi`，每条结论经读码或 live 验证后才落盘；预研究已剔除 2 条子代理错误断言。

### 16.1 六个缺口的处置

| 缺口 | 裁决 | 提交 | 结果 |
|---|---|---|---|
| G1 MCP 模型侧调用是假串（转发层返回硬编码成功串 + 生产从不注入 mcpTools） | 做 | `b77e00dc` | registry `execute` 真调 `gateway.invokeTool`；`startTurn` 经 `snapshot()` 真注入；`isError` 按服务器原话回传失败 |
| G2 `/plugin` 无执行引擎 | 缩减 | `8f9897a3` | 诚实的本地声明管理；真加载器独立阶段 |
| G3 sidebar 整层未接 TUI | 接通 | `70e4460f` | 默认视图改 boxed panel（>`PAGER_THRESHOLD_ROWS` → 交互模式全屏）；删 prose 预览器 |
| G4 图片 / LaTeX | 图片做，LaTeX 缓 | `64b7e033` `fc062549` | Kitty `\x1b_G` + iTerm2 OSC 1337；transmit-once / place-on-redraw |
| G5 fork / import / share / name / settings | fork + settings 做 | `56093d22` | `SessionManager.fork` 逐事件重放；`/settings` 面板；import/share/name 记 backlog |
| G6 title / 通知 / bell | 做 | `2edb8aed` | OSC 0 title；`attentionOnIdle` 门控 bell + OSC 777（默认关） |

### 16.2 两轮复核（同型于 Phase 14 D1–D6）

复核方式：子代理分域 + 逐条核实 + **删修复复跑（撤销验证）**。**累计剔除 5 条
子代理错误断言**（Phase 15 预研究 2 条、第一轮 2 条、第二轮 3 条，去重后共 5 类）。

真缺陷与修复（细节见 `phase-15-decisions.md` §7、§8）：

- **P1 输入句柄丢委托**（第二轮发现，子代理全部漏报）：bridge 的
  `pending()`/`clearQueue()` 只读本地 buffer 从不问 run → 中断时用户输入丢失。
  抽 `turn/pendingInput.ts` 单一实现。
- **P1 图片重绘**（第一轮）：`renderUser` 不带 imageId（transmit-once 空转）；
  `swap` 逐 chunk 匹配致续 chunk 成孤儿。
- **P2 图片内存无界 + `placed` 视口化**（第二轮）：无删除序列；滚出滚回重发。
- **P2 fork 丢 title 与来源**（第二轮）：补 `Session.parentSession` 全链路。
- **P2 fork 测试无 HOME 隔离 → `undefined/.cheers` 残留根因**（第一轮）。
- **P2 MCP 快照失败静默**（第二轮）：补 warn。
- **P3 sidebar 码元宽度 / `/plugin` 措辞**（第一轮 / 第二轮）。

### 16.3 本轮新增 backlog（**需独立裁决**）

- **MCP gateway 每 prompt 重建**：`startTurn` 每次 `runPrompt` 一次，故每 prompt
  重新 `snapshot()`，每个 stdio server 每 prompt 一个 `listTools` 子进程。
  复核确认存在。属性能优化非缺陷（stdio 为请求/应答短进程，不累积），
  修它需把 gateway 提升到会话作用域、牵动 `runtimeContext` 生命周期 —— 独立裁决。
- **LaTeX**（G4 缓做）：等模型侧数学输出频率给出证据。
- **`/import` `/share` `/name`**（G5）：`/share` 涉及网络上传与凭据，独立裁决。
- **MCP SSE/HTTP 传输**：`client.ts` 非 stdio 直接抛 `unsupportedTransportDetail`。
- **MCP 工具结果 errorTaxonomy metadata、content-block/图片透传**（第一轮记）。
- **`ToolDefinition.permissions` 是死字段**：21 处声明（`registry.ts` 6 处真实现 +
  各工具 `check: () => []`），`packages/ts-shell/src` 内**零读取者**（`grep '\.permissions\b'`
  非测试命中 0）。真正的审批门在 `turn/tools.ts` → `core/query/toolPolicy.ts`。
  要么接上（让 `pathPermission`/`processPermission` 的结论进入门），要么连同
  `ToolPermissionRequirements` 一起删。21 处的声明接口删除超出复核轮范围，
  且需确认 sandbox 层未来是否要用它 —— 独立裁决。
- **状态栏后台 git watcher / 扩展注入口**：等真实卡顿证据。

### 16.4 文档漂移

`.wiki/features/_index.md` 本节之前止于 Phase 13 —— **Phase 14、15 均未同步本
文件**（log 声称同步过）。本次补记本节；`verify:docs-drift:strict` 的
docs-source 计数为 advisory（118 条，非阻断），未逐条修。

---

## 17. Phase 16：第二轮全面差距扫描（**2026-09-28/29**）

> 前置研究全文见 [`10-gap-and-debt-research-2.md`](10-gap-and-debt-research-2.md)。
> 本轮性质：01–07 与 Phase 0–15 全部收口之后的**第二轮**扫描，
> 目标从「相比 pi 差在哪」转为「**哪些已登记为完成的东西实测仍不成立**」。
> **零代码改动**，只产出分类、证据与方向。

### 17.1 执行方式与两次基础设施事故

3 个只读子代理分域 + 主代理自建**模块可达图**与 12 个探针。

- **上游账户额度耗尽（首次记录）**：W2a（浏览器栈）、W2b（上下文记忆）因
  `402 当前账户暂无生效套餐` 终止；维护者指示改由主代理完成，故本阶段
  绝大部分结论由主代理亲验产出。
- **`content_filter`（第 5 次记录）**：`cli/interactive/**` 切片连续三次被拦截。
  处置照既有结论——该阅读面由主代理亲验。

### 17.2 四项头条：登记为完成／已修，实测仍不成立

| # | 缺陷 | 类别 | 证据等级 |
|---|---|---|---|
| **§1.1** | **项目记忆注入链在生产装配处断掉**：`cliSessionRuntimeFactory.ts:302` 构造 `ShellSessionRuntime` 时**从不传 `projectMemoryStore`**；`createProjectMemoryLocalStore` 生产调用者为 0。实机 `/memory` 全程 `Store mode: disabled` / `Persistence: not enabled` | WIRING | ✅ 模块图 + 实机 |
| **§1.2** | **`/compact` 是 `previewOnly` 报告而非压缩**（`compactCommandContract.ts:48`）；交互路径经 `interactiveCommandRouter` 走真引擎，命令路径走报告。真压缩路径（`core/shell/compaction.ts`）**不派发 `PreCompact`/`PostCompact`**；`reason:"manual"` 零生产调用者 | WIRING + 语义分裂 | ✅ 读码 + 实机 |
| **§1.3** | **`regular` 主屏模式丢失原地增长的内容**（比注释所述更严重）：探针显示流式增长的同一行**根本不会被写**（`mainScreen.ts:110` 的 `content.length <= alreadyWritten` 直接 return）；`suspend()` 后**整份 transcript 重复追加** | DEFECTIVE | ✅ 探针 |
| **§1.4** | **模型侧 `browser` 工具在 Chromium 不可用时返回编造的成功**：6 个动作全部 `success:true`，含 `Simulated click on element 'e1'` | DEMO/欺骗 | ✅ 探针 |

### 17.3 浏览器双栈（§2）

模块图：模型侧 `browser` 工具只到达 **13/162** 个 browser 模块，
`/browser` 命令到达 **160/162**。模型侧**完全绕开**允许清单、出站决策、沙箱授权、
执行确认、回执缓存——而 `core/security/egressGuard.ts:3-8` 的注释声称
「browser allowlist、web fetchers、egress guard **都**问这个」，
**该句对浏览器侧已不成立**（`web_fetch` 确实问了）。
仓库自己的 `browser/runtime/core/directionDecision.ts` 把
`hand-rolled-low-level-runtime` 列为 `rejectedPaths`，而 `sessionManager.ts` 正是它。

### 17.4 其余已核实缺陷

| 面 | 缺陷 | 类别 |
|---|---|---|
| 渲染 | 每帧**三遍全文档遍历**（`rowCount`+`render`+`documentRows`）；实测 20k 块 **48.82 ms/帧**，纯 O(N)；`documentRows` 在默认模式根本不被读 | TUI-UX |
| 主题 | 无条件降 256 色、忽略 truecolor；`hasTrueColor`/`has256Color` 无可达消费者；**`NO_COLOR`/`FORCE_COLOR` 全仓零处理**；`tuiMode:"stream"` 无行为 | TUI-UX |
| TUI | 代码围栏**无语法着色**（pi 有 56 个语法令牌，我们 32 个且无高亮器） | MISSING |
| 会话 | **陈旧会话锁永久阻塞**：探针预置无人持有的 lock → 1218ms 抛错且锁留存；同仓 `browser/receipt/lock.ts` 已有带 `expiresAt` 的正确实现 | DEFECTIVE |
| 会话 | `/todo` 是模块级单例，**不持久化**（跨 resume 丢失，状态条报 0 与事实相反） | DEFECTIVE |
| 命令 | 广告与派发不一致：`statusline`/`status`/`back` 进帮助与补全但不进派发注册表，带参数必报未知命令 | WIRING |
| 命令 | **`CommandDefinition.bridgeSafe` 是死字段**（30+ 声明、零消费者），`/permissions` 声明为真却在非交互被拦（与 Phase 9 S2 同型的第二个） | WIRING |
| provider | OpenAI 兼容流内 `error` 帧被吞（探针：错误夹在增量间仍输出 "Hello" 当完整回答） | DEFECTIVE |
| provider | Google `mapGoogleFinishReason` 把 SAFETY/RECITATION/OTHER 全映射为 `stop`（pi 全映射为 `error` 且穷尽检查） | DEFECTIVE |
| provider | Bedrock 丢图片块、不下发 thinking 预算；Google 尾帧未分隔事件丢失；次要模型调用漏传 `supportsTemperature` | DEFECTIVE |
| 死代码 | 从 CLI 不可达 **46** 个非测试模块：`core/harness/**` 29（位置错）、`test-utils/**` 9（正常）、`edit/patch` 三角 429 行（**真死码，含一套未接线的严格冲突检测**）、`eval/browser/**` 3、`runtimeHandoffProjection.ts` 502 行、`workspaceFileContract.ts` 205 行 | DEAD |

### 17.5 已核实健全（防止未来重查）

主题 token 覆盖（32/32 缺失 0）；transcript 截断行跳过而非致命；
损坏 `state.json` 明确报告并起新会话；编辑的重复锚点**显式拒绝**而非改第一处；
`fileLock` 同链可重入 + 信号量正确释放；18 个钩子事件**全部**有派发点且判定被消费；
所有文本流用 `decode(..., {stream:true})`（UTF-8 跨块安全）；
45+ slash 命令**零桩**（全接真实引擎）。

### 17.6 建议执行序（16-A…16-N，14 项）

详表见 `10-gap-and-debt-research-2.md` §9。前四项：
**16-A 记忆注入链** → **16-D+16-E 浏览器假成功与双栈收敛** →
**16-B `/compact` 合并与钩子** → **16-I `bridgeSafe` 接线或删除**。

### 17.7 本轮边界

`browser/**` 160 个模块的**逐个** real-vs-demo 判定未做（上游 402 中断），
列为下一轮首要任务；交互层键位与文档的双向 diff 未产出（`content_filter`）；
`session/continuation/**`（27 文件）与 `session/recovery/**` 未逐项审计；
真实 provider 端到端未做（无凭据且禁止触碰真实配置）。

---

## 20. Phase 16 复审（2026-09-29）

对抗性复核 Phase 16 全部 17 个实质提交，5 个只读 reviewer 按子系统切片，主代理逐条独立复验。

**确认并修复 10 项**（8 commit）：3 个 P0 在主屏渲染路径（chrome 块被当内容吞掉末行、光标账户每帧重算导致覆盖、
`suspend` 重建 painter 导致整个转录重复追加），3 个 P0 在浏览器与协议边界（页面自发请求完全不经判定、
Anthropic/Bedrock 正常完成被报成 failed、页面首帧提示写两遍），4 个 P1（并行工具丢 metadata、
斜杠 `/todo` 写临时列表、无页面时动作启动浏览器白等 5s、Google 端点丢弃 temperature 声明）。
另有 P2 三项与主代理独立发现的**每帧重复排版**（8000 块 21.2ms/帧）一并修复。

**复验后否决/改判 4 条子代理结论**，记录在 decisions 文档 §6.3，含一条「结论方向对但修法会引入新缺陷」。

**16-F 的第 4 条（按视口裁剪块）仍未做**，reason 与可行形态记在 §6.2——按原写法会破坏选择与搜索。

## 19. Phase 16: gap-and-debt round 2 execution (2026-09-29)

**Scope**: 10 items from [`phase-16-decisions.md`](phase-16-decisions.md), executed in 4 waves.
Zero items skipped; every one committed separately with its own revert verification.

| Item | Commit | One-line outcome |
|---|---|---|
| 16-I | 3 commits | `bridgeSafe` (54 declarations, zero readers) deleted; `/permissions` reachable from a scripted run; `/statusline` became a real command whose write lands in the layer that decides it |
| 16-D+16-E | 3 commits | the browser tool reports what it did instead of `Simulated …` when no browser is running; metadata/private/link-local refused, loopback allowed, redirect landings re-judged; one rule table now feeds both the fetcher's and the browser's policies |
| 16-A | 2 commits | `projectMemoryStore` supplied at both the turn and the command assembly; `/memory save` writes to disk and the next prompt carries `<project_memory_context>` |
| 16-B | 1 commit | bare `/compact` condenses on both surfaces; the checkpoint producer moved from the command to where a condensation happens, so a preview no longer stages an injection; PreCompact/PostCompact dispatch with the trigger reason and a blocked hook aborts before the summarizer is asked |
| 16-K | 2 commits | a refusal is an error rather than a finished answer, in stream frames and both stop-reason mappings; Bedrock sends images and thinking; the compaction request carries the temperature gate; refusals are not retried |
| 16-G | 1 commit | a lock its owner cannot release is recovered: owner recorded, three staleness readings, directory-claimed takeover, notice written beside the lock |
| 16-C | 1 commit | the main screen rewrites rows still on screen instead of never; shrink erases; the fixed block is clamped; suspend restores per mode rather than re-appending the transcript |
| 16-F | 1 commit | the frame carries the document as a function so the alternate screen stops paying for it; five mutation sites routed through the transcript so its row cache stops serving stale rows; `tuiMode: "stream"` gone |
| 16-H | 1 commit | the todo checklist is per session, recorded beside each tool result, replayed from the turns a branch kept — a rewind sees the branch's own list |

**Findings recorded during execution** (details in the decisions doc, one section per item):
- `RESERVED_SHELL_SLASH_COMMANDS` was a hand-kept copy of the command registry, 26 commands adrift — every multi-word slash command in a scripted run was read as a project path.
- `::1` was classified as an IPv4-mapped unspecified address, and `fd00:ec2::254` inherited the LAN's allowance.
- A read-only checkout made the memory store throw instead of refusing.
- The row cache served stale rows after five different mutation sites wrote to finalized blocks.
- The retry matcher retried a safety block, because every in-band failure arrives with a `Network error:` prefix.

**Backlog left open**: automatic memory injection (product-model change), runtime enum validation for config values, an epoch on `state.json` for lock takeover, generic metadata size bounds, Bedrock/Google live-provider credentials for E2E, syntax highlighting, dead code, `NO_COLOR`.

## 18. Phase 16 规划：从 14 个候选中选出 10 项（**2026-09-29**）

> 预研究 [`phase-16-pre-research.md`](phase-16-pre-research.md)、
> 裁决 [`phase-16-decisions.md`](phase-16-decisions.md)。

### 18.1 裁剪结果：14 → 10

**纳入**（按执行序）：**16-I**（`bridgeSafe` 死字段 + `/permissions` + `/statusline` `/back`）
→ **16-D+16-E**（浏览器假成功 + 出站治理，同一提交）→ **16-A**（记忆注入链接通）
→ **16-B**（`/compact` 合并 + 压缩钩子）→ **16-K**（provider 错误保真）
→ **16-G**（会话锁陈旧回收）→ **16-C**（`regular` 主屏记账重写）
→ **16-F**（每帧 O(N)）→ **16-H**（`/todo` 可重放持久化）。

**移出**：16-J 死代码清理（债务非缺陷）、16-L 的 Bedrock 端到端（无账号）、
16-M `NO_COLOR`/truecolor/`"stream"`（P3）、16-N 语法着色（P3 增强）。

### 18.2 预研究的关键参考事实

- **16-A**：**pi 没有记忆子系统**（`grep auto-memory|MEMORY.md` 零命中），
  真正的先例是 **Claude Code**（现行规格：`~/.claude/projects/<project>/memory/`、
  `MEMORY.md` 索引常驻 200 行/25KB、topic 文件惰性、`type` 分四类、记忆豁免清理保留期）。
  我方设计是**显式 `/memory use` 按需注入**，与 Claude Code 的**常驻注入**是不同产品模型。
- **16-B**：pi 是**单一手动入口**（`agent-session.ts:2406 compact()`），
  emit `reason:"manual"` 并派发**可取消**的 `session_before_compact`，
  自动与手动共用底层 `_runDefaultCompaction`。
- **16-D**：`playwright-mcp`/`stagehand` **都**在不可用时**抛错**，从不编造成功。
- **16-C**：pi 用 `captureRenderState`/`restoreRenderState` + `viewportTop`/`hardwareCursorRow`
  差分重写**可见**行；`firstChanged < prevViewportTop` 才整屏重绘；
  **从不查 DSR**（我方注释所说的「DSR 太贵」在两侧都不成立，真实理由是**不需要**）。
- **16-F**：pi 在组件/布局层按视口切片（`scroll-view.ts` 维护 `contentHeight`/`currentScrollTop`）。
- **16-G**：pi 用 `proper-lockfile`；opencode 自建 flock（`staleMs: 60_000` + breaker 目录）。
- **16-H**：pi 的 todo **是扩展**，状态存**工具结果 details**，载入/切分支时**按序重放**
  ⇒ **分支正确**；其 `let todos = []` 也是内存态，持久化来自「结果自带状态」。

### 18.3 主代理在规划中发现的新缺陷（10 号文档未载）

| 缺陷 | 证据 | 归属 |
|---|---|---|
| **render 缓存先于折叠失效** | 探针：20 行 `finalized` 块 `setCollapsed(true)` 后仍 **21 行**；`notify` 改文本后行数仍是旧值（绕过缓存则变化）⇒ **折叠完全不生效** | 并入 16-F |
| **`/clear` 清不掉 regular 滚回区** | `interactiveMode.ts:798-800` 注释称「连终端滚回区一起清空」，实现只有 `transcript.clear()` + 强制重绘，**无清屏序列** | 并入 16-C |
| **5 个写入方改 `finalized` 块** | `turnSink:124`、`toolCards:44/61/67/100/102`、**`pager:28-29`**、**`blocks:336-337`**（后两处为复核补全） | 并入 16-F |

### 18.4 三路复核：18 条断言，**15 条修正**

| 复核 | 切面 | 结论 |
|---|---|---|
| **R1** `R1MemoryCompactReview` | 16-A / 16-B | 6 条：3 条 `correct`，**3 条修正** |
| **R2** `R2BrowserProviderReview` | 16-D / 16-E / 16-K | 8 条：4 条 `correct`，**4 条修正** |
| **R3** `R3TuiSessionReview` | 16-C / 16-F / 16-G / 16-H / 16-I | 12 条：7 条 `correct`，**5 条修正** |

**最重要的一条修正（R2-e）**：主代理初稿断言「更严格的映射不会让安全拦截变成可重试」，
依据是一次**用自造消息**的探针；复核指出 `turn/step.ts:491` 实际产生
**`Network error: …`** 前缀，命中 `RETRYABLE_FAILURE` 的 `/network.?error/i`。
主代理**换用真实消息形状重跑探针证实**：4 个样本全 `RETRY` ⇒
**所有**流内错误会被无差别重试。**探针必须复用生产路径的消息构造。**

**其余关键修正**：`compactCommandRuntime` 是 checkpoint 的**唯一生产者**且有 **4 个消费者**
（不可直接删，须先迁移）；`CommandContext` **够不到会话存储**（16-B 须加接口）；
`setMockHtml` + mock DOM 是**第二条编造通路**；`getPwRuntimeStatus` 是**被动**探测
（报不出启动期失败）；只删 6 处 `Simulated` 不够；
`.agents/memory` 与 subagent 记忆**命名空间冲突**（须再下一层）；
`writeStatusItems` 只写用户配置而 `readStatusItems` 优先读项目配置（**静默被遮蔽**）；
惰性 getter 比 `needsDocumentRows()` **更简**；租约锁**无 fencing**，须如实降级其保证。

### 18.5 下一步

按 §3 的四波执行序施工；每波跑 5 门禁 + `test:scripts` + 改动域测试；
每波末位完成后同步本文件与 `log.md`。
---

## 21. 常驻登记册建立：`11-feature-and-defect-register.md`（**2026-09-29/30**）

> **维护者指示**：`10-gap-and-debt-research-2.md` 的研究面太窄——它只为 Phase 16 服务。
> 要的是**专门用来记录 feature 与不足的文档**，不是某一个 Phase 的前置研究。
> 故新建**常驻总账** `11-feature-and-defect-register.md`，从此往后追加而不重写。
>
> **与 08 / 11 / 12 的根本区别**：那三份是**某一轮**的盘点（08 = Phase 11 的盘点、
> 11 = 08 待办项的深化设计、12 = Phase 16 的预研究），阶段结束即归档；
> 11 号**不服务任何阶段**，已修复的条目标注状态而不删除，
> 以免同一个缺陷在两轮之间被反复「重新发现」。

### 21.1 本轮的做法

**三波共 9 个只读子代理**（并发上限 3），主代理自建**模块可达图**
（值边 / 类型边分列，从 `entrypoints/cli.tsx` BFS）与 `npx tsx` 行为探针、
隔离 `HOME` 的真实 CLI/PTY 实机。**零代码改动**。

**事故：成功 4、失败 5**（两类都是本仓已多次记录的）：
- **`content_filter` 第 7、8 次**——浏览器栈切片与 provider 切片（凭据相邻读面）。
  按既有结论**改由主代理亲验**；provider 那路的证据笔记本抢救出来了。
- **上游额度耗尽（402）第 2 次**——最后三个并发**同时**终止，**无产出**：
  平台集成、上下文记忆、工具执行三节因此**只覆盖主代理亲验的部分**，
  在正文里逐节点明，不假装完整。

### 21.2 十二域的登记结果

| 域 | 条目数 | 其中 P0/P1 |
|---|---|---|
| `TUI` 渲染与交互 | 9 | 1（TUI-01 `regular` 丢高亮/选区/滚动条） |
| `THM` 主题与色彩 | 8 | 2（THM-01 truecolor 从不询问、THM-02 全局复位破坏嵌套样式） |
| `CMD` slash 命令 | 8 | 1（CMD-01 引号参数全仓失效） |
| `BRW` 浏览器 | 6 | 1（BRW-01 请求守卫是页级的，弹窗不过判定） |
| `SES` 会话持久化 | 8 | 1（SES-01 用户键入的 `/todo` 不落盘） |
| `PRV` provider | 11 | **3**（PRV-07 部分输出后整段重跑；PRV-08 Google 丢图片；＋ 一条 `CORRECTED`） |
| `CTX` 上下文记忆 | 9 | **2**（CTX-06 只读文件抛未捕获 EACCES；CTX-07 JSONL 一行损坏则整体抛） |
| `TOL` 工具与执行 | 9 | 0（五条 P2，含多文件无事务、读后写无复核） |
| `OBS` 平台集成 | 10 | 1（OBS-04 MCP 网关每 prompt 重建） |
| `LOP` 内核循环与守卫 | 5 | **1**（LOP-05 由「健全」更正为「有缺口」） |
| `CLI` 入口 | 1 | 0 |
| `BLD` 构建与发布 | 2 | 0（两条 P2） |
| `CDE` 死代码 | 6 | 1（CDE-03 834 行进程内沙箱从未实例化） |
| **合计** | **93** | **14** |

> **第二轮（同日，模型换成 `google-antigravity/gemini-3.8-flash:high` 后）**：
> 重派的三个切片全部返回，**新增 11 条**（含 3 条 P1），并**推翻主代理自己 2 条**
> （`TOL-02` 判决由「接入」翻为「删除」——生产实现更强；
> `LOP-05` 由「已核实健全」更正为「有缺口」——内层 `!shownAnything` 守卫只管内层）。
> 至此**全部 12 个切片完成**。
>
> **补做轮（同日）**：子代理全部因上游 402 终止后，主代理自行补完
> **内核循环（§8bis，此前零覆盖）**、**浏览器逐模块分类表（BRW-00，此前 3 轮未产出）**、
> **全工具 schema 字段核对（TOL-04，判定无缺陷）**、**MCP 错误分类（OBS-07）**、
> **日志轮转（OBS-08/09）**、**技能发现（OBS-10）**。
> **三项明确未完成**（见 11 号文档 §18，不冒充完成）：provider 逐字段请求形状表、
> `memory`/`context` 逐模块审计、编辑路径原子性与读后写竞态。
> 期间**更正了自己三处**：TOL-01 被误标为「第二次出现」（实为 Phase 15 已登记的
> CARRIED-OVER）、浏览器表初版被误标 17 个死模块（实为 **5** 个——
> 「两条路径都不经过」≠「没有入口」）、
> **探针自身出错**差点导致撤销一条真缺陷（OBS-06 `/report` 泄漏绝对路径；
> 手写 ZIP 解压返回 0 条，真实 `unzip` 解出 5 个 —— 「探针返回空」与「目标为空」
> 在输出上不可区分，必须交叉验证）。

### 21.3 四项头条（维护者点名的九类各自落点）

1. **CMD-01 引号参数**——`slashRouter.ts:15` 的 `split(/\s+/)` 让**全部 56 个命令**
   的带空格参数失效（实测 `/theme "Dark Mode"`、`/cd "dir with spaces"`）。
   **单点修复、全局收益**，列为第一档第一项。
2. **BRW-01 请求守卫是页级**——`sessionManager.ts:416` 的 `page.route` 只覆盖**一个页面**，
   而 `:179-199` 的注释宣称「context-wide … every page and popup inherits it」。
   `PwBrowserContext` 连 `route` 都没声明 ⇒ 页面开出的新页面/弹窗**完全不过出站判定**。
   **本轮唯一一条「绕过判定」的缺口**。
3. **TUI-01 `regular` 适配的核心缺失**——`pane.ts:142` 的 `documentRows` 是**裸渲染**，
   不带搜索高亮、选区反显、滚动条。探针实测：备用屏有 `\u001b[7m` 与滚动条，
   `documentRows` **两者都没有**。维护者点名的「`regular` 还未开始适配」正是这件事。
4. **CDE-03 834 行的进程内沙箱从未被实例化**——`sandbox/{sandboxPolicy,sandboxEnforcer,
   escalationWorkflow,auditTrail}.ts` 只被彼此引用；活的沙箱是 `osSandbox.ts`（bwrap）。
   而 `sandbox/index.ts` 的 `EscalationPrompt` **被 17 个文件按类型引用** ⇒
   **不能整文件删**——这正是「编译契约而非死码」的实例。

### 21.4 本轮证伪 4 条子代理断言

记录在 11 号文档 §12bis。最值得记的是两条**同型错误**（读旧文档而不回到当前代码）：
`W1TuiSurface` 引用了**已不存在的符号** `alreadyWritten`（Phase 16 的 16-C 已重写），
并把 `/help` 只列 4 个键的**有意设计**读成遗漏；
`W2ProviderProtocol` 断言「拒答会被重试」，**探针实测为 NO-RETRY**。
教训与既有的「探针必须复用生产路径的消息构造」是同一件事的另一面：
**引用必须重新解析，不能沿用文档里的行号与符号名**。

### 21.5 已复核为**健全**的项（防未来重查）

| 面 | 结论 |
|---|---|
| 16-A 记忆注入链 | **已接通**（两条装配路径都在） |
| 16-B `/compact` 合并与钩子 | **全部成立**，两条路径共用同一 lifecycle builder，三种 `reason` 都有生产者 |
| 16-K provider 修复 | **七项全部成立**，无回归 |
| 上下文记账 | **已含系统提示与工具 schema**，且 provider 实测值优先——Phase 11 的缺口已闭合 |
| 编造的成功 | 浏览器的 6 处 `Simulated …` **确已删除**；`/plugin` 是**诚实**的登记簿 |
| 沙箱不可用时 | `planSandboxedCommand` 的三种状态**如实上报**，不静默降级为无隔离 |
| 流式解码 | 全部文本流用 `decode(..., {stream:true})`；Bedrock 二进制帧先 CRC32 校验 |

### 21.6 下一轮的首要任务（本轮未覆盖，见 11 号文档 §13.2）

`browser/**` **164 模块的逐个** real-vs-demo 判定（自身子代理死于 `content_filter`）；
每个内置工具的**逐字段**核对；编辑路径的多文件原子性与读后写竞态；
执行运行时的超时/上界/进程树回收；MCP 错误分类与技能发现优先级；
日志轮转正确性；`core/shell` + `core/query` + `turn` 的完整审计。

---

## 22. Phase 17 规划：前置研究与裁决（**2026-09-30**）

> 文档：[`phase-17-pre-research.md`](phase-17-pre-research.md)（参考实现机制研究）、
> [`phase-17-decisions.md`](phase-17-decisions.md)（38 个交付项 / 6 波 / 4 项独立取舍；实施与验证记录见该文）。
> **零代码改动。** 输入是 11 号登记册的 **70 条 OPEN**（12 P1 / 45 P2 / 11 P3）
> 加 `phase-16-decisions.md` §4 移出的 16-J…16-N。

### 22.1 与前面各阶段的区别

前几份文档（08/11/12/13）是**盘点**——哪里有缺口、证据是什么。
本文档是**设计级研究**——参考实现**到底怎么解决的**、我方缺口精确在哪、按什么形态改。
所以每条都给出 `<repo>/<path>:<line>` 与关键代码引文，
并在参考没有对应机制时**明标 `自研`**，不伪装成「对齐参考」。

### 22.2 五波与规模

| 波 | 主题 | 项数 |
|---|---|---|
| **W1** | 错误承诺与单点全局收益 | 9 |
| **W2** | **TUI 主屏收敛（P1，结构最大）** | **8** |
| **W3** | 色彩管道与主题（含一次依赖裁决） | 5 |
| **W4** | 未捕获异常与数据丢失（P1 集中） | 6 |
| **W5** | 流式与重试语义（P1 集中） | 5 |
| **W6** | 债务与可达性（逐个闭包核实） | 5 |
| **合计** | | **38**（+ 22 移出 + 6 不做 + 4 待裁决） |

### 22.3 前置研究的六项关键发现（全部主代理亲验）

1. **pi 的主屏只有一条渲染路径**（`tui-main-screen.ts:264` 的 `this.render(width)`）
   ⇒ 我方 `documentRows` 的**裸渲染**是自造的第二条路径，这就是 `TUI-01` 的病根；
   修复不是「给 `documentRows` 加参数」而是**收敛成一条**。
2. **pi 的重试在会话层，不在 agent 循环**：`agent-session.ts:3684-3685` 的
   `_omitRecoveryAttempt` 用 `appendContextEdit(targetId, null)`
   **持久地把部分输出从模型投影里去掉**（`session-manager.ts:519-524`：
   `if (replacement === null) return []`）。
   ⇒ `PRV-07`/`LOP-05` 因此有两条路：(a) 学参考做抹除+重试；(b) 已显示过就不重试。
3. **pi 的 edit 与我方同构**（`edit-diff.ts:341-349` 的区间重叠检查与我方
   `editEngine.ts:430-441` 同一写法）⇒ 给 `TOL-02` 的「**删除** `edit/patch` 三角」
   加了**参考侧佐证**，不再是仅凭我方内部比较。
4. **pi 没有浏览器工具**（只有 `open-browser.ts`），且
   `playwright-mcp` 源码**不在本地**（`src/README.md` 指向上游 monorepo）
   ⇒ `BRW` 一节的参考基线要重定；`stagehand` 的 `page.route` 也是**页级**。
5. **主题**：Draft-07 schema + `vars` 变量（带循环检测）+ **OSC 10/11 + DEC 2031**
   探测外观 + WCAG 对比度判 dark/light；**56 令牌**。
6. **语法着色**：`highlight.js@10.7.3`，`lib/core.js` + 21 个 eager 语言 +
   `setImmediate` 懒加载其余（**失败也降级**）+ **自写 HTML→ANSI**
   （不依赖 hljs 主题系统）。

### 22.4 复核结果：7 处实质改动 + 1 处推翻主代理

3 个证伪式复核者，**32 条断言：correct 22 / partly-wrong 8 / wrong 1 / unverifiable 1**。

**唯一一条 `wrong` 打在主代理身上**（`BLD-02`）：
我曾断言「删三个入口 shim 会让 `verify:docs-drift:strict` 的 `rules_dangling` 变红，
所以要先同步 `docs/` 的 6 处引用」。复核者指出
`verify-docs-and-rules-drift.mjs:44` 的 `RULES` **不含 `docs/`**，
且被引文档在 `DOC_STATUS.md:38,41` 标的是 **`superseded`** 而非 `active`。
主代理读码确认**复核者对、自己错** ⇒ **真正要同步的是三个测试**。
**11 号册同一处错误已一并更正**——教训：**门禁的判定范围要读源码，不能从名字推断。**

**其余 6 处改动**：`CMD-01` 的「单点修复」不成立（下游二次切分）；
`CMD-02` 需补非交互分支；`OBS-08` 应照抄同仓已有的 `readMetricLines`；
`PRV-09` 必须**扩展** `REFUSAL` 正则（探针实测现有正则不匹配两个新值）；
`SES-01` 通用通道成本高于特例；`THM-02` 的 `style()` 无法表达行级背景；
`BRW-01` 的初稿选项自相矛盾（弹窗必须 context 级才能观察）。

**本轮没有推翻复核者**（前几轮每轮 4-6 条），原因记在 decisions §7.3.4：
brief 把证据门槛写死（无 `file:line` 的 `wrong` 无效、探针返回空必须换方法复核），
且要求复核者**自己跑探针**——`CTX-06` 的 EACCES 与 `OBS-06` 的归档泄漏
都由复核者独立复现，不是读码推断。

---

## 23. Phase 18 规划：前置研究与裁决（**2026-10-01**）

> 文档：[`phase-18-pre-research.md`](phase-18-pre-research.md)（参考实现机制研究）、
> [`phase-18-decisions.md`](phase-18-decisions.md)（**33 个交付项 / 7 波 / 2 项待裁决 / 4 项明确不做**）。
> **零代码改动。** 输入是 11 号登记册当前 **23 条唯一 OPEN**
> （其中 21 条从未被任何阶段规划过 + 1 条 Phase 17 之后新登记 `PRV-12` + 1 条裁决保持 OPEN 的 `SES-02`）
> 加 `10-gap-and-debt-research-2.md` §10 的四项未覆盖面。

### 23.1 与 Phase 17 的关系

Phase 17 把 11 号册的 **12 条 P1 全部纳入**并实施了 38 个交付项。
本文档处理**剩下的 P2/P3 与两条从未被规划的域**，并**顺带补上 Phase 17 的一个文档缺口**：

**§1.2 声称「移出（更后阶段）22 项」，但那份裁决通篇没有枚举这 22 项。**
本文用「规划时点 OPEN 集合 − decisions 全文出现过的 ID 集合」重算，
把清单显式列出（`phase-18-pre-research.md` §0.1），净 **21 条**。

### 23.2 六波与规模

| 波 | 主题 | 项数 |
|---|---|---|
| **W1** | 单点高收益与错误承诺 | 6 |
| **W2** | 会话树入口与命令面收口 | 4 |
| **W3** | 进程级状态的生命周期 | 3 |
| **W4** | 原子性与持久化 | 3 |
| **W5** | 文档与自研修复 | 6 |
| **W6** | 登记册自身的修正 | 2 |
| **W7** | 跨轮次遗留的审计债务（**2026-10-01 补入**） | 9 |
| **合计** | | **33**（+ 4 明确不做 + 2 待裁决 + 0 待外部输入） |

### 23.3 前置研究的六项关键发现（全部主代理亲验）

1. **`TOL-07` 是「参考侧唯一明确更优」的执行安全项**：
   `opencode/packages/core/src/file-mutation.ts:144-157` 在**锁内**重读并逐字节比较
   （`sameBytes` → `StaleContentError`），而 `pi` 与我方**都不做**。
   关键领悟：opencode 的锁**同样是进程内的** ⇒ **跨进程防护靠的是写时比较，不是锁**；
   我方有「进程内队列」这一半、缺「写时比较」那一半。
2. **`CMD-04` 的判定位置是四方里唯一的**：Claude Code 用 **per-command 声明字段**
   （`types/command.ts:76` + `main.tsx:2622` 唯一过滤点），gemini 由**返回类型**决定，
   pi/opencode 的内建命令在非交互路径上**根本不存在**；只有我方把判定写在**派发处的 if 链**里。
3. **`CMD-06` 是「功能在、入口无」**：我方的 `rewind` 宿主
   （`interactiveMode.ts:731-750`：叶重指 + 分支摘要 + 提示放回）与 pi 的
   `session.navigateTree`（`agent-session.ts:3866`）**同构**，缺的只是一等命令入口与非交互形式。
4. **`SES-02` 的 fencing 在所有参考里都 `NOT-FOUND`**：`proper-lockfile` 只有 mtime staleness +
   续期 + `ECOMPROMISED`；opencode 的 `staleMs` 与我方**同为 60_000**，token 只管 release。
   ⇒ 我方「no fencing」的自白即行业水准；真实差距只是**续期**与 **release owner 校验**两条。
5. **`OBS-04`(MCP) 比登记册更严重**：`core/mcp/client.ts:198` 的 `spawn` 在 `callStdioWithRetry` 内，
   `listTools` 与 `invokeTool` **都**走它；且 `gateway.ts:186` 的 `invokeTool` 每次先跑一次 `listTools`
   ⇒ **每 prompt = 1 + 工具调用数 × 2** 个子进程。pi 是**会话生命周期持有一条长连接**。
6. **`LOP-01` 的阈值不是缺陷**：opencode 的 `DOOM_LOOP_THRESHOLD` **同为 3**；
   唯一确认的缺陷是**消息宣称了它没有做过的判断**（`without state progression`），
   参考要么不宣称（opencode 转用户裁决）、要么真正读了结果（gemini 的诊断 LLM）。

### 23.4 复核结果：4 条 `partly-wrong`、**0 条 `wrong`**

3 个证伪式复核者，**25 条断言：correct 21 / partly-wrong 4 / wrong 0 / unverifiable 0**。
**本轮没有推翻主代理**（Phase 17 有 1 条），但 **4 条 `partly-wrong` 中有 2 条推翻了我的依据**：

- **`CTX-08` 的面数**：登记册的「6」把自己标 ✅ 的对照行算进了缺陷侧，而我写的「5」其表格只列了 4 行。
  复核者按口径拆开 ⇒ 定稿为 **4 个同型 + 3 个部分派生 + 1 个模型面**。
- **`ok: true` 分布代理**：我写「23 个模块、全部在夹具侧」，实为 **25 个模块、其中 2 个在模型侧
  真实执行路径上**（`sessionManager`、`playwrightRuntime`）。⇒ 该依据被**删除**，
  判决改由「定位裁决」支撑。教训：**同一个字面量在不同定位下含义相反**，拿它当 demo 判据是「只看了一层」。
- 另两条只纠正引文精度（`rollback` 的 38/26/12 分解）与成本理由（`SES-02` 的「与迁移」半站不住）。

**复核者还加重了 3 条**（缺口比我写的更大）：`OBS-04` 的 spawn 公式、
`SES-07` 的**第二条绕过路径**（`sessionLifecycleWrites.ts:214` 的 `discardIfEmpty` 直连 `store.deleteSession`）、
`SES-06` 的活轨调用点（格式化器仍在用，要删的是恒空的规则表）。

**复核者独立复现的证据**：`CLI-01` 的 0 行 JSON / 105 行输出、
`CMD-04` 的命令拦截、`CTX-02` 的两面自相矛盾陈述、**人工构造父子环**后
`readSessionTree` 与 `sessionThreadPath` 给出**相反结论**、键位两表零漂移（71/71 通过）。

### 23.4b W7：一处统计盲区（本轮自查发现）

**初稿只统计 11 号册的 `OPEN` 条目，于是漏了 9 项**：

- **`THM-03` 标 `PARTIAL`**（Phase 17 只做了 schema+校验，`auto` 与扩充令牌「按裁决延期」——
  那个延期**从未落到任何阶段**）⇒ **`PARTIAL` 不是 `OPEN`，被筛选跳过**。
- **`SES-08` / `PRV-06` / `BRW-06` 三条「未逐一核验的面」按设计不带状态标记** ⇒ 同样被跳过。
- 另有 5 项散落在 11 号册 §13.2 / §16.4 / §18 的散文里
  （`memory/**`+`context/**` 逐模块、`core/shell` 审计、`context/startup` 行为验证、
  子代理递归与工具继承、TLS/HTTP2 流边界）。

**教训**：**「统计 OPEN」不等于「统计未完成」**——`PARTIAL`、无状态标记的「未核验」条目、
以及散文里的「仍然未覆盖」列表，三者都要单独数。已补入 **W7（9 项）**。

**其中一项主代理初查就已推翻**：`W7-30`（子代理工具继承）——`core/subagents/runner.ts:135-142`
已经在用 `subagentTools(definition, available)` 过滤并装配工具，
`NEVER_GIVEN`（`core/subagents/boundary.ts:17`）剥掉 `task`。⇒ 该项可能直接降级为「已核实健全」。

### 23.5 真实 provider 验证：**已执行**（2026-10-01）

维护者提供中转站 `https://ai.onyxaxis.org/v1` + `ONY_API_KEY`。探测结论：
**OpenAI 兼容 ✅ / Anthropic 原生 ✅ / Google 原生 ❌（405）**。
实测解除两条 `[INFERENCE]`（`D2` `budget_tokens`、`D4` temperature —— **本中转站都不触发 400**，
但**不能据此说不必修**：中转站做了协议适配，官方端点仍未知）；
`PRV-12` **无法验证**（Google 路径 405）。

**仓库门禁实际通过**：`verify:provider-readiness:real` 两项 `[pass]`；
另跑通两个**真实**端到端回合——纯文本 `PONG` 与**工具调用**（`read note.txt` → 正确内容，
`Outcome: success`，exit 0）。**这是本仓第一次用真实端点跑通多步工具回合。**

凭据只写入 `~/.cheers/config.json`（`chmod 600`），**未进入仓库**。

**关于 OAuth**：中转站**不该**走 OAuth（它的价值就是免 OAuth）；
`deviceCode.ts` 与 `subscription.ts` 都已实现，但那是**直连上游订阅**的路线，
与本中转站是两条独立路线。

### 23.5b 真实 provider 验证：原始待办记录（已作废）

**维护者将在本轮之后提供中转站 URL + key。** 文档已把该项登记为**待办**（不是裁决），
并写明三条**前提**（需要哪些协议路径）、两条**给 URL/key 也解除不了的**（`M3` Device Code、
`M6` 订阅 OAuth、16-L Bedrock 端到端），以及两条实操约束（CLI 无 `--base-url`/`--model`；
catalog 外的 model 会退回 `DEFAULT_REQUEST_SHAPE`）。

---

## 24. Phase 18 复核轮：裁决修正 + W8 新增（**2026-10-01**）

> 文档：[`phase-18-decisions.md`](phase-18-decisions.md) **§10**、
> [`phase-18-pre-research.md`](phase-18-pre-research.md) **§12**、
> [`11-feature-and-defect-register.md`](11-feature-and-defect-register.md) **§20**。
> **零代码改动。** 3 个探索子代理（`google-antigravity/gemini-3.8-flash:high`，并发 3，3/3 返回）
> 分域证伪 Phase 18 的裁决并搜索「文档没有涉及」的 demo 面；主代理逐条亲验。

### 24.1 结果一览

| 项目 | 数量 |
|---|---|
| **裁决修正** | **4**（`W7-30` 翻转为缺陷、`W5-19` 扩大范围、`W3-11` 前提缺失、`W4-14` 补第三条） |
| **新增登记条目** | **20**（11 号册 §20.1；含 **2 条 P1**） |
| **新增交付项** | **W8：11 项 + 8 小项**（`phase-18-decisions.md` §10.2/§10.3） |
| **新增待裁决** | **R3**（MCP 协议互操作） |
| **驳回的子代理断言** | **8**（11 号册 §20.3，含 1 条不存在的函数名） |

### 24.2 两条 P1

- **`PRV-13`**：`googleGenAI.ts:28` 主流式 `path` **缺 `?alt=sse`**（同仓 `googleVertex.ts:78` 有）
  ⇒ Google AI Studio 主流式回合**静默空答案**；`googleGenAI.test.ts:65-67` 把错 URL 钉进了测试。
- **`OBS-15`**：`core/mcp/client.ts:44-55` 用**自定义信封**而非 JSON-RPC 2.0，
  代码自述「**cannot talk to a third-party server**」⇒ MCP 连不上真实生态（`R3` 待裁决）。

### 24.3 三条新的 demo 判据（比「`ok:true` 分布」更有辨识力）

1. **机制宣称 vs 实际机制**：命令帮助/报告正文的机制词在实现里找不到对应（`/deep-research` 的「多智能体」）。
2. **同类端点的差集**：同仓两个 Google 端点，一个带 `?alt=sse` 一个不带 ⇒ 直接暴露缺陷。
3. **常量关系**：两处各自正确、合起来矛盾且**无测试钉住**（`SES-09` 的 `1.2s vs 60s`、`TOL-12` 的两张表）。

### 24.4 方法论

**否定式断言（「从未被调用」「丢参数」）必须自己再 grep 一遍**——
本轮 8 条驳回里 4 条属此类，含 1 条**不存在的函数名**（`retrySentRequest`）、
1 条**读错调用链**（`/compact` 其实在两个入口都被拦截）、1 条**没验证复原逻辑**（CRLF）。
