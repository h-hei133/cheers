# Active Documentation Context

Route: `docs/agent-routes/route166-docs-active-context.md`

Read this file first for future routes. Its purpose is to reduce context load,
not to replace code, tests, or route-specific evidence.

## Default Read Order

1. Read this file.
2. Read `docs/DOC_STATUS.md` only far enough to choose route-relevant docs.
3. Read the current route plan under `docs/agent-routes/`.
4. Read one module or capability context set, not all history:
   - implementation flow routes: `docs/implementation-context/`
   - foundation or contradiction routes: `docs/foundation/`
   - module architecture routes: the module's current architecture doc
   - validation or harness routes: the relevant verifier or harness docs
5. Read old route closeouts, design notes, or archived docs only when touching
   that area, investigating a regression, or checking why a decision was made.

## Active Sources Of Truth

- Current code and focused tests remain the highest source of truth after the
  current user instruction.
- `docs/architecture/module-backlog.md` records current module route status,
  completed route families, candidate route families, and the current default
  recommendation.
- `docs/architecture/control-plane-atlas.md` gives the current control-plane
  module map and responsibility boundaries.
- `docs/architecture/capability-contract.md` defines the capability lifecycle
  vocabulary used by module routes.
- `docs/agent-routes/module-route-template.md` is the route authoring template.

## Implementation Context

Use `docs/implementation-context/` when a route wires or rewires capability
paths. It is AI implementation context, not an import-policing rule and not a
substitute for reading the touched source files.

Key files:

- `docs/implementation-context/README.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-flow-graph.md`
- `docs/implementation-context/capability-recipes.md`

## Foundation Evidence

Use `docs/foundation/` when a route changes or audits cross-module
truthfulness, terminal/session consistency, receipts, readiness, or gate
confidence.

Key files:

- `docs/foundation/README.md`
- `docs/foundation/foundation-consistency-audit.md`
- `docs/foundation/foundation-consistency-matrix.json`
- `docs/foundation/foundation-risk-register.md`

## Module References

Read module-reference docs only for the module being changed. Common current
references include:

- Agent Loop: `docs/architecture/agent-loop-turn-kernel.md`,
  `docs/architecture/runmvp-module-extraction.md`
- CLI / UX: `docs/architecture/cli-boundary.md`,
  `docs/architecture/cli-core-split-prep.md`,
  `docs/architecture/cli-module-extraction.md`
- Session / Continue: `docs/architecture/session-manager-boundary.md`,
  `docs/architecture/session-substrate-seams.md`,
  `docs/architecture/session-runtime-module-extraction.md`,
  `docs/architecture/sessionmanager-module-extraction.md`
- Result Surface: `docs/architecture/resultmapper-module-extraction.md`,
  `docs/architecture/cross-capability-result-flow.md`
- Tool / Runtime: `docs/architecture/tool-policy-result-contract.md`,
  `docs/architecture/runtime-receipt-contract.md`,
  `docs/architecture/tool-runtime-execution-flow.md`
- Workspace / Edit: `docs/architecture/workspace-file-context-contract.md`,
  `docs/architecture/edit-patch-module.md`,
  `docs/architecture/edit-expectation-contract.md`,
  `docs/architecture/future-edit-expansion-contract.md`
- Harness / Eval: `docs/architecture/verifier-module-extraction.md`

## Not Default Context

Do not read these by default:

- `docs/agent-routes/route*.md` other than the active route and directly
  relevant predecessor routes.
- `docs/design/` route design and extraction notes.
- `docs/audits/` closeout audits.
- `docs/manual-checks/` manual checklists.
- `docs/archive/` historical or superseded material.

These files remain useful for history, regression analysis, and decision
recovery, but they should not be loaded for every route.

## Choosing Docs For A Route

Select documents by the route's owner module, lifecycle stage, changed files,
and validation surface. If the reason for reading a doc is only "it might be
related", skip it until code or tests point there.

When creating a new long-lived document, add or update its entry in
`docs/DOC_STATUS.md` so future routes know whether it is active,
implementation context, foundation evidence, module reference, historical,
superseded, or archived.
