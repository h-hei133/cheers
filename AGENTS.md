# AGENTS.md

## Scope

This directory is the **working project** for the private coding agents rewrite.

- Working directory: `private-coding-agents/`
- Reference/source library: parent directory `..\` (the ClaudeCode source snapshot)

## Intent

Use the parent repository as a **read-only architecture/reference library** for migration work.
Implement new code only inside this working project unless explicitly doing source analysis against the parent snapshot.

## Practical rules

- Default to editing only files under this directory
- Treat `..\QueryEngine.ts`, `..\query.ts`, `..\tools.ts`, `..\commands.ts`, `..\setup.ts`, and `..\services/mcp/**` as migration references
- Keep TypeScript imports ending in `.js`
- Run build/test commands from this directory, not the parent source snapshot root

## Core project layout

- `contracts/` - cross-runtime schemas and generated types
- `packages/ts-shell/` - TypeScript shell and orchestration runtime
- `packages/rust-core/` - Rust execution core / daemon
- `packages/python-eval/` - Python eval layer
- `scripts/` - workspace scripts (doctor/setup/build/test/workflow)
- `.sisyphus/` - plans, drafts, evidence, notes

## Migration guidance

- Parent snapshot = source-of-truth for responsibilities
- This project = target implementation
- When migrating a ClaudeCode subsystem, produce a source-to-target responsibility map first, then implement behind compatibility wrappers where practical
