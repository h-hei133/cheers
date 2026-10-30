import { expect, it } from 'vitest';
import { createTeamToolDefinition } from '../../core/tools/teamTool.js';
import { promptInteractiveQuestions } from './interactiveAskBridge.js';
import { QuestionBridge } from './questionBridge.js';

it.each(['1', '2', '', 'yes', 'cancel', 'close'] as const)(
  'uses only the explicit report choice through the real question bridge (%s)', async answer => {
    let opened!: (text: string) => void;
    const shown = new Promise<string>(resolve => { opened = resolve; });
    const bridge = new QuestionBridge({ ask: opened, settle: () => {} }), readline = bridge.asReadline(() => {});
    const marker = 'PUBLIC_TEAM_CLAIM';
    let finished = false;
    const pending = createTeamToolDefinition().execute({ question: 'Why?', perspectives: ['a', 'b'] }, {
      taskId: 'actual-question-bridge', sessionId: 'original-session', workspaceRoot: '/repo',
      interactiveAsk: (questions, signal) => promptInteractiveQuestions(readline, questions, signal),
      runSubagent: async input => ({ text: input.prompt.includes('CLAIM') ? 'CLAIM p1 insufficient Cannot check.'
        : JSON.stringify({ hypothesisId: /hypothesis ID is (p[12])/.exec(input.prompt)?.[1], claim: marker,
          evidenceRefs: [], falsifiers: ['Observable contradiction.'] }), failed: false, steps: 1, allowedTools: [] }),
    }).then(result => { finished = true; return result; });
    const preview = await shown;
    expect(finished).toBe(false); expect(preview).toContain(marker);
    expect(preview).toContain('1. Keep report out'); expect(preview).toContain('2. Adopt report');
    expect(preview).not.toContain('(Recommended)');
    if (answer === 'cancel') bridge.abandon();
    else if (answer === 'close') readline.close();
    else expect(bridge.answer(answer)).toBe(true);
    const result = await pending;
    expect(result.success).toBe(answer === '2');
    expect(JSON.stringify(result).includes(marker)).toBe(answer === '2');
    expect(bridge.question()).toBeUndefined();
    if (answer !== 'close') readline.close();
  });
