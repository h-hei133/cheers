# 2026-11 路线图执行记录

**状态**：Batch 0–4 的可发布范围已通过定向验收并分批提交，v0.1.0 与包含五秒 job 晋升的 v0.1.1 均已发布。P0 的全量单测、启动模型路由、发布核心门禁已在 Linux 本地通过；2026-11-24 至 25 日 Casa、NOFX 和 BaiLu 原生 CLI 与单文件产物请求成功，B0.6 仍等待本地 WorkBuddy 服务。修复提交尚待推送后的 GitHub 双 CI；版本 v0.1.2 已准备并通过 Linux 产物检查。完整 JS worker 脱离父 tool 与额外 agent slot 经核实不适用。
**任务范围**：核实并执行 `.wiki/wiki/references/codex-and-frontier-gap-audit-2026-11.md` 与 `.wiki/wiki/references/cheers-next-phase-roadmap-2026-11.md` 中的后续批次。
**基线**：2026-11-23，源码提交 `f65ba979`；续接工作基于本地提交 `4c83b5db`。

这份记录只跟踪上述两份研究材料带来的后续工作。它与 `.wiki/refactor/upgrade/tasks.md` 中已有的 62 项会话／运行时计划分开计数，不重置或改写那份清单。目标仓库及 Linux 是本次可写、验证范围；参考树只读；真实模型只通过现有 Cheers 运行路径调用。测试和报告不读取或输出凭据。新产品文件、标识符、界面文案不引入其他项目的名称或标签，也不复制参考仓库实现。

原 Batch 0–4 按当时计划本地提交、未推送。2026-11-24 后续 P0/P1 修复按用户当前指令分批提交并推送 main；外部平台、Windows、实际计费和无法由 Linux 本机证明的结果单独标为未验证。

## 核实后需要执行的任务

| 批次 | 状态 | 当前证据与边界 |
| --- | --- | --- |
| Batch 0 | 实现完成，B0.6 部分验证 | Ready / Configured、模型 Registry、会话连接切换和事务重命名已有实现。最新 Linux 原生 CLI 请求中 Casa、NOFX、BaiLu 均成功，精确路由和会话连接均已确认。WorkBuddy 本地端口 `127.0.0.1:7863` 无监听，仍未验收。 |
| Batch 0.5 | Linux 本地验收通过，已本地提交 | YAML/JSONC、用户配置解析、保注释局部写回、显式迁移和配置消费者通过 31 个聚焦套件 826/826，六个静态门、源码构建、单文件构建和隔离配置迁移入口通过。提交 `f7f9044c74e05eaa7d0d79dd5023a36fa475a294`，未推送。 |
| Batch 1 | Linux 本地验收通过，已提交 | 请求前缀、工具发现、缓存 usage/状态、Responses 摘要前缀复用、Bedrock cachePoint 和 capability 反转均通过定向测试。提交 `ab7312f3` 与接线补充 `976847c3`。真实 BaiLu cache-read 为 0、384、640 tokens，但无输入 token 分母，未报告命中率百分比。 |
| Batch 2 | Linux 本地验收通过，shell 长命令晋升补充已提交 | 嵌套调用 fail-closed、拒绝终止分类、逐调用审批、审批等待暂停、receipt/diff、代码折叠和 PostToolUse 脱敏通过定向测试。Code Mode shell tag 的长 bash 命令现复用同一 PID 的 session job 晋升。完整 JS worker 仍由父 tool 持有，不转入新生命周期。 |
| Batch 3 | 五秒同进程晋升已实现并通过定向验收 | 命令面板、主题预览入口、并排 diff 换行、Tab/Alt+Up、首次连接引导、受控 LSP 候选、重复调用提醒、job 观察及 stream idle watchdog 原实现已验收。当前晋升改动通过 33 项聚焦测试与 Linux 编译/单文件 build；新 agent 并发槽由现有输入/任务 owner 反证为不适用。 |
| Batch 4 | v0.1.0 与 v0.1.1 均已发布 | README、INSTALL、发布 workflow、审批式外部 workspace 架构初始化及 MIT LICENSE 已实现。根与 shell 包 SPDX 为 MIT，版权信息为 `Copyright (c) 2026 h-hei133`。固定包为 `ea5054127f4679a8939a747c6495e0df8534b70e`，pinned judge `proven`。原 Batch 4 实现提交 `099b661`；复现性修复 `fb567fb7`；许可证收尾 `e1719fdb`；版本标签 `v0.1.0` 和 `v0.1.1` 均完成发布验收。 |

## 批次 0 验收清单

