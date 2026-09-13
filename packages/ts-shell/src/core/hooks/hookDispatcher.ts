import { createComponentLogger } from "../../observability/structuredLogger.js";
import { exec } from "node:child_process";
import type {
  HookEventPayload,
  HookDecision,
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
            const parsed = JSON.parse(stdout.trim()) as HookDecision;
            if (parsed.decision === "block" || parsed.decision === "retry") {
              return parsed;
            }
            if (parsed.feedback || parsed.hookSpecificOutput) {
              accumulatedDecision = parsed;
            }
          }
        } catch (err: unknown) {
          logger.error(`Command hook failed for event ${relevantEvent}`, {
            event: relevantEvent,
            command: hook.command,
            timeoutMs,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
    return accumulatedDecision ?? { decision: "allow" };
  }
}

export const defaultHookDispatcher = new HookDispatcher();
