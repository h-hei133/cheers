import fs from 'node:fs';
import path from 'node:path';
import which from 'which';

const LIBRARIES = ['/lib', '/lib64', '/usr/lib', '/usr/lib64'] as const;
const LOADER = '/etc/ld.so.cache';

/** The host cannot provide the private native read view; callers may use their documented fallback. */
export class NativeReadUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NativeReadUnavailableError';
  }
}

/** Fail before any platform-specific descriptor or directory setup runs. */
export function assertNativeReadSupported(platform = process.platform): void {
  if (platform !== 'linux') {
    throw new NativeReadUnavailableError('Native file enumeration isolation is unavailable on this platform.');
  }
}

function executable(command: string): string {
  const candidates = path.isAbsolute(command)
    ? [command]
    : [which.sync(command, { nothrow: true }) ?? '', ...(process.env.PATH ?? '').split(path.delimiter).map(directory => path.join(directory, command))];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.realpathSync(candidate);
    } catch { /* Try the next PATH entry. */ }
  }
  throw new NativeReadUnavailableError(`Native read executable is unavailable: ${command}.`);
}

function contains(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Enumeration sees copied metadata and names, never a host workspace mount. */
export function planNativeRead(input: {
  command: string; args: readonly string[]; root: string; directory: string; descriptor: number; statusDescriptor: number;
}) {
  assertNativeReadSupported();
  const launcher = executable('bwrap');
  const command = executable(input.command);
  const runtime = [...LIBRARIES, LOADER].filter(file => fs.existsSync(file));
  if ([launcher, command, ...runtime].some(file => contains(input.root, fs.realpathSync(file)) || contains(fs.realpathSync(file), input.root))) {
    throw new Error('The workspace overlaps the native enumeration runtime.');
  }
  // The execution owner creates the session and retains its group for cleanup.
  const args = ['--unshare-all', '--die-with-parent', '--json-status-fd', '4', '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp'];
  for (const file of runtime) args.push('--ro-bind', file, file);
  args.push('--ro-bind', command, command, '--ro-bind', '/proc/self/fd/3', input.root,
    '--chdir', input.directory, '--clearenv', '--setenv', 'LANG', 'C', '--setenv', 'LC_ALL', 'C',
    '--setenv', 'HOME', '/nonexistent', '--setenv', 'XDG_CONFIG_HOME', '/nonexistent',
    '--setenv', 'GIT_CONFIG_NOSYSTEM', '1', '--setenv', 'GIT_CONFIG_GLOBAL', '/dev/null',
    '--setenv', 'GIT_OPTIONAL_LOCKS', '0', '--', command, ...input.args);
  return { command: launcher, args, cwd: input.directory, readDescriptors: [input.descriptor, input.statusDescriptor],
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' } };
}
