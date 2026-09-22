# PTY Capability Detector Design

This note designs the future PTY capability detector contract. It is not imported by tests or production code.

## Goal

Provide a small test-only helper that decides whether a true PTY smoke may run in the current environment, without falling back to the pipe-spawn CLI harness and without changing production CLI behavior.

The detector exists to protect evidence quality:

- Pipe-spawn helpers may continue to prove stdin/stdout behavior.
- PTY smokes may run only when true PTY capability is available.
- A skipped PTY smoke is not a pass and must not be reported as true TTY coverage.

## Proposed Location

```text
packages/ts-shell/src/test-utils/ptyCapabilityDetector.ts
```

The helper must remain test-only. Production modules such as `entrypoints/cli.tsx`, `session/SessionManager.ts`, and `turn/session.ts` must not import it.

## Proposed API

```ts
export type PtyCapabilityStatus =
  | {
      available: true;
      strategy: "node-pty" | "external-pty-probe";
      details: string;
    }
  | {
      available: false;
      reason:
        | "dependency-unavailable"
        | "environment-unsupported"
        | "sandbox-spawn-blocked"
        | "sandbox-filesystem-blocked"
        | "manual-tty-only"
        | "unknown";
      details: string;
    };

export async function detectPtyCapability(): Promise<PtyCapabilityStatus>;
```

Future tests should branch on `available`:

- `available: true`: run the PTY smoke and assert true PTY behavior.
- `available: false`: skip or mark deferred with the exact `reason` and `details`.

## Detection Order

1. Check whether an approved PTY strategy exists.
   - If no dependency strategy has been approved, return `dependency-unavailable`.
   - Do not dynamically install dependencies.
2. If `node-pty` or an equivalent dependency is approved later, import/probe it from a test-only helper.
   - Import failure maps to `dependency-unavailable`.
   - Native spawn failure maps to `sandbox-spawn-blocked` or `environment-unsupported`.
3. If an external script-level PTY probe is approved later, run only that probe.
   - Probe filesystem failures map to `sandbox-filesystem-blocked`.
   - Platform mismatch maps to `environment-unsupported`.
4. Manual inherited TTY runners are not automated evidence.
   - If only `scripts/live-interactive-runner.mjs` is available, return `manual-tty-only`.

## Skip Contract

PTY tests must not silently pass when unavailable. A skipped test message should include:

- the literal phrase `true PTY unavailable`;
- the detector `reason`;
- a short `details` string;
- confirmation that pipe-spawn coverage is not being used as a PTY fallback.

Example:

```text
true PTY unavailable: dependency-unavailable. node-pty is not approved or installed; pipe-spawn coverage is not true PTY coverage.
```

## Safety Rules

- Do not read, write, copy, clean, or print `D:\Test\home-sf`.
- Use only synthetic/test home or a temporary test home.
- Do not run real-provider smoke or `verify-real-user-capabilities`.
- Do not execute dangerous commands.
- Always use a timeout and cleanup for spawned processes.
- Do not expose a fake production `FORCE_TTY` override.
- Do not mutate dependency manifests or lockfiles from the detector implementation checkpoint.

## Result Attribution

Detector failures should map to one of these buckets before any product failure is claimed:

- `dependency-unavailable`: no approved PTY dependency/probe exists.
- `environment-unsupported`: platform or runtime cannot support the chosen strategy.
- `sandbox-spawn-blocked`: process/native spawn was blocked, for example `EPERM`.
- `sandbox-filesystem-blocked`: required temporary probe filesystem writes were blocked.
- `manual-tty-only`: only a manual inherited TTY runner exists.
- `unknown`: unexpected detector failure; stop the PTY checkpoint and investigate rather than falling back to pipe-spawn.

## Non-Goals

- No `node-pty` dependency is approved by this design note.
- No true PTY harness is implemented by this design note.
- No production CLI behavior changes are proposed.
- No pipe-spawn smoke should be renamed as PTY coverage.
