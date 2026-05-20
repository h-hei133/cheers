# Foundation Consistency

Route: `docs/agent-routes/route163-foundation-consistency-audit.md`

This directory records the current foundation consistency state after the
central-file extraction pass and the first cross-capability result-flow
calibration.

Files:

- `foundation-consistency-audit.md`: concise narrative audit and source of
  truth map.
- `foundation-consistency-matrix.json`: machine-readable fact matrix for
  future AI routes.
- `foundation-risk-register.md`: classified risks, contradictions, and next
  actions.

Scope:

- Evidence comes from current code, focused tests, and implementation-context
  docs.
- This audit does not authorize provider live calls, external MCP execution,
  browser execution expansion, edit/write expansion, session schema changes,
  CLI behavior changes, dependency changes, package-script changes, or a global
  handoff abstraction.
- Capability-local receipts may keep local `failed` states when the terminal
  Result Surface maps the same actionable fact to `stopped`; this is recorded
  as an accepted layered distinction when consumers are explicit.
