# RFC-001: 全仓库架构债务清算、死代码识别与低价值抽象精简方案

- **状态**：Draft / Proposed
- **作者**：Coding Agents Architecture Working Group
- **日期**：2026-08-28
- **影响范围**：`packages/ts-shell/src/`, `packages/python-eval/`, `packages/rust-core/`

---

## 一、 背景与核心痛点 (Context & Problem Statement)

在经历了多个 Sprint 的快速迭代后，`packages/ts-shell` 积累了大量**中间过渡层、未使用的历史降级分支、无真实流量消费的 Mock 抽象以及过深的嵌套包装**。这些代码不仅增加了维护成本，导致 TypeScript 类型推导变慢，更在开发中形成了严重的认知负担（Cognitive Load）。

通过对当前 140+ 源文件的全量扫描与引用分析，我们识别出以下四大类架构债务与死代码：

```mermaid
graph TD
  subgraph "架构债务四大病灶"
    D1[1. 历史迁移死代码<br/>legacyRootRebase / legacyPermissionRebase / v0.1 format]
    D2[2. 虚假生产代码 (Fake Production Code)<br/>packages/python-eval 离线评测伪装成运行时]
    D3[3. 极端过度抽象的投影管道<br/>QueryEvent 到 UI 经历了 40+ 无意义转换器]
    D4[4. 伪浏览器上下文死代码<br/>browserTrace / browserTxnReport 无真实 Headless 连接]
  end
```

---

## 二、 逐模块死代码与低价值代码详细审计清单

### 1. 历史迁移垫片与向后兼容死代码 (Legacy Shims & Compatibility Bloat)
- **`src/core/paths/legacyRootRebase.ts`**：原包含 416 行混合跨驱动器和旧版根路径重构逻辑。当前仅需保留 3 个纯函数，其余无用分支应彻底物理清理。
- **`src/session/continuation/legacyPermissionRebase.ts`**：针对 2025 年早期没有 `projectRoot` 字段的 Session 进行的修复。当前新建和恢复的 Session 均已包含 `projectRoot`，此模块属于纯死代码。
- **`src/session/store/` 中的历史降级分支**：检查是否存在 `v0.1` 格式元数据降级分支，全部统一为现代标准 Schema。

### 2. 伪生产模块隔离 (Isolating Fake Production Code)
- **`packages/python-eval/`**：
  - **现状**：仓库结构将其作为与 `packages/ts-shell`、`packages/rust-core` 并列的一级包，容易误导开发者以为 Python 拥有运行时所有权。
  - **真实情况**：`AGENTS.md` 明确规定 `packages/python-eval/` 是离线评测环境，绝非生产运行时。
  - **整改方案**：将 `packages/python-eval/` 重构为明确的 `benchmarks/python-eval/` 或从主 build 流程中彻底剥离。

### 3. 极度过度抽象的事件与投影管道 (Flattening Over-Abstracted Event Pipelines)
- **现状**：
  - 一个底层的 Tool Execution 事件在到达控制台前，经历了：
    `QueryEvent` $\rightarrow$ `RuntimeProjectionEvent` $\rightarrow$ `ProductLoopAdapterProjection` $\rightarrow$ `LoopTrajectoryProjection` $\rightarrow$ `ProductSurfaceSection` $\rightarrow$ `ProductSurfaceViewModel` $\rightarrow$ `SessionTerminalState`。
  - 这种“为了分层而分层”的模式导致新增一个字段需要修改 7 个中间转换器。
- **对齐标杆**：参考 `Pi` 的 `AgentSession` 事件总线模式，扁平化为：
  `AgentEvent` (typed union) $\rightarrow$ `TerminalSubscriber` (reactive render)。

### 4. 伪浏览器上下文死代码 (Mock Browser Contexts)
- **`src/core/context/browserTrace.ts`, `browserTxnTypes.ts`, `browserExecutionReceipt.ts`**：
  - 检查发现该系列文件声明了庞大的浏览器事务回放状态机，但没有任何真实的 CDP/Puppeteer/Playwright 驱动逻辑相连接。
  - **整改方案**：若当前不具备真实浏览器驱动，将其移入 `experimental/` 或精简为纯类型接口，避免污染核心上下文。

---

## 三、 清理与重构收益预测

| 治理指标 | 治理前 | 治理后目标 | 改进收益 |
| :--- | :---: | :---: | :--- |
| **全库总行数 (LOC)** | ~35,000 行 | ~22,000 行 | 减少 ~37% 冗余胶水代码 |
| **NormProof 证明差距数** | 27 处 | $\le 15$ 处 | 彻底消灭核心生产域的超限大单体 |
| **TS 全量编译耗时** | ~7.5s | $< 3.5s$ | 类型检查与构建提速 50%+ |
| **事件传递跳转层级** | 7 层 | 2 层 | 显著降低开发调试认知负荷 |
