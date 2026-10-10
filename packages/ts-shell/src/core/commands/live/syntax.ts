import type { CommandSyntax } from '../syntax/model.js';
export const liveSyntax: CommandSyntax = { name: 'live', defaultAction: 'status', flags: [], actions: [
  { name: 'status', summary: 'inspect voice lifecycle, seconds and unknown token usage' },
  { name: 'start', summary: 'approve microphone capture, Live networking and local playback', flags: [
    { name: 'seconds', kind: 'text', summary: 'wall duration, 1–1800 seconds (default 120)' },
    { name: 'capture-device', kind: 'text', summary: 'ALSA capture device (default default)' },
    { name: 'playback-device', kind: 'text', summary: 'ALSA playback device (default default)' } ] },
  { name: 'mute', summary: 'stop local microphone capture; the remote session still accrues duration' },
  { name: 'listen', summary: 'explicitly resume approved microphone capture' },
  { name: 'interrupt', summary: 'stop local capture and playback; request a speech interruption' },
  { name: 'stop', summary: 'close voice, wait for final duration and native cleanup' },
  { name: 'transcript', summary: 'inspect timestamped tentative fragments; no completed turns are inferred' },
  { name: 'submit', summary: 'submit an explicit user-fragment range through the ordinary text query', parameters: [
    { name: 'first', kind: 'integer', required: true, minimum: 1 }, { name: 'last', kind: 'integer', required: true, minimum: 1 } ] },
] };
