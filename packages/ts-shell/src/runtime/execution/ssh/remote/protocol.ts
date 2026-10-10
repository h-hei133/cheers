import { requireSsh } from '../model.js';

export function encoded(value: string): string { return Buffer.from(value).toString('base64'); }
export function assignment(name: string, value: string): string {
  requireSsh(/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)); return `${name}=$(printf '%s' '${encoded(value)}' | /usr/bin/base64 --decode)`;
}
export function parseRemoteFrame(bytes: Buffer, fields: readonly string[]): Readonly<Record<string, string>> {
  requireSsh(bytes.length > 0 && bytes.length <= 256 * 1024, 'protocol');
  const text = bytes.toString('utf8'); requireSsh(Buffer.from(text).equals(bytes) && text.endsWith('\n'), 'protocol');
  const lines = text.slice(0, -1).split('\n'); requireSsh(lines.shift() === 'CHEERS_SSH_1' && lines.length === fields.length, 'protocol');
  const result: Record<string, string> = {};
  for (const [index, field] of fields.entries()) {
    const prefix = field + '='; requireSsh(lines[index]!.startsWith(prefix), 'protocol'); result[field] = lines[index]!.slice(prefix.length);
  }
  return Object.freeze(result);
}
export function decoded(value: string, maxBytes: number): Buffer {
  requireSsh(value.length <= Math.ceil(maxBytes / 3) * 4 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value), 'protocol');
  const bytes = Buffer.from(value, 'base64'); requireSsh(bytes.length <= maxBytes && bytes.toString('base64') === value, 'protocol'); return bytes;
}
