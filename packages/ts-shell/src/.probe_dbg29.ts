const rows = ["one"], chromeRows = ["chrome"];
console.log("rows len:", rows.length, "chrome len:", chromeRows.length);
const diff = rows.length - chromeRows.length;
console.log("diff:", diff, "diff > 0:", diff > 0);
const content = diff > 0 ? rows.slice(0, diff) : rows;
console.log("content:", JSON.stringify(content));
