export function shouldBuildContextPlanningSurface(prompt: string): boolean {
  return /\b(?:context packet|targeted context|planning context|related files|related tests|suggested reads|missing context|plan(?:ning)? surface|analysis brief|execution plan|analy[sz]e|plan)\b/i.test(
    prompt,
  );
}
