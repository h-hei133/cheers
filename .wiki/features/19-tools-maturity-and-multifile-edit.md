---
title: "19：核心工具成熟度、审批噪声隔离与多文件编辑方案"
category: article
sources: [doc-14-current-state, cheers-core-tools-28ff98ce, pi, oh-my-pi, codex]
created: 2026-10-05
updated: 2026-10-05
tags: [research, tools, edit, apply_patch, approval, security, sandbox]
summary: "复审 15 个默认工具的真实契约，修正跨文件原子性、参考能力与资源边界的过度宣称。Phase 19 采用唯一 apply_patch 入口和 edit 域批次计划，复用 writer 与恢复链；补齐工具安全、真实 LSP、多模态/PDF 与浏览器能力。本文为决策与验收输入，不代表运行时已实现。"
confidence: mixed
---

# 19：核心工具成熟度、审批噪声隔离与多文件编辑方案

## 1. 范围与结论口径

本篇复审 [14 号研究](14-user-experience-research.md) §9 的全部工具风险，回答工具成熟度、多文件编辑、审批噪声与生产验收问题。基线为 Cheers `28ff98ce`；定向参考为 pi `b2b5c42f`、oh-my-pi `1c0993c3`、Codex `4210c08d`。源码阅读证明具体分支与契约，不能替代运行时验收；原研究中的隔离探针沿用为历史证据，本次不冒称重新运行。

**当前结论**：多文件修改已经可以在一个回合内通过多个 `edit` 完成；主会话将这些调用串行执行。缺少的是一个统一的跨文件计划、审批和持久结果契约。Phase 19 采用单一 `apply_patch` 工具入口，先完成安全恢复与批次契约，再开放执行。内存预检只能保证预检失败不修改目标文件，不能保证提交时或崩溃后的跨文件原子性。

用户要求生产能力对齐，因此真实 LSP、图片/PDF 与浏览器扩展都进入 Phase 19；不能仅改名或增加说明后宣布能力补齐。本轮仅修改研究与规划文档，未修改产品代码、测试、配置、脚本或构建行为。

## 2. 15 个默认工具的真实能力与差距

默认工具定义见 [registry.ts](../../packages/ts-shell/src/core/tools/registry.ts)。比较只采用已定位的具体行为，不把参考项目称作整体“完备”或“安全”的证明。

