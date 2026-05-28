# Execution Boundary

This folder records the current language/runtime boundary after the product architecture reset.

Current decision:

- TypeScript is the primary product runtime and control plane.
- Execution is an explicit boundary/interface, currently implemented mostly in TypeScript.
- Rust is a native executor candidate for OS/process/sandbox/isolation/distribution-critical needs, not the default current execution plane.
- `contracts/` carries serialized cross-runtime schemas, lifecycle states, permission semantics, and execution events.
- `packages/python-eval/` is offline evaluation only.

Files:

- [00-current-language-reality.md](00-current-language-reality.md)
- [01-side-effect-entrypoint-inventory.md](01-side-effect-entrypoint-inventory.md)
- [02-execution-boundary-contract.md](02-execution-boundary-contract.md)
- [03-boundary-enforcement-plan.md](03-boundary-enforcement-plan.md)
- [04-rust-readiness-triggers.md](04-rust-readiness-triggers.md)
- [05-python-eval-isolation.md](05-python-eval-isolation.md)
