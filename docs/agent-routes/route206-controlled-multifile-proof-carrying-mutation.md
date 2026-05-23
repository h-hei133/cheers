# Route 206: Controlled Multi-file Proof-carrying Mutation

## Goal

Extend the existing proof-carrying mutation runtime from one bounded target to small controlled multi-file mutation.

Current baseline:

- Route203 proved live provider to exact-ready proposal to trusted controlled apply to readback verification.
- Route204 introduced Claim Ledger v1 and false-success gates.
- Route205 introduced verification-driven repair proof chain and verified-success-with-repair.
- Route205 closeout added the named repair verifier surface.

Route206 must make this substrate handle two-file or small multi-file exact anchored mutation with per-file evidence.

This route is intentionally aggressive. It should produce one larger vertical slice:

multi-file provider proposal
-> per-file proposal validation
-> per-file anchor quality
-> per-file authority
-> ordered apply journal
-> per-file readback verification
-> partial failure truthful terminal
-> repair/recovery handoff
-> Claim Ledger multi-file terminal verdict
-> named Route206 verifier surface

This is not broad refactor support. It is controlled multi-file exact mutation with proof.

## Required subagent workflow

Use parallel subagents before editing.

The main Codex thread must not do broad repo reading. Let subagents inspect seams and return short reports, then edit.

Run 3 pre-edit subagents:

1. Multi-file apply seam subagent
   Find the safest existing path for exactly-two-file or small multi-file exact apply. Focus on target-set, hunk-set, workspace write route, stale-read, snapshot, and partial failure behavior.

2. Claim Ledger and result subagent
   Find how to extend Claim Ledger from single mutation claim to per-file mutation claims and a multi-file terminal verdict. Focus on not allowing one verified file to hide another failed or unverified file.

3. Verification and repair handoff subagent
   Find how per-file readback verification and Route205 repair chain should work when one file fails, one file succeeds, or verification is mixed.

After editing, run 2 review subagents:

1. Evidence and safety review
   Check per-file claims are runtime-derived, not marker-derived. Check no new writer, no fuzzy apply, no production workspace mutation, no provider call during apply, and no success with partial or unverified files.

2. Regression review
   Check default, focused multi-file success, partial failure, verification missing, repair handoff, Claim Ledger, named verifier, build, diff, and status.

Final report must include a short Subagent findings section.

## Reference scan

Reference pool:

- /home/wang/projects/source-claudecode
- /home/wang/projects/opencode
- /home/wang/projects/gemini-cli
- /home/wang/projects/OpenHands
- /home/wang/projects/inspect_ai
- /home/wang/projects/mini-swe-agent
- /home/wang/projects/pi
- /home/wang/projects/GitNexus

Use references only when useful.

Primary reference budget:

- source-claudecode, opencode, gemini-cli
- max 5 files per primary repo

Secondary repos:

- OpenHands, inspect_ai, mini-swe-agent, pi, GitNexus
- use only if directly useful for multi-file result surfaces, repair loops, scorecards, eval harness, or code graph impact

Do not turn reference scan into architecture research.

## Owner modules

Primary:

- Edit / Patch
- Proposal Anchoring
- Verification / Runtime
- Claim Ledger
- Result Surface
- Harness / Eval
- Repair Chain

Collaborating:

- Workspace / File Context
- Session / Continue
- Permission / Policy
- Provider Smoke / Task Loop

Avoid broad work in:

- runMvpIntegratedFlow.ts
- cli.tsx
- SessionManager.ts
- Browser
- MCP
- package/dependency setup

## Implementation target

Route206 should support at least these controlled cases:

1. Two-file exact success
   Both files have exact-ready anchors, authority, apply success, readback verification success, and ledger terminal verified-success.

2. Two-file partial apply failure
   First file changed, second file failed or was not attempted. Terminal must be stopped or partial, never success. Changed, failed, and unattempted files must remain visible.

3. Two-file verification mixed result
   Apply succeeds for both files, but one file verification fails or is missing. Terminal must not success. Repair or recovery handoff must preserve original evidence.

4. Multi-file repair handoff
   A failed or mixed verification case can produce repair proposal evidence, but repair proposal alone cannot success. Repair apply and re-verification must remain separate claims.

5. False-success guards
   A single successful file cannot upgrade the whole task. Snapshot available cannot mean rollback executed. Recovery available cannot mean repair applied. Focused tests cannot be live evidence.

## Claim Ledger requirements

Extend Claim Ledger to express per-file claims.

Each target file should be able to carry:

- target identity
- proposal status
- anchor quality
- authority status
- apply status
- verification status
- changed or failed or unattempted status
- snapshot or recovery status
- repair status if applicable

The multi-file terminal verdict must be derived from all file claims.

Verified success requires all required files to be applied and verified.

Partial, failed, unattempted, unverified, unsupported, fake, or not-proven files must prevent verified-success.

If repair succeeds, final verdict may be verified-success-with-repair, but original failure evidence must remain visible.

## Implementation tasks

1. Audit existing exact multi-file or target-set apply path.

2. Choose the smallest controlled multi-file seam. Prefer existing target-set or hunk-set infrastructure. Do not create a new writer.

3. Add per-file apply journal evidence.

4. Add per-file readback verification evidence.

5. Extend Claim Ledger projection for multi-file claims and aggregate verdict.

6. Add partial failure and mixed verification false-success gates.

7. Add repair/recovery handoff for multi-file failures without hiding original failure.

8. Add or update scorecard/result/session surfaces so changed, failed, unattempted, verified, unverified, repair, and recovery states are visible.

9. Add named Route206 verifier surface.

Suggested names:

- scripts/verify-route206-controlled-multifile-proof-chain.mjs
- npm script verify:route206-controlled-multifile-proof-chain

The named verifier should cover success, partial failure, mixed verification, and repair handoff.

## Boundaries

Keep these hard:

- no new writer
- no fuzzy direct apply
- no broad arbitrary refactor
- no AST edit
- no production workspace mutation by default
- no provider call during apply
- no terminal success outside Claim Ledger
- no repair proposal counted as repair applied
- no recovery available counted as rollback executed
- no fake or focused evidence labeled as live success
- no broad CLI, browser, MCP, dependency, or package churn unless required only for the named verifier script

## Acceptance criteria

Route206 is complete only if the named verifier proves:

- two-file exact success becomes ledger-derived verified-success
- partial apply cannot success
- mixed verification cannot success
- per-file changed, failed, unattempted, verified, and unverified states are visible
- repair handoff preserves original failure
- repair proposal alone cannot success
- recovery available alone cannot success
- no provider call during apply
- no production workspace mutation
- fake/focused/default-safe evidence cannot be labeled live success

## Validation

Run:

- focused multi-file apply tests
- focused Claim Ledger multi-file tests
- focused verification/readback tests
- focused repair handoff tests
- rtk node scripts/verify-route206-controlled-multifile-proof-chain.mjs
- rtk npm run verify:route206-controlled-multifile-proof-chain
- rtk npm run verify:route205-repair-proof-chain
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Real provider gates are optional for this route unless existing local config is already available. If unavailable, report not-run. Do not fake live evidence.

## Final report

Do not paste full stdout.

Include:

1. Subagent findings
2. Multi-file seam chosen
3. Claim Ledger changes
4. Per-file evidence shape
5. Success case result
6. Partial failure result
7. Mixed verification result
8. Repair/recovery handoff
9. Named verifier result
10. Commands run with pass/fail and key fields
11. Files changed
12. Remaining risks
13. Next route recommendation
