export type ResearchMode = 'software' | 'paper' | 'mixed';
export interface ResearchBrief {
  readonly revision: number;
  readonly question: string;
  readonly mode: ResearchMode;
  readonly questions: readonly { readonly id: string; readonly text: string }[];
  /** Requested applicability, never proof that a source actually meets it. */
  readonly anchors: { readonly versions: readonly string[]; readonly platforms: readonly string[]; readonly conditions: readonly string[] };
  readonly scope: string;
  readonly exclusions: readonly string[];
}

export type SourceReadStatus = 'metadata' | 'abstract' | 'read' | 'truncated' | 'no-text' | 'failed' | 'restricted';
export interface SourceExcerpt {
  readonly id: string;
  readonly location: string;
  readonly text: string;
}
export interface SourceRecord {
  readonly id: string;
  readonly kind: 'web' | 'file' | 'paper' | 'search';
  readonly provider: string;
  readonly locator: string;
  readonly finalLocator?: string;
  readonly fetchedAt: string;
  readonly callId: string;
  readonly childId: string;
  readonly briefRevision: number;
  readonly status: SourceReadStatus;
  readonly contentHash?: string;
  readonly hashScope?: string;
  readonly readKey?: string;
  readonly mime?: string;
  readonly bytes?: number;
  readonly parser?: string;
  readonly title?: string;
  readonly identifiers?: { readonly doi?: string; readonly arxiv?: string; readonly version?: string; readonly providerId?: string };
  readonly replicas: readonly string[];
  readonly fulltextUrls?: readonly string[];
  readonly retrieval?: { readonly url: string; readonly contentHash: string; readonly fetchedAt: string; readonly bytes: number };
  readonly excerpts: readonly SourceExcerpt[];
  readonly limits: readonly string[];
  readonly stale?: boolean;
  readonly failure?: string;
}
export interface ClaimReference {
  readonly sourceId: string;
  readonly excerptId: string;
  readonly quote: string;
}
export interface ClaimRecord {
  readonly id: string;
  readonly questionId: string;
  readonly text: string;
  readonly kind: 'behavior' | 'method' | 'evaluation' | 'metadata' | 'other';
  readonly scope: string;
  readonly support: 'direct' | 'indirect' | 'insufficient' | 'opposed';
  readonly supportReason: string;
  readonly supporting: readonly ClaimReference[];
  readonly opposing: readonly ClaimReference[];
  readonly conflicts: readonly string[];
  readonly limitations: readonly string[];
}
export interface ResearchDraft {
  readonly summary: string;
  readonly claims: readonly ClaimRecord[];
  readonly covered: readonly string[];
  readonly uncovered: readonly string[];
  readonly limitations: readonly string[];
}

export interface ReviewFinding {
  readonly claimId: string;
  readonly outcome: 'counterevidence' | 'condition-mismatch' | 'insufficient' | 'none-found';
  readonly reason: string;
  readonly references: readonly ClaimReference[];
}
export interface ReviewRecord {
  readonly role: 'independent';
  readonly correlation: 'same-model-independent-context' | 'different-model';
  readonly inputDigest: string;
  readonly childId: string;
  readonly status: 'not-run' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';
  readonly findings: readonly ReviewFinding[];
  readonly uncovered: readonly string[];
  readonly limitation: string;
}

export interface ReportFragment {
  readonly index: number;
  readonly title: string;
  readonly text: string;
  readonly claimIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly inputDigest: string;
}

export type ProtectText = (text: string, limit: number) => string;
export type CompareValues = (before: unknown, after: unknown) => boolean;

export interface ReviewOutput {
  readonly findings: readonly ReviewFinding[];
  readonly uncovered: readonly string[];
  readonly limitation: string;
}

export interface ReviewInput {
  readonly brief?: ResearchBrief;
  readonly claims: readonly ClaimRecord[];
  readonly sources: readonly SourceRecord[];
  readonly children: readonly { readonly id: string; readonly stage: string; readonly sourceIds: readonly string[] }[];
}

export interface FragmentInput {
  readonly fragments: readonly ReportFragment[];
  readonly claims: readonly ClaimRecord[];
  readonly sources: readonly SourceRecord[];
  readonly review?: Pick<ReviewRecord, 'findings'>;
}

export interface ReportInput extends FragmentInput {
  readonly id: string;
  readonly request: { readonly question: string; readonly mode?: ResearchMode; readonly depth: 'quick' | 'deep' };
  readonly brief?: ResearchBrief;
  readonly status: string;
  readonly briefRevision: number;
  readonly deadlineAt: string;
  readonly stopReason?: string;
  readonly draft?: ResearchDraft;
  readonly review?: ReviewRecord;
  readonly gapQuestions: readonly string[];
  readonly save: { readonly status: string; readonly path?: string; readonly operationId?: string };
  readonly events: readonly { readonly sequence: number; readonly timestamp: string; readonly kind: string; readonly stage: string; readonly detail: string }[];
}

export interface LedgerProjection {
  readonly scopeId: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly unknown: number;
  readonly historyUnknown: boolean;
  readonly breach: boolean;
}

export interface ReportProjection {
  readonly text: string;
  readonly truncated: boolean;
}

export type ProtectReport = (text: string, limit: number) => ReportProjection;

type Schema = Record<string, unknown>;
export const text: { readonly type: string; readonly minLength: number; readonly maxLength: number };
export const texts: { readonly type: string; readonly maxItems: number; readonly items: typeof text };
export const identifier: typeof text & { readonly pattern: string };
export const briefSchema: Schema;
export const requestSchema: Schema;
export const referenceSchema: Schema;
export const claimSchema: Schema;
export const draftSchema: Schema;
export const sourceSchema: Schema;
export const reviewOutputSchema: Schema;
export const reviewSchema: Schema;

export function validateReference(reference: ClaimReference, sources: readonly SourceRecord[]): SourceRecord;
export function validateDraft(draft: ResearchDraft, brief: ResearchBrief, sources: readonly SourceRecord[], protectText: ProtectText): ResearchDraft;
export function mergeSources(current: readonly SourceRecord[], incoming: readonly SourceRecord[], sameValue: CompareValues):
  { readonly sources: readonly SourceRecord[]; readonly changed: readonly string[] };
export function validateReview(output: ReviewOutput, run: ReviewInput, childId: string, protectText: ProtectText):
  ReviewOutput & { readonly status: 'completed' | 'failed' };
export function validateFragment(fragment: ReportFragment, run: FragmentInput, reportDigest: () => string): ReportFragment;
export function projectReport(run: ReportInput, ledger: LedgerProjection | undefined, protect: ProtectReport): ReportProjection;
