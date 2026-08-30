# GOAL.md - Coding Agents 核心演进目标与当前交付状态

> **状态**：全量交付完成 (All 4 Stages Resolved, SOTA Architecture Fully Integrated)  
> **分支**：`normproof-observation`  
> **基准单测**：24/24 passed (198/198 tests green)  
> **架构判定**：NormProof SATISFIED (0 blocking errors, single-file function count <= 20, acyclic imports)  

---

## 核心战略目标 (Core Goals)

1. **SOTA 架构对齐与融合**：
   - 深度吸收 Pi、OpenCode、Claude Code、DeepSeek-Harness、Oh-My-Pi、Stagehand 与 MemPalace 的设计哲学。
   - 构建具备 **QuadMemory 四层原生记忆**、**Agentic SDLC 工作流引擎**、**Smart 跨平台自适应 Shell**、**14 重 Stealth 反反爬统一浏览器**、**DeepResearch 递归研究** 与 **Brainstorming 双模态探索** 的下一代 Coding Agent 框架。

2. **精简高效的原生工具链 (Lean Toolchain)**：
   - 收敛合并低价值与冗余工具，强化原生 `bash`、`grep`、`read`、`write`、`edit`、`browser`、`web_search`、`web_fetch` 工具链。
   - 严格在 Plan 模式下保障跨平台只读静态命令白名单放行（Linux / macOS / Windows）。

3. **企业级系统健壮性与零资源泄漏**：
   - 彻底治理 Node.js 事件循环阻塞、无界数组内存膨胀、浏览器僵尸进程与未捕获 EPIPE 崩溃风险。
   - 保证全生命周期 Hook 调度与 LSP 语法守护异步化执行。

4. **形式化架构治理与长期可维护性**：
   - 严格遵守 `AGENTS.md` 与 NormProof 架构契约：单模块函数上限 $\le 20$，模块间依赖绝对单向无环，全仓 JSDoc 标准完备。
   - 实现 100% 测试套件全绿与持续可验证的交付链条。

---

## 交付产物与导航

- **项目全景与使用指南**：[`PROJECT_GUIDE.md`](PROJECT_GUIDE.md)
- **技术债务与 4 阶段修复全景清单**：[`problem.md`](problem.md)
- **学术与架构理论论证库**：[`.wiki/wiki/theses/`](.wiki/wiki/theses/)
- **技术 RFC 提案库**：[`.wiki/raw/notes/`](.wiki/raw/notes/)
- **Wiki 活动与演进日志**：[`.wiki/log.md`](.wiki/log.md)
