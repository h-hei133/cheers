# Compact v2 Quality and Merge Hardening

Status: Route 79 implemented candidate.
Date: 2026-05-16

## Scope

Route 79 hardens repeated Compact v2 use after Route 78. It keeps `/compact`
simple for users while adding pure in-memory policy layers around future-turn
injection:

- merge policy for repeated checkpoints
- compact continuity quality checks
- injected context budget and dedupe
- planner integration that blocks unsafe or stale injection before state is
  consumed

This route does not add memory storage, persistent storage, startup cache,
sidebar UI, provider/MCP behavior, package scripts, default gates,
SessionManager schema changes, edit runtime changes, automatic recovery,
atomic rollback, raw recovery content, raw original content, secrets, provider
credentials, or hidden reasoning.

## Bounded Reference Scan

Files inspected: 8 directly relevant files.

- ClaudeCode:
  `/home/wang/projects/source-claudecode/services/compact/compact.ts`,
  `/home/wang/projects/source-claudecode/services/compact/prompt.ts`,
  `/home/wang/projects/source-claudecode/query.ts`,
  `/home/wang/projects/source-claudecode/utils/messages.ts`
- opencode:
  `/home/wang/projects/opencode/packages/opencode/src/session/compaction.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/session/message-v2.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/session/projectors.ts`
- gemini-cli:
  `/home/wang/projects/gemini-cli/packages/core/src/context/chatCompressionService.ts`

Findings:

1. ClaudeCode prevents repeated compact bloat by building a post-compact
   message set and scanning from the latest compact boundary. It strips
   drafting analysis from compact summaries and treats post-compact attachments
   separately from the visible compact command.
2. opencode anchors new summaries to the previous completed summary, records a
   `tail_start_id`, and filters compacted messages through typed compaction
   parts instead of repeatedly appending every prior summary.
3. gemini-cli compresses into `newHistory`, preserves a recent suffix, detects
   existing state snapshots, asks the summarizer to integrate still-relevant
   previous snapshot facts, and runs a second self-check pass for missing
   technical details.
4. References preserve recent tool/edit facts through retained tails,
   structured parts, snapshots, or truncation references rather than raw
   summary recursion.
5. Before a persistent memory system exists locally, the safest policy is:
   latest pending checkpoint wins, stable survivor labels may carry forward,
   stale checkpoints are rejected, raw compact markdown is never nested, and
   quality/budget checks run before the injection state is consumed.

## Current Route 78 Behavior

Route 78 already provides:

- in-memory live checkpoint store
- in-memory injection state
- future-turn adapter
- model-facing injected context formatter
- planner that injects a pending checkpoint once
- `ShellSessionRuntime.executePrompt` hook that preserves the original user
  prompt barrier and only changes the model-facing prompt

Route 79 keeps that path and adds guards around repeated compact use.

## Repeated Compact Risk Map

Risks addressed:

- second `/compact` before a normal turn should supersede the first
- new `/compact` after consumption should create a fresh pending checkpoint
- older route/mutation facts must not override newer facts
- compact handoff markdown must not be recursively embedded in future compact
  context
- overlong injected context should preserve critical safety facts while
  dropping low-value repetition
- missing or unsafe continuity facts should warn or block before injection

## Merge Policy

`compactInjectionMergePolicy.ts` implements the local merge policy:

- latest checkpoint wins for conflicting route, mutation, recovery, and
  validation facts
- previous stable compact survivor labels may carry forward
- superseded checkpoint ids are recorded in in-memory injection state
- stale current checkpoints are blocked if a newer previous checkpoint is
  provided
- recursive compact markdown and unsafe-looking raw/secret markers are removed
  from carried survivor facts
- no provider/model calls, persistence, or memory writes occur

The policy does not merge raw packet bodies, rendered markdown, raw recovery
content, or full command output.

## Quality Check Policy

`compactContinuityQuality.ts` reports a checklist with `pass`, `warn`, or
`fail` status. It checks:

- task goal and next action
- edit capability closeout and blocked-by-design facts
- mutation and recovery facts when expected
- validation evidence
- redaction/exclusion evidence
- raw content and secret leakage
- automatic recovery and atomic rollback claims
- estimated injected context size

Warnings do not block injection when safety checks pass. Failures block
injection and mark the checkpoint invalid before it can be consumed.

## Budget and Dedupe Policy

`compactInjectedContextBudget.ts` dedupes repeated lines, caps long nested
lists, and trims over-budget context while preserving:

- task/route
- next action
- constraints
- blocked-by-design facts
- restore explicit-only facts
- validation status
- automatic recovery and atomic rollback non-claims
- raw-content/secret exclusion statement

Budgeting must never trim the injected context into an unsupported capability
claim.

## Planner Integration

`compactFutureTurnInjection.ts` now performs this order:

1. verify latest checkpoint exists and is pending
2. adapt checkpoint into candidate context
3. run merge policy
4. format injected context
5. run quality checks
6. apply injected context budget/dedupe
7. re-check unsafe raw/secret markers
8. mark injected/consumed only after successful budgeted context is ready

If merge or quality fails, the planner returns `shouldInject: false`, surfaces
warnings, and marks the injection state invalid when a mark-invalid callback is
available.

## Long-Session Coherence Model

Until memory exists, Route 79 intentionally stays session-scoped and
checkpoint-scoped. It does not try to rank durable memories or persist compact
history. Repeated compact behavior is coherent because only the latest pending
checkpoint can inject, previous compact survivor labels are deduped, and a
consumed checkpoint cannot inject again.

## Route 80 Boundary

Route 80 owns project memory candidate extraction after this quality/merge
layer. It adds pure candidate model, extractor, quality checks, and a
session-facing preview summary. It does not add memory storage, automatic
writes, cross-session loading, startup cache, sidebar UI, provider/MCP changes,
SessionManager schema changes, edit runtime changes, automatic recovery, or
atomic rollback.

Route 81 should own review/approval UX before any persistent memory store.
Ranking, persistence, user controls, startup loading, and long-lived project
facts remain separate decisions.

## Route 86 Note

Route 86 applies the same quality/merge pattern to explicit project memory
future-turn injection. Compact v2 remains first in runtime injection order and
keeps its own checkpoint state, merge policy, quality checks, and budget. Project
memory then runs separate memory-specific stale-record filtering, conflict
detection, quality checks, and budget/dedupe before the original user request.
