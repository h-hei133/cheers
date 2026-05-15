# Common Route Boundaries

These are stable defaults for future `docs/agent-routes/*` route documents.
Route-specific instructions may override this file only when the route
explicitly says so.

This file is route-writing discipline, not project status. Do not record
current capability limits, current phase status, or route completion state here.
Those facts belong in `docs/design/*`, machine-checkable manifests, or the
route document that needs them.

When a future route needs a narrower or broader boundary, write that exception
in the route document itself and explain why the route owns that behavior.

## Default Boundaries

- Do not commit or push unless the user explicitly asks.
- Preserve RTK command discipline.
- Prefer focused changes over broad rewrites.
- Keep changes scoped to the route's stated user-facing path, blocker, or
  runtime capability.
- Do not modify provider behavior, MCP behavior, package scripts, default
  gates, SessionManager persistence schema, or CLI lifecycle unless the route
  explicitly allows that area.
- Do not add persistence, memory storage, startup cache, sidebar UI, sandbox
  behavior, recovery behavior, or edit behavior unless the route explicitly
  targets that area.
- Preserve result-contract compatibility unless the route explicitly allows
  result shape changes.
- If a route touches sensitive behavior, state that route-specific boundary in
  the route document instead of relying only on this common file.

## Sensitive Data Boundary

Do not persist, expose, print, summarize, or copy:

- secrets
- provider credentials
- provider configuration or auth material
- raw recovery content
- raw content blobs
- hidden reasoning

Route documents may require compact-safe references, ids, summaries, or
redaction evidence, but they should not require raw sensitive material to
survive in docs, compact summaries, manifests, or logs.

If the route touches a sensitive path, restate the route-specific data boundary
there. Do not depend on this common file as the only protection for a new
sensitive behavior.

## What Stays Route-Specific

Keep route-specific details in the individual route or the relevant design
document, including:

- current capability limits
- current supported or blocked feature status
- current recovery or persistence mode
- current context, compact, memory, sidebar, startup, or sandbox phase
- route-specific allowed files
- route-specific stop conditions
- route-specific validation commands
