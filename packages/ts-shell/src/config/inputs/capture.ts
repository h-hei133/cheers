import fs from 'node:fs';
import { configSnapshotMatches, readConfigSnapshot, type CapturedConfigSnapshot } from '../document.js';
import { ConfigDocumentError } from '../syntax.js';
import { CONFIG_INPUT_MAX_BYTES, ConfigInputError, type ConfigInputFile, type ConfigInputs } from './model.js';
import { assertConfigInputs } from './selection.js';

export interface ConfigFileCapture {
  readonly path: string;
  readonly source: 'project' | 'user';
  readonly canonical?: string;
  readonly input?: ConfigInputFile;
  readonly snapshot?: CapturedConfigSnapshot;
  readonly error?: ConfigDocumentError;
}

export function captureConfigFiles(paths: readonly { path: string; source: 'project' | 'user' }[], inputs?: ConfigInputs): ConfigFileCapture[] {
  if (inputs) assertConfigInputs(inputs);
  let bytes = 0;
  const candidates: Pick<ConfigFileCapture, 'path' | 'source' | 'input'>[] = [...paths,
    ...(inputs?.files ?? []).map(input => ({ path: input.path, source: input.source, input }))];
  const captured = candidates.map(candidate => {
    const { input } = candidate;
    try {
      const snapshot = readConfigSnapshot(candidate.path);
      if (input && !snapshot) throw new ConfigInputError('missing-or-unreadable', candidate.path);
      bytes += snapshot?.bytes ?? 0;
      if (inputs && bytes > CONFIG_INPUT_MAX_BYTES) throw new ConfigInputError('resource-limit', candidate.path);
      const canonical = snapshot ? fs.realpathSync(candidate.path) : undefined;
      return { ...candidate, input, snapshot, canonical };
    } catch (error) {
      if (error instanceof ConfigInputError) throw error;
      const controlled = error instanceof ConfigDocumentError ? error : new ConfigDocumentError('unreadable');
      if (input) throw new ConfigInputError(controlled.message, candidate.path);
      return { ...candidate, error: controlled };
    }
  });
  verifyConfigFiles(captured, inputs);
  return captured;
}

/** Acquisition is one candidate: a later read cannot leave an earlier source unverified. */
export function verifyConfigFiles(captured: readonly ConfigFileCapture[], inputs?: ConfigInputs): void {
  if (inputs) assertConfigInputs(inputs);
  for (const file of captured) {
    if (file.error) continue; // Invalid optional base documents already prevent publication.
    try {
      if (!configSnapshotMatches(file.path, file.snapshot) || file.canonical && fs.realpathSync(file.path) !== file.canonical) throw new Error();
    } catch {
      throw new ConfigInputError('content-changed', file.path);
    }
  }
}

/** Refresh/persistence has one owner: the selected profile's primary user document. */
export function assertAccountOwner(file: ConfigFileCapture, primary: readonly string[]): void {
  if (!file.input || file.source !== 'user' || !file.snapshot) return;
  const raw = file.snapshot.values;
  const records = [...(Array.isArray(raw.providerConnections) ? raw.providerConnections : []),
    ...Object.values(raw.providerCredentials && typeof raw.providerCredentials === 'object' ? raw.providerCredentials : {})];
  const rotating = records.some(record => record && typeof record === 'object' && Object.keys((record as { accountAuth?: object }).accountAuth ?? {}).length > 0);
  if (!rotating) return;
  const owners = primary.flatMap(filePath => {
    try { return [fs.realpathSync(filePath)]; } catch { return []; }
  });
  if (!file.canonical || !owners.includes(file.canonical)) throw new ConfigInputError('account-owner', file.path);
}