| 工具 | Cheers 当前源码事实 | Phase 19 需要补齐的契约 |
|---|---|---|
| `read` | 文本/目录读取、offset/limit 分页与输出截断；文本分支先完整 `readTextFile` 再分行，尚不返回图片多模态块 | 大文件、单巨行、编码和内存预算；图片/PDF 有界读取与真实内容块，见 §3.7、§3.10 |
| `write` | 单文件统一 writer、路径校验、进程内锁；非字符串 `content` 被转换为空串；底层支持可选 `expectedContent` | 非字符串拒绝、真实 schema 校验、显式不存在前置状态、精确 stale-read，见 §3.1 |
| `edit` | 单文件可使用多段 `edits[]`、oldText/newText 或全量 content；快照记录供恢复 | 现有调用保留；新增 `apply_patch` 解析为同一 edit 域批次计划，不新增第二 writer，见 §4 |
| `glob` | [glob.ts](../../packages/ts-shell/src/core/tools/glob.ts) 先枚举再过滤；1,000 项与输出字节上限不限制此前遍历 | 目录、文件、深度、时间与内存预算，取消及截断状态；成熟原生查找优先，保留受控 fallback |
| `grep` | 原生 `rg`，缺失时进程内遍历；路径处理剥掉前导点与斜线，可能把 `.hidden` 改成 `hidden` | 保留原路径语义、统一 containment、原生与 fallback 一致；AST 搜索是额外能力，不是文本 grep 的生产必要条件 |
| `lsp` | [lsp.ts](../../packages/ts-shell/src/core/tools/lsp.ts) 已自述 symbol scanner；跨仓搜索筛 TS/JS，单文件 parser 还支持 Python/Rust/Go/JSON；不连接语言服务器 | 所有 filePath 入口的读取权限与围栏；真实 LSP 客户端、服务器生命周期、diagnostics/rename/code actions，见 §3.2、§3.10 |
| `bash` | ShellManager、执行服务、OS 沙箱、超时、后台句柄与输出 artifact | 明确支持平台与交互限制；取消、进程组与逃逸后代的已确认/未知状态，不凭信号发送承诺全树退出 |
| `web_search` | Exa/Tavily/DDG 按配置选择，不是运行失败后的自动 failover；父 signal 替代自身期限；部分错误返回上游正文；成功体也全量读取 | 总期限、父取消、有界读取、响应 schema、错误脱敏、明确重试与提供商选择策略 |
| `web_fetch` | 逐跳 URL 检查与正文上限；预取消信号未提前处理；hostname 规则不绑定实际连接地址 | DNS 全地址审查、连接 IP 绑定、redirect/TLS 约束、取消和解析预算，见 §3.5 |
| `browser` | 八个基本动作：open/observe/click/type/select/hover/press/close；工具入口与会话管理器未完整传递取消 | 动作生命周期取消、截图多模态、标签页、上传下载、弹窗与网络策略，见 §3.8、§3.10 |
| `todo` | 会话任务清单及持久化回放 | 勾选状态与行为完成证据分开；不由 `done` 自动证明任务成功 |
| `task` | 前台子代理委派，可选 worktree、权限交集、递归限制；不同于 bash 的后台进程句柄 | 主子共享预算与 deadline、完整轨迹、只读委派准入；并发策略由通用调度契约承担 |
| `ask` | 已按 Phase 19 区分回答来源与六种结果，空答不选择推荐项，中断保留已答项 | 本地实现与验证见 [裁决 §8.14](phase-19-decisions.md)；跨平台实机与远端结果另核对 |
| `taskOutput` | 读取当前进程内后台命令表；保留最多 100 条完成项 | 超时、输出预算、句柄失效与重启后的不可连接状态如实呈现；不把内存表称为持久恢复 |
| `taskStop` | 返回 `Stop requested` 并提示查询 `taskOutput`；后台任务以 `close` 事件结算 | 当前请求语义诚实。若增加等待退出，要区分请求、已退出、期限到、部分清理、未知；逃逸后代和跨重启另有边界 |

可核查的参考决策：

- pi 的 [bash.ts](../../../pi/packages/coding-agent/src/core/tools/bash.ts) 使用 `spawn` 与 pipe/ignore stdio；不能据此声称其 bash 原生支持交互 PTY。pi 的工具结果组件会更新最终结果，适合作为避免重复追加的参考。
- Codex [apply-patch/lib.rs](../../../codex/codex-rs/apply-patch/src/lib.rs) 的 `ApplyPatchFailure { error, delta }` 明确携带已提交变更。它证明“失败仍可能部分提交”，不证明跨文件原子性。
- oh-my-pi 的 [edit/settings.ts](../../../oh-my-pi/packages/coding-agent/src/edit/settings.ts) 与 [schemas.ts](../../../oh-my-pi/packages/coding-agent/src/edit/schemas.ts) 展示 patch 模式与输入契约；[lsp/](../../../oh-my-pi/packages/coding-agent/src/lsp/) 是真实语言服务器交互的定向参考。
- oh-my-pi 的 fetch 入口委派页面加载；已查的 [web/scrapers/types.ts](../../../oh-my-pi/packages/coding-agent/src/web/scrapers/types.ts) 直接使用 fetch/redirect follow，不能作为 DNS 或 peer IP 防护已经实现的证据。
- 原稿关于参考项目 JobObject/cgroup 清理、Codex 必然依赖 LSP 插件、各模型专门训练过 patch、全部参考搜索具备健康熔断的概括缺少定点依据，本次移除。工具数量、项目声望与星数不替代契约证据。

## 3. 工具缺陷与生产能力设计

### 3.1 `write`：运行时 schema 与精确前置状态

