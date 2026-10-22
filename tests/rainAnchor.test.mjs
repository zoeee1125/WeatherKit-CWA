import assert from "node:assert/strict";
import test from "node:test";

/** 記憶體版的持久化後端，讓 Storage 在 Node.js 下可用。 / In-memory persistent backend so Storage works under Node.js. */
const store = new Map();
globalThis.$environment = { "surge-version": "test" };
globalThis.$persistentStore = {
    read: key => (store.has(key) ? store.get(key) : null),
    write: (value, key) => {
        store.set(key, value);
        return true;
    },
};
globalThis.$argument = { LogLevel: "OFF", Storage: "database" };

const [{ default: RainAnchor }, { Storage }] = await Promise.all([import("../src/function/rainAnchor.mjs"), import("@nsnanocat/util")]);

/** 對齊到分鐘的固定起點（Unix 秒）。 / Fixed minute-aligned start in Unix seconds. */
const Start = 1_700_000_040;
const Lead = 600;
const Taipei = { latitude: 25.033, longitude: 121.5654 };
const Hsinchu = { latitude: 24.793, longitude: 120.926 };

/**
 * 清空紀錄並回傳目前時間（毫秒）。
 * Clear the records and return a base timestamp in milliseconds.
 * @returns {number}
 */
function reset() {
    store.clear();
    return Start * 1000 + 30_000;
}

/**
 * 以指定時間詢問起雨時間。
 * Resolve the onset at a given moment.
 * @param {number} now 毫秒 / Milliseconds.
 * @param {object} [options] 覆寫選項 / Overrides.
 * @returns {number | undefined}
 */
function onsetAt(now, options = {}) {
    const timestamp = Math.trunc(now / 1000);
    return RainAnchor.Onset({
        ...Taipei,
        forecastStart: timestamp - (timestamp % 60),
        lead: Lead,
        rain: true,
        ongoing: false,
        now,
        ...options,
    });
}

test("第一次偵測到雨時建立起雨時間", () => {
    const now = reset();
    const timestamp = Math.trunc(now / 1000);
    const forecastStart = timestamp - (timestamp % 60);

    assert.equal(onsetAt(now), forecastStart + Lead);
});

test("同一場雨每次刷新都沿用同一個起雨時間", () => {
    const now = reset();
    const first = onsetAt(now);

    // 五分鐘後再問一次，預報起點已經往後移，但起雨時間不該跟著滑。
    // Five minutes later the forecast start has moved on, but the onset must not.
    const later = onsetAt(now + 5 * 60 * 1000);
    const laterAgain = onsetAt(now + 9 * 60 * 1000);

    assert.equal(later, first);
    assert.equal(laterAgain, first);
});

test("不同地點各自記錄起雨時間", () => {
    const now = reset();
    const taipei = onsetAt(now);
    const hsinchu = onsetAt(now + 5 * 60 * 1000, Hsinchu);

    assert.notEqual(hsinchu, taipei);
    // 兩個地點都不該被對方的請求覆蓋。
    // Neither location may be overwritten by the other's request.
    assert.equal(onsetAt(now + 6 * 60 * 1000), taipei);
    assert.equal(onsetAt(now + 6 * 60 * 1000, Hsinchu), hsinchu);
});

test("雨停不久後又下雨時仍沿用原本的起雨時間", () => {
    const now = reset();
    const first = onsetAt(now);

    // 10 分鐘時 QPESUMS 回了一個低於門檻的值：緩衝期內不該重置。
    // A below-threshold reading ten minutes later must not reset the onset inside the grace period.
    assert.equal(onsetAt(now + 10 * 60 * 1000, { rain: false }), undefined);
    assert.equal(onsetAt(now + 15 * 60 * 1000), first);
});

test("雨停超過緩衝期後重新計算起雨時間", () => {
    const now = reset();
    const first = onsetAt(now);

    // 25 分鐘都沒有雨的訊號（超過 20 分鐘緩衝），這場雨視為結束。
    // Twenty-five minutes without a rain signal ends the event.
    assert.equal(onsetAt(now + 25 * 60 * 1000, { rain: false }), undefined);

    const next = onsetAt(now + 26 * 60 * 1000);
    assert.notEqual(next, first);
    assert.equal(next, Math.trunc((now + 26 * 60 * 1000) / 1000) - (Math.trunc((now + 26 * 60 * 1000) / 1000) % 60) + Lead);
});

test("正在下雨時時間軸從預報起點就開始下雨", () => {
    const now = reset();
    const timestamp = Math.trunc(now / 1000);
    const forecastStart = timestamp - (timestamp % 60);

    assert.equal(onsetAt(now, { ongoing: true }), forecastStart);
    // 已經在下雨不會建立「起雨」紀錄，下一場雨才會重新計算。
    // An ongoing event creates no onset record, so the next rain starts fresh.
    assert.equal(Storage.getItem(RainAnchor.StorageKey, {})[RainAnchor.Key(Taipei.latitude, Taipei.longitude)], undefined);
});

test("沿用時間超過保留期限後重新計算", () => {
    const now = reset();
    const first = onsetAt(now);
    const later = onsetAt(now + (RainAnchor.Retention + 60) * 1000);

    assert.notEqual(later, first);
});

test("只保留最近的幾個地點", () => {
    const now = reset();
    for (let index = 0; index < RainAnchor.Limit + 3; index++) {
        onsetAt(now + index * 1000, { latitude: 25 + index * 0.1, longitude: 121 });
    }

    const table = Storage.getItem(RainAnchor.StorageKey, {});
    assert.equal(Object.keys(table).length, RainAnchor.Limit);
});
