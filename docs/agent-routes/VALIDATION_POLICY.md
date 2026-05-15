# Route Validation Policy

This file defines stable validation discipline for route documents. Individual
routes should list only validation that is specific to that route or stricter
than these defaults.

## Preflight

Preflight usually includes:

```bash
rtk git status --short --branch
rtk git diff --check
```

Use the status output to identify unrelated worktree changes before editing.
Do not revert unrelated user changes.

## Docs-Only Changes

Docs-only changes usually require:

```bash
rtk git diff --check
```

No tests are required for pure documentation changes unless the route
explicitly asks for them.

## Code Changes

For code changes:

- Run focused tests for touched modules first.
- Prefer the smallest test command that proves the changed behavior.
- Broaden validation only when touched files cross core boundaries or focused
  tests cannot cover the risk.
- Use capability-specific verifiers only when the route touches that capability
  or the route explicitly requires that verifier.
- Do not run broad package tests by default.

## Final Validation

Final validation should usually include:

- relevant focused tests
- `rtk npm run verify:result-contract` when result surfaces or contracts could
  be affected
- `rtk npm run build -w packages/ts-shell` for TypeScript changes
- `rtk git diff --check`
- `rtk git status --short --branch`

Routes should add route-specific final commands only when they are directly
connected to the touched capability.

## Failures and Residue

- If broad or focused paths expose unrelated existing failures, narrow to
  touched tests and document the unrelated failures.
- Do not fix unrelated failures unless the route caused them or the user
  explicitly asks.
- Clean generated residue before finalizing, especially audit/history files
  produced by validation.
- Do not run provider, default, or MCP gates unless the route explicitly
  requires them.

