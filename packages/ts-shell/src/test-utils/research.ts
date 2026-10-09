import fs from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';
import { SessionManager } from '../session/SessionManager.js';
import { ResearchRuntime } from '../research/run/runtime.js';
import type { ResearchBrief } from '../research/brief/model.js';
import type { SourceRecord, ClaimRecord } from '../research/evidence/model.js';
import type { ResearchRun } from '../research/run/model.js';
import { boundRun, updateRun } from '../research/run/state.js';
import { researchInputDigest } from '../research/run/prompts.js';

const scratches: string[] = [];
export function researchHarness() {
  const base = path.resolve(process.cwd(), '../../.tmp'); fs.mkdirSync(base, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(base, 'research-test-')); scratches.push(scratch);
  const root = path.join(scratch, 'workspace'); const home = path.join(scratch, 'home');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true }); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
  const manager = new SessionManager(); const session = manager.createNew(root); const progress: string[] = [];
  const runtime = new ResearchRuntime({ store: manager, current: () => session, report: message => progress.push(message) });
  return { root, scratch, manager, session, runtime, progress };
}
export function cleanupResearch() { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const scratch of scratches.splice(0)) fs.rmSync(scratch, { recursive: true, force: true }); }
export const researchBrief: ResearchBrief = { revision: 1, question: 'Versioned feature conditions', mode: 'software',
  questions: [{ id: 'q1', text: 'What changed?' }, { id: 'q2', text: 'Under which conditions?' }],
  anchors: { versions: ['v2'], platforms: ['Linux'], conditions: ['enabled'] }, scope: 'v2 Linux', exclusions: [] };
export const sourceRecord: SourceRecord = { id: 's-fixture', kind: 'file', provider: 'read', locator: 'release.md',
  fetchedAt: '2026-10-09T00:00:00.000Z', callId: 'call', childId: 'child', briefRevision: 1, status: 'read',
  contentHash: 'a'.repeat(64), hashScope: 'selected-text', readKey: '{"offset":1,"limit":500}',
  replicas: [], excerpts: [{ id: 'l1', location: 'lines 1-1', text: 'v2 enabled only on Linux.' }], limits: [] };
export function fixtureClaim(source = sourceRecord, questionId = 'q1'): ClaimRecord {
  return { id: `c-${questionId}`, questionId, text: 'v2 feature requires enabled mode on Linux.', kind: 'behavior', scope: 'v2 Linux enabled',
    support: 'direct', supportReason: 'Actual versioned source excerpt.', supporting: [{ sourceId: source.id, excerptId: source.excerpts[0]!.id,
      quote: source.excerpts[0]!.text.slice(0, 80) }], opposing: [], conflicts: [], limitations: [] };
}
export function finishResearch(setup: ReturnType<typeof researchHarness>, overrides: Partial<ResearchRun> = {}) {
  const created = setup.runtime.create({ question: researchBrief.question, depth: 'quick', save: true });
  const claim = fixtureClaim();
  const finished = updateRun(setup.runtime.binding(), run => ({ ...run, brief: researchBrief, briefs: [researchBrief], sources: [sourceRecord], claims: [claim],
    draft: { summary: 'Bound result', claims: [claim], covered: ['q1'], uncovered: ['q2'], limitations: ['Condition coverage incomplete.'] },
    status: 'partial', stage: 'report', review: { role: 'independent', correlation: 'same-model-independent-context',
      inputDigest: researchInputDigest(run), childId: 'review', status: 'completed', findings: [], uncovered: ['q2'], limitation: 'Bounded same model review.' }, ...overrides }));
  setup.runtime.arm(finished); return { ...setup, created, finished, binding: setup.runtime.binding(), current: () => boundRun(setup.runtime.binding()) };
}
