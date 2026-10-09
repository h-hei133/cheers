const MAX_PAGES = 100;
const MAX_ITEMS = 10_000;
const MAX_BYTES = 4 * 1024 * 1024;

/** Publish only complete, bounded catalogs. Opaque cursors are never interpreted. */
export async function readMcpPages<T>(
  read: (cursor: string | undefined) => Promise<{ items: T[]; nextCursor?: string }>,
  identity: (item: T) => string,
): Promise<T[]> {
  const items: T[] = [];
  const cursors = new Set<string>();
  const identities = new Set<string>();
  let cursor: string | undefined;
  let bytes = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await read(cursor);
    bytes += Buffer.byteLength(JSON.stringify(result));
    if (bytes > MAX_BYTES || items.length + result.items.length > MAX_ITEMS) throw new Error("MCP catalog exceeds size limit");
    for (const item of result.items) {
      const key = identity(item);
      if (!key || identities.has(key)) throw new Error("MCP catalog contains an empty or duplicate identity");
      identities.add(key);
      items.push(item);
    }
    cursor = result.nextCursor;
    if (cursor === undefined) return items;
    if (!cursor || cursors.has(cursor)) throw new Error("MCP catalog repeated an invalid cursor");
    cursors.add(cursor);
  }
  throw new Error("MCP catalog exceeds page limit");
}
