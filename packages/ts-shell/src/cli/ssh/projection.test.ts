import { expect, it } from 'vitest';
import { pageDisplay } from './projection.js';

it('withholds a credential value even when its prefix lies on another page or before an arbitrary offset', () => {
  const secret = 'SYNTHETIC_PAGE_SECRET_12345678';
  const prefix = Buffer.from('x'.repeat(16377) + '\ntoken='); const context = Buffer.concat([prefix, Buffer.from(secret)]);
  for (const offset of [16384, 16390]) {
    const projected = pageDisplay({ context, bytes: context.subarray(offset), size: context.length });
    expect(projected).toContain('withheld'); expect(projected).not.toContain(secret); expect(projected).not.toContain(secret.slice(6));
  }
});
it('publishes benign UTF8 output with newlines and preserves raw byte paging independently', () => {
  const context = Buffer.from('α β\n'); expect(pageDisplay({ context, bytes: context, size: context.length })).toContain('α β');
  expect(pageDisplay({ bytes: Buffer.from('unverified context'), size: 18 })).toContain('withheld');
});
