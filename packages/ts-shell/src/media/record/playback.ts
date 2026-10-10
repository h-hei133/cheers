import { setTimeout as delay } from 'node:timers/promises';
import type { Cast } from './model.js';
import { PlaybackText, RecordingRedactor } from './redaction.js';
import { redactExportText } from '../../core/security/redaction.js';
export function recordingText(cast: Cast): string {
  const text = new PlaybackText(); return redactExportText(cast.events.filter(event => event[1] === 'o' || event[1] === 'e').map(event => text.push(event[2])).join(''));
}
export async function playRecording(cast: Cast, signal: AbortSignal, admission: () => string | undefined,
  output: (text: string) => void, speed = 1): Promise<void> {
  if (!Number.isFinite(speed) || speed < 0.1 || speed > 16) throw new Error('Playback speed must be between 0.1 and 16.');
  const start = performance.now(); const text = new PlaybackText(); const redactor = new RecordingRedactor();
  for (const [at, type, data] of cast.events) {
    signal.throwIfAborted(); if (admission()) throw new Error('Playback session authority changed.');
    const due = start + at * 1000 / speed;
    while (performance.now() < due) {
      await delay(Math.min(100, due - performance.now()), undefined, { signal });
      signal.throwIfAborted(); if (admission()) throw new Error('Playback session authority changed.');
    }
    signal.throwIfAborted(); if (admission()) throw new Error('Playback session authority changed.');
    if (type === 'o' || type === 'e') { const safe = redactor.push(text.push(data)); if (safe) output(safe); }
    else if (type === 'r') output(`[recorded terminal size ${data}]`);
  }
  signal.throwIfAborted(); if (admission()) throw new Error('Playback session authority changed.');
  const tail = redactor.finish(); if (tail) output(tail);
}
