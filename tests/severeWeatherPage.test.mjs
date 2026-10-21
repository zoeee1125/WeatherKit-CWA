import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

globalThis.$environment = { "surge-version": "test" };
globalThis.$persistentStore = { read: () => null, write: () => true };
globalThis.$argument = { LogLevel: "OFF", Storage: "database" };

const [{ default: CWA }, { default: WeatherAlerts }, { Request: processRequest }, { Request: processRequestDev }, { Console }] = await Promise.all([
    import("../src/class/CWA.mjs"),
    import("../src/class/WeatherAlerts.mjs"),
    import("../src/process/Request.mjs"),
    import("../src/process/Request.dev.mjs"),
    import("@nsnanocat/util"),
]);
Console.logLevel = "OFF";

const countyWarning = {
    records: {
        location: [
            {
                locationName: "臺北市",
                hazardConditions: {
                    hazards: [{ info: { phenomena: "陸上強風特報" } }],
                },
            },
        ],
    },
};

const strongWindBulletin = {
    records: {
        info: [
            {
                area: [{ areaDesc: "臺北市" }],
                certainty: "Likely",
                category: "Met",
                description: "東北風明顯偏強，請注意防範。",
                effective: "2026-10-21T10:50:00+08:00",
                event: "陸上強風特報",
                eventCode: { value: "strongWind" },
                expires: "2026-10-22T23:00:00+08:00",
                headline: "陸上強風特報(橙色燈號)",
                instruction: "1. 戶外請小心路樹。\n2. 行車減速慢行。",
                onset: "2026-10-21T10:50:00+08:00",
                parameter: [{ valueName: "alert_title", value: "陸上強風特報" }],
                responseType: "Monitor",
                senderName: "中央氣象署",
                severity: "Severe",
                urgency: "Future",
            },
        ],
    },
};

test("CWA builds WeatherKit alerts from county warnings and bulletin details", async () => {
    const originalHttpClient = globalThis.$httpClient;
    const requestedDatasets = [];
    globalThis.$httpClient = {
        get(request, callback) {
            const url = new URL(request.url);
            const dataset = url.pathname.split("/").at(-1);
            requestedDatasets.push(dataset);
            const body = dataset === "W-C0033-001" ? countyWarning : dataset === "W-C0033-006" ? strongWindBulletin : {};
            callback(undefined, { headers: { "Content-Type": "application/json" }, status: 200 }, JSON.stringify({ success: "true", ...body }));
        },
    };

    try {
        const cwa = new CWA({ country: "TW", language: "zh-Hant-TW", latitude: 25.037, longitude: 121.566 }, "token");
        const source = await cwa.WeatherAlert();

        assert.deepEqual(requestedDatasets, ["W-C0033-001", "W-C0033-006"]);
        assert.equal(source.alerts.length, 1);
        assert.equal(source.alerts[0].eventName, "陸上強風特報");
        assert.equal(source.alerts[0].description, "陸上強風特報(橙色燈號)");
        assert.equal(source.alerts[0].severity, "severe");
        assert.equal(source.alerts[0].areaName, "臺北市");
        assert.equal(source.alerts[0].source, "中央氣象署");
        assert.deepEqual(source.alerts[0].guidelines, ["1. 戶外請小心路樹。", "2. 行車減速慢行。"]);

        const built = WeatherAlerts.Build(source, {
            attributionUrl: source.metadata.attributionUrl,
            identifier: "25.037,121.566",
            language: "zh-Hant-TW",
            countryCode: "TW",
        });
        assert.equal(built.length, 1);
        assert.equal(built[0].severity, "severe");
        assert.equal(built[0].phenomenon, "Met");
    } finally {
        globalThis.$httpClient = originalHttpClient;
    }
});

test("CWA returns no alerts when the county has no active hazard", async () => {
    const originalHttpClient = globalThis.$httpClient;
    globalThis.$httpClient = {
        get(_request, callback) {
            callback(undefined, { headers: { "Content-Type": "application/json" }, status: 200 }, JSON.stringify({ success: "true", records: { location: [{ hazardConditions: { hazards: [] } }] } }));
        },
    };

    try {
        const cwa = new CWA({ country: "TW", language: "zh-Hant-TW", latitude: 25.037, longitude: 121.566 }, "token");
        const source = await cwa.WeatherAlert();

        assert.deepEqual(source.alerts, []);
        assert.equal(source.metadata.temporarilyUnavailable, false);
    } finally {
        globalThis.$httpClient = originalHttpClient;
    }
});

