# Memory Candidate Review And Approval UX

Route 81 builds session-scoped review and approval UX for Route 80 project
memory candidates before any persistent memory store exists.

The route adds review state, a `/memory` command contract, a command runner, a
surface renderer, and a small slash-command registration. Approvals and
rejections are session-scoped decisions only. They do not write memory, delete
memory, load cross-session memory, retrieve memories, wake up context, call a
provider/model, add MCP tools, or create a backend.

## Reference Scan

Budget used: 16 files total.

MemPalace files inspected:

- `/home/wang/projects/mempalace/website/concepts/memory-stack.md`
- `/home/wang/projects/mempalace/mempalace/layers.py`
- `/home/wang/projects/mempalace/mempalace/miner.py`
- `/home/wang/projects/mempalace/mempalace/sweeper.py`
- `/home/wang/projects/mempalace/mempalace/searcher.py`
- `/home/wang/projects/mempalace/mempalace/backends/base.py`
- `/home/wang/projects/mempalace/mempalace/mcp_server.py`
- `/home/wang/projects/mempalace/mempalace/instructions/mine.md`

Coding-agent reference files inspected:

- `/home/wang/projects/source-claudecode/commands/memory/memory.tsx`
- `/home/wang/projects/source-claudecode/commands/memory/index.ts`
- `/home/wang/projects/opencode/packages/opencode/src/command/index.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/commands/memory.ts`

Route 80 already scanned additional memory/context references from ClaudeCode,
opencode, and gemini-cli. Route 81 reused those conclusions and added command
surface checks.

## What To Borrow From MemPalace

Concepts worth borrowing:

- Local-first memory should remain the default direction for any future store.
- Memory should be organized by scope and loaded progressively, not dumped into
  every prompt.
- Evidence should remain attached to candidate facts.
- Storage and retrieval should have an explicit backend boundary.
- Retrieval/wake-up/deep search should be separate operations with separate
  budget and safety rules.
- Mining/sweeping should be idempotent and auditable if a later route adds
  ingestion.

Route 81 adapts these ideas as review vocabulary only: candidate, decision,
evidence, session scope, and deferred store boundary.

## What Not To Copy

Route 81 does not copy the palace metaphor into user output. It does not add
wings, rooms, drawers, vector search, ChromaDB, MemPalace backend interfaces,
MCP memory tools, wake-up, recall, search, mining, sweeping, or agent diary.

Those belong to future routes only if the project first defines review-before-
write semantics and a local store boundary.

## Route 80 Baseline

Route 80 provides:

- `projectMemoryCandidate.ts`
- `projectMemoryCandidateExtractor.ts`
- `projectMemoryCandidateQuality.ts`
- `projectMemoryCandidateSurface.ts`
- `/compact` candidate preview with "Memory written: no"

Route 81 consumes those candidates and adds session decisions around them.

## Review UX Model

Default `/memory` is non-mutating:

- It lists current candidates from the latest session `/compact` checkpoint.
- It shows pending, needs-review, approved, rejected, unsafe, project-scoped,
  and session-only counts.
- It states that memory was not written and persistence is not enabled.
- It suggests simple next actions.

If no candidates exist, `/memory` tells the user to run `/compact` first.

## Approval UX Model

Approval is explicit and session-scoped:

- `/memory approve <candidate-id>` marks one candidate approved in memory review
  state.
- `/memory approve --all-safe` approves only safe pending candidates.
- Approval never writes persistent memory.
- Unsafe candidates cannot be approved by default.
- User-preference candidates start as `needs-review`; explicit approval is a
  session decision only and still does not persist user memory.

## Rejection UX Model

Rejection is explicit and session-scoped:

- `/memory reject <candidate-id>` marks one candidate rejected.
- `/memory reject --unsafe` rejects unsafe candidates for this session.
- Rejection never deletes persistent memory because no memory store exists.

## Session-Scoped Decision Model

`projectMemoryReviewState.ts` stores in-memory session review state:

- `reviewSessionId`
- latest candidates
- decisions
- approved candidates
- rejected candidates
- unsafe candidates
- superseded candidates
- `persistence: "none"`
- `providerCall: "none"`

Candidate updates can supersede older session candidates while preserving an
auditable session entry. The state has deterministic clock injection for tests.

## Candidate Categories

The review surface preserves Route 80 categories:

- project-scoped candidates
- session-only facts
- user-preference candidates needing explicit review
- unsafe or rejected-by-policy candidates
- redactions

Review does not reclassify raw unsafe material into memory. It only records the
safe candidate summary and redaction metadata from Route 80.

## Safety And Redaction Guarantees

Review state and output must not contain:

- raw file content
- raw recovery content
- raw content blobs
- secrets
- provider credentials
- provider config
- auth headers
- hidden reasoning

The output states:

- "Memory written: no"
- "Persistence: not enabled"
- "Retrieval / wake-up / recall: not enabled"

## Why Persistence Is Deferred

Review decisions are not enough to define durable memory. A store route must
still decide storage location, file format, review-before-write enforcement,
update/delete semantics, stale-memory handling, secret scanning, user preference
privacy, and validation gates.

## Future Store Boundary

A future memory store route may add a non-default local store prototype only if
it preserves:

- explicit review before write
- no automatic writes
- no provider credential exposure
- user-visible storage destination
- deletion/update semantics
- migration-free failure behavior

## Future Retrieval / Wake-Up / Recall Boundary

Retrieval, wake-up, recall, search, startup loading, vector DB, backend
abstraction, and MCP memory tools remain deferred. They should not be added
until a store exists and has a review/write contract.

## Next-Route Decision Criteria

Route 82 should be memory review command polish if `/memory` needs usability
work.

Route 82 should be a project memory store prototype only if review state,
approval/rejection behavior, and safety boundaries are stable.

## Route 82 Note

Route 82 adds a non-default explicit local store prototype after review:

- `/memory` remains the non-persistent review/list path.
- `/memory approve ...` and `/memory reject ...` remain session-scoped review
  decisions.
- `/memory save <candidate-id>` and `/memory save approved` can persist only
  approved safe candidates when an explicit local store is supplied.
- `/memory status` reports store status without loading memory into context.

The save path preserves review-before-write, blocks pending/rejected/unsafe/raw
or secret-looking candidates, and does not add retrieval, wake-up, recall,
startup cache, sidebar UI, provider/MCP behavior, SessionManager schema
changes, or edit runtime changes.
