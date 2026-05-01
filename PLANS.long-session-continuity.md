# Long-Session Continuity / Compact-Resume Hardening Plan

## 1. 总目标

建立一条专门面向长期真实使用风险的 hardening 路线，逐步验证并加固 compact、replay、resume、continue 后的连续任务语义。目标不是继续做同族 proof，也不是再做机会主义抽取，而是确保 stopped、verification-failed、tool-failed、edit-failed 等终态在长会话和 compact 后仍能保留 actionable context，并让用户可以继续同一任务而不需要手动修复上下文。

本路线直接服务 user-minimal real main path 第 5 步和第 6 步：

- 第 5 步：系统发出清晰 terminal state，并持久化 actionable error / stopped / success 信息。
- 第 6 步：用户可以在 interruption、compact、resume、continue 后以一致语义继续任务。

## 2. 当前分支

`long-session-continuity-hardening`

该分支从 clean `main` 创建。创建前 `main` 顶部为 `61c6034 Seal real main path evidence track`，且 `mainpath-real-cli-evidence` 和 `refactor-main-path-boundaries` 路线均已合并收口。

## 3. 背景审查结论

项目已进入 usable MVP / hardening phase。前序路线已经完成主路径边界重构和 real main path evidence 收口，当前不应继续 opportunistic extraction 或 evidence 同族 proof。

现有 session continuity 已具备重要基础：

- `SessionManager.ts` 已导入并使用 `compactSummaryFormatter.ts`、`continuityFormatter.ts`、`replayPlanBuilder.ts`。
- session tests 已覆盖 auto-compact threshold、approval audit、action result seed handoff summary 等局部场景。
- evidence track 已覆盖 CLI print、approval、failed tool follow-up、provider readiness classification、stopped/failure follow-up 和 compact long-session evidence design。

当前下一风险不在“有没有 helper 文件”，而在 compact / replay / resume 后是否真的保留了失败和 next-action 语义。

## 4. 为什么选择 long-session continuity / compact-resume

真实用户长期任务最容易断在会话边界：长上下文 compact 后，系统可能保留了文本摘要，但丢失结构化 failure provenance、target files、changed files、verification detail、nextAction 或 stopped recovery context。

该路线比继续 CLI evidence 或泛化重构更贴近当前最大真实风险：

- 它验证用户能否在失败后继续同一任务。
- 它覆盖 compact / replay 这类短 smoke 不容易触达的长会话路径。
- 它保护 terminal result block 的真实性，避免 failure/stopped 被压扁成 generic summary。
- 它约束新增逻辑不要继续堆入 `cli.tsx`、`SessionManager.ts`、`runMvpIntegratedFlow.ts`。

## 5. 明确不做的方向

本路线不做以下事项，除非后续有直接 compact/resume 回归证据证明其阻塞主路径：

- 不新增 provider，不修改 auth core。
- 不读取、复制、修改或清理 `D:\Test\home-sf` 下真实 auth/key/provider 配置。
- 不默认运行 `verify-real-user-capabilities`。
- 不处理 Windows EBUSY。
- 不修 runMvpIntegratedFlow 全量旧失败。
- 不实现完整 apply_patch、AST patch、rollback、batch engine、stream mid-flight retry、全局网络重试。
- 不把 synthetic golden 通过包装成 real-provider 成熟证据。
- 不继续 provider reconnect、edit/patch failure marker、verification surface、CLI print smoke 同族 proof，除非来自 compact/resume 真实缺口。
- 不为了减少行数而继续拆三大巨型文件；只有 compact/continuity 主线明确需要时才抽 helper。

## 6. 环境约束

