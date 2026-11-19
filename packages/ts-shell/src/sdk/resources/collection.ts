import fs from 'node:fs';
import path from 'node:path';
import { types as nodeTypes } from 'node:util';
import { redactReportText } from '../../core/security/redaction.js';
import { verifyPathContainment } from '../../core/security/pathJail.js';
import type { DenyRule } from '../../core/shell/approval/deny.js';
import { resolveSkillCatalog } from '../../core/skills/skillCatalog.js';
import { loadInProcessExtensionAsync, runExtensionFactory } from '../../extensions/runtime/inProcessLoader.js';
import { listThemes, loadTheme, type ThemeConfig } from '../../presentation/themes/index.js';
import type { DefaultResourceLoaderOptions, LoadedSdkExtension, LoadExtensionsResult, ResourceDiagnostic, ResourceGeneration, ResourceSnapshot } from './contract.js';
import { resourceHost } from './host.js';
import { resourceText } from './data.js';
import { captureExtensions, captureResourceText, captureSkills, captureThemes } from './snapshot.js';

const MAX_PROMPT_FILE_BYTES = 1024 * 1024;

/** Error messages cross VM realms; read only native own data, never extension getters. */
function extensionLoadDiagnostic(error: unknown): string {
  let detail = 'Extension initialization failed.';
  if (typeof error === 'string') detail = error;
  else if (nodeTypes.isNativeError(error)) {
    const message = Object.getOwnPropertyDescriptor(error, 'message');
    if (message && 'value' in message && typeof message.value === 'string') detail = message.value;
  }
  return redactReportText(detail, 512);
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
      return fs.readFileSync(candidate, 'utf8');
    }
  }
  return input;
}

