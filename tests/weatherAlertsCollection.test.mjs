import assert from "node:assert/strict";
import test from "node:test";
import { Builder, ByteBuffer } from "flatbuffers";

globalThis.$environment = { "surge-version": "test" };
globalThis.$persistentStore = { read: () => null, write: () => true };
globalThis.$argument = { LogLevel: "OFF", Storage: "database" };

const [{ default: WeatherAlerts }, { default: CWA }, { default: WeatherKit2 }, { Response }, { Response: ResponseDev }, { Console }] = await Promise.all([
    import("../src/class/WeatherAlerts.mjs"),
    import("../src/class/CWA.mjs"),
    import("../src/class/WeatherKit2.mjs"),
    import("../src/process/Response.mjs"),
    import("../src/process/Response.dev.mjs"),
    import("@nsnanocat/util"),
]);
Console.logLevel = "OFF";

const Now = Math.trunc(Date.now() / 1000);

/**
 * 中央氣象署 WeatherAlert() 的回傳結構（未經 WeatherAlerts.Build 轉換）。
 * Shape returned by CWA.WeatherAlert() before any WeatherKit conversion.
 */
function createSource() {
    return {
        metadata: {
            attributionUrl: "https://www.cwa.gov.tw/V8/C/P/Warning.html",
            expireTime: Now + 3600,
            language: "zh-TW",
            latitude: 25.033,
            longitude: 121.5654,
            providerName: "中央氣象署",
            readTime: Now,
            reportedTime: Now,
            sourceType: "MODELED",
            temporarilyUnavailable: false,
        },
        detailsUrl: "https://weatherkit.apple.com/alertDetails/index.html?ids=25.033%2C121.5654&lang=zh-TW&party=CWA",
        areaName: "臺北市",
        source: "中央氣象署",
        alerts: [
            {
                areaId: "10017",
                areaName: "臺北市",
                certainty: "likely",
                description: "颱風警報",
                effectiveTime: "2026-10-22T16:00:00+08:00",
                eventEndTime: "2026-10-23T04:00:00+08:00",
                eventName: "颱風",
                eventOnsetTime: "2026-10-22T16:00:00+08:00",
                expireTime: "2026-10-23T04:00:00+08:00",
                guidelines: ["請遠離海邊並注意強陣風", "密切關注最新颱風消息"],
                identifier: "W-C0034-001:臺北市:W-C0034-001:1700000000",
                issuedTime: "2026-10-22T16:00:00+08:00",
                message: "颱風中心目前在花蓮東南東方海面，向西北移動。",
                phenomenon: "Met",
                reportedAt: "2026-10-22T16:00:00+08:00",
                responses: [],
                severity: "severe",
                source: "中央氣象署",
                standard: "",
                token: "W-C0034-001",
                urgency: "immediate",
            },
        ],
    };
}

function createContext() {
    return {
        attributionUrl: "https://www.cwa.gov.tw/V8/C/P/Warning.html",
        countryCode: "TW",
        detailsUrl: "https://weatherkit.apple.com/alertDetails/index.html?ids=25.033%2C121.5654&lang=zh-TW&party=CWA",
        eventSource: "中央氣象署",
        identifier: "25.033,121.5654",
        language: "zh-TW",
        latitude: 25.033,
        longitude: 121.5654,
        providerLogo: "https://zoeee1125.github.io/WeatherKit-CWA/assets/icon/v2/CWA.png",
        providerName: "中央氣象署",
    };
}

test("BuildCollection returns undefined when the provider has no active warning", () => {
    assert.equal(WeatherAlerts.BuildCollection({ alerts: [] }, createContext()), undefined);
    assert.equal(WeatherAlerts.BuildCollection(undefined, createContext()), undefined);
});

