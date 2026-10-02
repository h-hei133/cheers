import fs from "node:fs";

/** A missing file is distinct from a rejected, oversized, or unreadable file. */
export function readReceiptFile(filePath: string, maxBytes: number):
  | { readonly status: "read"; readonly content: string }
  | { readonly status: "missing" | "unavailable" } {
  let fd: number;
  try {
    fd = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
  } catch (error) {
    return { status: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unavailable" };
  }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > maxBytes) return { status: "unavailable" };
    const bytes = Buffer.alloc(maxBytes + 1);
    let count = 0;
    while (count < bytes.length) {
      const read = fs.readSync(fd, bytes, count, bytes.length - count, null);
      if (read === 0) break;
      count += read;
    }
    if (count > maxBytes) return { status: "unavailable" };
    return { status: "read", content: new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, count)) };
  } catch {
    return { status: "unavailable" };
  } finally {
    fs.closeSync(fd);
  }
}
