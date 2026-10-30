# Resume panel latency against a larger saved-session directory

The user reported that `/resume` stutters for about a second on every action. This measures the two moments a person waits for, against synthetic directories of increasing size.

## What was measured

A real Node CLI, one isolated home/profile/Git project, synthetic mode, 768 MiB heap, 60-second bound. Sessions are one message each; the current session plus N saved ones.

| Sessions | Panel title | First selectable row |
|---|---|---|
| 200 | 123 ms | 347 ms |
| 800 | 134 ms | 370 ms |

Quadrupling the directory moved the first row by 23 ms. The panel paints its title before rows arrive and fills them as the scan progresses, so opening does not wait for a complete scan.

## What this does and does not establish

- Opening the panel is not proportional to directory size in this range, which is what the earlier batching and progressive publication work was for.
- It does not reproduce the reported one-second stall, and it does not measure the user's own directory, disk, terminal or keystroke timing. Deletion, search and paging are separate operations with their own measurements elsewhere.
- Both runs are synthetic with one message per session; a directory of large transcripts reads more per session and is not covered here.

Build `059b7423ab15`, inputs `ead9d186ab6030878407d95123092d3ddfef3e4f36ab1d9b010f50cb52fc35df`. No product code changed.

```bash
rtk node .omx/artifacts/phase20-addition-resume-latency/pty.mjs 200 regular
rtk node .omx/artifacts/phase20-addition-resume-latency/pty.mjs 800 regular
```
