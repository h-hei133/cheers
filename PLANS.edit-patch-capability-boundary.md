# Edit / Apply Patch Capability Boundary

## 1. 总目标

建立 edit / apply_patch capability boundary 路线，在实现完整 patch engine 之前，先把当前安全边界、能力缺口、目标模块职责、失败归因、验证策略和后续 checkpoint 顺序固定下来。

本路线直接服务 user-minimal real main path:

- Step 4: 真实工具链中的 edit / patch mutation 必须有明确 permission、parse、verify、apply 和 result 边界，不能靠 prompt keyword 或 orchestration inline 逻辑冒进。
- Step 5: edit / patch 成功、拒绝、失败、stale-read、partial mutation、verification blocked 都必须进入清晰 terminal state 和 retryable next action。

本轮只创建计划文件，不实现 checkpoint，不改变用户可见行为。

## 2. 当前分支

```text
edit-patch-capability-boundary
```

从当前本地 `main` 创建。

## 3. base/main 状态

分支 base 为本地 `main`:

```text
b6ce579 Record real provider read-only route merge readiness
```

状态确认:

- 当前 `main...origin/main` synchronized。
- 工作树在分支创建前 clean。
- 上一条 `real-provider-readonly-coding-evidence` 路线已合并回 `main` 并 stage-sealed。
- 不 reset、rebase、drop 或覆盖本地提交。

## 4. 背景审查结论

此前已经完成或阶段性收口:

- `main-path-boundaries`: 三大巨型文件第一轮边界治理。
- `real-main-path-evidence`: CLI / real-ish main path evidence。
- `long-session-continuity-hardening`: compact / replay / resume / continue continuity。
- `real-provider-safe-evidence`: real-provider safety attribution / redaction / dry-run evidence。
- `live-tty-interactive-evidence`: pipe-spawn interactive evidence。
- `pty-strategy-capability-boundary`: pipe-spawn 不等于 true PTY，true PTY 继续前需要 strategy / dependency approval。
- `approval-tool-provenance-contract`: approval/tool execution provenance contract 已封口。
- `real-provider-readonly-coding-evidence`: real-provider read-only / failure attribution evidence 已封口并合并。

当前 edit/patch 安全失败面已经较稳，但能力上限仍落后 Claude Code / opencode: 没有完整 apply_patch parser、multi-file patch、add/delete/move、multi-hunk verification、preview、rollback / no-partial-apply contract。

## 5. 为什么选择 edit / apply_patch capability boundary

当前 single-file explicit replace 已能覆盖一部分 MVP edit path，但用户连续完成真实 coding task 时，下一层真实阻塞是: 模型常会输出 unified diff 或 apply_patch shaped payload，而目标仓库当前正确地拒绝这些输入。继续能力扩展前必须先定边界，避免把半成品 parser/applicator 塞进 `runMvpIntegratedFlow.ts` 或让 partial apply 伪装成成功。

选择本主线的原因:

- 它直接影响真实工具链 mutation 能力和终端失败可行动性。
- 它把“继续拒绝”与“最小支持”的策略选择显式化。
- 它为 parse / verify / preview / apply / result summary / atomicity 划清模块职责。
- 它避免在没有 no-partial contract 的情况下支持写入。

## 6. 明确不做的方向

- 不新增 provider，不改 auth core。
- 不读取、复制、打印、修改、清理或泄露真实 auth/key/provider 配置。
- 不运行 real-provider smoke，不默认运行 `verify-real-user-capabilities`。
- 不触碰 `D:\Test\home-sf`。
- 不处理 Windows EBUSY。
- 不修 `runMvpIntegratedFlow` 全量旧失败。
- 不继续 provider readiness、real-provider dry-run、PTY、long-session、approval/tool provenance、verification surface 同族 proof。
- 不把 `apply_patch` 从 unsupported 直接改成半支持。
- 不在没有 parser / verifier / no-partial contract 的情况下写文件。
- 不实现完整 apply_patch、AST patch、rollback、batch engine。
- 不为了减少行数而继续拆三大巨型文件。
- 不改变已有用户可见 terminal wording，除非先证明旧行为是 bug。

## 7. 环境约束

目标仓库:

```text
D:\LenovoSoftstore\pyproject\source-claudecode\private-coding-agents
```

参考仓库只读:

```text
D:\LenovoSoftstore\pyproject\source-claudecode
D:\LenovoSoftstore\pyproject\opencode
```

RTK command discipline active:

- 文件读取、搜索、git inspection、diff、build、test、大输出命令必须显式使用 `rtk`。
- raw git 只用于 mutation，例如 branch switch / add / commit / merge。

Synthetic/test home:

```text
D:\Test\pca-home-synth
PRIVATE_AGENTS_PROVIDER_MODE=synthetic
```

失败态或隔离验证只能使用 synthetic/test home 或临时 test home，不得污染 `D:\Test\home-sf`。

## 8. 参考实现约束

目标仓库优先；参考仓库只做语义对照，不照抄代码。

Claude Code semantic reference:

