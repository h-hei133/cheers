import type { SshJobSpec } from '../model.js';
import { holdGroup } from './group.js';
import { readInvocation } from './record.js';

export const unitProperties = '--property Type=exec --property ExitType=cgroup --property RemainAfterExit=yes '
  + '--property RuntimeMaxSec=300 --property TimeoutStopSec=3 --property MemoryMax=268435456 --property TasksMax=32 '
  + '--property LimitFSIZE=131072 --property NoNewPrivileges=yes --property KillMode=control-group --property SendSIGKILL=yes';

/** The native unit starts a waiting supervisor. Submitted code needs this second gate. */
export function admitResources(job: SshJobSpec, unit: string): string {
  return `cgroup=$(systemctl --user show '${unit}' --property ControlGroup --value)
${holdGroup(job.binding)}
exec {kill_fd}>"$held/cgroup.kill"
test "$(cat "$held/memory.max")" = 268435456
test "$(cat "$held/pids.max")" = 32
test "$(systemctl --user show '${unit}' --property InvocationID --value)" = "$invocation"
printf '%s\n' "$invocation" > "$job/admitted.tmp"
mv -- "$job/admitted.tmp" "$job/admitted"
`;
}
export function awaitResourceAdmission(): string {
  return `admitted=no
for round in {1..100}; do
 if test -f "$job/admitted" && test ! -L "$job/admitted"; then admitted=yes; break; fi
 sleep .05
done
test "$admitted" = yes || exit 74
${readInvocation('$job/admitted', 'admitted_invocation')}
${readInvocation('$job/invocation', 'native_invocation')}
test "$admitted_invocation" = "$native_invocation" || exit 74
test "$(ulimit -f)" = 128 || exit 74
grep -q '^NoNewPrivs:[[:space:]]*1$' /proc/self/status || exit 74
`;
}
