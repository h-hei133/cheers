import type { SshWorkspace } from '../model.js';

/** Resolve only the user manager's cgroup and retain the original kernel object. */
export function holdGroup(binding: SshWorkspace): string {
  return `case "$cgroup" in /user.slice/user-${binding.uid}.slice/user@${binding.uid}.service/*) ;; *) exit 75 ;; esac
actual=$(realpath -e -- "/sys/fs/cgroup$cgroup")
test "$actual" = "/sys/fs/cgroup$cgroup"
test "$(stat -fc '%T' -- "$actual")" = cgroup2fs
exec {group_fd}<"$actual"
held="/proc/$$/fd/$group_fd"
identity=$(stat -Lc '%d:%i' -- "$held")
test "$(stat -Lc '%d:%i' -- "$actual")" = "$identity"
`;
}
export function emptyHeldGroup(): string {
  return 'test "$(readlink -- "$held")" = "$actual (deleted)" || grep -qx \'populated 0\' "$held/cgroup.events" 2>/dev/null';
}
