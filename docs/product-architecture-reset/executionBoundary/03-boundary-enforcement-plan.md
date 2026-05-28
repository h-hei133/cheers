# Boundary Enforcement Plan

Current enforcement entrypoint:

```text
node scripts/verify-execution-boundary.mjs
```

The check scans production TypeScript source under `packages/ts-shell/src`, excluding tests, test utilities, fixtures, and `core/harness` evaluation scenarios.

It enforces:

- no direct `child_process` imports outside sanctioned process/execution owners
- no direct writable `fs` operations outside sanctioned file/workspace owners
- no production runtime imports from `packages/python-eval`
- no production runtime imports from docs, scripts, dev-history, or route report surfaces
- no `contracts/` dependency on runtime package modules
- the TypeScript execution boundary exports explicit authority modes and structured execution events
- core tool side effects continue to route through `ExecutionService`
- execution authority semantics do not regress to vague boolean fields such as `allowed`, `approved`, `enabled`, or `safe`
- the shared execution command contract fixture exists, remains JSON-readable, uses `execution.command.contract`, and preserves `command.run` request semantics without vague authority booleans

The allowlists are deliberately explicit. If a new owner is justified, update both the scanner allowlist and this documentation with the owner responsibility. If a caller is only adding behavior inside an existing domain, prefer routing through the current owner rather than widening the allowlist.

The scanner is a guardrail for new drift. It is not a complete architecture verifier and should not be used to justify broad rewrites.
