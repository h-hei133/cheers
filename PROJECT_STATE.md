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
- Rust daemon 入口发现支持 PATH cargo fallback，且 unavailable reason 会显式列出已检查候选
- pending lifecycle reconcile 对重复调用保持幂等
- pending lifecycle reconcile 在 transcript 已存在 direct / compensated resolution 时不会重复追加 synthetic cleanup
- prompt-level recovery 也会在 resume 前 reconcile pending lifecycle，不再只覆盖 turn-interrupted 分支
- runtime seed 在 `tryResume()` 之后仍基于 interrupted durable truth 构建，不会被提前洗平成 fresh state
- `stopped_*` 不再通过 durable `lastError` 污染终态，而 true error 仍保留 `lastError`
- `state.json` / recovery snapshot 现在显式持久化 `durableStatus = success | stopped | error`，不再只靠 `status + terminalClassification + lastError` 拼语义
- fresh-only recovery seed 不再泄漏 compacted transcript / derived context
- replayPlan.repairSummary 与 `QueryRuntimeStateSeed.truthBoundary.repairSummary` 在 stripped terminal facts 上保持一致
- recovery snapshot 与 runtime seed 的 pendingLifecycle read-model 现在会优先反映 transcript truth，而不是盲信 stale state.json
- resumed run 不会再次写入 duplicate prompt barrier（`run-started` / user message）污染 durable transcript
- direct resolution 与 orphaned lifecycle cleanup 在同一轮 query path 中已验证保持 bundle 级 exactly-once 语义
- identical direct `approval.resolved` / `tool.result` durable events 现在具备 append-time exactly-once 防护
- cross-interrupt replay / recovery path 已验证可在同一链路上同时保持 replay repair、pendingLifecycle cleanup、runtime seed 与 true-error durable terminal state 一致
- explicit terminal envelope classification（尤其 `error`）现在不会在 result mapping 阶段被静默压成 `stopped`
- 跨中断恢复链路已验证：pending lifecycle reconcile、repairSummary 注入、runtime seed boundary 与 stopped terminal durable payload 可在同一条 runtime 路径里同时成立

## 6. 当前故意不做的边界

- 不改 `query.completed / query.failed` 事件命名
- 不扩 session 顶层 status taxonomy
- 不扩 shell UX
- 不做 sidecar lifecycle store
- 不把 replay/recovery/orchestration 推到 Rust

## 7. 已知高价值缺口

- 更强的 stop-vs-fail 终态协议收口
- replay substrate / compact / recovery read-model 在更长 bundle 上的一致性审计
- MCP capability routing 的 cache / invalidation / reconnect 韧性
- 更大范围的 cross-interrupt replay / recovery integration audit

## 8. 当前首选切片

- query loop / terminal envelope / stop vs fail
- 选择原因：
  - replay substrate、recovery read-model 与 lifecycle cleanup 的几条关键长链路已经有了更强的一体化证明
  - 当前更值当的是回到仍然偏 coarse 的 terminal envelope / durable status 边界继续收口
  - 这一层仍是当前最明显的“语义已分化但 durable 表达还偏粗”的剩余高价值点

## 9. 当前首选任务

- 任务标题：收紧 terminal envelope 与 durable status 的剩余 coarse boundary
- 任务归属：TS control plane
- 本轮目标：
  - 继续减少 stopped / error / success 在 durable 顶层表达里的 coarse 混叠
  - 在不扩 taxonomy 的边界内收紧 durable state 与 terminal envelope 的语义一致性
  - 降低 recovery read-model 对粗糙 terminal state 的二次推断成本

## 10. 上一轮完成

- 任务：更大范围的 cross-interrupt replay / recovery integration audit
- 结果：
  - interrupted prompt + stale pendingLifecycle + replay repair + resumed run + true-error durable state 已在同一条恢复链路里联合验证
  - replayPlan、runtime seed、pendingLifecycle cleanup、terminalClassification、lastError 现在具备更强的 bundle 级一致性证明
  - 已补齐 recovery 侧更长 integration test 与手工验证
- 关键结论：
  - cross-interrupt recovery 的关键读写层（replayPlan / snapshot / seed / final state）已经可以在同一路径上保持一致
  - 下一步收益更高的不是继续堆 integration 长度，而是回到 terminal envelope 的 coarse durable boundary 继续收口
- 验证来源：targeted vitest / `tsc --noEmit` / manual QA / Oracle verification

## 11. 当前风险

- TS / Rust contract drift
- long-tail parity chase
- cross-layer regression risk
- recovery path 悄悄退化为 fresh rerun
- seed 职责膨胀成隐式全状态容器
- tool / approval lifecycle direct-resolution 与 synthetic cleanup 再次分叉
- replay read-model 与 compact substrate 在更长 multi-turn / handoff 场景下悄悄漂移
- recovery read-model 在 bundle 级别只局部成立、但跨 acceptance surface 组合后再次分叉
- transcript append-only truth 与 mutable state snapshot 再次出现优先级倒置
- tool / approval cleanup 在更长 bundle 中仍可能出现“只局部 exactly-once、整体仍分叉”问题
- 当前 bundle 级 exactly-once 仍主要覆盖单轮 runtime path，跨中断恢复后的组合路径还需要更长 integration audit
- append-time dedupe 现在已收口，但跨 writer / recovery bundle 的更长路径仍需继续组合验证
- terminal durable state 仍然偏 coarse，需要依赖 envelope 字段补语义
- top-level `status` 依旧 coarse，但 durableStatus 已开始承接更明确的 coarse durable boundary
- result mapping 如果忽略 explicit terminalClassification，仍会把 richer envelope 再次压扁

## 12. 下一轮候选任务

- P1：收紧 terminal envelope 与 durable status 的剩余 coarse boundary
- P2：MCP capability cache / reconnect hardening
- P3：更长 multi-turn / handoff replay read-model consistency audit
- P4：tool / approval cleanup 的更长 multi-step exactly-once 审计
- P5：更长 cross-interrupt terminal / replay combined audit

## 13. 本轮不要扩做的内容

- 广义 command/skill surface parity
- shell UX / renderer polish
- completed/stopped/error 大范围 taxonomy 扩展
- lifecycle index sidecar store
- replay/recovery/orchestration 下沉 Rust
- 与 acceptance surface 无关的 CLI 行为细节