- RTK command discipline active：读文件、搜索、git status/diff/log、测试、构建、大输出命令必须显式使用 `rtk`。
- 目标仓库：`D:\LenovoSoftstore\pyproject\source-claudecode\private-coding-agents`。
- Claude Code 参考仓库只读：`D:\LenovoSoftstore\pyproject\source-claudecode`。
- opencode 参考仓库只读：`D:\LenovoSoftstore\pyproject\opencode`。
- synthetic home 固定为 `D:\Test\pca-home-synth`，并设置 `PRIVATE_AGENTS_PROVIDER_MODE=synthetic`。
- 失败态或隔离验证只能使用临时 synthetic/test home，不得污染 `D:\Test\home-sf`。
- PowerShell profile execution policy warning 可记录为环境噪音，不应误判为产品失败。

## 7. 参考实现约束

每个触及 session lifecycle、compact、replay、resume、permission、terminal/durable semantics 的 checkpoint 必须：

1. 先检查目标仓库当前实现和测试。
2. 再做小范围只读参考比较。
3. 只吸收语义边界，不照搬代码。

Claude Code 参考重点：

- `query.ts`
- `QueryEngine.ts`
- `commands.ts`
- 与 compact / resume / session history / `tool_result is_error` 相关文件
- `tools/FileReadTool/FileReadTool.ts`
- `tools/FileEditTool/FileEditTool.ts`

opencode 参考重点：

- `packages/opencode/src/acp/agent.ts`
- `packages/opencode/src/session` 或 event 相关文件
- `packages/opencode/src/tool/tool.ts`
- `packages/opencode/src/tool/edit.ts`
- `packages/opencode/src/tool/bash.ts`
- `packages/opencode/src/permission/permission.ts`

吸收点限制：

- session history 如何保留 failed tool result。
- compact/replay 后如何避免丢失错误上下文。
- resume/continue 如何消费上一轮 result。
- tool failure / permission denial / verification failure 如何在 session event 中分层。

## 8. 三大巨型文件新增代码约束

三个巨型文件仍然存在，但本路线新增逻辑必须遵守最小接线原则：

