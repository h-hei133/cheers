# Product Architecture Reset Charter

Route229 pauses feature development to plan a structural reset. This is a
planning route only: it does not move source files, rename files, change product
behavior, add provider calls, run live provider gates, add route verifiers, or
create another capability report.

## Why Feature Development Is Paused

The current repository contains real coding-agent capability, but the product
shape is hard to see because it grew through route-by-route proof work. Current
inspection found:

- 120 root package scripts, including 82 `verify:*` scripts and 32
  `verify:route*` scripts.
- 30 top-level `scripts/route*` runners mixed with setup, release, verifier,
  real-provider, and evidence inspection scripts.
- 236 `docs/agent-routes/route*.md` route documents, 83 `docs/design/*.md`
  design/history documents, and 48 files under `docs/implementation-context/`.
- Route evidence and release-candidate reports under
  `docs/implementation-context/`, including Route227 and Route228 JSON reports.
- Product source, tests, route-era manifests, harness files, browser fixtures,
  and proof surfaces in the same `packages/ts-shell/src` tree.
- Large concentration files: `runMvpIntegratedFlow.ts` is about 10.7k lines,
  `SessionManager.ts` about 2.6k lines, `cli.tsx` about 831 lines, and the
  `packages/ts-shell/src` tree totals about 285k lines of TS/TSX.

Continuing feature routes before separating product runtime from development
proof infrastructure would make the next feature harder to trust, test, and
explain.

## Product Vs Route Distinction

Product runtime means code that should exist in the installed coding-agent
product path:

- CLI entry and command parsing.
- Session lifecycle, transcript, compact, continue, replay, and persistence.
- Agent loop, planning, provider proposal, edit, verification, repair, result
  mapping, tool execution, browser/MCP boundaries, and runtime receipts.
- Rust execution-plane command execution, timeout, cancel, and sandbox
  preflight.
- Shared contracts across TypeScript, Rust, and any eval consumers.

Route-era material means code, scripts, reports, and documents whose primary
purpose was to prove a route, freeze evidence, or preserve development history.
Some route-era material remains valuable, but it should not define the product
surface by name or location.

## What The Reset Should Achieve

The reset should produce a target structure where:

- Product runtime code is physically discoverable without reading route history.
- Dev/eval/verifier infrastructure is separate from product runtime.
- Evidence, claims, verdicts, receipts, and reports are first-class product
  concepts, not only route report fields.
- CLI/session presentation consumes truthful result projections instead of
  owning capability semantics.
- Provider/proposal, edit, verification, repair, tool, browser, MCP, session,
  and runtime boundaries have clear owners and public APIs.
- Package scripts distinguish product commands, release gates, route-history
  commands, and opt-in real-provider gates.
- Historical route artifacts remain available but are quarantined from default
  architecture discovery.

## What Must Not Change Yet

The reset plan must preserve these constraints:

- No product behavior change during Route229.
- No production default write.
- No provider calls and no live-provider validation.
- No broad feature expansion such as fuzzy apply, rollback, default live
  provider, external-live MCP/browser readiness, or multi-file live provider
  mutation.
- No move of TypeScript control-plane responsibilities into Rust or Python eval.
- No deletion or archiving of historical artifacts during this planning route.

## Proof-Carrying Innovation To Preserve

The route-grown system introduced important safety patterns that should survive
the cleanup:

- Explicit evidence levels and negative controls.
- Separation of default-safe, product-proven, selected-workspace-proven, and
  live-provider-proven claims.
- No false success when apply or verification did not run.
- Redaction of raw provider output and private provider details.
- Workspace authority, final stale-read, and post-write verification for writes.
- Frozen tasks and anti-false-success report gates.
- Honest PARTIAL / COMPLETE / NOT-PROVEN classification in Route227/228 reports.

The reset should move these ideas into product-owned evidence/verdict modules
instead of leaving them scattered across route reports and runners.

## Planning Success Criteria

Route229 is complete when:

- `docs/product-architecture-reset/00-10` exists.
- The documents are based on current code, docs, scripts, reports, and selected
  reference structures, not on the old module atlas alone.
- Route-grown artifacts, naming/public surface, product-vs-dev separation,
  dependency direction, evidence/verdict architecture, docs/script/package
  cleanup, and phased migration are explicitly addressed.
- No product code, scripts, package scripts, or provider behavior changed.
- Required planning-route validation passes: `git diff --check`,
  `git status --short --branch`, and path existence checks.
