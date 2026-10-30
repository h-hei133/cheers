# Exit under session-lock contention

The user reported that `/exit` sometimes hangs. Earlier batches fixed the unfenced close, the out-of-budget MCP await, queued exit while busy, and the unref'd media timers. The one remaining blocking path was `withFileLock`'s synchronous retry loop (`STATE_LOCK_TIMEOUT_MS = 1200`), which had never been exercised with a competing holder. This batch measures it.

## What was measured

A second live local process creates the session state lock with real metadata (`pid`, `hostname`, `createdAt`) and holds it for a fixed time. The real CLI then runs `/exit`.

| Mode | Hold | Exit | Code | Reported |
|---|---|---|---|---|
| regular | 600 ms | 673 ms | 0 | clean close, `--resume <id>` printed |
| regular | 2500 ms | 1346 ms | 1 | `Session state could not be saved; session close was not verified.` |
| fullscreen | 600 ms | 677 ms | 0 | clean close, `--resume <id>` printed |
| fullscreen | 2500 ms | 1342 ms | 1 | same failure text |

Both modes exit within the acquisition bound either way. A hold shorter than the bound is waited out and the close succeeds; a longer one fails at ~1.35 s with exit code 1 and no resume suggestion. Cooked flags were restored in all four runs.

A direct write measurement through the product's own session owner confirms the same boundary: a 900 ms hold waits 922 ms and succeeds; a 2500 ms hold fails at 1208 ms and the write is not persisted (`finalMessages` lacks the attempted turn), while a retry after release succeeds in 24 ms.

## What this means for the user report

"Sometimes it hangs" is consistent with a competing writer, not with an unbounded wait. When it happens the process does not stall forever — it stops at the lock bound and says the close was not verified. The failure is loud rather than silent, and no `--resume` line is offered for a session whose close could not be confirmed.

The 1.35 s ceiling is real user-visible latency, but it is bounded and truthful. Changing it would trade a longer wait for a different bound, not remove the wait; no product code changed in this batch.

## Boundaries

Synthetic/offline sessions, one competing local process, Linux only. Not covered: a holder on another host, a holder that dies mid-hold (stale takeover), real user terminals, or concurrent multi-process contention.

Build `5bf1f1e9aa7b6bcbbce651406619195849c98f9a9be8add557fa4467dcb4a473`, inputs `4a1f8e04d9c1e9765729f40c7e6ae6fda84779dd82cef93a457dd7d326ca8806`.

```bash
rtk node .omx/artifacts/phase20-addition-lock-contention/measure.mjs
rtk node .omx/artifacts/phase20-addition-lock-contention/pty.mjs regular 600
rtk node .omx/artifacts/phase20-addition-lock-contention/pty.mjs regular 2500
rtk node .omx/artifacts/phase20-addition-lock-contention/pty.mjs fullscreen 600
rtk node .omx/artifacts/phase20-addition-lock-contention/pty.mjs fullscreen 2500
```