- [x] B0.1 默认 Ready / Configured 只呈现已就绪或明确绑定模型，完整目录在显式 Registry。裸 `/model`、`--list-models`、补全收窄，搜索遵循当前视图。
- [x] B0.2 连接按精确地址归属，唯一就绪 `/model use <provider>/<model>` 保存会话级连接。零/多候选和目录地址歧义拒绝。
- [x] B0.3 effort 不兼容时保留可选并回退 auto。成功写入模型后释放启动 `--model`，provider bridge 采用实时解析结果，保留 provider/key/endpoint 覆盖。
- [x] B0.4 重命名复用 session record transaction。RPC 忙时取消且不写入。回归覆盖事务重读与中断恢复。
- [x] B0.5 `.tmp/` 当前为空，未发现活动进程，不需要删除历史内容。
- [ ] B0.6 定向模型／连接／会话测试、反转回归及正常 Linux CLI 入口验证通过。2026-11-24 Linux Node 20.3 CLI 对 `apikey-casa/gpt-6.2-sol`、`nofx/gpt-6.1-terra`、`openai-compatible/bailu-2.8` 分别请求成功；会话所存模型和精确连接匹配，传输诊断与红action均验证。四个连接中 WorkBuddy 的本地端口无监听，等待服务可用后再关闭该项。之前记录的 Casa/NOFX 认证失败不再代表当前状态。
- [x] B0.7 本地提交 `8d310529435445028890a165d67c11fb81b1a2c0`，未推送。

## 后续批次验收条件

- Batch 0.5：按配置文件 owner 覆盖 YAML/JSONC 解析优先级、保注释 CST 更新、格式错误行列、软链与原子写入、迁移备份及权限。机器状态、凭据与跨工具 JSON 合同保持兼容。Node `>=20.3.0`、源码 CLI 和单文件产物的 Linux 检查通过。
- Batch 1：Turn 1 到 Turn 3、重开和压缩的请求前缀逐字节测试；工具发现跨轮保持稳定且不突破 endpoint 能力；缓存状态仅报告 provider 实际回传的用量，未公布定价保持未知；收尾执行拒绝合同保持原样。
- Batch 2：对被拒和无执行器的反例加入自动回归，确认拒绝结果、脚本终态、已完成调用回执和 hook 输出均可核验；时间预算只扣除真实审批等待；TUI 从已存 receipt 投影而不引入并行卡片状态。
- Batch 3：复用现有命令、队列、主题、任务和媒体 owner。快捷键保留空闲补全合同，在忙碌和队列场景明确区分；受控发现不得执行未经用户选择的服务器；观察器不否决工具调用，流中仍有数据的长任务不得被空闲看门狗误杀。
- Batch 4：发布元数据与构建产物、标签、归档和校验可重现；任意外部根路径的初始化需有根身份／权限边界测试，架构状态只能在实际门控成功时标记为 proven。

## 研究断言核实修正

- Batch 1 P0-1 的“持久 `messages[0]` 每轮被改写”不成立；真实缓存缺口是环境开头仅装饰当次 provider 请求、下一轮把环境行移到尾部。按已提交的 prompt barrier 元数据投影修复，不重写原始用户行。动态附件上下文另列边界。
- Batch 1 P0-3 不适用；收尾步不发送工具定义是既有安全约束，endpoint 测试确认 `tools` 与 `tool_choice` 均省略。没有安全合同依据前不改变它。
- Batch 1 P0-4 的 Responses 缓存键缺失结论过时；请求 builder 已对具备声明能力的模型发送，账号 endpoint 还保留该键。专有路由头和 `previous_response_id` 不能从另一服务协议推广到 Azure 或代理。
- Batch 3 Codex 命令弹窗按运行能力筛选并保持注册顺序，未按使用频率排序。菜单排序作为本地 UX 选择实施，不记录成参考项目的既有行为。
- Batch 3 主题预览能力已有，修复点是 `/theme` 入口复用现有预览 lease；Tab 是补全键，排队仍用原命令。
- Batch 3 LSP 自动探测会越过已建立的显式服务器路径权限。只有展示候选并在用户选择后启动才符合现有合同。
- Batch 4 初始许可证主体与标识未确定，曾按用户要求暂缓。2026-11-24 用户确认 SPDX `MIT`、版权主体 `h-hei133`、年份 `2026`，后续按该信息补齐许可证和包元数据。

## 逐项执行账本

此表把仍然成立的行为缺口与已被源码反证的建议分开追踪。`进行中` 仅表示代码切片正在编写，不代表功能验收。

