# Session-owned jobs

Local shell jobs run through the same execution service, tool approval and sandbox path as foreground shell commands. Each CLI session supplies its own live job owner and a durable session journal. The older background import paths remain thin compatibility exports; they do not own CLI state.

## Commands

| Command | Behavior |
|---|---|
| `/jobs` or `/jobs list` | Inspect retained local, side-agent and SSH jobs in the current session. |
| `/jobs run <command>` | Review and approve an exact local shell suffix, then start it independently of the main turn. |
| `/jobs queue <command>` | Review and retain an undispatched local intent. |
| `/jobs agent <prompt>` | Approve an independent conversation that runs alongside the main session. |
| `/jobs agent --queue <prompt>` | Approve and retain a child conversation without sending a model request. |
| `/jobs show <id>` | Inspect one local job's native, stored, owner and parent facts. |
| `/jobs pause <id>` | Pause an undispatched queued intent. No OS process is frozen. |
| `/jobs resume <id>` | Obtain fresh approval and dispatch that same undispatched queued or paused ID. |
| `/jobs cancel <id>` | Approve cancellation of an undispatched intent or await cleanup by the exact live owner. |
| `/jobs output <id> stdout\|stderr <byte-offset>` | Read a page of at most 16 KiB from a retained stream. |
| `/jobs output <agent-id> text <byte-offset>` | Read a redacted page of retained agent text. |
| `/jobs continue <agent-id> <new prompt>` | Approve a new run at a settled child checkpoint; earlier runs remain immutable. |
| `/workflow list` | Inspect readable workflow definitions in the current project. |
| `/workflow run <name>` or `/workflow queue <name>` | Approve an immutable command graph for immediate scheduling or later fresh approval. |
| `/workflow status` or `/workflow show <id>` | Inspect retained session graphs, their dependencies and actual command children. |
| `/workflow pause <id>` or `/workflow cancel <id>` | Halt scheduling and await cleanup by its exact live native owners. |
| `/workflow resume <id>` | Obtain fresh approval for the same undispatched graph; dispatched graphs never replay. |
| `/hub` | Read current main/goal/advisor state, job parents and the shared request ledger. |

Remote control remains under `/ssh`; a remote row in `/jobs list` retains its SSH backend. Completion is a local notice, so it does not become a new user prompt or dispatch an unrequested model request.

## Approved command graphs

Project definitions live in `.agents/workflows/<name>.json`. Each step has an `id`, an exact shell `run`, optional prerequisite IDs in `needs`, and an optional `timeoutSeconds`. The existing graph resolver orders dependency batches; the existing dispatcher runs at most two commands concurrently. Every batch settles before the next one starts, and a failed batch skips all later batches. Native exit codes, retained stream bytes, cancellation and output uncertainty remain owned by the ordinary local jobs.

Approving a graph approves scheduling. Each command still passes through its ordinary exact bash preparation, approval and sandbox boundary. Source reads honor the existing read-denial policy. The graph captures its canonical directory identity, raw definition fingerprint, session binding and parent provenance before approval; configuration, mode, trust, hooks and those identities remain admission fences. Declared command hooks refuse this background path because their existing owner cannot confirm cancellable cleanup; the main session remains available.

Graph and child IDs are reserved durably before possible child creation. Both levels retain permanent dispatch fences. Restart restores inspection without recreating controllers; a stored running graph without its live owner is `unknown`. Queued graphs require fresh scheduling and command approvals against the unchanged definition and directory. A dispatched graph cannot resume, including one whose native commands were successfully paused. That settled pause releases a scheduling slot while retaining its history. Reserved children cannot resume independently through `/jobs`, including after uncertain handoff; inspect their output there and control scheduling through `/workflow`.

Graphs allow 1–32 steps, a definition of at most 512 KiB, commands of at most 16 KiB, and explicit native deadlines of 1–300 seconds. Definitions may request concurrency 1–16, with effective concurrency capped at two. At most two unresolved graphs occupy scheduling slots. All reserved child IDs count once against the shared 128-ID limit, even when no local row was created. Future immutable child metadata is reserved in the same 1 MiB journal; native output capacity is admitted by the local owner before each child is created. A later capacity refusal can halt a graph after earlier approved effects; it does not roll them back. Unknown cleanup or result publication cannot become completed or ordinary cancellation.

New graphs use the session journal rather than the older project-wide last-run file. Legacy records remain read-only compatibility history and never provide executable authority. Definitions that previously requested a deadline above 300 seconds must be changed explicitly. Scheduling termination and successful native commands remain separate from goal acceptance.

## Independent conversations

