import path from 'node:path';
import fs from 'node:fs';
import { resolveUserDataFile } from '../core/paths/userHome.js';
import { readConfigSnapshot, type CapturedConfigSnapshot } from './document.js';
import { extractPreferences, joinPreferences, stripPreferences } from './preferences/documents.js';
import { PREFERENCE_FIELD } from './preferences/contract.js';
/**
 * The user's configuration, as two documents rather than one.
 *
 * `config.json` holds what the product does: theme, retry policy, tool
 * allowlists and request policies. `auth.json` holds who is being talked to and
 * as whom: the provider, its connections, their keys and account tokens. Model
 * defaults are kept in the settings document and joined at this boundary.
 *
 * They are separate files because they are different kinds of fact. A settings
 * file is something a user may paste into an issue or share between machines; a
 * credential file is not, and giving it its own name makes that visible in a
 * directory listing, in a backup, and in a permission check. It also means the
 * protection can be unconditional: the credential document is always written
 * owner-only, rather than being decided by inspecting the values that happen to
 * be in it.
 *
 * Readers and writers still see one logical document. This module is where the
 * two are joined and taken apart, so no caller has to know the split exists.
 */

/** The settings document, relative to the profile's data directory. */
export const SETTINGS_FILE = 'config.json';
/** The credential document, beside it. */
export const AUTH_FILE = 'auth.json';

/** Provider identity, connections and credentials share one protected owner. */
const AUTH_FIELDS: ReadonlySet<string> = new Set([
  'provider', 'providerCredentials', 'providerConnections', 'activeProviderConnectionId', 'accountPool',
]);

function isAuthField(key: string): boolean {
  return AUTH_FIELDS.has(key);
}

export function userSettingsPath(): string {
  return resolveUserDataFile(SETTINGS_FILE);
}

export function userAuthPath(): string {
  return resolveUserDataFile(AUTH_FILE);
}

export interface ConfigDocuments {
  readonly settings: CapturedConfigSnapshot | undefined;
  readonly auth: CapturedConfigSnapshot | undefined;
  /** Both documents merged into the one a caller edits. */
  readonly values: Record<string, unknown>;
}

/** Auth wins credential fields; an acquired settings preference owner wins its legacy auth copy. */
export function mergeConfigDocuments(settings: Record<string, unknown>, auth: Record<string, unknown>): Record<string, unknown> {
  return joinPreferences({ ...settings, ...auth,
    ...(Object.hasOwn(settings, PREFERENCE_FIELD) ? { [PREFERENCE_FIELD]: settings[PREFERENCE_FIELD] } : {}),
  });
}

/**
 * Read both documents and merge them into the logical one.
 *
 * `auth.json` is read second, so a field it holds wins over the same field in
 * `config.json`. That order matters during the migration window: a file written
 * before the split still carries its credentials in `config.json`, and a
 * credential the user has since re-entered in `auth.json` must not be shadowed
 * by the older copy.
 */
export function readConfigDocuments(settingsPath: string, authPath: string): ConfigDocuments {
  const settings = readConfigSnapshot(settingsPath);
  const auth = readConfigSnapshot(authPath);
  const values = mergeConfigDocuments(settings?.values ?? {}, auth?.values ?? {});
  return { settings, auth, values };
}

/**
 * Which physical document a top-level key belongs to.
 *
 * A key that `auth.json` already holds stays there even if it is not one of the
 * credential fields — that is what keeps a hand-edited or future field from
 * being moved to the other file behind the user's back. Everything else follows
 * the declared split.
 */
export function documentFor(key: string, auth: CapturedConfigSnapshot | undefined): 'settings' | 'auth' {
  if (key === PREFERENCE_FIELD) return 'settings';
  if (auth?.values && Object.hasOwn(auth.values, key)) return 'auth';
  return isAuthField(key) ? 'auth' : 'settings';
}

/** Only the primary user settings path denotes the logical document pair. */
export function configDocumentPaths(filePath: string): { settingsPath: string; authPath?: string } {
  const settingsPath = path.resolve(filePath);
  const primary = path.resolve(userSettingsPath());
  let matches = settingsPath === primary;
  if (!matches) {
    try { matches = fs.realpathSync(settingsPath) === fs.realpathSync(primary); } catch { /* Missing paths match only by name. */ }
  }
  return matches
    ? { settingsPath, authPath: path.resolve(userAuthPath()) } : { settingsPath };
}

/** Preserve existing auth-owned unknown fields and shadowed settings trivia. */
export function partitionConfigDocuments(value: Record<string, unknown>, documents: ConfigDocuments): {
  settings: Record<string, unknown>; auth: Record<string, unknown>;
} {
  const settings = { ...(documents.settings?.values ?? {}) };
  const auth: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(documents.values), ...Object.keys(value),
    ...(documents.auth?.values && Object.hasOwn(documents.auth.values, PREFERENCE_FIELD) ? [PREFERENCE_FIELD] : [])])) {
    if (documentFor(key, documents.auth) === 'auth') {
      if (Object.hasOwn(value, key)) auth[key] = value[key];
      if (isAuthField(key) || !Object.hasOwn(value, key)) delete settings[key];
    } else if (Object.hasOwn(value, key)) settings[key] = value[key];
    else delete settings[key];
  }
  const previous = extractPreferences(documents.values, documents.settings?.values[PREFERENCE_FIELD] ?? documents.auth?.values[PREFERENCE_FIELD]);
  const preferences = extractPreferences(value, previous);
  delete auth[PREFERENCE_FIELD];
  if (Object.keys(preferences).length) settings[PREFERENCE_FIELD] = preferences;
  else delete settings[PREFERENCE_FIELD];
  return { settings, auth: stripPreferences(auth) };
}
