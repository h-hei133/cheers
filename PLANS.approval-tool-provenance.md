# Structured Approval / Tool Execution Provenance Contract

## 1. 总目标

建立一条 structured approval / tool execution provenance contract 路线，把 approval decision、tool execution、provider/model failure、terminal result、session continuity 的归因从散落 evidence marker 与文本推断，逐步收束到可测试、可持久化、可兼容旧结果的结构化 contract。

本路线直接服务用户最小真实主路径：

- Step 4: real model / real toolchain 下 permission escalation 必须明确 approved / denied / blocked。
- Step 5: terminal state 必须清楚区分 success / stopped / error，且 failure 可行动。
- Step 6: continue / resume 必须保留 approval/tool failure provenance，而不是依赖脆弱字符串。

本轮只创建计划文件，不实现 checkpoint。

## 2. 当前分支

- 当前路线分支：`approval-tool-provenance-contract`
- 从本地 `main` 创建。

## 3. base/main 状态

- 创建分支前只读确认：`main...origin/main`
- base commit：`a0ab74f Seal PTY interactive harness fidelity track`
- `main` 与 `origin/main` 均指向 `a0ab74f`。
- 工作树在创建分支前为 clean。
- PowerShell profile warning 是已知环境噪音，不作为产品失败。

## 4. 背景审查结论

此前路线已阶段性封口：

- `main-path-boundaries`: 三大巨型文件第一轮边界治理。
- `real-main-path-evidence`: CLI / real-ish main path evidence。
- `long-session-continuity-hardening`: compact / replay / resume / continue continuity。
- `real-provider-safe-evidence`: real-provider safety attribution / redaction / dry-run evidence。
- `live-tty-interactive-evidence`: interactive pipe-spawn evidence。
- `pty-interactive-harness-fidelity`: 明确 pipe-spawn 不等于 true PTY，D-H blocked/deferred pending true PTY strategy approval。

最新审查结论：用户可见层已经能区分 explicit approval denied 与 approved execution failed，但内部结构化 contract 仍薄弱，继续新增同族 proof 的收益低于收束 approval/tool provenance contract。

## 5. 为什么选择 structured approval / tool execution provenance

当前最大风险不是再增加一个 smoke，而是 provenance 仍部分靠 evidence marker、error 文本、failedFiles、repair notes、verification notes 组合推断：

- approval decision provenance 缺少统一结构：approved / denied / skipped / not-required / escalation-denied。
- tool execution provenance 缺少统一结构：executed-succeeded / executed-failed / permission-blocked / approval-denied / sandbox-preflight-blocked / unavailable-tool。
- provider/model failure 与 tool execution failure 的边界需要保持分层，避免 terminal/result/continuity 混淆。
- `resultMapper`、`sessionRuntime`、continuity 继续新增 regex 或 marker 会让后续恢复语义更脆。

本路线先结构化内部 contract，保持用户可见行为不变，再逐步接线。

## 6. 明确不做的方向

- 不新增 provider，不改 auth core。
- 不读取、复制、修改、打印或清理真实 auth/key/provider 配置。
- 不运行 real-provider smoke，不默认运行 `verify-real-user-capabilities`。
- 不处理 Windows EBUSY。
- 不修 `runMvpIntegratedFlow` 全量旧失败。
- 不实现完整 apply_patch、AST patch、rollback、batch engine、stream mid-flight retry、全局网络重试。
- 不继续 provider readiness、real-provider dry-run、edit/patch marker、verification surface、long-session、live TTY、PTY 同族 proof，除非发现明确 approval/tool provenance 缺口。
- 不改变已有用户可见 terminal wording，除非先证明旧行为是 bug。

## 7. 环境约束

