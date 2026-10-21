import assert from "node:assert/strict";
import test from "node:test";

globalThis.$environment = { "surge-version": "test" };
globalThis.$persistentStore = { read: () => null, write: () => true };
globalThis.$argument = { LogLevel: "OFF", Storage: "database" };

const [{ default: CWA }, { default: providerNameToLogo }, { default: shouldReplaceWeather }, { default: database }, { Console }] = await Promise.all([
    import("../src/class/CWA.mjs"),
    import("../src/function/providerNameToLogo.mjs"),
    import("../src/function/shouldReplaceWeather.mjs"),
    import("../src/function/database.mjs"),
    import("@nsnanocat/util"),
]);
Console.logLevel = "OFF";

const logoTemplate = "https://raw.githubusercontent.com/zoeee1125/WeatherKit-CWA/main/images/icon/v2/CWA.png";

test("CWA maps weather text to WeatherKit condition codes", () => {
    const cases = [
        ["晴", "CLEAR"],
        ["晴時多雲", "MOSTLY_CLEAR"],
        ["多雲時晴", "PARTLY_CLOUDY"],
        ["多雲", "PARTLY_CLOUDY"],
        ["多雲時陰", "MOSTLY_CLOUDY"],
        ["陰時多雲", "MOSTLY_CLOUDY"],
        ["陰", "CLOUDY"],
        ["短暫雨", "RAIN"],
        ["豪雨", "HEAVY_RAIN"],
        ["雷雨", "THUNDERSTORMS"],
        ["雨夾雪", "WINTRY_MIX"],
        ["陣雪", "FLURRIES"],
        ["有霧", "FOGGY"],
        ["霾", "HAZE"],
        ["風", "WINDY"],
    ];

    for (const [text, expected] of cases) assert.equal(CWA.ConvertCondition(text), expected, text);
    assert.equal(CWA.ConvertCondition(""), null);
    assert.equal(CWA.ConvertCondition("無資料"), null);
});

test("CWA omits unknown conditions instead of overwriting the Apple value", () => {
    assert.deepEqual(CWA.ConvertConditionField(""), {});
    assert.deepEqual(CWA.ConvertConditionField("X"), {});
    assert.deepEqual(CWA.ConvertConditionField("晴"), { conditionCode: "CLEAR" });
});

test("CWA converts compass wind directions and leaves variable winds unset", () => {
    const cases = [
        ["東北風", 45],
        ["東南風", 135],
        ["西南風", 225],
        ["西北風", 315],
        ["北風", 0],
        ["東風", 90],
        ["南風", 180],
        ["西風", 270],
        ["270", 270],
    ];

    for (const [text, expected] of cases) assert.equal(CWA.ConvertWindDirection(text), expected, text);
    assert.equal(CWA.ConvertWindDirection("不定"), undefined);
    assert.equal(CWA.ConvertWindDirection(""), undefined);
});

test("CWA parses timestamps with a missing offset as UTC+8", () => {
    const expected = Date.parse("2026-07-16T09:00:00+08:00") / 1000;
    assert.equal(CWA.ToUnixSeconds("2026-07-16T09:00:00+08:00"), expected);
    assert.equal(CWA.ToUnixSeconds("2026-07-16 09:00:00"), expected);
    assert.equal(CWA.ToUnixSeconds("2026-07-16T09:00:00"), expected);
    assert.equal(CWA.ToUnixSeconds("2026-07-16"), Date.parse("2026-07-16T00:00:00+08:00") / 1000);
    assert.equal(CWA.ToUnixSeconds("2026-07-16T01:00:00Z"), expected);
    assert.equal(CWA.ToUnixSeconds(""), undefined);
    assert.equal(CWA.ToUnixSeconds("not a time"), undefined);
});

test("CWA treats missing-value codes as absent numbers", () => {
    for (const value of ["X", "T", "-99", "-98", "-", "", null, undefined]) assert.equal(CWA.ToNumber(value), undefined, String(value));
    assert.equal(CWA.ToNumber(" 25.5 "), 25.5);
    assert.equal(CWA.ToNumber(30), 30);
});

test("CWA derives dew point from temperature and humidity", () => {
    assert.ok(Math.abs(CWA.DewPoint(30, 70) - 23.9) < 0.2);
    assert.equal(CWA.DewPoint(undefined, 70), undefined);
    assert.equal(CWA.DewPoint(30, 0), undefined);
});

test("CWA derives moon phases from the reference new moon", () => {
    const referenceNewMoon = 947_182_440;
    const day = 86400;
    assert.equal(CWA.MoonPhase(referenceNewMoon), "NEW");
    assert.equal(CWA.MoonPhase(referenceNewMoon + 14.765 * day), "FULL");
    assert.equal(CWA.MoonPhase(referenceNewMoon + 7.382 * day), "FIRST_QUARTER");
    assert.equal(CWA.MoonPhase(referenceNewMoon + 22.148 * day), "THIRD_QUARTER");
});

