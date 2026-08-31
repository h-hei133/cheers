const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "");
}

export function visibleWidth(text: string): number {
  return stripAnsi(text).length;
}

export function sliceWithWidth(
  text: string,
  startCol: number,
  targetWidth: number,
): { readonly text: string; readonly width: number } {
  let currentWidth = 0;
  let inAnsi = false;
  let ansiBuf = "";
  let result = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "\x1b") {
      inAnsi = true;
      ansiBuf += char;
      continue;
    }
    if (inAnsi) {
      ansiBuf += char;
      if (char === "m" || char === "\x07" || char === "\\") {
        inAnsi = false;
        if (currentWidth >= startCol && currentWidth < startCol + targetWidth) {
          result += ansiBuf;
        }
        ansiBuf = "";
      }
      continue;
    }

    if (currentWidth >= startCol && currentWidth < startCol + targetWidth) {
      result += char;
    }
    currentWidth += 1;
    if (currentWidth >= startCol + targetWidth) {
      break;
    }
  }

  return {
    text: result,
    width: Math.min(targetWidth, Math.max(0, currentWidth - startCol)),
  };
}
