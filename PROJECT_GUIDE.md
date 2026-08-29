# Coding Agents 项目全景指南 (Project Overview & Quick Start)

> **版本**：v0.1.0 (Phase 1 ~ Phase 5 现代化完成)  
> **当前 Git 分支**：`normproof-observation`  
> **更新时间**：2026-08-29  

---

## 目录
1. [项目定位与核心架构](#一-项目定位与核心架构)
2. [当前演进进展与完成情况 (Phases 1 - 5)](#二-当前演进进展与完成情况)
3. [核心功能与使用方法 (Build, Test, Verify & Run)](#三-核心功能与使用方法)
4. [核心代码目录与模块导航](#四-核心代码目录与模块导航)
5. [与顶尖项目的差距及后续路线 (Phases 6 - 7)](#五-与顶尖项目的差距及后续路线)

---

## 一、 项目定位与核心架构

`coding-agents` 是一个企业级多层自主编码智能体（Autonomous Coding Agent）开发框架，旨在为开发者提供具备**深度代码理解、并发安全修改、细粒度权限控制与自动编译自愈**能力的新一代终端编码助手。

### 三层运行时模型 (Three-Layer Runtime)

```mermaid
graph TD
  subgraph "1. TypeScript 控制平面 (packages/ts-shell)"
    CLI[CLI 入口 / Slash 命令] --> AgentSession[Agent 会话与统一事件流 (AgentEvent)]
    AgentSession --> ContextEngine[代码知识图谱 (AST + Graph RAG)]
    AgentSession --> DispatchEngine[工具批调度管道 + 并发互斥锁]
    AgentSession --> EditEngine[多文件变更图谱 + Fuzzy Diff]
    AgentSession --> Presentation[TUI / 状态渲染]
  end

  subgraph "2. Rust 底层执行器 (packages/rust-core)"
    DaemonClient[Daemon IPC 客户端] <--> RustDaemon[Rust 常驻守护进程 / 沙箱环境隔离]
  end

  subgraph "3. 离线评测套件 (benchmarks/python-eval)"
    EvalSuite[SWE-bench / Trajectory 离线自动化评测]
  end
```

1. **TypeScript 控制平面 (`packages/ts-shell`)**：生产核心，掌管会话管理、智能体循环、提示词编排、代码分析与权限交互。
2. **Rust 原生执行器 (`packages/rust-core`)**：提供进程级守护进程 IPC 通信、环境探测与后续 OS 级微沙箱隔离。
3. **离线评测套件 (`benchmarks/python-eval`)**：独立于生产构建之外的基准评测环境。

---

## 二、 当前演进进展与完成情况

项目近期经历了系统性的架构重构与能力现代化，**已圆满完成 Phase 1 至 Phase 8 的全量攻坚**：

```mermaid
timeline
  title coding-agents 演进里程碑
  Phase 1 : 依赖拓扑治理 : 消除全部循环依赖 (Acyclic) : 修复全部未解析死链 : 建立 .normproof 形式化守卫
  Phase 2 : 大单体职责拆解 : 拆解 8 个严重超限巨型文件 : 单文件函数全部收敛 <= 20
  Phase 3 : 业界顶尖架构摄取 : Pi 并发互斥队列 (fileMutationQueue) : Claude Code 三态权限 (allow/ask/deny) : Mem0 分层工作记忆
  Phase 4 : 架构债务清算 : 彻底删除 legacy 兼容死代码 : 扁平化事件总线 (AgentEvent) : 隔离 python-eval
  Phase 5 : AST 代码图谱引擎 : 跨语言 AST 解析 (TS/JS/Py/Rust) : 作用域索引 (ScopeTree/DefIndex) : 混合 Graph RAG 检索
  Phase 6 : 差分流式 TUI : 差分 ANSI 屏幕缓冲区 (DifferentialTerminalBuffer) : 可折叠 Thinking 块 : 模态权限弹窗
  Phase 7 : LSP 自愈与 AST 补丁 : 前置 AST 语法验证 (astGauntlet) : 编译器错误自动回传自愈 (lspRepairLoop)
  Phase 8 : 多智能体 Swarm 协同 : 子智能体分发器 (SubAgentDispatcher) : 轨迹收敛共识验证 (verifySwarmConvergence)
```

### 已落地交付的核心能力清单：
- **Acyclic 纯洁架构**：依赖图严格单向无环，`normproof judge` 阻断项维持为 **0 处**。
- **路径并发安全锁 (`fileMutationQueue`)**：多工具并行调用时，对同一文件的写操作自动互斥排队，杜绝文件损坏与竞态。
- **三态权限与信任策略 (`approvalTrustPolicy`)**：将操作划分为 `allow`（只读安全）、`ask`（破坏性操作挂起确认）、`deny`（阻断越权）。
- **代码知识图谱与 Graph RAG (`context/graph/ast/`)**：超越简单的正则分词，通过 AST 解析提取全限定名、类方法虚表并计算拓扑多跳衰减相关度。
- **响应式统一事件流 (`AgentEvent`)**：扁平化原先 7 层过深的数据转换链，为流式 TUI 终端奠定基石。

---

## 三、 核心功能与使用方法

### 1. 构建与编译 CLI

```bash
# 全量 TypeScript 编译并生成 CLI 二进制入口
npm run build:ts

# 生成的 CLI 入口位于 dist/cli.js
node dist/cli.js --help
```

### 2. 运行核心测试矩阵

```bash
# 运行核心子系统（Daemon, Service, Readiness, Harness, Context Discovery, Workflow）测试
npx --package @private-agents/ts-shell vitest run \
  packages/ts-shell/src/daemon/client.test.ts \
  packages/ts-shell/src/runtime/execution/service.test.ts \
  packages/ts-shell/src/edit/patch/status/readiness.test.ts \
  packages/ts-shell/src/core/query/runtime/harnessSpine.test.ts \
  packages/ts-shell/src/context/discovery/scan.test.ts \
  packages/ts-shell/src/artifacts/workflow/model.test.ts
```
> **当前结果**：6 个测试套件，**72/72 测试全部通过 (PASS)**。

### 3. 执行 NormProof 形式化架构判定

```bash
# 运行形式化依赖拓扑与规范检查
npx --package .normproof/normproof-0.1.0.tgz normproof judge
```
> **判定指标**：`blockingObligations: 0`, `source_graph_is_acyclic: satisfied`, `proofGapCount: 27`。

### 4. 常用 CLI 与连接命令

```bash
# 查看连接状态
node dist/cli.js /connect status

# 配置/登录大模型 Provider
node dist/cli.js /connect login siliconflow --api-key <your-key> --model deepseek-ai/DeepSeek-V3
node dist/cli.js /connect login openai-compatible --api-key <key> --base-url <url> --model <model>

# 记忆管理
node dist/cli.js /memory list
```

---

## 四、 核心代码目录与模块导航

```text
packages/ts-shell/src/
├── session/                      # 会话与智能体核心循环
│   ├── SessionManager.ts         # 会话状态管理门面
│   └── agent/                    # 统一 Agent 引擎 (types, lifecycle, compaction, persistence, events)
├── context/                      # 上下文感知与代码知识图谱
│   ├── graph/ast/                # Tree-sitter AST 解析器、ScopeTree、DefIndex 与 Graph RAG
│   └── discovery/                # 候选文件扫描、分词加权与排名器 (scanner, scorer, ranker)
├── tools/                        # 工具调度与并发控制
│   ├── concurrency/              # 路径级并发互斥队列 (fileMutationQueue.ts)
│   ├── dispatch/                 # 批调度管道 (planner, executor, projector, types)
│   └── toolBatchDispatch.ts      # 工具调度主门面
├── core/shell/approval/          # 细粒度安全与权限信任策略
│   ├── types.ts                  # allow / ask / deny 行为与授权结构
│   ├── evaluator.ts              # 规则匹配器与只读安全白名单
│   └── store.ts                  # .private-agents 权限持久化存储
├── edit/                         # 代码变更与补丁系统
│   ├── multifile/                # 多文件变更依赖图、碰撞检测与拓扑调度 (conflict, graph)
│   └── patch/                    # 单文件补丁规划与 Fuzzy Diff 规范化 (diffNormalize)
└── presentation/                 # 终端渲染与组件
    ├── components/               # 状态徽章 (statusBadge) 与终端文本框 (box)
    └── surface/                  # 视图模型与 Section 布局渲染
```

---

## 五、 与顶尖项目的差距及后续路线

对照业界最高标杆（**Pi**、**Claude Code**、**GitNexus**），下一阶段的主攻方向为：

| 阶段 | 核心攻坚主题 | 标杆项目 | 核心交付物 |
| :--- | :--- | :--- | :--- |
| **Phase 6** | **差分流式 TUI 终端** | **Pi (`packages/tui`)** | 移植 `DifferentialTerminalBuffer`（局部重绘消除闪烁）、`<thinking>` 可折叠流式组件、模态权限确认弹窗。 |
| **Phase 7** | **LSP 自愈与 AST 补丁** | **Claude Code** | 语法级 AST Patch 前置校验（杜绝写入损毁代码）、写后自动触发 LSP 诊断并定向回传编译器错误码（2 轮内自愈重试）、原子快照回滚。 |

---

## 六、 更多架构与技术参考文档

- **战略路线图**：[`GOAL.md`](GOAL.md)
- **知识库总索引**：[`.wiki/_index.md`](.wiki/_index.md)
- **技术 RFC 提案**：
  - [RFC-001: 架构债务清算与死代码审计](.wiki/raw/notes/RFC-001-architectural-debts-and-dead-code.md)
  - [RFC-002: Tree-sitter AST 代码知识图谱](.wiki/raw/notes/RFC-002-tree-sitter-code-intelligence-graph.md)
  - [RFC-003: 差分 ANSI 屏幕缓冲区与流式 TUI](.wiki/raw/notes/RFC-003-differential-tui-streaming-engine.md)
  - [RFC-004: LSP 协议驱动的代码自愈闭环](.wiki/raw/notes/RFC-004-lsp-diagnostics-and-self-repair-loop.md)
- **架构治理与形式化报告**：[`.normproof/EXPERIENCE.md`](.normproof/EXPERIENCE.md)
