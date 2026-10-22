import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionManager } from '../../../session/SessionManager.js';
import { createPlan, editPlan } from '../../../planning/plan/state.js';
import { readPlan, writePlan } from '../../../planning/plan/store.js';
import { createReport, span } from '../../../core/commands/report/projection.js';
import { textBlock } from '../../../presentation/tui/transcript/blocks.js';
import { Transcript } from '../../../presentation/tui/transcript/container.js';
import type { CommandContext } from '../../../core/commands/types.js';
import type { JobsComposition } from '../../jobs/model.js';
import { opensPicker, pickerFor, type PickerHost } from './registry.js';
import { agentsPicker } from './agents.js';
import { btwPicker } from './btw.js';
import { jobsPicker } from './jobs.js';
import { planPicker } from './plan.js';
import { usagePicker } from './usage.js';

const hub = vi.hoisted(() => ({ value: { jobs: [] as Record<string, unknown>[] } }));
vi.mock('../../jobs/hub.js', () => ({ hubProjection: () => hub.value }));

const context = (sessionId = 'panel-session'): CommandContext => ({
  cwd: process.cwd(),
  sessionId,
});

describe('phase 20 panel consumers', () => {
  beforeEach(() => {
    hub.value = { jobs: [] };
  });

  it('opens the missing bare commands without claiming argument forms', () => {
    const host = {
      commandContext: context(),
      transcript: new Transcript(),
      sessionManager: {} as SessionManager,
      jobs: {} as JobsComposition,
      agentDefinitions: () => [],
    } as unknown as PickerHost;
    for (const command of ['/jobs', '/agents', '/usage', '/btw', '/plan-review']) {
      expect(requirePicker(command, host)).toBeDefined();
      expect(opensPicker(`${command} detail`)).toBe(false);
    }
  });

  it('keeps jobs read-only and presents live agents, definitions, and discovery diagnostics through the agents owner', async () => {
    hub.value = {
      jobs: [{
        id: 'agent-1', backend: 'agent', status: 'unknown', storedStatus: 'running',
        prompt: 'Inspect the repository', childSessionId: 'child-1', runs: [], liveOwner: false,
        detached: false, output: 'complete',
      }],
    };
    const liveJob = {
      id: 'agent-live', prompt: 'Inspect the repository', status: 'running', output: 'pending',
      childSessionId: 'child-live', runs: [{ id: 'run-1' }], note: 'live owner', text: 'live output', truncated: false,
    };
    const session = { id: 'panel-session', projectRoot: process.cwd(), createdAt: '2026-10-22T00:00:00.000Z',
      updatedAt: '2026-10-22T00:00:00.000Z', status: 'active', turns: [] };
    const scope = { sessionId: session.id, sessionCreatedAt: session.createdAt,
      workspace: { path: process.cwd(), identity: 'fixture-workspace' } };
    const jobs = {
      session,
      context: { session },
      jobs: { scope: () => scope },
      agents: { journal: { get: () => ({ ...liveJob, scope }), list: () => [{ ...liveJob, scope }] }, hasLive: (id: string) => id === liveJob.id },
    } as unknown as JobsComposition;
    expect(jobsPicker(jobs).title).toBe('Jobs');
    const agents = agentsPicker(() => [{
      name: 'review',
      source: 'user',
      status: 'enabled',
      description: 'Review a bounded change.',
      model: 'vendor/reviewer',
    }], {
      ...context(),
      agentsCommand: vi.fn(async () => ({ kind: 'local' as const, output: 'definition report' })),
    }, () => ({
      definitions: [{ name: 'review', source: 'user', status: 'enabled', description: 'Review a bounded change.', model: 'vendor/reviewer' }],
      diagnostics: ['workspace/.agents: discovery limit reached.'],
    }), jobs);
    const rows = await agents.load();
    expect(rows.map(row => row.id)).toEqual(['agent:agent-live', 'definition:review', 'diagnostic:0']);
    expect(agents.detail?.('agent:agent-live')).toContain('Status: running');
    expect(agents.detail?.('diagnostic:0')?.some(line => line.includes('discovery limit reached'))).toBe(true);
    expect((await agents.apply(['agent:agent-live']))?.report?.title).toBe('Agent agent-li');
    expect((await agents.apply(['diagnostic:0']))?.note).toContain('read-only');
    expect((await agents.apply(['definition:review']))?.note).toBe('definition report');
  });

  it('reopens a retained side-question report without appending a copy', async () => {
    const transcript = new Transcript();
    const report = createReport({ title: 'Side question', facts: { question: 'Why?', delivered: true },
      lines: [{ kind: 'text', spans: [span('answer', 'text')] }] });
    transcript.append({ ...textBlock('command', 'answer', 'Side question'), report });
    const picker = btwPicker(transcript);
    await picker.load();
    expect((await picker.apply(['btw:0']))?.reportRetained).toBe(true);
    expect(transcript.all()).toHaveLength(1);
  });

  it('binds live agents and effective definitions through the agents picker', async () => {
    const session = { id: 'panel-session', projectRoot: process.cwd(), createdAt: '2026-10-22T00:00:00.000Z',
      updatedAt: '2026-10-22T00:00:00.000Z', status: 'active', turns: [] };
    const scope = { sessionId: session.id, sessionCreatedAt: session.createdAt,
      workspace: { path: process.cwd(), identity: 'fixture-workspace' } };
    const liveJob = { id: 'agent-live', prompt: 'Inspect.', status: 'running', output: 'pending',
      childSessionId: 'child-live', runs: [], note: 'live owner', text: '', truncated: false, scope };
    const host = {
      commandContext: context(),
      transcript: new Transcript(),
      sessionManager: {} as SessionManager,
      jobs: { session, context: { session }, jobs: { scope: () => scope },
        agents: { journal: { list: () => [liveJob] }, hasLive: () => true } } as unknown as JobsComposition,
      agentDefinitions: () => [{ name: 'review', source: 'user', status: 'enabled', description: 'Review.' }],
      agentDiscovery: () => ({ definitions: [{ name: 'review', source: 'user', status: 'enabled', description: 'Review.' }], diagnostics: [] }),
    } as unknown as PickerHost;
    const picker = requirePicker('/agents', host);
    expect((await picker!.load()).map(row => row.id)).toEqual(['agent:agent-live', 'definition:review']);
  });

  it('projects stale running agents as unknown and pages redacted output through the jobs owner', async () => {
    const session = { id: 'panel-session', projectRoot: process.cwd(), createdAt: '2026-10-22T00:00:00.000Z',
      updatedAt: '2026-10-22T00:00:00.000Z', status: 'active', turns: [] };
    const scope = { sessionId: session.id, sessionCreatedAt: session.createdAt,
      workspace: { path: process.cwd(), identity: 'fixture-workspace' } };
    const stale = { id: 'agent-stale', backend: 'agent', scope, origin: { kind: 'local' }, createdAt: 1,
      prompt: 'Inspect the fixture.', digest: 'digest', childSessionId: 'child-stale', runs: [], status: 'running',
      text: 'x'.repeat(16384) + 'Authorization: Bearer SYNTHETIC_SIDE_SECRET', truncated: false, output: 'pending', note: 'stored owner' };
    const jobs = {
      session, context: { session }, jobs: { scope: () => scope },
      agents: { journal: { list: () => [stale], get: () => stale }, hasLive: () => false },
    } as unknown as JobsComposition;
    const picker = agentsPicker(undefined, context(), undefined, jobs);
    const rows = await picker.load();
    expect(rows[0]?.note).toBe('unknown · pending');
    expect(picker.detail?.('agent:agent-stale')).toContain('Status: unknown (stored running)');
    const result = await picker.apply(['agent:agent-stale']);
    expect(result?.report?.facts.status).toBe('unknown');
    const text = result?.report ? result.report.lines.flatMap(line => line.kind === 'text'
      ? line.spans.map(item => item.text) : []).join('\n') : '';
    expect(text).toContain('withheld');
    expect(text).not.toContain('SYNTHETIC_SIDE_SECRET');
    expect(text).toContain('/jobs output agent-stale text 16384');
  });

  it('marks an agent from another session scope as detached', async () => {
    const session = { id: 'panel-session', projectRoot: process.cwd(), createdAt: '2026-10-22T00:00:00.000Z',
      updatedAt: '2026-10-22T00:00:00.000Z', status: 'active', turns: [] };
    const scope = { sessionId: session.id, sessionCreatedAt: session.createdAt,
      workspace: { path: process.cwd(), identity: 'fixture-workspace' } };
    const detachedScope = { ...scope, sessionCreatedAt: '2026-10-21T00:00:00.000Z' };
    const job = { id: 'agent-detached', backend: 'agent', scope: detachedScope, origin: { kind: 'local' }, createdAt: 1,
      prompt: 'Inspect elsewhere.', digest: 'digest', childSessionId: 'child-detached', runs: [], status: 'completed',
      text: '', truncated: false, output: 'complete', note: 'other scope' };
    const jobs = {
      session, context: { session }, jobs: { scope: () => scope },
      agents: { journal: { list: () => [job] }, hasLive: () => false },
    } as unknown as JobsComposition;
    const picker = agentsPicker(undefined, context(), undefined, jobs);
    const rows = await picker.load();
    expect(rows[0]?.note).toBe('unknown · complete');
    expect(picker.detail?.('agent:agent-detached')).toContain('Detached from this session');
  });

  it('rejects a same-id session rebind while an agents panel is open', async () => {
    const session = { id: 'panel-session', projectRoot: process.cwd(), createdAt: '2026-10-22T00:00:00.000Z',
      updatedAt: '2026-10-22T00:00:00.000Z', status: 'active', turns: [] };
    const scope = { sessionId: session.id, sessionCreatedAt: session.createdAt,
      workspace: { path: process.cwd(), identity: 'fixture-workspace' } };
    const job = { id: 'agent-live', backend: 'agent', scope, origin: { kind: 'local' }, createdAt: 1,
      prompt: 'Inspect.', digest: 'digest', childSessionId: 'child-live', runs: [], status: 'running',
      text: '', truncated: false, output: 'pending', note: 'live' };
    const jobs = {
      session, context: { session }, jobs: { scope: () => scope },
      agents: { journal: { list: () => [job] }, hasLive: () => true },
    } as unknown as JobsComposition;
    const picker = agentsPicker(undefined, context(), undefined, jobs);
    await picker.load();
    (jobs.context as unknown as { session: typeof session }).session = { ...session, createdAt: '2026-10-22T00:00:01.000Z' };
    expect(picker.isCurrent?.()).toBe(false);
    expect(await picker.apply(['agent:agent-live'])).toBeUndefined();
  });

  it('does not fetch account quota merely by opening usage', async () => {
    const usageCommand = vi.fn(async () => ({ kind: 'local' as const, output: 'fetched account usage' }));
    const picker = usagePicker({ ...context('usage-session'), usageCommand });
    expect((await picker.load()).map(row => row.id)).toEqual(['overview', 'account', 'reset-status']);
    expect(usageCommand).not.toHaveBeenCalled();
    expect((await picker.apply(['account']))?.note).toContain('fetched account usage');
    expect(usageCommand).toHaveBeenCalledWith(['account'], expect.objectContaining({ sessionId: 'usage-session' }));
  });

  it('drops a late account result after the configuration binding changes', async () => {
    let revision = 1;
    let finish!: (value: { kind: 'local'; output: string }) => void;
    const usageCommand = vi.fn(() => new Promise<{ kind: 'local'; output: string }>(resolve => { finish = resolve; }));
    const picker = usagePicker({
      ...context('usage-stale'),
      usageCommand,
      readConfiguration: () => ({ config: {} as never, catalog: [], revision }),
    });
    await picker.load();
    const pending = picker.apply(['account']);
    revision = 2;
    finish({ kind: 'local', output: 'late account result' });
    expect(await pending).toBeUndefined();
  });

  it('reads retained side questions without asking the provider again', async () => {
    const transcript = new Transcript();
    const report = createReport({
      title: 'Side question',
      facts: { question: 'Why is this true?', delivered: true, providerRequest: true },
      lines: [{ kind: 'text', spans: [span('Because the test says so.', 'text')] }],
    });
    transcript.append({ ...textBlock('command', 'side question output', 'Side question'), report });
    const picker = btwPicker(transcript);
    expect((await picker.load())[0]).toMatchObject({ label: 'Why is this true?', note: 'answered' });
    expect((await picker.apply(['btw:0']))?.report).toBe(report);
    transcript.append(textBlock('command', 'later output'));
    expect(await picker.apply(['btw:0'])).toBeUndefined();
  });

  it('reads the persisted plan and leaves execution as an exact draft', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase20-plan-picker-'));
    try {
      const manager = new SessionManager();
      const session = manager.createNew(root);
      const base = readPlan(manager, session);
      const plan = createPlan(base.bound.scope, 'Keep the source projection exact.');
      writePlan(manager, session, base, plan);
      const picker = planPicker(manager, { cwd: root, sessionId: session.id });
      expect(picker).toBeDefined();
      expect((await picker!.load()).map(row => row.id)).toEqual(['show', 'approve', 'reject', 'execute']);
      expect((await picker!.apply(['show']))?.report?.facts.phase).toBe('draft');
      const execute = await picker!.apply(['execute']);
      expect(execute?.draft).toMatch(/^\/plan-review execute /);
      const current = readPlan(manager, session);
      writePlan(manager, session, current, editPlan(current.plan!, { text: 'Changed while the panel was open.' }));
      expect((await picker!.apply(['approve']))?.note).toContain('changed');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

function requirePicker(command: string, host: PickerHost) {
  return pickerFor(command, host);
}
