# AR001 Integrated Runtime Capability Slice

## Goal

Move from narrow fact-chain increments to an integrated product capability pass.

The goal is to inspect the current target implementation and one mature local exemplar plus its public documentation, then produce and implement one small vertical slice that advances the real coding-agent runtime path.

This task is not another packet, replay, surface, or readiness-only increment. It must connect product behavior across existing owner domains while preserving truthfulness.

## Why This Task Exists

Recent work completed a verification and repair readiness chain:

verification failed
-> repair required
-> repair proposal
-> explicit authority
-> repair apply
-> post-repair verification
-> result-owned verdict

That made the evidence chain safer, but the project now needs faster movement toward an integrated agent runtime. The next improvement should be selected by comparing the current target runtime against a complete working agent harness capability surface, then implementing one high-value vertical slice in this repository.

## Required Capability Survey

First inspect the target repository. Then inspect the local exemplar implementation and public documentation only for targeted comparison.

Map the following capability areas:

- interactive CLI and command flow
- session lifecycle, resume, branch, and continuation
- compaction or context reduction
- model/provider boundary
- tool call loop and tool result handling
- event stream or JSON mode
- extension or plugin boundary
- prompt or skill-like reusable capability boundary
- terminal presentation and product surface
- verification, repair, and result truthfulness
- package or distribution boundary if relevant

The survey must identify:

- what the target already has
- what is missing
- what should not be copied because ownership boundaries differ
- the best next vertical slice
- why that slice improves real user-facing behavior more than another local fact projection

Do not create permanent comparison documents unless needed for the implementation. Prefer final reporting over new process artifacts.

## Vertical Slice Requirement

Implement exactly one focused vertical slice selected from the survey.

Good candidates include:

- session continuation driving a real next-turn loop decision
- JSON event stream carrying a real behavior decision, not just observation facts
- compacted context handoff into a next model turn
- tool result observation becoming a runtime next action
- repair readiness driving an actual controlled repair request boundary
- extension-like registration seam for internal tools without dynamic external loading
- CLI-visible integrated status that preserves evidence truth

The slice must cross at least two rightful owner domains, but it must stay small enough to validate with focused tests.

## Ownership Rules

Use current owner domains in this repository.

Likely owners include:

- runtime
- session
- context
- planning
- provider
- tools
- evidence
- result
- policy
- verification
- repair
- presentation

Do not place new behavior in compatibility shims or broad legacy coordination files unless they only delegate.

Do not create product file names or product content containing process-history wording, comparison wording, outside project names, or external-project vocabulary. Use domain language only.

## Truthfulness Rules

Evidence/result remains the owner of terminal truth.

Do not infer success from:

- model output
- provider call
- tool call attempt
- session carry-forward
- event emission
- presentation rendering
- repair proposal
- repair authority
- repair apply without post-repair verification
- compacted summary
- extension registration

Skipped, blocked, failed, partial, unknown, and not-proven states must remain visible.

## External Inspection Limits

The local exemplar and public docs are read-only.

Use them only after inspecting the target implementation.

Use them to understand capability shape, lifecycle seams, and product ergonomics. Do not copy code, type names, file names, runtime fields, user-visible wording, or architecture wholesale.

If the target repository already has an owner module for a responsibility, preserve the target owner.

## Tooling Requirements

Use semantic MCP navigation for focused owner discovery, symbol references, and diagnostics before broad text search.

Use parallel subagents where useful:

- one for current target ownership and existing seams
- one for local exemplar capability shape
- one for test and validation surface
- one for truthfulness and boundary risks

Use the spec decomposition plugin only as planning discipline. Do not start a full project workflow, progress tracker, issue or milestone flow, archive, or extra process docs.

## Forbidden Work

Do not:

- implement a full autonomous agent in one task
- add dynamic external plugin loading
- add browser or MCP external tool behavior
- add SDK or RPC unless selected as the single slice
- add real provider calls
- read provider secrets
- broaden command allowlists
- add new writer behavior unless explicitly required by the selected slice
- weaken tests
- mass-rebaseline snapshots
- move terminal truth out of evidence/result
- add business logic to compatibility shims

## Validation

Run focused validation matching touched files.

Expected validation may include:

- runtime loop tests
- session continuation or replay tests
- event stream tests
- tool result tests
- policy tests
- verification or repair tests
- presentation tests if rendering changed
- build for packages/ts-shell when imports, contracts, or runtime-facing ownership changed
- git diff --check
- git diff --cached --check

Do not run live provider tests.

Classify any failing validation before changing implementation or tests.

## Final Report

Report:

- target owner domains inspected
- local exemplar areas inspected
- selected vertical slice and why it was chosen
- files changed
- behavior implemented
- what remains not proven
- why terminal truth still belongs to evidence/result
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit the change. After commit, one push attempt is allowed. If push fails, do not retry.
