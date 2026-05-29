# Build Infrastructure Route BI012: Product Naming And Origin Cleanup

## Goal

Pause feature implementation and clean architecture naming.

The project has been learning from external agent repositories and docs. That is allowed in historical and planning docs, but external origin vocabulary must not leak into product code, product tests, scripts, package commands, runtime surfaces, user-facing output, or file names.

This route audits and cleans product naming so the architecture remains owned by this project.

Expected final status: COMPLETE.

## Core rule

External source names and learning-origin words may appear in historical planning documents under docs/build-infrastructure and other clearly historical docs.

They must not appear in:

- packages source file names
- packages source content
- product test file names
- product test assertions visible to users
- package scripts
- runtime event names
- CLI output
- product JSON fields
- exported product type names
- new product docs outside historical architecture notes
- compatibility shims except legacy names that already existed and are explicitly documented

The project may keep the concepts, but must rename them into local domain language.

## What to audit

Audit for vocabulary that reveals external origin or learning process.

Categories:

1. External repository names
   Any names of outside projects used as product identifiers, file names, type names, event names, test names, package scripts, or runtime fields.

2. Learning-origin words
   Words such as reference, inspired, copied, borrowed, adopted, source project, upstream project, benchmarked against, and similar process vocabulary in product surfaces.

3. Route-era vocabulary
   Words such as route, capstone, sprint, cut-through, closeout, MVP, BI, and temporary process words in product code or product file names.

4. Historical vocabulary in wrong place
   Words that are acceptable in docs/build-infrastructure, docs/dev-history, or docs/evidence/history, but not in source product modules.

5. User-visible output
   CLI/session/result/runtime event text must not expose external learning source names or process vocabulary.

## Allowed locations

Allowed:

- docs/build-infrastructure
- docs/dev-history
- docs/evidence/history
- docs/product-architecture-reset
- route documents
- audit documents
- historical summaries
- final reports that explicitly discuss learning history

Not automatically allowed:

- packages/ts-shell/src
- packages/ts-shell tests if they assert product vocabulary
- scripts
- package.json scripts
- runtime event fields
- CLI/session output
- product docs that describe current architecture as if external origin is part of product identity

## Required Serena inspection

Use Serena before editing.

Inspect current project with targeted search and symbol inspection across:

- runtime
- runtime/events
- runtime/resources
- runtime/extensions
- runtime/loop
- provider
- tools
- session
- core/shell
- planning
- context
- evidence
- result
- package scripts if accessible
- recent build-infrastructure product files from BI002 to BI011

Use normal text search if Serena search is insufficient.

Do not inspect external repositories for this route unless needed to identify accidental copied identifiers. The goal is local cleanup.

If Serena is unavailable, continue with normal repository search and report that Serena was unavailable.

## Deliverables

### 1. Vocabulary audit

Create or update:

docs/build-infrastructure/product-naming-origin-audit.md

Include:

- searched locations
- flagged terms
- allowed historical occurrences
- disallowed product occurrences
- files changed
- files intentionally left unchanged
- remaining risks

### 2. Product cleanup

Rename or rewrite disallowed occurrences in product code and product tests.

Examples of preferred local language:

- reference loop becomes agent loop, runtime loop, loop kernel, loop contract
- external project pattern becomes runtime pattern, local architecture pattern, product architecture pattern
- inspired by becomes aligned with local design or adopted architecture rule in docs only
- source project name becomes external architecture study in docs only
- route-era terms become domain terms such as runtime, session, provider, tool, event, resource, extension, policy

Do not rename public compatibility exports unless safe and tested.

If a public name must remain for compatibility, isolate it in a compatibility surface and document why.

### 3. File name cleanup

If any product file name contains external source names or learning-origin words, rename it.

Do not rename files in docs/build-infrastructure unless the name itself is misleading for current docs.

Do not rename files in committed history or external repo.

### 4. Test cleanup

Tests should assert local product vocabulary, not external origin vocabulary.

If tests exist only to prove historical docs, leave them if they are not product tests.

### 5. Package script cleanup

Package scripts must not use external source names or temporary route-era names for product gates.

Historical route or evidence scripts may remain only if they are already classified as history and not product gates.

## Constraints

Hard rules:

- no feature implementation
- no behavior change except naming and report-safe wording
- no provider behavior change
- no tool behavior change
- no session schema migration
- no runtime rewrite
- no package script feature expansion
- no new dependencies
- no compatibility shim growth
- no deletion of historical docs just to hide learning history
- no weakening tests
- no broad rebaseline

## Validation

Required:

- focused tests for renamed product modules if imports changed
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Run npm run verify:result-contract if result or terminal wording is touched.

Run targeted search after cleanup to prove disallowed terms remain only in allowed documentation or compatibility exceptions.

Do not claim validation passed unless actually run.

## Completion criteria

COMPLETE requires:

- audit document created or updated
- disallowed product occurrences found and cleaned or documented as compatibility exceptions
- no external source names remain in product file names
- no learning-origin vocabulary remains in product runtime surfaces
- route-era names remain only in allowed historical or compatibility locations
- build passes
- focused tests pass if imports changed
- diff check passes
- status reported
- no feature behavior changed

If cleanup requires risky public API rename, leave it documented as deferred instead of breaking compatibility.

## Final report

Include:

1. Final status
2. Serena or search summary
3. Audit document path
4. Product files renamed or edited
5. Terms removed from product surfaces
6. Terms left only in allowed docs
7. Compatibility exceptions
8. Validation pass or fail
9. Files changed
10. Remaining risks
11. Recommended next route

## Next route

After this cleanup is complete, continue with:

docs/build-infrastructure/route/route-bi013-tool-hook-permission-interception.md

The previous tool hook route should be renumbered or created as BI013 so BI012 remains this cleanup route.
