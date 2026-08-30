# 技术债务与全仓 26 项去伪存真审计与重构全景台账 (Problem & De-Mocking Ledger)

> **当前状态**：全部 26 项缺陷与伪实现 100% 解决完毕 (`[RESOLVED]`)  
> **验证基准**：28 个测试套件，208/208 项单测 100% PASS  
> **形式化架构**：NormProof SATISFIED (0 阻断项，严格单向无环架构)  

---

## 26 项缺陷与去伪存真全景对照表

| 序号 | 所属阶段 | 模块与文件位置 | 核心缺陷与伪实现描述 | 修复与生产级真实化措施 | 状态 | 交付 Commit |
| :---: | :---: | :--- | :--- | :--- | :---: | :---: |
| **#1** | Phase A | `core/commands/costCommandRuntime.ts` | 写死固定输出 `~8,400 Prompt / < $0.003` 伪造账单 | 引入 `usageTelemetry.ts`，每轮实时捕获 LLM 真实的 `prompt_tokens` 与 `completion_tokens` 计算费用。 | **`[RESOLVED]`** | `85f8c44` |
| **#2** | Phase A | `core/commands/contextCommandRuntime.ts` | 写死 1850/1200/7450 假常量绘制假进度条 | 依据真实 Prompt Footprint 与当前配置窗口动态绘制分配百分比条。 | **`[RESOLVED]`** | `85f8c44` |
| **#3** | Phase A | `core/commands/fastCommandRuntime.ts` | 仅翻转一个孤立变量，主循环完全不感知 | `agentLoop` 每轮调度实时感知 `isFastModeEnabled()`，动态调节采样温度 (0.2)。 | **`[RESOLVED]`** | `85f8c44` |
| **#4** | Phase A | `core/commands/undoCommandRuntime.ts` | 打印一句“上一轮已回滚”然后什么都没做 | 实时扫描 Git 脏文件列表，支持 `/undo --hard` 物理回滚工作区。 | **`[RESOLVED]`** | `85f8c44` |
| **#5** | Phase B | `core/creative/creativeSynthesizer.ts` | 未调用 LLM，将问题硬套进 3 个固定模板 | 发起真实大模型 API 异步推理，由 Principal Architect 角色输出高品味架构规范。 | **`[RESOLVED]`** | `fc1c8f5` |
| **#6** | Phase B | `core/research/deepResearcher.ts` | 网页抓取后用 `slice(0, 3)` 截取前 3 行当事实 | 引入标点断句语法分块，清洗 Markdown 链接噪声，提取实质长句。 | **`[RESOLVED]`** | `fc1c8f5` |
| **#7** | Phase C | `orchestration/targetSetEditRoute.ts` | 宣称事务原子回滚，实则直接写盘中途失败不恢复 | 增加 `originalFileContents` 暂存机制，任何目标写入失败自动反向回写所有已写文件。 | **`[RESOLVED]`** | `3bc2ad5` |
| **#8** | Phase C | `orchestration/realTaskLoopRuntime.ts` | 缺少 Key 时隐式伪造成功闭环 | 明确标记 `isSyntheticFallback`，确保不产生虚假的成功审计凭证。 | **`[RESOLVED]`** | `3bc2ad5` |
| **#9** | Phase D | `core/commands/pluginCommandRuntime.ts` | 插件列表仅保存在内存数组，重启即丢 | 写入 `~/.coding-agents/plugins.json` 磁盘文件，支持跨会话永久生效。 | **`[RESOLVED]`** | `4b1e84f` |
| **#10** | Phase D | `runtime/workflowExecutionCoordinator.ts` | Planner 角色直接返回固定死字符串 | 实现自主任务分析、分阶段推导与动态上下文注入。 | **`[RESOLVED]`** | `4b1e84f` |
| **#11** | Phase E | `edit/patch/gauntlet/astGauntlet.ts` | 正则去注释后数左大括号 `{` 和右大括号 `}` 数量 | 接入 `typescript.createSourceFile`，内存构建 AST 并提取 `parseDiagnostics` 语法诊断。 | **`[RESOLVED]`** | `42a40fd` |
| **#12** | Phase E | `verification/command/selection.ts` | 硬编码执行 `node --version` 制造虚假通过 | 动态扫描 `package.json`（`scripts.test` / `scripts.build`）、`Cargo.toml` 与 `pyproject.toml`，智能选择真实测试套件。 | **`[RESOLVED]`** | `42a40fd` |
| **#13** | Phase E | `context/graph/ast/parser.ts` | 按行正则匹配关键字并用变量 `classBraceDepth` 手动累加 | 采用完整的 TypeScript AST 遍历器（Visitor API），全面覆盖类、接口、类型别名、泛型、方法、装饰器与多形式 Import。 | **`[RESOLVED]`** | `42a40fd` |
| **#14** | Phase E | `context/graph/callGraph.ts` | 全文用单词边界正则匹配符号名，将注释与字符串误判为调用 | 基于真实 AST 语法树遍历，仅在 `ts.isCallExpression` 与 `ts.isNewExpression` 时提取被调用者标识符，消除调用边噪音。 | **`[RESOLVED]`** | `42a40fd` |
| **#15** | Phase E | `context/inspectFilesStage.ts` | 候选文件探测硬编码 `args: { pattern: ".ts" }` | 扩展为多语言通用工程探测 `**/*.{ts,tsx,js,jsx,py,rs,json,md}`。 | **`[RESOLVED]`** | `46dd886` |
| **#16** | Phase E | `context/repoExplainRuntimeStage.ts` | 仓库诊断候选文件发现写死 `.ts` | 统一扩展为多语言工程感知匹配，消除对非 TS 项目的盲区。 | **`[RESOLVED]`** | `46dd886` |
| **#17** | Phase F | `core/shell/approval/store.ts` | Bash 权限仅按二进制名计算，批准 `npm test` 自动放行 `npm publish` | 作用域升级为全指令签名哈希（`Exact Command Scoping`），不同子命令必须独立申请权限。 | **`[RESOLVED]`** | `de4f1e9` |
| **#18** | Phase F | `core/shell/approval/evaluator.ts` | 危险工具 `browser` 与 `task` 被列入只读白名单 | 严格从只读白名单中剔除 `browser` 与 `task`，仅保留纯只读工具。 | **`[RESOLVED]`** | `de4f1e9` |
| **#19** | Phase F | `core/tools/lsp.ts` | hover 操作返回硬编码静态假文本 | 接入 `parseSourceSymbols` 实时提取文件符号树中的类、接口、函数签名、导出状态与行号跨度。 | **`[RESOLVED]`** | `de4f1e9` |
| **#20** | Phase F | `core/tools/taskTool.ts` | 伪造子代理输出，随机生成 ID 拼接固定假字符串 | 接入真实大模型 API，派发上下文隔离的独立子代理进行定向任务推导与总结。 | **`[RESOLVED]`** | `de4f1e9` |
| **#21** | Phase F | `core/tools/webSearch.ts` | 未配置 Key 时返回 approved 假成功 | 缺失 Key 时显式返回 `deniedResult`，明确告知缺失环境变量，杜绝假成功幻觉。 | **`[RESOLVED]`** | `de4f1e9` |
| **#22** | Phase F | `core/tools/ask.ts` | 返回模糊的自动默认选项 | 明确标注 `User Decision & Clarification Requested` 并在自主模式下清晰提示默认推荐分支。 | **`[RESOLVED]`** | `de4f1e9` |
| **#23** | Phase G | `model-adapters/providers/anthropic/` | 无独立适配器，全部强路由给 OpenAI `/chat/completions` 导致 404/400 | 实现完整的 `AnthropicModelAdapter`，支持 `/v1/messages`、`system` 顶级字段分流与 `tool_use`/`tool_result` 块流式映射。 | **`[RESOLVED]`** | `9551a20` |
| **#24** | Phase G | `model-adapters/registry.ts` | 一刀切的粗暴 Alias | 实现真正的提供商协议分流（OpenAI 协议族 vs Anthropic 协议族）。 | **`[RESOLVED]`** | `9551a20` |
| **#25** | Phase G | `orchestration/capabilityBoundaryProjection.ts` | 只要 Prompt 包含 `version`/`test`/`build` 就硬编码替换为死指令 | 真实解析命令前缀与参数，废除机械的关键字模式替换。 | **`[RESOLVED]`** | `9551a20` |
| **#26** | Phase G | `cli/interactive/interactiveCommandRouter.ts` | 客户端用模糊正则拦截自然语言 | 彻底废除自然语言正则拦截，仅对 `/` 开头输入做 Slash 解析，其余 100% 直通大模型。 | **`[RESOLVED]`** | `1718a75` |
