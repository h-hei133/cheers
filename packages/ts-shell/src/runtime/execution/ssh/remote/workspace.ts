import type { SshWorkspace } from '../model.js';
import { assignment } from './protocol.js';
import { validateWorkspace } from '../validation.js';

export function workspaceProbe(root: string): string {
  return `${preamble()}
${assignment('selected_root', root)}
test "$(uname -s)" = Linux
cd -- "$selected_root"
canonical=$(pwd -P)
directory_identity=$(stat -Lc '%d:%i' -- .)
uid=$(id -u)
boot=$(cat /proc/sys/kernel/random/boot_id)
export XDG_RUNTIME_DIR="/run/user/$uid" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus"
systemctl --user show-environment >/dev/null
test "$(stat -fc '%T' /sys/fs/cgroup)" = cgroup2fs
for utility in systemd-run systemctl base64 stat head tail mkfifo realpath bash; do command -v "$utility" >/dev/null; done
printf 'CHEERS_SSH_1\nroot=%s\nidentity=%s\nuid=%s\nboot=%s\nmanager=systemd-user\ncgroup=v2\n' "$(printf '%s' "$canonical" | base64 -w0)" "$directory_identity" "$uid" "$boot"
`;
}
export function boundWorkspace(binding: SshWorkspace): string {
  validateWorkspace(binding);
  return `${preamble()}
${assignment('selected_root', binding.root)}
${assignment('expected_identity', binding.directoryIdentity)}
${assignment('expected_boot', binding.bootId)}
${assignment('namespace', binding.namespace)}
cd -- "$selected_root"
test "$(pwd -P)" = "$selected_root"
test "$(stat -Lc '%d:%i' -- .)" = "$expected_identity"
test "$(cat /proc/sys/kernel/random/boot_id)" = "$expected_boot"
test "$(id -u)" = '${binding.uid}'
export XDG_RUNTIME_DIR="/run/user/${binding.uid}" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${binding.uid}/bus"
journal="$selected_root/.cheers-jobs-$namespace"
`;
}
export function privateDirectory(variable: string): string {
  return `test -d "$${variable}" && test ! -L "$${variable}"
test "$(stat -c '%u:%a' -- "$${variable}")" = "$(id -u):700"`;
}
function preamble(): string { return 'set -euo pipefail\numask 077\nexport PATH=/usr/bin:/bin LC_ALL=C\n'; }
