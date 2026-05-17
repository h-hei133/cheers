# Route Reference Scan Policy

This file defines stable reference-scan discipline for route documents.
Reference scans are for architecture alignment and product semantics, not for
copying implementation code.

## Reference Repositories

Coding-agent baselines:

- ClaudeCode: `/home/wang/projects/source-claudecode`
- opencode: `/home/wang/projects/opencode`
- gemini-cli: `/home/wang/projects/gemini-cli`

Memory/context references:

- MemPalace: `/home/wang/projects/mempalace`
- Mem0: `/home/wang/projects/mem0`
- Graphiti: `/home/wang/projects/graphiti`

Browser/tooling/product references:

- Stagehand: `/home/wang/projects/stagehand`
- browser-use: `/home/wang/projects/browser-use`, when present locally
- Playwright MCP: `/home/wang/projects/playwright-mcp`
- OpenHands: `/home/wang/projects/OpenHands`

Harness / eval / scenario references:

- Inspect AI: `/home/wang/projects/inspect_ai`
- mini-swe-agent: `/home/wang/projects/mini-swe-agent`

Inspect AI is the primary reference for task/eval/log/scorer architecture.
mini-swe-agent is the primary reference for compact coding-agent trajectory
harnesses. Use them when a route touches scenario regression, eval harnesses,
task runners, long-horizon behavior, or agent QA; do not scan them for
unrelated routes.

These repositories are read-only references. Do not modify them. A route should
select only the relevant 1-4 primary references instead of scanning the full
pool by default.

## Scan Discipline

- Inspect the target repository first.
- Keep reference scans bounded and task-focused.
- Each route should provide its own search keywords and file budget.
- Default budget should be small, usually 8-16 external files total unless the
  route justifies more.
- Route docs should name the primary references, focus questions, and maximum
  file budget before scanning.
- Record architecture patterns, product semantics, data boundaries, and local
  implications.
- Do not copy implementation code verbatim.
- Do not over-scan or perform broad reference repository audits when a small
  targeted comparison is enough.
- Do not scan all reference families by default; use memory/context references
  for memory quality routes, browser/tooling references for browser/tool
  surfaces, harness/eval/scenario references for agent QA routes, and
  coding-agent baselines for CLI/session/tool semantics.
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
