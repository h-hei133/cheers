import { requestPublic } from './connection.js';
import { afterEach, expect, it, vi } from 'vitest';
import { publicLookup, publicUrl } from './address.js';
import { requestScope } from './request.js';
import { isPublicAddress } from '../security/egressGuard.js';

const dns = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:http', () => ({ request: dns.request }));
vi.mock('node:https', () => ({ request: dns.request }));
vi.mock('node:dns/promises', () => dns);
afterEach(() => { dns.lookup.mockReset(); dns.request.mockReset(); vi.useRealTimers(); });

it.each(['0.0.0.0', '10.0.0.1', '127.0.0.1', '169.254.169.254', '100.64.0.1', '192.0.2.1',
  '198.18.0.1', '198.51.100.2', '203.0.113.1', '224.0.0.1', '255.255.255.255', '240.1.2.3',
  '::', '::1', '::ffff:127.0.0.1', '::ffff:192.0.2.1', '::8.8.8.8', 'fd00:ec2::254', 'fe80::1',
  'fec0::1', 'ff02::1', '2001:db8::1', '2002:7f00:1::', '2001::1', '64:ff9b::7f00:1', '3fff::1',
  'fe80::1%eth0', 'not-an-ip'])('rejects non-public address %s', address => {
  expect(isPublicAddress(address)).toBe(false);
});

it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8'])(
  'allows public address %s', address => expect(isPublicAddress(address)).toBe(true));

it.each(['http://user:pass@example.com', 'http://127.1/', 'http://2130706433/', 'http://0x7f000001/', 'file:///tmp/a', 'http://localhost./'])(
  'rejects disallowed URL before DNS: %s', url => {
    expect(() => publicUrl(url)).toThrow('denied'); expect(dns.lookup).not.toHaveBeenCalled();
  });

it.each([[{ address: '127.0.0.1', family: 4 }], [{ address: '8.8.8.8', family: 4 }, { address: '::1', family: 6 }],
  [], [{ address: '8.8.8.8', family: 6 }]].map(addresses => ({ addresses })))('rejects an invalid or mixed DNS set', async ({ addresses }) => {
    dns.lookup.mockResolvedValue(addresses); const scope = requestScope(1000);
    try { await expect(publicLookup(publicUrl('https://public.example'), scope)).rejects.toMatchObject({ code: 'denied' }); }
    finally { scope.dispose(); }
  });

it('returns only the captured reviewed set without resolving again', async () => {
  const entries = [{ address: '8.8.8.8', family: 4 }, { address: '2606:4700:4700::1111', family: 6 }];
  dns.lookup.mockResolvedValueOnce(entries).mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
  const scope = requestScope(1000);
  try {
    const lookup = await publicLookup(publicUrl('https://public.example'), scope);
    entries[0]!.address = '127.0.0.1';
    const callback = vi.fn();
    lookup('public.example', { all: true }, callback);
    expect(callback).toHaveBeenLastCalledWith(null, [{ address: '8.8.8.8', family: 4 }, { address: '2606:4700:4700::1111', family: 6 }]);
    lookup('public.example', {}, callback);
    expect(callback).toHaveBeenLastCalledWith(null, '8.8.8.8', 4);
    expect(dns.lookup).toHaveBeenCalledOnce();
  } finally { scope.dispose(); }
});

it('validates public literals without DNS', async () => {
  const scope = requestScope(1000);
  try { await publicLookup(publicUrl('https://8.8.8.8'), scope); expect(dns.lookup).not.toHaveBeenCalled(); }
  finally { scope.dispose(); }
});

it('pre-cancellation performs no DNS work', async () => {
  const parent = new AbortController(); parent.abort(); const scope = requestScope(1000, parent.signal);
  try { await expect(publicLookup(publicUrl('https://public.example'), scope)).rejects.toMatchObject({ code: 'cancelled' }); expect(dns.lookup).not.toHaveBeenCalled(); }
  finally { scope.dispose(); }
});

it('stops waiting for DNS and removes listeners even when resolution never settles', async () => {
  vi.useFakeTimers(); dns.lookup.mockReturnValue(new Promise(() => {}));
  const scope = requestScope(100); const remove = vi.spyOn(scope.signal, 'removeEventListener');
  const pending = publicLookup(publicUrl('https://public.example'), scope);
  const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' });
  await vi.advanceTimersByTimeAsync(100);
  try { await assertion; expect(remove).toHaveBeenCalled(); }
  finally { scope.dispose(); }
});

it('a late DNS answer after cancellation cannot start a socket', async () => {
  let resolve!: (value: unknown) => void;
  dns.lookup.mockReturnValue(new Promise(done => { resolve = done; }));
  const parent = new AbortController(); const scope = requestScope(1000, parent.signal);
  const pending = requestPublic('https://public.example', { maxBytes: 1024 }, scope);
  parent.abort();
  try {
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    resolve([{ address: '8.8.8.8', family: 4 }]); await Promise.resolve();
    expect(dns.request).not.toHaveBeenCalled();
  } finally { scope.dispose(); }
});

it('rejects mixed public/private resolution before creating a request', async () => {
  dns.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]);
  const scope = requestScope(1000);
  try {
    await expect(requestPublic('https://public.example', { maxBytes: 1024 }, scope)).rejects.toMatchObject({ code: 'denied' });
    expect(dns.request).not.toHaveBeenCalled();
  } finally { scope.dispose(); }
});
