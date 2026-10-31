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
