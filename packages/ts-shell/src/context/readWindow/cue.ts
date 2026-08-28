export function extractRequestedLineCount(prompt: string): number | undefined {
  const zh = prompt.match(
    /(?:前|读前|读取前|前面)\s*([0-9]+|[一二两三四五六七八九十百]+)\s*行/u,
  );
  if (zh?.[1]) {
    return parseLineCountToken(zh[1]);
  }
  const en = prompt.match(/first\s+([0-9]+)\s+lines?/i);
  if (en?.[1]) {
    return parseLineCountToken(en[1]);
  }
  const generic = prompt.match(
    /(?:read|读取|查看|看)\s*([0-9]+)\s*(?:lines?|行)/i,
  );
  if (generic?.[1]) {
    return parseLineCountToken(generic[1]);
  }
  return undefined;
}

export function extractContinuationReadLineCount(prompt: string): number | undefined {
  const zh = prompt.match(
    /(?:继续(?:读取|读|看)|接着(?:读取|读|看)|再读(?:后|下)?|继续读取后)\s*([0-9]+|[一二两三四五六七八九十百]+)\s*行/u,
  );
  if (zh?.[1]) {
    return parseLineCountToken(zh[1]);
  }
  const en = prompt.match(
    /(?:continue|next)\s+(?:read(?:ing)?\s+)?(?:next\s+)?([0-9]+)\s+lines?/i,
  );
  if (en?.[1]) {
    return parseLineCountToken(en[1]);
  }
  if (/(?:缁х画璇诲彇鍚庝袱琛|鍚庝袱琛)/u.test(prompt)) {
    return 2;
  }
  return undefined;
}

export function extractReadStartLine(prompt: string): number | undefined {
  const zh = prompt.match(
    /从第\s*([0-9]+|[一二两三四五六七八九十百]+)\s*行(?:开始|起)?/u,
  );
  if (zh?.[1]) {
    return parseLineCountToken(zh[1]);
  }
  const en = prompt.match(/(?:from|starting\s+at)\s+line\s+([0-9]+)/i);
  if (en?.[1]) {
    return parseLineCountToken(en[1]);
  }
  return undefined;
}

export function hasReadTailCue(prompt: string): boolean {
  return /(?:后\s*(?:[0-9]+|[一二两三四五六七八九十百]+)\s*行|最后\s*(?:[0-9]+|[一二两三四五六七八九十百]+)\s*行|last\s+[0-9]+\s+lines?|鍚庝袱琛)/iu.test(
    prompt,
  );
}

export function hasResetReadWindowCue(prompt: string): boolean {
  return /(?:重新(?:读取|读)|重读|re-?read|read again)/i.test(prompt);
}

export function hasImplicitReadContinuationCue(prompt: string): boolean {
  return /(?:继续读(?:下一段)?|再读一段|接着读一段|继续读取|go on reading|continue reading(?:\s+(?:it|this|that))?|read on|read next chunk|next chunk)/i.test(
    prompt,
  );
}

export function hasLocalSliceExplainCue(prompt: string): boolean {
  return /(?:这部分|这一段|这段|刚才那段|that part|this part|this section|that section|local section)/i.test(
    prompt,
  );
}

export function isReflectiveExplainContinuationPrompt(prompt: string): boolean {
  return /(?:continue explaining that part|继续解释这部分)/i.test(prompt);
}

export function isRepairContinuationFollowUpPrompt(prompt: string): boolean {
  return /(?:\bcontinue fixing(?:\s+that)?\b|\bthen continue(?:\s+fixing)?\b|\bwhy did it stop[^\n]*continue\b|\bwhat should we do next[^\n]*continue fixing\b|刚才为什么停了.*继续修|那继续修|继续修这个|就按刚才那个继续修|按这个继续修|那就按这个继续修)/i.test(
    prompt,
  );
}

export function parseLineCountToken(token: string): number | undefined {
  const normalized = token.trim();
  if (normalized.length === 0) {
    return undefined;
  }
  if (/^\d+$/.test(normalized)) {
    const value = Number.parseInt(normalized, 10);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
  const value = parseChineseNumber(normalized);
  return value > 0 ? value : undefined;
}

export function parseChineseNumber(token: string): number {
  const normalized = token.replace(/\s+/g, "");
  if (normalized.length === 0) {
    return 0;
  }
  const digitMap: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (normalized === "十") {
    return 10;
  }
  if (normalized.includes("十")) {
    const parts = normalized.split("十");
    const tensPart = parts[0] ?? "";
    const onesPart = parts[1] ?? "";
    const tens = tensPart.length === 0 ? 1 : (digitMap[tensPart] ?? 0);
    const ones = onesPart.length === 0 ? 0 : (digitMap[onesPart] ?? 0);
    return tens * 10 + ones;
  }
  if (normalized.includes("百")) {
    const parts = normalized.split("百");
    const hundredsPart = parts[0] ?? "";
    const restPart = parts[1] ?? "";
    const hundreds =
      hundredsPart.length === 0 ? 1 : (digitMap[hundredsPart] ?? 0);
    if (restPart.length === 0) {
      return hundreds * 100;
    }
    return hundreds * 100 + parseChineseNumber(restPart);
  }
  return digitMap[normalized] ?? 0;
}
