# PTY Dependency Decision

Checkpoint: `E. Dependency decision checkpoint`

Decision: do not add `node-pty` or any equivalent PTY dependency in this route state.

## Rationale

The current repository state has a test-only PTY capability detector that defaults to `dependency-unavailable` until an explicit PTY strategy and probe are approved. That is enough to prevent pipe-spawn smoke from being reported as true PTY coverage.

Adding a native PTY dependency now would expand the route beyond its approved risk boundary:

- Windows native support and Node ABI compatibility have not been approved.
- CI support cannot be inferred from this checkout.
- The current Windows Codex environment repeatedly needs elevated reruns for build/test spawn or dist writes, so native PTY probing must remain separately attributable.
- No user approval has been given to modify package manifests or lockfiles.

## Approved Strategy

No true PTY strategy is approved yet.

The detector may continue to return:

```text
dependency-unavailable
```

for default calls without an approved strategy/probe.

## Blocked Work

The following work remains blocked until explicit dependency / strategy approval:

- Minimal true PTY harness prototype.
- True PTY startup readiness smoke.
- True PTY approval prompt smoke.
- True PTY interrupt attribution smoke.

## Safety Boundary

- Do not add `node-pty` or another PTY dependency to `package.json` or lockfiles without explicit approval.
- Do not use pipe-spawn fallback as PTY evidence.
- Do not read, write, copy, clean, or print `D:\Test\home-sf`.
- Do not change production CLI behavior to fake TTY capability.
- Do not run real-provider smoke or `verify-real-user-capabilities`.
