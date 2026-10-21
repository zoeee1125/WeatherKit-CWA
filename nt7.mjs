globalThis.$environment = { "surge-version": "test" };
const store = { iRingo: '{"WeatherKit":{"Caches":"{\\"location\\":{\\"latitude\\":24.793,\\"longitude\\":120.926,\\"name\\":\\"\\",\\"updatedAt\\":1792618250543}}"}}' };
globalThis.$persistentStore = { read: (k) => store[k] ?? null, write: (v, k) => { store[k] = v; return true; } };
globalThis.$argument = { Storage: "database", LogLevel: "OFF" };
const { Storage } = await import("@nsnanocat/util");
console.log("### getItem('iRingo'):", JSON.stringify(Storage.getItem("iRingo", {})));
console.log("### getItem('@iRingo.WeatherKit.Caches'):", JSON.stringify(Storage.getItem("@iRingo.WeatherKit.Caches", {})));
console.log("### getItem('@iRingo.WeatherKit.Caches.location'):", JSON.stringify(Storage.getItem("@iRingo.WeatherKit.Caches.location", null)));