| ID | 核验结论 | 状态 | 验收边界 |
| --- | --- | --- | --- |
| B0.5.1 格式读取与路径优先级 | 成立 | 已验收 | YAML Core/JSONC、有界 descriptor 读取、profile、软链目标格式身份和项目路径。消费者回归通过。 |
| B0.5.2 YAML 局部写回 | 成立 | 已验收 | 标量 CST 原位编辑；注释、键序、BOM、CRLF、并发 sibling 与回读值测试通过。 |
| B0.5.3 人类配置显式迁移 | 成立 | 已验收 | 独占备份/目标身份、权限、软链、并发冲突和失败保留测试通过；隔离 Linux CLI 五文件迁移通过。 |
| B0.5.4 机器状态、沙箱与原子写 | 部分成立 | 已验收 | Hooks/主题保留 JSON 文件名并解析 JSONC；沙箱无效 YAML 显式拒绝；模型目录与 workflow 消费者采用所选格式。 |
| B0.5.5 串行验收 | 成立 | 已验收 | 826/826 聚焦测试、六项静态门、源码构建、Linux 单文件构建及 migration CLI 入口通过。提交 `f7f9044c74e05eaa7d0d79dd5023a36fa475a294`。 |
| B1.1 首轮环境前缀稳定 | 缺口成立，原持久历史描述错误 | 已验收 | 沿已准入 prompt 元数据投影相同环境字节，不重写原始用户消息；请求捕获测试覆盖跨轮、重开和环境变化。 |
| B1.2 动态发现导致的 schema 波动 | 部分成立 | 已验收 | 跨轮复用已加载 schema，同时保留每轮授权、注册表和 endpoint 能力准入。 |
| B1.3 收尾步保留工具 schema | 与安全合同冲突 | 不适用 | 已有 endpoint 测试明确省略 tools 和 tool_choice。 |
| B1.4 Responses 缓存键缺失 | 结论过时 | 不适用 | 能力允许时已有键；私有路由头和服务增量链须按 endpoint 单独证明。 |
| B1.5 费率/预热与状态栏命中率 | 状态栏缺口成立 | 已验收 | 只累计 provider 明确报告的 cache usage；缺乏分母时不显示百分比。不可用价格继续保持未知。 |
| B1.6 microcompact 前移到存储层 | 原修复建议未成立 | 不适用 | microcompact 属于发出的 provider 投影，持久 transcript 保持权威；反例测试覆盖测量锚点修正。 |
| B1.7 复用压缩请求前缀/远端 compact | 本地前缀复用成立，通用远端协议未成立 | 已验收／有界 | 仅在声明的 OpenAI Responses 主会话摘要请求复用 system/tools；超预算回退到原摘要形状，拒绝模型返回的工具调用。其他 endpoint 和 branch summary 不获得未证明协议。 |
| B1.8 Bedrock cachePoint | 缺口成立 | 已验收 | 只按模型能力添加，并验证 cachePoint 数量、顺序和 Converse 转换。 |
| B1.9 system prompt 稳定 | 波动点成立 | 已验收 | 将动态工具名称从稳定 system prompt 投影中移除，工具可用性说明按实际工具上下文保留。 |
| B2.1 嵌套工具无宿主执行器 | 缺口成立 | 已验收 | 缺宿主 gate 时 fail-closed，工具副作用计数为零。 |
| B2.2 无理由拒绝终止脚本 | 缺口成立 | 已验收 | 反馈拒绝和停止拒绝有不同终态；已完成 receipt 保留并与外层状态关联。 |
| B2.3 codemode 常驻授权与 plan 策略 | 缺口成立 | 已验收 | 不持久授权脚本整体；只读 plan 仍通过逐调用授权。 |
| B2.4 内部执行 TUI receipt/代码折叠 | 缺口成立 | 已验收 | 从有父子身份的 receipt 投影内部差异和可折叠代码，没有创建第二套调用状态。 |
| B2.5 审批等待暂停脚本预算 | 缺口成立 | 已验收 | 只扣除真实审批等待时间；取消和并发 settle 有回归覆盖。 |
| B2.6 PostToolUse 安全覆写 | 部分成立 | 已验收 | hook 可脱敏输出，同时保留 success/failure、调用名、审批事实及已发生副作用。 |
| B2.7 shell 模板与长脚本后台晋升 | shell 模板成立；原晋升接线缺口成立 | shell 命令晋升已验收，worker 转移不适用 | `$` template 省略显式默认 timeout，长 bash 调用通过现有 gated bash，在等待阈值后把同一 PID 交给 session job；后台 job ID 保留在 receipt/metadata，shell 输出标记不完整使 `.json()` 拒绝。JS worker 仍在父 tool 完成时收尾，不声称可恢复任意 PC/局部变量；详见 `script-jobs.md`。 |
| B3.1 命令面板、主题入口、并排 diff | 缺口成立 | 已验收 | 复用 capability filter、theme preview lease、并排 diff 换行、源码复制和分页 owner。 |
| B3.2 Alt+Up、首启引导、媒体连接池 | 缺口成立 | 已验收 | 排队与补全语义分开；Alt+Up 召回队尾；首启连接向导和媒体池复用既有 credential owner。 |
| B3.3 受控 LSP 候选选择 | 自动启动与安全合同冲突 | 已验收／有界 | 仅显示候选，用户明确选择后才允许现有 server owner 启动。 |
| B3.4 repeat-tool reminder 与 stream idle watchdog | 缺口成立 | 已验收 | 有界有序参数摘要、阈值 3/5/8；观察器不 veto 且跳过调用不计数。stream watchdog 与 native deadline/取消分类分离。 |
| B3.5 jobs/diff 汇总过滤与注意力并发 | 部分成立；五秒晋升成立，“+1 槽”不成立 | 已验收／不适用项已纠正 | run settlement waiter、审批等待观察、jobs 差值投影和无显式 timeout 的五秒原进程晋升通过测试。`AgentService` 的两个 slot 独立于主会话输入/turn 队列，增加它们不会为人类保留并发槽；不新增调度器或第三个 agent slot。 |
| B3.6 文件拆分/死代码清理 | 无职责候选支撑宽泛拆分 | 已核实 | 删除无生产引用的 `DoomLoopDetector` 与孤立测试；未进行没有具体 owner/反例依据的大模块改写。 |
| B4.1 README/安装/许可证/发布工作流 | 文档和发布配置缺口成立 | 已验收并发布 | README、INSTALL、MIT LICENSE、根/shell 包元数据；GitHub Actions `45310333037` 与 `45324521050` 对 Linux x64 与 macOS arm64/x64 执行构建、版本/help 检查及 SHA-256 校验，均成功；GitHub Release `v0.1.0` 与 `v0.1.1` 已公开。两个 Linux release asset 均通过 sidecar、`--version` 与 `--help` 验收。 |
| B4.2 固定门控包刷新 | 版本缺口成立，实际相差五提交 | 已验收 | pinned archive、全部清单哈希与全哈希 commit `ea5054127f4679a8939a747c6495e0df8534b70e` 一致，脚本契约通过。 |
| B4.3 外部工作区门控资产携带 | 缺口成立 | 已验收 | initializer 与 hook assets 带 digest、Node/runtime 限制和 profile 隔离；实际构建产物包含资源。 |
| B4.4 外部工作区一键初始化 | 原建议绕过 writer 不成立 | 已验收／有界 | `/init architecture` 只生成隔离快照提案；`/init apply` 复用普通 patch 审批、完整分组校验和逐文件读回。 |

