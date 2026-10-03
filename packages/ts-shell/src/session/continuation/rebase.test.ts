import { describe, expect, it } from "vitest";
import path from "node:path";
import { rebasePathValues } from "./rebase.js";

describe("stored path relocation", () => {
  it.each([
    ["/repo", "/repo/next", "/repo/file", "/repo/next/file"],
    ["/repo/", "/Next/", "/repo/file", "/Next/file"],
    ["/repo", "/", "/repo/file", "/file"],
    ["/", "/Next", "/file", "/Next/file"],
    ["/", "/Next", "root: / ", "root: /Next "],
    ["C:\\Repo", "D:\\Next", "C:\\Repo\\file", "D:\\Next\\file"],
    ["C:\\Repo", "D:\\Next", "c:\\rEpO\\file", "D:\\Next\\file"],
    ["C:\\Repo", "D:\\", "C:\\Repo\\file", "D:\\file"],
    ["C:\\", "D:\\Next", "C:\\file", "D:\\Next\\file"],
    ["C:\\", "D:\\Next", "C:relative", "C:relative"],
    ["C:\\Repo", "D:\\", "C:\\Repo", "D:\\"],
    ["/a[1]", "/B$1", "(/a[1]/file)", "(/B$1/file)"],
    ["/repo", "/Next", "/REPO/file", "/REPO/file"],
    ["/repo", "/repo/next", "/repo/../outside/file", "/repo/../outside/file"],
    ["/repo", "/repo/next", "/repo/a/../../outside/file", "/repo/a/../../outside/file"],
    ["/repo", "/Next", "/repo/a/../file", "/Next/a/../file"],
    ["/repo", "/repo/next", "/repo/a b/../../outside/file", "/repo/a b/../../outside/file"],
    ["/repo", "/repo/next", '"/repo/a b/../../outside/file"', '"/repo/a b/../../outside/file"'],
    ["/repo", "/repo/next", "/repo/a)b/../../outside/file", "/repo/a)b/../../outside/file"],
    ["/repo", "/repo/next", '"/repo/a/../.."', '"/repo/a/../.."'],
    ["/repo", "/Next", '"/repo other/file"', '"/repo other/file"'],
    ["/repo", "/Next", "/repo other/file", "/repo other/file"],
    ["/repo", "/Next", "/repo:other/file", "/repo:other/file"],
    ["/repo", "/Next", '"/repo|other/file"', '"/repo|other/file"'],
    ["/repo", "/Next", "/repo|other/file", "/repo|other/file"],
    ["/repo", "/Next", "/outer:/repo/file", "/outer:/repo/file"],
    ["/repo", "/Next", 'read "/outer folder /repo/file"', 'read "/outer folder /repo/file"'],
    ["/repo", "/Next", `read "/outer's folder /repo/file"`, `read "/outer's folder /repo/file"`],
    ["/repo", "/Next", `read '/outer"s folder /repo/file'`, `read '/outer"s folder /repo/file'`],
    ["/repo", "/Next", String.raw`read "/outer\"s folder /repo/file"`, String.raw`read "/outer\"s folder /repo/file"`],
    ["/repo", "/Next", '"/repo"', '"/Next"'],
    ["/repo", "/Next", "target(/repo)", "target(/Next)"],
  ])("moves %s to %s without recursive replacement", (previous, next, value, expected) => {
    expect(rebasePathValues(value, previous, next)).toBe(expected);
  });

  it("preserves component boundaries and recognizes stored path delimiters", () => {
    const text = 'Paths: /repo-other /outer/repo /repo.file "/repo/a" target:/repo/b /repo|read (/repo/c)';
    expect(rebasePathValues(text, "/repo", "/Next")).toBe(
      'Paths: /repo-other /outer/repo /repo.file "/Next/a" target:/Next/b /repo|read (/Next/c)',
    );
  });

  it.each([
    ["/old/next-other/a.ts", "/old/next/next-other/a.ts"],
    ["/old/next.txt", "/old/next/next.txt"],
    ["/old/next/../a.ts", "/old/next/next/../a.ts"],
    ["/old/next/a.ts", "/old/next/a.ts"],
    ["/old/next/../../outside", "/old/next/../../outside"],
  ])("selects the longest contained root for a current cache target: %s", (target, expected) => {
    expect(rebasePathValues(`read:target:${target}`, "/old", "/old/next", {
      ignoreCase: true,
      preserveRoot: "/old/next",
    })).toBe(`read:target:${expected}`);
  });

  it("retains the original value when no path changed", () => {
    const value = { target: "/elsewhere/file", nested: ["/repo-other"] };
    expect(rebasePathValues(value, "/repo", "/Next")).toBe(value);
  });

  it("handles deep shared and cyclic data without mutating it", () => {
    const leaf = { target: "/repo/file" };
    const root: Record<string, unknown> = { leaf, same: leaf };
    let cursor = root;
    for (let i = 0; i < 12000; i++) {
      const child: Record<string, unknown> = {};
      cursor.child = child;
      cursor = child;
    }
    cursor.root = root;
    const result = rebasePathValues(root, "/repo", "/Next") as typeof root;
    expect(result.leaf).toEqual({ target: "/Next/file" });
    expect(result.same).toBe(result.leaf);
    let moved = result;
    for (let i = 0; i < 12000; i++) moved = moved.child as typeof root;
    expect(moved.root).toBe(result);
    expect(leaf.target).toBe("/repo/file");
    expect(cursor.root).toBe(root);
  });

  it("preserves an own __proto__ entry without changing object prototypes", () => {
    const source = JSON.parse('{"__proto__":{"target":"/repo/file"}}');
    const moved = rebasePathValues(source, "/repo", "/Next") as Record<string, unknown>;
    expect(Object.getPrototypeOf(moved)).toBe(Object.prototype);
    expect(Object.hasOwn(moved, "__proto__")).toBe(true);
    expect(moved.__proto__).toEqual({ target: "/Next/file" });
  });

  it("keeps every traversed prefix inside the source root", () => {
    const components = ["dir", "..", ".", "file space"];
    for (let sample = 0; sample < 256; sample++) {
      let value = "/repo";
      let escaped = false;
      for (let digit = 0; digit < 4; digit++) {
        value += `/${components[(sample >>> (digit * 2)) & 3]}`;
        const relative = path.posix.relative("/repo", path.posix.resolve(value));
        escaped ||= relative === ".." || relative.startsWith("../");
      }
      expect(rebasePathValues(value, "/repo", "/Next")).toBe(escaped ? value : `/Next${value.slice(5)}`);
    }
  });

  it("relocates every path in a large string containing parent components", () => {
    const text = "read /repo/dir/../file; ".repeat(5000);
    expect(rebasePathValues(text, "/repo", "/Next")).toBe("read /Next/dir/../file; ".repeat(5000));
  });
});
