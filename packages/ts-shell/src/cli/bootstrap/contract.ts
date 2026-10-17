import type { ReadStream } from 'node:tty';
import type { ProfileContext } from '../../core/paths/profile/context.js';

export interface CliProcessRunnerInput {
  readonly args: readonly string[];
  readonly launchCwd: string;
  readonly stdin: ReadStream;
  readonly process: NodeJS.Process;
  readonly writeOutput: (message: string) => void;
  readonly writeError: (message: string) => void;
  readonly exit: (code: number) => never;
  /** The executable binds process event sources to the captured launch identity. */
  readonly profileSelected?: (profile: ProfileContext) => void;
}
