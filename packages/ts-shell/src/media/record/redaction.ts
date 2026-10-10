import { StringDecoder } from 'node:string_decoder';
import { redactExportText } from '../../core/security/redaction.js';
import { stripAnsi } from '../../presentation/tui/text/ansi.js';
import { recordLimits } from './model.js';

/** Hold whole lines so split writes and colored secrets cannot escape the scrubber. */
export class RecordingRedactor {
  private decoder = new StringDecoder('utf8');
  private pending = '';
  push(chunk: Buffer | string, excluded = false): string {
    if (excluded) { this.pending = ''; this.decoder = new StringDecoder('utf8'); return ''; }
    this.pending += typeof chunk === 'string' ? chunk : this.decoder.write(chunk);
    if (Buffer.byteLength(this.pending) > recordLimits.eventBytes) throw new Error('Recording line limit exceeded.');
    const last = this.pending.lastIndexOf('\n'); if (last < 0) return '';
    const lines = this.pending.slice(0, last + 1); this.pending = this.pending.slice(last + 1);
    return this.redact(lines);
  }
  finish(): string { const last = this.pending + this.decoder.end(); this.pending = ''; return this.redact(last); }
  private redact(text: string): string {
    return text.split(/(?<=\n)/).map(line => {
      const plain = stripAnsi(line).replace(/[\u0080-\u009f]/g, '');
      const payload = line.replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|[\]PX_^\\])|[\u0000-\u001f\u007f-\u009f]/g, ' ');
      if (/\/connect\s+(?:login|add)|--(?:api-key|token|password|secret)(?:\s|=)/i.test(plain + '\n' + line)
        || redactExportText(plain) !== plain || redactExportText(line) !== line || redactExportText(payload) !== payload) return '[sensitive output excluded]' + (line.endsWith('\n') ? '\n' : '');
      return line;
    }).join('');
  }
}
/** Stateful escape exclusion also covers sequences split across recorded events. */
export class PlaybackText {
  private mode: 'text' | 'escape' | 'csi' | 'string' | 'string-escape' = 'text';
  push(value: string): string {
    let result = '';
    for (const char of value) {
      const code = char.charCodeAt(0);
      if (this.mode === 'string') { if (char === '\x1b') this.mode = 'string-escape'; else if (code === 7 || code === 0x9c) this.mode = 'text'; continue; }
      if (this.mode === 'string-escape') { this.mode = char === '\\' ? 'text' : 'string'; continue; }
      if (this.mode === 'csi') { if (code >= 0x40 && code <= 0x7e) this.mode = 'text'; continue; }
      if (this.mode === 'escape') { this.mode = char === '[' ? 'csi' : ']P_X^'.includes(char) ? 'string' : 'text'; continue; }
      if (char === '\x1b') { this.mode = 'escape'; continue; }
      if (code === 0x9b) { this.mode = 'csi'; continue; }
      if ([0x90, 0x98, 0x9d, 0x9e, 0x9f].includes(code)) { this.mode = 'string'; continue; }
      if (char === '\n' || char === '\t' || code >= 0x20 && code !== 0x7f && !(code >= 0x80 && code <= 0x9f)) result += char;
    }
    return redactExportText(result);
  }
}
