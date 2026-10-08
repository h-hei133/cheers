import { expect, it } from 'vitest';
import { guidedGoalSyntax, parsePlanningArgs, planReviewSyntax, planSyntax, queueSyntax } from './syntax.js';

it('uses the same strict action grammar for preview, explicit exact-version approval and queued controls', () => {
  expect(parsePlanningArgs(planReviewSyntax, [])).toMatchObject({ ok: true, action: { name: 'show' } });
  expect(parsePlanningArgs(planReviewSyntax, ['approve'])).toMatchObject({ ok: false });
  expect(parsePlanningArgs(planReviewSyntax, ['execute', 'version', 'extra'])).toMatchObject({ ok: false });
  expect(parsePlanningArgs(planSyntax, ['check', '--target', 'a.txt', '--', 'npm', 'test'])).toMatchObject({ ok: true });
  expect(parsePlanningArgs(guidedGoalSyntax, ['answer', 'unknown', 'text'])).toMatchObject({ ok: false });
  expect(parsePlanningArgs(guidedGoalSyntax, ['answer', 'budget', '0'])).toMatchObject({ ok: true });
  expect(parsePlanningArgs(queueSyntax, ['move', 'id', 'end'])).toMatchObject({ ok: true });
  expect(parsePlanningArgs(queueSyntax, ['list', 'extra'])).toMatchObject({ ok: false });
});
