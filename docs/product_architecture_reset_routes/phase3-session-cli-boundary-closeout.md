# Phase 3: Session And CLI Boundary Closeout

## Purpose

Clean the next architecture concentration after planning/runtime closeout.

This route combines:

- Session facade slimming
- CLI contract relocation

These must be handled together because CLI/session runtime wiring still depends
on the SessionManager compatibility facade and entrypoints/cli* compatibility
modules.

This is not feature work.
This is not package script cleanup.
This is not route vocabulary cleanup.

## Required Reading

Read before editing:

- docs/product-architecture-reset/finalConcentrationAudit/00-file-size-and-fanin-map.md
- docs/product-architecture-reset/finalConcentrationAudit/01-new-owner-concentration-audit.md
- docs/product-architecture-reset/finalConcentrationAudit/02-import-boundary-audit.md
- docs/product-architecture-reset/finalConcentrationAudit/05-remaining-architecture-debt-register.md
- docs/product-architecture-reset/finalConcentrationAudit/06-final-reset-verdict.md
- docs/product-architecture-reset/finalConcentrationAudit/07-next-implementation-routes.md
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/cli/**
- packages/ts-shell/src/entrypoints/cli*.ts
- packages/ts-shell/src/core/shell/sessionRuntime*
- current session and CLI tests

Use current code as truth.

## Goal

Make SessionManager.ts a real compatibility facade and reduce CLI dependency on
entrypoints compatibility modules.

COMPLETE requires both:

1. SessionManager.ts sheds meaningful implementation responsibility into named
   session owners.
2. CLI reusable contracts move away from entrypoints/cli* compatibility modules
   where safe.

If either side cannot be safely completed, stop and report PARTIAL.

## Core Rule: Destination By Ownership

Do not create vague buckets:

- helper
- helpers
- utils
- misc
- common
- support
- legacy
- mvp

Use real owner modules:

- session/store/
- session/transcript/
- session/recovery/
- session/replay/
- session/continuation/
- session/approval/
- session/presentation/
- session/schema/
- cli/options/
- cli/runtime/
- cli/commands/
- cli/output/
- cli/approval/
- cli/session/
- result/
- evidence/

SessionManager may remain the public facade, but it must not own store,
transcript, replay, recovery, approval memory, presentation, or summary logic.

CLI entrypoints may remain executable/compatibility surfaces, but reusable CLI
contracts must not live there long-term.

## Phase A: Ownership Audit Before Edits

Before editing, produce an in-thread table:

- symbol/region
- current responsibility
- real owner domain
- target file
- why not SessionManager/entrypoints
- compatibility strategy
- tests
- stop risk

No edits before this table exists.

## Phase B: SessionManager Slimming

Move at least two meaningful responsibility families out of SessionManager.ts.

Candidate families, subject to audit:

- durable store layout and file IO
- transcript append/read/repair
- recovery eligibility
- replay plan/read-model assembly
- runtime seed construction
- continuity projection
- approval audit memory
- presentation-adjacent summaries
- session schema/default state projection

Expected destinations:

- session/store/
- session/transcript/
- session/recovery/
- session/replay/
- session/continuation/
- session/approval/
- session/presentation/
- session/schema/

Must preserve:

- public SessionManager constructor and public methods
- current session selection semantics
- session persistence/durability
- replay behavior
- continuity facts
- approval/audit truthfulness
- session/result parity

## Phase C: CLI Contract Relocation

Reduce cli/* imports from entrypoints/cli* compatibility modules.

Candidate moves, subject to audit:

- CliOptions and related reusable option contracts
- CLI runtime invocation contracts
- approval mode state contracts
- session command contracts
- print/interactive mode contracts
- startup/bootstrap context contracts

Expected destinations:

- cli/options/
- cli/runtime/
- cli/approval/
- cli/session/
- cli/commands/
- cli/output/

Must preserve:

- entrypoints/cli.tsx executable shim behavior
- existing command line flags
- print mode and interactive mode behavior
- approval behavior
- session runtime behavior
- old imports through compatibility re-exports if needed

## Strict Non-Goals

Do not add features.

Do not run live provider.

Do not change provider defaults.

Do not change session schema unless a written compatibility adapter is included.

Do not change CLI flag behavior.

Do not change CLI output truthfulness.

Do not change package scripts.

Do not move route docs/reports.

Do not weaken result/evidence truthfulness.

Do not convert partial/stopped/blocked/not-run/not-proven into success.

Do not touch planning/runtime closeout unless a moved session/CLI import requires it.

## Validation

Required:

- focused SessionManager tests
- session recovery/replay/continuation tests
- session durability tests if store/transcript code moves
- CLI session tests if CLI/session wiring moves
- verify:product:cli-entry
- npm run verify:result-contract
- npm run build -w packages/ts-shell
- import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Run if touched:

- approval tests if approval memory moves
- session result parity tests if presentation/result facts move
- CLI interactive/print tests if command contracts move
- Route221 gate if evidence/result semantics are touched

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- ownership audit table completed before edits
- at least two meaningful SessionManager responsibility families moved
- reusable CLI contracts no longer primarily live under entrypoints/cli*
  where this route touches them
- compatibility exports/shims preserve old imports
- SessionManager.ts is visibly slimmer and closer to public facade
- cli/* dependency direction is visibly improved
- focused tests and build pass
- verify:product:cli-entry passes
- no session/CLI truthfulness drift
- remaining session/CLI debt listed

PARTIAL if:

- only session or only CLI side is cleaned
- only comments/docs change
- tests fail
- behavior compatibility is uncertain
- code moves into vague buckets

BLOCKED if:

- safe cleanup requires a session schema migration
- public CLI flag compatibility cannot be preserved
- session persistence semantics would change
- truthfulness would weaken

## Serena Policy

Use Serena if available for:

- symbol overview
- find references
- ownership clustering
- impact analysis for SessionManager and entrypoints/cli* symbols

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip and
continue.

## Commit

Commit if green.

Suggested prefix:

phase3-session-cli:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Session families moved
4. CLI contracts moved
5. Compatibility shims/exports
6. Product behavior changed yes/no
7. Truthfulness impact
8. Validation results
9. Serena usage
10. Remaining session/CLI debt
11. Commit hash if committed
12. Whether next route should be edit/evidence or script/harness cleanup
