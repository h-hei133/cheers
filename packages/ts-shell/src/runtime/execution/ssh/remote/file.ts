import { createHash } from 'node:crypto';
import { utf8PageEnd } from '../../../../core/text/utf8.js';
import { requireSsh, type SshWorkspace } from '../model.js';
import { assignment, decoded } from './protocol.js';
import { boundWorkspace } from './workspace.js';

export const fileLimit = 64 * 1024;
const pageLimit = 16 * 1024;
export const statFields = ['path', 'state', 'size'] as const;
export const fileFields = [...statFields, 'content'] as const;

export function validateRemotePath(relative: string): void {
  requireSsh(relative.trim().length > 0 && Buffer.byteLength(relative) <= 4096 && !/[\u0000-\u001f\u007f]/u.test(relative)
    && relative.split('/').every(part => part && part !== '..' && part !== '.' && !part.startsWith('.cheers-jobs-')));
}

export function validateFileCursor(offset: number, version?: string): void {
  requireSsh(Number.isSafeInteger(offset) && offset >= 0 && offset <= fileLimit
    && (version === undefined ? offset === 0 : /^[0-9a-f]{64}$/u.test(version)));
}

export function remoteFile(binding: SshWorkspace, relative: string, read: boolean): string {
  validateRemotePath(relative);
  const lines = [boundWorkspace(binding), assignment('relative', relative),
    'target="${PWD%/}/$relative"',
    // The sentinel preserves trailing newlines in the canonical path.
    'test "$(realpath -e -- "$target" && printf .)" = "$target"$\'\\n.\'',
    'test -f "$target"',
    'test ! -L "$target"',
    'state=$(stat -Lc "%d:%i:%s:%y:%z:%f" -- "$target")',
    'size=$(stat -Lc "%s" -- "$target")'];
  if (read) lines.push(
    `test "$size" -le ${fileLimit}`,
    'exec 3<"$target"',
    'descriptor=/proc/$$/fd/3',
    'test "$(readlink -n -- "$descriptor" && printf .)" = "$target."',
    'test -f "$descriptor"',
    'test "$(stat -Lc "%d:%i:%s:%y:%z:%f" -- "$descriptor")" = "$state"',
    'content=$(head -c "$((size + 1))" <&3 | base64 -w0)',
    'test "$(stat -Lc "%d:%i:%s:%y:%z:%f" -- "$descriptor")" = "$state"',
  );
  lines.push('test "$(realpath -e -- "$target" && printf .)" = "$target"$\'\\n.\'',
    'test ! -L "$target"',
    'test "$(stat -Lc "%d:%i:%s:%y:%z:%f" -- "$target")" = "$state"',
    'test "$(stat -Lc "%d:%i" -- "$selected_root")" = "$expected_identity"',
    'encoded_path=$(printf "%s" "$relative" | base64 -w0)',
    'encoded_state=$(printf "%s" "$state" | base64 -w0)',
    'printf "CHEERS_SSH_1\\npath=%s\\nstate=%s\\nsize=%s\\n" "$encoded_path" "$encoded_state" "$size"');
  if (read) lines.push('printf "content=%s\\n" "$content"');
  const script = lines.join('\n');
  if (!read) return script + '\n';
  // A racing replacement with a FIFO must not leave a remote open blocked.
  return "timeout --kill-after=1s 8s /usr/bin/bash --noprofile --norc -s <<'CHEERS_SSH_FILE'\n" + script + '\nCHEERS_SSH_FILE\n';
}

export function remoteFileInfo(value: Readonly<Record<string, string>>, relative: string) {
  const size = Number(value.size);
  requireSsh(String(size) === value.size && Number.isSafeInteger(size) && size >= 0
    && decoded(value.path!, 4096).equals(Buffer.from(relative)), 'protocol');
  const state = decoded(value.state!, 512).toString('ascii');
  requireSsh(new RegExp(`^[0-9]+:[0-9]+:${size}:[ 0-9.:+\\-]+:[ 0-9.:+\\-]+:[0-9a-f]+$`, 'u').test(state), 'protocol');
  return { size, state };
}

export function remoteFilePage(value: Readonly<Record<string, string>>, generation: string, binding: SshWorkspace, relative: string,
  offset: number, expected?: string) {
  const { state, size } = remoteFileInfo(value, relative);
  const context = decoded(value.content!, fileLimit);
  requireSsh(context.length === size && offset <= size && Buffer.from(context.toString('utf8')).equals(context)
    && !context.includes(0), 'protocol');
  const version = createHash('sha256').update(JSON.stringify([generation, binding.profileIdentity, binding.namespace, relative, state]))
    .update(context).digest('hex');
  requireSsh(expected === undefined || expected === version, 'changed');
  requireSsh(offset === size || (context[offset]! & 0xc0) !== 0x80, 'invalid');
  const nextOffset = utf8PageEnd(context, offset, pageLimit, false);
  return { bytes: context.subarray(offset, nextOffset), context, size, nextOffset, version };
}
