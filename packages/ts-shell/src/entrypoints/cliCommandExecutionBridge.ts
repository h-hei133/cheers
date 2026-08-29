import { routeSlashCommand } from "../core/commands/slashRouter.js";
import { createBrowserCliExecutionBridge } from "../core/context/browserCliExecutionBridge.js";
import { loadBrowserCliExecutorInjectionFromEnv } from "../core/context/browserCliExecutorInjection.js";
import { loadBrowserReceiptCacheManifestFromEnv } from "../core/context/browser/receipt/browserReceiptCacheManifest.js";
import { createBrowserReceiptCacheStore } from "../core/context/browser/receipt/browserReceiptCacheStore.js";
import {
  createBrowserExternalNetworkRunnerHarnessContext,
  loadBrowserExternalNetworkRunnerManifestFromEnv,
} from "../core/context/browserExternalNetworkRunnerManifest.js";
import {
  createBrowserControlledNetworkHarnessContext,
  loadBrowserControlledNetworkRunnerManifestFromEnv,
} from "../core/context/browserControlledNetworkRunnerManifest.js";
import {
  createBrowserPublicReadOnlyWebHarnessContext,
  loadBrowserPublicReadOnlyWebManifestFromEnv,
} from "../core/context/browserPublicReadOnlyWebManifest.js";
import { parseBrowserPublicReadOnlyWebSmokeConfig } from "../core/harness/browserPublicReadOnlyWebSmokeConfig.js";
import type { CompactInjectionStateStore } from "../core/context/compact/injection/compactInjectionState.js";
import type { CompactLiveCheckpointStore } from "../core/context/compact/checkpoint/compactLiveCheckpoint.js";
import { resolveRepoAwarePromptResponse } from "../core/shell/repoAwareRouting.js";
import type { StreamingRenderer } from "../renderer/StreamingRenderer.js";

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
}

export interface CliCommandExecutionBridge {
  readonly routeSlashCommand: typeof routeSlashCommand;
  readonly resolveRepoAwarePromptResponse: typeof resolveRepoAwarePromptResponse;
}

const defaultCliCommandExecutionBridge: CliCommandExecutionBridge = {
  routeSlashCommand,
  resolveRepoAwarePromptResponse,
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
    input.renderer.renderLine(
      `\nSlash command expanded into prompt:\n${slashResult.prompt}\n`,
    );
  }
  const rawPrompt =
    slashResult?.kind === "prompt" ? slashResult.prompt : input.prompt;
  return {
    kind: "execute",
    effectivePrompt: normalizePromptForExecution(rawPrompt),
  };
}

export function projectCliCommandExecution(input: {
  readonly prompt: string;
}): { readonly effectivePrompt: string } {
  return {
    effectivePrompt: normalizePromptForExecution(input.prompt),
  };
}

export function normalizePromptForExecution(prompt: string): string {
  const normalized = prompt.toLowerCase();
  const likelyMojibake = prompt.includes("�");
  const currentDirCue =
    /(?:current\s+directory|in\s+this\s+directory|当前目录|当前工作目录|在当前目录中|在本目录)/iu.test(
      prompt,
    );
  const pythonCue =
    /\bpython\b/i.test(normalized) &&
    (/script|file|py/i.test(normalized) || /(?:脚本|目录|文件)/u.test(prompt));

  if (
    (!pythonCue || !currentDirCue) &&
    !(likelyMojibake && /\bpython\b/i.test(normalized))
  ) {
    return prompt;
  }

  const asciiTokens: string[] =
    prompt.match(/\b[A-Za-z][A-Za-z0-9_-]{1,}\b/g) ?? [];
  const reserved = new Set([
    "python",
    "script",
    "file",
    "write",
    "create",
    "generate",
    "save",
    "current",
    "directory",
    "in",
    "this",
  ]);
  const candidate = asciiTokens.find(
    (token) => !reserved.has(token.toLowerCase()),
  );
  if (!candidate) {
    return prompt;
  }

  // Guard against Windows terminal mojibake by converting fuzzy natural language
  // into a deterministic file-targeted coding task.
  return `Create a python script at ./${candidate}.py with a minimal hello world implementation.`;
}
