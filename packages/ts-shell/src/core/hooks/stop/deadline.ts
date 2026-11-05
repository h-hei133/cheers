/** Node coerces larger delays to 1 ms; long positive deadlines need bounded timer chunks. */
export function stopDeadline(timeoutMs: number, expired: () => void): () => void {
  let remaining = timeoutMs;
  let timer: ReturnType<typeof setTimeout>;
  const schedule = (): void => {
    const chunk = Math.min(remaining, 2 ** 31 - 1);
    timer = setTimeout(() => {
      remaining -= chunk;
      if (remaining > 0) schedule(); else expired();
    }, chunk);
  };
  schedule();
  return () => clearTimeout(timer);
}
