export interface Cell { rows: string[]; cols: number; history: string[]; }
export function makeScreen(cols: number, rows: number): Cell { return { rows: Array.from({length: rows}, () => ""), cols, history: [] }; }
export function feed(s: Cell, cursor: {row: number; col: number}, data: string): void {
  let i = 0;
  while (i < data.length) {
    const ch = data[i]!;
    if (ch === "\x1b") {
      const m = /^\x1b\[(\d*)([A-Za-z])/.exec(data.slice(i));
      if (!m) { const q = /^\x1b\[\?(\d+)([hl])/.exec(data.slice(i)); if (q) { i += q[0].length; continue; } throw new Error("unhandled " + JSON.stringify(data.slice(i, i+10))); }
      const n = m[1] === "" ? 1 : Number(m[1]); const c = m[2]!;
      if (c === "A") cursor.row = Math.max(0, cursor.row - n);
      else if (c === "B") cursor.row = Math.min(s.rows.length - 1, cursor.row + n);
      else if (c === "J") { s.rows[cursor.row] = (s.rows[cursor.row] ?? "").slice(0, cursor.col); for (let r = cursor.row + 1; r < s.rows.length; r++) s.rows[r] = ""; }
      else if (c === "K") s.rows[cursor.row] = (s.rows[cursor.row] ?? "").slice(0, cursor.col);
      else throw new Error("CSI " + c);
      i += m[0].length; continue;
    }
    if (ch === "\r") { cursor.col = 0; i++; continue; }
    if (ch === "\n") { cursor.row++; if (cursor.row >= s.rows.length) { s.history.push(s.rows.shift() ?? ""); s.rows.push(""); cursor.row = s.rows.length - 1; } i++; continue; }
    const row = s.rows[cursor.row] ?? "";
    s.rows[cursor.row] = row.length > cursor.col ? row.slice(0, cursor.col) + ch + row.slice(cursor.col + 1) : row.padEnd(cursor.col, " ") + ch;
    cursor.col = Math.min(s.cols - 1, cursor.col + 1); i++;
  }
}
