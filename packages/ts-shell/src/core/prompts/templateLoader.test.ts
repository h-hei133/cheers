import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TemplateLoader } from "./templateLoader.js";

/**
 * Templates are found the way skills are found, which is the point of testing it:
 * a person who has learned where one kind of file goes should not have to learn a
 * second convention, so the two loaders have to agree about precedence and layout.
 */

const tempDirs: string[] = [];

afterEach(() => {
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
    // Without a marker the walk considers only the given directory: an arbitrary
    // parent is not a project, and reading configuration out of one would apply
    // rules a repository never declared.
    const root = workspace();
    write(root, "outside", "Not part of a project.");
    const nested = path.join(root, "packages", "app");
    fs.mkdirSync(nested, { recursive: true });
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
});
