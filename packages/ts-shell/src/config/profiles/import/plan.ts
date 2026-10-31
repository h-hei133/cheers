import fs from 'node:fs';
import path from 'node:path';
import { hashContent } from '../../../core/workspace/files.js';
import { assertUnlinkedPath, directoryIdentity, isWithin } from '../../../core/paths/profile/identity.js';
import { redactExportText } from '../../../core/security/redaction.js';
import { collectHistory } from '../../../session/history/source.js';
import { openProfile } from '../context.js';
import { IMPORT_CATEGORIES, IMPORT_LIMITS, type ImportCategory, type ImportFile, type ImportPlan, type ImportRequest } from './model.js';
import { captureSources, type SourceCapture } from './source.js';
import { importConfig } from './config.js';
import { documentFor } from '../../documents.js';
import { parseConfigText } from '../../syntax.js';
import { serializeConfigDocument } from '../../document.js';
import { importCatalog } from './catalog.js';
import { validateSessionId } from '../../../session/store/sessionFileLayout.js';

export function importRequest(input: { readonly source: string; readonly target: string; readonly homeDir: string; readonly workspace: string; readonly categories?: readonly ImportCategory[]; readonly excludedSessionId?: string }): ImportRequest {
  assertUnlinkedPath(input.workspace);
  const workspace = directoryIdentity(fs.realpathSync(input.workspace));
  const source = openProfile(input.source, input.homeDir); const target = openProfile(input.target, input.homeDir);
  if (source.root === target.root) throw new Error('Import source and target must be different profiles.');
  const categories = [...new Set(input.categories?.length ? input.categories : IMPORT_CATEGORIES)].sort();
  if (categories.some(category => !IMPORT_CATEGORIES.includes(category))) throw new Error('Unsupported profile import selection.');
  return { source, target, workspace, categories, ...(input.excludedSessionId ? { excludedSessionId: validateSessionId(input.excludedSessionId) } : {}) };
}

/** Deterministic, read-only planning: no journal, lock, stage or consumer writes. */
export function planImport(request: ImportRequest): ImportPlan {
  if (request.source.root === request.target.root) throw new Error('Import source and target must be different profiles.');
  const capture = captureSources(request);
  const files: ImportFile[] = [];
  if (request.categories.includes('config')) {
    const file = capture.first('config.json');
    const auth = capture.first('auth.json');
    if (file || auth) {
      const sanitized = parseConfigText(importConfig(file?.content ?? '{}', file?.path ?? auth!.path, auth));
      const settings: Record<string, unknown> = {}; const credentials: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(sanitized)) {
        (documentFor(key, undefined) === 'auth' ? credentials : settings)[key] = value;
      }
      if (file || Object.keys(settings).length) files.push({ relative: 'config.json', content: serializeConfigDocument(settings) + '\n', metadata: false });
      if (Object.keys(credentials).length) files.push({ relative: 'auth.json', content: serializeConfigDocument(credentials) + '\n', metadata: false });
    }
  }
  if (request.categories.includes('catalog')) {
    const file = capture.first('models.json');
    if (file !== undefined) files.push({ relative: 'models.json', content: importCatalog(file.content), metadata: false });
  }
  if (request.categories.includes('definitions')) files.push(...definitionFiles(capture));
  if (request.categories.includes('history')) files.push(...collectHistory({ source: request.source, target: request.target, workspace: request.workspace.path,
    read: capture.read, entries: capture.entries, excludedSessionId: request.excludedSessionId }));
  files.sort((a, b) => Number(a.metadata) - Number(b.metadata) || a.relative.localeCompare(b.relative, 'en'));
  let bytes = 0; const names = new Set<string>();
  for (const file of files) {
    const size = Buffer.byteLength(file.content); bytes += size;
    if (size > IMPORT_LIMITS.fileBytes || bytes > IMPORT_LIMITS.bytes || files.length > IMPORT_LIMITS.files) throw new Error('Profile import exceeds its file or byte limit.');
    if (names.has(file.relative) || !isWithin(request.target.root, path.resolve(request.target.root, file.relative))) throw new Error('Profile import has conflicting file identities.');
    names.add(file.relative);
  }
  for (const source of [...capture.sources]) capture.read(source.path);
  capture.check();
  const sources = [...capture.sources].sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const digest = hashContent(JSON.stringify({ version: 1, request, roots: capture.roots, sources, files: files.map(file => ({ relative: file.relative, hash: hashContent(file.content), metadata: file.metadata })) }));
  return { version: 1, digest, request, sources, files, bytes };
}

function definitionFiles(capture: SourceCapture): ImportFile[] {
  const found = new Map<string, ImportFile>(); let visited = 0;
  const walk = (root: string, relative: string, depth: number) => {
    for (const name of capture.entries(path.join(root, relative), depth)) {
      if (++visited > IMPORT_LIMITS.files) throw new Error('Profile definitions exceed the entry limit.');
      const next = path.join(relative, name); const absolute = path.join(root, next);
      assertUnlinkedPath(absolute);
      const stat = fs.lstatSync(absolute);
      if (stat.isDirectory()) walk(root, next, depth + 1);
      else if (/\.md$/i.test(name) && !found.has(next)) {
        const text = capture.read(absolute);
        if (text !== undefined) found.set(next, { relative: next, content: redactExportText(text), metadata: false });
      }
    }
  };
  for (const root of capture.roots) {
    if (!found.has('AGENTS.md')) {
      const text = capture.read(path.join(root.path, 'AGENTS.md'));
      if (text !== undefined) found.set('AGENTS.md', { relative: 'AGENTS.md', content: redactExportText(text), metadata: false });
    }
    for (const relative of ['skills', 'prompts', 'agents']) walk(root.path, relative, 0);
  }
  return [...found.values()];
}
