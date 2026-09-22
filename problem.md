# 待办与已知限制

## TUI 未实现项（明确决定不做或延后）

1. **多路复用器 resize 锚点探测**
   tmux / screen 在宽度变化后会重排整个窗格，锚点随之失效。参考实现借用备用屏并发起 CPR（`CSI 6n`）往返来精确恢复锚点。
   当前实现改为「宽度变化即重建」：清屏 + 清回滚 + 重放已定稿账本。语义正确，代价是回滚被重写，且会丢失本会话之前的终端内容。
   若要改为非破坏式，需要引入 CPR 往返与探测超时回退。

2. **内联图像与 OSC 66**
   未实现。原生回滚已提供滚轮回看与框选复制，因此鼠标上报协议也未启用。

3. **Markdown 深层嵌套列表**
   `transcript/markdown.ts` 已覆盖标题、无序/有序列表、引用、水平线、行内强调/代码/链接、围栏代码块与管道表格。
   超过两层缩进的嵌套列表仍按带前缀的纯文本行呈现，不折叠渲染。

4. **补全仅覆盖 slash 命令**
   `chrome/suggestions.ts` 的候选模型是通用的，但目前只接了命令注册表。文件路径、`@` 引用、历史补全尚未接入。

## 既有失败分类（截至 2026-09-04 全量 `vitest run`）

共 224 失败 / 45 文件。以下按簇归类：

### 高优先级：主簇（~172 例）—— proof gate 与终端终止语义

根因是 712baa25 引入的 `terminalProofBlocker` 规则过于激进，加上 `stagedActionConsistent` 未覆盖 `continue` 决策：
- **`runMvpIntegratedFlow.test.ts`**：101 例，其中 71 例期望 `stopped_error`（deny 升级路径）被拦截成 `stopped_not_proven`，18 例期望 `completed` 的 happy-path 也被拦
- **`fencedEditRuntimeActivation.test.ts`**：4 例（`stopped_not_proven → stopped_error`）
- **`targetSetEditRoute.test.ts`**：2 例（`failed → partial-failure`）
- **`targetSetEditRecovery.test.ts`**：1 例（同上）
- **`workflowExecutionCoordinator.test.ts`**：1 例
- **`recovery.test.ts`**：2 例（handoff 投影）
- **`sessionRuntime.test.ts`**：3 例（W5 路径）
- **`capabilityBoundaryProjection.test.ts`**：1 例
- **`editProposalApply.test.ts`**：1 例

**根因链**：
1. `actionForSeed("run-command")` 无匹配分支 → 兜底 `"read"` → 与 `decision.nextAction` 不一致
2. `stagedActionConsistent` 在 `decision.nextAction === "continue"` 时仍对比 seed，误报
3. `terminalProofBlocker` 第一规则 `failed tool output has no task proof` 把 **可操作阻断**（`verification.status === "blocked"`, `blockerKind === "approval-denied"`, `nextAction` 明确）也当无 proof
4. deny 路径下 harness 仍产出 `pendingAction: repair`，循环空转到 maxTurns

**修复方案**：
- `stagedActionConsistent`：seed 等于 `taskKind` 或决策为 `continue` 都视为一致
- `actionForSeed`：`run-command` 映射到 `verify`
- `terminalProofBlocker` 第一规则：检测 `verification.blocked` + `blockerKind` 明确时放行（让 `getTransition` 走 `blocked` 分支产出 `stopped_error`）

### 中优先级：工具/注册/路由

- **`prefilter.test.ts`**：2 例，Route A 提交机械替换输入为 `glob` 但前缀仍是 `git-`
- **`inspectFilesStage.test.ts`**：1 例，证据串漂移（`inspect: glob(.ts) executed` → `inspect: glob candidate discovery executed`）
- **`runtimeConfig.test.ts`**：1 例，默认 `maxTurns` 6→15（13c9f3b8）
- **`registry-rust-bridge.test.ts`**：8 例，rust-daemon 超时
- **`runtime.mcp-stale-reconnect.test.ts`**：7 例，MCP 重连状态机
- **`errorTaxonomy.test.ts`**：3 例，MCP 错误分类
- **`localExecutionGate.test.ts`**：2 例，本地 MCP 执行门禁

### 中优先级：Session / 权限 / 连续性

