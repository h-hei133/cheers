# Draft recovery notices use effective shortcuts

After rebinding draft stash or editor undo, the original host still advertised hardcoded `ctrl+s`/`ctrl+z`. This batch fixes the notices, including keys lost to conflicts and actions explicitly left unbound. The existing stash slot, editor undo history, input routing and external editor lifecycle remain the execution owners.

`InputPreferences.shortcut` reuses the existing thinking-shortcut lookup: select the first configured key that still dispatches to the requested action. `thinkingShortcut` delegates to that method. The host uses it when reporting a new stash or external rewrite; absent bindings produce an explicit unbound notice, with no invented default key.

## Validation

- Original implementation: all 16 new actual-host cases failed on hardcoded notices (`baseline.log`).
- Final focused run: **26 unique tests passed**, 374 unselected (`focused.log`, repeated after reversal in `restored-build.log`). Cases cover regular/fullscreen, remapped keys, conflicted first keys, entirely conflicted stash, explicit unbinding, actual stash restoration, undo restoration and preservation of an older stash.
- Three independent reversals failed on assertions: original host notices 16, removing effective-key filtering 6, adding a fallback for unbound actions 4. Each restores original bytes in `finally`, checks equality and records SHA-256 (`reversal.json` and corresponding logs).
- Five static gates passed, retaining 118 existing docs-source advisories. TS build and freshness passed. `audit.json` counts constructors and named property callbacks conservatively: InputPreferences 7→8, host 123→123. The host's existing responsibility-ceiling debt remains; this is not an all-owner ceiling pass.
- Build: `e2930dba7c8af5c2ce9a7ae62770da5573bfeaa5485c38b406ce9216dbc1b47f`; inputs: `e2bd5e51ebe097036feaf680dd0ffb219c2f3a5c5eb302c0a9a533badcce0d38`.

Actual Node CLI `regular` and `fullscreen` each passed five stages (`*-receipt.json`): effective `alt+k` after conflicting `alt+j`, real external editor return to an empty slot and occupied slot, actual `alt+z` undo, unbound stash followed by real `/reload` and restoration, and unbound undo with an older stash preserved. Each notice was observed in terminal output as well as host state. The original external-editor process writes only an isolated temporary draft; the observer does not replace editing, routing, storage or shortcut resolution.

Each mode starts one saved message with isolated home/profile/project and a loopback provider endpoint. It makes **zero HTTP requests**, leaves runtime config and project unchanged, deliberately updates only the fixture keybindings file, exits 0 via Ctrl+D and restores cooked flags. Limits: 768MiB heap, 45 seconds, 2MiB output. Both scratch trees were removed.

## Failure classification and comparison

`fixture-unflushed.log`: new tests invoked the external-editor callback before StdinBuffer had emitted its final grapheme, then expected the original's final character in a later restore. Flush the fixture's existing ManualScheduler before programmatic editor invocation; retain exact-text assertions. No product workaround was made. Reversing original notices with the final corrected fixture still fails all 16 cases.

`regular-empty-cancel-failure.json`: the probe sent Ctrl+C to an already empty draft before and after a fast reload, triggering the established consecutive-cancel exit gesture. The final driver clears only a nonempty draft and leaves that product behavior intact.

Read-only reference comparison followed target inspection: `components/PromptInput/PromptInput.tsx:819–823` uses action-aware shortcut hints, with `components/ConfigurableShortcutHint.tsx` and `keybindings/useShortcutDisplay.ts` projecting configured keys. We agree on looking up the actual action. Its migration fallback is not copied: this host always has an accepted binding owner, and an explicitly unbound action must not advertise a default. Regression reversals check this difference, conflicts and the dynamic notices. No reference implementation was copied.

`prior-ci.json` is a delayed observation of previous commits: `ed4820cb` CI `41039139794` and Watch `41039139814` completed/success; `ff084423` CI `41040907065` remained in_progress and Watch `41040907311` completed/success, exact heads matched. This batch's later commit/push/CI are separate evidence.

## Reproduction and limits

From the repository root with a current build, run serially:

```sh
rtk proxy node --max-old-space-size=768 .omx/artifacts/phase20-addition-draft-shortcuts/pty.mjs regular
rtk proxy node --max-old-space-size=768 .omx/artifacts/phase20-addition-draft-shortcuts/pty.mjs fullscreen
```

No full suite, concurrent heavy processes, assistant subagents, 20k terminal, executable, real provider, independent review or NormProof judge was run. Non-raw terminal flow control and desktop/platform acceptance remain unverified. Original Phase20/ADD overall acceptance is unchanged; the goal remains active.
