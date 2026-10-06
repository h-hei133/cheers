import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { defaultTheme, type Theme, type ThemeColorToken } from "./theme.js";
import { stripAnsi } from "../tui/text/ansi.js";

const highlighter = hljs.newInstance();
for (const [name, language] of Object.entries({ bash, c, cpp, csharp, css, diff, dockerfile, go, ini, java, javascript, json, markdown, php, python, ruby, rust, sql, typescript, xml, yaml })) {
  highlighter.registerLanguage(name, language);
}
highlighter.registerAliases(["zsh"], { languageName: "bash" });

const TOKENS: Readonly<Record<string, ThemeColorToken>> = {
  keyword: "syntaxKeyword", string: "syntaxString", number: "syntaxNumber", comment: "syntaxComment",
  title: "syntaxFunction", built_in: "syntaxBuiltin", type: "syntaxType", literal: "syntaxNumber",
  attr: "syntaxVariable", attribute: "syntaxVariable",
  meta: "syntaxMeta", regexp: "syntaxString", addition: "diffAdded", deletion: "diffRemoved",
  section: "mdHeading", symbol: "syntaxBuiltin",
};

const ENTITIES: Readonly<Record<string, string>> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'", "&#39;": "'" };

/** The engine emits escaped text and nested spans; only their scope becomes styling. */
function renderScopes(html: string, theme: Theme): string {
  const scopes: Array<ThemeColorToken | undefined> = [];
  let output = "";
  for (const match of html.matchAll(/<span class="([^"]*)">|<\/span>|([^<]+)/g)) {
    if (match[1] !== undefined) {
      const scope = match[1].split(/\s+/).find((name) => name.startsWith("hljs-"))?.slice(5).split(".")[0];
      scopes.push(scope && Object.hasOwn(TOKENS, scope) ? TOKENS[scope] : undefined);
    } else if (match[0] === "</span>") {
      scopes.pop();
    } else {
      const text = match[0].replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (entity) => ENTITIES[entity]!);
      const token = [...scopes].reverse().find((value) => value !== undefined) ?? "syntaxText";
      // Close color on each line so the next line's border never inherits code styling.
      output += text.split("\n").map((line) => line ? theme.fg(token, line) : "").join("\n");
    }
  }
  return output;
}

/** Close fallback color at each line boundary, just like successfully highlighted code. */
function fallback(code: string, theme: Theme): string {
  try { return code.split("\n").map(line => line ? theme.fg("mdCodeBlock", line) : "").join("\n"); }
  catch { return code; }
}

/** Explicit grammar or semantic fallback; styling never rewrites the source. */
export function highlightCode(code: string, language: string, theme: Theme = defaultTheme): string {
  if (theme.colorMode === "none") return code;
  if (code.length > 64 * 1024 || !language || !highlighter.getLanguage(language)) return fallback(code, theme);
  try {
    const html = highlighter.highlight(code, { language, ignoreIllegals: true }).value;
    const rendered = renderScopes(html, theme);
    return stripAnsi(rendered) === code ? rendered : fallback(code, theme);
  } catch {
    return fallback(code, theme);
  }
}
