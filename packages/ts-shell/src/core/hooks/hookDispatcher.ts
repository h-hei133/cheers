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
    if (payload.eventName === "PreToolUse" || payload.eventName === "PostToolUse") {
      target = (payload as PreToolUsePayload | PostToolUsePayload).toolName;
    } else if (payload.eventName === "UserPromptSubmit") {
      target = (payload as any).prompt || "";
    }

    try {
      const regex = new RegExp(matcher, "i");
      return regex.test(target);
    } catch {
      return matcher.toLowerCase() === target.toLowerCase();
    }
  }

  /**
   * Dispatch an event through all matching in-process and command hooks
   */
  async dispatch(payload: HookEventPayload): Promise<HookDecision | null> {
    const relevantEvent = payload.eventName;
    let accumulatedDecision: HookDecision | null = null;

    // 1. Execute In-Process Hooks
    for (const hook of this.inProcessHooks) {
      if (hook.event === relevantEvent && this.matches(hook.matcher, payload)) {
        try {
          const decision = await hook.handler(payload);
          if (decision) {
            // If any hook blocks or requests retry, immediately stop and return
            if (decision.decision === "block" || decision.decision === "retry") {
              return decision;
            }
            // Only accumulate if decision carries actionable feedback or specific output
            if (decision.feedback || decision.hookSpecificOutput) {
              if (!accumulatedDecision) {
                accumulatedDecision = decision;
              }
            }
          }
        } catch (err: any) {
          // Log hook error without crashing the main loop
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

          // Attempt to parse JSON decision from stdout if provided
          if (stdout.trim().startsWith("{")) {
            try {
              const parsed = JSON.parse(stdout.trim()) as HookDecision;
              if (parsed.decision && parsed.decision !== "allow") {
                return parsed;
              }
            } catch {
              // Not JSON output, exit 0 is considered allow
            }
          }
        } catch (err: any) {
          // Non-zero exit code blocks the tool or emits feedback
          const errOutput = [err.stderr, err.stdout].filter(Boolean).join("\n") || err.message;
          return {
            decision: "block",
            reason: `Hook '${hook.command}' rejected action with exit code ${err.status ?? err.code ?? 1}`,
            feedback: errOutput.slice(0, 2000),
          };
        }
      }
    }

    return accumulatedDecision;
  }
}

export const defaultHookDispatcher = new HookDispatcher();
