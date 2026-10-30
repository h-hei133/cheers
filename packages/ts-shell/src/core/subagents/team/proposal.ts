import { isRecord } from '../../values/record.js';

export interface Proposal {
  readonly id: string;
  readonly claim: string;
  readonly evidenceRefs: readonly string[];
  readonly falsifiers: readonly string[];
}

/** Parse the exact bounded hypothesis, never infer structure from free prose. */
export function parseProposal(text: string, id: string, receipts: readonly string[]): Proposal {
  if (Buffer.byteLength(text) > 16384) throw new Error('The proposal exceeds its structured output limit.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('The proposer did not return the required hypothesis JSON.'); }
  if (!isRecord(value) || value.hypothesisId !== id || !boundedText(value.claim, 4096)
    || !strings(value.evidenceRefs, 0, 12, 128) || !strings(value.falsifiers, 1, 8, 1024)
    || Object.keys(value).some(key => !['hypothesisId', 'claim', 'evidenceRefs', 'falsifiers'].includes(key))) {
    throw new Error('The proposal has an invalid identity, claim, evidence list or falsifiers.');
  }
  if (value.evidenceRefs.some(reference => !receipts.includes(reference))) {
    throw new Error('The proposal cites a source not read by this proposer.');
  }
  return { id, claim: value.claim.trim(), evidenceRefs: [...new Set(value.evidenceRefs)], falsifiers: value.falsifiers.map(value => value.trim()) };
}

function boundedText(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && Buffer.byteLength(value) <= limit;
}

function strings(value: unknown, minimum: number, maximum: number, limit: number): value is string[] {
  return Array.isArray(value) && value.length >= minimum && value.length <= maximum && value.every(item => boundedText(item, limit));
}

export function proposalPrompt(question: string, id: string): string {
  return `${question}\n\nYour hypothesis ID is ${id}. Return exactly one JSON object with keys hypothesisId, claim, evidenceRefs and falsifiers. `
    + 'State one strongest claim and at least one concrete observable condition that would disprove it. '
    + 'Cite only Read receipt IDs obtained during this proposal, or use an empty evidenceRefs array when support is unverified. '
    + 'Do not put file paths in evidenceRefs. Maximum claim 4096 bytes, eight falsifiers of 1024 bytes each, twelve receipt IDs. '
    + `Example shape: ${JSON.stringify({ hypothesisId: id, claim: '<claim>', evidenceRefs: [], falsifiers: ['<observation that would refute the claim>'] })}`;
}
