export function interpolateEnvVars(text: string): string {
  // Replace ${VAR_NAME} and $VAR_NAME
  return text
    .replace(/\$\{([A-Za-z0-9_]+)\}/g, (_, varName: string) => {
      return process.env[varName] ?? "";
    })
    .replace(/\$([A-Za-z0-9_]+)/g, (_, varName: string) => {
      return process.env[varName] ?? "";
    });
}

export function parseSettingsJson(rawJson: string): unknown {
  const interpolated = interpolateEnvVars(rawJson);
  try {
    return JSON.parse(interpolated);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse settings JSON: ${msg}`);
  }
}
