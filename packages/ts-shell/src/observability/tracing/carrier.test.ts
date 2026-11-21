import { describe, expect, it } from 'vitest';
import { traceIdentity, traceParentCarrier } from './carrier.js';

describe('trace context carriers', () => {
  it('accepts a W3C version 00 parent and retains only correlation identifiers', () => {
    const traceId = '1'.repeat(32), spanId = '2'.repeat(16);
    const carrier = traceParentCarrier(`00-${traceId}-${spanId}-01`);
    expect(carrier).toEqual({ 'cheers-trace-id': traceId, 'cheers-span-id': spanId });
    expect(traceIdentity(carrier)).toEqual({ traceId, spanId });
  });

  it.each([
    undefined,
    1,
    '00-11111111111111111111111111111111-2222222222222222-zz',
    `00-${'0'.repeat(32)}-${'2'.repeat(16)}-01`,
    `00-${'1'.repeat(32)}-${'0'.repeat(16)}-01`,
    `01-${'1'.repeat(32)}-${'2'.repeat(16)}-01`,
    `00-${'A'.repeat(32)}-${'2'.repeat(16)}-01`,
  ])('rejects invalid trace parent %s', value => {
    expect(traceParentCarrier(value)).toBeUndefined();
  });
});
