/** Line-level diff classification and terminal-safe display helpers. */

export function isFileHeaderLine(lines: readonly string[], index: number, inHunk = false): boolean {
  const line = lines[index] ?? "";
  if (line.startsWith("--- ")) return isHeaderPair(line, lines[index + 1], inHunk);
  if (line.startsWith("+++ ")) return isHeaderPair(lines[index - 1], line, inHunk);
  return false;
}

function isHeaderPair(oldLine: string | undefined, newLine: string | undefined, inHunk: boolean): boolean {
  if (!oldLine?.startsWith("--- ") || !newLine?.startsWith("+++ ")) return false;
  if (inHunk) return false;
  const oldPath = oldLine.slice(4);
  const newPath = newLine.slice(4);
  return (oldPath.startsWith("a/") && newPath.startsWith("b/"))
    || oldPath === "/dev/null" || newPath === "/dev/null"
    || (!inHunk && isUnprefixedHeaderPath(oldPath) && isUnprefixedHeaderPath(newPath));
}

function isUnprefixedHeaderPath(value: string): boolean {
  const path = value.trimEnd();
  if (!path || path.startsWith("-") || path.startsWith("+")) return false;
  if (/^".+"$/.test(path)) return true;
  const timestamp = path.indexOf("\t");
  if (timestamp >= 0) return timestamp > 0;
  return !/\s/.test(path);
}

export function lineByteLength(lines: readonly string[], index: number): number {
  return Buffer.byteLength(lines[index]!, "utf8") + (index + 1 < lines.length ? 1 : 0);
}

export function displayLine(lines: readonly string[], index: number): string {
  const raw = lines[index] ?? "";
  const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
  let output = "";
  for (const character of line) {
    const code = character.codePointAt(0) ?? 0;
    const control = code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)
      || code === 0x2028 || code === 0x2029;
    output += control
      ? `\\x${code.toString(16).padStart(2, "0")}`
      : character;
  }
  return output;
}

export function lineEndingKind(text: string): "LF" | "CRLF" | "CR" | "mixed" | "none" {
  let lf = 0;
  let crlf = 0;
  let cr = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "\r") {
      if (text[index + 1] === "\n") {
        crlf++;
        index++;
      } else {
        cr++;
      }
    } else if (text[index] === "\n") {
      lf++;
    }
  }
  const kinds = [lf, crlf, cr].filter(count => count > 0).length;
  if (kinds > 1) return "mixed";
  if (crlf > 0) return "CRLF";
  if (cr > 0) return "CR";
  return lf > 0 ? "LF" : "none";
}

export function endsWithLineBreak(text: string): boolean {
  return /(?:\r\n|\r|\n)$/.test(text);
}
