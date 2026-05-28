# Python Eval Isolation

`packages/python-eval/` is offline evaluation only.

Allowed responsibilities:

- read datasets, traces, and evaluation artifacts
- run offline research/evaluation scripts
- produce evaluation outputs that are explicitly treated as artifacts, not runtime state

Forbidden responsibilities:

- production orchestration
- permissions
- replay or recovery
- runtime persistence
- agent loop execution
- production tool lifecycle
- production runtime side effects

Current dependency evidence:

- `packages/python-eval` has its own `pyproject.toml` and package scripts.
- Production TypeScript runtime code must not import `packages/python-eval`.
- `scripts/verify-execution-boundary.mjs` scans production TypeScript source for python-eval imports.

If Python evaluation needs to consume runtime data, pass serialized artifacts across the boundary. Do not import production runtime modules into Python eval and do not import Python eval into production runtime packages.
