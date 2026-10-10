# SSH sessions and remote jobs

SSH uses the existing execution service and a selected native OpenSSH executable. Every profile selection, connection, submission, reconciliation, cancellation and output read uses ordinary tool approval. Local file grants and collaboration control rights do not approve remote execution. SSH is disabled until an explicit profile is selected and its remote workspace is verified.

## Profile and platform

Create an owner-private regular JSON profile and identity file. Paths must be explicit; credential content and native diagnostics are excluded from reports. A profile has this shape:

```json
{
  "version": 1,
  "host": "remote.example",
  "port": 22,
  "user": "operator",
  "identityFile": "/absolute/private/identity",
  "hostKey": "ssh-ed25519 <reviewed-public-key-base64>",
  "workspace": "/absolute/remote/workspace",
  "executable": "/usr/bin/ssh"
}
```

The host public key must be verified separately. Strict host checking uses a private generated host database; ambient SSH configuration, agents, passwords, certificates, proxies, forwarding and shared control connections are suppressed. Profile, key and executable identity/content are checked again after approval. Each native request has a private credential snapshot directory, a 15-second transport deadline and bounded output; cleanup failure blocks transport reuse.

Durable jobs require a verified remote Linux/bash host, systemd user manager and cgroup v2 with usable resource controllers. Unsupported hosts are unavailable. The remote workspace is checked by canonical path and directory identity before admission and inside the native runner. It selects the working directory; commands retain the authenticated account's OS rights. The authenticated account, login shell, manager and submitted code are trusted for receipt integrity; same-account code can manipulate its own journal or escape supervision.

## Commands

| Command | Behavior |
|---|---|
| `/ssh status` | Show selected profile and current binding. |
| `/ssh profile <file>` | Approve selection of an explicit private profile. |
| `/ssh connect` | Approve remote workspace and native capability verification. |
| `/ssh run <shell source>` | Approve and submit the exact quoted shell suffix. |
| `/ssh jobs` | Read the durable local job journal. |
| `/ssh reconcile <id>` | Approve a remote observation and persist matching evidence. |
| `/ssh cancel <id>` | Approve cancellation of the exact retained remote invocation. |
| `/ssh output <id> <stdout\|stderr> <offset>` | Approve the retained stream read for contextual redaction and display a page at an exact raw byte offset. |
| `/ssh cancel-pending` | Abort current local SSH requests and fence pending approvals. |
| `/ssh disconnect` | Drain local requests, release approved parent jobs and detach the local binding. |

The connected `ssh` model tool uses the same submission, approval and journal owners. Commands and model calls share local cancellation ownership. Status, jobs, local cancellation and disconnect remain reachable while a request is busy; a second native approval waits for an unanswered question. Profile replacement and shutdown drain in-flight submissions and native credential cleanup before releasing their owners.

## Durability, cancellation and evidence

The session journal stores queued intent before any remote bytes and then an immutable dispatch fence. The remote exclusive claim is a permanent tombstone. A lost acknowledgment remains unknown; reconnect, restart and repeated requests never resubmit that ID. The journal retains at most 128 IDs and 1 MiB; it refuses admission instead of evicting tombstones. Two queued, running or unknown jobs may remain active per session. Ordinary session saves preserve jobs; forks start with no executable jobs. Workspace rebinding retains old evidence and fences further old-scope publication or execution.

Local jobs have detached lifetime and can continue after local cancellation, disconnect or exit. Goal, collaboration and explicitly applied advisor-note origins have parent lifetime. Their submission preview separately grants cancellation of that exact job when the parent ends or the live runtime releases its binding. This capability cannot submit new work, signal another job or bypass configuration/profile/workspace fences. It is used once by the live owner; restart recreates no capability. Failed cancellation remains requested/unknown in the bound journal, or produces an explicit report if that journal can no longer be published. Restored authority requires fresh explicit reconciliation or cancellation.

Remote cancellation validates the retained InvocationID and signals held descriptors for the selected kernel cgroup, then observes it empty or removed. It never signals a reused numeric PID. This establishes the selected cgroup's cancellation only; escaped same-account processes are outside the guarantee. Local SSH exit or abort proves transport state only. Cancellation intentionally interrupts output collectors, so confirmed cancellation does not claim complete output.

Native jobs enforce a 300-second deadline, 3-second stop grace, 256 MiB memory, 32 tasks, a 128 KiB file-size limit and no new privileges. Actual controller/file limits and exact cgroup access are checked before submitted code is admitted. Each stdout/stderr collector stores at most 64 KiB and drains/discards excess. Normal completion requires matching native terminal evidence, selected-group cleanup and successful collector receipts; missing or malformed evidence remains unknown.

Output pages contain up to 16 KiB of exact bytes. The approved observer samples the bounded retained stream and derives the page from that same context. Reports withhold a stream when full-context redaction detects sensitive content, including prefixes across page boundaries or before an arbitrary offset. Raw byte sizes/offsets remain valid; UTF8 rendering can replace a split codepoint. Neither raw context nor credential-bearing native stderr is persisted as a report.

Jobs retain source prompt, parent goal/advisor note and collaboration principal/room/epoch/generation/acceptance identity. Model requests continue through the shared session/goal request ledger; native SSH calls do not invent model token costs. Independent advisor requests retain their existing empty tool pool and plan authority. Remote observations carry remote evidence or dispatch uncertainty and never mint local goal-completion proof.

Implementation owners are [native transport](../../packages/ts-shell/src/runtime/execution/ssh/transport.ts), [durable jobs](../../packages/ts-shell/src/workflow/jobs/service.ts) and [CLI lifetime](../../packages/ts-shell/src/cli/ssh/lifetime.ts). Validation and delivery evidence are recorded in [Phase 19](phase-19-decisions.md).
