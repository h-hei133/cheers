/**
 * Which interactive surface the environment can support.
 *
 * A differential full-screen renderer needs cursor addressing and a window size.
 * Over a pipe it has neither, so the decision has to be made before either
 * surface is constructed — and by a module light enough that the startup path can
 * ask without pulling in the renderer.
 */

/** Whether both ends of the session are a real terminal. */
export function supportsFullScreenSurface(
  stdin: NodeJS.ReadStream | undefined,
  stdout: NodeJS.WriteStream | undefined,
): boolean {
  return Boolean(stdin?.isTTY) && Boolean(stdout?.isTTY);
}
