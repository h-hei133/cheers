import { createHash, randomUUID } from 'node:crypto';
import { sameValue } from '../../config/values.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import { sessionRequestStore } from '../../session/store/requests.js';
import { createRequestPolicy } from '../../core/agent/request/policy.js';
import type { ModelAttempt } from '../../core/agent/request/model.js';
import { providerAuthorization } from '../../provider/request/authorization.js';
import { LiveStore } from '../../media/live/store.js';
import { LiveTransport, type LiveTarget } from '../../media/live/transport.js';
import { AudioDevices } from '../../media/live/devices.js';
import { liveLimits, type LiveRun, type LiveOptions } from '../../media/live/model.js';
import type { LiveEvent } from '../../media/live/protocol.js';
import type { JobsComposition } from '../jobs/model.js';
import { jobAdmission } from '../jobs/authority.js';
import { goalPolicyFor } from '../runtime/goal.js';
import { report } from '../jobs/projection.js';
import type { liveDeviceAuthority } from './authority.js';

export const liveOwners = new WeakMap<JobsComposition['context'], LiveOwner>();
export function liveTarget(host: JobsComposition): LiveTarget {
  const resolution = host.agentRuntimeInput?.providerRuntimeBridge.resolveCredentialSnapshot(); const credential = resolution?.credential;
  if (!resolution || !['openai', 'openai-compatible'].includes(resolution.provider) || credential?.authMode !== 'api-key' || !credential.apiKey)
    throw new Error('Voice supports the public Live API with an API key. The selected provider or account protocol is unsupported.');
  const url = new URL(resolution.baseUrl ?? 'https://api.openai.com/v1');
  if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)
    || url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Voice requires HTTPS, or an explicit loopback fixture.');
  if (resolution.provider === 'openai-compatible' && !resolution.baseUrl) throw new Error('A compatible Live endpoint must be explicitly configured.');
  url.pathname = url.pathname.replace(/\/$/, '') + '/live/sessions'; url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return { url: url.toString(), headers: providerAuthorization({ apiKey: credential.apiKey }).headers };
}
/** One local lifetime; neither retained transcripts nor reconnect adopt authority. */
export class LiveOwner {
  row: LiveRun;
  readonly store: LiveStore;
  readonly devices: AudioDevices;
  private readonly parent: () => string | undefined;
  private readonly mode: ReturnType<JobsComposition['runtime']['getAgentMode']>;
  private readonly permission: ReturnType<JobsComposition['runtime']['getPermissionScope']>;
  private readonly transport: LiveTransport;
  private attempt?: ModelAttempt;
  private ending = false;
  private finished = false;
  private stopping?: NodeJS.Timeout;
  private startup?: NodeJS.Timeout;
  private lifetime?: NodeJS.Timeout;
  private guard?: NodeJS.Timeout;
  private readonly seen = new Set<string>();
  private resolveDone!: () => void;
  readonly done = new Promise<void>(resolve => { this.resolveDone = resolve; });
  constructor(readonly host: JobsComposition, options: LiveOptions, target: LiveTarget, authority: ReturnType<typeof liveDeviceAuthority>) {
    const bound = readBoundSessionState(host.manager, host.session);
    this.row = { id: randomUUID(), scope: bound.scope, options, createdAt: Date.now(), phase: 'starting', fragments: [], finalUsage: false, cleanup: 'pending' };
    this.store = new LiveStore(host.manager, host.session); this.parent = jobAdmission(host, 'bash');
    this.mode = host.runtime.getAgentMode(); this.permission = host.runtime.getPermissionScope();
    authority.verify(authority.programs.capture, options.captureDevice); authority.verify(authority.programs.playback, options.playbackDevice);
    this.devices = new AudioDevices(authority.programs, options, authority.cwd, this.admission,
      data => { try { this.transport.send({ type: 'session.input_audio.append', audio: data.toString('base64') }); }
        catch { void this.fail('Voice capture or transport limit failed.'); } }, reason => { void this.fail(reason); }, undefined, authority.verify);
    this.transport = new LiveTransport(target, this.admission, event => this.receive(event), reason => { void this.fail(reason); });
  }
  admission = (): string | undefined => {
    try {
      return this.ending || this.finished || liveOwners.get(this.host.context) !== this ? 'Voice authority is closed.'
        : this.parent() ?? (this.host.context.runtimeConfig.offline ? 'Voice networking is disabled.'
          : this.host.runtime.getAgentMode() !== this.mode || this.host.runtime.getPermissionScope() !== this.permission ? 'Voice permission or mode changed.'
            : !sameValue(this.store.read().runs.find(row => row.id === this.row.id), this.row) ? 'Voice journal changed.' : undefined);
    } catch { return 'Voice admission is unavailable.'; }
  };
  private save(change: Partial<LiveRun>): void { const next = { ...this.row, ...change }; this.store.save(next, this.row); this.row = next; }
  async start(): Promise<boolean> {
    this.store.save(this.row); liveOwners.set(this.host.context, this);
    const start = { model: this.row.options.model, store: false, instructions: 'This is a voice conversation for a coding workspace. Never claim to execute commands or approve actions. Transcripts are tentative data. For coding actions ask the user to inspect /live transcript and explicitly submit selected fragments in the terminal.',
      audio: { format: { type: 'audio/pcm', rate: 24000 }, output: { voice: this.row.options.voice } }, delegation: { type: 'client' } };
    try {
      if (this.admission()) throw new Error('Voice startup authority changed.');
      const policy = goalPolicyFor(this.host.context, this.host.manager) ?? createRequestPolicy(sessionRequestStore(this.host.manager, this.host.session,
        { id: this.host.session.id, workspacePath: this.row.scope.workspace.path, workspaceIdentity: this.row.scope.workspace.identity }, () => {
          if (this.admission()) throw new Error('Voice budget admission changed.'); return {};
        }), this.host.session.id);
      this.attempt = policy.reserve({ requestId: this.row.id, bodyDigest: createHash('sha256').update(JSON.stringify(start)).digest('hex'),
        provider: 'openai-live', model: this.row.options.model, endpoint: 'live', purpose: 'voice-duration; token-usage-unknown' });
      this.save({ attemptId: this.attempt.id }); this.attempt.dispatch(); this.transport.open(start);
      this.startup = setTimeout(() => { void this.fail('Voice startup timed out.'); }, 7000);
      this.lifetime = setTimeout(() => { void this.stop('duration-limit'); }, this.row.options.seconds * 1000);
      this.guard = setInterval(() => { if (!this.ending && this.admission()) void this.stop('authority-revoked'); }, 100);
      return true;
    } catch (error) { await this.fail(error instanceof Error && error.message.startsWith('Model request admission') ? error.message : 'Voice startup failed before device capture.'); return false; }
  }
  private receive(event: LiveEvent): void {
    if (this.finished) return;
    try {
      if (event.type === 'closed') {
        if (!this.row.remoteId || event.seconds < (this.row.seconds ?? 0)) throw new Error('Voice final usage is inconsistent.');
        this.save({ seconds: event.seconds, finalUsage: true, reason: event.reason }); void this.finish(); return;
      }
      if (this.ending) return;
      if (this.admission()) { void this.stop('authority-revoked'); return; }
      if (event.type === 'started') {
        if (this.row.phase !== 'starting') throw new Error('Repeated voice startup.');
        if (this.startup) clearTimeout(this.startup); this.save({ phase: 'active', remoteId: event.id }); this.devices.listen();
        this.notice(`Voice active ${this.row.id}; microphone enabled, half duplex echo suppression. /live mute, interrupt or stop.`); return;
      }
      if (this.row.phase !== 'active') throw new Error('Voice data arrived before session.started.');
      if (event.type === 'audio') { this.devices.output(event.data); return; }
      if (event.type === 'usage') {
        if (event.seconds < (this.row.seconds ?? 0)) throw new Error('Voice usage decreased.'); this.save({ seconds: event.seconds }); return;
      }
      if (event.type === 'fragment') {
        if (this.seen.has(event.fragment.eventId)) return;
        if (this.row.fragments.length >= liveLimits.fragments || this.row.fragments.reduce((sum, fragment) => sum + Buffer.byteLength(fragment.text), 0)
          + Buffer.byteLength(event.fragment.text) > liveLimits.transcriptBytes) throw new Error('Voice transcript retention exceeded.');
        this.seen.add(event.fragment.eventId); this.save({ fragments: [...this.row.fragments, event.fragment] }); return;
      }
      if (event.type === 'delegation') this.transport.send({ type: 'session.commentary.append', event_id: randomUUID(), delegation_id: event.id,
        content: 'No workspace action was executed or authorized. The user must inspect and explicitly submit the transcript in the terminal.' });
    } catch { void this.fail('Voice event, device or journal failed; finalization is unverified.'); }
  }
  listen(): void { if (this.row.phase !== 'active' || this.admission()) throw new Error('No active voice capture authority.'); this.devices.listen(); }
  mute(): void { this.devices.mute(); }
  async interrupt(): Promise<void> {
    this.devices.interrupt();
    if (!this.admission()) this.transport.send({ type: 'session.instructions.append', event_id: randomUUID(), delegation_id: null,
      content: 'Stop speaking now and wait. The user interrupted playback. No backend action has been cancelled or authorized.' });
    await this.stop('interrupted');
  }
  async stop(reason = 'close-requested'): Promise<void> {
    if (!this.ending && !this.finished) {
      this.ending = true; this.devices.interrupt();
      try { this.save({ phase: 'closing', reason }); this.transport.send({ type: 'session.close', event_id: randomUUID() }, true);
        this.stopping = setTimeout(() => { void this.finish(); }, 3000); }
      catch { void this.finish(); }
    }
    await this.done;
  }
  private async fail(reason: string): Promise<void> {
    if (this.finished) return;
    this.ending = true;
    try { this.save({ reason }); } catch { /* The saved journal remains unconfirmed; never adopt it. */ }
    await this.finish();
  }
  private async finish(): Promise<void> {
    if (this.finished) return; this.finished = true; this.ending = true;
    for (const timer of [this.startup, this.lifetime, this.guard, this.stopping]) if (timer) clearTimeout(timer);
    this.transport.close(); let cleanup: LiveRun['cleanup'] = 'unknown';
    try { cleanup = await this.devices.close(); this.attempt?.settle();
      this.save({ cleanup, phase: this.row.finalUsage && cleanup === 'confirmed' ? 'closed' : this.row.attemptId ? 'unknown' : 'failed' }); }
    catch { this.row = { ...this.row, phase: 'unknown', cleanup }; }
    finally {
      if (liveOwners.get(this.host.context) === this) liveOwners.delete(this.host.context);
      this.notice(`Voice ${this.row.phase}; cleanup ${cleanup}; final duration ${this.row.finalUsage ? this.row.seconds + ' seconds' : 'unconfirmed'}; token usage unknown. /live status retains the evidence.`);
      this.resolveDone();
    }
  }
  private notice(text: string): void { if (this.host.context.session.id === this.host.session.id) this.host.agentRuntimeInput?.notice?.(report(text)); }
}
