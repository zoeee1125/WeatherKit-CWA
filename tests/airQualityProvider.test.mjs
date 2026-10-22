import assert from "node:assert/strict";
import test from "node:test";
import { ByteBuffer } from "flatbuffers";

globalThis.$environment = { "surge-version": "test" };
globalThis.$persistentStore = { read: () => null, write: () => true };
globalThis.$argument = { LogLevel: "OFF", Storage: "database" };

const [{ default: AirQuality }, { default: AirQualityScale }, { default: WeatherKit2 }, { Request }, { Request: RequestDev }, { Console }, { default: database }] = await Promise.all([
    import("../src/class/AirQuality.mjs"),
    import("../src/class/AirQualityScale.mjs"),
    import("../src/class/WeatherKit2.mjs"),
    import("../src/process/Request.mjs"),
    import("../src/process/Request.dev.mjs"),
    import("@nsnanocat/util"),
    import("../src/function/database.mjs"),
]);
Console.logLevel = "OFF";

const parameters = { country: "TW", language: "zh-Hant-TW", latitude: 25.033, longitude: 121.5654, version: "v2" };

test("air-quality scale exposes six Traditional Chinese levels with colors", () => {
    const built = new AirQualityScale().Build("zh-Hant-TW", "TW.AQI");
    assert.equal(built.status, 200);
    const scale = JSON.parse(built.body);

    assert.equal(scale.name, "TW.AQI");
    assert.equal(scale.language, "zh-Hant-TW");
    assert.equal(scale.aqi.numerical, true);
    assert.equal(scale.aqi.ascending, true);
    assert.deepEqual(scale.aqi.range, [0, 500]);
    assert.deepEqual(
        scale.aqi.categories.map(({ range }) => range),
        [
            [0, 50],
            [51, 100],
            [101, 150],
            [151, 200],
            [201, 300],
            [301, 500],
        ],
    );
    assert.deepEqual(
        scale.aqi.categories.map(({ categoryNumber }) => categoryNumber),
        [1, 2, 3, 4, 5, 6],
    );
    assert.deepEqual(
        scale.aqi.categories.map(({ categoryName }) => categoryName),
        ["良好", "普通", "對敏感族群不健康", "不健康", "非常不健康", "危害"],
    );
    for (const category of scale.aqi.categories) {
        assert.match(category.color, /^#[0-9A-F]{6}$/i);
        assert.ok(category.recommendation.length > 0);
    }
    assert.ok(scale.aqi.gradient.stops.length > 0);
});

test("air-quality scale falls back to English and rejects unknown scales", () => {
    const english = new AirQualityScale().Build("en-US", "TW.AQI");
    assert.equal(JSON.parse(english.body).language, "en-US");
    assert.equal(JSON.parse(english.body).aqi.categories[0].categoryName, "Good");

    assert.equal(new AirQualityScale().Build("zh-Hant-TW", "UNKNOWN.AQI"), undefined);
    assert.equal(new AirQualityScale().Build("fr-FR", "TW.AQI"), undefined);
});

test("scale identifiers lose their trailing numeric version", () => {
    assert.equal(AirQualityScale.StripVersion("TW.AQI.2604"), "TW.AQI");
    assert.equal(AirQualityScale.StripVersion("TW.AQI"), "TW.AQI");
    assert.equal(AirQualityScale.StripVersion(undefined), undefined);
});

test("request answers air-quality scales locally in prod and dev", async () => {
    const originalArgument = globalThis.$argument;
    globalThis.$argument = { LogLevel: "OFF", Storage: "database" };
    for (const handler of [Request, RequestDev]) {
        for (const [input, expected] of [
            ["TW.AQI", "TW.AQI"],
            ["TW.AQI.2604", "TW.AQI"],
        ]) {
            const { $request, $response } = await handler({
                headers: {},
                method: "GET",
                url: `https://weatherkit.apple.com/api/v1/airQualityScale/zh-Hant-TW/${input}`,
            });

            assert.equal($response?.status, 200, input);
            assert.equal(JSON.parse($response.body).name, expected, input);
            assert.equal(new URL($request.url).pathname, `/api/v1/airQualityScale/zh-Hant-TW/${input}`);
        }
    }
    globalThis.$argument = originalArgument;
});

test("request leaves unsupported scales to Apple after stripping the version", async () => {
    const originalArgument = globalThis.$argument;
    globalThis.$argument = { LogLevel: "OFF", Storage: "database" };
    for (const handler of [Request, RequestDev]) {
        const { $request, $response } = await handler({
            headers: {},
            method: "GET",
            url: "https://weatherkit.apple.com/api/v1/airQualityScale/zh-Hant-TW/EPA_NowCast.2604",
        });

        assert.equal($response, undefined);
        assert.equal(new URL($request.url).pathname, "/api/v1/airQualityScale/zh-Hant-TW/EPA_NowCast");
    }
    globalThis.$argument = originalArgument;
});

test("AQI values map onto the six Taiwan categories", () => {
    const cases = [
        [0, 1],
        [50, 1],
        [51, 2],
        [100, 2],
        [101, 3],
        [150, 3],
        [151, 4],
        [200, 4],
        [201, 5],
        [300, 5],
        [301, 6],
        [500, 6],
    ];
    for (const [aqi, expected] of cases) assert.equal(AirQuality.CategoryNumber(aqi), expected, String(aqi));
    assert.equal(AirQuality.CategoryNumber(undefined), undefined);
});

test("MOENV numeric parsing treats sentinels as absent", () => {
    for (const value of ["", "-", "X", "x", "N/A", "NA", "null", "undefined", null, undefined]) assert.equal(AirQuality.ToNumber(value), undefined, String(value));
    assert.equal(AirQuality.ToNumber(" 20.5 "), 20.5);
    assert.equal(AirQuality.ToNumber("0"), 0);
});

test("MOENV timestamps are parsed as UTC+8", () => {
    assert.equal(AirQuality.ToUnixSeconds("2026/10/21 12:00:00"), Date.parse("2026-10-21T12:00:00+08:00") / 1000);
    assert.equal(AirQuality.ToUnixSeconds(""), undefined);
    assert.equal(AirQuality.ToUnixSeconds("not a time"), undefined);
});

test("air-quality fixture produces a complete WeatherKit fragment", async () => {
    const provider = new AirQuality(parameters, "", { useFixture: true });
    const current = await provider.Current();

    assert.equal(provider.available, true);
    assert.equal(current.scale, AirQualityScale.RequestName);
    assert.equal(current.index, 72);
    assert.equal(current.categoryIndex, 2);
    assert.equal(current.primaryPollutant, "PM2_5");
    assert.equal(current.metadata.providerName, "環境部");
    assert.equal(current.metadata.sourceType, "STATION");
    assert.equal(current.pollutants.length, 8);
    for (const pollutant of current.pollutants) {
        assert.equal(typeof pollutant.amount, "number");
        assert.equal(pollutant.units, "MICROGRAMS_PER_CUBIC_METER");
    }
});

test("air-quality provider requires an API key unless a fixture is used", async () => {
    const withoutKey = new AirQuality(parameters, "");
    assert.equal(withoutKey.available, false);
    assert.equal(await withoutKey.Current(), undefined);

    const withKey = new AirQuality(parameters, "token");
    assert.equal(withKey.available, true);
});

test("air-quality fragment round-trips through the FlatBuffer codec", async () => {
    const provider = new AirQuality(parameters, "", { useFixture: true });
    const current = await provider.Current();
    const apple = {
        metadata: { attributionUrl: "https://weather-data.apple.com/", expireTime: 1, language: "zh-TW", latitude: 25.033, longitude: 121.5654, providerName: "Apple Weather", readTime: 1, reportedTime: 1, temporarilyUnavailable: false, sourceType: "MODELED" },
        scale: "EPA_NowCast",
        index: 40,
        categoryIndex: 1,
        pollutants: [],
        previousDayComparison: "UNKNOWN",
        primaryPollutant: "PM2_5",
        isSignificant: false,
    };
    const merged = { ...apple, ...current, metadata: { ...apple.metadata, ...current.metadata } };

    const rawBody = WeatherKit2.encode(undefined, { airQuality: merged });
    const decoded = WeatherKit2.decode(new ByteBuffer(rawBody), ["airQuality"]);

    // 注入的標準識別碼帶修訂版號，用來讓天氣 App 重新抓取定義（見 AirQualityScale.Revision）。
    // The injected scale carries the revision so the Weather app refetches the definition.
    assert.equal(decoded.airQuality.scale, AirQualityScale.RequestName);
    assert.equal(decoded.airQuality.scale, `TW.AQI.${AirQualityScale.Revision}`);
    assert.equal(decoded.airQuality.index, 72);
    assert.equal(decoded.airQuality.categoryIndex, 2);
    assert.equal(decoded.airQuality.pollutants.length, 8);
    assert.equal(decoded.airQuality.metadata.providerName, "環境部");
});

test("air-quality settings ship with Environment defaults", () => {
    assert.equal(database.WeatherKit.Settings.AirQuality.Provider, "Environment");
    assert.equal(database.WeatherKit.Settings.API.Environment.Token, "");
    assert.ok(database.WeatherKit.Settings.DataSets.includes("airQuality"));
});
