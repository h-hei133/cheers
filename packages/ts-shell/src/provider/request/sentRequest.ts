/**
 * A request that has already been sent, kept so it can be sent again.
 *
 * Keeping a prompt cached means sending that prompt again, and a prompt is only
 * the same prompt if the bytes are the same. A request rebuilt from the session's
 * history is not: the system instruction, the microcompaction of old turns and
 * the bridging of tool results are all applied on the way out, so a rebuild
 * arrives as a different prefix — a cache miss charged at the full write price,
 * which is the opposite of what a refresh is for.
 *
 * So the request is captured where it is made and replayed from what was
 * captured.
 */

export interface SentRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  /** The body exactly as it went out. */
  readonly body: string;
}

/** The ceiling a refresh asks for, whatever the endpoint calls the field. */
const MINIMUM_OUTPUT = 1;

/**
 * Send a captured request again, asking for the least output the provider allows.
 *
 * The prefix is left untouched — it is what the cache is keyed on — and only the
 * output ceiling is lowered. Without that the model would answer the whole
 * question a second time and the refresh would cost as much as the request it
 * was meant to make cheaper.
 *
 * The response is drained rather than aborted. A cache write is registered once
 * the provider has processed the prompt, and dropping the connection mid-answer
 * is a race against that; reading to the end costs one token and settles it.
 *
 * A failure is reported as `false` and never raised. Nothing the user did caused
 * it and nothing they could do would fix it, so the caller carries on.
 */
export async function sendSentRequest(
  sent: SentRequest,
  signal: AbortSignal | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(sent.body) as Record<string, unknown>;
  } catch {
    // A body this cannot read is a body this cannot safely re-send.
    return false;
  }

  // Whichever field this endpoint carries the ceiling in. An endpoint that has
  // neither gets `max_tokens`, which is the one that is required rather than
  // optional.
  const ceilingField = "max_completion_tokens" in body
    ? "max_completion_tokens"
    : "max_tokens";
  body[ceilingField] = MINIMUM_OUTPUT;

  try {
    const response = await fetchImpl(sent.url, {
      method: "POST",
      headers: sent.headers,
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) return false;
    // Read it out so the provider finishes the turn it was asked for.
    await response.text();
    return true;
  } catch {
    return false;
  }
}
