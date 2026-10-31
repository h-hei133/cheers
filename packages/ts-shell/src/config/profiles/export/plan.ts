import path from 'node:path';
import { createHash } from 'node:crypto';
import { assertCurrentProfile, assertProfileIdentity, type ProfileContext } from '../../../core/paths/profile/context.js';
import { assertUnlinkedPath } from '../../../core/paths/profile/identity.js';
import { configEditDocuments, configEditStorage } from '../../persistence.js';
import { getUserRuntimeConfigPath, readRuntimeConfigEditAt, CONFIG_FIELDS } from '../../runtimeConfig.js';
import { captureConfigFiles, verifyConfigFiles, type ConfigFileCapture } from '../../inputs/capture.js';
import { mergeConfigDocuments } from '../../documents.js';
import { mergeConfigValue } from '../../merge.js';
import { serializeConfigDocument } from '../../document.js';
import { validateRawConfig } from '../../layers.js';
import type { PathRule } from '../../scope/contract.js';
import { SCOPE_FIELDS } from '../../scope/registry.js';
import { openProfile } from '../context.js';
import fs from 'node:fs';

/** Public previews contain no document values or credential material. */
export interface ExportPlan {
  readonly digest: string;
  readonly source: string;
  readonly target: string;
  readonly bytes: number;
}
interface ExportCapture {
  readonly source: ProfileContext;
  readonly target: ProfileContext;
  readonly files: readonly ConfigFileCapture[];
  readonly content: string;
  readonly check: () => void;
}
const captures = new WeakMap<ExportPlan, ExportCapture>();

/** An export can only populate a separately created, empty named profile. */
export function assertExportTarget(target: ProfileContext, lock?: string): void {
  assertProfileIdentity(target); assertUnlinkedPath(target.root);
  if (target.id === 'default' || fs.readdirSync(target.root).some(name => name !== lock)) throw new Error('Export requires an empty named profile.');
}

/** Restore old embedded defaults, retaining cumulative settings and their physical path anchors. */
function legacyValues(files: readonly ConfigFileCapture[]): Record<string, unknown> {
  const settings = files[0]?.snapshot?.values ?? {};
  const auth = files[1]?.snapshot?.values ?? {};
  // One old document cannot express an earlier rule followed by a later base
  // or independently sorted rule group. Refuse rather than retarget a policy.
  if ((settings.pathRules as readonly PathRule[] | undefined)?.length
    && ((auth.pathRules as readonly PathRule[] | undefined)?.length || Object.keys(auth).some(key => Object.hasOwn(SCOPE_FIELDS, key)))) {
    throw new Error('Export cannot preserve layered path scope precedence.');
  }
  const values = mergeConfigDocuments(settings, auth);
  for (const [key, field] of Object.entries(CONFIG_FIELDS)) {
    if (!Object.hasOwn(settings, key) || !Object.hasOwn(auth, key)) continue;
    if (field.merge === 'tui') values[key] = { ...(settings[key] as object), ...(auth[key] as object) };
    else if (field.merge !== 'replace') values[key] = mergeConfigValue(settings[key], auth[key], field.merge);
  }
  const rules = files.flatMap(file => ((file.snapshot?.values.pathRules ?? []) as readonly PathRule[])
    .map(rule => ({ ...rule, path: path.resolve(path.dirname(file.canonical!), rule.path) })));
  if (rules.length) values.pathRules = rules;
  return values;
}

export function planExport(source: ProfileContext, name: string): ExportPlan {
  assertCurrentProfile(source);
  const target = openProfile(name, source.homeDir);
  if (source.root === target.root) throw new Error('Export requires a different profile.');
  assertExportTarget(target);
  const baseline = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const documents = configEditDocuments(baseline);
  const files = captureConfigFiles(documents.map(file => ({ path: file.source, source: 'user' as const })));
  if (files.some((file, index) => file.error || (file.snapshot?.revision ?? null) !== documents[index]!.revision)
    || files[0]?.canonical && files[0].canonical === files[1]?.canonical) throw new Error('Export source could not be captured.');
  const values = legacyValues(files);
  validateRawConfig(values, CONFIG_FIELDS);
  const content = serializeConfigDocument(values);
  const check = () => {
    assertCurrentProfile(source); assertProfileIdentity(target);
    configEditStorage(baseline); verifyConfigFiles(files);
  };
  check(); assertExportTarget(target);
  const digest = createHash('sha256').update(JSON.stringify({ version: 1, source, target,
    documents: files.map(file => ({ path: file.path, canonical: file.canonical, revision: file.snapshot?.revision,
      fingerprint: file.snapshot?.fingerprint })), content })).digest('hex');
  const plan = Object.freeze({ digest, source: source.id, target: target.id, bytes: Buffer.byteLength(content) });
  captures.set(plan, { source, target, files, content, check });
  return plan;
}

/** Only an authentic in-process plan can authorize its private captured payload. */
export function exportCapture(plan: ExportPlan): ExportCapture {
  const captured = captures.get(plan);
  if (!captured) throw new Error('Export requires an acquired preview.');
  return captured;
}
