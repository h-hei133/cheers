import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { SessionManager } from '../../session/SessionManager.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';
import { contextAttachments } from './attachments.js';
import { ruleCommandsFor } from './rules.js';
import { toolPoolFor } from './tools.js';

/** Install one-use selection and delegate file behavior to its existing owners. */
export function installRuleControlRuntime(input: { readonly runtimeContext: ShellRuntimeContext; readonly sessionManager: SessionManager; readonly busy?: () => boolean }): void {
  const context = input.runtimeContext;
  const rules = ruleCommandsFor(context, input.busy ?? (() => false));
  let pending: { tool: string; current: () => boolean } | undefined;
  let ticket = 0;
  context.forceTool = async tool => {
    pending = undefined;
    const version = ++ticket;
    const name = tool.trim();
    if (!name || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) throw new Error('Tool name is invalid.');
    if (input.busy?.()) throw new Error('Wait for the current turn before selecting a tool.');
    const configured = configurationAdmission(context);
    const publication = context.configuration.current;
    const sessionId = context.session.id;
    const cwd = context.cwd;
    const root = captureWorkspaceRoot(cwd, cwd, 'read');
    const current = () => {
      try { return !configured() && context.configuration.current === publication && context.session.id === sessionId && context.cwd === cwd
        && captureWorkspaceRoot(cwd, cwd, 'read').identity === root.identity && ticket === version; }
      catch { return false; }
    };
    const available = await toolPoolFor(context)();
    if (!current()) throw new Error('Tool selection session, workspace or configuration changed.');
    if (!available.has(name)) throw new Error("Tool '" + name + "' is not available in the current tool pool.");
    pending = { tool: name, current };
    return "Selected available tool '" + name + "' for the next request.";
  };
  context.consumeForcedTool = () => {
    const selected = pending; pending = undefined;
    return selected?.current() ? selected.tool : undefined;
  };
  context.ruleControlsCommand = async (name, args, commandContext) => {
    if (commandContext.sessionId !== context.session.id || commandContext.cwd !== context.cwd || commandContext.admission?.()) {
      return { kind: 'local', output: 'Command session or workspace changed.', state: { status: 'blocked' } };
    }
    return name === 'context' ? contextAttachments(args, input) : rules(name, args);
  };
}

/** Consumed only at the next accepted request; actual tools are revalidated at dispatch. */
export function takeForcedTool(context: ShellRuntimeContext): string | undefined { return context.consumeForcedTool?.(); }