[registry.ts](../../packages/ts-shell/src/core/tools/registry.ts) 的 `typeof args.content === "string" ? args.content : ""` 会把数字、null、对象或缺失参数变成空串，具有清空文件的风险。网关必须执行完整声明 schema 的实际验证，包括必填、类型、数组成员、范围及互斥组合；不能只增加几条临时断言。直接调用工具适配器的路径也须拒绝无效输入。合法的显式空字符串仍应允许经过正常审批后清空文件。

前置状态采用能区分“未提供约束”“预期不存在”“预期存在且内容为 exact raw”的契约。现有 `expectedContent?: string` 能表达最后一种，不能用 `undefined` 同时表达前两种。比较保留 BOM、CRLF 和末尾换行，不先规范化文本。

[execution/service.ts](../../packages/ts-shell/src/runtime/execution/service.ts) 已在快照捕获前、异步快照持久化后做两次 exact raw 比较，应复用并覆盖所有受管写入口。冲突为 `FILE_CONTENT_CHANGED`。这不是文件系统原子 CAS：[fileLock.ts](../../packages/ts-shell/src/runtime/execution/fileLock.ts) 只序列化同进程合作调用，外部编辑器仍可竞争。文档、UI 和结果不得承诺彻底消除跨进程覆盖风险。

### 3.2 `lsp`：所有 filePath 入口受相同约束

漏洞不限于 hover：`documentSymbol → readSource` 同样接受显式 filePath，而 `readSource` 仅解析路径后调用读取。现有 `executionService.readTextFile` 本身只是读取，并不执行 jail 或授予 authority；`ToolExecutionContext` 也没有 `context.executionService` 字段，现有服务通过工厂闭包注入。删除原稿中不可编译且不安全的示意代码。

在工具输入提取、deny 规则、canonical containment、实际打开对象之间建立一致的路径契约，覆盖绝对路径、`..`、符号链接及别名；未获许可的目标不得先读后判。实际文件打开与路径验证之间的竞态必须有测试和明确平台保证；不能仅用字符串 `startsWith`。统一读取适配可承载审计和资源限制，但不会自动产生授权。

跨仓扫描路径与所有显式 filePath 路径都必须验收。已获单独授权的 artifact 或其他读域使用其自身 authority，不能被错误塞入“所有读取只能来自 workspace”的规则。

### 3.3 `ask`：用户回答、推荐与错误分开

2026-10-06：此项已完成本地实现、131 项相关测试及真实 PTY 适配探针；详细证据与限制见 [Phase 19 §8.14](phase-19-decisions.md)。

输出必须保留每题的回答来源，并汇总为 answered、partial、unanswered、cancelled、unavailable 或 error。推荐项只在 UI 中提示；缺答、关闭面板、非交互环境或回调异常都不能变为用户选择，也不能触发后续写入授权。

用户取消与父 signal 取消须保留原因；交互不可用与程序错误不能一概标为 denied。部分回答保留已答项，未答项保持未答。需要答案才能推进的动作不得由默认项代替；允许自主决定的普通偏好仍须标为系统判断，不能伪称用户批准。

### 3.4 `grep`：保持路径原义

[grep.ts](../../packages/ts-shell/src/core/tools/grep.ts) 的前导字符剥离正则误改 `.hidden`。修复应保留原始输入（包括有意义的首尾空白），按实际路径语义 resolve，再做 canonical containment 与权限检查；不能将绝对外部路径剥成工作区内路径，也不能把 `../` 改成看似安全的路径。原稿声称 glob 已采用“更窄的剥前缀正则”不实：[glob.ts](../../packages/ts-shell/src/core/tools/glob.ts) 仅 trim。

原生 rg 与 fallback 对 `.hidden`、`./.hidden`、绝对路径、Windows 路径及符号链接使用同一目标解析规则。忽略文件、排序与资源预算的差异要明确，而非静默更换搜索范围。

### 3.5 网络：父取消、总期限、DNS 与连接地址

`web_fetch` 必须在发起 DNS/网络动作前检查已取消状态；`web_search` 的父 signal 和自身 deadline 同时生效。可使用 `AbortSignal.any`，该 API 自 Node **20.3.0** 可用，符合仓库 Node floor；不是新增 floor 缺陷。重试、重定向、正文读取与解析应共用总 deadline，不能每次重试重置预算。

