export interface ReadInspectIntentProjection {
  readonly hasFileReadIntent: boolean;
  readonly hasTargetedFileReadIntent: boolean;
  readonly hasRepositoryInspectIntent: boolean;
}

export function classifyReadInspectIntent(
  groundedIntentPrompt: string,
): ReadInspectIntentProjection {
  const hasTargetedFileReadIntent =
    /(?:\bread(?:ing)?\b|\bopen\b|\bshow\b|\bprint\b|\u67e5\u770b|\u8bfb\u53d6|\u770b\u770b|\u524d\s*\d+\s*\u884c)/i.test(
      groundedIntentPrompt,
    );
  const hasRepositoryInspectIntent =
    /(?:\binspect\b|\banaly[sz]e\b|\blist\b|\bfind\b[^.!?\n]*\bfiles?\b|\bfiles?\b[^.!?\n]*\bworkspace\b|\u5206\u6790|\u5217\u51fa|\u6587\u4ef6\u5217\u8868)/i.test(
      groundedIntentPrompt,
    );

  return {
    hasFileReadIntent: hasTargetedFileReadIntent || hasRepositoryInspectIntent,
    hasTargetedFileReadIntent,
    hasRepositoryInspectIntent,
  };
}

export function isPathOnlyReadIntentPrompt(prompt: string): boolean {
  const withoutPaths = prompt
    .replace(
      /([A-Za-z]:[\\/][^\s"'`<>|?*]+|(?:\.\.?[\\/][^\s"'`<>|?*]+)|(?:\/[^\s"'`<>|?*]+)|(?:[A-Za-z0-9._-]+(?:[\\/][A-Za-z0-9._-]+)*\.(?:d\.ts|test\.(?:ts|tsx|jsx|js)|spec\.(?:ts|tsx|jsx|js)|json|tsx|jsx|ts|js|py|go|rs|md|txt|log|yaml|yml|toml)))/g,
      " ",
    )
    .replace(/\b\d+\b/g, " ")
    .replace(/[.,;:!?()[\]{}"'`-]+/g, " ")
    .trim();

  return withoutPaths.length === 0;
}
