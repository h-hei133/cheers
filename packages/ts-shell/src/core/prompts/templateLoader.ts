import * as fs from "node:fs";
import * as path from "node:path";
import { resolveAllUserDataFiles, userDataDir, userDataSearchDirs } from "../paths/userHome.js";
import { assertProfileIdentity, assertProfileStorage, currentProfile } from '../paths/profile/context.js';
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
  private readonly profile = currentProfile();
  private readonly userRoots: ReadonlySet<string>;
  private readonly roots: readonly string[];

  constructor(workspaceRoot: string = process.cwd(), private readonly onSource?: (target: string, content?: Buffer) => void) {
    // User templates first, then project ones, so a later root overrides an earlier
    // one — the same precedence the skill loader applies and for the same reason.
    //
    // Project directories are walked outermost-first, which is the order
    // `projectDirectories` returns: with a later root winning, that makes the nearest
    // directory the one that applies, which is the more specific statement about how
    // the project works. Reversing here would give the outermost project the last
    // word instead, so a file written for a subdirectory would lose to the repository
    // root — the opposite of the rule stated above.
    for (const directory of userDataSearchDirs()) onSource?.(path.join(directory, 'prompts'));
    const userDirs = resolveAllUserDataFiles("prompts");
    const projectDirs = projectDirectories(workspaceRoot, onSource).map((dir) =>
      path.join(dir, ".agents", "prompts"),
    );
    this.userRoots = new Set(userDirs.length > 0 ? userDirs : [path.join(userDataDir(), 'prompts')]);
    this.roots = [
      ...this.userRoots,
      ...projectDirs,
    ];
  }

  load(): ReadonlyMap<string, PromptTemplate> {
    return this.loadDetailed().templates;
  }

  loadDetailed(): LoadedTemplates {
    if (this.profile) assertProfileIdentity(this.profile);
    const templates = new Map<string, PromptTemplate>();
    const diagnostics: TemplateDiagnostic[] = [];

    for (const root of this.roots) {
      if (this.userRoots.has(root)) assertProfileStorage(root, this.profile);
      for (const file of this.listMarkdown(root)) {
        if (this.userRoots.has(root)) assertProfileStorage(file, this.profile);
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

        let bytes: Buffer;
        this.onSource?.(file);
        try {
          bytes = fs.readFileSync(file);
        } catch {
          diagnostics.push({ name, filePath: file, message: "The file could not be read." });
          continue;
        }
        this.onSource?.(file, bytes);
        const raw = bytes.toString('utf8');

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
          ...(fields.get('composable') === 'true' ? { composable: true } : {}),
          ...(argumentHint ? { argumentHint } : {}),
          content,
          filePath: file,
        });
      }
    }

    return { templates, diagnostics };
  }

  private listMarkdown(root: string): readonly string[] {
    this.onSource?.(root);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      // A root that does not exist contributes nothing; there is no default
      // template to fall back to and an error here would fail a prompt over a
      // directory the user never created.
      return [];
    }
    this.onSource?.(root);
    return entries
      .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name))
      .map((entry) => path.join(root, entry.name))
      .sort();
  }
}
