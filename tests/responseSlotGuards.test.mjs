import assert from "node:assert/strict";
import test from "node:test";
import { Builder, ByteBuffer } from "flatbuffers";

globalThis.$environment = { "surge-version": "test" };
globalThis.$persistentStore = { read: () => null, write: () => true };
globalThis.$argument = { LogLevel: "OFF", Storage: "database" };

const [{ default: WeatherKit2 }, { Response }, { Response: ResponseDev }, { Console }] = await Promise.all([
    import("../src/class/WeatherKit2.mjs"),
    import("../src/process/Response.mjs"),
    import("../src/process/Response.dev.mjs"),
    import("@nsnanocat/util"),
]);
Console.logLevel = "OFF";

/**
 * 建立只包含指定 slot 的空白根資料表。
 * Build a root table containing only the given empty slots.
 * @param {number[]} presentSlots 要保留的 slot 編號 / Slot indexes to keep.
 * @returns {Uint8Array}
 */
function createWeatherRoot(presentSlots) {
    const builder = new Builder(256);
    const tables = new Map(presentSlots.map(slot => [slot, createEmptyTable(builder)]));
    builder.startObject(Math.max(10, ...presentSlots.map(slot => slot + 1)));
    for (const [slot, offset] of tables) builder.addFieldOffset(slot, offset, 0);
    const root = builder.endObject();
    builder.finish(root);
    return builder.asUint8Array().slice();
}

function createEmptyTable(builder) {
    builder.startObject(0);
    return builder.endObject();
}

async function runResponseHandler(handler, request, response) {
    const previousRequest = globalThis.$request;
    globalThis.$request = request;
    try {
        return await handler(request, response);
    } finally {
        globalThis.$request = previousRequest;
    }
}

test("response never encodes an absent slot as a non-object patch entry", async () => {
    const originalArgument = globalThis.$argument;
    globalThis.$argument = {
        AirQuality: { Provider: "Environment" },
        DataSets: ["airQuality", "currentWeather", "forecastDaily", "forecastHourly", "weatherAlerts"],
        LogLevel: "OFF",
        Storage: "database",
        Weather: { Provider: "CWA" },
        WeatherAlerts: { Provider: "CWA" },
    };

    try {
        // 根資料表完全沒有任何 slot，模擬 Apple 省略全部資料。
        // The root table has no slots at all, mimicking an Apple payload that omits everything.
        const bodyBytes = createWeatherRoot([]);
        for (const handler of [Response, ResponseDev]) {
            const response = await runResponseHandler(
                handler,
                { headers: {}, url: "https://weatherkit.apple.com/api/v2/weather/zh-Hant-TW/25.033/121.5654?country=TW&dataSets=airQuality,currentWeather,forecastDaily,forecastHourly,weatherAlerts" },
                { bodyBytes, headers: { "Content-Type": "application/vnd.apple.flatbuffer" } },
            );

            const decoded = WeatherKit2.decode(new ByteBuffer(new Uint8Array(response.body)), ["airQuality", "currentWeather", "forecastDaily", "forecastHourly", "weatherAlerts"]);
            assert.deepEqual(Object.keys(decoded), []);
        }
    } finally {
        globalThis.$argument = originalArgument;
    }
});

test("response keeps an existing slot when its injection yields nothing", async () => {
    const originalArgument = globalThis.$argument;
    globalThis.$argument = {
        DataSets: ["weatherAlerts"],
        LogLevel: "OFF",
        Storage: "database",
        WeatherAlerts: { Provider: "CWA" },
    };

    try {
        // 保留一個空的 weatherAlerts slot，但沒有 API key 可注入內容。
        // Keep an empty weatherAlerts slot while no API key is available for injection.
        const bodyBytes = createWeatherRoot([6]);
        for (const handler of [Response, ResponseDev]) {
            const response = await runResponseHandler(
                handler,
                { headers: {}, url: "https://weatherkit.apple.com/api/v2/weather/zh-Hant-TW/25.033/121.5654?country=TW&dataSets=weatherAlerts" },
                { bodyBytes, headers: { "Content-Type": "application/vnd.apple.flatbuffer" } },
            );

            const decoded = WeatherKit2.decode(new ByteBuffer(new Uint8Array(response.body)), ["weatherAlerts"]);
            assert.deepEqual(Object.keys(decoded), ["weatherAlerts"]);
        }
    } finally {
        globalThis.$argument = originalArgument;
    }
});
