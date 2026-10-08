import { lookup } from 'node:dns/promises';
import { isIP, type LookupFunction } from 'node:net';
import { blockedHostReason, isPublicAddress } from '../security/egressGuard.js';
import { NetworkError } from './error.js';
import { withinRequest, type RequestScope } from './request.js';

export function publicUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input); } catch { throw new NetworkError('denied'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || blockedHostReason(url.hostname)) throw new NetworkError('denied');
  return url;
}

/** Capture all DNS answers once. The socket lookup returns only this reviewed set. */
export async function publicLookup(url: URL, scope: RequestScope): Promise<LookupFunction> {
  return approvedLookup(url, scope, isPublicAddress);
}

/** Browser transfers inject their explicit address admission; public callers keep the public policy. */
export async function approvedLookup(url: URL, scope: RequestScope, admitAddress: (address: string) => boolean): Promise<LookupFunction> {
  scope.check();
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const family = isIP(hostname);
  const addresses = family ? [{ address: hostname, family }]
    : await withinRequest(lookup(hostname, { all: true, verbatim: true }), scope);
  scope.check();
  if (!addresses.length || addresses.some(entry => !admitAddress(entry.address)
    || isIP(entry.address) !== entry.family)) throw new NetworkError('denied');
  const approved = addresses.map(entry => ({ ...entry }));
  return (_hostname, options, callback) => {
    try { scope.check(); } catch (error) { callback(error as Error, '', 0); return; }
    if (options.all) callback(null, approved.map(entry => ({ ...entry })));
    else callback(null, approved[0]!.address, approved[0]!.family);
  };
}
