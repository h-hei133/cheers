# Synthetic large-directory CLI probe

This probe exercises the regular and fullscreen Node CLI against 2,307 generated
session directories in an isolated home and project. Each session has one user
message with 1,400 repeated ASCII padding characters; the generated session
files total 6,323,775 bytes. The fixture is synthetic and smaller than the
41 MiB user-directory snapshot described in Phase 20 section 21.3.

The script creates one session through the production `SessionManager` writer,
then copies its valid metadata, state and transcript shape while assigning each
synthetic directory its own ID and timestamps. No user session data is read.
The runtime uses the current built Node CLI, a 768 MiB heap cap, offline mode
without credentials, a 90-second deadline and a 2 MiB terminal-output cap.
Responses are discarded; only bounded counts, timings and status enums are
written to the receipts. Both runs made zero requests, exited 0, restored cooked
terminal flags and removed their scratch profiles.

| Mode | First frame | Full scan | Key response during scan | Search | Delete |
|---|---:|---:|---:|---:|---:|
| Regular | 197 ms | 13,046 ms | 72 ms | 177 ms | 149 ms |
| Fullscreen | 197 ms | 13,429 ms | 51 ms | 179 ms | 154 ms |

Both catalogues completed with 2,307 scanned, 2,307 matched, zero unreadable,
and no source-budget limit. Each run searched for one exact synthetic title,
deleted that row, and confirmed the existing browse remained active. A second
open was closed while scanning; its browse controller was aborted and no later
catalogue page was published.

The timings include the probe observer and describe this synthetic Linux
fixture only. They do not establish total heap, physical I/O, cold/warm behavior,
the actual 41 MiB user directory, another platform or terminal, or a release
latency bound. Section 21.25 records the evidence; Phase 20 and ADD remain
partial.

`harness-failures.json` retains two corrected harness failures. The first used
the full writer for all 2,307 fixtures and took 85.5 seconds to prepare; its
child then closed before the startup prompt because of the observer import.
The second used the faster copied fixture and hit the same import error before
that observer wiring was corrected. Neither was a product failure.
