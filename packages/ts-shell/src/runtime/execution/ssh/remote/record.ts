/** A prefix match is insufficient for durable evidence. Require canonical bytes. */
export function readInvocation(file: string, variable: string): string {
  return `test -f "${file}" && test ! -L "${file}" && test "$(stat -c '%s' -- "${file}")" = 33
${variable}=$(cat -- "${file}")
[[ "$${variable}" =~ ^[0-9a-f]{32}$ ]]
cmp -s -- "${file}" <(printf '%s\n' "$${variable}")
`;
}
