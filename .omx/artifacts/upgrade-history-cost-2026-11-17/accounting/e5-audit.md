# E.5 bounded ownership audit

Date: 2026-11-17. Scope: TS/async resource loading, installation/shared extension host, and SDK configuration publication to UI binding. This audit inspected current source and existing receipts only. It did not run tests, builds, gates, installations, providers, or runtime counterexamples. Production and durable project docs were not edited.

## Remaining defect: SDK UI does not renew after same-binding publication

Confidence: high from the direct source path; runtime reproduction and reversal are still required.

`AgentSession.bindUi` calls `bindExtensionUiFor` once (`packages/ts-shell/src/sdk/agentSession.ts:184`). `createAgentSession` similarly binds `options.ui` once after claiming the resource host (`agentSession.ts:440-444`). Neither path retains a UI renewal owner or observes accepted configuration publications.

The shared binder captures `context.configuration.backgroundSignal` (`packages/ts-shell/src/cli/runtime/extensions/host.ts:94`) and attaches `release` to its abort (`host.ts:122`). Release aborts pending dialogs and sets the backing surface to undefined (`host.ts:96-104`). `ConfigState.publish` retires this signal even for a successful same-binding/no-change publication (`packages/ts-shell/src/config/state.ts:94-100`); `recordDisplay` also retires it (`state.ts:73-74`). The retained binding remains in `surfaces`; subsequent calls receive its aborted signal. `resolveUiHost` therefore returns false for confirm, undefined for other dialogs, and skips effects (`packages/ts-shell/src/extensions/runtime/ui.ts:39-53`).

The SDK's next prompt does not repair this: `AgentSession.prompt` forwards to `ShellSessionRuntime.executePrompt` (`agentSession.ts:214-225`), whose CLI factory refreshes extensions and awaits their initialization (`packages/ts-shell/src/cli/runtime/cliSessionRuntimeFactory.ts:305,368`), but those operations do not rebind UI. `refreshShellRuntimeConfig` only publishes and clears prompt identity (`packages/ts-shell/src/core/shell/runtimeContext.ts:204-207`). A caller can explicitly call `session.bindUi` again, but no SDK owner restores the originally supplied host automatically.

The CLI has the missing responsibility explicitly: `ExtensionUiBinding` retains the current release, notices retirement, reacquires configuration admission, refreshes extensions, and rebinds the host (`packages/ts-shell/src/cli/interactive/extensions/binding.ts:15-30`). Interactive command completion and picker publication invoke that owner (`packages/ts-shell/src/cli/interactive/interactiveMode.ts:1328,1483-1485`). This is a consumer gap in the SDK, not evidence that all publication retirement should be removed.

Precise future counterexample: create an SDK session with a preloaded inline/file extension and `options.ui`; prove a dialog reaches that host; start another pending dialog; perform a valid same-binding publication through the public `session.runtimeContext.configuration` or `refreshShellRuntimeConfig(session.runtimeContext)`; verify the old dialog cancels and a fresh extension call reaches the retained UI host. Assert no fresh call is admitted after dispose, explicit release, or root/session/trust revocation. This audit did not execute that scenario.

Do not use `session.prompt('/reload')` as the SDK trigger: the SDK forwards ordinary prompt text directly to the query runtime and does not call the separate CLI slash dispatcher. The noninteractive CLI dispatcher does expose `/reload` with a publication-only refresh callback (`packages/ts-shell/src/entrypoints/cliRuntimeModule.ts:215`), but it is a separate consumer.

## Existing safety boundaries to retain

The shared host captures session id/createdAt/cwd and configuration admission (`packages/ts-shell/src/cli/runtime/extensions/host.ts:27-38`). Explicit UI replacement and release retire only the captured surface; ordinary abort cancels dialogs while constructing a usable successor wrapper (`host.ts:115-119,133`). SDK dispose retires its consumed loader generation before joining other cleanup (`packages/ts-shell/src/sdk/agentSession.ts:273-297`). These are separate from same-binding publication renewal.

`DefaultResourceLoader` captures one generation/host claim, constructs retirement before committing a host, rejects another host on the same generation, and preserves later reload generations during old disposal (`packages/ts-shell/src/sdk/resourceLoader.ts:143-186`). Reload cancels its old controller and publishes the complete staged resource snapshot only after the final signal check (`resourceLoader.ts:189,309-316`). No new defect in these previously repaired paths was established by this bounded read.

## Installation/shared-host ownership and evidence limits

Signed package installation belongs to `extensions/lifecycle/install.ts:24-64`: exact version/manifest/digest, reviewed source/storage identity, bounded archive validation, locked staged rename plus registry publication, then invalidation. Installation clears activation/grants and does not execute lifecycle scripts. File/SDK loading is a separate consumer.

