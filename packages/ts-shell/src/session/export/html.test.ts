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

  it('renders GFM links, escapes raw HTML and leaves Markdown images as voluntary links', () => {
    const content = [
      'Read https://docs.example.test/guide or [more][ref].',
      '',
      '[ref]: ./notes.md',
      '',
      '![remote image](https://img.example.test/pixel.png)',
      '![local image](./asset.png)',
      '![unsafe image](javascript:alert(1))',
      '[![linked image](https://img.example.test/embedded.png)](./outer.md)',
      '',
      '<script>window.sentinel=1</script>',
      '<iframe src="https://img.example.test">Unexpected</iframe>',
      '',
      '[unsafe](java&#x73;cript:alert(1)) [unsafe reference][bad]',
      '',
      '[bad]: data:text/plain,unsafe',
    ].join('\n');
    const result = embedded(payload({ content })).entries[0]!;
    expect(result.content).toBe(content);
    expect(result.html).toContain('<a href="https://docs.example.test/guide"');
    expect(result.html).toContain('<a href="./notes.md"');
    expect(result.html).toContain('<a href="https://img.example.test/pixel.png"');
    expect(result.html).toContain('<a href="./asset.png"');
    expect(result.html).toContain('<a href="./outer.md" rel="noreferrer noopener">linked image</a>');
    expect(result.html).not.toContain('href="https://img.example.test/embedded.png"');
    expect(result.html).toContain('unsafe image');
    expect(result.html).toContain('&lt;script&gt;window.sentinel=1&lt;/script&gt;');
    expect(result.html).toContain('&lt;iframe');
    expect(result.html).not.toMatch(/<(?:img|script|iframe)\b/i);
    expect(result.html).not.toMatch(/href="(?:javascript|data):/i);
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
