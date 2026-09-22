# Reference Repositories

Reference repositories are read-only. Use them only for targeted semantic comparison after inspecting the target repository implementation first.

## Writable Target

```text
/home/wang/projects/cheers
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

## Compare Decisions Before Implementing

When a reference has already solved the same class of problem, compare its **specific decisions**
against your plan **before writing the code**, not after. Re-deriving a solution from first
principles is how a known pitfall gets walked into: a sound local reason can still justify a
choice the existing solution had already rejected for a reason you have not seen yet.

Concretely, for the part of the reference that does the same job:

- List the decisions it makes, one line each — key derivation, ordering, fallbacks, what it
  deliberately refuses to do, and what it does about the cases your plan treats as edge cases.
- For each, state whether your plan agrees, disagrees, or has not considered it. **"Not
  considered" is the finding**: it is where the defect hides.
- Where you disagree, name the reason. A disagreement with a stated reason is a decision; a
  disagreement by omission is a defect waiting to be found.

Then write a test that fails when the reference's decision is reversed.

This is not licence to copy. The comparison is for decisions, not code: the target's ownership
boundaries, naming, and structure still govern the implementation, per the limits below.

### Evidence a comparison actually happened

- The reference's decisions appear in the change's reasoning or commit message.
- A test exists that fails when a compared decision is reverted.
- Disagreements carry an explicit reason rather than silence.

A comparison that cannot fail a test has not been checked against anything.

## Limits

- Do not modify reference repositories.
- Do not broad-scan references without a direct blocker.
- Do not use references for large architecture audits without a direct task.
- Do not mechanically copy implementation code.
- Do not copy architecture wholesale when the target repository has different ownership boundaries.
- When the target repository already has a post-reset owner module, preserve the target owner even if a reference repository groups behavior differently.
