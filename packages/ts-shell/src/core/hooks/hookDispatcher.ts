import { createComponentLogger } from "../../observability/structuredLogger.js";
import { HOOK_TRUST_BYPASS_NOTICE } from "./types.js";
import type { HookTrustStore } from "./trust.js";
import { execFile } from "node:child_process";
import path from "node:path";
import { dispatchStop } from './stop/dispatch.js';
import type { StopDispatchOptions } from './stop/model.js';
import type { StopPayload } from './types.js';
import { planSandboxedCommand } from "../../sandbox/osSandbox.js";
import { checkWriteHookArtifact, writeHookCommand } from './artifact.js';
import { applyWriteHookPolicy, canonicalToolName, hookUnknown, mergeWriteHookResult, normalizeHookVeto, translateWriteInput, translateWriteInputs, translateWriteResult } from './translation.js';
import { getExtensionEventRunners } from './extensionBridge.js';
import type {
  HookEventPayload,
  HookDecision,
  HookApprovalRequest,
  HookEventName,
  InProcessHookConfig,
  CommandHookConfig,
  HooksConfiguration,
  PreToolUsePayload,
  PostToolUsePayload,
} from "./types.js";

const logger = createComponentLogger("HookDispatcher");

interface CommandHookTrust {
  readonly workspaceRoot?: string;
  readonly store: HookTrustStore;
  readonly requestApproval?: HookApprovalRequest;
  readonly bypassed?: boolean;
  readonly admission?: () => string | undefined;
}

/**
 * The shell a hook command is written for.
 *
 * A hook's `command` is a shell command line, so it needs a shell to interpret
 * it. Named once because the sandbox plan and the unconfined path must agree on
 * which shell that is.
 */
const SHELL_BIN = "/bin/sh";

/**
 * A command hook that did not finish normally.
 *
 * Carried as one value rather than an `any`-shaped node error so the exit code
 * and stderr survive to where the block contract is applied — a non-zero exit is
 * a failure, but exit 2 with something on stderr is an instruction to refuse.
 */
class CommandHookFailure extends Error {
  constructor(
    message: string,
    readonly exitCode: number | undefined,
    readonly stderr: string,
    readonly timedOut: boolean,
    readonly stdout: string = '',
  ) {
    super(message);
    this.name = "CommandHookFailure";
  }
}

/**
 * How long a hook on `event` may run.
 *
 * Events that fire while the session is winding down get a short budget: a hook
 * that cannot finish quickly there delays the exit itself, and the work it was
 * going to do is already moot.
 */
function hookTimeoutMs(event: HookEventName): number {
  return event === "SessionEnd" || event === "Stop" || event === "StopFailure"
    ? 3_000
    : 15_000;
}

export class HookDispatcher {
  private commandHooks: CommandHookConfig[] = [];
  private inProcessHooks: InProcessHookConfig[] = [];
  private trust?: CommandHookTrust;

  /**
   * How declared hooks are checked before they run.
   *
   * Set by the registration step rather than passed per call, because a hook that
   * arrived without it must not fall through to running: an unconfigured
   * dispatcher refuses declared hooks and says so, which is the safe reading of
   * "nobody has been asked".
   */
  setCommandHookTrust(trust: CommandHookTrust, declaredHooks?: readonly CommandHookConfig[]): void {
    if (declaredHooks) {
      // Registration publishes one snapshot. Preserve process-owned hooks while
      // retiring earlier declarations, including ones removed from disk.
      this.commandHooks = [...this.commandHooks.filter(hook => hook.fingerprint === undefined), ...declaredHooks];
    }
    this.trust = trust;
  }

