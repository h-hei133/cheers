import { expect, it } from "vitest";
import { detectLanguageFromPath, parseSourceSymbols } from "./parser.js";

it("locates declarations in TSX without treating JSX or comments as symbols", () => {
  const source = 'import Main, { value as local } from "./dep.js";\n// function phantom() {}\nexport class View { render() { return <main />; } }\nexport function start() {}';
  const result = parseSourceSymbols("view.tsx", source);
  expect(result.symbols.map(symbol => [symbol.qualifiedName, symbol.kind, symbol.span.startLine])).toEqual([
    ["View", "class", 3], ["View.render", "method", 3], ["start", "function", 4],
  ]);
  expect(result.symbols.filter(symbol => symbol.isExported).map(symbol => symbol.name)).toEqual(["View", "start"]);
  expect(result.imports).toEqual([{ specifier: "./dep.js", importedSymbols: ["Main", "local"], isDefault: true, isNamespace: false }]);
});

it.each([['app.MJS', 'javascript'], ['app.TSX', 'typescript'], ['app.py', 'python'], ['app.rs', 'rust'], ['app.go', 'go'], ['app.json', 'json']] as const)(
  "detects the supported extension %s", (file, language) => expect(detectLanguageFromPath(file)).toBe(language),
);

it("keeps JSON as non-symbol data and tolerates incomplete TypeScript", () => {
  expect(parseSourceSymbols("data.json", '{"function": "class"}').symbols).toEqual([]);
  const result = parseSourceSymbols("partial.ts", "export function unfinished(");
  expect(result.symbols.map(symbol => symbol.name)).toEqual(["unfinished"]);
  expect(result.symbols[0].span.startLine).toBe(1);
});
