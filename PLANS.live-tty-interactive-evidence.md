# Live TTY Interactive Evidence Track

## 1. 总目标

建立一条 live/default interactive CLI evidence 路线，专门验证和加固真实交互入口下的主路径风险：

- Step 1: 用户启动 CLI 后看到清晰 runtime mode、session state 和 prompt readiness。
- Step 2: 用户创建或恢复 session 时，interactive shell 能正确呈现 session health 和可继续状态。
- Step 4: interactive approval prompt 只在合适入口出现，permission escalation 由用户明确批准或拒绝。
- Step 5: stopped / failed / interrupted 结果在 live CLI 中有清晰 terminal state，并能持久化。
- Step 6: 用户在 stopped / failed 后继续输入时，恢复语义一致，不需要手动修复 session。

本路线不是继续 synthetic proof，也不是继续 real-provider、long-session、verification 或 edit/patch 同族证明；目标是把真实用户默认交互入口从“看起来可运行”推进到“有自动化、可重复、可归因的证据”。

## 2. 当前分支

```text
live-tty-interactive-evidence
```

## 3. base/main 状态

创建本分支前的本地 base 为：

```text
main...origin/main
HEAD: b22f9d7 Seal real provider safe evidence track
origin/main: b22f9d7 Seal real provider safe evidence track
```

含义：

- `real-provider-safe-evidence` 已合并回 `main`。
- 当前本地 `main` 与 `origin/main` 均指向 `b22f9d7`。
- 本路线从当前本地 `main` 创建，不 reset、不 rebase、不丢失已有提交。
- 后续 merge/push 前仍需重新确认 `main` 与 `origin/main` 状态。

## 4. 背景审查结论

此前路线已经阶段性收口：

- main path boundaries: 三大巨型文件的稳定职责边界已做过阶段性拆分和审查。
- real main path evidence: CLI packaged / print / replay / stdin boundary 和 synthetic golden main path 已有较可信证据。
- long-session continuity: compact / replay / resume / failure follow-up 的长期连续性已有 focused evidence。
- real-provider safe evidence: provider readiness、failure attribution、redaction、safe dry-run 和 follow-up context 已阶段性封口。

当前仍薄弱的是 live/default interactive CLI：

- readline / TTY 多轮输入证据不足。
- interactive slash command / continue / resume 行为证据不足。
- interactive approval prompt 与 non-interactive approval 边界仍需要更真实的 smoke。
- stopped / failed 后用户在 live CLI 里继续输入的恢复路径证据不足。
- EOF / close / interrupt 的 terminal state 与 session persistence 需要明确归因。

## 5. 为什么选择 live TTY / interactive CLI evidence

真实用户默认入口不是 `--print` 或 synthetic script，而是 live interactive CLI。当前项目已经有不少本地和合成证据，但这些不能替代：

- 用户真正启动默认 CLI 后是否看见 prompt readiness。
- 多轮 readline 输入是否进入同一 query / command loop。
- slash command 与 normal prompt 是否正确分流。
- approval prompt 是否只在 interactive 入口请求用户决策。
- stopped / failed 后用户继续输入是否保留恢复上下文。
- EOF / close / interrupt 是否不会伪装成 success。

因此本路线直接推进 user-minimal real main path 的 Step 1、2、4、5、6。

## 6. 明确不做的方向

本路线不做：

- 新增 provider 或修改 auth core。
- 读取、复制、修改或清理真实 auth/key/provider 配置。
- 默认运行 real-provider smoke 或 `verify-real-user-capabilities`。
- Windows EBUSY 处理。
- runMvpIntegratedFlow 全量旧失败清理。
- 完整 apply_patch、AST patch、rollback、batch engine。
- stream mid-flight retry 或全局网络重试。
- provider readiness、real-provider dry-run、edit/patch marker、verification surface、long-session continuity 同族 proof，除非来自 interactive CLI 真实缺口。
- 为减少行数继续拆三大巨型文件。
- 需要人工手动操作的测试。

## 7. 环境约束

真实配置边界：

