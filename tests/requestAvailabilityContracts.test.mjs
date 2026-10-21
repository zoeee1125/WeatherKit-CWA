import assert from "node:assert/strict";
import test from "node:test";

globalThis.$environment = { "surge-version": "test" };
globalThis.$persistentStore = { read: () => null, write: () => true };
globalThis.$argument = { LogLevel: "OFF", Storage: "database" };

const [{ default: parseWeatherKitURL }, { Request }, { Request: RequestDev }, { Response }, { Response: ResponseDev }, { default: database }] = await Promise.all([
    import("../src/function/parseWeatherKitURL.mjs"),
    import("../src/process/Request.mjs"),
    import("../src/process/Request.dev.mjs"),
    import("../src/process/Response.mjs"),
    import("../src/process/Response.dev.mjs"),
    import("../src/function/database.mjs"),
]);

test("WeatherKit locales split language, script, and country deterministically", () => {
    const cases = [
        ["en-US", "en", "US"],
        ["pt-BR", "pt", "BR"],
        ["zh-Hans-US", "zh-Hans", "US"],
        ["zh-Hant-TW", "zh-Hant", "TW"],
    ];

    for (const [locale, language, country] of cases) {
        const parsed = parseWeatherKitURL(new URL(`https://weatherkit.apple.com/api/v2/weather/${locale}/22.5431/114.0579?dataSets=currentWeather`));
        assert.equal(parsed.language, language, locale);
        assert.equal(parsed.country, country, locale);
    }
});

test("WeatherKit Alert URLs expose validated coordinates through the shared parser", () => {
    assert.deepEqual(parseWeatherKitURL(new URL("https://weatherkit.apple.com/api/v1/weatherAlerts?lang=zh-TW&country=TW&ids=25.037,121.566")), {
        version: "v1",
        language: "zh-TW",
        scale: undefined,
        latitude: "25.037",
        longitude: "121.566",
        country: "TW",
        dataSets: [],
    });
    assert.equal(parseWeatherKitURL(new URL("https://weatherkit.apple.com/api/v1/weatherAlerts?ids=121.566,25.037")).latitude, undefined);
    assert.equal(parseWeatherKitURL(new URL("https://weatherkit.apple.com/api/v1/weatherAlerts/extra?ids=25.037,121.566")).latitude, undefined);
});

test("request preserves WeatherKit dataSets independently of the response processing switch", async () => {
    const input = "currentWeather,forecastDaily,forecastHourly,weatherAlerts";

    for (const handler of [Request, RequestDev]) {
        const request = {
            headers: {},
            method: "GET",
            url: `https://weatherkit.apple.com/api/v2/weather/zh-Hant-TW/25.037/121.566?dataSets=${input}`,
        };
        const result = await handler(request);
        assert.equal(new URL(result.$request.url).searchParams.get("dataSets"), input);
    }
});

test("default processed datasets match the release configuration", () => {
    assert.deepEqual(database.WeatherKit.Settings.DataSets, ["airQuality", "currentWeather", "forecastDaily", "forecastHourly", "forecastNextHour", "weatherAlerts"]);
});

test("request dataSet names map to FlatBuffer root slots", () => {
    assert.deepEqual(database.WeatherKit.Configs.DataSets, {
        airQuality: "airQuality",
        currentWeather: "currentWeather",
        forecastDaily: "forecastDaily",
        forecastHourly: "forecastHourly",
        forecastNextHour: "forecastNextHour",
        news: "news",
        weatherAlerts: "weatherAlerts",
        weatherChange: "weatherChanges",
        trendComparison: "historicalComparisons",
        locationInfo: "locationInfo",
    });
});

test("provider API defaults live in the database", () => {
    assert.equal(database.WeatherKit.Settings.API.CWA.Token, "");
    assert.equal(database.WeatherKit.Settings.API.Environment.Token, "");
    assert.equal(database.WeatherKit.Settings.Weather.Provider, "CWA");
    assert.equal(database.WeatherKit.Settings.WeatherAlerts.Provider, "CWA");
    assert.equal(database.WeatherKit.Settings.AirQuality.Provider, "Environment");
});

test("availability keeps Apple's capabilities and appends plugin requirements in prod and dev", async () => {
    const appleCapabilities = ["currentWeather", "forecastSnowfall", "weatherMaps"];
    const expected = [...new Set([...appleCapabilities, ...database.WeatherKit.Configs.Availability.v2])];

    for (const handler of [Response, ResponseDev]) {
        const response = await handler(
            { url: "https://weatherkit.apple.com/api/v1/availability/en-US/22.5431/114.0579" },
            {
                body: JSON.stringify(appleCapabilities),
                headers: { "Content-Type": "application/json" },
            },
        );
        assert.deepEqual(JSON.parse(response.body), expected);
    }
});
