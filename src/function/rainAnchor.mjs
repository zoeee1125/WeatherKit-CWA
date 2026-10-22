import { Console, Storage } from "@nsnanocat/util";

/**
 * 起雨時間的記憶。
 * Onset memory.
 *
 * QPESUMS 只提供「未來一小時累積雨量」，起雨時間只能用近似值。若每次刷新都重新取
 * 「現在 + 十分鐘」，通知時間會隨著每次請求往後滑，系統永遠等不到那一刻。
 * 這裡把同一場雨第一次算出的起雨時間記下來重複使用，直到雨停（或連續一段時間沒有雨的
 * 訊號）才重新計算。
 * QPESUMS only publishes the accumulated rainfall for the next hour, so the onset is an
 * approximation. Recomputing "now + ten minutes" on every refresh would push the notification
 * further away each time, so the first onset of a rain event is remembered and reused until the
 * rain ends (or the rain signal has been absent for a while).
 *
 * 座標以兩位小數分組（約 1 公里），天氣 App 關注列表裡的每個城市各有自己的紀錄。
 * Coordinates are grouped to two decimals (roughly one kilometre), so every city in the Weather
 * app's list keeps its own record.
 */
export default class RainAnchor {
    /** 儲存鍵 / Storage key. */
    static StorageKey = "@iRingo.WeatherKit.RainOnset";

    /**
     * 同一場雨最多沿用多久（秒）。
     * How long one rain event keeps its onset, in seconds.
     *
     * 與通知冷卻時間一致：冷卻過後就是新的一場雨，可以重新計算。
     * Matches the notification cooldown: once it lapses the rain counts as a new event.
     */
    static Retention = 90 * 60;

    /**
     * 連續多久沒有雨的訊號才視為事件結束（秒）。
     * How long without a rain signal before the event counts as over, in seconds.
     *
     * QPESUMS 每 10 分鐘更新一次，偶爾會回一個低於門檻的格點值；用 20 分鐘（約兩個報次）
     * 當緩衝，避免一次雜訊就把起雨時間重置回「現在 + 十分鐘」。
     * QPESUMS refreshes every ten minutes and occasionally reports a grid value below the
     * threshold, so twenty minutes (about two issues) keeps a single noisy reading from resetting
     * the onset back to "now + ten minutes".
     */
    static Grace = 20 * 60;

    /** 紀錄的更新間隔（秒）/ How often the record is refreshed, in seconds. */
    static Interval = 60;

    /** 最多記住幾個地點 / How many locations to remember. */
    static Limit = 6;

    /** 座標精度（小數位）/ Coordinate precision in decimals. */
    static Precision = 2;

    /**
     * 地點的紀錄鍵。
     * Record key for a location.
     * @param {number} latitude 緯度 / Latitude.
     * @param {number} longitude 經度 / Longitude.
     * @returns {string}
     */
    static Key(latitude, longitude) {
        return `${Number(latitude).toFixed(RainAnchor.Precision)},${Number(longitude).toFixed(RainAnchor.Precision)}`;
    }

    /**
     * 取得這場雨的起雨時間。
     * Resolve the onset of the current rain event.
     *
     * 回傳值同時代表「有沒有雨」：沒有雨時是 `undefined`；已經在下雨時是預報起點本身。
     * The return value doubles as "is there rain": `undefined` means none, while an ongoing event
     * returns the forecast start itself.
     *
     * @param {{
     *     latitude: number,
     *     longitude: number,
     *     forecastStart: number,
     *     lead: number,
     *     rain: boolean,
     *     ongoing: boolean,
     *     now?: number,
     * }} options 選項 / Options.
     * @returns {number | undefined} Unix 秒 / Unix seconds.
     */
    static Onset({ latitude, longitude, forecastStart, lead, rain, ongoing, now = Date.now() }) {
        const key = RainAnchor.Key(latitude, longitude);
        const timestamp = Math.trunc(now / 1000);
        const table = RainAnchor.#Load();
        const record = table?.[key];
        // 正在下雨：時間軸從預報起點就開始下雨，不再製造起雨轉折。
        // Already raining: the timeline is wet from the start, with no onset transition.
        if (ongoing) {
            RainAnchor.#Expire(table, key, timestamp, "already raining");
            return forecastStart;
        }
        // 未來一小時沒雨：先留著紀錄，等緩衝時間過去才真正結束這場雨。
        // No rain in the coming hour: keep the record until the grace period lapses.
        if (!rain) {
            RainAnchor.#Expire(table, key, timestamp, "no rain");
            return undefined;
        }
        const fresh = Boolean(record) && timestamp - record.createdAt <= RainAnchor.Retention;
        if (fresh) {
            if (timestamp - record.lastSeen >= RainAnchor.Interval) {
                record.lastSeen = timestamp;
                RainAnchor.#Save(table);
            }
            Console.debug("RainAnchor", `沿用 ${key}`, `onset: ${record.onset}`);
            return record.onset;
        }
        const onset = forecastStart + lead;
        table[key] = { onset, createdAt: timestamp, lastSeen: timestamp };
        RainAnchor.#Prune(table);
        RainAnchor.#Save(table);
        Console.info("RainAnchor", `建立 ${key}`, `onset: ${onset}`, `lead: ${lead}s`);
        return onset;
    }

    /**
     * 結束一場雨。
     * End a rain event.
     *
     * 只有在緩衝時間過後才真的刪掉紀錄；緩衝期內保留原本的起雨時間。
     * The record is only dropped once the grace period lapses; until then the original onset stays.
     *
     * @param {Record<string, {onset: number, createdAt: number, lastSeen: number}>} table 紀錄表 / Record table.
     * @param {string} key 地點鍵 / Location key.
     * @param {number} timestamp 目前時間（Unix 秒）/ Current time in Unix seconds.
     * @param {string} reason 結束原因 / Why the event ended.
     * @returns {void}
     */
    static #Expire(table, key, timestamp, reason) {
        const record = table?.[key];
        if (!record) return;
        if (timestamp - record.lastSeen <= RainAnchor.Grace) {
            Console.debug("RainAnchor", `保留 ${key}`, reason);
            return;
        }
        delete table[key];
        RainAnchor.#Save(table);
        Console.info("RainAnchor", `結束 ${key}`, reason);
    }

    /**
     * 只保留最近的幾個地點。
     * Keep only the most recent locations.
     * @param {Record<string, {lastSeen: number}>} table 紀錄表 / Record table.
     * @returns {void}
     */
    static #Prune(table) {
        const keys = Object.keys(table);
        if (keys.length <= RainAnchor.Limit) return;
        keys.sort((a, b) => (table[a]?.lastSeen ?? 0) - (table[b]?.lastSeen ?? 0))
            .slice(0, keys.length - RainAnchor.Limit)
            .forEach(key => {
                delete table[key];
            });
    }

    /**
     * 讀取紀錄表。
     * Read the record table.
     * @returns {Record<string, {onset: number, createdAt: number, lastSeen: number}>}
     */
    static #Load() {
        const table = Storage.getItem(RainAnchor.StorageKey, {});
        return table && typeof table === "object" && !Array.isArray(table) ? table : {};
    }

    /**
     * 寫回紀錄表。
     * Write the record table back.
     * @param {Record<string, unknown>} table 紀錄表 / Record table.
     * @returns {void}
     */
    static #Save(table) {
        Storage.setItem(RainAnchor.StorageKey, table);
    }
}
