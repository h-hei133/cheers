---
title: "功能开发：pi 对照总索引"
category: article
sources: [pi-source-2026-09-20, repo-audit-2026-09-20, phase-5-pre-research-2026-09-23, phase-6-pre-research-2026-09-23, phase-6-execution-2026-09-24]
created: 2026-09-20
updated: 2026-09-23
tags: [features, gap-analysis, pi, index]
summary: "功能开发前锋探索的总入口。对照本地参考仓 pi，把能力缺口按七个切片分类登记：共 40 项 DEFICIENT、38 项 MISSING、16 项 OURS-ONLY、7 项平手。Phase 0–5 已闭环；Phase 5 的前置研究、裁决、施工与复核均已完成（7 项任务 + 22 项补充裁决），核心是删除 32 文件 / 8,330 行的零消费者「报告投影族」、补上缺失的重试与错误分类、并让 compat 标志真正改变请求形状。裁决经五个独立复核者证伪式复核，推翻主代理 4 项错误（含 T2 闭包方向算错，数字从 36/10,008 更正为 32/8,330）；施工后的复核轮再发现并修复 8 处缺陷，其中一处让每个致命崩溃变成进程带病继续运行。Phase 6 **已完成**（T5a 回写 25 行滞后判定 + T1 HTTP 超时接线 + T2 metrics 采集与读取 + T3 用量按模型分桶 + T4 `/report`），四项代码任务全部有反向验证与实机验证。Phase 6 前置研究与裁决（零代码改动）：重新盘点发现 44 个看似开放的条目里 25 个已实现但未标注，真正仍开放 10 项，其中 3 项是行为缺口（HTTP 超时未接线、metrics 采集面为空、用量记账不按模型分桶）；两个复核者各覆盖一半、均判 incorrect，共推翻主代理 9 处。"
confidence: high
---

# 功能开发：pi 对照总索引

> **本目录的用途**：重构已收口（见 [`../refactor/plan.md`](../refactor/plan.md)），下一步进入功能开发。
> 本目录是**功能开发方向的证据基础**——不是路线图，不是排期，是「我们的功能相比参考实现差在哪」的分类清单。
>
> **本轮性质**：前锋探索。**零代码改动**，只产出事实与分类。
> 对照对象是本地参考仓 `pi`（`/home/wang/projects/pi`，只读）。

## 1. 分类口径

每条发现归入**恰好一类**：

| 判定 | 含义 | 本轮是否提议开发 |
|---|---|---|
| **DEFICIENT** | 我们有这个能力，但更弱／不完整／未接线／已损坏 | ✅ 提议 |
| **MISSING** | pi 有，我们没有等价物 | ✅ 提议 |
| **OURS-ONLY** | 我们有 pi 没有 | ❌ **仅记录**（维护者将结合其他项目另行开发） |
| **平手** | 两侧都有，形态不同 | ❌ 仅记录，避免误报为差距 |

维护者指示：**pi 没有但我们有的功能，先暂缓**——本目录按此执行，`OURS-ONLY` 只记录不提议。

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
| M11 | ~~rewind 时摘要被放弃的分支~~ | `07-*` §3.1 | ✅ **2026-09-23 已收口**：回退改为非破坏性分支切换，每次回退必写 `branch_summary`（摘要可选）；`sessionDagEngine.ts` 已删除（重复实现），由 `sessionThread.ts` + `store/threadState.ts` 承担。**复核修正**：摘要的**归属**曾错——会投影到每条分支；现按 `abandonedEntryIds` 只投影到适用的那条（`phase-4-execution.md` §15.1）
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

## 6. 建议的下一步

1. **先修 P1–P3**（配置失效、双配置系统、目录遍历）：三者都是**根因型**修复，且互相独立。
2. **再做低成本 MISSING**（M1–M4）：每项都是几十行级别的接线。
3. **P4–P7 需要裁决**：每项都是「声明了但没接」或「基础设施在但覆盖面窄」，
   按 `01-*` §3.1 确立的标准，**要么接上，要么删掉，不要保留中间态**。
4. `OURS-ONLY` 的 15 项按维护者指示暂缓，待结合其他参考项目另行开发。
