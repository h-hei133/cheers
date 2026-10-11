import type { BoundSessionScope } from '../../../session/store/contract.js';
export type GuidanceQuestionField = 'objective' | 'outcome' | 'constraints';
export type GuidanceField = GuidanceQuestionField | 'budget';
export const guidanceFields: readonly GuidanceQuestionField[] = ['objective', 'outcome', 'constraints'];
export interface GuidanceDraft extends BoundSessionScope {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly revision: number;
  readonly answers: Readonly<Partial<Record<GuidanceField, string>>>;
  readonly phase: 'draft' | 'cancelled' | 'approved';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly approval?: { readonly version: string; readonly goalId: string; readonly timestamp: string; readonly source: 'user' };
}