[egressGuard.ts](../../packages/ts-shell/src/core/security/egressGuard.ts) 现有 hostname 策略是资产，仍缺少 DNS 与连接级防护。新增网络连接 owner 应：

1. 按策略校验全部 A/AAAA 结果，涵盖 IPv4、IPv6、映射地址、回环、私网、链路本地与特殊地址。
2. 把审核结果绑定实际连接 IP，禁止审核后由另一解析步骤重新选择地址；redirect 每跳重新验证并绑定。
3. 保留原主机的 TLS 证书与 SNI 校验，禁止为 IP pinning 关闭证书验证。
4. 清晰处理 DNS/连接/重定向/正文/解析各阶段取消，释放 reader 与连接资源。
5. 区分公开网页抓取与用户明确授权的 localhost 开发浏览器策略；不通过全局禁用 egress 或切换工具绕过限制。

仅“先解析 DNS 再普通 fetch”仍有解析与连接不一致的漏洞，不能作为验收终点。

### 3.6 搜索响应：错误不含正文，成功有界读取

非 2xx 错误只输出安全的 provider 标识、HTTP status、稳定错误分类及经过允许列表验证的 request id。不得将响应正文片段放入模型、终端、日志或 artifact；`await res.text()` 后 slice 再去 HTML 标签既先全量读入，也不能可靠删除 secret。使用已有 [redaction.ts](../../packages/ts-shell/src/core/security/redaction.ts) 与 [reportText.ts](../../packages/ts-shell/src/core/security/reportText.ts) 的安全投影纪律，网络 owner 仍须从源头避免收集错误体。

成功响应按流读取并限制压缩后/解压后字节、结果数与字段长度，达到上限即取消 body；解析前后验证结构和嵌套深度，明确 truncated/invalid_response。搜索结果、网页和论文文本全部是不可信证据，不成为系统指令。配置选择、限流退避、重试和 failover 是否发生必须可观测，不能把当前配置级选择描述为自动容灾。

### 3.7 `read`、`glob` 与 fallback：限制实际工作量

输出截断不等于资源有界。`read` 当前先完整读再 split；单个超长行即使只要一行也可能占用大量内存。`glob` 当前先全枚举再过滤；限制最终 1,000 项不能限制目录遍历。

改进需在文件/目录 owner 中限制读取字节、单行字节、目录数量、候选文件数量、深度、打开句柄数和总 deadline；分页读取采用流式扫描或有界 seek 策略，超出条件返回明确的不完整原因。对编码检测、二进制误读、BOM/CRLF 保持和 UTF-8 截断边界设定契约。大目录扫描期间响应父取消。成熟原生工具可用时优先调用，缺失时 fallback 仍须有界。

### 3.8 浏览器取消与副作用

[browserToolUnified.ts](../../packages/ts-shell/src/core/tools/browserToolUnified.ts) 与 [sessionManager.ts](../../packages/ts-shell/src/browser/sessionManager.ts) 之间需要统一 action context，传递 signal、deadline、task/call id 与状态。预取消必须零启动、零导航；运行中取消后不再调度后续动作，并观察当前动作和资源收尾。

已经发生的点击、输入、提交、下载并不因取消而回滚。结果区分未开始、取消前已发生副作用、结束已确认、收尾失败或未知。工具不能只放弃等待而让动作继续静默运行；页面关闭或浏览器退出失败也必须保留。上传与下载需单独授权、路径 containment、字节预算和持久结果。

### 3.9 后台命令与进程生命周期

`taskStop` 已如实返回 Stop requested；保留此语义。可增加有界等待退出及强制终止阶段，但退出证据来自进程事件，而不是 kill 的返回值。进程组不能保证已经逃离该组的后代退出。明确支持平台上的后代管理能力和残余未知；未提供某平台保证时不得以“全平台零孤儿”验收。

`taskOutput` 的失效句柄、进程重启和保留策略与子代理 `task` 分开。若接入持久任务基础设施，复用同一 TypeScript 执行边界，不再创建另一套 shell 执行路径。bash/browser 的任意外部副作用不能承诺由 `/undo` 恢复。

