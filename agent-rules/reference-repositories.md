# Reference Repositories

Reference repositories are read-only. Use them only for targeted semantic comparison after inspecting the target repository implementation first.

## Writable Target

```text
/home/wang/projects/coding-agents
```

Only the target repository may be modified.

## Read-Only References

```text
/home/wang/projects/source-claudecode
/home/wang/projects/opencode
/home/wang/projects/gemini-cli
/home/wang/projects/OpenHands
/home/wang/projects/stagehand
/home/wang/projects/playwright-mcp
/home/wang/projects/mempalace
/home/wang/projects/mem0
/home/wang/projects/graphiti
/home/wang/projects/inspect_ai
/home/wang/projects/mini-swe-agent
/home/wang/projects/pi
/home/wang/projects/GitNexus
```

## What Each Reference Is Useful For

- Claude Code: behavior, UX, tool-result surface, compact/resume, and permission-surface comparison.
- opencode: open-source agent architecture, permission/tool execution, apply_patch, session processor, and provider-abstraction comparison.
- Gemini CLI: CLI/core layering, ReAct loop, built-in tools, MCP, checkpoint/headless, and sandbox comparison.
- OpenHands: browser/runtime events, action/observation surface, sandbox/tool execution, and recovery/reporting comparison.
- Stagehand: browser observe/act/extract, action target metadata, selector repair, action cache, and web interaction comparison.
- Playwright MCP: browser tool schema, browser context/session lifecycle, snapshots, accessibility tree, and MCP browser-runtime comparison.
- MemPalace: layered memory, local-first recall/wake-up, evidence-first memory structure, and backend-boundary comparison.
- mem0: long-term memory extraction, memory lifecycle, retrieval, user/project memory behavior, and memory API comparison.
- graphiti: temporal/entity graph memory, relationship extraction, invalidation, and graph-backed recall comparison.
- Inspect AI: eval harness, task/scorer separation, sandbox/tool execution, transcript, and report/score comparison.
- mini-swe-agent: lightweight agent loop, CLI trajectory, subprocess/tool evidence, benchmark scenarios, and failure-report comparison.
- pi: coding-agent/reference project for agent/runtime architecture comparison; exact useful parts must be determined by targeted inspection when a task needs it.
- GitNexus: coding-agent/reference project for repository intelligence, graph/context, or developer workflow comparison; exact useful parts must be determined by targeted inspection when a task needs it.

## When To Inspect References

Inspect references when the current task directly touches:

- session lifecycle
- query loop or orchestration
- permission model
- tool boundary or tool execution
- file edit/write behavior
- recovery or resume
- terminal/result/session surface
- durable state
- provider-facing behavior
- execution-plane responsibility

Expected workflow:

1. Inspect the target repository implementation first.
2. Compare only the small reference snippets relevant to the blocker.
3. Use the comparison to preserve responsibility boundaries and runtime semantics.
4. Implement the target design inside this repository.

## Limits

- Do not modify reference repositories.
- Do not broad-scan references without a direct blocker.
- Do not use references for large architecture audits without a direct task.
- Do not mechanically copy implementation code.
- Do not copy architecture wholesale when the target repository has different ownership boundaries.
- When the target repository already has a post-reset owner module, preserve the target owner even if a reference repository groups behavior differently.
