import type { InteractiveAsk } from './ask/contract.js';
import { expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createTeamToolDefinition } from './teamTool.js';
import { createCoreToolRegistry } from './registry.js';
import { createSubagentRunner } from '../../turn/subagent.js';

const interactiveAsk: InteractiveAsk = async questions => ({ status: 'completed', answers: { [questions[0]!.id]: 'Adopt report' } });

it.each(['valid', 'wrong-id', 'missing-falsifiers', 'unread-ref', 'prose', 'oversized', 'mixed-ref'])(
  'retains only bounded structured proposals for %s', async scenario => {
    let reviews = 0;
    const result = await createTeamToolDefinition().execute({ question: 'Why is it slow?', perspectives: ['profile', 'config'] }, {
      interactiveAsk, workspaceRoot: '/repo', taskId: 'proposal-contract', runSubagent: async input => {
        const review = input.prompt.includes('CLAIM');
        if (review) { reviews++; return { text: '', failed: false, steps: 1, allowedTools: [] }; }
        const id = input.definition.description.includes('(profile)') ? 'p1' : 'p2';
        const proposal = { hypothesisId: id, claim: 'Cache misses dominate.', evidenceRefs: [], falsifiers: ['A profile with zero cache misses.'] };
        let text = JSON.stringify(proposal);
        if (id === 'p1') {
          if (scenario === 'wrong-id') text = JSON.stringify({ ...proposal, hypothesisId: 'forged' });
          if (scenario === 'missing-falsifiers') text = JSON.stringify({ ...proposal, falsifiers: [] });
          if (scenario === 'unread-ref' || scenario === 'mixed-ref') text = JSON.stringify({ ...proposal, evidenceRefs: ['invented.txt'] });
          if (scenario === 'prose') text = 'Cache misses dominate.';
          if (scenario === 'oversized') text = JSON.stringify({ ...proposal, claim: 'x'.repeat(5000) });
        }
        return { text, finalText: text, failed: false, steps: 1, allowedTools: [] };
      },
    });
    expect(result.output).toContain(`Proposed ${scenario === 'valid' ? 2 : 1} of 2.`);
    expect(reviews).toBe(scenario === 'valid' ? 2 : 0);
    const proposed = result.metadata?.proposals as Record<string, unknown>[];
    expect(proposed.at(-1)).toMatchObject({ id: 'p2', status: 'proposed', claim: 'Cache misses dominate.',
      evidenceRefs: [], falsifiers: ['A profile with zero cache misses.'] });
    if (scenario !== 'valid') expect(proposed[0]).toMatchObject({ id: 'p1', status: 'failed' });
  });

it('carries original proposer reads and falsifiers into cross-review without giving them review authority', async () => {
  await fs.mkdir('/tmp/cheers-test', { recursive: true });
  const root = await fs.mkdtemp('/tmp/cheers-test/team-proposals-');
  try {
    await fs.writeFile(path.join(root, 'profile.txt'), 'cache misses: 0\n');
    const registry = createCoreToolRegistry();
    const reviewed: string[] = [];
    const run = createSubagentRunner({ defaultMaxSteps: 4, step: async messages => {
      const prompt = String(messages[1]?.content);
      const tools = messages.filter(message => message.role === 'tool');
      if (prompt.includes('CLAIM')) {
        reviewed.push(prompt);
        expect(prompt).toContain('A profile with zero cache misses.');
        expect(prompt).toContain('profile.txt');
        const match = /"evidenceRefs":\["([^"\]]+)"\]/.exec(prompt);
        return { text: `CLAIM p1 counterevidence Borrowed proposer source. evidence: ${match?.[1] ?? 'missing'}`, stopReason: 'stop', toolCalls: [] };
      }
      if (!tools.length) return { text: 'intermediate', stopReason: 'stop', toolCalls: [{ id: 'read', name: 'read', args: { path: 'profile.txt' } }] };
      const id = /hypothesis ID is (p[12])/.exec(prompt)?.[1];
      const receipt = /Read receipt: (\S+)/.exec(String(tools[0]?.content))?.[1];
      expect(receipt).toBeTruthy();
      return { text: JSON.stringify({ hypothesisId: id, claim: 'Cache misses dominate.', evidenceRefs: [receipt], falsifiers: ['A profile with zero cache misses.'] }),
        stopReason: 'stop', toolCalls: [] };
    } }, registry, { workspaceRoot: root, sessionId: 'structured-proposals', agentMode: 'plan', permissionScope: 'allow-all',
      hooks: { dispatch: async () => ({ decision: 'allow' }) }, emit: () => {},
    });
    const result = await registry.get('team')!.execute({ question: 'Why?', perspectives: ['profile', 'config'] }, { interactiveAsk, workspaceRoot: root, taskId: 'structured', runSubagent: run });
    expect(reviewed).toHaveLength(2);
    expect(result.output).toContain('Proposed 2 of 2.');
    expect(result.output).toContain('p1: unresolved');
    expect(result.metadata).toMatchObject({ evidence: expect.arrayContaining([expect.objectContaining({ stage: 'propose', agentId: 'p1' }), expect.objectContaining({ stage: 'propose', agentId: 'p2' })]) });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
