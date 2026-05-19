# Module Route Template

Use this template for future module-focused routes. It exists to prevent vague feature routes and to force every route to state module ownership, lifecycle stage, boundaries, validation, and claims.

## Route Title

`Route XXX: <module> - <bounded objective>`

## Module

- Primary module:
- Secondary modules:
- Capability:
- Capability lifecycle stage(s):
  - availability:
  - policy:
  - planning:
  - execution:
  - observation:
  - evidence:
  - result mapping:
  - transcript:
  - continue / replay:
  - eval:
  - report:
  - cleanup:
  - redaction:

## Goal

State the exact user-facing or architecture blocker this route reduces.

This route is successful when:

- [ ] 
- [ ] 
- [ ] 

This route is not successful if:

- [ ] it only adds tests/docs without reducing the stated blocker
- [ ] it changes a default gate or capability claim without explicit approval
- [ ] it broadens source behavior outside the bounded surface

## References

Target project evidence:

- 

Reference projects to inspect:

- ClaudeCode:
- opencode:
- OpenHands:
- Stagehand:
- Playwright MCP:
- Inspect AI:
- mini-swe-agent:
- gemini-cli:

Reference budget:

- Maximum files per reference:
- Stop condition for reference reading:

## Current Project Surfaces

Files likely involved:

- 

Current ownership:

| File | Primary module | Secondary modules | Current role | Drift risk |
|---|---|---|---|---|
| | | | | |

## Allowed Changes

- 

## Explicit Non-Goals

- Do not:
- Do not:
- Do not:

## Boundaries

Hard boundaries:

- No source changes unless explicitly listed above.
- No package/dependency changes unless explicitly listed above.
- No default gate changes unless explicitly listed above.
- No provider/auth core changes unless explicitly listed above.
- No real-provider execution unless explicitly opt-in and isolated.
- No external MCP server execution unless explicitly opt-in and isolated.
- No broad mutation capability unless this route is specifically a mutation route.

Capability-specific boundaries:

- Workspace boundary:
- Permission boundary:
- Runtime boundary:
- Session/continue boundary:
- Result-surface boundary:
- Harness/eval boundary:
- Redaction boundary:

## Capability Contract

Fill this table before implementation.

| Stage | Current State | Route Change | Evidence Required |
|---|---|---|---|
| availability | | | |
| policy | | | |
| planning | | | |
| execution | | | |
| observation | | | |
| evidence | | | |
| result mapping | | | |
| transcript | | | |
| continue / replay | | | |
| eval | | | |
| report | | | |
| cleanup | | | |
| redaction | | | |

## Validation

Focused validation:

- `rtk ...`

Broader validation only if touched files cross these boundaries:

- CLI flags:
- runtime route behavior:
- result/session surface:
- workspace writer policy:
- permission/approval:
- provider-facing route:
- contract shape:
- default rejection behavior:

Repository hygiene:

- `rtk git diff --check`
- `rtk git status --short --branch`
- verify source/package files changed only if intended:
  - `rtk git diff --name-only -- packages/ts-shell/src`
  - `rtk git diff --name-only -- package.json package-lock.json packages/ts-shell/package.json`

## Required Evidence Markers

If the route adds or changes a verifier, define stable markers:

- success marker:
- failure marker:
- skip marker:
- dry-run marker:
- redaction marker:
- real-provider opt-in marker:
- external MCP marker:
- dirty-repo marker:

## Completion Audit

Before final response, map every requested deliverable to evidence:

| Requirement | Evidence | Status |
|---|---|---|
| | | |

## Final Report Format

1. Branch and base commit
2. Files changed
3. What changed
4. Runtime path or blocker advanced
5. Validation commands and results
6. Real-provider gate status, if applicable
7. External MCP status, if applicable
8. Audit/history residue handling
9. Source/package change confirmation
10. Remaining risks
11. Best next action
12. Proposed commit message

Do not claim implementation, readiness, or validation that was not actually completed.
