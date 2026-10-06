/**
 * Registering the hooks a configuration file declares.
 *
 * Registration and permission are deliberately separate steps. Everything a file
 * declares is registered, carrying the fingerprint of what it would do; whether it
 * may actually run is decided in the dispatcher, at the moment it would fire.
 *
 * Splitting them that way is what makes "declared but not allowed" a visible
 * state rather than an absence. A hook that were simply never registered would be
 * indistinguishable from one that was never written, so nothing could tell the
 * user what the repository asked for — which is the thing they are being asked to
 * judge.
 *
 * Two properties make the gate meaningful:
 *
 *   1. The fingerprint covers the event, the matcher and the command, so editing
 *      what will run invalidates any earlier approval and asks again. Approving a
 *      name must not approve a different program.
 *   2. The record of approvals lives in the user's own directory. If it lived in
 *      the workspace, a repository could ship a hook together with its own
 *      approval and the gate would never ask anyone anything.
 */

import path from "node:path";
import { createComponentLogger } from "../../observability/structuredLogger.js";
import { loadHookDeclarations } from "./config.js";
import { hookFingerprint, HookTrustStore } from "./trust.js";
import type { HookDispatcher } from "./hookDispatcher.js";
import type { CommandHookConfig, HookApprovalRequest } from "./types.js";
export type { HookApprovalRequest } from "./types.js";

const logger = createComponentLogger("hook-trust");

export interface HookRegistrationOptions {
  readonly admission?: () => string | undefined;
  /** Where the user's own hooks live. Overridden by tests. */
  readonly homeDir?: string
  readonly trustStore?: HookTrustStore
  /** How to ask the user about a command. Absent means nothing may run. */
  readonly requestApproval?: HookApprovalRequest
  /**
   * Run declared commands without approval.
   *
   * Set only from an explicit command-line flag. The dispatcher announces each
   * command it runs this way, so the exemption is visible rather than implied.
   */
  readonly bypassed?: boolean
}

/**
 * Register every declared hook, and nothing else.
 *
 * The dispatcher decides which may run; this decides only what they are. Parsing
 * happens here so a malformed configuration costs its own hooks rather than the
 * run, and so the problems it found are reported once.
 */
export function registerDeclaredHooks(
  dispatcher: HookDispatcher,
  workspaceRoot: string,
  options?: HookRegistrationOptions,
): { readonly registered: number; readonly problems: readonly string[] } {
  const { hooks, problems } = loadHookDeclarations(workspaceRoot, {
    homeDir: options?.homeDir,
  });

  for (const problem of problems) {
    logger.warn(problem);
  }

  const store = options?.trustStore ?? new HookTrustStore();
  dispatcher.setCommandHookTrust({
    admission: options?.admission,
    store,
    requestApproval: options?.requestApproval,
    bypassed: options?.bypassed === true,
  });

  for (const hook of hooks) {
    dispatcher.registerCommandHook({
      name: `${path.basename(hook.sourcePath)}:${hook.event}`,
      event: hook.event,
      matcher: hook.matcher,
      command: hook.command,
      // Carried so the dispatcher can name what it is asking about, and so an
      // approval attaches to this command rather than to the file that held it.
      fingerprint: hookFingerprint(hook),
      sourcePath: hook.sourcePath,
    } satisfies CommandHookConfig);
  }

  return { registered: hooks.length, problems };
}