## 每批门禁与状态

- Batch 0.5 已串行运行 31 个定向套件、六项静态门、源码构建、Linux 单文件构建及正常 CLI 配置迁移入口。下方记录具体证据；真实 provider 与本批无关。
- Batch 1 需请求捕获与 prefix 测试、缓存成本/usage/状态呈现、endpoint 适配测试及针对 capability 的反转；真实模型缓存命中只记录服务实际返回，不设伪造收益阈值。
- Batch 2 需 worker 与真实 `runTurn` 的拒绝反例、hook/权限/回执消费者测试、审批 UI 停止路径、并行调用结算、静态门和源码构建。不得为验证拒绝而对用户工作区写文件。
- Batch 3 每项按对应 TUI owner 用短 PTY/终端尺寸和键序列验证；只在 Linux 侧执行。无真实外部服务器或账号证据时按 `not_configured` 报告。
- Batch 4 需 pinned 包哈希与外部隔离工作区回读、Linux 可执行文件标签/摘要/安装目录验收及发布 workflow 静态审计。公开 Release 由版本标签触发，需记录 workflow 与资产摘要结果。

## Batch 1–4 执行证据（2026-11-24）

- Linux 聚焦 Vitest 运行 61 个受影响及边界套件，2244/2244 通过。覆盖请求前缀与测量、缓存及摘要 endpoint、Bedrock、codemode worker 与拒绝路径、审批/receipt/hook 脱敏、任务 settle、交互快捷键/连接向导、外部架构初始化和 session rename。
- `npm run test:scripts` 225/225 通过；本轮修正两个 clipboard PTY 辅助器断言，使测试按实际拖选源行的 SGR 坐标工作。regular、fullscreen、line、pipe 四种 Linux 单文件 CLI smoke 全部通过。
- `verify:import-cycles`、`check:config-consumers`、`check:declarations`、`check:node-floor`、`check:lint`、`verify:docs-drift:strict` 全部通过。严格文档门报告 35 条既有 unprefixed source-path advisory，binding rules 无 dangling path。
- 8 个领域 workspace 和 `packages/ts-shell` 逐个串行构建通过；Linux `npm run build:exe` 通过，产物为 107 MB。单文件 smoke 读取当前 build manifest 与 executable digest。
- pinned archive 经包契约测试核对，commit 为 `ea5054127f4679a8939a747c6495e0df8534b70e`。用归档成员 `package/dist/adapters/cli/normproof.js` 在 Cheers source 上运行 judge，结果 `proven`、0 open obligations、0 failed obligations、0 proof gaps。
- `/init architecture` 通过隔离外部 workspace snapshot 生成精确提案；`/init apply` 使用既有 patch approval，要求完整选择并逐文件读回。测试验证被拒、partial、stale、源修改和普通配置并发变更都不会提交未核实结果。runtime asset 和 hook bundle digest 经构建及资产测试校验。
- Linux 真实模型探测三轮 BaiLu 返回 cache-read `0`、`384`、`640` tokens，cache-write 为 `0`。provider 未给出输入 token 分母，未推导命中率。Casa 与 NOFX 分别返回认证失败，Workbuddy 目标 `127.0.0.1:7863` 无监听。旧 Batch 0 记录中的“真实 endpoint 请求成功”修正为 BaiLu 成功，Casa/NOFX 为认证失败，均与产品路由测试分开记录。
- Batch 1–4 无新增产品运行时依赖。提交 `ab7312f3`/`976847c3`、`d006c981`、`b06ec6d0`、`099b661`，均本地且未推送。实际工作量 L。B4.1 LICENSE 与公开 Release 保持未完成，因用户选择暂缓根项目许可证信息。

