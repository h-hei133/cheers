# Journal boundary readiness

Route 56 records the current journal boundary after Route 55 attached
`routeScopedEditJournal` metadata to mixed, multi-file, and single-file failure
result consumers. The journal is still result metadata only. It is not durable
state, not write authority, and not recovery or rollback authority.

## External comparison

Bounded scan count:

- ClaudeCode: 4 files inspected.
- opencode: 6 files inspected.
- gemini-cli: 5 files inspected.
- Total external files inspected: 15.

ClaudeCode files:

- `/home/wang/projects/source-claudecode/tools/FileEditTool/FileEditTool.ts`
- `/home/wang/projects/source-claudecode/tools/FileWriteTool/FileWriteTool.ts`
- `/home/wang/projects/source-claudecode/utils/fileHistory.ts`
- `/home/wang/projects/source-claudecode/cli/print.ts`

ClaudeCode separates edit permission, stale-read checks, and writer execution
from file-history rewind. Edit/write tools validate permission and staleness
before writing. File-history rewind is exposed only when file checkpointing is
enabled and a restorable checkpoint exists for the message.

opencode files:

- `/home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts`
- `/home/wang/projects/opencode/packages/opencode/src/tool/edit.ts`
- `/home/wang/projects/opencode/packages/opencode/src/tool/write.ts`
- `/home/wang/projects/opencode/packages/opencode/src/session/processor.ts`
- `/home/wang/projects/opencode/packages/opencode/src/session/revert.ts`
- `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`

opencode treats edit/apply_patch metadata as permission and result surface data,
while session revert depends on the snapshot service. The processor captures a
snapshot around assistant execution, patch parts record file changes, and revert
restores or reapplies through snapshot authority rather than trusting result
metadata alone.

gemini-cli files:

- `/home/wang/projects/gemini-cli/packages/core/src/tools/edit.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/tools/write-file.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/services/gitService.ts`
- `/home/wang/projects/gemini-cli/packages/cli/src/ui/commands/restoreCommand.ts`
- `/home/wang/projects/gemini-cli/packages/cli/src/ui/commands/rewindCommand.tsx`

gemini-cli edit/write tools produce diff and confirmation surfaces, while
checkpoint restore uses a shadow git repository and explicit restore commands.
Rewind can choose conversation-only rewind or file revert, but file revert is a
separate action tied to recorded checkpoint data.

## Useful patterns

- Recovery and rollback claims should be emitted only when there is a durable
  snapshot or file-history authority that can execute the operation.
- Diff, patch, and changed-file metadata are useful diagnostics, but they are
  not enough to imply rollback or recovery capability.
- Broad edit paths should remain gated by explicit permission and workspace
  authority; result metadata should not bypass those gates.
- Rewind/restore UX should distinguish conversation/history changes from file
  system restoration.

## Non-transferable patterns

- ClaudeCode file-history rewind is tied to its app state and session storage;
  importing that shape would add a new persistence layer.
- opencode snapshot/revert relies on its snapshot service and message patch
  parts; copying it would change this project's session and storage model.
- gemini-cli shadow-git checkpointing is a durable restore backend; Route 56 is
  intentionally not adding snapshot storage or restore execution.
- Fuzzy or corrective edit application in reference tools is outside this
  route; current journal facts must not imply a broader apply_patch engine.

## Implications for this project

The reference implementations support the current boundary: journal data can
describe planned, changed, failed, recovery-candidate, and unrecovered files,
but it must not claim rollback, recovery execution, atomicity, persistence, or
writer authority. The next edit-capability route should first choose whether it
is adding durable state, adding more metadata projections, or auditing broader
edit capability. Those are separate decisions.

## Current boundary

The current journal is:

- route-scoped result metadata.
- non-durable.
- not recovery authority.
- not rollback authority.
- not writer authority.
- not permission authority.
- not a write-ordering mechanism.
- not an atomicity guarantee.

The journal does not decide whether writes run, does not invoke writers, and
does not change write ordering. `recoveryCandidateFiles` are planning and
diagnostic facts only. `unrecoveredFiles` are failure facts only.
`recoveryExecuted` must remain `false` until a real recovery executor exists.
`rollbackAtomicityClaim` must remain `false` until real rollback or snapshot
authority exists.

Centralized metadata-only facts live in
`packages/ts-shell/src/orchestration/patchResult/journalMetadataBoundary.ts`:

- `writeCapability: "metadata-only"`
- `rollbackAtomicityClaim: false`
- `recoveryExecuted: false` on the failure surface
- evidence strings that state no runtime writer and no recovery execution

## Next-route readiness

### Durable journal storage prototype

Minimum missing preconditions: storage ownership, schema migration policy,
session lifecycle integration, residue cleanup rules, and recovery trust
boundary.

Safety as next route: not the safest immediate next route. It would cross into
durability and session lifecycle, which Route 56 deliberately avoided.

Expected validation: session durability tests, result-contract tests, build,
residue checks, and focused migration/recovery tests.

### Recovery plan projection without execution

Minimum missing preconditions: a recovery-plan result shape that stays
metadata-only, clear naming that cannot be mistaken for execution, and tests
proving `recoveryExecuted` remains `false`.

Safety as next route: safe if strictly projection-only. It builds on the current
journal facts without adding writer or persistence authority.

Expected validation: focused patchResult projection tests, result-contract, and
package build.

### Rollback/snapshot design only

Minimum missing preconditions: explicit ownership decision for durable snapshot
state, restore trust boundary, and session interaction design.

Safety as next route: safe only as documentation/design. Runtime implementation
would be premature without storage and lifecycle decisions.

Expected validation: docs diff check for design-only; no runtime validation
unless code contracts are introduced.

### 3+ mixed-write readiness audit

Minimum missing preconditions: evidence that remaining writer and result
surfaces preserve current partial-failure semantics under larger mixed
operation sets.

Safety as next route: plausible as a read-only or test-first audit, but not as
capability expansion. It must not increase write support without a separate
execution plan.

Expected validation: focused mixed-route tests, result-contract, build, and the
existing real-user mixed-operation evidence gate only if consumer behavior is
materially changed.

### Broad arbitrary apply_patch readiness audit

Minimum missing preconditions: parser limits, permission model, stale-read
policy, workspace authority, result semantics, and failure attribution for
broad patch shapes.

Safety as next route: not safe as implementation. It is only safe as a bounded
readiness audit because broad apply_patch would touch core writer capability.

Expected validation: audit-specific tests and rejection regressions; no default
gate or writer expansion.

## Recommendation

Recommended next route: recovery plan projection without execution.

This is the narrowest continuation from the current code and the external
comparison. It can make recovery intent more explicit while preserving the
metadata-only boundary, avoiding durable storage, and keeping rollback,
snapshot, provider, session, CLI, MCP, and writer behavior unchanged.
