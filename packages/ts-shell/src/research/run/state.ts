import type { BoundSessionHost } from '../../session/store/bound.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import type { ResearchRun, ResearchEvent } from './model.js';
import { currentResearch, readResearch, replaceResearch, writeResearch } from './store.js';
import { safeText } from '../evidence/producer.js';

export interface RunBinding { readonly host: BoundSessionHost; readonly session: Session; readonly id: string }
export function boundRun(binding: RunBinding): ResearchRun {
  const run = currentResearch(readResearch(binding.host, binding.session));
  if (!run || run.id !== binding.id) throw new Error('The current research run changed.');
  return run;
}
export function updateRun(binding: RunBinding, update: (run: ResearchRun) => ResearchRun): ResearchRun {
  const edit = readResearch(binding.host, binding.session);
  const old = currentResearch(edit);
  if (!old || old.id !== binding.id) throw new Error('The current research run changed.');
  const next = { ...update(old), revision: old.revision + 1 };
  writeResearch(binding.host, binding.session, edit, replaceResearch(edit, next));
  return next;
}
export function runEvent(run: ResearchRun, kind: ResearchEvent['kind'], detail: string): ResearchRun {
  const event: ResearchEvent = { sequence: (run.events.at(-1)?.sequence ?? 0) + 1,
    timestamp: new Date().toISOString(), kind, stage: run.stage, detail: safeText(detail) };
  return { ...run, events: [...run.events, event].slice(-256) };
}
export function assertChild(run: ResearchRun, epoch: number, childId: string): void {
  if (run.epoch !== epoch || run.status !== 'running' || run.pending?.childId !== childId) throw new Error('Research child publication is stale.');
}
