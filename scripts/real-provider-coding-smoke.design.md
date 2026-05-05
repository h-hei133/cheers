# Real Provider Coding Flow Smoke Design

This document defines the future explicit opt-in `--real-coding-flow-smoke`.
It is not a default gate and is not run by this checkpoint.

## Boundary

- The smoke creates a temporary fixture workspace under `PRIVATE_AGENTS_TEST_ROOT` or the platform test root.
- The real target repository is never used as the mutation workspace.
- The fixture contains `note.txt`, `README.md`, and `LOCKED.md`.
- The only allowed mutation is changing `note.txt` from `status: draft` to `status: ready`.
- `README.md` and `LOCKED.md` are protected.
- Real-provider config is sourced only through explicit `PRIVATE_AGENTS_REAL_HOME` on Linux/WSL or the Windows default home.
- CLI runtime/session `HOME` and `USERPROFILE` must use an isolated runtime home under the configured test root, never the real-provider home.
- Permission audit logs must be explicitly routed to an isolated audit log path under the configured test root for this smoke. The smoke reports only safe audit isolation labels/booleans, not the audit path.
- Provider config content, keys, headers, and tokens are never printed.

## Smoke Contract

1. Run provider readiness preflight with explicit real home.
2. Capture real repository `git status --short` before the model turn.
3. Create the fixture workspace outside the repository and outside real-provider home.
4. Run one real provider model turn with the fixture as `--project`, isolated runtime `HOME`/`USERPROFILE`, isolated permission audit log path, and explicit real-provider config source.
5. Capture fixture snapshot before and after the turn.
6. Assert `changedFiles` is exactly `note.txt`.
7. Assert protected files are unchanged.
8. Assert `note.txt` contains `status: ready`.
9. Assert terminal result and verification details are visible.
10. Redact provider output and fail if secrets or config paths leak.
11. Capture real repository `git status --short` after the turn and fail if it changed.
12. Failure reports include `repositoryClean`, `terminalResultVisible`, `changedFiles`, `verification`, `redaction`, `failureCategory`, `failureReason`, and `nextAction` when possible.
13. No-op or no-mutation failures include safe diagnostics:
    - routing summary: non-interactive CLI command kind, safe cwd/project kind labels, prompt byte count, prompt intent hint, whether `Repo-aware summary` intercepted the turn, whether the session runtime was entered, and whether result/tool markers were present.
    - process summary: exit code, timeout flag, output byte count, redacted stdout/stderr/combined tails, and output marker booleans.
    - fixture summary: observed/expected changed files, protected changed files, and `note.txt` status as only `draft`, `ready`, `other`, or `missing`.
    - runtime summary: isolated runtime home kind, whether `.private-agents`/session artifacts were created under that isolated home, and `realProviderHomeUsedForRuntime=false`.
    - audit isolation summary: `auditLogKind`, `repoAuditResidueDetected`, `auditResidueCleaned`, and `auditLogCreated`.
    - mutation summary: `taskKind`, `actionSequence`, `targetFile`, `mutationInstructionPresent`, `replaceFromPresent`, `replaceToPresent`, `patchFailureCode`, `failedFileReason`, and a redacted model text tail.
    - classification summary: `failureStage`, `failureCategory`, `statusDetail`, and `nextAction`.
14. Clean the fixture and isolated runtime home unless the caller explicitly asks to keep test artifacts.

## Audit Isolation Guard

The smoke must set `PRIVATE_AGENTS_AUDIT_LOG_PATH` for the child CLI process to
an isolated path under the configured test root. `AuditTrail` path precedence is:
explicit constructor config, then `PRIVATE_AGENTS_AUDIT_LOG_PATH`, then the
legacy `process.cwd()/.sisyphus/audit/permissions.jsonl` default. The override
does not change permission semantics and must fail through the existing audit
write behavior if the path is invalid or unwritable; it must not silently fall
back to the repository path.

## Repo-Aware Routing Guard

The real coding flow fixture prompt is an explicit single-file mutation task.
Repo-aware status/summary shortcuts must not handle prompts with both mutation
intent and an explicit file target such as `note.txt`; those prompts must fall
through to the normal coding flow. Repo status, branch, changes, and summary
prompts without an explicit file mutation target remain on the repo-aware
summary path.

## Target Disambiguation Guard

The fixture may mention protected files such as `README.md` and `LOCKED.md` as
negative constraints. Those mentions are not edit targets. Target resolution
must preserve the raw mentioned files for diagnostics, but protected contexts
such as `do not modify README.md`, `keep LOCKED.md unchanged`, or
`protected files: README.md, LOCKED.md` must not participate in ambiguous edit
target competition. True multi-target edit requests still remain blocked by
the `ambiguous-target` contract.

## Failure Attribution

- `provider-network-inconclusive`: endpoint, DNS, timeout, socket, or TLS failures.
- `config-failure`: missing or invalid explicit real provider home, auth, key, or endpoint config.
- `provider-model-failed`: unavailable model, quota, rate limit, context limit, or unsupported model.
- `fixture setup failure`: fixture creation, git seed, snapshot, or cleanup failure.
- `no-mutation guard failure`: the smoke could not prove repository status remained unchanged.
- `real repo mutation leak`: any target repository diff after the model turn.
- `redaction failure`: output still contains auth/config details after redaction.
- `terminal result missing`: result surface was not visible.
- `changedFiles wrong`: fixture changed files differ from the expected set.
- `verification failed`: expected content or protected-file assertions failed.
- `product runtime regression`: the CLI/toolchain contract failed after provider and fixture causes were ruled out.

## Exit Codes

- `0`: smoke passed.
- `1`: product or smoke contract failure.
- `2`: provider/network inconclusive.
- `3`: provider auth/config failure.

## Non-Goals

- No default gate integration.
- No real repository mutation.
- No full apply-patch, rollback, AST patch, or multi-file edit implementation.
- No provider/auth core changes.
- No CLI/session/orchestration giant-file changes.
