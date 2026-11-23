# 2026-11 路线图执行记录

**状态**：执行中。Batch 0.5 已通过 Linux 本地验收。Batch 0 的真实模型路由验证仍部分未证实。
**任务范围**：核实并执行 `.wiki/wiki/references/codex-and-frontier-gap-audit-2026-11.md` 与 `.wiki/wiki/references/cheers-next-phase-roadmap-2026-11.md` 中的后续批次。
**基线**：2026-11-23，源码提交 `f65ba979`。

这份记录只跟踪上述两份研究材料带来的后续工作。它与 `.wiki/refactor/upgrade/tasks.md` 中已有的 62 项会话／运行时计划分开计数，不重置或改写那份清单。目标仓库及 Linux 是本次可写、验证范围；参考树只读；真实模型只通过现有 Cheers 运行路径调用。测试和报告不读取或输出凭据。新产品文件、标识符、界面文案不引入其他项目的名称或标签，也不复制参考仓库实现。

基线工作区还包含已修改的 `.wiki/_index.md`、`.wiki/wiki/references/_index.md`，以及两份未提交的研究文档。它们属于已有工作，本次保留原样。后续每一批先按准确的验收范围验证，再单独本地提交。外部平台、Windows、实际计费和无法由 Linux 本机证明的结果单独标为未验证。

## 核实后需要执行的任务

| 批次 | 状态 | 当前证据与边界 |
| --- | --- | --- |
| Batch 0 | 实现完成，B0.6 部分验证 | 已实现 Ready / Configured、显式 Registry、视图内搜索、命令和补全收窄、精确地址归属、唯一连接会话切换、effort auto 回退、启动模型锁释放、事务重命名及 RPC 忙时取消。`.tmp/` 只有空目录，无活动进程或可清理历史文件。420 项聚焦测试、静态门禁、源码构建和 Linux 二进制构建通过。三个真实 endpoint 请求成功。workbuddy 选择正确连接，但 `127.0.0.1:7863` 无监听进程，请求为 provider/network failure。 |
| Batch 0.5 | Linux 本地验收通过，已本地提交 | YAML/JSONC、用户配置解析、保注释局部写回、显式迁移和配置消费者通过 31 个聚焦套件 826/826，六个静态门、源码构建、单文件构建和隔离配置迁移入口通过。提交 `f7f9044c74e05eaa7d0d79dd5023a36fa475a294`，未推送。 |
| Batch 1 | 实现中，尚未串行验收 | 增加首轮环境请求投影、局部工具发现跨轮保留、缓存成本/usage 观测、摘要请求前缀复用、Bedrock 缓存断点和账户路由状态捕获。收尾步省略工具仍是安全合同。所有切片待串行消费者和 capability 反转验证。 |
| Batch 2 | 实现切片完成，待串行验收 | 嵌套调用 fail-closed、拒绝终止、逐调用审批、审批等待计时、脚本 receipt/diff、代码折叠与结果 hook 脱敏已有切片。字面 shell 模板复用原命令门。自动脚本后台化按进程句柄、CLI 清理和 turn-bound 权限事实暂缓，详见 `script-jobs.md`。 |
| Batch 3 | 多切片实现中，待串行验收 | 命令面板、主题入口、diff 换行、输入快捷键、首次连接引导、受控 LSP 候选、非否决 repeat 提醒和流空闲看门狗已有切片。worker 作业等待/晋升与注意力容量核实显示现有生命周期不能支持五秒后台化；自动晋升暂缓。 |
| Batch 4 | 实现中，外部集成仍未就绪 | README、INSTALL 与 Linux/macOS 发布工作流已起草。根项目 SPDX 与版权主体尚待持有人确认，未创建 LICENSE。固定归档基线实际落后五个提交，完整刷新仍需 pinned source checkout 与串行包构建。外部工作区资产必须经宿主审核发布路径及随构建携带的摘要验证，不得由上游命令直接改目标。 |

## 批次 0 验收清单

- [x] B0.1 默认 Ready / Configured 只呈现已就绪或明确绑定模型，完整目录在显式 Registry。裸 `/model`、`--list-models`、补全收窄，搜索遵循当前视图。
- [x] B0.2 连接按精确地址归属，唯一就绪 `/model use <provider>/<model>` 保存会话级连接。零/多候选和目录地址歧义拒绝。
- [x] B0.3 effort 不兼容时保留可选并回退 auto。成功写入模型后释放启动 `--model`，provider bridge 采用实时解析结果，保留 provider/key/endpoint 覆盖。
- [x] B0.4 重命名复用 session record transaction。RPC 忙时取消且不写入。回归覆盖事务重读与中断恢复。
- [x] B0.5 `.tmp/` 当前为空，未发现活动进程，不需要删除历史内容。
- [ ] B0.6 定向模型／连接／会话测试、反转回归及正常 Linux CLI 入口验证通过。使用四个已配置连接做脱敏的真实请求定向验收；网络、provider、认证、路由结果分开记录。
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
- Batch 4 许可证主体与标识未确定。不得由依赖或参考仓库推导根项目 LICENSE。

