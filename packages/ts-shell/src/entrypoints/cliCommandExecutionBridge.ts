import { routeSlashCommand } from "../core/commands/slashRouter.js";
import type { RuntimeConfig } from "../config/runtimeConfig.js";
import { createBrowserCliExecutionBridge } from "../browser/cliExecutionBridge.js";
import { loadBrowserCliExecutorInjectionFromEnv } from "../browser/cliExecutorInjection.js";
import { loadBrowserReceiptCacheManifestFromEnv } from "../browser/receipt/manifest.js";
import { createBrowserReceiptCacheStore } from "../browser/receipt/store.js";
import {
  createBrowserExternalNetworkRunnerHarnessContext,
  loadBrowserExternalNetworkRunnerManifestFromEnv,
} from "../browser/externalNetworkRunnerManifest.js";
import {
  createBrowserControlledNetworkHarnessContext,
  loadBrowserControlledNetworkRunnerManifestFromEnv,
} from "../browser/controlledNetworkRunnerManifest.js";
import {
  createBrowserPublicReadOnlyWebHarnessContext,
  loadBrowserPublicReadOnlyWebManifestFromEnv,
} from "../browser/publicReadOnlyWebManifest.js";
import { parseBrowserPublicReadOnlyWebSmokeConfig } from "../core/harness/browserPublicReadOnlyWebSmokeConfig.js";
import type { CompactInjectionStateStore } from "../context/compact/injection/compactInjectionState.js";
import type { CompactLiveCheckpointStore } from "../context/compact/checkpoint/compactLiveCheckpoint.js";
import type { StreamingRenderer } from "../presentation/terminal/streaming.js";

type SlashRouteResult = Awaited<ReturnType<typeof routeSlashCommand>>;

export type CliCommandExecution =
  | { readonly kind: "handled" }
  | {
      readonly kind: "shell-action";
      readonly slashResult: Extract<SlashRouteResult, { kind: "shell-action" }>;
    }
  | { readonly kind: "execute"; readonly effectivePrompt: string };

export interface BuildCliCommandExecutionInput {
  readonly prompt: string;
  readonly cwd: string;
  readonly renderer: StreamingRenderer;
  readonly printMode: boolean;
  readonly interactive: boolean;
  readonly sessionId?: string;
  readonly compactCheckpointStore?: CompactLiveCheckpointStore;
  readonly compactInjectionStateStore?: CompactInjectionStateStore;
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** True when the terminal agreed to report modified keys. */
  readonly modifierKeysReported?: boolean;
  /** How `/reload` re-reads the session's configuration. Absent off-session. */
  readonly refreshRuntimeConfig?: () => { readonly before: RuntimeConfig; readonly after: RuntimeConfig };
}

export interface CliCommandExecutionBridge {
  readonly routeSlashCommand: typeof routeSlashCommand;
}

const defaultCliCommandExecutionBridge: CliCommandExecutionBridge = {
  routeSlashCommand,
};

export async function buildCliCommandExecution(
  input: BuildCliCommandExecutionInput,
  bridge: CliCommandExecutionBridge = defaultCliCommandExecutionBridge,
): Promise<CliCommandExecution> {

  const browserCliExecutionBridge = createBrowserCliExecutionBridge(
    loadBrowserCliExecutorInjectionFromEnv({ env: input.env }),
  );
  const browserExternalNetworkRunnerManifest = loadBrowserExternalNetworkRunnerManifestFromEnv({ env: input.env });
  const browserExternalNetworkRunnerContext = createBrowserExternalNetworkRunnerHarnessContext(
    browserExternalNetworkRunnerManifest,
  );
  const browserControlledNetworkRunnerManifest = loadBrowserControlledNetworkRunnerManifestFromEnv({ env: input.env });
  const browserControlledNetworkRunnerContext = createBrowserControlledNetworkHarnessContext(
    browserControlledNetworkRunnerManifest,
  );
  const browserPublicReadOnlyWebManifest = loadBrowserPublicReadOnlyWebManifestFromEnv({ env: input.env });
  const browserPublicReadOnlyWebContext = createBrowserPublicReadOnlyWebHarnessContext({
    manifestLoad: browserPublicReadOnlyWebManifest,
    env: input.env,
  });
  const browserPublicReadOnlyWebSmokeConfig = parseBrowserPublicReadOnlyWebSmokeConfig({ env: input.env });
  const receiptCacheManifest = loadBrowserReceiptCacheManifestFromEnv({ env: input.env });
  const browserReceiptCacheStore = receiptCacheManifest.ok
    ? createBrowserReceiptCacheStore({ manifest: receiptCacheManifest.manifest })
    : undefined;
  const slashResult = await bridge.routeSlashCommand(input.prompt, {
    cwd: input.cwd,
    sessionId: input.sessionId,
    modifierKeysReported: input.modifierKeysReported,
    refreshRuntimeConfig: input.refreshRuntimeConfig,
    compactCheckpointStore: input.compactCheckpointStore,
    compactInjectionStateStore: input.compactInjectionStateStore,
    browserReceiptCacheStore,
    ...browserCliExecutionBridge,
    ...browserExternalNetworkRunnerContext,
    ...browserControlledNetworkRunnerContext,
    ...browserPublicReadOnlyWebContext,
    browserExternalNetworkRunnerManifest,
    browserControlledNetworkRunnerManifest,
    browserPublicReadOnlyWebManifest,
    browserPublicReadOnlyWebSmokeConfig,
  });
  if (slashResult?.kind === "local") {
    input.renderer.renderLine(
      input.printMode ? slashResult.output : `\n${slashResult.output}\n`,
    );
    return { kind: "handled" };
  }

  if (slashResult?.kind === "shell-action") {
    return { kind: "shell-action", slashResult };
  }

  if (slashResult?.kind === "prompt" && input.interactive) {
    // A command that supplied its own line says what it is doing; one that did not
    // is handing back text the user wrote, which is worth showing back to them.
    input.renderer.renderLine(
      slashResult.notice
        ? `\n${slashResult.notice}\n`
        : `\nSlash command expanded into prompt:\n${slashResult.prompt}\n`,
    );
  }
  const rawPrompt =
    slashResult?.kind === "prompt" ? slashResult.prompt : input.prompt;
  return {
    kind: "execute",
    effectivePrompt: rawPrompt,
  };
}

export function projectCliCommandExecution(input: {
  readonly prompt: string;
}): { readonly effectivePrompt: string } {
  return {
    effectivePrompt: input.prompt,
  };
}
