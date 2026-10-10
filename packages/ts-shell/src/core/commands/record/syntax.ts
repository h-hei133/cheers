import type { CommandSyntax } from '../syntax/model.js';
export const recordSyntax: CommandSyntax = { name: 'record', defaultAction: 'status', flags: [], actions: [
  { name: 'status', summary: 'inspect local recording paths, retention and truthful finalization' },
  { name: 'start', summary: 'approve a new local destination and capture actual terminal output', parameters: [{ name: 'destination', kind: 'text', required: true }], flags: [
    { name: 'retain', kind: 'text', values: ['keep', 'discard'], summary: 'required retention after an ordinary stop or cancel' },
    { name: 'max-bytes', kind: 'text', summary: 'file limit, 1024–16777216 bytes (default 4194304)' },
    { name: 'seconds', kind: 'text', summary: 'duration, 1–3600 seconds (default 600)' } ] },
  { name: 'stop', summary: 'finalize actual recorded output and apply the chosen retention' },
  { name: 'cancel', summary: 'cancel capture and mark the result visibly' },
  { name: 'play', summary: 'replay safe text with recorded timing and resize notices', parameters: [{ name: 'source', kind: 'text', required: true }], flags: [
    { name: 'speed', kind: 'text', summary: 'playback speed 0.1–16 (default 1)' } ] },
  { name: 'export', summary: 'approve a new local plain-text export; no terminal control sequences or upload', parameters: [
    { name: 'source', kind: 'text', required: true }, { name: 'destination', kind: 'text', required: true } ] },
] };
