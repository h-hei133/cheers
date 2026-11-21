export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export function isOpenRouterAddress(value: string | undefined): boolean {
  return value?.trim().replace(/\/+$/, '') === OPENROUTER_BASE_URL;
}
