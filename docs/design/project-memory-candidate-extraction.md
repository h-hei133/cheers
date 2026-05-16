# Project Memory Candidate Extraction

Route 80 starts the memory phase without implementing memory storage. The
output is a typed, non-persistent candidate list derived from Compact v2,
context projection, route handoff, edit closeout, validation evidence, and
explicit user preference signals.

This document records design and reference-scan evidence only. It does not
authorize automatic memory writes, cross-session loading, startup cache,
sidebar UI, provider/model calls, MCP changes, package-script changes,
SessionManager schema changes, edit runtime changes, automatic recovery, or
atomic rollback.

## Reference Scan

Budget used: 12 files total.

Files inspected:

- ClaudeCode:
  `/home/wang/projects/source-claudecode/memdir/memoryTypes.ts`
- ClaudeCode:
  `/home/wang/projects/source-claudecode/memdir/memoryScan.ts`
- ClaudeCode:
  `/home/wang/projects/source-claudecode/services/compact/sessionMemoryCompact.ts`
- ClaudeCode:
  `/home/wang/projects/source-claudecode/services/teamMemorySync/secretScanner.ts`
- opencode:
  `/home/wang/projects/opencode/packages/opencode/src/session/summary.ts`
- opencode:
  `/home/wang/projects/opencode/packages/opencode/src/session/compaction.ts`
- opencode:
  `/home/wang/projects/opencode/packages/opencode/src/project/instance-context.ts`
- opencode:
  `/home/wang/projects/opencode/packages/opencode/src/util/local-context.ts`
- gemini-cli:
  `/home/wang/projects/gemini-cli/docs/tools/memory.md`
- gemini-cli:
  `/home/wang/projects/gemini-cli/packages/core/src/context/memoryContextManager.ts`
- gemini-cli:
  `/home/wang/projects/gemini-cli/packages/core/src/context/toolOutputMaskingService.ts`
- gemini-cli:
  `/home/wang/projects/gemini-cli/packages/core/src/services/memoryService.ts`

Findings:

1. References retain facts beyond a single turn when the fact is not cheaply
   derivable from current code or git state, such as user preferences, project
   intent, external references, durable constraints, session summaries, compact
   decisions, and high-level change summaries.
2. References separate scopes. ClaudeCode distinguishes user, feedback,
   project, and reference memory; opencode keeps session summaries and instance
   context separate from project boundary checks; gemini-cli separates global,
   extension, project, and user-project memory.
3. Unsafe memory includes raw file bodies, raw recovery material, tool-output
   blobs, provider credentials, auth headers, API keys, hidden reasoning, and
   transient command output. ClaudeCode has an explicit team-memory secret
   scanner; gemini-cli masks large tool output instead of keeping it directly in
   context.
4. Compact/session summaries should preserve decisions, constraints, progress,
   blockers, next steps, and relevant files, but they should not become memory
   automatically. They are evidence for review.
5. Local implication: this project should first produce candidate facts with
   source, evidence, retention class, confidence, safety, reason, and redaction
   metadata. Persistence and review UX belong to a later route.

## Current Baseline

Current local inputs already exist:

- Compact v2 packet: `compactContinuityPacket.ts`
- Context projection: `contextStateProjection.ts`
- Route handoff builder: `routeContinuityHandoff.ts`
- Compact command runner and session surface:
  `compactCommandRunner.ts`, `compactSessionSurface.ts`
- Compact quality/merge/budget hardening:
  `compactContinuityQuality.ts`, `compactInjectionMergePolicy.ts`,
  `compactInjectedContextBudget.ts`

The baseline already labels `context.memoryCandidates`, redacts raw content and
secrets, carries compact-safe validation summaries, and keeps `/compact`
preview-only. Route 80 converts that evidence into candidate facts without
adding storage.

## Candidate Taxonomy

Candidate kinds:

- `project-fact`
- `project-structure`
- `capability-state`
- `route-decision`
- `user-preference-candidate`
- `validation-pattern`
- `restore/recovery-boundary`
- `blocked-by-design-decision`
- `transient-session-fact`
- `rejected`

Retention classes:

- `project-scoped-candidate`: possible future project memory after review
- `session-scoped-only`: useful for current handoff, not durable memory yet
- `user-memory-candidate`: explicit user preference requiring review
- `never-remember`: rejected unsafe or transient material

Safety classes:

- `safe`
- `needs-review`
- `unsafe`

