# GOAL.md - Coding Agents 核心演进目标与当前交付状态

> **状态**：工业级真实化全量交付完成 (All 7 Phases A-G Resolved, 100% De-Mocked Production Quality)  
> **分支**：`normproof-observation`  
> **基准单测**：28/28 passed (208/208 tests green)  
> **架构判定**：NormProof SATISFIED (0 blocking errors, single-file function count <= 20, acyclic imports)  

---

## 核心战略目标 (Core Goals)

1. **SOTA 架构对齐与融合**：
   - 深度吸收 Pi、OpenCode、GitNexus、Claude Code、Codex 的设计哲学。
   - 构建具备 **QuadMemory 四层原生记忆**、**Agentic SDLC 工作流引擎**、**Smart 跨平台自适应 Shell**、**14 重 Stealth 反反爬统一浏览器**、**Anthropic / OpenAI 多模型原生适配** 与 **编译器级 AST 语法守护** 的下一代 Coding Agent 框架。

2. **精简高效且真实的工具链 (Real Production Toolchain)**：
   - 彻底消灭所有假数据与空壳：`/cost` 接入真实 Token 计费，`/context` 动态计算窗口，`/undo` 物理回滚工作区，`/fast` 联动采样，`/plugin` 物理磁盘持久化，`/brainstorm` 异步 LLM 推导，`lsp hover` 实时提取 AST 符号，`task` 派发真实子代理。

3. **编译器级前检与工程安全保障**：
   - 废除大括号计数法，接入 `ts.createSourceFile` 真实 AST 语法前检；
   - 废除 `node --version`，接入基于 `package.json` / `Cargo.toml` 智能工程测试选择；
   - 采用全指令签名哈希彻底消除 Bash 权限越权后门；
   - 实现多文件补丁写入失败时的 100% 自动回滚事务。

4. **形式化架构治理与长期可维护性**：
   - 严格遵守 `AGENTS.md` 与 NormProof 架构契约：单模块函数上限 $\le 20$，模块间依赖绝对单向无环，全仓 JSDoc 标准完备。
   - 实现 100% 测试套件全绿（28 套件 / 208 单测）与持续可验证的交付链条。

---

## 交付产物与导航

- **项目全景与使用指南**：[`PROJECT_GUIDE.md`](PROJECT_GUIDE.md)
- **技术债务与 26 项去伪存真全景台账**：[`problem.md`](problem.md)
- **学术与架构理论论证库**：[`.wiki/wiki/theses/`](.wiki/wiki/theses/)
- **技术 RFC 提案库**：[`.wiki/raw/notes/`](.wiki/raw/notes/)
- **Wiki 活动与演进日志**：[`.wiki/log.md`](.wiki/log.md)
