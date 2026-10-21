globalThis.$environment = { "surge-version": "test" };
globalThis.$persistentStore = { read: () => null, write: () => true };
globalThis.$argument = { LogLevel: "OFF", Storage: "database" };
const T = "CWA-C7CCA228-7380-4E15-A6BB-DB06087ACAD9";
const { default: QPESUMS } = await import("./src/class/QPESUMS.mjs");
const url = await QPESUMS.Resolve(QPESUMS.URL(QPESUMS.FutureDataset, T));
console.log("### url:", url.slice(0, 80));
const header = await (await fetch(url, { headers: { Range: "bytes=0-2047" } })).text();
const located = QPESUMS.Locate(header);
console.log("### located:", JSON.stringify(located), "| header len:", header.length);
const coord = QPESUMS.Coordinate(25.033, 121.5654);
console.log("### coord:", JSON.stringify(coord));
const firstRow = coord.y - 1, lastRow = coord.y + 1, firstColumn = coord.x - 1, lastColumn = coord.x + 1;
const start = located.byte + QPESUMS.Index({ x: firstColumn, y: firstRow }) * QPESUMS.ValueStride;
const end = located.byte + QPESUMS.Index({ x: lastColumn, y: lastRow }) * QPESUMS.ValueStride + QPESUMS.ValueWidth - 1;
console.log("### start byte:", start, "end byte:", end, "len:", end - start + 1);
const block = await (await fetch(url, { headers: { Range: `bytes=${start}-${end}` } })).text();
console.log("### block len:", block.length, "| 前 60:", JSON.stringify(block.slice(0, 60)));
const origin = QPESUMS.Index({ x: firstColumn, y: firstRow });
for (let y = firstRow; y <= lastRow; y++) {
  const row = [];
  for (let x = firstColumn; x <= lastColumn; x++) {
    const off = (QPESUMS.Index({ x, y }) - origin) * QPESUMS.ValueStride;
    row.push(JSON.stringify(block.slice(off, off + 10)));
  }
  console.log("### y=" + y, row.join(" "));
}
