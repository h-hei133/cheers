# Agent Rules

This directory contains durable project-level rules for agents working in `/home/wang/projects/cheers`.

Root `AGENTS.md` is intentionally short. Use it as the startup index, then open only the detailed rule files that match the current task.

## Rule Files

- [reference-repositories.md](reference-repositories.md): read-only reference repository usage and limits.
- [file-placement-and-naming.md](file-placement-and-naming.md): owner-domain placement, short local file names, compatibility shim rules, and product vocabulary rules.
- [architecture-boundaries.md](architecture-boundaries.md): the single TypeScript runtime, contracts, execution boundary, native-module gate, and domain ownership boundaries.
- [evidence-and-truthfulness.md](evidence-and-truthfulness.md): success claims, write evidence, verification evidence, and Minimal UI (MUI) presentation.
- [provider-and-secret-boundary.md](provider-and-secret-boundary.md): live provider interaction, isolated test homes, redaction, and failure classification.
- [testing-and-validation.md](testing-and-validation.md): OOM-safe serial execution, focused validation, baseline classification, and validation claims.
- [development-workflow.md](development-workflow.md): first-principles thinking, `HANDOFF.md` pitfall memory, focused reading, and commit hygiene.
- [compatibility-and-history.md](compatibility-and-history.md): route-era compatibility surfaces, old aliases, and historical artifacts.

## Use

- Treat current user instructions and current code as the strongest evidence.
- Use these rules to preserve project safety and architecture boundaries while keeping task work focused.
- Prefer owner-domain structure with meaningful folders and short local filenames for new product code.
- Keep compatibility and entrypoint surfaces thin unless their public contract explicitly owns coordination.
- Do not treat these files as route logs, branch-state records, migration instructions, or project status reports.
