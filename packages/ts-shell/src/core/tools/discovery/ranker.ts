import type { ToolDefinition } from '../../../tools/types.js';

const wordSegmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

const STOP_WORDS: Readonly<Record<string, true>> = {
  a: true, an: true, and: true, are: true, as: true, at: true, be: true, by: true, for: true, from: true,
  in: true, is: true, it: true, of: true, on: true, or: true, that: true, the: true, this: true, to: true, with: true,
};

const NAME_WEIGHT = 3;
const NAMESPACE_WEIGHT = 0.5;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

function stem(term: string): string {
  if (term.length > 4 && term.endsWith('ies')) return `${term.slice(0, -3)}y`;
  if (term.length > 4 && /(ches|shes|sses|xes|zes)$/.test(term)) return term.slice(0, -2);
  if (term.length > 3 && term.endsWith('s') && !term.endsWith('ss')) return term.slice(0, -1);
  return term;
}

/** Unicode word segmentation with identifier boundaries and English stop words/singular forms. */
export function tokenizeSearchText(text: string): string[] {
  const normalized = text
    .normalize('NFC')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ');
  const words = /^[a-z0-9 ]*$/.test(normalized)
    ? normalized.split(' ')
    : Array.from(wordSegmenter.segment(normalized), segment => (segment.isWordLike ? segment.segment : ''));
  return words
    .filter(word => word.length > 0 && STOP_WORDS[word] !== true)
    .map(word => (/^[a-z0-9]+$/.test(word) ? stem(word) : word));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveSchemaRef(ref: string, root: unknown): unknown {
  if (!ref.startsWith('#/')) return undefined;
  let current: unknown = root;
  for (const rawSegment of ref.slice(2).split('/')) {
    if (!isObject(current)) return undefined;
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    current = current[segment];
  }
  return current;
}

function collectSchemaText(schema: unknown, root: unknown, parts: string[], seen: Set<unknown>): void {
  if (!isObject(schema)) return;
  if (typeof schema.$ref === 'string') {
    const target = resolveSchemaRef(schema.$ref, root);
    if (isObject(target) && !seen.has(target)) {
      seen.add(target);
      collectSchemaText(target, root, parts, seen);
    }
  }
  if (typeof schema.description === 'string') parts.push(schema.description);
  if (isObject(schema.properties)) {
    for (const [name, property] of Object.entries(schema.properties)) {
      parts.push(name);
      collectSchemaText(property, root, parts, seen);
    }
  }
  collectSchemaText(schema.items, root, parts, seen);
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    const variants = schema[key];
    if (Array.isArray(variants)) for (const variant of variants) collectSchemaText(variant, root, parts, seen);
  }
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_$]/g, '_');
}

function isExactNameQuery(query: string, name: string): boolean {
  const normalized = normalizeName(name);
  return normalized === query || normalized.endsWith(`__${query}`);
}

interface IndexedTool {
  readonly tool: ToolDefinition;
  readonly nameLower: string;
  readonly textLower: string;
  readonly nameTerms: ReadonlySet<string>;
  readonly localNameTerms: readonly string[];
  readonly namespaceTerms: ReadonlySet<string>;
  readonly textCounts: ReadonlyMap<string, number>;
  readonly textLength: number;
}

function indexTool(tool: ToolDefinition): IndexedTool {
  const parts = [tool.description];
  collectSchemaText(tool.argsSchema, tool.argsSchema, parts, new Set([tool.argsSchema]));
  const fullText = parts.filter(part => part.trim()).join(' ');
  const textCounts = new Map<string, number>();
  for (const term of tokenizeSearchText(fullText)) {
    textCounts.set(term, (textCounts.get(term) ?? 0) + 1);
  }
  const segments = tool.name.split('__');
  const namespace = segments.length >= 3 && segments[0] === 'mcp' ? segments[1]! : '';
  return {
    tool,
    nameLower: tool.name.toLowerCase(),
    textLower: fullText.toLowerCase(),
    nameTerms: new Set(tokenizeSearchText(tool.name)),
    localNameTerms: [...new Set(tokenizeSearchText(segments[segments.length - 1]!))],
    namespaceTerms: new Set(namespace ? tokenizeSearchText(namespace) : []),
    textCounts,
    textLength: [...textCounts.values()].reduce((sum, count) => sum + count, 0),
  };
}

/** Rank tools with Okapi BM25 over names, descriptions, and recursive JSON Schema metadata. */
export function rankToolsByBm25(
  query: string,
  tools: readonly ToolDefinition[],
  limit: number,
): readonly ToolDefinition[] {
  const trimmed = query.trim();
  if (!trimmed || tools.length === 0 || limit <= 0) return [];
  const indexed = tools.map(indexTool);
  const queryTerms = new Set(tokenizeSearchText(trimmed));
  const avgLength = indexed.reduce((sum, doc) => sum + doc.textLength, 0) / indexed.length || 1;
  const idf = new Map(
    [...queryTerms].map(term => {
      const freq = indexed.filter(
        doc => doc.nameTerms.has(term) || doc.textCounts.has(term) || doc.namespaceTerms.has(term),
      ).length;
      return [term, Math.log(1 + (indexed.length - freq + 0.5) / (freq + 0.5))] as const;
    }),
  );
  const fullNameBonus = [...idf.values()].reduce((sum, value) => sum + value, 0);
  const exactQuery = normalizeName(trimmed);
  const queryLower = trimmed.toLowerCase();

  const ranked: Array<{ readonly tool: ToolDefinition; readonly exact: boolean; readonly covered: number; readonly score: number }> = [];
  for (const doc of indexed) {
    const norm = BM25_K1 * (1 - BM25_B + (BM25_B * doc.textLength) / avgLength);
    let score = 0;
    let covered = 0;
    for (const term of queryTerms) {
      const count = doc.textCounts.get(term) ?? 0;
      const weight =
        (doc.nameTerms.has(term) ? NAME_WEIGHT : 0) +
        (doc.namespaceTerms.has(term) ? NAMESPACE_WEIGHT : 0) +
        (count * (BM25_K1 + 1)) / (count + norm);
      if (weight > 0) covered++;
      score += (idf.get(term) ?? 0) * weight;
    }
    if (score === 0) {
      const substringScore = doc.nameLower.startsWith(queryLower) ? 0.5
        : doc.nameLower.includes(queryLower) ? 0.3
          : doc.textLower.includes(queryLower) ? 0.1 : 0;
      if (substringScore === 0) continue;
      score = substringScore;
    } else if (doc.localNameTerms.length > 0 && doc.localNameTerms.every(term => queryTerms.has(term))) {
      score += fullNameBonus;
    }
    ranked.push({ tool: doc.tool, exact: isExactNameQuery(exactQuery, doc.tool.name), covered, score });
  }

  return ranked
    .sort((left, right) =>
      Number(right.exact) - Number(left.exact)
      || right.covered - left.covered
      || right.score - left.score
      || left.tool.name.localeCompare(right.tool.name))
    .slice(0, limit)
    .map(match => match.tool);
}
