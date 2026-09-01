const ANSI_REGEX =
  /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b_[^\x07\x1b]*(\x07|\x1b\\)|\x1b[a-zA-Z0-9]/g;

export function stripAnsi(text: string): string {
  if (!text) return "";
  return text.replace(ANSI_REGEX, "");
}

/**
 * Computes terminal column width for a Unicode code point according to UAX #11 (East Asian Width).
 */
export function getCodePointWidth(code: number): number {
  if (code < 32 || (code >= 0x7f && code < 0xa0)) {
    return 0; // Non-printable control character
  }

  // Fast path for ASCII printable characters
  if (code >= 32 && code <= 126) {
    return 1;
  }

  // East Asian Wide / Fullwidth characters & Emojis (2 columns)
  if (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0xa4cf) || // CJK Radicals, Kangxi, Ideographs
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul Syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
    (code >= 0xfe10 && code <= 0xfe19) || // Vertical Forms
    (code >= 0xfe30 && code <= 0xfe6f) || // CJK Compatibility Forms
    (code >= 0xff01 && code <= 0xff60) || // Fullwidth Forms
    (code >= 0xffe0 && code <= 0xffe6) || // Fullwidth Symbols
    (code >= 0x2600 && code <= 0x27bf) || // Miscellaneous Symbols & Dingbats (✨)
    (code >= 0x1f300 && code <= 0x1f64f) || // Misc Symbols & Pictographs (🚀)
    (code >= 0x1f900 && code <= 0x1f9ff) // Supplemental Symbols & Pictographs
  ) {
    return 2;
  }

  return 1;
}

export function visibleWidth(text: string): number {
  if (!text) return 0;
  const stripped = stripAnsi(text);
  let width = 0;

  for (const char of stripped) {
    const code = char.codePointAt(0);
    if (code !== undefined) {
      width += getCodePointWidth(code);
    }
  }

  return width;
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

    const code = char.codePointAt(0) ?? 0;
    const charWidth = getCodePointWidth(code);

    if (currentWidth >= startCol && currentWidth + charWidth <= startCol + targetWidth) {
      result += char;
      currentWidth += charWidth;
    } else if (currentWidth < startCol) {
      currentWidth += charWidth;
    } else {
      break;
    }
  }

  return {
    text: result,
    width: Math.min(targetWidth, Math.max(0, currentWidth - startCol)),
  };
}