## 逐项执行账本

此表把仍然成立的行为缺口与已被源码反证的建议分开追踪。`进行中` 仅表示代码切片正在编写，不代表功能验收。

| ID | 核验结论 | 状态 | 验收边界 |
| --- | --- | --- | --- |
| B0.5.1 格式读取与路径优先级 | 成立 | 已验收 | YAML Core/JSONC、有界 descriptor 读取、profile、软链目标格式身份和项目路径。消费者回归通过。 |
| B0.5.2 YAML 局部写回 | 成立 | 已验收 | 标量 CST 原位编辑；注释、键序、BOM、CRLF、并发 sibling 与回读值测试通过。 |
| B0.5.3 人类配置显式迁移 | 成立 | 已验收 | 独占备份/目标身份、权限、软链、并发冲突和失败保留测试通过；隔离 Linux CLI 五文件迁移通过。 |
| B0.5.4 机器状态、沙箱与原子写 | 部分成立 | 已验收 | Hooks/主题保留 JSON 文件名并解析 JSONC；沙箱无效 YAML 显式拒绝；模型目录与 workflow 消费者采用所选格式。 |
| B0.5.5 串行验收 | 成立 | 已验收 | 826/826 聚焦测试、六项静态门、源码构建、Linux 单文件构建及 migration CLI 入口通过。提交 `f7f9044c74e05eaa7d0d79dd5023a36fa475a294`。 |
| B1.1 首轮环境前缀稳定 | 缺口成立，原持久历史描述错误 | 进行中 | 沿已准入 prompt 元数据投影相同环境字节，不重写原始用户消息。 |
| B1.2 动态发现导致的 schema 波动 | 部分成立 | 待执行 | 保留每轮授权/注册表新鲜度；只稳定确认的核心工具和受支持 wire 能力。 |
| B1.3 收尾步保留工具 schema | 与安全合同冲突 | 不适用 | 已有 endpoint 测试明确省略 tools 和 tool_choice。 |
| B1.4 Responses 缓存键缺失 | 结论过时 | 不适用 | 能力允许时已有键；私有路由头和服务增量链须按 endpoint 单独证明。 |
| B1.5 费率/预热与状态栏命中率 | 状态栏缺口成立 | 待执行 | 不填造未公布价格，只呈现真实 provider usage；预热不可用原因可观测。 |
| B1.6 microcompact 前移到存储层 | 请求投影变化成立，修复建议未证明 | 待裁定 | 不改变持久 transcript/工具结果保真合同。 |
| B1.7 复用压缩请求前缀/远端 compact | 需要产品协议裁定 | 待核实 | 不默认把摘要 system/tools 或私有 compact 协议用于所有 endpoint。 |
| B1.8 Bedrock cachePoint | 缺口成立 | 待执行 | 仅按模型能力插入，并验证每个断点和请求转换。 |
| B1.9 system prompt 稳定 | 波动点成立 | 待执行 | 与动态工具名分离需覆盖权限、提示规则和真实请求投影。 |
| B2.1 嵌套工具无宿主执行器 | 缺口成立 | 进行中 | 缺宿主 gate 时不产生任何工具副作用。 |
| B2.2 无理由拒绝终止脚本 | 缺口成立 | 进行中 | 区分反馈拒绝和停止拒绝，保留既有调用回执与外层终态。 |
| B2.3 codemode 常驻授权与 plan 策略 | 缺口成立 | 进行中 | 不持久授权脚本整体；只读 plan 仍逐调用鉴权。 |
| B2.4 内部执行 TUI receipt/代码折叠 | 缺口成立 | 进行中 | 消费有父子身份的 receipt，不建立第二份调用状态。 |
| B2.5 审批等待暂停脚本预算 | 缺口成立 | 进行中 | 只暂停真实用户交互等待，取消/并发等待可结算。 |
| B2.6 PostToolUse 安全覆写 | 部分成立 | 待执行 | 可隐藏秘密但保留成功/失败、工具、已发生效果和审批证据。 |
| B2.7 shell 模板与长脚本后台晋升 | shell 模板已实现；脚本转后台反证成立 | 脚本转后台暂缓 | shell tag 只走既有 gated bash；TaskRegistry 接管的是本地进程 handle，不能续行 worker；细节见 `script-jobs.md`。 |
| B3.1 命令面板、主题入口、并排 diff | 缺口成立 | 待串行验证 | 复用能力过滤、主题预览 lease、差异选择与分页 owner。 |
| B3.2 Alt+Up、首启引导、媒体连接池 | 缺口成立 | 待执行 | 保留排队/补全区分、现有连接身份与凭据 owner。 |
| B3.3 受控 LSP 候选选择 | 自动启动与安全合同冲突 | 有界修订 | 仅显示候选，用户明确选择后才允许现有 server owner 启动。 |
| B3.4 repeat-tool reminder 与 stream idle watchdog | 缺口成立 | 实现待验收 | 有界参数摘要、阈值 3/5/8 和已排序结果附着；不 veto、跳过调用不计数；stream watchdog 与 native deadline/取消分类分离。 |
| B3.5 jobs/diff 汇总过滤与注意力并发 | 部分成立 | 实现待验收，自动晋升暂缓 | 精确 run settlement waiter、审批等待临时观察和 jobs 投影去重已实现。五秒晋升受 child registry 生命周期限制。人类输入不使用 worker journal 槽位，扩大容量不能形成优先槽。 |
| B3.6 文件拆分/死代码清理 | 大模块存在，具体死代码未指定 | 待核实 | 先按职责列候选与反例，再做独立小批。 |
| B4.1 README/安装/许可证/发布工作流 | 部分成立 | 进行中 | Linux/macOS 构建可复现；LICENSE 需持有人信息。 |
| B4.2 固定门控包刷新 | 版本缺口成立，实际相差五提交 | 待执行 | pinned source 干净、提交全哈希匹配，刷新包/manifest 后串行验证。 |
| B4.3 外部工作区门控资产携带 | 缺口成立 | 进行中 | 包内 digest、profile 隔离、沙箱可读和 Node/单文件消费者验证。 |
| B4.4 外部工作区一键初始化 | 缺口成立，原建议绕过批准 writer | 待裁定 | 使用现有 `/init` 及普通 patch/审批/readback；无经验证 staged 生成器前不宣称完成。 |