## Batch 3.5 设计与修正

- `/director wait` 监听当前 run 的 settlement promise，精确保留 run identity；调用方等待超时和取消只结束观察，不取消 worker。状态输出按安全行与详情做差值发布。
- 审批等待提示来自未结算的审批 prompt，限于内存中的 operation，不持久化确认、密钥或输入内容；run 结束后消失。
- 此前把 shell foreground promotion 与子会话 AgentService job 生命周期混为一项。当前 Bash owner 已先采用 provisional `LocalExecutionHandle`，在同一父 session 的 `TaskRegistry` 中原 PID 晋升；人类输入路径本来就会立即触发 `promoteForeground()`。因此仅将默认前台晋升等待从 60 秒调到 5 秒，仍保留默认命令执行上限 60 秒、晋升后 job lease 300 秒、用户显式 timeout 及 journal/capacity failure 语义。
- 本地测试覆盖 4,999ms 尚未晋升、5,000ms 晋升、完成竞赛、用户输入提前晋升和容量拒绝。Promoted command 保留原 PID，不重新 spawn。
- 同 session agent journal 的两个 slot 仅约束 side-agent runs。主会话输入与 turn queue 有独立 owner，因此把 agent 上限改为三个不能新增前台人类槽，也没有统一 request semaphore 可调。已有 `waitsForPerson` 行高亮继续复用，不新增槽位或调度器。
- 对照时采用的有效决策是同一 job ID/进程继续读取、完成与中止竞速先于晋升、输入可提前晋升。更贴近的异步任务方案使用 60 秒默认阈值；Cheers 依据本路线图保留同一执行 owner，仅设置 5 秒等待。各参考仓库的 worker abort/close 与父工具结算没有给当前 JS worker 提供可直接移交的可恢复 checkpoint。

## Batch 0.5 格式与迁移合同

- 格式选择只在同一配置目录内按 `.yaml`、`.yml`、`.json` 顺序选择。用户数据目录的新旧搜索顺序、项目配置优先级和显式 profile 身份继续由现有路径 owner 决定。写入已有 `.json` 时保留该路径；只在没有候选文件时默认创建 `.yaml`。
- `.yaml` / `.yml` 使用 YAML 1.2 Core，限制字节数、别名展开、节点数和深度，拒绝重复键、危险键、非映射根及自定义标签。`.json` 的现有 JSONC 读取与 CST 修改语义保留。
- YAML 更新用文档节点编辑，只改变化字段，保留注释和键序，并在写入前重新解析、校验目标值。诊断给出文件、1-based 行列和不包含配置原文的定位标记，避免将凭据或命令内容写进日志。
- Hooks 与主题保持 `.json` 文件名并增加 JSONC 解析；MCP、认证、凭据、缓存、信任、会话及其他机器状态继续使用其既有 JSON/JSONL 合同。
- `cheers config migrate` 只处理用户明确命令涉及的人类配置，不自动改写。备份和 YAML 目标均独占创建，已存在目标不覆盖；权限沿用源文件。先写入并读回 YAML，再收尾源 JSON。源为软链时保留软链及其目标。操作按文件报告，失败不把未验证状态显示为成功。
- 格式读取、写入、profile、软链及沙箱错误策略先以反例测试固定；既有原子写、快照、三方合并与路径身份 owner 继续作为实现边界。

## Batch 0.5 设计决策

- 沿用现有配置/持久化 owner 与有界 descriptor snapshot。格式识别不创建第二套状态存储，也不把机器协议数据转换成可编辑配置。
- YAML 使用 Node 基线内可运行的 JavaScript 包。文档级修改保留已存在的注释与键序；单标量变更直接替换 CST token，防止重排无关缩进、CRLF 和行内注释。结构变更仍按目标文档更新并校验最终值。
- 显式迁移读取一次快照，固定源/目标/备份身份，先独占备份、再独占 YAML 并验证，最后才清理原普通文件。已有目标、软链身份错误、读取冲突或失败中断都必须保留原始数据。
- JSONC 路径继续由原解析和差异编辑器处理。YAML 路径分层与凭据存储分离是不同合同，不做统一“配置文件一律 YAML”处理。
- 与配置编辑和多层设置加载的参考决策对照后，Cheers 继续复用本地 revision/fingerprint、三方字段合并和 source precedence。标量反转用例固定注释与换行，格式优先级用例固定“目录优先于扩展名”；两条均由现有测试拒绝反向实现。

