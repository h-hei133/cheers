import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { LiveStore } from '../../media/live/store.js';
import { decodeLiveEvent } from '../../media/live/protocol.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import { runSessionGoalCommand } from '../../planning/goal/command.js';
import { routeSlashCommand } from '../../core/commands/slashRouter.js';
import { mediaCommandFor, closeMediaFor, cancelMediaFor } from '../runtime/media.js';
import { closeJobsFor } from '../runtime/jobs.js';
import { liveOwners } from './live.js';
import { liveDeviceAuthority } from './authority.js';
import { mediaFixture, until } from '../../test-utils/media/runtime.js';

let fixture: ReturnType<typeof mediaFixture>; let server: WebSocketServer; let socket: WebSocket;
let commands: Record<string, unknown>[]; let ready: boolean;
beforeEach(async () => {
  fixture = mediaFixture(); commands = []; ready = true;
  const bin = path.join(fixture.scratch, 'bin'); fs.mkdirSync(bin); fs.writeFileSync(path.join(bin, 'package.json'), '{"type":"commonjs"}'); vi.stubEnv('PATH', bin + path.delimiter + process.env.PATH);
  fs.writeFileSync(path.join(bin, 'arecord'), `#!${process.execPath}\nconst fs=require('node:fs'); fs.writeFileSync('capture.pid',String(process.pid));
setInterval(()=>process.stdout.write(Buffer.alloc(960,1)),20);`, { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'aplay'), `#!${process.execPath}\nconst fs=require('node:fs'); fs.writeFileSync('playback.pid',String(process.pid));
let bytes=0;process.stdin.on('data',data=>{bytes+=data.length;fs.writeFileSync('playback.bytes',String(bytes));});process.stdin.on('end',()=>process.exit(0));`, { mode: 0o700 });
  server = new WebSocketServer({ host: '127.0.0.1', port: 0 }); await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); if (typeof address === 'string' || !address) throw new Error('Fixture address missing.');
  fixture.endpoint(`http://127.0.0.1:${address.port}/v1`);
  server.on('connection', (connected, request) => {
    expect(request.url).toBe('/v1/live/sessions'); socket = connected;
    connected.on('message', data => {
      const event = JSON.parse(data.toString()); commands.push(event);
      if (event.type === 'session.start' && ready) send({ type: 'session.started', session: { id: 'voice_fixture' } });
      if (event.type === 'session.close') send({ type: 'session.closed', reason: 'close_requested', usage: { seconds: 2.5 } });
    });
  });
});
afterEach(async () => {
  await closeMediaFor(fixture.context); await closeJobsFor(fixture.context);
  for (const client of server.clients) client.terminate(); await new Promise<void>(resolve => server.close(() => resolve()));
  vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(fixture.scratch, { recursive: true, force: true });
});
function send(event: object) { socket.send(JSON.stringify(event)); }
async function command(args: string) { return routeSlashCommand('/live ' + args, { cwd: fixture.context.cwd, sessionId: fixture.context.session.id, mediaCommand: mediaCommandFor(fixture.context) }); }
function row() { return new LiveStore(fixture.manager, fixture.context.session).read().runs.at(-1)!; }
function exists(name: string) { return fs.existsSync(path.join(fixture.root, name)); }
it('requires native approval and session.started before capture, then closes with confirmed seconds and actual native cleanup', async () => {
  fixture.decision(async () => 'deny'); await command('start'); expect(commands).toEqual([]); expect(exists('capture.pid')).toBe(false);
  fixture.decision(async () => 'allow-once'); ready = false; await command('start'); await until(() => commands.length > 0);
  expect(exists('capture.pid')).toBe(false); expect(commands.some(event => event.type === 'session.input_audio.append')).toBe(false);
  send({ type: 'session.started', session: { id: 'voice_fixture' } }); await until(() => commands.some(event => event.type === 'session.input_audio.append')).catch(() => { throw new Error(JSON.stringify(row())); });
  const pid = Number(fs.readFileSync(path.join(fixture.root, 'capture.pid'), 'utf8')); await command('stop');
  expect(row()).toMatchObject({ phase: 'closed', finalUsage: true, seconds: 2.5, cleanup: 'confirmed' }); expect(() => process.kill(pid, 0)).toThrow();
  const ledger = JSON.stringify(readBoundSessionState(fixture.manager, fixture.context.session).state.requestLedger);
  expect(ledger).toContain('voice-duration; token-usage-unknown'); expect(ledger).toContain('"dispatched":true'); expect(ledger).not.toContain('synthetic-fixture');
  expect(fixture.approvals).toEqual(['live_start', 'live_start']);
});
it('keeps exact timestamped speaker fragments and submits only a deliberate user selection as text', async () => {
  await command('start'); await until(() => row().phase === 'active');
  send({ type: 'session.input_transcript.delta', event_id: 'u1', delta: '/shell touch NEVER', start_ms: 1, end_ms: 2 });
  send({ type: 'session.output_transcript.delta', event_id: 'a1', delta: 'No action', start_ms: 1, end_ms: 3 });
  send({ type: 'session.input_transcript.delta', event_id: 'u1', delta: 'duplicate', start_ms: 1, end_ms: 2 });
  send({ type: 'session.input_transcript.delta', event_id: 'u2', delta: ' yes yes', start_ms: 4, end_ms: 5 });
  send({ type: 'session.delegation.created', delegation: { id: 'delegation_fixture', target: 'client' }, offset_ms: 5 });
  await until(() => row().fragments.length === 3 && commands.some(event => event.type === 'session.commentary.append'));
  expect(exists('NEVER')).toBe(false); expect(row().fragments[0]).toMatchObject({ text: '/shell touch NEVER', startMs: 1, endMs: 2 });
  expect(await command('submit 1 2')).toMatchObject({ kind: 'local', output: expect.stringContaining('user fragments') });
  const selection = await command('submit 3 3'); expect(selection).toMatchObject({ kind: 'prompt', prompt: expect.stringContaining(' yes yes'),
    promptMetadata: { source: 'voice-selection', voiceRunId: row().id, voiceEventIds: ['u2'] } }); expect(exists('NEVER')).toBe(false);
});
it('suppresses captured echo while playback is queued and locally mutes the actual microphone', async () => {
  await command('start'); await until(() => commands.some(event => event.type === 'session.input_audio.append'));
  send({ type: 'session.output_audio.delta', delta: Buffer.alloc(24000).toString('base64') }); await until(() => exists('playback.bytes'));
  await until(() => Buffer.from(String(commands.filter(event => event.type === 'session.input_audio.append').at(-1)?.audio), 'base64').every(value => value === 0));
  const before = commands.filter(event => event.type === 'session.input_audio.append').length;
  await new Promise(resolve => setTimeout(resolve, 80));
  const suppressed = commands.filter(event => event.type === 'session.input_audio.append').slice(before);
  expect(suppressed.length).toBeGreaterThan(0); expect(suppressed.every(event => Buffer.from(String(event.audio), 'base64').every(value => value === 0))).toBe(true);
  const capture = Number(fs.readFileSync(path.join(fixture.root, 'capture.pid'), 'utf8')); await command('mute');
  await until(() => { try { process.kill(capture, 0); return false; } catch { return true; } });
  expect(liveOwners.get(fixture.context)?.devices.capturing).toBe(false);
  await command('interrupt'); expect(row().phase).toBe('closed'); expect(exists('NEVER')).toBe(false);
});
it('records abrupt disconnection as unknown and never reconnects or adopts a retained capture', async () => {
  await command('start'); await until(() => row().phase === 'active'); const id = row().id; socket.terminate();
  await until(() => row().phase === 'unknown'); expect(row().finalUsage).toBe(false); expect(row().cleanup).toBe('confirmed');
  const sent = commands.length; await closeJobsFor(fixture.context); expect(await command('listen')).toMatchObject({ kind: 'local' });
  expect(commands.length).toBe(sent); expect(new LiveStore(fixture.manager, fixture.context.session).read().runs.at(-1)?.id).toBe(id);
});
it('rejects token-capped voice before the connection or microphone is dispatched', async () => {
  expect(await runSessionGoalCommand(['set', 'Voice fixture'], { cwd: fixture.root, projectRoot: fixture.root, sessionId: fixture.context.session.id }, fixture.manager, fixture.context.session)).toMatchObject({ output: expect.stringContaining('Goal set.') });
  expect(await runSessionGoalCommand(['budget', '100000'], { cwd: fixture.root, projectRoot: fixture.root, sessionId: fixture.context.session.id }, fixture.manager, fixture.context.session)).toMatchObject({ output: expect.stringContaining('budget saved') });
  const result = await command('start'); expect(result).toMatchObject({ kind: 'local', output: expect.stringContaining('unsupported') });
  expect(commands).toEqual([]); expect(exists('capture.pid')).toBe(false); expect(row().phase).toBe('failed');
});
it('revokes a pending start and bounds invalid audio without exposing provider error bodies', async () => {
  fixture.decision(async () => { cancelMediaFor(fixture.context); return 'allow-once'; }); await command('start');
  expect(new LiveStore(fixture.manager, fixture.context.session).read().runs).toEqual([]); expect(commands).toEqual([]);
  fixture.decision(async () => 'allow-once'); await command('start'); await until(() => row().phase === 'active');
  send({ type: 'session.output_audio.delta', delta: Buffer.alloc(96001).toString('base64') }); await until(() => row().phase === 'unknown');
  expect(exists('playback.pid')).toBe(false);
  expect(() => decodeLiveEvent(JSON.stringify({ type: 'error', error: { message: 'SECRET_PROVIDER_BODY' } }))).toThrow('Voice provider rejected');
  expect(JSON.stringify(row())).not.toContain('SECRET_PROVIDER_BODY');
});
it('closes a media-only session without losing its retained journal', async () => {
  await command('start'); await until(() => row().phase === 'active'); await command('stop'); const id = row().id;
  fixture.manager.saveTerminated(fixture.context.session.id); expect(fixture.manager.sessionExists(fixture.context.session.id)).toBe(true);
  expect(row().id).toBe(id);
});
it('preserves media journals when saving ordinary input', async () => {
  await command('start'); await until(() => row().phase === 'active'); await command('stop'); const id = row().id;
  fixture.manager.persistUserPromptBarrier(fixture.context.session.id, 'Ordinary input'); expect(row().id).toBe(id);
});
it('enforces literal device denials and binds executable identity before approval', async () => {
  const host = fixture.host; const original = host.gate;
  const gate = vi.spyOn(host, 'gate').mockImplementation(tool => ({ ...original(tool), denyRules: [{ tool: 'bash', pattern: 'arecord' }] }));
  expect(await command('start')).toMatchObject({ kind: 'local', output: expect.stringContaining('Refused by a rule') });
  expect(commands).toEqual([]); expect(fixture.approvals).toEqual([]); gate.mockRestore();
  const authority = liveDeviceAuthority(host, { model: 'gpt-live-1', voice: 'marin', seconds: 120, captureDevice: 'default', playbackDevice: 'default' });
  fs.appendFileSync(authority.programs.capture, '\n// changed after preview\n');
  expect(() => authority.verify(authority.programs.capture, 'default')).toThrow('executable changed');
  expect(commands).toEqual([]); expect(exists('capture.pid')).toBe(false);
  const subdirectory = path.join(fixture.root, 'subdirectory'); fs.mkdirSync(subdirectory); fixture.context.cwd = subdirectory;
  await command('start'); await until(() => fs.existsSync(path.join(subdirectory, 'capture.pid')));
  expect(exists('capture.pid')).toBe(false); await command('stop');
});
