# Route Reference Scan Policy

This file defines stable reference-scan discipline for route documents.
Reference scans are for architecture alignment and product semantics, not for
copying implementation code.

## Reference Repositories

- ClaudeCode: `/home/wang/projects/source-claudecode`
- opencode: `/home/wang/projects/opencode`
- gemini-cli: `/home/wang/projects/gemini-cli`

These repositories are read-only references. Do not modify them.

## Scan Discipline

- Inspect the target repository first.
- Keep reference scans bounded and task-focused.
- Each route should provide its own search keywords and file budget.
- Default budget should be small, usually 8-16 external files total unless the
  route justifies more.
- Record architecture patterns, product semantics, data boundaries, and local
  implications.
- Do not copy implementation code verbatim.
- Do not over-scan or perform broad reference repository audits when a small
  targeted comparison is enough.
- If a route does not benefit from a reference scan, it may explicitly skip the
  scan and say why.
- Treat the scan as evidence for responsibility boundaries and product
  semantics. Do not use it as permission to port a reference repository's
  structure wholesale.

## What To Record

Route design notes should record:

- reference files inspected
- the file-count budget used
- relevant responsibility boundaries
- user-visible semantics
- data or persistence boundaries
- validation or recovery implications
- local design implications

Avoid recording unrelated reference details that do not affect the route.
Avoid turning scan notes into current project status; route status belongs in
the active route, design notes, or closeout manifest.
