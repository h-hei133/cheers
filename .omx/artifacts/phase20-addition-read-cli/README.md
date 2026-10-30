# External reads through the original CLI

Addition 20.46 exercises the current CLI, permission bridge, read executor and saved session through a Linux PTY and loopback HTTP fixture. No product code changes.

Six rounds per mode cover: deny a file in ask scope; approve its exact second-line selector in accept-edits; approve the sibling's second-line selector in allow-all; deny the original file again in allow-all; approve the first two directory entries; approve the next two entries through a new absolute-directory call. Every call paints once/deny and requires an answer. The persistent approval key stays pending. No grants or workspace roots are saved, no writer operations appear, and source/config bytes remain unchanged.

`observe.mjs` wraps original `fs.promises.open` and `opendir` to count only fixture-directory read boundaries while forwarding arguments/results unchanged. Pending and denied calls have no recorded open or enumeration. Approved file calls open their exact target once and return only the selected line with matching original provenance digest. Directory calls enumerate direct entries and retain absolute continuation spelling. The observer does not claim absence of metadata access, all kernel I/O, or unrelated reads.

Both modes passed all six rounds on their first attempt. Receipts store counts, statuses and output digests; raw fixture/provider bodies and session content are not archived. Each mode used one small saved session, 12 completion and 6 readiness requests, a 768 MiB heap, no tools other than read, no MCP/skills/retry/warming, and a 45-second/2-MiB cap. Runtime scratch is removed in finally. Peak RSS and timings are in the mode metrics; timings include artificial 150 ms persistent-key waits and observation.

Run modes serially from the repository root:

```sh
rtk proxy env NODE_OPTIONS=--max-old-space-size=768 node .omx/artifacts/phase20-addition-read-cli/pty.mjs regular
rtk proxy env NODE_OPTIONS=--max-old-space-size=768 node .omx/artifacts/phase20-addition-read-cli/pty.mjs fullscreen
```

The harness validates current dist via manifest/build ID before imports and writes receipts to `.tmp/read-cli/`. This local evidence does not cover actual provider tool choice, user directories, permission revocation or identity replacement during pending approval, all read media, non-Linux filesystems, desktop/IME, or independent review. Phase 20 acceptance remains bounded by its original task matrix.
