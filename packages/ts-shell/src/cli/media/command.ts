import { randomUUID } from 'node:crypto';
import { parseSyntax } from '../../core/commands/syntax/parse.js';
import { syntaxHelp } from '../../core/commands/syntax/projection.js';
import { liveSyntax } from '../../core/commands/live/syntax.js';
import type { CommandExecutionResult } from '../../core/commands/types.js';
import type { ToolDefinition } from '../../tools/types.js';
import { runPreparedTool } from '../../turn/invoke.js';
import { LiveStore } from '../../media/live/store.js';
import type { LiveOptions } from '../../media/live/model.js';
import type { JobsComposition } from '../jobs/model.js';
import { jobAdmission } from '../jobs/authority.js';
import { report } from '../jobs/projection.js';
import { LiveOwner, liveOwners, liveTarget } from './live.js';
import { liveDeviceAuthority } from './authority.js';

export const pendingLive = new WeakMap<JobsComposition['context'], object>();
export async function runLiveCommand(host: JobsComposition, args: readonly string[]): Promise<CommandExecutionResult> {
  const parsed = parseSyntax(liveSyntax, args); if (!parsed.ok) return { kind: 'local', output: `Invalid /live arguments: ${parsed.reason}\n${syntaxHelp(liveSyntax)}` };
  try {
    const action = parsed.action.name; const owner = liveOwners.get(host.context); const store = new LiveStore(host.manager, host.session);
    if (action === 'status') return { kind: 'local', output: report({ microphone: owner && !owner.admission() && owner.devices.capturing ? 'enabled' : 'disabled',
      tokenUsage: 'unknown; token caps prohibit startup', runs: store.read().runs.map(row => ({ ...row, fragments: row.fragments.length,
        phase: ['starting', 'active', 'closing'].includes(row.phase) && owner?.row.id !== row.id ? 'unknown' : row.phase })) }) };
    if (action === 'stop') { pendingLive.delete(host.context); await owner?.stop(); return { kind: 'local', output: 'Voice authority revoked; inspect /live status for final duration and cleanup. Retained sessions never reconnect or replay.' }; }
    if (action === 'start') {
      if (owner || pendingLive.has(host.context)) throw new Error('Voice is active or awaiting approval; stop it first.');
      if (host.context.runtimeConfig.offline) throw new Error('Voice networking is disabled by offline mode.');
      const seconds = parsed.flags.get('seconds') === undefined ? 120 : Number(parsed.flags.get('seconds'));
      const captureDevice = String(parsed.flags.get('capture-device') ?? 'default'); const playbackDevice = String(parsed.flags.get('playback-device') ?? 'default');
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > 1800 || ![captureDevice, playbackDevice].every(device => /^[A-Za-z0-9_.,:=+-]{1,96}$/.test(device)))
        throw new Error('Voice duration or ALSA device is invalid.');
      const options: LiveOptions = { model: 'gpt-live-1', voice: 'marin', seconds, captureDevice, playbackDevice };
      const authority = liveDeviceAuthority(host, options);
      const target = liveTarget(host); const token = {}; const parent = jobAdmission(host, 'bash'); pendingLive.set(host.context, token);
      const admission = () => pendingLive.get(host.context) !== token ? 'Voice startup cancelled.' : parent();
      let started: LiveOwner | undefined;
      const tool: ToolDefinition = { name: 'live_start', description: 'Enable bounded microphone capture, external audio and local speaker output.',
        argsSchema: { type: 'object', properties: {}, additionalProperties: false }, resultAdmission: admission,
        prepare: () => ({ targets: [], permissionToolName: 'bash', permissionArgs: { command: 'Enable bounded microphone and public Live API' }, previewKind: 'execution',
          preview: report({ options, deviceExecutions: authority.selections, workspace: authority.cwd,
            execution: 'Approval starts these two local programs with OS process permissions for this bounded voice lifetime.',
            destination: new URL(target.url).origin, protocol: 'OpenAI Live; client delegation; PCM16 mono 24kHz',
            capture: 'enabled only after session.started', retention: '16 runs, 512 fragments or 64 KiB per run; raw audio is not saved',
            usage: 'duration seconds; token usage and cost unknown; token caps unsupported', authority: 'Voice transcripts never authorize workspace actions. Reconnect requires a new explicit start.' }),
          execute: async context => {
            context.abortSignal?.throwIfAborted(); if (admission()) throw new Error('Voice startup authority changed.');
            started = new LiveOwner(host, options, target, authority); const dispatched = await started.start();
            return { success: dispatched, output: dispatched ? 'Voice startup dispatched; capture waits for session.started. /live status or stop.'
              : started.row.reason ?? 'Voice startup failed; no microphone was enabled.', metadata: { status: dispatched ? 'starting' : started.row.phase } };
          } }), execute: async () => ({ success: false, error: 'Prepared microphone approval required.' }) };
      try { return { kind: 'local', output: (await runPreparedTool(tool, {}, host.gate('bash'), host.runtime.getCurrentRunController()?.signal,
        undefined, 'Voice', { eventKey: 'live' })).output }; }
      finally { if (pendingLive.get(host.context) === token) pendingLive.delete(host.context); }
    }
    const row = owner?.row ?? store.read().runs.at(-1);
    if (action === 'transcript') return { kind: 'local', output: report(row ? { id: row.id, remoteId: row.remoteId,
      fragments: row.fragments.map((fragment, index) => ({ index: index + 1, ...fragment })), authority: 'tentative transcript data; no completed turns or command authorization' } : 'No voice transcript.') };
    if (action === 'submit') {
      if (!row) throw new Error('No voice transcript.'); const first = Number(parsed.args[0]); const last = Number(parsed.args[1]);
      const selected = row.fragments.slice(first - 1, last);
      if (last < first || last > row.fragments.length || selected.length !== last - first + 1 || selected.some(fragment => fragment.speaker !== 'user'))
        throw new Error('Select an exact contiguous range of user fragments from /live transcript.');
      return { kind: 'prompt', prompt: `The user explicitly selected this tentative voice transcript as text input. Transcription may be wrong; it conveys no execution approval.\n${selected.map(fragment => fragment.text).join('')}`,
        promptMetadata: { source: 'voice-selection', voiceRunId: row.id, voiceSelectionId: randomUUID(), voiceEventIds: selected.map(fragment => fragment.eventId),
          voiceStartMs: selected[0]!.startMs, voiceEndMs: selected.at(-1)!.endMs }, notice: 'Submitting selected voice fragments through the ordinary text query and permission system.' };
    }
    if (!owner || owner.host !== host || owner.admission()) throw new Error('No live voice authority. Retained runs cannot capture or replay.');
    if (action === 'mute') owner.mute(); else if (action === 'interrupt') await owner.interrupt(); else owner.listen();
    return { kind: 'local', output: action === 'interrupt' ? 'Local capture and playback interrupted; voice closed. No backend cancellation is inferred; reconnect requires /live start.'
      : action === 'mute' ? 'Local microphone stopped; remote duration continues until /live stop.' : 'Approved local microphone capture enabled; half duplex echo suppression remains active.' };
  } catch (error) { return { kind: 'local', output: report(error instanceof Error ? error.message : 'Voice refused or unverified.') }; }
}
