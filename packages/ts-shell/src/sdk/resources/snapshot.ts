import { redactReportText } from '../../core/security/redaction.js';
import type { Skill } from '../../core/skills/skillLoader.js';
import type { ThemeConfig } from '../../presentation/themes/index.js';
import type { LoadExtensionsResult, ResourceDiagnostic, ResourceSnapshot } from './contract.js';
import { captureExtension } from './extension.js';
import { resourceArray, resourceFields, resourceRecord, resourceText } from './data.js';

export function resourceReport(value: unknown): string { return redactReportText(resourceText(value), 512); }

export function captureDiagnostics(value: unknown): readonly ResourceDiagnostic[] {
  return Object.freeze(resourceArray(value).map(item => {
    const fields = resourceFields(item);
    if (fields.kind !== 'warning' && fields.kind !== 'error') throw new Error('Resource diagnostic kind is invalid.');
    return Object.freeze({ kind: fields.kind, message: resourceReport(fields.message),
      ...(fields.path !== undefined ? { path: resourceReport(fields.path) } : {}) });
  }));
}

export function captureSkills(value: ResourceSnapshot['skills']): ResourceSnapshot['skills'] {
  const fields = resourceFields(value);
  const skills = Object.freeze(resourceArray(fields.skills).map(skill => resourceRecord<Skill>(skill, ['isCurrent'])));
  return Object.freeze({ skills, diagnostics: captureDiagnostics(fields.diagnostics) });
}

export function captureThemes(themes: readonly ThemeConfig[], diagnostics: readonly ResourceDiagnostic[]): ResourceSnapshot['themes'] {
  return Object.freeze({ themes: Object.freeze(resourceArray(themes).map(theme => resourceRecord<ThemeConfig>(theme))),
    diagnostics: captureDiagnostics(diagnostics) });
}

export function captureExtensions(value: LoadExtensionsResult): LoadExtensionsResult {
  const fields = resourceFields(value);
  const extensions = Object.freeze(resourceArray(fields.extensions).map(item => {
    const entry = resourceFields(item);
    return Object.freeze({ source: resourceReport(entry.source), extension: captureExtension(entry.extension) });
  }));
  const errors = Object.freeze(resourceArray(fields.errors).map(item => {
    const entry = resourceFields(item);
    return Object.freeze({ path: resourceReport(entry.path), error: resourceReport(entry.error) });
  }));
  return Object.freeze({ extensions, errors });
}

export function captureResourceText(value: unknown): readonly string[] {
  return Object.freeze(resourceArray(value).map(resourceText));
}
