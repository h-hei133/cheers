# Autonomous Development Gap Map

Status: active sprint evidence for SP034.

This map records the owner-domain diagnosis and transplant decisions for core autonomous development behavior. It is evidence and navigation only; completion still depends on product changes, diagnostics, live acceptance, and hard gates.

## Constraints Used

- Product behavior must land in real owner domains, not thin scripts, compatibility shims, or evaluation-only plumbing.
- Evidence/result remains the terminal truth owner. Provider output, tool execution, apply, repair attempt, artifact existence, and host output are not task success.
- Real provider configuration remains disabled by default and is consumed only by explicit opt-in runtime gates.
- Raw provider output, patch body, tokens, headers, secrets, private paths, and hidden reasoning stay redacted.

## Target Owners Inspected

| Capability area | Owner domains inspected | Current assessment |
|---|---|---|
| Context discovery and owner narrowing | `context/acquisition`, `context/discovery`, `context/selection` | Strong bounded scan, discovery handoff, missing facts, ambiguity state, raw-content exclusion, and no mutation authority. Weakness risk remains around ambiguous candidate escalation, but current diagnostics already preserve no-edit-authority facts. |
| Planning and action sequencing | `planning/runtime`, `planning/execution`, `planning/projection` | Planning surfaces next action and blocker reasons. No product change selected in this pass because stronger failures were found in verification, repair, and artifact validation. |
| Verification selection | `verification/selection`, `verification/execution`, `verification/result` | Weakness found: contradictory failure categories could be ignored when host evidence looked complete, allowing result input eligibility. |
| Repair retry and post-repair proof | `repair/loop`, `repair/iteration`, `repair/handoff`, `repair/flow` | Weakness found: a bounded repair action without post-repair validation evidence could default to `passed`. |
| Artifact validation | `artifacts/workflow`, `evidence/task`, `result/task` | Weakness found: an artifact receipt with no required output path could still project `validation-passed` from selected verification. |
| Continuation and resume | `session/continuation`, `session/recovery`, `runtime/loop/reentry` | Strong durable/staleness protections exist; selected as a diagnosed area, not a product-change target for this pass. |
| Changed-file accounting and proof integrity | `edit/result`, `evidence/task`, `result/task`, `runtime/loop` | Strong separation exists between changed files, verification, task proof, and result verdict. Validation must still include task model tests because shared owner changes affect live catalog proof. |

## Playbook And Mature Source Inputs

Playbook files read first:

- `/home/wang/projects/pi-docs-playbook/README.md`
- `/home/wang/projects/pi-docs-playbook/AGENTS.md`
- `/home/wang/projects/pi-docs-playbook/usage/task-reading-matrix.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/extensions.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/session-format.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/compaction.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/agent/docs/agent-harness.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/agent/docs/durable-harness.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/agent/docs/hooks.md`

Mature source areas inspected after target-owner and playbook inspection:

- `/home/wang/projects/pi/packages/agent/docs/agent-harness.md`
- `/home/wang/projects/pi/packages/agent/docs/durable-harness.md`
- Targeted search under `/home/wang/projects/pi/packages` for save-point, pending write, validation, tool result, modified/read file, and recovery semantics.

Relevant mature areas:

- Hook/event results are typed by event and reduced through the owning event semantics.
- Save points refresh future turn state after tool-result completion without mutating in-flight provider requests.
- Session and compaction summaries track file facts cumulatively.
- Recovery restarts only from durable boundaries; unfinished provider/tool work is marked or retried only under explicit safety conditions.
- Tool and hook results are observations or inputs until an owner result reduces them into proof.

## Introduction Decisions

| Capability | Decision level | Reason |
|---|---|---|
| Repair post-validation requirement | Structured port | The mature shape is a save-point/proof boundary: action is not completion until post-action validation exists. This fits `repair/loop` directly without copying source. |
| Verification contradiction handling | Structured port | The mature shape is typed result reduction that preserves blocker facts over optimistic status. This fits `verification/selection` directly. |
| Artifact output path validation | Structured port | The mature shape is durable file-fact accounting: required outputs must be explicit before validation can count. This fits `artifacts/workflow`. |
| Context ambiguity preservation | Behavior already present | Existing context handoff carries ambiguity, missing facts, omitted facts, and no-edit-authority claims. No additional transplant selected. |
| Continuation durability | Behavior already present | Existing continuation/recovery owners already preserve freshness and durable-state constraints used by current proof logic. |

No dependency use was selected because the needed behavior is small owner-domain policy, not a missing package. No isolated source adoption was selected because the target owners already have compact models and copying mature implementation units would add mismatch. Behavior-only alignment was not used for the three product changes because structured ports were available.

## Diagnostics

| Diagnostic | Weak phase | Core owner | Before result | After result |
|---|---|---|---|---|
| Repair action without post-repair validation evidence must not pass | Repair retry / proof integrity | `repair/loop` | Failed: `executeRepair` returned `postValidation: "passed"` and no blockers for one changed target without validation evidence. | Passed: returns `postValidation: "partial"` with `post-repair validation evidence missing`. |
| Contradictory verification failure category must override optimistic complete host evidence | Verification selection / result input | `verification/selection` | Failed: `selectVerification` returned `selected-passed`, proof text, and result input eligibility. | Passed: returns `selected-failed`, no proof, no evidence/result input eligibility. |
| Artifact receipt with missing output path must be blocked | Artifact validation / proof integrity | `artifacts/workflow` | Failed: receipt projected `validation-passed` with `outputPath` undefined. | Passed: receipt projects `output-missing` and `artifact output path missing`. |

Before command:

```bash
rtk npm run test -w packages/ts-shell -- repair/loop/model.test.ts verification/selection/model.test.ts artifacts/workflow/model.test.ts
```

Before result: failed 3 tests, one in each owner.

After command:

```bash
rtk npm run test -w packages/ts-shell -- repair/loop/model.test.ts verification/selection/model.test.ts artifacts/workflow/model.test.ts
```

After result: passed 3 files, 10 tests.

## Product Changes

- `repair/loop`: repair execution without explicit post-repair validation evidence now remains partial and blocked instead of defaulting to passed.
- `verification/selection`: verification failure categories now keep selection failed even when host evidence is otherwise complete.
- `artifacts/workflow`: artifact receipts now expose an `output-missing` validation state and blocker when no required output path exists.

## Remaining Acceptance Evidence To Collect

- Focused owner tests including evaluation task model tests.
- TypeScript build if type/import surfaces changed.
- Result truthfulness and anti-false-success gates because proof/result input eligibility changed.
- External live catalog after product changes, including primary success, fallback skipped on primary success, forced primary failure fallback through shared runtime, write-task completion, debug repair completion, manual correction count, changed-file accounting, task proof, verification, repair status, artifact validation, and result verdict.
- Diff checks, commit, and one push attempt after all hard gates pass.
