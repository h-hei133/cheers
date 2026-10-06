import { Editor } from "../../presentation/tui/editor.js";
import { describe, expect, it } from "vitest";
import {
  couldBeFileReference,
  fileReferenceAt,
  fileSuggestions,
  rankFiles,
} from "./fileSuggestions.js";

describe("file references", () => {
  const files = ["README.md", "package.json", "src/core/model.ts", "src/core/policy.ts"];

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
    it("completes a quoted file in the middle without duplicating quotes or dropping prose", async () => {
      const editor = new Editor();
      editor.setText('查看 @"my f"  后缀👩‍💻');
      editor.move("doc-start");
      for (let count = 0; count < 9; count++) editor.move("right");
      const candidate = fileSuggestions(editor.getText(), [...files, "my file.ts"], editor.snapshot())?.[0];
      expect(candidate?.value).toBe("@my file.ts");
      expect(editor.replace(candidate!.edit!)).toBe(true);
      expect(editor.getText()).toBe('查看 @"my file.ts"  后缀👩‍💻');
    });

    it("names where the accepted value starts, so it replaces only the reference", async () => {
      const suggestions = fileSuggestions("please read @model", files);

      expect(suggestions?.[0]).toMatchObject({
        value: "@src/core/model.ts",
        // Accepting must not delete "please read ".
        edit: { from: 12, to: 18 },
      });
    });

    it("offers files for a bare sigil", async () => {
      const values = (fileSuggestions("read @", files) ?? []).map((s) => s.value);

      expect(values).toContain("@README.md");
      expect(values).toContain("@src/core/model.ts");
    });

    it("returns nothing when the draft holds no reference", async () => {
      expect(fileSuggestions("no sigil here", files)).toBeNull();
    });

    it("returns nothing when nothing matches the reference", async () => {
      expect(fileSuggestions("@zzzzz", files)).toBeNull();
    });
  });

});
