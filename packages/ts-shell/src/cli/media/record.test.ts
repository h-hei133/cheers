import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { routeSlashCommand } from '../../core/commands/slashRouter.js';
import { RecordingStore } from '../../media/record/store.js';
import { decodeCast } from '../../media/record/codec.js';
import { recordingText, playRecording } from '../../media/record/playback.js';
import { PlaybackText } from '../../media/record/redaction.js';
import { mediaCommandFor, installMediaSurface, closeMediaFor, excludeRecordingInput, cancelMediaFor, recordingFrameProvider, withoutRecordingInput, cancelMediaCommand } from '../runtime/media.js';
import { closeJobsFor } from '../runtime/jobs.js';
import { mediaFixture } from '../../test-utils/media/runtime.js';
import { TerminalRecording } from '../../media/record/writer.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import { fullPaint, prepareRows } from '../../presentation/tui/render/paint.js';

let fixture: ReturnType<typeof mediaFixture>; let stdout: NodeJS.WriteStream; let stderr: NodeJS.WriteStream; let excluded: boolean;
beforeEach(() => {
  fixture = mediaFixture(); stdout = new PassThrough() as unknown as NodeJS.WriteStream; stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stdout, { columns: 80, rows: 24 }); excluded = false; installMediaSurface(fixture.context, stdout, stderr); excludeRecordingInput(fixture.context, () => excluded);
});
afterEach(async () => { await closeMediaFor(fixture.context); await closeJobsFor(fixture.context); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(fixture.scratch, { recursive: true, force: true }); });
async function command(args: string) { return routeSlashCommand('/record ' + args, { cwd: fixture.root, sessionId: fixture.context.session.id, mediaCommand: mediaCommandFor(fixture.context) }); }
function row() { return new RecordingStore(fixture.manager, fixture.context.session).read().runs.at(-1)!; }
function read(name = 'session.cast') { return fs.readFileSync(path.join(fixture.root, name), 'utf8'); }
it('records actual output bytes, timing and resize with an exclusive approved destination and explicit retention', async () => {
  expect(await command('start session.cast')).toMatchObject({ kind: 'local', output: expect.stringContaining('requires keep/discard') });
  fixture.decision(async () => 'deny'); await command('start session.cast --retain keep'); expect(fs.existsSync(path.join(fixture.root, 'session.cast'))).toBe(false);
  fixture.decision(async () => 'allow-once'); expect(await command('start session.cast --retain keep')).toMatchObject({ kind: 'local', output: expect.stringContaining('recording started') }); stdout.write('actual output\n'); stderr.write('actual error\n');
  Object.assign(stdout, { columns: 100, rows: 30 }); stdout.emit('resize'); await command('stop');
  const cast = decodeCast(read()); expect(cast.incomplete).toBe(false); expect(cast.header).toMatchObject({ version: 2, width: 80, height: 24, cheers: { sessionId: fixture.context.session.id, input: 'excluded' } });
  expect(cast.events.map(event => event.slice(1))).toContainEqual(['o', 'actual output\n']); expect(cast.events.map(event => event.slice(1))).toContainEqual(['e', 'actual error\n']);
  expect(cast.events.map(event => event.slice(1))).toContainEqual(['r', '100x30']); expect(row().phase).toBe('stopped');
  const original = read(); await command('start session.cast --retain keep'); expect(read()).toBe(original); expect(fs.statSync(path.join(fixture.root, 'session.cast')).mode & 0o777).toBe(0o600);
});
it('excludes input display and secrets split across writes or colored inside output', async () => {
  await command('start session.cast --retain keep'); excluded = true; stdout.write('arbitrary secret typed by user\n'); excluded = false;
  stdout.write('Authorization: Bear'); stdout.write('er opaque-secret\n');
  stdout.write('sk-\x1b[31mcoloredsecret123\x1b[0m\n'); stdout.write('/connect login openai --api-key opaque-value\n'); stdout.write('safe tail\n'); await command('stop');
  const text = read(); expect(text).not.toMatch(/arbitrary secret|opaque-secret|coloredsecret123|opaque-value/); expect(text).toContain('sensitive-input-display-excluded'); expect(text).toContain('safe tail');
});
it('excludes credentials inside split control payloads and exact painted input rows after submission', async () => {
  await command('start session.cast --retain keep');
  stdout.write('\x1b]52;c;sk-'); stdout.write('controlpayload123456\x07\n');
  stdout.write('\x1bPsk-controlpayload654321\x1b\\\n');
  const provider = recordingFrameProvider(fixture.context, { renderFrame: () => ({ rows: ['▌ arbitrary private input', 'safe output'], sensitiveRows: ['▌ arbitrary private input'] }) });
  const frame = provider.renderFrame({ columns: 80, rows: 24 }); stdout.write(fullPaint(prepareRows(frame.rows, 80), 24));
  withoutRecordingInput(fixture.context, () => stdout.write('pipe > arbitrary private input\n'));
  stdout.write('safe independent output\n'); await command('stop');
  expect(read()).not.toMatch(/controlpayload|arbitrary private input/); expect(read()).toContain('safe independent output');
});
it('preserves an externally edited same-size file at discard and marks cancelled partial output incomplete', async () => {
  const scope = readBoundSessionState(fixture.manager, fixture.context.session).scope;
  const file = path.join(fixture.root, 'edited.cast');
  const writer = new TerminalRecording({ id: 'edited', scope, file: 'edited.cast', options: { retention: 'discard', maxBytes: 4096, seconds: 60 }, phase: 'recording', bytes: 0 }, () => undefined, () => {}, { columns: 80, rows: 24 });
  const close = fs.closeSync; let edited = false;
  vi.spyOn(fs, 'closeSync').mockImplementation(fd => {
    close(fd); if (!edited) { edited = true; const content = fs.readFileSync(file); content[0] = 32; fs.writeFileSync(file, content); }
  });
  writer.stop('stopped'); vi.mocked(fs.closeSync).mockRestore(); expect(edited).toBe(true); expect(writer.phase).toBe('unknown'); expect(fs.existsSync(file)).toBe(true);
  await command('start partial.cast --retain keep'); stdout.write('unterminated tail'); await command('cancel');
  expect(decodeCast(read('partial.cast')).incomplete).toBe(true); expect(row().phase).toBe('cancelled');
  await command('start stopped.cast --retain keep'); stdout.write('flushed on ordinary stop'); cancelMediaCommand(fixture.context, 'record', 'stopped');
  expect(decodeCast(read('stopped.cast')).incomplete).toBe(false); expect(read('stopped.cast')).toContain('flushed on ordinary stop'); expect(row().phase).toBe('stopped');
});
it('replays only safe text, respects timing and cancellation, and preserves incomplete-file truth', async () => {
  await command('start session.cast --retain keep'); stdout.write('first\x1b]52;c;CLIPBOARD\x07\n');
  stdout.write('\x1b[2J\x1b[?1000h\u009b31m/shell touch NEVER\n'); await command('stop');
  const cast = decodeCast(read()); expect(recordingText(cast)).toContain('/shell touch NEVER'); expect(recordingText(cast)).not.toMatch(/CLIPBOARD|\x1b|\u009b/);
  await command('play session.cast --speed 16'); expect(fixture.notices.join('\n')).toContain('/shell touch NEVER'); expect(fs.existsSync(path.join(fixture.root, 'NEVER'))).toBe(false);
  const parser = new PlaybackText(); expect(parser.push('\x1b]52;c;SECRET')).toBe(''); expect(parser.push('MORE\x1b\\ok')).toBe('ok');
  const partial = decodeCast(read().replace(/[^\n]+\n$/, '') + '[0.1,"o","broken'); expect(partial.incomplete).toBe(true);
  const controller = new AbortController(); const output: string[] = [];
  const playing = playRecording({ ...cast, events: [[0, 'o', 'first\n'], [5, 'o', 'NEVER\n']] }, controller.signal, () => undefined, text => { output.push(text); controller.abort(); });
  await expect(playing).rejects.toThrow(); expect(output).toEqual(['first\n']);
  let revoked = false; const revoke = setTimeout(() => { revoked = true; }, 20); const started = performance.now();
  try { await expect(playRecording({ ...cast, events: [[3600, 'o', 'NEVER\n']] }, new AbortController().signal,
    () => revoked ? 'changed' : undefined, value => output.push(value), 0.1)).rejects.toThrow('authority changed'); }
  finally { clearTimeout(revoke); }
  expect(performance.now() - started).toBeLessThan(1500); expect(output).toEqual(['first\n']);
});
it('writes a separately approved safe export and preserves source and an existing destination', async () => {
  await command('start session.cast --retain keep'); stdout.write('\x1b[31mexport me\x1b[0m\n'); await command('stop'); const original = read();
  fixture.decision(async name => name === 'record_export' ? 'deny' : 'allow-once'); await command('export session.cast exported.txt');
  expect(fs.existsSync(path.join(fixture.root, 'exported.txt'))).toBe(false); fixture.decision(async () => 'allow-once'); await command('export session.cast exported.txt');
  expect(read('exported.txt')).toBe('export me\n'); expect(read()).toBe(original); await command('export session.cast exported.txt'); expect(read('exported.txt')).toBe('export me\n');
});
it('shows truncation and full-disk failure without replacing third-party data', async () => {
  await command('start session.cast --retain keep --max-bytes 1024'); stdout.write('large'.repeat(1000) + '\n'); expect(row().phase).toBe('truncated'); expect(read().length).toBeLessThan(1024);
  await command('start disk.cast --retain keep'); const write = fs.writeSync;
  vi.spyOn(fs, 'writeSync').mockImplementation(() => { const error = new Error('synthetic disk full') as NodeJS.ErrnoException; error.code = 'ENOSPC'; throw error; });
  stdout.write('output\n'); expect(await command('status')).toMatchObject({ output: expect.stringContaining('unknown') });
  expect(fixture.notices.join('\n')).toContain('Recording unknown'); vi.mocked(fs.writeSync).mockRestore(); expect(fs.writeSync).toBe(write);
  await command('start replacement.cast --retain discard'); fs.renameSync(path.join(fixture.root, 'replacement.cast'), path.join(fixture.root, 'retained.cast')); fs.writeFileSync(path.join(fixture.root, 'replacement.cast'), 'external');
  stdout.write('later\n'); expect(row().phase).toBe('unknown'); expect(read('replacement.cast')).toBe('external');
});
it('applies discard only to its own completed/cancelled file and fences pending startup and session changes', async () => {
  fixture.decision(async () => { cancelMediaFor(fixture.context); return 'allow-once'; }); await command('start never.cast --retain keep'); expect(fs.existsSync(path.join(fixture.root, 'never.cast'))).toBe(false);
  fixture.decision(async () => 'allow-once'); await command('start session.cast --retain discard'); stdout.write('output\n'); await command('cancel');
  expect(row().phase).toBe('discarded'); expect(fs.existsSync(path.join(fixture.root, 'session.cast'))).toBe(false);
  await command('start switched.cast --retain keep'); const old = fixture.context.session; fixture.context.session = fixture.manager.createNew(fixture.root);
  stdout.write('new session\n'); expect(new RecordingStore(fixture.manager, old).read().runs.at(-1)?.phase).toBe('cancelled');
  expect(read('switched.cast')).not.toContain('new session');
});
