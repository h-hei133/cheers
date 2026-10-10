/** A bounded wait reports uncertainty while the exact owner continues cleanup. */
export async function settledWithin(promise: Promise<unknown>, timeoutMs = 3000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise.then(() => true, () => false), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })]); }
  finally { clearTimeout(timer); }
}
