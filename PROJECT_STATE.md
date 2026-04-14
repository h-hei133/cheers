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
- 当前成功标准：热点 runtime 面在真实代码与 targeted 验证中持续收口，且下一步能升级到更宽的 runtime-closure 审计而不是继续局部打磨

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
- repeated resume 长链路已验证可在同一会话上稳定经历 fresh-entry -> mid-turn-reentry 转换，并保持 pendingLifecycle cleanup / replay repair / terminal durable payload 一致
- 跨中断恢复链路已验证：pending lifecycle reconcile、repairSummary 注入、runtime seed boundary 与 stopped terminal durable payload 可在同一条 runtime 路径里同时成立
- MCP gateway 在 snapshot 后会清理 stale client cache，invoke 时也会按当前 config 重新校验连接状态，不再继续暴露 stale capability
- stale visible MCP tool descriptor 即使仍暂留在 runtime visibility 中，execute 路径也会按当前 auth / reconnect state 正确拒绝
- stale MCP tool descriptors 即使仍短暂保留在 runtime visibility 中，执行时也会被当前 reconnect/auth state 正确拒绝，不会继续成功调用旧 capability
- 当前热点验证现实：`core/mcp/gateway.test.ts`、`core/tools/runtime.test.ts`、`daemon/parity.test.ts`、`sandbox.test.ts` 在当前工作树上均可通过
- 当前工作树验证现实：`npm run build` 通过，`packages/ts-shell/src` 的 LSP diagnostics 为 0 errors

## 6. 当前故意不做的边界

- 不改 `query.completed / query.failed` 事件命名
- 不扩 session 顶层 status taxonomy
- 不扩 shell UX
- 不做 sidecar lifecycle store
- 不把 replay/recovery/orchestration 推到 Rust

## 7. 已知高价值缺口

- 更强的 stop-vs-fail 终态协议收口
- replay substrate / compact / recovery read-model 在更长 bundle 上的一致性审计
- 更大范围的 cross-interrupt replay / recovery integration audit
- 更长 multi-turn / handoff replay read-model consistency audit
- 当前 targeted runtime slices 虽然可通过，但系统级 runtime-closure gate 仍未建立

## 8. 当前首选切片

- session durability / replay / recovery invariants
- 选择原因：
  - 当前真实改动热点在 MCP gateway / tool runtime，且对应 targeted tests 已通过
  - 这些热点已经不再是当前最值得继续追加 case 的位置
  - 当前更值当的是回到更长的 replay/recovery combined audit，把前几轮已收口的点放进更长链路继续验证
  - 这一层仍最接近“组合路径里是否会再次分叉”的下一类高价值风险

## 9. 当前首选任务

- 任务标题：进入系统级 recovery hardening 审计 / 测试加固
- 任务归属：TS control plane
- 本轮目标：
  - 枚举未覆盖的 recovery 长路径
  - 检查 repeated resume / mixed boundary / pending lifecycle / drift 组合下是否仍有退化路径
  - 判断当前 transcript -> runtime re-entry 切片是否接近收口上限
  - 停止继续在 MCP visibility / reconnect 这类已通过 targeted 验证的热点上追加低收益 case

## 10. 上一轮完成

- 任务：补齐 recovery 长链路中 pending lifecycle + drift + repeated resume 的系统级组合路径实现与验证
- 结果：
  - pending lifecycle reconcile、replay repair / drift、repeated resume、terminal durable payload 已在同一条更长 recovery 链路中联合验证
  - 第一次 resume 正确 fresh-entry repair，第二次 resume 稳定回到 mid-turn-reentry，未发生 fresh rerun 退化
  - prompt barrier 去重、direct approval resolution、synthetic orphan cleanup 与 final stopped terminal 在 repeated resume 下保持一致
- 关键结论：
  - recovery 长链路不只是单次 resume 可用，repeated resume 也能保持关键读写层一致而不发生 fresh rerun 退化
  - 当前 recovery 主线仍值得继续放大到更长 multi-turn / handoff 路径，但同粒度继续追加相似 case 的收益已经开始下降
- 验证来源：当前工作树 targeted vitest（gateway / tool runtime / parity / sandbox）/ `npm run build` / `lsp_diagnostics`

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
- 当前 focused integration 覆盖增强后，容易高估系统级 recovery 覆盖面
- recovery 长路径测试对 `SessionManager + resumeShellSession` 当前结构的依赖增强，后续重构时需要同步维护测试编排
- repeated resume 虽已拿到高价值 proof，但 multi-turn / handoff 长链路仍未进入系统级 closure gate

## 12. 下一轮候选任务

- P1：进入系统级 recovery hardening 审计 / 测试加固
- P2：更长 multi-turn / handoff replay read-model consistency audit
- P3：tool / approval cleanup 的更长 multi-step exactly-once 审计
- P4：收紧 terminal envelope 与 durable status 的剩余 coarse boundary
- P5：切到相邻 acceptance surface：pending lifecycle reconcile / tool cleanup 的更强集成验证

## 13. 本轮不要扩做的内容

- 广义 command/skill surface parity
- shell UX / renderer polish
- completed/stopped/error 大范围 taxonomy 扩展
- lifecycle index sidecar store
- replay/recovery/orchestration 下沉 Rust
- 与 acceptance surface 无关的 CLI 行为细节