- 目标仓库：`D:\LenovoSoftstore\pyproject\source-claudecode\private-coding-agents`
- Claude Code 参考仓库只读：`D:\LenovoSoftstore\pyproject\source-claudecode`
- opencode 参考仓库只读：`D:\LenovoSoftstore\pyproject\opencode`
- real-provider home 固定为 `D:\Test\home-sf`，不得读取、复制、修改、清理或泄露。
- synthetic home 固定为 `D:\Test\pca-home-synth`，验证时设置 `PRIVATE_AGENTS_PROVIDER_MODE=synthetic`。
- 失败态或隔离验证只能使用临时 synthetic/test home。
- RTK command discipline active：读文件、搜索、git status/diff/log、测试、构建和大输出命令必须显式使用 `rtk`。

## 8. 参考实现约束

目标仓库优先，参考仓库只吸收语义边界，不照抄代码。

Claude Code targeted reference:

- `QueryEngine.ts`
- `query.ts`
- `commands.ts`
- permission / approval / tool result 相关文件
- cli print / structured output 相关文件
- `tools/FileReadTool/FileReadTool.ts`
- `tools/FileEditTool/FileEditTool.ts`

opencode targeted reference:

- `packages/opencode/src/permission/permission.ts`
- `packages/opencode/src/tool/tool.ts`
- `packages/opencode/src/tool/bash.ts`
- `packages/opencode/src/tool/edit.ts`
- `packages/opencode/src/cli/cmd/run.ts`
- `packages/opencode/src/acp/agent.ts`
- `packages/opencode/src/session` 或 event 相关文件

吸收点：

- permission asked / replied 与 tool execution failed 如何分层。
- approval denied 与 execution failed 如何结构化表达。
- failed tool result 如何进入 session event / user-visible result。
- result / session / continuity 如何保留 provenance。

## 9. 三大巨型文件新增代码约束

三大文件不是绝对禁止修改：

