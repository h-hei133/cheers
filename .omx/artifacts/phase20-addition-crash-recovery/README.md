# A hard-killed session can be continued again

A process killed without a clean shutdown leaves the session `active`: the prompt barrier wrote that status and only a graceful interrupt writes `interrupted`. `evaluateSessionResumeEligibility` refused anything that was not `interrupted` or `error`, so `/continue` and the recovery-hint selectors turned away the session bootstrap had just adopted as unfinished work.

## What was measured

A session with a persisted prompt and an unanswered `tool.started`, never marked interrupted:

| Before | After |
|---|---|
| status `active`, `pendingTools: ["call-live"]`, unfinished `true` | same |
| `recoverable: false`, "Session is not in interrupted/error state" | `recoverable: true`, `fully-resumable` |

An `active` session with no unfinished evidence is still refused, with its own message. The new branch reads the same evidence signals the `interrupted` branch does; it does not widen what counts as evidence.

## Why this matters

Process death is the ordinary interruption in this environment (the repository's own notes describe OOM kills). It was also the one case `/continue` refused.

Build `f5ad32ed83e9`. No subagent ran tests or builds for this batch.
