import path from "node:path";

const ABSOLUTE = String.raw`(?:file:\/\/|[a-z]:[\\/]|\\\\|\/)`;
const QUOTED = new RegExp(`(["'\x60])(${ABSOLUTE}[^\\r\\n]*?)\\1`, "gi");
const FRAME = new RegExp(`\\((${ABSOLUTE}[^\\r\\n]*?:\\d+(?::\\d+)?)\\)`, "gi");
const ANONYMOUS_FRAME = new RegExp(`(^[\\t ]*at\\s+(?:async\\s+)?)(${ABSOLUTE}[^\\r\\n]*?:\\d+(?::\\d+)?)(?=\\r?$)`, "gmi");
const BARE = new RegExp(`(^|[\\s(=\\[{},]|:(?!//))(${ABSOLUTE}[^\\s)\\]"'\x60,;]+)`, "gi");

/** Scrub machine prefixes while retaining source locations in report text. */
export function redactReportPaths(value: string, projectRoot: string): string {
  return value
    .replace(QUOTED, (_match, quote: string, location: string) => `${quote}${safeLocation(location, projectRoot)}${quote}`)
    .replace(FRAME, (_match, location: string) => `(${safeLocation(location, projectRoot)})`)
    .replace(ANONYMOUS_FRAME, (_match, prefix: string, location: string) => `${prefix}${safeLocation(location, projectRoot)}`)
    .replace(BARE, (_match, prefix: string, location: string) => `${prefix}${safeLocation(location, projectRoot)}`);
}

function safeLocation(location: string, projectRoot: string): string {
  const suffix = location.match(/:\d+(?::\d+)?$/)?.[0] ?? "";
  let file = suffix ? location.slice(0, -suffix.length) : location;
  if (/^file:\/\//i.test(file)) {
    try {
      const url = new URL(file);
      // Encoded separators are invalid in file paths. Decoding them could also
      // introduce another absolute path that was never inspected as a location.
      if (/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(url.pathname)) return `[path]${suffix}`;
      file = `${url.hostname ? `//${url.hostname}` : ""}${decodeURIComponent(url.pathname)}`;
      // A drive-letter file URL has an extra slash before its drive.
      file = file.replace(/^\/([a-z]:\/)/i, "$1");
    } catch {
      return `[path]${suffix}`;
    }
  }
  const windows = /^(?:[a-z]:[\\/]|\\\\|\/\/)/i.test(file);
  const paths = windows ? path.win32 : path.posix;
  const normalized = paths.normalize(file);
  const relative = paths.relative(projectRoot, normalized);
  const sameStyle = windows === /^(?:[a-z]:[\\/]|\\\\|\/\/)/i.test(projectRoot);
  const inProject = sameStyle && paths.isAbsolute(projectRoot)
    && relative !== ".." && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative);
  return inProject
    ? `[project]${relative ? `/${relative.split(paths.sep).join("/")}` : ""}${suffix}`
    : `[external]/${paths.basename(normalized)}${suffix}`;
}