## Batch 0.5 执行证据（2026-11-24）

- 31 个聚焦 Vitest 套件通过，826/826。覆盖格式解析、用户与项目配置写回、软链与格式身份、显式迁移、模型目录、沙箱、主题、Hooks、工作流、profile、凭据分层和原子写。
- `verify:import-cycles`、`check:config-consumers`、`check:declarations`、`check:node-floor`、`check:lint` 和 `verify:docs-drift:strict` 通过。后者报告 35 条历史文档 source-path advisory，不影响门禁结果。
- Linux `npm run build` 与 `npm run build:exe` 通过，单文件可执行产物为版本 0.1.0。
- 从编译 CLI 的正常 `config migrate` 入口，在隔离 HOME/workspace 中迁移 5 个 JSON 文件。YAML 目标读回成功，`.json.bak` 与原字节一致，然后清理源普通文件。隔离 HOME、workspace 和 session 随后删除。
- 未调用 provider。实现复用原 profile、snapshot、文档路径、字段合并和权限 owner。新增 1 个纯 JS YAML 依赖，无原生绑定。实际投入 L。
- 本批本地提交 `f7f9044c74e05eaa7d0d79dd5023a36fa475a294`，未推送。

## Batch 0 执行证据（2026-11-24）

- 实际投入 L；S.U.P.E.R 检查 10/10；无新增运行时依赖。新增未预见依赖 2 项，分别是私有模型来源标记跨配置快照复制，以及启动模型目标解析器传递到实际 provider bridge。
- Linux 验证 420/420 定向 Vitest。`verify:import-cycles`、`check:config-consumers`、`check:declarations`、`check:node-floor`、`check:lint`、`verify:docs-drift:strict`、`npm run build` 和 `npm run build:exe` 全部通过。
- 生产 `--list-models` 入口只展示配置的 9 个模型。BaiLu 真实请求成功；NOFX 与 APIKey Casa 请求分别返回认证失败，不能计为成功。Workbuddy 选择了正确连接，但 `127.0.0.1:7863` 没有监听服务，真实请求归类为 provider/network failure。
- 测试副作用：第一次真实请求启动时复用了已有 Cheers session，将其模型选择改为 `bailu-2.8`。原选择没有执行前快照，不能安全推定并回写。本机 session ID 是 `sess_ce712b9e215964b0_1795310273004`。
- 外部临时 workspace 和其中创建的测试 session 已删除。本批本地提交 `8d310529435445028890a165d67c11fb81b1a2c0`，未推送。

## 构建可复现性收尾（2026-11-24）

- 对固定 `inputsDigest` 和 `buildId` 的构建复编发现，既有不可变产物与新产物有 49 个文件不一致。差异来自领域包临时输出路径进入模块注释并参与 chunk 命名，代码内容在移除该路径及关联 chunk 名后一致。标准发布器指向隔离 `dist` 的首个探针按公共包路径约束拒绝，未改写现有发布目录；后续采用只读 staging 比较确认原因。
- 构建时将领域包解析到稳定的虚拟模块路径，保留相对导入及声明包入口，并拒绝相对路径跨越所属领域包。回归测试确认不同 staging 路径产生相同 bundle 摘要，且相对路径不能绕开包入口。
- 单文件产物另有 31 个字节随随机编译临时路径变化，连带改变 ELF build ID。临时编译目标改为仓库 `.tmp/` 下按输出名稳定定位，并在构建锁内清理前次中断留下的普通文件。
- 代码复用现有 build identity、publication lock、包入口验证及单文件验收逻辑。新增运行时依赖 0，非计划依赖 0；S.U.P.E.R 检查 10/10，实际投入 M。
- Linux `npm run test:scripts` 为 227/227；其中构建脚本测试 47/47，打包测试 7/7。六项静态门禁通过，严格文档门仍报告 35 条既有历史源码路径 advisory。
- 连续两次 `npm run build:ts` 均产生 build ID `35d4adf87af8` 和 artifact digest `d6e54b51256adfc06c5db9e4d8910d710f807f3a811d8ad947b5b58326aab896`。连续两次 `npm run build:exe` 均生成 SHA-256 `99d1ef521b429b73935cf53d6ac3795af817834b02fccd79a382b3f9fafe0402`、112,670,848 字节；Linux 可执行文件 `--version` 返回 `0.1.0`，最终 `checkBuild` 为 `fresh`。
- 验证只在 Linux 侧进行。B0.6 仍因 Casa/NOFX 认证失败和 Workbuddy 本地服务未监听而部分验证。记录这批构建证据时，许可证信息尚未收到，因此当时没有创建 LICENSE 或发布公开 Release；后续授权与处理见下方许可证记录。

