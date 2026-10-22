import assert from "node:assert/strict";
import test from "node:test";
import { ByteBuffer } from "flatbuffers";

globalThis.$environment = { "surge-version": "test" };
globalThis.$persistentStore = { read: () => null, write: () => true };
globalThis.$argument = { LogLevel: "OFF", Storage: "database" };

const [{ default: ForecastNextHour }, { default: WeatherKit2 }] = await Promise.all([import("../src/class/ForecastNextHour.mjs"), import("../src/class/WeatherKit2.mjs")]);

/** 對齊到分鐘的固定起點，讓斷言不必處理毫秒。 / Fixed minute-aligned start so assertions stay simple. */
const Start = 1_700_000_040;
const Lead = ForecastNextHour.OnsetLead * 60;

/**
 * 建立一份完整的 `forecastNextHour` 資料槽。
 * Build a complete `forecastNextHour` slot.
 * @param {{onset?: number, intensity?: number}} [options] 選項 / Options.
 * @returns {object}
 */
function Slot({ onset, intensity = 3.6 } = {}) {
    const minutes = ForecastNextHour.Minutes({ startTime: Start, onset, intensity });
    const summary = ForecastNextHour.Runs(minutes);
    return {
        metadata: {
            attributionUrl: "https://www.cwa.gov.tw/V8/C/P/QPF.html",
            expireTime: Start + ForecastNextHour.ExpirationInterval,
            language: "zh-Hant-TW",
            latitude: 25.033,
            longitude: 121.5654,
            providerLogo: "",
            providerName: "中央氣象署",
            readTime: Start,
            reportedTime: Start - 300,
            temporarilyUnavailable: false,
            sourceType: "MODELED",
        },
        condition: ForecastNextHour.Conditions(summary),
        summary,
        minutes,
        forecastStart: Start,
        forecastEnd: Start + ForecastNextHour.Horizon * 60,
    };
}

test("逐分鐘資料在起雨前保持無雨，起雨後才轉為有雨", () => {
    const minutes = ForecastNextHour.Minutes({ startTime: Start, onset: Start + Lead, intensity: 3.6 });

    assert.equal(minutes.length, ForecastNextHour.Horizon);
    assert.equal(minutes[0].startTime, Start);
    assert.equal(minutes.at(-1).startTime, Start + (ForecastNextHour.Horizon - 1) * 60);

    const dry = minutes.slice(0, ForecastNextHour.OnsetLead);
    assert.ok(dry.every(minute => minute.clear && minute.precipitationChance === 0 && minute.precipitationIntensity === 0));
    assert.ok(dry.every(minute => minute.condition === "CLEAR" && minute.summaryCondition === "CLEAR"));

    const wet = minutes.slice(ForecastNextHour.OnsetLead);
    assert.ok(wet.every(minute => !minute.clear && minute.precipitationChance === ForecastNextHour.RainChance));
    assert.ok(wet.every(minute => minute.precipitationIntensity === 3.6 && minute.summaryCondition === "RAIN"));
    // 3.6 毫米／小時落在中雨分級，天氣 App 會畫成 RAIN。
    // 3.6 mm/h sits in the moderate band, which the Weather app renders as RAIN.
    assert.equal(wet[0].condition, "RAIN");
});

test("降水段落依無雨／有雨切分，並保留段落內最大強度", () => {
    const runs = ForecastNextHour.Runs(ForecastNextHour.Minutes({ startTime: Start, onset: Start + Lead, intensity: 3.6 }));

    assert.equal(runs.length, 2);
    assert.deepEqual(
        runs.map(run => ({ condition: run.condition, startTime: run.startTime, endTime: run.endTime, clear: run.clear })),
        [
            { condition: "CLEAR", startTime: Start, endTime: Start + Lead, clear: true },
            { condition: "RAIN", startTime: Start + Lead, endTime: Start + ForecastNextHour.Horizon * 60, clear: false },
        ],
    );
    assert.equal(runs[1].precipitationIntensity, 3.6);
    assert.equal(runs[1].precipitationChance, ForecastNextHour.RainChance);
    assert.equal(runs[1].maxCondition, "RAIN");
});

