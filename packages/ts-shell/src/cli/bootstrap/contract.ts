import type { ReadStream } from 'node:tty';

export interface CliProcessRunnerInput {
  readonly args: readonly string[];
  readonly launchCwd: string;
  readonly stdin: ReadStream;
  readonly process: NodeJS.Process;
  readonly writeOutput: (message: string) => void;
  readonly writeError: (message: string) => void;
  readonly exit: (code: number) => never;
}
