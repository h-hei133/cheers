# Real Provider Coding Flow Smoke Design

This document defines the explicit opt-in `--real-coding-flow-smoke`.
It is not a default gate and is not run by default checkpoints. The minimal isolated single-file write route has passed with a real provider: the smoke changed only `note.txt` from `status: draft` to `status: ready`, kept `README.md` and `LOCKED.md` unchanged, reported `changedFiles=["note.txt"]`, showed terminal result and verification details, kept the real repository clean, used isolated runtime/audit/report/fixture locations, and passed redaction.

## Boundary

- The smoke creates a temporary fixture workspace under `CHEERS_TEST_ROOT` or the platform test root.
- The real target repository is never used as the mutation workspace.
- The fixture contains `note.txt`, `README.md`, and `LOCKED.md`.
- The only allowed mutation is changing `note.txt` from `status: draft` to `status: ready`.
- `README.md` and `LOCKED.md` are protected.
- Real-provider config is sourced only through explicit `CHEERS_REAL_HOME` on Linux/WSL or the Windows default home.
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
    - runtime summary: isolated runtime home kind, whether `.cheers`/session artifacts were created under that isolated home, and `realProviderHomeUsedForRuntime=false`.
    - audit isolation summary: `auditLogKind`, `repoAuditResidueDetected`, `auditResidueCleaned`, and `auditLogCreated`.
    - mutation summary: `taskKind`, `actionSequence`, `targetFile`, `mutationInstructionPresent`, `replaceFromPresent`, `replaceToPresent`, `replaceFieldSource`, `diagnosticSource`, `patchFailureCode`, `failedFileReason`, and a redacted model text tail. Successful structured edit results must not be reported as missing replacement fields merely because no literal replace fields were emitted; the diagnostics must distinguish structured success from redacted output fallback.
    - classification summary: `failureStage`, `failureCategory`, `statusDetail`, and `nextAction`.
14. Clean the fixture and isolated runtime home unless the caller explicitly asks to keep test artifacts.

## Failure Follow-up Context Guard

The non-real `--real-coding-flow-followup-context-self-test` covers safe follow-up context construction for stopped/failure outcomes. It includes a `patch-from-not-found` / `mutation instruction missing` scenario with `note.txt` as the target/failed file, no changed files, blocked verification, protected-file constraints, a redacted user follow-up prompt, and a safe `DoNext`. Sensitive provider details injected into the synthetic failure reason or follow-up prompt must be reduced to redacted labels; raw API keys, tokens, Authorization header values, provider config paths, and real-provider home paths must not survive in the context.

The actual-provider follow-up smoke is a separate explicit opt-in flag:
`--real-coding-flow-followup-smoke`. A non-provider companion,
`--real-coding-flow-followup-smoke-dry-run`, validates the prompt/context and
assertion shapes without reading real-provider config or running a model.

The opt-in follow-up smoke has passed with a real provider. Sealed evidence:
`followupExecutionPath=direct-provider-explanation`,
`enteredEditTargetResolution=false`, `ambiguousTargetDetected=false`,
`responseVisible=true`, `acknowledgesTarget=true`,
`acknowledgesFailure=true`, `safeNextAction=true`, `claimsSuccess=false`,
`fixtureMutationLeak=false`, `repositoryClean=true`, audit isolated, and
redaction passed.

The opt-in follow-up smoke:

- reuses `buildCodingFlowFailureFollowupContext()` with a synthetic
  `patch-from-not-found` / `mutation instruction missing` failure report;
- does not create, resume, or mutate a durable stopped session;
- uses an isolated fixture project, isolated runtime `HOME`/`USERPROFILE`, and
  an isolated audit log path;
- uses the direct provider explanation path, not the CLI `--print` coding
  orchestration path, because this smoke validates provider understanding of
  failure context rather than edit execution;
- uses an explain-only, non-mutating prompt: the provider is asked to explain
  the stopped failure and describe a safe human-authorized recovery shape, not
  to perform recovery in the current turn;
- explicitly tells the provider not to inspect, modify, create, remove, or
  write files, not to treat `DoNext`/recovery labels as work to perform now,
  and not to claim the task has already succeeded;
- reports routing diagnostics: `followupExecutionPath`,
  `followupPromptIntent`, `nonMutatingFollowup`,
  `enteredEditTargetResolution`, and
  `ambiguousTargetDetected`;
- fails if the fixture changes, the repository becomes dirty, redaction leaks,
  the response is missing, the response ignores the target/failure context, no
  safe next action is present, the response incorrectly claims completion, or
  the follow-up is routed into edit target resolution.

This follow-up smoke is not a default gate. It validates provider
understanding of failure context only; it is not automatic recovery, edit repair,
or stopped-session auto-resume. It must not change stopped durable session
auto-recovery semantics.

## Audit Isolation Guard

Runtime homes and output artifacts must remain isolated under the configured
test root. The former in-process sandbox audit writer has been removed;
`CHEERS_AUDIT_LOG_PATH` is no longer a product audit routing contract. Permission
decisions and session evidence use the active approval and event owners.

## Repo-Aware Routing Guard

The real coding flow fixture prompt is an explicit single-file mutation task.
It must use the supported single-file replace contract shape
`In note.txt, replace "status: draft" with "status: ready".` so the
orchestration layer can extract both replace-from and replace-to text before
entering the patch lane.
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
- No production multi-file edit maturity claim.
- No long-session continuity or true PTY maturity claim.
- No CLI/session/orchestration giant-file changes.
