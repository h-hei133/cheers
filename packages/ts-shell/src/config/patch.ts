import { applyEdits, createScanner, findNodeAtLocation, modify, parseTree, SyntaxKind, type Edit, type JSONPath } from 'jsonc-parser';
import { isAlias, isScalar, parseDocument } from 'yaml';
import { type ConfigSnapshot, serializeConfigDocument } from './document.js';
import { CONFIG_MAX_BYTES, ConfigDocumentError, configParserText, parseConfigFileText, parseConfigText } from './syntax.js';
import { isRecord as record } from '../core/values/record.js';
import { sameValue, sameArraySlots } from './values.js';

const MAX_EDITS = 128;
const MAX_EDIT_BYTES = 8 * 1024 * 1024;
interface Change { path: JSONPath; value: unknown }

/** Object removal is explicit; moving identities replaces the whole array. */
function changes(before: unknown, after: unknown, path: JSONPath, result: Change[]): void {
  if (sameValue(before, after)) return;
  if (record(before) && record(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) changes(before[key], after[key], [...path, key], result);
    return;
  }
  if (Array.isArray(before) && Array.isArray(after) && sameArraySlots(before, after)) {
    for (let index = 0; index < after.length; index++) changes(before[index], after[index], [...path, index], result);
    return;
  }
  if (result.length === MAX_EDITS) throw new ConfigDocumentError('resource-limit');
  result.push({ path, value: after });
}

function commaAfter(text: string, offset: number, end: number): Edit | undefined {
  const scanner = createScanner(text, true);
  scanner.setPosition(offset);
  if (scanner.scan() !== SyntaxKind.CommaToken || scanner.getTokenOffset() >= end) return undefined;
  return { offset: scanner.getTokenOffset(), length: 1, content: '' };
}

/** Remove only the property and its separator; retain surrounding comment trivia. */
function deletionEdits(text: string, path: JSONPath): Edit[] {
  const root = parseTree(configParserText(text), [], { allowTrailingComma: true });
  const property = root && findNodeAtLocation(root, path)?.parent;
  const parent = property?.parent;
  if (!property || property.type !== 'property' || parent?.type !== 'object') throw new ConfigDocumentError('edit-mismatch');
  const end = property.offset + property.length;
  const edits: Edit[] = [{ offset: property.offset, length: property.length, content: '' }];
  const index = parent.children!.indexOf(property);
  const previous = parent.children![index - 1];
  const comma = commaAfter(text, end, parent.offset + parent.length)
    ?? (previous ? commaAfter(text, previous.offset + previous.length, property.offset) : undefined);
  if (comma) edits.push(comma);
  else if (parent.children!.length > 1) throw new ConfigDocumentError('edit-mismatch');
  return edits;
}

/** Preserve bytes outside intentional edit spans, then prove the resulting value. */
export function patchConfigDocument(snapshot: ConfigSnapshot | undefined, value: Record<string, unknown>, format: 'jsonc' | 'yaml' = 'jsonc'): string {
  if (!snapshot) return serializeConfigDocument(value, format);
  // Canonicalize JSON's absent-property semantics without expanding references.
  const expected: Record<string, unknown> = JSON.parse(JSON.stringify(value));
  const edits: Change[] = [];
  changes(snapshot.values, expected, [], edits);
  if ((snapshot.format ?? format) === 'yaml') return patchYamlDocument(snapshot, expected, edits);
  let text = snapshot.text;
  let bytes = 0;
  for (const change of edits) {
    bytes += Buffer.byteLength(text);
    if (bytes > MAX_EDIT_BYTES) throw new ConfigDocumentError('resource-limit');
    try {
      // Omitting formattingOptions keeps replacement ranges local. Parsing uses
      // a same-width BOM placeholder; edits apply to the original bytes/text.
      text = applyEdits(text, change.value === undefined
        ? deletionEdits(text, change.path)
        : modify(configParserText(text), change.path, change.value, {}));
    } catch {
      throw new ConfigDocumentError('edit-mismatch');
    }
    if (Buffer.byteLength(text) > CONFIG_MAX_BYTES) throw new ConfigDocumentError('resource-limit');
  }
  if (!sameValue(parseConfigText(text), expected)) throw new ConfigDocumentError('edit-mismatch');
  return text;
}

function patchYamlDocument(snapshot: ConfigSnapshot, expected: Record<string, unknown>, edits: readonly Change[]): string {
  if (edits.length === 0) return snapshot.text;
  const bom = snapshot.text.startsWith('\uFEFF') ? '\uFEFF' : '';
  let document;
  try {
    document = parseDocument(snapshot.text.slice(bom.length), {
      version: '1.2', schema: 'core', resolveKnownTags: false, merge: false,
      stringKeys: true, uniqueKeys: true,
    });
  } catch { throw new ConfigDocumentError('edit-mismatch'); }
  if (document.errors.length || document.warnings.length || !document.contents) throw new ConfigDocumentError('edit-mismatch');
  const scalarEdits: Edit[] = [];
  for (const edit of edits) {
    if (edit.value === undefined || edit.value !== null && typeof edit.value === 'object') break;
    const node = document.getIn(edit.path, true);
    if ((!isScalar(node) && !isAlias(node)) || !node.range || isScalar(node) && (node.anchor || node.tag)) break;
    const offset = node.range[0] + bom.length;
    const end = node.range[1] + bom.length;
    if (/\r|\n/.test(snapshot.text.slice(offset, end))) break;
    const content = typeof edit.value === 'string' ? JSON.stringify(edit.value) : String(edit.value);
    scalarEdits.push({ offset, length: end - offset, content });
  }
  if (scalarEdits.length === edits.length) {
    let text = snapshot.text;
    for (const edit of scalarEdits.sort((left, right) => right.offset - left.offset)) {
      text = text.slice(0, edit.offset) + edit.content + text.slice(edit.offset + edit.length);
    }
    if (Buffer.byteLength(text) > CONFIG_MAX_BYTES || !sameValue(parseConfigFileText('config.yaml', text), expected)) {
      throw new ConfigDocumentError('edit-mismatch');
    }
    return text;
  }
  let bytes = Buffer.byteLength(snapshot.text);
  for (const edit of edits) {
    bytes += Buffer.byteLength(snapshot.text);
    if (bytes > MAX_EDIT_BYTES) throw new ConfigDocumentError('resource-limit');
    try {
      if (edit.value === undefined) document.deleteIn(edit.path);
      else document.setIn(edit.path, edit.value);
    } catch { throw new ConfigDocumentError('edit-mismatch'); }
  }
  const text = `${bom}${document.toString({ lineWidth: 0 })}`;
  if (Buffer.byteLength(text) > CONFIG_MAX_BYTES
    || !sameValue(parseConfigFileText('config.yaml', text), expected)) throw new ConfigDocumentError('edit-mismatch');
  return text;
}