- `packages/ts-shell/src/entrypoints/cli.tsx` 只保留入口 wiring、process IO、top-level command routing、interactive lifecycle。
- `packages/ts-shell/src/session/SessionManager.ts` 只保留 durable session state、persistence、current pointer、session lifecycle 状态边界和必要 wiring。
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts` 只保留主 orchestration sequencing、tool execution sequencing、provider/model adapter wiring。

新增 formatter、summary builder、compact/replay helper、continuity contract、test fixture builder、diagnostic mapper 不得直接塞入三大巨型文件。推荐模块位置：

- `packages/ts-shell/src/session/continuity/*`
- `packages/ts-shell/src/session/compact/*`
- `packages/ts-shell/src/session/replay/*`
- `packages/ts-shell/src/core/shell/*`
- `packages/ts-shell/src/orchestration/*`

如果必须修改三大巨型文件，只允许最小接线，并在 checkpoint 记录中解释为什么不能放到新模块。

## 9. 当前已闭合能力

- CLI packaged / print / replay / stdin boundary 已有可信覆盖。
- result/failure surface 与 `verify:result-contract` 已收口。
- provider readiness preflight 和 classification evidence 已存在。
- continue/resume shell action runtime 已抽出。
- startup/result/evidence/helper 边界已有一批 behavior-preserving extraction。
- action result seed/evidence 已有 helper 和测试。
- CLI stopped/failure follow-up real-path smoke 已在 evidence track 中落地。
- compact long-session evidence 已有设计 checkpoint，但尚未成为本路线的默认实现 gate。

## 10. 当前主要风险

- compact 后保留的是文本摘要，但结构化 stopped / failure context 不完整。
- replay 后 action result、failedFiles、changedFiles、verification detail、nextAction、DoNext 语义丢失或被压扁。
- approved execution failure 跨 compact 后被误归因成 approval denied 或 generic error。
- resume / continue 消费最后一条文本而不是结构化 continuity。
- fixture 逻辑继续堆进 `SessionManager.test.ts`，导致测试难以扩展。
- 为修复 compact/resume 缺口而把 formatter 或 diagnostic mapper 重新塞回 `SessionManager.ts`。

## 11. 路线分阶段 backlog

### Current

- Long-session continuity route audit / merge readiness

### Backlog

- None.

`H` 只有在审计证明纯 formatter 仍散落且阻碍 compact/resume 主线时才执行；不得为了拆分而拆分。

### Completed

- A. Compact/replay coverage audit
- B. Long-session continuity fixture builder
- C. Compact preserves stopped recovery context
- D. Compact preserves verification-failed repair context
- E. Compact preserves approved execution failure provenance
- F. Resume after compact uses continuity context
- G. Long-session CLI synthetic smoke

### Verification

- A status: completed as a read-only audit / planning checkpoint.
- Commands run for A:
  - `rtk git status --short --branch`
  - `rtk git log --oneline --decorate -n 5`
  - `rtk read AGENTS.md`
  - `rtk read PLANS.long-session-continuity.md`
  - `rtk grep "auto-compact" packages/ts-shell/src/session/SessionManager.test.ts`
  - `rtk grep "action result seed" packages/ts-shell/src/session/SessionManager.test.ts`
  - `rtk grep "stopped" packages/ts-shell/src/session/SessionManager.test.ts`
  - `rtk grep "verification" packages/ts-shell/src/session/SessionManager.test.ts`
  - `rtk grep "buildPromptContinuityContext" packages/ts-shell/src/core/shell packages/ts-shell/src/entrypoints packages/ts-shell/src/session`
  - `rtk grep "buildPromptContinuitySnapshot" packages/ts-shell/src/core/shell packages/ts-shell/src/entrypoints packages/ts-shell/src/session`
  - `rtk grep "compact_boundary" D:\LenovoSoftstore\pyproject\source-claudecode\QueryEngine.ts`
  - `rtk grep "compaction" D:\LenovoSoftstore\pyproject\opencode\packages\opencode\src\session`
  - `rtk grep "tool_result" D:\LenovoSoftstore\pyproject\source-claudecode\query.ts`
- B status: completed as a test fixture checkpoint.
- Files changed for B:
  - `packages/ts-shell/src/session/__tests__/longSessionContinuityFixtures.ts`
  - `packages/ts-shell/src/session/SessionManager.test.ts`
  - `PLANS.long-session-continuity.md`
- Commands run for B:
  - `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts`
  - `rtk npm run build -w packages/ts-shell`
- B result: SessionManager suite passed with 53 tests after elevated rerun for sandbox `spawn EPERM`; build passed after elevated rerun for sandbox `dist` write `EPERM`.
- C status: completed as a focused stopped recovery continuity checkpoint.
- Files changed for C:
  - `packages/ts-shell/src/session/__tests__/longSessionContinuityFixtures.ts`
  - `packages/ts-shell/src/session/SessionManager.test.ts`
  - `PLANS.long-session-continuity.md`
- Commands run for C:
  - `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts -t "stopped"`
  - `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts`
  - `rtk npm run build -w packages/ts-shell`
- C result: stopped focused SessionManager tests passed with 3 tests after elevated rerun for sandbox `spawn EPERM`; `sessionRuntime.test.ts` passed with 29 tests after elevated rerun for sandbox `spawn EPERM`; build passed after elevated rerun for sandbox `dist` write `EPERM`.
- D status: completed as a focused verification-failed repair continuity checkpoint.
- Files changed for D:
  - `packages/ts-shell/src/session/SessionManager.test.ts`
  - `PLANS.long-session-continuity.md`
- Commands run for D:
  - `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts -t "verification"`
  - `rtk npm run test -w packages/ts-shell -- src/core/query/resultMapper.test.ts`
  - `rtk npm run build -w packages/ts-shell`
- D result: verification focused SessionManager test passed with 1 test after elevated rerun for sandbox `spawn EPERM`; `resultMapper.test.ts` passed with 18 tests after elevated rerun for sandbox `spawn EPERM`; build passed after elevated rerun for sandbox `dist` write `EPERM`.
- E status: completed as a focused approved execution failure provenance checkpoint.
- Files changed for E:
  - `packages/ts-shell/src/session/SessionManager.test.ts`
  - `PLANS.long-session-continuity.md`
- Commands run for E:
  - `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts -t "approval"`
  - `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts`
  - `rtk npm run build -w packages/ts-shell`
- E result: approval focused SessionManager tests passed with 6 tests after elevated rerun for sandbox `spawn EPERM`; `sessionRuntime.test.ts` passed with 29 tests after elevated rerun for sandbox `spawn EPERM`; build passed after elevated rerun for sandbox `dist` write `EPERM`.
- F status: completed as a focused resume/continue continuity consumption checkpoint.
- Files changed for F:
  - `packages/ts-shell/src/core/shell/sessionRuntime.test.ts`
  - `PLANS.long-session-continuity.md`
- Commands run for F:
  - `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts`
  - `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts`
  - `rtk npm run build -w packages/ts-shell`
- F result: `sessionRuntime.test.ts` passed with 30 tests after elevated rerun for sandbox `spawn EPERM`; `SessionManager.test.ts` passed with 56 tests after elevated rerun for sandbox `spawn EPERM`; build passed after elevated rerun for sandbox `dist` write `EPERM`.
- G status: completed as a focused synthetic CLI compact-continuity smoke checkpoint.
- Files changed for G:
  - `packages/ts-shell/src/cli-baseline.test.ts`
  - `PLANS.long-session-continuity.md`
- Commands run for G:
  - `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "LONG_SESSION_CLI_SYNTHETIC"`
  - `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"`
  - `HOME=D:\Test\pca-home-synth USERPROFILE=D:\Test\pca-home-synth PRIVATE_AGENTS_PROVIDER_MODE=synthetic rtk npm run test:gate:golden-main-path`
  - `rtk npm run build -w packages/ts-shell`
- G result: focused long-session CLI synthetic smoke passed with 1 test after elevated rerun for sandbox `spawn EPERM`; CLI continue focused tests passed with 5 tests after elevated rerun for sandbox `spawn EPERM`; synthetic golden main path passed with 1 test after elevated rerun for sandbox `spawn EPERM`; build passed after elevated rerun for sandbox `dist` write `EPERM`.

### Notes

- `SessionManager.ts` already has extracted helpers for compact summary, continuity formatting, and replay plan building. The audit confirms this route should not begin with formatter extraction.
- Existing compact coverage is real but narrow: approval memory survives auto-compact, approval audit history survives auto-compact, and action result seed handoff summary survives auto-compact.
- Existing stopped coverage verifies immediate `buildContinuitySnapshot` / `buildPromptContinuityContext` behavior for edit patch stopped failure details, but does not yet prove the same stopped recovery context survives auto-compact and manager reload/replay.
- Existing verification-failed coverage proves continuity context can include failed verification detail and handoff diagnostics, but does not yet provide a reusable long-session fixture that drives the same shape through compact.
- `sessionRuntime.ts` consumes `buildContinuitySnapshot` / `buildPromptContinuitySnapshot` and renders continuation seed summaries from continuity state, so later resume/continue proof should test the structured continuity consumption path rather than only final text.
- Claude Code reference keeps compact boundaries as replayable session messages and explicitly handles tool-result continuity; opencode preserves compaction as a session/message part with autocontinue metadata. The semantic takeaway is to keep failed tool/result provenance as structured session history across compact, not as an untyped last-message summary.
- Current next step is fixture work, not production behavior changes: add a reusable long-session continuity fixture builder outside the three giant files, then use it for stopped / verification-failed / execution-failed compact proofs.
- B added a reusable long-session continuity fixture helper under `session/__tests__`, not in `SessionManager.ts`, `cli.tsx`, or `runMvpIntegratedFlow.ts`.
- The helper can construct auto-compact long-session scenarios for stopped edit failure, verification-failed repair context, and approved tool execution failure provenance.
- `SessionManager.test.ts` only adds a light smoke around the helper: auto-compact is triggered, source turn count reaches the threshold, restored manager continuity snapshots can read the scenario, target file, failure reason, and next action.
- Current next step is C: use the fixture to prove stopped edit/patch failure recovery details survive auto-compact plus restored manager continuity context.
- C tightened the stopped fixture blocker kind to `patch-from-not-found` and added a focused test proving restored continuity keeps stopped terminal classification, failure reason, failed file, verification blocked status, blocker kind, and next action after auto-compact.
- Current next step is D: reuse the fixture to prove verification-failed changedFiles, verification detail, and next action survive auto-compact plus restored manager continuity context.
- D added a focused auto-compact reload test proving verification-failed continuity preserves changed files, failed verification status, verification command, failure reason, next action, and the failure handoff diagnostic in both snapshot state and prompt continuity context.
- Current next step is E: reuse the approved tool failure fixture to prove approved execution failure provenance survives compact without becoming approval denied or a generic error.
- E added a focused auto-compact reload test proving approved execution failure keeps both approval provenance and execution failure provenance: allow-once, non-persistent approval metadata survives, while the failed command remains a stopped run-command with failed file, verification blocker, reason, and next action.
- Current next step is F: prove resume/continue after compact consumes structured continuity context instead of relying only on the last assistant text.
- F added a focused runtime test using the long-session verification-failed fixture, restored manager, and `ShellSessionRuntime.executePrompt` after `resume`. The test captures the `continuityState` passed into `runPrompt` and proves the resumed follow-up receives structured compact continuity: terminal classification, failure reason, changed file, verification status, command, and next action.
- Current next step is G: design and run a long-session CLI synthetic smoke only if it can stay synthetic/test-home scoped and avoid real provider access.
- G added a synthetic CLI print smoke that seeds a compacted verification-failed long-session fixture in the test home, continues it through the real `/continue` CLI path, and verifies the user-visible continuation/failure handoff plus transcript preserve target file, verification command, and next action.
- During G, explicit resume of an error-status compacted session stayed behind the existing resume trust boundary and printed resume failure/candidates; the smoke was therefore scoped to the supported completed-session follow-up path while preserving compacted failure continuity in working memory/transcript.
- H is not selected for immediate implementation: current code already has `compactSummaryFormatter`, `continuityFormatter`, and `replayPlanBuilder`, and checkpoints A-G did not reveal a pure formatter extraction blocker. The current next step is route audit / merge readiness rather than opportunistic extraction.

## 12. 每个 checkpoint 的目标、允许修改文件、禁止修改文件、验证命令

### A. Compact/replay coverage audit

目标：只读审计当前 `SessionManager` compact / replay / continuity 覆盖面，确认已有 tests 和真实缺口。

允许修改文件：

- `PLANS.long-session-continuity.md`

禁止修改文件：

- 生产代码
- 测试代码
- provider/auth/MCP/release-core

验证命令：

- `rtk git status --short`
- `rtk npm run build -w packages/ts-shell`

### B. Long-session continuity fixture builder

目标：新增测试 fixture/helper，构造多轮 transcript、stopped result、verification-failed、tool failure、changed files，不把 fixture 逻辑塞进 `SessionManager.test.ts`。

允许修改文件：

- `packages/ts-shell/src/session/__tests__/*` 或现有测试 helper 目录
- `packages/ts-shell/src/session/SessionManager.test.ts` 的最小接线
- `PLANS.long-session-continuity.md`

禁止修改文件：

- `SessionManager.ts`
- `cli.tsx`
- `runMvpIntegratedFlow.ts`
- provider/auth/MCP

验证命令：

- `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts`
- `rtk npm run build -w packages/ts-shell`

### C. Compact preserves stopped recovery context

目标：证明 compact/replay 后 stopped edit/patch failure 的 blocker kind、reason、failedFiles、nextAction 不丢失。

允许修改文件：

- session continuity/compact/replay helper 模块
- focused session tests / fixture helpers
- `SessionManager.ts` 最小 wiring，只有在 helper 接入必须时允许
- `PLANS.long-session-continuity.md`

禁止修改文件：

- `cli.tsx`
- `runMvpIntegratedFlow.ts`，除非失败证据证明 source event 未持久化
- provider/auth/MCP

验证命令：

- `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts -t "stopped"`
- `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts`
- `rtk npm run build -w packages/ts-shell`

### D. Compact preserves verification-failed repair context

目标：证明 verification-failed 的 changedFiles、verification detail、DoNext 跨 compact 保留。

允许修改文件：

- session continuity/compact/replay helper 模块
- focused session tests / fixture helpers
- `SessionManager.ts` 最小 wiring，只有在 helper 接入必须时允许
- `PLANS.long-session-continuity.md`

禁止修改文件：

- runMvp 全量重构
- verification 同族 surface proof
- provider/auth/MCP

验证命令：

- `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts -t "verification"`
- `rtk npm run test -w packages/ts-shell -- src/core/query/resultMapper.test.ts`
- `rtk npm run build -w packages/ts-shell`

### E. Compact preserves approved execution failure provenance

目标：证明 approved execution failure 不会跨 compact 变成 approval denied 或 generic error。

允许修改文件：

- session continuity/compact/replay helper 模块
- focused session tests / fixture helpers
- `SessionManager.ts` 最小 wiring，只有在 helper 接入必须时允许
- `PLANS.long-session-continuity.md`

禁止修改文件：

- approval core 行为变更
- provider/auth/MCP
- global retry / execution retry

验证命令：

- `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts -t "approval"`
- `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts`
- `rtk npm run build -w packages/ts-shell`

### F. Resume after compact uses continuity context

目标：证明 compact 后 resume / continue 消费的是结构化 continuity，而不是只靠最后一条文本。

允许修改文件：

- session continuity/compact/replay helper 模块
- `packages/ts-shell/src/core/shell/sessionRuntime.ts` 最小接线，如消费路径确实在 shell runtime
- focused tests / fixture helpers
- `PLANS.long-session-continuity.md`

禁止修改文件：

- `cli.tsx` 大面积改动
- provider/auth/MCP
- QueryEngine/queryLoop

验证命令：

- `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts`
- `rtk npm run build -w packages/ts-shell`

### G. Long-session CLI synthetic smoke

目标：在 synthetic/test home 中跑一个更接近真实用户的多 turn smoke，覆盖 task -> failure/stopped -> compact/replay -> follow-up。

允许修改文件：

- CLI smoke script 或 focused CLI test
- synthetic fixture helper
- `PLANS.long-session-continuity.md`

禁止修改文件：

- real-provider config
- provider/auth core
- broad CLI rewrite

验证命令：

- `HOME=D:\Test\pca-home-synth USERPROFILE=D:\Test\pca-home-synth PRIVATE_AGENTS_PROVIDER_MODE=synthetic rtk npm run test:gate:golden-main-path`
- `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"`
- `rtk npm run build -w packages/ts-shell`

### H. Continuity summary formatter extraction

目标：如果审计发现纯 formatter 仍散在 `SessionManager.ts`，才做 behavior-preserving extraction。

允许修改文件：

- `packages/ts-shell/src/session/continuity/*`
- `packages/ts-shell/src/session/SessionManager.ts` 最小 import/wiring
- focused formatter tests
- `PLANS.long-session-continuity.md`

禁止修改文件：

- runMvp helper extraction
- CLI extraction
- provider/auth/MCP

验证命令：

- `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts`
- `rtk npm run build -w packages/ts-shell`

## 13. 失败归因规则

任何验证失败必须先归因，不得直接扩大修复：

1. 本 checkpoint 引入的真实回归。
2. 测试引用旧路径或 helper 位置变化导致的测试维护问题。
3. 既有旧失败或过宽 filter 命中 unrelated case。
4. 环境问题，例如 sandbox EPERM、spawn EPERM、工具超时、PowerShell profile warning、Windows EBUSY、RTK/audit 副作用。
5. 并行分支或外部变更影响。

处理规则：

- 如果是本 checkpoint 引入的真实回归，必须最小修复、缩小或回滚。
- 如果无法证明是既有失败，视为本 checkpoint 回归。
- 如果修复需要新 persistence layer、广泛 event protocol/taxonomy、provider/auth、QueryEngine/queryLoop 或 Rust control-plane 迁移，停止并记录为 blocker。
- 不得顺手修 unrelated 旧失败。

## 14. RTK/audit 残留规则

验证产生的以下残留必须在阶段结束前清理或还原：

- `.sisyphus/audit/permissions.jsonl`
- `packages/ts-shell/.sisyphus/audit/permissions.jsonl`
- `rtk/history.db` 或同类运行残留，如果出现在 git status 中

不得提交：

- audit 残留
- 真实用户配置文件
- 临时 home
- 无关生成物

如果 `rtk git restore/status` 会再次写 audit，说明原因后使用最小 raw `git status` / `git restore` 做最终确认。

## 15. 提交/push 规则

- 每个 checkpoint 单独 commit。
- 无改动不 commit。
- 验证通过后再 commit。
- commit message 必须描述真实边界，例如：
  - `Plan long session continuity hardening`
  - `Audit compact replay continuity coverage`
  - `Add long session continuity fixtures`
  - `Preserve stopped context across compact`
- 不要把多个 checkpoint 混在一个 commit。
- push 如果因认证、网络、权限或审核失败，不要绕过，不要反复重试；记录 commit hash、失败原因、当前 git status。

## 16. 当前推荐第一个 checkpoint

当前推荐第一个 checkpoint：

- A. Compact/replay coverage audit

原因：

- 当前代码已经存在 `compactSummaryFormatter.ts`、`continuityFormatter.ts`、`replayPlanBuilder.ts`，不应从 opportunistic extraction 起手。
- 现有 tests 覆盖了部分 auto-compact 和 action result seed，但尚需明确 stopped、verification-failed、tool-failed、edit-failed、changed files、next action、action result handoff 跨 compact/replay 的缺口。
- 该 checkpoint 风险最低，能给后续 fixture builder 和 focused behavior-preserving fixes 提供明确证据。

本 planning checkpoint 不执行 A，只创建路线文件并运行 build。下一轮如果继续本路线，应先读取本文件 Current，再执行 A 并同步更新 Current / Backlog / Completed / Verification / Notes。

## Checkpoint Tracking Update: G Completed

This section supersedes the original "current recommended first checkpoint" text above.

- Completed: A. Compact/replay coverage audit; B. Long-session continuity fixture builder; C. Compact preserves stopped recovery context; D. Compact preserves verification-failed repair context; E. Compact preserves approved execution failure provenance; F. Resume after compact uses continuity context; G. Long-session CLI synthetic smoke.
- Current: Long-session continuity route audit / merge readiness.
- Backlog: none. H. Continuity summary formatter extraction is not selected because no current compact/resume blocker requires it.
- Verification for A: read-only RTK inspection of `SessionManager.ts`, `SessionManager.test.ts`, `sessionRuntime.ts`, Claude Code compact/tool-result semantics, and opencode compaction/session semantics; production code and tests were not modified.
- Notes: A found that existing compact coverage is narrow but real. Approval memory, approval audit history, and action result seed handoff survive auto-compact. Stopped and verification-failed continuity are covered for immediate snapshot/context paths, but not yet through a reusable long-session compact/reload fixture. The next checkpoint should add a fixture builder outside the three giant files before adding behavior proofs.
- Verification for B: `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts` passed with 53 tests after elevated rerun for sandbox `spawn EPERM`; `rtk npm run build -w packages/ts-shell` passed after elevated rerun for sandbox `dist` write `EPERM`.
- Notes: B added `packages/ts-shell/src/session/__tests__/longSessionContinuityFixtures.ts` and a light SessionManager smoke. The helper builds stopped edit failure, verification-failed, and approved tool failure long-session scenarios without modifying production code. Next checkpoint C should use it for stopped edit/patch recovery preservation across compact/reload.
- Verification for C: `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts -t "stopped"` passed with 3 tests after elevated rerun; `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts` passed with 29 tests after elevated rerun; `rtk npm run build -w packages/ts-shell` passed after elevated rerun.
- Notes: C proves stopped edit patch recovery details survive auto-compact plus restored manager continuity context. The stopped fixture now uses `patch-from-not-found` as the blocker kind, and the focused test asserts failed file, failure reason, blocked verification status, blocker kind, and next action in snapshot/context output.
- Verification for D: `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts -t "verification"` passed with 1 test after elevated rerun; `rtk npm run test -w packages/ts-shell -- src/core/query/resultMapper.test.ts` passed with 18 tests after elevated rerun; `rtk npm run build -w packages/ts-shell` passed after elevated rerun.
- Notes: D proves verification-failed repair context survives auto-compact plus restored manager continuity context. The focused test asserts changed files, failed verification status, verification command, failure reason, next action, and the failure handoff diagnostic in snapshot/context output. Next checkpoint E should prove approved execution failure provenance survives compact without being reclassified as approval denied or generic error.
- Verification for E: `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts -t "approval"` passed with 6 tests after elevated rerun; `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts` passed with 29 tests after elevated rerun; `rtk npm run build -w packages/ts-shell` passed after elevated rerun.
- Notes: E proves approved execution failure provenance survives auto-compact plus restored manager continuity context. The focused test asserts allow-once approval provenance, non-persistent cache metadata, non-interactive input source, stopped run-command classification, failed file, blocked verification status, blocker kind, reason, and next action. Next checkpoint F should prove resume/continue consumes this structured continuity path after compact.
- Verification for F: `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts` passed with 30 tests after elevated rerun; `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts` passed with 56 tests after elevated rerun; `rtk npm run build -w packages/ts-shell` passed after elevated rerun.
- Notes: F proves resumed runtime execution receives structured compact continuity through `ShellSessionRuntime.executePrompt`, not only final assistant text. The test uses an isolated temporary home, a compacted verification-failed fixture, a restored/resumed manager, and captures the `continuityState` passed into `runPrompt`. Next checkpoint G should only add a synthetic CLI smoke if it remains tightly scoped to temporary/synthetic home and does not touch real-provider config.
- Verification for G: `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "LONG_SESSION_CLI_SYNTHETIC"` passed with 1 test after elevated rerun; `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"` passed with 5 tests after elevated rerun; `HOME=D:\Test\pca-home-synth USERPROFILE=D:\Test\pca-home-synth PRIVATE_AGENTS_PROVIDER_MODE=synthetic rtk npm run test:gate:golden-main-path` passed with 1 test after elevated rerun; `rtk npm run build -w packages/ts-shell` passed after elevated rerun.
- Notes: G proves the real CLI print `/continue` path can carry compacted failure continuity in synthetic/test-home scope. The smoke seeds compacted verification-failed continuity, follows up through CLI, and asserts the continuation output plus transcript retain failure handoff, target file, verification command, and next action. H is deferred because no pure formatter extraction blocker was found; the route should move to audit / merge readiness next.
