# Approved read with a replaced directory identity

Addition 20.47 uses the original CLI, approval host and read execution path. After the approval screen paints, the harness renames the external directory and copies its small public fixture bytes to a newly created directory at the same path. Device/inode identity is asserted to differ. Pressing `y` records user approval, but the tool fails with the original changed-identity message and no observed fixture read open or directory enumeration. A second native call paints a fresh approval; its explicit `y` returns the exact second-line slice from the replacement directory.

Both regular and fullscreen modes passed both rounds on their first attempt. Source bytes, old-directory bytes, config, zero writer operations and zero grants/roots are checked. Normal Ctrl+D returns zero and restores cooked flags. Each mode uses one small saved session, four loopback completion and two readiness requests, a 768 MiB heap, no MCP/skills/retry/warming, and a 45-second/2-MiB cap. The observer forwards original filesystem APIs and records only fixture boundaries; it does not measure all kernel I/O or metadata checks.

Run one mode at a time from the repository root:

```sh
rtk proxy env NODE_OPTIONS=--max-old-space-size=768 node .omx/artifacts/phase20-addition-read-identity/pty.mjs regular
rtk proxy env NODE_OPTIONS=--max-old-space-size=768 node .omx/artifacts/phase20-addition-read-identity/pty.mjs fullscreen
```

Current dist is selected through its manifest/build ID. Runtime state is isolated and removed; receipts are written to `.tmp/read-identity/`. Published receipts contain statuses/counts/digests only. This verifies local Linux directory replacement during pending approval and fresh reapproval. It does not establish policy revocation, replacement after a reader starts, other platforms, actual provider tool choice, user directories, or independent review. No product source changes or acceptance upgrades.