### 3.10 Phase 19 能力扩展接口

| 能力 | owner 与接口边界 | 必须验证 |
|---|---|---|
| 真 LSP | 拟新增语言服务 owner 管服务器发现/配置、JSON-RPC、workspace、document version、取消、重启、diagnostics；现有 `lsp` 工具为薄适配；纯扫描作为显式 fallback | 无服务器/崩溃/过时 diagnostics 如实返回；definition/references/hover/symbols 语义正确；rename/code action 生成受审批 edit 计划，禁止服务器直接旁路 writer |
| 图片 | 现有读取与模型内容适配边界增加图像块；限定 MIME、尺寸、像素、字节与解码资源 | 模型是否支持图像可见；错误/超限不伪称已看图；正文/终端仅显示必要引用，不倾倒 base64 |
| PDF | 拟新增文档解析 owner，选择成熟解析器，保留页/节定位、提取状态、内容 hash 与大小限制；通过现有 TypeScript 执行边界调用需要的原生能力 | 加密、损坏、扫描件、缺页和提取失败显式；能获取全文则实际提取并逐页定位，摘要不能冒充全文；不新增第二产品 runtime |
| 浏览器扩展 | browser 域统一 tabs、screenshot、dialog、upload/download、network policy/session 生命周期，工具入口仅适配 | 多标签隔离、导航后 ref 失效、截图证据、上传下载权限、弹窗取消和网络边界；既有八动作回归 |
| 子代理与预算 | 通用 runner/调度与 `/goal` 的共享 admission、计量、deadline 和持久状态；默认无总 token cap，`budget N` 启用，`budget off` 移除 | 显式 cap 汇总主/子/顾问/重试且不可绕过；未设 cap 不虚构默认 100k；单请求窗口/输出/timeout/并发与安全取消仍生效；权限只能求交，研究复用该契约 |

上述均为拟实施能力，不是“现有实现已经具备”的清单。具体服务器/解析器选型需先核查目标接口，再做针对性参考与依赖评估；不可因参考项目用了另一种语言而引入第二 runtime。

## 4. 多文件编辑：一个入口、一份计划、一个 writer

### 4.1 当前行为与方案裁决

[turn/session.ts](../../packages/ts-shell/src/turn/session.ts) 把 `edit` 标为 sequential；[agent/tools.ts](../../packages/ts-shell/src/core/agent/tools.ts) 遇到任一 sequential 调用会串行执行该批。故当前主会话可同回合多个 edit，无需 bash，但各自审批、提交和失败，没有共同批次结果。子代理适配未统一继承该标记，是通用调度契约的待修项，不能以 UI 合并来改变执行语义。

Phase 19 选 **`apply_patch` 单工具入口**。它支持文本多文件 add/update/delete，统一解析成 edit 域批次计划；现有 edit/write 保留其单文件入口并复用同一 writer。**不同时新增 `multi_edit` 或 `edit.files[]` 的平行系统。** 原稿先 JSON 原子批处理、再 patch 的路线已被此决定取代。

语法是公开定义的 patch 协议，不假称所有模型都经专项训练；token 优势需实测，JSON 工具载荷仍有转义成本。解析器拒绝歧义、不完整 hunk、重复目标和未支持指令；允许的匹配容差必须可解释且不能静默选错位置。

重命名仅限同一获准 workspace 内的文本普通文件：源内容及目标预期不存在同时校验，源与目标都进入审批和结果；不隐式覆盖目标，不跟随越界符号链接，不支持目录/二进制/跨设备事务承诺。大小写别名或同 canonical 对象须按平台语义显式处理；不能静默拆成另一次无关操作。

### 4.2 安全恢复先于执行开放

[execution/service.ts](../../packages/ts-shell/src/runtime/execution/service.ts) 当前快照路径存在 best-effort 行为。新受管编辑批次必须先修复持久快照、恢复凭据与条件恢复路径：所需快照无法持久化时阻止批次目标写入，不能写完再称可撤销。

