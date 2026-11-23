# 2026-11 路线图执行记录

**状态**：执行中。Batch 0 实现和 Linux 本地验收完成，仍有一个本地模型端点不可达。
**任务范围**：核实并执行 `.wiki/wiki/references/codex-and-frontier-gap-audit-2026-11.md` 与 `.wiki/wiki/references/cheers-next-phase-roadmap-2026-11.md` 中的后续批次。
**基线**：2026-11-23，源码提交 `f65ba979`。

这份记录只跟踪上述两份研究材料带来的后续工作。它与 `.wiki/refactor/upgrade/tasks.md` 中已有的 62 项会话／运行时计划分开计数，不重置或改写那份清单。目标仓库及 Linux 是本次可写、验证范围；参考树只读；真实模型只通过现有 Cheers 运行路径调用。测试和报告不读取或输出凭据。新产品文件、标识符、界面文案不引入其他项目的名称或标签，也不复制参考仓库实现。

基线工作区还包含已修改的 `.wiki/_index.md`、`.wiki/wiki/references/_index.md`，以及两份未提交的研究文档。它们属于已有工作，本次保留原样。后续每一批先按准确的验收范围验证，再单独本地提交。外部平台、Windows、实际计费和无法由 Linux 本机证明的结果单独标为未验证。

## 核实后需要执行的任务

| 批次 | 状态 | 当前证据与边界 |
| --- | --- | --- |
| Batch 0 | 实现完成，B0.6 部分验证 | 已实现 Ready / Configured、显式 Registry、视图内搜索、命令和补全收窄、精确地址归属、唯一连接会话切换、effort auto 回退、启动模型锁释放、事务重命名及 RPC 忙时取消。`.tmp/` 只有空目录，无活动进程或可清理历史文件。420 项聚焦测试、静态门禁、源码构建和 Linux 二进制构建通过。三个真实 endpoint 请求成功。workbuddy 选择正确连接，但 `127.0.0.1:7863` 无监听进程，请求为 provider/network failure。 |
| Batch 0.5 | 缺口已核实，待执行 | 已有 JSONC/CST 注释编辑、原子写入、路径身份和配置分层，没有 YAML 格式层或迁移命令。模型目录、沙箱、按键绑定、工作流、Hooks 和主题仍有 JSON 解析入口，`catalogStore.ts`、`approvalTrustPolicy.ts`、`crashLog.ts` 有直接写入。沙箱坏配置被折叠为缺省，需先确定诊断/拒绝合同。 |
| Batch 1 | 差距已核实，待执行 | `openingMessage` 是单次 turn 的临时开头，不会跨用户轮次改写持久消息首项。收尾步省略工具是现有安全合同。microcompact 只生成请求投影。缓存字段已有能力门控，未知粘性头和不具备增量合同的 WS 修改不能直接加入。剩余明确功能有缓存命中率 TUI，其他 endpoint/Bedrock/WS 项需独立协议证据。 |
| Batch 2 | 差距已核实，待执行 | 无宿主 executor 的公开 codemode 调用仍可直接执行效果工具。正常 turn 已经复用 hooks/权限。无备注拒绝可被脚本捕获后继续，外层存在长期 allow，嵌套回执不进入对话投影。原生 PostToolUse 不支持安全输出替换，需沿现有结果 owner 设计且保留效果证据。 |
| Batch 3 | 差距已核实，待执行 | `/queue`、后台任务、`Ctrl+O`、主题预览和运行态能力过滤已有。Tab 保留补全语义。语言服务器是显式可执行路径，不自动探测或安装。repeat-tool observer、stream idle watchdog、Alt+Up、首次连接引导与图像/分类连接池尚待处理。 |
| Batch 4 | 差距和边界已核实，待执行 | README、LICENSE、发布上传工作流缺失。单文件构建、平台验收、更新检查已有但不等于发布闭环。根项目许可/版权未确定。固定归档落后于只读源码四个提交，须走 `.normproof/package.mjs` 完整刷新。Hooks 能按任意根读取和核验资产摘要，但没有经过批准的外部资产安装路径，单文件产物也没有携带该资产。 |

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

## Batch 0 执行证据（2026-11-24）

- 实际投入 L；S.U.P.E.R 检查 10/10；无新增运行时依赖。新增未预见依赖 2 项，分别是私有模型来源标记跨配置快照复制，以及启动模型目标解析器传递到实际 provider bridge。
- Linux 验证 420/420 定向 Vitest。`verify:import-cycles`、`check:config-consumers`、`check:declarations`、`check:node-floor`、`check:lint`、`verify:docs-drift:strict`、`npm run build` 和 `npm run build:exe` 全部通过。
- 生产 `--list-models` 入口只展示配置的 9 个模型。nofx、apikey-casa 和 BaiLu 在隔离临时 workspace 发出请求并完成。workbuddy 连接选择正确，但 `127.0.0.1:7863` 没有监听服务，真实请求归类为 provider/network failure。
- 测试副作用：第一次真实请求启动时复用了已有 Cheers session，将其模型选择改为 `bailu-2.8`。原选择没有执行前快照，不能安全推定并回写。本机 session ID 是 `sess_ce712b9e215964b0_1795310273004`。
- 外部临时 workspace 和其中创建的测试 session 已删除。本批本地提交 `8d310529435445028890a165d67c11fb81b1a2c0`，未推送。

## 完成及提交规则

每个仍成立的任务必须有测试或明确的最近验证和其局限。已有功能、冲突合同与过时说法记为纠正项，不作为实现完成。每个批次完成后记录改动文件、定向测试、Linux 构建或原生入口、真实 provider 结果、未验证边界和本地提交号。只有所有必需任务逐项完成或被源码反证后记录为不适用，整个目标才能结束。
