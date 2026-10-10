import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';
import { verifyPathContainment } from '../../core/security/pathJail.js';
import { commitWorkspaceFile } from '../../edit/authority/commit.js';
import { workspaceFilePath, descriptorPath, inspectWorkspaceFile } from '../../core/workspace/files.js';
import { recordLimits, type CastEvent, type CastHeader, type RecordingRow } from './model.js';
import { RecordingRedactor } from './redaction.js';

export class TerminalRecording {
  private fd?: number;
  private identity?: { dev: number; ino: number; birthtimeMs: number };
  private version?: { mtimeMs: number; ctimeMs: number };
  private readonly start = performance.now();
  private events = 0;
  private lastAt = 0;
  private readonly stdout = new RecordingRedactor();
  private readonly stderr = new RecordingRedactor();
  private readonly digest = createHash('sha256');
  private excluded = false;
  bytes = 0;
  phase: RecordingRow['phase'] = 'recording';
  reason?: string;
  constructor(readonly row: RecordingRow, readonly admission: () => string | undefined,
    readonly assertAccess: (absolute: string) => void, dimensions: { columns: number; rows: number }) {
    const header: CastHeader = { version: 2, width: dimensions.columns, height: dimensions.rows, timestamp: Math.floor(Date.now() / 1000),
      cheers: { version: 1, id: row.id, sessionId: row.scope.sessionId, input: 'excluded', options: row.options } };
    const content = JSON.stringify(header) + '\n'; const file = this.file(); this.assertAccess(file);
    commitWorkspaceFile({ workspaceRoot: row.scope.workspace.path, relativePath: row.file, expected: { state: 'absent' }, content, mode: 0o600, assertFileAccess: this.assertAccess });
    this.fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(this.fd); this.identity = { dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs };
    this.version = { mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs }; this.bytes = Buffer.byteLength(content); this.digest.update(content);
    try { this.verify(); } catch (error) { this.close(); throw error; }
  }
  private file(): string {
    const root = captureWorkspaceRoot(this.row.scope.workspace.path, this.row.scope.workspace.path, 'read');
    if (root.identity !== this.row.scope.workspace.identity) throw new Error('Recording workspace changed.');
    const checked = verifyPathContainment(workspaceFilePath(root.path, this.row.file), root.path);
    if (!checked.allowed) throw new Error('Recording destination escaped its workspace.'); return checked.resolvedPath;
  }
  private verify(): void {
    if (this.fd === undefined) throw new Error('Recording is closed.'); const file = this.file(); this.assertAccess(file);
    const stat = fs.lstatSync(file); const own = fs.fstatSync(this.fd);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.dev !== this.identity?.dev || stat.ino !== this.identity.ino
      || stat.birthtimeMs !== this.identity.birthtimeMs || stat.size !== this.bytes || own.size !== this.bytes
      || stat.mtimeMs !== this.version?.mtimeMs || stat.ctimeMs !== this.version.ctimeMs || descriptorPath(this.fd, file) !== file) throw new Error('Recording destination changed.');
  }
  private write(line: string): void {
    this.verify(); const data = Buffer.from(line); let from = 0;
    while (from < data.length) { const written = fs.writeSync(this.fd!, data, from, data.length - from); if (written <= 0) throw new Error('Recording write did not progress.'); this.digest.update(data.subarray(from, from + written)); from += written; this.bytes += written; }
    const stat = fs.fstatSync(this.fd!); this.version = { mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
  }
  private event(kind: CastEvent[1], data: string, final = false): void {
    const at = this.lastAt = Math.max(this.lastAt, (performance.now() - this.start) / 1000);
    const line = JSON.stringify([at, kind, data]) + '\n';
    if (!final && (++this.events >= recordLimits.events || this.bytes + Buffer.byteLength(line) + 256 > this.row.options.maxBytes
      || at > this.row.options.seconds || Buffer.byteLength(data) > recordLimits.eventBytes)) throw new Error('Recording limit reached.');
    this.write(line);
  }
  output(chunk: Buffer | string, stream: 'stdout' | 'stderr', sensitive: boolean): void {
    if (this.phase !== 'recording') return;
    try {
      if (this.admission()) { this.stop('cancelled', 'authority-revoked'); return; }
      const redactor = stream === 'stdout' ? this.stdout : this.stderr; const text = redactor.push(chunk, sensitive);
      if (sensitive && !this.excluded) this.event('m', 'sensitive-input-display-excluded');
      this.excluded = sensitive; if (text) this.event(stream === 'stdout' ? 'o' : 'e', text);
    } catch (error) { this.stop(error instanceof Error && /limit/i.test(error.message) ? 'truncated' : 'failed', 'output-or-destination-failed'); }
  }
  resize(columns: number, rows: number): void {
    if (this.phase !== 'recording') return;
    try {
      if (this.admission()) { this.stop('cancelled', 'authority-revoked'); return; }
      if (![columns, rows].every(value => Number.isInteger(value) && value >= 1 && value <= 9999)) throw new Error('Invalid terminal dimensions.');
      this.event('r', `${columns}x${rows}`);
    } catch { this.stop('truncated', 'resize-or-limit-failed'); }
  }
  stop(phase: 'stopped' | 'cancelled' | 'truncated' | 'failed', reason?: string): void {
    if (this.phase !== 'recording') return;
    this.phase = phase; this.reason = reason;
    try {
      if (phase === 'stopped') {
        for (const [stream, redactor] of [['o', this.stdout], ['e', this.stderr]] as const) { const text = redactor.finish(); if (text) this.event(stream, text); }
      }
      const incomplete = phase !== 'stopped' && Boolean(this.stdout.finish() + this.stderr.finish());
      this.event('m', `recording:${phase}${incomplete ? ':incomplete' : ''}`, true); fs.fsyncSync(this.fd!);
    } catch { this.phase = 'unknown'; this.reason = 'finalization-unverified'; }
    finally { this.close(); }
    if (this.row.options.retention === 'discard' && ['stopped', 'cancelled'].includes(this.phase)) {
      try {
        const stat = fs.lstatSync(this.file());
        if (stat.dev !== this.identity?.dev || stat.ino !== this.identity.ino || stat.birthtimeMs !== this.identity.birthtimeMs || stat.size !== this.bytes
          || stat.mtimeMs !== this.version?.mtimeMs || stat.ctimeMs !== this.version.ctimeMs)
          throw new Error('Recording replacement must be preserved.');
        this.assertAccess(this.file());
        const current = inspectWorkspaceFile(this.row.scope.workspace.path, this.row.file, this.assertAccess, recordLimits.fileBytes);
        if (current.state !== 'exists' || current.hash !== this.digest.copy().digest('hex')) throw new Error('Recording content changed.');
        commitWorkspaceFile({ workspaceRoot: this.row.scope.workspace.path, relativePath: this.row.file, expected: current, content: undefined, assertFileAccess: this.assertAccess }); this.phase = 'discarded';
      } catch { this.phase = 'unknown'; this.reason = 'discard-unverified'; }
    }
  }
  private close(): void { if (this.fd !== undefined) { const fd = this.fd; this.fd = undefined; try { fs.closeSync(fd); } catch { this.phase = 'unknown'; } } }
}
