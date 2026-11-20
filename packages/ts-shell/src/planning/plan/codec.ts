import { decodePlan as decode, validPlanCriterion as valid, type PlanPorts } from '@cheers/planning';
import { freezeDeep } from '../../core/values/freeze.js';
import { isRecord } from '../../core/values/record.js';
import type { PlanCriterion, PlanDraft } from './model.js';

export { planVersion, textDigest } from '@cheers/planning';

export const planPorts: PlanPorts = Object.freeze({ isRecord, freeze: freezeDeep });

export function decodePlan(value: unknown): PlanDraft | undefined {
  return decode(planPorts, value);
}

export function validPlanCriterion(value: unknown): value is PlanCriterion {
  return valid(isRecord, value);
}
