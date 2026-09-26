import { describe, it, expect } from "vitest";
import {
  MAX_SEARCHED_FILE_BYTES,
  formatRipgrepMatch,
  parseRipgrepJson,
  ripgrepArgs,
  searchWithRipgrep,
  type RipgrepSearchInput,
} from "./grepRipgrep.js";

const base: RipgrepSearchInput = {
  pattern: "needle",
  searchPath: "",
  limit: 100,
  workspaceRoot: "/workspace",
};

/** One ripgrep JSON record, as the real stream writes it. */
const matchRecord = (path: string, lineNumber: number, text: string): string =>
  JSON.stringify({
    type: "match",
    data: { path: { text: path }, lines: { text }, line_number: lineNumber },
  });

describe("ripgrep-backed grep", () => {
  describe("argv", () => {
    it("asks for JSON with hidden files included", () => {
      const args = ripgrepArgs(base);
      // JSON because the plain `path:line:text` form cannot be split: a filename
      // may contain a colon, and ripgrep omits the filename entirely for a
      // single-file search.
      expect(args).toContain("--json");
      // Hidden files because the in-process walk reads them. Without this the
      // two paths would search different file sets and the fallback would
      // silently answer a different question.
      expect(args).toContain("--hidden");
      expect(args).toContain("--color=never");
    });

    it("prunes the directories the in-process walk prunes", () => {
      const args = ripgrepArgs(base);
      for (const directory of ["node_modules", ".git", "dist", ".normproof"]) {
        expect(args).toContain(`!${directory}`);
      }
    });

    it("passes the caller's glob and case flag through", () => {
      const args = ripgrepArgs({ ...base, glob: "*.ts", ignoreCase: true });
      expect(args).toContain("*.ts");
      expect(args).toContain("--ignore-case");
    });

    it("matches globs case-insensitively, as the in-process walk does", () => {
      // The walk compiles its matcher with `nocase`, so `*.ts` finds `File.TS`
      // there. ripgrep's glob is case-sensitive by default, which made the two
      // paths answer a different question for the same filter. Verified against
      // `rg 15.1.0`, where the flag exists; the fallback covers an older `rg`.
      const args = ripgrepArgs({ ...base, glob: "*.ts" });
      expect(args).toContain("--glob-case-insensitive");
    });

    it("does not force a glob flag when no glob was given", () => {
      // Nothing to make case-insensitive, and an unused flag would only be noise
      // in a command a user may read in a receipt.
      expect(ripgrepArgs(base)).not.toContain("--glob-case-insensitive");
    });

    it("caps the file size at the same limit the in-process walk uses", () => {
      // The walk skips files over the cap; without this flag ripgrep would search
      // them, so the fast path would report hits inside files the fallback never
      // reads. Measured before the fix: an 11MB file matched through ripgrep and
      // not through the walk.
      const args = ripgrepArgs(base);
      const flag = args.indexOf("--max-filesize");
      expect(flag).toBeGreaterThanOrEqual(0);
      expect(args[flag + 1]).toBe(`${MAX_SEARCHED_FILE_BYTES}`);
    });

    it("separates the pattern from the flags", () => {
      const args = ripgrepArgs({ ...base, pattern: "-starts-with-dash" });
      // Without `--` a pattern beginning with a dash would be read as a flag.
      expect(args[args.indexOf("--") + 1]).toBe("-starts-with-dash");
    });

    it("searches the workspace root when no path was given", () => {
      expect(ripgrepArgs(base).at(-1)).toBe(".");
      expect(ripgrepArgs({ ...base, searchPath: "src" }).at(-1)).toBe("src");
    });
  });

  describe("parsing", () => {
    it("reads matches out of the JSON stream", () => {
      const stream = [
        JSON.stringify({ type: "begin", data: { path: { text: "a.ts" } } }),
        matchRecord("a.ts", 12, "const needle = 1;\n"),
        JSON.stringify({ type: "end", data: { path: { text: "a.ts" } } }),
      ].join("\n");

      expect(parseRipgrepJson(stream, 100)).toEqual([
        { path: "a.ts", lineNumber: 12, line: "const needle = 1;" },
      ]);
    });

    it("keeps a filename containing a colon intact", () => {
      const stream = matchRecord("weird:name.ts", 3, "needle\n");
      // The reason for JSON: this path is not recoverable from `path:line:text`.
      expect(parseRipgrepJson(stream, 10)[0]?.path).toBe("weird:name.ts");
    });

    it("stops at the limit", () => {
      const stream = [1, 2, 3, 4, 5].map((n) => matchRecord("a.ts", n, `needle ${n}\n`)).join("\n");
      expect(parseRipgrepJson(stream, 2)).toHaveLength(2);
    });

    it("ignores records it cannot read instead of losing the rest", () => {
      const stream = ["{ not json", matchRecord("a.ts", 1, "needle\n"), ""].join("\n");
      expect(parseRipgrepJson(stream, 10)).toHaveLength(1);
    });

    it("drops a match record whose fields are the wrong shape", () => {
      const stream = JSON.stringify({ type: "match", data: { path: { text: "a.ts" } } });
      expect(parseRipgrepJson(stream, 10)).toEqual([]);
    });

    it("answers with nothing for an empty stream", () => {
      expect(parseRipgrepJson("", 10)).toEqual([]);
    });
  });

  describe("formatting", () => {
    it("reports path, line and text", () => {
      expect(formatRipgrepMatch({ path: "a.ts", lineNumber: 4, line: "code" }, 500)).toBe(
        "a.ts:4: code",
      );
    });

    it("cuts a long line through the same helper the in-process path uses", () => {
      const long = "x".repeat(600);
      const formatted = formatRipgrepMatch({ path: "a.ts", lineNumber: 1, line: long }, 500);
      // Both search paths must report a long line identically, or the fallback
      // would be visible in the transcript.
      expect(formatted).toContain("[truncated]");
      expect(formatted.length).toBeLessThan(long.length);
    });
  });

  describe("workspace containment", () => {
    it("refuses a search path that resolves outside the workspace", () => {
      // `path` is model-supplied and the leading-separator strip does not remove a
      // traversal in the middle, so `foo/../../elsewhere` resolved outside the
      // root and the fast path read files the session was never given access to.
      // Refusing here is what keeps the fast path no less safe than the walk.
      const outcome = searchWithRipgrep({
        ...base,
        pattern: "secret",
        searchPath: "foo/../../elsewhere",
        workspaceRoot: "/workspace",
      });
      expect(outcome.ok).toBe(false);
      if (outcome.ok === false) expect(outcome.reason).toBe("outside-workspace");
    });

    it("accepts a search path that stays inside the workspace", () => {
      // Reaches the real `rg`, so the assertion is on the refusal reason rather
      // than on a match: what matters is that containment did not reject it.
      const outcome = searchWithRipgrep({
        ...base,
        pattern: "needle",
        searchPath: "src",
        workspaceRoot: process.cwd(),
      });
      if (outcome.ok === false) expect(outcome.reason).not.toBe("outside-workspace");
    });
  });
});
