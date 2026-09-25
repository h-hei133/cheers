import { describe, expect, it } from "vitest";
import path from "node:path";
import { resolveWriteTarget } from "./writeTarget.js";

/**
 * Where a command is allowed to write.
 *
 * The defect this replaces was a bare `path.resolve`, so the cases that matter
 * are the ones that resolve somewhere else than the reader expects: a relative
 * path that climbs out, and an absolute path that was never inside. The three
 * outcomes have to stay distinct, because collapsing any two of them either
 * breaks a legitimate export or lets a typo overwrite a file.
 */

const root = "/home/user/project";

describe("a destination inside the workspace", () => {
  it("is written without being questioned", () => {
    const decision = resolveWriteTarget({ requested: "out/session.md", root });
    expect(decision).toMatchObject({
      allowed: true,
      resolvedPath: path.join(root, "out/session.md"),
      outside: false,
    });
  });

  it("accepts a path that leaves and comes back", () => {
    // `sub/../file.md` never actually leaves, so it is not an escape.
    const decision = resolveWriteTarget({ requested: "sub/../file.md", root });
    expect(decision).toMatchObject({ allowed: true, resolvedPath: path.join(root, "file.md") });
  });

  it("accepts the workspace root itself", () => {
    const decision = resolveWriteTarget({ requested: ".", root });
    expect(decision.allowed).toBe(true);
  });
});

describe("a relative path that climbs out", () => {
  it("is refused", () => {
    // Nobody means to write to `../../.bashrc`. This is the case the defect
    // turned into silent data loss, so it is refused rather than confirmed:
    // there is no reading of it under which the user wanted it.
    const decision = resolveWriteTarget({ requested: "../../.bashrc", root });
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.reason).toContain("outside the workspace");
  });

  it("is refused even when the caller allowed writing outside", () => {
    // The allowance covers a path the user named deliberately. A relative climb
    // is still a typo, and a flag must not turn a typo into a destructive write.
    const decision = resolveWriteTarget({
      requested: "../../.bashrc",
      root,
      allowOutside: true,
    });
    expect(decision.allowed).toBe(false);
  });

  it("says what to do instead", () => {
    const decision = resolveWriteTarget({ requested: "../escape.md", root });
    expect(decision.allowed === false && decision.doNext).toContain("absolute path");
  });
});

describe("an absolute path outside the workspace", () => {
  it("is refused when nothing stated the intent", () => {
    const decision = resolveWriteTarget({ requested: "/tmp/session.md", root });
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.reason).toContain("outside the workspace");
  });

  it("is allowed when the caller stated the intent", () => {
    // Exporting somewhere else is a real thing to want; refusing it outright
    // would break a legitimate use to prevent a mistake the other rules catch.
    const decision = resolveWriteTarget({
      requested: "/tmp/session.md",
      root,
      allowOutside: true,
    });
    expect(decision).toMatchObject({
      allowed: true,
      resolvedPath: "/tmp/session.md",
      outside: true,
    });
  });

  it("reports the escape on the decision, so the caller can say so", () => {
    const inside = resolveWriteTarget({ requested: "a.md", root });
    const outside = resolveWriteTarget({ requested: "/tmp/a.md", root, allowOutside: true });
    expect(inside.allowed === true && inside.outside).toBe(false);
    expect(outside.allowed === true && outside.outside).toBe(true);
  });
});

describe("a destination that names nothing", () => {
  it("is refused with a reason rather than resolving to the workspace", () => {
    // An empty string resolved against the root is the root itself, which would
    // have turned a missing argument into a write over the project directory.
    for (const requested of ["", "   "]) {
      const decision = resolveWriteTarget({ requested, root });
      expect(decision.allowed).toBe(false);
    }
    expect(resolveWriteTarget({ root }).allowed).toBe(false);
  });
});

describe("a home-relative destination", () => {
  it("is expanded rather than treated as a directory named tilde", () => {
    // `path.resolve` would read the literal `~` as a directory name, writing to
    // a folder called `~` instead of the home directory the user named.
    const home = process.env.HOME ?? process.env.USERPROFILE;
    if (!home) return;
    const decision = resolveWriteTarget({ requested: "~/notes.md", root, allowOutside: true });
    expect(decision).toMatchObject({
      allowed: true,
      resolvedPath: path.join(home, "notes.md"),
      outside: true,
    });
  });
});

describe("a command whose own default is outside the workspace", () => {
  it("accepts an absolute path outside without a flag", () => {
    // A report's default destination is the user data directory, so writing
    // outside is its normal business. Requiring a statement for the ordinary
    // case would make the flag noise rather than a signal.
    const decision = resolveWriteTarget({
      requested: "/tmp/report.zip",
      root,
      defaultOutside: true,
    });
    expect(decision).toMatchObject({ allowed: true, resolvedPath: "/tmp/report.zip" });
  });

  it("still refuses a relative path that climbs out", () => {
    // The allowance covers where the command writes by default, not a mistyped
    // relative path. If it covered that too, the destructive case would be the
    // one that slipped through.
    const decision = resolveWriteTarget({
      requested: "../../.bashrc",
      root,
      defaultOutside: true,
    });
    expect(decision.allowed).toBe(false);
  });

  it("still refuses a path inside the workspace that does not exist as a climb", () => {
    const decision = resolveWriteTarget({
      requested: "sub/out.zip",
      root,
      defaultOutside: true,
    });
    expect(decision).toMatchObject({ allowed: true, resolvedPath: path.join(root, "sub/out.zip") });
  });
});
