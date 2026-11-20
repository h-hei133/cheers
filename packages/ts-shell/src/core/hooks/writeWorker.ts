import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { Socket } from 'node:net';
import type { Readable, Writable } from 'node:stream';

type WorkerProcess = ChildProcessByStdio<Writable, Readable, null>;
type WorkerTarget = { key: string; program: string; args: readonly string[]; cwd: string };
type PendingReply = { id: number; finish: (result?: string) => void; timeout: NodeJS.Timeout };
type Connection = {
  child: WorkerProcess;
  key: string;
  count: number;
  output: Buffer;
  idle?: NodeJS.Timeout;
  pending?: PendingReply;
};

const MAX_REPLY_BYTES = 16 * 1024;
const MAX_CALLS = 48;
const IDLE_MS = 8_000;
const RETIRE_GRACE_MS = 250;

export class WriteHookWorker {
  private connection?: Connection;

  close(): void {
    const current = this.connection;
    if (current) this.retire(current);
  }

  async request(target: WorkerTarget, payload: string, timeoutMs: number): Promise<string | undefined> {
    if (this.connection?.pending) return undefined;
    if (this.connection && (this.connection.key !== target.key || this.connection.count >= MAX_CALLS)) this.close();
    const current = this.connection ?? this.start(target);
    if (!current) return undefined;
    clearTimeout(current.idle);
    const id = ++current.count;
    return new Promise(resolve => {
      const timeout = setTimeout(() => this.retire(current), timeoutMs);
      current.pending = { id, finish: resolve, timeout };
      // The dispatcher already serialized and admitted the complete parameter object.
      current.child.stdin.write(`{"jsonrpc":"2.0","id":${id},"method":"writeGate/check","params":${payload}}\n`, error => {
        if (error) this.retire(current);
      });
    });
  }

  private start(target: WorkerTarget): Connection | undefined {
    let child: WorkerProcess;
    try {
      child = spawn(target.program, [...target.args], { cwd: target.cwd, stdio: ['pipe', 'pipe', 'ignore'] });
    } catch { return undefined; }
    const current: Connection = { child, key: target.key, count: 0, output: Buffer.alloc(0) };
    this.connection = current;
    // The pending reply timeout keeps the host live while a decision is in flight.
    child.unref();
    if (child.stdin instanceof Socket) child.stdin.unref();
    if (child.stdout instanceof Socket) child.stdout.unref();
    child.once('error', () => this.retire(current));
    child.once('exit', () => this.retire(current));
    child.stdin.on('error', () => this.retire(current));
    child.stdout.on('error', () => this.retire(current));
    child.stdout.on('data', (chunk: Buffer) => this.receive(current, chunk));
    return current;
  }

  private receive(current: Connection, chunk: Buffer): void {
    const pending = current.pending;
    if (this.connection !== current || !pending || current.output.length + chunk.length > MAX_REPLY_BYTES) {
      this.retire(current);
      return;
    }
    current.output = Buffer.concat([current.output, chunk]);
    const newline = current.output.indexOf(10);
    if (newline === -1) return;
    try {
      if (newline !== current.output.length - 1) throw new Error('Unexpected write result frames');
      const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(current.output.subarray(0, newline)));
      if (raw?.jsonrpc !== '2.0' || raw.id !== pending.id || !raw.result || 'error' in raw) {
        throw new Error('Uncorrelated write result');
      }
      current.output = Buffer.alloc(0);
      current.pending = undefined;
      clearTimeout(pending.timeout);
      current.idle = setTimeout(() => this.retire(current), IDLE_MS).unref();
      pending.finish(JSON.stringify(raw.result));
    } catch { this.retire(current); }
  }

  private retire(current: Connection): void {
    if (this.connection !== current) return;
    this.connection = undefined;
    clearTimeout(current.idle);
    if (current.pending) {
      clearTimeout(current.pending.timeout);
      current.pending.finish();
      current.pending = undefined;
    }
    const { child } = current;
    child.stdin.end();
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
    const force = setTimeout(() => child.kill('SIGKILL'), RETIRE_GRACE_MS);
    child.once('exit', () => clearTimeout(force));
  }
}
