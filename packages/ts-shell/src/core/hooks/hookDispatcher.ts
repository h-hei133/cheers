import { createComponentLogger } from "../../observability/structuredLogger.js";
import type { HookTrustStore } from "./trust.js";
import { exec } from "node:child_process";
import type {
  HookEventPayload,
  HookDecision,
  HookApprovalRequest,
  InProcessHookConfig,
  CommandHookConfig,
  HooksConfiguration,
  PreToolUsePayload,
  PostToolUsePayload,
} from "./types.js";

const logger = createComponentLogger("HookDispatcher");

export class HookDispatcher {
  private commandHooks: CommandHookConfig[] = [];
  private inProcessHooks: InProcessHookConfig[] = [];
  private trust: { store: HookTrustStore; requestApproval?: HookApprovalRequest } | undefined;

  /**
   * How declared hooks are checked before they run.
   *
   * Set by the registration step rather than passed per call, because a hook that
   * arrived without it must not fall through to running: an unconfigured
   * dispatcher refuses declared hooks and says so, which is the safe reading of
   * "nobody has been asked".
   */
  setCommandHookTrust(trust: { store: HookTrustStore; requestApproval?: HookApprovalRequest }): void {
    this.trust = trust;
  }

  /**
   * Whether a declared hook may run, asking the user the first time.
   *
   * A hook with no fingerprint did not come from a file — it was registered by
   * this process, which is the process's own code and needs no permission.
   */
  private async declaredHookIsAllowed(hook: CommandHookConfig): Promise<boolean> {
    if (hook.fingerprint === undefined) return true;
    if (this.trust === undefined) {
      // Nothing can be asked, so nothing may run. A non-interactive run must not
      // execute a repository's commands merely because nobody was there to say no.
      logger.warn(
        `Refusing declared hook '${hook.command}' because no approval path is configured.`,
      );
      return false;
    }
    if (this.trust.store.isTrusted(hook.fingerprint)) return true;

    const approved = await this.trust.requestApproval?.({
      command: hook.command,
      event: hook.event,
      matcher: hook.matcher,
      sourcePath: hook.sourcePath ?? "(unknown)",
    });
    if (approved !== true) {
      logger.info(`Declared hook '${hook.command}' was not approved and will not run.`);
      return false;
    }
    this.trust.store.recordTrust(hook.fingerprint, `${hook.event}:${hook.command}`);
    return true;
  }

  constructor(config?: HooksConfiguration) {
    if (config?.commandHooks) {
      this.commandHooks.push(...config.commandHooks);
    }
    if (config?.inProcessHooks) {
      this.inProcessHooks.push(...config.inProcessHooks);
    }
  }

  /**
   * Register a custom in-process hook (e.g. verification compiler guard, test runner)
   */
  registerInProcessHook(hook: InProcessHookConfig): void {
    this.inProcessHooks.push(hook);
  }

  /**
   * Register a command-based hook (e.g. from .agents/hooks.json or settings)
   */
  registerCommandHook(hook: CommandHookConfig): void {
    this.commandHooks.push(hook);
  }

  /**
   * Clear all registered hooks
   */
  clear(): void {
    this.commandHooks = [];
    this.inProcessHooks = [];
  }

  private matches(matcher: string | undefined, payload: HookEventPayload): boolean {
    if (!matcher || matcher === "*") {
      return true;
    }

    let target = "";
    if (payload.eventName === "PreToolUse" || payload.eventName === "PostToolUse" || payload.eventName === "PostToolUseFailure") {
      target = (payload as PreToolUsePayload | PostToolUsePayload).toolName;
    }

    if (!target) {
      return true;
    }

    try {
      const regex = new RegExp(matcher);
      return regex.test(target);
    } catch {
      return matcher.toLowerCase() === target.toLowerCase();
    }
  }

  async dispatch(payload: HookEventPayload): Promise<HookDecision> {
    const eventType = payload.eventName;
    logger.debug(`Dispatching lifecycle hook event: ${eventType}`, {
      event: eventType,
      hookCount: this.inProcessHooks.length + this.commandHooks.length,
    });

    let accumulatedDecision: HookDecision | null = null;
    const relevantEvent = payload.eventName;

    // 1. Run in-process hooks
    for (const hook of this.inProcessHooks) {
      if (hook.event === relevantEvent && this.matches(hook.matcher, payload)) {
        try {
          const decision = await hook.handler(payload);
          if (decision) {
            if (decision.decision === "block" || decision.decision === "retry") {
              logger.warn(`Hook ${hook.name || "in-process"} returned blocking decision: ${decision.decision}`, {
                event: relevantEvent,
                decision: decision.decision,
              });
              return decision;
            }
            if (decision.feedback || decision.hookSpecificOutput) {
              if (!accumulatedDecision) {
                accumulatedDecision = decision;
              }
            }
          }
        } catch (err: unknown) {
          logger.error(`Error in in-process hook handler: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // 2. Execute Command Hooks (Shell scripts with JSON stdin/stdout)
    for (const hook of this.commandHooks) {
      if (hook.event === relevantEvent && this.matches(hook.matcher, payload)) {
        if (!(await this.declaredHookIsAllowed(hook))) continue;
        const timeoutMs = hook.timeoutMs ?? 15_000;
        const jsonPayload = JSON.stringify(payload);

        try {
          const stdout = await new Promise<string>((resolve, reject) => {
            const child = exec(
              hook.command,
              {
                cwd: payload.workspaceRoot,
                timeout: timeoutMs,
                maxBuffer: 1024 * 1024,
              },
              (error, stdoutBuf, stderrBuf) => {
                if (error) {
                  const errObj = error as any;
                  errObj.stderr = stderrBuf;
                  errObj.stdout = stdoutBuf;
                  reject(errObj);
                } else {
                  resolve(stdoutBuf);
                }
              },
            );

            if (child.stdin) {
              child.stdin.write(jsonPayload);
              child.stdin.end();
            }
          });

          if (stdout && stdout.trim()) {
            // Parsed inside its own guard so unreadable output is reported as
            // what it is: the hook produced something, and it could not be
            // understood, which is not the same as the hook saying nothing.
            let parsed: HookDecision;
            try {
              parsed = JSON.parse(stdout.trim()) as HookDecision;
            } catch {
              logger.error(
                `Command hook returned output that is not valid JSON for event ${relevantEvent}`,
                { event: relevantEvent, command: hook.command },
              );
              throw new Error("hook returned invalid JSON output");
            }
            if (parsed.decision === "block" || parsed.decision === "retry") {
              return parsed;
            }
            if (parsed.feedback || parsed.hookSpecificOutput) {
              accumulatedDecision = parsed;
            }
          }
        } catch (err: unknown) {
          // A hook that could not run has not answered, and "no answer" used to
          // be read as "no objection" — so a safety hook that timed out allowed
          // exactly what it existed to stop. A failure on a `PreToolUse` hook is
          // now a refusal rather than a shrug; on the observing events it stays a
          // logged failure, since there is nothing to refuse.
          const detail = err instanceof Error ? err.message : String(err);
          logger.error(`Command hook failed for event ${relevantEvent}`, {
            event: relevantEvent,
            command: hook.command,
            timeoutMs,
            error: detail,
          });
          if (relevantEvent === "PreToolUse") {
            return {
              decision: "block",
              reason: `The PreToolUse hook '${hook.command}' could not run (${detail}), so the action was not allowed.`,
            };
          }
        }
      }
    }
    return accumulatedDecision ?? { decision: "allow" };
  }
}

export const defaultHookDispatcher = new HookDispatcher();
