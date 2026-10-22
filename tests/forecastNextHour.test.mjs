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
            // 最後一段是開放式的，`endTime` 為 0，與 Apple 原生的 `summary` 一致。
            { condition: "RAIN", startTime: Start + Lead, endTime: 0, clear: false },
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

/**
 * QPESUMS 的「未來 1 小時」從資料基準時刻起算，不是從請求時刻起算。
 * QPESUMS' "next hour" starts at the data base time, not at request time.
 */
test("預報窗口以 QPESUMS 基準時刻為準，強度不重複計算已過的雨", () => {
    // 模擬 19:04 請求、資料基準時刻 18:40：窗口只剩 36 分鐘。
    // Mimic a 19:04 request against an 18:40 base time: only 36 minutes remain.
    const now = Start + 24 * 60;
    const window = ForecastNextHour.Window({ now, observationTime: Start, future: 0.6, onset: now - 18 * 60 });

    assert.equal(window.stale, false);
    assert.equal(window.forecastStart, now);
    assert.equal(window.rainEnd, Start + 60 * 60, "窗口終點是基準時刻 + 60 分鐘");
    assert.equal(window.wetStart, now, "已過的起雨時間要夾到現在");
    assert.equal(window.wetMinutes, 36);
    // 0.6 毫米是整小時的總量，已經下掉的 24 分鐘不該再攤進剩下的 36 分鐘：
    // 剩下的比例是 36/60，攤到 36 分鐘上就是原始時雨量 0.6 毫米／小時。
    assert.equal(window.intensity, 0.6, "強度回到時雨量，不因窗口變短而放大");
});

test("起雨時間在未來時，強度按剩餘分鐘計算", () => {
    const window = ForecastNextHour.Window({ now: Start, observationTime: Start, future: 0.6, onset: Start + Lead });

    assert.equal(window.rainEnd, Start + 60 * 60);
    assert.equal(window.wetStart, Start + Lead);
    assert.equal(window.wetMinutes, 50);
    assert.equal(window.intensity, 0.72);
});

test("逐分鐘序列在窗口結束後轉為無雨", () => {
    const now = Start + 24 * 60;
    const window = ForecastNextHour.Window({ now, observationTime: Start, future: 0.6, onset: now - 18 * 60 });
    const minutes = ForecastNextHour.Minutes({ startTime: window.forecastStart, onset: window.wetStart, endTime: window.rainEnd, intensity: window.intensity });
    const wet = minutes.filter(minute => !minute.clear);

    assert.equal(wet.length, 36);
    assert.equal(wet[0].startTime, now);
    assert.equal(wet.at(-1).startTime, window.rainEnd - 60);

    const summary = ForecastNextHour.Runs(minutes);
    assert.deepEqual(
        summary.map(run => [run.condition, run.startTime, run.endTime]),
        [
            ["RAIN", now, window.rainEnd],
            ["CLEAR", window.rainEnd, 0],
        ],
    );
    // 雨已經在下、且會在窗口結束時停：時間軸只該有 STOP，不該憑空生出 START。
    // Rain is already falling and stops at the window end: only STOP belongs on the timeline.
    assert.deepEqual(
        ForecastNextHour.Conditions(summary).map(condition => [condition.forecastToken, condition.parameters]),
        [
            ["STOP", [{ date: window.rainEnd, type: "FIRST_AT" }]],
            ["CLEAR", []],
        ],
    );
});

test("資料超過預報窗口就不再使用", () => {
    const window = ForecastNextHour.Window({ now: Start, observationTime: Start - 70 * 60, future: 0.6, onset: Start });
    assert.equal(window.stale, true);
    assert.equal(window.intensity, 0);
});

test("沒有基準時刻時退回現在起算", () => {
    const window = ForecastNextHour.Window({ now: Start, observationTime: undefined, future: 3.6, onset: Start + Lead });
    assert.equal(window.stale, false);
    assert.equal(window.rainEnd, Start + ForecastNextHour.Horizon * 60);
    assert.equal(window.intensity, (3.6 * 60) / 50);
});

test("起雨時間超過窗口終點時視為現在就在下雨，不會塞進最後一分鐘", () => {
    const window = ForecastNextHour.Window({ now: Start, observationTime: Start, future: 0.6, onset: Start + ForecastNextHour.Horizon * 60 });
    assert.equal(window.wetStart, Start);
    assert.equal(window.wetMinutes, ForecastNextHour.Horizon);
    // 整小時的 0.6 毫米平均落在 60 分鐘上，就是 0.6 毫米／小時，不是 36 毫米／小時的暴雨。
    assert.equal(window.intensity, 0.6);
});

