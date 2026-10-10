import { requireSsh, type SshJobSpec } from '../model.js';
import { assignment, encoded } from './protocol.js';
import { boundWorkspace, privateDirectory } from './workspace.js';
import { validateJobSpec } from '../validation.js';
import { unitProperties, admitResources, awaitResourceAdmission } from './resources.js';

export function unitName(job: SshJobSpec): string {
  validateJobSpec(job);
  return `cheers-${job.binding.namespace}-${job.id}.service`;
}
export function startRemoteJob(job: SshJobSpec): string {
  requireSsh(/^[0-9a-f]{64}$/.test(job.digest));
  const wrapper = runnerScript(job);
  return `${boundWorkspace(job.binding)}
if test ! -e "$journal"; then mkdir -m700 -- "$journal"; fi
${privateDirectory('journal')}
${assignment('job_id', job.id)}
job="$journal/$job_id"
# An existing claim is an immutable no-replay tombstone, including incomplete starts.
if ! mkdir -m700 -- "$job"; then exit 73; fi
printf '%s\n' '${job.digest}' > "$job/digest"
printf '%s' '${encoded(job.command)}' | base64 --decode > "$job/command"
printf '%s' '${encoded(wrapper)}' | base64 --decode > "$job/runner"
chmod 600 "$job/digest" "$job/command" "$job/runner"
systemd-run --user --quiet --unit '${unitName(job)}' ${unitProperties} \\
 /usr/bin/env -i PATH=/usr/bin:/bin LC_ALL=C /usr/bin/bash --noprofile --norc "$job/runner" "$job"
invocation=$(systemctl --user show '${unitName(job)}' --property InvocationID --value)
test "\${#invocation}" = 32
printf '%s\n' "$invocation" > "$job/invocation.tmp"
mv -- "$job/invocation.tmp" "$job/invocation"
${admitResources(job, unitName(job))}
printf 'CHEERS_SSH_1\nid=${job.id}\ndigest=${job.digest}\ninvocation=%s\nstatus=started\n' "$invocation"
`;
}
function runnerScript(job: SshJobSpec): string {
  return `set -euo pipefail
umask 077
job=$1
${awaitResourceAdmission()}
cd -- '${job.binding.root.replace(/'/g, "'\\''")}' || exit 74
test "$(pwd -P)" = '${job.binding.root.replace(/'/g, "'\\''")}' || exit 74
test "$(stat -Lc '%d:%i' -- .)" = '${job.binding.directoryIdentity}' || exit 74
mkfifo -m600 -- "$job/stdout.pipe" "$job/stderr.pipe" || exit 74
( set -e; exec 3<"$job/stdout.pipe"; head -c 65536 <&3 > "$job/stdout"; wc -c <&3 > "$job/stdout.dropped"; printf 'complete\n' > "$job/stdout.done" ) & out=$!
( set -e; exec 3<"$job/stderr.pipe"; head -c 65536 <&3 > "$job/stderr"; wc -c <&3 > "$job/stderr.dropped"; printf 'complete\n' > "$job/stderr.done" ) & err=$!
set +e
/usr/bin/bash --noprofile --norc "$job/command" > "$job/stdout.pipe" 2> "$job/stderr.pipe"
code=$?
wait "$out"; out_code=$?
wait "$err"; err_code=$?
set -e
printf '%s\n%s\n%s\n' "$code" "$out_code" "$err_code" > "$job/terminal.tmp"
mv -- "$job/terminal.tmp" "$job/terminal"
exit "$code"
`;
}
