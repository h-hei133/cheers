import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { PromptAttachments, ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { CommandContext } from '../../core/commands/types.js';
import type { InputQueueControl } from '../../core/agent/queue.js';
import { parsePlanningArgs, queueSyntax } from '../../core/commands/planning/syntax.js';
import { syntaxHelp } from '../../core/commands/syntax/projection.js';
import { sanitizeExecutionReportText } from '../../runtime/execution/error.js';
import { planningBody } from '../../core/commands/planning/source.js';

interface QueueHost { readonly control: InputQueueControl; enqueue(text: string, attachments?: PromptAttachments): string; drain(): void }
const hosts = new WeakMap<ShellSessionRuntime, QueueHost>();

export function attachInputQueue(runtime: ShellSessionRuntime, host: QueueHost): () => void {
  hosts.set(runtime, host); return () => { if (hosts.get(runtime) === host) hosts.delete(runtime); };
}

export function attachSubmissionQueue(runtime: ShellSessionRuntime,
  queue: { readonly control: InputQueueControl; push(text: string, attachments?: PromptAttachments): string; shift(): string | undefined },
  run: (prompt: string) => Promise<unknown>, ready: () => boolean): () => void {
  return attachInputQueue(runtime, { control: queue.control, enqueue: (text, attachments) => attachments ? queue.push(text, attachments) : queue.push(text), drain: () => {
    if (!ready()) return;
    const prompt = queue.shift(); if (prompt !== undefined) void run(prompt);
  } });
}

export function queueCommandFor(context: ShellRuntimeContext, runtime: ShellSessionRuntime,
  attachments?: PromptAttachments): NonNullable<CommandContext['queueCommand']> {
  return async (args, commandContext) => {
    if (commandContext.sessionId !== context.session.id || commandContext.projectRoot !== context.projectRoot) {
      return { kind: 'local', output: 'Queue update refused: the current session changed.' };
    }
    const parsed = parsePlanningArgs(queueSyntax, args);
    if (!parsed.ok) return { kind: 'local', output: `Invalid /queue arguments: ${parsed.reason}\n${syntaxHelp(queueSyntax)}` };
    const action = parsed.action.name || (parsed.args.length ? 'add' : 'list');
    const host = hosts.get(runtime); const live = runtime.input?.()?.queue;
    const controls = [live, host?.control].filter((control): control is InputQueueControl => Boolean(control));
    const entries = controls.flatMap(control => control.entries());
    if (action === 'list') return { kind: 'local', output: entries.length ? `Pending execution (stage order):\n${entries.map((entry, index) =>
      `${index + 1}. ${entry.id} [${entry.lane}] ${sanitizeExecutionReportText(entry.text, 240)}`).join('\n')}` : 'No pending input.' };
    if (action === 'add') {
      const text = planningBody(commandContext.rawCommandArgs, parsed.action.name ? 1 : 0, parsed.args);
      if (host) { const id = attachments ? host.enqueue(text, attachments) : host.enqueue(text); host.drain(); return { kind: 'local', output: `Queued ${id}.` }; }
      if (!runtime.getCurrentRunController()) return { kind: 'prompt', prompt: text, notice: 'Executing queued input through the ordinary prompt path.' };
      return { kind: 'local', output: 'Queue submission unavailable: this active host has no pending submission queue.' };
    }
    const id = parsed.args[0]!; const control = controls.find(candidate => candidate.entries().some(entry => entry.id === id));
    if (!control) return { kind: 'local', output: 'Queue update refused: the entry is no longer pending.' };
    const changed = action === 'edit' ? control.edit(id, planningBody(commandContext.rawCommandArgs, 2, parsed.args.slice(1)))
      : action === 'cancel' ? control.cancel(id) : control.move(id, parsed.args[1] === 'end' ? undefined : parsed.args[1]);
    return { kind: 'local', output: changed ? `Pending entry ${action === 'edit' ? 'edited' : action === 'cancel' ? 'cancelled' : 'moved'}: ${id}.`
      : 'Queue update refused: entries must still be pending in the same delivery stage.' };
  };
}

export function isQueueControl(text: string): boolean { return /^\/queue(?:\s|$)/i.test(text.trim()); }