## MIT 许可证与 v0.1.0 发布（2026-11-24）

- 用户确认 SPDX `MIT`、版权主体 `h-hei133`、版权年份 `2026`。根目录 `LICENSE`、README 许可证说明、根与 shell 包 `license` 字段及 lockfile 元数据一致。
- 本地 YAML 解析校验确认 release workflow 监听 `v*` 标签，根与 shell 包版本均为 `0.1.0`，产物矩阵仅包含 Linux x64 和 macOS arm64/x64；发布 job 校验三个可执行文件及 SHA-256 sidecar 后调用 GitHub Release 创建流程。
- `npm install --package-lock-only --ignore-scripts --offline` 成功。六项静态门禁通过，严格文档门报告 35 条既有历史源码路径 advisory。
- Linux `npm run build:ts`、`npm run build:exe`、编译产物 `--version` 与 `--help` 通过；当前 manifest 为 `fresh`，build ID `3cf42ea7d9803af3df25b793e89bebace01905f0fc48aa959869fb6ebf7ded06`，artifact digest `d6e54b51256adfc06c5db9e4d8910d710f807f3a811d8ad947b5b58326aab896`，可执行文件为 112,670,848 字节，SHA-256 `99d1ef521b429b73935cf53d6ac3795af817834b02fccd79a382b3f9fafe0402`。
- `npm run verify:release:core` 的首轮退出为配置错误，合成 HOME 缺失。改用隔离 `.tmp/release-home` 与 `.tmp/release-test` 后，环境门通过，但权限/记忆门因缺失测试路径 `src/orchestration/runMvpIntegratedFlow.test.ts` 且隔离打印流程受 Stop hook 默认拒绝而失败；这是该本地门禁当前未通过的证据，不能计为发布核心门通过。GitHub release workflow 本身不调用该门禁。
- 推送 `main` 和版本标签 `v0.1.0` 后，GitHub Actions run `45310333037` 的三个平台构建、版本与 help 检查、checksum 生成均通过；发布 job 对六个资产完成 SHA-256 校验并成功创建 Release。GitHub Release 地址为 `https://github.com/h-hei133/cheers/releases/tag/v0.1.0`。
- Release 共六个资产：`cheers-linux-x64`（112,670,848 字节）、`cheers-darwin-arm64`（81,658,850 字节）、`cheers-darwin-x64`（87,244,880 字节）及各自 `.sha256` 文件。Linux 资产下载后在 Linux 主机按 sidecar 校验通过，`--version` 为 `0.1.0`，`--help` 正常退出。
- GitHub Actions 注明 `checkout@v4`、`setup-node@v4`、`upload-artifact@v4` 和 `download-artifact@v4` 当前使用的 Node 20 action runtime 将被 runner 强制切至 Node 24；本次 job 成功，该提示作为后续 action 版本维护信息保留。
- 仓库本地 `npm run verify:release:core` 仍未通过：release 核心权限/记忆脚本引用不存在的 `src/orchestration/runMvpIntegratedFlow.test.ts`，且其隔离 CLI 路径被 Stop hook 默认拒绝。该门禁不在 `.github/workflows/release.yml` 执行链内，不能记作通过，也不影响本次 workflow 已报告成功的发布证据。

## shell job 晋升收尾（2026-11-24）

- Code Mode `$` shell tag 删除了人为固定的 60 秒 timeout 参数，因而复用普通 bash 的 session job 晋升。结果 metadata 保留 `backgroundJobId`，shell 投影将该结果标记为 incomplete，`.json()` 不会把启动通知解析成命令输出。
- 默认 session-owned foreground promotion 延迟为 5,000ms，独立于默认 60,000ms command timeout 与晋升后 300,000ms job timeout。4,999ms 前保持前台；5,000ms 后同一进程晋升；较早完成、用户输入提前晋升和容量拒绝保持原结算行为。
- 复用 `ExecutionService.startCommand`、`TaskRegistry.adopt/promote`、`LocalJournal` 和现有 permission/sandbox/hook path。未新增领域包、执行器或依赖；S.U.P.E.R 10/10，未计划依赖 0，实际工作量 M。
- Linux 定向 Vitest 为 3 suites / 33 tests 通过；Biome lint、运行时依赖图、配置消费者、声明、Node floor 门禁通过。TypeScript build 和 Linux 单文件 build 通过，`--version`/`--help` 正常，构建 manifest 为 `fresh`。显式 timeout 反例确认命令仍留在前台；完整 CLI 四模式 PTY smoke 未在这次 5 秒阈值修改后重跑。
- 用户优先的第三 agent 并发槽经源码反证不适用。完整 JavaScript worker 生命周期脱离父 tool 仍不支持，因为 job journal 没有 worker checkpoint/重连，父 tool 负责 nested approval、RPC drain 与 branch-store commit；不把 shell process 晋升报告成 worker detachment。
- 五秒晋升改动晚于 `v0.1.0` 标签。依据 patch version 语义，后续将发行 `v0.1.1` 以纳入该功能；已同步根包、shell 包及 lockfile 版本。该版本 Linux build、`--version`、`--help` 通过，等待标签 workflow 验收。

