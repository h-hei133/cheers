import { expect, it } from 'vitest';
import { metricsReport } from './report.js';
import { reportText } from '../../core/commands/report/projection.js';
import { readReport } from '../../core/commands/report/codec.js';

it('fits legal metric groups into text and persisted report budgets', () => {
  const samples = Array.from({ length: 2000 }, (_, i) => ({ name: `metric-${i}`, unit: 'count' as const, total: i, count: 1, max: i, tags: {} }));
  const report = metricsReport({ status: 'reported', filesInspected: 1, unreadableFiles: 0, limit: 2000, samples }, '/fixture');
  expect(report.facts).toMatchObject({ status: 'reported', samplesRead: 2000, groupsTotal: 2000, coverage: 'partial' });
  expect(report.facts.groupsShown).toBeGreaterThan(0); expect(report.facts.groupsOmitted).toBeGreaterThan(0);
  expect(Number(report.facts.groupsShown) + Number(report.facts.groupsOmitted)).toBe(2000);
  expect(reportText(report)).toContain('metric groups omitted');
  expect(readReport(JSON.parse(JSON.stringify(report)))).toEqual(report); expect(samples).toHaveLength(2000);
});

it('redacts metric names and tags after grouping without merging distinct original identities', () => {
  const report = metricsReport({ status: 'reported', filesInspected: 1, unreadableFiles: 0, limit: 2000,
    samples: [1, 2].map(i => ({ name: `api_key=synthetic-sensitive-name-${i}`, unit: 'count', total: i, count: 1, max: i,
      tags: { reason: 'Authorization: Bearer synthetic-sensitive-tag', tool: '/private-machine/tool' } })) }, '/synthetic');
  expect(report.facts.groups).toHaveLength(2);
  expect(report.facts.groups).toMatchObject([{ total: 1 }, { total: 2 }]);
  expect(reportText(report)).not.toContain('synthetic-sensitive');
  expect(JSON.stringify(report)).not.toContain('synthetic-sensitive');
  expect(JSON.stringify(report)).not.toContain('/private-machine');
});