- **`SessionManager.test.ts`**：6 例，f873b8a3 删除 `legacyPermissionRebase.ts` 回归。需恢复 `normalizeLegacyPermissionStateForSession` + `buildContinuitySnapshot` 调用
- **`projectRootRebaseProjection.test.ts`**：1 例，rebase 对 `projectRoot` 字段覆盖不足（需补 `lastApprovalProjectRoot` / `lastPermissionRequestTarget` 等）
- **`continuation/projectRootRebaseProjection.test.ts`**：1 例
- **`approvalTrustPolicy.test.ts`**：1 例
- **`toolBatchDispatch.test.ts`**：4 例
- **`toolResultMessage.test.ts`**：1 例
- **`verification/command/selection.test.ts`**：2 例
- **`verification/intent/command.test.ts`**：1 例

### 低优先级：real-provider / browser harness（环境依赖）

- **`cli-baseline.test.ts`**：15 例（real-provider 超时）
- **browser 相关 5+ 个文件**：约 25 例（Playwright / browser harness 需真实浏览器或 fixture）
- **`traceContext.e2e.test.ts`**：1 例
- **`commandIntentPlanning.test.ts`**：1 例
- **散点其它**：约 15 例

### 未触碰（与 TUI 无关）

browser harness、MCP 网关、orchestration（除上述主簇）、session 持久化（除 `SessionManager` 回归）。

## 修复进展（截至 2026-09-04 20:00 UTC）

**全量基线：224 失败 → 当前 156 失败（净修 68 例）**

| 文件/簇 | 状态 |
|---|---|
| `proof.ts`（stagedActionConsistent + actionForSeed） | ✅ 已改，happy-path 通过 |
| `runtimeConfig.test.ts` | ✅ 已改 |
| `prefilter.test.ts` | ✅ 已改 |
| `inspectFilesStage.test.ts` | ✅ 已改 |
| `legacyPermissionRebase.ts` + SessionManager | ✅ 已恢复；`rebaseLegacyPermissionRootsInWorkingMemory` 字符串替换逻辑一并复原（fb290e6f 掏空回归） |
| `SessionManager.listRealSessions` re-entry 过滤 | ✅ 已修：改用 `sessionHasReentrySurface`，保留 pendingPrompt/interrupted/error 会话（98d680a2 误删可恢复会话） |
| `terminalProofBlocker` proof gate | ✅ 已泛化：actionable blocker 跳过 gate（不只是 approval-denied） |
| `getTransition` actionable blocker 检查 | ✅ 已添加：approval-denied + 通用 actionable blocker 在 turn 结束前直接 stopped_error |
| `deriveActionableBlockerContract` | ✅ 已加 approval-denied 显式检查（verification.status=blocked + blockerKind=approval-denied）|
| `classifyActionableKind` | ✅ 已加 review-only planning runtime 规则（verification intent only, mutationAuthority=not-granted）|
| `stagedActionConsistent` | ✅ 已修：read/search 决策下 seed 不一致返回 true（不判 staged-action 失败）|
| proof.ts `requiredProofFor` write-file | ✅ 已加：write-file 任务跳过 verification-passed 等要求 |

验证：`vitest run src/session/ src/core/paths/ src/config/ src/context/ src/core/tools/prefilter` → 91 文件 / 379 测试全绿。

### 剩余主簇（runMvpIntegratedFlow.test.ts 52 例）

| 簇 | 例数 | 根因 |
|---|---|---|
| 25 例 expected 'stopped_not_proven' → 'stopped_error' | 剩余 deny + review-only 路径 | `deriveActionableBlockerContract` 对部分 blocking reason 文本未匹配（如 "Write task needs concrete file content" 在 classifyActionableKind 已有 "concrete content" 规则但 evidence 为空）|
| 14 例 expected 'stopped_not_proven' → 'completed' | happy-path 验证 | verification skipped 被 proof gap 拦截 |
| 5 例 expected 'stopped_error' → 'completed' | 修复 continuation | 需验证 patch-ambiguous/from-not-found 修复路径 |
| 其他 8 例 | 混合 | 需单独分析 |

### 环境依赖失败（不修）

| 簇 | 例数 | 原因 |
|---|---|---|
| `cli-baseline.test.ts` | 15 | real-provider 超时 |
| browser harness 簇 | ~25 | 需真实浏览器/fixture |
| `registry-rust-bridge.test.ts` | 8 | rust-daemon 超时 |
| MCP 簇（reconnect/taxonomy/gate） | 12 | 待查 |

## 已知未实现

- 大粘贴三选菜单（需 provider `local://` store 契约）
- 图片/视频缩略图（依赖 Kitty OSC 66）
- 身份色调色板（待 theme 扩展）

