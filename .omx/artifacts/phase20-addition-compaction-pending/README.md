# Compaction and an unsettled tool call

Compaction shrinks what is sent to the model; it does not rewrite the session's structure. The transcript is append-only, the thread keeps every entry, and `state.thread` is carried through unchanged — so a tool call that was unsettled before compaction is still on the active branch afterwards, and the recovery index still names it.

That is the correct reading: the call really was never answered, and the branch that started it is still the one in view. A user who compacts and later resumes is told the session was interrupted with a pending call, which is true. Removing the entry instead would make the index disagree with the branch the user is on.

No product code changed. Build `dbe6dc1eb2a1`.
