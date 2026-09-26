# Execution Boundary

This folder records the current language/runtime boundary after the product architecture reset.

Current decision:

- TypeScript is the primary product runtime and control plane, and the only one.
- Execution is an explicit boundary/interface, implemented in `packages/ts-shell/src/runtime/execution/`.
- There is no separate execution plane. The Rust daemon and the Python evaluation layer were removed on 2026-09-26 after measurement showed neither provided anything the TypeScript path did not already do better; see `.wiki/features/08-gap-and-debt-research.md` section 2.
- Isolation is owned by `packages/ts-shell/src/sandbox/` (`bwrap` on Linux, `sandbox-exec` on macOS).
- `contracts/` carries serialized schemas, lifecycle states, permission semantics, and execution events.

Files:

- [00-current-language-reality.md](00-current-language-reality.md)
- [01-side-effect-entrypoint-inventory.md](01-side-effect-entrypoint-inventory.md)
- [02-execution-boundary-contract.md](02-execution-boundary-contract.md)
- [03-boundary-enforcement-plan.md](03-boundary-enforcement-plan.md)
- [04-rust-readiness-triggers.md](04-rust-readiness-triggers.md)
- [05-python-eval-isolation.md](05-python-eval-isolation.md)
