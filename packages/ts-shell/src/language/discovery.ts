import fs from 'node:fs';
import path from 'node:path';

export interface LanguageCandidate {
  readonly id: string;
  readonly command: string;
  readonly args: readonly string[];
}

const PROGRAMS = [
  { id: 'typescript', executable: 'typescript-language-server', args: ['--stdio'] },
  { id: 'python', executable: 'pyright-langserver', args: ['--stdio'] },
  { id: 'go', executable: 'gopls', args: ['serve'] },
  { id: 'rust', executable: 'rust-analyzer', args: [] },
] as const;

const MAX_PATH_BYTES = 16 * 1024;
const MAX_PATH_ENTRIES = 128;

/** List installed candidates from the captured executable search path. This never starts one. */
export function discoverLanguageCandidates(searchPath: string | undefined, platform = process.platform): readonly LanguageCandidate[] {
  if (platform === 'win32' || !searchPath || Buffer.byteLength(searchPath) > MAX_PATH_BYTES) return [];
  const directories = searchPath.split(path.delimiter).slice(0, MAX_PATH_ENTRIES);
  const found = new Map<string, LanguageCandidate>();
  for (const program of PROGRAMS) {
    for (const directory of directories) {
      if (!path.isAbsolute(directory) || directory.length > 4096) continue;
      const candidate = path.join(directory, program.executable);
      try {
        const command = fs.realpathSync(candidate);
        const stat = fs.statSync(command);
        fs.accessSync(command, fs.constants.X_OK);
        if (!stat.isFile() || found.has(program.id)) continue;
        found.set(program.id, Object.freeze({ id: program.id, command, args: Object.freeze([...program.args]) }));
        break;
      } catch {
        // Missing or inaccessible candidates are simply not available.
      }
    }
  }
  return Object.freeze([...found.values()]);
}