function resolveExtensionEntry(rawPath: string, cwd: string): string {
  const resolved = path.resolve(cwd, rawPath);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    for (const file of ['index.ts', 'index.mts', 'index.mjs', 'index.js']) {
      const candidate = path.join(resolved, file);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return resolved;
}

export function emptyResourceSnapshot(options: DefaultResourceLoaderOptions): ResourceSnapshot {
  return Object.freeze({
    extensions: Object.freeze({ extensions: Object.freeze([]), errors: Object.freeze([]) }),
    skills: Object.freeze({ skills: Object.freeze([]), diagnostics: Object.freeze([]) }),
    themes: Object.freeze({ themes: Object.freeze([]), diagnostics: Object.freeze([]) }),
    systemPrompt: undefined,
    appendSystemPrompt: Object.freeze([]),
    skillPaths: captureResourceText(options.additionalSkillPaths ?? []),
    themePaths: captureResourceText(options.additionalThemePaths ?? []),
    noSkills: options.noSkills === true,
    noContextFiles: options.noContextFiles === true,
  });
}

/** Collect locally; the generation owner alone decides whether to publish this snapshot. */
export async function collectResources(
  options: DefaultResourceLoaderOptions,
  cwd: string,
  generation: ResourceGeneration,
  denyRules: () => readonly DenyRule[],
): Promise<ResourceSnapshot> {
  // Caller options and overrides are captured before the first initialization await.
  const inputs = {
    extensionPaths: captureResourceText(options.additionalExtensionPaths ?? []),
    skillPaths: captureResourceText(options.additionalSkillPaths ?? []),
    themePaths: captureResourceText(options.additionalThemePaths ?? []),
    factories: [...(options.extensionFactories ?? [])],
    noExtensions: options.noExtensions === true,
    noSkills: options.noSkills === true,
    noThemes: options.noThemes === true,
    noContextFiles: options.noContextFiles === true,
    systemPrompt: options.systemPrompt,
    appendSystemPrompt: captureResourceText(options.appendSystemPrompt ?? []),
    systemPromptOverride: options.systemPromptOverride,
    appendSystemPromptOverride: options.appendSystemPromptOverride,
    skillsOverride: options.skillsOverride,
    extensionsOverride: options.extensionsOverride,
    assertSourceAccess: options.assertSourceAccess,
  };
  const signal = generation.controller.signal;
  signal.throwIfAborted();
  const host = resourceHost(generation);
  const loadedExtensions: LoadedSdkExtension[] = [];
  const extensionErrors: Array<{ readonly path: string; readonly error: string }> = [];

  if (!inputs.noExtensions) {
    for (const rawPath of inputs.extensionPaths) {
      const entry = resolveExtensionEntry(rawPath, cwd);
      try {
        if (inputs.assertSourceAccess) inputs.assertSourceAccess(entry);
        else {
          const contained = verifyPathContainment(entry, cwd);
          if (!contained.allowed) throw new Error(`Extension path '${rawPath}' is outside workspace.`);
        }
        const extension = await loadInProcessExtensionAsync({ filePath: entry, workspaceRoot: cwd, denyRules, host, signal });
        signal.throwIfAborted();
        loadedExtensions.push({ source: entry, extension });
      } catch (error) {
        signal.throwIfAborted();
        extensionErrors.push({ path: entry, error: extensionLoadDiagnostic(error) });
      }
    }
  }

  for (let index = 0; index < inputs.factories.length; index++) {
    const source = `<inline:${index + 1}>`;
    try {
      const extension = await runExtensionFactory({ factory: inputs.factories[index]!, workspaceRoot: cwd, denyRules, host, signal });
      signal.throwIfAborted();
      loadedExtensions.push({ source, extension });
    } catch (error) {
      signal.throwIfAborted();
      extensionErrors.push({ path: source, error: extensionLoadDiagnostic(error) });
    }
  }

  const baseExtensions: LoadExtensionsResult = { extensions: loadedExtensions, errors: extensionErrors };
  const extensions = captureExtensions(inputs.extensionsOverride ? inputs.extensionsOverride(baseExtensions) : baseExtensions);
  const skillCatalog = await resolveSkillCatalog({
    workspaceRoot: cwd,
    abortSignal: signal,
    ...(inputs.skillPaths.length ? { skillPaths: inputs.skillPaths } : {}),
    ...(inputs.noSkills ? { noSkills: true } : {}),
  });
  signal.throwIfAborted();
  const baseSkills = {
    skills: [...skillCatalog.skills.values()],
    diagnostics: [
      ...skillCatalog.diagnostics.map(diagnostic => ({ kind: 'warning' as const, path: diagnostic.filePath, message: diagnostic.message })),
      ...skillCatalog.failures.map(failure => ({ kind: 'error' as const, path: failure.filePath, message: failure.message })),
    ],
  };
  const skills = captureSkills(inputs.skillsOverride ? inputs.skillsOverride(baseSkills) : baseSkills);
  const themes: ThemeConfig[] = [];
  const themeDiagnostics: ResourceDiagnostic[] = [];
  if (!inputs.noThemes) {
    for (const name of listThemes(cwd, inputs.themePaths)) {
      const theme = loadTheme(name, cwd, inputs.themePaths);
      if (theme) themes.push(theme);
      else themeDiagnostics.push({ kind: 'warning', message: `Failed to load theme '${name}'.` });
    }
  }

  const resolvedThemes = captureThemes(themes, themeDiagnostics);

  const baseSystemPrompt = resolvePromptInput(inputs.systemPrompt, cwd);
  const systemPrompt = inputs.systemPromptOverride ? inputs.systemPromptOverride(baseSystemPrompt) : baseSystemPrompt;
  if (systemPrompt !== undefined) resourceText(systemPrompt);
  const baseAppend = inputs.appendSystemPrompt
    .map(entry => resolvePromptInput(entry, cwd))
    .filter((entry): entry is string => entry !== undefined && entry.length > 0);
  const appendSystemPrompt = captureResourceText(inputs.appendSystemPromptOverride ? inputs.appendSystemPromptOverride(baseAppend) : baseAppend);
  const snapshot: ResourceSnapshot = Object.freeze({
    extensions,
    skills,
    themes: resolvedThemes,
    systemPrompt,
    appendSystemPrompt,
    skillPaths: inputs.skillPaths,
    themePaths: inputs.themePaths,
    noSkills: inputs.noSkills,
    noContextFiles: inputs.noContextFiles,
  });
  signal.throwIfAborted();
  return snapshot;
}
