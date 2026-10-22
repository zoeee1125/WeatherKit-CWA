import assert from "node:assert/strict";
import test from "node:test";
import ForecastNextHour from "../src/class/ForecastNextHour.mjs";
import QPESUMS from "../src/class/QPESUMS.mjs";

/**
 * QPESUMS 格點對應。
 * QPESUMS grid mapping.
 *
 * 格點原點在左下角 117.975°E / 19.975°N，先經向遞增再緯向遞增。
 * The grid starts at 117.975°E / 19.975°N in the bottom-left corner, increasing eastward first
 * and then northward.
 */
test("QPESUMS 座標換算成格點索引", () => {
    // 台北 25.033, 121.5654 → x = (121.5654 - 117.975) / 0.0125 = 287.2 → 287
    // Taipei → x = 287, y = (25.033 - 19.975) / 0.0125 = 404.64 → 405
    const taipei = QPESUMS.Coordinate(25.033, 121.5654);
    assert.deepEqual(taipei, { x: 287, y: 405 });
    assert.equal(QPESUMS.Index(taipei), 405 * 441 + 287);

    // 高雄 22.6329, 120.3014 → x = 186, y = 212
    const kaohsiung = QPESUMS.Coordinate(22.6329, 120.3014);
    assert.deepEqual(kaohsiung, { x: 186, y: 213 });
});

test("QPESUMS 排除格點範圍外的座標", () => {
    assert.equal(QPESUMS.Coordinate(25.033, 121.5654) === undefined, false);
    // 台北以外（如沖繩）不在格點範圍內
    assert.equal(QPESUMS.Coordinate(26.2, 127.7), undefined);
    assert.equal(QPESUMS.Coordinate(Number.NaN, 121), undefined);
    assert.equal(QPESUMS.Coordinate(25, Number.NaN), undefined);
});

test("QPESUMS 解析格點數值，-99 視為無效", () => {
    assert.equal(QPESUMS.ParseValue(" 1.220E+01"), 12.2);
    assert.equal(QPESUMS.ParseValue("-9.900E+01"), undefined, "-99 代表該格沒有有效資料");
    assert.equal(QPESUMS.ParseValue(""), undefined);
    assert.equal(QPESUMS.ParseValue("abc"), undefined);
});

test("QPESUMS 從數值區塊取出連續格點", () => {
    const block = " 1.000E-01,-9.900E+01, 2.000E+00,";
    const values = QPESUMS.Extract(block, 0, 3);
    assert.equal(values[0], 0.1);
    assert.equal(values[1], undefined);
    assert.equal(values[2], 2);
});

test("QPESUMS 找出數值區塊起點並解析資料時間", () => {
    const header = '{\n "cwaopendata": {\n  "dataset": {\n   "datasetInfo": {\n    "parameterSet": {\n     "DateTime": "2026-10-22T02:20:00+08:00",\n     "GridDimensionX": "441"\n    }\n   },\n   "contents": {\n    "contentDescription": "說明",\n    "content": "-9.900E+01,';
    const located = QPESUMS.Locate(header);
    assert.ok(located);
    assert.equal(QPESUMS.Locate("沒有 content 的內容"), undefined);
    assert.equal(QPESUMS.ParseTime(header), "2026-10-22T02:20:00+08:00");
});

/**
 * 未來一小時降水的強度換算。
 * Next-hour precipitation intensity conversion.
 */
test("降水強度換算成感知強度", () => {
    assert.equal(ForecastNextHour.Perceived(0), 0);
    assert.equal(ForecastNextHour.Perceived(0.05), 0, "極微量降水感知不到");
    assert.equal(ForecastNextHour.Perceived(1), 0.273, "小雨落在 0 到 1 之間");
    assert.equal(ForecastNextHour.Perceived(5), 1.197, "中雨落在 1 到 2 之間");
    assert.equal(ForecastNextHour.Perceived(20), 2.216, "大雨落在 2 到 3 之間");
    assert.equal(ForecastNextHour.Perceived(100), 2, "超出大雨上限時不再上升");
});

test("降水強度對應天氣狀況代碼", () => {
    assert.equal(ForecastNextHour.Condition(0), "CLEAR");
    assert.equal(ForecastNextHour.Condition(0.05), "POSSIBLE_DRIZZLE");
    assert.equal(ForecastNextHour.Condition(1), "DRIZZLE");
    assert.equal(ForecastNextHour.Condition(5), "RAIN");
    assert.equal(ForecastNextHour.Condition(30), "HEAVY_RAIN");
});

test("ISO 時間換算成 Unix 秒", () => {
    assert.equal(ForecastNextHour.ToUnixSeconds("2026-10-22T02:20:00+08:00"), 1792606800);
    assert.equal(ForecastNextHour.ToUnixSeconds(""), undefined);
    assert.equal(ForecastNextHour.ToUnixSeconds("不是時間"), undefined);
});

/**
 * 降雨通知的判定規則。
 * Rainfall alert decision rules.
 */
test("過去一小時只有微量飄雨時，仍要提醒即將變大的雨勢", () => {
    // 使用者回報的實際情境：未來 3.4 毫米、過去 0.25 毫米。
    // 0.25 毫米只是飄雨，不該被當成「已經在下雨」而略過。
    // The reported case: 3.4 mm coming, 0.25 mm in the past hour. A trace amount must not be
    // treated as "already raining" and swallow the alert.
    assert.equal(ForecastNextHour.Decide(3.4, 0.25), "INTENSIFYING");
});

test("完全沒雨時判定為即將降雨", () => {
    assert.equal(ForecastNextHour.Decide(3.4, 0), "STARTING");
    assert.equal(ForecastNextHour.Decide(3.4, undefined), "STARTING");
    assert.equal(ForecastNextHour.Decide(3.4, 0.05), "STARTING");
});

test("雨勢持平或變小時不通知", () => {
    assert.equal(ForecastNextHour.Decide(5, 4.5), "NONE", "持續大雨");
    assert.equal(ForecastNextHour.Decide(5, 5), "NONE");
    assert.equal(ForecastNextHour.Decide(0.3, 4), "NONE", "雨快停了");
});

test("未來雨量低於門檻時不通知", () => {
    assert.equal(ForecastNextHour.Decide(0.1, 0), "NONE");
    assert.equal(ForecastNextHour.Decide(0.49, 0), "NONE");
    assert.equal(ForecastNextHour.Decide(undefined, 0), "NONE");
    assert.equal(ForecastNextHour.Decide(0.5, 0), "STARTING", "剛好達到門檻要通知");
});

test("雨勢明顯變大時判定為增強", () => {
    assert.equal(ForecastNextHour.Decide(5, 1.2), "INTENSIFYING");
    assert.equal(ForecastNextHour.Decide(2, 1), "INTENSIFYING", "剛好兩倍要通知");
    assert.equal(ForecastNextHour.Decide(1.9, 1), "NONE", "未達兩倍不通知");
});

test("通知文案依原因給出不同標題", () => {
    const starting = ForecastNextHour.Message("STARTING", 3.4, 0);
    assert.equal(starting.title, "1 小時內會下雨");
    assert.match(starting.body, /3\.4 毫米/);

    const intensifying = ForecastNextHour.Message("INTENSIFYING", 3.4, 0.3);
    assert.equal(intensifying.title, "雨勢會變大");
    assert.match(intensifying.body, /3\.4 毫米/);
    assert.match(intensifying.body, /0\.3 毫米/);
});
