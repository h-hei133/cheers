# Core Harness Ownership

This directory is a dev/eval harness surface for browser, CLI, agent-scenario,
transaction, replay, cache, and Playwright-adjacent scenario checks.

It is not a product runtime ownership boundary and it is not route-history
truth. Product code should not add new behavior here. New runtime behavior
belongs in the owning product domain first, with harness scenarios importing
that public surface for evidence.

Current compatibility status:

- Existing tests and fixtures stay in place to preserve route-era provenance
  and focused browser transaction gates.
- Route labels, `Mvp`, `gauntlet`, and `closeout` names in this directory are
  evidence provenance labels unless a later migration replaces them with
  compatibility shims.
- `browserPublicReadOnlyWebSmokeConfig.ts` is consumed by CLI smoke command
  wiring and remains default-safe; it must not introduce provider, public-web,
  auth-session, page-persistence, or write defaults.
- Active product truthfulness is still decided by evidence/result/verdict
  surfaces, not by historical harness reports.

Safe cleanup rule: split or move a subfamily only after focused tests and old
import paths are preserved. Do not bulk-move this directory as one artifact
family.
