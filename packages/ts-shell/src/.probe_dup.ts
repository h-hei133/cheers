import { MainScreenPainter, type MainScreenDevice } from "./presentation/tui/render/mainScreen.js";
import { feed, makeScreen } from "./.probe_emulator.js";
const COLS = 40, ROWS = 8;
const screen = makeScreen(COLS, ROWS);
const cursor = { row: 1, col: 0 };
const device: MainScreenDevice = {
  getDimensions: () => ({ columns: COLS, rows: ROWS }),
  capabilities: { supportsDec2026Sync: false },
  write: (d) => feed(screen, cursor, d),
} as unknown as MainScreenDevice;
const p = new MainScreenPainter(device);
p.start();
// First frame of a session: an empty transcript, so the frame is the block alone.
p.paint(["prompt>"], ["prompt>"]);
console.log("screen    :", JSON.stringify(screen.rows.map(r => r.trim())));
console.log("scrollback:", JSON.stringify(screen.history.map(r => r.trim())));
const all = [...screen.history, ...screen.rows].filter(r => r.trim());
console.log("occurrences of prompt>:", all.filter(r => r.trim() === "prompt>").length, "(want 1)");
