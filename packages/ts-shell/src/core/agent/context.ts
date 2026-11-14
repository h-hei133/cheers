import { isDeepStrictEqual } from 'node:util';
import type { AgentMessage } from './state.js';
import type { MessageProjection } from './messages.js';
import { captureMessageHistory } from './custom.js';
import { snapshotData } from '../values/data.js';

/** The live loop may accept only a projection proved from its captured raw history. */
export interface RequestContextOwner {
  readonly eligible: boolean;
  isCurrent(): boolean;
  accept(projection: MessageProjection): boolean;
}

export function captureContext(messages: readonly AgentMessage[]): readonly AgentMessage[] {
  return snapshotData(captureMessageHistory(messages), { bytes: 64 * 1024 * 1024, nodes: 250_000, depth: 48 }) as unknown as readonly AgentMessage[];
}

/** Never run application getters while checking a request against live state. */
export function sameContext(messages: readonly AgentMessage[], captured: readonly AgentMessage[]): boolean {
  try { return isDeepStrictEqual(captureContext(messages), captured); }
  catch { return false; }
}