test("CWA does not request upstream without an authorization key", async () => {
    const originalHttpClient = globalThis.$httpClient;
    let requestCount = 0;
    globalThis.$httpClient = {
        get(_request, callback) {
            requestCount++;
            callback(undefined, { headers: {}, status: 200 }, JSON.stringify({ success: "true" }));
        },
    };

    try {
        const cwa = new CWA({ country: "TW", language: "zh-Hant-TW", latitude: 25.037, longitude: 121.566 }, "");
        const source = await cwa.WeatherAlert();

        assert.equal(cwa.available, false);
        assert.deepEqual(source.alerts, []);
        assert.equal(requestCount, 0);
    } finally {
        globalThis.$httpClient = originalHttpClient;
    }
});

test("the request scripts answer coordinate identifiers through the CWA provider", async () => {
    const originalArgument = globalThis.$argument;
    const originalHttpClient = globalThis.$httpClient;
    const requestedDatasets = [];
    globalThis.$argument = {
        API: { CWA: { Token: "token" } },
        LogLevel: "OFF",
        Storage: "Argument",
        WeatherAlerts: { Provider: "CWA" },
    };
    globalThis.$httpClient = {
        get(request, callback) {
            const dataset = new URL(request.url).pathname.split("/").at(-1);
            requestedDatasets.push(dataset);
            const body = dataset === "W-C0033-001" ? countyWarning : dataset === "W-C0033-006" ? strongWindBulletin : {};
            callback(undefined, { headers: { "Content-Type": "application/json" }, status: 200 }, JSON.stringify({ success: "true", ...body }));
        },
    };

    try {
        for (const handler of [processRequest, processRequestDev]) {
            requestedDatasets.length = 0;
            const { $response } = await handler({
                method: "GET",
                url: "https://weatherkit.apple.com/api/v1/weatherAlerts?lang=zh-Hant-TW&ids=25.037,121.566",
                headers: { "Accept-Language": "zh-Hant-TW" },
            });
            const body = JSON.parse($response.body);

            assert.equal($response.status, 200);
            assert.equal($response.headers["Content-Type"], "application/json");
            assert.equal(body.length, 1);
            assert.equal(body[0].description, "陸上強風特報(橙色燈號)");
            assert.equal(body[0].source, "中央氣象署");
            assert.deepEqual(requestedDatasets, ["W-C0033-001", "W-C0033-006"]);
        }
    } finally {
        globalThis.$argument = originalArgument;
        globalThis.$httpClient = originalHttpClient;
    }
});

test("the request scripts keep an Apple-compatible empty array when the provider is WeatherKit", async () => {
    const originalArgument = globalThis.$argument;
    const originalHttpClient = globalThis.$httpClient;
    let requestCount = 0;
    globalThis.$argument = {
        LogLevel: "OFF",
        Storage: "Argument",
        WeatherAlerts: { Provider: "WeatherKit" },
    };
    globalThis.$httpClient = {
        get(_request, callback) {
            requestCount++;
            callback(undefined, { headers: {}, status: 200 }, JSON.stringify({ success: "true" }));
        },
    };

    try {
        for (const handler of [processRequest, processRequestDev]) {
            const { $response } = await handler({
                method: "GET",
                url: "https://weatherkit.apple.com/api/v1/weatherAlerts?lang=zh-Hant-TW&ids=25.037,121.566",
                headers: {},
            });

            assert.equal($response.status, 200);
            assert.deepEqual(JSON.parse($response.body), []);
        }
        assert.equal(requestCount, 0);
    } finally {
        globalThis.$argument = originalArgument;
        globalThis.$httpClient = originalHttpClient;
    }
});

