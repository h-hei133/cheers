# AGENTS.md

## Purpose

This file is the startup index for agents working in this repository. Keep it concise. Detailed durable rules live under `agent-rules/`.

## Scope

Writable target repository:

```text
/home/wang/projects/coding-agents
```

Only this repository may be modified. Reference repositories are read-only and are used only for targeted semantic comparison.

RTK command discipline is configured outside this repository. Follow the global Codex and RTK instructions when running shell commands.

## Non-Negotiable Safety

- Do not manually read, print, copy, summarize, clean, or modify real provider configuration under `/home/wang/.private-agents-real`.
- Use real provider configuration only through explicit opt-in gates that preserve isolated runtime homes, redaction, clean repository status, and precise failure attribution.
- Do not infer write authorization from prompt text.
- Keep dry-run, preview, permission-pending, denied, blocked, approved-for-write, and write-success states distinct.
- Do not hide unverified write outcomes behind success-like terminal or session states.
- Do not change unrelated runtime code.
- Provider/auth core, release/default gates, package scripts, and build behavior require explicit task scope.

Detailed rules: [provider and secret boundary](agent-rules/provider-and-secret-boundary.md), [evidence and truthfulness](agent-rules/evidence-and-truthfulness.md).

## Architecture Summary

- TypeScript is the control plane: shell, session, orchestration, query loop, slash commands, permission UX, recovery, replay, runtime durability, result mapping, terminal/session surface, and high-level capability routing.
- Rust is the execution plane: daemon behavior, command execution, timeout, cancellation, sandbox preflight, and low-level execution isolation.
- `contracts` is the cross-runtime semantic boundary.
- `packages/python-eval/` is an evaluation layer, not a runtime owner.

Detailed rules: [architecture boundaries](agent-rules/architecture-boundaries.md).

## Ownership And Naming Summary

- Put behavior in the owning module/domain instead of central orchestration or vague helper buckets.
- Keep compatibility wrappers thin and delegate-only.
- Keep TypeScript imports ending in `.js` when importing local TypeScript modules that compile to JavaScript.
- Prefer short, responsibility-based file names backed by domain-specific directories.
- Avoid route-numbered, roadmap-title, or process-term product names unless the file is explicitly a compatibility/history surface.

Detailed rules: [file placement and naming](agent-rules/file-placement-and-naming.md), [compatibility and history](agent-rules/compatibility-and-history.md).

## Validation Summary

- Run focused validation tied to the files and behavior changed.
- Do not default to full-repository validation when a focused gate covers the risk.
- If only markdown files change, do not run build/tests.
- Classify failing tests before changing implementation or tests.
- Do not claim validation passed unless the command actually ran and passed.
- Restore audit/history residue before finalizing.

Detailed rules: [testing and validation](agent-rules/testing-and-validation.md), [development workflow](agent-rules/development-workflow.md).

## Reference Repositories

Read-only references:

- Claude Code
- opencode
- Gemini CLI
- OpenHands
- Stagehand
- Playwright MCP
- MemPalace
- mem0
- graphiti
- Inspect AI
- mini-swe-agent
- pi
- GitNexus

Use references only after inspecting the target implementation first, and only for task-relevant semantic comparison. Do not broad-scan references without a direct blocker. Do not mechanically copy implementation code or architecture wholesale.

Detailed rules: [reference repositories](agent-rules/reference-repositories.md).

## Detailed Rules

- [agent-rules/README.md](agent-rules/README.md)
- [agent-rules/reference-repositories.md](agent-rules/reference-repositories.md)
- [agent-rules/file-placement-and-naming.md](agent-rules/file-placement-and-naming.md)
- [agent-rules/architecture-boundaries.md](agent-rules/architecture-boundaries.md)
- [agent-rules/evidence-and-truthfulness.md](agent-rules/evidence-and-truthfulness.md)
- [agent-rules/provider-and-secret-boundary.md](agent-rules/provider-and-secret-boundary.md)
- [agent-rules/testing-and-validation.md](agent-rules/testing-and-validation.md)
- [agent-rules/development-workflow.md](agent-rules/development-workflow.md)
- [agent-rules/compatibility-and-history.md](agent-rules/compatibility-and-history.md)