## 每批门禁与状态

- Batch 0.5 已串行运行 31 个定向套件、六项静态门、源码构建、Linux 单文件构建及正常 CLI 配置迁移入口。下方记录具体证据；真实 provider 与本批无关。
- Batch 1 需请求捕获与 prefix 测试、缓存成本/usage/状态呈现、endpoint 适配测试及针对 capability 的反转；真实模型缓存命中只记录服务实际返回，不设伪造收益阈值。
- Batch 2 需 worker 与真实 `runTurn` 的拒绝反例、hook/权限/回执消费者测试、审批 UI 停止路径、并行调用结算、静态门和源码构建。不得为验证拒绝而对用户工作区写文件。
- Batch 3 每项按对应 TUI owner 用短 PTY/终端尺寸和键序列验证；只在 Linux 侧执行。无真实外部服务器或账号证据时按 `not_configured` 报告。
- Batch 4 需 pinned 包哈希与外部隔离工作区回读、Linux 可执行文件标签/摘要/安装目录验收、发布 workflow 静态审计。没有许可证持有人选择时 LICENSE 与公开 Release 仍为阻断项。

## Batch 3.5 设计边界

- `/director wait` 监听当前 run 的 settlement promise，精确保留 run identity；调用方等待超时和取消只结束观察，不取消 worker。状态输出按安全行与详情做差值发布。
- 审批等待提示来自未结算的审批 prompt，限于内存中的 operation，不持久化确认、密钥或输入内容；run 结束后消失。
- 五秒自动晋升不能复用子会话的原生任务登记器。`AgentService` run 结束时关闭子会话 `TaskRegistry`，会杀掉它接管的进程；父会话的 `/jobs` 使用另一份 `JobStore`，缺少进程、artifact、停止权限和精确作用域的转移合同。未把 worker 命令发布到父会话。
- 已比较持久任务登记、原生命令存活期和短等待 UI 的参考决策。它们采用既有 job 身份持续读取或有期限的前台等待，没有找到“启动五秒后即可脱离 child turn”的共同契约。目标深度审计所引的执行文档未在配置的参考树中找到，因此不将该具体时间规则当作产品事实。
- 当前两槽 agent journal 不承载前台输入；增加 agent 槽位无法创建 human-priority slot。没有共同调度器、准入与结算 owner 时不增加槽位。

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
- 生产 `--list-models` 入口只展示配置的 9 个模型。nofx、apikey-casa 和 BaiLu 在隔离临时 workspace 发出请求并完成。workbuddy 连接选择正确，但 `127.0.0.1:7863` 没有监听服务，真实请求归类为 provider/network failure。
- 测试副作用：第一次真实请求启动时复用了已有 Cheers session，将其模型选择改为 `bailu-2.8`。原选择没有执行前快照，不能安全推定并回写。本机 session ID 是 `sess_ce712b9e215964b0_1795310273004`。
- 外部临时 workspace 和其中创建的测试 session 已删除。本批本地提交 `8d310529435445028890a165d67c11fb81b1a2c0`，未推送。

## 完成及提交规则

每个仍成立的任务必须有测试或明确的最近验证和其局限。已有功能、冲突合同与过时说法记为纠正项，不作为实现完成。每个批次完成后记录改动文件、定向测试、Linux 构建或原生入口、真实 provider 结果、未验证边界和本地提交号。只有所有必需任务逐项完成或被源码反证后记录为不适用，整个目标才能结束。
