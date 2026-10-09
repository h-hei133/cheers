import { validateToolArguments } from '../../core/tools/arguments.js';
import { isRecord } from '../../core/values/record.js';
import { freezeDeep } from '../../core/values/freeze.js';
import { researchStateSchema } from './schema.js';
import type { ResearchState } from './model.js';

export function decodeResearchState(value: unknown): ResearchState | undefined {
  if (!isRecord(value)) return undefined;
  try {
    if (Buffer.byteLength(JSON.stringify(value)) > 4 * 1024 * 1024) return undefined;
    validateToolArguments(researchStateSchema, value);
    const state = value as unknown as ResearchState;
    if (new Set(state.runs.map(run => run.id)).size !== state.runs.length
      || state.currentId !== undefined && !state.runs.some(run => run.id === state.currentId)) return undefined;
    for (const run of state.runs) {
      if (run.sessionId !== state.sessionId || run.sessionCreatedAt !== state.sessionCreatedAt
        || run.workspace.path !== state.workspace.path || run.workspace.identity !== state.workspace.identity
        || !Number.isFinite(Date.parse(run.deadlineAt)) || !Number.isFinite(Date.parse(run.createdAt))
        || run.pending && !run.children.some(child => child.id === run.pending?.childId)
        || run.status === 'completed' && (run.pending || !run.draft || run.review?.status !== 'completed' || !run.fragments.length)) return undefined;
    }
    return freezeDeep(structuredClone(state));
  } catch { return undefined; }
}
