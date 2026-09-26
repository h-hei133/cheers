import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { expandImports } from "./importExpansion.js";

/**
 * Expanding a reference inside an instruction file.
 *
 * A project's rules outgrow one file, and the usual way to split them is to
 * reference the others. Without this, the rules in the referenced file are
 * simply absent — which reads as the model ignoring an instruction rather than
 * never having received it.
 */

async function withProject<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "import-expansion-"));
  try {
    return await run(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function expandAt(root: string, content: string) {
  return expandImports(content, { baseDirectory: root, projectRoot: root });
}

describe("expanding a reference", () => {
  it("replaces a reference with what it names", async () => {
    await withProject(async (root) => {
      await fs.writeFile(path.join(root, "extra.md"), "extra rules\n", "utf8");

      const { content } = expandAt(root, "before\n@./extra.md\nafter\n");

      expect(content).toContain("extra rules");
      expect(content).not.toContain("@./extra.md");
      expect(content).toContain("before");
      expect(content).toContain("after");
    });
  });

  it("leaves a reference inside a code block alone", async () => {
    // An instruction file that documents this syntax — as this test does — would
    // otherwise expand its own examples.
    await withProject(async (root) => {
      await fs.writeFile(path.join(root, "extra.md"), "SHOULD NOT APPEAR\n", "utf8");

      const { content } = expandAt(root, "Write `@./extra.md` to include a file.\n");

      expect(content).toContain("@./extra.md");
      expect(content).not.toContain("SHOULD NOT APPEAR");
    });
  });

  it("leaves a reference inside a fenced block alone", async () => {
    await withProject(async (root) => {
      await fs.writeFile(path.join(root, "extra.md"), "SHOULD NOT APPEAR\n", "utf8");

      const { content } = expandAt(root, "```\n@./extra.md\n```\n");

      expect(content).not.toContain("SHOULD NOT APPEAR");
    });
  });

  it("leaves a reference inside a tilde fence alone", async () => {
    // Tildes are the fence a document uses to show backticks, so an instruction
    // file explaining this syntax is exactly the file that has one — and reading
    // it as prose expands the example the file was written to describe.
    await withProject(async (root) => {
      await fs.writeFile(path.join(root, "extra.md"), "SHOULD NOT APPEAR\n", "utf8");

      const { content } = expandAt(root, "~~~\n@./extra.md\n~~~\n");

      expect(content).not.toContain("SHOULD NOT APPEAR");
    });
  });

  it("keeps a longer fence around a shorter one", async () => {
    // A four-backtick fence exists to hold a three-backtick block, so the inner
    // run must not be taken for the closer.
    await withProject(async (root) => {
      await fs.writeFile(path.join(root, "extra.md"), "SHOULD NOT APPEAR\n", "utf8");

      const { content } = expandAt(root, "````\n```\n@./extra.md\n```\n````\n");

      expect(content).not.toContain("SHOULD NOT APPEAR");
    });
  });

  it("does not treat a shorter run as the closer", async () => {
    // Opened with four and closed with three, which is not a fence at all: the
    // reference is prose and is expanded.
    await withProject(async (root) => {
      await fs.writeFile(path.join(root, "extra.md"), "SHOULD APPEAR\n", "utf8");

      const { content } = expandAt(root, "````\n@./extra.md\n```\n");

      expect(content).toContain("SHOULD APPEAR");
    });
  });

  it("does not read a pair of tildes in prose as a fence", async () => {
    // CommonMark fences with three or more tildes at the start of a line. A
    // looser rule would mask everything between two tildes anywhere, which is
    // how a sentence about a delay hides the reference after it.
    await withProject(async (root) => {
      await fs.writeFile(path.join(root, "extra.md"), "SHOULD APPEAR\n", "utf8");

      const { content } = expandAt(root, "Wait ~5 to ~10 minutes.\n@./extra.md\n");

      expect(content).toContain("SHOULD APPEAR");
    });
  });

  it("expands a nested reference against the file that made it", async () => {
    // The second reference is relative to the file it is written in, not to the
    // file that pulled that one in. Resolving both against the same directory
    // would look for `docs/docs/inner.md`.
    await withProject(async (root) => {
      await fs.mkdir(path.join(root, "docs"));
      await fs.writeFile(path.join(root, "docs", "outer.md"), "outer\n@./inner.md\n", "utf8");
      await fs.writeFile(path.join(root, "docs", "inner.md"), "inner rules\n", "utf8");

      const { content } = expandAt(root, "@./docs/outer.md\n");

      expect(content).toContain("inner rules");
    });
  });

  it("includes a file only once when two references name it", async () => {
    await withProject(async (root) => {
      await fs.writeFile(path.join(root, "shared.md"), "shared rules\n", "utf8");

      const { content, skipped } = expandAt(root, "@./shared.md\n@./shared.md\n");

      expect(content.match(/shared rules/g)).toHaveLength(1);
      expect(skipped.map((entry) => entry.reason)).toContain("already included");
    });
  });

  it("stops following references that cycle", async () => {
    // Two files referencing each other would otherwise expand forever.
    await withProject(async (root) => {
      await fs.writeFile(path.join(root, "a.md"), "a\n@./b.md\n", "utf8");
      await fs.writeFile(path.join(root, "b.md"), "b\n@./a.md\n", "utf8");

      const { content } = expandAt(root, "@./a.md\n");

      expect(content).toContain("a");
      expect(content).toContain("b");
    });
  });

  it("stops at the depth limit", async () => {
    await withProject(async (root) => {
      for (let level = 0; level < 12; level += 1) {
        const next = level === 11 ? "bottom\n" : `level ${level}\n@./level${level + 1}.md\n`;
        await fs.writeFile(path.join(root, `level${level}.md`), next, "utf8");
      }

      const { content } = expandAt(root, "@./level0.md\n");

      expect(content).toContain("level 0");
      // Twelve levels of nesting are more than the limit allows.
      expect(content).not.toContain("bottom");
    });
  });
});

describe("a reference that would leave the project", () => {
  it("is skipped rather than followed", async () => {
    // An instruction file that can pull in anything on the machine lets a
    // checked-in file read the user's home directory into the prompt.
    await withProject(async (root) => {
      const outside = await fs.mkdtemp(path.join(os.tmpdir(), "outside-"));
      try {
        await fs.writeFile(path.join(outside, "secret.md"), "SHOULD NOT APPEAR\n", "utf8");

        const { content, skipped } = expandAt(root, `@${path.join(outside, "secret.md")}\n`);

        expect(content).not.toContain("SHOULD NOT APPEAR");
        expect(skipped.map((entry) => entry.reason)).toContain("outside the project");
      } finally {
        await fs.rm(outside, { recursive: true, force: true });
      }
    });
  });

  it("is skipped when reached through a relative path", async () => {
    await withProject(async (root) => {
      const outside = await fs.mkdtemp(path.join(os.tmpdir(), "outside-"));
      try {
        await fs.writeFile(path.join(outside, "secret.md"), "SHOULD NOT APPEAR\n", "utf8");

        const { content } = expandAt(root, "@../secret.md\n");

        expect(content).not.toContain("SHOULD NOT APPEAR");
      } finally {
        await fs.rm(outside, { recursive: true, force: true });
      }
    });
  });

  it("is skipped when reached through a symlink pointing outside", async () => {
    // The reference looks local; the file it names is not. Checking the text
    // before resolving would let this through.
    await withProject(async (root) => {
      const outside = await fs.mkdtemp(path.join(os.tmpdir(), "outside-"));
      try {
        await fs.writeFile(path.join(outside, "secret.md"), "SHOULD NOT APPEAR\n", "utf8");
        await fs.symlink(path.join(outside, "secret.md"), path.join(root, "link.md"));

        const { content, skipped } = expandAt(root, "@./link.md\n");

        expect(content).not.toContain("SHOULD NOT APPEAR");
        expect(skipped.map((entry) => entry.reason)).toContain("outside the project");
      } finally {
        await fs.rm(outside, { recursive: true, force: true });
      }
    });
  });

  it("allows a reference to a sibling directory inside the project", async () => {
    // The boundary is the project, not the directory the file sits in, so a file
    // under `docs/` may reference one under `src/`.
    await withProject(async (root) => {
      await fs.mkdir(path.join(root, "docs"));
      await fs.mkdir(path.join(root, "src"));
      await fs.writeFile(path.join(root, "src", "rules.md"), "src rules\n", "utf8");

      const { content } = expandImports("@../src/rules.md\n", {
        baseDirectory: path.join(root, "docs"),
        projectRoot: root,
      });

      expect(content).toContain("src rules");
    });
  });
});

describe("a reference that cannot be followed", () => {
  it("is skipped without losing the file that made it", async () => {
    await withProject(async (root) => {
      const { content, skipped } = expandAt(root, "keep this\n@./missing.md\nand this\n");

      expect(content).toContain("keep this");
      expect(content).toContain("and this");
      expect(skipped).toEqual([{ reference: "./missing.md", reason: "not found" }]);
    });
  });

  it("does not treat an email address as a reference", async () => {
    await withProject(async (root) => {
      const { content, skipped } = expandAt(root, "Contact user@example.com for help.\n");

      expect(content).toContain("user@example.com");
      expect(skipped).toHaveLength(0);
    });
  });

  it("tries a bare annotation as a path and skips it when nothing matches", async () => {
    // A token starting with a letter is a candidate reference, because a bare
    // filename like `@AGENTS.md` has to work. `@todo` is therefore looked up,
    // not found, and skipped — the content survives either way, which is what
    // matters; the cost is one entry in the skipped list.
    await withProject(async (root) => {
      const { content, skipped } = expandAt(root, "@todo fix this later\n");

      expect(content).toContain("@todo");
      expect(skipped).toEqual([{ reference: "todo", reason: "not found" }]);
    });
  });

  it("leaves content with no references untouched", async () => {
    await withProject(async (root) => {
      const original = "Just some rules.\nNothing to expand here.\n";

      expect(expandAt(root, original).content).toBe(original);
    });
  });
});
