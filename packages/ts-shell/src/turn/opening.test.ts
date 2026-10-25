import { expect, it } from 'vitest';
import { openingMessage } from './opening.js';

it('preserves source text beside the current environment, extra roots, continuity and images', () => {
  const image = { type: 'image' as const, mimeType: 'image/png', data: 'AA==' };
  const message = openingMessage({ workspaceRoot: '/workspace', prompt: '  source\nnext  ', permissionScope: 'ask',
    workspaceRoots: [{ path: '/extra', access: 'read', identity: 'fixture' }], continuityContext: 'previous facts', attachments: { images: [image] } });
  expect(message).toMatchObject({ role: 'user', content: [{ type: 'text', text: expect.stringContaining('read-only: "/extra"') }, image] });
  expect((message.content as Array<{ text?: string }>)[0]!.text).toContain('historical context, not current authorization');
  expect((message.content as Array<{ text?: string }>)[0]!.text).toMatch(/  source\nnext  $/);
  expect(typeof openingMessage({ workspaceRoot: '/workspace', prompt: 'question' }).content).toBe('string');
});
