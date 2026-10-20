/** Route an asynchronous output-stream failure into the owning line loop. */
export function bindOutputFailure(
  output: Pick<NodeJS.WriteStream, "on" | "off">,
  fail: (error: Error) => void,
): () => void {
  const listener = (error: Error): void => fail(error);
  output.on("error", listener);
  return () => output.off("error", listener);
}
