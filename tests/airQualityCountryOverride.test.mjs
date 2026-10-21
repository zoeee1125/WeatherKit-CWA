import assert from "node:assert/strict";
import test from "node:test";

globalThis.$environment = { "surge-version": "test" };
globalThis.$persistentStore = { read: () => null, write: () => true };
globalThis.$argument = { LogLevel: "OFF", Storage: "Argument" };

const [{ Request }, { Request: RequestDev }, { Console }, { default: database }] = await Promise.all([
    import("../src/process/Request.mjs"),
    import("../src/process/Request.dev.mjs"),
    import("@nsnanocat/util"),
    import("../src/function/database.mjs"),
]);
Console.logLevel = "OFF";

const weatherUrl = "https://weatherkit.apple.com/api/v2/weather/zh-Hant-TW/24.793/120.926?dataSets=airQuality,currentWeather&country=TW";

async function requestCountry(handler, argument) {
    const originalArgument = globalThis.$argument;
    globalThis.$argument = argument;
    try {
        const { $request } = await handler({ headers: {}, method: "GET", url: weatherUrl });
        return new URL($request.url).searchParams.get("country");
    } finally {
        globalThis.$argument = originalArgument;
    }
}

/**
 * 每次呼叫前重設資料庫預設值，避免設定合併把上一次的值帶進來。
 * Reset the database defaults before each call; settings merging is cumulative.
 */
function resetDatabase() {
    database.WeatherKit.Settings.AirQuality.CountryOverride = "";
    database.WeatherKit.Settings.AirQuality.Provider = "Environment";
}

test("air-quality country override rewrites the country sent to Apple", async () => {
    for (const handler of [Request, RequestDev]) {
        resetDatabase();
        assert.equal(await requestCountry(handler, { LogLevel: "OFF", Storage: "Argument" }), "TW");
        resetDatabase();
        assert.equal(await requestCountry(handler, { AirQuality: { CountryOverride: "CN" }, LogLevel: "OFF", Storage: "Argument" }), "CN");
        resetDatabase();
        assert.equal(await requestCountry(handler, { AirQuality: { CountryOverride: "JP" }, LogLevel: "OFF", Storage: "Argument" }), "JP");
    }
});

test("air-quality country override ships empty by default", () => {
    assert.equal(database.WeatherKit.Settings.AirQuality.CountryOverride, "");
    assert.equal(database.WeatherKit.Settings.AirQuality.Provider, "Environment");
});
