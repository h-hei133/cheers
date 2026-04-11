# Issues and Gotchas - Private Coding Agents Rewrite

> Known problems, edge cases, and things to watch out for.

---

## [2026-04-07] T10 Integration Gap Exposed and Resolved

- Initial T10 happy-path acceptance used `git status --short` for escalation-approved process spawn inside a temporary non-git workspace, causing deterministic failure unrelated to sandbox logic.
- Fix applied: switched acceptance process-spawn check to `node --version` so policy/escalation behavior is still exercised while remaining workspace-agnostic.
- Follow-up note: keep acceptance suite commands independent of repository metadata unless the scenario explicitly provisions a git repository.

---

## [2026-04-07] T7 Orchestration Guardrail Notes

- The current cycle detector treats repeated transition signatures as a loop (`coder->reviewer` seen twice). This is intentionally strict for MVP safety and may reject some legitimate multi-iteration review flows.
- If future tasks require bounded multi-pass review loops, cycle policy should evolve to a higher-fidelity signature (for example role-pair + semantic checkpoint hash) while keeping max-turn enforcement.

---

## [2026-04-07] Known Constraints

**Source Repository Limitations**:
- This checkout is source-only snapshot (no package.json, lockfiles, CI workflows, tsconfig, test configs)
- No build/test/lint commands available currently
- Must establish these from scratch

**Platform Considerations**:
- Windows-first target requires careful handling of:
  - Path separators
  - Process isolation/sandboxing mechanisms
  - Shell command execution differences

---
