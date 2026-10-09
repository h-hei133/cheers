import { isRecord } from '../../core/values/record.js';
import { boundedJson } from './json.js';
import { reportPath } from './location.js';
import type { Coverage, Finding, ScanPlan } from './model.js';

export function observedCoverage(text: string, plan: ScanPlan, findings: readonly Finding[], sarifNotes: readonly string[]): Coverage {
  const json = boundedJson(text); const notes = [...sarifNotes];
  if (json.version !== plan.version || !isRecord(json.paths) || !Array.isArray(json.paths.scanned)
    || !Array.isArray(json.errors) || !Array.isArray(json.results)) throw new Error('Native coverage output is malformed or has a version mismatch.');
  const scanned = [...new Set(json.paths.scanned.map(uri => reportPath(uri, plan)))].sort();
  const missing = plan.sources.filter(source => !scanned.includes(source.path)).map(source => source.path);
  if (json.errors.length) notes.push(`Analyzer reported ${json.errors.length} parsing, timeout or analysis errors.`);
  if (missing.length) notes.push(`${missing.length} selected source files were not scanned (unsupported language, skipped or unavailable).`);
  const native = json.results.map(result => {
    if (!isRecord(result) || typeof result.check_id !== 'string' || !isRecord(result.start) || !Number.isSafeInteger(result.start.line)) throw new Error('Native finding coverage is malformed.');
    return JSON.stringify([result.check_id, reportPath(result.path, plan), result.start.line]);
  }).sort();
  const normalized = findings.map(finding => JSON.stringify([finding.rule, finding.path, finding.line])).sort();
  if (JSON.stringify(native) !== JSON.stringify(normalized)) throw new Error('Native SARIF and coverage findings disagree.');
  return { status: !missing.length && !notes.length ? 'complete' : 'partial', scanned, missing, notes };
}
