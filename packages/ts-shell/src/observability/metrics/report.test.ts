import { expect, it } from 'vitest';
import { metricsReport } from './report.js';
import { reportText } from '../../core/commands/report/projection.js';

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
