# Explicit Memory Wake-Up / Future-Turn Injection

Route 85 makes saved project memory usable in the next model turn only after an
explicit `/memory use` command. `/memory wake` and `/memory recall <query>`
remain preview-only.

## Reference Scan Summary

MemPalace separates memory access by depth:

- L0 identity: small stable identity/preferences context.
- L1 essential story: bounded wake-up context built from important/recent
  drawers.
- L2 recall: on-demand, topic/wing/room filtered retrieval.
- L3 search: deeper semantic search over the full palace.

The concept to borrow is the wake-up versus recall separation and bounded
context loading. This route does not borrow MemPalace's ChromaDB backend,
semantic search, MCP tools, startup hooks, identity file, or agent diary.

Coding-agent references reinforce the local pattern:

- This repo's Compact v2 already stages in-memory future-turn context and
  consumes it once in `ShellSessionRuntime.executePrompt`.
- Gemini CLI exposes explicit memory commands and hook-based context injection,
  but startup/session memory remains a separate product decision.
- ClaudeCode memory prompts emphasize explicit save/remove behavior; they do
  not provide a code shape to copy for this local JSONL store.
- opencode references are useful mainly for session/resume architecture, not
  project-memory injection semantics.

## Route 82 / 83 / 84 Baseline

- Route 82 saves approved safe memory summaries into an explicit local JSONL
  store.
- Route 83 previews deterministic recall/search and wake-up context without
  injecting it.
- Route 84 adds invalidation/delete UX so stale records are excluded before
  memory can affect prompts.

Invalidated records are filtered by default; deleted records are not returned.
Route 85 relies on those store/retrieval guarantees.

## Explicit Opt-In Injection Model

Only `/memory use` stages injection:

- `/memory use` stages wake-up memory context for the next normal turn.
- `/memory use <query>` stages deterministic recall results for the next normal
  turn.
- The state is session-scoped and in-memory only.
- A second `/memory use` supersedes the previous pending memory injection.
- The next normal model turn consumes the pending injection once.
- Command-only turns do not consume the injection through slash routing.

No startup auto-load exists. No memory is injected unless the user explicitly
stages it.

## Wake-Up Injection

Wake-up injection uses the existing wake-up preview pipeline:

- L0-like stable project facts and user preferences.
- L1-like route decisions, capability state, blocked-by-design decisions,
  validation patterns, and recovery boundary facts.
- Bounded output through a concise formatter.

The wake-up command itself remains preview-only; `/memory use` is the explicit
staging command.

## Recall Injection

Recall injection uses deterministic local retrieval:

- lexical/exact-term matching only
- stable score and tie-break behavior
- no provider/model calls
- no vector DB, ChromaDB, embeddings, or semantic rerank

`/memory recall <query>` remains preview-only. `/memory use <query>` stages
matching records for one future model turn.

## Compact V2 Coexistence

Memory injection has a separate state store from Compact v2 injection.

When both are pending, runtime order is deterministic:

1. Compact v2 continuity context.
2. Project memory context.
3. Original user request.

The original user prompt barrier persists the original user prompt, not the
injected memory context.

## Redaction And Safety

Injected memory context contains summaries and references only. It excludes:

- raw file content
- raw recovery content
- raw content blobs
- secrets
- provider credentials/config
- hidden reasoning

The formatter defensively redacts secret-looking tokens and raw-content markers.
Unsafe-looking record content blocks injection.

## Deferred Work

Still deferred:

- automatic startup loading
- cross-session auto-loading
- startup cache
- sidebar UI
- MCP memory tools
- vector DB / ChromaDB / embeddings
- provider/model retrieval or reranking

## Route 86 Note

Route 86 adds quality/merge hardening around the Route 85 injection path:

- repeated `/memory use` keeps latest explicit staging semantics
- invalidated/deleted records are rechecked and filtered immediately before
  injection
- injected memory context is deduped and budgeted while preserving safety
  caveats
- clear deterministic structured-memory conflicts block injection before
  consumption
- unsupported automatic injection, startup auto-load, or provider retrieval
  claims fail quality checks

## Next-Route Criteria

Choose startup warm cache or sidebar state only after explicit injection remains
stable and user-controlled.
