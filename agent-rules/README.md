# Agent Rules

This directory contains durable project-level rules for agents working in `/home/wang/projects/coding-agents`.

Root `AGENTS.md` is intentionally short. Use it as the startup index, then open only the detailed rule files that match the current task.

## Rule Files

- [reference-repositories.md](reference-repositories.md): read-only reference repository usage and limits.
- [file-placement-and-naming.md](file-placement-and-naming.md): ownership, placement, naming, and compatibility shim rules.
- [architecture-boundaries.md](architecture-boundaries.md): TypeScript, Rust, contracts, Python eval, and domain ownership boundaries.
- [evidence-and-truthfulness.md](evidence-and-truthfulness.md): success claims, write evidence, verification evidence, and safe presentation.
- [provider-and-secret-boundary.md](provider-and-secret-boundary.md): real provider opt-in, secret handling, redaction, and failure classification.
- [testing-and-validation.md](testing-and-validation.md): focused validation, baseline classification, and validation claims.
- [development-workflow.md](development-workflow.md): task selection, focused reading, route-specific instructions, and commit hygiene.
- [compatibility-and-history.md](compatibility-and-history.md): route-era compatibility surfaces, old aliases, and historical artifacts.

## Use

- Treat current user instructions and current code as the strongest evidence.
- Use these rules to preserve project safety and architecture boundaries while keeping task work focused.
- Do not treat these files as route logs, branch-state records, or project status reports.