test("CWA converts visibility buckets into meters", () => {
    assert.equal(CWA.Visibility(">30"), 30_000);
    assert.equal(CWA.Visibility("21-30"), 21_000);
    assert.equal(CWA.Visibility("11-20"), 11_000);
    assert.equal(CWA.Visibility("<1"), 1_000);
    assert.equal(CWA.Visibility("15"), 15_000);
    assert.equal(CWA.Visibility("X"), undefined);
    assert.equal(CWA.Visibility(""), undefined);
});

test("CWA timelines sort by start time and pick the covering record", () => {
    const timeline = CWA.Timeline([
        { StartTime: "2026-07-16T12:00:00+08:00", EndTime: "2026-07-16T15:00:00+08:00", ElementValue: [{ Temperature: "30" }] },
        { StartTime: "2026-07-16T09:00:00+08:00", EndTime: "2026-07-16T12:00:00+08:00", ElementValue: [{ Temperature: "28" }] },
    ]);

    assert.deepEqual(
        timeline.map(({ start }) => start),
        [Date.parse("2026-07-16T09:00:00+08:00") / 1000, Date.parse("2026-07-16T12:00:00+08:00") / 1000],
    );
    const at = time => Date.parse(`2026-07-16T${time}:00+08:00`) / 1000;
    assert.equal(CWA.NumberAt(timeline, at("10:30"), "Temperature"), 28);
    assert.equal(CWA.NumberAt(timeline, at("12:00"), "Temperature"), 30);
    assert.equal(CWA.NumberAt(timeline, at("14:59"), "Temperature"), 30);
    assert.equal(CWA.NumberAt(timeline, at("08:00"), "Temperature"), undefined);
    assert.equal(CWA.NumberAt(timeline, at("16:00"), "Temperature"), 30);

    const pointTimeline = CWA.Timeline([{ DataTime: "2026-07-16T09:00:00+08:00", ElementValue: [{ Weather: "晴" }] }]);
    assert.equal(pointTimeline[0].start, pointTimeline[0].end);
    assert.equal(CWA.TextAt(pointTimeline, at("09:00"), "Weather"), "晴");
});

test("CWA reports the latest township forecast issue time", () => {
    const issue = time => Date.parse(`2026-07-${time}+08:00`) / 1000;
    assert.equal(CWA.LatestIssueTime(issue("16T04:00:00")), issue("15T23:30:00"));
    assert.equal(CWA.LatestIssueTime(issue("16T05:30:00")), issue("16T05:30:00"));
    assert.equal(CWA.LatestIssueTime(issue("16T12:00:00")), issue("16T11:30:00"));
    assert.equal(CWA.LatestIssueTime(issue("16T23:45:00")), issue("16T23:30:00"));
});

test("CWA scores warning areas by coverage precision", () => {
    assert.equal(CWA.AreaCoverageScore("臺北市", "臺北市", "信義區"), 2);
    assert.equal(CWA.AreaCoverageScore("臺北市信義區", "臺北市", "信義區"), 3);
    assert.equal(CWA.AreaCoverageScore("臺北市文山區", "臺北市", "信義區"), 1);
    assert.equal(CWA.AreaCoverageScore("新北市", "臺北市", "信義區"), 0);
    assert.equal(CWA.AreaCoverageScore("恆春半島", "屏東縣", "恆春鎮"), 2);
    assert.equal(CWA.AreaCoverageScore("", "臺北市", "信義區"), 0);
});

test("CWA resolves Taiwan coordinates through the offline township table", () => {
    const taichung = new CWA({ country: "TW", latitude: 24.1477, longitude: 120.6736 }, "token");
    assert.equal(taichung.available, true);
    assert.deepEqual(
        { county: taichung.location.county, township: taichung.location.township, day3: taichung.location.day3, day7: taichung.location.day7 },
        { county: "臺中市", township: "中區", day3: "F-D0047-073", day7: "F-D0047-075" },
    );

    const tokyo = new CWA({ country: "JP", latitude: 35.6812, longitude: 139.7671 }, "token");
    assert.equal(tokyo.location, undefined);
    assert.equal(tokyo.available, false);

    const withoutToken = new CWA({ country: "TW", latitude: 24.1477, longitude: 120.6736 }, "");
    assert.equal(withoutToken.available, false);
});

test("CWA only replaces weather when the provider is selected and the location resolves", () => {
    const settings = database.WeatherKit.Settings;

    assert.equal(shouldReplaceWeather({ ...settings, Weather: { Provider: "CWA" } }, { country: "TW", cwa: { available: true } }), true);
    assert.equal(shouldReplaceWeather({ ...settings, Weather: { Provider: "CWA" } }, { country: "TW", cwa: { available: false } }), false);
    assert.equal(shouldReplaceWeather({ ...settings, Weather: { Provider: "WeatherKit" } }, { country: "TW", cwa: { available: true } }), false);
});

test("CWA ships its token and provider defaults", () => {
    assert.equal(database.WeatherKit.Settings.API.CWA.Token, "");
    assert.equal(database.WeatherKit.Settings.Weather.Provider, "CWA");
    assert.equal(database.WeatherKit.Settings.WeatherAlerts.Provider, "CWA");
    assert.equal(providerNameToLogo("CWA"), logoTemplate);
    assert.equal(providerNameToLogo("中央氣象署"), logoTemplate);
    assert.equal(providerNameToLogo("Apple Weather"), undefined);
});
