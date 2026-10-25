/** Only unambiguously interactive launches may take stdin before full parsing. */
export function startupEligible(args: readonly string[], tty: boolean): boolean {
  if (!tty) return false;
  const values = new Set(['--profile', '--config', '--project', '--attach', '--provider', '--api-key', '--tools', '--skill', '--theme', '--use-theme']);
  const flags = new Set(['--no-context-files', '--no-skills', '-ns', '--offline', '--dangerously-bypass-hook-trust']);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (flags.has(arg)) continue;
    if (values.has(arg.split('=')[0]!)) {
      if (arg.includes('=')) { if (!arg.split('=').slice(1).join('=')) return false; }
      else if (!args[++index] || args[index]!.startsWith('-')) return false;
    } else return false;
  }
  return true;
}
