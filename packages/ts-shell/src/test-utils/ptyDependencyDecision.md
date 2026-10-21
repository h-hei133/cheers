# PTY Dependency Decision

Checkpoint: `E. Dependency decision checkpoint`

Decision: do not add `node-pty` or any equivalent native PTY dependency. Linux
uses the installed `script` utility as an external PTY probe for the real CLI
smoke; line and print-batch runs remain separate non-TTY surfaces.

## Rationale

The current repository state has a test-only PTY capability detector that
defaults to `dependency-unavailable` until an explicit strategy and probe are
supplied. That remains the correct default: pipe-spawn output is not evidence
that the interactive terminal path ran.

Adding a native PTY dependency would expand the risk boundary:

- Windows native support and Node ABI compatibility have not been approved.
- CI support cannot be inferred from this checkout.
- The current Windows Codex environment repeatedly needs elevated reruns for
  build/test spawn or dist writes, so native PTY probing must remain separately
  attributable.
- The Linux external probe already exercises a real PTY without modifying
  package manifests or lockfiles.

## Approved Strategy

On Linux, `scripts/qa-pty-smoke.mjs` may use `script -qec` to allocate a real
PTY for the packaged CLI and executable. It must keep the child environment
isolated with `scripts/qa-pty-env.mjs`, wait for the actual first frame and
prompt, exercise the shipped interaction surface, and prove a clean exit.

The detector remains opt-in. Default calls continue to return:

```text
dependency-unavailable
```

unless a caller explicitly supplies an approved strategy and probe. A successful
Linux `script` run does not authorize a Windows or macOS claim.

## Unapproved Work

The following work still requires a separate platform decision:

- Windows and macOS native PTY strategy.
- Real IME composition and system copy behavior.
- Platform-specific interrupt and terminal-capability attribution.

## Safety Boundary

- Do not add `node-pty` or another PTY dependency to `package.json` or lockfiles
  without explicit approval.
- Do not use pipe-spawn fallback as PTY evidence.
- Do not read, write, copy, clean, or print `D:\Test\home-sf`.
- Do not change production CLI behavior to fake TTY capability.
- Do not run real-provider smoke or `verify-real-user-capabilities`.