test("the request scripts keep an Apple-compatible empty array for non-coordinate identifiers", async () => {
    for (const handler of [processRequest, processRequestDev]) {
        const { $response } = await handler({
            method: "GET",
            url: "https://weatherkit.apple.com/api/v1/weatherAlerts?lang=zh-Hant-TW&ids=35889ee6-fa82-5f9f-8e49-fad78c4f383a",
            headers: {},
        });

        assert.equal($response.status, 200);
        assert.deepEqual(JSON.parse($response.body), []);
    }
});

test("the request scripts keep an Apple-compatible empty array when the CWA fetch fails", async () => {
    const originalArgument = globalThis.$argument;
    const originalHttpClient = globalThis.$httpClient;
    globalThis.$argument = {
        API: { CWA: { Token: "token" } },
        LogLevel: "OFF",
        Storage: "Argument",
        WeatherAlerts: { Provider: "CWA" },
    };
    globalThis.$httpClient = {
        get(_request, _callback) {
            throw new Error("CWA unavailable");
        },
    };

    try {
        for (const handler of [processRequest, processRequestDev]) {
            const { $response } = await handler({
                method: "GET",
                url: "https://weatherkit.apple.com/api/v1/weatherAlerts?lang=zh-Hant-TW&ids=25.037,121.566",
                headers: {},
            });

            assert.equal($response.status, 200);
            assert.equal($response.statusCode, 200);
            assert.equal($response.headers["Content-Type"], "application/json");
            assert.deepEqual(JSON.parse($response.body), []);
        }
    } finally {
        globalThis.$argument = originalArgument;
        globalThis.$httpClient = originalHttpClient;
    }
});

test("response finalizes provider logos inside every Inject method", async () => {
    const injectMethods = ["InjectCurrentWeather", "InjectForecastDaily", "InjectForecastHourly", "InjectWeatherAlerts"];
    for (const path of ["../src/process/Response.mjs", "../src/process/Response.dev.mjs"]) {
        const source = await readFile(new URL(path, import.meta.url), "utf8");
        const topLevel = source.slice(0, source.indexOf("async function InjectCurrentWeather"));

        assert.doesNotMatch(topLevel, /\.metadata\.providerLogo\s*=/);
        for (const [index, method] of injectMethods.entries()) {
            const start = source.indexOf(`async function ${method}`);
            const end = injectMethods[index + 1] ? source.indexOf(`async function ${injectMethods[index + 1]}`) : source.length;
            const body = source.slice(start, end);
            // Apple 會帶自己的 providerLogo，必須明確覆寫才會生效。
            // Apple ships its own providerLogo, so it must be overwritten explicitly.
            assert.match(body, /\.metadata\.providerLogo\s*=\s*providerNameToLogo\(/, `${path}: ${method}`);
        }
    }
});

test("response tolerates an Apple payload without the weatherAlerts slot", async () => {
    const { Response } = await import("../src/process/Response.mjs");
    const { default: WeatherKit2 } = await import("../src/class/WeatherKit2.mjs");
    const { Builder, ByteBuffer } = await import("flatbuffers");

    const originalArgument = globalThis.$argument;
    globalThis.$argument = {
        API: { CWA: { Token: "token" } },
        DataSets: ["weatherAlerts"],
        LogLevel: "OFF",
        Storage: "Argument",
        WeatherAlerts: { Provider: "CWA" },
    };

    try {
        // 建立一個完全沒有 weatherAlerts slot 的根資料表。
        // Build a root table that has no weatherAlerts slot at all.
        const builder = new Builder(64);
        builder.startObject(10);
        const root = builder.endObject();
        builder.finish(root);
        const bodyBytes = builder.asUint8Array().slice();

        const response = await Response(
            { url: "https://weatherkit.apple.com/api/v2/weather/zh-Hant-TW/25.037/121.566?country=TW&dataSets=weatherAlerts" },
            { bodyBytes, headers: { "Content-Type": "application/vnd.apple.flatbuffer" } },
        );

        assert.deepEqual(Object.keys(WeatherKit2.decode(new ByteBuffer(new Uint8Array(response.body)), ["weatherAlerts"])), []);
    } finally {
        globalThis.$argument = originalArgument;
    }
});
