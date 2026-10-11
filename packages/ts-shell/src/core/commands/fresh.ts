export interface FreshStateOwner {
  readonly admission?: () => string | undefined;
  readonly resetConnection?: () => Promise<'reset' | 'unchanged' | 'unknown'> | 'reset' | 'unchanged' | 'unknown';
  readonly resetCursor?: () => Promise<'reset' | 'unchanged' | 'unknown'> | 'reset' | 'unchanged' | 'unknown';
  readonly clearCache?: () => Promise<'reset' | 'unchanged' | 'unknown'> | 'reset' | 'unchanged' | 'unknown';
}

/** Reset only local controllable transport state; transcript and remote account state are untouched. */
export async function freshLocalState(owner: FreshStateOwner): Promise<string> {
  const outcomes: ('reset' | 'unchanged' | 'unknown')[] = [];
  for (const operation of [owner.resetConnection, owner.resetCursor, owner.clearCache]) {
    const refused = owner.admission?.();
    if (refused) return `Fresh local state blocked: ${refused}`;
    try { outcomes.push(await operation?.() ?? 'unchanged'); }
    catch { outcomes.push('unknown'); }
  }
  if (outcomes.includes('unknown')) return 'Fresh local state is unknown; transcript and remote account state were not changed.';
  if (outcomes.every(outcome => outcome === 'unchanged')) return 'Fresh local state had nothing to reset; transcript and remote account state were not changed.';
  return `Fresh local state reset: ${outcomes.filter(outcome => outcome === 'reset').length} owner(s); transcript and remote account state were not changed.`;
}
