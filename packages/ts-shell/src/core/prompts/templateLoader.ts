import * as fs from "node:fs";
import * as path from "node:path";
import { resolveAllUserDataFiles, userDataDir } from "../paths/userHome.js";
import { projectDirectories } from "../project/directories.js";
import type { PromptTemplate } from "./expansion.js";

/**
 * Prompt templates kept as files.
 *
 * A template is a markdown file the user writes once and invokes by name with
 * arguments. The directories are the same shape skills use — a user-level one and
 * a project-level one, project winning — because a person who has learned where one
 * kind of file goes should not have to learn a second convention for the other.
 *
 * The name is the file name without its extension, which keeps the invocation and
 * the file the same word: a template in `review.md` is invoked as `/review`, and
 * there is no separate frontmatter name to keep in sync with the file.
 */

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** A template name the shell can route: no spaces, no path characters. */
const VALID_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export interface TemplateDiagnostic {
  readonly name: string;
  readonly filePath: string;
  readonly message: string;
}

export interface LoadedTemplates {
  readonly templates: ReadonlyMap<string, PromptTemplate>;
  readonly diagnostics: readonly TemplateDiagnostic[];
}

/** Read `key: value` pairs from a frontmatter block, if there is one. */
function frontmatterFields(block: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of block.split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    fields.set(match[1]!.toLowerCase(), match[2]!.trim().replace(/^["']|["']$/g, ""));
  }
  return fields;
}

export class TemplateLoader {
  private readonly roots: readonly string[];

  constructor(workspaceRoot: string = process.cwd()) {
    // User templates first, then project ones, so a later root overrides an earlier
    // one — the same precedence the skill loader applies and for the same reason.
    const userDirs = resolveAllUserDataFiles("prompts");
    const projectDirs = [...projectDirectories(workspaceRoot)]
      .reverse()
      .map((dir) => path.join(dir, ".agents", "prompts"));
    this.roots = [
      ...(userDirs.length > 0 ? userDirs : [path.join(userDataDir(), "prompts")]),
      ...projectDirs,
    ];
  }

  load(): ReadonlyMap<string, PromptTemplate> {
    return this.loadDetailed().templates;
  }

  loadDetailed(): LoadedTemplates {
    const templates = new Map<string, PromptTemplate>();
    const diagnostics: TemplateDiagnostic[] = [];

    for (const root of this.roots) {
      for (const file of this.listMarkdown(root)) {
        const name = path.basename(file, path.extname(file));
        if (!VALID_NAME.test(name)) {
          // Reported rather than skipped silently: the file exists and the user
          // expects to be able to invoke it, so the reason it does not appear has
          // to come from somewhere.
          diagnostics.push({
            name,
            filePath: file,
            message: "The file name is not usable as a command name.",
          });
          continue;
        }

        let raw: string;
        try {
          raw = fs.readFileSync(file, "utf8");
        } catch {
          diagnostics.push({ name, filePath: file, message: "The file could not be read." });
          continue;
        }

        const match = FRONTMATTER.exec(raw);
        const fields = match ? frontmatterFields(match[1]!) : new Map<string, string>();
        const content = (match ? raw.slice(match[0].length) : raw).trim();
        if (!content) {
          diagnostics.push({ name, filePath: file, message: "The template is empty." });
          continue;
        }

        const argumentHint = fields.get("argument-hint");
        templates.set(name, {
          name,
          description: fields.get("description") ?? "",
          ...(argumentHint ? { argumentHint } : {}),
          content,
          filePath: file,
        });
      }
    }

    return { templates, diagnostics };
  }

  private listMarkdown(root: string): readonly string[] {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      // A root that does not exist contributes nothing; there is no default
      // template to fall back to and an error here would fail a prompt over a
      // directory the user never created.
      return [];
    }
    return entries
      .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name))
      .map((entry) => path.join(root, entry.name))
      .sort();
  }
}
