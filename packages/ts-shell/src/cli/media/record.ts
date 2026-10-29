import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { inspectWorkspaceFile } from '../../edit/authority/state.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import { recordingOptions, decodeCast } from '../../media/record/codec.js';
import { recordingText, playRecording } from '../../media/record/playback.js';
import { recordLimits, type RecordingRow, type RecordOptions } from '../../media/record/model.js';
import { RecordingStore } from '../../media/record/store.js';
import { TerminalRecording } from '../../media/record/writer.js';
import { recordSyntax } from '../../core/commands/record/syntax.js';
import { parseSyntax } from '../../core/commands/syntax/parse.js';
import { syntaxHelp } from '../../core/commands/syntax/projection.js';
import type { LocalCommandResult } from '../../core/commands/types.js';
import type { ToolDefinition, ToolExecutionContext } from '../../tools/types.js';
import { runPreparedTool } from '../../turn/invoke.js';
import { preparationContext } from '../../turn/preparation.js';
import { jobAdmission } from '../jobs/authority.js';
import type { JobsComposition } from '../jobs/model.js';
import { report } from '../jobs/projection.js';
import { prepareOperation, commitOperation } from '../../edit/recovery/operation/write.js';

export const recordOwners = new WeakMap<JobsComposition['context'], RecordingOwner>();
export const pendingRecordings = new WeakMap<JobsComposition['context'], object>();
export const recordPlayers = new WeakMap<JobsComposition['context'], AbortController>();
export interface RecordingSurface { readonly dimensions: () => { columns: number; rows: number }; readonly excluded: (data?: Buffer | string) => boolean }
export class RecordingOwner {
  row: RecordingRow;
  readonly store: RecordingStore;
  readonly writer: TerminalRecording;
  private readonly parent: () => string | undefined;
  private readonly timer: NodeJS.Timeout;
  private ended = false;
  constructor(readonly host: JobsComposition, file: string, options: RecordOptions,
    readonly surface: RecordingSurface, context: ToolExecutionContext) {
    this.parent = jobAdmission(host, 'write'); this.store = new RecordingStore(host.manager, host.session);
    this.row = { id: randomUUID(), scope: readBoundSessionState(host.manager, host.session).scope, file, options, phase: 'recording', bytes: 0 };
    this.store.save(this.row);
    let writer: TerminalRecording | undefined;
    try {
      this.writer = writer = new TerminalRecording(this.row, this.admission, absolute => context.assertFileAccess?.(absolute), surface.dimensions());
      const next = { ...this.row, bytes: this.writer.bytes }; this.store.save(next, this.row); this.row = next;
    } catch {
      writer?.stop('failed', 'journal-publication-failed');
      try { this.store.save({ ...this.row, phase: 'failed', reason: 'destination-or-journal-failed' }, this.row); } catch { /* Persisted evidence remains unconfirmed. */ }
      throw new Error('Recording destination or journal could not be verified; inspect /record status.');
    }
    recordOwners.set(host.context, this);
    const started = Date.now();
    this.timer = setInterval(() => {
      if (this.admission()) this.stop('cancelled', 'authority-revoked');
      else if (Date.now() - started >= options.seconds * 1000) this.stop('truncated', 'duration-limit');
    }, 100);
    this.timer.unref();
  }
  admission = (): string | undefined => {
    if (this.ended) return 'Recording is closed.';
    try { return this.parent() ?? (JSON.stringify(this.store.read().runs.find(row => row.id === this.row.id)) !== JSON.stringify(this.row) ? 'Recording journal changed.' : undefined); }
    catch { return 'Recording admission is unavailable.'; }
  };
  output(data: Buffer | string, stream: 'stdout' | 'stderr'): void {
    this.writer.output(data, stream, this.surface.excluded(data));
    if (this.writer.phase !== 'recording') this.publish();
  }
  resize(): void {
    const dimensions = this.surface.dimensions(); this.writer.resize(dimensions.columns, dimensions.rows);
    if (this.writer.phase !== 'recording') this.publish();
  }
  stop(phase: 'stopped' | 'cancelled' | 'truncated', reason?: string): void {
    if (this.ended) return; this.writer.stop(phase, reason); this.publish();
  }
  private publish(): void {
    if (this.ended) return; this.ended = true; clearInterval(this.timer);
    const next: RecordingRow = { ...this.row, bytes: this.writer.bytes, phase: this.writer.phase, reason: this.writer.reason };
    try { this.store.save(next, this.row); this.row = next; } catch { this.row = { ...next, phase: 'unknown', reason: 'journal-publication-unverified' }; }
    if (recordOwners.get(this.host.context) === this) recordOwners.delete(this.host.context);
    if (this.host.context.session.id === this.host.session.id) this.host.agentRuntimeInput?.notice?.(report(`Recording ${this.row.phase}; ${this.row.bytes} bytes; retention ${this.row.options.retention}; ${this.row.file}. Inspect /record status.`));
  }
}
function source(host: JobsComposition, name: string) {
  const root = readBoundSessionState(host.manager, host.session).scope.workspace.path;
  const inspected = inspectWorkspaceFile(root, path.relative(root, path.resolve(host.context.cwd, name)),
    preparationContext('read', host.gate('read')).assertSourceAccess, recordLimits.fileBytes);
  if (inspected.state !== 'exists') throw new Error('Recording source is missing.'); return { cast: decodeCast(inspected.content), inspected, root };
}
export async function runRecordCommand(host: JobsComposition, args: readonly string[], surface?: RecordingSurface): Promise<LocalCommandResult> {
  const parsed = parseSyntax(recordSyntax, args); if (!parsed.ok) return { kind: 'local', output: `Invalid /record arguments: ${parsed.reason}\n${syntaxHelp(recordSyntax)}` };
  try {
    const action = parsed.action.name; const owner = recordOwners.get(host.context);
    if (action === 'status') return { kind: 'local', output: report(new RecordingStore(host.manager, host.session).read().runs.map(row => ({ ...row,
      phase: row.phase === 'recording' && owner?.row.id !== row.id ? 'unknown' : owner?.row.id === row.id ? owner.writer.phase : row.phase,
      bytes: owner?.row.id === row.id ? owner.writer.bytes : row.bytes }))) };
    if (action === 'stop' || action === 'cancel') {
      pendingRecordings.delete(host.context); recordPlayers.get(host.context)?.abort(); owner?.stop(action === 'stop' ? 'stopped' : 'cancelled');
      return { kind: 'local', output: 'Local recording/playback authority closed; inspect /record status for actual retention and finalization. Existing incomplete files are preserved.' };
    }
    if (action === 'play') {
      if (owner || recordPlayers.has(host.context)) throw new Error('Stop capture or playback before replaying a recording.');
      const loaded = source(host, parsed.args[0]!); const controller = new AbortController(); recordPlayers.set(host.context, controller);
      const parent = jobAdmission(host, 'read');
      try { await playRecording(loaded.cast, controller.signal, parent, text => host.agentRuntimeInput?.notice?.(text), Number(parsed.flags.get('speed') ?? 1));
        return { kind: 'local', output: loaded.cast.incomplete ? 'Playback finished; source recording has incomplete finalization.' : 'Safe text playback finished; commands and terminal control sequences were excluded.' }; }
      finally { if (recordPlayers.get(host.context) === controller) recordPlayers.delete(host.context); }
    }
    const root = readBoundSessionState(host.manager, host.session).scope.workspace.path;
    const destination = parsed.args[action === 'export' ? 1 : 0]!; const file = path.relative(root, path.resolve(host.context.cwd, destination));
    const before = inspectWorkspaceFile(root, file, preparationContext('write', host.gate('write')).assertFileAccess, recordLimits.fileBytes);
    if (before.state !== 'absent') throw new Error('Recording destinations must be new files; existing files are preserved.');
    if (action === 'export') {
      const loaded = source(host, parsed.args[0]!); const content = recordingText(loaded.cast); const parent = jobAdmission(host, 'write');
      const tool: ToolDefinition = { name: 'record_export', description: 'Write a local sanitized text export to a new approved destination.',
        argsSchema: { type: 'object', properties: {}, additionalProperties: false }, resultAdmission: parent,
        prepare: () => ({ targets: [{ path: path.join(root, file), operation: 'write' }], preview: `Local plain-text recording export: ${file}\n${content}`, execute: async context => {
          context.abortSignal?.throwIfAborted(); if (parent()) throw new Error('Recording export authority changed.');
          const current = source(host, parsed.args[0]!); if (current.inspected.hash !== loaded.inspected.hash) throw new Error('Recording source changed after approval.');
          const prepared = await prepareOperation({ sessionId: host.session.id, workspaceRoot: root, callId: context.taskId }, [{
            workspaceRoot: root, workspaceIdentity: readBoundSessionState(host.manager, host.session).scope.workspace.identity,
            relativePath: file, before, content, mode: 0o600, assertFileAccess: absolute => {
              context.abortSignal?.throwIfAborted(); if (parent()) throw new Error('Recording export authority revoked.'); context.assertFileAccess?.(absolute);
            } }]); const receipt = commitOperation(prepared, { compensate: true });
          return { success: receipt.status === 'committed', output: `Local sanitized export ${receipt.status}; operation ${receipt.operationId}.`, metadata: { status: receipt.status, operationId: receipt.operationId } };
        } }), execute: async () => ({ success: false, error: 'Prepared export approval required.' }) };
      return { kind: 'local', output: (await runPreparedTool(tool, {}, host.gate('write'))).output };
    }
    if (!surface) throw new Error('Recording requires the current terminal output stream.');
    if (owner || pendingRecordings.has(host.context) || recordPlayers.has(host.context)) throw new Error('Recording/playback is active or pending; stop it first.');
    const options = recordingOptions(parsed.flags.get('retain'), parsed.flags.get('max-bytes') ?? 4194304, parsed.flags.get('seconds') ?? 600);
    const token = {}; pendingRecordings.set(host.context, token); const parent = jobAdmission(host, 'write');
    const admission = () => pendingRecordings.get(host.context) !== token ? 'Recording startup cancelled.' : parent();
    const tool: ToolDefinition = { name: 'record_start', description: 'Create an exclusive local terminal recording with explicit retention.',
      argsSchema: { type: 'object', properties: {}, additionalProperties: false }, resultAdmission: admission,
      prepare: () => ({ targets: [{ path: path.join(root, file), operation: 'write' }], preview: report({ destination: file, options,
        capture: 'stdout/stderr after privacy filtering, line-completion timing and resize; line buffering may reorder streams',
        input: 'typing, questions, overlays and submitted input repaints excluded; simultaneous output in those frames is omitted',
        incomplete: 'cancel/truncation drops unterminated lines and marks the file incomplete',
        secrets: 'known credential shapes redacted; arbitrary secrets in ordinary output cannot be universally detected', upload: false }),
        execute: async context => {
          context.abortSignal?.throwIfAborted(); if (admission()) throw new Error('Recording startup authority changed.');
          new RecordingOwner(host, file, options, surface, context);
          return { success: true, output: `Local terminal recording started: ${file}; retention ${options.retention}; input excluded. /record stop or cancel.`, metadata: { status: 'recording' } };
        } }), execute: async () => ({ success: false, error: 'Prepared recording approval required.' }) };
    try { return { kind: 'local', output: (await runPreparedTool(tool, {}, host.gate('write'), host.runtime.getCurrentRunController()?.signal)).output }; }
    finally { if (pendingRecordings.get(host.context) === token) pendingRecordings.delete(host.context); }
  } catch (error) { return { kind: 'local', output: report(error instanceof Error ? error.message : 'Recording refused or unverified.') }; }
}
