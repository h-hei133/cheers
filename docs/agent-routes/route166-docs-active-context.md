# Route 166: Docs - active context map and pruning

## Module

- Primary module: Documentation / Capability Contract Architecture
- Secondary modules: Harness / Eval, Agent Loop, Result Surface, Session / Continue, CLI / UX, Edit / Patch, Browser, Provider / Model, Runtime, Workspace / File Context
- Route type: documentation context pruning
- Product behavior boundary:
  - documentation organization only
  - no product code changes
  - no package/dependency changes
  - no behavior changes
  - no package sweep by default

## Goal

Reduce future Codex context load by creating a clear active documentation entrypoint and status map.

The project now has many useful documents, but their roles are mixed:

- active source of truth
- implementation context
- foundation risk evidence
- module contract reference
- historical route closeout
- superseded roadmap
- archived design notes

Future routes should not read all of them by default.

Route 166 should establish a small active context entrypoint and classify existing docs so future route prompts can start from the right documents without wasting context.

## Success criteria

This route is successful when:

- `docs/ACTIVE_CONTEXT.md` exists and is short enough for every future route to read first
- docs are classified as active, module-reference, historical, superseded, or archived
- future route prompts know which docs to read by default
- old route closeout / migration docs are not treated as default context
- `module-route-template.md` is updated to require selective doc loading
- `module-backlog.md` points to the new active context policy
- no product source changes are introduced

This route is not successful if:

- it creates another large architecture document
- it makes Codex read even more by default
- it deletes important history without a pointer
- it moves many files without clear benefit
- it changes product behavior or validation scripts unnecessarily

## Outputs

Create:

- `docs/ACTIVE_CONTEXT.md`
- `docs/DOC_STATUS.md`
- `docs/archive/README.md`

Optionally create:

- `docs/README.md` if there is no useful docs landing page
- `docs/architecture/README.md` if needed to explain that architecture contains both active and historical docs

Avoid creating many new docs.

## Active context policy

`docs/ACTIVE_CONTEXT.md` should define:

1. What Codex should read first
2. Which docs are active source of truth
3. Which docs are implementation context
4. Which docs are foundation/risk evidence
5. Which docs are module-specific references
6. Which docs should not be read by default
7. How to choose docs for a route

Keep it concise.

Recommended default order for future routes:

1. Read `docs/ACTIVE_CONTEXT.md`
2. Read route-specific active context:
   - implementation flow routes: `docs/implementation-context/`
   - foundation/risk routes: `docs/foundation/`
   - validation/harness routes: relevant verifier docs/scripts
   - module routes: only the module's contract/reference doc
3. Read historical extraction docs only if touching that file or investigating a regression
4. Do not read archived/superseded docs by default

## Document status map

`docs/DOC_STATUS.md` should classify key docs.

Use simple statuses:

- `active`: current source of truth or default entrypoint
- `implementation-context`: AI implementation wiring context
- `foundation-evidence`: current risk / consistency evidence
- `module-reference`: useful only when touching that module
- `historical`: route closeout or migration history
- `superseded`: replaced by a newer doc
- `archived`: keep for history, not default context

For each doc or doc group, record:

- path
- status
- when to read
- superseded by, if applicable
- owner module or route family

Do not try to classify every file perfectly if docs are too many. Prioritize docs that current route prompts tend to mention.

## Archive policy

Do not delete docs.

If moving files is too risky, do not move them. Instead:

- add status entries in `DOC_STATUS.md`
- add short pointers in directory README files
- mark obvious superseded docs with a short header

If moving is safe, only move clearly obsolete route prompt drafts or old closeout notes into `docs/archive/`, and leave a pointer.

Prefer classification over mass file moves.

## Route template update

Update `docs/agent-routes/module-route-template.md`.

Add a short section:

- start by reading `docs/ACTIVE_CONTEXT.md`
- list only route-relevant docs
- explain why each selected doc is needed
- avoid default reading of historical extraction docs
- update `DOC_STATUS.md` if a route creates a new long-lived doc
- prefer implementation-context and foundation docs over old route closeouts

## Backlog update

Update `docs/architecture/module-backlog.md`.

Record:

- Route 166 closeout
- future route prompts should use active context policy
- next recommended route should return to code/validation work, not more doc pruning

Likely next route candidates:

- Tool / Runtime execution gate evidence closeout
- Harness runtime evidence closeout
- bounded product capability only after route-specific context is clear

## Boundaries

Hard boundaries:

- No product code changes.
- No provider live calls.
- No real-provider config reads.
- No external MCP execution.
- No browser/edit/runtime capability expansion.
- No permission/workspace/session/CLI/result behavior changes.
- No package/dependency changes.
- No package script changes.
- No package sweep by default.
- No commit or push.

## Validation

Required:

- `rtk git diff --check`
- `rtk git status --short --branch`
- package guard:
  - `rtk git diff --name-only -- package.json package-lock.json packages/ts-shell/package.json`

If any JSON file is changed, run JSON parse checks.

Build is not required unless product TypeScript source changes.

Package sweep is not required.

## Completion report

Final report should include:

1. Branch and base commit
2. Files changed
3. Active context policy summary
4. Document status classification summary
5. Archive or superseded handling
6. Route template update
7. Validation commands and results
8. Source/package change confirmation
9. Remaining documentation risks
10. Best next action
11. Proposed commit message

Do not commit or push.
