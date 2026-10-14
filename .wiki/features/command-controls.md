# Session and runtime command controls

W15 PAR-01–05 composes the existing session, query, configuration, memory, security, patch, approval, execution and observability owners. Interactive and print/pipe invocations share the command grammar. A host without the required owner reports unavailable; it does not create an alternate reader, writer or execution path.

## Saved history and context

| Command | Behavior |
|---|---|
| `/session pin [reference] [on\|off]` | Persist pin metadata through the session owner. Sorting and filtered selection retain stable session identity. |
| `/session history [list]` | Inspect the current retained history. |
| `/session history export <path>` | Publish a bounded versioned history through ordinary file-write approval. |
| `/session import <path>` | Read an authorized bounded history, validate its complete tree and tool pairs, and import an inactive session. Repeating the same import is idempotent. |
| `/session open [list\|number]` | List recorded conversation links or open the explicitly selected HTTP/HTTPS link through the system opener and the single execution service. `/open 1` uses the same parser and owner. |
| `/session shake preview\|apply\|status\|restore [elide\|images\|thinking]` | Select future context omissions while retaining durable history and valid tool pairing. Savings are estimates. |
| `/fork` | Open the historical question picker. Cancel preserves the current session. Selection copies the full history, activates a path ending **before** that question, and places its text in the editable draft. |
| `/fork here [--from entry-id]` | Explicit saved-session fork. Noninteractive invocation leaves the copy inactive. Pending tool/approval authority is not inherited; media requires explicit reattachment. |
| `/context files\|add <path> [--persist turn\|session]\|drop <path>` | Attach authorized read-only file context, inspect its provenance and bounds, or remove it. Default lifetime is one normal turn. |

Attachments are limited to 16 entries, 128 KiB per file and 512 KiB combined. Session entries use the session CAS owner. Canonical path, current read policy and content digest are checked again at actual request admission; changed or revoked sources block the request and require explicit reattachment. Attachment content carries source/permission/lifetime metadata and does not grant execution or write authority.

History imports require one root, legal stable entry IDs, complete ancestry and matched assistant/tool calls on every branch. Import, selective context omission, conversation navigation and workspace-file restoration remain distinct operations.

## Checklist and memory

`/todo edit <id> <text>`, `copy`, `export <path>` and `import <path>` supplement the existing checklist operations. Import validates bounded version 1 JSON before replacing the checklist; file publication requires ordinary approval. Marking a checklist entry done is not goal completion evidence.

`/memory view`, `diagnose`, `queue`, `enqueue <statement>`, `sync`, `import <path>` and `export <path>` use the existing project-memory store and review queue. Enqueue/import do not approve or save. A typical explicit flow is `/memory enqueue …` → `/memory approve --all-safe` → `/memory save approved` → `/memory use …`. Invalidate retains the record with its reason; delete removes it; wake/recall/use preserve their existing meanings.

`view` reports versioned knowledge and injection provenance. Injection provenance records only fact bodies actually admitted after deduplication and budget/list caps. It does not claim every retrieved or retained record reached the provider. Usage, estimated costs, request/goal budgets and account billing remain separate.

## Model and provider preferences

| Command | Effective scope and limits |
|---|---|
| `/switch …` | The existing `/model` selection path; model and effort validate together and default to the current session. |
| `/modelpreset save <name> [role=provider/model@effort …]` | Persist a session preset after validating the complete role map. Omitting roles saves the current model. |
| `/modelpreset validate <name>` | Validate saved role targets against the current catalog. |
| `/modelpreset apply <name> [role]` | Apply the chosen role through ordinary joint `setModel` and hooks. An inactive connection is refused with an explicit `/connect use` instruction; no half-applied role map is reported. |
| `/fast on\|off\|status` | Select the advertised priority tier, or explicit default tier. |
| `/slow on\|off\|status` | Select the advertised flex tier, or explicit default tier. |
| `/skillful on\|off\|toggle\|status` | Control session skill-directory prompt injection. Installed skills and execution permissions have their own owners. |
| `/extended-context on\|off\|status` | Use the supported model window or normal context policy while retaining request/output and compaction constraints. |
| `/fresh` | Reset only the controllable local cache-warming owner, with a bounded wait and late-result fencing. Stateless or absent owners return unchanged. |
| `/usage [show\|status]` | Report recorded session activity; account quota remains separate. |
| `/usage account` | Read quota windows, reset offers, source and fetch time for the current stored account; unsupported authentication remains unavailable. |
| `/usage reset [apply <preview-id>]` | Preview the earliest valid unexpired offer without consuming it. Applying requires a fresh one-time interactive approval, the same session/account and a current offer reread. Pending/unknown outcomes refuse automatic replay. |
| `/login …`, `/logout …` | Exact shortcuts to the existing `/connect login` and `/connect logout` authentication owner. |