test("起雨事件帶上 START 與 FIRST_AT，天氣 App 才有通知時間可用", () => {
    const conditions = ForecastNextHour.Conditions(Slot({ onset: Start + Lead }).summary);

    // 時間軸分成兩段：先無雨並宣告起雨時間，再從起雨時間起持續有雨。
    // The timeline has two segments: a dry run announcing the onset, then rain from the onset on.
    assert.equal(conditions.length, 2);
    assert.deepEqual(conditions[0], {
        beginCondition: "RAIN",
        endCondition: "RAIN",
        forecastToken: "START",
        parameters: [{ date: Start + Lead, type: "FIRST_AT" }],
        startTime: Start,
        endTime: Start + Lead,
    });
    assert.deepEqual(conditions[1], {
        beginCondition: "RAIN",
        endCondition: "RAIN",
        forecastToken: "CONSTANT",
        parameters: [],
        startTime: Start + Lead,
        endTime: 0,
    });
});

test("正在下雨時只給 CONSTANT，不再製造起雨事件", () => {
    const runs = ForecastNextHour.Runs(ForecastNextHour.Minutes({ startTime: Start, onset: Start, intensity: 3.6 }));
    const conditions = ForecastNextHour.Conditions(runs);

    assert.equal(runs.length, 1);
    assert.equal(conditions.length, 1);
    assert.equal(conditions[0].forecastToken, "CONSTANT");
    assert.equal(conditions[0].endTime, 0, "最後一段的結束時間必須寫 0");
    assert.deepEqual(conditions[0].parameters, []);
});

test("沒有雨時整段都是 CLEAR", () => {
    const conditions = ForecastNextHour.Conditions(Slot({ onset: undefined }).summary);

    assert.equal(conditions.length, 1);
    assert.equal(conditions[0].forecastToken, "CLEAR");
    assert.equal(conditions[0].beginCondition, "CLEAR");
    assert.equal(conditions[0].endTime, 0);
});

test("逐分鐘資料與時間軸可以完整編碼再解碼", () => {
    const slot = Slot({ onset: Start + Lead });
    const rawBody = WeatherKit2.encode(undefined, { forecastNextHour: slot });
    const decoded = WeatherKit2.decode(new ByteBuffer(rawBody), ["forecastNextHour"]).forecastNextHour;

    assert.equal(decoded.forecastStart, Start);
    assert.equal(decoded.forecastEnd, Start + ForecastNextHour.Horizon * 60);
    assert.equal(decoded.minutes.length, ForecastNextHour.Horizon);
    assert.equal(decoded.minutes[0].precipitationChance, 0);
    assert.equal(decoded.minutes.at(-1).precipitationChance, ForecastNextHour.RainChance);
    // FlatBuffer 的強度欄位是 float32，比對時容許單精度誤差。
    // The intensity fields are float32, so the comparison allows single-precision drift.
    assert.ok(Math.abs(decoded.minutes.at(-1).precipitationIntensity - 3.6) < 1e-5);
    assert.equal(decoded.summary.length, 2);
    assert.equal(decoded.summary[0].condition, "CLEAR");
    assert.equal(decoded.summary[1].condition, "RAIN");
    assert.equal(decoded.condition.length, 2);
    assert.equal(decoded.condition[0].forecastToken, "START");
    assert.deepEqual(decoded.condition[0].parameters, [{ date: Start + Lead, type: "FIRST_AT" }]);
    assert.equal(decoded.condition[1].forecastToken, "CONSTANT");
    assert.equal(decoded.condition[1].endTime, 0);
});

test("降雨判定維持「即將降雨」與「雨勢變大」兩種", () => {
    assert.equal(ForecastNextHour.Decide(undefined, 0), "NONE");
    assert.equal(ForecastNextHour.Decide(0.2, 0), "NONE");
    assert.equal(ForecastNextHour.Decide(0.6, 0), "STARTING");
    assert.equal(ForecastNextHour.Decide(0.6, 0.05), "STARTING");
    assert.equal(ForecastNextHour.Decide(3.4, 0.25), "INTENSIFYING");
    assert.equal(ForecastNextHour.Decide(1.2, 1), "NONE");
    assert.equal(ForecastNextHour.Message("STARTING", 1.2, 0).title, "1 小時內會下雨");
    assert.equal(ForecastNextHour.Message("INTENSIFYING", 3.4, 0.3).title, "雨勢會變大");
});
