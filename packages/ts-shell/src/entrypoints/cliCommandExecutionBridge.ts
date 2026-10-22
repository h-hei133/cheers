import type { KeyBinding } from "../presentation/tui/chrome/keys.js";
import type { PromptAttachments } from "../core/shell/sessionRuntime.js";
import { routeSlashCommand } from "../core/commands/slashRouter.js";
import { createProjectMemoryLocalStore } from "../memory/projectMemoryLocalStore.js";
import { projectMemoryRootFor } from "../memory/projectMemoryRoot.js";
import type { ProjectMemoryStore } from "../memory/projectMemoryStoreContract.js";
import type { RuntimeConfig } from "../config/runtimeConfig.js";
import type { CommandContext } from "../core/commands/types.js";
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
import { parseBrowserPublicReadOnlyWebSmokeConfig } from "../browser/smoke/config.js";
import type { CompactInjectionStateStore } from "../context/compact/injection/compactInjectionState.js";
import type { CompactLiveCheckpointStore } from "../context/compact/checkpoint/compactLiveCheckpoint.js";
import type { StreamingRenderer } from "../presentation/terminal/streaming.js";
import type { SessionMessage } from "../session/schema/sessionMessage.js";
import type { ReportWriter } from '../session/reports/model.js';
import { renderLocalCommand, renderSignInProgress } from '../cli/output/command.js';

type SlashRouteResult = Awaited<ReturnType<typeof routeSlashCommand>>;

export type CliCommandExecution =
  | { readonly kind: "handled" }
  | {
      readonly kind: "shell-action";
      readonly slashResult: Extract<SlashRouteResult, { kind: "shell-action" }>;
    }
  | {
      readonly kind: "execute";
      readonly effectivePrompt: string;
      readonly promptMetadata?: Record<string, unknown>;
      /** Images that travelled with the draft; see `PromptAttachments`. */
      readonly attachments?: PromptAttachments;
    };

