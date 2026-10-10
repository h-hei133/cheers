# Session-owned local jobs

Local shell jobs run through the same execution service, tool approval and sandbox path as foreground shell commands. Each CLI session supplies its own live job owner and a durable session journal. The older background import paths remain thin compatibility exports; they do not own CLI state.

## Commands

| Command | Behavior |
|---|---|
| `/jobs` or `/jobs list` | Inspect retained local and SSH jobs in the current session. |
| `/jobs run <command>` | Review and approve an exact local shell suffix, then start it independently of the main turn. |
| `/jobs queue <command>` | Review and retain an undispatched local intent. |
| `/jobs show <id>` | Inspect one local job's native, stored, owner and parent facts. |
| `/jobs pause <id>` | Pause an undispatched queued intent. No OS process is frozen. |
| `/jobs resume <id>` | Obtain fresh approval and dispatch that same undispatched queued or paused ID. |
| `/jobs cancel <id>` | Approve cancellation of an undispatched intent or await cleanup by the exact live owner. |
| `/jobs output <id> stdout\|stderr <byte-offset>` | Read a page of at most 16 KiB from a retained stream. |
| `/hub` | Read current main/goal/advisor state, job parents and the shared request ledger. |

Remote control remains under `/ssh`; a remote row in `/jobs list` retains its SSH backend. Completion is a local notice, so it does not become a new user prompt or dispatch an unrequested model request.

## Durability and limits

The journal saves the exact command, session/workspace identity, directory identity and provenance before execution. It establishes an immutable dispatch fence before handing off to the native execution owner. Ordinary session saves preserve this payload; forks do not inherit executable jobs. Queued and paused work requires fresh approval and a matching directory before adoption or dispatch. Dispatched IDs can never resume or replay.

Statuses are `queued`, `running`, `paused`, `completed`, `failed`, `cancelled` and `unknown`. Completion requires native settlement and durable publication; nonzero exits remain failed. Failed process cleanup remains unknown, and failed output consumption remains visibly unverified. After an abrupt exit, a row without a live handle cannot prove that a process is still running or safely terminated. Restart reads evidence without recreating signal authority from stored numeric PIDs. A still-live child may require external reconciliation.

Commands have a 1–300 second deadline, defaulting to 300 seconds. Each stream retains at most 64 KiB of original bytes, with explicit truncation. Output consumers pause native pipes while asynchronous consumption is pending. Output drain and spill cleanup have bounded failure paths. Reports redact the entire retained context before selecting a fragment; sensitive or truncated context is withheld. UTF-8 decoding affects display only and never adds replacement bytes to the journal.

The shared local/SSH journal retains at most 128 IDs and 1 MiB. Admission reserves room for both streams before dispatch; it refuses new work instead of evicting tombstones. At most two queued, paused, running or unknown local jobs occupy admission slots. An unknown job continues occupying its slot. The local command owner does not claim a durable daemon or exact process control after restart.

Closing or changing the runtime/session/workspace cancels its live local handles and waits for settlement. Captured configuration, collaboration acceptance, goal control and directory identities are checked during execution. Revocation requests cancellation without claiming it has already succeeded. Session navigation releases old owners, and old-scope results cannot be delivered into the newly selected session.

## Hub and delivery boundary

The hub projects validated state and provenance. `parents` identifies goal, applied advisor-note, collaboration-acceptance and source-prompt relationships; these are not invented DAG scheduling edges. Request usage comes from the existing bound ledger, including known tokens, retained reservations, dispatched unknown attempts and history uncertainty. A matching goal's token cap is displayed once per shared scope rather than multiplied by the number of jobs. Foreign ledger bindings are unavailable, and detached workspace scopes remain explicit. Job or scheduler termination is not goal acceptance.

This component delivers local shell jobs and their control/inspection surfaces. Persistent independent side-agent conversations and approved DAG dispatch are the remaining FLOW-01 components. FLOW-02/03 and the rest of Phase 19 remain open.
