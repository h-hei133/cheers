export const ROUTE219_TASK_QUALITY_BENCHMARK_COMMAND =
  "npm run verify:route219-real-task-quality-benchmark" as const;

export const TASK_QUALITY_BENCHMARK_COMMANDS = [
  ROUTE219_TASK_QUALITY_BENCHMARK_COMMAND,
] as const;

export function isTaskQualityBenchmarkCommand(command: string): boolean {
  return TASK_QUALITY_BENCHMARK_COMMANDS.includes(
    command as (typeof TASK_QUALITY_BENCHMARK_COMMANDS)[number],
  );
}
