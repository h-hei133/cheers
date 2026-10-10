import which from 'which';
import type { CommandExecutionRequest, CommandExecutionResult, ExecutionInput, ExecutionService } from '../../runtime/execution/types.js';
import { createDefaultExecutionService } from '../../runtime/execution/service.js';
import { liveLimits, type LiveOptions } from './model.js';

export interface AudioPrograms { readonly capture: string; readonly playback: string }
export function audioPrograms(): AudioPrograms {
  if (process.platform !== 'linux') throw new Error('Voice devices currently require Linux ALSA and arecord/aplay.');
  try { return { capture: which.sync('arecord'), playback: which.sync('aplay') }; }
  catch { throw new Error('Voice capture or playback executable is missing; install ALSA utilities.'); }
}
function request(program: string, device: string, cwd: string, signal: AbortSignal, seconds: number): CommandExecutionRequest {
  return { operationKind: 'command.run', command: program, args: audioArguments(device),
    cwd, workspaceRoot: cwd, authority: { mode: 'command-allowlisted', source: 'tool-runtime-approval', reason: 'Explicit approved voice device lifetime' },
    caller: 'media.live', reason: 'Approved PCM voice device', reportSafeCommand: 'PCM voice device', abortSignal: signal,
    timeoutMs: seconds * 1000 + 5000, captureOutput: false, cleanupTreeOnExit: true };
}
export function audioArguments(device: string): string[] { return ['-q', '-D', device, '-t', 'raw', '-f', 'S16_LE', '-r', '24000', '-c', '1']; }
export class AudioDevices {
  private capture?: AbortController;
  private speaker?: AbortController;
  private stdin?: ExecutionInput;
  private readonly runs = new Set<Promise<CommandExecutionResult>>();
  private buffered = 0;
  private tail = Promise.resolve();
  private sample: Buffer = Buffer.alloc(0);
  private audibleUntil = 0;
  private uncertain = false;
  private interrupted = false;
  get capturing(): boolean { return Boolean(this.capture); }
  constructor(readonly programs: AudioPrograms, readonly options: LiveOptions, readonly cwd: string,
    readonly admission: () => string | undefined, readonly input: (data: Buffer) => void,
    readonly failure: (reason: string) => void, readonly execution: ExecutionService = createDefaultExecutionService(),
    readonly assertDevice: (program: string, device: string) => void = () => {}) {}
  private start(program: string, device: string, controller: AbortController,
    callbacks: Pick<CommandExecutionRequest, 'onStdout' | 'onStdin'>): void {
    if (this.admission()) throw new Error('Voice device authority changed.');
    this.assertDevice(program, device);
    let diagnostic = ''; const running = this.execution.runCommand({ ...request(program, device, this.cwd, controller.signal, this.options.seconds),
      ...callbacks, onStderr: data => { diagnostic = (diagnostic + data.toString()).slice(0, 4096); } });
    this.runs.add(running);
    void running.then(result => {
      if (result.terminationFailed || result.outputFailed) { this.uncertain = true; this.failure('Voice device cleanup is unverified.'); }
      else if (!controller.signal.aborted) this.failure(/busy|in use/i.test(diagnostic) ? 'Voice device is busy.'
        : /no such|unknown pcm|no soundcards|cannot find card/i.test(diagnostic) ? 'Voice device is missing.' : 'Voice device stopped or failed.');
    }, () => { this.uncertain = true; this.failure('Voice device execution is unverified.'); }).finally(() => this.runs.delete(running));
  }
  listen(): void {
    if (this.capture) return;
    if (this.runs.size >= 4) throw new Error('Voice devices are still cleaning up.');
    const controller = this.capture = new AbortController(); this.sample = Buffer.alloc(0);
    this.start(this.programs.capture, this.options.captureDevice, controller, { onStdout: data => {
      if (controller.signal.aborted || this.admission()) return;
      const joined = this.sample.length ? Buffer.concat([this.sample, data]) : data;
      const even = joined.length - joined.length % 2; this.sample = joined.subarray(even);
      const suppressed = this.buffered > 0 || Date.now() < this.audibleUntil;
      for (let from = 0; from < even; from += 12 * 1024) {
        const chunk = joined.subarray(from, Math.min(even, from + 12 * 1024)); this.input(suppressed ? Buffer.alloc(chunk.length) : chunk);
      }
    } });
  }
  mute(): void { this.capture?.abort(); this.capture = undefined; this.sample = Buffer.alloc(0); }
  output(data: Buffer): void {
    if (this.interrupted || this.admission()) return;
    if (this.buffered + data.length > liveLimits.audioBytes || this.audibleUntil - Date.now() + data.length / 48 > 2200) throw new Error('Voice playback queue exceeded two seconds.');
    if (!this.speaker) {
      const controller = this.speaker = new AbortController();
      this.start(this.programs.playback, this.options.playbackDevice, controller, { onStdin: input => { this.stdin = input; } });
    }
    const speaker = this.speaker; this.buffered += data.length;
    this.tail = this.tail.then(async () => {
      if (speaker.signal.aborted || this.admission()) return;
      if (!this.stdin) throw new Error('Voice playback device is unavailable.');
      await this.stdin.write(data);
      this.audibleUntil = Math.max(Date.now(), this.audibleUntil - 200) + data.length / 48 + 200;
    }).catch(() => { if (!speaker.signal.aborted) this.failure('Voice playback failed.'); }).finally(() => { this.buffered -= data.length; });
  }
  interrupt(): void { this.interrupted = true; this.mute(); this.speaker?.abort(); this.stdin = undefined; }
  async close(): Promise<'confirmed' | 'unknown'> {
    this.interrupt(); const runs = [...this.runs]; const results = await Promise.allSettled(runs); await this.tail;
    return this.uncertain || results.some(result => result.status === 'rejected' || result.value.terminationFailed || result.value.outputFailed) ? 'unknown' : 'confirmed';
  }
}
