import { expect, it } from 'vitest';
import { openingMessage, replayEnvironment, requestEnvironment } from './opening.js';

it('preserves source text beside the current environment, extra roots, continuity and images', () => {
  const image = { type: 'image' as const, mimeType: 'image/png', data: 'AA==' };
  const message = openingMessage({ workspaceRoot: '/workspace', prompt: '  source\nnext  ', permissionScope: 'ask',
    workspaceRoots: [{ path: '/extra', access: 'read', identity: 'fixture' }], continuityContext: 'previous facts', attachments: { images: [image] } });
  expect(message).toMatchObject({ role: 'user', content: [{ type: 'text', text: expect.stringContaining('read-only: "/extra"') }, image] });
  expect((message.content as Array<{ text?: string }>)[0]!.text).toContain('historical context, not current authorization');
  expect((message.content as Array<{ text?: string }>)[0]!.text).toMatch(/  source\nnext  $/);
  expect(typeof openingMessage({ workspaceRoot: '/workspace', prompt: 'question' }).content).toBe('string');
});

it('replays the exact saved environment at its original user prompt without rewriting source text', () => {
  const firstEnvironment = requestEnvironment({ workspaceRoot: '/first', permissionScope: 'ask' });
  const nextEnvironment = requestEnvironment({ workspaceRoot: '/second', permissionScope: 'accept-edits' });
  const first = { role: 'user' as const, content: 'original text', metadata: { requestEnvironment: firstEnvironment } };
  const second = { role: 'user' as const, content: 'next text', metadata: { requestEnvironment: firstEnvironment } };
  const third = { role: 'user' as const, content: 'after rebind', metadata: { requestEnvironment: nextEnvironment } };

  const replayed = replayEnvironment([first, { role: 'assistant', content: 'answer' }, second, third]);

  expect(replayed[0]?.content).toBe(`${firstEnvironment}\n\noriginal text`);
  expect(replayed[2]?.content).toBe('next text');
  expect(replayed[3]?.content).toBe(`${nextEnvironment}\n\nafter rebind`);
  expect(first.content).toBe('original text');
  expect(second.content).toBe('next text');
  expect(third.content).toBe('after rebind');
});

it('retains the captured environment on the current request', () => {
  const environment = { workspaceRoot: '/workspace', permissionScope: 'ask' as const };
  const stored = { role: 'user' as const, content: 'accepted text',
    metadata: { requestEnvironment: requestEnvironment(environment) } };

  expect(openingMessage({ ...environment, prompt: 'accepted text' }, stored)).toMatchObject({
    role: 'user', content: 'accepted text', metadata: stored.metadata,
  });
  expect(openingMessage({ ...environment, permissionScope: 'accept-edits', prompt: 'new text' }).content)
    .toContain('permission_scope=accept-edits');
  expect(openingMessage({ ...environment, prompt: 'legacy text' }).content).toContain('cwd=/workspace');
  expect(stored.content).toBe('accepted text');
});
