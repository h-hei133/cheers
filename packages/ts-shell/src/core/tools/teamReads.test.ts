import type { InteractiveAsk } from './ask/contract.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createCoreToolRegistry } from './registry.js';
import { createSubagentRunner } from '../../turn/subagent.js';
import type { AgentMessage } from '../agent/state.js';

const interactiveAsk: InteractiveAsk = async questions => ({ status: 'completed', answers: { [questions[0]!.id]: 'Adopt report' } });

let root: string;
beforeEach(async () => {
  await fs.mkdir('/tmp/cheers-test', { recursive: true });
  root = await fs.mkdtemp('/tmp/cheers-test/team-reads-');
  await fs.writeFile(path.join(root, 'profile.txt'), 'header\ncache misses: 0\nfooter\n');
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

it.each(['counterevidence', 'none-found', 'invented', 'denied', 'proposer-only', 'mixed'])(
  'uses original read, runner and parent gate for %s evidence', async scenario => {
    const registry = createCoreToolRegistry();
    const seen: string[] = [];
    const run = createSubagentRunner({ defaultMaxSteps: 4, step: async messages => {
      const review = String(messages[1]?.content).includes('CLAIM');
      const tools = messages.filter(message => message.role === 'tool');
      const shouldRead = review ? scenario !== 'proposer-only' : scenario === 'proposer-only';
      if (!tools.length && shouldRead) return { text: 'intermediate narration', stopReason: 'stop',
        toolCalls: [{ id: 'native-read', name: 'read', args: { path: 'profile.txt:2-2' } }] };
      if (!review) return { text: JSON.stringify({ hypothesisId: /hypothesis ID is (p[12])/.exec(String(messages[1]?.content))?.[1], claim: 'final claim', evidenceRefs: [], falsifiers: ['Observed contradiction.'] }), stopReason: 'stop', toolCalls: [] };
      const output = String(tools[0]?.content ?? '');
      seen.push(output);
      const receipt = /receipt: (\S+)/.exec(output)?.[1];
      const id = scenario === 'invented' || scenario === 'proposer-only' ? 'profile.txt' : receipt ?? 'missing';
      const kind = scenario === 'none-found' ? 'none-found' : 'counterevidence';
      return { text: `CLAIM p1 ${kind} Checked the selected content. evidence: ${id}${scenario === 'mixed' ? ', invented-id' : ''}`,
        stopReason: 'stop', toolCalls: [] };
    } }, registry, { workspaceRoot: root, sessionId: 'team-read', agentMode: 'build', permissionScope: 'allow-all',
      denyRules: scenario === 'denied' ? [{ tool: 'read' }] : [],
      hooks: { dispatch: async () => ({ decision: 'allow' }) }, emit: () => {},
    });
    const result = await registry.get('team')!.execute({ question: 'why is it slow?', perspectives: ['profile', 'config'] }, {
      interactiveAsk, workspaceRoot: root, taskId: 'team-native', runSubagent: run,
    });
    const successful = ['counterevidence', 'none-found'].includes(scenario);
    expect(result.output).toContain(`p1: ${successful ? scenario === 'none-found' ? 'survived' : 'refuted' : 'unresolved'}`);
    expect(result.metadata).toMatchObject({ proposals: [expect.objectContaining({ claim: 'final claim' }), expect.objectContaining({ claim: 'final claim' })] });
    if (scenario !== 'proposer-only' && scenario !== 'denied') {
      expect(seen.every(output => output.includes('cache misses: 0'))).toBe(true);
      expect(seen.every(output => output.includes('Read receipt:') && output.includes('lines 2-2'))).toBe(true);
      expect(result.metadata).toMatchObject({ evidence: [expect.objectContaining({ locator: 'profile.txt:2-2', start: 2, end: 2,
        contentHash: createHash('sha256').update('cache misses: 0').digest('hex') }), expect.any(Object)] });
    } else expect((result.metadata?.evidence as { stage: string }[]).filter(entry => entry.stage === 'review')).toEqual([]);
    expect(result.output).toContain('not independent confirmation');
    expect(await fs.readFile(path.join(root, 'profile.txt'), 'utf8')).toBe('header\ncache misses: 0\nfooter\n');
  });

it('keeps a read receipt visible when the original tool output exceeds the model text cap', async () => {
  await fs.writeFile(path.join(root, 'profile.txt'), 'a'.repeat(12000) + '\n');
  const registry = createCoreToolRegistry();
  const run = createSubagentRunner({ defaultMaxSteps: 3, step: async (messages: readonly AgentMessage[]) => {
    if (!String(messages[1]?.content).includes('CLAIM')) return { text: JSON.stringify({ hypothesisId: /hypothesis ID is (p[12])/.exec(String(messages[1]?.content))?.[1], claim: 'claim', evidenceRefs: [], falsifiers: ['Observed contradiction.'] }), stopReason: 'stop', toolCalls: [] };
    const tool = messages.find(message => message.role === 'tool');
    if (!tool) return { text: 'read', stopReason: 'stop', toolCalls: [{ id: 'read', name: 'read', args: { path: 'profile.txt' } }] };
    const receipt = /receipt: (\S+)/.exec(String(tool.content))?.[1];
    expect(receipt).toBeTruthy();
    return { text: `CLAIM p1 none-found No counterevidence in returned content. evidence: ${receipt}`, stopReason: 'stop', toolCalls: [] };
  } }, registry, { workspaceRoot: root, sessionId: 'team-long-read', agentMode: 'plan', permissionScope: 'allow-all',
    hooks: { dispatch: async () => ({ decision: 'allow' }) }, emit: () => {},
  });
  const result = await registry.get('team')!.execute({ question: 'why?', perspectives: ['a', 'b'] }, { interactiveAsk, workspaceRoot: root, taskId: 'long', runSubagent: run });
  expect(result.output).toContain('p1: survived');
});
