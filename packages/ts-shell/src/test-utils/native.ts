import { writeSync } from 'node:fs';

/** Model bwrap's separate launcher status in execution-owner test doubles. */
export function completeNativeRead(input: { args?: readonly string[]; readDescriptors?: readonly number[] }, exitCode = 0): void {
  if (!input.args?.includes('--json-status-fd')) return;
  writeSync(input.readDescriptors![1]!, `${JSON.stringify({ 'child-pid': process.pid })}\n${JSON.stringify({ 'exit-code': exitCode })}\n`);
}
