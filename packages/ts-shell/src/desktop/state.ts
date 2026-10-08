import { realpathSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { ToolExecutionContext } from '../tools/types.js';
import { DesktopError, type DesktopSnapshot } from './model.js';
import { DesktopScope } from './command.js';
import { freezeDeep } from '../core/values/freeze.js';

export class DesktopState {
  snapshot?: DesktopSnapshot;
  blocked = false;
  private tail: Promise<void> = Promise.resolve();
  private active?: DesktopScope;
  private epoch = 0;
  private sequence = 0;
  private queued = 0;
  private readonly identity = randomUUID();
  async run<T>(parent: AbortSignal | undefined, operation: (scope: DesktopScope) => Promise<T>): Promise<T> {
    const epoch = this.epoch; const scope = new DesktopScope(parent);
    this.queued++;
    const previous = this.tail; let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    this.tail = previous.then(() => held);
    const admitted = await Promise.race([previous.then(() => true), scope.stopped.then(() => false)]);
    let active = false;
    try {
      scope.check(); if (!admitted || epoch !== this.epoch) throw new DesktopError('cancelled', 'Desktop session was closed while this action was queued.');
      if (this.blocked) throw new DesktopError('cleanup', 'Desktop process cleanup is unconfirmed. Restart the runtime before continuing.');
      this.active = scope;
      active = true;
      return await operation(scope);
    } finally {
      if (scope.evidence.cleanup === 'unknown') this.blocked = true;
      if (active) {
        if (scope.signal.aborted) { this.epoch++; this.snapshot = undefined; }
        this.active = undefined;
      }
      this.queued--; scope.dispose(); release();
    }
  }
  setSnapshot(snapshot: Omit<DesktopSnapshot, 'id'>): DesktopSnapshot {
    return this.snapshot = freezeDeep({ ...snapshot, id: `d${this.identity}-${++this.sequence}` });
  }
  async close(): Promise<void> {
    this.epoch++; this.active?.controller.abort(); this.snapshot = undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const settled = await Promise.race([this.tail.then(() => true), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 4000); })]);
      if (!settled) this.blocked = true;
    } finally { clearTimeout(timer); }
  }
  inactive(): boolean { return !this.active && !this.queued && !this.snapshot && !this.blocked; }
}

const states = new Map<string, DesktopState>();
export function desktopState(context: Pick<ToolExecutionContext, 'workspaceRoot' | 'sessionId'>): DesktopState {
  const root = realpathSync(context.workspaceRoot); const stats = statSync(root, { bigint: true });
  const key = JSON.stringify([context.sessionId ?? 'default', root, `${stats.dev}:${stats.ino}:${stats.birthtimeMs}`]);
  let state = states.get(key);
  if (!state) {
    if (states.size >= 16) for (const [identity, owner] of states) if (owner.inactive()) states.delete(identity);
    if (states.size >= 16) throw new DesktopError('unavailable', 'Desktop session owner capacity is exhausted. Close inactive sessions.');
    state = new DesktopState(); states.set(key, state);
  }
  return state;
}
