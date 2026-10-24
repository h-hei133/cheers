import { ReportLimitError, type CommandReport } from './contract.js';
import { createReport, reportText } from './projection.js';

/**
 * Fit captured metadata through the actual snapshot/text limits. The builder is
 * pure: source acquisition and accounting happen before these bounded retries.
 * Keep a valid prefix; no maximal-prefix or total heap/latency guarantee.
 */
export function boundedReport<T>(items: readonly T[], build: (shown: readonly T[]) => Omit<CommandReport, 'version'>): CommandReport {
  const project = (count: number): CommandReport => {
    const report = createReport(build(items.slice(0, count)));
    reportText(report);
    return report;
  };
  try { return project(items.length); }
  catch (error) { if (!(error instanceof ReportLimitError)) throw error; }
  let lower = 0, upper = items.length - 1;
  let result = project(0);
  while (lower < upper) {
    const count = Math.ceil((lower + upper) / 2);
    try { result = project(count); lower = count; }
    catch (error) {
      if (!(error instanceof ReportLimitError)) throw error;
      upper = count - 1;
    }
  }
  return result;
}
