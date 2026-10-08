import { hashContent } from '../edit/authority/content.js';
import { applyHunks } from '../edit/patch/apply.js';
import { patchLimits } from '../edit/patch/parse.js';
import { parsePatch } from '../edit/patch/parse.js';
import type { ToolExecutionContext } from '../tools/types.js';
import { LanguageError, object, type DocumentSnapshot } from './contract.js';
import { offsetAt, snapshot, uriPath } from './documents.js';
import { range } from './projection.js';

interface EditGroup { readonly path: string; readonly edits: readonly unknown[]; readonly version?: number | null }

function editGroups(value: unknown, context: ToolExecutionContext): EditGroup[] {
  const edit = object(value);
  if (edit.changeAnnotations !== undefined) throw new LanguageError('unsupported', 'Annotated language edits are unsupported.');
  if (edit.changes !== undefined && edit.documentChanges !== undefined) throw new LanguageError('unsupported', 'Language edit must use one change representation.');
  let groups: EditGroup[];
  if (edit.documentChanges !== undefined) {
    if (!Array.isArray(edit.documentChanges)) throw new LanguageError('protocol', 'Language document changes are invalid.');
    groups = edit.documentChanges.map(value => {
      const change = object(value);
      if (change.kind !== undefined) throw new LanguageError('unsupported', 'Language resource operations require a separate explicit file patch.');
      const document = object(change.textDocument);
      if (document.version !== null && !Number.isSafeInteger(document.version)) throw new LanguageError('protocol', 'Language edit document version is invalid.');
      return { path: uriPath(document.uri, context, 'write'), edits: change.edits as unknown[], version: document.version as number | null };
    });
  } else {
    groups = Object.entries(object(edit.changes ?? {})).map(([uri, edits]) => ({ path: uriPath(uri, context, 'write'), edits: edits as unknown[] }));
  }
  if (groups.length > patchLimits.files || new Set(groups.map(group => group.path)).size !== groups.length
    || groups.some(group => !Array.isArray(group.edits) || group.edits.length > 1000)) throw new LanguageError('unsupported', 'Language edit targets are duplicated or exceed the batch limit.');
  return groups;
}

function changedText(text: string, edits: readonly unknown[]): string {
  const spans = edits.map(value => {
    const edit = object(value);
    if (typeof edit.newText !== 'string' || edit.annotationId !== undefined) throw new LanguageError('unsupported', 'Language edit is not a supported plain text edit.');
    const span = range(edit.range);
    return { start: offsetAt(text, span.start), end: offsetAt(text, span.end), text: edit.newText };
  }).sort((a, b) => a.start - b.start || a.end - b.end);
  let cursor = 0; let output = '';
  for (let index = 0; index < spans.length; index++) {
    const edit = spans[index]!;
    if (edit.start < cursor || index > 0 && edit.start === spans[index - 1]!.start) throw new LanguageError('invalid', 'Language edits overlap or have ambiguous insertion order.');
    output += text.slice(cursor, edit.start) + edit.text; cursor = edit.end;
  }
  output += text.slice(cursor);
  if (Buffer.byteLength(output) > patchLimits.fileBytes || output.includes('\0')) throw new LanguageError('unsupported', 'Language edit output exceeds the text limit.');
  return output;
}

function fullPatch(file: string, before: string, after: string): string {
  if (/[\x00-\x1f\x7f-\x9f]/.test(file) || file.trim() !== file) throw new LanguageError('unsupported', 'Language edit path cannot be represented by apply_patch.');
  const lines = (text: string) => {
    const body = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    return body.endsWith('\n') ? body.slice(0, -1).split('\n') : body ? body.split('\n') : [];
  };
  const patch = ['*** Begin Patch', `*** Update File: ${file}`, '@@', ...lines(before).map(line => '-' + line), ...lines(after).map(line => '+' + line), '*** End of File', '*** End Patch'].join('\n');
  const operation = parsePatch(patch)[0]!;
  if (operation.kind !== 'update' || applyHunks(before, operation.hunks) !== after) throw new LanguageError('unsupported', 'Language edit changes a text shape that apply_patch cannot preserve exactly.');
  return patch.split('\n').slice(1, -1).join('\n');
}

/** Server edits are data. This produces a bounded proposal; the existing patch tool owns all writes. */
export async function renamePlan(value: unknown, open: ReadonlyMap<string, DocumentSnapshot>, context: ToolExecutionContext) {
  const files = [];
  for (const group of editGroups(value, context)) {
    const source = await snapshot(group.path, context);
    const known = open.get(source.uri);
    if (group.version !== undefined && group.version !== null && (!known || known.version !== group.version)) throw new LanguageError('stale', 'Language rename has a stale or unverifiable document version.');
    if (known && known.hash !== source.hash) throw new LanguageError('stale', 'Language rename source changed while the server was computing edits.');
    const text = changedText(source.text, group.edits);
    if (text !== source.text) files.push(Object.freeze({ source, text, versionVerified: group.version !== undefined && group.version !== null }));
  }
  const input = ['*** Begin Patch', ...files.map(file => fullPatch(file.source.path, file.source.text, file.text)), '*** End Patch'].join('\n');
  if (Buffer.byteLength(input) > patchLimits.inputBytes) throw new LanguageError('unsupported', 'Language rename patch exceeds the batch input limit.');
  const targets = Object.freeze(files.map(file => Object.freeze({ path: file.source.path, sourceHash: file.source.hash,
    documentVersion: open.get(file.source.uri)?.version ?? null, serverVersionVerified: file.versionVerified, proposedHash: hashContent(file.text) })));
  return Object.freeze({ status: 'proposed', willWrite: false, currency: targets.every(file => file.serverVersionVerified) ? 'server-versions-verified' : 'unversioned-edits-current-source-snapshots',
    targets, ...(files.length ? { applyPatch: Object.freeze({ input, expectedHashes: Object.freeze(Object.fromEntries(files.map(file => [file.source.path, file.source.hash]))) }) } : {}),
    revision: hashContent(JSON.stringify({ input, targets })) });
}