## v0.1.1 发布验收（2026-11-24）

- GitHub Actions run `45324521050` 完成成功。Linux x64、macOS x64、macOS arm64 构建及发布 job 均通过，公开 Release `v0.1.1` 包含三个二进制和对应的 `.sha256` 文件。
- 从公开 Release 下载的 Linux x64 资产通过 sidecar 校验，`--version` 返回 `0.1.1`，`--help` 正常退出。下载器没有保留可执行权限，本地临时副本加执行位后完成入口验收。
- Linux 资产 SHA-256 为 `656f67e69f339a7e57c4292149cbee7626ddad72cb9283e32ec6079a1c4f53fc`。下载副本已从 `.tmp/` 清理。
- 版本提交 `4c755946` 和 `v0.1.1` 标签已推送；该轮发布与 Linux 资产验收完成。

## P0/P1 修复验收（2026-11-25）

- T1：Linux Node 20.3.0 `npm run test:ts` 通过，1,281 个文件、17,657 项通过、2 项跳过。首次运行发现 20,000 节点与 30,000 条分支摘要组合超过 30 秒测试上限；两个负载边界用例单独重跑均通过，将仅该参数化用例的观测超时设为 60 秒，所有导航与字节完整性断言保留。模型目录和 YAML 旧 JSONC fixture 按现有格式与生产解析行为更新。相关包构建、四个最终覆盖套件 72 项及 Node floor 静态门通过。
- T2：启动入口将目录模型别名解析到唯一 ready connection；`<runtime-provider>/<model>` 先拆出 provider，再保持完整 model ID。显式 `--provider` 仍优先，provider 前缀、嵌套模型路径、目录别名和显式 provider 分支由隔离回归覆盖。Linux Node 20.3.0 源码/编译 CLI 与 v0.1.2 单文件产物使用隔离 HOME 逐项请求 Casa `gpt-6.2-sol`、NOFX `gpt-6.1-terra`、BaiLu `bailu-2.8`，均返回 completed；会话选择分别保存精确连接，传输诊断命中 `apikey.casa`、`b872cff39391.nofx.one`、`bailucode.com`，输出脱敏核验通过。
- T3：失效的旧测试路径改成现有权限记忆 codec/continuity 投影生产消费者测试。隔离 Home Gate 和 Git hook 边界显式设置。`verify:release:core` 在 Node 20.3.0、隔离 HOME/TestRoot、中间构建和最终 v0.1.2 构建中完整通过，包含 session/query、CLI、MCP、result contract、workspace safety、evidence artifact、long-session durability 及 strict docs gate。发布 workflow 增加精确 SHA 的 main `Build & Test` 与 `Validate NormProof Architecture` 前置成功条件。
- T4：外部记录已更新。三条 provider 路由证据通过；`127.0.0.1:7863` 无监听，WorkBuddy 保持开放。根包、shell 包及 lockfile 已升至 v0.1.2；Linux TypeScript build、107 MB 单文件产物、`--version` 和 `--help` 检查通过。待分批提交推送并观察远端双 CI；仅在 CI 成功后推送 `v0.1.2` 标签。
- T5：CI 和 release workflow 的 checkout/setup-node 升至 v7，upload-artifact 升至 v7，download-artifact 升至 v8。Linux release gate 与 Node 20.3 已验收；Windows 未测试，macOS 交互真机未做，npm `private` 保持现状。
- 本地门禁：六项静态检查通过，`npm run test:scripts` 229/229 通过，固定 `.normproof/normproof-0.1.0.tgz` 的 prose check/judge 通过，报告 `proven`、0 open obligations、0 failed obligations、0 proof gaps。strict docs drift 仍显示 35 条既有 unprefixed source-path advisory。
- GitHub CI 尚未针对修复提交运行；修复提交及标签待发布。

## 完成及提交规则

每个仍成立的任务必须有测试或明确的最近验证和其局限。已有功能、冲突合同与过时说法记为纠正项，不作为实现完成。每个批次完成后记录改动文件、定向测试、Linux 构建或原生入口、真实 provider 结果、未验证边界和本地提交号。只有所有必需任务逐项完成或被源码反证后记录为不适用，整个目标才能结束。
