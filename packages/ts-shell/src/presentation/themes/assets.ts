import { createRequire } from "node:module";

// Native JSON loading also works on the declared Node floor, before import attributes.
const nativeRequire = createRequire(import.meta.url);
// Keep literal require calls visible to the executable bundler so it embeds the assets.
export const dark: typeof import("./dark.json") = typeof require === "function" ? require("./dark.json") : nativeRequire("./dark.json");
export const light: typeof import("./light.json") = typeof require === "function" ? require("./light.json") : nativeRequire("./light.json");
export const darkContrast: typeof import("./dark-contrast.json") = typeof require === "function" ? require("./dark-contrast.json") : nativeRequire("./dark-contrast.json");
export const lightContrast: typeof import("./light-contrast.json") = typeof require === "function" ? require("./light-contrast.json") : nativeRequire("./light-contrast.json");
export const schema: typeof import("./schema.json") = typeof require === "function" ? require("./schema.json") : nativeRequire("./schema.json");