- `packages/ts-shell/src/entrypoints/cli.tsx`
- `packages/ts-shell/src/session/SessionManager.ts`
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`

但只有功能确实归属于入口 wiring、durable state、orchestration sequencing 时才最小修改，并说明为什么不能放在独立模块。

新增 helper / adapter / fixture 优先放入：

- `packages/ts-shell/src/core/tools/*`
- `packages/ts-shell/src/core/query/*`
- `packages/ts-shell/src/core/shell/*`
- `packages/ts-shell/src/orchestration/*`
- `packages/ts-shell/src/session/*`
- `packages/ts-shell/src/test-utils/*`

`runMvpIntegratedFlow.ts` 若需要接线，只允许写入 structured provenance 的最小桥接，不继续塞入 classification / formatting / regex 推断。

## 10. 当前已闭合能力

- CLI packaged entry、`--print`、stdin、interactive pipe-spawn evidence 已有阶段性证据。
- result contract、cli-entry、synthetic golden main path 已有验证入口。
- provider readiness / real-provider safety attribution 已有 dry-run 级别证据。
- long-session continuity、compact/replay/resume/continue 已有阶段性证据。
- explicit approval denied 与 approved execution failed 在用户可见输出上已经可区分。
- `QueryEvent` 已有 `approval.requested`、`approval.resolved`、`tool.started`、`tool.result`。

## 11. 当前主要风险

- `QueryEvent.approval.resolved` 目前只有 `approved | denied`，无法表达 skipped / not-required / escalation-denied 等来源差异。
- `QueryEvent.tool.result` 目前只有 `success`，无法表达 approval-denied、permission-blocked、sandbox-preflight-blocked、unavailable-tool、executed-failed 等来源差异。
- `CodingResultSummary` 尚无独立 approval/tool provenance contract 字段。
- `resultMapper.ts` 仍从 evidence marker 与 reason 文本推断 actionable blocker。
- `sessionRuntime.ts` 仍从 evidence marker、terminal reason、verification blocker、reason 文本推断用户可见 recovery guidance。
- `runMvpIntegratedFlow.ts` 仍承担 approval outcome、tool result、verification blocker、terminal evidence 拼接等多重职责。
- Session continuity 会继承字符串化语义，后续 continue/resume 容易把 approval denied 与 execution failed 混淆。

## 12. 当前 approval / tool execution provenance 地图

目标代码事实：

- `packages/ts-shell/src/core/query/events.ts`
  - `approval.requested`: `{ toolName, taskId }`
  - `approval.resolved`: `{ toolName, taskId, outcome: "approved" | "denied", compensated? }`
  - `tool.started`: `{ toolName, taskId }`
  - `tool.result`: `{ toolName, taskId, success, compensated? }`
- `packages/ts-shell/src/core/tools/approvalFlow.ts`
  - `ToolApprovalFlow.authorize` 调用 sandbox enforcer。
  - denial 返回 `deniedResult(...)`，metadata 目前只携带 `wasEscalated`。
- `packages/ts-shell/src/core/tools/runtime.ts`
  - allowlist / unregistered / approval policy / execution error 都返回 `ToolExecutionResult`，但 provenance 主要在 error/metadata 中散落。
- `packages/ts-shell/src/core/tools/toolResultLifecycle.ts`
  - durable lifecycle index 记录 pending approvals/tools 与 lastEvent，但不记录结构化 execution provenance。
- `packages/ts-shell/src/orchestration/types.ts`
  - `CodingResultSummary` 包含 verification、failedFiles、evidence、failureBoundary 等字段，但没有 approval/tool provenance 字段。
- `packages/ts-shell/src/core/query/resultMapper.ts`
  - `isBashExecutionFailure` 依赖 `failedFiles.path === "(command)"` 与 `current-permission-request-*` evidence marker。
  - actionable blocker 仍从 `actionable-blocker-kind:*`、`mutation-summary-blocker:*` marker 和 reason 文本推断。
- `packages/ts-shell/src/core/shell/sessionRuntime.ts`
  - compact/verbose rendering 仍从 evidence marker、verification blocker、stop reason 和 task reasons 推导 next action。
- `packages/ts-shell/src/session/SessionManager.ts`
  - continuity / recovery 会保存 query events 与 coding result，但尚未显式保存 approval/tool provenance contract。

参考语义：

- Claude Code 侧有 permission denial tracking 与 tool use/result boundary，强调 permission denial 与 execution failure 分层进入 query/result。
- opencode 侧有 `permission.asked` / `permission.replied` event 语义，tool execution result 与 permission rejection 分层表达。

## 13. 路线分阶段 backlog

Completed:

- A. Approval/tool provenance contract audit
  - Completed in commit pending for this checkpoint.
  - Scope: read-only audit plus plan update; no production or test code changed.
  - Main-path steps advanced: Step 4 approval/tool provenance clarity, Step 5 terminal failure attribution, Step 6 continuity provenance preservation.
  - Target audit findings:
    - `packages/ts-shell/src/core/query/events.ts` is the current event contract source: `approval.resolved` only carries `approved | denied`, and `tool.result` only carries `success`.
    - `packages/ts-shell/src/orchestration/toolLifecycleEvents.ts` is the current lifecycle adapter source: approval outcome is derived from `ToolExecutionResult.metadata.wasEscalated === true ? "denied" : "approved"`, so approval denial, approval not-required, skipped approval, and execution failure are not separately represented.
    - `packages/ts-shell/src/core/tools/approvalFlow.ts` returns `deniedResult(...)` with `wasEscalated`, making policy denial visible but not yet a full provenance contract.
    - `packages/ts-shell/src/core/tools/runtime.ts` emits allowlist denial, unregistered tool denial, approval policy denial, MCP unavailable-tool-style denial, and runtime execution error through the same `ToolExecutionResult` shape.
    - `packages/ts-shell/src/core/tools/toolResultLifecycle.ts` durable lifecycle index preserves last event and basic outcome/success but not structured execution provenance.
    - `packages/ts-shell/src/core/query/queryLoop.ts` compensates orphaned approval/tool lifecycle events as `denied` and `success:false`, which is useful durability evidence but not a product-level denial/execution provenance source.
    - `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts` still emits `current-permission-request-*` evidence markers and maps approval-denied / actionable blockers across orchestration-specific result construction.
    - `packages/ts-shell/src/core/query/resultMapper.ts` still detects bash execution failure from `(command)` failedFiles plus `current-permission-request-*` evidence markers, and derives actionable blocker kind from evidence markers or reason text.
    - `packages/ts-shell/src/core/shell/sessionRuntime.ts` still renders/reasons over approval and command failure using evidence markers, blockerKind, stopReason, and text fallbacks.
    - `packages/ts-shell/src/session/SessionManager.ts` parses `current-permission-request-*` evidence markers for continuity and compensates lifecycle events, so continuity currently inherits string-marker provenance.
  - Reference audit findings:
    - Claude Code `QueryEngine.ts` tracks permission denials separately from tool execution and carries permission denial evidence into result/output metadata.
    - Claude Code `query.ts` / tool execution path keeps permission checks in the query/tool boundary rather than terminal rendering.
    - opencode `permission.ts` exposes `permission.asked` / `permission.replied` events and represents user rejection as a permission-layer result.
    - opencode `tool.ts` / `bash.ts` keep tool execution result metadata separate from permission decisions, which supports a clean permission-vs-execution boundary.
  - Decision: B should design the smallest compatible provenance type/fixture first; production wiring should not start in `runMvpIntegratedFlow.ts`.
- B. Provenance type / fixture planning
  - Completed in commit pending for this checkpoint.
  - Scope: added a test-utils-only fixture/type draft; no production path imports it.
  - Added `packages/ts-shell/src/test-utils/approvalToolProvenanceFixtures.ts`.
  - Fixture shape:
    - `ApprovalDecisionProvenanceFixture` captures approval kind, source, toolName, taskId, escalation, and compensation.
    - `ToolExecutionProvenanceFixture` captures execution kind, source, toolName, taskId, success, failureBoundary, and compensation.
    - `LegacyCodingResultCompatibilityFixture` records how the same scenario maps to current `evidence`, `verification`, and `failedFiles`.
  - Scenario fixtures:
    - `approvalDeniedProvenanceFixture` keeps approval denial separate from execution failure and maps to legacy `approval-denied` verification blocker evidence.
    - `approvedExecutionFailedProvenanceFixture` keeps an approved bash command failure as `executed-failed` while preserving the legacy `(command)` failedFile plus `current-permission-request-tool:bash` evidence.
    - `unavailableToolProvenanceFixture` represents tool registry/MCP unavailability separately from approval denial and runtime execution failure.
  - Compatibility decision: future production wiring should promote or mirror this shape in a real module only after C/D helpers prove the boundaries; old sessions without these fields must continue to rely on legacy evidence fallback.
- C. Approval decision provenance helper
  - Completed in commit pending for this checkpoint.
  - Scope: added the smallest production helper in `packages/ts-shell/src/core/tools/approvalProvenance.ts` plus focused tests.
  - Added `deriveApprovalDecisionProvenance(...)` to map approval decision provenance from structured metadata first, then legacy `wasEscalated` metadata.
  - Added `toLegacyApprovalOutcome(...)` so existing `QueryEvent.approval.resolved.outcome` remains `approved | denied`.
  - Updated `packages/ts-shell/src/orchestration/toolLifecycleEvents.ts` to call the helper instead of directly checking `metadata.wasEscalated`.
  - User-visible terminal wording and event wire shape are unchanged.
  - `runMvpIntegratedFlow.ts`, `SessionManager.ts`, and `cli.tsx` were not modified.

Current:

- D. Tool execution provenance helper

Backlog:

- E. runMvp minimal provenance wiring
- F. resultMapper structured consumption
- G. sessionRuntime structured rendering guard
- H. continuity preservation guard
- I. route audit / merge readiness

Verification:

- A completion:
  - `rtk git status --short` passed; only `PLANS.approval-tool-provenance.md` was modified.
  - `rtk npm run build -w packages/ts-shell` first failed with sandbox/dist write `EPERM`, then passed with the same RTK command elevated.
- B completion:
  - `rtk npm run build -w packages/ts-shell` first failed with sandbox/dist write `EPERM`, then passed with the same RTK command elevated.
  - `rtk npm run test -w packages/ts-shell -- src/core/query/resultMapper.test.ts` first failed with Vitest/esbuild `spawn EPERM`, then passed with the same RTK command elevated: 18 tests passed.
- C completion:
  - `rtk npm run test -w packages/ts-shell -- src/core/tools/approvalProvenance.test.ts` first failed with Vitest/esbuild `spawn EPERM`, then passed with the same RTK command elevated: 4 tests passed.
  - `rtk npm run test -w packages/ts-shell -- src/core/tools/runtime.test.ts -t "explicit denial"` first failed with Vitest/esbuild `spawn EPERM`, then passed with the same RTK command elevated: 1 test passed, 4 skipped.
  - `rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts -t "approval"` first failed with Vitest/esbuild `spawn EPERM`, then passed with the same RTK command elevated: 14 tests passed, 130 skipped.
  - `rtk npm run build -w packages/ts-shell` first failed with sandbox/dist write `EPERM`, then passed with the same RTK command elevated.

Notes:

- A deliberately did not read, copy, modify, or clean `D:\Test\home-sf`.
- A did not run real-provider smoke or `verify-real-user-capabilities`.
- A did not modify production code, tests, provider/auth core, or the three giant files.
- B deliberately did not read, copy, modify, or clean `D:\Test\home-sf`.
- B did not run real-provider smoke or `verify-real-user-capabilities`.
- B did not modify production code, tests, provider/auth core, or the three giant files.
- C deliberately did not read, copy, modify, or clean `D:\Test\home-sf`.
- C did not run real-provider smoke or `verify-real-user-capabilities`.
- C did not modify provider/auth core or any of the three giant files.
- The next checkpoint should implement tool execution provenance helper boundaries, still before runMvp codingResult wiring.

## 14. 每个 checkpoint 的目标、允许修改文件、禁止修改文件、验证命令

### A. Approval/tool provenance contract audit

目标：只读审计 approvalFlow、tool runtime、runMvp approval lifecycle、resultMapper、sessionRuntime、SessionManager continuity 中 approval/tool provenance 的来源、marker、文本推断点。

允许修改：

- `PLANS.approval-tool-provenance.md`

禁止修改：

- 生产代码。
- 测试代码。
- real-provider 配置和真实 home。

验证：

```powershell
rtk git status --short
rtk npm run build -w packages/ts-shell
```

### B. Provenance type / fixture planning

目标：设计最小结构化类型或 fixture，不接生产路径；明确如何兼容现有 `CodingResultSummary`、`evidence`、`repairNotes`。

允许修改：

- `PLANS.approval-tool-provenance.md`
- 可选 `packages/ts-shell/src/test-utils/*` fixture 草案，若不接生产路径。

禁止修改：

- `cli.tsx`
- `SessionManager.ts`
- `runMvpIntegratedFlow.ts`
- provider/auth core

验证：

```powershell
rtk npm run build -w packages/ts-shell
rtk npm run test -w packages/ts-shell -- src/core/query/resultMapper.test.ts
```

### C. Approval decision provenance helper

目标：把 approval decision outcome 判断收束到独立 helper，不再从 error 文本推断；如果已有 helper，则冻结为测试覆盖。

允许修改：

- `packages/ts-shell/src/core/tools/*`
- `packages/ts-shell/src/core/query/*`
- focused tests

禁止修改：

- 用户可见 terminal wording，除非证明旧行为是 bug。
- provider/auth core。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/core/tools/runtime.test.ts -t "explicit denial"
rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts -t "approval"
```

### D. Tool execution provenance helper

目标：结构化表达 tool executed/failure、approval denied、permission blocked、sandbox preflight blocked、unavailable tool 的来源。

允许修改：

- `packages/ts-shell/src/core/tools/*`
- `packages/ts-shell/src/orchestration/*`
- focused tests

禁止修改：

- full apply_patch / AST / rollback / batch engine。
- Rust execution responsibility，除非发现跨 runtime contract 必须变更且另开计划。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/core/tools/runtime.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts -t "approval"
```

### E. runMvp minimal provenance wiring

目标：只做最小接线，让 `runMvpIntegratedFlow` 把 structured provenance 写进 codingResult 或现有可兼容字段；不改 terminal 行为。

允许修改：

- `packages/ts-shell/src/orchestration/*`
- 必要时最小修改 `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- focused tests

禁止修改：

- CLI entry behavior。
- broad runMvp refactor。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts -t "approval"
rtk npm run verify:result-contract
```

### F. resultMapper structured consumption

目标：让 resultMapper 优先消费 structured provenance，fallback 才读旧 evidence marker；保持输出不变。

允许修改：

- `packages/ts-shell/src/core/query/resultMapper.ts`
- `packages/ts-shell/src/core/query/resultMapper.test.ts`
- provenance helper/adapter module

禁止修改：

- runMvp broad behavior。
- terminal wording。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/core/query/resultMapper.test.ts
rtk npm run verify:result-contract
```

### G. sessionRuntime structured rendering guard

目标：确认 sessionRuntime 用户输出仍区分 approval denied 与 approved execution failed，但优先使用 structured provenance。

允许修改：

- `packages/ts-shell/src/core/shell/sessionRuntime.ts`
- `packages/ts-shell/src/core/shell/sessionRuntime.test.ts`
- shared provenance helper

禁止修改：

- 用户可见 wording，除非旧行为被证明错误。
- CLI entry wiring，除非必须。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts -t "approval"
rtk npm run verify:result-contract
```

### H. continuity preservation guard

目标：确认 SessionManager continuity / follow-up context 能保留 structured approval/tool provenance，不只靠文本 marker。

允许修改：

- `packages/ts-shell/src/session/*`
- `packages/ts-shell/src/core/shell/*`
- 必要时最小修改 `SessionManager.ts`

禁止修改：

- session storage format 的破坏性迁移。
- compact/resume 同族 proof 扩张。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts
rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts -t "approval"
```

### I. route audit / merge readiness

目标：路线阶段性完成后集中验证 build、result-contract、cli-entry、approval focused tests、synthetic golden，不继续扩同族 proof。

允许修改：

- `PLANS.approval-tool-provenance.md`
- route seal commit only

禁止修改：

- 新增 checkpoint。
- real-provider smoke。
- unrelated production code。

验证：

```powershell
rtk git status --short
rtk npm run build -w packages/ts-shell
rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts -t "approval"
rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts -t "approval"
rtk npm run test -w packages/ts-shell -- src/core/query/resultMapper.test.ts
rtk npm run verify:result-contract
rtk npm run verify:cli-entry
HOME=D:\Test\pca-home-synth USERPROFILE=D:\Test\pca-home-synth PRIVATE_AGENTS_PROVIDER_MODE=synthetic rtk npm run test:gate:golden-main-path
```

## 15. 失败归因规则

验证失败必须先归因：

1. 本路线引入的真实回归。
2. 既有旧失败。
3. 过宽 filter 命中 unrelated case。
4. 环境问题，例如 sandbox EPERM、spawn EPERM、dist 写入失败、网络超时、PowerShell profile warning。
5. 并行分支或 main 差异导致。

如果是本路线引入的真实回归，允许做最小修复并重跑相关验证。
如果不是本路线引入的问题，不扩大修复；记录归因并停止合并。
如果无法确认归因，不 merge。

## 16. result / session continuity contract 兼容规则

- 用户可见 behavior 与 terminal wording 默认保持不变。
- structured provenance 必须兼容现有 `CodingResultSummary`、`evidence`、`verification`、`failedFiles`、`failureBoundary`。
- `resultMapper` 与 `sessionRuntime` 必须先读 structured provenance，再 fallback 到旧 evidence marker / reason 文本。
- 旧 session transcript / coding result 不能因为缺少新 provenance 字段而不可 resume。
- continuity preservation 必须保留 approval denied 与 approved execution failed 的区别。
- provider/model failure 不得被写成 tool execution failure。
- approval denied 不得被写成 executed-failed。

## 17. RTK/audit 残留规则

本轮和后续验证可能产生：

- `.sisyphus/audit/permissions.jsonl`
- `packages/ts-shell/.sisyphus/audit/permissions.jsonl`
- `rtk/history.db`

结束前必须清理或还原，不得提交 audit 残留、真实用户配置、临时 home、无关生成物。

如果 `rtk git restore/status` 会再次写 audit，说明原因后使用最小 raw git restore/status 清理确认。

## 18. 提交/push 规则

- planning-only commit message:

```text
Plan approval tool provenance contract track
```

- checkpoint commit 必须描述实际 checkpoint。
- 不把多个 checkpoint 混在一个 commit。
- push 因认证、网络、权限或审核失败时，不绕过、不反复重试；记录失败原因、当前 commit hash、当前 git status。
- 本路线如果最终 merge 回 main，必须先完成 route audit / merge readiness 和 post-merge verification。

## 19. 当前推荐第一个 checkpoint

Current:

- `A. Approval/tool provenance contract audit`

类型：

- read-only audit / planning checkpoint

推荐原因：

- 现有用户可见输出已经能区分 explicit approval denied 与 approved execution failed。
- 但内部 provenance 来源散落在 `approvalFlow`、`ToolRuntime`、`runMvpIntegratedFlow`、`resultMapper`、`sessionRuntime`、`SessionManager`。
- 直接实现 helper 前，需要先精确标注哪些地方是 source-of-truth、哪些是 derived marker、哪些是 text fallback。

本轮不执行 A，只创建路线计划文件。

## Checkpoint Status Override

- Completed: A. Approval/tool provenance contract audit.
- Completed: B. Provenance type / fixture planning.
- Completed: C. Approval decision provenance helper.
- Current: D. Tool execution provenance helper.
- Backlog: E. runMvp minimal provenance wiring; F. resultMapper structured consumption; G. sessionRuntime structured rendering guard; H. continuity preservation guard; I. route audit / merge readiness.
- Verification for A: `rtk git status --short` passed; `rtk npm run build -w packages/ts-shell` passed after elevated rerun for sandbox/dist write EPERM.
- Verification for B: `rtk npm run build -w packages/ts-shell` passed after elevated rerun for sandbox/dist write EPERM; `rtk npm run test -w packages/ts-shell -- src/core/query/resultMapper.test.ts` passed after elevated rerun for Vitest/esbuild spawn EPERM, 18 tests passed.
- Verification for C: focused approvalProvenance/runtime/runMvp approval tests and build passed after elevated reruns for Vitest/esbuild spawn EPERM and sandbox/dist write EPERM.
- Notes: A was a read-only audit plus plan update. B added a test-utils-only provenance fixture/type draft and did not connect it to production wiring. C added a production approval provenance helper in `core/tools` and only rewired lifecycle outcome derivation to preserve the legacy event shape. No provider/auth core, real-provider home, or three-giant-file logic was changed. D should implement tool execution provenance helper boundaries before runMvp codingResult wiring.
