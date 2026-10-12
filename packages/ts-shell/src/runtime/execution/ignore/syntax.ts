import type { Ignore } from 'ignore';
import type { WalkBudget } from '../walk/budget.js';

/** Keep repository-relative rules literal while carrying a directory's inherited matcher. */
export function addIgnoreContent(matcher: Ignore, content: string, prefix: string, budget?: WalkBudget): void {
  const patterns: string[] = [];
  const literalPrefix = prefix.replace(/[\\*?\[\]]/g, '\\$&');
  for (const raw of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    budget?.check();
    if (/^ *$/.test(raw) || raw.startsWith('#')) continue;
    const negated = raw.startsWith('!');
    const body = negated ? raw.slice(1) : raw;
    if (body === '') continue;
    const anchored = body.startsWith('/');
    const bare = anchored ? body.slice(1) : body;
    let rewritten = prefix === '' ? body : bare;
    if (prefix !== '') {
      if (!anchored && !bare.replace(/ +$/, '').replace(/\/$/, '').includes('/')) rewritten = `**/${bare}`;
      rewritten = `/${literalPrefix}${rewritten}`;
    }
    const pattern = negated ? `!${rewritten}` : rewritten;
    budget?.take('rules', 1); budget?.take('ruleBytes', Buffer.byteLength(pattern));
    patterns.push(pattern);
  }
  if (patterns.length > 0) matcher.add(patterns);
  budget?.check();
}
