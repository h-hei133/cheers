---
title: "功能开发：pi 对照总索引"
category: article
sources: [pi-source-2026-09-20, repo-audit-2026-09-20, phase-5-pre-research-2026-09-23, phase-6-pre-research-2026-09-23, phase-6-execution-2026-09-24]
created: 2026-09-20
updated: 2026-09-26
tags: [features, gap-analysis, pi, index]
summary: "功能开发前锋探索的总入口。对照本地参考仓 pi，把能力缺口按七个切片分类登记：共 40 项 DEFICIENT、38 项 MISSING、16 项 OURS-ONLY、7 项平手。Phase 0–5 已闭环；Phase 5 的前置研究、裁决、施工与复核均已完成（7 项任务 + 22 项补充裁决），核心是删除 32 文件 / 8,330 行的零消费者「报告投影族」、补上缺失的重试与错误分类、并让 compat 标志真正改变请求形状。裁决经五个独立复核者证伪式复核，推翻主代理 4 项错误（含 T2 闭包方向算错，数字从 36/10,008 更正为 32/8,330）；施工后的复核轮再发现并修复 8 处缺陷，其中一处让每个致命崩溃变成进程带病继续运行。Phase 6 **已完成**（T5a 回写 25 行滞后判定 + T1 HTTP 超时接线 + T2 metrics 采集与读取 + T3 用量按模型分桶 + T4 `/report`），四项代码任务全部有反向验证与实机验证。Phase 6 前置研究与裁决（零代码改动）：重新盘点发现 44 个看似开放的条目里 25 个已实现但未标注，真正仍开放 10 项，其中 3 项是行为缺口（HTTP 超时未接线、metrics 采集面为空、用量记账不按模型分桶）；两个复核者各覆盖一半、均判 incorrect，共推翻主代理 9 处。**§10 续研（2026-09-26）回答「优化 Rust/Python 是否胜过纯 TS」**：实测本仓真瓶颈是 `grep`（1,294ms vs ripgrep 10–30ms，43–130×），但**三家参考实现没有一家自己写搜索算法**——Claude Code 内嵌 ripgrep 二进制、pi 直接 `spawn(rg)`、oh-my-pi 用 napi 链接 ripgrep 的库。**Rust 在 agent 里的真实价值是「原生库的粘合层」，不是「更快的实现」**；而同一速度用纯 TS 的 `spawn(rg)` 即可拿到，成本低一个数量级。Bun `--compile` 实测可用（启动 1,370ms → 200ms，7×；用户免装 Node；产物 106MB；`--version` 有一处缺陷）。**Phase 11 前置研究已完成（2026-09-26，零代码改动）**：见 `08-gap-and-debt-research.md`。5 路只读子代理覆盖内核循环／工具执行／provider 模型／上下文记忆／架构债务五个切片（债务总扫被上游 content_filter 拦截，已重派两个避开敏感阅读面的窄切片）。**头条不是新差距而是三项 P0 既有缺陷**：① `daemonEnabled` 默认 true 而 Rust 执行面缺 cargo 时不降级，**全新安装 bash 100% 失败**（实机复现；本机被用户配置的 false 掩盖）；② `cheers.json` 是 git 跟踪的配置契约却**从不被读取**（CLI 报 max-turns=15 而文件写 30）；③ `/model refresh` 把内置模型的 `compat`/`promptCache`/`vision` **整体抹掉**（实机复现 developer→system、vision true→false），静默回滚 Phase 5/9 已修好的缺陷。差距侧 10 MISSING / 14 DEFICIENT；债务侧三层口径 129 → 90（21,247 行）→ **35 真死文件（6,650 行）**，seam 校验 0 条活引用。子代理 3 项结论经核验被推翻或更正（memory 实际已接线、context 域是子集而非整体未接线）。"
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
