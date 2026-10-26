import fs from "node:fs";
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

export interface TemplateLoadOptions {
  readonly signal?: AbortSignal;
  /** When present, only these names are checked instead of walking every root. */
  readonly names?: ReadonlySet<string>;
  /** When present, unrelated template bodies are not read while matching invocation names are discovered. */
  readonly namePrefix?: string;
  readonly maxCandidates?: number;
  /** Prefix discovery stops after this many directory entries; exact-name discovery does not enumerate. */
  readonly maxDirectoryEntries?: number;
  readonly maxFileBytes?: number;
  readonly maxTotalBytes?: number;
}

export class TemplateDiscoveryBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateDiscoveryBudgetError';
  }
}

const NAMED_DISCOVERY_LIMITS = {
  maxCandidates: 512,
  maxFileBytes: 512 * 1024,
  maxTotalBytes: 8 * 1024 * 1024,
} as const;

const PREFIX_DISCOVERY_LIMITS = {
  maxDirectoryEntries: 4096,
} as const;

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

  constructor(workspaceRoot: string = process.cwd(), private readonly onSource?: (target: string, content?: Buffer) => void,
    private readonly options: TemplateLoadOptions = {}) {
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
    this.checkCancelled();
    if (this.profile) assertProfileIdentity(this.profile);
    const templates = new Map<string, PromptTemplate>();
    const diagnostics: TemplateDiagnostic[] = [];

    if (this.options.names) {
      this.loadNamed(templates, diagnostics);
      return { templates, diagnostics };
    }
    if (this.options.namePrefix !== undefined) {
      this.loadPrefixed(templates, diagnostics);
      return { templates, diagnostics };
    }

    for (const root of this.roots) {
      this.checkCancelled();
      if (this.userRoots.has(root)) assertProfileStorage(root, this.profile);
      for (const file of this.listMarkdown(root)) {
        this.checkCancelled();
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

        const loaded = this.readTemplate(file, name, diagnostics);
        if (loaded.template) templates.set(name, loaded.template);
      }
    }

    return { templates, diagnostics };
  }

  private loadNamed(templates: Map<string, PromptTemplate>, diagnostics: TemplateDiagnostic[]): void {
    this.loadNames([...(this.options.names ?? [])], templates, diagnostics);
  }

  private loadPrefixed(templates: Map<string, PromptTemplate>, diagnostics: TemplateDiagnostic[]): void {
    const prefix = (this.options.namePrefix ?? '').toLowerCase();
    const limits = this.discoveryLimits();
    const candidateLimit = Math.max(0, Math.floor(limits.maxCandidates));
    const entryLimit = Math.max(0, Math.floor(limits.maxDirectoryEntries));
    const names = new Set<string>();
    let entryCount = 0;
    let lastRoot = this.roots.at(-1);

    // Prefer the nearest project/user root when a cap prevents a complete listing.
    for (const root of [...this.roots].reverse()) {
      lastRoot = root;
      if (names.size >= candidateLimit || entryCount >= entryLimit) break;
      this.checkCancelled();
      if (this.userRoots.has(root)) assertProfileStorage(root, this.profile);
      this.onSource?.(root);
      this.checkCancelled();
      let directory: ReturnType<typeof fs.opendirSync>;
      try {
        directory = fs.opendirSync(root);
      } catch {
        continue;
      }
      try {
        while (names.size < candidateLimit && entryCount < entryLimit) {
          this.checkCancelled();
          const entry = directory.readSync();
          if (!entry) break;
          entryCount++;
          if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue;
          const name = path.basename(entry.name, path.extname(entry.name));
          if (VALID_NAME.test(name) && name.toLowerCase().startsWith(prefix)) names.add(name);
        }
      } finally {
        directory.closeSync();
      }
      this.checkCancelled();
      this.onSource?.(root);
    }

    if (entryCount >= entryLimit && lastRoot) {
      diagnostics.push({ name: prefix, filePath: lastRoot, message: 'Template discovery reached its directory-entry budget.' });
    }

    // Resolve each discovered name from highest to lowest priority. An over-budget
    // higher-priority file shadows the name instead of exposing stale lower metadata.
    const totalBytes = { value: 0 };
    for (const name of [...names].sort()) {
      for (const root of [...this.roots].reverse()) {
        const outcome = this.loadPrefixedName(name, root, templates, diagnostics, limits, totalBytes);
        if (outcome !== 'continue') break;
      }
    }
  }

  private loadNames(requestedNames: readonly string[], templates: Map<string, PromptTemplate>,
    diagnostics: TemplateDiagnostic[]): void {
    const names = requestedNames
      .map(name => name.toLowerCase())
      .filter(name => VALID_NAME.test(name))
      .sort();
    if (!names.length) return;

    const limits = this.discoveryLimits();
    let candidateCount = 0;
    let totalBytes = 0;

    for (const root of this.roots) {
      this.checkCancelled();
      if (this.userRoots.has(root)) assertProfileStorage(root, this.profile);
      this.onSource?.(root);
      for (const name of names) {
        this.checkCancelled();
        if (++candidateCount > limits.maxCandidates) {
          throw new TemplateDiscoveryBudgetError('Template discovery exceeded its candidate budget.');
        }
        const file = path.join(root, `${name}.md`);
        this.onSource?.(file);
        this.checkCancelled();
        let entry: ReturnType<typeof fs.lstatSync>;
        try {
          entry = fs.lstatSync(file);
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === 'ENOENT' || code === 'ENOTDIR') continue;
          throw error;
        }
        if (!entry.isFile()) continue;
        if (entry.size > limits.maxFileBytes) {
          throw new TemplateDiscoveryBudgetError('Template discovery exceeded its per-file byte budget.');
        }
        if (this.userRoots.has(root)) assertProfileStorage(file, this.profile);
        const loaded = this.readTemplate(file, name, diagnostics, limits.maxFileBytes);
        totalBytes += loaded.bytes;
        if (totalBytes > limits.maxTotalBytes) {
          throw new TemplateDiscoveryBudgetError('Template discovery exceeded its total byte budget.');
        }
        if (loaded.template) templates.set(name, loaded.template);
      }
    }
  }

  private loadPrefixedName(name: string, root: string, templates: Map<string, PromptTemplate>,
    diagnostics: TemplateDiagnostic[], limits: { readonly maxFileBytes: number; readonly maxTotalBytes: number },
    totalBytes: { value: number }): 'loaded' | 'continue' | 'shadowed' {
    this.checkCancelled();
    if (this.userRoots.has(root)) assertProfileStorage(root, this.profile);
    const file = path.join(root, `${name}.md`);
    this.onSource?.(file);
    this.checkCancelled();
    let entry: ReturnType<typeof fs.lstatSync>;
    try {
      entry = fs.lstatSync(file);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return 'continue';
      throw error;
    }
    if (!entry.isFile()) return 'continue';
    if (entry.size > limits.maxFileBytes) {
      diagnostics.push({ name, filePath: file, message: 'The template exceeds the discovery byte budget.' });
      return 'shadowed';
    }
    if (totalBytes.value + entry.size > limits.maxTotalBytes) {
      diagnostics.push({ name, filePath: file, message: 'The template exceeds the discovery total-byte budget.' });
      return 'shadowed';
    }
    if (this.userRoots.has(root)) assertProfileStorage(file, this.profile);
    let loaded: ReturnType<TemplateLoader['readTemplate']>;
    try {
      loaded = this.readTemplate(file, name, diagnostics, limits.maxFileBytes);
    } catch (error) {
      if (error instanceof TemplateDiscoveryBudgetError) {
        diagnostics.push({ name, filePath: file, message: 'The template exceeds the discovery byte budget.' });
        return 'shadowed';
      }
      throw error;
    }
    if (totalBytes.value + loaded.bytes > limits.maxTotalBytes) {
      diagnostics.push({ name, filePath: file, message: 'The template exceeds the discovery total-byte budget.' });
      return 'shadowed';
    }
    totalBytes.value += loaded.bytes;
    if (!loaded.template) return 'continue';
    templates.set(name, loaded.template);
    return 'loaded';
  }

  private discoveryLimits(): {
    readonly maxCandidates: number;
    readonly maxDirectoryEntries: number;
    readonly maxFileBytes: number;
    readonly maxTotalBytes: number;
  } {
    return {
      maxCandidates: this.options.maxCandidates ?? NAMED_DISCOVERY_LIMITS.maxCandidates,
      maxDirectoryEntries: this.options.maxDirectoryEntries ?? PREFIX_DISCOVERY_LIMITS.maxDirectoryEntries,
      maxFileBytes: this.options.maxFileBytes ?? NAMED_DISCOVERY_LIMITS.maxFileBytes,
      maxTotalBytes: this.options.maxTotalBytes ?? NAMED_DISCOVERY_LIMITS.maxTotalBytes,
    };
  }

  private readTemplate(file: string, name: string, diagnostics: TemplateDiagnostic[],
    maxFileBytes?: number): { readonly template?: PromptTemplate; readonly bytes: number } {
    this.checkCancelled();
    this.onSource?.(file);
    this.checkCancelled();
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(file);
    } catch {
      diagnostics.push({ name, filePath: file, message: "The file could not be read." });
      return { bytes: 0 };
    }
    this.checkCancelled();
    this.onSource?.(file, bytes);
    if (maxFileBytes !== undefined && bytes.length > maxFileBytes) {
      throw new TemplateDiscoveryBudgetError('Template discovery exceeded its per-file byte budget.');
    }
    const raw = bytes.toString('utf8');

    const match = FRONTMATTER.exec(raw);
    const fields = match ? frontmatterFields(match[1]!) : new Map<string, string>();
    const content = (match ? raw.slice(match[0].length) : raw).trim();
    if (!content) {
      diagnostics.push({ name, filePath: file, message: "The template is empty." });
      return { bytes: bytes.length };
    }

    const argumentHint = fields.get("argument-hint");
    return {
      bytes: bytes.length,
      template: {
        name,
        description: fields.get("description") ?? "",
        ...(fields.get('composable') === 'true' ? { composable: true } : {}),
        ...(argumentHint ? { argumentHint } : {}),
        content,
        filePath: file,
      },
    };
  }

  private checkCancelled(): void {
    // Discovery is synchronous; cancellation is observed between bounded I/O steps.
    this.options.signal?.throwIfAborted();
  }

  private listMarkdown(root: string): readonly string[] {
    this.checkCancelled();
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
    this.checkCancelled();
    this.onSource?.(root);
    return entries
      .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name))
      .map((entry) => path.join(root, entry.name))
      .sort();
  }
}