`/undo` 的用户裁决是：默认撤销**最近一次已提交的编辑操作**，一次多文件 patch 算一个操作；先展示受影响文件并确认。撤销需要确认当前内容仍等于该操作写入后的内容，不能覆盖用户后来的手工修改。恢复可能因冲突、权限或 I/O 失败而部分完成，需持久记录并提供下一步，不能伪装成全部恢复。

### 4.3 批次状态与执行顺序

拟新增高层 edit 域拥有 `contract/plan/state/apply` 等短职责模块；底层继续通过唯一 `runtime/execution/` writer 与现有 snapshot/restore 执行。产品 core 工具入口只负责解析与适配，不新增跨域编排。

1. **解析与全批预检**：解析全部操作，限制文件数/输入字节/单文件大小；解析 canonical 路径，去重物理别名并验证逐路径 deny/containment；读取前置状态，在内存计算全部拟议结果与 diff。失败时目标文件零改动。
2. **审批绑定**：审批涵盖完整 call id、参数版本/计划 hash、操作种类、全部规范目标、before/after 内容摘要、重命名两端及权限范围。计划或内容变化使批准失效；逐路径 deny 优先，不能以“approve all”覆盖拒绝。
3. **稳定锁序与重验**：按 canonical 键排序获取全部合作锁，避免 [A,B]/[B,A] 死锁；锁内重新验证状态、路径、预算和审批绑定。现有进程内锁不等于跨进程锁。
4. **持久准备**：保存 operation id、逐文件 before/after 凭据、恢复资料与准备状态。快照或计划持久化失败则阻止目标写入；元数据持久化本身不能被误报为目标已写。
5. **逐文件提交**：每个 writer 紧邻写入前执行 final stale-read，快照异步边界后再核对；每文件结果持久化，取消/失败后停止尚未开始的操作。
6. **条件补偿与恢复**：只在当前文件仍等于本批已写入状态时恢复；外部改动、目标替换或权限变化阻止补偿。崩溃恢复重新观察磁盘，不能仅凭“写入开始”记录推断成功。

持久状态分别表达 prepared、approved、committing、committed、compensating、restored、partial 与 unknown 等实际语义；逐文件至少区分未开始、已提交、恢复成功、恢复受阻、失败、结果未知。枚举最终命名由 owner 契约统一，禁止用单个 `success: boolean` 掩盖信息。

**保证边界**：全批预检失败不改目标；成功提交有逐文件证据；失败后尝试 guarded compensation。普通文件系统上的多文件更新没有跨文件崩溃原子性，补偿也可能失败。即便最后全部恢复，仍应说明曾发生写入，不能称整个过程“未修改过磁盘”。

### 4.4 参考决策与反向验证

Codex patch 使用部分 delta：本方案接受“部分写入必须可见”，并增加持久计划和条件恢复。oh-my-pi 的 patch 模式证明文本补丁可作为一个入口；本方案不同之处是复用 Cheers 所有的 edit/writer/snapshot 边界，不复制其模式族。

保留会在这些决定被撤回时失败的用例：A 已写、B 注入 EIO、随后用户改 A，补偿不能覆盖用户内容；[A,B] 与 [B,A] 并发不死锁；符号链接别名不能重复写或绕过审批；快照失败零目标写；崩溃于写入后结果落盘前必须恢复为可核查的 unknown/partial，而非 completed。

## 5. 审批噪声：审计、模型与 UI 分离

### 5.1 已核实的两条路径

[turn/tools.ts](../../packages/ts-shell/src/turn/tools.ts) 把 `[User approved ...]` 前缀拼进工具 output，随后成为模型的 tool 消息。[turnSink.ts](../../packages/ts-shell/src/cli/interactive/turnSink.ts) 把 awaiting/resolved 事件写入 note；[toolCards.ts](../../packages/ts-shell/src/cli/interactive/toolCards.ts) 的 note 修改正文，finish 又追加最终 body，导致审批文案和流式正文重复。

### 5.2 改造契约

