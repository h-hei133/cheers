import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  couldBeFileReference,
  fileReferenceAt,
  fileSuggestions,
  invalidateWorkspaceFiles,
  rankFiles,
  warmWorkspaceFiles,
  workspaceFiles,
} from "./fileSuggestions.js";

/**
 * `@` file references.
 *
 * Two things decide whether this is usable: when a reference is recognized at
 * all, and whether the listing is cheap enough to run on every keystroke. The
 * first is the rule below; the second is the cache, which is why the walk happens
 * once per workspace rather than once per character.
 */
describe("file references", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "file-suggestions-"));
    fs.mkdirSync(path.join(workspace, "src", "core"), { recursive: true });
    fs.writeFileSync(path.join(workspace, "src", "core", "model.ts"), "x");
    fs.writeFileSync(path.join(workspace, "src", "core", "policy.ts"), "x");
    fs.writeFileSync(path.join(workspace, "README.md"), "x");
    fs.writeFileSync(path.join(workspace, "package.json"), "x");
    invalidateWorkspaceFiles();
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
    invalidateWorkspaceFiles();
  });

  describe("recognizing a reference", () => {
    it("opens at the start of the draft", () => {
      expect(fileReferenceAt("@src")).toEqual({ query: "src", start: 0 });
    });

    it("opens after whitespace, so a reference can sit inside a sentence", () => {
      expect(fileReferenceAt("look at @src/co")).toEqual({ query: "src/co", start: 8 });
    });

    it("does not open inside a word", () => {
      // An email address, a decorator, a URL with credentials: offering a file
      // list over these is noise on ordinary text.
      expect(fileReferenceAt("mail me a@b")).toBeNull();
    });

    it("does not treat a doubled sigil as a reference", () => {
      // The second `@` follows a character rather than whitespace, so it is part
      // of a word — the same rule that keeps an email address out.
      expect(fileReferenceAt("@@a")).toBeNull();
    });

    it("closes once the reference is finished with a space", () => {
      expect(fileReferenceAt("see @src/core/model.ts and")).toBeNull();
    });

    it("reports whether the draft could still become a reference", () => {
      expect(couldBeFileReference("a @src")).toBe(true);
      expect(couldBeFileReference("no reference here")).toBe(false);
    });
  });

  describe("ranking", () => {
    it("puts an exact file name first", () => {
      expect(rankFiles("model.ts", ["src/core/model.ts", "model.ts"]).map((s) => s.value)).toEqual([
        "@model.ts",
        "@src/core/model.ts",
      ]);
    });

    it("matches a later path segment, which a whole-string prefix never would", () => {
      const values = rankFiles("model", ["src/core/model.ts", "docs/readme.md"]).map((s) => s.value);
      expect(values).toEqual(["@src/core/model.ts"]);
    });

    it("ranks a final-segment prefix above a match in the middle of a path", () => {
      const values = rankFiles("po", ["src/core/policy.ts", "src/core/model.ts"]).map((s) => s.value);
      expect(values).toEqual(["@src/core/policy.ts"]);
    });

    it("returns nothing when nothing matches", () => {
      expect(rankFiles("zzzz", ["src/core/model.ts"])).toEqual([]);
    });

    it("splits the file name from its directory for display", () => {
      expect(rankFiles("model", ["src/core/model.ts"])[0]).toMatchObject({
        label: "model.ts",
        detail: "src/core",
      });
    });

    it("shows a root-level file without a directory", () => {
      expect(rankFiles("readme", ["README.md"])[0]).toMatchObject({
        label: "README.md",
        detail: undefined,
      });
    });
  });

  describe("suggestions for a draft", () => {
    it("names where the accepted value starts, so it replaces only the reference", async () => {
      await warmWorkspaceFiles(workspace);
      const suggestions = fileSuggestions("please read @model", workspace);

      expect(suggestions?.[0]).toMatchObject({
        value: "@src/core/model.ts",
        // Accepting must not delete "please read ".
        from: 12,
      });
    });

    it("offers files for a bare sigil", async () => {
      await warmWorkspaceFiles(workspace);
      const values = (fileSuggestions("read @", workspace) ?? []).map((s) => s.value);

      expect(values).toContain("@README.md");
      expect(values).toContain("@src/core/model.ts");
    });

    it("returns nothing when the draft holds no reference", async () => {
      await warmWorkspaceFiles(workspace);
      expect(fileSuggestions("no sigil here", workspace)).toBeNull();
    });

    it("returns nothing when nothing matches the reference", async () => {
      await warmWorkspaceFiles(workspace);
      expect(fileSuggestions("@zzzzz", workspace)).toBeNull();
    });
  });

  describe("the listing", () => {
    it("walks the workspace once, not once per keystroke", async () => {
      await warmWorkspaceFiles(workspace);
      // Two different queries, one listing: the second must not trigger a walk
      // whose result could differ from the one already held.
      const first = fileSuggestions("@model", workspace);
      const second = fileSuggestions("@policy", workspace);

      expect(first?.[0]?.value).toBe("@src/core/model.ts");
      expect(second?.[0]?.value).toBe("@src/core/policy.ts");
    });

    it("re-walks after the cache is invalidated, so /reload sees new files", async () => {
      await warmWorkspaceFiles(workspace);
      expect(fileSuggestions("@brand-new", workspace)).toBeNull();

      fs.writeFileSync(path.join(workspace, "brand-new.ts"), "x");
      invalidateWorkspaceFiles();
      await warmWorkspaceFiles(workspace);

      expect(fileSuggestions("@brand-new", workspace)?.[0]?.value).toBe("@brand-new.ts");
    });

    it("keeps a listing for each workspace, not just the last one asked about", async () => {
      // Subagent and worktree sessions reach the same process, so two roots is
      // ordinary. A single slot meant the second workspace evicted the first, and
      // completion in the first fell back to an empty list until its walk ran
      // again.
      const other = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-suggest-"));
      fs.mkdirSync(path.join(other, "src"), { recursive: true });
      fs.writeFileSync(path.join(other, "src", "elsewhere.ts"), "x");

      await warmWorkspaceFiles(workspace);
      await warmWorkspaceFiles(other);

      // The first workspace must still answer from its own listing.
      expect(fileSuggestions("@policy", workspace)?.[0]?.value).toBe("@src/core/policy.ts");
      expect(fileSuggestions("@elsewhere", other)?.[0]?.value).toBe("@src/elsewhere.ts");
    });

    it("drops every workspace's listing when invalidated", async () => {
      await warmWorkspaceFiles(workspace);
      invalidateWorkspaceFiles();
      // Nothing is held, so the first synchronous call reports nothing yet and
      // must not claim a listing it no longer has.
      expect(workspaceFiles(workspace)).toEqual([]);
    });
  });
});
