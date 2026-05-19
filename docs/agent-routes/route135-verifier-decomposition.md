# Route 135: Verifier decomposition

## Goal

Decompose `scripts/verify-real-user-capabilities.mjs` into a maintainable Harness Engineering module boundary without changing verifier behavior.

Route 131 established the new architecture governance model:

- modules are responsibility boundaries, not folders
- capability lifecycle is the shared contract
- high-risk central files should be handled by ledger -> projection extraction -> behavior-preserving decomposition
- the first practical cleanup target is the real-user capability verifier

Route 135 should turn the verifier from a large mixed-responsibility script into a small orchestration entrypoint plus focused modules.

This route is aggressive in cleanup scope but conservative in behavior.

## Expected outcome

By the end of Route 135:

1. `scripts/verify-real-user-capabilities.mjs` is no longer the place where all verifier responsibilities live.
2. Scenario definitions, command execution, environment probing, result normalization, reporting, residue cleanup, and exit-code logic have clear boundaries.
3. Existing verifier commands behave the same from the outside.
4. Output format remains stable unless an improvement is explicitly covered by tests.
5. Capability lifecycle fields are visible in the verifier model where useful.
6. Browser/edit/session/provider checks are not reimplemented, only reorganized.
7. The route produces a short decomposition report and Route 136/132 recommendation.

## Required Route 131 docs

Read these before changing code:

- `docs/design/reference-architecture-maps.md`
- `docs/design/module-atlas.md`
- `docs/design/capability-contract.md`
- `docs/design/reference-module-matrix.md`
- `docs/design/module-backlog.md`

Use them as architecture constraints, not just background reading.

## Reference scan

Use references only for verifier/harness/report structure.

Primary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`
- `/home/wang/projects/opencode`
- `/home/wang/projects/gemini-cli`

Secondary:

- `/home/wang/projects/OpenHands`
- `/home/wang/projects/source-claudecode`

Budget:

- Inspect AI: max 8 files
- mini-swe-agent: max 6 files
- opencode: max 6 files
- gemini-cli: max 6 files
- OpenHands + ClaudeCode: max 6 files total

Focus:

- task / case / scorer / report separation
- command runner and subprocess result shape
- capability verification output
- trajectory or verification logs
- environment probing
- stable exit-code handling
- concise user-facing reports

Do not read browser/runtime internals unless verifier behavior directly depends on them.

## Files

Keep names short.

Preferred new files:

- `scripts/verify/cases.mjs`
- `scripts/verify/env.mjs`
- `scripts/verify/run.mjs`
- `scripts/verify/result.mjs`
- `scripts/verify/report.mjs`
- `scripts/verify/residue.mjs`
- `scripts/verify/index.mjs`

Existing file:

- `scripts/verify-real-user-capabilities.mjs`

The old entrypoint should remain and delegate to the new verifier modules.

Optional doc:

- `docs/design/verifier-decomposition.md`

Avoid creating a large framework. This is a decomposition, not a new test runner.

## Implementation tasks

### 1. Baseline ledger

Before editing, inspect `scripts/verify-real-user-capabilities.mjs` and write a short responsibility ledger in `docs/design/verifier-decomposition.md`.

Classify current responsibilities:

- CLI argument parsing
- environment probing
- scenario/case definitions
- subprocess command execution
- result normalization
- capability lifecycle mapping
- reporting
- residue detection / cleanup notes
- exit-code decision
- project-specific assumptions

Do not over-document. The goal is to guide extraction.

### 2. Extract scenario definitions

Move verifier case definitions to `scripts/verify/cases.mjs`.

Each case should expose:

- id
- title
- capability area
- command or function to run
- expected outcome
- required environment
- lifecycle tags when useful
- skip/unavailable behavior

Capability areas should align with Route 131 modules where possible:

- browser
- edit/patch
- session/continue
- provider/model
- permission/policy
- result surface
- CLI/UX
- harness

### 3. Extract environment probing

Move environment checks to `scripts/verify/env.mjs`.

It should determine:

- repo root
- package manager assumptions
- Node/npm availability
- RTK availability if used
- Playwright/browser readiness if verifier currently checks it
- provider/model env readiness if verifier currently checks it
- known generated residue paths

Do not introduce new required environment variables.

### 4. Extract command runner

Move subprocess logic to `scripts/verify/run.mjs`.

It should provide:

- command execution
- timeout handling
- stdout/stderr capture
- exit code capture
- concise failure shape
- no shell injection hazards
- stable cwd handling

Keep behavior equivalent to the old script.

### 5. Extract result normalization

Move pass/fail/skip/unavailable/stopped mapping to `scripts/verify/result.mjs`.

Normalize:

- command success
- command failure
- skipped due to env
- unavailable capability
- timeout
- residue found
- unexpected output
- internal verifier error

Where useful, align with capability lifecycle:

- availability
- policy
- execution
- evidence
- result
- cleanup
- redaction

### 6. Extract report rendering

Move user-facing report formatting to `scripts/verify/report.mjs`.

Report should remain compact and stable.

It should include:

- total passed / failed / skipped
- capability area summary
- failed case details
- unavailable reason
- residue notes
- final exit decision

Avoid noisy raw stdout dumps unless failure needs them.

### 7. Extract residue handling

Move generated-file residue detection into `scripts/verify/residue.mjs`.

Must preserve current behavior around:

- `.sisyphus/audit/permissions.jsonl`
- any other known verifier residue
- reporting residue without hiding real diffs

Do not silently delete user changes.

### 8. Add module entrypoint

Add `scripts/verify/index.mjs`.

It should orchestrate:

- load env
- load cases
- run cases
- normalize results
- check residue
- render report
- decide exit code

Then make `scripts/verify-real-user-capabilities.mjs` a thin compatibility entrypoint.

### 9. Tests / validation

If the repo has script tests, add focused tests for the new verifier modules.

If not, add a lightweight focused verification test only if it fits existing patterns.

At minimum, validate by running existing commands that already depend on the verifier.

Required validation:

- existing real-user verifier command
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`
- `rtk git status --short --branch`

If the verifier is used by package scripts, confirm those package scripts still point to the compatibility entrypoint or update them safely.

### 10. Roadmap update

Update `docs/design/edit-capability-roadmap.md` or the module backlog doc with a short Route 135 note.

Mention:

- verifier decomposition result
- behavior preservation status
- capability lifecycle alignment
- next recommended route

Keep it short.

## Boundaries

Hard boundaries:

- no product behavior changes
- no provider/model calls beyond existing verifier behavior
- no new broad test runner
- no package dependency changes unless absolutely necessary
- no browser capability expansion
- no edit/patch capability expansion
- no CLI UX redesign
- no SessionManager or runMvpIntegratedFlow refactor in this route
- no automatic deletion of non-generated user files
- no commit or push

## Validation

Run:

- focused verifier command
- existing closeout verifier
- result-contract verifier
- package build
- diff check
- git status

Run additional focused tests only if touched files require them.

Do not run broad unrelated test suites.

## Final report

Include:

1. What changed
2. Before/after verifier responsibility map
3. New verifier module boundaries
4. Behavior preservation evidence
5. Capability lifecycle alignment
6. Residue handling behavior
7. Validation
8. Remaining risks
9. Next route recommendation
10. Proposed commit message

Do not commit or push.
