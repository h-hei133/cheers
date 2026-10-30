# Patch group approval through the original CLI

Addition 20.45 fixes group navigation disappearing from populated decision options and the advertised `g` / `4` shortcuts lacking dispatch. The original approval host, group preview, explicit final approval and native writer remain the execution path.

`regular-receipt.json` and `fullscreen-receipt.json` record four bounded rounds each: choose the second of two external-directory groups with `g`, `4`, or arrows + Enter, then explicitly approve the selected preview; deny the fourth full patch. Each successful native operation matches the persisted tool operation ID, exact selected and skipped group IDs, selected preview revision, committed target and bytes. Pending previews do not write, the first group remains absent, denial writes neither file, and no persistent grant or root is added. Counts are eight loopback completion requests and four readiness requests per mode. Credentials and user state are not copied.

Final focused validation passed 13 picker, 77 overlay and 51 host cases; 322 unselected host cases are not passes. The host filter was `selects exact patch groups from a populated|empty-draft exit|nonempty draft.*exit key|unanswered approval|ordinary approval|file plan|approval shortcuts|exit|failed session persistence`. The owning package's Vitest used `--threads=false` and a 768 MiB heap. Decision filtering and shortcut dispatch independently reverted produce six and four failures. Final source hashes and restoration are in `reversal.json`; final rerun logs begin with `restored-`.

The final build exited zero with a 1536 MiB heap. `build.json` records independent current compiler-input/digest freshness and unchanged callable inventories. A prior build refused publication after an edit changed its inputs; its raw output was not archived. `failure-classification.json` also retains the unsupported Home fixture and first CLI observer synchronization failure. No concurrent heavy verification was used in this batch.

From the repository root, rerun one mode at a time:

```sh
rtk proxy env NODE_OPTIONS=--max-old-space-size=768 node .omx/artifacts/phase20-addition-patch-cli/pty.mjs regular
rtk proxy env NODE_OPTIONS=--max-old-space-size=768 node .omx/artifacts/phase20-addition-patch-cli/pty.mjs fullscreen
```

The harness validates the current manifest/build ID before loading dist, creates one small saved session per mode, enforces a 45-second/2-MiB boundary and removes isolated runtime state. Receipts are written under `.tmp/patch-cli/`. `freshness.mjs` writes under `.tmp/approval-groups/`, which must exist. `reverse.py.source.txt` is an archived source snapshot, not an automatically run test.

This is local Linux PTY and loopback HTTP evidence. It does not establish actual provider tool choice, user-directory permission behavior, other filesystems/platforms, started-writer failure recovery, independent review, or complete Phase 20 acceptance. Existing overlay/host callable ceiling debt remains.
