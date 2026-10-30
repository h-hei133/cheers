# Two processes appending to one session

Two independent Node processes each appended twenty turns to the same saved session, with no coordination between them.

| Observation | Result |
|---|---|
| Exit codes | 0, 0 |
| Turns saved | 41 (base + 20 + 20) |
| From each writer | 20 / 20 — neither lost the other's work |
| `state.json` | still parses |
| `transcript.jsonl` | 42 lines (header + 41 turns) |

The session state lock serialises the appends, and the atomic state write keeps the snapshot readable. A torn or interleaved write would have shown up as a lost turn or an unparseable state file; neither occurred.

## Boundaries

Two writers on one machine, one append each per iteration, Linux. This does not cover a writer that is killed mid-append, a network filesystem with weaker locking, or more than two writers. It also does not exercise the case where both writers edit the *same* turn — the session writer is append-only, so that shape does not exist here.

Build `dbe6dc1eb2a1`. No product code changed.
