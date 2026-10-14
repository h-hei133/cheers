import { requireSsh, type SshJobSpec } from '../model.js';
import { unitName } from './start.js';
import { boundWorkspace, privateDirectory } from './workspace.js';
import { assignment } from './protocol.js';
import { validateJobSpec } from '../validation.js';
import { nativeObservation } from './observe.js';
import { readInvocation } from './record.js';

export const observationFields = ['id', 'digest', 'invocation', 'active', 'sub', 'result', 'code', 'termination', 'output', 'cleanup', 'cancel'] as const;

export function existingJob(job: SshJobSpec): string {
  validateJobSpec(job);
  return `${boundWorkspace(job.binding)}
${privateDirectory('journal')}
${assignment('job_id', job.id)}
job="$journal/$job_id"
${privateDirectory('job')}
test -f "$job/digest" && test ! -L "$job/digest" && test "$(stat -c '%s' -- "$job/digest")" = 65
test "$(cat -- "$job/digest")" = '${job.digest}'
cmp -s -- "$job/digest" <(printf '%s\n' '${job.digest}')
`;
}
export function queryRemoteJob(job: SshJobSpec, expectedInvocation?: string): string {
  requireSsh(expectedInvocation === undefined || /^[0-9a-f]{32}$/.test(expectedInvocation));
  return `${existingJob(job)}
invocation=unknown
if test -e "$job/invocation" || test -L "$job/invocation"; then ${readInvocation('$job/invocation', 'invocation')}fi
if test "$invocation" = unknown; then
 observed=$(systemctl --user show '${unitName(job)}' --property InvocationID --value 2>/dev/null || true)
 if test "\${#observed}" = 32; then invocation=$observed; printf '%s\n' "$invocation" > "$job/invocation.tmp"; mv -- "$job/invocation.tmp" "$job/invocation"; fi
fi
${expectedInvocation ? `test "$invocation" = '${expectedInvocation}'` : ''}
${nativeObservation(job, unitName(job))}
cancel=none
if test -e "$job/cancelled" || test -L "$job/cancelled"; then
 ${readInvocation('$job/cancelled', 'cancelled')}
 test "$cancelled" = "$invocation"
 cancel=selected-cgroup-empty; output=interrupted; cleanup=selected-cgroup-empty
fi
printf 'CHEERS_SSH_1\nid=${job.id}\ndigest=${job.digest}\ninvocation=%s\nactive=%s\nsub=%s\nresult=%s\ncode=%s\ntermination=%s\noutput=%s\ncleanup=%s\ncancel=%s\n' "$invocation" "$active" "$sub" "$result" "$code" "$termination" "$output" "$cleanup" "$cancel"
`;
}
export function readRemoteOutput(job: SshJobSpec, stream: 'stdout' | 'stderr', offset: number): string {
  requireSsh(Number.isSafeInteger(offset) && offset >= 0 && offset <= 65536);
  return `${existingJob(job)}
file="$job/${stream}"
test -f "$file" && test ! -L "$file"
exec 3<"$file"
test "$(stat -Lc '%F' /proc/$$/fd/3)" = 'regular file'
size=$(stat -Lc '%s' /proc/$$/fd/3)
test "$size" -le 65536
test ${offset} -le "$size"
available=$(( size - ${offset} ))
if test "$available" -gt 16384; then available=16384; fi
context=$(head -c "$size" <&3 | base64 -w0)
dropped=unknown
if test -f "$job/${stream}.done" && test ! -L "$job/${stream}.done" && cmp -s -- "$job/${stream}.done" <(printf 'complete\n') \\
 && test -f "$job/${stream}.dropped" && test ! -L "$job/${stream}.dropped" && test "$(stat -c '%s' -- "$job/${stream}.dropped")" -le 32 \\
 && test "$(stat -Lc '%s' /proc/$$/fd/3)" = "$size"; then
 dropped=$(cat -- "$job/${stream}.dropped")
 [[ "$dropped" =~ ^[0-9]{1,20}$ ]]
 cmp -s -- "$job/${stream}.dropped" <(printf '%s\n' "$dropped")
fi
printf 'CHEERS_SSH_1\nid=${job.id}\nstream=${stream}\noffset=${offset}\nnext=%s\nsize=%s\ndropped=%s\ncontext=%s\n' "$(( ${offset} + available ))" "$size" "$dropped" "$context"
`;
}
