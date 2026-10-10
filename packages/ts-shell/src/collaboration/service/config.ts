import fs from 'node:fs';
import path from 'node:path';
import { isIP } from 'node:net';
import { readTextFile, pathIdentity } from '../../core/workspace/files.js';
import { identifier, integer, keys, object, parseJson, requireValue, text } from '../contract/value.js';
import { privateText } from '../storage/private.js';

export interface ServiceConfig {
  version: 1; host: string; port: number; stateFile: string;
  accounts: { principal: string; tokenHash: string; enabled: boolean }[];
  tls?: { cert: string; key: string };
}
export function readServiceConfig(target: string): ServiceConfig {
  const value = object(parseJson(privateText(target), 64 * 1024)); keys(value, ['version', 'host', 'port', 'stateFile', 'accounts', 'tls']);
  requireValue(value.version === 1); const host = text(value.host, 256); requireValue(isIP(host));
  requireValue(Array.isArray(value.accounts) && value.accounts.length > 0 && value.accounts.length <= 32);
  const accounts = value.accounts.map(item => { const account = object(item); keys(account, ['principal', 'tokenHash', 'enabled']);
    const tokenHash = text(account.tokenHash, 64); requireValue(/^[a-f0-9]{64}$/.test(tokenHash) && typeof account.enabled === 'boolean');
    return { principal: identifier(account.principal), tokenHash, enabled: account.enabled }; });
  requireValue(new Set(accounts.map(account => account.principal)).size === accounts.length && new Set(accounts.map(account => account.tokenHash)).size === accounts.length);
  const stateFile = text(value.stateFile, 4096); requireValue(path.isAbsolute(stateFile)); pathIdentity(stateFile);
  requireValue(fs.statSync(path.dirname(stateFile)).isDirectory());
  let tls: ServiceConfig['tls'];
  if (value.tls !== undefined) { const selected = object(value.tls); keys(selected, ['cert', 'key']);
    const cert = text(selected.cert, 4096); const key = text(selected.key, 4096);
    requireValue(path.isAbsolute(cert) && path.isAbsolute(key));
    tls = { cert: readTextFile(cert, 128 * 1024) ?? '', key: privateText(key, 128 * 1024) }; requireValue(tls.cert && tls.key); }
  requireValue(tls || host === '127.0.0.1' || host === '::1', 'denied');
  return { version: 1, host, port: integer(value.port, 1, 65535), stateFile, accounts, ...(tls ? { tls } : {}) };
}