- `tools/FileEditTool/FileEditTool.ts`
- `tools/FileEditTool/utils.ts`
- `tools/FileEditTool/types.ts`
- `tools/FileEditTool/prompt.ts`
- `query.ts` / `QueryEngine.ts` 中 tool result / error handling 相关位置

opencode semantic reference:

- `packages/opencode/src/tool/edit.ts`
- `packages/opencode/src/tool/multiedit.ts`
- `packages/opencode/src/tool/apply_patch.ts`
- `packages/opencode/src/patch/patch.ts`
- `packages/opencode/src/tool/tool.ts`
- `packages/opencode/src/permission/permission.ts`

吸收点:

- Claude Code FileEditTool 将 input validation、read-first/stale guard、diff generation、permission、write、result 输出分层。
- Claude Code edit output 保留 original file、structured patch、replaceAll、userModified 等 result metadata。
- opencode 将 edit 与 apply_patch 分成不同工具，apply_patch 先 parse/validate all file changes，再进入 permission / apply / result metadata。
- opencode apply_patch 的 multi-file metadata 包括 add/update/delete/move 类型、diff、additions/deletions 和 per-file summary。

## 9. 三大巨型文件新增代码约束

本路线 planning commit 不触碰:

- `packages/ts-shell/src/entrypoints/cli.tsx`
- `packages/ts-shell/src/session/SessionManager.ts`
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`

后续实现中:

- patch parser 不得放进 `runMvpIntegratedFlow.ts`。
- patch verifier 不得放进 `runMvpIntegratedFlow.ts`。
- patch applicator 不得放进 `runMvpIntegratedFlow.ts`。
- patch preview / summary / failure contract 不得散落在 `sessionRuntime` / `resultMapper` / CLI 中。
- `runMvpIntegratedFlow.ts` 只能做最小 orchestration 接线，而且必须等 parser / verifier / no-partial contract 清楚之后。

优先模块位置:

- `packages/ts-shell/src/orchestration/patchParsing/*`
- `packages/ts-shell/src/orchestration/patchVerification/*`
- `packages/ts-shell/src/orchestration/patchApplication/*`
- `packages/ts-shell/src/orchestration/patchResult/*`
- `packages/ts-shell/src/orchestration/patchMutationLane.ts`
- `packages/ts-shell/src/orchestration/mutationExecution.ts`
- `packages/ts-shell/src/core/query/*`
- `packages/ts-shell/src/core/shell/*`
- `packages/ts-shell/src/test-utils/*`

## 10. 当前已闭合能力

Current closed or stage-sealed capabilities:

- packaged CLI and `--print` / stdin boundary。
- synthetic golden main path。
- result/failure terminal contract。
- provider readiness and provider failure redaction。
- real-provider safe / read-only attribution and opt-in evidence。
- long-session compact / replay / resume continuity。
- approval/tool execution provenance internal contract。
- pipe-spawn interactive smoke boundary。
- PTY strategy/capability boundary。
- single-file explicit replace lane 的安全失败面。
- apply_patch / unified diff shaped input rejection。
- stale-read blocker。
- partial mutation failure summary surface。

## 11. 当前主要风险

- 半支持 apply_patch 会产生 false success 或 partial write。
- multi-file patch 如果先写一部分再失败，会破坏 no-partial safety。
- parser / verifier / applicator 若混在 orchestration 中，会扩大 `runMvpIntegratedFlow.ts` 巨型文件负担。
- resultMapper / sessionRuntime 如果继续从字符串推断 patch failure，后续能力扩展会脆弱。
- 当前 `partial-mutation-failed` 可以汇总已经发生的部分变更，但不是 atomic no-partial contract。
- 支持 add/delete/move 前必须先有 path normalization、workspace boundary 和 permission metadata。
- 支持 fuzzy patch 前必须证明不会误改相似上下文。

## 12. 当前 edit/patch capability map

Target files and current facts:

- `packages/ts-shell/src/orchestration/patchMutationLane.ts`
  - Supports one explicit single-file text replacement.
  - Failure codes include `patch-target-missing`, `patch-from-not-found`, `patch-ambiguous`, `patch-generation-failed`.
  - Rejects apply_patch and unified diff shaped input as `patch-generation-failed`.
  - Rejects multi-file target intent instead of silently choosing one file.
- `packages/ts-shell/src/orchestration/mutationExecution.ts`
  - Owns stale-read verification before dispatch.
  - Reports `write-failed`.
  - Aggregates changedFiles, failedFiles, patches, evidence.
  - Emits `partial-mutation-failed` summary when any mutation result fails.
- `packages/ts-shell/src/orchestration/targetResolution.ts`
  - Extracts prompt file targets.
  - Blocks ambiguous sibling target selection with `ambiguous-target`.
- `packages/ts-shell/src/core/query/resultMapper.ts`
  - Classifies actionable blockers from evidence and reason text.
  - Knows patch/stale/partial mutation blocker kinds.
- `packages/ts-shell/src/core/shell/sessionRuntime.ts`
  - Renders changed files, failed files, patch failure summary, read-only evidence, and next action.
- `packages/ts-shell/src/orchestration/types.ts`
  - `CodingPatchRecord` currently models `replace` / `append` operations and applied/failed patch records.

## 13. 当前 explicit replace lane 的边界

Current supported lane:

- One target file.
- Exact `replace-from` / `replace-to` style mutation.
- Read current target before write.
- Reject missing target, missing source text, ambiguous source text, unsupported patch payload shape, and multi-file target intent.
- Record changed lines / added lines / removed lines for applied replacement.

Current unsupported lane:

- Full apply_patch grammar.
- Unified diff application.
- Multi-file patch.
- Add / delete / move.
- Multi-hunk verification.
- Preview-only patch plan.
- Atomic no-partial apply.
- Rollback.

## 14. 当前 apply_patch/unified diff rejection 边界

Current policy:

- apply_patch-shaped input and unified diff input must remain rejected as `patch-generation-failed`.
- Rejection is intentional and safe because current lane only supports explicit single-file text replacement.
- Rejection must not be reclassified as generic model failure.
- Terminal next action should steer user/model toward exact target file plus exact current text and desired replacement.

Short-term rule:

- Keep rejection until at least parser-only, verification-only, preview, and no-partial contracts exist.

## 15. 候选能力路线：继续拒绝 vs 最小支持

Candidate 1: Continue rejecting apply_patch.

- Lowest implementation risk.
- Keeps current safety surface intact.
- Leaves capability gap for real coding tasks where model emits patch syntax.

Candidate 2: Parser / preview only.

- Parse apply_patch grammar into structured plan.
- Verify shape and report preview summary.
- Do not write files.
- Useful first implementation step.

Candidate 3: Single-file update-only support.

- Only support `*** Update File` for one file.
- Require all hunks verify before any write.
- No add/delete/move/multi-file.

Candidate 4: Multi-file full support.

- Requires no-partial apply or rollback.
- Requires per-file permission metadata.
- Requires result summary and changed/failed file contract.
- Not suitable as first implementation checkpoint.

Recommended short-term strategy:

- Keep current rejection for production path.
- First add parser-only / preview / verification contracts in isolated modules.
- Only consider apply after no-partial behavior is proven by tests.

Checkpoint C decision:

- Production behavior remains unchanged: `apply_patch` shaped input and unified diff shaped input continue to be rejected as `patch-generation-failed`.
- The route does not proceed directly to parser or applicator implementation from C.
- The next implementation checkpoint is type/contract design only, with no production wiring and no disk mutation.
- The first future supported shape, if later approved by parser/verify/preview/no-partial checkpoints, should be a structured apply_patch grammar contract that can represent add/update/delete/move but may still reject every operation except the selected minimum support level.
- Short-term minimum support target remains parser/preview/verification-first, not apply-first.
- `*** Update File` single-file update-only is the earliest plausible apply candidate, but only after D-H prove structured types, parsing, verification, preview, and no-partial apply behavior.
- Multi-file, add, delete, move, fuzzy matching, rollback, AST patching, and broad batch engines remain explicitly deferred.
- Unsupported shapes must continue to produce safe structured blocker evidence and actionable next action rather than partial writes or generic model failure.

## 16. parse / verify / apply / preview / result contract 的目标模块布局

Recommended module responsibilities:

- `patchParsing/*`
  - Parse raw patch text into `ParsedPatch`.
  - Normalize line endings.
  - Identify add/update/delete/move.
  - Reject unsupported grammar with structured failure code.
- `patchVerification/*`
  - Resolve workspace paths.
  - Check file existence / directory boundaries.
  - Check update hunk context.
  - Detect unsupported multi-file or operation types based on current capability decision.
  - Produce `PatchVerificationResult`.
- `patchApplication/*`
  - Apply only preverified plans.
  - Own no-partial apply or rollback mechanics when enabled.
  - Never parse raw text.
- `patchResult/*`
  - Convert parse/verify/apply output into changedFiles / failedFiles / patches / evidence / nextAction.
  - Keep terminal wording stable by feeding structured contracts to existing result surfaces.
- `mutationExecution.ts`
  - Continue owning generic mutation dispatch and summary aggregation.
  - Do not become a parser.
- `runMvpIntegratedFlow.ts`
  - Future minimal orchestration wiring only.

## 17. no-partial-apply / rollback / atomicity 策略候选

Candidate A: Verify-all-before-write.

- For every file/hunk, compute planned new content in memory first.
- If any verification fails, write nothing.
- Best first target for single-file or limited multi-file support.

Candidate B: Temp-file staging + commit.

- Write staged outputs to temp files, then replace targets after full verification.
- Adds filesystem complexity but can reduce partial writes.

Candidate C: Snapshot + rollback.

- Capture original content and restore if any later write fails.
- Must handle add/delete/move carefully.
- Higher risk on Windows file locks and EBUSY.

Candidate D: Git-backed rollback.

- Not acceptable as default; working tree may contain user changes and not every workspace is git-clean.

Recommended first atomicity rule:

- No production apply until verify-all-before-write is implemented and tested.
- Rollback remains deferred until a concrete need appears.

## 18. 路线分阶段 backlog

Current:

- A. Current edit/patch capability audit
  - Type: read-only audit / plan update.
  - Goal: audit patchMutationLane, mutationExecution, targetResolution, runMvp edit/write path, resultMapper, and sessionRuntime edit/patch capability and failure contract.
- B. Reference implementation comparison
  - Type: read-only reference comparison / plan update.
  - Goal: compare Claude Code FileEditTool and opencode edit/apply_patch semantics, then document boundaries to absorb without copying code.
- C. Capability decision document
  - Type: decision document / plan update.
  - Goal: choose short-term production policy and explicitly separate parser/contract design from any apply behavior.
- D. Patch contract type design
  - Type: isolated type contract implementation.
  - Goal: add minimal structured contracts for parsed patches, file operations, hunks, verification, application plans, previews, and failure codes without production wiring.
- E. Parser-only prototype
  - Type: isolated parser-only implementation.
  - Goal: parse apply_patch grammar into structured output or structured rejection without filesystem reads, writes, verification, or production wiring.
- F. Verification-only checkpoint
  - Type: isolated dry verification implementation.
  - Goal: verify parser output against read-only workspace state, operation support, workspace boundaries, and hunk context without writes or production wiring.

Backlog:

- G. Preview contract checkpoint
- H. No-partial-apply contract checkpoint
- I. Minimal single-file update apply checkpoint
- J. Multi-file strategy checkpoint
- K. Route audit / merge readiness

Completed:

- Planning: created `PLANS.edit-patch-capability-boundary.md` from current local `main`.
- A. Current edit/patch capability audit
  - Result: completed as a read-only audit / plan update checkpoint.
  - Files changed:
    - `PLANS.edit-patch-capability-boundary.md`
  - Target audit findings:
    - `packages/ts-shell/src/orchestration/patchMutationLane.ts` owns the current single-file explicit replace lane, including exact match success, `patch-target-missing`, `patch-from-not-found`, `patch-ambiguous`, `patch-generation-failed`, apply_patch-shaped rejection, unified diff rejection, and multi-file target intent rejection.
    - `packages/ts-shell/src/orchestration/mutationExecution.ts` owns stale-read pre-dispatch verification, write failure reporting, applied/failed patch records, changed/failed file aggregation, and `partial-mutation-failed` blocker construction.
    - `packages/ts-shell/src/orchestration/mutationResultAggregation.ts` is already a clean small-module boundary for reconciling mutation summaries into `changedFiles`, `failedFiles`, `patches`, `evidence`, and `repairNotes`.
    - `packages/ts-shell/src/orchestration/targetResolution.ts` owns prompt file target extraction and blocks ambiguous sibling edit targets before mutation planning.
    - `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts` imports these helper modules, resolves task targets near planning, calls `executeFileMutationBranch` from the edit/write orchestration branch, reconciles mutation summaries after mutation attempts, and calls `applySingleFileReplacePatch` only inside the explicit replace instruction derivation path.
    - `packages/ts-shell/src/core/query/resultMapper.ts` recognizes patch/stale/partial mutation blockers from structured evidence markers when present, but still has fallback reason-text classification for patch-generation, stale-read, partial-mutation, from-not-found, ambiguous-target, and related blockers.
    - `packages/ts-shell/src/core/shell/sessionRuntime.ts` renders coding result summaries and next actions for patch blockers, but also still contains local classifier/rendering logic for patch/stale/partial mutation kinds.
    - Focused tests already cover patch lane success/failures, stale-read pre-dispatch blocking, partial mutation summary blockers, ambiguous target resolution, runMvp apply_patch-shaped rejection, and result/session rendering for partial mutation blockers.
  - Boundary result:
    - Current production policy remains correct: `apply_patch` and unified diff input stay rejected until parser/verification/preview/no-partial contracts exist.
    - The next checkpoint should not implement parser/apply yet; it should compare Claude Code and opencode semantics and document which boundaries to adopt.
    - No real provider smoke was run.
    - `D:\Test\home-sf` was not read, modified, copied, cleaned, or used.
    - No production code, tests, dependency manifest, lockfile, or three-large-file target was modified.
- B. Reference implementation comparison
  - Result: completed as a read-only semantic comparison / plan update checkpoint.
  - Files changed:
    - `PLANS.edit-patch-capability-boundary.md`
  - Claude Code files compared:
    - `D:\LenovoSoftstore\pyproject\source-claudecode\tools\FileEditTool\FileEditTool.ts`
    - `D:\LenovoSoftstore\pyproject\source-claudecode\tools\FileEditTool\utils.ts`
    - `D:\LenovoSoftstore\pyproject\source-claudecode\tools\FileEditTool\types.ts`
    - `D:\LenovoSoftstore\pyproject\source-claudecode\tools\FileEditTool\prompt.ts`
  - opencode files compared:
    - `D:\LenovoSoftstore\pyproject\opencode\packages\opencode\src\tool\edit.ts`
    - `D:\LenovoSoftstore\pyproject\opencode\packages\opencode\src\tool\multiedit.ts`
    - `D:\LenovoSoftstore\pyproject\opencode\packages\opencode\src\tool\apply_patch.ts`
    - `D:\LenovoSoftstore\pyproject\opencode\packages\opencode\src\patch\patch.ts`
  - Reference findings:
    - Claude Code FileEditTool is an exact edit tool, not a general patch engine: its schema centers `file_path`, `old_string`, `new_string`, and optional `replace_all`.
    - Claude Code validates read-first state and stale file modification before writing, rejects missing/not-read/modified/not-found/ambiguous replacement cases, generates patch metadata before write, then returns structured result metadata including original file, structured patch, replaceAll, and userModified.
    - Claude Code keeps edit normalization and patch generation in FileEditTool utilities rather than in the query loop, which reinforces this route's rule that parsing and verification must not be embedded in `runMvpIntegratedFlow.ts`.
    - opencode separates `edit`, `multiedit`, and `apply_patch` tools; `multiedit` is sequential exact edits, while `apply_patch` owns apply_patch-shaped grammar and multi-file metadata.
    - opencode `apply_patch` parses hunks first, validates/derives all file changes, builds permission metadata with diff and per-file summaries, then applies add/update/delete/move changes and reports changed files.
    - opencode `patch/patch.ts` exposes separate parse and verified forms (`MaybeApplyPatch`, `MaybeApplyPatchVerified`, `ApplyPatchAction`, `ApplyPatchFileChange`), which supports target-side parser/verification contracts before any production apply wiring.
  - Boundaries to adopt:
    - Keep exact edit and apply_patch as distinct capability boundaries.
    - Preserve read-first / stale guard semantics before write.
    - Split parse, verify, preview/result, and apply into separate modules.
    - Build permission/result metadata from a preverified diff/plan, not from raw patch text at the terminal layer.
    - Do not enable production apply until no-partial behavior is proven; opencode's sequential write path is informative but not sufficient as the target no-partial contract.
    - Keep current production rejection of apply_patch/unified diff until the capability decision checkpoint explicitly chooses a minimum supported shape.
  - Boundary result:
    - The next checkpoint should be a capability decision document, not parser/apply implementation.
    - No real provider smoke was run.
    - `D:\Test\home-sf` was not read, modified, copied, cleaned, or used.
    - No production code, tests, dependency manifest, lockfile, or three-large-file target was modified.
- C. Capability decision document
  - Result: completed as a decision document / plan update checkpoint.
  - Files changed:
    - `PLANS.edit-patch-capability-boundary.md`
  - Decision:
    - Keep production `apply_patch` and unified diff rejection unchanged for now.
    - Do not add parser/apply wiring in C.
    - Move next to D. Patch contract type design.
    - D may define `ParsedPatch`, file operation, hunk, verification, application-plan, preview/result, and failure-code contracts, but it must not connect to production mutation paths.
    - Parser-only and verification-only behavior remain later checkpoints.
    - No disk mutation from apply_patch is allowed before no-partial behavior is locked.
    - The earliest possible apply candidate remains single-file `*** Update File` after D-H, not before.
  - Still-rejected shapes:
    - raw unified diff.
    - multi-file production apply.
    - add/delete/move production apply.
    - fuzzy patch application.
    - AST patching.
    - implicit apply_patch invocation without explicit tool boundary.
    - any patch with partial verification failure.
  - Boundary result:
    - The current safe rejection policy remains the product behavior.
    - The next checkpoint is contract type design, not parser/apply implementation.
    - No real provider smoke was run.
    - `D:\Test\home-sf` was not read, modified, copied, cleaned, or used.
    - No production code, tests, dependency manifest, lockfile, or three-large-file target was modified.
- D. Patch contract type design
  - Result: completed as an isolated type contract implementation checkpoint.
  - Files changed:
    - `packages/ts-shell/src/orchestration/patchParsing/types.ts`
    - `packages/ts-shell/src/orchestration/patchParsing/types.test.ts`
    - `PLANS.edit-patch-capability-boundary.md`
  - Contracts added:
    - `PatchOperationKind` for add/update/delete/move operation identity.
    - `PatchFailureCode` for parse, verify, apply-plan, write, and no-partial blockers.
    - `PatchLineChange` and `PatchHunk` for structured hunk representation.
    - `PatchFileOperation` union for add/update/delete/move file operations.
    - `ParsedPatch` for raw patch text plus structured operations.
    - `PatchVerificationResult` for ok plan or no-write failures.
    - `PatchApplicationPlan` for verified operations plus atomicity strategy.
    - `PatchPreviewResult` for changed/failed/summary preview with `willWrite: false`.
  - Boundary result:
    - Types are not imported by production orchestration.
    - No parser was implemented.
    - No verifier was implemented.
    - No applicator was implemented.
    - No disk mutation path was added.
    - Current `apply_patch` and unified diff rejection behavior remains unchanged.
    - No real provider smoke was run.
    - `D:\Test\home-sf` was not read, modified, copied, cleaned, or used.
    - `cli.tsx`, `SessionManager.ts`, and `runMvpIntegratedFlow.ts` were not modified.
- E. Parser-only prototype
  - Result: completed as an isolated parser-only implementation checkpoint.
  - Files changed:
    - `packages/ts-shell/src/orchestration/patchParsing/parser.ts`
    - `packages/ts-shell/src/orchestration/patchParsing/parser.test.ts`
    - `packages/ts-shell/src/orchestration/patchParsing/types.ts`
    - `PLANS.edit-patch-capability-boundary.md`
  - Parser-only behavior added:
    - Parses `*** Begin Patch` / `*** End Patch` bounded input.
    - Parses `*** Add File`, `*** Update File`, `*** Delete File`, and `*** Move to` operation shapes into `ParsedPatch`.
    - Parses update hunks with `@@` headers and context/add/remove line changes.
    - Returns structured parse failures for missing markers, empty patches, unsupported operation lines, malformed add content, missing paths, missing hunks, and malformed hunk lines.
  - Boundary result:
    - Parser does not read filesystem state.
    - Parser does not verify file existence, hunk context, path boundaries, or operation support.
    - Parser does not apply patches or write files.
    - Parser is not imported by production orchestration.
    - Current `apply_patch` and unified diff rejection behavior remains unchanged.
    - No real provider smoke was run.
    - `D:\Test\home-sf` was not read, modified, copied, cleaned, or used.
    - `cli.tsx`, `SessionManager.ts`, and `runMvpIntegratedFlow.ts` were not modified.
- F. Verification-only checkpoint
  - Result: completed as an isolated dry verification implementation checkpoint.
  - Files changed:
    - `packages/ts-shell/src/orchestration/patchVerification/verify.ts`
    - `packages/ts-shell/src/orchestration/patchVerification/verify.test.ts`
    - `PLANS.edit-patch-capability-boundary.md`
  - Verification-only behavior added:
    - Verifies `ParsedPatch` with a read-only `readFile` callback and workspace root.
    - Defaults supported operations to `update` only; unsupported add/delete/move fail as `patch-verify-operation-unsupported`.
    - Rejects paths resolving outside the workspace.
    - Rejects missing update targets.
    - Verifies update hunk context with exact line matching.
    - Rejects missing or ambiguous hunk context.
    - Computes planned content, additions, and deletions in memory for verified operations.
    - Blocks the whole patch with `changedFiles: []` if any operation fails verification.
  - Boundary result:
    - Verifier does not write files.
    - Verifier does not apply patches to disk.
    - Verifier is not imported by production orchestration.
    - Current `apply_patch` and unified diff rejection behavior remains unchanged.
    - No real provider smoke was run.
    - `D:\Test\home-sf` was not read, modified, copied, cleaned, or used.
    - `cli.tsx`, `SessionManager.ts`, and `runMvpIntegratedFlow.ts` were not modified.

## 19. 每个 checkpoint 的目标、允许修改文件、禁止修改文件、验证命令

### A. Current edit/patch capability audit

Goal:

- Read-only audit current edit/patch modules and tests.
- Update this plan with Completed / Current / Backlog / Verification / Notes.
- Do not change production behavior.

Allowed files:

- `PLANS.edit-patch-capability-boundary.md`

Forbidden:

- parser/apply implementation.
- real provider execution.
- `D:\Test\home-sf`.
- three large files.

Verification:

```powershell
rtk git status --short
rtk npm run build -w packages/ts-shell
```

### B. Reference implementation comparison

Goal:

- Compare Claude Code FileEditTool and opencode edit/apply_patch semantics.
- Document boundaries to absorb without copying code.

Allowed files:

- `PLANS.edit-patch-capability-boundary.md`

Forbidden:

- production code changes.
- dependency changes.

Verification:

```powershell
rtk git status --short
rtk npm run build -w packages/ts-shell
```

### C. Capability decision document

Goal:

- Decide short-term production policy: continue reject, parser-only, single-file update-only, preview-only, and still-rejected shapes.

Allowed files:

- `PLANS.edit-patch-capability-boundary.md`
- optional design note under `packages/ts-shell/src/orchestration/patch*/` only if needed.

Forbidden:

- applying patches to disk.
- changing current rejection behavior.

Verification:

```powershell
rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts
rtk npm run build -w packages/ts-shell
```

### D. Patch contract type design

Goal:

- Design minimal structured types: `ParsedPatch`, `PatchFileOperation`, `PatchHunk`, `PatchVerificationResult`, `PatchApplicationPlan`, `PatchFailureCode`.
- Do not connect to production path.

Allowed files:

- `packages/ts-shell/src/orchestration/patchParsing/*`
- `packages/ts-shell/src/orchestration/patchVerification/*`
- `packages/ts-shell/src/orchestration/patchResult/*`
- focused tests
- `PLANS.edit-patch-capability-boundary.md`

Forbidden:

- `runMvpIntegratedFlow.ts` unless only type import is proven necessary.
- file writes from patch apply.

Verification:

```powershell
rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts
rtk npm run build -w packages/ts-shell
```

### E. Parser-only prototype

Goal:

- Parse apply_patch grammar into structured output or structured rejection.
- No filesystem writes.
- Explicitly identify unsupported add/delete/move/multi-file if not selected.

Allowed files:

- `packages/ts-shell/src/orchestration/patchParsing/*`
- focused parser tests
- `PLANS.edit-patch-capability-boundary.md`

Forbidden:

- production wiring.
- mutation execution.

Verification:

```powershell
rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts
rtk npm run build -w packages/ts-shell
```

### F. Verification-only checkpoint

Goal:

- Verify parser output against workspace state in dry mode.
- Check file existence, hunk context, operation support, and partial failure conditions.
- No writes.

Allowed files:

- `packages/ts-shell/src/orchestration/patchVerification/*`
- `packages/ts-shell/src/test-utils/*`
- focused tests
- `PLANS.edit-patch-capability-boundary.md`

Forbidden:

- applicator writes.
- CLI/session wiring.

Verification:

```powershell
rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/mutationExecution.test.ts
rtk npm run build -w packages/ts-shell
```

### G. Preview contract checkpoint

Goal:

- Produce changedFiles / failedFiles / patch summary preview without applying to disk.

Allowed files:

- `packages/ts-shell/src/orchestration/patchResult/*`
- focused tests
- `PLANS.edit-patch-capability-boundary.md`

Forbidden:

- disk mutation.
- terminal wording churn.

Verification:

```powershell
rtk npm run verify:result-contract
rtk npm run build -w packages/ts-shell
```

### H. No-partial-apply contract checkpoint

Goal:

- Lock contract that if any file/hunk verification fails, no file is written.
- Prefer verify-all-before-write tests.

Allowed files:

- `packages/ts-shell/src/orchestration/patchVerification/*`
- `packages/ts-shell/src/orchestration/patchApplication/*`
- focused tests
- `PLANS.edit-patch-capability-boundary.md`

Forbidden:

- broad rollback system.
- multi-file production apply unless explicitly scoped.

Verification:

```powershell
rtk npm run test -w packages/ts-shell -- src/orchestration/mutationExecution.test.ts
rtk npm run build -w packages/ts-shell
```

### I. Minimal single-file update apply checkpoint

Goal:

- Only after parse/verify/preview/no-partial contracts are stable, consider one-file update apply.

Allowed files:

- patch parsing / verification / application / result modules
- minimal orchestration wiring if unavoidable
- focused tests
- `PLANS.edit-patch-capability-boundary.md`

Forbidden:

- add/delete/move.
- multi-file apply.
- unsupported unified diff variants.

Verification:

```powershell
rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/mutationExecution.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts -t "apply_patch|target missing|stops ambiguous replace target|from-not-found|stale-read|partial failure summary"
rtk npm run verify:result-contract
```

### J. Multi-file strategy checkpoint

Goal:

- Decide if multi-file patch will be supported.
- If yes, require no-partial contract first.
- If no, keep structured rejection.

Allowed files:

- plan/design files
- focused type/contract tests if needed

Forbidden:

- multi-file production writes without no-partial proof.

Verification:

```powershell
rtk npm run test -w packages/ts-shell -- src/orchestration/mutationExecution.test.ts
rtk npm run build -w packages/ts-shell
```

### K. Route audit / merge readiness

Goal:

- Stage-seal route after focused validation.
- Do not expand same-family proof.

Allowed files:

- `PLANS.edit-patch-capability-boundary.md`
- explicit minimal regression fix if route introduced one.

Forbidden:

- new checkpoint.
- provider/auth core changes.
- unrelated proof-family expansion.

Verification:

```powershell
rtk git status --short
rtk npm run build -w packages/ts-shell
rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/mutationExecution.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/targetResolution.test.ts
rtk npm run verify:result-contract
rtk npm run verify:cli-entry
HOME=D:\Test\pca-home-synth USERPROFILE=D:\Test\pca-home-synth PRIVATE_AGENTS_PROVIDER_MODE=synthetic rtk npm run test:gate:golden-main-path
```

## 20. 失败归因规则

All failures must be classified before fixing:

1. route-introduced product regression.
2. existing old failure.
3. too-broad filter hit unrelated case.
4. environment issue: sandbox EPERM, spawn EPERM, dist write failure, network timeout, PowerShell profile warning.
5. concurrent branch/main difference.
6. inconclusive.

Rules:

- Product regression: minimal fix and rerun related validation.
- Environment issue: record attribution; rerun only when allowed by policy.
- Existing unrelated failure: do not widen task.
- Inconclusive: stop checkpoint, do not merge.

## 21. RTK/audit 残留规则

Validation may generate:

- `.sisyphus/audit/permissions.jsonl`
- `packages/ts-shell/.sisyphus/audit/permissions.jsonl`
- `rtk/history.db`
- similar audit/runtime residue.

Before commit or final status, clean or restore these residues. Do not commit:

- audit residue.
- real user config.
- temporary home.
- unrelated generated artifacts.

If RTK status/restore keeps writing audit residue, explain why and use minimal raw `git restore` / raw final `git status --short` only for cleanup confirmation.

## 22. 提交/push 规则

One checkpoint per commit.

Planning commit:

```text
Plan edit patch capability boundary track
```

Push rules:

- Attempt push once when requested.
- If push fails due network/auth/permission/safety review, do not bypass or retry repeatedly.
- Record commit hash, push failure reason, and current git status.

## 23. 当前推荐第一个 checkpoint

Recommended first checkpoint:

```text
A. Current edit/patch capability audit
```

Type:

```text
read-only audit / plan update
```

Reason:

- Current code already has safe explicit replace and rejection boundaries.
- The next lowest-risk step is to document exact target/result/session/orchestration inference points before designing parser types.
- A does not run real provider, does not touch `D:\Test\home-sf`, does not modify production code, and does not change user-visible behavior.

This planning round does not execute A.

## Checkpoint Status Override

- Completed: Planning.
- Completed: A. Current edit/patch capability audit.
- Completed: B. Reference implementation comparison.
- Completed: C. Capability decision document.
- Completed: D. Patch contract type design.
- Completed: E. Parser-only prototype.
- Completed: F. Verification-only checkpoint.
- Current: G. Preview contract checkpoint.
- Backlog: H. No-partial-apply contract checkpoint; I. Minimal single-file update apply checkpoint; J. Multi-file strategy checkpoint; K. Route audit / merge readiness.
- Verification for Planning: pending.
- Verification for A: `rtk git status --short` passed with only `PLANS.edit-patch-capability-boundary.md` modified. `rtk npm run build -w packages/ts-shell` passed. `rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts` passed with 7 tests. `rtk npm run test -w packages/ts-shell -- src/orchestration/mutationExecution.test.ts` passed with 6 tests. `rtk npm run test -w packages/ts-shell -- src/orchestration/targetResolution.test.ts` passed with 6 tests.
- Verification for B: `rtk git status --short` passed with only `PLANS.edit-patch-capability-boundary.md` modified. `rtk npm run build -w packages/ts-shell` passed.
- Verification for C: `rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts` passed with 7 tests. `rtk npm run build -w packages/ts-shell` passed.
- Verification for D: `rtk npm run test -w packages/ts-shell -- src/orchestration/patchParsing/types.test.ts` passed with 3 tests. `rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts` passed with 7 tests. `rtk npm run build -w packages/ts-shell` passed.
- Verification for E: initial `rtk npm run build -w packages/ts-shell` failed from E-introduced TypeScript narrowing issues in `patchParsing/parser.ts`; fixed locally and reran. Final `rtk npm run test -w packages/ts-shell -- src/orchestration/patchParsing/parser.test.ts` passed with 6 tests. `rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts` passed with 7 tests. `rtk npm run build -w packages/ts-shell` passed. `rtk npm run test -w packages/ts-shell -- src/orchestration/patchParsing/types.test.ts` passed with 3 tests.
- Verification for F: initial `rtk npm run build -w packages/ts-shell` failed from F-introduced TypeScript narrowing issues in `patchVerification/verify.ts`; fixed locally and reran. Final `rtk npm run test -w packages/ts-shell -- src/orchestration/patchVerification/verify.test.ts` passed with 7 tests. `rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts` passed with 7 tests. `rtk npm run test -w packages/ts-shell -- src/orchestration/mutationExecution.test.ts` passed with 6 tests. `rtk npm run build -w packages/ts-shell` passed.
- Notes: Planning did not run real provider smoke, did not touch `D:\Test\home-sf`, did not implement checkpoint A, did not change production code, and did not edit `cli.tsx`, `SessionManager.ts`, or `runMvpIntegratedFlow.ts`. A was a read-only audit / plan update checkpoint; it did not run real provider smoke, did not touch `D:\Test\home-sf`, did not change production code or tests, and did not edit `cli.tsx`, `SessionManager.ts`, or `runMvpIntegratedFlow.ts`. B was a read-only reference comparison / plan update checkpoint; it did not run real provider smoke, did not touch `D:\Test\home-sf`, did not change production code or tests, and did not edit `cli.tsx`, `SessionManager.ts`, or `runMvpIntegratedFlow.ts`. C was a decision document / plan update checkpoint; it did not run real provider smoke, did not touch `D:\Test\home-sf`, did not change production code or tests, did not change current rejection behavior, and did not edit `cli.tsx`, `SessionManager.ts`, or `runMvpIntegratedFlow.ts`. D added isolated patch contract types and focused type tests only; it did not run real provider smoke, did not touch `D:\Test\home-sf`, did not implement parser/verification/application behavior, did not change current rejection behavior, and did not edit `cli.tsx`, `SessionManager.ts`, or `runMvpIntegratedFlow.ts`. E added isolated parser-only behavior and focused parser tests only; it did not run real provider smoke, did not touch `D:\Test\home-sf`, did not implement verification/application behavior, did not change current rejection behavior, and did not edit `cli.tsx`, `SessionManager.ts`, or `runMvpIntegratedFlow.ts`. F added isolated dry verification behavior and focused verifier tests only; it did not run real provider smoke, did not touch `D:\Test\home-sf`, did not implement application behavior, did not change current rejection behavior, and did not edit `cli.tsx`, `SessionManager.ts`, or `runMvpIntegratedFlow.ts`.
