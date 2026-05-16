# Memory Injection Quality and Merge Hardening

Status: Route 86 implemented candidate.
Date: 2026-05-16

## Scope

Route 86 hardens explicit project memory future-turn injection after Route 85.
It keeps `/memory wake` and `/memory recall <query>` preview-only, and keeps
`/memory use` / `/memory use <query>` as the only staging commands for one
next normal model turn.

This route adds pure TypeScript control-plane policy around the existing
session-scoped in-memory injection state:

- merge policy for repeated and superseded `/memory use`
- quality checks for injected memory context
- budget and dedupe for injected memory context
- conservative conflict detection between selected records
- stale invalidated/deleted record filtering immediately before injection
- Compact v2 coexistence checks through the existing runtime order

It does not add automatic memory injection, startup auto-load, cross-session
auto-loading, vector DB, ChromaDB, embeddings, semantic LLM rerank,
provider/model calls, MCP memory tools, sidebar UI, startup cache, package
scripts, default gates, SessionManager schema changes, edit runtime changes,
automatic recovery, or atomic rollback.

## Bounded Reference Scan

Files inspected: 9 directly relevant files.

MemPalace:

- `/home/wang/projects/mempalace/README.md`
- `/home/wang/projects/mempalace/website/concepts/memory-stack.md`
- `/home/wang/projects/mempalace/mempalace/layers.py`
- `/home/wang/projects/mempalace/mempalace/searcher.py`
- `/home/wang/projects/mempalace/tests/test_dedup.py`

Coding-agent references:

- `/home/wang/projects/source-claudecode/services/SessionMemory/prompts.ts`
- `/home/wang/projects/source-claudecode/services/compact/sessionMemoryCompact.ts`
- `/home/wang/projects/source-claudecode/memdir/memoryTypes.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/agents/local-executor.test.ts`

Findings:

1. MemPalace bounds wake-up by separating L0 identity from L1 essential story.
   L1 takes top moments, groups by room, and caps output length instead of
   loading the full corpus.
2. MemPalace recall/search is layered: L2 is bounded wing/room filtered
   recall, and L3 is explicit deep search. That supports this project's
   distinction between `/memory use` wake packs and `/memory use <query>`
   recall packs.
3. MemPalace ranking combines scoped metadata filters, direct drawer search,
   closet ranking signals, BM25/vector hybrid ranking, candidate union, and
   dedupe. Route 86 uses only deterministic local ranking already present in
   this repo; vector/ChromaDB/LLM rerank stay deferred.
4. MemPalace dedupe tests keep duplicate drawer handling explicit and
   conservative. Route 86 mirrors that at prompt-context level by deduping
   selected memory records by id and repeated rendered facts.
5. ClaudeCode session-memory compaction enforces total and per-section budgets,
   truncates oversized sections before compact insertion, and reports
   truncation. Route 86 applies the same principle to injected memory context.
6. ClaudeCode memory guidance treats recalled memory as potentially stale and
   says current observed state wins. Route 86 re-reads the memory store at
   injection time and filters invalidated/deleted records before consuming the
   pending injection.
7. Gemini CLI tests show memory/context can be injected into model-facing input
   while remaining conditional on runtime configuration. Route 86 keeps local
   memory injection explicit and one-shot.

## Route 85 Baseline

Route 85 provides:

- `/memory use` stages wake-up context for one next normal turn.
- `/memory use <query>` stages deterministic recall context for one next
  normal turn.
- memory injection state is session-scoped and in-memory only.
- the planner re-runs wake-up or retrieval before injection.
- Compact v2 context injects first, project memory context injects second.
- original user prompt persistence stores the original prompt, not injected
  memory.

## Risk Map

Route 86 addresses these risks:

- second `/memory use` before a normal turn must supersede the first pending
  injection
- consumed injection must not repeat, while a later `/memory use` can stage a
  fresh pending injection
- records invalidated or deleted after staging must not enter injected context
- wake and recall selections may contain duplicate records or repeated facts
- long memory lists may crowd out safety caveats
- saved records may clearly conflict on the same structured fact
- memory text must not claim unsupported automatic loading, startup loading, or
  provider retrieval
- Compact v2 and memory injection must preserve deterministic order

## Merge Policy

`projectMemoryInjectionMergePolicy.ts` implements the local merge policy:

- latest explicit `/memory use` wins for pending injection state
- superseded pending injection ids remain warning evidence
- selected records are deduped by record id
- pending record ids are rechecked against the store immediately before
  injection
- invalidated/deleted pending records are filtered and surfaced as warnings
- newly matching records since staging are surfaced as warnings
- clear conflict blockers stop injection before state is consumed

The policy does not merge raw record content, raw recovery content, provider
material, hidden reasoning, or previous injected context blocks.

## Quality Policy

`projectMemoryInjectionQuality.ts` reports `pass`, `warn`, or `fail`.

It checks:

- selected records exist
- selected records are safe to inject
- invalidated/deleted records are excluded
- evidence references are present
- injection mode and next action are present
- no raw content, secret, or hidden-reasoning leak
- no automatic injection, startup auto-load, or provider retrieval claim
- conflict status
- estimated injected context size

Warnings may still inject when safety checks pass. Failures mark the pending
injection invalid and do not consume it as a successful injection.

## Budget And Dedupe Policy

`projectMemoryInjectedContextBudget.ts` dedupes repeated lines, caps long
lists, and trims over-budget context while preserving:

- source command
- injection mode and query
- selected record ids
- project facts
- user preference facts
- capability facts
- route decisions
- validation patterns
- blocked-by-design decisions
- evidence references
- safety caveats

Budgeting must never trim away the caveats that automatic memory injection,
startup auto-load, provider retrieval, automatic recovery, atomic rollback, and
write authorization are not granted by injected memory context.

## Conflict And Stale Memory Policy

`projectMemoryConflictDetection.ts` stays conservative:

- structured facts with the same candidate kind, subject, and predicate but
  different objects are clear blockers
- route/kind records with different status words are warnings, not blockers
- vague text is not treated as a conflict
- no provider/model call or fuzzy LLM reasoning is used

Stale lifecycle handling is separate from semantic conflict detection. The
planner resolves each staged record id via the store just before injection, so
invalidated records and deleted records are filtered or block when no active
records remain.

## Compact V2 Coexistence

`ShellSessionRuntime` preserves the existing order:

1. Compact v2 continuity context
2. Project memory context
3. Original user request

Route 86 does not change Compact v2 state, packet shape, or SessionManager
persistence. Memory quality/budget checks run only on the project memory
context after Compact v2 has already planned its own injection.

## Deferred Boundaries

Still deferred:

- startup warm context cache
- sidebar state model
- vector DB / ChromaDB / embeddings
- semantic LLM rerank
- provider/model retrieval
- MCP memory tools
- automatic memory injection
- cross-session auto-loading
- automatic recovery
- atomic rollback

## Next-Route Criteria

Choose startup warm context cache only if explicit memory injection remains
stable and user-controlled after quality hardening.

Choose sidebar state model only if compact, edit, and memory state surfaces
need a shared visible status model.

Choose memory retrieval quality/ranking hardening if deterministic recall
quality, not injection safety, becomes the next blocker.
