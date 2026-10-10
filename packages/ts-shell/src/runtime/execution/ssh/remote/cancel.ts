import { type SshJobSpec, requireSsh } from '../model.js';
import { unitName } from './start.js';
import { existingJob } from './query.js';
import { readInvocation } from './record.js';

/** Kernel cgroup descriptors fence numeric PID reuse; the promise covers this selected cgroup only. */
export function cancelRemoteJob(job: SshJobSpec, invocation: string): string {
  requireSsh(/^[0-9a-f]{32}$/.test(invocation));
  return `${existingJob(job)}
${readInvocation('$job/invocation', 'recorded_invocation')}
test "$recorded_invocation" = '${invocation}'
test "$(systemctl --user show '${unitName(job)}' --property InvocationID --value)" = '${invocation}'
cgroup=$(systemctl --user show '${unitName(job)}' --property ControlGroup --value)
case "$cgroup" in /user.slice/user-${job.binding.uid}.slice/user@${job.binding.uid}.service/*) ;; *) exit 75 ;; esac
actual=$(realpath -e -- "/sys/fs/cgroup$cgroup")
test "$actual" = "/sys/fs/cgroup$cgroup"
test "$(stat -fc '%T' -- "$actual")" = cgroup2fs
exec {group_fd}<"$actual"
held="/proc/$$/fd/$group_fd"
identity=$(stat -Lc '%d:%i' -- "$held")
exec {kill_fd}>"$held/cgroup.kill"
exec {events_fd}<"$held/cgroup.events"
test "$(stat -Lc '%d:%i' -- "$actual")" = "$identity"
test "$(systemctl --user show '${unitName(job)}' --property InvocationID --value)" = '${invocation}'
test "$(systemctl --user show '${unitName(job)}' --property ControlGroup --value)" = "$cgroup"
printf '1\n' >&$kill_fd
empty=no
for round in {1..60}; do
 # Kernfs retains nlink=2 after removal. The held descriptor's deleted marker
 # identifies the original cgroup, whose removal requires an empty subtree.
 if test "$(readlink -- "$held")" = "$actual (deleted)" || grep -qx 'populated 0' "/proc/$$/fd/$events_fd" 2>/dev/null; then empty=yes; break; fi
 sleep .05
done
test "$empty" = yes
printf '%s\n' '${invocation}' > "$job/cancelled.tmp"
mv -- "$job/cancelled.tmp" "$job/cancelled"
printf 'CHEERS_SSH_1\nid=${job.id}\ndigest=${job.digest}\ninvocation=${invocation}\ncancel=selected-cgroup-empty\noutput=interrupted\n'
`;
}
