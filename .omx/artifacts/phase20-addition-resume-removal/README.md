# Session deletion browse retention

The main agent ran all checks sequentially. `final-validation.log` records five static gates, 179 focused tests across four affected files, and the TypeScript build. `reversal.mjs` independently reverses four decisions and restores exact source bytes; its JSON and logs record the observed assertion failures.

Run `node .omx/artifacts/phase20-addition-resume-removal/cli.mjs regular` and then `fullscreen` from the repository root after building. Each process creates eight isolated sessions with one small message each, uses the original Node CLI and PTY relay, caps heap at 768 MiB and output at 2 MiB, and cleans its runtime scratch. It never loads a large transcript or the compiled executable. The observer wraps original rendering and catalog methods; all user actions arrive through PTY keyboard input.

The final receipts prove two real deletions, including one under a search, with the original browse retained, absent target directories, unchanged surviving noncurrent files and configuration, zero model requests, clean exit and cooked terminal flags. They do not measure the user's large session directory or prove the remaining management-read, parsing or ambient optimizations.

`baseline.json` preserves the initial failed deletion attempt: Ctrl+D followed the existing empty-draft app.exit contract and exited before deletion. The final probes use Delete followed by explicit Enter confirmation. Modal delete hints now advertise Del; the session panel has a different footer path.