Confidence classes:

- `high`
- `medium`
- `low`

Sources:

- `compact-packet`
- `context-projection`
- `route-handoff`
- `validation-evidence`
- `user-stated-preference`
- `system-derived`

## Extraction Sources

Route 80 extracts candidates from:

- Compact v2 packet route, project, edit capability, recovery, validation, and
  redaction fields.
- Context projection `memoryCandidates`.
- Route handoff facts supplied by a caller.
- Validation evidence, including focused tests and verifier summaries.
- Edit closeout facts, including blocked-by-design decisions.
- Explicit user preference facts only when the caller marks them explicit.
- Unsafe facts supplied for rejection and redaction evidence.

Candidate extraction is pure and synchronous. It performs no file I/O, no
provider/model calls, no storage writes, and no SessionManager schema changes.

## Safety And Redaction Policy

Candidates must not contain or promote:

- raw file content
- raw recovery content
- raw content blobs
- full command output
- secrets
- provider credentials
- provider configuration
- auth headers
- hidden reasoning
- ambiguous inferred user preferences
- failed speculative assumptions
- one-off route residue that has not been reviewed as durable

Unsafe input becomes a `rejected` candidate with `never-remember` retention and
redaction evidence. A rejected candidate may explain the unsafe category, but it
must not retain the unsafe value.

## Project Versus Session Versus User Preference

Project-scoped candidates are facts that might help future work in this
repository, such as stable route discipline, capability boundaries, validation
patterns, and blocked-by-design decisions.

Session-scoped facts preserve current route progress, next action, and compact
handoff state. These are useful for continuity but should decay unless later
review proves they are durable.

User-preference candidates require an explicit user statement. Ambiguous user
behavior, a single accepted answer, or inferred communication style is rejected
as `never-remember` until the user states it directly.

## Quality Model

`projectMemoryCandidateQuality.ts` checks that:

- every candidate has source and evidence
- candidates do not leak raw content, secrets, provider credentials, or hidden
  reasoning
- transient facts are session-only or rejected
- user preference candidates come from explicit user evidence and need review
- blocked-by-design decisions include a reason
- capability-state facts include route, compact, edit, closeout, manifest, or
  context evidence
- unsafe candidates are rejected and marked `never-remember`

Quality output is `pass`, `warn`, or `reject` with warnings, blockers, and
evidence. Quality checks do not write memory.

## Non-Persistence Guarantee

Route 80 candidate extraction and rendering are preview-only. The code does not
create a memory directory, update a memory file, read cross-session memory, load
startup cache, add sidebar UI, or write project/user memory.

The session-facing surface says "Memory written: no" and "Persistence: none" so
users can distinguish candidates from stored memories.

## Future Memory-Store Boundary

A future route may add review/approval UX or storage only after candidate
quality is stable. That future route must separately define:

- review authority
- persistence destination
- update/delete semantics
- stale-memory handling
- startup loading rules
- user preference privacy boundaries
- secret scanning and audit behavior

Route 80 intentionally stops before those decisions.

## Next-Route Decision Criteria

Choose Route 81 as memory candidate review / approval UX if candidates are
useful but need human selection before storage.

Choose a memory store prototype only after review boundaries are explicit and
candidate quality can reject unsafe or ambiguous facts reliably.

## Route 81 Note

Route 81 adds session-scoped review and approval UX on top of these candidates:

- `projectMemoryReviewState.ts`
- `projectMemoryReviewCommandContract.ts`
- `projectMemoryReviewCommandRunner.ts`
- `projectMemoryReviewSurface.ts`
- `/memory` local command registration

Approvals and rejections remain session-scoped only. They do not persist memory,
load cross-session memory, add retrieval/wake-up/recall, add a startup cache,
add sidebar UI, change provider/MCP behavior, change SessionManager schema, or
change edit runtime behavior.

## Route 82 Note

Route 82 adds the first explicit local store prototype for candidates that have
passed Route 81 review. Candidate extraction remains preview-only: extraction
does not write memory, choose a store path, load cross-session records, or
enable retrieval. The save path consumes candidates plus session review state
and writes only approved safe summaries to an explicitly supplied local store.

## Route 83 Note

Route 83 reads saved records for deterministic recall and wake-up preview.
Candidate extraction still does not search memory, load stored records, or
inject memory into future turns. Retrieval operates only on records that were
explicitly saved after review.