Side-agents fork the parent's saved conversation for context and keep their own durable transcript. They retain an immutable reserved child identity before creation; an uncertain fork cannot be retried. Parent selection, current input, todos and usage remain owned by the main session. Pending historical tool calls receive context-only interrupted results and are never executed by the child. Child todos and conversation usage start independently.

The ordinary invocation, tool gate and execution service run each child. Starting an agent does not approve later file writes or shell commands. Provider, model, effort, configuration, skill content and tool restrictions are captured before startup approval. Session-bound extension closures are withheld. MCP exposes only previously discovered descriptors with matching permission hints; changed configuration, permission, trust, skill revocation or parent/child binding closes admission. Declared command hooks, including malformed declarations, prevent side-agent execution because their ordinary owner cannot verify cancellable process cleanup. The command reports this restriction and directs the user to the main session.

With an active goal or collaboration acceptance, child requests use the existing shared parent request policy and budget. Each attempt records its job and run identity. Without that policy, agents use a parent-session ledger shared among agents; ordinary main-session requests currently do not all use this fallback ledger. The hub does not invent main-request accounting for that case.

Pause or cancellation aborts only the exact live child and waits for the ordinary runner and its command owners to settle. Command or native media cleanup uncertainty stays `unknown`; it cannot become a confirmed cancellation or a continuation checkpoint. A queued child may resume with fresh approval. A previously dispatched run never resumes: continuation requires a new prompt, fresh approval and an unchanged settled checkpoint. Restart restores inspection of jobs and transcripts without recreating live controllers or replaying possible effects.

At most two unresolved side-agents occupy their own admission slots. Each agent retains up to 16 runs, 16 KiB per prompt and 64 KiB of text; pages are bounded to 16 KiB. Unknown rows retain their slots. The shared journal across local, remote and agent rows retains at most 128 IDs and 1 MiB, reserving output capacity beside immutable run metadata before dispatch. Parent context is limited to 2 MiB of serialized input and an 8 MiB transcript preflight. These limits are explicit refusals and never evict dispatch history. Cross-file creation and non-cooperating filesystem changes do not have a crash-atomicity guarantee.

## Durability and limits

The journal saves the exact command, session/workspace identity, directory identity and provenance before execution. It establishes an immutable dispatch fence before handing off to the native execution owner. Ordinary session saves preserve this payload; forks do not inherit executable jobs. Queued and paused work requires fresh approval and a matching directory before adoption or dispatch. Dispatched IDs can never resume or replay.

Statuses are `queued`, `running`, `paused`, `completed`, `failed`, `cancelled` and `unknown`. Completion requires native settlement and durable publication; nonzero exits remain failed. Failed process cleanup remains unknown, and failed output consumption remains visibly unverified. After an abrupt exit, a row without a live handle cannot prove that a process is still running or safely terminated. Restart reads evidence without recreating signal authority from stored numeric PIDs. A still-live child may require external reconciliation.

Commands have a 1–300 second deadline, defaulting to 300 seconds. Each stream retains at most 64 KiB of original bytes, with explicit truncation. Output consumers pause native pipes while asynchronous consumption is pending. Output drain and spill cleanup have bounded failure paths. Reports redact the entire retained context before selecting a fragment; sensitive or truncated context is withheld. UTF-8 decoding affects display only and never adds replacement bytes to the journal.

The shared local/SSH journal retains at most 128 IDs and 1 MiB. Admission reserves room for both streams before dispatch; it refuses new work instead of evicting tombstones. At most two queued, paused, running or unknown local jobs occupy admission slots. An unknown job continues occupying its slot. The local command owner does not claim a durable daemon or exact process control after restart.

Closing or changing the runtime/session/workspace cancels its live local handles and waits for settlement. Captured configuration, collaboration acceptance, goal control and directory identities are checked during execution. Revocation requests cancellation without claiming it has already succeeded. Session navigation releases old owners, and old-scope results cannot be delivered into the newly selected session.

## Hub and delivery boundary

The hub projects validated state and provenance. `parents` identifies goal, applied advisor-note, collaboration-acceptance, source-prompt and actual graph-child relationships; dependency edges come from the approved stored graph. Request usage comes from the existing bound ledger, including known tokens, retained reservations, dispatched unknown attempts and history uncertainty. A matching goal's token cap is displayed once per shared scope rather than multiplied by the number of jobs. Native command graphs do not introduce a model loop or duplicate request ledger. Foreign ledger bindings are unavailable, and detached workspace scopes remain explicit. Job or scheduler termination is not goal acceptance.

Local shell jobs, persistent independent conversations and approved command graphs are implemented. FLOW-02/03 and the rest of Phase 19 remain open; final integration and external delivery evidence remain separate.
