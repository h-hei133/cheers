# Exit while a request is in flight

The idle-exit probe left one case open: what happens when `/exit` is used while a model request is still running. That is the shape the user's "sometimes it hangs" report would take if a pending request held the process open.

## What was measured

A loopback HTTP server answers the readiness probe (`GET /v1/models`) so the CLI can start a real turn, then accepts `POST /v1/chat/completions` and never responds. The real CLI submits a question, waits until it is visibly busy, and then runs `/exit`.

| Mode | Busy observed | Requests seen | Exit | Code | Cooked |
|---|---|---|---|---|---|
| regular | yes | models, chat/completions | 193 ms | 0 | restored |
| fullscreen | yes | models, chat/completions | 207 ms | 0 | restored |

Both modes return the terminal and terminate in about 200 ms while the chat request is still unanswered. The pending request does not hold the process open.

## What this does not cover

The server is local and the request is a plain chat completion. Provider-side stalls during a tool loop, a request waiting on an approval, and a pending interactive question are different states with their own paths. This batch establishes that an ordinary in-flight request is not by itself a reason for a slow exit, which is what the earlier idle-only measurement could not show.

Two probe mistakes are retained: a hand-written PTY wrapper that did not forward stdin (the exit command never reached the process, producing a false "exit-timeout"), and a config written before the loopback port was known (the CLI reported `Invalid URL` and never dispatched). Neither was a product failure.

Build `c1302abc9ff4873abf20da961b7a991bd7c70319ca181fef499e84f66bfc7268`, inputs `6e696319aff2a2fc9b1fff597b439fccc3b5a07c863b050c2a0e31816939814e`. No product code changed.

```bash
rtk node .omx/artifacts/phase20-addition-exit-busy/pty.mjs regular && rtk node .omx/artifacts/phase20-addition-exit-busy/pty.mjs fullscreen
```
