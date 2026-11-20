type ValueRule = 'word' | 'path' | 'config' | 'raw' | 'credential' | 'search';

interface OptionRule {
  readonly value?: ValueRule;
  readonly prepaint?: true;
  readonly early?: 'help' | 'version';
}

const optionRules = new Map<string, OptionRule>([
  ['--profile', { value: 'word', prepaint: true }],
  ['--config', { value: 'config', prepaint: true }],
  ['--project', { value: 'path', prepaint: true }],
  ['--attach', { value: 'path', prepaint: true }],
  ['--session-id', { value: 'path', prepaint: true }],
  ['--new-session', { prepaint: true }],
  ['--fork', { value: 'word', prepaint: true }],
  ['--provider', { value: 'raw', prepaint: true }],
  ['--model', { value: 'word', prepaint: true }],
  ['--models', { value: 'word', prepaint: true }],
  ['--thinking', { value: 'word', prepaint: true }],
  // A credential can itself be a flag or a prompt terminator.
  ['--api-key', { value: 'credential', prepaint: true }],
  ['--replay-file', { value: 'path' }],
  ['--export', { value: 'word' }],
  ['--list-models', { value: 'search' }],
  ['--skill', { value: 'word', prepaint: true }],
  ['--theme', { value: 'word', prepaint: true }],
  ['--use-theme', { value: 'word', prepaint: true }],
  ['--extension', { value: 'word', prepaint: true }],
  ['-e', { value: 'word', prepaint: true }],
  ['--tools', { value: 'word', prepaint: true }],
  ['--non-interactive-approval', { value: 'raw' }],
  ['--no-context-files', { prepaint: true }],
  ['--no-skills', { prepaint: true }],
  ['-ns', { prepaint: true }],
  ['--offline', { prepaint: true }],
  ['--dangerously-bypass-hook-trust', { prepaint: true }],
  ['--continue', { prepaint: true }],
  ['-c', { prepaint: true }],
  ['--resume', { prepaint: true }],
  ['-r', { prepaint: true }],
  ['--no-tools', { prepaint: true }],
  ['-nt', { prepaint: true }],
  ['--print', {}],
  ['-p', {}],
  ['--json', {}],
  ['--rpc', {}],
  ['--doctor', {}],
  ['--migrate-session-root', {}],
  ['--help', { early: 'help' }],
  ['-h', { early: 'help' }],
  ['--version', { early: 'version' }],
  ['-v', { early: 'version' }],
  ['-V', { early: 'version' }],
]);

interface Option {
  readonly name: string;
  readonly value?: string;
}

export interface UnresolvedOption {
  readonly name: string;
  readonly inline?: string;
  readonly following?: string;
}

export interface CliInvocation {
  readonly rawArgs: readonly string[];
  readonly options: readonly Option[];
  readonly positionals: readonly string[];
  readonly tail: readonly string[];
  readonly versionRequested: boolean;
  readonly helpRequested: boolean;
  readonly prepaint: boolean;
  readonly unresolved: readonly UnresolvedOption[];
}

export function isBuiltinOption(name: string): boolean {
  return optionRules.has(name);
}

function optionName(token: string): string {
  const equals = token.startsWith('--') ? token.indexOf('=') : -1;
  return equals === -1 ? token : token.slice(0, equals);
}

function inlineValue(rule: ValueRule, value: string): string | undefined {
  if (rule === 'raw' || rule === 'credential') return value || undefined;
  if (rule === 'search') return value.trim() || undefined;
  if (!value.trim()) return undefined;
  if (rule === 'path') return value;
  return value.startsWith(rule === 'config' ? '-' : '--') ? undefined : value;
}

function optionValue(rule: ValueRule | undefined, inline: string | undefined, next: string | undefined,
  extensionTypes?: ReadonlyMap<string, 'boolean' | 'string'>): string | undefined {
  if (!rule) return undefined;
  if (inline !== undefined) return inlineValue(rule, inline);
  if (!next) return undefined;
  if (rule === 'credential') return next;
  if (next === '--' || optionRules.get(next)?.early) return undefined;
  if (rule === 'raw') return next;
  if (rule === 'path') {
    const name = optionName(next), candidate = optionRules.get(name);
    return candidate && !candidate.early || extensionTypes?.has(name) ? undefined : next;
  }
  if (rule === 'search' && next.startsWith('@')) return undefined;
  return next.startsWith(rule === 'word' ? '--' : '-') ? undefined : next;
}

/** Resolve token ownership before selecting an early command or loading the runtime. */
export function scanCliArgs(rawArgs: readonly string[], extensionTypes?: ReadonlyMap<string, 'boolean' | 'string'>): CliInvocation {
  const options: Option[] = [];
  const positionals: string[] = [];
  const unresolved: UnresolvedOption[] = [];
  let tail: readonly string[] = [];
  let versionRequested = false;
  let helpRequested = false;
  let prepaint = true;
  for (let index = 0; index < rawArgs.length; index++) {
    const token = rawArgs[index]!;
    if (token === '--') {
      tail = rawArgs.slice(index + 1);
      prepaint = false;
      break;
    }
    if (!token.startsWith('-')) {
      positionals.push(token);
      prepaint = false;
      continue;
    }
    const name = optionName(token);
    const inline = name === token ? undefined : token.slice(name.length + 1);
    const rule = optionRules.get(name);
    const next = rawArgs[index + 1];
    if (!rule) {
      const type = extensionTypes?.get(name);
      const following = inline === undefined && next !== undefined && !next.startsWith('-') ? next : undefined;
      if (type === undefined) unresolved.push({ name, inline, following });
      // Hold a potential string value until the declared type admits or releases it.
      if (type !== 'boolean' && following !== undefined) index++;
      prepaint = false;
      continue;
    }
    const value = optionValue(rule.value, inline, next, extensionTypes);
    if (rule?.value && inline === undefined && value !== undefined) index++;
    if (inline === undefined) {
      if (rule?.early === 'version') versionRequested = true;
      if (rule?.early === 'help') helpRequested = true;
    }
    if (!rule?.prepaint || (rule.value
      ? value === undefined || (inline === undefined && value.startsWith('-'))
      : inline !== undefined)) prepaint = false;
    options.push({ name, value });
  }
  return { rawArgs, options, positionals, tail, versionRequested, helpRequested, prepaint, unresolved };
}
