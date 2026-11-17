# SDK UI renewal counterexamples

Staged-only test proposal, based on `packages/ts-shell/src/sdk/ui.test.ts` SHA256 `778e18728962d84f532d5078c7ba22931d04624a3800f470d69d7e230da88c85`. The subagent did not edit that source or execute tests/builds/providers. The root agent subsequently applied the first patch generation.

`tests.patch` now includes compatible Vitest 3.2.7 call-count and call-argument assertions. If the first patch generation was already applied, replace the two `toHaveBeenCalledExactlyOnceWith` assertions with `toHaveBeenCalledTimes(1)` and `toHaveBeenCalledWith` before validation.

Main-owned red filter: `src/sdk/ui.test.ts -t 'renews retained'` from the TypeScript shell package, with existing serial validation discipline. Two cases cover `options.ui` and explicit `bindUi`.

Each case admits a real SDK prompt to a preloaded extension input hook, publishes the unchanged valid configuration through its actual `ConfigState`, and checks original-dialog cancellation. The old hook's continuation and effects must remain retired. A new prompt must reach the retained host; on the inspected implementation the second host call is expected to be absent. The fixed fixture block decision stops each successful hook before provider dispatch. This expectation is source-derived until root records the actual red output.

Post-repair assertions cover late original host settlement while a new dialog is pending, explicit replacement surviving the old release callback, explicit release refusing renewal after another publication, and disposed API/bind/prompt refusal. Session, root and trust retirement are separate preservation constraints documented in `.tmp/history-cost-validation/e5-audit.md`; this initial patch does not claim to test those transitions.

Source snapshots use `.txt` names so they cannot become discoverable tests.

## Installed worker consumer proposal

`installed-proposal.txt` is a staged, standalone proposal for `packages/ts-shell/src/sdk/ui/installed.test.ts`. It has not been applied or executed by the subagent. Both cases create an ordinary SDK session (`options.ui` and `bindUi`), retain the actual raw bridge from `extensionHostFor(session.runtimeContext)`, and invoke real `executeInProcessScript` workers using that exact bridge. The exported TS factory awaits before registering its tool. No provider prompt or HTTP fixture is used.

The first worker holds an input. A real unchanged-binding `ConfigState.publish` must abort it, refuse its continuation and notification, and let its completed output report null answers. The second worker is created after publication without an intervening SDK UI call; it must reach the retained custom input host. The inspected implementation is expected to fail at host-call count 1 versus 2 because only the SDK loader/contribution facade consults `SessionUi.current`, while `executeScript` uses its raw `extensionHost` and `executeInProcessScript` captures `options.host.ui` before worker startup. Root must reproduce/classify the actual red; this remains a source-derived expectation until then. A post-fix late original settlement must leave the fresh dialog pending, and only its fresh answer may notify.

Required call shape:

```ts
executeInProcessScript({
  root, scriptFile, record, argv: [], denyRules: () => [],
  context: { workspaceRoot: root, sessionId: session.sessionId, taskId: title, abortSignal: controller.signal },
  invoke: { kind: 'tool', name: 'worker_ui', args: { title } },
  host: extensionHostFor(session.runtimeContext),
});
```

`record` is a `VersionRecord` with a valid manifest and the existing real-worker fixture's synthetic provenance/storage fields. The direct executor does not verify a signed registry manifest, tar digest, installed inventory, activation/grants or service approval. The recorded digest in this proposal is the source hash, not an archive hash. This proposal therefore qualifies the installed execution worker seam only; signed installation and the actual installed `ExtensionService` consumer remain root-owned joint qualification. The inspected signed fixture in `extensions/extensions.test.ts` creates Ed25519 signed registry replies, validates gzip tar bytes, installs through `installOperation`, then enables and grants scripts/tools through ordinary approval. Its current scripts are shell fixtures; the root can later replace the archive contents with this async TS source and exercise the granted service consumer, retaining signed archive provenance.

Main-owned application from `/home/wang/projects/cheers`:

```sh
rtk cp .tmp/ui-renewal-validation/installed-proposal.txt packages/ts-shell/src/sdk/ui/installed.test.ts
```

Main-owned serial red from `/home/wang/projects/cheers/packages/ts-shell` (no other heavy command may run concurrently):

```sh
rtk env NODE_OPTIONS=--max-old-space-size=1536 VITEST_MAX_THREADS=1 VITEST_MIN_THREADS=1 /home/wang/projects/cheers/node_modules/.bin/vitest run src/sdk/ui/installed.test.ts --reporter=json --outputFile=/home/wang/projects/cheers/.tmp/ui-renewal-validation/installed-red.json
```

Source identities inspected for this proposal:

| File | SHA256 |
| --- | --- |
| `extensions/runtime/inProcessLoader.test.ts` | `05651fa85a869056ebcf5477da77b6cf48a76844f65bc4e025ff7fd3a72306b6` |
| `extensions/runtime/inProcessLoader.ts` | `e6ba89ec1c80300924e9c959f19b68a8229d8cde7bf1acc7da68e05558ee1806` |
| `extensions/extensions.test.ts` | `41aa9f8aa9969a539bac87cc5696af6bf6247b37c2faeba48dd2dca9f7736743` |
| `sdk/ui.ts` | `43f5b84b40bb762a278ec937a64c5ebfc5104515ca840b40ee61dff9ccf395df` |
| `cli/runtime/extensions/host.ts` | `ce3e20157243dadb7da92f4d8b7213c5b4f92ac6f315b8eb287b4ca62285c5bb` |

All source paths in this table are relative to `packages/ts-shell/src/`. The subagent modified only this README and `installed-proposal.txt`; no product/test source, signed installation, worker execution, provider, tests, build, gates or NormProof ran in this task.
