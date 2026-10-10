import path from 'node:path';
import { isIP } from 'node:net';
import { readTextFile, pathIdentity } from '../../core/workspace/files.js';
import { privateText } from '../storage/private.js';
import { identifier, keys, object, parseJson, requireValue, text } from '../contract/value.js';

export interface Profile {
  version: 1; origin: string; principal: string; token: string; addresses: string[];
  check(): void;
}
/** Only exact configured origins and reviewed DNS addresses receive the bearer. */
export function readProfile(target: string, assertRead?: (absolute: string) => void): Profile {
  target = path.resolve(target); assertRead?.(target);
  const source = privateText(target); const identity = pathIdentity(target);
  const selected = object(parseJson(source, 64 * 1024)); keys(selected, ['version', 'origin', 'principal', 'tokenFile', 'addresses']); requireValue(selected.version === 1);
  const origin = canonicalOrigin(text(selected.origin, 2048)); const principal = identifier(selected.principal);
  const tokenFile = text(selected.tokenFile, 4096); requireValue(path.isAbsolute(tokenFile)); assertRead?.(tokenFile);
  const tokenSource = privateText(tokenFile, 256); const tokenIdentity = pathIdentity(tokenFile); const token = tokenSource.trim();
  requireValue(/^[a-zA-Z0-9_-]{32,192}$/.test(token));
  requireValue(Array.isArray(selected.addresses) && selected.addresses.length > 0 && selected.addresses.length <= 16);
  const addresses = selected.addresses.map(address => { const result = text(address, 128); requireValue(isIP(result)); return result; });
  const url = new URL(origin); const host = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol === 'http:') requireValue(addresses.every(address => address === host));
  return { version: 1, origin, principal, token, addresses, check: () => {
    assertRead?.(target); assertRead?.(tokenFile);
    requireValue(pathIdentity(target) === identity && privateText(target, 64 * 1024) === source
      && pathIdentity(tokenFile) === tokenIdentity && privateText(tokenFile, 256) === tokenSource, 'stale');
  } };
}
export function canonicalOrigin(value: string): string {
  const url = new URL(value); const host = url.hostname.replace(/^\[|\]$/g, '');
  requireValue(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/'
    && (url.protocol === 'https:' || (url.protocol === 'http:' && (host === '127.0.0.1' || host === '::1'))), 'denied');
  return url.origin;
}
