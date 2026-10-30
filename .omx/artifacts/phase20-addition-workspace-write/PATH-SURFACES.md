# Every surface that reports a path, and what it reports

One session must not have two conventions. This is the complete inventory as of
`0b768249`, with the rule each surface follows and why.

| Surface | Inside the primary root | Outside it (attached root) | Why |
|---|---|---|---|
| `glob` | rebased (`src/a.ts`) | absolute | a later tool resolves relative paths against the primary root |
| `grep`, in-process walk | rebased | absolute | same |
| `grep`, ripgrep branch | rebased | absolute | ripgrep reports relative to its cwd; rebased the same way |
| `lsp` definitions / references / workspaceSymbol | rebased | absolute | one projection for all three render sites |
| `read` directory listing | rebased, trailing separator | absolute, trailing separator | the separator distinguishes the directory from a file of the same name |
| `undo` status report | absolute | absolute | the report states exactly which file an operation touched |
| `browser` upload preview | absolute | absolute | an upload source is a precise file identity, not a search result |
| `/context` | no paths | — | reports sizes, not locations |

The first five are search or listing results a person passes to the next command, so they follow the one rule. The last three state a fact about one specific file, where the absolute path is the fact.

Checked and found already correct: `browser` upload resolves through `selectWorkspaceRoot`, verifies containment and binds `dev:ino:size:mtimeNs:ctimeNs`; `web_fetch` takes URLs only and touches no local path.
