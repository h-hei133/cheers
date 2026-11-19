const MODIFIERS = ["ctrl", "alt", "shift", "meta"] as const;

/** Normalize an authored key to the modifier order and spelling emitted by the terminal parser. */
export function normalizeKey(key: string): string | undefined {
  const raw = key.trim().toLowerCase();
  if (raw === "") return undefined;
  // A final plus can itself be the base key, as in "+" and "ctrl++".
  const trailingPlus = raw === "+" || raw.endsWith("++");
  const body = trailingPlus ? raw.slice(0, -1) : raw;
  const segments = body.split("+").map(part => part.trim()).filter(part => part !== "");
  const name = trailingPlus ? "+" : segments.pop();
  if (!name || (MODIFIERS as readonly string[]).includes(name)) return undefined;
  if (segments.some(part => !(MODIFIERS as readonly string[]).includes(part))) return undefined;
  return [...MODIFIERS.filter(modifier => segments.includes(modifier)), name].join("+");
}