Fast/slow require both endpoint protocol support and model capability. Actual requests carry `service_tier`; temperature is unchanged. Legacy `fastSampling` configuration is retained with a migration notice and no sampling effect. Account entitlement, remote caches, prices and quotas are not inferred from local settings or synthetic acceptance. Session/config/catalog/credential identity is rechecked before preference publication and dispatch.

## Rules, repairs and diagnostics

`/init preview` inspects bounded authorized project metadata and retains an exact proposal. `/rules propose <feedback>` retains a rule refinement. Both show the proposal ID, destination and diff; `/init apply <id>` or `/rules apply <id>` invokes the ordinary stale-content patch, Plan/deny rules, approval, hooks, durable receipt and exact readback. Feedback itself is not write approval.

Rule proposals are startup-local, limited to 16 and bound to the original session/workspace/startup. Native receipts remain durable. Pending, committed and unknown proposals cannot replay. Existing BOM, line endings, whitespace and final-newline shape are preserved. Distinct feedback adds a distinct section; an exactly present section is unchanged. Feedback exceeding 4,000 characters is refused rather than truncated.

`/cleanse diagnose [scan-id]`, `repair <scan-id> <fingerprint> <patch-path>`, `apply <scan-id> <fingerprint> <proposal-id>` and `verify <scan-id> [fingerprint]` delegate to the retained native security finding/proposal/patch/verification owners. Model-assisted proposals reuse the existing goal and security tool path. Applying requires separate ordinary approval; verification reuses the original scope/rules/analyzer identity and retains the original finding. Git dirtiness is not defect evidence. This is targeted verified repair, with the security system's published limits.

`/force <tool>` selects one currently available tool for one next request. It captures the session/workspace/config/catalog identity across asynchronous discovery, clears stale or failed choices, consumes once and rechecks actual dispatch availability. Tool selection does not enlarge permission, Plan or sandbox authority.

`/debug` aggregates available logs, crashes, timings, metrics and tools. `/trace open|status|close` exposes the existing redacted event projection on loopback; missing spans remain missing. Concurrent close shares one promise, terminates owned connections and clears the singleton only after confirmed cleanup.

`/restart` drains current runtime owners within a total default ten-second deadline, then rebuilds bootstrap in the **same OS process**. It preserves startup flags, workspace and saved session, suppresses replay of the startup prompt/captured input, and separately reads back recovery. Unknown cleanup prevents successful reentry and exits with failure. This does not replace the process image or load a newly installed executable. Print/pipe restart discards queued captured text rather than dispatching it twice.

`/changelog [full]` reads only authorized current-project `CHANGELOG.md`, bounded to 128 KiB, and identifies the installed build version and any matching project version label. Project notes are not authoritative installed release records or proof of the newest release; missing/denied/oversize/offline input is explicit.

## Acceptance boundary

Final W15 source freeze: `c2a9e8cd541cd35c1a30a665ff836f49ef2714e4ec786ae39170999e5ea41dc5`, 164 TypeScript files / 129 production. Independent code APPROVE and architecture CLEAR reviewed that exact inventory. Node 20.3 affected validation passed 104 files / 1,012 tests; TypeScript and executable builds, five static gates, 149 result-contract checks and 43 script tests passed. No touched/new module exceeds the responsibility ceiling.

Six actual CLI lanes cover Node/executable × regular/fullscreen/print-pipe, with 24 synthetic model POSTs. Additional historical-picker checks retain all history and editable text while proving the path ends before the selected question; trace checks read real HTTP data and prove old-listener refusal after same-process reentry. Six isolated decision reversals each produced an actual assertion failure; restored copies passed 73 tests. Independent native security acceptance ran the mature analyzer and read the committed repair receipt and matching-scope verification.

Artifacts: `.tmp/parity/acceptance.json`, `.tmp/parity/reversal.json`, and both `.tmp/parity-review/` final reports. No real-provider/account, real hardware or non-Linux acceptance is inferred. Full NormProof remained not_proven because the complete graph exceeded the collector's 8,192-edge limit; W16 owns that repair. W15 local acceptance, commit/push, remote CI and release are recorded separately in [Phase 19](phase-19-decisions.md); the full Phase 19 goal remains active until W16 evidence is addressed.
