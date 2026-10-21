import { readFileSync } from "node:fs";
const { default: QPESUMS } = await import("./src/class/QPESUMS.mjs");
const raw = readFileSync("/tmp/full.json", "utf8");
const header = raw.slice(0, 2048);
const located = QPESUMS.Locate(header);
console.log("### located:", JSON.stringify(located));
// 用同一份完整內容模擬 Range 取得的區塊
for (const [name, lat, lon] of [["台北", 25.033, 121.5654], ["新竹", 24.8068, 120.9697], ["台中", 24.147, 120.6737]]) {
  const coord = QPESUMS.Coordinate(lat, lon);
  const firstRow = coord.y - 1, lastRow = coord.y + 1, firstColumn = coord.x - 1, lastColumn = coord.x + 1;
  const start = located.byte + QPESUMS.Index({ x: firstColumn, y: firstRow }) * QPESUMS.ValueStride;
  const end = located.byte + QPESUMS.Index({ x: lastColumn, y: lastRow }) * QPESUMS.ValueStride + QPESUMS.ValueWidth - 1;
  const block = Buffer.from(raw, "utf8").slice(start, end + 1).toString("utf8");
  const origin = QPESUMS.Index({ x: firstColumn, y: firstRow });
  let max;
  for (let y = firstRow; y <= lastRow; y++) for (let x = firstColumn; x <= lastColumn; x++) {
    const off = (QPESUMS.Index({ x, y }) - origin) * QPESUMS.ValueStride;
    const cell = QPESUMS.ParseValue(block.slice(off, off + 10));
    if (cell !== undefined && (max === undefined || cell > max)) max = cell;
  }
  // 直接從完整內容取中心格
  const center = QPESUMS.ParseValue(raw.slice(located.char + QPESUMS.Index(coord) * 11, located.char + QPESUMS.Index(coord) * 11 + 10));
  console.log(`### ${name} 3x3最大=${max ?? "n/a"} 中心格=${center ?? "n/a"} block長=${block.length}`);
}
