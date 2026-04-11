# PROJECT_STATE

## 1. 项目定位

- 项目名称：private-coding-agents
- 当前定位：严格设限的 runtime hardening 项目
- 不是：全面 ClaudeCode clone / 开放式功能扩张项目
- 当前目标：保住既有 TS control plane / Rust execution plane / contracts 边界，在核心 runtime 闭环上逐块收口

## 2. 架构立场

- TypeScript = control plane
  - shell
  - session
  - orchestration
  - slash command
  - recovery
  - permission UX
  - MCP capability routing
  - runtime durability / replay / recovery semantics

- Rust = execution plane
  - daemon
  - command execution
  - timeout / cancel
  - sandbox preflight
  - process-oriented execution responsibility

- contracts = cross-runtime semantic boundary

## 3. 当前阶段

- 当前阶段：晚期基础建设 / 早期硬化
- 当前工作模式：收口式 hardening，不做开放式扩张
- 当前成功标准：核心 runtime 闭环越来越稳，且不会持续跨层回归

## 4. 当前 acceptance surface

- query loop / terminal envelope / stop vs fail
- session durability / replay / recovery invariants
- transcript -> runtime re-entry
- pending lifecycle -> reconcile -> resume
- tool lifecycle / permission / approval / compensation
- command / shell / MCP capability routing

## 5. 已确认成立的能力

- unified query loop：`submitMessage()` / `streamMessage()` 已统一到同一套 query loop
- `terminalReason`
- `terminalClassification = success | stopped | error`
- retryable error with withhold-and-retry
- orphaned tool / approval lifecycle compensation
- `QueryRuntimeStateSeed` 驱动的 replay / recovery
- durable lifecycle index in `state.json`
- terminal persistence
- recovery re-entry marker（`markRecoveryReentry()`）

## 6. 当前故意不做的边界

- 不改 `query.completed / query.failed` 事件命名
- 不扩 session 顶层 status taxonomy
- 不扩 shell UX
- 不做 sidecar lifecycle store
- 不把 replay/recovery/orchestration 推到 Rust

## 7. 已知高价值缺口

- 更强的 stop-vs-fail 终态协议收口
- 更强的 replay substrate 与 compact/re-entry 对齐
- 更强的 tool execution cleanup / synthetic completion 语义
- MCP capability routing 的 cache / invalidation / reconnect 韧性

## 8. 当前首选切片

- transcript -> runtime re-entry substrate
- 选择原因：
  - 当前已有 `QueryRuntimeStateSeed`
  - recovery facts 已能参与 re-entry
  - 但 transcript / compact / replay / runtime seed 的边界仍可能偏“够用”而非“durable truth”
  - 这是当前最接近核心 durable substrate 的收口点

## 9. 当前首选任务

- 任务标题：强化 transcript -> runtime re-entry substrate 的一致性
- 任务归属：TS control plane
- 本轮目标：
  - 让 transcript / replay facts 与 `QueryRuntimeStateSeed` 的关系更明确、更稳定
  - 减少 recovery path 对 fresh-run 语义的依赖
  - 强化 runtime re-entry 基于 durable facts，而不是临时拼装状态

## 10. 上一轮完成

- 任务：对照 ClaudeCode load-bearing runtime semantics，完成当前 acceptance surface 的差距分析
- 结果：
  - 已明确哪些语义已覆盖 / 部分覆盖 / 故意不做
  - 已形成下一轮优先级
  - 已产出实现 agent 输入包
- 关键结论：
  - 顶层 session / orchestration / recovery 继续留在 TS
  - Rust 当前只承担 execution responsibility
  - 当前最该推进的是 transcript -> runtime re-entry substrate
- 验证来源：对照 agent 源码分析结果

## 11. 当前风险

- TS / Rust contract drift
- long-tail parity chase
- cross-layer regression risk
- recovery path 悄悄退化为 fresh rerun
- seed 职责膨胀成隐式全状态容器

## 12. 下一轮候选任务

- P1：强化 transcript -> runtime re-entry substrate 的一致性
- P2：收紧 terminal envelope 与 durable status 协议
- P3：强化 pending lifecycle reconcile 与 tool cleanup 一致性
- P4：补一条跨中断恢复的 runtime 集成测试
- P5：MCP capability cache / reconnect hardening

## 13. 本轮不要扩做的内容

- 广义 command/skill surface parity
- shell UX / renderer polish
- completed/stopped/error 大范围 taxonomy 扩展
- lifecycle index sidecar store
- replay/recovery/orchestration 下沉 Rust
- 与 acceptance surface 无关的 CLI 行为细节
