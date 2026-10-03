interface RebaseOptions {
  readonly ignoreCase?: boolean;
  readonly preserveRoot?: string;
}

/** Relocate original path occurrences once; leave ambiguous prose and input data intact. */
export function rebasePathValues(value: unknown, previousRoot: string, nextRoot: string, options?: RebaseOptions): unknown {
  const replace = rootReplacer(previousRoot, nextRoot, options);
  let changed = false;
  const copies = new WeakMap<object, object>();
  const pending: Array<{ source: object; target: object }> = [];
  const copy = (entry: unknown): unknown => {
    if (typeof entry === "string") {
      const result = replace(entry);
      changed ||= result !== entry;
      return result;
    }
    if (!entry || typeof entry !== "object") return entry;
    const existing = copies.get(entry);
    if (existing) return existing;
    const target: object = Array.isArray(entry) ? new Array(entry.length) : {};
    copies.set(entry, target);
    pending.push({ source: entry, target });
    return target;
  };
  const result = copy(value);
  while (pending.length > 0) {
    const { source, target } = pending.pop()!;
    for (const [key, entry] of Object.entries(source)) {
      Object.defineProperty(target, key, { value: copy(entry), enumerable: true, writable: true, configurable: true });
    }
  }
  return changed ? result : value;
}

function rootReplacer(previousRoot: string, nextRoot: string, options?: RebaseOptions): (text: string) => string {
  const previous = trimRoot(previousRoot);
  const next = trimRoot(nextRoot);
  if (!previous || (previous === next && !options?.ignoreCase && !options?.preserveRoot)) return text => text;
  const foldCase = options?.ignoreCase ?? /^[A-Za-z]:[\\/]|^\\\\/.test(previous);
  const variants = new Map<string, string>();
  const roots = options?.preserveRoot ? [trimRoot(options.preserveRoot), previous] : [previous];
  for (const root of roots) {
    for (const [source, target] of [
      [root, next],
      [root.replaceAll("\\", "/"), next.replaceAll("\\", "/")],
      [root.replaceAll("/", "\\"), next.replaceAll("/", "\\")],
    ] as const) {
      const pattern = foldCase ? source.toLowerCase() : source;
      if (!variants.has(pattern)) variants.set(pattern, target);
    }
  }
  const candidates = [...variants].sort(([a], [b]) => b.length - a.length);
  const alternatives = candidates.map(([pattern]) => pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const expression = new RegExp(alternatives.join("|"), foldCase ? "gi" : "g");
  return text => {
    const isEmbedded = pathContext(text);
    const leavesRoot = parentTraversal(text);
    return text.replace(expression, (match: string, offset: number) => {
      const before = text[offset - 1];
      if (before !== undefined && !/[\s"'`([{=:,|>]/.test(before)) return match;
      if (isEmbedded(offset)) return match;
      const comparable = foldCase ? match.toLowerCase() : match;
      // A longer current root may only share a filename prefix, or its suffix
      // may leave that root. Fall back to the old root within this original match.
      for (const [source, replacement] of candidates) {
        if (!comparable.startsWith(source)) continue;
        const after = text[offset + source.length];
        const endsAtSeparator = /[\\/]$/.test(source);
        if (!endsAtSeparator && after !== undefined && !/[\\/]/.test(after)) {
          const closing = before === "(" ? ")" : before === "[" ? "]" : before === "{" ? "}" : before;
          const wrappedEnd = before !== undefined && /["'`([{]/.test(before) && after === closing;
          if (!wrappedEnd) continue;
        }
        if (leavesRoot(offset + source.length)) continue;
        let target = replacement;
        if (!endsAtSeparator && after !== undefined && /[\\/]/.test(after) && /[\\/]$/.test(target)) {
          target = target.slice(0, -1);
        } else if (endsAtSeparator && after !== undefined && !/[\\/\s"'`)\]}:;,|<>]/.test(after) && !/[\\/]$/.test(target)) {
          target += source.at(-1);
        }
        return target + match.slice(source.length);
      }
      return match;
    });
  };
}

function pathContext(text: string): (offset: number) => boolean {
  const start = text.search(/\S/);
  const absoluteStart = /^(?:[\\/]|[A-Za-z]:[\\/])/;
  const absoluteValue = absoluteStart.test(text.slice(start));
  let scanned = 0;
  let quote: string | undefined;
  let quotedStart = -1;
  let escaped = false;
  return offset => {
    while (scanned < offset) {
      const character = text[scanned++]!;
      if (quote) {
        if (character === quote && !escaped) {
          quote = undefined;
          quotedStart = -1;
        }
        escaped = character === "\\" && !escaped;
      } else if (/["'`]/.test(character) && absoluteStart.test(text.slice(scanned))) {
        quote = character;
        quotedStart = scanned;
        escaped = false;
      }
    }
    if (absoluteValue && offset !== start) return true;
    if (quotedStart >= 0 && offset !== quotedStart) return true;
    for (let index = offset - 1; index >= 0 && !/[\s"'`([{=]/.test(text[index]!); index--) {
      if (/[\\/]/.test(text[index]!)) return true;
    }
    return false;
  };
}

function parentTraversal(text: string): (offset: number) => boolean {
  if (!text.includes("..")) return () => false;
  const ends = [...text.matchAll(/[\\/]/g)].map(match => match.index!);
  ends.push(text.length);
  const totals = [0];
  let start = 0;
  for (const end of ends) {
    totals.push(totals.at(-1)! + componentDepth(text.slice(start, end)));
    start = end + 1;
  }
  const minimum = [...totals];
  // A suffix minimum answers whether any later component escapes this root.
  // Build it once; repeated path mentions must not rescan the remaining text.
  for (let index = minimum.length - 2; index >= 0; index--) {
    minimum[index] = Math.min(minimum[index]!, minimum[index + 1]!);
  }
  return offset => {
    let low = 0;
    let high = ends.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (ends[middle]! < offset) low = middle + 1;
      else high = middle;
    }
    const firstDepth = componentDepth(text.slice(offset, ends[low]));
    return firstDepth < 0 || firstDepth + minimum[low + 1]! - totals[low + 1]! < 0;
  };
}

function componentDepth(component: string): number {
  if (/^\.\.(?:$|[\s"'`)\]}:;,|<>])/.test(component)) return -1;
  return component && component !== "." ? 1 : 0;
}

function trimRoot(value: string): string {
  const trimmed = value.trim();
  if (/^[A-Za-z]:[\\/]+$/.test(trimmed)) return trimmed.slice(0, 3);
  return trimmed.replace(/[\\/]+$/, "") || (trimmed.startsWith("/") ? "/" : trimmed.startsWith("\\") ? "\\" : "");
}
