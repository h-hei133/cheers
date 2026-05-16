# Startup Warm Context Cache

## Route 87 Summary

Route 87 prototypes a project-scoped startup warm context cache for safe,
structured status summaries. The cache is local, discardable, and explicitly
built. It is not injected into model context, not auto-loaded into future turns,
and not connected to provider/model calls.

## Reference Scan

Files inspected:

- `/home/wang/projects/mempalace/CLAUDE.md`
- `/home/wang/projects/mempalace/mempalace/layers.py`
- `/home/wang/projects/mempalace/mempalace/cli.py`
- `/home/wang/projects/source-claudecode/main.tsx`
- `/home/wang/projects/opencode/packages/web/src/content/docs/plugins.mdx`
- `/home/wang/projects/opencode/packages/web/src/content/docs/config.mdx`
- `/home/wang/projects/opencode/packages/web/src/content/docs/tui.mdx`
- `/home/wang/projects/gemini-cli/docs/reference/configuration.md`

Budget used: 8 files.

MemPalace keeps wake-up cost low by separating a tiny identity layer, a compact
essential-story layer, on-demand filtered recall, and deeper search. The local
implication is to borrow the layered wake-up shape and token budget discipline,
not the palace terminology, vector/ChromaDB store, or verbatim drawer model.
This project's cache must store only safe summaries, because raw project files,
recovery content, provider credentials, and hidden reasoning are outside the
cache boundary.

ClaudeCode's startup path shows a useful distinction between first-render
startup and deferred warm work. opencode documents compaction and status as
explicit user-visible surfaces. Gemini CLI documentation separates context file
loading, checkpointing, and experimental memory features behind configuration.
The local implication is to keep this route as an explicit status/rebuild
surface and defer automatic startup injection.

## Current Baseline

- Compact v2 future-turn injection exists and is quality-hardened.
- Project memory save/recall/wake/invalidate/delete exists over an explicit
  local store.
- `/memory use` can stage one-shot future-turn memory injection.
- Route 86 filters stale memory, dedupes records, checks conflicts, budgets
  injected context, and blocks low-quality memory injection.
- Startup warm cache did not exist before Route 87.

## Goals

- Build a project-scoped warm cache from safe structured sources.
- Cache edit, compact, memory, validation, and route phase summaries.
- Provide health/read/write behavior with explicit project/cache roots.
- Render concise user/session status.
- Add a simple `/warmup` command for status and explicit rebuild.

## Cache Inputs

Allowed inputs:

- edit capability closeout/readiness summary
- Compact v2 safe summary when supplied
- active approved project memory records or wake-up preview output
- memory injection quality summary when supplied
- validation evidence summaries
- route phase and next-action summaries

Excluded inputs:

- raw file content
- raw recovery content
- secrets, provider credentials, provider config, auth tokens, headers
- hidden reasoning
- invalidated or deleted memory records as active facts
- provider/model output

## Cache Model

`startupWarmContextCache.ts` defines:

- `cacheVersion`
- project root hash
- `createdAt`
- source signature and source list
- edit capability summary
- compact summary
- memory wake-up summary
- validation summary
- route phase summary
- redactions and warnings
- staleness: `fresh`, `stale`, `invalid`, `unknown`
- cache mode: `disabled`, `explicit-local`, `test-only`
- safety caveats proving no model injection, no startup auto-load, no provider
  call, no vector store, raw content excluded, and cache discardable

## Build, Store, And Health

`startupWarmContextBuilder.ts` is pure and does not persist. It summarizes safe
sources, filters invalidated memory records, and redacts raw-content,
secret-looking, and hidden-reasoning markers.

`startupWarmContextHealth.ts` owns local cache read/write/health. It requires
explicit `projectRoot` and `cacheRoot` or `cacheFile`; there is no global default
cache path. Missing cache is safe. Source signature mismatch or TTL expiry can
mark the cache stale. Invalid JSON or incompatible cache versions mark it
invalid.

## User Surface

`startupWarmContextSurface.ts` renders:

- cache mode, found/writable state, and staleness
- project hash
- edit, compact, memory, validation, and route phase summaries
- warnings and redactions
- `Injected into model: no`
- `Startup auto-load: no`
- next action

`/warmup` and `/warmup status` are read-only status commands. `/warmup rebuild`
writes only when a caller supplies an explicit writable warm-cache store. The
default CLI path does not invent a cache root.

## Invalidation And Staleness

The source signature is derived from safe summaries. A caller can compare the
current signature with the cached signature to report stale state. A TTL can
also be supplied by tests or future startup integration. The cache remains
discardable: deleting the file should not lose authoritative project state.

Invalidated memory records are filtered by the builder. Deleted records are
absent from the memory store's default list/read model and therefore cannot be
cached as active facts.

## Deferred Boundaries

Still deferred:

- automatic model-context injection
- startup auto-load into future turns
- cross-session automatic memory loading
- vector DB / ChromaDB / embeddings
- provider/model recall or rerank
- MCP memory tools
- sidebar UI
- SessionManager schema changes
- startup lifecycle rewrite

## Next-Route Criteria

Route 88 note: startup warm cache state now has a read-only sidebar projection
consumer. This does not add startup auto-load, model-context injection, cache
discovery, or a sidebar UI; it only lets `/sidebar` summarize supplied warm
cache health/cache facts alongside edit, compact, memory, and validation state.

Choose startup warm cache session integration only if a caller can provide an
explicit cache root and the startup surface remains status/read-only.

Choose sidebar state model if edit, compact, memory, and warm-cache status need
a shared visible state surface.

Choose memory retrieval ranking hardening if recall quality becomes the next
user-visible blocker.
