import { describe, expect, it } from 'vitest';
import { renderExportHtml } from './html.js';
import type { ExportPayload } from './model.js';

function payload(entry: Partial<ExportPayload['entries'][number]> = {}): ExportPayload {
  return { header: { sessionId: 'caller-session', exportedAt: '2026-11-18', workspace: 'caller-workspace' },
    entries: [{ id: 'one', role: 'assistant', content: 'safe **body**', html: 'obsolete caller markup', ...entry }],
    tree: [{ id: 'one', depth: 0, kind: 'turn-message', preview: 'safe preview' }], leafId: 'one', warnings: [] };
}

function embedded(value: ExportPayload): ExportPayload {
  const html = renderExportHtml(value);
  const data = /<script id="session-data" type="text\/plain">([^<]+)<\/script>/.exec(html);
  expect(data).not.toBeNull();
  return JSON.parse(Buffer.from(data![1]!, 'base64').toString('utf8'));
}

describe('public standalone export projection', () => {
  it('renders the original content instead of trusting caller HTML', () => {
    const input = payload({ html: '<img src="data:image/png;base64,=" onerror="window.sentinel=1">injected' });
    const before = JSON.stringify(input);
    const result = embedded(input);
    expect(result.entries[0]!.html).toBe('<p>safe <strong>body</strong></p>');
    expect(JSON.stringify(result)).not.toContain('onerror');
    expect(JSON.stringify(input)).toBe(before);
  });

  it('applies the same text redaction to public content, calls and previews', () => {
    const result = embedded({ ...payload({ content: 'password=FAKE_CONTENT',
      toolCalls: [{ id: 'call', name: 'read', arguments: '{"password":"FAKE_ARGUMENT","path":"visible"}' }] }),
      tree: [{ id: 'one', depth: 0, kind: 'turn-message', preview: 'token=FAKE_PREVIEW' }], warnings: ['secret=FAKE_WARNING'] });
    expect(JSON.stringify(result)).not.toContain('FAKE_');
    expect(result.entries[0]!.toolCalls![0]!.arguments).toContain('visible');
  });

  it('refuses malformed attachments visibly without changing valid source content', () => {
    const result = embedded(payload({ images: [{ mediaType: 'image/png', data: '=' },
      { mediaType: 'image/svg+xml', data: 'PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj4=' }] }));
    expect(result.entries[0]!.images).toBeUndefined();
    expect(result.warnings.join(' ')).toMatch(/2.*image.*omitted/i);
    expect(result.entries[0]!.content).toBe('safe **body**');
  });
});