test("BuildCollection emits the decoded FlatBuffer shape instead of the REST shape", () => {
    const collection = WeatherAlerts.BuildCollection(createSource(), createContext());
    assert.ok(collection);

    // metadata 必須完整：天氣 App 用語言、座標與有效期決定資料來源與更新時間。
    assert.equal(collection.metadata.providerName, "中央氣象署");
    assert.equal(collection.metadata.language, "zh-TW");
    assert.equal(collection.metadata.latitude, 25.033);
    assert.equal(collection.metadata.longitude, 121.5654);
    assert.ok(collection.metadata.expireTime > Now);
    assert.equal(collection.metadata.sourceType, "MODELED");
    assert.equal(collection.metadata.temporarilyUnavailable, false);
    assert.match(collection.metadata.providerLogo, /CWA\.png$/);
    assert.match(collection.detailsUrl, /alertDetails/);

    const [alert] = collection.alerts;
    assert.equal(alert.description, "颱風警報");
    assert.equal(alert.areaId, "10017");
    assert.equal(alert.areaName, "臺北市");
    assert.equal(alert.countryCode, "TW");
    assert.equal(alert.eventSource, "中央氣象署");
    assert.match(alert.id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(alert.detailsUrl, `#${alert.id}`);

    // 列舉必須是大寫常數，否則編碼器會寫出 NaN。
    assert.equal(alert.severity, "SEVERE");
    assert.equal(alert.certainty, "LIKELY");
    assert.equal(alert.urgency, "IMMEDIATE");
    assert.equal(alert.importance, "HIGH");
    // 中央氣象署 CAP 沒有 significance，需由嚴重度推導，否則前端無從分級。
    assert.equal(alert.significance, "WARNING");
    assert.deepEqual(alert.responses, ["AVOID", "MONITOR"]);

    // 時間必須是 Unix 秒，REST 的 ISO 字串會讓 App 把預警當成 1970 年。
    assert.equal(typeof alert.effectiveTime, "number");
    assert.equal(alert.effectiveTime, Date.parse("2026-10-22T16:00:00+08:00") / 1000);
    assert.equal(alert.expireTime, Date.parse("2026-10-23T04:00:00+08:00") / 1000);
    assert.equal(alert.eventEndTime, alert.expireTime);

    // 編碼器對每個字串欄位呼叫 createString，undefined 會直接拋錯。
    for (const key of ["id", "areaId", "areaName", "attributionUrl", "countryCode", "description", "token", "detailsUrl", "phenomenon", "source", "eventSource"]) {
        assert.equal(typeof alert[key], "string", key);
    }
    for (const key of ["effectiveTime", "expireTime", "issuedTime", "eventOnsetTime", "eventEndTime", "unknown23", "unknown24", "unknown25", "unknown26"]) {
        assert.equal(typeof alert[key], "number", key);
        assert.ok(Number.isFinite(alert[key]), key);
    }
});

test("BuildCollection falls back to a lifetime when the provider omits the end time", () => {
    const source = createSource();
    delete source.alerts[0].expireTime;
    delete source.alerts[0].eventEndTime;
    const [alert] = WeatherAlerts.BuildCollection(source, createContext()).alerts;
    assert.equal(alert.expireTime, alert.effectiveTime + WeatherAlerts.DefaultAlertLifetime);
    assert.equal(alert.eventEndTime, alert.expireTime);
});

test("BuildCollection keeps the alert identifier stable across requests", () => {
    const first = WeatherAlerts.BuildCollection(createSource(), createContext()).alerts[0];
    const second = WeatherAlerts.BuildCollection(createSource(), createContext()).alerts[0];
    assert.equal(first.id, second.id);
    const moved = WeatherAlerts.BuildCollection(createSource(), { ...createContext(), identifier: "24.793,120.926" }).alerts[0];
    assert.notEqual(first.id, moved.id);
});

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

test("response builds a weatherAlerts slot when Apple omits it", async () => {
    const originalArgument = globalThis.$argument;
    const originalWeatherAlert = CWA.prototype.WeatherAlert;
    globalThis.$argument = {
        API: { CWA: { Token: "test-token" } },
        DataSets: ["weatherAlerts"],
        LogLevel: "OFF",
        Storage: "database",
        WeatherAlerts: { Provider: "CWA" },
    };
    // 直接餵入中央氣象署的來源結構，避免測試連外。
    // Feed the CWA source structure directly so the test stays offline.
    CWA.prototype.WeatherAlert = async () => createSource();

    try {
        const bodyBytes = createWeatherRoot([]);
        for (const handler of [Response, ResponseDev]) {
            const response = await runResponseHandler(handler, { headers: {}, url: "https://weatherkit.apple.com/api/v2/weather/zh-Hant-TW/25.033/121.5654?country=TW&dataSets=weatherAlerts" }, { bodyBytes, headers: { "Content-Type": "application/vnd.apple.flatbuffer" } });

            const decoded = WeatherKit2.decode(new ByteBuffer(new Uint8Array(response.body)), ["weatherAlerts"]);
            assert.deepEqual(Object.keys(decoded), ["weatherAlerts"]);

            const collection = decoded.weatherAlerts;
            assert.equal(collection.alerts.length, 1);
            assert.equal(collection.alerts[0].description, "颱風警報");
            assert.equal(collection.alerts[0].severity, "SEVERE");
            assert.equal(collection.alerts[0].significance, "WARNING");
            assert.equal(collection.alerts[0].urgency, "IMMEDIATE");
            assert.equal(collection.alerts[0].certainty, "LIKELY");
            assert.equal(collection.alerts[0].importance, "HIGH");
            assert.deepEqual(collection.alerts[0].responses, ["AVOID", "MONITOR"]);
            assert.equal(collection.alerts[0].effectiveTime, Date.parse("2026-10-22T16:00:00+08:00") / 1000);
            assert.match(collection.metadata.providerName, /中央氣象署/);
            assert.match(collection.metadata.providerLogo, /CWA\.png$/);
            assert.match(collection.detailsUrl, /alertDetails/);
        }
    } finally {
        CWA.prototype.WeatherAlert = originalWeatherAlert;
        globalThis.$argument = originalArgument;
    }
});

test("response fills an empty Apple weatherAlerts slot with provider alerts", async () => {
    const originalArgument = globalThis.$argument;
    const originalWeatherAlert = CWA.prototype.WeatherAlert;
    globalThis.$argument = {
        API: { CWA: { Token: "test-token" } },
        DataSets: ["weatherAlerts"],
        LogLevel: "OFF",
        Storage: "database",
        WeatherAlerts: { Provider: "CWA" },
    };
    CWA.prototype.WeatherAlert = async () => createSource();

    try {
        // Apple 回了 slot 但內容是空的：合併邏輯會原樣回傳空陣列，必須整組換掉。
        // Apple returns the slot but empty; merging would keep it empty, so the collection is replaced.
        const bodyBytes = createWeatherRoot([6]);
        for (const handler of [Response, ResponseDev]) {
            const response = await runResponseHandler(handler, { headers: {}, url: "https://weatherkit.apple.com/api/v2/weather/zh-Hant-TW/25.033/121.5654?country=TW&dataSets=weatherAlerts" }, { bodyBytes, headers: { "Content-Type": "application/vnd.apple.flatbuffer" } });

            const decoded = WeatherKit2.decode(new ByteBuffer(new Uint8Array(response.body)), ["weatherAlerts"]);
            assert.deepEqual(Object.keys(decoded), ["weatherAlerts"]);
            assert.equal(decoded.weatherAlerts.alerts.length, 1);
            assert.equal(decoded.weatherAlerts.alerts[0].description, "颱風警報");
        }
    } finally {
        CWA.prototype.WeatherAlert = originalWeatherAlert;
        globalThis.$argument = originalArgument;
    }
});

test("response keeps the slot absent when the provider has no active warning", async () => {
    const originalArgument = globalThis.$argument;
    const originalWeatherAlert = CWA.prototype.WeatherAlert;
    globalThis.$argument = {
        API: { CWA: { Token: "test-token" } },
        DataSets: ["weatherAlerts"],
        LogLevel: "OFF",
        Storage: "database",
        WeatherAlerts: { Provider: "CWA" },
    };
    CWA.prototype.WeatherAlert = async () => ({ ...createSource(), alerts: [] });

    try {
        const bodyBytes = createWeatherRoot([]);
        for (const handler of [Response, ResponseDev]) {
            const response = await runResponseHandler(handler, { headers: {}, url: "https://weatherkit.apple.com/api/v2/weather/zh-Hant-TW/25.033/121.5654?country=TW&dataSets=weatherAlerts" }, { bodyBytes, headers: { "Content-Type": "application/vnd.apple.flatbuffer" } });

            const decoded = WeatherKit2.decode(new ByteBuffer(new Uint8Array(response.body)), ["weatherAlerts"]);
            assert.deepEqual(Object.keys(decoded), []);
        }
    } finally {
        CWA.prototype.WeatherAlert = originalWeatherAlert;
        globalThis.$argument = originalArgument;
    }
});