- real-provider home 固定为 `D:\Test\home-sf`。
- 不得读取、复制、修改、清理或泄露真实 auth/key/provider 配置。
- 本路线默认不运行 real-provider smoke。

Synthetic/test 边界：

- synthetic home 固定为 `D:\Test\pca-home-synth`。
- 需要 synthetic provider 时设置 `PRIVATE_AGENTS_PROVIDER_MODE=synthetic`。
- interactive smoke 必须使用 synthetic/test home 或临时 test home。
- 不得污染 `D:\Test\home-sf`。

命令边界：

- RTK command discipline active。
- 文件读取、搜索、git status/diff/log、测试、构建、大输出必须显式使用 `rtk`。
- raw git 仅用于 branch/switch/add/commit/push/merge 等 git mutation，并需要说明理由。

## 8. 参考实现约束

优先检查目标仓库当前实现，再做小范围只读语义对照。

Claude Code 参考：

- `commands.ts`
- `query.ts`
- `QueryEngine.ts`
- `cli/print.ts` 或 structured output 相关文件
- interactive prompt / terminal / readline / approval 相关文件
- permission / tool result 相关文件

opencode 参考：

- `packages/opencode/src/cli/cmd/run.ts`
- `packages/opencode/src/acp/agent.ts`
- `packages/opencode/src/permission/permission.ts`
- `packages/opencode/src/tool/tool.ts`
- `packages/opencode/src/tool/bash.ts`
- `packages/opencode/src/session` 或 event 相关文件

只吸收语义边界：

- interactive 与 print/non-interactive 如何分层。
- approval prompt 如何只在合适入口出现。
- failed/stopped result 如何在 interactive shell 中继续。
- EOF / interrupt / close 如何呈现 terminal state。
- slash command 与 normal prompt 如何分流。

不得照抄代码，不做大规模参考扫描。

## 9. 三大巨型文件新增代码约束

三大文件仍然存在，但本路线不得把新逻辑继续塞进去：

