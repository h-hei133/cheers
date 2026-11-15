import fs from 'node:fs';

const MAX_BACKLOG_BYTES = 64 * 1024 * 1024;

/** Own the device byte account and synchronous best-effort mode restoration. */
export class TerminalOutput {
  pendingBytes = 0;

  constructor(private readonly disconnected: () => boolean, private readonly disconnect: () => void) {}

  write(data: string, onWritten?: () => void): void {
    if (this.disconnected() || !data) return;
    const bytes = Buffer.byteLength(data, 'utf8');
    if (this.pendingBytes + bytes > MAX_BACKLOG_BYTES) { this.disconnect(); return; }
    this.pendingBytes += bytes;
    process.stdout.write(data, error => {
      this.pendingBytes = Math.max(0, this.pendingBytes - bytes);
      if (!error) onWritten?.();
    });
  }

  writeSync(data: string): void {
    if (!process.stdout.isTTY) return;
    try { fs.writeSync(1, data); }
    catch {
      try { process.stdout.write(data); }
      catch { /* The device is gone; nothing further can be restored. */ }
    }
  }
}
