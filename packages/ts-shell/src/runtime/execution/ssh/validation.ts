import { isRecord } from '../../../core/values/record.js';
import { requireSsh, type SshWorkspace, type SshJobSpec } from './model.js';

export function validateWorkspace(value: unknown): asserts value is SshWorkspace {
  requireSsh(isRecord(value) && Object.keys(value).every(key => ['profileIdentity', 'fingerprint', 'root', 'directoryIdentity', 'uid', 'bootId', 'namespace'].includes(key)));
  requireSsh(typeof value.profileIdentity === 'string' && /^[0-9a-f]{64}$/.test(value.profileIdentity)
    && typeof value.fingerprint === 'string' && /^SHA256:[A-Za-z0-9+/]{43}$/.test(value.fingerprint));
  requireSsh(typeof value.root === 'string' && value.root.startsWith('/') && value.root.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(value.root)
    && !value.root.split('/').some(part => part === '.' || part === '..') && (value.root === '/' || !value.root.endsWith('/')));
  requireSsh(typeof value.directoryIdentity === 'string' && /^[0-9]+:[0-9]+$/.test(value.directoryIdentity)
    && Number.isSafeInteger(value.uid) && Number(value.uid) >= 0 && Number(value.uid) <= 4294967295
    && typeof value.bootId === 'string' && /^[0-9a-f-]{36}$/.test(value.bootId)
    && typeof value.namespace === 'string' && /^[0-9a-f]{32}$/.test(value.namespace));
}
export function validateJobSpec(value: SshJobSpec): void {
  validateWorkspace(value.binding);
  requireSsh(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.id)
    && /^[0-9a-f]{64}$/.test(value.digest) && typeof value.command === 'string' && value.command.trim()
    && Buffer.byteLength(value.command) <= 16 * 1024 && !value.command.includes('\0'));
}
