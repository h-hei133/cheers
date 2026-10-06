export type Admission = () => string | undefined;

export function assertAdmission(admission?: Admission): void {
  const reason = admission?.();
  if (reason) throw new Error(reason);
}

/** Each new network effect rechecks safety, while request options remain captured. */
export function admittedFetch(fetchImpl: typeof fetch, admission?: Admission): typeof fetch {
  return (input, init) => { assertAdmission(admission); return fetchImpl(input, init); };
}
