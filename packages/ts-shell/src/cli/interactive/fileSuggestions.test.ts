import { Editor } from "../../presentation/tui/editor.js";
import { describe, expect, it } from "vitest";
import { tokenizeCommandArgs } from '../../core/commands/arguments.js';
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

    it.each(["Let's inspect ", "Users' notes\n", "--author=O'Brien ", "'Twas ready "])(
      'keeps prose apostrophes outside a later reference: %s', prefix => {
        const text = prefix + '@src/mo';
        expect(fileReferenceAt(text)).toEqual({ query: 'src/mo', start: prefix.length });
        expect(couldBeFileReference(text)).toBe(true);
      });

    it.each(["@src/O'Brien", '@"src/O\'Brien"', "@'src/OBrien'", '@src/my\\ file'])(
      'decodes only actual reference quote/escape spans: %s', reference => {
        const prefix = "Let's inspect ";
        const text = prefix + reference;
        const query = reference === "@'src/OBrien'" ? 'src/OBrien'
          : reference === '@src/my\\ file' ? 'src/my file' : "src/O'Brien";
        expect(fileReferenceAt(text)).toEqual({ query, start: prefix.length });
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

    it.each(['example `literal @src| tail`', '```text\n@src|\n```', '~~~text\n@src|\n~~~',
      '````text\n``` trailing\n@src|\n````', 'example `unfinished @src|'])(
      'keeps file-reference discovery outside code: %s', marked => {
        const cursor = marked.indexOf('|'), text = marked.replace('|', '');
        expect(fileReferenceAt(text, cursor)).toBeNull();
        expect(fileSuggestions(text, files, { text, cursor, revision: 1 })).toBeNull();
        expect(couldBeFileReference(text.slice(0, cursor))).toBe(false);
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
    it.each([
      ["Let's inspect @src/mo|stale  后文 /skill:follow 👩‍💻", 'src/model.ts'],
      ["Users' notes\n@src/mo|stale  后文 /skill:follow 👩‍💻", 'src/model.ts'],
      ["read @src/O|Brien's.ts  后文 /skill:follow 👩‍💻", "src/O'Brien.ts"],
      ["Let's inspect @\"my f|stale\"  后文 /skill:follow 👩‍💻", 'my file.ts'],
    ])('replaces only the source reference around prose or filename apostrophes: %s', (marked, file) => {
      const cursor = marked.indexOf('|'), text = marked.replace('|', ''), from = text.indexOf('@');
      const editor = new Editor(); editor.setText(text); editor.move('doc-start');
      for (let count = 0; count < cursor; count++) editor.move('right');
      const suffix = '  后文 /skill:follow 👩‍💻';
      const candidate = fileSuggestions(text, [file], editor.snapshot())?.[0];
      expect(candidate?.value).toBe('@' + file);
      expect(candidate?.edit).toMatchObject({ from, to: text.indexOf(suffix) });
      expect(editor.replace(candidate!.edit!)).toBe(true);
      expect(editor.getText().slice(0, from)).toBe(text.slice(0, from));
      expect(editor.getText().endsWith(suffix)).toBe(true);
      const inserted = editor.getText().slice(from, -suffix.length);
      expect(tokenizeCommandArgs(inserted)).toEqual(['@' + file]);
      expect(fileReferenceAt(editor.getText(), editor.snapshot().cursor)).toEqual({ query: file, start: from });
    });

    it.each([
      ['read @src/mail@20|  后文', 'src/mail@2026.ts'],
      ['read @mail@ex|  后文', 'mail@example.test'],
      ['read @no|  后文', '@notes.md'],
      ['read @"@no|"  后文', '@notes.md'],
      ['read @"my @fi|"  后文', 'my @file.md'],
    ])('retains filename sigils through completion and reparsing: %s', (marked, file) => {
      const cursor = marked.indexOf('|');
      const editor = new Editor(); editor.setText(marked.replace('|', '')); editor.move('doc-start');
      for (let count = 0; count < cursor; count++) editor.move('right');
      const candidate = fileSuggestions(editor.getText(), [file], editor.snapshot())?.[0];
      expect(candidate?.value).toBe('@' + file);
      expect(editor.replace(candidate!.edit!)).toBe(true);
      expect(editor.getText().startsWith('read ')).toBe(true);
      expect(editor.getText().endsWith('  后文')).toBe(true);
      const inserted = editor.getText().slice(5, -4);
      expect(tokenizeCommandArgs(inserted)).toEqual(['@' + file]);
      if (file.startsWith('@')) expect(inserted.startsWith('@"')).toBe(true);
      expect(fileReferenceAt(editor.getText(), editor.snapshot().cursor)).toEqual({ query: file, start: 5 });
    });

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
