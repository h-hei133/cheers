import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hashContent } from '../edit/authority/content.js';
import { withVerifiedReadTarget } from '../runtime/execution/read.js';
import { selectWorkspaceRoot } from '../core/workspace/roots.js';
import { resolveWorkspaceToolTarget } from '../core/tools/permissionContext.js';
import type { ToolExecutionContext } from '../tools/types.js';
import { LanguageError, languageLimits, type DocumentSnapshot, type Position } from './contract.js';

export function checkedPath(value: string, context: ToolExecutionContext, access: 'read' | 'write' = 'read'): { path: string; root: string } {
  const primary = context.artifactRoot ?? context.workspaceRoot;
  const target = path.resolve(primary, value);
  const root = selectWorkspaceRoot(primary, context.workspaceRoots ?? [], target, access);
  const canonical = resolveWorkspaceToolTarget({ path: target }, 'path', root);
  context.assertFileAccess?.(canonical);
  return { path: canonical, root };
}

export function uriPath(uri: unknown, context: ToolExecutionContext, access: 'read' | 'write' = 'read'): string {
  if (typeof uri !== 'string' || uri.length > 8192) throw new LanguageError('denied', 'Language server returned an invalid file URI.');
  let target: string;
  try {
    const url = new URL(uri);
    if (url.protocol !== 'file:' || url.host || url.search || url.hash) throw new Error();
    target = fileURLToPath(url);
  } catch { throw new LanguageError('denied', 'Language server returned an unsupported file URI.'); }
  try { return checkedPath(target, context, access).path; }
  catch { throw new LanguageError('denied', 'Language server returned a file outside the granted targets or denied by policy.'); }
}

/** Read at most the admitted bytes from the verified source descriptor. */
export async function snapshot(value: string, context: ToolExecutionContext, version = 1): Promise<DocumentSnapshot> {
  const target = checkedPath(value, context);
  const text = await withVerifiedReadTarget({ absolutePath: target.path, workspaceRoot: target.root,
    assertFileAccess: context.assertFileAccess, abortSignal: context.abortSignal }, 'file', async (handle, verify) => {
    const stats = await handle.stat();
    if (stats.size > languageLimits.documentBytes) throw new LanguageError('unsupported', 'Language document exceeds the byte limit.');
    const buffer = Buffer.alloc(languageLimits.documentBytes + 1);
    let size = 0;
    while (size < buffer.length) {
      context.abortSignal?.throwIfAborted();
      const result = await handle.read(buffer, size, buffer.length - size, size);
      if (!result.bytesRead) break;
      size += result.bytesRead;
    }
    if (size > languageLimits.documentBytes) throw new LanguageError('unsupported', 'Language document exceeds the byte limit.');
    await verify();
    const content = buffer.subarray(0, size).toString('utf8');
    if (content.includes('\0') || !Buffer.from(content).equals(buffer.subarray(0, size))) throw new LanguageError('unsupported', 'Language document must be valid UTF-8 text.');
    return content;
  });
  return Object.freeze({ path: target.path, uri: pathToFileURL(target.path).href, text, hash: hashContent(text), version });
}

export function endPosition(text: string): Position {
  const lines = text.split(/\r\n|\r|\n/);
  return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
}

export function offsetAt(text: string, point: Position): number {
  let start = 0;
  for (let line = 0; line < point.line; line++) {
    const match = /\r\n|\r|\n/.exec(text.slice(start));
    if (!match) throw new LanguageError('invalid', 'Language edit position is outside the document.');
    start += match.index + match[0].length;
  }
  const end = /\r\n|\r|\n/.exec(text.slice(start));
  const length = end ? end.index : text.length - start;
  if (point.character > length) throw new LanguageError('invalid', 'Language edit character is outside the document line.');
  const offset = start + point.character;
  if (offset > 0 && /[\uD800-\uDBFF]/.test(text[offset - 1]!) && /[\uDC00-\uDFFF]/.test(text[offset] ?? '')) {
    throw new LanguageError('invalid', 'Language edit splits a UTF-16 surrogate pair.');
  }
  return offset;
}

export function languageId(file: string): string {
  return ({ '.ts': 'typescript', '.tsx': 'typescriptreact', '.js': 'javascript', '.jsx': 'javascriptreact', '.py': 'python', '.go': 'go', '.rs': 'rust', '.json': 'json' } as Record<string, string>)[path.extname(file)] ?? 'plaintext';
}