export interface BuildCliCommandExecutionInput {
  readonly runCancellable?: CommandContext['runCancellable'];
  readonly freshState?: CommandContext['freshState'];
  readonly restart?: CommandContext['restart'];
  readonly profileSwitch?: CommandContext['profileSwitch'];
  readonly startupArgs?: CommandContext['startupArgs'];
  readonly sessionCommand?: CommandContext['sessionCommand'];
  readonly dataTransfer?: CommandContext['dataTransfer'];
  readonly ruleControlsCommand?: CommandContext['ruleControlsCommand'];
  readonly forceTool?: CommandContext['forceTool'];
  readonly handoffCommand?: CommandContext['handoffCommand'];
  readonly directorCommand?: CommandContext['directorCommand'];
  readonly mediaCommand?: CommandContext['mediaCommand'];
  readonly improveCommand?: CommandContext['improveCommand'];
  readonly jobsCommand?: CommandContext['jobsCommand'];
  readonly workflowCommand?: CommandContext['workflowCommand'];
  readonly extensionCommand?: CommandContext['extensionCommand'];
  readonly requestPolicy?: CommandContext['requestPolicy'];
  readonly goalCommand?: CommandContext['goalCommand'];
  readonly planningCommand?: CommandContext['planningCommand'];
  readonly queueCommand?: CommandContext['queueCommand'];
  readonly advisorCommand?: CommandContext['advisorCommand'];
  readonly researchCommand?: CommandContext['researchCommand'];
  readonly gitCommand?: CommandContext['gitCommand'];
  readonly securityCommand?: CommandContext['securityCommand'];
  readonly agentsCommand?: CommandContext['agentsCommand'];
  readonly mcpCommand?: CommandContext['mcpCommand'];
  readonly usageCommand?: CommandContext['usageCommand'];
  readonly settingsCommand?: CommandContext['settingsCommand'];
  readonly collaborationCommand?: CommandContext['collaborationCommand'];
  readonly sshCommand?: CommandContext['sshCommand'];
  readonly worktreeCommand?: CommandContext['worktreeCommand'];
  readonly commitCommand?: CommandContext['commitCommand'];
  readonly prompt: string;
  /** Images the draft referred to, carried beside the text rather than in it. */
  readonly attachments?: PromptAttachments;
  readonly cwd: string;
  /** The project root, when it differs from `cwd`. See `CommandContext.projectRoot`. */
  readonly projectRoot?: string;
  readonly renderer: StreamingRenderer;
  readonly printMode: boolean;
  readonly interactive: boolean;
  readonly sessionId?: string;
  readonly workspaceRoots?: CommandContext['workspaceRoots'];
  readonly onTurnMessage?: (message: SessionMessage) => void;
  readonly onReport?: ReportWriter;
  /**
   * How this run was asked to load skills.
   *
   * Passed to the router so a skill named with `--skill` resolves here too, and
   * an untrusted project's skills stay out of the prompt the same way they are
   * kept out of the model's skill list.
   */
  readonly skillOptions?: {
    readonly skillPaths?: readonly string[];
    readonly noSkills?: boolean;
  };
  /** Theme paths this run was started with, so `/theme` can still select them. */
  readonly themePaths?: readonly string[];
  readonly compactCheckpointStore?: CompactLiveCheckpointStore;
  readonly compactInjectionStateStore?: CompactInjectionStateStore;
  /**
   * Overrides the memory store the commands write through.
   *
   * Absent means the project's own store, derived from the project root. A
   * caller that supplies one is testing the command rather than the layout.
   */
  readonly projectMemoryStore?: ProjectMemoryStore;
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** True when the terminal agreed to report modified keys. */
  readonly keyGuide?: readonly KeyBinding[];
  readonly modifierKeysReported?: boolean;
  /** How `/reload` re-reads the session's configuration. Absent off-session. */
  readonly runtimeConfig?: RuntimeConfig;
  readonly resolveConfigTarget?: CommandContext['resolveConfigTarget'];
  readonly readConfiguration?: CommandContext['readConfiguration'];
  readonly recordAuxiliaryUsage?: CommandContext['recordAuxiliaryUsage'];
  readonly admission?: CommandContext['admission'];
  readonly refreshRuntimeConfig?: CommandContext['refreshRuntimeConfig'];
  readonly getToolPool?: CommandContext["getToolPool"];
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
  // The same store the turn-side injection planner reads from, so a record
  // `/memory save` writes is a record `/memory use` can inject. Deriving it here
  // is what makes the two sides agree without each caller repeating the root.
  const projectRoot = input.projectRoot ?? input.cwd;
  const projectMemoryStore =
    input.projectMemoryStore ??
    createProjectMemoryLocalStore({
      ref: { mode: "explicit-local", root: projectMemoryRootFor(projectRoot) },
    });
  const slashResult = await bridge.routeSlashCommand(input.prompt, {
    signInProgress: progress => renderSignInProgress(input.renderer, progress),
    runCancellable: input.runCancellable,
    freshState: input.freshState,
    restart: input.restart,
    profileSwitch: input.profileSwitch,
    startupArgs: input.startupArgs,
    sessionCommand: input.sessionCommand,
    dataTransfer: input.dataTransfer,
    ruleControlsCommand: input.ruleControlsCommand,
    forceTool: input.forceTool,
    extensionCommand: input.extensionCommand,
    goalCommand: input.goalCommand,
    planningCommand: input.planningCommand,
    queueCommand: input.queueCommand,
    advisorCommand: input.advisorCommand,
    researchCommand: input.researchCommand,
    gitCommand: input.gitCommand,
    securityCommand: input.securityCommand,
    agentsCommand: input.agentsCommand,
    mcpCommand: input.mcpCommand,
    usageCommand: input.usageCommand,
    settingsCommand: input.settingsCommand,
    collaborationCommand: input.collaborationCommand,
    sshCommand: input.sshCommand,
    handoffCommand: input.handoffCommand,
    directorCommand: input.directorCommand,
    improveCommand: input.improveCommand,
    mediaCommand: input.mediaCommand,
    jobsCommand: input.jobsCommand,
    workflowCommand: input.workflowCommand,
    worktreeCommand: input.worktreeCommand,
    commitCommand: input.commitCommand,
    requestPolicy: input.requestPolicy,
    cwd: input.cwd,
    interactive: input.interactive,
    projectRoot,
    projectMemoryStore,
    sessionId: input.sessionId,
    ...(input.skillOptions ? { skillOptions: input.skillOptions } : {}),
    ...(input.themePaths ? { themePaths: input.themePaths } : {}),
    modifierKeysReported: input.modifierKeysReported,
    keyGuide: input.keyGuide,
    refreshRuntimeConfig: input.refreshRuntimeConfig,
    runtimeConfig: input.runtimeConfig,
    resolveConfigTarget: input.resolveConfigTarget,
    readConfiguration: input.readConfiguration,
    recordAuxiliaryUsage: input.recordAuxiliaryUsage,
    admission: input.admission,
    workspaceRoots: input.workspaceRoots,
    getToolPool: input.getToolPool,
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
    renderLocalCommand({ ...input, result: slashResult });
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
  // Everything else the user typed is a prompt, and it is sent as written. An
  // earlier version expanded a template whose name was the first word of the line,
  // which meant a file named `review.md` could quietly replace the sentence
  // "review this function" with the template's body: the user's own words
  // disappeared without anything asking. Templates are invoked with the slash the
  // file is documented under, which is also the only form the router resolves.
  return {
    kind: "execute",
    effectivePrompt: slashResult?.kind === "prompt" ? slashResult.prompt : input.prompt,
    ...(slashResult?.kind === 'prompt' && slashResult.promptMetadata ? { promptMetadata: slashResult.promptMetadata } : {}),
    // A slash command resolves to a prompt template, and a template has no way to
    // refer to an attachment; the images the draft held still belong to the turn,
    // so they travel with whichever text is finally sent.
    ...(input.attachments ? { attachments: input.attachments } : {}),
  };
}

export function projectCliCommandExecution(input: {
  readonly prompt: string;
}): { readonly effectivePrompt: string } {
  return {
    effectivePrompt: input.prompt,
  };
}
