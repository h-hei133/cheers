import fs from "node:fs";
import path from "node:path";
import { verifyPathContainment } from "../core/security/pathJail.js";
import type { DenyRule } from "../core/shell/approval/deny.js";
import { resolveSkillCatalog } from "../core/skills/skillCatalog.js";
import type { Skill } from "../core/skills/skillLoader.js";
import {
  loadInProcessExtension,
  runExtensionFactory,
  type ExtensionFactory,
  type ExtensionHostBridge,
  type LoadedInProcessExtension,
} from "../extensions/runtime/inProcessLoader.js";
import { listThemes, loadTheme, type ThemeConfig } from "../presentation/themes/index.js";

/**
 * DefaultResourceLoader & ResourceLoader (adopted from Pi `core/resource-loader.ts`),
 * composing Cheers' skill catalog, theme discovery, system prompt overrides, and
 * in-process/inline extension loading.
 */

const MAX_PROMPT_FILE_BYTES = 1024 * 1024;

export interface ResourceDiagnostic {
  readonly kind: "warning" | "error";
  readonly path?: string;
  readonly message: string;
}

export interface LoadedSdkExtension {
  readonly source: string;
  readonly extension: LoadedInProcessExtension;
}

export interface LoadExtensionsResult {
  readonly extensions: readonly LoadedSdkExtension[];
  readonly errors: readonly { readonly path: string; readonly error: string }[];
}

export interface ResourceLoader {
  reload(host?: ExtensionHostBridge): Promise<void>;
  setHost?(host: ExtensionHostBridge): void;
  setDenyRules?(denyRules: () => readonly DenyRule[]): void;
  getExtensions(): LoadExtensionsResult;
  getSkills(): { readonly skills: readonly Skill[]; readonly diagnostics: readonly ResourceDiagnostic[] };
  getThemes(): { readonly themes: readonly ThemeConfig[]; readonly diagnostics: readonly ResourceDiagnostic[] };
  getSystemPrompt(): string | undefined;
  getAppendSystemPrompt(): readonly string[];
  getSkillPaths(): readonly string[];
  getThemePaths(): readonly string[];
  getNoSkills(): boolean;
  getNoContextFiles(): boolean;
}

export interface DefaultResourceLoaderOptions {
  readonly cwd?: string;
  readonly additionalExtensionPaths?: readonly string[];
  readonly additionalSkillPaths?: readonly string[];
  readonly additionalThemePaths?: readonly string[];
  readonly extensionFactories?: readonly ExtensionFactory[];
  readonly noExtensions?: boolean;
  readonly noSkills?: boolean;
  readonly noThemes?: boolean;
  readonly noContextFiles?: boolean;
  readonly systemPrompt?: string;
  readonly appendSystemPrompt?: readonly string[];
  readonly systemPromptOverride?: (base: string | undefined) => string | undefined;
  readonly appendSystemPromptOverride?: (base: readonly string[]) => readonly string[];
  readonly skillsOverride?: (base: {
    readonly skills: readonly Skill[];
    readonly diagnostics: readonly ResourceDiagnostic[];
  }) => { readonly skills: readonly Skill[]; readonly diagnostics: readonly ResourceDiagnostic[] };
  readonly extensionsOverride?: (base: LoadExtensionsResult) => LoadExtensionsResult;
  readonly denyRules?: () => readonly DenyRule[];
  readonly assertSourceAccess?: (absolutePath: string) => void;
  readonly host?: ExtensionHostBridge;
}

function resolvePromptInput(input: string | undefined, cwd: string): string | undefined {
  if (input === undefined) return undefined;
  const candidate = path.resolve(cwd, input);
  if (!path.isAbsolute(input)) {
    const containment = verifyPathContainment(candidate, cwd);
    if (!containment.allowed) return input;
  }
  if (fs.existsSync(candidate)) {
    const stat = fs.statSync(candidate);
    if (stat.isFile()) {
      if (stat.size > MAX_PROMPT_FILE_BYTES) {
        throw new Error(`Prompt file '${candidate}' exceeds ${MAX_PROMPT_FILE_BYTES} bytes.`);
      }
      return fs.readFileSync(candidate, "utf8");
    }
  }
  return input;
}

