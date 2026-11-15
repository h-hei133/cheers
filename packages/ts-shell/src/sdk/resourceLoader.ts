import fs from "node:fs";
import path from "node:path";
import { verifyPathContainment } from "../core/security/pathJail.js";
import type { DenyRule } from "../core/shell/approval/deny.js";
import { resolveSkillCatalog } from "../core/skills/skillCatalog.js";
import type { Skill } from "../core/skills/skillLoader.js";
import {
  loadInProcessExtensionAsync,
  runExtensionFactory,
  type ExtensionFactory,
  type ExtensionHostBridge,
  type LoadedInProcessExtension,
} from "../extensions/runtime/inProcessLoader.js";
import { listThemes, loadTheme, type ThemeConfig } from "../presentation/themes/index.js";
import { redactReportText } from "../core/security/redaction.js";
import { types as nodeTypes } from "node:util";

/**
 * Compose skill and theme discovery, system prompt overrides, and extension loading.
 */

const MAX_PROMPT_FILE_BYTES = 1024 * 1024;

/** Error messages cross VM realms; read only native own data, never extension getters. */
function extensionLoadDiagnostic(error: unknown): string {
  let detail = "Extension initialization failed.";
  if (typeof error === "string") detail = error;
  else if (nodeTypes.isNativeError(error)) {
    const message = Object.getOwnPropertyDescriptor(error, "message");
    if (message && "value" in message && typeof message.value === "string") detail = message.value;
  }
  return redactReportText(detail, 512);
}

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
  setHost?(host: ExtensionHostBridge): void | (() => void);
  setDenyRules?(denyRules: () => readonly DenyRule[]): void;
  /** Retire only the loaded generation consumed by this session, preserving later reloads. */
  captureRetirement?(): () => void;
  /** Bind the exact resource snapshot captured before session initialization awaits. */
  captureBinding?(): (host: ExtensionHostBridge) => () => void;
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
  private generation: { readonly controller: AbortController; host: ExtensionHostBridge | undefined } | undefined;

  constructor(private readonly options: DefaultResourceLoaderOptions = {}) {
    this.cwd = path.resolve(options.cwd ?? process.cwd());
    this.dynamicHost = options.host;
    this.dynamicDenyRules = options.denyRules;
  }

  setHost(host: ExtensionHostBridge): void | (() => void) {
    const generation = this.generation;
    const bound = generation?.host ?? this.dynamicHost;
    if (bound !== undefined && bound !== host) {
      throw new Error("Resource loader is already bound to another host. Call reload(host) or create a new loader before binding another session.");
    }
    generation?.controller.signal.throwIfAborted();
    const retire = this.captureRetirement();
    if (this.generation !== generation || (generation?.host ?? this.dynamicHost) !== bound) {
      throw new Error('Resource generation changed during host binding.');
    }
    generation?.controller.signal.throwIfAborted();
    if (generation) generation.host = host;
    this.dynamicHost = host;
    return retire;
  }

  setDenyRules(denyRules: () => readonly DenyRule[]): void {
    this.dynamicDenyRules = denyRules;
  }

  captureRetirement(): () => void {
    const generation = this.generation;
    return () => {
      if (!generation) return;
      if (this.generation === generation) {
        this.generation = undefined;
        this.dynamicHost = undefined;
      }
      generation.host = undefined;
      generation.controller.abort(new Error('Resource consumer is retired.'));
    };
  }

  captureBinding(): (host: ExtensionHostBridge) => () => void {
    const generation = this.generation;
    const retire = this.captureRetirement();
    return host => {
      if (!generation || this.generation !== generation || generation.controller.signal.aborted) {
        throw new Error('Resource generation changed during session initialization.');
      }
      const release = this.setHost(host);
      return typeof release === 'function' ? release : retire;
    };
  }

  async reload(hostOverride?: ExtensionHostBridge): Promise<void> {
    this.generation?.controller.abort(new Error("Resource reload was superseded."));
    const generation = { controller: new AbortController(), host: hostOverride ?? this.dynamicHost };
    this.generation = generation;
    this.dynamicHost = generation.host;
    this.extensionsResult = { extensions: [], errors: [] };
    this.skills = []; this.skillDiagnostics = [];
    this.themes = []; this.themeDiagnostics = [];
    this.systemPrompt = undefined; this.appendSystemPrompt = [];
    const signal = generation.controller.signal;
    const hostForGeneration = (): ExtensionHostBridge | undefined => {
      signal.throwIfAborted();
      return generation.host;
    };
    const hostProxy: ExtensionHostBridge = {
      get ui() { return hostForGeneration()?.ui; },
      getActiveTools: () => hostForGeneration()?.getActiveTools?.() ?? [],
      getAllTools: () => hostForGeneration()?.getAllTools?.() ?? [],
      getCommands: () => hostForGeneration()?.getCommands?.() ?? [],
      sendMessage: (msg) => {
        const host = hostForGeneration();
        if (!host?.sendMessage) throw new Error("Extension message host is unavailable.");
        return host.sendMessage(msg);
      },
      appendEntry: (type, data) => {
        const host = hostForGeneration();
        if (!host?.appendEntry) throw new Error("Extension entry storage is unavailable.");
        return host.appendEntry(type, data);
      },
    };
    const denyRulesFn = () => this.dynamicDenyRules?.() ?? [];

    try {
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
            const ext = await loadInProcessExtensionAsync({
              filePath: entry,
              workspaceRoot: this.cwd,
              denyRules: denyRulesFn,
              host: hostProxy,
              signal,
            });
            signal.throwIfAborted();
            loadedExtensions.push({ source: entry, extension: ext });
          } catch (err) {
            signal.throwIfAborted();
            extensionErrors.push({ path: entry, error: extensionLoadDiagnostic(err) });
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
            signal,
          });
          signal.throwIfAborted();
          loadedExtensions.push({ source, extension: ext });
        } catch (err) {
          signal.throwIfAborted();
          extensionErrors.push({ path: source, error: extensionLoadDiagnostic(err) });
        }
      }

      const baseExt: LoadExtensionsResult = { extensions: loadedExtensions, errors: extensionErrors };
      const extensionsResult = this.options.extensionsOverride ? this.options.extensionsOverride(baseExt) : baseExt;

      const skillCatalog = await resolveSkillCatalog({
        workspaceRoot: this.cwd,
        abortSignal: signal,
        ...(this.options.additionalSkillPaths?.length ? { skillPaths: this.options.additionalSkillPaths } : {}),
        ...(this.options.noSkills ? { noSkills: true } : {}),
      });
      signal.throwIfAborted();
      const baseSkills = {
        skills: [...skillCatalog.skills.values()],
        diagnostics: [
          ...skillCatalog.diagnostics.map((d) => ({ kind: "warning" as const, path: d.filePath, message: d.message })),
          ...skillCatalog.failures.map((f) => ({ kind: "error" as const, path: f.filePath, message: f.message })),
        ],
      };
      const resolvedSkills = this.options.skillsOverride ? this.options.skillsOverride(baseSkills) : baseSkills;

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

      const baseSystem = resolvePromptInput(this.options.systemPrompt, this.cwd);
      const systemPrompt = this.options.systemPromptOverride ? this.options.systemPromptOverride(baseSystem) : baseSystem;

      const baseAppend = (this.options.appendSystemPrompt ?? [])
        .map((entry) => resolvePromptInput(entry, this.cwd))
        .filter((entry): entry is string => entry !== undefined && entry.length > 0);
      const appendSystemPrompt = this.options.appendSystemPromptOverride
        ? this.options.appendSystemPromptOverride(baseAppend)
        : baseAppend;
      signal.throwIfAborted();
      this.extensionsResult = extensionsResult;
      this.skills = resolvedSkills.skills;
      this.skillDiagnostics = resolvedSkills.diagnostics;
      this.themes = loadedThemes;
      this.themeDiagnostics = themeDiags;
      this.systemPrompt = systemPrompt;
      this.appendSystemPrompt = appendSystemPrompt;
    } catch (error) {
      generation.controller.abort();
      throw error;
    }
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
