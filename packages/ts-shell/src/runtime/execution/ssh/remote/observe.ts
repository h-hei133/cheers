import type { SshJobSpec } from '../model.js';
import { holdGroup, emptyHeldGroup } from './group.js';

export function nativeObservation(job: SshJobSpec, unit: string): string {
  return `active=unknown
sub=unknown
result=unknown
code=unknown
termination=unknown
output=unknown
cleanup=unknown
observed=unknown
cgroup=
native=$(systemctl --user show '${unit}' --property InvocationID,ControlGroup,ActiveState,SubState,Result,ExecMainStatus,ExecMainCode 2>/dev/null || true)
while IFS='=' read -r key value; do
 case "$key" in
  InvocationID) observed=$value ;; ControlGroup) cgroup=$value ;; ActiveState) active=$value ;;
  SubState) sub=$value ;; Result) result=$value ;; ExecMainStatus) code=$value ;;
  ExecMainCode) case "$value" in 1) termination=exit ;; 2|3) termination=signal ;; esac ;;
 esac
done <<< "$native"
if test "$invocation" != unknown && test "$observed" = "$invocation"; then
 if test -n "$cgroup" && test -d "/sys/fs/cgroup$cgroup"; then
  ${holdGroup(job.binding)}
  if ${emptyHeldGroup()}; then cleanup=selected-cgroup-empty; fi
 elif test "$sub" = exited || test "$active" = failed; then cleanup=selected-cgroup-empty; fi
 test "$(systemctl --user show '${unit}' --property InvocationID --value)" = "$invocation"
 if test "$sub" = exited || test "$active" = failed; then
  ${collectorObservation()}
  if test "$cleanup" = selected-cgroup-empty; then
   printf '%s\n' "$invocation" "$active" "$sub" "$result" "$code" "$termination" "$output" "$cleanup" > "$job/observed.tmp"
   mv -- "$job/observed.tmp" "$job/observed"
  fi
 fi
else
 active=unknown; sub=unknown; result=unknown; code=unknown; termination=unknown
 if test -f "$job/observed" && test ! -L "$job/observed" && test "$(stat -c '%s' -- "$job/observed")" -le 512; then
  mapfile -t saved < "$job/observed"
  if test "\${#saved[@]}" = 8 && test "\${saved[0]}" = "$invocation" && test "\${saved[7]}" = selected-cgroup-empty; then
   cmp -s -- "$job/observed" <(printf '%s\n' "\${saved[@]}")
   active=\${saved[1]}; sub=\${saved[2]}; result=\${saved[3]}; code=\${saved[4]}; termination=\${saved[5]}; output=\${saved[6]}; cleanup=\${saved[7]}
  fi
 fi
fi
`;
}
function collectorObservation(): string {
  return `if test -f "$job/terminal" && test ! -L "$job/terminal" && test "$(stat -c '%s' -- "$job/terminal")" -le 64; then
 mapfile -t terminal < "$job/terminal"
 cmp -s -- "$job/terminal" <(printf '%s\n' "\${terminal[@]}")
 if test "\${#terminal[@]}" = 3 && test "\${terminal[0]}" = "$code" && test "\${terminal[1]}" = 0 && test "\${terminal[2]}" = 0 \\
  && test -f "$job/stdout.done" && test ! -L "$job/stdout.done" && cmp -s -- "$job/stdout.done" <(printf 'complete\n') \\
  && test -f "$job/stderr.done" && test ! -L "$job/stderr.done" && cmp -s -- "$job/stderr.done" <(printf 'complete\n'); then output=complete; fi
fi`;
}
