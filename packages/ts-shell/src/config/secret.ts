import fs from 'node:fs';
import { isRecord } from '../core/values/record.js';

/**
 * Whether a configuration document holds credential material.
 *
 * The user's config file is where API keys and account tokens live, so its
 * permissions are a security boundary rather than a preference: a file another
 * account on the machine can read is a leaked key, whatever the product thinks
 * it is doing with the value. Deciding this from the document itself — rather
 * than from which file the writer happens to be targeting — means a credential
 * that reaches any config file is protected, including one written by a caller
 * that did not think about it.
 *
 * Only material is counted. A provider name, a model id or an empty placeholder
 * is not a secret, and treating them as one would tighten permissions on files
 * that never needed it.
 */
export function holdsCredentialMaterial(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (isRecord(value.providerCredentials)
    && Object.values(value.providerCredentials).some(credential => isRecord(credential) && holdsCredentialFields(credential))) {
    return true;
  }
  return Array.isArray(value.providerConnections)
    && value.providerConnections.some(connection => isRecord(connection) && holdsCredentialFields(connection));
}

function holdsCredentialFields(record: Record<string, unknown>): boolean {
  if (typeof record.apiKey === 'string' && record.apiKey.trim().length > 0) return true;
  return isRecord(record.accountAuth) && Object.keys(record.accountAuth).length > 0;
}

/**
 * The permission a file holding credentials must have.
 *
 * Owner read and write, nothing for anyone else. Applied on every write, so a
 * file that was created with the umask default before this rule existed is
 * narrowed the next time it is saved rather than staying readable forever.
 */
export const CREDENTIAL_FILE_MODE = 0o600;

/**
 * Narrow an existing credential file without rewriting it.
 *
 * A save whose content does not change still has a permission to correct: the
 * file on disk may predate this rule, and leaving it wide because "nothing
 * changed" would mean the only way to fix it is to edit a setting. Content is
 * untouched, so the revision a caller holds stays valid.
 *
 * Returns whether the file now has the required mode. A failure to change it is
 * reported rather than thrown: the save itself already succeeded, and turning a
 * permission correction into a failed save would tell the caller its settings
 * were not written when they were.
 */
export function narrowCredentialFile(filePath: string): boolean {
  // Windows has no POSIX mode bits; the file is already governed by its ACL.
  if (process.platform === 'win32') return true;
  try {
    // `lstat`, not `stat`: a symlinked config must not chmod whatever it points
    // at. The link itself carries no mode worth setting, so it is left alone.
    const entry = fs.lstatSync(filePath);
    if (!entry.isFile()) return false;
    if ((entry.mode & 0o777) === CREDENTIAL_FILE_MODE) return true;
    fs.chmodSync(filePath, CREDENTIAL_FILE_MODE);
    return (fs.lstatSync(filePath).mode & 0o777) === CREDENTIAL_FILE_MODE;
  } catch { return false; }
}

/**
 * Whether the file can be read or written by anyone but its owner.
 *
 * Only the group and other bits are consulted; the owner's own read bit says
 * nothing about exposure. An unreadable mode is reported as not exposed rather
 * than as a problem: the load already has the content, and a mode it cannot
 * inspect is not evidence of one that leaks.
 */
export function readableByOthers(filePath: string): boolean {
  if (process.platform === 'win32') return false;
  try {
    const entry = fs.lstatSync(filePath);
    return entry.isFile() && (entry.mode & 0o077) !== 0;
  } catch { return false; }
}