- 审批结果保存在结构化 metadata/events 中，完整保留审计与权限事实；模型收到业务结果和必要的 denied/blocked 原因，不插入成功审批装饰句。
- UI 状态徽标消费审批事件，正文只承载真实业务内容。批准、开始执行、执行完成、验证完成是不同状态。
- final output 存在时作为 canonical 正文替换 preview；final body 缺失时保留已有有效流式输出。错误、取消、partial、artifact 引用和截断状态不得因清理重复而丢失。
- 批量审批由 §4 的计划授权承担；UI 只能展示，不能将不同 call 的授权合成未绑定参数的万能许可。

Codex [approvals.rs](../../../codex/codex-rs/tui/src/history_cell/approvals.rs) 将审批渲染为独立 cell；pi [tool-execution.ts](../../../pi/packages/coding-agent/src/modes/interactive/components/tool-execution.ts) 更新最终结果。它们支持“分开渲染/结果替换”的具体选择，单凭 TUI 文件不能证明其所有模型消息从不包含审批文字。

## 6. 风险登记与验收

### 6.1 风险覆盖表

| 编号 | 风险 | 生产验收重点 |
|---|---|---|
| T01 | write 非字符串清空、前置状态歧义 | 数字/null/缺失拒绝且零 writer；合法空串保留；absent 与 unconstrained 区分；BOM/CRLF exact 比较 |
| T02 | lsp 显式路径越界 | hover/documentSymbol 等所有 filePath；deny/绝对路径/../symlink；实际打开对象一致 |
| T03 | ask 伪造用户选择 | 未答/部分答/取消/不可用/错误不变推荐批准，授权不由文本推断 |
| T04 | grep 改写点目录 | 原生 rg/fallback 指向同一 .hidden，外部绝对路径不重写入 workspace |
| T05 | 取消/期限失效 | 预取消零启动；父取消与内部期限都生效；重试不重置总预算 |
| T06 | 响应正文泄漏/无限读 | 错误正文不进入任何输出；成功体有界读取/解析；仅合成 secret 验证 |
| T07 | DNS/redirect/peer 不一致 | 公私混合记录、重绑定、IPv6、逐跳与实际连接 IP；TLS 验证不关闭 |
| T08 | read/glob/fallback 资源无界 | 巨文件/巨行/巨目录内存与时间有界，实际读取量与输出限制分别验证 |
| T09 | 浏览器取消与扩展副作用 | 预取消零动作，取消后无后续动作，已发生副作用与关闭失败可见 |
| T10 | 跨文件部分写入与恢复覆盖 | §4.4 故障、锁序、批准失效、快照失败、崩溃恢复和最近操作 undo |
| T11 | 审批/正文重复与信息丢失 | 模型无审批装饰前缀；审计完整；最终替换且保留无终稿流、失败与 artifact |
| T12 | 进程与子代理状态误报 | stop request 不升级 exited；后台句柄边界；主子预算和权限交集 |
| T13 | 能力扩展名实不符 | 真 LSP/图片/PDF/browser 各接口运行证据，未支持项明确，不以改名完成 |

### 6.2 验证纪律

实施时按 owner 运行受影响测试与静态门禁，采用隔离合成网络/文件/进程故障；必要的 PTY 验证先同步实际启动提示。不使用真实 provider 配置进行工具安全测试。仅文档修改不运行 build/tests。

“生产级”验收必须能证明正常路径、拒绝路径、取消、资源耗尽、部分结果和恢复；单个 happy-path 或一个绿色测试不能覆盖整套工具。对参考决策保留反向验证，不能用快照文本重录掩盖语义回退。平台相关保证须在对应平台验证，未运行的明确标为未验证。

## 7. Phase 19 实施顺序

1. 先修复 schema、路径、ask、网络取消/响应、DNS 连接、read/glob 预算和 browser 生命周期，并消除审批输出重复。
2. 完成受管编辑快照/条件恢复、持久 operation 与用户选定的 undo 单位；再接入 `apply_patch` 单入口与完整批次审批。
3. 在相同 owner 与执行边界内完成真实 LSP、图片/PDF、browser 扩展及通用子代理预算/轨迹；具体批次与依赖由 Phase 19 决策文档统一。
4. 以运行证据判断交付状态。本文完成的是事实修正与计划契约，未实现上述功能，未运行 build/tests，也不代表推送或 CI 通过。
