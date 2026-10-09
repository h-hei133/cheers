import { isRecord } from '../../core/values/record.js';
import { redactReportText } from '../../core/security/redaction.js';
import { neutraliseForDisplay } from '../../core/text/safety.js';
import { boundedJson } from './json.js';
import { locationOf } from './location.js';
import { digest } from './source.js';
import type { Finding, ScanPlan } from './model.js';

export function parseSarif(text: string, plan: ScanPlan): { findings: readonly Finding[]; notes: readonly string[]; reportDigest: string } {
  const report = boundedJson(text);
  if (report.version !== '2.1.0' || !Array.isArray(report.runs) || report.runs.length !== 1) throw new Error('Only SARIF 2.1.0 with one explicit analyzer run is supported.');
  const run = report.runs[0];
  if (!isRecord(run) || !isRecord(run.tool) || !isRecord(run.tool.driver)) throw new Error('SARIF analyzer identity is missing.');
  const driver = run.tool.driver;
  if (typeof driver.name !== 'string' || !/opengrep/i.test(driver.name) || (driver.semanticVersion ?? driver.version) !== plan.version) throw new Error('SARIF analyzer name or version does not match the plan.');
  if (!Array.isArray(driver.rules) || driver.rules.length > 4096 || !Array.isArray(run.results) || run.results.length > 2000) throw new Error('SARIF rules/results are missing or exceed limits.');
  const rules = new Map<string, Record<string, unknown>>();
  for (const rule of driver.rules) {
    if (!isRecord(rule) || typeof rule.id !== 'string' || !/^[\w./:-]{1,256}$/.test(rule.id) || rules.has(rule.id)) throw new Error('SARIF rule identity is malformed.');
    rules.set(rule.id, rule);
  }
  const findings = run.results.map((result, index): Finding => {
    if (!isRecord(result) || typeof result.ruleId !== 'string' || !rules.has(result.ruleId) || !isRecord(result.message)
      || typeof result.message.text !== 'string' || result.message.text.length > 16_384 || !Array.isArray(result.locations) || result.locations.length !== 1) throw new Error('SARIF finding is malformed or has unsupported locations.');
    const location = locationOf(result.locations[0], run, plan); const source = plan.sources.find(item => item.path === location.path)!;
    const rule = rules.get(result.ruleId)!; const configuration = isRecord(rule.defaultConfiguration) ? rule.defaultConfiguration : {};
    const severity = result.level ?? configuration.level ?? 'warning';
    if (!['error', 'warning', 'note', 'none'].includes(severity as string)) throw new Error('SARIF severity is malformed.');
    const fingerprints = result.fingerprints ?? result.partialFingerprints;
    if (fingerprints !== undefined && (!isRecord(fingerprints) || Object.values(fingerprints).some(value => typeof value !== 'string' || value.length > 512))) throw new Error('SARIF fingerprints are malformed.');
    const vendor = isRecord(fingerprints) ? Object.entries(fingerprints).sort().map(([key, value]) => [key, (value as string).replace(/_\d+$/, '')]) : [];
    const physical = (result.locations[0] as { physicalLocation: { region: { snippet?: { text?: unknown } } } }).physicalLocation;
    const anchor = physical.region.snippet?.text;
    if (anchor !== undefined && (typeof anchor !== 'string' || anchor.length > 16_384)) throw new Error('SARIF evidence snippet exceeds limits.');
    const exported = isRecord(fingerprints) ? fingerprints['cheersSemantic/v1'] : undefined;
    const fingerprint = typeof exported === 'string' && /^[0-9a-f]{64}$/.test(exported) ? exported
      : digest(JSON.stringify([result.ruleId, location.path, vendor.length ? vendor : typeof anchor === 'string' ? anchor.trim().replace(/\s+/g, ' ') : result.message.text]));
    return { ...location, rule: result.ruleId, severity: severity as Finding['severity'], fingerprint,
      occurrence: digest(JSON.stringify([fingerprint, location, index])), sourceDigest: source.digest,
      message: neutraliseForDisplay(redactReportText(result.message.text, 2000)), evidenceDigest: digest(JSON.stringify(result)) };
  });
  const notes: string[] = [];
  if (!Array.isArray(run.invocations) || !run.invocations.length) notes.push('Analyzer invocation coverage is unavailable.');
  else for (const invocation of run.invocations) {
    if (!isRecord(invocation)) throw new Error('SARIF invocation is malformed.');
    if (invocation.executionSuccessful !== true) notes.push('Analyzer reported incomplete execution.');
    for (const key of ['toolExecutionNotifications', 'toolConfigurationNotifications']) {
      const notifications = invocation[key];
      if (notifications !== undefined && !Array.isArray(notifications)) throw new Error('SARIF notifications are malformed.');
      if (Array.isArray(notifications) && notifications.length) notes.push('Analyzer reported execution or configuration notifications.');
    }
  }
  return { findings, notes, reportDigest: digest(text) };
}