  /**
   * Whether a declared hook may run, asking the user the first time.
   *
   * A hook with no fingerprint did not come from a file — it was registered by
   * this process, which is the process's own code and needs no permission.
   */
  private async declaredHookIsAllowed(hook: CommandHookConfig, workspaceRoot: string, sourceRevision?: string, active: () => boolean = () => true): Promise<boolean> {
    const trust = this.trust;
    if (trust?.admission?.()) return false;
    if (hook.fingerprint === undefined) return true;
    if (trust?.workspaceRoot !== undefined && path.resolve(trust.workspaceRoot) !== path.resolve(workspaceRoot)) return false;
    if (this.trust?.bypassed === true) {
      // Said every time rather than once, because the state that matters is
      // "this command is running unreviewed right now", not "the flag was set
      // at some point".
      logger.warn(HOOK_TRUST_BYPASS_NOTICE, { command: hook.command });
      return true;
    }
    if (this.trust === undefined) {
      // Nothing can be asked, so nothing may run. A non-interactive run must not
      // execute a repository's commands merely because nobody was there to say no.
      logger.warn(
        `Refusing declared hook '${hook.command}' because no approval path is configured.`,
      );
      return false;
    }
    if (sourceRevision === undefined) return false;
    if (this.trust.store.isTrusted(hook.fingerprint, hook.sourcePath ?? '(unknown)')) return true;

    const decision = await this.trust.requestApproval?.({
      command: hook.command,
      event: hook.event,
      matcher: hook.matcher,
      sourcePath: hook.sourcePath ?? "(unknown)",
    });
    // A boolean is the older answer shape: true meant "run it", which the prompt
    // offered as two different promises. Treat it as one-shot so an untyped
    // caller can never turn "Run it for this session" into a permanent grant.
    const allowed = decision === true || decision === 'allow-once' || decision === 'allow-always';
    if (!allowed || !active() || trust !== this.trust || trust?.admission?.()
      || trust.store.sourceRevision(hook.sourcePath ?? '(unknown)') !== sourceRevision) {
      logger.info(`Declared hook '${hook.command}' was not approved and will not run.`);
      return false;
    }
    if (decision === 'allow-always') {
      if (!trust.store.recordTrust(hook.fingerprint, `${hook.event}:${hook.command}`, hook.sourcePath ?? '(unknown)', sourceRevision)) return false;
    }
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
    this.trust = undefined;
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

  async dispatch(payload: HookEventPayload, stopOptions: StopDispatchOptions = {}): Promise<HookDecision> {
    const trust = this.trust;
    const commandHooks = this.commandHooks;
    const inProcessHooks = this.inProcessHooks;
    if (payload.eventName === 'Stop') return dispatchStop({ payload: payload as StopPayload,
      inProcess: inProcessHooks, commands: commandHooks, options: stopOptions,
      current: () => trust === this.trust && commandHooks === this.commandHooks && inProcessHooks === this.inProcessHooks && !trust?.admission?.(),
      allowed: async (hook, active) => {
        const revision = hook.fingerprint === undefined || trust?.bypassed ? undefined : trust?.store.sourceRevision(hook.sourcePath ?? '(unknown)');
        return await this.declaredHookIsAllowed(hook, payload.workspaceRoot, revision, active)
          && (revision === undefined || trust?.store.sourceRevision(hook.sourcePath ?? '(unknown)') === revision);
      } });
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
          const returned = await hook.handler(payload);
          const decision = relevantEvent === 'PreToolUse' ? normalizeHookVeto(returned) ?? returned : returned;
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
    for (const hook of commandHooks) {
      // Awaited process hooks and approvals may publish a replacement. An older
      // event cannot adopt that snapshot or execute the retired declarations.
      if (trust !== this.trust || commandHooks !== this.commandHooks) break;
      // What the hook last wrote to stderr, which the block contract reads.
      let lastStderr = "";
      const translated = relevantEvent === 'PreToolUse' && hook.writeGate !== undefined;
      const matchPayload = translated ? { ...payload, toolName: canonicalToolName((payload as PreToolUsePayload).toolName) } : payload;
      if (hook.event === relevantEvent && (translated || this.matches(hook.matcher, matchPayload))) {
        const sourceRevision = hook.fingerprint === undefined || trust?.bypassed ? undefined
          : trust?.store.sourceRevision(hook.sourcePath ?? '(unknown)');
        if (!(await this.declaredHookIsAllowed(hook, payload.workspaceRoot, sourceRevision))) continue;
        if (trust !== this.trust || commandHooks !== this.commandHooks || trust?.admission?.()) continue;
        if (sourceRevision !== undefined && trust?.store.sourceRevision(hook.sourcePath ?? '(unknown)') !== sourceRevision) continue;
        const timeoutMs = hook.timeoutMs ?? hookTimeoutMs(relevantEvent);
        let jsonPayloads: string[];
        if (translated) {
          const inputs = translateWriteInputs(payload as PreToolUsePayload, timeoutMs);
          if ('decision' in inputs) {
            logger.info('Write hook result', inputs.hookVerdict);
            if (inputs.decision === 'block') return inputs;
            accumulatedDecision = mergeWriteHookResult(accumulatedDecision, inputs);
            continue;
          }
          const matchedInputs = inputs.filter(input => this.matches(hook.matcher, { ...payload, toolName: input.tool_name }));
          if (matchedInputs.length === 0) continue;
          const invalidArtifact = checkWriteHookArtifact(hook.writeGate, payload.workspaceRoot);
          if (invalidArtifact) {
            logger.warn('Write hook failed', invalidArtifact.hookVerdict);
            return invalidArtifact;
          }
          try { jsonPayloads = matchedInputs.map(input => JSON.stringify(input)); }
          catch { return hookUnknown('invalid_input'); }
        } else jsonPayloads = [JSON.stringify(payload)];
        const command = translated ? writeHookCommand(hook.writeGate) : hook.command;

        // Run under the same isolation the bash tool uses. A hook is a shell
        // command, and leaving it unconfined while confining the commands the user
        // runs through a tool would mean the sandbox protects the paths they can
        // see and not the one a repository supplies.
        //
        // Launched as a program with an argument list rather than a command line,
        // so the sandbox wrapper's arguments are never re-parsed by a shell. A
        // hook command containing `$(...)` would otherwise be substituted by the
        // wrapper's own shell before it ever reached the sandbox.
        const sandbox = planSandboxedCommand({
          shell: SHELL_BIN,
          shellArgs: ["-c", command],
          workspaceRoot: payload.workspaceRoot,
        });
        if (sandbox.state === "refused") {
          // A hook command is still a command, and a hook that does not run must
          // not read as a hook that ran and approved: the return value here is
          // what the caller consults, so the refusal carries through as a deny.
          const reason = sandbox.notice ?? "sandbox refused the hook command";
          logger.warn(reason, { event: relevantEvent, command: hook.command });
          return { decision: "block", reason };
        }
        if (sandbox.state === "unavailable" && sandbox.notice) {
          logger.warn(sandbox.notice, { event: relevantEvent, command: hook.command });
        }
        const program = sandbox.command ?? SHELL_BIN;
        const programArgs = sandbox.args ?? ["-c", command];

        const batchDeadline = Date.now() + timeoutMs;
        for (const jsonPayload of jsonPayloads) {
          const remainingMs = Math.max(1, batchDeadline - Date.now());
          if (Date.now() > batchDeadline) return hookUnknown('timeout');
          try {
            const stdout = await new Promise<string>((resolve, reject) => {
              const child = execFile(
                program,
                [...programArgs],
                {
                  cwd: payload.workspaceRoot,
                  timeout: remainingMs,
                  maxBuffer: 1024 * 1024,
                },
                (error, stdoutBuf, stderrBuf) => {
                  if (error) {
                    reject(
                      new CommandHookFailure(
                        error instanceof Error ? error.message : String(error),
                        typeof (error as { code?: unknown }).code === "number"
                          ? (error as { code: number }).code
                          : undefined,
                        stderrBuf,
                        error instanceof Error && (error as { killed?: boolean }).killed === true,
                        stdoutBuf,
                      ),
                    );
                  } else {
                    if (stderrBuf) lastStderr = stderrBuf;
                    resolve(stdoutBuf);
                  }
                },
              );

              if (child.stdin) {
                child.stdin.on("error", () => {});
                child.stdin.end(jsonPayload);
              }
            });

            if (translated) {
              const result = applyWriteHookPolicy(translateWriteResult(stdout));
              logger.info('Write hook result', result.hookVerdict ?? { status: result.decision });
              if (result.decision === 'block' || result.decision === 'retry') return result;
              accumulatedDecision = mergeWriteHookResult(accumulatedDecision, result);
            } else if (stdout && stdout.trim()) {
              let parsed: HookDecision;
              try {
                parsed = JSON.parse(stdout.trim()) as HookDecision;
                if (relevantEvent === 'PreToolUse') parsed = normalizeHookVeto(parsed) ?? parsed;
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
                accumulatedDecision = mergeWriteHookResult(accumulatedDecision, parsed);
              }
            }
          } catch (err: unknown) {
            const failure = err instanceof CommandHookFailure ? err : undefined;
            if (translated) {
              const parsed = translateWriteResult(failure?.stdout ?? '');
              const result = failure?.timedOut ? hookUnknown('timeout')
                : (parsed.decision === 'block' || parsed.decision === 'retry') && parsed.hookVerdict?.source !== 'adapter'
                  ? parsed : hookUnknown('process_failed');
              logger.warn('Write hook failed', result.hookVerdict ?? { status: result.decision });
              return result;
            }
            const detail = err instanceof Error ? err.message : String(err);
            logger.error(`Command hook failed for event ${relevantEvent}`, {
              event: relevantEvent,
              command: hook.command,
              timeoutMs,
              exitCode: failure?.exitCode,
              timedOut: failure?.timedOut,
              error: detail,
            });
            if (failure?.exitCode === 2 && failure.stderr.trim() !== "") {
              return { decision: "block", reason: failure.stderr.trim() };
            }
            if (relevantEvent === "PreToolUse") {
              return {
                decision: "block",
                reason: `The PreToolUse hook '${hook.command}' could not run (${detail}), so the action was not allowed.`,
              };
            }
          }
        }

      }
    }
    const extensionDecision = !trust?.admission?.() && payload.workspaceRoot
      ? await dispatchExtensionHooks(payload, accumulatedDecision)
      : null;
    if (extensionDecision) return extensionDecision;
    return accumulatedDecision ?? { decision: "allow" };
  }
}

const EXTENSION_EVENT_ALIASES: Readonly<Record<string, readonly string[]>> = {
  SessionStart: ['session_start'],
  SessionEnd: ['session_shutdown'],
  UserPromptSubmit: ['input'],
  PreToolUse: ['tool_call'],
  PostToolUse: ['tool_result'],
  PostToolUseFailure: ['tool_result'],
  PreCompact: ['session_before_compact'],
  PostCompact: ['session_compact'],
  PreModelSwitch: ['model_select'],
  PostModelSwitch: ['model_select'],
  StopFailure: ['agent_end'],
};

async function dispatchExtensionHooks(
  payload: HookEventPayload,
  accumulated: HookDecision | null,
): Promise<HookDecision | null> {
  const runners = getExtensionEventRunners(payload.workspaceRoot, payload.sessionId);
  const aliases = EXTENSION_EVENT_ALIASES[payload.eventName];
  let merged = accumulated;
  let updated = false;
  for (const runExtensionEvent of runners) {
    try {
      const returned = await runExtensionEvent(payload.eventName, payload, aliases);
      if (!returned || typeof returned !== 'object') continue;
      const decision = payload.eventName === 'PreToolUse'
        ? normalizeHookVeto(returned) ?? (returned as HookDecision)
        : (returned as HookDecision);
      if (decision.decision === 'block' || decision.decision === 'retry') {
        return decision;
      }
      if (decision.feedback || decision.hookSpecificOutput) {
        merged = mergeWriteHookResult(merged, decision);
        updated = true;
      }
    } catch (err: unknown) {
      logger.error(`Error in extension event handler: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return updated ? merged : null;
}

export const defaultHookDispatcher = new HookDispatcher();
