# Exit latency baseline

The user reported that `/exit` sometimes hangs. The documented mechanisms (unfenced close, out-of-budget MCP await, queued exit while busy, unref'd media timers) were fixed in earlier batches; this probe measures what remains on a clean machine.

## What was measured

Six real Node CLI runs — three per screen mode, alternating `/exit` and Ctrl+D — each one isolated home/profile/Git project, synthetic mode with a rejecting fetch observer, 768 MiB heap, 30-second per-round bound, 1 MiB output cap.

| Mode | Exit | After ready |
|---|---|---|
| regular | `/exit` | 219 ms |
| regular | Ctrl+D | 164 ms |
| regular | `/exit` | 215 ms |
| fullscreen | `/exit` | 222 ms |
| fullscreen | Ctrl+D | 158 ms |
| fullscreen | `/exit` | 206 ms |

All six exited 0 with cooked flags restored, zero network attempts, zero prompt dispatch.

## What this does not prove

The only remaining blocking mechanism on the exit path is `withFileLock`'s synchronous retry loop (`STATE_LOCK_TIMEOUT_MS = 1200`): when another process holds a session state lock, close waits up to 1.2 s in `sleepBlocking` before failing. That path is not exercised here — the fixture has no competing writer. A user who sees an occasional multi-second hang is most consistent with that contention, which remains unmeasured rather than fixed. No product code changed in this batch.

Build `5bf1f1e9aa7b6bcbbce651406619195849c98f9a9be8add557fa4467dcb4a473`, inputs `4a1f8e04d9c1e9765729f40c7e6ae6fda84779dd82cef93a457dd7d326ca8806`.

```bash
rtk node .omx/artifacts/phase20-addition-exit-timing/pty.mjs regular 3 && rtk node .omx/artifacts/phase20-addition-exit-timing/pty.mjs fullscreen 3
```