test("濕分鐘的強度不會低於下雨門檻，微量分級永遠用不到", () => {
    // Apple 的原生樣本出現過強度 0.0969 卻判 CLEAR 的分鐘；我們的序列不會有這種值，
    // 因為強度是「剩餘雨量 ÷ 濕分鐘」，而濕分鐘不可能多於剩餘分鐘，
    // 所以強度必然 ≥ `RainThreshold`。這條測試把這個不變量固定下來。
    // Apple's native sample contains a minute with an intensity of 0.0969 marked CLEAR. Our series
    // can never produce such a value: the intensity is "rain left ÷ wet minutes", and the wet
    // minutes can never outnumber the minutes left, so the intensity is always at least
    // `RainThreshold`. This test pins that invariant.
    let minimum = Number.POSITIVE_INFINITY;
    for (let observationAgo = 0; observationAgo <= 55; observationAgo += 5) {
        for (let lead = 0; lead <= ForecastNextHour.Horizon; lead += 5) {
            for (const future of [0.5, 0.6, 1, 3.6, 10]) {
                const window = ForecastNextHour.Window({ now: Start, observationTime: Start - observationAgo * 60, future, onset: Start + lead * 60 });
                if (window.stale || window.intensity <= 0) continue;
                minimum = Math.min(minimum, window.intensity);
            }
        }
    }
    assert.equal(minimum, ForecastNextHour.RainThreshold);
});

test("最後一段降水段落的結束時間為 0，與 Apple 原生 summary 一致", () => {
    // Apple 對日本座標回的原生 summary 是
    // [{ condition: "CLEAR", startTime: 1792669560, endTime: 0, ... }]，
    // 最後一段用 0 表示「一直到預報結束」，不是實際結束時刻。
    // Apple's native summary for a Japanese coordinate ends the final run with `endTime: 0`,
    // meaning "until the end of the forecast" rather than a concrete time.
    const runs = ForecastNextHour.Runs(ForecastNextHour.Minutes({ startTime: Start, onset: Start + Lead, intensity: 3.6 }));
    assert.equal(runs.at(-1).endTime, 0);

    // 只有最後一段是開放式，前面各段仍保留真實邊界。
    // Only the final run is open-ended; earlier runs keep their real boundaries.
    assert.equal(runs[0].endTime, Start + Lead);

    // 整段無雨時也一樣，而且 `condition` 與 `summary` 兩邊都必須是 0。
    // The same holds for an all-dry series, and both `condition` and `summary` must agree.
    const slot = Slot({ onset: undefined });
    assert.equal(slot.summary.at(-1).endTime, 0);
    assert.equal(slot.condition.at(-1).endTime, 0);
});

test("Apple 原生的 STOP 事件與我們的輸出逐欄位一致", () => {
    // 英國座標 20:12 的真實響應：前 40 分鐘有雨，之後轉晴，總長 78 分鐘。
    //   condition[0] = { beginCondition: "POSSIBLE_DRIZZLE", endCondition: "POSSIBLE_DRIZZLE",
    //                    forecastToken: "STOP", parameters: [{ date: 1792673520, type: "FIRST_AT" }],
    //                    startTime: 1792671120, endTime: 1792673520 }
    //   condition[1] = { beginCondition: "CLEAR", endCondition: "CLEAR", forecastToken: "CLEAR",
    //                    parameters: [], startTime: 1792673520, endTime: 0 }
    // 停雨時間放在 FIRST_AT，而且這一段的 `endTime` 就是停雨時間，不是 0。
    // A real response for a UK coordinate: 40 wet minutes then clear. The stop time lives in
    // FIRST_AT and the segment's own `endTime` is that same time, not zero.
    const start = 1_792_671_120;
    const stop = 1_792_673_520;
    const minutes = ForecastNextHour.Minutes({ startTime: start, onset: start, endTime: stop, intensity: 0.142038956284523 });
    const summary = ForecastNextHour.Runs(minutes);
    const conditions = ForecastNextHour.Conditions(summary);

    // 同一筆響應的 summary 是兩段：有雨到停雨時間，之後的晴天用 0 收尾。
    // The matching summary has two runs: rain until the stop time, then an open-ended clear run.
    assert.deepEqual(
        summary.map(run => [run.condition, run.startTime, run.endTime]),
        [
            ["RAIN", start, stop],
            ["CLEAR", stop, 0],
        ],
    );

    assert.equal(conditions.length, 2);
    assert.equal(conditions[0].forecastToken, "STOP");
    assert.deepEqual(conditions[0].parameters, [{ date: stop, type: "FIRST_AT" }]);
    assert.equal(conditions[0].startTime, start);
    assert.equal(conditions[0].endTime, stop);
    assert.equal(conditions[0].beginCondition, conditions[0].endCondition);
    assert.deepEqual(conditions[1], {
        beginCondition: "CLEAR",
        endCondition: "CLEAR",
        forecastToken: "CLEAR",
        parameters: [],
        startTime: stop,
        endTime: 0,
    });
});