function resolveExtensionEntry(rawPath: string, cwd: string): string {
  const resolved = path.resolve(cwd, rawPath);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    for (const file of ["index.ts", "index.mts", "index.mjs", "index.js"]) {
      const candidate = path.join(resolved, file);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return resolved;
}

export class DefaultResourceLoader implements ResourceLoader {
  readonly cwd: string;
  private extensionsResult: LoadExtensionsResult = { extensions: [], errors: [] };
  private skills: readonly Skill[] = [];
  private skillDiagnostics: readonly ResourceDiagnostic[] = [];
  private themes: readonly ThemeConfig[] = [];
  private themeDiagnostics: readonly ResourceDiagnostic[] = [];
  private systemPrompt: string | undefined;
  private appendSystemPrompt: readonly string[] = [];
  private dynamicHost: ExtensionHostBridge | undefined;
  private dynamicDenyRules: (() => readonly DenyRule[]) | undefined;

  constructor(private readonly options: DefaultResourceLoaderOptions = {}) {
    this.cwd = path.resolve(options.cwd ?? process.cwd());
    this.dynamicHost = options.host;
    this.dynamicDenyRules = options.denyRules;
  }

  setHost(host: ExtensionHostBridge): void {
    this.dynamicHost = host;
  }

  setDenyRules(denyRules: () => readonly DenyRule[]): void {
    this.dynamicDenyRules = denyRules;
  }

  async reload(hostOverride?: ExtensionHostBridge): Promise<void> {
    if (hostOverride) this.dynamicHost = hostOverride;
    const hostProxy: ExtensionHostBridge = {
      get ui() { return hostLoader.dynamicHost?.ui; },
      getActiveTools: () => hostLoader.dynamicHost?.getActiveTools?.() ?? [],
      getAllTools: () => hostLoader.dynamicHost?.getAllTools?.() ?? [],
      getCommands: () => hostLoader.dynamicHost?.getCommands?.() ?? [],
      sendMessage: (msg) => hostLoader.dynamicHost?.sendMessage?.(msg),
      appendEntry: (type, data) => hostLoader.dynamicHost?.appendEntry?.(type, data),
    };
    const hostLoader = this;
    const denyRulesFn = () => this.dynamicDenyRules?.() ?? [];

    const loadedExtensions: LoadedSdkExtension[] = [];
    const extensionErrors: Array<{ readonly path: string; readonly error: string }> = [];

    if (!this.options.noExtensions) {
      for (const rawPath of this.options.additionalExtensionPaths ?? []) {
        const entry = resolveExtensionEntry(rawPath, this.cwd);
        try {
          if (this.options.assertSourceAccess) {
            this.options.assertSourceAccess(entry);
          } else {
            const contained = verifyPathContainment(entry, this.cwd);
            if (!contained.allowed) throw new Error(`Extension path '${rawPath}' is outside workspace.`);
          }
          const ext = loadInProcessExtension({
            filePath: entry,
            workspaceRoot: this.cwd,
            denyRules: denyRulesFn,
            host: hostProxy,
          });
          loadedExtensions.push({ source: entry, extension: ext });
        } catch (err) {
          extensionErrors.push({ path: entry, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    const factories = this.options.extensionFactories ?? [];
    for (let i = 0; i < factories.length; i++) {
      const source = `<inline:${i + 1}>`;
      try {
        const ext = await runExtensionFactory({
          factory: factories[i]!,
          workspaceRoot: this.cwd,
          denyRules: denyRulesFn,
          host: hostProxy,
        });
        loadedExtensions.push({ source, extension: ext });
      } catch (err) {
        extensionErrors.push({ path: source, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const baseExt: LoadExtensionsResult = { extensions: loadedExtensions, errors: extensionErrors };
    this.extensionsResult = this.options.extensionsOverride ? this.options.extensionsOverride(baseExt) : baseExt;

    const skillCatalog = await resolveSkillCatalog({
      workspaceRoot: this.cwd,
      ...(this.options.additionalSkillPaths?.length ? { skillPaths: this.options.additionalSkillPaths } : {}),
      ...(this.options.noSkills ? { noSkills: true } : {}),
    });
    const baseSkills = {
      skills: [...skillCatalog.skills.values()],
      diagnostics: [
        ...skillCatalog.diagnostics.map((d) => ({ kind: "warning" as const, path: d.filePath, message: d.message })),
        ...skillCatalog.failures.map((f) => ({ kind: "error" as const, path: f.filePath, message: f.message })),
      ],
    };
    const resolvedSkills = this.options.skillsOverride ? this.options.skillsOverride(baseSkills) : baseSkills;
    this.skills = resolvedSkills.skills;
    this.skillDiagnostics = resolvedSkills.diagnostics;

    const loadedThemes: ThemeConfig[] = [];
    const themeDiags: ResourceDiagnostic[] = [];
    if (!this.options.noThemes) {
      const themePaths = this.options.additionalThemePaths ?? [];
      for (const name of listThemes(this.cwd, themePaths)) {
        const cfg = loadTheme(name, this.cwd, themePaths);
        if (cfg) loadedThemes.push(cfg);
        else themeDiags.push({ kind: "warning", message: `Failed to load theme '${name}'.` });
      }
    }
    this.themes = loadedThemes;
    this.themeDiagnostics = themeDiags;

    const baseSystem = resolvePromptInput(this.options.systemPrompt, this.cwd);
    this.systemPrompt = this.options.systemPromptOverride ? this.options.systemPromptOverride(baseSystem) : baseSystem;

    const baseAppend = (this.options.appendSystemPrompt ?? [])
      .map((entry) => resolvePromptInput(entry, this.cwd))
      .filter((entry): entry is string => entry !== undefined && entry.length > 0);
    this.appendSystemPrompt = this.options.appendSystemPromptOverride
      ? this.options.appendSystemPromptOverride(baseAppend)
      : baseAppend;
  }

  getExtensions(): LoadExtensionsResult {
    return this.extensionsResult;
  }

  getSkills(): { readonly skills: readonly Skill[]; readonly diagnostics: readonly ResourceDiagnostic[] } {
    return { skills: this.skills, diagnostics: this.skillDiagnostics };
  }

  getThemes(): { readonly themes: readonly ThemeConfig[]; readonly diagnostics: readonly ResourceDiagnostic[] } {
    return { themes: this.themes, diagnostics: this.themeDiagnostics };
  }

  getSystemPrompt(): string | undefined {
    return this.systemPrompt;
  }

  getAppendSystemPrompt(): readonly string[] {
    return this.appendSystemPrompt;
  }

  getSkillPaths(): readonly string[] {
    return this.options.additionalSkillPaths ?? [];
  }

  getThemePaths(): readonly string[] {
    return this.options.additionalThemePaths ?? [];
  }

  getNoSkills(): boolean {
    return this.options.noSkills === true;
  }

  getNoContextFiles(): boolean {
    return this.options.noContextFiles === true;
  }
}
