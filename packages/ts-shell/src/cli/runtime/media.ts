import type { CommandContext } from '../../core/commands/types.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { tokenizeCommandArgs } from '../../core/commands/arguments.js';
import { parseSyntax } from '../../core/commands/syntax/parse.js';
import { liveSyntax } from '../../core/commands/live/syntax.js';
import { recordSyntax } from '../../core/commands/record/syntax.js';
import { observeTerminalStreams } from '../../media/record/capture.js';
import { liveOwners } from '../media/live.js';
import { pendingLive, runLiveCommand } from '../media/command.js';
import { recordOwners, recordPlayers, pendingRecordings, runRecordCommand, type RecordingSurface } from '../media/record.js';
import { jobsFor } from './jobs.js';
import { prepareRows } from '../../presentation/tui/render/paint.js';
import type { TerminalFrameProvider } from '../../presentation/tui/render/frame.js';

const surfaces = new WeakMap<ShellRuntimeContext, RecordingSurface & { privateInput: () => boolean; privateRows: readonly string[]; inputDepth: number; release: () => void }>();
export function installMediaSurface(context: ShellRuntimeContext, stdout: NodeJS.WriteStream, stderr: NodeJS.WriteStream): void {
  if (surfaces.has(context)) throw new Error('Terminal recording surface already installed.');
  const release = observeTerminalStreams(stdout, stderr,
    (data, stream) => recordOwners.get(context)?.output(data, stream), () => recordOwners.get(context)?.resize());
  const surface = { dimensions: () => ({ columns: stdout.columns || 80, rows: stdout.rows || 24 }), privateInput: () => false,
    privateRows: [] as readonly string[], inputDepth: 0, release,
    excluded: (data?: Buffer | string): boolean => surface.inputDepth > 0 || surface.privateInput()
      || Boolean(data && surface.privateRows.some(row => data.toString().includes(row))) };
  surfaces.set(context, surface);
}
export function excludeRecordingInput(context: ShellRuntimeContext, excluded: () => boolean): void {
  const surface = surfaces.get(context); if (surface) surface.privateInput = excluded;
}
/** Classify the exact painted user rows before either painter writes its frame. */
export function recordingFrameProvider(context: ShellRuntimeContext, provider: TerminalFrameProvider): TerminalFrameProvider {
  return { invalidateLayout: () => provider.invalidateLayout?.(), renderFrame: (dimensions, layout) => {
    const frame = provider.renderFrame(dimensions, layout); const surface = surfaces.get(context);
    if (surface) surface.privateRows = prepareRows(frame.sensitiveRows ?? [], dimensions.columns).filter(Boolean);
    return frame;
  } };
}
export function withoutRecordingInput(context: ShellRuntimeContext, display: () => void): void {
  const surface = surfaces.get(context); if (surface) surface.inputDepth++;
  try { display(); } finally { if (surface) surface.inputDepth--; }
}
export function mediaCommandFor(context: ShellRuntimeContext): NonNullable<CommandContext['mediaCommand']> {
  return async (name, args, command) => {
    const host = jobsFor(context);
    if (!host || host.session.id !== command.sessionId || command.cwd !== context.cwd) return { kind: 'local', output: 'Media requires the current bound terminal session.' };
    return name === 'live' ? runLiveCommand(host, args) : runRecordCommand(host, args, surfaces.get(context));
  };
}
export function mediaControl(text: string): { name: 'live' | 'record'; args: string[]; stop: boolean } | undefined {
  const match = /^\/(live|record)(?:\s+([\s\S]*))?$/i.exec(text.trim()); if (!match) return undefined;
  const name = match[1]!.toLowerCase() as 'live' | 'record'; const args = tokenizeCommandArgs(match[2] ?? '');
  const parsed = parseSyntax(name === 'live' ? liveSyntax : recordSyntax, args);
  if (!parsed.ok || !['status', 'stop', 'cancel', 'mute', 'interrupt', 'transcript'].includes(parsed.action.name)) return undefined;
  return { name, args, stop: ['stop', 'cancel', 'interrupt'].includes(parsed.action.name) };
}
export function cancelMediaFor(context: ShellRuntimeContext): void {
  pendingLive.delete(context); pendingRecordings.delete(context); recordPlayers.get(context)?.abort();
  recordOwners.get(context)?.stop('cancelled'); const owner = liveOwners.get(context); if (owner) void owner.stop('cancelled');
}
export function cancelMediaCommand(context: ShellRuntimeContext, name: 'live' | 'record', phase: 'stopped' | 'cancelled' = 'cancelled'): void {
  if (name === 'live') { pendingLive.delete(context); const owner = liveOwners.get(context); if (owner) void owner.stop('cancelled'); }
  else { pendingRecordings.delete(context); recordPlayers.get(context)?.abort(); recordOwners.get(context)?.stop(phase); }
}
export function mediaInterruptible(context: ShellRuntimeContext): boolean {
  return pendingLive.has(context) || pendingRecordings.has(context) || liveOwners.has(context) || recordOwners.has(context) || recordPlayers.has(context);
}
export async function closeMediaFor(context: ShellRuntimeContext): Promise<void> {
  const owner = liveOwners.get(context); cancelMediaFor(context); await owner?.done;
  surfaces.get(context)?.release(); surfaces.delete(context);
}
