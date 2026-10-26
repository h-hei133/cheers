import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TemplateLoader } from "./templateLoader.js";

/**
 * Templates are found the way skills are found, which is the point of testing it:
 * a person who has learned where one kind of file goes should not have to learn a
 * second convention, so the two loaders have to agree about precedence and layout.
 */

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function workspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "templates-"));
  tempDirs.push(dir);
  return dir;
}

function write(root: string, name: string, content: string): void {
  const dir = path.join(root, ".agents", "prompts");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.md`), content, "utf8");
}

describe("finding templates", () => {
  it('requires explicit opt-in before a template can be composed inline', () => {
    const root = workspace(); write(root, 'ordinary', 'Ordinary body.');
    write(root, 'method', '---\ncomposable: true\n---\nMethod body.');
    const templates = new TemplateLoader(root).load();
    expect(templates.get('ordinary')?.composable).toBeUndefined();
    expect(templates.get('method')?.composable).toBe(true);
  });
  it("takes the file name as the invocation name", () => {
    const root = workspace();
    write(root, "review", "Review the code.");
    expect(new TemplateLoader(root).load().get("review")?.content).toBe("Review the code.");
  });

  it("reads description and argument hint from frontmatter", () => {
    const root = workspace();
    write(root, "review", "---\ndescription: Review a module\nargument-hint: <module>\n---\nBody.");
    const template = new TemplateLoader(root).load().get("review");
    expect(template?.description).toBe("Review a module");
    expect(template?.argumentHint).toBe("<module>");
    // The frontmatter is metadata, not part of what the model receives.
    expect(template?.content).toBe("Body.");
  });

  it("works without frontmatter at all", () => {
    const root = workspace();
    write(root, "plain", "Just a body.");
    const template = new TemplateLoader(root).load().get("plain");
    expect(template?.content).toBe("Just a body.");
    expect(template?.description).toBe("");
  });

  it("finds templates from the working directory up to the project root", () => {
    // A template kept at the repository root has to be found when the session
    // starts in a subdirectory; reading only the working directory hides it. The
    // walk stops at the project-root marker, so this creates one.
    const root = workspace();
    write(root, "rooted", "From the root.");
    fs.mkdirSync(path.join(root, ".git"), { recursive: true });
    const nested = path.join(root, "packages", "app");
    fs.mkdirSync(nested, { recursive: true });
    expect(new TemplateLoader(nested).load().get("rooted")?.content).toBe("From the root.");
  });

  it("does not read templates from above the project root", () => {
    // A nested project has its own boundary even when the fixture itself sits
    // beneath the repository running this test.
    const root = workspace();
    write(root, "outside", "Not part of a project.");
    const nested = path.join(root, "packages", "app");
    fs.mkdirSync(nested, { recursive: true });
    fs.mkdirSync(path.join(nested, '.git'));
    expect(new TemplateLoader(nested).load().has("outside")).toBe(false);
  });

  it("ignores non-markdown files", () => {
    const root = workspace();
    write(root, "review", "Body.");
    fs.writeFileSync(path.join(root, ".agents", "prompts", "notes.txt"), "ignore me", "utf8");
    expect(new TemplateLoader(root).load().has("notes")).toBe(false);
  });

  it("reports an empty template rather than offering it", () => {
    // An empty body would expand to nothing, sending an empty prompt with no
    // indication of why.
    const root = workspace();
    write(root, "empty", "   \n  ");
    const loaded = new TemplateLoader(root).loadDetailed();
    expect(loaded.templates.has("empty")).toBe(false);
    expect(loaded.diagnostics.map((d) => d.name)).toContain("empty");
  });

  it("returns nothing when no directory exists", () => {
    // Not an error: most projects have no templates, and failing a prompt over a
    // directory the user never created would be wrong.
    expect(new TemplateLoader(workspace()).load().size).toBe(0);
  });

  it("checks only named candidates without enumerating the template directory", () => {
    const root = workspace();
    write(root, "chosen", "Chosen body.");
    write(root, "other", "Other body.");
    const readdir = vi.spyOn(fs, "readdirSync");
    const templates = new TemplateLoader(root, undefined, { names: new Set(["chosen"]) }).load();
    expect(templates.get("chosen")?.content).toBe("Chosen body.");
    expect(templates.has("other")).toBe(false);
    expect(readdir).not.toHaveBeenCalled();
  });

  it("reads only template bodies whose names match a completion prefix", () => {
    const root = workspace();
    write(root, "home-main", "Main body.");
    write(root, "home-extra", "Extra body.");
    write(root, "unrelated", "Unrelated body.");
    const read = vi.spyOn(fs, "readFileSync");
    const templates = new TemplateLoader(root, undefined, { namePrefix: "home" }).load();
    expect([...templates.keys()].sort()).toEqual(["home-extra", "home-main"]);
    const projectReads = read.mock.calls
      .map(call => String(call[0]))
      .filter(target => target.startsWith(root))
      .sort();
    expect(projectReads).toEqual([
      path.join(root, ".agents", "prompts", "home-extra.md"),
      path.join(root, ".agents", "prompts", "home-main.md"),
    ]);
  });

  it("bounds prefix discovery without failing the completion path", () => {
    const root = workspace();
    write(root, "home-a", "A body.");
    write(root, "home-b", "B body.");
    write(root, "home-c", "C body.");
    const templates = new TemplateLoader(root, undefined, { namePrefix: "home", maxCandidates: 2 }).load();
    expect(templates.size).toBe(2);
    expect([...templates.keys()].every(name => name.startsWith("home-"))).toBe(true);
  });

  it("bounds directory entries inspected during prefix discovery", () => {
    const root = workspace();
    write(root, "home-a", "A body.");
    write(root, "home-b", "B body.");
    const read = vi.fn();
    const open = fs.opendirSync.bind(fs);
    vi.spyOn(fs, "opendirSync").mockImplementation(target => {
      const directory = open(target);
      const next = directory.readSync.bind(directory);
      directory.readSync = () => {
        read();
        return next();
      };
      return directory;
    });
    new TemplateLoader(root, undefined, {
      namePrefix: "home",
      maxCandidates: 10,
      maxDirectoryEntries: 1,
    }).load();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("prefers higher-priority names and templates when prefix discovery is capped", () => {
    const root = workspace();
    fs.mkdirSync(path.join(root, ".git"), { recursive: true });
    const nested = path.join(root, "packages", "app");
    write(root, "home-low", "Low body.");
    write(nested, "home-high", "High body.");
    expect([...new TemplateLoader(nested, undefined, { namePrefix: "home", maxCandidates: 1 }).load().keys()])
      .toEqual(["home-high"]);

    write(root, "home-shared", "Root");
    write(nested, "home-shared", "Nearest body that exceeds the byte budget.");
    const shared = new TemplateLoader(nested, undefined, {
      namePrefix: "home",
      maxCandidates: 2,
      maxFileBytes: 8,
    }).load();
    expect(shared.has("home-shared")).toBe(false);
  });

  it("observes prefix-discovery cancellation before reading matching bodies", () => {
    const root = workspace();
    write(root, "home-main", "Main body.");
    const prompts = path.join(root, ".agents", "prompts");
    const controller = new AbortController();
    const loader = new TemplateLoader(root, target => {
      if (target === prompts) controller.abort();
    }, { namePrefix: "home", signal: controller.signal });
    expect(() => loader.load()).toThrow();
  });

  it("bounds named discovery and observes cancellation between synchronous steps", () => {
    const root = workspace();
    write(root, "first", "First body.");
    write(root, "second", "Second body.");
    expect(() => new TemplateLoader(root, undefined, { names: new Set(["first", "second"]), maxCandidates: 1 }).load())
      .toThrow("candidate budget");
    expect(() => new TemplateLoader(root, undefined, { names: new Set(["first"]), maxFileBytes: 1 }).load())
      .toThrow("per-file byte budget");
    expect(() => new TemplateLoader(root, undefined, { names: new Set(["first", "second"]), maxTotalBytes: 5 }).load())
      .toThrow("total byte budget");

    const controller = new AbortController();
    const loader = new TemplateLoader(root, target => {
      if (target.endsWith("first.md")) controller.abort();
    }, { names: new Set(["first", "second"]), signal: controller.signal });
    expect(() => loader.load()).toThrow();
  });

  it("lets the nearest project directory win over one further up", () => {
    // The same rule the skills are found by: a file written for a subdirectory is
    // the more specific statement, so it is the one that applies there. The walk
    // and the override have to agree for that to be true.
    const root = workspace();
    fs.mkdirSync(path.join(root, ".git"), { recursive: true });
    write(root, "shared", "From the repository root.");
    const nested = path.join(root, "packages", "app");
    write(nested, "shared", "From the subdirectory.");

    expect(new TemplateLoader(nested).load().get("shared")?.content).toBe("From the subdirectory.");
  });
});