- `packages/ts-shell/src/entrypoints/cli.tsx`: 只保留入口 wiring。
- `packages/ts-shell/src/session/SessionManager.ts`: 只保留 durable session state、persistence、current pointer、最小 wiring。
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`: 只保留主 orchestration sequencing。

如果需要新增 interactive CLI harness、TTY test helper、approval prompt fixture、readline driver、shell action smoke helper、terminal output parser，优先放到：

- `packages/ts-shell/src/core/shell/*`
- `packages/ts-shell/src/core/commands/*`
- `packages/ts-shell/src/test-utils/*`
- `scripts/*`

`packages/ts-shell/src/cli-baseline.test.ts` 只保留测试编排，不塞大量 helper。

如果必须修改三大巨型文件，只允许最小接线，并在 checkpoint 记录为什么不能放入独立模块。

## 10. 当前已闭合能力

当前已较可信：

- CLI packaged / print / replay / stdin boundary。
- CLI entry verification。
- synthetic golden main path。
- result/failure terminal contract。
- provider readiness preflight 与 safe attribution dry-run。
- real-provider failure redaction 与 follow-up context dry-run。
- long-session compact / replay / resume continuity smoke。
- non-interactive approval 与 CLI surface focused evidence。

这些能力不能替代 live TTY 成熟证据；它们只证明 packaged、print、synthetic 和 focused contract 路径可信。

## 11. 当前主要风险

主要风险：

- default interactive CLI 只有有限或间接证据。
- readline 多轮输入可能与 `--print` / stdin boundary 语义不同。
- slash command 在 interactive shell 中可能与 scripted tests 覆盖面不同。
- approval prompt 可能在 non-interactive 模式下误触发，或 interactive 模式下缺少明确决策边界。
- stopped / failed 后 live follow-up 可能丢失 previous result、blocker、DoNext 或 current session pointer。
- EOF / close / interrupt 可能被误呈现为 success，或未正确持久化 terminal state。
- TTY 自动化容易引入 flake，必须可重复、可清理、可归因。

## 12. 路线分阶段 backlog

Backlog:

- H. Live TTY route audit / merge readiness

Current:

- H. Live TTY route audit / merge readiness

Completed:

- A. Interactive CLI harness audit
  - Commit: checkpoint commit reported in final status.
  - Files changed: `PLANS.live-tty-interactive-evidence.md`.
  - Result: completed as a read-only audit / planning checkpoint. Existing coverage proves the repo already has interactive-ish spawn patterns, but no small reusable live TTY harness yet.
- B. Minimal interactive startup smoke
  - Commit: checkpoint commit reported in final status.
  - Files changed: `packages/ts-shell/src/test-utils/cliHarness.ts`, `packages/ts-shell/src/cli-baseline.test.ts`, `PLANS.live-tty-interactive-evidence.md`.
  - Result: completed. Added a small reusable `runInteractiveStartupSmoke` helper and a focused synthetic-home interactive startup smoke that waits for prompt readiness, captures the session id, and confirms no approval prompt leaks during startup.
- C. Interactive slash command smoke
  - Commit: checkpoint commit reported in final status.
  - Files changed: `packages/ts-shell/src/test-utils/cliHarness.ts`, `packages/ts-shell/src/cli-baseline.test.ts`, `PLANS.live-tty-interactive-evidence.md`.
  - Result: completed. Added a minimal `runInteractiveLineSmoke` helper and a focused `/sessions current` smoke that drives one harmless interactive slash command after prompt readiness, confirms current-session output, and verifies no provider turn/result or approval prompt is triggered.
- D. Interactive stopped follow-up smoke
  - Commit: checkpoint commit reported in final status.
  - Files changed: `packages/ts-shell/src/test-utils/stoppedRecoveryFixture.ts`, `packages/ts-shell/src/cli-baseline.test.ts`, `PLANS.live-tty-interactive-evidence.md`.
  - Result: completed. Extracted the stopped recovery fixture to test-utils and added a focused interactive `/continue <follow-up>` smoke proving stopped edit failure context preserves blocker, target file, reason, and next action after the live prompt accepts user follow-up.
- F. Non-interactive vs interactive approval boundary
  - Commit: checkpoint commit reported in final status.
  - Files changed: `packages/ts-shell/src/cli-baseline.test.ts`, `PLANS.live-tty-interactive-evidence.md`.
  - Result: completed. Added a focused `--print` non-interactive approval boundary smoke proving default-deny emits approval audit markers and stopped terminal result, and never renders `approval> `. The interactive approval prompt half remains covered by E's blocked/deferred PTY note rather than faked with an env override.
- G. EOF / close / interrupt attribution smoke
  - Commit: checkpoint commit reported in final status.
  - Files changed: `packages/ts-shell/src/test-utils/cliHarness.ts`, `packages/ts-shell/src/cli-baseline.test.ts`, `PLANS.live-tty-interactive-evidence.md`.
  - Result: completed. Added a reusable `runInteractiveEofSmoke` helper and a focused default CLI EOF/close smoke that waits for prompt readiness, closes stdin, confirms the stream closes with zero processed prompts, and proves no false `Result`, `Outcome: success`, or `approval> ` prompt is emitted while session state remains active and unclassified.

Blocked / Deferred:

- E. Interactive approval prompt smoke
  - Commit: checkpoint commit reported in final status.
  - Files changed: `PLANS.live-tty-interactive-evidence.md`.
  - Result: blocked by current harness capability. The existing `spawn(... stdio: "pipe")` helper makes child `process.stdin.isTTY` false, so the CLI correctly takes the non-interactive approval branch and never renders `approval> `. The repo has no `node-pty` or equivalent PTY dependency. Do not fake live TTY approval with an env override; revisit only after choosing a real PTY/TTY automation strategy.

Verification:

- Planning round: `rtk git status --short`, `rtk npm run build -w packages/ts-shell`, `rtk git diff`.
- A audit round:
  - `rtk git status --short --branch`: passed; branch `live-tty-interactive-evidence`, clean before checkpoint update.
  - Target repo audit commands: `rtk read AGENTS.md`, `rtk read PLANS.live-tty-interactive-evidence.md`, `rtk read packages/ts-shell/src/cli-baseline.test.ts`, `rtk read packages/ts-shell/src/test-utils/cliHarness.ts`, `rtk read scripts/verify-cli-entry.mjs`, `rtk read packages/ts-shell/src/entrypoints/cli.tsx`.
  - Target search commands: `rtk find "cliHarness" packages/ts-shell/src scripts package.json packages/ts-shell/package.json`, `rtk find "interactive" packages/ts-shell/src scripts`, `rtk find "spawn" packages/ts-shell/src scripts`, `rtk find "readline" packages/ts-shell/src scripts`, `rtk grep "approval>" packages/ts-shell/src/cli-baseline.test.ts packages/ts-shell/src/entrypoints/cli.tsx packages/ts-shell/src/test-utils/cliHarness.ts`, `rtk grep "Ctrl+D" packages/ts-shell/src/cli-baseline.test.ts packages/ts-shell/src/entrypoints/cli.tsx packages/ts-shell/src/test-utils/cliHarness.ts`, `rtk grep "stdin" packages/ts-shell/src/cli-baseline.test.ts packages/ts-shell/src/test-utils/cliHarness.ts scripts/verify-cli-entry.mjs`, `rtk grep "/continue" packages/ts-shell/src/cli-baseline.test.ts packages/ts-shell/src/entrypoints/cli.tsx scripts/verify-cli-entry.mjs`, `rtk grep "Ctrl+C" packages/ts-shell/src/cli-baseline.test.ts packages/ts-shell/src/entrypoints/cli.tsx packages/ts-shell/src/core/shell`, `rtk grep "rl.on" packages/ts-shell/src/entrypoints/cli.tsx`, `rtk grep "close" packages/ts-shell/src/entrypoints/cli.tsx packages/ts-shell/src/core/shell/signalHandlers.ts packages/ts-shell/src/cli-baseline.test.ts`, `rtk grep "SIGINT" packages/ts-shell/src/entrypoints/cli.tsx packages/ts-shell/src/core/shell/signalHandlers.ts packages/ts-shell/src/cli-baseline.test.ts`.
  - Reference comparison commands: `rtk grep "readline" D:\LenovoSoftstore\pyproject\source-claudecode\commands.ts D:\LenovoSoftstore\pyproject\source-claudecode\query.ts D:\LenovoSoftstore\pyproject\source-claudecode\QueryEngine.ts`, `rtk grep "approval" D:\LenovoSoftstore\pyproject\source-claudecode\commands.ts D:\LenovoSoftstore\pyproject\source-claudecode\query.ts D:\LenovoSoftstore\pyproject\source-claudecode\QueryEngine.ts`, `rtk grep "isTTY" packages/ts-shell/src/entrypoints/cli.tsx packages/ts-shell/src/cli-baseline.test.ts scripts/verify-cli-entry.mjs D:\LenovoSoftstore\pyproject\opencode\packages\opencode\src\cli\cmd\run.ts`, `rtk grep "permission.asked" D:\LenovoSoftstore\pyproject\opencode\packages\opencode\src\cli\cmd\run.ts D:\LenovoSoftstore\pyproject\opencode\packages\opencode\src\acp\agent.ts D:\LenovoSoftstore\pyproject\opencode\packages\opencode\src\permission\permission.ts`.
  - `rtk npm run build -w packages/ts-shell`: sandbox run failed with `EPERM` while writing `dist`; elevated rerun of the same RTK command passed.
- B startup smoke round:
  - `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "interactive"`: sandbox run failed with Vitest/esbuild `spawn EPERM`; elevated rerun passed with 1 selected test and 35 skipped.
  - `rtk npm run verify:cli-entry`: sandbox run failed creating `D:\Test\cli-entry-gate\fixture.txt` with `EPERM`; elevated rerun passed all CLI entry checks.
  - `rtk npm run build -w packages/ts-shell`: sandbox run failed with `EPERM` while writing `dist`; elevated rerun of the same RTK command passed.
- C slash command smoke round:
  - `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "interactive"`: sandbox run failed with Vitest/esbuild `spawn EPERM`; elevated rerun passed with 2 selected tests and 35 skipped.
  - `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"`: sandbox run failed with Vitest/esbuild `spawn EPERM`; elevated rerun passed with 5 selected tests and 32 skipped.
  - `rtk npm run build -w packages/ts-shell`: sandbox run failed with `EPERM` while writing `dist`; elevated rerun of the same RTK command passed.
- D stopped follow-up smoke round:
  - `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "interactive"`: sandbox run failed with Vitest/esbuild `spawn EPERM`; elevated rerun passed with 3 selected tests and 35 skipped.
  - `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts`: sandbox run failed with Vitest/esbuild `spawn EPERM`; elevated rerun passed with 56 tests.
  - `rtk npm run build -w packages/ts-shell`: sandbox run failed with `EPERM` while writing `dist`; elevated rerun of the same RTK command passed.
- E approval prompt smoke audit:
  - `rtk grep "node-pty" package.json packages/ts-shell/package.json packages/ts-shell/src scripts`: no matches.
  - `rtk grep "pty" package.json packages/ts-shell/package.json packages/ts-shell/src scripts`: no PTY harness/dependency matches.
  - `rtk read packages/ts-shell/package.json`: confirmed dependencies are empty and dev dependencies are only Vitest, TypeScript, and TSX.
  - `rtk grep "approval>" packages/ts-shell/src/cli-baseline.test.ts packages/ts-shell/src/test-utils/cliHarness.ts packages/ts-shell/src/entrypoints/cli.tsx`: found production `approval> ` prompt in `cli.tsx` and only non-leak assertions in current tests.
  - `rtk proxy powershell -NoProfile -Command "Get-Content packages/ts-shell/src/entrypoints/cli.tsx | Select-Object -Skip 1618 -First 80"`: confirmed approval prompt is rendered only when the CLI does not classify the channel as non-interactive.
  - `rtk npm run build -w packages/ts-shell`: sandbox run failed with `EPERM` while writing `dist`; elevated rerun of the same RTK command passed.
- F approval boundary round:
  - `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "interactive"`: sandbox run hit Vitest/esbuild `spawn EPERM`; elevated rerun passed with 3 selected tests and 36 skipped.
  - `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "print"`: elevated rerun passed with 6 selected tests and 33 skipped.
  - `rtk npm run verify:cli-entry`: elevated rerun passed all CLI entry checks, including `cli-entry-non-interactive-approval-boundary`.
  - `rtk npm run build -w packages/ts-shell`: elevated rerun passed.
- G EOF / close / interrupt attribution round:
  - `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "interactive"`: sandbox run hit Vitest/esbuild `spawn EPERM`; elevated rerun passed with 4 selected tests and 36 skipped.
  - `rtk npm run verify:result-contract`: sandbox run hit child process `spawn EPERM`; elevated rerun passed all result-contract checks.
  - `rtk npm run build -w packages/ts-shell`: sandbox run hit `dist` write `EPERM`; elevated rerun passed.

Notes:

- This route starts from `b22f9d7 Seal real provider safe evidence track`.
- A audit found that `packages/ts-shell/src/cli-baseline.test.ts` already contains inline `spawn`-based interactive-ish scenarios: startup surface, stdin writes, approval response, `/resume`, SIGINT/kill, close handling, golden multi-turn synthetic smoke, and user-driven approval allow/deny evidence.
- `packages/ts-shell/src/test-utils/cliHarness.ts` currently exposes `runCliCommandToClose`, `normalizeCliOutput`, and git fixture helpers; it does not yet provide a reusable prompt-readiness driver, multi-turn stdin driver, approval response helper, or EOF/interrupt attribution helper.
- `scripts/verify-cli-entry.mjs` remains non-interactive / `--print` focused and uses synthetic home. It is useful as a boundary reference but is not a live TTY harness.
- `packages/ts-shell/src/entrypoints/cli.tsx` already has the production interactive boundary: `readline.createInterface`, `rl.on("line")`, `rl.on("close")`, `process.stdin.isTTY` mode separation, and interactive approval prompt `approval> `.
- Target search found `approval> ` assertions and stdin writes in `cli-baseline.test.ts`, but no reusable test-utils API for waiting on prompt readiness or for scripted line-by-line interaction.
- Target search for `Ctrl+D` returned no direct test marker, so EOF/close behavior is indirectly covered through `stdin.end()` / close handling but not named as a live TTY EOF contract.
- Claude Code reference grep did not reveal a direct `readline`/approval CLI harness in the inspected files; useful alignment is semantic: user input and abort/interrupt are load-bearing query-loop state, not execution-plane shortcuts.
- opencode reference shows a clear `process.stdin.isTTY` split and event-based `permission.asked` handling, supporting this route's boundary: interactive permission decisions should be explicit and non-interactive stdin should not accidentally enter prompt UX.
- B implementation kept production behavior unchanged and did not modify `cli.tsx`, `SessionManager.ts`, or `runMvpIntegratedFlow.ts`.
- `runInteractiveStartupSmoke` intentionally covers only startup readiness and session id capture. It kills the child after the marker, so it is not yet a general multi-turn, slash-command, approval, or EOF harness.
- The new startup smoke runs with `PRIVATE_AGENTS_PROVIDER_MODE=synthetic`, uses the test fake home, and does not read or modify `D:\Test\home-sf`.
- C implementation kept production behavior unchanged and did not modify `cli.tsx`, `SessionManager.ts`, or `runMvpIntegratedFlow.ts`.
- `runInteractiveLineSmoke` intentionally supports one scripted line and one expected marker. It is enough for harmless slash-command evidence but is not yet a general multi-turn driver.
- The `/sessions current` smoke stays within synthetic/test home, does not execute a model/provider turn, does not emit `Result`, and does not enter `approval>`.
- D implementation kept production behavior unchanged and did not modify `cli.tsx`, `SessionManager.ts`, or `runMvpIntegratedFlow.ts`.
- The stopped recovery fixture now lives in `packages/ts-shell/src/test-utils/stoppedRecoveryFixture.ts` and is shared by the existing print-mode `/continue` test and the new interactive `/continue <follow-up>` smoke, avoiding duplicate large transcript/state setup in `cli-baseline.test.ts`.
- The interactive stopped follow-up smoke uses fake home and `PRIVATE_AGENTS_PROVIDER_MODE=synthetic`; it does not read or modify `D:\Test\home-sf`.
- Three-file guardrail clarification: `cli.tsx`, `SessionManager.ts`, and `runMvpIntegratedFlow.ts` may be modified when the feature truly belongs to their entry wiring / durable session state / orchestration responsibilities. The guardrail is not a blanket ban; it requires a responsibility check and minimal scoped changes.
- E is blocked because current process-pipe tests are intentionally non-TTY. Adding a fake `FORCE_INTERACTIVE_TTY` style switch would make the evidence misleading and violate the route rule against fake live TTY behavior.
- F implementation intentionally did not modify `cli.tsx`: current production mode separation already belongs there and was sufficient. The new test locks the observable `--print` non-interactive boundary; default pipe-stream approval behavior is not treated as live TTY prompt evidence and remains separate from the deferred PTY prompt work.
- F validation rejected an overbroad first attempt to assert default pipe-stream approval as `--print` default-deny. The actual pipe-stream default CLI can proceed through synthetic approval and then stop on execution/verification failure, so this checkpoint intentionally scopes the hard gate to `--print` non-interactive approval and leaves pipe-stream approval attribution for a future blocker only if it becomes main-path critical.
- G implementation stayed in test utilities and test orchestration. It did not change `cli.tsx`; production EOF/close behavior was already expressed by the default non-TTY stream close path and this checkpoint locks the user-visible contract.
- Next selected checkpoint is H. Live TTY route audit / merge readiness. It should verify and seal the route, not add another same-family interactive proof.

## 13. 每个 checkpoint 的目标、允许/禁止修改文件、验证命令

### A. Interactive CLI harness audit

目标：

- 只读审计当前 CLI baseline、test-utils、scripts 是否已有可复用 interactive harness。
- 确认是否能自动化 stdin/stdout/TTY-like driver、prompt readiness、slash command、approval prompt、EOF/interrupt。
- 产出明确缺口和下一 checkpoint 选择，不立即重写 CLI。

允许修改：

- `PLANS.live-tty-interactive-evidence.md`
- 如需记录审计结果，可新增不含 secret 的 docs/plan notes。

禁止修改：

- production CLI behavior。
- provider/auth core。
- `D:\Test\home-sf` 下任何文件。
- 三大巨型文件。

验证：

```powershell
rtk git status --short
rtk npm run build -w packages/ts-shell
```

### B. Minimal interactive startup smoke

目标：

- 使用 synthetic/test home 验证 default interactive startup surface。
- 覆盖 project/session/runtime 信息和 prompt readiness。
- 不执行真实 provider turn。

允许修改：

- `packages/ts-shell/src/test-utils/*`
- `packages/ts-shell/src/core/shell/*`
- `packages/ts-shell/src/cli-baseline.test.ts` 的最小测试编排
- `scripts/*`
- `PLANS.live-tty-interactive-evidence.md`

禁止修改：

- provider/auth core。
- real home files。
- 三大巨型文件，除非最小接线且有记录。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "interactive"
rtk npm run verify:cli-entry
```

### C. Interactive slash command smoke

目标：

- 验证 `/continue`、`/sessions`、`/permissions` 或 harmless slash command 在 interactive shell 中的输出和 terminal behavior。
- 确认 slash command 与 normal prompt 分流稳定。

允许修改：

- interactive test helper。
- `packages/ts-shell/src/core/commands/*` 的 focused fixture 或 test-only helper。
- `PLANS.live-tty-interactive-evidence.md`

禁止修改：

- slash command broad rewrite。
- provider/auth core。
- dangerous tool execution。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "interactive"
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"
```

### D. Interactive stopped follow-up smoke

目标：

- 构造 stopped session，启动 interactive shell，输入 follow-up。
- 确认 recovery context、previous result、blocker、DoNext 不丢失。

允许修改：

- `packages/ts-shell/src/test-utils/*`
- `packages/ts-shell/src/core/shell/*`
- focused tests。
- `PLANS.live-tty-interactive-evidence.md`

禁止修改：

- SessionManager broad rewrite。
- long-session 同族 proof。
- real provider access。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "interactive"
rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts
```

### E. Interactive approval prompt smoke

目标：

- 用 synthetic/tool fixture 验证 interactive approval requested / denied / approved 的用户可见行为。
- 不执行危险命令，不污染真实 home。

允许修改：

- approval prompt fixture。
- shell action smoke helper。
- focused tests。
- `PLANS.live-tty-interactive-evidence.md`

禁止修改：

- permission model expansion。
- dangerous command execution。
- real home access。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "interactive"
rtk npm run verify:result-contract
```

### F. Non-interactive vs interactive approval boundary

目标：

- 确认 `--print` / non-interactive 仍不会误进 interactive prompt。
- 确认 interactive 下才允许 ask/decision。

允许修改：

- focused tests。
- `packages/ts-shell/src/test-utils/*`
- `PLANS.live-tty-interactive-evidence.md`

禁止修改：

- CLI mode broad rewrite。
- provider/auth core。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "interactive"
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "print"
rtk npm run verify:cli-entry
```

### G. EOF / close / interrupt attribution smoke

目标：

- 验证 Ctrl-D / EOF / close 或可模拟 interrupt 不会产生虚假 success。
- 确认 session persistence 不被破坏。

允许修改：

- interactive test harness。
- focused tests。
- `PLANS.live-tty-interactive-evidence.md`

禁止修改：

- broad terminal taxonomy expansion。
- Rust execution-plane semantics，除非发现明确边界缺口并另开路线。

验证：

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "interactive"
rtk npm run verify:result-contract
```

### H. Live TTY route audit / merge readiness

目标：

- 路线阶段性完成后集中验证 build、cli-entry、result-contract、interactive focused smoke、synthetic golden。
- 不继续扩同族 proof。

允许修改：

- `PLANS.live-tty-interactive-evidence.md`
- 明确回归的最小修复。

禁止修改：

- 新增 checkpoint。
- opportunistic extraction。
- provider/auth core。

验证：

```powershell
rtk git status --short
rtk npm run build -w packages/ts-shell
rtk npm run verify:cli-entry
rtk npm run verify:result-contract
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "interactive"
HOME=D:\Test\pca-home-synth USERPROFILE=D:\Test\pca-home-synth PRIVATE_AGENTS_PROVIDER_MODE=synthetic rtk npm run test:gate:golden-main-path
```

## 14. 失败归因规则

所有失败先归因，不直接扩大修复：

1. 本路线引入的真实回归。
2. interactive harness flake 或测试维护问题。
3. 既有旧失败。
4. 过宽 filter 命中 unrelated case。
5. 环境问题，例如 sandbox EPERM、spawn EPERM、工具超时、PowerShell profile warning、RTK/audit 副作用。
6. TTY/PTY 环境能力限制。
7. provider/network/auth/config 外部状态。
8. 并行分支或 main 差异导致。

处理规则：

- 本路线真实回归：最小修复并重跑相关验证。
- harness flake：优先收窄 harness 和断言，不改生产行为。
- 既有旧失败：记录证据，不顺手大修。
- 环境问题：可重跑一次或 elevated rerun，并记录为环境问题。
- TTY/PTY 环境限制：记录能力缺口，必要时将 checkpoint 标记 blocked，不伪造 live evidence。
- 无法确认归因：停止 checkpoint，不 merge。

## 15. interactive CLI / TTY 测试安全规则

interactive tests 必须：

- 自动化、可重复、可清理，不需要人工手动操作。
- 使用 synthetic/test home 或临时 test home。
- 设置 `PRIVATE_AGENTS_PROVIDER_MODE=synthetic`，除非 checkpoint 明确说明不需要 provider。
- 不读取、写入或清理 `D:\Test\home-sf`。
- 不执行危险命令。
- 不依赖真实网络、真实 provider 或真实 credentials。
- 对 prompt readiness、terminal state、EOF/interrupt、approval decision 有明确超时和失败归因。
- 测试输出不得包含 secret、real home config 内容或不可恢复 credential 片段。

## 16. RTK/audit 残留规则

验证产生的残留必须清理或还原：

- `.sisyphus/audit/permissions.jsonl`
- `packages/ts-shell/.sisyphus/audit/permissions.jsonl`
- `rtk/history.db`
- 同类 audit/runtime residue。

不得提交：

- audit 残留。
- real home 文件。
- temporary home。
- 无关生成物。

如果 `rtk git status` 或 `rtk git restore` 会再次写 audit，说明原因后使用最小 raw `git status --short` / `git restore` 做最终确认。

## 17. 提交/push 规则

每个 checkpoint 一个 commit。

Planning round commit:

```text
Plan live TTY interactive evidence track
```

后续 checkpoint commit message 必须描述真实边界，例如：

- `Audit interactive CLI harness`
- `Add interactive startup smoke`
- `Add interactive slash command smoke`

Push 规则：

- push 失败如果是认证、网络、权限、审核失败，不绕过、不反复重试。
- 记录 commit hash、push 失败原因、当前 `git status`。
- merge 回 main 前必须重新确认 `origin/main` 与本地 main 差异。

## 18. 当前推荐第一个 checkpoint

推荐第一个 checkpoint：

```text
A. Interactive CLI harness audit
```

类型：

```text
read-only audit / planning checkpoint
```

选择原因：

- 当前已经有 CLI baseline、verify scripts 和 synthetic golden，但尚不确定是否已有可复用的 interactive stdin/stdout/TTY-like harness。
- 在新增 smoke 前，需要先确认现有 helper 能否可靠驱动 default CLI、slash command、approval prompt、EOF/interrupt。
- 该 checkpoint 不需要 real-provider、不需要读取 real home、不需要修改三大巨型文件，风险最低且最贴近 live TTY / interactive CLI 主线。
