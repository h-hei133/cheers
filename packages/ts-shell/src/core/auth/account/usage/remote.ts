import type { OpenAIAccountAuthConfig } from '../../../../config/runtimeConfig.js';
import { requestPublic } from '../../../network/connection.js';
import { requestScope } from '../../../network/request.js';
import { discardResponse, parseResponseJson, readResponseText } from '../../../network/response.js';
import { isRecord } from '../../../values/record.js';
import type { AccountUsage, ResetCredit, ResetAttempt, UsageWindow } from './model.js';

const origin = 'https://chatgpt.com/backend-api';
const maxBytes = 128 * 1024;
export class AccountUsageError extends Error {
  constructor(readonly code: 'authentication' | 'unsupported' | 'invalid-response' | 'network') {
    super(`Account usage ${code}; no provider response body was retained.`);
  }
}

/** This account protocol has a fixed issuer; model endpoint overrides never receive its token. */
async function accountRequest(account: OpenAIAccountAuthConfig, route: string, check: () => void, signal?: AbortSignal, body?: string): Promise<unknown> {
  const scope = requestScope(15000, signal);
  try {
    check();
    const headers = { Authorization: `Bearer ${account.accessToken}`, 'ChatGPT-Account-Id': account.accountId!, 'Content-Type': 'application/json' };
    const response = await requestPublic(`${origin}/${route}`, { method: body === undefined ? 'GET' : 'POST', headers, maxBytes, ...(body === undefined ? {} : { body }) },
      { ...scope, check: () => { scope.check(); check(); } });
    if (!response.ok) {
      discardResponse(response);
      throw new AccountUsageError(response.status === 401 || response.status === 403 ? 'authentication' : response.status === 404 ? 'unsupported' : 'network');
    }
    const payload = parseResponseJson(await readResponseText(response, scope, maxBytes));
    check(); return payload;
  } catch (error) {
    throw error instanceof AccountUsageError ? error : new AccountUsageError('network');
  } finally { scope.dispose(); }
}

function usageWindow(name: UsageWindow['name'], value: unknown): UsageWindow | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || typeof value.used_percent !== 'number' || !Number.isFinite(value.used_percent)
    || value.used_percent < 0 || value.used_percent > 100) throw new AccountUsageError('invalid-response');
  const reset = value.reset_at;
  if (reset !== undefined && (typeof reset !== 'number' || !Number.isFinite(reset) || reset < 0 || reset > 8640000000000)) throw new AccountUsageError('invalid-response');
  return { name, usedPercent: value.used_percent, ...(typeof reset === 'number' ? { resetsAt: new Date(reset * 1000).toISOString() } : {}) };
}

function credit(value: unknown): ResetCredit | undefined {
  if (!isRecord(value) || value.status !== 'available') return undefined;
  if (typeof value.id !== 'string' || !/^[A-Za-z0-9._-]{1,200}$/.test(value.id)
    || typeof value.reset_type !== 'string' || value.reset_type !== 'codex_rate_limits'
    || typeof value.expires_at !== 'string' || !Number.isFinite(Date.parse(value.expires_at))) throw new AccountUsageError('invalid-response');
  if (Date.parse(value.expires_at) <= Date.now()) return undefined;
  return { id: value.id, resetType: value.reset_type, expiresAt: new Date(value.expires_at).toISOString() };
}

export async function loadAccountUsage(account: OpenAIAccountAuthConfig, check: () => void, signal?: AbortSignal): Promise<AccountUsage> {
  const usage = await accountRequest(account, 'wham/usage', check, signal);
  if (!isRecord(usage) || !isRecord(usage.rate_limit)) throw new AccountUsageError('invalid-response');
  const windows = [usageWindow('primary', usage.rate_limit.primary_window), usageWindow('secondary', usage.rate_limit.secondary_window)]
    .filter((window): window is UsageWindow => window !== undefined);
  const base = { source: `${origin}/wham/usage; ${origin}/wham/rate-limit-reset-credits`, fetchedAt: new Date().toISOString(), windows };
  try {
    const list = await accountRequest(account, 'wham/rate-limit-reset-credits', check, signal);
    if (!isRecord(list) || !Array.isArray(list.credits) || list.credits.length > 128
      || !Number.isSafeInteger(list.available_count) || Number(list.available_count) < 0) throw new AccountUsageError('invalid-response');
    const credits = list.credits.map(credit).filter((value): value is ResetCredit => value !== undefined)
      .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
    if (new Set(credits.map(value => value.id)).size !== credits.length || credits.length > Number(list.available_count)) throw new AccountUsageError('invalid-response');
    return { ...base, credits, availableCount: Number(list.available_count), creditStatus: 'available' };
  } catch (error) {
    check(); return { ...base, credits: [], creditStatus: error instanceof AccountUsageError && error.code === 'unsupported' ? 'unsupported' : 'unavailable' };
  }
}

export async function consumeResetCredit(account: OpenAIAccountAuthConfig, attempt: ResetAttempt, check: () => void, signal?: AbortSignal): Promise<NonNullable<ResetAttempt['code']> | 'unknown'> {
  const response = await accountRequest(account, 'wham/rate-limit-reset-credits/consume', check, signal,
    JSON.stringify({ account_id: account.accountId, credit_id: attempt.credit.id, redeem_request_id: attempt.id }));
  // A successful HTTP status without an explicit business result does not prove a reset.
  return isRecord(response) && ['reset', 'no_credit', 'nothing_to_reset', 'already_redeemed'].includes(String(response.code))
    ? response.code as NonNullable<ResetAttempt['code']> : 'unknown';
}