`installExtensionRuntime` supplies the same captured session bridge to file extensions and `ExtensionService` (`packages/ts-shell/src/cli/runtime/extensions.ts:53-62,76-81`). Installed execution passes `ExtensionService.options.extensionHost` through `extensions/runtime/execute.ts:27-45` into `executeInProcessScript` (`extensions/runtime/inProcessLoader.ts:384-405`). Its worker waits for an exported async factory before invoking a registered tool/command (`extensions/runtime/workerSource.ts:178-193`) and bridges UI through the captured host. This preserves distinct runtime/worker owners rather than proving all installation consumers as one path.

Existing installation tests cover real archive files, dirty/source substitution refusal, unknown publication receipts and cancellation (`packages/ts-shell/src/extensions/extensions.test.ts:108,135,146,155,182,189,198,205,237`). Worker TS execution and UI/host queries are covered separately (`packages/ts-shell/src/extensions/runtime/inProcessLoader.test.ts:76,165`). The inspected installation fixture is shell-script based; no inspected focused test or native receipt combines a signed installed async TS factory, the actual shared session host, pending dialog retirement, configuration renewal and post-renewal invocation. That remains a joint-consumer evidence gap, not a demonstrated install defect.

Earlier npm package/installed SDK evidence does exist and must not be described as never run:

- `.omx/artifacts/upgrade-sdk-2026-11-15/compaction-delivery.json`: build `d9acacbc4260...`, 2203 package entries, strict installed types, 15 public entries, configured SDK prompt/compact/reuse/reopen and lifecycle checks.
- `.omx/artifacts/upgrade-virtual-registration-2026-11-15/delivery.json`: build `047e196c6597...`, 2214 files, strict installed types, installed SDK/CLI async registration and generation retirement.
- `.omx/artifacts/upgrade-virtual-routing-2026-11-15/delivery.json`: build `083b3d78d8bf...`, 2224 files, strict installed types and installed SDK routing/cancel/reload observations.

Those receipts are tied to earlier builds and scopes. They do not establish current-source E.5 publication renewal, signed installed async-TS/shared-host joint qualification, or another platform. The E.5 task/summary therefore legitimately remain partial (`.wiki/refactor/upgrade/tasks.md:57`, `summary.md:88`).

## Targeted pi comparison

Inspected only the corresponding session/extension binding decisions after Cheers:

| pi decision | Evidence | Cheers disposition |
| --- | --- | --- |
| Session retains the UI context independently of the current extension runner. | `/home/wang/projects/pi/packages/coding-agent/src/core/agent-session.ts:3426-3447` | Agree. SDK needs an owner for the accepted host across same-binding publications; its current one-shot binder does not provide one. |
| Runtime reconstruction reapplies retained UI and command bindings to the new runner. | `agent-session.ts:3802-3816`; `_applyExtensionBindings` at `3504-3506` | Agree with renewal responsibility. Preserve Cheers' existing shared host and configuration admission rather than copying runner architecture. |
| Reload invalidates the old runner before rebuilding resources. | `agent-session.ts:3836-3860`; `/home/wang/projects/pi/packages/coding-agent/src/core/extensions/runner.ts:729-739` | Agree. Old dialog/callback cancellation and stale-owner refusal remain mandatory; renewal cannot reauthorize old work. |

The proposed same-binding publication/fresh-dialog counterexample should fail if retained UI renewal is reversed. Existing late-dialog tests protect the separate retirement decision.

## Focused tests available for the next main-owned serial batch

- `src/sdk/ui.test.ts:18,34`: UI after ordinary abort; disposal joins/cancels input-hook dialog. Add actual publication and explicit-release/revocation scenarios here.
- `src/cli/interactive/extensions.test.ts:336`: recaptures a configuration-retired surface and keeps failed admission unavailable. It invokes the CLI owner explicitly, not the SDK path.
- `src/cli/runtime/extensions.test.ts:38,51,62,87,103,145,158`: async file staging, atomic refusal, virtual registration collision, corrupt installed state and custom-host/profile answer ownership.
- `src/sdk/resourceLoader.test.ts:46,75,97,137,184` and `src/sdk/lifecycle.test.ts:21,44,77,91,108,127,144,160`: generation claims, old confirmation cancellation, failed capture and complete cleanup.
- `src/extensions/runtime/ui.test.ts:6,24,49,64`, `src/extensions/runtime/initialization.test.ts:18`, `src/extensions/runtime/inProcessLoader.test.ts:76,165`, and `src/extensions/extensions.test.ts`: original-dialog authority, async factory closure, worker/installation consumers.

No approval, CLEAR disposition, or runtime reproduction is inferred from this read-only audit. Main owns counterexamples, source hashes, serial validation and any E.5 promotion.
