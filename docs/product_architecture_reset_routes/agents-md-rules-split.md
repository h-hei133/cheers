# AGENTS.md Rules Split And Repository Agent Policy Cleanup

## Purpose

Refactor the repository-level `AGENTS.md` into a short startup index and move detailed long-lived rules into a dedicated root-level `agent-rules/` directory.

This route is documentation-only.

It must not change runtime code, tests, package scripts, provider behavior, build behavior, or validation semantics.

The goal is to make agent instructions easier to read at session start while preserving the durable project constraints that matter.

## Background

The current `AGENTS.md` contains useful rules, but it is too long for a session-start instruction file. It mixes:

- repository scope
- reference repository details
- provider secret boundaries
- architecture boundaries
- file placement and naming
- task selection
- validation rules
- test baseline discipline
- real provider validation
- stop conditions
- reporting requirements
- project state file policy

The new structure should keep `AGENTS.md` as an index and move detailed rules into focused files.

## Output Structure

Create a new root-level directory:

```text
agent-rules/
````

Required files:

```text
agent-rules/README.md
agent-rules/reference-repositories.md
agent-rules/file-placement-and-naming.md
agent-rules/architecture-boundaries.md
agent-rules/evidence-and-truthfulness.md
agent-rules/provider-and-secret-boundary.md
agent-rules/testing-and-validation.md
agent-rules/development-workflow.md
agent-rules/compatibility-and-history.md
```

Rewrite root `AGENTS.md` as a concise index that points to these files.

## Language Requirement

All new or rewritten documentation content must be written in English.

Do not mix Chinese into `AGENTS.md` or `agent-rules/*.md`.

## Scope

Allowed:

* Rewrite root `AGENTS.md`.
* Create `agent-rules/` and the required markdown files.
* Move durable rule content from `AGENTS.md` into the appropriate rule files.
* Remove route-specific, session-specific, and transient process details from root `AGENTS.md`.
* Add concise rule summaries where needed.
* Add cross-links between `AGENTS.md` and `agent-rules/`.

Not allowed:

* No runtime source code changes.
* No package script changes.
* No test code changes.
* No build system changes.
* No route report changes.
* No provider config reads.
* No live provider execution.
* No edits outside documentation unless absolutely necessary for path references.
* No new project state or route log file.

## Main Design

`AGENTS.md` should become a short startup document.

It should keep only:

1. Purpose of the file.
2. Writable target repository.
3. Reference repositories as names only.
4. Non-negotiable safety rules.
5. High-level architecture boundary summary.
6. High-level ownership / placement summary.
7. High-level validation summary.
8. Links to detailed `agent-rules/` files.

`AGENTS.md` should not contain long detailed policy sections.

## Content To Remove From AGENTS.md

Remove these sections from root `AGENTS.md`:

* `Stop Conditions`
* `Reporting Requirements`
* `Project State Files`

Do not copy them wholesale into another file.

If any small durable principle is still useful, rewrite it in a shorter and more general form inside `agent-rules/development-workflow.md`.

Do not keep route-level stop/reporting requirements as global startup rules.

## Content To Preserve And Move

### Reference repositories

In `AGENTS.md`, keep only a short list of reference repo names and a short rule:

* reference repos are read-only
* use them only for targeted semantic comparison when needed
* do not mechanically copy implementation code

Move details to:

```text
agent-rules/reference-repositories.md
```

This file must include:

* repository paths
* what each reference repo is useful for
* when to inspect references
* when not to inspect references
* do not broad-scan references without a direct blocker
* do not copy architecture wholesale

### File placement and naming

Move detailed rules to:

```text
agent-rules/file-placement-and-naming.md
```

This file must include:

* code must live in the owning module/domain
* do not pile unrelated behavior into one folder
* do not pile unrelated behavior into one file
* large files are allowed only when their responsibilities are cohesive and rightful
* avoid vague buckets such as `helper`, `helpers`, `utils`, `misc`, `common`, `support`, `legacy`, or route-style names
* product code must not expose development process terms such as route numbers, capstone, closeout, cut-through, sprint, or MVP unless it is explicitly a compatibility/history surface
* file names should be short, responsibility-based, and domain-backed
* directory names should carry context so file names do not become long
* new files must answer: owner domain, responsibility, callers, tests, and why an existing file is not the right home
* compatibility shims must remain thin and must not gain business logic

### Architecture boundaries

Move detailed rules to:

```text
agent-rules/architecture-boundaries.md
```

This file must include:

* TypeScript is the control plane
* Rust is the execution plane
* `contracts` is the cross-runtime semantic boundary
* Python eval is not a runtime owner
* domain ownership rules after the reset
* no new capability logic in legacy orchestration paths unless explicitly documented as compatibility
* compatibility wrappers should delegate only
* product runtime must not import docs, scripts, dev-history, or route reports
* final-domain modules should own their actual responsibilities

### Evidence and truthfulness

Move detailed truthfulness and false-success rules to:

```text
agent-rules/evidence-and-truthfulness.md
```

This file must include:

* model/provider output is claim, not fact
* provider-called is not proposal success
* exact-ready is not write authority
* write authority is not verification success
* apply without verification is not verified success
* repair proposal is not repair success
* repair apply without re-verification is not repair success
* skipped / not-run / blocked / partial / not-proven states must not become success
* evidence/verdict layers determine success
* CLI/session/result presentation must not create success
* preserve redaction and report-safe projections

### Provider and secret boundaries

Move real provider and secret rules to:

```text
agent-rules/provider-and-secret-boundary.md
```

This file must include:

* never manually read, print, copy, summarize, clean, or modify real provider config
* real provider only through explicit opt-in gates
* `PRIVATE_AGENTS_REAL_HOME` is a credential/config source, not runtime home
* provider output, oldText, newText, keys, headers, tokens, config paths, and secrets must not be printed
* classify provider-network, provider-config, provider-auth, route failure, and redaction failure separately
* provider defaults must remain off

### Testing and validation

Move validation and baseline rules to:

```text
agent-rules/testing-and-validation.md
```

This file must include:

* run focused validation tied to touched areas
* classify failing tests before changing implementation or tests
* distinguish product behavior drift, stale expectation, harness/setup drift, obsolete scenario, future capability expectation, and environment/flaky issue
* do not pass tests by weakening assertions, broad skips, or silent deletion
* run broad suites only when the touched area requires it
* do not claim validation passed unless the command actually ran and passed
* restore audit/history residue before finalizing
* mention trigger-based validation by touched area

### Development workflow

Move workflow guidance to:

```text
agent-rules/development-workflow.md
```

This file must include:

* before editing, identify the owner module, user-facing path, blocker/risk, and focused validation
* use subagents or Serena for focused code navigation when useful
* do not broad-read the whole repo when a focused ownership audit is enough
* do not turn a task into route-log writing
* do not make route-specific reporting rules global
* use route-specific stop/reporting requirements inside the current route document or prompt, not in AGENTS.md
* commits should keep behavior changes, moves, and docs separable when practical

### Compatibility and history

Create:

```text
agent-rules/compatibility-and-history.md
```

This file must include:

* route history may exist only under dev-history/evidence-history or explicit compatibility surfaces
* do not create new route-numbered product files
* route-era names inside compatibility adapters must be deliberate and documented
* old aliases and historical reports must remain reachable until a dedicated retirement route removes them
* compatibility shims should delegate and re-export only
* new feature work must use current domain layout, not old route paths
* project state and plan docs are not automatic truth

## Root AGENTS.md Shape

The rewritten `AGENTS.md` should be concise.

Suggested outline:

```text
# AGENTS.md

## Purpose

## Scope

## Non-Negotiable Safety

## Architecture Summary

## Ownership And Naming Summary

## Validation Summary

## Reference Repositories

## Detailed Rules
```

It should link to all files in `agent-rules/`.

It should not include long route-level procedures.

## Requirements For The New Rule Files

Each `agent-rules/*.md` file must:

* be stable and project-level
* avoid current route state
* avoid transient branch status
* avoid completed route logs
* avoid long historical narratives
* use concise headings
* include concrete do / do not rules
* include examples where useful
* avoid duplicating large sections across files

## Current AGENTS.md Handling

Use the current root `AGENTS.md` as the source material.

Preserve durable rules, but rewrite and redistribute them.

Do not mechanically copy huge sections if they belong to route-level instructions or transient project state.

Do not invent new project facts that are not supported by current repository rules.

## Validation

Required:

* path existence check:

  * root `AGENTS.md`
  * all required `agent-rules/*.md`
* `git diff --check`
* `git status --short --branch`

If only markdown files change, do not run build/tests.

Do not run live provider.

## Completion Criteria

COMPLETE requires:

* root `AGENTS.md` is short and index-like
* `agent-rules/` exists
* all required rule files exist and are non-empty
* Stop Conditions, Reporting Requirements, and Project State Files are removed from root `AGENTS.md`
* reference repositories are summarized in root and detailed in `reference-repositories.md`
* file placement and naming rules are detailed in `file-placement-and-naming.md`
* architecture boundaries are detailed in `architecture-boundaries.md`
* truthfulness rules are detailed in `evidence-and-truthfulness.md`
* provider secrecy rules are detailed in `provider-and-secret-boundary.md`
* validation/test rules are detailed in `testing-and-validation.md`
* development process rules are detailed in `development-workflow.md`
* route history / compatibility rules are detailed in `compatibility-and-history.md`
* no runtime code or package scripts changed
* validation passes

PARTIAL if:

* root `AGENTS.md` remains long
* detailed rules are missing
* route-level reporting/stop/project-state sections remain in root AGENTS.md
* files become another unstructured dump

BLOCKED if:

* current AGENTS.md cannot be safely parsed
* required target paths are unavailable

## Commit

Commit if green.

Suggested prefix:

agents-rules:

Do not push.

## Final Report

Include:

1. Final status
2. Files created/updated
3. What stayed in root AGENTS.md
4. What moved into agent-rules
5. What was removed
6. Validation results
7. Runtime/package behavior changed yes/no
8. Commit hash if committed

