# Next Implementation Routes

Verdict: cleanup is needed, and it is safe to start implementation with the
first route below. Do not start by extracting the continuity truth surface or
presentation strings.

## Route 1: Store, Schema, Transcript Boundary

Goal:

Make `SessionManager` a compatibility facade over named store/schema/transcript
owners.

Move:

- Durable file IO, atomic writes, locks, retry behavior.
- Metadata and state snapshot codec/projection.
- Transcript append/read.
- Current-session registry.
- Session creation/load/delete/rename implementation.

Keep:

- Public `SessionManager` methods and type re-exports.
- Existing on-disk shape.
- Existing lifecycle defaults.

Do not combine with:

- Terminal truth changes.
- Continuity snapshot changes.
- Approval memory semantics.
- CLI presentation changes.

Why first:

It reduces import cycles and gives later recovery/replay/continuity modules
schema types that do not import `SessionManager.ts`.

## Route 2: Replay, Recovery Snapshot, Pending Lifecycle

Goal:

Move replay and recovery read-model construction into session recovery/replay
owners while preserving transcript truth.

Move:

- Recovery snapshot builder.
- Lifecycle index from transcript.
- Pending lifecycle reconciliation.
- Direct-resolution dedupe.
- Replay plan and runtime seed facade implementation.

Keep:

- `SessionManager.getRecoverySnapshot`.
- `SessionManager.getReplayPlan`.
- `SessionManager.buildRuntimeStateSeed`.
- `SessionManager.reconcilePendingLifecycle`.
- `SessionManager.appendQueryEvent`.

Do not combine with:

- Long-session continuity extraction.
- Approval memory extraction.
- Presentation route.

Why second:

Recovery/replay depends on stable store/transcript owners, and continuity
depends on stable recovery snapshots.

## Route 3: Continuity Snapshot And Legacy Compatibility

Goal:

Extract `buildContinuitySnapshot` and legacy working-memory parsing into
named continuation/result/evidence owners without changing the snapshot shape.

Move:

- Main continuity snapshot builder.
- Legacy summary-string memory parsing.
- Legacy permission rebase.
- Seed influence extraction.
- Unresolved item projection.
- Mutation/read/repair/provenance continuity sub-projections.
- Terminal-source truth adapter.

Keep:

- `SessionManager.buildContinuitySnapshot`.
- Prompt continuity facade methods.
- `SessionContinuitySnapshot` compatibility export.
- Old session compatibility.

Do not combine with:

- Deleting legacy parsing.
- Approval authority/policy changes.
- CLI formatting changes.

Why third:

This is the largest monolith region, but it is truth-sensitive. It should only
move after store and recovery read models are stable.

## Route 4: Approval Memory And Request-Scope Facts

Goal:

Make approval memory and request-scope facts owned by `session/approval`, while
preserving the rule that approval memory is evidence, not authority.

Move:

- Approval audit persistence.
- Approval history retention.
- Permission request and request-scope continuity facts.
- Approval provenance continuity projection.

Keep:

- `recordApprovalAuditDecision` facade.
- Current history limit behavior.
- Current cache-key and project-root normalization semantics.

Do not combine with:

- Write authorization policy changes.
- Command execution approval changes.
- Provider behavior.

Why fourth:

Approval facts are intertwined with continuity, but they must not be mistaken
for policy authority. Extracting after continuity reduces risk.

## Route 5: Recovery Selection And Presentation Surface

Goal:

Split recovery selection from CLI-facing session/reentry presentation.

Move:

- Reentry summary projection.
- Project context aggregation.
- Recovery candidate selection.
- Recovery trust-boundary block selection.
- Session warning surface for unreadable directories.

Keep:

- Facade methods used by CLI and shell recovery.
- Existing rendered text unless this route explicitly owns string updates.

Do not combine with:

- Store schema changes.
- Terminal truth changes.
- Continuity extraction.

Why fifth:

This route is lower risk after the recovery and continuity data it consumes is
already owned elsewhere.

## Route 6: Compatibility Cleanup

Goal:

Remove stale facade exports or legacy parsing only when usage and fixture
evidence prove removal is safe.

Move/delete:

- Unused type re-exports.
- Unused compatibility wrappers.
- Legacy parsing proven unnecessary.

Keep:

- Any public method still used by CLI/runtime/tests.
- Any compatibility path needed by old session records.

Do not combine with:

- First-time extraction of behavior.
- Schema migration.
- Presentation changes.

Why last:

Deletion is only safe after compatibility facades and owner modules have
survived focused validation.

## Recommended Start

Start with Route 1. It has the clearest boundary, reduces future import-cycle
risk, and does not require changing result truth, evidence truth, approval
policy, or CLI presentation.

## Move To Next File?

Do not move to another file before at least Route 1 is considered, because
`SessionManager.ts` still anchors schema and type imports for several session
modules. If implementation is deferred, the next audit can proceed, but this
file should remain on the architecture debt register as a partial monolith.
